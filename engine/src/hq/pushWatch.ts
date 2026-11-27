// HQ phone notifications: the watch loop (Alex 2026-11-27). Once a minute, and only while at least
// one device has notifications on, it looks for what is NEW since it last looked and hands each new
// thing to notify() (push.ts), then sends what waits (flushPush). Detectors reuse what HQ already reads:
//   every minute (Postgres, cheap): asks waiting on a person, agent tasks waiting on Alex, urgent
//     agent reports (campaign paused for bounces, launch refused), failed / needs-review engine runs
//     (once per kind per day), meetings Echo booked (calendar.book)
//   every 2 minutes (Airtable): new Decisions cards
//   every 10 minutes (Airtable): active campaigns over 4% bounce; meetings booked (Emails: WON / Meeting Booked At)
//   every 15 minutes (Airtable): inboxes in spam, warm-up off (the Deliverability model); clients signed or paid (Sales)
// A detector's first run only records what is there (nothing that already existed is pushed). Every
// detector is bounded (one read, capped rows) and a failing one is logged and skipped; it never
// stops the others or the engine. Nothing here writes Airtable, Slack or EmailBison.
import type { Db } from '../db/pool.js';
import type { Config } from '../config.js';
import { createAirtableClient } from '../providers/airtable.js';
import { OWNER_ONLY, agentForJob, type Pile } from './agents.js';
import { pendingDecisions, type DecisionCard, type HqAirtable } from './decisions.js';
import { cleanActionUrl } from './asks.js';
import { firstSentence } from './needs.js';
import { nyDate, addDays } from './tasks.js';
import { CAMPAIGNS_T, KF } from './campaigns.js';
import { EMAILS, EF, BK } from '../agents/emailsFields.js';
import { flushPush, notifySafe, pushKeys, pushText, webPushSender, PUSH_LIMITS, type PushEvent, type PushSender } from './push.js';

/** Decisions a member (Josh) is pushed: the reply cards (the inbox is his job). Owners get every pile. */
export const MEMBER_PILES: readonly Pile[] = ['Replies'];
export const WATCH_EVERY = { fast: 60_000, decisions: 2 * 60_000, campaigns: 10 * 60_000, emails: 10 * 60_000, inboxes: 15 * 60_000, sales: 15 * 60_000, prune: 60 * 60_000 } as const;
/** At most this many new items per detector per run (the rest wait for the next run). */
export const WATCH_MAX = 50;

export interface InboxHealth { status: string; warmupOff: boolean; email: string }
export interface DealFacts { id: string; name: string; company: string; stages: { signed: boolean; paid: boolean }; signedDay: string; paidDay: string; paidVia?: string }
export interface WatchDeps {
  at?: HqAirtable;
  sender?: PushSender;
  /** Inbox health (default: the Deliverability model, deliverability.inboxIndex). */
  inboxes?: () => Promise<Map<string, InboxHealth> | undefined>;
  /** Dulcy's own deals (default: sales.allDeals). */
  deals?: () => Promise<DealFacts[]>;
}

// ---------- seen / due (Postgres) ----------
/** Run this detector now? Once per `everyMs` (kept in Postgres, so a restart does not run it twice). */
export async function watchDue(db: Db, name: string, everyMs: number, now = new Date()): Promise<boolean> {
  await db.query(`INSERT INTO hq_push_watch (name) VALUES ($1) ON CONFLICT (name) DO NOTHING`, [name]);
  const r = await db.query(`UPDATE hq_push_watch SET last_run_at=$2 WHERE name=$1 AND (last_run_at IS NULL OR last_run_at <= $3) RETURNING name`, [name, now, new Date(now.getTime() - everyMs + 5_000)]);
  return (r.rowCount ?? 0) > 0;
}

/**
 * Which of these keys are new for this detector. The first run of a detector records them all and
 * returns none (what existed before notifications were on is never pushed). A key seen again stays
 * "seen" (its time moves), so something still there after 30 days is not pushed again.
 */
export async function firstSeen(db: Db, watch: string, ns: string, keys: string[], now = new Date()): Promise<string[]> {
  const uniq = [...new Set(keys.filter(Boolean))].slice(0, 2000);
  await db.query(`INSERT INTO hq_push_watch (name) VALUES ($1) ON CONFLICT (name) DO NOTHING`, [watch]);
  const w = (await db.query(`SELECT baseline_at FROM hq_push_watch WHERE name=$1`, [watch])).rows[0];
  const r = uniq.length ? await db.query(
    `INSERT INTO hq_push_seen (key, seen_at) SELECT x, $2 FROM unnest($1::text[]) AS x ON CONFLICT (key) DO UPDATE SET seen_at=EXCLUDED.seen_at RETURNING key, (xmax = 0) AS inserted`,
    [uniq.map((k) => `${ns}:${k}`), now]) : { rows: [] as any[] };
  if (!w?.baseline_at) { await db.query(`UPDATE hq_push_watch SET baseline_at=$2 WHERE name=$1`, [watch, now]); return []; }
  const fresh = new Set(r.rows.filter((x: any) => x.inserted).map((x: any) => String(x.key).slice(ns.length + 1)));
  return uniq.filter((k) => fresh.has(k));
}

// ---------- events (pure) ----------
/** A new Decisions card → its push. Members get the Replies pile only; Money and Content are owner-only. */
export function decisionEvent(c: Pick<DecisionCard, 'id' | 'title' | 'agent' | 'client' | 'pile' | 'issue'>): PushEvent {
  const team = MEMBER_PILES.includes(c.pile) && !OWNER_ONLY.includes(c.agent);
  return {
    type: 'decision', audience: team ? 'team' : 'owner', agent: c.agent || 'Ada', money: c.pile === 'Money' || c.pile === 'Content',
    title: `${c.agent || 'Ada'}: ${c.title || 'New decision'}`, body: [c.client, firstSentence(c.issue, 140)].filter(Boolean).join(' · '),
    url: `decisions/${c.id}`, dedupeKey: `decision:${c.id}`,
  };
}
/** An HQ route from a stored link (relative HQ routes only), else the fallback. Pure. */
export function hqRoute(link: unknown, fallback: string): string {
  const c = cleanActionUrl(String(link ?? ''));
  return c && !/^https:/i.test(c) ? c : fallback;
}
export interface AskFacts { id: number; agent: string; title: string; why: string; action_url: string; audience: string; money: boolean; priority: string }
/** An ask waiting on a person → its push. "everyone" asks reach members too (never Ledger's, Sienna's or money). Pure. */
export function askEvent(a: AskFacts): PushEvent {
  const team = a.audience === 'everyone' && !OWNER_ONLY.includes(a.agent) && !a.money;
  return {
    type: 'agent', audience: team ? 'team' : 'owner', agent: a.agent, money: a.money || a.agent === 'Ledger',
    title: `${a.agent} needs you: ${a.title}`, body: a.why, url: hqRoute(a.action_url, 'needs'), dedupeKey: `ask:${a.id}`,
  };
}

// ---------- detectors ----------
type Detector = (db: Db, now: Date) => Promise<number>;

async function decisionsWatch(db: Db, at: HqAirtable, now: Date): Promise<number> {
  const cards = await pendingDecisions(at);
  const fresh = new Set((await firstSeen(db, 'decisions', 'decision', cards.map((c) => c.id), now)).slice(0, WATCH_MAX));
  let n = 0;
  for (const c of cards) if (fresh.has(c.id)) n += await notifySafe(db, decisionEvent(c), now);
  return n;
}

const asksWatch: Detector = async (db, now) => {
  const today = nyDate(now);
  const rows = (await db.query(
    `SELECT id, agent, title, why, action_url, audience, money, priority FROM hq_asks
     WHERE done_at IS NULL AND (snoozed_until IS NULL OR snoozed_until <= $1) AND (due_date IS NULL OR due_date <= $2::date) AND created_at > $3
     ORDER BY id DESC LIMIT 200`, [now, today, new Date(now.getTime() - 14 * 86_400_000)])).rows as AskFacts[];
  const fresh = new Set((await firstSeen(db, 'asks', 'ask', rows.map((r) => String(r.id)), now)).slice(0, WATCH_MAX));
  let n = 0;
  for (const a of rows) if (fresh.has(String(a.id))) n += await notifySafe(db, askEvent({ ...a, id: Number(a.id), money: a.money === true }), now);
  return n;
};

/** Agent tasks waiting on Alex that no Decision covers (the Decision has its own push). Owner only. */
const tasksWatch: Detector = async (db, now) => {
  const rows = (await db.query(
    `SELECT id, agent, title, progress_note, link FROM hq_agent_tasks
     WHERE status='waiting_alex' AND decision_rec IS NULL AND COALESCE(link,'') NOT LIKE 'decisions%' ORDER BY id DESC LIMIT 200`)).rows;
  const fresh = new Set((await firstSeen(db, 'tasks', 'task', rows.map((r) => String(r.id)), now)).slice(0, WATCH_MAX));
  let n = 0;
  for (const t of rows) {
    if (!fresh.has(String(t.id))) continue;
    n += await notifySafe(db, {
      type: 'agent', audience: 'owner', agent: t.agent, money: t.agent === 'Ledger', title: `${t.agent} is waiting on you: ${t.title}`,
      body: t.progress_note, url: hqRoute(t.link, `agents/${t.agent}`), dedupeKey: `task:${t.id}`,
    }, now);
  }
  return n;
};

/** Urgent agent reports (live only): a campaign paused for bounces, a refused launch, Ledger's urgent money. Owner only. */
const reportsWatch: Detector = async (db, now) => {
  const rows = (await db.query(`SELECT id, agent, title, summary FROM hq_reports WHERE urgent AND NOT dry_run AND created_at > $1 ORDER BY id DESC LIMIT 50`, [new Date(now.getTime() - 86_400_000)])).rows;
  const fresh = new Set(await firstSeen(db, 'reports', 'report', rows.map((r) => String(r.id)), now));
  let n = 0;
  for (const r of rows) {
    if (!fresh.has(String(r.id))) continue;
    n += await notifySafe(db, { type: 'urgent', audience: 'owner', agent: r.agent, money: r.agent === 'Ledger', title: `${r.agent}: ${r.title}`, body: r.summary, url: `report/${r.id}`, dedupeKey: `report:${r.id}` }, now);
  }
  return n;
};

/** Engine runs that failed or need review (last 2 h): one push per kind per day (the day of the latest failure). Owner only. */
const jobsWatch: Detector = async (db, now) => {
  const rows = (await db.query(
    `SELECT kind, count(*)::int AS n, max(updated_at) AS at, (array_agg(left(COALESCE(error, ''), 300) ORDER BY id DESC))[1] AS error, bool_or(status='needs_review') AS review
     FROM jobs WHERE status IN ('failed','needs_review') AND NOT dry_run AND updated_at > $1 GROUP BY kind ORDER BY kind LIMIT 50`, [new Date(now.getTime() - 2 * 3_600_000)])).rows
    .map((r) => ({ ...r, key: `${r.kind}:${nyDate(new Date(r.at))}` }));
  const fresh = new Set(await firstSeen(db, 'jobs', 'job', rows.map((r) => r.key), now));
  let n = 0;
  for (const r of rows) {
    if (!fresh.has(r.key)) continue;
    const agent = agentForJob(r.kind) ?? 'Riley';
    n += await notifySafe(db, {
      type: 'urgent', audience: 'owner', agent, money: agent === 'Ledger',
      title: `${agent}: ${r.kind} ${r.review ? 'needs review' : 'failed'}${r.n > 1 ? ` (${r.n} runs)` : ''}`, body: firstSentence(r.error, 200) || 'A run did not finish.',
      url: `agents/${agent}`, dedupeKey: `job:${r.key}`,
    }, now);
  }
  return n;
};

/** Meetings Echo booked on a client's calendar (calendar.book succeeded, live). Members too (no money in it). */
const bookedJobsWatch: Detector = async (db, now) => {
  const rows = (await db.query(
    `SELECT id, record_id, result FROM jobs WHERE kind='calendar.book' AND status='succeeded' AND NOT dry_run AND updated_at > $1 ORDER BY id DESC LIMIT 50`, [new Date(now.getTime() - 86_400_000)])).rows
    .filter((r) => r.result?.booked === true && /^rec[A-Za-z0-9]{14}$/.test(String(r.record_id)));
  const fresh = new Set(await firstSeen(db, 'booked-jobs', 'booked', rows.map((r) => String(r.record_id)), now));
  let n = 0;
  for (const r of rows) {
    if (!fresh.has(String(r.record_id))) continue;
    n += await notifySafe(db, { type: 'good', audience: 'team', agent: 'Echo', title: 'Meeting booked', body: pushText(r.result?.message, 200), url: `thread/${r.record_id}`, dedupeKey: `booked:${r.record_id}` }, now);
  }
  return n;
};

/** Active campaigns over 4% bounce (the rule: over 4% = paused and investigated). Owner only. */
async function campaignsWatch(db: Db, at: HqAirtable, now: Date): Promise<number> {
  const rows = (await at.list(CAMPAIGNS_T, `{Campaign Status}='Active'`, [KF.name, KF.status, KF.bouncedPct, KF.sent], 1000))
    .map((r) => ({ id: r.id, name: pushText(r.fields[KF.name], 80) || 'Campaign', status: pushText(r.fields[KF.status], 40), bounce: Number(r.fields[KF.bouncedPct]) || 0 }))
    .filter((c) => c.status === 'Active' && c.bounce > 4);
  const fresh = new Set((await firstSeen(db, 'campaigns', 'bounce', rows.map((c) => c.id), now)).slice(0, WATCH_MAX));
  const list = rows.filter((c) => fresh.has(c.id));
  if (!list.length) return 0;
  const pct = (x: number) => `${Number.isInteger(x) ? x : x.toFixed(1)}%`;
  const one = list.length === 1 ? list[0] : null;
  return notifySafe(db, {
    type: 'urgent', audience: 'owner', agent: 'Atlas',
    title: one ? `Bounce ${pct(one.bounce)}: ${one.name}` : `${list.length} campaigns over 4% bounce`,
    body: one ? 'Over 4% = pause and investigate. Atlas and the bounce check are on it.' : list.slice(0, 3).map((c) => `${c.name} ${pct(c.bounce)}`).join(' · '),
    url: one ? `campaigns/${one.id}` : 'campaigns', dedupeKey: `bounce:${list.map((c) => c.id).sort().join(',')}`.slice(0, 200),
  }, now);
}

/** Meetings booked by any route (GHL, a person, Echo): Emails rows marked WON or with Meeting Booked At (last 2 days). */
async function bookedEmailsWatch(db: Db, at: HqAirtable, now: Date): Promise<number> {
  const since = now.getTime() - 2 * 86_400_000;
  const rows = (await at.list(EMAILS, `OR(IS_AFTER({Meeting Booked At},DATEADD(NOW(),-2,'days')),AND({Opportunity Status}='WON',IS_AFTER(LAST_MODIFIED_TIME({Opportunity Status}),DATEADD(NOW(),-2,'days'))))`,
    [BK.meetingBookedAt, BK.opportunity, EF.leadName, EF.company], 200))
    .filter((r) => { const t = Date.parse(pushText(r.fields[BK.meetingBookedAt], 40)); return (Number.isFinite(t) && t >= since) || pushText(r.fields[BK.opportunity], 20) === 'WON'; });
  const fresh = new Set((await firstSeen(db, 'booked-emails', 'booked', rows.map((r) => r.id), now)).slice(0, WATCH_MAX));
  let n = 0;
  for (const r of rows) {
    if (!fresh.has(r.id)) continue;
    const who = pushText(r.fields[EF.leadName], 60), co = pushText(r.fields[EF.company], 60);
    n += await notifySafe(db, { type: 'good', audience: 'team', agent: 'Echo', title: `Meeting booked${who ? `: ${who}` : ''}`, body: co, url: `thread/${r.id}`, dedupeKey: `booked:${r.id}` }, now);
  }
  return n;
}

/** Inboxes that went to spam, and inboxes with warm-up off: one push each kind per run. Owner only. */
async function inboxesWatch(db: Db, read: () => Promise<Map<string, InboxHealth> | undefined>, now: Date): Promise<number> {
  const idx = await read();
  if (!idx) return 0;
  const all = [...idx.entries()];
  const spam = all.filter(([, x]) => x.status === 'spam');
  const off = all.filter(([, x]) => x.warmupOff);
  let n = 0;
  for (const [kind, list, word] of [['spam', spam, 'in spam'], ['warmup', off, 'with warm-up off']] as const) {
    const fresh = new Set((await firstSeen(db, `inboxes-${kind}`, kind, list.map(([id]) => id), now)).slice(0, WATCH_MAX));
    const got = list.filter(([id]) => fresh.has(id));
    if (!got.length) continue;
    const emails = got.map(([, x]) => x.email).filter(Boolean);
    n += await notifySafe(db, {
      type: 'urgent', audience: 'owner', agent: 'Atlas', title: got.length === 1 ? `Inbox ${word}: ${emails[0] || 'one inbox'}` : `${got.length} inboxes ${word}`,
      body: got.length === 1 ? (kind === 'spam' ? 'It lands in spam: Atlas rests or replaces it.' : 'Turn warm-up back on.') : `${emails.slice(0, 3).join(' · ')}${got.length > 3 ? ` +${got.length - 3} more` : ''}`,
      url: 'deliverability', dedupeKey: `${kind}:${got.map(([id]) => id).sort().join(',')}`.slice(0, 200),
    }, now);
  }
  return n;
}

/** Clients that signed or paid (the Sales view's own facts; last 3 days). Owner only (money). */
async function salesWatch(db: Db, read: () => Promise<DealFacts[]>, now: Date): Promise<number> {
  const since = addDays(nyDate(now), -3);
  const deals = await read();
  let n = 0;
  for (const [kind, pick] of [['signed', (d: DealFacts) => d.stages.signed && !!d.signedDay && d.signedDay >= since], ['paid', (d: DealFacts) => d.stages.paid && !!d.paidDay && d.paidDay >= since]] as const) {
    const list = deals.filter(pick);
    const fresh = new Set((await firstSeen(db, `sales-${kind}`, kind, list.map((d) => d.id), now)).slice(0, WATCH_MAX));
    for (const d of list) {
      if (!fresh.has(d.id)) continue;
      const who = d.company || d.name || 'A client';
      n += await notifySafe(db, {
        type: 'good', audience: 'owner', money: true, agent: 'Cole', title: kind === 'signed' ? `Client signed: ${who}` : `Client paid: ${who}`,
        body: kind === 'signed' ? `${d.name && d.company ? `${d.name} signed` : 'Signed'} ${d.signedDay}.` : `First payment seen ${d.paidDay}${d.paidVia ? ` (${d.paidVia})` : ''}.`,
        url: `sales/${d.id}`, dedupeKey: `${kind}:${d.id}`,
      }, now);
    }
  }
  return n;
}

// ---------- the tick ----------
export interface TickResult { ran: string[]; queued: number; pushes: number; skipped?: string }

/** One minute of the watch loop. Does nothing (reads nothing) while no device has notifications on. */
export async function pushTick(db: Db, cfg: Config, deps: WatchDeps = {}, now = new Date()): Promise<TickResult> {
  const out: TickResult = { ran: [], queued: 0, pushes: 0 };
  const devices = Number((await db.query(`SELECT count(*)::int AS n FROM hq_push_subscriptions`)).rows[0].n);
  if (!devices) { out.skipped = 'no device has notifications on'; return out; }
  const run = async (name: string, everyMs: number, fn: () => Promise<number>) => {
    if (!(await watchDue(db, name, everyMs, now))) return;
    try { out.queued += await fn(); out.ran.push(name); } catch (e) {
      console.error(JSON.stringify({ level: 'warn', message: 'push watch failed', watch: name, err: String((e as Error).message ?? e).slice(0, 200) }));
    }
  };
  await run('fast', WATCH_EVERY.fast, async () => (await asksWatch(db, now)) + (await tasksWatch(db, now)) + (await reportsWatch(db, now)) + (await jobsWatch(db, now)) + (await bookedJobsWatch(db, now)));
  const at = deps.at;
  if (at) {
    await run('decisions', WATCH_EVERY.decisions, () => decisionsWatch(db, at, now));
    await run('campaigns', WATCH_EVERY.campaigns, () => campaignsWatch(db, at, now));
    await run('emails', WATCH_EVERY.emails, () => bookedEmailsWatch(db, at, now));
    const inboxes = deps.inboxes ?? (async () => (await import('./deliverability.js')).inboxIndex(at, db, cfg));
    await run('inboxes', WATCH_EVERY.inboxes, () => inboxesWatch(db, inboxes, now));
    const deals = deps.deals ?? (async () => (await (await import('./sales.js')).allDeals(at, db, false, now.getTime())).deals);
    await run('sales', WATCH_EVERY.sales, () => salesWatch(db, deals, now));
  }
  await run('prune', WATCH_EVERY.prune, async () => {
    const old = new Date(now.getTime() - PUSH_LIMITS.keepDays * 86_400_000);
    await db.query(`DELETE FROM hq_push_seen WHERE seen_at < $1`, [old]);
    await db.query(`DELETE FROM hq_push_log WHERE created_at < $1`, [old]);
    await db.query(`DELETE FROM hq_push_presence WHERE seen_at < $1`, [new Date(now.getTime() - 86_400_000)]);
    return 0;
  });
  out.pushes = (await flushPush(db, cfg, deps.sender ?? webPushSender(), now)).pushes;
  return out;
}

/** Start the loop (every minute). Off without HQ (HQ_SESSION_SECRET) or with HQ_PUSH=off. Makes the VAPID key pair on start. */
export function startPushLoop(db: Db, cfg: Config, signal: AbortSignal, deps: WatchDeps = {}): void {
  if (!cfg.hqSessionSecret || !cfg.hqPushOn) return;
  const at = deps.at ?? (cfg.airtableApiKey ? createAirtableClient({ apiKey: cfg.airtableApiKey, baseId: cfg.airtableBaseId, baseUrl: cfg.airtableBaseUrl }) : undefined);
  const sender = deps.sender ?? webPushSender();
  void pushKeys(db, cfg).catch((e) => console.error(JSON.stringify({ level: 'warn', message: 'push keys not ready', err: String((e as Error).message ?? e).slice(0, 200) })));
  let busy = false;
  const tick = async () => {
    if (busy) return; // a slow tick is never doubled
    busy = true;
    try {
      const r = await pushTick(db, cfg, { ...deps, at, sender });
      if (r.queued || r.pushes) console.log(JSON.stringify({ level: 'info', message: 'push', ...r }));
    } catch (e) {
      console.error(JSON.stringify({ level: 'error', message: 'push tick failed', err: String((e as Error).message ?? e).slice(0, 200) }));
    } finally { busy = false; }
  };
  const t = setInterval(() => { void tick(); }, 60_000);
  signal.addEventListener('abort', () => clearInterval(t));
}

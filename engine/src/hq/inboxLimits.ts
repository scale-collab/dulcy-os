// HQ Batch 3 (Alex, 2026-11-27): edit an inbox's limits from HQ, and the new-client inbox ramp.
//
// 1. The edit: cold daily limit and/or warm-up limit, for one inbox, a few, or every inbox of one
//    client. Written to EmailBison by the engine job `inbox.limits` (the same two calls the n8n
//    "Email Accounts Bulk Controls" flow makes:
//      PATCH /api/sender-emails/daily-limits/bulk                       { sender_email_ids, daily_limit }
//      PATCH /api/warmup/sender-emails/update-daily-warmup-limits      { sender_email_ids, daily_limit }).
//    Safety: owner only (checked in server.ts); the request must say confirm: true; the job is a DRY
//    RUN unless `inbox.limits` is in LIVE_STAGES (then every call has a receipt first, so a retry
//    never writes twice); live runs log one Activity Log row and mirror the new numbers on the Email
//    Accounts records. Resting inboxes keep their 0 (the health loop restores them), inboxes waiting
//    for a replacement are left alone.
// 2. The ramp (RULES.md "New client inbox ramp"): 5 cold / 10 warm-up → after one week of sending
//    10 / 20 → after another week 15 / 30 (the cap). Atlas's daily check (`atlas.ramp`) proposes the
//    next step per client inbox group as an Atlas task waiting for Alex; Alex applies it in HQ with
//    the same write path. Nothing is applied by itself.
import { createHash } from 'node:crypto';
import type { Db } from '../db/pool.js';
import type { Config } from '../config.js';
import type { Stage } from '../stages/index.js';
import type { AirtableRecord } from '../providers/airtable.js';
import { createAirtableClient } from '../providers/airtable.js';
import { createBisonClient } from '../providers/emailbison.js';
import { PermanentError } from '../errors.js';
import { enqueue } from '../queue.js';
import { STAGES } from '../stages/index.js';
import { logActivity } from '../activity.js';
import { ACCOUNTS, EA } from '../stages/accountHealth.js';
import { EX, RENEWAL_TASK_KEY, buildDeliverability, cachedDeliv, readDelivSource, renewalGap, type DelivModel, type InboxRow } from './deliverability.js';
import { CAMPAIGNS_T, KF, WORKSPACES_T, clientIndex } from './campaigns.js';
import { dueIn, trackClose, trackTask } from './agentTasks.js';
import type { HqAirtable } from './decisions.js';

export const LIMITS_STAGE = 'inbox.limits';
export const RAMP_STAGE = 'atlas.ramp';
/** RULES.md 2026-11-27: the new-client ramp, one step per week of sending; the last step is the cap. */
export const RAMP = [{ cold: 5, warmup: 10 }, { cold: 10, warmup: 20 }, { cold: 15, warmup: 30 }] as const;
/** A client is "new" for the ramp until this many days after its first send (3 steps + slack). */
export const RAMP_WINDOW_DAYS = 42;
/** Allowed values in the edit (a typo guard, not a rule): 0 rests an inbox. */
export const LIMIT_BOUNDS = { cold: { min: 0, max: 50 }, warmup: { min: 0, max: 50 } } as const;
/** Round 2 (bulk edits): one job can change many inboxes; EmailBison gets at most BULK_CHUNK ids per call. */
export const MAX_INBOXES_PER_EDIT = 3000;
export const BULK_CHUNK = 100;
const DAY = 86_400_000;
const REC = /^rec[A-Za-z0-9]{14}$/;

/** Round 2: "all shown" = the same filter as All inboxes (client, status, search), resolved on the server. */
export interface LimitFilter { client: string; status: string; q: string }
export interface LimitRequest { accounts: string[]; client: string; cold: number | null; warmup: number | null; reason: string; filter?: LimitFilter | null }
/** Read and check the request body. Pure. confirm must be exactly true (a preview needs none: it changes nothing). */
export function parseLimitRequest(b: any, preview = false): { ok: true; req: LimitRequest } | { ok: false; error: string } {
  if (!b || typeof b !== 'object') return { ok: false, error: 'a JSON body, please' };
  if (!preview && b.confirm !== true) return { ok: false, error: 'confirm: true is required: this changes the inboxes in EmailBison' };
  const num = (v: unknown, k: 'cold' | 'warmup'): number | null | string => {
    if (v === undefined || v === null || v === '') return null;
    const x = Number(v);
    const { min, max } = LIMIT_BOUNDS[k];
    if (!Number.isInteger(x) || x < min || x > max) return `${k === 'cold' ? 'cold daily limit' : 'warm-up limit'} must be a whole number from ${min} to ${max}`;
    return x;
  };
  const cold = num(b.cold, 'cold'), warmup = num(b.warmup, 'warmup');
  if (typeof cold === 'string') return { ok: false, error: cold };
  if (typeof warmup === 'string') return { ok: false, error: warmup };
  if (cold === null && warmup === null) return { ok: false, error: 'set a cold daily limit, a warm-up limit, or both' };
  const accounts = Array.isArray(b.accounts) ? [...new Set(b.accounts.map(String))] as string[] : [];
  if (accounts.some((a) => !REC.test(a))) return { ok: false, error: 'accounts must be Email Accounts record ids' };
  if (accounts.length > MAX_INBOXES_PER_EDIT) return { ok: false, error: `at most ${MAX_INBOXES_PER_EDIT} inboxes at once` };
  const client = String(b.client ?? '').toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 80);
  const fb = b.filter && typeof b.filter === 'object' && !accounts.length ? b.filter : null;
  const filter: LimitFilter | null = fb ? {
    client: String(fb.client ?? '').toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 80),
    status: ['healthy', 'risk', 'spam', 'resting'].includes(String(fb.status)) ? String(fb.status) : '',
    q: String(fb.q ?? '').trim().toLowerCase().slice(0, 100),
  } : null;
  if (!accounts.length && !client && !filter) return { ok: false, error: 'pick the inboxes (accounts), a client (all its inboxes) or the inboxes shown (filter)' };
  return { ok: true, req: { accounts, client, cold, warmup, reason: String(b.reason ?? '').replace(/\s+/g, ' ').trim().slice(0, 200), filter } };
}

export interface LimitChange {
  rec: string; email: string; clientKey: string; client: string; senderId: number; teamId: number;
  cold?: { from: number | null; to: number }; warmup?: { from: number | null; to: number };
}
export interface LimitPlan { changes: LimitChange[]; skipped: { email: string; why: string }[]; clientKey: string; client: string }

/** Which inboxes change, from what to what, and which are left alone (and why). Pure. */
export function planLimitChange(inboxes: (Pick<InboxRow, 'id' | 'email' | 'clientKey' | 'client' | 'emailId' | 'teamId' | 'dailyLimit' | 'warmupLimit' | 'stage'> & Partial<Pick<InboxRow, 'status' | 'domain'>>)[], req: LimitRequest): LimitPlan {
  const pool = inboxes.filter((i) => i.clientKey && i.clientKey !== 'none');
  const byId = new Map(pool.map((i) => [i.id, i]));
  const f = req.filter;
  const matches = (i: (typeof pool)[number]) => !!f && (!f.client || i.clientKey === f.client) && (!f.status || i.status === f.status)
    && (!f.q || i.email.includes(f.q) || String(i.domain ?? '').includes(f.q) || i.client.toLowerCase().includes(f.q));
  const picked = req.accounts.length ? req.accounts.map((id) => byId.get(id)).filter((i): i is (typeof pool)[number] => !!i)
    : f ? pool.filter(matches) : pool.filter((i) => i.clientKey === req.client);
  const missing = req.accounts.length - (req.accounts.length ? picked.length : 0);
  const skipped: LimitPlan['skipped'] = missing > 0 ? [{ email: `${missing} inbox${missing === 1 ? '' : 'es'}`, why: 'not an active client\'s inbox in Airtable' }] : [];
  const changes: LimitChange[] = [];
  for (const i of picked) {
    if (!i.emailId || !i.teamId) { skipped.push({ email: i.email, why: 'no EmailBison Email ID / Workspace ID in Airtable' }); continue; }
    if (/^Replace/.test(i.stage)) { skipped.push({ email: i.email, why: 'waiting for its replacement: stays at 0' }); continue; }
    const resting = i.stage === 'Resting 7 Days';
    const c: LimitChange = { rec: i.id, email: i.email, clientKey: i.clientKey, client: i.client, senderId: i.emailId, teamId: i.teamId };
    if (req.cold !== null && !resting && i.dailyLimit !== req.cold) c.cold = { from: i.dailyLimit, to: req.cold };
    if (req.warmup !== null && i.warmupLimit !== req.warmup) c.warmup = { from: i.warmupLimit, to: req.warmup };
    if (!c.cold && !c.warmup) { skipped.push({ email: i.email, why: resting && req.cold !== null ? 'resting: the health loop gives its limit back after the retest' : 'already at that limit' }); continue; }
    if (resting && req.cold !== null) skipped.push({ email: i.email, why: 'resting: cold limit left at 0 (warm-up changed)' });
    changes.push(c);
  }
  const keys = [...new Set(changes.map((c) => c.clientKey))];
  return { changes, skipped, clientKey: keys.length === 1 ? keys[0] : keys.length ? 'multi' : req.client, client: keys.length === 1 ? changes[0].client : keys.length ? `${keys.length} clients` : '' };
}

const pair = (c: Pick<LimitChange, 'cold' | 'warmup'>) => [c.cold ? `cold ${c.cold.from ?? '?'} → ${c.cold.to}/day` : '', c.warmup ? `warm-up ${c.warmup.from ?? '?'} → ${c.warmup.to}/day` : ''].filter(Boolean).join(', ');
/** One line for the whole change ("6 inboxes of Twenty West: cold 5 → 10/day, warm-up 10 → 20/day"). Pure. */
export function describePlan(p: Pick<LimitPlan, 'changes' | 'client'>): string {
  const cold = [...new Set(p.changes.filter((c) => c.cold).map((c) => c.cold!.to))];
  const warm = [...new Set(p.changes.filter((c) => c.warmup).map((c) => c.warmup!.to))];
  const what = [cold.length ? `cold ${cold.join('/')}/day` : '', warm.length ? `warm-up ${warm.join('/')}/day` : ''].filter(Boolean).join(', ');
  return `${p.changes.length} inbox${p.changes.length === 1 ? '' : 'es'}${p.client ? ` of ${p.client}` : ''} → ${what}`;
}

export const limitsLive = (cfg: Pick<Config, 'dryRun' | 'liveStages'>) => !cfg.dryRun || cfg.liveStages.includes(LIMITS_STAGE);

/** Queue the change (dry run unless LIVE_STAGES has inbox.limits). A double press within a minute is the same job. */
export async function queueLimitChange(db: Db, cfg: Pick<Config, 'dryRun' | 'liveStages'>, plan: LimitPlan, by: string, opts: { reason?: string; source?: 'hq' | 'ramp'; rampKey?: string; now?: number } = {}) {
  const def = STAGES[LIMITS_STAGE];
  const minute = Math.floor((opts.now ?? Date.now()) / 60_000);
  const hash = createHash('sha256').update(JSON.stringify(plan.changes.map((c) => [c.rec, c.cold?.to, c.warmup?.to]))).digest('hex').slice(0, 16);
  return enqueue(db, {
    kind: LIMITS_STAGE, recordId: `limits:${plan.clientKey || 'multi'}`, requestId: `limits:${hash}:${minute}`,
    input: { changes: plan.changes, by, reason: opts.reason ?? '', source: opts.source ?? 'hq', rampKey: opts.rampKey ?? '', client: plan.client, clientKey: plan.clientKey },
    dryRun: !limitsLive(cfg), maxAttempts: def.maxAttempts, deadlineMs: def.deadlineMs,
  });
}

/** The job: one bulk call per workspace and value, receipts first, then the Airtable mirror and the Activity Log (live only). */
export const inboxLimitsStage: Stage = async (ctx) => {
  const i = ctx.job.input as { changes?: LimitChange[]; by?: string; reason?: string; source?: string; rampKey?: string; client?: string };
  const changes = (Array.isArray(i.changes) ? i.changes : []).filter((c) => Number(c?.senderId) > 0 && Number(c?.teamId) > 0);
  if (!changes.length) throw new PermanentError('no inboxes to change (input.changes is empty)');
  const apiKey = ctx.cfg.emailBisonKeys[ctx.cfg.bounceCheckKey];
  if (!apiKey && !ctx.dryRun) throw new PermanentError(`no EmailBison key on the server named EMAILBISON_KEY_${ctx.cfg.bounceCheckKey.toUpperCase()} (BOUNCE_CHECK_KEY)`);
  const groups = new Map<string, { team: number; kind: 'cold' | 'warmup'; to: number; ids: number[] }>();
  for (const c of changes) {
    for (const kind of ['cold', 'warmup'] as const) {
      const v = c[kind];
      if (!v) continue;
      const k = `${kind}:${c.teamId}:${v.to}`;
      const g = groups.get(k) ?? { team: Number(c.teamId), kind, to: Number(v.to), ids: [] };
      g.ids.push(Number(c.senderId));
      groups.set(k, g);
    }
  }
  const calls: string[] = [];
  for (const g of groups.values()) {
    const all = [...new Set(g.ids)].sort((a, b) => a - b);
    const b = createBisonClient({ apiKey, baseUrl: ctx.cfg.emailBisonBaseUrl, teamId: g.team });
    // Round 2: the same bulk call n8n Bulk Controls makes, at most BULK_CHUNK ids each; a receipt per call (never twice).
    for (let i = 0; i < all.length; i += BULK_CHUNK) {
      const ids = all.slice(i, i + BULK_CHUNK);
      await ctx.paid({
        callKey: `${g.kind}:${g.team}:${g.to}:${createHash('sha256').update(ids.join(',')).digest('hex').slice(0, 12)}`, provider: 'emailbison', units: 0,
        run: async () => { await (g.kind === 'cold' ? b.setDailyLimit(ids, g.to) : b.setWarmupLimit(ids, g.to)); return { ok: true, n: ids.length }; },
        dryRunResult: () => ({ ok: true, n: ids.length, dryRun: true }),
      });
    }
    calls.push(`${g.kind === 'cold' ? 'cold' : 'warm-up'} ${g.to}/day on ${all.length} inbox${all.length === 1 ? '' : 'es'} (workspace ${g.team})`);
  }
  const line = describePlan({ changes, client: String(i.client ?? '') });
  if (!ctx.dryRun && ctx.cfg.airtableApiKey) {
    const at = createAirtableClient({ apiKey: ctx.cfg.airtableApiKey, baseId: ctx.cfg.airtableBaseId, baseUrl: ctx.cfg.airtableBaseUrl });
    await ctx.step('airtable-mirror', async () => {
      // 10 records per Airtable call (its limit), so a bulk edit of hundreds of inboxes stays well inside the deadline.
      const rows = changes.map((c) => ({ id: c.rec, fields: { ...(c.cold ? { [EA.dailyLimit]: c.cold.to } : {}), ...(c.warmup ? { [EX.warmupLimit]: c.warmup.to } : {}) } }));
      for (let k = 0; k < rows.length; k += 10) await at.updateMany(ACCOUNTS, rows.slice(k, k + 10)).catch(() => undefined);
      return { n: changes.length };
    });
    await logActivity(ctx.cfg, {
      event: `Inbox limits changed: ${line}`.slice(0, 250), type: 'Fixed', agent: 'Alex',
      details: `${i.source === 'ramp' ? 'New-client ramp step (RULES.md), approved in HQ' : 'Changed in HQ'} by ${i.by ?? 'UNKNOWN'}.${i.reason ? ` Why: ${i.reason}.` : ''}\n${changes.map((c) => `${c.email}: ${pair(c)}`).join('\n')}`,
      emailAccountRecordIds: changes.map((c) => c.rec).slice(0, 100), jobId: ctx.job.id,
    }, at);
  }
  if (i.rampKey && !ctx.dryRun) await trackClose(ctx.db, i.rampKey, `Done: ${line}`);
  return {
    message: `${ctx.dryRun ? 'Dry run (nothing changed in EmailBison): ' : ''}${line}. ${calls.join('; ')}.`, changed: changes.length, dryRun: ctx.dryRun, calls,
    // Round 2: per inbox, what was set (the receipts are per EmailBison call).
    inboxes: changes.slice(0, 500).map((c) => ({ email: c.email, what: pair(c) })),
  };
};

/* ---------- History (the jobs table is the log) ---------- */
export interface LimitRun { id: number; at: string; status: string; dryRun: boolean; by: string; client: string; clientKey: string; source: string; message: string; changes: { email: string; what: string }[] }
export async function limitHistory(db: Db, client?: string, limit = 20): Promise<LimitRun[]> {
  const r = await db.query(
    `SELECT id, status, dry_run, input, updated_at, COALESCE(result->>'message', error, '') AS message FROM jobs
     WHERE kind=$1 AND ($2::text IS NULL OR input->>'clientKey' = $2) ORDER BY id DESC LIMIT $3`, [LIMITS_STAGE, client || null, limit]);
  return r.rows.map((x) => ({
    id: Number(x.id), at: new Date(x.updated_at).toISOString(), status: String(x.status), dryRun: Boolean(x.dry_run), by: String(x.input?.by ?? ''), client: String(x.input?.client ?? ''),
    clientKey: String(x.input?.clientKey ?? ''), source: String(x.input?.source ?? 'hq'), message: String(x.message ?? '').slice(0, 400),
    changes: (Array.isArray(x.input?.changes) ? x.input.changes : []).slice(0, 50).map((c: LimitChange) => ({ email: String(c.email ?? ''), what: pair(c) })),
  }));
}
/** When each inbox's limits were last really changed (live, succeeded), for the ramp's one-week wait. */
export async function lastLiveChange(db: Db, days = 60): Promise<Map<string, string>> {
  const r = await db.query(`SELECT input, updated_at FROM jobs WHERE kind=$1 AND status='succeeded' AND NOT dry_run AND updated_at > now() - ($2::int * interval '1 day') ORDER BY id`, [LIMITS_STAGE, days]);
  const out = new Map<string, string>();
  for (const x of r.rows) for (const c of Array.isArray(x.input?.changes) ? x.input.changes : []) if (c?.rec) out.set(String(c.rec), new Date(x.updated_at).toISOString());
  return out;
}

/* ---------- The ramp ---------- */
/** Which ramp step a cold limit is (5 → 0, 10 → 1, 15 → 2); anything else is not on the ramp. Pure. */
export const rampStepOf = (cold: number | null): number | null => { const i = RAMP.findIndex((s) => s.cold === cold); return i < 0 ? null : i; };

export interface RampProposal {
  key: string; clientKey: string; client: string; step: number; from: { cold: number; warmup: number }; to: { cold: number; warmup: number };
  accounts: string[]; emails: string[]; sendingSince: string; days: number; why: string;
}
/** "11/24" (dates in HQ use slashes, Round 2). */
const md = (iso: string) => `${Number(iso.slice(5, 7))}/${Number(iso.slice(8, 10))}`;
/**
 * The next ramp step per client and step (one step at a time, never past the cap). An inbox moves
 * when its client has sent for 7 days per step, its own limits were not changed in the last 7 days,
 * and it is not resting or being replaced. Clients past RAMP_WINDOW_DAYS are not "new". Pure.
 */
export function rampProposals(inboxes: Pick<InboxRow, 'id' | 'email' | 'clientKey' | 'client' | 'emailId' | 'teamId' | 'dailyLimit' | 'warmupLimit' | 'stage'>[], firstSend: Map<string, string>, lastChange: Map<string, string>, now = Date.now()): RampProposal[] {
  const out = new Map<string, RampProposal>();
  for (const i of inboxes) {
    if (!i.clientKey || i.clientKey === 'none' || !i.emailId || !i.teamId) continue;
    if (i.stage === 'Resting 7 Days' || /^Replace|Manual Review/.test(i.stage)) continue;
    const since = firstSend.get(i.clientKey);
    if (!since) continue;
    const days = Math.floor((now - Date.parse(since)) / DAY);
    if (days < 0 || days >= RAMP_WINDOW_DAYS) continue;
    const step = rampStepOf(i.dailyLimit);
    if (step === null || step >= RAMP.length - 1) continue;
    const target = Math.min(RAMP.length - 1, Math.floor(days / 7));
    if (step >= target) continue;
    const changed = lastChange.get(i.id);
    if (changed && now - Date.parse(changed) < 7 * DAY) continue;
    const to = RAMP[step + 1];
    const key = `ramp:${i.clientKey}:${to.cold}`;
    const p = out.get(key) ?? {
      key, clientKey: i.clientKey, client: i.client, step: step + 2, from: { ...RAMP[step] }, to: { ...to }, accounts: [], emails: [], sendingSince: since.slice(0, 10), days,
      why: `Sending since ${md(since)} (${days} days). Ramp: week ${step + 2} = ${to.cold} cold / ${to.warmup} warm-up${step + 1 === RAMP.length - 1 ? ' (the cap)' : ''}.`,
    };
    p.accounts.push(i.id); p.emails.push(i.email);
    out.set(key, p);
  }
  return [...out.values()].sort((a, b) => a.client.localeCompare(b.client) || a.to.cold - b.to.cold);
}

/** A campaign's first send: its first live launch job, else (sent > 0) when it went Active / was made. Pure. */
export function firstSendByClient(campaigns: AirtableRecord[], ws: AirtableRecord[], launches: Map<string, string>): Map<string, string> {
  const clients = clientIndex(ws);
  const out = new Map<string, string>();
  const val = (v: unknown) => (Array.isArray(v) ? v[0] : v);
  for (const c of campaigns) {
    const f = c.fields;
    const ref = clients.get(String((Array.isArray(f[KF.client]) ? (f[KF.client] as any[]).map((x) => (typeof x === 'string' ? x : x?.id)) : [])[0] ?? ''));
    if (!ref?.active) continue;
    const sent = Number(val(f[KF.sent]) ?? 0) || 0;
    const status = String(val(f[KF.status]) ?? '');
    const at = launches.get(c.id) ?? (sent > 0 ? String((status === 'Active' ? val(f[KF.statusModified]) : '') || val(f[KF.startedAt]) || val(f[KF.created]) || c.createdTime || '') : '');
    if (!at || !Number.isFinite(Date.parse(at))) continue;
    const prev = out.get(ref.key);
    if (!prev || Date.parse(at) < Date.parse(prev)) out.set(ref.key, new Date(Date.parse(at)).toISOString());
  }
  return out;
}

export interface RampSource { firstSend: Map<string, string>; lastChange: Map<string, string> }
export async function readRampSource(at: Pick<HqAirtable, 'list'>, db: Db): Promise<RampSource> {
  const [campaigns, ws, launchRows, lastChange] = await Promise.all([
    at.list(CAMPAIGNS_T, `{Emails Sent}>0`, [KF.client, KF.status, KF.sent, KF.statusModified, KF.startedAt, KF.created], 3000),
    at.list(WORKSPACES_T, `{Name}!=''`, ['Name', 'Status', 'Client Type', 'Client', 'ID'], 300, { byName: true }),
    db.query(`SELECT record_id, min(updated_at) AS at FROM jobs WHERE kind='campaign.launch' AND status='succeeded' AND NOT dry_run GROUP BY record_id`),
    lastLiveChange(db),
  ]);
  const launches = new Map<string, string>(launchRows.rows.map((x) => [String(x.record_id), new Date(x.at).toISOString()]));
  return { firstSend: firstSendByClient(campaigns, ws, launches), lastChange };
}
let rampCache: { at: number; data: Promise<RampSource> } | null = null;
export function _resetRampCache() { rampCache = null; }
function cachedRamp(at: Pick<HqAirtable, 'list'>, db: Db, refresh = false, now = Date.now()) {
  if (rampCache && now - rampCache.at < (refresh ? 10_000 : 10 * 60_000)) return rampCache.data;
  const data = readRampSource(at, db);
  rampCache = { at: now, data };
  data.catch(() => { if (rampCache?.data === data) rampCache = null; });
  return data;
}

/** GET /deliverability/limits: the ramp proposals (on demand), recent changes, and whether writes are live. */
export async function limitsView(at: HqAirtable, db: Db, cfg: Parameters<typeof buildDeliverability>[1], params: URLSearchParams) {
  const refresh = params.get('refresh') === '1';
  const client = (params.get('client') ?? '').toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 80);
  const m = buildDeliverability(await cachedDeliv(at, db, refresh), cfg);
  const ramp = await cachedRamp(at, db, refresh).catch(() => null);
  const proposals = ramp ? rampProposals(m.inboxes, ramp.firstSend, ramp.lastChange).filter((p) => !client || p.clientKey === client) : [];
  return {
    live: limitsLive(cfg), proposals, history: await limitHistory(db, client || undefined),
    rule: 'New client inboxes: 5 cold / 10 warm-up per day, after 1 week of sending 10 / 20, after another week 15 / 30 (the cap).',
    bounds: LIMIT_BOUNDS, rampKnown: !!ramp, readAt: m.readAt,
  };
}

/** Round 2: POST /deliverability/limits/preview: what a bulk edit would change, and what it leaves alone. Changes nothing. */
export async function previewLimitChange(at: HqAirtable, db: Db, cfg: Parameters<typeof buildDeliverability>[1] & Pick<Config, 'dryRun' | 'liveStages'>, body: any) {
  const p = parseLimitRequest(body, true);
  if (!p.ok) return { status: 400, body: { error: p.error } };
  const m: DelivModel = buildDeliverability(await cachedDeliv(at, db), cfg);
  const plan = planLimitChange(m.inboxes, p.req);
  const clients = [...new Set(plan.changes.map((c) => c.client))];
  const why = new Map<string, number>();
  for (const s of plan.skipped) why.set(s.why, (why.get(s.why) ?? 0) + 1);
  return {
    status: 200, body: {
      ok: true, live: limitsLive(cfg), changes: plan.changes.length, summary: plan.changes.length ? describePlan(plan) : 'Nothing would change.', clients,
      skipped: plan.skipped.length, skippedWhy: [...why.entries()].map(([w, n]) => ({ why: w, n })).sort((a, b) => b.n - a.n),
      sample: plan.changes.slice(0, 8).map((c) => ({ email: c.email, what: pair(c) })), max: MAX_INBOXES_PER_EDIT,
    },
  };
}

/** POST /deliverability/limits: check, plan and queue (owner only, checked by the route). */
export async function requestLimitChange(at: HqAirtable, db: Db, cfg: Parameters<typeof buildDeliverability>[1] & Pick<Config, 'dryRun' | 'liveStages'>, body: any, by: string) {
  const p = parseLimitRequest(body);
  if (!p.ok) return { status: 400, body: { error: p.error } };
  const m: DelivModel = buildDeliverability(await cachedDeliv(at, db), cfg);
  const plan = planLimitChange(m.inboxes, p.req);
  if (plan.changes.length > MAX_INBOXES_PER_EDIT) return { status: 400, body: { error: `at most ${MAX_INBOXES_PER_EDIT} inboxes at once (this is ${plan.changes.length}): narrow the filter` } };
  if (!plan.changes.length) return { status: 409, body: { error: plan.skipped.length ? `Nothing to change: ${plan.skipped.slice(0, 3).map((s) => `${s.email} (${s.why})`).join('; ')}` : 'No inboxes found for that choice.', skipped: plan.skipped } };
  const rampKey = typeof body.rampKey === 'string' && /^ramp:[a-z0-9]+:\d+$/.test(body.rampKey) ? body.rampKey : '';
  const r = await queueLimitChange(db, cfg, plan, by, { reason: p.req.reason, source: rampKey ? 'ramp' : 'hq', rampKey });
  if (r.status === 'already_active') return { status: 409, body: { error: 'A limit change for these inboxes is already running. Try again in a minute.' } };
  return { status: 200, body: { ok: true, jobId: Number(r.job.id), dryRun: r.job.dry_run, duplicate: r.status === 'duplicate_request', summary: describePlan(plan), changes: plan.changes.length, skipped: plan.skipped } };
}

/** Atlas's daily ramp check: one waiting-for-Alex task per proposal; tasks whose step is no longer due are closed. Never applies. */
export const atlasRampStage: Stage = async (ctx) => {
  const cfg = ctx.cfg;
  if (!cfg.airtableApiKey) throw new PermanentError('no AIRTABLE_API_KEY on the server');
  const at = createAirtableClient({ apiKey: cfg.airtableApiKey, baseId: cfg.airtableBaseId, baseUrl: cfg.airtableBaseUrl });
  const m = buildDeliverability(await readDelivSource(at, ctx.db), cfg);
  const ramp = await readRampSource(at, ctx.db);
  const proposals = rampProposals(m.inboxes, ramp.firstSend, ramp.lastChange);
  for (const p of proposals) {
    await trackTask(ctx.db, {
      agent: 'Atlas', key: p.key, title: `Ramp ${p.client}: ${p.emails.length} inbox${p.emails.length === 1 ? '' : 'es'} to ${p.to.cold} cold / ${p.to.warmup} warm-up`,
      client: p.client, status: 'waiting_alex', priority: 'normal', due: dueIn(1), link: `deliverability/inboxes/${p.clientKey}`,
      note: `${p.why} Apply it in Deliverability → Inboxes (needs your OK).`, details: p.emails.join('\n'), job: null,
    });
  }
  const open = (await ctx.db.query(`SELECT source_key FROM hq_agent_tasks WHERE status<>'done' AND source_key LIKE 'ramp:%'`)).rows.map((x) => String(x.source_key));
  const due = new Set(proposals.map((p) => p.key));
  for (const k of open) if (!due.has(k)) await trackClose(ctx.db, k, 'No longer due (applied or changed by hand).');
  // Round 3: Atlas's own task for the domains with no real renewal date (closed when none is left).
  const gap = renewalGap(m.domains);
  // Alex may already have given Atlas this task by hand (round 3): then no second one.
  const byHand = (await ctx.db.query(`SELECT 1 FROM hq_agent_tasks WHERE agent='Atlas' AND status<>'done' AND source_key IS DISTINCT FROM $1 AND title ILIKE '%renewal date%' LIMIT 1`, [RENEWAL_TASK_KEY])).rows.length > 0;
  if (gap.missing && !byHand) {
    await trackTask(ctx.db, {
      agent: 'Atlas', key: RENEWAL_TASK_KEY, title: `Fill the renewal date on ${gap.missing} domain${gap.missing === 1 ? '' : 's'}`, client: '', status: 'open', priority: 'normal', due: dueIn(7),
      link: 'deliverability/domains', note: `${gap.missing} of ${gap.total} domains have no real renewal date${m.cheap.connected ? ' (Cheap Inboxes has none for them either)' : ' (Cheap Inboxes is not connected: CHEAPINBOXES_API_KEY)'}. Fill "Renewal Date" on the Domains records from the domain provider.`,
      details: '', job: null,
    });
  } else await trackClose(ctx.db, RENEWAL_TASK_KEY, gap.missing ? 'Covered by the renewal-date task Alex gave Atlas.' : 'Every domain has a renewal date.');
  return { message: proposals.length ? `${proposals.length} ramp step${proposals.length === 1 ? '' : 's'} to approve: ${proposals.map((p) => `${p.client} → ${p.to.cold}/${p.to.warmup} (${p.emails.length})`).join('; ')}` : 'No ramp step due.', proposals: proposals.length };
};

// HQ "Needs you" (Alex, 2026-11-25: "the to-do shouldn't be like another project management, more
// like 'this is what you need me to do'"). A short list of only what the agents need from the
// person signed in, each with why and one action, built live from:
//   1. Decisions waiting: ONE item per pile ("105 replies waiting for your OK", oldest age), never
//      one per decision. Members get only the piles they can act on (no Money, no Ledger/Sienna).
//   2. Riley's System Issues in "Waiting for Alex" with Fix Type "Manual (Alex)" (owner only): the
//      title, the Why, and the Fix as steps. Done = approve its Decision (link); nothing is
//      written to Airtable from here.
//   3. Sign-ups waiting (owner only) → Users.
//   4. Asks (hq_asks, engine/src/hq/asks.ts) an agent or a Claude session added (one due on a
//      later day waits for that day).
//   5. Agent tasks waiting on Alex that no Decision covers (a stuck campaign plan; owner only).
//      The agents' other tasks stay on their Team pages.
// Items disappear when resolved: the pile is empty, the issue left "Waiting for Alex", the ask is
// done. "Not now" hides an ask or an issue for a day or until Monday.
// Order on Today (Alex 2026-11-25, cheap rules, no AI call per load): money and client-facing
// first, then the oldest, then the agent's priority.
// Day switcher: Yesterday = what got handled (decisions decided, asks done, Riley's fixes, agent
// tasks closed, sign-ups); Tomorrow = what comes back from "Not now" plus what is due tomorrow.
import type { Db } from '../db/pool.js';
import type { HqUser } from './auth.js';
import { OWNER_ONLY, PILES, isAgent, type Pile } from './agents.js';
import { groupByPile, pendingDecisions, toCard, type DecisionCard, type HqAirtable } from './decisions.js';
import { askVisible, asksAroundToday, listAsks, quietKeys, type Ask } from './asks.js';
import { pendingCount } from './users.js';
import { listAgentTasks, type AgentTask } from './agentTasks.js';
import { addDays, nyDate } from './tasks.js';
import { DECISIONS, DF } from '../decisions/fields.js';
import { ISSUES, IF } from '../agents/riley.js';
import { val } from '../agents/emailsFields.js';

export type NeedGroup = 'now' | 'later';
/** handled = done or decided (Yesterday); task = an agent's task waiting on Alex with no Decision behind it. */
export type NeedKind = 'decisions' | 'issue' | 'signups' | 'ask' | 'task' | 'handled';
export type NeedDay = 'yesterday' | 'today' | 'tomorrow';
export const isNeedDay = (x: unknown): x is NeedDay => x === 'yesterday' || x === 'today' || x === 'tomorrow';
export interface NeedLink { label: string; href: string }
export interface NeedItem {
  key: string; kind: NeedKind; group: NeedGroup;
  /** Whose face is on the card: an agent name, or a label (Setup) with `icon`. */
  agent: string; icon?: string;
  title: string; why: string;
  /** Shown under "See steps" (text, rendered escaped). */
  steps: string;
  /** The one primary action (an HQ route such as decisions/Replies, or an https:// link). Null: "See steps", else "Done". */
  action: NeedLink | null;
  /** A second link (a Riley issue → its Decision). */
  link: NeedLink | null;
  canDone: boolean; canSnooze: boolean;
  count?: number;
  /** ISO time the item started (a pile: its oldest decision). */
  at: string;
  /** The agent's priority: lower comes first (after money / client-facing and age). */
  rank: number;
  /** Ranking (Today): money and client-facing come first. */
  money: boolean; clientFacing: boolean;
  /** Yesterday: what happened ("10 sent · 2 skipped", "Done by Alex"). Tomorrow: "Back tomorrow" / "Due tomorrow". */
  outcome?: string;
  /** Yesterday: when it was handled. Tomorrow: when it comes back. */
  when?: string;
}
export interface RileyIssue { id: string; title: string; why: string; fix: string; decision: string; seen: string }

/** The face and the one-line title for a pile. */
export const PILE_AGENT: Record<Pile, string> = { Replies: 'Echo', Campaigns: 'Atlas', Fixes: 'Riley', Money: 'Ledger', Sales: 'Cole', Content: 'Sienna', Orchestrator: 'Ada' };
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
export function pileTitle(pile: Pile, n: number): string {
  switch (pile) {
    case 'Replies': return `${plural(n, 'reply', 'replies')} waiting for your OK`;
    case 'Campaigns': return `${plural(n, 'campaign decision', 'campaign decisions')} waiting`;
    case 'Fixes': return `${plural(n, 'fix', 'fixes')} waiting for your OK`;
    case 'Money': return `${plural(n, 'money decision', 'money decisions')} waiting`;
    default: return `${plural(n, 'decision', 'decisions')} waiting`;
  }
}
export const ago = (iso: string, now: number) => {
  const m = Math.round((now - Date.parse(iso)) / 60_000);
  if (!Number.isFinite(m)) return '';
  return m < 60 ? `${Math.max(1, m)} min ago` : m < 48 * 60 ? `${Math.round(m / 60)} h ago` : `${Math.round(m / 1440)} d ago`;
};
/** The first sentence (or line) of a longer text, at most n characters. */
export function firstSentence(s: string, n = 160): string {
  const t = String(s ?? '').replace(/\s+/g, ' ').trim();
  const cut = /^(.+?[.!?])(\s|$)/.exec(t)?.[1] ?? t;
  return cut.length > n ? `${cut.slice(0, n - 1).trimEnd()}…` : cut;
}

export interface NeedSources {
  owner: boolean;
  decisions: DecisionCard[];
  issues: RileyIssue[];
  signups: number;
  asks: Ask[];
  /** Keys answered "Not now" (issue:rec…), still quiet. */
  quiet?: Set<string>;
  /** Agent tasks waiting on Alex that no Decision covers (owner only). */
  tasks?: AgentTask[];
  now?: number;
}

/** Money: the Money pile, Ledger, or an ask flagged money. Client-facing: replies (a prospect waits) and client campaigns. */
const MONEY_PILES = new Set<Pile>(['Money']);
const CLIENT_PILES = new Set<Pile>(['Replies', 'Campaigns']);

/**
 * Today's order (cheap rules, no AI call): "Do now" before "When you can"; inside each, money and
 * client-facing first, then the oldest, then the agent's priority.
 */
export function rankNeeds(items: NeedItem[], now = Date.now()): NeedItem[] {
  const age = (i: NeedItem) => { const t = Date.parse(i.at); return Number.isFinite(t) ? now - t : 0; };
  const tier = (i: NeedItem) => (i.money || i.clientFacing ? 0 : 1);
  return [...items].sort((a, b) =>
    (a.group === b.group ? 0 : a.group === 'now' ? -1 : 1)
    || tier(a) - tier(b)
    || age(b) - age(a)
    || a.rank - b.rank
    || a.key.localeCompare(b.key));
}

/** Build the list. Pure: from what was read. */
export function aggregateNeeds(s: NeedSources): NeedItem[] {
  const now = s.now ?? Date.now();
  const quiet = s.quiet ?? new Set<string>();
  const out: NeedItem[] = [];

  // 2. Riley's manual fixes (owner only). Their Decisions are covered by the issue card, not the Fixes pile.
  const issueDecisions = new Set<string>();
  if (s.owner) {
    for (const i of s.issues) {
      if (i.decision) issueDecisions.add(i.decision);
      if (quiet.has(`issue:${i.id}`)) continue;
      out.push({
        key: `issue:${i.id}`, kind: 'issue', group: 'now', agent: 'Riley', title: i.title || 'A fix needs your hands',
        why: firstSentence(i.why) || 'Riley needs you to do this by hand.', steps: i.fix, action: null,
        link: i.decision ? { label: 'Open the decision', href: 'decisions/Fixes' } : null,
        canDone: false, canSnooze: true, at: i.seen, rank: 2, money: false, clientFacing: false,
      });
    }
  }

  // 1. One item per Decisions pile the person can act on.
  const piles = groupByPile(s.decisions.filter((d) => !issueDecisions.has(d.id)), s.owner);
  for (const pile of PILES) {
    const list = piles[pile];
    if (!list?.length) continue;
    const oldest = list.map((d) => d.created).filter(Boolean).sort()[0] ?? '';
    const age = oldest ? ago(oldest, now) : '';
    const first = [...list].sort((a, b) => a.created.localeCompare(b.created))[0];
    const old = oldest && now - Date.parse(oldest) >= 86_400_000;
    out.push({
      key: `pile:${pile}`, kind: 'decisions', group: pile === 'Replies' || pile === 'Campaigns' || old ? 'now' : 'later',
      agent: PILE_AGENT[pile], title: pileTitle(pile, list.length),
      why: pile === 'Replies' ? `Prospects are waiting on an answer${age ? `. Oldest ${age}` : ''}.` : `${age ? `Oldest ${age}: ` : ''}${first.title}`,
      steps: '', action: { label: `Open ${pile}`, href: `decisions/${pile}` }, link: null,
      canDone: false, canSnooze: false, count: list.length, at: oldest, rank: pile === 'Replies' ? 0 : 3,
      money: MONEY_PILES.has(pile), clientFacing: CLIENT_PILES.has(pile),
    });
  }

  // 3. Sign-ups (owner only).
  if (s.owner && s.signups > 0) {
    out.push({
      key: 'signups', kind: 'signups', group: 'now', agent: 'HQ', icon: 'userPlus', title: `${plural(s.signups, 'sign-up', 'sign-ups')} waiting`,
      why: 'Someone asked for an HQ login. Approve or deny it.', steps: '', action: { label: 'Approve', href: 'users' }, link: null,
      canDone: false, canSnooze: false, count: s.signups, at: '', rank: 1, money: false, clientFacing: false,
    });
  }

  // 4. Asks. One due on a later day waits for that day ("Tomorrow" shows it the day before).
  const today = nyDate(new Date(now));
  for (const a of s.asks) {
    if (a.done || !askVisible(a, s.owner)) continue;
    if (a.snoozedUntil && Date.parse(a.snoozedUntil) > now) continue;
    if (a.due && a.due > today) continue;
    out.push({ ...askItem(a), group: a.priority === 'high' || (a.due && a.due <= today) ? 'now' : 'later' });
  }

  // 5. Agent tasks waiting on Alex that no Decision covers (a stuck campaign plan, copy notes): owner only.
  if (s.owner) {
    for (const t of s.tasks ?? []) {
      if (t.status !== 'waiting_alex' || t.decision || (t.link ?? '').startsWith('decisions/')) continue;
      if (t.due && t.due > today) continue;
      out.push({ ...taskItem(t), group: t.overdue || t.stalled ? 'now' : 'later' });
    }
  }

  return rankNeeds(out, now);
}

function askItem(a: Ask): NeedItem {
  return {
    key: `ask:${a.id}`, kind: 'ask', group: a.priority === 'high' ? 'now' : 'later', agent: a.agent,
    ...(isAgent(a.agent) ? {} : { icon: 'sparkles' }),
    title: a.title, why: a.why, steps: a.steps,
    action: a.actionUrl ? { label: a.actionLabel || 'Open', href: a.actionUrl } : null, link: null,
    canDone: true, canSnooze: true, at: a.created, rank: a.priority === 'high' ? 2 : 3,
    money: a.money === true || a.agent === 'Ledger', clientFacing: a.clientFacing === true,
  };
}
function taskItem(t: AgentTask): NeedItem {
  return {
    key: `task:${t.id}`, kind: 'task', group: 'later', agent: t.agent, title: t.title, why: t.note || t.notes, steps: '',
    action: t.link ? { label: 'Open', href: t.link } : { label: `Open ${t.agent}`, href: `agents/${t.agent}` }, link: null,
    canDone: false, canSnooze: false, at: t.updated, rank: t.priority === 'high' ? 2 : t.priority === 'low' ? 4 : 3,
    money: t.agent === 'Ledger', clientFacing: !!t.client,
  };
}

// ---------- Yesterday and Tomorrow ----------
export interface DecidedCard { id: string; pile: Pile; agent: string; title: string; status: string; decidedAt: string; decidedBy: string }
export interface FixedIssue { id: string; title: string; at: string }
export interface DaySources {
  owner: boolean;
  /** Decisions approved or rejected lately (filtered to the day here). */
  decided: DecidedCard[];
  /** Asks done lately, snoozed, or with a due date. */
  asks: Ask[];
  /** Riley issues marked Fixed lately (owner only). */
  fixed: FixedIssue[];
  /** Agent tasks: done lately, and open ones (for "due tomorrow"). */
  tasks: AgentTask[];
  /** Sign-ups approved or denied (owner only): when. */
  signupEvents: string[];
  /** Riley's manual issues still waiting, and their "Not now" ends (owner only). */
  issues: RileyIssue[];
  quietUntil: Map<string, string>;
  now?: number;
}
const dayOf = (iso: string | null | undefined) => { const t = Date.parse(String(iso ?? '')); return Number.isFinite(t) ? nyDate(new Date(t)) : ''; };
const listTitles = (xs: string[], n = 3) => `${xs.slice(0, n).join('; ')}${xs.length > n ? `; +${xs.length - n} more` : ''}`;

/** Yesterday: what got handled (decisions decided, asks done, issues fixed, agent tasks closed, sign-ups). Pure. */
export function handledItems(s: DaySources): NeedItem[] {
  const now = s.now ?? Date.now();
  const day = addDays(nyDate(new Date(now)), -1);
  const out: NeedItem[] = [];
  const base = { group: 'later' as NeedGroup, steps: '', action: null, link: null, canDone: false, canSnooze: false, rank: 3, money: false, clientFacing: false };

  // Decisions: one item per pile, like Today.
  const decided = s.decided.filter((d) => dayOf(d.decidedAt) === day && (s.owner || (d.pile !== 'Money' && !OWNER_ONLY.includes(d.agent))));
  for (const pile of PILES) {
    const list = decided.filter((d) => d.pile === pile);
    if (!list.length) continue;
    const yes = list.filter((d) => d.status === 'Approved').length, no = list.length - yes;
    const last = [...list].sort((a, b) => b.decidedAt.localeCompare(a.decidedAt))[0];
    out.push({
      ...base, key: `handled:pile:${pile}`, kind: 'handled', agent: PILE_AGENT[pile], count: list.length,
      title: pile === 'Replies' ? `${plural(list.length, 'reply', 'replies')} handled` : `${pileTitle(pile, list.length).replace(/ waiting( for your OK)?$/, '')} decided`,
      why: listTitles(list.map((d) => d.title)),
      outcome: pile === 'Replies' ? `${yes} sent · ${no} skipped` : `${yes} approved · ${no} rejected`,
      at: last.decidedAt, when: last.decidedAt, money: pile === 'Money', clientFacing: CLIENT_PILES.has(pile),
    });
  }
  // Asks done.
  for (const a of s.asks) {
    if (!a.done || dayOf(a.done) !== day || !askVisible(a, s.owner)) continue;
    out.push({ ...askItem(a), ...base, kind: 'handled', key: `handled:ask:${a.id}`, outcome: `Done${a.doneBy ? ` by ${a.doneBy}` : ''}`, at: a.done, when: a.done, money: a.money === true || a.agent === 'Ledger', clientFacing: a.clientFacing === true });
  }
  // Riley's fixes (owner only).
  if (s.owner) for (const i of s.fixed) {
    if (dayOf(i.at) !== day) continue;
    out.push({ ...base, key: `handled:issue:${i.id}`, kind: 'handled', agent: 'Riley', title: i.title || 'A system issue', why: '', outcome: 'Fixed', at: i.at, when: i.at });
  }
  // Agent tasks closed: one item per agent.
  const done = s.tasks.filter((t) => t.status === 'done' && dayOf(t.done) === day && (s.owner || !OWNER_ONLY.includes(t.agent)));
  for (const agent of [...new Set(done.map((t) => t.agent))]) {
    const mine = done.filter((t) => t.agent === agent).sort((a, b) => String(b.done).localeCompare(String(a.done)));
    out.push({
      ...base, key: `handled:tasks:${agent}`, kind: 'handled', agent, count: mine.length,
      title: `${agent} closed ${plural(mine.length, 'task', 'tasks')}`, why: listTitles(mine.map((t) => t.title)),
      steps: mine.map((t) => `- **${t.title}**${t.note ? `: ${t.note}` : ''}`).join('\n'),
      outcome: 'Done by the agent', at: mine[0].done ?? '', when: mine[0].done ?? '', money: agent === 'Ledger',
    });
  }
  // Sign-ups (owner only).
  const ups = s.owner ? s.signupEvents.filter((t) => dayOf(t) === day).sort() : [];
  if (ups.length) out.push({ ...base, key: 'handled:signups', kind: 'handled', agent: 'HQ', icon: 'userPlus', title: `${plural(ups.length, 'sign-up', 'sign-ups')} handled`, why: '', outcome: 'Approved or denied', count: ups.length, at: ups[ups.length - 1], when: ups[ups.length - 1] });
  return out.sort((a, b) => Number(b.money || b.clientFacing) - Number(a.money || a.clientFacing) || (b.when ?? '').localeCompare(a.when ?? ''));
}

/** Tomorrow: what comes back ("Not now" until tomorrow) and what is due tomorrow. Pure. */
export function tomorrowItems(s: DaySources): NeedItem[] {
  const now = s.now ?? Date.now();
  const day = addDays(nyDate(new Date(now)), 1);
  const out: NeedItem[] = [];
  for (const a of s.asks) {
    if (a.done || !askVisible(a, s.owner)) continue;
    const back = a.snoozedUntil && Date.parse(a.snoozedUntil) > now ? a.snoozedUntil : null;
    if (back ? dayOf(back) === day : a.due === day) {
      out.push({ ...askItem(a), canSnooze: false, group: a.priority === 'high' || a.due === day ? 'now' : 'later', outcome: back ? 'Back tomorrow' : 'Due tomorrow', when: back ?? `${day}T13:00:00.000Z` });
    }
  }
  if (s.owner) {
    for (const i of s.issues) {
      const q = s.quietUntil.get(`issue:${i.id}`);
      if (!q || Date.parse(q) <= now || dayOf(q) !== day) continue;
      out.push({
        key: `issue:${i.id}`, kind: 'issue', group: 'later', agent: 'Riley', title: i.title || 'A fix needs your hands', why: firstSentence(i.why), steps: i.fix, action: null,
        link: i.decision ? { label: 'Open the decision', href: 'decisions/Fixes' } : null, canDone: false, canSnooze: false, at: i.seen, rank: 2, money: false, clientFacing: false,
        outcome: 'Back tomorrow', when: q,
      });
    }
    for (const t of s.tasks) {
      if (t.status !== 'waiting_alex' || t.due !== day) continue;
      out.push({ ...taskItem(t), group: 'now', outcome: 'Due tomorrow', when: `${day}T13:00:00.000Z` });
    }
  }
  return rankNeeds(out, now);
}

/** Riley's issues that need Alex's hands (Status "Waiting for Alex", Fix Type "Manual (Alex)"). */
export async function manualIssues(at: Pick<HqAirtable, 'list'>): Promise<RileyIssue[]> {
  const rows = await at.list(ISSUES, `AND({Status}='Waiting for Alex',{Fix Type}='Manual (Alex)')`,
    [IF.title, IF.status, IF.fixType, IF.why, IF.fix, IF.decision, IF.lastSeen, IF.firstSeen], 50);
  return rows
    .filter((r) => val(r.fields[IF.status]) === 'Waiting for Alex' && val(r.fields[IF.fixType]) === 'Manual (Alex)')
    .map((r) => ({
      id: r.id, title: val(r.fields[IF.title]).slice(0, 160), why: String(r.fields[IF.why] ?? '').trim().slice(0, 2000),
      fix: String(r.fields[IF.fix] ?? '').trim().slice(0, 4000), decision: /^rec[A-Za-z0-9]{14}$/.test(val(r.fields[IF.decision])) ? val(r.fields[IF.decision]) : '',
      seen: val(r.fields[IF.lastSeen]) || val(r.fields[IF.firstSeen]) || r.createdTime || '',
    }));
}

/** Read every source and build the list. A source that fails is named in `errors`; the rest still shows. */
export async function loadNeeds(db: Db, at: HqAirtable | undefined, user: HqUser, pre: { decisions?: DecisionCard[] } = {}): Promise<{ items: NeedItem[]; errors: string[] }> {
  const owner = user.role === 'owner';
  const errors: string[] = [];
  const soft = <T>(what: string, p: Promise<T>, fallback: T) => p.catch(() => { errors.push(what); return fallback; });
  const noAt = !at;
  if (noAt) errors.push('Airtable is not connected on this server, so decisions and Riley\'s fixes are not shown');
  const [decisions, issues, signups, asks, quiet, tasks] = await Promise.all([
    pre.decisions ? Promise.resolve(pre.decisions) : at ? soft('Decisions (Airtable)', pendingDecisions(at), []) : Promise.resolve([]),
    owner && at ? soft("Riley's issues (Airtable)", manualIssues(at), []) : Promise.resolve([]),
    owner ? pendingCount(db) : Promise.resolve(0),
    listAsks(db, { limit: 200 }),
    quietKeys(db),
    owner ? listAgentTasks(db) : Promise.resolve([]),
  ]);
  return { items: aggregateNeeds({ owner, decisions, issues, signups, asks, quiet, tasks }), errors };
}

/** Decisions approved or rejected in the last 3 days (the day is picked in code, New York time). */
export async function decidedDecisions(at: Pick<HqAirtable, 'list'>): Promise<DecidedCard[]> {
  const rows = await at.list(DECISIONS, `AND(OR({Status}='Approved',{Status}='Rejected'),IS_AFTER(LAST_MODIFIED_TIME(),DATEADD(NOW(),-3,'days')))`,
    [DF.title, DF.agent, DF.status, DF.client, DF.action, DF.decidedBy, DF.decidedAt, DF.issue, DF.checked, DF.fix, DF.details, DF.emailsRecord], 1000);
  return rows.map((r) => ({ c: toCard(r), at: val(r.fields[DF.decidedAt]), by: val(r.fields[DF.decidedBy]) }))
    .filter((x) => (x.c.status === 'Approved' || x.c.status === 'Rejected') && x.at)
    .map((x) => ({ id: x.c.id, pile: x.c.pile, agent: x.c.agent, title: x.c.title, status: x.c.status, decidedAt: x.at, decidedBy: x.by }));
}

/** Riley's issues marked Fixed in the last 3 days (when: Applied At, else Last Seen). */
export async function fixedIssues(at: Pick<HqAirtable, 'list'>): Promise<FixedIssue[]> {
  const rows = await at.list(ISSUES, `AND({Status}='Fixed',IS_AFTER(LAST_MODIFIED_TIME(),DATEADD(NOW(),-3,'days')))`, [IF.title, IF.status, IF.appliedAt, IF.lastSeen], 200);
  return rows.filter((r) => val(r.fields[IF.status]) === 'Fixed')
    .map((r) => ({ id: r.id, title: val(r.fields[IF.title]).slice(0, 160), at: val(r.fields[IF.appliedAt]) || val(r.fields[IF.lastSeen]) }))
    .filter((i) => i.at);
}

export interface NeedsDay { day: NeedDay; date: string; items: NeedItem[]; counts: ReturnType<typeof needCounts>; errors: string[] }
/**
 * Needs you for one day. Today = what is due now (loadNeeds). Yesterday = what got handled.
 * Tomorrow = back from "Not now" + due tomorrow. Reads only; never writes Airtable.
 */
export async function loadNeedsDay(db: Db, at: HqAirtable | undefined, user: HqUser, day: NeedDay, now = new Date()): Promise<NeedsDay> {
  const date = addDays(nyDate(now), day === 'yesterday' ? -1 : day === 'tomorrow' ? 1 : 0);
  if (day === 'today') { const n = await loadNeeds(db, at, user); return { day, date, items: n.items, counts: needCounts(n.items), errors: n.errors }; }
  const owner = user.role === 'owner';
  const errors: string[] = [];
  const soft = <T>(what: string, p: Promise<T>, fallback: T) => p.catch(() => { errors.push(what); return fallback; });
  if (!at) errors.push('Airtable is not connected on this server, so decisions and Riley\'s fixes are not shown');
  const y = day === 'yesterday';
  const [decided, fixed, issues, asks, tasks, events, quiet] = await Promise.all([
    y && at ? soft('Decisions (Airtable)', decidedDecisions(at), []) : Promise.resolve([] as DecidedCard[]),
    y && owner && at ? soft("Riley's fixes (Airtable)", fixedIssues(at), []) : Promise.resolve([] as FixedIssue[]),
    !y && owner && at ? soft("Riley's issues (Airtable)", manualIssues(at), []) : Promise.resolve([] as RileyIssue[]),
    asksAroundToday(db),
    listAgentTasks(db, { doneDays: 3, owner, limit: 500 }, now),
    y && owner ? db.query(`SELECT created_at FROM hq_user_events WHERE action IN ('approve','deny') AND created_at > now() - interval '3 days'`).then((r) => r.rows.map((x) => new Date(x.created_at).toISOString())) : Promise.resolve([] as string[]),
    !y ? db.query(`SELECT item_key, quiet_until FROM hq_needs_quiet WHERE quiet_until > now()`).then((r) => new Map(r.rows.map((x) => [String(x.item_key), new Date(x.quiet_until).toISOString()]))) : Promise.resolve(new Map<string, string>()),
  ]);
  const src: DaySources = { owner, decided, asks, fixed, tasks, signupEvents: events, issues, quietUntil: quiet, now: now.getTime() };
  const items = y ? handledItems(src) : tomorrowItems(src);
  return { day, date, items, counts: needCounts(items), errors };
}

export const needCounts = (items: NeedItem[]) => ({ total: items.length, now: items.filter((i) => i.group === 'now').length, later: items.filter((i) => i.group === 'later').length });

// HQ "Needs you" = Alex's to-do list for today (Alex, 2026-11-27: "what do I need to do today for
// the business to succeed?"). Not a copy of Decisions: each item is one thing to DO, most important
// first, written as Problem (title) → what to do (todo) → why (why), one line each, with one action.
// Built live from cheap reads (no AI call per load):
//   1. Decisions only he can make: ONE line for all piles ("12 decisions waiting → Open Decisions"),
//      never one per decision or per pile. Money decisions go to the Ledger item instead.
//   2. Campaigns to start: Atlas's open "Plan next campaign" tasks (a campaign past 60% with no next
//      campaign) → ONE line "Check with Atlas: 3 campaigns past 60% have no next campaign".
//   3. Money with Ledger (owner only): the Money pile, and an urgent Ledger report from the last 3 days.
//   4. Riley's System Issues in "Waiting for Alex" with Fix Type "Manual (Alex)" (owner only).
//   5. Asks (hq_asks) an agent or a Claude session added (one due on a later day waits for that day).
//   6. Agent tasks waiting on Alex that no Decision covers (owner only).
//   7. Check-ins with an agent: runs that failed in the last 24 h, and late or stuck tasks (one line
//      per agent). Members (Josh) get only Echo's (the inbox is his job).
//   8. Sign-ups waiting (owner only) → Users.
//   9. Round 2 (Alex 2026-11-27: "what must I do today as founder"): sales calls today (Sales Data,
//      owner only) and clients at risk / needing a lot of attention (Clients health, owner only).
//      Read through `extras` (the server passes the readers; both are cached), one line each.
// Members never get money, Ledger, Sienna, Riley's manual fixes or sign-ups (built server-side).
// Order (Ada's rules, rankNeeds): importance (rank) first, then "Do now" before "When you can", then
// money and client-facing, then the oldest. Items disappear when resolved; "Not now" hides an ask or
// an issue for a day or until Monday.
// Day switcher: Yesterday = what got handled (decisions decided, asks done, Riley's fixes, agent
// tasks closed, sign-ups); Tomorrow = what comes back from "Not now" plus what is due tomorrow.
import type { Db } from '../db/pool.js';
import type { HqUser } from './auth.js';
import { OWNER_ONLY, PILES, isAgent, type Pile } from './agents.js';
import { groupByPile, pendingDecisions, toCard, type DecisionCard, type HqAirtable } from './decisions.js';
import { askVisible, asksAroundToday, listAsks, quietKeys, type Ask } from './asks.js';
import { pendingCount } from './users.js';
import { listAgentTasks, staleWhy, type AgentTask } from './agentTasks.js';
import { jobHealth } from './team.js';
import { addDays, nyDate } from './tasks.js';
import { DECISIONS, DF } from '../decisions/fields.js';
import { ISSUES, IF } from '../agents/riley.js';
import { val } from '../agents/emailsFields.js';

export type NeedGroup = 'now' | 'later';
/**
 * decisions = the one Decisions line; campaigns = campaigns to start (Atlas); money = Ledger;
 * checkin = talk to an agent (failed runs, late or stuck tasks); task = an agent's task waiting on
 * Alex with no Decision behind it; handled = done or decided (Yesterday).
 */
export type NeedKind = 'decisions' | 'campaigns' | 'money' | 'checkin' | 'issue' | 'signups' | 'ask' | 'task' | 'handled' | 'calls' | 'clients';
export type NeedDay = 'yesterday' | 'today' | 'tomorrow';
export const isNeedDay = (x: unknown): x is NeedDay => x === 'yesterday' || x === 'today' || x === 'tomorrow';
export interface NeedLink { label: string; href: string }
export interface NeedItem {
  key: string; kind: NeedKind; group: NeedGroup;
  /** Whose face is on the card: an agent name, or a label (Setup) with `icon`. */
  agent: string; icon?: string;
  /** The problem, one line. */
  title: string;
  /** What to do, one line. */
  todo?: string;
  /** Why it matters, one line. */
  why: string;
  /** Shown under "See steps" (text, rendered escaped). */
  steps: string;
  /** The one primary action (an HQ route such as decisions, chat/Atlas?ask=…, or an https:// link). Null: "See steps", else "Done". */
  action: NeedLink | null;
  /** A second link (a Riley issue → its Decision; a check-in → the agent's tasks). */
  link: NeedLink | null;
  canDone: boolean; canSnooze: boolean;
  count?: number;
  /** ISO time the item started (the decisions line: its oldest decision). */
  at: string;
  /** Importance (Ada's order): lower comes first. */
  rank: number;
  /** Ranking: money and client-facing come first inside the same importance. */
  money: boolean; clientFacing: boolean;
  /** Yesterday: what happened ("10 sent · 2 skipped", "Done by Alex"). Tomorrow: "Back tomorrow" / "Due tomorrow". */
  outcome?: string;
  /** Yesterday: when it was handled. Tomorrow: when it comes back. */
  when?: string;
}
export interface RileyIssue { id: string; title: string; why: string; fix: string; decision: string; seen: string }

/** Importance per kind (Ada's order, lower first). */
export const RANK = { decisions: 1, calls: 2, askHigh: 2, campaigns: 2, clients: 3, money: 3, issue: 4, task: 4, failed: 5, late: 6, ask: 6, signups: 7 } as const;

/** The face for a pile (Yesterday's items). Unknown piles (renamed later) → Ada. */
const PILE_FACE: Record<string, string> = { Replies: 'Echo', Campaigns: 'Atlas', Fixes: 'Riley', Money: 'Ledger', Sales: 'Cole', Content: 'Sienna' };
export const pileAgent = (pile: string) => PILE_FACE[pile] ?? 'Ada';
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
export function pileTitle(pile: Pile, n: number): string {
  switch (pile as string) {
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
const old = (iso: string, now: number) => ago(iso, now).replace(/ ago$/, ' old');
/** The first sentence (or line) of a longer text, at most n characters. */
export function firstSentence(s: string, n = 160): string {
  const t = String(s ?? '').replace(/\s+/g, ' ').trim();
  const cut = /^(.+?[.!?])(\s|$)/.exec(t)?.[1] ?? t;
  return cut.length > n ? `${cut.slice(0, n - 1).trimEnd()}…` : cut;
}
/** "A", "A and B", "A, B and C", "A, B and 3 more". */
export function listNames(xs: string[], max = 3): string {
  const u = [...new Set(xs.filter(Boolean))];
  if (u.length <= 1) return u[0] ?? '';
  if (u.length <= max) return `${u.slice(0, -1).join(', ')} and ${u[u.length - 1]}`;
  return `${u.slice(0, max - 1).join(', ')} and ${u.length - max + 1} more`;
}
/** An HQ chat route that opens a new chat with the question typed in (not sent). */
export const chatAsk = (agent: string, question: string) => `chat/${agent}?ask=${encodeURIComponent(question)}`;
/** Links on HQ screens never point into Airtable (Alex, 2026-11-27: HQ replaces it). */
export function hqHref(href: string | null | undefined): string | null {
  const h = String(href ?? '').trim();
  if (!h) return null;
  if (/^https:\/\//i.test(h)) { try { return /(^|\.)airtable\.com$/i.test(new URL(h).hostname) ? null : h; } catch { return null; } }
  return h;
}

export interface FailedRuns { agent: string; fails: { kind: string; at: string; error: string }[] }
export interface MoneyReport { id: number; title: string; summary: string; created: string }
/** A sales call on today's calendar (Sales Data), for the founder's to-do. */
export interface CallToday { dealId: string; name: string; company: string; prep: boolean }
/** An active paying client whose health is "Needs attention" or "At risk" (Clients). */
export interface ClientRisk { id: string; name: string; health: 'attention' | 'at_risk'; problem: string }
export interface NeedSources {
  owner: boolean;
  /** Owner only: sales calls today. */
  calls?: CallToday[];
  /** Owner only: clients needing attention or at risk. */
  clients?: ClientRisk[];
  decisions: DecisionCard[];
  issues: RileyIssue[];
  signups: number;
  asks: Ask[];
  /** Keys answered "Not now" (issue:rec…), still quiet. */
  quiet?: Set<string>;
  /** Open agent tasks (the owner: every agent; a member: Echo only). */
  tasks?: AgentTask[];
  /** Runs that failed in the last 24 h and were not followed by a success, per agent. */
  failed?: FailedRuns[];
  /** Ledger's urgent money reports from the last 3 days (owner only). */
  moneyReports?: MoneyReport[];
  now?: number;
}

/** Client-facing piles: replies (a prospect waits) and client campaigns. */
const CLIENT_PILES = new Set<string>(['Replies', 'Campaigns']);
/** Agents a member (Josh) gets check-ins for: the inbox is his job. */
export const MEMBER_CHECKINS: readonly string[] = ['Echo'];

/**
 * Ada's order (cheap rules, no AI call): importance (rank) first; then "Do now" before "When you
 * can"; then money and client-facing; then the oldest.
 */
export function rankNeeds(items: NeedItem[], now = Date.now()): NeedItem[] {
  const age = (i: NeedItem) => { const t = Date.parse(i.at); return Number.isFinite(t) ? now - t : 0; };
  const tier = (i: NeedItem) => (i.money || i.clientFacing ? 0 : 1);
  return [...items].sort((a, b) =>
    a.rank - b.rank
    || (a.group === b.group ? 0 : a.group === 'now' ? -1 : 1)
    || tier(a) - tier(b)
    || age(b) - age(a)
    || a.key.localeCompare(b.key));
}

const isPlanNext = (t: Pick<AgentTask, 'key'>) => t.key.startsWith('plan-next:');

/** Build today's to-do. Pure: from what was read. */
export function aggregateNeeds(s: NeedSources): NeedItem[] {
  const now = s.now ?? Date.now();
  const quiet = s.quiet ?? new Set<string>();
  const today = nyDate(new Date(now));
  const out: NeedItem[] = [];
  const base = { steps: '', link: null, canDone: false, canSnooze: false, money: false, clientFacing: false };

  // 4. Riley's manual fixes (owner only). Their Decisions are covered by the issue card, not the Decisions line.
  const issueDecisions = new Set<string>();
  if (s.owner) {
    for (const i of s.issues) {
      if (i.decision) issueDecisions.add(i.decision);
      if (quiet.has(`issue:${i.id}`)) continue;
      out.push({
        ...base, key: `issue:${i.id}`, kind: 'issue', group: 'now', agent: 'Riley', title: i.title || 'A fix needs your hands',
        todo: i.decision ? 'Do the steps, then approve its decision so Riley checks it worked.' : 'Do the steps, then tell Riley so it checks it worked.',
        why: firstSentence(i.why) || 'Riley cannot fix this one without you.', steps: i.fix, action: null,
        link: i.decision ? { label: 'Open the decision', href: 'decisions/Fixes' } : null,
        canSnooze: true, at: i.seen, rank: RANK.issue,
      });
    }
  }

  // 1. Decisions only he (or the member) can make: ONE line. Money goes to Ledger's item.
  const piles = groupByPile(s.decisions.filter((d) => !issueDecisions.has(d.id)), s.owner);
  const money = piles.Money ?? [];
  const others = PILES.filter((p) => p !== 'Money' && (piles[p] ?? []).length);
  const rest = others.flatMap((p) => piles[p]);
  if (rest.length) {
    const oldest = rest.map((d) => d.created).filter(Boolean).sort()[0] ?? '';
    const replies = (piles.Replies ?? []).length;
    const counts = others.map((p) => `${p} ${piles[p].length}`).join(' · ');
    out.push({
      ...base, key: 'decisions', kind: 'decisions', group: 'now', agent: 'Ada', count: rest.length,
      title: `${plural(rest.length, 'decision', 'decisions')} waiting${oldest ? ` (oldest ${old(oldest, now)})` : ''}`,
      todo: replies ? 'Open Decisions and clear them, replies first.' : 'Open Decisions and clear them.',
      why: replies ? `${plural(replies, 'prospect is', 'prospects are')} waiting on an answer, and the agents wait on the rest (${counts}).` : `Only you can decide these, and the agents wait on them (${counts}).`,
      action: { label: 'Open Decisions', href: replies ? 'decisions/Replies' : 'decisions' },
      at: oldest, rank: RANK.decisions, clientFacing: rest.some((d) => CLIENT_PILES.has(d.pile)),
    });
  }

  // 2. Campaigns to start (owner only): Atlas's open "Plan next campaign" tasks.
  if (s.owner) {
    const next = (s.tasks ?? []).filter((t) => t.status !== 'done' && isPlanNext(t));
    if (next.length) {
      const clients = next.map((t) => t.client || t.title.replace(/^Plan next campaign for /, ''));
      const late = next.some((t) => t.overdue || t.stalled);
      out.push({
        ...base, key: 'campaigns', kind: 'campaigns', group: late ? 'now' : 'later', agent: 'Atlas', count: next.length,
        title: next.length === 1 ? `Check with Atlas: ${clients[0]} has a campaign past 60% and no next campaign` : `Check with Atlas: ${next.length} campaigns past 60% have no next campaign`,
        todo: `Confirm Atlas has the next campaign for ${listNames(clients)}, or tell it to start.`,
        why: 'When a campaign runs out with nothing behind it, the client gets no new meetings.',
        action: { label: 'Ask Atlas', href: chatAsk('Atlas', `Which campaigns past 60% have no next campaign yet (${listNames(clients, 5)})? When will each one start?`) },
        link: { label: "Atlas's tasks", href: 'agents/Atlas' },
        at: next.map((t) => t.created).sort()[0] ?? '', rank: RANK.campaigns, clientFacing: true,
      });
    }
  }

  // 3. Money with Ledger (owner only).
  if (s.owner && money.length) {
    const oldest = money.map((d) => d.created).filter(Boolean).sort()[0] ?? '';
    const first = [...money].sort((a, b) => a.created.localeCompare(b.created))[0];
    out.push({
      ...base, key: 'money', kind: 'money', group: 'now', agent: 'Ledger', count: money.length,
      title: `${plural(money.length, 'money decision', 'money decisions')} waiting with Ledger`,
      todo: 'Go through them with Ledger: yes or no on each.',
      why: firstSentence(`${oldest ? `Oldest ${old(oldest, now)}: ` : ''}${first.title}`),
      action: { label: 'Open Money', href: 'decisions/Money' },
      link: { label: 'Ask Ledger', href: chatAsk('Ledger', 'Which money decisions are waiting on me, and what do you recommend for each?') },
      at: oldest, rank: RANK.money, money: true,
    });
  }
  if (s.owner) {
    for (const r of s.moneyReports ?? []) {
      out.push({
        ...base, key: `money:report:${r.id}`, kind: 'money', group: 'now', agent: 'Ledger', title: `Ledger flagged: ${firstSentence(r.title, 120)}`,
        todo: 'Read the report and decide with Ledger what to do.', why: firstSentence(r.summary) || 'Ledger marked this money report urgent.',
        action: { label: 'Read the report', href: `report/${r.id}` },
        link: { label: 'Ask Ledger', href: chatAsk('Ledger', `About your report "${firstSentence(r.title, 80)}": what do you need from me?`) },
        at: r.created, rank: RANK.money, money: true,
      });
    }
  }

  // 9. Sales calls today and clients at risk (owner only): one line each.
  if (s.owner && (s.calls ?? []).length) {
    const calls = s.calls!;
    const prepped = calls.filter((c) => c.prep).length;
    const who = calls.map((c) => c.name || c.company);
    out.push({
      ...base, key: 'calls', kind: 'calls', group: 'now', agent: 'Cole', count: calls.length,
      title: calls.length === 1 ? `Sales call today: ${who[0]}` : `${calls.length} sales calls today: ${listNames(who)}`,
      todo: prepped === calls.length ? "Read Cole's prep, then take the call." : "Ask Cole for a prep, then take the call.",
      why: `Cole's prep is ready for ${prepped} of ${calls.length}.`,
      action: { label: 'Open Sales', href: 'sales' },
      link: prepped < calls.length ? { label: 'Ask Cole', href: chatAsk('Cole', `Prep me for today's call${calls.length === 1 ? '' : 's'} (${listNames(who, 5)}).`) } : null,
      at: '', rank: RANK.calls, money: true, clientFacing: true,
    });
  }
  if (s.owner && (s.clients ?? []).length) {
    const bad = s.clients!.filter((c) => c.health === 'attention'), risk = s.clients!.filter((c) => c.health === 'at_risk');
    const lead = bad[0] ?? risk[0];
    const names = [...bad, ...risk].map((c) => c.name);
    const parts = [bad.length && `${plural(bad.length, 'client needs', 'clients need')} a lot of attention`, risk.length && `${plural(risk.length, 'client is', 'clients are')} at risk`].filter(Boolean).join(', ');
    out.push({
      ...base, key: 'clients', kind: 'clients', group: bad.length ? 'now' : 'later', agent: 'Atlas', count: names.length,
      title: `${parts}: ${listNames(names)}`,
      todo: 'Check with Atlas what is being done for each, and when results come back.',
      why: firstSentence(`${lead.name}: ${lead.problem || 'behind on the promised results.'}`),
      action: { label: 'Open Clients', href: 'clients' },
      link: { label: 'Ask Atlas', href: chatAsk('Atlas', `What is the plan for ${listNames(names, 5)}? When will each be back on track?`) },
      at: '', rank: RANK.clients, clientFacing: true,
    });
  }

  // 8. Sign-ups (owner only).
  if (s.owner && s.signups > 0) {
    out.push({
      ...base, key: 'signups', kind: 'signups', group: 'later', agent: 'HQ', icon: 'userPlus', title: `${plural(s.signups, 'sign-up', 'sign-ups')} waiting`,
      todo: 'Approve or deny it in Users.', why: 'Someone asked for an HQ login.', action: { label: 'Open Users', href: 'users' },
      count: s.signups, at: '', rank: RANK.signups,
    });
  }

  // 5. Asks. One due on a later day waits for that day ("Tomorrow" shows it the day before).
  for (const a of s.asks) {
    if (a.done || !askVisible(a, s.owner)) continue;
    if (a.snoozedUntil && Date.parse(a.snoozedUntil) > now) continue;
    if (a.due && a.due > today) continue;
    out.push({ ...askItem(a), group: a.priority === 'high' || (a.due && a.due <= today) ? 'now' : 'later' });
  }

  // 6. Agent tasks waiting on Alex that no Decision covers (a stuck campaign plan, copy notes): owner only.
  if (s.owner) {
    for (const t of s.tasks ?? []) {
      if (t.status !== 'waiting_alex' || t.decision || (t.link ?? '').startsWith('decisions/')) continue;
      if (t.due && t.due > today) continue;
      out.push({ ...taskItem(t), group: t.overdue || t.stalled ? 'now' : 'later' });
    }
  }

  // 7. Check-ins: failed runs, then late or stuck tasks, one line per agent.
  const canCheck = (agent: string) => (s.owner ? true : MEMBER_CHECKINS.includes(agent) && !OWNER_ONLY.includes(agent));
  for (const f of s.failed ?? []) {
    if (!f.fails.length || !canCheck(f.agent)) continue;
    const latest = [...f.fails].sort((a, b) => b.at.localeCompare(a.at))[0];
    out.push({
      ...base, key: `checkin:failed:${f.agent}`, kind: 'checkin', group: 'now', agent: f.agent, count: f.fails.length,
      title: `Check with ${f.agent}: ${f.fails.length === 1 ? `${latest.kind} failed` : `${f.fails.length} runs failed`} ${ago(latest.at, now)}`,
      todo: f.agent === 'Riley' ? 'Ask Riley what broke and what the fix needs.' : `Ask ${f.agent} what broke; Riley fixes the system if needed.`,
      why: firstSentence(latest.error) || 'A failed run means that work did not happen.',
      action: { label: `Ask ${f.agent}`, href: chatAsk(f.agent, `Your ${listNames(f.fails.map((x) => x.kind))} run failed. What broke, and what is needed to fix it?`) },
      link: { label: `${f.agent}'s runs`, href: `agents/${f.agent}` },
      at: latest.at, rank: RANK.failed, money: f.agent === 'Ledger',
    });
  }
  const lateByAgent = new Map<string, AgentTask[]>();
  for (const t of s.tasks ?? []) {
    if (t.status === 'done' || t.status === 'waiting_alex' || isPlanNext(t) || !(t.overdue || t.stalled) || !canCheck(t.agent)) continue;
    lateByAgent.set(t.agent, [...(lateByAgent.get(t.agent) ?? []), t]);
  }
  for (const [agent, ts] of lateByAgent) {
    const late = ts.filter((t) => t.overdue).length, stuck = ts.filter((t) => t.stalled && !t.overdue).length;
    const worst = [...ts].sort((a, b) => b.daysLate - a.daysLate || b.daysQuiet - a.daysQuiet || a.id - b.id)[0];
    out.push({
      ...base, key: `checkin:late:${agent}`, kind: 'checkin', group: late ? 'now' : 'later', agent, count: ts.length,
      title: `Check with ${agent}: ${[late && `${plural(late, 'task', 'tasks')} late`, stuck && `${plural(stuck, 'task', 'tasks')} stuck`].filter(Boolean).join(', ')}`,
      todo: 'Ask for an update, or move the due date.',
      why: firstSentence(`${worst.title} (${staleWhy(worst)}).`),
      action: { label: 'Ask for an update', href: chatAsk(agent, `Where are your late or stuck tasks (${listNames(ts.map((t) => `"${t.title}"`), 3)})? What's done, what's next, and by when?`) },
      link: { label: `${agent}'s tasks`, href: `agents/${agent}` },
      at: worst.updated, rank: RANK.late, money: agent === 'Ledger', clientFacing: ts.some((t) => !!t.client),
    });
  }

  return rankNeeds(out, now);
}

function askItem(a: Ask): NeedItem {
  return {
    key: `ask:${a.id}`, kind: 'ask', group: a.priority === 'high' ? 'now' : 'later', agent: a.agent,
    ...(isAgent(a.agent) ? {} : { icon: 'sparkles' }),
    title: a.title, todo: a.steps ? 'Follow the steps, then press Done.' : a.actionUrl ? `${a.actionLabel || 'Open'}, then press Done.` : 'Do it, then press Done.',
    why: a.why, steps: a.steps,
    action: hqHref(a.actionUrl) ? { label: a.actionLabel || 'Open', href: hqHref(a.actionUrl)! } : null, link: null,
    canDone: true, canSnooze: true, at: a.created, rank: a.priority === 'high' ? RANK.askHigh : RANK.ask,
    money: a.money === true || a.agent === 'Ledger', clientFacing: a.clientFacing === true,
  };
}
function taskItem(t: AgentTask): NeedItem {
  return {
    key: `task:${t.id}`, kind: 'task', group: 'later', agent: t.agent, title: `${t.agent} is waiting on you: ${t.title}`,
    todo: 'Open it and give the agent what it needs.', why: firstSentence(t.note || t.notes) || `${t.agent} cannot move this task without you.`, steps: '',
    action: hqHref(t.link) ? { label: 'Open', href: hqHref(t.link)! } : { label: `Open ${t.agent}`, href: `agents/${t.agent}` }, link: null,
    canDone: false, canSnooze: false, at: t.updated, rank: RANK.task + (t.priority === 'high' ? -1 : t.priority === 'low' ? 1 : 0),
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
      ...base, key: `handled:pile:${pile}`, kind: 'handled', agent: pileAgent(pile), count: list.length,
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
        todo: 'Do the steps when it comes back.', link: i.decision ? { label: 'Open the decision', href: 'decisions/Fixes' } : null, canDone: false, canSnooze: false, at: i.seen, rank: RANK.issue, money: false, clientFacing: false,
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
/** Optional readers for the founder items (the server passes them; tests leave them out). */
export interface NeedExtras { calls?: () => Promise<CallToday[]>; clients?: () => Promise<ClientRisk[]> }
export async function loadNeeds(db: Db, at: HqAirtable | undefined, user: HqUser, pre: { decisions?: DecisionCard[]; extras?: NeedExtras } = {}): Promise<{ items: NeedItem[]; errors: string[] }> {
  const owner = user.role === 'owner';
  const errors: string[] = [];
  const soft = <T>(what: string, p: Promise<T>, fallback: T) => p.catch(() => { errors.push(what); return fallback; });
  const noAt = !at;
  if (noAt) errors.push('Airtable is not connected on this server, so decisions and Riley\'s fixes are not shown');
  const [decisions, issues, signups, asks, quiet, tasks, health, moneyReports] = await Promise.all([
    pre.decisions ? Promise.resolve(pre.decisions) : at ? soft('Decisions (Airtable)', pendingDecisions(at), []) : Promise.resolve([]),
    owner && at ? soft("Riley's issues (Airtable)", manualIssues(at), []) : Promise.resolve([]),
    owner ? pendingCount(db) : Promise.resolve(0),
    listAsks(db, { limit: 200 }),
    quietKeys(db),
    // A member's to-do reads only Echo's tasks (the inbox is Josh's job); owner-only agents never.
    owner ? listAgentTasks(db, { limit: 500 }) : listAgentTasks(db, { agent: 'Echo', owner: false, limit: 200 }),
    soft('Agent runs', jobHealth(db), new Map()),
    owner ? soft('Ledger reports', urgentMoneyReports(db), []) : Promise.resolve([] as MoneyReport[]),
  ]);
  const [calls, clients] = await Promise.all([
    owner && pre.extras?.calls ? soft('Sales calls (Airtable)', pre.extras.calls(), [] as CallToday[]) : Promise.resolve([] as CallToday[]),
    owner && pre.extras?.clients ? soft('Client health (Airtable)', pre.extras.clients(), [] as ClientRisk[]) : Promise.resolve([] as ClientRisk[]),
  ]);
  const failed: FailedRuns[] = [...health].map(([agent, h]) => ({ agent, fails: h.openFails }));
  return { items: aggregateNeeds({ owner, decisions, issues, signups, asks, quiet, tasks, failed, moneyReports, calls, clients }), errors };
}

/** Ledger's urgent reports from the last 3 days (owner only: the caller checks). */
export async function urgentMoneyReports(db: Db): Promise<MoneyReport[]> {
  const r = await db.query(`SELECT id, title, summary, created_at FROM hq_reports WHERE agent='Ledger' AND urgent AND created_at > now() - interval '3 days' ORDER BY id DESC LIMIT 3`);
  return r.rows.map((x) => ({ id: Number(x.id), title: String(x.title ?? ''), summary: String(x.summary ?? ''), created: new Date(x.created_at).toISOString() }));
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
export async function loadNeedsDay(db: Db, at: HqAirtable | undefined, user: HqUser, day: NeedDay, now = new Date(), extras?: NeedExtras): Promise<NeedsDay> {
  const date = addDays(nyDate(now), day === 'yesterday' ? -1 : day === 'tomorrow' ? 1 : 0);
  if (day === 'today') { const n = await loadNeeds(db, at, user, { extras }); return { day, date, items: n.items, counts: needCounts(n.items), errors: n.errors }; }
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

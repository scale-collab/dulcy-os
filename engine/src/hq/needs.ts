// HQ "Needs you" (Alex, 2026-11-25: "the to-do shouldn't be like another project management, more
// like 'this is what you need me to do'"). A short list of only what the agents need from the
// person signed in, each with why and one action, built live from:
//   1. Decisions waiting: ONE item per pile ("105 replies waiting for your OK", oldest age), never
//      one per decision. Members get only the piles they can act on (no Money, no Ledger/Sienna).
//   2. Riley's System Issues in "Waiting for Alex" with Fix Type "Manual (Alex)" (owner only): the
//      title, the Why, and the Fix as steps. Done = approve its Decision (link); nothing is
//      written to Airtable from here.
//   3. Sign-ups waiting (owner only) → Users.
//   4. Asks (hq_asks, engine/src/hq/asks.ts) an agent or a Claude session added.
//   (Atlas's own to-dos in hq_agent_tasks have no person assigned, so they are not shown here.)
// Items disappear when resolved: the pile is empty, the issue left "Waiting for Alex", the ask is
// done. "Not now" hides an ask or an issue for a day or until Monday.
import type { Db } from '../db/pool.js';
import type { HqUser } from './auth.js';
import { PILES, isAgent, type Pile } from './agents.js';
import { groupByPile, pendingDecisions, type DecisionCard, type HqAirtable } from './decisions.js';
import { askVisible, listAsks, quietKeys, type Ask } from './asks.js';
import { pendingCount } from './users.js';
import { ISSUES, IF } from '../agents/riley.js';
import { val } from '../agents/emailsFields.js';

export type NeedGroup = 'now' | 'later';
export type NeedKind = 'decisions' | 'issue' | 'signups' | 'ask';
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
  /** Lower comes first inside a group. */
  rank: number;
}
export interface RileyIssue { id: string; title: string; why: string; fix: string; decision: string; seen: string }

/** The face and the one-line title for a pile. */
export const PILE_AGENT: Record<Pile, string> = { Replies: 'Sean', Campaigns: 'Atlas', Fixes: 'Riley', Money: 'Ledger', Other: 'Ada' };
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
  now?: number;
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
        canDone: false, canSnooze: true, at: i.seen, rank: 2,
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
    });
  }

  // 3. Sign-ups (owner only).
  if (s.owner && s.signups > 0) {
    out.push({
      key: 'signups', kind: 'signups', group: 'now', agent: 'HQ', icon: 'userPlus', title: `${plural(s.signups, 'sign-up', 'sign-ups')} waiting`,
      why: 'Someone asked for an HQ login. Approve or deny it.', steps: '', action: { label: 'Approve', href: 'users' }, link: null,
      canDone: false, canSnooze: false, count: s.signups, at: '', rank: 1,
    });
  }

  // 4. Asks.
  for (const a of s.asks) {
    if (a.done || !askVisible(a, s.owner)) continue;
    if (a.snoozedUntil && Date.parse(a.snoozedUntil) > now) continue;
    out.push({
      key: `ask:${a.id}`, kind: 'ask', group: a.priority === 'high' ? 'now' : 'later', agent: a.agent,
      ...(isAgent(a.agent) ? {} : { icon: 'sparkles' }),
      title: a.title, why: a.why, steps: a.steps,
      action: a.actionUrl ? { label: a.actionLabel || 'Open', href: a.actionUrl } : null, link: null,
      canDone: true, canSnooze: true, at: a.created, rank: a.priority === 'high' ? 2 : 3,
    });
  }

  // Do now first; inside a group the most urgent, then the newest.
  return out.sort((a, b) => (a.group === b.group ? 0 : a.group === 'now' ? -1 : 1) || a.rank - b.rank || (b.at || '').localeCompare(a.at || ''));
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
  const [decisions, issues, signups, asks, quiet] = await Promise.all([
    pre.decisions ? Promise.resolve(pre.decisions) : at ? soft('Decisions (Airtable)', pendingDecisions(at), []) : Promise.resolve([]),
    owner && at ? soft("Riley's issues (Airtable)", manualIssues(at), []) : Promise.resolve([]),
    owner ? pendingCount(db) : Promise.resolve(0),
    listAsks(db, { limit: 200 }),
    quietKeys(db),
  ]);
  return { items: aggregateNeeds({ owner, decisions, issues, signups, asks, quiet }), errors };
}

export const needCounts = (items: NeedItem[]) => ({ total: items.length, now: items.filter((i) => i.group === 'now').length, later: items.filter((i) => i.group === 'later').length });

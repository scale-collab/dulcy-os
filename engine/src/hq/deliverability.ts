// HQ Deliverability (Alex, 2026-11-25). One area for the inboxes and domains, replacing the Airtable
// Spam Center, Email Account Center, Domain & Inbox Inventory, Email Accounts / Warm Up, Inbox
// Placement Tests and Buy Domains & Inboxes screens. Rule: show only what needs attention by default;
// everything else is one tap deeper. Status names (Alex 2026-11-27): Healthy, At risk, Spam, Resting.
// Warm-up OFF on any inbox is a red flag, listed first.
//   - READ ONLY here. The one write (inbox limits) lives in inboxLimits.ts: owner only, an explicit
//     confirm, and a dry run unless inbox.limits is in LIVE_STAGES. Nothing buys. No Airtable links
//     (Alex never reads the records): links go to HQ routes (Decisions).
//   - One batched Airtable read for everyone (6 list calls, no per-row calls), kept 60 seconds.
//   - "What the engine is doing" comes from the engine's own fields and jobs: the account health
//     loop (engine/src/stages/accountHealth.ts) writes Spam Protocol Stage / Rest Started / Retest
//     Due / Previous Daily Limit on Email Accounts and queues replacements in the Spam Remediation
//     Queue with an Atlas decision; the bounce agent rests the account that causes the bounces.
//   - Never read: Email Accounts "Login Password", Domain Purchase Requests "Mailbox Password", money.
import type { Db } from '../db/pool.js';
import type { Config } from '../config.js';
import type { AirtableRecord } from '../providers/airtable.js';
import { ACCOUNTS, DOMAINS, DM, EA, PASS_SCORE, PLACEMENT, PT, QUEUE, SQ } from '../stages/accountHealth.js';
import { val } from '../agents/emailsFields.js';
import { shortClient } from '../agents/ada.js';
import { clientKey, groupWorkspaces } from './clients.js';
import { pendingDecisions, type DecisionCard, type HqAirtable } from './decisions.js';
import { pileFor } from './agents.js';
import { WORKSPACES } from './inbox.js';
import { spamBriefs, warmupBrief } from './deliverabilityFix.js';
import { pendingTests, readPendingTests, waitingForRun, type PendingTest } from './deliverabilityPending.js';
import { warmVerification } from './bounceStats.js';
import { cachedCheapInboxes, cheapInboxesConfig, type CiIndex } from '../providers/cheapInboxes.js';

export const DELIV_CACHE_MS = 60_000;
/**
 * The lines. Placement under 60% and bounce over 4% / 2.5% are Alex's rules (RULES.md). The
 * watch lines are HQ's display choices, taken from the Airtable screens they replace: placement
 * 60-74 (Airtable's "50-74" band, above the rest line), warm-up under 70 (the 2026-11-25 rule for
 * a new campaign's inboxes: "warmup 70+ when scored"), warm-up under 50 = Spam (Airtable "Under 50").
 */
export const LIMITS = {
  placementRest: PASS_SCORE, placementWatch: 75, warmupSick: 50, warmupWatch: 70,
  bounceSick: 4, bounceWatch: 2.5, bounceMinContacted: 100, expirySoonDays: 30, staleDays: 7,
} as const;
/** Domain Purchase Requests (Buy Domains & Inboxes). */
export const PURCHASES = 'tblU6OstDVWeuYBxL';
export const DPR = {
  request: 'flddkK2YMz7lmEJ6F', client: 'flduT4HhXCc6ul7yp', count: 'fldPsjDm14vpm3J1G', provider: 'fldfSpe0lKsbdPvsn', status: 'fldaM0gBqQqOA9ine',
  approve: 'fldF4hvF1oWwC8YdE', error: 'fldHLfsVVv7gD03GX', mailboxes: 'fldBT7EnVOOFLhRVb', selected: 'fldLLJfPgHJLZa5yk',
  // Round 3: the quote (money: owner only on screen) and the request's choices. Never "Mailbox Password".
  quoteToday: 'fldpSYgv1IVC4MEGs', monthlyCost: 'fld9ZLjeMfmvRXCGT', quoteAt: 'fldbPg1APbu6eVnZE', available: 'fldJq4s2nUHYShEmZ', tlds: 'fldCoyVisjmsbmSnf', orderId: 'fldWeAhhhnUZQPtUy',
} as const;
/** RULES.md "Inbox cost" (Alex 2026-11-28): Dulcy pays $2.50 an inbox a month (a special discount).
 *  This is the real price: Cheap Inboxes' API shows the public $2.80 tier, which is NOT what Dulcy pays. */
export const INBOX_MONTHLY_DEFAULT = 2.5;
/** Email Accounts fields the engine's health loop does not keep (warm-up, connection, counts). */
export const EX = {
  warmupOn: 'fldFI8B4tk1H5AN7b', warmupScore: 'fldzAnqlrgiM6iIg5', warmupDisable: 'fld7DSLRuadZCQpRu', lastWarmupCheck: 'fldJzkpAXYvAXwstG',
  connection: 'fldvyAN2hm6gmfG86', disconnects: 'fldm2q2OfWBOWJpvq', lastDisconnect: 'fldivgpoNGwU8MW7p',
  sent: 'flddauyX2jz0OagRs', bounced: 'fld38XYE9GeBmSdei', contacted: 'fldPXgdtNEnLejTRH',
  warmupLimit: 'fldipNbxDT5NutIVl', warmupStart: 'fldURrj0qP1DnAKyD',
} as const;
/** Domains fields on top of the health loop's. */
export const DX = {
  client: 'fld1TKnHmhsVsDFxh', accounts: 'fldhTvUpuBrxbBYuB', purchaseStatus: 'fldjSv1gRrfcAPWwh', renewal: 'fldqeipa13jE6ahsu', monitoring: 'fldGGTI4kcL2hYhpC',
  health: 'fldEuSXXjfUo03KAX', placement: 'fldR27HEzVDqPSbwF', provider: 'fldIiEIemY6gi8Dm5', inboxProvider: 'fld2B2If1tvGQIBnx', purchaseDate: 'fldUh0K30mMHWGQL5',
} as const;
export const SQX = { error: 'fldE63qYx56tg8Dcj' } as const;
/**
 * Known risk from the automation audit (automations/audit-2026-11-25.md): the n8n workflow that
 * writes the placement scores was no longer visible. Shown until scores dated on/after the first
 * Friday after the audit arrive.
 */
export const PLACEMENT_WRITER = { workflow: 'xcteI9ofNLOqC0GO', name: 'Inbox Placement "Check Results"', notVisibleSince: '2026-11-25' } as const;

/** Alex 2026-11-27: Healthy, At risk, Spam, Resting (never Watch / Sick). */
export type Health = 'healthy' | 'risk' | 'spam' | 'resting';
export const HEALTH_LABEL: Record<Health, string> = { healthy: 'Healthy', risk: 'At risk', spam: 'Spam', resting: 'Resting' };
/** Old names (links saved before 2026-11-27) → new. */
export const LEGACY_HEALTH: Record<string, Health> = { sick: 'spam', watch: 'risk' };
export type Owner = 'Atlas' | 'Riley';
export interface Reason { code: string; level: 'spam' | 'risk'; text: string; owner: Owner; fromDomain?: boolean }
/** href: an HQ route (decisions/Campaigns) or an https:// Airtable record link. */
export interface DLink { label: string; href: string }
export interface DNote { level: 'bad' | 'warn' | 'info'; problem: string; data: string; fix: string; why: string; owner: Owner }
export interface Tiles { healthy: number; risk: number; spam: number; resting: number; total: number }
export interface Replacement { id: string; status: string; action: string; reason: string; score: number | null; created: string; error: string; decisionId: string; accountIds: string[]; domainIds: string[]; clientKey: string; title: string }
export interface InboxRow {
  id: string; email: string; domain: string; domainId: string; client: string; clientKey: string; status: Health; reasons: Reason[]; doing: string;
  score: number | null; scoreAt: string; google: number | null; outlook: number | null; warmup: number | null; warmupOn: boolean | null; connection: string;
  bounce: number | null; contacted: number; dailyLimit: number | null; previousLimit: number | null; stage: string; restStarted: string; retestFriday: string; campaigns: number; links: DLink[];
  /** Warm-up emails per day (EmailBison warmup_daily_limit). */ warmupLimit: number | null;
  /** EmailBison sender id and workspace (team) id: what the limit edit writes to. */ emailId: number | null; teamId: number | null;
  /** Warm-up is switched off for no known reason: a red flag (Alex 2026-11-27), listed first. Round 2: not when the spam protocol rested it. */ warmupOff: boolean;
  /** Why warm-up is off (null = on). */ warmupWhy: WarmupWhy | null;
}
export interface DomainRow {
  id: string; name: string; client: string; clientKey: string; status: Health; reasons: Reason[]; doing: string; inboxes: number; emails: string[];
  renewal: string; daysToRenewal: number | null; purchaseStatus: string; blacklist: string; blacklistCount: number; lastBlacklistCheck: string; monitoring: string;
  placement: number | null; provider: string; replacement: Replacement | null; links: DLink[];
  /** No Renewal Date in Airtable: 1 year from the date added (Purchase Date, else when the record was made). */ renewalEstimated: boolean; added: string;
  /** What the blacklist cell says, in words (never a blank dash). */ blacklistText: string; blacklistWhy: string;
  /** Round 3: where the renewal date came from; the inbox price per month (Cheap Inboxes, else null = the $2.50 default). Money: owner only on screen. */
  renewalSource: 'airtable' | 'cheapinboxes' | 'estimated' | ''; inboxMonthly: number | null;
}
export interface Item { key: string; kind: 'inbox' | 'domain'; status: Health; title: string; client: string; clientKey: string; reason: string; reasons: Reason[]; owner: Owner; doing: string; links: DLink[]; inboxes?: number; redFlag: boolean }
export interface Freshness {
  newest: string; ageDays: number | null; stale: boolean; expectedFriday: string; fridayMissing: boolean;
  /** The next Friday test that has not run yet (Round 2: on Friday 11/27 with 11/27's scores in, it is 12/4). */ nextFriday: string; tests: number;
  /** The last test date (= newest) and the next one, for "Last test 11/27 · Next test 12/4" (Round 4: no weekday). */ lastTest: string; nextTest: string;
}
export interface EngineRun { kind: string; status: string; at: string; message: string; dryRun: boolean }
export interface EngineState { healthLoop: { everyMin: number; live: boolean; from: string }; runs: EngineRun[] }

const DAY = 86_400_000;
const s = (x: unknown): string => val(x);
const num = (x: unknown): number | null => { const t = val(x); const v = Number(t); return t !== '' && Number.isFinite(v) ? v : null; };
const links = (x: unknown): string[] => (Array.isArray(x) ? x.map((y) => (typeof y === 'string' ? y : (y as any)?.id)).filter(Boolean) : []);
const multi = (x: unknown): string[] => (Array.isArray(x) ? x.map(val).filter(Boolean) : val(x) ? [val(x)] : []);
const RANK: Record<Health, number> = { spam: 0, resting: 1, risk: 2, healthy: 3 };
export const worst = (a: Health, b: Health): Health => (RANK[a] <= RANK[b] ? a : b);

/* ---------- Dates (New York, where Alex works and the Friday tests run) ---------- */
export const nyDate = (iso: string | number | Date): string => new Date(iso).toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
const addDays = (d: string, n: number) => new Date(Date.parse(`${d}T12:00:00Z`) + n * DAY).toISOString().slice(0, 10);
const weekday = (d: string) => new Date(`${d}T12:00:00Z`).getUTCDay();
/** The first Friday on or after a date (YYYY-MM-DD). Pure. */
export function fridayOnOrAfter(d: string): string { return addDays(d, (5 - weekday(d) + 7) % 7); }
/** "11/24" (Round 2 rule: dates in HQ use slashes, no leading zeros). */
export const md = (d: string) => (/^\d{4}-\d{2}-\d{2}/.test(d) ? `${Number(d.slice(5, 7))}/${Number(d.slice(8, 10))}` : '');
const daysBetween = (a: string, b: string) => Math.round((Date.parse(`${b}T12:00:00Z`) - Date.parse(`${a}T12:00:00Z`)) / DAY);

/**
 * How fresh the placement scores are. Pure.
 *  - stale: the newest score is more than 7 days old.
 *  - fridayMissing: the last Friday's tests should be in by Sunday (New York); none dated on/after it.
 */
export function placementFreshness(newestIso: string, now: Date, tests = 0): Freshness {
  const today = nyDate(now);
  const newest = newestIso ? nyDate(newestIso) : '';
  // The Friday whose results must be in by now: the latest Friday at least 2 days ago.
  let f = fridayOnOrAfter(addDays(today, -8));
  while (daysBetween(addDays(f, 7), today) >= 2) f = addDays(f, 7);
  const ageDays = newestIso ? Math.max(0, Math.floor((now.getTime() - Date.parse(newestIso)) / DAY)) : null;
  // The next test: this week's Friday, unless its scores are already in (then the Friday after).
  let next = fridayOnOrAfter(today);
  if (newest && newest >= next) next = addDays(next, 7);
  return {
    newest, ageDays, stale: ageDays === null || ageDays > LIMITS.staleDays, expectedFriday: f,
    fridayMissing: !newest || newest < f, nextFriday: next, tests, lastTest: newest, nextTest: next,
  };
}

/** The notes about the placement scores (Problem → Data → Fix → Why). Pure. */
export function freshnessNotes(f: Freshness, opts: { healthFrom: string; loopOn: boolean }): DNote[] {
  const out: DNote[] = [];
  const writer = `The n8n ${PLACEMENT_WRITER.name} workflow (${PLACEMENT_WRITER.workflow}) was not visible in the ${md(PLACEMENT_WRITER.notVisibleSince)} audit.`;
  const since = fridayOnOrAfter(addDays(PLACEMENT_WRITER.notVisibleSince, 1));
  const noneSinceAudit = !f.newest || f.newest < since;
  const newest = f.newest ? `Newest score ${md(f.newest)} (${f.ageDays} day${f.ageDays === 1 ? '' : 's'} ago).` : 'No placement scores found.';
  const fixIt = `Riley: check that workflow is on and re-run it (prepared fix, your ✅).`;
  const why = 'The health loop needs new scores to rest, recover or replace an inbox; without them it does nothing.';
  if (f.stale) {
    out.push({ level: 'bad', owner: 'Riley', problem: `Placement scores are ${f.ageDays === null ? 'missing' : `${f.ageDays} days old`}.`, data: `${newest}${noneSinceAudit ? ` ${writer}` : ''}`, fix: fixIt, why });
  } else if (f.fridayMissing) {
    out.push({ level: 'bad', owner: 'Riley', problem: `The ${md(f.expectedFriday)} placement scores are missing.`, data: `${newest}${noneSinceAudit ? ` ${writer}` : ''}`, fix: fixIt, why });
  } else if (noneSinceAudit) {
    const healthFrom = opts.healthFrom ? nyDate(opts.healthFrom) : '';
    out.push({
      level: 'warn', owner: 'Riley', problem: `The ${md(since)} placement scores may not arrive.`,
      data: `${newest} ${writer}${healthFrom && f.newest && f.newest < healthFrom ? ` The health loop only reads tests from ${md(healthFrom)}, so it needs the ${md(since)} test.` : ''}`,
      fix: `Riley: confirm the workflow runs before ${md(since)}.`, why,
    });
  }
  if (!opts.loopOn) out.push({ level: 'info', owner: 'Riley', problem: 'The account health loop is off on the server.', data: 'ACCOUNT_HEALTH_EVERY_MIN is 0: no inbox is rested, recovered or replaced automatically.', fix: 'Alex: set ACCOUNT_HEALTH_EVERY_MIN (e.g. 60) when ready.', why: 'RULES 2026-11-25: resting and recovering are automatic.' });
  return out;
}

/* ---------- The facts of one inbox and one domain ---------- */
export interface TestFacts { id: string; email: string; score: number | null; google: number | null; outlook: number | null; at: string; processed: boolean; outcome: string; error: string; /** The test's day (Test Date, else when it was made; New York). */ date?: string }
export interface InboxFacts {
  stage: string; airtableStatus: string; score: number | null; scoreAt: string; test: TestFacts | null;
  connection: string; warmupOn: boolean | null; warmupScore: number | null; warmupDisable: string;
  bounced: number; contacted: number; protocolError: string;
  /** For the warm-up check: a 0 limit with the old one saved = rested by the protocol. */ dailyLimit?: number | null; previousLimit?: number | null;
}
export interface DomainFacts { blacklist: string; blacklistCount: number; found: string; monitoring: string; health: string; renewal: string; purchaseStatus: string }

/**
 * Round 2 (Alex 2026-11-27): why warm-up is off. Off is EXPECTED when the spam protocol took the
 * inbox out (resting 7 days, waiting for a replacement, in spam review) or EmailBison paused it for
 * bounces; only the rest is a red flag. null = warm-up is on (or unknown). Pure.
 */
export type WarmupWhy = 'resting' | 'replacing' | 'spam' | 'bounces' | 'unexpected';
export const WARMUP_WHY_LABEL: Record<WarmupWhy, string> = { resting: 'resting (spam protocol)', replacing: 'waiting for a replacement', spam: 'in spam review', bounces: 'paused by EmailBison for bounces', unexpected: 'off for no known reason' };
export function warmupOffWhy(a: Pick<InboxFacts, 'stage' | 'airtableStatus' | 'warmupOn' | 'warmupDisable'> & { dailyLimit?: number | null; previousLimit?: number | null }): WarmupWhy | null {
  if (a.warmupOn !== false && !a.warmupDisable) return null;
  if (a.stage === 'Resting 7 Days' || a.airtableStatus === 'Resting' || (a.dailyLimit === 0 && (a.previousLimit ?? 0) > 0)) return 'resting';
  if (/^Replace/.test(a.stage)) return 'replacing';
  if (a.stage === 'Manual Review' || a.airtableStatus === 'Spam') return 'spam';
  if (a.warmupDisable) return 'bounces';
  return 'unexpected';
}

/** An inbox's own reasons (not its domain's). Pure. */
export function inboxReasons(a: InboxFacts): Reason[] {
  const out: Reason[] = [];
  const stage = a.stage;
  if (/^Replace/.test(stage)) out.push({ code: 'replace', level: 'spam', owner: 'Atlas', text: stage === 'Replace Inbox' ? 'Failed its retest: replace the inbox' : 'Failed its retest: replace the domain' });
  if (stage === 'Manual Review') out.push({ code: 'manual', level: 'spam', owner: 'Atlas', text: 'Manual review' });
  if (a.score !== null && !/^Replace/.test(stage)) {
    if (a.score < LIMITS.placementRest) out.push({ code: 'placement', level: 'spam', owner: 'Atlas', text: `Placement ${a.score}%${a.scoreAt ? ` (${md(a.scoreAt)})` : ''}` });
    else if (a.score < LIMITS.placementWatch) out.push({ code: 'placement', level: 'risk', owner: 'Atlas', text: `Placement ${a.score}%${a.scoreAt ? ` (${md(a.scoreAt)})` : ''}` });
  }
  if (a.connection && a.connection.toLowerCase() !== 'connected') out.push({ code: 'disconnected', level: 'spam', owner: 'Riley', text: /^disconnected$/i.test(a.connection) ? 'Disconnected' : `Disconnected (${a.connection})` });
  if (/causing bounces/i.test(a.warmupDisable)) out.push({ code: 'warmup', level: 'spam', owner: 'Atlas', text: 'Warm-up stopped: it caused bounces' });
  else if (a.warmupDisable) out.push({ code: 'warmup', level: 'risk', owner: 'Atlas', text: 'Warm-up paused: it received bounces' });
  else if (a.warmupOn === false && warmupOffWhy(a) === 'unexpected') out.push({ code: 'warmupOff', level: 'risk', owner: 'Atlas', text: 'Warm-up OFF: turn it back on' });
  if (a.warmupScore !== null && !out.some((r) => r.code === 'warmup' && r.level === 'spam')) {
    if (a.warmupScore < LIMITS.warmupSick) out.push({ code: 'warmupScore', level: 'spam', owner: 'Atlas', text: `Warm-up score ${a.warmupScore}` });
    else if (a.warmupScore < LIMITS.warmupWatch) out.push({ code: 'warmupScore', level: 'risk', owner: 'Atlas', text: `Warm-up score ${a.warmupScore}` });
  }
  const rate = a.contacted >= LIMITS.bounceMinContacted ? Math.round((a.bounced / a.contacted) * 1000) / 10 : null;
  if (rate !== null && rate > LIMITS.bounceSick) out.push({ code: 'bounce', level: 'spam', owner: 'Atlas', text: `Bounce ${rate}% (${a.bounced} of ${a.contacted.toLocaleString('en-US')})` });
  else if (rate !== null && rate > LIMITS.bounceWatch) out.push({ code: 'bounce', level: 'risk', owner: 'Atlas', text: `Bounce ${rate}% (${a.bounced} of ${a.contacted.toLocaleString('en-US')})` });
  if (a.airtableStatus === 'Spam' && !out.some((r) => r.level === 'spam')) out.push({ code: 'airtable', level: 'spam', owner: 'Atlas', text: 'Marked Spam in Airtable' });
  else if (a.airtableStatus === 'At Risk' && !out.length) out.push({ code: 'airtable', level: 'risk', owner: 'Atlas', text: 'Marked At Risk in Airtable' });
  if (a.protocolError) out.push({ code: 'loopError', level: 'risk', owner: 'Riley', text: `Health loop error: ${a.protocolError.slice(0, 120)}` });
  if (a.test && a.test.outcome === 'Failed') out.push({ code: 'loopError', level: 'risk', owner: 'Riley', text: `Health loop could not read its test: ${(a.test.error || 'no reason given').slice(0, 120)}` });
  return out;
}

/** A domain's reasons (blacklist, monitoring, expiry). Pure. */
export function domainReasons(d: DomainFacts, now: Date): Reason[] {
  const out: Reason[] = [];
  if (d.blacklist === 'Listed' || d.blacklistCount > 0) out.push({ code: 'blacklist', level: 'spam', owner: 'Atlas', text: `Blacklisted${d.blacklistCount ? ` on ${d.blacklistCount}` : ''}${d.found ? `: ${d.found.replace(/\s+/g, ' ').slice(0, 80)}` : ''}` });
  else if (d.health === 'Blacklisted') out.push({ code: 'blacklist', level: 'spam', owner: 'Atlas', text: 'Blacklisted (Domain Health)' });
  else if (d.blacklist === 'Check Failed') out.push({ code: 'blacklistCheck', level: 'risk', owner: 'Riley', text: 'Blacklist check failed' });
  if (['Error', 'Needs Attention'].includes(d.monitoring)) out.push({ code: 'monitoring', level: 'risk', owner: 'Riley', text: `EmailGuard monitoring: ${d.monitoring}` });
  if (d.health === 'At Risk' && !out.some((r) => r.code === 'blacklist')) out.push({ code: 'domainHealth', level: 'risk', owner: 'Atlas', text: 'Domain Health: At Risk' });
  if (d.renewal && d.purchaseStatus !== 'Cancelled') {
    const days = daysBetween(nyDate(now), d.renewal.slice(0, 10));
    if (days < 0) out.push({ code: 'expired', level: 'spam', owner: 'Atlas', text: `Expired ${md(d.renewal)}` });
    else if (days <= LIMITS.expirySoonDays) out.push({ code: 'expiring', level: 'risk', owner: 'Atlas', text: `Expires in ${days} day${days === 1 ? '' : 's'} (${md(d.renewal)})` });
  }
  return out;
}

/** Reasons the rest itself is the fix for: while resting, these do not make the inbox "Spam". */
const COVERED_BY_REST = new Set(['placement', 'bounce', 'airtable']);
/** Healthy / At risk / Spam / Resting from the reasons. Pure. */
export function statusOf(reasons: Reason[], resting: boolean): Health {
  const open = reasons.filter((r) => !(resting && COVERED_BY_REST.has(r.code)));
  if (open.some((r) => r.level === 'spam')) return 'spam';
  if (resting) return 'resting';
  if (open.some((r) => r.level === 'risk')) return 'risk';
  return 'healthy';
}

/** What the engine is already doing about an inbox, in one line. Pure. */
export function inboxDoing(a: InboxFacts & { restStarted: string; retestDue: string; dailyLimit: number | null; previousLimit: number | null }, reasons: Reason[], ctx: { loopOn: boolean; live: boolean; healthFrom: string; replacement: Replacement | null }): string {
  const dry = ctx.live ? '' : ' (dry run: it reports only)';
  if (/^Replace/.test(a.stage)) {
    const r = ctx.replacement;
    if (!r || r.status === 'Pending Review') return 'Replacement waiting for your OK in Decisions. The inbox stays at 0/day.';
    if (r.error) return `Replacement ${r.status.toLowerCase()}, with an error: ${r.error.slice(0, 100)}`;
    return `Replacement ${r.status.toLowerCase()}: n8n prepares the purchase.`;
  }
  if (a.stage === 'Resting 7 Days') {
    const fri = a.retestDue ? fridayOnOrAfter(nyDate(a.retestDue)) : '';
    const limit = a.dailyLimit !== null ? ` · limit ${a.dailyLimit}${a.previousLimit ? ` (was ${a.previousLimit})` : ''}` : '';
    return `Rested ${a.restStarted ? md(nyDate(a.restStarted)) : 'UNKNOWN date'}, retest ${fri ? md(fri) : 'UNKNOWN'}${limit}.`;
  }
  if (a.stage === 'Manual Review') return 'Waiting for a person (Manual Review). Nothing automatic.';
  const placement = reasons.find((r) => r.code === 'placement' && r.level === 'spam');
  if (placement) {
    if (!ctx.loopOn) return 'Health loop is off on the server: nothing automatic.';
    const t = a.test;
    if (t && ctx.healthFrom && Date.parse(t.at) < Date.parse(ctx.healthFrom)) return `Test is from before the health loop started (${md(nyDate(ctx.healthFrom))}): the next test decides.`;
    if (t?.processed && t.outcome === 'Failed') return 'Health loop could not process its test.';
    if (t && !t.processed) return `Health loop rests it on its next run${dry}.`;
    return `Waiting for the next placement test${dry}.`;
  }
  const top = reasons.find((r) => r.level === 'spam') ?? reasons[0];
  if (!top) return '';
  if (top.code === 'disconnected') return 'Nothing automatic: reconnect it in EmailBison.';
  if (top.code === 'bounce') return 'Not rested: the bounce agent rests an inbox only when it causes a campaign\'s bounces.';
  if (top.code === 'loopError') return 'The health loop stopped on it.';
  return 'Nothing automatic yet.';
}

export function domainDoing(reasons: Reason[], replacement: Replacement | null): string {
  if (replacement) return replacement.status === 'Pending Review' ? 'Replacement waiting for your OK in Decisions.' : `Replacement ${replacement.status.toLowerCase()}.`;
  const top = reasons.find((r) => r.level === 'spam') ?? reasons[0];
  if (!top) return '';
  if (top.code === 'blacklist') return 'Nothing automatic: the health loop re-reads the blacklist only when an inbox fails its retest.';
  if (top.code === 'expired' || top.code === 'expiring') return 'Nothing automatic: renew it or let it go.';
  if (top.code === 'blacklistCheck' || top.code === 'monitoring') return 'Nothing automatic: the EmailGuard check needs a look.';
  return 'Nothing automatic yet.';
}

/* ---------- Read (one batch, cached 60 s) ---------- */
const ACCOUNT_FIELDS = [EA.email, EA.emailId, EA.workspaceId, EA.client, EA.dailyLimit, EA.status, EA.healthReason, EA.campaigns, EA.domains, EA.stage, EA.restStarted, EA.retestDue,
  EA.lastScore, EA.previousLimit, EA.failedTests, EA.lastAction, EA.error, EA.queue, ...Object.values(EX)];
const DOMAIN_FIELDS = [...Object.values(DM), ...Object.values(DX)];
const TEST_FIELDS = [PT.email, PT.emailId, PT.workspaceId, PT.testId, PT.overall, PT.google, PT.outlook, PT.testDate, PT.client, PT.processed, PT.outcome, PT.error];
const QUEUE_FIELDS = [SQ.name, SQ.account, SQ.domain, SQ.client, SQ.action, SQ.reason, SQ.score, SQ.status, SQ.createdAt, SQX.error];
const PURCHASE_FIELDS = Object.values(DPR);
/**
 * Placement tests read: the last 21 days (3 Friday runs), newest first. About 1,000 tests a week
 * (6,541 in the 45 days to 11-25), so they are kept 10 minutes: they only change on Fridays.
 */
export const TEST_WINDOW_DAYS = 21;
export const TESTS_CACHE_MS = 10 * 60_000;

export interface DelivSource {
  ws: AirtableRecord[]; accounts: AirtableRecord[]; domains: AirtableRecord[]; tests: AirtableRecord[]; newestTest: AirtableRecord | null;
  /** Round 4: tests still waiting at EmailGuard (Inbox Placement Tests base); null = that base cannot be read. */ pending?: AirtableRecord[] | null;
  queue: AirtableRecord[]; purchases: AirtableRecord[]; decisions: DecisionCard[]; runs: EngineRun[]; readAt: string;
  /** Round 3: Cheap Inboxes (real renewal dates and inbox prices); null when CHEAPINBOXES_API_KEY is not set. */ cheap?: CiIndex | null;
}
/** Where Cheap Inboxes is read from (the server's key; tests swap in a fake). */
let ciReader: (refresh: boolean) => Promise<CiIndex> | null = (refresh) => cachedCheapInboxes(cheapInboxesConfig(), fetch, refresh);
export function setCheapInboxesReader(fn: ((refresh: boolean) => Promise<CiIndex> | null) | null) { ciReader = fn ?? ((refresh) => cachedCheapInboxes(cheapInboxesConfig(), fetch, refresh)); }

type TestsPart = Pick<DelivSource, 'tests' | 'newestTest' | 'pending'>;
function readTests(at: HqAirtable): Promise<TestsPart> {
  return Promise.all([
    at.list(PLACEMENT, `AND({Overall Score}!='',IS_AFTER(CREATED_TIME(),DATEADD(NOW(),-${TEST_WINDOW_DAYS},'days')))`, TEST_FIELDS, 8000, { sortField: 'Test Date', sortDesc: true }),
    at.list(PLACEMENT, `{Overall Score}!=''`, [PT.email, PT.overall], 1, { sortField: 'Test Date', sortDesc: true }).then((r) => r[0] ?? null),
    readPendingTests(),
  ]).then(([tests, newestTest, pending]) => ({ tests, newestTest, pending }));
}

export async function readDelivSource(at: HqAirtable, db: Db, tests?: Promise<TestsPart>, refresh = false): Promise<DelivSource> {
  const [ws, accounts, domains, t, queue, purchases, decisions, runs, cheap] = await Promise.all([
    at.list(WORKSPACES, `{Name}!=''`, ['Name', 'ID', 'Status', 'Client', 'Client Type'], 300, { byName: true }),
    at.list(ACCOUNTS, `{Email Account}!=''`, ACCOUNT_FIELDS, 6000),
    at.list(DOMAINS, `{Domain}!=''`, DOMAIN_FIELDS, 4000),
    tests ?? readTests(at),
    at.list(QUEUE, `AND({Status}!='Completed',{Status}!='Rejected')`, QUEUE_FIELDS, 500),
    at.list(PURCHASES, `AND({Status}!='Completed',{Status}!='Failed')`, PURCHASE_FIELDS, 300),
    pendingDecisions(at).catch(() => [] as DecisionCard[]),
    db.query(`SELECT DISTINCT ON (kind) kind, status, updated_at, result, dry_run, error FROM jobs WHERE kind = ANY($1) ORDER BY kind, id DESC`, [['account.health', 'bounce.check', 'bounce.investigate']])
      .then((r) => r.rows.map((x): EngineRun => ({ kind: x.kind, status: x.status, at: new Date(x.updated_at).toISOString(), message: String(x.result?.message ?? x.error ?? '').slice(0, 300), dryRun: x.dry_run })))
      .catch(() => [] as EngineRun[]),
    Promise.resolve(ciReader(refresh)).catch(() => null),
  ]);
  // The formulas already filter; filtered again here so a wider copy of the rows never shows.
  return { ws, accounts, domains, tests: t.tests, newestTest: t.newestTest, pending: t.pending ?? null, queue: queue.filter((q) => !['Completed', 'Rejected'].includes(s(q.fields[SQ.status]))), purchases: purchases.filter((p) => !['Completed', 'Failed'].includes(s(p.fields[DPR.status]))), decisions, runs, readAt: new Date().toISOString(), cheap: cheap ?? null };
}

let cache: { at: number; data: Promise<DelivSource> } | null = null;
let testsCache: { at: number; data: Promise<TestsPart> } | null = null;
export function _resetDelivCache() { cache = null; testsCache = null; }
/**
 * The cached source, one copy for everyone: 60 seconds (placement tests 10 minutes). refresh=true
 * re-reads everything if the copy is older than 10 seconds.
 */
export function cachedDeliv(at: HqAirtable, db: Db, refresh = false, now = Date.now()): Promise<DelivSource> {
  if (cache && now - cache.at < (refresh ? 10_000 : DELIV_CACHE_MS)) return cache.data;
  if (!testsCache || now - testsCache.at >= (refresh ? 10_000 : TESTS_CACHE_MS)) {
    const t = readTests(at);
    testsCache = { at: now, data: t };
    t.catch(() => { if (testsCache?.data === t) testsCache = null; });
  }
  const data = readDelivSource(at, db, testsCache.data, refresh);
  cache = { at: now, data };
  data.catch(() => { if (cache?.data === data) cache = null; });
  return data;
}

/* ---------- Build (pure) ---------- */
export interface DelivModel {
  inboxes: InboxRow[]; domains: DomainRow[]; items: Item[]; replacements: Replacement[];
  clients: { key: string; name: string; tiles: Tiles; domains: number }[]; tiles: Tiles;
  tests: (TestFacts & { clientKey: string; client: string; domain: string })[]; freshness: Freshness; notes: DNote[]; engine: EngineState;
  /** Round 4: tests still waiting at EmailGuard (active clients); null = not readable. */ pending: (PendingTest & { clientKey: string; date: string })[] | null;
  hidden: { inactiveInboxes: number; noClientInboxes: number; emptyDomains: number }; dataNotes: DNote[]; readAt: string;
  /** Round 3: is Cheap Inboxes connected (CHEAPINBOXES_API_KEY), and its average inbox price. */ cheap: { connected: boolean; error: string; domains: number; mailboxPrice: number | null; readAt: string };
}

/** Data gaps in Airtable that make this screen less sure (for Atlas to fix). Pure. */
export function dataNotes(inboxes: Pick<InboxRow, 'clientKey' | 'domainId'>[], domains: (Pick<DomainRow, 'id' | 'clientKey' | 'renewal' | 'inboxes'> & { renewalEstimated?: boolean })[], ciConnected = false): DNote[] {
  const out: DNote[] = [];
  const recs = domains.filter((d) => d.id && d.clientKey !== 'none');
  const noRenewal = recs.filter((d) => !d.renewal || d.renewalEstimated).length;
  if (noRenewal) out.push({
    level: 'info', owner: 'Atlas', problem: `No renewal date on ${noRenewal} of ${recs.length} domains.`,
    data: `Domains "Renewal Date" is empty${ciConnected ? ' and Cheap Inboxes has no date for them' : ' and Cheap Inboxes is not connected'}: HQ shows 1 year from the date added, marked "estimated".`,
    fix: ciConnected ? 'Atlas: fill Renewal Date from the domain provider.' : 'Alex: add CHEAPINBOXES_API_KEY on the server (real dates from Cheap Inboxes); Atlas fills the rest.',
    why: 'HQ only warns before a domain expires when the real date is there.',
  });
  const unlinked = inboxes.filter((i) => i.clientKey !== 'none' && !i.domainId).length;
  if (unlinked) out.push({ level: 'info', owner: 'Atlas', problem: `${unlinked} inbox${unlinked === 1 ? ' has' : 'es have'} no Domains record.`, data: 'Email Accounts "Domains" is empty and no Domains record has that name; they are grouped by the email\'s domain.', fix: 'Atlas: add or link the Domains records.', why: 'Blacklist and expiry are read from the Domains record.' });
  const notTwo = recs.filter((d) => d.inboxes !== 2).length;
  if (notTwo) out.push({ level: 'info', owner: 'Atlas', problem: `${notTwo} domain${notTwo === 1 ? '' : 's'} without exactly 2 inboxes.`, data: 'RULES 2026-11-25: every domain has 2 accounts.', fix: 'Atlas: check them in the Domains tab (the "Inboxes" number is marked).', why: 'Uneven domains change the sending and the replacement math.' });
  return out;
}

/** The renewal date: Airtable's, else Cheap Inboxes', else 1 year from the date added ("estimated"). Pure. */
export function renewalOf(renewal: string, added: string, cheapInboxes = ''): { date: string; estimated: boolean; source: 'airtable' | 'cheapinboxes' | 'estimated' | '' } {
  if (renewal) return { date: renewal, estimated: false, source: 'airtable' };
  if (/^\d{4}-\d{2}-\d{2}$/.test(cheapInboxes)) return { date: cheapInboxes, estimated: false, source: 'cheapinboxes' };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(added)) return { date: '', estimated: false, source: '' };
  const [y, m, d] = added.split('-').map(Number);
  const next = new Date(Date.UTC(y + 1, m - 1, d));
  if (next.getUTCMonth() !== m - 1) next.setUTCDate(0); // Feb 29 → Feb 28
  return { date: next.toISOString().slice(0, 10), estimated: true, source: 'estimated' };
}
/** The blacklist cell in words, with why (never a blank "–"). Pure. */
export function blacklistText(b: { blacklist: string; count: number; monitoring: string; lastCheck: string }): { text: string; why: string } {
  const when = b.lastCheck ? ` Last check ${md(nyDate(b.lastCheck))}.` : '';
  if (b.blacklist === 'Listed' || b.count > 0) return { text: `Listed${b.count ? ` (${b.count})` : ''}`, why: `On ${b.count || 'a'} blacklist${b.count === 1 ? '' : 's'}.${when}` };
  if (b.blacklist === 'Clean') return { text: 'Clean', why: `On no blacklist.${when}` };
  if (b.blacklist === 'Check Failed') return { text: 'Check failed', why: `EmailGuard could not check it.${when} Riley looks at it.` };
  if (b.blacklist === 'Pending') return { text: 'Checking', why: 'EmailGuard is checking it now.' };
  if (b.monitoring === 'Not Added' || !b.monitoring) return { text: 'Not checked', why: 'Not added to EmailGuard monitoring yet, so it has no blacklist result.' };
  return { text: 'Not checked', why: `EmailGuard has no result yet (monitoring: ${b.monitoring.toLowerCase()}).` };
}
const domainOf = (email: string) => email.split('@')[1]?.toLowerCase().trim() ?? '';
const emptyTiles = (): Tiles => ({ healthy: 0, risk: 0, spam: 0, resting: 0, total: 0 });

export function buildDeliverability(src: DelivSource, cfg: Pick<Config, 'airtableBaseId' | 'accountHealthEveryMin' | 'accountHealthFrom' | 'dryRun' | 'liveStages'>, now = new Date()): DelivModel {
  const loopOn = cfg.accountHealthEveryMin > 0;
  const live = !cfg.dryRun || cfg.liveStages.includes('account.health');

  // Clients: workspaces that are one client count once (the Twenty West pair), the same rule as the Clients screen.
  const group = new Map<string, { key: string; name: string; active: boolean }>();
  const bisonToRec = new Map<string, string>();
  for (const g of groupWorkspaces(src.ws)) {
    const names = g.map((w) => s(w.fields.Name).replace(/\s*\(internal\)\s*$/i, '').trim());
    const full = names.reduce((a, b) => (b.length < a.length ? b : a), names[0]);
    // The key is the same as the Clients and Inbox screens' (clientKey of the full name); the label is the short name.
    const info = { key: clientKey(full), name: shortClient(full), active: g.some((w) => s(w.fields.Status) === 'Active') };
    for (const w of g) { group.set(w.id, info); if (s(w.fields.ID)) bisonToRec.set(s(w.fields.ID), w.id); }
  }
  const clientOf = (recs: string[], bison = ''): { key: string; name: string; active: boolean } | null => {
    for (const r of recs) { const g = group.get(r); if (g) return g; }
    const viaBison = bison ? group.get(bisonToRec.get(bison) ?? '') : undefined;
    return viaBison ?? null;
  };

  // Placement tests: the newest per inbox (by email).
  const tests = src.tests.map((t) => {
    const f = t.fields;
    const email = s(f[PT.email]).toLowerCase();
    const c = clientOf(links(f[PT.client]), s(f[PT.workspaceId]));
    return {
      id: t.id, email, score: num(f[PT.overall]), google: num(f[PT.google]), outlook: num(f[PT.outlook]), at: t.createdTime ?? s(f[PT.testDate]),
      processed: f[PT.processed] === true, outcome: s(f[PT.outcome]), error: s(f[PT.error]), clientKey: c?.key ?? '', client: c?.name ?? '', domain: domainOf(email), active: c?.active ?? false,
      date: testDay(s(f[PT.testDate]), t.createdTime ?? ''),
    };
  }).filter((t) => t.email && t.at && Date.parse(t.at) >= now.getTime() - TEST_WINDOW_DAYS * DAY).sort((a, b) => b.at.localeCompare(a.at));
  const latestTest = new Map<string, (typeof tests)[number]>();
  for (const t of tests) if (!latestTest.has(t.email)) latestTest.set(t.email, t);
  const newestIso = tests[0]?.at || (src.newestTest ? src.newestTest.createdTime ?? s(src.newestTest.fields[PT.testDate]) : '');
  const freshness = placementFreshness(newestIso, now, tests.length);
  const pending = src.pending ? pendingTests(src.pending).map((t) => ({ ...t, c: clientOf([], t.workspaceId) })).filter((t) => t.c?.active)
    .map(({ c, ...t }) => ({ ...t, clientKey: c!.key, date: nyDate(t.at) })) : null;

  // Replacements (Spam Remediation Queue) and their decisions.
  const decisionFor = new Map<string, string>();
  for (const d of src.decisions) { const m = /Spam Remediation Queue record (rec[A-Za-z0-9]{14})/.exec(d.details); if (m) decisionFor.set(m[1], d.id); }
  const replacements: Replacement[] = src.queue.map((q) => {
    const f = q.fields;
    const c = clientOf(links(f[SQ.client]));
    return {
      id: q.id, status: s(f[SQ.status]) || 'Pending Review', action: s(f[SQ.action]), reason: s(f[SQ.reason]).slice(0, 600), score: num(f[SQ.score]), created: s(f[SQ.createdAt]) || q.createdTime || '',
      error: s(f[SQX.error]), decisionId: decisionFor.get(q.id) ?? '', accountIds: links(f[SQ.account]), domainIds: links(f[SQ.domain]), clientKey: c?.key ?? '', title: s(f[SQ.name]).replace(/^Replace Domain — /, ''),
    };
  });
  const replacementOfAccount = new Map<string, Replacement>();
  const replacementOfDomain = new Map<string, Replacement>();
  for (const r of replacements) { r.accountIds.forEach((id) => replacementOfAccount.set(id, r)); r.domainIds.forEach((id) => replacementOfDomain.set(id, r)); }
  const decisionLink = (r: Replacement | null | undefined): DLink[] => (r && r.status === 'Pending Review' ? [{ label: r.decisionId ? 'Decide' : 'Decisions', href: `decisions/${pileFor('Atlas')}` }] : []);

  // Domains.
  const domainById = new Map<string, AirtableRecord>();
  const domainByName = new Map<string, AirtableRecord>();
  for (const d of src.domains) { domainById.set(d.id, d); const n = s(d.fields[DM.name]).toLowerCase(); if (n && !domainByName.has(n)) domainByName.set(n, d); }
  const domainReasonCache = new Map<string, Reason[]>();
  const domainReasonsOf = (d: AirtableRecord): Reason[] => {
    let r = domainReasonCache.get(d.id);
    if (!r) {
      const f = d.fields;
      r = domainReasons({ blacklist: s(f[DM.blacklistStatus]), blacklistCount: num(f[DM.blacklistCount]) ?? 0, found: s(f[DM.blacklistsFound]), monitoring: s(f[DX.monitoring]), health: s(f[DX.health]), renewal: s(f[DX.renewal]), purchaseStatus: s(f[DX.purchaseStatus]) }, now);
      domainReasonCache.set(d.id, r);
    }
    return r;
  };

  // Inboxes.
  const hidden = { inactiveInboxes: 0, noClientInboxes: 0, emptyDomains: 0 };
  const inboxes: InboxRow[] = [];
  for (const a of src.accounts) {
    const f = a.fields;
    const email = s(f[EA.email]).toLowerCase();
    if (!email) continue;
    const c = clientOf(links(f[EA.client]), s(f[EA.workspaceId]));
    if (c && !c.active) { hidden.inactiveInboxes++; continue; }
    if (!c) hidden.noClientInboxes++;
    const dRec = domainById.get(links(f[EA.domains])[0] ?? '') ?? domainByName.get(domainOf(email)) ?? null;
    const test = latestTest.get(email) ?? null;
    const facts: InboxFacts = {
      stage: s(f[EA.stage]), airtableStatus: s(f[EA.status]), score: test?.score ?? num(f[EA.lastScore]), scoreAt: test ? nyDate(test.at) : '', test,
      connection: s(f[EX.connection]), warmupOn: s(f[EX.lastWarmupCheck]) ? f[EX.warmupOn] === true : null, warmupScore: num(f[EX.warmupScore]), warmupDisable: s(f[EX.warmupDisable]),
      bounced: num(f[EX.bounced]) ?? 0, contacted: num(f[EX.contacted]) || num(f[EX.sent]) || 0, protocolError: s(f[EA.error]),
      dailyLimit: num(f[EA.dailyLimit]), previousLimit: num(f[EA.previousLimit]),
    };
    const warmupWhy = warmupOffWhy(facts);
    const own = inboxReasons(facts);
    const fromDomain = dRec ? domainReasonsOf(dRec).filter((r) => ['blacklist', 'expired'].includes(r.code)).map((r) => ({ ...r, fromDomain: true })) : [];
    const reasons = [...own, ...fromDomain];
    const resting = facts.stage === 'Resting 7 Days';
    const replacement = replacementOfAccount.get(a.id) ?? null;
    const extra = { restStarted: s(f[EA.restStarted]), retestDue: s(f[EA.retestDue]), dailyLimit: num(f[EA.dailyLimit]), previousLimit: num(f[EA.previousLimit]) };
    const doing = inboxDoing({ ...facts, ...extra }, own, { loopOn, live, healthFrom: cfg.accountHealthFrom, replacement });
    inboxes.push({
      id: a.id, email, domain: dRec ? s(dRec.fields[DM.name]).toLowerCase() || domainOf(email) : domainOf(email), domainId: dRec?.id ?? '', client: c?.name ?? 'No client', clientKey: c?.key ?? 'none',
      status: statusOf(reasons, resting), reasons, doing,
      score: facts.score, scoreAt: facts.scoreAt, google: test?.google ?? null, outlook: test?.outlook ?? null, warmup: facts.warmupScore, warmupOn: facts.warmupOn, connection: facts.connection,
      bounce: facts.contacted >= LIMITS.bounceMinContacted ? Math.round((facts.bounced / facts.contacted) * 1000) / 10 : null, contacted: facts.contacted,
      dailyLimit: extra.dailyLimit, previousLimit: extra.previousLimit, stage: facts.stage, restStarted: extra.restStarted ? nyDate(extra.restStarted) : '',
      retestFriday: resting && extra.retestDue ? fridayOnOrAfter(nyDate(extra.retestDue)) : '', campaigns: links(f[EA.campaigns]).length,
      links: decisionLink(replacement), warmupLimit: num(f[EX.warmupLimit]), emailId: num(f[EA.emailId]), teamId: num(f[EA.workspaceId]),
      warmupOff: warmupWhy === 'unexpected', warmupWhy,
    });
  }

  // Domain rows: every domain record of an active client (or with an active client's inboxes), plus domains seen only on inboxes.
  const inboxesOf = new Map<string, InboxRow[]>();
  for (const i of inboxes) { const k = i.domainId || `name:${i.domain}`; inboxesOf.set(k, [...(inboxesOf.get(k) ?? []), i]); }
  const domains: DomainRow[] = [];
  const seen = new Set<string>();
  for (const d of src.domains) {
    const f = d.fields;
    const name = s(f[DM.name]).toLowerCase();
    const mine = [...(inboxesOf.get(d.id) ?? []), ...(domainByName.get(name)?.id === d.id ? inboxesOf.get(`name:${name}`) ?? [] : [])];
    const c = clientOf(links(f[DX.client])) ?? (mine[0] ? { key: mine[0].clientKey, name: mine[0].client, active: true } : null);
    // A domain with no inbox is hidden (Alex 2026-11-27): nothing sends from it.
    if (!mine.length) { if (c?.active) hidden.emptyDomains++; continue; }
    seen.add(d.id);
    const reasons = domainReasonsOf(d);
    const replacement = replacementOfDomain.get(d.id) ?? mine.map((i) => replacementOfAccount.get(i.id)).find(Boolean) ?? null;
    const added = (s(f[DX.purchaseDate]) || d.createdTime || '').slice(0, 10);
    const ci = src.cheap?.domains.get(name) ?? null;
    const renewal = renewalOf(s(f[DX.renewal]).slice(0, 10), added, ci?.renewal ?? '');
    const bl = blacklistText({ blacklist: s(f[DM.blacklistStatus]), count: num(f[DM.blacklistCount]) ?? 0, monitoring: s(f[DX.monitoring]), lastCheck: s(f[DM.lastBlacklistCheck]) });
    domains.push({
      id: d.id, name: name || mine[0]?.domain || 'UNKNOWN', client: c?.name ?? 'No client', clientKey: c?.key ?? 'none', status: statusOf(reasons, false), reasons, doing: domainDoing(reasons, replacement),
      inboxes: mine.length, emails: mine.map((i) => i.email).sort(), renewal: renewal.date, daysToRenewal: renewal.date ? daysBetween(nyDate(now), renewal.date) : null, purchaseStatus: s(f[DX.purchaseStatus]),
      blacklist: s(f[DM.blacklistStatus]), blacklistCount: num(f[DM.blacklistCount]) ?? 0, lastBlacklistCheck: s(f[DM.lastBlacklistCheck]), monitoring: s(f[DX.monitoring]),
      placement: num(f[DX.placement]), provider: s(f[DX.inboxProvider]) || s(f[DX.provider]), replacement,
      links: decisionLink(replacement), renewalEstimated: renewal.estimated, added, blacklistText: bl.text, blacklistWhy: bl.why,
      renewalSource: renewal.source, inboxMonthly: ci?.monthly ?? null,
    });
  }
  for (const [k, mine] of inboxesOf) {
    if (!k.startsWith('name:') || domainByName.has(k.slice(5))) continue;
    domains.push({
      id: '', name: k.slice(5) || 'UNKNOWN', client: mine[0].client, clientKey: mine[0].clientKey, status: 'healthy', reasons: [], doing: '', inboxes: mine.length, emails: mine.map((i) => i.email).sort(),
      renewal: '', daysToRenewal: null, purchaseStatus: '', blacklist: '', blacklistCount: 0, lastBlacklistCheck: '', monitoring: '', placement: null, provider: '', replacement: null, links: [],
      renewalEstimated: false, added: '', blacklistText: 'Not checked', blacklistWhy: 'No Domains record in Airtable, so EmailGuard has nothing to check.',
      renewalSource: '', inboxMonthly: src.cheap?.domains.get(k.slice(5))?.monthly ?? null,
    });
  }
  domains.sort((a, b) => RANK[a.status] - RANK[b.status] || a.client.localeCompare(b.client) || a.name.localeCompare(b.name));

  // Needs attention: one line per spam/resting/at-risk thing. A domain problem is one line for the domain (not one per inbox).
  const items: Item[] = [];
  for (const d of domains) {
    if (d.status === 'healthy' || d.clientKey === 'none') continue;
    items.push({ key: `domain:${d.id || d.name}`, kind: 'domain', status: d.status, title: d.name, client: d.client, clientKey: d.clientKey, reason: d.reasons.map((r) => r.text).join(' · '), reasons: d.reasons, owner: topOwner(d.reasons), doing: d.doing, links: d.links, inboxes: d.inboxes, redFlag: false });
  }
  for (const i of inboxes) {
    if (i.clientKey === 'none') continue;
    const own = i.reasons.filter((r) => !r.fromDomain);
    const st = statusOf(own, i.stage === 'Resting 7 Days');
    if (st === 'healthy') continue;
    const shown = st === 'resting' ? own.filter((r) => COVERED_BY_REST.has(r.code) || r.level === 'risk') : own;
    const reason = (st === 'resting' ? [`Resting${shown.length ? `: ${shown.map((r) => r.text).join(' · ')}` : ''}`] : shown.map((r) => r.text)).join(' · ');
    items.push({ key: `inbox:${i.id}`, kind: 'inbox', status: st, title: i.email, client: i.client, clientKey: i.clientKey, reason, reasons: own, owner: topOwner(own), doing: i.doing, links: i.links, redFlag: i.warmupOff });
  }
  // Warm-up OFF first (a red flag), then Spam, Resting, At risk.
  items.sort((a, b) => Number(b.redFlag) - Number(a.redFlag) || RANK[a.status] - RANK[b.status] || a.client.localeCompare(b.client) || Number(a.kind === 'inbox') - Number(b.kind === 'inbox') || a.title.localeCompare(b.title));

  // Tiles: inbox counts, overall and per client (active clients only).
  const tiles = emptyTiles();
  const perClient = new Map<string, { key: string; name: string; tiles: Tiles; domains: number }>();
  for (const i of inboxes) {
    if (i.clientKey === 'none') continue;
    tiles[i.status]++; tiles.total++;
    const pc = perClient.get(i.clientKey) ?? { key: i.clientKey, name: i.client, tiles: emptyTiles(), domains: 0 };
    pc.tiles[i.status]++; pc.tiles.total++;
    perClient.set(i.clientKey, pc);
  }
  for (const d of domains) { const pc = perClient.get(d.clientKey); if (pc) pc.domains++; }
  const clients = [...perClient.values()].sort((a, b) => b.tiles.spam - a.tiles.spam || b.tiles.resting - a.tiles.resting || a.name.localeCompare(b.name));

  const notes = freshnessNotes(freshness, { healthFrom: cfg.accountHealthFrom, loopOn });
  return {
    inboxes, domains, items, replacements, clients, tiles,
    tests: tests.filter((t) => t.active).map(({ active: _a, ...t }) => t), freshness, notes, pending,
    engine: { healthLoop: { everyMin: cfg.accountHealthEveryMin, live, from: cfg.accountHealthFrom }, runs: src.runs }, hidden, dataNotes: dataNotes(inboxes, domains, !!src.cheap && !src.cheap.error), readAt: src.readAt,
    cheap: { connected: !!src.cheap, error: src.cheap?.error ?? '', domains: src.cheap?.domains.size ?? 0, mailboxPrice: src.cheap?.mailboxPrice ?? null, readAt: src.cheap?.readAt ?? '' },
  };
}

function topOwner(reasons: Reason[]): Owner {
  return (reasons.find((r) => r.level === 'spam') ?? reasons[0])?.owner ?? 'Atlas';
}

/* ---------- Views (what each tab gets) ---------- */
type Cfg = Parameters<typeof buildDeliverability>[1];
const matchClient = (key: string, client?: string) => !client || key === client;

/** Round 3: domains with no real renewal date (Atlas fills them; Cheap Inboxes when connected). Pure. */
export const RENEWAL_TASK_KEY = 'deliv:renewal-dates';
export function renewalGap(domains: Pick<DomainRow, 'id' | 'clientKey' | 'renewal' | 'renewalEstimated' | 'renewalSource'>[], client?: string) {
  const recs = domains.filter((d) => d.id && d.clientKey !== 'none' && matchClient(d.clientKey, client));
  return { missing: recs.filter((d) => !d.renewal || d.renewalEstimated).length, total: recs.length, fromCheapInboxes: recs.filter((d) => d.renewalSource === 'cheapinboxes').length, taskKey: RENEWAL_TASK_KEY };
}

export interface ClientCost { key: string; name: string; domains: number; inboxes: number; monthly: number; perInbox: number; source: 'cheapinboxes' | 'default' | 'mixed' }
/**
 * Round 3: the monthly inbox cost per client (money: owner only). Inboxes x the Cheap Inboxes
 * price of their domain, else the account's average Cheap Inboxes price, else $2.50 (RULES.md).
 * Exported for Clients (net profit per client, later). Pure.
 */
export function inboxCosts(m: Pick<DelivModel, 'domains' | 'clients' | 'cheap'>, client?: string): ClientCost[] {
  const name = new Map(m.clients.map((c) => [c.key, c.name]));
  const out = new Map<string, ClientCost & { real: number }>();
  for (const d of m.domains) {
    if (d.clientKey === 'none' || !matchClient(d.clientKey, client)) continue;
    const x = out.get(d.clientKey) ?? { key: d.clientKey, name: name.get(d.clientKey) ?? d.client, domains: 0, inboxes: 0, monthly: 0, perInbox: 0, source: 'default' as ClientCost['source'], real: 0 };
    // Dulcy's discounted price is the real one (Alex 2026-11-28), never the API's public tier.
    x.domains++; x.inboxes += d.inboxes; x.monthly += d.inboxes * INBOX_MONTHLY_DEFAULT; x.real += d.inboxes;
    out.set(d.clientKey, x);
  }
  return [...out.values()].map(({ real, ...x }) => ({
    ...x, monthly: Math.round(x.monthly * 100) / 100, perInbox: x.inboxes ? Math.round((x.monthly / x.inboxes) * 100) / 100 : 0,
    source: (real === 0 ? 'default' : real === x.inboxes ? 'cheapinboxes' : 'mixed') as ClientCost['source'],
  })).sort((a, b) => a.name.localeCompare(b.name));
}

export const SCORE_BANDS = [{ key: '0-24', min: 0, max: 24 }, { key: '25-49', min: 25, max: 49 }, { key: '50-74', min: 50, max: 74 }, { key: '75-100', min: 75, max: 100 }] as const;
export interface TestRun { date: string; tested: number; bands: number[]; avg: number | null; underRest: number }
/** Round 2: per test date, inboxes tested and how many scored 0-24 / 25-49 / 50-74 / 75-100 (like the old Airtable screen). Pure. */
export function testRuns(tests: (Pick<TestFacts, 'email' | 'score' | 'at' | 'date'> & { clientKey: string })[], client?: string): TestRun[] {
  const per = new Map<string, Map<string, number>>();
  for (const t of tests) {
    if (t.score === null || !t.clientKey || !matchClient(t.clientKey, client)) continue;
    const d = t.date || nyDate(t.at);
    const m = per.get(d) ?? new Map<string, number>();
    if (!m.has(t.email)) m.set(t.email, t.score); // newest first: the first per inbox and day is its latest
    per.set(d, m);
  }
  return [...per.entries()].sort((a, b) => b[0].localeCompare(a[0])).map(([date, m]) => {
    const scores = [...m.values()];
    const bands = SCORE_BANDS.map((b) => scores.filter((x) => Math.round(x) >= b.min && Math.round(x) <= b.max).length);
    return { date, tested: scores.length, bands, avg: scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : null, underRest: scores.filter((x) => x < LIMITS.placementRest).length };
  });
}

export interface WarmupSummary { off: number; expected: number; unexpected: number; disconnected: number; byWhy: Record<WarmupWhy, number>; line: string; owner: 'Atlas' }
/** Round 2: warm-up off, counted by why, and Atlas's one plain line. Pure. */
export function warmupSummary(inboxes: Pick<InboxRow, 'clientKey' | 'warmupWhy' | 'connection'>[], client?: string): WarmupSummary {
  const byWhy: Record<WarmupWhy, number> = { resting: 0, replacing: 0, spam: 0, bounces: 0, unexpected: 0 };
  let disconnected = 0;
  for (const i of inboxes) {
    if (i.clientKey === 'none' || !matchClient(i.clientKey, client) || !i.warmupWhy) continue;
    byWhy[i.warmupWhy]++;
    if (i.warmupWhy === 'unexpected' && i.connection && i.connection.toLowerCase() !== 'connected') disconnected++;
  }
  const off = Object.values(byWhy).reduce((a, b) => a + b, 0);
  const expected = off - byWhy.unexpected;
  const n = (x: number, w: string) => `${x.toLocaleString('en-US')} ${w}`;
  const parts = (['resting', 'replacing', 'spam', 'bounces'] as const).filter((k) => byWhy[k]).map((k) => n(byWhy[k], WARMUP_WHY_LABEL[k]));
  const line = !off ? 'Warm-up is on for every inbox.'
    : `Warm-up is off on ${n(off, off === 1 ? 'inbox' : 'inboxes')}. ${expected ? `${parts.join(', ')}: expected${byWhy.unexpected ? '' : ', nothing to do'}.` : ''}${byWhy.unexpected ? ` ${n(byWhy.unexpected, '')}off for no known reason${disconnected ? ` (${disconnected} disconnected: reconnect first)` : ''}: turn ${byWhy.unexpected === 1 ? 'it' : 'them'} back on.` : ''}`.replace(/\s+/g, ' ').trim();
  return { off, expected, unexpected: byWhy.unexpected, disconnected, byWhy, line, owner: 'Atlas' };
}

/** GET /deliverability: Needs attention (tiles, items, notes, engine). */
export function attentionView(m: DelivModel, client?: string) {
  const items = m.items.filter((i) => matchClient(i.clientKey, client));
  const c = client ? m.clients.find((x) => x.key === client) : null;
  return {
    tiles: c ? c.tiles : m.tiles, clients: m.clients, client: client ?? '',
    items, counts: { spam: items.filter((i) => i.status === 'spam').length, resting: items.filter((i) => i.status === 'resting').length, risk: items.filter((i) => i.status === 'risk').length, warmupOff: items.filter((i) => i.redFlag).length },
    notes: m.notes, freshness: m.freshness, engine: m.engine, replacementsWaiting: m.replacements.filter((r) => r.status === 'Pending Review' && matchClient(r.clientKey, client)).length,
    hidden: m.hidden, readAt: m.readAt, warmup: warmupSummary(m.inboxes, client),
    renewalGap: renewalGap(m.domains, client),
    // Round 4: one Fix it per problem (with the accounts in the brief), not a long list to read.
    fixes: { warmup: warmupBrief(m.inboxes, client, c?.name ?? ''), spam: spamBriefs(items, client, c?.name ?? '') },
  };
}

export const INBOX_GROUP_CAP = 400;
/** GET /deliverability/inboxes: search + client + status, grouped by domain (worst first). */
export function inboxesView(m: DelivModel, opts: { client?: string; q?: string; status?: string }) {
  const q = String(opts.q ?? '').trim().toLowerCase().slice(0, 100);
  const asked = LEGACY_HEALTH[String(opts.status)] ?? String(opts.status);
  const status = ['healthy', 'risk', 'spam', 'resting'].includes(asked) ? (asked as Health) : null;
  const rows = m.inboxes.filter((i) => (opts.client ? i.clientKey === opts.client : i.clientKey !== 'none') && (!status || i.status === status) && (!q || i.email.includes(q) || i.domain.includes(q) || i.client.toLowerCase().includes(q)));
  const byDomain = new Map<string, InboxRow[]>();
  for (const i of rows) byDomain.set(i.domain, [...(byDomain.get(i.domain) ?? []), i]);
  const domainRow = new Map(m.domains.map((d) => [d.name, d]));
  const groups = [...byDomain.entries()].map(([domain, list]) => {
    const d = domainRow.get(domain);
    const st = list.reduce<Health>((w, i) => worst(w, i.status), 'healthy');
    return { domain, domainId: d?.id ?? '', client: list[0].client, clientKey: list[0].clientKey, status: st, blacklist: d?.blacklist ?? '', renewal: d?.renewal ?? '', inboxes: [...list].sort((a, b) => RANK[a.status] - RANK[b.status] || a.email.localeCompare(b.email)) };
  }).sort((a, b) => RANK[a.status] - RANK[b.status] || a.client.localeCompare(b.client) || a.domain.localeCompare(b.domain));
  return {
    groups: groups.slice(0, INBOX_GROUP_CAP), totalGroups: groups.length, total: rows.length, clients: m.clients.map((c) => ({ key: c.key, name: c.name, count: c.tiles.total })),
    noClient: m.hidden.noClientInboxes, hidden: m.hidden, readAt: m.readAt,
  };
}

/** GET /deliverability/placement: the newest test per client and domain, with freshness. */
export function placementView(m: DelivModel, client?: string) {
  const byClient = new Map<string, { key: string; name: string; newest: string; domains: Map<string, { domain: string; at: string; inboxes: { email: string; score: number | null; google: number | null; outlook: number | null; at: string }[] }> }>();
  const seenEmail = new Set<string>();
  for (const t of m.tests) {
    if (!t.clientKey || !matchClient(t.clientKey, client) || seenEmail.has(t.email)) continue;
    seenEmail.add(t.email); // tests are newest first: the first one per inbox is its latest
    const c = byClient.get(t.clientKey) ?? { key: t.clientKey, name: t.client, newest: '', domains: new Map() };
    if (!c.newest || t.at > c.newest) c.newest = t.at;
    const d = c.domains.get(t.domain) ?? { domain: t.domain, at: '', inboxes: [] };
    if (!d.at || t.at > d.at) d.at = t.at;
    d.inboxes.push({ email: t.email, score: t.score, google: t.google, outlook: t.outlook, at: t.at });
    c.domains.set(t.domain, d);
    byClient.set(t.clientKey, c);
  }
  const level = (x: number | null): Health => (x === null ? 'healthy' : x < LIMITS.placementRest ? 'spam' : x < LIMITS.placementWatch ? 'risk' : 'healthy');
  const clients = [...byClient.values()].map((c) => {
    const domains = [...c.domains.values()].map((d) => {
      const scores = d.inboxes.map((i) => i.score).filter((x): x is number => x !== null);
      const score = scores.length ? Math.min(...scores) : null;
      return { domain: d.domain, at: d.at, date: nyDate(d.at), score, status: level(score), inboxes: d.inboxes.sort((a, b) => (a.score ?? 101) - (b.score ?? 101)) };
    }).sort((a, b) => (a.score ?? 101) - (b.score ?? 101) || a.domain.localeCompare(b.domain));
    const age = c.newest ? Math.floor((Date.parse(m.readAt) - Date.parse(c.newest)) / DAY) : null;
    return { key: c.key, name: c.name, newest: c.newest ? nyDate(c.newest) : '', ageDays: age, stale: age === null || age > LIMITS.staleDays, spam: domains.filter((d) => d.status === 'spam').length, domains };
  }).sort((a, b) => b.spam - a.spam || a.name.localeCompare(b.name));
  // Active clients with inboxes but no test in the window.
  const untested = m.clients.filter((c) => !byClient.has(c.key) && matchClient(c.key, client)).map((c) => ({ key: c.key, name: c.name, inboxes: c.tiles.total }));
  const runs = testRuns(m.tests, client);
  // Round 4: the newest run's tests still waiting at EmailGuard ("249 scored · 149 waiting for EmailGuard").
  const since = runs[0]?.date ?? '';
  const scored = new Set(m.tests.filter((t) => (t.date || nyDate(t.at)) >= since && matchClient(t.clientKey, client)).map((t) => t.email));
  return { freshness: m.freshness, notes: m.notes.filter((n) => n.owner === 'Riley'), clients, untested, runs, pending: waitingForRun(m.pending, since, scored, client), bands: SCORE_BANDS.map((b) => b.key), windowDays: TEST_WINDOW_DAYS, limits: { rest: LIMITS.placementRest, watch: LIMITS.placementWatch }, readAt: m.readAt };
}

/** The next step of a purchase request in HQ (round 3): nothing moves by itself. Pure. */
export function buyNextStep(status: string, approved: boolean, quoted: boolean): 'quote' | 'wait' | 'approve' | 'buying' | 'done' | 'fix' {
  if (status === 'Failed') return 'fix';
  if (status === 'Completed') return 'done';
  if (approved || ['Approved', 'Purchasing', 'Provisioning'].includes(status)) return 'buying';
  if (status === 'Ready for Approval' && quoted) return 'approve';
  if (status === 'Draft') return 'quote';
  return 'wait';
}
/** The client key of a Workspace IDs record (the same grouping as every HQ screen). Pure. */
export function clientKeyOfWs(src: Pick<DelivSource, 'ws'>, wsId: string): string {
  if (!wsId) return '';
  for (const g of groupWorkspaces(src.ws)) {
    if (!g.some((w) => w.id === wsId)) continue;
    const names = g.map((w) => s(w.fields.Name).replace(/\s*\(internal\)\s*$/i, '').trim());
    return clientKey(names.reduce((a, b) => (b.length < a.length ? b : a), names[0]));
  }
  return '';
}
/** A Test Date (date or date-time) or the record's creation → the New York day. Pure. */
export function testDay(testDate: string, created: string): string {
  if (/^\d{4}-\d{2}-\d{2}$/.test(testDate)) return testDate;
  if (testDate && Number.isFinite(Date.parse(testDate))) return nyDate(testDate);
  return created && Number.isFinite(Date.parse(created)) ? nyDate(created) : '';
}

/** GET /deliverability/domains: domains per client (inbox count, expiry, blacklist), replacements and open purchase requests. */
export function domainsView(m: DelivModel, src: Pick<DelivSource, 'purchases' | 'ws'>, client?: string, owner = true) {
  const list = m.domains.filter((d) => d.clientKey !== 'none' && matchClient(d.clientKey, client));
  const byClient = new Map<string, { key: string; name: string; domains: DomainRow[] }>();
  for (const d of list) { const c = byClient.get(d.clientKey) ?? { key: d.clientKey, name: d.client, domains: [] }; c.domains.push(d); byClient.set(d.clientKey, c); }
  const clientName = new Map(m.clients.map((c) => [c.key, c.name]));
  const purchases = src.purchases.map((p) => {
    const f = p.fields;
    return {
      id: p.id, request: s(f[DPR.request]) || 'Purchase request', status: s(f[DPR.status]) || 'Draft', domains: num(f[DPR.count]), mailboxes: num(f[DPR.mailboxes]), provider: s(f[DPR.provider]),
      approved: f[DPR.approve] === true, error: s(f[DPR.error]).slice(0, 300), created: p.createdTime ?? '', clients: links(f[DPR.client]),
      link: null as DLink | null,
      // Round 3: the quote and the next step (HQ Buy flow, deliverabilityBuy.ts). Money only for the owner.
      quoteToday: owner ? num(f[DPR.quoteToday]) : null, monthly: owner ? num(f[DPR.monthlyCost]) : null, quoteAt: s(f[DPR.quoteAt]),
      selected: s(f[DPR.selected]).split(/\s+/).filter(Boolean).length, available: num(f[DPR.available]), tlds: multi(f[DPR.tlds]),
      next: buyNextStep(s(f[DPR.status]) || 'Draft', f[DPR.approve] === true, num(f[DPR.quoteToday]) !== null),
      clientKey: clientKeyOfWs(src, links(f[DPR.client])[0] ?? ''), client: '',
    };
  }).map((p) => ({ ...p, client: clientName.get(p.clientKey) ?? '' })).filter((p) => !client || p.clientKey === client);
  return {
    clients: [...byClient.values()].map((c) => ({ ...c, inboxes: c.domains.reduce((a, d) => a + d.inboxes, 0), notTwo: c.domains.filter((d) => d.id && d.inboxes !== 2).length })).sort((a, b) => a.name.localeCompare(b.name)),
    replacements: m.replacements.filter((r) => matchClient(r.clientKey, client)).map((r) => ({ ...r, client: clientName.get(r.clientKey) ?? '', link: r.status === 'Pending Review' ? { label: r.decisionId ? 'Decide' : 'Decisions', href: `decisions/${pileFor('Atlas')}` } : null })),
    purchases, notes: m.dataNotes, rule: 'Every domain has 2 inboxes (RULES 2026-11-25).', readAt: m.readAt,
    // Round 3: monthly inbox cost (owner only: money), the renewal-date gap, Cheap Inboxes state.
    costs: owner ? inboxCosts(m, client) : null, costRule: `Inboxes at $${INBOX_MONTHLY_DEFAULT.toFixed(2)} a month.`,
    renewalGap: renewalGap(m.domains, client), cheap: { connected: m.cheap.connected, error: m.cheap.error, readAt: m.cheap.readAt },
  };
}

/** One entry point for the routes: view = attention | inboxes | placement | domains. */
/** Round 3: Atlas's task for the missing renewal dates (from atlas.ramp's daily check or a Fix it press). */
export async function renewalTask(db: Db): Promise<{ status: string; title: string; updated: string; note: string } | null> {
  try {
    const r = await db.query(`SELECT status, title, updated_at, progress_note FROM hq_agent_tasks WHERE source_key=$1 OR (agent='Atlas' AND title ILIKE '%renewal date%' AND status<>'done') ORDER BY (status='done'), id DESC LIMIT 1`, [RENEWAL_TASK_KEY]);
    const x = r.rows[0];
    return x ? { status: String(x.status), title: String(x.title), updated: new Date(x.updated_at).toISOString(), note: String(x.progress_note ?? '') } : null;
  } catch { return null; }
}

/** owner: money (inbox cost, purchase quotes) only for the owner. */
export async function deliverabilityView(at: HqAirtable, db: Db, cfg: Cfg, view: string, params: URLSearchParams, owner = false) {
  const src = await cachedDeliv(at, db, params.get('refresh') === '1');
  const m = buildDeliverability(src, cfg);
  const client = (params.get('client') ?? '').toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 80) || undefined;
  if (view === 'inboxes') return inboxesView(m, { client, q: params.get('q') ?? '', status: params.get('status') ?? '' });
  if (view === 'placement') return placementView(m, client);
  if (view === 'domains') return { ...domainsView(m, src, client, owner), renewalTask: await renewalTask(db) };
  // Round 4: Verification is slow to read from scratch; start it now so the tab opens from the cache (reads only).
  warmVerification(at);
  return attentionView(m, client);
}

/** Batch 3: each inbox's status by its Email Accounts record (for Campaigns' "sending accounts"). Never throws: null when Deliverability cannot be read. */
export async function inboxIndex(at: HqAirtable, db: Db, cfg: Cfg): Promise<Map<string, { status: Health; warmupOff: boolean; email: string; dailyLimit: number | null; warmupLimit: number | null; warmup: number | null; score: number | null }> | undefined> {
  try {
    const m = buildDeliverability(await cachedDeliv(at, db), cfg);
    return new Map(m.inboxes.map((i) => [i.id, { status: i.status, warmupOff: i.warmupOff, email: i.email, dailyLimit: i.dailyLimit, warmupLimit: i.warmupLimit, warmup: i.warmup, score: i.score }]));
  } catch { return undefined; }
}

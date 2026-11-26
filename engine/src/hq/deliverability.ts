// HQ Deliverability (Alex, 2026-11-25). One area for the inboxes and domains, replacing the Airtable
// Spam Center, Email Account Center, Domain & Inbox Inventory, Email Accounts / Warm Up, Inbox
// Placement Tests and Buy Domains & Inboxes screens. Rule: show only what's sick by default;
// everything else is one tap deeper.
//   - READ ONLY. Nothing here writes to Airtable, n8n, Make, EmailBison or EmailGuard, and nothing
//     buys. Links go to existing Airtable records or the Decisions pile.
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

export const DELIV_CACHE_MS = 60_000;
/**
 * The lines. Placement under 60% and bounce over 4% / 2.5% are Alex's rules (RULES.md). The
 * watch lines are HQ's display choices, taken from the Airtable screens they replace: placement
 * 60-74 (Airtable's "50-74" band, above the rest line), warm-up under 70 (the 2026-11-25 rule for
 * a new campaign's inboxes: "warmup 70+ when scored"), warm-up under 50 = sick (Airtable "Under 50").
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
} as const;
/** Email Accounts fields the engine's health loop does not keep (warm-up, connection, counts). */
export const EX = {
  warmupOn: 'fldFI8B4tk1H5AN7b', warmupScore: 'fldzAnqlrgiM6iIg5', warmupDisable: 'fld7DSLRuadZCQpRu', lastWarmupCheck: 'fldJzkpAXYvAXwstG',
  connection: 'fldvyAN2hm6gmfG86', disconnects: 'fldm2q2OfWBOWJpvq', lastDisconnect: 'fldivgpoNGwU8MW7p',
  sent: 'flddauyX2jz0OagRs', bounced: 'fld38XYE9GeBmSdei', contacted: 'fldPXgdtNEnLejTRH',
} as const;
/** Domains fields on top of the health loop's. */
export const DX = {
  client: 'fld1TKnHmhsVsDFxh', accounts: 'fldhTvUpuBrxbBYuB', purchaseStatus: 'fldjSv1gRrfcAPWwh', renewal: 'fldqeipa13jE6ahsu', monitoring: 'fldGGTI4kcL2hYhpC',
  health: 'fldEuSXXjfUo03KAX', placement: 'fldR27HEzVDqPSbwF', provider: 'fldIiEIemY6gi8Dm5', inboxProvider: 'fld2B2If1tvGQIBnx',
} as const;
export const SQX = { error: 'fldE63qYx56tg8Dcj' } as const;
/**
 * Known risk from the automation audit (automations/audit-2026-11-25.md): the n8n workflow that
 * writes the placement scores was no longer visible. Shown until scores dated on/after the first
 * Friday after the audit arrive.
 */
export const PLACEMENT_WRITER = { workflow: 'xcteI9ofNLOqC0GO', name: 'Inbox Placement "Check Results"', notVisibleSince: '2026-11-25' } as const;

export type Health = 'healthy' | 'watch' | 'sick' | 'resting';
export type Owner = 'Atlas' | 'Riley';
export interface Reason { code: string; level: 'sick' | 'watch'; text: string; owner: Owner; fromDomain?: boolean }
/** href: an HQ route (decisions/Campaigns) or an https:// Airtable record link. */
export interface DLink { label: string; href: string }
export interface DNote { level: 'bad' | 'warn' | 'info'; problem: string; data: string; fix: string; why: string; owner: Owner }
export interface Tiles { healthy: number; watch: number; sick: number; resting: number; total: number }
export interface Replacement { id: string; status: string; action: string; reason: string; score: number | null; created: string; error: string; decisionId: string; accountIds: string[]; domainIds: string[]; clientKey: string; title: string }
export interface InboxRow {
  id: string; email: string; domain: string; domainId: string; client: string; clientKey: string; status: Health; reasons: Reason[]; doing: string;
  score: number | null; scoreAt: string; google: number | null; outlook: number | null; warmup: number | null; warmupOn: boolean | null; connection: string;
  bounce: number | null; contacted: number; dailyLimit: number | null; previousLimit: number | null; stage: string; restStarted: string; retestFriday: string; campaigns: number; links: DLink[];
}
export interface DomainRow {
  id: string; name: string; client: string; clientKey: string; status: Health; reasons: Reason[]; doing: string; inboxes: number; emails: string[];
  renewal: string; daysToRenewal: number | null; purchaseStatus: string; blacklist: string; blacklistCount: number; lastBlacklistCheck: string; monitoring: string;
  placement: number | null; provider: string; replacement: Replacement | null; links: DLink[];
}
export interface Item { key: string; kind: 'inbox' | 'domain'; status: Health; title: string; client: string; clientKey: string; reason: string; reasons: Reason[]; owner: Owner; doing: string; links: DLink[]; inboxes?: number }
export interface Freshness { newest: string; ageDays: number | null; stale: boolean; expectedFriday: string; fridayMissing: boolean; nextFriday: string; tests: number }
export interface EngineRun { kind: string; status: string; at: string; message: string; dryRun: boolean }
export interface EngineState { healthLoop: { everyMin: number; live: boolean; from: string }; runs: EngineRun[] }

const DAY = 86_400_000;
const s = (x: unknown): string => val(x);
const num = (x: unknown): number | null => { const t = val(x); const v = Number(t); return t !== '' && Number.isFinite(v) ? v : null; };
const links = (x: unknown): string[] => (Array.isArray(x) ? x.map((y) => (typeof y === 'string' ? y : (y as any)?.id)).filter(Boolean) : []);
const multi = (x: unknown): string[] => (Array.isArray(x) ? x.map(val).filter(Boolean) : val(x) ? [val(x)] : []);
const RANK: Record<Health, number> = { sick: 0, resting: 1, watch: 2, healthy: 3 };
export const worst = (a: Health, b: Health): Health => (RANK[a] <= RANK[b] ? a : b);

/* ---------- Dates (New York, where Alex works and the Friday tests run) ---------- */
export const nyDate = (iso: string | number | Date): string => new Date(iso).toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
const addDays = (d: string, n: number) => new Date(Date.parse(`${d}T12:00:00Z`) + n * DAY).toISOString().slice(0, 10);
const weekday = (d: string) => new Date(`${d}T12:00:00Z`).getUTCDay();
/** The first Friday on or after a date (YYYY-MM-DD). Pure. */
export function fridayOnOrAfter(d: string): string { return addDays(d, (5 - weekday(d) + 7) % 7); }
/** "11-24" (how Alex writes dates). */
export const md = (d: string) => (d ? d.slice(5, 10) : '');
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
  return {
    newest, ageDays, stale: ageDays === null || ageDays > LIMITS.staleDays, expectedFriday: f,
    fridayMissing: !newest || newest < f, nextFriday: fridayOnOrAfter(today), tests,
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
    out.push({ level: 'bad', owner: 'Riley', problem: `Friday ${md(f.expectedFriday)}'s placement scores are missing.`, data: `${newest}${noneSinceAudit ? ` ${writer}` : ''}`, fix: fixIt, why });
  } else if (noneSinceAudit) {
    const healthFrom = opts.healthFrom ? nyDate(opts.healthFrom) : '';
    out.push({
      level: 'warn', owner: 'Riley', problem: `Friday ${md(since)}'s placement scores may not arrive.`,
      data: `${newest} ${writer}${healthFrom && f.newest && f.newest < healthFrom ? ` The health loop only reads tests from ${md(healthFrom)}, so it needs Friday ${md(since)}'s.` : ''}`,
      fix: `Riley: confirm the workflow runs before Friday ${md(since)}.`, why,
    });
  }
  if (!opts.loopOn) out.push({ level: 'info', owner: 'Riley', problem: 'The account health loop is off on the server.', data: 'ACCOUNT_HEALTH_EVERY_MIN is 0: no inbox is rested, recovered or replaced automatically.', fix: 'Alex: set ACCOUNT_HEALTH_EVERY_MIN (e.g. 60) when ready.', why: 'RULES 2026-11-25: resting and recovering are automatic.' });
  return out;
}

/* ---------- The facts of one inbox and one domain ---------- */
export interface TestFacts { id: string; email: string; score: number | null; google: number | null; outlook: number | null; at: string; processed: boolean; outcome: string; error: string }
export interface InboxFacts {
  stage: string; airtableStatus: string; score: number | null; scoreAt: string; test: TestFacts | null;
  connection: string; warmupOn: boolean | null; warmupScore: number | null; warmupDisable: string;
  bounced: number; contacted: number; protocolError: string;
}
export interface DomainFacts { blacklist: string; blacklistCount: number; found: string; monitoring: string; health: string; renewal: string; purchaseStatus: string }

/** An inbox's own reasons (not its domain's). Pure. */
export function inboxReasons(a: InboxFacts): Reason[] {
  const out: Reason[] = [];
  const stage = a.stage;
  if (/^Replace/.test(stage)) out.push({ code: 'replace', level: 'sick', owner: 'Atlas', text: stage === 'Replace Inbox' ? 'Failed its retest: replace the inbox' : 'Failed its retest: replace the domain' });
  if (stage === 'Manual Review') out.push({ code: 'manual', level: 'sick', owner: 'Atlas', text: 'Manual review' });
  if (a.score !== null && !/^Replace/.test(stage)) {
    if (a.score < LIMITS.placementRest) out.push({ code: 'placement', level: 'sick', owner: 'Atlas', text: `Placement ${a.score}%${a.scoreAt ? ` (${md(a.scoreAt)})` : ''}` });
    else if (a.score < LIMITS.placementWatch) out.push({ code: 'placement', level: 'watch', owner: 'Atlas', text: `Placement ${a.score}%${a.scoreAt ? ` (${md(a.scoreAt)})` : ''}` });
  }
  if (a.connection && a.connection.toLowerCase() !== 'connected') out.push({ code: 'disconnected', level: 'sick', owner: 'Riley', text: /^disconnected$/i.test(a.connection) ? 'Disconnected' : `Disconnected (${a.connection})` });
  if (/causing bounces/i.test(a.warmupDisable)) out.push({ code: 'warmup', level: 'sick', owner: 'Atlas', text: 'Warm-up stopped: it caused bounces' });
  else if (a.warmupDisable) out.push({ code: 'warmup', level: 'watch', owner: 'Atlas', text: 'Warm-up paused: it received bounces' });
  else if (a.warmupOn === false) out.push({ code: 'warmup', level: 'watch', owner: 'Atlas', text: 'Warm-up off' });
  if (a.warmupScore !== null && !out.some((r) => r.code === 'warmup' && r.level === 'sick')) {
    if (a.warmupScore < LIMITS.warmupSick) out.push({ code: 'warmupScore', level: 'sick', owner: 'Atlas', text: `Warm-up score ${a.warmupScore}` });
    else if (a.warmupScore < LIMITS.warmupWatch) out.push({ code: 'warmupScore', level: 'watch', owner: 'Atlas', text: `Warm-up score ${a.warmupScore}` });
  }
  const rate = a.contacted >= LIMITS.bounceMinContacted ? Math.round((a.bounced / a.contacted) * 1000) / 10 : null;
  if (rate !== null && rate > LIMITS.bounceSick) out.push({ code: 'bounce', level: 'sick', owner: 'Atlas', text: `Bounce ${rate}% (${a.bounced} of ${a.contacted.toLocaleString('en-US')})` });
  else if (rate !== null && rate > LIMITS.bounceWatch) out.push({ code: 'bounce', level: 'watch', owner: 'Atlas', text: `Bounce ${rate}% (${a.bounced} of ${a.contacted.toLocaleString('en-US')})` });
  if (a.airtableStatus === 'Spam' && !out.some((r) => r.level === 'sick')) out.push({ code: 'airtable', level: 'sick', owner: 'Atlas', text: 'Marked Spam in Airtable' });
  else if (a.airtableStatus === 'At Risk' && !out.length) out.push({ code: 'airtable', level: 'watch', owner: 'Atlas', text: 'Marked At Risk in Airtable' });
  if (a.protocolError) out.push({ code: 'loopError', level: 'watch', owner: 'Riley', text: `Health loop error: ${a.protocolError.slice(0, 120)}` });
  if (a.test && a.test.outcome === 'Failed') out.push({ code: 'loopError', level: 'watch', owner: 'Riley', text: `Health loop could not read its test: ${(a.test.error || 'no reason given').slice(0, 120)}` });
  return out;
}

/** A domain's reasons (blacklist, monitoring, expiry). Pure. */
export function domainReasons(d: DomainFacts, now: Date): Reason[] {
  const out: Reason[] = [];
  if (d.blacklist === 'Listed' || d.blacklistCount > 0) out.push({ code: 'blacklist', level: 'sick', owner: 'Atlas', text: `Blacklisted${d.blacklistCount ? ` on ${d.blacklistCount}` : ''}${d.found ? `: ${d.found.replace(/\s+/g, ' ').slice(0, 80)}` : ''}` });
  else if (d.health === 'Blacklisted') out.push({ code: 'blacklist', level: 'sick', owner: 'Atlas', text: 'Blacklisted (Domain Health)' });
  else if (d.blacklist === 'Check Failed') out.push({ code: 'blacklistCheck', level: 'watch', owner: 'Riley', text: 'Blacklist check failed' });
  if (['Error', 'Needs Attention'].includes(d.monitoring)) out.push({ code: 'monitoring', level: 'watch', owner: 'Riley', text: `EmailGuard monitoring: ${d.monitoring}` });
  if (d.health === 'At Risk' && !out.some((r) => r.code === 'blacklist')) out.push({ code: 'domainHealth', level: 'watch', owner: 'Atlas', text: 'Domain Health: At Risk' });
  if (d.renewal && d.purchaseStatus !== 'Cancelled') {
    const days = daysBetween(nyDate(now), d.renewal.slice(0, 10));
    if (days < 0) out.push({ code: 'expired', level: 'sick', owner: 'Atlas', text: `Expired ${md(d.renewal)}` });
    else if (days <= LIMITS.expirySoonDays) out.push({ code: 'expiring', level: 'watch', owner: 'Atlas', text: `Expires in ${days} day${days === 1 ? '' : 's'} (${md(d.renewal)})` });
  }
  return out;
}

/** Reasons the rest itself is the fix for: while resting, these do not make the inbox "sick". */
const COVERED_BY_REST = new Set(['placement', 'bounce', 'airtable']);
/** Healthy / watch / sick / resting from the reasons. Pure. */
export function statusOf(reasons: Reason[], resting: boolean): Health {
  const open = reasons.filter((r) => !(resting && COVERED_BY_REST.has(r.code)));
  if (open.some((r) => r.level === 'sick')) return 'sick';
  if (resting) return 'resting';
  if (open.some((r) => r.level === 'watch')) return 'watch';
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
    return `Rested ${a.restStarted ? md(nyDate(a.restStarted)) : 'UNKNOWN date'}, retest Fri ${fri ? md(fri) : 'UNKNOWN'}${limit}.`;
  }
  if (a.stage === 'Manual Review') return 'Waiting for a person (Manual Review). Nothing automatic.';
  const placement = reasons.find((r) => r.code === 'placement' && r.level === 'sick');
  if (placement) {
    if (!ctx.loopOn) return 'Health loop is off on the server: nothing automatic.';
    const t = a.test;
    if (t && ctx.healthFrom && Date.parse(t.at) < Date.parse(ctx.healthFrom)) return `Test is from before the health loop started (${md(nyDate(ctx.healthFrom))}): Friday's test decides.`;
    if (t?.processed && t.outcome === 'Failed') return 'Health loop could not process its test.';
    if (t && !t.processed) return `Health loop rests it on its next run${dry}.`;
    return `Waiting for the next placement test${dry}.`;
  }
  const top = reasons.find((r) => r.level === 'sick') ?? reasons[0];
  if (!top) return '';
  if (top.code === 'disconnected') return 'Nothing automatic: reconnect it in EmailBison.';
  if (top.code === 'bounce') return 'Not rested: the bounce agent rests an inbox only when it causes a campaign\'s bounces.';
  if (top.code === 'loopError') return 'The health loop stopped on it.';
  return 'Nothing automatic yet.';
}

export function domainDoing(reasons: Reason[], replacement: Replacement | null): string {
  if (replacement) return replacement.status === 'Pending Review' ? 'Replacement waiting for your OK in Decisions.' : `Replacement ${replacement.status.toLowerCase()}.`;
  const top = reasons.find((r) => r.level === 'sick') ?? reasons[0];
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
  queue: AirtableRecord[]; purchases: AirtableRecord[]; decisions: DecisionCard[]; runs: EngineRun[]; readAt: string;
}

type TestsPart = Pick<DelivSource, 'tests' | 'newestTest'>;
function readTests(at: HqAirtable): Promise<TestsPart> {
  return Promise.all([
    at.list(PLACEMENT, `AND({Overall Score}!='',IS_AFTER(CREATED_TIME(),DATEADD(NOW(),-${TEST_WINDOW_DAYS},'days')))`, TEST_FIELDS, 8000, { sortField: 'Test Date', sortDesc: true }),
    at.list(PLACEMENT, `{Overall Score}!=''`, [PT.email, PT.overall], 1, { sortField: 'Test Date', sortDesc: true }).then((r) => r[0] ?? null),
  ]).then(([tests, newestTest]) => ({ tests, newestTest }));
}

export async function readDelivSource(at: HqAirtable, db: Db, tests?: Promise<TestsPart>): Promise<DelivSource> {
  const [ws, accounts, domains, t, queue, purchases, decisions, runs] = await Promise.all([
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
  ]);
  // The formulas already filter; filtered again here so a wider copy of the rows never shows.
  return { ws, accounts, domains, tests: t.tests, newestTest: t.newestTest, queue: queue.filter((q) => !['Completed', 'Rejected'].includes(s(q.fields[SQ.status]))), purchases: purchases.filter((p) => !['Completed', 'Failed'].includes(s(p.fields[DPR.status]))), decisions, runs, readAt: new Date().toISOString() };
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
  const data = readDelivSource(at, db, testsCache.data);
  cache = { at: now, data };
  data.catch(() => { if (cache?.data === data) cache = null; });
  return data;
}

/* ---------- Build (pure) ---------- */
export interface DelivModel {
  inboxes: InboxRow[]; domains: DomainRow[]; items: Item[]; replacements: Replacement[];
  clients: { key: string; name: string; tiles: Tiles; domains: number }[]; tiles: Tiles;
  tests: (TestFacts & { clientKey: string; client: string; domain: string })[]; freshness: Freshness; notes: DNote[]; engine: EngineState;
  hidden: { inactiveInboxes: number; noClientInboxes: number }; dataNotes: DNote[]; readAt: string;
}

/** Data gaps in Airtable that make this screen less sure (for Atlas to fix). Pure. */
export function dataNotes(inboxes: Pick<InboxRow, 'clientKey' | 'domainId'>[], domains: Pick<DomainRow, 'id' | 'clientKey' | 'renewal' | 'inboxes'>[]): DNote[] {
  const out: DNote[] = [];
  const recs = domains.filter((d) => d.id && d.clientKey !== 'none');
  const noRenewal = recs.filter((d) => !d.renewal).length;
  if (noRenewal) out.push({ level: 'info', owner: 'Atlas', problem: `No renewal date on ${noRenewal} of ${recs.length} domains.`, data: 'Domains "Renewal Date" is empty, so expiry is UNKNOWN for them.', fix: 'Atlas: fill Renewal Date from the domain provider.', why: 'HQ can only warn before a domain expires when the date is there.' });
  const unlinked = inboxes.filter((i) => i.clientKey !== 'none' && !i.domainId).length;
  if (unlinked) out.push({ level: 'info', owner: 'Atlas', problem: `${unlinked} inbox${unlinked === 1 ? ' has' : 'es have'} no Domains record.`, data: 'Email Accounts "Domains" is empty and no Domains record has that name; they are grouped by the email\'s domain.', fix: 'Atlas: add or link the Domains records.', why: 'Blacklist and expiry are read from the Domains record.' });
  const notTwo = recs.filter((d) => d.inboxes !== 2).length;
  if (notTwo) out.push({ level: 'info', owner: 'Atlas', problem: `${notTwo} domain${notTwo === 1 ? '' : 's'} without exactly 2 inboxes.`, data: 'RULES 2026-11-25: every domain has 2 accounts.', fix: 'Atlas: check them in the Domains tab (the "Inboxes" number is marked).', why: 'Uneven domains change the sending and the replacement math.' });
  return out;
}

const airtableUrl = (base: string, table: string, rec: string) => `https://airtable.com/${base}/${table}/${rec}`;
const domainOf = (email: string) => email.split('@')[1]?.toLowerCase().trim() ?? '';
const emptyTiles = (): Tiles => ({ healthy: 0, watch: 0, sick: 0, resting: 0, total: 0 });

export function buildDeliverability(src: DelivSource, cfg: Pick<Config, 'airtableBaseId' | 'accountHealthEveryMin' | 'accountHealthFrom' | 'dryRun' | 'liveStages'>, now = new Date()): DelivModel {
  const base = cfg.airtableBaseId;
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
    };
  }).filter((t) => t.email && t.at && Date.parse(t.at) >= now.getTime() - TEST_WINDOW_DAYS * DAY).sort((a, b) => b.at.localeCompare(a.at));
  const latestTest = new Map<string, (typeof tests)[number]>();
  for (const t of tests) if (!latestTest.has(t.email)) latestTest.set(t.email, t);
  const newestIso = tests[0]?.at || (src.newestTest ? src.newestTest.createdTime ?? s(src.newestTest.fields[PT.testDate]) : '');
  const freshness = placementFreshness(newestIso, now, tests.length);

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
  const hidden = { inactiveInboxes: 0, noClientInboxes: 0 };
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
    };
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
      links: [...decisionLink(replacement), { label: 'Airtable', href: airtableUrl(base, ACCOUNTS, a.id) }],
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
    if (c && !c.active && !mine.length) continue;
    if (!c && !mine.length) continue;
    seen.add(d.id);
    const reasons = domainReasonsOf(d);
    const replacement = replacementOfDomain.get(d.id) ?? mine.map((i) => replacementOfAccount.get(i.id)).find(Boolean) ?? null;
    const renewal = s(f[DX.renewal]).slice(0, 10);
    domains.push({
      id: d.id, name: name || mine[0]?.domain || 'UNKNOWN', client: c?.name ?? 'No client', clientKey: c?.key ?? 'none', status: statusOf(reasons, false), reasons, doing: domainDoing(reasons, replacement),
      inboxes: mine.length, emails: mine.map((i) => i.email).sort(), renewal, daysToRenewal: renewal ? daysBetween(nyDate(now), renewal) : null, purchaseStatus: s(f[DX.purchaseStatus]),
      blacklist: s(f[DM.blacklistStatus]), blacklistCount: num(f[DM.blacklistCount]) ?? 0, lastBlacklistCheck: s(f[DM.lastBlacklistCheck]), monitoring: s(f[DX.monitoring]),
      placement: num(f[DX.placement]), provider: s(f[DX.inboxProvider]) || s(f[DX.provider]), replacement,
      links: [...decisionLink(replacement), { label: 'Airtable', href: airtableUrl(base, DOMAINS, d.id) }],
    });
  }
  for (const [k, mine] of inboxesOf) {
    if (!k.startsWith('name:') || domainByName.has(k.slice(5))) continue;
    domains.push({
      id: '', name: k.slice(5) || 'UNKNOWN', client: mine[0].client, clientKey: mine[0].clientKey, status: 'healthy', reasons: [], doing: '', inboxes: mine.length, emails: mine.map((i) => i.email).sort(),
      renewal: '', daysToRenewal: null, purchaseStatus: '', blacklist: '', blacklistCount: 0, lastBlacklistCheck: '', monitoring: '', placement: null, provider: '', replacement: null, links: [],
    });
  }
  domains.sort((a, b) => RANK[a.status] - RANK[b.status] || a.client.localeCompare(b.client) || a.name.localeCompare(b.name));

  // Needs attention: one line per sick/resting/watch thing. A domain problem is one line for the domain (not one per inbox).
  const items: Item[] = [];
  for (const d of domains) {
    if (d.status === 'healthy' || d.clientKey === 'none') continue;
    items.push({ key: `domain:${d.id || d.name}`, kind: 'domain', status: d.status, title: d.name, client: d.client, clientKey: d.clientKey, reason: d.reasons.map((r) => r.text).join(' · '), reasons: d.reasons, owner: topOwner(d.reasons), doing: d.doing, links: d.links, inboxes: d.inboxes });
  }
  for (const i of inboxes) {
    if (i.clientKey === 'none') continue;
    const own = i.reasons.filter((r) => !r.fromDomain);
    const st = statusOf(own, i.stage === 'Resting 7 Days');
    if (st === 'healthy') continue;
    const shown = st === 'resting' ? own.filter((r) => COVERED_BY_REST.has(r.code) || r.level === 'watch') : own;
    const reason = (st === 'resting' ? [`Resting${shown.length ? `: ${shown.map((r) => r.text).join(' · ')}` : ''}`] : shown.map((r) => r.text)).join(' · ');
    items.push({ key: `inbox:${i.id}`, kind: 'inbox', status: st, title: i.email, client: i.client, clientKey: i.clientKey, reason, reasons: own, owner: topOwner(own), doing: i.doing, links: i.links });
  }
  items.sort((a, b) => RANK[a.status] - RANK[b.status] || a.client.localeCompare(b.client) || Number(a.kind === 'inbox') - Number(b.kind === 'inbox') || a.title.localeCompare(b.title));

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
  const clients = [...perClient.values()].sort((a, b) => b.tiles.sick - a.tiles.sick || b.tiles.resting - a.tiles.resting || a.name.localeCompare(b.name));

  const notes = freshnessNotes(freshness, { healthFrom: cfg.accountHealthFrom, loopOn });
  return {
    inboxes, domains, items, replacements, clients, tiles,
    tests: tests.filter((t) => t.active).map(({ active: _a, ...t }) => t), freshness, notes,
    engine: { healthLoop: { everyMin: cfg.accountHealthEveryMin, live, from: cfg.accountHealthFrom }, runs: src.runs }, hidden, dataNotes: dataNotes(inboxes, domains), readAt: src.readAt,
  };
}

function topOwner(reasons: Reason[]): Owner {
  return (reasons.find((r) => r.level === 'sick') ?? reasons[0])?.owner ?? 'Atlas';
}

/* ---------- Views (what each tab gets) ---------- */
type Cfg = Parameters<typeof buildDeliverability>[1];
const matchClient = (key: string, client?: string) => !client || key === client;

/** GET /deliverability: Needs attention (tiles, items, notes, engine). */
export function attentionView(m: DelivModel, client?: string) {
  const items = m.items.filter((i) => matchClient(i.clientKey, client));
  const c = client ? m.clients.find((x) => x.key === client) : null;
  return {
    tiles: c ? c.tiles : m.tiles, clients: m.clients, client: client ?? '',
    items, counts: { sick: items.filter((i) => i.status === 'sick').length, resting: items.filter((i) => i.status === 'resting').length, watch: items.filter((i) => i.status === 'watch').length },
    notes: m.notes, freshness: m.freshness, engine: m.engine, replacementsWaiting: m.replacements.filter((r) => r.status === 'Pending Review' && matchClient(r.clientKey, client)).length,
    hidden: m.hidden, readAt: m.readAt,
  };
}

export const INBOX_GROUP_CAP = 400;
/** GET /deliverability/inboxes: search + client + status, grouped by domain (worst first). */
export function inboxesView(m: DelivModel, opts: { client?: string; q?: string; status?: string }) {
  const q = String(opts.q ?? '').trim().toLowerCase().slice(0, 100);
  const status = ['healthy', 'watch', 'sick', 'resting'].includes(String(opts.status)) ? (opts.status as Health) : null;
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
  const level = (x: number | null): Health => (x === null ? 'healthy' : x < LIMITS.placementRest ? 'sick' : x < LIMITS.placementWatch ? 'watch' : 'healthy');
  const clients = [...byClient.values()].map((c) => {
    const domains = [...c.domains.values()].map((d) => {
      const scores = d.inboxes.map((i) => i.score).filter((x): x is number => x !== null);
      const score = scores.length ? Math.min(...scores) : null;
      return { domain: d.domain, at: d.at, date: nyDate(d.at), score, status: level(score), inboxes: d.inboxes.sort((a, b) => (a.score ?? 101) - (b.score ?? 101)) };
    }).sort((a, b) => (a.score ?? 101) - (b.score ?? 101) || a.domain.localeCompare(b.domain));
    const age = c.newest ? Math.floor((Date.parse(m.readAt) - Date.parse(c.newest)) / DAY) : null;
    return { key: c.key, name: c.name, newest: c.newest ? nyDate(c.newest) : '', ageDays: age, stale: age === null || age > LIMITS.staleDays, sick: domains.filter((d) => d.status === 'sick').length, domains };
  }).sort((a, b) => b.sick - a.sick || a.name.localeCompare(b.name));
  // Active clients with inboxes but no test in the window.
  const untested = m.clients.filter((c) => !byClient.has(c.key) && matchClient(c.key, client)).map((c) => ({ key: c.key, name: c.name, inboxes: c.tiles.total }));
  return { freshness: m.freshness, notes: m.notes.filter((n) => n.owner === 'Riley'), clients, untested, windowDays: TEST_WINDOW_DAYS, limits: { rest: LIMITS.placementRest, watch: LIMITS.placementWatch }, readAt: m.readAt };
}

/** GET /deliverability/domains: domains per client (inbox count, expiry, blacklist), replacements and open purchase requests. */
export function domainsView(m: DelivModel, src: Pick<DelivSource, 'purchases'>, cfg: Pick<Cfg, 'airtableBaseId'>, client?: string) {
  const list = m.domains.filter((d) => d.clientKey !== 'none' && matchClient(d.clientKey, client));
  const byClient = new Map<string, { key: string; name: string; domains: DomainRow[] }>();
  for (const d of list) { const c = byClient.get(d.clientKey) ?? { key: d.clientKey, name: d.client, domains: [] }; c.domains.push(d); byClient.set(d.clientKey, c); }
  const clientName = new Map(m.clients.map((c) => [c.key, c.name]));
  const purchases = src.purchases.map((p) => {
    const f = p.fields;
    return {
      id: p.id, request: s(f[DPR.request]) || 'Purchase request', status: s(f[DPR.status]) || 'Draft', domains: num(f[DPR.count]), mailboxes: num(f[DPR.mailboxes]), provider: s(f[DPR.provider]),
      approved: f[DPR.approve] === true, error: s(f[DPR.error]).slice(0, 300), created: p.createdTime ?? '', clients: links(f[DPR.client]),
      link: { label: 'Airtable', href: airtableUrl(cfg.airtableBaseId, PURCHASES, p.id) },
    };
  });
  return {
    clients: [...byClient.values()].map((c) => ({ ...c, inboxes: c.domains.reduce((a, d) => a + d.inboxes, 0), notTwo: c.domains.filter((d) => d.id && d.inboxes !== 2).length })).sort((a, b) => a.name.localeCompare(b.name)),
    replacements: m.replacements.filter((r) => matchClient(r.clientKey, client)).map((r) => ({ ...r, client: clientName.get(r.clientKey) ?? '', link: r.status === 'Pending Review' ? { label: r.decisionId ? 'Decide' : 'Decisions', href: `decisions/${pileFor('Atlas')}` } : { label: 'Airtable', href: airtableUrl(cfg.airtableBaseId, QUEUE, r.id) } })),
    purchases, notes: m.dataNotes, rule: 'Every domain has 2 inboxes (RULES 2026-11-25).', readAt: m.readAt,
  };
}

/** One entry point for the routes: view = attention | inboxes | placement | domains. */
export async function deliverabilityView(at: HqAirtable, db: Db, cfg: Cfg, view: string, params: URLSearchParams) {
  const src = await cachedDeliv(at, db, params.get('refresh') === '1');
  const m = buildDeliverability(src, cfg);
  const client = (params.get('client') ?? '').toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 80) || undefined;
  if (view === 'inboxes') return inboxesView(m, { client, q: params.get('q') ?? '', status: params.get('status') ?? '' });
  if (view === 'placement') return placementView(m, client);
  if (view === 'domains') return domainsView(m, src, cfg, client);
  return attentionView(m, client);
}

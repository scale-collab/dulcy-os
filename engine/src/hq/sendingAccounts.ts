// The sender summary at the top of Campaigns, shown the way the Airtable Campaign Center shows it
// (HQ round 4, Alex 2026-11-28: "Simply show it the same way I have it in Airtable."; RULES 2026-11-28 (6)).
// Ported from the Campaign Center screen code saved on 2026-11-23
// (airtable/custom-elements/campaign-center/source.tsx: campaignSenderState, emailAccountState and the
// sender chips under the filters). Its chips, names and order:
//   Available · Sending · Releasing Soon · Reserved Next · Disconnected · Warming · "N total senders".
// One state per inbox, first match wins:
//   Disconnected   email_status is not "Connected".
//   Sending        in a live campaign (status Active / Live / Running / Paused, or Workflow Stage
//                  Live / Running / Paused; not finished) that is under 60% sent.
//   Reserved Next  in a campaign that is not live and not finished but queued: status Uploaded /
//                  Scheduled, or Workflow Stage Launch Ready / Build Ready / Uploaded / Scheduled /
//                  Queued / Waiting for Senders.
//   Releasing Soon only in live campaigns that are 60%+ sent.
//   Warming        Warmup Start Date less than 14 days ago (and in no campaign above).
//   Available      everything else (warmed and free now).
// Warming is also a separate label, as in Airtable: its count includes warming inboxes that are already
// Sending or Reserved Next ("Warming is a separate label and can overlap"). Spam / replace and at risk are
// not part of this summary (Alex: "that's not the point of this section"); they stay on Deliverability.
// Not ported: Airtable also reserves a top-up's inboxes while its upload is pending and skips split parents.
// Daily capacity: the cold daily limits of connected inboxes vs the limits of the inboxes sending now.
// Read only.
import type { Db } from '../db/pool.js';
import type { HqAirtable } from './decisions.js';
import type { AirtableRecord } from '../providers/airtable.js';
import { ACCOUNTS } from '../stages/accountHealth.js';
import { buildDeliverability, cachedDeliv, TEST_WINDOW_DAYS, type InboxRow } from './deliverability.js';
import { cachedCampaigns, clientIndex, factsOf, type InboxLite } from './campaigns.js';

export type Bucket = 'available' | 'sending' | 'releasing' | 'reserved' | 'disconnected' | 'warming';
export const BUCKETS: { key: Bucket; label: string; help: string }[] = [
  { key: 'available', label: 'Available', help: 'Warmed and free now: connected, in no live or queued campaign.' },
  { key: 'sending', label: 'Sending', help: 'In a live campaign that is under 60% sent.' },
  { key: 'releasing', label: 'Releasing Soon', help: 'Only in live campaigns that are at least 60% sent: free again soon.' },
  { key: 'reserved', label: 'Reserved Next', help: 'Already given to an upcoming campaign (built or launch ready): not free for another one.' },
  { key: 'disconnected', label: 'Disconnected', help: 'EmailBison says the inbox is not connected.' },
  { key: 'warming', label: 'Warming', help: 'Warm-up started less than 14 days ago. A separate label: it can overlap Sending or Reserved Next.' },
];
/** Airtable: warming = warm-up started under 14 days ago. */
export const WARMING_DAYS = 14;
/** Airtable: a live campaign at 60%+ sent is "Releasing Soon". */
export const RELEASE_AT = 0.6;
/** Email Accounts → Warmup Start Date. */
export const WARMUP_START = 'fldURrj0qP1DnAKyD';
const DAY = 86_400_000;

export interface AccountCampaign { id: string; name: string; status: string; stage?: string; progress?: number; clientKey: string; accountIds: string[] }
export interface Placement { text: string; why: string }
export interface AccountLine {
  id: string; email: string; bucket: Bucket; warming: boolean; status: InboxRow['status']; dailyLimit: number | null; warmupLimit: number | null; warmup: number | null;
  score: number | null; scoreAt: string; placement: Placement; bounce: number | null; contacted: number; warmupOff: boolean; campaigns: string[]; note: string;
}
export interface SendingBox {
  client: string; clientKey: string; total: number; counts: Record<Bucket, number>;
  capacity: { total: number; used: number; free: number; ready: number };
  alert: string; accounts: AccountLine[];
}

/** One campaign as the Airtable screen reads it for its senders. Pure. */
export function campaignSenderState(c: Pick<AccountCampaign, 'status' | 'stage' | 'progress'>): { finished: boolean; sending: boolean; releasing: boolean; queued: boolean } {
  const status = c.status.trim().toLowerCase(); const stage = (c.stage ?? '').trim().toLowerCase();
  const p = c.progress ?? 0; const progress = p > 1 ? p / 100 : p;
  const finished = progress >= 1 || ['complete', 'completed', 'inactive', 'finished', 'ended'].includes(status);
  const operational = !finished && (['active', 'live', 'running', 'paused'].includes(status) || ['live', 'running', 'paused'].includes(stage));
  const queued = !finished && !operational && (['uploaded', 'scheduled'].includes(status) || ['launch ready', 'build ready', 'uploaded', 'scheduled', 'queued', 'waiting for senders'].includes(stage));
  return { finished, sending: operational && progress < RELEASE_AT, releasing: operational && progress >= RELEASE_AT, queued };
}

const connected = (c: string) => /^connected$/i.test(c.trim());
/** One inbox → its Airtable state (first match wins). Pure. */
export function bucketOf(i: Pick<InboxRow, 'connection'>, w: { sending: boolean; queued: boolean; releasing: boolean; warming: boolean }): Bucket {
  if (!connected(i.connection)) return 'disconnected';
  if (w.sending) return 'sending';
  if (w.queued) return 'reserved';
  if (w.releasing) return 'releasing';
  return w.warming ? 'warming' : 'available';
}

/** Warming by the Warmup Start Date: under 14 days ago (a future date or no date = not warming). Pure. */
export function isWarming(start: string | undefined, now = Date.now()): boolean {
  if (!start) return false;
  const t = Date.parse(start.length === 10 ? `${start}T12:00:00Z` : start);
  if (!Number.isFinite(t)) return false;
  const age = (now - t) / DAY;
  return age >= 0 && age < WARMING_DAYS;
}

const md = (iso: string) => { const m = /^\d{4}-(\d{2})-(\d{2})/.exec(iso); return m ? `${Number(m[1])}/${Number(m[2])}` : ''; };
/**
 * The placement cell, never a blank (round 4, Alex: "why doesn't every one of these inboxes have a
 * placement score?"). The weekly test does not cover every inbox every week (on 11/27 it tested 947 of
 * the 1,100 active inboxes; 151 of Dulcy's 380 were left out), so HQ shows the newest score of the last
 * 21 days with its date, says when the inbox was not in the client's latest test, and says "Not tested"
 * when there is no test in 21 days. Pure.
 */
export function placementOf(i: Pick<InboxRow, 'score' | 'scoreAt'>, lastTest: string): Placement {
  if (i.score === null) return { text: 'Not tested', why: `No inbox placement test for this inbox in the last ${TEST_WINDOW_DAYS} days: the weekly test did not include it.` };
  const pct = `${Math.round(i.score)}%`;
  if (!i.scoreAt) return { text: pct, why: `From an older test (over ${TEST_WINDOW_DAYS} days ago, Email Accounts → Last Inbox Placement Score): not in the recent weekly tests.` };
  if (lastTest && i.scoreAt < lastTest) return { text: `${pct} · ${md(i.scoreAt)}`, why: `Not in the ${md(lastTest)} test: this is its ${md(i.scoreAt)} score.` };
  return { text: pct, why: `Tested ${md(i.scoreAt)}.` };
}
/** The newest test date per client (from the inboxes' own scores). Pure. */
export function lastTestByClient(inboxes: Pick<InboxRow, 'clientKey' | 'scoreAt'>[]): Map<string, string> {
  const out = new Map<string, string>();
  for (const i of inboxes) if (i.scoreAt && i.scoreAt > (out.get(i.clientKey) ?? '')) out.set(i.clientKey, i.scoreAt);
  return out;
}

const emptyCounts = (): Record<Bucket, number> => ({ available: 0, sending: 0, releasing: 0, reserved: 0, disconnected: 0, warming: 0 });
const ORDER: Bucket[] = BUCKETS.map((b) => b.key);

/** The box for one client's inboxes (or all active clients' when clientKey is ''). Pure. */
export function sendingBox(inboxes: InboxRow[], campaigns: AccountCampaign[], opts: { clientKey: string; client: string; activeKeys: Set<string>; warmupStart?: Map<string, string>; now?: number }): SendingBox {
  const now = opts.now ?? Date.now();
  const mine = inboxes.filter((i) => (opts.clientKey ? i.clientKey === opts.clientKey : opts.activeKeys.has(i.clientKey)));
  const sendingIn = new Map<string, string[]>(); const queuedIn = new Map<string, string[]>(); const releasingIn = new Map<string, string[]>();
  for (const c of campaigns) {
    const st = campaignSenderState(c);
    const into = st.sending ? sendingIn : st.queued ? queuedIn : st.releasing ? releasingIn : null;
    if (!into) continue;
    for (const a of c.accountIds) into.set(a, [...(into.get(a) ?? []), c.name]);
  }
  const lastTest = lastTestByClient(inboxes);
  const counts = emptyCounts();
  const cap = { total: 0, used: 0, free: 0, ready: 0 };
  const accounts: AccountLine[] = mine.map((i) => {
    const s = sendingIn.get(i.id) ?? []; const q = queuedIn.get(i.id) ?? []; const r = releasingIn.get(i.id) ?? [];
    const warming = isWarming(opts.warmupStart?.get(i.id), now);
    const bucket = bucketOf(i, { sending: s.length > 0, queued: q.length > 0, releasing: r.length > 0, warming });
    // Airtable: every state counts once, except Warming, which is a label of its own.
    if (bucket !== 'warming') counts[bucket]++;
    if (warming) counts.warming++;
    const limit = i.dailyLimit ?? 0;
    if (bucket !== 'disconnected') cap.total += limit;
    if (bucket === 'sending' || bucket === 'releasing') cap.used += limit;
    if (bucket === 'available') cap.free += limit;
    if (bucket === 'reserved') cap.ready += limit;
    const health = i.status === 'resting' ? 'resting (spam protocol)' : i.status === 'spam' ? 'spam (Deliverability)' : '';
    const note = bucket === 'sending' && !limit ? '0 cold a day: sends nothing' : i.warmupOff ? 'warm-up OFF' : health;
    return {
      id: i.id, email: i.email, bucket, warming, status: i.status, dailyLimit: i.dailyLimit, warmupLimit: i.warmupLimit, warmup: i.warmup, score: i.score, scoreAt: i.scoreAt,
      placement: placementOf(i, lastTest.get(i.clientKey) ?? ''), bounce: i.bounce, contacted: i.contacted, warmupOff: i.warmupOff, campaigns: [...s, ...r, ...q], note,
    };
  }).sort((a, b) => ORDER.indexOf(a.bucket) - ORDER.indexOf(b.bucket) || a.email.localeCompare(b.email));
  const who = opts.client || 'these clients';
  const live = counts.sending + counts.releasing;
  const alert = !mine.length || live ? '' : counts.available ? `Nothing is sending for ${who}: ${counts.available} available inbox${counts.available === 1 ? '' : 'es'} could be.`
    : counts.reserved ? `Nothing is sending for ${who} yet: ${counts.reserved} inbox${counts.reserved === 1 ? ' is' : 'es are'} reserved for a campaign waiting for launch.`
      : `Nothing is sending for ${who}, and no inbox is available.`;
  return { client: opts.client, clientKey: opts.clientKey, total: mine.length, counts, capacity: cap, alert, accounts };
}

export interface ClientSendingLine { key: string; name: string; total: number; counts: Record<Bucket, number>; capacity: number; used: number }
/** One line per active client (the all-clients view), clients with nothing sending first. Pure. */
export function sendingByClient(inboxes: InboxRow[], campaigns: AccountCampaign[], clients: { key: string; name: string }[], warmupStart?: Map<string, string>, now?: number): ClientSendingLine[] {
  return clients.map((c) => {
    const b = sendingBox(inboxes, campaigns, { clientKey: c.key, client: c.name, activeKeys: new Set(), warmupStart, now });
    return { key: c.key, name: c.name, total: b.total, counts: b.counts, capacity: b.capacity.total, used: b.capacity.used };
  }).filter((x) => x.total > 0).sort((a, b) => Number(a.counts.sending + a.counts.releasing > 0) - Number(b.counts.sending + b.counts.releasing > 0) || a.name.localeCompare(b.name));
}

// ---------- reads ----------
/** Warmup Start Date per Email Accounts record, recent ones only (kept 5 minutes; it changes when inboxes are added). */
let warmCache: { at: number; data: Promise<Map<string, string>> } | null = null;
export function _resetWarmupCache() { warmCache = null; }
function warmupStarts(at: HqAirtable, refresh = false): Promise<Map<string, string>> {
  const now = Date.now();
  if (warmCache && now - warmCache.at < (refresh ? 10_000 : 5 * 60_000)) return warmCache.data;
  const data = at.list(ACCOUNTS, `IS_AFTER({Warmup Start Date},DATEADD(TODAY(),-${WARMING_DAYS + 1},'days'))`, [WARMUP_START], 3000)
    .then((rows: AirtableRecord[]) => new Map(rows.map((r) => [r.id, String(r.fields[WARMUP_START] ?? '')] as [string, string]).filter(([, d]) => !!d)));
  warmCache = { at: now, data };
  data.catch(() => { if (warmCache?.data === data) warmCache = null; });
  return data;
}

type DelivCfg = Parameters<typeof buildDeliverability>[1];
const accountCampaigns = (src: Awaited<ReturnType<typeof cachedCampaigns>>, ws: ReturnType<typeof clientIndex>): AccountCampaign[] =>
  src.campaigns.map(factsOf).map((c) => ({ id: c.id, name: c.name, status: c.status, stage: c.stage, progress: c.progress, clientKey: ws.get(c.clientRec)?.key ?? '', accountIds: c.accountIds }));

// ---------- GET /hq/api/campaigns/accounts?client= ----------
/** The box for the picked client (or every active client), plus one line per client in the all-clients view. */
export async function sendingAccountsView(at: HqAirtable, db: Db, cfg: DelivCfg, opts: { client?: string; refresh?: boolean } = {}) {
  const [deliv, src, warm] = await Promise.all([cachedDeliv(at, db, opts.refresh), cachedCampaigns(at, db, opts.refresh), warmupStarts(at, opts.refresh).catch(() => new Map<string, string>())]);
  const model = buildDeliverability(deliv, cfg);
  const ws = clientIndex(src.ws);
  const clients = [...new Map([...ws.values()].filter((c) => c.active).map((c) => [c.key, c])).values()];
  const activeKeys = new Set(clients.map((c) => c.key));
  const campaigns = accountCampaigns(src, ws);
  const client = opts.client && activeKeys.has(opts.client) ? opts.client : '';
  const name = clients.find((c) => c.key === client)?.name ?? '';
  const box = sendingBox(model.inboxes, campaigns, { clientKey: client, client: name, activeKeys, warmupStart: warm });
  return {
    ...box, buckets: BUCKETS, warmingDays: WARMING_DAYS,
    byClient: client ? [] : sendingByClient(model.inboxes, campaigns, clients.map((c) => ({ key: c.key, name: c.name })), warm),
    readAt: src.readAt,
  };
}

/** A campaign's sending inboxes (its Senders tab): the Deliverability facts plus the placement cell with its reason. Never throws: undefined when Deliverability cannot be read. */
export async function senderIndex(at: HqAirtable, db: Db, cfg: DelivCfg): Promise<Map<string, InboxLite> | undefined> {
  try {
    const m = buildDeliverability(await cachedDeliv(at, db), cfg);
    const last = lastTestByClient(m.inboxes);
    return new Map(m.inboxes.map((i) => [i.id, {
      status: i.status, warmupOff: i.warmupOff, email: i.email, dailyLimit: i.dailyLimit, warmupLimit: i.warmupLimit, warmup: i.warmup, score: i.score,
      scoreAt: i.scoreAt, placement: placementOf(i, last.get(i.clientKey) ?? ''),
    }]));
  } catch { return undefined; }
}

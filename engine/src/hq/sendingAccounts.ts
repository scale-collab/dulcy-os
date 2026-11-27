// Round 2 campaigns (Alex 2026-11-27): the "Sending accounts" box at the top of Campaigns. Alex:
// "'Sending accounts 10, all healthy' tells me nothing. I need to know what accounts are sending; we
// need to be sending at all times, and the stats."
// Every inbox of a client lands in ONE bucket, worst first:
//   spam / replace → resting → not connected → sending now (in an Active campaign) → ready next (in a
//   built, not yet launched campaign) → warming / new (warm-up score under 70) → at risk → free to use.
// "Free to use" is the same rule Atlas uses to give a new campaign its inboxes (RULES 2026-11-25,
// campaignPlan.freeInboxes): healthy or ungraded, connected, not resting or being replaced, warm-up
// 70+ when scored, not in an Active or Uploaded campaign.
// Daily capacity: the cold daily limits of the inboxes that can send (everything except spam,
// resting and not connected) vs the limits of the inboxes sending now. Read only.
import type { Db } from '../db/pool.js';
import type { HqAirtable } from './decisions.js';
import { buildDeliverability, cachedDeliv, type InboxRow } from './deliverability.js';
import { cachedCampaigns, clientIndex, factsOf } from './campaigns.js';

export type Bucket = 'sending' | 'ready' | 'free' | 'warming' | 'risk' | 'resting' | 'spam' | 'disconnected';
export const BUCKETS: { key: Bucket; label: string; help: string }[] = [
  { key: 'sending', label: 'Sending now', help: 'In a live (Active) campaign.' },
  { key: 'ready', label: 'Ready next', help: 'In a campaign that is built but not launched yet.' },
  { key: 'free', label: 'Free to use', help: 'Healthy, connected, warmed up and in no live or built campaign: a new campaign can use it.' },
  { key: 'warming', label: 'Warming / new', help: 'Warm-up score under 70: not ready to send cold email yet.' },
  { key: 'risk', label: 'At risk', help: 'Low placement or bounce signs: not given to a new campaign.' },
  { key: 'resting', label: 'Resting', help: 'Rested by the spam protocol (0 cold a day for a week, then retested).' },
  { key: 'spam', label: 'Spam / replace', help: 'Spam or being replaced.' },
  { key: 'disconnected', label: 'Not connected', help: 'EmailBison says the inbox is not connected.' },
];
/** Warm-up score under this = still warming (the same 70 as campaignPlan.freeInboxes). */
export const WARM_MIN = 70;

export interface AccountCampaign { id: string; name: string; status: string; clientKey: string; accountIds: string[] }
export interface AccountLine {
  id: string; email: string; bucket: Bucket; status: InboxRow['status']; dailyLimit: number | null; warmupLimit: number | null; warmup: number | null;
  score: number | null; bounce: number | null; contacted: number; warmupOff: boolean; campaigns: string[]; note: string;
}
export interface SendingBox {
  client: string; clientKey: string; total: number; counts: Record<Bucket, number>;
  capacity: { total: number; used: number; free: number; ready: number };
  alert: string; accounts: AccountLine[];
}

const LIVE = new Set(['Active']);
const BUILT = new Set(['Uploaded', 'Spintax Generated', 'Emails Generated']);
const connected = (c: string) => /^connected$/i.test(c.trim());

/** One inbox → its bucket. Pure. */
export function bucketOf(i: Pick<InboxRow, 'status' | 'stage' | 'connection' | 'warmup'>, inLive: boolean, inBuilt: boolean): Bucket {
  if (i.status === 'spam' || /replace/i.test(i.stage)) return 'spam';
  if (i.status === 'resting') return 'resting';
  if (!connected(i.connection)) return 'disconnected';
  if (inLive) return 'sending';
  if (inBuilt) return 'ready';
  if (i.warmup !== null && i.warmup > 0 && i.warmup < WARM_MIN) return 'warming';
  if (i.status === 'risk') return 'risk';
  return 'free';
}

const ORDER: Bucket[] = ['sending', 'ready', 'free', 'warming', 'risk', 'resting', 'spam', 'disconnected'];
const emptyCounts = (): Record<Bucket, number> => ({ sending: 0, ready: 0, free: 0, warming: 0, risk: 0, resting: 0, spam: 0, disconnected: 0 });

/** The box for one client's inboxes (or all active clients' when clientKey is ''). Pure. */
export function sendingBox(inboxes: InboxRow[], campaigns: AccountCampaign[], opts: { clientKey: string; client: string; activeKeys: Set<string> }): SendingBox {
  const mine = inboxes.filter((i) => (opts.clientKey ? i.clientKey === opts.clientKey : opts.activeKeys.has(i.clientKey)));
  const live = new Map<string, string[]>(); const built = new Map<string, string[]>();
  for (const c of campaigns) {
    const into = LIVE.has(c.status) ? live : BUILT.has(c.status) ? built : null;
    if (!into) continue;
    for (const a of c.accountIds) into.set(a, [...(into.get(a) ?? []), c.name]);
  }
  const counts = emptyCounts();
  const cap = { total: 0, used: 0, free: 0, ready: 0 };
  const accounts: AccountLine[] = mine.map((i) => {
    const inLive = live.get(i.id) ?? []; const inBuilt = built.get(i.id) ?? [];
    const bucket = bucketOf(i, inLive.length > 0, inBuilt.length > 0);
    counts[bucket]++;
    const limit = i.dailyLimit ?? 0;
    if (!['spam', 'resting', 'disconnected'].includes(bucket)) cap.total += limit;
    if (bucket === 'sending') cap.used += limit;
    if (bucket === 'free') cap.free += limit;
    if (bucket === 'ready') cap.ready += limit;
    const note = (bucket === 'spam' || bucket === 'resting' || bucket === 'disconnected') && inLive.length ? `still in ${inLive.length === 1 ? 'a live campaign' : `${inLive.length} live campaigns`}`
      : bucket === 'sending' && !limit ? '0 cold a day: sends nothing' : i.warmupOff && bucket !== 'resting' && bucket !== 'spam' ? 'warm-up OFF' : '';
    return {
      id: i.id, email: i.email, bucket, status: i.status, dailyLimit: i.dailyLimit, warmupLimit: i.warmupLimit, warmup: i.warmup, score: i.score, bounce: i.bounce,
      contacted: i.contacted, warmupOff: i.warmupOff, campaigns: [...inLive, ...inBuilt], note,
    };
  }).sort((a, b) => ORDER.indexOf(a.bucket) - ORDER.indexOf(b.bucket) || a.email.localeCompare(b.email));
  const who = opts.client || 'these clients';
  const alert = !mine.length ? '' : !counts.sending && counts.free ? `Nothing is sending for ${who}: ${counts.free} free inbox${counts.free === 1 ? '' : 'es'} could be.`
    : !counts.sending && counts.ready ? `Nothing is sending for ${who} yet: ${counts.ready} inbox${counts.ready === 1 ? ' is' : 'es are'} in a built campaign waiting for launch.`
      : !counts.sending ? `Nothing is sending for ${who}, and no inbox is free.` : '';
  return { client: opts.client, clientKey: opts.clientKey, total: mine.length, counts, capacity: cap, alert, accounts };
}

export interface ClientSendingLine { key: string; name: string; total: number; sending: number; free: number; ready: number; warming: number; resting: number; spam: number; capacity: number; used: number }
/** One line per active client (the all-clients view), clients with nothing sending first. Pure. */
export function sendingByClient(inboxes: InboxRow[], campaigns: AccountCampaign[], clients: { key: string; name: string }[]): ClientSendingLine[] {
  return clients.map((c) => {
    const b = sendingBox(inboxes, campaigns, { clientKey: c.key, client: c.name, activeKeys: new Set() });
    return { key: c.key, name: c.name, total: b.total, sending: b.counts.sending, free: b.counts.free, ready: b.counts.ready, warming: b.counts.warming, resting: b.counts.resting, spam: b.counts.spam, capacity: b.capacity.total, used: b.capacity.used };
  }).filter((x) => x.total > 0).sort((a, b) => Number(a.sending > 0) - Number(b.sending > 0) || a.name.localeCompare(b.name));
}

// ---------- GET /hq/api/campaigns/accounts?client= ----------
type DelivCfg = Parameters<typeof buildDeliverability>[1];
/** The box for the picked client (or every active client), plus one line per client in the all-clients view. */
export async function sendingAccountsView(at: HqAirtable, db: Db, cfg: DelivCfg, opts: { client?: string; refresh?: boolean } = {}) {
  const [deliv, src] = await Promise.all([cachedDeliv(at, db, opts.refresh), cachedCampaigns(at, db, opts.refresh)]);
  const model = buildDeliverability(deliv, cfg);
  const ws = clientIndex(src.ws);
  const clients = [...new Map([...ws.values()].filter((c) => c.active).map((c) => [c.key, c])).values()];
  const activeKeys = new Set(clients.map((c) => c.key));
  const campaigns: AccountCampaign[] = src.campaigns.map(factsOf).map((c) => ({ id: c.id, name: c.name, status: c.status, clientKey: ws.get(c.clientRec)?.key ?? '', accountIds: c.accountIds }));
  const client = opts.client && activeKeys.has(opts.client) ? opts.client : '';
  const name = clients.find((c) => c.key === client)?.name ?? '';
  const box = sendingBox(model.inboxes, campaigns, { clientKey: client, client: name, activeKeys });
  return {
    ...box, buckets: BUCKETS, warmMin: WARM_MIN,
    byClient: client ? [] : sendingByClient(model.inboxes, campaigns, clients.map((c) => ({ key: c.key, name: c.name }))),
    readAt: src.readAt,
  };
}

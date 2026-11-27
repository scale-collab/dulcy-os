// HQ round 3 (Alex, 2026-11-27): buy domains + inboxes from HQ, through the SAME purchase request
// the Airtable "Buy Domains & Inboxes" screen and the n8n "[Email Infrastructure] Instant Client
// Domain Purchasing v4" workflow use (Domain Purchase Requests, tblU6OstDVWeuYBxL). Nothing buys by
// itself (RULES.md: buying always needs Alex's ✅). The three owner-only steps, each one press:
//   1. Buy      → a new request, Status "Draft". Nothing runs on Draft.
//   2. Quote    → Status "Generate Domains": the Airtable automation "Generate Domain IDeas" calls n8n,
//                 which picks available domains and gets a Cheap Inboxes QUOTE (no charge), then sets
//                 "Ready for Approval" with "Quote Total Today".
//   3. Approve  → ticks "Approve Purchase" (Alex's ✅ for that exact quote: the request must be Ready
//                 for Approval and the body must repeat the quote total). The Airtable automation
//                 "Approve Purchase Domains Automation" then makes n8n place the order (charges the card).
// Every domain has 2 inboxes (RULES 2026-11-25); n8n takes names / password / pattern from the
// client's Onboarding record (never from HQ). Each step writes one Activity Log row.
import type { Db } from '../db/pool.js';
import type { Config } from '../config.js';
import type { HqAirtable } from './decisions.js';
import { logActivity } from '../activity.js';
import { val } from '../agents/emailsFields.js';
import { clientKey, groupWorkspaces } from './clients.js';
import { WORKSPACES } from './inbox.js';
import { DPR, PURCHASES, _resetDelivCache, md, nyDate } from './deliverability.js';
import { shortClient } from '../agents/ada.js';

export const BUY_PROVIDERS = ['Google', 'Microsoft'] as const;
export const BUY_TLDS = ['.com', '.co', '.net', '.info'] as const;
export const BUY_LIMITS = { minDomains: 1, maxDomains: 100, inboxesPerDomain: 2 } as const;
const REC = /^rec[A-Za-z0-9]{14}$/;

export type BuyAction = 'create' | 'quote' | 'approve';
export interface BuyCreate { action: 'create'; client: string; domains: number; provider: (typeof BUY_PROVIDERS)[number]; tlds: string[]; note: string }
export interface BuyStep { action: 'quote' | 'approve'; id: string; total: number | null }

/** Read and check the body. confirm must be exactly true. Pure. */
export function parseBuy(b: any): { ok: true; req: BuyCreate | BuyStep } | { ok: false; error: string } {
  if (!b || typeof b !== 'object') return { ok: false, error: 'a JSON body, please' };
  if (b.confirm !== true) return { ok: false, error: 'confirm: true is required' };
  const action = String(b.action ?? 'create');
  if (action === 'quote' || action === 'approve') {
    const id = String(b.id ?? '');
    if (!REC.test(id)) return { ok: false, error: 'id must be a Domain Purchase Requests record id' };
    const total = b.total === undefined || b.total === null || b.total === '' ? null : Number(b.total);
    if (action === 'approve' && (total === null || !Number.isFinite(total) || total < 0)) return { ok: false, error: 'approve needs the quote total you saw (total)' };
    return { ok: true, req: { action, id, total } };
  }
  if (action !== 'create') return { ok: false, error: 'action must be create, quote or approve' };
  const client = String(b.client ?? '').toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 80);
  if (!client) return { ok: false, error: 'pick the client' };
  const domains = Number(b.domains);
  if (!Number.isInteger(domains) || domains < BUY_LIMITS.minDomains || domains > BUY_LIMITS.maxDomains) return { ok: false, error: `domains must be a whole number from ${BUY_LIMITS.minDomains} to ${BUY_LIMITS.maxDomains}` };
  const provider = BUY_PROVIDERS.find((p) => p.toLowerCase() === String(b.provider ?? 'Google').toLowerCase());
  if (!provider) return { ok: false, error: 'provider must be Google or Microsoft' };
  const tlds = (Array.isArray(b.tlds) && b.tlds.length ? b.tlds : ['.com']).map((t: unknown) => `.${String(t).replace(/^\.+/, '').toLowerCase()}`);
  if (tlds.some((t: string) => !(BUY_TLDS as readonly string[]).includes(t))) return { ok: false, error: `domain endings: ${BUY_TLDS.join(', ')}` };
  return { ok: true, req: { action: 'create', client, domains, provider, tlds: [...new Set(tlds as string[])], note: String(b.note ?? '').replace(/\s+/g, ' ').trim().slice(0, 300) } };
}

/** The client's workspace record to link (an active one, not the "(internal)" copy when there is a choice). */
export function workspaceFor(ws: { id: string; fields: Record<string, unknown> }[], client: string): { id: string; name: string } | null {
  for (const g of groupWorkspaces(ws as any)) {
    const names = g.map((w) => val(w.fields.Name).replace(/\s*\(internal\)\s*$/i, '').trim());
    const full = names.reduce((a, b) => (b.length < a.length ? b : a), names[0]);
    if (clientKey(full) !== client) continue;
    if (!g.some((w) => val(w.fields.Status) === 'Active')) return null;
    const pick = [...g].sort((a, b) => Number(/\(internal\)/i.test(val(a.fields.Name))) - Number(/\(internal\)/i.test(val(b.fields.Name))) || Number(val(b.fields.Status) === 'Active') - Number(val(a.fields.Status) === 'Active'))[0];
    return { id: pick.id, name: shortClient(full) };
  }
  return null;
}

const money = (x: number) => `$${x.toFixed(2)}`;
const STEP_FIELDS = [DPR.request, DPR.status, DPR.approve, DPR.quoteToday, DPR.client, DPR.count, DPR.quoteAt, DPR.orderId];

/** POST /deliverability/buy (owner only, checked by the route). */
export async function buyAction(at: HqAirtable, _db: Db, cfg: Pick<Config, 'airtableApiKey' | 'airtableBaseId' | 'airtableBaseUrl'>, body: any, by: string): Promise<{ status: number; body: Record<string, unknown> }> {
  const p = parseBuy(body);
  if (!p.ok) return { status: 400, body: { error: p.error } };
  const r = p.req;
  if (r.action === 'create') {
    const ws = await at.list(WORKSPACES, `{Name}!=''`, ['Name', 'ID', 'Status', 'Client', 'Client Type'], 300, { byName: true });
    const w = workspaceFor(ws, r.client);
    if (!w) return { status: 404, body: { error: 'no active client with that name' } };
    const inboxes = r.domains * BUY_LIMITS.inboxesPerDomain;
    const title = `${w.name} - ${r.domains} domain${r.domains === 1 ? '' : 's'}, ${inboxes} inboxes (HQ, ${by}, ${md(nyDate(new Date()))})`.slice(0, 200);
    const id = await at.create(PURCHASES, { [DPR.request]: title, [DPR.client]: [w.id], [DPR.count]: r.domains, [DPR.tlds]: r.tlds, [DPR.provider]: r.provider, [DPR.status]: 'Draft' });
    await logActivity(cfg, { event: `Purchase request made in HQ: ${r.domains} domains / ${inboxes} inboxes for ${w.name}`, type: 'Waiting for approval', agent: 'Alex', details: `By ${by}. ${r.provider}, ${r.tlds.join(' ')}. Status Draft: nothing is bought. Next: Get a quote (no charge), then Approve.${r.note ? ` Note: ${r.note}` : ''}`, clientRecordIds: [w.id] }, at);
    _resetDelivCache();
    return { status: 200, body: { ok: true, id, status: 'Draft', summary: `${r.domains} domains, ${inboxes} inboxes for ${w.name}: saved as a Draft. Nothing is bought.` } };
  }
  const rec = await at.get(PURCHASES, r.id, STEP_FIELDS as unknown as string[]);
  if (!rec) return { status: 404, body: { error: 'no such purchase request' } };
  const f = rec.fields;
  const status = val(f[DPR.status]) || 'Draft';
  const name = val(f[DPR.request]) || 'Purchase request';
  if (r.action === 'quote') {
    if (status !== 'Draft') return { status: 409, body: { error: `only a Draft gets a new quote (this one is ${status})` } };
    await at.update(PURCHASES, r.id, { [DPR.status]: 'Generate Domains', [DPR.error]: '' });
    await logActivity(cfg, { event: `Quote asked in HQ: ${name}`.slice(0, 250), type: 'Info', agent: 'Alex', details: `By ${by}. n8n picks the domains and asks Cheap Inboxes for a quote. No charge.` }, at);
    _resetDelivCache();
    return { status: 200, body: { ok: true, id: r.id, status: 'Generate Domains', summary: 'Quote asked: n8n picks the domains and gets the price. No charge.' } };
  }
  // approve: Alex's ✅ for that exact quote.
  const quote = Number(val(f[DPR.quoteToday]));
  if (status !== 'Ready for Approval') return { status: 409, body: { error: `only a request Ready for Approval can be approved (this one is ${status})` } };
  if (f[DPR.approve] === true) return { status: 409, body: { error: 'already approved' } };
  if (!val(f[DPR.quoteToday]) || !Number.isFinite(quote)) return { status: 409, body: { error: 'no quote on this request yet' } };
  if (Math.abs(quote - (r.total ?? -1)) > 0.005) return { status: 409, body: { error: `the quote is now ${money(quote)}, not ${money(r.total ?? 0)}: look again before approving` } };
  await at.update(PURCHASES, r.id, { [DPR.approve]: true });
  await logActivity(cfg, { event: `Purchase approved in HQ: ${name} (${money(quote)} today)`.slice(0, 250), type: 'Approved', agent: 'Alex', details: `By ${by}. n8n places the Cheap Inboxes order in batches and adds the domains and inboxes to Airtable.` }, at);
  _resetDelivCache();
  return { status: 200, body: { ok: true, id: r.id, status: 'Approved', summary: `Approved: ${money(quote)} today. n8n places the order.` } };
}

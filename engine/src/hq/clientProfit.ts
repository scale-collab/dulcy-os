// Round 4 (Alex 2026-11-28 walkthrough, hq/feedback-2026-11-27.md "Round 4 → Clients"):
//   - Results per client for a Custom date range: EmailBison's own workspace totals for those days
//     (the call the n8n "Analytics - Email" flows write into Airtable's Email Analytics Overview)
//     plus meetings booked in those days from the Emails table (the same booking rule as health).
//   - Profit per client (owner only, checked in the route): revenue in the period from the deal
//     terms minus the costs HQ knows: inboxes x $2.50 a month (Dulcy's real price), .com domains at
//     $9.99 a year (RULES 2026-11-25). Every cost HQ cannot read is the word UNKNOWN, never a guess.
// Read only: nothing here writes to Airtable, EmailBison or Xero.
import type { Db } from '../db/pool.js';
import type { Config } from '../config.js';
import type { AirtableRecord } from '../providers/airtable.js';
import { createBisonClient } from '../providers/emailbison.js';
import { bookedAt } from '../agents/atlas.js';
import { EMAILS, val } from '../agents/emailsFields.js';
import { INBOX_MONTHLY_DEFAULT, buildDeliverability, cachedDeliv } from './deliverability.js';
import { MONTH_DAYS, customRanges, periodRanges, resultsOf, type DealType, type Period, type Range, type Results } from './clientDeals.js';
import { buildAll, cachedSource } from './clients.js';
import { readFinance, type FinanceDeps } from './finance.js';
import type { HqAirtable } from './decisions.js';

const DAY = 86_400_000;
const day = (iso: string) => Date.parse(`${String(iso).slice(0, 10)}T12:00:00Z`);
const ymd = (t: number) => new Date(t).toISOString().slice(0, 10);
const r2 = (x: number) => Math.round(x * 100) / 100;
const usd = (x: number) => `$${x.toLocaleString('en-US', { maximumFractionDigits: 2 })}`;
const CACHE_MS = 5 * 60_000;

/* ---------- Meetings booked in a range (Emails table) ---------- */
const MEETING_FIELDS = ['Workspace ID (Bison)', 'Meeting Booked At', 'Date of Call Booked', 'Latest Reply Time', 'Opportunity Status', 'Pipeline Stage'];
/** Meetings booked in [from, to) per EmailBison workspace id, by atlas.bookedAt (dated, else a WON row's latest reply). Pure. */
export function meetingsByWorkspace(rows: AirtableRecord[], r: Pick<Range, 'from' | 'to'>): Map<string, number> {
  const out = new Map<string, number>();
  for (const e of rows) {
    const at = bookedAt(e);
    if (!at || !Number.isFinite(Date.parse(at))) continue;
    const d = ymd(Date.parse(at));
    if (d < r.from || d >= r.to) continue;
    const ws = val(e.fields['Workspace ID (Bison)']);
    if (ws) out.set(ws, (out.get(ws) ?? 0) + 1);
  }
  return out;
}
/** The Emails rows that can hold a booking in [from, to): one bounded read (20,000 rows at most). */
export function readMeetingRows(at: HqAirtable, r: Pick<Range, 'from' | 'to'>): Promise<AirtableRecord[]> {
  const after = ymd(day(r.from) - DAY);
  const inside = (f: string) => `AND(IS_AFTER({${f}},'${after}'),IS_BEFORE({${f}},'${r.to}'))`;
  const won = `OR({Opportunity Status}='WON',{Pipeline Stage}='Booked Meeting',{Pipeline Stage}='Completed Meeting',{Pipeline Stage}='Closed Deal')`;
  const formula = `OR(${inside('Meeting Booked At')},${inside('Date of Call Booked')},AND(${won},${inside('Latest Reply Time')}))`;
  return at.list(EMAILS, formula, MEETING_FIELDS, 20000, { byName: true });
}

/* ---------- Custom range results ---------- */
export interface BisonTotals { sent: number; contacted: number; replies: number; interested: number; bounced: number }
/** EmailBison workspace totals for [from, to] (both days included). Tests pass a fake. */
export type BisonStatsFn = (teamId: number, from: string, to: string) => Promise<BisonTotals>;
export function bisonStatsFrom(cfg: Pick<Config, 'emailBisonKeys' | 'emailBisonBaseUrl' | 'bounceCheckKey'>, fetchImpl?: typeof fetch): BisonStatsFn {
  // The shared key, switched to each workspace right before its call (calls run one after another).
  return (teamId, from, to) => createBisonClient({ apiKey: cfg.emailBisonKeys[cfg.bounceCheckKey], baseUrl: cfg.emailBisonBaseUrl, teamId, fetchImpl, timeoutMs: 20_000 }).workspaceStats(from, to);
}
export interface CustomResultsRow { id: string; key: string; name: string; results: Results | null; note: string }
export interface CustomResults { from: string; to: string; label: string; rows: CustomResultsRow[]; errors: string[]; readAt: string }
const customCache = new Map<string, { at: number; data: Promise<CustomResults> }>();
export function _resetProfitCache() { customCache.clear(); }

/** GET /clients/results?from&to: every active client's results for a custom range. Cached 5 minutes per range. */
export function customResults(at: HqAirtable, db: Db, stats: BisonStatsFn, from: string, to: string, refresh = false): Promise<CustomResults> {
  const rg = customRanges(from, to);
  if (!rg) return Promise.reject(Object.assign(new Error('pick a from and a to date (to on or after from, 3 years at most)'), { status: 400 }));
  const k = `${from}|${to}`;
  const hit = customCache.get(k);
  if (hit && Date.now() - hit.at < (refresh ? 30_000 : CACHE_MS)) return hit.data;
  const data = (async (): Promise<CustomResults> => {
    const errors: string[] = [];
    const why = (e: unknown) => String((e as Error)?.message ?? e).replace(/\s+/g, ' ').slice(0, 140);
    const [src, mrows] = await Promise.all([cachedSource(at, db), readMeetingRows(at, rg.cur).catch((e) => { errors.push(`Meetings not read: ${why(e)}`); return null; })]);
    const meet = mrows ? meetingsByWorkspace(mrows, rg.cur) : null;
    const rows: CustomResultsRow[] = [];
    for (const { row } of buildAll(src, false, new Date())) {
      if (!row.active) continue;
      const ids = row.workspaces.map((w) => w.bisonId).filter(Boolean);
      const t = { sent: 0, replies: 0, interested: 0, contacted: 0, meetings: 0 }; let got = 0; const failed: string[] = [];
      for (const id of ids) { // one after another: the shared key is switched per workspace
        try { const s = await stats(Number(id), from, to); t.sent += s.sent; t.replies += s.replies; t.interested += s.interested; t.contacted += s.contacted; got++; } catch (e) { failed.push(id); errors.push(`${row.name} (EmailBison ${id}): not read: ${why(e)}`); }
        if (meet) t.meetings += meet.get(id) ?? 0;
      }
      const results = got && meet ? resultsOf('custom', t) : null;
      rows.push({ id: row.id, key: row.key, name: row.name, results, note: !ids.length ? 'No EmailBison workspace on record' : failed.length && got ? `Part only: ${failed.length} of ${ids.length} workspaces not read` : '' });
    }
    return { from, to, label: rg.cur.label, rows, errors, readAt: new Date().toISOString() };
  })();
  customCache.set(k, { at: Date.now(), data });
  data.catch(() => customCache.delete(k));
  return data;
}

/* ---------- Profit per client ---------- */
/** RULES 2026-11-25: a replacement domain is "1 .com domain at $9.99" (Cheap Inboxes), bought for a year. */
export const DOMAIN_COM_YEARLY = 9.99;
export interface ProfitInput {
  id: string; key: string; name: string;
  /** Monthly retainer; null when the deal is UNKNOWN. */ retainer: number | null; perCall: number; dealType: DealType;
  start: string; end: string;
  /** Meetings booked in the range; null when they could not be read. */ meetings: number | null;
  /** Today's inboxes and domains (Deliverability); null when it could not be read. */ inboxes: number | null; domains: { com: number; other: number } | null;
}
export interface CostPart { label: string; amount: number | null; note: string }
export interface ClientProfit { id: string; key: string; name: string; months: number; revenue: number | null; revenueNote: string; costs: CostPart[]; knownCosts: number; profit: number | null; unknown: string[] }

/** Days of [from, to) the client was a client (start to end, or today). Pure. */
export function activeDays(r: Pick<Range, 'from' | 'to'>, start: string, end: string): number {
  const a = Math.max(day(r.from), start ? day(start) : -Infinity);
  const b = Math.min(day(r.to), end ? day(end) + DAY : Infinity);
  return Number.isFinite(a) && Number.isFinite(b) && b > a ? Math.round((b - a) / DAY) : 0;
}
/**
 * One client's profit for a range: revenue from the deal (retainer x months in the range + per-call
 * price x meetings booked in it) minus the known costs. Costs HQ has no number for stay UNKNOWN and
 * are listed in `unknown`; profit = revenue - known costs ("before" the unknown ones). Pure.
 */
export function clientProfit(p: ProfitInput, r: Pick<Range, 'from' | 'to'>): ClientProfit {
  const months = r2(activeDays(r, p.start, p.end) / MONTH_DAYS);
  const unknown: string[] = [];
  let revenue: number | null = null; let revenueNote = '';
  if (p.retainer === null || p.dealType === 'unknown') { revenueNote = 'Deal UNKNOWN'; unknown.push('revenue (deal UNKNOWN)'); }
  else if (p.perCall > 0 && p.meetings === null) { revenueNote = 'Meetings UNKNOWN (not read)'; unknown.push('revenue (meetings not read)'); }
  else {
    const fromRetainer = p.retainer * months; const fromCalls = p.perCall * (p.meetings ?? 0);
    revenue = r2(fromRetainer + fromCalls);
    revenueNote = [p.retainer ? `${usd(p.retainer)}/mo x ${months} mo` : '', p.perCall ? `${p.meetings ?? 0} meetings x ${usd(p.perCall)}` : ''].filter(Boolean).join(' + ') || 'no fee';
  }
  const costs: CostPart[] = [];
  if (p.inboxes === null) { costs.push({ label: 'Inboxes', amount: null, note: 'UNKNOWN: inbox count not read' }); unknown.push('inboxes'); }
  else costs.push({ label: 'Inboxes', amount: r2(p.inboxes * INBOX_MONTHLY_DEFAULT * months), note: `${p.inboxes} inboxes x $${INBOX_MONTHLY_DEFAULT.toFixed(2)}/mo (today's count)` });
  if (p.domains === null) { costs.push({ label: 'Domains', amount: null, note: 'UNKNOWN: domain list not read' }); unknown.push('domains'); }
  else {
    const { com, other } = p.domains;
    const comCost = r2((com * DOMAIN_COM_YEARLY / 12) * months);
    if (other) unknown.push(`${other} non-.com domain${other === 1 ? '' : 's'} (price UNKNOWN)`);
    costs.push({
      label: 'Domains', amount: com || !other ? comCost : null,
      note: [com ? `${com} .com x $${DOMAIN_COM_YEARLY}/yr` : '', other ? `${other} other: price UNKNOWN` : '', !com && !other ? 'no domains on record' : ''].filter(Boolean).join(' · '),
    });
  }
  costs.push({ label: 'Leads and verification', amount: null, note: 'UNKNOWN: HQ has no per-client lead or MillionVerifier cost yet' });
  unknown.push('leads and verification');
  const knownCosts = r2(costs.reduce((a, c) => a + (c.amount ?? 0), 0));
  return { id: p.id, key: p.key, name: p.name, months, revenue, revenueNote, costs, knownCosts, profit: revenue === null ? null : r2(revenue - knownCosts), unknown };
}
/** Domains and inboxes per client key from Deliverability's domain rows. Pure. */
export function domainCounts(domains: { clientKey: string; name: string; inboxes: number }[]): Map<string, { inboxes: number; com: number; other: number }> {
  const out = new Map<string, { inboxes: number; com: number; other: number }>();
  for (const d of domains) {
    if (!d.clientKey || d.clientKey === 'none') continue;
    const x = out.get(d.clientKey) ?? { inboxes: 0, com: 0, other: 0 };
    x.inboxes += d.inboxes || 0;
    if (/\.com$/i.test(d.name.trim())) x.com++; else x.other++;
    out.set(d.clientKey, x);
  }
  return out;
}

export interface ProfitView {
  period: Period | 'custom'; range: Range; clients: ClientProfit[];
  totals: { revenue: number; knownCosts: number; profit: number; clientsWithRevenue: number };
  rules: string[]; errors: string[]; readAt: string;
}
type DelivCfg = Parameters<typeof buildDeliverability>[1];
/** GET /clients/profit?period=…(&from&to): profit per active client (owner only, checked in the route). */
export async function profitView(at: HqAirtable, db: Db, cfg: DelivCfg, finance: FinanceDeps, period: Period | 'custom', from?: string, to?: string, now = new Date()): Promise<ProfitView> {
  const rg = period === 'custom' ? customRanges(from, to) : periodRanges(period, now);
  if (!rg) throw Object.assign(new Error('pick a from and a to date (to on or after from, 3 years at most)'), { status: 400 });
  const errors: string[] = [];
  const why = (e: unknown) => String((e as Error)?.message ?? e).replace(/\s+/g, ' ').slice(0, 140);
  const [src, fin, mrows, deliv] = await Promise.all([
    cachedSource(at, db), readFinance(finance, now),
    readMeetingRows(at, rg.cur).catch((e) => { errors.push(`Meetings not read: ${why(e)}`); return null; }),
    cachedDeliv(at, db).then((s) => buildDeliverability(s, cfg)).catch((e) => { errors.push(`Inboxes and domains not read: ${why(e)}`); return null; }),
  ]);
  const meet = mrows ? meetingsByWorkspace(mrows, rg.cur) : null;
  const counts = deliv ? domainCounts(deliv.domains) : null;
  const clients = buildAll(src, true, now, { finance: fin }).map((b) => b.row).filter((r) => r.active && !r.internal && r.money).map((r) => {
    const ids = r.workspaces.map((w) => w.bisonId).filter(Boolean);
    const c = counts ? counts.get(r.key) ?? { inboxes: 0, com: 0, other: 0 } : null;
    return clientProfit({
      id: r.id, key: r.key, name: r.name, retainer: r.money!.fee, perCall: r.money!.perCall ?? 0, dealType: r.money!.dealType, start: r.startDate, end: r.endDate,
      meetings: meet ? ids.reduce((a, id) => a + (meet.get(id) ?? 0), 0) : null, inboxes: c ? c.inboxes : null, domains: c ? { com: c.com, other: c.other } : null,
    }, rg.cur);
  }).sort((a, b) => (b.profit ?? -Infinity) - (a.profit ?? -Infinity) || a.name.localeCompare(b.name));
  const known = clients.filter((c) => c.revenue !== null);
  return {
    period, range: rg.cur, clients,
    totals: { revenue: r2(known.reduce((a, c) => a + (c.revenue ?? 0), 0)), knownCosts: r2(known.reduce((a, c) => a + c.knownCosts, 0)), profit: r2(known.reduce((a, c) => a + (c.profit ?? 0), 0)), clientsWithRevenue: known.length },
    rules: [
      'Revenue = the deal (monthly fee x months in the period + per-call price x meetings booked in it), not Xero payments.',
      `Inboxes = today's inbox count x $${INBOX_MONTHLY_DEFAULT.toFixed(2)} a month (Dulcy's discounted price).`,
      `Domains = .com domains x $${DOMAIN_COM_YEARLY} a year; other domain endings: price UNKNOWN.`,
      'Leads and verification: UNKNOWN (not counted).',
    ],
    errors: [...errors, ...fin.errors.filter((e) => /sheet/i.test(e))], readAt: src.readAt,
  };
}

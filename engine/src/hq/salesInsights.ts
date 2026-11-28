// HQ Sales, Batch 4a (Alex 2026-11-27): the numbers behind the deals. Owner only (the route checks).
//   - Periods: this month vs last, this half-year vs the one before, this year vs last year, for calls
//     booked, showed, qualified, contracts sent, signed, paid and new monthly money. Exact counts and
//     up/down deltas, one short conclusion line.
//   - Capacity (Closers.io "Diagnosing & Fixing Constraints", Alex's video): calendars, open slots
//     (Dulcy's calendar through the calendar service, else a setting), % booked = booked / (booked +
//     open), show rate, qualified rate, close rate, days to close, touches per close (Close), what the
//     calendar can produce at today's rates, and which one is the limit (course thresholds: show
//     under 60% first, close under 25%, booked 80%+ = add time or a closer).
//   - Hottest deals: Close opportunities + their emails, calls and notes, joined with HQ's own deals
//     (contract opened, Cole's call review). Each one says why it is hot and the next step.
// Everything here only READS: Close (GET), Xero (GET), the calendar service (availability). Cached.
import type { Db } from '../db/pool.js';
import type { Config } from '../config.js';
import { createXeroClient } from '../providers/xero.js';
import { createCloseClient, type CloseActivity, type CloseClient, type CloseOpportunity } from '../providers/close.js';
import { calendarStatus, type CalendarState } from '../agents/calendar.js';
import { createSheetsClient } from '../providers/google.js';
import { pricingSheetReader } from './pricing.js';
import { coleNext, companyKey, latestReview, nyDay, pipelineOf, rate, shortDay, type Deal, type Rate, type XeroPayment } from './sales.js';

const DAY = 86_400_000;
/** Dulcy's own Workspace IDs record: its calendar is Alex's sales calendar (clients/dulcy.md). */
export const DULCY_WS = 'recJx0WwHsdsvcVIN';
const dayMs = (d: string) => Date.parse(`${d}T12:00:00Z`);
const addDays = (d: string, k: number) => nyDay(dayMs(d) + k * DAY);
const daysBetween = (a: string, b: string) => Math.round((dayMs(b) - dayMs(a)) / DAY);
const day10 = (x: string) => (x ? (/^\d{4}-\d{2}-\d{2}$/.test(x) ? x : Number.isFinite(Date.parse(x)) ? nyDay(x) : '') : '');
const pct = (r: Rate) => (r.of ? Math.round((r.n / r.of) * 100) : null);

// ---------- periods ----------
export type MetricKey = 'booked' | 'showed' | 'qualified' | 'sent' | 'signed' | 'paid';
export const METRICS: { key: MetricKey; label: string }[] = [
  { key: 'booked', label: 'Calls booked' }, { key: 'showed', label: 'Showed' }, { key: 'qualified', label: 'Qualified' },
  { key: 'sent', label: 'Contracts sent' }, { key: 'signed', label: 'Signed' }, { key: 'paid', label: 'Paid' },
];
export interface Range { from: string; to: string; label: string }
export interface PeriodDef { key: 'month' | 'half' | 'year'; title: string; now: Range; prev: Range }
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const LONG = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const lastDay = (y: number, m: number) => new Date(Date.UTC(y, m, 0)).getUTCDate();
const pad = (x: number) => String(x).padStart(2, '0');

/** The three comparisons for a day (YYYY-MM-DD, New York). The current period runs to today. Pure. */
export function periodRanges(today: string): PeriodDef[] {
  const [y, m] = today.split('-').map(Number);
  const pm = m === 1 ? 12 : m - 1, py = m === 1 ? y - 1 : y;
  const h2 = m >= 7;
  return [
    { key: 'month', title: 'This month vs last month', now: { from: `${y}-${pad(m)}-01`, to: today, label: `${LONG[m - 1]} so far` }, prev: { from: `${py}-${pad(pm)}-01`, to: `${py}-${pad(pm)}-${pad(lastDay(py, pm))}`, label: LONG[pm - 1] } },
    h2
      ? { key: 'half', title: 'Second half vs first half', now: { from: `${y}-07-01`, to: today, label: `Jul–Dec ${y} so far` }, prev: { from: `${y}-01-01`, to: `${y}-06-30`, label: `Jan–Jun ${y}` } }
      : { key: 'half', title: 'First half vs second half', now: { from: `${y}-01-01`, to: today, label: `Jan–Jun ${y} so far` }, prev: { from: `${y - 1}-07-01`, to: `${y - 1}-12-31`, label: `Jul–Dec ${y - 1}` } },
    { key: 'year', title: 'This year vs last year', now: { from: `${y}-01-01`, to: today, label: `${y} so far` }, prev: { from: `${y - 1}-01-01`, to: `${y - 1}-12-31`, label: String(y - 1) } },
  ];
}

/** The day a deal counted for each metric ('' = not reached). Pure. */
export function metricDay(d: Deal, k: MetricKey): string {
  const held = day10(d.heldDate) || d.callDate;
  switch (k) {
    case 'booked': return d.salesRec ? d.callDate : '';
    case 'showed': return d.stages.showed ? held : '';
    case 'qualified': return d.stages.qualified ? held || day10(d.agreement?.sentAt ?? '') : '';
    case 'sent': return d.stages.sent ? day10(d.agreement?.sentAt ?? '') || day10(d.agreement?.created ?? '') || held : '';
    case 'signed': return d.stages.signed ? d.signedDay : '';
    case 'paid': return d.stages.paid ? d.paidDay || d.signedDay : '';
  }
}
export interface Delta { now: number; prev: number; diff: number; dir: 'up' | 'down' | 'same' }
const delta = (now: number, prev: number): Delta => ({ now, prev, diff: now - prev, dir: now > prev ? 'up' : now < prev ? 'down' : 'same' });
const inRange = (day: string, r: Range) => !!day && day >= r.from && day <= r.to;

export interface PeriodRow extends Delta { key: MetricKey; label: string }
export interface Period { key: PeriodDef['key']; title: string; nowLabel: string; prevLabel: string; rows: PeriodRow[]; money?: Delta & { unknownNow: number; unknownPrev: number } }
/** Counts per metric for the current and the previous period, with the deltas. Money only for the owner. Pure. */
export function comparePeriods(deals: Deal[], today: string, canSeeMoney: boolean): { periods: Period[]; conclusion: string } {
  const periods = periodRanges(today).map((p): Period => {
    const count = (k: MetricKey, r: Range) => deals.filter((d) => inRange(metricDay(d, k), r)).length;
    const signedIn = (r: Range) => deals.filter((d) => inRange(metricDay(d, 'signed'), r));
    const mrr = (xs: Deal[]) => xs.reduce((a, d) => a + (d.money?.monthly ?? 0), 0);
    const out: Period = { key: p.key, title: p.title, nowLabel: p.now.label, prevLabel: p.prev.label, rows: METRICS.map((m) => ({ key: m.key, label: m.label, ...delta(count(m.key, p.now), count(m.key, p.prev)) })) };
    if (canSeeMoney) {
      const a = signedIn(p.now), b = signedIn(p.prev);
      out.money = { ...delta(mrr(a), mrr(b)), unknownNow: a.filter((d) => d.money?.monthly == null).length, unknownPrev: b.filter((d) => d.money?.monthly == null).length };
    }
    return out;
  });
  return { periods, conclusion: periodConclusion(periods[0]) };
}
/** One short line: calls and signed deals this month vs last. Pure. */
export function periodConclusion(p: Period): string {
  const row = (k: MetricKey) => p.rows.find((r) => r.key === k)!;
  const part = (r: Delta, word: string) => (r.dir === 'same' ? `${word} the same (${r.now})` : `${word} ${r.dir} ${Math.abs(r.diff)} (${r.now} vs ${r.prev})`);
  const b = row('booked'), s = row('signed'), sh = row('showed');
  const lead = b.now === 0 && b.prev === 0 && s.now === 0 && s.prev === 0 ? 'No calls or signed deals in either month' : `${part(b, 'Calls')}, ${part(sh, 'showed')}, ${part(s, 'signed')}`;
  return `${p.nowLabel} vs ${p.prevLabel}: ${lead.charAt(0).toUpperCase()}${lead.slice(1)}.`;
}

// ---------- capacity ----------
export interface CapacitySettings { calendars: number; slotMinutes: number; slotsPerMonth: number | null }
export const CAPACITY_DEFAULTS: CapacitySettings = { calendars: 1, slotMinutes: 30, slotsPerMonth: null };
/** Settings from a saved row, each value checked (never trusted as-is). Pure. */
export function cleanSettings(x: any): CapacitySettings {
  const int = (v: unknown, lo: number, hi: number, dflt: number | null) => { const n = Number(v); return v !== null && v !== '' && v !== undefined && Number.isInteger(n) && n >= lo && n <= hi ? n : dflt; };
  return { calendars: int(x?.calendars, 1, 20, 1) as number, slotMinutes: int(x?.slotMinutes, 15, 120, 30) as number, slotsPerMonth: int(x?.slotsPerMonth, 0, 2000, null) };
}
/** Open meeting slots from a list of free start times: the most meetings of `minutes` that fit without overlapping. Pure. */
export function countSlots(starts: string[], minutes: number): number {
  const ts = [...new Set(starts.map((s) => Date.parse(s)).filter(Number.isFinite))].sort((a, b) => a - b);
  let n = 0, free = -Infinity;
  for (const t of ts) if (t >= free) { n++; free = t + minutes * 60_000; }
  return n;
}
export interface OpenSlots { n: number | null; source: 'calendar' | 'setting' | 'none'; note: string }
export interface Touches { avg: number | null; n: number; source: 'close' | 'none'; note: string }
export interface Capacity {
  calendars: number; slotMinutes: number; open: OpenSlots; bookedNext30: number; availability: number | null;
  booked: Rate | null; bookedPct: number | null; showRate: Rate; qualifiedRate: Rate; closeRate: Rate;
  daysToClose: { median: number | null; n: number; text: string }; touchesPerClose: Touches;
  atCapacity: { calls: number; shows: number; closes: number; text: string } | null;
  limit: { key: 'calendar' | 'show' | 'close' | 'volume' | 'unknown'; text: string };
}
const median = (xs: number[]) => { if (!xs.length) return null; const s = [...xs].sort((a, b) => a - b); const m = Math.floor(s.length / 2); return s.length % 2 ? s[m] : Math.round((s[m - 1] + s[m]) / 2); };

/** The Closers.io capacity chain for Dulcy's own calendar. Rates: the last 90 days. Pure. */
export function capacityMath(deals: Deal[], today: string, open: OpenSlots, settings: CapacitySettings, touches: Touches): Capacity {
  const end = addDays(today, 30);
  const bookedNext30 = deals.filter((d) => d.salesRec && d.callDate >= today && d.callDate < end && d.airtableStage !== 'Canceled' && !d.stages.showed).length;
  const availability = open.n === null ? null : open.source === 'calendar' ? open.n + bookedNext30 : Math.max(open.n, bookedNext30);
  const booked = availability ? rate(bookedNext30, availability, 'slots booked') : null;
  const p = pipelineOf(deals, 90, today);
  const closed = deals.filter((d) => d.stages.signed && d.signedDay && d.callDate && daysBetween(d.signedDay, today) <= 365 && d.signedDay >= d.callDate).map((d) => daysBetween(d.callDate, d.signedDay));
  const md = median(closed);
  const show = p.showRate.of ? p.showRate.n / p.showRate.of : null, close = p.closeRate.of ? p.closeRate.n / p.closeRate.of : null;
  const atCapacity = availability && show !== null && close !== null
    ? { calls: availability, shows: Math.round(availability * show), closes: Math.floor(availability * show * close), text: `${availability} calls → ${Math.round(availability * show)} show (${pct(p.showRate)}%) → ${Math.floor(availability * show * close)} close (${pct(p.closeRate)}% of shows)` }
    : null;
  const bookedPct = booked ? pct(booked) : null;
  let limit: Capacity['limit'];
  if (!availability) limit = { key: 'unknown', text: 'Open time is UNKNOWN: connect Dulcy\'s calendar or set the open slots per month.' };
  else if ((bookedPct ?? 0) >= 80) limit = { key: 'calendar', text: `The calendar is the limit (${booked!.text}): open more time or add a closer.` };
  else if (p.showRate.of >= 3 && (show ?? 1) < 0.6) limit = { key: 'show', text: `Show rate is the limit (${p.showRate.text}, under 60%): confirm every call by text the day before.` };
  else if (p.closeRate.of >= 3 && (close ?? 1) < 0.25) limit = { key: 'close', text: `Close rate is the limit (${p.closeRate.text}, under 25%): review the calls with Cole.` };
  else limit = { key: 'volume', text: `Volume is the limit: ${availability - bookedNext30} of ${availability} slots in the next 30 days are open. More booked calls = more closes.` };
  return {
    calendars: settings.calendars, slotMinutes: settings.slotMinutes, open, bookedNext30, availability, booked, bookedPct,
    showRate: p.showRate, qualifiedRate: p.qualifiedRate, closeRate: p.closeRate,
    daysToClose: { median: md, n: closed.length, text: md === null ? 'UNKNOWN: no signed deal with a call date in the last year' : `${md} days (middle of ${closed.length} signed deal${closed.length === 1 ? '' : 's'}, call → signed)` },
    touchesPerClose: touches, atCapacity, limit,
  };
}

// ---------- hottest deals ----------
const YES = /\b(yes|yep|yeah|sounds (good|great)|let'?s (do it|do this|go|move forward|get started)|send (it|it over|over|me) ?(the )?(contract|agreement|paperwork|invoice|link)?|ready to (start|sign|move forward|go|get started)|move forward|we'?re in|i'?m in|on board|count (us|me) in|go ahead|approved|deal\b)/i;
const NO = /\b(not (ready|interested|right now|a fit|now)|no thanks|no,|pass\b|unsubscribe|stop\b|don'?t)\b/i;
/** The prospect's own words only (quoted history cut off). Pure. */
export function ownWords(text: string): string {
  return String(text ?? '').split(/\bOn [^\n]{0,120}wrote:|\n>|-{3,}\s*Original Message|\bFrom: /i)[0].replace(/\s+/g, ' ').trim();
}
/** Did the prospect say yes (and not "no")? Pure. */
export const saidYes = (text: string) => { const t = ownWords(text).slice(0, 600); return YES.test(t) && !NO.test(t); };

export interface HotDeal {
  key: string; name: string; company: string; score: number; reasons: string[]; next: string; status: string; source: 'close' | 'hq' | 'both';
  lastTouch: { day: string; what: string; snippet: string } | null; dealId: string; closeUrl: string; value?: number | null; valuePeriod?: string;
}
export interface CloseSnapshot { opps: CloseOpportunity[]; acts: Record<string, CloseActivity[]>; won: { opp: CloseOpportunity; touches: number }[]; readAt: string }

const touchWhat = (a: CloseActivity) => (a.type === 'Email' ? (a.direction === 'incoming' ? 'They emailed' : 'We emailed') : a.type === 'Call' ? `Call${a.disposition ? ` (${a.disposition})` : ''}` : a.type === 'Note' ? 'Note' : a.type === 'Meeting' ? 'Meeting' : a.type.replace(/([a-z])([A-Z])/g, '$1 $2'));
const isTouch = (a: CloseActivity) => ['Email', 'Call', 'Meeting', 'SMS', 'Note'].includes(a.type);

/** Match a Close opportunity to an HQ deal: the Close lead id, the company, or the contact's name. Pure. */
export function matchDeal(o: CloseOpportunity, deals: Deal[]): Deal | undefined {
  const k = companyKey(o.leadName);
  const person = o.contactName.trim().toLowerCase();
  return deals.find((d) => d.closeLead === o.leadId)
    ?? deals.find((d) => k.length >= 4 && [d.company, d.client?.name ?? '', ...d.agreements.map((a) => a.company)].map(companyKey).includes(k))
    ?? (person.split(' ').length >= 2 ? deals.find((d) => d.name.trim().toLowerCase() === person) : undefined);
}

/** The hottest open deals, most likely to sign first, each with its reasons and the next step. Pure. */
export function rankHottest(deals: Deal[], close: CloseSnapshot | null, today: string, max = 8): HotDeal[] {
  const out: HotDeal[] = [];
  const used = new Set<string>();
  const score = (input: { deal?: Deal; opp?: CloseOpportunity; acts: CloseActivity[] }): HotDeal | null => {
    const { deal, opp } = input;
    if (deal && (deal.lost || deal.stages.signed || deal.inactiveClient)) return null;
    const reasons: string[] = []; let pts = 0;
    const acts = [...input.acts].filter(isTouch).sort((a, b) => b.at.localeCompare(a.at));
    const last = acts[0];
    const recentIn = acts.filter((a) => a.direction === 'incoming' && daysBetween(day10(a.at), today) <= 21);
    const yes = recentIn.find((a) => saidYes(`${a.subject} ${a.text}`)) ?? acts.find((a) => a.type === 'Note' && daysBetween(day10(a.at), today) <= 21 && /\b(said yes|verbal yes|agreed to (start|sign|move forward)|ready to sign)\b/i.test(a.text));
    if (yes) { pts += 40; reasons.push(`Said yes ${shortDay(day10(yes.at))}`); }
    if (last && last.direction === 'incoming' && (last.type === 'Email' || last.type === 'SMS')) { pts += 20; reasons.push(`Waiting on us since ${shortDay(day10(last.at))}`); }
    const a = deal?.agreement;
    if (a?.state === 'viewed') { pts += 30; reasons.push(`Opened the contract${a.viewedAt ? ` ${shortDay(day10(a.viewedAt))}` : ''}`); }
    else if (a?.state === 'sent') { pts += 25; reasons.push(`Contract sent ${shortDay(day10(a.sentAt))}`); }
    const r = deal ? latestReview(deal) : null;
    if (r && daysBetween(day10(r.created), today) <= 30) {
      if (r.temperature === 'hot') { pts += 25; reasons.push(`Cole: hot call (${r.score ?? '?'}/10)`); }
      else if (r.temperature === 'warm') { pts += 10; reasons.push(`Cole: warm call (${r.score ?? '?'}/10)`); }
    }
    if (deal?.stages.qualified && !deal.stages.sent) { pts += 10; reasons.push('Qualified on the call'); }
    if (opp) {
      if (/contract|proposal|verbal|commit|negotiat|closing|won/i.test(opp.status)) { pts += 15; reasons.push(`Close: ${opp.status}`); }
      if (opp.confidence && opp.confidence > 0) { pts += Math.round(opp.confidence / 5); reasons.push(`${opp.confidence}% likely (Close)`); }
    }
    const touchDays = [last ? day10(last.at) : '', day10(a?.viewedAt ?? ''), day10(a?.sentAt ?? ''), r ? day10(r.created) : '', day10(opp?.updated ?? '')].filter(Boolean).sort();
    const lastDay = touchDays.at(-1) ?? '';
    const ago = lastDay ? daysBetween(lastDay, today) : null;
    if (ago !== null) { if (ago <= 3) pts += 15; else if (ago <= 7) pts += 10; else if (ago <= 14) pts += 5; else if (ago > 30) { pts -= 25; reasons.push(`No touch in ${ago} days`); } }
    if (pts <= 0 || !reasons.some((x) => !/^No touch/.test(x))) return null;
    const next = yes && last?.direction === 'incoming' ? 'Said yes and waiting on us: draft the contract today and send it from Dulcy Sign.'
      : yes ? 'Said yes: send the contract (Draft contract) and book the kickoff.'
      : deal ? coleNext(deal, today) || 'Reply today with one clear next step.' : last?.direction === 'incoming' ? 'They wrote last: reply today.' : 'Follow up today with one clear next step.';
    return {
      key: opp?.leadId ?? deal!.id, name: deal?.name || opp?.contactName || opp?.leadName || '', company: opp?.leadName || deal?.company || '', score: pts, reasons, next,
      status: opp?.status || deal?.agreement?.state || deal?.stage || '', source: opp && deal ? 'both' : opp ? 'close' : 'hq',
      lastTouch: last ? { day: day10(last.at), what: touchWhat(last), snippet: ownWords(`${last.subject ? `${last.subject}: ` : ''}${last.text}`).slice(0, 160) } : lastDay ? { day: lastDay, what: a?.viewedAt && day10(a.viewedAt) === lastDay ? 'Opened the contract' : 'Last activity', snippet: '' } : null,
      dealId: deal?.id ?? '', closeUrl: opp ? `https://app.close.com/lead/${opp.leadId}/` : deal?.closeUrl ?? '',
      ...(opp ? { value: opp.value, valuePeriod: opp.valuePeriod } : deal?.money ? { value: deal.money.monthly, valuePeriod: 'monthly' } : {}),
    };
  };
  if (close) {
    const byLead = new Map<string, CloseOpportunity>();
    for (const o of close.opps.filter((x) => x.statusType === 'active')) { const p = byLead.get(o.leadId); if (!p || (o.confidence ?? 0) > (p.confidence ?? 0)) byLead.set(o.leadId, o); }
    for (const o of byLead.values()) {
      const d = matchDeal(o, deals);
      if (d) used.add(d.id);
      const h = score({ deal: d, opp: o, acts: close.acts[o.leadId] ?? [] });
      if (h) out.push(h);
    }
  }
  for (const d of deals) {
    if (used.has(d.id) || d.lost || d.stages.signed) continue;
    const a = d.agreement, r = latestReview(d);
    const warmContract = a && ['sent', 'viewed'].includes(a.state) && daysBetween(day10(a.sentAt) || today, today) <= 60;
    const warmCall = r && ['hot', 'warm'].includes(r.temperature) && daysBetween(day10(r.created), today) <= 30;
    if (!warmContract && !warmCall) continue;
    const h = score({ deal: d, acts: [] });
    if (h) out.push(h);
  }
  return out.sort((a, b) => b.score - a.score || (b.lastTouch?.day ?? '').localeCompare(a.lastTouch?.day ?? '')).slice(0, max);
}

/** Average touches (emails we sent, calls, meetings, texts) before the win, over Close's recent wins. Pure. */
export function touchesPerClose(close: CloseSnapshot | null): Touches {
  if (!close) return { avg: null, n: 0, source: 'none', note: 'Connect Close to count the touches per close.' };
  if (!close.won.length) return { avg: null, n: 0, source: 'close', note: 'No won opportunity in Close in the last year.' };
  const avg = Math.round((close.won.reduce((a, w) => a + w.touches, 0) / close.won.length) * 10) / 10;
  return { avg, n: close.won.length, source: 'close', note: `${avg} touches per close (average of the last ${close.won.length} won in Close: emails we sent, calls, meetings, texts)` };
}
const touchesBefore = (acts: CloseActivity[], wonAt: string) => acts.filter((a) => ['Call', 'Meeting'].includes(a.type) || (['Email', 'SMS'].includes(a.type) && a.direction === 'outgoing')).filter((a) => !wonAt || a.at <= wonAt).length;

// ---------- readers (read only, cached) ----------
const CLOSE_CACHE_MS = 5 * 60_000;
let closeCache: { at: number; data: Promise<CloseSnapshot> } | null = null;
let xeroCache: { at: number; data: Promise<XeroPayment[] | null> } | null = null;
let slotCache: { at: number; data: Promise<DulcySlots | null> } | null = null;
let tables: Promise<void> | null = null;
export function _resetInsightCaches() { closeCache = null; xeroCache = null; slotCache = null; tables = null; }

/** Close: the open opportunities (3 pages), the last 30 activities of the 15 most recently updated, and touches on the last 10 wins. */
export async function readClose(close: CloseClient, now = Date.now()): Promise<CloseSnapshot> {
  const opps = await close.opportunities({ maxPages: 3 });
  const active = [...new Map(opps.filter((o) => o.statusType === 'active').sort((a, b) => b.updated.localeCompare(a.updated)).map((o) => [o.leadId, o])).values()].slice(0, 15);
  const won = opps.filter((o) => o.statusType === 'won' && o.won && now - Date.parse(o.won) <= 365 * DAY).sort((a, b) => b.won.localeCompare(a.won)).slice(0, 10);
  const acts: Record<string, CloseActivity[]> = {};
  const wonOut: { opp: CloseOpportunity; touches: number }[] = [];
  // 3 at a time: at most 25 small reads per 5 minutes.
  const jobs: (() => Promise<void>)[] = [
    ...active.map((o) => async () => { acts[o.leadId] = await close.activities(o.leadId, 30); }),
    ...won.map((o) => async () => { wonOut.push({ opp: o, touches: touchesBefore(await close.activities(o.leadId, 100), o.won) }); }),
  ];
  for (let i = 0; i < jobs.length; i += 3) await Promise.all(jobs.slice(i, i + 3).map((j) => j().catch(() => undefined)));
  return { opps, acts, won: wonOut, readAt: new Date(now).toISOString() };
}
export function cachedClose(close: CloseClient, refresh = false, now = Date.now()): Promise<CloseSnapshot> {
  if (closeCache && now - closeCache.at < (refresh ? 30_000 : CLOSE_CACHE_MS)) return closeCache.data;
  const data = readClose(close, now);
  closeCache = { at: now, data };
  data.catch(() => { if (closeCache?.data === data) closeCache = null; });
  return data;
}

const xeroDay = (x: unknown): string => { const s = String(x ?? ''); const m = /\/Date\((-?\d+)/.exec(s); const t = m ? Number(m[1]) : Date.parse(s); return Number.isFinite(t) ? nyDay(t) : ''; };
/** Map Xero invoices (money paid) and money received (bank RECEIVE lines) to payments. Pure. */
export function xeroRows(invoices: any[], received: any[]): XeroPayment[] {
  return [
    ...invoices.filter((i) => Number(i?.AmountPaid ?? 0) > 0 && i?.Contact?.Name).map((i): XeroPayment => ({ contact: String(i.Contact.Name), day: xeroDay(i.FullyPaidOnDate ?? i.DateString ?? i.Date), amount: Number(i.AmountPaid), kind: 'invoice' })),
    ...received.filter((t) => t?.Type === 'RECEIVE' && t?.Contact?.Name && t?.Status !== 'DELETED').map((t): XeroPayment => ({ contact: String(t.Contact.Name), day: xeroDay(t.DateString ?? t.Date), amount: Number(t.Total ?? 0), kind: 'received' })),
  ].filter((p) => p.day);
}
/** Xero payments of the last 400 days (null = Xero not connected on this server). Cached 10 minutes. */
export function xeroPaymentsReader(db: Db, cfg: Config, f: typeof fetch = fetch): (() => Promise<XeroPayment[] | null>) | undefined {
  if (!cfg.xeroClientId || !cfg.xeroClientSecret) return undefined;
  return () => {
    const now = Date.now();
    if (xeroCache && now - xeroCache.at < 10 * 60_000) return xeroCache.data;
    const data = (async () => {
      const t = (await db.query(`SELECT 1 FROM oauth_tokens WHERE provider='xero' AND refresh_token IS NOT NULL`)).rows[0];
      if (!t) return null;
      const x = createXeroClient(db, cfg, f);
      const [y, m, d] = nyDay(now - 400 * DAY).split('-').map(Number);
      const since = `Date>=DateTime(${y},${m},${d})`;
      const [inv, rec] = await Promise.all([
        x.pages('Invoices', 'Invoices', { where: `Type=="ACCREC" AND ${since}`, Statuses: 'AUTHORISED,PAID', summaryOnly: 'true' }, 3),
        x.pages('BankTransactions', 'BankTransactions', { where: `Type=="RECEIVE" AND ${since}` }, 3),
      ]);
      return xeroRows(inv, rec);
    })();
    xeroCache = { at: now, data };
    data.catch(() => { if (xeroCache?.data === data) xeroCache = null; });
    return data;
  };
}
/**
 * Round 3 capacity fix (Alex 2026-11-27: "Dulcy's calendar cannot be read" while Calendly IS connected).
 * Cause: the calendar service refuses any availability window over 7 days ("Invalid availability
 * window", services/dulcy-calendar calendar.mjs; Calendly's own available-times API has the same
 * 7-day limit), and capacity asked for 30 days in one call, so every read failed. The engine's normal
 * read (Echo's two times) asks for 6 days. Now the 30 days are read as 6-day windows, one after the other.
 */
export const AVAILABILITY_WINDOW_DAYS = 6;
/** The windows for the next `days` days: the first starts 2 hours from now, each at most 6 days. Pure. */
export function availabilityWindows(now: number, days = 30, step = AVAILABILITY_WINDOW_DAYS): { start: string; end: string }[] {
  const out: { start: string; end: string }[] = [];
  const end = now + days * DAY;
  for (let t = now + 2 * 3_600_000; t < end; t += step * DAY) out.push({ start: new Date(t).toISOString(), end: new Date(Math.min(end, t + step * DAY)).toISOString() });
  return out;
}
export interface DulcySlots { starts: string[]; timezone: string; days?: number; error?: string }
/** Dulcy's free start times for the next 30 days (calendar service, read-only token, 6-day windows). null = not readable. */
export function dulcySlotsReader(cfg: Pick<Config, 'calendarUrl' | 'calendarReaderToken'>, f: typeof fetch = fetch): (() => Promise<DulcySlots | null>) | undefined {
  if (!cfg.calendarReaderToken || !cfg.calendarUrl) return undefined;
  return () => {
    const now = Date.now();
    if (slotCache && now - slotCache.at < 10 * 60_000) return slotCache.data;
    const data = (async (): Promise<DulcySlots | null> => {
      const starts: string[] = []; let timezone = 'America/New_York'; let days = 0; let error = '';
      for (const w of availabilityWindows(now)) {
        try {
          const r = await f(`${cfg.calendarUrl.replace(/\/+$/, '')}/calendar/admin/availability`, {
            method: 'POST', headers: { authorization: `Bearer ${cfg.calendarReaderToken}`, 'content-type': 'application/json' },
            body: JSON.stringify({ workspace: DULCY_WS, start: w.start, end: w.end }), signal: AbortSignal.timeout(20_000),
          });
          const b: any = await r.json().catch(() => null);
          if (!r.ok || !Array.isArray(b?.collection)) { error = String(b?.error ?? `calendar service ${r.status}`).slice(0, 200); break; }
          starts.push(...b.collection.filter((s: any) => s?.status === 'available').map((s: any) => String(s.start_time)));
          timezone = String(b.connection?.timezone ?? timezone);
          days += (Date.parse(w.end) - Date.parse(w.start)) / DAY;
        } catch { error = 'the calendar service did not answer'; break; }
      }
      // The first window failing = not readable; a later one = what was read, and how many days.
      if (!days) return null;
      return { starts, timezone, days: Math.min(30, Math.round(days)), ...(error ? { error } : {}) };
    })();
    slotCache = { at: now, data };
    // A failed read is retried after 1 minute, not 10.
    data.then((x) => { if (!x && slotCache?.data === data) slotCache = { at: now - 9 * 60_000, data }; }).catch(() => undefined);
    return data;
  };
}

// ---------- settings (owner; one row) ----------
/** HQ Sales' own tables, created on first use (Batch 4a keeps to its own files; idempotent). */
export function ensureSalesTables(db: Db): Promise<void> {
  tables ??= db.query(`
    CREATE TABLE IF NOT EXISTS hq_sales_settings (
      key TEXT PRIMARY KEY, value JSONB NOT NULL DEFAULT '{}', updated_by TEXT NOT NULL DEFAULT '', updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE TABLE IF NOT EXISTS hq_contract_drafts (
      id BIGSERIAL PRIMARY KEY, deal_id TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'saved' CHECK (status IN ('saved','creating','created','failed')),
      input JSONB NOT NULL, contracts_rec TEXT, error TEXT NOT NULL DEFAULT '', created_by TEXT NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS hq_contract_drafts_deal ON hq_contract_drafts (deal_id, id DESC);`).then(() => undefined);
  tables.catch(() => { tables = null; });
  return tables;
}
export async function readCapacitySettings(db: Db): Promise<CapacitySettings> {
  await ensureSalesTables(db);
  const r = (await db.query(`SELECT value FROM hq_sales_settings WHERE key='capacity'`)).rows[0];
  return cleanSettings(r?.value ?? CAPACITY_DEFAULTS);
}
export async function saveCapacitySettings(db: Db, body: any, by: string): Promise<CapacitySettings> {
  const s = cleanSettings({ ...(await readCapacitySettings(db)), ...body });
  await db.query(`INSERT INTO hq_sales_settings (key, value, updated_by) VALUES ('capacity', $1, $2) ON CONFLICT (key) DO UPDATE SET value=EXCLUDED.value, updated_by=EXCLUDED.updated_by, updated_at=now()`, [JSON.stringify(s), by]);
  return s;
}

// ---------- the view ----------
export interface SalesDeps {
  close?: CloseClient | null;
  xero?: () => Promise<XeroPayment[] | null>;
  calendar?: () => Promise<DulcySlots | null>;
  /** Dulcy's calendar connection (Round 3): when it cannot be read, is it connected at all? */
  calendarStatus?: () => Promise<CalendarState | null>;
  /** The server can ask the calendar service for a connect link (CALENDAR_ADMIN_TOKEN). */
  canInvite?: boolean;
  /** The P/L sheet's pricing calculator tab (Round 3; pricing.ts). */
  pricingSheet?: () => Promise<import('./pricing.js').SheetGrid | null>;
}
/** The live readers from the server config (each one optional; nothing is called here). */
export function salesDeps(db: Db, cfg: Config, f: typeof fetch = fetch): SalesDeps {
  return {
    close: createCloseClient(cfg.closeApiKey, f), xero: xeroPaymentsReader(db, cfg, f), calendar: dulcySlotsReader(cfg, f),
    calendarStatus: cfg.calendarReaderToken ? () => calendarStatus(cfg, DULCY_WS, f) : undefined, canInvite: !!cfg.calendarAdminToken,
    pricingSheet: pricingSheetReader(() => (cfg.googleKeyFile ? createSheetsClient({ keyFile: cfg.googleKeyFile, impersonate: cfg.googleImpersonateUser, scope: cfg.googleScope, sheetsBaseUrl: cfg.googleSheetsBaseUrl, fetchImpl: f }) : null)),
  };
}
export interface CalendarLink { readable: boolean; connected: boolean | null; status: string; canInvite: boolean; text: string }
/** What the capacity block says about Dulcy's calendar, and whether to show "Connect calendar". Pure. */
export function calendarLinkState(cal: DulcySlots | null, st: CalendarState | null, hasReader: boolean, canInvite: boolean): CalendarLink {
  if (cal) return { readable: true, connected: true, status: 'Connected', canInvite, text: cal.error ? `Read ${cal.days ?? 0} of 30 days (${cal.error})` : '' };
  if (!hasReader) return { readable: false, connected: null, status: 'UNKNOWN', canInvite, text: 'The engine has no calendar reader token (CALENDAR_READER_TOKEN), so Dulcy\'s calendar is not read.' };
  if (!st) return { readable: false, connected: null, status: 'UNKNOWN', canInvite, text: 'The calendar service did not answer.' };
  const connected = /^connected/i.test(st.status);
  return { readable: false, connected, status: st.status, canInvite, text: connected ? `Connected (${st.provider ?? 'calendar'}), but its open times could not be read.` : `Dulcy's calendar is not connected (${st.status}).` };
}

/** GET /sales/insights: periods, capacity and the hottest deals. */
export async function insightsView(deals: Deal[], db: Db, deps: SalesDeps, canSeeMoney: boolean, opts: { now?: number; refresh?: boolean } = {}) {
  const now = opts.now ?? Date.now();
  const today = nyDay(now);
  const settings = await readCapacitySettings(db);
  let closeErr = '';
  const [snap, cal] = await Promise.all([
    deps.close ? cachedClose(deps.close, opts.refresh === true, now).catch((e) => { closeErr = String((e as Error).message ?? e).slice(0, 200); return null; }) : Promise.resolve(null),
    deps.calendar ? deps.calendar().catch(() => null) : Promise.resolve(null),
  ]);
  const st = !cal && deps.calendarStatus ? await deps.calendarStatus().catch(() => null) : null;
  const link = calendarLinkState(cal, st, !!deps.calendar, deps.canInvite === true);
  const days = cal?.days ?? 30;
  const open: OpenSlots = cal
    ? { n: countSlots(cal.starts, settings.slotMinutes), source: 'calendar', note: `From Alex's calendar (Dulcy): ${countSlots(cal.starts, settings.slotMinutes)} free ${settings.slotMinutes}-minute slots in the next ${days} days${cal.error ? ` (${cal.error})` : ''}` }
    : settings.slotsPerMonth !== null ? { n: settings.slotsPerMonth, source: 'setting', note: `Setting: ${settings.slotsPerMonth} slots a month (${link.text || 'the calendar could not be read'})` }
    : { n: null, source: 'none', note: `UNKNOWN: ${link.text || 'Dulcy\'s calendar could not be read.'} No setting is saved.` };
  const capacity = { ...capacityMath(deals, today, open, settings, touchesPerClose(snap)), calendar: link };
  const hottest = rankHottest(deals, snap, today);
  const out = {
    today, ...comparePeriods(deals, today, canSeeMoney), capacity, settings, hottest,
    close: { connected: !!deps.close, ok: !!snap, error: closeErr, readAt: snap?.readAt ?? '', open: snap ? snap.opps.filter((o) => o.statusType === 'active').length : null },
  };
  return out;
}

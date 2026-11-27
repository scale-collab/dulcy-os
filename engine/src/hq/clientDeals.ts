// Batch 2 (Alex 2026-11-27): the money and results math behind HQ Clients. All pure, so it is tested
// with fixed data.
//   - Deal terms: retainer, pay per call, or both. Source order: the "Dulcy Media P/L" sheet's
//     billing lines (Alex's own record, read live, owner only) > the signed agreements / billing
//     terms already recorded in clients/*.md > Airtable (Monthly Fee, Billing Rate). Why: Airtable's
//     Monthly Fee is stale ($2,900 on Global Media Group, who pay per call only), split across the
//     active and inactive Twenty West records, and empty on MJJ and The Marketing Cartel. That is
//     why HQ showed $6,900/month instead of about $7.7K.
//   - LTV: what the deal earned so far (retainer x months + per-call rate x booked meetings), not
//     the Xero "Actual Lifetime Revenue" field (it only matched the Xero invoices: Human Marketing
//     showed $1,500 after 4.5 months). The Xero figure is still shown next to it.
//   - Health: judged on the promised meetings KPI (Safe / At risk / Needs attention), UNKNOWN when
//     no KPI is on record.

export type DealType = 'retainer' | 'per_call' | 'both' | 'unknown';
export interface DealLine { label: string; monthly: number; perCall: number }
export interface Deal {
  type: DealType; retainer: number; perCall: number; lines: DealLine[];
  /** Where the numbers come from, in words. */
  source: string; startDate: string; endDate: string;
}

/**
 * Contract facts already in the repo (clients/*.md, company/client-pricing-and-goals-2026-11-17.md),
 * used when the P/L sheet cannot be read. Keyed by clientKey(). Never copy one client's terms to another.
 */
export const KNOWN_TERMS: Record<string, { lines: DealLine[]; source: string; startDate?: string; endDate?: string }> = {
  twentywestmedia: { lines: [{ label: 'Monthly', monthly: 1500, perCall: 0 }, { label: 'Assets', monthly: 1495, perCall: 0 }], source: 'P/L billing lines (clients/twenty-west-media.md)' },
  themarketingcartel: { lines: [{ label: 'Monthly tech fee', monthly: 1250, perCall: 175 }], source: 'signed agreement 2026-09-16 (clients/the-marketing-cartel.md)', startDate: '2026-09-16' },
  humanmarketing: { lines: [{ label: 'Monthly', monthly: 1500, perCall: 250 }], source: 'P/L + kickoff call 2026-07-14 (clients/human-marketing.md)' },
  brilliantjewelersmjjinc: { lines: [{ label: 'Monthly', monthly: 2000, perCall: 0 }], source: 'signed agreement 2026-10-06 (clients/mjj-brilliant.md)', startDate: '2026-10-06' },
  globalmediagroupltd: { lines: [{ label: 'Per qualified call', monthly: 0, perCall: 280 }], source: 'billing terms, owner-confirmed (clients/global-media-group-scroll-stop.md)' },
  leadflomarketing: { lines: [{ label: 'Monthly tech fee', monthly: 1000, perCall: 250 }], source: 'call summaries (clients/lead-flo-marketing.md)', endDate: '2026-11-25' },
};
/** P/L sheet names that are not the Airtable name. */
export const SHEET_ALIASES: Record<string, string> = { mjjjewerly: 'brilliantjewelersmjjinc', mjjjewelry: 'brilliantjewelersmjjinc', mjjbrilliant: 'brilliantjewelersmjjinc', scrollstop: 'globalmediagroupltd' };

export const typeOf = (retainer: number, perCall: number): DealType => (retainer > 0 && perCall > 0 ? 'both' : retainer > 0 ? 'retainer' : perCall > 0 ? 'per_call' : 'unknown');
export const DEAL_LABEL: Record<DealType, string> = { retainer: 'Retainer', per_call: 'Pay per call', both: 'Retainer + pay per call', unknown: 'Deal UNKNOWN' };

/** One client's deal from the sources, best first. Pure. */
export function dealFor(o: {
  key: string; sheetLines?: DealLine[] | null; airtableFee?: number; airtableRate?: number; startDate?: string; endDate?: string;
}): Deal {
  const known = KNOWN_TERMS[o.key];
  const make = (lines: DealLine[], source: string): Deal => {
    const retainer = lines.reduce((a, l) => a + (l.monthly || 0), 0);
    const perCall = Math.max(0, ...lines.map((l) => l.perCall || 0));
    return { type: typeOf(retainer, perCall), retainer, perCall, lines, source, startDate: o.startDate || known?.startDate || '', endDate: o.endDate || known?.endDate || '' };
  };
  if (o.sheetLines?.length) return make(o.sheetLines, 'Dulcy Media P/L sheet');
  if (known) return make(known.lines, known.source);
  if ((o.airtableFee ?? 0) > 0 || (o.airtableRate ?? 0) > 0) return make([{ label: 'Monthly', monthly: o.airtableFee ?? 0, perCall: o.airtableRate ?? 0 }], 'Airtable (Monthly Fee, Billing Rate)');
  return make([], 'UNKNOWN');
}

const DAY = 86_400_000;
export const MONTH_DAYS = 30.43;
const day = (iso: string): number => Date.parse(`${String(iso).slice(0, 10)}T12:00:00Z`);
/** Months between two dates, 1 decimal (Airtable's Months Active uses the same 30.43 days). */
export function monthsBetween(start: string, end: string | Date): number | null {
  const a = day(start); const b = end instanceof Date ? end.getTime() : day(end);
  if (!Number.isFinite(a) || !Number.isFinite(b) || b < a) return null;
  return Math.round(((b - a) / DAY / MONTH_DAYS) * 10) / 10;
}

export interface Ltv { value: number | null; source: 'deal' | 'recorded' | null; note: string }
/**
 * Lifetime value so far. With a known deal: retainer x months + per-call rate x booked meetings.
 * Without one: the larger of Xero's recorded revenue and Airtable's estimate. Pure.
 */
export function ltvOf(deal: Deal, months: number | null, meetings: number | null, recorded: number | null, airtableEstimate: number | null): Ltv {
  if (deal.type !== 'unknown' && months !== null) {
    const fromRetainer = deal.retainer * months; const fromCalls = deal.perCall * (meetings ?? 0);
    const parts = [deal.retainer ? `${months} months x $${deal.retainer.toLocaleString('en-US')}` : '', deal.perCall ? `${meetings ?? 0} booked x $${deal.perCall.toLocaleString('en-US')}` : ''].filter(Boolean).join(' + ');
    return { value: Math.round(fromRetainer + fromCalls), source: 'deal', note: `${parts}${recorded ? `; Xero has $${Math.round(recorded).toLocaleString('en-US')} recorded` : ''}` };
  }
  const best = Math.max(recorded ?? 0, airtableEstimate ?? 0);
  return best > 0 ? { value: Math.round(best), source: 'recorded', note: recorded ? 'Xero recorded revenue' : 'Airtable estimate' } : { value: null, source: null, note: 'UNKNOWN' };
}

// ---------- Periods ----------
export const PERIODS = ['this-month', 'last-month', '3m', '6m', '12m', 'this-year'] as const;
export type Period = typeof PERIODS[number];
export const PERIOD_LABEL: Record<Period, string> = { 'this-month': 'This month', 'last-month': 'Last month', '3m': 'Last 3 months', '6m': 'Last 6 months', '12m': 'Last 12 months', 'this-year': 'This year' };
export interface Range { from: string; to: string; label: string }
const ymd = (t: number) => new Date(t).toISOString().slice(0, 10);
const addMonths = (y: number, m: number, n: number): [number, number] => { const k = y * 12 + (m - 1) + n; return [Math.floor(k / 12), (k % 12) + 1]; };
const first = (y: number, m: number) => `${y}-${String(m).padStart(2, '0')}-01`;
/** The period [from, to) and the one before it (same length; "this year" compares with the same days last year). Pure. */
export function periodRanges(p: Period, now: Date): { cur: Range; prev: Range } {
  const today = ymd(now.getTime()); const tomorrow = ymd(day(today) + DAY);
  const [y, m] = [Number(today.slice(0, 4)), Number(today.slice(5, 7))];
  if (p === 'this-month') { const [py, pm] = addMonths(y, m, -1); return { cur: { from: first(y, m), to: tomorrow, label: 'This month' }, prev: { from: first(py, pm), to: first(y, m), label: 'Last month' } }; }
  if (p === 'last-month') { const [a, b] = addMonths(y, m, -1); const [c, d] = addMonths(y, m, -2); return { cur: { from: first(a, b), to: first(y, m), label: 'Last month' }, prev: { from: first(c, d), to: first(a, b), label: 'The month before' } }; }
  if (p === 'this-year') { const lastYearTo = `${y - 1}${tomorrow.slice(4)}`; return { cur: { from: `${y}-01-01`, to: tomorrow, label: `${y} so far` }, prev: { from: `${y - 1}-01-01`, to: lastYearTo, label: `${y - 1}, same days` } }; }
  const n = p === '3m' ? 3 : p === '6m' ? 6 : 12;
  const [a, b] = addMonths(y, m, -n); const [c, d] = addMonths(y, m, -2 * n);
  const dd = today.slice(8, 10);
  const back = (yy: number, mm: number) => { const last = new Date(Date.UTC(yy, mm, 0)).getUTCDate(); return `${yy}-${String(mm).padStart(2, '0')}-${String(Math.min(Number(dd), last)).padStart(2, '0')}`; };
  const fromCur = ymd(day(back(a, b)) + DAY); const fromPrev = ymd(day(back(c, d)) + DAY);
  return { cur: { from: fromCur, to: tomorrow, label: PERIOD_LABEL[p] }, prev: { from: fromPrev, to: fromCur, label: `The ${n} months before` } };
}

// ---------- Agency numbers ----------
export interface BookClient { key: string; name: string; active: boolean; start: string; end: string; retainer: number; ltv: number | null }
export interface RangeNumbers { label: string; from: string; to: string; newClients: number; lost: number; net: number; activeAtStart: number; churnRate: number | null; newNames: string[]; lostNames: string[] }
export interface AgencyNumbers {
  period: Period; mrr: number; activeClients: number; avgLtv: number | null; avgRetentionMonths: number | null;
  cur: RangeNumbers; prev: RangeNumbers;
  /** Paying clients counted, and inactive ones with no end date (left out of "lost"). */
  counted: number; noEndDate: string[];
}
const inRange = (d: string, r: Range) => !!d && d.slice(0, 10) >= r.from && d.slice(0, 10) < r.to;
/** New, lost, net and monthly churn in one range. Churn = lost / active at the start / months. Pure. */
export function rangeNumbers(book: BookClient[], r: Range): RangeNumbers {
  const neu = book.filter((c) => inRange(c.start, r));
  const lost = book.filter((c) => !c.active && inRange(c.end, r));
  // Inactive clients with no end date cannot be placed in time: left out (listed in noEndDate).
  const activeAtStart = book.filter((c) => c.start && c.start.slice(0, 10) < r.from && (c.active || (!!c.end && c.end.slice(0, 10) >= r.from))).length;
  const months = Math.max(1, Math.round((day(r.to) - day(r.from)) / DAY / MONTH_DAYS));
  return {
    label: r.label, from: r.from, to: r.to, newClients: neu.length, lost: lost.length, net: neu.length - lost.length, activeAtStart,
    churnRate: activeAtStart ? Math.round((lost.length / activeAtStart / months) * 1000) / 10 : null, newNames: neu.map((c) => c.name), lostNames: lost.map((c) => c.name),
  };
}
/** The Clients screen's agency numbers. LTV and retention cover every paying client ever. Pure. */
export function agencyNumbers(book: BookClient[], period: Period, now: Date): AgencyNumbers {
  const { cur, prev } = periodRanges(period, now);
  const active = book.filter((c) => c.active);
  const ltvs = book.map((c) => c.ltv).filter((x): x is number => (x ?? 0) > 0);
  const tenure = book.map((c) => (c.start ? monthsBetween(c.start, c.active || !c.end ? now : c.end) : null)).filter((x): x is number => x !== null);
  const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
  const a = avg(ltvs); const t = avg(tenure);
  return {
    period, mrr: active.reduce((s, c) => s + c.retainer, 0), activeClients: active.length,
    avgLtv: a === null ? null : Math.round(a), avgRetentionMonths: t === null ? null : Math.round(t * 10) / 10,
    cur: rangeNumbers(book, cur), prev: rangeNumbers(book, prev), counted: book.length, noEndDate: book.filter((c) => !c.active && !c.end).map((c) => c.name),
  };
}

// ---------- Results (EmailBison, via Airtable "Email Analytics Overview") ----------
export const WINDOWS = ['10', '30', '60', '120', 'all'] as const;
export type Window = typeof WINDOWS[number];
export const WINDOW_PERIOD: Record<Window, string> = { 10: 'Last 10 days', 30: 'Last 30 days', 60: 'Last 60 days', 120: 'Last 120 days', all: 'All time' };
export interface OverviewRow { period: string; clientId: string; sent: number; replies: number; interested: number; meetings: number; updatedAt: string }
export interface Results {
  window: Window; sent: number; replies: number; interested: number; meetings: number;
  /** Emails sent per meeting booked / per interested (positive) reply; null when there are none. */
  emailsPerMeeting: number | null; emailsPerPositive: number | null; interestedToBooked: number | null;
  /** True when every row for this window is older than 3 days (the sync stopped). */
  stale: boolean;
}
export const ratio = (a: number, b: number) => (b > 0 ? Math.round(a / b) : null);
/**
 * A client's results for one window: the rows of all its EmailBison workspaces added up. A windowed
 * row not updated for 3+ days belongs to a workspace that stopped syncing (Twenty West's old
 * workspace stopped in September): it counts as nothing sent in that window. Pure.
 */
export function resultsFor(rows: OverviewRow[], bisonIds: string[], w: Window, now: Date): Results | null {
  const mine = rows.filter((r) => bisonIds.includes(String(r.clientId)) && r.period === WINDOW_PERIOD[w]);
  if (!mine.length) return null;
  const fresh = w === 'all' ? mine : mine.filter((r) => now.getTime() - Date.parse(r.updatedAt) < 3 * DAY);
  const use = fresh.length ? fresh : mine;
  const sum = (k: 'sent' | 'replies' | 'interested' | 'meetings') => use.reduce((a, r) => a + (r[k] || 0), 0);
  const sent = sum('sent'), interested = sum('interested'), meetings = sum('meetings');
  return {
    window: w, sent, replies: sum('replies'), interested, meetings,
    emailsPerMeeting: ratio(sent, meetings), emailsPerPositive: ratio(sent, interested), interestedToBooked: interested > 0 ? Math.round((meetings / interested) * 1000) / 1000 : null,
    stale: !fresh.length,
  };
}

// ---------- Health against the promised KPI ----------
export type Health = 'safe' | 'at_risk' | 'attention' | 'unknown' | 'inactive';
export const HEALTH_LABEL: Record<Health, string> = { safe: 'Safe', at_risk: 'At risk', attention: 'Needs attention', unknown: 'KPI UNKNOWN', inactive: 'Inactive' };
export interface Insight { problem: string; decision: string; support: string }
/** First number in a KPI text ("10–20 qualified appointments per month" → 10). */
export function kpiNumber(x: unknown): number | null {
  const t = Array.isArray(x) ? String(x[0] ?? '') : String(x ?? '');
  const m = /\d+(?:\.\d+)?/.exec(t);
  const n = m ? Number(m[0]) : NaN;
  return Number.isFinite(n) && n > 0 ? n : null;
}
/**
 * Safe (on pace for the KPI), At risk (50-99% of pace), Needs attention (under 50%, or nothing
 * sending). A client in its first 30 days is judged on the days it has had. Pure.
 */
export function healthOf(c: { active: boolean; kpi: number | null; meetings30: number; interested30: number; sent30: number | null; activeCampaigns: number; startDate: string }, now: Date): { health: Health; insight: Insight | null; pace: number | null } {
  if (!c.active) return { health: 'inactive', insight: null, pace: null };
  const met = `${c.meetings30} meeting${c.meetings30 === 1 ? '' : 's'} booked in 30 days`;
  if (!c.activeCampaigns) return { health: 'attention', pace: null, insight: { problem: 'Nothing is sending.', decision: 'Atlas: launch the next campaign.', support: `0 active campaigns; ${met}.` } };
  if (!c.kpi) return { health: 'unknown', pace: null, insight: { problem: 'No promised meetings KPI on record.', decision: 'Atlas: confirm the KPI with Alex.', support: `${met}.` } };
  const days = c.startDate ? (now.getTime() - day(c.startDate)) / DAY : 30;
  const expected = c.kpi * Math.min(1, Math.max(days, 1) / 30);
  const pace = expected > 0 ? c.meetings30 / expected : null;
  const kpiLine = `${c.meetings30} of ${c.kpi} meetings a month (KPI)${days < 30 ? `, ${Math.round(days)} days in` : ''}`;
  if (pace !== null && pace >= 1) return { health: 'safe', pace, insight: { problem: `On track: ${kpiLine}.`, decision: 'Keep going.', support: support(c) } };
  const health: Health = pace !== null && pace >= 0.5 ? 'at_risk' : 'attention';
  const conv = c.interested30 ? c.meetings30 / c.interested30 : null;
  const decision = c.interested30 >= 10 && conv !== null && conv < 0.2 ? 'Echo: turn more interested replies into booked calls.'
    : c.sent30 !== null && c.sent30 < 5000 ? 'Atlas: send more (add inboxes or a new list).'
      : 'Atlas: change the angle (offer, list or copy).';
  return { health, pace, insight: { problem: `Under KPI: ${kpiLine}.`, decision, support: support(c) } };
}
function support(c: { meetings30: number; interested30: number; sent30: number | null }): string {
  const parts = [] as string[];
  if (c.sent30 !== null) parts.push(`${c.sent30.toLocaleString('en-US')} emails sent`);
  parts.push(`${c.interested30} interested`);
  if (c.interested30) parts.push(`${Math.round((c.meetings30 / c.interested30) * 100)}% booked`);
  if (c.sent30 && c.meetings30) parts.push(`1 meeting per ${Math.round(c.sent30 / c.meetings30).toLocaleString('en-US')} emails`);
  return `30 days: ${parts.join(', ')}.`;
}

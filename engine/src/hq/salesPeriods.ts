// Round 3 (Alex 2026-11-27): one period picker for Sales. "This month vs last month", "This quarter
// vs last quarter", "This year vs last year", "Last 30 days" (the pipeline's default) and a custom
// range (compared with the same number of days right before it). Days are New York days (YYYY-MM-DD).
// numbersView: bookings, shows, qualified, contracts sent, signed, paid and new monthly money (owner
// only) per day / week / month, as running totals, with the previous period on the same chart.
import { nyDay, type Deal } from './sales.js';
import { metricDay, METRICS, type MetricKey } from './salesInsights.js';

const DAY = 86_400_000;
export const PERIOD_KEYS = ['last30', 'month', 'quarter', 'year', 'custom'] as const;
export type PeriodKey = (typeof PERIOD_KEYS)[number];
export interface Window { from: string; to: string; label: string }
export interface PeriodPick { key: PeriodKey; title: string; now: Window; prev: Window }

const LONG = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const pad = (x: number) => String(x).padStart(2, '0');
const dayMs = (d: string) => Date.parse(`${d}T12:00:00Z`);
export const addDays = (d: string, k: number) => new Date(dayMs(d) + k * DAY).toISOString().slice(0, 10);
export const daysIn = (w: { from: string; to: string }) => Math.round((dayMs(w.to) - dayMs(w.from)) / DAY) + 1;
const lastDay = (y: number, m: number) => new Date(Date.UTC(y, m, 0)).getUTCDate();
const isDay = (x: unknown): x is string => typeof x === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(x) && Number.isFinite(Date.parse(`${x}T00:00:00Z`)) && new Date(`${x}T00:00:00Z`).toISOString().slice(0, 10) === x;
/** Dates in HQ use slashes (RULES, round 2): 11/27, with the year only when it is not this year. */
export const slash = (d: string, today = '') => { const [y, m, dd] = d.split('-').map(Number); return `${m}/${dd}${today && today.slice(0, 4) !== String(y) ? `/${String(y).slice(2)}` : ''}`; };

/** The period and the one it is compared with. Custom: from..to vs the same length right before. Pure. */
export function resolvePeriod(key: string, today: string, from?: string, to?: string): PeriodPick | { error: string } {
  const [y, m] = today.split('-').map(Number);
  switch (key) {
    case 'last30': return { key, title: 'Last 30 days vs the 30 before', now: { from: addDays(today, -29), to: today, label: 'Last 30 days' }, prev: { from: addDays(today, -59), to: addDays(today, -30), label: 'The 30 days before' } };
    case 'month': {
      const pm = m === 1 ? 12 : m - 1, py = m === 1 ? y - 1 : y;
      return { key, title: 'This month vs last month', now: { from: `${y}-${pad(m)}-01`, to: today, label: `${LONG[m - 1]} so far` }, prev: { from: `${py}-${pad(pm)}-01`, to: `${py}-${pad(pm)}-${pad(lastDay(py, pm))}`, label: LONG[pm - 1] } };
    }
    case 'quarter': {
      const q = Math.floor((m - 1) / 3); const pq = q === 0 ? 3 : q - 1; const py = q === 0 ? y - 1 : y;
      return {
        key, title: 'This quarter vs last quarter',
        now: { from: `${y}-${pad(q * 3 + 1)}-01`, to: today, label: `Q${q + 1} ${y} so far` },
        prev: { from: `${py}-${pad(pq * 3 + 1)}-01`, to: `${py}-${pad(pq * 3 + 3)}-${pad(lastDay(py, pq * 3 + 3))}`, label: `Q${pq + 1} ${py}` },
      };
    }
    case 'year': return { key, title: 'This year vs last year', now: { from: `${y}-01-01`, to: today, label: `${y} so far` }, prev: { from: `${y - 1}-01-01`, to: `${y - 1}-12-31`, label: String(y - 1) } };
    case 'custom': {
      if (!isDay(from) || !isDay(to)) return { error: 'Pick a start and an end date.' };
      if (from > to) return { error: 'The start is after the end.' };
      const n = daysIn({ from, to });
      if (n > 731) return { error: 'At most 2 years at a time.' };
      return { key, title: `${slash(from, today)}–${slash(to, today)} vs the ${n} days before`, now: { from, to, label: `${slash(from, today)}–${slash(to, today)}` }, prev: { from: addDays(from, -n), to: addDays(from, -1), label: `The ${n} days before` } };
    }
  }
  return { error: `period must be one of ${PERIOD_KEYS.join(', ')}` };
}

export type BucketUnit = 'day' | 'week' | 'month';
/** day up to 31 days, week up to 120, else month. Pure. */
export const bucketUnit = (w: { from: string; to: string }): BucketUnit => (daysIn(w) <= 31 ? 'day' : daysIn(w) <= 120 ? 'week' : 'month');
/** The bucket starts for a window (each bucket = [start, next start)), with short labels. Pure. */
export function buckets(w: { from: string; to: string }, unit: BucketUnit, today = ''): { start: string; label: string }[] {
  const out: { start: string; label: string }[] = [];
  if (unit === 'month') {
    let [y, m] = w.from.split('-').map(Number);
    out.push({ start: w.from, label: SHORT[m - 1] });
    for (;;) { m++; if (m > 12) { m = 1; y++; } const s = `${y}-${pad(m)}-01`; if (s > w.to) break; out.push({ start: s, label: SHORT[m - 1] }); }
    return out;
  }
  const step = unit === 'day' ? 1 : 7;
  for (let d = w.from; d <= w.to; d = addDays(d, step)) out.push({ start: d, label: slash(d, today) });
  return out;
}
/** Running totals of days per bucket (a day before the window counts 0). Pure. */
export function runningTotals(days: string[], b: { start: string }[], w: { from: string; to: string }, weights?: number[]): number[] {
  const per = b.map(() => 0);
  days.forEach((d, i) => {
    if (!d || d < w.from || d > w.to) return;
    let k = 0; while (k + 1 < b.length && b[k + 1].start <= d) k++;
    per[k] += weights ? weights[i] : 1;
  });
  let run = 0; return per.map((x) => (run += x));
}

export interface Delta { now: number; prev: number; diff: number; dir: 'up' | 'down' | 'same'; pct: number | null }
const delta = (now: number, prev: number): Delta => ({ now, prev, diff: now - prev, dir: now > prev ? 'up' : now < prev ? 'down' : 'same', pct: prev ? Math.round(((now - prev) / prev) * 100) : null });
export interface NumbersMetric extends Delta { key: MetricKey | 'money'; label: string; series: { now: number[]; prev: number[] }; unknownNow?: number; unknownPrev?: number }
export interface NumbersView { period: PeriodPick; unit: BucketUnit; labels: { now: string[]; prev: string[] }; metrics: NumbersMetric[]; conclusion: string; today: string }

/** The Numbers tab: each metric this period vs the one before, as running totals. Money = monthly fee of deals signed (owner only). Pure. */
export function numbersView(deals: Deal[], pick: PeriodPick, canSeeMoney: boolean, today = nyDay(Date.now())): NumbersView {
  const unit = bucketUnit(pick.now);
  const bn = buckets(pick.now, unit, today), bp = buckets(pick.prev, unit, today);
  const metrics: NumbersMetric[] = METRICS.map((m) => {
    const days = deals.map((d) => metricDay(d, m.key));
    const now = runningTotals(days, bn, pick.now), prev = runningTotals(days, bp, pick.prev);
    return { key: m.key, label: m.label, ...delta(now.at(-1) ?? 0, prev.at(-1) ?? 0), series: { now, prev } };
  });
  if (canSeeMoney) {
    const signed = deals.map((d) => metricDay(d, 'signed'));
    const w = deals.map((d) => d.money?.monthly ?? 0);
    const now = runningTotals(signed, bn, pick.now, w), prev = runningTotals(signed, bp, pick.prev, w);
    const unknown = (win: Window) => deals.filter((d, i) => signed[i] && signed[i] >= win.from && signed[i] <= win.to && d.money?.monthly == null).length;
    metrics.push({ key: 'money', label: 'New monthly money', ...delta(now.at(-1) ?? 0, prev.at(-1) ?? 0), series: { now, prev }, unknownNow: unknown(pick.now), unknownPrev: unknown(pick.prev) });
  }
  const get = (k: string) => metrics.find((x) => x.key === k)!;
  const part = (r: Delta, word: string) => (r.dir === 'same' ? `${word} the same (${r.now})` : `${word} ${r.dir} ${Math.abs(r.diff)} (${r.now} vs ${r.prev})`);
  const b = get('booked'), s = get('signed'), sh = get('showed');
  const lead = b.now + b.prev + s.now + s.prev === 0 ? 'No calls or signed deals in either period' : `${part(b, 'Calls')}, ${part(sh, 'showed')}, ${part(s, 'signed')}`;
  return { period: pick, unit, labels: { now: bn.map((x) => x.label), prev: bp.map((x) => x.label) }, metrics, conclusion: `${pick.now.label} vs ${pick.prev.label}: ${lead}.`, today };
}

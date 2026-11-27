// Round 3: the one period picker for Sales (Numbers, Pipeline, Funnel) and a small SVG line chart.
// Period: This month vs last month / This quarter vs last quarter / This year vs last year / Last 30
// days / Custom range. Kept in the address (?period=…&from=…&to=…) so a refresh keeps it.
// Chart (dataviz method): change over time = a line; this period = the accent line (2px), the period
// before = a dashed neutral line (shape + color, so never color alone); a legend under the title,
// recessive grid; a crosshair tooltip on hover/focus; numbers in text inks; a table view for screen readers.
import { useMemo, useState } from 'react';
import type { SalesPeriodKey, SalesPeriodPick } from '../../api';
import { cx } from '../../ui';

export interface PeriodState { key: SalesPeriodKey; from: string; to: string }
const KEYS: SalesPeriodKey[] = ['last30', 'month', 'quarter', 'year', 'custom'];
const LABEL: Record<SalesPeriodKey, string> = { last30: 'Last 30 days', month: 'Month vs last', quarter: 'Quarter vs last', year: 'Year vs last', custom: 'Custom' };
const isDay = (x: string) => /^\d{4}-\d{2}-\d{2}$/.test(x);

export function readPeriod(fallback: SalesPeriodKey): PeriodState {
  const q = new URLSearchParams(window.location.hash.split('?')[1] ?? '');
  const k = q.get('period') as SalesPeriodKey | null;
  return { key: k && KEYS.includes(k) ? k : fallback, from: isDay(q.get('from') ?? '') ? q.get('from')! : '', to: isDay(q.get('to') ?? '') ? q.get('to')! : '' };
}
export const periodQuery = (p: PeriodState) => `period=${p.key}${p.key === 'custom' && p.from && p.to ? `&from=${p.from}&to=${p.to}` : ''}`;
export function savePeriod(p: PeriodState) {
  const base = window.location.hash.split('?')[0];
  try { window.history.replaceState(null, '', `${base}?${periodQuery(p)}`); } catch { /* display only */ }
}

export function PeriodPicker({ value, onChange, keys = KEYS, pick }: { value: PeriodState; onChange: (p: PeriodState) => void; keys?: SalesPeriodKey[]; pick?: SalesPeriodPick | null }) {
  const [from, setFrom] = useState(value.from); const [to, setTo] = useState(value.to);
  const set = (p: PeriodState) => { savePeriod(p); onChange(p); };
  return (
    <div className="space-y-2">
      <div role="radiogroup" aria-label="Period" className="flex flex-wrap gap-1 rounded-xl border border-line bg-sunken p-1">
        {keys.map((k) => (
          <button key={k} role="radio" aria-checked={value.key === k} onClick={() => (k === 'custom' ? set({ key: 'custom', from: from || value.from, to: to || value.to }) : set({ key: k, from: '', to: '' }))}
            className={cx('min-h-10 flex-1 whitespace-nowrap rounded-lg px-3 text-sm font-semibold transition', value.key === k ? 'bg-surface text-fg shadow-card' : 'text-muted hover:text-fg')}>{LABEL[k]}</button>
        ))}
      </div>
      {value.key === 'custom' && (
        <div className="flex flex-wrap items-end gap-2">
          <label className="text-xs text-muted">From<input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="mt-1 block min-h-10 rounded-xl border border-line bg-surface px-3 text-sm text-fg" /></label>
          <label className="text-xs text-muted">To<input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="mt-1 block min-h-10 rounded-xl border border-line bg-surface px-3 text-sm text-fg" /></label>
          <button disabled={!isDay(from) || !isDay(to)} onClick={() => set({ key: 'custom', from, to })} className="min-h-10 rounded-xl bg-ink px-4 text-sm font-semibold text-ink-fg disabled:opacity-40">Show</button>
        </div>
      )}
      {pick && <div className="text-xs text-muted">{pick.now.label} ({slash(pick.now.from)}–{slash(pick.now.to)}) vs {pick.prev.label} ({slash(pick.prev.from)}–{slash(pick.prev.to)})</div>}
    </div>
  );
}
/** Dates in HQ use slashes (11/27). */
export const slash = (d: string) => (d ? `${Number(d.slice(5, 7))}/${Number(d.slice(8, 10))}` : '');

/** Two running totals on one axis: this period (accent, solid) vs the one before (neutral, dashed). */
export function CompareChart({ title, now, prev, labels, nowLabel, prevLabel, fmt = (x) => String(x) }: {
  title: string; now: number[]; prev: number[]; labels: { now: string[]; prev: string[] }; nowLabel: string; prevLabel: string; fmt?: (x: number) => string;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const W = 320, H = 120, L = 30, R = 8, T = 8, B = 20;
  const n = Math.max(now.length, prev.length, 2);
  const max = Math.max(1, ...now, ...prev);
  const nice = useMemo(() => { const p = 10 ** Math.floor(Math.log10(max)); const s = [1, 2, 2.5, 5, 10].find((k) => k * p >= max)! * p; return s; }, [max]);
  const x = (i: number) => L + (i / (n - 1)) * (W - L - R);
  const y = (v: number) => T + (1 - v / nice) * (H - T - B);
  const path = (xs: number[]) => xs.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join('');
  const at = hover ?? null;
  const tick = (i: number) => labels.now[i] ?? labels.prev[i] ?? '';
  // x ticks from this period (its own dates); the period before is compared position by position.
  const lastNow = Math.max(0, now.length - 1);
  const ticks = [0, Math.floor(lastNow / 2), lastNow].filter((v, i, a) => a.indexOf(v) === i);
  const grid = Number.isInteger(nice / 2) ? [0, 0.5, 1] : [0, 1];
  return (
    <figure className="min-w-0 rounded-2xl border border-line bg-surface p-4 shadow-card">
      <figcaption className="flex items-baseline justify-between gap-2">
        <span className="truncate text-sm font-semibold text-fg">{title}</span>
        <span className="tabular shrink-0 text-xs text-muted"><span className="text-[15px] font-bold text-fg">{fmt(now.at(-1) ?? 0)}</span> vs {fmt(prev.at(-1) ?? 0)}</span>
      </figcaption>
      <div className="mt-1 flex flex-wrap gap-3 text-[11px] text-muted" aria-hidden="true">
        <span className="inline-flex items-center gap-1"><svg width="16" height="6"><line x1="0" y1="3" x2="16" y2="3" stroke="var(--accent)" strokeWidth="2" /></svg>{nowLabel}</span>
        <span className="inline-flex items-center gap-1"><svg width="16" height="6"><line x1="0" y1="3" x2="16" y2="3" stroke="var(--muted)" strokeWidth="2" strokeDasharray="3 2" /></svg>{prevLabel}</span>
      </div>
      <div className="relative">
        <svg viewBox={`0 0 ${W} ${H}`} className="mt-1 block h-auto w-full overflow-visible" role="img" aria-label={`${title}: ${fmt(now.at(-1) ?? 0)} ${nowLabel} vs ${fmt(prev.at(-1) ?? 0)} ${prevLabel}`}
          onMouseLeave={() => setHover(null)}
          onMouseMove={(e) => { const r = (e.currentTarget as SVGSVGElement).getBoundingClientRect(); const px = ((e.clientX - r.left) / r.width) * W; setHover(Math.max(0, Math.min(n - 1, Math.round(((px - L) / (W - L - R)) * (n - 1))))); }}>
          {grid.map((f) => <g key={f}><line x1={L} x2={W - R} y1={y(nice * f)} y2={y(nice * f)} stroke="var(--line)" strokeWidth="1" /><text x={L - 4} y={y(nice * f) + 3} textAnchor="end" fontSize="9" fill="var(--muted)">{fmt(nice * f)}</text></g>)}
          {ticks.map((i) => <text key={i} x={x(i)} y={H - 6} textAnchor={i === 0 ? 'start' : i === n - 1 ? 'end' : 'middle'} fontSize="9" fill="var(--muted)">{tick(i)}</text>)}
          {prev.length > 0 && <path d={path(prev)} fill="none" stroke="var(--muted)" strokeWidth="2" strokeDasharray="4 3" strokeLinejoin="round" strokeLinecap="round" />}
          {now.length > 0 && <path d={path(now)} fill="none" stroke="var(--accent)" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />}
          {now.length > 0 && <circle cx={x(now.length - 1)} cy={y(now.at(-1)!)} r="4" fill="var(--accent)" stroke="var(--surface)" strokeWidth="2" />}
          {at !== null && <g><line x1={x(at)} x2={x(at)} y1={T} y2={H - B} stroke="var(--line-strong)" strokeWidth="1" />
            {at < now.length && <circle cx={x(at)} cy={y(now[at])} r="4" fill="var(--accent)" stroke="var(--surface)" strokeWidth="2" />}
            {at < prev.length && <circle cx={x(at)} cy={y(prev[at])} r="4" fill="var(--muted)" stroke="var(--surface)" strokeWidth="2" />}</g>}
        </svg>
        {at !== null && (
          <div className="pointer-events-none absolute top-0 z-10 rounded-lg border border-line bg-raised px-2.5 py-1.5 text-xs shadow-pop" style={{ left: `${Math.min(70, (x(at) / W) * 100)}%` }}>
            <div className="tabular text-fg"><span className="font-semibold">{labels.now[at] ?? '–'}</span>: {at < now.length ? fmt(now[at]) : '–'}</div>
            <div className="tabular text-muted">{labels.prev[at] ?? '–'}: {at < prev.length ? fmt(prev[at]) : '–'}</div>
          </div>
        )}
      </div>
      <table className="sr-only"><caption>{title}, running total</caption><thead><tr><th>Step</th><th>{nowLabel}</th><th>{prevLabel}</th></tr></thead>
        <tbody>{Array.from({ length: n }, (_, i) => <tr key={i}><td>{tick(i)}</td><td>{i < now.length ? fmt(now[i]) : ''}</td><td>{i < prev.length ? fmt(prev[i]) : ''}</td></tr>)}</tbody></table>
    </figure>
  );
}

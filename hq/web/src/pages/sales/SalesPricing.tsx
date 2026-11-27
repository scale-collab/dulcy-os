// Round 3 Pricing tab (owner only): the "Dulcy Media P/L" sheet's pricing calculator. The engine reads
// the sheet's calculator tab (formulas and values, read only) and works out the results with the
// inputs typed here. The sheet itself is never changed. If the sheet cannot be read, a built-in
// calculator is shown with its assumptions written out.
import { useEffect, useRef, useState } from 'react';
import { api, type PriceInput, type PriceOutput, type PricingModel } from '../../api';
import { Button, Card, cx, ErrorBox, PageSkeleton, Pill, SectionHeader, timeAgo, usd } from '../../ui';

const show = (v: number | string | null, kind: PriceOutput['kind']) => {
  if (v === null) return '–';
  if (typeof v === 'string') return v;
  if (kind === 'money') return Math.abs(v) < 100 && v % 1 ? `$${v.toFixed(2)}` : usd(v);
  if (kind === 'pct') return `${Math.round(v * 1000) / 10}%`;
  return Math.abs(v) >= 100 ? Math.round(v).toLocaleString('en-US') : String(Math.round(v * 100) / 100);
};
const toField = (i: PriceInput) => String(i.kind === 'pct' ? Math.round(i.value * 10000) / 100 : i.value);
const fromField = (i: PriceInput, s: string) => { const n = Number(s.replace(/[$,%\s]/g, '')); return Number.isFinite(n) ? (i.kind === 'pct' ? n / 100 : n) : null; };

export default function SalesPricing() {
  const [m, setM] = useState<PricingModel | null>(null);
  const [error, setError] = useState('');
  const [fields, setFields] = useState<Record<string, string>>({});
  const timer = useRef<number | undefined>(undefined);
  const first = useRef<PricingModel | null>(null);
  const load = () => { setError(''); api<PricingModel>('/sales/pricing').then((x) => { first.current = x; setM(x); setFields(Object.fromEntries(x.inputs.map((i) => [i.ref, toField(i)]))); }).catch((e) => setError(e.message)); };
  useEffect(load, []);
  const recalc = (next: Record<string, string>) => {
    setFields(next);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      if (!m) return;
      const inputs: Record<string, number> = {};
      for (const i of m.inputs) { const v = fromField(i, next[i.ref] ?? ''); if (v !== null) inputs[i.ref] = v; }
      api<PricingModel>('/sales/pricing', { body: { inputs } }).then(setM).catch((e) => setError(e.message));
    }, 300);
  };
  if (error && !m) return <ErrorBox error={error} retry={load} />;
  if (!m) return <PageSkeleton kind="list" />;
  const reset = () => { if (first.current) { setM(first.current); setFields(Object.fromEntries(first.current.inputs.map((i) => [i.ref, toField(i)]))); } };
  return (
    <div className="space-y-4">
      <Card className={cx('py-3.5', m.source === 'builtin' && 'border-warn/30 bg-warn-soft')}>
        <div className="flex flex-wrap items-center gap-2">
          <Pill tone={m.source === 'sheet' ? 'good' : 'warn'}>{m.source === 'sheet' ? `P/L sheet · ${m.tab}` : 'Built-in (sheet not read)'}</Pill>
          {m.readAt && <span className="text-xs text-muted">read {timeAgo(m.readAt) || 'just now'} (kept 10 minutes)</span>}
        </div>
        {m.error && <div className="mt-1.5 text-sm text-fg-2">{m.error}</div>}
        <ul className="mt-1.5 space-y-0.5 text-xs text-muted">{m.assumptions.map((a) => <li key={a}>{a}</li>)}</ul>
      </Card>
      <div className="grid gap-6 lg:grid-cols-2">
        <section className="min-w-0">
          <SectionHeader title="Inputs" icon="pen" right={<Button onClick={reset}>Reset</Button>} />
          <Card className="p-0">
            <ul className="divide-y divide-line">
              {m.inputs.map((i) => (
                <li key={i.ref} className="flex items-center gap-3 px-4 py-2.5 sm:px-5">
                  <label htmlFor={`in-${i.ref}`} className="min-w-0 flex-1 text-[15px] text-fg">{i.label}<span className="ml-1.5 text-[11px] text-faint">{i.ref}</span></label>
                  <span className="relative">
                    {i.kind === 'money' && <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted">$</span>}
                    <input id={`in-${i.ref}`} inputMode="decimal" value={fields[i.ref] ?? ''} onChange={(e) => recalc({ ...fields, [i.ref]: e.target.value })}
                      className={cx('tabular min-h-10 w-32 rounded-xl border border-line bg-surface px-3 text-right text-[15px] text-fg outline-none focus:border-accent focus:ring-4 focus:ring-accent-soft', i.kind === 'money' && 'pl-6', i.kind === 'pct' && 'pr-7')} />
                    {i.kind === 'pct' && <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted">%</span>}
                  </span>
                </li>
              ))}
            </ul>
          </Card>
        </section>
        <section className="min-w-0">
          <SectionHeader title="Results" icon="dollar" />
          <Card className="p-0">
            <ul className="divide-y divide-line">
              {m.outputs.map((o) => (
                <li key={o.ref} className="flex items-center gap-3 px-4 py-2.5 sm:px-5" title={o.formula}>
                  <span className="min-w-0 flex-1"><span className="block text-[15px] text-fg">{o.label}</span>{o.fromSheet && <span className="block text-[11px] text-muted">from the sheet (not worked out here)</span>}{o.error && <span className="block text-[11px] text-bad">{o.error}</span>}</span>
                  <span className={cx('tabular shrink-0 text-[17px] font-bold', /price/i.test(o.label) ? 'text-accent-ink' : 'text-fg')}>{show(o.value, o.kind)}</span>
                </li>
              ))}
            </ul>
          </Card>
        </section>
      </div>
      <p className="text-xs text-muted">Owner only. Changing an input here never changes the sheet. Hover a result to see its formula.</p>
    </div>
  );
}

// Pricing tab: the "Dulcy Media P/L" sheet's calculator, read only. Round 4 (Alex 2026-11-28): the
// inputs are ONLY the lines of the sheet's "OPEX Guide" plan blocks ("Client Fulfillment - <plan>"):
// retainer, rev share, Cheap Inboxes (inboxes × price), domains, masking, the per-lead credits, tool
// seats and one-off builds. No team hours, no target margin (they were never in the sheet). The one
// value that is not the sheet's, the price per inbox ($2.50, RULES), says so next to it. Changing a
// line here never changes the sheet.
import { useEffect, useRef, useState } from 'react';
import { api, type PriceInput, type PriceOutput, type PricingModel } from '../../api';
import { Button, Card, cx, ErrorBox, PageSkeleton, Pill, SectionHeader, timeAgo, usd } from '../../ui';

const money = (v: number) => (Math.abs(v) < 1 && v ? `$${v.toPrecision(2).replace(/0+$/, '')}` : Math.abs(v) < 100 && v % 1 ? `$${v.toFixed(2)}` : usd(v));
const show = (o: PriceOutput) => (o.value === null ? '–' : o.kind === 'pct' ? `${Math.round(o.value * 1000) / 10}%` : money(o.value));
const GROUPS: { key: PriceInput['group']; title: string }[] = [
  { key: 'revenue', title: 'What the client pays a month' }, { key: 'volume', title: 'Volume' },
  { key: 'monthly', title: 'Costs a month' }, { key: 'oneoff', title: 'First month only' },
];

export default function SalesPricing() {
  const [m, setM] = useState<PricingModel | null>(null);
  const [error, setError] = useState('');
  const [fields, setFields] = useState<Record<string, string>>({});
  const timer = useRef<number | undefined>(undefined);
  const fill = (x: PricingModel) => { setM(x); setFields(Object.fromEntries(x.inputs.map((i) => [i.key, String(i.value)]))); };
  const load = (plan?: string) => { setError(''); api<PricingModel>('/sales/pricing', plan ? { body: { plan, inputs: {} } } : undefined).then(fill).catch((e) => setError(e.message)); };
  useEffect(() => load(), []);
  const recalc = (next: Record<string, string>) => {
    setFields(next);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      if (!m) return;
      const inputs: Record<string, number> = {};
      for (const i of m.inputs) { const n = Number((next[i.key] ?? '').replace(/[$,\s]/g, '')); if (Number.isFinite(n)) inputs[i.key] = n; }
      api<PricingModel>('/sales/pricing', { body: { plan: m.plan, inputs } }).then(setM).catch((e) => setError(e.message));
    }, 300);
  };
  if (error && !m) return <ErrorBox error={error} retry={() => load()} />;
  if (!m) return <PageSkeleton kind="list" />;
  const head = m.outputs.filter((o) => o.key === 'profit' || o.key === 'margin');
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Pill tone={m.source === 'sheet' ? 'good' : 'warn'}>{m.source === 'sheet' ? `P/L sheet · ${m.tab}` : 'Sheet not read'}</Pill>
        {m.plans.length > 1 && (
          <label className="flex items-center gap-2 text-sm text-fg-2">Plan
            <select value={m.plan} onChange={(e) => load(e.target.value)} className="min-h-10 rounded-xl border border-line bg-surface px-3 text-sm font-semibold text-fg">
              {m.plans.map((p) => <option key={p.key} value={p.key}>{p.name}</option>)}
            </select>
          </label>
        )}
        {m.readAt && <span className="text-xs text-muted">read {timeAgo(m.readAt) || 'just now'}</span>}
        <span className="ml-auto"><Button onClick={() => load(m.plan)}>Reset</Button></span>
      </div>
      {(m.error || m.assumptions.length > 0) && (
        <div className={cx('rounded-xl px-4 py-2.5 text-xs leading-snug', m.source === 'builtin' ? 'border border-warn/30 bg-warn-soft text-fg-2' : 'text-muted')}>
          {m.error && <div className="font-semibold text-fg">{m.error}</div>}
          {m.assumptions.map((a) => <div key={a}>{a}</div>)}
        </div>
      )}
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
        <section className="min-w-0 space-y-4">
          {GROUPS.map((g) => {
            const xs = m.inputs.filter((i) => i.group === g.key);
            if (!xs.length) return null;
            return (
              <div key={g.key}>
                <SectionHeader title={g.title} />
                <Card className="p-0">
                  <ul className="divide-y divide-line">
                    {xs.map((i) => (
                      <li key={i.key} className="flex items-center gap-3 px-4 py-2.5 sm:px-5">
                        <label htmlFor={`in-${i.key}`} className="min-w-0 flex-1"><span className="block text-[15px] text-fg">{i.label}</span>{i.note && <span className="block text-xs leading-snug text-muted sm:text-[11px]">{i.note}</span>}</label>
                        <span className="relative shrink-0">
                          {i.kind === 'money' && <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted">$</span>}
                          <input id={`in-${i.key}`} inputMode="decimal" value={fields[i.key] ?? ''} onChange={(e) => recalc({ ...fields, [i.key]: e.target.value })}
                            className={cx('tabular min-h-10 w-28 rounded-xl border border-line bg-surface px-3 text-right text-[15px] text-fg outline-none focus:border-accent focus:ring-4 focus:ring-accent-soft sm:w-32', i.kind === 'money' && 'pl-6')} />
                        </span>
                      </li>
                    ))}
                  </ul>
                </Card>
              </div>
            );
          })}
        </section>
        <section className="min-w-0">
          <SectionHeader title="Results" />
          <div className="mb-3 grid grid-cols-2 gap-3">
            {head.map((o) => (
              <div key={o.key} className="min-w-0 rounded-2xl border border-line bg-surface p-4 shadow-card">
                <div className="text-xs font-medium leading-snug text-muted sm:truncate">{o.label}</div>
                <div className={cx('tabular mt-1 text-[26px] font-bold leading-none tracking-tight', (o.value ?? 0) < 0 ? 'text-bad' : 'text-fg')}>{show(o)}</div>
              </div>
            ))}
          </div>
          <Card className="p-0">
            <ul className="divide-y divide-line">
              {m.outputs.filter((o) => !head.includes(o)).map((o) => (
                <li key={o.key} className="flex items-center gap-3 px-4 py-2.5 sm:px-5">
                  <span className="min-w-0 flex-1"><span className="block text-[15px] text-fg">{o.label}</span>{o.note && <span className="block text-xs text-muted sm:text-[11px]">{o.note}</span>}</span>
                  <span className={cx('tabular shrink-0 text-[17px] font-bold', (o.value ?? 0) < 0 ? 'text-bad' : 'text-fg')}>{show(o)}</span>
                </li>
              ))}
            </ul>
          </Card>
          <p className="mt-2 text-xs text-muted">Changing a line here never changes the sheet. Reset puts the sheet's numbers back.</p>
        </section>
      </div>
    </div>
  );
}

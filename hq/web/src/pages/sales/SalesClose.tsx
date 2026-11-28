// Round 3 Pipeline and Funnel tabs, straight from Close. One period picker (default last
// 30 days; vs last month / quarter / year; custom). Pipeline: each Close stage with its share of the
// period's opportunities (percent, not "3 of 5") next to the period before. Funnel: like Close's
// "Opportunity Funnels" report: total, close rate, average time to close, average value per win and
// the average days to move between each pair of steps.
import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { api, type SalesCloseView, type SalesFunnelSide } from '../../api';
import { Card, cx, Empty, ErrorBox, Icon, PageSkeleton, timeAgo, usd } from '../../ui';
import { PeriodPicker, periodQuery, readPeriod, type PeriodState } from './period';

function useClose() {
  const [period, setPeriod] = useState<PeriodState>(() => readPeriod('last30'));
  const [d, setD] = useState<SalesCloseView | null>(null);
  const [error, setError] = useState('');
  const load = useCallback(() => { setError(''); api<SalesCloseView>(`/sales/close?${periodQuery(period)}`).then(setD).catch((e) => setError(e.message)); }, [period]);
  useEffect(load, [load]);
  return { period, setPeriod, d, error, load };
}
const pct = (x: number | null) => (x === null ? '–' : `${x % 1 ? x.toFixed(1) : x}%`);
const days = (x: number | null) => (x === null ? '–' : `${x % 1 ? x.toFixed(1) : x} d`);

/** Round 4 (Alex 2026-11-28: "where's the percentages?"): the first thing in Pipeline and Funnel is the
 *  close rate and each stage-to-stage conversion ("Call booked → Call done 62%"), counts underneath. */
export function Conversions({ close, closeSub, steps, prevClose }: { close: number | null; closeSub: string; prevClose?: number | null; steps: { from: string; to: string; pct: number | null; n: number; of: number }[] }) {
  return (
    <section aria-label="Conversion rates" className="grid gap-3 sm:grid-cols-[minmax(0,13rem)_minmax(0,1fr)]">
      <div className="min-w-0 rounded-2xl border border-accent/30 bg-accent-soft p-4">
        <div className="text-xs font-semibold text-accent-ink">Close rate</div>
        <div className="tabular mt-1 text-[34px] font-bold leading-none tracking-tight text-fg">{pct(close)}</div>
        <div className="mt-1.5 text-xs text-fg-2">{closeSub}{prevClose !== undefined ? ` · before ${pct(prevClose)}` : ''}</div>
      </div>
      <ol className="grid min-w-0 grid-cols-2 gap-2 lg:grid-cols-[repeat(auto-fit,minmax(9.5rem,1fr))]">
        {steps.map((s) => (
          <li key={`${s.from}-${s.to}`} className="min-w-0 rounded-2xl border border-line bg-surface px-3.5 py-3 shadow-card" title={`${s.from} → ${s.to}: ${s.n} of ${s.of}`}>
            <div className="text-xs font-medium leading-snug text-muted">{s.from}<Icon name="chevronRight" size={12} className="mx-0.5 inline align-[-1px] text-faint" /><span className="text-fg-2">{s.to}</span></div>
            <div className={cx('tabular mt-1 text-[22px] font-bold leading-none', s.pct === null ? 'text-muted' : 'text-fg')}>{pct(s.pct)}</div>
            <div className="tabular mt-1 text-[11px] text-muted">{s.n} of {s.of}</div>
          </li>
        ))}
      </ol>
    </section>
  );
}
/** The Close funnel's steps as stage-to-stage conversions. */
const closeSteps = (f: SalesFunnelSide) => f.steps.slice(1).map((s, i) => ({ from: f.steps[i].label, to: s.label, pct: s.pctOfPrev, n: s.reached, of: f.steps[i].reached }));

function Frame({ c, fallback, children }: { c: ReturnType<typeof useClose>; fallback: ReactNode; children: (d: SalesCloseView) => ReactNode }) {
  const { d } = c;
  // Close not connected (or not answering): one line, then what HQ's own Sales data can give.
  const off = (line: ReactNode) => <><p className="rounded-xl border border-warn/30 bg-warn-soft px-4 py-2.5 text-sm text-fg-2">{line}</p>{fallback}</>;
  return (
    <div className="space-y-3">
      {c.error && !d ? <ErrorBox error={c.error} retry={c.load} /> : !d ? <PageSkeleton kind="list" />
        : !d.connected ? off(<><span className="font-semibold text-fg">Close is not connected</span> (CLOSE_API_KEY on the server), so this is from HQ's Sales data (Airtable).</>)
          : !d.ok ? off(<><span className="font-semibold text-fg">Close did not answer</span> ({d.error}), so this is from HQ's Sales data (Airtable).</>)
            : <><PeriodPicker value={c.period} onChange={c.setPeriod} pick={d.period} />{children(d)}</>}
      {d?.ok && <p className="text-xs text-muted">From Close: opportunities created {d.period.now.label.toLowerCase()} vs {d.period.prev.label.toLowerCase()}, read {timeAgo(d.readAt) || 'just now'} (kept 5 minutes).{d.truncated ? ' Only the first 1,000 were read.' : ''}</p>}
    </div>
  );
}

export function ClosePipeline({ fallback }: { fallback: ReactNode }) {
  const c = useClose();
  return (
    <div className="space-y-6">
      <Frame c={c} fallback={fallback}>{(d) => {
        const p = d.pipeline!; const f = d.funnel;
        if (!p.total && !p.prevTotal) return <Card><Empty icon="layers" title="No opportunities in this period" sub="Nothing was created in Close in these dates." /></Card>;
        const max = Math.max(1, ...p.stages.map((s) => s.pct ?? 0));
        return (
          <>
            {f && <Conversions close={f.closeRate} prevClose={f.prev.closeRate} closeSub={`${f.won} won of ${f.total}`} steps={closeSteps(f)} />}
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Tile label="Opportunities" v={String(p.total)} sub={`${p.prevTotal} before`} />
              <Tile label="Open" v={pct(p.total ? Math.round((p.open / p.total) * 1000) / 10 : null)} sub={`${p.open} still open`} />
              <Tile label="Won" v={pct(p.total ? Math.round((p.won / p.total) * 1000) / 10 : null)} sub={`${p.won} won`} />
              <Tile label="Lost" v={pct(p.total ? Math.round((p.lost / p.total) * 1000) / 10 : null)} sub={`${p.lost} lost`} />
            </div>
            <Card className="overflow-hidden p-0">
              <div className="grid grid-cols-[minmax(0,1fr)_auto_auto] gap-x-3 border-b border-line px-4 py-2.5 text-xs font-medium text-muted sm:px-5"><span>{p.pipeline} pipeline · where they are now</span><span className="w-14 text-right">Now</span><span className="w-14 text-right">Before</span></div>
              <ol className="divide-y divide-line">
                {p.stages.map((s) => (
                  <li key={s.label} className="grid grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-x-3 px-4 py-2.5 sm:px-5" title={`${s.label}: ${s.count} of ${p.total} now, ${s.prev} of ${p.prevTotal} before`}>
                    <span className="min-w-0">
                      <span className="flex items-baseline justify-between gap-2"><span className={cx('min-w-0 break-words text-[15px] sm:truncate', s.type === 'won' ? 'font-semibold text-good' : s.type === 'lost' ? 'text-muted' : 'text-fg')}>{s.label}</span><span className="tabular shrink-0 text-xs text-muted">{s.count}</span></span>
                      <span className="mt-1 block h-2 rounded-full bg-sunken" aria-hidden="true"><span className="block h-2 rounded-full bg-accent" style={{ width: `${Math.max(s.count ? 2 : 0, Math.round(((s.pct ?? 0) / max) * 100))}%` }} /></span>
                    </span>
                    <span className="tabular w-14 text-right text-[15px] font-bold text-fg">{pct(s.pct)}</span>
                    <span className="tabular w-14 text-right text-sm text-muted">{pct(s.prevPct)}</span>
                  </li>
                ))}
              </ol>
            </Card>
          </>
        );
      }}</Frame>
      {c.d?.ok && (
        <details className="rounded-2xl border border-line bg-surface">
          <summary className="flex min-h-11 cursor-pointer items-center px-4 text-sm font-semibold text-fg-2 hover:bg-hover sm:px-5">HQ deals by stage (contracts, payment, onboarding)</summary>
          <div className="px-4 pb-4 sm:px-5">{fallback}</div>
        </details>
      )}
    </div>
  );
}

export function CloseFunnel({ fallback }: { fallback: ReactNode }) {
  const c = useClose();
  return (
    <Frame c={c} fallback={fallback}>{(d) => {
      const f = d.funnel!;
      if (!f.total && !f.prev.total) return <Card><Empty icon="layers" title="No opportunities in this period" sub="Nothing was created in Close in these dates." /></Card>;
      return (
        <>
          <Conversions close={f.closeRate} prevClose={f.prev.closeRate} closeSub={`${f.won} won of ${f.total}`} steps={closeSteps(f)} />
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <Tile label="Total opportunities" v={String(f.total)} sub={`${f.prev.total} before`} />
            <Tile label="Average time to close" v={days(f.avgDaysToClose)} sub={`created → won · before ${days(f.prev.avgDaysToClose)}`} />
            <Tile label="Average value per win" v={f.avgWinValue === null ? '–' : `${usd(f.avgWinValue)}${f.valuePeriod === 'monthly' ? '/mo' : ''}`} sub={`before ${f.prev.avgWinValue === null ? '–' : usd(f.prev.avgWinValue)}${f.valuePeriod === 'mixed' ? ' · mixed periods' : ''}`} />
          </div>
          <Card className="overflow-hidden p-0">
            <div className="grid grid-cols-[minmax(0,1fr)_auto_auto_auto] gap-x-3 border-b border-line px-4 py-2.5 text-xs font-medium text-muted sm:px-5"><span>Step</span><span className="w-20 text-right">Reached</span><span className="w-14 text-right">From step before</span><span className="w-16 text-right">Days to get here</span></div>
            <ol className="divide-y divide-line">
              {f.steps.map((s, i) => <FunnelRow key={s.key} s={s} i={i} total={f.total} prev={f.prev} />)}
            </ol>
          </Card>
          {f.missing.length > 0 && <p className="text-xs text-warn">No Close stage looks like: {f.missing.join(', ')} (left out of the funnel).</p>}
          <p className="text-xs text-muted">Steps in {f.order === 'close' ? "Close's own pipeline order" : 'the order Alex listed (Close pipelines could not be read)'}. A deal that skipped a step still counts as reaching it. Close rate = won of all opportunities created in the period ({pct(f.decidedRate)} of those decided). Days = average from entering the step before.</p>
        </>
      );
    }}</Frame>
  );
}
function FunnelRow({ s, i, total, prev }: { s: SalesFunnelSide['steps'][number]; i: number; total: number; prev: SalesFunnelSide }) {
  const p = prev.steps.find((x) => x.key === s.key);
  return (
    <li className="grid grid-cols-[minmax(0,1fr)_auto_auto_auto] items-center gap-x-3 px-4 py-2.5 sm:px-5" title={`${s.label} (Close: ${s.stages.join(', ') || 'won'}): ${s.reached} of ${total}`}>
      <span className="min-w-0">
        <span className="flex items-center gap-1.5"><span className="min-w-0 break-words text-[15px] font-medium text-fg sm:truncate">{s.label}</span>{i > 0 && <Icon name="chevronRight" size={13} className="hidden text-faint sm:block" />}<span className="hidden truncate text-xs text-muted sm:inline">{s.stages.join(', ')}</span></span>
        <span className="mt-1 block h-2 rounded-full bg-sunken" aria-hidden="true"><span className="block h-2 rounded-full bg-accent" style={{ width: `${Math.max(s.reached ? 2 : 0, s.pctOfTotal ?? 0)}%` }} /></span>
      </span>
      <span className="w-20 text-right"><span className="tabular block text-[15px] font-bold text-fg">{pct(s.pctOfTotal)}</span><span className="tabular block text-[11px] text-muted">{s.reached} · was {p ? pct(p.pctOfTotal) : '–'}</span></span>
      <span className="tabular w-14 text-right text-sm text-fg-2">{i === 0 ? '' : pct(s.pctOfPrev)}</span>
      <span className="w-16 text-right"><span className="tabular block text-sm font-semibold text-fg">{i === 0 ? '' : days(s.daysFromPrev)}</span>{i > 0 && <span className="tabular block text-[11px] text-muted">{s.daysN ? `${s.daysN} deal${s.daysN === 1 ? '' : 's'}` : ''}</span>}</span>
    </li>
  );
}
function Tile({ label, v, sub }: { label: string; v: string; sub: string }) {
  return (
    <div className="min-w-0 rounded-2xl border border-line bg-surface p-4 shadow-card">
      <div className="text-xs font-medium text-muted max-sm:leading-snug sm:truncate">{label}</div>
      <div className="tabular mt-1 text-[24px] font-bold leading-none tracking-tight text-fg">{v}</div>
      <div className="mt-1.5 text-xs text-muted max-sm:leading-snug sm:truncate" title={sub}>{sub}</div>
    </div>
  );
}

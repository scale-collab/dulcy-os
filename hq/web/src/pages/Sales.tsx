// Sales: Dulcy's own deals from booked call to signed and paid. What needs action first;
// the hottest deals, the numbers (periods and capacity), the pipeline and each deal one tap deeper.
// Batch 4a (Alex 2026-11-27): no Airtable links, no SignWell, no client tasks. The one write here is
// "Draft contract" (its own page): a DRAFT in Dulcy Sign, never sent. Money comes from the server for
// the owner only (only the owner sees Sales; no "owner only" label on screen, RULES 2026-11-28).
// Round 4 (Alex 2026-11-28, "still sucks"): the first view is one row of key numbers for the month
// (meetings booked, show rate, close rate, revenue signed), then Needs action. No Hottest strip.
import { useCallback, useEffect, useState, type ReactNode } from 'react';
import {
  api, ApiError, type SalesAction, type SalesActionKind, type SalesDealLite4a, type SalesDetail4a, type SalesHotDeal, type SalesInsights,
  type SalesMonth, type SalesNote, type SalesRate, type SalesReviewLite, type SalesStage, type SalesView4a, type User,
} from '../api';
import { Avatar, BackLink, Button, Card, cx, Empty, ErrorBox, ExtLink, go, Icon, IconButton, Label, PageSkeleton, PageTitle, Pill, SectionHeader, setCount, timeAgo, usd } from '../ui';
import SalesContract from './SalesContract';
import { goUp } from './sales/nav';
import { slashDate } from '../dates';
// Round 3 (Alex 2026-11-27): Numbers with a period picker and charts, Pipeline + Funnel from Close, Pricing, Cole's Close updates.
import SalesNumbers from './sales/SalesNumbers';
import { CloseFunnel, ClosePipeline, Conversions } from './sales/SalesClose';
import SalesPricing from './sales/SalesPricing';
import DealCloseUpdates from './sales/DealCloseUpdates';
import type { CloseUpdateRow } from '../api';
// Round 5 (Alex 2026-11-28): goals under the key numbers, Cole's take (replaces "November so far vs October")
// with Talk to Cole, named calls with Fathom links, and a fix button for the right agent on each "Data to fix".
import { ColeTake, GoalsCard, useSalesGoals } from './sales/SalesGoals';
import DealCalls from './sales/DealCalls';
import { FixItButton } from '../fixIt';
import type { DealCall, NoteAction } from './sales/types';

const ACTION: Record<SalesActionKind, { label: string; tone: 'bad' | 'warn' | 'info' | 'accent' | 'good' }> = {
  call_today: { label: 'Call today', tone: 'accent' }, call_tomorrow: { label: 'Tomorrow', tone: 'info' }, no_outcome: { label: 'No outcome', tone: 'warn' },
  sign: { label: 'Your signature', tone: 'bad' }, unsigned: { label: 'Not signed', tone: 'warn' }, draft: { label: 'Not sent', tone: 'info' },
  unpaid: { label: 'Not paid', tone: 'bad' }, onboard: { label: 'Onboard', tone: 'accent' }, rebook: { label: 'Re-book', tone: 'warn' },
};
const STATE_LABEL: Record<string, string> = { draft: 'Draft', sent: 'Sent', viewed: 'Viewed', signed: 'Signed', declined: 'Declined', expired: 'Expired', error: 'Error', none: 'No status' };
const STATE_TONE: Record<string, 'good' | 'warn' | 'bad' | 'info' | 'plain'> = { signed: 'good', viewed: 'info', sent: 'info', draft: 'plain', declined: 'bad', expired: 'bad', error: 'bad', none: 'plain' };
// Dates with slashes (11/27), RULES 2026-11-27.
const day = (d: string) => (d ? slashDate(d.slice(0, 10)) : '');
const when = (iso: string) => (iso ? slashDate(iso) : '');
type View = 'action' | 'hot' | 'numbers' | 'pipeline' | 'funnel' | 'pricing';
const VIEWS: { key: View; label: string; short?: string }[] = [{ key: 'action', label: 'Needs action', short: 'Action' }, { key: 'hot', label: 'Hottest' }, { key: 'numbers', label: 'Numbers' }, { key: 'pipeline', label: 'Pipeline' }, { key: 'funnel', label: 'Funnel' }, { key: 'pricing', label: 'Pricing' }];
const viewPath = (v: View, days: number) => (v === 'action' ? 'sales' : v === 'pipeline' || v === 'funnel' ? `sales/${v}${days === 90 ? '/90' : ''}` : `sales/${v}`);
const pctText = (r: SalesRate) => (r.pct == null ? '–' : `${r.pct}%`);
/** Old SignWell / PandaDoc agreements still count; the tool name is history, not a link. */
const toolLabel = (tool: string) => (tool === 'Dulcy Sign' ? 'Dulcy Sign' : 'Old agreement');

/** #/sales[/hot|/numbers|/pipeline[/90]] · #/sales/<record id> · #/sales/<record id>/contract */
export default function Sales({ user, a, b }: { user: User; a?: string; b?: string }) {
  if (user.role !== 'owner') return <><PageTitle title="Sales" /><Card><Empty icon="lock" title="Not in your view" sub="Sales is not part of your HQ." /></Card></>;
  if (a && /^rec[A-Za-z0-9]{14}$/.test(a)) return b === 'contract' ? <SalesContract id={a} /> : <DealPage id={a} />;
  const view: View = a === 'pipeline' || a === 'hot' || a === 'numbers' || a === 'funnel' || a === 'pricing' ? a : 'action';
  return <SalesHome view={view} days={b === '90' ? 90 : 30} />;
}

function SalesHome({ view, days }: { view: View; days: 30 | 90 }) {
  const [d, setD] = useState<SalesView4a | null>(null);
  const [ins, setIns] = useState<SalesInsights | null>(null);
  const [error, setError] = useState('');
  const [insError, setInsError] = useState('');
  const [busy, setBusy] = useState(false);
  const [tick, setTick] = useState(0);
  const goals = useSalesGoals(tick);
  const wantInsights = view === 'hot' || view === 'numbers';
  // Round 4 (Alex 2026-11-28): no "Hottest 3" strip on the first view (Hottest is its own tab).
  const load = useCallback((refresh = false) => {
    setBusy(true); setError('');
    api<SalesView4a>(`/sales?days=${days}${refresh ? '&refresh=1' : ''}`).then((x) => { setD(x); setCount('sales', x.counts.action); })
      .catch((e) => setError(e instanceof ApiError && e.status === 403 ? 'Sales is not part of your HQ.' : e.message)).finally(() => setBusy(false));
    if (wantInsights) { setInsError(''); api<SalesInsights>(`/sales/insights${refresh ? '?refresh=1' : ''}`).then(setIns).catch((e) => setInsError(e.message)); }
  }, [days, wantInsights]);
  useEffect(() => load(), [load]);
  const title = (
    <PageTitle title="Sales" kicker={d ? `Dulcy's own deals · ${d.counts.action} need action` : "Dulcy's own deals"} sub="Booked call to signed and paid. What needs action first."
      right={<IconButton icon="refresh" label="Refresh" onClick={() => { load(true); setTick((t) => t + 1); }} className={cx('border border-line bg-surface', busy && '[&_svg]:animate-spin')} />} />
  );
  if (error && !d) return <>{title}<ErrorBox error={error} retry={() => load()} /></>;
  if (!d) return <>{title}<PageSkeleton kind="list" /></>;
  return (
    <div>
      {title}
      <ColeTake g={goals.g} error={goals.error} />
      <KeyNumbers now={d.top.thisMonth} last={d.top.lastMonth} />
      {(view === 'action' || view === 'numbers') && goals.g && <GoalsCard g={goals.g} />}
      <div role="tablist" aria-label="Sales views" className="mt-5 grid grid-cols-3 gap-1 sm:flex">
        {VIEWS.map((x) => {
          const on = x.key === view;
          return (
            <button key={x.key} role="tab" aria-selected={on} onClick={() => go(viewPath(x.key, days))}
              className={cx('flex min-h-11 min-w-0 items-center justify-center gap-1.5 rounded-xl px-3.5 text-sm font-semibold transition', on ? 'bg-ink text-ink-fg shadow-card' : 'text-muted hover:bg-hover hover:text-fg')}>
              {x.short ? <><span className="sm:hidden">{x.short}</span><span className="hidden sm:inline">{x.label}</span></> : x.label}
              {x.key === 'action' && <span className={cx('tabular rounded-full px-1.5 text-xs', on ? 'bg-ink-fg/15' : d.counts.action ? 'bg-accent text-accent-fg' : 'border border-line bg-sunken text-fg-2')}>{d.counts.action}</span>}
            </button>
          );
        })}
      </div>
      <div className="mt-4">
        {view === 'action' && <ActionList rows={d.action} />}
        {view === 'pipeline' && <ClosePipeline fallback={<Pipeline p={d.pipeline} days={days} />} />}
        {view === 'funnel' && <CloseFunnel fallback={<Pipeline p={d.pipeline} days={days} tab="funnel" />} />}
        {view === 'pricing' && <SalesPricing />}
        {view === 'numbers' && (insError && !ins ? <ErrorBox error={insError} retry={() => load()} /> : <SalesNumbers ins={ins} onSaved={() => load(true)} />)}
        {view === 'hot' && (insError && !ins ? <ErrorBox error={insError} retry={() => load()} /> : !ins ? <PageSkeleton kind="list" /> : <Hottest ins={ins} />)}
      </div>
      {d.notes.length > 0 && (view === 'action' || view === 'pipeline') && (
        <div className="mt-6">
          <SectionHeader title="Data to fix" icon="alert" right={<span className="text-xs text-muted">{d.notes.length}</span>} />
          <p className="-mt-1 mb-2 text-xs text-muted">Records in Airtable or Close that disagree. Fixing them at the source makes these numbers right; each says who fixes it.</p>
          <Notes notes={d.notes} fold={view === 'action' ? 0 : 2} />
        </div>
      )}
      {(view === "action" || view === "numbers") && <p className="mt-5 text-xs text-muted">
        From Airtable sales records{d.xeroConnected ? ', Xero' : ''} and Cole's call reviews, read {timeAgo(d.readAt) || 'just now'}. Show rate = past calls that showed (canceled left out); close rate = shows that signed.
        Not signed = sent {d.limits.unsignedDays}+ days ago.
      </p>}
    </div>
  );
}

/** Round 4 (Alex 2026-11-28): one short row of the key numbers for the month (vs last), above Needs action:
 *  meetings booked, show rate, close rate, revenue signed. Percentages are the headline, counts underneath.
 *  Round 5: the "<month> so far vs <last>" line is gone; Cole's take sits above the row instead. */
function KeyNumbers({ now, last }: { now: SalesMonth; last: SalesMonth }) {
  const p = (r?: SalesRate) => (r?.pct === null || r?.pct === undefined ? '–' : `${Math.round(r.pct)}%`);
  const prev = last.label.slice(0, 3);
  const tiles: { label: string; v: string; unit?: string; up: number | null; sub: string }[] = [
    { label: 'Meetings booked', v: String(now.booked), up: now.booked - last.booked, sub: `${prev}: ${last.booked}` },
    { label: 'Show rate', v: p(now.showRate), up: diff(now.showRate, last.showRate), sub: `${now.showRate ? `${now.showRate.n} of ${now.showRate.of} calls` : ''} · ${prev}: ${p(last.showRate)}` },
    { label: 'Close rate', v: p(now.closeRate), up: diff(now.closeRate, last.closeRate), sub: `${now.closeRate ? `${now.closeRate.n} of ${now.closeRate.of} shows signed` : ''} · ${prev}: ${p(last.closeRate)}` },
    ...(now.mrr !== undefined ? [{ label: 'Revenue signed', v: usd(now.mrr), unit: '/mo', up: (now.mrr ?? 0) - (last.mrr ?? 0), sub: `${now.closed} signed${now.mrrUnknown ? ` (${now.mrrUnknown} with no amount)` : ''} · ${prev}: ${usd(last.mrr)}` }] : []),
  ];
  return (
    <section aria-label={`Key numbers for ${now.label}`}>
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="text-xs font-medium text-muted">{now.label}</span>
        <button onClick={() => go('sales/numbers')} className="inline-flex min-h-8 items-center gap-1 text-xs font-semibold text-accent-ink hover:underline">All numbers<Icon name="chevronRight" size={13} /></button>
      </div>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {tiles.map((t) => (
          <div key={t.label} className="min-w-0 rounded-2xl border border-line bg-surface p-4 shadow-card">
            <div className="text-xs font-medium text-muted max-sm:leading-snug sm:truncate">{t.label}</div>
            <div className="tabular mt-1 flex items-center gap-1.5 text-[22px] sm:text-[26px] font-bold leading-none tracking-tight text-fg">
              <span className="truncate">{t.v}{t.unit && <span className="text-sm font-semibold text-muted">{t.unit}</span>}</span>
              {t.up !== null && t.up !== 0 && <Icon name={t.up > 0 ? 'trendUp' : 'trendDown'} size={16} className={cx('shrink-0', t.up > 0 ? 'text-good' : 'text-bad')} />}
            </div>
            <div className="mt-1.5 text-xs leading-snug text-muted">{t.sub}</div>
          </div>
        ))}
      </div>
    </section>
  );
}
const diff = (a?: SalesRate, b?: SalesRate) => (a?.pct == null || b?.pct == null ? null : a.pct - b.pct);
/** A deal with no contract out yet can get one drafted (Dulcy Sign DRAFT, never sent). */
const canDraft = (r: Pick<SalesDealLite4a, 'lost' | 'stage' | 'agreementState'>) => !r.lost && !['signed', 'paid', 'onboarded'].includes(r.stage) && (!r.agreementState || r.agreementState === 'draft' || r.agreementState === 'none');
function DraftButton({ id, accent }: { id: string; accent?: boolean; small?: boolean }) {
  return (
    <button type="button" onClick={() => go(`sales/${id}/contract`)} title="Draft a contract in Dulcy Sign (a draft, never sent)"
      className={cx('inline-flex min-h-9 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg px-3 text-[13px] font-semibold transition active:scale-[0.98]',
        accent ? 'bg-accent text-accent-fg hover:bg-accent-hover' : 'border border-line-strong bg-surface text-fg hover:bg-hover')}>
      <Icon name="file" size={14} strokeWidth={2.1} />Draft contract
    </button>
  );
}

function ActionPill({ kind }: { kind: SalesActionKind }) { return <Pill tone={ACTION[kind].tone}>{ACTION[kind].label}</Pill>; }
const flat = (x: string) => x.toLowerCase().replace(/^https?:\/\/(www\.)?/, '').replace(/\.[a-z]+\/?.*$/, '').replace(/[^a-z0-9]/g, '');
const who = (d: { company: string; client: string }) => {
  const company = d.company.replace(/^https?:\/\/(www\.)?/i, '').replace(/\/.*$/, '');
  const fc = flat(company), fl = flat(d.client);
  const client = d.client && (!fc || (!fl.includes(fc) && !fc.includes(fl))) ? d.client : '';
  return [company, client].filter(Boolean).join(' · ');
};
const TEMP_TONE: Record<string, 'bad' | 'warn' | 'info' | 'good' | 'plain'> = { hot: 'bad', warm: 'warn', cold: 'info', closed: 'good', lost: 'plain' };
function ReviewPill({ r }: { r: SalesReviewLite | null }) {
  if (!r) return null;
  return <Pill tone={TEMP_TONE[r.temperature] ?? 'plain'} icon="sparkles">{`Call ${r.score ?? '?'}/10${r.temperature ? ` · ${r.temperature}` : ''}`}</Pill>;
}

function ActionList({ rows }: { rows: SalesDealLite4a[] }) {
  if (!rows.length) return <Card><Empty icon="check" tone="good" title="Nothing needs action" sub="No call today, nothing unsigned, unpaid or waiting to onboard." /></Card>;
  // One line of what is waiting ("2 Call today · 1 Not paid"), in the list's own order.
  const kinds = rows.reduce<Map<SalesActionKind, number>>((m, r) => m.set(r.needs[0].kind, (m.get(r.needs[0].kind) ?? 0) + 1), new Map());
  return (
    <>
    <div className="mb-2 flex flex-wrap items-center gap-1.5" aria-label="What needs action">
      {[...kinds].map(([k, n]) => <Pill key={k} tone={ACTION[k].tone}>{`${n} ${ACTION[k].label}`}</Pill>)}
    </div>
    <Card className="overflow-hidden p-0">
      <ul className="divide-y divide-line">
        {rows.map((r) => {
          const top = r.needs[0];
          return (
            <li key={r.id} className="flex flex-wrap items-start gap-x-2 pr-3 transition hover:bg-hover sm:flex-nowrap sm:pr-4">
              <button onClick={() => go(`sales/${r.id}`)} className="group flex min-w-0 flex-1 basis-[calc(100%-1rem)] items-start gap-3 py-3.5 pl-4 text-left sm:basis-0 sm:pl-5">
                <Avatar name={top.owner} size="sm" className="mt-0.5" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 break-words text-[15px] font-semibold leading-snug text-fg">{r.name}{who(r) && <span className="font-normal text-muted"> · {who(r)}</span>}</div>
                    <span className="hidden shrink-0 sm:inline"><ActionPill kind={top.kind} /></span>
                  </div>
                  <div className="mt-0.5 text-sm leading-snug text-fg-2">{top.text}</div>
                  {r.coleNext && <div className="mt-1 text-sm leading-snug text-fg-2"><span className="font-semibold text-fg">Cole:</span> {r.coleNext}</div>}
                  <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-xs text-muted">
                    {/* Phone: the action pill sits here, so the name and company get the full width. */}
                    <span className="sm:hidden"><ActionPill kind={top.kind} /></span>
                    <span className="font-medium text-fg-2">{top.owner}</span>
                    <span>· {r.stageLabel}</span>
                    {r.monthly ? <span className="tabular">· {usd(r.monthly)}/mo</span> : null}
                    <ReviewPill r={r.review} />
                    {r.needs.slice(1).map((x) => <ActionPill key={x.kind} kind={x.kind} />)}
                  </div>
                </div>
                <Icon name="chevronRight" size={18} className="mt-1 text-faint group-hover:text-muted" />
              </button>
              {canDraft(r) && <span className="mb-3 ml-14 sm:mb-0 sm:ml-0 sm:mt-3"><DraftButton id={r.id} small /></span>}
            </li>
          );
        })}
      </ul>
    </Card>
    </>
  );
}

// ---------- Hottest deals ----------
function Hottest({ ins }: { ins: SalesInsights }) {
  const c = ins.close;
  return (
    <div className="space-y-3">
      {!c.connected ? (
        <Card className="border-warn/30 bg-warn-soft">
          <div className="flex items-start gap-3">
            <Icon name="link" size={18} className="mt-0.5 shrink-0 text-warn" />
            <div className="min-w-0 text-sm leading-snug">
              <div className="font-semibold text-fg">Connect Close</div>
              <div className="text-fg-2">Close is not connected on the server, so emails, calls and notes from Close are not in this list. Add CLOSE_API_KEY to the server settings (Close → Settings → API Keys) and restart. Until then: contracts and Cole's call reviews only.</div>
            </div>
          </div>
        </Card>
      ) : c.error ? <Card className="border-bad-line bg-bad-soft"><div className="text-sm text-bad">Close did not answer: {c.error}. Showing contracts and Cole's call reviews only.</div></Card> : null}
      {!ins.hottest.length ? <Card><Empty icon="flag" title="No hot deal right now" sub="Nobody said yes, opened a contract or had a hot call recently." /></Card> : (
        <Card className="overflow-hidden p-0">
          <ol className="divide-y divide-line">
            {ins.hottest.map((h, i) => <HotRow key={h.key} h={h} rank={i + 1} />)}
          </ol>
        </Card>
      )}
      <p className="text-xs text-muted">
        Ranked by: said yes (+40), opened or got the contract (+30 / +25), Cole's hot call (+25), waiting on us (+20), Close stage and likelihood, and how recent the last touch is.
        {c.connected && c.ok ? ` ${c.open ?? 0} open opportunities in Close, read ${timeAgo(c.readAt) || 'just now'} (kept 5 minutes).` : ''}
      </p>
    </div>
  );
}
function HotRow({ h, rank }: { h: SalesHotDeal; rank: number }) {
  return (
    <li className="px-4 py-3.5 sm:px-5">
      <div className="flex items-start gap-3">
        <span className="tabular grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-accent-soft text-sm font-bold text-accent-ink">{rank}</span>
        <div className="min-w-0 flex-1">
          <div className="break-words text-[15px] font-semibold leading-snug text-fg">{h.name || h.company}{h.name && h.company && <span className="font-normal text-muted"> · {h.company}</span>}</div>
          <div className="mt-1 flex flex-wrap gap-1.5">{h.reasons.map((r) => <Pill key={r} tone={/^Said yes/.test(r) ? 'good' : /^Waiting/.test(r) ? 'warn' : /^No touch/.test(r) ? 'plain' : 'info'}>{r}</Pill>)}</div>
          {h.lastTouch && (
            <div className="mt-1.5 break-words text-sm leading-snug text-fg-2">
              <span className="text-muted">{h.lastTouch.what} {day(h.lastTouch.day)}{h.lastTouch.snippet ? ': ' : ''}</span>{h.lastTouch.snippet && <span>“{h.lastTouch.snippet}”</span>}
            </div>
          )}
          <div className="mt-1.5 text-sm leading-snug text-fg"><span className="font-semibold">Next:</span> {h.next}</div>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            {h.dealId && <Button onClick={() => go(`sales/${h.dealId}`)} icon="chevronRight">Open deal</Button>}
            {h.dealId && <Button tone="accent" onClick={() => go(`sales/${h.dealId}/contract`)} icon="file">Draft contract</Button>}
            {/^https:\/\//.test(h.closeUrl) && <ExtLink href={h.closeUrl} className="text-sm max-sm:inline-flex max-sm:min-h-10 max-sm:items-center">Open in Close</ExtLink>}
            {h.value ? <span className="tabular text-xs text-muted">{usd(h.value)}{h.valuePeriod === 'monthly' ? '/mo' : ''}</span> : null}
          </div>
        </div>
      </div>
    </li>
  );
}

// Numbers (period picker, charts, capacity): sales/SalesNumbers.tsx (Round 3).

// ---------- Pipeline ----------
function Pipeline({ p, days, tab = 'pipeline' }: { p: SalesView4a['pipeline']; days: 30 | 90; tab?: 'pipeline' | 'funnel' }) {
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const max = Math.max(1, p.stages[0]?.count ?? 1);
  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div role="radiogroup" aria-label="Period" className="grid grid-cols-2 gap-1 rounded-xl border border-line bg-sunken p-1">
          {([30, 90] as const).map((x) => (
            <button key={x} role="radio" aria-checked={days === x} onClick={() => go(`sales/${tab}${x === 90 ? '/90' : ''}`)}
              className={cx('min-h-9 rounded-lg px-4 text-sm font-semibold transition', days === x ? 'bg-surface text-fg shadow-card' : 'text-muted hover:text-fg')}>{x} days</button>
          ))}
        </div>
        <div className="text-xs text-muted">{p.deals} deals since {day(p.from)}{p.canceled ? ` · ${p.canceled} canceled` : ''}{p.upcoming ? ` · ${p.upcoming} upcoming` : ''}</div>
      </div>
      {/* Round 4: percentages first. Close rate = of the calls that showed, how many signed; then stage to stage. */}
      <div className="mt-3">
        <Conversions close={p.closeRate.pct ?? null} closeSub={`${p.closeRate.n} of ${p.closeRate.of} shows signed${p.overall?.pct != null ? ` · ${p.overall.pct}% of booked calls` : ''}`} steps={p.conversions ?? []} />
      </div>
      <p className="mt-2 text-xs text-muted">
        Show rate {pctText(p.showRate)} ({p.showRate.text}; past calls, canceled left out) · Qualified {pctText(p.qualifiedRate)} of the calls that showed. Booked → Showed counts upcoming calls too.
      </p>
      <Card className="mt-3 overflow-hidden p-0">
        <ol className="divide-y divide-line">
          {p.stages.map((s) => {
            const isOpen = open[s.key] ?? (s.deals.length > 0 && s.deals.length <= 5);
            return (
              <li key={s.key}>
                <button onClick={() => setOpen({ ...open, [s.key]: !isOpen })} aria-expanded={isOpen} disabled={!s.deals.length}
                  className="flex w-full items-center gap-3 px-4 py-3 text-left transition enabled:hover:bg-hover sm:px-5">
                  <span className="w-24 shrink-0 text-sm font-semibold text-fg sm:w-32">{SHORT[s.key]}</span>
                  <span className="relative h-2 min-w-0 flex-1 overflow-hidden rounded-full bg-line" aria-hidden="true"><span className="absolute inset-y-0 left-0 rounded-full bg-accent" style={{ width: `${Math.round((s.count / max) * 100)}%` }} /></span>
                  <span className="tabular w-8 shrink-0 text-right text-[15px] font-bold text-fg">{s.count}</span>
                  <span className="w-16 shrink-0 text-right text-xs text-muted sm:w-20">{s.deals.length ? `${s.deals.length} here` : ''}</span>
                  <Icon name="chevronDown" size={16} className={cx('shrink-0 text-faint transition', !s.deals.length && 'invisible', isOpen && 'rotate-180')} />
                </button>
                {isOpen && s.deals.length > 0 && (
                  <ul className="mx-4 mb-3 space-y-1 sm:mx-5">
                    {s.deals.map((d) => (
                      <li key={d.id} className="flex items-center gap-2 rounded-xl bg-sunken pr-2 transition hover:bg-hover">
                        <button onClick={() => go(`sales/${d.id}`)} className="flex min-h-11 min-w-0 flex-1 items-center gap-3 px-3 py-2 text-left">
                          <div className="min-w-0 flex-1">
                            <div className="truncate text-sm font-medium text-fg">{d.name}{who(d) && <span className="font-normal text-muted"> · {who(d)}</span>}</div>
                            <div className="truncate text-xs text-muted">{[d.callDate ? `call ${day(d.callDate)}` : 'no call in Sales Data', d.airtableStage, d.lost ? 'lost' : ''].filter(Boolean).join(' · ')}</div>
                            {d.coleNext && <div className="truncate text-xs text-fg-2">Cole: {d.coleNext}</div>}
                          </div>
                          {d.needs[0] && <ActionPill kind={d.needs[0].kind} />}
                          <Icon name="chevronRight" size={16} className="shrink-0 text-faint" />
                        </button>
                        {canDraft(d) && <DraftButton id={d.id} small />}
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            );
          })}
        </ol>
      </Card>
      <p className="mt-2 text-xs text-muted">Each stage counts every deal that reached it. "Here" = deals whose furthest stage it is (tap to see them).</p>
    </div>
  );
}


/** Problem → Data → Fix → Why, one card each; folded after `fold`. */
function Notes({ notes, fold }: { notes: SalesNote[]; fold?: number }) {
  const [all, setAll] = useState(false);
  const shown = fold !== undefined && !all ? notes.slice(0, fold) : notes;
  return (
    <>
      <ul className="space-y-2">
        {shown.map((n) => (
          <li key={n.problem} className="rounded-xl border border-warn/25 bg-warn-soft px-4 py-3 text-sm leading-snug">
            <div className="flex items-start gap-2.5">
              <Icon name="alert" size={16} className="mt-0.5 shrink-0 text-warn" />
              <div className="min-w-0 flex-1 space-y-1">
                <div className="font-semibold text-fg">{n.problem} <span className="font-normal text-muted">· {n.owner}</span></div>
                <div className="break-words text-fg-2"><span className="text-muted">Data: </span>{n.data}</div>
                <div className="break-words text-fg-2"><span className="text-muted">Fix: </span>{n.fix}</div>
                <div className="break-words text-muted">Why: {n.why}</div>
                {/* Round 5: the right agent's button; it queues a task on that agent's list (approval rules apply). */}
                {(n as typeof n & { actions?: NoteAction[] }).actions?.map((a) => <FixItButton key={a.agent + a.title} agent={a.agent} title={a.title} detail={a.detail} className="pt-1.5" />)}
              </div>
            </div>
          </li>
        ))}
      </ul>
      {fold !== undefined && notes.length > fold && <button onClick={() => setAll(!all)} className="mt-1.5 min-h-9 text-sm font-semibold text-accent-ink hover:underline">{all ? (fold ? 'Show fewer' : 'Hide') : fold ? `Show ${notes.length - fold} more` : `Show ${notes.length === 1 ? "it" : "them"}`}</button>}
    </>
  );
}

// ---------- One deal ----------
function DealPage({ id }: { id: string }) {
  const [d, setD] = useState<SalesDetail4a | null>(null);
  const [error, setError] = useState('');
  const [others, setOthers] = useState(false);
  const load = useCallback(() => { setError(''); api<SalesDetail4a>(`/sales/${encodeURIComponent(id)}`).then(setD).catch((e) => setError(e.message)); }, [id]);
  useEffect(load, [load]);
  // Round 5 loop fix: "Sales" goes UP to the Sales list, never history.back() (that returned to the contract page). See sales/nav.ts.
  const back = <BackLink label="Sales" onClick={() => goUp(`sales/${id}`)} />;
  if (error) return <>{back}<ErrorBox error={error} retry={load} /></>;
  if (!d) return <>{back}<PageSkeleton kind="list" /></>;
  const x = d.deal;
  const company = x.company.replace(/^https?:\/\/(www\.)?/i, '').replace(/\/$/, '');
  const sign = d.links.agreements.find((a) => a.url);
  const current = x.agreements.filter((g) => g.primary);
  const rest = x.agreements.filter((g) => !g.primary);
  const r = x.review;
  return (
    <div>
      {back}
      <Card className="sm:p-7">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <h1 className="break-words text-[24px] font-bold leading-tight tracking-tight sm:text-[26px]">{x.name}</h1>
            <div className="mt-1 break-words text-[15px] text-fg-2">{[company, x.email].filter(Boolean).join(' · ')}</div>
            <div className="mt-2 flex flex-wrap items-center gap-1.5 text-sm text-muted">
              <Pill tone={x.stage === 'onboarded' || x.stage === 'paid' || x.stage === 'signed' ? 'good' : 'info'}>{x.stageLabel}</Pill>
              {x.airtableStage && <Pill>Close: {x.airtableStage}</Pill>}
              {x.lost && <Pill tone="bad">Lost</Pill>}
              {x.inactiveClient && <Pill>Client inactive</Pill>}
              {x.money?.monthly ? <Pill tone="accent">{usd(x.money.monthly)}/mo{x.money.perCall ? ` + ${usd(x.money.perCall)}/call` : ''}</Pill> : null}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2 sm:flex sm:shrink-0 sm:flex-wrap">
            {!x.stages.signed && !x.lost && <Button tone="accent" icon="file" onClick={() => go(`sales/${x.id}/contract`)}>Draft contract</Button>}
            <LinkButton href={d.links.close} icon="external">Close</LinkButton>
            {sign && <LinkButton href={sign.url} icon="pen">Dulcy Sign</LinkButton>}
          </div>
        </div>
        {x.coleNext && (
          <div className="mt-5 flex items-start gap-3 rounded-xl bg-accent-soft px-3.5 py-3 text-sm leading-snug">
            <Avatar name="Cole" size="sm" />
            <div className="min-w-0 flex-1"><div className="font-semibold text-fg">Cole's next step</div><div className="text-fg-2">{x.coleNext}</div></div>
          </div>
        )}
        {x.needs.length > 0 && <ul className="mt-3 space-y-2">{x.needs.map((n) => <NeedLine key={n.kind} n={n} />)}</ul>}
        <div className="mt-6">
          <Label className="mb-2">Stages</Label>
          <ol aria-label="Stages" className="grid grid-cols-4 gap-x-1 gap-y-2.5 sm:grid-cols-7 sm:gap-y-1">
            {x.stageList.map((s) => (
              <li key={s.key} className="min-w-0" title={`${s.label}: ${s.done ? 'done' : 'not yet'}`}>
                <span className={cx('block h-2 rounded-full', s.done ? 'bg-accent' : s.key === nextStage(x.stageList) ? 'bg-accent/35 ring-1 ring-inset ring-accent' : 'bg-line')} />
                <span className={cx('mt-1 block truncate text-center text-xs', s.done ? 'text-fg-2' : 'text-muted')}>{SHORT[s.key]}</span>
                <span className="sr-only">{s.done ? 'done' : 'not yet'}</span>
              </li>
            ))}
          </ol>
        </div>
      </Card>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Section title="Latest call review" icon="sparkles">
          {r ? (
            <button onClick={() => go(`report/${r.id}`)} className="flex w-full items-start gap-3 px-5 py-4 text-left transition hover:bg-hover">
              <span className="tabular grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-accent-soft text-base font-bold text-accent-ink">{r.score ?? '?'}</span>
              <span className="min-w-0 flex-1 space-y-1">
                <span className="flex flex-wrap items-center gap-1.5"><span className="text-xs text-muted">{when(r.created)}</span>{r.temperature && <Pill tone={TEMP_TONE[r.temperature] ?? 'plain'}>{r.temperature}</Pill>}</span>
                <span className="block text-[15px] text-fg">{r.verdict}</span>
                {r.nextStep && !/^none$/i.test(r.nextStep) && <span className="block text-sm text-fg-2"><span className="text-muted">Agreed on the call: </span>{r.nextStep}</span>}
                <span className="block text-xs text-muted">Tap for the 3 fixes and the follow-up draft</span>
              </span>
              <Icon name="chevronRight" size={16} className="mt-1 text-faint" />
            </button>
          ) : <Quiet>No call review from Cole for this deal yet{x.prep ? '' : ' (and no prep)'}. Cole reviews each recorded sales call from Fathom.</Quiet>}
          {x.reviews.length > 1 && <div className="border-t border-line px-5 py-2.5 text-xs text-muted">{x.reviews.length - 1} older review{x.reviews.length === 2 ? '' : 's'}: {x.reviews.slice(1).map((y) => `${when(y.created)} ${y.score ?? '?'}/10`).join(' · ')}</div>}
          {x.prep && <button onClick={() => go(`report/${x.prep!.id}`)} className="flex min-h-11 w-full items-center gap-2 border-t border-line px-5 text-sm font-semibold text-accent-ink hover:bg-hover">Cole's prep for the call<Icon name="chevronRight" size={15} /></button>}
        </Section>

        <Section title="Calls" icon="clock">
          <DealCalls calls={d.calls as unknown as DealCall[]} />
          <div className="border-t border-line px-5 py-3 text-xs text-muted">{[x.source && `Source: ${x.source}`, x.rep && `Rep: ${x.rep}`, x.campaign && `Campaign: ${x.campaign}`, x.bookedAt && `booked ${when(x.bookedAt)}`].filter(Boolean).join(' · ') || 'No booking details stored.'}</div>
        </Section>

        <Section title="Contract" icon="file">
          {x.agreements.length ? (
            <>
              <ul className="divide-y divide-line">{current.map((g) => <AgreementLine key={g.id} g={g} links={d.links.agreements} />)}</ul>
              {rest.length > 0 && (
                <div className="border-t border-line">
                  <button onClick={() => setOthers(!others)} aria-expanded={others} className="flex min-h-11 w-full items-center gap-2 px-5 text-left text-sm font-semibold text-fg-2 hover:bg-hover">
                    {rest.length} other record{rest.length === 1 ? '' : 's'} for this deal (why)<Icon name="chevronDown" size={15} className={cx('transition', others && 'rotate-180')} />
                  </button>
                  {others && <ul className="divide-y divide-line border-t border-line bg-sunken">{rest.map((g) => <AgreementLine key={g.id} g={g} links={d.links.agreements} folded />)}</ul>}
                </div>
              )}
            </>
          ) : <Quiet>No agreement yet. Use "Draft contract" to make one in Dulcy Sign (it is not sent).</Quiet>}
        </Section>

        <Section title="Payment and onboarding" icon="check">
          <ol className="divide-y divide-line">
            {d.onboarding.map((s) => (
              <li key={s.step} className="flex items-start gap-3 px-5 py-3">
                <span className={cx('mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full', s.done ? 'bg-good text-surface' : 'border border-line-strong')} aria-hidden="true">{s.done && <Icon name="check" size={12} strokeWidth={3} />}</span>
                <span className="min-w-0 flex-1"><span className="block text-[15px] text-fg">{s.step}<span className="sr-only">{s.done ? ': done' : ': not yet'}</span></span>{s.note && <span className="block break-words text-xs text-muted">{s.note}</span>}</span>
              </li>
            ))}
          </ol>
          {x.money?.paidTotal ? <div className="border-t border-line px-5 py-3 text-xs text-muted">Paid since signing: <span className="tabular font-semibold text-fg-2">{usd(x.money.paidTotal)}</span></div> : null}
        </Section>
      </div>

      {x.feedback.length > 0 && (
        <section className="mt-6">
          <SectionHeader title="Call feedback" icon="message" />
          <Card className="p-0">
            <ul className="divide-y divide-line">
              {x.feedback.map((f) => (
                <li key={f.id} className="px-5 py-3">
                  <div className="flex flex-wrap items-center gap-1.5 text-sm"><span className="tabular text-xs text-muted">{day(f.created)}</span>{f.status ? <Pill tone={/^qualified/i.test(f.status) ? 'good' : /no show|unqualified/i.test(f.status) ? 'warn' : 'plain'}>{f.status}</Pill> : <Pill tone="bad">No status</Pill>}{f.rating !== null && <span className="text-xs text-muted">rated {f.rating}/5</span>}{f.newDate && <span className="text-xs text-muted">new date {day(f.newDate)}</span>}</div>
                  {f.notes && <div className="mt-1 whitespace-pre-wrap break-words text-sm text-fg-2">{f.notes}</div>}
                </li>
              ))}
            </ul>
          </Card>
        </section>
      )}

      <DealCloseUpdates rows={(d as SalesDetail4a & { closeUpdates?: CloseUpdateRow[] }).closeUpdates} />
      {x.notes && <section className="mt-6"><SectionHeader title="Notes (Sales Data)" icon="pen" /><Card><div className="whitespace-pre-wrap break-words text-sm text-fg-2">{x.notes}</div></Card></section>}
      {d.notes.length > 0 && <section className="mt-6"><SectionHeader title="Data to fix" icon="alert" /><p className="-mt-1 mb-2 text-xs text-muted">Records that disagree for this deal; each says who fixes it at the source.</p><Notes notes={d.notes} /></section>}
      <p className="mt-6 text-xs text-muted">Read {timeAgo(d.readAt) || 'just now'} from Airtable, Xero (when connected) and Cole's reviews; kept for 1 minute. Sending, signing and charging stay in Dulcy Sign, Close and Commas.</p>
    </div>
  );
}

function AgreementLine({ g, links, folded }: { g: SalesDetail4a['deal']['agreements'][number]; links: SalesDetail4a['links']['agreements']; folded?: boolean }) {
  const link = links.find((l) => l.id === g.id);
  return (
    <li className="px-5 py-3">
      <div className="flex flex-wrap items-center gap-1.5"><span className="min-w-0 break-words text-[15px] font-medium text-fg">{g.title}</span><Pill tone={STATE_TONE[g.state]}>{STATE_LABEL[g.state]}</Pill><Pill>{toolLabel(g.tool)}</Pill></div>
      {folded && <div className="mt-1 text-sm text-fg-2">{g.why}</div>}
      <div className="mt-1 text-xs text-muted">{[g.signer, g.review, g.sentAt && `sent ${when(g.sentAt)}`, g.viewedAt && `viewed ${when(g.viewedAt)}`, g.clientSignedAt && `client signed ${when(g.clientSignedAt)}`, g.signedAt && `signed ${when(g.signedAt)}`, g.monthly ? `${usd(g.monthly)}/mo` : ''].filter(Boolean).join(' · ')}</div>
      {g.error && <div className="mt-1 break-words text-xs text-bad">{g.error}</div>}
      {(link?.url || link?.reviewDoc) && (
        <div className="mt-1.5 flex flex-wrap gap-3 text-sm">
          {link?.url && <ExtLink href={link.url} className="max-sm:inline-flex max-sm:min-h-10 max-sm:items-center">Open in Dulcy Sign</ExtLink>}
          {link?.reviewDoc && <ExtLink href={link.reviewDoc} className="max-sm:inline-flex max-sm:min-h-10 max-sm:items-center">Review document</ExtLink>}
        </div>
      )}
    </li>
  );
}

const SHORT: Record<SalesStage, string> = { booked: 'Booked', showed: 'Showed', qualified: 'Qualified', sent: 'Sent', signed: 'Signed', paid: 'Paid', onboarded: 'Onboard' };
const nextStage = (xs: { key: SalesStage; done: boolean }[]) => xs.find((s) => !s.done)?.key;

function NeedLine({ n }: { n: SalesAction }) {
  const t = ACTION[n.kind].tone;
  return (
    <li className={cx('flex items-start gap-3 rounded-xl px-3.5 py-3 text-sm leading-snug', t === 'bad' ? 'bg-bad-soft' : t === 'warn' ? 'bg-warn-soft' : t === 'info' ? 'bg-info-soft' : 'bg-accent-soft')}>
      <Avatar name={n.owner} size="sm" />
      <div className="min-w-0 flex-1"><div className="font-semibold text-fg">{ACTION[n.kind].label} · {n.owner}</div><div className="text-fg-2">{n.text}</div></div>
      {n.link && <button onClick={() => go(n.link!)} className="shrink-0 self-center text-sm font-semibold text-accent-ink hover:underline">Open</button>}
    </li>
  );
}

function Section({ title, icon, children }: { title: string; icon: string; children: ReactNode }) {
  return <section className="min-w-0"><SectionHeader title={title} icon={icon} /><Card className="p-0">{children}</Card></section>;
}
const Quiet = ({ children }: { children: ReactNode }) => <div className="px-5 py-4 text-sm text-muted">{children}</div>;
function LinkButton({ href, icon, children }: { href: string; icon: string; children: ReactNode }) {
  if (!/^https:\/\//i.test(href)) return null;
  return <a href={href} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 min-w-0 items-center justify-center gap-2 whitespace-nowrap rounded-xl border border-line-strong bg-surface px-4 text-[15px] font-semibold text-fg transition hover:bg-hover"><Icon name={icon} size={17} strokeWidth={2.1} /><span className="truncate">{children}</span></a>;
}

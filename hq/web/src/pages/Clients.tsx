import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { api, type AgencyNumbers, type Client, type ClientCustomResults, type ClientHealth, type ClientInsight, type ClientPeriod, type ClientProfit, type ClientProfitView, type ClientsSummary, type CustomRange, type ResultsWindow, type User } from '../api';
import { Card, cx, Empty, ErrorBox, go, Icon, IconButton, PageSkeleton, PageTitle, Pill, SectionHeader, setCount, StatusDot, timeAgo, usd, useCounts, type Tone } from '../ui';
import { slashDate } from '../dates';

interface ClientsData { clients: Client[]; summary: ClientsSummary; window: ResultsWindow }

export const healthTone: Record<ClientHealth, Tone> = { safe: 'good', at_risk: 'warn', attention: 'bad', unknown: 'idle', inactive: 'idle' };
const pillTone = (h: ClientHealth) => (h === 'safe' ? 'good' : h === 'at_risk' ? 'warn' : h === 'attention' ? 'bad' : 'plain');
export const WINDOW_LABEL: Record<ResultsWindow | 'custom', string> = { 10: 'Last 10 days', 30: 'Last 30 days', 60: 'Last 60 days', 120: 'Last 120 days', all: 'All time', custom: 'Custom' };
const PERIOD_LABEL: Record<ClientPeriod | 'custom', string> = { 'this-month': 'This month', 'last-month': 'Last month', '3m': 'Last 3 months', '6m': 'Last 6 months', '12m': 'Last 12 months', 'this-year': 'This year vs last year', custom: 'Custom' };
const read = (k: string, d: string) => { try { return localStorage.getItem(k) || d; } catch { return d; } };
const save = (k: string, v: string) => { try { localStorage.setItem(k, v); } catch { /* per device only */ } };
const isDay = (x: string) => /^\d{4}-\d{2}-\d{2}$/.test(x);
/** A saved custom range ("from|to"), or empty dates. */
const readRange = (k: string): CustomRange => { const [from = '', to = ''] = read(k, '').split('|'); return isDay(from) && isDay(to) ? { from, to } : { from: '', to: '' }; };
const saveRange = (k: string, r: CustomRange) => save(k, `${r.from}|${r.to}`);
const rangeOk = (r: CustomRange) => isDay(r.from) && isDay(r.to) && r.from <= r.to;
const rangeQuery = (r: CustomRange) => `from=${r.from}&to=${r.to}`;
export const num = (x: number | null | undefined) => (x === null || x === undefined ? '–' : x.toLocaleString('en-US'));
export const pct1 = (x: number | null | undefined) => (x === null || x === undefined ? '–' : `${Math.round(x * 1000) / 10}%`);
/** A money amount with its deal: "$1,500/mo + $250/call". */
export function dealLine(c: Client): string {
  const m = c.money; if (!m) return '';
  if (m.dealType === 'unknown') return 'Deal UNKNOWN';
  return [m.fee ? `${usd(m.fee)}/mo` : '', m.perCall ? `${usd(m.perCall)}/call` : ''].filter(Boolean).join(' + ');
}

/** Clients: health on the promised KPI first, then results; agency numbers and profit per client for the owner. */
export default function Clients({ user }: { user: User }) {
  const owner = user.role === 'owner';
  const [all, setAll] = useState(() => read('hq-clients-all', '0') === '1');
  const [win, setWin] = useState<ResultsWindow | 'custom'>(() => read('hq-clients-window', '30') as ResultsWindow | 'custom');
  const [winRange, setWinRange] = useState<CustomRange>(() => readRange('hq-clients-window-range'));
  const [d, setD] = useState<ClientsData | null>(null);
  const [custom, setCustom] = useState<ClientCustomResults | null>(null);
  const [customError, setCustomError] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  // The list (health) always reads a fixed window; a Custom range is read on its own (EmailBison for those days).
  const listWin = win === 'custom' ? '30' : win;
  const load = useCallback((refresh = false) => {
    setError(''); setBusy(true);
    api<ClientsData>(`/clients?window=${listWin}${all ? '&all=1' : ''}${refresh ? '&refresh=1' : ''}`)
      .then((x) => { setD(x); setCount('clientsRed', x.clients.filter((c) => c.active && c.health === 'attention').length); })
      .catch((e) => setError(e.message)).finally(() => setBusy(false));
  }, [all, listWin]);
  useEffect(() => load(), [load]);
  useEffect(() => {
    setCustom(null); setCustomError('');
    if (win !== 'custom' || !rangeOk(winRange)) return;
    api<ClientCustomResults>(`/clients/results?${rangeQuery(winRange)}`).then(setCustom).catch((e) => setCustomError(e.message));
  }, [win, winRange]);
  const toggle = () => { const v = !all; setAll(v); save('hq-clients-all', v ? '1' : '0'); };
  const s = d?.summary;
  const kicker = s ? `${s.active} active client${s.active === 1 ? '' : 's'}${s.internal === 1 ? ' + Dulcy' : s.internal === 2 ? ' + Dulcy and Dulcy Free Campaigns' : s.internal ? ` + ${s.internal} of Dulcy's own` : ''}${s.attention ? ` · ${s.attention} need${s.attention === 1 ? 's' : ''} attention` : ''}` : 'Clients';
  const right = (
    <>
      <button role="switch" aria-checked={all} onClick={toggle} className="inline-flex min-h-10 items-center gap-2.5 rounded-xl border border-line bg-surface px-3 text-sm font-medium text-fg-2 shadow-card hover:bg-hover">
        <span aria-hidden="true" className={cx('relative h-5 w-9 rounded-full transition', all ? 'bg-accent' : 'bg-line-strong')}><span className={cx('absolute top-0.5 h-4 w-4 rounded-full bg-surface shadow transition-all', all ? 'left-[18px]' : 'left-0.5')} /></span>
        Inactive{s ? ` (${s.inactive})` : ''}
      </button>
      <IconButton icon="refresh" label="Refresh" onClick={() => load(true)} className={cx('border border-line bg-surface', busy && '[&_svg]:animate-spin')} />
    </>
  );
  const title = <PageTitle title="Clients" kicker={kicker} sub="Health against each client's promised meetings, then results." right={right} />;
  if (error && !d) return <>{title}<ErrorBox error={error} retry={() => load()} /></>;
  if (!d) return <>{title}<PageSkeleton kind="grid" /></>;
  const shown = d.clients;
  // Custom range: each active client's results for those days replace the fixed window's.
  const byId = new Map((custom?.rows ?? []).map((r) => [r.id, r]));
  const resultsRows = shown.filter((c) => c.active).map((c) => (win === 'custom' ? { ...c, results: byId.get(c.id)?.results ?? null } : c));
  return (
    <div>
      {title}
      {error && <div className="mb-4"><ErrorBox error={error} retry={() => load()} /></div>}
      {owner && <OwnerLinks />}
      {owner && <AgencyBlock />}

      <SectionHeader title="Client health" icon="target" right={<span className="text-xs text-muted">Safe · At risk · Needs attention, on the promised KPI</span>} />
      {!shown.length && <Card><Empty icon="briefcase" title="No clients" sub="No active Workspace IDs records in Airtable." /></Card>}
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {shown.map((c) => <ClientCard key={c.id} c={c} owner={owner} />)}
      </div>

      <section className="mt-8">
        <SectionHeader title="Results by client" icon="trendUp" right={
          <RangeSelect label="Period for results" value={win} options={WINDOW_LABEL} range={winRange}
            onChange={(v, r) => { setWin(v); save('hq-clients-window', v); if (r) { setWinRange(r); saveRange('hq-clients-window-range', r); } }} />
        } />
        {win === 'custom' && !rangeOk(winRange) && <Card className="mb-3 text-sm text-muted">Pick a from and a to date, then Show.</Card>}
        {customError && <div className="mb-3"><ErrorBox error={customError} /></div>}
        {win === 'custom' && rangeOk(winRange) && !custom && !customError ? <Card className="text-sm text-muted">Reading EmailBison for {slashRange(winRange)}…</Card> : <ResultsTable clients={resultsRows} notes={win === 'custom' ? byId : undefined} />}
        {custom?.errors.map((e) => <Line key={e} warn>{e}</Line>)}
        <p className="mt-2 text-xs text-muted">{win === 'custom'
          ? 'EmailBison totals for the chosen days; meetings = bookings in those days (Airtable Emails). People contacted = unique leads emailed.'
          : 'EmailBison numbers (Airtable "Email Analytics Overview", synced nightly). People contacted = unique leads emailed (Total Leads Contacted). Emails per meeting = emails sent ÷ meetings booked.'}</p>
      </section>

      {owner && <ProfitBlock />}
      <p className="mt-6 text-xs text-muted">From Airtable, read {timeAgo(d.summary.readAt) || 'just now'}; kept for 5 minutes.</p>
    </div>
  );
}

/** The ways into Sales and Finances (on the phone there is no room for more header icons). */
function OwnerLinks() {
  const n = useCounts().sales;
  const link = (to: string, icon: 'dollar' | 'layers', name: string, sub: string, badge?: number) => (
    <Card onClick={() => go(to)} label={`Open ${name}`} className="flex items-center gap-3 px-4 py-3">
      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-accent-soft text-accent-ink"><Icon name={icon} size={18} /></span>
      <span className="min-w-0 flex-1"><span className="block text-[15px] font-semibold text-fg">{name}</span><span className="block text-sm text-muted sm:truncate">{sub}</span></span>
      {!!badge && <span className="tabular rounded-full bg-accent px-2 py-0.5 text-xs font-semibold text-accent-fg" aria-label={`${badge} need action`}>{badge}</span>}
      <Icon name="chevronRight" size={18} className="text-faint" />
    </Card>
  );
  return (
    <div className="mb-4 grid gap-3 sm:grid-cols-2">
      {link('sales', 'dollar', 'Sales', 'New deals: booked call to signed and paid', n)}
      {link('finances', 'layers', 'Finances', 'Company income and costs (Xero), Personal')}
    </div>
  );
}

/** A period dropdown with a Custom choice: from / to dates and Show. Round 4 (Alex 2026-11-28). */
function RangeSelect<K extends string>({ label, value, options, range, onChange }: { label: string; value: K; options: Record<K, string>; range: CustomRange; onChange: (v: K, r?: CustomRange) => void }) {
  const [from, setFrom] = useState(range.from); const [to, setTo] = useState(range.to);
  const ok = rangeOk({ from, to });
  const input = 'mt-0.5 block min-h-10 rounded-xl border border-line bg-surface px-2 text-sm text-fg focus:outline-none focus:ring-2 focus:ring-accent';
  return (
    <span className="flex flex-wrap items-end justify-end gap-2">
      <select aria-label={label} value={value} onChange={(e) => onChange(e.target.value as K)}
        className="min-h-10 rounded-xl border border-line bg-surface px-3 text-sm font-medium text-fg focus:outline-none focus:ring-2 focus:ring-accent">
        {(Object.keys(options) as K[]).map((k) => <option key={k} value={k}>{options[k]}</option>)}
      </select>
      {value === 'custom' && (
        <>
          <label className="text-xs text-muted">From<input type="date" value={from} max={to || undefined} onChange={(e) => setFrom(e.target.value)} className={input} /></label>
          <label className="text-xs text-muted">To<input type="date" value={to} min={from || undefined} onChange={(e) => setTo(e.target.value)} className={input} /></label>
          <button disabled={!ok || (from === range.from && to === range.to)} onClick={() => onChange(value, { from, to })} className="min-h-10 rounded-xl bg-ink px-4 text-sm font-semibold text-ink-fg disabled:opacity-40">Show</button>
        </>
      )}
    </span>
  );
}
/** "11/1 to 11/30" (dates with slashes). */
const slashRange = (r: CustomRange) => `${slashDate(r.from)} to ${slashDate(r.to)}`;

/** Problem → Decision → what supports it, one short line each. */
export function InsightLines({ i, className }: { i: ClientInsight; className?: string }) {
  return (
    <div className={cx('space-y-1 text-sm leading-snug', className)}>
      <div className="font-semibold text-fg">{i.problem}</div>
      <div className="flex gap-1.5 text-fg-2"><Icon name="arrowRight" size={14} className="mt-0.5 text-muted" />{i.decision}</div>
      <div className="text-xs text-muted">{i.support}</div>
    </div>
  );
}

export function HealthPill({ c }: { c: Client }) {
  return <Pill tone={pillTone(c.health)}><StatusDot tone={healthTone[c.health]} />{c.healthLabel}</Pill>;
}

function ClientCard({ c, owner }: { c: Client; owner: boolean }) {
  const r = c.results;
  return (
    <Card onClick={() => go(`clients/${c.id}`)} label={`${c.name}: ${c.healthLabel}. ${c.insight?.problem ?? ''}`} className={cx('group flex flex-col p-5', !c.active && 'opacity-80')}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="truncate text-[17px] font-semibold tracking-tight text-fg">{c.name}</div>
          <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-muted">
            <HealthPill c={c} />
            {!c.internal && <span>{c.dealLabel}</span>}
            {!c.active && <Pill>{c.inactiveReason || 'Inactive'}</Pill>}
          </div>
        </div>
        <Icon name="chevronRight" size={18} className="mt-1 text-faint transition group-hover:translate-x-0.5 group-hover:text-muted" />
      </div>
      {c.insight && <InsightLines i={c.insight} className="mt-4 rounded-xl bg-sunken px-3 py-2.5" />}
      {c.active && (
        <div className="mt-4 grid grid-cols-3 gap-2 text-center">
          <Num label="Meetings · 30 d" sub={c.kpi ? `KPI ${c.kpi}/mo` : 'KPI UNKNOWN'} v={num(c.meetings30)} tone={c.health === 'attention' ? 'bad' : c.health === 'at_risk' ? 'warn' : undefined} />
          <Num label="Emails / meeting" sub={r ? WINDOW_LABEL[r.window].toLowerCase() : 'no data'} v={num(r?.emailsPerMeeting)} />
          <Num label="Interested → booked" sub={r ? `${num(r.interested)} interested` : 'no data'} v={pct1(r?.interestedToBooked)} />
        </div>
      )}
      {owner && c.money && (
        <div className="mt-auto pt-4">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-line pt-3 text-xs text-muted">
            <span className="tabular font-semibold text-fg-2">{dealLine(c)}</span>
            {c.money.ltv !== null && <span>LTV <span className="tabular font-semibold text-fg-2">{usd(c.money.ltv)}</span></span>}
            {!!c.money.receivables && <span>{c.money.invoices.some((i) => i.late) ? <span className="font-medium text-bad">late</span> : 'coming up'} <span className="tabular font-semibold text-fg-2">{usd(c.money.receivables)}</span></span>}
          </div>
        </div>
      )}
    </Card>
  );
}

function Num({ label, sub, v, tone }: { label: string; sub: string; v: string; tone?: 'warn' | 'bad' }) {
  return (
    <div className="min-w-0 rounded-xl bg-sunken px-1 py-2">
      <div className={cx('tabular text-xl font-bold leading-tight', tone === 'bad' ? 'text-bad' : tone === 'warn' ? 'text-warn' : 'text-fg')}>{v}</div>
      <div className="text-xs font-medium leading-tight text-fg-2 sm:truncate sm:text-[11px]">{label}</div>
      <div className="mt-0.5 text-[11px] leading-tight text-muted sm:mt-0 sm:truncate sm:text-[10px]">{sub}</div>
    </div>
  );
}

function ResultsTable({ clients, notes }: { clients: Client[]; notes?: Map<string, { note: string }> }) {
  if (!clients.length) return <Card className="text-sm text-muted">No active clients.</Card>;
  const th = 'px-3 py-2.5 text-right font-medium';
  return (
    <Card className="overflow-x-auto p-0">
      <table className="sticky-first w-full min-w-[720px] text-left text-sm">
        <thead className="border-b border-line bg-sunken text-xs text-muted">
          <tr><th className="px-5 py-2.5 font-medium">Client</th><th className={th}>Sent</th><th className={th}>People contacted</th><th className={th}>Interested</th><th className={th}>Meetings</th><th className={th}>Emails / meeting</th><th className={th}>Emails / positive reply</th><th className={th}>Interested → booked</th></tr>
        </thead>
        <tbody className="divide-y divide-line">
          {clients.map((c) => {
            const r = c.results;
            return (
              <tr key={c.id} className="cursor-pointer hover:bg-hover" onClick={() => go(`clients/${c.id}`)}>
                <td className="px-5 py-3 font-medium text-fg"><span className="inline-flex items-center gap-2"><StatusDot tone={healthTone[c.health]} />{c.name}</span>{r?.stale && <span className="ml-2 text-xs text-warn">sync stopped</span>}{notes?.get(c.id)?.note && <span className="ml-2 text-xs text-warn">{notes.get(c.id)!.note}</span>}</td>
                <td className="tabular px-3 py-3 text-right text-fg-2">{num(r?.sent)}</td>
                <td className="tabular px-3 py-3 text-right text-fg-2">{num(r?.contacted)}</td>
                <td className="tabular px-3 py-3 text-right text-fg-2">{num(r?.interested)}</td>
                <td className="tabular px-3 py-3 text-right font-semibold text-fg">{num(r?.meetings)}</td>
                <td className="tabular px-3 py-3 text-right text-fg-2">{num(r?.emailsPerMeeting)}</td>
                <td className="tabular px-3 py-3 text-right text-fg-2">{num(r?.emailsPerPositive)}</td>
                <td className="tabular px-3 py-3 text-right text-fg-2">{pct1(r?.interestedToBooked)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </Card>
  );
}

/** A period choice with its Custom range, remembered on this device. */
function usePeriod(key: string): [ClientPeriod | 'custom', CustomRange, (v: ClientPeriod | 'custom', r?: CustomRange) => void, string] {
  const [period, setPeriod] = useState<ClientPeriod | 'custom'>(() => read(key, 'this-month') as ClientPeriod | 'custom');
  const [range, setRange] = useState<CustomRange>(() => readRange(`${key}-range`));
  const set = useCallback((v: ClientPeriod | 'custom', r?: CustomRange) => { setPeriod(v); save(key, v); if (r) { setRange(r); saveRange(`${key}-range`, r); } }, [key]);
  // '' = nothing to ask yet (Custom with no dates picked).
  const query = period !== 'custom' ? `period=${period}` : rangeOk(range) ? `period=custom&${rangeQuery(range)}` : '';
  return [period, range, set, query];
}

/** The server answers 403 to members. */
function AgencyBlock() {
  const [period, range, setPeriod, query] = usePeriod('hq-clients-period');
  const [n, setN] = useState<AgencyNumbers | null>(null);
  const [error, setError] = useState('');
  useEffect(() => { setError(''); setN(null); if (query) api<{ numbers: AgencyNumbers }>(`/clients/numbers?${query}`).then((x) => setN(x.numbers)).catch((e) => setError(e.message)); }, [query]);
  const vs = (a: number | null, b: number | null, fmt = (x: number) => String(x)) => (b === null || a === null ? '' : `${n?.prev.label}: ${fmt(b)}`);
  return (
    <section className="mb-8">
      <SectionHeader title="Agency numbers" icon="activity" right={<RangeSelect label="Period" value={period} options={PERIOD_LABEL} range={range} onChange={setPeriod} />} />
      {error && <ErrorBox error={error} />}
      {!query && <Card className="text-sm text-muted">Pick a from and a to date, then Show.</Card>}
      {!n && !error && query && <Card className="text-sm text-muted">Loading…</Card>}
      {n && (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Tile label="Current MRR" v={usd(n.mrr)} sub="retainers of active clients" />
            <Tile label="Active clients" v={String(n.activeClients)} sub="paying" />
            <Tile label={`New clients · ${n.cur.label}`} v={String(n.cur.newClients)} sub={vs(n.cur.newClients, n.prev.newClients)} title={n.cur.newNames.join(', ')} />
            <Tile label={`Clients lost · ${n.cur.label}`} v={String(n.cur.lost)} sub={vs(n.cur.lost, n.prev.lost)} title={n.cur.lostNames.join(', ')} tone={n.cur.lost ? 'bad' : undefined} />
            <Tile label="Net new clients" v={`${n.cur.net > 0 ? '+' : ''}${n.cur.net}`} sub={vs(n.cur.net, n.prev.net)} tone={n.cur.net < 0 ? 'bad' : undefined} />
            <Tile label="Monthly churn rate" v={n.cur.churnRate === null ? '–' : `${n.cur.churnRate}%`} sub={vs(n.cur.churnRate, n.prev.churnRate, (x) => `${x}%`)} />
            <Tile label="Average client LTV" v={usd(n.avgLtv)} sub={`all ${n.counted} paying clients`} />
            <Tile label="Average retention" v={n.avgRetentionMonths === null ? '–' : `${n.avgRetentionMonths} mo`} sub="start to end (or today)" />
          </div>
          {n.noEndDate.length > 0 && <p className="mt-2 text-xs text-muted">No end date in Airtable for {n.noEndDate.length} past client{n.noEndDate.length === 1 ? '' : 's'}: left out of lost and churn.</p>}
        </>
      )}
    </section>
  );
}

function Tile({ label, v, sub, tone, title }: { label: string; v: string; sub?: string; tone?: 'bad'; title?: string }) {
  return (
    <div title={title || undefined} className="min-w-0 rounded-2xl border border-line bg-surface p-4 shadow-card">
      <div className="text-xs font-medium leading-snug text-muted sm:truncate">{label}</div>
      <div className={cx('tabular mt-1 text-[24px] font-bold leading-none tracking-tight', tone === 'bad' ? 'text-bad' : 'text-fg')}>{v}</div>
      {sub && <div className="mt-1.5 text-xs leading-snug text-muted sm:truncate">{sub}</div>}
    </div>
  );
}

/**
 * Profit per client (the server answers 403 to members). Revenue from the deal in the period minus
 * the costs HQ knows; every cost it cannot read says UNKNOWN (never a guessed number).
 * Company income and costs moved to Finances (round 4, Alex 2026-11-28).
 */
function ProfitBlock() {
  const [period, range, setPeriod, query] = usePeriod('hq-clients-profit-period');
  const [p, setP] = useState<ClientProfitView | null>(null);
  const [error, setError] = useState('');
  useEffect(() => { setError(''); setP(null); if (query) api<ClientProfitView>(`/clients/profit?${query}`).then(setP).catch((e) => setError(e.message)); }, [query]);
  const th = 'px-3 py-2.5 text-right font-medium';
  const cost = (c: ClientProfit, label: string) => c.costs.find((x) => x.label === label);
  const unknown = 'text-xs font-semibold text-warn';
  const amount = (x?: { amount: number | null; note: string }) => <td className={cx('tabular px-3 py-3 text-right', !x || x.amount === null ? unknown : 'text-fg-2')} title={x?.note}>{!x || x.amount === null ? 'UNKNOWN' : usd(x.amount)}</td>;
  return (
    <section className="mt-8">
      <SectionHeader title="Profit per client" icon="dollar" right={<RangeSelect label="Period for profit" value={period} options={PERIOD_LABEL} range={range} onChange={setPeriod} />} />
      {error && <ErrorBox error={error} />}
      {!query && <Card className="text-sm text-muted">Pick a from and a to date, then Show.</Card>}
      {!p && !error && query && <Card className="text-sm text-muted">Loading…</Card>}
      {p && (
        <div className="space-y-2">
          {!p.clients.length ? <Card className="text-sm text-muted">No active paying clients.</Card> : (
            <Card className="overflow-x-auto p-0">
              <table className="sticky-first w-full min-w-[720px] text-left text-sm">
                <thead className="border-b border-line bg-sunken text-xs text-muted">
                  <tr><th className="px-5 py-2.5 font-medium">Client</th><th className={th}>Revenue</th><th className={th}>Inboxes</th><th className={th}>Domains</th><th className={th}>Leads + verification</th><th className={cx(th, 'pr-5')}>Profit</th></tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {p.clients.map((c) => (
                    <tr key={c.id} className="cursor-pointer hover:bg-hover" onClick={() => go(`clients/${c.id}`)}>
                      <td className="px-5 py-3"><div className="font-medium text-fg">{c.name}</div><div className="text-xs text-muted">{c.revenueNote}</div></td>
                      <td className={cx('tabular px-3 py-3 text-right', c.revenue === null ? unknown : 'text-fg-2')}>{c.revenue === null ? 'UNKNOWN' : usd(c.revenue)}</td>
                      {amount(cost(c, 'Inboxes'))}{amount(cost(c, 'Domains'))}{amount(cost(c, 'Leads and verification'))}
                      <td className={cx('tabular py-3 pl-3 pr-5 text-right font-semibold', c.profit === null ? unknown : c.profit < 0 ? 'text-bad' : 'text-fg')}>{c.profit === null ? 'UNKNOWN' : usd(c.profit)}</td>
                    </tr>
                  ))}
                </tbody>
                {p.totals.clientsWithRevenue > 0 && (
                  <tfoot className="border-t border-line bg-sunken text-sm">
                    <tr>
                      <td className="px-5 py-2.5 font-semibold text-fg">Total{p.totals.clientsWithRevenue < p.clients.length ? ` (${p.totals.clientsWithRevenue} with revenue)` : ''}</td>
                      <td className="tabular px-3 py-2.5 text-right font-semibold text-fg">{usd(p.totals.revenue)}</td>
                      <td colSpan={3} className="tabular px-3 py-2.5 text-right text-fg-2">known costs {usd(p.totals.knownCosts)}</td>
                      <td className="tabular py-2.5 pl-3 pr-5 text-right font-bold text-fg">{usd(p.totals.profit)}</td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </Card>
          )}
          <Line>{p.range.label} ({slashDate(p.range.from)} to {slashDate(lastDay(p.range.to))}). Profit = revenue minus the known costs; UNKNOWN costs are not in it.</Line>
          <ul className="list-disc space-y-0.5 pl-5 text-xs text-muted">{p.rules.map((r) => <li key={r}>{r}</li>)}</ul>
          {p.errors.map((e) => <Line key={e} warn>{e}</Line>)}
        </div>
      )}
    </section>
  );
}
/** A range end is the day after (exclusive): the last day shown. */
const lastDay = (to: string) => { const t = Date.parse(`${to}T12:00:00Z`) - 86_400_000; return Number.isFinite(t) ? new Date(t).toISOString().slice(0, 10) : to; };
const Line = ({ children, warn }: { children: ReactNode; warn?: boolean }) => <p className={cx('text-xs', warn ? 'text-warn' : 'text-muted')}>{children}</p>;

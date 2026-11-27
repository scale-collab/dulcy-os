import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { api, type AgencyNumbers, type Client, type ClientFinance, type ClientHealth, type ClientInsight, type ClientPeriod, type ClientsSummary, type ResultsWindow, type User } from '../api';
import { Card, cx, Empty, ErrorBox, go, Icon, IconButton, PageSkeleton, PageTitle, Pill, SectionHeader, setCount, StatusDot, timeAgo, usd, useCounts, type Tone } from '../ui';
import { ClientPicker, rememberedClient } from '../clientPicker';

interface ClientsData { clients: Client[]; summary: ClientsSummary; window: ResultsWindow }

export const healthTone: Record<ClientHealth, Tone> = { safe: 'good', at_risk: 'warn', attention: 'bad', unknown: 'idle', inactive: 'idle' };
const pillTone = (h: ClientHealth) => (h === 'safe' ? 'good' : h === 'at_risk' ? 'warn' : h === 'attention' ? 'bad' : 'plain');
export const WINDOW_LABEL: Record<ResultsWindow, string> = { 10: 'Last 10 days', 30: 'Last 30 days', 60: 'Last 60 days', 120: 'Last 120 days', all: 'All time' };
const PERIOD_LABEL: Record<ClientPeriod, string> = { 'this-month': 'This month', 'last-month': 'Last month', '3m': 'Last 3 months', '6m': 'Last 6 months', '12m': 'Last 12 months', 'this-year': 'This year vs last year' };
const read = (k: string, d: string) => { try { return localStorage.getItem(k) || d; } catch { return d; } };
const save = (k: string, v: string) => { try { localStorage.setItem(k, v); } catch { /* per device only */ } };
export const num = (x: number | null | undefined) => (x === null || x === undefined ? '–' : x.toLocaleString('en-US'));
export const pct1 = (x: number | null | undefined) => (x === null || x === undefined ? '–' : `${Math.round(x * 1000) / 10}%`);
/** A money amount with its deal: "$1,500/mo + $250/call". */
export function dealLine(c: Client): string {
  const m = c.money; if (!m) return '';
  if (m.dealType === 'unknown') return 'Deal UNKNOWN';
  return [m.fee ? `${usd(m.fee)}/mo` : '', m.perCall ? `${usd(m.perCall)}/call` : ''].filter(Boolean).join(' + ');
}

/** Clients: health on the promised KPI first, then results; agency numbers and money for the owner only. */
export default function Clients({ user }: { user: User }) {
  const owner = user.role === 'owner';
  const [all, setAll] = useState(() => read('hq-clients-all', '0') === '1');
  const [win, setWin] = useState<ResultsWindow>(() => read('hq-clients-window', '30') as ResultsWindow);
  const [pick, setPick] = useState(() => rememberedClient('clients', undefined));
  const [d, setD] = useState<ClientsData | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const load = useCallback((refresh = false) => {
    setError(''); setBusy(true);
    api<ClientsData>(`/clients?window=${win}${all ? '&all=1' : ''}${refresh ? '&refresh=1' : ''}`)
      .then((x) => { setD(x); setCount('clientsRed', x.clients.filter((c) => c.active && c.health === 'attention').length); })
      .catch((e) => setError(e.message)).finally(() => setBusy(false));
  }, [all, win]);
  useEffect(() => load(), [load]);
  const toggle = () => { const v = !all; setAll(v); save('hq-clients-all', v ? '1' : '0'); };
  const options = useMemo(() => (d?.clients ?? []).filter((c) => c.active).map((c) => ({ key: c.key, name: c.name })), [d]);
  const onPick = useCallback((k: string) => setPick(k), []);
  const s = d?.summary;
  const kicker = s ? `${s.active} active client${s.active === 1 ? '' : 's'}${s.internal ? ' + Dulcy' : ''}${s.attention ? ` · ${s.attention} need${s.attention === 1 ? 's' : ''} attention` : ''}` : 'Clients';
  const right = (
    <>
      <ClientPicker screen="clients" value={pick} options={options} onChange={onPick} />
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
  const shown = d.clients.filter((c) => !pick || c.key === pick);
  return (
    <div>
      {title}
      {error && <div className="mb-4"><ErrorBox error={error} retry={() => load()} /></div>}
      {owner && <SalesLink />}
      {owner && <AgencyBlock />}

      <SectionHeader title="Client health" icon="target" right={<span className="text-xs text-muted">Safe · At risk · Needs attention, on the promised KPI</span>} />
      {!shown.length && <Card><Empty icon="briefcase" title="No clients" sub="No active Workspace IDs records in Airtable." /></Card>}
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {shown.map((c) => <ClientCard key={c.id} c={c} owner={owner} />)}
      </div>

      <section className="mt-8">
        <SectionHeader title="Results by client" icon="trendUp" right={
          <select aria-label="Period for results" value={win} onChange={(e) => { const v = e.target.value as ResultsWindow; setWin(v); save('hq-clients-window', v); }}
            className="min-h-10 rounded-xl border border-line bg-surface px-3 text-sm font-medium text-fg focus:outline-none focus:ring-2 focus:ring-accent">
            {(Object.keys(WINDOW_LABEL) as ResultsWindow[]).map((w) => <option key={w} value={w}>{WINDOW_LABEL[w]}</option>)}
          </select>
        } />
        <ResultsTable clients={shown.filter((c) => c.active)} />
        <p className="mt-2 text-xs text-muted">EmailBison numbers (Airtable "Email Analytics Overview", synced nightly). Emails per meeting = emails sent ÷ meetings booked.</p>
      </section>

      {owner && <MoneyBlock />}
      <p className="mt-6 text-xs text-muted">From Airtable, read {timeAgo(d.summary.readAt) || 'just now'}; kept for 5 minutes.</p>
    </div>
  );
}

/** Owner only: the way into Sales (on the phone there is no room for another header icon). */
function SalesLink() {
  const n = useCounts().sales;
  return (
    <Card onClick={() => go('sales')} label="Open Sales" className="mb-4 flex items-center gap-3 px-4 py-3">
      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-accent-soft text-accent-ink"><Icon name="dollar" size={18} /></span>
      <span className="min-w-0 flex-1"><span className="block text-[15px] font-semibold text-fg">Sales</span><span className="block truncate text-sm text-muted">New deals: booked call to signed and paid</span></span>
      {!!n && <span className="tabular rounded-full bg-accent px-2 py-0.5 text-xs font-semibold text-accent-fg" aria-label={`${n} need action`}>{n}</span>}
      <Icon name="chevronRight" size={18} className="text-faint" />
    </Card>
  );
}

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
      <div className="truncate text-[11px] font-medium text-fg-2">{label}</div>
      <div className="truncate text-[10px] text-muted">{sub}</div>
    </div>
  );
}

function ResultsTable({ clients }: { clients: Client[] }) {
  if (!clients.length) return <Card className="text-sm text-muted">No active clients.</Card>;
  const th = 'px-3 py-2.5 text-right font-medium';
  return (
    <Card className="overflow-x-auto p-0">
      <table className="w-full min-w-[640px] text-left text-sm">
        <thead className="border-b border-line bg-sunken text-xs text-muted">
          <tr><th className="px-5 py-2.5 font-medium">Client</th><th className={th}>Sent</th><th className={th}>Interested</th><th className={th}>Meetings</th><th className={th}>Emails / meeting</th><th className={th}>Emails / positive reply</th><th className={th}>Interested → booked</th></tr>
        </thead>
        <tbody className="divide-y divide-line">
          {clients.map((c) => {
            const r = c.results;
            return (
              <tr key={c.id} className="cursor-pointer hover:bg-hover" onClick={() => go(`clients/${c.id}`)}>
                <td className="px-5 py-3 font-medium text-fg"><span className="inline-flex items-center gap-2"><StatusDot tone={healthTone[c.health]} />{c.name}</span>{r?.stale && <span className="ml-2 text-xs text-warn">sync stopped</span>}</td>
                <td className="tabular px-3 py-3 text-right text-fg-2">{num(r?.sent)}</td>
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

/** Owner only (the server answers 403 to members). */
function AgencyBlock() {
  const [period, setPeriod] = useState<ClientPeriod>(() => read('hq-clients-period', 'this-month') as ClientPeriod);
  const [n, setN] = useState<AgencyNumbers | null>(null);
  const [error, setError] = useState('');
  useEffect(() => { setError(''); api<{ numbers: AgencyNumbers }>(`/clients/numbers?period=${period}`).then((x) => setN(x.numbers)).catch((e) => setError(e.message)); }, [period]);
  const vs = (a: number | null, b: number | null, fmt = (x: number) => String(x)) => (b === null || a === null ? '' : `${n?.prev.label}: ${fmt(b)}`);
  return (
    <section className="mb-8">
      <SectionHeader title="Agency numbers" icon="activity" right={
        <span className="flex items-center gap-2">
          <span className="hidden text-xs text-muted sm:inline">owner only</span>
          <select aria-label="Period" value={period} onChange={(e) => { const v = e.target.value as ClientPeriod; setPeriod(v); save('hq-clients-period', v); }}
            className="min-h-10 rounded-xl border border-line bg-surface px-3 text-sm font-medium text-fg focus:outline-none focus:ring-2 focus:ring-accent">
            {(Object.keys(PERIOD_LABEL) as ClientPeriod[]).map((p) => <option key={p} value={p}>{PERIOD_LABEL[p]}</option>)}
          </select>
        </span>
      } />
      {error && <ErrorBox error={error} />}
      {!n && !error && <Card className="text-sm text-muted">Loading…</Card>}
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
      <div className="truncate text-xs font-medium text-muted">{label}</div>
      <div className={cx('tabular mt-1 text-[24px] font-bold leading-none tracking-tight', tone === 'bad' ? 'text-bad' : 'text-fg')}>{v}</div>
      {sub && <div className="mt-1.5 truncate text-xs text-muted">{sub}</div>}
    </div>
  );
}

/** Owner only: Xero income and the P/L sheet's card debts. */
function MoneyBlock() {
  const [f, setF] = useState<ClientFinance | null>(null);
  const [error, setError] = useState('');
  useEffect(() => { api<ClientFinance>('/clients/finance').then(setF).catch((e) => setError(e.message)); }, []);
  return (
    <section className="mt-8">
      <SectionHeader title="Money" icon="dollar" right={<span className="text-xs text-muted">owner only · Xero + Dulcy Media P/L</span>} />
      {error && <ErrorBox error={error} />}
      {!f && !error && <Card className="text-sm text-muted">Loading…</Card>}
      {f && (
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Tile label="Income this month" v={f.xero ? usd(f.xero.thisMonth.income) : 'UNKNOWN'} sub="Xero P&L, so far" />
            <Tile label="Income last month" v={f.xero ? usd(f.xero.lastMonth.income) : 'UNKNOWN'} sub="Xero P&L" />
            <Tile label="Costs this month" v={f.xero ? usd(f.xero.thisMonth.costs) : 'UNKNOWN'} sub="Xero P&L" />
            <Tile label="Card debt" v={f.cardTotals ? usd(f.cardTotals.balance) : 'UNKNOWN'} sub={f.cardTotals ? `statements ${usd(f.cardTotals.statement)}` : 'P/L sheet'} />
          </div>
          {f.cards && f.cards.length > 0 && (
            <Card className="overflow-x-auto p-0">
              <table className="w-full min-w-[520px] text-left text-sm">
                <thead className="border-b border-line bg-sunken text-xs text-muted"><tr><th className="px-5 py-2.5 font-medium">Card</th><th className="px-3 py-2.5 font-medium">Due</th><th className="px-3 py-2.5 text-right font-medium">Statement</th><th className="px-3 py-2.5 text-right font-medium">Balance</th><th className="px-5 py-2.5 text-right font-medium">Minimum</th></tr></thead>
                <tbody className="divide-y divide-line">
                  {f.cards.map((c) => <tr key={c.card}><td className="px-5 py-2.5 font-medium text-fg">{c.card}</td><td className="px-3 py-2.5 text-fg-2">{c.dueDate || '–'}</td><td className="tabular px-3 py-2.5 text-right text-fg-2">{usd(c.statement)}</td><td className="tabular px-3 py-2.5 text-right font-semibold text-fg">{usd(c.balance)}</td><td className="tabular px-5 py-2.5 text-right text-fg-2">{usd(c.minimum)}</td></tr>)}
                </tbody>
              </table>
            </Card>
          )}
          {f.xero && f.xero.invoices.length > 0 && (
            <Card className="text-sm">
              <div className="mb-1 text-xs font-medium text-muted">Open client invoices (Xero)</div>
              <ul className="space-y-1">{f.xero.invoices.map((i, k) => <li key={k} className="flex justify-between gap-3"><span className="truncate text-fg-2">{i.contact}</span><span className={cx('tabular shrink-0', i.late ? 'font-semibold text-bad' : 'text-fg-2')}>{usd(i.amount)} · {i.late ? `late since ${i.due}` : `due ${i.due}`}</span></li>)}</ul>
            </Card>
          )}
          {f.notInAirtable.length > 0 && <Line>On the P/L sheet but not an active Airtable client: {f.notInAirtable.join(', ')}.</Line>}
          {f.errors.map((e) => <Line key={e} warn>{e}</Line>)}
        </div>
      )}
    </section>
  );
}
const Line = ({ children, warn }: { children: ReactNode; warn?: boolean }) => <p className={cx('text-xs', warn ? 'text-warn' : 'text-muted')}>{children}</p>;

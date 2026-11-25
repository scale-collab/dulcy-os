import { useCallback, useEffect, useState } from 'react';
import { api, type Client, type ClientsSummary, type User } from '../api';
import { Card, cx, Empty, ErrorBox, go, Icon, IconButton, lightLabel, lightTone, PageSkeleton, PageTitle, Pill, setCount, StatusDot, timeAgo, usd } from '../ui';

interface ClientsData { clients: Client[]; summary: ClientsSummary }

/** Clients: every client as a card, worst health first. Money only comes back for the owner. */
export default function Clients({ user }: { user: User }) {
  const [all, setAll] = useState(() => { try { return localStorage.getItem('hq-clients-all') === '1'; } catch { return false; } });
  const [d, setD] = useState<ClientsData | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const load = useCallback((refresh = false) => {
    setError(''); setBusy(true);
    api<ClientsData>(`/clients?${all ? 'all=1&' : ''}${refresh ? 'refresh=1' : ''}`)
      .then((x) => { setD(x); setCount('clientsRed', x.clients.filter((c) => c.light === 'red').length); })
      .catch((e) => setError(e.message)).finally(() => setBusy(false));
  }, [all]);
  useEffect(() => load(), [load]);
  const toggle = () => { const v = !all; setAll(v); try { localStorage.setItem('hq-clients-all', v ? '1' : '0'); } catch { /* per device only */ } };
  const owner = user.role === 'owner';
  const s = d?.summary;
  const kicker = s ? `${s.active} active client${s.active === 1 ? '' : 's'}${s.internal ? ' + Dulcy' : ''}${owner && s.mrr !== undefined ? ` · ${usd(s.mrr)}/mo` : ''}` : 'Clients';
  const right = (
    <>
      <button role="switch" aria-checked={all} onClick={toggle} className="inline-flex min-h-11 items-center gap-2.5 rounded-xl border border-line bg-surface px-3 text-sm font-medium text-fg-2 shadow-card hover:bg-hover">
        <span aria-hidden="true" className={cx('relative h-5 w-9 rounded-full transition', all ? 'bg-accent' : 'bg-line-strong')}><span className={cx('absolute top-0.5 h-4 w-4 rounded-full bg-surface shadow transition-all', all ? 'left-[18px]' : 'left-0.5')} /></span>
        Inactive{s ? ` (${s.inactive})` : ''}
      </button>
      <IconButton icon="refresh" label="Refresh" onClick={() => load(true)} className={cx('border border-line bg-surface', busy && '[&_svg]:animate-spin')} />
    </>
  );
  const title = <PageTitle title="Clients" kicker={kicker} sub="Results, health and a note for today. Worst first." right={right} />;
  if (error && !d) return <>{title}<ErrorBox error={error} retry={() => load()} /></>;
  if (!d) return <>{title}<PageSkeleton kind="grid" /></>;
  return (
    <div>
      {title}
      {error && <div className="mb-4"><ErrorBox error={error} retry={() => load()} /></div>}
      {!d.clients.length && <Card><Empty icon="briefcase" title="No clients" sub="No active Workspace IDs records in Airtable." /></Card>}
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {d.clients.map((c) => <ClientCard key={c.id} c={c} owner={owner} />)}
      </div>
      <p className="mt-6 text-xs text-muted">From Airtable (Workspace IDs, Emails, Campaigns), read {timeAgo(d.summary.readAt) || 'just now'}; kept for 5 minutes. Health is Atlas's grade.</p>
    </div>
  );
}

export const noteBox: Record<string, string> = { red: 'bg-bad-soft text-bad', yellow: 'bg-warn-soft text-warn', green: 'bg-sunken text-fg-2', inactive: 'bg-sunken text-muted' };

function ClientCard({ c, owner }: { c: Client; owner: boolean }) {
  const tone = lightTone[c.light];
  const flags = { pause: c.campaigns.filter((x) => x.flag === 'pause').length, watch: c.campaigns.filter((x) => x.flag === 'watch').length };
  return (
    <Card onClick={() => go(`clients/${c.id}`)} label={`${c.name}: ${lightLabel[c.light]}. ${c.note.join(' ')}`} className={cx('group flex flex-col p-5', !c.active && 'opacity-80')}>
      <div className="flex items-start gap-3">
        <span className={cx('mt-1 grid h-3 w-3 shrink-0 place-items-center')}><StatusDot tone={tone} className="h-3 w-3" /></span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <div className="truncate text-[17px] font-semibold tracking-tight text-fg">{c.name}</div>
            <Icon name="chevronRight" size={18} className="text-faint transition group-hover:translate-x-0.5 group-hover:text-muted" />
          </div>
          <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-muted">
            <span>{lightLabel[c.light]}</span>
            {c.internal && <Pill>Dulcy itself</Pill>}
            {!c.active && <Pill>{c.inactiveReason || 'Inactive'}</Pill>}
            {c.workspaces.length > 1 && <span>· {c.workspaces.length} workspaces</span>}
          </div>
        </div>
      </div>
      {c.note.length > 0 && (
        <div className={cx('mt-4 space-y-0.5 rounded-xl px-3 py-2 text-sm font-medium leading-snug', noteBox[c.light])}>
          {c.note.map((n) => <div key={n}>{n}</div>)}
        </div>
      )}
      <div className="mt-4 grid grid-cols-4 gap-2 text-center">
        <Num label="Interested" sub="30 d" n={c.interested30} />
        <Num label="Booked" sub={c.kpi ? `KPI ${c.kpi}` : '30 d'} n={c.booked30} tone={c.kpi && c.booked30 < c.kpi ? 'warn' : undefined} />
        <Num label="Waiting" sub="approval" n={c.waitingApproval} tone={c.waitingApproval ? 'warn' : undefined} />
        <Num label="Campaigns" sub={flags.pause ? `${flags.pause} over 4%` : flags.watch ? `${flags.watch} to watch` : 'active'} n={c.campaigns.length} tone={flags.pause ? 'bad' : flags.watch ? 'warn' : undefined} />
      </div>
      {owner && c.money && (
        <div className="mt-auto pt-4">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-line pt-3 text-xs text-muted">
            <span><span className="tabular font-semibold text-fg-2">{c.money.fee ? `${usd(c.money.fee)}/mo` : c.internal ? 'no fee' : 'fee UNKNOWN'}</span></span>
            {c.money.ltv !== null && <span>LTV <span className="tabular font-semibold text-fg-2">{usd(c.money.ltv)}</span></span>}
            {!!c.money.receivables && <span className="font-medium text-bad">owes <span className="tabular font-semibold">{usd(c.money.receivables)}</span></span>}
          </div>
        </div>
      )}
    </Card>
  );
}

function Num({ label, sub, n, tone }: { label: string; sub: string; n: number; tone?: 'warn' | 'bad' }) {
  return (
    <div className="min-w-0 rounded-xl bg-sunken px-1 py-2">
      <div className={cx('tabular text-xl font-bold leading-tight', tone === 'bad' ? 'text-bad' : tone === 'warn' ? 'text-warn' : 'text-fg')}>{n.toLocaleString('en-US')}</div>
      <div className="truncate text-[11px] font-medium text-fg-2">{label}</div>
      <div className="truncate text-[10px] text-muted">{sub}</div>
    </div>
  );
}

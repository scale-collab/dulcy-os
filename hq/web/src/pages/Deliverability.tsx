// Deliverability: inboxes and domains in one place (replaces the Airtable Spam Center, Email
// Account Center, Domain & Inbox Inventory, Email Accounts / Warm Up, Inbox Placement Tests and Buy
// Domains & Inboxes screens). Only what's sick by default; everything else is one tap deeper.
// Read only: the buttons open the Decisions pile or the Airtable record. Text is rendered escaped.
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { api } from '../api';
import { Avatar, Card, cx, Empty, ErrorBox, ExtLink, go, Icon, IconButton, PageSkeleton, PageTitle, Pill, setCount, StatusDot, timeAgo, type Tone } from '../ui';

/* ---------- API shapes (engine/src/hq/deliverability.ts) ---------- */
type Health = 'healthy' | 'watch' | 'sick' | 'resting';
interface Reason { code: string; level: 'sick' | 'watch'; text: string; owner: string; fromDomain?: boolean }
interface DLink { label: string; href: string }
interface DNote { level: 'bad' | 'warn' | 'info'; problem: string; data: string; fix: string; why: string; owner: string }
interface Tiles { healthy: number; watch: number; sick: number; resting: number; total: number }
interface ClientTiles { key: string; name: string; tiles: Tiles; domains: number }
interface Item { key: string; kind: 'inbox' | 'domain'; status: Health; title: string; client: string; clientKey: string; reason: string; owner: string; doing: string; links: DLink[]; inboxes?: number }
interface Freshness { newest: string; ageDays: number | null; stale: boolean; expectedFriday: string; fridayMissing: boolean; nextFriday: string; tests: number }
interface EngineRun { kind: string; status: string; at: string; message: string; dryRun: boolean }
interface Attention {
  tiles: Tiles; clients: ClientTiles[]; client: string; items: Item[]; counts: { sick: number; resting: number; watch: number }; notes: DNote[]; freshness: Freshness;
  engine: { healthLoop: { everyMin: number; live: boolean; from: string }; runs: EngineRun[] }; replacementsWaiting: number; hidden: { inactiveInboxes: number; noClientInboxes: number }; readAt: string;
}
interface InboxRow {
  id: string; email: string; domain: string; client: string; clientKey: string; status: Health; reasons: Reason[]; doing: string; score: number | null; scoreAt: string;
  warmup: number | null; warmupOn: boolean | null; connection: string; bounce: number | null; contacted: number; dailyLimit: number | null; previousLimit: number | null; stage: string; retestFriday: string; links: DLink[];
}
interface InboxGroup { domain: string; domainId: string; client: string; clientKey: string; status: Health; blacklist: string; renewal: string; inboxes: InboxRow[] }
interface InboxesView { groups: InboxGroup[]; totalGroups: number; total: number; clients: { key: string; name: string; count: number }[]; noClient: number; readAt: string }
interface PlacementDomain { domain: string; date: string; score: number | null; status: Health; inboxes: { email: string; score: number | null; google: number | null; outlook: number | null; at: string }[] }
interface PlacementView {
  freshness: Freshness; notes: DNote[]; clients: { key: string; name: string; newest: string; ageDays: number | null; stale: boolean; sick: number; domains: PlacementDomain[] }[];
  untested: { key: string; name: string; inboxes: number }[]; windowDays: number; limits: { rest: number; watch: number }; readAt: string;
}
interface DomainRow { id: string; name: string; status: Health; reasons: Reason[]; doing: string; inboxes: number; renewal: string; daysToRenewal: number | null; blacklist: string; blacklistCount: number; lastBlacklistCheck: string; provider: string; replacement: { status: string } | null; links: DLink[] }
interface DomainsView {
  clients: { key: string; name: string; domains: DomainRow[]; inboxes: number; notTwo: number }[];
  replacements: { id: string; title: string; client: string; status: string; action: string; reason: string; score: number | null; created: string; error: string; link: DLink }[];
  purchases: { id: string; request: string; status: string; domains: number | null; mailboxes: number | null; provider: string; approved: boolean; error: string; created: string; link: DLink }[];
  notes: DNote[]; rule: string; readAt: string;
}

type Tab = 'attention' | 'inboxes' | 'placement' | 'domains';
const TABS: { key: Tab; label: string; short: string }[] = [
  { key: 'attention', label: 'Needs attention', short: 'Attention' },
  { key: 'inboxes', label: 'All inboxes', short: 'Inboxes' },
  { key: 'placement', label: 'Placement tests', short: 'Placement' },
  { key: 'domains', label: 'Domains', short: 'Domains' },
];
const isTab = (t?: string): t is Tab => TABS.some((x) => x.key === t);
const STATUS: Record<Health, { label: string; tone: Tone; pill: 'bad' | 'warn' | 'info' | 'good' }> = {
  sick: { label: 'Sick', tone: 'bad', pill: 'bad' },
  resting: { label: 'Resting', tone: 'idle', pill: 'info' },
  watch: { label: 'Watch', tone: 'warn', pill: 'warn' },
  healthy: { label: 'Healthy', tone: 'good', pill: 'good' },
};
const md = (d: string) => (d ? d.slice(5, 10) : '');
const route = (tab: Tab, client = '', extra = '') => go(`deliverability/${tab}${client || extra ? `/${client || 'all'}` : ''}${extra ? `/${extra}` : ''}`);

/** #/deliverability[/<tab>[/<client key|all>[/<status>]]] */
export default function Deliverability({ tab, client, status }: { tab?: string; client?: string; status?: string }) {
  const t: Tab = isTab(tab) ? tab : 'attention';
  const c = client && client !== 'all' ? client : '';
  const [refresh, setRefresh] = useState(0);
  const [busy, setBusy] = useState(false);
  const quiet = useCallback(() => undefined, []);
  // The overall summary (cached on the server): client chips, the title line and the menu badge.
  const { d: all } = useView<Attention>('/deliverability', refresh, quiet);
  useEffect(() => { if (all) setCount('deliverability', all.tiles.sick); }, [all]);
  const clients = (all?.clients ?? []).map((x) => ({ key: x.key, name: x.name, n: x.tiles.sick }));
  const kicker = all ? `${all.tiles.sick} sick · ${all.tiles.resting} resting · ${all.tiles.total.toLocaleString('en-US')} inboxes` : 'Inboxes and domains';
  return (
    <div>
      <PageTitle title="Deliverability" kicker={kicker} sub="Only what's sick. Everything else is one tap deeper."
        right={<IconButton icon="refresh" label="Refresh" onClick={() => setRefresh((x) => x + 1)} className={cx('border border-line bg-surface', busy && '[&_svg]:animate-spin')} />} />
      <div role="tablist" aria-label="Deliverability tabs" className="-mx-4 flex gap-1 overflow-x-auto px-4 pb-1 sm:mx-0 sm:px-0 [scrollbar-width:none]">
        {TABS.map((x) => {
          const on = x.key === t;
          return (
            <button key={x.key} role="tab" aria-selected={on} onClick={() => route(x.key, c)}
              className={cx('flex min-h-11 shrink-0 items-center rounded-xl px-3.5 text-sm font-semibold transition', on ? 'bg-ink text-ink-fg shadow-card' : 'text-muted hover:bg-hover hover:text-fg')}>
              <span className="sm:hidden">{x.short}</span><span className="hidden sm:inline">{x.label}</span>
            </button>
          );
        })}
      </div>
      {clients.length > 1 && (
        <div aria-label="Filter by client" className="-mx-4 mt-3 flex gap-1.5 overflow-x-auto px-4 sm:mx-0 sm:flex-wrap sm:px-0 [scrollbar-width:none]">
          <Chip on={!c} onClick={() => route(t, '', t === 'inboxes' ? status ?? '' : '')}>All clients</Chip>
          {clients.map((x) => <Chip key={x.key} on={c === x.key} onClick={() => route(t, c === x.key ? '' : x.key, t === 'inboxes' ? status ?? '' : '')}>{x.name}{x.n > 0 && <span className="tabular rounded-full bg-bad-soft px-1.5 text-xs text-bad">{x.n}</span>}</Chip>)}
        </div>
      )}
      <div className="mt-4">
        {t === 'attention' && <AttentionTab client={c} refresh={refresh} setBusy={setBusy} />}
        {t === 'inboxes' && <InboxesTab client={c} status={status} refresh={refresh} setBusy={setBusy} />}
        {t === 'placement' && <PlacementTab client={c} refresh={refresh} setBusy={setBusy} />}
        {t === 'domains' && <DomainsTab client={c} refresh={refresh} setBusy={setBusy} />}
      </div>
    </div>
  );
}

/** Load one view. A press on Refresh re-reads (the server keeps Airtable for 60 seconds). */
function useView<T>(path: string, refresh: number, setBusy: (b: boolean) => void) {
  const [d, setD] = useState<T | null>(null);
  const [error, setError] = useState('');
  const seen = useRef(refresh);
  const load = useCallback(() => {
    setError(''); setBusy(true);
    const again = refresh !== seen.current;
    seen.current = refresh;
    api<T>(`${path}${again ? `${path.includes('?') ? '&' : '?'}refresh=1` : ''}`).then(setD).catch((e) => setError(e.message)).finally(() => setBusy(false));
  }, [path, refresh, setBusy]);
  useEffect(() => load(), [load]);
  return { d, error, load };
}

/* ---------- Needs attention ---------- */
function AttentionTab({ client, refresh, setBusy }: { client: string; refresh: number; setBusy: (b: boolean) => void }) {
  const { d, error, load } = useView<Attention>(`/deliverability${client ? `?client=${encodeURIComponent(client)}` : ''}`, refresh, setBusy);
  const [showWatch, setShowWatch] = useState(false);
  if (error && !d) return <ErrorBox error={error} retry={load} />;
  if (!d) return <PageSkeleton kind="list" />;
  const main = d.items.filter((i) => i.status !== 'watch');
  const watch = d.items.filter((i) => i.status === 'watch');
  return (
    <div className="space-y-4">
      {error && <ErrorBox error={error} retry={load} />}
      <TileRow tiles={d.tiles} client={client} />
      {!client && d.clients.length > 1 && <ClientCounts clients={d.clients} />}
      <NoteList notes={d.notes} />
      <Card className="overflow-hidden p-0">
        {main.length ? <ul className="divide-y divide-line">{main.map((i) => <ItemRow key={i.key} i={i} showClient={!client} />)}</ul>
          : <Empty icon="check" tone="good" title="Nothing sick" sub={watch.length ? `${watch.length} to watch below.` : 'Every inbox and domain looks fine.'} />}
      </Card>
      {watch.length > 0 && (
        <div>
          <button onClick={() => setShowWatch((x) => !x)} aria-expanded={showWatch} className="flex min-h-11 w-full items-center gap-2 rounded-xl px-1 text-sm font-semibold text-fg-2 hover:text-fg">
            <Icon name={showWatch ? 'chevronDown' : 'chevronRight'} size={16} />Watch <span className="tabular rounded-full bg-warn-soft px-2 text-xs text-warn">{watch.length}</span>
          </button>
          {showWatch && <Card className="mt-2 overflow-hidden p-0"><ul className="divide-y divide-line">{watch.map((i) => <ItemRow key={i.key} i={i} showClient={!client} />)}</ul></Card>}
        </div>
      )}
      <EngineLine d={d} />
    </div>
  );
}

function TileRow({ tiles, client }: { tiles: Tiles; client: string }) {
  const t: { k: Health; n: number }[] = [{ k: 'healthy', n: tiles.healthy }, { k: 'watch', n: tiles.watch }, { k: 'sick', n: tiles.sick }, { k: 'resting', n: tiles.resting }];
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 sm:gap-3">
      {t.map(({ k, n }) => (
        <button key={k} onClick={() => route('inboxes', client, k)} aria-label={`${n} ${STATUS[k].label.toLowerCase()} inboxes: show them`}
          className={cx('min-w-0 rounded-2xl border bg-surface p-4 text-left shadow-card transition hover:border-line-strong hover:shadow-pop', k === 'sick' && n ? 'border-bad-line' : 'border-line')}>
          <div className="flex items-center gap-2 text-sm font-medium text-fg-2"><StatusDot tone={STATUS[k].tone} />{STATUS[k].label}</div>
          <div className={cx('tabular mt-1 text-3xl font-bold leading-none tracking-tight', k === 'sick' && n ? 'text-bad' : k === 'watch' && n ? 'text-warn' : 'text-fg')}>{n.toLocaleString('en-US')}</div>
          <div className="mt-1.5 text-xs text-muted">of {tiles.total.toLocaleString('en-US')} inboxes</div>
        </button>
      ))}
    </div>
  );
}

function ClientCounts({ clients }: { clients: ClientTiles[] }) {
  return (
    <Card className="p-0">
      <div className="flex items-center justify-between border-b border-line px-4 py-2.5 text-xs font-semibold uppercase tracking-[0.08em] text-muted sm:px-5">
        <span>Per client</span><span className="flex gap-1 sm:gap-4" aria-hidden="true"><span className="w-11 text-right sm:w-12">Sick</span><span className="w-11 text-right sm:w-12">Rest</span><span className="w-11 text-right sm:w-12">Watch</span><span className="w-11 text-right sm:w-12">OK</span></span>
      </div>
      <ul className="divide-y divide-line">
        {clients.map((c) => (
          <li key={c.key}>
            <button onClick={() => route('attention', c.key)} className="flex min-h-11 w-full items-center justify-between gap-3 px-4 py-2 text-left text-sm hover:bg-hover sm:px-5"
              aria-label={`${c.name}: ${c.tiles.sick} sick, ${c.tiles.resting} resting, ${c.tiles.watch} watch, ${c.tiles.healthy} healthy`}>
              <span className="min-w-0 truncate font-medium text-fg">{c.name}</span>
              <span className="tabular flex shrink-0 gap-1 sm:gap-4">
                <span className={cx('w-11 text-right font-semibold sm:w-12', c.tiles.sick ? 'text-bad' : 'text-faint')}>{c.tiles.sick}</span>
                <span className={cx('w-11 text-right sm:w-12', c.tiles.resting ? 'text-info' : 'text-faint')}>{c.tiles.resting}</span>
                <span className={cx('w-11 text-right sm:w-12', c.tiles.watch ? 'text-warn' : 'text-faint')}>{c.tiles.watch}</span>
                <span className="w-11 text-right text-fg-2 sm:w-12">{c.tiles.healthy}</span>
              </span>
            </button>
          </li>
        ))}
      </ul>
    </Card>
  );
}

function ItemRow({ i, showClient }: { i: Item; showClient: boolean }) {
  const st = STATUS[i.status];
  return (
    <li className="px-4 py-3.5 sm:px-5">
      <div className="flex items-start gap-3">
        <StatusDot tone={st.tone} className="mt-2" label={st.label} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="min-w-0 break-all text-[15px] font-semibold text-fg">{i.title}</span>
            {i.kind === 'domain' && <Pill>domain · {i.inboxes ?? 0} inbox{i.inboxes === 1 ? '' : 'es'}</Pill>}
            {showClient && <Pill>{i.client}</Pill>}
          </div>
          <div className="mt-1 text-sm font-medium leading-snug text-fg-2">{i.reason}</div>
          {i.doing && <div className="mt-1 flex gap-1.5 text-sm leading-snug text-muted"><Icon name="activity" size={14} className="mt-0.5" /><span><span className="sr-only">Engine: </span>{i.doing}</span></div>}
          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-2">
            <span className="inline-flex items-center gap-1.5 text-xs font-medium text-fg-2"><Avatar name={i.owner} size="xs" />{i.owner}</span>
            {i.links.map((l) => <LinkButton key={l.href} l={l} />)}
          </div>
        </div>
      </div>
    </li>
  );
}

function LinkButton({ l }: { l: DLink }) {
  const cls = 'inline-flex min-h-9 items-center gap-1.5 rounded-lg px-3 text-sm font-semibold transition';
  if (/^https:\/\//.test(l.href)) return <a href={l.href} target="_blank" rel="noopener noreferrer" className={cx(cls, 'border border-line-strong bg-surface text-fg hover:bg-hover')}>{l.label}<Icon name="external" size={14} /></a>;
  return <button onClick={() => go(l.href)} className={cx(cls, 'bg-accent text-accent-fg hover:bg-accent-hover')}>{l.label}<Icon name="arrowRight" size={14} /></button>;
}

/** Problem → Data → Fix → Why, with who owns it. */
function NoteList({ notes }: { notes: DNote[] }) {
  if (!notes.length) return null;
  return (
    <ul className="space-y-2">
      {notes.map((n) => (
        <li key={n.problem} className={cx('flex gap-3 rounded-xl border px-4 py-3 text-sm leading-snug', n.level === 'bad' ? 'border-bad-line bg-bad-soft' : n.level === 'warn' ? 'border-warn/25 bg-warn-soft' : 'border-line bg-sunken')}>
          <Icon name="alert" size={16} className={cx('mt-0.5', n.level === 'bad' ? 'text-bad' : n.level === 'warn' ? 'text-warn' : 'text-muted')} />
          <div className="min-w-0 flex-1 space-y-1">
            <div className="font-semibold text-fg">{n.problem}</div>
            <NoteLine k="Data" v={n.data} />
            <NoteLine k="Fix" v={n.fix} />
            <NoteLine k="Why" v={n.why} />
            <div className="flex items-center gap-1.5 pt-0.5 text-xs font-medium text-fg-2"><Avatar name={n.owner} size="xs" />{n.owner}</div>
          </div>
        </li>
      ))}
    </ul>
  );
}
const NoteLine = ({ k, v }: { k: string; v: string }) => (v ? <div className="text-fg-2"><span className="font-semibold text-muted">{k}: </span>{v}</div> : null);

function EngineLine({ d }: { d: Attention }) {
  const h = d.engine.healthLoop;
  const run = d.engine.runs.find((r) => r.kind === 'account.health');
  const bounce = d.engine.runs.find((r) => r.kind === 'bounce.check');
  return (
    <div className="space-y-1 text-xs text-muted">
      <p>
        Health loop: {h.everyMin ? `every ${h.everyMin} min${h.live ? '' : ', dry run'}` : 'off'}
        {run ? ` · last run ${timeAgo(run.at)} (${run.status})${run.message ? `: ${run.message}` : ''}` : ' · no run yet'}.
        {bounce ? ` Bounce check ${timeAgo(bounce.at)}.` : ''}
      </p>
      <p>From Airtable (Email Accounts, Domains, Inbox Placement Testing, Spam Remediation Queue), read {timeAgo(d.readAt) || 'just now'}; kept 1 minute.{d.hidden.inactiveInboxes ? ` ${d.hidden.inactiveInboxes} inboxes of inactive clients not shown.` : ''}</p>
    </div>
  );
}

/* ---------- All inboxes ---------- */
const FILTERS: (Health | '')[] = ['', 'sick', 'resting', 'watch', 'healthy'];
function InboxesTab({ client, status, refresh, setBusy }: { client: string; status?: string; refresh: number; setBusy: (b: boolean) => void }) {
  const st = FILTERS.includes(status as Health) ? (status as Health | '') : '';
  const [q, setQ] = useState('');
  const [search, setSearch] = useState('');
  useEffect(() => { const h = setTimeout(() => setSearch(q.trim()), 300); return () => clearTimeout(h); }, [q]);
  const qs = new URLSearchParams({ ...(client ? { client } : {}), ...(st ? { status: st } : {}), ...(search ? { q: search } : {}) }).toString();
  const { d, error, load } = useView<InboxesView>(`/deliverability/inboxes${qs ? `?${qs}` : ''}`, refresh, setBusy);
  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <label className="relative min-w-0 flex-1 sm:max-w-sm">
          <span className="sr-only">Search inboxes</span>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search inbox, domain or client" maxLength={100}
            className="min-h-11 w-full rounded-xl border border-line bg-surface px-3.5 text-[15px] text-fg outline-none placeholder:text-faint focus:border-accent focus:ring-4 focus:ring-accent-soft" />
        </label>
        <div aria-label="Filter by status" className="-mx-4 flex gap-1.5 overflow-x-auto px-4 sm:mx-0 sm:px-0 [scrollbar-width:none]">
          {FILTERS.map((f) => <Chip key={f || 'all'} on={st === f} onClick={() => route('inboxes', client, f)}>{f ? STATUS[f].label : 'All'}</Chip>)}
        </div>
      </div>
      {error && <ErrorBox error={error} retry={load} />}
      {!d && !error && <PageSkeleton kind="list" />}
      {d && (
        <>
          <div className="text-sm text-muted"><span className="tabular font-semibold text-fg-2">{d.total.toLocaleString('en-US')}</span> inbox{d.total === 1 ? '' : 'es'} on <span className="tabular font-semibold text-fg-2">{d.totalGroups.toLocaleString('en-US')}</span> domain{d.totalGroups === 1 ? '' : 's'}{d.totalGroups > d.groups.length ? ` (first ${d.groups.length} shown: search to narrow)` : ''}</div>
          {!d.groups.length && <Card><Empty icon="inbox" title="No inboxes" sub={search ? `Nothing matches "${search}".` : 'No inboxes with this filter.'} /></Card>}
          <div className="grid gap-3 lg:grid-cols-2">
            {d.groups.map((g) => <DomainGroup key={`${g.clientKey}:${g.domain}`} g={g} showClient={!client} />)}
          </div>
          {d.noClient > 0 && !client && <p className="text-xs text-muted">{d.noClient} inbox{d.noClient === 1 ? ' has' : 'es have'} no client in Airtable: <button className="font-semibold underline underline-offset-2" onClick={() => route('inboxes', 'none')}>show them</button>.</p>}
          <p className="text-xs text-muted">From Airtable, read {timeAgo(d.readAt) || 'just now'}; kept 1 minute.</p>
        </>
      )}
    </div>
  );
}

function DomainGroup({ g, showClient }: { g: InboxGroup; showClient: boolean }) {
  return (
    <Card className="min-w-0 overflow-hidden p-0">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 border-b border-line bg-sunken/60 px-4 py-2.5 sm:px-5">
        <StatusDot tone={STATUS[g.status].tone} label={STATUS[g.status].label} />
        <span className="min-w-0 break-all font-semibold text-fg">{g.domain}</span>
        {showClient && <Pill>{g.client}</Pill>}
        {g.blacklist === 'Listed' && <Pill tone="bad">Blacklisted</Pill>}
        {g.renewal && <span className="ml-auto text-xs text-muted">renews {md(g.renewal)}</span>}
      </div>
      <ul className="divide-y divide-line">
        {g.inboxes.map((i) => (
          <li key={i.id} className="px-4 py-3 sm:px-5">
            <div className="flex items-start gap-2.5">
              <StatusDot tone={STATUS[i.status].tone} className="mt-1.5" label={STATUS[i.status].label} />
              <div className="min-w-0 flex-1">
                <div className="flex items-start justify-between gap-2">
                  <span className="min-w-0 break-all text-sm font-semibold text-fg">{i.email}</span>
                  {i.links.filter((l) => /^https:/.test(l.href)).map((l) => <a key={l.href} href={l.href} target="_blank" rel="noopener noreferrer" aria-label={`${i.email} in Airtable`} title="Open in Airtable" className="-my-1 inline-grid h-8 w-8 shrink-0 place-items-center rounded-lg text-muted hover:bg-hover hover:text-fg"><Icon name="external" size={15} /></a>)}
                </div>
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  <Metric label="Placement" v={i.score === null ? '—' : `${i.score}%`} tone={i.score === null ? undefined : i.score < 60 ? 'bad' : i.score < 75 ? 'warn' : undefined} />
                  <Metric label="Warm-up" v={i.warmupOn === false ? 'off' : i.warmup === null ? '—' : String(i.warmup)} tone={i.warmupOn === false ? 'warn' : i.warmup === null ? undefined : i.warmup < 50 ? 'bad' : i.warmup < 70 ? 'warn' : undefined} />
                  <Metric label="Bounce" v={i.bounce === null ? '—' : `${i.bounce}%`} tone={i.bounce === null ? undefined : i.bounce > 4 ? 'bad' : i.bounce > 2.5 ? 'warn' : undefined} />
                  <Metric label="Limit" v={i.dailyLimit === null ? '—' : `${i.dailyLimit}/day`} />
                  {i.connection && i.connection.toLowerCase() !== 'connected' && <Pill tone="bad">{i.connection}</Pill>}
                </div>
                {i.reasons.length > 0 && <div className="mt-1.5 text-sm leading-snug text-fg-2">{i.reasons.map((r) => r.text).join(' · ')}</div>}
                {i.doing && i.status !== 'healthy' && <div className="mt-1 text-xs leading-snug text-muted">{i.doing}</div>}
              </div>
            </div>
          </li>
        ))}
      </ul>
    </Card>
  );
}

function Metric({ label, v, tone }: { label: string; v: string; tone?: 'bad' | 'warn' }) {
  return <span className={cx('inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs', tone === 'bad' ? 'bg-bad-soft text-bad' : tone === 'warn' ? 'bg-warn-soft text-warn' : 'bg-sunken text-fg-2')}><span className="text-muted">{label}</span><span className="tabular font-semibold">{v}</span></span>;
}

/* ---------- Placement tests ---------- */
function PlacementTab({ client, refresh, setBusy }: { client: string; refresh: number; setBusy: (b: boolean) => void }) {
  const { d, error, load } = useView<PlacementView>(`/deliverability/placement${client ? `?client=${encodeURIComponent(client)}` : ''}`, refresh, setBusy);
  if (error && !d) return <ErrorBox error={error} retry={load} />;
  if (!d) return <PageSkeleton kind="list" />;
  const f = d.freshness;
  const bad = f.stale || f.fridayMissing;
  return (
    <div className="space-y-4">
      <Card className={cx('flex flex-wrap items-center gap-x-6 gap-y-3', bad && 'border-bad-line')}>
        <Fact label="Newest scores" v={f.newest ? md(f.newest) : 'none'} sub={f.ageDays === null ? 'no tests found' : `${f.ageDays} day${f.ageDays === 1 ? '' : 's'} ago`} bad={f.stale} />
        <Fact label="Next Friday test" v={md(f.nextFriday)} sub={f.fridayMissing ? `Fri ${md(f.expectedFriday)} scores missing` : `Fri ${md(f.expectedFriday)} scores are in`} bad={f.fridayMissing} />
        <Fact label="Tests read" v={f.tests.toLocaleString('en-US')} sub={`last ${d.windowDays} days`} />
        <div className="text-xs text-muted sm:ml-auto">Under {d.limits.rest}% = rested 7 days · under {d.limits.watch}% = watch</div>
      </Card>
      <NoteList notes={d.notes} />
      {!d.clients.length && <Card><Empty icon="activity" title="No placement tests" sub={`None in the last ${d.windowDays} days for ${client ? 'this client' : 'active clients'}.`} /></Card>}
      <div className="grid gap-3 lg:grid-cols-2">
        {d.clients.map((c) => (
          <Card key={c.key} className="min-w-0 overflow-hidden p-0">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 border-b border-line px-4 py-3 sm:px-5">
              <span className="font-semibold text-fg">{c.name}</span>
              <span className="text-sm text-muted">newest {md(c.newest)}</span>
              {c.stale && <Pill tone="bad">over 7 days old</Pill>}
              {c.sick > 0 && <Pill tone="bad" className="ml-auto">{c.sick} under {d.limits.rest}%</Pill>}
            </div>
            <ul className="divide-y divide-line">
              {c.domains.map((x) => <PlacementRow key={x.domain} x={x} />)}
            </ul>
          </Card>
        ))}
      </div>
      {d.untested.length > 0 && <p className="text-sm text-muted">No test in {d.windowDays} days: {d.untested.map((u) => `${u.name} (${u.inboxes} inboxes)`).join(', ')}.</p>}
      <p className="text-xs text-muted">From Airtable (Inbox Placement Testing), read {timeAgo(d.readAt) || 'just now'}; tests are kept 10 minutes (they come in on Fridays). The score per domain is its worst inbox.</p>
    </div>
  );
}

function PlacementRow({ x }: { x: PlacementDomain }) {
  const [open, setOpen] = useState(false);
  return (
    <li>
      <button onClick={() => setOpen((o) => !o)} aria-expanded={open} className="flex min-h-12 w-full items-center gap-3 px-4 py-2.5 text-left hover:bg-hover sm:px-5">
        <StatusDot tone={STATUS[x.status].tone} label={STATUS[x.status].label} />
        <span className="min-w-0 flex-1 break-all text-sm font-medium text-fg">{x.domain}</span>
        <span className={cx('tabular w-12 shrink-0 text-right text-sm font-bold', x.status === 'sick' ? 'text-bad' : x.status === 'watch' ? 'text-warn' : 'text-fg')}>{x.score === null ? '—' : `${x.score}%`}</span>
        <span className="tabular w-11 shrink-0 text-right text-xs text-muted">{md(x.date)}</span>
        <Icon name={open ? 'chevronDown' : 'chevronRight'} size={16} className="text-faint" />
      </button>
      {open && (
        <ul className="space-y-1 bg-sunken/60 px-4 py-2 sm:px-5">
          {x.inboxes.map((i) => (
            <li key={i.email} className="flex flex-wrap items-center justify-between gap-x-3 text-xs">
              <span className="min-w-0 break-all text-fg-2">{i.email}</span>
              <span className="tabular text-muted">{i.score ?? '—'}%{i.google !== null ? ` · Google ${i.google}%` : ''}{i.outlook !== null ? ` · Outlook ${i.outlook}%` : ''}</span>
            </li>
          ))}
        </ul>
      )}
    </li>
  );
}

function Fact({ label, v, sub, bad }: { label: string; v: string; sub: string; bad?: boolean }) {
  return (
    <div className="min-w-0">
      <div className="text-xs font-medium text-muted">{label}</div>
      <div className={cx('tabular text-xl font-bold leading-tight', bad ? 'text-bad' : 'text-fg')}>{v}</div>
      <div className={cx('text-xs', bad ? 'font-medium text-bad' : 'text-muted')}>{sub}</div>
    </div>
  );
}

/* ---------- Domains ---------- */
function DomainsTab({ client, refresh, setBusy }: { client: string; refresh: number; setBusy: (b: boolean) => void }) {
  const { d, error, load } = useView<DomainsView>(`/deliverability/domains${client ? `?client=${encodeURIComponent(client)}` : ''}`, refresh, setBusy);
  if (error && !d) return <ErrorBox error={error} retry={load} />;
  if (!d) return <PageSkeleton kind="list" />;
  const waiting = d.replacements.filter((r) => r.status === 'Pending Review');
  return (
    <div className="space-y-4">
      <NoteList notes={d.notes} />
      {d.replacements.length > 0 && (
        <Card className={cx('p-0', waiting.length > 0 && 'border-warn/40')}>
          <SubHead icon="layers" title="Replacements" right={waiting.length ? <Pill tone="warn">{waiting.length} waiting for you</Pill> : undefined} />
          <ul className="divide-y divide-line">
            {d.replacements.map((r) => (
              <li key={r.id} className="flex flex-wrap items-start gap-x-3 gap-y-2 px-4 py-3 sm:px-5">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2"><span className="break-all text-sm font-semibold text-fg">{r.title}</span>{r.client && <Pill>{r.client}</Pill>}<Pill tone={r.status === 'Pending Review' ? 'warn' : 'info'}>{r.status === 'Pending Review' ? 'Waiting for your OK' : r.status}</Pill></div>
                  <div className="mt-1 text-sm leading-snug text-fg-2">{r.action}{r.score !== null ? ` · retest ${r.score}%` : ''}{r.created ? ` · ${md(r.created.slice(0, 10))}` : ''}</div>
                  {r.error && <div className="mt-1 text-xs text-bad">{r.error}</div>}
                </div>
                <LinkButton l={r.link} />
              </li>
            ))}
          </ul>
        </Card>
      )}
      {d.purchases.length > 0 && (
        <Card className="p-0">
          <SubHead icon="briefcase" title="Buying" right={<span className="text-xs text-muted">open requests</span>} />
          <ul className="divide-y divide-line">
            {d.purchases.map((p) => (
              <li key={p.id} className="flex flex-wrap items-start gap-x-3 gap-y-2 px-4 py-3 sm:px-5">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2"><span className="text-sm font-semibold text-fg">{p.request}</span><Pill tone={/approval/i.test(p.status) ? 'warn' : 'plain'}>{p.status}</Pill></div>
                  <div className="mt-1 text-sm text-fg-2">{[p.domains !== null ? `${p.domains} domain${p.domains === 1 ? '' : 's'}` : '', p.mailboxes !== null ? `${p.mailboxes} inboxes` : '', p.provider].filter(Boolean).join(' · ') || 'No details yet'}</div>
                  {p.error && <div className="mt-1 text-xs text-bad">{p.error}</div>}
                </div>
                <LinkButton l={p.link} />
              </li>
            ))}
          </ul>
        </Card>
      )}
      {!d.clients.length && <Card><Empty icon="layers" title="No domains" sub="No domains for active clients in Airtable." /></Card>}
      {d.clients.map((c) => (
        <Card key={c.key} className="min-w-0 overflow-hidden p-0">
          <SubHead title={c.name} right={<span className="text-xs text-muted"><span className="tabular font-semibold text-fg-2">{c.domains.length}</span> domains · <span className="tabular font-semibold text-fg-2">{c.inboxes}</span> inboxes{c.notTwo ? <span className="text-warn"> · {c.notTwo} not 2</span> : ''}</span>} />
          <ul className="divide-y divide-line">
            {c.domains.map((x) => (
              <li key={x.id || x.name} className="px-4 py-3 sm:px-5">
                <div className="flex items-start gap-2.5">
                  <StatusDot tone={STATUS[x.status].tone} className="mt-1.5" label={STATUS[x.status].label} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-2">
                      <span className="min-w-0 break-all text-sm font-semibold text-fg">{x.name}</span>
                      {x.links.filter((l) => /^https:/.test(l.href)).map((l) => <ExtLink key={l.href} href={l.href} className="shrink-0 text-xs">Airtable</ExtLink>)}
                    </div>
                    <div className="mt-1.5 flex flex-wrap gap-1.5">
                      <Metric label="Inboxes" v={String(x.inboxes)} tone={x.id && x.inboxes !== 2 ? 'warn' : undefined} />
                      <Metric label="Expires" v={x.renewal ? (x.daysToRenewal !== null && x.daysToRenewal <= 60 ? `${md(x.renewal)} (${x.daysToRenewal} d)` : x.renewal) : 'UNKNOWN'} tone={x.daysToRenewal !== null && x.daysToRenewal < 0 ? 'bad' : x.daysToRenewal !== null && x.daysToRenewal <= 30 ? 'warn' : undefined} />
                      <Metric label="Blacklist" v={x.blacklist === 'Listed' ? `listed${x.blacklistCount ? ` (${x.blacklistCount})` : ''}` : x.blacklist ? x.blacklist.toLowerCase() : '—'} tone={x.blacklist === 'Listed' ? 'bad' : x.blacklist === 'Check Failed' ? 'warn' : undefined} />
                      {x.replacement && <Pill tone="warn">Replacement {x.replacement.status === 'Pending Review' ? 'waiting' : x.replacement.status.toLowerCase()}</Pill>}
                    </div>
                    {x.reasons.length > 0 && <div className="mt-1.5 text-sm leading-snug text-fg-2">{x.reasons.map((r) => r.text).join(' · ')}</div>}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </Card>
      ))}
      <p className="text-xs text-muted">{d.rule} From Airtable (Domains, Spam Remediation Queue, Domain Purchase Requests), read {timeAgo(d.readAt) || 'just now'}; kept 1 minute. HQ buys nothing: buying stays a ✅ in Decisions.</p>
    </div>
  );
}

function SubHead({ title, icon, right }: { title: string; icon?: string; right?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-4 py-3 sm:px-5">
      <h2 className="flex items-center gap-2 font-semibold text-fg">{icon && <Icon name={icon} size={16} className="text-muted" />}{title}</h2>
      {right}
    </div>
  );
}

function Chip({ on, onClick, children }: { on: boolean; onClick: () => void; children: ReactNode }) {
  return <button onClick={onClick} aria-pressed={on} className={cx('inline-flex min-h-9 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border px-3 text-sm font-medium transition', on ? 'border-accent bg-accent-soft text-accent-ink' : 'border-line bg-surface text-fg-2 hover:bg-hover')}>{children}</button>;
}

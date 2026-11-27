// Deliverability: inboxes and domains in one place (replaces the Airtable Spam Center, Email Account
// Center, Domain & Inbox Inventory, Email Accounts / Warm Up, Inbox Placement Tests and Buy Domains &
// Inboxes screens). Batch 3 (Alex, 2026-11-27): statuses Healthy / At risk / Spam / Resting; warm-up
// OFF first in red; the shared active-client dropdown; dropdown filters; inbox limits editable from
// HQ (owner); the new-client ramp; Fix it on agent notes; email bounce analytics and verification
// performance; no Airtable links. Text is rendered escaped.
// Round 2/3 (Alex, 2026-11-27): warm-up off by reason (resting = expected; only unexpected is red),
// bulk limit edits (tick inboxes / all shown → preview → one job), SMTP codes, placement bands per
// test date ("Last test 11/27 · Next test Fri 12/4"), slash dates, renewal gap (Atlas task), monthly
// inbox cost (owner) and Buy (Draft → quote → your OK).
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { api, type ClientCostR2, type PurchaseR2, type RenewalGapR2, type TestRunR2, type WarmupSummaryR2, type WarmupWhyR2 } from '../api';
import { Avatar, Button, Card, cx, Empty, ErrorBox, go, Icon, IconButton, PageSkeleton, PageTitle, Pill, setCount, StatusDot, timeAgo, type Tone } from '../ui';
import { ClientPicker, rememberedClient } from '../clientPicker';
import { FixItButton } from '../fixIt';
import { Select } from '../charts';
import { BouncesTab, LimitEditor, LimitHistory, RampCard, useLimits, VerificationTab } from './DeliverabilityMore';
import { BuyPanel, CostLine, CostTotal, PlacementRuns, RenewalCard, sd, WarmupLine } from './DeliverabilityR2';
import { BulkLimits, type BulkScope } from './DeliverabilityBulk';

/* ---------- API shapes (engine/src/hq/deliverability.ts) ---------- */
type Health = 'healthy' | 'risk' | 'spam' | 'resting';
interface Reason { code: string; level: 'spam' | 'risk'; text: string; owner: string; fromDomain?: boolean }
interface DLink { label: string; href: string }
interface DNote { level: 'bad' | 'warn' | 'info'; problem: string; data: string; fix: string; why: string; owner: string }
interface Tiles { healthy: number; risk: number; spam: number; resting: number; total: number }
interface ClientTiles { key: string; name: string; tiles: Tiles; domains: number }
interface Item { key: string; kind: 'inbox' | 'domain'; status: Health; title: string; client: string; clientKey: string; reason: string; owner: string; doing: string; links: DLink[]; inboxes?: number; redFlag: boolean }
interface Freshness { newest: string; ageDays: number | null; stale: boolean; expectedFriday: string; fridayMissing: boolean; nextFriday: string; tests: number; lastTest: string; nextTest: string }
interface EngineRun { kind: string; status: string; at: string; message: string; dryRun: boolean }
interface Attention {
  tiles: Tiles; clients: ClientTiles[]; client: string; items: Item[]; counts: { spam: number; resting: number; risk: number; warmupOff: number }; notes: DNote[]; freshness: Freshness;
  engine: { healthLoop: { everyMin: number; live: boolean; from: string }; runs: EngineRun[] }; replacementsWaiting: number; hidden: { inactiveInboxes: number; noClientInboxes: number; emptyDomains: number }; readAt: string;
  warmup: WarmupSummaryR2; renewalGap: RenewalGapR2;
}
interface InboxRow {
  id: string; email: string; domain: string; client: string; clientKey: string; status: Health; reasons: Reason[]; doing: string; score: number | null; scoreAt: string;
  warmup: number | null; warmupOn: boolean | null; warmupOff: boolean; warmupWhy: WarmupWhyR2 | null; warmupLimit: number | null; connection: string; bounce: number | null; contacted: number; dailyLimit: number | null; previousLimit: number | null; stage: string; retestFriday: string; links: DLink[];
}
interface InboxGroup { domain: string; domainId: string; client: string; clientKey: string; status: Health; blacklist: string; renewal: string; inboxes: InboxRow[] }
interface InboxesView { groups: InboxGroup[]; totalGroups: number; total: number; clients: { key: string; name: string; count: number }[]; noClient: number; readAt: string }
interface PlacementDomain { domain: string; date: string; score: number | null; status: Health; inboxes: { email: string; score: number | null; google: number | null; outlook: number | null; at: string }[] }
interface PlacementView {
  freshness: Freshness; notes: DNote[]; clients: { key: string; name: string; newest: string; ageDays: number | null; stale: boolean; spam: number; domains: PlacementDomain[] }[];
  untested: { key: string; name: string; inboxes: number }[]; windowDays: number; limits: { rest: number; watch: number }; readAt: string;
  runs: TestRunR2[]; bands: string[];
}
interface DomainRow { renewalSource?: string; id: string; name: string; status: Health; reasons: Reason[]; doing: string; inboxes: number; renewal: string; renewalEstimated: boolean; daysToRenewal: number | null; blacklist: string; blacklistText: string; blacklistWhy: string; provider: string; replacement: { status: string } | null; links: DLink[] }
interface DomainsView {
  clients: { key: string; name: string; domains: DomainRow[]; inboxes: number; notTwo: number }[];
  replacements: { id: string; title: string; client: string; status: string; action: string; reason: string; score: number | null; created: string; error: string; link: DLink | null }[];
  purchases: PurchaseR2[];
  notes: DNote[]; rule: string; readAt: string;
  costs: ClientCostR2[] | null; costRule: string; renewalGap: RenewalGapR2; cheap: { connected: boolean; error: string; readAt: string };
  renewalTask: { status: string; title: string; updated: string; note: string } | null;
}

type Tab = 'attention' | 'inboxes' | 'placement' | 'domains' | 'bounces' | 'verification';
const TABS: { key: Tab; label: string; short: string }[] = [
  { key: 'attention', label: 'Needs attention', short: 'Attention' },
  { key: 'inboxes', label: 'All inboxes', short: 'Inboxes' },
  { key: 'bounces', label: 'Bounces', short: 'Bounces' },
  { key: 'verification', label: 'Verification', short: 'Verify' },
  { key: 'placement', label: 'Placement tests', short: 'Placement' },
  { key: 'domains', label: 'Domains', short: 'Domains' },
];
const isTab = (t?: string): t is Tab => TABS.some((x) => x.key === t);
const STATUS: Record<Health, { label: string; tone: Tone; pill: 'bad' | 'warn' | 'info' | 'good' }> = {
  spam: { label: 'Spam', tone: 'bad', pill: 'bad' },
  resting: { label: 'Resting', tone: 'idle', pill: 'info' },
  risk: { label: 'At risk', tone: 'warn', pill: 'warn' },
  healthy: { label: 'Healthy', tone: 'good', pill: 'good' },
};
const LEGACY: Record<string, Health> = { sick: 'spam', watch: 'risk' };
/** Dates use slashes (Round 2 rule): 11/27. */
const md = sd;
const longDate = (d: string) => (d ? new Date(`${d.slice(0, 10)}T12:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : '');
const route = (tab: Tab, client = '', extra = '') => go(`deliverability/${tab}${client || extra ? `/${client || 'all'}` : ''}${extra ? `/${extra}` : ''}`);

/** #/deliverability[/<tab>[/<client key|all>[/<status>]]] */
export default function Deliverability({ tab, client, status }: { tab?: string; client?: string; status?: string }) {
  const t: Tab = isTab(tab) ? tab : 'attention';
  const c = rememberedClient('deliverability', client && client !== 'all' ? client : undefined);
  const [refresh, setRefresh] = useState(0);
  const [busy, setBusy] = useState(false);
  const quiet = useCallback(() => undefined, []);
  // The overall summary (cached on the server): the client dropdown, the title line and the menu badge.
  const { d: all } = useView<Attention>('/deliverability', refresh, quiet);
  useEffect(() => { if (all) setCount('deliverability', all.tiles.spam + all.counts.warmupOff); }, [all]);
  const options = (all?.clients ?? []).map((x) => ({ key: x.key, name: x.name, count: x.tiles.total }));
  const kicker = all ? `${all.counts.warmupOff ? `${all.counts.warmupOff} warm-up off · ` : ''}${all.tiles.spam} spam · ${all.tiles.resting} resting · ${all.tiles.risk} at risk · ${all.tiles.total.toLocaleString('en-US')} inboxes` : 'Inboxes and domains';
  return (
    <div>
      <PageTitle title="Deliverability" kicker={kicker} sub="What needs attention first. Everything else is one tap deeper."
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
      <div className="mt-3"><ClientPicker screen="deliverability" value={c} options={options} onChange={(k) => route(t, k, t === 'inboxes' ? status ?? '' : '')} /></div>
      <div className="mt-4">
        {t === 'attention' && <AttentionTab client={c} refresh={refresh} setBusy={setBusy} />}
        {t === 'inboxes' && <InboxesTab client={c} status={status} refresh={refresh} setBusy={setBusy} />}
        {t === 'bounces' && <BouncesTab client={c} refresh={refresh} />}
        {t === 'verification' && <VerificationTab client={c} refresh={refresh} />}
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
  const { limits, reload } = useLimits(client, refresh);
  const [showRisk, setShowRisk] = useState(false);
  if (error && !d) return <ErrorBox error={error} retry={load} />;
  if (!d) return <PageSkeleton kind="list" />;
  const off = d.items.filter((i) => i.redFlag);
  const main = d.items.filter((i) => !i.redFlag && i.status !== 'risk');
  const risk = d.items.filter((i) => !i.redFlag && i.status === 'risk');
  return (
    <div className="space-y-4">
      {error && <ErrorBox error={error} retry={load} />}
      <TileRow tiles={d.tiles} client={client} />
      {off.length > 0 ? (
        <Card className="overflow-hidden border-bad-line p-0">
          <div className="flex items-center gap-2 border-b border-bad-line bg-bad-soft px-4 py-2.5 sm:px-5"><Icon name="alert" size={16} className="text-bad" /><h2 className="font-semibold text-bad">Warm-up OFF for no known reason on {off.length} inbox{off.length === 1 ? '' : 'es'}</h2></div>
          <div className="px-4 pt-3 sm:px-5"><WarmupLine w={d.warmup} client={client} /></div>
          <ul className="divide-y divide-line">{off.map((i) => <ItemRow key={i.key} i={i} showClient={!client} />)}</ul>
        </Card>
      ) : <WarmupLine w={d.warmup} client={client} />}
      <AgentNotes notes={d.notes} />
      {d.renewalGap.missing > 0 && (
        <button onClick={() => route('domains', client)} className="flex min-h-11 w-full items-center gap-2 rounded-xl border border-line bg-surface px-4 text-left text-sm hover:bg-hover">
          <Icon name="calendar" size={15} className="text-warn" /><span className="min-w-0 flex-1"><span className="font-semibold text-fg">{d.renewalGap.missing.toLocaleString('en-US')} domains</span> <span className="text-fg-2">have no real renewal date: Atlas fills them.</span></span><Icon name="chevronRight" size={16} className="text-faint" />
        </button>
      )}
      {limits && <RampCard limits={limits} onApplied={reload} />}
      <Card className="overflow-hidden p-0">
        {main.length ? <ul className="divide-y divide-line">{main.map((i) => <ItemRow key={i.key} i={i} showClient={!client} />)}</ul>
          : <Empty icon="check" tone="good" title="No spam or resting inbox" sub={risk.length ? `${risk.length} at risk below.` : 'Every inbox and domain looks fine.'} />}
      </Card>
      {risk.length > 0 && (
        <div>
          <button onClick={() => setShowRisk((x) => !x)} aria-expanded={showRisk} className="flex min-h-11 w-full items-center gap-2 rounded-xl px-1 text-sm font-semibold text-fg-2 hover:text-fg">
            <Icon name={showRisk ? 'chevronDown' : 'chevronRight'} size={16} />At risk <span className="tabular rounded-full bg-warn-soft px-2 text-xs text-warn">{risk.length}</span>
          </button>
          {showRisk && <Card className="mt-2 overflow-hidden p-0"><ul className="divide-y divide-line">{risk.map((i) => <ItemRow key={i.key} i={i} showClient={!client} />)}</ul></Card>}
        </div>
      )}
      {!client && d.clients.length > 1 && <ClientCounts clients={d.clients} />}
      <EngineLine d={d} />
    </div>
  );
}

function TileRow({ tiles, client }: { tiles: Tiles; client: string }) {
  const t: { k: Health; n: number }[] = [{ k: 'healthy', n: tiles.healthy }, { k: 'risk', n: tiles.risk }, { k: 'spam', n: tiles.spam }, { k: 'resting', n: tiles.resting }];
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 sm:gap-3">
      {t.map(({ k, n }) => (
        <button key={k} onClick={() => route('inboxes', client, k)} aria-label={`${n} ${STATUS[k].label.toLowerCase()} inboxes: show them`}
          className={cx('min-w-0 rounded-2xl border bg-surface p-4 text-left shadow-card transition hover:border-line-strong hover:shadow-pop', k === 'spam' && n ? 'border-bad-line' : 'border-line')}>
          <div className="flex items-center gap-2 text-sm font-medium text-fg-2"><StatusDot tone={STATUS[k].tone} />{STATUS[k].label}</div>
          <div className={cx('tabular mt-1 text-3xl font-bold leading-none tracking-tight', k === 'spam' && n ? 'text-bad' : k === 'risk' && n ? 'text-warn' : 'text-fg')}>{n.toLocaleString('en-US')}</div>
          <div className="mt-1.5 text-xs text-muted">of {tiles.total.toLocaleString('en-US')} inboxes</div>
        </button>
      ))}
    </div>
  );
}

/** Inboxes per client by status (was an unexplained list under the attention block). */
function ClientCounts({ clients }: { clients: ClientTiles[] }) {
  return (
    <Card className="p-0">
      <div className="border-b border-line px-4 py-2.5 sm:px-5">
        <h2 className="text-sm font-semibold text-fg">Inboxes per client</h2>
        <p className="text-xs text-muted">How many of each client's inboxes are in each status. Tap a client to see only theirs.</p>
      </div>
      <div className="flex items-center justify-end gap-1 border-b border-line px-4 py-1.5 text-[11px] font-semibold uppercase tracking-[0.06em] text-muted sm:gap-4 sm:px-5" aria-hidden="true"><span className="w-12 text-right">Spam</span><span className="w-12 text-right">Rest</span><span className="w-12 text-right">At risk</span><span className="w-12 text-right">OK</span></div>
      <ul className="divide-y divide-line">
        {clients.map((c) => (
          <li key={c.key}>
            <button onClick={() => route('attention', c.key)} className="flex min-h-11 w-full items-center justify-between gap-3 px-4 py-2 text-left text-sm hover:bg-hover sm:px-5"
              aria-label={`${c.name}: ${c.tiles.spam} spam, ${c.tiles.resting} resting, ${c.tiles.risk} at risk, ${c.tiles.healthy} healthy`}>
              <span className="min-w-0 truncate font-medium text-fg">{c.name}</span>
              <span className="tabular flex shrink-0 gap-1 sm:gap-4">
                <span className={cx('w-12 text-right font-semibold', c.tiles.spam ? 'text-bad' : 'text-faint')}>{c.tiles.spam}</span>
                <span className={cx('w-12 text-right', c.tiles.resting ? 'text-info' : 'text-faint')}>{c.tiles.resting}</span>
                <span className={cx('w-12 text-right', c.tiles.risk ? 'text-warn' : 'text-faint')}>{c.tiles.risk}</span>
                <span className="w-12 text-right text-fg-2">{c.tiles.healthy}</span>
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
        <StatusDot tone={i.redFlag ? 'bad' : st.tone} className="mt-2" label={i.redFlag ? 'Warm-up off' : st.label} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="min-w-0 break-all text-[15px] font-semibold text-fg">{i.title}</span>
            <Pill tone={st.pill}>{st.label}</Pill>
            {i.kind === 'domain' && <Pill>domain · {i.inboxes ?? 0} inbox{i.inboxes === 1 ? '' : 'es'}</Pill>}
            {showClient && <Pill>{i.client}</Pill>}
          </div>
          <div className={cx('mt-1 text-sm font-medium leading-snug', i.redFlag ? 'text-bad' : 'text-fg-2')}>{i.reason}</div>
          {i.doing && <div className="mt-1 flex gap-1.5 text-sm leading-snug text-muted"><Icon name="activity" size={14} className="mt-0.5" /><span><span className="sr-only">Engine: </span>{i.doing}</span></div>}
          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-2">
            <span className="inline-flex items-center gap-1.5 text-xs font-medium text-fg-2"><Avatar name={i.owner} size="xs" />{i.owner}</span>
            {i.links.filter((l) => !/^https?:/i.test(l.href)).map((l) => <button key={l.href} onClick={() => go(l.href)} className="inline-flex min-h-9 items-center gap-1.5 rounded-lg bg-accent px-3 text-sm font-semibold text-accent-fg hover:bg-accent-hover">{l.label}<Icon name="arrowRight" size={14} /></button>)}
          </div>
        </div>
      </div>
    </li>
  );
}

/** Agent notes at the top (Problem → Data → Fix → Why) with "Have <agent> fix it" / "I'll look". */
function AgentNotes({ notes }: { notes: DNote[] }) {
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
            <FixItButton agent={n.owner} title={n.problem} detail={[`Data: ${n.data}`, `Fix: ${n.fix}`, `Why: ${n.why}`].join('\n')} className="pt-1" />
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
const FILTERS: (Health | '')[] = ['', 'spam', 'resting', 'risk', 'healthy'];
function InboxesTab({ client, status, refresh, setBusy }: { client: string; status?: string; refresh: number; setBusy: (b: boolean) => void }) {
  const asked = LEGACY[status ?? ''] ?? status;
  const st = FILTERS.includes(asked as Health) ? (asked as Health | '') : '';
  const [q, setQ] = useState('');
  const [search, setSearch] = useState('');
  const [again, setAgain] = useState(0);
  const [editAll, setEditAll] = useState(false);
  // Round 2: bulk edit. picked = ticked inboxes; all = every inbox the filter shows (resolved on the server).
  const [bulk, setBulk] = useState(false);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [all, setAll] = useState(false);
  useEffect(() => { setPicked(new Set()); setAll(false); }, [client, st, search]);
  const toggle = (ids: string[], on: boolean) => { setAll(false); setPicked((p) => { const n = new Set(p); ids.forEach((id) => (on ? n.add(id) : n.delete(id))); return n; }); };
  useEffect(() => { const h = setTimeout(() => setSearch(q.trim()), 300); return () => clearTimeout(h); }, [q]);
  const qs = new URLSearchParams({ ...(client ? { client } : {}), ...(st ? { status: st } : {}), ...(search ? { q: search } : {}) }).toString();
  const { d, error, load } = useView<InboxesView>(`/deliverability/inboxes${qs ? `?${qs}` : ''}`, refresh + again, setBusy);
  const { limits, reload } = useLimits(client, refresh);
  const done = () => { setEditAll(false); setBulk(false); setPicked(new Set()); setAll(false); reload(); setAgain((x) => x + 1); };
  const clientName = d?.clients.find((c) => c.key === client)?.name ?? '';
  const scope: BulkScope = all ? { filter: { client, status: st, q: search.toLowerCase() } } : { accounts: [...picked] };
  const scopeLabel = all ? `all ${d?.total.toLocaleString('en-US') ?? ''} shown${clientName ? ` (${clientName}${st ? `, ${STATUS[st].label.toLowerCase()}` : ''})` : st ? ` (${STATUS[st].label.toLowerCase()})` : ' (every client)'}${search ? `, matching "${search}"` : ''}` : `${picked.size} ticked inbox${picked.size === 1 ? '' : 'es'}`;
  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <label className="relative min-w-0 flex-1 sm:max-w-sm">
          <span className="sr-only">Search inboxes</span>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search inbox, domain or client" maxLength={100}
            className="min-h-11 w-full rounded-xl border border-line bg-surface px-3.5 text-[15px] text-fg outline-none placeholder:text-faint focus:border-accent focus:ring-4 focus:ring-accent-soft" />
        </label>
        <Select label="Status" value={st} onChange={(v) => route('inboxes', client, v)} options={FILTERS.map((f) => ({ value: f, label: f ? STATUS[f].label : 'All statuses' }))} />
        {limits?.canEdit && !bulk && <Button tone="accent" icon="pen" onClick={() => { setBulk(true); setEditAll(false); }} className="min-h-10 px-3 text-sm">Bulk edit limits</Button>}
        {limits?.canEdit && client && !editAll && !bulk && <Button tone="ghost" onClick={() => setEditAll(true)} className="min-h-10 px-3 text-sm">Edit all {clientName || 'client'} inboxes</Button>}
      </div>
      {bulk && d && (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-line bg-sunken px-3.5 py-2 text-sm">
          <span className="font-semibold text-fg">Pick inboxes:</span>
          <span className="text-fg-2">tick them below (or a whole domain), or</span>
          <Button tone={all ? 'accent' : 'quiet'} onClick={() => { setAll(true); setPicked(new Set()); }} className="min-h-9 px-3 text-sm">All {d.total.toLocaleString('en-US')} shown</Button>
          <span className="text-xs text-muted">Use the client and status dropdowns to pick per client or by status.</span>
          {(picked.size > 0 || all) && <button onClick={() => { setPicked(new Set()); setAll(false); }} className="min-h-9 text-sm font-semibold text-accent-ink hover:underline">Clear</button>}
        </div>
      )}
      {editAll && limits && <LimitEditor label={`All ${clientName || 'client'} inboxes`} client={client} cold={null} warmup={null} live={limits.live} onDone={done} onCancel={() => setEditAll(false)} />}
      {limits && <RampCard limits={limits} onApplied={done} />}
      {error && <ErrorBox error={error} retry={load} />}
      {!d && !error && <PageSkeleton kind="list" />}
      {d && (
        <>
          <div className="text-sm text-muted"><span className="tabular font-semibold text-fg-2">{d.total.toLocaleString('en-US')}</span> inbox{d.total === 1 ? '' : 'es'} on <span className="tabular font-semibold text-fg-2">{d.totalGroups.toLocaleString('en-US')}</span> domain{d.totalGroups === 1 ? '' : 's'}{d.totalGroups > d.groups.length ? ` (first ${d.groups.length} shown: search to narrow)` : ''}</div>
          {!d.groups.length && <Card><Empty icon="inbox" title="No inboxes" sub={search ? `Nothing matches "${search}".` : 'No inboxes with this filter.'} /></Card>}
          <div className="space-y-3">
            {d.groups.map((g) => <DomainGroup key={`${g.clientKey}:${g.domain}`} g={g} showClient={!client} canEdit={!!limits?.canEdit} live={!!limits?.live} onSaved={done} pick={bulk ? { picked, all, toggle } : null} />)}
          </div>
          {bulk && limits && (picked.size > 0 || all) && <BulkLimits scope={scope} label={scopeLabel} live={limits.live} onDone={done} onClear={() => { setBulk(false); setPicked(new Set()); setAll(false); }} />}
          {d.noClient > 0 && !client && <p className="text-xs text-muted">{d.noClient} inbox{d.noClient === 1 ? ' has' : 'es have'} no client in Airtable: <button className="font-semibold underline underline-offset-2" onClick={() => route('inboxes', 'none')}>show them</button>.</p>}
          {limits && <LimitHistory limits={limits} />}
          <p className="text-xs text-muted">Cold = cold emails per day; warm-up = warm-up emails per day; warm-up placement = EmailBison's warm-up score (share landing in the inbox); test = the newest inbox placement test. From Airtable, read {timeAgo(d.readAt) || 'just now'}; kept 1 minute.</p>
        </>
      )}
    </div>
  );
}

const tone = (x: number | null, bad: number, warn: number): 'bad' | 'warn' | undefined => (x === null ? undefined : x < bad ? 'bad' : x < warn ? 'warn' : undefined);
type BulkPick = { picked: Set<string>; all: boolean; toggle: (ids: string[], on: boolean) => void } | null;
function PickBox({ pick, ids, label }: { pick: BulkPick; ids: string[]; label: string }) {
  if (!pick) return null;
  const on = pick.all || ids.every((id) => pick.picked.has(id));
  return <input type="checkbox" checked={on} disabled={pick.all} onChange={(e) => pick.toggle(ids, e.target.checked)} aria-label={label} className="h-4 w-4 shrink-0 accent-[var(--accent)]" />;
}
function DomainGroup({ g, showClient, canEdit, live, onSaved, pick }: { g: InboxGroup; showClient: boolean; canEdit: boolean; live: boolean; onSaved: () => void; pick: BulkPick }) {
  const [edit, setEdit] = useState<string | null>(null);
  return (
    <Card className="min-w-0 overflow-hidden p-0">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 border-b border-line bg-sunken/60 px-4 py-2.5 sm:px-5">
        <PickBox pick={pick} ids={g.inboxes.map((i) => i.id)} label={`All inboxes on ${g.domain}`} />
        <StatusDot tone={STATUS[g.status].tone} label={STATUS[g.status].label} />
        <span className="min-w-0 break-all font-semibold text-fg">{g.domain}</span>
        {showClient && <Pill>{g.client}</Pill>}
        {g.blacklist === 'Listed' && <Pill tone="bad">Blacklisted</Pill>}
        {g.renewal && <span className="ml-auto text-xs text-muted">renews {md(g.renewal)}</span>}
      </div>
      <div className="hidden md:block">
        <table className="w-full text-left text-sm">
          <thead className="text-xs text-muted"><tr className="border-b border-line">
            <th className="px-5 py-2 font-medium">Inbox</th><th className="w-24 px-2 py-2 text-right font-medium">Cold/day</th><th className="w-24 px-2 py-2 text-right font-medium">Warm-up/day</th>
            <th className="w-28 px-2 py-2 text-right font-medium">Warm-up placement</th><th className="w-28 px-2 py-2 text-right font-medium">Warm-up</th><th className="w-16 px-2 py-2 text-right font-medium">Test</th><th className="w-16 px-2 py-2 text-right font-medium">Bounce</th>{canEdit && <th className="w-16 px-4 py-2"><span className="sr-only">Edit</span></th>}
          </tr></thead>
          <tbody className="divide-y divide-line">
            {g.inboxes.map((i) => (
              <InboxTableRow key={i.id} i={i} canEdit={canEdit && !pick} editing={edit === i.id} onEdit={() => setEdit(edit === i.id ? null : i.id)} live={live} onSaved={() => { setEdit(null); onSaved(); }} pick={pick} />
            ))}
          </tbody>
        </table>
      </div>
      <ul className="divide-y divide-line md:hidden">
        {g.inboxes.map((i) => (
          <li key={i.id} className="px-4 py-3">
            <div className="flex items-start gap-2.5">
              {pick && <span className="mt-1"><PickBox pick={pick} ids={[i.id]} label={`Pick ${i.email}`} /></span>}
              <StatusDot tone={i.warmupOff ? 'bad' : STATUS[i.status].tone} className="mt-1.5" label={STATUS[i.status].label} />
              <div className="min-w-0 flex-1">
                <div className="flex items-start justify-between gap-2"><span className="min-w-0 break-all text-sm font-semibold text-fg">{i.email}</span><Pill tone={STATUS[i.status].pill}>{STATUS[i.status].label}</Pill></div>
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  <Metric label="Cold" v={i.dailyLimit === null ? '–' : `${i.dailyLimit}/day`} />
                  <Metric label="Warm-up" v={i.warmupLimit === null ? '–' : `${i.warmupLimit}/day`} />
                  <Metric label="Placement" v={i.warmup === null ? '–' : `${i.warmup}%`} tone={tone(i.warmup, 50, 70)} />
                  <Metric label="Warm-up" v={warmupCell(i)} tone={i.warmupOff ? 'bad' : undefined} />
                  <Metric label="Test" v={i.score === null ? '–' : `${i.score}%`} tone={tone(i.score, 60, 75)} />
                  <Metric label="Bounce" v={i.bounce === null ? '–' : `${i.bounce}%`} tone={i.bounce === null ? undefined : i.bounce > 4 ? 'bad' : i.bounce > 2.5 ? 'warn' : undefined} />
                </div>
                {i.reasons.length > 0 && <div className="mt-1.5 text-sm leading-snug text-fg-2">{i.reasons.map((r) => r.text).join(' · ')}</div>}
                {canEdit && !pick && edit !== i.id && <button onClick={() => setEdit(i.id)} className="mt-1.5 min-h-9 text-sm font-semibold text-accent-ink hover:underline">Edit limits</button>}
                {edit === i.id && <div className="mt-2"><LimitEditor label={i.email} accounts={[i.id]} cold={i.dailyLimit} warmup={i.warmupLimit} live={live} onDone={() => { setEdit(null); onSaved(); }} onCancel={() => setEdit(null)} /></div>}
              </div>
            </div>
          </li>
        ))}
      </ul>
    </Card>
  );
}

const WHY_CELL: Record<string, string> = { resting: 'off (resting)', replacing: 'off (replacing)', spam: 'off (spam review)', bounces: 'off (EmailBison)' };
/** Round 2: expected warm-up off reads "off (resting)"; only an unexpected off is a red "OFF". */
const warmupCell = (i: Pick<InboxRow, 'warmupOff' | 'warmupWhy' | 'warmupOn'>) => (i.warmupOff ? 'OFF' : i.warmupWhy ? WHY_CELL[i.warmupWhy] ?? 'off' : i.warmupOn ? 'on' : '–');
function InboxTableRow({ i, canEdit, editing, onEdit, live, onSaved, pick }: { i: InboxRow; canEdit: boolean; editing: boolean; onEdit: () => void; live: boolean; onSaved: () => void; pick: BulkPick }) {
  const num = (x: number | null, t?: 'bad' | 'warn', suffix = '') => <span className={cx('tabular', t === 'bad' ? 'font-semibold text-bad' : t === 'warn' ? 'font-semibold text-warn' : 'text-fg-2')}>{x === null ? '–' : `${x}${suffix}`}</span>;
  return (
    <>
      <tr className="align-top">
        <td className="px-5 py-2.5">
          <div className="flex items-center gap-2"><PickBox pick={pick} ids={[i.id]} label={`Pick ${i.email}`} /><StatusDot tone={i.warmupOff ? 'bad' : STATUS[i.status].tone} label={STATUS[i.status].label} /><span className="min-w-0 break-all font-medium text-fg">{i.email}</span><Pill tone={STATUS[i.status].pill}>{STATUS[i.status].label}</Pill></div>
          {i.reasons.length > 0 && <div className="mt-0.5 pl-4 text-xs leading-snug text-fg-2">{i.reasons.map((r) => r.text).join(' · ')}</div>}
          {i.doing && i.status !== 'healthy' && <div className="mt-0.5 pl-4 text-xs text-muted">{i.doing}</div>}
        </td>
        <td className="px-2 py-2.5 text-right">{num(i.dailyLimit)}</td>
        <td className="px-2 py-2.5 text-right">{num(i.warmupLimit)}</td>
        <td className="px-2 py-2.5 text-right">{num(i.warmup, tone(i.warmup, 50, 70), '%')}</td>
        <td className={cx('px-2 py-2.5 text-right text-xs', i.warmupOff ? 'font-semibold text-bad' : i.warmupWhy ? 'text-muted' : 'font-semibold text-fg-2')}>{warmupCell(i)}</td>
        <td className="px-2 py-2.5 text-right">{num(i.score, tone(i.score, 60, 75), '%')}</td>
        <td className="px-2 py-2.5 text-right">{num(i.bounce, i.bounce === null ? undefined : i.bounce > 4 ? 'bad' : i.bounce > 2.5 ? 'warn' : undefined, '%')}</td>
        {canEdit && <td className="px-4 py-2 text-right"><button onClick={onEdit} aria-expanded={editing} className="min-h-9 text-sm font-semibold text-accent-ink hover:underline">{editing ? 'Close' : 'Edit'}</button></td>}
      </tr>
      {editing && <tr><td colSpan={canEdit ? 8 : 7} className="px-5 pb-3"><LimitEditor label={i.email} accounts={[i.id]} cold={i.dailyLimit} warmup={i.warmupLimit} live={live} onDone={onSaved} onCancel={onEdit} /></td></tr>}
    </>
  );
}

function Metric({ label, v, tone: t }: { label: string; v: string; tone?: 'bad' | 'warn' }) {
  return <span className={cx('inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs', t === 'bad' ? 'bg-bad-soft text-bad' : t === 'warn' ? 'bg-warn-soft text-warn' : 'bg-sunken text-fg-2')}><span className="text-muted">{label}</span><span className="tabular font-semibold">{v}</span></span>;
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
        <Fact label="Last test" v={f.lastTest ? md(f.lastTest) : 'none'} sub={f.ageDays === null ? 'no tests found' : `${f.ageDays === 0 ? 'today' : `${f.ageDays} day${f.ageDays === 1 ? '' : 's'} ago`}${f.fridayMissing ? ` · Fri ${md(f.expectedFriday)} scores missing` : ''}`} bad={f.stale || f.fridayMissing} />
        <Fact label="Next test" v={`Fri ${md(f.nextTest)}`} sub="every Friday" />
        <Fact label="Tests read" v={f.tests.toLocaleString('en-US')} sub={`last ${d.windowDays} days`} />
        <div className="text-xs text-muted sm:ml-auto">Under {d.limits.rest}% = rested 7 days · under {d.limits.watch}% = at risk</div>
      </Card>
      <AgentNotes notes={d.notes} />
      <PlacementRuns runs={d.runs} bands={d.bands} />
      {!d.clients.length && <Card><Empty icon="activity" title="No placement tests" sub={`None in the last ${d.windowDays} days for ${client ? 'this client' : 'active clients'}.`} /></Card>}
      <div className="grid gap-3 lg:grid-cols-2">
        {d.clients.map((c) => (
          <Card key={c.key} className="min-w-0 overflow-hidden p-0">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 border-b border-line px-4 py-3 sm:px-5">
              <span className="font-semibold text-fg">{c.name}</span>
              <span className="text-sm text-muted">newest {md(c.newest)}</span>
              {c.stale && <Pill tone="bad">over 7 days old</Pill>}
              {c.spam > 0 && <Pill tone="bad" className="ml-auto">{c.spam} under {d.limits.rest}%</Pill>}
            </div>
            <ul className="divide-y divide-line">{c.domains.map((x) => <PlacementRow key={x.domain} x={x} />)}</ul>
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
        <span className={cx('tabular w-12 shrink-0 text-right text-sm font-bold', x.status === 'spam' ? 'text-bad' : x.status === 'risk' ? 'text-warn' : 'text-fg')}>{x.score === null ? '—' : `${x.score}%`}</span>
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
  const owner = d.costs !== null;
  const cost = new Map((d.costs ?? []).map((c) => [c.key, c]));
  // The renewal gap has its own card (with Atlas's task), so its note is not repeated.
  const notes = d.notes.filter((n) => !/renewal date/i.test(n.problem));
  return (
    <div className="space-y-4">
      {owner && <CostTotal costs={d.costs!} rule={d.costRule} />}
      <RenewalCard gap={d.renewalGap} task={d.renewalTask} cheap={d.cheap} />
      <AgentNotes notes={notes} />
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
                {r.link && <button onClick={() => go(r.link!.href)} className="inline-flex min-h-9 items-center gap-1.5 rounded-lg bg-accent px-3 text-sm font-semibold text-accent-fg hover:bg-accent-hover">{r.link.label}<Icon name="arrowRight" size={14} /></button>}
              </li>
            ))}
          </ul>
        </Card>
      )}
      <BuyPanel purchases={d.purchases} clients={d.clients.map((c) => ({ key: c.key, name: c.name }))} canBuy={owner} client={client} onDone={load} />
      {!d.clients.length && <Card><Empty icon="layers" title="No domains" sub="No domains with inboxes for active clients in Airtable." /></Card>}
      {d.clients.map((c) => (
        <Card key={c.key} className="min-w-0 overflow-hidden p-0">
          <SubHead title={c.name} right={<span className="text-xs text-muted"><span className="tabular font-semibold text-fg-2">{c.domains.length}</span> domains · <span className="tabular font-semibold text-fg-2">{c.inboxes}</span> inboxes{c.notTwo ? <span className="text-warn"> · {c.notTwo} not 2</span> : ''}{owner && <CostLine c={cost.get(c.key)} rule={d.costRule} />}</span>} />
          <ul className="divide-y divide-line">
            {c.domains.map((x) => (
              <li key={x.id || x.name} className="px-4 py-3 sm:px-5">
                <div className="flex items-start gap-2.5">
                  <StatusDot tone={STATUS[x.status].tone} className="mt-1.5" label={STATUS[x.status].label} />
                  <div className="min-w-0 flex-1">
                    <span className="min-w-0 break-all text-sm font-semibold text-fg">{x.name}</span>
                    <div className="mt-1.5 flex flex-wrap gap-1.5">
                      <Metric label="Inboxes" v={String(x.inboxes)} tone={x.id && x.inboxes !== 2 ? 'warn' : undefined} />
                      <Metric label={x.renewalEstimated ? 'Renews (estimated)' : x.renewalSource === 'cheapinboxes' ? 'Renews (Cheap Inboxes)' : 'Renews'} v={x.renewal ? `${longDate(x.renewal)}${x.daysToRenewal !== null && x.daysToRenewal <= 60 && !x.renewalEstimated ? ` (${x.daysToRenewal} d)` : ''}` : 'UNKNOWN'} tone={!x.renewalEstimated && x.daysToRenewal !== null && x.daysToRenewal < 0 ? 'bad' : !x.renewalEstimated && x.daysToRenewal !== null && x.daysToRenewal <= 30 ? 'warn' : undefined} />
                      <span title={x.blacklistWhy}><Metric label="Blacklist" v={x.blacklistText} tone={x.blacklist === 'Listed' ? 'bad' : x.blacklist === 'Check Failed' ? 'warn' : undefined} /></span>
                      {x.replacement && <Pill tone="warn">Replacement {x.replacement.status === 'Pending Review' ? 'waiting' : x.replacement.status.toLowerCase()}</Pill>}
                    </div>
                    {x.reasons.length > 0 && <div className="mt-1.5 text-sm leading-snug text-fg-2">{x.reasons.map((r) => r.text).join(' · ')}</div>}
                    {x.blacklistText === 'Not checked' && <div className="mt-1 text-xs text-muted">{x.blacklistWhy}</div>}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </Card>
      ))}
      <p className="text-xs text-muted">{d.rule} Renews (estimated) = no Renewal Date in Airtable, so 1 year from the date the domain was added. Domains with no inbox are hidden. From Airtable (Domains, Spam Remediation Queue, Domain Purchase Requests), read {timeAgo(d.readAt) || 'just now'}; kept 1 minute. HQ buys nothing: buying stays a ✅ in Decisions.</p>
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

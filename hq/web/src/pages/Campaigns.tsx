// Campaigns, laid out like the Airtable Campaign Center (Alex, 2026-11-27): campaign name, strategy and
// stage, status, sending accounts, statistics; cleaner and easy to read. Filters are dropdowns (the
// shared active-client dropdown, a status dropdown, a search). Channel tabs: Email, LinkedIn, AI
// caller, Direct mail. Email has two views: Campaigns and Lead lists (the Lead List Center). The old
// Pipeline view is folded into the rows (a building campaign shows its step bar). HQ writes nothing
// here; the only outside link is "Open in EmailBison". Everything is rendered as escaped text.
import { useCallback, useEffect, useMemo, useState } from 'react';
import { api, type CampaignDetailB3, type CampaignListB3, type CampaignRowB3, type CampaignStep, type ChannelB3, type NeedKind, type SendingSummaryB3 } from '../api';
import { Avatar, BackLink, Card, cx, Empty, ErrorBox, go, Icon, IconButton, Label, PageSkeleton, PageTitle, Pill, SectionHeader, setCount, StatusDot, timeAgo } from '../ui';
import { ClientPicker, rememberedClient } from '../clientPicker';
import { Select } from '../charts';
import { NoteList } from './Inbox';
import { LeadLists } from './LeadLists';

const VIEWS = [
  { key: 'action', label: 'Needs action' }, { key: 'live', label: 'Live' }, { key: 'building', label: 'Building' }, { key: 'all', label: 'All (live + building)' },
] as const;
type View = (typeof VIEWS)[number]['key'];
const isView = (v?: string): v is View => VIEWS.some((x) => x.key === v);
const CHANNEL_KEYS = ['email', 'linkedin', 'caller', 'mail'];
const DEFAULT_CHANNELS: ChannelB3[] = [
  { key: 'email', label: 'Email', live: true, reason: '' }, { key: 'linkedin', label: 'LinkedIn', live: false, reason: '' },
  { key: 'caller', label: 'AI caller', live: false, reason: '' }, { key: 'mail', label: 'Direct mail', live: false, reason: 'Direct mail is not running yet.' },
];

const NEED: Record<NeedKind, { label: string; tone: 'bad' | 'warn' | 'info' | 'accent' }> = {
  pause: { label: 'Pause', tone: 'bad' }, failed: { label: 'Failed', tone: 'bad' }, stuck: { label: 'Stuck', tone: 'warn' }, watch: { label: 'Bounce watch', tone: 'warn' },
  next: { label: 'Plan next', tone: 'accent' }, review: { label: 'Client review', tone: 'info' }, low: { label: 'Low interest', tone: 'warn' },
};
const pct = (x: number) => `${Math.round(x * 100)}%`;
const num = (x: number) => x.toLocaleString('en-US');
const rate = (n: number, d: number) => (d > 0 ? `${Math.round((n / d) * 1000) / 10}%` : '–');
const dateLabel = (iso: string) => (iso ? new Date(iso.length === 10 ? `${iso}T12:00:00` : iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : '');
const dateTime = (iso: string) => (iso ? new Date(iso).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : '');

/** #/campaigns[/<view | lists | linkedin | caller | mail>[/<client key>]] or #/campaigns/<record id>. */
export default function Campaigns({ a, b }: { a?: string; b?: string }) {
  if (a && /^rec[A-Za-z0-9]{14}$/.test(a)) return <CampaignPage id={a} />;
  const channel = a && CHANNEL_KEYS.includes(a) ? a : 'email';
  const client = rememberedClient('campaigns', b && b !== 'all' ? b : undefined);
  if (a === 'lists') return <Shell channel="email" section="lists" client={client} />;
  return <Shell channel={channel} section="campaigns" view={isView(a) ? a : 'action'} client={client} />;
}

function Shell({ channel, section, view = 'action', client }: { channel: string; section: 'campaigns' | 'lists'; view?: View; client: string }) {
  const [d, setD] = useState<CampaignListB3 | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [refresh, setRefresh] = useState(0);
  const load = useCallback((again = false) => {
    setBusy(true); setError('');
    const qs = new URLSearchParams({ ...(client ? { client } : {}), ...(again ? { refresh: '1' } : {}) });
    api<CampaignListB3>(`/campaigns?${qs}`).then((x) => { setD(x); if (!client) setCount('campaigns', x.counts.action); }).catch((e) => setError(e.message)).finally(() => setBusy(false));
  }, [client]);
  useEffect(() => load(), [load]);
  const pickClient = useCallback((k: string) => go(`campaigns/${section === 'lists' ? 'lists' : view}${k ? `/${encodeURIComponent(k)}` : ''}`), [section, view]);
  const channels = d?.channels?.length ? d.channels : DEFAULT_CHANNELS;
  const ch = channels.find((c) => c.key === channel);
  const clientName = d?.clients.find((c) => c.key === client)?.name ?? '';
  return (
    <div>
      <PageTitle title="Campaigns" kicker={d ? `${d.counts.live} live · ${d.counts.building} building${clientName ? ` · ${clientName}` : ''}` : 'Every campaign, every active client'}
        sub="What needs action first. Tap a campaign for its strategy, inboxes and history."
        right={<IconButton icon="refresh" label="Refresh" onClick={() => { setRefresh((x) => x + 1); load(true); }} className={cx('border border-line bg-surface', busy && '[&_svg]:animate-spin')} />} />
      <div role="tablist" aria-label="Channel" className="grid grid-cols-4 gap-1 rounded-xl border border-line bg-sunken p-1 sm:inline-grid sm:grid-flow-col sm:auto-cols-fr">
        {channels.map((c) => (
          <button key={c.key} role="tab" aria-selected={channel === c.key} onClick={() => go(c.key === 'email' ? 'campaigns' : `campaigns/${c.key}`)}
            className={cx('flex min-h-10 min-w-0 items-center justify-center gap-1.5 rounded-lg px-1.5 text-[13px] font-semibold transition sm:px-4 sm:text-sm', channel === c.key ? 'bg-surface text-fg shadow-card' : 'text-muted hover:text-fg')}>
            <span className="truncate">{c.label}</span>{!c.live && <span aria-hidden="true" className="h-1.5 w-1.5 shrink-0 rounded-full bg-dot-idle" />}{!c.live && <span className="sr-only">(not running)</span>}
          </button>
        ))}
      </div>
      {error && <div className="mt-4"><ErrorBox error={error} retry={() => load()} /></div>}
      {ch && !ch.live && <Card className="mt-4"><Empty icon="pause" title={channel === 'mail' ? 'Direct mail is not running yet' : `${ch.label} is paused`} sub={ch.reason || 'Only cold email works right now.'} /></Card>}
      {channel === 'email' && (
        <>
          <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
            <div role="tablist" aria-label="Campaigns or lead lists" className="grid grid-cols-2 gap-1 rounded-xl border border-line bg-sunken p-1 sm:inline-grid">
              {([['campaigns', 'Campaigns'], ['lists', 'Lead lists']] as const).map(([k, label]) => (
                <button key={k} role="tab" aria-selected={section === k} onClick={() => go(`campaigns/${k === 'lists' ? 'lists' : 'action'}${client ? `/${encodeURIComponent(client)}` : ''}`)}
                  className={cx('min-h-9 rounded-lg px-4 text-sm font-semibold transition', section === k ? 'bg-ink text-ink-fg shadow-card' : 'text-muted hover:text-fg')}>{label}</button>
              ))}
            </div>
            <ClientPicker screen="campaigns" value={client} options={(d?.clients ?? []).map((c) => ({ key: c.key, name: c.name, count: c.count }))} onChange={pickClient} />
          </div>
          {section === 'campaigns' && !d && !error && <div className="mt-4"><PageSkeleton kind="list" /></div>}
          {section === 'campaigns' && d && <CampaignList d={d} view={view} client={client} />}
          {section === 'lists' && <LeadLists client={client} refresh={refresh} />}
        </>
      )}
    </div>
  );
}

function CampaignList({ d, view, client }: { d: CampaignListB3; view: View; client: string }) {
  const [q, setQ] = useState('');
  const [allNotes, setAllNotes] = useState(false);
  const rows = useMemo(() => {
    const term = q.trim().toLowerCase();
    const base = view === 'action' ? d.rows.filter((r) => r.needs.length) : view === 'live' ? d.rows.filter((r) => r.group === 'live') : view === 'building' ? d.rows.filter((r) => r.group === 'building') : d.rows;
    return term ? base.filter((r) => `${r.name} ${r.client} ${r.stage} ${r.approach}`.toLowerCase().includes(term)) : base;
  }, [d, view, q]);
  const count = (k: View) => (k === 'action' ? d.counts.action : k === 'live' ? d.counts.live : k === 'building' ? d.counts.building : d.counts.live + d.counts.building);
  const notes = allNotes ? d.notes : d.notes.slice(0, 2);
  return (
    <>
      <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-center">
        <Select label="Show" value={view} onChange={(v) => go(`campaigns/${v}${client ? `/${encodeURIComponent(client)}` : ''}`)} options={VIEWS.map((x) => ({ value: x.key, label: `${x.label} (${count(x.key)})` }))} />
        <label className="relative min-w-0 flex-1 sm:max-w-xs">
          <span className="sr-only">Search campaigns</span>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search campaigns" maxLength={100}
            className="min-h-10 w-full rounded-xl border border-line bg-surface px-3.5 text-sm text-fg outline-none placeholder:text-faint focus:border-accent focus:ring-4 focus:ring-accent-soft" />
        </label>
      </div>
      {d.notes.length > 0 && (
        <div className="mt-4">
          <NoteList notes={notes} />
          {d.notes.length > 2 && <button onClick={() => setAllNotes(!allNotes)} className="mt-1.5 min-h-9 text-sm font-semibold text-accent-ink hover:underline">{allNotes ? 'Show fewer notes' : `Show ${d.notes.length - 2} more data note${d.notes.length - 2 === 1 ? '' : 's'}`}</button>}
        </div>
      )}
      <div className="mt-4">
        {!rows.length ? <Card><Empty icon={view === 'action' ? 'check' : 'megaphone'} tone={view === 'action' ? 'good' : 'plain'} title={q ? 'No match' : view === 'action' ? 'Nothing needs action' : 'No campaigns here'} sub={q ? `Nothing matches "${q}".` : view === 'action' ? 'No bounce over 2.5%, nothing stuck, nothing at 60% without a next plan.' : 'Pick another view or client.'} /></Card>
          : <><CampaignCards rows={rows} showClient={!client} /><CampaignTable rows={rows} showClient={!client} /></>}
      </div>
      <p className="mt-4 text-xs text-muted">
        From Airtable (Campaigns) and the engine, read {timeAgo(d.readAt) || 'just now'}; kept 1 minute. Bounce watch over {d.limits.watch}% · pause over {d.limits.pause}% ·
        stuck = no stage change in {d.limits.stuckDays} days · low = under {Math.round(d.limits.lowShare * 100)}% of the agency average ({d.agencyPerThousand ?? 'UNKNOWN'} interested per 1,000) on {num(d.limits.minSentToJudge)}+ sent.
      </p>
    </>
  );
}

function NeedPill({ kind }: { kind: NeedKind }) { return <Pill tone={NEED[kind].tone}>{NEED[kind].label}</Pill>; }
function StatusPill({ r }: { r: CampaignRowB3 }) {
  return <Pill tone={r.group === 'live' ? 'good' : r.group === 'building' ? 'info' : 'plain'}>{r.group === 'live' ? 'Live' : r.group === 'building' ? (r.status || 'Building') : r.status || 'Done'}</Pill>;
}
function Bar({ v }: { v: number }) {
  return <div className="h-1.5 w-full overflow-hidden rounded-full bg-line" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(v * 100)} aria-label="Leads used"><div className={cx('h-full rounded-full', v >= 0.6 ? 'bg-accent' : 'bg-line-strong')} style={{ width: `${Math.min(100, Math.round(v * 100))}%` }} /></div>;
}
const bounceTone = (r: CampaignRowB3) => (r.flag === 'pause' ? 'text-bad' : r.flag === 'watch' ? 'text-warn' : 'text-fg-2');

/** "6 inboxes · 1 spam · warm-up off 1": the Campaign Center's sender accounts in one line. */
function Sending({ n, s, compact }: { n: number; s: SendingSummaryB3 | null; compact?: boolean }) {
  if (!n) return <span className="text-warn">No inboxes</span>;
  const bad = s ? [s.warmupOff ? { t: `${s.warmupOff} warm-up off`, c: 'text-bad' } : null, s.spam ? { t: `${s.spam} spam`, c: 'text-bad' } : null, s.resting ? { t: `${s.resting} resting`, c: 'text-info' } : null, s.risk ? { t: `${s.risk} at risk`, c: 'text-warn' } : null].filter(Boolean) as { t: string; c: string }[] : [];
  return (
    <span className={cx('inline-flex flex-wrap items-center gap-x-1.5', compact && 'text-xs')}>
      <span className="tabular font-semibold text-fg-2">{n}</span><span className="text-muted">inbox{n === 1 ? '' : 'es'}</span>
      {bad.length ? bad.map((x) => <span key={x.t} className={cx('font-medium', x.c)}>· {x.t}</span>) : s && <span className="text-good">· all healthy</span>}
    </span>
  );
}

function CampaignCards({ rows, showClient }: { rows: CampaignRowB3[]; showClient: boolean }) {
  return (
    <ul className="space-y-2 md:hidden">
      {rows.map((r) => (
        <li key={r.id}>
          <Card onClick={() => go(`campaigns/${r.id}`)} className="p-4">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="break-words text-[15px] font-semibold leading-snug text-fg">{r.name}</div>
                <div className="mt-0.5 flex flex-wrap gap-x-1.5 text-xs text-muted">{showClient && r.client && <span>{r.client}</span>}{r.stage && <span>· {r.stage}</span>}{r.approach && <span>· {r.approach}</span>}</div>
              </div>
              <StatusPill r={r} />
            </div>
            {r.needs[0] && <div className="mt-2 flex items-start gap-2 text-sm text-fg-2"><NeedPill kind={r.needs[0].kind} /><span className="min-w-0">{r.needs[0].text}</span></div>}
            {r.group === 'live'
              ? <>
                <div className="mt-2.5 flex items-center gap-3"><Bar v={r.progress} /><span className="tabular w-10 shrink-0 text-right text-xs font-semibold text-fg-2">{pct(r.progress)}</span></div>
                <div className="mt-2 grid grid-cols-4 gap-1 text-xs text-muted">
                  <span><span className="tabular block font-semibold text-fg-2">{num(r.sent)}</span>sent</span>
                  <span><span className="tabular block font-semibold text-fg-2">{rate(r.replies, r.contacted)}</span>replies</span>
                  <span><span className="tabular block font-semibold text-fg-2">{r.interested}</span>interested</span>
                  <span><span className={cx('tabular block font-semibold', bounceTone(r))}>{r.bounce}%</span>bounce</span>
                </div>
              </>
              : <Steps steps={r.steps} small className="mt-2.5" />}
            <div className="mt-2 text-xs"><Sending n={r.accounts} s={r.sending} compact /></div>
          </Card>
        </li>
      ))}
    </ul>
  );
}

function CampaignTable({ rows, showClient }: { rows: CampaignRowB3[]; showClient: boolean }) {
  return (
    <Card className="hidden overflow-hidden p-0 md:block">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[920px] text-left text-sm">
          <thead className="border-b border-line bg-sunken text-xs text-muted">
            <tr>
              <th className="px-5 py-2.5 font-medium">Campaign · strategy</th><th className="w-28 px-3 py-2.5 font-medium">Status</th><th className="w-44 px-3 py-2.5 font-medium">Sending accounts</th>
              <th className="w-36 px-3 py-2.5 font-medium">Progress</th><th className="w-20 px-3 py-2.5 text-right font-medium">Sent</th><th className="w-24 px-3 py-2.5 text-right font-medium">Replies</th>
              <th className="w-24 px-3 py-2.5 text-right font-medium">Interested</th><th className="w-20 px-3 py-2.5 text-right font-medium">Booked</th><th className="w-20 px-5 py-2.5 text-right font-medium">Bounce</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {rows.map((r) => (
              <tr key={r.id} onClick={() => go(`campaigns/${r.id}`)} className="cursor-pointer align-top transition hover:bg-hover">
                <td className="px-5 py-3">
                  <a href={`#/campaigns/${r.id}`} className="block font-semibold text-fg">{r.name}</a>
                  <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-muted">{showClient && r.client && <span>{r.client}</span>}{r.stage && <Pill>{r.stage}</Pill>}{r.approach && <span>{r.approach}</span>}</div>
                  {r.needs[0] && <div className="mt-1.5 flex items-start gap-2 text-xs text-fg-2"><NeedPill kind={r.needs[0].kind} /><span className="min-w-0">{r.needs[0].text}</span></div>}
                  {r.group === 'building' && <Steps steps={r.steps} small className="mt-2 max-w-md" />}
                </td>
                <td className="px-3 py-3"><StatusPill r={r} /></td>
                <td className="px-3 py-3 text-xs"><Sending n={r.accounts} s={r.sending} /></td>
                <td className="px-3 py-3">{r.group === 'live' ? <div className="flex items-center gap-2 pt-1"><Bar v={r.progress} /><span className="tabular w-9 shrink-0 text-right text-xs font-semibold text-fg-2">{pct(r.progress)}</span></div> : <span className="text-xs text-muted">{r.now ? r.now.label : '–'}</span>}</td>
                <td className="tabular px-3 py-3 text-right text-fg-2">{num(r.sent)}</td>
                <td className="tabular px-3 py-3 text-right text-fg-2">{num(r.replies)}<div className="text-xs text-muted">{rate(r.replies, r.contacted)}</div></td>
                <td className="tabular px-3 py-3 text-right text-fg-2">{num(r.interested)}<div className="text-xs text-muted">{r.perThousand !== null ? `${r.perThousand}/1k` : '–'}</div></td>
                <td className="tabular px-3 py-3 text-right text-fg-2">{num(r.booked)}</td>
                <td className={cx('tabular px-5 py-3 text-right font-semibold', bounceTone(r))}>{r.bounce}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

const SHORT: Record<string, string> = { list: 'List', copy: 'Copy', review: 'Review', launch: 'Launch', live: 'Live', sixty: '60%', next: 'Next' };
const STATE_WORD: Record<string, string> = { done: 'done', now: 'now', todo: 'not yet', bad: 'failed' };
/** One row of steps: list → copy → client review → launch → live → 60% → next. */
function Steps({ steps, small, className }: { steps: CampaignStep[]; small?: boolean; className?: string }) {
  return (
    <ol aria-label="Steps" className={cx('grid grid-cols-7 gap-1', className)}>
      {steps.map((x) => (
        <li key={x.key} title={`${x.label}: ${STATE_WORD[x.state]}${x.note ? ` (${x.note})` : ''}`} className="min-w-0">
          <span className={cx('block rounded-full', small ? 'h-1.5' : 'h-2', x.state === 'done' ? 'bg-accent' : x.state === 'now' ? 'bg-accent/35 ring-1 ring-inset ring-accent' : x.state === 'bad' ? 'bg-bad' : 'bg-line')} />
          <span className={cx('mt-1 block truncate text-center', small ? 'text-[10px]' : 'text-xs', x.state === 'now' || x.state === 'bad' ? 'font-semibold text-fg' : 'text-muted')}>{SHORT[x.key]}</span>
          <span className="sr-only">{STATE_WORD[x.state]}</span>
        </li>
      ))}
    </ol>
  );
}

// ---------- One campaign ----------
const ACC: Record<string, { label: string; tone: 'good' | 'warn' | 'bad' | 'idle' }> = { healthy: { label: 'Healthy', tone: 'good' }, risk: { label: 'At risk', tone: 'warn' }, spam: { label: 'Spam', tone: 'bad' }, resting: { label: 'Resting', tone: 'idle' } };
function CampaignPage({ id }: { id: string }) {
  const [d, setD] = useState<CampaignDetailB3 | null>(null);
  const [error, setError] = useState('');
  const load = useCallback(() => { setError(''); api<CampaignDetailB3>(`/campaigns/${encodeURIComponent(id)}`).then(setD).catch((e) => setError(e.message)); }, [id]);
  useEffect(load, [load]);
  const back = <BackLink label="Campaigns" onClick={() => (window.history.length > 1 ? window.history.back() : go('campaigns'))} />;
  if (error) return <>{back}<ErrorBox error={error} retry={load} /></>;
  if (!d) return <>{back}<PageSkeleton kind="list" /></>;
  const c = d.campaign;
  return (
    <div>
      {back}
      <Card className="sm:p-7">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <h1 className="break-words text-[24px] font-bold leading-tight tracking-tight sm:text-[26px]">{c.name}</h1>
            <div className="mt-2 flex flex-wrap items-center gap-1.5 text-sm text-muted">
              {c.client ? <button onClick={() => go(`clients/${c.clientRec}`)} className="min-h-8 font-medium text-accent-ink hover:underline">{c.client}</button> : <span className="text-warn">No client link</span>}
              <StatusPill r={c} />
              {c.stage && <Pill>{c.stage}</Pill>}
              {d.detail.skipBouncePause && <Pill tone="warn">Skip Bounce Pause on</Pill>}
            </div>
          </div>
          {d.links.bison && /^https:\/\//i.test(d.links.bison) && (
            <a href={d.links.bison} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center justify-center gap-2 whitespace-nowrap rounded-xl border border-line-strong bg-surface px-4 text-[15px] font-semibold text-fg transition hover:bg-hover"><Icon name="external" size={17} strokeWidth={2.1} />Open in EmailBison</a>
          )}
        </div>
        {c.needs.length > 0 && (
          <ul className="mt-5 space-y-2">
            {c.needs.map((x) => (
              <li key={x.kind} className={cx('flex items-start gap-3 rounded-xl px-3.5 py-3 text-sm leading-snug', NEED[x.kind].tone === 'bad' ? 'bg-bad-soft' : NEED[x.kind].tone === 'warn' ? 'bg-warn-soft' : NEED[x.kind].tone === 'info' ? 'bg-info-soft' : 'bg-accent-soft')}>
                <Avatar name={x.agent} size="sm" />
                <div className="min-w-0"><div className="font-semibold text-fg">{NEED[x.kind].label} · {x.agent}</div><div className="text-fg-2">{x.text}</div></div>
              </li>
            ))}
          </ul>
        )}
        <div className="mt-6">
          <Label className="mb-2">Steps</Label>
          <Steps steps={c.steps} />
          {c.now && <div className="mt-2 text-sm text-fg-2">Now: <span className="font-semibold">{c.now.label}</span>{c.now.note && <span className="text-muted"> · {c.now.note}</span>}</div>}
        </div>
      </Card>

      <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <Stat label="Sent" v={num(c.sent)} />
        <Stat label="Replies" v={num(c.replies)} sub={rate(c.replies, c.contacted)} />
        <Stat label="Interested" v={num(c.interested)} sub={c.perThousand !== null ? `${c.perThousand} per 1,000` : undefined} />
        <Stat label="Booked" v={num(c.booked)} />
        <Stat label="Bounce" v={`${c.bounce}%`} tone={c.flag === 'pause' ? 'bad' : c.flag === 'watch' ? 'warn' : undefined} sub={c.flag === 'pause' ? 'over 4%: pause' : c.flag === 'watch' ? 'over 2.5%: watch' : undefined} />
        <Stat label="Leads used" v={pct(c.progress)} sub={c.totalLeads ? `${num(c.contacted)} of ${num(c.totalLeads)}` : undefined} />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <section className="min-w-0">
          <SectionHeader title="Strategy" icon="target" />
          <Card className="space-y-2 text-sm text-fg-2">
            <div className="flex flex-wrap gap-x-4 gap-y-1">
              <span><span className="text-muted">Approach: </span>{d.detail.approach || 'UNKNOWN'}</span>
              {d.detail.launchDate && <span><span className="text-muted">Planned launch: </span>{dateLabel(d.detail.launchDate)}</span>}
            </div>
            {d.detail.thesis ? <p className="whitespace-pre-line leading-relaxed">{d.detail.thesis}</p> : <p className="text-muted">No campaign thesis written yet.</p>}
          </Card>
        </section>
        <section className="min-w-0">
          <SectionHeader title="Sending accounts" icon="mail" right={<button onClick={() => go(`deliverability/inboxes/${c.clientKey || 'all'}`)} className="min-h-9 text-sm font-semibold text-accent-ink hover:underline">Deliverability</button>} />
          <Card className="p-0">
            {!d.accounts.length ? <div className="px-5 py-4 text-sm text-muted">No sending inboxes linked to this campaign.</div> : (
              <ul className="divide-y divide-line">
                {d.accounts.map((a) => {
                  const st = a.status ? ACC[a.status] : null;
                  return (
                    <li key={a.id} className="flex items-start gap-2.5 px-4 py-2.5 sm:px-5">
                      <StatusDot tone={a.warmupOff ? 'bad' : st?.tone ?? 'idle'} className="mt-1.5" label={st?.label ?? 'Unknown'} />
                      <div className="min-w-0 flex-1">
                        <div className="break-all text-sm font-medium text-fg">{a.email || 'Inbox not found in Email Accounts'}</div>
                        <div className="text-xs text-muted">{[st?.label, a.warmupOff ? 'warm-up OFF' : '', a.dailyLimit !== null ? `${a.dailyLimit} cold/day` : '', a.warmupLimit !== null ? `${a.warmupLimit} warm-up/day` : '', a.warmup !== null ? `warm-up ${a.warmup}%` : ''].filter(Boolean).join(' · ')}</div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>
        </section>
      </div>

      {(d.lists.length > 0 || d.plan || d.next || d.detail.engineMessage || d.detail.workflowError) && (
        <div className="mt-6 grid gap-6 lg:grid-cols-2">
          {d.lists.length > 0 && (
            <section className="min-w-0">
              <SectionHeader title="Lead list" icon="list" />
              <Card className="p-0">
                <ul className="divide-y divide-line">
                  {d.lists.map((l) => (
                    <li key={l.id} className="px-5 py-3">
                      <div className="break-words text-[15px] font-medium text-fg">{l.name}</div>
                      <div className="mt-0.5 text-xs text-muted">{[l.stage || 'no stage', l.qa ? `QA ${l.qa}` : '', l.leads ? `${num(l.leads)} leads` : '', l.processing].filter(Boolean).join(' · ')}</div>
                      {l.message && <div className="mt-1 break-words text-xs text-fg-2">{l.message}</div>}
                    </li>
                  ))}
                </ul>
              </Card>
            </section>
          )}
          <section className="min-w-0">
            <SectionHeader title="Engine" icon="terminal" />
            <Card className="space-y-2 text-sm text-fg-2">
              {d.plan && <div>Built by campaign plan #{d.plan.id}: <span className="font-medium">{d.plan.label}</span>{d.plan.error && <span className="text-bad"> · {d.plan.error}</span>}</div>}
              {d.next && <div>Next campaign: plan #{d.next.id}, <span className="font-medium">{d.next.label}</span> (started {dateLabel(d.next.created)})</div>}
              {!d.next && c.group === 'live' && <div className="text-muted">No next campaign plan yet.</div>}
              {d.detail.approvalSource && <div>Approved by: {d.detail.approvalSource}</div>}
              {d.detail.engineMessage && <div className="break-words"><span className="text-muted">Engine message: </span>{d.detail.engineMessage}</div>}
              {d.detail.workflowError && <div className="break-words text-bad"><span className="text-muted">Workflow error: </span>{d.detail.workflowError}</div>}
            </Card>
          </section>
        </div>
      )}

      <section className="mt-6">
        <SectionHeader title="Stage history" icon="history" right={<span className="text-xs text-muted">engine</span>} />
        <Card className="p-0">
          {d.history.length ? (
            <ol className="divide-y divide-line">
              {d.history.map((h, i) => (
                <li key={`${h.at}-${i}`} className="flex gap-3 px-5 py-3">
                  <span className="tabular w-24 shrink-0 text-xs text-muted sm:w-28">{dateTime(h.at)}</span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5 text-[15px] text-fg">{h.what}<Pill tone={h.status === 'failed' ? 'bad' : h.status === 'succeeded' || h.status === 'live' ? 'good' : 'plain'}>{h.status}</Pill>{h.dryRun && <Pill>dry run</Pill>}</div>
                    {h.message && <div className="mt-0.5 break-words text-xs text-muted">{h.message}</div>}
                  </div>
                </li>
              ))}
            </ol>
          ) : <div className="px-5 py-4 text-sm text-muted">No engine steps on this campaign yet (it may have been built before the engine).</div>}
        </Card>
      </section>

      <ActivityLog rows={d.activity} />
      <p className="mt-6 text-xs text-muted">Read {timeAgo(d.readAt) || 'just now'} from Airtable and the engine; kept 1 minute. HQ changes nothing here.</p>
    </div>
  );
}

function Stat({ label, v, sub, tone }: { label: string; v: string; sub?: string; tone?: 'bad' | 'warn' }) {
  return (
    <div className="min-w-0 rounded-2xl border border-line bg-surface p-4 shadow-card">
      <div className="truncate text-xs font-medium text-muted">{label}</div>
      <div className={cx('tabular mt-1 text-[24px] font-bold leading-none tracking-tight', tone === 'bad' ? 'text-bad' : tone === 'warn' ? 'text-warn' : 'text-fg')}>{v}</div>
      {sub && <div className="mt-1.5 truncate text-xs text-muted">{sub}</div>}
    </div>
  );
}

/** The Activity log: rows linked to this campaign or its lead list, newest first, details on tap. */
function ActivityLog({ rows }: { rows: CampaignDetailB3['activity'] }) {
  const [open, setOpen] = useState<string | null>(null);
  const [limit, setLimit] = useState(15);
  const tone = (t: string) => (/failed/i.test(t) ? 'bad' : /fixed|approved|done/i.test(t) ? 'good' : /waiting/i.test(t) ? 'warn' : 'plain') as 'bad' | 'good' | 'warn' | 'plain';
  return (
    <section className="mt-6">
      <SectionHeader title="Activity log" icon="activity" right={<span className="text-xs text-muted">newest first</span>} />
      <Card className="p-0">
        {!rows.length && <div className="px-5 py-4 text-sm text-muted">Nothing logged yet for this campaign or its lead list.</div>}
        {rows.length > 0 && (
          <ol className="divide-y divide-line">
            {rows.slice(0, limit).map((r) => (
              <li key={r.id}>
                <button onClick={() => setOpen(open === r.id ? null : r.id)} aria-expanded={open === r.id} disabled={!r.details} className="flex w-full items-start gap-3 px-5 py-3 text-left transition enabled:hover:bg-hover">
                  <span className="tabular w-24 shrink-0 text-xs text-muted sm:w-28">{dateTime(r.when)}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block break-words text-[15px] font-medium text-fg">{r.event}</span>
                    <span className="mt-1 flex flex-wrap gap-1"><Pill tone="accent">{r.agent}</Pill>{r.type && <Pill tone={tone(r.type)}>{r.type}</Pill>}{r.on === 'list' && <Pill>lead list</Pill>}</span>
                  </span>
                  {r.details && <Icon name="chevronDown" size={16} className={cx('mt-1 text-faint transition', open === r.id && 'rotate-180')} />}
                </button>
                {open === r.id && r.details && <div className="mx-5 mb-3 whitespace-pre-wrap break-words rounded-lg bg-sunken p-3 text-xs leading-5 text-fg-2">{r.details}</div>}
              </li>
            ))}
          </ol>
        )}
        {rows.length > limit && <button onClick={() => setLimit(limit + 25)} className="min-h-11 w-full border-t border-line text-sm font-semibold text-fg-2 hover:bg-hover">Show older ({rows.length - limit} more)</button>}
      </Card>
    </section>
  );
}


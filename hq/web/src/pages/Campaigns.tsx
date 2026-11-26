// Campaigns (Step 3): one read-only area instead of Campaign Center, Lead List Center and the statistics
// screens. What needs action comes first; everything else is one tap deeper. HQ writes nothing here:
// buttons only open the Airtable record or EmailBison. Everything is rendered as escaped text.
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { api, type CampaignDetail, type CampaignList, type CampaignRow, type CampaignStep, type Channel, type NeedKind } from '../api';
import { Avatar, BackLink, Card, cx, Empty, ErrorBox, ExtLink, go, Icon, IconButton, Label, PageSkeleton, PageTitle, Pill, SectionHeader, setCount, timeAgo } from '../ui';
import { NoteList } from './Inbox';

export const CAMPAIGN_VIEWS = [
  { key: 'action', label: 'Needs action', short: 'Action' },
  { key: 'live', label: 'All live', short: 'Live' },
  { key: 'building', label: 'Building', short: 'Building' },
  { key: 'pipeline', label: 'Pipeline', short: 'Pipeline' },
] as const;
type View = (typeof CAMPAIGN_VIEWS)[number]['key'];
const isView = (v?: string): v is View => CAMPAIGN_VIEWS.some((x) => x.key === v);
const CHANNEL_KEYS = ['email', 'linkedin', 'caller'];

const NEED: Record<NeedKind, { label: string; tone: 'bad' | 'warn' | 'info' | 'accent' }> = {
  pause: { label: 'Pause', tone: 'bad' }, failed: { label: 'Failed', tone: 'bad' }, stuck: { label: 'Stuck', tone: 'warn' }, watch: { label: 'Watch', tone: 'warn' },
  next: { label: 'Plan next', tone: 'accent' }, review: { label: 'Client review', tone: 'info' }, low: { label: 'Low interest', tone: 'warn' },
};
const pct = (x: number) => `${Math.round(x * 100)}%`;
const num = (x: number) => x.toLocaleString('en-US');
const dateLabel = (iso: string) => (iso ? new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : '');
const dateTime = (iso: string) => (iso ? new Date(iso).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : '');

/** #/campaigns[/<view or channel>[/<client key>]] or #/campaigns/<record id>. */
export default function Campaigns({ a, b }: { a?: string; b?: string }) {
  if (a && /^rec[A-Za-z0-9]{14}$/.test(a)) return <CampaignPage id={a} />;
  const channel = a && CHANNEL_KEYS.includes(a) && a !== 'email' ? a : 'email';
  const view: View = isView(a) ? a : 'action';
  return <CampaignsList view={view} channel={channel} client={b ?? ''} />;
}

function CampaignsList({ view, channel, client }: { view: View; channel: string; client: string }) {
  const [d, setD] = useState<CampaignList | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const load = useCallback((refresh = false) => {
    setBusy(true); setError('');
    const qs = new URLSearchParams({ ...(client ? { client } : {}), ...(refresh ? { refresh: '1' } : {}) });
    api<CampaignList>(`/campaigns?${qs}`).then((x) => { setD(x); if (!client) setCount('campaigns', x.counts.action); }).catch((e) => setError(e.message)).finally(() => setBusy(false));
  }, [client]);
  useEffect(() => load(), [load]);
  const route = (v: string, c = client) => go(`campaigns/${v}${c && CAMPAIGN_VIEWS.some((x) => x.key === v) ? `/${encodeURIComponent(c)}` : ''}`);

  const channels = d?.channels ?? [];
  const ch = channels.find((c) => c.key === channel);
  const header = (
    <PageTitle title="Campaigns" kicker={d ? `${d.counts.live} live · ${d.counts.building} building${client ? ` · ${d.clients.find((c) => c.key === client)?.name ?? ''}` : ''}` : 'Every campaign, every client'}
      sub="What needs action first. Everything else is one tap deeper."
      right={<IconButton icon="refresh" label="Refresh" onClick={() => load(true)} className={cx('border border-line bg-surface', busy && '[&_svg]:animate-spin')} />} />
  );
  return (
    <div>
      {header}
      <ChannelSwitch channels={channels} on={channel} onPick={(k) => route(k === 'email' ? view : k)} />
      {error && <div className="mt-4"><ErrorBox error={error} retry={() => load()} /></div>}
      {!d && !error && <div className="mt-4"><PageSkeleton kind="list" /></div>}
      {d && ch && !ch.live && (
        <Card className="mt-4"><Empty icon="pause" title="Channel paused" sub={ch.reason} /></Card>
      )}
      {d && channel === 'email' && <EmailBody d={d} view={view} client={client} route={route} />}
    </div>
  );
}

function ChannelSwitch({ channels, on, onPick }: { channels: Channel[]; on: string; onPick: (k: string) => void }) {
  const list = channels.length ? channels : [{ key: 'email', label: 'Email', live: true, reason: '' }, { key: 'linkedin', label: 'LinkedIn', live: false, reason: '' }, { key: 'caller', label: 'AI caller', live: false, reason: '' }] as Channel[];
  return (
    <div role="tablist" aria-label="Channel" className="grid grid-cols-3 gap-1 rounded-xl border border-line bg-sunken p-1 sm:inline-grid sm:w-auto">
      {list.map((c) => (
        <button key={c.key} role="tab" aria-selected={on === c.key} onClick={() => onPick(c.key)}
          className={cx('flex min-h-10 items-center justify-center gap-1.5 rounded-lg px-3 text-sm font-semibold transition', on === c.key ? 'bg-surface text-fg shadow-card' : 'text-muted hover:text-fg')}>
          {c.label}{!c.live && <span className="text-xs font-medium text-faint">paused</span>}
        </button>
      ))}
    </div>
  );
}

function EmailBody({ d, view, client, route }: { d: CampaignList; view: View; client: string; route: (v: string, c?: string) => void }) {
  const [allNotes, setAllNotes] = useState(false);
  const rows = useMemo(() => {
    if (view === 'action') return d.rows.filter((r) => r.needs.length);
    if (view === 'live') return d.rows.filter((r) => r.group === 'live').sort((a, b) => b.progress - a.progress || a.name.localeCompare(b.name));
    if (view === 'building') return d.rows.filter((r) => r.group === 'building').sort((a, b) => stepIndex(b) - stepIndex(a) || Date.parse(a.lastChange ?? '') - Date.parse(b.lastChange ?? ''));
    return [...d.rows].sort((a, b) => Number(a.group === 'live') - Number(b.group === 'live') || stepIndex(b) - stepIndex(a) || b.progress - a.progress);
  }, [d, view]);
  const count = (k: View) => (k === 'action' ? d.counts.action : k === 'live' ? d.counts.live : k === 'building' ? d.counts.building : d.counts.live + d.counts.building);
  const notes = allNotes ? d.notes : d.notes.slice(0, 2);
  return (
    <>
      {d.notes.length > 0 && (
        <div className="mt-4">
          <NoteList notes={notes} />
          {d.notes.length > 2 && <button onClick={() => setAllNotes(!allNotes)} className="mt-1.5 min-h-9 text-sm font-semibold text-accent-ink hover:underline">{allNotes ? 'Show fewer notes' : `Show ${d.notes.length - 2} more data note${d.notes.length - 2 === 1 ? '' : 's'}`}</button>}
        </div>
      )}
      <div role="tablist" aria-label="Campaign views" className="mt-4 grid grid-cols-4 gap-1 sm:flex">
        {CAMPAIGN_VIEWS.map((x) => {
          const on = x.key === view, n = count(x.key);
          return (
            <button key={x.key} role="tab" aria-selected={on} onClick={() => route(x.key)}
              className={cx('flex min-h-11 min-w-0 items-center justify-center gap-1.5 rounded-xl px-2 text-sm font-semibold transition sm:px-3.5', on ? 'bg-ink text-ink-fg shadow-card' : 'text-muted hover:bg-hover hover:text-fg')}>
              <span className="truncate sm:hidden">{x.short}</span><span className="hidden sm:inline">{x.label}</span>
              {x.key !== 'pipeline' && <span className={cx('tabular rounded-full px-1.5 text-xs', on ? 'bg-ink-fg/15' : 'border border-line bg-sunken text-fg-2', x.key === 'action' && n > 0 && !on && 'border-transparent bg-accent text-accent-fg')}>{n}</span>}
            </button>
          );
        })}
      </div>
      {d.clients.length > 1 && (
        <div aria-label="Filter by client" className="mt-3 flex flex-wrap gap-1.5">
          <Chip on={!client} onClick={() => route(view, '')}>All clients</Chip>
          {d.clients.map((c) => <Chip key={c.key} on={client === c.key} onClick={() => route(view, client === c.key ? '' : c.key)}>{c.name} <span className="tabular opacity-70">{c.count}</span></Chip>)}
        </div>
      )}
      <div className="mt-4">
        {view === 'action' && <NeedsList rows={rows} showClient={!client} />}
        {view === 'live' && <LiveList rows={rows} showClient={!client} />}
        {view === 'building' && <BuildingList rows={rows} showClient={!client} />}
        {view === 'pipeline' && <Pipeline rows={rows} showClient={!client} />}
      </div>
      <p className="mt-4 text-xs text-muted">
        From Airtable (Campaigns, Lead Lists) and the engine, read {timeAgo(d.readAt) || 'just now'}; kept for 1 minute.
        Bounce watch over {d.limits.watch}% · pause over {d.limits.pause}% · stuck = no stage change in {d.limits.stuckDays} days · low = under {Math.round(d.limits.lowShare * 100)}% of the agency average ({d.agencyPerThousand ?? 'UNKNOWN'} interested per 1,000) on {num(d.limits.minSentToJudge)}+ sent.
      </p>
    </>
  );
}

const STEP_ORDER = ['list', 'copy', 'review', 'launch', 'live', 'sixty', 'next'];
const stepIndex = (r: CampaignRow) => (r.now ? STEP_ORDER.indexOf(r.now.key) : 7);

function Chip({ on, onClick, children }: { on: boolean; onClick: () => void; children: ReactNode }) {
  return <button onClick={onClick} aria-pressed={on} className={cx('inline-flex min-h-9 max-w-full items-center gap-1.5 truncate rounded-full border px-3 text-sm font-medium transition', on ? 'border-accent bg-accent-soft text-accent-ink' : 'border-line bg-surface text-fg-2 hover:bg-hover')}>{children}</button>;
}
function NeedPill({ kind }: { kind: NeedKind }) { return <Pill tone={NEED[kind].tone}>{NEED[kind].label}</Pill>; }

function NeedsList({ rows, showClient }: { rows: CampaignRow[]; showClient: boolean }) {
  if (!rows.length) return <Card><Empty icon="check" tone="good" title="Nothing needs action" sub="No bounce over 2.5%, nothing stuck, nothing at 60% without a next plan." /></Card>;
  return (
    <Card className="overflow-hidden p-0">
      <ul className="divide-y divide-line">
        {rows.map((r) => {
          const top = r.needs[0];
          return (
            <li key={r.id}>
              <button onClick={() => go(`campaigns/${r.id}`)} className="group flex w-full items-start gap-3 px-4 py-3.5 text-left transition hover:bg-hover sm:px-5">
                <Avatar name={top.agent} size="sm" className="mt-0.5" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 break-words text-[15px] font-semibold leading-snug text-fg">{r.name}</div>
                    <span className="shrink-0"><NeedPill kind={top.kind} /></span>
                  </div>
                  <div className="mt-0.5 text-sm leading-snug text-fg-2">{top.text}</div>
                  <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-xs text-muted">
                    <span className="font-medium text-fg-2">{top.agent}</span>
                    {showClient && r.client && <Pill>{r.client}</Pill>}
                    {r.group === 'live' ? <span className="tabular">{pct(r.progress)} sent</span> : r.now && <span>{r.now.label}</span>}
                    {r.needs.slice(1).map((x) => <NeedPill key={x.kind} kind={x.kind} />)}
                  </div>
                </div>
                <Icon name="chevronRight" size={18} className="mt-1 text-faint group-hover:text-muted" />
              </button>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}

function Bar({ v }: { v: number }) {
  return <div className="h-1.5 w-full overflow-hidden rounded-full bg-line" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(v * 100)} aria-label="Leads used"><div className={cx('h-full rounded-full', v >= 0.6 ? 'bg-accent' : 'bg-line-strong')} style={{ width: `${Math.min(100, Math.round(v * 100))}%` }} /></div>;
}
const bounceTone = (r: CampaignRow) => (r.flag === 'pause' ? 'text-bad' : r.flag === 'watch' ? 'text-warn' : 'text-fg-2');

function LiveList({ rows, showClient }: { rows: CampaignRow[]; showClient: boolean }) {
  if (!rows.length) return <Card><Empty icon="megaphone" title="No live campaigns" sub="No campaign has Campaign Status Active." /></Card>;
  return (
    <>
      <div className="space-y-2 md:hidden">
        {rows.map((r) => (
          <Card key={r.id} onClick={() => go(`campaigns/${r.id}`)} className="p-4">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0"><div className="break-words text-[15px] font-semibold text-fg">{r.name}</div>{showClient && r.client && <div className="text-xs text-muted">{r.client}</div>}</div>
              <div className="flex shrink-0 flex-wrap justify-end gap-1">{r.needs.slice(0, 2).map((x) => <NeedPill key={x.kind} kind={x.kind} />)}</div>
            </div>
            <div className="mt-2 flex items-center gap-3"><Bar v={r.progress} /><span className="tabular w-10 shrink-0 text-right text-xs font-semibold text-fg-2">{pct(r.progress)}</span></div>
            <div className="mt-2 grid grid-cols-4 gap-1 text-xs text-muted">
              <span><span className="tabular font-semibold text-fg-2">{num(r.sent)}</span> sent</span>
              <span>bounce <span className={cx('tabular font-semibold', bounceTone(r))}>{r.bounce}%</span></span>
              <span><span className="tabular font-semibold text-fg-2">{r.perThousand ?? '–'}</span> int./1k</span>
              <span><span className="tabular font-semibold text-fg-2">{r.booked}</span> booked</span>
            </div>
          </Card>
        ))}
      </div>
      <Card className="hidden overflow-hidden p-0 md:block">
        <table className="w-full table-fixed text-left text-sm">
          <thead className="border-b border-line bg-sunken text-xs text-muted">
            <tr>
              <th className="px-5 py-2.5 font-medium">Campaign</th><th className="w-40 px-3 py-2.5 font-medium">Leads used</th>
              <th className="w-20 px-3 py-2.5 text-right font-medium">Sent</th><th className="w-20 px-3 py-2.5 text-right font-medium">Bounce</th>
              <th className="w-24 px-3 py-2.5 text-right font-medium">Int. / 1k</th><th className="w-20 px-3 py-2.5 text-right font-medium">Booked</th><th className="w-36 px-5 py-2.5 font-medium"><span className="sr-only">Needs</span></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {rows.map((r) => (
              <tr key={r.id} onClick={() => go(`campaigns/${r.id}`)} className="cursor-pointer transition hover:bg-hover">
                <td className="px-5 py-3"><a href={`#/campaigns/${r.id}`} className="block truncate font-medium text-fg">{r.name}</a>{showClient && r.client && <div className="truncate text-xs text-muted">{r.client}</div>}</td>
                <td className="px-3 py-3"><div className="flex items-center gap-2"><Bar v={r.progress} /><span className="tabular w-9 shrink-0 text-right text-xs font-semibold text-fg-2">{pct(r.progress)}</span></div></td>
                <td className="tabular px-3 py-3 text-right text-fg-2">{num(r.sent)}</td>
                <td className={cx('tabular px-3 py-3 text-right font-semibold', bounceTone(r))}>{r.bounce}%</td>
                <td className="tabular px-3 py-3 text-right text-fg-2">{r.perThousand ?? '–'}</td>
                <td className="tabular px-3 py-3 text-right text-fg-2">{r.booked}</td>
                <td className="px-5 py-3"><div className="flex flex-wrap justify-end gap-1">{r.needs.slice(0, 2).map((x) => <NeedPill key={x.kind} kind={x.kind} />)}</div></td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </>
  );
}

function BuildingList({ rows, showClient }: { rows: CampaignRow[]; showClient: boolean }) {
  if (!rows.length) return <Card><Empty icon="layers" title="Nothing being built" sub="No campaign is between a lead list and launch." /></Card>;
  return (
    <Card className="overflow-hidden p-0">
      <ul className="divide-y divide-line">
        {rows.map((r) => (
          <li key={r.id}>
            <button onClick={() => go(`campaigns/${r.id}`)} className="group flex w-full items-start gap-3 px-4 py-3.5 text-left transition hover:bg-hover sm:px-5">
              <div className="min-w-0 flex-1">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 break-words text-[15px] font-semibold leading-snug text-fg">{r.name}</div>
                  {r.needs[0] && <span className="shrink-0"><NeedPill kind={r.needs[0].kind} /></span>}
                </div>
                <div className="mt-0.5 text-sm text-fg-2">{r.now ? <><span className="font-medium">{r.now.label}</span>{r.now.note && <span className="text-muted"> · {r.now.note}</span>}</> : 'No step'}</div>
                <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-muted">
                  {showClient && r.client && <Pill>{r.client}</Pill>}
                  {r.lastChange && <span>changed {timeAgo(r.lastChange)}</span>}
                  {r.now && <span>· {r.needs[0]?.agent ?? ownerOf(r.now.key)}</span>}
                </div>
                <Steps steps={r.steps} small className="mt-2.5" />
              </div>
              <Icon name="chevronRight" size={18} className="mt-1 text-faint group-hover:text-muted" />
            </button>
          </li>
        ))}
      </ul>
    </Card>
  );
}
const ownerOf = (k: string) => (k === 'list' ? 'Scout' : k === 'copy' ? 'Scribe' : 'Atlas');

function Pipeline({ rows, showClient }: { rows: CampaignRow[]; showClient: boolean }) {
  if (!rows.length) return <Card><Empty icon="layers" title="No campaigns" sub="Nothing live or being built." /></Card>;
  return (
    <Card className="overflow-hidden p-0">
      <div className="hidden grid-cols-[minmax(0,14rem)_minmax(0,1fr)] gap-4 border-b border-line bg-sunken px-5 py-2.5 text-xs font-medium text-muted md:grid">
        <span>Campaign</span>
        <span className="grid grid-cols-7 gap-1 text-center">{['List', 'Copy', 'Review', 'Launch', 'Live', '60%', 'Next'].map((x) => <span key={x}>{x}</span>)}</span>
      </div>
      <ul className="divide-y divide-line">
        {rows.map((r) => (
          <li key={r.id}>
            <button onClick={() => go(`campaigns/${r.id}`)} className="grid w-full gap-2 px-4 py-3 text-left transition hover:bg-hover sm:px-5 md:grid-cols-[minmax(0,14rem)_minmax(0,1fr)] md:items-center md:gap-4">
              <div className="min-w-0">
                <div className="truncate text-sm font-semibold text-fg">{r.name}</div>
                <div className="truncate text-xs text-muted">{[showClient ? r.client : '', r.now ? `${r.now.label}${r.now.note ? ` · ${r.now.note}` : ''}` : 'done'].filter(Boolean).join(' · ')}</div>
              </div>
              <Steps steps={r.steps} small hideLabelsOnDesktop />
            </button>
          </li>
        ))}
      </ul>
    </Card>
  );
}

const SHORT: Record<string, string> = { list: 'List', copy: 'Copy', review: 'Review', launch: 'Launch', live: 'Live', sixty: '60%', next: 'Next' };
const STATE_WORD: Record<string, string> = { done: 'done', now: 'now', todo: 'not yet', bad: 'failed' };
/** One row of steps: list → copy → client review → launch → live → 60% → next. */
function Steps({ steps, small, className, hideLabelsOnDesktop }: { steps: CampaignStep[]; small?: boolean; className?: string; hideLabelsOnDesktop?: boolean }) {
  return (
    <ol aria-label="Steps" className={cx('grid grid-cols-7 gap-1', className)}>
      {steps.map((x) => (
        <li key={x.key} title={`${x.label}: ${STATE_WORD[x.state]}${x.note ? ` (${x.note})` : ''}`} className="min-w-0">
          <span className={cx('block rounded-full', small ? 'h-1.5' : 'h-2', x.state === 'done' ? 'bg-accent' : x.state === 'now' ? 'bg-warn' : x.state === 'bad' ? 'bg-bad' : 'bg-line')} />
          <span className={cx('mt-1 block truncate text-center', small ? 'text-[10px]' : 'text-xs', x.state === 'now' || x.state === 'bad' ? 'font-semibold text-fg' : 'text-muted', hideLabelsOnDesktop && 'md:sr-only')}>{SHORT[x.key]}</span>
          <span className="sr-only">{STATE_WORD[x.state]}</span>
        </li>
      ))}
    </ol>
  );
}

// ---------- One campaign ----------
function CampaignPage({ id }: { id: string }) {
  const [d, setD] = useState<CampaignDetail | null>(null);
  const [error, setError] = useState('');
  const load = useCallback(() => { setError(''); api<CampaignDetail>(`/campaigns/${encodeURIComponent(id)}`).then(setD).catch((e) => setError(e.message)); }, [id]);
  useEffect(load, [load]);
  const back = <BackLink label="Campaigns" onClick={() => (window.history.length > 1 ? window.history.back() : go('campaigns'))} />;
  if (error) return <>{back}<ErrorBox error={error} retry={load} /></>;
  if (!d) return <>{back}<PageSkeleton kind="list" /></>;
  const c = d.campaign;
  const statusTone = c.group === 'live' ? 'good' : c.group === 'building' ? 'info' : 'plain';
  return (
    <div>
      {back}
      <Card className="sm:p-7">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <h1 className="break-words text-[24px] font-bold leading-tight tracking-tight sm:text-[26px]">{c.name}</h1>
            <div className="mt-2 flex flex-wrap items-center gap-1.5 text-sm text-muted">
              {c.client ? <button onClick={() => go(`clients/${c.clientRec}`)} className="min-h-8 font-medium text-accent-ink hover:underline">{c.client}</button> : <span className="text-warn">No client link</span>}
              <Pill tone={statusTone}>{c.status || 'No status'}</Pill>
              {c.stage && <Pill>{c.stage}</Pill>}
              {d.detail.skipBouncePause && <Pill tone="warn">Skip Bounce Pause on</Pill>}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2 sm:flex sm:shrink-0">
            <LinkButton href={d.links.airtable} icon="database">Open in Airtable</LinkButton>
            {d.links.bison && <LinkButton href={d.links.bison} icon="external">EmailBison</LinkButton>}
          </div>
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
        <Stat label="Replies" v={num(c.replies)} />
        <Stat label="Interested" v={num(c.interested)} sub={c.perThousand !== null ? `${c.perThousand} per 1,000` : undefined} />
        <Stat label="Booked" v={num(c.booked)} />
        <Stat label="Bounce" v={`${c.bounce}%`} tone={c.flag === 'pause' ? 'bad' : c.flag === 'watch' ? 'warn' : undefined} sub={c.flag === 'pause' ? 'over 4%: pause' : c.flag === 'watch' ? 'over 2.5%: watch' : undefined} />
        <Stat label="Leads used" v={pct(c.progress)} sub={c.totalLeads ? `${num(c.contacted)} of ${num(c.totalLeads)}` : undefined} />
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
                      <div className="flex items-start justify-between gap-2"><div className="min-w-0 break-words text-[15px] font-medium text-fg">{l.name}</div><ExtLink href={l.airtableUrl} className="shrink-0 text-sm">Airtable</ExtLink></div>
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
      <p className="mt-6 text-xs text-muted">Read {timeAgo(d.readAt) || 'just now'} from Airtable and the engine; kept for 1 minute. HQ changes nothing here: use Campaign Center for its buttons.</p>
    </div>
  );
}

function LinkButton({ href, icon, children }: { href: string; icon: string; children: ReactNode }) {
  if (!/^https:\/\//i.test(href)) return null;
  return <a href={href} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center justify-center gap-2 whitespace-nowrap rounded-xl border border-line-strong bg-surface px-4 text-[15px] font-semibold text-fg transition hover:bg-hover"><Icon name={icon} size={17} strokeWidth={2.1} />{children}</a>;
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
function ActivityLog({ rows }: { rows: CampaignDetail['activity'] }) {
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

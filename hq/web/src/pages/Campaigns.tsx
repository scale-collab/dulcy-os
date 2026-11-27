// Campaign Center in HQ (Round 2 rebuild, Alex 2026-11-27): "Make it basically exactly what we have in
// Airtable (Campaign Center + Lead List Center)". The same structure as the Airtable Campaign Center
// (Engine) page, cleaner:
//   - header: Campaign Center, New campaign (Atlas plans it), Refresh;
//   - channel tabs (Email, LinkedIn, AI caller, Direct mail) and Campaigns | Lead lists;
//   - the shared active-client dropdown;
//   - the Sending accounts box (sending now, free, warming, resting, spam; capacity vs used);
//   - new campaigns being made (Atlas plans, with their approvals);
//   - campaigns by stage (Live, Launch ready, Approved, Client review, Internal review, Strategy
//     draft), each row with progress, sent, replies, interested, meetings, bounce and its inboxes.
// Tap a campaign for its page (buttons, copy, lead list, senders, history); tap a lead list for the
// Lead List Center panel. Every button is on those pages and presses the engine path the Airtable
// button presses. Everything is rendered as escaped text.
import { useCallback, useEffect, useMemo, useState } from 'react';
import { api, type CampaignListR2, type CampaignRowR2, type ChannelB3, type NeedKind, type PlansR2 } from '../api';
import { Button, Card, cx, Empty, ErrorBox, go, IconButton, PageSkeleton, PageTitle, Pill, setCount, timeAgo } from '../ui';
import { ClientPicker, rememberedClient } from '../clientPicker';
import { Select } from '../charts';
import { NoteList } from './Inbox';
import { LeadLists } from './LeadLists';
import { SendingBox } from './campaign/SendingBox';
import { NewCampaignSheet, PlansSection } from './campaign/Plans';
import { CampaignPage } from './campaign/CampaignPage';
import { LeadListPage } from './campaign/LeadListPage';
import { num, rate } from './campaign/shared';
import { Bar, NEED, Sending, StatusPill, Steps } from './campaign/bits';

const VIEWS = [
  { key: 'all', label: 'All (live + building)' }, { key: 'action', label: 'Needs action' }, { key: 'live', label: 'Live' }, { key: 'building', label: 'Building' },
] as const;
type View = (typeof VIEWS)[number]['key'];
const isView = (v?: string): v is View => VIEWS.some((x) => x.key === v);
const CHANNEL_KEYS = ['email', 'linkedin', 'caller', 'mail'];
const DEFAULT_CHANNELS: ChannelB3[] = [
  { key: 'email', label: 'Email', live: true, reason: '' }, { key: 'linkedin', label: 'LinkedIn', live: false, reason: '' },
  { key: 'caller', label: 'AI caller', live: false, reason: '' }, { key: 'mail', label: 'Direct mail', live: false, reason: 'Direct mail is not running yet.' },
];
const REC = /^rec[A-Za-z0-9]{14}$/;

const pct = (x: number) => `${Math.round(x * 100)}%`;

/**
 * #/campaigns[/<view | lists | linkedin | caller | mail>[/<client key>]]
 * #/campaigns/<campaign record>[/<tab>]   #/campaigns/list/<lead list record>
 */
export default function Campaigns({ a, b }: { a?: string; b?: string }) {
  if (a && REC.test(a)) return <CampaignPage id={a} tab={b} />;
  if (a === 'list' && b && REC.test(b)) return <LeadListPage id={b} />;
  const channel = a && CHANNEL_KEYS.includes(a) ? a : 'email';
  const client = rememberedClient('campaigns', b && b !== 'all' ? b : undefined);
  if (a === 'lists') return <Shell channel="email" section="lists" client={client} />;
  return <Shell channel={channel} section="campaigns" view={isView(a) ? a : 'all'} client={client} />;
}

function Shell({ channel, section, view = 'all', client }: { channel: string; section: 'campaigns' | 'lists'; view?: View; client: string }) {
  const [d, setD] = useState<CampaignListR2 | null>(null);
  const [plans, setPlans] = useState<PlansR2 | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [refresh, setRefresh] = useState(0);
  const [creating, setCreating] = useState(false);
  const load = useCallback((again = false) => {
    setBusy(true); setError('');
    const qs = new URLSearchParams({ ...(client ? { client } : {}), ...(again ? { refresh: '1' } : {}) });
    api<CampaignListR2>(`/campaigns?${qs}`).then((x) => { setD(x); if (!client) setCount('campaigns', x.counts.action); }).catch((e) => setError(e.message)).finally(() => setBusy(false));
    api<PlansR2>(`/campaigns/plans?${new URLSearchParams(client ? { client } : {})}`).then(setPlans).catch(() => setPlans(null));
  }, [client]);
  useEffect(() => load(), [load]);
  const pickClient = useCallback((k: string) => go(`campaigns/${section === 'lists' ? 'lists' : view}${k ? `/${encodeURIComponent(k)}` : ''}`), [section, view]);
  const channels = d?.channels?.length ? d.channels : DEFAULT_CHANNELS;
  const ch = channels.find((x) => x.key === channel);
  const clientName = d?.clients.find((x) => x.key === client)?.name ?? '';
  const options = (d?.clients ?? []).map((x) => ({ key: x.key, name: x.name, count: x.count }));
  return (
    <div>
      <PageTitle title={section === 'lists' ? 'Lead List Center' : 'Campaign Center'}
        kicker={d ? `${d.counts.live} live · ${d.counts.building} building${clientName ? ` · ${clientName}` : ''}` : 'Every campaign, every active client'}
        sub={section === 'lists' ? 'Build, verify, enrich and check lead lists. Tap a list for its steps and buttons.' : 'Plan, approve, launch and watch campaigns. Tap a campaign for its buttons, copy, lead list and inboxes.'}
        right={(
          <div className="flex items-center gap-2">
            {section === 'campaigns' && <Button tone="primary" icon="plus" onClick={() => setCreating(true)} disabled={!plans?.canAct} title={plans?.canAct ? 'Atlas plans a new campaign for a client' : 'Only Alex (owner) starts a campaign'}>New campaign</Button>}
            <IconButton icon="refresh" label="Refresh" onClick={() => { setRefresh((x) => x + 1); load(true); }} className={cx('border border-line bg-surface', busy && '[&_svg]:animate-spin')} />
          </div>
        )} />
      <div role="tablist" aria-label="Channel" className="grid grid-cols-4 gap-1 rounded-xl border border-line bg-sunken p-1 sm:inline-grid sm:grid-flow-col sm:auto-cols-fr">
        {channels.map((x) => (
          <button key={x.key} role="tab" aria-selected={channel === x.key} onClick={() => go(x.key === 'email' ? 'campaigns' : `campaigns/${x.key}`)}
            className={cx('flex min-h-10 min-w-0 items-center justify-center gap-1.5 rounded-lg px-1.5 text-[13px] font-semibold transition sm:px-4 sm:text-sm', channel === x.key ? 'bg-surface text-fg shadow-card' : 'text-muted hover:text-fg')}>
            <span className="truncate">{x.label}</span>{!x.live && <span aria-hidden="true" className="h-1.5 w-1.5 shrink-0 rounded-full bg-dot-idle" />}{!x.live && <span className="sr-only">(not running)</span>}
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
                <button key={k} role="tab" aria-selected={section === k} onClick={() => go(`campaigns/${k === 'lists' ? 'lists' : 'all'}${client ? `/${encodeURIComponent(client)}` : ''}`)}
                  className={cx('min-h-9 rounded-lg px-4 text-sm font-semibold transition', section === k ? 'bg-ink text-ink-fg shadow-card' : 'text-muted hover:text-fg')}>{label}</button>
              ))}
            </div>
            <ClientPicker screen="campaigns" value={client} options={options} onChange={pickClient} />
          </div>
          {section === 'campaigns' && <SendingBox client={client} refresh={refresh} onPick={pickClient} />}
          {section === 'campaigns' && <PlansSection d={plans} onDone={() => load(true)} />}
          {section === 'campaigns' && !d && !error && <div className="mt-4"><PageSkeleton kind="list" /></div>}
          {section === 'campaigns' && d && <CampaignList d={d} view={view} client={client} />}
          {section === 'lists' && <LeadLists client={client} refresh={refresh} />}
        </>
      )}
      {creating && <NewCampaignSheet clients={options} client={client} atlasOn={!!plans?.atlasOn} dryRun={!!plans?.planDryRun} onClose={() => setCreating(false)} onDone={() => load(true)} />}
    </div>
  );
}

const HOW: Record<string, string> = { well: 'Performing well', pace: 'On pace', time: 'Needs more time', look: 'Needs a look' };
/** Today links here with ?how=<group> (Performing well / On pace / Needs more time / Needs a look). */
const howFromHash = () => { const h = new URLSearchParams(window.location.hash.split('?')[1] ?? '').get('how') ?? ''; return HOW[h] ? h : ''; };

function CampaignList({ d, view, client }: { d: CampaignListR2; view: View; client: string }) {
  const how = howFromHash();
  const [q, setQ] = useState('');
  const [tests, setTests] = useState(false);
  const [allNotes, setAllNotes] = useState(false);
  const rows = useMemo(() => {
    const term = q.trim().toLowerCase();
    const base = (view === 'action' ? d.rows.filter((r) => r.needs.length) : view === 'live' ? d.rows.filter((r) => r.group === 'live') : view === 'building' ? d.rows.filter((r) => r.group === 'building') : d.rows)
      .filter((r) => (tests || !r.test) && (!how || r.how === how));
    return term ? base.filter((r) => `${r.name} ${r.client} ${r.stage} ${r.approach}`.toLowerCase().includes(term)) : base;
  }, [d, view, q, tests, how]);
  const testCount = d.rows.filter((r) => r.test).length;
  const count = (k: View) => (k === 'action' ? d.counts.action : k === 'live' ? d.counts.live : k === 'building' ? d.counts.building : d.counts.live + d.counts.building);
  const notes = allNotes ? d.notes : d.notes.slice(0, 2);
  const sections = (d.sections ?? []).map((s) => ({ ...s, rows: rows.filter((r) => r.section === s.key) })).filter((s) => s.rows.length);
  return (
    <>
      <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
        <Select label="Show" value={view} onChange={(v) => go(`campaigns/${v}${client ? `/${encodeURIComponent(client)}` : ''}`)} options={VIEWS.map((x) => ({ value: x.key, label: `${x.label} (${count(x.key)})` }))} />
        <label className="relative min-w-0 flex-1 sm:max-w-xs">
          <span className="sr-only">Search campaigns</span>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search campaigns" maxLength={100}
            className="min-h-10 w-full rounded-xl border border-line bg-surface px-3.5 text-sm text-fg outline-none placeholder:text-faint focus:border-accent focus:ring-4 focus:ring-accent-soft" />
        </label>
        {how && <button onClick={() => go(`campaigns/${view}${client ? `/${encodeURIComponent(client)}` : ''}`)} className="inline-flex min-h-10 items-center gap-1.5 rounded-xl bg-accent-soft px-3 text-sm font-semibold text-accent-ink" title="Show every campaign again">From Today: {HOW[how]} <span aria-hidden="true">✕</span><span className="sr-only">clear</span></button>}
        {testCount > 0 && <label className="inline-flex min-h-10 items-center gap-2 text-sm text-fg-2"><input type="checkbox" checked={tests} onChange={(e) => setTests(e.target.checked)} className="h-4 w-4 accent-[var(--accent)]" />Show tests ({testCount})</label>}
      </div>
      {d.notes.length > 0 && (
        <div className="mt-4">
          <NoteList notes={notes} />
          {d.notes.length > 2 && <button onClick={() => setAllNotes(!allNotes)} className="mt-1.5 min-h-9 text-sm font-semibold text-accent-ink hover:underline">{allNotes ? 'Show fewer notes' : `Show ${d.notes.length - 2} more data note${d.notes.length - 2 === 1 ? '' : 's'}`}</button>}
        </div>
      )}
      {!sections.length ? (
        <Card className="mt-4"><Empty icon={view === 'action' ? 'check' : 'megaphone'} tone={view === 'action' ? 'good' : 'plain'} title={q ? 'No match' : view === 'action' ? 'Nothing needs action' : 'No campaigns here'} sub={q ? `Nothing matches "${q}".` : 'Pick another view or client, or start a New campaign.'} /></Card>
      ) : sections.map((s) => (
        <section key={s.key} className="mt-6">
          <h2 className="mb-2 flex items-baseline gap-2 text-[15px] font-semibold text-fg">{s.label}<span className="tabular text-sm font-normal text-muted">{s.rows.length}</span></h2>
          <CampaignCards rows={s.rows} showClient={!client} />
          <CampaignTable rows={s.rows} showClient={!client} live={s.key === 'live'} />
        </section>
      ))}
      <p className="mt-4 text-xs text-muted">
        From Airtable (Campaigns) and the engine, read {timeAgo(d.readAt) || 'just now'}; kept 1 minute. Bounce watch over {d.limits.watch}% · pause over {d.limits.pause}% ·
        agency average {d.agencyPerThousand ?? 'UNKNOWN'} interested per 1,000 sent.
      </p>
    </>
  );
}

function NeedPill({ kind }: { kind: NeedKind }) { return <Pill tone={NEED[kind].tone}>{NEED[kind].label}</Pill>; }
const bounceTone = (r: CampaignRowR2) => (r.flag === 'pause' ? 'text-bad' : r.flag === 'watch' ? 'text-warn' : 'text-fg-2');

function CampaignCards({ rows, showClient }: { rows: CampaignRowR2[]; showClient: boolean }) {
  return (
    <ul className="space-y-2 md:hidden">
      {rows.map((r) => (
        <li key={r.id}>
          <Card onClick={() => go(`campaigns/${r.id}`)} className="p-4">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="break-words text-[15px] font-semibold leading-snug text-fg">{r.name}</div>
                <div className="mt-0.5 flex flex-wrap gap-x-1.5 text-xs text-muted">{showClient && r.client && <span>{r.client}</span>}{r.stage && <span>· {r.stage}</span>}{r.test && <span>· test</span>}</div>
              </div>
              <StatusPill r={r} />
            </div>
            {r.needs[0] && <div className="mt-2 flex items-start gap-2 text-sm text-fg-2"><NeedPill kind={r.needs[0].kind} /><span className="min-w-0">{r.needs[0].text}</span></div>}
            {r.group === 'live' ? (
              <>
                <div className="mt-2.5 flex items-center gap-3"><Bar v={r.progress} /><span className="tabular w-10 shrink-0 text-right text-xs font-semibold text-fg-2">{pct(r.progress)}</span></div>
                <div className="mt-2 grid grid-cols-5 gap-1 text-xs text-muted">
                  <span><span className="tabular block font-semibold text-fg-2">{num(r.sent)}</span>sent</span>
                  <span><span className="tabular block font-semibold text-fg-2">{num(r.replies)}</span>replies</span>
                  <span><span className="tabular block font-semibold text-fg-2">{num(r.interested)}</span>interested</span>
                  <span><span className="tabular block font-semibold text-fg-2">{num(r.booked)}</span>meetings</span>
                  <span><span className={cx('tabular block font-semibold', bounceTone(r))}>{r.bounce}%</span>bounce</span>
                </div>
              </>
            ) : <Steps steps={r.steps} small className="mt-2.5" />}
            <div className="mt-2 text-xs"><Sending n={r.accounts} s={r.sending} compact /></div>
          </Card>
        </li>
      ))}
    </ul>
  );
}

function CampaignTable({ rows, showClient, live }: { rows: CampaignRowR2[]; showClient: boolean; live: boolean }) {
  return (
    <Card className="hidden overflow-hidden p-0 md:block">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[1040px] table-fixed text-left text-sm">
          <thead className="border-b border-line bg-sunken text-xs text-muted">
            <tr>
              <th className="w-[30%] px-5 py-2.5 font-medium">Campaign</th><th className="w-28 px-3 py-2.5 font-medium">Status</th><th className="w-36 px-3 py-2.5 font-medium">{live ? 'Progress' : 'Step now'}</th>
              <th className="w-20 px-3 py-2.5 text-right font-medium">Sent</th><th className="w-24 px-3 py-2.5 text-right font-medium">Replies</th><th className="w-24 px-3 py-2.5 text-right font-medium">Interested</th>
              <th className="w-20 px-3 py-2.5 text-right font-medium">Meetings</th><th className="w-20 px-3 py-2.5 text-right font-medium">Bounce</th><th className="w-44 px-5 py-2.5 font-medium">Sending inboxes</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {rows.map((r) => (
              <tr key={r.id} onClick={() => go(`campaigns/${r.id}`)} className="cursor-pointer align-top transition hover:bg-hover">
                <td className="px-5 py-3">
                  <a href={`#/campaigns/${r.id}`} className="block break-words font-semibold text-fg">{r.name}</a>
                  <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-muted">{showClient && r.client && <span>{r.client}</span>}{r.stage && <Pill>{r.stage}</Pill>}{r.test && <Pill>test</Pill>}</div>
                  {r.needs[0] && <div className="mt-1.5 flex items-start gap-2 text-xs text-fg-2"><NeedPill kind={r.needs[0].kind} /><span className="min-w-0">{r.needs[0].text}</span></div>}
                </td>
                <td className="px-3 py-3"><StatusPill r={r} /></td>
                <td className="px-3 py-3">{r.group === 'live'
                  ? <><div className="flex items-center gap-2 pt-1"><Bar v={r.progress} /><span className="tabular w-9 shrink-0 text-right text-xs font-semibold text-fg-2">{pct(r.progress)}</span></div>{r.totalLeads > 0 && <div className="mt-1 text-xs text-muted">{num(r.contacted)} of {num(r.totalLeads)} leads</div>}</>
                  : <><Steps steps={r.steps} small /><div className="mt-1 text-xs text-muted">{r.now ? `${r.now.label}${r.now.note ? `: ${r.now.note}` : ''}` : '–'}</div></>}</td>
                <td className="tabular px-3 py-3 text-right text-fg-2">{num(r.sent)}</td>
                <td className="tabular px-3 py-3 text-right text-fg-2">{num(r.replies)}<div className="text-xs text-muted">{rate(r.replies, r.contacted)}</div></td>
                <td className="tabular px-3 py-3 text-right text-fg-2">{num(r.interested)}<div className="text-xs text-muted">{r.replies ? rate(r.interested, r.replies) : '–'}</div></td>
                <td className="tabular px-3 py-3 text-right text-fg-2">{num(r.booked)}</td>
                <td className={cx('tabular px-3 py-3 text-right', bounceTone(r))}>{r.bounce}%</td>
                <td className="px-5 py-3 text-xs"><Sending n={r.accounts} s={r.sending} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}


import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { api, type AgentTask, type Client, type ClientCampaign, type ClientDetailResults, type InboxTab, type User } from '../api';
import { Avatar, BackLink, Button, Card, cx, dueLabel, ErrorBox, go, Icon, Label, PageSkeleton, Pill, SectionHeader, timeAgo, usd } from '../ui';
import { dealLine, HealthPill, InsightLines, num, pct1, WINDOW_LABEL } from './Clients';
import { InboxPanel, INBOX_TABS } from './Inbox';
import ReplierPanel from './Replier';
import { FixItButton } from '../fixIt';
import { slashDate } from '../dates';

interface Detail {
  client: Client;
  activity: { id: string; event: string; when: string; agent: string; type: string; details: string }[];
  tasks: AgentTask[];
  decisions: { id: string; title: string; agent: string; pile: string; created: string }[];
  results: ClientDetailResults;
  readAt: string;
}
const pct = (x: number) => `${Math.round(x * 100)}%`;

const HUB_TABS = [{ key: 'overview', label: 'Overview', icon: 'briefcase' }, { key: 'inbox', label: 'Inbox', icon: 'inbox' }] as const;

/** Ask Atlas: Chat opens on Atlas with a ready question (Chat reads the draft once, on open). */
function askAtlas(name: string) {
  try { sessionStorage.setItem('hq:chat-draft', `How is ${name}'s health?`); } catch { /* private mode */ }
  go('chat/Atlas');
}

/**
 * #/clients/<id>[/inbox[/<inbox tab>]]. #/clients/<id>/replier still opens the AI replier settings on
 * their own (moved out of the client page, Alex 2026-11-27; Inbox links there).
 */
export default function ClientPage({ id, user, tab, sub }: { id: string; user: User; tab?: string; sub?: string }) {
  const [d, setD] = useState<Detail | null>(null);
  const [error, setError] = useState('');
  const load = useCallback(() => { setError(''); api<Detail>(`/clients/${encodeURIComponent(id)}`).then(setD).catch((e) => setError(e.message)); }, [id]);
  useEffect(load, [load]);
  if (tab === 'replier') {
    return <><BackLink label={d?.client.name ?? 'Client'} onClick={() => go(`clients/${id}`)} /><h1 className="mb-4 text-[22px] font-bold tracking-tight">AI replier settings{d ? ` · ${d.client.name}` : ''}</h1><ReplierPanel clientId={id} /></>;
  }
  const back = <BackLink label="Clients" onClick={() => go('clients')} />;
  if (error) return <>{back}<ErrorBox error={error} retry={load} /></>;
  if (!d) return <>{back}<PageSkeleton kind="list" /></>;
  const c = d.client;
  const owner = user.role === 'owner';

  return (
    <div>
      {back}
      <Card className="sm:p-7">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-[26px] font-bold leading-tight tracking-tight">{c.name}</h1>
              <HealthPill c={c} />
            </div>
            <div className="mt-1 text-sm text-muted">
              {[c.internal ? 'Dulcy itself' : c.dealLabel, c.startDate ? `paying since ${c.startDate}` : '', !c.active && c.endDate ? `ended ${c.endDate}` : '', !c.active && c.inactiveReason ? c.inactiveReason : '', c.kpi ? `KPI ${c.kpi} meetings/mo (${c.kpiSource})` : 'KPI UNKNOWN'].filter(Boolean).join(' · ')}
            </div>
            <div className="mt-1 text-xs text-muted">Workspaces: {c.workspaces.map((w) => `${w.name} (${w.status || 'no status'}${w.bisonId ? `, #${w.bisonId}` : ''})`).join(' · ')}</div>
          </div>
          <Button icon="message" onClick={() => askAtlas(c.name)} className="w-full sm:w-auto">Ask Atlas</Button>
        </div>
        {c.insight && <InsightLines i={c.insight} className="mt-5 rounded-xl bg-sunken px-4 py-3 text-[15px]" />}
        {c.insight && c.active && c.health !== 'safe' && /^(Atlas|Echo):/.test(c.insight.decision) && (
          <div className="mt-3"><FixItButton agent={c.insight.decision.split(':')[0]} title={`${c.name}: ${c.insight.decision.split(':').slice(1).join(':').trim()}`} detail={`${c.insight.problem} ${c.insight.support}`} client={c.name} /></div>
        )}
      </Card>

      <div role="tablist" aria-label="Client sections" className="mt-5 flex gap-1 border-b border-line">
        {HUB_TABS.map((t) => {
          const on = (tab === 'inbox' ? 'inbox' : 'overview') === t.key;
          return (
            <button key={t.key} role="tab" aria-selected={on} onClick={() => go(`clients/${id}${t.key === 'overview' ? '' : `/${t.key}`}`)}
              className={cx('-mb-px flex min-h-11 items-center gap-2 border-b-2 px-3 text-sm font-semibold transition', on ? 'border-accent text-fg' : 'border-transparent text-muted hover:text-fg')}>
              <Icon name={t.icon} size={16} />{t.label}
            </button>
          );
        })}
      </div>

      {tab === 'inbox' ? (
        <div className="mt-5"><InboxPanel fixedClient={{ key: c.key, name: c.name }} tab={(INBOX_TABS.some((x) => x.key === sub) ? sub : 'approve') as InboxTab} client="" route={(t) => go(`clients/${id}/inbox/${t}`)} /></div>
      ) : <>
      <section className="mt-6">
        <SectionHeader title="Results over time" icon="trendUp" right={<span className="text-xs text-muted">EmailBison</span>} />
        <ResultsOverTime d={d} />
      </section>

      {owner && c.money && (
        <section className="mt-6">
          <SectionHeader title="Money" icon="dollar" />
          <Card className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <Money label="Deal" v={dealLine(c)} sub={c.money.dealLines.length > 1 ? c.money.dealLines.map((l) => `${l.label} ${usd(l.monthly || l.perCall)}`).join(' + ') : c.money.dealSource} />
            <Money label="LTV so far" v={usd(c.money.ltv)} sub={c.money.ltvNote} />
            <Money label={c.money.invoices.some((i) => i.late) ? 'Open invoices (some late)' : 'Coming up'} v={c.money.receivables ? usd(c.money.receivables) : '$0'} bad={c.money.invoices.some((i) => i.late)}
              sub={c.money.invoices.length ? c.money.invoices.map((i) => `${usd(i.amount)} ${i.late ? 'late' : 'due'} ${slashDate(i.due)}`).join(' · ') : c.money.invoicesSource} />
            <Money label="Months paying" v={c.money.months === null ? '–' : String(c.money.months)} sub={d.results.deals.roi ? `client ROI ${d.results.deals.roi}x` : undefined} />
            {c.money.feeNote && <div className="col-span-2 flex gap-2 text-xs text-muted sm:col-span-4"><Icon name="wrench" size={13} className="mt-0.5" />Atlas to fix in Airtable: {c.money.feeNote}</div>}
          </Card>
        </section>
      )}

      <section className="mt-6">
        <SectionHeader title="Client results" icon="star" right={<span className="text-xs text-muted">their deals, calls and onboarding</span>} />
        <ClientResults d={d} owner={owner} />
      </section>

      <section className="mt-6">
        <SectionHeader title={`Active campaigns · ${c.campaigns.length}`} icon="megaphone" right={<span className="text-xs text-muted">watch &gt; 2.5% · pause &gt; 4%</span>} />
        <Campaigns list={c.campaigns} />
      </section>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <section className="min-w-0">
          <SectionHeader title={`Waiting on you · ${d.decisions.length}`} icon="inbox" />
          <Card className="p-0">
            {d.decisions.length ? (
              <ul className="divide-y divide-line">
                {d.decisions.slice(0, 8).map((x) => (
                  <li key={x.id}>
                    <button onClick={() => go(`decisions/${x.pile}/${encodeURIComponent(c.key)}`)} className="group flex min-h-12 w-full items-center gap-3 px-5 py-3 text-left transition hover:bg-hover">
                      <Avatar name={x.agent} size="sm" />
                      <div className="min-w-0 flex-1"><div className="truncate text-[15px] font-medium text-fg">{x.title}</div><div className="text-xs text-muted">{[x.agent, x.pile, timeAgo(x.created)].filter(Boolean).join(' · ')}</div></div>
                      <Icon name="chevronRight" size={18} className="text-faint group-hover:text-muted" />
                    </button>
                  </li>
                ))}
              </ul>
            ) : <div className="px-5 py-4 text-sm text-muted">No decisions waiting for {c.name}.</div>}
          </Card>
        </section>
        <section className="min-w-0">
          <SectionHeader title={`Agent to-do · ${d.tasks.length}`} icon="grid" />
          <Card className="p-0">
            {d.tasks.length ? (
              <ul className="divide-y divide-line">
                {d.tasks.map((t) => (
                  <li key={t.id} className="flex items-start gap-3 px-5 py-3">
                    <Avatar name={t.agent} size="sm" />
                    <div className="min-w-0 flex-1"><div className="text-[15px] font-medium text-fg">{t.title}</div><div className="text-xs text-muted">{[t.agent, t.due ? dueLabel(t.due) : '', t.note || t.notes].filter(Boolean).join(' · ')}</div></div>
                  </li>
                ))}
              </ul>
            ) : <div className="px-5 py-4 text-sm text-muted">No open agent tasks.</div>}
          </Card>
        </section>
      </div>

      <section className="mt-6">
        <SectionHeader title="What happened" icon="activity" right={<span className="text-xs text-muted">Activity Log</span>} />
        <Card className="p-0">
          {d.activity.length ? (
            <ol className="px-5 py-2">
              {d.activity.map((x, i) => (
                <li key={x.id} className="relative flex gap-3 py-2.5">
                  <span aria-hidden="true" className="relative flex w-3 justify-center">
                    <span className="mt-1.5 h-2 w-2 rounded-full bg-line-strong" />
                    {i < d.activity.length - 1 && <span className="absolute top-4 -bottom-3.5 w-px bg-line" />}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="break-words text-[15px] text-fg">{x.event}</div>
                    <div className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-muted"><span>{x.agent}</span><span>{timeAgo(x.when)}</span>{x.type && <Pill>{x.type}</Pill>}</div>
                  </div>
                </li>
              ))}
            </ol>
          ) : <div className="px-5 py-4 text-sm text-muted">No Activity Log rows for this client yet.</div>}
        </Card>
      </section>
      <p className="mt-6 text-xs text-muted">Read {timeAgo(d.readAt) || 'just now'} from Airtable; kept for 5 minutes.</p>
      </>}
    </div>
  );
}

function ResultsOverTime({ d }: { d: Detail }) {
  const ws = d.results.windows;
  if (!ws.length) return <Card className="text-sm text-muted">No EmailBison numbers for this client yet (UNKNOWN).</Card>;
  const rows: [string, (r: Detail['results']['windows'][number]) => string][] = [
    ['Emails sent', (r) => num(r.sent)], ['People contacted', (r) => num(r.contacted)], ['Interested', (r) => num(r.interested)], ['Meetings booked', (r) => num(r.meetings)],
    ['Emails per meeting', (r) => num(r.emailsPerMeeting)], ['Emails per positive reply', (r) => num(r.emailsPerPositive)], ['Interested → booked', (r) => pct1(r.interestedToBooked)],
  ];
  return (
    <Card className="overflow-x-auto p-0">
      <table className="w-full min-w-[560px] text-left text-sm">
        <thead className="border-b border-line bg-sunken text-xs text-muted"><tr><th className="px-5 py-2.5 font-medium"><span className="sr-only">Number</span></th>{ws.map((r) => <th key={r.window} className="px-3 py-2.5 text-right font-medium">{WINDOW_LABEL[r.window]}{r.stale ? ' (stale)' : ''}</th>)}</tr></thead>
        <tbody className="divide-y divide-line">
          {rows.map(([label, f]) => <tr key={label}><td className="px-5 py-2.5 font-medium text-fg">{label}</td>{ws.map((r) => <td key={r.window} className="tabular px-3 py-2.5 text-right text-fg-2">{f(r)}</td>)}</tr>)}
        </tbody>
      </table>
    </Card>
  );
}

function ClientResults({ d, owner }: { d: Detail; owner: boolean }) {
  const { feedback: f, deals, onboarding } = d.results;
  return (
    <div className="grid gap-3 lg:grid-cols-3">
      <Card className="text-sm">
        <Label>Deals they closed</Label>
        <div className="tabular mt-1 text-[22px] font-bold text-fg">{deals.count}{owner && deals.total ? <span className="ml-2 text-sm font-semibold text-fg-2">{usd(deals.total)}</span> : null}</div>
        {owner && deals.roi ? <div className="text-xs text-muted">ROI {deals.roi}x on what they paid Dulcy</div> : null}
        {deals.list.length ? (
          <ul className="mt-2 space-y-1">{deals.list.slice(0, 5).map((x, i) => <li key={i} className="text-fg-2">{x.lead || 'Lead'} · {x.date}{x.type ? ` · ${x.type}` : ''}{owner && x.value ? ` · ${usd(x.value)}` : ''}</li>)}</ul>
        ) : <div className="mt-1 text-xs text-muted">None recorded in Airtable (Client Closed Deals) yet.</div>}
      </Card>
      <Card className="text-sm">
        <Label>Call feedback</Label>
        <div className="tabular mt-1 text-[22px] font-bold text-fg">{f.avgStars === null ? '–' : `${f.avgStars} ★`}<span className="ml-2 text-xs font-medium text-muted">{f.rated ? `average of ${f.rated} rated` : 'no stars yet'}</span></div>
        <div className="text-xs text-muted">{f.calls} calls: {f.qualified} qualified · {f.unqualified} unqualified · {f.noShow} no-show</div>
        {f.recent.length > 0 && <ul className="mt-2 space-y-1.5">{f.recent.slice(0, 3).map((x, i) => <li key={i} className="text-fg-2"><span className="font-medium">{x.status}</span>{x.stars ? ` · ${x.stars}★` : ''}{x.notes ? `: ${x.notes}` : ''} <span className="text-xs text-muted">{timeAgo(x.when)}</span></li>)}</ul>}
      </Card>
      <Card className="text-sm">
        <Label>Onboarding form</Label>
        {onboarding.answers.length ? (
          <dl className="mt-1 space-y-1.5">{onboarding.answers.map((a) => <div key={a.label}><dt className="text-xs text-muted">{a.label}</dt><dd className="line-clamp-3 text-fg-2">{a.text}</dd></div>)}</dl>
        ) : <div className="mt-1 text-xs text-muted">{onboarding.linked ? 'Linked, but no answers read.' : 'No onboarding form linked in Airtable.'}</div>}
      </Card>
    </div>
  );
}

function Money({ label, v, bad, sub }: { label: string; v: string; bad?: boolean; sub?: ReactNode }) {
  return <div className="min-w-0"><Label>{label}</Label><div className={cx('tabular mt-1 text-lg font-semibold', bad ? 'text-bad' : 'text-fg')}>{v}</div>{sub && <div className="mt-0.5 text-xs text-muted">{sub}</div>}</div>;
}

function FlagPill({ c }: { c: ClientCampaign }) {
  if (c.flag === 'pause') return <Pill tone="bad" icon="alert">pause</Pill>;
  if (c.flag === 'watch') return <Pill tone="warn">watch</Pill>;
  return null;
}
function NextPill({ c }: { c: ClientCampaign }) {
  if (!c.next) return null;
  return c.planExists ? <Pill tone="good" icon="check">next planned</Pill> : <Pill tone="accent">plan next</Pill>;
}
function Bar({ v }: { v: number }) {
  return <div className="h-1.5 w-full overflow-hidden rounded-full bg-line" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(v * 100)} aria-label="Progress"><div className={cx('h-full rounded-full', v >= 0.6 ? 'bg-accent' : 'bg-line-strong')} style={{ width: `${Math.min(100, Math.round(v * 100))}%` }} /></div>;
}

function Campaigns({ list }: { list: ClientCampaign[] }) {
  if (!list.length) return <Card className="text-sm text-muted">No active campaign.</Card>;
  return (
    <>
      {/* Phone: one block per campaign. */}
      <div className="space-y-2 sm:hidden">
        {list.map((c) => (
          <Card key={c.id} className="p-4">
            <div className="flex items-start justify-between gap-2"><div className="min-w-0 break-words text-[15px] font-medium text-fg">{c.name}</div><div className="flex shrink-0 gap-1"><FlagPill c={c} /><NextPill c={c} /></div></div>
            <div className="mt-2 flex items-center gap-3"><Bar v={c.progress} /><span className="tabular w-10 shrink-0 text-right text-xs font-semibold text-fg-2">{pct(c.progress)}</span></div>
            <div className="mt-2 grid grid-cols-3 gap-2 text-xs text-muted">
              <span>bounce <span className={cx('tabular font-semibold', c.flag === 'pause' ? 'text-bad' : c.flag === 'watch' ? 'text-warn' : 'text-fg-2')}>{c.bounce}%</span></span>
              <span><span className="tabular font-semibold text-fg-2">{c.sent.toLocaleString('en-US')}</span> sent</span>
              <span><span className="tabular font-semibold text-fg-2">{c.perThousand ?? '–'}</span> int./1k</span>
            </div>
          </Card>
        ))}
      </div>
      {/* Tablet and desktop: a table. */}
      <Card className="hidden overflow-hidden p-0 sm:block">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-line bg-sunken text-xs text-muted">
            <tr><th className="px-5 py-2.5 font-medium">Campaign</th><th className="w-44 px-3 py-2.5 font-medium">Progress</th><th className="px-3 py-2.5 text-right font-medium">Bounce</th><th className="px-3 py-2.5 text-right font-medium">Sent</th><th className="px-3 py-2.5 text-right font-medium">Interested / 1k</th><th className="px-5 py-2.5 font-medium"><span className="sr-only">Flags</span></th></tr>
          </thead>
          <tbody className="divide-y divide-line">
            {list.map((c) => (
              <tr key={c.id}>
                <td className="px-5 py-3 font-medium text-fg">{c.name}</td>
                <td className="px-3 py-3"><div className="flex items-center gap-2"><Bar v={c.progress} /><span className="tabular w-9 shrink-0 text-right text-xs font-semibold text-fg-2">{pct(c.progress)}</span></div></td>
                <td className={cx('tabular px-3 py-3 text-right font-semibold', c.flag === 'pause' ? 'text-bad' : c.flag === 'watch' ? 'text-warn' : 'text-fg-2')}>{c.bounce}%</td>
                <td className="tabular px-3 py-3 text-right text-fg-2">{c.sent.toLocaleString('en-US')}</td>
                <td className="tabular px-3 py-3 text-right text-fg-2">{c.perThousand ?? '–'}</td>
                <td className="px-5 py-3"><div className="flex justify-end gap-1"><FlagPill c={c} /><NextPill c={c} /></div></td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </>
  );
}

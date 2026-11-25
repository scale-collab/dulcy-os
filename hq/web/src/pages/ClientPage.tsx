import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { api, type AgentTask, type Client, type ClientCampaign, type User } from '../api';
import { Avatar, BackLink, Button, Card, cx, dueLabel, ErrorBox, go, Icon, Label, lightLabel, lightTone, PageSkeleton, Pill, SectionHeader, StatusDot, timeAgo, usd } from '../ui';
import { noteBox } from './Clients';

interface Detail {
  client: Client;
  activity: { id: string; event: string; when: string; agent: string; type: string; details: string }[];
  tasks: AgentTask[];
  decisions: { id: string; title: string; agent: string; pile: string; created: string }[];
  readAt: string;
}
const pct = (x: number) => `${Math.round(x * 100)}%`;

export default function ClientPage({ id, user }: { id: string; user: User }) {
  const [d, setD] = useState<Detail | null>(null);
  const [error, setError] = useState('');
  const load = useCallback(() => { setError(''); api<Detail>(`/clients/${encodeURIComponent(id)}`).then(setD).catch((e) => setError(e.message)); }, [id]);
  useEffect(load, [load]);
  const back = <BackLink label="Clients" onClick={() => go('clients')} />;
  if (error) return <>{back}<ErrorBox error={error} retry={load} /></>;
  if (!d) return <>{back}<PageSkeleton kind="list" /></>;
  const c = d.client;
  const tone = lightTone[c.light];
  const conv = c.interested30 ? c.booked30 / c.interested30 : null;
  const owner = user.role === 'owner';

  return (
    <div>
      {back}
      <Card className="sm:p-7">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-[26px] font-bold leading-tight tracking-tight">{c.name}</h1>
              <Pill tone={tone === 'bad' ? 'bad' : tone === 'warn' ? 'warn' : tone === 'good' ? 'good' : 'plain'}><StatusDot tone={tone} />{lightLabel[c.light]}</Pill>
              {c.internal && <Pill>Dulcy itself</Pill>}
            </div>
            <div className="mt-1 text-sm text-muted">
              {[c.type || 'Client Type not set', c.startDate ? `since ${c.startDate}` : '', !c.active && c.endDate ? `ended ${c.endDate}` : '', !c.active && c.inactiveReason ? c.inactiveReason : ''].filter(Boolean).join(' · ')}
            </div>
            <div className="mt-1 text-xs text-muted">Workspaces: {c.workspaces.map((w) => `${w.name} (${w.status || 'no status'}${w.bisonId ? `, #${w.bisonId}` : ''})`).join(' · ')}</div>
          </div>
          <Button icon="message" onClick={() => go('chat/Atlas')} className="w-full sm:w-auto">Ask Atlas</Button>
        </div>
        {c.note.length > 0 && (
          <div className={cx('mt-5 rounded-xl px-4 py-3 text-[15px] font-medium leading-snug', noteBox[c.light])}>
            <Label className="mb-1 !text-current opacity-80">Today</Label>
            {c.note.map((n) => <div key={n}>{n}</div>)}
          </div>
        )}
        {c.reasons.length > 0 && (
          <ul className="mt-4 space-y-1.5 text-sm text-fg-2">
            {c.reasons.map((r) => <li key={r} className="flex gap-2"><Icon name="flag" size={14} className="mt-0.5 text-muted" />{r}</li>)}
          </ul>
        )}
      </Card>

      <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <Stat label="Interested · 7 d" n={c.interested7} trend={c.interested7 - c.interestedPrev7} prev={c.interestedPrev7} />
        <Stat label="Booked · 7 d" n={c.booked7} trend={c.booked7 - c.bookedPrev7} prev={c.bookedPrev7} />
        <Stat label="Interested · 30 d" n={c.interested30} />
        <Stat label={c.kpi ? `Booked · 30 d / KPI ${c.kpi}` : 'Booked · 30 d'} n={c.booked30} tone={c.kpi && c.booked30 < c.kpi ? 'warn' : undefined} />
        <Stat label="Interested → booked" text={conv === null ? '–' : pct(conv)} tone={conv !== null && c.interested30 >= 10 && conv < 0.2 ? 'warn' : undefined} />
        <Stat label="Replies waiting" n={c.waitingApproval} tone={c.waitingApproval ? 'warn' : undefined}
          action={c.waitingApproval || c.seanWaiting ? <button onClick={() => go(`decisions/Replies/${encodeURIComponent(c.key)}`)} className="mt-1 inline-flex min-h-8 items-center gap-1 text-xs font-semibold text-accent-ink hover:underline">Open replies<Icon name="chevronRight" size={13} /></button> : undefined}
          sub={c.seanWaiting ? `${c.seanWaiting} Echo decision${c.seanWaiting === 1 ? '' : 's'}` : undefined} />
      </div>

      {owner && c.money && (
        <section className="mt-6">
          <SectionHeader title="Money" icon="dollar" right={<span className="text-xs text-muted">owner only</span>} />
          <Card className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <Money label="Monthly fee" v={c.money.fee ? `${usd(c.money.fee)}/mo` : c.internal ? 'none' : 'UNKNOWN'} />
            <Money label={c.money.ltvSource === 'estimated' ? 'LTV (estimated)' : 'Lifetime revenue'} v={c.money.ltv === null ? 'UNKNOWN' : usd(c.money.ltv)} />
            <Money label="Outstanding" v={c.money.receivables ? usd(c.money.receivables) : '$0'} bad={!!c.money.receivables} />
            <Money label="Months active" v={c.money.months === null ? '–' : String(c.money.months)} />
            {c.money.feeNote && <div className="col-span-2 text-xs text-warn sm:col-span-4">{c.money.feeNote}</div>}
          </Card>
        </section>
      )}

      <section className="mt-6">
        <SectionHeader title={`Active campaigns · ${c.campaigns.length}`} icon="megaphone" right={<span className="text-xs text-muted">watch &gt; 2.5% · pause &gt; 4%</span>} />
        <Campaigns list={c.campaigns} />
      </section>

      {(c.dataIssues.length > 0 || c.airtableHealth || c.airtableReasons) && (
        <section className="mt-6">
          <SectionHeader title="Data check" icon="database" right={<span className="text-xs text-muted">Atlas keeps this right</span>} />
          <Card className="space-y-2 text-sm text-fg-2">
            {c.dataIssues.map((x) => <div key={x} className="flex gap-2"><Icon name="alert" size={15} className="mt-0.5 text-warn" />{x}</div>)}
            {c.airtableHealth && <div className="text-muted">Airtable Client Health: <span className="font-medium text-fg-2">{c.airtableHealth}</span></div>}
            {c.airtableReasons && <div className="whitespace-pre-wrap text-xs text-muted">{c.airtableReasons}</div>}
          </Card>
        </section>
      )}

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
                    <div className="min-w-0 flex-1"><div className="text-[15px] font-medium text-fg">{t.title}</div><div className="text-xs text-muted">{[t.agent, t.due ? dueLabel(t.due) : '', t.notes].filter(Boolean).join(' · ')}</div></div>
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
    </div>
  );
}

function Stat({ label, n, text, trend, prev, tone, action, sub }: { label: string; n?: number; text?: string; trend?: number; prev?: number; tone?: 'warn' | 'bad'; action?: ReactNode; sub?: string }) {
  return (
    <div className="min-w-0 rounded-2xl border border-line bg-surface p-4 shadow-card">
      <div className="truncate text-xs font-medium text-muted">{label}</div>
      <div className={cx('tabular mt-1 text-[26px] font-bold leading-none tracking-tight', tone === 'bad' ? 'text-bad' : tone === 'warn' ? 'text-warn' : 'text-fg')}>{text ?? (n ?? 0).toLocaleString('en-US')}</div>
      {trend !== undefined && prev !== undefined && (
        <div className={cx('mt-1.5 flex items-center gap-1 text-xs', trend > 0 ? 'text-good' : trend < 0 ? 'text-bad' : 'text-muted')}>
          {trend !== 0 && <Icon name={trend > 0 ? 'trendUp' : 'trendDown'} size={13} />}{trend === 0 ? 'same as the week before' : `from ${prev} the week before`}
        </div>
      )}
      {sub && <div className="mt-1.5 text-xs text-muted">{sub}</div>}
      {action}
    </div>
  );
}

function Money({ label, v, bad }: { label: string; v: string; bad?: boolean }) {
  return <div className="min-w-0"><Label>{label}</Label><div className={cx('tabular mt-1 text-lg font-semibold', bad ? 'text-bad' : 'text-fg')}>{v}</div></div>;
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

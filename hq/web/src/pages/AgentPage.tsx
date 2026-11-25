import { useCallback, useEffect, useState } from 'react';
import { api, type AgentTask, type Decision, type Report, type TeamLine } from '../api';
import { Avatar, BackLink, Button, Card, cleanLine, cx, dueLabel, ErrorBox, go, Icon, PageSkeleton, Pill, SectionHeader, StatusDot, teamTone, timeAgo } from '../ui';
import { ReportList } from './Reports';

interface Run { id: number; kind: string; status: string; at: string; message: string; dryRun: boolean }
interface Activity { id: string; event: string; when: string; type: string; details: string }
interface Detail {
  agent: { name: string; role: string; does: string; reportsTo: string; manages: string[] };
  status: TeamLine; lastOk: string | null; lastFail: string | null;
  runs: Run[]; decisions: Decision[]; activity: Activity[]; tasks: AgentTask[]; reports: Report[];
}
const runTone = (s: string) => (s === 'succeeded' ? 'good' : s === 'failed' || s === 'needs_review' ? 'bad' : 'plain') as 'good' | 'bad' | 'plain';

export default function AgentPage({ name }: { name: string }) {
  const [d, setD] = useState<Detail | null>(null);
  const [error, setError] = useState('');
  const [showRuns, setShowRuns] = useState(false);
  const load = useCallback(() => { setError(''); api<Detail>(`/agents/${encodeURIComponent(name)}`).then(setD).catch((e) => setError(e.message)); }, [name]);
  useEffect(load, [load]);
  const finish = async (id: number) => { await api(`/agent-tasks/${id}/done`, { body: {} }).catch(() => undefined); load(); };
  const back = <BackLink label="Team" onClick={() => go('agents')} />;
  if (error) return <>{back}<ErrorBox error={error} retry={load} /></>;
  if (!d) return <>{back}<PageSkeleton kind="list" /></>;
  const a = d.agent;
  const tone = teamTone(d.status.ok, d.status.line);
  return (
    <div>
      {back}
      <Card className="relative overflow-hidden sm:p-7">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-start">
          <div className="flex min-w-0 flex-1 items-start gap-4">
            <Avatar name={a.name} size="xl" />
            <div className="min-w-0">
              <h1 className="text-[26px] font-bold leading-tight tracking-tight">{a.name}</h1>
              <div className="mt-0.5 text-sm text-muted">{a.role} · reports to {a.reportsTo}{a.manages.length ? ` · runs ${a.manages.join(', ')}` : ''}</div>
              <p className="mt-3 max-w-2xl text-[15px] leading-relaxed text-fg-2">{a.does}</p>
            </div>
          </div>
          <Button tone="primary" icon="message" onClick={() => go(`chat/${a.name}`)} className="w-full sm:w-auto">Talk to {a.name}</Button>
        </div>
        <div className="mt-5 flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-line pt-4 text-sm">
          <span className={cx('inline-flex items-center gap-2 font-medium', tone === 'bad' ? 'text-bad' : tone === 'warn' ? 'text-warn' : 'text-fg-2')}><StatusDot tone={tone} />{cleanLine(d.status.line)}</span>
          <span className="text-xs text-muted">{d.lastOk ? `Last success ${timeAgo(d.lastOk)}` : 'No success yet'}{d.lastFail ? ` · last failure ${timeAgo(d.lastFail)}` : ''}</span>
        </div>
      </Card>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <section className="min-w-0">
          <SectionHeader title={`To-do · ${d.tasks.length}`} icon="grid" />
          <Card className="p-0">
            {d.tasks.length ? (
              <ul className="divide-y divide-line">
                {d.tasks.map((t) => (
                  <li key={t.id} className="flex items-start gap-1 pr-4">
                    <button aria-label={`Mark "${t.title}" done`} onClick={() => void finish(t.id)} className="group grid h-12 w-12 shrink-0 place-items-center">
                      <span className="grid h-[22px] w-[22px] place-items-center rounded-full border-2 border-line-strong text-transparent transition group-hover:border-accent group-hover:text-accent-ink"><Icon name="check" size={13} strokeWidth={3} /></span>
                    </button>
                    <div className="min-w-0 flex-1 py-3"><div className="text-[15px] font-medium text-fg">{t.title}</div><div className="text-xs text-muted">{[t.due ? dueLabel(t.due) : '', t.client, t.notes].filter(Boolean).join(' · ')}</div></div>
                  </li>
                ))}
              </ul>
            ) : <div className="px-5 py-4 text-sm text-muted">Nothing on {a.name}'s list.</div>}
          </Card>
        </section>

        <section className="min-w-0">
          <SectionHeader title={`Waiting on you · ${d.decisions.length}`} icon="inbox" />
          <Card className="p-0">
            {d.decisions.length ? (
              <ul className="divide-y divide-line">
                {d.decisions.slice(0, 5).map((x) => (
                  <li key={x.id}>
                    <button onClick={() => go(`decisions/${x.pile}`)} className="group flex min-h-12 w-full items-center gap-3 px-5 py-3 text-left transition hover:bg-hover">
                      <div className="min-w-0 flex-1"><div className="truncate text-[15px] font-medium text-fg">{x.title}</div><div className="text-xs text-muted">{[x.client, timeAgo(x.created)].filter(Boolean).join(' · ')}</div></div>
                      <Icon name="chevronRight" size={18} className="text-faint group-hover:text-muted" />
                    </button>
                  </li>
                ))}
              </ul>
            ) : <div className="px-5 py-4 text-sm text-muted">No decisions waiting.</div>}
          </Card>
        </section>
      </div>

      <section className="mt-6"><SectionHeader title="Reports" icon="file" /><ReportList reports={d.reports} empty={`No reports from ${a.name} yet.`} /></section>

      <section className="mt-6">
        <SectionHeader title={`What ${a.name} did`} icon="activity" right={<span className="text-xs text-muted">Activity Log</span>} />
        <Card className="p-0">
          {d.activity.length ? (
            <ol className="relative px-5 py-2">
              {d.activity.map((x, i) => (
                <li key={x.id} className="relative flex gap-3 py-2.5">
                  <span aria-hidden="true" className="relative flex w-3 justify-center">
                    <span className="mt-1.5 h-2 w-2 rounded-full bg-line-strong" />
                    {i < d.activity.length - 1 && <span className="absolute top-4 -bottom-3.5 w-px bg-line" />}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="text-[15px] text-fg">{x.event}</div>
                    <div className="mt-0.5 flex items-center gap-2 text-xs text-muted"><span>{timeAgo(x.when)}</span>{x.type && <Pill>{x.type}</Pill>}</div>
                  </div>
                </li>
              ))}
            </ol>
          ) : <div className="px-5 py-4 text-sm text-muted">No activity rows.</div>}
        </Card>
      </section>

      <section className="mt-6">
        <button onClick={() => setShowRuns((v) => !v)} aria-expanded={showRuns} className="mb-3 flex min-h-11 items-center gap-2 text-sm font-semibold text-fg">
          <Icon name="terminal" size={16} className="text-muted" />Engine runs · {d.runs.length}<Icon name="chevronDown" size={16} className={cx('text-muted transition', showRuns && 'rotate-180')} />
        </button>
        {showRuns && (
          <Card className="divide-y divide-line p-0 anim-fade">
            {d.runs.map((r) => (
              <div key={r.id} className="px-5 py-3">
                <div className="flex flex-wrap items-center gap-2 text-xs"><Pill tone={runTone(r.status)}>{r.status}</Pill><span className="font-mono text-fg-2">{r.kind}</span><span className="text-muted">{timeAgo(r.at)}</span>{r.dryRun && <Pill>dry run</Pill>}</div>
                {r.message && <div className="mt-1 break-words text-sm text-fg-2">{r.message}</div>}
              </div>
            ))}
            {!d.runs.length && <div className="px-5 py-4 text-sm text-muted">No runs yet.</div>}
          </Card>
        )}
      </section>
    </div>
  );
}

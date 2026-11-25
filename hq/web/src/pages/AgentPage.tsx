import { useCallback, useEffect, useState } from 'react';
import { api, type AgentTask, type Decision, type Report, type TeamLine } from '../api';
import { AGENT_EMOJI, Button, Card, cx, dueLabel, ErrorBox, go, Label, Loading, Pill, timeAgo } from '../ui';
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
  if (error) return <ErrorBox error={error} retry={load} />;
  if (!d) return <Loading />;
  const a = d.agent;
  return (
    <div className="space-y-7">
      <div>
        <button onClick={() => go('agents')} className="mb-4 text-sm text-stone-500 hover:text-stone-800 dark:text-stone-400 dark:hover:text-white">← Team</button>
        <div className="flex items-center gap-3"><span className="text-3xl">{AGENT_EMOJI[a.name]}</span><div><h1 className="text-2xl font-bold tracking-tight">{a.name}</h1><div className="text-sm text-stone-500 dark:text-stone-400">{a.role} · reports to {a.reportsTo}{a.manages.length ? ` · runs ${a.manages.join(', ')}` : ''}</div></div></div>
        <p className="mt-3 text-[15px] text-stone-700 dark:text-stone-300">{a.does}</p>
        <div className={cx('mt-2 text-sm', d.status.ok === false ? 'text-amber-700 dark:text-amber-300' : 'text-stone-500 dark:text-stone-400')}>{d.status.line}</div>
        <div className="mt-1 text-xs text-stone-500 dark:text-stone-400">{d.lastOk ? `Last success ${timeAgo(d.lastOk)}` : 'No success yet'}{d.lastFail ? ` · last failure ${timeAgo(d.lastFail)}` : ''}</div>
        <Button tone="primary" onClick={() => go(`chat/${a.name}`)} className="mt-4 w-full sm:w-auto">💬 Talk to {a.name}</Button>
      </div>

      <section>
        <Label>To-do ({d.tasks.length})</Label>
        <div className="mt-2 space-y-2">
          {d.tasks.map((t) => (
            <Card key={t.id} className="flex items-center gap-3 p-4">
              <button aria-label="Mark done" onClick={() => void finish(t.id)} className="grid h-8 w-8 shrink-0 place-items-center rounded-full border-2 border-stone-300 text-transparent hover:border-accent hover:text-accent dark:border-white/25">✓</button>
              <div className="min-w-0 flex-1"><div className="font-medium">{t.title}</div><div className="text-xs text-stone-500 dark:text-stone-400">{[t.due ? dueLabel(t.due) : '', t.notes].filter(Boolean).join(' · ')}</div></div>
            </Card>
          ))}
          {!d.tasks.length && <div className="text-sm text-stone-500 dark:text-stone-400">Nothing on {a.name}'s list.</div>}
        </div>
      </section>

      <section>
        <Label>Waiting on you ({d.decisions.length})</Label>
        <div className="mt-2 space-y-2">
          {d.decisions.slice(0, 5).map((x) => <Card key={x.id} onClick={() => go(`decisions/${x.pile}`)} className="p-4"><div className="font-medium">{x.title}</div><div className="text-xs text-stone-500 dark:text-stone-400">{x.client} · {timeAgo(x.created)}</div></Card>)}
          {!d.decisions.length && <div className="text-sm text-stone-500 dark:text-stone-400">No decisions waiting.</div>}
        </div>
      </section>

      <section><Label>Reports</Label><div className="mt-2"><ReportList reports={d.reports} empty={`No reports from ${a.name} yet.`} /></div></section>

      <section>
        <Label>What {a.name} did (Activity Log)</Label>
        <Card className="mt-2 divide-y divide-stone-100 p-0 dark:divide-white/5">
          {d.activity.map((x) => (
            <div key={x.id} className="px-4 py-3"><div className="flex items-center gap-2 text-xs text-stone-500 dark:text-stone-400"><span>{timeAgo(x.when)}</span><span>·</span><span>{x.type}</span></div><div className="text-[15px]">{x.event}</div></div>
          ))}
          {!d.activity.length && <div className="px-4 py-3 text-sm text-stone-500 dark:text-stone-400">No activity rows.</div>}
        </Card>
      </section>

      <section>
        <button onClick={() => setShowRuns((v) => !v)} className="flex min-h-11 items-center gap-2"><Label>Engine runs ({d.runs.length})</Label><span className="text-stone-400">{showRuns ? '▾' : '▸'}</span></button>
        {showRuns && (
          <Card className="mt-2 divide-y divide-stone-100 p-0 dark:divide-white/5">
            {d.runs.map((r) => (
              <div key={r.id} className="px-4 py-3">
                <div className="flex items-center gap-2 text-xs"><Pill tone={runTone(r.status)}>{r.status}</Pill><span className="font-mono text-stone-500">{r.kind}</span><span className="text-stone-400">{timeAgo(r.at)}</span>{r.dryRun && <Pill>dry run</Pill>}</div>
                {r.message && <div className="mt-1 text-sm text-stone-600 dark:text-stone-300">{r.message}</div>}
              </div>
            ))}
            {!d.runs.length && <div className="px-4 py-3 text-sm text-stone-500">No runs yet.</div>}
          </Card>
        )}
      </section>
    </div>
  );
}

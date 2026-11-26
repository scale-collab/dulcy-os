import { useEffect, useState } from 'react';
import { api, type AgentCard, type AgentWork } from '../api';
import { Avatar, Card, cleanLine, cx, ErrorBox, go, Icon, PageSkeleton, PageTitle, StatusDot, teamTone, toneLabel } from '../ui';
import { WorkChips, WorkSummary } from './AgentWork';

export default function Agents() {
  const [agents, setAgents] = useState<AgentCard[] | null>(null);
  const [work, setWork] = useState<({ agent: string } & AgentWork)[]>([]);
  const [error, setError] = useState('');
  useEffect(() => { api<{ agents: AgentCard[]; work?: ({ agent: string } & AgentWork)[] }>('/agents').then((r) => { setAgents(r.agents); setWork(r.work ?? []); }).catch((e) => setError(e.message)); }, []);
  const title = <PageTitle title="Team" kicker={agents ? `${agents.length} agents` : 'Agents'} sub="Everyone reports to Ada. Atlas runs Scribe and Scout." />;
  if (error) return <>{title}<ErrorBox error={error} /></>;
  if (!agents) return <>{title}<PageSkeleton kind="grid" /></>;
  return (
    <div>
      {title}
      {work.length > 0 && <WorkSummary work={work} />}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {agents.map((a) => {
          const tone = teamTone(a.status?.ok, a.status?.line);
          return (
            <Card key={a.name} onClick={() => go(`agents/${a.name}`)} label={`${a.name}, ${a.role}: ${toneLabel[tone]}`} className="group flex flex-col p-5">
              <div className="flex items-start gap-3">
                <span className="relative">
                  <Avatar name={a.name} size="lg" />
                  <StatusDot tone={tone} className="absolute -bottom-0.5 -right-0.5 h-3 w-3 ring-2 ring-surface" />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2"><div className="text-[17px] font-semibold tracking-tight text-fg">{a.name}</div><Icon name="chevronRight" size={18} className="text-faint transition group-hover:translate-x-0.5 group-hover:text-muted" /></div>
                  <div className="truncate text-sm text-muted">{a.role}</div>
                </div>
              </div>
              <p className="mt-3 line-clamp-2 text-sm leading-relaxed text-fg-2">{a.does}</p>
              <div className="mt-auto pt-4">
                <div className={cx('flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-xs', tone === 'bad' ? 'bg-bad-soft text-bad' : tone === 'warn' ? 'bg-warn-soft text-warn' : 'bg-sunken text-muted')}>
                  <StatusDot tone={tone} /><span className="truncate">{cleanLine(a.status?.line) || 'No status yet'}</span>
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs text-muted">
                  <span>reports to <span className="font-medium text-fg-2">{a.reportsTo}</span></span>
                  {a.waiting > 0 && <span className="font-medium text-warn">{a.waiting} decision{a.waiting === 1 ? '' : 's'} waiting</span>}
                  {a.work ? <WorkChips w={a.work} /> : a.openTasks > 0 && <span>{a.openTasks} tasks</span>}
                </div>
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}

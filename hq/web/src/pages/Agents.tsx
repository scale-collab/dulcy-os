import { useEffect, useState } from 'react';
import { api, type AgentCard, type AgentWork, type Connection } from '../api';
import { Avatar, Card, cleanLine, cx, ErrorBox, go, Icon, PageSkeleton, PageTitle, SectionHeader, StatusDot, teamTone, timeAgo, toneLabel, type Tone } from '../ui';
import { TeamTabs, WorkChips, WorkSummary } from './AgentWork';

export default function Agents() {
  const [agents, setAgents] = useState<AgentCard[] | null>(null);
  const [work, setWork] = useState<({ agent: string } & AgentWork)[]>([]);
  const [error, setError] = useState('');
  useEffect(() => { api<{ agents: AgentCard[]; work?: ({ agent: string } & AgentWork)[] }>('/agents').then((r) => { setAgents(r.agents); setWork(r.work ?? []); }).catch((e) => setError(e.message)); }, []);
  const title = <><PageTitle title="Team" kicker={agents ? `${agents.length} agents` : 'Agents'} sub="Everyone reports to Ada. Atlas runs Scribe and Scout." /><TeamTabs on="team" /></>;
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
      <Connections />
    </div>
  );
}

const CONN: Record<Connection['status'], { label: string; tone: Tone }> = {
  connected: { label: 'Connected', tone: 'good' },
  waiting: { label: 'Waiting for a card', tone: 'warn' },
  needs_alex: { label: 'Needs Alex', tone: 'bad' },
  not_set_up: { label: 'Not set up', tone: 'idle' },
  kept: { label: 'Kept on its check', tone: 'idle' },
};

/** Which services tell the agents the moment work arrives (webhooks). Read only; no secrets are ever sent here. */
function Connections() {
  const [list, setList] = useState<Connection[] | null>(null);
  const [error, setError] = useState('');
  useEffect(() => { api<{ connections: Connection[] }>('/team/connections').then((r) => setList(r.connections)).catch((e) => setError(e.message)); }, []);
  if (error) return null;
  return (
    <section className="mt-8" aria-label="Connections">
      <SectionHeader title="Connections" icon="link" right={<span className="text-xs text-muted">Webhooks that start the agents at once</span>} />
      {!list ? <PageSkeleton kind="list" /> : (
        <Card className="divide-y divide-line p-0">
          {list.map((c) => {
            const s = CONN[c.status];
            return (
              <div key={c.source} className="flex flex-col gap-1 px-4 py-3 sm:flex-row sm:items-center sm:gap-4">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 text-sm font-semibold text-fg"><StatusDot tone={s.tone} label={s.label} />{c.name}</div>
                  <div className="truncate text-xs text-muted">Feeds {c.feeds}</div>
                  {c.status !== 'connected' && <div className="mt-0.5 text-xs text-fg-2">{c.note}</div>}
                  {c.cards.length > 0 && <ul className="mt-1 list-disc pl-5 text-xs text-fg-2">{c.cards.map((t) => <li key={t}>{t}</li>)}</ul>}
                </div>
                <div className="flex shrink-0 items-center gap-3 text-xs">
                  <span className={cx('rounded-full px-2 py-0.5 font-medium', s.tone === 'good' ? 'bg-good-soft text-good' : s.tone === 'warn' ? 'bg-warn-soft text-warn' : s.tone === 'bad' ? 'bg-bad-soft text-bad' : 'bg-sunken text-muted')}>{s.label}</span>
                  <span className="tabular text-muted">{c.lastEvent ? `last event ${timeAgo(c.lastEvent)}${c.events24h ? ` · ${c.events24h} in 24 h` : ''}` : 'no event yet'}</span>
                </div>
              </div>
            );
          })}
        </Card>
      )}
    </section>
  );
}

import { useEffect, useState } from 'react';
import { api, type AgentCard } from '../api';
import { AGENT_EMOJI, Card, cx, ErrorBox, go, Loading, PageTitle } from '../ui';

export default function Agents() {
  const [agents, setAgents] = useState<AgentCard[] | null>(null);
  const [error, setError] = useState('');
  useEffect(() => { api<{ agents: AgentCard[] }>('/agents').then((r) => setAgents(r.agents)).catch((e) => setError(e.message)); }, []);
  if (error) return <><PageTitle title="Team" /><ErrorBox error={error} /></>;
  if (!agents) return <><PageTitle title="Team" /><Loading /></>;
  return (
    <div>
      <PageTitle title="Team" kicker="Everyone reports to Ada. Atlas runs Scribe and Scout." />
      <div className="grid gap-2 sm:grid-cols-2">
        {agents.map((a) => (
          <Card key={a.name} onClick={() => go(`agents/${a.name}`)} className="p-4">
            <div className="flex items-start gap-3">
              <div className="text-2xl leading-none">{AGENT_EMOJI[a.name]}</div>
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline justify-between gap-2"><div className="font-semibold">{a.name}</div><div className="truncate text-xs text-stone-500 dark:text-stone-400">{a.role}</div></div>
                <div className="mt-0.5 text-sm text-stone-600 dark:text-stone-300">{a.does}</div>
                <div className={cx('mt-2 truncate text-xs', a.status?.ok === false ? 'text-amber-700 dark:text-amber-300' : 'text-stone-500 dark:text-stone-400')}>{a.status?.line}</div>
                <div className="mt-1 flex gap-3 text-xs text-stone-500 dark:text-stone-400">
                  <span>reports to {a.reportsTo}</span>
                  {a.waiting > 0 && <span>· {a.waiting} waiting</span>}
                  {a.openTasks > 0 && <span>· {a.openTasks} to-do</span>}
                </div>
              </div>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}

import { useCallback, useEffect, useState } from 'react';
import { api, type Report, type Task, type TeamLine, type User } from '../api';
import { AGENT_EMOJI, Button, Card, cx, dueLabel, ErrorBox, go, Label, Loading, Markdown, PageTitle, timeAgo } from '../ui';
import { ReportList } from './Reports';

interface TodayData {
  brief: { title: string; body: string; created: string; dryRun: boolean } | null;
  team: TeamLine[];
  decisions: Record<string, number>;
  tasks: { doNow: Task[]; counts: Record<string, number>; doneQuestions: number };
  reports: Report[];
}
const PILE_ICON: Record<string, string> = { Replies: '💬', Campaigns: '🚀', Fixes: '🛠️', Money: '💵', Other: '📌' };

export default function Today({ user }: { user: User }) {
  const [d, setD] = useState<TodayData | null>(null);
  const [error, setError] = useState('');
  const [briefOpen, setBriefOpen] = useState(false);
  const load = useCallback(() => { setError(''); api<TodayData>('/today').then(setD).catch((e) => setError(e.message)); }, []);
  useEffect(load, [load]);
  const hour = new Date().getHours();
  const hello = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
  const date = new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });
  if (error) return <><PageTitle kicker={date} title={`${hello}, ${user.name}.`} /><ErrorBox error={error} retry={load} /></>;
  if (!d) return <><PageTitle kicker={date} title={`${hello}, ${user.name}.`} /><Loading /></>;

  const waiting = Object.values(d.decisions).reduce((a, b) => a + b, 0);
  const briefLines = (d.brief?.body ?? '').split('\n');
  const keyLines = briefLines.filter((l) => /^\*\*(Waiting on you|Top \d)/.test(l));
  const offTeam = d.team.filter((t) => t.ok === false);

  return (
    <div className="space-y-8">
      <PageTitle kicker={date} title={`${hello}, ${user.name}.`} />

      {/* 1. What to do first */}
      <section>
        <Label>First things</Label>
        <div className="mt-2 grid gap-2 sm:grid-cols-2">
          <Card onClick={() => go('decisions')} className="p-4">
            <div className="flex items-center justify-between"><div className="font-semibold">Decisions</div><span className={cx('rounded-full px-3 py-1 text-sm font-bold', waiting ? 'bg-stone-900 text-white dark:bg-white dark:text-stone-900' : 'bg-stone-100 text-stone-500 dark:bg-white/10')}>{waiting}</span></div>
            <div className="mt-1 text-sm text-stone-500 dark:text-stone-400">{waiting ? Object.entries(d.decisions).filter(([, n]) => n).map(([k, n]) => `${PILE_ICON[k]} ${n} ${n === 1 ? ({ Replies: 'reply', Campaigns: 'campaign', Fixes: 'fix', Money: 'money', Other: 'other' } as Record<string, string>)[k] : k.toLowerCase()}`).join(' · ') : 'Nothing waiting on you.'}</div>
          </Card>
          <Card onClick={() => go('tasks')} className="p-4">
            <div className="flex items-center justify-between"><div className="font-semibold">Do now</div><span className={cx('rounded-full px-3 py-1 text-sm font-bold', d.tasks.counts.doNow ? 'bg-stone-900 text-white dark:bg-white dark:text-stone-900' : 'bg-stone-100 text-stone-500 dark:bg-white/10')}>{d.tasks.counts.doNow ?? 0}</span></div>
            <div className="mt-1 truncate text-sm text-stone-500 dark:text-stone-400">{d.tasks.doNow[0] ? `${d.tasks.doNow[0].name}${d.tasks.doNow[0].due ? ` · ${dueLabel(d.tasks.doNow[0].due)}` : ''}` : 'Nothing urgent and important.'}</div>
          </Card>
        </div>
        {d.tasks.doneQuestions > 0 && <button onClick={() => go('tasks')} className="mt-2 min-h-11 text-sm font-medium text-accent">{d.tasks.doneQuestions} task{d.tasks.doneQuestions === 1 ? '' : 's'} may be done already: check →</button>}
      </section>

      {/* 2. Ada's brief */}
      <section>
        <Label>Ada's brief</Label>
        <Card className="mt-2">
          {d.brief ? (
            <>
              <div className="flex items-center gap-2 text-xs text-stone-500 dark:text-stone-400"><span>🧭 Ada</span><span>·</span><span>{timeAgo(d.brief.created)}</span>{d.brief.dryRun && <span>· dry run</span>}</div>
              <div className="mt-1 font-semibold">{d.brief.title}</div>
              <Markdown className="mt-2" text={briefOpen ? d.brief.body : (keyLines.join('\n') || briefLines.slice(0, 2).join('\n'))} />
              <button onClick={() => setBriefOpen((v) => !v)} className="mt-2 min-h-11 text-sm font-semibold text-accent">{briefOpen ? 'Show less' : 'Read the whole brief'}</button>
            </>
          ) : <div className="text-sm text-stone-500 dark:text-stone-400">No brief yet. Ada writes it on weekday mornings (ADA_BRIEF=on).</div>}
        </Card>
      </section>

      {/* 3. Team check */}
      <section>
        <div className="flex items-center justify-between"><Label>Team check</Label><span className="text-xs text-stone-500 dark:text-stone-400">{offTeam.length ? `${offTeam.length} need a look` : 'all fine'}</span></div>
        <Card className="mt-2 divide-y divide-stone-100 p-0 dark:divide-white/5">
          {d.team.map((t) => (
            <button key={t.agent} onClick={() => go(`agents/${t.agent}`)} className="flex min-h-12 w-full items-center gap-3 px-4 py-2.5 text-left hover:bg-stone-50 dark:hover:bg-white/[0.03]">
              <span className="w-6 text-center">{AGENT_EMOJI[t.agent]}</span>
              <span className="w-16 shrink-0 font-medium">{t.agent}</span>
              <span className={cx('min-w-0 flex-1 line-clamp-2 text-sm', t.ok === false ? 'text-amber-700 dark:text-amber-300' : 'text-stone-500 dark:text-stone-400')}>{t.line}</span>
            </button>
          ))}
        </Card>
      </section>

      {/* 4. Reports */}
      <section>
        <Label>Reports</Label>
        <div className="mt-2"><ReportList reports={d.reports.filter((r) => r.kind !== 'brief')} empty="No reports yet. They appear here as the agents write them." /></div>
      </section>

      <div className="flex gap-2"><Button onClick={() => go('chat/Ada')} tone="primary" className="flex-1">💬 Ask Ada</Button><Button onClick={load} className="flex-none">Refresh</Button></div>
    </div>
  );
}

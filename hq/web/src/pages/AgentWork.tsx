// Agent task lists (Alex 2026-11-25: "the task should be assigned to them, and we could see and ask
// for progress"). Shared by Team (the "Agent work" summary + a count on each card) and each agent's
// page (the tasks with status, due date, last update and a one-line progress note).
import { useCallback, useEffect, useState } from 'react';
import { api, type AgentTask, type AgentTaskStatus, type AgentWork, type BoardDue, type BoardStatus, type TeamBoard } from '../api';
import { Avatar, Card, cx, dueLabel, ErrorBox, go, Icon, IconButton, PageSkeleton, PageTitle, Pill, timeAgo } from '../ui';
import { chatHref } from './chatState';

export const STATUS_LABEL: Record<AgentTaskStatus, string> = { open: 'Not started', in_progress: 'In progress', waiting_alex: 'Waiting on you', done: 'Done' };
const STATUS_TONE: Record<AgentTaskStatus, 'plain' | 'info' | 'warn' | 'good'> = { open: 'plain', in_progress: 'info', waiting_alex: 'warn', done: 'good' };
export function StatusPill({ status }: { status: AgentTaskStatus }) {
  return <Pill tone={STATUS_TONE[status]}>{STATUS_LABEL[status]}</Pill>;
}

/** Chat opens a new chat with this question typed in (not sent): #/chat/<agent>?ask=… */
export function askForProgress(agent: string, title?: string) {
  go(chatHref(agent, { ask: title ? `Where is "${title}"? What's done, what's next, and by when?` : "What are you working on? Anything late or stuck?" }));
}
/** HQ replaces Airtable (Alex, 2026-11-27): links into Airtable are not shown. */
export const isAirtable = (href: string | null | undefined) => /^https:\/\/([a-z0-9-]+\.)*airtable\.com(\/|$)/i.test(String(href ?? ''));

/** "3 open · 1 late · 1 stuck" as small chips (nothing when there is nothing open). */
export function WorkChips({ w, className }: { w?: AgentWork; className?: string }) {
  if (!w || !w.open) return null;
  return (
    <span className={cx('inline-flex flex-wrap items-center gap-1.5', className)}>
      <span className="tabular text-xs font-medium text-fg-2">{w.open} task{w.open === 1 ? '' : 's'}</span>
      {w.overdue > 0 && <Pill tone="bad" className="px-2">{w.overdue} late</Pill>}
      {w.stalled > 0 && <Pill tone="warn" className="px-2">{w.stalled} stuck</Pill>}
      {w.waitingAlex > 0 && <Pill tone="accent" className="px-2">{w.waitingAlex} for you</Pill>}
    </span>
  );
}

/** Team's compact "Agent work": per agent open, late (overdue) and stuck (no update for 2+ days). */
export function WorkSummary({ work }: { work: ({ agent: string } & AgentWork)[] }) {
  const busy = work.filter((w) => w.open > 0);
  const total = (k: keyof AgentWork) => work.reduce((a, w) => a + w[k], 0);
  const quiet = work.filter((w) => !w.open).map((w) => w.agent);
  return (
    <Card className="mb-5 p-0">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b border-line px-5 py-3.5">
        <h2 className="text-sm font-semibold text-fg">Agent work</h2>
        <div className="tabular text-sm text-muted">
          <span className="font-semibold text-fg">{total('open')}</span> open
          <span aria-hidden="true"> · </span><span className={cx('font-semibold', total('overdue') ? 'text-bad' : 'text-fg')}>{total('overdue')}</span> late
          <span aria-hidden="true"> · </span><span className={cx('font-semibold', total('stalled') ? 'text-warn' : 'text-fg')}>{total('stalled')}</span> stuck
        </div>
      </div>
      {busy.length ? (
        <ul className="grid divide-y divide-line sm:grid-cols-2 sm:divide-y-0 lg:grid-cols-3">
          {busy.map((w) => (
            <li key={w.agent} className="min-w-0 sm:border-b sm:border-line">
              <button onClick={() => go(`agents/${w.agent}`)} className="flex min-h-14 w-full items-center gap-3 px-5 py-2.5 text-left transition hover:bg-hover" aria-label={`${w.agent}: ${w.open} open, ${w.overdue} late, ${w.stalled} stuck`}>
                <Avatar name={w.agent} size="sm" />
                <span className="min-w-0 flex-1">
                  <span className="block text-[15px] font-semibold text-fg">{w.agent}</span>
                  <span className="block truncate text-xs text-muted">{[w.inProgress && `${w.inProgress} in progress`, w.waitingAlex && `${w.waitingAlex} for you`].filter(Boolean).join(' · ') || 'Not started yet'}</span>
                </span>
                <span className="flex shrink-0 items-center gap-1.5">
                  <span className="tabular grid h-7 min-w-7 place-items-center rounded-full bg-sunken px-2 text-sm font-bold text-fg">{w.open}</span>
                  {w.overdue > 0 && <Pill tone="bad" className="px-2">{w.overdue} late</Pill>}
                  {w.stalled > 0 && <Pill tone="warn" className="px-2">{w.stalled} stuck</Pill>}
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : <div className="px-5 py-4 text-sm text-muted">No open tasks. Each agent opens its own when work starts (a bounce check, a new campaign).</div>}
      {busy.length > 0 && quiet.length > 0 && <div className="border-t border-line px-5 py-2.5 text-xs text-muted">Nothing open: {quiet.join(', ')}</div>}
    </Card>
  );
}

/** One task: status, title, progress note, due / last update, and Done. */
export function TaskRow({ t, onDone, showAgent }: { t: AgentTask; onDone?: (id: number) => void; showAgent?: boolean }) {
  const done = t.status === 'done';
  const late = t.overdue ? `${t.daysLate} d overdue` : '';
  const stuck = t.stalled ? `no update for ${t.daysQuiet} d` : '';
  return (
    <li className="flex items-start gap-1 pr-3 sm:pr-4">
      {onDone && !done ? (
        <button aria-label={`Mark "${t.title}" done`} onClick={() => onDone(t.id)} className="group grid h-12 w-12 shrink-0 place-items-center">
          <span className="grid h-[22px] w-[22px] place-items-center rounded-full border-2 border-line-strong text-transparent transition group-hover:border-accent group-hover:text-accent-ink"><Icon name="check" size={13} strokeWidth={3} /></span>
        </button>
      ) : (
        <span aria-hidden="true" className="grid h-12 w-12 shrink-0 place-items-center">
          {done ? <span className="grid h-[22px] w-[22px] place-items-center rounded-full bg-good-soft text-good"><Icon name="check" size={13} strokeWidth={3} /></span> : showAgent ? <Avatar name={t.agent} size="xs" /> : null}
        </span>
      )}
      <div className="min-w-0 flex-1 py-3">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <StatusPill status={t.status} />
          {late && <Pill tone="bad">{late}</Pill>}
          {stuck && <Pill tone="warn" icon="clock">{stuck}</Pill>}
        </div>
        <div className={cx('mt-1.5 break-words text-[15px] font-medium leading-snug', done ? 'text-muted' : 'text-fg')}>{t.title}</div>
        {(t.note || t.notes) && <p className="mt-0.5 break-words text-sm leading-relaxed text-fg-2">{t.note || t.notes}</p>}
        <div className="mt-1 flex flex-wrap gap-x-2 text-xs text-muted">
          {showAgent && <span className="font-medium text-fg-2">{t.agent}</span>}
          {!done && t.due && !late && <span>{dueLabel(t.due)}</span>}
          {done ? <span>done {timeAgo(t.done)}</span> : <span>updated {timeAgo(t.updated)}</span>}
          {t.client && <span className="truncate">{t.client}</span>}
        </div>
        {!done && t.link && !isAirtable(t.link) && (
          <button onClick={() => (/^https:\/\//i.test(t.link!) ? window.open(t.link!, '_blank', 'noopener,noreferrer') : go(t.link!.replace(/^#?\/?/, '')))} className="mt-1.5 inline-flex min-h-9 items-center gap-1 text-sm font-semibold text-accent-ink hover:underline">
            {t.status === 'waiting_alex' ? 'Open what it needs' : 'Open'}<Icon name="arrowRight" size={15} />
          </button>
        )}
      </div>
    </li>
  );
}

/** The agent page's list: open tasks, then (folded) the ones done in the last 7 days. */
export function TaskList({ tasks, agent, onDone }: { tasks: AgentTask[]; agent: string; onDone: (id: number) => void }) {
  const [showDone, setShowDone] = useState(false);
  const open = tasks.filter((t) => t.status !== 'done');
  const done = tasks.filter((t) => t.status === 'done');
  return (
    <Card className="p-0">
      {open.length ? <ul className="divide-y divide-line">{open.map((t) => <TaskRow key={t.id} t={t} onDone={onDone} />)}</ul>
        : <div className="px-5 py-4 text-sm text-muted">Nothing open on {agent}'s list.</div>}
      {done.length > 0 && (
        <div className="border-t border-line">
          <button onClick={() => setShowDone((v) => !v)} aria-expanded={showDone} className="flex min-h-12 w-full items-center justify-between gap-2 px-5 text-sm font-medium text-fg-2 transition hover:bg-hover">
            <span>Done in the last 7 days · {done.length}</span><Icon name="chevronDown" size={16} className={cx('text-muted transition', showDone && 'rotate-180')} />
          </button>
          {showDone && <ul className="divide-y divide-line border-t border-line anim-fade">{done.map((t) => <TaskRow key={t.id} t={t} />)}</ul>}
        </div>
      )}
    </Card>
  );
}

// ---------- Batch 4b: "What everyone is working on" (Alex, 2026-11-27) ----------
// A project board, team-wise: what each agent is on now and its next deadline, the tasks by status
// (In progress · Waiting on you · Not started · Done), upcoming deadlines and recent activity, with
// filters (agent, client, status, due) kept in the link (#/agents/work?agent=Atlas&status=late).

/** Team | What everyone is working on: the two views of the Team screen. */
export function TeamTabs({ on }: { on: 'team' | 'work' | 'talk' }) {
  const tab = (key: 'team' | 'work' | 'talk', label: string, path: string) => (
    <button role="tab" aria-selected={on === key} onClick={() => go(path)}
      className={cx('min-h-11 flex-1 rounded-xl px-3 text-sm font-semibold transition sm:flex-none sm:px-4', on === key ? 'bg-surface text-fg shadow-card' : 'text-muted hover:text-fg')}>{label}</button>
  );
  return (
    <div role="tablist" aria-label="Team views" className="mb-5 flex gap-1 rounded-2xl border border-line bg-sunken p-1 sm:inline-flex">
      {tab('team', 'Team', 'agents')}{tab('work', 'What everyone is working on', 'agents/work')}{tab('talk', 'Agent conversations', 'agents/talk')}
    </div>
  );
}

const STATUS_FILTERS: [BoardStatus, string][] = [['all', 'Any status'], ['in_progress', 'In progress'], ['waiting_alex', 'Waiting on you'], ['open', 'Not started'], ['late', 'Late'], ['stuck', 'Stuck'], ['done', 'Done (7 days)']];
const DUE_FILTERS: [BoardDue, string][] = [['any', 'Any due date'], ['overdue', 'Overdue'], ['today', 'Due today'], ['week', 'Due this week'], ['none', 'No due date']];
const COLUMNS: { status: AgentTaskStatus; title: string; dot: string }[] = [
  { status: 'in_progress', title: 'In progress', dot: 'bg-accent' },
  { status: 'waiting_alex', title: 'Waiting on you', dot: 'bg-dot-warn' },
  { status: 'open', title: 'Not started', dot: 'bg-dot-idle' },
  { status: 'done', title: 'Done (7 days)', dot: 'bg-dot-good' },
];
type Filters = { agent: string; client: string; status: BoardStatus; due: BoardDue };
const readFilters = (): Filters => {
  const q = new URLSearchParams(window.location.hash.split('?')[1] ?? '');
  const status = (q.get('status') ?? 'all') as BoardStatus, due = (q.get('due') ?? 'any') as BoardDue;
  return { agent: q.get('agent') ?? '', client: q.get('client') ?? '', status: STATUS_FILTERS.some(([k]) => k === status) ? status : 'all', due: DUE_FILTERS.some(([k]) => k === due) ? due : 'any' };
};
const filterQuery = (f: Filters) => {
  const q = new URLSearchParams();
  if (f.agent) q.set('agent', f.agent);
  if (f.client) q.set('client', f.client);
  if (f.status !== 'all') q.set('status', f.status);
  if (f.due !== 'any') q.set('due', f.due);
  return q.toString();
};
const SELECT = 'min-h-11 w-full min-w-0 rounded-xl border border-line bg-surface px-3 text-[15px] text-fg sm:w-auto';

export function TeamBoardView() {
  const [f, setF] = useState<Filters>(readFilters);
  const [b, setB] = useState<TeamBoard | null>(null);
  const [error, setError] = useState('');
  const load = useCallback(() => {
    setError('');
    const q = filterQuery(f);
    api<TeamBoard>(`/team/work${q ? `?${q}` : ''}`).then(setB).catch((e) => setError(e.message));
  }, [f]);
  useEffect(load, [load]);
  // A link from elsewhere (#/agents/work?agent=Atlas) while the board is open: follow it.
  useEffect(() => { const on = () => setF(readFilters()); window.addEventListener('hashchange', on); return () => window.removeEventListener('hashchange', on); }, []);
  const set = (patch: Partial<Filters>) => {
    const next = { ...f, ...patch };
    setF(next);
    const q = filterQuery(next);
    window.history.replaceState(null, '', `#/agents/work${q ? `?${q}` : ''}`);
  };
  const any = !!(f.agent || f.client || f.status !== 'all' || f.due !== 'any');
  const title = <PageTitle kicker="Team" title="What everyone is working on" sub="Each agent's work now, what is due next, and what happened in the last 3 days." right={<IconButton icon="refresh" label="Refresh" onClick={load} className="border border-line bg-surface" />} />;

  return (
    <div>
      {title}
      <TeamTabs on="work" />
      <div className="mb-5 grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:items-center" aria-label="Filters">
        <select aria-label="Agent" value={f.agent} onChange={(e) => set({ agent: e.target.value })} className={SELECT}>
          <option value="">Every agent</option>
          {(b?.agents ?? []).map((a) => <option key={a.agent} value={a.agent}>{a.agent}</option>)}
          {f.agent && !(b?.agents ?? []).some((a) => a.agent === f.agent) && <option value={f.agent}>{f.agent}</option>}
        </select>
        <select aria-label="Client" value={f.client} onChange={(e) => set({ client: e.target.value })} className={SELECT}>
          <option value="">Every client</option>
          {(b?.clients ?? []).map((c) => <option key={c} value={c}>{c}</option>)}
          {f.client && !(b?.clients ?? []).includes(f.client) && <option value={f.client}>{f.client}</option>}
        </select>
        <select aria-label="Status" value={f.status} onChange={(e) => set({ status: e.target.value as BoardStatus })} className={SELECT}>
          {STATUS_FILTERS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
        </select>
        <select aria-label="Due" value={f.due} onChange={(e) => set({ due: e.target.value as BoardDue })} className={SELECT}>
          {DUE_FILTERS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
        </select>
        {any && <button onClick={() => set({ agent: '', client: '', status: 'all', due: 'any' })} className="col-span-2 inline-flex min-h-11 items-center justify-center gap-1.5 rounded-xl px-3 text-sm font-semibold text-accent-ink hover:bg-hover sm:col-span-1"><Icon name="x" size={15} />Clear filters</button>}
      </div>

      {error && <ErrorBox error={error} retry={load} />}
      {!b && !error && <PageSkeleton kind="board" />}
      {b && (
        <>
          <section aria-label="Working on now" className="mb-6">
            <h2 className="mb-3 px-1 text-sm font-semibold text-fg">On it now</h2>
            <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {b.agents.map((a) => (
                <li key={a.agent} className="min-w-0">
                  <div className="flex h-full min-w-0 flex-col rounded-2xl border border-line bg-surface p-4 shadow-card">
                    <div className="flex items-center gap-3">
                      <Avatar name={a.agent} size="sm" />
                      <button onClick={() => set({ agent: f.agent === a.agent ? '' : a.agent })} className="min-w-0 flex-1 text-left" aria-label={`Show only ${a.agent}`}>
                        <span className="block text-[15px] font-semibold text-fg">{a.agent}</span>
                        <span className="block truncate text-xs text-muted">{a.role}</span>
                      </button>
                      <WorkChips w={{ open: a.open, inProgress: 0, waitingAlex: a.waitingAlex, overdue: a.late, stalled: a.stuck }} />
                    </div>
                    {a.current ? (
                      <div className="mt-3 min-w-0">
                        <div className="flex flex-wrap items-center gap-1.5"><StatusPill status={a.current.status} />{a.current.overdue && <Pill tone="bad">{a.current.daysLate} d late</Pill>}{a.current.stalled && <Pill tone="warn">stuck</Pill>}</div>
                        <div className="mt-1 break-words text-sm font-medium leading-snug text-fg">{a.current.title}</div>
                        {(a.current.note || a.current.notes) && <div className="mt-0.5 line-clamp-2 text-xs text-fg-2">{a.current.note || a.current.notes}</div>}
                      </div>
                    ) : <div className="mt-3 text-sm text-muted">Nothing open right now.</div>}
                    <div className="mt-auto flex flex-wrap items-center gap-x-3 gap-y-1 pt-3 text-xs text-muted">
                      {a.next && a.next.id !== a.current?.id && <span className="min-w-0 truncate">Next: <span className="font-medium text-fg-2">{a.next.title}</span> · {dueLabel(a.next.due ?? '')}</span>}
                      {a.next && a.next.id === a.current?.id && a.next.due && <span>{dueLabel(a.next.due)}</span>}
                      {a.lastRun && <span className={a.lastRun.ok ? '' : 'font-medium text-bad'}>last run {timeAgo(a.lastRun.at)}{a.lastRun.ok ? '' : ' (failed)'}</span>}
                      <button onClick={() => askForProgress(a.agent)} className="ml-auto inline-flex min-h-9 items-center gap-1 font-semibold text-accent-ink"><Icon name="message" size={13} />Ask for an update</button>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          </section>

          <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_300px]">
            <section aria-label="Tasks by status" className="grid min-w-0 content-start gap-4 md:grid-cols-2">
              {COLUMNS.map((c) => {
                const ts = b.tasks.filter((t) => t.status === c.status);
                return (
                  <div key={c.status} className="min-w-0">
                    <div className="mb-2 flex items-center gap-2 px-1">
                      <span aria-hidden="true" className={cx('h-2 w-2 rounded-full', c.dot)} />
                      <h2 className="text-sm font-semibold text-fg">{c.title}</h2>
                      <span className="tabular text-sm text-muted">{ts.length}</span>
                    </div>
                    {ts.length ? (
                      <Card className="p-0"><ul className="divide-y divide-line">{ts.slice(0, 25).map((t) => <TaskRow key={t.id} t={t} showAgent />)}</ul>{ts.length > 25 && <div className="border-t border-line px-4 py-2 text-xs text-muted">+{ts.length - 25} more: narrow the filters</div>}</Card>
                    ) : <div className="flex min-h-14 items-center rounded-2xl border border-dashed border-line px-4 text-sm text-muted">Nothing here.</div>}
                  </div>
                );
              })}
            </section>

            <aside className="min-w-0 space-y-6">
              <section aria-label="Upcoming deadlines">
                <h2 className="mb-2 flex items-center gap-2 px-1 text-sm font-semibold text-fg"><Icon name="calendar" size={15} className="text-muted" />Upcoming deadlines</h2>
                <Card className="p-0">
                  {b.deadlines.length ? (
                    <ul className="divide-y divide-line">
                      {b.deadlines.map((t) => (
                        <li key={t.id} className="flex items-start gap-3 px-4 py-2.5">
                          <Avatar name={t.agent} size="xs" className="mt-0.5" />
                          <div className="min-w-0 flex-1">
                            <div className="break-words text-sm font-medium leading-snug text-fg">{t.title}</div>
                            <div className="text-xs text-muted"><span className={t.overdue ? 'font-semibold text-bad' : ''}>{dueLabel(t.due ?? '')}</span>{t.client ? ` · ${t.client}` : ''}</div>
                          </div>
                        </li>
                      ))}
                    </ul>
                  ) : <div className="px-4 py-3 text-sm text-muted">Nothing due in the next 2 weeks.</div>}
                </Card>
              </section>
              <section aria-label="Recent activity">
                <h2 className="mb-2 flex items-center gap-2 px-1 text-sm font-semibold text-fg"><Icon name="activity" size={15} className="text-muted" />Recent activity</h2>
                <Card className="p-0">
                  {b.activity.length ? (
                    <ol className="px-4 py-1">
                      {b.activity.map((e, i) => (
                        <li key={i} className="flex gap-2.5 py-2">
                          <Avatar name={e.agent} size="xs" className="mt-0.5" />
                          <div className="min-w-0 flex-1">
                            <div className={cx('break-words text-sm leading-snug', e.kind === 'run_failed' ? 'text-bad' : 'text-fg-2')}><span className="font-semibold text-fg">{e.agent}</span> {e.text}</div>
                            <div className="text-xs text-muted">{timeAgo(e.at)}</div>
                          </div>
                        </li>
                      ))}
                    </ol>
                  ) : <div className="px-4 py-3 text-sm text-muted">Nothing in the last 3 days.</div>}
                </Card>
              </section>
            </aside>
          </div>
        </>
      )}
    </div>
  );
}

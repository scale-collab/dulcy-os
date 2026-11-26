// Agent task lists (Alex 2026-11-25: "the task should be assigned to them, and we could see and ask
// for progress"). Shared by Team (the "Agent work" summary + a count on each card) and each agent's
// page (the tasks with status, due date, last update and a one-line progress note).
import { useState } from 'react';
import type { AgentTask, AgentTaskStatus, AgentWork } from '../api';
import { Avatar, Card, cx, dueLabel, go, Icon, Pill, timeAgo } from '../ui';

export const STATUS_LABEL: Record<AgentTaskStatus, string> = { open: 'Not started', in_progress: 'In progress', waiting_alex: 'Waiting on you', done: 'Done' };
const STATUS_TONE: Record<AgentTaskStatus, 'plain' | 'info' | 'warn' | 'good'> = { open: 'plain', in_progress: 'info', waiting_alex: 'warn', done: 'good' };
export function StatusPill({ status }: { status: AgentTaskStatus }) {
  return <Pill tone={STATUS_TONE[status]}>{STATUS_LABEL[status]}</Pill>;
}

/** Chat opens with this question typed in (Chat reads it once). */
export function askForProgress(agent: string, title?: string) {
  try { sessionStorage.setItem('hq:chat-draft', title ? `Where is "${title}"? What's done, what's next, and by when?` : "What are you working on? Anything late or stuck?"); } catch { /* private mode */ }
  go(`chat/${agent}`);
}

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
        {!done && t.link && (
          <button onClick={() => go(t.link!.replace(/^#?\/?/, ''))} className="mt-1.5 inline-flex min-h-9 items-center gap-1 text-sm font-semibold text-accent-ink hover:underline">
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

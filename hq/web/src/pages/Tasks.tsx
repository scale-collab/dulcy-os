import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { api, type Box, type Task } from '../api';
import { BackLink, Button, Card, cx, dueLabel, Empty, ErrorBox, Icon, Label, PageSkeleton, PageTitle, Pill, Progress, Section, setCount } from '../ui';

const BOXES: { key: Box; title: string; hint: string; bar: string; dot: string }[] = [
  { key: 'doNow', title: 'Do now', hint: 'Urgent and important', bar: 'bg-dot-bad', dot: 'bg-dot-bad' },
  { key: 'schedule', title: 'Schedule', hint: 'Important, not urgent', bar: 'bg-info', dot: 'bg-info' },
  { key: 'delegate', title: 'Delegate', hint: 'Urgent, not important', bar: 'bg-dot-warn', dot: 'bg-dot-warn' },
  { key: 'later', title: 'Later / drop', hint: 'Neither', bar: 'bg-dot-idle', dot: 'bg-dot-idle' },
];
interface TasksData { boxes: Record<Box, Task[]>; doneQuestions: Task[]; total: number }

export default function Tasks() {
  const [d, setD] = useState<TasksData | null>(null);
  const [error, setError] = useState('');
  const [focus, setFocus] = useState(false);
  const [gone, setGone] = useState<string[]>([]);
  const load = useCallback(() => { setError(''); api<TasksData>('/tasks').then((x) => { setD(x); setGone([]); setCount('doNow', x.boxes.doNow.length); }).catch((e) => setError(e.message)); }, []);
  useEffect(load, [load]);
  const done = async (id: string) => { setGone((g) => [...g, id]); try { await api(`/tasks/${id}/done`, { body: {} }); } catch (e) { setGone((g) => g.filter((x) => x !== id)); setError((e as Error).message); } };
  const notYet = async (id: string) => { setGone((g) => [...g, `q:${id}`]); try { await api(`/tasks/${id}/not-yet`, { body: {} }); } catch { /* asked again next time */ } };
  useEffect(() => { if (d) setCount('doNow', d.boxes.doNow.filter((t) => !gone.includes(t.id)).length); }, [d, gone]);

  if (error && !d) return <><PageTitle title="To-do" /><ErrorBox error={error} retry={load} /></>;
  if (!d) return <><PageTitle title="To-do" /><PageSkeleton kind="board" /></>;
  const live = (ts: Task[]) => ts.filter((t) => !gone.includes(t.id));
  const ordered = BOXES.flatMap((b) => live(d.boxes[b.key]));
  if (focus) return <Focus tasks={ordered} onDone={done} onExit={() => { setFocus(false); load(); }} />;
  const questions = d.doneQuestions.filter((t) => !gone.includes(t.id) && !gone.includes(`q:${t.id}`));

  return (
    <div>
      <PageTitle title="To-do" kicker={`${ordered.length} open · sorted by urgent and important`}
        right={<Button tone="primary" icon="play" disabled={!ordered.length} onClick={() => setFocus(true)}>Start</Button>} />
      {error && <div className="mb-4"><ErrorBox error={error} /></div>}
      <QuickAdd onAdded={load} />

      {questions.length > 0 && (
        <section className="mt-6">
          <Label className="mb-2">Done already?</Label>
          <div className="grid gap-2 md:grid-cols-2">
            {questions.map((t) => (
              <div key={t.id} className="flex flex-col gap-3 rounded-2xl border border-line bg-warn-soft p-4 sm:flex-row sm:items-center">
                <div className="min-w-0 flex-1"><div className="font-medium text-fg">{t.name}</div><div className="text-sm text-fg-2">In Review/QA for 7+ days{t.client ? ` · ${t.client}` : ''}</div></div>
                <div className="grid shrink-0 grid-cols-2 gap-2"><Button onClick={() => void notYet(t.id)}>Not yet</Button><Button tone="accent" icon="check" onClick={() => void done(t.id)}>Done</Button></div>
              </div>
            ))}
          </div>
        </section>
      )}

      <div className="mt-6 grid items-start gap-4 md:grid-cols-2 xl:grid-cols-4">
        {BOXES.map((b) => <Quadrant key={b.key} box={b} tasks={live(d.boxes[b.key])} onDone={(id) => void done(id)} />)}
      </div>
    </div>
  );
}

function Quadrant({ box, tasks, onDone }: { box: (typeof BOXES)[number]; tasks: Task[]; onDone: (id: string) => void }) {
  const [all, setAll] = useState(false);
  const cap = all ? 30 : 8;
  return (
    <section aria-label={box.title} className={cx('overflow-hidden rounded-2xl border bg-surface shadow-card', box.key === 'doNow' ? 'border-line-strong' : 'border-line')}>
      <div aria-hidden="true" className={cx('h-1', box.bar)} />
      <div className="flex items-start justify-between gap-2 px-4 pb-2 pt-3.5">
        <div><h2 className="flex items-center gap-2 font-semibold text-fg">{box.title}</h2><div className="text-xs text-muted">{box.hint}</div></div>
        <span className="tabular rounded-full border border-line bg-sunken px-2.5 py-0.5 text-sm font-bold text-fg-2">{tasks.length}</span>
      </div>
      <ul className="px-1.5 pb-2">
        {tasks.slice(0, cap).map((t) => <TaskRow key={t.id} t={t} onDone={() => onDone(t.id)} />)}
      </ul>
      {!tasks.length && <div className="px-4 pb-4 text-sm text-muted">Nothing here.</div>}
      {tasks.length > cap && !all && <button onClick={() => setAll(true)} className="flex min-h-11 w-full items-center justify-center gap-1 border-t border-line text-sm font-medium text-accent-ink hover:bg-hover">Show {Math.min(30, tasks.length) - cap} more<Icon name="chevronDown" size={15} /></button>}
      {all && tasks.length > 30 && <div className="border-t border-line px-4 py-2.5 text-xs text-muted">+{tasks.length - 30} more in Airtable</div>}
    </section>
  );
}

function TaskRow({ t, onDone }: { t: Task; onDone: () => void }) {
  const [checked, setChecked] = useState(false);
  const tick = () => { if (checked) return; setChecked(true); setTimeout(onDone, 320); };
  return (
    <li className={cx('flex items-start gap-1 rounded-xl pr-2 transition duration-300 hover:bg-hover', checked && 'opacity-40')}>
      <button aria-label={`Mark "${t.name}" done`} onClick={tick} className="group grid h-11 w-11 shrink-0 place-items-center rounded-xl">
        <span className={cx('grid h-[22px] w-[22px] place-items-center rounded-full border-2 transition', checked ? 'border-accent bg-accent text-accent-fg' : 'border-line-strong text-transparent group-hover:border-accent group-hover:text-accent-ink')}>
          <Icon name="check" size={13} strokeWidth={3} />
        </span>
      </button>
      <div className="min-w-0 flex-1 py-2.5">
        <div className={cx('line-clamp-2 text-[15px] leading-snug text-fg', checked && 'line-through')}>{t.name}</div>
        {(t.due || t.client || (t.priority && t.priority !== 'Medium') || t.clientFacing) && (
          <div className="mt-1 flex flex-wrap gap-x-2 gap-y-1 text-xs text-muted">
            {t.due && <span className={cx('inline-flex items-center gap-1', t.overdue && 'font-semibold text-bad')}><Icon name="clock" size={12} />{dueLabel(t.due)}</span>}
            {t.client && <span>{t.client}</span>}
            {t.priority && t.priority !== 'Medium' && <span className={t.priority === 'Urgent' ? 'font-medium text-bad' : t.priority === 'High' ? 'font-medium text-warn' : ''}>{t.priority}</span>}
            {t.clientFacing && <span>client facing</span>}
          </div>
        )}
      </div>
    </li>
  );
}

function QuickAdd({ onAdded }: { onAdded: () => void }) {
  const [name, setName] = useState('');
  const [due, setDue] = useState('');
  const [priority, setPriority] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setBusy(true); setError('');
    try { await api('/tasks', { body: { name, due: due || undefined, priority: priority || undefined } }); setName(''); setDue(''); setPriority(''); onAdded(); }
    catch (err) { setError((err as Error).message); } finally { setBusy(false); }
  };
  const field = 'min-h-11 rounded-xl border border-line-strong bg-surface px-3 text-[15px] text-fg outline-none transition focus:border-accent focus:ring-4 focus:ring-accent-soft';
  return (
    <form onSubmit={submit} className="rounded-2xl border border-line bg-surface p-2 shadow-card">
      <div className="flex items-center gap-2">
        <Icon name="plus" size={18} className="ml-2.5 text-muted" />
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Add a task…" aria-label="New task" maxLength={250}
          className="min-h-11 min-w-0 flex-1 bg-transparent text-[16px] text-fg outline-none placeholder:text-muted focus-visible:outline-none" />
        <Button type="submit" tone="primary" disabled={busy || !name.trim()}>Add</Button>
      </div>
      {name && (
        <div className="mt-2 flex gap-2 border-t border-line px-1 pt-2 anim-fade">
          <input type="date" value={due} onChange={(e) => setDue(e.target.value)} className={cx(field, 'min-w-0 flex-1')} aria-label="Due date" />
          <select value={priority} onChange={(e) => setPriority(e.target.value)} className={cx(field, 'min-w-0 flex-1')} aria-label="Priority">
            <option value="">Priority</option><option>Urgent</option><option>High</option><option>Medium</option><option>Low</option>
          </select>
        </div>
      )}
      {error && <div className="mt-2"><ErrorBox error={error} /></div>}
    </form>
  );
}

const fmt = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

/** One task at a time, highest priority first, with a timer (like the Daily Run). */
function Focus({ tasks, onDone, onExit }: { tasks: Task[]; onDone: (id: string) => Promise<void>; onExit: () => void }) {
  const [skipped, setSkipped] = useState<string[]>([]);
  const [finished, setFinished] = useState<string[]>([]);
  const [started, setStarted] = useState(false);
  const [paused, setPaused] = useState(false);
  const [secs, setSecs] = useState(0);
  const queue = tasks.filter((t) => !skipped.includes(t.id) && !finished.includes(t.id));
  const current = queue[0];
  useEffect(() => { if (!started || paused) return; const t = setInterval(() => setSecs((s) => s + 1), 1000); return () => clearInterval(t); }, [started, paused]);
  useEffect(() => { setStarted(false); setPaused(false); setSecs(0); }, [current?.id]);
  const total = tasks.length;
  return (
    <div className="mx-auto max-w-2xl">
      <div className="flex items-center justify-between"><BackLink label="All tasks" onClick={onExit} /><span className="mb-3 text-xs font-medium text-muted">One thing at a time</span></div>
      <Progress done={finished.length + skipped.length} total={total} />
      {!current ? (
        <Card className="mt-5"><Empty icon="flag" tone="good" title="Day cleared" sub={`${finished.length} done${skipped.length ? ` · ${skipped.length} skipped` : ''}`}><Button tone="primary" onClick={onExit}>Back to the list</Button></Empty></Card>
      ) : (
        <>
          <Card key={current.id} className="mt-5 anim-in sm:p-7">
            <div className="flex flex-wrap items-center gap-2">
              {current.box === 'doNow' && <Pill tone="bad">Do now</Pill>}
              {current.priority && <Pill>{current.priority}</Pill>}
              {current.due && <span className={cx('inline-flex items-center gap-1 text-xs', current.overdue ? 'font-semibold text-bad' : 'text-muted')}><Icon name="clock" size={12} />{dueLabel(current.due)}</span>}
              {current.client && <span className="text-xs text-muted">· {current.client}</span>}
            </div>
            <h2 className="mt-3 text-2xl font-semibold leading-snug tracking-tight">{current.name}</h2>
            {started ? (
              <>
                <div className={cx('tabular mt-6 text-6xl font-semibold tracking-tight', paused ? 'text-muted' : 'text-fg')}>{fmt(secs)}</div>
                <Section label="Notes" text={current.notes || 'No notes on this task.'} />
              </>
            ) : <p className="mt-3 text-[15px] text-muted">Press Start when you begin.</p>}
          </Card>
          <div className="mt-4 grid grid-cols-3 gap-2">
            <Button onClick={() => setSkipped((s) => [...s, current.id])}>Skip</Button>
            {!started ? <Button tone="primary" icon="play" className="col-span-2" onClick={() => setStarted(true)}>Start</Button> : (
              <>
                <Button icon={paused ? 'play' : 'pause'} onClick={() => setPaused((p) => !p)}>{paused ? 'Resume' : 'Pause'}</Button>
                <Button tone="accent" icon="check" onClick={() => { setFinished((f) => [...f, current.id]); void onDone(current.id); }}>Done</Button>
              </>
            )}
          </div>
        </>
      )}
    </div>
  );
}

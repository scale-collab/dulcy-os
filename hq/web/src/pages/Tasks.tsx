import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { api, type Box, type Task } from '../api';
import { Button, Card, cx, dueLabel, Empty, ErrorBox, Label, Loading, PageTitle, Pill, Progress, Section } from '../ui';

const BOXES: { key: Box; title: string; hint: string }[] = [
  { key: 'doNow', title: 'Do now', hint: 'Urgent and important' },
  { key: 'schedule', title: 'Schedule', hint: 'Important, not urgent' },
  { key: 'delegate', title: 'Delegate', hint: 'Urgent, not important' },
  { key: 'later', title: 'Later / drop', hint: 'Neither' },
];
interface TasksData { boxes: Record<Box, Task[]>; doneQuestions: Task[]; total: number }

export default function Tasks() {
  const [d, setD] = useState<TasksData | null>(null);
  const [error, setError] = useState('');
  const [focus, setFocus] = useState(false);
  const [gone, setGone] = useState<string[]>([]);
  const [openBox, setOpenBox] = useState<Box | null>('doNow');
  const load = useCallback(() => { setError(''); api<TasksData>('/tasks').then((x) => { setD(x); setGone([]); }).catch((e) => setError(e.message)); }, []);
  useEffect(load, [load]);
  const done = async (id: string) => { setGone((g) => [...g, id]); try { await api(`/tasks/${id}/done`, { body: {} }); } catch (e) { setGone((g) => g.filter((x) => x !== id)); setError((e as Error).message); } };
  const notYet = async (id: string) => { setGone((g) => [...g, `q:${id}`]); try { await api(`/tasks/${id}/not-yet`, { body: {} }); } catch { /* asked again next time */ } };

  if (error && !d) return <><PageTitle title="To-do" /><ErrorBox error={error} retry={load} /></>;
  if (!d) return <><PageTitle title="To-do" /><Loading /></>;
  const live = (ts: Task[]) => ts.filter((t) => !gone.includes(t.id));
  const ordered = BOXES.flatMap((b) => live(d.boxes[b.key]));
  if (focus) return <Focus tasks={ordered} onDone={done} onExit={() => { setFocus(false); load(); }} />;
  const questions = d.doneQuestions.filter((t) => !gone.includes(t.id) && !gone.includes(`q:${t.id}`));

  return (
    <div className="space-y-6">
      <PageTitle title="To-do" kicker={`${ordered.length} open`} right={<Button tone="primary" disabled={!ordered.length} onClick={() => setFocus(true)}>▶ Start</Button>} />
      {error && <ErrorBox error={error} />}
      <QuickAdd onAdded={load} />

      {questions.length > 0 && (
        <section>
          <Label>Done already?</Label>
          <div className="mt-2 space-y-2">
            {questions.map((t) => (
              <Card key={t.id} className="p-4">
                <div className="font-medium">{t.name}</div>
                <div className="text-sm text-stone-500 dark:text-stone-400">In Review/QA for 7+ days{t.client ? ` · ${t.client}` : ''}</div>
                <div className="mt-3 grid grid-cols-2 gap-2"><Button onClick={() => void notYet(t.id)}>Not yet</Button><Button tone="good" onClick={() => void done(t.id)}>✓ Yes, done</Button></div>
              </Card>
            ))}
          </div>
        </section>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        {BOXES.map((b) => {
          const ts = live(d.boxes[b.key]);
          const open = openBox === b.key || typeof window !== 'undefined' && window.innerWidth >= 640;
          return (
            <section key={b.key} className={cx('rounded-2xl border p-4', b.key === 'doNow' ? 'border-stone-900/20 bg-white dark:border-white/20 dark:bg-white/[0.05]' : 'border-stone-200/80 bg-white/60 dark:border-white/10 dark:bg-white/[0.02]')}>
              <button onClick={() => setOpenBox(openBox === b.key ? null : b.key)} className="flex w-full items-center justify-between text-left">
                <div><div className="font-semibold">{b.title}</div><div className="text-xs text-stone-500 dark:text-stone-400">{b.hint}</div></div>
                <span className="rounded-full bg-stone-100 px-3 py-1 text-sm font-bold dark:bg-white/10">{ts.length}</span>
              </button>
              {open && (
                <div className="mt-3 space-y-1">
                  {ts.slice(0, 30).map((t) => <TaskRow key={t.id} t={t} onDone={() => void done(t.id)} />)}
                  {!ts.length && <div className="py-2 text-sm text-stone-400">Empty.</div>}
                  {ts.length > 30 && <div className="pt-1 text-xs text-stone-400">+{ts.length - 30} more in Airtable</div>}
                </div>
              )}
            </section>
          );
        })}
      </div>
    </div>
  );
}

function TaskRow({ t, onDone }: { t: Task; onDone: () => void }) {
  return (
    <div className="flex items-center gap-3 rounded-xl px-1 py-1.5">
      <button aria-label={`Mark "${t.name}" done`} onClick={onDone} className="grid h-8 w-8 shrink-0 place-items-center rounded-full border-2 border-stone-300 text-transparent hover:border-accent hover:text-accent dark:border-white/25">✓</button>
      <div className="min-w-0 flex-1">
        <div className="truncate text-[15px]">{t.name}</div>
        <div className="flex flex-wrap gap-x-2 text-xs text-stone-500 dark:text-stone-400">
          {t.due && <span className={t.overdue ? 'font-semibold text-red-600 dark:text-red-300' : ''}>{dueLabel(t.due)}</span>}
          {t.client && <span>{t.client}</span>}
          {t.priority && t.priority !== 'Medium' && <span>{t.priority}</span>}
          {t.clientFacing && <span>client facing</span>}
        </div>
      </div>
    </div>
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
  const field = 'min-h-12 rounded-xl border border-stone-300 bg-white px-3 text-[15px] outline-none focus:border-stone-500 dark:border-white/15 dark:bg-white/5';
  return (
    <form onSubmit={submit} className="space-y-2">
      <div className="flex gap-2">
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Add a task…" maxLength={250} className={cx(field, 'min-w-0 flex-1')} />
        <Button type="submit" tone="primary" disabled={busy || !name.trim()}>Add</Button>
      </div>
      {name && (
        <div className="flex gap-2">
          <input type="date" value={due} onChange={(e) => setDue(e.target.value)} className={cx(field, 'flex-1')} aria-label="Due date" />
          <select value={priority} onChange={(e) => setPriority(e.target.value)} className={cx(field, 'flex-1')} aria-label="Priority">
            <option value="">Priority</option><option>Urgent</option><option>High</option><option>Medium</option><option>Low</option>
          </select>
        </div>
      )}
      {error && <ErrorBox error={error} />}
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
    <div>
      <div className="mb-3 flex items-center justify-between"><button onClick={onExit} className="text-sm text-stone-500 hover:text-stone-800 dark:text-stone-400 dark:hover:text-white">← All tasks</button><span className="text-xs text-stone-400">One thing at a time</span></div>
      <Progress done={finished.length + skipped.length} total={total} />
      {!current ? <Empty icon="🏁" title="Day cleared" sub={`${finished.length} done${skipped.length ? ` · ${skipped.length} skipped` : ''}`} /> : (
        <>
          <Card className="mt-4">
            <div className="flex flex-wrap items-center gap-2">
              {current.box === 'doNow' && <Pill tone="bad">Do now</Pill>}
              {current.priority && <Pill>{current.priority}</Pill>}
              {current.due && <span className="text-xs text-stone-500 dark:text-stone-400">{dueLabel(current.due)}</span>}
              {current.client && <span className="text-xs text-stone-500 dark:text-stone-400">· {current.client}</span>}
            </div>
            <h2 className="mt-2 text-xl font-semibold">{current.name}</h2>
            {started ? (
              <>
                <div className="mt-4 text-4xl font-semibold tabular-nums">{fmt(secs)}</div>
                <Section label="Notes" text={current.notes || 'No notes on this task.'} />
              </>
            ) : <p className="mt-3 text-sm text-stone-500 dark:text-stone-400">Press Start when you begin.</p>}
          </Card>
          <div className="mt-4 grid grid-cols-3 gap-2">
            <Button onClick={() => setSkipped((s) => [...s, current.id])}>Skip</Button>
            {!started ? <Button tone="primary" className="col-span-2" onClick={() => setStarted(true)}>▶ Start</Button> : (
              <>
                <Button onClick={() => setPaused((p) => !p)}>{paused ? '▶ Resume' : '⏸ Pause'}</Button>
                <Button tone="good" onClick={() => { setFinished((f) => [...f, current.id]); void onDone(current.id); }}>✓ Done</Button>
              </>
            )}
          </div>
        </>
      )}
    </div>
  );
}

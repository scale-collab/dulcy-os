// Fix it (Alex, 2026-11-27): every agent suggestion on an HQ screen gets two buttons.
//   "Have <Agent> fix it" → the suggestion goes on that agent's own task list (Team), POST /fix-it.
//   "I'll look"           → hides the buttons on this device (you handle it yourself).
// Nothing is sent, launched or changed by pressing it: the agent picks the task up.
//
// Use: <FixItButton agent="Riley" title="Friday's placement scores may not arrive" detail="…" client="Twenty West" />
import { useState } from 'react';
import { api } from './api';
import { Button, cx, go, Icon } from './ui';

export interface FixItProps {
  /** The agent who suggested it and will fix it, e.g. "Riley". */
  agent: string;
  /** One line: what to fix (becomes the task title). */
  title: string;
  /** The suggestion's detail (becomes the task notes). */
  detail?: string;
  /** The client it is about, if any. */
  client?: string;
  className?: string;
}

const KEY = 'hq.fixit.looked';
const idOf = (p: Pick<FixItProps, 'agent' | 'title' | 'client'>) => `${p.agent}|${p.client ?? ''}|${p.title}`.toLowerCase().slice(0, 300);
function readLooked(): string[] { try { const v = JSON.parse(localStorage.getItem(KEY) ?? '[]'); return Array.isArray(v) ? v.map(String) : []; } catch { return []; } }
function writeLooked(ids: string[]) { try { localStorage.setItem(KEY, JSON.stringify(ids.slice(-200))); } catch { /* private window */ } }

/** True when someone pressed "I'll look" on this suggestion on this device (a screen may hide it). */
export function fixItLooked(p: Pick<FixItProps, 'agent' | 'title' | 'client'>): boolean { return readLooked().includes(idOf(p)); }

type State = { kind: 'idle' } | { kind: 'busy' } | { kind: 'queued'; created: boolean } | { kind: 'looked' } | { kind: 'error'; text: string };

export function FixItButton({ agent, title, detail, client, className }: FixItProps) {
  const id = idOf({ agent, title, client });
  const [state, setState] = useState<State>(() => (readLooked().includes(id) ? { kind: 'looked' } : { kind: 'idle' }));
  const name = agent.trim() ? agent.trim()[0].toUpperCase() + agent.trim().slice(1) : 'the agent';

  const fix = async () => {
    setState({ kind: 'busy' });
    try {
      const r = await api<{ task: { created: boolean } }>('/fix-it', { body: { agent, title, detail: detail ?? '', client: client ?? '', link: window.location.hash.replace(/^#\/?/, '') } });
      setState({ kind: 'queued', created: r.task.created });
    } catch (e) { setState({ kind: 'error', text: (e as Error).message }); }
  };
  const look = () => { writeLooked([...readLooked().filter((x) => x !== id), id]); setState({ kind: 'looked' }); };
  const undoLook = () => { writeLooked(readLooked().filter((x) => x !== id)); setState({ kind: 'idle' }); };

  if (state.kind === 'queued') {
    return (
      <div role="status" className={cx('flex flex-wrap items-center gap-x-3 gap-y-1 text-sm', className)}>
        <span className="inline-flex items-center gap-1.5 font-medium text-good"><Icon name="check" size={15} strokeWidth={2.4} />{state.created ? `On ${name}'s list` : `Already on ${name}'s list`}</span>
        <button onClick={() => go(`agents/${name}`)} className="min-h-9 font-medium text-accent-ink underline-offset-2 hover:underline">See {name}'s tasks</button>
      </div>
    );
  }
  if (state.kind === 'looked') {
    return (
      <div className={cx('flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted', className)}>
        <span className="inline-flex items-center gap-1.5"><Icon name="user" size={15} />You said you'd look</span>
        <button onClick={undoLook} className="min-h-9 font-medium text-accent-ink underline-offset-2 hover:underline">Undo</button>
      </div>
    );
  }
  return (
    <div className={cx('flex flex-wrap items-center gap-2', className)}>
      <Button tone="accent" icon="wrench" disabled={state.kind === 'busy'} onClick={() => void fix()} className="min-h-10 px-3 text-sm">
        {state.kind === 'busy' ? 'Adding…' : `Have ${name} fix it`}
      </Button>
      <Button tone="ghost" disabled={state.kind === 'busy'} onClick={look} className="min-h-10 px-3 text-sm">I'll look</Button>
      {state.kind === 'error' && <span role="alert" className="w-full text-sm text-bad">{state.text}</span>}
    </div>
  );
}

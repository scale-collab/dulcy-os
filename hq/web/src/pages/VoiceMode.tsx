// Voice mode (Alex, 2026-11-28: "call and talk to the agents, like how GPT does it"). A big Talk
// button opens a full-screen voice screen for one agent: an orb that shows listening / thinking /
// speaking, the live transcript, and End. It talks into the SAME chat as HQ Chat (what you say is a
// normal message there; the answers stay in the chat). Hands-free: it hears when you stop talking,
// and talking while the agent speaks interrupts it. Read only like every chat: voice never approves
// a decision or sends anything.
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { api } from '../api';
import { AGENT_COLOR, Avatar, cx, Icon } from '../ui';
import { unlockAudio, voiceSupported, VoiceSession, type VoiceStatus } from './voiceSession';

interface Status { on: boolean; reason: string; maxSeconds: number; turnsPerHour: number }
interface Line { who: 'you' | 'agent'; text: string; key: number }

const LABEL: Record<VoiceStatus, string> = {
  starting: 'Starting…', listening: 'Listening', hearing: 'Listening', thinking: 'Thinking…', speaking: 'Speaking', stopped: 'Ended',
};

/** The Talk button. `onClosed` gets the chat the voice turns went into (to reload it). */
export function TalkButton({ agent, threadId, onClosed, size = 'md', className, disabled }: {
  agent: string; threadId: number | null; onClosed?: (threadId: number | null) => void; size?: 'md' | 'sm'; className?: string; disabled?: boolean;
}) {
  const [ctx, setCtx] = useState<AudioContext | null | undefined>(undefined); // undefined = closed
  const open = () => setCtx(unlockAudio()); // inside the tap: lets the phone play the answers
  return (
    <>
      <button type="button" onClick={open} disabled={disabled} aria-label={`Talk to ${agent}`} title={`Talk to ${agent} by voice`}
        className={cx('inline-flex shrink-0 items-center justify-center gap-2 rounded-xl font-semibold text-white shadow-card transition active:scale-95 disabled:opacity-40',
          size === 'md' ? 'h-11 px-4 text-sm' : 'h-11 w-11 sm:w-auto sm:px-3 text-xs', className)}
        style={{ background: AGENT_COLOR[agent] ?? 'var(--accent)' }}>
        <Icon name="waves" size={size === 'md' ? 17 : 16} strokeWidth={2.2} />
        <span className={size === 'sm' ? 'hidden sm:inline' : ''}>Talk</span>
      </button>
      {/* On <body>: full screen above the menus whatever the button sits in. */}
      {ctx !== undefined && createPortal(<VoiceMode agent={agent} threadId={threadId} ctx={ctx} onClose={(id) => { void ctx?.close().catch(() => undefined); setCtx(undefined); onClosed?.(id); }} />, document.body)}
    </>
  );
}

export default function VoiceMode({ agent, threadId, ctx, onClose }: { agent: string; threadId: number | null; ctx: AudioContext | null; onClose: (threadId: number | null) => void }) {
  const [status, setStatus] = useState<VoiceStatus>('starting');
  const [off, setOff] = useState<string>('');
  const [problem, setProblem] = useState<{ text: string; fatal: boolean } | null>(null);
  const [lines, setLines] = useState<Line[]>([]);
  const session = useRef<VoiceSession | null>(null);
  const orb = useRef<HTMLDivElement>(null);
  const ring = useRef<HTMLDivElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const key = useRef(0);
  const endBtn = useRef<HTMLButtonElement>(null);
  const color = AGENT_COLOR[agent] ?? '#4f46e5';

  useEffect(() => {
    let live = true;
    const prev = document.body.style.overflow; document.body.style.overflow = 'hidden';
    endBtn.current?.focus();
    (async () => {
      if (!voiceSupported() || !ctx) { setOff('This browser cannot record. Use Safari on iPhone or Chrome, Edge or Safari on a computer.'); return; }
      let st: Status;
      try { st = await api<Status>('/voice/status'); } catch (e) { if (live) setOff((e as Error).message); return; }
      if (!live) return;
      if (!st.on) { setOff(st.reason); return; }
      const s = new VoiceSession(ctx, { agent, threadId, maxSeconds: st.maxSeconds }, {
        status: (x) => { if (live) { setStatus(x); if (x === 'hearing') setProblem((p) => (p?.fatal ? p : null)); } },
        level: (v) => {
          // Straight to the DOM (20 times a second): no re-render.
          const k = 1 + v * 0.35;
          if (orb.current) orb.current.style.setProperty('--lvl', String(k));
          if (ring.current) ring.current.style.opacity = String(Math.min(0.6, v * 1.2));
        },
        heard: (text) => { if (live) setLines((ls) => [...ls, { who: 'you' as const, text, key: ++key.current }].slice(-12)); },
        answer: (text) => { if (live) setLines((ls) => [...ls, { who: 'agent' as const, text, key: ++key.current }].slice(-12)); },
        problem: (text, fatal) => { if (live) setProblem({ text, fatal }); },
      });
      session.current = s;
      await s.start();
    })();
    return () => { live = false; document.body.style.overflow = prev; session.current?.end(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => { const el = list.current; if (el) el.scrollTop = el.scrollHeight; }, [lines.length]);

  const end = () => { const id = session.current?.threadId ?? threadId; session.current?.end(); onClose(id); };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') end(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const shown: VoiceStatus = off || problem?.fatal ? 'stopped' : status;
  const hint = off ? '' : problem?.fatal ? '' : shown === 'speaking' ? 'Talk to interrupt' : shown === 'thinking' ? `${agent} is looking it up` : shown === 'listening' || shown === 'hearing' ? 'Go ahead, I stop when you pause' : '';

  return (
    <div role="dialog" aria-modal="true" aria-label={`Voice with ${agent}`} className="fixed inset-0 z-[70] flex flex-col bg-bg anim-fade"
      style={{ backgroundImage: `radial-gradient(120% 70% at 50% 38%, ${color}26 0%, transparent 62%)` }}>
      {/* Top: who, and close */}
      <div className="mx-auto flex w-full max-w-3xl items-center gap-3 px-4 pt-[calc(env(safe-area-inset-top)+0.75rem)] sm:px-6">
        <Avatar name={agent} size="sm" round />
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-semibold text-fg">{agent}</div>
          <div className="truncate text-xs text-muted">Voice · same chat as HQ Chat · read only</div>
        </div>
        <button type="button" onClick={end} aria-label="Close voice" className="grid h-11 w-11 place-items-center rounded-full text-fg-2 transition hover:bg-hover"><Icon name="x" size={20} /></button>
      </div>

      {/* The orb */}
      <div className="flex flex-1 flex-col items-center justify-center px-6">
        <div className={cx('relative grid place-items-center', shown === 'listening' || shown === 'hearing' ? 'orb-listening' : '', shown === 'thinking' && 'orb-thinking')}>
          {(shown === 'listening' || shown === 'hearing' || shown === 'speaking') && <div aria-hidden="true" className="orb-ring absolute inset-0 rounded-full" style={{ border: `2px solid ${color}` }} />}
          <div ref={ring} aria-hidden="true" className="absolute -inset-6 rounded-full blur-2xl transition-opacity duration-150" style={{ background: color, opacity: 0 }} />
          <div ref={orb} aria-hidden="true"
            className={cx('relative h-40 w-40 overflow-hidden rounded-full shadow-pop transition-transform duration-100 ease-out sm:h-56 sm:w-56', shown === 'stopped' && 'opacity-40 grayscale')}
            style={{ transform: 'scale(var(--lvl, 1))', background: `radial-gradient(circle at 32% 28%, #ffffffcc 0%, ${color} 38%, ${color} 62%, #0b0b12 120%)` }}>
            <div className="orb-sheen absolute inset-0" style={{ background: `conic-gradient(from 0deg, transparent 0deg, #ffffff55 60deg, transparent 140deg, transparent 360deg)` }} />
          </div>
        </div>
        <div className="mt-8 text-center" aria-live="polite">
          <div className="text-lg font-semibold tracking-tight text-fg">{off ? 'Voice is off' : problem?.fatal ? 'Voice stopped' : LABEL[shown]}</div>
          {hint && <div className="mt-1 text-sm text-muted">{hint}</div>}
          {(off || problem) && (
            <div className={cx('mx-auto mt-3 max-w-sm rounded-xl border px-3 py-2 text-sm', problem && !problem.fatal && !off ? 'border-line bg-surface text-fg-2' : 'border-bad-line bg-bad-soft text-bad')}>
              {off || problem?.text}
            </div>
          )}
        </div>
      </div>

      {/* Live transcript */}
      <div ref={list} className="no-scrollbar mx-auto max-h-[30dvh] w-full max-w-xl space-y-2 overflow-y-auto px-4 sm:px-6" aria-label="Transcript">
        {lines.map((l) => (
          <div key={l.key} className={cx('flex anim-fade', l.who === 'you' ? 'justify-end' : 'justify-start')}>
            <div className={cx('max-w-[85%] rounded-2xl px-3.5 py-2 text-[15px] leading-6', l.who === 'you' ? 'rounded-br-md bg-ink text-ink-fg' : 'rounded-bl-md border border-line bg-surface text-fg')}>{l.text}</div>
          </div>
        ))}
        {!lines.length && !off && <div className="pb-2 text-center text-sm text-muted">Ask {agent} anything. It answers in a sentence or two and the conversation is saved in Chat. Anything to approve stays a card in Decisions.</div>}
      </div>

      {/* End */}
      <div className="flex flex-col items-center gap-1.5 px-4 pb-[calc(env(safe-area-inset-bottom)+1.25rem)] pt-5">
        <button ref={endBtn} type="button" onClick={end} className="inline-flex h-16 min-w-[9rem] items-center justify-center gap-2 rounded-full px-8 text-base font-semibold text-white shadow-pop transition hover:brightness-110 active:scale-95" style={{ background: "#dc2626" }}>
          <Icon name="x" size={20} strokeWidth={2.4} />{off || problem?.fatal ? 'Close' : 'End'}
        </button>
      </div>
    </div>
  );
}

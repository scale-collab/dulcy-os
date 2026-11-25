import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { api, type ChatMessage, type Thread, type User } from '../api';
import { AGENT_EMOJI, Button, cx, ErrorBox, go, Label, Markdown, timeAgo } from '../ui';

const AGENTS = ['Ada', 'Atlas', 'Scribe', 'Scout', 'Sean', 'Riley', 'Cole', 'Ledger', 'Sienna'];

export default function Chat({ user, agent, threadId }: { user: User; agent: string; threadId?: number }) {
  const agents = AGENTS.filter((a) => user.role === 'owner' || a !== 'Ledger');
  const name = agents.find((a) => a.toLowerCase() === agent.toLowerCase()) ?? 'Ada';
  const [threads, setThreads] = useState<Thread[]>([]);
  const [thread, setThread] = useState<{ id: number; agent: string; askedBy: string; parentId: number | null; messages: ChatMessage[]; children: { id: number; agent: string; title: string }[] } | null>(null);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [showList, setShowList] = useState(false);
  const end = useRef<HTMLDivElement>(null);

  const loadThreads = useCallback(() => { api<{ threads: Thread[] }>('/chat/threads').then((r) => setThreads(r.threads)).catch(() => undefined); }, []);
  useEffect(loadThreads, [loadThreads]);
  useEffect(() => {
    setError('');
    if (!threadId) { setThread(null); return; }
    api<{ thread: any }>(`/chat/threads/${threadId}`).then((r) => setThread(r.thread)).catch((e) => setError(e.message));
  }, [threadId]);
  useEffect(() => { end.current?.scrollIntoView({ block: 'end' }); }, [thread?.messages.length, busy]);

  const send = async (e: FormEvent) => {
    e.preventDefault();
    const msg = text.trim();
    if (!msg || busy) return;
    setBusy(true); setError('');
    const optimistic: ChatMessage = { id: -1, role: 'user', author: user.name, text: msg, sources: [], tools: [], created: new Date().toISOString() };
    setThread((t) => (t ? { ...t, messages: [...t.messages, optimistic] } : { id: 0, agent: name, askedBy: 'user', parentId: null, messages: [optimistic], children: [] }));
    setText('');
    try {
      const r = await api<{ threadId: number }>('/chat', { body: { agent: name, message: msg, threadId: thread?.id || undefined } });
      const t = await api<{ thread: any }>(`/chat/threads/${r.threadId}`);
      setThread(t.thread);
      if (r.threadId !== threadId) window.history.replaceState(null, '', `#/chat/${name}/${r.threadId}`);
      loadThreads();
    } catch (err) { setError((err as Error).message); setText(msg); setThread((t) => (t ? { ...t, messages: t.messages.filter((m) => m.id !== -1) } : t)); }
    finally { setBusy(false); }
  };

  const mine = threads.filter((t) => t.agent === name && t.askedBy === 'user');
  const adaAsks = threads.filter((t) => t.askedBy === 'Ada' && (name === 'Ada' || t.agent === name));
  const readOnly = thread && thread.askedBy !== 'user';

  return (
    <div className="flex min-h-[calc(100dvh-11rem)] flex-col">
      <div className="-mx-4 mb-4 flex gap-2 overflow-x-auto px-4 pb-1">
        {agents.map((a) => (
          <button key={a} onClick={() => go(`chat/${a}`)} className={cx('flex min-h-11 shrink-0 items-center gap-1.5 rounded-full border px-3.5 text-sm font-medium', a === name ? 'border-stone-900 bg-stone-900 text-white dark:border-white dark:bg-white dark:text-stone-900' : 'border-stone-300 text-stone-700 dark:border-white/15 dark:text-stone-300')}>
            <span>{AGENT_EMOJI[a]}</span>{a}
          </button>
        ))}
      </div>

      <div className="mb-3 flex items-center justify-between">
        <div className="font-semibold">{readOnly ? `Ada asked ${thread!.agent}` : `Chat with ${name}`}</div>
        <div className="flex gap-2">
          {(mine.length > 0 || adaAsks.length > 0) && <button onClick={() => setShowList((v) => !v)} className="min-h-10 rounded-lg px-3 text-sm text-stone-600 hover:bg-stone-200/60 dark:text-stone-300 dark:hover:bg-white/5">History{showList ? ' ▴' : ' ▾'}</button>}
          {threadId && <button onClick={() => go(`chat/${name}`)} className="min-h-10 rounded-lg px-3 text-sm font-medium text-accent">New chat</button>}
        </div>
      </div>

      {showList && (
        <div className="mb-4 space-y-3 rounded-2xl border border-stone-200/80 bg-white p-3 dark:border-white/10 dark:bg-white/[0.03]">
          {mine.length > 0 && <div><Label>Your chats with {name}</Label><ThreadLinks threads={mine} onPick={(t) => { setShowList(false); go(`chat/${t.agent}/${t.id}`); }} /></div>}
          {adaAsks.length > 0 && <div><Label>{name === 'Ada' ? "Ada's conversations with the team" : `Ada asked ${name}`}</Label><ThreadLinks threads={adaAsks} onPick={(t) => { setShowList(false); go(`chat/${t.agent}/${t.id}`); }} prefix /></div>}
        </div>
      )}

      <div className="flex-1 space-y-4">
        {!thread?.messages.length && !busy && (
          <div className="py-10 text-center">
            <div className="text-4xl">{AGENT_EMOJI[name]}</div>
            <div className="mt-3 font-semibold">Ask {name} anything</div>
            <div className="mx-auto mt-1 max-w-sm text-sm text-stone-500 dark:text-stone-400">{name === 'Ada' ? 'Ada looks it up, asks the right agent for you, and tells you where the answer came from.' : `${name} answers from the data and says where it came from. Read only: nothing is sent or changed from chat.`}</div>
          </div>
        )}
        {thread?.parentId && <button onClick={() => go(`chat/Ada/${thread.parentId}`)} className="text-sm text-accent">← Back to Ada's chat</button>}
        {thread?.messages.map((m) => <Bubble key={m.id} m={m} mine={m.role === 'user' && !readOnly} />)}
        {busy && <div className="text-sm text-stone-500 dark:text-stone-400">{AGENT_EMOJI[name]} {name} is looking it up…</div>}
        {error && <ErrorBox error={error} />}
        <div ref={end} />
      </div>

      {!readOnly && (
        <form onSubmit={send} className="sticky bottom-20 mt-4 flex gap-2 rounded-2xl bg-[#f7f7f5] pt-2 sm:bottom-4 dark:bg-[#0b0d12]">
          <textarea value={text} onChange={(e) => setText(e.target.value)} rows={1} maxLength={4000} placeholder={`Message ${name}…`}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void send(e as unknown as FormEvent); } }}
            className="min-h-12 flex-1 resize-none rounded-xl border border-stone-300 bg-white px-4 py-3 text-[16px] outline-none focus:border-stone-500 dark:border-white/15 dark:bg-white/5" />
          <Button type="submit" tone="primary" disabled={busy || !text.trim()}>Send</Button>
        </form>
      )}
    </div>
  );
}

function ThreadLinks({ threads, onPick, prefix }: { threads: Thread[]; onPick: (t: Thread) => void; prefix?: boolean }) {
  return (
    <div className="mt-1.5 divide-y divide-stone-100 dark:divide-white/5">
      {threads.slice(0, 15).map((t) => (
        <button key={t.id} onClick={() => onPick(t)} className="flex min-h-11 w-full items-center justify-between gap-3 py-2 text-left text-sm">
          <span className="min-w-0 truncate">{prefix ? `${AGENT_EMOJI[t.agent]} ${t.agent}: ` : ''}{t.title || 'Chat'}</span>
          <span className="shrink-0 text-xs text-stone-400">{timeAgo(t.updated)}</span>
        </button>
      ))}
    </div>
  );
}

function Bubble({ m, mine }: { m: ChatMessage; mine: boolean }) {
  const asks = m.tools.filter((t) => t.name === 'ask_agent' && t.threadId);
  return (
    <div className={cx('flex', mine ? 'justify-end' : 'justify-start')}>
      <div className={cx('max-w-[88%] rounded-2xl px-4 py-3', mine ? 'bg-stone-900 text-white dark:bg-white dark:text-stone-900' : 'border border-stone-200/80 bg-white dark:border-white/10 dark:bg-white/[0.04]')}>
        {!mine && <div className="mb-1 text-xs font-semibold text-stone-500 dark:text-stone-400">{AGENT_EMOJI[m.author] ?? '👤'} {m.author}</div>}
        {mine ? <div className="whitespace-pre-wrap text-[15px] leading-6">{m.text}</div> : <Markdown text={m.text} />}
        {asks.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-2">
            {asks.map((t, i) => <button key={i} onClick={() => go(`chat/${String(t.input?.agent ?? '')}/${t.threadId}`)} className="rounded-full bg-stone-100 px-3 py-1.5 text-xs font-medium text-stone-700 dark:bg-white/10 dark:text-stone-200">{AGENT_EMOJI[String(t.input?.agent)] ?? ''} Read Ada ↔ {String(t.input?.agent ?? '')} →</button>)}
          </div>
        )}
        {!mine && m.sources.length > 0 && <div className="mt-2 text-xs text-stone-500 dark:text-stone-400">Read: {m.sources.join(' · ')}</div>}
      </div>
    </div>
  );
}

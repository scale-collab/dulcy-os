// A compact chat with one agent, for the side of a screen (Round 5: Ledger on Finances). It is the
// SAME chat as HQ Chat → <agent>: it opens the chat you had open last there (/chat/latest), and
// asking here continues it, so the conversation shows in both places. It uses the HQ chat API as it
// is (no second chat system). Read only like every chat: nothing is sent or changed from it.
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type FormEvent } from 'react';
import { api, type ChatMessage, type ChatSuggestions, type ChatThreadFull } from '../api';
import { AGENT_COLOR, Avatar, cx, ErrorBox, go, Icon, Markdown, timeAgo } from '../ui';
import { TalkButton } from './VoiceMode';

export default function AgentChatBox({ agent, role, className }: { agent: string; role: string; className?: string }) {
  const [threadId, setThreadId] = useState<number | null | undefined>(undefined); // undefined = still looking
  const [thread, setThread] = useState<ChatThreadFull | null>(null);
  const [pending, setPending] = useState('');
  const [text, setText] = useState('');
  const [error, setError] = useState('');
  const [questions, setQuestions] = useState<string[]>([]);
  const list = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLTextAreaElement>(null);

  const open = useCallback(async () => {
    setError('');
    try {
      const { threadId: id } = await api<{ threadId: number | null }>(`/chat/latest?agent=${agent}`);
      setThreadId(id);
      setThread(id ? (await api<{ thread: ChatThreadFull }>(`/chat/threads/${id}`)).thread : null);
    } catch (e) { setThreadId(null); setError((e as Error).message); }
  }, [agent]);
  useEffect(() => { void open(); }, [open]);
  useEffect(() => {
    let live = true;
    api<ChatSuggestions>(`/chat/suggestions?agent=${agent}`).then((r) => { if (live) setQuestions(r.questions.slice(0, 3)); }).catch(() => undefined);
    return () => { live = false; };
  }, [agent]);
  // Newest at the bottom, inside the box (the page itself does not jump).
  useEffect(() => { const el = list.current; if (el) el.scrollTop = el.scrollHeight; }, [thread?.messages.length, pending]);
  useLayoutEffect(() => { const el = input.current; if (!el) return; el.style.height = 'auto'; el.style.height = `${Math.min(el.scrollHeight, 140)}px`; }, [text]);

  const send = async (e?: FormEvent) => {
    e?.preventDefault();
    const msg = text.trim();
    if (!msg || pending || threadId === undefined) return;
    setPending(msg); setText(''); setError('');
    try {
      const r = await api<{ threadId: number }>('/chat', { body: { agent, message: msg, threadId: threadId ?? undefined } });
      setThreadId(r.threadId);
      setThread((await api<{ thread: ChatThreadFull }>(`/chat/threads/${r.threadId}`)).thread);
    } catch (err) { setError((err as Error).message); setText(msg); } finally { setPending(''); }
  };

  const msgs = thread?.messages ?? [];
  const readOnly = !!thread && (thread.askedBy !== 'user' || thread.mine === false);
  return (
    <section aria-label={`Chat with ${agent}`} className={cx('flex flex-col overflow-hidden rounded-2xl border border-line bg-surface shadow-card', className)}>
      <div className="flex items-center gap-2.5 border-b border-line px-4 py-3">
        <Avatar name={agent} size="sm" />
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-semibold text-fg">{agent}</div>
          <div className="truncate text-xs text-muted">{role} · also in Chat</div>
        </div>
        {!readOnly && <TalkButton agent={agent} threadId={threadId ?? null} size="sm" disabled={!!pending || threadId === undefined}
          onClosed={(id) => { if (id) { setThreadId(id); void api<{ thread: ChatThreadFull }>(`/chat/threads/${id}`).then((r) => setThread(r.thread)).catch((e) => setError(e.message)); } }} />}
        <button onClick={() => go(threadId ? `chat/${agent}/${threadId}` : `chat/${agent}`)} className="inline-flex min-h-11 shrink-0 items-center gap-1 rounded-xl px-2.5 text-xs font-semibold text-accent-ink transition hover:bg-hover">
          Open in Chat<Icon name="arrowRight" size={13} />
        </button>
      </div>

      <div ref={list} className="min-h-[12rem] flex-1 space-y-3 overflow-y-auto overscroll-contain px-4 py-3" aria-live="polite">
        {threadId === undefined && <div className="space-y-2" aria-label="Opening your chat"><div className="skeleton h-3 w-2/3" /><div className="skeleton h-10 w-full" /></div>}
        {threadId !== undefined && !msgs.length && !pending && (
          <div className="py-2 text-sm text-muted">
            Ask {agent} about these numbers. {agent} reads the data and says where it came from; nothing is sent or changed.
            {questions.length > 0 && (
              <div className="mt-3 flex flex-col gap-1.5">
                {questions.map((q) => <button key={q} onClick={() => { setText(q); input.current?.focus(); }} className="min-h-10 rounded-xl border border-line bg-bg px-3 py-1.5 text-left text-sm text-fg-2 transition hover:border-line-strong hover:text-fg">{q}</button>)}
              </div>
            )}
          </div>
        )}
        {msgs.map((m) => <Line key={m.id} m={m} mine={m.role === 'user'} />)}
        {pending && !(msgs.at(-1)?.role === 'user' && msgs.at(-1)?.text === pending) && <Line m={{ id: -1, role: 'user', author: '', text: pending, sources: [], tools: [], created: new Date().toISOString() }} mine />}
        {pending && (
          <div className="flex items-center gap-2 text-xs text-muted anim-fade">
            <span className="flex gap-1" aria-hidden="true">{[0, 1, 2].map((i) => <span key={i} className="typing-dot h-1.5 w-1.5 rounded-full" style={{ background: AGENT_COLOR[agent] }} />)}</span>
            {agent} is looking it up…
          </div>
        )}
        {error && <ErrorBox error={error} />}
      </div>

      {!readOnly && (
        <form onSubmit={send} className="border-t border-line p-2">
          <div className="flex items-end gap-2 rounded-xl border border-line-strong bg-bg p-1 pl-3 transition focus-within:border-accent focus-within:ring-4 focus-within:ring-accent-soft">
            <textarea ref={input} value={text} onChange={(e) => setText(e.target.value)} rows={1} maxLength={4000} placeholder={`Ask ${agent}…`} aria-label={`Message ${agent}`}
              onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); void send(); } }}
              className="max-h-[140px] min-h-11 flex-1 resize-none bg-transparent py-2.5 text-[16px] leading-6 text-fg outline-none placeholder:text-muted focus-visible:outline-none" />
            <button type="submit" disabled={!!pending || !text.trim() || threadId === undefined} aria-label="Send"
              className="grid h-11 w-11 shrink-0 place-items-center rounded-lg bg-ink text-ink-fg transition hover:bg-ink-hover active:scale-95 disabled:opacity-35">
              <Icon name="send" size={17} strokeWidth={2} />
            </button>
          </div>
        </form>
      )}
    </section>
  );
}

function Line({ m, mine }: { m: ChatMessage; mine: boolean }) {
  if (mine) return <div className="flex justify-end"><div className="max-w-[88%] whitespace-pre-wrap break-words rounded-2xl rounded-br-md bg-ink px-3 py-2 text-sm leading-6 text-ink-fg">{m.text}</div></div>;
  return (
    <div className="min-w-0">
      <div className="mb-0.5 flex items-baseline gap-2 text-xs"><span className="font-semibold text-fg">{m.author}</span><span className="text-muted">{timeAgo(m.created)}</span></div>
      <div className="rounded-2xl rounded-tl-md border border-line bg-bg px-3 py-2"><Markdown text={m.text} small /></div>
    </div>
  );
}

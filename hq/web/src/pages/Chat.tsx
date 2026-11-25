import { useCallback, useEffect, useLayoutEffect, useRef, useState, type FormEvent } from 'react';
import { api, type ChatMessage, type Thread, type User } from '../api';
import { AGENT_COLOR, Avatar, cx, ErrorBox, go, Icon, Label, Markdown, Pill, timeAgo } from '../ui';

const AGENTS = ['Ada', 'Atlas', 'Scribe', 'Scout', 'Echo', 'Riley', 'Cole', 'Ledger', 'Sienna'];
const ROLE: Record<string, string> = { Ada: 'COO', Atlas: 'Clients + campaigns', Scribe: 'Copy and offers', Scout: 'Lead lists', Echo: 'Inbox', Riley: 'Automation', Cole: 'Sales', Ledger: 'Money', Sienna: 'Content' };
const STARTERS: Record<string, string[]> = {
  Ada: ['What needs me first today?', 'Which agents had problems this week?', 'Ask Atlas which campaigns are past 60%'],
  Atlas: ['Which campaigns are past 60%?', 'Any bounce rates over 2.5%?'],
  Echo: ['How many replies are waiting for approval?', 'Which replies came in overnight?'],
  Riley: ['Did any engine job fail in the last 24 h?'],
};
type FullThread = { id: number; agent: string; askedBy: string; parentId: number | null; messages: ChatMessage[]; children: { id: number; agent: string; title: string }[] };

export default function Chat({ user, agent, threadId }: { user: User; agent: string; threadId?: number }) {
  const agents = AGENTS.filter((a) => user.role === 'owner' || (a !== 'Ledger' && a !== 'Sienna'));
  const name = agents.find((a) => a.toLowerCase() === agent.toLowerCase()) ?? 'Ada';
  const [threads, setThreads] = useState<Thread[]>([]);
  const [thread, setThread] = useState<FullThread | null>(null);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [showList, setShowList] = useState(false);
  const end = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLTextAreaElement>(null);

  const loadThreads = useCallback(() => { api<{ threads: Thread[] }>('/chat/threads').then((r) => setThreads(r.threads)).catch(() => undefined); }, []);
  useEffect(loadThreads, [loadThreads]);
  useEffect(() => {
    setError('');
    if (!threadId) { setThread(null); return; }
    api<{ thread: FullThread }>(`/chat/threads/${threadId}`).then((r) => setThread(r.thread)).catch((e) => setError(e.message));
  }, [threadId]);
  useEffect(() => { end.current?.scrollIntoView({ block: 'end', behavior: 'smooth' }); }, [thread?.messages.length, busy]);
  useLayoutEffect(() => { const el = input.current; if (!el) return; el.style.height = 'auto'; el.style.height = `${Math.min(el.scrollHeight, 200)}px`; }, [text]);

  const send = async (e?: FormEvent) => {
    e?.preventDefault();
    const msg = text.trim();
    if (!msg || busy) return;
    setBusy(true); setError('');
    const optimistic: ChatMessage = { id: -1, role: 'user', author: user.name, text: msg, sources: [], tools: [], created: new Date().toISOString() };
    setThread((t) => (t ? { ...t, messages: [...t.messages, optimistic] } : { id: 0, agent: name, askedBy: 'user', parentId: null, messages: [optimistic], children: [] }));
    setText('');
    try {
      const r = await api<{ threadId: number }>('/chat', { body: { agent: name, message: msg, threadId: thread?.id || undefined } });
      const t = await api<{ thread: FullThread }>(`/chat/threads/${r.threadId}`);
      setThread(t.thread);
      if (r.threadId !== threadId) window.history.replaceState(null, '', `#/chat/${name}/${r.threadId}`);
      loadThreads();
    } catch (err) { setError((err as Error).message); setText(msg); setThread((t) => (t ? { ...t, messages: t.messages.filter((m) => m.id !== -1) } : t)); }
    finally { setBusy(false); }
  };

  const mine = threads.filter((t) => t.agent === name && t.askedBy === 'user');
  const adaAsks = threads.filter((t) => t.askedBy === 'Ada' && (name === 'Ada' || t.agent === name));
  const readOnly = !!thread && thread.askedBy !== 'user';
  const empty = !thread?.messages.length && !busy;

  return (
    <div className="lg:grid lg:grid-cols-[220px_minmax(0,1fr)] lg:gap-8">
      {/* Agents: a rail on desktop, a scrolling strip on the phone. */}
      <aside className="hidden lg:block">
        <div className="sticky top-10">
          <Label className="mb-2 px-2">Talk to</Label>
          <nav aria-label="Agents" className="space-y-0.5">
            {agents.map((a) => (
              <button key={a} onClick={() => go(`chat/${a}`)} aria-current={a === name ? 'page' : undefined}
                className={cx('flex min-h-11 w-full items-center gap-3 rounded-xl px-2 text-left transition', a === name ? 'bg-hover' : 'hover:bg-hover')}>
                <Avatar name={a} size="sm" />
                <span className="min-w-0"><span className={cx('block text-sm leading-tight', a === name ? 'font-semibold text-fg' : 'font-medium text-fg-2')}>{a}</span><span className="block truncate text-xs text-muted">{ROLE[a]}</span></span>
              </button>
            ))}
          </nav>
        </div>
      </aside>

      <div className="flex min-h-[calc(100dvh-13rem)] min-w-0 flex-col md:min-h-[calc(100dvh-6rem)]">
        <div className="no-scrollbar -mx-4 mb-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:-mx-6 sm:px-6 lg:hidden">
          {agents.map((a) => (
            <button key={a} onClick={() => go(`chat/${a}`)} aria-current={a === name ? 'page' : undefined}
              className={cx('flex min-h-11 shrink-0 items-center gap-2 rounded-full border py-1 pl-1 pr-3.5 text-sm font-medium transition', a === name ? 'border-ink bg-ink text-ink-fg' : 'border-line bg-surface text-fg-2 hover:bg-hover')}>
              <Avatar name={a} size="sm" round />{a}
            </button>
          ))}
        </div>

        <div className="mb-4 flex items-center justify-between gap-3 border-b border-line pb-4">
          <div className="flex min-w-0 items-center gap-3">
            <Avatar name={readOnly ? thread!.agent : name} />
            <div className="min-w-0">
              <h1 className="truncate text-lg font-semibold tracking-tight">{readOnly ? `Ada asked ${thread!.agent}` : name}</h1>
              <div className="flex items-center gap-1.5 text-xs text-muted"><Icon name="lock" size={12} />{readOnly ? 'Saved conversation · read only' : `${ROLE[name]} · read only, nothing is sent or changed`}</div>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            {(mine.length > 0 || adaAsks.length > 0) && (
              <button onClick={() => setShowList((v) => !v)} aria-expanded={showList} className={cx('inline-flex min-h-11 items-center gap-1.5 rounded-xl px-3 text-sm font-medium transition hover:bg-hover', showList ? 'bg-hover text-fg' : 'text-fg-2')}>
                <Icon name="history" size={16} /><span className="hidden sm:inline">History</span>
              </button>
            )}
            {threadId && <button onClick={() => go(`chat/${name}`)} className="inline-flex min-h-11 items-center gap-1.5 rounded-xl px-3 text-sm font-semibold text-accent-ink transition hover:bg-hover"><Icon name="plus" size={16} />New</button>}
          </div>
        </div>

        {showList && (
          <div className="mb-5 space-y-4 rounded-2xl border border-line bg-surface p-4 shadow-pop anim-fade">
            {mine.length > 0 && <div><Label>Your chats with {name}</Label><ThreadLinks threads={mine} onPick={(t) => { setShowList(false); go(`chat/${t.agent}/${t.id}`); }} /></div>}
            {adaAsks.length > 0 && <div><Label>{name === 'Ada' ? "Ada's conversations with the team" : `Ada asked ${name}`}</Label><ThreadLinks threads={adaAsks} onPick={(t) => { setShowList(false); go(`chat/${t.agent}/${t.id}`); }} prefix /></div>}
          </div>
        )}

        <div className="flex-1 space-y-5" aria-live="polite">
          {empty && (
            <div className="flex flex-col items-center py-10 text-center anim-in">
              <Avatar name={name} size="xl" />
              <div className="mt-4 text-lg font-semibold tracking-tight">Ask {name} anything</div>
              <div className="mx-auto mt-1 max-w-sm text-sm text-muted">{name === 'Ada' ? 'Ada looks it up, asks the right agent for you, and tells you where the answer came from.' : `${name} answers from the data and says where it came from. Read only: nothing is sent or changed from chat.`}</div>
              {!readOnly && (STARTERS[name] ?? []).length > 0 && (
                <div className="mt-6 flex max-w-lg flex-wrap justify-center gap-2">
                  {(STARTERS[name] ?? []).map((s) => (
                    <button key={s} onClick={() => { setText(s); input.current?.focus(); }} className="min-h-10 rounded-full border border-line bg-surface px-3.5 text-sm text-fg-2 shadow-card transition hover:border-line-strong hover:text-fg">{s}</button>
                  ))}
                </div>
              )}
            </div>
          )}
          {thread?.parentId && <button onClick={() => go(`chat/Ada/${thread.parentId}`)} className="inline-flex min-h-11 items-center gap-1.5 text-sm font-medium text-accent-ink"><Icon name="arrowLeft" size={15} />Back to Ada's chat</button>}
          {thread?.messages.map((m) => <Bubble key={m.id} m={m} mine={m.role === 'user' && !readOnly} />)}
          {busy && (
            <div className="flex items-end gap-2.5 anim-fade">
              <Avatar name={name} size="sm" />
              <div className="rounded-2xl rounded-bl-md border border-line bg-surface px-4 py-3 shadow-card">
                <div className="flex items-center gap-2 text-sm text-muted">
                  <span className="flex gap-1" aria-hidden="true">{[0, 1, 2].map((i) => <span key={i} className="typing-dot h-1.5 w-1.5 rounded-full" style={{ background: AGENT_COLOR[name] }} />)}</span>
                  {name} is looking it up…
                </div>
              </div>
            </div>
          )}
          {error && <ErrorBox error={error} />}
          <div ref={end} />
        </div>

        {!readOnly && (
          <form onSubmit={send} className="sticky bottom-[calc(4rem+env(safe-area-inset-bottom))] z-10 -mx-4 mt-6 bg-gradient-to-t from-bg from-70% to-transparent px-4 pb-3 pt-4 sm:-mx-6 sm:px-6 md:bottom-0 md:mx-0 md:px-0 md:pb-5">
            <div className="flex items-end gap-2 rounded-2xl border border-line-strong bg-surface p-1.5 pl-4 shadow-pop transition focus-within:border-accent focus-within:ring-4 focus-within:ring-accent-soft">
              <textarea ref={input} value={text} onChange={(e) => setText(e.target.value)} rows={1} maxLength={4000} placeholder={`Message ${name}…`} aria-label={`Message ${name}`}
                onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); void send(); } }}
                className="max-h-[200px] min-h-11 flex-1 resize-none bg-transparent py-2.5 text-[16px] leading-6 text-fg outline-none placeholder:text-muted focus-visible:outline-none" />
              <button type="submit" disabled={busy || !text.trim()} aria-label="Send"
                className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-ink text-ink-fg transition hover:bg-ink-hover active:scale-95 disabled:opacity-35">
                <Icon name="send" size={18} strokeWidth={2} />
              </button>
            </div>
            <div className="mt-1.5 hidden px-1 text-xs text-muted md:block">Enter to send · Shift + Enter for a new line</div>
          </form>
        )}
      </div>
    </div>
  );
}

function ThreadLinks({ threads, onPick, prefix }: { threads: Thread[]; onPick: (t: Thread) => void; prefix?: boolean }) {
  return (
    <div className="mt-1.5 divide-y divide-line">
      {threads.slice(0, 15).map((t) => (
        <button key={t.id} onClick={() => onPick(t)} className="flex min-h-11 w-full items-center justify-between gap-3 rounded-lg py-2 text-left text-sm transition hover:bg-hover">
          <span className="flex min-w-0 items-center gap-2">{prefix && <Avatar name={t.agent} size="xs" />}<span className="truncate text-fg-2">{prefix ? <span className="font-medium text-fg">{t.agent}: </span> : null}{t.title || 'Chat'}</span></span>
          <span className="shrink-0 text-xs text-muted">{timeAgo(t.updated)}</span>
        </button>
      ))}
    </div>
  );
}

function Bubble({ m, mine }: { m: ChatMessage; mine: boolean }) {
  const asks = m.tools.filter((t) => t.name === 'ask_agent' && t.threadId);
  if (mine) {
    return (
      <div className="flex justify-end anim-fade">
        <div className="max-w-[85%] rounded-2xl rounded-br-md bg-ink px-4 py-2.5 text-ink-fg shadow-card sm:max-w-[75%]">
          <div className="whitespace-pre-wrap break-words text-[15px] leading-6">{m.text}</div>
        </div>
      </div>
    );
  }
  return (
    <div className="flex items-start gap-2.5 anim-fade">
      <Avatar name={m.author} size="sm" className="mt-0.5" />
      <div className="min-w-0 max-w-[92%] sm:max-w-[85%]">
        <div className="mb-1 flex items-baseline gap-2 text-xs"><span className="font-semibold text-fg">{m.author}</span><span className="text-muted">{timeAgo(m.created)}</span></div>
        <div className="rounded-2xl rounded-tl-md border border-line bg-surface px-4 py-3 shadow-card">
          <Markdown text={m.text} />
        </div>
        {asks.map((t, i) => <AskThread key={i} agent={String(t.input?.agent ?? '')} threadId={t.threadId!} />)}
        {m.sources.length > 0 && (
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            <span className="text-xs text-muted">Sources</span>
            {m.sources.map((s, i) => <Pill key={i} icon="database" className="max-w-[16rem] truncate">{s}</Pill>)}
          </div>
        )}
      </div>
    </div>
  );
}

/** "Ada asked Atlas": collapsed by default; opening it reads that saved conversation. */
function AskThread({ agent, threadId }: { agent: string; threadId: number }) {
  const [open, setOpen] = useState(false);
  const [t, setT] = useState<FullThread | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    if (!open || t) return;
    api<{ thread: FullThread }>(`/chat/threads/${threadId}`).then((r) => setT(r.thread)).catch((e) => setError(e.message));
  }, [open, t, threadId]);
  return (
    <div className="mt-2 overflow-hidden rounded-xl border border-line bg-sunken">
      <button onClick={() => setOpen((v) => !v)} aria-expanded={open} className="flex min-h-11 w-full items-center gap-2.5 px-3 text-left text-sm transition hover:bg-hover">
        <span className="flex -space-x-1.5"><Avatar name="Ada" size="xs" className="ring-2 ring-sunken" /><Avatar name={agent} size="xs" className="ring-2 ring-sunken" /></span>
        <span className="min-w-0 flex-1 truncate font-medium text-fg-2">Ada asked {agent}</span>
        <Icon name="chevronDown" size={16} className={cx('text-muted transition', open && 'rotate-180')} />
      </button>
      {open && (
        <div className="space-y-3 border-t border-line px-3 py-3 anim-fade">
          {error && <ErrorBox error={error} />}
          {!t && !error && <div className="space-y-2" aria-label="Loading"><div className="skeleton h-3 w-2/3" /><div className="skeleton h-3 w-full" /><div className="skeleton h-3 w-1/2" /></div>}
          {t?.messages.map((x) => (
            <div key={x.id} className="flex gap-2">
              <Avatar name={x.role === 'user' ? 'Ada' : x.author} size="xs" className="mt-0.5" />
              <div className="min-w-0 flex-1"><div className="text-xs font-semibold text-fg">{x.role === 'user' ? 'Ada' : x.author}</div><Markdown text={x.text} small /></div>
            </div>
          ))}
          {t && <button onClick={() => go(`chat/${agent}/${threadId}`)} className="inline-flex min-h-9 items-center gap-1 text-xs font-semibold text-accent-ink">Open the full conversation<Icon name="arrowRight" size={13} /></button>}
        </div>
      )}
    </div>
  );
}

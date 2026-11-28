// Chat like Slack (Batch 4b, Alex 2026-11-27): several chats per agent; Chat opens on the chat you
// had open last; keep asking in the same chat (no need to reopen history); "New chat"; archive old
// chats (hidden, restorable). Suggested questions per agent change daily (from the server).
// Links: #/chat/<agent> (your last chat), #/chat/<agent>/<id>, #/chat/<agent>/new, and
// #/chat/<agent>?ask=<question> (a new chat with the question typed in, not sent).
// The "… is looking it up" line belongs to the question in flight: its agent, its chat only
// (chatState.ts; it used to follow whichever agent was on screen).
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type FormEvent } from 'react';
import { api, type ChatMessage, type ChatSuggestions, type ChatThread, type ChatThreadFull, type User } from '../api';
import { AGENT_COLOR, Avatar, cx, ErrorBox, go, Icon, Label, Markdown, Pill, timeAgo, useRoute } from '../ui';
import { afterReply, parseChatHash, typingIn, type ChatView, type PendingAsk } from './chatState';
import { TalkButton } from './VoiceMode';

const AGENTS = ['Ada', 'Atlas', 'Scribe', 'Scout', 'Echo', 'Riley', 'Cole', 'Ledger', 'Sienna'];
const ROLE: Record<string, string> = { Ada: 'COO', Atlas: 'Clients + campaigns', Scribe: 'Copy and offers', Scout: 'Lead lists', Echo: 'Inbox', Riley: 'Automation', Cole: 'Sales', Ledger: 'Money', Sienna: 'Content' };
/** Replace the address without a new history step (and without reloading the view). */
const replaceHash = (path: string) => window.history.replaceState(null, '', `#/${path}`);

export default function Chat({ user }: { user: User; agent?: string; threadId?: number }) {
  const agents = AGENTS.filter((a) => user.role === 'owner' || (a !== 'Ledger' && a !== 'Sienna'));
  const route = useRoute();
  const hash = typeof window === 'undefined' ? '' : window.location.hash;
  const [view, setView] = useState<ChatView | null>(null);
  const [thread, setThread] = useState<ChatThreadFull | null>(null);
  const [threads, setThreads] = useState<ChatThread[]>([]);
  const [archived, setArchived] = useState<ChatThread[] | null>(null);
  const [pending, setPending] = useState<PendingAsk | null>(null);
  const [text, setText] = useState('');
  const [error, setError] = useState('');
  const [showList, setShowList] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const [questions, setQuestions] = useState<string[]>([]);
  const end = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLTextAreaElement>(null);
  const viewRef = useRef<ChatView | null>(null);
  viewRef.current = view;
  const threadRef = useRef<ChatThreadFull | null>(null);
  threadRef.current = thread;

  // The address → what is on screen. `route` is a new array on every hashchange (a click or a link),
  // never on our own replaceHash, so this runs once per navigation.
  useEffect(() => {
    const r = parseChatHash(window.location.hash, agents);
    setError(''); setShowList(false);
    // "Ask for an update" (Team) used to leave a draft here: still read once.
    let draft = '';
    try { draft = sessionStorage.getItem('hq:chat-draft') ?? ''; sessionStorage.removeItem('hq:chat-draft'); } catch { /* private mode */ }
    if (r.ask || r.fresh) {
      setView({ agent: r.agent, threadId: null }); setThread(null); setText(r.ask || draft);
      if (r.ask) replaceHash(`chat/${r.agent}/new`);
      return;
    }
    if (r.threadId) { setView({ agent: r.agent, threadId: r.threadId }); setText(draft); return; }
    // No chat in the link: open the one you had open last (or a new chat).
    setView(null); setThread(null); setText(draft);
    let live = true;
    api<{ threadId: number | null }>(`/chat/latest?agent=${r.agent}`)
      .then((x) => { if (!live) return; if (x.threadId) replaceHash(`chat/${r.agent}/${x.threadId}`); setView({ agent: r.agent, threadId: x.threadId }); })
      .catch(() => { if (live) setView({ agent: r.agent, threadId: null }); });
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [route]);

  const name = view?.agent ?? parseChatHash(hash, agents).agent;
  const loadThreads = useCallback(() => {
    api<{ threads: ChatThread[] }>(`/chat/threads?agent=${name}`).then((r) => setThreads(r.threads)).catch(() => undefined);
    if (showArchived) api<{ threads: ChatThread[] }>(`/chat/threads?agent=${name}&archived=1`).then((r) => setArchived(r.threads)).catch(() => undefined);
  }, [name, showArchived]);
  useEffect(() => { setArchived(null); }, [name]);
  useEffect(loadThreads, [loadThreads]);
  useEffect(() => {
    setQuestions([]);
    let live = true;
    api<ChatSuggestions>(`/chat/suggestions?agent=${name}`).then((r) => { if (live) setQuestions(r.questions); }).catch(() => undefined);
    return () => { live = false; };
  }, [name]);
  // The chat on screen.
  useEffect(() => {
    if (!view?.threadId) { setThread(null); return; }
    if (threadRef.current?.id === view.threadId && threadRef.current.agent === view.agent) return; // just loaded by send()
    let live = true;
    api<{ thread: ChatThreadFull }>(`/chat/threads/${view.threadId}`).then((r) => { if (live) setThread(r.thread); }).catch((e) => { if (live) setError(e.message); });
    return () => { live = false; };
  }, [view?.agent, view?.threadId]);

  const typing = view ? typingIn(view, pending) : null;
  useEffect(() => { end.current?.scrollIntoView({ block: 'end', behavior: 'smooth' }); }, [thread?.messages.length, typing]);
  useLayoutEffect(() => { const el = input.current; if (!el) return; el.style.height = 'auto'; el.style.height = `${Math.min(el.scrollHeight, 200)}px`; }, [text]);

  const send = async (e?: FormEvent) => {
    e?.preventDefault();
    const msg = text.trim();
    if (!msg || pending || !view) return;
    // The question remembers who was asked and in which chat (the bug: it used whatever was on screen).
    const asked: PendingAsk = { agent: view.agent, threadId: view.threadId, text: msg };
    setPending(asked); setError(''); setText('');
    try {
      const r = await api<{ threadId: number; agent: string }>('/chat', { body: { agent: asked.agent, message: msg, threadId: asked.threadId ?? undefined } });
      const now = viewRef.current;
      if (now) {
        const next = afterReply(now, asked, r.threadId);
        if (next.threadId === r.threadId && next.agent === asked.agent) {
          const t = await api<{ thread: ChatThreadFull }>(`/chat/threads/${r.threadId}`);
          if (now.threadId !== r.threadId) replaceHash(`chat/${asked.agent}/${r.threadId}`);
          setView(next); setThread(t.thread);
        }
      }
      loadThreads();
    } catch (err) {
      const v = viewRef.current;
      if (v && v.agent === asked.agent && v.threadId === asked.threadId) { setError((err as Error).message); setText(msg); }
    } finally { setPending(null); }
  };

  // Voice mode talked into this chat (or started one): show what was said.
  const afterVoice = async (agent: string, id: number | null) => {
    if (!id) return;
    try {
      const t = await api<{ thread: ChatThreadFull }>(`/chat/threads/${id}`);
      const now = viewRef.current;
      if (now && now.agent === agent) {
        if (now.threadId !== id) replaceHash(`chat/${agent}/${id}`);
        setView({ agent, threadId: id }); setThread(t.thread);
      }
      loadThreads();
    } catch (e) { setError((e as Error).message); }
  };

  const archive = async (t: { id: number }, on: boolean) => {
    try {
      await api(`/chat/threads/${t.id}/archive`, { body: { archived: on } });
      if (on && view?.threadId === t.id) go(`chat/${name}`); // opens the next chat you had open
      if (!on) go(`chat/${name}/${t.id}`);
      loadThreads();
    } catch (e) { setError((e as Error).message); }
  };

  const mine = threads.filter((t) => t.askedBy === 'user' && t.mine !== false);
  const adaAsks = threads.filter((t) => t.askedBy === 'Ada');
  const readOnly = !!thread && (thread.askedBy !== 'user' || thread.mine === false);
  const shownAgent = readOnly ? thread!.agent : name;
  const empty = !thread?.messages.length && !typing;
  const current = view?.threadId ? mine.find((t) => t.id === view.threadId) ?? null : null;
  const title = readOnly ? (thread!.askedBy === 'Ada' ? `Ada asked ${thread!.agent}` : thread!.title || 'Chat') : view?.threadId ? (thread?.title || current?.title || 'Chat') : 'New chat';
  const pick = (t: ChatThread) => { setShowList(false); go(`chat/${t.agent}/${t.id}`); };

  const chatList = (
    <div className="space-y-4">
      <button onClick={() => { setShowList(false); go(`chat/${name}/new`); }} className="flex min-h-11 w-full items-center gap-2 rounded-xl border border-dashed border-line-strong px-3 text-sm font-semibold text-accent-ink transition hover:bg-hover">
        <Icon name="plus" size={16} />New chat with {name}
      </button>
      <div>
        <Label className="mb-1 px-1">Chats with {name}</Label>
        {mine.length ? <ThreadLinks threads={mine} active={view?.threadId ?? null} onPick={pick} onArchive={(t) => void archive(t, true)} />
          : <div className="px-1 py-2 text-sm text-muted">No chats yet.</div>}
      </div>
      {adaAsks.length > 0 && <div><Label className="mb-1 px-1">{name === 'Ada' ? "Ada's conversations with the team" : `Ada asked ${name}`}</Label><ThreadLinks threads={adaAsks} active={view?.threadId ?? null} onPick={pick} prefix /></div>}
      <div>
        <button onClick={() => setShowArchived((v) => !v)} aria-expanded={showArchived} className="flex min-h-10 w-full items-center justify-between gap-2 rounded-lg px-1 text-xs font-semibold uppercase tracking-[0.08em] text-muted transition hover:text-fg">
          <span className="inline-flex items-center gap-1.5"><Icon name="folder" size={14} />Archived</span><Icon name="chevronDown" size={14} className={cx('transition', showArchived && 'rotate-180')} />
        </button>
        {showArchived && (archived === null ? <div className="px-1 py-2 text-sm text-muted">Loading…</div>
          : archived.length ? <ThreadLinks threads={archived} active={view?.threadId ?? null} onPick={pick} onRestore={(t) => void archive(t, false)} />
            : <div className="px-1 py-2 text-sm text-muted">Nothing archived.</div>)}
      </div>
    </div>
  );

  return (
    <div className="lg:grid lg:grid-cols-[248px_minmax(0,1fr)] lg:gap-8">
      {/* Agents and their chats: a rail on desktop; on the phone a strip plus the Chats panel. */}
      <aside className="hidden lg:block">
        <div className="sticky top-10 max-h-[calc(100dvh-5rem)] overflow-y-auto pb-6">
          <Label className="mb-2 px-2">Talk to</Label>
          <nav aria-label="Agents" className="space-y-0.5">
            {agents.map((a) => (
              <button key={a} onClick={() => go(`chat/${a}`)} aria-current={a === name ? 'page' : undefined}
                className={cx('flex min-h-11 w-full items-center gap-3 rounded-xl px-2 text-left transition', a === name ? 'bg-hover' : 'hover:bg-hover')}>
                <Avatar name={a} size="sm" />
                <span className="min-w-0 flex-1"><span className={cx('block text-sm leading-tight', a === name ? 'font-semibold text-fg' : 'font-medium text-fg-2')}>{a}</span><span className="block truncate text-xs text-muted">{ROLE[a]}</span></span>
                {pending?.agent === a && <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: AGENT_COLOR[a] }} aria-label={`${a} is answering`} />}
              </button>
            ))}
          </nav>
          <div className="mt-6 border-t border-line pt-4">{chatList}</div>
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

        <div className="mb-4 flex items-center justify-between gap-2 border-b border-line pb-4">
          <div className="flex min-w-0 items-center gap-3">
            <Avatar name={shownAgent} />
            <div className="min-w-0">
              <h1 className="truncate text-lg font-semibold tracking-tight">{readOnly ? title : name}</h1>
              <div className="flex min-w-0 items-center gap-1.5 text-xs text-muted">
                {readOnly ? <><Icon name="lock" size={12} /><span className="truncate">Saved conversation · read only</span></>
                  : <span className="truncate">{title}{thread?.archived ? ' · archived' : ''} · {ROLE[name]} · read only, nothing is sent or changed</span>}
              </div>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <button onClick={() => setShowList((v) => !v)} aria-expanded={showList} className={cx('inline-flex min-h-11 items-center gap-1.5 rounded-xl px-3 text-sm font-medium transition hover:bg-hover lg:hidden', showList ? 'bg-hover text-fg' : 'text-fg-2')}>
              <Icon name="history" size={16} />Chats
            </button>
            {!readOnly && view?.threadId && !thread?.archived && (
              <button onClick={() => void archive({ id: view.threadId! }, true)} title="Archive this chat" className="inline-flex min-h-11 items-center gap-1.5 rounded-xl px-3 text-sm font-medium text-fg-2 transition hover:bg-hover">
                <Icon name="folder" size={16} /><span className="hidden sm:inline">Archive</span>
              </button>
            )}
            {(view?.threadId || readOnly) && <button onClick={() => go(`chat/${name}/new`)} className="inline-flex min-h-11 items-center gap-1.5 rounded-xl px-3 text-sm font-semibold text-accent-ink transition hover:bg-hover"><Icon name="plus" size={16} /><span className="hidden sm:inline">New chat</span><span className="sm:hidden">New</span></button>}
          </div>
        </div>

        {showList && <div className="mb-5 rounded-2xl border border-line bg-surface p-4 shadow-pop anim-fade lg:hidden">{chatList}</div>}

        <div className="flex-1 space-y-5" aria-live="polite">
          {!view && <div className="space-y-3 py-6" aria-label="Opening your last chat"><div className="skeleton h-4 w-1/3" /><div className="skeleton h-16 w-2/3" /><div className="skeleton ml-auto h-10 w-1/2" /></div>}
          {view && empty && (
            <div className="flex flex-col items-center py-10 text-center anim-in">
              <Avatar name={name} size="xl" />
              <div className="mt-4 text-lg font-semibold tracking-tight">Ask {name} anything</div>
              <div className="mx-auto mt-1 max-w-sm text-sm text-muted">{name === 'Ada' ? 'Ada looks it up, asks the right agent for you, and tells you where the answer came from.' : `${name} answers from the data and says where it came from. Read only: nothing is sent or changed from chat.`}</div>
            </div>
          )}
          {view && !readOnly && questions.length > 0 && empty && (
            <div className="mx-auto -mt-2 flex max-w-xl flex-wrap justify-center gap-2">
              <span className="w-full text-xs font-medium text-muted">Ideas for today</span>
              {questions.map((q) => (
                <button key={q} onClick={() => { setText(q); input.current?.focus(); }} className="min-h-10 rounded-full border border-line bg-surface px-3.5 text-left text-sm text-fg-2 shadow-card transition hover:border-line-strong hover:text-fg">{q}</button>
              ))}
            </div>
          )}
          {thread?.parentId && <button onClick={() => go(`chat/Ada/${thread.parentId}`)} className="inline-flex min-h-11 items-center gap-1.5 text-sm font-medium text-accent-ink"><Icon name="arrowLeft" size={15} />Back to Ada's chat</button>}
          {thread?.messages.map((m) => <Bubble key={m.id} m={m} mine={m.role === 'user' && !readOnly} />)}
          {typing && pending && !(thread?.messages.at(-1)?.role === 'user' && thread.messages.at(-1)?.text === pending.text) && <Bubble m={{ id: -1, role: 'user', author: user.name, text: pending.text, sources: [], tools: [], created: new Date().toISOString() }} mine />}
          {typing && (
            <div className="flex items-end gap-2.5 anim-fade">
              <Avatar name={typing} size="sm" />
              <div className="rounded-2xl rounded-bl-md border border-line bg-surface px-4 py-3 shadow-card">
                <div className="flex items-center gap-2 text-sm text-muted">
                  <span className="flex gap-1" aria-hidden="true">{[0, 1, 2].map((i) => <span key={i} className="typing-dot h-1.5 w-1.5 rounded-full" style={{ background: AGENT_COLOR[typing] }} />)}</span>
                  {typing} is looking it up…
                </div>
              </div>
            </div>
          )}
          {pending && !typing && (
            <div className="flex items-center gap-2 rounded-xl border border-line bg-sunken px-3 py-2 text-xs text-muted anim-fade">
              <Avatar name={pending.agent} size="xs" />{pending.agent} is still answering your question in another chat.
              <button onClick={() => go(pending.threadId ? `chat/${pending.agent}/${pending.threadId}` : `chat/${pending.agent}/new`)} className="ml-auto font-semibold text-accent-ink">Open</button>
            </div>
          )}
          {error && <ErrorBox error={error} />}
          <div ref={end} />
        </div>

        {!readOnly && view && (
          <form onSubmit={send} className="sticky bottom-[calc(4rem+env(safe-area-inset-bottom))] z-10 -mx-4 mt-6 bg-gradient-to-t from-bg from-70% to-transparent px-4 pb-3 pt-4 sm:-mx-6 sm:px-6 md:bottom-0 md:mx-0 md:px-0 md:pb-5">
            <div className="flex items-end gap-2 rounded-2xl border border-line-strong bg-surface p-1.5 pl-4 shadow-pop transition focus-within:border-accent focus-within:ring-4 focus-within:ring-accent-soft">
              <textarea ref={input} value={text} onChange={(e) => setText(e.target.value)} rows={1} maxLength={4000} placeholder={view.threadId ? `Reply to ${name}…` : `Message ${name}…`} aria-label={`Message ${name}`}
                onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); void send(); } }}
                className="max-h-[200px] min-h-11 flex-1 resize-none bg-transparent py-2.5 text-[16px] leading-6 text-fg outline-none placeholder:text-muted focus-visible:outline-none" />
              <TalkButton agent={name} threadId={view.threadId} disabled={!!pending} onClosed={(id) => void afterVoice(name, id)} />
              <button type="submit" disabled={!!pending || !text.trim()} aria-label="Send"
                className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-ink text-ink-fg transition hover:bg-ink-hover active:scale-95 disabled:opacity-35">
                <Icon name="send" size={18} strokeWidth={2} />
              </button>
            </div>
            <div className="mt-1.5 hidden px-1 text-xs text-muted md:block">Enter to send · Shift + Enter for a new line · Talk to speak with {name}{view.threadId ? ' · this chat keeps going: no need to start over' : ''}</div>
          </form>
        )}
      </div>
    </div>
  );
}

function ThreadLinks({ threads, active, onPick, prefix, onArchive, onRestore }: {
  threads: ChatThread[]; active: number | null; onPick: (t: ChatThread) => void; prefix?: boolean;
  onArchive?: (t: ChatThread) => void; onRestore?: (t: ChatThread) => void;
}) {
  return (
    <ul className="space-y-0.5">
      {threads.slice(0, 30).map((t) => (
        <li key={t.id} className={cx('group flex items-center rounded-lg transition', t.id === active ? 'bg-hover' : 'hover:bg-hover')}>
          <button onClick={() => onPick(t)} aria-current={t.id === active ? 'true' : undefined} className="flex min-h-11 min-w-0 flex-1 items-center gap-2 px-2 py-1.5 text-left text-sm">
            {prefix && <Avatar name={t.agent} size="xs" />}
            <span className="min-w-0 flex-1">
              <span className={cx('block truncate', t.id === active ? 'font-semibold text-fg' : 'text-fg-2')}>{prefix ? <span className="font-medium text-fg">{t.agent}: </span> : null}{t.title || 'Chat'}</span>
              <span className="block text-xs text-muted">{timeAgo(t.updated)}{typeof t.messages === 'number' ? ` · ${t.messages} message${t.messages === 1 ? '' : 's'}` : ''}</span>
            </span>
          </button>
          {onArchive && <button onClick={() => onArchive(t)} aria-label={`Archive "${t.title || 'Chat'}"`} title="Archive" className="grid h-11 w-10 shrink-0 place-items-center rounded-lg text-faint transition hover:text-fg sm:opacity-0 sm:group-hover:opacity-100 sm:focus:opacity-100"><Icon name="folder" size={15} /></button>}
          {onRestore && <button onClick={() => onRestore(t)} aria-label={`Restore "${t.title || 'Chat'}"`} className="mr-1 inline-flex min-h-9 shrink-0 items-center gap-1 rounded-lg px-2 text-xs font-semibold text-accent-ink transition hover:bg-surface"><Icon name="undo" size={13} />Restore</button>}
        </li>
      ))}
    </ul>
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
  const [t, setT] = useState<ChatThreadFull | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    if (!open || t) return;
    api<{ thread: ChatThreadFull }>(`/chat/threads/${threadId}`).then((r) => setT(r.thread)).catch((e) => setError(e.message));
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

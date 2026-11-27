// Chat screen state (Batch 4b), kept pure and import-free so the engine tests can load this file
// directly (engine/test/hqBatch4b.test.ts).
//
// The bug it fixes (Alex, 2026-11-27): "Riley is looking it up" showed while talking to Ada. The
// screen showed the typing line for whichever agent was on screen, not for the agent that was
// asked: ask Ada, switch to Riley before the answer, and Riley "looked it up"; the answer then
// landed in Riley's view and the next question went to Ada's chat as Riley. Now the question in
// flight remembers its agent and its chat, and the typing line shows only there, with that name.

/** What is on screen: an agent and one of its chats (null = a new chat, nothing sent yet). */
export interface ChatView { agent: string; threadId: number | null }
/** A question waiting for its answer: who was asked, in which chat (null = it starts a new chat). */
export interface PendingAsk { agent: string; threadId: number | null; text: string }

/** The agent "looking it up" in this view, or null: only the asked agent, only in the chat it was asked in. */
export function typingIn(view: ChatView, pending: PendingAsk | null | undefined): string | null {
  if (!pending) return null;
  return pending.agent === view.agent && pending.threadId === view.threadId ? pending.agent : null;
}

/** When the answer comes back: a new chat still on screen becomes that chat; any other view stays. */
export function afterReply(view: ChatView, pending: PendingAsk, threadId: number): ChatView {
  return view.agent === pending.agent && view.threadId === pending.threadId ? { agent: pending.agent, threadId } : view;
}

export interface ChatRoute {
  agent: string;
  /** A chat id in the link, else null. */
  threadId: number | null;
  /** #/chat/<agent>/new: start a new chat. */
  fresh: boolean;
  /** ?ask=…: a question to type in (not sent). */
  ask: string;
}

/**
 * Read #/chat/<agent>[/<id> | /new][?ask=…]. An agent the person may not talk to (or none) → the
 * first one in `agents` (Ada). No id and not new = open the chat they had open last.
 */
export function parseChatHash(hash: string, agents: readonly string[]): ChatRoute {
  const raw = String(hash ?? '').replace(/^#?\/?/, '');
  const [path, query = ''] = raw.split('?');
  const parts = path.split('/').map((p) => { try { return decodeURIComponent(p); } catch { return p; } });
  const name = String(parts[1] ?? '').toLowerCase();
  const agent = agents.find((a) => a.toLowerCase() === name) ?? agents[0] ?? 'Ada';
  const seg = parts[2] ?? '';
  let ask = '';
  try { ask = new URLSearchParams(query).get('ask') ?? ''; } catch { ask = ''; }
  return { agent, threadId: /^\d{1,12}$/.test(seg) ? Number(seg) : null, fresh: seg === 'new', ask: ask.trim().slice(0, 4000) };
}

/** A link into chat: chatHref('Atlas', { ask: "How is GMG's health?" }) → chat/Atlas?ask=How%20is%20GMG's%20health%3F */
export function chatHref(agent: string, opts: { ask?: string; threadId?: number; fresh?: boolean } = {}): string {
  const base = `chat/${encodeURIComponent(agent)}${opts.threadId ? `/${opts.threadId}` : opts.fresh ? '/new' : ''}`;
  return opts.ask ? `${base}?ask=${encodeURIComponent(opts.ask)}` : base;
}

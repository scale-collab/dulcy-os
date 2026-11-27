// Round 3 (Alex 2026-11-27, Team): "where to see agents talking to each other (e.g. Ada ↔ Atlas)".
// One read-only list of agent-to-agent exchanges, newest first, filter by agent:
//   - ask:     Ada asking another agent from a chat (ask_agent; a chat thread with parent_id and
//              asked_by = the asking agent). Opens the thread (question and answer), read only.
//   - handoff: Ada re-queuing a stalled task back to its agent (hq_agent_tasks.requeues > 0).
//              Opens the task (what Ada handed back, and the agent's latest note), read only.
// Who sees what: the owner sees all; a member sees only the asks from their own chats, and never an
// exchange that involves an owner-only agent (Ledger, Sienna) on either side. Nothing is written.
import type { Db } from '../db/pool.js';
import type { HqUser } from './auth.js';
import { agentByName, type AgentName } from './agents.js';
import { canTalkTo, readThread } from './chat.js';

export interface Exchange {
  id: string; kind: 'ask' | 'handoff'; from: string; to: string; title: string; preview: string; at: string; messages: number;
  threadId?: number; parentId?: number | null; taskId?: number; status?: string;
}
const visible = (u: HqUser, ...names: string[]) => names.every((x) => { const a = agentByName(x); return !!a && canTalkTo(u, a); });
const short = (x: unknown, k = 220) => String(x ?? '').replace(/\s+/g, ' ').trim().slice(0, k);

/** GET /team/conversations: newest first, at most `limit`, optionally only those with `agent` on either side. */
export async function agentConversations(db: Db, user: HqUser, opts: { agent?: AgentName | null; limit?: number } = {}): Promise<Exchange[]> {
  const limit = Math.min(200, Math.max(1, opts.limit ?? 80));
  const owner = user.role === 'owner';
  const asks = (await db.query(
    `SELECT t.id, t.agent, t.asked_by, t.parent_id, t.title, t.updated_at,
       (SELECT text FROM hq_chat_messages m WHERE m.thread_id=t.id AND m.role='user' ORDER BY id LIMIT 1) AS q,
       (SELECT text FROM hq_chat_messages m WHERE m.thread_id=t.id AND m.role='assistant' ORDER BY id DESC LIMIT 1) AS a,
       (SELECT count(*)::int FROM hq_chat_messages m WHERE m.thread_id=t.id) AS n,
       p.agent AS parent_agent
     FROM hq_chat_threads t LEFT JOIN hq_chat_threads p ON p.id = t.parent_id
     WHERE t.asked_by <> 'user' AND ($1 OR t.user_id = $2) AND ($3::text IS NULL OR t.agent = $3 OR t.asked_by = $3)
     ORDER BY t.updated_at DESC, t.id DESC LIMIT $4`, [owner, user.id, opts.agent ?? null, limit])).rows;
  const handoffs = (await db.query(
    `SELECT id, agent, title, status, progress_note, requeues, COALESCE(requeued_at, updated_at) AS at FROM hq_agent_tasks
     WHERE requeues > 0 AND ($1::text IS NULL OR agent = $1 OR $1 = 'Ada') ORDER BY COALESCE(requeued_at, updated_at) DESC, id DESC LIMIT $2`, [opts.agent ?? null, limit])).rows;
  const out: Exchange[] = [
    ...asks.filter((r) => visible(user, r.agent, r.asked_by, ...(r.parent_agent ? [r.parent_agent] : []))).map((r): Exchange => ({
      id: `ask-${r.id}`, kind: 'ask', from: r.asked_by, to: r.agent, title: short(r.q || r.title, 160) || 'Question', preview: short(r.a), at: new Date(r.updated_at).toISOString(),
      messages: r.n, threadId: Number(r.id), parentId: r.parent_id ? Number(r.parent_id) : null,
    })),
    ...handoffs.filter((r) => visible(user, r.agent, 'Ada')).map((r): Exchange => ({
      id: `handoff-${r.id}`, kind: 'handoff', from: 'Ada', to: r.agent, title: `Handed back: ${short(r.title, 140)}`, preview: short(r.progress_note) || `Re-queued ${r.requeues}×`,
      at: new Date(r.at).toISOString(), messages: 2, taskId: Number(r.id), status: r.status,
    })),
  ];
  return out.sort((a, b) => b.at.localeCompare(a.at) || b.id.localeCompare(a.id)).slice(0, limit);
}

export interface ExchangeMessage { author: string; role: 'question' | 'answer' | 'note'; text: string; at: string }
/** GET /team/conversations/<ask-N|handoff-N>: the exchange read only. null = not found or not visible. */
export async function agentConversation(db: Db, user: HqUser, id: string): Promise<{ exchange: Exchange; messages: ExchangeMessage[]; parent: { id: number; agent: string; title: string } | null } | null> {
  const m = /^(ask|handoff)-(\d{1,12})$/.exec(id);
  if (!m) return null;
  if (m[1] === 'ask') {
    const t = await readThread(db, user, Number(m[2]));
    if (!t || t.askedBy === 'user' || !visible(user, t.agent, t.askedBy)) return null;
    const p = t.parentId ? (await db.query(`SELECT id, agent, title, user_id FROM hq_chat_threads WHERE id=$1`, [t.parentId])).rows[0] : null;
    if (p && !visible(user, p.agent)) return null;
    const parent = p && (user.role === 'owner' || p.user_id === user.id) ? { id: Number(p.id), agent: p.agent, title: p.title } : null;
    const first = t.messages.find((x) => x.role === 'user');
    return {
      exchange: { id, kind: 'ask', from: t.askedBy, to: t.agent, title: short(first?.text ?? t.title, 160), preview: '', at: t.messages.at(-1)?.created ?? '', messages: t.messages.length, threadId: t.id, parentId: t.parentId },
      messages: t.messages.map((x) => ({ author: x.role === 'user' ? t.askedBy : x.author || t.agent, role: x.role === 'user' ? 'question' : 'answer', text: x.text, at: x.created })),
      parent,
    };
  }
  const r = (await db.query(`SELECT id, agent, title, status, notes, progress_note, requeues, requeued_at, updated_at, job_kind FROM hq_agent_tasks WHERE id=$1 AND requeues > 0`, [Number(m[2])])).rows[0];
  if (!r || !visible(user, r.agent, 'Ada')) return null;
  const at = new Date(r.requeued_at ?? r.updated_at).toISOString();
  return {
    exchange: { id, kind: 'handoff', from: 'Ada', to: r.agent, title: `Handed back: ${short(r.title, 140)}`, preview: '', at, messages: 2, taskId: Number(r.id), status: r.status },
    messages: [
      { author: 'Ada', role: 'question', text: `${r.agent}, this task had not moved: I re-queued it${r.job_kind ? ` (${r.job_kind})` : ''}. Times re-queued: ${r.requeues}.\n\n${r.title}${r.notes ? `\n${String(r.notes).slice(0, 1500)}` : ''}`, at },
      { author: r.agent, role: 'note', text: r.progress_note ? `Latest note: ${r.progress_note} (status: ${String(r.status).replace('_', ' ')})` : `No note yet (status: ${String(r.status).replace('_', ' ')})`, at: new Date(r.updated_at).toISOString() },
    ],
    parent: null,
  };
}

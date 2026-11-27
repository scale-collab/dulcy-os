// HQ chat: talk to Ada (default) or any agent, with saved history. Each agent answers with its own
// skill file plus RULES.md as its instructions, and small READ-ONLY tools over Airtable and the
// engine (no sending, no writes). Ada can ask another agent (ask_agent); that conversation is saved
// as its own Ada ↔ agent thread that can be opened. Answers name their sources; when unsure the
// agent says "here's what I found" and who should handle it.
// Cost guard: at most HQ_CHAT_MAX_ROUNDS tool rounds and HQ_CHAT_MAX_TOKENS output tokens per call,
// at most 2 ask_agent calls per answer, no ask_agent inside an asked agent, tool results capped.
import type Anthropic from '@anthropic-ai/sdk';
import type { Db } from '../db/pool.js';
import type { Config } from '../config.js';
import { readKnowledge } from '../agents/knowledge.js';
import { CP } from '../agents/campaignPlan.js';
import { EMAILS, val } from '../agents/emailsFields.js';
import { ACTIVITY, AF, agentFormula } from '../activity.js';
import { AGENTS, AGENT_NAMES, OWNER_ONLY, agentByName, jobPatternsFor, type AgentName } from './agents.js';
import { pendingDecisions, type HqAirtable } from './decisions.js';
import { clientNames, listTasks } from './tasks.js';
import { agentTasks } from './team.js';
import type { HqUser } from './auth.js';

type Msg = Anthropic.Beta.BetaMessageParam;
type Tool = Anthropic.Beta.BetaTool;
export interface ModelReply { content: any[]; stop_reason: string | null; usage?: Record<string, unknown> }
export type ChatModel = (stable: string[], varying: string, messages: Msg[], tools: Tool[], maxTokens: number) => Promise<ModelReply>;

export interface ChatDeps { db: Db; cfg: Config; at?: HqAirtable; model?: ChatModel; user: HqUser }
export interface SavedMessage { id: number; threadId: number; role: 'user' | 'assistant'; author: string; text: string; sources: string[]; tools: { name: string; input: unknown; note: string; threadId?: number }[]; created: string }

const CAMPAIGNS = 'tblAVAA6uBPaMj28P';
const RESULT_CAP = 12_000;
const MAX_ASKS = 2;
const HISTORY = 20;

const canSeeMoney = (u: HqUser) => u.role === 'owner';
export const canTalkTo = (u: HqUser, agent: AgentName) => !AGENTS[agent].ownerOnly || canSeeMoney(u);

function guide(agent: AgentName, asked: boolean): string {
  const a = AGENTS[agent];
  const roster = AGENT_NAMES.map((n) => `- ${n} (${AGENTS[n].role}): ${AGENTS[n].does}`).join('\n');
  return [`You are ${agent}, Dulcy's ${a.role}, inside Dulcy HQ, the owner's private app. ${asked ? 'Ada (the COO) is asking you on the owner\'s behalf; answer her directly.' : ''}`,
    'How to answer:',
    '- Result first, exact numbers, a short list at most. No walls of text, no invented numbers or percentages.',
    '- Look facts up with the read-only tools before stating anything about clients, campaigns, replies, decisions, tasks, jobs or reports. Never guess; unknown = say UNKNOWN.',
    '- End with one line "Sources: ..." naming what you read (the tool and table, e.g. "Airtable Campaigns, engine jobs").',
    '- "Where is X?" / "what is <agent> doing?": read agent_todo first and answer from the task: its status, its progress note, when it last moved, and its due date. Cite it as "HQ task #<id>". If it is stalled or overdue, say so plainly and what moves it next.',
    '- If the data does not answer the question or you are not sure, start with "Here\'s what I found:", give what you found, and say who should handle it (one agent from the roster, or Alex / Josh).',
    '- From chat you cannot send, launch, pause, spend credits, delete or change anything. If asked to, say exactly what would be done and that it needs the owner\'s approval in Decisions or the right screen.',
    '- Never reveal keys, tokens or passwords. Money, finance and content only for the owner.',
    agent === 'Ada' && !asked ? '- You run the team. When a question is clearly another agent\'s area, ask them with ask_agent (at most 2 per answer), then give one short answer and say who answered.' : '',
    `Team (all report to Ada; Atlas manages Scribe and Scout):\n${roster}`].filter(Boolean).join('\n');
}

const TOOLS: Tool[] = [
  { name: 'list_clients', description: 'Active Dulcy clients (name, status, type) from Airtable Workspace IDs.', input_schema: { type: 'object', properties: {}, additionalProperties: false } },
  { name: 'list_campaigns', description: 'Email campaigns from Airtable Campaigns: name, client, status, progress, sent, replies, interested, bounce %.', input_schema: { type: 'object', properties: { client: { type: 'string', description: 'Part of a client name' }, active_only: { type: 'boolean', description: 'Default true' } }, additionalProperties: false } },
  { name: 'pending_decisions', description: 'Decisions waiting on the owner (Airtable Decisions, Status New/Waiting).', input_schema: { type: 'object', properties: { agent: { type: 'string' } }, additionalProperties: false } },
  { name: 'open_tasks', description: 'Open tasks from Airtable Tasks sorted Do now / Schedule / Delegate / Later.', input_schema: { type: 'object', properties: { box: { type: 'string', enum: ['doNow', 'schedule', 'delegate', 'later'] } }, additionalProperties: false } },
  { name: 'recent_activity', description: 'Activity Log rows (what the engine and agents did), newest first.', input_schema: { type: 'object', properties: { agent: { type: 'string' }, days: { type: 'integer', minimum: 1, maximum: 14 } }, additionalProperties: false } },
  { name: 'reply_counts', description: 'Prospect replies in the last N days from Airtable Emails, counted by client and lead status, plus meetings booked.', input_schema: { type: 'object', properties: { client: { type: 'string' }, days: { type: 'integer', minimum: 1, maximum: 30 } }, additionalProperties: false } },
  { name: 'engine_jobs', description: 'Recent engine jobs (agent runs): kind, status, time, message.', input_schema: { type: 'object', properties: { agent: { type: 'string' }, status: { type: 'string', enum: ['queued', 'running', 'succeeded', 'failed', 'needs_review'] }, limit: { type: 'integer', minimum: 1, maximum: 20 } }, additionalProperties: false } },
  { name: 'agent_todo', description: "The agents' own task lists in HQ: each task's id, status (open / in_progress / waiting_alex / done), due date, last update, one-line progress note, and whether it is overdue or stalled (no update for 2+ days). Use it FIRST for \"where is X?\" / \"what is <agent> doing?\" / \"how far is the <client> campaign?\" questions, and cite the task as \"HQ task #<id>\".", input_schema: { type: 'object', properties: { agent: { type: 'string' }, search: { type: 'string', description: 'Words in the title, client or note (e.g. a client or campaign name)' }, include_done: { type: 'boolean', description: 'Also tasks finished in the last 7 days. Default true.' } }, additionalProperties: false } },
  { name: 'agent_reports', description: 'Recent agent reports saved in HQ (brief, client health, call reviews, ...): title, summary, date.', input_schema: { type: 'object', properties: { agent: { type: 'string' }, limit: { type: 'integer', minimum: 1, maximum: 10 } }, additionalProperties: false } },
];
const ASK_TOOL: Tool = { name: 'ask_agent', description: 'Ask another agent a question; their answer comes back and the conversation is saved for the owner to read.', input_schema: { type: 'object', properties: { agent: { type: 'string', enum: AGENT_NAMES.filter((a) => a !== 'Ada') as string[] }, question: { type: 'string' } }, required: ['agent', 'question'], additionalProperties: false } };

const s = (v: unknown) => val(v);
const num = (v: unknown) => { const n = Number(val(v)); return Number.isFinite(n) ? n : 0; };
const needAt = (at?: HqAirtable): HqAirtable => { if (!at) throw new Error('Airtable is not connected on this server (AIRTABLE_API_KEY)'); return at; };

interface ToolOut { source: string; data: unknown; note: string; threadId?: number }

async function runTool(deps: ChatDeps, name: string, input: any, ctx: { asks: number; threadId: number; agent: AgentName }): Promise<ToolOut> {
  const { db, user } = deps;
  const agentArg = input?.agent ? agentByName(String(input.agent)) : null;
  switch (name) {
    case 'list_clients': {
      const rows = await needAt(deps.at).list('tblcjRBGJEWh5KgOt', `{Status}='Active'`, ['Name', 'Status', 'Client Type'], 100, { byName: true });
      return { source: 'Airtable Workspace IDs', data: rows.map((r) => ({ name: s(r.fields.Name), status: s(r.fields.Status), type: s(r.fields['Client Type']) })), note: `${rows.length} active` };
    }
    case 'list_campaigns': {
      const at = needAt(deps.at);
      const active = input?.active_only !== false;
      const [rows, names] = await Promise.all([at.list(CAMPAIGNS, active ? `{Campaign Status}='Active'` : `{Emails Sent}>0`, [CP.name, CP.client, CP.status, CP.progress, CP.sent, CP.replies, CP.interested, CP.bounced], 500), clientNames(at)]);
      const want = String(input?.client ?? '').toLowerCase();
      const out = rows.map((r) => { const p = num(r.fields[CP.progress]); return { name: s(r.fields[CP.name]), client: names.get(s(r.fields[CP.client])) ?? '', status: s(r.fields[CP.status]), progress_pct: Math.round((p > 1 ? p / 100 : p) * 100), sent: num(r.fields[CP.sent]), replies: num(r.fields[CP.replies]), interested: num(r.fields[CP.interested]), bounce_pct: num(r.fields[CP.bounced]) }; })
        .filter((c) => !want || c.client.toLowerCase().includes(want)).sort((a, b) => b.progress_pct - a.progress_pct).slice(0, 60);
      return { source: 'Airtable Campaigns', data: out, note: `${out.length} campaigns` };
    }
    case 'pending_decisions': {
      const all = (await pendingDecisions(needAt(deps.at))).filter((d) => canSeeMoney(user) || (d.pile !== 'Money' && !OWNER_ONLY.includes(d.agent))).filter((d) => !agentArg || d.agent === agentArg);
      return { source: 'Airtable Decisions', data: all.slice(0, 40).map((d) => ({ title: d.title, agent: d.agent, client: d.client, pile: d.pile, issue: d.issue.slice(0, 200), created: d.created })), note: `${all.length} waiting` };
    }
    case 'open_tasks': {
      const t = await listTasks(needAt(deps.at), db);
      const pick = (b: keyof typeof t.boxes) => t.boxes[b].slice(0, 25).map((x) => ({ name: x.name, client: x.client, due: x.due, priority: x.priority, stage: x.stage, overdue: x.overdue }));
      const data = input?.box ? { [input.box]: pick(input.box) } : { doNow: pick('doNow'), schedule: pick('schedule'), delegate: pick('delegate'), later_count: t.boxes.later.length };
      return { source: 'Airtable Tasks', data, note: `${t.total} open` };
    }
    case 'recent_activity': {
      const days = Math.min(14, Math.max(1, Number(input?.days) || 2));
      const rows = await needAt(deps.at).list(ACTIVITY, agentArg ? `AND(${agentFormula('Agent', agentArg)},IS_AFTER({When},DATEADD(NOW(),-${days},'days')))` : `IS_AFTER({When},DATEADD(NOW(),-${days},'days'))`, [AF.event, AF.when, AF.agent, AF.type], 60, { sortField: AF.when, sortDesc: true });
      return { source: 'Airtable Activity Log', data: rows.map((r) => ({ when: s(r.fields[AF.when]), agent: s(r.fields[AF.agent]), type: s(r.fields[AF.type]), event: s(r.fields[AF.event]) })), note: `${rows.length} rows` };
    }
    case 'reply_counts': {
      const at = needAt(deps.at);
      const days = Math.min(30, Math.max(1, Number(input?.days) || 7));
      const [rows, ws] = await Promise.all([
        at.list(EMAILS, `IS_AFTER({Latest Reply Time},DATEADD(NOW(),-${days},'days'))`, ['Workspace ID (Bison)', 'Lead Status', 'Meeting Booked At', 'Date of Call Booked'], 3000, { byName: true }),
        at.list('tblcjRBGJEWh5KgOt', `{ID}!=''`, ['ID', 'Name'], 300, { byName: true }),
      ]);
      const names = new Map(ws.map((w) => [String(num(w.fields.ID)), s(w.fields.Name)]));
      const want = String(input?.client ?? '').toLowerCase();
      const per: Record<string, Record<string, number>> = {};
      for (const r of rows) {
        const c = names.get(s(r.fields['Workspace ID (Bison)'])) ?? `workspace ${s(r.fields['Workspace ID (Bison)']) || '?'}`;
        if (want && !c.toLowerCase().includes(want)) continue;
        const e = (per[c] ??= { replies: 0, booked: 0 });
        e.replies++; const st = s(r.fields['Lead Status']) || 'No status'; e[st] = (e[st] ?? 0) + 1;
        if (s(r.fields['Meeting Booked At']) || s(r.fields['Date of Call Booked'])) e.booked++;
      }
      return { source: 'Airtable Emails', data: { days, by_client: per }, note: `${rows.length} replies in ${days} days` };
    }
    case 'engine_jobs': {
      const limit = Math.min(20, Math.max(1, Number(input?.limit) || 10));
      const r = await db.query(`SELECT id, kind, status, updated_at, dry_run, left(COALESCE(result->>'message', error, progress, ''), 300) AS message FROM jobs
        WHERE ($1::text[] IS NULL OR kind LIKE ANY($1)) AND ($2::text IS NULL OR status=$2) ORDER BY id DESC LIMIT $3`,
        [agentArg ? jobPatternsFor(agentArg) : null, input?.status ?? null, limit]);
      const rows = r.rows.filter((x) => canSeeMoney(user) || !['ledger.', 'sienna.'].some((p) => String(x.kind).startsWith(p)));
      return { source: 'Engine jobs', data: rows.map((x) => ({ id: Number(x.id), kind: x.kind, status: x.status, at: new Date(x.updated_at).toISOString(), dry_run: x.dry_run, message: x.message })), note: `${rows.length} jobs` };
    }
    case 'agent_todo': {
      const words = String(input?.search ?? '').toLowerCase().split(/\s+/).filter((w) => w.length > 1);
      const t = (await agentTasks(db, agentArg ?? undefined, input?.include_done !== false))
        .filter((x) => canSeeMoney(user) || !OWNER_ONLY.includes(x.agent))
        .filter((x) => !words.length || words.every((w) => `${x.title} ${x.client} ${x.note} ${x.notes}`.toLowerCase().includes(w)));
      const open = t.filter((x) => x.status !== 'done').length;
      return {
        source: 'HQ agent task lists',
        data: t.slice(0, 40).map((x) => ({
          task: `HQ task #${x.id}`, agent: x.agent, title: x.title, status: x.status, due: x.due, client: x.client, progress: x.note || x.notes,
          last_update: x.updated, done_at: x.done, overdue: x.overdue, stalled: x.stalled, link: x.link,
        })),
        note: `${open} open${t.length > open ? `, ${t.length - open} done in 7 days` : ''}`,
      };
    }
    case 'agent_reports': {
      const limit = Math.min(10, Math.max(1, Number(input?.limit) || 5));
      const r = await db.query(`SELECT id, agent, kind, title, summary, created_at FROM hq_reports WHERE ($1::text IS NULL OR agent=$1) AND ($2 OR NOT (agent = ANY($4))) ORDER BY id DESC LIMIT $3`, [agentArg, canSeeMoney(user), limit, OWNER_ONLY]);
      return { source: 'HQ reports', data: r.rows.map((x) => ({ id: Number(x.id), agent: x.agent, kind: x.kind, title: x.title, summary: x.summary, at: new Date(x.created_at).toISOString() })), note: `${r.rows.length} reports` };
    }
    case 'ask_agent': {
      if (ctx.agent !== 'Ada') throw new Error('only Ada can ask other agents');
      if (ctx.asks >= MAX_ASKS) throw new Error(`at most ${MAX_ASKS} questions to other agents per answer`);
      const target = agentArg;
      if (!target || target === 'Ada') throw new Error('unknown agent');
      if (!canTalkTo(user, target)) throw new Error(`${target} is owner-only`);
      const q = String(input?.question ?? '').trim().slice(0, 2000);
      if (!q) throw new Error('no question');
      ctx.asks++;
      const sub = await chatTurn(deps, { agent: target, message: q, askedBy: 'Ada', parentId: ctx.threadId });
      return { source: `${target} (asked by Ada)`, data: { answer: sub.reply.text, sources: sub.reply.sources }, note: `asked ${target}`, threadId: sub.threadId };
    }
  }
  throw new Error(`unknown tool ${name}`);
}

async function loadThread(db: Db, id: number) {
  return (await db.query(`SELECT id, user_id, agent, asked_by, parent_id, title, archived_at FROM hq_chat_threads WHERE id=$1`, [id])).rows[0] ?? null;
}

async function saveMessage(db: Db, m: Omit<SavedMessage, 'id' | 'created'> & { usage?: unknown }): Promise<SavedMessage> {
  const r = await db.query(`INSERT INTO hq_chat_messages (thread_id, role, author, text, sources, tools, usage) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id, created_at`,
    [m.threadId, m.role, m.author, m.text, JSON.stringify(m.sources), JSON.stringify(m.tools), m.usage === undefined ? null : JSON.stringify(m.usage)]);
  await db.query(`UPDATE hq_chat_threads SET updated_at=now() WHERE id=$1`, [m.threadId]);
  return { ...m, id: Number(r.rows[0].id), created: new Date(r.rows[0].created_at).toISOString() };
}

/** History as plain alternating text turns (tool calls are not replayed; their results are in the answers). */
function history(rows: { role: string; text: string }[]): Msg[] {
  const out: Msg[] = [];
  for (const r of rows) {
    const role = r.role === 'assistant' ? 'assistant' : 'user';
    const last = out[out.length - 1];
    if (last && last.role === role) last.content = `${last.content as string}\n\n${r.text}`;
    else out.push({ role, content: r.text });
  }
  while (out.length && out[0].role !== 'user') out.shift();
  return out;
}

export function defaultModel(cfg: Config): ChatModel {
  return async (stable, varying, messages, tools, maxTokens) => {
    const { createClaude } = await import('../providers/claude.js');
    const c = createClaude({ apiKey: cfg.anthropicApiKey, model: cfg.claudeModel, baseURL: cfg.anthropicBaseUrl });
    const r = await c.chatTurn(stable, varying, messages, tools, maxTokens);
    return { content: r.content as any[], stop_reason: r.stop_reason, usage: r.usage as any };
  };
}

export interface TurnInput { agent: AgentName; message: string; threadId?: number; askedBy?: string; parentId?: number }

/** One chat turn: save the question, run the agent with its read-only tools, save and return the answer. */
export async function chatTurn(deps: ChatDeps, t: TurnInput): Promise<{ threadId: number; agent: AgentName; question: SavedMessage; reply: SavedMessage }> {
  const { db, cfg, user } = deps;
  const model = deps.model ?? defaultModel(cfg);
  if (!canTalkTo(user, t.agent)) throw Object.assign(new Error(`${t.agent} is owner-only`), { status: 403 });
  const asked = Boolean(t.askedBy);
  let threadId = t.threadId;
  if (threadId) {
    const th = await loadThread(db, threadId);
    if (!th || (user.role !== 'owner' && th.user_id !== user.id)) throw Object.assign(new Error('thread not found'), { status: 404 });
    // The chat belongs to one agent: a message for another agent never lands in it (Batch 4b bug: the
    // screen asked Riley inside Ada's chat after switching agents mid-answer).
    if (th.agent !== t.agent) throw Object.assign(new Error(`This chat is with ${th.agent}, not ${t.agent}. Open a chat with ${t.agent}.`), { status: 409 });
    // Asking again in a chat brings it back from the archive and makes it the one that opens next.
    await db.query(`UPDATE hq_chat_threads SET archived_at=NULL, opened_at=now(), title=CASE WHEN title='' THEN $2 ELSE title END WHERE id=$1`, [threadId, t.message.replace(/\s+/g, ' ').slice(0, 80)]);
  } else {
    threadId = Number((await db.query(`INSERT INTO hq_chat_threads (user_id, agent, asked_by, parent_id, title) VALUES ($1,$2,$3,$4,$5) RETURNING id`,
      [user.id, t.agent, t.askedBy ?? 'user', t.parentId ?? null, t.message.replace(/\s+/g, ' ').slice(0, 80)])).rows[0].id);
  }
  const question = await saveMessage(db, { threadId, role: 'user', author: t.askedBy ?? user.name, text: t.message, sources: [], tools: [] });
  const past = (await db.query(`SELECT role, text FROM (SELECT id, role, text FROM hq_chat_messages WHERE thread_id=$1 ORDER BY id DESC LIMIT $2) x ORDER BY id`, [threadId, HISTORY])).rows;
  const messages = history(past);

  const k = (rel: string) => readKnowledge(cfg.knowledgeDir, rel);
  const stable = [guide(t.agent, asked), k(AGENTS[t.agent].skill).slice(0, 40_000), k('rules/RULES.md').slice(0, 60_000)];
  const varying = `Now: ${new Date().toLocaleString('en-US', { timeZone: 'America/New_York', dateStyle: 'full', timeStyle: 'short' })} (New York). You are talking with ${asked ? 'Ada' : `${user.name} (${user.role})`}.`;
  const tools = t.agent === 'Ada' && !asked ? [...TOOLS, ASK_TOOL] : TOOLS;

  const sources = new Set<string>(); const used: SavedMessage['tools'] = [];
  const usage = { input_tokens: 0, output_tokens: 0, cache_read_input_tokens: 0, rounds: 0 };
  const ctx = { asks: 0, threadId, agent: t.agent };
  let finalText = '';
  const maxRounds = Math.max(0, cfg.hqChatMaxRounds);
  for (let round = 0; ; round++) {
    const lastRound = round >= maxRounds;
    const res = await model(stable, varying, messages, lastRound ? [] : tools, Math.max(256, cfg.hqChatMaxTokens));
    usage.rounds++;
    for (const key of ['input_tokens', 'output_tokens', 'cache_read_input_tokens'] as const) usage[key] += Number((res.usage as any)?.[key] ?? 0);
    const textNow = res.content.filter((b) => b.type === 'text').map((b) => b.text).join('\n').trim();
    if (res.stop_reason === 'refusal') { finalText = "I can't help with that one. Ask Alex."; break; }
    const calls = res.content.filter((b) => b.type === 'tool_use');
    if (res.stop_reason !== 'tool_use' || !calls.length || lastRound) {
      finalText = textNow || (res.stop_reason === 'max_tokens' ? '' : 'No answer.');
      if (res.stop_reason === 'max_tokens') finalText = `${finalText}\n\n(Answer cut short: the length limit was reached. Ask a narrower question.)`.trim();
      break;
    }
    messages.push({ role: 'assistant', content: res.content as any });
    const results: Anthropic.Beta.BetaToolResultBlockParam[] = [];
    for (const c of calls) {
      try {
        const out = await runTool(deps, c.name, c.input, ctx);
        sources.add(out.source);
        used.push({ name: c.name, input: c.input, note: out.note, ...(out.threadId ? { threadId: out.threadId } : {}) });
        const json = JSON.stringify(out.data);
        results.push({ type: 'tool_result', tool_use_id: c.id, content: json.length > RESULT_CAP ? `${json.slice(0, RESULT_CAP)} …(cut)` : json });
      } catch (e) {
        used.push({ name: c.name, input: c.input, note: `error: ${String((e as Error).message ?? e).slice(0, 200)}` });
        results.push({ type: 'tool_result', tool_use_id: c.id, content: `Error: ${String((e as Error).message ?? e).slice(0, 300)}`, is_error: true });
      }
    }
    messages.push({ role: 'user', content: results });
  }
  const reply = await saveMessage(db, { threadId, role: 'assistant', author: t.agent, text: finalText, sources: [...sources], tools: used, usage });
  return { threadId, agent: t.agent, question, reply };
}

/**
 * Chats, newest first. archived=false (default) leaves archived chats out; true lists only those.
 * Ada's own asks (asked_by Ada) are never archived. `mine` = this person's own chat.
 */
export async function listThreads(db: Db, user: HqUser, agent?: AgentName, opts: { archived?: boolean; limit?: number } = {}) {
  const r = await db.query(
    `SELECT t.id, t.user_id, t.agent, t.asked_by, t.parent_id, t.title, t.updated_at, t.opened_at, t.archived_at, (SELECT count(*)::int FROM hq_chat_messages m WHERE m.thread_id=t.id) AS messages
     FROM hq_chat_threads t WHERE ($1::text IS NULL OR t.agent=$1) AND ($2 OR t.user_id=$3) AND (CASE WHEN $4 THEN t.archived_at IS NOT NULL ELSE t.archived_at IS NULL END)
     ORDER BY t.updated_at DESC, t.id DESC LIMIT $5`, [agent ?? null, user.role === 'owner', user.id, opts.archived === true, Math.min(200, opts.limit ?? 80)]);
  return r.rows.filter((x) => canTalkTo(user, x.agent)).map((x) => ({
    id: Number(x.id), agent: x.agent, askedBy: x.asked_by, parentId: x.parent_id ? Number(x.parent_id) : null, title: x.title,
    updated: new Date(x.updated_at).toISOString(), opened: x.opened_at ? new Date(x.opened_at).toISOString() : null, archived: !!x.archived_at,
    mine: x.user_id === user.id, messages: x.messages,
  }));
}

/** The chat to open for this person and agent: the one they had open last (not archived). Null = start a new chat. */
export async function latestThread(db: Db, user: HqUser, agent: AgentName): Promise<number | null> {
  if (!canTalkTo(user, agent)) return null;
  const r = await db.query(`SELECT id FROM hq_chat_threads WHERE user_id=$1 AND agent=$2 AND asked_by='user' AND archived_at IS NULL ORDER BY opened_at DESC NULLS LAST, updated_at DESC, id DESC LIMIT 1`, [user.id, agent]);
  return r.rows[0] ? Number(r.rows[0].id) : null;
}

/** Archive (hide) or restore one of this person's own chats. False when it is not theirs. */
export async function archiveThread(db: Db, user: HqUser, id: number, archived: boolean): Promise<boolean> {
  const r = await db.query(`UPDATE hq_chat_threads SET archived_at = CASE WHEN $3 THEN COALESCE(archived_at, now()) ELSE NULL END, opened_at = CASE WHEN $3 THEN opened_at ELSE now() END
    WHERE id=$1 AND user_id=$2 AND asked_by='user'`, [id, user.id, archived]);
  return (r.rowCount ?? 0) > 0;
}

export async function readThread(db: Db, user: HqUser, id: number, opts: { open?: boolean } = {}) {
  const th = await loadThread(db, id);
  if (!th || (user.role !== 'owner' && th.user_id !== user.id) || !canTalkTo(user, th.agent)) return null;
  // Opening your own chat makes it the one that opens next time.
  if (opts.open && th.user_id === user.id && th.asked_by === 'user') await db.query(`UPDATE hq_chat_threads SET opened_at=now() WHERE id=$1`, [id]);
  const msgs = (await db.query(`SELECT id, role, author, text, sources, tools, created_at FROM hq_chat_messages WHERE thread_id=$1 ORDER BY id`, [id])).rows;
  const children = (await db.query(`SELECT id, agent, title FROM hq_chat_threads WHERE parent_id=$1 ORDER BY id`, [id])).rows;
  return {
    id: Number(th.id), agent: th.agent, askedBy: th.asked_by, parentId: th.parent_id ? Number(th.parent_id) : null, title: th.title,
    archived: !!th.archived_at, mine: th.user_id === user.id,
    messages: msgs.map((m) => ({ id: Number(m.id), role: m.role, author: m.author, text: m.text, sources: m.sources ?? [], tools: m.tools ?? [], created: new Date(m.created_at).toISOString() })),
    children: children.map((c) => ({ id: Number(c.id), agent: c.agent, title: c.title })),
  };
}

// ---------- Batch 4b: suggested questions, changing daily ----------
// Alex, 2026-11-27: suggested questions per agent that change every day. Each agent has a pool;
// the day (New York) and the agent pick them (the same all day, a different mix tomorrow), plus
// at most 1 built from live data (the client with the most replies waiting, the next campaign
// that is due, a late task, a failed run). Ledger and Sienna are owner-only (the route checks).
export const QUESTION_POOLS: Record<AgentName, string[]> = {
  Ada: [
    'Which agent had problems this week?',
    'What needs me first today?',
    'Which tasks are late or stuck, and who owns them?',
    'What did the team finish yesterday?',
    'Ask Atlas which campaigns are past 60%',
    'Which client needs my attention most this week?',
    'What is waiting on me, and what happens if I wait a day?',
    'Give me the 3 things to fix this week, most important first.',
  ],
  Atlas: [
    'Which campaigns are past 60%, and which have a next campaign ready?',
    'Any bounce rates over 2.5%?',
    'Which client is furthest from their promised meetings this month?',
    'Which campaign has the best reply rate right now?',
    'Which clients have no campaign sending today?',
    'What should the next campaign be for our weakest client?',
    'Which inboxes are resting, and when do they come back?',
  ],
  Scribe: [
    'Which offers are getting the most success?',
    'Which industries does Dulcy target best?',
    'Which subject lines get the most replies?',
    'Which first lines get interested replies, not just replies?',
    'Which campaign copy should we rewrite first?',
    'What do the best follow-ups have in common?',
  ],
  Scout: [
    'Hyper-personalised vs regular lead lists: which works better?',
    'Which lead source gives the lowest bounce rate?',
    'Which job titles reply the most?',
    'Which lists are almost used up?',
    'Which company sizes book the most meetings?',
    'Where do our bounces come from: the list or the inboxes?',
  ],
  Echo: [
    'How did replies come in this week?',
    'What would tighten interested → booked?',
    'How many replies are waiting for approval?',
    'Which replies came in overnight?',
    'Which objections come up most, and how do we answer them?',
    'Which interested leads have not booked yet?',
  ],
  Riley: [
    'Did any engine job fail in the last 24 h?',
    'Which automations broke this week, and are they fixed?',
    'Is the reply sync working?',
    'What fixes are waiting for my OK?',
    'Which system breaks most often?',
    'Is anything running late or stuck right now?',
  ],
  Cole: [
    'What was the score of my last sales call?',
    'Where do deals leak: show rate, qualify rate or close rate?',
    'Which objection cost us the most deals?',
    'Which deals should I follow up on this week?',
    'What should I practise before my next call?',
    'How many calls does it take to close one client?',
  ],
  Ledger: [
    'How much did we spend on tools this month?',
    'Which invoices are unpaid?',
    'What is our cash position this week?',
    'Which purchases are waiting for my yes or no?',
    'Which tools could we cut?',
    'How does this month compare with last month?',
  ],
  Sienna: [
    'Which video ideas have real demand this week?',
    'What should I post this week?',
    'Which content did best last month?',
    'Which script is ready to record?',
    'What are people asking about cold email right now?',
    'Which clip should become a Short?',
  ],
};

/** A small stable hash (FNV-1a) of a string. */
function hash(x: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < x.length; i++) { h ^= x.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return h >>> 0;
}
/** A seeded shuffle (mulberry32). Pure. */
function shuffled<T>(xs: readonly T[], seed: number): T[] {
  let a = seed || 1;
  const rnd = () => { a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const out = [...xs];
  for (let i = out.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [out[i], out[j]] = [out[j], out[i]]; }
  return out;
}

/** What live data can turn into a question today. */
export interface QuestionFacts {
  /** The client with the most replies waiting for approval, and how many. */
  topReplies?: { client: string; n: number } | null;
  /** Clients with a campaign past 60% and no next campaign (Atlas's open "Plan next campaign" tasks). */
  nextCampaigns?: string[];
  /** The most late task the person may see. */
  lateTask?: { agent: string; title: string } | null;
  /** The agent's last failed run (last 24 h). */
  failedKind?: string | null;
  /** Money decisions waiting (owner only). */
  moneyWaiting?: number;
}

/** Live questions for one agent, from today's facts. Pure. */
export function liveQuestions(agent: AgentName, f: QuestionFacts): string[] {
  const out: string[] = [];
  const top = f.topReplies && f.topReplies.n > 0 ? f.topReplies : null;
  if (agent === 'Echo' && top) out.push(`${top.client} has ${top.n} repl${top.n === 1 ? 'y' : 'ies'} waiting: which should go first?`);
  if (agent === 'Atlas' && top) out.push(`How is ${top.client}'s health?`);
  if (agent === 'Atlas' && f.nextCampaigns?.length) out.push(`When does the next campaign for ${f.nextCampaigns[0]} start?`);
  if (agent === 'Ada' && f.lateTask) out.push(`Why is ${f.lateTask.agent} late on "${f.lateTask.title.slice(0, 60)}"?`);
  if (agent === 'Ada' && top && !f.lateTask) out.push(`${top.client} has the most replies waiting: is anyone on it?`);
  if (agent === 'Ledger' && (f.moneyWaiting ?? 0) > 0) out.push(`What do you recommend on the ${f.moneyWaiting} money decision${f.moneyWaiting === 1 ? '' : 's'} waiting?`);
  if (f.failedKind && agent !== 'Ada') out.push(`Why did ${f.failedKind} fail, and is it fixed?`);
  return out;
}

/**
 * Today's suggested questions for one agent: up to 1 live question first, then from the pool.
 * The pool is walked in a fixed per-agent order (seeded by the agent), starting at a new place each
 * day (seeded by the date), so it is the same all day, changes tomorrow, and every question comes
 * up within a few days. Pure.
 */
export function dailyQuestions(agent: AgentName, ymd: string, facts: QuestionFacts = {}, n = 4): string[] {
  const live = liveQuestions(agent, facts).slice(0, 1);
  const order = shuffled(QUESTION_POOLS[agent].filter((q) => !live.includes(q)), hash(`hq-questions:${agent}`));
  const take = Math.min(Math.max(0, n - live.length), order.length);
  const day = Math.floor(Date.parse(`${ymd}T12:00:00Z`) / 86_400_000);
  const start = Number.isFinite(day) ? (((day * take) % order.length) + order.length) % order.length : 0;
  return [...live, ...Array.from({ length: take }, (_, i) => order[(start + i) % order.length])];
}

/** Read today's facts (cheap; a source that fails is left out) and pick the questions. */
export async function suggestQuestions(db: Db, at: HqAirtable | undefined, user: HqUser, agent: AgentName, now = new Date()): Promise<{ agent: AgentName; date: string; questions: string[] }> {
  const date = now.toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
  const wantsDecisions = agent === 'Echo' || agent === 'Atlas' || agent === 'Ada' || agent === 'Ledger';
  const [decisions, tasks, fails] = await Promise.all([
    at && wantsDecisions ? pendingDecisions(at).catch(() => []) : Promise.resolve([]),
    agentTasks(db, undefined, false).catch(() => []),
    db.query(`SELECT kind FROM jobs WHERE status='failed' AND updated_at > now() - interval '24 hours' AND kind LIKE ANY($1) ORDER BY id DESC LIMIT 1`, [jobPatternsFor(agent)])
      .then((r) => r.rows as { kind: string }[]).catch(() => [] as { kind: string }[]),
  ]);
  const replies = new Map<string, number>();
  for (const d of decisions) if (d.pile === 'Replies' && d.client) replies.set(d.client, (replies.get(d.client) ?? 0) + 1);
  const top = [...replies].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0];
  const late = tasks.filter((t) => t.overdue && (canSeeMoney(user) || !OWNER_ONLY.includes(t.agent))).sort((a, b) => b.daysLate - a.daysLate || a.id - b.id)[0];
  const facts: QuestionFacts = {
    topReplies: top ? { client: top[0], n: top[1] } : null,
    nextCampaigns: tasks.filter((t) => t.agent === 'Atlas' && t.status !== 'done' && t.key.startsWith('plan-next:')).map((t) => t.client).filter(Boolean),
    lateTask: late ? { agent: late.agent, title: late.title } : null,
    failedKind: fails[0]?.kind ?? null,
    moneyWaiting: canSeeMoney(user) ? decisions.filter((d) => d.pile === 'Money').length : 0,
  };
  return { agent, date, questions: dailyQuestions(agent, date, facts) };
}

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
import { ACTIVITY, AF } from '../activity.js';
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
  { name: 'agent_todo', description: "The agents' own to-do lists in HQ (open tasks with deadlines).", input_schema: { type: 'object', properties: { agent: { type: 'string' } }, additionalProperties: false } },
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
      const rows = await needAt(deps.at).list(ACTIVITY, agentArg ? `AND({Agent}='${agentArg}',IS_AFTER({When},DATEADD(NOW(),-${days},'days')))` : `IS_AFTER({When},DATEADD(NOW(),-${days},'days'))`, [AF.event, AF.when, AF.agent, AF.type], 60, { sortField: AF.when, sortDesc: true });
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
      const t = (await agentTasks(db, agentArg ?? undefined)).filter((x) => canSeeMoney(user) || !OWNER_ONLY.includes(x.agent));
      return { source: 'HQ agent to-do lists', data: t.map((x) => ({ agent: x.agent, title: x.title, due: x.due, client: x.client, notes: x.notes })), note: `${t.length} open` };
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
  return (await db.query(`SELECT id, user_id, agent, asked_by, parent_id, title FROM hq_chat_threads WHERE id=$1`, [id])).rows[0] ?? null;
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
export async function chatTurn(deps: ChatDeps, t: TurnInput): Promise<{ threadId: number; question: SavedMessage; reply: SavedMessage }> {
  const { db, cfg, user } = deps;
  const model = deps.model ?? defaultModel(cfg);
  if (!canTalkTo(user, t.agent)) throw Object.assign(new Error(`${t.agent} is owner-only`), { status: 403 });
  const asked = Boolean(t.askedBy);
  let threadId = t.threadId;
  if (threadId) {
    const th = await loadThread(db, threadId);
    if (!th || th.agent !== t.agent || (user.role !== 'owner' && th.user_id !== user.id)) throw Object.assign(new Error('thread not found'), { status: 404 });
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
  return { threadId, question, reply };
}

export async function listThreads(db: Db, user: HqUser, agent?: AgentName) {
  const r = await db.query(
    `SELECT t.id, t.agent, t.asked_by, t.parent_id, t.title, t.updated_at, (SELECT count(*)::int FROM hq_chat_messages m WHERE m.thread_id=t.id) AS messages
     FROM hq_chat_threads t WHERE ($1::text IS NULL OR t.agent=$1) AND ($2 OR t.user_id=$3) ORDER BY t.updated_at DESC LIMIT 50`, [agent ?? null, user.role === 'owner', user.id]);
  return r.rows.filter((x) => canTalkTo(user, x.agent)).map((x) => ({ id: Number(x.id), agent: x.agent, askedBy: x.asked_by, parentId: x.parent_id ? Number(x.parent_id) : null, title: x.title, updated: new Date(x.updated_at).toISOString(), messages: x.messages }));
}

export async function readThread(db: Db, user: HqUser, id: number) {
  const th = await loadThread(db, id);
  if (!th || (user.role !== 'owner' && th.user_id !== user.id) || !canTalkTo(user, th.agent)) return null;
  const msgs = (await db.query(`SELECT id, role, author, text, sources, tools, created_at FROM hq_chat_messages WHERE thread_id=$1 ORDER BY id`, [id])).rows;
  const children = (await db.query(`SELECT id, agent, title FROM hq_chat_threads WHERE parent_id=$1 ORDER BY id`, [id])).rows;
  return {
    id: Number(th.id), agent: th.agent, askedBy: th.asked_by, parentId: th.parent_id ? Number(th.parent_id) : null, title: th.title,
    messages: msgs.map((m) => ({ id: Number(m.id), role: m.role, author: m.author, text: m.text, sources: m.sources ?? [], tools: m.tools ?? [], created: new Date(m.created_at).toISOString() })),
    children: children.map((c) => ({ id: Number(c.id), agent: c.agent, title: c.title })),
  };
}

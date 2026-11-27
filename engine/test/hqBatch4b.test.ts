// HQ Batch 4b (Alex's walkthrough, 2026-11-27): the Team board ("what everyone is working on"),
// chat like Slack (several chats per agent, open the last one, archive / restore, old history
// migrated), suggested questions that change daily, and the "… is looking it up" bug (the wrong
// agent showed). Never calls a real service: Airtable and the model are fakes.
import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { AddressInfo } from 'node:net';
import { createPool, migrate, type Db } from '../src/db/pool.js';
import { loadConfig, type Config } from '../src/config.js';
import { createServer } from '../src/http.js';
import { upsertUser } from '../src/hq/auth.js';
import { upsertAgentTask, type AgentTask } from '../src/hq/agentTasks.js';
import { teamBoard, taskMatches, type BoardRun } from '../src/hq/team.js';
import { QUESTION_POOLS, dailyQuestions, liveQuestions, type ChatModel } from '../src/hq/chat.js';
import { AGENT_NAMES, type AgentName } from '../src/hq/agents.js';
import { DECISIONS, DF } from '../src/decisions/fields.js';
import { _resetClientCache } from '../src/hq/tasks.js';

const url = process.env.TEST_DATABASE_URL;
const skip = !url ? 'TEST_DATABASE_URL not set' : false;
const PW = 'correct horse battery staple';
const JOSH_PW = 'josh long password 1';
let db: Db;
let server: http.Server;
let port = 0;
let webDir: string;

let tables: Record<string, Record<string, Record<string, unknown>>>;
let writes: { table: string; id: string }[];
const at = {
  async list(table: string) { return Object.entries(tables[table] ?? {}).map(([id, fields]) => ({ id, fields: { ...fields }, createdTime: String(fields._created ?? '2026-11-25T10:00:00.000Z') })); },
  async get(table: string, id: string) { const f = tables[table]?.[id]; return f ? { id, fields: { ...f } } : null; },
  async create(table: string) { writes.push({ table, id: 'new' }); return 'recNEW00000000001'; },
  async update(table: string, id: string) { writes.push({ table, id }); },
};
let asked: string[];
const model: ChatModel = async (_s, varying, messages) => {
  const last = messages[messages.length - 1];
  asked.push(typeof last.content === 'string' ? last.content : '');
  return { content: [{ type: 'text', text: `Answer ${asked.length}. Sources: none` }], stop_reason: 'end_turn' };
};

function cfg(over: Partial<Config> = {}): Config {
  return { ...loadConfig({ ENGINE_SECRET: 'x'.repeat(40), DATABASE_URL: url ?? 'postgres://x', HQ_SESSION_SECRET: 's'.repeat(40), HQ_HOST: 'hq.test.local' } as NodeJS.ProcessEnv), airtableApiKey: undefined, anthropicApiKey: undefined, ...over };
}
function call(method: string, p: string, opts: { body?: unknown; cookie?: string } = {}): Promise<{ status: number; body: any }> {
  return new Promise((resolve, reject) => {
    const host = `127.0.0.1:${port}`;
    const data = opts.body === undefined ? undefined : JSON.stringify(opts.body);
    const headers: Record<string, string> = { host };
    if (data !== undefined) { headers['content-type'] = 'application/json'; headers.origin = `https://${host}`; }
    if (opts.cookie) headers.cookie = opts.cookie;
    const req = http.request({ host: '127.0.0.1', port, method, path: p, headers }, (res) => {
      const chunks: Buffer[] = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => { let body: any = null; try { body = JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { /* not json */ } resolve({ status: res.statusCode ?? 0, body }); });
    });
    req.on('error', reject);
    if (data !== undefined) req.write(data);
    req.end();
  });
}
async function login(email = 'alex@dulcy.io', password = PW) {
  const r = await new Promise<http.IncomingMessage>((resolve, reject) => {
    const body = JSON.stringify({ email, password });
    const req = http.request({ host: '127.0.0.1', port, method: 'POST', path: '/hq/api/auth/login', headers: { host: `127.0.0.1:${port}`, 'content-type': 'application/json', origin: `https://127.0.0.1:${port}` } }, (res) => { res.resume(); resolve(res); });
    req.on('error', reject); req.write(body); req.end();
  });
  return ([] as string[]).concat(r.headers['set-cookie'] ?? []).map((c) => c.split(';')[0]).find((c) => c.startsWith('__Host-hq_session=')) ?? '';
}

before(async () => {
  webDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hqb4b-'));
  fs.writeFileSync(path.join(webDir, 'index.html'), '<!doctype html><title>Dulcy HQ</title>');
  if (skip) return;
  db = createPool(url!); await migrate(db);
  server = createServer(db, cfg(), { at: at as any, chatModel: model, webDir });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', () => r()));
  port = (server.address() as AddressInfo).port;
});
after(async () => { if (!skip) { server.close(); await db.end(); } fs.rmSync(webDir, { recursive: true, force: true }); });
beforeEach(async () => {
  tables = {}; writes = []; asked = []; _resetClientCache();
  if (skip) return;
  await db.query('TRUNCATE hq_users, hq_sessions, hq_login_attempts, hq_user_events, hq_chat_threads, hq_chat_messages, hq_agent_tasks, hq_asks, hq_needs_quiet, hq_reports, jobs, steps, receipts, events RESTART IDENTITY CASCADE');
  await upsertUser(db, 'Alex@dulcy.io', 'owner', PW, 'Alex');
  await upsertUser(db, 'josh@dulcy.io', 'member', JOSH_PW, 'Josh');
});

const NOW = new Date('2026-11-26T15:00:00.000Z'); // Thu Nov 26, 10:00 New York
const ago = (h: number) => new Date(NOW.getTime() - h * 3_600_000).toISOString();
const task = (over: Partial<AgentTask> = {}): AgentTask => ({
  id: 1, key: 'k', agent: 'Atlas', title: 'A task', due: null, status: 'in_progress', client: '', note: '', notes: '', link: null, priority: 'normal',
  created: ago(100), updated: ago(1), done: null, jobKind: null, waitingUntil: null, decision: null, requeues: 0, overdue: false, stalled: false, daysLate: 0, daysQuiet: 0, ...over,
});

// ---------- Team board ----------
test('Team board (pure): what each agent is on now, its next deadline, filters, deadlines and recent activity', () => {
  const tasks = [
    task({ id: 1, agent: 'Atlas', title: 'New campaign for GMG', client: 'GMG', status: 'in_progress', updated: ago(2), due: '2026-11-28', note: 'Sample running' }),
    task({ id: 2, agent: 'Atlas', title: 'Plan next campaign for TW', client: 'Twenty West', status: 'open', due: '2026-11-25', overdue: true, daysLate: 1, updated: ago(30) }),
    task({ id: 3, agent: 'Atlas', title: 'Older in progress', status: 'in_progress', updated: ago(20), created: ago(20) }),
    task({ id: 4, agent: 'Riley', title: 'Bounce check: MJJ', client: 'MJJ', status: 'waiting_alex', stalled: true, daysQuiet: 3, updated: ago(80) }),
    task({ id: 5, agent: 'Riley', title: 'Rest a@x', status: 'done', done: ago(5), note: 'Recovered', updated: ago(5) }),
    task({ id: 6, agent: 'Echo', title: 'Reply rules', status: 'open', due: null, updated: ago(200), created: ago(200) }),
    task({ id: 7, agent: 'Ledger', title: 'Reconcile November', status: 'in_progress', due: '2026-11-26' }),
  ];
  const runs: BoardRun[] = [
    { kind: 'atlas.tasks', status: 'succeeded', at: ago(1), message: '' },
    { kind: 'atlas.tasks', status: 'succeeded', at: ago(3), message: '' },
    { kind: 'riley.watch', status: 'failed', at: ago(4), message: 'n8n said 500' },
    { kind: 'ledger.check', status: 'succeeded', at: ago(1), message: '' },
  ];
  const b = teamBoard(tasks, runs, {}, NOW);
  const atlas = b.agents.find((a) => a.agent === 'Atlas')!;
  assert.deepEqual([atlas.current?.id, atlas.next?.id, atlas.open, atlas.late, atlas.lastRun?.ok], [1, 2, 3, 1, true], 'on now = the in-progress task moved last; next = soonest due');
  const riley = b.agents.find((a) => a.agent === 'Riley')!;
  assert.deepEqual([riley.current?.id, riley.waitingAlex, riley.stuck, riley.lastRun?.ok], [4, 1, 1, false]);
  assert.equal(b.agents.find((a) => a.agent === 'Scout')!.current, null);
  assert.deepEqual(b.tasks.map((t) => t.id), [7, 1, 3, 4, 2, 6, 5], 'board order: in progress, waiting on you, not started, done; late, then soonest due, then no date');
  assert.deepEqual(b.deadlines.map((t) => t.id), [2, 7, 1], 'late first, then the soonest');
  assert.deepEqual(b.clients, ['GMG', 'MJJ', 'Twenty West']);
  assert.ok(b.activity.some((e) => e.kind === 'task_done' && e.text.includes('Rest a@x')));
  assert.ok(b.activity.some((e) => e.kind === 'run_failed' && e.agent === 'Riley' && e.text.includes('n8n said 500')));
  assert.deepEqual(b.activity.filter((e) => e.kind === 'runs_ok' && e.agent === 'Atlas').map((e) => e.text), ['2 runs went fine (atlas.tasks)'], 'fine runs: one line per agent');
  assert.ok(!b.activity.some((e) => e.taskId === 6), 'nothing older than 3 days');
  // Filters.
  assert.deepEqual(teamBoard(tasks, runs, { agent: 'Atlas' }, NOW).tasks.map((t) => t.id), [1, 3, 2]);
  assert.deepEqual(teamBoard(tasks, runs, { agent: 'Atlas' }, NOW).agents.map((a) => a.agent), ['Atlas']);
  assert.deepEqual(teamBoard(tasks, runs, { client: 'gmg' }, NOW).tasks.map((t) => t.id), [1]);
  assert.ok(teamBoard(tasks, runs, { client: 'GMG' }, NOW).activity.every((e) => e.taskId === 1), 'a client filter shows only its tasks');
  assert.deepEqual(teamBoard(tasks, runs, { status: 'late' }, NOW).tasks.map((t) => t.id), [2]);
  assert.deepEqual(teamBoard(tasks, runs, { status: 'stuck' }, NOW).tasks.map((t) => t.id), [4]);
  assert.deepEqual(teamBoard(tasks, runs, { status: 'done' }, NOW).tasks.map((t) => t.id), [5]);
  assert.deepEqual(teamBoard(tasks, runs, { due: 'today' }, NOW).tasks.map((t) => t.id), [7]);
  assert.deepEqual(teamBoard(tasks, runs, { due: 'week' }, NOW).tasks.map((t) => t.id), [7, 1, 2]);
  assert.deepEqual(teamBoard(tasks, runs, { due: 'none' }, NOW).tasks.map((t) => t.id), [3, 4, 6, 5]);
  assert.equal(taskMatches(tasks[0], { status: 'in_progress', due: 'week', agent: 'Atlas', client: 'GMG' }, '2026-11-26'), true);
  // A member's board: the caller passes only the agents they may see.
  const visible = AGENT_NAMES.filter((a) => a !== 'Ledger' && a !== 'Sienna');
  const m = teamBoard(tasks, runs, {}, NOW, visible);
  assert.ok(!m.agents.some((a) => a.agent === 'Ledger') && !m.tasks.some((t) => t.agent === 'Ledger') && !m.activity.some((e) => e.agent === 'Ledger'));
});

test('Team board API: owner sees every agent; a member never Ledger or Sienna; bad filters are refused', { skip }, async () => {
  await upsertAgentTask(db, { agent: 'Atlas', key: 'a', title: 'New campaign for GMG', client: 'GMG', status: 'in_progress', note: 'Sample', due: '2026-12-01' });
  await upsertAgentTask(db, { agent: 'Ledger', key: 'l', title: 'Reconcile November', status: 'in_progress', note: 'Xero' });
  await db.query(`INSERT INTO jobs (kind, record_id, status) VALUES ('ledger.check','x','failed'), ('atlas.tasks','y','succeeded')`);
  const cookie = await login();
  const r = await call('GET', '/hq/api/team/work', { cookie });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.deepEqual(r.body.agents.map((a: any) => a.agent), [...AGENT_NAMES]);
  assert.deepEqual(r.body.tasks.map((t: any) => t.title).sort(), ['New campaign for GMG', 'Reconcile November']);
  assert.equal(r.body.agents.find((a: any) => a.agent === 'Atlas').current.title, 'New campaign for GMG');
  assert.deepEqual((await call('GET', '/hq/api/team/work?agent=atlas&client=GMG&status=in_progress&due=any', { cookie })).body.tasks.map((t: any) => t.title), ['New campaign for GMG']);
  assert.equal((await call('GET', '/hq/api/team/work?status=someday', { cookie })).status, 400);
  assert.equal((await call('GET', '/hq/api/team/work?agent=Nobody', { cookie })).status, 404);
  const j = await login('josh@dulcy.io', JOSH_PW);
  const m = await call('GET', '/hq/api/team/work', { cookie: j });
  assert.equal(m.status, 200);
  assert.ok(!JSON.stringify(m.body).match(/Ledger|Sienna|ledger\.check|Reconcile/), 'nothing owner-only in a member answer');
  assert.equal((await call('GET', '/hq/api/team/work?agent=Ledger', { cookie: j })).status, 404);
  assert.equal((await call('GET', '/hq/api/team/work')).status, 401, 'needs a session');
});

// ---------- Chat like Slack ----------
test('chat threads: several chats per agent, opens the one you had open last, keep asking in it, archive and restore', { skip }, async () => {
  const cookie = await login();
  assert.deepEqual((await call('GET', '/hq/api/chat/latest?agent=Ada', { cookie })).body, { agent: 'Ada', threadId: null }, 'no chat yet: start a new one');
  const a = await call('POST', '/hq/api/chat', { body: { agent: 'Ada', message: 'First chat' }, cookie });
  assert.equal(a.status, 200);
  assert.equal(a.body.agent, 'Ada', 'the answer says whose chat it is');
  const b = await call('POST', '/hq/api/chat', { body: { agent: 'Ada', message: 'Second chat' }, cookie });
  assert.notEqual(a.body.threadId, b.body.threadId, '"New chat" = no threadId = a new chat');
  assert.equal((await call('GET', '/hq/api/chat/latest?agent=Ada', { cookie })).body.threadId, b.body.threadId);
  // Opening the first chat makes it the one that opens next time; asking again stays in it.
  assert.equal((await call('GET', `/hq/api/chat/threads/${a.body.threadId}`, { cookie })).status, 200);
  assert.equal((await call('GET', '/hq/api/chat/latest?agent=Ada', { cookie })).body.threadId, a.body.threadId);
  const again = await call('POST', '/hq/api/chat', { body: { agent: 'Ada', message: 'Follow-up', threadId: a.body.threadId }, cookie });
  assert.equal(again.body.threadId, a.body.threadId);
  assert.deepEqual((await call('GET', `/hq/api/chat/threads/${a.body.threadId}`, { cookie })).body.thread.messages.map((m: any) => m.text), ['First chat', 'Answer 1. Sources: none', 'Follow-up', 'Answer 3. Sources: none']);
  let list = (await call('GET', '/hq/api/chat/threads?agent=Ada', { cookie })).body.threads;
  assert.deepEqual(list.map((t: any) => [t.title, t.archived, t.mine]), [['First chat', false, true], ['Second chat', false, true]]);
  // Archive: hidden, listed under archived, restorable; the next chat opens instead.
  assert.equal((await call('POST', `/hq/api/chat/threads/${a.body.threadId}/archive`, { body: { archived: true }, cookie })).status, 200);
  list = (await call('GET', '/hq/api/chat/threads?agent=Ada', { cookie })).body.threads;
  assert.deepEqual(list.map((t: any) => t.title), ['Second chat']);
  assert.deepEqual((await call('GET', '/hq/api/chat/threads?agent=Ada&archived=1', { cookie })).body.threads.map((t: any) => [t.title, t.archived]), [['First chat', true]]);
  assert.equal((await call('GET', '/hq/api/chat/latest?agent=Ada', { cookie })).body.threadId, b.body.threadId);
  assert.equal((await call('GET', `/hq/api/chat/threads/${a.body.threadId}`, { cookie })).body.thread.archived, true, 'an archived chat can still be read');
  assert.equal((await call('POST', `/hq/api/chat/threads/${a.body.threadId}/archive`, { body: { archived: false }, cookie })).status, 200);
  assert.equal((await call('GET', '/hq/api/chat/latest?agent=Ada', { cookie })).body.threadId, a.body.threadId, 'restored = back, and opens next');
  // Asking in an archived chat brings it back.
  await call('POST', `/hq/api/chat/threads/${b.body.threadId}/archive`, { body: {}, cookie });
  await call('POST', '/hq/api/chat', { body: { agent: 'Ada', message: 'Back again', threadId: b.body.threadId }, cookie });
  assert.equal((await call('GET', '/hq/api/chat/threads?agent=Ada', { cookie })).body.threads.length, 2);
  // Only your own chats: a member cannot archive the owner's chat, nor read it.
  const j = await login('josh@dulcy.io', JOSH_PW);
  assert.equal((await call('POST', `/hq/api/chat/threads/${a.body.threadId}/archive`, { body: { archived: true }, cookie: j })).status, 404);
  assert.equal((await call('GET', `/hq/api/chat/threads/${a.body.threadId}`, { cookie: j })).status, 404);
  assert.equal((await call('GET', '/hq/api/chat/latest?agent=Ada', { cookie: j })).body.threadId, null, "Josh's latest is his own");
  assert.equal((await call('GET', '/hq/api/chat/latest?agent=Ledger', { cookie: j })).status, 404, 'owner-only agents stay hidden');
  assert.equal((await call('POST', `/hq/api/chat/threads/${a.body.threadId}/archive`, { body: {} })).status, 401);
});

test('chat migration: history saved before Batch 4b becomes chats; the last one used per agent opens; running it again changes nothing', { skip }, async () => {
  const owner = (await db.query(`SELECT id FROM hq_users WHERE email='alex@dulcy.io'`)).rows[0].id;
  // Old rows: no opened_at (as before this batch), different ages, two agents.
  const ins = async (agent: string, title: string, daysAgo: number) => Number((await db.query(
    `INSERT INTO hq_chat_threads (user_id, agent, asked_by, title, created_at, updated_at) VALUES ($1,$2,'user',$3, now() - ($4::int * interval '1 day'), now() - ($4::int * interval '1 day')) RETURNING id`, [owner, agent, title, daysAgo])).rows[0].id);
  const oldAda = await ins('Ada', 'Old Ada chat', 5);
  const newAda = await ins('Ada', 'Newer Ada chat', 2);
  const atlas = await ins('Atlas', 'Atlas chat', 9);
  await db.query(`INSERT INTO hq_chat_messages (thread_id, role, author, text) VALUES ($1,'user','Alex','hi'), ($1,'assistant','Ada','hello'), ($2,'user','Alex','x'), ($3,'user','Alex','y')`, [oldAda, newAda, atlas]);
  await db.query(`UPDATE hq_chat_threads SET opened_at = NULL, archived_at = NULL`);
  await migrate(db);
  await migrate(db);
  const rows = (await db.query(`SELECT id, opened_at = updated_at AS same, archived_at FROM hq_chat_threads ORDER BY id`)).rows;
  assert.deepEqual(rows.map((r) => [Number(r.id), r.same, r.archived_at]), [[oldAda, true, null], [newAda, true, null], [atlas, true, null]], 'opened = the last message time, nothing archived');
  assert.equal((await db.query(`SELECT count(*)::int AS n FROM hq_chat_messages`)).rows[0].n, 4, 'no message lost');
  const cookie = await login();
  assert.equal((await call('GET', '/hq/api/chat/latest?agent=Ada', { cookie })).body.threadId, newAda);
  assert.equal((await call('GET', '/hq/api/chat/latest?agent=Atlas', { cookie })).body.threadId, atlas);
  assert.deepEqual((await call('GET', '/hq/api/chat/threads?agent=Ada', { cookie })).body.threads.map((t: any) => [t.id, t.messages]), [[newAda, 1], [oldAda, 2]]);
});

// ---------- The "… is looking it up" bug ----------
test('bug: "looking it up" shows the agent that was asked, only in its own chat (asked Ada, switched to Riley)', { skip }, async () => {
  // The screen logic (hq/web/src/pages/chatState.ts) is pure and import-free: load it as it ships.
  const s = await import(new URL('../../../hq/web/src/pages/chatState.ts', import.meta.url).href);
  const pending = { agent: 'Ada', threadId: 7, text: 'What needs me first today?' };
  assert.equal(s.typingIn({ agent: 'Ada', threadId: 7 }, pending), 'Ada');
  assert.equal(s.typingIn({ agent: 'Riley', threadId: null }, pending), null, 'switching to Riley mid-answer: Riley is not "looking it up"');
  assert.equal(s.typingIn({ agent: 'Riley', threadId: 7 }, pending), null);
  assert.equal(s.typingIn({ agent: 'Ada', threadId: 8 }, pending), null, "another of Ada's chats: not there either");
  assert.equal(s.typingIn({ agent: 'Ada', threadId: 7 }, null), null);
  // A new chat: the answer moves the view onto the new chat only if it is still on screen.
  const fresh = { agent: 'Ada', threadId: null, text: 'hi' };
  assert.equal(s.typingIn({ agent: 'Ada', threadId: null }, fresh), 'Ada');
  assert.deepEqual(s.afterReply({ agent: 'Ada', threadId: null }, fresh, 12), { agent: 'Ada', threadId: 12 });
  assert.deepEqual(s.afterReply({ agent: 'Riley', threadId: 3 }, fresh, 12), { agent: 'Riley', threadId: 3 }, 'the answer never lands in Riley\'s view');
  // Links: chat/<agent>[/<id>|/new][?ask=…] (other screens link "Ask Atlas" → "How is <client>'s health?").
  const agents = ['Ada', 'Atlas', 'Riley'];
  assert.deepEqual(s.parseChatHash("#/chat/atlas?ask=How%20is%20GMG's%20health%3F", agents), { agent: 'Atlas', threadId: null, fresh: false, ask: "How is GMG's health?" });
  assert.deepEqual(s.parseChatHash('#/chat/Riley/42', agents), { agent: 'Riley', threadId: 42, fresh: false, ask: '' });
  assert.deepEqual(s.parseChatHash('#/chat/Ada/new', agents), { agent: 'Ada', threadId: null, fresh: true, ask: '' });
  assert.equal(s.parseChatHash('#/chat/Ledger', agents).agent, 'Ada', 'an agent the person may not see → Ada');
  assert.equal(s.chatHref('Atlas', { ask: "How is GMG's health?" }), "chat/Atlas?ask=How%20is%20GMG's%20health%3F");
  assert.deepEqual(s.parseChatHash(`#/${s.chatHref('Atlas', { ask: 'A & B?' })}`, agents).ask, 'A & B?');

  // The server side of the same bug: a chat belongs to one agent, and the answer names it.
  const cookie = await login();
  const r = await call('POST', '/hq/api/chat', { body: { agent: 'Ada', message: 'What needs me first today?' }, cookie });
  assert.equal(r.body.agent, 'Ada');
  const wrong = await call('POST', '/hq/api/chat', { body: { agent: 'Riley', message: 'Next question', threadId: r.body.threadId }, cookie });
  assert.equal(wrong.status, 409, "Riley never answers inside Ada's chat");
  assert.match(wrong.body.error, /with Ada/);
  assert.equal((await call('GET', `/hq/api/chat/threads/${r.body.threadId}`, { cookie })).body.thread.messages.length, 2, 'nothing was added to Ada\'s chat');
});

// ---------- Suggested questions, changing daily ----------
test("suggested questions: Alex's examples are in the pools; the same all day, a new mix tomorrow; every question comes up; live ones first", () => {
  const must: [AgentName, string][] = [
    ['Ada', 'Which agent had problems this week?'], ['Ada', 'What needs me first today?'],
    ['Scribe', 'Which offers are getting the most success?'], ['Scribe', 'Which industries does Dulcy target best?'],
    ['Scout', 'Hyper-personalised vs regular lead lists: which works better?'],
    ['Echo', 'How did replies come in this week?'], ['Echo', 'What would tighten interested → booked?'],
  ];
  for (const [a, q] of must) assert.ok(QUESTION_POOLS[a].includes(q), `${a}: ${q}`);
  for (const a of ['Atlas', 'Riley', 'Cole', 'Ledger', 'Sienna'] as AgentName[]) assert.ok(QUESTION_POOLS[a].length >= 5, `${a} has a pool`);
  const days = Array.from({ length: 14 }, (_, i) => new Date(Date.UTC(2026, 10, 20 + i, 12)).toISOString().slice(0, 10));
  for (const agent of AGENT_NAMES) {
    const today = dailyQuestions(agent, '2026-11-27');
    assert.equal(today.length, 4);
    assert.deepEqual(dailyQuestions(agent, '2026-11-27'), today, `${agent}: stable for the day`);
    assert.equal(new Set(today).size, 4, 'no repeats');
    assert.notDeepEqual(dailyQuestions(agent, '2026-11-28'), today, `${agent}: changes tomorrow`);
    const seen = new Set(days.flatMap((d) => dailyQuestions(agent, d)));
    assert.equal(seen.size, QUESTION_POOLS[agent].length, `${agent}: every pool question comes up within two weeks`);
  }
  // Live data: the client with the most replies waiting goes first (Echo, Atlas), at most one.
  const facts = { topReplies: { client: 'Twenty West', n: 8 }, nextCampaigns: ['GMG'], lateTask: { agent: 'Riley', title: 'Bounce check: MJJ' }, failedKind: 'riley.watch', moneyWaiting: 2 };
  assert.equal(dailyQuestions('Echo', '2026-11-27', facts)[0], 'Twenty West has 8 replies waiting: which should go first?');
  assert.equal(dailyQuestions('Atlas', '2026-11-27', facts)[0], "How is Twenty West's health?");
  assert.equal(dailyQuestions('Ada', '2026-11-27', facts)[0], 'Why is Riley late on "Bounce check: MJJ"?');
  assert.equal(dailyQuestions('Riley', '2026-11-27', facts)[0], 'Why did riley.watch fail, and is it fixed?');
  assert.equal(dailyQuestions('Ledger', '2026-11-27', facts)[0], 'What do you recommend on the 2 money decisions waiting?');
  assert.equal(dailyQuestions('Echo', '2026-11-27', facts).length, 4);
  assert.deepEqual(liveQuestions('Scribe', {}), []);
});

test('suggestions API: per agent, from live data (the client with the most replies waiting); Ledger and Sienna owner-only', { skip }, async () => {
  const reply = (client: string) => ({ [DF.title]: `Reply for ${client}`, [DF.agent]: 'Echo', [DF.client]: client, [DF.status]: 'New', [DF.action]: 'Approve Reply', [DF.emailsRecord]: 'recEMAIL000000001' });
  tables[DECISIONS] = { recR00000000000001: reply('GMG'), recR00000000000002: reply('Twenty West'), recR00000000000003: reply('Twenty West') };
  const cookie = await login();
  const e = await call('GET', '/hq/api/chat/suggestions?agent=echo', { cookie });
  assert.equal(e.status, 200);
  assert.equal(e.body.agent, 'Echo');
  assert.match(e.body.date, /^\d{4}-\d{2}-\d{2}$/);
  assert.equal(e.body.questions[0], 'Twenty West has 2 replies waiting: which should go first?');
  assert.equal(e.body.questions.length, 4);
  assert.deepEqual((await call('GET', '/hq/api/chat/suggestions?agent=Echo', { cookie })).body.questions, e.body.questions, 'the same within the day');
  assert.equal((await call('GET', '/hq/api/chat/suggestions?agent=Ledger', { cookie })).status, 200);
  const j = await login('josh@dulcy.io', JOSH_PW);
  assert.equal((await call('GET', '/hq/api/chat/suggestions?agent=Ledger', { cookie: j })).status, 404);
  assert.equal((await call('GET', '/hq/api/chat/suggestions?agent=Sienna', { cookie: j })).status, 404);
  assert.equal((await call('GET', '/hq/api/chat/suggestions?agent=Scout', { cookie: j })).status, 200);
  assert.equal(writes.length, 0, 'reads only');
});

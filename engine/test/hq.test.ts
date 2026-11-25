// Dulcy HQ: login (password, rate limit, Google), session required on every API route, CSRF,
// decisions approve flow (the Daily Run writes, then the decisions loop runs the action),
// Eisenhower sorting, agent mapping, team check, reports, chat (tools, ask_agent), agent tasks.
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
import { upsertUser, hashPassword, verifyPassword, signValue, unsignValue } from '../src/hq/auth.js';
import { agentForJob, pileFor, jobPatternsFor, AGENT_NAMES } from '../src/hq/agents.js';
import { classify, sortTasks, TASKS, TF, _resetClientCache, type Task } from '../src/hq/tasks.js';
import { teamCheck } from '../src/hq/team.js';
import { saveReport, slackReports, slackToMarkdown, summarize } from '../src/hq/reports.js';
import { planNextTasks, generateAtlasTasks } from '../src/hq/generators.js';
import { CP } from '../src/agents/campaignPlan.js';
import { DECISIONS, DF } from '../src/decisions/fields.js';
import { EMAILS, RA } from '../src/agents/emailsFields.js';
import { decisionsTick } from '../src/decisions/loop.js';
import type { ChatModel } from '../src/hq/chat.js';

const url = process.env.TEST_DATABASE_URL;
const skip = !url ? 'TEST_DATABASE_URL not set' : false;
const HQ_HOST = 'hq.test.local';
const PW = 'correct horse battery staple';
let db: Db;
let server: http.Server;
let port = 0;
let webDir: string;

// ---------- fake Airtable (ignores formulas: the HQ code filters again in JS) ----------
let tables: Record<string, Record<string, Record<string, unknown>>>;
let writes: { table: string; id: string; fields: Record<string, unknown> }[];
const at = {
  async list(table: string) { return Object.entries(tables[table] ?? {}).map(([id, fields]) => ({ id, fields: { ...fields }, createdTime: String(fields._created ?? '2026-11-25T10:00:00.000Z') })); },
  async get(table: string, id: string) { const f = tables[table]?.[id]; return f ? { id, fields: { ...f } } : null; },
  async create(table: string, fields: Record<string, unknown>) { const id = `recNEW${String(Object.keys(tables[table] ?? {}).length).padStart(11, '0')}`; (tables[table] ??= {})[id] = { ...fields }; writes.push({ table, id, fields }); return id; },
  async update(table: string, id: string, fields: Record<string, unknown>) { Object.assign(((tables[table] ??= {})[id] ??= {}), fields); writes.push({ table, id, fields }); },
};
let modelCalls: { tools: string[]; messages: any[] }[];
let script: ((call: number, messages: any[]) => any)[];
const model: ChatModel = async (_stable, _varying, messages, tools) => {
  modelCalls.push({ tools: tools.map((t) => t.name), messages: JSON.parse(JSON.stringify(messages)) });
  const step = script.shift();
  return step ? step(modelCalls.length, messages) : { content: [{ type: 'text', text: 'Nothing more. Sources: none' }], stop_reason: 'end_turn' };
};

function cfg(over: Partial<Config> = {}): Config {
  return { ...loadConfig({ ENGINE_SECRET: 'x'.repeat(40), DATABASE_URL: url ?? 'postgres://x', HQ_SESSION_SECRET: 's'.repeat(40), HQ_HOST } as NodeJS.ProcessEnv), airtableApiKey: undefined, anthropicApiKey: undefined, ...over };
}

interface Res { status: number; headers: http.IncomingHttpHeaders; body: any; text: string }
function call(method: string, p: string, opts: { body?: unknown; cookie?: string; origin?: string | null; host?: string; contentType?: string } = {}): Promise<Res> {
  return new Promise((resolve, reject) => {
    const host = opts.host ?? `127.0.0.1:${port}`;
    const data = opts.body === undefined ? undefined : JSON.stringify(opts.body);
    const headers: Record<string, string> = { host };
    if (data !== undefined) headers['content-type'] = opts.contentType ?? 'application/json';
    if (opts.cookie) headers.cookie = opts.cookie;
    const origin = opts.origin === undefined ? (method === 'GET' ? null : `https://${host}`) : opts.origin;
    if (origin) headers.origin = origin;
    const req = http.request({ host: '127.0.0.1', port, method, path: p, headers }, (res) => {
      const chunks: Buffer[] = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => { const text = Buffer.concat(chunks).toString('utf8'); let body: any = null; try { body = JSON.parse(text); } catch { /* html */ } resolve({ status: res.statusCode ?? 0, headers: res.headers, body, text }); });
    });
    req.on('error', reject);
    if (data !== undefined) req.write(data);
    req.end();
  });
}
const sessionCookie = (r: Res) => ([] as string[]).concat(r.headers['set-cookie'] ?? []).map((c) => c.split(';')[0]).find((c) => c.startsWith('__Host-hq_session=') && c.length > '__Host-hq_session='.length) ?? '';
async function login(email = 'alex@dulcy.io', password = PW) {
  const r = await call('POST', '/hq/api/auth/login', { body: { email, password } });
  return { r, cookie: sessionCookie(r) };
}

before(async () => {
  webDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hqweb-'));
  fs.mkdirSync(path.join(webDir, 'assets'));
  fs.writeFileSync(path.join(webDir, 'index.html'), '<!doctype html><title>Dulcy HQ</title><div id="root"></div>');
  fs.writeFileSync(path.join(webDir, 'assets', 'app.js'), 'console.log(1)');
  if (skip) return;
  db = createPool(url!); await migrate(db);
  server = createServer(db, cfg(), { at: at as any, chatModel: model, webDir });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', () => r()));
  port = (server.address() as AddressInfo).port;
});
after(async () => { if (!skip) { server.close(); await db.end(); } fs.rmSync(webDir, { recursive: true, force: true }); });
beforeEach(async () => {
  tables = {}; writes = []; modelCalls = []; script = []; _resetClientCache();
  if (skip) return;
  await db.query('TRUNCATE hq_users, hq_sessions, hq_login_attempts, hq_reports, hq_chat_threads, hq_chat_messages, hq_agent_tasks, hq_task_checks, campaign_plans, jobs, steps, receipts, events RESTART IDENTITY CASCADE');
  await upsertUser(db, 'Alex@dulcy.io', 'owner', PW, 'Alex');
});

// ---------- auth ----------
test('passwords: scrypt hash, verify, wrong password, signed values', async () => {
  const h = await hashPassword('a long enough password');
  assert.match(h, /^scrypt\$16384\$8\$1\$/);
  assert.equal(await verifyPassword('a long enough password', h), true);
  assert.equal(await verifyPassword('wrong password here', h), false);
  assert.equal(await verifyPassword('anything', null), false);
  const v = signValue('k'.repeat(32), 'abc');
  assert.equal(unsignValue('k'.repeat(32), v), 'abc');
  assert.equal(unsignValue('k'.repeat(32), v.replace(/.$/, (c) => (c === 'A' ? 'B' : 'A'))), null);
  assert.equal(unsignValue('other'.repeat(8), v), null);
});

test('every API route needs a session; login works, a bad password does not; logout ends it', { skip }, async () => {
  for (const [m, p] of [['GET', '/hq/api/me'], ['GET', '/hq/api/today'], ['GET', '/hq/api/decisions'], ['GET', '/hq/api/tasks'], ['GET', '/hq/api/agents'], ['GET', '/hq/api/agents/Ada'], ['GET', '/hq/api/reports'], ['GET', '/hq/api/chat/threads'], ['POST', '/hq/api/chat'], ['POST', '/hq/api/decisions/recAAAAAAAAAAAAAA1'], ['POST', '/hq/api/tasks']] as const) {
    const r = await call(m, p, m === 'POST' ? { body: {} } : {});
    assert.equal(r.status, 401, `${m} ${p} without a session`);
  }
  const bad = await login('alex@dulcy.io', 'not the password');
  assert.equal(bad.r.status, 401);
  assert.equal(bad.cookie, '');
  const unknown = await login('nobody@dulcy.io', PW);
  assert.equal(unknown.r.status, 401);
  assert.equal(unknown.r.body.error, bad.r.body.error, 'same answer for an unknown email');

  const ok = await login('ALEX@dulcy.io');
  assert.equal(ok.r.status, 200);
  assert.deepEqual(ok.r.body.user, { email: 'alex@dulcy.io', name: 'Alex', role: 'owner' });
  const set = String(([] as string[]).concat(ok.r.headers['set-cookie'] ?? [])[0]);
  for (const attr of ['HttpOnly', 'Secure', 'SameSite=Strict', 'Path=/']) assert.ok(set.includes(attr), attr);
  assert.ok(!JSON.stringify(ok.r.body).includes('scrypt'), 'no hash to the browser');
  const me = await call('GET', '/hq/api/me', { cookie: ok.cookie });
  assert.equal(me.status, 200);
  assert.equal(me.body.user.role, 'owner');
  // A tampered cookie is refused.
  assert.equal((await call('GET', '/hq/api/me', { cookie: ok.cookie.slice(0, -2) + 'xx' })).status, 401);
  const out = await call('POST', '/hq/api/auth/logout', { body: {}, cookie: ok.cookie });
  assert.equal(out.status, 200);
  assert.equal((await call('GET', '/hq/api/me', { cookie: ok.cookie })).status, 401, 'the old cookie is dead after logout');
  // A new password signs everyone out.
  const again = await login();
  await upsertUser(db, 'alex@dulcy.io', 'owner', 'another long password');
  assert.equal((await call('GET', '/hq/api/me', { cookie: again.cookie })).status, 401);
});

test('login rate limit: 5 failed tries per email lock it for 15 minutes (even the right password)', { skip }, async () => {
  for (let i = 0; i < 5; i++) assert.equal((await login('alex@dulcy.io', `wrong ${i} password`)).r.status, 401);
  const r = await login();
  assert.equal(r.r.status, 429);
  assert.match(r.r.body.error, /Too many tries/);
  await db.query(`UPDATE hq_login_attempts SET created_at = now() - interval '16 minutes'`);
  assert.equal((await login()).r.status, 200);
});

test('CSRF: writes need a same-origin Origin and JSON', { skip }, async () => {
  const { cookie } = await login();
  assert.equal((await call('POST', '/hq/api/tasks', { body: { name: 'x' }, cookie, origin: null })).status, 403);
  assert.equal((await call('POST', '/hq/api/tasks', { body: { name: 'x' }, cookie, origin: 'https://evil.example' })).status, 403);
  assert.equal((await call('POST', '/hq/api/auth/login', { body: { email: 'alex@dulcy.io', password: PW }, origin: 'https://evil.example' })).status, 403);
  assert.equal((await call('POST', '/hq/api/tasks', { body: { name: 'x' }, cookie, contentType: 'text/plain' })).status, 415);
  const ok = await call('POST', '/hq/api/tasks', { body: { name: 'Call Jane back', due: '2026-11-26', priority: 'High' }, cookie });
  assert.equal(ok.status, 200);
  const created = writes.find((w) => w.table === TASKS)!;
  assert.equal(created.fields[TF.name], 'Call Jane back');
  assert.equal(created.fields[TF.status], 'Not Started');
  assert.equal(created.fields[TF.priority], 'High');
  assert.equal((await call('POST', '/hq/api/tasks', { body: { name: '' }, cookie })).status, 400);
});

test('HQ off without HQ_SESSION_SECRET; HQ host serves the app at / and never the engine API', { skip }, async () => {
  const off = createServer(db, cfg({ hqSessionSecret: undefined }), { at: at as any, webDir });
  await new Promise<void>((r) => off.listen(0, '127.0.0.1', () => r()));
  const p2 = (off.address() as AddressInfo).port;
  const r = await new Promise<number>((resolve) => http.get({ host: '127.0.0.1', port: p2, path: '/hq/api/me' }, (res) => { res.resume(); resolve(res.statusCode ?? 0); }));
  assert.equal(r, 503);
  off.close();

  const home = await call('GET', '/', { host: HQ_HOST });
  assert.equal(home.status, 200);
  assert.match(home.text, /Dulcy HQ/);
  assert.match(String(home.headers['content-security-policy']), /frame-ancestors 'none'/);
  assert.equal((await call('GET', '/hq/assets/app.js', { host: HQ_HOST })).status, 200);
  assert.equal((await call('GET', '/hq/assets/missing.js')).status, 404);
  assert.equal((await call('GET', '/hq/../../etc/passwd')).status !== 200 || !(await call('GET', '/hq/../../etc/passwd')).text.includes('root:'), true);
  const jobs = await call('GET', '/jobs/1', { host: HQ_HOST });
  assert.ok(!jobs.text.includes('missing signature'), 'the signed engine API is not on the HQ host');
  // The engine host still serves the signed API.
  assert.equal((await call('GET', '/jobs/1')).status, 401);
});

test('Google sign-in: only existing HQ users, state checked', { skip }, async () => {
  const fakeGoogle = async (_u: any, init: any) => {
    const code = new URLSearchParams(String(init.body)).get('code');
    const claims = { iss: 'https://accounts.google.com', aud: 'cid.apps.googleusercontent.com', exp: Math.floor(Date.now() / 1000) + 600, email_verified: true, email: code === 'alex' ? 'alex@dulcy.io' : 'stranger@gmail.com' };
    return new Response(JSON.stringify({ id_token: `x.${Buffer.from(JSON.stringify(claims)).toString('base64url')}.y` }), { status: 200 });
  };
  const g = createServer(db, cfg({ hqGoogleClientId: 'cid.apps.googleusercontent.com', hqGoogleClientSecret: 'shh' }), { at: at as any, webDir, fetchImpl: fakeGoogle as any });
  await new Promise<void>((r) => g.listen(0, '127.0.0.1', () => r()));
  const saved = port; port = (g.address() as AddressInfo).port;
  try {
    assert.equal((await call('GET', '/hq/api/auth/config')).body.google, true);
    const start = await call('GET', '/hq/api/auth/google/start');
    assert.equal(start.status, 302);
    const loc = new URL(String(start.headers.location));
    assert.equal(loc.searchParams.get('client_id'), 'cid.apps.googleusercontent.com');
    assert.equal(loc.searchParams.get('redirect_uri'), `https://${HQ_HOST}/hq/api/auth/google/callback`);
    assert.ok(!String(start.headers.location).includes('shh'), 'the client secret never goes to the browser');
    const state = loc.searchParams.get('state')!;
    const oauth = ([] as string[]).concat(start.headers['set-cookie'] ?? [])[0].split(';')[0];
    const wrongState = await call('GET', `/hq/api/auth/google/callback?code=alex&state=nope`, { cookie: oauth });
    assert.match(String(wrongState.headers.location), /#\/login\?error=/);
    const stranger = await call('GET', `/hq/api/auth/google/callback?code=other&state=${state}`, { cookie: oauth });
    assert.match(decodeURIComponent(String(stranger.headers.location)), /no HQ access/);
    const ok = await call('GET', `/hq/api/auth/google/callback?code=alex&state=${state}`, { cookie: oauth });
    assert.equal(ok.status, 302);
    const c = sessionCookie(ok);
    assert.ok(c, 'session cookie set');
    assert.equal((await call('GET', '/hq/api/me', { cookie: c })).body.user.email, 'alex@dulcy.io');
  } finally { port = saved; g.close(); }
});

// ---------- decisions ----------
const decision = (over: Record<string, unknown> = {}) => ({ [DF.title]: 'Reply to Jane at Acme', [DF.agent]: 'Sean', [DF.client]: 'Dulcy', [DF.status]: 'Waiting', [DF.issue]: 'Jane asked for times', [DF.checked]: 'Interested', [DF.fix]: 'Hi Jane,\n\nTue 2pm?', [DF.action]: 'Approve Reply', [DF.emailsRecord]: 'recEMAIL000000001', ...over });

test('decisions: piles, approve a reply (Emails first, then the decision), reject, refuse twice', { skip }, async () => {
  tables[DECISIONS] = {
    recREPLY000000001: decision(),
    recBOUNCE00000001: decision({ [DF.title]: 'Bounce 5.1% on X', [DF.agent]: 'Atlas', [DF.action]: 'Resume Campaign', [DF.emailsRecord]: '', [DF.status]: 'New', [DF.actionInput]: '{"campaignId":1}' }),
    recMONEY000000001: decision({ [DF.agent]: 'Ledger', [DF.action]: 'Approve Purchase', [DF.emailsRecord]: '' }),
    recFIX00000000001: decision({ [DF.agent]: 'Riley', [DF.action]: 'Apply Riley Fix', [DF.emailsRecord]: '' }),
    recCOLE0000000001: decision({ [DF.agent]: 'Cole', [DF.action]: 'None', [DF.emailsRecord]: '' }),
    recDONE0000000001: decision({ [DF.status]: 'Done' }),
  };
  tables[EMAILS] = { recEMAIL000000001: {} };
  const { cookie } = await login();
  const list = await call('GET', '/hq/api/decisions', { cookie });
  assert.equal(list.status, 200);
  assert.deepEqual(Object.fromEntries(Object.entries(list.body.piles).map(([k, v]) => [k, (v as any[]).map((x) => x.id)])), {
    Replies: ['recREPLY000000001'], Campaigns: ['recBOUNCE00000001'], Fixes: ['recFIX00000000001'], Money: ['recMONEY000000001'], Other: ['recCOLE0000000001'],
  });
  assert.equal(list.body.piles.Replies[0].isReply, true);

  const ok = await call('POST', '/hq/api/decisions/recREPLY000000001', { body: { verdict: 'approve' }, cookie });
  assert.equal(ok.status, 200);
  assert.equal(writes[0].table, EMAILS, 'the Emails button is pressed first');
  assert.deepEqual(writes[0].fields, { [RA.humanAction]: 'Approve Draft' });
  const d = tables[DECISIONS].recREPLY000000001;
  assert.equal(d[DF.status], 'Approved');
  assert.equal(d[DF.decidedBy], 'Alex');
  assert.ok(Math.abs(Date.parse(String(d[DF.decidedAt])) - Date.now()) < 60_000);
  assert.equal((await call('POST', '/hq/api/decisions/recREPLY000000001', { body: { verdict: 'reject' }, cookie })).status, 409, 'already decided');

  writes = [];
  const no = await call('POST', '/hq/api/decisions/recBOUNCE00000001', { body: { verdict: 'reject' }, cookie });
  assert.equal(no.status, 200);
  assert.deepEqual(writes.map((w) => w.table), [DECISIONS], 'no Emails write for a non-reply');
  assert.equal(tables[DECISIONS].recBOUNCE00000001[DF.status], 'Rejected');
  assert.equal((await call('POST', '/hq/api/decisions/recREPLY000000001', { body: { verdict: 'maybe' }, cookie })).status, 400);
  assert.equal((await call('POST', '/hq/api/decisions/recNOPE0000000001', { body: { verdict: 'approve' }, cookie })).status, 404);
});

test('reply cards: thread link + latest message from Details; Send edited writes Custom Reply; Skip', { skip }, async () => {
  const details = 'Thread: https://send.dulcy.io/inbox?reply_uuid=abc\nCampaign: X\n\nLatest message:\nCan you do Tuesday?\nThanks';
  tables[DECISIONS] = { recREPLY000000001: decision({ [DF.details]: details }), recREPLY000000002: decision({ [DF.emailsRecord]: 'recEMAIL000000002' }), recREPLY000000003: decision({ [DF.emailsRecord]: 'recEMAIL000000003' }) };
  tables[EMAILS] = { recEMAIL000000001: {}, recEMAIL000000002: {}, recEMAIL000000003: {} };
  const { cookie } = await login();
  const card = (await call('GET', '/hq/api/decisions', { cookie })).body.piles.Replies.find((c: any) => c.id === 'recREPLY000000001');
  assert.equal(card.threadUrl, 'https://send.dulcy.io/inbox?reply_uuid=abc');
  assert.equal(card.latestMessage, 'Can you do Tuesday?\nThanks');
  assert.equal(card.canEdit, true);

  assert.equal((await call('POST', '/hq/api/decisions/recREPLY000000001', { body: { verdict: 'edited', text: '  ' }, cookie })).status, 400);
  const e = await call('POST', '/hq/api/decisions/recREPLY000000001', { body: { verdict: 'edited', text: 'Hi Jane,\r\n\r\nTuesday 3pm works.' }, cookie });
  assert.equal(e.status, 200);
  assert.deepEqual(tables[EMAILS].recEMAIL000000001, { [RA.customReply]: 'Hi Jane,\n\nTuesday 3pm works.', [RA.humanAction]: 'Send Edited Reply' }, 'one write: text and button together');
  // Unchanged text = the normal Send.
  await call('POST', '/hq/api/decisions/recREPLY000000002', { body: { verdict: 'edited', text: 'Hi Jane,\n\nTue 2pm?' }, cookie });
  assert.deepEqual(tables[EMAILS].recEMAIL000000002, { [RA.humanAction]: 'Approve Draft' });
  await call('POST', '/hq/api/decisions/recREPLY000000003', { body: { verdict: 'reject' }, cookie });
  assert.deepEqual(tables[EMAILS].recEMAIL000000003, { [RA.humanAction]: 'Skip' });
  // A non-reply cannot be "edited".
  tables[DECISIONS].recFIX00000000001 = decision({ [DF.agent]: 'Riley', [DF.action]: 'Apply Riley Fix', [DF.emailsRecord]: '' });
  assert.equal((await call('POST', '/hq/api/decisions/recFIX00000000001', { body: { verdict: 'edited', text: 'x' }, cookie })).status, 400);
});

test('approved in HQ → the decisions loop starts the action (same as a Slack ✅); SLACK_DECISIONS=off posts nothing', { skip }, async () => {
  tables[DECISIONS] = { recBOUNCE00000001: decision({ [DF.title]: 'Bounce 5.1%', [DF.agent]: 'Atlas', [DF.action]: 'Resume Campaign', [DF.emailsRecord]: '', [DF.actionInput]: '{"teamId":1,"campaignId":2}' }),
    recNEW00000000001: decision({ [DF.status]: 'New', [DF.agent]: 'Atlas', [DF.action]: 'None', [DF.emailsRecord]: '' }) };
  const { cookie } = await login();
  assert.equal((await call('POST', '/hq/api/decisions/recBOUNCE00000001', { body: { verdict: 'approve' }, cookie })).status, 200);
  const posts: string[] = [];
  const slack = { async post(_c: string, t: string) { posts.push(t); return { channel: 'C1', ts: '1' }; }, async reactions() { return []; }, async react() { /* */ } };
  const loopAt = { list: async (table: string, formula: string) => { const want = /\{Status\}='(\w+)'/.exec(formula)?.[1]; return (await at.list(table)).filter((r) => r.fields[DF.status] === want); }, update: at.update };
  const r = await decisionsTick(db, cfg({ slackDecisionsOn: false }), loopAt as any, slack as any);
  assert.equal(r.started, 1);
  const job = (await db.query(`SELECT kind, request_id FROM jobs WHERE request_id LIKE 'decision:%'`)).rows[0];
  assert.deepEqual(job, { kind: 'bounce.fix', request_id: 'decision:recBOUNCE00000001' });
  assert.equal(tables[DECISIONS].recNEW00000000001[DF.status], 'Waiting', 'new decision moved on without Slack');
  assert.equal(posts.length, 0, 'nothing posted with SLACK_DECISIONS=off');
});

test('members never see or decide Money', { skip }, async () => {
  await upsertUser(db, 'josh@dulcy.io', 'member', 'josh long password 1', 'Josh');
  tables[DECISIONS] = { recMONEY000000001: decision({ [DF.agent]: 'Ledger', [DF.action]: 'Approve Purchase', [DF.emailsRecord]: '' }) };
  const { cookie } = await login('josh@dulcy.io', 'josh long password 1');
  const list = await call('GET', '/hq/api/decisions', { cookie });
  assert.equal(list.body.piles.Money, undefined);
  assert.ok(!list.body.order.includes('Money'));
  assert.equal((await call('POST', '/hq/api/decisions/recMONEY000000001', { body: { verdict: 'approve' }, cookie })).status, 403);
  assert.equal((await call('GET', '/hq/api/agents/Ledger', { cookie })).status, 404);
  assert.ok(!(await call('GET', '/hq/api/agents', { cookie })).body.agents.some((a: any) => a.name === 'Ledger'));
});

// ---------- Eisenhower ----------
const task = (over: Partial<Task> = {}): Task => ({ id: 'recT', name: 'T', client: '', stage: 'Execution', due: '', priority: 'Medium', status: 'Not Started', notes: '', clientFacing: false, lastUpdated: '2026-11-24T12:00:00.000Z', ...over });
const NOW = new Date('2026-11-25T15:00:00.000Z'); // Wed Nov 25, 10:00 New York

test('Eisenhower: urgent = overdue / due today or tomorrow / Urgent; important = Urgent / High / Client Facing', () => {
  assert.equal(classify(task({ due: '2026-11-20', priority: 'High' }), NOW).box, 'doNow');
  assert.equal(classify(task({ due: '2026-11-26', clientFacing: true }), NOW).box, 'doNow', 'due tomorrow + client facing');
  assert.equal(classify(task({ priority: 'Urgent' }), NOW).box, 'doNow', 'Urgent is both');
  assert.equal(classify(task({ priority: 'High', due: '2026-12-10' }), NOW).box, 'schedule');
  assert.equal(classify(task({ clientFacing: true }), NOW).box, 'schedule');
  assert.equal(classify(task({ due: '2026-11-25', priority: 'Low' }), NOW).box, 'delegate', 'due today, not important');
  assert.equal(classify(task({ due: '2026-11-27' }), NOW).box, 'later', 'due in 2 days is not urgent');
  assert.equal(classify(task({}), NOW).box, 'later');
  assert.equal(classify(task({ due: '2026-11-20' }), NOW).overdue, true);
  // New York date, not UTC: 03:00 UTC on Nov 26 is still Nov 25 in New York.
  assert.equal(classify(task({ due: '2026-11-27', priority: 'High' }), new Date('2026-11-26T03:00:00.000Z')).box, 'schedule');
});

test('Eisenhower: only open tasks, ranked; stale Review/QA tasks get "Done?" unless quieted', () => {
  const r = sortTasks([
    task({ id: 'a', name: 'later due', priority: 'High', due: '2026-11-24' }),
    task({ id: 'b', name: 'overdue more', priority: 'High', due: '2026-11-20' }),
    task({ id: 'c', status: 'Done', priority: 'Urgent' }),
    task({ id: 'd', stage: 'Completed', priority: 'Urgent' }),
    task({ id: 'e', stage: 'Review/QA', lastUpdated: '2026-11-10T00:00:00.000Z' }),
    task({ id: 'f', stage: 'Review/QA', lastUpdated: '2026-11-22T00:00:00.000Z' }),
    task({ id: 'g', stage: 'Review/QA', lastUpdated: '2026-11-01T00:00:00.000Z' }),
  ], NOW, new Set(['g']));
  assert.deepEqual(r.boxes.doNow.map((t) => t.id), ['b', 'a']);
  assert.deepEqual(r.boxes.later.map((t) => t.id).sort(), ['e', 'f', 'g']);
  assert.deepEqual(r.doneQuestions.map((t) => t.id), ['e'], '7+ days untouched in Review/QA, g was answered "not yet"');
});

test('tasks API: boxes from Airtable, done, not yet', { skip }, async () => {
  tables[TASKS] = {
    recTASK0000000001: { [TF.name]: 'Send GMG report', [TF.priority]: 'Urgent', [TF.status]: 'In Progress', [TF.client]: ['recCLIENT00000001'], [TF.lastUpdated]: new Date().toISOString() },
    recTASK0000000002: { [TF.name]: 'Old QA', [TF.stage]: 'Review/QA', [TF.status]: 'In Progress', [TF.lastUpdated]: '2026-10-01T00:00:00.000Z' },
    recTASK0000000003: { [TF.name]: 'Done one', [TF.status]: 'Done' },
  };
  tables.tblcjRBGJEWh5KgOt = { recCLIENT00000001: { Name: 'GMG' } };
  const { cookie } = await login();
  const r = await call('GET', '/hq/api/tasks', { cookie });
  assert.equal(r.status, 200);
  assert.equal(r.body.total, 2);
  assert.equal(r.body.boxes.doNow[0].name, 'Send GMG report');
  assert.equal(r.body.boxes.doNow[0].client, 'GMG');
  assert.deepEqual(r.body.doneQuestions.map((t: any) => t.id), ['recTASK0000000002']);
  assert.equal((await call('POST', '/hq/api/tasks/recTASK0000000002/not-yet', { body: {}, cookie })).status, 200);
  assert.equal((await call('GET', '/hq/api/tasks', { cookie })).body.doneQuestions.length, 0);
  assert.equal((await call('POST', '/hq/api/tasks/recTASK0000000001/done', { body: {}, cookie })).status, 200);
  assert.equal(tables[TASKS].recTASK0000000001[TF.status], 'Done');
});

// ---------- agents ----------
test('agent mapping: job kinds → agents, agents → piles', () => {
  const cases: [string, string | null][] = [
    ['sean.draft', 'Sean'], ['sean.followup', 'Sean'], ['reply.send', 'Sean'], ['decision.send_reply', 'Sean'],
    ['atlas.health', 'Atlas'], ['atlas.plan', 'Atlas'], ['atlas.tasks', 'Atlas'], ['campaign.build', 'Atlas'], ['bounce.check', 'Atlas'], ['bounce.fix', 'Atlas'], ['account.health', 'Atlas'],
    ['scribe.copy', 'Scribe'], ['leadlist.verify', 'Scout'], ['riley.collect', 'Riley'], ['ledger.report', 'Ledger'], ['cole.review', 'Cole'],
    ['sienna.ideas', 'Sienna'], ['ada.brief', 'Ada'], ['engine.selftest', null],
  ];
  for (const [kind, agent] of cases) assert.equal(agentForJob(kind), agent, kind);
  for (const a of AGENT_NAMES) for (const p of jobPatternsFor(a)) assert.equal(agentForJob(p.replace('%', 'x')), a, `${a} pattern ${p}`);
  assert.equal(pileFor('Sean'), 'Replies');
  for (const a of ['Atlas', 'Scribe', 'Scout']) assert.equal(pileFor(a), 'Campaigns');
  assert.equal(pileFor('Riley'), 'Fixes');
  assert.equal(pileFor('Ledger'), 'Money');
  for (const a of ['Ada', 'Cole', 'Sienna', '', 'Someone']) assert.equal(pileFor(a), 'Other');
});

test('team check: failed > waiting > ran fine > no runs', () => {
  const now = Date.parse('2026-11-25T15:00:00Z');
  const health = new Map<any, any>([
    ['Riley', { lastOk: '2026-11-25T14:00:00Z', openFails: [{ kind: 'riley.collect', at: '2026-11-25T14:30:00Z', error: 'Airtable 500' }] }],
    ['Atlas', { lastOk: '2026-11-25T13:00:00Z', openFails: [] }],
    ['Cole', { lastOk: '2026-11-25T12:00:00Z', openFails: [] }],
  ]);
  const lines = teamCheck(health, [{ agent: 'Atlas', created: '2026-11-24T15:00:00Z' }], now);
  const by = Object.fromEntries(lines.map((l) => [l.agent, l]));
  assert.match(by.Riley.line, /^⚠️ riley\.collect failed 30 min ago: Airtable 500/);
  assert.equal(by.Riley.ok, false);
  assert.match(by.Atlas.line, /^⚠️ waiting on you: 1 decision \(oldest 24 h ago\)/);
  assert.match(by.Cole.line, /^✓ ran fine \(3 h ago\)/);
  assert.equal(by.Cole.ok, true);
  assert.equal(by.Sienna.ok, null);
  assert.equal(lines.length, 9);
});

test('agents API: runs from jobs, team check, reports, own tasks', { skip }, async () => {
  await db.query(`INSERT INTO jobs (kind, record_id, status, result, dry_run) VALUES ('cole.review','cole-review','succeeded','{"message":"1 sales call reviewed"}', false), ('riley.collect','riley-collect','failed',NULL,false)`);
  await db.query(`UPDATE jobs SET error='Airtable 500' WHERE kind='riley.collect'`);
  await db.query(`INSERT INTO hq_agent_tasks (agent, title, due_date) VALUES ('Atlas','Plan next campaign for GMG','2026-11-28')`);
  await saveReport(db, { agent: 'Cole', kind: 'call_review', title: 'Call review: Jane (Acme)', body: '*Score 7/10*', summary: 'Score 7/10 · Good discovery', data: { score: 7, fixes: [{ said: 'a', better: 'b', why: 'c' }] }, dedupeKey: 'cole:1' });
  const { cookie } = await login();
  const list = await call('GET', '/hq/api/agents', { cookie });
  assert.equal(list.body.agents.length, 9);
  const by = Object.fromEntries(list.body.agents.map((a: any) => [a.name, a]));
  assert.equal(by.Atlas.reportsTo, 'Ada');
  assert.deepEqual(by.Atlas.manages, ['Scribe', 'Scout']);
  assert.equal(by.Scribe.reportsTo, 'Atlas');
  assert.equal(by.Atlas.openTasks, 1);
  assert.equal(by.Cole.status.ok, true);
  assert.equal(by.Riley.status.ok, false);
  const cole = await call('GET', '/hq/api/agents/cole', { cookie });
  assert.equal(cole.body.runs[0].kind, 'cole.review');
  assert.equal(cole.body.reports[0].data.score, 7, 'a call review card carries the score and fixes');
  const today = await call('GET', '/hq/api/today', { cookie });
  assert.equal(today.status, 200);
  assert.equal(today.body.team.length, 9);
  assert.equal(today.body.reports[0].title, 'Call review: Jane (Acme)');
  const rep = await call('GET', `/hq/api/reports/${today.body.reports[0].id}`, { cookie });
  assert.equal(rep.body.report.body, '**Score 7/10**', 'full text on open, Slack bold turned into markdown');
});

// ---------- reports ----------
test('reports: Slack mrkdwn → markdown, summary, the SLACK_REPORTS switch', () => {
  assert.equal(slackToMarkdown('*Score 7/10* · <https://x.y/z|recording> :warning: _note_'), '**Score 7/10** · [recording](https://x.y/z) ⚠️ *note*');
  assert.equal(summarize('**Waiting on you:** 3 decisions\n• one\n• two'), 'Waiting on you: 3 decisions · one');
  assert.equal(slackReports({ slackReportsOn: true }), true);
  assert.equal(slackReports({ slackReportsOn: false }), false);
  assert.equal(slackReports({ slackReportsOn: false }, true), true, 'urgent always goes to Slack');
  assert.equal(loadConfig({ ENGINE_SECRET: 'x'.repeat(40), DATABASE_URL: 'postgres://x' } as NodeJS.ProcessEnv).slackReportsOn, true, 'on by default');
  assert.equal(loadConfig({ ENGINE_SECRET: 'x'.repeat(40), DATABASE_URL: 'postgres://x', SLACK_REPORTS: 'off', SLACK_DECISIONS: 'off' } as NodeJS.ProcessEnv).slackDecisionsOn, false);
});

test('reports are saved once per key', { skip }, async () => {
  assert.ok(await saveReport(db, { agent: 'Ada', kind: 'brief', title: '*Good morning*', body: 'x', dedupeKey: 'ada:1' }));
  assert.equal(await saveReport(db, { agent: 'Ada', kind: 'brief', title: '*Good morning*', body: 'x', dedupeKey: 'ada:1' }), null);
  assert.equal((await db.query(`SELECT title FROM hq_reports`)).rows[0].title, 'Good morning');
});

// ---------- chat ----------
test('chat: read-only tool, sources saved, history per agent', { skip }, async () => {
  tables[DECISIONS] = { recREPLY000000001: decision() };
  script = [
    () => ({ content: [{ type: 'tool_use', id: 'tu1', name: 'pending_decisions', input: {} }], stop_reason: 'tool_use' }),
    (_n, messages) => {
      const res = messages.at(-1).content[0];
      assert.equal(res.type, 'tool_result');
      assert.match(res.content, /Reply to Jane/);
      return { content: [{ type: 'text', text: '1 decision waiting: reply to Jane.\nSources: Airtable Decisions' }], stop_reason: 'end_turn' };
    },
  ];
  const { cookie } = await login();
  const r = await call('POST', '/hq/api/chat', { body: { message: 'What is waiting on me?' }, cookie });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(r.body.reply.author, 'Ada', 'Ada by default');
  assert.deepEqual(r.body.reply.sources, ['Airtable Decisions']);
  assert.ok(modelCalls[0].tools.includes('ask_agent'), 'Ada can ask other agents');
  assert.ok(!modelCalls[0].tools.some((t) => /send|update|create|write|delete/.test(t)), 'no write tools');
  const t = await call('GET', `/hq/api/chat/threads/${r.body.threadId}`, { cookie });
  assert.deepEqual(t.body.thread.messages.map((m: any) => m.author), ['Alex', 'Ada']);
  // Follow-up in the same thread carries the history.
  script = [() => ({ content: [{ type: 'text', text: 'Yes. Sources: none' }], stop_reason: 'end_turn' })];
  await call('POST', '/hq/api/chat', { body: { message: 'Only one?', threadId: r.body.threadId }, cookie });
  assert.equal(modelCalls.at(-1)!.messages.length, 3);
  // A thread belongs to its agent.
  assert.equal((await call('POST', '/hq/api/chat', { body: { agent: 'Atlas', message: 'hi', threadId: r.body.threadId }, cookie })).status, 404);
});

test('chat: Ada asks Atlas (saved as its own thread); cost guard stops the tool loop', { skip }, async () => {
  script = [
    () => ({ content: [{ type: 'tool_use', id: 'a1', name: 'ask_agent', input: { agent: 'Atlas', question: 'Which client needs the next campaign?' } }], stop_reason: 'tool_use' }),
    () => ({ content: [{ type: 'text', text: "Here's what I found: GMG is at 64%. Sources: Airtable Campaigns" }], stop_reason: 'end_turn' }), // Atlas
    () => ({ content: [{ type: 'text', text: 'Atlas says GMG. Sources: Atlas' }], stop_reason: 'end_turn' }), // Ada
  ];
  const { cookie } = await login();
  const r = await call('POST', '/hq/api/chat', { body: { agent: 'ada', message: 'Who needs a new campaign?' }, cookie });
  assert.equal(r.status, 200);
  assert.ok(!modelCalls[1].tools.includes('ask_agent'), 'an asked agent cannot ask further');
  assert.equal(r.body.reply.tools[0].name, 'ask_agent');
  const child = r.body.reply.tools[0].threadId;
  const th = await call('GET', `/hq/api/chat/threads/${child}`, { cookie });
  assert.equal(th.body.thread.agent, 'Atlas');
  assert.equal(th.body.thread.askedBy, 'Ada');
  assert.equal(th.body.thread.parentId, r.body.threadId);
  assert.deepEqual(th.body.thread.messages.map((m: any) => m.author), ['Ada', 'Atlas']);
  const parent = await call('GET', `/hq/api/chat/threads/${r.body.threadId}`, { cookie });
  assert.equal(parent.body.thread.children[0].agent, 'Atlas');

  // A model that keeps calling tools is cut off after HQ_CHAT_MAX_ROUNDS (4): the last call has no tools.
  modelCalls = [];
  script = Array.from({ length: 10 }, (_, i) => () => (i < 4 ? { content: [{ type: 'tool_use', id: `x${i}`, name: 'engine_jobs', input: {} }], stop_reason: 'tool_use' } : { content: [{ type: 'text', text: 'done' }], stop_reason: 'end_turn' }));
  const g = await call('POST', '/hq/api/chat', { body: { agent: 'Riley', message: 'loop' }, cookie });
  assert.equal(g.status, 200);
  assert.equal(modelCalls.length, 5);
  assert.deepEqual(modelCalls.at(-1)!.tools, []);
});

// ---------- agent tasks ----------
test('Atlas tasks: campaign at 60%+ → "Plan next campaign", due in 3 days, unless a plan exists', () => {
  const names = new Map([['recWS1', 'GMG'], ['recWS2', 'MJJ']]);
  const c = (id: string, client: string, progress: number, status = 'Active') => ({ id, name: `${id} campaign`, client, status, progress });
  const out = planNextTasks([c('rec1', 'recWS1', 0.64), c('rec1b', 'recWS1', 0.7), c('rec2', 'recWS2', 0.55), c('rec3', 'recWS2', 0.9, 'Paused')], [], names, NOW);
  assert.deepEqual(out.map((t) => [t.title, t.due, t.sourceKey]), [['Plan next campaign for GMG', '2026-11-28', 'plan-next:rec1']]);
  assert.equal(planNextTasks([c('rec1', 'recWS1', 0.64)], [{ trigger_key: 'next:rec1', ws_rec: 'recWS1', state: 'approval1', created_at: '2026-11-20T00:00:00Z' }], names, NOW).length, 0);
  assert.equal(planNextTasks([c('rec1', 'recWS1', 0.64)], [{ trigger_key: 'next:recOLD', ws_rec: 'recWS1', state: 'rejected', created_at: '2026-11-20T00:00:00Z' }], names, NOW).length, 1, 'a rejected plan does not count');
});

test('Atlas tasks: generator writes once, closes when the plan starts; done from HQ', { skip }, async () => {
  tables.tblAVAA6uBPaMj28P = { recCAMP0000000001: { [CP.name]: 'GMG US', [CP.client]: ['recWS0000000000001'.slice(0, 17)], [CP.status]: 'Active', [CP.progress]: 0.62 } };
  tables.tblcjRBGJEWh5KgOt = { [String('recWS0000000000001').slice(0, 17)]: { Name: 'GMG' } };
  const a = await generateAtlasTasks(db, at as any, NOW);
  assert.deepEqual(a.created, ['Plan next campaign for GMG']);
  assert.deepEqual((await generateAtlasTasks(db, at as any, NOW)).created, [], 'once');
  await db.query(`INSERT INTO campaign_plans (trigger_key, ws_rec, client, state) VALUES ('next:recCAMP0000000001','recWS000000000000','GMG','planning')`);
  assert.equal((await generateAtlasTasks(db, at as any, NOW)).closed, 1);
  await db.query(`INSERT INTO hq_agent_tasks (agent, title) VALUES ('Scout','Check the GMG list')`);
  const { cookie } = await login();
  const id = (await db.query(`SELECT id FROM hq_agent_tasks WHERE agent='Scout'`)).rows[0].id;
  assert.equal((await call('POST', `/hq/api/agent-tasks/${id}/done`, { body: {}, cookie })).body.ok, true);
  assert.equal((await db.query(`SELECT status FROM hq_agent_tasks WHERE id=$1`, [id])).rows[0].status, 'done');
});

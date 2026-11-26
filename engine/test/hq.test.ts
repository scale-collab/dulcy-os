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
import { clientKey, groupWorkspaces, noteFor, _resetClientsCache } from '../src/hq/clients.js';
import { ACTIVITY, AF } from '../src/activity.js';
import { addAsk, cleanActionUrl, type Ask } from '../src/hq/asks.js';
import { aggregateNeeds } from '../src/hq/needs.js';
import type { DecisionCard } from '../src/hq/decisions.js';
import { ISSUES, IF } from '../src/agents/riley.js';
import { EF, SETTINGS } from '../src/agents/emailsFields.js';
import { WORKSPACES, XF, _resetInboxCache, bookingLinks, oneLine, parseHistory, tabOf } from '../src/hq/inbox.js';
import { SF, calendarInvite, isTimezone, validateSave, valuesOf } from '../src/hq/replier.js';

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
  tables = {}; writes = []; modelCalls = []; script = []; _resetClientCache(); _resetClientsCache(); _resetInboxCache();
  if (skip) return;
  await db.query('TRUNCATE hq_users, hq_sessions, hq_login_attempts, hq_user_events, hq_reports, hq_chat_threads, hq_chat_messages, hq_agent_tasks, hq_task_checks, hq_asks, hq_needs_quiet, hq_settings_log, campaign_plans, jobs, steps, receipts, events RESTART IDENTITY CASCADE');
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
const decision = (over: Record<string, unknown> = {}) => ({ [DF.title]: 'Reply to Jane at Acme', [DF.agent]: 'Echo', [DF.client]: 'Dulcy', [DF.status]: 'Waiting', [DF.issue]: 'Jane asked for times', [DF.checked]: 'Interested', [DF.fix]: 'Hi Jane,\n\nTue 2pm?', [DF.action]: 'Approve Reply', [DF.emailsRecord]: 'recEMAIL000000001', ...over });

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

test('members never see or decide money or content', { skip }, async () => {
  await upsertUser(db, 'josh@dulcy.io', 'member', 'josh long password 1', 'Josh');
  tables[DECISIONS] = { recMONEY000000001: decision({ [DF.agent]: 'Ledger', [DF.action]: 'Approve Purchase', [DF.emailsRecord]: '' }) };
  const { cookie } = await login('josh@dulcy.io', 'josh long password 1');
  const list = await call('GET', '/hq/api/decisions', { cookie });
  assert.equal(list.body.piles.Money, undefined);
  assert.ok(!list.body.order.includes('Money'));
  assert.equal((await call('POST', '/hq/api/decisions/recMONEY000000001', { body: { verdict: 'approve' }, cookie })).status, 403);
  assert.equal((await call('GET', '/hq/api/agents/Ledger', { cookie })).status, 404);
  assert.ok(!(await call('GET', '/hq/api/agents', { cookie })).body.agents.some((a: any) => a.name === 'Ledger' || a.name === 'Sienna'), 'money and content are owner-only');
  assert.equal((await call('GET', '/hq/api/agents/Sienna', { cookie })).status, 404);
  await saveReport(db, { agent: 'Sienna', kind: 'content_ideas', title: 'Ideas', body: 'x', dedupeKey: 'sienna:t' });
  assert.equal((await call('GET', '/hq/api/reports', { cookie })).body.reports.length, 0);
  assert.equal((await call('POST', '/hq/api/chat', { body: { agent: 'Sienna', message: 'hi' }, cookie })).status, 403);
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
    ['sean.draft', 'Echo'], ['sean.followup', 'Echo'], ['reply.send', 'Echo'], ['decision.send_reply', 'Echo'],
    ['atlas.health', 'Atlas'], ['atlas.plan', 'Atlas'], ['atlas.tasks', 'Atlas'], ['campaign.build', 'Atlas'], ['bounce.check', 'Atlas'], ['bounce.fix', 'Atlas'], ['account.health', 'Atlas'],
    ['scribe.copy', 'Scribe'], ['leadlist.verify', 'Scout'], ['riley.collect', 'Riley'], ['ledger.report', 'Ledger'], ['cole.review', 'Cole'],
    ['sienna.ideas', 'Sienna'], ['ada.brief', 'Ada'], ['engine.selftest', null],
  ];
  for (const [kind, agent] of cases) assert.equal(agentForJob(kind), agent, kind);
  for (const a of AGENT_NAMES) for (const p of jobPatternsFor(a)) assert.equal(agentForJob(p.replace('%', 'x')), a, `${a} pattern ${p}`);
  assert.equal(pileFor('Echo'), 'Replies');
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

// ---------- Clients (Step 2) ----------
test('clients: one key per client; the active record leads a group; the note for today', () => {
  assert.equal(clientKey('Twenty West Media (Internal)'), clientKey('Twenty West Media'));
  assert.equal(clientKey('Dulcy Free Campaigns'), 'dulcy');
  assert.notEqual(clientKey('Human Marketing'), clientKey('The Marketing Cartel'));
  const g = groupWorkspaces([
    { id: 'recA', fields: { Name: 'Twenty West Media', Status: 'Inactive', 'Client Type': 'Paying Client' } },
    { id: 'recB', fields: { Name: 'Twenty West Media (Internal)', Status: 'Active', 'Client Type': 'Paying Client' } },
    { id: 'recC', fields: { Name: 'Scroll Stop', Status: 'Active', Client: ['recD'] } },
    { id: 'recD', fields: { Name: 'GLOBALMEDIAGROUP LTD', Status: 'Active' } },
  ]);
  assert.deepEqual(g.map((x) => x.map((w) => w.id)), [['recB', 'recA'], ['recC', 'recD']], 'a Client link to another record groups them too');
  const base = { active: true, internal: false, waitingApproval: 0, seanWaiting: 0, interested30: 0, booked30: 0, interested7: 0, kpi: null };
  const camp = (o: Record<string, unknown>) => ({ id: 'c', name: 'X', progress: 0.3, bounce: 1, sent: 1, interested: 0, perThousand: null, flag: null, next: false, planExists: false, ...o }) as any;
  assert.deepEqual(noteFor({ ...base, campaigns: [] }), ['No active campaign.']);
  assert.deepEqual(noteFor({ ...base, waitingApproval: 38, interested30: 283, booked30: 17, campaigns: [camp({ bounce: 4.6, flag: 'pause' })] }), ['Bounce 4.6% on X: pause and check.', '38 replies waiting for approval.']);
  assert.deepEqual(noteFor({ ...base, interested30: 283, booked30: 17, campaigns: [camp({})] }), ['283 interested / 17 booked in 30 days.']);
  assert.deepEqual(noteFor({ ...base, campaigns: [camp({ progress: 0.72, next: true })] }), ['X is at 72%: plan the next campaign.']);
  assert.deepEqual(noteFor({ ...base, active: false, campaigns: [] }), []);
});

const WS_T = 'tblcjRBGJEWh5KgOt', CAMPAIGNS_T = 'tblAVAA6uBPaMj28P', EF_WS = 'fldCjo0mB0snziNZQ';
function clientTables() {
  const d = (days: number) => new Date(Date.now() - days * 86_400_000).toISOString();
  tables[WS_T] = {
    recTWMOLD00000001: { Name: 'Twenty West Media', Status: 'Inactive', 'Client Type': 'Paying Client', 'Monthly Fee': 2500, 'Actual Lifetime Revenue': 8985, 'Outstanding Receivables': 4995, ID: 65, 'Client Start Date': '2026-03-31' },
    recTWMINT00000001: { Name: 'Twenty West Media (Internal)', Status: 'Active', 'Client Type': 'Paying Client', 'Monthly Fee': 0, ID: 66, 'Client Health': 'At Risk', 'Client Health Reasons': 'Outstanding $4,995\nBounce high' },
    recMJJ00000000001: { Name: 'Brilliant Jewelers / MJJ Inc. (MJJ Brilliant)', Status: 'Active', ID: 80 },
    recLFM00000000001: { Name: 'Lead Flo Marketing', Status: 'Inactive', 'Client Type': 'Paying Client', 'Monthly Fee': 1000, ID: 68, 'Inactive Reason': 'Churned' },
    recDUL00000000001: { Name: 'Dulcy', Status: 'Active', 'Client Type': 'Internal', 'Monthly Fee': 0, ID: 2 },
    recDUL00000000002: { Name: 'Dulcy Free Campaigns', Status: 'Active', 'Client Type': 'Free / Trial', ID: 41 },
  };
  const emails: Record<string, Record<string, unknown>> = {};
  for (let i = 0; i < 20; i++) emails[`recEI${String(i).padStart(12, '0')}`] = { 'Workspace ID (Bison)': '66', 'Lead Status': 'Interested', 'Latest Reply Time': d(3) };
  emails.recEOLD0000000001 = { 'Workspace ID (Bison)': '65', 'Lead Status': 'Interested', 'Latest Reply Time': d(5) };
  emails.recEOLD0000000002 = { 'Workspace ID (Bison)': '65', 'Lead Status': 'Interested', 'Latest Reply Time': d(6), 'Meeting Booked At': d(2) };
  emails.recEDUL0000000001 = { 'Workspace ID (Bison)': '41', 'Lead Status': 'Interested', 'Latest Reply Time': d(1), 'Meeting Booked At': d(1) };
  for (let i = 0; i < 3; i++) emails[`recEWAIT0000000${i}0`] = { [RA.state]: 'Needs Approval', [RA.clients]: ['recTWMINT00000001'] };
  emails.recEWAITMJJ000001 = { [RA.state]: 'Needs Approval', [EF_WS]: '80' };
  emails.recESENT000000001 = { [RA.state]: 'Sent', [RA.clients]: ['recTWMINT00000001'] };
  tables[EMAILS] = emails;
  tables[CAMPAIGNS_T] = {
    recCTWM0000000001: { Name: 'TWM - Contractors', Client: ['recTWMINT00000001'], 'Campaign Status': 'Active', 'Bounced %': 4.6, Progress: 0.72, 'Emails Sent': 2000, Interested: 10 },
    recCMJJ0000000001: { Name: 'MJJ - Jewelers', Client: ['recMJJ00000000001'], 'Campaign Status': 'Active', 'Bounced %': 3.1, Progress: 0.3, 'Emails Sent': 500, Interested: 2 },
    recCLFM0000000001: { Name: 'Lead Flo - Events', Client: ['recLFM00000000001'], 'Campaign Status': 'Inactive', 'Bounced %': 9, Progress: 1 },
    recCDUL0000000001: { Name: 'Dulcy - Agencies', Client: ['recDUL00000000001'], 'Campaign Status': 'Active', 'Bounced %': 1, Progress: 0.2, 'Emails Sent': 1000, Interested: 5 },
  };
  tables[DECISIONS] = { recSEANTWM0000001: decision({ [DF.client]: 'Client: Twenty West Media (Internal)' }) };
  tables[ACTIVITY] = {
    recACT00000000001: { [AF.event]: 'Atlas saw bounce 4.6%', [AF.when]: d(1), [AF.agent]: 'Atlas', [AF.type]: 'Detected', [AF.client]: ['recTWMINT00000001'] },
    recACT00000000002: { [AF.event]: 'Other client', [AF.when]: d(1), [AF.agent]: 'Atlas', [AF.type]: 'Info', [AF.client]: ['recMJJ00000000001'] },
  };
}

test('clients API: active by default, the Twenty West pair counted once, numbers, notes, flags, cache', { skip }, async () => {
  clientTables();
  assert.equal((await call('GET', '/hq/api/clients')).status, 401, 'needs a session');
  assert.equal((await call('GET', '/hq/api/clients/recTWMINT00000001')).status, 401, 'needs a session');
  const { cookie } = await login();
  const r = await call('GET', '/hq/api/clients', { cookie });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  const names = r.body.clients.map((c: any) => c.name);
  assert.deepEqual([...names].sort(), ['Brilliant Jewelers / MJJ Inc. (MJJ Brilliant)', 'Dulcy', 'Twenty West Media']);
  assert.deepEqual({ active: r.body.summary.active, internal: r.body.summary.internal, inactive: r.body.summary.inactive }, { active: 2, internal: 1, inactive: 1 });
  assert.equal(r.body.clients[0].name, 'Twenty West Media', 'worst health first');
  const twm = r.body.clients[0];
  assert.equal(twm.id, 'recTWMINT00000001', 'the active record leads');
  assert.equal(twm.workspaces.length, 2);
  assert.equal(twm.light, 'red');
  assert.deepEqual([twm.interested30, twm.booked30, twm.waitingApproval, twm.seanWaiting], [22, 1, 3, 1], 'both workspaces add up; only Needs Approval counts');
  assert.deepEqual({ ...twm.money, feeNote: '' }, { fee: 2500, feeNote: '', ltv: 8985, ltvSource: 'actual', receivables: 4995, months: null });
  assert.match(twm.money.feeNote, /\$2,500 is on the inactive record "Twenty West Media"/);
  assert.equal(r.body.summary.mrr, 2500);
  assert.match(twm.note[0], /^Bounce 4\.6% on TWM - Contractors/);
  assert.match(twm.note[1], /^3 replies waiting for approval/);
  const camp = twm.campaigns[0];
  assert.deepEqual([camp.flag, camp.next, camp.planExists, camp.perThousand], ['pause', true, false, 5]);
  const mjj = r.body.clients.find((c: any) => /MJJ/.test(c.name));
  assert.equal(mjj.campaigns[0].flag, 'watch');
  assert.equal(mjj.waitingApproval, 1, 'matched by Bison workspace id');
  assert.ok(mjj.dataIssues.some((x: string) => /Client Type is empty/.test(x)));
  const dulcy = r.body.clients.find((c: any) => c.name === 'Dulcy');
  assert.equal(dulcy.internal, true);
  assert.equal(dulcy.workspaces.length, 2, 'Dulcy Free Campaigns folds into Dulcy');
  assert.equal(dulcy.booked30, 1);
  assert.ok(!dulcy.reasons.some((x: string) => /fee/.test(x)), 'no fee nag for Dulcy itself');

  const all = await call('GET', '/hq/api/clients?all=1', { cookie });
  const lfm = all.body.clients.find((c: any) => c.name === 'Lead Flo Marketing');
  assert.deepEqual([lfm.active, lfm.light, lfm.inactiveReason, lfm.campaigns.length, lfm.note.length], [false, 'inactive', 'Churned', 0, 0]);
  assert.equal(all.body.clients.at(-1).name, 'Lead Flo Marketing', 'inactive last');

  // Cached for 5 minutes: a change shows only after the cache is cleared.
  await db.query(`INSERT INTO campaign_plans (trigger_key, ws_rec, client, state) VALUES ('next:recCTWM0000000001','recTWMINT00000001','Twenty West Media','planning')`);
  assert.equal((await call('GET', '/hq/api/clients', { cookie })).body.clients[0].campaigns[0].planExists, false, 'cached');
  _resetClientsCache();
  assert.equal((await call('GET', '/hq/api/clients', { cookie })).body.clients[0].campaigns[0].planExists, true, 'plan found after the cache');

  const d = await call('GET', '/hq/api/clients/recTWMOLD00000001', { cookie });
  assert.equal(d.status, 200);
  assert.equal(d.body.client.id, 'recTWMINT00000001', 'any workspace id of the client opens it');
  assert.deepEqual(d.body.activity.map((x: any) => x.event), ['Atlas saw bounce 4.6%']);
  assert.equal(d.body.decisions.length, 1);
  assert.equal((await call('GET', '/hq/api/clients/recNOPE0000000001', { cookie })).status, 404);
});

test('clients API: members get no money (fee, LTV, receivables, money reasons)', { skip }, async () => {
  clientTables();
  await upsertUser(db, 'josh@dulcy.io', 'member', 'josh long password 1', 'Josh');
  const { cookie } = await login('josh@dulcy.io', 'josh long password 1');
  for (const p of ['/hq/api/clients?all=1', '/hq/api/clients/recTWMINT00000001']) {
    const r = await call('GET', p, { cookie });
    assert.equal(r.status, 200);
    assert.ok(!/"money"|"mrr"|4995|4,995|8985|8,985|2500|2,500|\$/.test(r.text), `no money in ${p}: ${r.text.slice(0, 300)}`);
  }
  const twm = (await call('GET', '/hq/api/clients', { cookie })).body.clients[0];
  assert.equal(twm.airtableReasons, 'Bounce high');
  assert.equal(twm.interested30, 22, 'results are still there');
});

// ---------- Sign-up and users ----------
const SIGNUP = { name: 'Josh Rivera', email: 'Josh@dulcy.io', password: 'josh long password 1', password2: 'josh long password 1' };

test('sign-up makes a pending request that can never log in; same answer for an existing email', { skip }, async () => {
  const r = await call('POST', '/hq/api/auth/signup', { body: SIGNUP });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(r.body.message, 'Request sent. Alex will approve it.');
  assert.equal(sessionCookie(r), '', 'no session from a sign-up');
  const row = (await db.query(`SELECT email, role, pending, disabled, password_hash FROM hq_users WHERE email='josh@dulcy.io'`)).rows[0];
  assert.deepEqual([row.role, row.pending, row.disabled], ['member', true, true]);
  assert.match(row.password_hash, /^scrypt\$/);
  const tryLogin = await login('josh@dulcy.io', SIGNUP.password);
  assert.equal(tryLogin.r.status, 401, 'pending cannot log in');
  assert.equal(tryLogin.r.body.error, 'That email and password do not match.', 'same answer as a wrong password');
  // A session row for a pending user (should never exist) is refused anyway.
  const owner = (await db.query(`SELECT id FROM hq_users WHERE email='josh@dulcy.io'`)).rows[0].id;
  const { createSession } = await import('../src/hq/auth.js');
  const forged = (await createSession(db, cfg(), owner)).split(';')[0];
  assert.equal((await call('GET', '/hq/api/me', { cookie: forged })).status, 401, 'session lookup refuses pending users');

  // Existing email (the owner's): same answer, nothing changes.
  const before = (await db.query(`SELECT password_hash, pending FROM hq_users WHERE email='alex@dulcy.io'`)).rows[0];
  const again = await call('POST', '/hq/api/auth/signup', { body: { ...SIGNUP, email: 'alex@dulcy.io' } });
  assert.deepEqual([again.status, again.body.message], [200, 'Request sent. Alex will approve it.']);
  assert.deepEqual((await db.query(`SELECT password_hash, pending FROM hq_users WHERE email='alex@dulcy.io'`)).rows[0], before);
  assert.equal((await login()).r.status, 200, 'the owner still logs in');

  // Validation: short password, mismatch, bad email.
  assert.equal((await call('POST', '/hq/api/auth/signup', { body: { ...SIGNUP, email: 'a@b.io', password: 'short', password2: 'short' } })).status, 400);
  assert.equal((await call('POST', '/hq/api/auth/signup', { body: { ...SIGNUP, email: 'a@b.io', password2: 'something else 123' } })).status, 400);
  assert.equal((await call('POST', '/hq/api/auth/signup', { body: { ...SIGNUP, email: 'not-an-email' } })).status, 400);
  assert.equal((await call('POST', '/hq/api/auth/signup', { body: SIGNUP, origin: 'https://evil.example' })).status, 403, 'CSRF check on sign-up too');
});

test('sign-up is rate limited per email', { skip }, async () => {
  for (let i = 0; i < 5; i++) assert.equal((await call('POST', '/hq/api/auth/signup', { body: SIGNUP })).status, 200);
  const blocked = await call('POST', '/hq/api/auth/signup', { body: SIGNUP });
  assert.equal(blocked.status, 429);
  assert.equal((await login()).r.status, 200, 'sign-up tries do not block logins');
  assert.equal((await db.query(`SELECT count(*)::int AS n FROM hq_users WHERE email='josh@dulcy.io'`)).rows[0].n, 1);
});

test('owner sees the request, approves with a role; the user logs in with that role', { skip }, async () => {
  await call('POST', '/hq/api/auth/signup', { body: SIGNUP });
  const { cookie } = await login();
  assert.equal((await call('GET', '/hq/api/me', { cookie })).body.signups, 1, 'badge count for the owner');
  const list = await call('GET', '/hq/api/users', { cookie });
  const josh = list.body.users.find((u: any) => u.email === 'josh@dulcy.io');
  assert.deepEqual([josh.status, josh.role, josh.hasPassword, Boolean(josh.requested)], ['pending', 'member', true, true]);
  assert.ok(!JSON.stringify(list.body).includes('scrypt'), 'no hashes to the browser');
  assert.equal((await call('POST', `/hq/api/users/${josh.id}/approve`, { body: { role: 'admin' }, cookie })).status, 400);
  assert.equal((await call('POST', `/hq/api/users/${josh.id}/approve`, { body: { role: 'member' }, cookie })).status, 200);
  assert.equal((await call('GET', '/hq/api/me', { cookie })).body.signups, 0);
  const j = await login('josh@dulcy.io', SIGNUP.password);
  assert.equal(j.r.status, 200);
  assert.equal(j.r.body.user.role, 'member');
  assert.equal((await call('GET', '/hq/api/me', { cookie: j.cookie })).body.signups, undefined, 'members get no sign-up count');
  // Members cannot reach any users API.
  for (const [m, p] of [['GET', '/hq/api/users'], ['POST', '/hq/api/users'], ['POST', `/hq/api/users/${josh.id}/role`], ['POST', `/hq/api/users/${josh.id}/disable`], ['POST', '/hq/api/users/1/password']] as const) {
    assert.equal((await call(m, p, { cookie: j.cookie, ...(m === 'POST' ? { body: { role: 'owner', password: 'x'.repeat(20) } } : {}) })).status, 403, `${m} ${p}`);
  }
  assert.equal((await db.query(`SELECT role FROM hq_users WHERE email='josh@dulcy.io'`)).rows[0].role, 'member', 'a member cannot promote themself');
  // Promote: the role applies to the open session right away.
  assert.equal((await call('POST', `/hq/api/users/${josh.id}/role`, { body: { role: 'owner' }, cookie })).status, 200);
  assert.equal((await call('GET', '/hq/api/me', { cookie: j.cookie })).body.user.role, 'owner');
  const actions = (await call('GET', '/hq/api/users', { cookie })).body.events.map((e: any) => `${e.actor} ${e.action} ${e.target}`);
  assert.deepEqual(actions, ['alex@dulcy.io role josh@dulcy.io', 'alex@dulcy.io approve josh@dulcy.io', 'josh@dulcy.io signup josh@dulcy.io'], 'every action logged');
});

test('deny deletes the request; disable and password reset end sessions; re-enable restores', { skip }, async () => {
  await call('POST', '/hq/api/auth/signup', { body: SIGNUP });
  await call('POST', '/hq/api/auth/signup', { body: { ...SIGNUP, email: 'spam@example.com' } });
  const { cookie } = await login();
  const users = (await call('GET', '/hq/api/users', { cookie })).body.users;
  const spam = users.find((u: any) => u.email === 'spam@example.com');
  const josh = users.find((u: any) => u.email === 'josh@dulcy.io');
  assert.equal((await call('POST', `/hq/api/users/${spam.id}/deny`, { body: {}, cookie })).status, 200);
  assert.equal((await db.query(`SELECT count(*)::int AS n FROM hq_users WHERE email='spam@example.com'`)).rows[0].n, 0);
  assert.equal((await login('spam@example.com', SIGNUP.password)).r.status, 401);
  await call('POST', `/hq/api/users/${josh.id}/approve`, { body: {}, cookie });
  assert.equal((await db.query(`SELECT role FROM hq_users WHERE id=$1`, [josh.id])).rows[0].role, 'member', 'member by default');
  assert.equal((await call('POST', `/hq/api/users/${josh.id}/deny`, { body: {}, cookie })).status, 409, 'an active user is disabled, not denied');
  const j = await login('josh@dulcy.io', SIGNUP.password);
  assert.equal((await call('POST', `/hq/api/users/${josh.id}/disable`, { body: {}, cookie })).status, 200);
  assert.equal((await call('GET', '/hq/api/me', { cookie: j.cookie })).status, 401, 'disabling ends the session');
  assert.equal((await login('josh@dulcy.io', SIGNUP.password)).r.status, 401, 'and blocks logins');
  assert.equal((await call('POST', `/hq/api/users/${josh.id}/enable`, { body: {}, cookie })).status, 200);
  const j2 = await login('josh@dulcy.io', SIGNUP.password);
  assert.equal(j2.r.status, 200);
  assert.equal((await call('POST', `/hq/api/users/${josh.id}/password`, { body: { password: 'short' }, cookie })).status, 400);
  assert.equal((await call('POST', `/hq/api/users/${josh.id}/password`, { body: { password: 'a new temporary pass 9' }, cookie })).status, 200);
  assert.equal((await call('GET', '/hq/api/me', { cookie: j2.cookie })).status, 401, 'a reset ends the session');
  assert.equal((await login('josh@dulcy.io', SIGNUP.password)).r.status, 401, 'old password dead');
  assert.equal((await login('josh@dulcy.io', 'a new temporary pass 9')).r.status, 200);
});

test('the owner cannot disable or demote themself or the last owner; add user', { skip }, async () => {
  const { cookie } = await login();
  const me = (await db.query(`SELECT id FROM hq_users WHERE email='alex@dulcy.io'`)).rows[0].id;
  assert.equal((await call('POST', `/hq/api/users/${me}/disable`, { body: {}, cookie })).status, 409);
  assert.equal((await call('POST', `/hq/api/users/${me}/role`, { body: { role: 'member' }, cookie })).status, 409);
  // Add a second owner (Google only) and a member with a temporary password.
  const add = await call('POST', '/hq/api/users', { body: { name: 'Sam', email: 'sam@dulcy.io', role: 'owner', googleOnly: true }, cookie });
  assert.equal(add.status, 200);
  assert.equal((await call('POST', '/hq/api/users', { body: { name: 'Sam', email: 'sam@dulcy.io', role: 'member', password: 'x'.repeat(14) }, cookie })).status, 409, 'email taken');
  assert.equal((await call('POST', '/hq/api/users', { body: { name: 'Kim', email: 'kim@dulcy.io', password: 'short' }, cookie })).status, 400);
  assert.equal((await call('POST', '/hq/api/users', { body: { name: 'Kim', email: 'kim@dulcy.io', password: 'kim temporary pass 1' }, cookie })).status, 200);
  assert.equal((await login('kim@dulcy.io', 'kim temporary pass 1')).r.body.user.role, 'member');
  const sam = add.body.id;
  assert.equal((await db.query(`SELECT password_hash FROM hq_users WHERE id=$1`, [sam])).rows[0].password_hash, null, 'Google only');
  // With two owners, Sam can be demoted; then Alex is the last owner again.
  assert.equal((await call('POST', `/hq/api/users/${sam}/role`, { body: { role: 'member' }, cookie })).status, 200);
  // Disable Alex from another owner's view: the last owner is protected.
  await db.query(`UPDATE hq_users SET role='owner' WHERE email='kim@dulcy.io'`);
  const kim = await login('kim@dulcy.io', 'kim temporary pass 1');
  assert.equal((await call('POST', `/hq/api/users/${me}/disable`, { body: {}, cookie: kim.cookie })).status, 200, 'two owners: one can disable the other');
  const kimId = (await db.query(`SELECT id FROM hq_users WHERE email='kim@dulcy.io'`)).rows[0].id;
  assert.equal((await call('POST', `/hq/api/users/${kimId}/role`, { body: { role: 'member' }, cookie: kim.cookie })).status, 409, 'cannot demote yourself (and the last owner)');
});

test('Google sign-up: a pending request, never a session; Google login refuses it until approved', { skip }, async () => {
  const fakeGoogle = async (_u: string, init: any) => {
    const claims = { iss: 'https://accounts.google.com', aud: 'cid.apps.googleusercontent.com', exp: Math.floor(Date.now() / 1000) + 600, email_verified: true, email: new URLSearchParams(String(init.body)).get('code') === 'alex' ? 'alex@dulcy.io' : 'newbie@gmail.com' };
    return new Response(JSON.stringify({ id_token: `x.${Buffer.from(JSON.stringify(claims)).toString('base64url')}.y` }), { status: 200 });
  };
  const g = createServer(db, cfg({ hqGoogleClientId: 'cid.apps.googleusercontent.com', hqGoogleClientSecret: 'shh' }), { at: at as any, webDir, fetchImpl: fakeGoogle as any });
  await new Promise<void>((r) => g.listen(0, '127.0.0.1', () => r()));
  const saved = port; port = (g.address() as AddressInfo).port;
  const start = async (mode = '') => {
    const s = await call('GET', `/hq/api/auth/google/start${mode ? `?mode=${mode}` : ''}`);
    return { state: new URL(String(s.headers.location)).searchParams.get('state')!, oauth: ([] as string[]).concat(s.headers['set-cookie'] ?? [])[0].split(';')[0] };
  };
  try {
    let s = await start('signup');
    const r = await call('GET', `/hq/api/auth/google/callback?code=other&state=${s.state}`, { cookie: s.oauth });
    assert.equal(r.status, 302);
    assert.match(decodeURIComponent(String(r.headers.location)), /#\/login\?notice=Request sent/);
    assert.equal(sessionCookie(r), '', 'no session');
    const row = (await db.query(`SELECT pending, disabled, password_hash FROM hq_users WHERE email='newbie@gmail.com'`)).rows[0];
    assert.deepEqual([row.pending, row.disabled, row.password_hash], [true, true, null]);
    s = await start();
    const login2 = await call('GET', `/hq/api/auth/google/callback?code=other&state=${s.state}`, { cookie: s.oauth });
    assert.match(decodeURIComponent(String(login2.headers.location)), /no HQ access/);
    assert.equal(sessionCookie(login2), '');
    // An existing active user who presses "Sign up with Google" is simply signed in.
    s = await start('signup');
    assert.ok(sessionCookie(await call('GET', `/hq/api/auth/google/callback?code=alex&state=${s.state}`, { cookie: s.oauth })));
  } finally { port = saved; g.close(); }
});

// ---------- Needs you ----------
const card = (over: Partial<DecisionCard> = {}): DecisionCard => ({ id: 'recD', title: 'Reply to Jane', agent: 'Echo', client: '', pile: 'Replies', status: 'New', isReply: true, issue: '', checked: '', fix: '', details: '', action: 'Approve Reply', created: '2026-11-25T05:00:00.000Z', threadUrl: '', latestMessage: '', canEdit: true, ...over });
const askRow = (over: Partial<Ask> = {}): Ask => ({ id: 1, agent: 'Atlas', title: 'Reply to Pete about Twenty West', why: 'He asked for the October numbers.', steps: '', actionLabel: '', actionUrl: '', priority: 'normal', audience: 'owner', dedupeKey: 'k', created: '2026-11-25T12:00:00.000Z', done: null, doneBy: null, snoozedUntil: null, ...over });

test('needs: one item per pile (never per decision), Riley manual fixes, sign-ups, asks; Do now first', () => {
  const decisions = [
    ...Array.from({ length: 105 }, (_, i) => card({ id: `recR${String(i).padStart(13, '0')}`, created: new Date(Date.parse('2026-11-25T06:00:00.000Z') + i * 60_000).toISOString() })),
    card({ id: 'recCAMP0000000001', agent: 'Atlas', pile: 'Campaigns', title: 'Bounce 4.6% on Fleet Ops', isReply: false }),
    card({ id: 'recFIX00000000001', agent: 'Riley', pile: 'Fixes', title: 'Apply the n8n fix', isReply: false }),
    card({ id: 'recFIXMANUAL00001', agent: 'Riley', pile: 'Fixes', title: 'Riley: renew the key', isReply: false }),
    card({ id: 'recMONEY000000001', agent: 'Ledger', pile: 'Money', title: 'Buy 2 inboxes', isReply: false }),
    card({ id: 'recSIENNA00000001', agent: 'Sienna', pile: 'Other', title: 'Script ready', isReply: false }),
  ];
  const issues = [{ id: 'recISSUE000000001', title: 'EmailBison key expired', why: 'The API key was rotated on Nov 24. Every sync since fails with 401.', fix: '1. Open EmailBison settings\n2. Copy the new key', decision: 'recFIXMANUAL00001', seen: '2026-11-25T09:00:00.000Z' }];
  const asks = [
    askRow({ id: 1 }),
    askRow({ id: 2, agent: 'Setup', title: 'Publish the Google calendar app', priority: 'high', steps: '1. Open the console', audience: 'everyone' }),
    askRow({ id: 3, title: 'Done one', done: '2026-11-25T10:00:00.000Z' }),
    askRow({ id: 4, title: 'Snoozed one', snoozedUntil: '2026-11-26T15:00:00.000Z' }),
    askRow({ id: 5, title: 'Snooze ended', snoozedUntil: '2026-11-25T14:00:00.000Z' }),
  ];
  const now = Date.parse('2026-11-25T15:00:00.000Z');
  const items = aggregateNeeds({ owner: true, decisions, issues, signups: 1, asks, now });
  const keys = items.map((i) => i.key);
  assert.deepEqual(keys.filter((k) => k.startsWith('pile:')).sort(), ['pile:Campaigns', 'pile:Fixes', 'pile:Money', 'pile:Other', 'pile:Replies']);
  const replies = items.find((i) => i.key === 'pile:Replies')!;
  assert.deepEqual([replies.agent, replies.title, replies.count, replies.group, replies.action], ['Echo', '105 replies waiting for your OK', 105, 'now', { label: 'Open Replies', href: 'decisions/Replies' }]);
  assert.match(replies.why, /Oldest 9 h ago/);
  assert.equal(items.find((i) => i.key === 'pile:Fixes')!.count, 1, "the manual fix's decision is covered by the issue card");
  const issue = items.find((i) => i.key === 'issue:recISSUE000000001')!;
  assert.deepEqual([issue.agent, issue.title, issue.why, issue.action, issue.link?.href, issue.canDone, issue.canSnooze], ['Riley', 'EmailBison key expired', 'The API key was rotated on Nov 24.', null, 'decisions/Fixes', false, true]);
  assert.match(issue.steps, /Copy the new key/);
  assert.equal(items.find((i) => i.key === 'signups')!.action?.href, 'users');
  assert.deepEqual(keys.filter((k) => k.startsWith('ask:')).sort(), ['ask:1', 'ask:2', 'ask:5'], 'done and snoozed asks are gone; an ended snooze is back');
  assert.equal(items.find((i) => i.key === 'ask:2')!.icon, 'sparkles', 'a label, not an agent, gets an icon');
  // Order: every "now" before every "later"; replies first.
  assert.equal(keys[0], 'pile:Replies');
  const groups = items.map((i) => i.group);
  assert.deepEqual(groups, [...groups].sort((a, b) => (a === b ? 0 : a === 'now' ? -1 : 1)));
  assert.equal(items.find((i) => i.key === 'ask:1')!.group, 'later');
  assert.equal(items.find((i) => i.key === 'ask:2')!.group, 'now');
  // Resolved = gone: no decisions, no issues, no asks.
  assert.deepEqual(aggregateNeeds({ owner: true, decisions: [], issues: [], signups: 0, asks: [], now }), []);
  // "Not now" on the issue.
  assert.ok(!aggregateNeeds({ owner: true, decisions, issues, signups: 0, asks: [], now, quiet: new Set(['issue:recISSUE000000001']) }).some((i) => i.kind === 'issue'));
});

test('needs: a member gets only the piles they can act on; no money, content, Riley manual fixes or sign-ups', () => {
  const decisions = [card(), card({ id: 'recMONEY000000001', agent: 'Ledger', pile: 'Money' }), card({ id: 'recSIENNA00000001', agent: 'Sienna', pile: 'Other' })];
  const issues = [{ id: 'recISSUE000000001', title: 'Key expired', why: '', fix: '', decision: '', seen: '' }];
  const asks = [askRow({ id: 1 }), askRow({ id: 2, audience: 'everyone', title: 'For Josh' }), askRow({ id: 3, agent: 'Ledger', audience: 'everyone', title: 'Money ask' })];
  const items = aggregateNeeds({ owner: false, decisions, issues, signups: 3, asks });
  assert.deepEqual(items.map((i) => i.key), ['pile:Replies', 'ask:2']);
});

test('needs API: owner and member views, Riley issues from System Issues, Today shows the top 3', { skip }, async () => {
  tables[DECISIONS] = {
    recREPLY000000001: decision(), recREPLY000000002: decision({ [DF.title]: 'Reply to Bo' }),
    recMONEY000000001: decision({ [DF.agent]: 'Ledger', [DF.action]: 'Approve Purchase', [DF.emailsRecord]: '', _created: new Date().toISOString() }),
  };
  tables[ISSUES] = {
    recISSUE000000001: { [IF.title]: 'Xero login expired', [IF.status]: 'Waiting for Alex', [IF.fixType]: 'Manual (Alex)', [IF.why]: 'The Xero refresh token expired. Ledger cannot read.', [IF.fix]: 'Run xero-connect on the server.', [IF.decision]: 'recDEC00000000001' },
    recISSUE000000002: { [IF.title]: 'Retry me', [IF.status]: 'Waiting for Alex', [IF.fixType]: 'Retry' },
    recISSUE000000003: { [IF.title]: 'Fixed already', [IF.status]: 'Fixed', [IF.fixType]: 'Manual (Alex)' },
  };
  await db.query(`INSERT INTO hq_users (email, name, role, pending, disabled, requested_at) VALUES ('new@x.io','New','member',true,true,now())`);
  await addAsk(db, { agent: 'atlas', title: 'Reply to Pete about Twenty West', why: 'He asked twice.', actionUrl: '#/clients', actionLabel: 'Open clients' });
  await addAsk(db, { agent: 'Setup', title: 'Publish the Google calendar app', steps: '1. Open console\n2. Publish', priority: 'high', audience: 'everyone' });
  assert.equal((await call('GET', '/hq/api/needs')).status, 401, 'needs a session');

  const { cookie } = await login();
  const r = await call('GET', '/hq/api/needs', { cookie });
  assert.equal(r.status, 200);
  const keys = r.body.items.map((i: any) => i.key);
  assert.deepEqual([...keys].sort(), ['ask:1', 'ask:2', 'issue:recISSUE000000001', 'pile:Money', 'pile:Replies', 'signups']);
  assert.equal(r.body.items.find((i: any) => i.key === 'pile:Replies').title, '2 replies waiting for your OK');
  assert.equal(r.body.items.find((i: any) => i.key === 'ask:1').action.href, 'clients', 'stored as a relative HQ route');
  assert.equal(r.body.items.find((i: any) => i.key === 'ask:1').agent, 'Atlas');
  assert.deepEqual(r.body.counts, { total: 6, now: 4, later: 2 });
  assert.deepEqual(r.body.errors, []);
  const t = await call('GET', '/hq/api/today', { cookie });
  assert.equal(t.body.needs.top.length, 3);
  assert.equal(t.body.needs.top[0].key, 'pile:Replies');
  assert.equal(t.body.needs.counts.total, 6);
  assert.equal(t.body.tasks, undefined, 'Today no longer reads the Airtable to-do');

  await upsertUser(db, 'josh@dulcy.io', 'member', 'josh long password 1', 'Josh');
  const j = await login('josh@dulcy.io', 'josh long password 1');
  const mr = await call('GET', '/hq/api/needs', { cookie: j.cookie });
  assert.deepEqual(mr.body.items.map((i: any) => i.key).sort(), ['ask:2', 'pile:Replies']);
  assert.ok(!JSON.stringify(mr.body).includes('Xero'), 'nothing of the owner-only items in the answer');
  assert.equal((await call('POST', '/hq/api/asks/1/done', { body: {}, cookie: j.cookie })).status, 404, "a member cannot touch the owner's ask");
  assert.equal((await call('POST', '/hq/api/needs/issue/recISSUE000000001/snooze', { body: { until: 'tomorrow' }, cookie: j.cookie })).status, 404);
  assert.equal((await call('GET', '/hq/api/asks', { cookie: j.cookie })).body.asks.length, 1);
  // Resolved in Airtable = gone from HQ.
  tables[ISSUES].recISSUE000000001[IF.status] = 'Applied';
  tables[DECISIONS] = {};
  const after = await call('GET', '/hq/api/needs', { cookie });
  assert.deepEqual(after.body.items.map((i: any) => i.key).sort(), ['ask:1', 'ask:2', 'signups']);
  assert.equal(writes.length, 0, 'Needs you never writes Airtable');
});

test('asks: addAsk dedupes, validates links; done and snooze routes; CSRF', { skip }, async () => {
  const a = await addAsk(db, { agent: 'Atlas', title: 'Reply to Pete about Twenty West' });
  const b = await addAsk(db, { agent: 'atlas', title: 'Reply to Pete about Twenty West', why: 'changed' });
  assert.deepEqual([a.created, b.created, b.ask.id, b.ask.why], [true, false, a.ask.id, ''], 'same agent + title = the same ask, unchanged');
  const c = await addAsk(db, { agent: 'Atlas', title: 'Reply to Pete about Twenty West', dedupeKey: 'pete:2' });
  assert.equal(c.created, true, 'another key is another ask');
  assert.equal((await db.query(`SELECT count(*)::int AS n FROM hq_asks`)).rows[0].n, 2);
  for (const bad of ['javascript:alert(1)', 'http://example.com', '//evil.example/x', 'data:text/html,x', 'https://', 'decisions/ Replies']) {
    await assert.rejects(addAsk(db, { agent: 'Atlas', title: `bad ${bad}`, actionUrl: bad }), /action link/, bad);
  }
  assert.equal(cleanActionUrl('#/decisions/Replies'), 'decisions/Replies');
  assert.equal(cleanActionUrl('/users'), 'users');
  assert.equal(cleanActionUrl('https://console.cloud.google.com/apis'), 'https://console.cloud.google.com/apis');
  await assert.rejects(addAsk(db, { agent: 'Atlas', title: '' }), /title/);
  await assert.rejects(addAsk(db, { agent: '<b>', title: 'x' }), /agent/);
  assert.equal((await addAsk(db, { agent: 'Ledger', title: 'Approve the card', audience: 'everyone' })).ask.audience, 'owner', 'money stays owner-only');
  // Dedupe survives done: the same key does not come back.
  const { cookie } = await login();
  assert.equal((await call('POST', `/hq/api/asks/${a.ask.id}/done`, { body: {}, origin: 'https://evil.example', cookie })).status, 403, 'CSRF');
  assert.equal((await call('POST', `/hq/api/asks/${a.ask.id}/done`, { body: {}, cookie })).status, 200);
  assert.equal((await call('POST', `/hq/api/asks/${a.ask.id}/done`, { body: {}, cookie })).status, 409, 'already done');
  assert.equal((await db.query(`SELECT done_by FROM hq_asks WHERE id=$1`, [a.ask.id])).rows[0].done_by, 'Alex');
  assert.equal((await addAsk(db, { agent: 'Atlas', title: 'Reply to Pete about Twenty West' })).created, false);
  assert.ok(!(await call('GET', '/hq/api/needs', { cookie })).body.items.some((i: any) => i.key === `ask:${a.ask.id}`), 'done = gone');
  assert.equal((await call('POST', '/hq/api/asks/999/done', { body: {}, cookie })).status, 404);
});

test('snooze: tomorrow = 24 h, monday = next Monday 8:00 New York; hidden until then', { skip }, async () => {
  const x = (await addAsk(db, { agent: 'Echo', title: 'Check the reply rules' })).ask;
  const y = (await addAsk(db, { agent: 'Echo', title: 'Read the new script' })).ask;
  tables[ISSUES] = { recISSUE000000001: { [IF.title]: 'Key expired', [IF.status]: 'Waiting for Alex', [IF.fixType]: 'Manual (Alex)' } };
  const { cookie } = await login();
  assert.equal((await call('POST', `/hq/api/asks/${x.id}/snooze`, { body: { until: 'someday' }, cookie })).status, 400);
  const t = await call('POST', `/hq/api/asks/${x.id}/snooze`, { body: { until: 'tomorrow' }, cookie });
  assert.equal(t.status, 200);
  assert.ok(Math.abs(Date.parse(t.body.until) - Date.now() - 86_400_000) < 60_000);
  const m = await call('POST', `/hq/api/asks/${y.id}/snooze`, { body: { until: 'monday' }, cookie });
  const mon = new Date(m.body.until);
  assert.equal(mon.toLocaleDateString('en-US', { timeZone: 'America/New_York', weekday: 'long' }), 'Monday');
  assert.equal(mon.toLocaleTimeString('en-US', { timeZone: 'America/New_York', hour: 'numeric', minute: '2-digit' }), '8:00 AM');
  assert.ok(mon.getTime() > Date.now() && mon.getTime() - Date.now() <= 8 * 86_400_000);
  assert.equal((await call('POST', '/hq/api/needs/issue/recISSUE000000001/snooze', { body: { until: 'tomorrow' }, cookie })).status, 200);
  let keys = (await call('GET', '/hq/api/needs', { cookie })).body.items.map((i: any) => i.key);
  assert.deepEqual(keys, [], 'both asks and the issue are quiet');
  // When the snooze ends they come back.
  await db.query(`UPDATE hq_asks SET snoozed_until = now() - interval '1 minute'`);
  await db.query(`UPDATE hq_needs_quiet SET quiet_until = now() - interval '1 minute'`);
  keys = (await call('GET', '/hq/api/needs', { cookie })).body.items.map((i: any) => i.key).sort();
  assert.deepEqual(keys, [`ask:${x.id}`, `ask:${y.id}`, 'issue:recISSUE000000001']);
  assert.equal((await call('POST', `/hq/api/asks/${x.id}/done`, { body: {}, cookie })).status, 200);
  assert.equal((await call('POST', `/hq/api/asks/${x.id}/snooze`, { body: { until: 'tomorrow' }, cookie })).status, 409, 'a done ask cannot be snoozed');
});

// ---------- Inbox (Step 3) and the AI replier settings ----------
const H = (n: number) => new Date(Date.now() - n * 3_600_000).toISOString();
const thread = (over: Record<string, unknown> = {}) => ({
  [EF.leadName]: 'Jane Roe', [EF.leadEmail]: 'jane@acme.com', [EF.company]: 'Acme', [EF.subject]: 'Leads', [EF.latestReply]: 'Can you do Tuesday?\n\nOn Mon, Nov 23 Alex wrote:\n> hi',
  [EF.latestReplyAt]: H(2), [EF.lastSent]: 'Last Email Sent By Prospect', [EF.leadStatus]: 'Interested', [EF.workspace]: '1', [EF.replyUuid]: 'uuid-1',
  [RA.state]: 'Needs Approval', [RA.intent]: 'Meeting Request', [RA.draft]: 'Hi Jane,\n\nTue 2pm or Wed 10am ET?', [RA.humanAction]: 'None', [RA.clients]: ['recWSDULCY0000001'],
  [RA.policy]: JSON.stringify({ agent: 'sean', they_said: 'Asked for Tuesday', calendarEvidence: { times: ['Tue, Dec 1, 2:00 PM EST', 'Wed, Dec 2, 10:00 AM EST'], link: '' } }),
  ...over,
});
function inboxTables() {
  tables[WORKSPACES] = {
    recWSDULCY0000001: { ID: '1', Name: 'Dulcy', Status: 'Active' },
    recWSTWMINT000001: { ID: '2', Name: 'Twenty West Media (Internal)', Status: 'Active' },
    recWSTWM000000001: { ID: '3', Name: 'Twenty West Media', Status: 'Inactive' },
  };
  tables[EMAILS] = {
    recEMAIL000000001: thread(),
    recEMAIL000000002: thread({ [EF.leadName]: 'Bob', [RA.clients]: ['recWSTWMINT000001'], [EF.workspace]: '2', [RA.draft]: 'Grab a time: https://calendly.com/ryan/x', [EF.latestReplyAt]: H(1), [RA.policy]: JSON.stringify({ kind: 'followup', followupNumber: 2, followupType: 'No Response', calendarEvidence: { times: [], link: 'https://calendly.com/ryan/x' } }) }),
    recEMAIL000000003: thread({ [RA.state]: 'Scheduled', [EF.lastSent]: 'Last Email Sent By Dulcy', [RA.dueAt]: '2026-12-01T15:00:00.000Z', [RA.clients]: ['recWSTWM000000001'], [EF.workspace]: '3' }),
    recEMAIL000000004: thread({ [RA.state]: 'Sent', [EF.stage]: 'Booked Meeting', [XF.meetingBookedAt]: H(5) }),
    recEMAIL000000005: thread({ [RA.state]: 'Sent', [EF.clientHandling]: true }),
    recEMAIL000000006: thread({ [RA.state]: 'Skipped' }),
    recEMAIL000000007: thread({ [RA.state]: 'Sent' }), // in no tab
  };
}

test('inbox: tabs, one-line "they said", booking links, quoted history, latest first', () => {
  assert.equal(tabOf(thread()), 'approve');
  assert.equal(tabOf(thread({ [RA.state]: 'Scheduled', [EF.lastSent]: 'Last Email Sent By Dulcy' })), 'waiting');
  assert.equal(tabOf(thread({ [RA.state]: 'Scheduled', [EF.lastSent]: 'Last Email Sent By Prospect' })), null, 'they wrote since: not waiting on them');
  assert.equal(tabOf(thread({ [RA.state]: 'Sent', [EF.stage]: 'Completed Meeting' })), 'booked');
  assert.equal(tabOf(thread({ [RA.state]: 'Sent', [RA.ownership]: 'Handoff' })), 'handed');
  assert.equal(tabOf(thread({ [RA.state]: 'Needs Approval', [EF.stage]: 'Booked Meeting' })), 'approve', 'a draft to approve always shows in To approve');
  assert.equal(oneLine('Sounds good, [our site](https://x.com)  works.\nOn Tue, Nov 24 Alex <a@b.c>\nwrote:\n> old'), 'Sounds good, our site works.');
  assert.deepEqual(bookingLinks('Pick one: https://calendly.com/x/y. Or https://cal.com/a/b'), ['https://calendly.com/x/y', 'https://cal.com/a/b']);
  assert.deepEqual(bookingLinks('Tue 2pm or Wed 10am?'), []);
  assert.deepEqual(bookingLinks('See https://book.example.com/me', 'https://book.example.com/me'), ['https://book.example.com/me'], 'the saved booking link counts too');
  const h = 'Reply:\n\nHi Alex,\nTuesday works.\n\nOn Tue, Jul 15, 2025 at 7:09 AM Alexander Woung \nwrote:\n\n│ Earlier text\n\n▃▃▃▃▃▃▃▃▃▃▃▃\n\nReply:\n\n▃▃▃▃▃▃▃▃▃▃▃▃\n\nSENT:\n\nGreat, invite sent.\n\n▃▃▃▃▃▃▃▃▃▃▃▃';
  const msgs = parseHistory(h);
  assert.deepEqual(msgs.map((m) => [m.who, m.body]), [['us', 'Great, invite sent.'], ['them', 'Hi Alex,\nTuesday works.']], 'latest first, empty blocks dropped');
  assert.match(msgs[1].quoted, /^On Tue, Jul 15/);
  const h2 = 'Amber Pratt amber@x.com · Received Nov 17, 2026, 5:14 PM UTC\n\nOut until Nov 23.';
  assert.deepEqual(parseHistory(h2).map((m) => [m.who, m.head, m.body]), [['them', 'Amber Pratt amber@x.com · Received Nov 17, 2026, 5:14 PM UTC', 'Out until Nov 23.']]);
  assert.deepEqual(parseHistory(''), []);
});

test('inbox API: counts per tab, client chips and filter, follow-up dates, notes, pages, cache', { skip }, async () => {
  inboxTables();
  assert.equal((await call('GET', '/hq/api/inbox')).status, 401, 'needs a session');
  const { cookie } = await login();
  const r = await call('GET', '/hq/api/inbox', { cookie });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.deepEqual(r.body.counts, { approve: 2, waiting: 1, booked: 1, handed: 1, skipped: 1 });
  assert.equal(r.body.tab, 'approve');
  assert.deepEqual(r.body.rows.map((x: any) => x.id), ['recEMAIL000000002', 'recEMAIL000000001'], 'newest first');
  const [bob, jane] = r.body.rows;
  assert.deepEqual([jane.prospect, jane.company, jane.client, jane.clientKey, jane.intent, jane.theySaid, jane.bookingLink], ['Jane Roe', 'Acme', 'Dulcy', 'dulcy', 'Meeting Request', 'Asked for Tuesday', false]);
  assert.deepEqual([bob.client, bob.clientKey, bob.followup, bob.bookingLink], ['Twenty West', 'twentywestmedia', 2, true]);
  assert.deepEqual(r.body.clients.map((c: any) => [c.key, c.count]), [['dulcy', 1], ['twentywestmedia', 1]]);
  assert.match(r.body.notes[0].problem, /^1 of 2 drafts offer a booking link/);
  assert.equal(r.body.notes[0].data, 'Twenty West 1');
  const tw = await call('GET', '/hq/api/inbox?client=twentywestmedia', { cookie });
  assert.deepEqual(tw.body.rows.map((x: any) => x.id), ['recEMAIL000000002']);
  assert.deepEqual(tw.body.counts, { approve: 1, waiting: 1, booked: 0, handed: 0, skipped: 0 }, 'both Twenty West workspaces are one client');
  const w = await call('GET', '/hq/api/inbox?tab=waiting', { cookie });
  assert.equal(w.body.rows[0].nextFollowUp, '2026-12-01T15:00:00.000Z');
  assert.equal((await call('GET', '/hq/api/inbox?tab=booked', { cookie })).body.rows[0].id, 'recEMAIL000000004');
  assert.equal((await call('GET', '/hq/api/inbox?tab=handed', { cookie })).body.rows[0].id, 'recEMAIL000000005');
  assert.equal((await call('GET', '/hq/api/inbox?tab=skipped', { cookie })).body.rows[0].id, 'recEMAIL000000006');
  assert.equal((await call('GET', '/hq/api/inbox?tab=approve&q=bob', { cookie })).body.total, 1, 'search');
  // 60-second cache: new rows show only once the copy is re-read.
  for (let i = 10; i < 70; i++) tables[EMAILS][`recEMAILP${String(i).padStart(8, '0')}`] = thread({ [EF.latestReplyAt]: H(100 + i) });
  assert.equal((await call('GET', '/hq/api/inbox', { cookie })).body.counts.approve, 2, 'cached');
  _resetInboxCache();
  const p1 = await call('GET', '/hq/api/inbox', { cookie });
  assert.deepEqual([p1.body.total, p1.body.pages, p1.body.rows.length], [62, 2, 50]);
  const p2 = await call('GET', '/hq/api/inbox?page=2', { cookie });
  assert.equal(p2.body.rows.length, 12);
});

test('inbox thread: conversation, reason + draft, offered times, booking-link warning, EmailBison link', { skip }, async () => {
  inboxTables();
  tables[EMAILS].recEMAIL000000001[EF.history] = 'SENT:\n\nHi Jane, worth a chat?\n\n▃▃▃▃▃▃▃▃▃▃▃▃\n\nReply:\n\nCan you do Tuesday?\n\nOn Mon, Nov 23 Alex wrote:\n> hi\n\n▃▃▃▃▃▃▃▃▃▃▃▃';
  tables[EMAILS].recEMAIL000000001[RA.seanReason] = 'She asked for a time.';
  const { cookie } = await login();
  const t = (await call('GET', '/hq/api/inbox/recEMAIL000000001', { cookie })).body;
  assert.equal(t.latest.startsWith('Can you do Tuesday?'), true);
  assert.deepEqual(t.messages.map((m: any) => [m.who, m.body]), [['us', 'Hi Jane, worth a chat?']], 'the latest message is shown once, on top');
  assert.equal(t.reason, 'She asked for a time.');
  assert.deepEqual(t.offeredTimes, ['Tue, Dec 1, 2:00 PM EST', 'Wed, Dec 2, 10:00 AM EST']);
  assert.deepEqual(t.bookingLinks, []);
  assert.equal(t.threadUrl, 'https://send.dulcy.io/inbox?reply_uuid=uuid-1');
  assert.equal(t.canAct, true);
  const b = (await call('GET', '/hq/api/inbox/recEMAIL000000002', { cookie })).body;
  assert.deepEqual(b.bookingLinks, ['https://calendly.com/ryan/x']);
  assert.equal(b.notes[0].problem, 'Booking link instead of two times', 'a warning, not a block');
  assert.equal((await call('GET', '/hq/api/inbox/recNOPE0000000001', { cookie })).status, 404);
});

test('inbox Send / Send edited / Skip: the same writes as the Decisions reply card', { skip }, async () => {
  const strip = () => writes.map((w) => ({ table: w.table, id: w.id, fields: { ...w.fields, [DF.decidedAt]: w.fields[DF.decidedAt] ? 'set' : undefined } }));
  const run = async (path: string, verdict: string, text?: string) => {
    tables = {}; writes = []; _resetInboxCache(); inboxTables();
    tables[DECISIONS] = { recREPLY000000001: decision({ [DF.fix]: 'Hi Jane,\n\nTue 2pm or Wed 10am ET?' }) };
    const { cookie } = await login();
    const r = await call('POST', path, { body: { verdict, ...(text ? { text } : {}) }, cookie });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    return strip();
  };
  for (const [verdict, text] of [['approve'], ['edited', 'Hi Jane,\n\nThursday 3pm?'], ['edited', 'Hi Jane,\n\nTue 2pm or Wed 10am ET?'], ['reject']] as [string, string?][]) {
    const a = await run('/hq/api/decisions/recREPLY000000001', verdict, text);
    const b = await run('/hq/api/inbox/recEMAIL000000001', verdict, text);
    assert.deepEqual(b, a, `${verdict}${text ? ' (text)' : ''}: identical writes`);
    assert.equal(a[0].table, EMAILS);
  }
  // No Echo decision: only the Emails row's button (what the Airtable Reply Queue presses).
  tables = {}; writes = []; _resetInboxCache(); inboxTables();
  const { cookie } = await login();
  assert.equal((await call('POST', '/hq/api/inbox/recEMAIL000000001', { body: { verdict: 'edited', text: 'Hi Jane, Thu?' }, cookie })).status, 200);
  assert.deepEqual(writes, [{ table: EMAILS, id: 'recEMAIL000000001', fields: { [RA.customReply]: 'Hi Jane, Thu?', [RA.humanAction]: 'Send Edited Reply' } }]);
  assert.equal((await call('POST', '/hq/api/inbox/recEMAIL000000001', { body: { verdict: 'approve' }, cookie })).status, 409, 'already pressed');
  assert.equal((await call('POST', '/hq/api/inbox/recEMAIL000000006', { body: { verdict: 'approve' }, cookie })).status, 409, 'not waiting for approval');
  assert.equal((await call('POST', '/hq/api/inbox/recEMAIL000000002', { body: { verdict: 'edited', text: ' ' }, cookie })).status, 400);
  assert.equal((await call('POST', '/hq/api/inbox/recEMAIL000000002', { body: { verdict: 'maybe' }, cookie })).status, 400);
  assert.equal((await call('POST', '/hq/api/inbox/recEMAIL000000002', { body: { verdict: 'approve' }, cookie, origin: 'https://evil.example' })).status, 403, 'CSRF');
  // A "need your input" decision (no Approve Reply action): Emails button, then the decision is marked.
  tables[DECISIONS] = { recASK00000000001: decision({ [DF.action]: 'None', [DF.emailsRecord]: 'recEMAIL000000002', [DF.title]: 'Need your input: reply to Bob' }) };
  writes = [];
  assert.equal((await call('POST', '/hq/api/inbox/recEMAIL000000002', { body: { verdict: 'edited', text: 'Hi Bob, Tue 2pm or Wed 10am?' }, cookie })).status, 200);
  assert.deepEqual(writes.map((w) => w.table), [EMAILS, DECISIONS]);
  assert.equal(tables[DECISIONS].recASK00000000001[DF.status], 'Approved');
  assert.equal(tables[DECISIONS].recASK00000000001[DF.decidedBy], 'Alex');
  const row = (await call('GET', '/hq/api/inbox', { cookie })).body.rows.find((x: any) => x.id === 'recEMAIL000000002');
  assert.equal(row.pressed, 'Send Edited Reply', 'the list shows the press at once');
});

const settingsRow = (over: Record<string, unknown> = {}) => ({
  [SF.wsRec]: 'recWSTWMINT000001', [SF.wsName]: 'Twenty West Media (Internal)', [SF.enabled]: true, [SF.handoff]: 'Disabled', [SF.defaultMode]: 'Approval Required',
  [SF.oooMode]: 'Approval Required', [SF.minConfidence]: 0.92, [SF.maxAuto]: 3, [SF.tone]: 'Warm', [SF.length]: 'Brief', [SF.timezone]: 'America/New_York',
  [SF.officeStart]: '09:00', [SF.officeEnd]: '18:00', [SF.calendarLink]: 'https://calendly.com/ryan/x', [SF.calProvider]: 'Not Connected', [SF.calStatus]: 'Not Connected',
  [SF.calJson]: JSON.stringify({ disableTimes: true, disableLinks: false, connectionStatus: 'not_connected' }), ...over,
});

test('AI replier: validation (HH:MM, IANA timezone, percent 0-100, known types), only changes written', () => {
  const cur = valuesOf(settingsRow());
  assert.equal(cur.minConfidence, 92, 'Airtable percent → 0-100');
  for (const [input, msg] of [
    [{ officeStart: '9am' }, /HH:MM/], [{ officeStart: '24:00' }, /HH:MM/], [{ officeStart: '19:00' }, /after office start/],
    [{ timezone: 'Mars/Base' }, /IANA/], [{ timezone: 'EST5EDT; drop' }, /IANA/], [{ minConfidence: 101 }, /0 to 100/], [{ minConfidence: '90' }, /0 to 100/],
    [{ maxAuto: 2.5 }, /whole number/], [{ replyTypes: ['Interested', 'Spam'] }, /only these types/], [{ defaultMode: 'YOLO' }, /one of/],
    [{ enabled: 'yes' }, /on or off/], [{ companyUrl: 'javascript:alert(1)' }, /https/], [{ secret: 1 }, /unknown setting/], [[], /object/],
  ] as [unknown, RegExp][]) {
    const r = validateSave(input, cur);
    assert.ok('error' in r && msg.test(r.error), `${JSON.stringify(input)} → ${JSON.stringify(r)}`);
  }
  assert.equal(isTimezone('Europe/London'), true);
  const ok = validateSave({ minConfidence: 95, officeEnd: '17:30', tone: 'Warm', replyTypes: ['Out of Office', 'Interested'], timezone: 'Europe/London' }, cur);
  assert.ok(!('error' in ok));
  assert.deepEqual(ok.fields, { [SF.minConfidence]: 0.95, [SF.replyTypes]: ['Interested', 'Out of Office'], [SF.timezone]: 'Europe/London', [SF.officeEnd]: '17:30' }, 'unchanged tone not written');
  assert.deepEqual(ok.changes.map((c) => c.field), ['Enabled Reply Types', 'Minimum Auto Confidence', 'Timezone', 'Office End']);
});

test('AI replier API: owner reads and saves (logged), member reads only (403 on save), calendar link off without a token', { skip }, async () => {
  inboxTables();
  tables[SETTINGS] = { recSET00000000001: settingsRow() };
  const { cookie } = await login();
  const g = await call('GET', '/hq/api/clients/recWSTWMINT000001/replier', { cookie });
  assert.equal(g.status, 200, JSON.stringify(g.body));
  assert.equal(g.body.found, true);
  assert.equal(g.body.canEdit, true);
  assert.equal(g.body.values.officeEnd, '18:00');
  assert.equal(g.body.summaries.calendar.timesOff, true);
  assert.match(g.body.notes[0].problem, /can't offer two times/);
  assert.deepEqual(g.body.invite, { ready: false, why: 'Needs CALENDAR_ADMIN_TOKEN on the server', provider: 'google', email: '' });
  assert.equal((await call('GET', '/hq/api/clients/recWSTWM000000001/replier', { cookie })).body.rowId, 'recSET00000000001', 'either workspace of the client');

  assert.equal((await call('POST', '/hq/api/clients/recWSTWMINT000001/replier', { body: { values: { officeStart: '25:00' } }, cookie })).status, 400);
  writes = [];
  const s = await call('POST', '/hq/api/clients/recWSTWMINT000001/replier', { body: { values: { officeStart: '08:30', nudge: true, firstName: 'Ryan' } }, cookie });
  assert.equal(s.status, 200, JSON.stringify(s.body));
  assert.equal(writes.length, 1);
  assert.equal(writes[0].table, SETTINGS);
  const { [SF.lastUpdated]: stamp, ...fields } = writes[0].fields;
  assert.ok(stamp);
  assert.deepEqual(fields, { [SF.nudge]: true, [SF.firstName]: 'Ryan', [SF.officeStart]: '08:30' }, 'by field ID, only the changes');
  const logged = (await db.query(`SELECT actor, action, ws_rec, changes FROM hq_settings_log`)).rows;
  assert.deepEqual(logged.map((x) => [x.actor, x.action, x.ws_rec, x.changes.length]), [['Alex', 'save', 'recWSTWMINT000001', 3]]);
  assert.equal((await call('GET', '/hq/api/clients/recWSTWMINT000001/replier', { cookie })).body.history[0].changes[0].field, 'Not Interested Nudge');
  const none = await call('POST', '/hq/api/clients/recWSTWMINT000001/replier', { body: { values: { officeStart: '08:30' } }, cookie });
  assert.deepEqual(none.body.changes, [], 'no change, no write');
  const inv = await call('POST', '/hq/api/clients/recWSTWMINT000001/calendar-invite', { body: { provider: 'google', email: 'ryan@twm.com' }, cookie });
  assert.deepEqual([inv.status, inv.body.error], [503, 'Needs CALENDAR_ADMIN_TOKEN on the server']);

  await upsertUser(db, 'josh@dulcy.io', 'member', 'josh long password 1', 'Josh');
  const j = await login('josh@dulcy.io', 'josh long password 1');
  const mg = await call('GET', '/hq/api/clients/recWSTWMINT000001/replier', { cookie: j.cookie });
  assert.deepEqual([mg.status, mg.body.canEdit, mg.body.invite.ready], [200, false, false], 'members read');
  writes = [];
  assert.equal((await call('POST', '/hq/api/clients/recWSTWMINT000001/replier', { body: { values: { nudge: false } }, cookie: j.cookie })).status, 403);
  assert.equal((await call('POST', '/hq/api/clients/recWSTWMINT000001/calendar-invite', { body: { provider: 'google', email: 'a@b.co' }, cookie: j.cookie })).status, 403);
  assert.equal(writes.length, 0);
  assert.equal((await call('GET', '/hq/api/clients/recNOPE0000000001/replier', { cookie })).status, 404);
});

test('calendar link: with a token, asks the calendar service for a one-time link and keeps a copy in Airtable', { skip }, async () => {
  inboxTables();
  tables[SETTINGS] = { recSET00000000001: settingsRow() };
  const sent: { url: string; auth: string; body: any }[] = [];
  const fetchImpl = (async (u: string, init: any) => { sent.push({ url: u, auth: init.headers.authorization, body: JSON.parse(init.body) }); return new Response(JSON.stringify({ url: 'https://n8n.dulcy.io/calendar/connect?ticket=abc', expiresAt: '2026-11-27T00:00:00.000Z' }), { status: 200 }); }) as unknown as typeof fetch;
  const c = cfg({ calendarAdminToken: 't'.repeat(40), calendarUrl: 'http://cal:8789/' });
  const ctx = { db, cfg: c, at: at as any, fetchImpl };
  assert.equal((await calendarInvite(ctx, 'recWSTWMINT000001', 'Alex', { provider: 'outlook', email: 'a@b.co' })).status, 400);
  assert.equal((await calendarInvite(ctx, 'recWSTWMINT000001', 'Alex', { provider: 'google', email: 'nope' })).status, 400);
  const r = await calendarInvite(ctx, 'recWSTWMINT000001', 'Alex', { provider: 'google', email: 'Ryan@TWM.com' });
  assert.deepEqual(r, { status: 200, url: 'https://n8n.dulcy.io/calendar/connect?ticket=abc', expiresAt: '2026-11-27T00:00:00.000Z', email: 'ryan@twm.com' });
  assert.equal(sent[0].url, 'http://cal:8789/calendar/admin/request-invite');
  assert.equal(sent[0].auth, `Bearer ${'t'.repeat(40)}`);
  assert.deepEqual({ ...sent[0].body, requestId: /^[A-Za-z0-9_-]{12,100}$/.test(sent[0].body.requestId) }, { workspace: 'recWSTWMINT000001', requestId: true, provider: 'google', expectedEmail: 'ryan@twm.com', label: 'Twenty West Media' });
  assert.equal(JSON.parse(String(tables[SETTINGS].recSET00000000001[SF.calResult])).status, 'Ready');
  assert.equal((await db.query(`SELECT action FROM hq_settings_log`)).rows[0].action, 'calendar_invite');
  const bad = (async () => new Response(JSON.stringify({ error: 'Provider application registration is required' }), { status: 500 })) as unknown as typeof fetch;
  const no = await calendarInvite({ ...ctx, fetchImpl: bad }, 'recWSTWMINT000001', 'Alex', { provider: 'calendly', email: 'a@b.co' });
  assert.deepEqual([no.status, no.error], [502, 'The calendar service said no: Provider application registration is required']);
});

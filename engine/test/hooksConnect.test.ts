// hooks connect (Alex 2026-11-28: "all the tools should be connected to the agents", no long manual setup).
// Fake EmailBison, Close, n8n and Airtable (nothing live is called): the dry run changes nothing; --yes adds one
// webhook per EmailBison workspace, the Close subscription (key stored sealed), the n8n credential and error
// workflow, and Decision cards whose n8nPatch is valid against the real 2026-11-17 workflows; a second run adds
// nothing; no secret is ever printed, logged, returned or written to Airtable; Riley's engine-credential rule.
import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { AddressInfo } from 'node:net';
import { createPool, migrate, type Db } from '../src/db/pool.js';
import { loadConfig, type Config } from '../src/config.js';
import { createServer } from '../src/http.js';
import { hooksConnect, HOOK_TARGETS, BISON_EVENTS, ERROR_WORKFLOW_NAME, targetPatch } from '../src/instant/connect.js';
import { checkProviderSecret, ensureSharedSecret, hookRow, openSecret, refreshHookSecrets, sealSecret, secretFor, storeProviderSecret, _resetHookLookups } from '../src/instant/secrets.js';
import { isInstant } from '../src/instant/jobs.js';
import { connectionsView } from '../src/hq/connections.js';
import { ISSUES, IF } from '../src/agents/riley.js';
import { DECISIONS, DF } from '../src/decisions/fields.js';
import { ENGINE_CREDENTIAL_NAME, findN8nPatch, patchState, planN8nPatch, rollbackSettings, validateN8nPatch, type N8nPatch } from '../src/agents/rileyN8n.js';

const url = process.env.TEST_DATABASE_URL;
const skip = !url ? 'TEST_DATABASE_URL not set' : false;
const SNAP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../automations/n8n-live-2026-11-17/workflows');
const SHARED_ERR = 'NtpwlzuP2tuJM6OC5U_m9';
const CLOSE_SIG = 'c0ffee'.repeat(10) + 'abcd';
const KEYS = { bisonDulcy: 'bison-key-dulcy-0123456789', bisonAcme: 'bison-key-acme-0123456789', close: 'close-api-key-0123456789', n8n: 'n8n-api-key-0123456789', airtable: 'pat-airtable-0123456789' };

function snapshot(id: string) {
  const f = fs.readdirSync(SNAP).find((n) => n.endsWith(`--${id}.json`));
  assert.ok(f, `snapshot of ${id}`);
  return JSON.parse(fs.readFileSync(path.join(SNAP, f), 'utf8'));
}

// ---------- fakes ----------
let hooks: Record<number, { id: number; name: string; url: string; events: string[] }[]> = {};
let closeSubs: { id: string; url: string; status: string; events: unknown[] }[] = [];
let wfs: Record<string, any> = {};
let creds: { id: string; name: string; type: string; data: any }[] = [];
let calls: { method: string; url: string; body?: any }[] = [];
let n8nNoCredList = false;
let team = 0; let nextId = 100;

const fakeFetch: typeof fetch = async (input, init) => {
  const u = new URL(String(input)); const method = (init?.method ?? 'GET').toUpperCase();
  const body = typeof init?.body === 'string' && init.body ? JSON.parse(init.body) : undefined;
  calls.push({ method, url: u.toString(), body });
  const h = (init?.headers ?? {}) as Record<string, string>;
  const json = (status: number, b: unknown) => new Response(JSON.stringify(b), { status, headers: { 'content-type': 'application/json' } });
  if (u.host === 'bison.test') {
    const key = String(h.authorization ?? '').replace('Bearer ', '');
    if (![KEYS.bisonDulcy, KEYS.bisonAcme].includes(key)) return json(401, { message: 'bad key' });
    if (u.pathname === '/api/workspaces/switch-workspace') { team = body.team_id; return json(200, { data: { ok: true } }); }
    const list = (hooks[team] ??= []);
    if (u.pathname === '/api/webhook-url' && method === 'GET') return json(200, { data: list, meta: { last_page: 1 } });
    if (u.pathname === '/api/webhook-url' && method === 'POST') { const w = { id: nextId++, name: body.name, url: body.url, events: body.events }; list.push(w); return json(201, { data: w }); }
    const m = /^\/api\/webhook-url\/(\d+)$/.exec(u.pathname);
    if (m && method === 'PUT') { const w = list.find((x) => x.id === Number(m[1]))!; Object.assign(w, body); return json(200, { data: w }); }
    return json(404, {});
  }
  if (u.host === 'api.close.com') {
    assert.equal(h.authorization, `Basic ${Buffer.from(`${KEYS.close}:`).toString('base64')}`);
    if (u.pathname === '/api/v1/webhook/' && method === 'GET') return json(200, { data: closeSubs, has_more: false });
    if (u.pathname === '/api/v1/webhook/' && method === 'POST') { const w = { id: `whsub_${nextId++}`, url: body.url, status: 'active', events: body.events }; closeSubs.push(w); return json(200, { ...w, signature_key: CLOSE_SIG }); }
    const m = /^\/api\/v1\/webhook\/([\w]+)\/$/.exec(u.pathname);
    if (m && method === 'DELETE') { closeSubs = closeSubs.filter((w) => w.id !== m[1]); return json(200, {}); }
    return json(404, {});
  }
  if (u.host === 'n8n.test') {
    assert.equal(h['X-N8N-API-KEY'], KEYS.n8n);
    if (u.pathname === '/api/v1/workflows' && method === 'GET') return json(200, { data: Object.values(wfs), nextCursor: null });
    if (u.pathname === '/api/v1/workflows' && method === 'POST') { const id = `engErr${nextId++}`; wfs[id] = { ...body, id, active: false }; return json(200, wfs[id]); }
    if (u.pathname === '/api/v1/credentials' && method === 'GET') return n8nNoCredList ? json(405, {}) : json(200, { data: creds.map(({ id, name, type }) => ({ id, name, type })) });
    if (u.pathname === '/api/v1/credentials' && method === 'POST') { const c = { id: `cred${nextId++}`, ...body }; creds.push(c); return json(200, { id: c.id, name: c.name, type: c.type }); }
    return json(404, {});
  }
  throw new Error(`unexpected call ${method} ${u}`);
};

let tables: Record<string, Record<string, Record<string, unknown>>> = {};
let atWrites = 0;
const fakeAirtable = {
  async list(table: string, formula: string) {
    const rows = Object.entries(tables[table] ?? {});
    const sig = /LEFT\(\{Signature\}, \d+\)='([^']+)'/.exec(formula)?.[1];
    return rows.filter(([, f]) => !sig || String(f[IF.signature] ?? '').startsWith(sig)).map(([id, fields]) => ({ id, fields }));
  },
  async create(table: string, fields: Record<string, unknown>) { atWrites++; const id = `rec${String(nextId++).padStart(14, '0')}`; (tables[table] ??= {})[id] = { ...fields }; return id; },
  async update(table: string, id: string, fields: Record<string, unknown>) { atWrites++; Object.assign(((tables[table] ??= {})[id] ??= {}), fields); },
};

const ENV = {
  ENGINE_SECRET: 'e'.repeat(40), DATABASE_URL: url ?? 'postgres://x', ENGINE_PUBLIC_URL: 'https://engine.example.test',
  EMAILBISON_BASE_URL: 'http://bison.test', EMAILBISON_KEY_DULCY: KEYS.bisonDulcy, EMAILBISON_TEAM_DULCY: '1', EMAILBISON_KEY_ACME: KEYS.bisonAcme, EMAILBISON_TEAM_ACME: '2',
  CLOSE_API_KEY: KEYS.close, N8N_API_KEY: KEYS.n8n, N8N_BASE_URL: 'http://n8n.test', AIRTABLE_API_KEY: KEYS.airtable, HQ_HOST: 'hq.example.test', PORTAL_HOST: 'portal.example.test',
  SEAN: 'on', BOUNCE_CHECK: 'on', BOUNCE_CHECK_WORKSPACES: 'all', RILEY: 'on', ACCOUNT_HEALTH: 'on',
};
const conf = (env: Record<string, string> = {}): Config => loadConfig({ ...ENV, ...env } as NodeJS.ProcessEnv);

let db: Db;
before(async () => { if (skip) return; db = createPool(url!); await migrate(db); });
after(async () => { if (!skip) await db.end(); });
beforeEach(async () => {
  hooks = { 1: [{ id: 1, name: 'Slack alerts', url: 'https://hooks.example.test/x', events: ['email_sent'] }] };
  closeSubs = [{ id: 'whsub_other', url: 'https://zapier.example.test/hook', status: 'active', events: [] }];
  wfs = Object.fromEntries(HOOK_TARGETS.map((t) => [t.workflowId, snapshot(t.workflowId)]));
  wfs[SHARED_ERR] = { id: SHARED_ERR, name: '[System] Error handler', active: false, settings: {}, connections: {}, nodes: [{ id: 'e1', name: 'Error Trigger', type: 'n8n-nodes-base.errorTrigger', typeVersion: 1, position: [0, 0], parameters: {} }] };
  wfs.wfNoErr1 = { id: 'wfNoErr1', name: 'Daily sync', active: true, settings: { executionOrder: 'v1' }, connections: {}, nodes: [{ id: 'a', name: 'Schedule', type: 'n8n-nodes-base.scheduleTrigger', typeVersion: 1, position: [0, 0], parameters: {} }] };
  wfs.wfGone1 = { id: 'wfGone1', name: 'Old intake', active: true, settings: { errorWorkflow: 'goneWf123' }, connections: {}, nodes: [{ id: 'a', name: 'Webhook', type: 'n8n-nodes-base.webhook', typeVersion: 2, position: [0, 0], parameters: {} }] };
  wfs.wfOff1 = { id: 'wfOff1', name: 'Switched off', active: false, settings: {}, connections: {}, nodes: [] };
  creds = []; calls = []; tables = {}; atWrites = 0; team = 0; nextId = 100; n8nNoCredList = false;
  _resetHookLookups();
  if (!skip) await db.query('TRUNCATE hook_secrets, hook_events, jobs, steps, receipts, events, job_reruns RESTART IDENTITY CASCADE');
});

/** Every secret and key this test knows about, plus the ones the engine made. */
async function allSecrets(): Promise<string[]> {
  const c = conf();
  const made = await Promise.all(['emailbison', 'n8n', 'close'].map((s) => secretFor(db, c, s as any)));
  return [...Object.values(KEYS), CLOSE_SIG, ...made].filter(Boolean);
}
async function capture<T>(run: () => Promise<T>): Promise<{ value: T; logs: string }> {
  const lines: string[] = []; const o = { log: console.log, error: console.error, warn: console.warn };
  console.log = (...a: unknown[]) => lines.push(a.map(String).join(' ')); console.error = console.log; console.warn = console.log;
  try { return { value: await run(), logs: lines.join('\n') }; } finally { Object.assign(console, o); }
}
const writes = () => calls.filter((c) => c.method !== 'GET' && !c.url.endsWith('/switch-workspace'));

test('secrets: sealed in Postgres (bound to the source), the engine makes its own once, .env wins, provider secrets are shape-checked', { skip }, async () => {
  const c = conf();
  const sealed = sealSecret(c.engineSecret, 'n8n', 'abc-secret-0123456789');
  assert.equal(openSecret(c.engineSecret, 'n8n', sealed), 'abc-secret-0123456789');
  assert.throws(() => openSecret(c.engineSecret, 'make', sealed), 'sealed for another source = refused');
  assert.throws(() => openSecret('z'.repeat(40), 'n8n', sealed), 'another ENGINE_SECRET = refused');
  const a = await ensureSharedSecret(db, c, 'n8n'); const b = await ensureSharedSecret(db, c, 'n8n');
  assert.equal(a.created, true); assert.equal(b.created, false); assert.equal(a.secret, b.secret); assert.ok(a.secret.length >= 40);
  const raw = (await db.query(`SELECT sealed, state FROM hook_secrets WHERE source='n8n'`)).rows[0];
  assert.ok(!raw.sealed.includes(a.secret), 'never stored in clear'); assert.equal(raw.state, 'pending');
  const env = conf({ HOOK_SECRET_MAKE: 'make-from-env-0123456789' });
  assert.deepEqual(await ensureSharedSecret(db, env, 'make'), { secret: 'make-from-env-0123456789', created: false, fromEnv: true });
  assert.match(String(checkProviderSecret('slack', 'not-a-secret')), /Signing Secret/);
  assert.match(String(checkProviderSecret('fathom', 'abc')), /whsec_/);
  assert.equal(checkProviderSecret('close', CLOSE_SIG), null);
  await assert.rejects(storeProviderSecret(db, c, 'slack', 'hello'), (e: Error) => !e.message.includes('hello'), 'the refusal never repeats the value');
});

test('pending secrets are accepted but change no timer; connected ones turn the jobs instant; a first signed event connects', { skip }, async () => {
  const c = conf({ SEAN: 'on' });
  const { secret } = await ensureSharedSecret(db, c, 'n8n');
  await refreshHookSecrets(db, c);
  assert.equal(isInstant(c, 'riley.collect'), false, 'pending: Riley keeps the old timer');
  assert.equal(c.hookPending?.n8n, secret);
  const server = createServer(db, c); await new Promise<void>((r) => server.listen(0, '127.0.0.1', () => r()));
  const port = (server.address() as AddressInfo).port;
  const post = (p: string, b: unknown, h: Record<string, string> = {}) => new Promise<{ status: number; json: any }>((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port, path: p, method: 'POST', headers: { 'content-type': 'application/json', ...h } }, (res) => { let t = ''; res.on('data', (x) => (t += x)); res.on('end', () => resolve({ status: res.statusCode!, json: JSON.parse(t || '{}') })); });
    req.on('error', reject); req.end(JSON.stringify(b));
  });
  try {
    assert.equal((await post('/hooks/n8n', { event: 'reply' }, { 'x-hook-secret': 'wrong-secret-0123456789' })).status, 401);
    assert.equal(isInstant(c, 'riley.collect'), false, 'a refused request connects nothing');
    const ok = await post('/hooks/n8n', { event: 'reply' }, { 'x-hook-secret': secret });
    assert.equal(ok.status, 200);
    assert.ok(!JSON.stringify(ok.json).includes(secret));
    assert.equal((await hookRow(db, 'n8n'))?.state, 'connected');
    assert.equal(isInstant(c, 'riley.collect'), true, 'connected on its first signed event');
    // A secret stored by the CLI (another process) is picked up without a restart.
    _resetHookLookups();
    await storeProviderSecret(db, c, 'fathom', `whsec_${Buffer.from('fathom-test-key-0123456789').toString('base64')}`);
    assert.equal((await post('/hooks/fathom', {}, {})).status, 401, 'the table secret is in force: unsigned = 401, not 404');
    assert.equal((await post('/hooks/make', { event: 'error' }, { 'x-hook-secret': 'x'.repeat(20) })).status, 404, 'no secret anywhere = 404');
  } finally { server.close(); }
});

test('dry run: prints the plan, changes nothing (no provider write, no secret made, no Airtable record), shows no secret', { skip }, async () => {
  const c = conf();
  const { value: r, logs } = await capture(() => hooksConnect(db, c, { fetch: fakeFetch, airtable: fakeAirtable }));
  assert.equal(r.yes, false);
  assert.match(r.text, /dry run: nothing was changed/);
  assert.deepEqual(writes(), [], 'only reads');
  assert.equal(atWrites, 0);
  assert.equal((await db.query('SELECT count(*)::int AS n FROM hook_secrets')).rows[0].n, 0, 'no secret made');
  assert.match(r.text, /emailbison not connected yet \(--yes connects it\)\n  · dulcy: would add the "Dulcy engine" webhook/);
  assert.match(r.text, /12 would become cards/);
  assert.match(r.text, /would create the webhook \(opportunity created \/ updated\)/);
  assert.match(r.text, /would create the Header Auth credential "Dulcy engine hook"/);
  assert.match(r.text, new RegExp(`would create the workflow "${ERROR_WORKFLOW_NAME}"`));
  assert.match(r.text, /Riley: tell the engine about new replies \(Echo starts at once\): 6 workflows/);
  assert.match(r.text, /Riley: send n8n errors to Riley at once: 3 workflows/, 'the shared error workflow forwards; one with none set; one pointing at a workflow that is gone');
  assert.match(r.text, /Alex’s 2 steps:[\s\S]*hooks secret slack[\s\S]*hooks secret fathom/);
  for (const s of await allSecrets()) { assert.ok(!r.text.includes(s), 'no secret in the output'); assert.ok(!logs.includes(s), 'no secret in the logs'); }
});

test('--yes: one webhook per EmailBison workspace, the Close subscription (key sealed), the n8n credential + error workflow, valid cards; a second run adds nothing', { skip }, async () => {
  const c = conf({ LIVE_STAGES: 'riley.apply,riley.n8n_apply' });
  const { value: r, logs } = await capture(() => hooksConnect(db, c, { yes: true, fetch: fakeFetch, airtable: fakeAirtable }));
 
  const bisonSecret = await secretFor(db, c, 'emailbison'), n8nSecret = await secretFor(db, c, 'n8n');
  // EmailBison: ours added in both workspaces, the other webhook untouched.
  for (const t of [1, 2]) {
    const mine = hooks[t].filter((w) => w.name === 'Dulcy engine');
    assert.equal(mine.length, 1);
    assert.equal(mine[0].url, `https://engine.example.test/hooks/emailbison?key=${encodeURIComponent(bisonSecret)}`);
    assert.deepEqual(mine[0].events, BISON_EVENTS);
  }
  assert.deepEqual(hooks[1][0], { id: 1, name: 'Slack alerts', url: 'https://hooks.example.test/x', events: ['email_sent'] });
  assert.equal((await hookRow(db, 'emailbison'))?.state, 'connected');
  // Close: created, key stored sealed and never printed.
  assert.equal(closeSubs.length, 2); assert.equal(closeSubs[1].url, 'https://engine.example.test/hooks/close');
  assert.equal(await secretFor(db, c, 'close'), CLOSE_SIG);
  assert.equal((await hookRow(db, 'close'))?.state, 'connected');
  // n8n: the credential holds the engine's n8n secret; the error workflow is the engine's, inactive.
  assert.deepEqual(creds.map((x) => [x.name, x.type, x.data]), [[ENGINE_CREDENTIAL_NAME, 'httpHeaderAuth', { name: 'x-hook-secret', value: n8nSecret }]]);
  const meta = (await hookRow(db, 'n8n'))!.meta;
  const err = wfs[meta.errorWorkflowId];
  assert.equal(err.name, ERROR_WORKFLOW_NAME); assert.equal(err.active, false);
  assert.equal(err.nodes[1].credentials.httpHeaderAuth.id, meta.credentialId);
  assert.equal((await hookRow(db, 'n8n'))?.state, 'pending', 'n8n is connected only once its cards are live');
  // Cards: 5 Decisions (replies, placement, bounce, sent, errors), each issue's n8nPatch valid against the live workflow.
  const decisions = Object.entries(tables[DECISIONS] ?? {});
  assert.equal(decisions.length, 5);
  const issues = tables[ISSUES];
  assert.equal(Object.keys(issues).length, 6 + 1 + 1 + 1 + 3);
  for (const [, d] of decisions) {
    assert.equal(d[DF.action], 'Apply Riley Fix'); assert.equal(d[DF.agent], 'Riley'); assert.equal(d[DF.status], 'New');
    const input = JSON.parse(String(d[DF.actionInput]));
    const ids: string[] = input.issueIds ?? [input.issueId];
    for (const id of ids) {
      const row = issues[id];
      assert.equal(row[IF.status], 'Waiting for Alex'); assert.equal(row[IF.fixType], 'n8n change');
      const found = findN8nPatch(String(row[IF.details]), '') as { patch: N8nPatch };
      assert.ok(found && 'patch' in found, 'a valid n8nPatch');
      const plan = planN8nPatch(wfs[found.patch.workflowId], found.patch, { engineCredential: { id: meta.credentialId, name: ENGINE_CREDENTIAL_NAME } });
      assert.deepEqual([plan.refused, plan.invalid, plan.mismatches], [[], [], []], String(row[IF.title]));
    }
  }
  const reply = issues[Object.keys(issues).find((k) => String(issues[k][IF.details]).includes('"workflowId":"NwlemmcwCZLCXAmt"'))!];
  const p = (findN8nPatch(String(reply[IF.details]), '') as any).patch as N8nPatch;
  assert.deepEqual(p.changes.filter((x: any) => x.connect).map((x: any) => x.connect.from), ['Create a record', 'Create a record1', 'Create a record2', 'Create a record3'], 'after each node that creates the Emails row');
  // Secrets: nowhere in the output, the logs, Airtable or the HQ answer.
  const hq = JSON.stringify(await connectionsView(db, c));
  const air = JSON.stringify(tables);
  for (const s of await allSecrets()) for (const [where, t] of [['output', r.text], ['logs', logs], ['airtable', air], ['hq', hq]] as const) assert.ok(!t.includes(s), `no secret in ${where}`);
  assert.match(r.text, /Waiting for a card[\s\S]*Riley: tell the engine about bounces/);

  // Second run: nothing new anywhere.
  const before = { w: writes().length, at: atWrites, creds: creds.length, wfs: Object.keys(wfs).length, close: closeSubs.length };
  const again = await hooksConnect(db, c, { yes: true, fetch: fakeFetch, airtable: fakeAirtable });
  assert.equal(writes().length, before.w, 'no provider write'); assert.equal(atWrites, before.at, 'no new card');
  assert.deepEqual([creds.length, Object.keys(wfs).length, closeSubs.length], [before.creds, before.wfs, before.close]);
  assert.match(again.text, /dulcy: already connected/); assert.match(again.text, /close +connected/);
  assert.match(again.text, /12 waiting for Alex’s ✅|waiting for a card/);

  // Riley applies the cards (as riley.apply does) → the next run sees them live and n8n is connected.
  for (const [id, row] of Object.entries(issues)) {
    const patch = (findN8nPatch(String(row[IF.details]), '') as any).patch as N8nPatch;
    wfs[patch.workflowId] = planN8nPatch(wfs[patch.workflowId], patch, { engineCredential: { id: meta.credentialId, name: ENGINE_CREDENTIAL_NAME } }).next;
    issues[id][IF.status] = 'Applied';
  }
  const third = await hooksConnect(db, c, { yes: true, fetch: fakeFetch, airtable: fakeAirtable });
 
  assert.match(third.text, /n8n +connected/);
  assert.equal((await hookRow(db, 'n8n'))?.state, 'connected');
  const view = await connectionsView(db, c);
  assert.deepEqual(Object.fromEntries(view.connections.map((x) => [x.source, x.status])), { emailbison: 'connected', n8n: 'connected', make: 'kept', airtable: 'kept', slack: 'needs_alex', fathom: 'needs_alex', close: 'connected' });
});

test('idempotent on the providers too: the engine’s own webhooks are updated (never duplicated), Close without a stored key is replaced, others untouched', { skip }, async () => {
  const c = conf();
  hooks[2] = [{ id: 7, name: 'Dulcy engine', url: 'https://engine.example.test/hooks/emailbison?key=old', events: ['lead_replied'] }];
  closeSubs.push({ id: 'whsub_mine', url: 'https://engine.example.test/hooks/close', status: 'active', events: [] });
  n8nNoCredList = true;
  await hooksConnect(db, c, { yes: true, fetch: fakeFetch, airtable: null });
  assert.equal(hooks[2].length, 1, 'updated, not added');
  assert.ok(hooks[2][0].url.endsWith(encodeURIComponent(await secretFor(db, c, 'emailbison'))));
  assert.deepEqual([...hooks[2][0].events].sort(), [...BISON_EVENTS].sort());
  assert.deepEqual(closeSubs.map((w) => w.id).filter((x) => x !== 'whsub_mine').length, 2, 'the other subscription stays; ours is replaced');
  assert.ok(!closeSubs.some((w) => w.id === 'whsub_mine'));
  const r = await hooksConnect(db, c, { yes: true, fetch: fakeFetch, airtable: null });
  assert.match(r.text, /no AIRTABLE_API_KEY on the server: not asked/);
  assert.equal(creds.length, 1, 'n8n without a credential list: the stored id is trusted, no second credential');
});

test('the n8n patches: valid on the real 2026-11-17 workflows; a renamed node is reported, never guessed', () => {
  for (const t of HOOK_TARGETS) {
    const wf = snapshot(t.workflowId);
    const p = targetPatch(wf, t, 'https://engine.example.test', 'credX');
    assert.ok('patch' in p, `${t.label}: ${'error' in p ? p.error : ''}`);
    const body = (p as any).patch.changes[0].addNode;
    assert.equal(body.parameters.url, 'https://engine.example.test/hooks/n8n');
    assert.ok(!('authentication' in body.parameters), 'the auth selectors are set by the engine, not written in the patch');
  }
  const t = HOOK_TARGETS.find((x) => x.group === 'sent')!;
  const wf = snapshot(t.workflowId); wf.nodes = wf.nodes.filter((n: any) => n.name !== 'Update record1');
  assert.match((targetPatch(wf, t, 'https://e', 'credX') as any).error, /node "Update record1" not found/);
});

test('Riley’s credential rule: a new node may use the engine’s own "Dulcy engine hook" login (HTTP Request only), nothing else new', () => {
  const wf = { id: 'w1', name: 'W', nodes: [{ id: '1', name: 'Start', type: 'n8n-nodes-base.manualTrigger', parameters: {} }], connections: {} };
  const add = (type: string, id: string, name = ENGINE_CREDENTIAL_NAME) => validateN8nPatch({ workflowId: 'w1', changes: [{ addNode: { name: 'Tell', type, typeVersion: 4.2, position: [0, 0], parameters: { method: 'POST', url: 'https://e/hooks/n8n' }, credentials: { httpHeaderAuth: { id, name } } } }] }) as { patch: N8nPatch };
  const eng = { engineCredential: { id: 'credE', name: ENGINE_CREDENTIAL_NAME } };
  const ok = planN8nPatch(wf, add('n8n-nodes-base.httpRequest', 'credE').patch, eng);
  assert.deepEqual(ok.refused, []);
  const node = ok.next.nodes.find((n: any) => n.name === 'Tell');
  assert.deepEqual([node.credentials, node.parameters.authentication, node.parameters.genericAuthType], [{ httpHeaderAuth: { id: 'credE', name: ENGINE_CREDENTIAL_NAME } }, 'genericCredentialType', 'httpHeaderAuth']);
  assert.match(planN8nPatch(wf, add('n8n-nodes-base.httpRequest', 'credE').patch).refused[0], /never adds new credentials/, 'without the engine’s stored id: refused');
  assert.match(planN8nPatch(wf, add('n8n-nodes-base.httpRequest', 'credOther').patch, eng).refused[0], /never adds new credentials/, 'another id: refused');
  assert.match(planN8nPatch(wf, add('n8n-nodes-base.httpRequest', 'credE', 'Someone else').patch, eng).refused[0], /never adds new credentials/, 'another name: refused');
  assert.match(planN8nPatch(wf, add('n8n-nodes-base.slack', 'credE').patch, eng).refused[0], /never adds new credentials/, 'not an HTTP Request node: refused');
});

test('Error Workflow where none is set: allowed, and the rollback unsets it', () => {
  const wf = { id: 'w1', name: 'W', active: true, settings: { executionOrder: 'v1' }, nodes: [], connections: {} };
  const v = validateN8nPatch({ workflowId: 'w1', changes: [{ workflowSetting: { key: 'errorWorkflow', old: null, new: 'engErr1' } }] }) as { patch: N8nPatch };
  const plan = planN8nPatch(wf, v.patch);
  assert.deepEqual([plan.mismatches, plan.next.settings.errorWorkflow], [[], 'engErr1']);
  assert.equal(patchState(plan.next, v.patch), 'applied');
  const back = rollbackSettings(wf, v.patch);
  assert.equal(back.errorWorkflow, '', 'unset ("" = no error workflow in n8n)');
  assert.equal(patchState({ ...wf, settings: back }, v.patch), 'not_applied', 'after the rollback the fix is gone (and could be applied again)');
});

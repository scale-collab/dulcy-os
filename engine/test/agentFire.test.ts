// Agents start instantly (Alex 2026-11-28): the engine starts Riley's / Sienna's Claude Code routine
// through its API trigger. Fake fetch only: nothing here reaches the real API. The token below is a
// made-up test value (not a secret) and the tests check it never shows in logs, rows or results.
import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { createPool, migrate, type Db } from '../src/db/pool.js';
import { loadConfig, fireTargets, type Config } from '../src/config.js';
import { enqueue, getJob } from '../src/queue.js';
import { runOnce } from '../src/worker.js';
import { ISSUES, IF } from '../src/agents/riley.js';
import { fireAgent, flushAgent, fireRuntime, fireText, retryAfterMs, recentFires, resetFireWarnings, settleFires, FIRE_WINDOW_MS } from '../src/agents/fire.js';
import { fixIt } from '../src/hq/fixIt.js';
import { decisionsTick } from '../src/decisions/loop.js';
import { DECISIONS, DF } from '../src/decisions/fields.js';

const url = process.env.TEST_DATABASE_URL;
const skip = !url ? 'TEST_DATABASE_URL not set' : false;
const TOKEN = 'test-fire-token-not-a-secret-7Qx';
const RILEY_URL = 'https://api.anthropic.com/v1/claude_code/routines/trig_riley_test/fire';
const SIENNA_URL = 'https://api.anthropic.com/v1/claude_code/routines/trig_sienna_test/fire';

// ---------- fake world ----------
let clock = Date.parse('2026-11-28T15:00:00Z');
let calls: { url: string; init: RequestInit; body: { text: string } }[] = [];
let answers: (() => Response | Promise<Response>)[] = [];
let logs: string[] = [];
const ok = (n = calls.length) => new Response(JSON.stringify({ type: 'routine_fire', claude_code_session_id: `session_${n}`, claude_code_session_url: `https://claude.ai/code/session_${n}` }), { status: 200, headers: { 'content-type': 'application/json' } });
const realRuntime = { ...fireRuntime };
function fakeRuntime() {
  fireRuntime.now = () => new Date(clock);
  fireRuntime.sleep = async () => undefined;
  fireRuntime.log = (l) => { logs.push(JSON.stringify(l)); };
  fireRuntime.fetch = (async (u: any, init: any) => {
    calls.push({ url: String(u), init, body: JSON.parse(String(init?.body ?? '{}')) });
    const next = answers.shift();
    return next ? next() : ok();
  }) as typeof fetch;
}

let db: Db, server: http.Server, base = '';
let tables: Record<string, Record<string, Record<string, unknown>>> = {};
before(async () => {
  server = http.createServer((req, res) => {
    let raw = ''; req.on('data', (c) => (raw += c));
    req.on('end', () => {
      res.setHeader('content-type', 'application/json');
      const u = new URL(req.url ?? '/', 'http://x');
      const table = u.pathname.split('/')[4]; const rows = (tables[table] ??= {});
      if (req.method === 'GET') {
        const f = u.searchParams.get('filterByFormula') ?? '';
        const id = /RECORD_ID\(\)='(rec\w+)'/.exec(f)?.[1]; const sig = /\{Signature\}='((?:\\'|[^'])*)'/.exec(f)?.[1]?.replace(/\\'/g, "'");
        const list = Object.entries(rows).filter(([rid, r]) => (!id || rid === id) && (sig === undefined || r[IF.signature] === sig));
        return res.end(JSON.stringify({ records: list.map(([rid, fields]) => ({ id: rid, fields })) }));
      }
      const b = JSON.parse(raw || '{}');
      return res.end(JSON.stringify({ records: (b.records ?? []).map((r: any) => {
        if (req.method === 'PATCH') { Object.assign((rows[r.id] ??= {}), r.fields); return r; }
        const rid = `recNew${String(Object.keys(rows).length).padStart(11, '0')}`; rows[rid] = { ...r.fields }; return { id: rid, fields: r.fields };
      }) }));
    });
  });
  await new Promise<void>((r) => server.listen(0, r));
  base = `http://127.0.0.1:${(server.address() as any).port}`;
  if (!skip) { db = createPool(url!); await migrate(db); }
});
after(async () => { Object.assign(fireRuntime, realRuntime); server.close(); if (!skip) await db.end(); });
beforeEach(async () => {
  tables = {}; calls = []; answers = []; logs = []; clock = Date.parse('2026-11-28T15:00:00Z');
  fakeRuntime(); resetFireWarnings();
  if (!skip) await db.query('TRUNCATE jobs, steps, receipts, events, agent_fire_pending, agent_fires, agent_fire_state RESTART IDENTITY CASCADE');
});

function cfg(over: Partial<Config> = {}, stage = 'riley.apply'): Config {
  return { ...loadConfig({ ENGINE_SECRET: 'x'.repeat(40), DATABASE_URL: url ?? 'postgres://x', RILEY_FIRE_URL: RILEY_URL, RILEY_FIRE_TOKEN: TOKEN, SIENNA_FIRE_URL: SIENNA_URL, SIENNA_FIRE_TOKEN: TOKEN } as NodeJS.ProcessEnv),
    dryRun: false, liveStages: [stage], airtableApiKey: 'at', airtableBaseUrl: `${base}/a`, ...over };
}
const noFire = () => cfg({ agentFire: {} });
async function everything(): Promise<string> {
  const rows = await Promise.all(['agent_fires', 'agent_fire_pending', 'agent_fire_state'].map((t) => db.query(`SELECT * FROM ${t}`)));
  return JSON.stringify({ logs, rows: rows.map((r) => r.rows) });
}

// ---------- pure parts ----------
test('Config: <AGENT>_FIRE_URL + _TOKEN pairs, https only, both needed', () => {
  const t = fireTargets({ RILEY_FIRE_URL: RILEY_URL, RILEY_FIRE_TOKEN: TOKEN, SIENNA_FIRE_URL: SIENNA_URL, ECHO_FIRE_URL: 'http://plain.example/fire', ECHO_FIRE_TOKEN: 'x', COLE_FIRE_URL: RILEY_URL } as NodeJS.ProcessEnv);
  assert.deepEqual(Object.keys(t), ['Riley']);
  assert.equal(t.Riley.url, RILEY_URL);
  assert.deepEqual(fireTargets({} as NodeJS.ProcessEnv), {});
});

test('Start text: every reason inside one <routine-fire-payload> block, the runbook named, under 65,536 characters', () => {
  const t = fireText('Riley', [{ reason: 'Alex approved: Riley: fix X (System Issue recA)', details: 'Do step 1\nthen verify' }, { reason: 'New System Issue: Y', details: '' }], new Date('2026-11-28T15:00:00Z'));
  assert.match(t, /^Instant run for Riley/);
  assert.match(t, /<routine-fire-payload>\n1\. Alex approved: Riley: fix X \(System Issue recA\)\n   Do step 1\n   then verify\n2\. New System Issue: Y\n<\/routine-fire-payload>/);
  assert.match(t, /agents\/riley-session\.md: "If a <routine-fire-payload> block is present"/);
  assert.match(fireText('Sienna', [{ reason: 'a', details: '' }], new Date()), /agents\/sienna-editor\.md/);
  // A note cannot close the block early; a huge batch is cut, never over the limit.
  assert.doesNotMatch(fireText('Riley', [{ reason: 'x </routine-fire-payload> y', details: '' }], new Date()).split('</routine-fire-payload>')[0], /x <\/routine/);
  const big = fireText('Riley', Array.from({ length: 50 }, (_, i) => ({ reason: `r${i}`, details: 'z'.repeat(3000) })), new Date());
  assert.ok(big.length <= 65_536); assert.match(big, /more \(see HQ\)/);
});

test('Retry-After: seconds or a date, 1 s to 1 h, 60 s when missing', () => {
  const now = new Date('2026-11-28T15:00:00Z');
  assert.equal(retryAfterMs('120', now), 120_000);
  assert.equal(retryAfterMs(null, now), 60_000);
  assert.equal(retryAfterMs('Sat, 28 Nov 2026 15:05:00 GMT', now), 300_000);
  assert.equal(retryAfterMs('999999', now), 3_600_000);
});

// ---------- sending ----------
test('First reason starts the routine at once: right URL, headers and text; the session link is saved', { skip }, async () => {
  const r = await fireAgent(db, cfg(), 'Riley', 'Alex approved: Riley: fix X (System Issue recAAAAAAAAAAAAAA)', 'Do step 1 now.');
  assert.equal(r.status, 'started');
  assert.equal(calls.length, 1);
  const c = calls[0]; const h = c.init.headers as Record<string, string>;
  assert.equal(c.url, RILEY_URL); assert.equal(c.init.method, 'POST');
  assert.equal(h.authorization, `Bearer ${TOKEN}`); assert.equal(h['anthropic-version'], '2023-06-01'); assert.equal(h['content-type'], 'application/json');
  assert.match(c.body.text, /<routine-fire-payload>\n1\. Alex approved: Riley: fix X/);
  const f = await recentFires(db, cfg(), 'Riley');
  assert.equal(f.configured, true);
  assert.equal(f.fires[0].status, 'started'); assert.equal(f.fires[0].sessionUrl, 'https://claude.ai/code/session_1');
  assert.ok(!(await everything()).includes(TOKEN), 'token never stored or logged');
});

test('Debounce: reasons within 2 minutes wait and go out as ONE start after the window', { skip }, async () => {
  const c = cfg();
  assert.equal((await fireAgent(db, c, 'Riley', 'one')).status, 'started');
  clock += 30_000;
  const q = await fireAgent(db, c, 'Riley', 'two');
  assert.equal(q.status, 'queued');
  clock += 30_000;
  assert.equal((await fireAgent(db, c, 'Riley', 'three')).status, 'queued');
  assert.equal(calls.length, 1, 'nothing sent inside the window');
  assert.equal((await flushAgent(db, c, 'Riley')).status, 'queued');
  assert.deepEqual((await recentFires(db, c, 'Riley')).waiting, ['two', 'three']);
  clock = Date.parse('2026-11-28T15:00:00Z') + FIRE_WINDOW_MS + 1_000;
  assert.equal((await flushAgent(db, c, 'Riley')).status, 'started');
  assert.equal(calls.length, 2);
  assert.match(calls[1].body.text, /1\. two\n2\. three\n/);
  assert.equal((await flushAgent(db, c, 'Riley')).status, 'idle', 'nothing left: no third start');
  // Another agent has its own window.
  assert.equal((await fireAgent(db, c, 'Sienna', 'clip changes')).status, 'started');
  assert.equal(calls[2].url, SIENNA_URL);
});

test('In flight: two reasons at the same moment make one start, the second waits', { skip }, async () => {
  let release!: () => void;
  answers.push(() => new Promise<Response>((r) => { release = () => r(ok(1)); }));
  const c = cfg();
  const first = fireAgent(db, c, 'Riley', 'a');
  while (!calls.length) await new Promise((r) => setTimeout(r, 5));
  const second = await fireAgent(db, c, 'Riley', 'b');
  assert.equal(second.status, 'queued');
  release();
  assert.equal((await first).status, 'started');
  assert.equal(calls.length, 1);
});

test('429: no session made, the reasons wait for Retry-After, then one start', { skip }, async () => {
  answers.push(() => new Response('{"error":"rate limited"}', { status: 429, headers: { 'retry-after': '300' } }));
  const c = cfg();
  const r = await fireAgent(db, c, 'Riley', 'approved X');
  assert.equal(r.status, 'waiting');
  assert.deepEqual((await recentFires(db, c, 'Riley')).waiting, ['approved X']);
  clock += 200_000;
  assert.equal((await flushAgent(db, c, 'Riley')).status, 'queued', 'still inside Retry-After');
  assert.equal(calls.length, 1);
  clock += 101_000;
  assert.equal((await flushAgent(db, c, 'Riley')).status, 'started');
  assert.equal(calls.length, 2);
  assert.match(calls[1].body.text, /1\. approved X/);
});

test('5xx: retried up to 3 times; one success = one start; all failing = waits, never a double', { skip }, async () => {
  answers.push(() => new Response('', { status: 503 }), () => new Response('', { status: 502 }), () => ok(9));
  const c = cfg();
  const r = await fireAgent(db, c, 'Riley', 'x');
  assert.equal(r.status, 'started'); assert.equal(calls.length, 3);
  const row = (await db.query(`SELECT status, attempts FROM agent_fires`)).rows;
  assert.deepEqual(row, [{ status: 'started', attempts: 3 }]);
  // Four 5xx in a row: failed, the reason goes back to waiting (nothing was started).
  clock += FIRE_WINDOW_MS + 1_000;
  answers.push(...Array.from({ length: 4 }, () => () => new Response('', { status: 500 })));
  const f = await fireAgent(db, c, 'Riley', 'y');
  assert.equal(f.status, 'failed'); assert.equal(calls.length, 7);
  assert.deepEqual((await recentFires(db, c, 'Riley')).waiting, ['y']);
});

test('No answer (timeout / dropped connection): marked uncertain and NEVER sent again', { skip }, async () => {
  answers.push(() => { throw Object.assign(new Error('The operation was aborted due to timeout'), { name: 'TimeoutError' }); });
  const c = cfg();
  const r = await fireAgent(db, c, 'Riley', 'maybe sent');
  assert.equal(r.status, 'uncertain'); assert.equal(calls.length, 1);
  clock += FIRE_WINDOW_MS + 1_000;
  assert.equal((await flushAgent(db, c, 'Riley')).status, 'idle', 'the uncertain reason is not re-sent');
  assert.equal(calls.length, 1);
  // A start still "sending" when the engine died is uncertain too, not re-sent.
  await db.query(`INSERT INTO agent_fires (agent, status, reasons, created_at) VALUES ('Riley','sending','["lost"]',$1)`, [new Date(clock)]);
  await db.query(`UPDATE agent_fire_state SET in_flight_until=$1 WHERE agent='Riley'`, [new Date(clock - 1000)]);
  assert.equal((await flushAgent(db, c, 'Riley')).status, 'idle');
  assert.equal((await db.query(`SELECT status FROM agent_fires WHERE reasons::text LIKE '%lost%'`)).rows[0].status, 'uncertain');
});

test('Cap: at most 20 starts an hour per agent', { skip }, async () => {
  for (let i = 0; i < 20; i++) await db.query(`INSERT INTO agent_fires (agent, status, reasons, created_at) VALUES ('Riley','started','[]',$1)`, [new Date(clock - 50 * 60_000 + i * 60_000)]);
  const r = await fireAgent(db, cfg(), 'Riley', 'one more');
  assert.equal(r.status, 'queued'); assert.equal(calls.length, 0);
  assert.match((r as any).why, /20 starts in the last hour/);
  clock += 11 * 60_000;
  assert.equal((await flushAgent(db, cfg(), 'Riley')).status, 'started');
});

test('Missing config: nothing happens, one log line "RILEY_FIRE_URL not set"', { skip }, async () => {
  assert.equal((await fireAgent(db, noFire(), 'Riley', 'a')).status, 'off');
  assert.equal((await fireAgent(db, noFire(), 'Riley', 'b')).status, 'off');
  assert.equal(calls.length, 0);
  assert.equal((await db.query(`SELECT count(*)::int AS n FROM agent_fire_pending`)).rows[0].n, 0);
  assert.deepEqual(logs.filter((l) => /FIRE_URL not set/.test(l)).map((l) => JSON.parse(l).message), ['RILEY_FIRE_URL not set: Riley runs only when started by hand']);
});

test('Token never in logs, rows or results, even when the API echoes it back', { skip }, async () => {
  answers.push(() => new Response(`{"error":"bad token Bearer ${TOKEN}"}`, { status: 401 }));
  const r = await fireAgent(db, cfg(), 'Riley', 'x');
  assert.equal(r.status, 'failed');
  assert.match((r as any).error, /token was refused/);
  assert.ok(!JSON.stringify(r).includes(TOKEN));
  assert.ok(!(await everything()).includes(TOKEN));
  assert.ok(!JSON.stringify(await recentFires(db, cfg(), 'Riley')).includes(TOKEN));
});

test('Same event twice (HQ and the Slack loop) = one reason', { skip }, async () => {
  const c = cfg();
  await fireAgent(db, c, 'Riley', 'Alex approved: A', '', 'decision:recDDDDDDDDDDDDDD');
  assert.equal((await fireAgent(db, c, 'Riley', 'Alex approved: A', '', 'decision:recDDDDDDDDDDDDDD')).status, 'idle');
  clock += FIRE_WINDOW_MS + 1_000;
  assert.equal((await flushAgent(db, c, 'Riley')).status, 'idle');
  assert.equal(calls.length, 1);
});

// ---------- hooks ----------
let n = 0;
async function run(c: Config, kind: string, input: Record<string, unknown> = {}) {
  const q = await enqueue(db, { kind, recordId: `${kind}-${++n}`, input, dryRun: false, maxAttempts: 1, deadlineMs: 60_000 });
  for (let i = 0; i < 10; i++) { await runOnce(db, c); const j = await getJob(db, q.job.id); if (['succeeded', 'failed', 'needs_review'].includes(j!.job.status)) return j!; }
  throw new Error('job did not settle');
}

test('Hook: Riley Decision approved (riley.apply) starts Riley with the issue id, title and step 1', { skip }, async () => {
  tables[ISSUES] = { recI0000000000009: { [IF.title]: 'n8n: Booked Meeting failed', [IF.status]: 'Waiting for Alex', [IF.fixType]: 'Code PR' } };
  const r = await run(cfg(), 'riley.apply', { issueId: 'recI0000000000009' });
  assert.equal(r.job.status, 'succeeded', r.job.error ?? '');
  assert.equal(tables[ISSUES].recI0000000000009[IF.status], 'Approved');
  assert.equal(calls.length, 1);
  assert.match(calls[0].body.text, /1\. Alex approved: n8n: Booked Meeting failed \(System Issue recI0000000000009, Code PR\)/);
  assert.match(calls[0].body.text, /Do step 1 of agents\/riley-session\.md for this issue now/);
  // Already decided: nothing to do, no start.
  await run(cfg(), 'riley.apply', { issueId: 'recI0000000000009' });
  assert.equal(calls.length, 1);
});

test('Hook: riley.collect opening a NEW System Issue starts Riley (step 3); repeats do not', { skip }, async () => {
  const q = await enqueue(db, { kind: 'leadlist.verify', recordId: 'recL0000000000001', input: {}, dryRun: false, maxAttempts: 1, deadlineMs: 60_000 });
  await db.query(`UPDATE jobs SET status='failed', error='MillionVerifier: HTTP 502', updated_at=now() WHERE id=$1`, [q.job.id]);
  const r = await run(cfg({}, 'riley.collect'), 'riley.collect');
  assert.equal(r.job.status, 'succeeded', r.job.error ?? '');
  assert.equal(calls.length, 1);
  assert.match(calls[0].body.text, /1\. New System Issue: leadlist\.verify: failed \(System Issue recNew\d{11}\)/);
  assert.match(calls[0].body.text, /Do step 3 \(diagnose\)/);
  // The same problem again is a repeat (Occurrences +1): no new start.
  clock += FIRE_WINDOW_MS + 1_000;
  const q2 = await enqueue(db, { kind: 'leadlist.verify', recordId: 'recL0000000000002', input: {}, dryRun: false, maxAttempts: 1, deadlineMs: 60_000 });
  await db.query(`UPDATE jobs SET status='failed', error='MillionVerifier: HTTP 503', updated_at=now() WHERE id=$1`, [q2.job.id]);
  await run(cfg({}, 'riley.collect'), 'riley.collect');
  assert.equal(calls.length, 1);
});

const alex = { id: 1, email: 'alex@example.com', name: 'Alex', role: 'owner' as const };

test('Hook: "Have Riley fix it" and "Ask Sienna now" tasks start that agent; pressing again does not', { skip }, async () => {
  const c = cfg();
  const r = await fixIt(db, alex, { agent: 'Riley', title: 'Webhook to Close returns 500', detail: 'Seen on the Deliverability page' }, { cfg: c });
  assert.equal(r.status, 200);
  await settleFires();
  assert.equal(calls.length, 1);
  assert.match(calls[0].body.text, new RegExp(`1\\. Alex asked in HQ \\(Fix it\\): Webhook to Close returns 500 \\(HQ task #${r.task!.id}\\)`));
  assert.match(calls[0].body.text, /Seen on the Deliverability page/);
  await fixIt(db, alex, { agent: 'Riley', title: 'Webhook to Close returns 500' }, { cfg: c });
  await settleFires();
  assert.equal((await db.query(`SELECT count(*)::int AS n FROM agent_fire_pending`)).rows[0].n, 1, 'same open task: no new reason');
  await fixIt(db, alex, { agent: 'Sienna', title: 'Write the recording script for "Cold email in 2027"' }, { cfg: c });
  await settleFires();
  assert.equal(calls.length, 2); assert.equal(calls[1].url, SIENNA_URL);
  assert.match(calls[1].body.text, /Instant run for Sienna[\s\S]*Alex asked in HQ \(Fix it\): Write the recording script[\s\S]*agents\/sienna-editor\.md/);
  // An agent without a routine (Atlas): the task is made, nothing is sent.
  await fixIt(db, alex, { agent: 'Atlas', title: 'Look at campaign Y' }, { cfg: c });
  await settleFires();
  assert.equal(calls.length, 2);
});

test('Hook: Request changes on a final clip starts Sienna with the note', { skip }, async () => {
  await fixIt(db, alex, { agent: 'Sienna', title: 'Clip changes: "Why lists fail"', detail: 'Alex asked for changes to the final clip "Why lists fail":\nCut the first 2 seconds.', link: 'content/items/recC0000000000001' }, { cfg: cfg(), how: 'changes' });
  await settleFires();
  assert.equal(calls.length, 1); assert.equal(calls[0].url, SIENNA_URL);
  assert.match(calls[0].body.text, /1\. Alex requested changes: Clip changes: "Why lists fail"/);
  assert.match(calls[0].body.text, /Cut the first 2 seconds\.[\s\S]*HQ link: content\/items\/recC0000000000001/);
  // A second note on the same clip (same open task) still reaches Sienna, with the next start.
  await fixIt(db, alex, { agent: 'Sienna', title: 'Clip changes: "Why lists fail"', detail: 'Also drop the music.' }, { cfg: cfg(), how: 'changes' });
  await settleFires();
  assert.equal(calls.length, 1, 'inside the 2-minute window');
  clock += FIRE_WINDOW_MS + 1_000;
  assert.equal((await flushAgent(db, cfg(), 'Sienna')).status, 'started');
  assert.match(calls[1].body.text, /Also drop the music\./);
});

test('Hook: a Manual (Alex) Riley card approved in Slack (Action None) starts Riley once, even if HQ reported it too', { skip }, async () => {
  const rec = 'recD0000000000001';
  const row = { id: rec, createdTime: '', fields: { [DF.title]: 'Riley: rotate the Close key', [DF.agent]: 'Riley', [DF.status]: 'Approved', [DF.action]: 'None', [DF.fix]: 'Alex makes a new Close key and saves it on the server.' } as Record<string, unknown> };
  const at = { list: async (_t: string, f: string) => (/Approved/.test(f) && row.fields[DF.status] === 'Approved' ? [row] : []), update: async (_t: string, _id: string, f: Record<string, unknown>) => { Object.assign(row.fields, f); return {} as any; } };
  const slack = { post: async () => ({ channel: 'C', ts: '1' }), reactions: async () => [], react: async () => undefined };
  // HQ approved it first (decide → task → start, keyed by the decision)…
  await fixIt(db, alex, { agent: 'Riley', title: 'Riley: rotate the Close key' }, { cfg: cfg(), how: 'approved', fireKey: `decision:${rec}` });
  await settleFires();
  // …then the decisions loop closes the card: same event, no second start.
  await decisionsTick(db, cfg(), at as any, slack as any);
  assert.equal(row.fields[DF.status], 'Done');
  clock += FIRE_WINDOW_MS + 1_000;
  assert.equal((await flushAgent(db, cfg(), 'Riley')).status, 'idle');
  assert.equal(calls.length, 1);
  assert.match(calls[0].body.text, /Alex approved: Riley: rotate the Close key/);
  // Slack-only approval of another card: the loop starts Riley itself.
  row.id = 'recD0000000000002'; row.fields[DF.status] = 'Approved';
  await decisionsTick(db, cfg(), at as any, slack as any);
  assert.equal(calls.length, 2);
  assert.match(calls[1].body.text, /Alex approved: Riley: rotate the Close key \(Decision recD0000000000002\)[\s\S]*Approved fix: Alex makes a new Close key/);
});

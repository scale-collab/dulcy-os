// Agents start instantly (Alex 2026-11-28): POST /hooks/<source> signatures, routing, coalescing, the
// engine-internal events (afterJob, HQ), and the backup sweeps that replace the old timers.
import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { createHmac } from 'node:crypto';
import type { AddressInfo } from 'node:net';
import { createPool, migrate, type Db } from '../src/db/pool.js';
import { loadConfig, backupEnvName, type Config } from '../src/config.js';
import { createServer } from '../src/http.js';
import { verifyClose, verifyShared, verifySlack, verifyStandardWebhook, routeEvent } from '../src/instant/hooks.js';
import { trigger } from '../src/instant/trigger.js';
import { afterJob } from '../src/instant/afterJob.js';
import { hqInstant } from '../src/instant/hq.js';
import { kick, registerLoop, unregisterLoop } from '../src/instant/kick.js';
import { isInstant, sweepEveryMin } from '../src/instant/jobs.js';
import { agentsTick, seanTick, scheduleTick, accountHealthTick } from '../src/scheduler.js';

const url = process.env.TEST_DATABASE_URL;
const skip = !url ? 'TEST_DATABASE_URL not set' : false;

const S = {
  n8n: 'n8n-secret-0123456789abcdef', make: 'make-secret-0123456789abcdef', airtable: 'airtable-secret-0123456789ab', emailbison: 'bison-secret-0123456789abcdef',
  slack: '8f742231b10e8888abcd99yyyzzz85a5', fathom: `whsec_${Buffer.from('fathom-key-0123456789abcdef').toString('base64')}`, close: 'a1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5c6d7e8f90',
};
const ENV = {
  ENGINE_SECRET: 'x'.repeat(40), DATABASE_URL: url ?? 'postgres://x',
  HOOK_SECRET_N8N: S.n8n, HOOK_SECRET_MAKE: S.make, HOOK_SECRET_AIRTABLE: S.airtable, HOOK_SECRET_EMAILBISON: S.emailbison,
  HOOK_SECRET_SLACK: S.slack, HOOK_SECRET_FATHOM: S.fathom, HOOK_SECRET_CLOSE: S.close,
  SEAN: 'on', SEAN_FOLLOWUPS: 'on', RILEY: 'on', COLE: 'on', FATHOM_API_KEY: 'f', CLOSE_API_KEY: 'c', AIRTABLE_API_KEY: 'pat', AIRTABLE_BASE_URL: 'http://127.0.0.1:9',
  SIENNA: 'on', ATLAS_CAMPAIGNS: 'on', HQ_SESSION_SECRET: 'h'.repeat(40), ACCOUNT_HEALTH: 'on', LEDGER: 'on', LEDGER_CHECK: 'on', SLACK_BOT_TOKEN: 'xoxb-test',
  BOUNCE_CHECK: 'on', BOUNCE_CHECK_WORKSPACES: 'all', HQ_HOST: 'hq.example.test', PORTAL_HOST: 'portal.example.test',
};
const conf = (env: Record<string, string> = {}, over: Partial<Config> = {}): Config => ({ ...loadConfig({ ...ENV, ...env } as NodeJS.ProcessEnv), ...over });
const legacyConf = (over: Partial<Config> = {}) => ({ ...loadConfig({ ENGINE_SECRET: 'x'.repeat(40), DATABASE_URL: url ?? 'postgres://x' } as NodeJS.ProcessEnv), ...over });

let db: Db, server: http.Server, port = 0, cfg: Config;
before(async () => {
  if (skip) return;
  db = createPool(url!); await migrate(db);
  cfg = conf();
  server = createServer(db, cfg);
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', () => r()));
  port = (server.address() as AddressInfo).port;
});
after(async () => { if (skip) return; server.close(); await db.end(); });
beforeEach(async () => { if (!skip) await db.query('TRUNCATE jobs, steps, receipts, events, hook_events, job_reruns RESTART IDENTITY CASCADE'); });

function post(path: string, body: string, headers: Record<string, string> = {}, method = 'POST', host = `127.0.0.1:${port}`): Promise<{ status: number; json: any }> {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port, path, method, headers: { 'content-type': 'application/json', host, ...headers } }, (res) => {
      let t = ''; res.on('data', (c) => (t += c)); res.on('end', () => { let j: any = null; try { j = JSON.parse(t); } catch { j = t; } resolve({ status: res.statusCode!, json: j }); });
    });
    req.on('error', reject); req.end(body);
  });
}
const shared = (src: keyof typeof S, obj: unknown) => post(`/hooks/${src}`, JSON.stringify(obj), { 'x-hook-secret': S[src] });
const slackHeaders = (body: string, ts = Math.floor(Date.now() / 1000)) => ({ 'x-slack-request-timestamp': String(ts), 'x-slack-signature': 'v0=' + createHmac('sha256', S.slack).update(`v0:${ts}:${body}`).digest('hex') });
const fathomHeaders = (body: string, id = 'msg_1', ts = Math.floor(Date.now() / 1000)) => ({ 'webhook-id': id, 'webhook-timestamp': String(ts), 'webhook-signature': `v1,${createHmac('sha256', Buffer.from(S.fathom.slice(6), 'base64')).update(`${id}.${ts}.${body}`).digest('base64')}` });
const closeHeaders = (body: string, ts = Math.floor(Date.now() / 1000)) => ({ 'close-sig-timestamp': String(ts), 'close-sig-hash': createHmac('sha256', Buffer.from(S.close, 'hex')).update(String(ts) + body).digest('hex') });
const jobs = async (kind?: string) => (await db.query(`SELECT id, kind, record_id, status, input, dry_run, request_id, run_after FROM jobs ${kind ? 'WHERE kind=$1' : ''} ORDER BY id`, kind ? [kind] : [])).rows;

// ---------- Signatures (pure) ----------
test('signatures: Slack v0, Fathom (Standard Webhooks), Close and the shared secret; unsigned, wrong or stale = refused', () => {
  const body = '{"a":1}';
  assert.equal(verifySlack(S.slack, slackHeaders(body), body), null);
  assert.equal(verifySlack(S.slack, slackHeaders(body), body + ' '), 'bad signature', 'body changed');
  assert.equal(verifySlack(S.slack, {}, body), 'missing signature');
  assert.equal(verifySlack(S.slack, slackHeaders(body, Math.floor(Date.now() / 1000) - 600), body), 'stale or invalid timestamp');
  assert.equal(verifyStandardWebhook(S.fathom, fathomHeaders(body), body), null);
  assert.equal(verifyStandardWebhook(S.fathom, { ...fathomHeaders(body), 'webhook-signature': 'v1,AAAA v1,BBBB' }, body), 'bad signature');
  assert.equal(verifyStandardWebhook(S.fathom, { ...fathomHeaders(body), 'webhook-id': 'other' }, body), 'bad signature', 'the id is signed');
  assert.equal(verifyStandardWebhook(S.fathom, fathomHeaders(body, 'm', 1000), body), 'stale or invalid timestamp');
  assert.equal(verifyClose(S.close, closeHeaders(body), body), null);
  assert.equal(verifyClose(S.close.replace('a', 'b'), closeHeaders(body), body), 'bad signature');
  assert.equal(verifyClose(S.close, { 'close-sig-hash': 'x' }, body), 'missing signature');
  const u = new URL('http://h/hooks/emailbison?key=' + S.emailbison);
  assert.equal(verifyShared(S.emailbison, {}, u, true), null, 'EmailBison: the key may be in the URL');
  assert.equal(verifyShared(S.emailbison, {}, u, false), 'missing secret', 'other sources: header only');
  assert.equal(verifyShared(S.n8n, { 'x-hook-secret': S.n8n }, new URL('http://h/'), false), null);
  assert.equal(verifyShared(S.n8n, { 'x-hook-secret': S.n8n + 'x' }, new URL('http://h/'), false), 'bad secret');
});

// ---------- HTTP ----------
test('HTTP: no secret on the server = 404; wrong or missing signature = 401; GET = 405; never on the HQ host', { skip }, async () => {
  assert.equal((await post('/hooks/n8n', '{"event":"reply"}')).status, 401, 'unsigned');
  assert.equal((await post('/hooks/n8n', '{"event":"reply"}', { 'x-hook-secret': 'wrong-secret-0123456789' })).status, 401);
  assert.equal((await post('/hooks/n8n', '{"event":"reply"}', { 'x-hook-secret': S.n8n }, 'GET')).status, 405);
  assert.equal((await post('/hooks/mercury', '{}', { 'x-hook-secret': S.n8n })).status, 404, 'unknown source');
  const noSlack = createServer(db, conf({ HOOK_SECRET_SLACK: '' }));
  await new Promise<void>((r) => noSlack.listen(0, '127.0.0.1', () => r()));
  const p2 = (noSlack.address() as AddressInfo).port;
  const r = await new Promise<number>((res) => { const q = http.request({ host: '127.0.0.1', port: p2, path: '/hooks/slack', method: 'POST' }, (x) => { x.resume(); res(x.statusCode!); }); q.end('{}'); });
  noSlack.close();
  assert.equal(r, 404, 'a source without a secret does not exist');
  assert.equal((await post('/hooks/n8n', 'not json', { 'x-hook-secret': S.n8n })).status, 400);
  const onHq = await post('/hooks/n8n', '{"event":"reply"}', { 'x-hook-secret': S.n8n }, 'POST', 'hq.example.test');
  assert.notEqual(onHq.json?.ok, true, 'HQ host never takes webhooks');
  assert.equal((await jobs()).length, 0, 'nothing refused started anything');
});

test('nothing runs inline: the answer comes back with the job still queued and no step done', { skip }, async () => {
  const r = await shared('n8n', { event: 'reply' });
  assert.equal(r.status, 200);
  assert.deepEqual(r.json.jobs.map((j: any) => [j.kind, j.result]), [['sean.draft', 'queued'], ['sean.followup', 'queued']]);
  const j = await jobs();
  assert.deepEqual(j.map((x) => x.status), ['queued', 'queued']);
  assert.equal((await db.query('SELECT count(*)::int AS n FROM steps')).rows[0].n, 0);
  assert.equal(j[0].dry_run, true, 'DRY_RUN / LIVE_STAGES gating as always');
});

test('coalescing: a burst of 10 reply webhooks = 1 Echo job', { skip }, async () => {
  const rs = await Promise.all(Array.from({ length: 10 }, () => shared('n8n', { event: 'reply' })));
  assert.ok(rs.every((r) => r.status === 200));
  assert.equal((await jobs('sean.draft')).length, 1);
  assert.equal((await jobs('sean.followup')).length, 1);
  assert.equal((await db.query('SELECT count(*)::int AS n FROM hook_events')).rows[0].n, 10, 'each event is logged');
});

test('coalescing: running = one rerun right after; finished in the window = one catch-up at the window end', { skip }, async () => {
  const t = { kind: 'sean.draft', recordId: 'sean', reason: 'test' };
  const now = Date.UTC(2026, 10, 28, 12, 0, 10);
  assert.equal(await trigger(db, cfg, t, now), 'queued');
  assert.equal(await trigger(db, cfg, t, now), 'coalesced');
  await db.query(`UPDATE jobs SET status='running'`);
  for (let i = 0; i < 5; i++) assert.equal(await trigger(db, cfg, t, now + 1000), 'rerun');
  assert.equal((await db.query('SELECT count(*)::int AS n FROM job_reruns')).rows[0].n, 1, 'one rerun row however many events');
  await db.query(`UPDATE jobs SET status='succeeded'`);
  const [first] = await jobs('sean.draft');
  const out = await afterJob(db, cfg, first, 'succeeded');
  assert.ok(out.includes('sean.draft:rerun-queued'), out.join(','));
  assert.equal((await jobs('sean.draft')).length, 2);
  await db.query(`UPDATE jobs SET status='succeeded'`);
  // Same window, both done: one catch-up run, scheduled at the window end; more events join it.
  assert.equal(await trigger(db, cfg, t, now + 2000), 'tail');
  assert.equal(await trigger(db, cfg, t, now + 3000), 'coalesced');
  const all = await jobs('sean.draft');
  assert.equal(all.length, 3);
  const winEnd = (Math.floor(now / 30_000) + 1) * 30_000;
  assert.ok(Math.abs(new Date(all[2].run_after).getTime() - Date.now() - (winEnd - (now + 2000))) < 5000, 'starts at the window end');
});

test('bounce check: its own 2-minute window per workspace, so a busy workspace is not checked back to back', { skip }, async () => {
  const t = { kind: 'bounce.check', recordId: 'bounce:all:7', input: { workspace: 'all', onlyTeamId: 7, readSkipList: true }, reason: 'bounce' };
  const now = Date.UTC(2026, 10, 28, 12, 0, 5);
  assert.equal(await trigger(db, cfg, t, now), 'queued', 'the first bounce: right away');
  await db.query(`UPDATE jobs SET status='succeeded'`);
  assert.equal(await trigger(db, cfg, t, now + 60_000), 'tail', 'a bounce a minute later: one catch-up at the end of the 2 minutes');
  const tail = (await jobs('bounce.check'))[1];
  assert.ok(new Date(tail.run_after).getTime() - Date.now() > 40_000, 'not back to back');
  await db.query(`UPDATE jobs SET status='running' WHERE id=$1`, [tail.id]);
  assert.equal(await trigger(db, cfg, t, now + 130_000), 'rerun');
  await db.query(`UPDATE jobs SET status='succeeded'`);
  await afterJob(db, cfg, { id: tail.id, kind: 'bounce.check', record_id: 'bounce:all:7' }, 'succeeded');
  const rerun = (await jobs('bounce.check'))[2];
  assert.ok(new Date(rerun.run_after).getTime() - Date.now() > 100_000, 'the rerun also waits the bounce window');
  assert.equal(await trigger(db, cfg, { ...t, recordId: 'bounce:all:8', input: { workspace: 'all', onlyTeamId: 8 } }, now + 61_000), 'queued', 'another workspace is not held back');
});

// ---------- Each source starts the right job ----------
test('EmailBison: replies → Echo; a bounce → only that workspace is checked (reads the skip list itself); manual send → follow-ups', { skip }, async () => {
  const key = `/hooks/emailbison?key=${S.emailbison}`;
  assert.equal((await post(key, JSON.stringify({ event: { type: 'LEAD_REPLIED', workspace_id: 7, workspace_name: 'Acme' } }))).status, 200);
  assert.deepEqual((await jobs()).map((j) => j.kind), ['sean.draft', 'sean.followup']);
  await db.query('TRUNCATE jobs RESTART IDENTITY CASCADE');
  await post(key, JSON.stringify({ event: { type: 'EMAIL_BOUNCED', workspace_id: 7, workspace_name: 'Acme' } }));
  const [b] = await jobs();
  assert.equal(b.kind, 'bounce.check'); assert.equal(b.record_id, 'bounce:all:7');
  assert.deepEqual(b.input, { workspace: 'all', onlyTeamId: 7, readSkipList: true });
  await db.query('TRUNCATE jobs RESTART IDENTITY CASCADE');
  await post(key, JSON.stringify({ event: { type: 'MANUAL_EMAIL_SENT', workspace_id: 7 } }));
  assert.deepEqual((await jobs()).map((j) => j.kind), ['sean.followup']);
  const ign = await post(key, JSON.stringify({ event: { type: 'EMAIL_OPENED' } }));
  assert.equal(ign.json.ignored, 'event not used');
  // Named workspaces: only a checked one.
  const named = conf({ BOUNCE_CHECK_WORKSPACES: 'acme,beta' });
  assert.deepEqual(routeEvent('emailbison', { event: { type: 'EMAIL_BOUNCED', workspace_id: 3, workspace_name: 'Beta' } }, {}, named).jobs.map((j) => [j.recordId, j.input]), [['bounce:beta', { workspace: 'beta', readSkipList: true }]]);
  assert.equal(routeEvent('emailbison', { event: { type: 'EMAIL_BOUNCED', workspace_name: 'Other' } }, {}, named).jobs.length, 0);
});

test('n8n / Make: reply → Echo, placement results → account health, errors → Riley (Make error kept for Riley)', { skip }, async () => {
  await shared('n8n', { event: 'placement_results' });
  assert.deepEqual((await jobs()).map((j) => j.kind), ['account.health']);
  await shared('n8n', { event: 'error', workflow: 'Reply intake', error: 'Airtable 422', execution: '991' });
  const again = await shared('n8n', { event: 'error', workflow: 'Reply intake', error: 'Airtable 422', execution: '991' });
  assert.equal(again.json.duplicate, true, 'same execution id = once');
  await shared('make', { event: 'error', scenario: 'Bison sync', error: 'timeout' });
  assert.deepEqual((await jobs()).map((j) => j.kind), ['account.health', 'riley.collect']);
  const ev = (await db.query(`SELECT source, info FROM hook_events WHERE event='error' ORDER BY id`)).rows;
  assert.deepEqual(ev.map((e) => [e.source, e.info.where, e.info.error]), [['n8n', 'Reply intake', 'Airtable 422'], ['make', 'Bison sync', 'timeout']]);
  assert.deepEqual(routeEvent('n8n', { event: 'bounce', workspace_id: 9, workspace_name: 'Acme' }, {}, cfg).jobs.map((j) => [j.kind, j.recordId]), [['bounce.check', 'bounce:all:9']], 'n8n Bounce Data Tracker → that workspace');
  assert.deepEqual(routeEvent('n8n', { event: 'sent' }, {}, cfg).jobs.map((j) => j.kind), ['sean.followup'], 'n8n Manual Emails Sent → follow-ups');
  const { hookProblems } = await import('../src/agents/riley.js');
  const found = await hookProblems(db, new Date(Date.now() - 60_000), false);
  assert.deepEqual(found.map((f) => [f.source, f.where]), [['Make', 'Bison sync']], 'Make errors go to System Issues; n8n ones are read from n8n when its API is connected');
});

test('Airtable: buttons kick the bridge, decisions kick the loop, idea → Sienna, campaign change → pipeline + Atlas tasks, reply → Echo', { skip }, async () => {
  const ran: string[] = [];
  registerLoop('airtable.bridge', async () => { ran.push('bridge'); });
  registerLoop('decisions.loop', async () => { ran.push('decisions'); });
  try {
    await shared('airtable', { event: 'engine_action', recordId: 'recAAAAAAAAAAAAAA' });
    await shared('airtable', { event: 'reply_action' });
    await new Promise((r) => setTimeout(r, 50));
    assert.deepEqual(ran.sort(), ['bridge', 'decisions']);
    assert.equal((await jobs()).length, 0, 'loops are kicked, not queued');
  } finally { unregisterLoop('airtable.bridge'); unregisterLoop('decisions.loop'); }
  await shared('airtable', { event: 'idea_approved' });
  await shared('airtable', { event: 'campaign_changed' });
  await shared('airtable', { event: 'reply' });
  assert.deepEqual((await jobs()).map((j) => j.kind), ['sienna.prep', 'campaign.pipeline', 'atlas.tasks', 'sean.draft', 'sean.followup']);
});

test('Slack: URL check answered; an approver ✅ kicks the Decisions loop; a question in the check channel → Ledger; retries start nothing twice', { skip }, async () => {
  const uv = JSON.stringify({ type: 'url_verification', challenge: 'abc123' });
  assert.deepEqual((await post('/hooks/slack', uv, slackHeaders(uv))).json, { challenge: 'abc123' });
  assert.equal((await post('/hooks/slack', uv, { 'x-slack-signature': 'v0=00', 'x-slack-request-timestamp': String(Math.floor(Date.now() / 1000)) })).status, 401);
  let ticks = 0;
  registerLoop('decisions.loop', async () => { ticks++; });
  try {
    const re = JSON.stringify({ type: 'event_callback', event_id: 'Ev1', event: { type: 'reaction_added', user: 'U070Z26377C', reaction: 'white_check_mark', item: { channel: 'C1', ts: '1700000000.0001' } } });
    assert.deepEqual((await post('/hooks/slack', re, slackHeaders(re))).json.kicks, ['decisions.loop']);
    assert.equal((await post('/hooks/slack', re, slackHeaders(re))).json.duplicate, true, 'Slack retry');
    const stranger = JSON.stringify({ type: 'event_callback', event_id: 'Ev2', event: { type: 'reaction_added', user: 'U999', reaction: 'white_check_mark', item: { ts: '1' } } });
    assert.equal((await post('/hooks/slack', stranger, slackHeaders(stranger))).json.ignored, 'not an approver ✅/❌');
    await new Promise((r) => setTimeout(r, 50));
    assert.equal(ticks, 1);
  } finally { unregisterLoop('decisions.loop'); }
  const ask = JSON.stringify({ type: 'event_callback', event_id: 'Ev3', event: { type: 'message', channel: cfg.ledgerCheckChannel, user: 'U070Z26377C', text: 'Can I buy 10 inboxes for $50?' } });
  await post('/hooks/slack', ask, slackHeaders(ask));
  const bot = JSON.stringify({ type: 'event_callback', event_id: 'Ev4', event: { type: 'message', channel: cfg.ledgerCheckChannel, bot_id: 'B1', user: 'U070Z26377C', text: '*Ledger:* yes' } });
  await post('/hooks/slack', bot, slackHeaders(bot));
  assert.deepEqual((await jobs()).map((j) => j.kind), ['ledger.check'], "Ledger's own answer starts nothing");
});

test('Fathom → Cole; Close opportunity status change → Won sync (a retried event id starts nothing twice)', { skip }, async () => {
  const f = JSON.stringify({ title: 'Discovery call', url: 'https://fathom.video/calls/1' });
  assert.equal((await post('/hooks/fathom', f, fathomHeaders(f, 'msg_9'))).status, 200);
  assert.equal((await post('/hooks/fathom', f, fathomHeaders(f, 'msg_9'))).json.duplicate, true);
  assert.equal((await post('/hooks/fathom', f, { ...fathomHeaders(f), 'webhook-signature': 'v1,bad' })).status, 401);
  const c = JSON.stringify({ event: { id: 'ev_1', object_type: 'opportunity', action: 'updated', changed_fields: ['status_id', 'status_label'] } });
  assert.equal((await post('/hooks/close', c, closeHeaders(c))).status, 200);
  const note = JSON.stringify({ event: { id: 'ev_2', object_type: 'opportunity', action: 'updated', changed_fields: ['note'] } });
  assert.equal((await post('/hooks/close', note, closeHeaders(note))).json.ignored, 'not an opportunity status change');
  assert.equal((await post('/hooks/close', c, { 'close-sig-timestamp': '1', 'close-sig-hash': 'aa' })).status, 401);
  assert.deepEqual((await jobs()).map((j) => [j.kind, j.record_id]), [['cole.review', 'cole-review'], ['sales.won_sync', 'sales-won_sync']]);
});

test('an agent that is off is not started by its webhook', { skip }, () => {
  const off = conf({ SEAN: 'off', RILEY: 'off', COLE: 'off', SIENNA: 'off', ATLAS_CAMPAIGNS: 'off', ACCOUNT_HEALTH: 'off', LEDGER_CHECK: 'off', BOUNCE_CHECK: 'off', CLOSE_API_KEY: '' });
  for (const [src, body] of [['n8n', { event: 'reply' }], ['n8n', { event: 'error' }], ['n8n', { event: 'placement_results' }], ['airtable', { event: 'idea_approved' }], ['emailbison', { event: { type: 'EMAIL_BOUNCED', workspace_id: 1 } }], ['fathom', {}], ['close', { event: { object_type: 'opportunity', action: 'created' } }]] as const)
    assert.equal(routeEvent(src, body, {}, off).jobs.length, 0, `${src} ${JSON.stringify(body)}`);
});

// ---------- Engine-internal events ----------
test('afterJob: a failed job → Riley at once (never for Riley itself); a send → follow-ups; a bounce check → Atlas tasks + pipeline; a plan step → the pipeline', { skip }, async () => {
  await afterJob(db, cfg, { id: 41, kind: 'leadlist.verify', record_id: 'recX' }, 'failed');
  await afterJob(db, cfg, { id: 42, kind: 'riley.collect', record_id: 'riley-collect' }, 'failed');
  assert.deepEqual((await jobs()).map((j) => j.kind), ['riley.collect']);
  await afterJob(db, cfg, { id: 43, kind: 'reply.send', record_id: 'recY' }, 'succeeded');
  await afterJob(db, cfg, { id: 44, kind: 'bounce.check', record_id: 'bounce:all' }, 'succeeded');
  assert.deepEqual((await jobs()).map((j) => j.kind), ['riley.collect', 'sean.followup', 'atlas.tasks', 'campaign.pipeline']);
  await afterJob(db, cfg, { id: 45, kind: 'bounce.check', record_id: 'bounce:all' }, 'retrying');
  assert.equal((await jobs()).length, 4, 'a retry starts nothing');
  // A plan the pipeline started → Atlas plans it now; copy queued → Scribe writes it now.
  await db.query(`TRUNCATE campaign_plans RESTART IDENTITY CASCADE`);
  await db.query(`INSERT INTO campaign_plans (trigger_key, ws_rec, client, state) VALUES ('t1','recW','Acme','planning'), ('t2','recV','Beta','expand')`);
  await db.query(`UPDATE campaign_plans SET copy_state='queued' WHERE id=2`);
  await db.query(`UPDATE jobs SET status='succeeded'`);
  const out = await afterJob(db, cfg, { id: 46, kind: 'campaign.pipeline', record_id: 'campaign-pipeline' }, 'succeeded');
  assert.ok(out.includes('plan-work:2'), out.join(','));
  assert.deepEqual((await jobs()).slice(-2).map((j) => [j.kind, j.record_id]), [['atlas.plan', 'atlas-plan-1'], ['scribe.copy', 'scribe-copy-2']]);
});

test('HQ: an idea approved starts Sienna now; decisions and center buttons kick their loops', { skip }, async () => {
  const ran: string[] = [];
  registerLoop('decisions.loop', async () => { ran.push('decisions'); });
  registerLoop('airtable.bridge', async () => { ran.push('bridge'); });
  try {
    assert.deepEqual(await hqInstant(db, cfg, 'idea'), ['sienna.prep:queued']);
    await hqInstant(db, cfg, 'decision');
    await hqInstant(db, cfg, 'campaign');
    await new Promise((r) => setTimeout(r, 50));
    assert.deepEqual(ran.sort(), ['bridge', 'decisions', 'decisions']);
  } finally { unregisterLoop('decisions.loop'); unregisterLoop('airtable.bridge'); }
});

test('kick: a burst of kicks while a tick runs = one more tick, not ten', async () => {
  let n = 0;
  registerLoop('t.loop', async () => { n++; await new Promise((r) => setTimeout(r, 30)); });
  try {
    const all = [kick('t.loop'), ...Array.from({ length: 10 }, () => kick('t.loop'))];
    await Promise.all(all);
    assert.equal(n, 2);
    assert.equal(await kick('not.registered'), undefined);
  } finally { unregisterLoop('t.loop'); }
});

// ---------- Backup sweeps instead of timers ----------
test('backup sweep: old timer until the webhook has a secret, then every 6 hours (env, 0 = off)', { skip }, async () => {
  const legacy = legacyConf({ seanEveryMin: 5, rileyOn: true, rileyEveryMin: 15 });
  assert.equal(isInstant(legacy, 'sean.draft'), false);
  assert.equal(sweepEveryMin(legacy, 'sean.draft'), 5, 'no secret yet: the old timer stays (nothing breaks before set-up)');
  assert.equal(sweepEveryMin(legacy, 'decisions.loop'), 0.5);
  assert.equal(isInstant(cfg, 'sean.draft'), true);
  assert.equal(sweepEveryMin(cfg, 'sean.draft'), 360, 'default 6 hours');
  assert.equal(sweepEveryMin(conf({ [backupEnvName('sean.draft')]: '0' }), 'sean.draft'), 0);
  assert.equal(backupEnvName('sean.draft'), 'SEAN_DRAFT_BACKUP_EVERY_MIN');
  assert.equal(backupEnvName('decisions.loop'), 'DECISIONS_LOOP_BACKUP_EVERY_MIN');
  assert.equal(isInstant(conf({ HOOK_SECRET_AIRTABLE: '' }), 'decisions.loop'), false, 'the Decisions loop needs both Slack and Airtable');

  const t0 = Date.UTC(2026, 10, 28, 0, 1, 0);
  const only = (c: Config) => ({ ...c, bounceCheckOn: false, accountHealthOn: false });
  assert.equal(await seanTick(db, only(cfg), t0), 2, 'backup sweep: Echo + due follow-ups');
  assert.equal(await seanTick(db, only(cfg), t0 + 5 * 60_000), 0, 'not again 5 minutes later (the old timer would have)');
  await db.query(`UPDATE jobs SET status='succeeded'`);
  assert.equal(await seanTick(db, only(cfg), t0 + 61 * 60_000), 1, 'follow-ups: their due-time check every hour');
  await db.query(`UPDATE jobs SET status='succeeded'`);
  assert.equal(await seanTick(db, only(cfg), t0 + 6 * 3_600_000), 2, 'the next 6-hour slot');
  assert.ok((await jobs('sean.draft')).every((j) => j.request_id.startsWith('backup:sean.draft:360:')));
  assert.equal(await seanTick(db, conf({ SEAN_DRAFT_BACKUP_EVERY_MIN: '0', SEAN_FOLLOWUP_EVERY_MIN: '0' }), t0 + 12 * 3_600_000), 0, '0 = off');
  await db.query('TRUNCATE jobs RESTART IDENTITY CASCADE');
  // The other sweeps: one per 6 hours, then nothing until the next slot.
  const quiet = { ...cfg, atlasOn: false, siennaOn: true, hqSessionSecret: undefined } as Config;
  const n1 = await agentsTick(db, quiet, new Date(t0));
  assert.ok(n1 >= 4, `campaign.pipeline, sales.won_sync, riley.collect, cole.review, sienna.prep: ${n1}`);
  await db.query(`UPDATE jobs SET status='succeeded'`);
  assert.equal(await agentsTick(db, quiet, new Date(t0 + 30 * 60_000)), 0, 'no 30-minute or hourly runs any more');
  assert.equal(await accountHealthTick(db, cfg, t0), 1);
  assert.equal(await accountHealthTick(db, cfg, t0 + 60_000), 0);
  // Bounce check sweep (it reads the skip list first): a fake list.
  assert.equal(await scheduleTick(db, cfg, t0, { list: async () => [] } as any), 1);
  assert.equal(await scheduleTick(db, cfg, t0 + 30 * 60_000, { list: async () => [] } as any), 0);
});

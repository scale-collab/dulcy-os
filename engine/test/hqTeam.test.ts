// HQ agent task lists (Alex 2026-11-25: "the task should be assigned to them, and we could see and
// ask for progress"), Ada's daily stale-task check, the Needs you day switcher (yesterday / today /
// tomorrow) and "where is X?" in chat. Never calls a real service: Airtable and the model are fakes.
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
import {
  upsertAgentTask, closeAgentTask, listAgentTasks, taskFlags, workSummary, checkStaleTasks, agentWorkLines, staleWhy, MAX_REQUEUES, type AgentTask,
} from '../src/hq/agentTasks.js';
import { planTaskView, syncPlanTasks, syncDecisionTasks } from '../src/hq/generators.js';
import { aggregateNeeds, handledItems, rankNeeds, tomorrowItems, type DaySources, type NeedItem } from '../src/hq/needs.js';
import { addAsk } from '../src/hq/asks.js';
import { writeBrief } from '../src/agents/ada.js';
import { DECISIONS, DF } from '../src/decisions/fields.js';
import { ISSUES, IF } from '../src/agents/riley.js';
import type { ChatModel } from '../src/hq/chat.js';
import { _resetClientCache, addDays, nyDate } from '../src/hq/tasks.js';

const url = process.env.TEST_DATABASE_URL;
const skip = !url ? 'TEST_DATABASE_URL not set' : false;
const PW = 'correct horse battery staple';
let db: Db;
let server: http.Server;
let port = 0;
let webDir: string;

let tables: Record<string, Record<string, Record<string, unknown>>>;
let writes: { table: string; id: string }[];
const at = {
  async list(table: string) { return Object.entries(tables[table] ?? {}).map(([id, fields]) => ({ id, fields: { ...fields }, createdTime: String(fields._created ?? '2026-11-25T10:00:00.000Z') })); },
  async get(table: string, id: string) { const f = tables[table]?.[id]; return f ? { id, fields: { ...f } } : null; },
  async create(table: string, fields: Record<string, unknown>) { const id = `recNEW${String(Object.keys(tables[table] ?? {}).length).padStart(11, '0')}`; (tables[table] ??= {})[id] = { ...fields }; writes.push({ table, id }); return id; },
  async update(table: string, id: string, fields: Record<string, unknown>) { Object.assign(((tables[table] ??= {})[id] ??= {}), fields); writes.push({ table, id }); },
};
let script: ((messages: any[]) => any)[];
let seen: any[][];
const model: ChatModel = async (_s, _v, messages) => {
  seen.push(JSON.parse(JSON.stringify(messages)));
  const step = script.shift();
  return step ? step(messages) : { content: [{ type: 'text', text: 'Nothing more. Sources: none' }], stop_reason: 'end_turn' };
};

function cfg(over: Partial<Config> = {}): Config {
  return { ...loadConfig({ ENGINE_SECRET: 'x'.repeat(40), DATABASE_URL: url ?? 'postgres://x', HQ_SESSION_SECRET: 's'.repeat(40), HQ_HOST: 'hq.test.local' } as NodeJS.ProcessEnv), airtableApiKey: undefined, anthropicApiKey: undefined, ...over };
}
function call(method: string, p: string, opts: { body?: unknown; cookie?: string } = {}): Promise<{ status: number; body: any; headers: http.IncomingHttpHeaders }> {
  return new Promise((resolve, reject) => {
    const host = `127.0.0.1:${port}`;
    const data = opts.body === undefined ? undefined : JSON.stringify(opts.body);
    const headers: Record<string, string> = { host };
    if (data !== undefined) { headers['content-type'] = 'application/json'; headers.origin = `https://${host}`; }
    if (opts.cookie) headers.cookie = opts.cookie;
    const req = http.request({ host: '127.0.0.1', port, method, path: p, headers }, (res) => {
      const chunks: Buffer[] = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => { let body: any = null; try { body = JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { /* not json */ } resolve({ status: res.statusCode ?? 0, body, headers: res.headers }); });
    });
    req.on('error', reject);
    if (data !== undefined) req.write(data);
    req.end();
  });
}
async function login(email = 'alex@dulcy.io', password = PW) {
  const r = await call('POST', '/hq/api/auth/login', { body: { email, password } });
  return ([] as string[]).concat(r.headers['set-cookie'] ?? []).map((c) => c.split(';')[0]).find((c) => c.startsWith('__Host-hq_session=')) ?? '';
}

before(async () => {
  webDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hqteam-'));
  fs.writeFileSync(path.join(webDir, 'index.html'), '<!doctype html><title>Dulcy HQ</title>');
  if (skip) return;
  db = createPool(url!); await migrate(db);
  server = createServer(db, cfg(), { at: at as any, chatModel: model, webDir });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', () => r()));
  port = (server.address() as AddressInfo).port;
});
after(async () => { if (!skip) { server.close(); await db.end(); } fs.rmSync(webDir, { recursive: true, force: true }); });
beforeEach(async () => {
  tables = {}; writes = []; script = []; seen = []; _resetClientCache();
  if (skip) return;
  await db.query('TRUNCATE hq_users, hq_sessions, hq_login_attempts, hq_user_events, hq_chat_threads, hq_chat_messages, hq_agent_tasks, hq_asks, hq_needs_quiet, campaign_plans, jobs, steps, receipts, events RESTART IDENTITY CASCADE');
  await upsertUser(db, 'Alex@dulcy.io', 'owner', PW, 'Alex');
});

const NOW = new Date('2026-11-26T15:00:00.000Z'); // Thu Nov 26, 10:00 New York
const ago = (h: number) => new Date(NOW.getTime() - h * 3_600_000).toISOString();
const task = (over: Partial<AgentTask> = {}): AgentTask => ({
  id: 1, key: 'k', agent: 'Riley', title: 'Bounce check: TW Food (5%)', due: null, status: 'in_progress', client: '', note: 'Reading the codes', notes: '', link: null, priority: 'normal',
  created: ago(100), updated: ago(1), done: null, jobKind: null, waitingUntil: null, decision: null, requeues: 0, overdue: false, stalled: false, daysLate: 0, daysQuiet: 0, ...over,
});

// ---------- the helper ----------
test('upsertAgentTask: one task per key; same values change nothing; a change moves the last update; done reopens', { skip }, async () => {
  const a = await upsertAgentTask(db, { agent: 'riley', key: 'bounce:66:604', title: 'Bounce check: TW Food', status: 'in_progress', note: 'Queued', due: '2026-11-27', link: 'decisions/Campaigns', client: 'Twenty West', job: { kind: 'bounce.investigate', recordId: 'bounce-investigate:604', input: { campaignId: 604 } } });
  assert.ok(!('error' in a) && a.created && a.changed);
  const row = async () => (await db.query(`SELECT *, to_char(due_date,'YYYY-MM-DD') AS due FROM hq_agent_tasks WHERE source_key='bounce:66:604'`)).rows[0];
  const first = await row();
  assert.deepEqual([first.agent, first.status, first.progress_note, first.due, first.link, first.client, first.job_kind, first.job_input.campaignId], ['Riley', 'in_progress', 'Queued', '2026-11-27', 'decisions/Campaigns', 'Twenty West', 'bounce.investigate', 604]);
  await db.query(`UPDATE hq_agent_tasks SET updated_at = now() - interval '3 days'`);
  const same = await upsertAgentTask(db, { agent: 'Riley', key: 'bounce:66:604', title: 'Bounce check: TW Food', note: 'Queued' });
  assert.ok(!('error' in same) && !same.created && !same.changed, 'same values: no change');
  assert.ok(Date.now() - (await row()).updated_at.getTime() > 2 * 86_400_000, 'the last update did not move');
  assert.equal((await row()).job_kind, 'bounce.investigate', 'left out = kept');
  const moved = await upsertAgentTask(db, { agent: 'Riley', key: 'bounce:66:604', title: 'Bounce check: TW Food', note: 'Diagnosed: account', status: 'waiting_alex', job: null, decision: 'recDEC00000000001' });
  assert.ok(!('error' in moved) && moved.changed);
  const m = await row();
  assert.ok(Date.now() - m.updated_at.getTime() < 60_000);
  assert.deepEqual([m.status, m.job_kind, m.decision_rec], ['waiting_alex', null, 'recDEC00000000001']);
  assert.equal(await closeAgentTask(db, 'bounce:66:604', 'Fixed: resumed'), true);
  const d = await row();
  assert.deepEqual([d.status, d.done_note, d.progress_note], ['done', 'Fixed: resumed', 'Fixed: resumed']);
  assert.ok(d.done_at);
  assert.equal(await closeAgentTask(db, 'bounce:66:604', 'again'), false, 'already done');
  assert.equal(await closeAgentTask(db, 'nope', 'x'), false);
  // Reopened by the next investigation of the same campaign.
  await upsertAgentTask(db, { agent: 'Riley', key: 'bounce:66:604', title: 'Bounce check: TW Food', status: 'in_progress', note: 'Queued again' });
  const r = await row();
  assert.deepEqual([r.status, r.done_at, r.done_note], ['in_progress', null, null]);
  assert.equal((await db.query(`SELECT count(*)::int AS n FROM hq_agent_tasks`)).rows[0].n, 1, 'one task per key');
  // Bad input is refused, never thrown.
  assert.match(String((await upsertAgentTask(db, { agent: 'Sean', key: 'x', title: 'y' }) as any).error ?? 'ok'), /ok/, 'Sean reads as Echo');
  assert.equal((await db.query(`SELECT agent FROM hq_agent_tasks WHERE source_key='x'`)).rows[0].agent, 'Echo');
  assert.match((await upsertAgentTask(db, { agent: 'Bob', key: 'x2', title: 'y' }) as any).error, /unknown agent/);
  assert.match((await upsertAgentTask(db, { agent: 'Atlas', key: '', title: 'y' }) as any).error, /key/);
  assert.match((await upsertAgentTask(db, { agent: 'Atlas', key: 'x3', title: 'y', link: 'javascript:alert(1)' }) as any).error, /link/);
  assert.match((await upsertAgentTask(db, { agent: 'Atlas', key: 'x4', title: 'y', status: 'later' as any }) as any).error, /status/);
});

test('old rows keep working: a task written the old way lists with its notes and can be finished', { skip }, async () => {
  await db.query(`INSERT INTO hq_agent_tasks (agent, title, due_date, notes, client, source_key) VALUES ('Atlas','Plan next campaign for GMG','2026-11-28','GMG US is at 64% sent.','GMG','plan-next:recC')`);
  const [t] = await listAgentTasks(db, {}, NOW);
  assert.deepEqual([t.status, t.title, t.notes, t.due, t.overdue, t.stalled], ['open', 'Plan next campaign for GMG', 'GMG US is at 64% sent.', '2026-11-28', false, false]);
  const cookie = await login();
  assert.equal((await call('POST', `/hq/api/agent-tasks/${t.id}/done`, { body: {}, cookie })).body.ok, true);
  assert.equal((await listAgentTasks(db)).length, 0);
  assert.equal((await listAgentTasks(db, { doneDays: 7 })).length, 1, 'done in the last 7 days');
});

test('flags: overdue = due before today (New York); stalled = no change for 2+ days, unless a planned wait', () => {
  assert.deepEqual(taskFlags({ status: 'in_progress', due: '2026-11-24', updated: ago(5), waitingUntil: null }, NOW), { overdue: true, stalled: false, daysLate: 2, daysQuiet: 0 });
  assert.equal(taskFlags({ status: 'in_progress', due: '2026-11-26', updated: ago(5), waitingUntil: null }, NOW).overdue, false, 'due today is not late');
  assert.deepEqual(taskFlags({ status: 'open', due: null, updated: ago(49), waitingUntil: null }, NOW), { overdue: false, stalled: true, daysLate: 0, daysQuiet: 2 });
  assert.equal(taskFlags({ status: 'open', due: null, updated: ago(47), waitingUntil: null }, NOW).stalled, false);
  assert.equal(taskFlags({ status: 'in_progress', due: null, updated: ago(100), waitingUntil: '2026-12-03T22:00:00.000Z' }, NOW).stalled, false, 'resting until the retest');
  assert.equal(taskFlags({ status: 'in_progress', due: null, updated: ago(100), waitingUntil: ago(1) }, NOW).stalled, true, 'the wait is over');
  assert.equal(taskFlags({ status: 'done', due: '2026-01-01', updated: ago(900), waitingUntil: null }, NOW).overdue, false, 'done is never late');
  const s = workSummary([task(), task({ id: 2, status: 'waiting_alex', overdue: true }), task({ id: 3, stalled: true, agent: 'Atlas' }), task({ id: 4, status: 'done' })], ['Atlas', 'Riley', 'Echo']);
  assert.deepEqual(s, [
    { agent: 'Atlas', open: 1, inProgress: 1, waitingAlex: 0, overdue: 0, stalled: 1 },
    { agent: 'Riley', open: 2, inProgress: 1, waitingAlex: 1, overdue: 1, stalled: 0 },
    { agent: 'Echo', open: 0, inProgress: 0, waitingAlex: 0, overdue: 0, stalled: 0 },
  ]);
  assert.equal(staleWhy(task({ overdue: true, daysLate: 2, stalled: true, daysQuiet: 3 })), '2 d overdue, no update for 3 d');
  assert.equal(staleWhy(task({ status: 'waiting_alex', stalled: true, daysQuiet: 4 })), 'waiting on you 4 d');
});

// ---------- Ada's daily stale-task check ----------
test("Ada's stale check: late or stuck tasks one line each; a stuck job is re-queued once a day (dry run unless live), capped", { skip }, async () => {
  const conf = cfg({ dryRun: true, liveStages: [] });
  await upsertAgentTask(db, { agent: 'Riley', key: 'bounce:66:604', title: 'Bounce check: TW Food (5%)', status: 'in_progress', note: 'Reading the codes', job: { kind: 'bounce.investigate', recordId: 'bounce-investigate:604', input: { teamId: 66, campaignId: 604 } } });
  await upsertAgentTask(db, { agent: 'Riley', key: 'rest:recA', title: 'Rest a@x.com until its retest', status: 'in_progress', note: 'Resting', waitingUntil: new Date(Date.now() + 3 * 86_400_000), job: { kind: 'account.health', recordId: 'account-health' } });
  await upsertAgentTask(db, { agent: 'Atlas', key: 'plan:1', title: 'New campaign for GMG', status: 'waiting_alex', note: 'Plan + sample waiting for your OK', due: addDays(nyDate(new Date()), -6) });
  await upsertAgentTask(db, { agent: 'Atlas', key: 'plan:2', title: 'New campaign for MJJ', status: 'in_progress', note: 'Finding contacts', job: { kind: 'no.such.stage', recordId: 'x' } });
  await upsertAgentTask(db, { agent: 'Echo', key: 'fresh', title: 'On time', status: 'in_progress', note: 'Moving', due: '2099-01-01' });
  await db.query(`UPDATE hq_agent_tasks SET updated_at = now() - interval '3 days' WHERE source_key <> 'fresh'`);

  // Check only (the brief in dry run): nothing queued.
  const look = await checkStaleTasks(db, conf, { apply: false });
  assert.deepEqual(look.map((l) => [l.title, l.action]), [
    ['New campaign for GMG', 'flagged'], ['Bounce check: TW Food (5%)', 'would_requeue'], ['New campaign for MJJ', 'flagged'],
  ], 'the resting account and the on-time task are not listed; an unknown job kind is only flagged');
  assert.equal((await db.query(`SELECT count(*)::int AS n FROM jobs`)).rows[0].n, 0);

  const lines = await checkStaleTasks(db, conf, { apply: true });
  const b = lines.find((l) => l.title.startsWith('Bounce'))!;
  assert.equal(b.action, 'requeued');
  const job = (await db.query(`SELECT kind, record_id, dry_run, input, request_id FROM jobs`)).rows;
  assert.equal(job.length, 1);
  assert.deepEqual([job[0].kind, job[0].record_id, job[0].dry_run, job[0].input.campaignId], ['bounce.investigate', 'bounce-investigate:604', true, 604], 'the normal queue: dry run unless bounce.investigate is live');
  const t = (await db.query(`SELECT progress_note, requeues, updated_at FROM hq_agent_tasks WHERE source_key='bounce:66:604'`)).rows[0];
  assert.match(t.progress_note, /^Re-queued by Ada \(job \d+\)/);
  assert.equal(t.requeues, 1);
  assert.equal(lines.find((l) => l.title.includes('GMG'))!.why, '6 d overdue, waiting on you 3 d');

  // The same day again: the task moved, so it is not stuck; even forced stale, the request id stops a second job.
  await db.query(`UPDATE hq_agent_tasks SET updated_at = now() - interval '3 days'`);
  await checkStaleTasks(db, conf, { apply: true });
  assert.equal((await db.query(`SELECT count(*)::int AS n FROM jobs`)).rows[0].n, 1, 'one re-queue per task per day');
  // A job still running for that record is left alone.
  await db.query(`UPDATE jobs SET status='running'`);
  await db.query(`UPDATE hq_agent_tasks SET requeues=0`);
  const live = cfg({ dryRun: true, liveStages: ['bounce.investigate'] });
  const running = await checkStaleTasks(db, live, { apply: true, now: new Date(Date.now() + 86_400_000) });
  assert.equal(running.find((l) => l.title.startsWith('Bounce'))!.action, 'running');
  // The cap: after MAX_REQUEUES only a flag.
  await db.query(`UPDATE hq_agent_tasks SET requeues=$1`, [MAX_REQUEUES]);
  assert.equal((await checkStaleTasks(db, live, { apply: true })).find((l) => l.title.startsWith('Bounce'))!.action, 'flagged');

  // The brief: a short section, one line each, at most 5 + "more on Team".
  const out = agentWorkLines(lines);
  assert.equal(out.length, 3);
  assert.match(out[0], /^• Atlas: New campaign for GMG \(6 d overdue, waiting on you 3 d\)$/);
  assert.match(out[1], /^• Riley: Bounce check: TW Food \(5%\) \(no update for 3 d\) → re-queued$/);
  assert.equal(agentWorkLines(Array.from({ length: 8 }, () => lines[0])).at(-1), '• +3 more on Team');
  const brief = writeBrief({ now: NOW, decisions: [], replies: [], campaigns: [], accounts: [], purchases: 0, activity: [], clientName: (x) => x, agentWork: out });
  assert.match(brief, /\*Agent work \(late or stuck\):\*\n• Atlas: New campaign for GMG/);
  assert.match(writeBrief({ now: NOW, decisions: [], replies: [], campaigns: [], accounts: [], purchases: 0, activity: [], clientName: (x) => x, agentWork: [] }), /\*Agent work:\* every task is on time and moving/);
  assert.doesNotMatch(writeBrief({ now: NOW, decisions: [], replies: [], campaigns: [], accounts: [], purchases: 0, activity: [], clientName: (x) => x }), /Agent work/, 'no section when the check did not run');
});

// ---------- Atlas: new campaigns as tasks ----------
test('Atlas campaign tasks: one per plan, following its state; only a change moves it; decided tasks follow the Decision', { skip }, async () => {
  assert.deepEqual(Object.values(planTaskView({ id: 3, client: 'GMG', state: 'planning', copy_state: null, plan_error: null, campaign_name: '', created_at: ago(1), updated_at: ago(1) })).slice(0, 2), ['in_progress', 'Writing the plan: thesis, ICP, 2 Email-1 angles']);
  assert.equal(planTaskView({ id: 3, client: 'GMG', state: 'planning', copy_state: null, plan_error: null, campaign_name: '', created_at: ago(1), updated_at: ago(1) }).job?.kind, 'atlas.plan');
  assert.equal(planTaskView({ id: 3, client: 'GMG', state: 'approval2', copy_state: 'ready', plan_error: null, campaign_name: '', created_at: ago(1), updated_at: ago(1) }).status, 'waiting_alex');
  assert.match(planTaskView({ id: 3, client: 'GMG', state: 'stuck', copy_state: null, plan_error: 'leadlist.verify failed', campaign_name: '', created_at: ago(1), updated_at: ago(1) }).note, /Stuck: leadlist.verify failed\. Retry: campaign-plan-retry 3/);
  assert.ok(planTaskView({ id: 3, client: 'GMG', state: 'client_review', copy_state: 'ready', plan_error: null, campaign_name: '', created_at: ago(1), updated_at: ago(1) }).waitingUntil, 'the client has 48 business hours');

  await db.query(`INSERT INTO campaign_plans (trigger_key, ws_rec, client, state, plan, created_at) VALUES ('next:recC1','recWS1','GLOBALMEDIAGROUP LTD','sample','{"campaign_name":"[GMG] US Manufacturers"}', '2026-11-24T15:00:00Z'), ('next:recOLD','recWS2','MJJ','live',NULL, now())`);
  assert.deepEqual(await syncPlanTasks(db), { synced: 2, changed: 1 }, 'an already-finished plan opens no task');
  let [t] = await listAgentTasks(db);
  assert.deepEqual([t.agent, t.title, t.status, t.note, t.due, t.priority], ['Atlas', 'New campaign for GMG / Scroll Stop', 'in_progress', 'Running the first-100 company sample', '2026-12-01', 'high']);
  assert.equal((await syncPlanTasks(db)).changed, 0, 'same state: nothing moves');
  await db.query(`UPDATE campaign_plans SET state='approval1' WHERE id=1`);
  await syncPlanTasks(db);
  [t] = await listAgentTasks(db);
  assert.deepEqual([t.status, t.link], ['waiting_alex', 'decisions/Campaigns']);
  await db.query(`UPDATE campaign_plans SET state='live' WHERE id=1`);
  await syncPlanTasks(db);
  assert.equal((await listAgentTasks(db)).length, 0, 'live = done');

  // A task waiting on a Decision: ❌ closes it, ✅ moves it to in progress (the fix job closes it).
  tables[DECISIONS] = { recDEC00000000001: { [DF.status]: 'Rejected', [DF.decidedBy]: 'Alex' }, recDEC00000000002: { [DF.status]: 'Approved', [DF.decidedBy]: 'Alex' }, recDEC00000000003: { [DF.status]: 'New' } };
  for (const n of [1, 2, 3]) await upsertAgentTask(db, { agent: 'Riley', key: `bounce:${n}`, title: `Bounce ${n}`, status: 'waiting_alex', note: 'waiting', decision: `recDEC0000000000${n}` });
  assert.equal(await syncDecisionTasks(db, at), 2);
  const st = Object.fromEntries((await db.query(`SELECT source_key, status, progress_note FROM hq_agent_tasks WHERE source_key LIKE 'bounce:%'`)).rows.map((r) => [r.source_key, [r.status, r.progress_note]]));
  assert.deepEqual(st, { 'bounce:1': ['done', 'Alex said no in Decisions: nothing changed'], 'bounce:2': ['in_progress', 'Alex approved: the fix is running'], 'bounce:3': ['waiting_alex', 'waiting'] });
  assert.equal(writes.length, 0, 'reads Airtable only');
});

// ---------- Team API ----------
test('Team API: per-agent counts (open, overdue, stalled) and each agent page lists its tasks with status and progress; members never see Ledger', { skip }, async () => {
  await upsertAgentTask(db, { agent: 'Riley', key: 'a', title: 'Bounce check: TW', status: 'in_progress', note: 'Reading the codes' });
  await upsertAgentTask(db, { agent: 'Riley', key: 'b', title: 'Rest a@x until retest', status: 'waiting_alex', note: 'Replace?', due: '2020-01-01' });
  await upsertAgentTask(db, { agent: 'Atlas', key: 'c', title: 'New campaign for GMG', status: 'in_progress', note: 'Sample' });
  await upsertAgentTask(db, { agent: 'Ledger', key: 'd', title: 'Reconcile November', status: 'open' });
  await upsertAgentTask(db, { agent: 'Riley', key: 'e', title: 'Old fix', status: 'done', note: 'Fixed' });
  await db.query(`UPDATE hq_agent_tasks SET updated_at = now() - interval '3 days' WHERE source_key='c'`);
  const cookie = await login();
  const r = await call('GET', '/hq/api/agents', { cookie });
  assert.equal(r.status, 200);
  const w = Object.fromEntries(r.body.work.map((x: any) => [x.agent, x]));
  assert.deepEqual(w.Riley, { agent: 'Riley', open: 2, inProgress: 1, waitingAlex: 1, overdue: 1, stalled: 0 });
  assert.deepEqual([w.Atlas.open, w.Atlas.stalled], [1, 1]);
  assert.equal(r.body.agents.find((a: any) => a.name === 'Riley').openTasks, 2);
  const p = await call('GET', '/hq/api/agents/Riley', { cookie });
  assert.deepEqual(p.body.tasks.map((t: any) => [t.title, t.status, t.note]), [['Rest a@x until retest', 'waiting_alex', 'Replace?'], ['Bounce check: TW', 'in_progress', 'Reading the codes'], ['Old fix', 'done', 'Fixed']]);
  assert.equal(p.body.tasks[0].overdue, true);
  assert.ok(p.body.tasks[0].updated);
  assert.equal(p.body.work.open, 2);
  await upsertUser(db, 'josh@dulcy.io', 'member', 'josh long password 1', 'Josh');
  const j = await login('josh@dulcy.io', 'josh long password 1');
  const m = await call('GET', '/hq/api/agents', { cookie: j });
  assert.ok(!m.body.work.some((x: any) => x.agent === 'Ledger'));
  assert.equal((await call('GET', '/hq/api/agents/Ledger', { cookie: j })).status, 404);
});

// ---------- Needs you: Today ranking, Yesterday, Tomorrow ----------
const need = (over: Partial<NeedItem>): NeedItem => ({ key: 'k', kind: 'ask', group: 'now', agent: 'Atlas', title: 't', why: '', steps: '', action: null, link: null, canDone: true, canSnooze: true, at: ago(1), rank: 3, money: false, clientFacing: false, ...over });

test("Ada's order (cheap rules): importance first, then Do now, then money and client-facing, then the oldest", () => {
  const ranked = rankNeeds([
    need({ key: 'low-rank-old', rank: 6, at: ago(50) }),
    need({ key: 'r2-later-money', rank: 2, group: 'later', money: true, at: ago(60) }),
    need({ key: 'r2-now-plain', rank: 2, at: ago(3) }),
    need({ key: 'decisions', rank: 1, at: ago(1) }),
    need({ key: 'r2-now-client', rank: 2, clientFacing: true, at: ago(1) }),
    need({ key: 'r2-now-old', rank: 2, at: ago(30) }),
  ], NOW.getTime());
  assert.deepEqual(ranked.map((n) => n.key), ['decisions', 'r2-now-client', 'r2-now-old', 'r2-now-plain', 'r2-later-money', 'low-rank-old']);
  // An ask due later is not on Today; due today or late is "Do now"; money asks count as money.
  const ask = (id: number, over: object = {}) => ({ id, agent: 'Atlas', title: `Ask ${id}`, why: '', steps: '', actionLabel: '', actionUrl: '', priority: 'normal' as const, audience: 'owner' as const, dedupeKey: `k${id}`, created: ago(5), done: null, doneBy: null, snoozedUntil: null, ...over });
  const items = aggregateNeeds({ owner: true, decisions: [], issues: [], signups: 0, asks: [ask(1, { due: '2026-11-27' }), ask(2, { due: '2026-11-26' }), ask(3, { money: true }), ask(4)], now: NOW.getTime() });
  assert.deepEqual(items.map((i) => [i.key, i.group]), [['ask:2', 'now'], ['ask:3', 'later'], ['ask:4', 'later']]);
  assert.equal(items[1].money, true);
});


test('Yesterday: what got handled, one item per pile and per agent; Tomorrow: back from "Not now" and due tomorrow (pure)', () => {
  const y = '2026-11-25T18:00:00.000Z', older = '2026-11-23T18:00:00.000Z', today = '2026-11-26T14:00:00.000Z';
  const src: DaySources = {
    owner: true, now: NOW.getTime(),
    decided: [
      { id: 'r1', pile: 'Replies', agent: 'Echo', title: 'Reply to Jane', status: 'Approved', decidedAt: y, decidedBy: 'Alex' },
      { id: 'r2', pile: 'Replies', agent: 'Echo', title: 'Reply to Bo', status: 'Rejected', decidedAt: y, decidedBy: 'Josh' },
      { id: 'r3', pile: 'Replies', agent: 'Echo', title: 'Reply today', status: 'Approved', decidedAt: today, decidedBy: 'Alex' },
      { id: 'm1', pile: 'Money', agent: 'Ledger', title: 'Buy 2 inboxes', status: 'Approved', decidedAt: y, decidedBy: 'Alex' },
      { id: 'c1', pile: 'Campaigns', agent: 'Atlas', title: 'Bounce fix', status: 'Approved', decidedAt: older, decidedBy: 'Alex' },
    ],
    asks: [
      { id: 7, agent: 'Atlas', title: 'Reply to Pete', why: '', steps: '', actionLabel: '', actionUrl: '', priority: 'normal', audience: 'owner', dedupeKey: 'a', created: older, done: y, doneBy: 'Alex', snoozedUntil: null },
      { id: 8, agent: 'Echo', title: 'Check the rules', why: 'w', steps: '', actionLabel: '', actionUrl: '', priority: 'normal', audience: 'everyone', dedupeKey: 'b', created: older, done: null, doneBy: null, snoozedUntil: '2026-11-27T15:00:00.000Z' },
      { id: 9, agent: 'Atlas', title: 'Send the GMG report', why: '', steps: '', actionLabel: '', actionUrl: '', priority: 'normal', audience: 'owner', dedupeKey: 'c', created: older, done: null, doneBy: null, snoozedUntil: null, due: '2026-11-27', clientFacing: true },
      { id: 10, agent: 'Atlas', title: 'Snoozed to Monday', why: '', steps: '', actionLabel: '', actionUrl: '', priority: 'normal', audience: 'owner', dedupeKey: 'd', created: older, done: null, doneBy: null, snoozedUntil: '2026-11-30T13:00:00.000Z' },
    ],
    fixed: [{ id: 'recI1', title: 'Xero login expired', at: y }, { id: 'recI2', title: 'Old', at: older }],
    tasks: [
      task({ id: 1, agent: 'Riley', title: 'Bounce check: TW', status: 'done', done: y, note: 'Fixed: resumed' }),
      task({ id: 2, agent: 'Riley', title: 'Rest a@x', status: 'done', done: y, note: 'Recovered' }),
      task({ id: 3, agent: 'Ledger', title: 'Reconcile', status: 'done', done: y }),
      task({ id: 4, agent: 'Atlas', title: 'New campaign for MJJ', status: 'waiting_alex', due: '2026-11-27', note: 'Copy waiting for your OK', link: 'decisions/Campaigns' }),
    ],
    signupEvents: [y], issues: [{ id: 'recI3', title: 'Renew the key', why: 'It expired.', fix: '1. Renew', decision: '', seen: older }],
    quietUntil: new Map([['issue:recI3', '2026-11-27T15:00:00.000Z']]),
  };
  const yk = handledItems(src);
  assert.deepEqual(yk.map((i) => i.key).sort(), ['handled:ask:7', 'handled:issue:recI1', 'handled:pile:Money', 'handled:pile:Replies', 'handled:signups', 'handled:tasks:Ledger', 'handled:tasks:Riley']);
  const replies = yk.find((i) => i.key === 'handled:pile:Replies')!;
  assert.deepEqual([replies.title, replies.outcome, replies.agent, replies.count], ['2 replies handled', '1 sent · 1 skipped', 'Echo', 2]);
  assert.equal(yk.find((i) => i.key === 'handled:pile:Money')!.title, '1 money decision decided');
  assert.deepEqual([yk.find((i) => i.key === 'handled:tasks:Riley')!.title, yk.find((i) => i.key === 'handled:tasks:Riley')!.why], ['Riley closed 2 tasks', 'Bounce check: TW; Rest a@x']);
  assert.equal(yk.find((i) => i.key === 'handled:ask:7')!.outcome, 'Done by Alex');
  assert.ok(yk.every((i) => !i.canDone && !i.canSnooze), 'yesterday is read only');
  assert.ok(yk[0].money || yk[0].clientFacing, 'money and client-facing first');
  // A member: no money, no Ledger, no Riley fixes, no sign-ups.
  assert.deepEqual(handledItems({ ...src, owner: false }).map((i) => i.key).sort(), ['handled:pile:Replies', 'handled:tasks:Riley']);

  const tk = tomorrowItems(src);
  // Ada's order: the task waiting on you and Riley's fix (more important) before the asks; inside, due tomorrow before what comes back.
  assert.deepEqual(tk.map((i) => [i.key, i.outcome]), [['task:4', 'Due tomorrow'], ['issue:recI3', 'Back tomorrow'], ['ask:9', 'Due tomorrow'], ['ask:8', 'Back tomorrow']]);
  assert.equal(tk.find((i) => i.key === 'ask:8')!.canDone, true, 'an ask can be finished early');
  assert.equal(tk.find((i) => i.key === 'ask:8')!.canSnooze, false);
  assert.deepEqual(tomorrowItems({ ...src, owner: false }).map((i) => i.key), ['ask:8'], 'members: only their asks');
});

test('Needs API: ?day=yesterday|today|tomorrow (default today), 400 otherwise; dates in New York; never writes Airtable', { skip }, async () => {
  const yIso = new Date(Date.now() - 86_400_000).toISOString();
  tables[DECISIONS] = {
    recDONE0000000001: { [DF.title]: 'Reply to Jane', [DF.agent]: 'Echo', [DF.status]: 'Approved', [DF.action]: 'Approve Reply', [DF.decidedAt]: yIso, [DF.decidedBy]: 'Alex' },
    recWAIT0000000001: { [DF.title]: 'Reply to Bo', [DF.agent]: 'Echo', [DF.status]: 'New', [DF.action]: 'Approve Reply' },
  };
  tables[ISSUES] = { recISSUE000000001: { [IF.title]: 'Xero login expired', [IF.status]: 'Fixed', [IF.appliedAt]: yIso } };
  const tomorrow = new Date(Date.now() + 86_400_000).toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
  await addAsk(db, { agent: 'Atlas', title: 'Send the GMG report', due: tomorrow, clientFacing: true });
  await addAsk(db, { agent: 'Atlas', title: 'Reply to Pete' });
  await assert.rejects(addAsk(db, { agent: 'Atlas', title: 'Bad due', due: 'friday' }), /Due must be a date/);
  await upsertAgentTask(db, { agent: 'Riley', key: 'x', title: 'Bounce check: TW', status: 'done', note: 'Fixed' });
  await db.query(`UPDATE hq_agent_tasks SET done_at = $1`, [yIso]);
  const cookie = await login();
  assert.equal((await call('GET', '/hq/api/needs?day=someday', { cookie })).status, 400);
  const t = await call('GET', '/hq/api/needs', { cookie });
  assert.equal(t.body.day, 'today');
  assert.deepEqual(t.body.items.map((i: any) => i.key), ['decisions', 'ask:2'], 'the ask due tomorrow is not on Today');
  assert.equal(t.body.items[0].clientFacing, true);
  const y = await call('GET', '/hq/api/needs?day=yesterday', { cookie });
  assert.equal(y.body.date, new Date(Date.now() - 86_400_000).toLocaleDateString('en-CA', { timeZone: 'America/New_York' }));
  assert.deepEqual(y.body.items.map((i: any) => i.key).sort(), ['handled:issue:recISSUE000000001', 'handled:pile:Replies', 'handled:tasks:Riley']);
  const tm = await call('GET', '/hq/api/needs?day=tomorrow', { cookie });
  assert.equal(tm.body.date, tomorrow);
  assert.deepEqual(tm.body.items.map((i: any) => [i.key, i.outcome]), [['ask:1', 'Due tomorrow']]);
  // "Not now" on today's ask → it shows on Tomorrow.
  assert.equal((await call('POST', '/hq/api/asks/2/snooze', { body: { until: 'tomorrow' }, cookie })).status, 200);
  assert.deepEqual((await call('GET', '/hq/api/needs?day=tomorrow', { cookie })).body.items.map((i: any) => i.key).sort(), ['ask:1', 'ask:2']);
  assert.equal(writes.length, 0);
});

// ---------- Chat: "where is X?" ----------
test('chat: "where is the GMG campaign?" answers from the agent tasks, citing the task', { skip }, async () => {
  await upsertAgentTask(db, { agent: 'Atlas', key: 'plan:1', title: 'New campaign for GMG', client: 'GLOBALMEDIAGROUP', status: 'waiting_alex', note: 'Copy + list waiting for your OK (approval 2)', due: '2026-12-01' });
  await upsertAgentTask(db, { agent: 'Riley', key: 'r', title: 'Bounce check: MJJ', status: 'in_progress', note: 'Reading' });
  await upsertAgentTask(db, { agent: 'Ledger', key: 'l', title: 'GMG invoice check', status: 'in_progress', note: 'money' });
  script = [
    () => ({ content: [{ type: 'tool_use', id: 't1', name: 'agent_todo', input: { search: 'GMG' } }], stop_reason: 'tool_use' }),
    () => ({ content: [{ type: 'text', text: 'GMG: the copy and list wait for your OK (approval 2), due Dec 1. Sources: HQ task #1' }], stop_reason: 'end_turn' }),
  ];
  await upsertUser(db, 'josh@dulcy.io', 'member', 'josh long password 1', 'Josh');
  const j = await login('josh@dulcy.io', 'josh long password 1');
  const r = await call('POST', '/hq/api/chat', { body: { agent: 'Ada', message: 'Where is the GMG campaign?' }, cookie: j });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.deepEqual(r.body.reply.sources, ['HQ agent task lists']);
  const result = seen[1].at(-1).content[0];
  const data = JSON.parse(result.content);
  assert.deepEqual(data.map((x: any) => [x.task, x.status, x.progress]), [['HQ task #1', 'waiting_alex', 'Copy + list waiting for your OK (approval 2)']], 'only GMG, and a member never sees Ledger');
  assert.ok(data[0].last_update);
  assert.match(r.body.reply.text, /HQ task #1/);
});

// Account health loop: under 60% → rest 7 days at 0/day; next weekly test → restore, or check the
// blacklist and queue a replacement for Alex's ✅. Every step lands in the activity log.
import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { createPool, migrate, type Db } from '../src/db/pool.js';
import { loadConfig, type Config } from '../src/config.js';
import { enqueue, getJob } from '../src/queue.js';
import { upsertAgentTask } from '../src/hq/agentTasks.js';
import { runOnce } from '../src/worker.js';
import { decide, PLACEMENT, PT, ACCOUNTS, EA, DOMAINS, DM, QUEUE, SQ } from '../src/stages/accountHealth.js';
import { ACTIVITY, AF } from '../src/activity.js';
import { DECISIONS, DF } from '../src/decisions/fields.js';
import { startFakeBison, type FakeBison } from './fakes/bison.js';

const url = process.env.TEST_DATABASE_URL;
const skip = !url ? 'TEST_DATABASE_URL not set' : false;
let db: Db, bison: FakeBison, server: http.Server, atUrl = '';
let tables: Record<string, Record<string, { fields: Record<string, unknown>; createdTime?: string }>>;

function cfg(over: Partial<Config> = {}): Config {
  return { ...loadConfig({ ENGINE_SECRET: 'x'.repeat(40), DATABASE_URL: url ?? 'postgres://x' } as NodeJS.ProcessEnv),
    emailBisonKeys: { dulcy: bison.key }, emailBisonBaseUrl: bison.url, airtableApiKey: 'at', airtableBaseUrl: atUrl,
    dryRun: false, liveStages: ['account.health', 'account.approve_purchase'], accountHealthFrom: '2026-11-26T12:00:00.000Z', ...over };
}
async function run(conf: Config, kind = 'account.health', input: Record<string, unknown> = {}) {
  const q = await enqueue(db, { kind, recordId: 'account-health', input, dryRun: conf.dryRun && !conf.liveStages.includes(kind), maxAttempts: 3, deadlineMs: 60_000 });
  for (let i = 0; i < 10; i++) { await runOnce(db, conf); const j = await getJob(db, q.job.id); if (['succeeded', 'failed', 'needs_review'].includes(j!.job.status)) return j!; }
  throw new Error('job did not settle');
}
const testRow = (emailId: number, score: number, createdTime: string, id = `T${emailId}${score}`) => ({ id, fields: { [PT.email]: `a${emailId}@dulcyx.info`, [PT.emailId]: emailId, [PT.workspaceId]: 2, [PT.overall]: score, [PT.testId]: id, [PT.testDate]: createdTime.slice(0, 10) }, createdTime });

before(async () => {
  bison = await startFakeBison();
  server = http.createServer((req, res) => {
    const u = new URL(req.url ?? '/', 'http://x'); const parts = u.pathname.split('/'); const table = parts[3]; const recId = parts[4];
    const rows = (tables[table] ??= {});
    res.setHeader('content-type', 'application/json');
    if (req.method === 'GET') {
      if (recId) return res.end(JSON.stringify(rows[recId] ? { id: recId, fields: rows[recId].fields } : { error: 'NOT_FOUND' }));
      const f = u.searchParams.get('filterByFormula') ?? '';
      let list = Object.entries(rows);
      if (table === PLACEMENT) list = list.filter(([, r]) => !r.fields[PT.processed] && (r.createdTime ?? '') > '2026-11-26T12:00:00.000Z');
      const eid = /\{Email ID\}=(\d+)/.exec(f)?.[1];
      if (table === ACCOUNTS && eid) list = list.filter(([, r]) => String(r.fields[EA.emailId]) === eid);
      const key = /\{Automation Key\}='([^']+)'/.exec(f)?.[1];
      if (table === QUEUE && key) list = list.filter(([, r]) => r.fields[SQ.key] === key);
      return res.end(JSON.stringify({ records: list.map(([id, r]) => ({ id, fields: r.fields, createdTime: r.createdTime })) }));
    }
    let raw = ''; req.on('data', (c) => (raw += c));
    req.on('end', () => {
      const b = JSON.parse(raw || '{}');
      res.end(JSON.stringify({ records: (b.records ?? []).map((r: any) => {
        if (req.method === 'PATCH') { Object.assign((rows[r.id] ??= { fields: {} }).fields, r.fields); return r; }
        const id = `recNew${String(Object.keys(rows).length).padStart(11, '0')}`; rows[id] = { fields: { ...r.fields } }; return { id, fields: r.fields };
      }) }));
    });
  });
  await new Promise<void>((r) => server.listen(0, r));
  atUrl = `http://127.0.0.1:${(server.address() as any).port}`;
  if (!skip) { db = createPool(url!); await migrate(db); }
});
after(async () => { bison.close(); server.close(); if (!skip) await db.end(); });
beforeEach(async () => {
  tables = { [PLACEMENT]: {}, [ACCOUNTS]: {}, [DOMAINS]: {}, [QUEUE]: {}, [DECISIONS]: {}, [ACTIVITY]: {} };
  (bison as any).dailyLimits = {}; (bison as any).rejectZeroLimit = false;
  if (!skip) await db.query('TRUNCATE jobs, steps, receipts, events, hq_agent_tasks RESTART IDENTITY CASCADE');
});

test('decision rules: under 60% rests; the next weekly test restores or replaces; a test before the due date holds', () => {
  assert.equal(decide({ stage: '', retestDue: '' }, { score: 59, at: '2026-11-27T10:00:00Z' }), 'rest');
  assert.equal(decide({ stage: 'Monitoring', retestDue: '' }, { score: 60, at: '2026-11-27T10:00:00Z' }), 'none', '60% is not under 60%');
  const resting = { stage: 'Resting 7 Days', retestDue: '2026-12-03T22:00:00Z' };
  assert.equal(decide(resting, { score: 40, at: '2026-12-01T10:00:00Z' }), 'hold');
  // Rest started Fri 10:00 → due Thu 22:00, so the next Friday test at 10:00 counts as the retest.
  assert.equal(decide(resting, { score: 85, at: '2026-12-04T10:00:00Z' }), 'recover');
  assert.equal(decide(resting, { score: 30, at: '2026-12-04T10:00:00Z' }), 'replace');
  assert.equal(decide({ stage: 'Replace Domain', retestDue: '' }, { score: 10, at: '2026-12-04T10:00:00Z' }), 'none');
});

test('Friday: an account under 60% is rested at 0/day, its old limit saved; older tests are not touched', { skip }, async () => {
  tables[ACCOUNTS].recAccount0000001 = { fields: { [EA.email]: 'a11@dulcyx.info', [EA.emailId]: 11, [EA.workspaceId]: 2, [EA.dailyLimit]: 15, [EA.campaigns]: ['recCampaign000001'] } };
  tables[ACCOUNTS].recAccount0000002 = { fields: { [EA.email]: 'a12@dulcyx.info', [EA.emailId]: 12, [EA.workspaceId]: 2, [EA.dailyLimit]: 15 } };
  for (const t of [testRow(11, 40, '2026-11-27T10:00:00.000Z'), testRow(12, 90, '2026-11-27T10:00:00.000Z'), testRow(13, 0, '2026-11-21T10:00:00.000Z')]) tables[PLACEMENT][t.id] = { fields: t.fields, createdTime: t.createdTime };
  const j = await run(cfg());
  assert.equal(j.job.status, 'succeeded', j.job.error ?? '');
  assert.match(String(j.job.result.message), /2 placement tests: 1 rested, 0 recovered/);
  assert.equal((bison as any).dailyLimits['11'], 0);
  assert.equal((bison as any).dailyLimits['12'], undefined, 'a passing account is left alone');
  const a = tables[ACCOUNTS].recAccount0000001.fields;
  assert.equal(a[EA.stage], 'Resting 7 Days'); assert.equal(a[EA.previousLimit], 15); assert.equal(a[EA.dailyLimit], 0);
  assert.equal(tables[PLACEMENT].T1140.fields[PT.outcome], 'Rest Started');
  assert.equal(tables[PLACEMENT].T130.fields[PT.processed], undefined, 'last week\'s test (before the start date) is not acted on');
  const log = Object.values(tables[ACTIVITY]).map((r) => r.fields);
  assert.ok(log.some((l) => /Account rested 7 days: a11@/.test(String(l[AF.event])) && (l[AF.campaign] as string[])?.[0] === 'recCampaign000001'), 'the rest is in the campaign\'s activity log');
  // HQ: Riley's task until the retest (a planned wait, so it is not "stalled" before then).
  const t = (await db.query(`SELECT agent, title, status, to_char(due_date,'YYYY-MM-DD') AS due, waiting_until, job_kind FROM hq_agent_tasks WHERE source_key='rest:recAccount0000001'`)).rows[0];
  assert.deepEqual([t.agent, t.title, t.status, t.due, t.job_kind], ['Atlas', 'Rest a11@dulcyx.info until its retest', 'in_progress', '2026-12-03', 'account.health']);
  assert.equal(new Date(t.waiting_until).toISOString(), '2026-12-03T22:00:00.000Z');
});

test('EmailBison will not take 0 → the limit is set to 1', { skip }, async () => {
  (bison as any).rejectZeroLimit = true;
  tables[ACCOUNTS].recAccount0000001 = { fields: { [EA.email]: 'a11@dulcyx.info', [EA.emailId]: 11, [EA.workspaceId]: 2, [EA.dailyLimit]: 20 } };
  const t = testRow(11, 10, '2026-11-27T10:00:00.000Z'); tables[PLACEMENT][t.id] = { fields: t.fields, createdTime: t.createdTime };
  await run(cfg());
  assert.equal((bison as any).dailyLimits['11'], 1);
  assert.equal(tables[ACCOUNTS].recAccount0000001.fields[EA.dailyLimit], 1);
});

test('retest: better → limit restored; still bad → blacklist read, replacement queued + a ✅ decision; ✅ ticks Approve Purchase', { skip }, async () => {
  const resting = { [EA.stage]: 'Resting 7 Days', [EA.restStarted]: '2026-11-27T10:00:00.000Z', [EA.retestDue]: '2026-12-03T22:00:00.000Z', [EA.previousLimit]: 15, [EA.dailyLimit]: 0, [EA.workspaceId]: 2, [EA.failedTests]: 1 };
  tables[ACCOUNTS].recAccount0000001 = { fields: { ...resting, [EA.email]: 'a11@dulcyx.info', [EA.emailId]: 11 } };
  tables[ACCOUNTS].recAccount0000002 = { fields: { ...resting, [EA.email]: 'a12@dulcyx.info', [EA.emailId]: 12, [EA.domains]: ['recDomain00000001'] } };
  tables[DOMAINS].recDomain00000001 = { fields: { [DM.name]: 'dulcyx.info', [DM.blacklistStatus]: 'Listed', [DM.blacklistCount]: 1, [DM.blacklistsFound]: 'Spamhaus DBL', [DM.lastBlacklistCheck]: '2026-12-04T09:00:00.000Z' } };
  for (const t of [testRow(11, 88, '2026-12-04T10:00:00.000Z'), testRow(12, 20, '2026-12-04T10:00:00.000Z')]) tables[PLACEMENT][t.id] = { fields: t.fields, createdTime: t.createdTime };
  for (const n of [1, 2]) await upsertAgentTask(db, { agent: 'Riley', key: `rest:recAccount000000${n}`, title: `Rest a1${n}@dulcyx.info until its retest`, status: 'in_progress', note: 'Resting', waitingUntil: '2026-12-03T22:00:00.000Z' });
  const j = await run(cfg());
  assert.equal(j.job.status, 'succeeded', j.job.error ?? '');
  assert.equal((bison as any).dailyLimits['11'], 15, 'old limit back');
  assert.equal(tables[ACCOUNTS].recAccount0000001.fields[EA.stage], 'Recovered');
  assert.equal(tables[ACCOUNTS].recAccount0000002.fields[EA.stage], 'Replace Domain');
  const q = Object.entries(tables[QUEUE]);
  assert.equal(q.length, 1);
  assert.match(String(q[0][1].fields[SQ.reason]), /blacklist Listed \(1: Spamhaus DBL\)/);
  assert.match(String(q[0][1].fields[SQ.reason]), /1 new \.com domain \(\$9\.99\) \+ 2 Google accounts/);
  assert.equal(q[0][1].fields[SQ.approve], false, 'nothing bought without Alex');
  const d = Object.values(tables[DECISIONS])[0].fields;
  assert.equal(d[DF.action], 'Approve Purchase');
  // HQ: the recovered account's task is done; the failed one waits on Alex's ✅ (linked to its Decision).
  const task = async (acc: string) => (await db.query(`SELECT status, progress_note, decision_rec FROM hq_agent_tasks WHERE source_key=$1`, [`rest:${acc}`])).rows[0];
  assert.equal((await task('recAccount0000001')).status, 'done');
  assert.match((await task('recAccount0000001')).progress_note, /Recovered: retest 88%/);
  const waiting = await task('recAccount0000002');
  assert.equal(waiting.status, 'waiting_alex');
  assert.equal(waiting.decision_rec, Object.keys(tables[DECISIONS])[0]);
  // Alex taps ✅ → Approve Purchase is ticked.
  const ok = await run(cfg(), 'account.approve_purchase', JSON.parse(String(d[DF.actionInput])));
  assert.equal(ok.job.status, 'succeeded', ok.job.error ?? '');
  assert.equal(tables[QUEUE][q[0][0]].fields[SQ.approve], true);
  assert.equal((await task('recAccount0000002')).status, 'done', 'approval closes the task');
  // Run again: the same failed test is not queued twice.
  await run(cfg());
  assert.equal(Object.keys(tables[QUEUE]).length, 1);
});

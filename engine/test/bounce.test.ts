// Bounce safety tests: the rule, the stage (report-only and live), and the timer.
import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { createPool, migrate, type Db } from '../src/db/pool.js';
import { loadConfig, type Config } from '../src/config.js';
import { enqueue, getJob } from '../src/queue.js';
import { runOnce } from '../src/worker.js';
import { bounceAction, bounceRate } from '../src/campaign/bounce.js';
import { scheduleTick } from '../src/scheduler.js';
import { startFakeBison, type FakeBison } from './fakes/bison.js';

const url = process.env.TEST_DATABASE_URL;
const skip = !url ? 'TEST_DATABASE_URL not set' : false;
let db: Db;
let bison: FakeBison;

function cfg(over: Partial<Config> = {}): Config {
  return { ...loadConfig({ ENGINE_SECRET: 'x'.repeat(40), DATABASE_URL: url ?? 'postgres://x' } as NodeJS.ProcessEnv), emailBisonKeys: { dulcy: bison.key }, emailBisonBaseUrl: bison.url, dryRun: true, liveStages: [], ...over };
}
const c = (id: number, bounced: number, contacted: number, progress: number, status = 'active') => ({ id, name: `C${id}`, status, bounced, contacted, progress, leads: new Set<string>(), senders: [], steps: [] });
async function run(conf: Config, dryRun: boolean) {
  const q = await enqueue(db, { kind: 'bounce.check', recordId: 'bounce:dulcy', input: { workspace: 'dulcy' }, dryRun, maxAttempts: 3, deadlineMs: 60_000 });
  for (let i = 0; i < 10; i++) {
    await runOnce(db, conf);
    const j = await getJob(db, q.job.id);
    if (['succeeded', 'failed', 'needs_review'].includes(j!.job.status)) return j!;
  }
  throw new Error('job did not settle');
}

before(async () => { bison = await startFakeBison(); if (skip) return; db = createPool(url!); await migrate(db); });
after(async () => { bison.close(); if (!skip) await db.end(); });
beforeEach(async () => {
  Object.assign(bison, { pauseIgnored: false, calls: [], campaigns: [
    c(1, 50, 1000, 40),   // 5% at 40% → pause
    c(2, 50, 1000, 20),   // 5% at 20% → below the 35% floor → watch only
    c(3, 30, 1000, 80),   // 3% → watch
    c(4, 10, 1000, 90),   // 1% → ok
    c(5, 90, 1000, 90, 'paused'), // not active → ignored
  ] });
  if (!skip) await db.query('TRUNCATE jobs, steps, receipts, events RESTART IDENTITY CASCADE');
});

test('rule: pause over 4% at 35%+ progress; watch over 2.5%; bounce % = bounced / contacted', () => {
  assert.equal(bounceRate({ bounced: 1, contacted: 10 }), 10);
  assert.equal(bounceRate({ bounced: 0, contacted: 0 }), 0);
  const s = (bounced: number, progress: number) => ({ id: 1, name: 'x', status: 'active', bounced, contacted: 100, progress });
  assert.equal(bounceAction(s(5, 35)), 'pause');
  assert.equal(bounceAction(s(5, 34)), 'watch', 'the 35% floor stops early pauses');
  assert.equal(bounceAction(s(4, 90)), 'watch', 'exactly 4% is not over 4%');
  assert.equal(bounceAction(s(3, 90)), 'watch');
  assert.equal(bounceAction(s(2, 90)), 'ok');
});

test('report-only (default): finds what to pause and watch, pauses nothing', { skip }, async () => {
  const j = await run(cfg(), true);
  assert.equal(j.job.status, 'succeeded');
  assert.equal(j.job.result.checked, 4);
  assert.deepEqual(j.job.result.wouldPause.map((r: { id: number }) => r.id), [1]);
  assert.deepEqual(j.job.result.watch.map((r: { id: number }) => r.id), [2, 3]);
  assert.ok(!bison.calls.some((x) => x.includes('/pause')));
});

test('live: pauses campaign 1, confirms it, and the next check sees nothing more to pause', { skip }, async () => {
  const live = cfg({ liveStages: ['bounce.check'] });
  const j = await run(live, false);
  assert.equal(j.job.status, 'succeeded');
  assert.deepEqual(j.job.result.paused.map((r: { id: number }) => r.id), [1]);
  assert.equal((bison.campaigns[0] as any).status, 'paused');
  const k = await run(live, false);
  assert.equal(k.job.result.paused.length, 0);
  assert.equal(k.job.result.checked, 3);
});

test('re-checked every run: a campaign that crosses 4% later is still paused (the old "fire once" gap)', { skip }, async () => {
  const live = cfg({ liveStages: ['bounce.check'] });
  (bison.campaigns[2] as any).bounced = 30; // 3%: watch
  const first = await run(live, false);
  assert.deepEqual(first.job.result.watch.map((r: { id: number }) => r.id).includes(3), true);
  (bison.campaigns[2] as any).bounced = 45; // later 4.5%
  const second = await run(live, false);
  assert.ok(second.job.result.paused.some((r: { id: number }) => r.id === 3));
});

test('a pause that does not take effect goes to review', { skip }, async () => {
  bison.pauseIgnored = true;
  const j = await run(cfg({ liveStages: ['bounce.check'] }), false);
  assert.equal(j.job.status, 'needs_review');
  assert.match(j.job.error, /pause did not take effect for campaign\(s\) 1/);
});

test('timer: off by default; when on, one job per workspace per slot, never doubled', { skip }, async () => {
  assert.equal(await scheduleTick(db, cfg()), 0);
  const on = cfg({ bounceCheckEveryMin: 30, bounceCheckWorkspaces: ['dulcy', 'acme'] });
  const t = Date.UTC(2026, 10, 18, 10, 0, 0);
  assert.equal(await scheduleTick(db, on, t), 2);
  assert.equal(await scheduleTick(db, on, t + 60_000), 0, 'same slot: not queued again');
  const n = await db.query(`SELECT count(*)::int AS n FROM jobs WHERE kind = 'bounce.check'`);
  assert.equal(n.rows[0].n, 2);
});

test('all workspaces (Alex, 2026-11-24): one key checks every workspace it can reach; a pause lands in the right workspace', { skip }, async () => {
  Object.assign(bison, { workspaces: [{ id: 2, name: 'Dulcy' }, { id: 78, name: 'The Marketing Cartel' }], campaigns: [
    c(1, 50, 1000, 40),                          // Dulcy: 5% at 40% -> pause
    { ...c(7, 60, 1000, 50), team: 78 },         // client: 6% at 50% -> pause
    { ...c(8, 30, 1000, 80), team: 78 },         // client: 3% -> watch
  ] });
  const q = await enqueue(db, { kind: 'bounce.check', recordId: 'bounce:all', input: { workspace: 'all' }, dryRun: false, maxAttempts: 3, deadlineMs: 60_000 });
  const conf = cfg({ dryRun: false, liveStages: ['bounce.check'] });
  let j: any;
  for (let i = 0; i < 10; i++) { await runOnce(db, conf); j = await getJob(db, q.job.id); if (['succeeded', 'failed', 'needs_review'].includes(j.job.status)) break; }
  assert.equal(j.job.status, 'succeeded', j.job.error);
  assert.equal(j.job.result.workspaces, 2);
  assert.deepEqual(j.job.result.paused.map((p: any) => p.id).sort(), [1, 7]);
  assert.deepEqual(j.job.result.watch.map((p: any) => p.id), [8]);
  assert.equal(bison.campaigns.find((x) => x.id === 7)!.status, 'paused', 'the client campaign was paused in its own workspace');
  assert.match(j.job.result.message, /in 2 workspaces: 2 paused, 1 to watch/);
});

test('stats sync: EmailBison numbers → Airtable Campaigns, only changed records, paused ones too', async () => {
  const { syncCampaignStats, SF } = await import('../src/campaign/statsSync.js');
  const recs = [
    { id: 'recA', fields: { [SF.id]: 601, [SF.bounced]: 10, [SF.sent]: 100, [SF.contacted]: 90, [SF.replies]: 1, [SF.interested]: 0, [SF.progress]: 0.5 } },
    { id: 'recB', fields: { [SF.id]: 602, [SF.bounced]: 5, [SF.sent]: 50, [SF.contacted]: 40, [SF.replies]: 0, [SF.interested]: 0, [SF.progress]: 0.25 } },
    { id: 'recC', fields: { [SF.id]: 999 } },
  ];
  const writes: { id: string; f: Record<string, unknown> }[] = [];
  const at = { async list() { return recs; }, async update(_t: string, id: string, f: Record<string, unknown>) { writes.push({ id, f }); } };
  const r = await syncCampaignStats(at as any, [
    { id: 601, status: 'paused', bounced: 977, emails_sent: 42295, total_leads_contacted: 14841, unique_replies: 300, interested: 40, completion_percentage: 98.63 },
    { id: 602, status: 'active', bounced: 5, emails_sent: 50, total_leads_contacted: 40, unique_replies: 0, interested: 0, completion_percentage: 25 },
  ]);
  assert.deepEqual(r, { updated: 1, matched: 2 });
  assert.equal(writes[0].id, 'recA');
  assert.equal(writes[0].f[SF.bounced], 977);
  assert.equal(writes[0].f[SF.contacted], 14841);
  assert.equal(writes[0].f[SF.progress], 0.9863);
});

// Top-up tests: KPI rule, plus the stage end to end against fake EmailBison + Google.
import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { createPool, migrate, type Db } from '../src/db/pool.js';
import { loadConfig, type Config } from '../src/config.js';
import { enqueue, getJob } from '../src/queue.js';
import { runOnce } from '../src/worker.js';
import { topUpReadiness } from '../src/campaign/topup.js';
import { startFakeGoogle, type FakeGoogle } from './fakes/google.js';
import { startFakeBison, type FakeBison } from './fakes/bison.js';

const url = process.env.TEST_DATABASE_URL;
const skip = !url ? 'TEST_DATABASE_URL not set' : false;
const REC = 'recTOPUPTOPUP0001';
let db: Db;
let google: FakeGoogle;
let bison: FakeBison;

const HEADER = ['Email', 'Verification Status', 'First Name', 'Last Name', 'Company'];
const TAB = [HEADER, ['new1@a.com', 'Good', 'Ann', 'Lee', 'A'], ['new2@b.com', 'Good', 'Bo', 'Ng', 'B'], ['old@c.com', 'Good', 'Cy', 'Ra', 'C']];
const KPIS = { interestedRate: 22, replyRate: 3, bounceRate: 1.2, progress: 70 };

function cfg(over: Partial<Config> = {}): Config {
  return {
    ...loadConfig({ ENGINE_SECRET: 'x'.repeat(40), DATABASE_URL: url ?? 'postgres://x' } as NodeJS.ProcessEnv),
    googleKeyFile: google.keyFile, googleSheetsBaseUrl: google.url,
    emailBisonKeys: { dulcy: bison.key }, emailBisonBaseUrl: bison.url, bisonPollMs: 5, dryRun: true, liveStages: ['campaign.topup'], ...over,
  };
}
const input = (over: Record<string, unknown> = {}) => ({
  campaignId: 900, name: 'Acme - Direct Emails', workspace: 'dulcy', outputType: 'direct',
  source: { sheetId: '1QYLOeUxwDXunQm_KMEYKB_7jW7l47ZQJ8wVVtCZBUd8' }, expectedLeads: 3, kpis: KPIS, ...over,
});
const queue = (over: Record<string, unknown> = {}, dryRun = false) => enqueue(db, { kind: 'campaign.topup', recordId: REC, dryRun, input: input(over), maxAttempts: 5, deadlineMs: 60_000 });
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
async function settle(c: Config, id: number, max = 60) {
  for (let i = 0; i < max; i++) {
    await runOnce(db, c);
    const j = await getJob(db, id);
    if (['succeeded', 'failed', 'needs_review'].includes(j!.job.status)) return j!;
    await db.query(`UPDATE jobs SET run_after = now() WHERE id = $1 AND status = 'queued'`, [id]);
    await sleep(8);
  }
  throw new Error('job did not settle');
}
const running = () => ({ id: 900, name: 'Acme - Direct Emails', leads: new Set(['old@c.com', 'x1@z.com']), senders: ['11', '12'], steps: [] as any[] });

before(async () => { google = await startFakeGoogle(); bison = await startFakeBison(); if (skip) return; db = createPool(url!); await migrate(db); });
after(async () => { google.close(); bison.close(); if (!skip) await db.end(); });
beforeEach(async () => {
  Object.assign(bison, { campaigns: [running()], leadLists: [], calls: [], uploadThen500: false, processAfterChecks: 0, failRowsOnImport: 0, customVariables: new Set(['domain']), workspaceSenders: ['11', '12'] });
  bison.senderStatus = () => 'connected';
  google.tabs = { 'Final Direct': TAB.map((r) => [...r]) };
  if (!skip) await db.query('TRUNCATE jobs, steps, receipts, events RESTART IDENTITY CASCADE');
});

test('KPI rule: interested 15%+ of replies is required; bounce, reply rate and progress only flag to watch', () => {
  assert.deepEqual(topUpReadiness(KPIS), { ok: true, reasons: [], watch: [] });
  const low = topUpReadiness({ interestedRate: 12, bounceRate: 4.5, replyRate: 1.5, progress: 40 });
  assert.equal(low.ok, false);
  assert.match(low.reasons[0], /under 15%/);
  assert.equal(low.watch.length, 3);
  const highBounce = topUpReadiness({ interestedRate: 20, bounceRate: 5 });
  assert.equal(highBounce.ok, true, 'a high bounce is a watch flag, not a fail');
  assert.equal(topUpReadiness({} as never).ok, false);
});

test('top-up: adds the new leads, counts the one already in the campaign as skipped, never launches', { skip }, async () => {
  bison.processAfterChecks = 1;
  const j = await settle(cfg(), (await queue()).job.id);
  assert.equal(j.job.status, 'succeeded', j.job.error);
  assert.deepEqual(j.job.result.leads, { uploaded: 3, importReported: 3, added: 2, skippedAlreadyInCampaign: 1, droppedDuplicate: 0 });
  assert.equal(bison.campaigns[0].leads.size, 4);
  assert.ok(!bison.calls.some((x) => /resume|launch|attach-sender/.test(x)), 'no launch, no sender changes');
});

test('re-running the same top-up never uploads again', { skip }, async () => {
  assert.equal((await settle(cfg(), (await queue()).job.id)).job.status, 'succeeded');
  assert.equal((await settle(cfg(), (await queue()).job.id)).job.status, 'succeeded');
  assert.equal(bison.leadLists.length, 1);
});

test('an unclear upload is reconciled by name, not re-uploaded', { skip }, async () => {
  bison.uploadThen500 = true;
  const j = await settle(cfg(), (await queue()).job.id);
  assert.equal(j.job.status, 'succeeded', j.job.error);
  assert.equal(bison.leadLists.length, 1);
});

test('KPI rule fails: nothing is read or uploaded unless an exception is given on purpose', { skip }, async () => {
  const j = await settle(cfg(), (await queue({ kpis: { interestedRate: 10 } })).job.id);
  assert.equal(j.job.status, 'failed');
  assert.match(j.job.error, /interested rate 10% of replies is under 15%/);
  assert.equal(bison.calls.length, 0);
  await db.query('TRUNCATE jobs, steps, receipts, events RESTART IDENTITY CASCADE');
  const k = await settle(cfg(), (await queue({ kpis: { interestedRate: 10 }, kpiException: true })).job.id);
  assert.equal(k.job.status, 'succeeded', k.job.error);
  assert.equal(k.job.result.kpiException, true);
});

test('a disconnected sender stops the top-up before uploading', { skip }, async () => {
  bison.senderStatus = (id) => (id === '12' ? 'disconnected' : 'connected');
  const j = await settle(cfg(), (await queue()).job.id);
  assert.equal(j.job.status, 'needs_review');
  assert.match(j.job.error, /1 of 2 senders are not connected/);
  assert.equal(bison.leadLists.length, 0);
});

test('count mismatch with Airtable stops before uploading; dry-run reports the plan only', { skip }, async () => {
  const j = await settle(cfg(), (await queue({ expectedLeads: 9 })).job.id);
  assert.equal(j.job.status, 'failed');
  assert.match(j.job.error, /has 3 uploadable leads but Airtable expects 9/);
  await db.query('TRUNCATE jobs, steps, receipts, events RESTART IDENTITY CASCADE');
  const d = await settle(cfg({ liveStages: [] }), (await queue({}, true)).job.id);
  assert.equal(d.job.status, 'succeeded');
  assert.equal(d.job.result.plan.leads, 3);
  assert.equal(bison.leadLists.length, 0);
});

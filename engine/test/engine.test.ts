// Integration tests against a real Postgres. Set TEST_DATABASE_URL to run.
import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { createPool, migrate, type Db } from '../src/db/pool.js';
import { loadConfig, type Config } from '../src/config.js';
import { enqueue, claim, getJob } from '../src/queue.js';
import { runOnce } from '../src/worker.js';
import { JobContext } from '../src/context.js';
import { NeedsReviewError, WaitError } from '../src/errors.js';
import { sign, verifySignature, createServer } from '../src/http.js';
import { STAGES } from '../src/stages/index.js';

const url = process.env.TEST_DATABASE_URL;
const skip = !url ? 'TEST_DATABASE_URL not set' : false;
let db: Db;
const REC = 'recAAAAAAAAAAAAAA';
const SECRET = 'x'.repeat(40);

function cfg(over: Partial<Config> = {}): Config {
  return { ...loadConfig({ ENGINE_SECRET: SECRET, DATABASE_URL: url ?? 'postgres://x' } as NodeJS.ProcessEnv), ...over };
}

before(async () => { if (skip) return; db = createPool(url!); await migrate(db); });
after(async () => { if (!skip) await db.end(); });
beforeEach(async () => { if (!skip) await db.query('TRUNCATE jobs, steps, receipts, events RESTART IDENTITY CASCADE'); });

test('double click: a second job for the same record is refused while one is active', { skip }, async () => {
  const a = await enqueue(db, { kind: 'engine.selftest', recordId: REC, dryRun: true });
  const b = await enqueue(db, { kind: 'engine.selftest', recordId: REC, dryRun: true });
  assert.equal(a.status, 'queued');
  assert.equal(b.status, 'already_active');
  assert.equal(b.job.id, a.job.id);
});

test('same request id twice returns the same job', { skip }, async () => {
  const a = await enqueue(db, { kind: 'engine.selftest', recordId: REC, dryRun: true, requestId: 'req-1' });
  await db.query(`UPDATE jobs SET status='succeeded' WHERE id=$1`, [a.job.id]);
  const b = await enqueue(db, { kind: 'engine.selftest', recordId: REC, dryRun: true, requestId: 'req-1' });
  assert.equal(b.status, 'duplicate_request');
  assert.equal(b.job.id, a.job.id);
});

test('self-test job runs end to end in dry-run and spends nothing', { skip }, async () => {
  const c = cfg({ dryRun: true });
  const q = await enqueue(db, { kind: 'engine.selftest', recordId: REC, dryRun: true, input: { rows: 7 } });
  assert.equal(await runOnce(db, c), true);
  const j = await getJob(db, q.job.id);
  assert.equal(j!.job.status, 'succeeded');
  assert.deepEqual(j!.job.result, { processed: 7, dryRun: true });
  const r = await db.query(`SELECT status FROM receipts`);
  assert.deepEqual(r.rows.map((x) => x.status), ['dry_run']);
});

test('a crashed worker never blocks the queue: expired lease is reclaimed', { skip }, async () => {
  const q = await enqueue(db, { kind: 'engine.selftest', recordId: REC, dryRun: true });
  const first = await claim(db, 'dead-worker', 1); // 1 ms lease
  assert.equal(first!.id, q.job.id);
  await new Promise((r) => setTimeout(r, 20));
  const again = await claim(db, 'live-worker', 60_000);
  assert.equal(again!.id, q.job.id);
  assert.equal(again!.attempts, 2);
});

test('finished steps are not repeated on retry', { skip }, async () => {
  const q = await enqueue(db, { kind: 'engine.selftest', recordId: REC, dryRun: true });
  const ctx = new JobContext(db, cfg(), q.job);
  let runs = 0;
  await ctx.step('s1', async () => { runs++; return { v: 1 }; });
  const out = await ctx.step('s1', async () => { runs++; return { v: 2 }; });
  assert.equal(runs, 1);
  assert.deepEqual(out, { v: 1 });
});

test('paid call: never pays twice, and an unclear outcome goes to review', { skip }, async () => {
  const q = await enqueue(db, { kind: 'engine.selftest', recordId: REC, dryRun: false });
  const live = cfg({ dryRun: false });
  const ctx = new JobContext(db, live, { ...q.job, dry_run: false });
  let calls = 0;
  const call = { callKey: 'k1', provider: 'mv', units: 10, run: async () => { calls++; return { id: 'job-123' }; }, dryRunResult: () => ({ id: 'dry' }) };
  const a = await ctx.paid(call);
  const b = await ctx.paid(call);
  assert.equal(calls, 1);
  assert.deepEqual(a, b);

  // Simulate a crash mid-call: receipt stays 'pending'.
  const crash = { ...call, callKey: 'k2', run: async () => { throw new Error('connection reset'); } };
  await assert.rejects(ctx.paid(crash));
  await assert.rejects(ctx.paid({ ...crash, run: async () => { calls++; return { id: 'x' }; } }), NeedsReviewError);
  assert.equal(calls, 1);
});

test('credit cap stops a job before it spends', { skip }, async () => {
  const q = await enqueue(db, { kind: 'engine.selftest', recordId: REC, dryRun: false });
  const ctx = new JobContext(db, cfg({ dryRun: false, capPerJob: 100 }), { ...q.job, dry_run: false });
  let calls = 0;
  await assert.rejects(
    ctx.paid({ callKey: 'big', provider: 'mv', units: 101, run: async () => { calls++; return {}; }, dryRunResult: () => ({}) }),
    NeedsReviewError,
  );
  assert.equal(calls, 0);
});

test('rate limited paid call (WaitError): nothing charged, the next attempt calls again (no "unclear outcome")', { skip }, async () => {
  const q = await enqueue(db, { kind: 'engine.selftest', recordId: REC, dryRun: false });
  const ctx = new JobContext(db, cfg({ dryRun: false }), { ...q.job, dry_run: false });
  let calls = 0;
  const call = (fail: boolean) => ctx.paid({ callKey: 'rl', provider: 'discolike', units: 1, run: async () => { calls++; if (fail) throw new WaitError('rate limited', 60_000); return { ok: true }; }, dryRunResult: () => ({}) });
  await assert.rejects(call(true), WaitError);
  assert.deepEqual(await call(false), { ok: true });
  assert.equal(calls, 2);
});

test('step time limit: a hung step fails instead of running for hours', { skip }, async () => {
  const q = await enqueue(db, { kind: 'engine.selftest', recordId: REC, dryRun: true });
  const ctx = new JobContext(db, cfg(), q.job);
  await assert.rejects(ctx.step('hang', () => new Promise(() => undefined), { timeoutMs: 50 }), /timed out/);
});

test('signatures: valid passes; wrong, missing or old ones are rejected', async () => {
  const c = cfg();
  const ts = String(Date.now());
  const body = '{"a":1}';
  assert.equal(verifySignature(c, ts, sign(SECRET, ts, body), body), null);
  assert.equal(verifySignature(c, ts, sign('y'.repeat(40), ts, body), body), 'bad signature');
  assert.equal(verifySignature(c, undefined, undefined, body), 'missing signature');
  const old = String(Date.now() - 10 * 60_000);
  assert.equal(verifySignature(c, old, sign(SECRET, old, body), body), 'stale or invalid timestamp');
});

test('HTTP: unsigned requests are refused; a signed one queues a job', { skip }, async () => {
  const c = cfg();
  const server = createServer(db, c).listen(0);
  await new Promise((r) => server.once('listening', r));
  const port = (server.address() as { port: number }).port;
  try {
    const body = JSON.stringify({ kind: 'engine.selftest', recordId: REC });
    const unsigned = await fetch(`http://localhost:${port}/jobs`, { method: 'POST', body });
    assert.equal(unsigned.status, 401);
    const ts = String(Date.now());
    const ok = await fetch(`http://localhost:${port}/jobs`, { method: 'POST', body, headers: { 'x-dulcy-timestamp': ts, 'x-dulcy-signature': sign(SECRET, ts, body) } });
    assert.equal(ok.status, 202);
    const health = await fetch(`http://localhost:${port}/health`);
    assert.equal(health.status, 200);
  } finally { server.close(); }
});

test('every stage has a time limit', () => {
  for (const [k, d] of Object.entries(STAGES)) assert.ok(d.deadlineMs > 0 && d.maxAttempts >= 1, k);
});

test('bounce.investigate waits up to 2 hours in the queue (jobs queued during a deploy were expiring before they ran)', () => {
  assert.ok(STAGES['bounce.investigate'].deadlineMs >= 2 * 60 * 60_000);
});

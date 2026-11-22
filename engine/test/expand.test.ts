// Company expansion (leadlist.expand): rolling exclusion, tiers, master copy in Postgres,
// one sheet write per batch at a fixed place, stop at target / when DiscoLike runs out.
import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import type pg from 'pg';
import { createPool, migrate } from '../src/db/pool.js';
import { enqueue, getJob } from '../src/queue.js';
import { runOnce } from '../src/worker.js';
import { loadConfig, type Config } from '../src/config.js';
import { startFakeGoogle, type FakeGoogle } from './fakes/google.js';

const url = process.env.TEST_DATABASE_URL;
const skip = !url ? 'TEST_DATABASE_URL not set' : false;
const REC = 'recExpandTest0001';
let db: pg.Pool;
let google: FakeGoogle;
let server: http.Server;
const disco = { url: '', pool: [] as any[], lists: new Map<string, Set<string>>(), discoverCalls: 0, lastMax: 0 };

const co = (i: number) => ({ domain: `co${i}.com`, name: `Co ${i}`, description: i % 10 === 0 ? 'Online directory of suppliers' : 'We manufacture outdoor furniture', keywords: { furniture: 1 }, industry_groups: { MANUFACTURING: 1 } });

function cfg(over: Partial<Config> = {}): Config {
  return {
    ...loadConfig({ ENGINE_SECRET: 'x'.repeat(40), DATABASE_URL: url ?? 'postgres://x' } as NodeJS.ProcessEnv),
    discoLikeApiKey: 'k', discoLikeBaseUrl: disco.url, googleKeyFile: google.keyFile, googleImpersonateUser: 'scale@dulcy.io', googleSheetsBaseUrl: google.url,
    dryRun: true, liveStages: ['leadlist.sample', 'leadlist.expand', 'leadlist.refit'], ...over,
  };
}
const FILTERS = { country: ['US'], icp_text: 'Furniture manufacturers', relevance: 'BALANCED' };
const FIT = { targetsBusinessTypes: ['manufacturer'] };
const run = async (kind: string, input: Record<string, unknown>, c = cfg(), dryRun = false) => {
  const q = await enqueue(db, { kind, recordId: REC, dryRun, input, maxAttempts: 5, deadlineMs: 120_000 });
  for (let i = 0; i < 60; i++) {
    await runOnce(db, c);
    const j = await getJob(db, q.job.id);
    if (['succeeded', 'failed', 'needs_review'].includes(j!.job.status)) return j!;
    await db.query(`UPDATE jobs SET run_after = now() WHERE id = $1 AND status = 'queued'`, [q.job.id]);
  }
  throw new Error('job did not settle');
};
const sample = () => run('leadlist.sample', { filters: FILTERS, fit: FIT, sampleSize: 20 });
const expand = (over: Record<string, unknown> = {}, c?: Config) => run('leadlist.expand', { filters: FILTERS, fit: FIT, target: 100, batchSize: 40, sampleApproved: true, name: 'Test list', ...over }, c);

before(async () => {
  google = await startFakeGoogle();
  server = http.createServer(async (req, res) => {
    const u = new URL(req.url ?? '/', 'http://x');
    const chunks: Buffer[] = []; for await (const c of req) chunks.push(c as Buffer);
    res.setHeader('content-type', 'application/json');
    if (u.pathname === '/v1/count') return res.end(JSON.stringify({ count: disco.pool.length }));
    if (u.pathname === '/v1/queries/exclusion-list' && req.method === 'POST') {
      const b = JSON.parse(Buffer.concat(chunks).toString());
      const id = `q${disco.lists.size + 1}`; disco.lists.set(id, new Set(b.domains));
      return res.end(JSON.stringify({ query_id: id }));
    }
    if (u.pathname === '/v1/discover') {
      disco.discoverCalls++;
      const max = Number(u.searchParams.get('max_records')); disco.lastMax = max;
      const ex = new Set(u.searchParams.getAll('exclusion_query_id').flatMap((id) => [...(disco.lists.get(id) ?? [])]));
      return res.end(JSON.stringify(disco.pool.filter((r) => !ex.has(r.domain)).slice(0, max)));
    }
    res.statusCode = 404; res.end('{}');
  });
  await new Promise<void>((r) => server.listen(0, () => r()));
  disco.url = `http://127.0.0.1:${(server.address() as any).port}`;
  if (skip) return;
  db = createPool(url!); await migrate(db);
});
after(async () => { google.close(); server.close(); if (!skip) await db.end(); });
beforeEach(async () => {
  disco.pool = Array.from({ length: 300 }, (_, i) => co(i + 1));
  disco.lists = new Map(); disco.discoverCalls = 0;
  google.written = {}; google.grid = {}; google.writes = 0; google.creates = 0; google.maxWriteBytes = 0;
  if (!skip) await db.query('TRUNCATE jobs, steps, receipts, events, lead_companies, lead_list_sheets, lead_list_profiles RESTART IDENTITY CASCADE');
});

test('expand: batches with a rolling exclusion until the usable target; never pulls a company twice', { skip }, async () => {
  await sample();
  const j = await expand();
  assert.equal(j.job.status, 'succeeded', j.job.error);
  const r = j.job.result;
  assert.equal(r.stoppedBecause, 'target');
  assert.ok(r.list.usable >= 100, `usable ${r.list.usable}`);
  const dupes = await db.query(`SELECT domain FROM lead_companies WHERE list_id=$1 GROUP BY domain HAVING COUNT(*) > 1`, [REC]);
  assert.equal(dupes.rowCount, 0);
  assert.ok(r.batches.every((b: any) => b.alreadyInList === 0), 'the exclusion list kept every earlier company out');
  assert.equal(r.list.cut, Math.floor(r.list.total / 10), 'every 10th company (a directory) is Cut');
  assert.match(r.message, /Tier 1 \d+, Tier 2 \d+, Cut \d+/);
});

test('sheet: one header + one write per batch, rows in place, scope is read+write', { skip }, async () => {
  await sample();
  const j = await expand();
  const sheetId = j.job.result.sheet.url.split('/d/')[1];
  const rows = google.written[sheetId]['Engine Companies'];
  assert.equal(rows[0][0], 'Domain');
  assert.equal(rows.filter(Boolean).length - 1, j.job.result.list.total, 'every company is in the sheet exactly once');
  assert.equal(new Set(rows.slice(1).map((x) => x[0])).size, j.job.result.list.total);
  assert.equal(google.writes, 1 + 1 + j.job.result.batches.length, 'header + sample + one per batch');
  assert.equal(google.lastScope, 'https://www.googleapis.com/auth/spreadsheets');
});

test('a re-run never pays again and never writes duplicate rows', { skip }, async () => {
  await sample();
  await expand();
  const calls = disco.discoverCalls;
  const j = await expand();
  assert.equal(j.job.status, 'succeeded', j.job.error);
  assert.equal(disco.discoverCalls, calls, 'already at the target: no new search');
  const sheetId = j.job.result.sheet.url.split('/d/')[1];
  assert.equal(google.written[sheetId]['Engine Companies'].filter(Boolean).length - 1, j.job.result.list.total);
  assert.equal(google.creates, 1, 'the same sheet is reused');
});

test('raising the target continues from the last batch with new companies only', { skip }, async () => {
  await sample();
  await expand({ target: 100 });
  const j = await expand({ target: 150 });
  assert.equal(j.job.status, 'succeeded', j.job.error);
  assert.ok(j.job.result.list.usable >= 150);
  const dupes = await db.query(`SELECT domain FROM lead_companies WHERE list_id=$1 GROUP BY domain HAVING COUNT(*) > 1`, [REC]);
  assert.equal(dupes.rowCount, 0);
});

test('DiscoLike runs out: stops and reports the shortfall', { skip }, async () => {
  disco.pool = disco.pool.slice(0, 90);
  await sample();
  const j = await expand({ target: 500 });
  assert.equal(j.job.status, 'succeeded', j.job.error);
  assert.equal(j.job.result.stoppedBecause, 'exhausted');
  assert.equal(j.job.result.list.total, 90);
  assert.ok(j.job.result.shortfall > 0);
});

test('guards: not approved, no sample, client exclusions are never pulled, dry-run spends nothing', { skip }, async () => {
  const a = await expand({ sampleApproved: false });
  assert.match(a.job.error, /not approved/);
  const b = await expand();
  assert.match(b.job.error, /no saved sample/);
  await sample();
  const d = await run('leadlist.expand', { filters: FILTERS, fit: FIT, target: 100, sampleApproved: true }, cfg(), true);
  assert.equal(d.job.status, 'succeeded', d.job.error);
  assert.equal(d.job.result.dryRun, true);
  const callsBefore = disco.discoverCalls;
  assert.equal(google.writes, 0);
  const e = await expand({ excludedDomains: ['https://www.co25.com/', 'co26.com'] });
  assert.equal(e.job.status, 'succeeded', e.job.error);
  assert.ok(disco.discoverCalls > callsBefore);
  const got = await db.query(`SELECT domain FROM lead_companies WHERE list_id=$1 AND domain IN ('co25.com','co26.com')`, [REC]);
  assert.equal(got.rowCount, 0);
});

test('credit cap stops a batch before it is paid (only for a capped provider)', { skip }, async () => {
  await sample();
  const j = await expand({}, cfg({ capPerJob: 30, capFreeProviders: [] }));
  assert.equal(j.job.status, 'needs_review');
  assert.match(j.job.error, /credit cap/);
});

test('DiscoLike has no cap by default (Alex 2026-11-22): the Expansion Target is the limit', { skip }, async () => {
  await sample();
  const j = await expand({}, cfg({ capPerJob: 30, capPerDay: 30 }));
  assert.notEqual(j.job.status, 'needs_review', j.job.error ?? '');
  assert.doesNotMatch(String(j.job.error ?? ''), /credit cap/);
});

test('scale: 12,000 companies in 2,500 batches to a 10,000 usable target, fast, no duplicates, small sheet writes', { skip }, async () => {
  disco.pool = Array.from({ length: 12_000 }, (_, i) => co(i + 1));
  await sample();
  const t0 = Date.now();
  const j = await expand({ target: 10_000, batchSize: 2500 });
  const ms = Date.now() - t0;
  assert.equal(j.job.status, 'succeeded', j.job.error);
  assert.ok(j.job.result.list.usable >= 10_000, `usable ${j.job.result.list.usable}`);
  assert.ok(j.job.result.batches.length <= 6, `${j.job.result.batches.length} batches`);
  const dupes = await db.query(`SELECT domain FROM lead_companies WHERE list_id=$1 GROUP BY domain HAVING COUNT(*) > 1`, [REC]);
  assert.equal(dupes.rowCount, 0);
  const sheetId = j.job.result.sheet.url.split('/d/')[1];
  assert.equal(google.written[sheetId]['Engine Companies'].filter(Boolean).length - 1, j.job.result.list.total);
  assert.ok(google.maxWriteBytes < 2_000_000, `largest sheet write ${google.maxWriteBytes} bytes`);
  assert.ok(ms < 60_000, `took ${ms} ms`);
  console.log(`scale test: ${j.job.result.list.total} companies, ${j.job.result.batches.length} batches, ${ms} ms, largest sheet write ${google.maxWriteBytes} bytes`);
});

test('refit: re-checks the whole saved list for free with a new rule, sheet rewritten in place', { skip }, async () => {
  await sample();
  const e = await expand({ target: 100 });
  const calls = disco.discoverCalls;
  const r = await run('leadlist.refit', { filters: FILTERS, fit: { ...FIT, excludeKeywords: ['outdoor furniture'] } });
  assert.equal(r.job.status, 'succeeded', r.job.error);
  assert.equal(disco.discoverCalls, calls, 'no new search');
  assert.equal(r.job.result.list.usable, 0, 'every furniture maker is now Cut by the new rule');
  assert.ok(r.job.result.changes.changed > 0);
  const sheetId = e.job.result.sheet.url.split('/d/')[1];
  const rows = google.written[sheetId]['Engine Companies'];
  assert.equal(rows.filter(Boolean).length - 1, r.job.result.list.total, 'same rows, no duplicates');
  assert.ok(rows.slice(1).every((x) => x[2] === 'Cut'), 'the sheet shows the new tiers');
});

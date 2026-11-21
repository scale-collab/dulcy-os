// DiscoGen deep review: the old n8n company review code runs unchanged on the usable companies.
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
const REC = 'recDeepReview0001';
let db: pg.Pool; let google: FakeGoogle; let server: http.Server;
const dl = { url: '', submits: 0, lastBody: {} as any, polls: 0, pendingPolls: 1, results: [] as any[] };

const project = (fields: Record<string, unknown> = {}) => ({ id: REC, fields: {
  'Name of the Lead List': 'Deep test', 'ICP Description': 'US B2B marketing agencies, 1-50 employees', 'List Thesis': 'Agencies that need more clients',
  'DiscoLike Company Filters JSON': JSON.stringify({ country: ['US'] }), 'Source Type': 'DiscoLike', 'Client': ['recClientClient001'],
  'Use DiscoGen Deep Review': true, 'DiscoGen Deep Review Prompt': 'Must be a marketing agency serving B2B clients.', 'DiscoGen Deep Review Additional Requirements': 'Exclude freelancers.',
  'Company Sample Approved': false, ...fields } });

function cfg(over: Partial<Config> = {}): Config {
  return { ...loadConfig({ ENGINE_SECRET: 'x'.repeat(40), DATABASE_URL: url ?? 'postgres://x' } as NodeJS.ProcessEnv), googleKeyFile: google.keyFile, googleImpersonateUser: 'scale@dulcy.io', googleSheetsBaseUrl: google.url, discoLikeApiKey: 'k', discoLikeBaseUrl: dl.url, dryRun: false, liveStages: [], ...over };
}
async function run(input: Record<string, unknown>, dryRun = false) {
  const q = await enqueue(db, { kind: 'leadlist.deepreview', recordId: REC, dryRun, input, requestId: String(Math.random()), maxAttempts: 3, deadlineMs: 60_000 });
  for (let i = 0; i < 20; i++) {
    await runOnce(db, cfg());
    const j = await getJob(db, q.job.id);
    if (['succeeded', 'failed', 'needs_review'].includes(j!.job.status)) return j!;
    await db.query(`UPDATE jobs SET run_after=now() WHERE id=$1 AND status='queued'`, [q.job.id]);
  }
  throw new Error('did not settle');
}

before(async () => {
  google = await startFakeGoogle();
  server = http.createServer(async (req, res) => {
    const chunks: Buffer[] = []; for await (const c of req) chunks.push(c as Buffer);
    res.setHeader('content-type', 'application/json');
    if (req.method === 'POST' && req.url === '/v1/validate/icp') {
      dl.submits++; dl.lastBody = JSON.parse(Buffer.concat(chunks).toString());
      return res.end(JSON.stringify({ task_id: `icp-${dl.submits}` }));
    }
    if (req.url?.startsWith('/v1/discogen/status/')) {
      dl.polls++;
      if (dl.polls <= dl.pendingPolls) return res.end(JSON.stringify({ status: 'running' }));
      return res.end(JSON.stringify({ status: 'completed', results: dl.results }));
    }
    res.statusCode = 404; res.end('{}');
  });
  await new Promise<void>((r) => server.listen(0, () => r()));
  dl.url = `http://127.0.0.1:${(server.address() as any).port}`;
  if (skip) return;
  db = createPool(url!); await migrate(db);
});
after(async () => { google.close(); server.close(); if (!skip) await db.end(); });
beforeEach(async () => {
  Object.assign(dl, { submits: 0, lastBody: {}, polls: 0, pendingPolls: 1, results: [
    { domain: 'acme.com', fit: 'yes', confidence: 'high', reasoning: 'B2B agency' },
    { domain: 'beta.com', fit: 'no', confidence: 'high', reasoning: 'software company' },
    { domain: 'gamma.com', fit: 'partial', confidence: 'medium', reasoning: 'unclear clients' },
  ] });
  google.written = {}; google.writes = 0;
  if (skip) return;
  for (const t of ['jobs', 'lead_deep_reviews', 'lead_companies', 'lead_list_sheets']) await db.query(`DELETE FROM ${t} WHERE ${t === 'jobs' ? 'record_id' : 'list_id'}=$1`, [REC]);
  await db.query(`DELETE FROM receipts WHERE receipt_key LIKE $1`, [`rec:leadlist.deepreview:${REC}:%`]);
  for (const [d, tier] of [['acme.com', 'Tier 1'], ['beta.com', 'Tier 2'], ['gamma.com', 'Tier 1'], ['cut.com', 'Cut']]) {
    await db.query(`INSERT INTO lead_companies (list_id, domain, tier, data, batch) VALUES ($1,$2,$3,$4,1)`, [REC, d, tier, JSON.stringify({ name: d.split('.')[0] })]);
  }
  await db.query(`INSERT INTO lead_list_sheets (list_id, kind, sheet_id, tab) VALUES ($1,'companies','sheet-dr','Engine Companies')`, [REC]);
  google.written['sheet-dr'] = { 'Engine Companies': [] };
});

test('Deep review: n8n\'s request (prompt + web search) for the usable companies only; Fail cuts; verdicts saved; n8n fields + Results URL', { skip }, async () => {
  const j = await run({ project: project() });
  assert.equal(j.job.status, 'succeeded', j.job.error);
  assert.equal(dl.submits, 1);
  assert.deepEqual([...dl.lastBody.domains].sort(), ['acme.com', 'beta.com', 'gamma.com'], 'already-cut companies are not paid for');
  assert.equal(dl.lastBody.web_search, true);
  assert.match(dl.lastBody.icp_text, /Must be a marketing agency serving B2B clients\./);
  assert.match(dl.lastBody.icp_text, /Exclude freelancers\./);
  assert.ok(dl.polls >= 2, 'waited for the task');
  const tiers = Object.fromEntries((await db.query(`SELECT domain, tier FROM lead_companies WHERE list_id=$1`, [REC])).rows.map((r) => [r.domain, r.tier]));
  assert.deepEqual(tiers, { 'acme.com': 'Tier 1', 'beta.com': 'Cut', 'gamma.com': 'Tier 1', 'cut.com': 'Cut' });
  const v = Object.fromEntries((await db.query(`SELECT domain, verdict FROM lead_deep_reviews WHERE list_id=$1`, [REC])).rows.map((r) => [r.domain, r.verdict]));
  assert.deepEqual(v, { 'acme.com': 'Pass', 'beta.com': 'Fail', 'gamma.com': 'Needs review' });
  const tab = google.written['sheet-dr']['AI Company Review'];
  assert.ok(tab && tab[0].includes('Deep Review Verdict'), 'AI Company Review tab written with n8n columns');
  assert.equal(tab.length, 4);
  const f = j.job.result.airtableFields;
  assert.equal(f.fldAWCY4Tl9jpQtYc, 1, 'passed'); assert.equal(f.fldmyD4PJ9mXdCJZ8, 1, 'needs review'); assert.equal(f.fldqaiJodYBS3GpRu, 1, 'failed');
  assert.equal(f.fldY1i1787UwZFOr6, 'Needs Review');
  assert.match(String(f.fld0KlQqxFEG6wgfU), /sheet-dr\/edit#gid=\d+/, 'DiscoGen Review Results URL');
  assert.ok(!('fldqGx4RU4zDYxitK' in f), 'never un-approves the company sample');
  // A second press pays nothing: every usable company is already reviewed.
  const again = await run({ project: project() });
  assert.equal(again.job.status, 'succeeded', again.job.error);
  assert.equal(dl.submits, 1);
  assert.match(again.job.result.message, /already been reviewed/);
});

test('Deep review guards: box not ticked, no prompt, client-specific n8n lists; dry run spends nothing', { skip }, async () => {
  const a = await run({ project: project({ 'Use DiscoGen Deep Review': false }) });
  assert.equal(a.job.status, 'failed'); assert.match(a.job.error, /tick "Use DiscoGen Deep Review"/);
  const b = await run({ project: project({ 'DiscoGen Deep Review Prompt': '' }) });
  assert.equal(b.job.status, 'failed'); assert.match(b.job.error, /Deep Review Prompt/);
  const c = await run({ project: { ...project(), id: 'recrWIAOWk6tCSqjE' } });
  assert.equal(c.job.status, 'failed'); assert.match(c.job.error, /only exists in n8n/);
  const d = await run({ project: project() }, true);
  assert.equal(d.job.status, 'succeeded', d.job.error);
  assert.equal(d.job.result.dryRun, true); assert.equal(d.job.result.plan.companies, 3);
  assert.equal(dl.submits, 0);
});

test('Deep review sample cap: 100 companies per press until the company sample is approved', { skip }, async () => {
  for (let i = 0; i < 120; i++) await db.query(`INSERT INTO lead_companies (list_id, domain, tier, data, batch) VALUES ($1,$2,'Tier 2','{}',2)`, [REC, `co${i}.com`]);
  dl.results = [];
  const d = await run({ project: project() }, true);
  assert.equal(d.job.result.plan.companies, 100);
  const e = await run({ project: project({ 'Company Sample Approved': true }) }, true);
  assert.equal(e.job.result.plan.companies, 123);
});

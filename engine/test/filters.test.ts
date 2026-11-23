// Generate filters (leadlist.filters): the copied n8n branch runs unchanged inside the engine.
import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import type pg from 'pg';
import { createPool, migrate } from '../src/db/pool.js';
import { enqueue, getJob } from '../src/queue.js';
import { runOnce } from '../src/worker.js';
import { loadConfig, type Config } from '../src/config.js';
import { startFakeOpenAI, type FakeOpenAI } from './fakes/openai.js';

const url = process.env.TEST_DATABASE_URL;
const skip = !url ? 'TEST_DATABASE_URL not set' : false;
const REC = 'recFilterTest0001';
let db: pg.Pool;
let server: http.Server;
let ai: FakeOpenAI;
const disco = { url: '', calls: 0, query: '', key: '' };

const ICP = 'Medical spas and aesthetic clinics with 1-200 employees in the United States offering Botox, dermal fillers and laser hair removal';
const rows = Array.from({ length: 20 }, (_, i) => ({
  domain: `glowspa${i}.com`, name: `Glow Spa ${i}`, description: 'Medical spa offering Botox, dermal fillers, laser hair removal and skin rejuvenation treatments.',
  keywords: { 'medical spa': 0.9, 'laser hair removal': 0.8, 'dermal fillers': 0.7, 'skin rejuvenation': 0.6, 'shop now': 0.5 },
  industry_groups: { HEALTHCARE: 0.9, BEAUTY: 0.4 }, business_model: { B2C: 0.9 },
}));
const record = { id: REC, fields: { 'Name of the Lead List': 'Med spas test', 'ICP Description': ICP, 'List Thesis': 'Med spas want more booked consultations.', Client: ['recClientTest0001'], 'Source Type': 'DiscoLike' } };
const client = { id: 'recClientTest0001', fields: { Name: 'Dulcy', 'Brand Name': 'Dulcy', 'Cold Traffic Offer': 'We help med spas book more consultations.' } };
const answer = {
  lookalikeText: 'Medical spas providing Botox, dermal fillers and laser hair removal with personalised treatment plans.',
  keywords: ['medical spa', 'laser hair removal', 'dermal fillers', 'skin rejuvenation', 'shop now'], removed: ['shop now'], notes: '',
  crossIndustry: false, technologyPreferenceNote: '', requiredTechnologies: [], excludedTechnologies: [], technologyNeedsReview: '',
  subIndustries: [], excludedSubIndustries: [], geo: [], bbox: [], geographyNeedsReview: '',
};

function cfg(over: Partial<Config> = {}): Config {
  return { ...loadConfig({ ENGINE_SECRET: 'x'.repeat(40), DATABASE_URL: url ?? 'postgres://x' } as NodeJS.ProcessEnv), discoLikeApiKey: 'disco-key', discoLikeBaseUrl: disco.url, openAiApiKey: 'ai-key', openAiBaseUrl: ai.url, dryRun: false, liveStages: [], ...over };
}
async function settle(c: Config, id: number) {
  for (let i = 0; i < 10; i++) { await runOnce(db, c); const j = await getJob(db, id); if (['succeeded', 'failed', 'needs_review'].includes(j!.job.status)) return j!; await db.query(`UPDATE jobs SET run_after=now() WHERE id=$1 AND status='queued'`, [id]); }
  throw new Error('did not settle');
}
const queue = (dryRun = false) => enqueue(db, { kind: 'leadlist.filters', recordId: REC, dryRun, input: { record, client, action: 'Generate Filters' }, maxAttempts: 3, deadlineMs: 60_000 });

before(async () => {
  server = http.createServer((req, res) => {
    const u = new URL(req.url ?? '/', 'http://x');
    disco.key = String(req.headers['x-discolike-key'] ?? '');
    res.setHeader('content-type', 'application/json');
    if (u.pathname === '/v1/discover') { disco.calls++; disco.query = u.search; return res.end(JSON.stringify(rows.slice(0, Number(u.searchParams.get('max_records'))))); }
    res.statusCode = 404; res.end('{}');
  });
  await new Promise<void>((r) => server.listen(0, () => r()));
  disco.url = `http://127.0.0.1:${(server.address() as any).port}`;
  ai = await startFakeOpenAI();
  if (skip) return;
  db = createPool(url!); await migrate(db);
});
after(async () => { server.close(); ai.close(); if (!skip) await db.end(); });
beforeEach(async () => {
  disco.calls = 0; ai.calls = 0; ai.answer = answer;
  if (skip) return;
  await db.query(`DELETE FROM receipts WHERE receipt_key LIKE $1`, [`%${REC}%`]);
  await db.query(`DELETE FROM jobs WHERE record_id=$1`, [REC]);
});

test('generate filters: DiscoLike ICP analysis, one AI review, plan built by the copied n8n code', { skip }, async () => {
  const q = await queue();
  const j = await settle(cfg(), q.job.id);
  assert.equal(j.job.status, 'succeeded', j.job.error);
  const r = j.job.result;
  // The exact DiscoLike call n8n made.
  assert.equal(disco.calls, 1);
  const sp = new URLSearchParams(disco.query);
  assert.equal(sp.get('icp_prompt'), ICP);
  assert.equal(sp.get('relevance'), 'BALANCED');
  assert.equal(sp.get('max_records'), '20');
  assert.equal(disco.key, 'disco-key');
  // One AI call, with the targeting sentence, DiscoLike evidence and client context in the prompt.
  assert.equal(ai.calls, 1);
  assert.match(ai.lastUser, /Medical spas and aesthetic clinics/);
  assert.match(ai.lastUser, /glowspa0\.com/);
  assert.match(ai.lastUser, /book more consultations/);
  // The plan.
  const f = r.filters;
  assert.equal(f.icp_prompt, ICP);
  assert.equal(f.icp_text, answer.lookalikeText);
  assert.equal(f.employee_range, '1,200');
  assert.deepEqual(f.country, ['US']);
  assert.ok(Array.isArray(f.phrase_match) && f.phrase_match.length >= 3, JSON.stringify(f.phrase_match));
  assert.ok(!f.phrase_match.some((k: string) => /shop now/i.test(k)), 'generic CTA removed');
  assert.deepEqual(f.domain, ['glowspa0.com', 'glowspa1.com', 'glowspa2.com', 'glowspa3.com', 'glowspa4.com']);
  assert.equal(f.relevance, 'BALANCED');
  assert.equal(f.exclude_leadgen, true);
  // The Airtable update n8n saved, without n8n's own Automation Action field.
  const a = r.airtableFields;
  assert.equal(JSON.parse(a.fldC2hZQ3gSqLmi1y).icp_prompt, ICP);
  assert.equal(a.fldG2MXz5lccu7KKU, '1,200');
  assert.equal(a.fldf9wpMGWg0SebHV, 'Completed');
  assert.ok(!('fldhViG7kJ5rKEaa4' in a));
  assert.match(r.message, /Review them before running the first 100 companies/);
});

test('generate filters: a retry of the same press never pays twice; a new press regenerates; dry run spends nothing', { skip }, async () => {
  // First attempt crashes after both paid calls (the AI answer can't be applied), the retry reuses them.
  ai.answer = { ...answer, technologyNeedsReview: 'unclear vendor' };
  const q = await queue();
  await runOnce(db, cfg());
  assert.equal(disco.calls, 1); assert.equal(ai.calls, 1);
  assert.equal((await getJob(db, q.job.id))!.job.status, 'failed', 'bad AI answer stops the press');
  // A new press is a fresh generation (n8n regenerates too).
  ai.answer = answer;
  const again = await enqueue(db, { kind: 'leadlist.filters', recordId: REC, dryRun: false, input: { record, client }, requestId: 'second', maxAttempts: 3, deadlineMs: 60_000 });
  assert.equal((await settle(cfg(), again.job.id)).job.status, 'succeeded');
  assert.equal(disco.calls, 2); assert.equal(ai.calls, 2);
  const d = await enqueue(db, { kind: 'leadlist.filters', recordId: REC, dryRun: true, input: { record: { ...record, fields: { ...record.fields, 'ICP Description': ICP + ' in Texas' } }, client }, requestId: 'dry', maxAttempts: 3, deadlineMs: 60_000 });
  const dj = await settle(cfg(), d.job.id);
  assert.equal(dj.job.result.dryRun, true);
  assert.equal(disco.calls, 2); assert.equal(ai.calls, 2);
});

test('generate filters: no targeting sentence or an empty DiscoLike answer stops with a clear message', { skip }, async () => {
  const bad = await enqueue(db, { kind: 'leadlist.filters', recordId: REC, dryRun: false, input: { record: { ...record, fields: { ...record.fields, 'ICP Description': '' } }, client }, requestId: 'noicp', maxAttempts: 3, deadlineMs: 60_000 });
  const jb = await settle(cfg(), bad.job.id);
  assert.equal(jb.job.status, 'failed');
  assert.match(jb.job.error, /targeting sentence/i);
  assert.equal(disco.calls, 0);
});

test('generate filters: "between 10 and 200 employees" sets the employee range (live 2026-11-23: it was ignored)', { skip }, async () => {
  const sentence = 'Pet ecom brands in the US between 10 and 200 employees';
  const q = await enqueue(db, { kind: 'leadlist.filters', recordId: REC, dryRun: false, input: { record: { ...record, fields: { ...record.fields, 'ICP Description': sentence } }, client, action: 'Generate Filters' }, requestId: 'between', maxAttempts: 3, deadlineMs: 60_000 });
  const j = await settle(cfg(), q.job.id);
  assert.equal(j.job.status, 'succeeded', j.job.error);
  assert.equal(j.job.result.filters.employee_range, '10,200');
  assert.equal(j.job.result.airtableFields.fldG2MXz5lccu7KKU, '10,200');
});

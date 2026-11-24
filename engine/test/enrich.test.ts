// Enrichment: the old n8n 04 (prompt builder) and 05 (DiscoGen run, live copy) code runs unchanged.
import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import type pg from 'pg';
import { createPool, migrate } from '../src/db/pool.js';
import { enqueue, getJob } from '../src/queue.js';
import { runOnce } from '../src/worker.js';
import { loadConfig, type Config } from '../src/config.js';
import { startFakeGoogle, type FakeGoogle } from './fakes/google.js';
import { startFakeOpenAI, type FakeOpenAI } from './fakes/openai.js';

const url = process.env.TEST_DATABASE_URL;
const skip = !url ? 'TEST_DATABASE_URL not set' : false;
const REC = 'recEnrichTest0001';
let db: pg.Pool; let google: FakeGoogle; let ai: FakeOpenAI; let server: http.Server;
const dg = { url: '', submits: 0, lastPath: '', lastBody: {} as any, polls: 0, pendingPolls: 1, results: {} as Record<string, any> };

const HEAD = ['Email', 'First Name', 'Last Name', 'Title', 'Company', 'Domain', 'LinkedIn URL', 'Country', 'State', 'Email Type', 'Verification Status', 'Verification Provider', 'Verification Path', 'Original Email'];
const row = (email: string, first: string, company: string, domain: string, type = 'Direct') => [email, first, 'Lee', 'Owner', company, domain, '', 'US', '', type, 'Good', 'MillionVerifier', 'MillionVerifier valid', ''];
const PROMPT = '# ENRICHMENT PROMPT\n# INPUTS\nCompany Name, Website\n# VARIABLE: City\n## SCOPE\ncompany\n## OBJECTIVE\nFind the headquarters city.\n## OUTPUT\nReturn JSON only: {"city": "<city>"} or {"city": "Not Found"}\n';
const project = (fields: Record<string, unknown> = {}) => ({ id: REC, fields: { 'Name of the Lead List': 'Enrich test', 'Lead List Link': 'https://docs.google.com/spreadsheets/d/sheet-en/edit', 'Verification Provider State': 'completed', 'Custom Variables Requested': PROMPT, ...fields } });

function cfg(over: Partial<Config> = {}): Config {
  return { ...loadConfig({ ENGINE_SECRET: 'x'.repeat(40), DATABASE_URL: url ?? 'postgres://x' } as NodeJS.ProcessEnv), googleKeyFile: google.keyFile, googleImpersonateUser: 'scale@dulcy.io', googleSheetsBaseUrl: google.url, discoLikeApiKey: 'k', discoLikeBaseUrl: dg.url, openAiApiKey: 'sk', openAiBaseUrl: ai.url, dryRun: false, liveStages: [], ...over };
}
async function run(kind: string, input: Record<string, unknown>, dryRun = false) {
  const q = await enqueue(db, { kind, recordId: REC, dryRun, input, requestId: String(Math.random()), maxAttempts: 3, deadlineMs: 60_000 });
  for (let i = 0; i < 20; i++) {
    await runOnce(db, cfg());
    const j = await getJob(db, q.job.id);
    if (['succeeded', 'failed', 'needs_review'].includes(j!.job.status)) return j!;
    await db.query(`UPDATE jobs SET run_after=now() WHERE id=$1 AND status='queued'`, [q.job.id]);
  }
  throw new Error('did not settle');
}

before(async () => {
  google = await startFakeGoogle(); ai = await startFakeOpenAI();
  server = http.createServer(async (req, res) => {
    const chunks: Buffer[] = []; for await (const c of req) chunks.push(c as Buffer);
    res.setHeader('content-type', 'application/json');
    if (req.method === 'POST' && /^\/v1\/discogen\/process(-personas)?$/.test(req.url ?? '')) {
      dg.submits++; dg.lastPath = req.url!; dg.lastBody = JSON.parse(Buffer.concat(chunks).toString());
      return res.end(JSON.stringify({ task_id: `task-${dg.submits}` }));
    }
    if (req.url?.startsWith('/v1/discogen/status/')) {
      dg.polls++;
      if (dg.polls <= dg.pendingPolls) return res.end(JSON.stringify({ status: 'processing' }));
      return res.end(JSON.stringify({ status: 'completed', results: dg.results }));
    }
    res.statusCode = 404; res.end('{}');
  });
  await new Promise<void>((r) => server.listen(0, () => r()));
  dg.url = `http://127.0.0.1:${(server.address() as any).port}`;
  if (skip) return;
  db = createPool(url!); await migrate(db);
});
after(async () => { google.close(); ai.close(); server.close(); if (!skip) await db.end(); });
beforeEach(async () => {
  google.tabs = { 'Final Direct': [HEAD, row('ann@acme.com', 'Ann', 'Acme', 'acme.com'), row('bo@beta.com', 'Bo', 'Beta', 'beta.com')], 'Final Generic': [HEAD, row('info@acme.com', '', 'Acme', 'acme.com', 'Generic')] };
  google.written = {}; google.writes = 0;
  Object.assign(dg, { submits: 0, lastPath: '', lastBody: {}, polls: 0, pendingPolls: 1, results: { 'acme.com': { city: 'Austin' }, 'beta.com': { city: 'Not Found' } } });
  ai.calls = 0; ai.rawText = undefined;
  if (!skip) await db.query(`DELETE FROM jobs WHERE record_id=$1`, [REC]);
});

test('Prepare Enrichment Prompt: n8n\'s prompt builder in one AI call; the structured prompt is saved back for review', { skip }, async () => {
  ai.rawText = '```markdown\n' + PROMPT + '```';
  const j = await run('leadlist.enrichprompt', { project: project({ 'Custom Variables Requested': 'Find the headquarters city of each company.' }) });
  assert.equal(j.job.status, 'succeeded', j.job.error);
  assert.equal(ai.calls, 1);
  assert.match(String(ai.lastSystem), /production-grade DiscoGen web-research instructions/);
  assert.match(ai.lastUser, /Find the headquarters city/);
  const f = j.job.result.airtableFields;
  assert.equal(f.fldTYRjTrpVW27tmG, PROMPT.trim(), 'Custom Variables Requested = the prepared prompt (code fence stripped)');
  assert.match(String(f.fldVnH7Pn1PxlZI5b), /Requested output keys: city\. No enrichment has run\./);
  assert.ok(!('fldLyvQsbGvii0iUK' in f), "n8n's own Enrichment Action field is never written");
});

test('Run Enrichment: one DiscoGen task for the domains missing the value; only empty cells filled; Final tabs rewritten; Stage QA', { skip }, async () => {
  const j = await run('leadlist.enrich', { project: project() });
  assert.equal(j.job.status, 'succeeded', j.job.error);
  assert.equal(dg.submits, 1);
  assert.equal(dg.lastPath, '/v1/discogen/process');
  assert.deepEqual([...dg.lastBody.domains].sort(), ['acme.com', 'beta.com']);
  assert.equal(dg.lastBody.context_mode, 'website');
  assert.equal(dg.lastBody.search_context_size, 'high');
  assert.equal(dg.lastBody.web_search, true);
  assert.match(dg.lastBody.query, /This is company-level enrichment/);
  assert.ok(dg.polls >= 2, 'waited for the task');
  const d = google.written['sheet-en']['Final Direct'];
  const ci = d[0].indexOf('City');
  assert.ok(ci > 0, 'City column appended');
  assert.equal(d.find((r) => r[0] === 'ann@acme.com')![ci], 'Austin');
  assert.equal(d.find((r) => r[0] === 'bo@beta.com')![ci] ?? '', '', '"Not Found" is not written');
  const f = j.job.result.airtableFields;
  assert.equal(f.fld8nrebRFL0O8kgj, 'QA', 'Lead List Stage');
  assert.equal(f.fldf9wpMGWg0SebHV, 'Completed');
  assert.match(String(f.fldVnH7Pn1PxlZI5b), /Enrichment cohort complete/);
});

test('Run Enrichment guards: no prepared prompt, verification not completed, client-specific n8n lists, dry run spends nothing', { skip }, async () => {
  const a = await run('leadlist.enrich', { project: project({ 'Custom Variables Requested': 'find the city' }) });
  assert.equal(a.job.status, 'failed'); assert.match(a.job.error, /Prepare and review the DiscoGen prompt/);
  const b = await run('leadlist.enrich', { project: project({ 'Verification Provider State': 'running' }) });
  assert.equal(b.job.status, 'failed'); assert.match(b.job.error, /Complete verification before enrichment/);
  const c = await run('leadlist.enrich', { project: { ...project(), id: 'rec468aQaOEYtdYL3' } });
  assert.equal(c.job.status, 'failed'); assert.match(c.job.error, /only exists in n8n/);
  const d = await run('leadlist.enrich', { project: project() }, true);
  assert.equal(d.job.status, 'succeeded', d.job.error);
  assert.equal(d.job.result.dryRun, true);
  assert.equal(dg.submits, 0);
});

test('Run Enrichment: one variable answered as bare values ("Austin") is read, not rejected; error strings stay blank', { skip }, async () => {
  dg.results = { 'acme.com': 'Austin', 'beta.com': 'Error: no data' } as any;
  const j = await run('leadlist.enrich', { project: project() });
  assert.equal(j.job.status, 'succeeded', j.job.error);
  const d = google.written['sheet-en']['Final Direct'];
  const ci = d[0].indexOf('City');
  assert.equal(d.find((r) => r[0] === 'ann@acme.com')![ci], 'Austin');
  assert.equal(d.find((r) => r[0] === 'bo@beta.com')![ci] ?? '', '');
});

test('Copy-friendly fallback (Alex 2026-11-21): the prompt step asks for one; leads the research cannot answer get it instead of a blank', { skip }, async () => {
  ai.rawText = PROMPT;
  await run('leadlist.enrichprompt', { project: project({ 'Custom Variables Requested': 'Find the headquarters city of each company.' }) });
  assert.match(String(ai.lastSystem), /DULCY RULE/);
  assert.match(String(ai.lastSystem), /your area/);
  const withFallback = PROMPT.replace('## OUTPUT', '## FALLBACK\nIf the value cannot be verified, return exactly: "your area"\n## OUTPUT');
  dg.results = { 'acme.com': { city: 'Austin' }, 'beta.com': { city: 'Not Found' } };
  const j = await run('leadlist.enrich', { project: project({ 'Custom Variables Requested': withFallback }) });
  assert.equal(j.job.status, 'succeeded', j.job.error);
  const d = google.written['sheet-en']['Final Direct'];
  const ci = d[0].indexOf('City');
  assert.equal(d.find((r) => r[0] === 'ann@acme.com')![ci], 'Austin');
  assert.equal(d.find((r) => r[0] === 'bo@beta.com')![ci], 'your area');
  const g = google.written['sheet-en']['Final Generic'];
  assert.ok(g.slice(1).every((r) => r[g[0].indexOf('City')]), 'no blank city left in Final Generic');
});

test('fallbacks (unit): blank and "Not Found" values get the FALLBACK phrase; the report counts found vs fallback (2026-11-24)', async () => {
  const { fillFallbacks } = await import('../src/stages/enrichment.js');
  const prompt = '# VARIABLE: CITY\n## SCOPE\nThe city.\n## FALLBACK\nIf the value cannot be verified, return exactly: "your area"\n';
  const built: any = { tabValues: { 'Final Direct': [['Email', 'CITY'], ['a@x.com', 'Miami'], ['b@x.com', ''], ['c@x.com', 'Not Found']] }, tabWritePlan: { 'Final Direct': { shouldWrite: false } } };
  const report: Record<string, { used: number; leads: number; phrase: string }> = {};
  assert.equal(fillFallbacks(built, prompt, [{ column: 'CITY' }], report), 2);
  assert.deepEqual(built.tabValues['Final Direct'].slice(1).map((r: string[]) => r[1]), ['Miami', 'your area', 'your area']);
  assert.deepEqual(report.CITY, { used: 2, leads: 3, phrase: 'your area' });
  assert.equal(built.tabWritePlan['Final Direct'].shouldWrite, true, 'the filled values are written to the sheet');
});

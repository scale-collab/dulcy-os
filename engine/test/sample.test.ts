// Company sample (leadlist.sample) with a fake DiscoLike: free count, one paid search, fit check, gate.
import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import type pg from 'pg';
import { createPool, migrate } from '../src/db/pool.js';
import { enqueue, getJob } from '../src/queue.js';
import { runOnce } from '../src/worker.js';
import { loadConfig, type Config } from '../src/config.js';
import { approvedFilters, toQuery } from '../src/leadlist/filters.js';
import { toCompany } from '../src/leadlist/companies.js';
import { startFakeOpenAI, type FakeOpenAI } from './fakes/openai.js';

const url = process.env.TEST_DATABASE_URL;
const skip = !url ? 'TEST_DATABASE_URL not set' : false;
const REC = 'recLeadListTest01';

let db: pg.Pool;
const fake = { url: '', count: 250, rows: [] as any[], discoverCalls: 0, countCalls: 0, lastQuery: '', countQuery: '', key: '' };
let server: http.Server;
let ai: FakeOpenAI;

const co = (domain: string, description: string, extra: Record<string, unknown> = {}) => ({ domain, name: domain.split('.')[0], description, keywords: { roofing: 0.9 }, industry_groups: { CONSTRUCTION: 1 }, ...extra });

function cfg(over: Partial<Config> = {}): Config {
  return { ...loadConfig({ ENGINE_SECRET: 'x'.repeat(40), DATABASE_URL: url ?? 'postgres://x' } as NodeJS.ProcessEnv), discoLikeApiKey: 'disco-key', discoLikeBaseUrl: fake.url, dryRun: true, liveStages: ['leadlist.sample'], ...over };
}
const FILTERS = { category: ['CONSTRUCTION', 'E_COMMERCE'], country: ['US', 'CA'], relevance: 'BALANCED', icp_prompt: 'roofers in Texas', icp_text: 'Residential roofers', exclusion_query_id: ['q1'], redirect: false, exclude_leadgen: true };
const queue = (input: Record<string, unknown> = {}, dryRun = false) => enqueue(db, { kind: 'leadlist.sample', recordId: REC, dryRun, input: { filters: FILTERS, fit: { excludeKeywords: ['directory'] }, ...input }, maxAttempts: 3, deadlineMs: 60_000 });
async function settle(c: Config, id: number) {
  for (let i = 0; i < 20; i++) {
    await runOnce(db, c);
    const j = await getJob(db, id);
    if (['succeeded', 'failed', 'needs_review'].includes(j!.job.status)) return j!;
    await db.query(`UPDATE jobs SET run_after = now() WHERE id = $1 AND status = 'queued'`, [id]);
  }
  throw new Error('job did not settle');
}

before(async () => {
  server = http.createServer((req, res) => {
    const u = new URL(req.url ?? '/', 'http://x');
    fake.key = String(req.headers['x-discolike-key'] ?? '');
    fake.lastQuery = u.search;
    res.setHeader('content-type', 'application/json');
    if (u.pathname === '/v1/count') {
      fake.countCalls++; fake.countQuery = u.search;
      for (const bad of ['icp_text', 'relevance', 'exclusion_query_id', 'domain', 'include_search_domains']) if (u.searchParams.has(bad)) { res.statusCode = 422; return res.end(JSON.stringify({ detail: [{ type: 'extra_forbidden', loc: ['query', bad] }] })); }
      return res.end(JSON.stringify({ count: fake.count }));
    }
    if (u.pathname === '/v1/discover') { fake.discoverCalls++; return res.end(JSON.stringify(fake.rows.slice(0, Number(u.searchParams.get('max_records'))))); }
    res.statusCode = 404; res.end('{}');
  });
  ai = await startFakeOpenAI();
  await new Promise<void>((r) => server.listen(0, () => r()));
  fake.url = `http://127.0.0.1:${(server.address() as any).port}`;
  if (skip) return;
  db = createPool(url!); await migrate(db);
});
after(async () => { server.close(); ai.close(); if (!skip) await db.end(); });
beforeEach(async () => {
  Object.assign(fake, { count: 250, discoverCalls: 0, countCalls: 0, lastQuery: '', countQuery: '', key: '' });
  fake.rows = [
    ...Array.from({ length: 9 }, (_, i) => co(`roofer${i}.com`, 'Residential roofing contractor')),
    co('bestroofers-directory.com', 'A directory of local roofers'),
  ];
  ai.calls = 0; ai.status = 200; ai.answer = {};
  if (!skip) await db.query('TRUNCATE jobs, steps, receipts, events, lead_companies, lead_list_sheets, lead_list_profiles RESTART IDENTITY CASCADE');
});

test('filters: old workflow rules (ICP sentence removed, E_COMMERCE fixed, legacy similarity refused, lists repeat the key)', () => {
  const f = approvedFilters(FILTERS);
  assert.equal(f.icp_prompt, undefined);
  assert.deepEqual(f.category, ['CONSTRUCTION', 'E-COMMERCE']);
  assert.throws(() => approvedFilters({ min_similarity: 0.5 }), /legacy similarity/);
  assert.throws(() => approvedFilters({ relevance: 'HIGH' }), /invalid DiscoLike relevance/);
  assert.throws(() => approvedFilters({ icp_prompt: 'x' }), /empty/);
  assert.equal(toQuery({ category: ['A', 'B'], country: 'US', blank: '' }), 'category=A&category=B&country=US');
});

test('rows: DiscoLike label objects become lists; domains are cleaned', () => {
  const c = toCompany({ domain: 'https://www.Acme.com/', keywords: { roofing: 0.9, gutters: 0.4 }, industry_groups: { CONSTRUCTION: 1 }, address: { country: 'US' } });
  assert.equal(c.domain, 'acme.com');
  assert.deepEqual(c.keywords, ['roofing', 'gutters']);
  assert.equal(c.country, 'US');
  assert.deepEqual(toCompany({ domain: 'a.com', public_emails: ['Info@A.com', 'bad', 'sales@a.com'] }).public_emails, ['info@a.com', 'sales@a.com']);
});

test('dry-run: free count only; nothing paid', { skip }, async () => {
  const q = await queue({}, true);
  const j = await settle(cfg(), q.job.id);
  assert.equal(j.job.status, 'succeeded', j.job.error);
  assert.equal(j.job.result.matching, 250);
  assert.deepEqual(j.job.result.wouldSpendCredits, { discolike: 100 });
  assert.equal(fake.discoverCalls, 0);
  assert.equal(fake.key, 'disco-key');
  assert.match(fake.countQuery, /country=US%2CCA/, 'count joins lists with commas');
  assert.doesNotMatch(fake.countQuery, /icp_text|relevance|exclusion_query_id/, 'search-only settings are left out of the count');
  assert.match(j.job.result.message, /count ignores icp_text, relevance, exclusion_query_id/);
});

test('live: one paid search, fit check drops the directory with a reason, gate Passed at 90%', { skip }, async () => {
  const q = await queue();
  const j = await settle(cfg(), q.job.id);
  assert.equal(j.job.status, 'succeeded', j.job.error);
  assert.equal(fake.discoverCalls, 1);
  assert.equal(j.job.result.sample.reviewed, 10);
  assert.equal(j.job.result.sample.cut, 1);
  assert.equal(j.job.result.sample.tier1 + j.job.result.sample.tier2, 9);
  const saved = await db.query(`SELECT tier, COUNT(*)::int n FROM lead_companies WHERE list_id=$1 AND batch=0 GROUP BY tier`, [REC]);
  assert.equal(saved.rows.reduce((a, r) => a + r.n, 0), 10, 'the sample is saved as batch 0');
  assert.equal(j.job.result.sample.status, 'Passed');
  assert.equal(j.job.result.dropped[0].domain, 'bestroofers-directory.com');
  assert.match(fake.lastQuery, /icp_text=Residential/, 'the search keeps the full saved plan');
  assert.match(fake.lastQuery, /category=CONSTRUCTION&category=E-COMMERCE/);
  assert.match(j.job.result.dropped[0].reasons.join(' '), /directory/);
});

test('re-running the same sample never pays again', { skip }, async () => {
  await settle(cfg(), (await queue()).job.id);
  const j = await settle(cfg(), (await queue()).job.id);
  assert.equal(j.job.status, 'succeeded', j.job.error);
  assert.equal(fake.discoverCalls, 1, 'the second job reused the saved search');
});

test('a weak sample fails the gate (under 70% usable)', { skip }, async () => {
  fake.rows = [...Array.from({ length: 6 }, (_, i) => co(`dir${i}.com`, 'Online directory of contractors')), ...Array.from({ length: 4 }, (_, i) => co(`r${i}.com`, 'Roofing'))];
  const j = await settle(cfg(), (await queue()).job.id);
  assert.equal(j.job.result.sample.status, 'Failed');
});

test('no matching companies or no key: stops before spending', { skip }, async () => {
  fake.count = 0;
  const a = await settle(cfg(), (await queue()).job.id);
  assert.equal(a.job.status, 'failed');
  assert.match(a.job.error, /no companies match/);
  await db.query('TRUNCATE jobs, steps, receipts, events, lead_companies, lead_list_sheets, lead_list_profiles RESTART IDENTITY CASCADE');
  const b = await settle(cfg({ discoLikeApiKey: undefined }), (await queue()).job.id);
  assert.equal(b.job.status, 'failed');
  assert.match(b.job.error, /no DiscoLike API key/);
  assert.equal(fake.discoverCalls, 0);
});

test('lookalike-only plan: no free count, the sample still runs', { skip }, async () => {
  const j = await settle(cfg(), (await queue({ filters: { icp_text: 'Residential roofers', relevance: 'BALANCED' } })).job.id);
  assert.equal(j.job.status, 'succeeded', j.job.error);
  assert.equal(fake.countCalls, 0);
  assert.equal(fake.discoverCalls, 1);
});

test('credit cap: a sample over the per-job cap stops before the search', { skip }, async () => {
  const j = await settle(cfg({ capPerJob: 50, capFreeProviders: [] }), (await queue()).job.id); // a capped provider
  assert.equal(j.job.status, 'needs_review');
  assert.match(j.job.error, /credit cap/);
  assert.equal(fake.discoverCalls, 0);
});

test('profile: ONE AI call per list from thesis + client context; it decides the cuts; a re-run never calls again', { skip }, async () => {
  ai.answer = { summary: 'Residential roofers; the client is a marketing agency, so no directories or agencies.', customer: 'residential', excludeKeywords: ['marketing agency'], targetIndustries: ['CONSTRUCTION'], targetKeywords: ['residential roofing'] };
  fake.rows = [...Array.from({ length: 8 }, (_, i) => co(`roofer${i}.com`, 'Residential roofing contractor')), co('growthco.com', 'A marketing agency for roofers'), co('bigroof.com', 'Industrial roofing for warehouses')];
  const c = cfg({ openAiApiKey: 'sk-test', openAiBaseUrl: ai.url });
  const input = { fit: undefined, thesis: 'Residential roofing companies', clientContext: 'Marketing agency for local home-service businesses' };
  const j = await settle(c, (await queue(input)).job.id);
  assert.equal(j.job.status, 'succeeded', j.job.error);
  assert.equal(ai.calls, 1, 'one call for the whole list');
  assert.match(ai.lastUser, /Residential roofing companies/);
  assert.match(ai.lastUser, /CONSTRUCTION \(10\)/, 'the AI sees the real industry codes from the sample');
  assert.equal(j.job.result.profile.source, 'ai');
  const cut = j.job.result.dropped.map((d: any) => d.domain).sort();
  assert.deepEqual(cut, ['bigroof.com', 'growthco.com']);
  assert.equal(j.job.result.sample.tier1, 8, 'industry + target wording = Tier 1');
  await settle(c, (await queue(input)).job.id);
  assert.equal(ai.calls, 1, 'the same thesis never calls the AI again');
});

test('profile: no key or an AI error never stops the list (code-only profile)', { skip }, async () => {
  const j = await settle(cfg(), (await queue({ thesis: 'Residential roofing companies' })).job.id);
  assert.equal(j.job.status, 'succeeded', j.job.error);
  assert.equal(j.job.result.profile.source, 'code');
  await db.query('TRUNCATE jobs, steps, receipts, events, lead_companies, lead_list_sheets, lead_list_profiles RESTART IDENTITY CASCADE');
  ai.status = 401;
  const k = await settle(cfg({ openAiApiKey: 'sk-bad', openAiBaseUrl: ai.url }), (await queue({ thesis: 'Residential roofing companies' })).job.id);
  assert.equal(k.job.status, 'succeeded', k.job.error);
  assert.equal(k.job.result.profile.source, 'code');
  assert.match(k.job.result.profile.notes, /AI profile unavailable/);
});

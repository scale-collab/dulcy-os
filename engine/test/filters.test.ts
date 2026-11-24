// Generate filters (leadlist.filters): the copied n8n branch runs inside the engine, plus Alex's
// 2026-11-23 rules: a 500-company lookalike pull for the analysis, labels only when they fit
// (60%+ coverage, either/or), a soft size goal and auto-widen with the free count.
import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import type pg from 'pg';
import { createPool, migrate } from '../src/db/pool.js';
import { enqueue, getJob } from '../src/queue.js';
import { runOnce } from '../src/worker.js';
import { loadConfig, type Config } from '../src/config.js';
import { startFakeOpenAI, type FakeOpenAI } from './fakes/openai.js';
import { applyLabels, labelCoverage, widerEmployeeRange } from '../src/leadlist/filterSizing.js';

const url = process.env.TEST_DATABASE_URL;
const skip = !url ? 'TEST_DATABASE_URL not set' : false;
const REC = 'recFilterTest0001';
let db: pg.Pool;
let server: http.Server;
let ai: FakeOpenAI;

type Row = Record<string, any>;
const spa = (i: number): Row => ({
  domain: `glowspa${i}.com`, name: `Glow Spa ${i}`, description: 'Medical spa offering Botox, dermal fillers, laser hair removal and skin rejuvenation treatments.',
  keywords: { 'medical spa': 0.9, 'laser hair removal': 0.8, 'dermal fillers': 0.7, 'skin rejuvenation': 0.6, 'shop now': 0.5 },
  industry_groups: { HEALTHCARE: 0.9, BEAUTY: 0.4 }, sub_industry: { 'HEALTHCARE/MEDSPA_AND_DERMATOLOGY': 0.8 }, business_model: { B2C: 0.9 },
});
/** A row with these labels present (score 0.8); everything else like a spa row. */
const labelled = (i: number, cats: string[], subs: string[] = []): Row => ({ ...spa(i), industry_groups: Object.fromEntries(cats.map((c) => [c, 0.8])), sub_industry: Object.fromEntries(subs.map((s) => [s, 0.8])) });
const disco = {
  url: '', calls: 0, query: '', key: '', counts: [] as URLSearchParams[],
  rows: (n: number): Row[] => Array.from({ length: n }, (_, i) => spa(i)),
  count: (_p: URLSearchParams): number => 100_000,
};

const ICP = 'Medical spas and aesthetic clinics with 1-200 employees in the United States offering Botox, dermal fillers and laser hair removal';
const PET = 'Pet ecom brands in the US between 10 and 200 employees';
const record = { id: REC, fields: { 'Name of the Lead List': 'Med spas test', 'ICP Description': ICP, 'List Thesis': 'Med spas want more booked consultations.', Client: ['recClientTest0001'], 'Source Type': 'DiscoLike' } };
const client = { id: 'recClientTest0001', fields: { Name: 'Dulcy', 'Brand Name': 'Dulcy', 'Cold Traffic Offer': 'We help med spas book more consultations.' } };
const answer = {
  lookalikeText: 'Medical spas providing Botox, dermal fillers and laser hair removal with personalised treatment plans.',
  keywords: ['medical spa', 'laser hair removal', 'dermal fillers', 'skin rejuvenation', 'shop now'], removed: ['shop now'], notes: '',
  crossIndustry: false, technologyPreferenceNote: '', requiredTechnologies: [], excludedTechnologies: [], technologyNeedsReview: '',
  subIndustries: [] as string[], excludedSubIndustries: [], geo: [], bbox: [], geographyNeedsReview: '',
};

function cfg(over: Partial<Config> = {}): Config {
  return { ...loadConfig({ ENGINE_SECRET: 'x'.repeat(40), DATABASE_URL: url ?? 'postgres://x' } as NodeJS.ProcessEnv), discoLikeApiKey: 'disco-key', discoLikeBaseUrl: disco.url, openAiApiKey: 'ai-key', openAiBaseUrl: ai.url, dryRun: false, liveStages: [], ...over };
}
async function settle(c: Config, id: number) {
  for (let i = 0; i < 10; i++) { await runOnce(db, c); const j = await getJob(db, id); if (['succeeded', 'failed', 'needs_review'].includes(j!.job.status)) return j!; await db.query(`UPDATE jobs SET run_after=now() WHERE id=$1 AND status='queued'`, [id]); }
  throw new Error('did not settle');
}
const queue = (dryRun = false) => enqueue(db, { kind: 'leadlist.filters', recordId: REC, dryRun, input: { record, client, action: 'Generate Filters' }, maxAttempts: 3, deadlineMs: 60_000 });
/** One press with this sentence (and extra input), settled and checked. */
async function press(sentence: string, id: string, extra: Record<string, unknown> = {}) {
  const q = await enqueue(db, { kind: 'leadlist.filters', recordId: REC, dryRun: false, input: { record: { ...record, fields: { ...record.fields, 'ICP Description': sentence } }, client, action: 'Generate Filters', ...extra }, requestId: id, maxAttempts: 3, deadlineMs: 60_000 });
  const j = await settle(cfg(), q.job.id);
  assert.equal(j.job.status, 'succeeded', j.job.error);
  return j.job.result;
}

before(async () => {
  server = http.createServer((req, res) => {
    const u = new URL(req.url ?? '/', 'http://x');
    disco.key = String(req.headers['x-discolike-key'] ?? '');
    res.setHeader('content-type', 'application/json');
    if (u.pathname === '/v1/discover') { disco.calls++; disco.query = u.search; return res.end(JSON.stringify(disco.rows(Number(u.searchParams.get('max_records'))))); }
    if (u.pathname === '/v1/count') { disco.counts.push(u.searchParams); return res.end(JSON.stringify({ count: disco.count(u.searchParams) })); }
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
  disco.calls = 0; disco.counts = []; ai.calls = 0; ai.answer = answer;
  disco.rows = (n) => Array.from({ length: n }, (_, i) => spa(i));
  disco.count = () => 100_000;
  if (skip) return;
  await db.query(`DELETE FROM receipts WHERE receipt_key LIKE $1`, [`%${REC}%`]);
  await db.query(`DELETE FROM jobs WHERE record_id=$1`, [REC]);
});

test('generate filters: one 500-company lookalike pull, one AI review, plan built by the copied n8n code', { skip }, async () => {
  const q = await queue();
  const j = await settle(cfg(), q.job.id);
  assert.equal(j.job.status, 'succeeded', j.job.error);
  const r = j.job.result;
  // ONE paid lookalike pull with only the allowed settings.
  assert.equal(disco.calls, 1);
  const sp = new URLSearchParams(disco.query);
  assert.equal(sp.get('icp_text'), ICP);
  assert.equal(sp.get('max_records'), '500');
  assert.deepEqual(sp.getAll('country'), ['US']);
  assert.equal(sp.get('employee_range'), '1,200');
  assert.equal(sp.get('exclude_leadgen'), 'true');
  for (const k of ['icp_prompt', 'relevance', 'category', 'sub_industry', 'phrase_match']) assert.equal(sp.get(k), null, `${k} not sent to the analysis pull`);
  assert.equal(disco.key, 'disco-key');
  assert.equal(r.discoLikeCompanies, 500);
  assert.equal(r.reviewedCompanies, 50, 'the AI review gets the top 50');
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
  // Labels on every company are used; BEAUTY (score 0.4) is not "present".
  assert.deepEqual(f.category, ['HEALTHCARE']);
  assert.deepEqual(f.sub_industry, ['HEALTHCARE/MEDSPA_AND_DERMATOLOGY']);
  assert.ok(!r.labels.used.some((x: any) => x.label === 'BEAUTY'));
  // The Airtable update n8n saved, without n8n's own Automation Action field, with the final plan.
  const a = r.airtableFields;
  assert.deepEqual(JSON.parse(a.fldC2hZQ3gSqLmi1y), f);
  assert.equal(a.fldG2MXz5lccu7KKU, '1,200');
  assert.equal(a.fldf9wpMGWg0SebHV, 'Completed');
  assert.equal(a.fldVnH7Pn1PxlZI5b, r.message);
  assert.ok(!('fldhViG7kJ5rKEaa4' in a));
  assert.match(r.message, /Review them before running the first 100 companies/);
  // Size: default goal, big enough, no widening.
  assert.deepEqual({ ...r.sizing, counts: undefined }, { leadGoal: 3000, source: 'default', companiesNeeded: 7500, freeCount: 100000, expectedReal: 60000, enough: true, widened: [], counts: undefined, leadsPerCompany: 0.4, countYield: 0.6 });
  assert.match(r.message, /^Goal 3,000 leads \(default\) → needs ~7,500 companies\. Free count 100,000 → expect ~60,000 real\. Big enough/);
  assert.match(r.message, /Labels used \(either\/or\): HEALTHCARE 100%, MEDSPA_AND_DERMATOLOGY 100%/);
  assert.equal(disco.counts.length, 1, 'one free count');
  assert.equal(disco.counts[0].get('category'), 'HEALTHCARE');
});

test('generate filters: analysis size is configurable (max 1000)', { skip }, async () => {
  await press(ICP, 'n200', { filterAnalysisCompanies: 200 });
  assert.equal(new URLSearchParams(disco.query).get('max_records'), '200');
  await press(ICP, 'n5000', { filterAnalysisCompanies: 5000 });
  assert.equal(new URLSearchParams(disco.query).get('max_records'), '1000');
});

test('labels: mixed pet-ecom data (E-COMMERCE 90%, PET_PRODUCTS_BRAND 40%) -> E-COMMERCE only; pet label skipped with its number', { skip }, async () => {
  disco.rows = (n) => Array.from({ length: n }, (_, i) => labelled(i, [...(i % 10 < 9 ? ['E-COMMERCE'] : []), ...(i % 5 < 2 ? ['CONSUMER_PRODUCTS'] : [])], i % 5 < 2 ? ['CONSUMER_PRODUCTS/PET_PRODUCTS_BRAND'] : []));
  ai.answer = { ...answer, subIndustries: ['CONSUMER_PRODUCTS/PET_PRODUCTS_BRAND'] }; // the AI picked it from the brief
  const r = await press(PET, 'mixed');
  assert.deepEqual(r.filters.category, ['E-COMMERCE']);
  assert.equal(r.filters.sub_industry, undefined, 'a 40% sub-industry is not a filter, even when the AI picked it');
  assert.deepEqual(r.labels.used, [{ label: 'E-COMMERCE', kind: 'category', coverage: 90 }]);
  assert.ok(r.labels.skipped.some((x: any) => x.label === 'CONSUMER_PRODUCTS/PET_PRODUCTS_BRAND' && x.coverage === 40), JSON.stringify(r.labels.skipped));
  assert.match(r.message, /Labels used \(either\/or\): E-COMMERCE 90%\. Skipped \(under 60%\): [^.]*PET_PRODUCTS_BRAND 40%/);
  assert.equal(r.filters.employee_range, '11,200', 'snapping rule unchanged');
});

test('labels: two industries that fit are either/or (no sub-industry fits)', { skip }, async () => {
  disco.rows = (n) => Array.from({ length: n }, (_, i) => labelled(i, [...(i % 10 < 8 ? ['E-COMMERCE'] : []), ...(i % 100 < 72 ? ['CONSUMER_PRODUCTS'] : [])], []));
  const r = await press(PET, 'two');
  assert.deepEqual([...r.filters.category].sort(), ['CONSUMER_PRODUCTS', 'E-COMMERCE']);
  assert.ok(!r.filters.category.some((c: string) => c.startsWith('+')), 'either/or: nothing marked required');
  assert.equal(r.filters.sub_industry, undefined);
  assert.match(r.message, /E-COMMERCE 80%/);
});

test('labels: a fitting sub-industry is used on its own; other fitting industries are held back for widening (med spa case)', { skip }, async () => {
  // Live 2026-11-24: MEDSPA 97% + CONSUMER_SERVICES 79% either/or = 402k (every salon). Sub-industry alone.
  disco.rows = (n) => Array.from({ length: n }, (_, i) => labelled(i, [...(i % 10 < 8 ? ['E-COMMERCE'] : []), ...(i % 100 < 72 ? ['CONSUMER_PRODUCTS'] : [])], i % 100 < 72 ? ['CONSUMER_PRODUCTS/PET_PRODUCTS_BRAND'] : []));
  const r = await press(PET, 'sub-alone');
  assert.deepEqual(r.filters.category, ['CONSUMER_PRODUCTS'], 'only the parent of the sub-industry');
  assert.deepEqual(r.filters.sub_industry, ['CONSUMER_PRODUCTS/PET_PRODUCTS_BRAND']);
  assert.match(r.message, /PET_PRODUCTS_BRAND 72%/);
  assert.match(r.message, /Held back \(whole industries, used only if the list is too small\): E-COMMERCE 80%/);
  assert.deepEqual(r.labels.heldBack.map((x: any) => x.label), ['E-COMMERCE']);
});

test('labels: none reaches 60% -> no industry or sub-industry filter at all', { skip }, async () => {
  const groups = ['MANUFACTURING', 'SAAS', 'IT_SERVICES'];
  const subs = ['MANUFACTURING/MACHINE_SHOP', 'SAAS/CRM_SOFTWARE', 'IT_SERVICES/MSP'];
  disco.rows = (n) => Array.from({ length: n }, (_, i) => labelled(i, [groups[i % 3]], [subs[i % 3]]));
  ai.answer = { ...answer, subIndustries: ['MANUFACTURING/MACHINE_SHOP'] };
  const r = await press('ERP software companies in the US', 'none');
  assert.equal(r.filters.category, undefined);
  assert.equal(r.filters.sub_industry, undefined);
  assert.match(r.message, /Labels used: none/);
  assert.match(r.message, /Skipped \(under 60%\): [^.]*MACHINE_SHOP 33%/, 'the AI pick is skipped with its number');
});

test('labels (unit): coverage counts each company once, score >= 0.5, plain-name sub-industries are qualified', () => {
  const tax = ['CONSUMER_PRODUCTS/PET_PRODUCTS_BRAND', 'HEALTHCARE/DENTIST'];
  const rows = [
    { industry_groups: { 'E-commerce': 0.9, E_COMMERCE: 0.7 }, sub_industry: ['PET_PRODUCTS_BRAND'] },
    { industry_groups: [{ name: 'E-COMMERCE', score: 0.6 }], sub_industry: { 'CONSUMER_PRODUCTS/PET_PRODUCTS_BRAND': 0.49 } },
    { industry_groups: 'Healthcare', sub_industry: null },
  ];
  const cov = labelCoverage(rows, tax);
  assert.deepEqual(cov.categories.map((x) => [x.label, x.companies]), [['E-COMMERCE', 2], ['HEALTHCARE', 1]]);
  assert.deepEqual(cov.subIndustries.map((x) => [x.label, x.companies]), [['CONSUMER_PRODUCTS/PET_PRODUCTS_BRAND', 1]]);
  const out = applyLabels({ category: ['+HEALTHCARE'], negate_category: [] }, cov);
  assert.deepEqual(out.filters.category, ['E-COMMERCE']);
  assert.ok(out.skipped.some((x) => x.label === 'HEALTHCARE'));
  assert.equal(applyLabels({}, cov, { crossIndustry: true }).filters.category, undefined, 'cross-industry briefs get no labels');
  assert.equal(widerEmployeeRange('11,200'), '1,500');
  assert.equal(widerEmployeeRange('201,500'), '51,1000');
  assert.equal(widerEmployeeRange('1,10001'), null);
});

test('size goal: from the linked campaign inboxes vs the default 3,000 (a goal, never a lock)', { skip }, async () => {
  const camp = await press(ICP, 'goal-campaign', { leadGoal: { value: 280, source: 'campaign', inboxes: 4, perDay: 60 } });
  assert.equal(camp.sizing.leadGoal, 280);
  assert.equal(camp.sizing.source, 'campaign');
  assert.equal(camp.sizing.companiesNeeded, 700);
  assert.match(camp.message, /^Goal 280 leads \(from the linked campaign: 4 inboxes, 60 a day x 14 days ÷ 3 steps\) → needs ~700 companies\./);
  const def = await press(ICP, 'goal-default');
  assert.equal(def.sizing.leadGoal, 3000);
  assert.equal(def.sizing.source, 'default');
  assert.equal(def.sizing.companiesNeeded, 7500);
});

test('auto-widen: one step at a time in Alex\'s order, stops as soon as it is enough, never touches geography', { skip }, async () => {
  disco.rows = (n) => Array.from({ length: n }, (_, i) => labelled(i, ['E-COMMERCE', ...(i % 100 < 72 ? ['CONSUMER_PRODUCTS'] : [])], i % 100 < 72 ? ['CONSUMER_PRODUCTS/PET_PRODUCTS_BRAND'] : []));
  // Labels make it small; the wider size makes it big enough (5,000 -> 3,000 real < 7,500 needed).
  disco.count = (p) => (p.get('category') ? 1_000 : p.get('employee_range') === '1,500' ? 20_000 : 5_000);
  const r = await press(PET, 'widen');
  assert.deepEqual(r.sizing.widened, ['dropped sub-industry labels (now the whole industries: CONSUMER_PRODUCTS, E-COMMERCE)', 'dropped industry labels', 'widened employee range to 1-500']);
  assert.equal(disco.counts.length, 4, 'the plan + 3 widen steps');
  assert.deepEqual(r.sizing.counts.map((c: any) => c.freeCount), [1000, 1000, 5000, 20000]);
  assert.equal(r.sizing.freeCount, 20000);
  assert.equal(r.sizing.expectedReal, 12000);
  assert.equal(r.sizing.enough, true);
  const f = r.filters;
  assert.equal(f.category, undefined); assert.equal(f.sub_industry, undefined);
  assert.equal(f.employee_range, '1,500');
  assert.deepEqual(f.business_model, ['B2C'], 'stopped before dropping the business model');
  assert.deepEqual(f.country, ['US'], 'geography kept');
  for (const c of disco.counts) assert.equal(c.get('country'), 'US');
  assert.equal(r.airtableFields.fldG2MXz5lccu7KKU, '1,500');
  assert.deepEqual(JSON.parse(r.airtableFields.fldC2hZQ3gSqLmi1y), f);
  assert.match(r.message, /Free count 20,000 → expect ~12,000 real\. Widened: dropped sub-industry labels \(now the whole industries: CONSUMER_PRODUCTS, E-COMMERCE\), dropped industry labels, widened employee range to 1-500\./);
  assert.match(r.message, /0 native subindustries;.* 0 industry groups, and 1 business-model filters/);
});

test('auto-widen: still short after 5 extra counts keeps the widest plan and says so; the press still succeeds', { skip }, async () => {
  disco.rows = (n) => Array.from({ length: n }, (_, i) => labelled(i, ['E-COMMERCE'], ['CONSUMER_PRODUCTS/PET_PRODUCTS_BRAND']));
  disco.count = () => 100;
  const r = await press('Pet ecom brands in Texas between 10 and 200 employees', 'short');
  assert.equal(disco.counts.length, 6, 'the plan + at most 5 extra free counts');
  assert.equal(r.sizing.widened.length, 5);
  assert.equal(r.sizing.widened[4].startsWith('cut homepage keywords to the top'), true);
  assert.equal(r.sizing.enough, false);
  assert.deepEqual(r.filters.state, ['TX'], 'state never widened');
  assert.deepEqual(r.filters.country, ['US']);
  assert.equal(r.filters.employee_range, '1,500');
  assert.equal(r.filters.business_model, undefined);
  assert.match(r.message, /Still short of the goal \(~60 of ~7,500 companies\): kept the widest plan\./);
});

test('generate filters: a retry of the same press never pays twice; a new press regenerates; dry run spends nothing', { skip }, async () => {
  // A finished press run again (as after a crash) reuses both paid answers.
  const q = await queue();
  assert.equal((await settle(cfg(), q.job.id)).job.status, 'succeeded');
  await db.query(`DELETE FROM steps WHERE job_id=$1`, [q.job.id]);
  await db.query(`UPDATE jobs SET status='queued', attempts=0, run_after=now(), result=NULL WHERE id=$1`, [q.job.id]);
  assert.equal((await settle(cfg(), q.job.id)).job.status, 'succeeded');
  assert.equal(disco.calls, 1, 'lookalike pull paid once'); assert.equal(ai.calls, 1, 'AI paid once');
  // A bad AI answer stops the press (both paid calls made).
  ai.answer = { ...answer, technologyNeedsReview: 'unclear vendor' };
  const bad = await enqueue(db, { kind: 'leadlist.filters', recordId: REC, dryRun: false, input: { record, client }, requestId: 'bad', maxAttempts: 3, deadlineMs: 60_000 });
  await runOnce(db, cfg());
  assert.equal((await getJob(db, bad.job.id))!.job.status, 'failed', 'bad AI answer stops the press');
  assert.equal(disco.calls, 2); assert.equal(ai.calls, 2);
  // A new press is a fresh generation (n8n regenerates too).
  ai.answer = answer;
  const again = await enqueue(db, { kind: 'leadlist.filters', recordId: REC, dryRun: false, input: { record, client }, requestId: 'second', maxAttempts: 3, deadlineMs: 60_000 });
  assert.equal((await settle(cfg(), again.job.id)).job.status, 'succeeded');
  assert.equal(disco.calls, 3); assert.equal(ai.calls, 3);
  const counts = disco.counts.length;
  const d = await enqueue(db, { kind: 'leadlist.filters', recordId: REC, dryRun: true, input: { record: { ...record, fields: { ...record.fields, 'ICP Description': ICP + ' in Texas' } }, client }, requestId: 'dry', maxAttempts: 3, deadlineMs: 60_000 });
  const dj = await settle(cfg(), d.job.id);
  assert.equal(dj.job.result.dryRun, true);
  assert.equal(disco.calls, 3); assert.equal(ai.calls, 3); assert.equal(disco.counts.length, counts, 'dry run: no DiscoLike call at all');
  assert.deepEqual(dj.job.result.wouldSpendCredits, { discolike: 500, openai: 1 });
  assert.equal(dj.job.result.sizing.companiesNeeded, 7500);
  assert.deepEqual(dj.job.result.plan.analysis.filters.state, ['TX']);
  assert.match(dj.job.result.message, /would pull 500 lookalike companies .* Goal 3,000 leads \(default\) → needs ~7,500 companies\./);
});

test('generate filters: no targeting sentence or an empty DiscoLike answer stops with a clear message', { skip }, async () => {
  const bad = await enqueue(db, { kind: 'leadlist.filters', recordId: REC, dryRun: false, input: { record: { ...record, fields: { ...record.fields, 'ICP Description': '' } }, client }, requestId: 'noicp', maxAttempts: 3, deadlineMs: 60_000 });
  const jb = await settle(cfg(), bad.job.id);
  assert.equal(jb.job.status, 'failed');
  assert.match(jb.job.error, /targeting sentence/i);
  assert.equal(disco.calls, 0);
  disco.rows = () => [];
  const empty = await enqueue(db, { kind: 'leadlist.filters', recordId: REC, dryRun: false, input: { record, client }, requestId: 'empty', maxAttempts: 3, deadlineMs: 60_000 });
  const je = await settle(cfg(), empty.job.id);
  assert.equal(je.job.status, 'failed');
  assert.match(je.job.error, /no companies/i);
});

test('generate filters: "between 10 and 200 employees" sets the employee range (live 2026-11-23: it was ignored)', { skip }, async () => {
  const r = await press('Pet ecom brands in the US between 10 and 200 employees', 'between');
  assert.equal(r.filters.employee_range, '11,200', '10 is the end of the 1-10 step: the minimum moves to 11 (Alex)');
  assert.equal(r.airtableFields.fldG2MXz5lccu7KKU, '11,200');
  assert.equal(new URLSearchParams(disco.query).get('employee_range'), '11,200', 'the analysis pull uses the snapped range too');
});

test('generate filters: employee ranges snap to DiscoLike size steps (Alex, 2026-11-23)', { skip }, async () => {
  for (const [sentence, want] of [['Roofers with 20-100 employees in Texas', '11,200'], ['Agencies between 50 and 500 employees in the US', '51,500'], ['Clinics with 1-200 employees in the US', '1,200']]) {
    const r = await press(sentence, `steps:${sentence}`);
    assert.equal(r.filters.employee_range, want, sentence);
  }
});

test('generate filters: "ecom" alone no longer forces E-COMMERCE; coverage decides (Alex, 2026-11-23)', { skip }, async () => {
  disco.rows = (n) => Array.from({ length: n }, (_, i) => labelled(i, i % 100 < 41 ? ['E-COMMERCE', 'CONSUMER_PRODUCTS'] : ['CONSUMER_PRODUCTS'], ['CONSUMER_PRODUCTS/PET_PRODUCTS_BRAND']));
  const r = await press(PET, 'ecom41');
  assert.ok(!(r.filters.category ?? []).includes('E-COMMERCE'), JSON.stringify(r.filters));
  assert.match(r.message, /Skipped \(under 60%\): E-COMMERCE 41%/);
  const plain = await press('Medical spas and aesthetic clinics with 1-200 employees in the United States', 'plain');
  assert.ok(!(plain.filters.category ?? []).some((c: string) => /E-COMMERCE/.test(c)), 'no online-selling labels: no E-COMMERCE');
});

// Campaign build tests: rules, plus the stage end to end against fake EmailBison + Google.
import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { createPool, migrate, type Db } from '../src/db/pool.js';
import { loadConfig, type Config } from '../src/config.js';
import { enqueue, getJob } from '../src/queue.js';
import { runOnce } from '../src/worker.js';
import { PermanentError } from '../src/errors.js';
import { mergeTags, validateCopy, prepareLeads, senderCap, defaultSchedule, cleanCompany } from '../src/campaign/rules.js';
import { startFakeGoogle, type FakeGoogle } from './fakes/google.js';
import { startFakeBison, type FakeBison } from './fakes/bison.js';

const url = process.env.TEST_DATABASE_URL;
const skip = !url ? 'TEST_DATABASE_URL not set' : false;
const REC = 'recCCCCCCCCCCCCCC';
const SHEET = '1QYLOeUxwDXunQm_KMEYKB_7jW7l47ZQJ8wVVtCZBUd8';
let db: Db;
let google: FakeGoogle;
let bison: FakeBison;

const HEADER = ['Email', 'Verification Provider', 'Verification Status', 'First Name', 'Last Name', 'Company', 'Domain', 'LinkedIn URL', 'Country', 'City', 'Email Type', 'Verification Path', 'Source Version'];
const row = (e: string, first: string, company: string, city = 'Austin') => [e, 'MillionVerifier', 'Good', first, 'Lee', company, 'acme.com', 'linkedin.com/in/x', 'US', city, 'direct', 'MillionVerifier valid', 'mv2-x'];
const TAB = [HEADER, row('ann@acme.com', 'Ann', 'Acme Roofing LLC'), row('bo@beta.com', 'Bo', 'Beta, Inc.'), row('ANN@acme.com', 'Ann', 'Acme Roofing LLC'), row('cy@gamma.com', '', 'Gamma Corp')];
const STEPS = [
  { subject: '{quick|short} question', body: 'Hi {FIRST_NAME},\nsaw {COMPANY} in {CITY}.\nWorth a chat?', variants: [{ subject: 'idea for {COMPANY}', body: 'Hey {FIRST_NAME},\nquick idea.' }] },
  { subject: '', body: 'Following up.' },
];

function cfg(over: Partial<Config> = {}): Config {
  return {
    ...loadConfig({ ENGINE_SECRET: 'x'.repeat(40), DATABASE_URL: url ?? 'postgres://x' } as NodeJS.ProcessEnv),
    googleKeyFile: google.keyFile, googleImpersonateUser: 'scale@dulcy.io', googleSheetsBaseUrl: google.url,
    emailBisonKeys: { dulcy: bison.key }, emailBisonBaseUrl: bison.url, bisonPollMs: 5, dryRun: true, liveStages: ['campaign.build'], ...over,
  };
}
const input = (over: Record<string, unknown> = {}) => ({
  name: 'ENGINE TEST - Direct Emails', workspace: 'dulcy', outputType: 'direct', steps: STEPS,
  source: { sheetId: SHEET }, expectedLeads: 3, senderEmailIds: ['11'], ...over,
});
const queue = (over: Record<string, unknown> = {}, dryRun = false) => enqueue(db, { kind: 'campaign.build', recordId: REC, dryRun, input: input(over), maxAttempts: 5, deadlineMs: 60_000 });
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
async function settle(c: Config, id: number, max = 60) {
  for (let i = 0; i < max; i++) {
    await runOnce(db, c);
    const j = await getJob(db, id);
    if (['succeeded', 'failed', 'needs_review'].includes(j!.job.status)) return j!;
    await db.query(`UPDATE jobs SET run_after = now() WHERE id = $1 AND status = 'queued'`, [id]); // skip retry backoff in tests
    await sleep(8);
  }
  throw new Error('job did not settle');
}

before(async () => { google = await startFakeGoogle(); bison = await startFakeBison(); if (skip) return; db = createPool(url!); await migrate(db); });
after(async () => { google.close(); bison.close(); if (!skip) await db.end(); });
beforeEach(async () => {
  Object.assign(bison, { campaigns: [], leadLists: [], calls: [], createThen500: false, uploadThen500: false, processAfterChecks: 0, failRowsOnImport: 0, customVariables: new Set(['domain']) });
  bison.senderStatus = () => 'connected';
  bison.senderEmail = (id) => `sender${id}@dulcy-mail.com`;
  google.tabs = { 'Final Direct': TAB.map((r) => [...r]) };
  if (!skip) await db.query('TRUNCATE jobs, steps, receipts, events RESTART IDENTITY CASCADE');
});

// ---------- rules ----------
test('merge tags: real tags only, never spintax groups', () => {
  assert.deepEqual(mergeTags(STEPS).sort(), ['CITY', 'COMPANY', 'FIRST_NAME']);
});

test('generic copy: the "Hi {FIRST_NAME}," line is removed; any other {FIRST_NAME} is refused', () => {
  const g = validateCopy([{ subject: 'hello', body: 'Hi {FIRST_NAME},\nquick note.' }], 'generic');
  assert.equal(g[0].body, 'quick note.');
  assert.throws(() => validateCopy([{ subject: 'x', body: 'Thanks {FIRST_NAME} for reading' }], 'generic'), PermanentError);
  assert.throws(() => validateCopy([], 'direct'), PermanentError);
  assert.throws(() => validateCopy(Array(5).fill({ subject: 's', body: 'b' }), 'direct'), PermanentError);
});

test('leads: dedupe, company clean-up, first-name fallback, attribution, copy columns must exist', () => {
  const p = prepareLeads(TAB, { campaignId: 77, outputType: 'direct', tags: ['FIRST_NAME', 'CITY'] });
  assert.equal(p.rows.length, 3);
  assert.equal(p.droppedDuplicate, 1);
  const col = (n: string) => p.headers.indexOf(n);
  assert.deepEqual(p.rows.map((r) => r[col('company')]), ['Acme Roofing', 'Beta', 'Gamma']);
  assert.equal(p.rows[2][col('first_name')], 'Gamma', 'empty first name falls back to the company');
  assert.ok(p.headers.includes('DULCY_VERIFICATION_77') && p.headers.includes('CITY') && !p.headers.includes('Country'));
  assert.throws(() => prepareLeads(TAB, { campaignId: 1, outputType: 'direct', tags: ['PHONE'] }), /no such column/);
  assert.throws(() => prepareLeads(TAB, { campaignId: 1, outputType: 'direct', tags: ['Country'] }), /blocked/);
  const bad = [HEADER, ['x@y.com', 'MillionVerifier', 'Risky', 'X', 'Y', 'Z', 'z.com', '', '', '', 'direct', '', '']];
  assert.throws(() => prepareLeads(bad, { campaignId: 1, outputType: 'direct', tags: [] }), /not verified Good/);
  const gen = prepareLeads(TAB, { campaignId: 1, outputType: 'generic', tags: [] });
  assert.equal(gen.rows[0][gen.headers.indexOf('first_name')], 'Acme Roofing', 'generic first name = company');
});

test('small rules: sender cap, stable schedule, company names', () => {
  assert.equal(senderCap(3000, 2, 15), 100);
  assert.equal(senderCap(3, 2, 15), 1);
  assert.deepEqual(defaultSchedule('recA'), defaultSchedule('recA'));
  assert.match(defaultSchedule('recA').start_time, /^08:\d\d$/);
  assert.equal(cleanCompany('Smith & Sons, L.L.C.'), 'Smith & Sons');
});

// ---------- stage ----------
test('dry-run: checks the list and reports the plan; nothing is created in EmailBison', { skip }, async () => {
  const q = await queue({}, true);
  const j = await settle(cfg({ liveStages: [] }), q.job.id);
  assert.equal(j.job.status, 'succeeded');
  assert.equal(j.job.result.plan.leads, 3);
  assert.equal(j.job.result.plan.leadsMatchAirtable, true);
  assert.equal(bison.calls.length, 0);
});

test('build: one campaign, sequence + variant, leads checked until processed, exact count, senders verified, not launched', { skip }, async () => {
  bison.processAfterChecks = 2;
  const q = await queue();
  const j = await settle(cfg(), q.job.id);
  assert.equal(j.job.status, 'succeeded', j.job.error);
  assert.equal(bison.campaigns.length, 1);
  const c = bison.campaigns[0];
  assert.equal(c.steps.filter((s) => !s.variant).length, 2);
  assert.equal(c.steps.filter((s) => s.variant).length, 1);
  assert.equal(c.steps[0].wait_in_days, 2, 'default 2 days between emails');
  assert.equal(c.leads.size, 3);
  assert.deepEqual(c.senders, ['11']);
  assert.equal(j.job.result.launched, false);
  assert.ok(!bison.calls.some((x) => /resume|launch/.test(x)), 'never launches');
  assert.ok(bison.customVariables.has('dulcy_verification_500') && bison.customVariables.has('city'));
});

test('re-running the same record never duplicates anything', { skip }, async () => {
  const a = await queue();
  assert.equal((await settle(cfg(), a.job.id)).job.status, 'succeeded');
  const b = await queue();
  assert.equal((await settle(cfg(), b.job.id)).job.status, 'succeeded');
  assert.equal(bison.campaigns.length, 1);
  assert.equal(bison.leadLists.length, 1);
  assert.equal(bison.campaigns[0].steps.length, 3);
});

test('crash after EmailBison created the campaign: the retry finds it by name instead of making a second one', { skip }, async () => {
  bison.createThen500 = true;
  const q = await queue();
  const j = await settle(cfg(), q.job.id);
  assert.equal(j.job.status, 'succeeded', j.job.error);
  assert.equal(bison.campaigns.length, 1);
  const r = await db.query(`SELECT error FROM receipts WHERE receipt_key LIKE '%create-campaign'`);
  assert.equal(r.rows[0].error, 'reconciled after an unclear attempt');
});

test('crash after a lead upload was accepted: the retry adopts that import, no second upload', { skip }, async () => {
  bison.uploadThen500 = true;
  const q = await queue();
  const j = await settle(cfg(), q.job.id);
  assert.equal(j.job.status, 'succeeded', j.job.error);
  assert.equal(bison.leadLists.length, 1);
  assert.equal(bison.campaigns[0].leads.size, 3);
});

test('a same-name campaign that already exists is never taken over silently', { skip }, async () => {
  bison.campaigns.push({ id: 42, name: 'ENGINE TEST - Direct Emails', leads: new Set(), senders: [], steps: [] });
  const q = await queue();
  const j = await settle(cfg(), q.job.id);
  assert.equal(j.job.status, 'failed');
  assert.match(j.job.error, /already exists .*id 42/);
  assert.equal(bison.campaigns.length, 1);
});

test('lead count differs from Airtable: stops before creating anything', { skip }, async () => {
  const q = await queue({ expectedLeads: 5 });
  const j = await settle(cfg(), q.job.id);
  assert.equal(j.job.status, 'failed');
  assert.match(j.job.error, /has 3 uploadable leads but Airtable expects 5/);
  assert.equal(bison.campaigns.length, 0);
});

test('too many senders for the leads: stops before creating anything', { skip }, async () => {
  const q = await queue({ senderEmailIds: ['11', '12'] });
  const j = await settle(cfg(), q.job.id);
  assert.equal(j.job.status, 'failed');
  assert.match(j.job.error, /most that can be kept busy is 1/);
  assert.equal(bison.campaigns.length, 0);
});

test('an import with failed rows goes to review with EmailBison\'s reason (no re-upload)', { skip }, async () => {
  bison.failRowsOnImport = 1;
  const q = await queue();
  const j = await settle(cfg(), q.job.id);
  assert.equal(j.job.status, 'needs_review');
  assert.match(j.job.error, /failed 1; EmailBison says: First name is a required field/);
  assert.equal(bison.leadLists.length, 1);
});

test('senders: a .info domain is refused; a disconnected sender goes to review after waiting', { skip }, async () => {
  bison.senderEmail = (id) => `s${id}@outreach.info`;
  let j = await settle(cfg(), (await queue()).job.id);
  assert.equal(j.job.status, 'failed');
  assert.match(j.job.error, /\.info/);
  await db.query('TRUNCATE jobs, steps, receipts, events RESTART IDENTITY CASCADE');
  Object.assign(bison, { campaigns: [], leadLists: [] });
  bison.senderEmail = (id) => `s${id}@dulcy-mail.com`;
  bison.senderStatus = () => 'disconnected';
  await db.query(`UPDATE jobs SET id = id`); // no-op
  const q = await queue();
  // Make the 2-minute sender wait limit pass at once.
  j = await settle(cfg(), q.job.id, 5).catch(async () => {
    await db.query(`UPDATE steps SET output = to_jsonb(0) WHERE step_key = 'wait-start:senders'`);
    return settle(cfg(), q.job.id);
  });
  assert.equal(j.job.status, 'needs_review');
  assert.match(j.job.error, /not connected/);
});

test('EmailBison error messages are kept (with emails hidden)', { skip }, async () => {
  const { createBisonClient } = await import('../src/providers/emailbison.js');
  const c = createBisonClient({ apiKey: bison.key, baseUrl: bison.url });
  await assert.rejects(c.uploadLeadsCsv('x', { first_name: 'first_name' }, 'first_name\nA\n'), (e: Error) => /HTTP 422 .*l\*\*\*@example\.com/.test(e.message));
});

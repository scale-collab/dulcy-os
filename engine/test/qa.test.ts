// Automated QA (leadlist.qa): the copied n8n 06 QA code runs unchanged on Final Direct /
// Final Generic against the linked campaign copy; QA Review tab; Airtable fields like n8n.
import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import type pg from 'pg';
import { createPool, migrate } from '../src/db/pool.js';
import { enqueue, getJob } from '../src/queue.js';
import { runOnce } from '../src/worker.js';
import { loadConfig, type Config } from '../src/config.js';
import { startFakeGoogle, type FakeGoogle } from './fakes/google.js';

const url = process.env.TEST_DATABASE_URL;
const skip = !url ? 'TEST_DATABASE_URL not set' : false;
const REC = 'recQaTestList0001';
const CAMP = 'recQaTestCamp0001';
let db: pg.Pool; let google: FakeGoogle;

const HEAD = ['Email', 'First Name', 'Last Name', 'Title', 'Company', 'Domain', 'LinkedIn URL', 'Country', 'State', 'Email Type', 'Verification Status', 'Verification Provider', 'Verification Path', 'Original Email'];
const direct = (email: string, first: string, company: string) => [email, first, 'Lee', 'Owner', company, 'acme.com', '', 'US', '', 'Direct', 'Good', 'MillionVerifier', 'MillionVerifier valid', ''];
const generic = (email: string, company: string) => [email, '', '', '', company, 'beta.com', '', '', '', 'Generic', 'Good', 'MillionVerifier', 'MillionVerifier valid', ''];
const project = { id: REC, fields: { 'Name of the Lead List': 'QA test', 'Lead List Link': 'https://docs.google.com/spreadsheets/d/sheet-qa/edit', 'Which Campaign?': [CAMP] } };
const campaign = { id: CAMP, fields: { Name: '[Dulcy] QA test', 'Lead List': [REC], 'Campaign Email 1 Subject Version 1': 'Idea for {COMPANY}', 'Campaign Body 1 Version 1': 'Hey {FIRST_NAME},\n\nA quick idea for {COMPANY}.' } };

function cfg(over: Partial<Config> = {}): Config {
  return { ...loadConfig({ ENGINE_SECRET: 'x'.repeat(40), DATABASE_URL: url ?? 'postgres://x' } as NodeJS.ProcessEnv), googleKeyFile: google.keyFile, googleImpersonateUser: 'scale@dulcy.io', googleSheetsBaseUrl: google.url, dryRun: false, liveStages: [], ...over };
}
async function run(input: Record<string, unknown>, dryRun = false) {
  const q = await enqueue(db, { kind: 'leadlist.qa', recordId: REC, dryRun, input, requestId: String(Math.random()), maxAttempts: 3, deadlineMs: 60_000 });
  for (let i = 0; i < 10; i++) {
    await runOnce(db, cfg());
    const j = await getJob(db, q.job.id);
    if (['succeeded', 'failed', 'needs_review'].includes(j!.job.status)) return j!;
  }
  throw new Error('did not settle');
}

before(async () => { google = await startFakeGoogle(); if (skip) return; db = createPool(url!); await migrate(db); });
after(async () => { google.close(); if (!skip) await db.end(); });
beforeEach(async () => {
  google.tabs = { 'Final Direct': [HEAD, direct('ann@acme.com', 'Ann', 'Acme'), direct('bo@acme.com', 'Bo', 'Acme')], 'Final Generic': [HEAD, generic('info@beta.com', 'Beta')] };
  google.written = {}; google.writes = 0;
  if (!skip) await db.query(`DELETE FROM jobs WHERE record_id=$1`, [REC]);
});

test('QA passes a clean list: QA Review tab written, QA Status Passed and stage Ready (the fields n8n saved)', { skip }, async () => {
  const j = await run({ project, campaigns: { records: [campaign] } });
  assert.equal(j.job.status, 'succeeded', j.job.error);
  const r = j.job.result;
  assert.equal(r.qa.passed, true, r.summary);
  assert.equal(r.qa.rows, 3);
  const a = r.airtableFields;
  assert.equal(a.fldUB4WsLi5kq6rUy, 'Passed', 'QA Status');
  assert.equal(a.fld8nrebRFL0O8kgj, 'Ready', 'Lead List Stage');
  assert.equal(a.fldWDSDICYaL9SQEa, true, 'Required Fields Present');
  assert.equal(a.fldgWhI2Nm2Y9c91O, true, 'Duplicate Check Passed');
  assert.match(String(a.fldSOTvnUxzKWXMDD), /spreadsheets\/d\/sheet-qa\/edit#gid=\d+/, 'Lead List Link points at the QA Review tab');
  assert.ok(!('fldcBmKEYX8KUiKAM' in a), "n8n's own QA Action field is never written");
  const review = google.written['sheet-qa']['QA Review'];
  assert.deepEqual(review[0], ['QA Check', 'Result', 'Details']);
  assert.ok(review.some((row) => row?.[0] === 'Unique emails' && row[1] === 'PASS'));
});

test('QA fails on a missing first name (direct copy uses {FIRST_NAME}), a placeholder company and a duplicate email', { skip }, async () => {
  google.tabs['Final Direct'].push(direct('cy@acme.com', '', 'Acme'), direct('di@acme.com', 'Di', 'N/A'), direct('ann@acme.com', 'Ann', 'Acme'));
  const j = await run({ project, campaigns: { records: [campaign] } });
  assert.equal(j.job.status, 'succeeded', j.job.error);
  const r = j.job.result;
  assert.equal(r.qa.passed, false);
  assert.equal(r.qa.duplicates, 1);
  assert.equal(r.qa.rejected, 4, 'cy (no first name), di (N/A company), two ann rows');
  assert.equal(r.airtableFields.fldUB4WsLi5kq6rUy, 'Failed');
  assert.equal(r.airtableFields.fld8nrebRFL0O8kgj, 'QA');
  assert.match(r.summary, /Invalid required value: First Name: 1 rows/);
  assert.match(r.summary, /Invalid required value: Company: 1 rows/);
});

test('QA dry run analyses but writes nothing', { skip }, async () => {
  const j = await run({ project, campaigns: { records: [campaign] } }, true);
  assert.equal(j.job.status, 'succeeded', j.job.error);
  assert.equal(j.job.result.dryRun, true);
  assert.equal(google.writes, 0);
  assert.equal(google.written['sheet-qa'], undefined);
});

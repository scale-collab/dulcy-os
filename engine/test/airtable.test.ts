// Airtable bridge with a fake Airtable: button press -> one job, bad input -> clear message,
// progress and results written back once, only named client fields ever read.
import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import type pg from 'pg';
import { createPool, migrate } from '../src/db/pool.js';
import { getJob, finish, fail, snooze } from '../src/queue.js';
import { loadConfig, type Config } from '../src/config.js';
import { createAirtableClient } from '../src/providers/airtable.js';
import { F, CLIENTS, LEAD_LISTS, bridgeTick, pollActions, syncResults } from '../src/airtable/bridge.js';

const url = process.env.TEST_DATABASE_URL;
const skip = !url ? 'TEST_DATABASE_URL not set' : false;
const REC = 'recAirtableTest01';
const OTHER = 'recAirtableTest02';
const CLIENT = 'recClientTest0001';
const KEY_FIELD = 'fldFvgH9UxZSQesD4'; // stands in for a key field: must never be returned or asked for

let db: pg.Pool;
let server: http.Server;
const fake = { url: '', tables: {} as Record<string, Record<string, Record<string, unknown>>>, patches: [] as any[], clientFieldsAsked: [] as string[][], auth: '' };

const cfg = (over: Partial<Config> = {}): Config => ({ ...loadConfig({ ENGINE_SECRET: 'x'.repeat(40), DATABASE_URL: url ?? 'postgres://x' } as NodeJS.ProcessEnv), dryRun: true, liveStages: [], ...over });
const at = () => createAirtableClient({ apiKey: 'pat-test', baseId: 'appTest', baseUrl: fake.url });
const rec = (id = REC) => fake.tables[LEAD_LISTS][id];
const FILTERS = { icp_prompt: 'roofers in Texas', country: ['US'] };

function press(action: string, extra: Record<string, unknown> = {}, id = REC) {
  Object.assign(rec(id), { [F.runsOnEngine]: true, [F.engineAction]: action, [F.engineActionSetAt]: new Date().toISOString(), ...extra });
}

before(async () => {
  server = http.createServer((req, res) => {
    fake.auth = String(req.headers.authorization ?? '');
    const u = new URL(req.url ?? '/', 'http://x');
    const [, , , table] = u.pathname.split('/');
    const rows = fake.tables[table] ?? {};
    res.setHeader('content-type', 'application/json');
    if (req.method === 'GET') {
      const formula = u.searchParams.get('filterByFormula') ?? '';
      const fields = u.searchParams.getAll('fields[]');
      if (table === CLIENTS) fake.clientFieldsAsked.push(fields);
      const one = /RECORD_ID\(\)='(rec\w+)'/.exec(formula)?.[1];
      const ids = Object.keys(rows).filter((id) => one ? id === one
        : formula.includes('{Runs on Engine}') ? rows[id][F.runsOnEngine] === true && !!rows[id][F.engineAction] : true);
      const records = ids.map((id) => ({ id, fields: Object.fromEntries(Object.entries(rows[id]).filter(([k, v]) => fields.includes(k) && v !== null && v !== undefined)) }));
      return res.end(JSON.stringify({ records }));
    }
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', () => {
      const b = JSON.parse(body);
      for (const r of b.records) { fake.patches.push(r); Object.assign(rows[r.id], r.fields); }
      res.end(JSON.stringify({ records: b.records }));
    });
  });
  await new Promise<void>((r) => server.listen(0, () => r()));
  fake.url = `http://127.0.0.1:${(server.address() as any).port}`;
  if (skip) return;
  db = createPool(url!); await migrate(db);
});
after(async () => { server.close(); if (!skip) await db.end(); });
beforeEach(async () => {
  fake.tables = {
    [LEAD_LISTS]: {
      [REC]: { [F.name]: 'Roofers TX', [F.client]: [CLIENT], [F.filtersJson]: JSON.stringify(FILTERS), [F.icp]: 'Residential roofers in Texas', [F.thesis]: 'Roofers need more booked jobs', [F.sampleSize]: 100 },
      [OTHER]: { [F.name]: 'Not on engine', [F.engineAction]: 'Run Company Sample', [F.filtersJson]: JSON.stringify(FILTERS) },
    },
    [CLIENTS]: { [CLIENT]: { fld48x6Yg3v6RP30W: 'Acme Marketing', fldWAdvAzoPxqW0Ut: 'Free roofing lead audit', [KEY_FIELD]: 'secret-key-value' } },
  };
  fake.patches = []; fake.clientFieldsAsked = [];
  if (skip) return;
  await db.query(`DELETE FROM jobs WHERE record_id = ANY($1)`, [[REC, OTHER]]);
  await db.query(`DELETE FROM lead_list_sheets WHERE list_id = $1`, [REC]);
});

test('a button press queues exactly one job, clears the press and writes Queued', { skip }, async () => {
  press('Run Company Sample');
  assert.equal(await pollActions(db, cfg(), at()), 1);
  const jobs = (await db.query(`SELECT * FROM jobs WHERE record_id=$1`, [REC])).rows;
  assert.equal(jobs.length, 1);
  assert.equal(jobs[0].kind, 'leadlist.sample');
  assert.equal(jobs[0].dry_run, true, 'not in LIVE_STAGES = dry run');
  assert.deepEqual(jobs[0].input.filters, FILTERS);
  assert.equal(jobs[0].input.thesis, 'Roofers need more booked jobs');
  assert.match(jobs[0].input.clientContext, /Acme Marketing/);
  assert.match(jobs[0].input.clientContext, /Free roofing lead audit/);
  assert.equal(rec()[F.engineAction], null);
  assert.equal(rec()[F.engineStatus], 'Queued');
  assert.equal(rec()[F.processingStatus], 'Queued');
  assert.equal(rec()[F.engineJobId], String(jobs[0].id));
  assert.match(String(rec()[F.engineMessage]), /dry run/);
  assert.equal(fake.auth, 'Bearer pat-test');
  // The list without Runs on Engine was left alone (n8n still owns it).
  assert.equal(rec(OTHER)[F.engineAction], 'Run Company Sample');
  // Only the four named client fields were asked for; the key field never.
  assert.ok(fake.clientFieldsAsked.length > 0);
  for (const asked of fake.clientFieldsAsked) assert.ok(!asked.includes(KEY_FIELD));
  assert.ok(!JSON.stringify(jobs[0].input).includes('secret-key-value'));
});

test('the same press seen twice (write-back lost) still queues one job', { skip }, async () => {
  press('Run Company Sample');
  const setAt = rec()[F.engineActionSetAt];
  await pollActions(db, cfg(), at());
  Object.assign(rec(), { [F.engineAction]: 'Run Company Sample', [F.engineActionSetAt]: setAt });
  assert.equal(await pollActions(db, cfg(), at()), 0);
  assert.equal((await db.query(`SELECT count(*)::int n FROM jobs WHERE record_id=$1`, [REC])).rows[0].n, 1);
  assert.equal(rec()[F.engineAction], null);
});

test('a press while the same stage is running is ignored with a message', { skip }, async () => {
  press('Run Company Sample');
  await pollActions(db, cfg(), at());
  press('Run Company Sample');
  assert.equal(await pollActions(db, cfg(), at()), 0);
  assert.match(String(rec()[F.engineMessage]), /already running/);
});

test('bad or missing input queues nothing and says what to fix', { skip }, async () => {
  press('Expand Companies', { [F.expansionTarget]: 1000 });
  await pollActions(db, cfg(), at());
  assert.equal(rec()[F.engineStatus], 'Failed');
  assert.match(String(rec()[F.engineMessage]), /approve the company sample/);
  press('Run Company Sample', { [F.filtersJson]: '{not json' });
  await pollActions(db, cfg(), at());
  assert.match(String(rec()[F.workflowError]), /not valid JSON/);
  press('Verify and Finalize');
  await pollActions(db, cfg(), at());
  assert.match(String(rec()[F.engineMessage]), /no engine sheet yet/);
  press('Build Campaign');
  await pollActions(db, cfg(), at());
  assert.match(String(rec()[F.engineMessage]), /not wired/);
  assert.equal((await db.query(`SELECT count(*)::int n FROM jobs WHERE record_id=$1`, [REC])).rows[0].n, 0);
  assert.equal(rec()[F.engineAction], null);
});

test('contacts: sample until approved, then everyone; verify reads the engine sheet', { skip }, async () => {
  press('Find Contacts', { [F.contactFiltersJson]: '{"seniority":["executive"]}', [F.contactSampleSize]: 50 });
  await pollActions(db, cfg(), at());
  let j = (await db.query(`SELECT * FROM jobs WHERE record_id=$1 AND kind='leadlist.contacts'`, [REC])).rows[0];
  assert.equal(j.input.companies, 50);
  assert.deepEqual(j.input.contactFilters, { seniority: ['executive'] });
  await finish(db, j.id, { dryRun: true, message: 'x' });
  press('Find Contacts', { [F.contactApproved]: true });
  await pollActions(db, cfg(), at());
  j = (await db.query(`SELECT * FROM jobs WHERE record_id=$1 AND kind='leadlist.contacts' ORDER BY id DESC`, [REC])).rows[0];
  assert.equal(j.input.companies, undefined);

  await db.query(`INSERT INTO lead_list_sheets (list_id, kind, sheet_id, tab) VALUES ($1,'companies','sheet123','Engine Companies')`, [REC]);
  press('Verify and Finalize', { [F.includeDirect]: true });
  await pollActions(db, cfg(), at());
  const v = (await db.query(`SELECT * FROM jobs WHERE record_id=$1 AND kind='leadlist.verify'`, [REC])).rows[0];
  assert.deepEqual(v.input.source, { sheetId: 'sheet123' });
  assert.equal(v.input.includeDirect, true);
  assert.equal(v.input.includeGeneric, false);
  assert.equal(v.input.writeFinalTabs, true);
});

test('progress and results are written back once per change', { skip }, async () => {
  press('Run Company Sample');
  await pollActions(db, cfg(), at());
  const id = Number(rec()[F.engineJobId]);
  assert.equal(await syncResults(db, at()), 1, 'Queued written once');
  assert.equal(await syncResults(db, at()), 0, 'nothing changed: nothing written');

  await db.query(`UPDATE jobs SET status='running' WHERE id=$1`, [id]);
  await syncResults(db, at());
  assert.equal(rec()[F.engineStatus], 'Running');
  assert.equal(rec()[F.processingStatus], 'Running');
  assert.ok(rec()[F.startedAt]);

  await snooze(db, id, 60_000, 'MillionVerifier 40% done');
  await syncResults(db, at());
  assert.equal(rec()[F.engineStatus], 'Waiting');
  assert.equal(rec()[F.engineMessage], 'MillionVerifier 40% done');

  await finish(db, id, { dryRun: false, sample: { reviewed: 98, tier1: 30, tier2: 60, cut: 8, usableRate: 0.918, status: 'Passed' }, topDropReasons: [{ reason: 'directory', companies: 5 }], message: 'sample Passed: Tier 1 30, Tier 2 60, Cut 8' });
  await syncResults(db, at());
  assert.equal(rec()[F.engineStatus], 'Done');
  assert.equal(rec()[F.processingStatus], 'Completed');
  assert.equal(rec()[F.companyGood], 90);
  assert.equal(rec()[F.companyBad], 8);
  assert.equal(rec()[F.companyFitRate], 0.918);
  assert.equal(rec()[F.companyStatus], 'Passed');
  assert.match(String(rec()[F.companySummary]), /directory: 5/);
  assert.ok(rec()[F.completedAt]);
  assert.equal(await syncResults(db, at()), 0, 'finished jobs are not written again');
});

test('a dry run writes its message only; a failure writes the error', { skip }, async () => {
  press('Run Company Sample');
  await pollActions(db, cfg(), at());
  let id = Number(rec()[F.engineJobId]);
  await finish(db, id, { dryRun: true, message: '250 match; the sample would pull 100' });
  await syncResults(db, at());
  assert.match(String(rec()[F.engineMessage]), /^Dry run \(nothing spent\): 250 match/);
  assert.equal(rec()[F.companyGood], undefined, 'no counts from a dry run');

  press('Refit Companies');
  await pollActions(db, cfg(), at());
  id = Number(rec()[F.engineJobId]);
  const job = (await getJob(db, id))!.job;
  await fail(db, job, 'DiscoLike refused the key (HTTP 401)', { retryable: false });
  await syncResults(db, at());
  assert.equal(rec()[F.engineStatus], 'Failed');
  assert.equal(rec()[F.processingStatus], 'Failed');
  assert.match(String(rec()[F.workflowError]), /DiscoLike refused the key/);
});

test('live only for stages in LIVE_STAGES; one tick does both halves', { skip }, async () => {
  press('Run Company Sample');
  const r = await bridgeTick(db, cfg({ liveStages: ['leadlist.sample'] }), at());
  assert.equal(r.queued, 1);
  const j = (await db.query(`SELECT dry_run FROM jobs WHERE record_id=$1`, [REC])).rows[0];
  assert.equal(j.dry_run, false);
});

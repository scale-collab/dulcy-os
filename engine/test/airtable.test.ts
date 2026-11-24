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
import { F, CLIENTS, LEAD_LISTS, bridgeTick, pollActions, pollTam, syncResults } from '../src/airtable/bridge.js';
import { WaitError } from '../src/errors.js';

const url = process.env.TEST_DATABASE_URL;
const skip = !url ? 'TEST_DATABASE_URL not set' : false;
const REC = 'recAirtableTest01';
const OTHER = 'recAirtableTest02';
const CLIENT = 'recClientTest0001';
const KEY_FIELD = 'fldFvgH9UxZSQesD4'; // stands in for a key field: must never be returned or asked for

let db: pg.Pool;
let server: http.Server;
const fake = { url: '', tables: {} as Record<string, Record<string, Record<string, unknown>>>, patches: [] as any[], creates: [] as any[], created: 0, clientFieldsAsked: [] as string[][], auth: '' };

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
      const out = [];
      for (const r of b.records) {
        if (req.method === 'POST') {
          const id = 'recNew' + String(++fake.created).padStart(11, '0');
          (fake.tables[table] ??= {})[id] = { ...r.fields }; fake.creates.push({ table, id, fields: r.fields }); out.push({ id, fields: r.fields });
        } else { fake.patches.push({ table, ...r }); Object.assign(rows[r.id], r.fields); out.push(r); }
      }
      res.end(JSON.stringify({ records: out }));
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
      [REC]: { [F.name]: 'Roofers TX', fldFvgH9UxZSQesD4: ['list-lookup-key'], [F.client]: [CLIENT], [F.filtersJson]: JSON.stringify(FILTERS), [F.icp]: 'Residential roofers in Texas', [F.thesis]: 'Roofers need more booked jobs', [F.sampleSize]: 100 },
      [OTHER]: { [F.name]: 'Not on engine', [F.engineAction]: 'Run Company Sample', [F.filtersJson]: JSON.stringify(FILTERS) },
    },
    [CLIENTS]: { [CLIENT]: { fld48x6Yg3v6RP30W: 'Acme Marketing', fldWAdvAzoPxqW0Ut: 'Free roofing lead audit', fldrvOi88COOEPBGe: 'client-excl-1', fldv94snzU8CemHnn: 4500, [KEY_FIELD]: 'secret-key-value', fld6bFQolVFg4Ub3N: 'client-bison-key' } },
  };
  fake.patches = []; fake.creates = []; fake.created = 0; fake.clientFieldsAsked = [];
  if (skip) return;
  await db.query(`DELETE FROM jobs WHERE record_id = ANY($1) OR record_id LIKE 'recNew%' OR record_id = 'recCampParent0001'`, [[REC, OTHER]]);
  await db.query(`DELETE FROM lead_list_sheets WHERE list_id = $1`, [REC]);
});

test('a button press queues exactly one job, clears the press and writes Queued', { skip }, async () => {
  press('Run Company Sample');
  assert.equal(await pollActions(db, cfg(), at()), 1);
  const jobs = (await db.query(`SELECT * FROM jobs WHERE record_id=$1`, [REC])).rows;
  assert.equal(jobs.length, 1);
  assert.equal(jobs[0].kind, 'leadlist.sample');
  assert.equal(jobs[0].dry_run, true, 'not in LIVE_STAGES = dry run');
  // The client's DiscoLike exclusion list is added at run time, as in n8n.
  assert.deepEqual(jobs[0].input.filters, { ...FILTERS, exclusion_query_id: ['client-excl-1'] });
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
  assert.match(String(rec()[F.engineMessage]), /QA Passed and Ready/);
  assert.equal((await db.query(`SELECT count(*)::int n FROM jobs WHERE record_id=$1`, [REC])).rows[0].n, 0);
  assert.equal(rec()[F.engineAction], null);
});

test('contacts: sample until approved, then everyone; verify reads the engine sheet', { skip }, async () => {
  press('Find Contacts', { [F.contactFiltersJson]: '{"seniority":["executive"]}', [F.contactSampleSize]: 50 });
  await pollActions(db, cfg(), at());
  let j = (await db.query(`SELECT * FROM jobs WHERE record_id=$1 AND kind='leadlist.contacts'`, [REC])).rows[0];
  assert.equal(j.input.companies, 50);
  assert.deepEqual(j.input.contactFilters, { seniority: ['executive'] });
  assert.equal(j.input.contactsRun, true, 'no Contact Source = the DiscoLike Contacts run (default since 2026-11-23)');
  assert.equal(j.input.contraGen, false);
  await finish(db, j.id, { dryRun: true, message: 'x' });
  press('Find Contacts', { [F.contactApproved]: true, [F.contactSource]: 'DiscoLike' });
  await pollActions(db, cfg(), at());
  j = (await db.query(`SELECT * FROM jobs WHERE record_id=$1 AND kind='leadlist.contacts' ORDER BY id DESC`, [REC])).rows[0];
  assert.equal(j.input.companies, undefined);
  assert.equal(j.input.contactsRun, false, 'the legacy DiscoLike search only when picked on purpose');

  await db.query(`INSERT INTO lead_list_sheets (list_id, kind, sheet_id, tab) VALUES ($1,'companies','sheet123','Engine Companies')`, [REC]);
  press('Verify and Finalize', { [F.includeDirect]: true });
  await pollActions(db, cfg(), at());
  const v = (await db.query(`SELECT * FROM jobs WHERE record_id=$1 AND kind='leadlist.verify'`, [REC])).rows[0];
  assert.deepEqual(v.input.source, { sheetId: 'sheet123', contactsTab: 'Contacts', companiesTab: 'Engine Companies' });
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

// ---- Build Campaign -------------------------------------------------------------------
import { CAMPAIGNS } from '../src/airtable/campaignBuild.js';
import { CAMPAIGN_FIELDS as C } from '../src/campaign/campaignFields.js';
const PARENT = 'recCampParent0001';
const EA = 'tblMSOBJ0wMgxSg4l';
function campaignReady(extra: Record<string, unknown> = {}) {
  Object.assign(rec(), { fldepbn71awSjmZPV: [PARENT], fld8nrebRFL0O8kgj: 'Ready', fldUB4WsLi5kq6rUy: 'Passed', [F.finalDirect]: 243, [F.finalGeneric]: 257 });
  fake.tables[CAMPAIGNS] = { [PARENT]: {
    [C.Name]: '[Dulcy] Med Spas', [C['Campaign Status']]: 'Spintax Generated', [C.Client]: [CLIENT], [C['Lead List']]: [REC],
    [C['Email Accounts']]: ['recInbox000000001', 'recInbox000000002', 'recInbox000000003', 'recInbox000000004'],
    [C['Number of variants - Step 1']]: '2',
    [C['Campaign Subject 1 Version 1']]: '{CITY} lunch?', [C['Campaign Body 1 Version 1']]: 'Hey {FIRST_NAME},\n\nQuick note.',
    [C['Campaign Subject 1 Version 2']]: 'quick one', [C['Campaign Body 1 Version 2']]: 'Hi {FIRST_NAME},\n\nOther angle.',
    [C['Campaign Body 2 Version 1']]: 'Following up.', [C['Thread Reply - Step 2']]: true,
    [C['Days Between Emails']]: '2', ...extra,
  } };
  fake.tables[EA] = Object.fromEntries([1, 2, 3, 4].map((n) => [`recInbox00000000${n}`, { fldR19WUqSSBVQcPO: 100 + n, fldWB4pvEgQ8aYlT2: 2, fldBP1gljUUM44JMk: 15, fldRYSB93NNdBc4Js: `a${n}@dulcywin.com` }]));
  fake.tables[CLIENTS][CLIENT].fldTHTrYh0GCFeBLG = 'Dulcy';
  fake.tables[CLIENTS][CLIENT].fldIMJnjdGGAPotMW = 'Founder';
}

test('Build Campaign: gates say what to fix and queue nothing', { skip }, async () => {
  await db.query(`INSERT INTO lead_list_sheets (list_id, kind, sheet_id, tab) VALUES ($1,'companies','sheetMed','Engine Companies')`, [REC]);
  campaignReady({ [C['Campaign Status']]: 'Emails Generated' });
  press('Build Campaign');
  await pollActions(db, cfg(), at());
  assert.match(String(rec()[F.engineMessage]), /must be Spintax Generated first/);
  campaignReady({ [C.ID]: 650 });
  press('Build Campaign');
  await pollActions(db, cfg(), at());
  assert.match(String(rec()[F.engineMessage]), /already has EmailBison campaign 650/);
  campaignReady();
  fake.tables[EA].recInbox000000002.fldWB4pvEgQ8aYlT2 = 80;
  press('Build Campaign');
  await pollActions(db, cfg(), at());
  assert.match(String(rec()[F.engineMessage]), /one EmailBison workspace/);
  campaignReady({ [C.max_emails_per_day]: 10 });
  press('Build Campaign');
  await pollActions(db, cfg(), at());
  assert.match(String(rec()[F.engineMessage]), /max_emails_per_day is 10/);
  assert.equal((await db.query(`SELECT count(*)::int n FROM jobs WHERE kind='campaign.build'`)).rows[0].n, 0);
  assert.equal(fake.creates.length, 0);
});

test('Build Campaign: two outputs, child records, inboxes split by lead share, old copy rules, results written back', { skip }, async () => {
  await db.query(`INSERT INTO lead_list_sheets (list_id, kind, sheet_id, tab) VALUES ($1,'companies','sheetMed','Engine Companies')`, [REC]);
  campaignReady();
  press('Build Campaign');
  assert.equal(await pollActions(db, cfg({ liveStages: ['campaign.build'] }), at()), 2);
  assert.equal(rec()[F.engineAction], null);
  assert.equal(rec()[F.engineStatus], 'Queued');
  // Child records, like Campaign Center made them.
  assert.deepEqual(fake.creates.map((c) => c.fields[C.Name]), ['[Dulcy] Med Spas - Generic Emails', '[Dulcy] Med Spas - Direct Emails']);
  assert.deepEqual(fake.creates.map((c) => c.fields[C['Email Accounts']]), [['recInbox000000001', 'recInbox000000002'], ['recInbox000000003', 'recInbox000000004']]);
  const jobs = (await db.query(`SELECT * FROM jobs WHERE kind='campaign.build' ORDER BY id`)).rows;
  assert.equal(jobs.length, 2);
  const [g, d] = jobs.map((j) => j.input);
  assert.equal(jobs[0].dry_run, false);
  assert.equal(g.outputType, 'generic'); assert.equal(d.outputType, 'direct');
  assert.equal(g.workspace, 'dulcy'); assert.equal(g.workspaceId, 2);
  assert.deepEqual(g.senderEmailIds, ['101', '102']); assert.deepEqual(d.senderEmailIds, ['103', '104']);
  assert.deepEqual(g.source, { sheetId: 'sheetMed', tab: 'Final Generic' }); assert.equal(g.expectedLeads, 257);
  assert.deepEqual(d.source, { sheetId: 'sheetMed', tab: 'Final Direct' }); assert.equal(d.expectedLeads, 243);
  // Copy: generic loses the {FIRST_NAME} greeting; both get the signature + P.S.; step 2 is a thread reply on step 1's subject.
  assert.equal(g.steps[0].body.startsWith('Quick note.'), true);
  assert.equal(d.steps[0].body.startsWith('Hey {FIRST_NAME},'), true);
  assert.match(d.steps[0].body, /\{SENDER_FULL_NAME\}\nFounder, Dulcy\n\n\{P\.S\.\|P\.s\.\|p\.s\.\} or tell me to pound sand/);
  assert.equal(d.steps[0].variants.length, 1);
  assert.equal(d.steps[1].subject, '{CITY} lunch?'); assert.equal(d.steps[1].threadReply, true);
  assert.equal(d.daysBetween, 2);
  assert.deepEqual(d.settings, { plain_text: true, open_tracking: false, reputation_building: false, can_unsubscribe: false, unsubscribe_text: '', max_emails_per_day: 30, max_new_leads_per_day: 24 });
  assert.equal(fake.tables[CAMPAIGNS][PARENT][C['Processing Status']], 'Running');

  // A second press of the same moment never queues twice.
  const setAt = rec()[F.engineActionSetAt];
  Object.assign(rec(), { [F.engineAction]: 'Build Campaign', [F.engineActionSetAt]: setAt });
  assert.equal(await pollActions(db, cfg({ liveStages: ['campaign.build'] }), at()), 0);

  // Results: each child gets its ID, the parent gets both per-output IDs, the list shows both lines.
  await finish(db, jobs[0].id, { dryRun: false, campaignId: 701, message: 'campaign 701 built with 257 leads' });
  await syncResults(db, at());
  const genChild = fake.creates[0].id, dirChild = fake.creates[1].id;
  assert.equal(fake.tables[CAMPAIGNS][genChild][C.ID], 701);
  assert.equal(fake.tables[CAMPAIGNS][genChild][C['EmailBison Generic Campaign ID']], 701);
  assert.equal(fake.tables[CAMPAIGNS][genChild][C['Processing Status']], 'Completed');
  assert.equal(fake.tables[CAMPAIGNS][PARENT][C['EmailBison Generic Campaign ID']], 701);
  assert.equal(rec()[F.engineStatus], 'Queued', 'direct still to come');
  await finish(db, jobs[1].id, { dryRun: false, campaignId: 702, message: 'campaign 702 built with 243 leads' });
  await syncResults(db, at());
  assert.equal(fake.tables[CAMPAIGNS][dirChild][C.ID], 702);
  assert.equal(fake.tables[CAMPAIGNS][PARENT][C['EmailBison Direct Campaign ID']], 702);
  assert.equal(fake.tables[CAMPAIGNS][PARENT][C.ID], undefined, 'the parent keeps no ID, as before');
  assert.equal(fake.tables[CAMPAIGNS][PARENT][C['Processing Status']], 'Completed');
  assert.equal(rec()[F.engineStatus], 'Done');
  assert.match(String(rec()[F.engineMessage]), /Direct: campaign 702[\s\S]*Generic: campaign 701/);
  assert.equal(await syncResults(db, at()), 0);
});

test('Generate Filters: record and client by field name, plan fields cleared, key fields never read; result written back', { skip }, async () => {
  Object.assign(rec(), { [F.filtersJson]: '{"old":true}', fldG2MXz5lccu7KKU: '1,50', fldydpLzUzAJGLBBJ: 'old keyword' });
  press('Generate Filters');
  assert.equal(await pollActions(db, cfg(), at()), 1);
  const j = (await db.query(`SELECT * FROM jobs WHERE record_id=$1 AND kind='leadlist.filters'`, [REC])).rows[0];
  assert.equal(j.input.record.fields['ICP Description'], 'Residential roofers in Texas');
  assert.equal(j.input.record.fields['Name of the Lead List'], 'Roofers TX');
  for (const n of ['DiscoLike Company Filters JSON', 'Employee Range', 'Homepage Keywords']) assert.ok(!(n in j.input.record.fields), n + ' cleared');
  assert.equal(j.input.client.fields.Name, 'Acme Marketing');
  assert.equal(j.input.client.fields['Cold Traffic Offer'], 'Free roofing lead audit');
  // Only the useful client fields go to the AI: no exclusion IDs, billing or system fields.
  assert.deepEqual(Object.keys(j.input.client.fields).sort(), ['Cold Traffic Offer', 'Name']);
  for (const asked of fake.clientFieldsAsked) assert.ok(!asked.includes('fldv94snzU8CemHnn'), 'billing never read');
  const raw = JSON.stringify(j.input);
  for (const secret of ['secret-key-value', 'client-bison-key', 'list-lookup-key']) assert.ok(!raw.includes(secret), 'never read: ' + secret);
  for (const asked of fake.clientFieldsAsked) for (const id of ['fld6bFQolVFg4Ub3N', KEY_FIELD]) assert.ok(!asked.includes(id));
  assert.ok(!('leadGoal' in j.input), 'no linked campaign: the engine default goal applies');
  await finish(db, j.id, { dryRun: false, airtableFields: { fldC2hZQ3gSqLmi1y: '{"icp_prompt":"x"}', fldG2MXz5lccu7KKU: '11,200', fldf9wpMGWg0SebHV: 'Completed' }, message: 'N keywords. Review them before running the first 100 companies.' });
  await syncResults(db, at());
  assert.equal(rec()[F.filtersJson], '{"icp_prompt":"x"}');
  assert.equal(rec().fldG2MXz5lccu7KKU, '11,200');
  assert.equal(rec()[F.engineStatus], 'Done');
  assert.match(String(rec()[F.workflowMessage]), /Review them before running/);
});

test('Generate Filters: the soft lead goal comes from the inboxes actually linked (both campaigns of a Generic/Direct split, each inbox once)', { skip }, async () => {
  campaignReady();
  const CHILD = 'recCampChild00001';
  fake.tables[CAMPAIGNS][CHILD] = { [C.Name]: '[Dulcy] Med Spas - Direct Emails', [C['Email Accounts']]: ['recInbox000000001', 'recInbox000000005'] };
  fake.tables[EA].recInbox000000005 = { fldBP1gljUUM44JMk: 30 };
  fake.tables[EA].recInbox000000002.fldBP1gljUUM44JMk = null; // no daily limit counts 15, as Build Campaign does
  Object.assign(rec(), { fldepbn71awSjmZPV: [PARENT, CHILD] });
  press('Generate Filters');
  assert.equal(await pollActions(db, cfg(), at()), 1);
  const j = (await db.query(`SELECT * FROM jobs WHERE record_id=$1 AND kind='leadlist.filters'`, [REC])).rows[0];
  // 5 inboxes: 15 x 4 + 30 = 90 a day x 14 days / 3 steps = 420 leads.
  assert.deepEqual(j.input.leadGoal, { value: 420, source: 'campaign', inboxes: 5, perDay: 90, campaigns: ['[Dulcy] Med Spas', '[Dulcy] Med Spas - Direct Emails'] });
});

test('Restart Companies and Skip Enrichment buttons queue their engine stages', { skip }, async () => {
  press('Restart Companies');
  await pollActions(db, cfg(), at());
  let j = (await db.query(`SELECT * FROM jobs WHERE record_id=$1 ORDER BY id DESC LIMIT 1`, [REC])).rows[0];
  assert.equal(j.kind, 'leadlist.restart');
  await db.query(`UPDATE jobs SET status='succeeded' WHERE id=$1`, [j.id]);
  press('Skip Enrichment', { [F.finalDirect]: 80, [F.finalGeneric]: 20 });
  await pollActions(db, cfg(), at());
  j = (await db.query(`SELECT * FROM jobs WHERE record_id=$1 ORDER BY id DESC LIMIT 1`, [REC])).rows[0];
  assert.equal(j.kind, 'leadlist.skipenrich');
  assert.deepEqual(j.input, { finalDirect: 80, finalGeneric: 20 });
});

test('Use DiscoGen Deep Review ticked: deep review is queued by itself after the sample; not when unticked or dry run', { skip }, async () => {
  const done = async (dryRun: boolean) => {
    press('Run Company Sample');
    await pollActions(db, cfg({ liveStages: dryRun ? [] : ['leadlist.sample'] }), at());
    const id = Number(rec()[F.engineJobId]);
    await finish(db, id, { dryRun, sample: { reviewed: 100, tier1: 40, tier2: 45, cut: 15, usableRate: 0.85, status: 'Passed' }, message: 'sample Passed' });
    await syncResults(db, at());
  };
  await done(false);
  assert.equal(rec()[F.engineAction], null, 'not ticked: nothing queued');
  Object.assign(rec(), { [F.useDeepReview]: true, [F.deepReviewPrompt]: 'Pass only B2B agencies' });
  await done(true);
  assert.equal(rec()[F.engineAction], null, 'dry run: nothing queued');
  await done(false);
  assert.equal(rec()[F.engineAction], 'Deep Review Companies');
  assert.match(String(rec()[F.engineMessage]), /Deep review queued automatically/);
  await pollActions(db, cfg(), at());
  const j = (await db.query(`SELECT kind FROM jobs WHERE record_id=$1 ORDER BY id DESC LIMIT 1`, [REC])).rows[0];
  assert.equal(j.kind, 'leadlist.deepreview');
});

test('TAM check: a requested count is answered with the free count; uncountable or bad filters get an error; a rate limit waits', { skip }, async () => {
  const ask = (source: string) => { rec()[F.tamCheck] = JSON.stringify({ version: 1, status: 'requested', requestId: 'req-1', requestedAt: '2026-11-23T20:00:00Z', source }); };
  let calls = 0;
  const disco = { count: async (f: any) => { calls++; return f.country ? { count: 1234, ignored: ['icp_prompt'] } : null; } };
  ask(JSON.stringify(FILTERS));
  assert.equal(await pollTam(cfg(), at(), disco as any), 1);
  let snap = JSON.parse(String(rec()[F.tamCheck]));
  assert.equal(snap.status, 'complete');
  assert.equal(snap.count, 1234);
  assert.equal(snap.requestId, 'req-1');
  assert.equal(snap.source, JSON.stringify(FILTERS));
  assert.deepEqual(snap.params, { country: 'US' });
  assert.ok(snap.checkedAt);
  assert.equal(await pollTam(cfg(), at(), disco as any), 0, 'a finished check is not counted again');
  assert.equal(calls, 1);

  ask(JSON.stringify({ icp_prompt: 'lookalike only' }));
  await pollTam(cfg(), at(), disco as any);
  snap = JSON.parse(String(rec()[F.tamCheck]));
  assert.equal(snap.status, 'error');
  assert.match(snap.message, /cannot be counted/);

  ask('not json');
  await pollTam(cfg(), at(), disco as any);
  assert.match(JSON.parse(String(rec()[F.tamCheck])).message, /not valid JSON/);

  ask(JSON.stringify(FILTERS));
  await pollTam(cfg(), at(), { count: async () => { throw new WaitError('DiscoLike: rate limited', 60_000); } } as any);
  assert.equal(JSON.parse(String(rec()[F.tamCheck])).status, 'requested', 'rate limited: left for the next tick');
});

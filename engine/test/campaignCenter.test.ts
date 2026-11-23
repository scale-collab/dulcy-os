// Campaign Center buttons on the engine: Campaigns presses → jobs (fake Airtable), and the
// launch / pause / senders / top-up / bounce-skip stages end to end (fake EmailBison + Google).
import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import type pg from 'pg';
import { createPool, migrate } from '../src/db/pool.js';
import { getJob } from '../src/queue.js';
import { runOnce } from '../src/worker.js';
import { loadConfig, type Config } from '../src/config.js';
import { createAirtableClient } from '../src/providers/airtable.js';
import { F, LEAD_LISTS, CLIENTS, syncResults, bridgeTick } from '../src/airtable/bridge.js';
import { CAMPAIGNS } from '../src/airtable/campaignBuild.js';
import { CE, kpisFrom, pollCampaignActions, skipBouncePauseIds } from '../src/airtable/campaignActions.js';
import { airtableLaunchChecks } from '../src/stages/campaignControl.js';
import { CAMPAIGN_FIELDS as C } from '../src/campaign/campaignFields.js';
import { scheduleTick } from '../src/scheduler.js';
import { enqueue } from '../src/queue.js';
import { startFakeBison, type FakeBison } from './fakes/bison.js';
import { startFakeGoogle, type FakeGoogle } from './fakes/google.js';

const url = process.env.TEST_DATABASE_URL;
const skip = !url ? 'TEST_DATABASE_URL not set' : false;
const CAMP = 'recCampCenter0001';
const SPLIT = 'recCampCenter0002';
const CHILD_D = 'recCampChildD0001';
const CHILD_G = 'recCampChildG0001';
const LIST = 'recListCenter0001';
const TOPUP = 'recListTopup00001';
const CLIENT = 'recClientCenter01';
const EA = 'tblMSOBJ0wMgxSg4l';
const inbox = (n: number) => `recInboxCenter00${n}`;
const SHEET = 'https://docs.google.com/spreadsheets/d/1QYLOeUxwDXunQm_KMEYKB_7jW7l47ZQJ8wVVtCZBUd8/edit';
const KINDS = ['campaign.launch', 'campaign.pause', 'campaign.senders', 'campaign.topup', 'bounce.check'];

let db: pg.Pool;
let server: http.Server;
let bison: FakeBison;
let google: FakeGoogle;
const fake = { url: '', tables: {} as Record<string, Record<string, Record<string, unknown>>>, fieldsAsked: {} as Record<string, string[][]> };

const cfg = (over: Partial<Config> = {}): Config => ({
  ...loadConfig({ ENGINE_SECRET: 'x'.repeat(40), DATABASE_URL: url ?? 'postgres://x' } as NodeJS.ProcessEnv),
  emailBisonKeys: { dulcy: bison.key }, emailBisonBaseUrl: bison.url, bisonPollMs: 5,
  googleKeyFile: google.keyFile, googleSheetsBaseUrl: google.url, dryRun: true, liveStages: KINDS, ...over,
});
const at = () => createAirtableClient({ apiKey: 'pat-test', baseId: 'appTest', baseUrl: fake.url });
const camp = (id = CAMP) => fake.tables[CAMPAIGNS][id];

function press(action: string, extra: Record<string, unknown> = {}, id = CAMP) {
  Object.assign(camp(id), { [CE.runsOnEngine]: true, [CE.engineAction]: action, [CE.engineActionSetAt]: new Date().toISOString(), ...extra });
}
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
async function settle(c: Config, id: number, max = 80) {
  for (let i = 0; i < max; i++) {
    await runOnce(db, c);
    const j = await getJob(db, id);
    if (['succeeded', 'failed', 'needs_review'].includes(j!.job.status)) return j!;
    await db.query(`UPDATE jobs SET run_after = now() WHERE id = $1 AND status = 'queued'`, [id]);
    await sleep(8);
  }
  throw new Error('job did not settle');
}
const jobsOf = async (kind?: string) => (await db.query(`SELECT * FROM jobs ${kind ? 'WHERE kind=$1' : ''} ORDER BY id`, kind ? [kind] : [])).rows;
/** Press on the record, run the job(s) it queued, write the results back. */
async function pressAndRun(action: string, conf = cfg(), id = CAMP) {
  press(action, {}, id);
  await pollCampaignActions(db, conf, at());
  const ids = String(camp(id)[CE.engineJobId] ?? '').split(',').map((x) => Number(x.trim())).filter(Boolean);
  assert.ok(ids.length, `no job queued: ${camp(id)[CE.engineMessage]}`);
  const out = [];
  for (const jid of ids) out.push(await settle(conf, jid));
  await syncResults(db, at());
  return out;
}
const resumes = () => bison.calls.filter((x) => /\/resume$/.test(x)).length;

before(async () => {
  google = await startFakeGoogle();
  bison = await startFakeBison();
  server = http.createServer((req, res) => {
    const u = new URL(req.url ?? '/', 'http://x');
    const [, , , table] = u.pathname.split('/');
    const rows = fake.tables[table] ?? {};
    res.setHeader('content-type', 'application/json');
    if (req.method === 'GET') {
      const formula = u.searchParams.get('filterByFormula') ?? '';
      const fields = u.searchParams.getAll('fields[]');
      (fake.fieldsAsked[table] ??= []).push(fields);
      const one = /RECORD_ID\(\)='(rec\w+)'/.exec(formula)?.[1];
      const [runs, act] = table === CAMPAIGNS ? [CE.runsOnEngine, CE.engineAction] : [F.runsOnEngine, F.engineAction];
      const ids = Object.keys(rows).filter((id) => one ? id === one
        : formula.includes('{Runs on Engine}') ? rows[id][runs] === true && !!rows[id][act]
        : formula.includes('{Skip Bounce Pause}') ? rows[id][CE.skipBouncePause] === true : true);
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
          const id = 'recNewC' + String(Object.keys(fake.tables[table] ?? {}).length).padStart(10, '0');
          (fake.tables[table] ??= {})[id] = { ...r.fields }; out.push({ id, fields: r.fields });
        } else { Object.assign(rows[r.id], r.fields); out.push(r); }
      }
      res.end(JSON.stringify({ records: out }));
    });
  });
  await new Promise<void>((r) => server.listen(0, () => r()));
  fake.url = `http://127.0.0.1:${(server.address() as any).port}`;
  if (skip) return;
  db = createPool(url!); await migrate(db);
});
after(async () => { server.close(); bison.close(); google.close(); if (!skip) await db.end(); });

const COPY = {
  [C['Campaign Subject 1 Version 1']]: 'quick one', [C['Campaign Body 1 Version 1']]: 'Hey {FIRST_NAME},\n\nQuick note.',
  [C['Campaign Body 2 Version 1']]: 'Following up.', [C['Thread Reply - Step 2']]: true,
};
const HEADER = ['Email', 'Verification Status', 'First Name', 'Last Name', 'Company'];
const TAB = [HEADER, ['new1@a.com', 'Good', 'Ann', 'Lee', 'A'], ['new2@b.com', 'Good', 'Bo', 'Ng', 'B'], ['old@c.com', 'Good', 'Cy', 'Ra', 'C']];
const bisonCampaign = (id: number, over: Record<string, unknown> = {}) => ({
  id, name: `C${id}`, leads: new Set(['old@c.com']), senders: ['11', '12'], status: 'draft',
  steps: [{ id: 9000 + id, order: 1, email_subject: 'quick one', variant: false }], ...over,
});

beforeEach(async () => {
  fake.tables = {
    [CAMPAIGNS]: {
      [CAMP]: {
        [C.Name]: '[Dulcy] Med Spas', [C.Client]: [CLIENT], [C['Lead List']]: [LIST], [C['Email Accounts']]: [inbox(1), inbox(2)],
        [C.ID]: 501, [C['EmailBison Direct Campaign ID']]: 501, [C['Workflow Stage']]: 'Approved', [C['Campaign Status']]: 'Uploaded',
        [CE.sent]: 1000, [CE.replies]: 30, [CE.interested]: 6, [CE.bounced]: 12, [CE.progress]: 0.7, [CE.topupList]: [TOPUP], ...COPY,
      },
      [SPLIT]: {
        [C.Name]: '[Dulcy] Roofers', [C.Client]: [CLIENT], [C['Lead List']]: [LIST], [C['Email Accounts']]: [inbox(1), inbox(2), inbox(3), inbox(4)],
        [C['EmailBison Direct Campaign ID']]: 601, [C['EmailBison Generic Campaign ID']]: 602, [C['Workflow Stage']]: 'Build Ready', [CE.topupList]: [TOPUP],
        [CE.sent]: 500, [CE.replies]: 20, [CE.interested]: 4, ...COPY,
      },
      [CHILD_D]: { [C.Name]: '[Dulcy] Roofers - Direct Emails', [C['Lead List']]: [LIST], [C['Email Accounts']]: [inbox(3), inbox(4)], [C.ID]: 601, [C['EmailBison Direct Campaign ID']]: 601 },
      [CHILD_G]: { [C.Name]: '[Dulcy] Roofers - Generic Emails', [C['Lead List']]: [LIST], [C['Email Accounts']]: [inbox(1), inbox(2)], [C.ID]: 602, [C['EmailBison Generic Campaign ID']]: 602 },
    },
    [LEAD_LISTS]: {
      [LIST]: { [F.name]: 'Med Spas list', fldepbn71awSjmZPV: [CAMP, SPLIT, CHILD_D, CHILD_G], fld8nrebRFL0O8kgj: 'Uploaded', fldUB4WsLi5kq6rUy: 'Passed', [F.finalDirect]: 3, [F.finalGeneric]: 0 },
      [TOPUP]: { [F.name]: 'Med Spas top-up', fld8nrebRFL0O8kgj: 'Ready', fldUB4WsLi5kq6rUy: 'Passed', [F.finalDirect]: 3, [F.finalGeneric]: 2, [F.sheetLink]: SHEET },
    },
    [CLIENTS]: { [CLIENT]: { fld48x6Yg3v6RP30W: 'Dulcy', fldSr8KQs90Uk2d26: 'Active', fld6bFQolVFg4Ub3N: 'client-bison-key' } },
    [EA]: Object.fromEntries([1, 2, 3, 4].map((n) => [inbox(n), { fldR19WUqSSBVQcPO: 10 + n, fldWB4pvEgQ8aYlT2: 2 }])),
  };
  fake.fieldsAsked = {};
  Object.assign(bison, {
    campaigns: [bisonCampaign(501), bisonCampaign(601, { senders: ['13', '14'] }), bisonCampaign(602)], leadLists: [], calls: [],
    workspaceSenders: ['11', '12', '13', '14'], pauseIgnored: false, resumeDelayReads: 0, resumeIgnored: false, resumeThen500: false,
    currentTeam: 2, otherToolSwitches: false, processAfterChecks: 0, failRowsOnImport: 0, skipRowsOnImport: 0, underReportOnImport: 0, customVariables: new Set(['domain']),
  });
  bison.senderStatus = () => 'connected';
  google.tabs = { 'Final Direct': TAB.map((r) => [...r]), 'Final Generic': TAB.slice(0, 3).map((r) => [...r]) };
  if (skip) return;
  await db.query('TRUNCATE jobs, steps, receipts, events RESTART IDENTITY CASCADE');
  await db.query(`DELETE FROM lead_list_sheets WHERE list_id = ANY($1)`, [[LIST, TOPUP]]);
});

// ---------------------------------------------------------------- presses

test('each Campaign Center press queues the right kind once and clears the press', { skip }, async () => {
  const want: Record<string, string> = { 'Launch Campaign': 'campaign.launch', 'Pause Campaign': 'campaign.pause', 'Update Senders': 'campaign.senders' };
  for (const [action, kind] of Object.entries(want)) {
    press(action);
    const setAt = camp()[CE.engineActionSetAt];
    assert.equal(await pollCampaignActions(db, cfg(), at()), 1, action);
    assert.equal(camp()[CE.engineAction], null);
    assert.equal(camp()[CE.engineStatus], 'Queued');
    const jobs = await jobsOf(kind);
    assert.equal(jobs.length, 1, kind);
    assert.equal(camp()[CE.engineJobId], String(jobs[0].id));
    assert.equal(jobs[0].dry_run, false, 'live because the kind is in LIVE_STAGES');
    assert.deepEqual(jobs[0].input.targets.map((t: any) => t.campaignId), [501]);
    assert.equal(jobs[0].input.workspace, 'dulcy');
    assert.equal(jobs[0].input.workspaceId, 2, 'workspace from the inboxes, as Build Campaign');
    // Same press seen again (write-back lost): still one job.
    Object.assign(camp(), { [CE.engineAction]: action, [CE.engineActionSetAt]: setAt });
    assert.equal(await pollCampaignActions(db, cfg(), at()), 0);
    assert.equal((await jobsOf(kind)).length, 1);
    await db.query(`UPDATE jobs SET status='succeeded' WHERE kind=$1`, [kind]);
  }
  const launch = (await jobsOf('campaign.launch'))[0].input;
  assert.equal(launch.facts.copy.workflowStage, 'Approved');
  assert.deepEqual(launch.facts.leadList, { linked: 1, name: 'Med Spas list', stage: 'Uploaded', qa: 'Passed' });
  assert.deepEqual(launch.facts.client, { linked: true, name: 'Dulcy', status: 'Active' });
  assert.deepEqual((await jobsOf('campaign.senders'))[0].input.targets[0].senderEmailIds, ['11', '12']);
  // Never asked for a key field.
  for (const asked of fake.fieldsAsked[CLIENTS] ?? []) assert.ok(!asked.includes('fld6bFQolVFg4Ub3N'));
  // Dry run when the kind is not live.
  press('Pause Campaign');
  await pollCampaignActions(db, cfg({ liveStages: [] }), at());
  assert.match(String(camp()[CE.engineMessage]), /dry run/);
});

test('a split parent: Direct and Generic children are found; senders come from each child; top-up queues one job per part', { skip }, async () => {
  press('Update Senders', {}, SPLIT);
  await pollCampaignActions(db, cfg(), at());
  const s = (await jobsOf('campaign.senders'))[0].input.targets;
  assert.deepEqual(s.map((t: any) => [t.campaignId, t.recordId, t.senderEmailIds]), [[601, CHILD_D, ['13', '14']], [602, CHILD_G, ['11', '12']]]);
  press('Top Up Campaign', {}, SPLIT);
  assert.equal(await pollCampaignActions(db, cfg(), at()), 2, String(camp(SPLIT)[CE.engineMessage]));
  const t = await jobsOf('campaign.topup');
  assert.deepEqual(t.map((j) => [j.input.campaignId, j.input.outputType, j.input.source.tab, j.input.expectedLeads, j.input.name]),
    [[601, 'direct', 'Final Direct', 3, '[Dulcy] Roofers - Direct Emails'], [602, 'generic', 'Final Generic', 2, '[Dulcy] Roofers - Generic Emails']]);
  assert.deepEqual(t.map((j) => j.record_id), [`${SPLIT}:topup:${TOPUP}:direct`, `${SPLIT}:topup:${TOPUP}:generic`]);
  assert.ok(!t[1].input.copyTags.includes('FIRST_NAME'), 'generic copy has no {FIRST_NAME}');
  assert.ok(t[0].input.copyTags.includes('FIRST_NAME'));
});

test('bad input: Failed with what to fix, press cleared, nothing queued', { skip }, async () => {
  const cases: [string, Record<string, unknown>, RegExp][] = [
    ['Launch Campaign', { [C.ID]: null, [C['EmailBison Direct Campaign ID']]: null }, /no EmailBison campaign ID yet/],
    ['Delete Campaign', {}, /not wired to the engine/],
    ['Top Up Campaign', { [CE.topupList]: null }, /pick the Top-up Lead List/],
    ['Update Senders', { [C['Email Accounts']]: [] }, /no Email Accounts selected|no EmailBison workspace/],
  ];
  for (const [action, extra, re] of cases) {
    const saved = { ...camp() };
    press(action, extra);
    assert.equal(await pollCampaignActions(db, cfg(), at()), 0);
    assert.equal(camp()[CE.engineStatus], 'Failed', action);
    assert.match(String(camp()[CE.engineMessage]), re);
    assert.equal(camp()[CE.engineAction], null);
    fake.tables[CAMPAIGNS][CAMP] = saved;
  }
  fake.tables[EA][inbox(2)].fldR19WUqSSBVQcPO = null;
  press('Update Senders');
  await pollCampaignActions(db, cfg(), at());
  assert.match(String(camp()[CE.engineMessage]), /numeric Email ID/);
  assert.equal((await jobsOf()).length, 0);
});

// ---------------------------------------------------------------- launch

test('launch checks (a), (b), (d) from Airtable: approval, list Ready + QA Passed, client active', () => {
  const ok = { copy: { workflowStage: 'Approved' }, leadList: { linked: 1, stage: 'Ready', qa: 'Passed' }, client: { linked: true, status: '' } };
  assert.ok(airtableLaunchChecks(ok).every((c) => c.pass), 'empty client status counts as active');
  assert.equal(airtableLaunchChecks({ ...ok, copy: { workflowStage: 'Client Review', approvalSource: 'Email from client' } })[0].pass, true);
  assert.equal(airtableLaunchChecks({ ...ok, copy: { workflowStage: 'Client Review', approvalException: true } })[0].pass, true);
  assert.equal(airtableLaunchChecks({ ...ok, copy: { workflowStage: 'Strategy Draft' } })[0].pass, false);
  assert.equal(airtableLaunchChecks({ ...ok, leadList: { linked: 2, stage: 'Ready', qa: 'Passed' } })[1].pass, false);
  for (const status of ['Cancelled', 'Paused', 'Inactive', 'Churned']) assert.equal(airtableLaunchChecks({ ...ok, client: { linked: true, status } })[2].pass, false, status);
});

async function refused(re: RegExp) {
  const [j] = await pressAndRun('Launch Campaign');
  assert.equal(j.job.status, 'failed');
  assert.match(j.job.error, /launch refused, nothing was launched/);
  assert.match(j.job.error, re);
  assert.equal(resumes(), 0, 'nothing launched');
  assert.equal(camp()[CE.engineStatus], 'Failed');
  assert.match(String(camp()[CE.engineMessage]), re);
  assert.notEqual(camp()[C['Workflow Stage']], 'Live');
}

test('launch refused: copy not approved', { skip }, async () => {
  camp()[C['Workflow Stage']] = 'Client Review';
  await refused(/Failed check: copy approved/);
});

test('launch refused: lead list not Ready / QA not Passed', { skip }, async () => {
  fake.tables[LEAD_LISTS][LIST].fldUB4WsLi5kq6rUy = 'Failed';
  await refused(/Failed check: lead list ready/);
});

test('launch refused: EmailBison campaign has no leads, or a sender is not connected', { skip }, async () => {
  bison.campaigns[0].leads = new Set();
  await refused(/Failed check: EmailBison campaign 501 ready[\s\S]*FAIL EmailBison campaign 501 ready: it has no leads/);
  await db.query('TRUNCATE jobs, steps, receipts, events RESTART IDENTITY CASCADE');
  bison.campaigns[0].leads = new Set(['a@b.com']);
  bison.senderStatus = (id) => (id === '12' ? 'disconnected' : 'connected');
  await refused(/1 of 2 senders are not connected/);
  await db.query('TRUNCATE jobs, steps, receipts, events RESTART IDENTITY CASCADE');
  bison.senderStatus = () => 'connected';
  bison.campaigns[0].steps = [];
  await refused(/no sequence steps/);
});

test('launch refused: client cancelled', { skip }, async () => {
  fake.tables[CLIENTS][CLIENT].fldSr8KQs90Uk2d26 = 'Cancelled';
  await refused(/Failed check: client active/);
});

test('launch: every check passes, resume called once, status confirmed after waiting, Stage Live + Status Active', { skip }, async () => {
  bison.resumeDelayReads = 3; // EmailBison takes a few reads to show it live
  const [j] = await pressAndRun('Launch Campaign');
  assert.equal(j.job.status, 'succeeded', j.job.error);
  assert.equal(resumes(), 1);
  assert.deepEqual(j.job.result.launched, [501]);
  assert.equal(bison.campaigns[0].status, 'active');
  assert.match(j.job.result.message, /PASS copy approved[\s\S]*PASS lead list ready[\s\S]*PASS client active[\s\S]*PASS EmailBison campaign 501 ready/);
  assert.match(j.job.result.message, /Not checked automatically yet: EmailGuard spam check/);
  assert.equal(camp()[CE.engineStatus], 'Done');
  assert.equal(camp()[C['Workflow Stage']], 'Live');
  assert.equal(camp()[C['Campaign Status']], 'Active');
  assert.equal(camp()[C['Processing Status']], 'Completed');
});

test('launch: an unclear resume (EmailBison 500 after taking it) is adopted on the retry, never sent twice', { skip }, async () => {
  bison.resumeThen500 = true;
  const [j] = await pressAndRun('Launch Campaign');
  assert.equal(j.job.status, 'succeeded', j.job.error);
  assert.equal(resumes(), 1);
  const r = await db.query(`SELECT error FROM receipts WHERE receipt_key LIKE '%resume:501'`);
  assert.equal(r.rows[0].error, 'reconciled after an unclear attempt');
});

test('launch: an already-active campaign is not resumed ("already live"); a split parent launches both parts and marks the children Live', { skip }, async () => {
  bison.campaigns[0].status = 'active';
  const [j] = await pressAndRun('Launch Campaign');
  assert.equal(j.job.status, 'succeeded', j.job.error);
  assert.equal(resumes(), 0);
  assert.deepEqual(j.job.result.alreadyLive, [501]);
  assert.match(String(camp()[CE.engineMessage]), /already live: 501/);

  const [k] = await pressAndRun('Launch Campaign', cfg(), SPLIT);
  assert.equal(k.job.status, 'succeeded', k.job.error);
  assert.deepEqual(k.job.result.launched, [601, 602]);
  for (const id of [SPLIT, CHILD_D, CHILD_G]) assert.equal(camp(id)[C['Workflow Stage']], 'Live', id);
});

test('launch dry run (not in LIVE_STAGES): checks run, nothing is resumed, nothing marked Live', { skip }, async () => {
  const [j] = await pressAndRun('Launch Campaign', cfg({ liveStages: [] }));
  assert.equal(j.job.status, 'succeeded', j.job.error);
  assert.deepEqual(j.job.result.wouldLaunch, [501]);
  assert.equal(resumes(), 0);
  assert.equal(camp()[C['Workflow Stage']], 'Approved');
  assert.match(String(camp()[CE.engineMessage]), /^Dry run \(nothing changed\): would launch 501/);
});

// ---------------------------------------------------------------- pause

test('pause: pauses right away and confirms; a paused or draft campaign is left as is; a pause that does not hold goes to review', { skip }, async () => {
  bison.campaigns[0].status = 'active';
  const [j] = await pressAndRun('Pause Campaign');
  assert.equal(j.job.status, 'succeeded', j.job.error);
  assert.deepEqual(j.job.result.paused, [501]);
  assert.equal(bison.campaigns[0].status, 'paused');
  assert.equal(resumes(), 0, 'never resumes');
  assert.equal(camp()[CE.engineStatus], 'Done');

  bison.calls = [];
  const [k] = await pressAndRun('Pause Campaign');
  assert.equal(k.job.status, 'succeeded');
  assert.deepEqual(k.job.result.notRunning, [{ id: 501, status: 'paused' }]);
  assert.ok(!bison.calls.some((x) => x.endsWith('/pause')), 'already paused: no call');

  bison.campaigns[0].status = 'active';
  bison.pauseIgnored = true;
  const [n] = await pressAndRun('Pause Campaign');
  assert.equal(n.job.status, 'needs_review');
  assert.match(n.job.error, /pause did not take effect/);
  assert.equal(camp()[CE.engineStatus], 'Needs Review');
});

// ---------------------------------------------------------------- senders

test('senders on a live campaign: pause, add missing, remove extra, resume; final set = the record; not-connected is a warning only', { skip }, async () => {
  bison.campaigns[0].status = 'active';
  camp()[C['Email Accounts']] = [inbox(2), inbox(3)]; // want 12, 13; has 11, 12
  bison.senderStatus = (id) => (id === '13' ? 'disconnected' : 'connected');
  const [j] = await pressAndRun('Update Senders');
  assert.equal(j.job.status, 'succeeded', j.job.error);
  assert.deepEqual([...bison.campaigns[0].senders].sort(), ['12', '13']);
  assert.equal(bison.campaigns[0].status, 'active', 'resumed after the change');
  const order = bison.calls.filter((x) => /\/(pause|attach-sender-emails|remove-sender-emails|resume)$/.test(x)).map((x) => x.split('/').pop());
  assert.deepEqual(order, ['pause', 'attach-sender-emails', 'remove-sender-emails', 'resume']);
  assert.deepEqual(j.job.result.warnings, ['campaign 501: inbox(es) 13 are not connected in EmailBison']);
  assert.match(String(camp()[CE.engineMessage]), /added 1, removed 1 \(2 inboxes; paused and resumed\)[\s\S]*Warning/);
});

test('senders on a paused campaign: changed without a resume; nothing to change = no calls', { skip }, async () => {
  bison.campaigns[0].status = 'paused';
  camp()[C['Email Accounts']] = [inbox(1), inbox(2), inbox(4)];
  const [j] = await pressAndRun('Update Senders');
  assert.equal(j.job.status, 'succeeded', j.job.error);
  assert.deepEqual([...bison.campaigns[0].senders].sort(), ['11', '12', '14']);
  assert.equal(bison.campaigns[0].status, 'paused');
  assert.equal(resumes(), 0);
  assert.ok(!bison.calls.some((x) => x.endsWith('/pause')));

  bison.calls = [];
  const [k] = await pressAndRun('Update Senders');
  assert.equal(k.job.status, 'succeeded');
  assert.ok(!bison.calls.some((x) => /attach-sender|remove-sender|pause|resume/.test(x)));
  assert.match(k.job.result.message, /already has the selected 3 inboxes/);
});

test('senders: an inbox missing from the EmailBison workspace stops before anything changes', { skip }, async () => {
  bison.campaigns[0].status = 'active';
  bison.workspaceSenders = ['11', '12'];
  camp()[C['Email Accounts']] = [inbox(1), inbox(3)];
  const [j] = await pressAndRun('Update Senders');
  assert.equal(j.job.status, 'failed');
  assert.match(j.job.error, /sender ID\(s\) 13 are not in this EmailBison workspace/);
  assert.ok(!bison.calls.some((x) => /pause|attach|remove/.test(x)));
  assert.equal(bison.campaigns[0].status, 'active');
});

// ---------------------------------------------------------------- top-up

test('top-up from Airtable: KPI math from the record, the list sheet and Final tab, then results written back', { skip }, async () => {
  assert.deepEqual(kpisFrom(camp()), { replyRate: 3, interestedRate: 20, bounceRate: 1.2, progress: 70, counts: { sent: 1000, replies: 30, interested: 6, bounced: 12 } });
  bison.campaigns[0].status = 'active';
  const [j] = await pressAndRun('Top Up Campaign');
  assert.equal(j.job.input.campaignId, 501);
  assert.equal(j.job.input.outputType, 'direct', 'ID + Direct ID = direct');
  assert.deepEqual(j.job.input.source, { sheetId: '1QYLOeUxwDXunQm_KMEYKB_7jW7l47ZQJ8wVVtCZBUd8', tab: 'Final Direct' });
  assert.equal(j.job.input.expectedLeads, 3);
  assert.equal(j.job.input.kpiException, false);
  assert.equal(j.job.status, 'succeeded', j.job.error);
  assert.equal(camp()[CE.topupStatus], 'Completed');
  assert.equal(camp()[CE.topupAdded], 2);
  assert.equal(camp()[CE.topupSkipped], 1);
  assert.equal(camp()[CE.topupFailed], 0);
  assert.ok(camp()[CE.topupLastRun]);
  assert.match(String(camp()[CE.topupMessage]), /2 leads added, 1 already in the campaign/);
  assert.ok(!bison.calls.some((x) => /resume|attach-sender/.test(x)), 'top-up never launches or changes senders');
});

test('top-up rule enforced: interested under 15% of replies stops it (nothing uploaded); high bounce alone does not', { skip }, async () => {
  camp()[CE.interested] = 3; // 10% of 30 replies
  const [j] = await pressAndRun('Top Up Campaign');
  assert.equal(j.job.status, 'failed');
  assert.match(j.job.error, /interested rate 10% of replies is under 15%/);
  assert.equal(bison.leadLists.length, 0);
  assert.equal(camp()[CE.topupStatus], 'Failed');
  assert.equal(camp()[CE.topupFailed], 3);

  await db.query('TRUNCATE jobs, steps, receipts, events RESTART IDENTITY CASCADE');
  Object.assign(camp(), { [CE.interested]: 6, [CE.bounced]: 50 }); // bounce 5%
  const [k] = await pressAndRun('Top Up Campaign');
  assert.equal(k.job.status, 'succeeded', k.job.error);
  assert.match(k.job.result.message, /watch: bounce 5% is 4% or more/);

  // No replies yet: the interested rate is unknown, so no top-up.
  await db.query('TRUNCATE jobs, steps, receipts, events RESTART IDENTITY CASCADE');
  camp()[CE.replies] = 0;
  const [n] = await pressAndRun('Top Up Campaign');
  assert.equal(n.job.status, 'failed');
  assert.match(n.job.error, /interested rate is unknown/);
});

// ---------------------------------------------------------------- build from the campaign

test('Build Campaign pressed on the campaign: the same build jobs as the Lead List press; result shown on the campaign', { skip }, async () => {
  await db.query(`INSERT INTO lead_list_sheets (list_id, kind, sheet_id, tab) VALUES ($1,'companies','sheetMed','Engine Companies')`, [LIST]);
  Object.assign(fake.tables[LEAD_LISTS][LIST], { fldepbn71awSjmZPV: [CAMP], fld8nrebRFL0O8kgj: 'Ready', [F.finalDirect]: 3, [F.finalGeneric]: 0 });
  Object.assign(camp(), { [C['Campaign Status']]: 'Spintax Generated', [C.ID]: null, [C['EmailBison Direct Campaign ID']]: null });
  press('Build Campaign');
  assert.equal(await pollCampaignActions(db, cfg({ liveStages: ['campaign.build'] }), at()), 1);
  const jobs = await jobsOf('campaign.build');
  assert.equal(jobs.length, 1);
  assert.equal(jobs[0].record_id, CAMP);
  assert.deepEqual(jobs[0].input.senderEmailIds, ['11', '12']);
  assert.equal(camp()[CE.engineStatus], 'Queued');
  assert.equal(camp()[CE.engineAction], null);
  assert.match(String(camp()[CE.engineMessage]), /Build Campaign queued.*never launched/);
  assert.equal(camp()[C['Processing Status']], 'Running');
  await db.query(`UPDATE jobs SET status='succeeded', result=$2 WHERE id=$1`, [jobs[0].id, { dryRun: false, campaignId: 777, message: 'campaign 777 built with 3 leads' }]);
  await syncResults(db, at());
  assert.equal(camp()[C.ID], 777);
  assert.equal(camp()[CE.engineStatus], 'Done');
  assert.match(String(camp()[CE.engineMessage]), /Direct: campaign 777 built/);
  assert.equal(fake.tables[LEAD_LISTS][LIST][F.engineStatus], 'Done', 'the list shows it too, as before');

  // Pressed on a child, or with a list linked elsewhere: Failed, nothing queued.
  press('Build Campaign', {}, CHILD_D);
  await pollCampaignActions(db, cfg(), at());
  assert.match(String(camp(CHILD_D)[CE.engineMessage]), /press Build Campaign on the main campaign/);
  press('Build Campaign', {}, SPLIT);
  await pollCampaignActions(db, cfg(), at());
  assert.match(String(camp(SPLIT)[CE.engineMessage]), /linked to a different campaign/);
  assert.equal((await jobsOf('campaign.build')).length, 1);
});

test('one bridge tick handles Campaigns presses too', { skip }, async () => {
  press('Pause Campaign');
  const r = await bridgeTick(db, cfg(), at());
  assert.equal(r.queued, 1);
  assert.equal((await jobsOf('campaign.pause')).length, 1);
});

// ---------------------------------------------------------------- bounce skip

test('Skip Bounce Pause: the scheduler passes the ticked campaigns; the bounce check never pauses them, still lists them to watch', { skip }, async () => {
  camp()[CE.skipBouncePause] = true;
  camp(SPLIT)[CE.skipBouncePause] = true;
  assert.deepEqual(await skipBouncePauseIds(at()), [501, 601, 602]);
  const on = cfg({ bounceCheckEveryMin: 30, bounceCheckWorkspaces: ['dulcy'] });
  const t = Date.UTC(2026, 10, 23, 10, 0, 0);
  assert.equal(await scheduleTick(db, on, t, at()), 1);
  const asked = (fake.fieldsAsked[CAMPAIGNS] ?? []).length;
  assert.equal(await scheduleTick(db, on, t + 60_000, at()), 0);
  assert.equal((fake.fieldsAsked[CAMPAIGNS] ?? []).length, asked, 'same slot: Airtable is not read again');
  const [job] = await jobsOf('bounce.check');
  assert.deepEqual(job.input.skipPauseCampaignIds, [501, 601, 602]);

  // 501: 5% at 40% (would pause), but ticked. 700: same numbers, not ticked → paused.
  bison.campaigns = [
    { ...bisonCampaign(501), status: 'active', bounced: 50, contacted: 1000, progress: 40 } as any,
    { ...bisonCampaign(700), status: 'active', bounced: 50, contacted: 1000, progress: 40 } as any,
  ];
  const j = await settle(on, job.id);
  assert.equal(j.job.status, 'succeeded', j.job.error);
  assert.deepEqual(j.job.result.paused.map((r: any) => r.id), [700]);
  assert.equal(bison.campaigns[0].status, 'active', 'ticked: never paused');
  assert.equal(bison.campaigns[1].status, 'paused');
  const w = j.job.result.watch.find((r: any) => r.id === 501);
  assert.match(w.note, /Skip Bounce Pause is ticked/);
  // Without Airtable configured, the list is empty (as before).
  await db.query('TRUNCATE jobs, steps, receipts, events RESTART IDENTITY CASCADE');
  assert.equal(await scheduleTick(db, on, t), 1);
  assert.deepEqual((await jobsOf('bounce.check'))[0].input.skipPauseCampaignIds, []);
});

test('a bounce check queued by hand with a skip list honours it too', { skip }, async () => {
  bison.campaigns = [{ ...bisonCampaign(501), status: 'active', bounced: 50, contacted: 1000, progress: 40 } as any];
  const q = await enqueue(db, { kind: 'bounce.check', recordId: 'bounce:dulcy', input: { workspace: 'dulcy', skipPauseCampaignIds: [501] }, dryRun: false, maxAttempts: 3, deadlineMs: 60_000 });
  const j = await settle(cfg(), q.job.id);
  assert.equal(j.job.result.paused.length, 0);
  assert.equal(j.job.result.skippedPause[0].id, 501);
  assert.ok(!bison.calls.some((x) => x.endsWith('/pause')));
});

// HQ Round 2 campaigns (Alex 2026-11-27): the Sending accounts box, the Campaign Center and Lead List
// Center buttons (the same fields the Airtable buttons write, owner only, confirm required, a list
// or campaign with a step running refused), new campaigns (campaign plans), plan approvals through
// the plan's own Decisions card, a copy rewrite, the copy view, lead lists newest first with tests
// hidden. Airtable is an in-memory fake; the engine's own bridge then picks the press up. No real
// service is called and nothing is spent.
import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { createPool, migrate, type Db } from '../src/db/pool.js';
import { loadConfig, type Config } from '../src/config.js';
import { createServer } from '../src/http.js';
import { upsertUser } from '../src/hq/auth.js';
import { ACCOUNTS, EA } from '../src/stages/accountHealth.js';
import { EX, _resetDelivCache } from '../src/hq/deliverability.js';
import { CAMPAIGNS_T, KF, LEAD_LISTS_T, LF, LLF, WORKSPACES_T, _resetCampaignsCache, isTest, newestFirst, sectionOf } from '../src/hq/campaigns.js';
import { CX, LX, campaignActions, campaignState, filtersLine, listActions, listNextStep, listState } from '../src/hq/centerActions.js';
import { bucketOf, sendingBox, sendingByClient } from '../src/hq/sendingAccounts.js';
import { DECISIONS, DF } from '../src/decisions/fields.js';
import { CC } from '../src/agents/scribe.js';
import { pollActions } from '../src/airtable/bridge.js';
import { CAMPAIGN_FIELDS } from '../src/campaign/campaignFields.js';

const url = process.env.TEST_DATABASE_URL;
const skip = !url ? 'TEST_DATABASE_URL not set' : false;
const PW = 'correct horse battery staple';
const DAY = 86_400_000;
const ago = (d: number) => new Date(Date.now() - d * DAY).toISOString();
const CFG = { dryRun: true, liveStages: [] as string[] };
/** The EmailBison campaign ID field (campaignFields.ts ID). */
const idField = (id: number) => ({ [CAMPAIGN_FIELDS.ID]: id });

/* ---------- the Sending accounts box (pure) ---------- */
const inbox = (o: Record<string, unknown> = {}) => ({
  id: 'recACC00000000001', email: 'a@x-mail.com', clientKey: 'twentywestmedia', client: 'Twenty West', status: 'healthy', stage: '', connection: 'Connected', warmup: 95,
  dailyLimit: 15, warmupLimit: 30, score: 90, bounce: 1, contacted: 300, warmupOff: false, ...o,
}) as any;

test('sending accounts: one bucket per inbox, worst first (spam, resting, not connected, sending, ready, warming, at risk, free)', () => {
  assert.equal(bucketOf(inbox({ status: 'spam' }), true, false), 'spam', 'spam wins even when still in a live campaign');
  assert.equal(bucketOf(inbox({ stage: 'Replace Domain' }), false, false), 'spam');
  assert.equal(bucketOf(inbox({ status: 'resting' }), true, false), 'resting');
  assert.equal(bucketOf(inbox({ connection: 'Not connected' }), true, false), 'disconnected');
  assert.equal(bucketOf(inbox({ connection: '' }), false, false), 'disconnected', 'unknown connection is not free');
  assert.equal(bucketOf(inbox(), true, false), 'sending');
  assert.equal(bucketOf(inbox({ status: 'risk' }), true, false), 'sending', 'an at-risk inbox in a live campaign is still sending');
  assert.equal(bucketOf(inbox(), false, true), 'ready');
  assert.equal(bucketOf(inbox({ warmup: 55 }), false, false), 'warming');
  assert.equal(bucketOf(inbox({ warmup: null }), false, false), 'free', 'not scored yet counts as free (as Atlas does)');
  assert.equal(bucketOf(inbox({ status: 'risk' }), false, false), 'risk');
  assert.equal(bucketOf(inbox(), false, false), 'free');
});

test('sending accounts: counts, daily capacity vs used, the "nothing is sending" alert, per client', () => {
  const rows = [
    inbox({ id: 'recACC00000000001', email: 'a@x.com' }), inbox({ id: 'recACC00000000002', email: 'b@x.com' }), inbox({ id: 'recACC00000000003', email: 'c@x.com', dailyLimit: 10 }),
    inbox({ id: 'recACC00000000004', email: 'd@x.com', status: 'resting', dailyLimit: 0 }), inbox({ id: 'recACC00000000005', email: 'e@x.com', warmup: 40, dailyLimit: 5 }),
    inbox({ id: 'recACC00000000006', email: 'f@x.com', status: 'spam' }), inbox({ id: 'recACC00000000007', email: 'g@dulcy.io', clientKey: 'dulcy', client: 'Dulcy' }),
  ];
  const camps = [{ id: 'recC1', name: 'TWM - Roofers', status: 'Active', clientKey: 'twentywestmedia', accountIds: ['recACC00000000001', 'recACC00000000006'] },
    { id: 'recC2', name: 'TWM - Built', status: 'Uploaded', clientKey: 'twentywestmedia', accountIds: ['recACC00000000002'] },
    { id: 'recC3', name: 'Old', status: 'Completed', clientKey: 'twentywestmedia', accountIds: ['recACC00000000003'] }];
  const b = sendingBox(rows, camps, { clientKey: 'twentywestmedia', client: 'Twenty West', activeKeys: new Set() });
  assert.equal(b.total, 6);
  assert.deepEqual(b.counts, { sending: 1, ready: 1, free: 1, warming: 1, risk: 0, resting: 1, spam: 1, disconnected: 0 });
  assert.deepEqual(b.capacity, { total: 45, used: 15, free: 10, ready: 15 }, 'spam and resting do not count as capacity; a completed campaign frees its inbox');
  assert.deepEqual(b.accounts.map((a) => a.bucket), ['sending', 'ready', 'free', 'warming', 'resting', 'spam']);
  assert.deepEqual(b.accounts[0].campaigns, ['TWM - Roofers']);
  assert.equal(b.accounts.find((a) => a.bucket === 'spam')!.note, 'still in a live campaign');
  assert.equal(b.alert, '');
  const idle = sendingBox(rows, [], { clientKey: 'twentywestmedia', client: 'Twenty West', activeKeys: new Set() });
  assert.equal(idle.alert, 'Nothing is sending for Twenty West: 3 free inboxes could be.');
  const all = sendingBox(rows, camps, { clientKey: '', client: '', activeKeys: new Set(['twentywestmedia', 'dulcy']) });
  assert.equal(all.total, 7);
  const lines = sendingByClient(rows, camps, [{ key: 'twentywestmedia', name: 'Twenty West' }, { key: 'dulcy', name: 'Dulcy' }, { key: 'empty', name: 'No inboxes' }]);
  assert.deepEqual(lines.map((l) => [l.name, l.sending, l.free]), [['Dulcy', 0, 1], ['Twenty West', 1, 1]], 'clients with nothing sending first; no inboxes = left out');
});

/* ---------- the buttons (pure) ---------- */
const listRec = (f: Record<string, unknown> = {}) => ({ id: 'recLIST0000000001', fields: { [LX.name]: 'Roofers', [LX.client]: ['recWS000000000001'], [LX.icp]: 'US roofers 11-50', ...f } });
const view = (l: ReturnType<typeof listState>, key: string, canAct = true) => listActions(l, canAct, CFG).find((a) => a.key === key)!;

test('lead list buttons: the screen\'s gates, the lock while a step runs, owner only, dry run shown', () => {
  let l = listState(listRec());
  assert.deepEqual([view(l, 'filters').enabled, view(l, 'sample').why], [true, 'Generate filters first.']);
  assert.equal(view(listState(listRec({ [LX.icp]: '' })), 'filters').why, 'Write the targeting sentence (ICP Description) first.');
  assert.equal(view(listState(listRec({ [LX.client]: [] })), 'filters').why, 'Link exactly one client to this list first.');
  assert.equal(view(l, 'filters', false).why, 'Only Alex (owner) can press this.');
  assert.equal(view(l, 'filters').dryRun, true, 'leadlist.filters is not in LIVE_STAGES');
  assert.equal(listActions(l, true, { dryRun: true, liveStages: ['leadlist.filters'] }).find((a) => a.key === 'filters')!.dryRun, false);
  l = listState(listRec({ [LX.filtersJson]: '{"country":["US"]}', [LX.companyGood]: 80, [LX.companies]: 100, [LX.expansionTarget]: 1000 }));
  assert.deepEqual([view(l, 'sample').enabled, view(l, 'approve-sample').enabled, view(l, 'expand').why], [true, true, 'Approve the company sample first.']);
  l = listState(listRec({ [LX.filtersJson]: '{}', [LX.companyGood]: 80, [LX.sampleApproved]: true, [LX.expansionTarget]: 1000 }));
  assert.equal(view(l, 'expand').enabled, true);
  assert.equal(view(l, 'approve-sample').why, 'Already approved.');
  assert.equal(view(l, 'contacts-all').why, 'Approve the contact sample first.');
  const locked = listState(listRec({ [LX.filtersJson]: '{}', [LX.engineStatus]: 'Running' }));
  assert.ok(listActions(locked, true, CFG).filter((a) => a.key !== 'build').every((a) => !a.enabled && a.why === 'A step is running on this list: wait for its result.'), 'every button waits while a step runs');
  assert.equal(listState(listRec({ [LX.engineAction]: 'Expand Companies' })).engineAction, 'Expand Companies');
  const done = listState(listRec({ [LX.filtersJson]: '{}', [LX.finalDirect]: 300, [LX.verifyGood]: 300, [LX.contactGood]: 400, [LX.contactApproved]: true, [LX.companyGood]: 500, [LX.sampleApproved]: true }));
  assert.equal(view(done, 'qa').why, 'Link the list to a campaign first: QA checks the copy\'s variables.');
  assert.equal(view(done, 'build').enabled, false, 'Build Campaign lives in the Campaign Center');
  assert.equal(listNextStep(listState(listRec())), 'Generate filters.');
  assert.equal(listNextStep(done), 'Run automated QA.');
  assert.equal(filtersLine('{"country":["US","CA"],"employee_range":"11-50","x":[]}'), 'country: US, CA · employee_range: 11-50');
});

test('campaign buttons: build / launch / pause / senders / top up gates; Clone, Delete, Sync "come next"', () => {
  const rec = (f: Record<string, unknown>) => ({ id: 'recCAMP0000000001', fields: { [CX.name]: 'TWM - Roofers', ...f } });
  const ready = { id: 'recL', fields: { [LX.stage]: 'Ready', [LX.qa]: 'Passed' } };
  const v = (c: ReturnType<typeof campaignState>, key: string) => campaignActions(c, true, CFG).find((a) => a.key === key)!;
  let c = campaignState(rec({ [CX.lists]: ['recLIST0000000001'], [CX.accounts]: ['recACC00000000001'] }), ready);
  assert.deepEqual([v(c, 'build').enabled, v(c, 'launch').why, v(c, 'pause').why], [true, 'Build the campaign first: it has no EmailBison campaign yet.', 'Not built yet.']);
  assert.equal(v(campaignState(rec({ [CX.lists]: ['recLIST0000000001'] }), ready), 'build').why, 'Pick the sending inboxes first (Campaign Center → Senders).');
  assert.equal(v(campaignState(rec({ [CX.lists]: ['recLIST0000000001'], [CX.accounts]: ['recACC00000000001'] }), { id: 'recL', fields: { [LX.stage]: 'QA' } }), 'build').why, 'The lead list must be Ready with QA Passed first.');
  const withId = campaignState({ id: 'recCAMP0000000001', fields: { ...rec({}).fields, [CX.lists]: ['recLIST0000000001'], [CX.accounts]: ['recACC00000000001'], [CX.status]: 'Uploaded', [CX.stage]: 'Launch Ready', ...idField(612) } }, ready);
  assert.deepEqual(withId.bison, [612]);
  assert.deepEqual([v(withId, 'launch').enabled, v(withId, 'build').why, v(withId, 'pause').why], [true, 'Already built: it has an EmailBison campaign.', 'Not live.']);
  const notApproved = campaignState({ id: 'recCAMP0000000001', fields: { ...rec({}).fields, [CX.status]: 'Uploaded', [CX.stage]: 'Internal Review', ...idField(612) } }, null);
  assert.equal(v(notApproved, 'launch').why, 'Approve the copy first (client approval or the exception).');
  const live = campaignState({ id: 'recCAMP0000000001', fields: { ...rec({}).fields, [CX.status]: 'Active', [CX.stage]: 'Live', ...idField(612) } }, ready);
  assert.deepEqual([v(live, 'pause').enabled, v(live, 'launch').why, v(live, 'topup').why], [true, 'Already live.', 'Pick the Top-up Lead List in Campaign Center first.']);
  const busy = campaignState({ id: 'recCAMP0000000001', fields: { [CX.status]: 'Active', [CX.engineStatus]: 'Queued', ...idField(612) } }, ready);
  assert.equal(v(busy, 'pause').why, 'A step is running on this campaign: wait for its result.');
  const more = campaignActions(c, true, CFG).filter((a) => a.comesNext).map((a) => a.key);
  assert.deepEqual(more, ['pick-inboxes', 'clone', 'sync', 'delete']);
  assert.equal(v(c, 'build').dryRun, true);
});

test('campaigns by stage (as the Campaign Center) and tests by name; lead lists newest first', () => {
  assert.deepEqual([sectionOf('live', 'Internal Review'), sectionOf('building', 'Client Review'), sectionOf('building', 'Changes Requested'), sectionOf('building', 'Build Ready'), sectionOf('building', ''), sectionOf('building', 'Launch Ready')],
    ['live', 'review', 'review', 'build', 'none', 'launch']);
  assert.deepEqual(['NJ Real Estate Test', 'ENGINE TEST - bridge check', 'Roofers - Testimonials', 'Contest winners', 'Test'].map(isTest), [true, true, false, false, true]);
  const rows = [{ added: ago(10), updated: ago(1) }, { added: ago(2), updated: ago(2) }, { added: '', updated: ago(0) }];
  assert.deepEqual([...rows].sort(newestFirst).map((r) => rows.indexOf(r)), [1, 0, 2]);
});

/* ---------- the API ---------- */
let db: Db;
let server: http.Server;
let port = 0;
let tables: Record<string, Record<string, Record<string, unknown>>>;
let writes: { table: string; id?: string; fields: Record<string, unknown> }[];
const memAt = {
  async list(table: string, formula = '') {
    let rows = Object.entries(tables[table] ?? {}).map(([id, f]) => ({ id, fields: { ...f }, createdTime: String(f._created ?? ago(3)) }));
    // The bridge's "pressed" formula, so the bridge only sees pressed rows (the fake ignores every other formula).
    if (/\{Engine Action\} != ''/.test(formula)) rows = rows.filter((r) => r.fields[table === LEAD_LISTS_T ? LX.engineAction : CX.engineAction] && r.fields[table === LEAD_LISTS_T ? LX.runsOnEngine : CX.runsOnEngine]);
    return rows;
  },
  async get(table: string, id: string) { const f = tables[table]?.[id]; return f ? { id, fields: { ...f } } : null; },
  async create(table: string, fields: Record<string, unknown>) { writes.push({ table, fields }); return 'recNEW00000000001'; },
  async update(table: string, id: string, fields: Record<string, unknown>) { writes.push({ table, id, fields }); tables[table] ??= {}; tables[table][id] = { ...(tables[table][id] ?? {}), ...fields }; },
};
function cfg(over: Partial<Config> = {}): Config {
  return { ...loadConfig({ ENGINE_SECRET: 'x'.repeat(40), DATABASE_URL: url ?? 'postgres://x', HQ_SESSION_SECRET: 's'.repeat(40), HQ_HOST: 'hq.test.local' } as NodeJS.ProcessEnv), airtableApiKey: undefined, anthropicApiKey: undefined, ...over };
}
function call(method: string, p: string, cookie?: string, body?: unknown, extra: Record<string, string> = {}): Promise<{ status: number; body: any; text: string; headers: http.IncomingHttpHeaders }> {
  return new Promise((resolve, reject) => {
    const host = `127.0.0.1:${port}`;
    const headers: Record<string, string> = { host, ...extra };
    const data = body === undefined ? undefined : JSON.stringify(body);
    if (data) { headers['content-type'] = 'application/json'; headers.origin = `https://${host}`; }
    if (cookie) headers.cookie = cookie;
    const req = http.request({ host: '127.0.0.1', port, method, path: p, headers }, (res) => {
      const chunks: Buffer[] = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => { const text = Buffer.concat(chunks).toString('utf8'); let x: any = null; try { x = JSON.parse(text); } catch { /* not json */ } resolve({ status: res.statusCode ?? 0, body: x, text, headers: res.headers }); });
    });
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}
async function login(email = 'alex@dulcy.io', password = PW) {
  const r = await call('POST', '/hq/api/auth/login', undefined, { email, password });
  return ([] as string[]).concat(r.headers['set-cookie'] ?? []).map((c) => c.split(';')[0]).find((c) => c.startsWith('__Host-hq_session=')) ?? '';
}
let atlasOn = false;
before(async () => {
  if (skip) return;
  db = createPool(url!); await migrate(db);
  const c = cfg();
  // ATLAS_CAMPAIGNS is read per request from the same object: the test flips it.
  Object.defineProperty(c, 'atlasCampaignsOn', { get: () => atlasOn });
  server = createServer(db, c, { at: memAt as any, webDir: '/nonexistent' });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', () => r()));
  port = (server.address() as AddressInfo).port;
});
after(async () => { if (!skip) { server.close(); await db.end(); } });
beforeEach(async () => {
  tables = {}; writes = []; atlasOn = false; _resetDelivCache(); _resetCampaignsCache();
  if (skip) return;
  await db.query('TRUNCATE hq_users, hq_sessions, hq_login_attempts, jobs, steps, receipts, events, campaign_plans, airtable_jobs, hq_settings_log RESTART IDENTITY CASCADE');
  await upsertUser(db, 'alex@dulcy.io', 'owner', PW, 'Alex');
  await upsertUser(db, 'josh@dulcy.io', 'member', 'josh long password 1', 'Josh');
});

function fixture() {
  const acct = (email: string, id: number, extra: Record<string, unknown> = {}) => ({
    [EA.email]: email, [EA.emailId]: id, [EA.workspaceId]: 7, [EA.client]: ['recWSTWM00000010A'], [EX.connection]: 'Connected', [EX.warmupOn]: true, [EX.lastWarmupCheck]: ago(1),
    [EX.warmupScore]: 97, [EA.dailyLimit]: 15, [EX.warmupLimit]: 30, ...extra,
  });
  tables[WORKSPACES_T] = {
    recWSTWM00000010A: { Name: 'Twenty West Media', ID: '7', Status: 'Active', 'Client Type': 'Paying Client' },
    recWSTWMOLD0010A0: { Name: 'Twenty West Media (Internal)', ID: '8', Status: 'Inactive' },
    recWSLFM00000010A: { Name: 'Lead Flo Marketing', ID: '3', Status: 'Inactive' },
  };
  tables[ACCOUNTS] = {
    recACCA000000001A: acct('a@twm-mail.com', 101),
    recACCB000000001A: acct('b@twm-mail.com', 102),
    recACCC000000001A: acct('c@twm-mail.com', 103, { [EA.stage]: 'Resting 7 Days', [EA.dailyLimit]: 0 }),
    recACCD000000001A: acct('d@twm-mail.com', 104, { [EX.warmupScore]: 60 }),
  };
  tables[CAMPAIGNS_T] = {
    recCAMPTWM000010A: { [KF.name]: 'TWM - Roofers', [KF.status]: 'Active', [KF.stage]: 'Live', [KF.client]: ['recWSTWM00000010A'], [KF.sent]: 400, [KF.contacted]: 400, [KF.emailAccounts]: ['recACCA000000001A'], [KF.lists]: ['recLISTTWM000100A'], ...idField(612) },
    recCAMPNEW000010A: { [KF.name]: 'TWM - Plumbers', [KF.status]: 'Draft', [KF.stage]: 'Internal Review', [KF.client]: ['recWSTWM00000010A'], [KF.lists]: ['recLISTNEW000100A'],
      [CC.review[0].subject]: 'quick question', [CC.review[0].body]: 'Variant 1\nHi {FIRST_NAME}, ...\n\nVariant 2\nHey {FIRST_NAME}, ...', [CC.review[1].body]: 'Following up', [CC.thread[2]]: true },
  };
  tables[LEAD_LISTS_T] = {
    recLISTTWM000100A: { _created: ago(20), [LF.name]: 'Roofers', [LF.stage]: 'Uploaded', [LF.qa]: 'Passed', [LF.finalDirect]: 300, [LLF.client]: ['recWSTWM00000010A'], [LLF.campaigns]: ['recCAMPTWM000010A'] },
    recLISTNEW000100A: { _created: ago(1), [LF.name]: 'Plumbers', [LF.stage]: 'Targeting', [LLF.client]: ['recWSTWM00000010A'], [LLF.campaigns]: ['recCAMPNEW000010A'], [LX.icp]: 'US plumbers 11-50 employees', [LX.filtersJson]: '{"country":["US"]}', [LX.sampleSize]: 100 },
    recLISTTEST00010A: { _created: ago(0.5), [LF.name]: 'NJ Real Estate Test', [LF.stage]: 'Draft', [LLF.client]: ['recWSTWM00000010A'] },
    recLISTOLD000010A: { _created: ago(200), [LF.name]: 'Old roofers', [LF.stage]: 'Ready', [LF.qa]: 'Passed', [LLF.client]: ['recWSTWM00000010A'] },
  };
}

test('API: the Sending accounts box per client and for all active clients', { skip }, async () => {
  fixture();
  const cookie = await login();
  const r = await call('GET', '/hq/api/campaigns/accounts?client=twentywestmedia', cookie);
  assert.equal(r.status, 200, r.text);
  assert.equal(r.body.total, 4);
  assert.deepEqual([r.body.counts.sending, r.body.counts.free, r.body.counts.warming, r.body.counts.resting], [1, 1, 1, 1]);
  assert.deepEqual(r.body.capacity, { total: 45, used: 15, free: 15, ready: 0 });
  assert.deepEqual(r.body.accounts.map((a: any) => [a.email, a.bucket]), [['a@twm-mail.com', 'sending'], ['b@twm-mail.com', 'free'], ['d@twm-mail.com', 'warming'], ['c@twm-mail.com', 'resting']]);
  assert.equal(r.body.accounts[0].campaigns[0], 'TWM - Roofers');
  const all = await call('GET', '/hq/api/campaigns/accounts', cookie);
  assert.deepEqual(all.body.byClient.map((c: any) => [c.name, c.sending, c.free]), [['Twenty West Media', 1, 1]]);
  assert.deepEqual(writes, [], 'reading writes nothing');
});

test('API: lead lists newest first; tests and old finished lists hidden unless asked', { skip }, async () => {
  fixture();
  const cookie = await login();
  const r = await call('GET', '/hq/api/campaigns/lists', cookie);
  assert.equal(r.status, 200, r.text);
  assert.deepEqual(r.body.rows.map((x: any) => x.name), ['Plumbers', 'Roofers']);
  assert.deepEqual([r.body.counts.tests, r.body.counts.old], [1, 1]);
  const t = await call('GET', '/hq/api/campaigns/lists?tests=1&old=1', cookie);
  assert.deepEqual(t.body.rows.map((x: any) => [x.name, x.test, x.old]), [['NJ Real Estate Test', true, false], ['Plumbers', false, false], ['Roofers', false, false], ['Old roofers', false, true]]);
});

test('API: one lead list with its buttons; a press writes exactly what the Airtable button writes; the bridge queues it as a dry run', { skip }, async () => {
  fixture();
  const cookie = await login();
  const d = await call('GET', '/hq/api/campaigns/lists/recLISTNEW000100A', cookie);
  assert.equal(d.status, 200, d.text);
  assert.equal(d.body.list.filters, 'country: US');
  assert.equal(d.body.next, 'Run the company sample (first 100).');
  const sample = d.body.actions.find((a: any) => a.key === 'sample');
  assert.deepEqual([sample.enabled, sample.dryRun, sample.spends], [true, true, 'Up to 100 companies (about $1)']);
  assert.ok(!/airtable\.com/.test(d.text), 'no Airtable links');
  // Member: reads, cannot press.
  const josh = await login('josh@dulcy.io', 'josh long password 1');
  const jd = await call('GET', '/hq/api/campaigns/lists/recLISTNEW000100A', josh);
  assert.equal(jd.body.actions.find((a: any) => a.key === 'sample').why, 'Only Alex (owner) can press this.');
  assert.equal((await call('POST', '/hq/api/campaigns/lists/recLISTNEW000100A/action', josh, { action: 'sample', confirm: true })).status, 403);
  // Owner: confirm required; then the exact screen write.
  const no = await call('POST', '/hq/api/campaigns/lists/recLISTNEW000100A/action', cookie, { action: 'sample' });
  assert.equal(no.status, 400);
  assert.match(no.body.error, /confirm: true is required/);
  assert.deepEqual(writes, []);
  const ok = await call('POST', '/hq/api/campaigns/lists/recLISTNEW000100A/action', cookie, { action: 'sample', confirm: true });
  assert.equal(ok.status, 200, ok.text);
  assert.equal(ok.body.dryRun, true);
  assert.deepEqual(writes, [{ table: LEAD_LISTS_T, id: 'recLISTNEW000100A', fields: { [LX.runsOnEngine]: true, [LX.engineAction]: 'Run Company Sample' } }], 'Runs on Engine + Engine Action, nothing else (no stage, no status)');
  // Pressed = locked until the engine answers (the screen's lock).
  const again = await call('POST', '/hq/api/campaigns/lists/recLISTNEW000100A/action', cookie, { action: 'filters', confirm: true });
  assert.equal(again.status, 409);
  assert.match(again.body.error, /A step is running/);
  const log = (await db.query(`SELECT actor, action, row_id FROM hq_settings_log`)).rows;
  assert.deepEqual(log, [{ actor: 'Alex', action: 'center:sample', row_id: 'recLISTNEW000100A' }]);
  // The engine's own bridge picks the press up: the same path as the Airtable button.
  const queued = await pollActions(db, cfg(), memAt as any);
  assert.equal(queued, 1);
  const job = (await db.query(`SELECT kind, record_id, dry_run FROM jobs`)).rows[0];
  assert.deepEqual(job, { kind: 'leadlist.sample', record_id: 'recLISTNEW000100A', dry_run: true }, 'queued as a dry run (leadlist.sample not in LIVE_STAGES)');
  assert.equal(tables[LEAD_LISTS_T].recLISTNEW000100A[LX.engineAction], null, 'the bridge cleared the press');
  // A tick-only button writes only its tick; TAM writes a request.
  tables[LEAD_LISTS_T].recLISTNEW000100A[LX.engineStatus] = 'Done'; tables[LEAD_LISTS_T].recLISTNEW000100A[LX.processing] = 'Completed';
  tables[LEAD_LISTS_T].recLISTNEW000100A[LX.companyGood] = 85;
  writes = [];
  assert.equal((await call('POST', '/hq/api/campaigns/lists/recLISTNEW000100A/action', cookie, { action: 'approve-sample', confirm: true })).status, 200);
  assert.deepEqual(writes[0].fields, { [LX.sampleApproved]: true });
  assert.equal((await call('POST', '/hq/api/campaigns/lists/recLISTNEW000100A/action', cookie, { action: 'tam', confirm: true })).status, 200);
  const tam = JSON.parse(String(writes[1].fields[LX.tamCheck]));
  assert.deepEqual([tam.status, tam.source], ['requested', '{"country":["US"]}']);
  // Viewing as member is read only (server-wide rule).
  assert.equal((await call('POST', '/hq/api/campaigns/lists/recLISTNEW000100A/action', cookie, { action: 'expand', confirm: true }, { 'x-hq-view': 'member' })).status, 403);
});

test('API: campaign buttons (Pause on a live campaign), copy view, refused when not ready', { skip }, async () => {
  fixture();
  const cookie = await login();
  const c = await call('GET', '/hq/api/campaigns/recCAMPTWM000010A/center', cookie);
  assert.equal(c.status, 200, c.text);
  assert.deepEqual(c.body.actions.filter((a: any) => a.enabled).map((a: any) => a.key), ['pause', 'senders']);
  assert.equal((await call('POST', '/hq/api/campaigns/recCAMPTWM000010A/action', cookie, { action: 'launch', confirm: true })).body.error, 'Already live.');
  assert.equal((await call('POST', '/hq/api/campaigns/recCAMPTWM000010A/action', cookie, { action: 'clone', confirm: true })).body.error, 'That button comes next in HQ.');
  const r = await call('POST', '/hq/api/campaigns/recCAMPTWM000010A/action', cookie, { action: 'pause', confirm: true });
  assert.equal(r.status, 200, r.text);
  assert.deepEqual(writes, [{ table: CAMPAIGNS_T, id: 'recCAMPTWM000010A', fields: { [CX.runsOnEngine]: true, [CX.engineAction]: 'Pause Campaign' } }]);
  const copy = await call('GET', '/hq/api/campaigns/recCAMPNEW000010A/copy', cookie);
  assert.equal(copy.status, 200, copy.text);
  assert.deepEqual(copy.body.review.map((x: any) => [x.step, x.subject, x.thread]), [[1, 'quick question', false], [2, '', true]]);
  assert.equal(copy.body.plan, null);
  assert.deepEqual(copy.body.comesNext.map((x: any) => x.key), ['write', 'send-review'], 'a hand-made campaign: writing and sending for review come next');
  const build = await call('POST', '/hq/api/campaigns/recCAMPNEW000010A/action', cookie, { action: 'build', confirm: true });
  assert.equal(build.status, 409);
  assert.equal(build.body.error, 'The lead list must be Ready with QA Passed first.');
});

test('API: New campaign = a campaign plan; approvals through its Decisions card; a rewrite with notes', { skip }, async () => {
  fixture();
  const cookie = await login();
  const off = await call('POST', '/hq/api/campaigns/plans', cookie, { client: 'twentywestmedia', confirm: true });
  assert.equal(off.status, 409);
  assert.match(off.body.error, /ATLAS_CAMPAIGNS=on/);
  atlasOn = true;
  assert.equal((await call('POST', '/hq/api/campaigns/plans', cookie, { client: 'twentywestmedia' })).status, 400, 'confirm required');
  assert.equal((await call('POST', '/hq/api/campaigns/plans', cookie, { client: 'leadflomarketing', confirm: true })).status, 400, 'inactive client refused');
  const josh = await login('josh@dulcy.io', 'josh long password 1');
  assert.equal((await call('POST', '/hq/api/campaigns/plans', josh, { client: 'twentywestmedia', confirm: true })).status, 403);
  const r = await call('POST', '/hq/api/campaigns/plans', cookie, { client: 'twentywestmedia', confirm: true });
  assert.equal(r.status, 200, r.text);
  const plan = (await db.query(`SELECT id, trigger_key, ws_rec, client, state FROM campaign_plans`)).rows[0];
  assert.deepEqual([plan.ws_rec, plan.client, plan.state], ['recWSTWM00000010A', 'Twenty West Media', 'planning'], 'the active workspace record of the client');
  assert.match(plan.trigger_key, /^hq:recWSTWM00000010A:/);
  const twice = await call('POST', '/hq/api/campaigns/plans', cookie, { client: 'twentywestmedia', confirm: true });
  assert.equal(twice.status, 409);
  assert.match(twice.body.error, /already has a plan being made/);
  // Approval 1: the plan's Decisions card.
  tables[DECISIONS] = { recDEC0000000001A: { [DF.title]: 'Approve campaign plan', [DF.agent]: 'Atlas', [DF.status]: 'Waiting', [DF.action]: 'Approve Campaign Plan', [DF.actionInput]: '{"planId":1}' } };
  await db.query(`UPDATE campaign_plans SET state='approval1', decision_rec='recDEC0000000001A', plan='{"campaign_name":"[TWM] Plumbers","move":"top_off","icp":"US plumbers","angles":[{"name":"Missed calls","tests":"pain point","hypothesis":"x"}],"questions_for_alex":["Proof?"]}' WHERE id=$1`, [plan.id]);
  const list = await call('GET', '/hq/api/campaigns/plans?client=twentywestmedia', cookie);
  assert.equal(list.status, 200, list.text);
  const p = list.body.plans[0];
  assert.deepEqual([p.waiting, p.campaignName, p.move, p.questions], ['plan', '[TWM] Plumbers', 'top off', ['Proof?']]);
  assert.deepEqual(p.actions.filter((a: any) => a.enabled).map((a: any) => a.key), ['approve-plan', 'reject-plan']);
  writes = [];
  const ap = await call('POST', `/hq/api/campaigns/plans/${plan.id}/action`, cookie, { action: 'approve-plan', confirm: true });
  assert.equal(ap.status, 200, ap.text);
  assert.equal(writes[0].table, DECISIONS);
  assert.equal(writes[0].fields[DF.status], 'Approved', 'the same decide() as the Decisions screen; the decisions loop starts campaign.plan_approved');
  assert.equal((await call('POST', `/hq/api/campaigns/plans/${plan.id}/action`, cookie, { action: 'approve-copy', confirm: true })).status, 409, 'not waiting for the copy');
  // Approval 2 → rewrite with notes: back to Scribe, the old card answered.
  tables[DECISIONS].recDEC0000000002A = { [DF.title]: 'Approve copy + list', [DF.agent]: 'Scribe', [DF.status]: 'Waiting', [DF.action]: 'Approve Campaign Copy' };
  await db.query(`UPDATE campaign_plans SET state='approval2', decision2_rec='recDEC0000000002A', copy_state='ready', campaign_rec='recCAMPNEW000010A' WHERE id=$1`, [plan.id]);
  assert.equal((await call('POST', `/hq/api/campaigns/plans/${plan.id}/action`, cookie, { action: 'rewrite', confirm: true, notes: '' })).status, 400, 'notes needed');
  const rw = await call('POST', `/hq/api/campaigns/plans/${plan.id}/action`, cookie, { action: 'rewrite', confirm: true, notes: 'Shorter Email 1, lead with the missed-calls number' });
  assert.equal(rw.status, 200, rw.text);
  const after = (await db.query(`SELECT state, copy_state, copy_round, copy_feedback FROM campaign_plans WHERE id=$1`, [plan.id])).rows[0];
  assert.deepEqual(after, { state: 'approval2_wait', copy_state: 'queued', copy_round: 2, copy_feedback: 'Shorter Email 1, lead with the missed-calls number' }, 'the CLI campaign-copy path');
  assert.equal(tables[DECISIONS].recDEC0000000002A[DF.status], 'Rejected', 'the old approval 2 card is answered');
  // The campaign page shows its plan.
  const center = await call('GET', '/hq/api/campaigns/recCAMPNEW000010A/center', cookie);
  assert.equal(center.body.plan.id, plan.id);
  assert.equal(center.body.plan.actions.find((a: any) => a.key === 'rewrite').why, 'Scribe is already writing it.');
});

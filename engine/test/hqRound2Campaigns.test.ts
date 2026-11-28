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
import { CX, LX, campaignActions, campaignState, filtersLine, listActions, listNextStep, listState, signatureFor, splitVersions, unescapeCopy } from '../src/hq/centerActions.js';
import { bucketOf, campaignSenderState, isWarming, lastTestByClient, placementOf, sendingBox, sendingByClient, WARMUP_START } from '../src/hq/sendingAccounts.js';
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

test('sending accounts: the Airtable Campaign Center states (disconnected, sending, reserved next, releasing soon, warming, available)', () => {
  const w = (o: Partial<{ sending: boolean; queued: boolean; releasing: boolean; warming: boolean }> = {}) => ({ sending: false, queued: false, releasing: false, warming: false, ...o });
  assert.equal(bucketOf(inbox({ connection: 'Not connected' }), w({ sending: true })), 'disconnected', 'disconnected wins');
  assert.equal(bucketOf(inbox({ connection: '' }), w()), 'disconnected', 'unknown connection is not available');
  assert.equal(bucketOf(inbox(), w({ sending: true, queued: true, warming: true })), 'sending');
  assert.equal(bucketOf(inbox(), w({ queued: true, releasing: true })), 'reserved', 'reserved next beats releasing soon');
  assert.equal(bucketOf(inbox(), w({ releasing: true, warming: true })), 'releasing');
  assert.equal(bucketOf(inbox(), w({ warming: true })), 'warming');
  assert.equal(bucketOf(inbox({ status: 'spam' }), w()), 'available', 'health is not part of this summary (Airtable shows it the same way)');
  assert.equal(bucketOf(inbox(), w()), 'available');
  // A campaign as the Airtable screen reads it.
  assert.deepEqual(campaignSenderState({ status: 'Active', stage: 'Live', progress: 0.3 }), { finished: false, sending: true, releasing: false, queued: false });
  assert.deepEqual(campaignSenderState({ status: 'Active', progress: 0.6 }), { finished: false, sending: false, releasing: true, queued: false });
  assert.deepEqual(campaignSenderState({ status: 'Draft', stage: 'Paused', progress: 0.1 }), { finished: false, sending: true, releasing: false, queued: false }, 'a paused stage is still live');
  assert.deepEqual(campaignSenderState({ status: 'Uploaded', stage: '' }), { finished: false, sending: false, releasing: false, queued: true });
  assert.deepEqual(campaignSenderState({ status: 'Spintax Generated', stage: 'Build Ready' }), { finished: false, sending: false, releasing: false, queued: true });
  assert.equal(campaignSenderState({ status: 'Emails Generated', stage: 'Approved' }).queued, false, 'approved copy alone does not reserve inboxes');
  assert.equal(campaignSenderState({ status: 'Active', progress: 100 }).finished, true, '100% sent = finished');
  assert.equal(campaignSenderState({ status: 'Completed' }).finished, true);
  // Warming = warm-up started under 14 days ago.
  const now = Date.parse('2026-11-28T12:00:00Z');
  assert.deepEqual(['2026-11-20', '2026-11-14', '2026-11-15', '2026-12-01', '', 'junk'].map((d) => isWarming(d, now)), [true, false, true, false, false, false]);
});

test('sending accounts: counts as Airtable (warming overlaps), daily capacity vs used, the "nothing is sending" alert, per client', () => {
  const now = Date.parse('2026-11-28T12:00:00Z');
  const rows = [
    inbox({ id: 'recACC00000000001', email: 'a@x.com' }), inbox({ id: 'recACC00000000002', email: 'b@x.com' }), inbox({ id: 'recACC00000000003', email: 'c@x.com', dailyLimit: 10 }),
    inbox({ id: 'recACC00000000004', email: 'd@x.com', status: 'resting', dailyLimit: 0 }), inbox({ id: 'recACC00000000005', email: 'e@x.com', dailyLimit: 5 }),
    inbox({ id: 'recACC00000000006', email: 'f@x.com', connection: 'Disconnected' }), inbox({ id: 'recACC00000000007', email: 'g@dulcy.io', clientKey: 'dulcy', client: 'Dulcy' }),
    inbox({ id: 'recACC00000000008', email: 'h@x.com' }),
  ];
  const camps = [{ id: 'recC1', name: 'TWM - Roofers', status: 'Active', stage: 'Live', progress: 0.2, clientKey: 'twentywestmedia', accountIds: ['recACC00000000001', 'recACC00000000006'] },
    { id: 'recC2', name: 'TWM - Built', status: 'Uploaded', stage: 'Launch Ready', progress: 0, clientKey: 'twentywestmedia', accountIds: ['recACC00000000002'] },
    { id: 'recC3', name: 'Old', status: 'Completed', clientKey: 'twentywestmedia', accountIds: ['recACC00000000003'] },
    { id: 'recC4', name: 'TWM - Nearly done', status: 'Active', stage: 'Live', progress: 0.75, clientKey: 'twentywestmedia', accountIds: ['recACC00000000008'] }];
  const warmupStart = new Map([['recACC00000000005', '2026-11-25'], ['recACC00000000002', '2026-11-26'], ['recACC00000000003', '2026-10-01']]);
  const b = sendingBox(rows, camps, { clientKey: 'twentywestmedia', client: 'Twenty West', activeKeys: new Set(), warmupStart, now });
  assert.equal(b.total, 7);
  assert.deepEqual(b.counts, { available: 2, sending: 1, releasing: 1, reserved: 1, disconnected: 1, warming: 2 }, 'the reserved inbox is warming too: counted in both, as in Airtable');
  assert.deepEqual(b.capacity, { total: 60, used: 30, free: 10, ready: 15 }, 'disconnected is not capacity; a completed campaign frees its inbox');
  assert.deepEqual(b.accounts.map((a) => [a.email, a.bucket]), [['c@x.com', 'available'], ['d@x.com', 'available'], ['a@x.com', 'sending'], ['h@x.com', 'releasing'], ['b@x.com', 'reserved'], ['f@x.com', 'disconnected'], ['e@x.com', 'warming']]);
  assert.deepEqual(b.accounts.find((a) => a.email === 'a@x.com')!.campaigns, ['TWM - Roofers']);
  assert.equal(b.accounts.find((a) => a.email === 'd@x.com')!.note, 'resting (spam protocol)');
  assert.equal(b.accounts.find((a) => a.email === 'b@x.com')!.warming, true);
  assert.equal(b.alert, '');
  const idle = sendingBox(rows, [], { clientKey: 'twentywestmedia', client: 'Twenty West', activeKeys: new Set(), now });
  assert.equal(idle.alert, 'Nothing is sending for Twenty West: 6 available inboxes could be.');
  const all = sendingBox(rows, camps, { clientKey: '', client: '', activeKeys: new Set(['twentywestmedia', 'dulcy']), now });
  assert.equal(all.total, 8);
  const lines = sendingByClient(rows, camps, [{ key: 'twentywestmedia', name: 'Twenty West' }, { key: 'dulcy', name: 'Dulcy' }, { key: 'empty', name: 'No inboxes' }], warmupStart, now);
  assert.deepEqual(lines.map((l) => [l.name, l.counts.sending, l.counts.available]), [['Dulcy', 0, 1], ['Twenty West', 1, 2]], 'clients with nothing sending first; no inboxes = left out');
});

test('placement cell: a score with its date, "not in the last test", or "Not tested" (never a blank)', () => {
  assert.deepEqual(placementOf({ score: 92, scoreAt: '2026-11-27' }, '2026-11-27'), { text: '92%', why: 'Tested 11/27.' });
  assert.deepEqual(placementOf({ score: 80.4, scoreAt: '2026-11-20' }, '2026-11-27'), { text: '80% · 11/20', why: 'No 11/27 score yet (EmailGuard may still be testing it): this is its 11/20 score.' });
  assert.equal(placementOf({ score: null, scoreAt: '' }, '2026-11-27').text, 'Not tested');
  assert.match(placementOf({ score: null, scoreAt: '' }, '2026-11-27').why, /last 21 days/);
  assert.match(placementOf({ score: 70, scoreAt: '' }, '2026-11-27').why, /older test/);
  assert.deepEqual([...lastTestByClient([{ clientKey: 'dulcy', scoreAt: '2026-11-20' }, { clientKey: 'dulcy', scoreAt: '2026-11-27' }, { clientKey: 'twm', scoreAt: '' }])], [['dulcy', '2026-11-27']]);
  const rows = [inbox({ id: 'recACC00000000001', score: 90, scoreAt: '2026-11-27' }), inbox({ id: 'recACC00000000002', score: 85, scoreAt: '2026-11-20' }), inbox({ id: 'recACC00000000003', score: null, scoreAt: '' })];
  const b = sendingBox(rows, [], { clientKey: 'twentywestmedia', client: 'Twenty West', activeKeys: new Set() });
  assert.deepEqual(b.accounts.map((a) => a.placement.text), ['90%', '85% · 11/20', 'Not tested']);
});

test('copy view helpers: Markdown escapes removed, "Variant N" split into versions, the build\'s signature and P.S.', () => {
  assert.equal(unescapeCopy('Hi {FIRST\\_NAME} at {COMPANY\\_NAME}, 1\\. ok'), 'Hi {FIRST_NAME} at {COMPANY_NAME}, 1. ok');
  assert.deepEqual(splitVersions('Variant 1\nHi {FIRST_NAME},\n\nOne.\n\nVariant 2\nHey {FIRST_NAME},\n\nTwo.'), [{ version: 1, body: 'Hi {FIRST_NAME},\n\nOne.' }, { version: 2, body: 'Hey {FIRST_NAME},\n\nTwo.' }]);
  assert.deepEqual(splitVersions('Just one body.'), [{ version: 1, body: 'Just one body.' }]);
  assert.deepEqual(splitVersions(''), []);
  const sig = signatureFor('Hi {FIRST_NAME},\n\nWorth a chat?', { brandName: 'Dulcy', senderTitle: 'Founder' });
  assert.ok(sig.startsWith('--\n{Best regards|'), sig);
  assert.match(sig, /\{SENDER_FULL_NAME\}\nFounder, Dulcy\n\n\{P\.S\.\|P\.s\.\|p\.s\.\} or tell me to pound sand/);
  assert.equal(signatureFor('Hi,\n\nWorth a chat?\n\nBest regards,\n{SENDER_FULL_NAME}\n\nP.S. Or tell me to pound sand...', {}), '', 'a body with its own sign-off and P.S. gets nothing added');
});

/* ---------- the buttons (pure) ---------- */
const listRec = (f: Record<string, unknown> = {}) => ({ id: 'recLIST0000000001', fields: { [LX.name]: 'Roofers', [LX.client]: ['recWS000000000001'], [LX.icp]: 'US roofers 11-50', ...f } });
const view = (l: ReturnType<typeof listState>, key: string, canAct = true) => listActions(l, canAct, CFG).find((a) => a.key === key)!;

test('lead list buttons: the screen\'s gates, the lock while a step runs, owner only, dry run shown', () => {
  let l = listState(listRec());
  assert.deepEqual([view(l, 'filters').enabled, view(l, 'sample').why], [true, 'Generate filters first.']);
  assert.equal(view(listState(listRec({ [LX.icp]: '' })), 'filters').why, 'Write the targeting sentence (ICP Description) first.');
  assert.equal(view(listState(listRec({ [LX.client]: [] })), 'filters').why, 'Link exactly one client to this list first.');
  assert.equal(view(l, 'filters', false).why, 'Only Alex can press this.');
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

test('campaign buttons: build / launch / pause / senders / top up gates; nothing "comes next" (center parity built them)', () => {
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
  assert.deepEqual(more, [], 'pick inboxes, Clone, Delete and Sync are built (centerParity.ts)');
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
    recACCD000000001A: acct('d@twm-mail.com', 104, { [EX.warmupScore]: 60, [WARMUP_START]: ago(3).slice(0, 10) }),
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
  assert.deepEqual(r.body.counts, { available: 2, sending: 1, releasing: 0, reserved: 0, disconnected: 0, warming: 1 }, 'the Airtable chips; resting is not part of the summary');
  assert.deepEqual(r.body.buckets.map((b: any) => b.label), ['Available', 'Sending', 'Releasing Soon', 'Reserved Next', 'Disconnected', 'Warming'], 'Airtable\'s names and order');
  assert.deepEqual(r.body.capacity, { total: 45, used: 15, free: 15, ready: 0 });
  assert.deepEqual(r.body.accounts.map((a: any) => [a.email, a.bucket]), [['b@twm-mail.com', 'available'], ['c@twm-mail.com', 'available'], ['a@twm-mail.com', 'sending'], ['d@twm-mail.com', 'warming']]);
  assert.equal(r.body.accounts[2].campaigns[0], 'TWM - Roofers');
  assert.equal(r.body.accounts[1].note, 'resting (spam protocol)');
  assert.ok(r.body.accounts.every((a: any) => a.placement.text), 'every inbox has a placement cell');
  const all = await call('GET', '/hq/api/campaigns/accounts', cookie);
  assert.deepEqual(all.body.byClient.map((c: any) => [c.name, c.counts.sending, c.counts.available]), [['Twenty West Media', 1, 2]]);
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
  assert.equal(jd.body.actions.find((a: any) => a.key === 'sample').why, 'Only Alex can press this.');
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
  const list = await call('GET', '/hq/api/campaigns', cookie);
  assert.deepEqual(list.body.rows.map((r: any) => [r.name, r.section, r.how ?? null]).sort(), [['TWM - Plumbers', 'internal', null], ['TWM - Roofers', 'live', 'time']], 'by stage; Today\'s group (400 sent = needs more time) for ?how=');
  assert.deepEqual(list.body.sections.map((s: any) => s.key), ['live', 'launch', 'build', 'review', 'internal', 'draft', 'none']);
  const c = await call('GET', '/hq/api/campaigns/recCAMPTWM000010A/center', cookie);
  assert.equal(c.status, 200, c.text);
  assert.deepEqual(c.body.actions.filter((a: any) => a.enabled).map((a: any) => a.key), ['pause', 'senders']);
  assert.equal((await call('POST', '/hq/api/campaigns/recCAMPTWM000010A/action', cookie, { action: 'launch', confirm: true })).body.error, 'Already live.');
  assert.equal((await call('POST', '/hq/api/campaigns/recCAMPTWM000010A/action', cookie, { action: 'clone', confirm: true })).body.error, 'Clone is on the campaign\'s More tab.');
  const r = await call('POST', '/hq/api/campaigns/recCAMPTWM000010A/action', cookie, { action: 'pause', confirm: true });
  assert.equal(r.status, 200, r.text);
  assert.deepEqual(writes, [{ table: CAMPAIGNS_T, id: 'recCAMPTWM000010A', fields: { [CX.runsOnEngine]: true, [CX.engineAction]: 'Pause Campaign' } }]);
  const copy = await call('GET', '/hq/api/campaigns/recCAMPNEW000010A/copy', cookie);
  assert.equal(copy.status, 200, copy.text);
  assert.deepEqual(copy.body.review.map((x: any) => [x.step, x.subject, x.thread]), [[1, 'quick question', false], [2, '', true]]);
  assert.deepEqual(copy.body.review[0].versions.map((v: any) => [v.version, v.body]), [[1, 'Hi {FIRST_NAME}, ...'], [2, 'Hey {FIRST_NAME}, ...']], 'one email per version');
  assert.match(copy.body.review[0].versions[0].signature, /^--\n\{Best regards\|[^}]*\},\n\{SENDER_FULL_NAME\}/, 'the signature the build adds');
  assert.equal(copy.body.plan, null);
  assert.deepEqual(copy.body.comesNext, [], 'a hand-made campaign: its copy is written and sent for approval on the Copy tab');
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

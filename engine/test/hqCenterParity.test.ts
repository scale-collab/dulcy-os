// HQ center parity (Alex 2026-11-28: "make sure the full implementation of the campaign and lead list
// center"). Every new HQ route writes exactly what the Airtable Campaign Center / Lead List Center
// writes (same fields, same values, same webhook body) and nothing else: never an engine stage.
// Airtable and fetch are in-memory fakes: no live launch, pause, buy, EmailBison or Airtable write.
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
import { CAMPAIGNS_T, KF, LEAD_LISTS_T, LF, LLF, WORKSPACES_T, _resetCampaignsCache } from '../src/hq/campaigns.js';
import { CX, LX } from '../src/hq/centerActions.js';
import { CAMPAIGN_EDIT, CF, CLONE_FIELDS, LIST_EDIT, LL, TOP_UP_COPY_FIELDS, addWeekdayHours, approvalOf, checkEdits, checkValue, clientPrefixed, manualQaUpdate, parseReviewVariants, seqField, sequenceFromReview } from '../src/hq/centerParity.js';
import { CC } from '../src/agents/scribe.js';
import { CAMPAIGN_FIELDS } from '../src/campaign/campaignFields.js';

const url = process.env.TEST_DATABASE_URL;
const skip = !url ? 'TEST_DATABASE_URL not set' : false;
const PW = 'correct horse battery staple';
const DAY = 86_400_000;
const ago = (d: number) => new Date(Date.now() - d * DAY).toISOString();

/* ---------- pure: the screens' own helpers ---------- */
test('field checks: every kind validated; unknown keys refused; JSON saved as the screen formats it', () => {
  assert.deepEqual(checkValue(CAMPAIGN_EDIT.maxEmails, 150), { ok: true, value: 150 });
  assert.equal(checkValue(CAMPAIGN_EDIT.maxEmails, -1).ok, false);
  assert.equal(checkValue(CAMPAIGN_EDIT.startTime, '9:00').ok, false, 'HH:MM only');
  assert.deepEqual(checkValue(CAMPAIGN_EDIT.startTime, '09:05'), { ok: true, value: '09:05' });
  assert.equal(checkValue(CAMPAIGN_EDIT.timezone, 'America/Chicago').ok, false, 'only the select\'s choices');
  assert.deepEqual(checkValue(CAMPAIGN_EDIT.daysBetween, '3'), { ok: true, value: '3' });
  assert.equal(checkValue(CAMPAIGN_EDIT.monday, 'yes').ok, false);
  assert.deepEqual(checkValue(CAMPAIGN_EDIT.launchDate, ''), { ok: true, value: null }, 'empty clears');
  assert.equal(checkValue(CAMPAIGN_EDIT.launchDate, '12/4').ok, false);
  assert.equal(checkValue(CAMPAIGN_EDIT.name, 'a\nb').ok, false, 'one line');
  assert.equal(checkValue(LIST_EDIT.filters, '[1]').ok, false, 'a JSON object');
  assert.deepEqual(checkValue(LIST_EDIT.filters, '{"country":["US"]}'), { ok: true, value: '{\n  "country": [\n    "US"\n  ]\n}' });
  assert.deepEqual(checkValue(LIST_EDIT.segProviders, ['Proofpoint', 'Proofpoint']), { ok: true, value: ['Proofpoint'] });
  assert.equal(checkValue(LIST_EDIT.segProviders, ['Gmail']).ok, false);
  assert.equal(checkValue(LIST_EDIT.sheet, 'https://evil.example/x').ok, false, 'a Google Sheets link only');
  const bad = checkEdits(CAMPAIGN_EDIT, { status: 'Active' });
  assert.deepEqual(bad, { ok: false, error: 'status cannot be edited here' }, 'never a status, stage or engine field');
  assert.equal(checkEdits(CAMPAIGN_EDIT, { stage: 'Live' }).ok, false);
  assert.equal(checkEdits(LIST_EDIT, { stage: 'Ready' }).ok, false);
  assert.equal(checkEdits(LIST_EDIT, { qa: 'Passed' }).ok, false, 'QA goes through the manual QA gate only');
  const okEdit = checkEdits(CAMPAIGN_EDIT, { subject1: 'quick question', thread2: true });
  assert.deepEqual(okEdit, { ok: true, fields: { [CC.review[0].subject]: 'quick question', [CC.thread[2]]: true }, labels: ['Email 1 subject', 'Email 2 thread reply'] });
  // No engine field can be reached through an edit.
  const editable = new Set([...Object.values(CAMPAIGN_EDIT), ...Object.values(LIST_EDIT)].map((d) => d.id));
  for (const k of [CX.engineAction, CX.runsOnEngine, CX.status, CX.stage, LX.engineAction, LX.runsOnEngine, LX.stage, LX.qa, CF.bisonAction, CF.createSpintax]) assert.ok(!editable.has(k), k);
});

test('the Campaign Center\'s Variant parser, sequence refresh, approval reading, name prefix and review clock', () => {
  assert.deepEqual(parseReviewVariants('Variant 1\nHi there\n\nVariant 2: Hey\nmore', 'x'), { structured: true, values: ['Hi there', 'Hey\nmore'] });
  assert.deepEqual(parseReviewVariants('Just one body', 'x'), { structured: false, values: ['Just one body'] });
  assert.throws(() => parseReviewVariants('Variant 1\na\nVariant 3\nb', 'Email 1 body'), /sequential from Variant 1/);
  const f = { [CC.review[0].subject]: 'Variant A: hello\nVariant B: hey', [CC.review[0].body]: 'Variant 1\nBody one\nVariant 2\nBody two', [CC.review[1].body]: 'Follow up' };
  const r = sequenceFromReview(f);
  assert.deepEqual(r.counts, { 1: 2, 2: 1 });
  assert.equal(r.update[seqField(1, 1).body], 'Body one');
  assert.equal(r.update[seqField(1, 2).subject], 'hey');
  assert.equal(r.update[seqField(2, 1).body], 'Follow up');
  assert.equal(r.update[CC.variants[0]], '2');
  assert.equal(seqField(1, 1).body, CAMPAIGN_FIELDS['Campaign Body 1 Version 1'], 'the screen\'s name order');
  assert.throws(() => sequenceFromReview({ [CC.review[0].subject]: 'Variant 1\na\nVariant 2\nb', [CC.review[0].body]: 'Variant 1\nx\nVariant 2\ny\nVariant 3\nz' }), /2 labelled subjects but 3 labelled bodies/);
  assert.throws(() => sequenceFromReview({}), /No approved Email 1–4 review copy/);
  assert.deepEqual(approvalOf({ [CC.clientFeedback]: ['Approve Campaign'] }), { byDulcy: false, approved: true, changes: false, decision: 'Approve Campaign' });
  assert.equal(approvalOf({ [CC.clientFeedback]: 'Request Changes' }).changes, true);
  assert.equal(approvalOf({ [CC.approvalSource]: 'Internal approval exception', [CC.clientFeedback]: 'Approve Campaign' }).approved, false);
  assert.equal(clientPrefixed('Twenty West', '[Old] Roofers TX'), '[Twenty West] Roofers TX');
  // Friday 10:00 ET + 48 weekday hours = Tuesday 10:00 ET (the weekend does not count).
  const fri = new Date('2026-11-27T15:00:00Z');
  assert.equal(addWeekdayHours(fri, 48).toISOString(), '2026-12-01T15:00:00.000Z');
  // Clone copies the reusable build only: never the lead list, inboxes, EmailBison IDs, results or action flags.
  for (const k of [CX.lists, CX.accounts, CX.topupList, CF.bisonId, KF.sent, CF.bisonAction, CF.createSpintax, CX.engineAction, CX.status, CX.stage]) assert.ok(!CLONE_FIELDS.includes(k), k);
  assert.ok(CLONE_FIELDS.includes(seqField(3, 4).body) && CLONE_FIELDS.includes(CC.review[3].body) && CLONE_FIELDS.includes(CF.skipBouncePause));
  assert.equal(TOP_UP_COPY_FIELDS.length, 36);
});

test('manual QA: the Lead List Center\'s own gate (Passed only after the workflow reached QA and finished)', () => {
  const base = { [LX.stage]: 'QA', [LX.processing]: 'Completed' };
  assert.deepEqual(manualQaUpdate(base, 'Passed'), { [LX.qa]: 'Passed', [LX.stage]: 'Ready' });
  assert.deepEqual(manualQaUpdate({ ...base, [LX.stage]: 'Uploaded' }, 'Passed'), { [LX.qa]: 'Passed' }, 'an uploaded list stays Uploaded');
  assert.throws(() => manualQaUpdate({ ...base, [LX.stage]: 'Verification' }, 'Passed'), /through QA/);
  assert.throws(() => manualQaUpdate({ ...base, [LX.processing]: 'Running' }, 'Passed'), /complete/);
  assert.throws(() => manualQaUpdate({ ...base, [LX.engineStatus]: 'Queued' }, 'Passed'), /pending/);
  assert.throws(() => manualQaUpdate({ ...base, [LL.contactQueueStatus]: 'Running' }, 'Passed'), /pending/);
  assert.deepEqual(manualQaUpdate({ [LX.stage]: 'Ready' }, 'Needs Review'), { [LX.qa]: 'Needs Review', [LX.stage]: 'QA' }, 'withdrawing approval removes readiness');
  assert.throws(() => manualQaUpdate(base, 'Great'), /not configured/);
});

/* ---------- the API ---------- */
let db: Db;
let server: http.Server;
let port = 0;
let tables: Record<string, Record<string, Record<string, unknown>>>;
let writes: { op: string; table: string; id?: string; fields: Record<string, unknown> }[];
let fetches: { url: string; body: any }[];
let fetchStatus = 200;
let seq = 0;
const memAt = {
  async list(table: string) { return Object.entries(tables[table] ?? {}).map(([id, f]) => ({ id, fields: { ...f }, createdTime: String(f._created ?? ago(3)) })); },
  async get(table: string, id: string) { const f = tables[table]?.[id]; return f ? { id, fields: { ...f } } : null; },
  async create(table: string, fields: Record<string, unknown>) {
    const id = `recNEW${String(++seq).padStart(11, '0')}`; writes.push({ op: 'create', table, id, fields }); tables[table] ??= {}; tables[table][id] = { ...fields }; return id;
  },
  async update(table: string, id: string, fields: Record<string, unknown>) { writes.push({ op: 'update', table, id, fields }); tables[table] ??= {}; tables[table][id] = { ...(tables[table][id] ?? {}), ...fields }; },
};
const fakeFetch = (async (u: string, init: any) => { fetches.push({ url: String(u), body: JSON.parse(String(init?.body ?? '{}')) }); return new Response('{}', { status: fetchStatus }); }) as typeof fetch;
let senderHook = 'https://n8n.dulcy.io/webhook/sender-sync-test';
function cfg(over: Partial<Config> = {}): Config {
  return { ...loadConfig({ ENGINE_SECRET: 'x'.repeat(40), DATABASE_URL: url ?? 'postgres://x', HQ_SESSION_SECRET: 's'.repeat(40), HQ_HOST: 'hq.test.local' } as NodeJS.ProcessEnv), airtableApiKey: undefined, anthropicApiKey: undefined, ...over };
}
function call(method: string, p: string, cookie?: string, body?: unknown, extra: Record<string, string> = {}): Promise<{ status: number; body: any; text: string; headers: http.IncomingHttpHeaders }> {
  return new Promise((resolve, reject) => {
    const host = `127.0.0.1:${port}`;
    const headers: Record<string, string> = { host, ...extra };
    const data = body === undefined ? undefined : JSON.stringify(body);
    if (data) { headers['content-type'] = 'application/json'; headers.origin ??= `https://${host}`; if (extra.origin) headers.origin = extra.origin; }
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
before(async () => {
  if (skip) return;
  db = createPool(url!); await migrate(db);
  const c = cfg();
  Object.defineProperty(c, 'bisonSenderSyncWebhookUrl', { get: () => senderHook });
  server = createServer(db, c, { at: memAt as any, webDir: '/nonexistent', fetchImpl: fakeFetch });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', () => r()));
  port = (server.address() as AddressInfo).port;
});
after(async () => { if (!skip) { server.close(); await db.end(); } });
beforeEach(async () => {
  tables = {}; writes = []; fetches = []; fetchStatus = 200; seq = 0; senderHook = 'https://n8n.dulcy.io/webhook/sender-sync-test'; _resetDelivCache(); _resetCampaignsCache();
  if (skip) return;
  await db.query('TRUNCATE hq_users, hq_sessions, hq_login_attempts, jobs, steps, receipts, events, campaign_plans, airtable_jobs, hq_settings_log RESTART IDENTITY CASCADE');
  await upsertUser(db, 'alex@dulcy.io', 'owner', PW, 'Alex');
  await upsertUser(db, 'josh@dulcy.io', 'member', 'josh long password 1', 'Josh');
});

const TWM = 'recWSTWM00000010A';
const SHEET = 'https://docs.google.com/spreadsheets/d/abcDEF123_-x/edit';
function fixture() {
  const acct = (email: string, id: number, client = TWM) => ({
    [EA.email]: email, [EA.emailId]: id, [EA.workspaceId]: 7, [EA.client]: [client], [EX.connection]: 'Connected', [EX.warmupOn]: true, [EX.lastWarmupCheck]: ago(1),
    [EX.warmupScore]: 97, [EA.dailyLimit]: 15, [EX.warmupLimit]: 30,
  });
  tables[WORKSPACES_T] = {
    [TWM]: { Name: 'Twenty West Media', ID: '7', Status: 'Active', 'Client Type': 'Paying Client' },
    recWSDULCY000010A: { Name: 'Dulcy', ID: '2', Status: 'Active', 'Client Type': 'Internal' },
  };
  tables[ACCOUNTS] = { recACCA000000001A: acct('a@twm-mail.com', 101), recACCB000000001A: acct('b@twm-mail.com', 102), recACCDULCY00001A: acct('x@dulcy-mail.com', 201, 'recWSDULCY000010A') };
  tables[CAMPAIGNS_T] = {
    recCAMPLIVE00010A: { [KF.name]: 'TWM - Roofers', [KF.status]: 'Active', [KF.stage]: 'Live', [KF.client]: [TWM], [KF.sent]: 4000, [CF.replies]: 80, [CF.interested]: 20, [KF.emailAccounts]: ['recACCA000000001A'], [KF.lists]: ['recLISTLIVE0010A0'], [CAMPAIGN_FIELDS.ID]: 612, [CF.thesis]: 'Roofers in Texas' },
    recCAMPNEW000010A: { [KF.name]: 'TWM - Plumbers', [KF.status]: 'Draft', [KF.stage]: 'Internal Review', [KF.client]: [TWM], [KF.lists]: ['recLISTNEW000100A'], [CF.bisonAction]: 'Pause',
      [CC.review[0].subject]: 'quick question', [CC.review[0].body]: 'Variant 1\nHi {FIRST_NAME}\n\nVariant 2\nHey {FIRST_NAME}', [CC.review[1].body]: 'Following up', [CC.thread[2]]: true, [CF.skipBouncePause]: true, [CF.thesis]: 'Plumbers 11-50' },
  };
  tables[LEAD_LISTS_T] = {
    recLISTLIVE0010A0: { [LF.name]: 'Roofers', [LF.stage]: 'Uploaded', [LF.qa]: 'Passed', [LF.finalDirect]: 300, [LF.finalGeneric]: 50, [LLF.client]: [TWM], [LLF.campaigns]: ['recCAMPLIVE00010A'], [LX.sheetLink]: SHEET,
      [LX.icp]: 'US roofers', [LX.filtersJson]: '{"country":["US"]}', [LL.employeeRange]: '11-50', [LX.expansionTarget]: 2000 },
    recLISTNEW000100A: { [LF.name]: 'Plumbers', [LF.stage]: 'QA', [LF.processing]: 'Completed', [LLF.client]: [TWM], [LLF.campaigns]: ['recCAMPNEW000010A'] },
    recLISTDULCY0010A: { [LF.name]: 'Dulcy list', [LF.stage]: 'Draft', [LLF.client]: ['recWSDULCY000010A'] },
  };
}
const engineWrites = () => writes.filter((w) => [CX.engineAction, CX.runsOnEngine, LX.engineAction].some((k) => k in w.fields) && !(w.op === 'create' && w.table === LEAD_LISTS_T));

test('API: reads for everyone; every write owner only, same-origin, confirm required; members and "view as member" refused', { skip }, async () => {
  fixture();
  const alex = await login(); const josh = await login('josh@dulcy.io', 'josh long password 1');
  const f = await call('GET', '/hq/api/campaigns/recCAMPNEW000010A/fields', josh);
  assert.equal(f.status, 200, f.text);
  assert.equal(f.body.values.subject1, 'quick question');
  assert.equal(f.body.values.skipBouncePause, true);
  assert.equal(f.body.canAct, false);
  assert.ok(!/airtable\.com/.test(f.text), 'no Airtable links');
  const lf = await call('GET', '/hq/api/campaigns/lists/recLISTLIVE0010A0/fields', josh);
  assert.equal(lf.status, 200, lf.text);
  assert.equal(lf.body.values.employeeRange, '11-50');
  for (const [p, b] of [['/hq/api/campaigns/recCAMPNEW000010A/edit', { changes: { name: 'x' }, confirm: true }], ['/hq/api/campaigns/recCAMPNEW000010A/do', { action: 'clone', confirm: true }],
    ['/hq/api/campaigns/new', { client: 'twentywestmedia', title: 'x', confirm: true }], ['/hq/api/campaigns/sync', { which: 'campaigns', confirm: true }],
    ['/hq/api/campaigns/lists/new', { name: 'x', confirm: true }], ['/hq/api/campaigns/lists/recLISTLIVE0010A0/edit', { changes: { icp: 'x' }, confirm: true }], ['/hq/api/campaigns/lists/recLISTLIVE0010A0/do', { action: 'clear-status', confirm: true }]] as [string, unknown][]) {
    assert.equal((await call('POST', p, josh, b)).status, 403, `member: ${p}`);
    assert.equal((await call('POST', p, alex, b, { 'x-hq-view': 'member' })).status, 403, `view as member: ${p}`);
    assert.equal((await call('POST', p, alex, b, { origin: 'https://evil.example' })).status, 403, `cross-site: ${p}`);
  }
  const no = await call('POST', '/hq/api/campaigns/recCAMPNEW000010A/edit', alex, { changes: { name: 'x' } });
  assert.equal(no.status, 400);
  assert.deepEqual([writes, fetches], [[], []], 'nothing written or posted');
});

test('API: campaign edits write exactly the screen\'s fields; refused while a step runs', { skip }, async () => {
  fixture();
  const alex = await login();
  const r = await call('POST', '/hq/api/campaigns/recCAMPNEW000010A/edit', alex, { changes: { maxEmails: 120, startTime: '08:30', monday: false, timezone: 'America/New_York', body2: 'New follow up', seq1v2b: 'Spintax B' }, confirm: true });
  assert.equal(r.status, 200, r.text);
  assert.deepEqual(writes, [{ op: 'update', table: CAMPAIGNS_T, id: 'recCAMPNEW000010A', fields: { [CF.maxEmails]: 120, [CF.startTime]: '08:30', [CAMPAIGN_EDIT.monday.id]: false, [CF.timezone]: 'America/New_York', [CC.review[1].body]: 'New follow up', [seqField(1, 2).body]: 'Spintax B' } }]);
  assert.equal((await call('POST', '/hq/api/campaigns/recCAMPNEW000010A/edit', alex, { changes: { engineAction: 'Launch Campaign' }, confirm: true })).status, 400);
  tables[CAMPAIGNS_T].recCAMPNEW000010A[CX.engineStatus] = 'Running';
  const busy = await call('POST', '/hq/api/campaigns/recCAMPNEW000010A/edit', alex, { changes: { maxEmails: 1 }, confirm: true });
  assert.equal(busy.status, 409);
  const log = (await db.query(`SELECT action, row_id FROM hq_settings_log`)).rows;
  assert.deepEqual(log, [{ action: 'center:campaign-edit', row_id: 'recCAMPNEW000010A' }]);
});

test('API: copy and approval (send for approval, changes requested, approve + prepare, the exception)', { skip }, async () => {
  fixture();
  const alex = await login();
  const send = await call('POST', '/hq/api/campaigns/recCAMPNEW000010A/do', alex, { action: 'send-review', confirm: true });
  assert.equal(send.status, 200, send.text);
  const w = writes[0].fields;
  assert.deepEqual(Object.keys(w).sort(), [CX.stage, CC.submittedAt, CC.autoApproveAt, CC.approvalSource].sort());
  assert.equal(w[CX.stage], 'Client Review'); assert.equal(w[CC.approvalSource], '');
  assert.equal(String(w[CC.autoApproveAt]), addWeekdayHours(new Date(String(w[CC.submittedAt])), 48).toISOString(), '48 weekday hours');
  writes = [];
  const early = await call('POST', '/hq/api/campaigns/recCAMPNEW000010A/do', alex, { action: 'approve-prepare', confirm: true });
  assert.deepEqual([early.status, early.body.error], [409, 'Client feedback must say Approve Campaign first.']);
  const noAck = await call('POST', '/hq/api/campaigns/recCAMPNEW000010A/do', alex, { action: 'approve-prepare', exception: true, confirm: true });
  assert.equal(noAck.status, 400);
  const exc = await call('POST', '/hq/api/campaigns/recCAMPNEW000010A/do', alex, { action: 'approve-prepare', exception: true, acknowledged: true, confirm: true });
  assert.equal(exc.status, 200, exc.text);
  assert.deepEqual(writes[0].fields, {
    [['Campaign Email 1 Subject Version 1', 'Campaign Email 1 Subject', 'Campaign Subject 1 Version 1'].map((k) => CAMPAIGN_FIELDS[k]).find(Boolean)!]: 'quick question',
    [CAMPAIGN_FIELDS['Campaign Body 1 Version 1']]: 'Variant 1\nHi {FIRST_NAME}\n\nVariant 2\nHey {FIRST_NAME}',
    [CAMPAIGN_FIELDS['Campaign Body 2 Version 1']]: 'Following up',
    [CX.stage]: 'Approved', [CC.approvalSource]: 'Internal approval exception',
  }, 'seeds Version 1 from the review copy, Approved, the exception recorded');
  writes = [];
  tables[CAMPAIGNS_T].recCAMPNEW000010A[CC.clientFeedback] = ['Approve Campaign']; tables[CAMPAIGNS_T].recCAMPNEW000010A[CC.approvalSource] = '';
  assert.equal((await call('POST', '/hq/api/campaigns/recCAMPNEW000010A/do', alex, { action: 'approve-prepare', confirm: true })).status, 200);
  assert.equal(writes[0].fields[CC.approvalSource], 'Client approved');
  writes = [];
  assert.equal((await call('POST', '/hq/api/campaigns/recCAMPNEW000010A/do', alex, { action: 'changes-requested', confirm: true })).status, 200);
  assert.deepEqual(writes[0].fields, { [CX.stage]: 'Changes Requested' });
  assert.deepEqual(engineWrites(), [], 'no engine press');
});

test('API: sequence (refresh from approved copy, spintax request, delete a variant)', { skip }, async () => {
  fixture();
  const alex = await login();
  const r = await call('POST', '/hq/api/campaigns/recCAMPNEW000010A/do', alex, { action: 'refresh-sequence', confirm: true });
  assert.equal(r.status, 200, r.text);
  assert.deepEqual(r.body.counts, { 1: 2, 2: 1 });
  assert.equal(writes[0].fields[seqField(1, 2).body], 'Hey {FIRST_NAME}');
  assert.equal(writes[0].fields[seqField(1, 2).subject], 'quick question', 'one subject shared by both variants');
  assert.equal(writes[0].fields[CC.variants[0]], '2');
  writes = [];
  const sp = await call('POST', '/hq/api/campaigns/recCAMPNEW000010A/do', alex, { action: 'spintax', confirm: true });
  assert.equal(sp.status, 200, sp.text);
  const req = JSON.parse(String(writes[0].fields[CF.automationRequest]));
  assert.deepEqual([req.kind, req.label, req.baselineStatus], ['spintax', 'Generate and validate spintax', 'Draft']);
  assert.deepEqual([writes[0].fields[CF.createSpintax], writes[0].fields[CX.stage]], [true, 'Spintax in Progress'], 'the Airtable automation\'s trigger, as the screen writes it');
  writes = [];
  assert.equal((await call('POST', '/hq/api/campaigns/recCAMPNEW000010A/do', alex, { action: 'delete-variant', step: 1, variant: 1, confirm: true })).status, 400, 'Variant A is never deleted');
  assert.equal((await call('POST', '/hq/api/campaigns/recCAMPNEW000010A/do', alex, { action: 'delete-variant', step: 1, variant: 2, confirm: true })).status, 200);
  assert.deepEqual(writes[0].fields, { [seqField(1, 2).subject]: null, [seqField(1, 2).body]: null });
});

test('API: Clone (a Draft copy, no list or inboxes) and Delete (typed DELETE; Bison Action = Delete for the Airtable automation)', { skip }, async () => {
  fixture();
  const alex = await login();
  const c = await call('POST', '/hq/api/campaigns/recCAMPNEW000010A/do', alex, { action: 'clone', confirm: true });
  assert.equal(c.status, 200, c.text);
  const made = writes[0];
  assert.deepEqual([made.op, made.table, made.fields[CX.name], made.fields[CX.status]], ['create', CAMPAIGNS_T, 'TWM - Plumbers Copy', 'Draft']);
  assert.deepEqual(made.fields[CX.client], [TWM]);
  assert.equal(made.fields[CF.skipBouncePause], true);
  assert.ok(!(CX.lists in made.fields) && !(CX.accounts in made.fields) && !(CF.bisonAction in made.fields) && !(CX.stage in made.fields), 'never the lead list, inboxes, EmailBison identity or action flags');
  assert.match(String(made.fields[CF.startTime]), /^08:\d\d$/); assert.match(String(made.fields[CF.endTime]), /^18:\d\d$/);
  writes = [];
  const noType = await call('POST', '/hq/api/campaigns/recCAMPNEW000010A/do', alex, { action: 'delete', confirm: true });
  assert.deepEqual([noType.status, writes.length], [400, 0]);
  const del = await call('POST', '/hq/api/campaigns/recCAMPNEW000010A/do', alex, { action: 'delete', typed: 'DELETE', confirm: true });
  assert.equal(del.status, 200, del.text);
  assert.deepEqual(writes[0].fields, { [CF.bisonAction]: null }, 'an older Bison Action is cleared first so the automation fires');
  assert.equal(writes[1].fields[CF.bisonAction], 'Delete');
  assert.equal(JSON.parse(String(writes[1].fields[CF.automationRequest])).kind, 'Delete');
  assert.equal(writes.length, 2, 'HQ never deletes a record itself');
});

test('API: senders (only the client\'s inboxes), lead list link, client pivots, clear saved status', { skip }, async () => {
  fixture();
  const alex = await login();
  const bad = await call('POST', '/hq/api/campaigns/recCAMPNEW000010A/do', alex, { action: 'set-accounts', ids: ['recACCA000000001A', 'recACCDULCY00001A'], confirm: true });
  assert.deepEqual([bad.status, bad.body.error], [409, '1 inbox is not this client\'s.']);
  const ok = await call('POST', '/hq/api/campaigns/recCAMPNEW000010A/do', alex, { action: 'set-accounts', ids: ['recACCA000000001A', 'recACCB000000001A'], confirm: true });
  assert.equal(ok.status, 200, ok.text);
  assert.deepEqual(writes[0].fields, { [CX.accounts]: ['recACCA000000001A', 'recACCB000000001A'] }, 'busy inboxes are never blocked (a warning only)');
  writes = [];
  assert.equal((await call('POST', '/hq/api/campaigns/recCAMPNEW000010A/do', alex, { action: 'link-list', listId: 'recLISTDULCY0010A', confirm: true })).status, 409, 'another client\'s list');
  assert.equal((await call('POST', '/hq/api/campaigns/recCAMPNEW000010A/do', alex, { action: 'link-list', listId: 'recLISTLIVE0010A0', confirm: true })).status, 200);
  assert.deepEqual(writes[0].fields, { [CX.lists]: ['recLISTLIVE0010A0'] });
  writes = [];
  assert.equal((await call('POST', '/hq/api/campaigns/recCAMPNEW000010A/do', alex, { action: 'pivot', which: 'offer', enabled: false, confirm: true })).status, 200);
  assert.deepEqual(writes[0], { op: 'update', table: WORKSPACES_T, id: TWM, fields: { fld9HliYa3igd1Uri: 'Disabled' } });
  writes = [];
  assert.equal((await call('POST', '/hq/api/campaigns/recCAMPNEW000010A/do', alex, { action: 'clear-status', confirm: true })).status, 200);
  assert.deepEqual(writes[0].fields, { [CX.processing]: null, [CF.message]: null, [CF.error]: null }, 'engine fields untouched');
});

test('API: Create top-up lead list copies the targeting and the exclusion scope; an unfinished one is reused', { skip }, async () => {
  fixture();
  const alex = await login();
  const r = await call('POST', '/hq/api/campaigns/recCAMPLIVE00010A/do', alex, { action: 'create-topup', confirm: true });
  assert.equal(r.status, 200, r.text);
  const made = writes[0];
  assert.deepEqual([made.op, made.table], ['create', LEAD_LISTS_T]);
  assert.match(String(made.fields[LX.name]), /^Roofers — Top-up \d{4}-\d{2}-\d{2} \d{2}:\d{2}$/);
  assert.deepEqual([made.fields[LX.icp], made.fields[LX.filtersJson], made.fields[LL.employeeRange], made.fields[LX.expansionTarget]], ['US roofers', '{"country":["US"]}', '11-50', 2000]);
  assert.deepEqual([made.fields[LX.stage], made.fields[LX.processing], made.fields[LL.automationAction]], ['Source & ICP', 'Not Started', null]);
  assert.ok(!(LX.campaigns in made.fields), 'not linked through Which Campaign?');
  const scope = JSON.parse(String(writes[1].fields[LL.topUpScope]));
  assert.deepEqual([scope.version, scope.mode, scope.campaignRecordId, scope.buildRecordId, scope.sources], [1, 'this-build-only', 'recCAMPLIVE00010A', made.id, [{ recordId: 'recLISTLIVE0010A0', sheetId: 'abcDEF123_-x', tabs: ['Final Direct', 'Final Generic'] }]]);
  assert.deepEqual(writes[2], { op: 'update', table: CAMPAIGNS_T, id: 'recCAMPLIVE00010A', fields: { [CX.topupList]: [made.id] } });
  writes = [];
  const again = await call('POST', '/hq/api/campaigns/recCAMPLIVE00010A/do', alex, { action: 'create-topup', confirm: true });
  assert.equal(again.status, 200);
  assert.ok(!writes.some((w) => w.op === 'create'), 'the unfinished top-up is reused, not a second one');
  // Under the top-up rule (interested < 15% of replies) the KPI exception must be ticked.
  tables[CAMPAIGNS_T].recCAMPLIVE00010A[CF.interested] = 2;
  assert.equal((await call('POST', '/hq/api/campaigns/recCAMPLIVE00010A/do', alex, { action: 'create-topup', confirm: true })).status, 400);
  assert.deepEqual(engineWrites(), [], 'creating the list presses nothing: Top up stays the engine button');
});

test('API: New campaign by hand = the screen\'s records (Draft campaign + its lead list, linked both ways)', { skip }, async () => {
  fixture();
  const alex = await login();
  assert.equal((await call('POST', '/hq/api/campaigns/new', alex, { client: 'nope', title: 'x', confirm: true })).status, 400);
  const r = await call('POST', '/hq/api/campaigns/new', alex, { client: 'twentywestmedia', title: 'Roofers OK', thesis: 'Oklahoma roofers 11-50', confirm: true });
  assert.equal(r.status, 200, r.text);
  const [camp, list, link, back] = writes;
  assert.deepEqual([camp.op, camp.table, camp.fields[CX.name], camp.fields[CX.status], camp.fields[CX.stage], camp.fields[CF.thesis]], ['create', CAMPAIGNS_T, '[Twenty West Media] Roofers OK', 'Draft', 'Strategy Draft', 'Oklahoma roofers 11-50']);
  assert.deepEqual(camp.fields[CX.client], [TWM]);
  assert.deepEqual([list.op, list.table, list.fields[LX.name], list.fields[LX.icp], list.fields[LL.sourceType], list.fields[LX.stage]], ['create', LEAD_LISTS_T, '[Twenty West Media] Roofers OK', 'Oklahoma roofers 11-50', 'DiscoLike', 'Source & ICP']);
  assert.deepEqual(link.fields, { [CX.lists]: [list.id] });
  assert.deepEqual(back.fields, { [LX.campaigns]: [camp.id], [LX.icp]: 'Oklahoma roofers 11-50', [LL.automationAction]: null });
  assert.deepEqual(engineWrites(), [], 'nothing runs or spends: Generate filters is the next press');
});

test('API: Sync with Bison / Sync Bison Senders post the screen\'s body to the same webhooks', { skip }, async () => {
  const alex = await login();
  const r = await call('POST', '/hq/api/campaigns/sync', alex, { which: 'campaigns', confirm: true });
  assert.equal(r.status, 200, r.text);
  assert.equal(fetches[0].url, 'https://bison-sync-relay.scale-f9d.workers.dev/sync');
  assert.deepEqual(Object.keys(fetches[0].body).sort(), ['requestedAt', 'source']);
  assert.equal(fetches[0].body.source, 'Campaign Center');
  assert.equal((await call('POST', '/hq/api/campaigns/sync', alex, { which: 'senders', confirm: true })).status, 200);
  assert.equal(fetches[1].url, 'https://n8n.dulcy.io/webhook/sender-sync-test');
  senderHook = '';
  assert.equal((await call('POST', '/hq/api/campaigns/sync', alex, { which: 'senders', confirm: true })).status, 503, 'not set on the server = refused, nothing sent');
  senderHook = 'https://evil.example/webhook/x';
  assert.equal((await call('POST', '/hq/api/campaigns/sync', alex, { which: 'senders', confirm: true })).status, 503, 'host checked like the screen');
  fetchStatus = 500;
  assert.equal((await call('POST', '/hq/api/campaigns/sync', alex, { which: 'campaigns', confirm: true })).status, 502);
  assert.equal(fetches.length, 3);
});

test('API: lead list edits, verification route, LeadMagic recovery, Use campaign thesis, manual QA, New lead list', { skip }, async () => {
  fixture();
  const alex = await login();
  assert.equal((await call('POST', '/hq/api/campaigns/lists/recLISTLIVE0010A0/edit', alex, { changes: { filters: '{bad' }, confirm: true })).status, 400);
  const e = await call('POST', '/hq/api/campaigns/lists/recLISTNEW000100A/edit', alex, { changes: { icp: 'US plumbers', target: 3000, segRule: 'Exclude Selected', segProviders: ['Proofpoint', 'Mimecast'] }, confirm: true });
  assert.equal(e.status, 200, e.text);
  assert.deepEqual(writes[0].fields, { [LX.icp]: 'US plumbers', [LX.expansionTarget]: 3000, [LL.segRule]: 'Exclude Selected', [LL.segProviders]: ['Proofpoint', 'Mimecast'] });
  writes = [];
  assert.equal((await call('POST', '/hq/api/campaigns/lists/recLISTNEW000100A/do', alex, { action: 'verify-route', generic: false, direct: false, confirm: true })).status, 400);
  assert.equal((await call('POST', '/hq/api/campaigns/lists/recLISTNEW000100A/do', alex, { action: 'verify-route', generic: true, direct: true, confirm: true })).status, 200);
  assert.deepEqual(writes[0].fields, { [LX.includeGeneric]: true, [LX.includeDirect]: true, [LL.genericVerifier]: 'MillionVerifier', [LL.directVerifier]: 'MillionVerifier', [LL.verificationProvider]: 'MillionVerifier' });
  assert.equal((await call('POST', '/hq/api/campaigns/lists/recLISTLIVE0010A0/do', alex, { action: 'verify-route', generic: true, direct: false, confirm: true })).status, 409, 'verified list: route fixed');
  writes = [];
  assert.equal((await call('POST', '/hq/api/campaigns/lists/recLISTNEW000100A/do', alex, { action: 'leadmagic', enabled: true, confirm: true })).status, 200);
  assert.deepEqual(writes[0].fields, { [LX.useLeadMagic]: true }, 'the tick only: Recover with LeadMagic stays the engine press');
  writes = [];
  assert.equal((await call('POST', '/hq/api/campaigns/lists/recLISTNEW000100A/do', alex, { action: 'use-thesis', confirm: true })).status, 200);
  assert.deepEqual(writes[0].fields, { [LX.icp]: 'Plumbers 11-50' });
  writes = [];
  const qa = await call('POST', '/hq/api/campaigns/lists/recLISTNEW000100A/do', alex, { action: 'manual-qa', status: 'Passed', confirm: true });
  assert.equal(qa.status, 200, qa.text);
  assert.deepEqual(writes[0].fields, { [LX.qa]: 'Passed', [LX.stage]: 'Ready' });
  assert.equal((await call('POST', '/hq/api/campaigns/lists/recLISTDULCY0010A/do', alex, { action: 'manual-qa', status: 'Passed', confirm: true })).status, 409, 'a Draft list cannot be QA-passed by hand');
  writes = [];
  const nl = await call('POST', '/hq/api/campaigns/lists/new', alex, { name: 'Dentists FL', client: 'twentywestmedia', icp: 'Florida dentists', confirm: true });
  assert.equal(nl.status, 200, nl.text);
  assert.deepEqual(writes[0].fields, {
    [LL.displayName]: 'Dentists FL', [LL.fileName]: 'Dentists FL', [LX.runsOnEngine]: true, [LX.client]: [TWM], [LX.stage]: 'Draft', [LX.processing]: 'Not Started', [LX.qa]: 'Not Checked', [LL.sourceType]: 'DiscoLike', [LX.icp]: 'Florida dentists',
    [LX.sampleSize]: 100, [LL.companyValidationStatus]: 'Not Started', [LX.contactSampleSize]: 100, [LL.contactValidationStatus]: 'Not Started', [LX.expansionTarget]: 1000, [LL.expansionApproval]: 'Not Requested',
  }, 'the Lead List Center\'s createLeadList, no Engine Action');
  tables[LEAD_LISTS_T].recLISTNEW000100A[LX.engineAction] = 'Run Automated QA';
  assert.equal((await call('POST', '/hq/api/campaigns/lists/recLISTNEW000100A/edit', alex, { changes: { icp: 'x' }, confirm: true })).status, 409, 'a step pressed: edits wait');
  const jobs = (await db.query(`SELECT count(*)::int AS n FROM jobs`)).rows[0].n;
  assert.equal(jobs, 0, 'no engine job was queued by any of these');
});

// HQ round 2 + 3 Deliverability (Alex, 2026-11-27): warm-up off by reason (resting = expected),
// SMTP bounce codes (soft = any 4xx), the light stats row, placement test bands and the next-test
// wording, bulk inbox limits (filter, preview, one job, chunked calls), Cheap Inboxes renewal dates and
// inbox cost (owner only), and the Buy flow (Draft → quote → approve; never buys by itself).
// No real service is called: fake Airtable, fake EmailBison, fake Cheap Inboxes.
import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { createPool, migrate, type Db } from '../src/db/pool.js';
import { loadConfig, type Config } from '../src/config.js';
import { createServer } from '../src/http.js';
import { upsertUser } from '../src/hq/auth.js';
import { enqueue, getJob } from '../src/queue.js';
import { runOnce } from '../src/worker.js';
import { ACCOUNTS, DOMAINS, DM, EA, PLACEMENT, PT } from '../src/stages/accountHealth.js';
import { WORKSPACES } from '../src/hq/inbox.js';
import { ACTIVITY } from '../src/activity.js';
import {
  DPR, DX, EX, INBOX_MONTHLY_DEFAULT, PURCHASES, _resetDelivCache, buyNextStep, inboxCosts, md, placementFreshness, setCheapInboxesReader, testRuns, warmupOffWhy, warmupSummary,
} from '../src/hq/deliverability.js';
import { LIMITS_STAGE, BULK_CHUNK, parseLimitRequest, planLimitChange, _resetRampCache } from '../src/hq/inboxLimits.js';
import { smtpOf, basicOfEnhanced } from '../src/hq/smtpCodes.js';
import { statsRow, _resetBounceCache, BF, type ActivityRow, type CampaignTotals } from '../src/hq/bounceStats.js';
import { parseBuy } from '../src/hq/deliverabilityBuy.js';
import { cheapInboxesConfig, parseDomain, parseMailbox, readCheapInboxes } from '../src/providers/cheapInboxes.js';
import { EMAILS } from '../src/agents/emailsFields.js';
import { startFakeBison, type FakeBison } from './fakes/bison.js';

const url = process.env.TEST_DATABASE_URL;
const skip = !url ? 'TEST_DATABASE_URL not set' : false;
const PW = 'correct horse battery staple';
const DAY = 86_400_000;
const ago = (d: number) => new Date(Date.now() - d * DAY).toISOString();

/* ---------- pure ---------- */
test('SMTP codes: the 3-digit code is the label, the enhanced code the detail; soft = any 4xx', () => {
  assert.deepEqual(smtpOf('550 5.1.1 The email account that you tried to reach does not exist'), { code: '550', enhanced: '5.1.1', mapped: false, meaning: 'Address does not exist', soft: false });
  assert.deepEqual(smtpOf('Remote server returned 5.7.1 message rejected').code, '554', 'only the enhanced code: mapped');
  assert.equal(smtpOf('Remote server returned 5.7.1 message rejected').mapped, true);
  assert.equal(smtpOf('421-4.7.0 Try again later').code, '421');
  assert.deepEqual([smtpOf('', '452').code, smtpOf('', '452').soft], ['452', true], 'the Bounce Code field when the notice has none');
  assert.equal(smtpOf('', 'Unk').code, 'Unknown');
  assert.equal(smtpOf('host 10.0.0.550 said 550-5.1.1 no such user').code, '550', 'an IP address is not a code');
  assert.deepEqual(['5.1.1', '5.1.6', '5.2.2', '5.1.3', '5.7.26', '4.2.2', '4.4.1', '4.7.0', '4.7.1'].map(basicOfEnhanced), ['550', '551', '552', '553', '554', '452', '421', '421', '450']);
});

test('warm-up off: expected when the spam protocol rested / replaces / reviews it, or EmailBison paused it; else a red flag', () => {
  const base = { stage: '', airtableStatus: '', warmupOn: false as boolean | null, warmupDisable: '' };
  assert.equal(warmupOffWhy({ ...base, warmupOn: true }), null);
  assert.equal(warmupOffWhy({ ...base, stage: 'Resting 7 Days' }), 'resting');
  assert.equal(warmupOffWhy({ ...base, airtableStatus: 'Resting' }), 'resting');
  assert.equal(warmupOffWhy({ ...base, dailyLimit: 0, previousLimit: 15 }), 'resting', 'limit 0 with the old one saved = rested');
  assert.equal(warmupOffWhy({ ...base, stage: 'Replace Domain' }), 'replacing');
  assert.equal(warmupOffWhy({ ...base, stage: 'Manual Review' }), 'spam');
  assert.equal(warmupOffWhy({ ...base, warmupDisable: 'Warmup disabled for causing bounces' }), 'bounces');
  assert.equal(warmupOffWhy(base), 'unexpected');
  const rows = [
    ...Array.from({ length: 5 }, () => ({ clientKey: 'a', warmupWhy: 'resting' as const, connection: 'Connected' })),
    { clientKey: 'a', warmupWhy: 'replacing' as const, connection: 'Connected' },
    { clientKey: 'a', warmupWhy: 'unexpected' as const, connection: 'Disconnected' },
    { clientKey: 'b', warmupWhy: 'unexpected' as const, connection: 'Connected' },
    { clientKey: 'b', warmupWhy: null, connection: 'Connected' },
  ];
  const all = warmupSummary(rows);
  assert.deepEqual([all.off, all.expected, all.unexpected, all.disconnected], [8, 6, 2, 1]);
  assert.equal(all.line, 'Warm-up is off on 8 inboxes. 5 resting (spam protocol), 1 waiting for a replacement: expected. 2 off for no known reason (1 disconnected: reconnect first): turn them back on.');
  assert.equal(warmupSummary(rows.slice(0, 6)).line, 'Warm-up is off on 6 inboxes. 5 resting (spam protocol), 1 waiting for a replacement: expected, nothing to do.');
  assert.equal(warmupSummary(rows, 'b').unexpected, 1, 'per client');
});

test('placement: bands per test date like the old screen; "Last test 11/27 · Next test Fri 12/4"; slash dates', () => {
  const t = (email: string, score: number, date: string, clientKey = 'a') => ({ email, score, at: `${date}T18:00:00.000Z`, date, clientKey });
  const runs = testRuns([t('1@x', 10, '2026-11-27'), t('2@x', 30, '2026-11-27'), t('3@x', 60, '2026-11-27'), t('4@x', 90, '2026-11-27'), t('5@x', 100, '2026-11-27'), t('1@x', 80, '2026-11-20'), t('9@y', 5, '2026-11-27', 'b')], 'a');
  assert.deepEqual(runs.map((r) => [r.date, r.tested, r.bands.join('/'), r.underRest]), [['2026-11-27', 5, '1/1/1/2', 2], ['2026-11-20', 1, '0/0/0/1', 0]]);
  // Friday 11/27 evening (New York) with 11/27's scores in: the next test is 12/4, not "11/27".
  const f = placementFreshness('2026-11-27T19:00:00.000Z', new Date('2026-11-28T01:00:00Z'), 900);
  assert.deepEqual([f.lastTest, f.nextTest, f.nextFriday], ['2026-11-27', '2026-12-04', '2026-12-04']);
  assert.equal(placementFreshness('2026-11-20T19:00:00.000Z', new Date('2026-11-27T14:00:00Z')).nextTest, '2026-11-27', 'Friday morning before the scores: today');
  assert.deepEqual([md('2026-12-04'), md('2026-11-27'), md('')], ['12/4', '11/27', '']);
});

test('inbox cost: inboxes × $2.50 by default, the Cheap Inboxes price when known (owner only on screen)', () => {
  const d = (clientKey: string, inboxes: number, inboxMonthly: number | null = null) => ({ clientKey, client: clientKey, inboxes, inboxMonthly }) as any;
  const m = { domains: [d('a', 2), d('a', 2), d('b', 2, 3), d('none', 2)], clients: [{ key: 'a', name: 'Alpha' }, { key: 'b', name: 'Beta' }] as any, cheap: { connected: false, error: '', domains: 0, mailboxPrice: null, readAt: '' } };
  assert.equal(INBOX_MONTHLY_DEFAULT, 2.5);
  assert.deepEqual(inboxCosts(m).map((c) => [c.name, c.domains, c.inboxes, c.monthly, c.source]), [['Alpha', 2, 4, 10, 'default'], ['Beta', 1, 2, 6, 'cheapinboxes']]);
  assert.deepEqual(inboxCosts({ ...m, cheap: { ...m.cheap, connected: true, mailboxPrice: 3.25 } }).map((c) => c.monthly), [13, 6], 'the account average when a domain has no own price');
});

test('stats row: replies, interested and meetings in the period; sent from the campaigns sending in it', () => {
  const act: ActivityRow[] = [
    { clientKey: 'a', campaign: 'C1', campaignRec: 'rec1', inbox: 'x@m.com', status: 'Interested', repliedAt: ago(2), bookedAt: '' },
    { clientKey: 'a', campaign: 'C1', campaignRec: 'rec1', inbox: 'x@m.com', status: 'Not Interested', repliedAt: ago(3), bookedAt: '' },
    { clientKey: 'a', campaign: 'C1', campaignRec: 'rec1', inbox: 'y@m.com', status: 'Meeting Request', repliedAt: ago(40), bookedAt: ago(1) },
    { clientKey: 'b', campaign: 'C2', campaignRec: 'rec2', inbox: 'z@m.com', status: 'Interested', repliedAt: ago(1), bookedAt: '' },
  ];
  const camps: CampaignTotals[] = [
    { id: 'rec1', name: 'C1', clientKey: 'a', sent: 1000, contacted: 900, replies: 20, interested: 5, booked: 2, bounce: 1.2, activeInPeriod: true },
    { id: 'rec3', name: 'Old', clientKey: 'a', sent: 5000, contacted: 5000, replies: 1, interested: 0, booked: 0, bounce: 3, activeInPeriod: false },
  ];
  const a = statsRow(act, camps, [], { client: 'a' }, 30);
  assert.deepEqual([a.sent, a.campaigns, a.replies, a.interested, a.meetings], [1000, 1, 2, 1, 1], 'the 40-day-old reply is outside the period; the old campaign is not sending');
  const one = statsRow(act, camps, [], { campaign: 'rec1' }, 30);
  assert.deepEqual([one.sent, one.bounceRate], [1000, 1.2]);
  assert.equal(statsRow(act, camps, [], { account: 'x@m.com' }, 30).sent, null, 'no sends per inbox here');
});

test('bulk limits: the "all shown" filter (client, status, search) is resolved on the server; preview needs no confirm', () => {
  assert.equal(parseLimitRequest({ filter: { client: 'twm', status: 'healthy' }, cold: 10 }, true).ok, true, 'a preview changes nothing');
  assert.equal(parseLimitRequest({ filter: { client: 'twm' }, cold: 10 }).ok, false, 'the real edit still needs confirm: true');
  const p = parseLimitRequest({ filter: { client: 'twm', status: 'resting', q: ' A@ ' }, warmup: 20, confirm: true });
  assert.ok(p.ok && p.req.filter && p.req.filter.status === 'resting' && p.req.filter.q === 'a@');
  const i = (id: string, email: string, status: string, clientKey = 'twm') => ({ id, email, domain: email.split('@')[1], status, clientKey, client: 'Twenty West', emailId: Number(id.slice(-3)), teamId: 7, dailyLimit: 5, warmupLimit: 10, stage: '' }) as any;
  const pool = [i('recA00000000000101', 'a@x.com', 'healthy'), i('recA00000000000102', 'b@x.com', 'healthy'), i('recA00000000000103', 'c@y.com', 'risk'), i('recA00000000000104', 'd@x.com', 'healthy', 'other')];
  const plan = planLimitChange(pool, { accounts: [], client: '', cold: 10, warmup: null, reason: '', filter: { client: 'twm', status: 'healthy', q: '' } });
  assert.deepEqual(plan.changes.map((c) => c.email), ['a@x.com', 'b@x.com']);
  const every = planLimitChange(pool, { accounts: [], client: '', cold: 10, warmup: null, reason: '', filter: { client: '', status: '', q: 'x.com' } });
  assert.deepEqual([every.changes.length, every.client], [3, '2 clients'], 'all shown, across clients');
});

test('Buy: confirm required; 1-100 domains; Google / Microsoft; approve repeats the quote; the next step per status', () => {
  assert.equal((parseBuy({ client: 'twm', domains: 5 }) as any).error, 'confirm: true is required');
  assert.match((parseBuy({ client: 'twm', domains: 0, confirm: true }) as any).error, /1 to 100/);
  assert.match((parseBuy({ client: 'twm', domains: 5, provider: 'Zoho', confirm: true }) as any).error, /Google or Microsoft/);
  assert.match((parseBuy({ action: 'approve', id: 'recABCDEFGHIJKLMN', confirm: true }) as any).error, /quote total/);
  assert.deepEqual(parseBuy({ client: 'Twenty West', domains: 3, tlds: ['com'], confirm: true }), { ok: true, req: { action: 'create', client: 'twentywest', domains: 3, provider: 'Google', tlds: ['.com'], note: '' } });
  assert.deepEqual(['Draft', 'Generate Domains', 'Ready for Approval', 'Approved', 'Failed', 'Completed'].map((s) => buyNextStep(s, false, s === 'Ready for Approval')), ['quote', 'wait', 'approve', 'buying', 'fix', 'done']);
});

test('Cheap Inboxes: read-only, optional key, tolerant parsing, never throws', async () => {
  assert.equal(cheapInboxesConfig({}), null, 'no key: HQ keeps the estimate');
  assert.deepEqual(cheapInboxesConfig({ CHEAPINBOXES_API_KEY: ' k ', CHEAPINBOXES_AUTH_HEADER: 'X-API-Key' }), { apiKey: 'k', baseUrl: 'https://api.cheapinboxes.com/v1', authHeader: 'X-API-Key' });
  assert.deepEqual(parseDomain({ name: 'Acme-Mail.com', expires_at: '2027-03-04T00:00:00Z', status: 'active' }), { domain: 'acme-mail.com', renewal: '2027-03-04', status: 'active', mailboxes: 0, monthly: null });
  assert.deepEqual(parseMailbox({ full_email: 'a@acme-mail.com', price_cents: 250 }), { domain: 'acme-mail.com', status: '', monthly: 2.5 });
  const calls: { url: string; method: string; auth: string }[] = [];
  const fake = (async (u: string, init: any) => {
    calls.push({ url: u, method: init.method, auth: init.headers.authorization ?? init.headers['X-API-Key'] ?? '' });
    const page = Number(new URL(u).searchParams.get('page'));
    if (u.includes('/domains')) return new Response(JSON.stringify({ data: page === 1 ? [{ domain: 'acme-mail.com', renewal_date: '2027-01-15' }] : [], meta: { last_page: 1 } }));
    return new Response(JSON.stringify({ data: [{ email: 'a@acme-mail.com', monthly_price: '3.00' }, { email: 'b@acme-mail.com', monthly_price: 3 }] }));
  }) as unknown as typeof fetch;
  const ix = await readCheapInboxes({ apiKey: 'k', baseUrl: 'https://ci.test/v1', authHeader: '' }, fake);
  assert.equal(ix.error, '');
  assert.deepEqual(ix.domains.get('acme-mail.com'), { domain: 'acme-mail.com', renewal: '2027-01-15', status: '', mailboxes: 2, monthly: 3 });
  assert.ok(calls.every((c) => c.method === 'GET' && c.auth === 'Bearer k'), 'GET only, the key in the header');
  const bad = await readCheapInboxes({ apiKey: 'k', baseUrl: 'https://ci.test/v1', authHeader: '' }, (async () => new Response('no', { status: 401 })) as unknown as typeof fetch);
  assert.match(bad.error, /refused the key/);
});

/* ---------- API + job (fake Airtable in memory, fake EmailBison, fake Airtable over HTTP for the job) ---------- */
let db: Db;
let server: http.Server;
let port = 0;
let tables: Record<string, Record<string, Record<string, unknown>>>;
let writes: { table: string; id?: string; fields: Record<string, unknown> }[];
const memAt = {
  async list(table: string) { return Object.entries(tables[table] ?? {}).map(([id, f]) => ({ id, fields: { ...f }, createdTime: String(f._created ?? ago(3)) })); },
  async get(table: string, id: string) { const f = tables[table]?.[id]; return f ? { id, fields: { ...f } } : null; },
  async create(table: string, fields: Record<string, unknown>) { writes.push({ table, fields }); const id = `recNEW${String(writes.length).padStart(11, '0')}`; (tables[table] ??= {})[id] = { ...fields }; return id; },
  async update(table: string, id: string, fields: Record<string, unknown>) { writes.push({ table, id, fields }); Object.assign(((tables[table] ??= {})[id] ??= {}), fields); },
};
function cfg(over: Partial<Config> = {}): Config {
  return { ...loadConfig({ ENGINE_SECRET: 'x'.repeat(40), DATABASE_URL: url ?? 'postgres://x', HQ_SESSION_SECRET: 's'.repeat(40), HQ_HOST: 'hq.test.local' } as NodeJS.ProcessEnv), airtableApiKey: undefined, anthropicApiKey: undefined, ...over };
}
function call(method: string, p: string, cookie?: string, body?: unknown): Promise<{ status: number; body: any; text: string; headers: http.IncomingHttpHeaders }> {
  return new Promise((resolve, reject) => {
    const host = `127.0.0.1:${port}`;
    const headers: Record<string, string> = { host };
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

let bison: FakeBison;
let atServer: http.Server;
let atUrl = '';
let httpRows: Record<string, Record<string, { fields: Record<string, unknown> }>>;
let patchSizes: number[];
before(async () => {
  bison = await startFakeBison();
  atServer = http.createServer((req, res) => {
    const u = new URL(req.url ?? '/', 'http://x'); const table = u.pathname.split('/')[3];
    const rows = (httpRows[table] ??= {});
    res.setHeader('content-type', 'application/json');
    if (req.method === 'GET') return res.end(JSON.stringify({ records: Object.entries(rows).map(([id, r]) => ({ id, fields: r.fields })) }));
    let raw = ''; req.on('data', (c) => (raw += c));
    req.on('end', () => {
      const x = JSON.parse(raw || '{}');
      if (req.method === 'PATCH') patchSizes.push((x.records ?? []).length);
      res.end(JSON.stringify({ records: (x.records ?? []).map((r: any) => {
        if (req.method === 'PATCH') { Object.assign((rows[r.id] ??= { fields: {} }).fields, r.fields); return r; }
        const id = `recNew${String(Object.keys(rows).length).padStart(11, '0')}`; rows[id] = { fields: { ...r.fields } }; return { id, fields: r.fields };
      }) }));
    });
  });
  await new Promise<void>((r) => atServer.listen(0, r));
  atUrl = `http://127.0.0.1:${(atServer.address() as AddressInfo).port}`;
  if (skip) return;
  db = createPool(url!); await migrate(db);
  server = createServer(db, cfg(), { at: memAt as any, webDir: '/nonexistent' });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', () => r()));
  port = (server.address() as AddressInfo).port;
});
after(async () => { setCheapInboxesReader(null); bison.close(); atServer.close(); if (!skip) { server.close(); await db.end(); } });
beforeEach(async () => {
  tables = {}; writes = []; httpRows = {}; patchSizes = []; _resetDelivCache(); _resetRampCache(); _resetBounceCache(); setCheapInboxesReader(() => null);
  (bison as any).dailyLimits = {}; (bison as any).warmupLimits = {}; (bison as any).limitTeams = []; bison.calls.length = 0;
  if (skip) return;
  await db.query('TRUNCATE hq_users, hq_sessions, hq_login_attempts, jobs, steps, receipts, events, hq_agent_tasks RESTART IDENTITY CASCADE');
  await upsertUser(db, 'Alex@dulcy.io', 'owner', PW, 'Alex');
  await upsertUser(db, 'josh@dulcy.io', 'member', 'josh long password 1', 'Josh');
});

function fixture() {
  const acct = (email: string, id: number, extra: Record<string, unknown> = {}) => ({
    [EA.email]: email, [EA.emailId]: id, [EA.workspaceId]: 7, [EA.client]: ['recWSTWM00000010A'], [EA.domains]: ['recDOMTWM0000001A'], [EX.connection]: 'Connected', [EX.warmupOn]: true, [EX.lastWarmupCheck]: ago(1),
    [EX.warmupScore]: 97, [EA.dailyLimit]: 5, [EX.warmupLimit]: 10, ...extra,
  });
  tables[WORKSPACES] = { recWSTWM00000010A: { Name: 'Twenty West Media', ID: '7', Status: 'Active' } };
  tables[ACCOUNTS] = {
    recACCA000000001A: acct('a@twm-mail.com', 101),
    recACCB000000001A: acct('b@twm-mail.com', 102, { [EX.warmupOn]: false }),
    recACCC000000001A: acct('c@twm-mail.com', 103, { [EA.stage]: 'Resting 7 Days', [EA.dailyLimit]: 0, [EA.previousLimit]: 5, [EX.warmupOn]: false }),
    recACCD000000001A: acct('d@twm-mail.com', 104, { [EA.status]: 'Resting', [EX.warmupOn]: false }),
  };
  tables[DOMAINS] = { recDOMTWM0000001A: { [DM.name]: 'twm-mail.com', [DX.client]: ['recWSTWM00000010A'], [DX.purchaseDate]: '2026-01-10' } };
  tables[PLACEMENT] = Object.fromEntries(['a', 'b', 'c', 'd'].map((x, i) => [`recTEST${x}0000000001`, { [PT.email]: `${x}@twm-mail.com`, [PT.overall]: [10, 40, 70, 95][i], [PT.testDate]: '2026-11-27', [PT.client]: ['recWSTWM00000010A'], _created: ago(0.2) }]));
}

test('API: warm-up off by reason (resting is expected, one red flag); Atlas line; placement bands; slash dates', { skip }, async () => {
  fixture();
  const cookie = await login();
  const r = await call('GET', '/hq/api/deliverability', cookie);
  assert.equal(r.status, 200, r.text);
  assert.deepEqual([r.body.counts.warmupOff, r.body.warmup.off, r.body.warmup.expected, r.body.warmup.unexpected], [1, 3, 2, 1], 'c (rested) and d (Resting) are expected; b is the red flag');
  assert.match(r.body.warmup.line, /^Warm-up is off on 3 inboxes\. 2 resting \(spam protocol\): expected\. 1 off for no known reason: turn it back on\.$/);
  assert.deepEqual(r.body.items.filter((i: any) => i.redFlag).map((i: any) => i.title), ['b@twm-mail.com']);
  const p = await call('GET', '/hq/api/deliverability/placement', cookie);
  assert.deepEqual(p.body.runs.map((x: any) => [x.date, x.tested, x.bands]), [['2026-11-27', 4, [1, 1, 1, 1]]]);
  assert.deepEqual(p.body.bands, ['0-24', '25-49', '50-74', '75-100']);
});

test('API: domains: renewal from Cheap Inboxes (else estimated), monthly cost owner only; members see no money', { skip }, async () => {
  fixture();
  tables[PURCHASES] = { recDPR00000000001A: { [DPR.request]: 'TWM - 5 domains', [DPR.client]: ['recWSTWM00000010A'], [DPR.status]: 'Ready for Approval', [DPR.quoteToday]: 61.5, [DPR.monthlyCost]: 25, [DPR.count]: 5 } };
  const cookie = await login();
  const est = await call('GET', '/hq/api/deliverability/domains', cookie);
  assert.equal(est.status, 200, est.text);
  const d0 = est.body.clients[0].domains[0];
  assert.deepEqual([d0.renewal, d0.renewalEstimated, d0.renewalSource], ['2027-01-10', true, 'estimated']);
  assert.deepEqual(est.body.costs.map((c: any) => [c.name, c.inboxes, c.monthly, c.source]), [['Twenty West', 4, 10, 'default']]);
  assert.equal(est.body.renewalGap.missing, 1);
  assert.deepEqual([est.body.purchases[0].quoteToday, est.body.purchases[0].next, est.body.purchases[0].client], [61.5, 'approve', 'Twenty West']);
  // Cheap Inboxes connected: the real date and price.
  setCheapInboxesReader(() => Promise.resolve({ domains: new Map([['twm-mail.com', { domain: 'twm-mail.com', renewal: '2027-01-12', status: 'active', mailboxes: 4, monthly: 3 }]]), mailboxPrice: 3, readAt: new Date().toISOString(), error: '' }));
  _resetDelivCache();
  const real = await call('GET', '/hq/api/deliverability/domains', cookie);
  const d1 = real.body.clients[0].domains[0];
  assert.deepEqual([d1.renewal, d1.renewalEstimated, d1.renewalSource], ['2027-01-12', false, 'cheapinboxes']);
  assert.deepEqual(real.body.costs.map((c: any) => [c.monthly, c.source]), [[12, 'cheapinboxes']]);
  assert.equal(real.body.renewalGap.missing, 0);
  const josh = await login('josh@dulcy.io', 'josh long password 1');
  const m = await call('GET', '/hq/api/deliverability/domains', josh);
  assert.equal(m.status, 200);
  assert.equal(m.body.costs, null, 'no money for members');
  assert.equal(m.body.purchases[0].quoteToday, null);
  assert.equal((await call('GET', '/hq/api/deliverability/costs', josh)).status, 403);
  const c = await call('GET', '/hq/api/deliverability/costs', cookie);
  assert.deepEqual(c.body.costs.map((x: any) => x.monthly), [12]);
});

test('API: Buy creates a Draft request (nothing bought); quote → Generate Domains; approve only Ready for Approval with the same total; owner only', { skip }, async () => {
  fixture();
  const josh = await login('josh@dulcy.io', 'josh long password 1');
  assert.equal((await call('POST', '/hq/api/deliverability/buy', josh, { client: 'twentywestmedia', domains: 5, confirm: true })).status, 403);
  const cookie = await login();
  assert.equal((await call('POST', '/hq/api/deliverability/buy', cookie, { client: 'twentywestmedia', domains: 5 })).status, 400, 'confirm required');
  const r = await call('POST', '/hq/api/deliverability/buy', cookie, { client: 'twentywestmedia', domains: 5, provider: 'Google', confirm: true });
  assert.equal(r.status, 200, r.text);
  const made = writes.find((w) => w.table === PURCHASES)!;
  assert.deepEqual([made.fields[DPR.status], made.fields[DPR.count], made.fields[DPR.client], made.fields[DPR.provider], made.fields[DPR.approve]], ['Draft', 5, ['recWSTWM00000010A'], 'Google', undefined], 'a Draft: nothing runs, nothing is bought');
  assert.ok(writes.some((w) => w.table === ACTIVITY), 'an Activity Log row');
  const id = r.body.id;
  assert.equal((await call('POST', '/hq/api/deliverability/buy', cookie, { action: 'approve', id, total: 0, confirm: true })).status, 409, 'a Draft cannot be approved');
  const q = await call('POST', '/hq/api/deliverability/buy', cookie, { action: 'quote', id, confirm: true });
  assert.equal(q.status, 200, q.text);
  assert.equal(tables[PURCHASES][id][DPR.status], 'Generate Domains');
  // n8n quoted it.
  Object.assign(tables[PURCHASES][id], { [DPR.status]: 'Ready for Approval', [DPR.quoteToday]: 61.5 });
  const wrong = await call('POST', '/hq/api/deliverability/buy', cookie, { action: 'approve', id, total: 50, confirm: true });
  assert.equal(wrong.status, 409);
  assert.match(wrong.body.error, /now \$61\.50/);
  assert.notEqual(tables[PURCHASES][id][DPR.approve], true);
  const ok = await call('POST', '/hq/api/deliverability/buy', cookie, { action: 'approve', id, total: 61.5, confirm: true });
  assert.equal(ok.status, 200, ok.text);
  assert.equal(tables[PURCHASES][id][DPR.approve], true, 'Alex\'s ✅ ticks Approve Purchase (the Airtable automation + n8n then buy)');
});

test('API + job: bulk limits preview then ONE job for the inboxes shown; chunked EmailBison calls with receipts; batched Airtable mirror', { skip }, async () => {
  fixture();
  const josh = await login('josh@dulcy.io', 'josh long password 1');
  assert.equal((await call('POST', '/hq/api/deliverability/limits/preview', josh, { filter: { client: 'twentywestmedia' }, cold: 10 })).status, 403);
  const cookie = await login();
  const pv = await call('POST', '/hq/api/deliverability/limits/preview', cookie, { filter: { client: 'twentywestmedia' }, cold: 10, warmup: 20 });
  assert.equal(pv.status, 200, pv.text);
  assert.deepEqual([pv.body.changes, pv.body.skipped, pv.body.live], [4, 1, false], 'the resting inbox keeps its 0 cold (its warm-up still moves)');
  assert.equal((await db.query(`SELECT count(*)::int AS n FROM jobs`)).rows[0].n, 0, 'a preview queues nothing');
  const r = await call('POST', '/hq/api/deliverability/limits', cookie, { filter: { client: 'twentywestmedia' }, cold: 10, warmup: 20, confirm: true });
  assert.equal(r.status, 200, r.text);
  assert.equal(r.body.changes, 4);
  assert.equal((await db.query(`SELECT count(*)::int AS n FROM jobs WHERE kind=$1`, [LIMITS_STAGE])).rows[0].n, 1, 'one job');
  // The job itself, live, with more inboxes than one EmailBison call takes.
  const changes = Array.from({ length: BULK_CHUNK + 5 }, (_, k) => ({ rec: `recACC${String(k).padStart(11, '0')}`, email: `i${k}@twm-mail.com`, clientKey: 'twentywestmedia', client: 'Twenty West', senderId: 1000 + k, teamId: 7, cold: { from: 5, to: 10 } }));
  const c = { ...cfg(), emailBisonKeys: { dulcy: bison.key }, emailBisonBaseUrl: bison.url, airtableApiKey: 'at', airtableBaseUrl: atUrl, dryRun: true, liveStages: [LIMITS_STAGE] } as Config;
  const q = await enqueue(db, { kind: LIMITS_STAGE, recordId: 'limits:bulk', requestId: 'bulk1', input: { changes, by: 'Alex', client: 'Twenty West', clientKey: 'twentywestmedia' }, dryRun: false, maxAttempts: 3, deadlineMs: 60_000 });
  let job: any;
  for (let k = 0; k < 10; k++) { await runOnce(db, c); job = (await getJob(db, q.job.id))!.job; if (['succeeded', 'failed', 'needs_review'].includes(job.status)) break; }
  assert.equal(job.status, 'succeeded', JSON.stringify(job));
  assert.equal(Object.keys((bison as any).dailyLimits).length, BULK_CHUNK + 5);
  assert.equal(bison.calls.filter((x) => x === 'PATCH /api/sender-emails/daily-limits/bulk').length, 2, 'two chunks');
  assert.equal((await db.query(`SELECT count(*)::int AS n FROM receipts WHERE provider='emailbison' AND status='done'`)).rows[0].n, 2, 'a receipt per call');
  assert.ok(patchSizes.length >= 11 && patchSizes.every((n) => n <= 10), 'Airtable mirror 10 records per call');
  assert.equal((job.result as any).inboxes.length, BULK_CHUNK + 5);
  assert.ok(Object.keys(httpRows[ACTIVITY] ?? {}).length === 1, 'one Activity Log row for the whole bulk edit');
  void EMAILS; void BF;
});

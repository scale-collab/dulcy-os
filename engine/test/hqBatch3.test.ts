// HQ Batch 3: the inbox limit edit (confirm required, owner only, dry run vs live, a fake EmailBison),
// the new-client ramp proposals, bounce grouping and its one conclusion, verification stats and the
// lead lists view. No real service is called.
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
import { ACCOUNTS, EA } from '../src/stages/accountHealth.js';
import { ACTIVITY } from '../src/activity.js';
import { EX, _resetDelivCache, blacklistText, renewalOf } from '../src/hq/deliverability.js';
import {
  LIMITS_STAGE, RAMP, _resetRampCache, firstSendByClient, parseLimitRequest, planLimitChange, queueLimitChange, rampProposals, rampStepOf, describePlan,
} from '../src/hq/inboxLimits.js';
import {
  BF, VL, _resetBounceCache, bounceSummary, concludeBounces, hardOf, kindOf, landingOf, verificationRows, verifierTotals, type BounceRow,
} from '../src/hq/bounceStats.js';
import { CAMPAIGNS_T, KF, LEAD_LISTS_T, LF, LLF, WORKSPACES_T, _resetCampaignsCache, clientIndex, leadListRow } from '../src/hq/campaigns.js';
import { EMAILS } from '../src/agents/emailsFields.js';
import { startFakeBison, type FakeBison } from './fakes/bison.js';

const url = process.env.TEST_DATABASE_URL;
const skip = !url ? 'TEST_DATABASE_URL not set' : false;
const PW = 'correct horse battery staple';
const DAY = 86_400_000;
const NOW = Date.parse('2026-11-27T15:00:00.000Z');
const ago = (d: number, from = Date.now()) => new Date(from - d * DAY).toISOString();

/* ---------- the limit edit (pure) ---------- */
const inbox = (o: Record<string, unknown> = {}) => ({ id: 'recACC00000000001', email: 'a@x-mail.com', clientKey: 'twentywestmedia', client: 'Twenty West', emailId: 101, teamId: 2, dailyLimit: 5, warmupLimit: 10, stage: '', ...o }) as any;

test('limit edit: confirm: true is required; numbers are checked; inboxes or a client', () => {
  assert.deepEqual(parseLimitRequest({ accounts: ['recACC00000000001'], cold: 10 }), { ok: false, error: 'confirm: true is required: this changes the inboxes in EmailBison' });
  assert.equal((parseLimitRequest({ accounts: ['recACC00000000001'], cold: 10, confirm: 'yes' }) as any).ok, false, 'only the boolean true counts');
  assert.match((parseLimitRequest({ accounts: ['recACC00000000001'], cold: 51, confirm: true }) as any).error, /0 to 50/);
  assert.match((parseLimitRequest({ accounts: ['recACC00000000001'], cold: 2.5, confirm: true }) as any).error, /whole number/);
  assert.match((parseLimitRequest({ accounts: ['recACC00000000001'], confirm: true }) as any).error, /set a cold daily limit/);
  assert.match((parseLimitRequest({ cold: 10, confirm: true }) as any).error, /pick the inboxes/);
  assert.match((parseLimitRequest({ accounts: ['nope'], cold: 10, confirm: true }) as any).error, /record ids/);
  const ok = parseLimitRequest({ client: 'Twenty West!', cold: 10, warmup: '20', confirm: true });
  assert.deepEqual(ok, { ok: true, req: { accounts: [], client: 'twentywest', cold: 10, warmup: 20, reason: '' } });
});

test('limit edit: the plan skips resting, replaced, unknown and unchanged inboxes and says why', () => {
  const rows = [
    inbox(),
    inbox({ id: 'recACC00000000002', email: 'b@x-mail.com', stage: 'Resting 7 Days', dailyLimit: 0 }),
    inbox({ id: 'recACC00000000003', email: 'c@x-mail.com', stage: 'Replace Domain', dailyLimit: 0 }),
    inbox({ id: 'recACC00000000004', email: 'd@x-mail.com', emailId: null }),
    inbox({ id: 'recACC00000000005', email: 'e@x-mail.com', dailyLimit: 10, warmupLimit: 20 }),
    inbox({ id: 'recACC00000000006', email: 'f@other.com', clientKey: 'dulcy', client: 'Dulcy' }),
  ];
  const p = planLimitChange(rows, { accounts: [], client: 'twentywestmedia', cold: 10, warmup: 20, reason: '' });
  assert.deepEqual(p.changes.map((c) => [c.email, c.cold?.to ?? null, c.warmup?.to ?? null]), [['a@x-mail.com', 10, 20], ['b@x-mail.com', null, 20]], 'resting keeps its 0 cold; only warm-up moves');
  assert.deepEqual(p.changes[0].cold, { from: 5, to: 10 });
  assert.deepEqual(p.skipped.map((s) => s.email), ['b@x-mail.com', 'c@x-mail.com', 'd@x-mail.com', 'e@x-mail.com']);
  assert.match(p.skipped.find((s) => s.email === 'c@x-mail.com')!.why, /replacement/);
  assert.match(p.skipped.find((s) => s.email === 'e@x-mail.com')!.why, /already/);
  assert.equal(p.clientKey, 'twentywestmedia');
  assert.equal(describePlan(p), '2 inboxes of Twenty West → cold 10/day, warm-up 20/day');
  const one = planLimitChange(rows, { accounts: ['recACC00000000006', 'recNOTTHERE000001'], client: '', cold: 15, warmup: null, reason: '' });
  assert.deepEqual(one.changes.map((c) => c.email), ['f@other.com']);
  assert.deepEqual(one.skipped, [{ email: '1 inbox', why: 'not an active client\'s inbox in Airtable' }]);
});

/* ---------- the ramp (pure) ---------- */
test('ramp: 5/10 → 10/20 after a week of sending → 15/30 after another week (cap); one step at a time', () => {
  assert.deepEqual(RAMP, [{ cold: 5, warmup: 10 }, { cold: 10, warmup: 20 }, { cold: 15, warmup: 30 }]);
  assert.deepEqual([5, 10, 15, 20, null].map(rampStepOf), [0, 1, 2, null, null]);
  const first = new Map([['twentywestmedia', ago(8, NOW)]]);
  const rows = [inbox(), inbox({ id: 'recACC00000000002', email: 'b@x-mail.com' }), inbox({ id: 'recACC00000000003', email: 'c@x-mail.com', stage: 'Resting 7 Days', dailyLimit: 5 })];
  const p = rampProposals(rows, first, new Map(), NOW);
  assert.equal(p.length, 1);
  assert.deepEqual([p[0].key, p[0].from, p[0].to, p[0].emails], ['ramp:twentywestmedia:10', { cold: 5, warmup: 10 }, { cold: 10, warmup: 20 }, ['a@x-mail.com', 'b@x-mail.com']], 'resting inboxes wait');
  assert.match(p[0].why, /^Sending since 11-19 \(8 days\)\. Ramp: week 2 = 10 cold \/ 20 warm-up\.$/);
  assert.deepEqual(rampProposals(rows, new Map([['twentywestmedia', ago(6, NOW)]]), new Map(), NOW), [], 'under a week: stay at 5/10');
  // Day 15 and still at 5/10: one step (10/20), not a jump to 15/30.
  assert.deepEqual(rampProposals([inbox()], new Map([['twentywestmedia', ago(15, NOW)]]), new Map(), NOW).map((x) => x.to.cold), [10]);
  // At 10/20 on day 15: → 15/30 (the cap), unless changed in the last 7 days.
  const at10 = [inbox({ dailyLimit: 10, warmupLimit: 20 })];
  const two = rampProposals(at10, new Map([['twentywestmedia', ago(15, NOW)]]), new Map(), NOW);
  assert.deepEqual(two.map((x) => [x.to, /the cap/.test(x.why)]), [[{ cold: 15, warmup: 30 }, true]]);
  assert.deepEqual(rampProposals(at10, new Map([['twentywestmedia', ago(15, NOW)]]), new Map([['recACC00000000001', ago(3, NOW)]]), NOW), [], 'changed 3 days ago: wait a week');
  assert.deepEqual(rampProposals([inbox({ dailyLimit: 15, warmupLimit: 30 })], new Map([['twentywestmedia', ago(30, NOW)]]), new Map(), NOW), [], 'at the cap: nothing');
  assert.deepEqual(rampProposals([inbox({ dailyLimit: 12 })], new Map([['twentywestmedia', ago(15, NOW)]]), new Map(), NOW), [], 'a custom limit is left alone');
  assert.deepEqual(rampProposals(rows, new Map([['twentywestmedia', ago(60, NOW)]]), new Map(), NOW), [], 'not a new client any more');
  assert.deepEqual(rampProposals(rows, new Map(), new Map(), NOW), [], 'first send UNKNOWN: no proposal');
});

test('ramp: a client\'s first send = its first live launch, else when a sending campaign went Active', () => {
  const ws = [{ id: 'recWS00000000001A', fields: { Name: 'Twenty West Media', Status: 'Active' } }, { id: 'recWS00000000002A', fields: { Name: 'Old Client', Status: 'Inactive' } }];
  const camp = (id: string, f: Record<string, unknown>) => ({ id, fields: f });
  const first = firstSendByClient([
    camp('recCAMP000000001A', { [KF.client]: ['recWS00000000001A'], [KF.status]: 'Active', [KF.sent]: 300, [KF.statusModified]: '2026-11-20T10:00:00.000Z' }),
    camp('recCAMP000000002A', { [KF.client]: ['recWS00000000001A'], [KF.status]: 'Active', [KF.sent]: 900 }),
    camp('recCAMP000000003A', { [KF.client]: ['recWS00000000001A'], [KF.status]: 'Draft', [KF.sent]: 0, [KF.created]: '2026-10-01T10:00:00.000Z' }),
    camp('recCAMP000000004A', { [KF.client]: ['recWS00000000002A'], [KF.status]: 'Active', [KF.sent]: 50, [KF.statusModified]: '2026-11-01T10:00:00.000Z' }),
  ] as any, ws as any, new Map([['recCAMP000000002A', '2026-11-18T09:00:00.000Z']]));
  assert.deepEqual([...first], [['twentywestmedia', '2026-11-18T09:00:00.000Z']], 'the launch job wins; a draft that never sent and inactive clients do not count');
});

/* ---------- bounces (pure) ---------- */
const b = (o: Partial<BounceRow> = {}): BounceRow => ({ id: 'r', lead: 'x@acme.com', domain: 'acme.com', inbox: 'a@x-mail.com', campaign: 'TWM - Roofers', campaignRec: 'recCAMP000000001A', clientKey: 'twentywestmedia', client: 'Twenty West', at: ago(1), code: '550', enhanced: '5.1.1', meaning: 'Address does not exist', hard: true, kind: 'not_found', landing: 'custom', gateway: '', verifier: '', emailType: 'Direct', ...o });
const many = (n: number, o: Partial<BounceRow> = {}) => Array.from({ length: n }, (_, i) => b({ id: `r${i}`, ...o }));

test('bounces: landing, kind and hard/soft from the Emails fields and the notice', () => {
  assert.deepEqual(['Google', 'Outlook', 'Microsoft 365', 'Mimecast', 'Proofpoint', 'Custom Mail Server', 'Zoho', 'Custom mail server', '', 'Unknown'].map((p) => landingOf(p).landing),
    ['google', 'microsoft', 'microsoft', 'gateway', 'gateway', 'custom', 'other', 'custom', 'unknown', 'unknown']);
  assert.equal(landingOf('Proofpoint').gateway, 'Proofpoint');
  assert.equal(kindOf('550 5.1.1 The email account that you tried to reach does not exist', '5.1.1'), 'not_found');
  assert.equal(kindOf('554 5.7.1 Message rejected due to spam content', '5.7.1'), 'blocked');
  assert.equal(kindOf('', '550'), 'not_found', 'a bare 550 is read as "address not found" (approximate)');
  assert.equal(kindOf('', '554'), 'blocked');
  assert.equal(kindOf('', '451'), 'other');
  assert.deepEqual([hardOf('Hard Bounce', '451'), hardOf('Soft Bounce', '550'), hardOf('', '550'), hardOf('', '421'), hardOf('', 'Unknown'), hardOf('Soft Bounce', 'Unknown')], [false, true, true, false, null, false], 'round 2: soft = any 4xx, hard = 5xx (the code wins over the Bounce Type)');
});

test('bounces: each view ends in one conclusion (gateway, custom servers, verification, one inbox, Microsoft, mixed, too few)', () => {
  assert.match(concludeBounces(many(3)).text, /^Only 3 bounces here → too few to judge/);
  assert.equal(concludeBounces(many(20)).text, 'Most bounces are 550 "address not found" on custom mail servers → stop sending to custom mail servers and re-verify the list');
  assert.equal(concludeBounces(many(20, { landing: 'google' })).text, 'Most bounces are 550 "address not found" → a verification problem: check the verifier on this list (Verification tab)');
  assert.equal(concludeBounces([...many(12, { landing: 'gateway', gateway: 'Mimecast', kind: 'blocked', code: '550', enhanced: '5.7.1' }), ...many(8, { landing: 'google' })]).text, '60% of bounces land on Mimecast → stop sending to Mimecast');
  assert.equal(concludeBounces(many(20, { kind: 'blocked', code: '550', enhanced: '5.7.1', landing: 'google', inbox: 'bad@x-mail.com' })).text, 'Most bounces are blocks from one inbox (bad@x-mail.com) → rest that inbox');
  const ms = Array.from({ length: 20 }, (_, i) => b({ id: `m${i}`, kind: 'blocked', code: '550', enhanced: '5.7.606', landing: 'microsoft', inbox: `s${i}@x-mail.com` }));
  assert.equal(concludeBounces(ms).text, 'Most bounces are Microsoft blocking us → pause sending to Outlook / Microsoft on this campaign');
  const mixed = [...many(5, { kind: 'blocked', code: '550', enhanced: '5.7.1', landing: 'google', inbox: 'p@x.com' }), ...many(5, { landing: 'google', inbox: 'q@x.com' }), ...many(5, { kind: 'other', code: '451', enhanced: '', landing: 'microsoft', inbox: 'r@x.com' })];
  const c = concludeBounces(mixed);
  assert.equal(c.text, 'Bounces are mixed → nothing to stop yet; keep watching');
  assert.ok(c.support.includes('15 bounces'));
});

test('bounces: grouping by code, hard vs soft, kind and landing; filters per client, campaign and inbox', () => {
  const rows = [...many(6), ...many(3, { code: '452', enhanced: '4.2.2', hard: false, kind: 'full', landing: 'google', inbox: 'z@x-mail.com' }), ...many(2, { clientKey: 'dulcy', client: 'Dulcy', campaign: 'Dulcy - Agencies', code: '550', enhanced: '5.7.1', kind: 'blocked', landing: 'gateway', gateway: 'Proofpoint' })];
  const s = bounceSummary(rows, {});
  assert.equal(s.total, 11);
  assert.deepEqual(s.byCode.map((x) => [x.key, x.n]), [['550', 8], ['452', 3]], 'grouped by the 3-digit SMTP code');
  assert.deepEqual(s.codes.map((x) => [x.code, x.soft, x.enhanced.map((e) => `${e.code}:${e.n}`).join(',')]), [['550', false, '5.1.1:6,5.7.1:2'], ['452', true, '4.2.2:3']], 'the enhanced codes are the detail');
  assert.equal(s.byCode[0].label, '550 · Mailbox unavailable (does not exist, or rejected)');
  assert.deepEqual(s.byType.map((x) => [x.key, x.n]), [['hard', 8], ['soft', 3]]);
  assert.deepEqual(s.byLanding.map((x) => [x.label, x.n]), [['Custom mail server', 6], ['Google', 3], ['Security gateway', 2]]);
  assert.deepEqual(s.gateways.map((x) => x.key), ['Proofpoint']);
  assert.deepEqual(s.options.clients.map((c) => c.key), ['dulcy', 'twentywestmedia']);
  const one = bounceSummary(rows, { client: 'twentywestmedia', account: 'z@x-mail.com' });
  assert.deepEqual([one.total, one.byKind[0].label], [3, 'Mailbox full']);
  assert.deepEqual(one.options.campaigns.map((c) => c.key), ['TWM - Roofers'], 'the campaign dropdown is per client');
  assert.deepEqual(bounceSummary(rows, { campaign: 'Dulcy - Agencies' }).total, 2);
});

test('verification: per campaign and verifier; many "address not found" = a verification problem', () => {
  const lists = new Map([['recLIST000000001A', { id: 'recLIST000000001A', name: 'Roofers', direct: 'LeadMagic', generic: 'MillionVerifier', directCount: 600, genericCount: 400, source: 'DiscoLike' }]]);
  const camps = [{ id: 'recCAMP000000001A', name: 'TWM - Roofers', clientKey: 'twentywestmedia', client: 'Twenty West', contacted: 1000, bounce: 4.2, status: 'Active', lists: ['recLIST000000001A'] }];
  const bounces = [...many(30, { verifier: '', emailType: 'Direct' }), ...many(4, { emailType: 'Generic', kind: 'blocked', code: '550', enhanced: '5.7.1' })];
  const [r] = verificationRows(camps, lists, bounces, []);
  assert.equal(r.verdict, 'problem');
  assert.deepEqual(r.cohorts.map((c) => [c.verifier, c.emailType, c.leads, c.contacted, c.contactedEstimated, c.bounces, c.notFound, c.rate]), [
    ['LeadMagic', 'Direct', 600, 600, true, 30, 30, 5], ['MillionVerifier', 'Generic', 400, 400, true, 4, 0, 1],
  ], 'the verifier comes from the list when the row is not tagged; contacted is estimated from the list mix');
  assert.match(r.line, /^LeadMagic \(Direct\) emails: 30 of 30 bounces are "address not found" → a verification problem/);
  // The old n8n cohorts give the real contacted number.
  const [r2] = verificationRows(camps, lists, bounces, [{ campaignRec: 'recCAMP000000001A', campaignName: '', provider: 'LeadMagic', emailType: 'Direct', leads: 600, contacted: 500, bounces: 0 }]);
  assert.deepEqual([r2.cohorts[0].contacted, r2.cohorts[0].contactedEstimated, r2.cohorts[0].rate], [500, false, 6]);
  const t = verifierTotals([r]);
  assert.deepEqual(t.map((x) => [x.verifier, x.bounces, x.notFound]), [['LeadMagic', 30, 30], ['MillionVerifier', 4, 0]]);
  const [few] = verificationRows(camps, lists, many(3), []);
  assert.equal(few.verdict, 'few');
  const [ok] = verificationRows(camps, lists, many(20, { kind: 'blocked', code: '550', enhanced: '5.7.1' }), []);
  assert.equal(ok.verdict, 'ok');
});

/* ---------- lead lists, domains (pure) ---------- */
test('lead lists: in progress, done (60 days), failed; a list bought without a campaign still shows', () => {
  const clients = clientIndex([{ id: 'recWS00000000001A', fields: { Name: 'MJJ Brilliant', Status: 'Active' } }] as any);
  const rec = (id: string, f: Record<string, unknown>, createdTime = ago(5)) => ({ id, fields: f, createdTime });
  const names = new Map([['recCAMP000000001A', 'MJJ - Jewelers']]);
  const a = leadListRow(rec('recLIST000000001A', { [LF.name]: 'MJJ list only', [LF.stage]: 'Verification', [LLF.client]: ['recWS00000000001A'], [LLF.companies]: 800, [LF.processing]: 'Running', [LLF.progress]: 40 }), clients, names)!;
  assert.deepEqual([a.group, a.listOnly, a.client, a.step, a.progress, a.owner], ['building', true, 'MJJ Brilliant', 7, 0.4, 'Scout']);
  const d = leadListRow(rec('recLIST000000002A', { [LF.name]: 'Done', [LF.stage]: 'Ready', [LF.qa]: 'Passed', [LF.finalDirect]: 900, [LF.finalGeneric]: 300, [LLF.campaigns]: ['recCAMP000000001A'], [LLF.directVerifier]: 'LeadMagic', [LLF.genericVerifier]: 'MillionVerifier', [LLF.client]: ['recWS00000000001A'] }), clients, names)!;
  assert.deepEqual([d.group, d.leads, d.verifiers, d.campaigns, d.listOnly], ['done', 1200, 'LeadMagic + MillionVerifier', [{ id: 'recCAMP000000001A', name: 'MJJ - Jewelers' }], false]);
  assert.equal(leadListRow(rec('recLIST000000003A', { [LF.stage]: 'Ready' }, ago(90)), clients, names), null, 'done long ago: left out');
  assert.equal(leadListRow(rec('recLIST000000004A', { [LF.stage]: 'Archived' }), clients, names), null);
  assert.equal(leadListRow(rec('recLIST000000005A', { [LF.stage]: 'QA', [LLF.hide]: true }), clients, names), null);
  assert.deepEqual([leadListRow(rec('recLIST000000006A', { [LF.stage]: 'Failed', [LF.lastError]: 'DiscoLike 500' }), clients, names)!.group, leadListRow(rec('recLIST000000006A', { [LF.stage]: 'Failed' }), clients, names)!.owner], ['failed', 'Riley']);
});

test('domains: renewal 1 year from the date added when unknown (estimated); the blacklist cell in words', () => {
  assert.deepEqual(renewalOf('2027-03-01', '2026-01-01'), { date: '2027-03-01', estimated: false });
  assert.deepEqual(renewalOf('', '2026-02-10'), { date: '2027-02-10', estimated: true });
  assert.deepEqual(renewalOf('', '2028-02-29'), { date: '2029-02-28', estimated: true });
  assert.deepEqual(renewalOf('', ''), { date: '', estimated: false });
  const t = (blacklist: string, count = 0, monitoring = 'Active') => blacklistText({ blacklist, count, monitoring, lastCheck: '' }).text;
  assert.deepEqual([t('Clean'), t('Listed', 2), t('Check Failed'), t('Pending'), t('', 0, 'Not Added'), t('Unknown')], ['Clean', 'Listed (2)', 'Check failed', 'Checking', 'Not checked', 'Not checked']);
  assert.match(blacklistText({ blacklist: '', count: 0, monitoring: 'Not Added', lastCheck: '' }).why, /Not added to EmailGuard/);
});

/* ---------- the API (fake Airtable in memory) and the job (fake EmailBison + fake Airtable over HTTP) ---------- */
let db: Db;
let server: http.Server;
let port = 0;
let tables: Record<string, Record<string, Record<string, unknown>>>;
let writes: unknown[];
const memAt = {
  async list(table: string) { return Object.entries(tables[table] ?? {}).map(([id, f]) => ({ id, fields: { ...f }, createdTime: String(f._created ?? ago(3)) })); },
  async get(table: string, id: string) { const f = tables[table]?.[id]; return f ? { id, fields: { ...f } } : null; },
  async create(table: string, fields: Record<string, unknown>) { writes.push({ table, fields }); return 'recNEW00000000001'; },
  async update(table: string, id: string, fields: Record<string, unknown>) { writes.push({ table, id, fields }); },
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
before(async () => {
  bison = await startFakeBison();
  atServer = http.createServer((req, res) => {
    const u = new URL(req.url ?? '/', 'http://x'); const parts = u.pathname.split('/'); const table = parts[3];
    const rows = (httpRows[table] ??= {});
    res.setHeader('content-type', 'application/json');
    if (req.method === 'GET') return res.end(JSON.stringify({ records: Object.entries(rows).map(([id, r]) => ({ id, fields: r.fields })) }));
    let raw = ''; req.on('data', (c) => (raw += c));
    req.on('end', () => {
      const x = JSON.parse(raw || '{}');
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
after(async () => { bison.close(); atServer.close(); if (!skip) { server.close(); await db.end(); } });
beforeEach(async () => {
  tables = {}; writes = []; httpRows = {}; _resetDelivCache(); _resetRampCache(); _resetBounceCache(); _resetCampaignsCache();
  (bison as any).dailyLimits = {}; (bison as any).warmupLimits = {}; (bison as any).limitTeams = []; bison.calls.length = 0;
  if (skip) return;
  await db.query('TRUNCATE hq_users, hq_sessions, hq_login_attempts, jobs, steps, receipts, events, hq_agent_tasks RESTART IDENTITY CASCADE');
  await upsertUser(db, 'Alex@dulcy.io', 'owner', PW, 'Alex');
  await upsertUser(db, 'josh@dulcy.io', 'member', 'josh long password 1', 'Josh');
});

function fixture() {
  const acct = (email: string, id: number, extra: Record<string, unknown> = {}) => ({
    [EA.email]: email, [EA.emailId]: id, [EA.workspaceId]: 7, [EA.client]: ['recWSTWM00000010A'], [EX.connection]: 'Connected', [EX.warmupOn]: true, [EX.lastWarmupCheck]: ago(1),
    [EX.warmupScore]: 97, [EA.dailyLimit]: 5, [EX.warmupLimit]: 10, ...extra,
  });
  tables[WORKSPACES_T] = { recWSTWM00000010A: { Name: 'Twenty West Media', ID: '7', Status: 'Active' }, recWSLFM00000010A: { Name: 'Lead Flo Marketing', ID: '3', Status: 'Inactive' } };
  tables[ACCOUNTS] = {
    recACCA000000001A: acct('a@twm-mail.com', 101),
    recACCB000000001A: acct('b@twm-mail.com', 102),
    recACCC000000001A: acct('c@twm-mail.com', 103, { [EA.stage]: 'Resting 7 Days', [EA.dailyLimit]: 0 }),
    recACCD000000001A: acct('d@twm-mail.com', 104, { [EX.warmupOn]: false }),
  };
  tables[CAMPAIGNS_T] = { recCAMPTWM000010A: { [KF.name]: 'TWM - Roofers', [KF.status]: 'Active', [KF.client]: ['recWSTWM00000010A'], [KF.sent]: 400, [KF.contacted]: 400, [KF.statusModified]: ago(9), [KF.emailAccounts]: ['recACCA000000001A', 'recACCD000000001A'], [KF.thesis]: '<p>Roofers who **lost** storm jobs</p>', [KF.approach]: 'Case Study', [KF.lists]: ['recLISTTWM000100A'] } };
  tables[LEAD_LISTS_T] = {
    recLISTTWM000100A: { [LF.name]: 'Roofers', [LF.stage]: 'Uploaded', [LF.finalDirect]: 300, [LF.finalGeneric]: 100, [LLF.client]: ['recWSTWM00000010A'], [LLF.campaigns]: ['recCAMPTWM000010A'], [VL.directVerifier]: 'LeadMagic', [VL.genericVerifier]: 'MillionVerifier', [LF.completedAt]: ago(10) },
    recLISTONLY00010A: { [LF.name]: 'Just a list', [LF.stage]: 'Enrichment', [LLF.client]: ['recWSTWM00000010A'] },
    recLISTLFM000010A: { [LF.name]: 'Old client list', [LF.stage]: 'QA', [LLF.client]: ['recWSLFM00000010A'] },
  };
  tables[EMAILS] = Object.fromEntries(Array.from({ length: 12 }, (_, i) => [`recBOUNCE${String(i).padStart(7, '0')}A`, {
    [BF.lead]: `p${i}@acme${i % 3}.com`, [BF.status]: 'Bounced', [BF.provider]: i < 9 ? 'Custom Mail Server' : 'Google', [BF.inbox]: 'a@twm-mail.com', [BF.campaignName]: 'TWM - Roofers', [BF.campaign]: ['recCAMPTWM000010A'],
    [BF.code]: '550', [BF.type]: 'Hard Bounce', [BF.latest]: '<p>550 5.1.1 The email account does not exist</p>', [BF.clients]: ['recWSTWM00000010A'], [BF.emailType]: 'Direct', [BF.statusAt]: ago(2),
  }]));
}

test('limits API: owner only, confirm required, queued as a DRY RUN unless inbox.limits is in LIVE_STAGES', { skip }, async () => {
  fixture();
  assert.equal((await call('POST', '/hq/api/deliverability/limits', undefined, { client: 'twentywestmedia', cold: 10, confirm: true })).status, 401);
  const josh = await login('josh@dulcy.io', 'josh long password 1');
  assert.equal((await call('POST', '/hq/api/deliverability/limits', josh, { client: 'twentywestmedia', cold: 10, confirm: true })).status, 403, 'members cannot change limits');
  const cookie = await login();
  const no = await call('POST', '/hq/api/deliverability/limits', cookie, { client: 'twentywestmedia', cold: 10 });
  assert.equal(no.status, 400);
  assert.match(no.body.error, /confirm: true is required/);
  assert.equal((await db.query(`SELECT count(*)::int AS n FROM jobs`)).rows[0].n, 0, 'nothing queued without confirm');
  const r = await call('POST', '/hq/api/deliverability/limits', cookie, { client: 'twentywestmedia', cold: 10, warmup: 20, confirm: true, reason: 'ramp week 2' });
  assert.equal(r.status, 200, r.text);
  assert.deepEqual([r.body.dryRun, r.body.changes, r.body.summary], [true, 4, '4 inboxes of Twenty West → cold 10/day, warm-up 20/day']);
  assert.deepEqual(r.body.skipped.map((s: any) => s.email), ['c@twm-mail.com'], 'the resting inbox keeps its 0 cold (its warm-up still moves)');
  const job = (await db.query(`SELECT kind, dry_run, input FROM jobs`)).rows[0];
  assert.deepEqual([job.kind, job.dry_run, job.input.by, job.input.changes.length], [LIMITS_STAGE, true, 'Alex', 4]);
  // The same press again within the minute is the same job.
  const again = await call('POST', '/hq/api/deliverability/limits', cookie, { client: 'twentywestmedia', cold: 10, warmup: 20, confirm: true });
  assert.equal(again.body.duplicate, true);
  // Nothing to change.
  assert.equal((await call('POST', '/hq/api/deliverability/limits', cookie, { accounts: ['recACCA000000001A'], cold: 5, confirm: true })).status, 409);
  assert.equal(writes.length, 0, 'HQ wrote nothing to Airtable; the job does');
  // Live only when switched on.
  const plan = planLimitChange([inbox()], { accounts: [], client: 'twentywestmedia', cold: 10, warmup: null, reason: '' });
  const live = await queueLimitChange(db, cfg({ liveStages: [LIMITS_STAGE] }), { ...plan, clientKey: 'dulcy' }, 'Alex');
  assert.equal(live.job.dry_run, false);
  // History.
  const h = await call('GET', '/hq/api/deliverability/limits', cookie);
  assert.equal(h.status, 200, h.text);
  assert.equal(h.body.live, false);
  assert.ok(h.body.history.some((x: any) => x.dryRun && x.changes.length === 4));
});

test('limits job: dry run calls nothing; live sets EmailBison (one bulk call per value), mirrors Airtable, logs it, never twice', { skip }, async () => {
  const changes = [
    { rec: 'recACCA000000001A', email: 'a@twm-mail.com', clientKey: 'twentywestmedia', client: 'Twenty West', senderId: 101, teamId: 7, cold: { from: 5, to: 10 }, warmup: { from: 10, to: 20 } },
    { rec: 'recACCB000000001A', email: 'b@twm-mail.com', clientKey: 'twentywestmedia', client: 'Twenty West', senderId: 102, teamId: 7, cold: { from: 5, to: 10 } },
  ];
  const conf = (live: boolean) => ({ ...cfg(), emailBisonKeys: { dulcy: bison.key }, emailBisonBaseUrl: bison.url, airtableApiKey: 'at', airtableBaseUrl: atUrl, dryRun: true, liveStages: live ? [LIMITS_STAGE] : [] }) as Config;
  const run = async (c: Config, requestId: string) => {
    const q = await enqueue(db, { kind: LIMITS_STAGE, recordId: 'limits:twentywestmedia', requestId, input: { changes, by: 'Alex', client: 'Twenty West', clientKey: 'twentywestmedia', rampKey: 'ramp:twentywestmedia:10' }, dryRun: !c.liveStages.includes(LIMITS_STAGE), maxAttempts: 3, deadlineMs: 60_000 });
    for (let i = 0; i < 10; i++) { await runOnce(db, c); const j = await getJob(db, q.job.id); if (['succeeded', 'failed', 'needs_review'].includes(j!.job.status)) return j!.job; }
    throw new Error('job did not settle');
  };
  const dry = await run(conf(false), 'r1');
  assert.equal(dry.status, 'succeeded', JSON.stringify(dry));
  assert.match(String((dry.result as any).message), /^Dry run \(nothing changed in EmailBison\): 2 inboxes of Twenty West/);
  assert.deepEqual(bison.calls.filter((c) => c.startsWith('PATCH')), [], 'dry run: no EmailBison write');
  assert.deepEqual(Object.keys(httpRows[ACTIVITY] ?? {}), [], 'dry run: no Activity Log row');
  await db.query(`INSERT INTO hq_agent_tasks (agent, title, status, source_key) VALUES ('Atlas','Ramp','waiting_alex','ramp:twentywestmedia:10')`);
  const live = await run(conf(true), 'r2');
  assert.equal(live.status, 'succeeded', JSON.stringify(live));
  assert.deepEqual((bison as any).dailyLimits, { 101: 10, 102: 10 });
  assert.deepEqual((bison as any).warmupLimits, { 101: 20 });
  assert.deepEqual(bison.calls.filter((c) => c.startsWith('PATCH')).sort(), ['PATCH /api/sender-emails/daily-limits/bulk', 'PATCH /api/warmup/sender-emails/update-daily-warmup-limits'], 'one bulk call per value');
  assert.deepEqual((bison as any).limitTeams, [7], 'in the inboxes\' own workspace');
  assert.deepEqual(httpRows[ACCOUNTS].recACCA000000001A.fields, { [EA.dailyLimit]: 10, [EX.warmupLimit]: 20 }, 'Email Accounts mirrors the new numbers');
  const log = Object.values(httpRows[ACTIVITY] ?? {});
  assert.equal(log.length, 1);
  assert.match(String(Object.values(log[0].fields)[0]), /^Inbox limits changed: 2 inboxes of Twenty West → cold 10\/day, warm-up 20\/day$/);
  assert.equal((await db.query(`SELECT status FROM hq_agent_tasks WHERE source_key='ramp:twentywestmedia:10'`)).rows[0].status, 'done', 'the ramp task closes when applied');
  const receipts = (await db.query(`SELECT status FROM receipts WHERE provider='emailbison' ORDER BY receipt_key`)).rows.map((x) => x.status);
  assert.deepEqual(receipts.filter((x) => x === 'done').length, 2, 'a receipt per call');
});

test('limits view: the ramp proposal for a new client; Atlas task via atlas.ramp only proposes', { skip }, async () => {
  fixture();
  await db.query(`INSERT INTO jobs (kind, record_id, status, dry_run, updated_at) VALUES ('campaign.launch','recCAMPTWM000010A','succeeded',false, now() - interval '9 days')`);
  const cookie = await login();
  const r = await call('GET', '/hq/api/deliverability/limits?client=twentywestmedia', cookie);
  assert.equal(r.status, 200, r.text);
  assert.deepEqual(r.body.proposals.map((p: any) => [p.key, p.to.cold, p.to.warmup, p.emails.length]), [['ramp:twentywestmedia:10', 10, 20, 3]], 'a, b and d (warm-up off still ramps); c is resting');
  assert.match(r.body.rule, /5 cold \/ 10 warm-up/);
  assert.equal((await db.query(`SELECT count(*)::int AS n FROM jobs WHERE kind=$1`, [LIMITS_STAGE])).rows[0].n, 0, 'a proposal applies nothing');
});

test('bounces + verification API: grouping, one conclusion, filters; read only', { skip }, async () => {
  fixture();
  const cookie = await login('josh@dulcy.io', 'josh long password 1');
  const r = await call('GET', '/hq/api/deliverability/bounces?days=30', cookie);
  assert.equal(r.status, 200, r.text);
  assert.equal(r.body.total, 12);
  assert.deepEqual(r.body.byCode.map((x: any) => [x.key, x.n]), [['550', 12]]);
  assert.equal(r.body.conclusion.text, 'Most bounces are 550 "address not found" on custom mail servers → stop sending to custom mail servers and re-verify the list');
  assert.deepEqual(r.body.options.accounts.map((a: any) => a.key), ['a@twm-mail.com']);
  const none = await call('GET', '/hq/api/deliverability/bounces?account=nobody@x.com', cookie);
  assert.equal(none.body.total, 0);
  const v = await call('GET', '/hq/api/deliverability/verification', cookie);
  assert.equal(v.status, 200, v.text);
  assert.deepEqual(v.body.campaigns.map((c: any) => [c.name, c.verdict]), [['TWM - Roofers', 'problem']]);
  assert.equal(v.body.campaigns[0].cohorts[0].verifier, 'LeadMagic');
  assert.match(v.body.conclusion.text, /^1 campaign has mostly "address not found" bounces → re-verify/);
  assert.equal(writes.length, 0);
});

test('campaigns: Campaign Center fields, sending accounts with their status, the lead lists view', { skip }, async () => {
  fixture();
  const cookie = await login();
  const r = await call('GET', '/hq/api/campaigns', cookie);
  assert.equal(r.status, 200, r.text);
  const row = r.body.rows.find((x: any) => x.id === 'recCAMPTWM000010A');
  assert.deepEqual([row.approach, row.strategy, row.accounts, row.sending.total, row.sending.healthy, row.sending.risk, row.sending.warmupOff], ['Case Study', 'Roofers who lost storm jobs', 2, 2, 1, 1, 1]);
  assert.deepEqual(r.body.clients.map((c: any) => c.key), ['twentywestmedia'], 'active clients only (no Lead Flo)');
  const d = await call('GET', '/hq/api/campaigns/recCAMPTWM000010A', cookie);
  assert.deepEqual(d.body.accounts.map((a: any) => [a.email, a.status, a.warmupOff]), [['d@twm-mail.com', 'risk', true], ['a@twm-mail.com', 'healthy', false]], 'worst first');
  assert.ok(!/airtable\.com/.test(d.text));
  const l = await call('GET', '/hq/api/campaigns/lists', cookie);
  assert.equal(l.status, 200, l.text);
  assert.deepEqual(l.body.rows.map((x: any) => [x.name, x.group, x.listOnly]), [['Just a list', 'building', true], ['Roofers', 'done', false]], 'the list-only purchase shows; inactive clients do not');
  assert.equal(l.body.counts.listOnly, 1);
});

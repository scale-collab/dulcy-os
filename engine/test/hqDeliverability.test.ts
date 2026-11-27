// HQ Deliverability: the "sick" rules (placement, rest, disconnect, warm-up, blacklist, expiry,
// bounce), the stale-placement warning, and the API (tiles, Needs attention, All inboxes,
// Placement tests, Domains). Read only: no write ever reaches the fake Airtable.
import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { createPool, migrate, type Db } from '../src/db/pool.js';
import { loadConfig, type Config } from '../src/config.js';
import { createServer } from '../src/http.js';
import { upsertUser } from '../src/hq/auth.js';
import { ACCOUNTS, DOMAINS, DM, EA, PLACEMENT, PT, QUEUE, SQ } from '../src/stages/accountHealth.js';
import { DECISIONS, DF } from '../src/decisions/fields.js';
import { WORKSPACES } from '../src/hq/inbox.js';
import {
  DPR, DX, EX, LIMITS, PURCHASES, _resetDelivCache, dataNotes, domainReasons, fridayOnOrAfter, freshnessNotes, inboxDoing, inboxReasons, nyDate, placementFreshness, statusOf, type InboxFacts,
} from '../src/hq/deliverability.js';

const url = process.env.TEST_DATABASE_URL;
const skip = !url ? 'TEST_DATABASE_URL not set' : false;
const PW = 'correct horse battery staple';
const LOGIN_PASSWORD_FIELD = 'fldCgvkLFPb77PvZQ';
let db: Db;
let server: http.Server;
let port = 0;

let tables: Record<string, Record<string, Record<string, unknown>>>;
let writes: unknown[];
let lists: { table: string; fields: string[] }[];
const at = {
  async list(table: string, _formula: string, fields: string[]) { lists.push({ table, fields }); return Object.entries(tables[table] ?? {}).map(([id, f]) => ({ id, fields: { ...f }, createdTime: String(f._created ?? '2026-11-25T10:00:00.000Z') })); },
  async get(table: string, id: string) { const f = tables[table]?.[id]; return f ? { id, fields: { ...f } } : null; },
  async create(table: string, fields: Record<string, unknown>) { writes.push({ table, fields }); return 'recNEW00000000001'; },
  async update(table: string, id: string, fields: Record<string, unknown>) { writes.push({ table, id, fields }); },
};

function cfg(over: Partial<Config> = {}): Config {
  return { ...loadConfig({ ENGINE_SECRET: 'x'.repeat(40), DATABASE_URL: url ?? 'postgres://x', HQ_SESSION_SECRET: 's'.repeat(40), HQ_HOST: 'hq.test.local', ACCOUNT_HEALTH_EVERY_MIN: '60' } as NodeJS.ProcessEnv), airtableApiKey: undefined, anthropicApiKey: undefined, ...over };
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
      res.on('end', () => { const text = Buffer.concat(chunks).toString('utf8'); let b: any = null; try { b = JSON.parse(text); } catch { /* not json */ } resolve({ status: res.statusCode ?? 0, body: b, text, headers: res.headers }); });
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
  server = createServer(db, cfg(), { at: at as any, webDir: '/nonexistent' });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', () => r()));
  port = (server.address() as AddressInfo).port;
});
after(async () => { if (!skip) { server.close(); await db.end(); } });
beforeEach(async () => {
  tables = {}; writes = []; lists = []; _resetDelivCache();
  if (skip) return;
  await db.query('TRUNCATE hq_users, hq_sessions, hq_login_attempts, hq_user_events, jobs, steps, receipts, events RESTART IDENTITY CASCADE');
  await upsertUser(db, 'Alex@dulcy.io', 'owner', PW, 'Alex');
});

// ---------- the sick rules (pure) ----------
const base: InboxFacts = { stage: '', airtableStatus: '', score: null, scoreAt: '', test: null, connection: 'Connected', warmupOn: true, warmupScore: 98, warmupDisable: '', bounced: 0, contacted: 0, protocolError: '' };
const codes = (f: Partial<InboxFacts>) => inboxReasons({ ...base, ...f }).map((r) => `${r.code}:${r.level}:${r.owner}`);

test('sick rules: placement under 60% sick, 60-74 watch; disconnected (Riley); warm-up; bounce over 4% / 2.5% with a floor', () => {
  assert.deepEqual(codes({}), [], 'a healthy inbox has no reasons');
  assert.deepEqual(codes({ score: 59 }), ['placement:spam:Atlas']);
  assert.deepEqual(codes({ score: LIMITS.placementRest }), ['placement:risk:Atlas'], '60 is not under 60');
  assert.deepEqual(codes({ score: 75 }), []);
  assert.deepEqual(codes({ connection: 'Disconnected' }), ['disconnected:spam:Riley']);
  assert.deepEqual(codes({ connection: '' }), [], 'no connection data is not a disconnect');
  assert.deepEqual(codes({ warmupDisable: 'Warmup disabled for causing bounces' }), ['warmup:spam:Atlas']);
  assert.deepEqual(codes({ warmupDisable: 'Warmup disabled for receiving bounces. You can enable after 24 hours.' }), ['warmup:risk:Atlas']);
  assert.deepEqual(codes({ warmupOn: false }), ['warmupOff:risk:Atlas']);
  assert.deepEqual(codes({ warmupOn: null }), [], 'never synced: unknown, not "off"');
  assert.deepEqual(codes({ warmupScore: 49 }), ['warmupScore:spam:Atlas']);
  assert.deepEqual(codes({ warmupScore: 69 }), ['warmupScore:risk:Atlas']);
  assert.deepEqual(codes({ warmupScore: 70 }), []);
  assert.deepEqual(codes({ bounced: 9, contacted: 150 }), ['bounce:spam:Atlas'], '6%');
  assert.deepEqual(codes({ bounced: 4, contacted: 130 }), ['bounce:risk:Atlas'], '3.1%');
  assert.deepEqual(codes({ bounced: 4, contacted: 99 }), [], 'under 100 contacted: too early to judge');
  assert.deepEqual(codes({ stage: 'Replace Domain', score: 30, airtableStatus: 'Spam' }), ['replace:spam:Atlas'], 'a replacement is one reason, not three');
  assert.deepEqual(codes({ airtableStatus: 'Spam' }), ['airtable:spam:Atlas']);
  assert.deepEqual(codes({ protocolError: 'no EmailBison key' }), ['loopError:risk:Riley']);
});

test('status: sick beats resting; resting covers its own placement / bounce; watch; healthy', () => {
  const r = (code: string, level: 'spam' | 'risk') => ({ code, level, text: code, owner: 'Atlas' as const });
  assert.equal(statusOf([], false), 'healthy');
  assert.equal(statusOf([r('placement', 'spam')], false), 'spam');
  assert.equal(statusOf([r('placement', 'spam')], true), 'resting', 'the rest is the fix for a bad score');
  assert.equal(statusOf([r('bounce', 'spam')], true), 'resting');
  assert.equal(statusOf([r('disconnected', 'spam')], true), 'spam', 'a disconnect while resting still needs a person');
  assert.equal(statusOf([r('blacklist', 'spam')], true), 'spam');
  assert.equal(statusOf([r('warmupScore', 'risk')], false), 'risk');
  assert.equal(statusOf([r('warmupScore', 'risk')], true), 'resting');
});

test('domain rules: blacklisted sick, check failed / monitoring error (Riley) watch, expired sick, expiring in 30 days watch', () => {
  const now = new Date('2026-11-26T15:00:00Z');
  const d = { blacklist: 'Clean', blacklistCount: 0, found: '', monitoring: 'Active', health: 'Healthy', renewal: '', purchaseStatus: 'Provisioned' };
  const c = (f: Partial<typeof d>) => domainReasons({ ...d, ...f }, now).map((r) => `${r.code}:${r.level}:${r.owner}`);
  assert.deepEqual(c({}), []);
  assert.deepEqual(c({ blacklist: 'Listed', blacklistCount: 2, found: 'spamhaus\nbarracuda' }), ['blacklist:spam:Atlas']);
  assert.match(domainReasons({ ...d, blacklist: 'Listed', blacklistCount: 2, found: 'spamhaus\nbarracuda' }, now)[0].text, /^Blacklisted on 2: spamhaus barracuda$/);
  assert.deepEqual(c({ blacklist: 'Check Failed' }), ['blacklistCheck:risk:Riley']);
  assert.deepEqual(c({ monitoring: 'Error' }), ['monitoring:risk:Riley']);
  assert.deepEqual(c({ renewal: '2026-11-20' }), ['expired:spam:Atlas']);
  assert.deepEqual(c({ renewal: '2026-12-06' }), ['expiring:risk:Atlas']);
  assert.equal(domainReasons({ ...d, renewal: '2026-12-06' }, now)[0].text, 'Expires in 10 days (12/6)');
  assert.deepEqual(c({ renewal: '2027-01-30' }), [], 'more than 30 days away');
  assert.deepEqual(c({ renewal: '2026-11-20', purchaseStatus: 'Cancelled' }), [], 'a cancelled domain does not expire on us');
});

test('what the engine is doing: rested + retest Friday, health loop next run / start date / off, replacement waiting', () => {
  const ctx = { loopOn: true, live: true, healthFrom: '2026-11-26T12:00:00.000Z', replacement: null };
  const extra = { restStarted: '2026-11-24T15:00:00.000Z', retestDue: '2026-12-01T03:00:00.000Z', dailyLimit: 0, previousLimit: 30 };
  assert.equal(inboxDoing({ ...base, ...extra, stage: 'Resting 7 Days' }, [], ctx), 'Rested 11/24, retest Fri 12/4 · limit 0 (was 30).');
  const t = (at: string, processed = false) => ({ id: 'recT', email: 'a@x.com', score: 40, google: 40, outlook: 40, at, processed, outcome: '', error: '' });
  const sick = inboxReasons({ ...base, score: 40 });
  assert.match(inboxDoing({ ...base, ...extra, score: 40, test: t('2026-11-21T15:00:00.000Z') }, sick, ctx), /^Test is from before the health loop started \(11\/26\): Friday's test decides\.$/);
  assert.equal(inboxDoing({ ...base, ...extra, score: 40, test: t('2026-11-27T15:00:00.000Z') }, sick, ctx), 'Health loop rests it on its next run.');
  assert.equal(inboxDoing({ ...base, ...extra, score: 40, test: t('2026-11-27T15:00:00.000Z') }, sick, { ...ctx, live: false }), 'Health loop rests it on its next run (dry run: it reports only).');
  assert.equal(inboxDoing({ ...base, ...extra, score: 40, test: t('2026-11-27T15:00:00.000Z') }, sick, { ...ctx, loopOn: false }), 'Health loop is off on the server: nothing automatic.');
  assert.equal(inboxDoing({ ...base, ...extra, stage: 'Replace Domain' }, [], ctx), 'Replacement waiting for your OK in Decisions. The inbox stays at 0/day.');
  assert.equal(inboxDoing({ ...base, ...extra, connection: 'Disconnected' }, inboxReasons({ ...base, connection: 'Disconnected' }), ctx), 'Nothing automatic: reconnect it in EmailBison.');
  assert.equal(fridayOnOrAfter('2026-11-27'), '2026-11-27');
  assert.equal(fridayOnOrAfter('2026-11-28'), '2026-12-04');
});

// ---------- placement freshness (pure) ----------
test('placement freshness: fine at 5 days; Friday missing from Sunday; stale after 7 days', () => {
  const newest = '2026-11-21T15:00:00.000Z';
  const thu = placementFreshness(newest, new Date('2026-11-26T15:00:00Z'), 12);
  assert.deepEqual(thu, { newest: '2026-11-21', ageDays: 5, stale: false, expectedFriday: '2026-11-20', fridayMissing: false, nextFriday: '2026-11-27', tests: 12, lastTest: '2026-11-21', nextTest: '2026-11-27' });
  const sat = placementFreshness(newest, new Date('2026-11-28T15:00:00Z'));
  assert.deepEqual([sat.expectedFriday, sat.fridayMissing, sat.ageDays, sat.stale], ['2026-11-20', false, 7, false], 'Friday results may still come in on Saturday; 7 days is not "more than 7"');
  const sun = placementFreshness(newest, new Date('2026-11-29T15:00:00Z'));
  assert.deepEqual([sun.expectedFriday, sun.fridayMissing, sun.ageDays, sun.stale], ['2026-11-27', true, 8, true]);
  const none = placementFreshness('', new Date('2026-11-26T15:00:00Z'));
  assert.deepEqual([none.ageDays, none.stale, none.fridayMissing], [null, true, true]);
});

test('stale-placement warning: Problem → Data → Fix, the audit\'s missing workflow, gone once Friday\'s scores land', () => {
  const opts = { healthFrom: '2026-11-26T12:00:00.000Z', loopOn: true };
  const newest = '2026-11-21T15:00:00.000Z';
  // Thursday 11-26 (today): not stale yet, but no scores since the audit → a warning for Friday.
  const [warn, ...rest] = freshnessNotes(placementFreshness(newest, new Date('2026-11-26T15:00:00Z')), opts);
  assert.equal(rest.length, 0);
  assert.equal(warn.level, 'warn');
  assert.equal(warn.owner, 'Riley');
  assert.equal(warn.problem, "Friday 11/27's placement scores may not arrive.");
  assert.match(warn.data, /^Newest score 11\/21 \(5 days ago\)\. The n8n Inbox Placement "Check Results" workflow \(xcteI9ofNLOqC0GO\) was not visible in the 11\/25 audit\. The health loop only reads tests from 11\/26, so it needs Friday 11\/27's\.$/);
  assert.match(warn.fix, /^Riley: confirm the workflow runs before Friday 11\/27\.$/);
  assert.ok(warn.why.length > 0, 'every note says why');
  // Sunday 11-29 with nothing new: stale (8 days) and bad.
  const [bad] = freshnessNotes(placementFreshness(newest, new Date('2026-11-29T15:00:00Z')), opts);
  assert.deepEqual([bad.level, bad.problem], ['bad', 'Placement scores are 8 days old.']);
  assert.match(bad.data, /xcteI9ofNLOqC0GO/);
  // Friday missing but not yet 7 days old.
  const [missing] = freshnessNotes(placementFreshness('2026-11-24T15:00:00.000Z', new Date('2026-11-29T15:00:00Z')), opts);
  assert.deepEqual([missing.level, missing.problem], ['bad', "Friday 11/27's placement scores are missing."]);
  // Friday 11-27's scores arrived: no note.
  assert.deepEqual(freshnessNotes(placementFreshness('2026-11-27T18:00:00.000Z', new Date('2026-11-28T15:00:00Z')), opts), []);
  // The loop switched off is said too.
  assert.ok(freshnessNotes(placementFreshness('2026-11-27T18:00:00.000Z', new Date('2026-11-28T15:00:00Z')), { ...opts, loopOn: false }).some((n) => /health loop is off/i.test(n.problem)));
});

// ---------- the API ----------
const FRI = '2026-11-21T15:00:00.000Z';
function fixture(now = new Date()) {
  const daysAgo = (d: number) => new Date(now.getTime() - d * 86_400_000).toISOString();
  const inDays = (d: number) => new Date(Date.parse(`${nyDate(now)}T12:00:00Z`) + d * 86_400_000).toISOString().slice(0, 10); // New York days, like the server
  const acct = (email: string, ws: string, extra: Record<string, unknown> = {}) => ({
    [EA.email]: email, [EA.emailId]: Math.floor(Math.random() * 1e6), [EA.workspaceId]: 2, [EA.client]: [ws], [EX.connection]: 'Connected', [EX.warmupOn]: true, [EX.lastWarmupCheck]: daysAgo(1),
    [EX.warmupScore]: 97, [EX.contacted]: 500, [EX.bounced]: 2, [EA.dailyLimit]: 30, [LOGIN_PASSWORD_FIELD]: 'hunter2-secret', ...extra,
  });
  tables = {
    [WORKSPACES]: {
      recTWMINT00000001: { Name: 'Twenty West Media (Internal)', ID: '2', Status: 'Active', 'Client Type': 'Paying Client' },
      recTWMOLD00000001: { Name: 'Twenty West Media', ID: '1', Status: 'Inactive' },
      recLFM00000000001: { Name: 'Lead Flo Marketing', ID: '3', Status: 'Inactive' },
      recDULCY000000001: { Name: 'Dulcy', ID: '4', Status: 'Active', 'Client Type': 'Internal' },
    },
    [ACCOUNTS]: {
      recACCA0000000001: acct('a@twm-mail.com', 'recTWMINT00000001', { [EA.domains]: ['recDOMMAIL0000001'] }),
      recACCB0000000001: acct('b@twm-mail.com', 'recTWMINT00000001', { [EA.domains]: ['recDOMMAIL0000001'], [EA.stage]: 'Resting 7 Days', [EA.status]: 'Resting', [EA.restStarted]: '2026-11-24T15:00:00.000Z', [EA.retestDue]: '2026-12-01T03:00:00.000Z', [EA.dailyLimit]: 0, [EA.previousLimit]: 30 }),
      recACCC0000000001: acct('c@twm-reach.com', 'recTWMOLD00000001', { [EX.connection]: 'Disconnected' }),
      recACCD0000000001: acct('d@twm-reach.com', 'recTWMINT00000001', { [EX.warmupScore]: 62 }),
      recACCE0000000001: acct('e@listed.com', 'recTWMINT00000001', { [EA.domains]: ['recDOMLIST0000001'] }),
      recACCF0000000001: acct('f@listed.com', 'recTWMINT00000001', { [EA.domains]: ['recDOMLIST0000001'] }),
      recACCG0000000001: acct('g@dulcy-ok.com', 'recDULCY000000001', { [EA.domains]: ['recDOMOK000000001'] }),
      recACCH0000000001: acct('h@dulcy-ok.com', 'recDULCY000000001', { [EA.domains]: ['recDOMOK000000001'], [EX.contacted]: 150, [EX.bounced]: 9 }),
      recACCX0000000001: acct('x@dulcy-try.com', 'recDULCY000000001', { [EA.stage]: 'Replace Domain', [EA.status]: 'Spam', [EA.dailyLimit]: 0, [EA.queue]: ['recQUEUE000000001'] }),
      recACCL0000000001: acct('lf@leadflo.com', 'recLFM00000000001', { [EX.connection]: 'Disconnected' }),
    },
    [DOMAINS]: {
      recDOMMAIL0000001: { [DM.name]: 'twm-mail.com', [DX.client]: ['recTWMINT00000001'], [DM.blacklistStatus]: 'Clean', [DX.renewal]: inDays(200) },
      recDOMLIST0000001: { [DM.name]: 'listed.com', [DX.client]: ['recTWMINT00000001'], [DM.blacklistStatus]: 'Listed', [DM.blacklistCount]: 2, [DM.blacklistsFound]: 'spamhaus\nbarracuda', [DX.renewal]: inDays(200) },
      recDOMOK000000001: { [DM.name]: 'dulcy-ok.com', [DX.client]: ['recDULCY000000001'], [DM.blacklistStatus]: 'Clean', [DX.renewal]: inDays(10) },
    },
    [PLACEMENT]: {
      recTESTA00000001: { [PT.email]: 'a@twm-mail.com', [PT.overall]: 45, [PT.google]: 30, [PT.outlook]: 60, [PT.client]: ['recTWMINT00000001'], _created: FRI },
      recTESTA00000000: { [PT.email]: 'a@twm-mail.com', [PT.overall]: 88, [PT.client]: ['recTWMINT00000001'], _created: '2026-11-14T15:00:00.000Z' },
      recTESTB00000001: { [PT.email]: 'b@twm-mail.com', [PT.overall]: 40, [PT.client]: ['recTWMINT00000001'], _created: FRI },
      recTESTG00000001: { [PT.email]: 'g@dulcy-ok.com', [PT.overall]: 92, [PT.workspaceId]: 4, _created: FRI },
      recTESTL00000001: { [PT.email]: 'lf@leadflo.com', [PT.overall]: 10, [PT.client]: ['recLFM00000000001'], _created: FRI },
    },
    [QUEUE]: {
      recQUEUE000000001: { [SQ.name]: 'Replace Domain — x@dulcy-try.com', [SQ.account]: ['recACCX0000000001'], [SQ.client]: ['recDULCY000000001'], [SQ.action]: 'Replace Domain', [SQ.status]: 'Pending Review', [SQ.score]: 31, [SQ.reason]: 'Failed the 7-day retest at 31%.' },
      recQUEUEDONE00001: { [SQ.name]: 'Replace Domain — old@dulcy.com', [SQ.status]: 'Completed' },
    },
    [PURCHASES]: {
      recBUY00000000001: { [DPR.request]: 'Twenty West: 5 domains', [DPR.client]: ['recTWMINT00000001'], [DPR.status]: 'Ready for Approval', [DPR.count]: 5, [DPR.mailboxes]: 10, 'fldXadpWkyEanTp1t': 'mailbox-pass-secret' },
      recBUY00000000002: { [DPR.request]: 'Done one', [DPR.status]: 'Completed' },
    },
    [DECISIONS]: {
      recDEC00000000001: { [DF.title]: 'Replace dulcy-try.com? (x@dulcy-try.com failed its retest at 31%)', [DF.agent]: 'Atlas', [DF.status]: 'New', [DF.details]: 'Spam Remediation Queue record recQUEUE000000001. ✅ ticks Approve Purchase there.', [DF.action]: 'Approve Purchase' },
    },
  };
}

test('deliverability API: session needed; tiles; Needs attention shows sick + resting first, one line per domain problem', { skip }, async () => {
  fixture();
  assert.equal((await call('GET', '/hq/api/deliverability')).status, 401);
  for (const v of ['inboxes', 'placement', 'domains']) assert.equal((await call('GET', `/hq/api/deliverability/${v}`)).status, 401);
  await db.query(`INSERT INTO jobs (kind, record_id, status, result, dry_run) VALUES ('account.health','account-health','succeeded','{"message":"0 placement tests: 0 rested"}', false)`);
  const cookie = await login();
  const r = await call('GET', '/hq/api/deliverability', cookie);
  assert.equal(r.status, 200, r.text);
  assert.deepEqual(r.body.tiles, { healthy: 1, risk: 1, spam: 6, resting: 1, total: 9 }, 'Lead Flo (inactive) is left out; the Twenty West pair counts once');
  assert.equal(r.body.hidden.inactiveInboxes, 1);
  const twm = r.body.clients.find((c: any) => c.key === 'twentywestmedia');
  assert.deepEqual([twm.name, twm.tiles.total, twm.tiles.spam, twm.tiles.resting, twm.tiles.risk], ['Twenty West', 6, 4, 1, 1], 'c@ is on the old Twenty West record and still counts here');
  const byTitle = Object.fromEntries(r.body.items.map((i: any) => [i.title, i]));
  assert.deepEqual(Object.keys(byTitle).sort(), ['a@twm-mail.com', 'b@twm-mail.com', 'c@twm-reach.com', 'd@twm-reach.com', 'dulcy-ok.com', 'h@dulcy-ok.com', 'listed.com', 'x@dulcy-try.com'],
    'listed.com is one line (its 2 inboxes are not repeated); healthy inboxes are not listed');
  assert.deepEqual(r.body.items.map((i: any) => i.status), ['spam', 'spam', 'spam', 'spam', 'spam', 'resting', 'risk', 'risk'], 'spam, then resting, then at risk');
  assert.deepEqual([byTitle['listed.com'].kind, byTitle['listed.com'].inboxes, byTitle['listed.com'].reason], ['domain', 2, 'Blacklisted on 2: spamhaus barracuda']);
  assert.deepEqual([byTitle['a@twm-mail.com'].reason, byTitle['a@twm-mail.com'].owner], ['Placement 45% (11/21)', 'Atlas']);
  assert.match(byTitle['a@twm-mail.com'].doing, /before the health loop started/);
  assert.deepEqual([byTitle['b@twm-mail.com'].status, byTitle['b@twm-mail.com'].doing], ['resting', 'Rested 11/24, retest Fri 12/4 · limit 0 (was 30).']);
  assert.deepEqual([byTitle['c@twm-reach.com'].owner, byTitle['c@twm-reach.com'].client], ['Riley', 'Twenty West']);
  assert.match(byTitle['h@dulcy-ok.com'].reason, /^Bounce 6% \(9 of 150\)$/);
  assert.match(byTitle['dulcy-ok.com'].reason, /^Expires in 10 days/);
  assert.equal(byTitle['dulcy-ok.com'].status, 'risk');
  const x = byTitle['x@dulcy-try.com'];
  assert.equal(x.doing, 'Replacement waiting for your OK in Decisions. The inbox stays at 0/day.');
  assert.deepEqual(x.links.map((l: any) => l.href), ['decisions/Campaigns'], 'buttons only link to Decisions; no Airtable record links (Alex 2026-11-27)');
  assert.equal(r.body.replacementsWaiting, 1);
  assert.deepEqual(r.body.engine.runs.map((j: any) => [j.kind, j.message]), [['account.health', '0 placement tests: 0 rested']]);
  assert.equal(r.body.engine.healthLoop.everyMin, 60);
  // One client only.
  const one = await call('GET', '/hq/api/deliverability?client=dulcy', cookie);
  assert.deepEqual(one.body.tiles, { healthy: 1, risk: 0, spam: 2, resting: 0, total: 3 });
  assert.ok(one.body.items.every((i: any) => i.clientKey === 'dulcy'));
});

test('deliverability API: read only, batched (no per-row calls), no passwords, cached 60 seconds', { skip }, async () => {
  fixture();
  const cookie = await login();
  for (const v of ['', '/inboxes', '/placement', '/domains']) {
    const r = await call('GET', `/hq/api/deliverability${v}`, cookie);
    assert.equal(r.status, 200, r.text);
    assert.ok(!/hunter2-secret|mailbox-pass-secret/.test(r.text), `no password in ${v || '/'}`);
  }
  assert.equal(writes.length, 0, 'nothing written');
  assert.equal(lists.length, 8, 'one batch of list calls for all four views (cached)');
  assert.ok(!lists.some((l) => l.fields.includes(LOGIN_PASSWORD_FIELD) || l.fields.includes('fldXadpWkyEanTp1t')), 'password fields are never asked for');
  // Cached: a change shows only after 60 seconds (or the cache is cleared).
  (tables[ACCOUNTS].recACCD0000000001 as any)[EX.warmupScore] = 95;
  assert.equal((await call('GET', '/hq/api/deliverability', cookie)).body.tiles.risk, 1, 'still the cached copy');
  _resetDelivCache();
  assert.equal((await call('GET', '/hq/api/deliverability', cookie)).body.tiles.risk, 0);
  // Members (Josh) read it too.
  await upsertUser(db, 'josh@dulcy.io', 'member', 'josh long password 1', 'Josh');
  assert.equal((await call('GET', '/hq/api/deliverability', await login('josh@dulcy.io', 'josh long password 1'))).status, 200);
});

test('All inboxes: grouped by domain (worst first), search, client filter, status filter', { skip }, async () => {
  fixture();
  const cookie = await login();
  const r = await call('GET', '/hq/api/deliverability/inboxes', cookie);
  assert.equal(r.body.total, 9);
  assert.deepEqual(r.body.groups.map((g: any) => [g.domain, g.status, g.inboxes.length]), [
    ['dulcy-ok.com', 'spam', 2], ['dulcy-try.com', 'spam', 1], ['listed.com', 'spam', 2], ['twm-mail.com', 'spam', 2], ['twm-reach.com', 'spam', 2],
  ]);
  assert.deepEqual(r.body.groups[0].inboxes.map((i: any) => i.email), ['h@dulcy-ok.com', 'g@dulcy-ok.com'], 'worst inbox first');
  assert.equal(r.body.groups[2].inboxes[0].reasons[0].fromDomain, true, 'a listed domain makes its inboxes Spam too');
  assert.deepEqual(r.body.clients.map((c: any) => c.key).sort(), ['dulcy', 'twentywestmedia'], 'one chip for the Twenty West pair');
  const q = await call('GET', '/hq/api/deliverability/inboxes?q=REACH', cookie);
  assert.deepEqual(q.body.groups.map((g: any) => g.domain), ['twm-reach.com']);
  const c = await call('GET', '/hq/api/deliverability/inboxes?client=dulcy', cookie);
  assert.deepEqual(c.body.groups.map((g: any) => g.domain), ['dulcy-ok.com', 'dulcy-try.com']);
  const st = await call('GET', '/hq/api/deliverability/inboxes?status=healthy', cookie);
  assert.deepEqual(st.body.groups.flatMap((g: any) => g.inboxes.map((i: any) => i.email)), ['g@dulcy-ok.com'], 'e@ and f@ are on a listed domain: not healthy');
  assert.equal((await call('GET', '/hq/api/deliverability/inboxes?status=resting', cookie)).body.total, 1);
});

test('Placement tests: newest per client and domain, worst first, freshness; Domains: inbox count, expiry, replacements, purchases', { skip }, async () => {
  fixture();
  const cookie = await login();
  const p = await call('GET', '/hq/api/deliverability/placement', cookie);
  assert.equal(p.status, 200);
  assert.equal(p.body.freshness.newest, '2026-11-21');
  const twm = p.body.clients.find((c: any) => c.key === 'twentywestmedia');
  assert.deepEqual(twm.domains.map((d: any) => [d.domain, d.score, d.date, d.status, d.inboxes.length]), [['twm-mail.com', 40, '2026-11-21', 'spam', 2]], 'the 11-14 test of a@ is older: not shown');
  assert.equal(twm.newest, '2026-11-21');
  const dulcy = p.body.clients.find((c: any) => c.key === 'dulcy');
  assert.deepEqual(dulcy.domains.map((d: any) => [d.domain, d.score]), [['dulcy-ok.com', 92]], 'matched by the EmailBison workspace id');
  assert.ok(!p.body.clients.some((c: any) => /lead flo/i.test(c.name)), 'inactive clients are left out');
  // The note follows the data: the scores are from 11-21; whether a note shows depends on today.
  const expectNote = placementFreshness(`${p.body.freshness.newest}T15:00:00.000Z`, new Date()).stale;
  if (expectNote) assert.ok(p.body.notes.some((n: any) => n.level === 'bad' && /xcteI9ofNLOqC0GO/.test(n.data)));

  const d = await call('GET', '/hq/api/deliverability/domains', cookie);
  assert.equal(d.status, 200);
  const dc = d.body.clients.find((c: any) => c.key === 'dulcy');
  assert.deepEqual(dc.domains.map((x: any) => [x.name, x.inboxes, x.daysToRenewal]), [['dulcy-ok.com', 2, 10], ['dulcy-try.com', 1, null]]);
  assert.equal(dc.domains[0].status, 'risk');
  assert.deepEqual(d.body.replacements.map((x: any) => [x.title, x.status, x.score, x.decisionId, x.link.href]), [['x@dulcy-try.com', 'Pending Review', 31, 'recDEC00000000001', 'decisions/Campaigns']], 'completed ones are left out');
  assert.deepEqual(d.body.purchases.map((x: any) => [x.request, x.status, x.domains, x.mailboxes, x.link?.href]), [['Twenty West: 5 domains', 'Ready for Approval', 5, 10, undefined]]);
  const dt = d.body.clients.find((c: any) => c.key === 'twentywestmedia');
  assert.deepEqual(dt.domains.map((x: any) => x.name), ['listed.com', 'twm-mail.com', 'twm-reach.com']);
});

test('data notes: missing renewal dates, inboxes without a Domains record, domains without 2 inboxes', () => {
  const notes = dataNotes(
    [{ clientKey: 'dulcy', domainId: '' }, { clientKey: 'dulcy', domainId: 'recD1' }, { clientKey: 'none', domainId: '' }],
    [{ id: 'recD1', clientKey: 'dulcy', renewal: '', inboxes: 1 }, { id: 'recD2', clientKey: 'dulcy', renewal: '2027-01-01', inboxes: 2 }, { id: '', clientKey: 'dulcy', renewal: '', inboxes: 1 }],
  );
  assert.deepEqual(notes.map((n) => n.problem), ['No renewal date on 1 of 2 domains.', '1 inbox has no Domains record.', '1 domain without exactly 2 inboxes.']);
  assert.ok(notes.every((n) => n.owner === 'Atlas' && n.fix && n.why));
  assert.deepEqual(dataNotes([], []), []);
});

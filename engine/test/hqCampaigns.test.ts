// HQ Campaigns (Step 3): the "needs action" rules, the pipeline steps, the client grouping, data notes,
// and the read-only API (no writes anywhere, members get the same rows minus owner-only log rows).
// Airtable is a fake (ignores formulas: the code filters again in JS); no real service is called.
import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { AddressInfo } from 'node:net';
import { createPool, migrate, type Db } from '../src/db/pool.js';
import { loadConfig, type Config } from '../src/config.js';
import { createServer } from '../src/http.js';
import { upsertUser } from '../src/hq/auth.js';
import { ACTIVITY, AF } from '../src/activity.js';
import {
  CAMPAIGNS_T, KF, LEAD_LISTS_T, LF, WORKSPACES_T, _resetCampaignsCache, buildRows, campaignNotes, clientIndex, groupOf, needsFor, stepsOf, stepNow,
  type CampaignFacts, type CampaignsSource, type ListInfo, type PlanInfo,
} from '../src/hq/campaigns.js';

const url = process.env.TEST_DATABASE_URL;
const skip = !url ? 'TEST_DATABASE_URL not set' : false;
const PW = 'correct horse battery staple';
const NOW = Date.parse('2026-11-26T15:00:00.000Z');
const D = (days: number, from = Date.now()) => new Date(from - days * 86_400_000).toISOString();

// ---------- pure rules ----------
const facts = (o: Partial<CampaignFacts> = {}): CampaignFacts => ({
  id: 'recC00000000000001', name: 'X', status: 'Active', stage: 'Live', clientRec: 'recW00000000000001', listIds: [],
  progress: 0.3, sent: 1000, replies: 20, interested: 5, booked: 1, bounce: 1, contacted: 1000, totalLeads: 3000,
  approvalSource: '', approvalException: false, approvalDecision: '', reviewSubmitted: '', autoApprove: '', processing: '', workflowError: '', engineStatus: '', engineMessage: '',
  skipBouncePause: false, bisonUrl: '', created: D(40, NOW), statusModified: '', updatedAt: '', startedAt: '', completedAt: '', thesis: '', approach: '', launchDate: '', accountIds: [], ...o,
});
const list = (o: Partial<ListInfo> = {}): ListInfo => ({ id: 'recL00000000000001', name: 'L', stage: 'Ready', qa: 'Passed', processing: 'Completed', leads: 2400, engineStatus: '', message: '', startedAt: '', completedAt: '', ...o });
const plan = (o: Partial<PlanInfo> = {}): PlanInfo => ({ id: 1, triggerKey: 'next:recC00000000000001', wsRec: 'recW00000000000001', client: 'C', state: 'sample', label: 'Company sample', campaignRec: 'recC00000000000009', leadListRec: '', error: '', created: D(1, NOW), updated: D(1, NOW), ...o });
const ctx = (o: Partial<Parameters<typeof needsFor>[2]> = {}) => ({ now: NOW, agencyRate: 0.005, lastChange: D(1, NOW), next: null, ...o });
const kinds = (c: CampaignFacts, lists: ListInfo[] = [], o: Partial<Parameters<typeof needsFor>[2]> = {}) => needsFor(c, stepsOf(c, lists, o.next ?? null), ctx(o)).map((x) => `${x.kind}:${x.agent}`);

test('campaigns: groups by Campaign Status', () => {
  assert.deepEqual(['Active', 'Completed', 'Inactive', 'Draft', 'Uploaded', 'Waiting for Approval', ''].map(groupOf), ['live', 'done', 'done', 'building', 'building', 'building', 'building']);
});

test('campaigns: needs action rules (bounce, 60%, low interest, client review, stuck, failed)', () => {
  assert.deepEqual(kinds(facts()), [], 'a healthy live campaign needs nothing');
  assert.deepEqual(kinds(facts({ bounce: 4.6 })), ['pause:Atlas'], 'over 4% = pause');
  assert.deepEqual(kinds(facts({ bounce: 4 })), ['watch:Atlas'], 'exactly 4% is watch, not pause');
  assert.deepEqual(kinds(facts({ bounce: 2.5 })), [], '2.5% exactly is fine');
  assert.deepEqual(kinds(facts({ bounce: 3.1, progress: 0.72 })), ['watch:Atlas', 'next:Atlas'], 'watch + 60% → plan next, most urgent first');
  assert.deepEqual(kinds(facts({ progress: 0.72 }), [], { next: plan() }), [], 'a next plan exists: nothing to do');
  assert.deepEqual(kinds(facts({ progress: 0.72 }), [], { next: plan({ state: 'rejected' }) }), ['next:Atlas'], 'a rejected plan does not count');
  assert.deepEqual(kinds(facts({ progress: 1 })), [], '100% is done, not "plan next"');
  // Low: under 60% of the agency rate (0.5% → 5 per 1,000), judged on 500+ sent.
  assert.deepEqual(kinds(facts({ sent: 1000, interested: 2 })), ['low:Atlas'], '2 per 1,000 vs 5 average');
  assert.deepEqual(kinds(facts({ sent: 1000, interested: 3 })), [], '3 per 1,000 = 60% of the average: fine');
  assert.deepEqual(kinds(facts({ sent: 400, interested: 0 })), [], 'under 500 sent: too early to judge');
  assert.match(needsFor(facts({ interested: 2 }), [], ctx())[0].text, /^2 interested per 1,000 sent vs 5 agency average/);
  // Building.
  const review = facts({ status: 'Waiting for Approval', stage: 'Client Review', reviewSubmitted: D(1, NOW), autoApprove: new Date(NOW + 86_400_000).toISOString() });
  assert.deepEqual(kinds(review), ['review:Atlas'], 'copy waiting for client review');
  assert.match(needsFor(review, stepsOf(review, [], null), ctx())[0].text, /^Copy waiting for client review since 11\/25 · auto-approves 11\/27\.$/);
  assert.deepEqual(kinds({ ...review, autoApprove: D(1, NOW) }), ['stuck:Atlas'], 'past the auto-approve time = stuck');
  const copy = facts({ status: 'Draft', stage: 'Internal Review', listIds: ['recL00000000000001'] });
  assert.deepEqual(kinds(copy, [list()], { lastChange: D(2, NOW) }), [], '2 days: not stuck yet');
  assert.deepEqual(kinds(copy, [list()], { lastChange: D(4, NOW) }), ['stuck:Scribe'], 'list ready, copy stalled 4 days → Scribe');
  assert.deepEqual(kinds(copy, [list({ stage: 'Verification', qa: 'Not Checked' })], { lastChange: D(4, NOW) }), ['stuck:Scout'], 'list stalled → Scout');
  assert.deepEqual(kinds(copy, [list()], { lastChange: D(45, NOW) }), [], 'untouched 30+ days = an old draft (a data note), not "stuck"');
  assert.deepEqual(kinds(copy, [list({ stage: 'Failed' })]), ['failed:Scout'], 'a failed list step → Scout');
  const launch = facts({ status: 'Uploaded', stage: 'Launch Ready', engineStatus: 'Failed', engineMessage: 'FAIL: inbox not connected' });
  assert.deepEqual(kinds(launch), ['failed:Riley'], 'a failed build/launch → Riley');
  assert.match(needsFor(launch, stepsOf(launch, [], null), ctx())[0].text, /inbox not connected/);
  assert.deepEqual(kinds(facts({ status: 'Completed', bounce: 9, progress: 0.8 })), [], 'finished campaigns need nothing');
});

test('campaigns: pipeline steps list → copy → client review → launch → live → 60% → next', () => {
  const st = (c: CampaignFacts, lists: ListInfo[] = [], next: PlanInfo | null = null) => stepsOf(c, lists, next).map((x) => `${x.key}:${x.state}`).join(' ');
  assert.equal(st(facts({ status: 'Draft', stage: '' })), 'list:now copy:todo review:todo launch:todo live:todo sixty:todo next:todo');
  assert.equal(st(facts({ status: 'Draft', stage: 'Strategy Draft', listIds: ['x'] }), [list({ stage: 'Verification', qa: 'Not Checked' })]), 'list:now copy:now review:todo launch:todo live:todo sixty:todo next:todo');
  assert.equal(st(facts({ status: 'Waiting for Approval', stage: 'Client Review' }), [list()]), 'list:done copy:done review:now launch:todo live:todo sixty:todo next:todo');
  assert.equal(st(facts({ status: 'Draft', stage: 'Changes Requested' }), [list()]), 'list:done copy:now review:todo launch:todo live:todo sixty:todo next:todo');
  assert.equal(st(facts({ status: 'Uploaded', stage: 'Build Ready' }), [list()]), 'list:done copy:done review:done launch:now live:todo sixty:todo next:todo');
  assert.equal(st(facts({ status: 'Draft', stage: 'Internal Review', approvalException: true }), [list()]), 'list:done copy:done review:done launch:todo live:todo sixty:todo next:todo', 'Client Approval Exception counts as approved');
  assert.equal(st(facts({ stage: '' })), 'list:done copy:done review:done launch:done live:now sixty:todo next:todo', 'an Active campaign with no stage fields is past the build steps');
  assert.equal(st(facts({ progress: 0.65 })), 'list:done copy:done review:done launch:done live:done sixty:now next:todo');
  assert.equal(st(facts({ progress: 0.65 }), [], plan()), 'list:done copy:done review:done launch:done live:done sixty:done next:now');
  assert.equal(st(facts({ progress: 0.9 }), [], plan({ state: 'live' })), 'list:done copy:done review:done launch:done live:done sixty:done next:done');
  assert.equal(stepNow(stepsOf(facts({ status: 'Uploaded', stage: 'Launch Ready' }), [list()], null))?.key, 'launch');
});

test('campaigns: clients group like the Clients screen; rows, owner and data notes', () => {
  const ws = [
    { id: 'recTWMOLD00000001', fields: { Name: 'Twenty West Media', Status: 'Inactive', 'Client Type': 'Paying Client' } },
    { id: 'recTWMINT00000001', fields: { Name: 'Twenty West Media (Internal)', Status: 'Active', 'Client Type': 'Paying Client' } },
    { id: 'recLFM00000000001', fields: { Name: 'Lead Flo Marketing', Status: 'Inactive' } },
  ];
  const idx = clientIndex(ws);
  assert.deepEqual(idx.get('recTWMOLD00000001'), idx.get('recTWMINT00000001'));
  assert.deepEqual(idx.get('recTWMINT00000001'), { key: 'twentywestmedia', name: 'Twenty West Media', active: true });
  const rec = (id: string, f: Record<string, unknown>) => ({ id, fields: f });
  const src: CampaignsSource = {
    ws, lists: [], plans: [], changes: new Map(), readAt: '',
    campaigns: [
      rec('recC00000000000001', { [KF.name]: 'TWM - Contractors', [KF.status]: 'Active', [KF.client]: ['recTWMINT00000001'], [KF.bouncedPct]: 4.6, [KF.progress]: 0.72, [KF.sent]: 2000, [KF.interested]: 10 }),
      rec('recC00000000000002', { [KF.name]: 'TWM - Old', [KF.status]: 'Active', [KF.client]: ['recTWMOLD00000001'], [KF.bouncedPct]: 1, [KF.progress]: 0.2, [KF.sent]: 50 }),
      rec('recC00000000000003', { [KF.name]: 'DRAFT - test', [KF.status]: 'Active', [KF.stage]: 'Internal Review', [KF.progress]: 0.1, [KF.sent]: 10 }),
      rec('recC00000000000004', { [KF.name]: 'LFM - Events', [KF.status]: 'Active', [KF.client]: ['recLFM00000000001'], [KF.progress]: 0.1, [KF.sent]: 10 }),
      rec('recC00000000000005', { [KF.name]: 'Forgotten', [KF.status]: 'Draft', [KF.client]: ['recTWMINT00000001'], [KF.created]: D(90), [KF.statusModified]: D(60) }),
    ],
  };
  const rows = buildRows(src);
  const by = (id: string) => rows.find((r) => r.id === id)!;
  assert.equal(by('recC00000000000001').clientKey, by('recC00000000000002').clientKey, 'the Twenty West pair is one client');
  assert.deepEqual(by('recC00000000000001').needs.map((x) => x.kind), ['pause', 'next']);
  assert.equal(by('recC00000000000001').owner, 'Atlas');
  assert.equal(by('recC00000000000001').perThousand, 5);
  assert.equal(by('recC00000000000005').old, true);
  const notes = campaignNotes(rows).map((x) => x.problem);
  assert.deepEqual(notes, ['Active campaign named "DRAFT"', 'Campaign with no client link', 'Active campaigns for an inactive client', 'Stage and status disagree', 'Draft untouched for 30+ days']);
  assert.match(campaignNotes(rows)[0].data, /^1: DRAFT - test$/);
});

// ---------- the API ----------
let db: Db;
let server: http.Server;
let port = 0;
let webDir: string;
let tables: Record<string, Record<string, Record<string, unknown>>>;
let writes: unknown[];
let reads: string[];
const at = {
  async list(table: string, formula: string) { reads.push(`${table} ${formula}`); return Object.entries(tables[table] ?? {}).map(([id, fields]) => ({ id, fields: { ...fields } })); },
  async get(table: string, id: string) { reads.push(`${table} get`); const f = tables[table]?.[id]; return f ? { id, fields: { ...f } } : null; },
  async create(...a: unknown[]) { writes.push(a); return 'recNEW00000000001'; },
  async update(...a: unknown[]) { writes.push(a); },
};
function cfg(over: Partial<Config> = {}): Config {
  return { ...loadConfig({ ENGINE_SECRET: 'x'.repeat(40), DATABASE_URL: url ?? 'postgres://x', HQ_SESSION_SECRET: 's'.repeat(40), HQ_HOST: 'hq.test.local' } as NodeJS.ProcessEnv), airtableApiKey: undefined, anthropicApiKey: undefined, ...over };
}
interface Res { status: number; body: any; text: string }
function call(p: string, cookie?: string): Promise<Res> {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port, method: 'GET', path: p, headers: { host: `127.0.0.1:${port}`, ...(cookie ? { cookie } : {}) } }, (res) => {
      const chunks: Buffer[] = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => { const text = Buffer.concat(chunks).toString('utf8'); let body: any = null; try { body = JSON.parse(text); } catch { /* not json */ } resolve({ status: res.statusCode ?? 0, body, text }); });
    });
    req.on('error', reject); req.end();
  });
}
function login(email: string, password: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify({ email, password });
    const req = http.request({ host: '127.0.0.1', port, method: 'POST', path: '/hq/api/auth/login', headers: { host: `127.0.0.1:${port}`, origin: `https://127.0.0.1:${port}`, 'content-type': 'application/json' } }, (res) => {
      res.resume();
      res.on('end', () => resolve(([] as string[]).concat(res.headers['set-cookie'] ?? []).map((c) => c.split(';')[0]).find((c) => c.startsWith('__Host-hq_session=')) ?? ''));
    });
    req.on('error', reject); req.write(data); req.end();
  });
}

before(async () => {
  webDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hqcamp-'));
  fs.writeFileSync(path.join(webDir, 'index.html'), '<!doctype html><title>Dulcy HQ</title>');
  if (skip) return;
  db = createPool(url!); await migrate(db);
  server = createServer(db, cfg(), { at: at as any, webDir });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', () => r()));
  port = (server.address() as AddressInfo).port;
});
after(async () => { if (!skip) { server.close(); await db.end(); } fs.rmSync(webDir, { recursive: true, force: true }); });
beforeEach(async () => {
  tables = {}; writes = []; reads = []; _resetCampaignsCache();
  if (skip) return;
  await db.query('TRUNCATE hq_users, hq_sessions, hq_login_attempts, campaign_plans, jobs, airtable_jobs, steps, receipts, events RESTART IDENTITY CASCADE');
  await upsertUser(db, 'alex@dulcy.io', 'owner', PW, 'Alex');
});

function fixtures() {
  tables[WORKSPACES_T] = {
    recTWMOLD00000001: { Name: 'Twenty West Media', Status: 'Inactive', 'Client Type': 'Paying Client', 'Monthly Fee': 2500 },
    recTWMINT00000001: { Name: 'Twenty West Media (Internal)', Status: 'Active', 'Client Type': 'Paying Client' },
    recMJJ00000000001: { Name: 'MJJ Brilliant', Status: 'Active' },
  };
  tables[CAMPAIGNS_T] = {
    recCTWM0000000001: { [KF.name]: 'TWM - Contractors', [KF.status]: 'Active', [KF.stage]: 'Live', [KF.client]: ['recTWMINT00000001'], [KF.bouncedPct]: 4.6, [KF.progress]: 0.72, [KF.sent]: 2000, [KF.replies]: 40, [KF.interested]: 10, [KF.booked]: 2, [KF.contacted]: 1800, [KF.totalLeads]: 2500, [KF.lists]: ['recLTWM0000000001'], [KF.bisonUrl]: 'https://send.dulcy.io/campaigns/1' },
    recCTWM0000000002: { [KF.name]: 'TWM - Roofers', [KF.status]: 'Draft', [KF.stage]: 'Internal Review', [KF.client]: ['recTWMOLD00000001'], [KF.lists]: ['recLTWM0000000002'], [KF.statusModified]: D(5) },
    recCMJJ0000000001: { [KF.name]: 'MJJ - Jewelers', [KF.status]: 'Active', [KF.stage]: 'Live', [KF.client]: ['recMJJ00000000001'], [KF.bouncedPct]: 1, [KF.progress]: 0.3, [KF.sent]: 600, [KF.interested]: 2 },
    recCDONE000000001: { [KF.name]: 'Old finished', [KF.status]: 'Completed', [KF.client]: ['recMJJ00000000001'], [KF.sent]: 5000, [KF.interested]: 40, [KF.bouncedPct]: 9 },
    recCSMALL00000001: { [KF.name]: 'Small finished', [KF.status]: 'Completed', [KF.sent]: 100 },
  };
  tables[LEAD_LISTS_T] = {
    recLTWM0000000002: { [LF.name]: 'TWM Roofers list', [LF.stage]: 'Ready', [LF.qa]: 'Passed', [LF.finalDirect]: 900, [LF.finalGeneric]: 300 },
    recLOTHER00000001: { [LF.name]: 'Someone else', [LF.stage]: 'Draft' },
  };
  tables[ACTIVITY] = {
    recACT00000000001: { [AF.event]: 'Bounce check: paused', [AF.when]: D(0.1), [AF.agent]: 'Atlas', [AF.type]: 'Detected', [AF.details]: 'Bounce 4.6%', [AF.campaign]: ['recCTWM0000000001'] },
    recACT00000000002: { [AF.event]: 'Verify and finalize: done', [AF.when]: D(3), [AF.agent]: 'Engine', [AF.type]: 'Step done', [AF.leadList]: ['recLTWM0000000001'] },
    recACT00000000003: { [AF.event]: 'Other campaign', [AF.when]: D(1), [AF.agent]: 'Sean', [AF.type]: 'Info', [AF.campaign]: ['recCMJJ0000000001'] },
    recACT00000000004: { [AF.event]: 'Ledger note', [AF.when]: D(0.2), [AF.agent]: 'Ledger', [AF.type]: 'Info', [AF.campaign]: ['recCTWM0000000001'] },
  };
}

test('campaigns API: needs a session; needs action first, the Twenty West pair one client, counts, notes, channels, cache', { skip }, async () => {
  fixtures();
  assert.equal((await call('/hq/api/campaigns')).status, 401);
  assert.equal((await call('/hq/api/campaigns/recCTWM0000000001')).status, 401);
  const cookie = await login('alex@dulcy.io', PW);
  // The roofers draft last moved 5 days ago by its fields, but an engine job ran on its lead list 1 day ago: not stuck.
  const job = (await db.query(`INSERT INTO jobs (kind, record_id, status, dry_run, updated_at) VALUES ('leadlist.verify','recLTWM0000000002','succeeded',false, now() - interval '1 day') RETURNING id`)).rows[0].id;
  assert.ok(job);
  const r = await call('/hq/api/campaigns', cookie);
  assert.equal(r.status, 200, r.text);
  assert.deepEqual(r.body.rows.map((x: any) => x.name), ['TWM - Contractors', 'MJJ - Jewelers', 'TWM - Roofers'], 'needs action first; finished campaigns are left out');
  assert.deepEqual(r.body.counts, { action: 2, live: 2, building: 1 });
  const twm = r.body.rows[0];
  assert.deepEqual(twm.needs.map((x: any) => [x.kind, x.agent]), [['pause', 'Atlas'], ['next', 'Atlas']]);
  assert.equal(r.body.rows[1].needs[0].kind, 'low', '3.3 per 1,000 vs the agency average (40+10+2)/(5000+2000+600) = 6.8');
  assert.equal(r.body.agencyPerThousand, 6.8);
  const roofers = r.body.rows[2];
  assert.deepEqual([roofers.group, roofers.now.key, roofers.needs.length], ['building', 'copy', 0]);
  assert.deepEqual(r.body.clients.map((c: any) => [c.key, c.count, c.action]), [['mjjbrilliant', 1, 1], ['twentywestmedia', 2, 1]]);
  assert.deepEqual(r.body.channels.map((c: any) => [c.key, c.live]), [['email', true], ['linkedin', false], ['caller', false], ['mail', false]], 'Direct mail is a channel tab (not running yet)');
  assert.match(r.body.channels[1].reason, /Only cold email works right now/);

  const one = await call('/hq/api/campaigns?client=twentywestmedia', cookie);
  assert.deepEqual(one.body.rows.map((x: any) => x.id), ['recCTWM0000000001', 'recCTWM0000000002'], 'both Twenty West records under one client');
  assert.deepEqual(one.body.counts, { action: 1, live: 1, building: 1 });
  assert.equal((await call('/hq/api/campaigns?client=nope', cookie)).body.client, '', 'an unknown client shows all');

  // One batched read per table; cached 60 seconds; no writes ever.
  const n = reads.length;
  assert.equal(reads.filter((x) => x.startsWith(LEAD_LISTS_T)).length, 1, 'lead lists read in one batch');
  await call('/hq/api/campaigns', cookie);
  assert.equal(reads.length, n, 'cached');
  tables[CAMPAIGNS_T].recCMJJ0000000001[KF.bouncedPct] = 3;
  assert.equal((await call('/hq/api/campaigns', cookie)).body.rows.find((x: any) => x.id === 'recCMJJ0000000001').bounce, 1, 'still the cached copy');
  _resetCampaignsCache();
  assert.equal((await call('/hq/api/campaigns', cookie)).body.rows.find((x: any) => x.id === 'recCMJJ0000000001').flag, 'watch', 'read again after the cache');
  assert.deepEqual(writes, [], 'nothing written to Airtable');
});

test('campaigns API: the campaign page (stats, steps, engine history, Activity log newest first, links)', { skip }, async () => {
  fixtures();
  await db.query(`INSERT INTO jobs (kind, record_id, status, dry_run, result, updated_at) VALUES
    ('campaign.launch','recCTWM0000000001','succeeded',false,'{"message":"Launched 2 parts"}', now() - interval '10 days'),
    ('leadlist.verify','recLTWM0000000001','succeeded',false,'{"message":"2,400 verified"}', now() - interval '12 days'),
    ('leadlist.verify','recLOTHER00000001','succeeded',false,'{"message":"not this one"}', now())`);
  await db.query(`INSERT INTO campaign_plans (trigger_key, ws_rec, client, state, campaign_rec, created_at, updated_at) VALUES ('client:recTWMINT00000001','recTWMINT00000001','Twenty West Media','live','recCTWM0000000001', now() - interval '20 days', now() - interval '9 days')`);
  const cookie = await login('alex@dulcy.io', PW);
  const r = await call('/hq/api/campaigns/recCTWM0000000001', cookie);
  assert.equal(r.status, 200, r.text);
  const c = r.body.campaign;
  assert.deepEqual([c.sent, c.replies, c.interested, c.booked, c.bounce, c.progress, c.contacted, c.totalLeads], [2000, 40, 10, 2, 4.6, 0.72, 1800, 2500]);
  assert.equal(c.client, 'Twenty West Media');
  assert.deepEqual(c.steps.map((x: any) => x.state), ['done', 'done', 'done', 'done', 'done', 'now', 'todo']);
  assert.deepEqual(r.body.history.map((h: any) => h.what), ['Campaign plan #1: Live', 'Launch', 'Verify and finalize', 'Campaign plan #1 started'], 'its jobs, its lead list\'s jobs and its plan; not other records');
  assert.equal(r.body.history[1].message, 'Launched 2 parts');
  assert.deepEqual(r.body.activity.map((a: any) => [a.event, a.on]), [['Bounce check: paused', 'campaign'], ['Ledger note', 'campaign'], ['Verify and finalize: done', 'list']], 'campaign and lead list rows, newest first');
  assert.equal(r.body.links.airtable, undefined, 'no Open in Airtable (Alex 2026-11-27)');
  assert.ok(!/airtable\.com/.test(r.text), 'no Airtable links anywhere');
  assert.equal(r.body.links.bison, 'https://send.dulcy.io/campaigns/1');
  assert.equal(r.body.plan.state, 'live');

  // A finished campaign under 500 sent is not in the cached read: read by its id.
  const done = await call('/hq/api/campaigns/recCSMALL00000001', cookie);
  assert.equal(done.status, 200);
  assert.equal(done.body.campaign.group, 'done');
  // A building campaign's lead list.
  const b = await call('/hq/api/campaigns/recCTWM0000000002', cookie);
  assert.deepEqual(b.body.lists.map((l: any) => [l.name, l.leads]), [['TWM Roofers list', 1200]]);
  assert.equal(b.body.lists[0].airtableUrl, undefined);
  assert.equal((await call('/hq/api/campaigns/recNOPE0000000001', cookie)).status, 404);
  assert.deepEqual(writes, [], 'nothing written to Airtable');
});

test('campaigns API: members see the same campaigns, no money, no owner-only log rows', { skip }, async () => {
  fixtures();
  await upsertUser(db, 'josh@dulcy.io', 'member', 'josh long password 1', 'Josh');
  const cookie = await login('josh@dulcy.io', 'josh long password 1');
  const r = await call('/hq/api/campaigns', cookie);
  assert.equal(r.status, 200);
  assert.equal(r.body.rows.length, 3);
  const d = await call('/hq/api/campaigns/recCTWM0000000001', cookie);
  assert.deepEqual(d.body.activity.map((a: any) => a.event), ['Bounce check: paused', 'Verify and finalize: done'], 'no Ledger rows for members');
  for (const t of [r.text, d.text]) assert.ok(!/\$|"fee"|"money"|"mrr"|Monthly Fee|\bltv\b/i.test(t), `no money in the answer: ${t.slice(0, 200)}`);
});

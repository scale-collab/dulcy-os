// HQ portal v2 (portal.dulcy.io replaces Softr, 2026-11-26). Isolation first:
//   - two clients never see each other's rows on any portal screen (credentials, tasks, documents included);
//   - no client can write to another client's record (forged and borrowed keys);
//   - a sign-up never sees data until the owner links it (or a Google-verified Airtable match);
//   - the portal host never serves HQ's own app or API;
//   - every client write is exactly the Softr write and is logged.
// No real services: a fake Airtable (returns every field, ignores formulas) and a fake Google.
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
import { _resetClientsCache } from '../src/hq/clients.js';
import { _resetInboxCache, WORKSPACES, XF } from '../src/hq/inbox.js';
import { CAMPAIGNS_T, KF } from '../src/hq/campaigns.js';
import { EMAILS, EF, RA } from '../src/agents/emailsFields.js';
import { CC } from '../src/agents/scribe.js';
import { _resetPortalCache, opaque } from '../src/hq/portal.js';
import { _resetPortalUsersCache } from '../src/hq/portalAccounts.js';
import { CF, CFB, CX2, DEAL, DOC, EAO, INV, LAO, LIC, MEET, NOTE, ONB_CLIENT, PU, T, TASK, WS_LOGINS } from '../src/hq/portalFields.js';
import { CLIENT_API_ALLOW, portalHostMayCall } from '../src/hq/server.js';

const url = process.env.TEST_DATABASE_URL;
const skip = !url ? 'TEST_DATABASE_URL not set' : false;
const PW = 'correct horse battery staple';
const CPW = 'client portal password 1';
const HQ_HOST = 'hq.test.local';
const PORTAL_HOST = 'portal.test.local';
let db: Db;
let server: http.Server;
let port = 0;
let webDir: string;

const rec = (tag: string) => `rec${(tag + '0'.repeat(14)).slice(0, 14)}`;
const A1 = rec('TwentyWest'), A2 = rec('TwentyWestInt'), B1 = rec('BoltLegal'), OLD = rec('OldClient');
const DAY = 86_400_000;
const ago = (d: number) => new Date(Date.now() - d * DAY).toISOString();
const day = (d: number) => new Date(Date.now() + d * DAY).toISOString().slice(0, 10);
const SECRET = { tw: 'TW-LOGIN user tw@send.co pass Hunter2-TW', bolt: 'BOLT-LOGIN user b@send.co pass Bolt-Secret-9', linkedinPw: 'LINKEDIN-PASSWORD-xyz', twofa: 'TWOFA-SECRET-abc', draft: 'SECRET DRAFT from Echo', fee: 'Monthly Fee 4517' };
const ONB_TW = rec('OnbTW'), ONB_B = rec('OnbBolt');

// ---------- fake Airtable: every field back, formulas ignored, writes applied ----------
let tables: Record<string, Record<string, Record<string, unknown>>>;
let writes: { op: 'create' | 'update'; table: string; id: string; fields: Record<string, unknown> }[];
let asked: { table: string; fields: string[] }[];
let n = 0;
const at = {
  async list(table: string, _f: string, fields: string[] = []) { asked.push({ table, fields }); return Object.entries(tables[table] ?? {}).map(([id, f]) => ({ id, fields: { ...f }, createdTime: '2026-11-25T10:00:00.000Z' })); },
  async get(table: string, id: string, fields: string[] = []) { asked.push({ table, fields }); const f = tables[table]?.[id]; return f ? { id, fields: { ...f } } : null; },
  async create(table: string, fields: Record<string, unknown>) { const id = rec(`New${++n}`); writes.push({ op: 'create', table, id, fields }); (tables[table] ??= {})[id] = { ...fields }; return id; },
  async update(table: string, id: string, fields: Record<string, unknown>) { writes.push({ op: 'update', table, id, fields }); tables[table][id] = { ...tables[table][id], ...fields }; },
};

const C = { twReview: rec('CampTWReview'), twLive: rec('CampTWLive'), boltReview: rec('CampBoltRev'), boltLive: rec('CampBoltLive') };
const E = { ann: rec('EmAnn'), hank: rec('EmHank'), bea: rec('EmBea'), lost: rec('EmLost') };
const K = { twTask: rec('TaskTW'), twTaskDone: rec('TaskTWDone'), boltTask: rec('TaskBolt'), twDoc: rec('DocTW'), twDocInternal: rec('DocTWInt'), boltDoc: rec('DocBolt'), twNote: rec('NoteTW'), boltNote: rec('NoteBolt'), twInv: rec('InvTW'), boltInv: rec('InvBolt'), twInvDraft: rec('InvTWDraft') };

function seed() {
  tables = {
    [WORKSPACES]: {
      [A1]: { Name: 'Twenty West Media', Status: 'Active', 'Client Type': 'Paying', ID: '11', 'Cold Email': true, 'AI Employee': true, 'Calls Made': 40, 'Answered Calls': 12, 'Interested Calls': 3, Onboarding_form_submitted: true, Onboarding: [ONB_TW], [WS_LOGINS]: SECRET.tw, 'Monthly Fee': 4517 },
      [A2]: { Name: 'Twenty West Media (Internal)', Status: 'Inactive', 'Client Type': 'Internal', ID: '12', Client: [A1] },
      [B1]: { Name: 'Bolt Legal', Status: 'Active', 'Client Type': 'Paying', ID: '21', 'Cold Email': true, LinkedIn: true, Onboarding: [ONB_B], [WS_LOGINS]: SECRET.bolt },
      [OLD]: { Name: 'Old Client Co', Status: 'Inactive', 'Client Type': 'Paying', ID: '31' },
    },
    [CAMPAIGNS_T]: {
      [C.twReview]: { [KF.name]: 'TW Dentists Q1', [KF.status]: 'Draft', [KF.stage]: 'Client Review', [KF.client]: [A1], [CX2.launch]: day(5), [CX2.thesis]: 'Dentists want more patients.', [CX2.industries]: ['Dental'], [CC.review[0].subject]: 'quick idea', [CC.review[0].body]: 'Hi {FIRST_NAME}, ...', [KF.workflowError]: 'INTERNAL ERROR NOTE' },
      [C.twLive]: { [KF.name]: 'TW Clinics', [KF.status]: 'Active', [KF.stage]: 'Live', [KF.client]: [A1], [KF.sent]: 1200, [KF.replies]: 40, [KF.interested]: 9, [KF.booked]: 3, [KF.bouncedPct]: 1.2, [KF.startedAt]: ago(20) },
      [C.boltReview]: { [KF.name]: 'Bolt Law Firms v2', [KF.status]: 'Draft', [KF.stage]: 'Client Review', [KF.client]: [B1] },
      [C.boltLive]: { [KF.name]: 'Bolt Law Firms', [KF.status]: 'Active', [KF.client]: [B1], [KF.sent]: 800, [KF.bouncedPct]: 3.0 },
    },
    [EMAILS]: {
      [E.ann]: { [EF.leadName]: 'Ann Prospect', [EF.company]: 'Smile Co', [EF.leadEmail]: 'ann@smile.co', [EF.campaign]: 'TW Clinics', [EF.latestReply]: 'Yes, Tuesday works.', [EF.latestReplyAt]: ago(4), [EF.leadStatus]: 'Meeting Request', [EF.workspace]: '11', [EF.stage]: 'Booked Meeting', [XF.meetingBookedAt]: ago(3), [RA.draft]: SECRET.draft },
      [E.hank]: { [EF.leadName]: 'Hank Handed', [EF.company]: 'Dental Group', [EF.latestReply]: 'Send me the details please', [EF.latestReplyAt]: ago(5), [EF.leadStatus]: 'Interested', [EF.workspace]: '12', [EF.clientHandling]: true },
      [E.lost]: { [EF.leadName]: 'Lou Lost', [EF.company]: 'Lost Co', [EF.latestReplyAt]: ago(40), [EF.leadStatus]: 'Interested', [EF.workspace]: '11', [EF.stage]: 'Lost' },
      [E.bea]: { [EF.leadName]: 'Bea Bolt', [EF.company]: 'Bolt Client Co', [EF.leadEmail]: 'bea@boltclient.com', [EF.latestReply]: 'Book me in', [EF.latestReplyAt]: ago(4), [EF.leadStatus]: 'Interested', [EF.workspace]: '21', [XF.callBookedAt]: ago(3).slice(0, 10), [EF.stage]: 'Booked Meeting' },
    },
    [T.tasks]: {
      [K.twTask]: { [TASK.name]: 'Upload your pitch deck', [TASK.description]: 'The newest one, please.', [TASK.stage]: 'New Task', [TASK.client]: [A2], [TASK.modified]: ago(1) },
      [K.twTaskDone]: { [TASK.name]: 'Send 3 testimonials', [TASK.stage]: 'Done', [TASK.client]: [A1], [TASK.modified]: ago(9) },
      [K.boltTask]: { [TASK.name]: 'Bolt: sign the DPA', [TASK.stage]: 'New Task', [TASK.client]: [B1] },
    },
    [T.documents]: {
      [K.twDoc]: { [DOC.title]: 'Cold Email Script V1', [DOC.client]: [A1], [DOC.uploadedBy]: 'Dulcy', [DOC.attachments]: [{ url: 'https://v5.airtableusercontent.com/x/script.pdf', filename: 'script.pdf' }], [DOC.modified]: ago(2) },
      [K.twDocInternal]: { [DOC.title]: 'TW INTERNAL margin sheet', [DOC.client]: [A1], [DOC.internal]: true },
      [K.boltDoc]: { [DOC.title]: 'Bolt Deck', [DOC.client]: [B1], [DOC.uploadedBy]: 'Client' },
    },
    [T.meetings]: {
      [rec('MeetTWNext')]: { [MEET.title]: 'Monthly review', [MEET.date]: day(3), [MEET.client]: [A1] },
      [rec('MeetTWHide')]: { [MEET.title]: 'HIDDEN TW meeting', [MEET.date]: day(-3), [MEET.client]: [A1], [MEET.hide]: true },
      [rec('MeetBolt')]: { [MEET.title]: 'Bolt kickoff', [MEET.date]: day(-10), [MEET.client]: [B1] },
    },
    [T.invoices]: {
      [K.twInv]: { [INV.id]: 'INV-TW-1', [INV.amount]: 4600, [INV.date]: ago(10), [INV.type]: 'Successful', [INV.status]: 'Paid', [INV.client]: [A1] },
      [K.twInvDraft]: { [INV.id]: 'INV-TW-DRAFT', [INV.amount]: 999, [INV.status]: 'Draft', [INV.client]: [A1] },
      [K.boltInv]: { [INV.id]: 'INV-BOLT-1', [INV.amount]: 3000, [INV.status]: 'Awaiting Payment', [INV.client]: [B1] },
    },
    [T.notifications]: {
      [K.twNote]: { [NOTE.title]: 'New lead: Ann', [NOTE.client]: [A1], [NOTE.type]: 'Lead', [NOTE.created]: ago(1) },
      [K.boltNote]: { [NOTE.title]: 'Bolt news', [NOTE.client]: [B1], [NOTE.type]: 'System' },
    },
    [T.callFeedback]: {}, [T.closedDeals]: {},
    [T.emailOverview]: {
      [rec('EaoTW30')]: { [EAO.period]: 'Last 30 days', [EAO.client]: [A1], [EAO.sent]: 900, [EAO.replies]: 30, [EAO.interested]: 7, [EAO.booked]: 2, [EAO.contacted]: 450 },
      [rec('EaoBolt30')]: { [EAO.period]: 'Last 30 days', [EAO.client]: [B1], [EAO.sent]: 777777 },
    },
    [T.linkedinOverview]: { [rec('LaoBolt')]: { [LAO.period]: 'Last 30 days', [LAO.client]: [B1], [LAO.sent]: 120, [LAO.accepted]: 40, [LAO.replies]: 9, [LAO.booked]: 1 } },
    [T.linkedinCampaigns]: { [rec('LicBolt')]: { [LIC.name]: 'Bolt LinkedIn', [LIC.clientRecs]: [B1], [LIC.status]: 'Active', [LIC.sent]: 120 } },
    [T.onboarding]: {
      [ONB_TW]: { [ONB_CLIENT]: [A1], fldVkfXhGnNgKwDYN: 'Twenty West Media', fld1AjmO7gSRAZTnw: 'Video ads', fld30MCMI88q4c3VE: SECRET.linkedinPw, fldRvFwsA7NtTwG1e: SECRET.twofa },
      [ONB_B]: { [ONB_CLIENT]: [B1], fldVkfXhGnNgKwDYN: 'Bolt Legal' },
    },
    [T.portalUsers]: {
      [rec('PuPat')]: { [PU.name]: 'Pat Softr', [PU.email]: 'pat@twentywest.com', [PU.client]: [A1], fldDpgfDL6egiRbK0: 'PLAIN PASSWORD' },
      [rec('PuGina')]: { [PU.name]: 'Gina Google', [PU.email]: 'gina@twentywest.com', [PU.client]: [A2] },
      [rec('PuTwo')]: { [PU.name]: 'Two Clients', [PU.email]: 'two@x.com', [PU.client]: [A1, B1] },
      [rec('PuOld')]: { [PU.name]: 'Old', [PU.email]: 'old@oldclient.com', [PU.client]: [OLD] },
      [rec('PuNone')]: { [PU.name]: 'Nobody', [PU.email]: 'nobody@x.com' },
    },
  };
}

function cfg(over: Partial<Config> = {}): Config {
  return { ...loadConfig({ ENGINE_SECRET: 'x'.repeat(40), DATABASE_URL: url ?? 'postgres://x', HQ_SESSION_SECRET: 's'.repeat(40), HQ_HOST, PORTAL_HOST, PORTAL_MEETING_URL: 'https://calendly.com/dulcy/client-call' } as NodeJS.ProcessEnv), airtableApiKey: undefined, anthropicApiKey: undefined, ...over };
}

interface Res { status: number; body: any; text: string; headers: http.IncomingHttpHeaders }
function call(method: string, p: string, opts: { body?: unknown; cookie?: string; host?: string } = {}): Promise<Res> {
  return new Promise((resolve, reject) => {
    const host = opts.host ?? `127.0.0.1:${port}`;
    const data = opts.body === undefined ? (method === 'GET' ? undefined : '{}') : JSON.stringify(opts.body);
    const headers: Record<string, string> = { host };
    if (data !== undefined) { headers['content-type'] = 'application/json'; headers.origin = `https://${host}`; }
    if (opts.cookie) headers.cookie = opts.cookie;
    const req = http.request({ host: '127.0.0.1', port, method, path: p, headers }, (res) => {
      const chunks: Buffer[] = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => { const text = Buffer.concat(chunks).toString('utf8'); let body: any = null; try { body = JSON.parse(text); } catch { /* html */ } resolve({ status: res.statusCode ?? 0, body, text, headers: res.headers }); });
    });
    req.on('error', reject);
    if (data !== undefined) req.write(data);
    req.end();
  });
}
const sessionOf = (r: Res) => ([] as string[]).concat(r.headers['set-cookie'] ?? []).map((c) => c.split(';')[0]).find((c) => c.startsWith('__Host-hq_session=') && c.length > 20) ?? '';
async function login(email: string, password: string, host?: string) { const r = await call('POST', '/hq/api/auth/login', { body: { email, password }, host }); return { r, cookie: sessionOf(r) }; }
let owner = '';
async function clientCookie(email: string, clientRec: string) {
  const r = await call('POST', '/hq/api/users', { cookie: owner, body: { name: email.split('@')[0], email, role: 'client', clientRec, password: CPW } });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  const l = await login(email, CPW);
  assert.equal(l.r.status, 200);
  return l.cookie;
}
const portalGet = async (cookie: string, sub: string) => call('GET', `/hq/api/portal/${sub}`, { cookie });

before(async () => {
  webDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hqportal2-'));
  fs.mkdirSync(path.join(webDir, 'assets'));
  fs.writeFileSync(path.join(webDir, 'index.html'), '<!doctype html><title>Dulcy HQ</title><script type="module" src="/hq/assets/index-HQ.js"></script>');
  fs.writeFileSync(path.join(webDir, 'portal.html'), '<!doctype html><title>Dulcy client portal</title><script type="module" src="/hq/assets/portal-P.js"></script><link rel="stylesheet" href="/hq/assets/ui-S.css">');
  fs.writeFileSync(path.join(webDir, 'assets', 'portal-P.js'), 'import "./ui-U.js";');
  fs.writeFileSync(path.join(webDir, 'assets', 'ui-U.js'), 'export const ui = 1;');
  fs.writeFileSync(path.join(webDir, 'assets', 'ui-S.css'), 'body{}');
  fs.writeFileSync(path.join(webDir, 'assets', 'index-HQ.js'), 'HQ INTERNAL APP');
  if (skip) return;
  db = createPool(url!); await migrate(db); await migrate(db);
  server = createServer(db, cfg(), { at: at as any, webDir });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', () => r()));
  port = (server.address() as AddressInfo).port;
});
after(async () => { if (!skip) { server.close(); await db.end(); } fs.rmSync(webDir, { recursive: true, force: true }); });
beforeEach(async () => {
  seed(); writes = []; asked = []; _resetPortalCache(); _resetClientsCache(); _resetInboxCache(); _resetPortalUsersCache();
  if (skip) return;
  await db.query('TRUNCATE hq_users, hq_sessions, hq_login_attempts, hq_user_events, hq_portal_tokens, hq_portal_resets, hq_portal_writes RESTART IDENTITY CASCADE');
  await upsertUser(db, 'alex@dulcy.io', 'owner', PW, 'Alex');
  owner = (await login('alex@dulcy.io', PW)).cookie;
});

const GETS = ['session', 'home', 'email', 'linkedin', 'ai-caller', 'campaigns', 'calendar', 'pipeline', 'feedback', 'tasks', 'documents', 'our-meetings', 'billing', 'notifications', 'access', 'onboarding', 'pathway'];

// ---------- Pure ----------
test('the client guard and the portal-host allow-list: portal words, keys and actions only', () => {
  const ok = ['/hq/api/portal/home', '/hq/api/portal/ai-caller', '/hq/api/portal/lead/AbCdEf123_-x', '/hq/api/portal/lead/AbCdEf123_-x/feedback', '/hq/api/portal/notifications/dismiss', '/hq/api/portal/task/AbCdEf123_-x/done'];
  for (const p of ok) assert.ok(CLIENT_API_ALLOW.some((re) => re.test(p)), p);
  for (const p of ['/hq/api/portal', '/hq/api/portal/', '/hq/api/portal/../clients', '/hq/api/portal/lead/recAAAAAAAAAAAAAAA', '/hq/api/portal/lead/x/y/z', '/hq/api/portal/Home', '/hq/api/portalx/home'])
    assert.ok(!CLIENT_API_ALLOW.some((re) => re.test(p)), p);
  for (const p of ['/hq/api/auth/login', '/hq/api/auth/signup', '/hq/api/auth/forgot', '/hq/api/auth/set-password', '/hq/api/auth/google/callback', '/hq/api/portal/home']) assert.ok(portalHostMayCall(p), p);
  for (const p of ['/hq/api/me', '/hq/api/users', '/hq/api/clients', '/hq/api/decisions', '/hq/api/chat', '/hq/api/auth/whatever', '/jobs']) assert.ok(!portalHostMayCall(p), p);
});

// ---------- Isolation: reads ----------
test('two clients never see each other on any portal screen (credentials, tasks, documents, billing included)', { skip }, async () => {
  const tw = await clientCookie('pat@twentywest.com', A2);
  const bolt = await clientCookie('ben@boltlegal.com', B1);
  const twText: string[] = []; const boltText: string[] = [];
  for (const s of GETS) {
    const a = await portalGet(tw, s); assert.equal(a.status, 200, `${s}: ${a.text}`); twText.push(a.text);
    const b = await portalGet(bolt, `${s}?client=${A1}`); assert.equal(b.status, 200, `${s}: ${b.text}`); boltText.push(b.text);
  }
  const twAll = twText.join('\n'), boltAll = boltText.join('\n');
  for (const x of ['Bolt', 'bea@', 'BOLT-LOGIN', SECRET.bolt, 'INV-BOLT', '777777', 'Bolt Deck', 'Bolt: sign', 'Bolt kickoff', B1]) assert.ok(!twAll.includes(x), `Twenty West sees ${x}`);
  for (const x of ['Twenty West', 'TW ', 'Ann Prospect', 'Hank', SECRET.tw, 'INV-TW', 'pitch deck', 'Cold Email Script', 'Monthly review', A1, A2]) assert.ok(!boltAll.includes(x), `Bolt sees ${x}`);
  // Never anywhere: internal rows and fields, other people's money, credentials outside Access, Airtable IDs.
  for (const x of [SECRET.draft, SECRET.linkedinPw, SECRET.twofa, 'INTERNAL ERROR NOTE', 'TW INTERNAL margin', 'HIDDEN TW meeting', 'INV-TW-DRAFT', 'PLAIN PASSWORD', 'airtable.com/', 'Monthly Fee', '4517,'])
    assert.ok(!(twAll + boltAll).includes(x), `answers contain ${x}`);
  assert.ok(!/\brec[A-Za-z0-9]{14}\b/.test(twAll + boltAll), 'no Airtable record ID in any answer');
  // Credentials: only on Access, only the client's own.
  const acc = (await portalGet(tw, 'access')).body;
  assert.deepEqual(acc, { blocks: [{ label: '', text: SECRET.tw }] });
  assert.ok(!twText.filter((_, i) => GETS[i] !== 'access').join('').includes('Hunter2'), 'credentials only on the Access screen');
  // Specific shapes.
  const home = (await portalGet(tw, 'home')).body;
  assert.equal(home.client, 'Twenty West Media');
  assert.equal(home.next.title, 'Monthly review');
  assert.equal(home.tasks.open, 1);
  assert.equal(home.todo.review, 1);
  assert.ok(home.verdict.length > 10);
  assert.deepEqual((await portalGet(tw, 'tasks')).body.tasks.map((t: any) => [t.name, t.stage]), [['Upload your pitch deck', 'open'], ['Send 3 testimonials', 'done']]);
  assert.deepEqual((await portalGet(tw, 'documents')).body.documents.map((d: any) => [d.title, d.by, d.files[0]?.name]), [['Cold Email Script V1', 'dulcy', 'script.pdf']]);
  assert.deepEqual((await portalGet(tw, 'billing')).body.items.map((b: any) => [b.number, b.state]), [['INV-TW-1', 'Paid']]);
  assert.deepEqual((await portalGet(bolt, 'billing')).body.items.map((b: any) => [b.number, b.state]), [['INV-BOLT-1', 'Due']]);
  const email = (await portalGet(tw, 'email')).body;
  assert.equal(email.periods[0].sent, 900);
  assert.equal((await portalGet(tw, 'linkedin')).body.active, false, 'LinkedIn: not active for Twenty West');
  assert.equal((await portalGet(bolt, 'linkedin')).body.campaigns[0].name, 'Bolt LinkedIn');
  const ai = (await portalGet(tw, 'ai-caller')).body;
  assert.deepEqual([ai.active, ai.calls, ai.answered, ai.interested], [true, 40, 12, 3]);
  assert.equal((await portalGet(bolt, 'ai-caller')).body.active, false);
  const pipe = (await portalGet(tw, 'pipeline')).body;
  assert.deepEqual(pipe.stages.filter((s: any) => s.leads.length).map((s: any) => [s.stage, s.leads.map((l: any) => l.name)]), [['New Interested', ['Hank Handed']], ['Booked Meeting', ['Ann Prospect']], ['Lost', ['Lou Lost']]]);
  const onb = (await portalGet(tw, 'onboarding')).body;
  assert.equal(onb.ready, true);
  assert.equal(onb.fields.find((f: any) => f.key === 'company').value, 'Twenty West Media');
  assert.ok(!JSON.stringify(onb).includes(SECRET.linkedinPw) && !JSON.stringify(onb).includes('fld'), 'no credential field, no field IDs');
  const sess = (await portalGet(tw, 'session')).body;
  assert.equal(sess.go.meeting, 'https://calendly.com/dulcy/client-call');
  assert.deepEqual(sess.channels, { email: true, linkedin: false, aiCaller: true, directMail: false });
  // Airtable is never asked for a money, draft or password field by the portal.
  const fields = asked.flatMap((a) => a.fields);
  for (const f of ['Monthly Fee', 'Estimated LTV', 'Outstanding Receivables', RA.draft, RA.policy, EF.history, KF.workflowError, KF.bisonUrl, 'fldDpgfDL6egiRbK0', 'fld30MCMI88q4c3VE', 'fldRvFwsA7NtTwG1e', 'fldjhUHG6Ittk4W4C'])
    assert.ok(!fields.includes(f), `portal reads ${f}`);
  assert.equal(writes.length, 0, 'reading writes nothing');
});

test('a client opening another client\'s key gets nothing (campaign, lead), and keys are not Airtable IDs', { skip }, async () => {
  const tw = await clientCookie('pat@twentywest.com', A1);
  const mine = (await portalGet(tw, `campaign/${opaque(C.twReview)}`));
  assert.equal(mine.status, 200);
  assert.equal(mine.body.canReview, true);
  assert.equal(mine.body.emails[0].subject, 'quick idea');
  assert.equal(mine.body.targeting[0].value, 'Dental');
  for (const p of [`campaign/${opaque(C.boltReview)}`, `campaign/${opaque(C.boltLive)}`, `lead/${opaque(E.bea)}`]) assert.equal((await portalGet(tw, p)).status, 404, p);
  assert.equal((await portalGet(tw, `lead/${C.twReview}`)).status, 403, 'an Airtable record ID is not even a valid path');
  assert.equal((await portalGet(tw, `lead/${opaque(E.ann)}`)).body.name, 'Ann Prospect');
});

// ---------- Isolation: writes ----------
test('no client can write to another client\'s record: forged and borrowed keys change nothing', { skip }, async () => {
  const tw = await clientCookie('pat@twentywest.com', A1);
  const tries: [string, unknown][] = [
    [`campaign/${opaque(C.boltReview)}/review`, { feedback: 'Approve Campaign' }],
    [`lead/${opaque(E.bea)}/feedback`, { status: 'Qualified' }],
    [`lead/${opaque(E.bea)}/deal`, { value: 5000, date: day(0), type: 'Other' }],
    [`task/${opaque(K.boltTask)}/done`, {}],
    [`task/${'A'.repeat(12)}/done`, {}],
    [`lead/${'zzzzzzzzzzzz'}/feedback`, { status: 'Qualified' }],
  ];
  for (const [p, body] of tries) {
    const r = await call('POST', `/hq/api/portal/${p}`, { cookie: tw, body });
    assert.equal(r.status, 404, `${p}: ${r.text}`);
  }
  // Body tricks: a client ID, record IDs or field IDs in the body are ignored or refused.
  const r = await call('POST', `/hq/api/portal/task/${opaque(K.twTask)}/done`, { cookie: tw, body: { clientRec: B1, id: K.boltTask, [TASK.client]: [B1] } });
  assert.equal(r.status, 200);
  assert.deepEqual(writes, [{ op: 'update', table: T.tasks, id: K.twTask, fields: { [TASK.stage]: 'Done' } }], 'only the own task, only Stage');
  const onb = await call('POST', '/hq/api/portal/onboarding', { cookie: tw, body: { values: { linkedinPassword: 'x' } } });
  assert.equal(onb.status, 400, 'a field outside the onboarding answers is refused');
  const onb2 = await call('POST', '/hq/api/portal/onboarding', { cookie: tw, body: { values: { [ONB_CLIENT]: [B1] } } });
  assert.equal(onb2.status, 400);
  assert.equal(writes.length, 1);
  assert.equal(tables[T.tasks][K.boltTask][TASK.stage], 'New Task');
  // Owners and members cannot write through the portal.
  assert.equal((await call('POST', `/hq/api/portal/task/${opaque(K.twTask)}/done`, { cookie: owner, body: {} })).status, 403);
});

test('client writes are exactly the Softr writes, and each is logged (who, when, table, record, fields)', { skip }, async () => {
  const tw = await clientCookie('pat@twentywest.com', A1);
  // Campaign Review → a Campaign Feedback record linked to the campaign.
  const bad = await call('POST', `/hq/api/portal/campaign/${opaque(C.twReview)}/review`, { cookie: tw, body: { feedback: 'Request Changes' } });
  assert.equal(bad.status, 400, 'changes need what to change');
  const rv = await call('POST', `/hq/api/portal/campaign/${opaque(C.twReview)}/review`, { cookie: tw, body: { feedback: 'Request Changes', changes: 'Copy', reviewCopy: 'Shorter please', geo: '🎯 Too narrow — expand it', context: 'Thanks' } });
  assert.equal(rv.status, 200, rv.text);
  assert.deepEqual(writes.at(-1), { op: 'create', table: T.campaignFeedback, id: writes.at(-1)!.id, fields: { [CFB.lead]: C.twReview, [CFB.campaigns]: [C.twReview], [CFB.feedback]: 'Request Changes', [CFB.changes]: 'Copy', [CFB.geo]: '🎯 Too narrow — expand it', [CFB.reviewCopy]: 'Shorter please', [CFB.context]: 'Thanks' } });
  assert.equal((await call('POST', `/hq/api/portal/campaign/${opaque(C.twLive)}/review`, { cookie: tw, body: { feedback: 'Approve Campaign' } })).status, 409, 'only a campaign in Client Review');
  // Call Feedback → lead = the Emails record (Airtable's own automation links it).
  assert.equal((await call('POST', `/hq/api/portal/lead/${opaque(E.ann)}/feedback`, { cookie: tw, body: { status: "(Internal) Don't Track This Call" } })).status, 400, 'internal choice refused');
  assert.equal((await call('POST', `/hq/api/portal/lead/${opaque(E.ann)}/feedback`, { cookie: tw, body: { status: 'New Date' } })).status, 400, 'New Date needs the date');
  const fb = await call('POST', `/hq/api/portal/lead/${opaque(E.ann)}/feedback`, { cookie: tw, body: { status: 'Qualified', rating: 5, comments: 'Great call', recording: 'https://fathom.video/x' } });
  assert.equal(fb.status, 200, fb.text);
  assert.deepEqual(writes.at(-1)!.fields, { [CF.lead]: E.ann, [CF.status]: 'Qualified', [CF.rating]: 5, [CF.notes]: 'Great call', [CF.link]: 'https://fathom.video/x' });
  assert.equal(writes.at(-1)!.table, T.callFeedback);
  assert.equal((await call('POST', `/hq/api/portal/lead/${opaque(E.hank)}/feedback`, { cookie: tw, body: { status: 'Qualified' } })).status, 409, 'feedback is for booked calls');
  // Close a Deal → lead = the Emails record.
  const deal = await call('POST', `/hq/api/portal/lead/${opaque(E.ann)}/deal`, { cookie: tw, body: { value: 12000, date: day(0), type: 'Monthly Retainer', why: 'Proof' } });
  assert.equal(deal.status, 200, deal.text);
  assert.deepEqual(writes.at(-1)!.fields, { [DEAL.lead]: E.ann, [DEAL.value]: 12000, [DEAL.date]: day(0), [DEAL.type]: 'Monthly Retainer', [DEAL.why]: 'Proof' });
  const lead = (await portalGet(tw, `lead/${opaque(E.ann)}`)).body;
  assert.equal(lead.feedback[0].status, 'Qualified', 'the new feedback shows at once (cache refreshed)');
  assert.equal(lead.deal.value, 12000);
  assert.equal(lead.canCloseDeal, false);
  assert.equal((await call('POST', `/hq/api/portal/lead/${opaque(E.ann)}/deal`, { cookie: tw, body: { value: 1, date: day(0), type: 'Other' } })).status, 409, 'one deal per lead');
  // Task done, onboarding answers (only what changed), dismiss all.
  assert.equal((await call('POST', `/hq/api/portal/task/${opaque(K.twTask)}/done`, { cookie: tw, body: {} })).status, 200);
  assert.equal((await call('POST', `/hq/api/portal/task/${opaque(K.twTask)}/done`, { cookie: tw, body: {} })).status, 409);
  const ob = await call('POST', '/hq/api/portal/onboarding', { cookie: tw, body: { values: { company: 'Twenty West Media', sell: 'Video ads and UGC', size: '11-20', website: 'not a link' } } });
  assert.equal(ob.status, 400, 'a bad link is refused');
  const ob2 = await call('POST', '/hq/api/portal/onboarding', { cookie: tw, body: { values: { company: 'Twenty West Media', sell: 'Video ads and UGC', size: '11-20' } } });
  assert.equal(ob2.status, 200, ob2.text);
  assert.deepEqual(writes.at(-1), { op: 'update', table: T.onboarding, id: ONB_TW, fields: { fld1AjmO7gSRAZTnw: 'Video ads and UGC', fldtq9oNmDpGQJBS6: '11-20' } }, 'only the changed answers');
  const dis = await call('POST', '/hq/api/portal/notifications/dismiss', { cookie: tw, body: {} });
  assert.deepEqual(dis.body, { ok: true, dismissed: 1 });
  assert.deepEqual(writes.at(-1), { op: 'update', table: T.notifications, id: K.twNote, fields: { [NOTE.dismissed]: true } });
  assert.equal(tables[T.notifications][K.boltNote][NOTE.dismissed], undefined, "Bolt's notification untouched");
  // The log: one row per write, no values.
  const log = (await db.query(`SELECT user_email, client_rec, action, table_id, record_id, fields FROM hq_portal_writes ORDER BY id`)).rows;
  assert.deepEqual(log.map((l) => l.action), ['campaign_review', 'call_feedback', 'close_deal', 'task_done', 'onboarding_save', 'notification_dismiss']);
  assert.ok(log.every((l) => l.user_email === 'pat@twentywest.com' && l.client_rec === A1));
  assert.deepEqual(log[3].fields, [TASK.stage]);
  assert.ok(!JSON.stringify(log).includes('Great call') && !JSON.stringify(log).includes('12000'), 'no values in the log');
  const ow = await call('GET', '/hq/api/users/portal-writes', { cookie: owner });
  assert.equal(ow.body.writes.length, 6);
  assert.equal((await call('GET', '/hq/api/users/portal-writes', { cookie: tw })).status, 403);
});

test('v3 Home and Leads are one read each: needs, 30-day results per active channel, active campaigns, lead rows; all the session\'s own', { skip }, async () => {
  tables[T.emailOverview][rec('EaoTW60')] = { [EAO.period]: 'Last 60 days', [EAO.client]: [A1], [EAO.sent]: 2000, [EAO.replies]: 50, [EAO.interested]: 10, [EAO.booked]: 3 };
  const tw = await clientCookie('pat@twentywest.com', A2);
  const bolt = await clientCookie('ben@boltlegal.com', B1);
  const home = (await portalGet(tw, 'home')).body;
  // Needs you: the open task, the campaign to review, the call that happened with no feedback; onboarding is submitted.
  assert.deepEqual(home.needs.tasks.map((t: any) => [t.name, t.stage, t.details]), [['Upload your pitch deck', 'open', 'The newest one, please.']]);
  assert.deepEqual(home.needs.review, [{ key: opaque(C.twReview), name: 'TW Dentists Q1' }]);
  assert.deepEqual(home.needs.feedback.map((m: any) => [m.key, m.name]), [[opaque(E.ann), 'Ann Prospect']]);
  assert.equal(home.needs.onboarding, false);
  assert.equal(home.needs.count, 3);
  assert.equal((await portalGet(tw, 'session')).body.badges.needs, 3, 'the one badge counts exactly what the Needs you card lists');
  // Results: the last 30 days against the 30 before (60 minus 30), only for channels that are on.
  assert.deepEqual(home.results.email.now, { sent: 900, replies: 30, interested: 7, booked: 2 });
  assert.deepEqual(home.results.email.before, { sent: 1100, replies: 20, interested: 3, booked: 1 });
  assert.equal(home.results.email.label, 'Last 30 days');
  assert.equal(home.results.linkedin, null, 'LinkedIn is off for Twenty West: no section');
  assert.deepEqual([home.results.aiCaller.calls, home.results.aiCaller.answered, home.results.aiCaller.interested], [40, 12, 3]);
  assert.equal(home.results.directMail, false);
  assert.deepEqual(home.campaigns.map((c: any) => [c.name, c.state]), [['TW Dentists Q1', 'review'], ['TW Clinics', 'live']]);
  // Bolt: its own needs only (the onboarding form is linked but not submitted), LinkedIn on, AI caller off.
  const bh = (await portalGet(bolt, 'home')).body;
  assert.deepEqual([bh.needs.tasks.map((t: any) => t.name), bh.needs.review.map((r: any) => r.name), bh.needs.feedback.map((m: any) => m.name), bh.needs.onboarding, bh.needs.count],
    [['Bolt: sign the DPA'], ['Bolt Law Firms v2'], ['Bea Bolt'], true, 4]);
  assert.deepEqual(bh.results.linkedin, { label: 'Last 30 days', now: { sent: 120, accepted: 40, replies: 9, booked: 1 }, before: null });
  assert.equal(bh.results.aiCaller, null);
  assert.equal(bh.results.email.now.sent, 777777);
  const bAll = JSON.stringify(bh), twAll = JSON.stringify(home);
  for (const x of ['Twenty West', 'TW ', 'Ann', 'pitch deck', '2000']) assert.ok(!bAll.includes(x), `Bolt's Home has ${x}`);
  for (const x of ['Bolt', 'Bea', 'DPA', '777777']) assert.ok(!twAll.includes(x), `Twenty West's Home has ${x}`);
  // Leads: every row carries what they wrote, whether feedback is due, and the last feedback.
  const rows = (await portalGet(tw, 'pipeline')).body.stages.flatMap((s: any) => s.leads);
  const ann = rows.find((l: any) => l.name === 'Ann Prospect');
  assert.deepEqual([ann.message, ann.feedbackDue, ann.lastFeedback], ['Yes, Tuesday works.', true, null]);
  assert.equal(rows.find((l: any) => l.name === 'Hank Handed').feedbackDue, false, 'not booked: no feedback due');
  assert.ok(!rows.some((l: any) => l.name === 'Bea Bolt'));
  // A call booked for a day still to come stays in the list (and no feedback is due yet).
  tables[EMAILS][rec('EmSoon')] = { [EF.leadName]: 'Sue Soon', [EF.latestReply]: 'Friday works', [EF.latestReplyAt]: ago(2), [EF.leadStatus]: 'Interested', [EF.workspace]: '11', [EF.stage]: 'Booked Meeting', [XF.callBookedAt]: day(4) };
  _resetPortalCache();
  const soon = (await portalGet(tw, 'pipeline')).body.stages.flatMap((s: any) => s.leads).find((l: any) => l.name === 'Sue Soon');
  assert.deepEqual([soon?.stage, soon?.feedbackDue], ['Booked Meeting', false]);
  // Feedback given from the lead page clears it from Needs you and shows on the row at once.
  assert.equal((await call('POST', `/hq/api/portal/lead/${opaque(E.ann)}/feedback`, { cookie: tw, body: { status: 'Qualified', rating: 4 } })).status, 200);
  const after2 = (await portalGet(tw, 'pipeline')).body.stages.flatMap((s: any) => s.leads).find((l: any) => l.name === 'Ann Prospect');
  assert.deepEqual([after2.feedbackDue, after2.lastFeedback], [false, { status: 'Qualified', rating: 4 }]);
  const h2 = (await portalGet(tw, 'home')).body;
  assert.deepEqual([h2.needs.feedback.length, h2.needs.count], [0, 2]);
  // Marking the task done from Home is the same write as before (Stage = Done) and leaves Needs you.
  assert.equal((await call('POST', `/hq/api/portal/task/${opaque(K.twTask)}/done`, { cookie: tw, body: {} })).status, 200);
  assert.deepEqual(writes.at(-1), { op: 'update', table: T.tasks, id: K.twTask, fields: { [TASK.stage]: 'Done' } });
  assert.equal((await portalGet(tw, 'home')).body.needs.count, 1);
  assert.ok(!/\brec[A-Za-z0-9]{14}\b/.test(JSON.stringify(h2) + bAll), 'no Airtable record ID');
});

test('account settings: a client changes its own name and password', { skip }, async () => {
  const tw = await clientCookie('pat@twentywest.com', A1);
  assert.equal((await call('POST', '/hq/api/portal/account', { cookie: tw, body: { name: 'Pat W' } })).status, 200);
  assert.equal((await portalGet(tw, 'session')).body.user.name, 'Pat W');
  assert.equal((await call('POST', '/hq/api/portal/account', { cookie: tw, body: { current: 'wrong', password: 'a brand new password', password2: 'a brand new password' } })).status, 400);
  const ok = await call('POST', '/hq/api/portal/account', { cookie: tw, body: { current: CPW, password: 'a brand new password', password2: 'a brand new password' } });
  assert.equal(ok.status, 200);
  assert.equal((await portalGet(tw, 'session')).status, 401, 'the old session ended');
  assert.equal((await portalGet(sessionOf(ok), 'session')).status, 200, 'a fresh session came back');
  assert.equal((await login('pat@twentywest.com', 'a brand new password')).r.status, 200);
});

// ---------- Sign-up, linking, setup links ----------
test('portal sign-up never sees data until the owner links it; the owner sees the suggested client and links it', { skip }, async () => {
  const s = await call('POST', '/hq/api/auth/signup', { host: PORTAL_HOST, body: { name: 'Pat', email: 'pat@twentywest.com', password: CPW, password2: CPW, role: 'client', clientRec: A1 } });
  assert.equal(s.status, 200);
  assert.match(s.body.message, /link it to your company/);
  const same = await call('POST', '/hq/api/auth/signup', { host: PORTAL_HOST, body: { name: 'X', email: 'nobody-here@x.com', password: CPW, password2: CPW } });
  assert.equal(same.body.message, s.body.message, 'the same answer for every email');
  assert.equal((await login('pat@twentywest.com', CPW, PORTAL_HOST)).r.status, 401, 'cannot sign in yet');
  const row = (await db.query(`SELECT id, role, client_rec, pending, portal_signup FROM hq_users WHERE email='pat@twentywest.com'`)).rows[0];
  assert.deepEqual([row.role, row.client_rec, row.pending, row.portal_signup], ['member', null, true, true]);
  const users = (await call('GET', '/hq/api/users', { cookie: owner })).body.users;
  const req = users.find((u: any) => u.email === 'pat@twentywest.com');
  assert.equal(req.portalRequest, true);
  assert.deepEqual(req.suggest, { id: A1, name: 'Twenty West Media' }, 'suggested from Airtable Portal Users');
  assert.equal(users.find((u: any) => u.email === 'nobody-here@x.com').suggest, null);
  assert.equal((await call('POST', `/hq/api/users/${row.id}/approve`, { cookie: owner, body: { role: 'member' } })).status, 409, 'a portal request is never approved as member/owner');
  await upsertUser(db, 'josh@dulcy.io', 'member', PW, 'Josh');
  assert.equal((await call('POST', `/hq/api/users/${row.id}/link`, { cookie: (await login('josh@dulcy.io', PW)).cookie, body: { clientRec: A1 } })).status, 403, 'only the owner links');
  assert.equal((await call('POST', `/hq/api/users/${row.id}/link`, { cookie: owner, body: { clientRec: rec('Nope') } })).status, 400);
  assert.equal((await call('POST', `/hq/api/users/${row.id}/link`, { cookie: owner, body: { clientRec: A2 } })).status, 200);
  const linked = (await db.query(`SELECT role, client_rec, client_name, pending FROM hq_users WHERE id=$1`, [row.id])).rows[0];
  assert.deepEqual(linked, { role: 'client', client_rec: A1, client_name: 'Twenty West Media', pending: false });
  const l = await login('pat@twentywest.com', CPW, PORTAL_HOST);
  assert.equal(l.r.status, 200);
  assert.equal((await call('GET', '/hq/api/portal/home', { cookie: l.cookie, host: PORTAL_HOST })).body.client, 'Twenty West Media');
  // An owner or member login cannot be "linked" (only portal requests).
  const alexId = (await db.query(`SELECT id FROM hq_users WHERE email='alex@dulcy.io'`)).rows[0].id;
  assert.equal((await call('POST', `/hq/api/users/${alexId}/link`, { cookie: owner, body: { clientRec: A1 } })).status, 409);
  assert.equal(writes.length, 0);
});

test('Softr users: the owner sees who to invite and makes a one-time setup link; forgot password goes to the owner', { skip }, async () => {
  const list = (await call('GET', '/hq/api/users/softr', { cookie: owner })).body;
  assert.equal(list.counts.total, 5);
  assert.deepEqual(list.users.filter((u: any) => u.clientActive).map((u: any) => [u.name, u.client]).sort(), [['Gina Google', 'Twenty West Media'], ['Pat Softr', 'Twenty West Media']]);
  assert.equal(list.users.find((u: any) => u.name === 'Two Clients').client, 'More than one client');
  assert.ok(!JSON.stringify(list).includes('PLAIN PASSWORD'), 'Softr password column never read');
  assert.equal((await call('POST', `/hq/api/users/softr/${rec('PuTwo')}/invite`, { cookie: owner, body: {} })).status, 409, 'two clients: fix in Airtable first');
  assert.equal((await call('POST', `/hq/api/users/softr/${rec('PuNone')}/invite`, { cookie: owner, body: {} })).status, 409);
  const inv = await call('POST', `/hq/api/users/softr/${rec('PuPat')}/invite`, { cookie: owner, body: {} });
  assert.equal(inv.status, 200, inv.text);
  const token = new URLSearchParams(String(inv.body.url).split('?')[1]).get('t')!;
  assert.match(inv.body.url, /^https:\/\/portal\.test\.local\/#\/set-password\?t=/);
  assert.equal((await db.query(`SELECT role, client_rec, password_hash FROM hq_users WHERE email='pat@twentywest.com'`)).rows[0].client_rec, A1);
  assert.equal((await db.query(`SELECT count(*)::int AS n FROM hq_portal_tokens WHERE id_hash=$1`, [token])).rows[0].n, 0, 'only the hash is stored');
  assert.equal((await call('POST', '/hq/api/auth/set-password', { host: PORTAL_HOST, body: { token, password: 'short', password2: 'short' } })).status, 400);
  const set = await call('POST', '/hq/api/auth/set-password', { host: PORTAL_HOST, body: { token, password: CPW, password2: CPW } });
  assert.equal(set.status, 200, set.text);
  assert.equal((await call('GET', '/hq/api/portal/session', { cookie: sessionOf(set), host: PORTAL_HOST })).body.client.name, 'Twenty West Media');
  assert.equal((await call('POST', '/hq/api/auth/set-password', { host: PORTAL_HOST, body: { token, password: CPW, password2: CPW } })).status, 400, 'a link works once');
  // Forgot password: the same answer for every email; the owner sees the ask and makes a link.
  const f1 = await call('POST', '/hq/api/auth/forgot', { host: PORTAL_HOST, body: { email: 'pat@twentywest.com' } });
  const f2 = await call('POST', '/hq/api/auth/forgot', { host: PORTAL_HOST, body: { email: 'stranger@x.com' } });
  assert.equal(f1.body.message, f2.body.message);
  const pat = (await call('GET', '/hq/api/users', { cookie: owner })).body.users.find((u: any) => u.email === 'pat@twentywest.com');
  assert.ok(pat.resetAsked, 'the ask shows on Users');
  const link = await call('POST', `/hq/api/users/${pat.id}/setup-link`, { cookie: owner, body: {} });
  assert.equal(link.status, 200);
  assert.equal((await call('GET', '/hq/api/users', { cookie: owner })).body.users.find((u: any) => u.email === 'pat@twentywest.com').resetAsked, null, 'handled');
  // An expired link does not work.
  const t2 = new URLSearchParams(String(link.body.url).split('?')[1]).get('t')!;
  await db.query(`UPDATE hq_portal_tokens SET expires_at = now() - interval '1 minute'`);
  assert.equal((await call('POST', '/hq/api/auth/set-password', { host: PORTAL_HOST, body: { token: t2, password: CPW, password2: CPW } })).status, 400);
  // Setup links are only for client logins.
  const alexId = (await db.query(`SELECT id FROM hq_users WHERE email='alex@dulcy.io'`)).rows[0].id;
  assert.equal((await call('POST', `/hq/api/users/${alexId}/setup-link`, { cookie: owner, body: {} })).status, 409);
  assert.equal(writes.length, 0);
});

test('Google on the portal: a verified email matching one active client in Portal Users is linked; anything else is a request', { skip }, async () => {
  let email = ''; let verified = true;
  const fakeGoogle = async () => new Response(JSON.stringify({ id_token: `x.${Buffer.from(JSON.stringify({ iss: 'https://accounts.google.com', aud: 'cid', exp: Math.floor(Date.now() / 1000) + 600, email_verified: verified, email })).toString('base64url')}.y` }), { status: 200 });
  const g = createServer(db, cfg({ hqGoogleClientId: 'cid', hqGoogleClientSecret: 'shh' }), { at: at as any, webDir, fetchImpl: fakeGoogle as any });
  await new Promise<void>((r) => g.listen(0, '127.0.0.1', () => r()));
  const saved = port; port = (g.address() as AddressInfo).port;
  const google = async (who: string, isVerified = true) => {
    email = who; verified = isVerified;
    const s = await call('GET', '/hq/api/auth/google/start', { host: PORTAL_HOST });
    const loc = new URL(String(s.headers.location));
    assert.equal(loc.searchParams.get('redirect_uri'), `https://${PORTAL_HOST}/hq/api/auth/google/callback`);
    const oauth = ([] as string[]).concat(s.headers['set-cookie'] ?? [])[0].split(';')[0];
    return call('GET', `/hq/api/auth/google/callback?code=c&state=${loc.searchParams.get('state')}`, { cookie: oauth, host: PORTAL_HOST });
  };
  try {
    const gina = await google('gina@twentywest.com');
    assert.equal(gina.headers.location, '/');
    const c = sessionOf(gina);
    assert.equal((await call('GET', '/hq/api/portal/session', { cookie: c, host: PORTAL_HOST })).body.client.name, 'Twenty West Media', 'linked through the (Internal) record to the client');
    for (const who of ['two@x.com', 'old@oldclient.com', 'nobody@x.com', 'stranger@gmail.com']) {
      const r = await google(who);
      assert.match(String(r.headers.location), /^\/#\/login\?notice=/, who);
      assert.equal(sessionOf(r), '', `${who}: no session`);
      const u = (await db.query(`SELECT role, pending, portal_signup, client_rec FROM hq_users WHERE email=$1`, [who])).rows[0];
      assert.deepEqual([u.role, u.pending, u.portal_signup, u.client_rec], ['member', true, true, null], `${who}: a request only`);
    }
    const unverified = await google('pat@twentywest.com', false);
    assert.match(decodeURIComponent(String(unverified.headers.location)), /error=.*could not be verified/);
    assert.equal((await db.query(`SELECT count(*)::int AS n FROM hq_users WHERE email='pat@twentywest.com'`)).rows[0].n, 0, 'an unverified email gets nothing');
    const alex = await google('alex@dulcy.io');
    assert.equal(alex.headers.location, `https://${HQ_HOST}/`, 'staff are sent to HQ');
    assert.equal(sessionOf(alex), '', 'no staff session on the portal host');
  } finally { port = saved; g.close(); }
});

// ---------- Host routing ----------
test('the portal host serves only the portal shell and the portal + login APIs; staff are sent to HQ', { skip }, async () => {
  const shell = await call('GET', '/', { host: PORTAL_HOST });
  assert.equal(shell.status, 200);
  assert.match(shell.text, /Dulcy client portal/);
  for (const p of ['/hq/', '/hq', '/leads', '/hq/index.html', '/anything/else']) {
    const r = await call('GET', p, { host: PORTAL_HOST });
    assert.ok(!r.text.includes('Dulcy HQ') && !r.text.includes('index-HQ'), `${p} must not serve HQ's app`);
  }
  assert.equal((await call('GET', '/hq/assets/portal-P.js', { host: PORTAL_HOST })).status, 200);
  assert.equal((await call('GET', '/hq/assets/ui-U.js', { host: PORTAL_HOST })).status, 200, 'a chunk the portal imports');
  assert.equal((await call('GET', '/hq/assets/ui-S.css', { host: PORTAL_HOST })).status, 200);
  assert.equal((await call('GET', '/hq/assets/index-HQ.js', { host: PORTAL_HOST })).status, 404, "HQ's own bundle is not served on the portal host");
  // HQ API routes and the engine's signed API: not on the portal host, even for the owner.
  for (const p of ['/hq/api/me', '/hq/api/users', '/hq/api/clients', '/hq/api/decisions', '/hq/api/today', '/hq/api/chat', '/jobs', '/jobs/1', '/health']) {
    const r = await call('GET', p, { host: PORTAL_HOST, cookie: owner });
    assert.equal(r.status, p === '/health' ? 200 : p.startsWith('/hq/api/') ? 404 : 200, `${p} → ${r.status}`);
    assert.ok(!r.text.includes('alex@dulcy.io') && !/"jobs"|signature/i.test(r.text), `${p} leaks nothing`);
  }
  // Owner signing in on the portal host: no session there, sent to HQ.
  const ol = await call('POST', '/hq/api/auth/login', { host: PORTAL_HOST, body: { email: 'alex@dulcy.io', password: PW } });
  assert.deepEqual([ol.status, ol.body.redirect, sessionOf(ol)], [200, `https://${HQ_HOST}/`, '']);
  const cfgR = await call('GET', '/hq/api/auth/config', { host: PORTAL_HOST });
  assert.equal(cfgR.body.portal, true);
  // HQ host: the internal app, and the portal preview at /portal.
  assert.match((await call('GET', '/', { host: HQ_HOST })).text, /Dulcy HQ/);
  assert.match((await call('GET', '/portal/', { host: HQ_HOST })).text, /Dulcy client portal/);
  assert.match((await call('GET', '/hq/portal/')).text, /Dulcy client portal/);
});

test('the portal host: a client works there; its own portal answers carry no internal keys', { skip }, async () => {
  const tw = await clientCookie('pat@twentywest.com', A1);
  const keys = new Set<string>();
  const walk = (x: unknown) => { if (Array.isArray(x)) x.forEach(walk); else if (x && typeof x === 'object') for (const [k, v] of Object.entries(x)) { keys.add(k); walk(v); } };
  for (const s of [...GETS, `campaign/${opaque(C.twReview)}`, `lead/${opaque(E.ann)}`]) {
    const r = await call('GET', `/hq/api/portal/${s}`, { cookie: tw, host: PORTAL_HOST });
    assert.equal(r.status, 200, `${s}: ${r.text}`);
    if (s !== 'billing') walk(r.body);
  }
  const FORBIDDEN = /^fee$|Fee$|ltv|revenue|receivabl|mrr|draft|reason|policy|thread|intent|agent|decision|airtable|bounce|internal|echo|record(?!ing)|workspace|bison|kpi|^id$|Id$|fld/;
  for (const k of keys) assert.ok(!FORBIDDEN.test(k), `portal key "${k}" looks internal`);
  // The client is refused on HQ's own routes on both hosts.
  assert.equal((await call('GET', '/hq/api/clients', { cookie: tw })).status, 403);
  assert.equal((await call('GET', '/hq/api/clients', { cookie: tw, host: PORTAL_HOST })).status, 404);
});

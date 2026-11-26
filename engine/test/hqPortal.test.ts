// HQ Step 4: the client portal. Isolation first: a client login reaches only /hq/api/portal/*,
// sees only its own client's rows (the client comes from the session), never money, drafts, AI
// reasoning, notes, agents or Airtable links. Sign-up can never make a client. No real services.
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
import { _resetPortalCache, buildLeads, healthText, slice, type PortalSource } from '../src/hq/portal.js';
import { CLIENT_API_ALLOW, CLIENT_REFUSED, clientMayCall } from '../src/hq/server.js';

const url = process.env.TEST_DATABASE_URL;
const skip = !url ? 'TEST_DATABASE_URL not set' : false;
const PW = 'correct horse battery staple';
const CPW = 'client portal password 1';
let db: Db;
let server: http.Server;
let port = 0;
let webDir: string;

const rec = (tag: string) => `rec${(tag + '0'.repeat(14)).slice(0, 14)}`;
const A1 = rec('TwentyWest'), A2 = rec('TwentyWestInt'), B1 = rec('BoltLegal');
const DAY = 86_400_000;
const ago = (d: number) => new Date(Date.now() - d * DAY).toISOString();

// ---------- fake Airtable (ignores formulas and field lists, returns EVERY field: the portal must cut) ----------
let tables: Record<string, Record<string, Record<string, unknown>>>;
let writes: unknown[];
let asked: { table: string; fields: string[] }[];
const at = {
  async list(table: string, _formula: string, fields: string[] = []) { asked.push({ table, fields }); return Object.entries(tables[table] ?? {}).map(([id, f]) => ({ id, fields: { ...f }, createdTime: '2026-11-25T10:00:00.000Z' })); },
  async get(table: string, id: string) { const f = tables[table]?.[id]; return f ? { id, fields: { ...f } } : null; },
  async create(table: string, fields: Record<string, unknown>) { writes.push({ table, fields }); return rec('New'); },
  async update(table: string, id: string, fields: Record<string, unknown>) { writes.push({ table, id, fields }); },
};

const SECRET = { draft: 'SECRET DRAFT from Echo', reason: 'AI REASONING about the prospect', note: 'INTERNAL NOTE for Josh' };
function seed() {
  tables = {
    [WORKSPACES]: {
      [A1]: { Name: 'Twenty West Media', Status: 'Active', 'Client Type': 'Paying', ID: '11', 'Monthly Fee': 4517, 'Outstanding Receivables': 9133, 'Estimated LTV': 54011 },
      [A2]: { Name: 'Twenty West Media (Internal)', Status: 'Inactive', 'Client Type': 'Internal', ID: '12', 'Monthly Fee': 0 },
      [B1]: { Name: 'Bolt Legal', Status: 'Active', 'Client Type': 'Paying', ID: '21', 'Monthly Fee': 3000 },
    },
    [CAMPAIGNS_T]: {
      [rec('CampA1')]: { [KF.name]: 'TW Dentists', [KF.status]: 'Active', [KF.client]: [A1], [KF.sent]: 1200, [KF.replies]: 40, [KF.interested]: 9, [KF.booked]: 3, [KF.bouncedPct]: 1.2, [KF.workflowError]: SECRET.note, [KF.bisonUrl]: 'https://airtable.com/x' },
      [rec('CampA2')]: { [KF.name]: 'TW Clinics', [KF.status]: 'Active', [KF.client]: [A2], [KF.sent]: 300, [KF.replies]: 6, [KF.interested]: 1, [KF.booked]: 0, [KF.bouncedPct]: 4.6 },
      [rec('CampA3')]: { [KF.name]: 'TW Old', [KF.status]: 'Completed', [KF.client]: [A1], [KF.sent]: 5000 },
      [rec('CampB1')]: { [KF.name]: 'Bolt Law Firms', [KF.status]: 'Active', [KF.client]: [B1], [KF.sent]: 800, [KF.replies]: 20, [KF.interested]: 4, [KF.booked]: 1, [KF.bouncedPct]: 3.0 },
      [rec('CampAB')]: { [KF.name]: 'Shared Mystery', [KF.status]: 'Active', [KF.client]: [A1, B1], [KF.sent]: 10 },
    },
    [EMAILS]: {
      [rec('EmAnn')]: { [EF.leadName]: 'Ann Prospect', [EF.company]: 'Smile Co', [EF.leadEmail]: 'ann@smile.co', [EF.latestReply]: 'Yes, Tuesday works.\n\nOn Mon, Bob wrote:\n> our pitch', [EF.latestReplyAt]: ago(2), [EF.leadStatus]: 'Meeting Request', [EF.workspace]: '11', [EF.stage]: 'Booked Meeting', [XF.meetingBookedAt]: ago(1),
        [RA.draft]: SECRET.draft, [RA.seanReason]: SECRET.reason, [RA.policy]: JSON.stringify({ reason: SECRET.reason }), [RA.seanInput]: SECRET.note, [EF.history]: 'Full thread with our replies' },
      [rec('EmHank')]: { [EF.leadName]: 'Hank Handed', [EF.company]: 'Dental Group', [EF.leadEmail]: 'hank@dg.com', [EF.latestReply]: 'Send me the details please', [EF.latestReplyAt]: ago(5), [EF.leadStatus]: 'Interested', [EF.workspace]: '12', [EF.clientHandling]: true, [RA.draft]: SECRET.draft },
      [rec('EmNope')]: { [EF.leadName]: 'Nora Nope', [EF.company]: 'Nope Inc', [EF.latestReply]: 'Not interested', [EF.latestReplyAt]: ago(3), [EF.leadStatus]: 'Not Interested', [EF.workspace]: '11', [EF.clientHandling]: true },
      [rec('EmIvy')]: { [EF.leadName]: 'Ivy Interested', [EF.company]: 'Ivy Co', [EF.latestReply]: 'Tell me more', [EF.latestReplyAt]: ago(3), [EF.leadStatus]: 'Interested', [EF.workspace]: '11', [RA.state]: 'Needs Approval', [RA.draft]: SECRET.draft },
      [rec('EmDnc')]: { [EF.leadName]: 'Dan Dnc', [EF.company]: 'Dnc Co', [EF.latestReply]: 'Sure', [EF.latestReplyAt]: ago(1), [EF.leadStatus]: 'Interested', [EF.workspace]: '11', [EF.clientHandling]: true, [EF.dnc]: true },
      [rec('EmOld')]: { [EF.leadName]: 'Olga Old', [EF.company]: 'Old Co', [EF.latestReply]: 'Ok', [EF.latestReplyAt]: ago(200), [EF.leadStatus]: 'Interested', [EF.workspace]: '11', [EF.clientHandling]: true },
      [rec('EmBea')]: { [EF.leadName]: 'Bea Bolt', [EF.company]: 'Bolt Client Co', [EF.leadEmail]: 'bea@boltclient.com', [EF.latestReply]: 'Book me in', [EF.latestReplyAt]: ago(4), [EF.leadStatus]: 'Interested', [EF.workspace]: '21', [XF.callBookedAt]: ago(3).slice(0, 10), [RA.draft]: SECRET.draft },
      // Linked to Twenty West but carrying Bolt's EmailBison workspace: nobody's (fail closed).
      [rec('EmCarl')]: { [EF.leadName]: 'Conflict Carl', [EF.company]: 'Conflict Co', [EF.latestReply]: 'Yes', [EF.latestReplyAt]: ago(2), [EF.leadStatus]: 'Interested', [EF.workspace]: '21', [RA.clients]: [A1], [XF.meetingBookedAt]: ago(2) },
    },
  };
}

function cfg(over: Partial<Config> = {}): Config {
  return { ...loadConfig({ ENGINE_SECRET: 'x'.repeat(40), DATABASE_URL: url ?? 'postgres://x', HQ_SESSION_SECRET: 's'.repeat(40), HQ_HOST: 'hq.test.local' } as NodeJS.ProcessEnv), airtableApiKey: undefined, anthropicApiKey: undefined, ...over };
}

interface Res { status: number; body: any; text: string; headers: http.IncomingHttpHeaders }
function call(method: string, p: string, opts: { body?: unknown; cookie?: string } = {}): Promise<Res> {
  return new Promise((resolve, reject) => {
    const host = `127.0.0.1:${port}`;
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
async function login(email: string, password: string) {
  const r = await call('POST', '/hq/api/auth/login', { body: { email, password } });
  const cookie = ([] as string[]).concat(r.headers['set-cookie'] ?? []).map((c) => c.split(';')[0]).find((c) => c.startsWith('__Host-hq_session=') && c.length > 20) ?? '';
  return { r, cookie };
}
let owner = '';
async function addClientLogin(email: string, clientRec: string, extra: Record<string, unknown> = {}) {
  return call('POST', '/hq/api/users', { cookie: owner, body: { name: email.split('@')[0], email, role: 'client', clientRec, password: CPW, ...extra } });
}
async function clientCookie(email: string, clientRec: string) {
  const r = await addClientLogin(email, clientRec);
  assert.equal(r.status, 200, JSON.stringify(r.body));
  const l = await login(email, CPW);
  assert.equal(l.r.status, 200);
  return l.cookie;
}

before(async () => {
  webDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hqportal-'));
  fs.writeFileSync(path.join(webDir, 'index.html'), '<!doctype html><title>Dulcy HQ</title>');
  if (skip) return;
  db = createPool(url!); await migrate(db); await migrate(db); // the schema change is idempotent
  server = createServer(db, cfg(), { at: at as any, webDir });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', () => r()));
  port = (server.address() as AddressInfo).port;
});
after(async () => { if (!skip) { server.close(); await db.end(); } fs.rmSync(webDir, { recursive: true, force: true }); });
beforeEach(async () => {
  seed(); writes = []; asked = []; _resetPortalCache(); _resetClientsCache(); _resetInboxCache();
  if (skip) return;
  await db.query('TRUNCATE hq_users, hq_sessions, hq_login_attempts, hq_user_events RESTART IDENTITY CASCADE');
  await upsertUser(db, 'alex@dulcy.io', 'owner', PW, 'Alex');
  owner = (await login('alex@dulcy.io', PW)).cookie;
});

// ---------- Pure ----------
test('the guard is an allow-list: only /hq/api/portal/<word> for a client, owners and members untouched', () => {
  assert.equal(CLIENT_API_ALLOW.length, 1);
  const client = { role: 'client' as const };
  for (const p of ['/hq/api/portal/overview', '/hq/api/portal/leads', '/hq/api/portal/meetings', '/hq/api/portal/me']) assert.equal(clientMayCall(client, p), true, p);
  for (const p of ['/hq/api/me', '/hq/api/portal', '/hq/api/portalx/leads', '/hq/api/portal/leads/x', '/hq/api/portal/../clients', '/hq/api/clients', '/hq/api/some-route-added-next-year'])
    assert.equal(clientMayCall(client, p), false, p);
  assert.equal(clientMayCall({ role: 'owner' }, '/hq/api/clients'), true);
  assert.equal(clientMayCall({ role: 'member' }, '/hq/api/today'), true);
});

test('deliverability in words, never numbers', () => {
  assert.deepEqual(healthText([]), { status: 'healthy', text: 'Healthy. Your emails are reaching inboxes.' });
  assert.deepEqual(healthText(['healthy', 'watching']), { status: 'watching', text: "Healthy. We're keeping a close eye on 1 campaign." });
  assert.deepEqual(healthText(['fixing', 'watching', 'fixing']), { status: 'fixing', text: "We're fixing deliverability on 2 campaigns." });
});

test('slice: Twenty West + (Internal) count as one client; a row pointing at two clients is nobody\'s', () => {
  seed();
  const src: PortalSource = { ws: Object.entries(tables[WORKSPACES]).map(([id, fields]) => ({ id, fields })), campaigns: Object.entries(tables[CAMPAIGNS_T]).filter(([, f]) => f[KF.status] === 'Active').map(([id, fields]) => ({ id, fields })), emails: Object.entries(tables[EMAILS]).map(([id, fields]) => ({ id, fields })), readAt: '' };
  const a = slice(src, A2)!; // from the internal record: same client
  assert.deepEqual(a.group.map((w) => w.id), [A1, A2]);
  assert.deepEqual(a.campaigns.map((c) => c.fields[KF.name]).sort(), ['TW Clinics', 'TW Dentists']);
  assert.ok(!a.emails.some((e) => e.id === rec('EmCarl')) && !slice(src, B1)!.emails.some((e) => e.id === rec('EmCarl')), 'conflict row in neither');
  assert.ok(!slice(src, B1)!.campaigns.some((c) => c.fields[KF.name] === 'Shared Mystery'));
  assert.equal(slice(src, rec('Nobody')), null);
  assert.deepEqual(buildLeads(src, A1)!.map((l) => l.name), ['Ann Prospect', 'Hank Handed'], 'booked + handed positive, newest first; not DNC, not old, not not-interested, not merely waiting');
});

// ---------- Users: client logins ----------
test('the owner adds a client login (any record of the client), it shows on Users; checks on the input', { skip }, async () => {
  const r = await addClientLogin('pat@twentywest.com', A2);
  assert.equal(r.status, 200, JSON.stringify(r.body));
  const row = (await db.query(`SELECT role, client_rec, client_name, pending, disabled FROM hq_users WHERE email='pat@twentywest.com'`)).rows[0];
  assert.deepEqual(row, { role: 'client', client_rec: A1, client_name: 'Twenty West Media', pending: false, disabled: false }, 'stored as the main record of the group');
  const users = (await call('GET', '/hq/api/users', { cookie: owner })).body;
  const u = users.users.find((x: any) => x.email === 'pat@twentywest.com');
  assert.deepEqual([u.role, u.clientName, u.status], ['client', 'Twenty West Media', 'active']);
  assert.match(users.events[0].detail, /client for Twenty West Media/);

  assert.equal((await addClientLogin('x@y.com', rec('NotAClient'))).status, 400, 'unknown client');
  assert.equal((await addClientLogin('x@y.com', 'not-a-rec')).status, 400);
  assert.equal((await addClientLogin('x@y.com', '')).status, 400);
  assert.equal((await addClientLogin('pat@twentywest.com', B1)).status, 409, 'an email with a login is never changed');
  assert.equal((await addClientLogin('g@twentywest.com', A1, { password: '', googleOnly: true })).status, 200, 'Google sign-in only works too');
  assert.equal(writes.length, 0, 'nothing written to Airtable');

  // Members cannot add one.
  await upsertUser(db, 'josh@dulcy.io', 'member', PW, 'Josh');
  const josh = (await login('josh@dulcy.io', PW)).cookie;
  assert.equal((await call('POST', '/hq/api/users', { cookie: josh, body: { name: 'Z', email: 'z@z.com', role: 'client', clientRec: A1, password: CPW } })).status, 403);
  // The database refuses a client row without a client record, and a pending client.
  await assert.rejects(db.query(`INSERT INTO hq_users (email, role) VALUES ('raw@x.com','client')`));
  await assert.rejects(db.query(`INSERT INTO hq_users (email, role, client_rec, pending) VALUES ('raw2@x.com','client',$1,true)`, [A1]));
  await assert.rejects(db.query(`INSERT INTO hq_users (email, role, client_rec) VALUES ('raw3@x.com','member',$1)`, [A1]));
});

test('sign-up can never create a client; no owner/member becomes a client; a client is never promoted', { skip }, async () => {
  const s = await call('POST', '/hq/api/auth/signup', { body: { name: 'Sneaky', email: 'sneaky@client.com', password: CPW, password2: CPW, role: 'client', clientRec: A1, client_rec: A1 } });
  assert.equal(s.status, 200);
  const row = (await db.query(`SELECT id, role, client_rec, pending FROM hq_users WHERE email='sneaky@client.com'`)).rows[0];
  assert.deepEqual([row.role, row.client_rec, row.pending], ['member', null, true], 'a sign-up is a pending member, whatever it sends');
  assert.equal((await call('POST', `/hq/api/users/${row.id}/approve`, { cookie: owner, body: { role: 'client', clientRec: A1 } })).status, 400, 'approve cannot make a client');
  assert.equal((await call('POST', `/hq/api/users/${row.id}/approve`, { cookie: owner, body: { role: 'member' } })).status, 200);
  assert.equal((await call('POST', `/hq/api/users/${row.id}/role`, { cookie: owner, body: { role: 'client', clientRec: A1 } })).status, 400, 'role change cannot make a client');
  assert.equal((await db.query(`SELECT role FROM hq_users WHERE id=$1`, [row.id])).rows[0].role, 'member');

  await addClientLogin('pat@twentywest.com', A1);
  const pat = (await db.query(`SELECT id FROM hq_users WHERE email='pat@twentywest.com'`)).rows[0].id;
  for (const role of ['member', 'owner']) assert.equal((await call('POST', `/hq/api/users/${pat}/role`, { cookie: owner, body: { role } })).status, 409, `client → ${role} refused`);
  await assert.rejects(upsertUser(db, 'pat@twentywest.com', 'owner', PW), /client portal login/, 'the hq-user command cannot promote a client');
  assert.equal((await db.query(`SELECT role FROM hq_users WHERE id=$1`, [pat])).rows[0].role, 'client');
  await assert.rejects(upsertUser(db, 'new@x.com', 'client' as any, PW), /role must be/);
});

// ---------- Isolation ----------
test('two clients cannot see each other\'s data (the client comes from the session, not the URL)', { skip }, async () => {
  const tw = await clientCookie('pat@twentywest.com', A2);
  const bolt = await clientCookie('ben@boltlegal.com', B1);

  const me = await call('GET', '/hq/api/portal/me', { cookie: tw });
  assert.deepEqual(me.body, { user: { email: 'pat@twentywest.com', name: 'pat', role: 'client' }, client: { name: 'Twenty West Media' } });

  const o = await call('GET', '/hq/api/portal/overview?client=' + B1, { cookie: tw });
  assert.equal(o.status, 200);
  assert.equal(o.body.client.name, 'Twenty West Media');
  assert.deepEqual(o.body.campaigns.map((c: any) => c.name), ['TW Dentists', 'TW Clinics'], 'both workspaces, active only, no shared/other campaigns');
  assert.deepEqual(o.body.campaigns[0], { name: 'TW Dentists', sent: 1200, replies: 40, interested: 9, booked: 3, deliverability: 'healthy' });
  assert.equal(o.body.campaigns[1].deliverability, 'fixing');
  assert.deepEqual(o.body.health, { status: 'fixing', text: "We're fixing deliverability on 1 campaign." });
  // Interested: Ann (Meeting Request), Hank, Ivy, Dan (DNC still counts, as Atlas counts); booked: Ann. Not Carl (conflict), not Bea.
  assert.deepEqual(o.body.results, { interested7: 4, interested30: 4, booked7: 1, booked30: 1 });

  const l = await call('GET', '/hq/api/portal/leads', { cookie: tw });
  assert.deepEqual(l.body.leads.map((x: any) => [x.name, x.status]), [['Ann Prospect', 'booked'], ['Hank Handed', 'sent']]);
  assert.equal(l.body.leads[0].message, 'Yes, Tuesday works.', 'the prospect\'s message without our quoted email');
  const m = await call('GET', '/hq/api/portal/meetings', { cookie: tw });
  assert.deepEqual(m.body.meetings.map((x: any) => x.name), ['Ann Prospect']);

  const ob = await call('GET', '/hq/api/portal/overview', { cookie: bolt });
  assert.equal(ob.body.client.name, 'Bolt Legal');
  assert.deepEqual(ob.body.campaigns.map((c: any) => c.name), ['Bolt Law Firms']);
  assert.equal(ob.body.health.status, 'watching');
  const lb = await call('GET', '/hq/api/portal/leads', { cookie: bolt });
  assert.deepEqual(lb.body.leads.map((x: any) => x.name), ['Bea Bolt']);

  const twText = [o.text, l.text, m.text, me.text].join('\n');
  const boltText = [ob.text, lb.text, (await call('GET', '/hq/api/portal/meetings', { cookie: bolt })).text].join('\n');
  for (const other of ['Bolt', 'bea@', B1, 'Conflict', 'Shared Mystery']) assert.ok(!twText.includes(other), `Twenty West sees nothing of Bolt: ${other}`);
  for (const other of ['Twenty West', 'TW ', 'Ann', 'Hank', 'Smile', A1, A2, 'Conflict', 'Shared Mystery']) assert.ok(!boltText.includes(other), `Bolt sees nothing of Twenty West: ${other}`);

  // Path and query tricks change nothing; writes are refused; a client whose record is gone gets nothing.
  assert.equal((await call('GET', `/hq/api/portal/overview/${B1}`, { cookie: tw })).status, 403);
  assert.equal((await call('GET', '/hq/api/portal/clients', { cookie: tw })).status, 404);
  assert.equal((await call('POST', '/hq/api/portal/leads', { cookie: tw, body: {} })).status, 405);
  delete tables[WORKSPACES][B1]; _resetPortalCache();
  const gone = await call('GET', '/hq/api/portal/overview', { cookie: bolt });
  assert.equal(gone.status, 404);
  assert.ok(!gone.text.includes('Twenty'), 'no fallback to another client');
  assert.equal(writes.length, 0, 'the portal writes nothing to Airtable');
});

test('owners and members are refused on the portal routes; a disabled client loses its session', { skip }, async () => {
  assert.equal((await call('GET', '/hq/api/portal/overview', { cookie: owner })).status, 403);
  await upsertUser(db, 'josh@dulcy.io', 'member', PW, 'Josh');
  assert.equal((await call('GET', '/hq/api/portal/leads', { cookie: (await login('josh@dulcy.io', PW)).cookie })).status, 403);
  const tw = await clientCookie('pat@twentywest.com', A1);
  assert.equal((await call('GET', '/hq/api/portal/me', { cookie: tw })).status, 200);
  const id = (await db.query(`SELECT id FROM hq_users WHERE email='pat@twentywest.com'`)).rows[0].id;
  assert.equal((await call('POST', `/hq/api/users/${id}/disable`, { cookie: owner, body: {} })).status, 200);
  assert.equal((await call('GET', '/hq/api/portal/me', { cookie: tw })).status, 401);
  assert.equal((await login('pat@twentywest.com', CPW)).r.status, 401);
  assert.equal((await call('POST', `/hq/api/users/${id}/enable`, { cookie: owner, body: {} })).status, 200);
  assert.equal((await login('pat@twentywest.com', CPW)).r.status, 200);
});

/** Every route server.ts registers: exact paths, startsWith prefixes and p.match() regexes, read from the source. */
function registeredRoutes(): string[] {
  const src = fs.readFileSync(new URL('../../src/hq/server.ts', import.meta.url), 'utf8');
  const out = new Set<string>();
  for (const m of src.matchAll(/p === '(\/hq\/api\/[^']*)'/g)) out.add(m[1]);
  for (const m of src.matchAll(/(?:p|pathname)\.startsWith\('(\/hq\/api\/[^']*)'\)/g)) out.add(`${m[1].replace(/\/$/, '')}/x`);
  for (const m of src.matchAll(/'(\/hq\/api\/auth\/[^']*)'/g)) out.add(m[1]);
  for (const m of src.matchAll(/p\.match\(\/(\^\\\/hq\\\/api.*?\$)\/\)/g)) for (const s of samples(m[1])) out.add(s);
  return [...out];
}
/** Sample paths for one route regex; each sample is checked against the regex itself. */
function samples(source: string): string[] {
  let outs = [source.replace(/^\^/, '').replace(/\$$/, '')];
  const opt = /\(\?:((?:[^()]|\([^()]*\))*)\)\?/;
  while (outs.some((o) => opt.test(o))) outs = outs.flatMap((o) => { const m = opt.exec(o); return m ? [o.replace(m[0], ''), o.replace(m[0], m[1])] : [o]; });
  const alt = /\(([A-Za-z-]+(?:\|[A-Za-z-]+)+)\)/;
  while (outs.some((o) => alt.test(o))) outs = outs.flatMap((o) => { const m = alt.exec(o); return m ? m[1].split('|').map((w) => o.replace(m[0], w)) : [o]; });
  const filled = outs.map((o) => o.replace(/\(rec\[A-Za-z0-9\]\{14\}\)/g, 'recAAAAAAAAAAAAAA').replace(/\(\\d(?:\{\d+,\d+\}|\+)\)/g, '1').replace(/\(\[A-Za-z\]\+\)/g, 'Ada').replace(/\\\//g, '/'));
  const re = new RegExp(source);
  for (const f of filled) assert.ok(re.test(f) && !/[\\()[\]{}|?*+^$]/.test(f), `no sample path for route /${source}/ (got ${f}): teach samples() this pattern`);
  return filled;
}

test('every route registered in server.ts answers 403 to a client (except the portal and the login routes)', { skip }, async () => {
  const tw = await clientCookie('pat@twentywest.com', A1);
  const routes = registeredRoutes();
  assert.ok(routes.length >= 40, `found ${routes.length} routes in server.ts: the route reader is broken`);
  for (const must of ['/hq/api/me', '/hq/api/clients', '/hq/api/decisions/recAAAAAAAAAAAAAA', '/hq/api/users/1/approve', '/hq/api/deliverability/inboxes', '/hq/api/deliverability', '/hq/api/chat'])
    assert.ok(routes.includes(must), `route reader found ${must}`);
  const isAuth = (r: string) => r.startsWith('/hq/api/auth/');
  const isPortal = (r: string) => r.startsWith('/hq/api/portal');
  let checked = 0;
  for (const r of [...routes.filter((x) => !isAuth(x) && !isPortal(x)), '/hq/api/a-route-added-later', '/hq/api/portalx/leads', '/hq/api/portal']) {
    for (const method of ['GET', 'POST']) {
      const res = await call(method, r, { cookie: tw });
      assert.equal(res.status, 403, `${method} ${r} must be 403 for a client (got ${res.status})`);
      assert.equal(res.body?.error, CLIENT_REFUSED, `${method} ${r} refused by the guard`);
      checked++;
    }
  }
  assert.ok(checked >= 80);
  // The same client still reaches its portal, and the owner still reaches HQ.
  assert.equal((await call('GET', '/hq/api/portal/overview', { cookie: tw })).status, 200);
  assert.equal((await call('GET', '/hq/api/me', { cookie: owner })).status, 200);
  assert.equal(writes.length, 0);
});

// ---------- No money, drafts or internals in any answer ----------
const FORBIDDEN_KEY = /fee|ltv|revenue|receivabl|invoice|mrr|money|draft|reason|policy|note|history|thread|intent|agent|decision|airtable|bounce|flag|internal|echo|state|record|rec$|ws|workspace|bison|kpi|url|link|id$/i;
function keysOf(x: unknown, out: string[] = []): string[] {
  if (Array.isArray(x)) x.forEach((y) => keysOf(y, out));
  else if (x && typeof x === 'object') for (const [k, v] of Object.entries(x)) { out.push(k); keysOf(v, out); }
  return out;
}

test('portal answers carry no money, draft or internal fields (JSON keys and values); Airtable is asked for none', { skip }, async () => {
  const tw = await clientCookie('pat@twentywest.com', A1);
  const bodies: Res[] = [];
  for (const s of ['me', 'overview', 'leads', 'meetings']) { const r = await call('GET', `/hq/api/portal/${s}`, { cookie: tw }); assert.equal(r.status, 200); bodies.push(r); }
  const keys = [...new Set(bodies.flatMap((b) => keysOf(b.body)))];
  for (const k of keys) assert.ok(!FORBIDDEN_KEY.test(k), `portal key "${k}" looks internal`);
  assert.deepEqual(keys.sort(), ['booked', 'booked30', 'booked7', 'bookedOn', 'campaigns', 'client', 'company', 'date', 'days', 'deliverability', 'email', 'health', 'interested', 'interested30', 'interested7', 'key', 'leads', 'meetings', 'message', 'name', 'readAt', 'replies', 'results', 'role', 'sent', 'status', 'text', 'user'].sort(), 'exactly the allowed keys');
  const all = bodies.map((b) => b.text).join('\n');
  for (const v of [SECRET.draft, SECRET.reason, SECRET.note, 'Full thread', 'airtable.com', '4517', '9133', '54011', '4.6', 'Needs Approval', 'Echo', 'Atlas', 'Ivy Interested', A1, A2])
    assert.ok(!all.includes(v), `portal answer contains "${v}"`);

  // The Airtable reads themselves ask for no money, draft or note field.
  const fields = asked.flatMap((a) => a.fields);
  assert.ok(fields.length > 10);
  for (const f of ['Monthly Fee', 'Outstanding Receivables', 'Estimated LTV', 'Actual Lifetime Revenue', RA.draft, RA.policy, RA.seanReason, RA.seanInput, RA.customReply, EF.history, KF.workflowError, KF.bisonUrl])
    assert.ok(!fields.includes(f), `portal reads ${f}`);
  // One cached read per table for everyone: a second client within 60 seconds causes no new reads.
  const n = asked.length;
  const bolt = await clientCookie('ben@boltlegal.com', B1);
  await call('GET', '/hq/api/portal/overview', { cookie: bolt });
  await call('GET', '/hq/api/portal/leads', { cookie: bolt });
  assert.equal(asked.length, n, 'served from the 60-second cache');
});

// HQ phone notifications (Web Push), 2026-11-27: subscription CRUD, role filtering (a member never
// gets money or owner-only items), dedupe and grouping, the per-minute and daily limits, dead
// device cleanup, the payload and its link, the watch loop's detectors and the chat answer push.
// Never sends a real push: the sender is a fake (the one web-push test builds a request, no network).
import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createECDH, randomBytes } from 'node:crypto';
import type { AddressInfo } from 'node:net';
import webpush from 'web-push';
import { createPool, migrate, type Db } from '../src/db/pool.js';
import { loadConfig, type Config } from '../src/config.js';
import { createServer } from '../src/http.js';
import { upsertUser } from '../src/hq/auth.js';
import { addAsk } from '../src/hq/asks.js';
import { saveReport } from '../src/hq/reports.js';
import type { ChatModel } from '../src/hq/chat.js';
import { DECISIONS, DF } from '../src/decisions/fields.js';
import { CAMPAIGNS_T, KF } from '../src/hq/campaigns.js';
import { EMAILS, EF, BK } from '../src/agents/emailsFields.js';
import {
  PUSH_LIMITS, buildPayload, deviceLabel, flushPush, mayReceive, notify, pushIdle, pushKeys, pushText, pushUrl, saveSubscription, setPresence, validSubscription,
  _resetPushKeys, type PushSender,
} from '../src/hq/push.js';
import { askEvent, decisionEvent, firstSeen, pushTick, type DealFacts, type InboxHealth } from '../src/hq/pushWatch.js';

const url = process.env.TEST_DATABASE_URL;
const skip = !url ? 'TEST_DATABASE_URL not set' : false;
const PW = 'correct horse battery staple';
const OWNER = 'owner@example.com', MEMBER = 'member@example.com';
let db: Db;
let server: http.Server;
let port = 0;
let webDir: string;

// ---------- fakes ----------
let tables: Record<string, Record<string, Record<string, unknown>>>;
let reads: string[];
const at = {
  async list(table: string) { reads.push(table); return Object.entries(tables[table] ?? {}).map(([id, fields]) => ({ id, fields: { ...fields }, createdTime: String(fields._created ?? '2026-11-27T10:00:00.000Z') })); },
  async get(table: string, id: string) { const f = tables[table]?.[id]; return f ? { id, fields: { ...f } } : null; },
  async create() { throw new Error('no writes in push tests'); },
  async update() { throw new Error('no writes in push tests'); },
};
let sent: { endpoint: string; payload: any; urgency: string; subject: string }[];
let answer: Record<string, number>;
const sender: PushSender = async (target, payload, o) => {
  sent.push({ endpoint: target.endpoint, payload: JSON.parse(payload), urgency: o.urgency, subject: o.vapid.subject });
  return { statusCode: answer[target.endpoint] ?? 201 };
};
const model: ChatModel = async () => ({ content: [{ type: 'text', text: 'Two campaigns are past 60%. Sources: Airtable Campaigns' }], stop_reason: 'end_turn' });

function cfg(over: Partial<Config> = {}): Config {
  return { ...loadConfig({ ENGINE_SECRET: 'x'.repeat(40), DATABASE_URL: url ?? 'postgres://x', HQ_SESSION_SECRET: 's'.repeat(40), HQ_HOST: 'hq.test.local' } as NodeJS.ProcessEnv), airtableApiKey: undefined, anthropicApiKey: undefined, ...over };
}
function call(method: string, p: string, opts: { body?: unknown; cookie?: string; ua?: string } = {}): Promise<{ status: number; body: any; headers: http.IncomingHttpHeaders }> {
  return new Promise((resolve, reject) => {
    const host = `127.0.0.1:${port}`;
    const data = opts.body === undefined ? undefined : JSON.stringify(opts.body);
    const headers: Record<string, string> = { host };
    // content-length: Node does not frame a DELETE body by itself (browsers always send the length).
    if (data !== undefined) { headers['content-type'] = 'application/json'; headers.origin = `https://${host}`; headers['content-length'] = String(Buffer.byteLength(data)); }
    if (opts.cookie) headers.cookie = opts.cookie;
    if (opts.ua) headers['user-agent'] = opts.ua;
    const req = http.request({ host: '127.0.0.1', port, method, path: p, headers }, (res) => {
      const chunks: Buffer[] = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => { let body: any = null; try { body = JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { /* not json */ } resolve({ status: res.statusCode ?? 0, body, headers: res.headers }); });
    });
    req.on('error', reject);
    if (data !== undefined) req.write(data);
    req.end();
  });
}
async function login(email: string) {
  const r = await call('POST', '/hq/api/auth/login', { body: { email, password: PW } });
  return ([] as string[]).concat(r.headers['set-cookie'] ?? []).map((c) => c.split(';')[0]).find((c) => c.startsWith('__Host-hq_session=')) ?? '';
}
/** A browser-like subscription: a real P-256 point and a 16-byte secret. */
function browserSub(endpoint: string) {
  const ecdh = createECDH('prime256v1'); ecdh.generateKeys();
  return { endpoint, keys: { p256dh: ecdh.getPublicKey().toString('base64url'), auth: randomBytes(16).toString('base64url') } };
}
const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_2 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.2 Mobile/15E148 Safari/604.1';
const APPLE = 'https://web.push.apple.com/QGx2aWQ';
const FCM = 'https://fcm.googleapis.com/fcm/send/member-device';
let owner: { id: number }, member: { id: number };
const T0 = new Date('2026-11-27T15:00:00.000Z');
const plus = (ms: number) => new Date(T0.getTime() + ms);

before(async () => {
  webDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hqpush-'));
  fs.writeFileSync(path.join(webDir, 'index.html'), '<!doctype html><title>Dulcy HQ</title>');
  fs.writeFileSync(path.join(webDir, 'sw.js'), 'self.addEventListener("push", () => {});');
  fs.writeFileSync(path.join(webDir, 'manifest.webmanifest'), '{"name":"Dulcy HQ"}');
  if (skip) return;
  db = createPool(url!); await migrate(db);
  server = createServer(db, cfg(), { at: at as any, chatModel: model, webDir, pushSender: sender });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', () => r()));
  port = (server.address() as AddressInfo).port;
});
after(async () => {
  if (!skip) { await pushIdle(); await db.query('DELETE FROM hq_push_subscriptions'); server.close(); await db.end(); }
  fs.rmSync(webDir, { recursive: true, force: true });
});
beforeEach(async () => {
  tables = {}; reads = []; sent = []; answer = {};
  if (skip) return;
  await db.query('TRUNCATE hq_users, hq_sessions, hq_login_attempts, hq_chat_threads, hq_chat_messages, hq_agent_tasks, hq_asks, hq_reports, jobs, steps, receipts, events, hq_push_watch, hq_push_seen RESTART IDENTITY CASCADE');
  await upsertUser(db, OWNER, 'owner', PW, 'Owner');
  await upsertUser(db, MEMBER, 'member', PW, 'Member');
  owner = { id: Number((await db.query(`SELECT id FROM hq_users WHERE email=$1`, [OWNER])).rows[0].id) };
  member = { id: Number((await db.query(`SELECT id FROM hq_users WHERE email=$1`, [MEMBER])).rows[0].id) };
});
const bothDevices = async () => { await saveSubscription(db, owner, browserSub(APPLE), IPHONE); await saveSubscription(db, member, browserSub(FCM), 'Mozilla/5.0 (Windows NT 10.0) Chrome/131.0 Safari/537.36'); };
const logRows = async (userId: number) => (await db.query(`SELECT type, dedupe_key, status, url FROM hq_push_log WHERE user_id=$1 ORDER BY id`, [userId])).rows;

// ---------- pure ----------
test('mayReceive: owners get owner/team items, members only team or their own, never money, Ledger or Sienna', () => {
  const o = { id: 1, role: 'owner' }, m = { id: 2, role: 'member' }, c = { id: 3, role: 'client' };
  assert.equal(mayReceive(o, { audience: 'owner' }), true);
  assert.equal(mayReceive(o, { audience: 'team' }), true);
  assert.equal(mayReceive(m, { audience: 'owner' }), false);
  assert.equal(mayReceive(m, { audience: 'team' }), true);
  assert.equal(mayReceive(m, { audience: 'team', money: true }), false);
  assert.equal(mayReceive(m, { audience: 'team', agent: 'Ledger' }), false);
  assert.equal(mayReceive(m, { audience: 'team', agent: 'Sienna' }), false);
  assert.equal(mayReceive(m, { audience: { userId: 2 } }), true);
  assert.equal(mayReceive(m, { audience: { userId: 2 }, agent: 'Ledger' }), false);
  assert.equal(mayReceive(o, { audience: { userId: 2 } }), false, 'someone else\'s chat answer is not pushed to the owner');
  assert.equal(mayReceive(c, { audience: 'team' }), false, 'client logins never get pushes');
  assert.equal(mayReceive(m, { audience: 'everyone' as any }), false, 'an unknown audience fails closed');
});

test('pushUrl keeps HQ routes only; buildPayload groups several rows into one', () => {
  assert.equal(pushUrl('decisions/recABCDEFGHIJKLMN'), '#/decisions/recABCDEFGHIJKLMN');
  assert.equal(pushUrl('#/chat/Ada/12'), '#/chat/Ada/12');
  assert.equal(pushUrl('https://airtable.com/x'), '#/today');
  assert.equal(pushUrl('javascript:alert(1)'), '#/today');
  assert.equal(pushText('a\u0000b\n\n c', 50), 'a b c');
  const one = buildPayload([{ type: 'decision', title: 'Echo: Reply to Sam', body: 'Acme', url: 'decisions/recABCDEFGHIJKLMN', dedupeKey: 'decision:recABCDEFGHIJKLMN' }], 1);
  assert.deepEqual([one.title, one.body, one.url, one.count, one.type], ['Echo: Reply to Sam', 'Acme', '#/decisions/recABCDEFGHIJKLMN', 1, 'decision']);
  const rows = ['A', 'B', 'C', 'D'].map((x) => ({ type: 'decision', title: `Card ${x}`, body: '', url: `decisions/rec${x.repeat(14)}`, dedupeKey: `decision:${x}` }));
  const four = buildPayload(rows);
  assert.equal(four.title, '4 new decisions');
  assert.equal(four.url, '#/decisions');
  assert.match(four.body, /Card A · Card B · Card C \+1 more/);
  const mixed = buildPayload([{ type: 'good', title: 'Meeting booked', body: '', url: 'thread/recAAAAAAAAAAAAAA', dedupeKey: 'b' }, { type: 'urgent', title: 'Bounce 5%', body: '', url: 'campaigns/recBBBBBBBBBBBBBB', dedupeKey: 'u' }]);
  assert.equal(mixed.title, '2 new in HQ');
  assert.match(mixed.body, /^Bounce 5% · Meeting booked/, 'urgent first');
  assert.equal(deviceLabel(IPHONE), 'iPhone');
  assert.equal(deviceLabel('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Safari/537.36'), 'Mac · Chrome');
});

test('validSubscription: only browser push services, real key sizes', () => {
  assert.equal(typeof validSubscription(browserSub(APPLE)), 'object');
  assert.equal(typeof validSubscription(browserSub(FCM)), 'object');
  assert.equal(typeof validSubscription(browserSub('https://evil.example.com/push')), 'string', 'the server never posts to an address it does not know');
  assert.equal(typeof validSubscription(browserSub('http://fcm.googleapis.com/x')), 'string');
  assert.equal(typeof validSubscription(browserSub('https://fcm.googleapis.com.evil.io/x')), 'string');
  assert.equal(typeof validSubscription({ endpoint: FCM, keys: { p256dh: 'abc', auth: 'def' } }), 'string');
});

test('decisionEvent: reply cards reach members; money, content and other piles are owner-only', () => {
  const base = { id: 'recABCDEFGHIJKLMN', title: 'Reply to Sam', client: 'Acme', issue: 'They asked for a time. More text.' };
  const reply = decisionEvent({ ...base, agent: 'Echo', pile: 'Replies' });
  assert.equal(reply.audience, 'team');
  assert.equal(reply.url, 'decisions/recABCDEFGHIJKLMN');
  assert.equal(reply.body, 'Acme · They asked for a time.');
  assert.equal(decisionEvent({ ...base, agent: 'Riley', pile: 'Fixes' }).audience, 'owner');
  const money = decisionEvent({ ...base, agent: 'Ledger', pile: 'Money' });
  assert.equal(money.audience, 'owner'); assert.equal(money.money, true);
  assert.equal(mayReceive({ id: 2, role: 'member' }, decisionEvent({ ...base, agent: 'Sienna', pile: 'Content' })), false);
  assert.equal(askEvent({ id: 1, agent: 'Atlas', title: 'Reply to Sam', why: '', action_url: 'inbox', audience: 'everyone', money: false, priority: 'normal' }).audience, 'team');
  assert.equal(askEvent({ id: 2, agent: 'Ledger', title: 'Pay the invoice', why: '', action_url: '', audience: 'everyone', money: false, priority: 'normal' }).audience, 'owner');
});

// ---------- keys and the API ----------
test('VAPID keys are made once and kept in Postgres; only the public key is served', { skip }, async () => {
  await db.query('DELETE FROM hq_push_keys'); _resetPushKeys();
  const cookie = await login(OWNER);
  assert.equal((await call('GET', '/hq/api/push/key')).status, 401, 'needs a session');
  const r = await call('GET', '/hq/api/push/key', { cookie });
  assert.equal(r.status, 200);
  assert.equal(Buffer.from(r.body.publicKey, 'base64url').length, 65);
  assert.equal(Object.keys(r.body).join(), 'publicKey', 'the private key is never served');
  const row = (await db.query('SELECT public_key FROM hq_push_keys WHERE id=1')).rows[0];
  assert.equal(row.public_key, r.body.publicKey);
  _resetPushKeys();
  assert.equal((await call('GET', '/hq/api/push/key', { cookie })).body.publicKey, r.body.publicKey, 'the same pair after a restart');
  // VAPID_* env wins when it is a valid pair; the subject is the HQ address unless VAPID_SUBJECT is set.
  _resetPushKeys();
  const k = webpush.generateVAPIDKeys();
  const env = await pushKeys(db, cfg({ vapidPublicKey: k.publicKey, vapidPrivateKey: k.privateKey }));
  assert.equal(env.source, 'env'); assert.equal(env.publicKey, k.publicKey); assert.equal(env.subject, 'https://hq.test.local');
  _resetPushKeys();
  assert.equal((await pushKeys(db, cfg({ vapidPublicKey: 'bad', vapidPrivateKey: 'bad' }))).source, 'db');
  _resetPushKeys();
  assert.equal((await pushKeys(db, cfg({ vapidSubject: 'mailto:ops@example.com' }))).subject, 'mailto:ops@example.com');
  _resetPushKeys();
});

test('subscribe, settings, devices, unsubscribe and the test push (per person)', { skip }, async () => {
  const cookie = await login(OWNER);
  const mem = await login(MEMBER);
  const sub = browserSub(APPLE);
  assert.equal((await call('POST', '/hq/api/push/subscribe', { cookie, body: browserSub('https://evil.example.com/x') })).status, 400);
  const s1 = await call('POST', '/hq/api/push/subscribe', { cookie, body: { subscription: sub }, ua: IPHONE });
  assert.equal(s1.status, 200); assert.equal(s1.body.created, true);
  const s2 = await call('POST', '/hq/api/push/subscribe', { cookie, body: sub, ua: IPHONE });
  assert.equal(s2.body.id, s1.body.id, 'the same device again is the same row'); assert.equal(s2.body.created, false);
  const g = await call('GET', '/hq/api/push/settings', { cookie });
  assert.deepEqual(g.body.settings, { decision: true, agent: true, urgent: true, good: true }, 'all four on by default');
  assert.equal(g.body.devices.length, 1); assert.equal(g.body.devices[0].label, 'iPhone');
  assert.equal(JSON.stringify(g.body).includes(sub.keys.auth), false, 'device secrets are never sent back');
  const put = await call('PUT', '/hq/api/push/settings', { cookie, body: { good: false } });
  assert.equal(put.status, 200); assert.equal(put.body.settings.good, false); assert.equal(put.body.settings.decision, true);
  assert.equal((await call('PUT', '/hq/api/push/settings', { cookie, body: { good: 'no' } })).status, 400);
  // The member sees only their own devices and settings.
  assert.equal((await call('GET', '/hq/api/push/settings', { cookie: mem })).body.devices.length, 0);
  assert.equal((await call('POST', '/hq/api/push/test', { cookie: mem, body: {} })).status, 400, 'no device yet');
  // Test push: goes now to this person's devices only.
  const t = await call('POST', '/hq/api/push/test', { cookie, body: {} });
  assert.equal(t.status, 200); assert.equal(t.body.sent, 1);
  assert.equal(sent.length, 1); assert.equal(sent[0].endpoint, APPLE);
  assert.equal(sent[0].payload.title, 'Dulcy HQ test'); assert.equal(sent[0].payload.url, '#/notifications');
  assert.equal(sent[0].subject, 'https://hq.test.local');
  assert.equal((await call('POST', '/hq/api/push/test', { cookie, body: {} })).status, 429, 'one test per 10 seconds');
  // The member cannot remove the owner's device; the owner can.
  assert.equal((await call('DELETE', `/hq/api/push/devices/${s1.body.id}`, { cookie: mem, body: {} })).status, 404);
  assert.equal((await call('DELETE', '/hq/api/push/subscribe', { cookie, body: { endpoint: APPLE } })).body.ok, true);
  assert.equal((await call('GET', '/hq/api/push/settings', { cookie })).body.devices.length, 0);
  // Writes need a same-origin JSON request like every HQ write (no Origin = refused).
  assert.equal((await call('POST', '/hq/api/push/presence', { cookie })).status, 403);
});

test('the service worker and manifest are always revalidated; the worker may control the whole site', { skip }, async () => {
  const sw = await call('GET', '/hq/sw.js');
  assert.equal(sw.status, 200); assert.equal(sw.headers['cache-control'], 'no-cache'); assert.equal(sw.headers['service-worker-allowed'], '/');
  const mf = await call('GET', '/hq/manifest.webmanifest');
  assert.equal(mf.headers['cache-control'], 'no-cache'); assert.match(String(mf.headers['content-type']), /manifest\+json/);
});

// ---------- notify, role filtering, dedupe ----------
test('notify: member gets only team items; money, Ledger and owner items never; the same key once; switched-off kinds skipped', { skip }, async () => {
  await bothDevices();
  const reply = decisionEvent({ id: 'recREPLYAAAAAAAAA', title: 'Reply to Sam', agent: 'Echo', client: 'Acme', pile: 'Replies', issue: '' });
  assert.equal(await notify(db, reply, T0), 2);
  assert.equal(await notify(db, reply, T0), 0, 'the same event is never queued twice');
  assert.equal(await notify(db, decisionEvent({ id: 'recMONEYAAAAAAAAA', title: 'Buy domains', agent: 'Ledger', client: '', pile: 'Money', issue: '' }), T0), 1);
  assert.equal(await notify(db, { type: 'good', audience: 'team', agent: 'Sienna', title: 'Script ready', url: 'content', dedupeKey: 'sienna:1' }, T0), 1, 'Sienna is owner-only even for team');
  assert.equal(await notify(db, { type: 'good', audience: 'team', money: true, title: 'Client paid', url: 'sales', dedupeKey: 'paid:1' }, T0), 1);
  assert.equal(await notify(db, { type: 'urgent', audience: 'owner', title: 'Inbox in spam', url: 'deliverability', dedupeKey: 'spam:1' }, T0), 1);
  const mem = await logRows(member.id);
  assert.deepEqual(mem.map((r) => r.dedupe_key), ['decision:recREPLYAAAAAAAAA'], 'member: only the reply decision');
  assert.equal((await logRows(owner.id)).length, 5);
  // A kind switched off: nothing queued for that person.
  await db.query(`UPDATE hq_push_settings SET on_urgent=false WHERE user_id=$1`, [owner.id]);
  assert.equal(await notify(db, { type: 'urgent', audience: 'owner', title: 'Bounce 5%', url: 'campaigns', dedupeKey: 'bounce:2' }, T0), 0);
  // Nobody without a device gets rows (nothing piles up for later).
  await db.query(`DELETE FROM hq_push_subscriptions WHERE user_id=$1`, [member.id]);
  assert.equal(await notify(db, decisionEvent({ id: 'recREPLYBBBBBBBBB', title: 'Reply to Lee', agent: 'Echo', client: '', pile: 'Replies', issue: '' }), T0), 1);
});

// ---------- flush: grouping, per-minute and daily limits, dead devices ----------
test('flush: decisions within 3 minutes go out as one; one push per minute; the payload opens the item', { skip }, async () => {
  await bothDevices();
  const card = (x: string) => decisionEvent({ id: `rec${x.repeat(14)}`, title: `Card ${x}`, agent: 'Atlas', client: '', pile: 'Campaigns', issue: '' });
  await notify(db, card('A'), T0);
  let f = await flushPush(db, cfg(), sender, T0);
  assert.equal(f.pushes, 1); assert.equal(sent.length, 1);
  assert.equal(sent[0].payload.title, 'Atlas: Card A'); assert.equal(sent[0].payload.url, '#/decisions/recAAAAAAAAAAAAAA');
  // Three more within 3 minutes: held, then ONE push "3 new decisions".
  for (const x of ['B', 'C', 'D']) await notify(db, card(x), plus(20_000));
  f = await flushPush(db, cfg(), sender, plus(70_000));
  assert.equal(f.pushes, 0, 'held: within 3 minutes of the last decision push');
  f = await flushPush(db, cfg(), sender, plus(181_000));
  assert.equal(f.pushes, 1); assert.equal(sent.length, 2);
  assert.equal(sent[1].payload.title, '3 new decisions'); assert.equal(sent[1].payload.url, '#/decisions');
  // Not a decision: waits for the minute, not the 3 minutes.
  await notify(db, { type: 'urgent', audience: 'owner', agent: 'Atlas', title: 'Bounce 5.2%: Acme Manufacturing', url: 'campaigns/recCCCCCCCCCCCCCC', dedupeKey: 'bounce:x' }, plus(190_000));
  assert.equal((await flushPush(db, cfg(), sender, plus(200_000))).pushes, 0, 'at most one push a minute');
  assert.equal((await flushPush(db, cfg(), sender, plus(242_000))).pushes, 1);
  assert.equal(sent[2].payload.url, '#/campaigns/recCCCCCCCCCCCCCC'); assert.equal(sent[2].urgency, 'high');
  assert.equal((await logRows(member.id)).length, 0, 'campaign decisions are owner-only');
  // Two flushes at the same moment never push the same rows twice.
  await notify(db, { type: 'good', audience: 'team', agent: 'Echo', title: 'Meeting booked', url: 'thread/recDDDDDDDDDDDDDD', dedupeKey: 'booked:d' }, plus(400_000));
  const both = await Promise.all([flushPush(db, cfg(), sender, plus(400_000)), flushPush(db, cfg(), sender, plus(400_000))]);
  assert.equal(both[0].pushes + both[1].pushes, 2, 'one push each for the owner and the member, not four');
  assert.equal(sent.filter((x) => x.payload.title === 'Meeting booked').length, 2);
});

test('flush: the daily cap, old rows dropped, dead devices removed', { skip }, async () => {
  await bothDevices();
  await db.query(`UPDATE hq_push_settings SET day='2026-11-27', day_count=$2 WHERE user_id=$1`, [owner.id, PUSH_LIMITS.dailyCap]);
  await notify(db, { type: 'urgent', audience: 'owner', title: 'One too many', url: 'today', dedupeKey: 'cap:1' }, T0);
  const f = await flushPush(db, cfg(), sender, T0);
  assert.equal(f.capped, 1); assert.equal(sent.length, 0);
  assert.equal((await logRows(owner.id))[0].status, 'capped');
  // Waiting more than 30 minutes = old news: dropped.
  await notify(db, { type: 'agent', audience: 'team', title: 'Old', url: 'needs', dedupeKey: 'old:1' }, T0);
  assert.equal((await flushPush(db, cfg(), sender, plus(31 * 60_000))).expired, 2);
  // The push service says the device is gone (410): removed. A 500: counted; 10 in a row: removed.
  answer[FCM] = 410;
  await notify(db, { type: 'agent', audience: 'team', title: 'Hi', url: 'needs', dedupeKey: 'gone:1' }, plus(40 * 60_000));
  const g = await flushPush(db, cfg(), sender, plus(40 * 60_000));
  assert.equal(g.devices.removed, 1);
  assert.equal((await db.query(`SELECT count(*)::int AS n FROM hq_push_subscriptions WHERE user_id=$1`, [member.id])).rows[0].n, 0);
  await db.query(`UPDATE hq_push_settings SET day_count=0 WHERE user_id=$1`, [owner.id]);
  answer[APPLE] = 500;
  await db.query(`UPDATE hq_push_subscriptions SET failures=$2 WHERE user_id=$1`, [owner.id, PUSH_LIMITS.maxFailures - 2]);
  await notify(db, { type: 'agent', audience: 'owner', title: 'Try 1', url: 'needs', dedupeKey: 'try:1' }, plus(50 * 60_000));
  assert.equal((await flushPush(db, cfg(), sender, plus(50 * 60_000))).devices.failed, 1);
  await notify(db, { type: 'agent', audience: 'owner', title: 'Try 2', url: 'needs', dedupeKey: 'try:2' }, plus(52 * 60_000));
  assert.equal((await flushPush(db, cfg(), sender, plus(52 * 60_000))).devices.removed, 1);
});

test('the real sender path builds a VAPID-signed, encrypted request (no network)', { skip }, async () => {
  const keys = await pushKeys(db, cfg());
  const sub = browserSub(APPLE);
  const req = webpush.generateRequestDetails(sub, JSON.stringify(buildPayload([{ type: 'decision', title: 'Echo: Reply to Sam', body: '', url: 'decisions/recABCDEFGHIJKLMN', dedupeKey: 'd' }])), {
    vapidDetails: { subject: keys.subject, publicKey: keys.publicKey, privateKey: keys.privateKey }, TTL: PUSH_LIMITS.ttlSec,
  });
  assert.equal(req.endpoint, APPLE);
  assert.match(String(req.headers.Authorization), /^vapid t=.+, k=/);
  assert.equal(req.headers['Content-Encoding'], 'aes128gcm');
  assert.ok(Buffer.isBuffer(req.body) && req.body.length > 100);
});

// ---------- the watch loop ----------
test('watch loop: nothing read without a device; the first run records, later runs push only what is new', { skip }, async () => {
  const c = cfg();
  tables[DECISIONS] = { recOLDDECISIONAAA: { [DF.title]: 'Old card', [DF.agent]: 'Echo', [DF.status]: 'New' } };
  let r = await pushTick(db, c, { at: at as any, sender, inboxes: async () => new Map(), deals: async () => [] }, T0);
  assert.equal(r.skipped, 'no device has notifications on'); assert.equal(reads.length, 0);
  await bothDevices();
  r = await pushTick(db, c, { at: at as any, sender, inboxes: async () => new Map(), deals: async () => [] }, T0);
  assert.ok(r.ran.includes('decisions')); assert.equal(r.queued, 0, 'what was already there is not pushed'); assert.equal(sent.length, 0);
  // New things arrive.
  tables[DECISIONS].recNEWREPLYAAAAAA = { [DF.title]: 'Reply to Sam', [DF.agent]: 'Echo', [DF.status]: 'New', [DF.client]: 'Acme' };
  tables[DECISIONS].recNEWMONEYAAAAAA = { [DF.title]: 'Buy 2 domains', [DF.agent]: 'Ledger', [DF.status]: 'New' };
  r = await pushTick(db, c, { at: at as any, sender }, plus(121_000));
  assert.equal(r.queued, 3, 'reply → owner and member; money → owner');
  const mem = sent.filter((x) => x.endpoint === FCM), own = sent.filter((x) => x.endpoint === APPLE);
  assert.equal(mem.length, 1); assert.equal(mem[0].payload.title, 'Echo: Reply to Sam'); assert.equal(mem[0].payload.url, '#/decisions/recNEWREPLYAAAAAA');
  assert.equal(own.length, 1); assert.equal(own[0].payload.title, '2 new decisions');
  // The same cards next time: nothing new.
  sent = [];
  r = await pushTick(db, c, { at: at as any, sender }, plus(242_000));
  assert.equal(r.queued, 0); assert.equal(sent.length, 0);
});

test('watch loop detectors: asks, waiting tasks, urgent reports, failed runs, bookings, bounce, inboxes, sales', { skip }, async () => {
  const c = cfg();
  await bothDevices();
  let inboxes = new Map<string, InboxHealth>([['recINBOXOKAAAAAAA', { status: 'healthy', warmupOff: false, email: 'ok@acme.example' }]]);
  let deals: DealFacts[] = [];
  const deps = () => ({ at: at as any, sender, inboxes: async () => inboxes, deals: async () => deals });
  tables[CAMPAIGNS_T] = { recCAMPOLDAAAAAAAA: { [KF.name]: 'Old', [KF.status]: 'Active', [KF.bouncedPct]: 6 } };
  await pushTick(db, c, deps(), T0); // first run: records only
  assert.equal(sent.length, 0);

  // Postgres: an ask for everyone, a Ledger ask, a task waiting on the owner, an urgent report, a failed run, a booking.
  await addAsk(db, { agent: 'Atlas', title: 'Reply to Sam about Acme', audience: 'everyone', actionUrl: 'inbox' });
  await addAsk(db, { agent: 'Ledger', title: 'Approve the tool spend', audience: 'everyone' });
  await db.query(`INSERT INTO hq_agent_tasks (agent, title, status, source_key, progress_note, link) VALUES ('Scribe','Copy notes for Acme','waiting_alex','copy:1','Needs your notes','campaigns')`);
  await saveReport(db, { agent: 'Atlas', kind: 'bounce_check', title: 'Bounce check: 1 paused', body: 'x', urgent: true, dedupeKey: 'b1' });
  await saveReport(db, { agent: 'Atlas', kind: 'bounce_check', title: 'Would pause (dry run)', body: 'x', urgent: true, dryRun: true, dedupeKey: 'b2' });
  await db.query(`INSERT INTO jobs (kind, record_id, status, error, dry_run, updated_at) VALUES ('riley.apply','r1','failed','n8n answered 500. Retry later.',false,$1), ('riley.apply','r2','failed','again',false,$1)`, [T0]);
  await db.query(`INSERT INTO jobs (kind, record_id, status, result, dry_run, updated_at) VALUES ('calendar.book','recBOOKEDAAAAAAAA','succeeded',$2,false,$1)`, [T0, JSON.stringify({ booked: true, message: 'Booked Tue 3 pm on the client\'s calendar' })]);
  await pushTick(db, c, deps(), plus(61_000));
  const ownerKeys = (await logRows(owner.id)).map((r) => r.dedupe_key).sort();
  assert.deepEqual(ownerKeys, ['ask:1', 'ask:2', 'booked:recBOOKEDAAAAAAAA', 'job:riley.apply:2026-11-27', 'report:1', 'task:1']);
  const memKeys = (await logRows(member.id)).map((r) => r.dedupe_key).sort();
  assert.deepEqual(memKeys, ['ask:1', 'booked:recBOOKEDAAAAAAAA'], 'member: their ask and the booked meeting; never Ledger, tasks, reports or failed runs');
  const ownPush = sent.filter((x) => x.endpoint === APPLE).map((x) => x.payload);
  assert.equal(ownPush[0].title, '6 new in HQ', 'everything waiting goes out as one push');
  assert.match(ownPush[0].body, /^Atlas: Bounce check: 1 paused · Riley: riley\.apply failed \(2 runs\)/, 'urgent first');

  // Airtable: a campaign over 4%, a meeting booked elsewhere, an inbox in spam + one with warm-up off, a client signed and paid.
  tables[CAMPAIGNS_T].recCAMPNEWAAAAAAA = { [KF.name]: 'Acme Manufacturing', [KF.status]: 'Active', [KF.bouncedPct]: 5.2 };
  tables[CAMPAIGNS_T].recCAMPLOWAAAAAAA = { [KF.name]: 'Low', [KF.status]: 'Active', [KF.bouncedPct]: 2 };
  tables[EMAILS] = { recGHLBOOKAAAAAAA: { [BK.opportunity]: 'WON', [EF.leadName]: 'Lee Park', [EF.company]: 'Beta Co' } };
  inboxes = new Map([...inboxes, ['recINBOXSPAMAAAAA', { status: 'spam', warmupOff: false, email: 'a@acme.example' }], ['recINBOXOFFAAAAAA', { status: 'risk', warmupOff: true, email: 'b@acme.example' }]]);
  deals = [{ id: 'recDEALAAAAAAAAAA', name: 'Pat Doe', company: 'Gamma Inc', stages: { signed: true, paid: true }, signedDay: '2026-11-26', paidDay: '2026-11-27', paidVia: 'Xero' },
    { id: 'recDEALOLDAAAAAAA', name: 'Old', company: 'Old Co', stages: { signed: true, paid: false }, signedDay: '2026-10-01', paidDay: '' }];
  // These detectors had their first run at T0 (they recorded what was there then).
  await pushTick(db, c, deps(), plus(16 * 60_000));
  const keys = (await logRows(owner.id)).map((r) => r.dedupe_key);
  assert.ok(keys.includes('bounce:recCAMPNEWAAAAAAA'), 'the new campaign over 4%, not the old one or the one at 2%');
  assert.ok(!keys.some((k) => k.includes('recCAMPLOWAAAAAAA') || k.includes('recCAMPOLDAAAAAAA')));
  assert.ok(keys.includes('booked:recGHLBOOKAAAAAAA'));
  assert.ok(keys.includes('spam:recINBOXSPAMAAAAA')); assert.ok(keys.includes('warmup:recINBOXOFFAAAAAA'));
  assert.ok(keys.includes('signed:recDEALAAAAAAAAAA')); assert.ok(keys.includes('paid:recDEALAAAAAAAAAA'));
  assert.ok(!keys.includes('signed:recDEALOLDAAAAAAA'), 'an old signing is not news');
  const memNow = (await logRows(member.id)).map((r) => r.dedupe_key);
  assert.ok(memNow.includes('booked:recGHLBOOKAAAAAAA'));
  assert.ok(!memNow.some((k) => /^(signed|paid|spam|warmup|bounce):/.test(k)), 'the member never gets money or owner-only problems');
  const rows = (await db.query(`SELECT dedupe_key, url FROM hq_push_log WHERE user_id=$1`, [owner.id])).rows;
  const urlOf = (k: string) => rows.find((r) => r.dedupe_key === k)?.url;
  assert.equal(urlOf('bounce:recCAMPNEWAAAAAAA'), '#/campaigns/recCAMPNEWAAAAAAA');
  assert.equal(urlOf('signed:recDEALAAAAAAAAAA'), '#/sales/recDEALAAAAAAAAAA');
  assert.equal(urlOf('booked:recGHLBOOKAAAAAAA'), '#/thread/recGHLBOOKAAAAAAA');
});

test('firstSeen: a key still there stays seen; a detector baselines once', { skip }, async () => {
  assert.deepEqual(await firstSeen(db, 'w', 'x', ['a', 'b'], T0), [], 'baseline');
  assert.deepEqual(await firstSeen(db, 'w', 'x', [], T0), []);
  assert.deepEqual(await firstSeen(db, 'w', 'x', ['a', 'c'], T0), ['c'], 'an empty run does not reset the baseline');
});

// ---------- chat answer ----------
test('chat answer: pushed when the person left that chat, not while they look at it', { skip }, async () => {
  await bothDevices();
  const cookie = await login(OWNER);
  await setPresence(db, owner, 'chat/Ada', true);
  const a = await call('POST', '/hq/api/chat', { cookie, body: { agent: 'Ada', message: 'Which campaigns are past 60%?' } });
  assert.equal(a.status, 200);
  await pushIdle();
  assert.equal((await logRows(owner.id)).length, 0, 'on the chat: no push');
  await call('POST', '/hq/api/push/presence', { cookie, body: { route: 'decisions/Replies', visible: true } });
  const b = await call('POST', '/hq/api/chat', { cookie, body: { agent: 'Ada', message: 'And bounce?', threadId: a.body.threadId } });
  assert.equal(b.status, 200);
  await pushIdle();
  const rows = await logRows(owner.id);
  assert.equal(rows.length, 1); assert.equal(rows[0].type, 'agent'); assert.equal(rows[0].url, `#/chat/Ada/${a.body.threadId}`);
  assert.equal(sent.length, 1); assert.equal(sent[0].payload.title, 'Ada answered');
  assert.equal((await logRows(member.id)).length, 0, 'only the person who asked');
  // A hidden page (phone locked) counts as away too.
  await call('POST', '/hq/api/push/presence', { cookie, body: { route: 'chat/Ada', visible: false } });
  await call('POST', '/hq/api/chat', { cookie, body: { agent: 'Ada', message: 'Thanks', threadId: a.body.threadId } });
  await pushIdle();
  assert.equal((await logRows(owner.id)).length, 2);
});

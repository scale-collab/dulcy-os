// Finances → Personal through Plaid (Alex 2026-11-28): read only, owner only. Plaid is a fake fetch;
// nothing leaves the machine. The access token is sealed in Postgres and never appears in an answer.
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
import { NOT_CONNECTED, openToken, parseAccounts, personalTotals, sealToken, sheetReplaced, _resetPlaidCache, type PersonalConnection } from '../src/hq/plaid.js';
import { createPlaidClient, PlaidError } from '../src/providers/plaid.js';

const SECRET = 'e'.repeat(40);
const ACCESS = 'access-sandbox-7f3c9a11-THE-REAL-TOKEN';
const PLAID_SECRET = 'plaid-secret-value-123456';

// ---------- pure ----------
test('seal / open: AES-256-GCM round trip; the sealed text never holds the token; tamper, other item, other secret all fail', () => {
  const s = sealToken(SECRET, 'item-1', ACCESS);
  assert.match(s, /^v1:[A-Za-z0-9+/=]+$/);
  assert.ok(!s.includes('access-sandbox') && !s.includes('THE-REAL-TOKEN'));
  assert.notEqual(sealToken(SECRET, 'item-1', ACCESS), s, 'a fresh IV every time');
  assert.equal(openToken(SECRET, 'item-1', s), ACCESS);
  assert.throws(() => openToken(SECRET, 'item-2', s), 'bound to its item id');
  assert.throws(() => openToken('f'.repeat(40), 'item-1', s), 'another ENGINE_SECRET cannot open it');
  const raw = Buffer.from(s.slice(3), 'base64'); raw[raw.length - 1] ^= 1;
  assert.throws(() => openToken(SECRET, 'item-1', `v1:${raw.toString('base64')}`), 'changed text is refused');
  assert.throws(() => sealToken('short', 'item-1', ACCESS));
});

const ACCOUNTS = {
  accounts: [
    { account_id: 'acc-card', name: 'Discover it Card', official_name: 'Discover it Cash Back', mask: '1234', type: 'credit', subtype: 'credit card', balances: { current: 410.556, available: 4589.44, limit: 5000, iso_currency_code: 'USD' } },
    { account_id: 'acc-chk', name: 'Checking', mask: '9876', type: 'depository', subtype: 'checking', balances: { current: 1200, available: 1150, limit: null, iso_currency_code: 'USD' } },
  ],
  item: { item_id: 'item-abc', institution_name: 'Discover' },
};
const LIABILITIES = { liabilities: { credit: [{ account_id: 'acc-card', last_statement_balance: 380.12, minimum_payment_amount: 35, next_payment_due_date: '2026-12-14', last_statement_issue_date: '2026-11-17', is_overdue: false, last_payment_amount: 200, last_payment_date: '2026-11-10' }] } };

test('parse: balances, limit, and credit card statement / minimum / due date from Liabilities', () => {
  const [card, chk] = parseAccounts(ACCOUNTS, LIABILITIES);
  assert.deepEqual([card.name, card.mask, card.type, card.current, card.available, card.limit], ['Discover it Card', '1234', 'credit', 410.56, 4589.44, 5000]);
  assert.deepEqual([card.statement, card.minimum, card.due, card.overdue, card.statementDate, card.lastPayment, card.lastPaymentDate], [380.12, 35, '2026-12-14', false, '2026-11-17', 200, '2026-11-10']);
  assert.deepEqual([chk.current, chk.available, chk.limit, chk.statement, chk.minimum, chk.due, chk.overdue], [1200, 1150, null, null, null, '', null], 'no liability data: null, never 0');
  const noLi = parseAccounts(ACCOUNTS, null)[0];
  assert.deepEqual([noLi.current, noLi.statement, noLi.due], [410.56, null, '']);
  const conns: PersonalConnection[] = [{ id: 1, institution: 'Discover', linkedAt: '', accounts: [card, chk], error: null }];
  assert.deepEqual(personalTotals(conns), { cards: 1, cardBalance: 410.56, statement: 380.12, minimum: 35, cash: 1200 });
  assert.deepEqual(sheetReplaced(conns), ['discover']);
  assert.deepEqual(sheetReplaced([{ institution: 'Robinhood', accounts: [], error: 'x' }]), [], 'a broken connection does not hide the sheet row');
  assert.deepEqual(sheetReplaced([{ institution: 'Chase', accounts: [{ ...card, name: 'Robinhood Gold Card' }], error: null }]), ['robinhood']);
});

test('config: Plaid optional, production by default, read-only products only', () => {
  const base = { ENGINE_SECRET: SECRET, DATABASE_URL: 'postgres://x' };
  const off = loadConfig(base as NodeJS.ProcessEnv);
  assert.deepEqual([off.plaidClientId, off.plaidSecret, off.plaidEnv, off.plaidProducts], [undefined, undefined, 'production', ['liabilities']]);
  const sb = loadConfig({ ...base, PLAID_CLIENT_ID: ' cid ', PLAID_SECRET: 's', PLAID_ENV: 'Sandbox', PLAID_PRODUCTS: 'transactions, transfer, payment_initiation, auth' } as NodeJS.ProcessEnv);
  assert.deepEqual([sb.plaidClientId, sb.plaidEnv, sb.plaidProducts], ['cid', 'sandbox', ['transactions']], 'money-moving products are dropped');
  assert.deepEqual(loadConfig({ ...base, PLAID_PRODUCTS: 'transfer' } as NodeJS.ProcessEnv).plaidProducts, ['liabilities']);
});

// ---------- the fake Plaid ----------
interface Call { url: string; body: any }
let calls: Call[] = [];
let failBalance = false;
let removeError: string | null = null;
const fakeFetch = (async (input: any, init?: any) => {
  const u = String(input); const body = JSON.parse(String(init?.body ?? '{}'));
  calls.push({ url: u, body });
  const ok = (j: unknown) => new Response(JSON.stringify(j), { status: 200, headers: { 'content-type': 'application/json' } });
  const err = (status: number, code: string, msg: string) => new Response(JSON.stringify({ error_type: 'X', error_code: code, error_message: msg, display_message: null }), { status });
  if (body.client_id !== 'cid-1' || body.secret !== PLAID_SECRET) return err(400, 'INVALID_API_KEYS', 'invalid client_id or secret provided');
  const p = new URL(u).pathname;
  if (p === '/link/token/create') return ok({ link_token: 'link-sandbox-abc', expiration: '2026-11-28T20:00:00Z', request_id: 'r' });
  if (p === '/item/public_token/exchange') return body.public_token === 'public-sandbox-good-1234' ? ok({ access_token: ACCESS, item_id: 'item-abc' }) : err(400, 'INVALID_PUBLIC_TOKEN', 'bad public token');
  if (body.access_token !== ACCESS) return err(400, 'INVALID_ACCESS_TOKEN', 'bad access token');
  if (p === '/accounts/balance/get') return failBalance ? err(400, 'PRODUCT_NOT_ENABLED', 'balance not enabled') : ok(ACCOUNTS);
  if (p === '/accounts/get') return ok(ACCOUNTS);
  if (p === '/liabilities/get') return ok(LIABILITIES);
  if (p === '/item/remove') return removeError ? err(400, removeError, 'nope') : ok({ removed: true });
  return err(404, 'NOT_FOUND', `unexpected ${p}`);
}) as typeof fetch;

test('provider: link token asks only for read products; Balance not enabled falls back to /accounts/get; errors carry the code', async () => {
  calls = []; failBalance = true;
  const c = createPlaidClient({ clientId: 'cid-1', secret: PLAID_SECRET, env: 'sandbox' }, fakeFetch);
  assert.equal((await c.linkToken('hq-x')).link_token, 'link-sandbox-abc');
  assert.equal(calls[0].url, 'https://sandbox.plaid.com/link/token/create');
  assert.deepEqual([calls[0].body.products, calls[0].body.user, calls[0].body.country_codes], [['liabilities'], { client_user_id: 'hq-x' }, ['US']]);
  assert.equal((await c.accounts(ACCESS)).accounts.length, 2);
  assert.deepEqual(calls.slice(1).map((x) => new URL(x.url).pathname), ['/accounts/balance/get', '/accounts/get']);
  await assert.rejects(c.remove('access-wrong'), (e: unknown) => e instanceof PlaidError && e.code === 'INVALID_ACCESS_TOKEN' && !String((e as Error).message).includes('access-wrong'));
  const prod = createPlaidClient({ clientId: 'cid-1', secret: PLAID_SECRET, env: 'production', products: ['transactions'] }, fakeFetch);
  calls = []; await prod.linkToken('hq-x');
  assert.equal(calls[0].url, 'https://production.plaid.com/link/token/create');
  assert.deepEqual([calls[0].body.products, calls[0].body.required_if_supported_products], [['transactions'], ['liabilities']]);
  failBalance = false;
});

// ---------- over HTTP ----------
const url = process.env.TEST_DATABASE_URL;
const skip = !url ? 'TEST_DATABASE_URL not set' : false;
const PW = 'correct horse battery staple';
let db: Db; let on: http.Server; let off: http.Server; let portOn = 0; let portOff = 0; let webDir = '';
const at = { async list() { return []; }, async get() { return null; }, async create() { throw new Error('no writes'); }, async update() { throw new Error('no writes'); } };
function cfg(plaid: boolean): Config {
  return { ...loadConfig({ ENGINE_SECRET: SECRET, DATABASE_URL: url ?? 'postgres://x', HQ_SESSION_SECRET: 's'.repeat(40), HQ_HOST: 'hq.test.local', ...(plaid ? { PLAID_CLIENT_ID: 'cid-1', PLAID_SECRET, PLAID_ENV: 'sandbox' } : {}) } as NodeJS.ProcessEnv), airtableApiKey: undefined };
}
function call(port: number, method: string, p: string, o: { cookie?: string; body?: unknown; headers?: Record<string, string>; origin?: boolean; host?: string } = {}): Promise<{ status: number; body: any; text: string; headers: http.IncomingHttpHeaders }> {
  return new Promise((resolve, reject) => {
    const host = o.host ?? `127.0.0.1:${port}`;
    const data = o.body === undefined ? undefined : JSON.stringify(o.body);
    const headers: Record<string, string> = { host, ...(o.cookie ? { cookie: o.cookie } : {}), ...(data ? { 'content-type': 'application/json' } : {}), ...(o.origin === false ? {} : method !== 'GET' ? { origin: `https://${host}` } : {}), ...(o.headers ?? {}) };
    const req = http.request({ host: '127.0.0.1', port, method, path: p, headers }, (res) => {
      const chunks: Buffer[] = []; res.on('data', (c) => chunks.push(c));
      res.on('end', () => { const text = Buffer.concat(chunks).toString('utf8'); let body: any = null; try { body = JSON.parse(text); } catch { /* */ } resolve({ status: res.statusCode ?? 0, body, text, headers: res.headers }); });
    });
    req.on('error', reject); if (data) req.write(data); req.end();
  });
}
async function login(port: number, email: string, password: string): Promise<string> {
  const r = await new Promise<http.IncomingMessage>((resolve, reject) => {
    const host = `127.0.0.1:${port}`;
    const req = http.request({ host: '127.0.0.1', port, method: 'POST', path: '/hq/api/auth/login', headers: { host, origin: `https://${host}`, 'content-type': 'application/json' } }, (res) => { res.resume(); res.on('end', () => resolve(res)); });
    req.on('error', reject); req.write(JSON.stringify({ email, password })); req.end();
  });
  return ([] as string[]).concat(r.headers['set-cookie'] ?? []).map((c) => c.split(';')[0]).find((c) => c.startsWith('__Host-hq_session=')) ?? '';
}
const listen = async (s: http.Server) => { await new Promise<void>((r) => s.listen(0, '127.0.0.1', () => r())); return (s.address() as AddressInfo).port; };
before(async () => {
  if (skip) return;
  db = createPool(url!); await migrate(db);
  webDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hqweb-plaid-'));
  fs.writeFileSync(path.join(webDir, 'index.html'), '<!doctype html><title>Dulcy HQ</title>');
  fs.writeFileSync(path.join(webDir, 'portal.html'), '<!doctype html><title>Portal</title>');
  on = createServer(db, cfg(true), { at: at as any, fetchImpl: fakeFetch, webDir }); portOn = await listen(on);
  off = createServer(db, cfg(false), { at: at as any, fetchImpl: fakeFetch, webDir }); portOff = await listen(off);
});
after(async () => { if (!skip) { on.close(); off.close(); await db.end(); fs.rmSync(webDir, { recursive: true, force: true }); } });
beforeEach(async () => {
  if (skip) return;
  _resetPlaidCache(); calls = []; failBalance = false; removeError = null;
  await db.query('TRUNCATE hq_users, hq_sessions, hq_login_attempts, hq_plaid_items RESTART IDENTITY CASCADE');
  await upsertUser(db, 'alex@dulcy.io', 'owner', PW, 'Alex');
  await upsertUser(db, 'josh@dulcy.io', 'member', 'josh long password 1', 'Josh');
});

test('no Plaid keys: one soft line, nothing called, Connect refused with the same line', { skip }, async () => {
  const c = await login(portOff, 'alex@dulcy.io', PW);
  const g = await call(portOff, 'GET', '/hq/api/finances/personal', { cookie: c });
  assert.equal(g.status, 200, g.text);
  assert.deepEqual([g.body.configured, g.body.message, g.body.connections, g.body.replaces], [false, NOT_CONNECTED, [], []]);
  const t = await call(portOff, 'POST', '/hq/api/finances/personal/link-token', { cookie: c, body: {} });
  assert.deepEqual([t.status, t.body.error], [503, NOT_CONNECTED]);
  assert.equal(calls.length, 0);
});

test('owner: link token, connect (token sealed in Postgres), accounts with card liabilities; the token is never in an answer', { skip }, async () => {
  const c = await login(portOn, 'alex@dulcy.io', PW);
  const t = await call(portOn, 'POST', '/hq/api/finances/personal/link-token', { cookie: c, body: {} });
  assert.equal(t.status, 200, t.text);
  assert.equal(t.body.linkToken, 'link-sandbox-abc');
  assert.match(calls[0].body.user.client_user_id, /^hq-[0-9a-f]{24}$/, 'an opaque id, never the email');
  assert.ok(!JSON.stringify(calls[0].body).includes('alex@'));
  assert.ok(!t.text.includes(PLAID_SECRET));

  assert.equal((await call(portOn, 'POST', '/hq/api/finances/personal/connect', { cookie: c, body: { publicToken: 'not-a-token' } })).status, 400);
  const bad = await call(portOn, 'POST', '/hq/api/finances/personal/connect', { cookie: c, body: { publicToken: 'public-sandbox-wrong-1234' } });
  assert.equal(bad.status, 502); assert.match(bad.body.error, /INVALID_PUBLIC_TOKEN/);
  const x = await call(portOn, 'POST', '/hq/api/finances/personal/connect', { cookie: c, body: { publicToken: 'public-sandbox-good-1234', institution: 'Discover<script>' } });
  assert.equal(x.status, 200, x.text);
  assert.deepEqual([x.body.ok, x.body.institution], [true, 'Discoverscript']);
  assert.ok(!x.text.includes(ACCESS));
  const row = (await db.query('SELECT * FROM hq_plaid_items')).rows[0];
  assert.equal(row.item_id, 'item-abc');
  assert.ok(!JSON.stringify(row).includes(ACCESS) && !row.access_token_enc.includes('THE-REAL-TOKEN'), 'stored sealed, never in clear');
  assert.equal(openToken(SECRET, 'item-abc', row.access_token_enc), ACCESS, 'round trip');

  calls = [];
  const g = await call(portOn, 'GET', '/hq/api/finances/personal', { cookie: c });
  assert.equal(g.status, 200, g.text);
  assert.ok(!g.text.includes(ACCESS) && !g.text.includes('access_token') && !g.text.includes(PLAID_SECRET) && !g.text.includes('acc-card'));
  assert.deepEqual(calls.map((k) => new URL(k.url).pathname).sort(), ['/accounts/balance/get', '/liabilities/get']);
  assert.ok(calls.every((k) => k.body.access_token === ACCESS), 'the sealed token opens to the real one for Plaid only');
  const conn = g.body.connections[0];
  assert.deepEqual([g.body.configured, g.body.env, conn.institution, conn.error, conn.accounts.length], [true, 'sandbox', 'Discoverscript', null, 2]);
  const card = conn.accounts[0];
  assert.deepEqual([card.current, card.limit, card.statement, card.minimum, card.due], [410.56, 5000, 380.12, 35, '2026-12-14']);
  assert.deepEqual(g.body.totals, { cards: 1, cardBalance: 410.56, statement: 380.12, minimum: 35, cash: 1200 });
  assert.deepEqual(g.body.replaces, ['discover'], 'the sheet Discover row gives way');

  calls = [];
  await call(portOn, 'GET', '/hq/api/finances/personal', { cookie: c });
  assert.equal(calls.length, 0, 'kept for an hour');
  _resetPlaidCache();
  await call(portOn, 'GET', '/hq/api/finances/personal?refresh=1', { cookie: c });
  assert.equal(calls.length, 2, 'Refresh reads again');

  // A connection whose sealed token no longer opens (ENGINE_SECRET changed) says so and is not called.
  await db.query(`UPDATE hq_plaid_items SET access_token_enc = $1`, [sealToken('z'.repeat(40), 'item-abc', ACCESS)]);
  _resetPlaidCache(); calls = [];
  const broken = await call(portOn, 'GET', '/hq/api/finances/personal', { cookie: c });
  assert.match(broken.body.connections[0].error, /connect it again/);
  assert.deepEqual([calls.length, broken.body.replaces], [0, []]);
  await db.query(`UPDATE hq_plaid_items SET access_token_enc = $1`, [row.access_token_enc]);
});

test('owner: Remove ends the login at Plaid, then deletes the row; Plaid refusing keeps it', { skip }, async () => {
  const c = await login(portOn, 'alex@dulcy.io', PW);
  const x = await call(portOn, 'POST', '/hq/api/finances/personal/connect', { cookie: c, body: { publicToken: 'public-sandbox-good-1234', institution: 'Discover' } });
  const id = x.body.id;
  removeError = 'INTERNAL_SERVER_ERROR_X';
  const no = await call(portOn, 'POST', `/hq/api/finances/personal/${id}/remove`, { cookie: c, body: {} });
  assert.equal(no.status, 502); assert.match(no.body.error, /^Not removed/);
  assert.equal((await db.query('SELECT count(*)::int AS n FROM hq_plaid_items')).rows[0].n, 1);
  removeError = null; calls = [];
  const r = await call(portOn, 'POST', `/hq/api/finances/personal/${id}/remove`, { cookie: c, body: {} });
  assert.equal(r.status, 200, r.text);
  assert.deepEqual(calls.map((k) => [new URL(k.url).pathname, k.body.access_token === ACCESS]), [['/item/remove', true]]);
  assert.equal((await db.query('SELECT count(*)::int AS n FROM hq_plaid_items')).rows[0].n, 0);
  assert.equal((await call(portOn, 'POST', `/hq/api/finances/personal/${id}/remove`, { cookie: c, body: {} })).status, 404);
  // Already gone at Plaid: removed here too.
  const y = await call(portOn, 'POST', '/hq/api/finances/personal/connect', { cookie: c, body: { publicToken: 'public-sandbox-good-1234', institution: 'Discover' } });
  removeError = 'ITEM_NOT_FOUND';
  assert.equal((await call(portOn, 'POST', `/hq/api/finances/personal/${y.body.id}/remove`, { cookie: c, body: {} })).status, 200);
});

for (const who of ['member', 'owner viewing as member'] as const) test(`${who}: 403 on every Personal route; Plaid never called`, { skip }, async () => {
  const owner = await login(portOn, 'alex@dulcy.io', PW);
  await call(portOn, 'POST', '/hq/api/finances/personal/connect', { cookie: owner, body: { publicToken: 'public-sandbox-good-1234', institution: 'Discover' } });
  calls = []; _resetPlaidCache();
  const c = who === 'member' ? await login(portOn, 'josh@dulcy.io', 'josh long password 1') : owner;
  const headers: Record<string, string> = who === 'member' ? {} : { 'x-hq-view': 'member' };
  for (const [m, p] of [['GET', '/hq/api/finances/personal'], ['GET', '/hq/api/finances/personal?refresh=1'], ['POST', '/hq/api/finances/personal/link-token'], ['POST', '/hq/api/finances/personal/connect'], ['POST', '/hq/api/finances/personal/1/remove']] as const) {
    const r = await call(portOn, m, p, { cookie: c, headers, ...(m === 'POST' ? { body: { publicToken: 'public-sandbox-good-1234' } } : {}) });
    assert.equal(r.status, 403, `${m} ${p}`);
    assert.ok(!/Discover|410|5000|link-sandbox/.test(r.text), p);
  }
  assert.equal(calls.length, 0);
  assert.equal((await db.query('SELECT count(*)::int AS n FROM hq_plaid_items')).rows[0].n, 1, 'nothing removed');
});

test('CSRF: a Personal POST without a same-site Origin is refused; signed out is 401', { skip }, async () => {
  const c = await login(portOn, 'alex@dulcy.io', PW);
  assert.equal((await call(portOn, 'POST', '/hq/api/finances/personal/link-token', { cookie: c, body: {}, origin: false })).status, 403);
  assert.equal((await call(portOn, 'POST', '/hq/api/finances/personal/link-token', { cookie: c, body: {}, headers: { origin: 'https://evil.example' } })).status, 403);
  assert.equal((await call(portOn, 'GET', '/hq/api/finances/personal')).status, 401);
  assert.equal(calls.length, 0);
});

test('CSP: the HQ page allows Plaid Link (cdn.plaid.com script and frame); the API and portal do not', { skip }, async () => {
  const page = await call(portOn, 'GET', '/hq/finances');
  assert.equal(page.status, 200);
  const csp = String(page.headers['content-security-policy']);
  assert.match(csp, /script-src 'self' https:\/\/cdn\.plaid\.com\/link\/v2\/stable\/link-initialize\.js;/);
  assert.match(csp, /frame-src https:\/\/cdn\.plaid\.com\//);
  assert.match(csp, /frame-ancestors 'none'/);
  const api = await call(portOn, 'GET', '/hq/api/me');
  assert.ok(!String(api.headers['content-security-policy']).includes('plaid'));
  const portal = await call(portOn, 'GET', '/hq/portal');
  assert.equal(portal.status, 200);
  assert.ok(!String(portal.headers['content-security-policy']).includes('plaid'));
});

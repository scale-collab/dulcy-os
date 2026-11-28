// HQ round 4 (Alex 2026-11-28): Clients custom range, People contacted, profit per client, and the
// Finances screen (company money from Xero, Personal = Robinhood / Discover cards). Every service is
// a fake; members get 403 on every money route and see no money anywhere.
import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { createPool, migrate, type Db } from '../src/db/pool.js';
import { loadConfig, type Config } from '../src/config.js';
import { createServer } from '../src/http.js';
import { upsertUser } from '../src/hq/auth.js';
import { agencyNumbers, customRanges, resultsFor, resultsOf, type BookClient, type OverviewRow } from '../src/hq/clientDeals.js';
import { financesView, splitCards, topLines, _resetFinanceCache, type CardDebt, type Finance } from '../src/hq/finance.js';
import { activeDays, clientProfit, domainCounts, meetingsByWorkspace, DOMAIN_COM_YEARLY, _resetProfitCache, type ProfitInput } from '../src/hq/clientProfit.js';
import { _resetClientsCache } from '../src/hq/clients.js';
import { etYmd } from '../src/agents/ledger.js';

const NOW = new Date('2026-11-27T15:00:00.000Z');

// ---------- custom range ----------
test('custom range: both days included, the range before has the same days; bad ranges refused', () => {
  assert.deepEqual(customRanges('2026-11-01', '2026-11-30'), {
    cur: { from: '2026-11-01', to: '2026-12-01', label: '11/1/2026 to 11/30/2026' },
    prev: { from: '2026-10-02', to: '2026-11-01', label: 'The 30 days before' },
  });
  assert.equal(customRanges('2026-11-05', '2026-11-05')!.cur.to, '2026-11-06', 'one day');
  assert.equal(customRanges('2026-11-30', '2026-11-01'), null, 'to before from');
  assert.equal(customRanges('11/1/2026', '2026-11-30'), null, 'not a day');
  assert.equal(customRanges('2020-01-01', '2026-11-30'), null, 'longer than 3 years');
  assert.equal(customRanges(undefined, null), null);
  const book: BookClient[] = [{ key: 'a', name: 'A', active: true, start: '2026-11-10', end: '', retainer: 1000, ltv: 1000 }, { key: 'b', name: 'B', active: false, start: '2026-01-01', end: '2026-10-20', retainer: 0, ltv: 5000 }];
  const x = agencyNumbers(book, 'custom', NOW, customRanges('2026-11-01', '2026-11-27')!);
  assert.deepEqual([x.period, x.cur.newNames, x.cur.lostNames, x.prev.lostNames], ['custom', ['A'], [], ['B']]);
});

// ---------- people contacted ----------
test('results: People contacted = Total Leads Contacted, added up across workspaces; null when no row has it', () => {
  const ov = (clientId: string, contacted?: number): OverviewRow => ({ clientId, period: 'Last 30 days', sent: 1000, replies: 10, interested: 5, meetings: 1, updatedAt: '2026-11-27T07:00:00.000Z', contacted });
  assert.equal(resultsFor([ov('1', 400), ov('2', 250)], ['1', '2'], '30', NOW)!.contacted, 650);
  assert.equal(resultsFor([ov('1')], ['1'], '30', NOW)!.contacted, null, 'not on the row: shown as –, never 0');
  const r = resultsOf('custom', { sent: 5000, replies: 40, interested: 20, meetings: 4, contacted: 1800 });
  assert.deepEqual([r.window, r.contacted, r.emailsPerMeeting, r.emailsPerPositive, r.interestedToBooked, r.stale], ['custom', 1800, 1250, 250, 0.2, false]);
});

test('meetings in a range: dated bookings, else a WON row on its latest reply; per EmailBison workspace', () => {
  const e = (ws: string, f: Record<string, unknown>) => ({ id: 'x', fields: { 'Workspace ID (Bison)': ws, ...f } });
  const rows = [
    e('5', { 'Meeting Booked At': '2026-11-03T15:00:00.000Z' }),
    e('5', { 'Date of Call Booked': '2026-11-30' }),
    e('5', { 'Opportunity Status': 'WON', 'Latest Reply Time': '2026-11-10T12:00:00.000Z' }),
    e('6', { 'Pipeline Stage': 'Booked Meeting', 'Latest Reply Time': '2026-11-12T12:00:00.000Z' }),
    e('6', { 'Latest Reply Time': '2026-11-12T12:00:00.000Z' }),
    e('6', { 'Meeting Booked At': '2026-10-31T12:00:00.000Z' }),
  ];
  const m = meetingsByWorkspace(rows, { from: '2026-11-01', to: '2026-11-30' });
  assert.deepEqual([m.get('5'), m.get('6')], [2, 1], '11/30 is outside [11/1, 11/30); a reply with no booking is not a meeting');
});

// ---------- profit per client ----------
const base: ProfitInput = { id: 'rec1', key: 'acme', name: 'Acme', retainer: 1500, perCall: 250, dealType: 'both', start: '2026-01-01', end: '', meetings: 6, inboxes: 40, domains: { com: 20, other: 0 } };
const NOV = { from: '2026-11-01', to: '2026-12-01' };
test('profit: deal revenue in the period minus inboxes x $2.50 and .com domains x $9.99/yr; leads UNKNOWN', () => {
  const p = clientProfit(base, NOV);
  assert.equal(p.months, 0.99, '30 days / 30.43');
  assert.equal(p.revenue, Math.round((1500 * 0.99 + 6 * 250) * 100) / 100);
  assert.match(p.revenueNote, /\$1,500\/mo x 0\.99 mo \+ 6 meetings x \$250/);
  const [inbox, dom, leads] = p.costs;
  assert.deepEqual([inbox.label, inbox.amount], ['Inboxes', Math.round(40 * 2.5 * 0.99 * 100) / 100]);
  assert.match(inbox.note, /40 inboxes x \$2\.50\/mo/);
  assert.deepEqual([dom.label, dom.amount], ['Domains', Math.round((20 * DOMAIN_COM_YEARLY / 12) * 0.99 * 100) / 100]);
  assert.deepEqual([leads.label, leads.amount], ['Leads and verification', null], 'never a guessed number');
  assert.match(leads.note, /^UNKNOWN/);
  assert.equal(p.knownCosts, Math.round((inbox.amount! + dom.amount!) * 100) / 100);
  assert.equal(p.profit, Math.round((p.revenue! - p.knownCosts) * 100) / 100);
  assert.deepEqual(p.unknown, ['leads and verification']);
});
test('profit: unknown parts stay UNKNOWN (deal, meetings, inboxes, other domain endings); part of the period only', () => {
  const noDeal = clientProfit({ ...base, retainer: null, dealType: 'unknown' }, NOV);
  assert.deepEqual([noDeal.revenue, noDeal.profit, noDeal.revenueNote], [null, null, 'Deal UNKNOWN']);
  const noMeet = clientProfit({ ...base, meetings: null }, NOV);
  assert.equal(noMeet.revenue, null, 'per-call deal with meetings not read: no revenue number');
  assert.equal(clientProfit({ ...base, perCall: 0, dealType: 'retainer', meetings: null }, NOV).revenue, Math.round(1500 * 0.99 * 100) / 100, 'retainer only: meetings not needed');
  const blind = clientProfit({ ...base, inboxes: null, domains: null }, NOV);
  assert.deepEqual(blind.costs.map((c) => c.amount), [null, null, null]);
  assert.equal(blind.knownCosts, 0);
  assert.deepEqual(blind.unknown, ['inboxes', 'domains', 'leads and verification']);
  const mixed = clientProfit({ ...base, domains: { com: 2, other: 150 } }, NOV);
  assert.ok(mixed.costs[1].amount! > 0, 'the .com part is counted');
  assert.match(mixed.costs[1].note, /2 \.com x \$9\.99\/yr · 150 other: price UNKNOWN/);
  assert.ok(mixed.unknown.includes('150 non-.com domains (price UNKNOWN)'));
  assert.equal(clientProfit({ ...base, domains: { com: 0, other: 3 } }, NOV).costs[1].amount, null, 'only unknown-price domains: UNKNOWN, not $0');
  assert.equal(activeDays(NOV, '2026-11-16', ''), 15, 'started mid-month: 15 days');
  assert.equal(activeDays(NOV, '2025-01-01', '2026-11-10'), 10, 'ended 11/10: 10 days (the end day counts)');
  assert.equal(activeDays(NOV, '2026-12-05', ''), 0);
  assert.equal(clientProfit({ ...base, start: '2026-11-16' }, NOV).months, 0.49);
});
test('domain counts per client: inboxes added up, .com vs other endings', () => {
  const m = domainCounts([{ clientKey: 'a', name: 'getacme.com', inboxes: 2 }, { clientKey: 'a', name: 'tryacme.info', inboxes: 2 }, { clientKey: 'none', name: 'x.com', inboxes: 2 }, { clientKey: 'b', name: 'B.COM ', inboxes: 1 }]);
  assert.deepEqual(m.get('a'), { inboxes: 4, com: 1, other: 1 });
  assert.deepEqual(m.get('b'), { inboxes: 1, com: 1, other: 0 });
  assert.equal(m.has('none'), false);
});

// ---------- Finances: company vs personal ----------
const card = (name: string, balance: number): CardDebt => ({ card: name, dueDate: '12/10/2026', statement: balance, balance, minimum: 25, available: null, apr: '' });
test('finances: Robinhood and Discover cards are Personal; every other card stays Company', () => {
  const s = splitCards([card('Amex Business', 300), card('Robinhood Gold', 120.5), card('DISCOVER it', 80), card('Chase Ink', 200)]);
  assert.deepEqual(s.company.map((c) => c.card), ['Amex Business', 'Chase Ink']);
  assert.deepEqual(s.personal.map((c) => c.card), ['Robinhood Gold', 'DISCOVER it']);
  assert.deepEqual([s.companyTotals.balance, s.personalTotals.balance, s.personalTotals.minimum], [500, 200.5, 50]);
  const fin: Finance = {
    sheet: { billing: [], cards: [card('Amex Business', 300), card('Robinhood Gold', 120.5)], cardTotals: { statement: 420.5, balance: 420.5, minimum: 50 } },
    xero: { thisMonth: { from: '2026-11-01', to: '2026-11-27', income: 7100, costs: 3100, lines: [] }, lastMonth: { from: '2026-10-01', to: '2026-10-31', income: 6900, costs: 2900 }, invoices: [] },
    errors: [], readAt: NOW.toISOString(),
  };
  const v = financesView(fin, 7745);
  assert.deepEqual(v.company.xero!.map((m) => [m.label, m.income, m.costs, m.net]), [['This month so far', 7100, 3100, 4000], ['Last month', 6900, 2900, 4000]]);
  assert.deepEqual(v.company.cards!.map((c) => c.card), ['Amex Business']);
  assert.deepEqual(v.personal.cards!.map((c) => c.card), ['Robinhood Gold']);
  assert.match(v.sources.income, /Xero/);
  assert.match(v.sources.personalRule, /Robinhood or Discover/);
  const none = financesView({ sheet: null, xero: null, errors: ['Xero is not connected on the server'], readAt: '' }, 0);
  assert.deepEqual([none.company.xero, none.company.cards, none.personal.cards, none.errors], [null, null, null, ['Xero is not connected on the server']]);
  assert.deepEqual(topLines([{ section: 'Operating Expenses', name: 'Software', amount: 900 }, { section: 'Operating Expenses', name: 'Nothing', amount: 0 }, { section: 'Cost of Sales', name: 'Inboxes', amount: 1200.456 }]).map((l) => [l.name, l.amount]), [['Inboxes', 1200.46], ['Software', 900]]);
});

// ---------- API ----------
const url = process.env.TEST_DATABASE_URL;
const skip = !url ? 'TEST_DATABASE_URL not set' : false;
const PW = 'correct horse battery staple';
let db: Db; let server: http.Server; let port = 0;
let tables: Record<string, Record<string, Record<string, unknown>>> = {};
const at = {
  async list(table: string) { return Object.entries(tables[table] ?? {}).map(([id, fields]) => ({ id, fields: { ...fields } })); },
  async get(table: string, id: string) { const f = tables[table]?.[id]; return f ? { id, fields: { ...f } } : null; },
  async create() { throw new Error('no writes'); },
  async update() { throw new Error('no writes'); },
};
const SHEET: string[][] = [
  ['Clients (Renewing)', 'Monthly', 'Processor', 'Rev Share / Calls Booked', '', 'DUE DATE', 'DEBT', 'Statement', 'Balance', 'Minimum', 'Available To Spend'],
  ['Acme Co', '$1,000.00', 'COMMAS', '$50', '', '12/10/2026', 'Chase Ink', '$100.00', '$110.00', '$40.00', '$500.00'],
  ['Revenue', '', '', '', '', '12/12/2026', 'Robinhood Gold', '$70.00', '$75.00', '$10.00', ''],
  ['', '', '', '', '', '12/14/2026', 'Discover it', '$30.00', '$35.00', '$5.00', ''],
  ['', '', '', '', '', '', 'Total', '$200.00'],
];
const sheets = { async tab() { return SHEET; } };
const xero = {
  async get(path: string, params: Record<string, string | number> = {}) {
    if (path !== 'Reports/ProfitAndLoss') throw new Error(`unexpected ${path}`);
    const cur = String(params.fromDate) === `${etYmd(new Date()).slice(0, 8)}01`;
    return { Reports: [{ Rows: [
      { RowType: 'Section', Title: 'Income', Rows: [{ RowType: 'SummaryRow', Cells: [{ Value: 'Total' }, { Value: cur ? '7100' : '6900' }] }] },
      { RowType: 'Section', Title: 'Operating Expenses', Rows: [{ RowType: 'Row', Cells: [{ Value: 'Software' }, { Value: '1200' }] }, { RowType: 'SummaryRow', Cells: [{ Value: 'Total' }, { Value: '3100' }] }] },
    ] }] };
  },
  async pages() { return [{ Type: 'ACCREC', Contact: { Name: 'Acme Co' }, AmountDue: 1000, DueDateString: '2026-12-01T00:00:00' }]; },
};
const statsCalls: string[] = [];
const bisonStats = async (teamId: number, from: string, to: string) => {
  statsCalls.push(`${teamId}:${from}:${to}`);
  if (teamId === 7) throw new Error('HTTP 500');
  return { sent: 2000, contacted: 900, replies: 30, interested: 12, bounced: 10 };
};
function cfg(): Config { return { ...loadConfig({ ENGINE_SECRET: 'x'.repeat(40), DATABASE_URL: url ?? 'postgres://x', HQ_SESSION_SECRET: 's'.repeat(40), HQ_HOST: 'hq.test.local' } as NodeJS.ProcessEnv), airtableApiKey: undefined }; }
function call(method: string, p: string, cookie?: string, extra: Record<string, string> = {}): Promise<{ status: number; body: any; text: string }> {
  return new Promise((resolve, reject) => {
    const host = `127.0.0.1:${port}`;
    const req = http.request({ host: '127.0.0.1', port, method, path: p, headers: { host, ...(cookie ? { cookie } : {}), ...extra } }, (res) => {
      const chunks: Buffer[] = []; res.on('data', (c) => chunks.push(c));
      res.on('end', () => { const text = Buffer.concat(chunks).toString('utf8'); let body: any = null; try { body = JSON.parse(text); } catch { /* */ } resolve({ status: res.statusCode ?? 0, body, text }); });
    });
    req.on('error', reject); req.end();
  });
}
async function login(email: string, password: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const host = `127.0.0.1:${port}`; const data = JSON.stringify({ email, password });
    const req = http.request({ host: '127.0.0.1', port, method: 'POST', path: '/hq/api/auth/login', headers: { host, origin: `https://${host}`, 'content-type': 'application/json' } }, (res) => {
      res.resume(); res.on('end', () => resolve(([] as string[]).concat(res.headers['set-cookie'] ?? []).map((c) => c.split(';')[0]).find((c) => c.startsWith('__Host-hq_session=')) ?? ''));
    });
    req.on('error', reject); req.write(data); req.end();
  });
}
before(async () => {
  if (skip) return;
  db = createPool(url!); await migrate(db);
  server = createServer(db, cfg(), { at: at as any, sheets, xero, bisonStats });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', () => r()));
  port = (server.address() as AddressInfo).port;
});
after(async () => { if (!skip) { server.close(); await db.end(); } });
beforeEach(async () => {
  _resetClientsCache(); _resetFinanceCache(); _resetProfitCache(); statsCalls.length = 0;
  const today = new Date().toISOString();
  tables = {
    tblcjRBGJEWh5KgOt: {
      recACME0000000001: { Name: 'Acme Co', Status: 'Active', 'Client Type': 'Paying Client', ID: 5, 'Client Start Date': '2026-01-01' },
      recACME0000000002: { Name: 'Acme Co (Internal)', Status: 'Active', 'Client Type': 'Paying Client', ID: 7 },
      recOLD00000000001: { Name: 'Old Client', Status: 'Inactive', 'Client Type': 'Paying Client', 'Monthly Fee': 1000, ID: 9, 'Client Start Date': '2026-01-01', 'Client End Date': '2026-03-01' },
    },
    tblZkEi6qylqfOj9Z: { recOV1: { 'Client ID': '5', 'Date Period': 'Last 30 days', 'Emails Sent': 40000, 'Total Leads Contacted': 15000, Interested: 90, 'Meetings Booked': 9, 'Updated At': today } },
    tblAVAA6uBPaMj28P: { recC1: { Name: 'Acme - X', Client: ['recACME0000000001'], 'Campaign Status': 'Active', Progress: 0.2 } },
    tblADFhWhTcLrl1UY: { recE1: { 'Workspace ID (Bison)': '5', 'Meeting Booked At': `${today.slice(0, 10)}T12:00:00.000Z` } },
  };
  await db.query('TRUNCATE hq_users, hq_sessions, hq_login_attempts RESTART IDENTITY CASCADE');
  await upsertUser(db, 'alex@dulcy.io', 'owner', PW, 'Alex');
  await upsertUser(db, 'josh@dulcy.io', 'member', 'josh long password 1', 'Josh');
});

test('owner: People contacted on Clients, custom range results from EmailBison, custom agency numbers', { skip }, async () => {
  const c = await login('alex@dulcy.io', PW);
  const list = await call('GET', '/hq/api/clients', c);
  assert.equal(list.status, 200, list.text);
  assert.equal(list.body.clients.find((x: any) => x.name === 'Acme Co').results.contacted, 15000, 'Total Leads Contacted');
  const today = new Date().toISOString().slice(0, 10);
  const r = await call('GET', `/hq/api/clients/results?from=2026-11-01&to=${today}`, c);
  assert.equal(r.status, 200, r.text);
  assert.deepEqual(statsCalls, [`5:2026-11-01:${today}`, `7:2026-11-01:${today}`], 'one call per workspace, one after another');
  const acme = r.body.rows.find((x: any) => x.name === 'Acme Co');
  assert.deepEqual([acme.results.sent, acme.results.contacted, acme.results.interested, acme.results.meetings, acme.results.window], [2000, 900, 12, 1, 'custom']);
  assert.match(acme.note, /Part only: 1 of 2/);
  assert.ok(r.body.errors.some((e: string) => /EmailBison 7/.test(e)));
  assert.equal(r.body.rows.some((x: any) => x.name === 'Old Client'), false, 'active clients only');
  assert.equal((await call('GET', '/hq/api/clients/results?from=2026-11-30&to=2026-11-01', c)).status, 400);
  const n = await call('GET', '/hq/api/clients/numbers?period=custom&from=2026-02-01&to=2026-03-31', c);
  assert.equal(n.status, 200, n.text);
  assert.deepEqual([n.body.numbers.period, n.body.numbers.cur.lostNames], ['custom', ['Old Client']]);
  assert.equal((await call('GET', '/hq/api/clients/numbers?period=custom&from=bad&to=2026-03-31', c)).status, 400);
});

test('owner: profit per client and Finances (company from Xero; Robinhood / Discover under Personal)', { skip }, async () => {
  const c = await login('alex@dulcy.io', PW);
  const p = await call('GET', '/hq/api/clients/profit?period=this-month', c);
  assert.equal(p.status, 200, p.text);
  assert.deepEqual(p.body.clients.map((x: any) => x.name), ['Acme Co'], 'active paying clients only');
  const acme = p.body.clients[0];
  assert.equal(acme.costs.find((x: any) => x.label === 'Leads and verification').amount, null);
  assert.ok(acme.revenue > 0, acme.revenueNote);
  assert.match(acme.revenueNote, /\$1,000\/mo x .* mo \+ 1 meetings x \$50/);
  assert.ok(p.body.rules.some((r: string) => /\$2\.50/.test(r)));
  assert.equal((await call('GET', '/hq/api/clients/profit?period=custom&from=2026-11-01&to=2026-11-15', c)).body.range.to, '2026-11-16');

  const f = await call('GET', '/hq/api/finances', c);
  assert.equal(f.status, 200, f.text);
  assert.deepEqual(f.body.company.xero.map((m: any) => [m.income, m.costs, m.net]), [[7100, 3100, 4000], [6900, 3100, 3800]]);
  assert.deepEqual(f.body.company.xero[0].lines.map((l: any) => [l.name, l.amount]), [['Software', 1200]]);
  assert.deepEqual(f.body.company.cards.map((x: any) => x.card), ['Chase Ink']);
  assert.deepEqual(f.body.personal.cards.map((x: any) => x.card), ['Robinhood Gold', 'Discover it']);
  assert.equal(f.body.personal.cardTotals.balance, 110);
  assert.equal(f.body.company.invoices.length, 1);
});

for (const who of ['member', 'owner viewing as member'] as const) test(`${who}: 403 on profit and Finances; custom results carry no money`, { skip }, async () => {
  const c = who === 'member' ? await login('josh@dulcy.io', 'josh long password 1') : await login('alex@dulcy.io', PW);
  const extra: Record<string, string> = who === 'member' ? {} : { 'x-hq-view': 'member' };
  for (const p of ['/hq/api/finances', '/hq/api/clients/profit?period=this-month', '/hq/api/clients/numbers?period=custom&from=2026-11-01&to=2026-11-20']) {
    const r = await call('GET', p, c, extra);
    assert.equal(r.status, 403, p);
    assert.ok(!/Robinhood|Chase|7100|1,?000/.test(r.text), p);
  }
  const r = await call('GET', '/hq/api/clients/results?from=2026-11-01&to=2026-11-20', c, extra);
  assert.equal(r.status, 200, r.text);
  assert.equal(/"money"|"fee"|"perCall"|\$|invoice/i.exec(r.text), null);
});

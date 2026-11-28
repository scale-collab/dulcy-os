// HQ round 5 (Alex 2026-11-28 evening): Finances. Personal cards (Cash Preferred, Amex Gold, Chase
// Personal, Robinhood, Discover) and the P/L sheet's personal expenses go to Personal; a Both view
// (money left over at the end of the month); open invoice and monthly expense drill-downs (Xero, read
// only). Every figure here is made up; every service is a fake.
import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { createPool, migrate, type Db } from '../src/db/pool.js';
import { loadConfig, type Config } from '../src/config.js';
import { createServer } from '../src/http.js';
import { upsertUser } from '../src/hq/auth.js';
import {
  costLines, daysOverdue, financesView, isPersonalCard, leftover, parseInvoice, parsePersonalExpenses, parsePnlSheet, personalCardKey,
  readInvoice, splitCards, ymdOf, _resetFinanceCache, type CardDebt, type Finance,
} from '../src/hq/finance.js';
import { sheetReplaced, type PersonalAccount } from '../src/hq/plaid.js';
import { _resetClientsCache } from '../src/hq/clients.js';
import { etYmd } from '../src/agents/ledger.js';

const NOW = new Date('2026-11-28T15:00:00.000Z');

// ---------- personal cards ----------
test('personal cards: the five names, any case, extra words and one typo fine; business cards stay Company', () => {
  const cases: [string, string | null][] = [
    ['AMEX Gold', 'amex gold'], ['amex gold card', 'amex gold'], ['American Express Gold Card', 'amex gold'],
    ['AMEX Gold (Bus) ', null], ['Amex Business Gold', null],
    ['AMEX Cash Perferred', 'cash preferred'], ['Blue Cash Preferred®', 'cash preferred'], ['Cash Preferered', 'cash preferred'],
    ['Chase Personal', 'chase personal'], ['CHASE personal checking', 'chase personal'], ['Chase Business ', null], ['Chase Prime', null],
    ['Robinhood Gold', 'robinhood'], ['Discover', 'discover'], ['DISCOVER it', 'discover'],
    ['AMEX Plantium (Bus)', null], ['AMEX Blue (Bus) ', null], ['Chase Ink', null], ['Gold', null], ['', null],
  ];
  for (const [name, key] of cases) assert.equal(personalCardKey(name), key, name);
  assert.equal(isPersonalCard('Chase Personal'), true);
  assert.equal(personalCardKey('Discovery Bank'), 'discover', 'one letter more is still the same word');
  assert.equal(personalCardKey('Gold Amex'), 'amex gold', 'word order does not matter');
  assert.equal(personalCardKey('Amex Old'), null, 'short words need an exact match');

  const card = (name: string, balance: number): CardDebt => ({ card: name, dueDate: '12/10/2026', statement: balance, balance, minimum: 10, available: null, apr: '' });
  const s = splitCards([card('AMEX Gold', 100), card('AMEX Gold (Bus) ', 200), card('AMEX Cash Perferred', 50), card('Chase Personal', 25), card('Chase Business ', 400), card('Robinhood Gold', 5), card('Discover', 1)]);
  assert.deepEqual(s.personal.map((c) => [c.card, c.key]), [['AMEX Gold', 'amex gold'], ['AMEX Cash Perferred', 'cash preferred'], ['Chase Personal', 'chase personal'], ['Robinhood Gold', 'robinhood'], ['Discover', 'discover']]);
  assert.deepEqual(s.company.map((c) => c.card), ['AMEX Gold (Bus) ', 'Chase Business ']);
  assert.deepEqual([s.personalTotals.balance, s.companyTotals.balance, s.personalTotals.minimum], [181, 600, 50]);
});

test('linked accounts (Plaid) replace the sheet row of the same personal card', () => {
  const acct = (name: string): PersonalAccount => ({ name, mask: '1', type: 'credit', subtype: 'credit card', currency: 'USD', current: 1, available: null, limit: null, statement: null, minimum: null, due: '', overdue: null, statementDate: '', lastPayment: null, lastPaymentDate: '' });
  assert.deepEqual(sheetReplaced([{ institution: 'American Express', accounts: [acct('Gold Card'), acct('Blue Cash Preferred')], error: null }]).sort(), ['amex gold', 'cash preferred']);
  assert.deepEqual(sheetReplaced([{ institution: 'American Express', accounts: [acct('Business Gold Card')], error: null }]), [], 'a business card replaces nothing');
  assert.deepEqual(sheetReplaced([{ institution: 'Discover', accounts: [acct('Card')], error: null }]), ['discover']);
  assert.deepEqual(sheetReplaced([{ institution: 'Discover', accounts: [acct('Card')], error: 'login needed' }]), []);
});

// ---------- the P/L sheet's personal expenses ----------
// The real tab's shape (made-up figures): "Home" at the top left, label | monthly | note; a figure only
// in the note column is not in the sheet's own total; a blank-label row holds the total; under it the
// "which card pays" breakdown, then its own total.
const HOME: string[][] = [
  ['Home', 'Rent', ' $ 1,000.00 ', '', '', '', 'DATE'],
  [' $ 1,200.00 ', 'Taxes', ' $ 200.00 '],
  ['', 'HOA', '', '50'],
  ['555-000-0000', 'Electric', ' $ 90.00 ', '(80-120)'],
  ['wkly (resumes jan 4 2027)', 'Savings', '', '300'],
  ['', 'Label only'],
  ['', '', '$1,290.00'],
  [],
  ['', 'Card A', '$1,000.00', '', 'Food Breakdown'],
  ['', 'Card B', '$290.00', '', 'Lunch', '$5.00'],
  ['', '', '$1,290.00', 'TRUE'],
  ['', 'Not read', '$9.00'],
];
test('P/L sheet personal expenses: monthly lines, the sheet total, figures beside the list kept apart, who pays', () => {
  const p = parsePersonalExpenses(HOME)!;
  assert.deepEqual(p.lines.map((l) => [l.name, l.amount, l.aside, l.note]), [['Rent', 1000, null, ''], ['Taxes', 200, null, ''], ['HOA', null, 50, ''], ['Electric', 90, null, '(80-120)'], ['Savings', null, 300, '']]);
  assert.deepEqual([p.total, p.totalFrom, p.asideTotal], [1290, 'sheet', 350]);
  assert.deepEqual(p.paidWith, [{ name: 'Card A', amount: 1000 }, { name: 'Card B', amount: 290 }]);
  const text = JSON.stringify(p);
  for (const never of ['555-000-0000', 'resumes', '1,200', 'Not read', 'Lunch']) assert.ok(!text.includes(never), `${never} is not read out`);
  const noTotal = parsePersonalExpenses([['Home', 'Rent', '$10.00'], ['', 'Food', '$5.50']])!;
  assert.deepEqual([noTotal.total, noTotal.totalFrom], [15.5, 'sum']);
  assert.equal(parsePersonalExpenses([['no block']]), null);
  assert.equal(parsePnlSheet(HOME).personal!.total, 1290, 'parsePnlSheet carries it');
});

// ---------- Both: left over at the end of the month ----------
test('leftover: company income − company costs − personal expenses; any unknown input = UNKNOWN', () => {
  const m = { label: 'Last month', from: '2026-10-01', to: '2026-10-31', income: 9000, costs: 3500.25 };
  const l = leftover(m, 2100.1);
  assert.equal(l.left, 3399.65);
  assert.deepEqual(l.parts.map((p) => [p.label, p.amount]), [['Company income', 9000], ['Company costs', -3500.25], ['Personal expenses', -2100.1]]);
  assert.deepEqual(l.unknown, []);
  const noSheet = leftover(m, null);
  assert.deepEqual([noSheet.left, noSheet.unknown], [null, ['Personal expenses']]);
  const noXero = leftover(null, 2100, 'This month so far');
  assert.deepEqual([noXero.left, noXero.label, noXero.unknown], [null, 'This month so far', ['Company income', 'Company costs']]);
  assert.equal(leftover({ ...m, income: 1000, costs: 2000 }, 500).left, -1500, 'a minus month stays minus');
  assert.equal(leftover({ ...m, income: 0, costs: 0 }, 0).left, 0, 'zero is known, not UNKNOWN');
});

test('financesView: Both for this month and last month; personal expenses under Personal', () => {
  const fin: Finance = {
    sheet: { billing: [], cards: [], cardTotals: { statement: 0, balance: 0, minimum: 0 }, personal: parsePersonalExpenses(HOME) },
    xero: { thisMonth: { from: '2026-11-01', to: '2026-11-28', income: 5000, costs: 1000 }, lastMonth: { from: '2026-10-01', to: '2026-10-31', income: 6000, costs: 2000 }, invoices: [] },
    errors: [], readAt: NOW.toISOString(),
  };
  const v = financesView(fin, 0);
  assert.deepEqual(v.both.months.map((m) => [m.label, m.left]), [['This month so far', 2710], ['Last month', 2710]]);
  assert.equal(v.personal.expenses!.total, 1290);
  assert.ok(v.both.notCounted.some((x) => /UNKNOWN/.test(x)));
  const none = financesView({ sheet: null, xero: null, errors: [], readAt: '' }, 0);
  assert.deepEqual(none.both.months.map((m) => [m.label, m.left, m.unknown.length]), [['This month so far', null, 3], ['Last month', null, 3]]);
});

// ---------- drill-downs ----------
test('monthly expenses: every cost line, by section, largest first; zero lines dropped', () => {
  const lines = [
    { section: 'Cost of Sales', name: 'Inboxes', amount: 300 }, { section: 'Operating Expenses', name: 'Software', amount: 90.555 },
    { section: 'Cost of Sales', name: 'Leads', amount: 900 }, { section: 'Operating Expenses', name: 'Nothing', amount: 0 }, { section: 'Operating Expenses', name: 'Bank fees', amount: 12 },
  ];
  assert.deepEqual(costLines(lines).map((l) => [l.section, l.name, l.amount]), [['Cost of Sales', 'Leads', 900], ['Cost of Sales', 'Inboxes', 300], ['Operating Expenses', 'Software', 90.56], ['Operating Expenses', 'Bank fees', 12]]);
  assert.deepEqual(costLines(undefined), []);
});

const INV_ID = '0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d';
const INVOICE = {
  Type: 'ACCREC', InvoiceID: INV_ID, InvoiceNumber: 'INV-0042', Reference: 'November retainer', Status: 'AUTHORISED', CurrencyCode: 'USD',
  Contact: { Name: 'Acme Co' }, DateString: '2026-11-01T00:00:00', DueDateString: '2026-11-15T00:00:00', Total: 1250, AmountPaid: 250, AmountDue: 1000,
  LineItems: [{ Description: 'Monthly tech fee', Quantity: 1, UnitAmount: 1000, LineAmount: 1000 }, { Description: 'Booked calls', Quantity: 1, UnitAmount: 250, LineAmount: 250 }],
};
test('invoice detail: number, client, amounts, due date, days overdue, line items, Xero link; client invoices only', () => {
  const d = parseInvoice(INVOICE, NOW)!;
  assert.deepEqual([d.number, d.contact, d.reference, d.status, d.date, d.due, d.daysOverdue, d.total, d.paid, d.amountDue], ['INV-0042', 'Acme Co', 'November retainer', 'AUTHORISED', '2026-11-01', '2026-11-15', 13, 1250, 250, 1000]);
  assert.deepEqual(d.lines.map((l) => [l.description, l.quantity, l.unitAmount, l.amount]), [['Monthly tech fee', 1, 1000, 1000], ['Booked calls', 1, 250, 250]]);
  assert.equal(d.xeroUrl, `https://go.xero.com/AccountsReceivable/View.aspx?InvoiceID=${INV_ID}`);
  assert.equal(parseInvoice({ ...INVOICE, Type: 'ACCPAY' }, NOW), null, 'a bill is not a client invoice');
  assert.equal(parseInvoice(undefined, NOW), null);
  assert.equal(parseInvoice({ ...INVOICE, InvoiceID: 'nope' }, NOW)!.xeroUrl, '', 'no link without a real id');
  assert.equal(daysOverdue('2026-11-28', 10, NOW), 0, 'due today: not late yet');
  assert.equal(daysOverdue('2026-12-05', 10, NOW), 0);
  assert.equal(daysOverdue('2026-11-27', 10, NOW), 1);
  assert.equal(daysOverdue('2026-11-01', 0, NOW), 0, 'nothing owed');
  assert.equal(ymdOf('2026-12-01T00:00:00'), '2026-12-01', 'the day as written, not moved a day back');
  assert.equal(ymdOf('/Date(1764547200000+0000)/'), '2025-12-01');
  assert.equal(ymdOf(''), '');
});

test('readInvoice: one GET to Invoices/<id>; a bad id never reaches Xero', async () => {
  const calls: string[] = [];
  const x = { async get(path: string) { calls.push(path); return { Invoices: [INVOICE] }; } };
  assert.equal((await readInvoice(x, INV_ID, NOW))!.number, 'INV-0042');
  assert.equal(await readInvoice(x, '../Invoices', NOW), null);
  assert.deepEqual(calls, [`Invoices/${INV_ID}`]);
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
  ['Home', 'Rent', '$1,000.00', '', '', '', 'DUE DATE', 'DEBT', 'Statement', 'Balance', 'Minimum', 'Available To Spend'],
  ['', 'Food', '$200.00', '', '', '', '12/10/2026', 'AMEX Gold', '$70.00', '$75.00', '$10.00', ''],
  ['', '', '$1,200.00', '', '', '', '12/12/2026', 'AMEX Gold (Bus) ', '$30.00', '$35.00', '$5.00', ''],
  ['', '', '', '', '', '', '12/14/2026', 'AMEX Cash Perferred', '$20.00', '$25.00', '$5.00', ''],
  ['', '', '', '', '', '', '', 'Total'],
];
const xeroGets: string[] = [];
const xero = {
  async get(path: string, params: Record<string, string | number> = {}) {
    xeroGets.push(path);
    if (path === `Invoices/${INV_ID}`) return { Invoices: [INVOICE] };
    if (path !== 'Reports/ProfitAndLoss') throw new Error(`unexpected ${path}`);
    const cur = String(params.fromDate) === `${etYmd(new Date()).slice(0, 8)}01`;
    return { Reports: [{ Rows: [
      { RowType: 'Section', Title: 'Income', Rows: [{ RowType: 'SummaryRow', Cells: [{ Value: 'Total' }, { Value: cur ? '5000' : '6000' }] }] },
      { RowType: 'Section', Title: 'Operating Expenses', Rows: [{ RowType: 'Row', Cells: [{ Value: 'Software' }, { Value: '800' }] }, { RowType: 'Row', Cells: [{ Value: 'Bank fees' }, { Value: '200' }] }, { RowType: 'SummaryRow', Cells: [{ Value: 'Total' }, { Value: '1000' }] }] },
    ] }] };
  },
  async pages() { return [{ Type: 'ACCREC', InvoiceID: INV_ID, InvoiceNumber: 'INV-0042', Contact: { Name: 'Acme Co' }, AmountDue: 1000, DueDateString: '2026-11-15T00:00:00' }]; },
};
const sheets = { async tab() { return SHEET; } };
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
  server = createServer(db, cfg(), { at: at as any, sheets, xero });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', () => r()));
  port = (server.address() as AddressInfo).port;
});
after(async () => { if (!skip) { server.close(); await db.end(); } });
beforeEach(async () => {
  _resetClientsCache(); _resetFinanceCache(); xeroGets.length = 0;
  tables = { tblcjRBGJEWh5KgOt: { recACME0000000001: { Name: 'Acme Co', Status: 'Active', 'Client Type': 'Paying Client', ID: 5, 'Client Start Date': '2026-01-01' } } };
  await db.query('TRUNCATE hq_users, hq_sessions, hq_login_attempts RESTART IDENTITY CASCADE');
  await upsertUser(db, 'alex@dulcy.io', 'owner', PW, 'Alex');
  await upsertUser(db, 'josh@dulcy.io', 'member', 'josh long password 1', 'Josh');
});

test('owner: Finances has Both, personal expenses, every cost line and invoice ids; the invoice opens (read only)', { skip }, async () => {
  const c = await login('alex@dulcy.io', PW);
  const f = await call('GET', '/hq/api/finances', c);
  assert.equal(f.status, 200, f.text);
  assert.deepEqual(f.body.both.months.map((m: any) => [m.label, m.left]), [['This month so far', 2800], ['Last month', 3800]]);
  assert.deepEqual(f.body.personal.cards.map((x: any) => x.card), ['AMEX Gold', 'AMEX Cash Perferred']);
  assert.deepEqual(f.body.company.cards.map((x: any) => x.card), ['AMEX Gold (Bus)']);
  assert.deepEqual([f.body.personal.expenses.total, f.body.personal.expenses.lines.length], [1200, 2]);
  assert.deepEqual(f.body.company.xero[0].allLines.map((l: any) => l.name), ['Software', 'Bank fees']);
  assert.deepEqual(f.body.company.invoices.map((i: any) => [i.id, i.number, i.late]), [[INV_ID, 'INV-0042', true]]);
  const d = await call('GET', `/hq/api/finances/invoices/${INV_ID}`, c);
  assert.equal(d.status, 200, d.text);
  assert.deepEqual([d.body.number, d.body.lines.length, d.body.amountDue], ['INV-0042', 2, 1000]);
  assert.equal((await call('GET', '/hq/api/finances/invoices/not-an-id', c)).status, 400);
  assert.notEqual((await call('POST', `/hq/api/finances/invoices/${INV_ID}`, c, { origin: `https://127.0.0.1:${port}` })).status, 200, 'nothing to POST: read only');
  assert.ok(xeroGets.every((p) => p === 'Reports/ProfitAndLoss' || p === `Invoices/${INV_ID}`), xeroGets.join(','));
});

for (const who of ['member', 'owner viewing as member'] as const) test(`${who}: 403 on the invoice detail and Finances`, { skip }, async () => {
  const c = who === 'member' ? await login('josh@dulcy.io', 'josh long password 1') : await login('alex@dulcy.io', PW);
  const extra: Record<string, string> = who === 'member' ? {} : { 'x-hq-view': 'member' };
  for (const p of ['/hq/api/finances', `/hq/api/finances/invoices/${INV_ID}`]) {
    const r = await call('GET', p, c, extra);
    assert.equal(r.status, 403, p);
    assert.ok(!r.text.includes('INV-0042') && !r.text.includes('1000'), 'no money in the answer');
  }
  assert.deepEqual(xeroGets, [], 'Xero is never read for them');
});

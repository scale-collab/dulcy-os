// HQ Clients, Batch 2: deal-type MRR/LTV math, churn and retention, periods, emails per meeting,
// health on the KPI, the P/L sheet parser, and the owner-only money routes (Xero + P/L sheet are
// fakes; members get 403 and no money key anywhere). No real service is called.
import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { createPool, migrate, type Db } from '../src/db/pool.js';
import { loadConfig, type Config } from '../src/config.js';
import { createServer } from '../src/http.js';
import { upsertUser } from '../src/hq/auth.js';
import {
  agencyNumbers, dealFor, healthOf, kpiNumber, ltvOf, monthsBetween, periodRanges, rangeNumbers, resultsFor, typeOf,
  type BookClient, type OverviewRow,
} from '../src/hq/clientDeals.js';
import { billingByClient, money, parsePnlSheet, _resetFinanceCache } from '../src/hq/finance.js';
import { clientKey, feedbackFor, kpiOf, onboardingOut, _resetClientsCache } from '../src/hq/clients.js';
import { SHEET_ALIASES } from '../src/hq/clientDeals.js';
import { bookedAt } from '../src/agents/atlas.js';

const NOW = new Date('2026-11-27T15:00:00.000Z');

// ---------- deals, MRR, LTV ----------
test('deal types: retainer, pay per call, both; source order P/L sheet > contract on file > Airtable', () => {
  assert.equal(typeOf(1500, 250), 'both');
  assert.equal(typeOf(2000, 0), 'retainer');
  assert.equal(typeOf(0, 280), 'per_call');
  assert.equal(typeOf(0, 0), 'unknown');
  const human = dealFor({ key: 'humanmarketing', airtableFee: 1500, airtableRate: 250 });
  assert.deepEqual([human.type, human.retainer, human.perCall], ['both', 1500, 250], 'Human Marketing = $1,500/month + $250 per booked call');
  const gmg = dealFor({ key: 'globalmediagroupltd', airtableFee: 2900, airtableRate: 280 });
  assert.deepEqual([gmg.type, gmg.retainer, gmg.perCall], ['per_call', 0, 280], 'the stale $2,900 Airtable fee is not used');
  const cartel = dealFor({ key: 'themarketingcartel' });
  assert.deepEqual([cartel.type, cartel.retainer, cartel.perCall, cartel.startDate], ['both', 1250, 175, '2026-09-16'], 'Marketing Cartel: from the signed agreement, not "fee unknown"');
  const tw = dealFor({ key: 'twentywestmedia', airtableFee: 2500 });
  assert.equal(tw.retainer, 2995, 'two retainer lines add up');
  const sheet = dealFor({ key: 'twentywestmedia', sheetLines: [{ label: 'Monthly', monthly: 1700, perCall: 0 }], airtableFee: 2500 });
  assert.deepEqual([sheet.retainer, sheet.source], [1700, 'Dulcy Media P/L sheet'], 'the live sheet wins');
  const other = dealFor({ key: 'someoneelse', airtableFee: 900 });
  assert.deepEqual([other.type, other.retainer, other.source], ['retainer', 900, 'Airtable (Monthly Fee, Billing Rate)']);
  assert.equal(dealFor({ key: 'nobody' }).type, 'unknown');
  // MRR with today's five active clients (contract terms on file): about $7.7K, not $6,900.
  const mrr = ['twentywestmedia', 'themarketingcartel', 'humanmarketing', 'brilliantjewelersmjjinc', 'globalmediagroupltd'].map((k) => dealFor({ key: k }).retainer).reduce((a, b) => a + b, 0);
  assert.equal(mrr, 7745);
});

test('LTV: retainer x months + per-call rate x booked meetings; Xero recorded shown beside it', () => {
  assert.equal(monthsBetween('2026-07-14', NOW), 4.5);
  assert.equal(monthsBetween('2026-01-01', '2026-01-01'), 0);
  assert.equal(monthsBetween('', NOW), null);
  const human = dealFor({ key: 'humanmarketing' });
  const l = ltvOf(human, 4.5, 6, 1500, 6750);
  assert.equal(l.value, 1500 * 4.5 + 250 * 6, 'not the $1,500 Xero matched');
  assert.equal(l.source, 'deal');
  assert.match(l.note, /4\.5 months x \$1,500 \+ 6 booked x \$250; Xero has \$1,500 recorded/);
  assert.equal(ltvOf(dealFor({ key: 'globalmediagroupltd' }), 16, 79, null, null).value, 280 * 79, 'pay per call only');
  assert.deepEqual(ltvOf(dealFor({ key: 'nobody' }), null, null, 9000, 12500), { value: 12500, source: 'recorded', note: 'Xero recorded revenue' });
  assert.deepEqual(ltvOf(dealFor({ key: 'nobody' }), null, null, null, null), { value: null, source: null, note: 'UNKNOWN' });
});

// ---------- periods, churn, retention ----------
test('periods: this month vs last, last month, 3/6/12 months, this year vs the same days last year', () => {
  assert.deepEqual(periodRanges('this-month', NOW), { cur: { from: '2026-11-01', to: '2026-11-28', label: 'This month' }, prev: { from: '2026-10-01', to: '2026-11-01', label: 'Last month' } });
  assert.deepEqual(periodRanges('last-month', NOW).cur, { from: '2026-10-01', to: '2026-11-01', label: 'Last month' });
  assert.deepEqual(periodRanges('3m', NOW).cur, { from: '2026-08-28', to: '2026-11-28', label: 'Last 3 months' });
  assert.deepEqual(periodRanges('3m', NOW).prev.from, '2026-05-28');
  assert.deepEqual(periodRanges('this-year', NOW).prev, { from: '2025-01-01', to: '2025-11-28', label: '2025, same days' });
  assert.equal(periodRanges('this-month', new Date('2026-01-15T12:00:00Z')).prev.from, '2025-12-01', 'January looks back to December');
});

const book: BookClient[] = [
  { key: 'a', name: 'A', active: true, start: '2026-01-10', end: '', retainer: 2000, ltv: 22000 },
  { key: 'b', name: 'B', active: true, start: '2026-11-05', end: '', retainer: 1500, ltv: 1000 },
  { key: 'c', name: 'C', active: false, start: '2026-05-01', end: '2026-11-25', retainer: 0, ltv: 7000 },
  { key: 'd', name: 'D', active: false, start: '2025-06-01', end: '2026-10-15', retainer: 0, ltv: 30000 },
  { key: 'e', name: 'E', active: false, start: '2025-02-01', end: '', retainer: 0, ltv: null },
];
test('agency numbers: MRR, active, new, lost, net, monthly churn, average LTV and retention', () => {
  const x = agencyNumbers(book, 'this-month', NOW);
  assert.deepEqual([x.mrr, x.activeClients], [3500, 2]);
  assert.deepEqual([x.cur.newClients, x.cur.lost, x.cur.net, x.cur.newNames, x.cur.lostNames], [1, 1, 0, ['B'], ['C']]);
  assert.equal(x.cur.activeAtStart, 2, 'A and C were active on Nov 1 (E has no end date: left out)');
  assert.equal(x.cur.churnRate, 50, '1 lost of 2 in one month');
  assert.deepEqual([x.prev.lost, x.prev.activeAtStart, x.prev.churnRate], [1, 3, 33.3], 'October: D left, of A, C, D');
  assert.equal(x.avgLtv, Math.round((22000 + 1000 + 7000 + 30000) / 4));
  const months = [monthsBetween('2026-01-10', NOW)!, monthsBetween('2026-11-05', NOW)!, monthsBetween('2026-05-01', '2026-11-25')!, monthsBetween('2025-06-01', '2026-10-15')!, monthsBetween('2025-02-01', NOW)!];
  assert.equal(x.avgRetentionMonths, Math.round((months.reduce((a, b) => a + b, 0) / 5) * 10) / 10);
  assert.deepEqual(x.noEndDate, ['E']);
  const q = rangeNumbers(book, { from: '2026-05-28', to: '2026-11-28', label: '6m' });
  assert.deepEqual([q.newClients, q.lost, q.net, q.activeAtStart], [1, 2, -1, 3]);
  assert.equal(q.churnRate, Math.round((2 / 3 / 6) * 1000) / 10, 'per month over 6 months');
  assert.equal(rangeNumbers([], { from: '2026-11-01', to: '2026-11-28', label: '' }).churnRate, null);
});

// ---------- results ----------
const ov = (clientId: string, period: string, sent: number, interested: number, meetings: number, updatedAt = '2026-11-27T07:00:00.000Z'): OverviewRow => ({ clientId, period, sent, replies: Math.round(sent / 50), interested, meetings, updatedAt });
test('results: emails per meeting, per positive reply, interested → booked; stale workspaces count as nothing sent', () => {
  const rows = [ov('66', 'Last 30 days', 71893, 277, 11), ov('65', 'Last 30 days', 4000, 10, 2, '2026-09-18T06:00:35.000Z'), ov('66', 'All time', 344601, 1037, 59), ov('65', 'All time', 74044, 108, 13, '2026-08-26T06:00:27.000Z')];
  const r = resultsFor(rows, ['65', '66'], '30', NOW)!;
  assert.deepEqual([r.sent, r.interested, r.meetings, r.emailsPerMeeting, r.emailsPerPositive, r.interestedToBooked, r.stale], [71893, 277, 11, 6536, 260, 0.04, false]);
  assert.equal(resultsFor(rows, ['65', '66'], 'all', NOW)!.meetings, 72, 'all time keeps every row');
  const z = resultsFor([ov('9', 'Last 30 days', 500, 0, 0)], ['9'], '30', NOW)!;
  assert.deepEqual([z.emailsPerMeeting, z.emailsPerPositive, z.interestedToBooked], [null, null, null], 'no divide by zero');
  const st = resultsFor([ov('9', 'Last 30 days', 500, 5, 1, '2026-10-01T00:00:00Z')], ['9'], '30', NOW)!;
  assert.equal(st.stale, true, 'every row stale: shown, flagged');
  assert.equal(resultsFor(rows, ['80'], '30', NOW), null);
});

test('bookings: WON / Booked Meeting rows with no booking date count on their latest reply (the Twenty West 0)', () => {
  const e = (f: Record<string, unknown>) => ({ id: 'x', fields: { 'Latest Reply Time': '2026-11-24T16:04:02.000Z', ...f } });
  assert.equal(bookedAt(e({ 'Opportunity Status': 'WON', 'Pipeline Stage': 'Booked Meeting' })), '2026-11-24T16:04:02.000Z');
  assert.equal(bookedAt(e({ 'Pipeline Stage': 'Completed Meeting' })), '2026-11-24T16:04:02.000Z');
  assert.equal(bookedAt(e({ 'Meeting Booked At': '2026-11-20T10:00:00.000Z', 'Opportunity Status': 'WON' })), '2026-11-20T10:00:00.000Z', 'a real date wins');
  assert.equal(bookedAt(e({ 'Lead Status': 'Interested' })), '', 'interested is not booked');
});

// ---------- health ----------
test('health: Safe / At risk / Needs attention on the promised KPI; UNKNOWN without one; Problem → Decision → support', () => {
  const base = { active: true, kpi: 10, meetings30: 10, interested30: 30, sent30: 20000, activeCampaigns: 2, startDate: '2026-01-01' };
  assert.equal(healthOf(base, NOW).health, 'safe');
  assert.equal(healthOf({ ...base, meetings30: 6 }, NOW).health, 'at_risk');
  const bad = healthOf({ ...base, meetings30: 2, interested30: 40 }, NOW);
  assert.equal(bad.health, 'attention');
  assert.deepEqual(bad.insight, { problem: 'Under KPI: 2 of 10 meetings a month (KPI).', decision: 'Echo: turn more interested replies into booked calls.', support: '30 days: 20,000 emails sent, 40 interested, 5% booked, 1 meeting per 10,000 emails.' });
  assert.equal(healthOf({ ...base, meetings30: 2, interested30: 3, sent30: 2000 }, NOW).insight!.decision, 'Atlas: send more (add inboxes or a new list).');
  assert.equal(healthOf({ ...base, kpi: null }, NOW).health, 'unknown');
  assert.equal(healthOf({ ...base, activeCampaigns: 0 }, NOW).health, 'attention');
  assert.equal(healthOf({ ...base, active: false }, NOW).health, 'inactive');
  assert.equal(healthOf({ ...base, meetings30: 3, startDate: '2026-11-17' }, NOW).health, 'at_risk', '10 days in: 3 of a pro-rated 3.4 = 89%');
  assert.equal(healthOf({ ...base, meetings30: 4, startDate: '2026-11-17' }, NOW).health, 'safe', 'a new client is judged on the days it has had');
});

test('KPI: the client field, then the onboarding answer, then internal; first number of a text', () => {
  assert.equal(kpiNumber(['10–20 qualified appointments per month']), 10);
  assert.equal(kpiNumber('abc'), null);
  assert.deepEqual(kpiOf([{ id: 'a', fields: { 'Calls Booked KPI (from Onboarding)': ['15'], 'Calls Booked KPI (Internal)': 8 } }]), { kpi: 15, source: 'onboarding form' });
  assert.deepEqual(kpiOf([{ id: 'a', fields: { 'Calls Booked KPI (Client)': 40, 'Calls Booked KPI (from Onboarding)': ['15'] } }]), { kpi: 40, source: 'client KPI (Airtable)' });
  assert.deepEqual(kpiOf([{ id: 'a', fields: {} }]), { kpi: null, source: 'UNKNOWN' });
});

// ---------- P/L sheet ----------
const SHEET: string[][] = [
  ['Home', 'x', '', '', '', '', 'DATE', 'Invoice Date', 'Needs Invoice', 'Date', 'Clients (Renewing)', 'Monthly', 'Processor', 'Rev Share / Calls Booked', '', '', 'DATE', 'DUE DATE', 'DEBT', 'Statement', 'Balance', 'Minimum', 'Available To Spend', 'Interest Percentages'],
  ['9', 'Personal line', '$ 1.00', '', '', '', '1', '', '', '1st', 'Acme Co', '$1,000.00', 'COMMAS', '', '', '', '10', '12/10/2026', 'Card One', '$100.00', '$110.50', '$40.00', '$500.00', '20%'],
  ['', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '8', '12/8/2026', 'Card Two', '$1,000.00', '-$5.00', '$0.00', '-$1,664.26', '25%'],
  ['', '', '', '', '', '', '', '', '', '8th', 'Acme Co (Assets)', '$500.00', 'COMMAS', '$75', '', '', '', '', '', ''],
  ['', '', '', '', '', '', '', '', '', '30th', 'Scroll Stop', '', 'WISE', '$80', '', '', '', '', '', ''],
  ['', '', '', '', '', '', '', '', '', '', 'Systems', '', 'FANBASIS', '', '', '', '', '', 'CC', '$1,100.00'],
  ['', '', '', '', '', '', '', '', '', '', 'New Lead Inc', '', 'COMMAS', '$900', ''],
  ['', '', '', '', '', '', '', '', '', '', 'Revenue', '$1,500.00'],
];
test('P/L sheet: billing lines and card debts found by their headers; personal lines never read out', () => {
  assert.equal(money(' $ 1,234.50 '), 1234.5);
  assert.equal(money('-$1,664.26'), -1664.26);
  assert.equal(money(''), null);
  const p = parsePnlSheet(SHEET);
  assert.deepEqual(p.billing.map((b) => [b.name, b.monthly, b.perCall, b.day, b.processor]), [['Acme Co', 1000, 0, '1st', 'COMMAS'], ['Acme Co (Assets)', 500, 75, '8th', 'COMMAS'], ['Scroll Stop', 0, 80, '30th', 'WISE'], ['New Lead Inc', 0, 900, '', 'COMMAS']], 'no "Systems" (no amount), stops at Revenue');
  assert.deepEqual(p.cards.map((c) => [c.card, c.dueDate, c.statement, c.balance, c.minimum, c.available]), [['Card One', '12/10/2026', 100, 110.5, 40, 500], ['Card Two', '12/8/2026', 1000, -5, 0, -1664.26]], 'stops at the total row');
  assert.deepEqual(p.cardTotals, { statement: 1100, balance: 105.5, minimum: 40 });
  assert.ok(!JSON.stringify(p).includes('Personal line'), 'only the two owner blocks');
  const m = billingByClient(p.billing, ['acmeco', 'globalmediagroupltd'], clientKey, SHEET_ALIASES);
  assert.deepEqual(m.matched.get('acmeco'), [{ label: 'Monthly', monthly: 1000, perCall: 0 }, { label: 'Assets', monthly: 500, perCall: 75 }]);
  assert.deepEqual(m.matched.get('globalmediagroupltd'), [{ label: 'Per call', monthly: 0, perCall: 80 }], 'Scroll Stop = Global Media Group');
  assert.deepEqual(m.unmatched.map((x) => x.name), ['New Lead Inc']);
  assert.deepEqual(parsePnlSheet([['nothing here']]), { billing: [], cards: [], cardTotals: { statement: 0, balance: 0, minimum: 0 } });
});

test('call feedback and onboarding: per client; secrets never; members miss the money answers', () => {
  const rows = [
    { id: 'a', fields: { fldXNEJcG9LUnR73H: 'Qualified', fld1KGADNp3pX2mLi: 5, fldiZYJuFW6Sa4wN5: [66], fldKRdKwzeOHvYM7n: '2026-11-20' } },
    { id: 'b', fields: { fldXNEJcG9LUnR73H: 'Unqualified', fld1KGADNp3pX2mLi: 2, fldiZYJuFW6Sa4wN5: [66], fldKRdKwzeOHvYM7n: '2026-11-21' } },
    { id: 'c', fields: { fldXNEJcG9LUnR73H: "(Internal) Don't Track This Call", fldiZYJuFW6Sa4wN5: [66] } },
    { id: 'd', fields: { fldXNEJcG9LUnR73H: 'Qualified', fldiZYJuFW6Sa4wN5: [7] } },
  ];
  const f = feedbackFor(rows, ['66']);
  assert.deepEqual([f.calls, f.qualified, f.unqualified, f.noShow, f.rated, f.avgStars, f.recent[0].status], [2, 1, 1, 0, 2, 3.5, 'Unqualified']);
  const fields = { fld1AjmO7gSRAZTnw: 'Jewelry', fldKCtXxGgpSdXb2D: '$90k', fld30MCMI88q4c3VE: 'pw', fldRvFwsA7NtTwG1e: 'totp', fldVSYmIVrxbJrEIo: 'ci' };
  assert.deepEqual(onboardingOut(fields, true), [{ label: 'What they sell', text: 'Jewelry' }, { label: 'Their monthly revenue now', text: '$90k' }]);
  assert.deepEqual(onboardingOut(fields, false), [{ label: 'What they sell', text: 'Jewelry' }]);
  assert.deepEqual(onboardingOut(null, true), []);
});

// ---------- API: owner money from Xero + the P/L sheet; members get nothing ----------
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
const sheetCalls: string[] = [];
const sheets = { async tab(id: string, tab: string) { sheetCalls.push(`${id}/${tab}`); return SHEET; } };
const xero = {
  async get(path: string, params: Record<string, string | number> = {}) {
    if (path === 'Reports/ProfitAndLoss') return { Reports: [{ Rows: [{ RowType: 'Section', Title: 'Income', Rows: [{ RowType: 'SummaryRow', Cells: [{ Value: 'Total' }, { Value: String(params.fromDate) === '2026-11-01' ? '7100' : '6900' }] }] }, { RowType: 'Section', Title: 'Operating Expenses', Rows: [{ RowType: 'SummaryRow', Cells: [{ Value: 'Total' }, { Value: '3100' }] }] }] }] };
    throw new Error(`unexpected ${path}`);
  },
  async pages() { return [{ Type: 'ACCREC', Contact: { Name: 'Acme Co LLC' }, AmountDue: 1500, DueDateString: '2026-12-01T00:00:00' }, { Type: 'ACCREC', Contact: { Name: 'Acme Co' }, AmountDue: 500, DueDateString: '2026-11-01T00:00:00' }, { Type: 'ACCPAY', Contact: { Name: 'Tool' }, AmountDue: 99 }]; },
};
function cfg(): Config { return { ...loadConfig({ ENGINE_SECRET: 'x'.repeat(40), DATABASE_URL: url ?? 'postgres://x', HQ_SESSION_SECRET: 's'.repeat(40), HQ_HOST: 'hq.test.local' } as NodeJS.ProcessEnv), airtableApiKey: undefined }; }
function call(method: string, p: string, cookie?: string, extra: Record<string, string> = {}): Promise<{ status: number; body: any; text: string; headers: http.IncomingHttpHeaders }> {
  return new Promise((resolve, reject) => {
    const host = `127.0.0.1:${port}`;
    const headers: Record<string, string> = { host, ...(cookie ? { cookie } : {}), ...extra };
    const req = http.request({ host: '127.0.0.1', port, method, path: p, headers }, (res) => {
      const chunks: Buffer[] = []; res.on('data', (c) => chunks.push(c));
      res.on('end', () => { const text = Buffer.concat(chunks).toString('utf8'); let body: any = null; try { body = JSON.parse(text); } catch { /* */ } resolve({ status: res.statusCode ?? 0, body, text, headers: res.headers }); });
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
  _resetClientsCache(); _resetFinanceCache(); sheetCalls.length = 0;
  const today = new Date().toISOString();
  tables = {
    tblcjRBGJEWh5KgOt: {
      recACME0000000001: { Name: 'Acme Co', Status: 'Active', 'Client Type': 'Paying Client', 'Monthly Fee': 900, ID: 5, 'Client Start Date': '2026-06-01', 'Actual Lifetime Revenue': 1000, 'Outstanding Receivables': 2000 },
      recGMG00000000001: { Name: 'GLOBALMEDIAGROUP LTD', Status: 'Active', 'Client Type': 'Paying Client', 'Monthly Fee': 2900, 'Billing Rate': 280, ID: 42, 'Client Start Date': '2025-07-30' },
      recOLD00000000001: { Name: 'Old Client', Status: 'Inactive', 'Client Type': 'Paying Client', 'Monthly Fee': 1000, ID: 9, 'Client Start Date': '2026-01-01', 'Client End Date': `${today.slice(0, 8)}02` },
    },
    tblZkEi6qylqfOj9Z: { recOV1: { 'Client ID': '42', 'Date Period': 'All time', 'Emails Sent': 400000, Interested: 900, 'Meetings Booked': 79, 'Updated At': today } },
    tblAVAA6uBPaMj28P: { recC1: { Name: 'Acme - X', Client: ['recACME0000000001'], 'Campaign Status': 'Active', Progress: 0.2 } },
  };
  await db.query('TRUNCATE hq_users, hq_sessions, hq_login_attempts RESTART IDENTITY CASCADE');
  await upsertUser(db, 'alex@dulcy.io', 'owner', PW, 'Alex');
  await upsertUser(db, 'josh@dulcy.io', 'member', 'josh long password 1', 'Josh');
});

test('owner: deals from the P/L sheet, money from Xero (coming up vs late), agency numbers, card debts', { skip }, async () => {
  const c = await login('alex@dulcy.io', PW);
  const r = await call('GET', '/hq/api/clients', c);
  assert.equal(r.status, 200, r.text);
  assert.deepEqual(sheetCalls, ['1nUf28kpRs2olqUIIfdrVdyH1q67hRT-zhmaD9UL3knM/goal'], 'the P/L sheet, read once (cached)');
  const acme = r.body.clients.find((x: any) => x.name === 'Acme Co');
  assert.deepEqual([acme.money.fee, acme.money.perCall, acme.money.dealType, acme.money.dealSource], [1500, 75, 'both', 'Dulcy Media P/L sheet']);
  assert.deepEqual(acme.money.invoices.map((i: any) => [i.amount, i.late]), [[500, true], [1500, false]], 'Xero invoices by contact name: late first, then coming up (not due yet)');
  assert.equal(acme.money.receivables, 2000);
  assert.equal(acme.money.invoicesSource, 'Xero open invoices');
  const gmg = r.body.clients.find((x: any) => /GLOBALMEDIA/.test(x.name));
  assert.deepEqual([gmg.money.fee, gmg.money.perCall, gmg.money.ltv], [0, 80, 80 * 79], 'Scroll Stop line: pay per call only; LTV = calls booked x rate');
  assert.equal(r.body.summary.mrr, 1500, 'MRR = retainers of active clients only');

  const num = await call('GET', '/hq/api/clients/numbers?period=this-month', c);
  assert.equal(num.status, 200, num.text);
  assert.deepEqual([num.body.numbers.mrr, num.body.numbers.activeClients, num.body.numbers.cur.lost, num.body.numbers.cur.lostNames], [1500, 2, 1, ['Old Client']]);
  assert.equal((await call('GET', '/hq/api/clients/numbers?period=nonsense', c)).body.numbers.period, 'this-month');

  const fin = await call('GET', '/hq/api/clients/finance', c);
  assert.equal(fin.status, 200, fin.text);
  assert.deepEqual([fin.body.xero.thisMonth.income, fin.body.xero.lastMonth.income, fin.body.xero.thisMonth.costs], [7100, 6900, 3100]);
  assert.deepEqual(fin.body.cards.map((x: any) => x.card), ['Card One', 'Card Two']);
  assert.equal(fin.body.cardTotals.balance, 105.5);
  assert.deepEqual(fin.body.notInAirtable, ['New Lead Inc'], 'a P/L line with no Airtable client is named');
  assert.deepEqual(fin.body.errors, []);
  assert.ok(!/Personal line/.test(fin.text));
});

for (const who of ['member', 'owner viewing as member'] as const) test(`${who}: no money anywhere, including the P/L sheet and Xero; 403 on numbers and finance`, { skip }, async () => {
  const c = who === 'member' ? await login('josh@dulcy.io', 'josh long password 1') : await login('alex@dulcy.io', PW);
  const view: Record<string, string> = who === 'member' ? {} : { 'x-hq-view': 'member' };
  const call0 = call;
  const call1 = (m: string, p: string, ck?: string) => call0(m, p, ck, view);
  for (const p of ['/hq/api/clients?all=1', '/hq/api/clients/recACME0000000001', '/hq/api/clients/recGMG00000000001']) {
    const r = await call1('GET', p, c);
    assert.equal(r.status, 200, r.text);
    const hit = /"money"|"mrr"|"roi"|"total"|1,?500|2,?900|"fee"|"perCall"|\$|Card One|invoice/i.exec(r.text);
    assert.equal(hit, null, `no money in ${p}: ${hit ? r.text.slice(Math.max(0, hit.index - 100), hit.index + 40) : ''}`);
  }
  assert.deepEqual(sheetCalls, [], 'the P/L sheet is never even read for a member');
  for (const p of ['/hq/api/clients/numbers', '/hq/api/clients/finance']) {
    const r = await call1('GET', p, c);
    assert.equal(r.status, 403, p);
    assert.ok(!/Card|7100|1500/.test(r.text));
  }
});

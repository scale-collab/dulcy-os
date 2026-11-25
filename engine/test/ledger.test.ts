// Ledger: Xero reports parsed to exact numbers, the Saturday report, the purchase yes/no, and the
// one-time Xero login + token refresh (refresh token rotates; stored in Postgres).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { createPool, migrate, type Db } from '../src/db/pool.js';
import { loadConfig, type Config } from '../src/config.js';
import { parseBankSummary, parsePnl, writeLedgerReport, parseAsk, isAsk, verdict, vendorHits, nextPayout, opex, pickAsks, xeroDate, type LedgerData } from '../src/agents/ledger.js';
import { xeroAuthorizeUrl, xeroFinishLogin, createXeroClient } from '../src/providers/xero.js';
import { ledgerTick } from '../src/scheduler.js';

const url = process.env.TEST_DATABASE_URL;
const skip = !url ? 'TEST_DATABASE_URL not set' : false;

const cell = (v: string | number) => ({ Value: String(v) });
function bankSummary(rows: [string, number, number, number, number][]) {
  return { Reports: [{ ReportID: 'BankSummary', Rows: [
    { RowType: 'Header', Cells: ['Bank Accounts', 'Opening Balance', 'Cash Received', 'Cash Spent', 'Closing Balance'].map(cell) },
    { RowType: 'Section', Title: '', Rows: [...rows.map((r) => ({ RowType: 'Row', Cells: r.map(cell) })), { RowType: 'SummaryRow', Cells: ['Total', 0, 0, 0, 0].map(cell) }] },
  ] }] };
}
const MONTH = bankSummary([
  ['Entry Checking', 0, 10000, 9000, 1000],
  ['OPEX', 500, 4000, 3000, 1500],
  ['Owners Comp', 0, 3000, 0, 3000],
  ['Tax Account', 0, 1500, 0, 1500],
  ['Treasury Savings', 2000, 500, 0, 2500],   // got 5%, target 10%
  ['Quarterly Profit', 0, 500, 0, 500],
  ['High Yield Savings Acct', 8000, 0, 0, 8000],
  ['Business Platinum Card®', -200, 0, 1800, -2000],
  ['Chase Ink Cash Business', 0, 0, 300, -300],
  ['Fanbasis Holding', 0, 9000, 9000, 0],
]);
const PNL = { Reports: [{ Rows: [
  { RowType: 'Header', Cells: [cell(''), cell('Nov 2026')] },
  { RowType: 'Section', Title: 'Income', Rows: [{ RowType: 'Row', Cells: [cell('Done-For-You'), cell('10,000.00')] }, { RowType: 'SummaryRow', Cells: [cell('Total Income'), cell('10000.00')] }] },
  { RowType: 'Section', Title: 'Less Cost of Sales', Rows: [{ RowType: 'Row', Cells: [cell('Email Accounts'), cell('800')] }, { RowType: 'SummaryRow', Cells: [cell('Total Cost of Sales'), cell('800')] }] },
  { RowType: 'Section', Title: 'Less Operating Expenses', Rows: [{ RowType: 'Row', Cells: [cell('Software'), cell('1700')] }, { RowType: 'Row', Cells: [cell('Freelancers'), cell('500')] }, { RowType: 'SummaryRow', Cells: [cell('Total Operating Expenses'), cell('2200')] }] },
  { RowType: 'Section', Title: '', Rows: [{ RowType: 'Row', Cells: [cell('Net Profit'), cell('7000')] }] },
] }] };
const now = new Date('2026-11-28T15:00:00Z'); // Sat 10:00 AM ET

test('Xero reports are read by column title; P&L income and costs are exact', () => {
  const b = parseBankSummary(MONTH);
  assert.equal(b.length, 10);
  assert.deepEqual(b[0], { name: 'Entry Checking', opening: 0, received: 10000, spent: 9000, closing: 1000 });
  const p = parsePnl(PNL);
  assert.equal(p.income, 10000); assert.equal(p.costs, 3000);
  assert.deepEqual(p.lines.map((l) => l.name), ['Email Accounts', 'Software', 'Freelancers']);
  assert.deepEqual(opex({ month: b, pnl: p }), { cap: 4000, spent: 3000 });
  assert.equal(xeroDate('/Date(1764288000000+0000)/'), 1764288000000);
  assert.equal(nextPayout(new Date('2026-11-25T15:00:00Z')), '2026-11-28');
  assert.equal(nextPayout(new Date('2026-11-29T15:00:00Z')), '2026-12-14');
  assert.equal(nextPayout(new Date('2026-12-30T15:00:00Z')), '2027-01-14');
});

test('the Saturday report: buckets, split check, spend vs cap, late invoices, bills, books, next payout, top 3', () => {
  const d: LedgerData = {
    now, month: parseBankSummary(MONTH), pnl: parsePnl(PNL), errors: [],
    week: parseBankSummary(bankSummary([['Entry Checking', 0, 2500, 2500, 0], ['Fanbasis Holding', 0, 2000, 2000, 0], ['Pay Pal (USD)', 0, 500, 500, 0]])),
    receivables: [{ contact: 'Twenty West', due: 2000, daysLate: 12 }, { contact: 'Twenty West', due: 1000, daysLate: 9 }, { contact: 'Lead Flo', due: 900, daysLate: 3 }],
    bills: [{ contact: 'Cheap Inboxes', due: 120, daysUntil: 2 }, { contact: 'Far Away', due: 50, daysUntil: 40 }],
    books: { unreconciled: 4, lastReconciled: '2026-11-21' },
  };
  const r = writeLedgerReport(d);
  assert.match(r, /\*Cash:\* Entry \$1,000 · OPEX \$1,500 · Owner \$3,000 · Tax \$1,500 · Treasury \$2,500 · Profit \$500 · HYSA \$8,000/);
  assert.match(r, /\*In:\* this week \$2,500 \(Commas\/Fanbasis \$2,000, PayPal \$500\) · month so far \$10,000/);
  assert.match(r, /⚠️ Treasury got 5% \(target 10%\)/);
  assert.doesNotMatch(r, /OPEX got/, 'OPEX at 40% is on target');
  assert.match(r, /\*Spend this month:\* \$3,000 of \$4,000 OPEX cap \(75%\) · top: Software \$1,700, Email Accounts \$800, Freelancers \$500/);
  assert.match(r, /\*Owed to us:\* Twenty West \$3,000 \(12 days late\)$/m);
  assert.match(r, /Cheap Inboxes \$120 \(in 2 days\)/); assert.doesNotMatch(r, /Far Away/);
  assert.match(r, /4 lines to reconcile \(last 30 days\) · last reconciled 2026-11-21/);
  assert.match(r, /\*Next payout \(2026-11-28\):\* owner \$3,000 · cards \$2,300 · tax→HYSA \$1,500/);
  assert.match(r, /1\. Fix the split: Treasury is off target\./);
  assert.match(r, /Chase Twenty West for \$3,000/);
  const neg = writeLedgerReport({ now, errors: [], month: parseBankSummary(bankSummary([['Tax Account', 0, 0, 298, -298]])) });
  assert.match(neg, /tax→HYSA nothing to move \(Xero shows -\$298: check the Tax account is reconciled\)/);
  const broken = writeLedgerReport({ now, errors: ['the Bank Summary (HTTP 403)'] });
  assert.match(broken, /couldn't read the Xero Bank Summary/);
  assert.match(broken, /_couldn't read the Bank Summary \(HTTP 403\)_/);
});

test('purchase yes/no: fits, yes-but, over the cap, never Tax/Profit, Treasury is Alex\'s call, no price', () => {
  const money = { cap: 4000, spent: 3000 };
  assert.ok(isAsk('Should I buy Clay $349/mo?')); assert.ok(!isAsk('nice work on the $500 deal')); assert.ok(isAsk('ledger: is this ok'));
  assert.deepEqual(parseAsk('Should I buy Clay $349/mo?'), { amount: 349, recurring: 'monthly', from: undefined });
  assert.equal(parseAsk('pay invoice $1,250.50').amount, 1250.5);
  assert.equal(parseAsk('upgrade to $2k a year').recurring, 'yearly');
  assert.match(verdict(parseAsk('buy a $49 tool'), money, []), /^✅ Yes\n\$49 one-time fits.*\nOPEX room this month: \$1,000 → \$951 after this$/s);
  assert.match(verdict(parseAsk('Clay $500/mo subscription?'), money, []), /^⚠️ Yes, but\n\$500\/month: it adds \$500 every month \(13% of this month's OPEX cap\)/);
  assert.match(verdict(parseAsk('buy $1,500 course'), money, []), /^❌ No\n\$1,500 one-time puts this month \$500 over the OPEX cap/);
  assert.match(verdict(parseAsk('pay $200 from tax account'), money, []), /^❌ No\nNever pay from the Tax account/);
  assert.match(verdict(parseAsk('buy $200 using treasury'), money, []), /^❌ No, Alex's call/);
  assert.match(verdict(parseAsk('should I buy this tool'), money, []), /^❓ I could not find a price/);
  assert.match(verdict(parseAsk('buy $49 tool'), undefined, []), /^⚠️ UNKNOWN/);
  const hits = vendorHits('Should I buy Instantly $97/mo?', [{ contact: 'Instantly.ai', total: 291 }, { contact: 'Slack Technologies', total: 50 }]);
  assert.deepEqual(hits.map((h) => h.contact), []);
  const hits2 = vendorHits('renew clay $349/mo?', [{ contact: 'Clay Labs Inc', total: 698 }, { contact: 'The Software Co', total: 10 }]);
  assert.deepEqual(hits2.map((h) => h.contact), ['Clay Labs Inc']);
  assert.match(verdict(parseAsk('renew clay $349'), money, hits2), /you already pay Clay Labs Inc \(\$698 in the last 90 days\)/);
});

test('only Alex/Josh top-level asks, not bots, not thread replies, not already answered', () => {
  const msgs = [
    { ts: '1.1', user: 'U070Z26377C', text: 'Should I buy Clay $349/mo?', bot: false, files: [] },
    { ts: '1.2', user: 'U070Z26377C', text: 'reply in thread $50 tool', threadTs: '1.1', bot: false, files: [] },
    { ts: '1.3', user: 'B1', text: 'buy 1 new .com domain ($9.99)', bot: true, files: [] },
    { ts: '1.4', user: 'UOTHER', text: 'buy $10 tool', bot: false, files: [] },
    { ts: '1.5', user: 'U070Z26377C', text: 'pay invoice $300', bot: false, files: [] },
  ];
  assert.deepEqual(pickAsks(msgs, ['U070Z26377C'], new Set(['1.5'])).map((m) => m.ts), ['1.1']);
});

test('timer: Saturday after the report hour only; off by default', async () => {
  const cfg = loadConfig({ ENGINE_SECRET: 'x'.repeat(40), DATABASE_URL: 'postgres://x' } as NodeJS.ProcessEnv);
  assert.equal(cfg.ledgerOn, false);
  assert.equal(await ledgerTick(null as any, cfg, now), 0, 'off');
  assert.equal(await ledgerTick(null as any, { ...cfg, ledgerOn: true }, new Date('2026-11-27T15:00:00Z')), 0, 'Friday, no check timer');
  assert.equal(await ledgerTick(null as any, { ...cfg, ledgerOn: true, ledgerReportHour: 11 }, now), 0, 'Saturday before 11 AM ET');
});

// ---- Xero login + refresh against a fake Xero ----
let db: Db, server: http.Server, base = '';
const seen: { refresh: string[]; tenantHeader: string[] } = { refresh: [], tenantHeader: [] };
before(async () => {
  let n = 0;
  server = http.createServer((req, res) => {
    let raw = ''; req.on('data', (c) => (raw += c));
    req.on('end', () => {
      res.setHeader('content-type', 'application/json');
      if (req.url === '/connect/token') {
        const b = new URLSearchParams(raw);
        if (b.get('grant_type') === 'refresh_token') seen.refresh.push(String(b.get('refresh_token')));
        n++;
        return res.end(JSON.stringify({ access_token: `access${n}`, refresh_token: `refresh${n}`, expires_in: b.get('grant_type') === 'authorization_code' ? 1 : 1800 }));
      }
      if (req.url === '/connections') return res.end(JSON.stringify([{ tenantId: 't-other', tenantName: 'Demo Company (US)', tenantType: 'ORGANISATION' }, { tenantId: 't-dulcy', tenantName: 'Dulcy Media', tenantType: 'ORGANISATION' }]));
      if (req.url?.startsWith('/api.xro/2.0/Reports/BankSummary')) { seen.tenantHeader.push(String(req.headers['xero-tenant-id'])); return res.end(JSON.stringify(MONTH)); }
      res.statusCode = 404; res.end('{}');
    });
  });
  await new Promise<void>((r) => server.listen(0, r));
  base = `http://127.0.0.1:${(server.address() as any).port}`;
  if (!skip) { db = createPool(url!); await migrate(db); await db.query(`DELETE FROM oauth_tokens WHERE provider='xero'`); }
});
after(async () => { server.close(); if (!skip) await db.end(); });

test('one-time login picks Dulcy Media, then the token refreshes and the new refresh token is kept', { skip }, async () => {
  const cfg: Config = { ...loadConfig({ ENGINE_SECRET: 'x'.repeat(40), DATABASE_URL: url! } as NodeJS.ProcessEnv), xeroClientId: 'id', xeroClientSecret: 'secret', xeroIdentityUrl: base, xeroApiUrl: base };
  const link = new URL(await xeroAuthorizeUrl(db, cfg));
  assert.equal(link.searchParams.get('redirect_uri'), 'http://localhost:8765/callback');
  assert.match(String(link.searchParams.get('scope')), /^offline_access .*accounting\.reports\.banksummary\.read/);
  assert.doesNotMatch(String(link.searchParams.get('scope')), /accounting\.transactions\b|\.write|accounting\.reports\.read/, 'read-only granular scopes');
  await assert.rejects(xeroFinishLogin(db, cfg, 'http://localhost:8765/callback?code=abc&state=wrong'), /does not match/);
  const r = await xeroFinishLogin(db, cfg, `http://localhost:8765/callback?code=abc&state=${link.searchParams.get('state')}`);
  assert.equal(r.tenant, 'Dulcy Media'); assert.deepEqual(r.others, ['Demo Company (US)']);
  // The first token "expires" at once (expires_in 1), so the first call refreshes with refresh1.
  const x = createXeroClient(db, cfg);
  const rep = parseBankSummary(await x.get('Reports/BankSummary', { fromDate: '2026-11-01', toDate: '2026-11-28' }));
  assert.equal(rep[0].name, 'Entry Checking');
  assert.deepEqual(seen.refresh, ['refresh1']);
  assert.deepEqual(seen.tenantHeader, ['t-dulcy']);
  const row = (await db.query(`SELECT refresh_token, tenant_name FROM oauth_tokens WHERE provider='xero'`)).rows[0];
  assert.equal(row.refresh_token, 'refresh2', 'the rotated refresh token is saved');
  // A second call within the token's life does not refresh again.
  await x.get('Reports/BankSummary');
  assert.deepEqual(seen.refresh, ['refresh1']);
});

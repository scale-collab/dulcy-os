// Ledger reconciliation prep: each Mercury line gets exactly the Xero entry it needs, nothing twice,
// and the unclear ones are asked about. Plus the live Mercury numbers in the Saturday report.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { planPrep, vendorCodesFrom, existingFrom, sameName } from '../src/agents/ledgerPrep.js';
import { liveFrom, writeLedgerReport, opex } from '../src/agents/ledger.js';
import { plainName, type MercuryTxn } from '../src/providers/mercury.js';

const banks = ['Entry Checking', 'OPEX', 'Owners Comp', 'Tax Account', 'Treasury Savings', 'Quarterly Profit', 'Fanbasis Holding', 'Pay Pal (USD)', 'Business Gold Card'].map((name, i) => ({ id: `acc${i}`, name }));
const id = (n: string) => banks.find((b) => b.name === n)!.id;
let k = 0;
const tx = (accountName: string, amount: number, counterparty: string, kind = 'other', postedAt = '2026-11-24T13:37:00Z'): MercuryTxn =>
  ({ id: `m${++k}`, accountId: 'x', accountName, amount, counterparty: plainName(counterparty), kind, status: 'sent', postedAt, createdAt: postedAt, description: '' });

test('Mercury names lose the ••1234 ending', () => {
  assert.equal(plainName('Entry Checking ••6964'), 'Entry Checking');
  assert.equal(plainName('Chase - Checking ••3723'), 'Chase - Checking');
  assert.equal(plainName('OPEX'), 'OPEX');
  assert.ok(sameName('Human Marketing LLC', 'Human Marketing')); assert.ok(!sameName('Wise', 'Otherwise Co'));
});

test('the plan: bucket transfers, processor payouts, invoice payments, coded spend; asks about the rest', () => {
  const txns = [
    tx('Entry Checking', -240, 'OPEX ••5486', 'internalTransfer'), tx('OPEX', 240, 'Entry Checking ••6964', 'internalTransfer'),
    tx('Entry Checking', 1517, 'Commas'),
    tx('Entry Checking', 949.61, 'PayPal'),
    tx('Entry Checking', 600, 'Human Marketing'), tx('Entry Checking', 250, 'Human Marketing'),
    tx('Entry Checking', 99, 'Mystery Co'),
    tx('OPEX', -356.74, 'AMEX EPAYMENT'),
    tx('OPEX', -225, 'Wise Inc'),
    tx('OPEX', -49, 'Brand New Vendor'),
    tx('Tax Account', -10, 'Somewhere ••1111', 'internalTransfer'),
  ];
  const plan = planPrep({
    txns, banks, existing: [], done: new Set(),
    invoices: [{ id: 'inv1', contact: 'Human Marketing', due: 600 }, { id: 'inv2', contact: 'Human Marketing', due: 250 }],
    vendorCodes: new Map([['Wise Inc.', '6690']]),
  });
  const sum = plan.map((a) => a.kind === 'transfer' ? `transfer ${a.from.name}→${a.to.name} ${a.amount}` : a.kind === 'payment' ? `payment ${a.invoice.id} ${a.amount}` : a.kind === 'spend' ? `spend ${a.contact} ${a.amount} ${a.code}` : a.kind === 'ask' ? `ask ${a.txn.counterparty}: ${a.why}` : 'exists');
  assert.deepEqual(sum, [
    'transfer Entry Checking→OPEX 240',
    'transfer Fanbasis Holding→Entry Checking 1517',
    'transfer Pay Pal (USD)→Entry Checking 949.61',
    'payment inv1 600',
    'payment inv2 250',
    'ask Mystery Co: money in from "Mystery Co" with no matching invoice',
    'ask AMEX EPAYMENT: AmEx payment: which card (Platinum, Gold or Blue Business Plus)?',
    'spend Wise Inc 225 6690',
    'ask Brand New Vendor: new payee "Brand New Vendor": which account code?',
    'ask Somewhere: transfer to "Somewhere", which has no Xero bank account',
  ]);
});

test('nothing twice: already in Xero (±3 days) or handled before → no new entry', () => {
  const a = tx('Entry Checking', -100, 'OPEX', 'internalTransfer', '2026-11-24T13:00:00Z');
  const b = tx('Entry Checking', -100, 'OPEX', 'internalTransfer', '2026-11-24T13:00:01Z'); // same amount, same day: a second, separate transfer
  const c = tx('Entry Checking', 1517, 'Commas', 'other', '2026-11-10T13:00:00Z');
  const d = tx('OPEX', -225, 'Wise Inc');
  const existing = existingFrom(
    [{ Type: 'RECEIVE-TRANSFER', Status: 'AUTHORISED', BankAccount: { AccountID: id('Entry Checking') }, Total: 1517, DateString: '2026-11-11T00:00:00' }],
    [{ FromBankAccount: { AccountID: id('Entry Checking') }, ToBankAccount: { AccountID: id('OPEX') }, Amount: 100, DateString: '2026-11-23T00:00:00' }],
    [],
  );
  const plan = planPrep({ txns: [a, b, c, d], banks, existing, invoices: [], vendorCodes: new Map([['Wise Inc', '6690']]), done: new Set([d.id]) });
  assert.deepEqual(plan.map((p) => p.kind), ['exists', 'exists', 'transfer']);
  assert.equal(plan.filter((p) => p.kind === 'exists').length, 2, 'the one Xero transfer covers one Mercury line; the 1517 payout is already in');
  assert.equal(plan.filter((p) => p.kind === 'transfer').length, 1, 'the second $100 transfer still needs its own entry');
  assert.ok(!plan.some((p) => p.txn.id === d.id), 'a line handled before is skipped');
});

test('vendor codes come from past spend (most used code per payee); deleted entries ignored', () => {
  const m = vendorCodesFrom([
    { Type: 'SPEND', Contact: { Name: 'Instantly' }, LineItems: [{ AccountCode: '6050' }] },
    { Type: 'SPEND', Contact: { Name: 'Instantly' }, LineItems: [{ AccountCode: '6050' }] },
    { Type: 'SPEND', Contact: { Name: 'Instantly' }, LineItems: [{ AccountCode: '6090' }] },
    { Type: 'SPEND', Status: 'DELETED', Contact: { Name: 'Gone' }, LineItems: [{ AccountCode: '7050' }] },
    { Type: 'RECEIVE', Contact: { Name: 'Client' }, LineItems: [{ AccountCode: '4000' }] },
  ]);
  assert.deepEqual([...m.entries()], [['Instantly', '6050']]);
});

test('live Mercury numbers: money in excludes transfers; the split is Entry → bucket transfers; report prefers live', () => {
  const now = new Date('2026-11-28T15:00:00Z');
  const accounts = [{ name: 'Entry Checking', balance: 0 }, { name: 'OPEX', balance: 535.72 }, { name: 'Owners Comp', balance: 255 }, { name: 'Tax Account', balance: 127.5 }, { name: 'Treasury Savings', balance: 85 }, { name: 'Quarterly Profit', balance: 42.5 }];
  const t = (accountName: string, amount: number, counterparty: string, kind: string, postedAt: string) => ({ accountName, amount, counterparty: plainName(counterparty), kind, postedAt });
  const txns = [
    t('Entry Checking', 1000, 'Commas', 'other', '2026-11-24T13:00:00Z'), t('Entry Checking', 500, 'PayPal', 'other', '2026-11-10T13:00:00Z'),
    t('Entry Checking', 999, 'Commas', 'other', '2026-10-30T13:00:00Z'), // last month
    t('Entry Checking', -600, 'OPEX', 'internalTransfer', '2026-11-24T13:00:00Z'), t('Entry Checking', -450, 'Owners Comp', 'internalTransfer', '2026-11-24T13:00:00Z'),
    t('Entry Checking', -225, 'Tax Account', 'internalTransfer', '2026-11-24T13:00:00Z'), t('Entry Checking', -150, 'Treasury Savings', 'internalTransfer', '2026-11-24T13:00:00Z'),
    t('Entry Checking', -75, 'Quarterly Profit', 'internalTransfer', '2026-11-24T13:00:00Z'), t('Entry Checking', 60, 'Treasury Savings', 'internalTransfer', '2026-11-24T13:00:00Z'),
  ];
  const live = liveFrom(accounts, txns, now);
  assert.equal(live.inMonth, 1500); assert.equal(live.inWeek, 1000);
  assert.deepEqual(live.sources, [['Commas/Fanbasis', 1000]]);
  assert.deepEqual(live.toBuckets, { opex: 600, owner: 450, tax: 225, treasury: 150, profit: 75 });
  assert.deepEqual(opex({ live, pnl: { income: 0, costs: 300, lines: [] } }), { cap: 600, spent: 300 });
  const r = writeLedgerReport({ now, live, errors: [], openAsks: 2 });
  assert.match(r, /\*Cash \(Mercury, live\):\* Entry \$0 · OPEX \$535\.72 · Owner \$255 · Tax \$127\.50 · Treasury \$85 · Profit \$42\.50/);
  assert.match(r, /\*In:\* this week \$1,000 \(Commas\/Fanbasis \$1,000\) · month so far \$1,500/);
  assert.match(r, /\*Split \(month\):\* ✅ on target/);
  assert.match(r, /2 Mercury lines still need you/);
});

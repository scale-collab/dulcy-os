// Ledger reconciliation prep (Alex 2026-11-25: "the point of the agent is to reconcile").
// Xero's API cannot tick "reconcile" (Xero policy), so Ledger creates the exact entry each Mercury
// line needs; Xero's auto-reconcile (or one OK click) then matches the bank-feed line to it.
//   • transfer between Mercury buckets  → Xero bank transfer (from → to)
//   • payout from Commas/Fanbasis, PayPal, Wise, Stripe, Whop, GoCardless → transfer from that clearing account
//   • client deposit that equals an open invoice → payment on that invoice
//   • money out to a vendor coded before → spend with the same account code
//   • anything else (AmEx payments: which card?, new vendors, unknown deposits) → asked in Slack
// Never deletes, voids or edits; never moves money. Each Mercury line is handled once (ledger_entries).
import type { Stage } from '../stages/index.js';
import { PermanentError } from '../errors.js';
import { saveReport, slackReports } from '../hq/reports.js';
import { createXeroClient } from '../providers/xero.js';
import { createMercuryClient, plainName, type MercuryTxn } from '../providers/mercury.js';
import { createSlackClient } from '../providers/slack.js';
import { etYmd, usd, xeroDate } from './ledger.js';

export const PROCESSORS: [RegExp, RegExp][] = [
  [/commas|fanbasis/i, /fanbasis|commas/i], [/pay ?pal/i, /pay ?pal/i], [/\bwise\b/i, /^wise/i],
  [/stripe/i, /stripe/i], [/whop/i, /whop/i], [/gocardless/i, /gocardless/i],
];
const DAY = 86_400_000;
const GENERIC = new Set(['inc', 'llc', 'ltd', 'co', 'corp', 'corporation', 'company', 'the', 'pbc', 'limited']);
export const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').split(' ').filter((w) => w && !GENERIC.has(w)).join(' ');
export const sameName = (a: string, b: string) => { const x = norm(a), y = norm(b); return !!x && !!y && (x === y || (x.length >= 4 && ` ${y} `.includes(` ${x} `)) || (y.length >= 4 && ` ${x} `.includes(` ${y} `))); };
const cents = (x: number) => Math.round(x * 100);

export interface XBank { id: string; name: string }
export interface XEntry { accountId: string; amount: number; at: number }   // signed from that account's side
export interface OpenInvoice { id: string; contact: string; due: number }
export type PrepAction =
  | { kind: 'transfer'; txn: MercuryTxn; from: XBank; to: XBank; amount: number }
  | { kind: 'payment'; txn: MercuryTxn; invoice: OpenInvoice; account: XBank; amount: number }
  | { kind: 'spend'; txn: MercuryTxn; account: XBank; amount: number; code: string; contact: string }
  | { kind: 'exists'; txn: MercuryTxn }
  | { kind: 'ask'; txn: MercuryTxn; why: string };

/** Decide what each Mercury line needs in Xero. Pure, so every rule is tested with fixed data. */
export function planPrep(i: { txns: MercuryTxn[]; banks: XBank[]; existing: XEntry[]; invoices: OpenInvoice[]; vendorCodes: Map<string, string>; done: Set<string> }): PrepAction[] {
  const bank = (name: string) => i.banks.find((b) => norm(b.name) === norm(plainName(name)));
  const pool = [...i.existing];
  const used = new Set<string>(); // invoices already paid in this run
  const take = (accountId: string, amount: number, at: number) => {
    const k = pool.findIndex((e) => e.accountId === accountId && cents(e.amount) === cents(amount) && Math.abs(e.at - at) <= 3 * DAY);
    if (k < 0) return false;
    pool.splice(k, 1); return true;
  };
  const out: PrepAction[] = [];
  for (const t of [...i.txns].sort((a, b) => a.postedAt.localeCompare(b.postedAt))) {
    if (i.done.has(t.id)) continue;
    const at = Date.parse(t.postedAt);
    const here = bank(t.accountName);
    if (!here) { out.push({ kind: 'ask', txn: t, why: `no Xero bank account called "${t.accountName}"` }); continue; }
    if (t.kind === 'internalTransfer') {
      if (t.amount > 0) continue; // the sending side makes the one transfer
      const to = bank(t.counterparty);
      if (!to) { out.push({ kind: 'ask', txn: t, why: `transfer to "${plainName(t.counterparty)}", which has no Xero bank account` }); continue; }
      const a = -t.amount;
      const fromThere = take(here.id, -a, at); const toThere = take(to.id, a, at);
      if (fromThere && toThere) { out.push({ kind: 'exists', txn: t }); continue; }
      out.push({ kind: 'transfer', txn: t, from: here, to, amount: a });
      continue;
    }
    if (take(here.id, t.amount, at)) { out.push({ kind: 'exists', txn: t }); continue; }
    if (t.amount > 0) {
      const proc = PROCESSORS.find(([who]) => who.test(t.counterparty) || who.test(t.description));
      const clearing = proc && i.banks.find((b) => proc[1].test(b.name));
      if (clearing) { out.push({ kind: 'transfer', txn: t, from: clearing, to: here, amount: t.amount }); continue; }
      const inv = i.invoices.find((v) => !used.has(v.id) && sameName(v.contact, t.counterparty) && cents(v.due) === cents(t.amount));
      if (inv) { used.add(inv.id); out.push({ kind: 'payment', txn: t, invoice: inv, account: here, amount: t.amount }); continue; }
      const someInv = i.invoices.find((v) => sameName(v.contact, t.counterparty));
      out.push({ kind: 'ask', txn: t, why: someInv ? `${t.counterparty} has open invoices, but none for exactly ${usd(t.amount)}` : `money in from "${t.counterparty}" with no matching invoice` });
      continue;
    }
    const procOut = PROCESSORS.find(([who]) => who.test(t.counterparty));
    const clearingOut = procOut && i.banks.find((b) => procOut[1].test(b.name));
    if (clearingOut) { out.push({ kind: 'transfer', txn: t, from: here, to: clearingOut, amount: -t.amount }); continue; }
    if (t.kind === 'externalTransfer') { out.push({ kind: 'ask', txn: t, why: `money moved to another bank ("${plainName(t.counterparty)}"): owner's draw, or a transfer to a business account?` }); continue; }
    if (/amex|american express/i.test(t.counterparty) || /amex|american express/i.test(t.description)) {
      out.push({ kind: 'ask', txn: t, why: 'AmEx payment: which card (Platinum, Gold or Blue Business Plus)?' }); continue;
    }
    const code = [...i.vendorCodes.entries()].find(([v]) => norm(v) === norm(t.counterparty))?.[1];
    if (code) { out.push({ kind: 'spend', txn: t, account: here, amount: -t.amount, code, contact: t.counterparty }); continue; }
    out.push({ kind: 'ask', txn: t, why: `new payee "${t.counterparty}": which account code?` });
  }
  return out;
}

/** Most-used account code per payee, from past Xero spend. */
export function vendorCodesFrom(txns: any[]): Map<string, string> {
  const counts = new Map<string, Map<string, number>>();
  for (const t of txns) {
    if (!/^SPEND/.test(String(t.Type)) || t.Status === 'DELETED') continue;
    const who = String(t.Contact?.Name ?? '').trim();
    if (!who) continue;
    for (const li of t.LineItems ?? []) {
      const code = String(li.AccountCode ?? '').trim(); if (!code) continue;
      const m = counts.get(who) ?? new Map(); m.set(code, (m.get(code) ?? 0) + 1); counts.set(who, m);
    }
  }
  return new Map([...counts.entries()].map(([who, m]) => [who, [...m.entries()].sort((a, b) => b[1] - a[1])[0][0]]));
}

/** What is already in Xero, signed from each bank account's side. */
export function existingFrom(bankTxns: any[], transfers: any[], payments: any[]): XEntry[] {
  const out: XEntry[] = [];
  for (const t of bankTxns) {
    if (t.Status === 'DELETED' || t.Status === 'VOIDED') continue;
    const sign = /^RECEIVE/.test(String(t.Type)) ? 1 : /^SPEND/.test(String(t.Type)) ? -1 : 0;
    if (sign && t.BankAccount?.AccountID) out.push({ accountId: String(t.BankAccount.AccountID), amount: sign * Number(t.Total ?? 0), at: xeroDate(t.DateString ?? t.Date) });
  }
  for (const t of transfers) {
    const at = xeroDate(t.DateString ?? t.Date); const a = Number(t.Amount ?? 0);
    if (t.FromBankAccount?.AccountID) out.push({ accountId: String(t.FromBankAccount.AccountID), amount: -a, at });
    if (t.ToBankAccount?.AccountID) out.push({ accountId: String(t.ToBankAccount.AccountID), amount: a, at });
  }
  for (const p of payments) {
    if (p.Status === 'DELETED' || !p.Account?.AccountID) continue;
    const sign = /ACCREC|ARCREDIT/.test(String(p.PaymentType)) ? 1 : -1;
    out.push({ accountId: String(p.Account.AccountID), amount: sign * Number(p.Amount ?? 0), at: xeroDate(p.Date) });
  }
  return out;
}

const line = (t: MercuryTxn) => `${etYmd(new Date(t.postedAt))} · ${t.accountName} · ${t.counterparty || 'no name'} · ${usd(t.amount)}`;

export const ledgerPrepStage: Stage = async (ctx) => {
  const cfg = ctx.cfg;
  if (!cfg.xeroClientId || !cfg.xeroClientSecret) throw new PermanentError('no XERO_CLIENT_ID / XERO_CLIENT_SECRET on the server');
  const xero = createXeroClient(ctx.db, cfg);
  const mercury = createMercuryClient({ token: cfg.mercuryToken, baseUrl: cfg.mercuryBaseUrl });
  const now = new Date();
  const from = String(ctx.job.input.from ?? cfg.ledgerPrepFrom);
  const accounts = await mercury.accounts();
  const txns = (await Promise.all(accounts.map((a) => mercury.transactions(a, from, etYmd(now))))).flat();
  const banks: XBank[] = ((await xero.get('Accounts', { where: 'Type=="BANK"' })).Accounts ?? []).filter((a: any) => a.Status !== 'ARCHIVED').map((a: any) => ({ id: String(a.AccountID), name: String(a.Name) }));
  const since = (days: number) => { const [y, m, d] = etYmd(new Date(Date.parse(from) - days * DAY)).split('-').map(Number); return `Date>=DateTime(${y},${m},${d})`; };
  const yearTxns = await xero.pages('BankTransactions', 'BankTransactions', { where: `Date>=DateTime(${now.getUTCFullYear() - 1},${now.getUTCMonth() + 1},1)` }, 30);
  const transfers = (await xero.get('BankTransfers', { where: since(7) })).BankTransfers ?? [];
  const payments = await xero.pages('Payments', 'Payments', { where: since(7) }, 10);
  const invoices = (await xero.pages('Invoices', 'Invoices', { Statuses: 'AUTHORISED', summaryOnly: 'true' }, 10))
    .filter((v) => v.Type === 'ACCREC' && Number(v.AmountDue) > 0).map((v) => ({ id: String(v.InvoiceID), contact: String(v.Contact?.Name ?? ''), due: Number(v.AmountDue) }));
  const prior = (await ctx.db.query(`SELECT mercury_id, action FROM ledger_entries`)).rows;
  const done = new Set(prior.filter((r) => r.action !== 'asked' && r.action !== 'flagged').map((r) => String(r.mercury_id)));
  const askedBefore = new Set(prior.filter((r) => r.action === 'asked').map((r) => String(r.mercury_id)));
  const plan = planPrep({ txns, banks, existing: existingFrom(yearTxns, transfers, payments), invoices, vendorCodes: vendorCodesFrom(yearTxns), done });

  // Checker mode (default, Alex 2026-11-25): never writes to Xero. Lines still not in Xero after
  // 3 days are flagged once in Slack; Claude in Chrome clicks OK on Xero's suggestions on Fridays.
  if (!cfg.ledgerPrepWrite && ctx.job.input.write !== true) {
    const cutoff = now.getTime() - 3 * DAY;
    const flaggedBefore = new Set(prior.filter((r) => r.action === 'flagged').map((r) => String(r.mercury_id)));
    let inXero = 0; const stuck: { t: MercuryTxn; hint: string }[] = [];
    for (const a of plan) {
      if (a.kind === 'exists') { inXero++; if (!ctx.dryRun) await ctx.db.query(`INSERT INTO ledger_entries (mercury_id, action, detail) VALUES ($1,'exists',$2) ON CONFLICT (mercury_id) DO UPDATE SET action='exists', updated_at=now()`, [a.txn.id, JSON.stringify({ line: line(a.txn) })]); continue; }
      if (Date.parse(a.txn.postedAt) > cutoff) continue; // give Xero and the Friday run time
      const hint = a.kind === 'ask' ? a.why : a.kind === 'transfer' ? `should be a transfer ${a.from.name} → ${a.to.name}` : a.kind === 'payment' ? `should be a payment on ${a.invoice.contact}'s invoice` : `should be spend → account ${a.code}`;
      stuck.push({ t: a.txn, hint });
    }
    const fresh = stuck.filter((x) => !flaggedBefore.has(x.t.id));
    if (!ctx.dryRun) for (const x of fresh) await ctx.db.query(`INSERT INTO ledger_entries (mercury_id, action, detail) VALUES ($1,'flagged',$2) ON CONFLICT (mercury_id) DO UPDATE SET action='flagged', detail=EXCLUDED.detail, updated_at=now()`, [x.t.id, JSON.stringify({ line: line(x.t), hint: x.hint })]);
    const summary = `${txns.length} Mercury lines checked: ${inXero} in Xero, ${stuck.length} not in Xero after 3+ days (${fresh.length} new)`;
    const checkText = () => [`*Ledger: not reconciled yet* (${stuck.length} Mercury line${stuck.length === 1 ? '' : 's'} older than 3 days are not in Xero)`,
      ...fresh.slice(0, 20).map((x) => `• ${line(x.t)}: ${x.hint}`), fresh.length > 20 ? `…and ${fresh.length - 20} more` : '',
      'Friday: open Xero in Chrome and tell Claude "reconcile Xero" (agents/ledger-reconcile-chrome.md).'].filter(Boolean).join('\n');
    if (!ctx.dryRun && fresh.length) {
      const [title, ...rest] = checkText().split('\n');
      await saveReport(ctx.db, { agent: 'Ledger', kind: 'reconcile_check', title: title.replace(/\*/g, ''), body: rest.join('\n'), summary: summary, jobId: ctx.job.id, dedupeKey: `ledger-check:${ctx.job.id}` });
    }
    if (!ctx.dryRun && cfg.slackBotToken && fresh.length && ctx.job.input.post !== false && slackReports(cfg)) {
      const text = checkText();
      const slack = createSlackClient({ token: cfg.slackBotToken, baseUrl: cfg.slackBaseUrl });
      await ctx.paid({ callKey: `ledger-check-post:${etYmd(now)}`, provider: 'slack', units: 0, run: () => slack.post(cfg.ledgerChannel, text), dryRunResult: () => ({ channel: '', ts: '' }) });
    }
    return { message: `Reconciliation check: ${summary}`, made: [], asks: stuck.map((x) => `• ${line(x.t)}: ${x.hint}`), failed: [], mercuryLines: txns.length, mode: 'check' };
  }

  const made: string[] = []; const asks: string[] = []; const failed: string[] = []; let exists = 0;
  const record = (id: string, action: string, xeroId: string | null, detail: unknown) => ctx.dryRun ? Promise.resolve() : ctx.db.query(
    `INSERT INTO ledger_entries (mercury_id, action, xero_id, detail) VALUES ($1,$2,$3,$4)
     ON CONFLICT (mercury_id) DO UPDATE SET action=EXCLUDED.action, xero_id=EXCLUDED.xero_id, detail=EXCLUDED.detail, updated_at=now()`, [id, action, xeroId, JSON.stringify(detail)]);
  for (const a of plan) {
    const t = a.txn; const date = etYmd(new Date(t.postedAt)); const ref = `Mercury ${t.id.slice(0, 8)}`;
    if (a.kind === 'exists') { exists++; await record(t.id, 'exists', null, { line: line(t) }); continue; }
    if (a.kind === 'ask') { if (!askedBefore.has(t.id)) asks.push(`• ${line(t)}: ${a.why}`); await record(t.id, 'asked', null, { line: line(t), why: a.why }); continue; }
    const [path, body, what] =
      a.kind === 'transfer' ? ['BankTransfers', { BankTransfers: [{ FromBankAccount: { AccountID: a.from.id }, ToBankAccount: { AccountID: a.to.id }, Amount: a.amount, Date: date, Reference: ref }] }, `transfer ${a.from.name} → ${a.to.name} ${usd(a.amount)}`] as const
      : a.kind === 'payment' ? ['Payments', { Payments: [{ Invoice: { InvoiceID: a.invoice.id }, Account: { AccountID: a.account.id }, Amount: a.amount, Date: date, Reference: ref }] }, `payment ${a.invoice.contact} ${usd(a.amount)} on their invoice`] as const
      : ['BankTransactions', { BankTransactions: [{ Type: 'SPEND', Contact: { Name: a.contact }, BankAccount: { AccountID: a.account.id }, Date: date, Reference: ref, LineAmountTypes: 'NoTax', LineItems: [{ Description: t.description || a.contact, Quantity: 1, UnitAmount: a.amount, AccountCode: a.code }] }] }, `spend ${a.contact} ${usd(a.amount)} → account ${a.code}`] as const;
    try {
      const r = await ctx.paid({ scope: 'record', callKey: `ledger-prep:${t.id}`, provider: 'xero', units: 0, run: () => xero.put(path, body, `dulcy-ledger-${t.id}`), dryRunResult: () => ({}) });
      const id = r?.BankTransfers?.[0]?.BankTransferID ?? r?.Payments?.[0]?.PaymentID ?? r?.BankTransactions?.[0]?.BankTransactionID ?? null;
      made.push(`${date} ${what}`);
      await record(t.id, a.kind, id, { line: line(t), what });
    } catch (e) {
      if (!(e instanceof PermanentError)) throw e;
      failed.push(`• ${line(t)}: ${String(e.message).slice(0, 160)}`);
    }
  }
  const summary = `${made.length} ${ctx.dryRun ? 'would be created' : 'created'}, ${exists} already in Xero, ${asks.length} new question${asks.length === 1 ? '' : 's'}, ${failed.length} refused by Xero`;
  if (!ctx.dryRun && (made.length || asks.length || failed.length)) {
    await saveReport(ctx.db, { agent: 'Ledger', kind: 'reconcile_prep', title: 'Ledger: reconciliation prep', summary, body: [made.length ? `Ready to reconcile in Xero: ${made.length} entr${made.length === 1 ? 'y' : 'ies'}\n${made.map((m) => `• ${m}`).join('\n')}` : '',
      asks.length ? `**I need you for these:**\n${asks.join('\n')}` : '', failed.length ? `**Xero refused:**\n${failed.join('\n')}` : ''].filter(Boolean).join('\n\n'), jobId: ctx.job.id, dedupeKey: `ledger-prep:${ctx.job.id}` });
  }
  if (!ctx.dryRun && cfg.slackBotToken && (made.length || asks.length || failed.length) && ctx.job.input.post !== false && slackReports(cfg)) {
    const text = [`*Ledger: reconciliation prep* (${summary})`,
      made.length ? `Ready to reconcile in Xero (auto-reconcile should clear these): ${made.length} entr${made.length === 1 ? 'y' : 'ies'}` : '',
      asks.length ? `*I need you for these:*\n${asks.slice(0, 15).join('\n')}${asks.length > 15 ? `\n…and ${asks.length - 15} more` : ''}\nCode them in Xero once; next time I'll copy how you did it.` : '',
      failed.length ? `*Xero refused:*\n${failed.slice(0, 10).join('\n')}` : ''].filter(Boolean).join('\n');
    const slack = createSlackClient({ token: cfg.slackBotToken, baseUrl: cfg.slackBaseUrl });
    await ctx.paid({ callKey: `ledger-prep-post:${etYmd(now)}`, provider: 'slack', units: 0, run: () => slack.post(cfg.ledgerChannel, text), dryRunResult: () => ({ channel: '', ts: '' }) });
  }
  return { message: `Reconciliation prep: ${summary}`, made, asks, failed, mercuryLines: txns.length };
};

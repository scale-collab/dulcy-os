// Ledger, the accountant (Alex 2026-11-25). Read only: Ledger never pays, transfers, approves or
// edits anything. Everything comes from Xero, which already holds every Mercury bucket, all four
// cards and the payment processors (see company/finance-structure.md).
//   • ledger.report: Saturday money report in Slack (buckets vs Profit First %, spend vs the 40%
//     OPEX cap, late invoices, bills due, books health, next 14th/28th payout).
//   • ledger.check: a purchase or invoice question posted in the check channel gets a ✅ / ⚠️ / ❌
//     reply in its thread, with this month's OPEX room before and after.
// The numbers and the verdict are plain code (exact, no AI guesses).
import type { Stage } from '../stages/index.js';
import type { Db } from '../db/pool.js';
import { PermanentError } from '../errors.js';
import { createXeroClient, type XeroClient } from '../providers/xero.js';
import { createSlackClient, type SlackMessage } from '../providers/slack.js';

// Profit First split (Lucid "Setting Up Your Business Financial Structure").
export const BUCKETS: { key: string; label: string; match: RegExp; target: number }[] = [
  { key: 'opex', label: 'OPEX', match: /^opex/i, target: 0.40 },
  { key: 'owner', label: 'Owner', match: /owner/i, target: 0.30 },
  { key: 'tax', label: 'Tax', match: /^tax/i, target: 0.15 },
  { key: 'treasury', label: 'Treasury', match: /treasury/i, target: 0.10 },
  { key: 'profit', label: 'Profit', match: /profit/i, target: 0.05 },
];
const ENTRY = /entry checking/i;
const HYSA = /high yield/i;
const CARD = /card|chase ink/i;
const PROCESSORS: [string, RegExp][] = [['Commas/Fanbasis', /fanbasis|commas/i], ['PayPal', /pay ?pal/i], ['Wise', /wise/i], ['Stripe', /stripe/i], ['Whop', /whop/i], ['GoCardless', /gocardless/i]];
export const OPEX_SHARE = 0.40;

export interface Bank { name: string; opening: number; received: number; spent: number; closing: number }
export interface PnlLine { section: string; name: string; amount: number }
export interface LedgerData {
  now: Date;
  month?: Bank[];          // month to date
  week?: Bank[];           // last 7 days
  pnl?: { income: number; costs: number; lines: PnlLine[] };
  receivables?: { contact: string; due: number; daysLate: number }[];
  bills?: { contact: string; due: number; daysUntil: number }[];
  books?: { unreconciled: number; lastReconciled: string };
  errors: string[];
}

const n = (x: unknown) => { const v = Number(String(x ?? '').replace(/,/g, '')); return Number.isFinite(v) ? v : 0; };
export const usd = (x: number) => `${x < 0 ? '-' : ''}$${Math.abs(x).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: Math.abs(x) < 100 ? 2 : 0 })}`;
const pct = (x: number) => `${Math.round(x * 100)}%`;
export const etYmd = (d: Date) => d.toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
const DAY = 86_400_000;

/** Xero JSON dates: "/Date(1764000000000+0000)/" or ISO. */
export function xeroDate(x: unknown): number {
  const s = String(x ?? '');
  const m = /\/Date\((-?\d+)/.exec(s);
  if (m) return Number(m[1]);
  const t = Date.parse(s);
  return Number.isFinite(t) ? t : NaN;
}

/** Bank Summary report → one row per bank/card account (columns found by their titles). */
export function parseBankSummary(j: any): Bank[] {
  const rows: any[] = j?.Reports?.[0]?.Rows ?? [];
  const head: string[] = (rows.find((r) => r.RowType === 'Header')?.Cells ?? []).map((c: any) => String(c.Value ?? '').toLowerCase());
  const col = (re: RegExp, fallback: number) => { const i = head.findIndex((h) => re.test(h)); return i >= 0 ? i : fallback; };
  const [o, r, s, c] = [col(/opening/, 1), col(/received/, 2), col(/spent/, 3), col(/closing/, head.length - 1 || 4)];
  const out: Bank[] = [];
  for (const sec of rows.filter((x) => x.RowType === 'Section')) for (const row of sec.Rows ?? []) {
    if (row.RowType !== 'Row') continue;
    const cells = row.Cells ?? [];
    const name = String(cells[0]?.Value ?? '').trim();
    if (name) out.push({ name, opening: n(cells[o]?.Value), received: n(cells[r]?.Value), spent: n(cells[s]?.Value), closing: n(cells[c]?.Value) });
  }
  return out;
}

/** Profit and Loss report → income, costs (cost of sales + operating expenses) and the cost lines. */
export function parsePnl(j: any): { income: number; costs: number; lines: PnlLine[] } {
  const rows: any[] = j?.Reports?.[0]?.Rows ?? [];
  let income = 0, costs = 0; const lines: PnlLine[] = [];
  for (const sec of rows.filter((x) => x.RowType === 'Section')) {
    const title = String(sec.Title ?? '');
    const isIncome = /^income|^revenue|trading income/i.test(title) && !/other/i.test(title);
    const isCost = /cost of sales|operating expenses|^expenses/i.test(title);
    if (!isIncome && !isCost) continue;
    for (const row of sec.Rows ?? []) {
      const cells = row.Cells ?? [];
      const amount = n(cells[1]?.Value);
      if (row.RowType === 'Row') { if (isCost) lines.push({ section: title, name: String(cells[0]?.Value ?? ''), amount }); }
      else if (row.RowType === 'SummaryRow') { if (isIncome) income += amount; else costs += amount; }
    }
  }
  return { income, costs, lines };
}

const find = (banks: Bank[] | undefined, re: RegExp) => banks?.find((b) => re.test(b.name));
/** Money that came in this month: what landed in Entry Checking (Profit First counts cash). */
export const incomeOf = (banks?: Bank[]) => find(banks, ENTRY)?.received ?? 0;
/** This month's OPEX cap and spend; spend is Xero's P&L costs, or the card spend when the P&L can't be read. */
export function opex(d: Pick<LedgerData, 'month' | 'pnl'>): { cap: number; spent: number } | undefined {
  if (!d.month) return undefined;
  const cap = OPEX_SHARE * incomeOf(d.month);
  const spent = d.pnl ? d.pnl.costs : d.month.filter((b) => CARD.test(b.name)).reduce((a, b) => a + b.spent, 0);
  return { cap, spent };
}

export function nextPayout(now: Date): string {
  const [y, m, day] = etYmd(now).split('-').map(Number);
  const pick = day <= 14 ? [y, m, 14] : day <= 28 ? [y, m, 28] : m === 12 ? [y + 1, 1, 14] : [y, m + 1, 14];
  return `${pick[0]}-${String(pick[1]).padStart(2, '0')}-${String(pick[2]).padStart(2, '0')}`;
}

/** The Saturday report (Slack mrkdwn). Pure, so it is tested with fixed data. */
export function writeLedgerReport(d: LedgerData): string {
  const lines = [`*Ledger: week to ${d.now.toLocaleDateString('en-US', { timeZone: 'America/New_York', month: 'short', day: 'numeric' })}* (Xero, as reconciled)`];
  const top: string[] = [];
  if (d.month) {
    const cash = [find(d.month, ENTRY) && `Entry ${usd(find(d.month, ENTRY)!.closing)}`, ...BUCKETS.map((b) => { const a = find(d.month, b.match); return a ? `${b.label} ${usd(a.closing)}` : ''; }), find(d.month, HYSA) && `HYSA ${usd(find(d.month, HYSA)!.closing)}`].filter(Boolean);
    lines.push(`*Cash:* ${cash.join(' · ')}`);
    const weekIn = incomeOf(d.week);
    const src = PROCESSORS.map(([label, re]) => [label, (d.week ?? []).filter((b) => re.test(b.name)).reduce((a, b) => a + b.received, 0)] as const).filter(([, v]) => v > 0);
    lines.push(`*In:* this week ${usd(weekIn)}${src.length ? ` (${src.map(([l, v]) => `${l} ${usd(v)}`).join(', ')})` : ''} · month so far ${usd(incomeOf(d.month))}`);
    // Split check, month to date: each bucket's share of what came into Entry Checking.
    const inc = incomeOf(d.month);
    if (inc >= 500) {
      const off = BUCKETS.map((b) => ({ b, got: (find(d.month, b.match)?.received ?? 0) / inc })).filter((x) => Math.abs(x.got - x.b.target) > 0.02);
      lines.push(`*Split (month):* ${off.length ? off.map((x) => `⚠️ ${x.b.label} got ${pct(x.got)} (target ${pct(x.b.target)})`).join(' · ') : '✅ on target (40/30/15/10/5)'}`);
      if (off.length) top.push(`Fix the split: ${off.map((x) => x.b.label).join(', ')} ${off.length === 1 ? 'is' : 'are'} off target.`);
      const sitting = find(d.month, ENTRY)?.closing ?? 0;
      if (sitting > 100 && sitting > 0.1 * inc) { lines.push(`⚠️ ${usd(sitting)} is still sitting in Entry Checking (not split yet).`); top.push(`Split the ${usd(sitting)} sitting in Entry Checking.`); }
    } else lines.push('*Split (month):* not enough money in yet to check');
  } else lines.push("*Cash:* couldn't read the Xero Bank Summary");
  const o = opex(d);
  if (o) {
    const costLines = (d.pnl?.lines ?? []).filter((l) => l.amount > 0).sort((a, b) => b.amount - a.amount).slice(0, 5);
    lines.push(`*Spend this month:* ${usd(o.spent)} of ${usd(o.cap)} OPEX cap${o.cap > 0 ? ` (${pct(o.spent / o.cap)})` : ''}${costLines.length ? ` · top: ${costLines.map((l) => `${l.name} ${usd(l.amount)}`).join(', ')}` : ''}${d.pnl ? '' : ' (card spend; P&L not readable)'}`);
    if (o.cap > 0 && o.spent > o.cap) top.push(`Spend is ${usd(o.spent - o.cap)} over the OPEX cap: grow revenue or cut costs.`);
  }
  if (d.receivables) {
    // One line per client: the total that is more than 7 days late, and the oldest invoice's days.
    const byClient = new Map<string, { contact: string; due: number; daysLate: number }>();
    for (const r of d.receivables.filter((x) => x.daysLate > 7 && x.due > 0)) {
      const e = byClient.get(r.contact) ?? { contact: r.contact, due: 0, daysLate: 0 };
      e.due += r.due; e.daysLate = Math.max(e.daysLate, r.daysLate); byClient.set(r.contact, e);
    }
    const late = [...byClient.values()].sort((a, b) => b.due - a.due);
    lines.push(`*Owed to us:* ${late.length ? late.slice(0, 5).map((r) => `${r.contact} ${usd(r.due)} (${r.daysLate} days late)`).join(' · ') + (late.length > 5 ? ` · +${late.length - 5} more` : '') : 'nothing more than 7 days late'}`);
    if (late[0]) top.push(`Chase ${late[0].contact} for ${usd(late[0].due)} (${late[0].daysLate} days late).`);
  } else lines.push("*Owed to us:* couldn't read invoices");
  if (d.bills) {
    const soon = d.bills.filter((b) => b.daysUntil <= 14).sort((a, b) => a.daysUntil - b.daysUntil);
    lines.push(`*Bills due (14 days):* ${soon.length ? soon.slice(0, 5).map((b) => `${b.contact} ${usd(b.due)} ${b.daysUntil < 0 ? `(${-b.daysUntil} days overdue)` : b.daysUntil === 0 ? '(today)' : `(in ${b.daysUntil} days)`}`).join(' · ') : 'none'}`);
    const overdue = soon.filter((b) => b.daysUntil < 0);
    if (overdue.length) top.push(`Pay or check ${overdue.length} overdue bill${overdue.length === 1 ? '' : 's'}.`);
  }
  if (d.books) {
    lines.push(`*Books:* ${d.books.unreconciled} line${d.books.unreconciled === 1 ? '' : 's'} to reconcile (last 30 days) · last reconciled ${d.books.lastReconciled || 'UNKNOWN'}`);
    if (d.books.unreconciled > 20) top.push(`Reconcile Xero (${d.books.unreconciled} lines waiting).`);
  }
  if (d.month) {
    const cards = d.month.filter((b) => CARD.test(b.name)).reduce((a, b) => a + (b.closing < 0 ? -b.closing : 0), 0);
    const owner = find(d.month, BUCKETS[1].match)?.closing; const tax = find(d.month, BUCKETS[2].match)?.closing;
    lines.push(`*Next payout (${nextPayout(d.now)}):* owner ${owner === undefined ? 'UNKNOWN' : usd(owner)} · cards ${usd(cards)} · tax→HYSA ${tax === undefined ? 'UNKNOWN' : tax > 0 ? usd(tax) : `nothing to move (Xero shows ${usd(tax)}: check the Tax account is reconciled)`}`);
  }
  for (const e of d.errors) lines.push(`_couldn't read ${e}_`);
  lines.push(`*Top ${Math.min(3, top.length) || 1} for you:* ${top.length ? top.slice(0, 3).map((t, i) => `${i + 1}. ${t}`).join('  ') : '1. Nothing urgent in the books.'}`);
  return lines.join('\n');
}

// ---- Purchase / invoice yes-no ----

const ASK = /\b(buy|buying|purchase|pay|paying|subscri\w*|invoice|bill|tool|cost|costs|renew\w*|upgrade|order|hire|spend|ledger|should (i|we)|can (i|we))\b/i;
export interface Ask { amount?: number; recurring: 'monthly' | 'yearly' | 'one-time'; from?: 'tax' | 'profit' | 'treasury' }
export function isAsk(text: string): boolean { return /\$\s?\d/.test(text) && ASK.test(text) || /^\s*ledger\b/i.test(text); }
export function parseAsk(text: string): Ask {
  const m = /\$\s?(\d{1,3}(?:,\d{3})+(?:\.\d+)?|\d+(?:\.\d+)?)\s?(k)?\b/i.exec(text);
  const amount = m ? n(m[1]) * (m[2] ? 1000 : 1) : undefined;
  const recurring = /(\/\s?(mo|month)\b|per month|a month|monthly|\bmonth(ly)?\b|\/m\b)/i.test(text) ? 'monthly' : /(\/\s?(yr|year)\b|per year|a year|yearly|annual\w*)/i.test(text) ? 'yearly' : 'one-time';
  const from = /\b(from|out of|use|using)\s+(the\s+)?tax\b/i.test(text) ? 'tax' : /\b(from|out of|use|using)\s+(the\s+)?(profit|bonus)/i.test(text) ? 'profit' : /\btreasury\b/i.test(text) ? 'treasury' : undefined;
  return { amount, recurring, from };
}

const GENERIC = new Set(['inc', 'llc', 'ltd', 'co', 'company', 'corp', 'the', 'and', 'group', 'services', 'service', 'business', 'card', 'payment', 'payments', 'transfer', 'online', 'software', 'media']);
/** Vendors Dulcy already pays whose name appears in the message (a possible duplicate or renewal). */
export function vendorHits(text: string, spend: { contact: string; total: number }[]): { contact: string; total: number }[] {
  const t = ` ${text.toLowerCase().replace(/[^a-z0-9.]+/g, ' ')} `;
  return spend.filter((s) => {
    const words = s.contact.toLowerCase().replace(/[^a-z0-9.]+/g, ' ').split(' ').filter((w) => w.length >= 4 && !GENERIC.has(w));
    return words.length > 0 && t.includes(` ${words[0]} `);
  }).sort((a, b) => b.total - a.total).slice(0, 2);
}

export function verdict(ask: Ask, money: { cap: number; spent: number } | undefined, hits: { contact: string; total: number }[]): string {
  if (ask.from === 'tax' || ask.from === 'profit') return `❌ No\nNever pay from the ${ask.from === 'tax' ? 'Tax' : 'Profit'} account (Profit First rule).`;
  if (ask.from === 'treasury') return "❌ No, Alex's call\nTreasury is for emergencies only.";
  if (ask.amount === undefined) return '❓ I could not find a price. Post it again with the amount, like "$349/mo".';
  const what = `${usd(ask.amount)}${ask.recurring === 'monthly' ? '/month' : ask.recurring === 'yearly' ? '/year (paid up front)' : ' one-time'}`;
  if (!money || money.cap <= 0) return `⚠️ UNKNOWN\nI couldn't read this month's income and spend from Xero, so I can't size ${what} against the OPEX cap.`;
  const room = money.cap - money.spent; const after = room - ask.amount;
  const roomLine = `OPEX room this month: ${usd(room)} → ${usd(after)} after this`;
  if (after < 0) return `❌ No\n${what} puts this month ${usd(-after)} over the OPEX cap (${usd(money.cap)} = 40% of income so far). Wait for more revenue or cut something first.\n${roomLine}`;
  const why: string[] = [];
  if (hits[0]) why.push(`you already pay ${hits[0].contact} (${usd(hits[0].total)} in the last 90 days): check it isn't a duplicate`);
  if (ask.recurring === 'monthly' && ask.amount > 0.1 * money.cap) why.push(`it adds ${usd(ask.amount)} every month (${pct(ask.amount / money.cap)} of this month's OPEX cap)`);
  if (after < 0.1 * money.cap) why.push(`it leaves only ${usd(after)} for the rest of the month`);
  return why.length ? `⚠️ Yes, but\n${what}: ${why.join('; ')}.\n${roomLine}` : `✅ Yes\n${what} fits inside this month's OPEX cap.\n${roomLine}`;
}

// ---- Reading Xero ----

async function monthBanks(x: Pick<XeroClient, 'get'>, now: Date) {
  const today = etYmd(now);
  return parseBankSummary(await x.get('Reports/BankSummary', { fromDate: `${today.slice(0, 8)}01`, toDate: today }));
}
async function monthPnl(x: Pick<XeroClient, 'get'>, now: Date) {
  const today = etYmd(now);
  return parsePnl(await x.get('Reports/ProfitAndLoss', { fromDate: `${today.slice(0, 8)}01`, toDate: today }));
}
const whereSince = (t: number) => { const [y, m, d] = etYmd(new Date(t)).split('-').map(Number); return `Date>=DateTime(${y},${m},${d})`; };

export async function gatherLedger(x: Pick<XeroClient, 'get' | 'pages'>, now: Date): Promise<LedgerData> {
  const errors: string[] = [];
  const safe = async <T>(label: string, f: () => Promise<T>): Promise<T | undefined> => { try { return await f(); } catch (e) { errors.push(`${label} (${String((e as Error).message).slice(0, 120)})`); return undefined; } };
  const today = etYmd(now);
  const month = await safe('the Bank Summary', () => monthBanks(x, now));
  const week = await safe('this week\'s Bank Summary', async () => parseBankSummary(await x.get('Reports/BankSummary', { fromDate: etYmd(new Date(now.getTime() - 6 * DAY)), toDate: today })));
  const pnl = await safe('the Profit and Loss', () => monthPnl(x, now));
  const invoices = await safe('invoices and bills', () => x.pages('Invoices', 'Invoices', { Statuses: 'AUTHORISED', summaryOnly: 'true' }, 10));
  const txns = await safe('bank transactions', () => x.pages('BankTransactions', 'BankTransactions', { where: whereSince(now.getTime() - 30 * DAY) }, 10));
  const due = (i: any) => n(i.AmountDue);
  const dueAt = (i: any) => xeroDate(i.DueDateString ?? i.DueDate);
  return {
    now, month, week, pnl, errors,
    receivables: invoices?.filter((i) => i.Type === 'ACCREC').map((i) => ({ contact: String(i.Contact?.Name ?? 'unknown'), due: due(i), daysLate: Math.floor((now.getTime() - dueAt(i)) / DAY) || 0 })),
    bills: invoices?.filter((i) => i.Type === 'ACCPAY' && due(i) > 0).map((i) => ({ contact: String(i.Contact?.Name ?? 'unknown'), due: due(i), daysUntil: Math.ceil((dueAt(i) - now.getTime()) / DAY) || 0 })),
    books: txns && {
      unreconciled: txns.filter((t) => t.IsReconciled === false && t.Status !== 'DELETED').length,
      lastReconciled: (() => { const ts = txns.filter((t) => t.IsReconciled).map((t) => xeroDate(t.DateString ?? t.Date)).filter(Number.isFinite); return ts.length ? etYmd(new Date(Math.max(...ts))) : ''; })(),
    },
  };
}

function xeroFor(db: Db, cfg: Parameters<typeof createXeroClient>[1]) {
  if (!cfg.xeroClientId || !cfg.xeroClientSecret) throw new PermanentError('no XERO_CLIENT_ID / XERO_CLIENT_SECRET on the server');
  return createXeroClient(db, cfg);
}

export const ledgerReportStage: Stage = async (ctx) => {
  const cfg = ctx.cfg;
  const now = new Date();
  const text = writeLedgerReport(await gatherLedger(xeroFor(ctx.db, cfg), now));
  if (ctx.dryRun || !cfg.slackBotToken || ctx.job.input.post === false) return { message: `Ledger report written (not posted${ctx.dryRun ? ': dry run' : !cfg.slackBotToken ? ': no Slack token' : ''})`, text };
  const slack = createSlackClient({ token: cfg.slackBotToken, baseUrl: cfg.slackBaseUrl });
  const to = String(ctx.job.input.channel ?? cfg.ledgerChannel);
  const posted = await ctx.paid({ callKey: `ledger:${etYmd(now)}:${to}`, provider: 'slack', units: 0, run: () => slack.post(to, text), dryRunResult: () => ({ channel: '', ts: '' }) });
  return { message: 'Ledger report posted', channel: posted.channel, text };
};

/** Asks in the check channel from the approvers, newest 24 h, not answered yet. */
export function pickAsks(msgs: SlackMessage[], approvers: string[], seen: Set<string>): SlackMessage[] {
  return msgs.filter((m) => !m.bot && (!m.threadTs || m.threadTs === m.ts) && approvers.includes(m.user) && !seen.has(m.ts) && isAsk(m.text)).sort((a, b) => a.ts.localeCompare(b.ts));
}

export const ledgerCheckStage: Stage = async (ctx) => {
  const cfg = ctx.cfg;
  if (!cfg.slackBotToken) throw new PermanentError('no SLACK_BOT_TOKEN on the server');
  const slack = createSlackClient({ token: cfg.slackBotToken, baseUrl: cfg.slackBaseUrl });
  const channel = cfg.ledgerCheckChannel;
  const now = new Date();
  const msgs = await slack.history(channel, String((now.getTime() - DAY) / 1000));
  const seen = new Set<string>((await ctx.db.query('SELECT ts FROM ledger_checks WHERE channel = $1', [channel])).rows.map((r) => String(r.ts)));
  const asks = pickAsks(msgs, cfg.slackApprovers, seen);
  if (!asks.length) return { message: 'No new purchase questions', answered: 0 };
  const x = xeroFor(ctx.db, cfg);
  let money: { cap: number; spent: number } | undefined;
  try { const [month, pnl] = await Promise.all([monthBanks(x, now), monthPnl(x, now).catch(() => undefined)]); money = opex({ month, pnl }); } catch { money = undefined; }
  let spend: { contact: string; total: number }[] = [];
  try {
    const txns = await x.pages('BankTransactions', 'BankTransactions', { where: `${whereSince(now.getTime() - 90 * DAY)} AND Type=="SPEND"` }, 10);
    const by = new Map<string, number>();
    for (const t of txns) { const c = String(t.Contact?.Name ?? '').trim(); if (c) by.set(c, (by.get(c) ?? 0) + n(t.Total)); }
    spend = [...by.entries()].map(([contact, total]) => ({ contact, total }));
  } catch { /* the duplicate check is a bonus; the verdict still works without it */ }
  const out: { ts: string; verdict: string }[] = [];
  for (const m of asks) {
    const v = verdict(parseAsk(m.text), money, vendorHits(m.text, spend));
    out.push({ ts: m.ts, verdict: v.split('\n')[0] });
    if (ctx.dryRun) continue;
    await ctx.paid({ callKey: `ledger-check:${channel}:${m.ts}`, provider: 'slack', units: 0, run: () => slack.post(channel, `*Ledger:* ${v}`, m.ts), dryRunResult: () => ({ channel: '', ts: '' }) });
    await ctx.db.query('INSERT INTO ledger_checks (channel, ts, verdict) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING', [channel, m.ts, v.split('\n')[0]]);
  }
  return { message: `${out.length} purchase question${out.length === 1 ? '' : 's'} ${ctx.dryRun ? 'checked (dry run, not posted)' : 'answered'}`, answered: out.length, verdicts: out };
};

// Batch 2 (Alex 2026-11-27): owner-only money on the Clients screen. Read only, never stored in git.
//   - Xero (Ledger's read-only client): income and costs this month and last month (Profit and
//     Loss), and open client invoices split into "coming up" (not due yet) and "late".
//   - The "Dulcy Media P/L" Google Sheet (Alex OK'd reading it; the engine reads Sheets as
//     scale@dulcy.io): the client billing lines (who pays what, retainer and per call) and the
//     card debts across accounts. Round 5: the personal expense lines ("Home" block) are read out
//     too, for Finances → Personal and Both (owner only). Nothing else of the tab leaves the server.
// Members never reach this: the route answers 403 and the client list strips every money key.
import type { SheetsClient } from '../providers/google.js';
import type { XeroClient } from '../providers/xero.js';
import { etYmd, parsePnl, xeroDate } from '../agents/ledger.js';
import type { DealLine } from './clientDeals.js';

export const PNL_SHEET_ID = '1nUf28kpRs2olqUIIfdrVdyH1q67hRT-zhmaD9UL3knM';
export const PNL_TAB = 'goal';
export const FINANCE_CACHE_MS = 5 * 60_000;

export interface BillingLine { name: string; day: string; monthly: number; perCall: number; processor: string }
export interface CardDebt { card: string; dueDate: string; statement: number; balance: number; minimum: number; available: number | null; apr: string }
/** One personal expense line of the P/L sheet: amount = the monthly figure the sheet counts (column C). */
export interface PersonalExpense { name: string; amount: number | null; note: string; aside: number | null }
export interface PersonalExpenses {
  lines: PersonalExpense[];
  /** The sheet's own total of the block (blank-label row under it), else the sum of the counted lines. */
  total: number; totalFrom: 'sheet' | 'sum';
  /** Lines with a figure only beside the amount column (not in the sheet's total), e.g. paused savings. */
  asideTotal: number;
  /** The card breakdown under the block ("which card pays these"), when the sheet has one. */
  paidWith: { name: string; amount: number }[];
}
export interface PnlSheet { billing: BillingLine[]; cards: CardDebt[]; cardTotals: { statement: number; balance: number; minimum: number }; personal?: PersonalExpenses | null }

/** "$1,500.00", "-$1,664.26", "2000", " $ 120.00 " → a number; blank → null. */
export function money(x: unknown): number | null {
  const t = String(x ?? '').replace(/[\s$,]/g, '');
  if (!t || t === '-') return null;
  const v = Number(t.replace(/^\((.*)\)$/, '-$1'));
  return Number.isFinite(v) ? v : null;
}
const cell = (rows: string[][], r: number, c: number) => String(rows[r]?.[c] ?? '').trim();
function findHeader(rows: string[][], label: RegExp): { r: number; c: number } | null {
  for (let r = 0; r < Math.min(rows.length, 60); r++) {
    const c = (rows[r] ?? []).findIndex((v) => label.test(String(v ?? '').trim()));
    if (c >= 0) return { r, c };
  }
  return null;
}
const colIn = (rows: string[][], r: number, from: number, to: number, re: RegExp) => { for (let c = from; c <= to; c++) if (re.test(cell(rows, r, c))) return c; return -1; };

/**
 * The two owner blocks of the P/L "goal" tab, found by their header cells (not fixed positions):
 * "Clients (Renewing)" (with Monthly, Processor, Rev Share / Calls Booked beside it) and "DEBT"
 * (with DUE DATE, Statement, Balance, Minimum, Available To Spend). Pure.
 */
export function parsePnlSheet(rows: string[][]): PnlSheet {
  const billing: BillingLine[] = []; const cards: CardDebt[] = [];
  const h = findHeader(rows, /^clients \(renewing\)$/i);
  if (h) {
    const monthly = colIn(rows, h.r, h.c + 1, h.c + 4, /^monthly$/i);
    const proc = colIn(rows, h.r, h.c + 1, h.c + 4, /^processor$/i);
    const calls = colIn(rows, h.r, h.c + 1, h.c + 5, /calls/i);
    for (let r = h.r + 1; r < Math.min(rows.length, h.r + 30); r++) {
      const name = cell(rows, r, h.c);
      if (!name) continue;
      if (/^(revenue|expenses|total|net)/i.test(name)) break;
      const m = monthly >= 0 ? money(cell(rows, r, monthly)) : null; const pc = calls >= 0 ? money(cell(rows, r, calls)) : null;
      if (!m && !pc) continue; // products / processors listed without an amount
      billing.push({ name, day: h.c > 0 ? cell(rows, r, h.c - 1) : '', monthly: m ?? 0, perCall: pc ?? 0, processor: proc >= 0 ? cell(rows, r, proc) : '' });
    }
  }
  const d = findHeader(rows, /^debt$/i);
  if (d) {
    const at = (re: RegExp) => colIn(rows, d.r, Math.max(0, d.c - 3), d.c + 8, re);
    const due = at(/^due date$/i), st = at(/^statement$/i), bal = at(/^balance$/i), min = at(/^minimum$/i), avail = at(/^available/i), apr = at(/^interest perc/i);
    for (let r = d.r + 1; r < Math.min(rows.length, d.r + 25); r++) {
      const card = cell(rows, r, d.c);
      if (!card || /^(cc|total|rest)$/i.test(card)) break;
      cards.push({ card, dueDate: due >= 0 ? cell(rows, r, due) : '', statement: money(cell(rows, r, st)) ?? 0, balance: money(cell(rows, r, bal)) ?? 0, minimum: money(cell(rows, r, min)) ?? 0, available: avail >= 0 ? money(cell(rows, r, avail)) : null, apr: apr >= 0 ? cell(rows, r, apr) : '' });
    }
  }
  const sum = (k: 'statement' | 'balance' | 'minimum') => Math.round(cards.reduce((a, c) => a + c[k], 0) * 100) / 100;
  return { billing, cards, cardTotals: { statement: sum('statement'), balance: sum('balance'), minimum: sum('minimum') }, personal: parsePersonalExpenses(rows) };
}

const r2 = (x: number) => Math.round(x * 100) / 100;
/**
 * Round 5 (Alex 2026-11-28): the P/L sheet's personal expenses go to Personal. The block starts at the
 * "Home" cell: label one column right of it, the monthly amount two columns right (what the sheet's
 * own total counts), a note three columns right (a figure there alone is shown as "aside", not
 * counted, because the sheet's total leaves it out). It ends at the first row with no label: that
 * row's amount is the sheet's total. Under it, the card breakdown (card name, amount) until the next
 * blank label. The left-most column (due days, phone numbers) is never read out. Pure.
 */
export function parsePersonalExpenses(rows: string[][]): PersonalExpenses | null {
  const h = findHeader(rows, /^home$/i);
  if (!h) return null;
  const L = h.c + 1, A = h.c + 2, N = h.c + 3;
  const lines: PersonalExpense[] = []; let total: number | null = null; let r = h.r;
  for (; r < Math.min(rows.length, h.r + 80); r++) {
    const name = cell(rows, r, L); const amount = money(cell(rows, r, A)); const noteRaw = cell(rows, r, N);
    if (!name) { if (amount !== null) { total = amount; r++; } break; }
    const asideN = amount === null ? money(noteRaw) : null;
    if (amount === null && asideN === null) continue; // a label with no figure
    lines.push({ name, amount, note: asideN === null ? noteRaw.slice(0, 60) : '', aside: asideN });
  }
  const paidWith: { name: string; amount: number }[] = [];
  let blanks = 0;
  for (; r < Math.min(rows.length, h.r + 100) && blanks <= 4; r++) {
    const name = cell(rows, r, L); const amount = money(cell(rows, r, A));
    if (!name) { if (paidWith.length) break; blanks++; continue; }
    if (amount !== null) paidWith.push({ name, amount: r2(amount) });
  }
  const counted = r2(lines.reduce((a, l) => a + (l.amount ?? 0), 0));
  return { lines, total: total ?? counted, totalFrom: total === null ? 'sum' : 'sheet', asideTotal: r2(lines.reduce((a, l) => a + (l.aside ?? 0), 0)), paidWith };
}

/** Billing lines grouped by client key (aliases resolved), for dealFor(). Pure. */
export function billingByClient(lines: BillingLine[], clientKeys: string[], keyOf: (name: string) => string, aliases: Record<string, string>): { matched: Map<string, DealLine[]>; unmatched: BillingLine[] } {
  const matched = new Map<string, DealLine[]>(); const unmatched: BillingLine[] = [];
  for (const l of lines) {
    const raw = keyOf(l.name);
    const k = aliases[raw] ?? clientKeys.find((ck) => ck === raw) ?? clientKeys.filter((ck) => ck.length >= 6 && raw.startsWith(ck)).sort((a, b) => b.length - a.length)[0];
    const label = /\(([^)]+)\)/.exec(l.name)?.[1] ?? (l.monthly ? 'Monthly' : 'Per call');
    if (k) matched.set(k, [...(matched.get(k) ?? []), { label, monthly: l.monthly, perCall: l.perCall }]);
    else unmatched.push(l);
  }
  return { matched, unmatched };
}

export interface CostLine { section: string; name: string; amount: number }
export interface XeroMoney {
  /** lines: the biggest cost lines of the month (Xero P&L rows of the cost sections), largest first. */
  thisMonth: { from: string; to: string; income: number; costs: number; lines?: CostLine[]; allLines?: CostLine[] };
  lastMonth: { from: string; to: string; income: number; costs: number; lines?: CostLine[]; allLines?: CostLine[] };
  invoices: OpenInvoice[];
}
/** id = Xero InvoiceID (opens the detail), number = InvoiceNumber. */
export interface OpenInvoice { id: string; number: string; contact: string; amount: number; due: string; late: boolean }
/** The 10 biggest cost lines (zero lines dropped), largest first. Pure. */
export function topLines(lines: CostLine[] | undefined, max = 10): CostLine[] {
  return (lines ?? []).filter((l) => l.amount !== 0).sort((a, b) => b.amount - a.amount).slice(0, max).map((l) => ({ section: l.section, name: l.name, amount: Math.round(l.amount * 100) / 100 }));
}
/** Round 5: every cost line of the month (zero lines dropped), by section, largest first. Pure. */
export function costLines(lines: CostLine[] | undefined): CostLine[] {
  const order: string[] = [];
  for (const l of lines ?? []) if (!order.includes(l.section)) order.push(l.section);
  return (lines ?? []).filter((l) => l.amount !== 0).map((l) => ({ section: l.section, name: l.name, amount: r2(l.amount) }))
    .sort((a, b) => order.indexOf(a.section) - order.indexOf(b.section) || b.amount - a.amount);
}
/**
 * A Xero date as YYYY-MM-DD. Xero dates are calendar days: "2026-12-01T00:00:00" or "/Date(ms+0000)/"
 * at UTC midnight, so the day is read as written (converting midnight UTC to New York moved it a day
 * back). Pure.
 */
export function ymdOf(x: unknown): string {
  const s = String(x ?? '').trim();
  const iso = /^(\d{4}-\d{2}-\d{2})/.exec(s);
  if (iso) return iso[1];
  const t = xeroDate(s);
  return Number.isFinite(t) ? new Date(t).toISOString().slice(0, 10) : '';
}
const monthStart = (d: Date) => `${etYmd(d).slice(0, 8)}01`;
/** Xero P&L this month and last month, and open client invoices (ACCREC, AUTHORISED). */
export async function readXeroMoney(x: Pick<XeroClient, 'get' | 'pages'>, now: Date): Promise<XeroMoney> {
  const today = etYmd(now); const from = monthStart(now);
  const lastEnd = etYmd(new Date(Date.parse(`${from}T12:00:00Z`) - 86_400_000)); const lastFrom = `${lastEnd.slice(0, 8)}01`;
  const [cur, prev, inv] = await Promise.all([
    x.get('Reports/ProfitAndLoss', { fromDate: from, toDate: today }).then(parsePnl),
    x.get('Reports/ProfitAndLoss', { fromDate: lastFrom, toDate: lastEnd }).then(parsePnl),
    x.pages('Invoices', 'Invoices', { Statuses: 'AUTHORISED', summaryOnly: 'true' }, 5),
  ]);
  return {
    thisMonth: { from, to: today, income: cur.income, costs: cur.costs, lines: topLines(cur.lines), allLines: costLines(cur.lines) }, lastMonth: { from: lastFrom, to: lastEnd, income: prev.income, costs: prev.costs, lines: topLines(prev.lines), allLines: costLines(prev.lines) },
    invoices: inv.filter((i: any) => i.Type === 'ACCREC' && Number(i.AmountDue) > 0).map((i: any) => {
      const due = ymdOf(i.DueDateString ?? i.DueDate);
      return { id: String(i.InvoiceID ?? ''), number: String(i.InvoiceNumber ?? ''), contact: String(i.Contact?.Name ?? 'unknown'), amount: Number(i.AmountDue), due, late: daysOverdue(due, Number(i.AmountDue), now) > 0 };
    }).sort((a: any, b: any) => a.due.localeCompare(b.due)),
  };
}

export interface FinanceDeps { sheets?: Pick<SheetsClient, 'tab'>; xero?: Pick<XeroClient, 'get' | 'pages'> }
export interface Finance { sheet: PnlSheet | null; xero: XeroMoney | null; errors: string[]; readAt: string }
let cache: { at: number; data: Promise<Finance> } | null = null;
export function _resetFinanceCache() { cache = null; }
/** Both sources, each optional (an error becomes a short line, never a crash). Cached 5 minutes. */
export function readFinance(deps: FinanceDeps, now = new Date(), refresh = false): Promise<Finance> {
  if (cache && Date.now() - cache.at < (refresh ? 30_000 : FINANCE_CACHE_MS)) return cache.data;
  const data = (async (): Promise<Finance> => {
    const errors: string[] = [];
    const why = (e: unknown) => String((e as Error)?.message ?? e).replace(/\s+/g, ' ').slice(0, 140);
    const [sheet, xero] = await Promise.all([
      deps.sheets ? deps.sheets.tab(PNL_SHEET_ID, PNL_TAB).then(parsePnlSheet).catch((e) => { errors.push(`P/L sheet not read: ${why(e)}`); return null; }) : (errors.push('P/L sheet: Google is not set up on the server'), Promise.resolve(null)),
      deps.xero ? readXeroMoney(deps.xero, now).catch((e) => { errors.push(`Xero not read: ${why(e)}`); return null; }) : (errors.push('Xero is not connected on the server'), Promise.resolve(null)),
    ]);
    return { sheet, xero, errors, readAt: new Date().toISOString() };
  })();
  cache = { at: Date.now(), data };
  return data;
}

// ---------- Round 4 (Alex 2026-11-28): Finances = company money; Personal under it ----------
// ---------- Round 5 (Alex 2026-11-28 evening): more personal cards, Both, drill-downs ----------
/**
 * Alex's own cards. Round 4: Robinhood and Discover. Round 5: Cash Preferred, Amex Gold and Chase
 * Personal too. Everything else stays under Company until Alex says otherwise. A card is personal
 * when every word of one entry is in its name (any case, extra words fine, one typo per word fine:
 * the sheet spells "AMEX Cash Perferred"). A card marked business ("(Bus)", "Business") never is,
 * so "AMEX Gold (Bus)" stays Company while "AMEX Gold" is personal.
 */
export const PERSONAL_CARD_NAMES = ['cash preferred', 'amex gold', 'chase personal', 'robinhood', 'discover'] as const;
export type PersonalCardKey = (typeof PERSONAL_CARD_NAMES)[number];
const BUSINESS_WORD = /^(bus|business|biz)$/;
const words = (name: string) => String(name ?? '').toLowerCase().replace(/american\s+express/g, 'amex').replace(/[^a-z0-9]+/g, ' ').trim().split(' ').filter(Boolean);
/** Optimal string alignment distance of at most 1 (one typo: a wrong, missing, extra or swapped letter), words of 5+ letters. */
function oneEdit(a: string, b: string): boolean {
  if (a === b) return true;
  if (Math.abs(a.length - b.length) > 1 || Math.min(a.length, b.length) < 5) return false;
  const d: number[][] = Array.from({ length: a.length + 1 }, (_, i) => Array.from({ length: b.length + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0)));
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
    }
  }
  return d[a.length][b.length] <= 1;
}
/** Which personal entry a card name is ("AMEX Cash Perferred" → "cash preferred"), or null (Company). Pure. */
export function personalCardKey(name: string): PersonalCardKey | null {
  const w = words(name);
  if (!w.length || w.some((x) => BUSINESS_WORD.test(x))) return null;
  return PERSONAL_CARD_NAMES.find((k) => k.split(' ').every((kw) => w.some((x) => oneEdit(kw, x)))) ?? null;
}
export const isPersonalCard = (name: string) => personalCardKey(name) !== null;
/** A personal card carries which entry it matched, so a linked (Plaid) account can stand in for it. */
export type KeyedCard = CardDebt & { key?: PersonalCardKey };
export interface CardSplit { company: CardDebt[]; personal: KeyedCard[]; companyTotals: PnlSheet['cardTotals']; personalTotals: PnlSheet['cardTotals'] }
const totals = (cards: CardDebt[]): PnlSheet['cardTotals'] => {
  const sum = (k: 'statement' | 'balance' | 'minimum') => Math.round(cards.reduce((a, c) => a + c[k], 0) * 100) / 100;
  return { statement: sum('statement'), balance: sum('balance'), minimum: sum('minimum') };
};
/** Cards split into company and personal by name (personalCardKey), each with its own totals. Pure. */
export function splitCards(cards: CardDebt[]): CardSplit {
  const personal: KeyedCard[] = []; const company: CardDebt[] = [];
  for (const c of cards) { const key = personalCardKey(c.card); if (key) personal.push({ ...c, key }); else company.push(c); }
  return { company, personal, companyTotals: totals(company), personalTotals: totals(personal) };
}

// ---------- Both: what is left over at the end of the month ----------
export interface LeftoverPart { label: string; amount: number | null; source: string }
export interface Leftover { label: string; from: string; to: string; left: number | null; parts: LeftoverPart[]; unknown: string[] }
/**
 * Company + Personal for one month: company income − company costs (Xero) − personal expenses (the
 * P/L sheet's monthly list). Any input that is not known makes the result UNKNOWN (null) and is named
 * in `unknown`; nothing is guessed or spread over the days. Pure.
 */
export function leftover(m: { label: string; from: string; to: string; income: number | null; costs: number | null } | null, personalMonthly: number | null, label = m?.label ?? ''): Leftover {
  const parts: LeftoverPart[] = [
    { label: 'Company income', amount: m?.income ?? null, source: 'Xero profit and loss' },
    { label: 'Company costs', amount: m?.costs === null || m?.costs === undefined ? null : -m.costs, source: 'Xero profit and loss' },
    { label: 'Personal expenses', amount: personalMonthly === null ? null : -personalMonthly, source: 'P/L sheet, monthly list' },
  ];
  const unknown = parts.filter((p) => p.amount === null).map((p) => p.label);
  const left = unknown.length ? null : r2(parts.reduce((a, p) => a + (p.amount ?? 0), 0));
  return { label, from: m?.from ?? '', to: m?.to ?? '', left, parts: parts.map((p) => ({ ...p, amount: p.amount === null ? null : r2(p.amount) })), unknown };
}

export interface FinancesView {
  company: {
    /** Xero P&L (the tool, not the hand-kept sheet): income and costs, this month so far and last month. */
    xero: (XeroMoney['thisMonth'] & { net: number; label: string })[] | null;
    invoices: XeroMoney['invoices'];
    /** Retainers of active clients (deal terms), for comparison with Xero income. */
    mrr: number;
    cards: CardDebt[] | null; cardTotals: PnlSheet['cardTotals'] | null;
  };
  personal: { cards: KeyedCard[] | null; cardTotals: PnlSheet['cardTotals'] | null; expenses: PersonalExpenses | null };
  /** Round 5: Company + Personal, this month so far and last month. */
  both: { months: Leftover[]; notCounted: string[] };
  sources: { income: string; cards: string; personalRule: string; expenses: string };
  errors: string[]; readAt: string;
}
export const NOT_COUNTED = [
  'Personal income from outside Dulcy: not tracked (UNKNOWN), not counted.',
  'Card balances and minimums: the spending on the cards is in the costs and expenses already, so card payments are not counted again.',
  'This month so far: company income and costs to today; personal expenses for the whole month.',
  'Coming up: costs beside the list in the P/L sheet (e.g. HOA, health insurance, paused savings) are not paid yet, so they are not counted until you start paying them (Alex 2026-11-28).',
];
/** GET /finances (owner only, checked in the route). Pure. */
export function financesView(fin: Finance, mrr: number): FinancesView {
  const x = fin.xero;
  const split = fin.sheet ? splitCards(fin.sheet.cards) : null;
  const expenses = fin.sheet?.personal ?? null;
  const month = (m: XeroMoney['thisMonth'], label: string) => ({ ...m, label, net: Math.round((m.income - m.costs) * 100) / 100 });
  const months = x ? [month(x.thisMonth, 'This month so far'), month(x.lastMonth, 'Last month')] : null;
  const personalMonthly = expenses ? expenses.total : null;
  return {
    company: {
      xero: months,
      invoices: x?.invoices ?? [], mrr,
      cards: split ? split.company : null, cardTotals: split ? split.companyTotals : null,
    },
    personal: { cards: split ? split.personal : null, cardTotals: split ? split.personalTotals : null, expenses },
    both: {
      months: months ? months.map((m) => leftover(m, personalMonthly)) : [leftover(null, personalMonthly, 'This month so far'), leftover(null, personalMonthly, 'Last month')],
      notCounted: NOT_COUNTED,
    },
    sources: {
      income: 'Xero profit and loss (read only)',
      cards: 'Dulcy Media P/L sheet (kept by hand; Xero has no card balances in HQ yet)',
      personalRule: 'Personal cards = Cash Preferred, Amex Gold, Chase Personal, Robinhood and Discover (Alex, 2026-11-28). A card marked business, and every other card, shows under Company.',
      expenses: 'Dulcy Media P/L sheet, personal expenses (monthly list; read only)',
    },
    errors: fin.errors, readAt: fin.readAt,
  };
}

// ---------- Round 5: one open client invoice, in detail (Xero, read only) ----------
export const XERO_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export interface InvoiceLine { description: string; quantity: number | null; unitAmount: number | null; amount: number | null }
export interface InvoiceDetail {
  id: string; number: string; reference: string; contact: string; status: string; currency: string;
  date: string; due: string; daysOverdue: number;
  total: number | null; paid: number | null; amountDue: number | null;
  lines: InvoiceLine[];
  /** Opens the invoice in Xero (Xero's own deep link). Read here; never changed from HQ. */
  xeroUrl: string;
}
const numOrNull = (x: unknown) => { const v = Number(x); return x === null || x === undefined || x === '' || !Number.isFinite(v) ? null : r2(v); };
/** Days late: whole days from the due day to today (New York); 0 when not due yet or nothing is owed. Pure. */
export function daysOverdue(due: string, amountDue: number | null, now: Date): number {
  if (!due || !amountDue || amountDue <= 0) return 0;
  const d = Math.round((Date.parse(`${etYmd(now)}T12:00:00Z`) - Date.parse(`${due}T12:00:00Z`)) / 86_400_000);
  return Number.isFinite(d) && d > 0 ? d : 0;
}
/** A Xero Invoices/{id} answer → what the drill-down shows. Client invoices (ACCREC) only. Pure. */
export function parseInvoice(i: any, now: Date): InvoiceDetail | null {
  if (!i || i.Type !== 'ACCREC') return null;
  const id = String(i.InvoiceID ?? '');
  const due = ymdOf(i.DueDateString ?? i.DueDate);
  const amountDue = numOrNull(i.AmountDue);
  return {
    id, number: String(i.InvoiceNumber ?? ''), reference: String(i.Reference ?? '').slice(0, 200), contact: String(i.Contact?.Name ?? 'unknown'),
    status: String(i.Status ?? ''), currency: String(i.CurrencyCode ?? ''),
    date: ymdOf(i.DateString ?? i.Date), due, daysOverdue: daysOverdue(due, amountDue, now),
    total: numOrNull(i.Total), paid: numOrNull(i.AmountPaid), amountDue,
    lines: (Array.isArray(i.LineItems) ? i.LineItems : []).slice(0, 100).map((l: any) => ({
      description: String(l.Description ?? l.ItemCode ?? '').slice(0, 500), quantity: numOrNull(l.Quantity), unitAmount: numOrNull(l.UnitAmount), amount: numOrNull(l.LineAmount),
    })),
    xeroUrl: XERO_ID.test(id) ? `https://go.xero.com/AccountsReceivable/View.aspx?InvoiceID=${id}` : '',
  };
}
/** GET /finances/invoices/<id> (owner only, checked in the route): one GET to Xero, nothing written. */
export async function readInvoice(x: Pick<XeroClient, 'get'>, id: string, now = new Date()): Promise<InvoiceDetail | null> {
  if (!XERO_ID.test(id)) return null;
  const j = await x.get(`Invoices/${id}`);
  return parseInvoice(j?.Invoices?.[0], now);
}

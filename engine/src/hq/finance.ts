// Batch 2 (Alex 2026-11-27): owner-only money on the Clients screen. Read only, never stored in git.
//   - Xero (Ledger's read-only client): income and costs this month and last month (Profit and
//     Loss), and open client invoices split into "coming up" (not due yet) and "late".
//   - The "Dulcy Media P/L" Google Sheet (Alex OK'd reading it; the engine reads Sheets as
//     scale@dulcy.io): the client billing lines (who pays what, retainer and per call) and the
//     card debts across accounts. Only those two blocks are read out; the rest of the tab
//     (personal lines) is never sent anywhere.
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
export interface PnlSheet { billing: BillingLine[]; cards: CardDebt[]; cardTotals: { statement: number; balance: number; minimum: number } }

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
  return { billing, cards, cardTotals: { statement: sum('statement'), balance: sum('balance'), minimum: sum('minimum') } };
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
  thisMonth: { from: string; to: string; income: number; costs: number; lines?: CostLine[] };
  lastMonth: { from: string; to: string; income: number; costs: number; lines?: CostLine[] };
  invoices: { contact: string; amount: number; due: string; late: boolean }[];
}
/** The 10 biggest cost lines (zero lines dropped), largest first. Pure. */
export function topLines(lines: CostLine[] | undefined, max = 10): CostLine[] {
  return (lines ?? []).filter((l) => l.amount !== 0).sort((a, b) => b.amount - a.amount).slice(0, max).map((l) => ({ section: l.section, name: l.name, amount: Math.round(l.amount * 100) / 100 }));
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
    thisMonth: { from, to: today, income: cur.income, costs: cur.costs, lines: topLines(cur.lines) }, lastMonth: { from: lastFrom, to: lastEnd, income: prev.income, costs: prev.costs, lines: topLines(prev.lines) },
    invoices: inv.filter((i: any) => i.Type === 'ACCREC' && Number(i.AmountDue) > 0).map((i: any) => {
      const t = xeroDate(i.DueDateString ?? i.DueDate);
      return { contact: String(i.Contact?.Name ?? 'unknown'), amount: Number(i.AmountDue), due: Number.isFinite(t) ? etYmd(new Date(t)) : '', late: Number.isFinite(t) && t < now.getTime() - 86_400_000 };
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
/**
 * Which P/L sheet cards are Alex's own: Robinhood and Discover (Alex named them, 2026-11-28).
 * The sheet does not say which card is business or personal, so only these names go to Personal;
 * every other card stays under Company until Alex says otherwise.
 */
export const PERSONAL_CARD_NAMES = ['robinhood', 'discover'] as const;
export const PERSONAL_CARD = new RegExp(PERSONAL_CARD_NAMES.join('|'), 'i');
export interface CardSplit { company: CardDebt[]; personal: CardDebt[]; companyTotals: PnlSheet['cardTotals']; personalTotals: PnlSheet['cardTotals'] }
const totals = (cards: CardDebt[]): PnlSheet['cardTotals'] => {
  const sum = (k: 'statement' | 'balance' | 'minimum') => Math.round(cards.reduce((a, c) => a + c[k], 0) * 100) / 100;
  return { statement: sum('statement'), balance: sum('balance'), minimum: sum('minimum') };
};
/** Cards split into company and personal by name (PERSONAL_CARD), each with its own totals. Pure. */
export function splitCards(cards: CardDebt[]): CardSplit {
  const personal = cards.filter((c) => PERSONAL_CARD.test(c.card)); const company = cards.filter((c) => !PERSONAL_CARD.test(c.card));
  return { company, personal, companyTotals: totals(company), personalTotals: totals(personal) };
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
  personal: { cards: CardDebt[] | null; cardTotals: PnlSheet['cardTotals'] | null };
  sources: { income: string; cards: string; personalRule: string };
  errors: string[]; readAt: string;
}
/** GET /finances (owner only, checked in the route). Pure. */
export function financesView(fin: Finance, mrr: number): FinancesView {
  const x = fin.xero;
  const split = fin.sheet ? splitCards(fin.sheet.cards) : null;
  const month = (m: XeroMoney['thisMonth'], label: string) => ({ ...m, label, net: Math.round((m.income - m.costs) * 100) / 100 });
  return {
    company: {
      xero: x ? [month(x.thisMonth, 'This month so far'), month(x.lastMonth, 'Last month')] : null,
      invoices: x?.invoices ?? [], mrr,
      cards: split ? split.company : null, cardTotals: split ? split.companyTotals : null,
    },
    personal: { cards: split ? split.personal : null, cardTotals: split ? split.personalTotals : null },
    sources: {
      income: 'Xero profit and loss (read only)',
      cards: 'Dulcy Media P/L sheet (kept by hand; Xero has no card balances in HQ yet)',
      personalRule: 'Personal = cards named Robinhood or Discover (Alex, 2026-11-28). The sheet does not mark business vs personal, so every other card shows under Company.',
    },
    errors: fin.errors, readAt: fin.readAt,
  };
}

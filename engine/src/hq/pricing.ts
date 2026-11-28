// Round 3 (Alex 2026-11-27): the pricing calculator from the "Dulcy Media P/L" Google Sheet, in Sales,
// to set what to charge a client. The sheet is read at runtime (read only, cached 10 minutes). Nothing
// is written to the sheet. No figure from the sheet is ever kept in this repo: tests use a fake sheet.
// Round 4 (Alex 2026-11-28: "inbox cost per team hour, team hours a month, target margin: this was not
// in my sheet"): those came from a built-in fallback HQ showed because no tab of the P/L sheet is named
// "Pricing" or "Calculator". The sheet's calculator is the "OPEX Guide" tab: one block per plan, headed
// "Client Fulfillment - <plan>" with a "Cost" column:
//   Retainer · Rev Share · Cheap Inboxes (inboxes × price) · Domains · Domain Masking ·
//   Scraping / Verification / LinkedIn Verify / Company Verify credits (leads × cost per lead) ·
//   tool seats (HeyReach, RB2B…) · one-off builds (first month only),
//   then Cost Monthly, Profit Monthly, Act. Opex Monthly (cost ÷ revenue), Profit Margin Monthly, and
//   the same "Setup" lines for the first month.
// HQ reads those blocks and uses ONLY their lines as inputs (pick a plan, change any line); the results
// are the sheet's own sums. No team hours, no target margin. One value is not the sheet's: the price
// per inbox is Dulcy's $2.50 (RULES 2026-11-28, Cheap Inboxes discount), labelled so on screen.
// When the sheet cannot be read, the same line names are shown empty (only $2.50 per inbox filled in).
// The formula reader (evaluate) works out the sheet's line formulas (+ - * / ^ %, SUM, AVERAGE, MIN,
// MAX, ROUND/UP/DOWN, IF, IFERROR, ABS, AND, OR).
import type { SheetsClient } from '../providers/google.js';

export const PNL_SHEET_ID = '1nUf28kpRs2olqUIIfdrVdyH1q67hRT-zhmaD9UL3knM';
/** The calculator tab: "OPEX Guide" (Round 4: Alex's sheet has no tab named Pricing), else one named like Pricing / Calculator. */
export const PRICING_TAB_RE = /opex|pricing|calculator/i;
export interface SheetGrid { tab: string; values: string[][]; formulas: string[][]; readAt: string }

// ---------- cells ----------
export const colName = (i: number) => { let n = i + 1, s = ''; while (n > 0) { const r = (n - 1) % 26; s = String.fromCharCode(65 + r) + s; n = Math.floor((n - 1) / 26); } return s; };
const colIndex = (letters: string) => [...letters.toUpperCase()].reduce((a, ch) => a * 26 + ch.charCodeAt(0) - 64, 0) - 1;
export const refOf = (r: number, c: number) => `${colName(c)}${r + 1}`;
const parseRef = (ref: string) => { const m = /^\$?([A-Z]{1,3})\$?(\d+)$/i.exec(ref); return m ? { c: colIndex(m[1]), r: Number(m[2]) - 1 } : null; };
/** A shown value → a number ("$2,500.00" → 2500, "45%" → 0.45, "(1,200)" → -1200). null = not a number. Pure. */
export function numberOf(shown: string): number | null {
  let t = String(shown ?? '').trim();
  if (!t) return null;
  const neg = /^\(.*\)$/.test(t) || /^-/.test(t); t = t.replace(/[()]/g, '').replace(/^-/, '');
  const pct = /%$/.test(t);
  t = t.replace(/[$€£,\s%]/g, '');
  if (!/^\d*\.?\d+(e[+-]?\d+)?$/i.test(t)) return null;
  const n = Number(t) * (pct ? 0.01 : 1) * (neg ? -1 : 1);
  return Number.isFinite(n) ? n : null;
}

// ---------- the formula reader ----------
export class Unsupported extends Error {}
type Tok = { t: 'num'; v: number } | { t: 'str'; v: string } | { t: 'ref'; v: string } | { t: 'range'; a: string; b: string } | { t: 'fn'; v: string } | { t: 'op'; v: string };
function tokens(src: string): Tok[] {
  const out: Tok[] = []; let i = 0;
  while (i < src.length) {
    const ch = src[i];
    if (/\s/.test(ch)) { i++; continue; }
    if (ch === '"') { const j = src.indexOf('"', i + 1); if (j < 0) throw new Unsupported('string'); out.push({ t: 'str', v: src.slice(i + 1, j) }); i = j + 1; continue; }
    if (ch === "'" || /^[A-Za-z_][\w. ]*!/.test(src.slice(i))) throw new Unsupported('another tab');
    const num = /^\d*\.?\d+(?:e[+-]?\d+)?/i.exec(src.slice(i));
    if (num && !/^[A-Za-z]/.test(src.slice(i))) { out.push({ t: 'num', v: Number(num[0]) }); i += num[0].length; continue; }
    const range = /^(\$?[A-Za-z]{1,3}\$?\d+):(\$?[A-Za-z]{1,3}\$?\d+)/.exec(src.slice(i));
    if (range) { out.push({ t: 'range', a: range[1].replace(/\$/g, '').toUpperCase(), b: range[2].replace(/\$/g, '').toUpperCase() }); i += range[0].length; continue; }
    const ref = /^\$?[A-Za-z]{1,3}\$?\d+(?![\w(])/.exec(src.slice(i));
    if (ref) { out.push({ t: 'ref', v: ref[0].replace(/\$/g, '').toUpperCase() }); i += ref[0].length; continue; }
    const fn = /^([A-Za-z][A-Za-z0-9.]*)\s*\(/.exec(src.slice(i));
    if (fn) { out.push({ t: 'fn', v: fn[1].toUpperCase() }); i += fn[0].length; continue; }
    if (/^(TRUE|FALSE)\b/i.test(src.slice(i))) { const v = /^TRUE/i.test(src.slice(i)); out.push({ t: 'num', v: v ? 1 : 0 }); i += v ? 4 : 5; continue; }
    const op = /^(<=|>=|<>|[-+*/^&=<>(),%;])/.exec(src.slice(i));
    if (op) { out.push({ t: 'op', v: op[0] === ';' ? ',' : op[0] }); i += op[0].length; continue; }
    throw new Unsupported(`"${src.slice(i, i + 10)}"`);
  }
  return out;
}
type Val = number | string | Val[];
const n = (v: Val): number => { if (Array.isArray(v)) throw new Unsupported('range in math'); if (typeof v === 'number') return v; if (v === '') return 0; const x = numberOf(v); if (x === null) throw new Error('#VALUE!'); return x; };
const flat = (vs: Val[]): number[] => vs.flatMap((v) => (Array.isArray(v) ? flat(v) : typeof v === 'number' ? [v] : numberOf(v) === null ? [] : [numberOf(v) as number]));
const roundTo = (x: number, d: number, how: 'near' | 'up' | 'down') => { const f = 10 ** d; const y = x * f; const r = how === 'near' ? Math.round(Math.abs(y)) * Math.sign(y) : how === 'up' ? Math.ceil(Math.abs(y)) * Math.sign(y) : Math.floor(Math.abs(y)) * Math.sign(y); return r / f; };

/** Work out one formula ("=B2*(1+B3)") with get(ref) for cell values. Throws Unsupported for what it does not know. */
export function evaluate(formula: string, get: (ref: string) => Val): number | string {
  const ts = tokens(formula.replace(/^=/, '')); let p = 0;
  const peek = () => ts[p]; const isOp = (v: string) => { const t = ts[p]; return t?.t === 'op' && t.v === v; };
  const eat = (v: string) => { if (!isOp(v)) throw new Unsupported(`expected ${v}`); p++; };
  const range = (a: string, b: string): Val[] => {
    const x = parseRef(a)!, y = parseRef(b)!; const out: Val[] = [];
    if ((Math.abs(y.r - x.r) + 1) * (Math.abs(y.c - x.c) + 1) > 2000) throw new Unsupported('range too big');
    for (let r = Math.min(x.r, y.r); r <= Math.max(x.r, y.r); r++) for (let c = Math.min(x.c, y.c); c <= Math.max(x.c, y.c); c++) out.push(get(refOf(r, c)));
    return out;
  };
  const call = (name: string): Val => {
    const args: (() => Val)[] = []; const lazy: number[] = [];
    if (!isOp(')')) {
      for (;;) { const start = p; skipArg(); const end = p; args.push(() => { const save = p; p = start; try { const v = expr(0); if (p !== end) throw new Unsupported('arg'); return v; } finally { p = save; } }); lazy.push(start); if (isOp(',')) { p++; continue; } break; }
    }
    eat(')');
    const all = () => args.map((a) => a());
    switch (name) {
      case 'SUM': return flat(all()).reduce((a, b) => a + b, 0);
      case 'AVERAGE': { const xs = flat(all()); if (!xs.length) throw new Error('#DIV/0!'); return xs.reduce((a, b) => a + b, 0) / xs.length; }
      case 'MIN': { const xs = flat(all()); return xs.length ? Math.min(...xs) : 0; }
      case 'MAX': { const xs = flat(all()); return xs.length ? Math.max(...xs) : 0; }
      case 'ROUND': case 'ROUNDUP': case 'ROUNDDOWN': { const [a, d] = all(); return roundTo(n(a), d === undefined ? 0 : n(d), name === 'ROUND' ? 'near' : name === 'ROUNDUP' ? 'up' : 'down'); }
      case 'ABS': return Math.abs(n(args[0]()));
      case 'IF': { const c = n(args[0]()); return c ? (args[1] ? args[1]() : 1) : args[2] ? args[2]() : 0; }
      case 'IFERROR': { try { const v = args[0](); if (typeof v === 'number' && !Number.isFinite(v)) throw new Error('#DIV/0!'); return v; } catch (e) { if (e instanceof Unsupported) throw e; return args[1] ? args[1]() : ''; } }
      case 'AND': return all().every((v) => n(v)) ? 1 : 0;
      case 'OR': return all().some((v) => n(v)) ? 1 : 0;
    }
    throw new Unsupported(`function ${name}`);
  };
  // Skip one argument without working it out (IF / IFERROR only work out the branch they need).
  const skipArg = () => { let depth = 0; while (p < ts.length) { const t = ts[p]; if (t.t === 'fn') depth++; else if (t.t === 'op' && t.v === '(') depth++; else if (t.t === 'op' && t.v === ')') { if (!depth) return; depth--; } else if (t.t === 'op' && t.v === ',' && !depth) return; p++; } };
  const prim = (): Val => {
    const t = peek(); if (!t) throw new Unsupported('end');
    p++;
    if (t.t === 'num') return t.v;
    if (t.t === 'str') return t.v;
    if (t.t === 'ref') return get(t.v);
    if (t.t === 'range') return range(t.a, t.b);
    if (t.t === 'fn') return call(t.v);
    if (t.v === '(') { const v = expr(0); eat(')'); return v; }
    if (t.v === '-') return -n(unary());
    if (t.v === '+') return n(unary());
    throw new Unsupported(`"${t.v}"`);
  };
  const unary = (): Val => { let v = prim(); while (isOp('%')) { p++; v = n(v) / 100; } return v; };
  const BP: Record<string, number> = { '=': 1, '<>': 1, '<': 1, '>': 1, '<=': 1, '>=': 1, '&': 2, '+': 3, '-': 3, '*': 4, '/': 4, '^': 5 };
  const expr = (min: number): Val => {
    let left = unary();
    for (;;) {
      const t = peek(); if (!t || t.t !== 'op' || !(t.v in BP) || BP[t.v] < min) return left;
      p++; const right = expr(BP[t.v] + (t.v === '^' ? 0 : 1)); const a = left, b = right;
      switch (t.v) {
        case '+': left = n(a) + n(b); break; case '-': left = n(a) - n(b); break; case '*': left = n(a) * n(b); break;
        case '/': if (n(b) === 0) throw new Error('#DIV/0!'); left = n(a) / n(b); break;
        case '^': left = n(a) ** n(b); break; case '&': left = `${a}${b}`; break;
        case '=': left = (typeof a === 'string' || typeof b === 'string' ? String(a) === String(b) : n(a) === n(b)) ? 1 : 0; break;
        case '<>': left = (typeof a === 'string' || typeof b === 'string' ? String(a) !== String(b) : n(a) !== n(b)) ? 1 : 0; break;
        case '<': left = n(a) < n(b) ? 1 : 0; break; case '>': left = n(a) > n(b) ? 1 : 0; break;
        case '<=': left = n(a) <= n(b) ? 1 : 0; break; case '>=': left = n(a) >= n(b) ? 1 : 0; break;
      }
    }
  };
  const v = expr(0);
  if (p !== ts.length) throw new Unsupported('extra');
  if (Array.isArray(v)) throw new Unsupported('range result');
  return v;
}

// ---------- the calculator model (the OPEX Guide "Client Fulfillment" blocks) ----------
export type PriceGroup = 'revenue' | 'volume' | 'monthly' | 'oneoff';
export interface PriceInput { key: string; label: string; value: number; kind: 'money' | 'number'; group: PriceGroup; note?: string }
export interface PriceOutput { key: string; label: string; value: number | null; kind: 'money' | 'pct'; note?: string }
export interface PricePlan { key: string; name: string; inputs: PriceInput[]; sheetProfit: number | null; sheetInboxPrice?: number }
export interface PricingModel {
  source: 'sheet' | 'builtin'; tab: string; readAt: string; plans: { key: string; name: string }[]; plan: string;
  inputs: PriceInput[]; outputs: PriceOutput[]; assumptions: string[]; error?: string;
}

/** Dulcy's price per inbox a month (RULES 2026-11-28: Cheap Inboxes discount). Not a sheet figure. */
export const INBOX_PRICE = 2.5;
export const PLAN_HEADER_RE = /^\s*client fulfil+ment\s*[-–—:]\s*(.+?)\s*$/i;
const RESULT_RE = /^\s*(cost|profit|alex profit|kevin profit|act\.?\s*opex|opex|profit margin)\b/i;
const REVENUE_RE = /retainer|rev(enue)?\s*share|upfront|charge|setup fee/i;
const INBOX_RE = /cheap\s*inbox|inboxes/i;
const usd0 = (x: number) => `${x < 0 ? '-' : ''}$${Math.abs(Math.round(x)).toLocaleString('en-US')}`;

/** Every "Client Fulfillment - <plan>" block of a tab, as calculator inputs (only the sheet's own lines). Pure. */
export function parsePlans(g: SheetGrid): PricePlan[] {
  const raw = (r: number, c: number) => String(g.formulas[r]?.[c] ?? '').trim();
  const shownAt = (r: number, c: number) => String(g.values[r]?.[c] ?? '').trim();
  const memo = new Map<string, Val>(); const busy = new Set<string>();
  // A cell's number: a typed number as written (full precision, "-0.0048"), else its formula worked out, else the shown value.
  const get = (ref: string): Val => {
    const x = parseRef(ref); if (!x) return '';
    if (memo.has(ref)) return memo.get(ref)!;
    const f = raw(x.r, x.c);
    let v: Val;
    if (f.startsWith('=')) {
      if (busy.has(ref)) throw new Unsupported('circular');
      busy.add(ref);
      try { v = evaluate(f, get); } catch { v = numberOf(shownAt(x.r, x.c)) ?? shownAt(x.r, x.c); } finally { busy.delete(ref); }
    } else v = numberOf(f) ?? numberOf(shownAt(x.r, x.c)) ?? shownAt(x.r, x.c);
    memo.set(ref, v); return v;
  };
  const num = (r: number, c: number): number | null => { const v = get(refOf(r, c)); return typeof v === 'number' && Number.isFinite(v) ? v : null; };
  const text = (r: number, c: number) => shownAt(r, c) || (raw(r, c).startsWith('=') ? '' : raw(r, c));
  const rows = Math.max(g.values.length, g.formulas.length);
  const heads: { r: number; c: number; name: string }[] = [];
  for (let r = 0; r < rows; r++) {
    const width = Math.max(g.values[r]?.length ?? 0, g.formulas[r]?.length ?? 0);
    for (let c = 0; c < width; c++) { const m = PLAN_HEADER_RE.exec(text(r, c)); if (m) heads.push({ r, c, name: m[1].slice(0, 60) }); }
  }
  const rangeRows = (f: string) => { const m = /SUM\s*\(\s*\$?[A-Z]{1,3}\$?(\d+)\s*:\s*\$?[A-Z]{1,3}\$?(\d+)\s*\)/i.exec(f); return m ? [Number(m[1]) - 1, Number(m[2]) - 1] as const : null; };
  const plans: PricePlan[] = [];
  for (const h of heads) {
    const end = heads.find((o) => o.c === h.c && o.r > h.r)?.r ?? rows;
    const lines: { r: number; label: string }[] = []; const results: { r: number; label: string; f: string }[] = [];
    for (let r = h.r + 1; r < end; r++) {
      const label = text(r, h.c); if (!label) continue;
      if (RESULT_RE.test(label) && !REVENUE_RE.test(label)) { results.push({ r, label, f: raw(r, h.c + 1) }); continue; }
      if (results.length) break; // a new list below the results: not this block
      if (num(r, h.c + 1) === null) continue;
      lines.push({ r, label: label.slice(0, 80) });
    }
    if (!lines.length) continue;
    // Monthly lines = the rows in "Cost Monthly"'s SUM range; the rest (in "Cost Setup") are first month only.
    const monthly = rangeRows(results.find((x) => /^\s*cost monthly/i.test(x.label))?.f ?? '');
    const inputs: PriceInput[] = []; let leads: number | null = null; let sheetInboxPrice: number | undefined;
    for (const l of lines) {
      const f = raw(l.r, h.c + 1); const v = num(l.r, h.c + 1) ?? 0; const key = `r${l.r + 1}`;
      if (REVENUE_RE.test(l.label)) { inputs.push({ key, label: l.label, value: v, kind: 'money', group: 'revenue' }); continue; }
      const inbox = INBOX_RE.test(l.label) ? /^=\s*\(?\s*(\d+(?:\.\d+)?)\s*\*\s*\(?\s*-?\s*\$?(\d+(?:\.\d+)?)\s*\)?\s*$/.exec(f) : null;
      if (inbox && !inputs.some((i) => i.key === 'inboxes')) {
        sheetInboxPrice = Number(inbox[2]);
        inputs.push({ key: 'inboxes', label: 'Inboxes', value: Number(inbox[1]), kind: 'number', group: 'volume', note: `the sheet's ${l.label} line (inboxes × price)` });
        inputs.push({ key: 'inboxPrice', label: 'Price per inbox a month', value: INBOX_PRICE, kind: 'money', group: 'monthly', note: `Dulcy's Cheap Inboxes price (RULES 2026-11-28)${sheetInboxPrice !== INBOX_PRICE ? `; the sheet line uses $${sheetInboxPrice.toFixed(2)}` : ''}` });
        continue;
      }
      const perLead = /^=\s*(?:SUM\s*\(\s*)?(\d+(?:\.\d+)?)\s*\*\s*(\$?[A-Z]{1,3}\$?\d+)\s*\)?\s*$/i.exec(f);
      const unitRef = perLead ? parseRef(perLead[2].replace(/\$/g, '')) : null;
      const unit = unitRef ? num(unitRef.r, unitRef.c) : null;
      if (perLead && unit !== null) {
        if (leads === null) { leads = Number(perLead[1]); inputs.push({ key: 'leads', label: 'Leads a month', value: leads, kind: 'number', group: 'volume', note: "the lead count in the sheet's credit lines" }); }
        inputs.push({ key: `u${l.r + 1}`, label: `${l.label} per lead`, value: Math.abs(unit), kind: 'money', group: 'monthly' });
        continue;
      }
      const oneoff = monthly ? l.r < monthly[0] || l.r > monthly[1] : false;
      inputs.push({ key, label: l.label, value: Math.abs(v), kind: 'money', group: oneoff ? 'oneoff' : 'monthly', ...(oneoff ? { note: 'first month only' } : {}) });
    }
    // The sheet's own monthly profit for this block, to check HQ adds it up the same way.
    const pr = results.find((x) => /^\s*(alex\s+)?profit monthly/i.test(x.label));
    plans.push({ key: '', name: h.name, inputs, sheetProfit: pr ? num(pr.r, h.c + 1) : null, ...(sheetInboxPrice !== undefined ? { sheetInboxPrice } : {}) });
  }
  // Names: the plan; with its retainer when two plans share a name; then a number.
  const named = plans.map((p) => { const ret = p.inputs.find((i) => i.group === 'revenue'); return plans.filter((q) => q.name === p.name).length > 1 && ret ? `${p.name} · ${usd0(ret.value)}` : p.name; });
  return plans.map((p, i) => { const dup = named.slice(0, i).filter((x) => x === named[i]).length; return { ...p, key: `p${i + 1}`, name: dup ? `${named[i]} (${dup + 1})` : named[i] }; });
}

/** The results for one plan with the owner's changes: the sheet's sums (cost, profit, opex, margin; the first month when it has one-off lines). Pure. */
export function priceResults(inputs: PriceInput[]): PriceOutput[] {
  const v = (k: string) => inputs.find((i) => i.key === k)?.value ?? 0;
  const isUnit = (i: PriceInput) => /^u\d+$/.test(i.key);
  const sum = (xs: PriceInput[]) => xs.reduce((a, i) => a + i.value, 0);
  const revenue = sum(inputs.filter((i) => i.group === 'revenue'));
  const cost = v('inboxes') * v('inboxPrice') + v('leads') * sum(inputs.filter(isUnit))
    + sum(inputs.filter((i) => i.group === 'monthly' && i.key !== 'inboxPrice' && !isUnit(i)));
  const once = sum(inputs.filter((i) => i.group === 'oneoff'));
  const r2 = (x: number) => Math.round(x * 100) / 100;
  const share = (x: number) => (revenue ? Math.round((x / revenue) * 1000) / 1000 : null);
  const out: PriceOutput[] = [
    { key: 'revenue', label: 'Revenue a month', value: r2(revenue), kind: 'money', note: 'retainer + rev share' },
    { key: 'cost', label: 'Cost a month', value: r2(cost), kind: 'money', note: 'the sheet\'s "Cost Monthly"' },
    { key: 'profit', label: 'Profit a month', value: r2(revenue - cost), kind: 'money', note: 'the sheet\'s "Profit Monthly"' },
    { key: 'opex', label: 'Opex', value: share(cost), kind: 'pct', note: 'cost ÷ revenue (the sheet\'s "Act. Opex Monthly")' },
    { key: 'margin', label: 'Profit margin', value: share(revenue - cost), kind: 'pct', note: '1 − opex' },
  ];
  if (inputs.some((i) => i.group === 'oneoff')) {
    out.push(
      { key: 'costFirst', label: 'Cost, first month', value: r2(cost + once), kind: 'money', note: 'monthly cost + one-off lines (the sheet\'s "Cost Setup")' },
      { key: 'profitFirst', label: 'Profit, first month', value: r2(revenue - cost - once), kind: 'money', note: 'the sheet\'s "Profit Setup"' },
      { key: 'marginFirst', label: 'Profit margin, first month', value: share(revenue - cost - once), kind: 'pct' },
    );
  }
  return out;
}

/** The calculator for one plan (default: the first), with the owner's changes by input key. Pure. */
export function pricingModel(plans: PricePlan[], opts: { plan?: string; overrides?: Record<string, number>; source?: 'sheet' | 'builtin'; tab?: string; readAt?: string; assumptions?: string[] } = {}): PricingModel {
  const p = plans.find((x) => x.key === opts.plan) ?? plans[0];
  const o = opts.overrides ?? {};
  const inputs = (p?.inputs ?? []).map((i) => (Number.isFinite(o[i.key]) ? { ...i, value: o[i.key] } : i));
  const assumptions = [...(opts.assumptions ?? [])];
  // Check: with the sheet's own numbers (its inbox price too), HQ's profit must match the sheet's Profit Monthly.
  if (p && p.sheetProfit !== null && (opts.source ?? 'sheet') === 'sheet') {
    const asSheet = priceResults(p.inputs.map((i) => (i.key === 'inboxPrice' && p.sheetInboxPrice !== undefined ? { ...i, value: p.sheetInboxPrice } : i))).find((x) => x.key === 'profit')!.value ?? 0;
    if (Math.abs(asSheet - p.sheetProfit) > 1) assumptions.push(`Check: with the sheet's own numbers HQ gets ${usd0(asSheet)} profit a month; the sheet says ${usd0(p.sheetProfit)}. A line HQ did not read: tell Riley.`);
  }
  return { source: opts.source ?? 'sheet', tab: opts.tab ?? '', readAt: opts.readAt ?? '', plans: plans.map((x) => ({ key: x.key, name: x.name })), plan: p?.key ?? '', inputs, outputs: priceResults(inputs), assumptions };
}

// ---------- built-in (the sheet could not be read) ----------
/** The sheet's line names with no figures: every amount 0 except Dulcy's $2.50 per inbox (RULES). */
export function builtinPlan(): PricePlan {
  return {
    key: 'p1', name: 'Client plan', sheetProfit: null,
    inputs: [
      { key: 'r1', label: 'Retainer', value: 0, kind: 'money', group: 'revenue' },
      { key: 'r2', label: 'Rev Share', value: 0, kind: 'money', group: 'revenue' },
      { key: 'inboxes', label: 'Inboxes', value: 0, kind: 'number', group: 'volume', note: 'Cheap Inboxes line (inboxes × price)' },
      { key: 'leads', label: 'Leads a month', value: 0, kind: 'number', group: 'volume' },
      { key: 'inboxPrice', label: 'Price per inbox a month', value: INBOX_PRICE, kind: 'money', group: 'monthly', note: "Dulcy's Cheap Inboxes price (RULES 2026-11-28)" },
      { key: 'r3', label: 'Domains', value: 0, kind: 'money', group: 'monthly' },
      { key: 'r4', label: 'Domain Masking', value: 0, kind: 'money', group: 'monthly' },
      { key: 'u5', label: 'Scraping Credits per lead', value: 0, kind: 'money', group: 'monthly' },
      { key: 'u6', label: 'Verification Credits per lead', value: 0, kind: 'money', group: 'monthly' },
    ],
  };
}
export const BUILTIN_ASSUMPTIONS = [
  'The P/L sheet was not read, so these are its "OPEX Guide" line names with no numbers: fill them in.',
  "Only the price per inbox is filled in: $2.50, Dulcy's Cheap Inboxes price (RULES 2026-11-28).",
];

// ---------- reader (read only, cached) ----------
let cache: { at: number; data: Promise<SheetGrid | null> } | null = null;
let lastError = '';
export function _resetPricingCache() { cache = null; lastError = ''; }
export const pricingError = () => lastError;
/** The calculator tab of the P/L sheet. null = not readable (lastError says why). Cached 10 minutes. */
export function pricingSheetReader(sheets: () => SheetsClient | null, sheetId = PNL_SHEET_ID): () => Promise<SheetGrid | null> {
  return () => {
    const now = Date.now();
    if (cache && now - cache.at < 10 * 60_000) return cache.data;
    const data = (async (): Promise<SheetGrid | null> => {
      const s = sheets();
      if (!s?.formulas) { lastError = 'Google Sheets is not set up on this server.'; return null; }
      try {
        const titles = (await s.meta(sheetId)).sheets.map((x) => x.properties.title);
        const tab = titles.find((t) => /opex/i.test(t)) ?? titles.find((t) => PRICING_TAB_RE.test(t)) ?? '';
        if (!tab) { lastError = `No "OPEX Guide" (or Pricing / Calculator) tab in the P/L sheet (tabs: ${titles.slice(0, 8).join(', ')}).`; return null; }
        const [values, formulas] = await Promise.all([s.tab(sheetId, tab), s.formulas(sheetId, tab)]);
        lastError = '';
        return { tab, values: values.slice(0, 300), formulas: formulas.slice(0, 300), readAt: new Date(now).toISOString() };
      } catch (e) { lastError = String((e as Error).message ?? e).slice(0, 200); return null; }
    })();
    cache = { at: now, data };
    data.then((g) => { if (!g && cache?.data === data) cache = { at: now - 9 * 60_000, data }; }).catch(() => undefined);
    return data;
  };
}

/** GET/POST /sales/pricing: the sheet's plans (or the built-in lines), one plan worked out with the owner's changes. */
export async function pricingView(read: (() => Promise<SheetGrid | null>) | undefined, overrides: Record<string, number> = {}, plan?: string): Promise<PricingModel> {
  const g = read ? await read().catch(() => null) : null;
  const clean: Record<string, number> = {};
  for (const [k, v] of Object.entries(overrides ?? {}).slice(0, 200)) if (/^[a-z]{1,12}\d{0,4}$/i.test(k) && Number.isFinite(Number(v)) && Math.abs(Number(v)) < 1e9) clean[k] = Number(v);
  const pick = typeof plan === 'string' && /^p\d{1,3}$/.test(plan) ? plan : undefined;
  const builtin = (error: string): PricingModel => ({ ...pricingModel([builtinPlan()], { overrides: clean, source: 'builtin', assumptions: BUILTIN_ASSUMPTIONS }), error });
  if (g) {
    const plans = parsePlans(g);
    if (plans.length) return pricingModel(plans, { plan: pick, overrides: clean, source: 'sheet', tab: g.tab, readAt: g.readAt, assumptions: [`From the P/L sheet, tab "${g.tab}": its "Client Fulfillment" plans and their lines. Change any line here; the sheet is not changed.`] });
    return builtin(`The tab "${g.tab}" has no "Client Fulfillment - <plan>" block HQ can read.`);
  }
  return builtin(read ? pricingError() || 'The P/L sheet could not be read.' : 'Google Sheets is not set up on this server.');
}

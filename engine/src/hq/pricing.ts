// Round 3 (Alex 2026-11-27): the pricing calculator from the "Dulcy Media P/L" Google Sheet, in Sales
// (owner only), to set what to charge a client. The sheet is read at runtime (read only, cached 10
// minutes): its calculator tab's formulas and values. In HQ the owner changes the inputs; the sheet's
// own formulas are worked out here (a small formula reader: + - * / ^ %, SUM, AVERAGE, MIN, MAX,
// ROUND/UP/DOWN, IF, IFERROR, ABS, AND, OR). Nothing is written to the sheet. No figure from the sheet
// is ever kept in this repo: tests use a fake sheet.
// Assumptions (UNKNOWN until checked on the real sheet):
//   - The tab: the first whose name has "pricing" or "calculator" (else "Pricing Calculator").
//   - A row reads "label | value": the label is the nearest text to the left of a number/formula.
//   - Inputs = typed numbers that a formula uses; results = formula cells. A formula this reader does
//     not know (or one that points at another tab) keeps the sheet's own value, marked "from the sheet".
//   - "$" in the shown value = money, "%" = a percent (kept as a fraction, like Sheets).
// When the sheet cannot be read, a built-in calculator (BUILTIN, below) is shown, with every
// assumption written next to it, and all money inputs empty.
import type { SheetsClient } from '../providers/google.js';

export const PNL_SHEET_ID = '1nUf28kpRs2olqUIIfdrVdyH1q67hRT-zhmaD9UL3knM';
export const PRICING_TAB_DEFAULT = 'Pricing Calculator';
export const PRICING_TAB_RE = /pricing|calculator/i;
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
const kindOf = (shown: string): 'money' | 'pct' | 'number' => (/\$/.test(shown) ? 'money' : /%\s*$/.test(shown) ? 'pct' : 'number');

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

// ---------- the calculator model ----------
export interface PriceInput { ref: string; label: string; value: number; kind: 'money' | 'pct' | 'number'; note?: string }
export interface PriceOutput { ref: string; label: string; value: number | string | null; kind: 'money' | 'pct' | 'number'; formula: string; fromSheet: boolean; error?: string }
export interface PricingModel { source: 'sheet' | 'builtin'; tab: string; readAt: string; inputs: PriceInput[]; outputs: PriceOutput[]; assumptions: string[]; error?: string }

function labelFor(values: string[][], r: number, c: number): string {
  for (let k = c - 1; k >= 0; k--) { const t = (values[r]?.[k] ?? '').trim(); if (t && numberOf(t) === null) return t.slice(0, 120); }
  for (let k = r - 1; k >= 0; k--) { const t = (values[k]?.[c] ?? '').trim(); if (t && numberOf(t) === null) return t.slice(0, 120); }
  return refOf(r, c);
}

/** The calculator from a tab: inputs (numbers a formula uses) and results (formulas), worked out with overrides. Pure. */
export function pricingModel(g: SheetGrid, overrides: Record<string, number> = {}, source: 'sheet' | 'builtin' = 'sheet', assumptions: string[] = []): PricingModel {
  const rows = Math.max(g.values.length, g.formulas.length);
  const formula = (ref: string) => { const x = parseRef(ref); const f = x ? String(g.formulas[x.r]?.[x.c] ?? '') : ''; return f.startsWith('=') ? f : ''; };
  const shown = (ref: string) => { const x = parseRef(ref); return x ? String(g.values[x.r]?.[x.c] ?? '') : ''; };
  const used = new Set<string>();
  const outputs: string[] = [];
  for (let r = 0; r < rows; r++) {
    const width = Math.max(g.values[r]?.length ?? 0, g.formulas[r]?.length ?? 0);
    for (let c = 0; c < width; c++) {
      const ref = refOf(r, c); const f = formula(ref);
      if (!f) continue;
      outputs.push(ref);
      for (const m of f.matchAll(/(\$?[A-Za-z]{1,3}\$?\d+)(?::(\$?[A-Za-z]{1,3}\$?\d+))?/g)) {
        const a = parseRef(m[1].replace(/\$/g, '')), b = m[2] ? parseRef(m[2].replace(/\$/g, '')) : a;
        if (!a || !b) continue;
        for (let rr = Math.min(a.r, b.r); rr <= Math.max(a.r, b.r) && rr - a.r < 200; rr++) for (let cc = Math.min(a.c, b.c); cc <= Math.max(a.c, b.c) && cc - a.c < 30; cc++) used.add(refOf(rr, cc));
      }
    }
  }
  const inputs: PriceInput[] = [...used].filter((ref) => !formula(ref) && numberOf(shown(ref) || String(g.formulas[parseRef(ref)!.r]?.[parseRef(ref)!.c] ?? '')) !== null)
    .sort((a, b) => parseRef(a)!.r - parseRef(b)!.r || parseRef(a)!.c - parseRef(b)!.c)
    .map((ref) => { const x = parseRef(ref)!; const s = shown(ref) || String(g.formulas[x.r]?.[x.c] ?? ''); return { ref, label: labelFor(g.values, x.r, x.c), value: numberOf(s) as number, kind: kindOf(s) }; });
  const inputVal = new Map(inputs.map((i) => [i.ref, Number.isFinite(overrides[i.ref]) ? overrides[i.ref] : i.value]));
  const memo = new Map<string, Val>(); const busy = new Set<string>(); const fixed = new Set<string>();
  const get = (ref: string): Val => {
    if (inputVal.has(ref)) return inputVal.get(ref)!;
    if (memo.has(ref)) return memo.get(ref)!;
    const f = formula(ref);
    if (!f) { const s = shown(ref); return numberOf(s) ?? s; }
    if (busy.has(ref)) throw new Unsupported('circular');
    busy.add(ref);
    let v: Val;
    try { v = evaluate(f, get); } catch (e) {
      if (!(e instanceof Unsupported)) { busy.delete(ref); throw e; }
      fixed.add(ref); v = numberOf(shown(ref)) ?? shown(ref);
    }
    busy.delete(ref); memo.set(ref, v); return v;
  };
  const outs: PriceOutput[] = outputs.map((ref) => {
    const x = parseRef(ref)!; const s = shown(ref);
    let value: number | string | null = null; let error: string | undefined;
    try { const v = get(ref); value = Array.isArray(v) ? null : typeof v === 'number' ? Math.round(v * 1e6) / 1e6 : v; } catch (e) { error = String((e as Error).message ?? e).slice(0, 40); }
    return { ref, label: labelFor(g.values, x.r, x.c), value, kind: kindOf(s), formula: formula(ref), fromSheet: fixed.has(ref), ...(error ? { error } : {}) };
  }).filter((o) => o.value !== '' || o.error);
  return { source, tab: g.tab, readAt: g.readAt, inputs: inputs.map((i) => ({ ...i, value: inputVal.get(i.ref)! })), outputs: outs, assumptions };
}

// ---------- built-in calculator (the sheet could not be read) ----------
/** Every money input starts empty (0): the real numbers live in the P/L sheet, never in this repo. */
export const BUILTIN_ROWS: [string, string][] = [
  ['Inboxes for the client', '0'], ['Cost per inbox a month', '$2.50'], ['Domains', '0'], ['Cost per domain a month', '$0.00'],
  ['Data, verification and tools a month', '$0.00'], ['Team hours a month', '0'], ['Cost per team hour', '$0.00'],
  ['Cold emails per inbox a day', '15'], ['Sending days a month', '22'], ['Positive reply rate', '0%'], ['Meetings booked from positive replies', '0%'],
  ['Show rate', '0%'], ['Target margin', '0%'],
  ['Monthly cost', '=B1*B2+B3*B4+B5+B6*B7'], ['Cold emails a month', '=B1*B8*B9'], ['Meetings a month', '=B15*B10*B11'], ['Shows a month', '=B16*B12'],
  ['Price a month at the target margin', '=IF(B13>=1,0,B14/(1-B13))'], ['Price per meeting', '=IF(B16>0,B18/B16,0)'], ['Price per show', '=IF(B17>0,B18/B17,0)'],
];
export const BUILTIN_ASSUMPTIONS = [
  'Built-in calculator: the P/L sheet could not be read, so this is NOT the sheet\'s formula.',
  'Price = monthly cost ÷ (1 − target margin). Monthly cost = inboxes × inbox cost + domains × domain cost + tools + team hours × hourly cost.',
  'Meetings = inboxes × cold emails a day × sending days × positive reply rate × booked rate. Shows = meetings × show rate.',
  'Inbox cost $2.50 a month and 15 cold emails a day per inbox come from RULES (Cheap Inboxes; the new-client ramp cap). 22 sending days = weekdays. Every other number starts at 0: fill it in.',
];
export function builtinGrid(): SheetGrid {
  const values = BUILTIN_ROWS.map(([l, v]) => [l, v.startsWith('=') ? (/(Price|cost)/i.test(l) ? '$0.00' : '0') : v]);
  return { tab: 'Built-in', values, formulas: BUILTIN_ROWS.map(([l, v]) => [l, v]), readAt: '' };
}

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
        const tab = titles.find((t) => PRICING_TAB_RE.test(t)) ?? (titles.includes(PRICING_TAB_DEFAULT) ? PRICING_TAB_DEFAULT : '');
        if (!tab) { lastError = `No tab named like "Pricing" or "Calculator" in the P/L sheet (tabs: ${titles.slice(0, 8).join(', ')}).`; return null; }
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

/** GET/POST /sales/pricing: the sheet's calculator (or the built-in one), worked out with the owner's inputs. */
export async function pricingView(read: (() => Promise<SheetGrid | null>) | undefined, overrides: Record<string, number> = {}): Promise<PricingModel> {
  const g = read ? await read().catch(() => null) : null;
  const clean: Record<string, number> = {};
  for (const [k, v] of Object.entries(overrides ?? {}).slice(0, 200)) if (/^[A-Z]{1,3}\d{1,4}$/.test(k) && Number.isFinite(Number(v)) && Math.abs(Number(v)) < 1e9) clean[k] = Number(v);
  if (g) {
    const m = pricingModel(g, clean, 'sheet', [`Read from the P/L sheet, tab "${g.tab}". Inputs are the numbers its formulas use; change them here (the sheet is not changed).`]);
    if (m.outputs.length) return m;
    return { ...pricingModel(builtinGrid(), clean, 'builtin', BUILTIN_ASSUMPTIONS), error: `The tab "${g.tab}" has no formulas HQ can read.` };
  }
  return { ...pricingModel(builtinGrid(), clean, 'builtin', BUILTIN_ASSUMPTIONS), error: read ? pricingError() || 'The P/L sheet could not be read.' : 'Google Sheets is not set up on this server.' };
}

// Round 5 (Alex 2026-11-28): Sales goals under the current stats, and Cole's take on the numbers.
//   - Goals: the n8n workflow "Airtable Monthly Goals Auto" (gMPw1uq28qwMERs7fnUyw, runs on the 1st)
//     writes one Sales Goals row per month (Revenue, Cash Collected, Calls, Deals goals, growth rate,
//     confidence, reasoning) from the previous month's goals and results. HQ READS that row; it never
//     writes Airtable. The workflow's goal maths is ported here (n8nGoals, pure) so HQ can show how a
//     goal was set and what next month's goal would be at this pace. The workflow's AI reviewer (±10%,
//     rounded) is not ported: HQ says so when it shows its own number.
//   - Actuals come from HQ's own deals (the same numbers as the tiles above), not the Sales Goals
//     rollups: those read Sales Data "Won" rows, which are missing (see the data note).
//   - Cole's take: one or two sentences from the numbers and goals. Rule-based (coleTakeRule, pure);
//     with ANTHROPIC_API_KEY, Cole words it himself, cached for the day (at most 4 a day, only when
//     the numbers change), falling back to the rule line on any failure.
import { createHash } from 'node:crypto';
import { z } from 'zod';
import type { Db } from '../db/pool.js';
import type { Config } from '../config.js';
import type { AirtableRecord } from '../providers/airtable.js';
import type { HqAirtable } from './decisions.js';
import { nyDay, topNumbers, type Deal } from './sales.js';
import { ensureSalesTables } from './salesInsights.js';

export const GOALS_T = 'tbl9RIrdbapavGdI0'; // Sales Goals (airtable/SCHEMA.md)
export const GOALS_WORKFLOW = 'Airtable Monthly Goals Auto';
export const GF = {
  month: 'fldyMn4xAsSsVcgLW', date: 'fldEQYFlxaqmbIyAI', revenueGoal: 'fldspmYjIhRdGMPAM', cashGoal: 'fld2QFTJiFiby5a1P', callsGoal: 'fld90phsp5D6q6GEB',
  dealsGoal: 'flddQglaQbHUz8rMb', growth: 'fldqPhz3xiJVWHYd2', confidence: 'fldeovslY51mdm5ve', reasoning: 'fld1ePGZlcLkxu4S7',
  callsBooked: 'fldMJjrPOl8LJkCKx', callsHeld: 'fld4zBU26rYWbrKOL', offersMade: 'fldwgOa5fcZdvHe2V', dealsClosed: 'fldgiT9k0ECC8n20q',
  revenueClosed: 'fldzMQ6rRjn0Dejc0', cashCollected: 'fldQ5iutVcrLcQbJF', avgDays: 'fldKzReC40LmC6UG3',
} as const;

const LONG = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const num = (v: unknown): number | null => { const x = Array.isArray(v) ? v[0] : v; if (x === null || x === undefined || x === '') return null; const n = Number(x); return Number.isFinite(n) ? n : null; };
const str = (v: unknown) => (v === null || v === undefined ? '' : String(Array.isArray(v) ? v[0] ?? '' : v)).trim();
/** "2026-11" → "November 2026". */
export const monthTitle = (m: string) => { const [y, mo] = m.split('-').map(Number); return `${LONG[mo - 1]} ${y}`; };
export const nextMonth = (m: string) => { const [y, mo] = m.split('-').map(Number); return mo === 12 ? `${y + 1}-01` : `${y}-${String(mo + 1).padStart(2, '0')}`; };
export const prevMonthOf = (m: string) => { const [y, mo] = m.split('-').map(Number); return mo === 1 ? `${y - 1}-12` : `${y}-${String(mo - 1).padStart(2, '0')}`; };
const daysInMonth = (m: string) => { const [y, mo] = m.split('-').map(Number); return new Date(Date.UTC(y, mo, 0)).getUTCDate(); };
/** 11/28 (slashes, no weekday: RULES 2026-11-27/28). */
const slash = (d: string) => { const [, m, dd] = d.split('-').map(Number); return `${m}/${dd}`; };

// ---------- the Sales Goals rows ----------
export interface GoalRow {
  id: string; month: string; title: string; created: string;
  revenueGoal: number | null; cashGoal: number | null; callsGoal: number | null; dealsGoal: number | null;
  growth: number | null; confidence: string; reasoning: string;
  /** The Airtable rollups the workflow reads (from Sales Data). */
  rollup: { callsBooked: number; callsHeld: number; offersMade: number; dealsClosed: number; revenueClosed: number; cashCollected: number; avgDaysToClose: number | null };
}
/** One Sales Goals record → a row keyed by month (YYYY-MM, from Month "November 2026" or Date). Pure. */
export function goalRowOf(r: AirtableRecord): GoalRow | null {
  const f = r.fields;
  const title = str(f[GF.month]);
  const t = /^([A-Za-z]+)\s+(\d{4})$/.exec(title);
  const mi = t ? LONG.findIndex((x) => x.toLowerCase() === t[1].toLowerCase()) : -1;
  const date = str(f[GF.date]);
  const month = mi >= 0 ? `${t![2]}-${String(mi + 1).padStart(2, '0')}` : /^\d{4}-\d{2}/.test(date) ? date.slice(0, 7) : '';
  if (!month) return null;
  return {
    id: r.id, month, title: title || monthTitle(month), created: r.createdTime ?? '',
    revenueGoal: num(f[GF.revenueGoal]), cashGoal: num(f[GF.cashGoal]), callsGoal: num(f[GF.callsGoal]), dealsGoal: num(f[GF.dealsGoal]),
    growth: num(f[GF.growth]), confidence: str(f[GF.confidence]).toLowerCase(), reasoning: str(f[GF.reasoning]).slice(0, 500),
    rollup: {
      callsBooked: num(f[GF.callsBooked]) ?? 0, callsHeld: num(f[GF.callsHeld]) ?? 0, offersMade: num(f[GF.offersMade]) ?? 0, dealsClosed: num(f[GF.dealsClosed]) ?? 0,
      revenueClosed: num(f[GF.revenueClosed]) ?? 0, cashCollected: num(f[GF.cashCollected]) ?? 0, avgDaysToClose: num(f[GF.avgDays]),
    },
  };
}

// ---------- the workflow's maths, ported (n8n Code node "new targets suggestions") ----------
export interface GoalInputs {
  goals: { revenue: number; cash: number; calls: number; deals: number };
  actual: { revenueClosed: number; cashCollected: number; callsBooked: number; callsHeld: number; offersMade: number; dealsClosed: number };
}
export interface GoalSuggestion {
  revenueGoal: number; cashGoal: number; callsGoal: number; dealsGoal: number;
  growthRate: number; projectedGrowthRate: number; confidence: 'low' | 'medium' | 'high'; weightedAttainment: number; reason: string;
}
const clamp = (v: number, lo: number, hi: number) => Math.min(Math.max(v, lo), hi);
const roundTo = (v: number, inc: number) => (!Number.isFinite(v) || inc <= 0 ? 0 : Math.round(v / inc) * inc);
/**
 * This month's goals from last month's goals and results, exactly as the n8n workflow's JavaScript
 * baseline works them out (before its AI review, which may move each goal at most 10%). Pure.
 */
export function n8nGoals(x: GoalInputs): GoalSuggestion {
  const g = x.goals, a = x.actual;
  const bookingToClose = a.callsBooked > 0 ? a.dealsClosed / a.callsBooked : 0;
  const avgDeal = a.dealsClosed > 0 ? a.revenueClosed / a.dealsClosed : 0;
  const revAtt = g.revenue > 0 ? a.revenueClosed / g.revenue : 0;
  const callsAtt = g.calls > 0 ? a.callsBooked / g.calls : 0;
  const dealsAtt = g.deals > 0 ? a.dealsClosed / g.deals : 0;
  // Revenue and closed deals matter more than booked-call volume.
  const weighted = revAtt * 0.45 + dealsAtt * 0.35 + callsAtt * 0.2;
  const confidence: GoalSuggestion['confidence'] = a.callsBooked >= 25 && a.dealsClosed >= 3 ? 'high' : a.callsBooked >= 10 || a.dealsClosed >= 2 ? 'medium' : 'low';
  let growth = weighted >= 1.25 ? 0.2 : weighted >= 1.05 ? 0.12 : weighted >= 0.9 ? 0.05 : weighted >= 0.7 ? 0 : weighted >= 0.5 ? -0.05 : -0.1;
  growth = confidence === 'low' ? clamp(growth, -0.05, 0.05) : confidence === 'medium' ? clamp(growth, -0.1, 0.12) : clamp(growth, -0.1, 0.2);
  // Calls: grow last month's goal, in clean steps of five (at least 5).
  const calls = Math.max(5, roundTo(Math.max(1, Math.round(g.calls * (1 + growth))), 5));
  // Deals: from the call goal and the booking → close rate when there is enough data, else grown; ±20-25%.
  let deals = Math.max(1, a.callsBooked >= 10 && bookingToClose > 0 ? Math.round(calls * bookingToClose) : Math.round(g.deals * (1 + growth)));
  deals = clamp(deals, Math.max(1, Math.floor(g.deals * 0.8)), Math.max(g.deals + 1, Math.ceil(g.deals * 1.25)));
  // Revenue: deals × average deal size (else grown), within 90-125% of last month's goal, to $1,000.
  let revenue = avgDeal > 0 ? deals * avgDeal : g.revenue * (1 + growth);
  revenue = roundTo(clamp(revenue, g.revenue > 0 ? g.revenue * 0.9 : 0, g.revenue > 0 ? g.revenue * 1.25 : revenue), 1000);
  // Cash: grown from last month's cash goal (first month: cash collected, else the revenue goal).
  let cash = g.cash > 0 ? g.cash * (1 + growth) : a.cashCollected > 0 ? a.cashCollected : revenue;
  cash = roundTo(clamp(cash, g.cash > 0 ? g.cash * 0.9 : 0, g.cash > 0 ? g.cash * 1.25 : cash), 1000);
  const reason = weighted >= 1.25 ? 'Last month was well above its goals, so the goals go up (capped).'
    : weighted >= 1.05 ? 'Last month beat its goals, so the goals go up a little.'
    : weighted >= 0.9 ? 'Last month was close to its goals, so the goals go up slightly.'
    : weighted >= 0.7 ? 'Last month was a bit below its goals, so the goals stay about the same.'
    : 'Last month was well below its goals, so the goals come down a little.';
  return {
    revenueGoal: revenue, cashGoal: cash, callsGoal: calls, dealsGoal: deals, growthRate: growth,
    projectedGrowthRate: g.revenue > 0 ? Number(((revenue - g.revenue) / g.revenue).toFixed(4)) : 0,
    confidence, weightedAttainment: Math.round(weighted * 1000) / 1000, reason,
  };
}
const inputsFromRow = (r: GoalRow, actual?: GoalInputs['actual']): GoalInputs => ({
  goals: { revenue: r.revenueGoal ?? 0, cash: r.cashGoal ?? 0, calls: r.callsGoal ?? 0, deals: r.dealsGoal ?? 0 },
  actual: actual ?? { revenueClosed: r.rollup.revenueClosed, cashCollected: r.rollup.cashCollected, callsBooked: r.rollup.callsBooked, callsHeld: r.rollup.callsHeld, offersMade: r.rollup.offersMade, dealsClosed: r.rollup.dealsClosed },
});

// ---------- actuals from HQ's deals ----------
export interface MonthActuals { callsBooked: number; callsHeld: number; offersMade: number; dealsClosed: number; revenue: number; revenueUnknown: number; cash: number }
/** One month's results from HQ's deals (the same rules as the tiles: booked by call date, signed by signing date). Pure. */
export function monthActuals(deals: Deal[], month: string): MonthActuals {
  const booked = deals.filter((d) => d.salesRec && d.callDate.slice(0, 7) === month);
  const signed = deals.filter((d) => d.stages.signed && d.signedDay.slice(0, 7) === month);
  return {
    callsBooked: booked.length, callsHeld: booked.filter((d) => d.stages.showed).length, offersMade: booked.filter((d) => d.stages.qualified).length,
    dealsClosed: signed.length, revenue: signed.reduce((s, d) => s + (d.money?.monthly ?? 0), 0), revenueUnknown: signed.filter((d) => d.money?.monthly == null).length,
    cash: signed.reduce((s, d) => s + (d.money?.paidTotal ?? 0), 0),
  };
}

// ---------- progress ----------
export type GoalKey = 'calls' | 'deals' | 'revenue' | 'cash';
export type GoalStatus = 'hit' | 'on_pace' | 'behind' | 'no_goal';
export interface GoalLine { key: GoalKey; label: string; money: boolean; goal: number | null; actual: number; pct: number | null; expected: number | null; status: GoalStatus; text: string }
const LABEL: Record<GoalKey, string> = { calls: 'Calls booked', deals: 'Deals signed', revenue: 'Revenue signed', cash: 'Cash collected' };
const usd = (x: number) => `$${Math.round(x).toLocaleString('en-US')}`;
/** Goal vs actual for each goal, with where the month should be by today (straight line). Pure. */
export function goalLines(goals: Pick<GoalRow, 'callsGoal' | 'dealsGoal' | 'revenueGoal' | 'cashGoal'> | null, act: MonthActuals, dayOfMonth: number, monthDays: number): GoalLine[] {
  const share = Math.min(1, Math.max(0, dayOfMonth / monthDays));
  const one = (key: GoalKey, goal: number | null, actual: number): GoalLine => {
    const money = key === 'revenue' || key === 'cash';
    const f = (x: number) => (money ? usd(x) : String(Math.round(x * 10) / 10));
    if (!goal || goal <= 0) return { key, label: LABEL[key], money, goal: null, actual, pct: null, expected: null, status: 'no_goal', text: `${f(actual)} · no goal set` };
    const expected = Math.round(goal * share * 10) / 10;
    const pct = Math.round((actual / goal) * 100);
    const status: GoalStatus = actual >= goal ? 'hit' : actual >= expected * 0.9 ? 'on_pace' : 'behind';
    return { key, label: LABEL[key], money, goal, actual, pct, expected, status, text: `${f(actual)} of ${f(goal)} (${pct}%)` };
  };
  return [one('calls', goals?.callsGoal ?? null, act.callsBooked), one('deals', goals?.dealsGoal ?? null, act.dealsClosed), one('revenue', goals?.revenueGoal ?? null, act.revenue), one('cash', goals?.cashGoal ?? null, act.cash)];
}

export interface GoalsSource {
  kind: 'airtable' | 'engine' | 'none';
  /** One plain line: who set the goal, when, from what. */
  text: string; reasoning: string; confidence: string; growth: number | null;
}
export interface GoalsView {
  month: string; title: string; today: string; dayOfMonth: number; daysInMonth: number;
  goals: { calls: number | null; deals: number | null; revenue: number | null; cash: number | null } | null;
  lines: GoalLine[]; source: GoalsSource;
  /** Next month's goals if this month ends at today's pace, with the workflow's rules (no AI review). */
  next: { month: string; title: string; calls: number; deals: number; revenue: number; cash: number; growth: number; reason: string } | null;
  /** Airtable's own count for this month differs from HQ's (the workflow will read Airtable's). */
  warning: string;
  actuals: MonthActuals;
}
const pctTxt = (x: number) => `${x > 0 ? '+' : ''}${Math.round(x * 100)}%`;
/** The goals block: this month's goals (from n8n, else worked out here), progress, next month at this pace. Pure. */
export function goalsView(rows: GoalRow[], deals: Deal[], today: string, canSeeMoney: boolean): GoalsView {
  const month = today.slice(0, 7), prev = prevMonthOf(month);
  const dayOfMonth = Number(today.slice(8, 10)), monthDays = daysInMonth(month);
  const pick = (m: string) => rows.filter((r) => r.month === m).sort((a, b) => b.created.localeCompare(a.created))[0];
  const row = pick(month), last = pick(prev);
  const act = monthActuals(deals, month);
  let goals: GoalsView['goals'] = null; let source: GoalsSource;
  if (row && (row.callsGoal || row.dealsGoal || row.revenueGoal || row.cashGoal)) {
    goals = { calls: row.callsGoal, deals: row.dealsGoal, revenue: row.revenueGoal, cash: row.cashGoal };
    const setOn = row.created ? slash(nyDay(row.created)) : '';
    source = {
      kind: 'airtable', reasoning: row.reasoning, confidence: row.confidence, growth: row.growth,
      text: `Set${setOn ? ` ${setOn}` : ''} by the n8n workflow "${GOALS_WORKFLOW}" from ${monthTitle(prev).split(' ')[0]}'s goals and results${row.growth !== null ? ` (${pctTxt(row.growth)})` : ''}${row.confidence ? `, confidence ${row.confidence}` : ''}.`,
    };
  } else if (last && (last.callsGoal || last.dealsGoal || last.revenueGoal || last.cashGoal)) {
    const s = n8nGoals(inputsFromRow(last));
    goals = { calls: s.callsGoal, deals: s.dealsGoal, revenue: s.revenueGoal, cash: s.cashGoal };
    source = {
      kind: 'engine', reasoning: s.reason, confidence: s.confidence, growth: s.growthRate,
      text: `The n8n workflow has not written ${monthTitle(month)} yet. HQ worked it out with the same rules from ${monthTitle(prev).split(' ')[0]}'s Sales Goals row (${pctTxt(s.growthRate)}, confidence ${s.confidence}; without the workflow's AI review).`,
    };
  } else {
    source = { kind: 'none', reasoning: '', confidence: '', growth: null, text: `No Sales Goals row for ${monthTitle(month)} or ${monthTitle(prev)} in Airtable: the goals are UNKNOWN.` };
  }
  const lines = goalLines(goals ? { callsGoal: goals.calls, dealsGoal: goals.deals, revenueGoal: goals.revenue, cashGoal: goals.cash } : null, act, dayOfMonth, monthDays);
  // Next month at this pace: this month's results stretched to the whole month, through the same rules.
  let next: GoalsView['next'] = null;
  if (goals) {
    const k = monthDays / Math.max(1, dayOfMonth);
    const s = n8nGoals({
      goals: { revenue: goals.revenue ?? 0, cash: goals.cash ?? 0, calls: goals.calls ?? 0, deals: goals.deals ?? 0 },
      actual: { revenueClosed: act.revenue * k, cashCollected: act.cash * k, callsBooked: Math.round(act.callsBooked * k), callsHeld: Math.round(act.callsHeld * k), offersMade: Math.round(act.offersMade * k), dealsClosed: Math.round(act.dealsClosed * k) },
    });
    const nm = nextMonth(month);
    next = { month: nm, title: monthTitle(nm), calls: s.callsGoal, deals: s.dealsGoal, revenue: s.revenueGoal, cash: s.cashGoal, growth: s.growthRate, reason: s.reason };
  }
  const warning = row && row.rollup.dealsClosed !== act.dealsClosed
    ? `Airtable's Sales Goals counts ${row.rollup.dealsClosed} deal${row.rollup.dealsClosed === 1 ? '' : 's'} closed in ${monthTitle(month).split(' ')[0]}; HQ counts ${act.dealsClosed} signed. On the 1st the workflow reads Airtable's count, so next month's goals can come out too low until Sales Data rows are marked Won.`
    : '';
  const view: GoalsView = { month, title: monthTitle(month), today, dayOfMonth, daysInMonth: monthDays, goals, lines, source, next, warning, actuals: act };
  if (canSeeMoney) return view;
  // Money (revenue, cash) is the owner's only.
  return { ...view, goals: goals ? { calls: goals.calls, deals: goals.deals, revenue: null, cash: null } : null, lines: lines.filter((l) => !l.money), next: next ? { ...next, revenue: 0, cash: 0 } : null, actuals: { ...act, revenue: 0, cash: 0 } };
}

// ---------- Cole's take ----------
export interface TakeInput {
  monthLabel: string; nextLabel: string; dayOfMonth: number; daysInMonth: number; lines: GoalLine[];
  showRate: number | null; closeRate: number | null; lastShowRate: number | null; lastCloseRate: number | null;
}
const WEIGHT: Record<GoalKey, number> = { revenue: 0.45, deals: 0.35, calls: 0.2, cash: 0 };
/** Pace against goal so far (1 = exactly on the line), weighted like the workflow; null with no goal. Pure. */
export function paceScore(lines: GoalLine[]): number | null {
  const xs = lines.filter((l) => l.goal && l.expected && WEIGHT[l.key] > 0);
  if (!xs.length) return null;
  const w = xs.reduce((s, l) => s + WEIGHT[l.key], 0);
  return Math.round((xs.reduce((s, l) => s + WEIGHT[l.key] * Math.min(2, l.actual / Math.max(0.1, l.expected!)), 0) / w) * 100) / 100;
}
/** Cole's take without a model: one or two short sentences from the pace and the rates. Pure. */
export function coleTakeRule(x: TakeInput): string {
  const month = x.monthLabel.split(' ')[0], next = x.nextLabel.split(' ')[0];
  const pace = paceScore(x.lines);
  const goals = x.lines.filter((l) => l.goal);
  const calls = x.lines.find((l) => l.key === 'calls');
  if (pace === null) {
    return `No goals set for ${month}, so I can't say if we're ahead. ${calls ? `${calls.actual} calls booked so far` : 'Calls booked so far are unknown'}; let's set goals.`;
  }
  const behind = goals.filter((l) => l.status === 'behind' && WEIGHT[l.key] > 0).sort((a, b) => (a.actual / (a.expected || 1)) - (b.actual / (b.expected || 1)));
  const weak = behind[0];
  const why = (): string => {
    if (x.showRate !== null && x.showRate < 60) return `the show rate is ${Math.round(x.showRate)}%, so no-shows are the first leak to check`;
    if (x.closeRate !== null && x.lastCloseRate !== null && x.closeRate < x.lastCloseRate - 10) return `the close rate dropped to ${Math.round(x.closeRate)}% (from ${Math.round(x.lastCloseRate)}%), so shows aren't signing`;
    if (weak?.key === 'calls') return 'not enough calls are getting booked';
    if (x.closeRate !== null && x.closeRate < 25) return `only ${Math.round(x.closeRate)}% of shows sign`;
    return weak ? `${weak.label.toLowerCase()} is the gap (${weak.text})` : 'the gap is spread across the goals';
  };
  if (pace >= 1.25 && !behind.length) return `Sales are good so far: we're well ahead of ${month}'s goals. Raise ${next}'s goal.`;
  if (pace >= 1) return `Sales are on track for ${month}${behind.length ? `, but ${weak!.label.toLowerCase()} is behind (${weak!.text})` : ''}. Keep ${next}'s goal where the workflow sets it, or nudge it up.`;
  if (pace >= 0.8) return `A little below pace for ${month}: ${why()}. Push it this week.`;
  return `Below goal for ${month}. Let's find out why: ${why()}.`;
}

/** The model call (tests pass a fake; no key = none). Returns 1-2 sentences. */
export type TakeModel = (input: TakeInput, ruleLine: string) => Promise<string>;
export function defaultTakeModel(cfg: Pick<Config, 'anthropicApiKey' | 'claudeModel' | 'anthropicBaseUrl'>): TakeModel | null {
  if (!cfg.anthropicApiKey) return null;
  return async (input, rule) => {
    const { createClaude } = await import('../providers/claude.js');
    const c = createClaude({ apiKey: cfg.anthropicApiKey, model: cfg.claudeModel, baseURL: cfg.anthropicBaseUrl });
    const r = await c.structured(z.object({ take: z.string().describe('1-2 short plain sentences') }), [
      "You are Cole, Dulcy's Head of Sales. Give Alex your take on this month's sales so far in 1-2 short plain sentences (under 40 words): ahead of goal → say so and suggest raising next month's goal; on track → say so; behind → say it is below goal and name the most likely reason from the numbers (show rate, close rate, calls booked). Use only the numbers given. Never invent numbers, deals, prices or reasons. No hype, no emojis.",
    ], '', `Numbers (JSON):\n${JSON.stringify(input)}\n\nRule-based line for reference:\n${rule}`, 'low');
    return r.take;
  };
}
const cleanTake = (t: string) => String(t ?? '').replace(/\s+/g, ' ').trim();
/** A model answer is used only when it is short and has no number that is not in the input. Pure. */
export function takeOk(text: string, input: TakeInput): boolean {
  const t = cleanTake(text);
  if (!t || t.length > 320 || (t.match(/[.!?](\s|$)/g) ?? []).length > 3) return false;
  const known = new Set(JSON.stringify(input).match(/\d+(?:\.\d+)?/g) ?? []);
  const said = (t.match(/\d[\d,]*(?:\.\d+)?/g) ?? []).map((x) => x.replace(/,/g, ''));
  return said.every((x) => known.has(x) || known.has(String(Math.round(Number(x)))) || [...known].some((k) => Math.round(Number(k)) === Number(x)));
}
export interface ColeTake { text: string; by: 'cole' | 'rule'; day: string }
const MAX_PER_DAY = 4;
/** Cole's take for today: the model's words cached for the day (re-asked only when the numbers change, ≤4 a day), else the rule line. */
export async function coleTake(db: Db, model: TakeModel | null, input: TakeInput, today: string): Promise<ColeTake> {
  const rule = coleTakeRule(input);
  if (!model) return { text: rule, by: 'rule', day: today };
  await ensureSalesTables(db);
  const hash = createHash('sha256').update(JSON.stringify(input)).digest('hex').slice(0, 16);
  const old = (await db.query(`SELECT value FROM hq_sales_settings WHERE key='cole_take'`)).rows[0]?.value as { day?: string; hash?: string; text?: string; asks?: number } | undefined;
  const sameDay = old?.day === today;
  if (sameDay && old?.hash === hash && old.text) return { text: old.text, by: 'cole', day: today };
  const asks = sameDay ? Number(old?.asks ?? 0) : 0;
  if (asks >= MAX_PER_DAY) return { text: rule, by: 'rule', day: today };
  let text = '';
  try { text = cleanTake(await model(input, rule)); } catch { text = ''; }
  const ok = takeOk(text, input);
  await db.query(`INSERT INTO hq_sales_settings (key, value, updated_by) VALUES ('cole_take', $1, 'Cole') ON CONFLICT (key) DO UPDATE SET value=EXCLUDED.value, updated_by=EXCLUDED.updated_by, updated_at=now()`,
    [JSON.stringify({ day: today, hash: ok ? hash : '', text: ok ? text : '', asks: asks + 1 })]);
  return ok ? { text, by: 'cole', day: today } : { text: rule, by: 'rule', day: today };
}

/** The question typed into a new chat with Cole (not sent): the numbers, the goals and his take. Pure. */
export function coleChatAsk(v: Pick<GoalsView, 'title' | 'today' | 'lines' | 'next'>, take: string, rates: { showRate: number | null; closeRate: number | null }): string {
  const goals = v.lines.filter((l) => l.goal).map((l) => `${l.label.toLowerCase()} ${l.text}`);
  const facts = [
    goals.length ? `goals so far: ${goals.join(', ')}` : 'no goals set',
    rates.showRate !== null ? `show rate ${Math.round(rates.showRate)}%` : '', rates.closeRate !== null ? `close rate ${Math.round(rates.closeRate)}%` : '',
  ].filter(Boolean).join('; ');
  return `Cole, about ${v.title.split(' ')[0]} sales up to ${slash(v.today)}: ${facts}. Your take: "${take}" What should we do about it${v.next ? `, and what should ${v.next.title.split(' ')[0]}'s goal be` : ''}?`;
}

// ---------- the route ----------
/** GET /sales/goals: this month's goals vs actuals, how they were set, next month at this pace, Cole's take and the chat question. */
export async function salesGoalsView(db: Db, model: TakeModel | null, rows: GoalRow[] | null, deals: Deal[], today: string, canSeeMoney: boolean) {
  const v = goalsView(rows ?? [], deals, today, canSeeMoney);
  if (!rows) v.source = { kind: 'none', reasoning: '', confidence: '', growth: null, text: 'The Sales Goals table in Airtable could not be read just now: the goals are UNKNOWN.' };
  const top = topNumbers(deals, today, canSeeMoney);
  const input: TakeInput = {
    monthLabel: v.title, nextLabel: monthTitle(nextMonth(v.month)), dayOfMonth: v.dayOfMonth, daysInMonth: v.daysInMonth, lines: v.lines,
    showRate: top.thisMonth.showRate.pct, closeRate: top.thisMonth.closeRate.pct, lastShowRate: top.lastMonth.showRate.pct, lastCloseRate: top.lastMonth.closeRate.pct,
  };
  const take = await coleTake(db, model, input, today).catch(() => ({ text: coleTakeRule(input), by: 'rule' as const, day: today }));
  return { ...v, take, ask: coleChatAsk(v, take.text, { showRate: input.showRate, closeRate: input.closeRate }), readOk: rows !== null };
}

// ---------- reading (cached 5 minutes; the row changes once a month) ----------
const G_READ = Object.values(GF);
let cache: { at: number; data: Promise<GoalRow[]> } | null = null;
export function _resetGoalsCache() { cache = null; }
export function readGoalRows(at: Pick<HqAirtable, 'list'>, refresh = false, now = Date.now()): Promise<GoalRow[]> {
  if (cache && now - cache.at < (refresh ? 10_000 : 300_000)) return cache.data;
  const data = at.list(GOALS_T, '', G_READ, 200).then((rs) => rs.map(goalRowOf).filter((x): x is GoalRow => !!x));
  cache = { at: now, data };
  data.catch(() => { if (cache?.data === data) cache = null; });
  return data;
}

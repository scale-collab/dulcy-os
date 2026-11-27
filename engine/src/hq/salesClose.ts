// Round 3 (Alex 2026-11-27): the pipeline and the opportunity funnel straight from Close (Airtable cut
// out where Close has the data). Read only: opportunities created in the period (and the period
// before), their status changes, and the pipelines (for Close's own stage order). Cached 5 minutes.
//   - Pipeline: each Close stage with how many of the period's opportunities are in it now, as a share
//     of all of them (percentages, not "3 of 5"), next to the period before.
//   - Funnel, like Close's "Opportunity Funnels" report: total opportunities, close (win) rate, average
//     time to close, average value per win, and per step (call booked → follow-up → call done →
//     contract sent → won, in Close's pipeline order) how many reached it and the average days to
//     move from the step before.
import type { CloseClient, CloseOpportunity, ClosePipeline, CloseStatusChange } from '../providers/close.js';
import { nyDay } from './sales.js';
import type { PeriodPick, Window } from './salesPeriods.js';

const DAY = 86_400_000;
const TZ = 'America/New_York';
const pctOf = (n: number, of: number) => (of ? Math.round((n / of) * 1000) / 10 : null);
const avg = (xs: number[]) => (xs.length ? Math.round((xs.reduce((a, b) => a + b, 0) / xs.length) * 10) / 10 : null);
/** New York midnight of a day, as an ISO time. Pure. */
export function nyStartIso(d: string): string {
  const t = Date.parse(`${d}T12:00:00Z`);
  const h = Number(new Date(t).toLocaleString('en-US', { timeZone: TZ, hour: '2-digit', hour12: false }));
  return new Date(Date.parse(`${d}T00:00:00Z`) + (12 - h) * 3_600_000).toISOString();
}
const inWin = (iso: string, w: Window) => { const d = iso ? nyDay(iso) : ''; return !!d && d >= w.from && d <= w.to; };

export interface CloseRange { opps: CloseOpportunity[]; changes: CloseStatusChange[]; pipelines: ClosePipeline[]; truncated: boolean; readAt: string }
const cache = new Map<string, { at: number; data: Promise<CloseRange> }>();
export function _resetCloseRangeCache() { cache.clear(); }
/** Opportunities created from prev.from to now.to, their status changes, and the pipelines. Cached 5 minutes per period. */
export function readCloseRange(close: CloseClient, pick: PeriodPick, refresh = false, now = Date.now()): Promise<CloseRange> {
  const key = `${pick.prev.from}|${pick.now.to}`;
  const hit = cache.get(key);
  if (hit && now - hit.at < (refresh ? 30_000 : 5 * 60_000)) return hit.data;
  const fromIso = nyStartIso(pick.prev.from);
  const toIso = new Date(Date.parse(nyStartIso(pick.now.to)) + DAY - 1).toISOString();
  const data = (async (): Promise<CloseRange> => {
    const [o, c, p] = await Promise.all([close.opportunitiesCreated(fromIso, toIso, 10), close.statusChanges(fromIso, 10), close.pipelines().catch(() => [] as ClosePipeline[])]);
    return { opps: o.opps, changes: c.changes, pipelines: p, truncated: o.truncated || c.truncated, readAt: new Date(now).toISOString() };
  })();
  if (cache.size > 12) cache.clear();
  cache.set(key, { at: now, data });
  data.catch(() => { if (cache.get(key)?.data === data) cache.delete(key); });
  return data;
}

/** Dulcy's sales pipeline: the one most of the period's opportunities are in (else the first). Pure. */
export function pickPipeline(pipelines: ClosePipeline[], opps: CloseOpportunity[]): ClosePipeline | null {
  if (!pipelines.length) return null;
  const n = (p: ClosePipeline) => opps.filter((o) => o.pipelineId === p.id || p.statuses.some((s) => s.id && s.id === o.statusId)).length;
  return [...pipelines].sort((a, b) => n(b) - n(a))[0];
}

export interface StageRow { label: string; type: string; count: number; pct: number | null; prev: number; prevPct: number | null }
export interface PipelineView { pipeline: string; total: number; prevTotal: number; stages: StageRow[]; open: number; won: number; lost: number }
/** Where the period's opportunities are now, per Close stage, as a share of all of them (and the period before). Pure. */
export function closePipeline(data: Pick<CloseRange, 'opps' | 'pipelines'>, pick: PeriodPick): PipelineView {
  const now = data.opps.filter((o) => inWin(o.created, pick.now)), prev = data.opps.filter((o) => inWin(o.created, pick.prev));
  const p = pickPipeline(data.pipelines, [...now, ...prev]);
  const order: { label: string; type: string }[] = p ? p.statuses.map((s) => ({ label: s.label, type: s.type })) : [];
  for (const o of [...now, ...prev]) if (o.status && !order.some((s) => s.label === o.status)) order.push({ label: o.status, type: o.statusType });
  const inP = (xs: CloseOpportunity[]) => (p ? xs.filter((o) => !o.pipelineId || o.pipelineId === p.id) : xs);
  const a = inP(now), b = inP(prev);
  const stages = order.map((s): StageRow => {
    const count = a.filter((o) => o.status === s.label).length, pc = b.filter((o) => o.status === s.label).length;
    return { label: s.label, type: s.type || 'active', count, pct: pctOf(count, a.length), prev: pc, prevPct: pctOf(pc, b.length) };
  }).filter((s) => s.count || s.prev || (p?.statuses.some((x) => x.label === s.label) ?? false));
  return { pipeline: p?.name ?? 'Close', total: a.length, prevTotal: b.length, stages, open: a.filter((o) => o.statusType === 'active').length, won: a.filter((o) => o.statusType === 'won').length, lost: a.filter((o) => o.statusType === 'lost').length };
}

// ---------- the funnel ----------
/** Alex's steps (2026-11-27), matched to Close stage names. Shown in Close's own pipeline order. */
export const FUNNEL_STEPS: { key: string; label: string; match: RegExp }[] = [
  { key: 'booked', label: 'Call booked', match: /book|schedul|audit call|new|meeting set/i },
  { key: 'followup', label: 'Follow-up', match: /follow/i },
  { key: 'done', label: 'Call done', match: /call done|held|showed|complete|discovery done/i },
  { key: 'sent', label: 'Contract sent', match: /contract|proposal|agreement|sent/i },
  { key: 'won', label: 'Won', match: /^won$|closed won/i },
];
export interface FunnelStep { key: string; label: string; stages: string[]; reached: number; pctOfTotal: number | null; pctOfPrev: number | null; daysFromPrev: number | null; daysN: number }
export interface FunnelSide { total: number; won: number; lost: number; closeRate: number | null; decidedRate: number | null; avgDaysToClose: number | null; avgWinValue: number | null; valuePeriod: string; steps: FunnelStep[] }
export interface FunnelView extends FunnelSide { prev: FunnelSide; order: 'close' | 'alex'; missing: string[] }

/** Which funnel step a Close stage is (won by its type). Pure. */
export function stepOf(label: string, type: string): string {
  if (type === 'won') return 'won';
  if (type === 'lost') return '';
  // Most specific first: "Follow Up Call Booked" is a follow-up, "Contract Sent" never "Call booked".
  return ['followup', 'sent', 'done', 'booked'].find((k) => FUNNEL_STEPS.find((s) => s.key === k)!.match.test(label)) ?? '';
}

function side(opps: CloseOpportunity[], changes: CloseStatusChange[], steps: { key: string; label: string; stages: string[] }[]): FunnelSide {
  const byOpp = new Map<string, CloseStatusChange[]>();
  for (const c of changes) { const xs = byOpp.get(c.oppId) ?? []; xs.push(c); byOpp.set(c.oppId, xs); }
  const idx = new Map(steps.map((s, i) => [s.key, i]));
  const reachedIdx: number[] = []; const entered: Map<number, number>[] = [];
  for (const o of opps) {
    const ch = (byOpp.get(o.id) ?? []).sort((a, b) => a.at.localeCompare(b.at));
    const events: { at: number; step: string }[] = [];
    const first = ch[0];
    events.push({ at: Date.parse(o.created), step: first ? stepOf(first.oldStatus, first.oldType) : stepOf(o.status, o.statusType) });
    for (const c of ch) events.push({ at: Date.parse(c.at), step: stepOf(c.newStatus, c.newType) });
    if (o.statusType === 'won' && !events.some((e) => e.step === 'won')) events.push({ at: Date.parse(o.won || o.updated), step: 'won' });
    const ent = new Map<number, number>();
    for (const e of events) { const i = idx.get(e.step); if (i !== undefined && Number.isFinite(e.at) && !ent.has(i)) ent.set(i, e.at); }
    entered.push(ent);
    reachedIdx.push(ent.size ? Math.max(...ent.keys()) : -1);
  }
  const total = opps.length;
  const out: FunnelStep[] = steps.map((s, i) => {
    const reached = reachedIdx.filter((r) => r >= i).length;
    const prevReached = i === 0 ? total : reachedIdx.filter((r) => r >= i - 1).length;
    const gaps = i === 0 ? [] : entered.map((e) => (e.has(i) && e.has(i - 1) && e.get(i)! >= e.get(i - 1)! ? (e.get(i)! - e.get(i - 1)!) / DAY : null)).filter((x): x is number => x !== null);
    return { key: s.key, label: s.label, stages: s.stages, reached, pctOfTotal: pctOf(reached, total), pctOfPrev: pctOf(reached, prevReached), daysFromPrev: avg(gaps), daysN: gaps.length };
  });
  const won = opps.filter((o) => o.statusType === 'won'), lost = opps.filter((o) => o.statusType === 'lost');
  const toClose = won.map((o) => (Date.parse(o.won || o.updated) - Date.parse(o.created)) / DAY).filter((x) => Number.isFinite(x) && x >= 0);
  const values = won.map((o) => o.value).filter((v): v is number => v !== null && v > 0);
  const periods = [...new Set(won.filter((o) => o.value).map((o) => o.valuePeriod || 'one_time'))];
  return {
    total, won: won.length, lost: lost.length, closeRate: pctOf(won.length, total), decidedRate: pctOf(won.length, won.length + lost.length),
    avgDaysToClose: avg(toClose), avgWinValue: values.length ? Math.round(values.reduce((a, b) => a + b, 0) / values.length) : null,
    valuePeriod: periods.length === 1 ? periods[0] : periods.length ? 'mixed' : '', steps: out,
  };
}

/** The opportunity funnel for the period and the one before (Close's "Opportunity Funnels" numbers). Pure. */
export function closeFunnel(data: Pick<CloseRange, 'opps' | 'changes' | 'pipelines'>, pick: PeriodPick): FunnelView {
  const now = data.opps.filter((o) => inWin(o.created, pick.now)), prev = data.opps.filter((o) => inWin(o.created, pick.prev));
  const p = pickPipeline(data.pipelines, [...now, ...prev]);
  const labels: { label: string; type: string }[] = p ? p.statuses : [...new Map([...now, ...prev].map((o) => [o.status, { label: o.status, type: o.statusType }])).values()];
  const stagesFor = (k: string) => labels.filter((l) => stepOf(l.label, l.type) === k).map((l) => l.label);
  let steps = FUNNEL_STEPS.map((s) => ({ key: s.key, label: s.label, stages: stagesFor(s.key) }));
  const missing = steps.filter((s) => !s.stages.length && s.key !== 'won').map((s) => s.label);
  steps = steps.filter((s) => s.stages.length || s.key === 'won');
  // Close's own order: by the position of each step's first stage in the pipeline (won last).
  const pos = (s: { key: string; stages: string[] }) => (s.key === 'won' ? 1e9 : Math.min(...s.stages.map((x) => labels.findIndex((l) => l.label === x))));
  if (p) steps.sort((a, b) => pos(a) - pos(b));
  return { ...side(now, data.changes, steps), prev: side(prev, data.changes, steps), order: p ? 'close' : 'alex', missing };
}

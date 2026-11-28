// HQ round 3 (Alex 2026-11-27): Sales period picker + charts data, the capacity calendar fix (6-day
// windows; "Connect calendar"), the pipeline and the opportunity funnel straight from Close, the P/L
// pricing calculator (fake sheet: no real figure), and the Team view of agent-to-agent conversations.
// No real service is called: Close, the calendar service and Google Sheets are fakes.
import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { AddressInfo } from 'node:net';
import { createPool, migrate, type Db } from '../src/db/pool.js';
import { loadConfig, type Config } from '../src/config.js';
import { createServer } from '../src/http.js';
import { upsertUser, type HqUser } from '../src/hq/auth.js';
import { _resetSalesCache, nyDay, stagesOf, type Deal, type StageFacts } from '../src/hq/sales.js';
import { _resetInsightCaches, availabilityWindows, calendarLinkState, dulcySlotsReader, type SalesDeps } from '../src/hq/salesInsights.js';
import { buckets, bucketUnit, numbersView, resolvePeriod, runningTotals, type PeriodPick } from '../src/hq/salesPeriods.js';
import { _resetCloseRangeCache, closeFunnel, closePipeline, nyStartIso, readCloseRange, stepOf } from '../src/hq/salesClose.js';
import { createCloseClient, toOpportunity, toStatusChange } from '../src/providers/close.js';
import { _resetPricingCache, evaluate, numberOf, parsePlans, pricingModel, pricingSheetReader, pricingView, Unsupported, type SheetGrid } from '../src/hq/pricing.js';
import { agentConversation, agentConversations } from '../src/hq/agentTalk.js';

const url = process.env.TEST_DATABASE_URL;
const skip = !url ? 'TEST_DATABASE_URL not set' : false;
const TODAY = '2026-11-27';
const NOW = Date.parse('2026-11-27T15:00:00.000Z');

// ---------- periods ----------
test('period picker: month / quarter / year / last 30 / custom, each with the period before', () => {
  const p = (k: string, f?: string, t?: string) => resolvePeriod(k, TODAY, f, t) as PeriodPick;
  assert.deepEqual([p('month').now, p('month').prev], [{ from: '2026-11-01', to: TODAY, label: 'November so far' }, { from: '2026-10-01', to: '2026-10-31', label: 'October' }]);
  assert.deepEqual([p('quarter').now.from, p('quarter').now.label, p('quarter').prev.from, p('quarter').prev.to, p('quarter').prev.label], ['2026-10-01', 'Q4 2026 so far', '2026-07-01', '2026-09-30', 'Q3 2026']);
  assert.deepEqual([(resolvePeriod('quarter', '2026-02-10') as PeriodPick).prev.from, (resolvePeriod('quarter', '2026-02-10') as PeriodPick).prev.to], ['2025-10-01', '2025-12-31']);
  assert.deepEqual([p('year').prev.from, p('year').prev.to], ['2025-01-01', '2025-12-31']);
  assert.deepEqual([p('last30').now.from, p('last30').prev.from, p('last30').prev.to], ['2026-10-29', '2026-09-29', '2026-10-28']);
  const c = p('custom', '2026-11-10', '2026-11-19');
  assert.deepEqual([c.now.label, c.prev.from, c.prev.to, c.prev.label], ['11/10–11/19', '2026-10-31', '2026-11-09', 'The 10 days before'], 'dates with slashes');
  assert.match((resolvePeriod('custom', TODAY, '2026-11-20', '2026-11-01') as any).error, /after the end/);
  assert.match((resolvePeriod('custom', TODAY, 'x', '2026-11-01') as any).error, /start and an end/);
  assert.match((resolvePeriod('half', TODAY) as any).error, /period must be one of/);
});

test('buckets and running totals: days for a month, weeks for a quarter, months for a year', () => {
  assert.equal(bucketUnit({ from: '2026-11-01', to: '2026-11-27' }), 'day');
  assert.equal(bucketUnit({ from: '2026-10-01', to: '2026-11-27' }), 'week');
  assert.equal(bucketUnit({ from: '2026-01-01', to: '2026-11-27' }), 'month');
  const b = buckets({ from: '2026-01-01', to: '2026-03-15' }, 'month');
  assert.deepEqual(b.map((x) => x.label), ['Jan', 'Feb', 'Mar']);
  assert.deepEqual(runningTotals(['2026-01-05', '2026-02-02', '2026-02-20', '2025-12-31', ''], b, { from: '2026-01-01', to: '2026-03-15' }), [1, 3, 3]);
});

const facts = (o: Partial<StageFacts> = {}): StageFacts => ({ airtableStage: 'Audit Call Scheduled', callDate: '', heldDate: '', heldFlag: false, offerMade: false, dealClosed: false, cash: 0, feedbackStatus: '', agreement: null, clientPaid: false, onboarded: false, ...o });
let seq = 0;
function mk(callDate: string, f: Partial<StageFacts> = {}, o: Partial<Deal> = {}): Deal {
  const id = `recS${String(++seq).padStart(13, '0')}`;
  return {
    id, salesRec: id, name: 'Ann', company: 'acme.com', email: 'a@acme.com', source: '', rep: '', campaign: '', airtableStage: f.airtableStage ?? 'Audit Call Scheduled', lossReason: '', notes: '',
    callDate, heldDate: f.heldFlag ? callDate : '', bookedAt: '', startDay: callDate, stages: stagesOf(facts({ callDate, ...f })), stage: 'booked', lost: false, inactiveClient: false, agreements: [], agreement: f.agreement ?? null, signedDay: '',
    client: null, clientMatch: null, paidKnown: false, paidVia: '', onboardingStarted: false, feedback: [], reviews: [], prep: null, emailRecs: [], needs: [], closeUrl: '',
    paidDay: '', closeLead: '', agreementRoles: [], money: { monthly: null, perCall: null, forecast: null, offer: null, cash: null, currency: 'USD', paidTotal: null }, ...o,
  };
}
test('numbers: each metric this period vs the one before, as running totals; money only for the owner', () => {
  const won = { airtableStage: 'Won', heldFlag: true, dealClosed: true, clientPaid: true };
  const deals = [
    mk('2026-11-03', won, { signedDay: '2026-11-10', paidDay: '2026-11-12', money: { monthly: 2000, perCall: null, forecast: null, offer: null, cash: null, currency: 'USD', paidTotal: null } }),
    mk('2026-11-20', { airtableStage: 'Call Done', heldFlag: true }),
    mk('2026-10-02', { airtableStage: 'No Show' }),
    mk('2026-10-15', { airtableStage: 'Call Done', heldFlag: true }),
  ];
  const v = numbersView(deals, resolvePeriod('month', TODAY) as PeriodPick, true, TODAY);
  const m = (k: string) => v.metrics.find((x) => x.key === k)!;
  assert.equal(v.unit, 'day');
  assert.equal(v.labels.now.length, 27);
  assert.equal(v.labels.prev.length, 31);
  assert.deepEqual([m('booked').now, m('booked').prev, m('booked').dir, m('booked').pct], [2, 2, 'same', 0]);
  assert.deepEqual([m('showed').now, m('showed').prev, m('showed').pct], [2, 1, 100]);
  assert.equal(m('booked').series.now[2], 1, 'running total on 11/03');
  assert.equal(m('booked').series.now.at(-1), 2);
  assert.deepEqual([m('money').now, m('money').prev], [2000, 0]);
  assert.match(v.conclusion, /^November so far vs October: Calls the same \(2\), showed up 1 \(2 vs 1\), signed up 1 \(1 vs 0\)\.$/);
  assert.ok(!numbersView(deals, resolvePeriod('month', TODAY) as PeriodPick, false, TODAY).metrics.some((x) => x.key === 'money'), 'no money for anyone but the owner');
});

// ---------- capacity: the calendar read ----------
test('capacity fix: 30 days read as 6-day windows (the service refuses more than 7); a refused window says why', async () => {
  const w = availabilityWindows(NOW);
  assert.equal(w.length, 5);
  assert.ok(w.every((x) => Date.parse(x.end) - Date.parse(x.start) <= 6 * 86_400_000), 'never over 7 days');
  assert.equal(w[0].start, new Date(NOW + 2 * 3_600_000).toISOString());
  assert.equal(w.at(-1)!.end, new Date(NOW + 30 * 86_400_000).toISOString());
  const asked: { start: string; end: string; ws: string }[] = [];
  // The fake service behaves like services/dulcy-calendar: over 7 days = refused.
  const fake = (async (_u: string | URL, init?: RequestInit) => {
    const b = JSON.parse(String(init?.body)); asked.push({ start: b.start, end: b.end, ws: b.workspace });
    if (Date.parse(b.end) - Date.parse(b.start) > 7 * 86_400_000) return Response.json({ error: 'Invalid availability window' }, { status: 400 });
    return Response.json({ collection: [{ start_time: b.start, status: 'available' }, { start_time: new Date(Date.parse(b.start) + 3_600_000).toISOString(), status: 'available' }], connection: { timezone: 'America/New_York' } });
  }) as typeof fetch;
  _resetInsightCaches();
  const read = dulcySlotsReader({ calendarUrl: 'http://cal', calendarReaderToken: 't' }, fake)!;
  const r = await read();
  assert.equal(asked.length, 5);
  assert.ok(asked.every((a) => a.ws === 'recJx0WwHsdsvcVIN'), "Dulcy's own workspace");
  assert.deepEqual([r?.starts.length, r?.days, r?.error], [10, 30, undefined]);
  // A service that refuses everything: not readable → the connection status decides the button.
  _resetInsightCaches();
  const refuse = (async () => Response.json({ error: 'Calendar changed during availability check' }, { status: 400 })) as typeof fetch;
  assert.equal(await dulcySlotsReader({ calendarUrl: 'http://cal', calendarReaderToken: 't' }, refuse)!(), null);
  assert.deepEqual(calendarLinkState(null, { status: 'Not Connected', canBook: false, label: '', provider: null, timezone: null }, true, true), { readable: false, connected: false, status: 'Not Connected', canInvite: true, text: "Dulcy's calendar is not connected (Not Connected)." });
  assert.match(calendarLinkState(null, { status: 'Connected', canBook: true, label: '', provider: 'calendly', timezone: null }, true, false).text, /Connected \(calendly\), but its open times could not be read/);
  assert.match(calendarLinkState(null, null, false, false).text, /CALENDAR_READER_TOKEN/);
});

// ---------- Close: pipeline and funnel ----------
const d = (day: string, h = 15) => `${day}T${String(h).padStart(2, '0')}:00:00.000Z`;
const PIPE = [{ id: 'pipe_sales', name: 'Sales', statuses: [
  { id: 's1', label: 'Call Booked', type: 'active' }, { id: 's2', label: 'Call Done', type: 'active' }, { id: 's3', label: 'Follow Up Call', type: 'active' },
  { id: 's4', label: 'Contract Sent', type: 'active' }, { id: 's5', label: 'No Show', type: 'active' }, { id: 's6', label: 'Won', type: 'won' }, { id: 's7', label: 'Lost', type: 'lost' },
] }];
const O = (id: string, created: string, status: string, type: string, o: Record<string, unknown> = {}) => ({ id, lead_id: `lead_${id.replace('oppo_', '')}`, lead_name: id, status_label: status, status_type: type, pipeline_id: 'pipe_sales', value: 200000, value_period: 'monthly', confidence: 50, date_created: created, date_updated: created, date_won: null, ...o });
const SC = (opp: string, at: string, from: string, fromT: string, to: string, toT: string) => ({ id: `acti_${opp}_${at}`, opportunity_id: opp, lead_id: `lead_${opp.replace('oppo_', '')}`, date_created: at, old_status_label: from, old_status_type: fromT, new_status_label: to, new_status_type: toT });
const OPPS = [
  O('oppo_a', d('2026-11-02'), 'Won', 'won', { date_won: d('2026-11-22'), value: 200000 }),
  O('oppo_b', d('2026-11-05'), 'Contract Sent', 'active'),
  O('oppo_c', d('2026-11-10'), 'Call Done', 'active'),
  O('oppo_d', d('2026-11-12'), 'Lost', 'lost'),
  O('oppo_e', d('2026-11-20'), 'Call Booked', 'active'),
  O('oppo_f', d('2026-10-05'), 'Won', 'won', { date_won: d('2026-10-25'), value: 300000 }),
  O('oppo_g', d('2026-10-20'), 'No Show', 'active'),
];
const CHANGES = [
  SC('oppo_a', d('2026-11-04'), 'Call Booked', 'active', 'Call Done', 'active'), SC('oppo_a', d('2026-11-10'), 'Call Done', 'active', 'Follow Up Call', 'active'),
  SC('oppo_a', d('2026-11-14'), 'Follow Up Call', 'active', 'Contract Sent', 'active'), SC('oppo_a', d('2026-11-22'), 'Contract Sent', 'active', 'Won', 'won'),
  SC('oppo_b', d('2026-11-07'), 'Call Booked', 'active', 'Call Done', 'active'), SC('oppo_b', d('2026-11-15'), 'Call Done', 'active', 'Contract Sent', 'active'),
  SC('oppo_c', d('2026-11-12'), 'Call Booked', 'active', 'Call Done', 'active'),
  SC('oppo_d', d('2026-11-13'), 'Call Booked', 'active', 'Lost', 'lost'),
  SC('oppo_f', d('2026-10-10'), 'Call Booked', 'active', 'Won', 'won'),
  SC('oppo_g', d('2026-10-21'), 'Call Booked', 'active', 'No Show', 'active'),
];
function fakeClose(calls: { method: string; path: string; q: Record<string, string> }[]) {
  return (async (u: string | URL, init?: RequestInit) => {
    const q = new URL(String(u)); const path = q.pathname.replace('/api/v1', '');
    calls.push({ method: String(init?.method ?? 'GET'), path, q: Object.fromEntries(q.searchParams) });
    if (path === '/opportunity/') return Response.json({ data: OPPS, has_more: false });
    if (path === '/activity/status_change/opportunity/') return Response.json({ data: CHANGES, has_more: false });
    if (path === '/pipeline/') return Response.json({ data: PIPE });
    return new Response('{}', { status: 404 });
  }) as typeof fetch;
}
const snap = () => ({ opps: OPPS.map(toOpportunity), changes: CHANGES.map(toStatusChange), pipelines: PIPE });

test('Close pipeline: every stage in Close order, share of the period (percent), next to the month before', () => {
  const v = closePipeline(snap(), resolvePeriod('month', TODAY) as PeriodPick);
  assert.deepEqual([v.pipeline, v.total, v.prevTotal, v.won, v.lost, v.open], ['Sales', 5, 2, 1, 1, 3]);
  assert.deepEqual(v.stages.map((s) => [s.label, s.count, s.pct, s.prev, s.prevPct]), [
    ['Call Booked', 1, 20, 0, 0], ['Call Done', 1, 20, 0, 0], ['Follow Up Call', 0, 0, 0, 0], ['Contract Sent', 1, 20, 0, 0], ['No Show', 0, 0, 1, 50], ['Won', 1, 20, 1, 50], ['Lost', 1, 20, 0, 0],
  ]);
});

test('Close funnel: total, close rate, days to close, value per win, days between steps (Close pipeline order)', () => {
  assert.deepEqual(['Call Booked', 'Follow Up Call', 'Call Done', 'Contract Sent', 'No Show'].map((x) => stepOf(x, 'active')), ['booked', 'followup', 'done', 'sent', '']);
  assert.equal(stepOf('Won', 'won'), 'won');
  const f = closeFunnel(snap(), resolvePeriod('month', TODAY) as PeriodPick);
  assert.equal(f.order, 'close');
  assert.deepEqual(f.steps.map((s) => s.label), ['Call booked', 'Call done', 'Follow-up', 'Contract sent', 'Won'], "Close's own order (Call Done comes before Follow Up Call here)");
  assert.deepEqual(f.steps.map((s) => [s.reached, s.pctOfTotal]), [[5, 100], [3, 60], [2, 40], [2, 40], [1, 20]]);
  assert.deepEqual([f.total, f.won, f.lost, f.closeRate, f.decidedRate, f.avgDaysToClose, f.avgWinValue, f.valuePeriod], [5, 1, 1, 20, 50, 20, 2000, 'monthly']);
  assert.deepEqual(f.steps.map((s) => s.daysFromPrev), [null, 2, 6, 4, 8], 'booked→done: avg of a 2 + b 2 + c 2; done→follow-up: a 6; follow-up→sent: a 4; sent→won: a 8');
  assert.deepEqual([f.prev.total, f.prev.won, f.prev.closeRate, f.prev.avgWinValue], [2, 1, 50, 3000]);
  assert.equal(f.prev.steps.find((s) => s.key === 'won')!.reached, 1, 'a deal that skipped steps still counts as reaching them');
  assert.deepEqual(f.missing, []);
});

test('Close range reader: GET only, bounded by the period (from the month before), cached 5 minutes', async () => {
  _resetCloseRangeCache();
  const calls: { method: string; path: string; q: Record<string, string> }[] = [];
  const close = createCloseClient('k', fakeClose(calls))!;
  const pick = resolvePeriod('month', TODAY) as PeriodPick;
  const r = await readCloseRange(close, pick, false, NOW);
  assert.equal(r.opps.length, 7);
  assert.ok(calls.every((c) => c.method === 'GET'));
  const o = calls.find((c) => c.path === '/opportunity/')!;
  assert.equal(o.q.date_created__gte, nyStartIso('2026-10-01'));
  assert.equal(nyStartIso('2026-10-01'), '2026-10-01T04:00:00.000Z', 'New York midnight (EDT)');
  assert.equal(nyStartIso('2026-11-27'), '2026-11-27T05:00:00.000Z', 'New York midnight (EST)');
  const n = calls.length;
  await readCloseRange(close, pick, false, NOW + 60_000);
  assert.equal(calls.length, n, 'cached');
});

// ---------- pricing calculator ----------
test('formula reader: math, percent, SUM/ROUND/IF/IFERROR; another tab or an unknown function = Unsupported', () => {
  const cells: Record<string, number | string> = { B1: 10, B2: 0.25, B3: 4, B4: 6, B5: '' };
  const get = (r: string) => cells[r] ?? '';
  assert.equal(evaluate('=B1*(1+B2)', get), 12.5);
  assert.equal(evaluate('=SUM(B1:B4)/2', get), 10.125);
  assert.equal(evaluate('=ROUND(B1/3, 2)', get), 3.33);
  assert.equal(evaluate('=IF(B3>B4, "more", B4-B3)', get), 2);
  assert.equal(evaluate('=IFERROR(B1/B5, 0)', get), 0);
  assert.equal(evaluate('=50%*B1+2^3', get), 13);
  assert.equal(evaluate('=MAX(B1,B3)-MIN(B3:B4)+AVERAGE(B3,B4)', get), 11);
  assert.throws(() => evaluate("='Costs'!B2*2", get), Unsupported);
  assert.throws(() => evaluate('=VLOOKUP(B1,B2:B4,1)', get), Unsupported);
  assert.deepEqual(['$2,500.00', '45%', '(1,200)', 'abc', ''].map(numberOf), [2500, 0.45, -1200, null, null]);
});

// A FAKE "OPEX Guide" tab (made-up numbers; the real P/L figures are never in this repo). Two plan blocks
// in column E with the sheet's layout: lines, a blank row, then Cost Setup / Cost Monthly / Profit / Opex.
const BLOCKS: [string, string | number, (string | number)?][] = [
  ['Client Fulfillment - Starter', 'Cost'], ['Retainer', 1000], ['Rev Share 10%', 100], ['Cheap Inboxes', '=10*-3'], ['Domains ($1-2/yr)', -20],
  ['Scraping Credits', '=SUM(1000 * G7)', -0.01], ['Verifcation Credits', '=SUM (1000*G8)', -0.002], ['Tool seat', -50], ['AI build', -500], ['', ''],
  ['Cost Setup', '=SUM(F5:F10)'], ['Cost Monthly', '=SUM(F5:F9)'], ['Profit Monthly', '=(F3+F4+F13)'], ['Act. Opex Monthly', '=-F13/(F3+F4)'],
  ['Client Fulfillment - Starter', 'Cost'], ['Retainer', 2000], ['Cheap Inboxes', '=20*-3'], ['Cost Monthly', '=SUM(F18:F18)'], ['Profit Monthly', '=F17+F19'],
];
const OPEX: SheetGrid = {
  tab: 'OPEX Guide', readAt: '2026-11-28T15:00:00.000Z',
  values: [['', 'Expected Rev', '$9.00'], ...BLOCKS.map(([l, v, u]) => ['', '', '', '', l, typeof v === 'string' && v.startsWith('=') ? '$0.00' : String(v), u === undefined ? '' : '$0.00'])],
  formulas: [['', 'Expected Rev', '9'], ...BLOCKS.map(([l, v, u]) => ['', '', '', '', l, String(v), u === undefined ? '' : String(u)])],
};
test("pricing: the OPEX Guide's Client Fulfillment blocks are the only inputs; results are the sheet's sums; $2.50 per inbox from RULES", () => {
  const plans = parsePlans(OPEX);
  assert.deepEqual(plans.map((p) => [p.key, p.name]), [['p1', 'Starter · $1,000'], ['p2', 'Starter · $2,000']]);
  assert.deepEqual(plans[0].inputs.map((i) => [i.key, i.value, i.group]), [
    ['r3', 1000, 'revenue'], ['r4', 100, 'revenue'], ['inboxes', 10, 'volume'], ['inboxPrice', 2.5, 'monthly'], ['r6', 20, 'monthly'],
    ['leads', 1000, 'volume'], ['u7', 0.01, 'monthly'], ['u8', 0.002, 'monthly'], ['r9', 50, 'monthly'], ['r10', 500, 'oneoff'],
  ]);
  assert.match(plans[0].inputs.find((i) => i.key === 'inboxPrice')!.note ?? '', /RULES 2026-11-28.*sheet line uses \$3\.00/);
  const every = plans.flatMap((p) => p.inputs.map((i) => i.label)).join(' | ');
  assert.doesNotMatch(every, /team hour|target margin|show rate|reply rate/i, 'nothing that is not in the sheet');
  const m = pricingModel(plans, { source: 'sheet' });
  const out = Object.fromEntries(m.outputs.map((o) => [o.key, o.value]));
  // 10 × $2.50 + 1,000 × ($0.01 + $0.002) + $20 + $50 = $107 a month; $500 build in the first month only.
  assert.deepEqual([out.revenue, out.cost, out.profit, out.opex, out.margin, out.costFirst, out.profitFirst], [1100, 107, 993, 0.097, 0.903, 607, 493]);
  assert.equal(m.assumptions.length, 0, "with the sheet's $3 per inbox HQ gets the sheet's own profit ($988), so no check note");
  const changed = pricingModel(plans, { plan: 'p1', overrides: { r3: 2000, inboxes: 0 }, source: 'sheet' });
  assert.equal(changed.outputs.find((o) => o.key === 'profit')!.value, 2100 - 82);
  const two = pricingModel(plans, { plan: 'p2', source: 'sheet' });
  assert.deepEqual([two.plan, two.outputs.find((o) => o.key === 'profit')!.value, two.outputs.some((o) => o.key === 'costFirst')], ['p2', 1950, false]);
  const off = pricingModel([{ ...plans[0], sheetProfit: 5000 }], { source: 'sheet' });
  assert.match(off.assumptions.join(' '), /Check: .*\$988.*\$5,000/);
});

test('pricing reader: the "OPEX Guide" tab; formulas and values read (never written); cached; no sheet = the same line names, empty', async () => {
  _resetPricingCache();
  const reads: string[] = [];
  const sheets = {
    async meta() { reads.push('meta'); return { sheets: [{ properties: { sheetId: 1, title: 'goal' } }, { properties: { sheetId: 2, title: 'OPEX Guide' } }] }; },
    async tab(_id: string, tab: string) { reads.push(`values:${tab}`); return OPEX.values; },
    async formulas(_id: string, tab: string) { reads.push(`formulas:${tab}`); return OPEX.formulas; },
  } as any;
  const read = pricingSheetReader(() => sheets);
  const v = await pricingView(read, { r3: 2000, 'X; DROP': 1 } as any, 'p1');
  assert.equal(v.source, 'sheet');
  assert.equal(v.tab, 'OPEX Guide');
  assert.deepEqual(reads, ['meta', 'values:OPEX Guide', 'formulas:OPEX Guide']);
  assert.equal(v.outputs.find((o) => o.key === 'profit')!.value, 1993);
  assert.equal((await pricingView(read, {}, 'p2')).plan, 'p2');
  assert.equal(reads.length, 3, 'cached 10 minutes');
  _resetPricingCache();
  const none = await pricingView(pricingSheetReader(() => ({ async meta() { return { sheets: [{ properties: { sheetId: 1, title: 'P&L' } }] }; }, async tab() { return []; }, async formulas() { return []; } }) as any));
  assert.equal(none.source, 'builtin');
  assert.match(none.error ?? '', /No "OPEX Guide"/);
  assert.match(none.assumptions[0], /not read/);
  assert.deepEqual(none.inputs.filter((i) => i.value).map((i) => [i.key, i.value]), [['inboxPrice', 2.5]], 'only the RULES inbox price is filled in');
  assert.doesNotMatch(none.inputs.map((i) => i.label).join(' | '), /team hour|target margin/i);
  assert.equal((await pricingView(undefined)).source, 'builtin');
});

// ---------- DB + routes ----------
let db: Db; let server: http.Server; let port = 0; let webDir: string;
const PW = 'correct horse battery staple';
const deps: SalesDeps = {};
const at = { async list() { return []; }, async get() { return null; }, async create() { return 'recX'; }, async update() {} };
function cfg(): Config {
  return { ...loadConfig({ ENGINE_SECRET: 'x'.repeat(40), DATABASE_URL: url ?? 'postgres://x', HQ_SESSION_SECRET: 's'.repeat(40), HQ_HOST: 'hq.test.local' } as NodeJS.ProcessEnv), airtableApiKey: undefined, anthropicApiKey: undefined };
}
function call(p: string, cookie?: string, method = 'GET', body?: unknown): Promise<{ status: number; body: any; text: string }> {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port, method, path: p, headers: { host: `127.0.0.1:${port}`, ...(method !== 'GET' ? { origin: `https://127.0.0.1:${port}`, 'content-type': 'application/json' } : {}), ...(cookie ? { cookie } : {}) } }, (res) => {
      let t = ''; res.on('data', (c) => (t += c)); res.on('end', () => { let b: any = null; try { b = JSON.parse(t); } catch { /* not json */ } resolve({ status: res.statusCode ?? 0, body: b, text: t }); });
    });
    req.on('error', reject); if (body !== undefined) req.write(JSON.stringify(body)); req.end();
  });
}
function login(email: string, password: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port, method: 'POST', path: '/hq/api/auth/login', headers: { host: `127.0.0.1:${port}`, origin: `https://127.0.0.1:${port}`, 'content-type': 'application/json' } }, (res) => {
      res.resume(); res.on('end', () => resolve(([] as string[]).concat(res.headers['set-cookie'] ?? []).map((c) => c.split(';')[0]).find((c) => c.startsWith('__Host-hq_session=')) ?? ''));
    });
    req.on('error', reject); req.write(JSON.stringify({ email, password })); req.end();
  });
}
before(async () => {
  webDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hqr3-'));
  fs.writeFileSync(path.join(webDir, 'index.html'), '<!doctype html><title>Dulcy HQ</title>');
  if (skip) return;
  db = createPool(url!); await migrate(db);
  server = createServer(db, cfg(), { at: at as any, webDir, sales: deps });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', () => r()));
  port = (server.address() as AddressInfo).port;
});
after(async () => { if (!skip) { server.close(); await db.end(); } fs.rmSync(webDir, { recursive: true, force: true }); });
let closeCalls: { method: string; path: string; q: Record<string, string> }[] = [];
beforeEach(async () => {
  _resetSalesCache(); _resetInsightCaches(); _resetCloseRangeCache(); _resetPricingCache(); closeCalls = [];
  deps.close = createCloseClient('k', fakeClose(closeCalls)); deps.pricingSheet = undefined;
  if (skip) return;
  await db.query('TRUNCATE hq_users, hq_sessions, hq_login_attempts, hq_chat_threads, hq_chat_messages, hq_agent_tasks RESTART IDENTITY CASCADE');
  await upsertUser(db, 'alex@dulcy.io', 'owner', PW, 'Alex');
  await upsertUser(db, 'josh@dulcy.io', 'member', 'josh long password 1', 'Josh');
});

test('routes: the new sales routes are owner only (members 403, nothing read); the owner gets numbers, Close and pricing', { skip }, async (t) => {
  t.mock.timers.enable({ apis: ['Date'], now: NOW });
  const josh = await login('josh@dulcy.io', 'josh long password 1');
  for (const [method, p] of [['GET', '/hq/api/sales/numbers'], ['GET', '/hq/api/sales/close'], ['GET', '/hq/api/sales/pricing'], ['POST', '/hq/api/sales/pricing'], ['POST', '/hq/api/sales/calendar-invite']] as const) {
    const r = await call(p, josh, method, method === 'POST' ? { email: 'alex@dulcy.io' } : undefined);
    assert.equal(r.status, 403, `${method} ${p}`);
  }
  assert.equal(closeCalls.length, 0, 'a member never triggers a Close read');
  const alex = await login('alex@dulcy.io', PW);
  const n = await call('/hq/api/sales/numbers?period=quarter', alex);
  assert.equal(n.status, 200, n.text);
  assert.deepEqual([n.body.period.key, n.body.unit, n.body.metrics.map((x: any) => x.key)], ['quarter', 'week', ['booked', 'showed', 'qualified', 'sent', 'signed', 'paid', 'money']]);
  assert.equal((await call('/hq/api/sales/numbers?period=custom&from=2026-11-20&to=2026-11-01', alex)).status, 400);
  const c = await call('/hq/api/sales/close', alex);
  assert.equal(c.status, 200, c.text);
  assert.deepEqual([c.body.period.key, c.body.connected, c.body.ok], ['last30', true, true], 'the pipeline defaults to the last 30 days');
  assert.deepEqual([c.body.funnel.total, c.body.pipeline.total, c.body.funnel.prev.total], [5, 5, 2], 'created 10/29–11/27 vs 9/29–10/28');
  assert.ok(closeCalls.every((x) => x.method === 'GET'));
  // Pricing with no sheet on this server: the sheet's line names, empty; the owner's numbers worked out.
  const pr = await call('/hq/api/sales/pricing', alex, 'POST', { plan: 'p1', inputs: { r1: 1000, inboxes: 10 } });
  assert.equal(pr.status, 200, pr.text);
  assert.deepEqual([pr.body.source, pr.body.plan, pr.body.outputs.find((o: any) => o.key === 'profit').value], ['builtin', 'p1', 975]);
});

test('agent conversations: Ada asking agents + hand-offs, newest first, filter by agent; members never see Ledger or Sienna', { skip }, async () => {
  const alex = (await db.query(`SELECT id FROM hq_users WHERE email='alex@dulcy.io'`)).rows[0].id;
  const josh = (await db.query(`SELECT id FROM hq_users WHERE email='josh@dulcy.io'`)).rows[0].id;
  const thread = async (user: number, agent: string, askedBy: string, parent: number | null, q: string, a: string, at: string) => {
    const id = Number((await db.query(`INSERT INTO hq_chat_threads (user_id, agent, asked_by, parent_id, title, updated_at) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`, [user, agent, askedBy, parent, q.slice(0, 40), at])).rows[0].id);
    await db.query(`INSERT INTO hq_chat_messages (thread_id, role, author, text) VALUES ($1,'user',$2,$3), ($1,'assistant',$4,$5)`, [id, askedBy === 'user' ? 'Alex' : askedBy, q, agent, a]);
    await db.query(`UPDATE hq_chat_threads SET updated_at=$2 WHERE id=$1`, [id, at]);
    return id;
  };
  const top = await thread(alex, 'Ada', 'user', null, 'How are campaigns?', 'Atlas says fine.', '2026-11-27T10:00:00Z');
  const atlas = await thread(alex, 'Atlas', 'Ada', top, 'Atlas, which campaign is past 60%?', 'Twenty West, 64%.', '2026-11-27T10:01:00Z');
  const ledger = await thread(alex, 'Ledger', 'Ada', top, 'Ledger, MRR this month?', '$X', '2026-11-27T10:02:00Z');
  const joshTop = await thread(josh, 'Ada', 'user', null, 'Replies today?', 'Echo says 4.', '2026-11-27T09:00:00Z');
  const echo = await thread(josh, 'Echo', 'Ada', joshTop, 'Echo, replies waiting?', '4 waiting.', '2026-11-27T09:01:00Z');
  await db.query(`INSERT INTO hq_agent_tasks (agent, title, status, progress_note, requeues, requeued_at, updated_at) VALUES ('Atlas','Plan Acme',  'in_progress','Writing the plan',1,'2026-11-27T11:00:00Z','2026-11-27T11:00:00Z'), ('Sienna','Scripts','open','',2,'2026-11-27T08:00:00Z','2026-11-27T08:00:00Z'), ('Riley','Never re-queued','open','',0,NULL,'2026-11-27T12:00:00Z')`);
  const owner: HqUser = { id: alex, email: 'alex@dulcy.io', name: 'Alex', role: 'owner' };
  const member: HqUser = { id: josh, email: 'josh@dulcy.io', name: 'Josh', role: 'member' };
  const all = await agentConversations(db, owner);
  assert.deepEqual(all.map((x) => [x.kind, x.from, x.to]), [['handoff', 'Ada', 'Atlas'], ['ask', 'Ada', 'Ledger'], ['ask', 'Ada', 'Atlas'], ['ask', 'Ada', 'Echo'], ['handoff', 'Ada', 'Sienna']], 'newest first; person ↔ agent chats and never-re-queued tasks are not here');
  assert.equal(all[2].title, 'Atlas, which campaign is past 60%?');
  assert.equal(all[2].preview, 'Twenty West, 64%.');
  assert.deepEqual((await agentConversations(db, owner, { agent: 'Atlas' })).map((x) => x.id), ['handoff-1', `ask-${atlas}`]);
  const mine = await agentConversations(db, member);
  assert.deepEqual(mine.map((x) => x.id), ['handoff-1', `ask-${echo}`], 'a member: own chats only, never Ledger or Sienna');
  const open = await agentConversation(db, owner, `ask-${atlas}`);
  assert.deepEqual(open?.messages.map((m) => [m.author, m.role]), [['Ada', 'question'], ['Atlas', 'answer']]);
  assert.equal(open?.parent?.id, top);
  assert.equal(await agentConversation(db, member, `ask-${ledger}`), null);
  assert.equal(await agentConversation(db, member, `ask-${atlas}`), null, "not the member's chat");
  assert.equal(await agentConversation(db, owner, `ask-${top}`), null, 'a person ↔ agent chat is not an agent conversation');
  const h = await agentConversation(db, owner, 'handoff-1');
  assert.match(h!.messages[0].text, /re-queued it/);
  assert.equal(await agentConversation(db, member, 'handoff-2'), null, 'Sienna hidden from members');
  // The routes: the same rules over HTTP.
  const josh2 = await login('josh@dulcy.io', 'josh long password 1');
  const r = await call('/hq/api/team/conversations', josh2);
  assert.deepEqual(r.body.conversations.map((x: any) => x.id), ['handoff-1', `ask-${echo}`]);
  assert.equal((await call('/hq/api/team/conversations?agent=Ledger', josh2)).status, 404);
  assert.equal((await call(`/hq/api/team/conversations/ask-${ledger}`, josh2)).status, 404);
  assert.equal((await call(`/hq/api/team/conversations/ask-${echo}`, josh2)).status, 200);
});

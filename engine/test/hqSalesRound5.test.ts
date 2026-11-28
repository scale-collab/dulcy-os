// HQ round 5, Sales (Alex 2026-11-28): goals (the n8n "Airtable Monthly Goals Auto" maths ported and
// checked against the workflow's own code), goals vs actuals, Cole's take (rule line, model cached for
// the day, fallback), named calls with Fathom links, and one agent task per "Data to fix" item.
// Airtable is a fake; no real service is called; nothing is written to Airtable.
import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { AddressInfo } from 'node:net';
import { createPool, migrate, type Db } from '../src/db/pool.js';
import { loadConfig, type Config } from '../src/config.js';
import { createServer } from '../src/http.js';
import { upsertUser } from '../src/hq/auth.js';
import { _resetSalesCache, noteActions, stagesOf, type ColeReport, type Deal } from '../src/hq/sales.js';
import {
  GF, GOALS_T, _resetGoalsCache, coleChatAsk, coleTake, coleTakeRule, goalLines, goalRowOf, goalsView, monthActuals, n8nGoals, paceScore, takeOk,
  type GoalInputs, type GoalRow, type TakeInput,
} from '../src/hq/salesGoals.js';
import { callName, dealCalls, fathomAbout, stageCallName } from '../src/hq/salesCalls.js';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const WORKFLOW = path.join(REPO, 'automations/n8n-live-2026-11-17/workflows/airtable-monthly-goals-auto--gMPw1uq28qwMERs7fnUyw.json');
const url = process.env.TEST_DATABASE_URL;
const skip = !url ? 'TEST_DATABASE_URL not set' : false;
const TODAY = '2026-11-28';

// ---------- the goal maths matches the workflow's own JavaScript ----------
/** Run the n8n Code node "new targets suggestions" on one Sales Goals record (as n8n would). */
function runWorkflowNode(fields: Record<string, unknown>) {
  const wf = JSON.parse(fs.readFileSync(WORKFLOW, 'utf8'));
  const code = wf.nodes.find((n: any) => n.name === 'new targets suggestions').parameters.jsCode as string;
  const $input = { first: () => ({ json: { fields } }) };
  return (new Function('$input', code))($input)[0].json.javascriptRecommendation;
}
const toFields = (x: GoalInputs) => ({
  'Revenue Goal': x.goals.revenue, 'Cash Collected Goal': x.goals.cash, 'Calls Goal': x.goals.calls, 'Deals Goal': x.goals.deals,
  'Revenue Closed': x.actual.revenueClosed, 'Cash Collected': x.actual.cashCollected, 'Total Calls Booked': x.actual.callsBooked,
  'Total Calls Held': x.actual.callsHeld, 'Total Offers Made': x.actual.offersMade, 'Total Deals Closed': x.actual.dealsClosed,
});

test('goals: n8nGoals gives the same goals as the n8n workflow code, case by case', () => {
  const cases: GoalInputs[] = [
    { goals: { revenue: 10000, cash: 8000, calls: 20, deals: 3 }, actual: { revenueClosed: 14000, cashCollected: 9000, callsBooked: 28, callsHeld: 20, offersMade: 10, dealsClosed: 4 } },
    { goals: { revenue: 10000, cash: 8000, calls: 20, deals: 3 }, actual: { revenueClosed: 2000, cashCollected: 1000, callsBooked: 8, callsHeld: 5, offersMade: 2, dealsClosed: 1 } },
    { goals: { revenue: 6000, cash: 0, calls: 15, deals: 2 }, actual: { revenueClosed: 0, cashCollected: 0, callsBooked: 12, callsHeld: 9, offersMade: 4, dealsClosed: 0 } },
    { goals: { revenue: 0, cash: 0, calls: 0, deals: 0 }, actual: { revenueClosed: 3000, cashCollected: 2500, callsBooked: 4, callsHeld: 3, offersMade: 1, dealsClosed: 1 } },
    { goals: { revenue: 20000, cash: 15000, calls: 40, deals: 6 }, actual: { revenueClosed: 21000, cashCollected: 14000, callsBooked: 42, callsHeld: 30, offersMade: 15, dealsClosed: 6 } },
  ];
  // Plus a sweep of mixed results.
  for (let i = 0; i < 40; i++) {
    const calls = 5 + ((i * 7) % 40), deals = 1 + (i % 6);
    cases.push({ goals: { revenue: 1000 * (2 + (i % 15)), cash: i % 3 ? 1000 * (1 + (i % 9)) : 0, calls, deals }, actual: { revenueClosed: 500 * ((i * 13) % 40), cashCollected: 400 * ((i * 11) % 30), callsBooked: (i * 5) % 45, callsHeld: (i * 3) % 30, offersMade: i % 12, dealsClosed: (i * 3) % 8 } });
  }
  for (const c of cases) {
    const want = runWorkflowNode(toFields(c));
    const got = n8nGoals(c);
    assert.deepEqual(
      { revenueGoal: got.revenueGoal, cashGoal: got.cashGoal, callsGoal: got.callsGoal, dealsGoal: got.dealsGoal, confidence: got.confidence, projectedGrowthRate: got.projectedGrowthRate },
      { revenueGoal: want.revenueGoal, cashGoal: want.cashGoal, callsGoal: want.callsGoal, dealsGoal: want.dealsGoal, confidence: want.confidence, projectedGrowthRate: want.projectedGrowthRate },
      JSON.stringify(c),
    );
  }
  // A strong month raises the goals; a weak one lowers them a little (capped by the low-sample rule).
  assert.ok(n8nGoals(cases[0]).callsGoal > 20 && n8nGoals(cases[0]).growthRate === 0.2, 'a strong month with enough calls: +20%');
  assert.equal(n8nGoals(cases[1]).growthRate, -0.05, 'low confidence: at most -5%');
});

const R = (id: string, fields: Record<string, unknown>, createdTime = '2026-11-01T05:00:00.000Z') => ({ id, fields, createdTime });
const novRow = () => R('recGOALNOV0000001', {
  [GF.month]: 'November 2026', [GF.date]: '2026-11-01', [GF.revenueGoal]: 6000, [GF.cashGoal]: 4000, [GF.callsGoal]: 15, [GF.dealsGoal]: 2,
  [GF.growth]: 0.05, [GF.confidence]: 'low', [GF.reasoning]: 'Performance was close to goal, so the targets were increased only slightly.',
  [GF.callsBooked]: 9, [GF.dealsClosed]: 0, [GF.revenueClosed]: 0,
});
const octRow = () => R('recGOALOCT0000001', { [GF.month]: 'October 2026', [GF.revenueGoal]: 5000, [GF.cashGoal]: 4000, [GF.callsGoal]: 15, [GF.dealsGoal]: 2, [GF.callsBooked]: 14, [GF.dealsClosed]: 2, [GF.revenueClosed]: 4000, [GF.cashCollected]: 3000 }, '2026-10-01T05:00:00.000Z');

test('goals: a Sales Goals record becomes a row by month (Month text, else Date)', () => {
  const g = goalRowOf(novRow() as any)!;
  assert.equal(g.month, '2026-11');
  assert.deepEqual([g.callsGoal, g.dealsGoal, g.revenueGoal, g.cashGoal, g.growth, g.confidence], [15, 2, 6000, 4000, 0.05, 'low']);
  assert.equal(goalRowOf(R('recX', { [GF.date]: '2026-09-01', [GF.callsGoal]: 3 }) as any)!.month, '2026-09');
  assert.equal(goalRowOf(R('recY', { [GF.callsGoal]: 3 }) as any), null, 'no month, no row');
});

// Minimal deals for the actuals.
const deal = (o: Partial<Deal> & { signed?: boolean; showed?: boolean }): Deal => {
  const stages = stagesOf({ airtableStage: o.showed ? 'Call Done' : 'Audit Call Scheduled', callDate: o.callDate ?? '', heldDate: '', heldFlag: !!o.showed, offerMade: false, dealClosed: !!o.signed, cash: 0, feedbackStatus: '', agreement: null, clientPaid: false, onboarded: false });
  return { id: 'recS', salesRec: 'recS', name: 'A', company: '', email: '', source: '', rep: '', campaign: '', airtableStage: '', lossReason: '', notes: '', callDate: '', heldDate: '', bookedAt: '', startDay: '', stages, stage: 'booked', lost: false, inactiveClient: false, agreements: [], agreement: null, signedDay: '', client: null, clientMatch: null, paidKnown: false, paidVia: '', onboardingStarted: false, feedback: [], reviews: [], prep: null, emailRecs: [], needs: [], closeUrl: '', paidDay: '', closeLead: '', agreementRoles: [], money: { monthly: null, perCall: null, forecast: null, offer: null, cash: null, currency: 'USD', paidTotal: null }, ...o } as Deal;
};
const novDeals = () => [
  ...Array.from({ length: 14 }, (_, i) => deal({ callDate: `2026-11-${String(2 + i).padStart(2, '0')}`, showed: i % 3 !== 0 })),
  deal({ callDate: '2026-11-03', showed: true, signed: true, signedDay: '2026-11-10', money: { monthly: 3000, perCall: null, forecast: null, offer: null, cash: null, currency: 'USD', paidTotal: 3000 } }),
  deal({ callDate: '2026-11-05', showed: true, signed: true, signedDay: '2026-11-20', money: { monthly: 2500, perCall: null, forecast: null, offer: null, cash: null, currency: 'USD', paidTotal: null } }),
  deal({ callDate: '2026-10-20', showed: true }),
];

test('goals: this month from the n8n row, goals vs actuals with the pace line, next month at this pace', () => {
  const rows = [goalRowOf(novRow() as any)!, goalRowOf(octRow() as any)!];
  const act = monthActuals(novDeals(), '2026-11');
  assert.deepEqual([act.callsBooked, act.dealsClosed, act.revenue, act.cash], [16, 2, 5500, 3000]);
  const v = goalsView(rows, novDeals(), TODAY, true);
  assert.equal(v.source.kind, 'airtable');
  assert.equal(v.source.text, 'Set 11/1 by the n8n workflow "Airtable Monthly Goals Auto" from October\'s goals and results (+5%), confidence low.');
  assert.ok(!/\b(Mon|Tue|Wed|Thu|Fri|Sat|Sun)[a-z]*day\b|\b(Mon|Tue|Wed|Thu|Fri|Sat|Sun)\b/.test(v.source.text), 'no weekday');
  assert.deepEqual(v.lines.map((l) => [l.key, l.text, l.status]), [
    ['calls', '16 of 15 (107%)', 'hit'], ['deals', '2 of 2 (100%)', 'hit'], ['revenue', '$5,500 of $6,000 (92%)', 'on_pace'], ['cash', '$3,000 of $4,000 (75%)', 'behind'],
  ]);
  assert.match(v.warning, /counts 0 deals closed in November; HQ counts 2 signed/);
  assert.equal(v.next!.title, 'December 2026');
  assert.ok(v.next!.calls >= 15, 'a good month does not lower the call goal');
  // Members never get money (the route is owner only anyway).
  const m = goalsView(rows, novDeals(), TODAY, false);
  assert.deepEqual(m.lines.map((l) => l.key), ['calls', 'deals']);
  assert.ok(!/5500|6000|4000|3000/.test(JSON.stringify({ g: m.goals, l: m.lines, a: m.actuals })));
});

test('goals: no row for this month → HQ works it out from last month with the same rules; none at all → UNKNOWN', () => {
  const oct = goalRowOf(octRow() as any)!;
  const v = goalsView([oct], novDeals(), TODAY, true);
  assert.equal(v.source.kind, 'engine');
  const want = n8nGoals({ goals: { revenue: 5000, cash: 4000, calls: 15, deals: 2 }, actual: { revenueClosed: 4000, cashCollected: 3000, callsBooked: 14, callsHeld: 0, offersMade: 0, dealsClosed: 2 } });
  assert.deepEqual(v.goals, { calls: want.callsGoal, deals: want.dealsGoal, revenue: want.revenueGoal, cash: want.cashGoal });
  assert.match(v.source.text, /has not written November 2026 yet\. HQ worked it out with the same rules from October's Sales Goals row/);
  const none = goalsView([], novDeals(), TODAY, true);
  assert.equal(none.source.kind, 'none');
  assert.match(none.source.text, /UNKNOWN/);
  assert.ok(none.lines.every((l) => l.status === 'no_goal'));
  assert.equal(none.next, null);
});

// ---------- Cole's take ----------
const take = (lines: ReturnType<typeof goalLines>, o: Partial<TakeInput> = {}): TakeInput => ({ monthLabel: 'November 2026', nextLabel: 'December 2026', dayOfMonth: 28, daysInMonth: 30, lines, showRate: 75, closeRate: 30, lastShowRate: 70, lastCloseRate: 32, ...o });
const act = (calls: number, deals: number, revenue: number) => ({ callsBooked: calls, callsHeld: 0, offersMade: 0, dealsClosed: deals, revenue, revenueUnknown: 0, cash: 0 });
const goals = { callsGoal: 15, dealsGoal: 2, revenueGoal: 6000, cashGoal: null };

test("Cole's take (rule line): ahead → raise next month's goal; on track; behind → find out why (from the rates)", () => {
  const ahead = goalLines(goals, act(24, 4, 12000), 28, 30);
  assert.ok(paceScore(ahead)! >= 1.25);
  assert.equal(coleTakeRule(take(ahead)), "Sales are good so far: we're well ahead of November's goals. Raise December's goal.");
  const onTrack = goalLines(goals, act(15, 2, 6000), 28, 30);
  assert.match(coleTakeRule(take(onTrack)), /^Sales are on track for November\. Keep December's goal/);
  const behind = goalLines(goals, act(6, 0, 0), 28, 30);
  assert.equal(coleTakeRule(take(behind, { showRate: 45 })), "Below goal for November. Let's find out why: the show rate is 45%, so no-shows are the first leak to check.");
  assert.match(coleTakeRule(take(behind, { closeRate: 10, lastCloseRate: 40 })), /close rate dropped to 10% \(from 40%\)/);
  assert.match(coleTakeRule(take(goalLines(null, act(3, 0, 0), 28, 30))), /^No goals set for November/);
  for (const t of [ahead, onTrack, behind]) assert.ok((coleTakeRule(take(t)).match(/[.!?](\s|$)/g) ?? []).length <= 2, 'one or two sentences');
});

test("Cole's take: a model answer is used only if short and its numbers are in the input", () => {
  const i = take(goalLines(goals, act(16, 2, 5500), 28, 30));
  assert.ok(takeOk('Sales are good: 16 calls booked against a goal of 15. Raise December.', i));
  assert.ok(!takeOk('Sales are good: 31 deals closed. Raise December.', i), 'an invented number is refused');
  assert.ok(!takeOk('x'.repeat(400), i), 'too long');
  assert.ok(!takeOk('', i));
});

test("Talk to Cole: the chat question carries the numbers, the goals and his take (not sent)", () => {
  const v = goalsView([goalRowOf(novRow() as any)!], novDeals(), TODAY, true);
  const q = coleChatAsk(v, 'Sales are good so far.', { showRate: 75, closeRate: 30 });
  assert.match(q, /^Cole, about November sales up to 11\/28: goals so far: calls booked 16 of 15 \(107%\), deals signed 2 of 2 \(100%\)/);
  assert.match(q, /show rate 75%; close rate 30%\. Your take: "Sales are good so far\." What should we do about it, and what should December's goal be\?$/);
});

// ---------- calls list ----------
test('calls: named by type from the meeting title / call type / stage; about from Fathom or Cole; Fathom link', () => {
  assert.equal(callName('Outbound Outreach Consultation (Ann Lee)'), 'Outbound consultation');
  assert.equal(callName('Jim Jones - Outbound Audit - 10:30 AM'), 'Outbound audit');
  assert.equal(callName('Follow Up: Acme'), 'Follow-up');
  assert.equal(callName('Ann + Alex', 'follow-up'), 'Follow-up');
  assert.equal(callName('Ann + Alex', 'other'), '');
  assert.equal(stageCallName('Audit Call Scheduled'), 'Outbound audit');
  assert.equal(stageCallName('Call Done'), 'Sales call');
  assert.equal(fathomAbout('## Meeting Purpose\n\n[Review Acme\'s outbound and Dulcy\'s offer](https://fathom.video/share/x?t=1)\n\n## Key Takeaways\n\n- They want 10 meetings'), "Review Acme's outbound and Dulcy's offer");
  assert.equal(fathomAbout('**Purpose**\n- Discuss pricing for the pilot\n'), 'Discuss pricing for the pilot');
  assert.equal(fathomAbout(''), '');

  const reviews: ColeReport[] = [
    { id: 7, kind: 'call_review', title: 'Call review: Ann Lee (Acme)', summary: 'Score 7/10 · Good call', link: 'https://fathom.video/calls/1', score: 7, created: '2026-11-11T20:00:00Z', verdict: 'Good discovery; the close was rushed.', meetingTitle: 'Outbound Audit (Ann Lee)', about: '' },
    { id: 9, kind: 'call_review', title: 'Call review: Ann Lee (Acme)', summary: 'Score 8/10 · x', link: 'https://fathom.video/calls/2', score: 8, created: '2026-11-19T20:00:00Z', verdict: 'v', meetingTitle: 'Ann / Alex', callType: 'follow-up', about: 'Walk through the proposal and the start date', meetingAt: '2026-11-18T18:00:00Z' },
  ];
  const d = { callDate: '2026-11-10', heldDate: '2026-11-10', airtableStage: 'Follow Up Call', stages: stagesOf({ airtableStage: 'Follow Up Call', callDate: '2026-11-10', heldDate: '2026-11-10', heldFlag: true, offerMade: false, dealClosed: false, cash: 0, feedbackStatus: '', agreement: null, clientPaid: false, onboarded: false }), reviews,
    feedback: [{ id: 'recF', status: 'New Date', rating: null, notes: '', link: '', newDate: '2026-12-02', created: '2026-11-20' }] };
  const calls = dealCalls(d, TODAY);
  assert.deepEqual(calls.map((c) => [c.day, c.name, c.status, c.about, c.aboutBy, c.linkKind]), [
    ['2026-12-02', 'Re-booked call', 'Booked', '', '', ''],
    ['2026-11-18', 'Follow-up', 'Recorded', 'Walk through the proposal and the start date', 'fathom', 'fathom'],
    ['2026-11-10', 'Outbound audit', 'Held', 'Good discovery; the close was rushed.', 'cole', 'fathom'],
  ]);
  assert.ok(calls.every((c) => c.name !== 'Call held'));
  // No review: the stage names it, no invented summary.
  const plain = dealCalls({ ...d, reviews: [], feedback: [{ id: 'recG', status: 'Qualified', rating: 4, notes: 'Wants a pilot', link: 'https://fathom.video/share/abc', newDate: '', created: '2026-11-11' }] }, TODAY);
  assert.deepEqual(plain.map((c) => [c.name, c.status, c.about, c.link]), [['Follow-up', 'Held', '', 'https://fathom.video/share/abc']]);
});

// ---------- data to fix: one agent task per agent part ----------
test('data to fix: each note gets the right agent task(s); Alex gets no button; nothing direct', () => {
  const two = noteActions({ problem: 'Paid in Xero, "not paid" in Airtable', data: 'MJJ', fix: "Ledger: tick Initial Payment Received on the client record. Riley: make the n8n flow match this payer.", why: 'w', owner: 'Ledger' });
  assert.deepEqual(two.map((a) => [a.agent, a.title]), [['Ledger', 'Sales data: Paid in Xero, "not paid" in Airtable (Ledger\'s part)'], ['Riley', 'Sales data: Paid in Xero, "not paid" in Airtable (Riley\'s part)']]);
  assert.match(two[0].detail, /^Data: MJJ\nYour part: tick Initial Payment Received on the client record\.\nWhy: w\nApproval rules apply/);
  const atlas = noteActions({ problem: 'One deal, several agreement records', data: 'Ann: 3 records', fix: 'Atlas: void the old ones or mark them Test Only in Dulcy Sign / New Client Intake (nothing goes to the client).', why: 'w', owner: 'Atlas' });
  assert.deepEqual(atlas.map((a) => a.agent), ['Atlas']);
  assert.match(atlas[0].detail, /wait for Alex's ✅/);
  const cole = noteActions({ problem: 'Contracts sent 90+ days ago, still open', data: 'x', fix: 'Cole: mark the deal Lost in Close, or Alex voids the agreement.', why: 'w', owner: 'Cole' });
  assert.deepEqual(cole.map((a) => [a.agent, a.title]), [['Cole', 'Sales data: Contracts sent 90+ days ago, still open']]);
  assert.deepEqual(noteActions({ problem: 'p', data: 'd', fix: 'Alex: sign it.', why: 'w', owner: 'Alex' }), []);
});

// ---------- the API and the daily cache ----------
let db: Db; let server: http.Server; let port: number; let webDir: string;
let goalRecords: ReturnType<typeof R>[]; let writes: unknown[]; let asked: number; let modelAnswer: string | Error;
const at = {
  async list(table: string) { return table === GOALS_T ? goalRecords.map((r) => ({ ...r, fields: { ...r.fields } })) : []; },
  async get() { return null; },
  async create(...a: unknown[]) { writes.push(a); return 'recNEW00000000001'; },
  async update(...a: unknown[]) { writes.push(a); },
};
const model = async () => { asked++; if (modelAnswer instanceof Error) throw modelAnswer; return modelAnswer; };
function cfg(): Config {
  return { ...loadConfig({ ENGINE_SECRET: 'x'.repeat(40), DATABASE_URL: url ?? 'postgres://x', HQ_SESSION_SECRET: 's'.repeat(40), HQ_HOST: 'hq.test.local' } as NodeJS.ProcessEnv), airtableApiKey: undefined, anthropicApiKey: undefined };
}
function call(p: string, cookie?: string): Promise<{ status: number; body: any; text: string }> {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port, method: 'GET', path: p, headers: { host: `127.0.0.1:${port}`, ...(cookie ? { cookie } : {}) } }, (res) => {
      const chunks: Buffer[] = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => { const text = Buffer.concat(chunks).toString('utf8'); let body: any = null; try { body = JSON.parse(text); } catch { /* */ } resolve({ status: res.statusCode ?? 0, body, text }); });
    });
    req.on('error', reject); req.end();
  });
}
function login(email: string, password: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify({ email, password });
    const req = http.request({ host: '127.0.0.1', port, method: 'POST', path: '/hq/api/auth/login', headers: { host: `127.0.0.1:${port}`, origin: `https://127.0.0.1:${port}`, 'content-type': 'application/json' } }, (res) => {
      res.resume();
      res.on('end', () => resolve(([] as string[]).concat(res.headers['set-cookie'] ?? []).map((c) => c.split(';')[0]).find((c) => c.startsWith('__Host-hq_session=')) ?? ''));
    });
    req.on('error', reject); req.write(data); req.end();
  });
}
before(async () => {
  webDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hqsales5-'));
  fs.writeFileSync(path.join(webDir, 'index.html'), '<!doctype html><title>Dulcy HQ</title>');
  if (skip) return;
  db = createPool(url!); await migrate(db);
  server = createServer(db, cfg(), { at: at as any, webDir, coleTakeModel: model });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', () => r()));
  port = (server.address() as AddressInfo).port;
});
after(async () => { if (!skip) { server.close(); await db.end(); } fs.rmSync(webDir, { recursive: true, force: true }); });
beforeEach(async () => {
  goalRecords = [novRow(), octRow()]; writes = []; asked = 0; modelAnswer = 'Sales are on track: 2 deals signed. Keep pushing.';
  _resetSalesCache(); _resetGoalsCache();
  if (skip) return;
  await db.query('TRUNCATE hq_users, hq_sessions, hq_login_attempts RESTART IDENTITY CASCADE');
  await db.query(`DELETE FROM hq_sales_settings WHERE key='cole_take'`).catch(() => undefined);
  await upsertUser(db, 'alex@dulcy.io', 'owner', 'correct horse battery staple', 'Alex');
});

test('goals API: owner gets goals, how they were set and Cole\'s take; members 403; nothing written to Airtable', { skip }, async (t) => {
  t.mock.timers.enable({ apis: ['Date'], now: Date.parse('2026-11-28T17:00:00Z') });
  await upsertUser(db, 'josh@dulcy.io', 'member', 'josh long password 1', 'Josh');
  const josh = await login('josh@dulcy.io', 'josh long password 1');
  assert.equal((await call('/hq/api/sales/goals', josh)).status, 403);
  assert.equal((await call('/hq/api/sales/goals')).status, 401);
  const alex = await login('alex@dulcy.io', 'correct horse battery staple');
  const r = await call('/hq/api/sales/goals', alex);
  assert.equal(r.status, 200, r.text);
  assert.equal(r.body.source.kind, 'airtable');
  assert.deepEqual(r.body.goals, { calls: 15, deals: 2, revenue: 6000, cash: 4000 });
  assert.equal(r.body.take.by, 'cole');
  assert.equal(r.body.take.text, 'Sales are on track: 2 deals signed. Keep pushing.');
  assert.match(r.body.ask, /^Cole, about November sales up to 11\/28/);
  // Cached for the day: the same numbers do not ask again.
  await call('/hq/api/sales/goals', alex);
  assert.equal(asked, 1);
  assert.deepEqual(writes, [], 'nothing written to Airtable');
});

test("Cole's take: the model fails or invents a number → the rule line; at most 4 asks a day; no model → rule line", { skip }, async () => {
  const i = take(goalLines(goals, act(16, 2, 5500), 28, 30));
  modelAnswer = new Error('Claude is down');
  const a = await coleTake(db, model, i, TODAY);
  assert.deepEqual([a.by, a.text], ['rule', coleTakeRule(i)]);
  modelAnswer = 'We closed 31 deals.';
  assert.equal((await coleTake(db, model, i, TODAY)).by, 'rule', 'invented number refused');
  modelAnswer = 'On track: 16 calls against 15.';
  assert.equal((await coleTake(db, model, i, TODAY)).by, 'cole');
  assert.equal((await coleTake(db, model, i, TODAY)).by, 'cole', 'cached');
  assert.equal(asked, 3);
  const j = take(goalLines(goals, act(17, 2, 5500), 28, 30));
  modelAnswer = 'On track: 17 calls against 15.';
  assert.equal((await coleTake(db, model, j, TODAY)).by, 'cole', 'numbers changed: asked again (4th)');
  const k = take(goalLines(goals, act(18, 2, 5500), 28, 30));
  assert.equal((await coleTake(db, model, k, TODAY)).by, 'rule', 'the 5th ask in a day is refused');
  assert.equal(asked, 4);
  modelAnswer = 'Sales are on track. Keep going.';
  assert.equal((await coleTake(db, model, k, '2026-11-29')).by, 'cole', 'a new day asks again');
  assert.equal((await coleTake(db, null, k, TODAY)).by, 'rule', 'no key: the rule line');
});

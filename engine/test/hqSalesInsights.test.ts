// HQ Sales, Batch 4a: period comparisons, capacity math (Closers.io), the Close reader and the hottest
// deals ranking (fake Close), Xero as a paid check, one current agreement per deal, Cole's next step,
// the contract draft (never sends: one Contracts row, never Action / Status / Review Status), and the
// routes (owner only: members get 403 and no money). No real service is called.
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
import { upsertUser } from '../src/hq/auth.js';
import { WORKSPACES_T } from '../src/hq/campaigns.js';
import {
  CF, CONTRACTS_T, FEEDBACK_T, IF, INTAKE_T, INVOICES_T, SALES_T, SF, WF, _resetSalesCache, agreementRoles, buildDeals, coleNext, nyDay, salesNotes, stagesOf, xeroMatches,
  type Agreement, type Deal, type SalesSource, type StageFacts,
} from '../src/hq/sales.js';
import {
  _resetInsightCaches, capacityMath, comparePeriods, countSlots, metricDay, periodRanges, rankHottest, readClose, saidYes, touchesPerClose, xeroRows, CAPACITY_DEFAULTS, cleanSettings,
  type CloseSnapshot, type SalesDeps,
} from '../src/hq/salesInsights.js';
import { createCloseClient, type CloseActivity, type CloseOpportunity } from '../src/providers/close.js';
import { NEVER_WRITE, DRAFT_F, contractFields, prefill, validateDraft } from '../src/hq/contracts.js';

const url = process.env.TEST_DATABASE_URL;
const skip = !url ? 'TEST_DATABASE_URL not set' : false;
const PW = 'correct horse battery staple';
const NOW = Date.parse('2026-11-26T15:00:00.000Z');
const TODAY = '2026-11-26';
const day = (offset: number) => nyDay(Date.parse(`${TODAY}T12:00:00Z`) + offset * 86_400_000);
const iso = (offset: number) => new Date(Date.parse(`${TODAY}T15:00:00Z`) + offset * 86_400_000).toISOString();

const facts = (o: Partial<StageFacts> = {}): StageFacts => ({ airtableStage: 'Audit Call Scheduled', callDate: day(3), heldDate: '', heldFlag: false, offerMade: false, dealClosed: false, cash: 0, feedbackStatus: '', agreement: null, clientPaid: false, onboarded: false, ...o });
const agr = (state: string, o: Partial<Agreement> = {}): Agreement => ({ id: 'recI0000000000001', table: 'intake', tool: 'Dulcy Sign', title: 'A', company: 'Acme', email: 'a@acme.com', signer: 'Ann Lee', state: state as any, review: '', created: iso(-10), sentAt: iso(-5), viewedAt: '', signedAt: '', clientSignedAt: '', forwardedAt: '', url: '', reviewDoc: '', closeLead: '', wsIds: [], intakeIds: [], contractIds: [], error: '', test: false, monthly: 2000, perCall: null, type: '', currency: 'USD', ...o });
let seq = 0;
function mk(o: Partial<Deal> & { f?: Partial<StageFacts> } = {}): Deal {
  const id = `recS${String(++seq).padStart(13, '0')}`;
  const stages = stagesOf(facts({ callDate: o.callDate ?? day(3), ...o.f }));
  const { f: _f, ...rest } = o;
  return {
    id, salesRec: id, name: 'Ann Lee', company: 'acme.com', email: 'a@acme.com', source: '', rep: '', campaign: '', airtableStage: o.f?.airtableStage ?? 'Audit Call Scheduled', lossReason: '', notes: '',
    callDate: day(3), heldDate: '', bookedAt: '', startDay: o.callDate ?? day(3), stages, stage: 'booked', lost: false, inactiveClient: false, agreements: [], agreement: o.f?.agreement ?? null, signedDay: '',
    client: null, clientMatch: null, paidKnown: false, paidVia: '', onboardingStarted: false, feedback: [], reviews: [], prep: null, emailRecs: [], needs: [], closeUrl: '',
    paidDay: '', closeLead: '', agreementRoles: [], money: { monthly: null, perCall: null, forecast: null, offer: null, cash: null, currency: 'USD', paidTotal: null }, ...rest,
  };
}
const money = (monthly: number) => ({ monthly, perCall: null, forecast: null, offer: null, cash: null, currency: 'USD', paidTotal: null });

// ---------- periods ----------
test('periods: this month vs last, the half-year, this year vs last year', () => {
  const [m, h, y] = periodRanges(TODAY);
  assert.deepEqual([m.now, m.prev], [{ from: '2026-11-01', to: TODAY, label: 'November so far' }, { from: '2026-10-01', to: '2026-10-31', label: 'October' }]);
  assert.deepEqual([h.title, h.now.from, h.prev.from, h.prev.to], ['Second half vs first half', '2026-07-01', '2026-01-01', '2026-06-30']);
  assert.deepEqual([y.now.label, y.prev.from, y.prev.to], ['2026 so far', '2025-01-01', '2025-12-31']);
  const [m1, h1] = periodRanges('2026-01-05');
  assert.deepEqual([m1.prev.from, m1.prev.to], ['2025-12-01', '2025-12-31'], 'January compares with December of last year');
  assert.deepEqual([h1.title, h1.prev.from, h1.prev.to], ['First half vs second half', '2025-07-01', '2025-12-31']);
});

test('periods: counts per metric with up/down deltas, money for the owner only, one conclusion line', () => {
  const won = { airtableStage: 'Won', heldFlag: true, agreement: agr('signed', { sentAt: '2026-11-05T15:00:00Z', signedAt: '2026-11-10T15:00:00Z' }), clientPaid: true };
  const deals = [
    mk({ callDate: '2026-11-03', heldDate: '2026-11-03', f: won, signedDay: '2026-11-10', paidDay: '2026-11-12', money: money(2000) }),
    mk({ callDate: '2026-10-20', heldDate: '2026-10-20', f: { airtableStage: 'Call Done', heldFlag: true } }),
    mk({ callDate: '2026-10-02', f: { airtableStage: 'No Show' } }),
    mk({ callDate: '2026-11-20', heldDate: '2026-11-20', f: { airtableStage: 'Follow Up Call' } }),
    mk({ callDate: '2025-12-01', f: { ...won, agreement: agr('signed', { sentAt: '2025-12-05T15:00:00Z' }) }, signedDay: '2025-12-10', money: money(1500) }),
  ];
  assert.equal(metricDay(deals[0], 'sent'), '2026-11-05');
  assert.equal(metricDay(deals[0], 'paid'), '2026-11-12');
  assert.equal(metricDay(deals[1], 'signed'), '');
  const { periods, conclusion } = comparePeriods(deals, TODAY, true);
  const rows = (k: string) => Object.fromEntries(periods.find((p) => p.key === k)!.rows.map((r) => [r.key, [r.now, r.prev, r.dir]]));
  assert.deepEqual(rows('month'), { booked: [2, 2, 'same'], showed: [2, 1, 'up'], qualified: [2, 0, 'up'], sent: [1, 0, 'up'], signed: [1, 0, 'up'], paid: [1, 0, 'up'] });
  assert.deepEqual(rows('year').signed, [1, 1, 'same']);
  assert.deepEqual([periods[0].money?.now, periods[0].money?.prev, periods[0].money?.dir], [2000, 0, 'up']);
  assert.deepEqual([periods[2].money?.now, periods[2].money?.prev], [2000, 1500]);
  assert.equal(conclusion, 'November so far vs October: Calls the same (2), showed up 1 (2 vs 1), signed up 1 (1 vs 0).');
  assert.ok(comparePeriods(deals, TODAY, false).periods.every((p) => !('money' in p)), 'no money key for anyone but the owner');
});

// ---------- capacity ----------
test('capacity: open slots, % booked, rates, days to close, at capacity, and the limit', () => {
  const t0 = Date.parse('2026-11-30T15:00:00Z');
  const at = (min: number) => new Date(t0 + min * 60_000).toISOString();
  assert.equal(countSlots([at(0), at(5), at(10), at(30), at(60), at(60), 'junk'], 30), 3, '5-minute steps collapse into whole 30-minute meetings');
  assert.equal(countSlots([at(0), at(30), at(60)], 45), 2);
  assert.deepEqual(cleanSettings({ calendars: '2', slotMinutes: 5, slotsPerMonth: 'x' }), { calendars: 2, slotMinutes: 30, slotsPerMonth: null }, 'settings are checked, never trusted');
  const signed = { airtableStage: 'Won', heldFlag: true, agreement: agr('signed') };
  const past = [
    mk({ callDate: day(-20), f: signed, signedDay: day(-13) }),
    mk({ callDate: day(-30), f: { airtableStage: 'Call Done', heldFlag: true } }),
    mk({ callDate: day(-10), f: { airtableStage: 'Follow Up Call' } }),
    mk({ callDate: day(-5), f: { airtableStage: 'No Show' } }),
  ];
  const future = [1, 2, 3, 4, 5].map((k) => mk({ callDate: day(k) }));
  const touches = { avg: 6.5, n: 2, source: 'close' as const, note: '' };
  const c = capacityMath([...past, ...future], TODAY, { n: 20, source: 'calendar', note: '' }, CAPACITY_DEFAULTS, touches);
  assert.deepEqual([c.calendars, c.bookedNext30, c.availability, c.booked?.text, c.bookedPct], [1, 5, 25, '5 of 25 slots booked', 20]);
  assert.deepEqual([c.showRate.text, c.qualifiedRate.text, c.closeRate.text], ['3 of 4 showed', '2 of 3 qualified', '1 of 3 signed']);
  assert.deepEqual([c.daysToClose.median, c.daysToClose.n], [7, 1]);
  assert.deepEqual([c.atCapacity?.calls, c.atCapacity?.shows, c.atCapacity?.closes], [25, 19, 6], '25 calls × 3/4 show × 1/3 close');
  assert.equal(c.limit.key, 'volume');
  assert.match(c.limit.text, /^Volume is the limit: 20 of 25 slots/);
  assert.equal(c.touchesPerClose.avg, 6.5);
  assert.equal(capacityMath([...past, ...future], TODAY, { n: 1, source: 'calendar', note: '' }, CAPACITY_DEFAULTS, touches).limit.key, 'calendar', '5 of 6 booked = add time or a closer');
  const noShows = [1, 2, 3, 4].map((k) => mk({ callDate: day(-k), f: { airtableStage: 'No Show' } }));
  assert.equal(capacityMath([...noShows, past[0]], TODAY, { n: 30, source: 'calendar', note: '' }, CAPACITY_DEFAULTS, touches).limit.key, 'show', '1 of 5 showed: under 60%');
  const unknown = capacityMath(past, TODAY, { n: null, source: 'none', note: '' }, CAPACITY_DEFAULTS, touches);
  assert.deepEqual([unknown.availability, unknown.limit.key, unknown.atCapacity], [null, 'unknown', null]);
  assert.equal(capacityMath(future, TODAY, { n: 40, source: 'setting', note: '' }, CAPACITY_DEFAULTS, touches).availability, 40, 'a setting is the total slots a month');
});

// ---------- Close ----------
const opp = (o: Partial<Record<string, unknown>>) => ({ id: 'oppo_1', lead_id: 'lead_1', lead_name: 'Lead', status_label: 'Proposal', status_type: 'active', value: 150000, value_period: 'monthly', confidence: 50, date_created: iso(-20), date_updated: iso(-1), date_won: null, contact_name: '', ...o });
function fakeClose(calls: { url: string; auth: string; method: string }[]) {
  const opps = [
    opp({ id: 'oppo_bp', lead_id: 'lead_bigpixel', lead_name: 'Big Pixel', contact_name: 'Alex Solomon', status_label: 'Contract', confidence: 80 }),
    opp({ id: 'oppo_nw', lead_id: 'lead_nick', lead_name: 'Wendt Co', contact_name: 'Nick Wendt', status_label: 'Follow up', confidence: 0 }),
    opp({ id: 'oppo_cold', lead_id: 'lead_cold', lead_name: 'Cold Co', status_label: 'Discovery', confidence: 0, date_updated: iso(-50) }),
    opp({ id: 'oppo_lost', lead_id: 'lead_lost', lead_name: 'Lost Co', status_type: 'lost' }),
    opp({ id: 'oppo_won', lead_id: 'lead_won', lead_name: 'Won Co', status_type: 'won', date_won: iso(-40) }),
  ];
  const acts: Record<string, unknown[]> = {
    lead_bigpixel: [
      { _type: 'Email', id: 'a1', direction: 'outgoing', date_created: iso(-4), subject: 'Next steps', body_preview: 'Here is the plan we discussed.' },
      { _type: 'Email', id: 'a2', direction: 'incoming', date_created: iso(-2), subject: 'Re: Next steps', body_preview: "Yes, let's do it. Send over the agreement.\nOn Mon, Alex wrote:\n> Here is the plan" },
    ],
    lead_nick: [
      { _type: 'Call', id: 'c1', direction: 'outbound', date_created: iso(-6), disposition: 'answered', duration: 900, note: '' },
      { _type: 'Note', id: 'n1', date_created: iso(-5), note: 'Nick gave a verbal yes; waiting on his partner to sign.' },
    ],
    lead_cold: [{ _type: 'Email', id: 'x1', direction: 'outgoing', date_created: iso(-45), subject: 'Checking in', body_preview: 'Any thoughts?' }],
    lead_won: [
      { _type: 'Email', id: 'w1', direction: 'outgoing', date_created: iso(-60) }, { _type: 'Email', id: 'w2', direction: 'incoming', date_created: iso(-59) },
      { _type: 'Call', id: 'w3', date_created: iso(-55) }, { _type: 'Email', id: 'w4', direction: 'outgoing', date_created: iso(-50) },
      { _type: 'Meeting', id: 'w5', date_created: iso(-45), title: 'Close call' }, { _type: 'Email', id: 'w6', direction: 'outgoing', date_created: iso(-30) },
    ],
  };
  return (async (u: string | URL, init?: RequestInit) => {
    const s = String(u);
    calls.push({ url: s, auth: String((init?.headers as any)?.authorization ?? ''), method: String(init?.method ?? 'GET') });
    const q = new URL(s);
    if (q.pathname.endsWith('/opportunity/')) return new Response(JSON.stringify({ data: opps, has_more: false }), { status: 200 });
    if (q.pathname.endsWith('/activity/')) return new Response(JSON.stringify({ data: acts[q.searchParams.get('lead_id') ?? ''] ?? [], has_more: false }), { status: 200 });
    return new Response('{}', { status: 404 });
  }) as typeof fetch;
}

test('close: read only, HTTP Basic with the key as username; no key = not connected', async () => {
  assert.equal(createCloseClient(undefined), null);
  const calls: { url: string; auth: string; method: string }[] = [];
  const c = createCloseClient('api_test_key', fakeClose(calls))!;
  const snap = await readClose(c, NOW);
  assert.ok(calls.length >= 1 && calls.every((x) => x.method === 'GET'), 'only GETs');
  assert.ok(calls.every((x) => x.auth === `Basic ${Buffer.from('api_test_key:').toString('base64')}`));
  assert.ok(calls[0].url.startsWith('https://api.close.com/api/v1/opportunity/?'));
  assert.equal(snap.opps.find((o) => o.id === 'oppo_bp')!.value, 1500, 'cents → dollars');
  assert.deepEqual(Object.keys(snap.acts).sort(), ['lead_bigpixel', 'lead_cold', 'lead_nick'], 'activities only for open opportunities');
  assert.deepEqual(snap.won.map((w) => w.touches), [4], 'touches before the win: 3 emails we sent + 1 call + 1 meeting... up to the win day');
  assert.deepEqual(touchesPerClose(snap), { avg: 4, n: 1, source: 'close', note: '4 touches per close (average of the last 1 won in Close: emails we sent, calls, meetings, texts)' });
  assert.equal(touchesPerClose(null).source, 'none');
});

test('close: hottest deals — said yes and waiting first, with reasons and the next step; cold and lost left out', async () => {
  assert.ok(saidYes("Yes, let's do it. Send over the agreement."));
  assert.ok(saidYes('Sounds good, send me the contract'));
  assert.ok(!saidYes("Thanks, but we're not ready yet"));
  assert.ok(!saidYes('Hi Alex\nOn Mon, Alex wrote:\n> yes we can move forward'), 'quoted history does not count');
  const snap = await readClose(createCloseClient('k', fakeClose([]))!, NOW);
  const bigpx = mk({ name: 'Alex Solomon', company: 'bigpxl.com', callDate: day(-14), f: { airtableStage: 'Contract Sent', agreement: agr('viewed', { company: 'BigPxl', viewedAt: iso(-9), sentAt: iso(-11) }) } });
  bigpx.agreement = agr('viewed', { company: 'Big Pixel', viewedAt: iso(-9), sentAt: iso(-11) });
  bigpx.closeLead = 'lead_bigpixel';
  const hq = mk({ name: 'Tia Long', company: 'tutor.ai', callDate: day(-3), heldDate: day(-3), f: { airtableStage: 'Call Done', heldFlag: true } });
  hq.reviews = [{ id: 9, kind: 'call_review', title: 'Call review: Tia Long', summary: '', link: '', score: 8, created: iso(-2), temperature: 'hot', nextStep: 'Send proposal Friday', verdict: 'Good' }];
  const hot = rankHottest([bigpx, hq], snap, TODAY);
  assert.deepEqual(hot.map((h) => h.name), ['Alex Solomon', 'Nick Wendt', 'Tia Long']);
  assert.deepEqual(hot[0].reasons.slice(0, 3), ['Said yes Nov 24', 'Waiting on us since Nov 24', 'Opened the contract Nov 17']);
  assert.equal(hot[0].source, 'both');
  assert.equal(hot[0].dealId, bigpx.id);
  assert.match(hot[0].next, /^Said yes and waiting on us: draft the contract today/);
  assert.equal(hot[0].lastTouch?.snippet, "Re: Next steps: Yes, let's do it. Send over the agreement.", 'the prospect\'s own words, quote cut off');
  assert.equal(hot[0].value, 1500);
  assert.ok(hot[1].reasons.includes('Said yes Nov 21'), 'a note "verbal yes" counts');
  assert.deepEqual([hot[2].source, hot[2].reasons[0]], ['hq', 'Cole: hot call (8/10)'], 'without Close: HQ\'s own data (Cole\'s review)');
  assert.match(hot[2].next, /^Hot call: draft the contract now \(agreed: Send proposal Friday\)\.$/);
  assert.ok(!hot.some((h) => /Cold|Lost/.test(h.company)));
  assert.deepEqual(rankHottest([bigpx, hq], null, TODAY).map((h) => [h.name, h.score]), [['Tia Long', 40], ['Alex Solomon', 35]], 'no Close key: HQ-only ranking still works (hot call 2 days ago vs contract opened 9 days ago)');
});

// ---------- Xero, agreements, onboarding, Cole ----------
const R = (id: string, fields: Record<string, unknown>, createdTime = iso(-30)) => ({ id, fields, createdTime });
function mjj(): SalesSource {
  return {
    readAt: iso(0),
    sales: [R('recSMJJ0000000001', { [SF.contact]: 'Chris Awad', [SF.email]: 'chris@mjjbrilliant.com', [SF.company]: 'Brilliant Jewelers', [SF.stage]: 'Call Done', [SF.callDate]: day(-55), [SF.held]: true })],
    intake: [
      R('recIMJJ0000000001', { [IF.company]: 'Brilliant Jewelers', [IF.first]: 'Chris', [IF.last]: 'Awad', [IF.email]: 'chris@mjjbrilliant.com', [IF.monthly]: 2000, [IF.status]: 'Completed', [IF.swSent]: iso(-52), [IF.swDone]: iso(-51), [IF.ws]: ['recWMJJ0000000001'] }),
      R('recIMJJ0000000002', { [IF.company]: 'Brilliant Jewelers', [IF.first]: 'Jason', [IF.last]: 'Y', [IF.email]: 'jason@mjjbrilliant.com', [IF.monthly]: 2000, [IF.status]: 'Sent', [IF.swSent]: iso(-60) }),
      R('recIMJJ0000000003', { [IF.company]: 'Brilliant Jewelers', [IF.email]: 'chris@mjjbrilliant.com', [IF.status]: 'Draft' }),
    ],
    contracts: [
      R('recCMJJ0000000001', { [CF.title]: 'Brilliant – Growth', [CF.company]: 'Brilliant Jewelers', [CF.signerEmail]: 'chris@mjjbrilliant.com', [CF.status]: 'completed', [CF.done]: iso(-51), [CF.intake]: ['recIMJJ0000000001'] }),
      R('recCMJJ0000000002', { [CF.title]: 'Brilliant – old', [CF.company]: 'Brilliant Jewelers', [CF.signerEmail]: 'chris@mjjbrilliant.com', [CF.status]: 'expired', [CF.sent]: iso(-70) }),
    ],
    feedback: [],
    ws: [R('recWMJJ0000000001', { [WF.name]: 'MJJ Brilliant', [WF.status]: 'Active', [WF.onboarding]: ['recOMJJ0000000001'] })],
    invoices: [],
  };
}

test('xero: a payment in Xero counts as paid; the onboarding form is not hidden by a missing tick; notes say what to fix at the source', () => {
  const rows = xeroRows(
    [{ Contact: { Name: 'Brilliant Jewelers' }, AmountPaid: 2000, FullyPaidOnDate: `/Date(${Date.parse(iso(-50))}+0000)/` }, { Contact: { Name: 'Nobody' }, AmountPaid: 0, DateString: iso(-3) }],
    [{ Type: 'RECEIVE', Contact: { Name: 'Chris Awad' }, Total: 2000, DateString: iso(-20) }, { Type: 'SPEND', Contact: { Name: 'AWS' }, Total: 50, DateString: iso(-1) }],
  );
  assert.deepEqual(rows.map((r) => [r.contact, r.kind, r.amount, r.day]), [['Brilliant Jewelers', 'invoice', 2000, day(-50)], ['Chris Awad', 'received', 2000, day(-20)]]);
  // Without Xero: signed, "not paid", form hidden before; now the linked onboarding record shows.
  const before = buildDeals(mjj(), { now: NOW, reports: [] })[0];
  assert.deepEqual([before.stages.signed, before.stages.paid, before.stages.onboarded], [true, false, true]);
  const deals = buildDeals(mjj(), { now: NOW, reports: [], xero: rows });
  assert.equal(deals.length, 1, 'one deal for MJJ');
  const d = deals[0];
  assert.deepEqual([d.stage, d.paidVia, d.paidDay], ['onboarded', 'Xero: Brilliant Jewelers invoice paid Oct 7', day(-50)]);
  assert.equal(xeroMatches(rows, { name: 'Chris Awad', company: '', client: null, agreements: [] }, '').length, 1, 'the signer\'s name matches a payment too');
  // One current agreement; the others folded with the reason. The never-sent SignWell draft is gone.
  assert.equal(d.agreements.length, 4, '4 records for one client: Chris\'s signed intake row, its Dulcy Sign copy, an expired one, Jason\'s unsigned one (same company)');
  assert.deepEqual(d.agreementRoles.map((r) => [r.primary, r.why]), [[true, 'Current agreement'], [false, 'Same agreement, second record (Dulcy Sign copy)'], [false, 'Expired or voided'], [false, 'Sent, never signed: replaced by the signed one']]);
  assert.equal(d.agreement?.id, 'recIMJJ0000000001', 'the current one is the signed one');
  const notes = salesNotes(deals, mjj(), TODAY);
  const paidNote = notes.find((n) => n.problem === 'Paid in Xero, "not paid" in Airtable')!;
  assert.match(paidNote.data, /Initial Payment Received unticked, no Client Invoices row/);
  assert.match(paidNote.fix, /Fanbasis Transaction Successful/);
  assert.ok(notes.some((n) => n.problem === 'Onboarding form submitted, checkbox unticked' && /2\.3 POSTCALL/.test(n.fix)));
  assert.ok(notes.some((n) => n.problem === 'One deal, several agreement records'));
  assert.ok(!notes.some((n) => n.problem === 'Two signing paths disagree'), 'SignWell is retired: no two-paths note');
});

test('agreements: a signed one wins; unsigned and drafts are explained', () => {
  const lead = agr('signed', { id: 'recA', signedAt: iso(-5) });
  const roles = agreementRoles([agr('sent', { id: 'recB', sentAt: iso(-30) }), lead, agr('draft', { id: 'recC', sentAt: '' }), agr('signed', { id: 'recD', signedAt: iso(-200), sentAt: iso(-210), created: iso(-220), table: 'contract' })], lead);
  assert.deepEqual(roles.map((r) => [r.id, r.why]), [['recA', 'Current agreement'], ['recB', 'Sent, never signed: replaced by the signed one'], ['recC', 'Draft, never sent'], ['recD', 'Older version']]);
});

test('cole: one line for the next step on each deal', () => {
  const at = (o: Partial<Deal> & { f?: Partial<StageFacts> }) => coleNext(mk(o), TODAY);
  assert.match(at({ callDate: day(-12), f: { agreement: agr('viewed', { viewedAt: iso(-3) }) }, agreement: agr('viewed', { viewedAt: iso(-3) }) }), /^They opened the contract Nov 23: call and ask what is left to decide\.$/);
  assert.match(at({ callDate: day(-12), f: { agreement: agr('sent', { sentAt: iso(-4) }) }, agreement: agr('sent', { sentAt: iso(-4) }) }), /^Contract sent 4 days ago, not opened/);
  assert.equal(at({ callDate: day(-2), f: { airtableStage: 'No Show' }, airtableStage: 'No Show' }), 'No-show: send two new times today.');
  assert.equal(at({ callDate: TODAY }), 'Call today: read the replies and the prep first.');
  assert.equal(at({ callDate: day(-30), f: { agreement: agr('signed') }, signedDay: day(-20) }), 'Signed Nov 6: Ledger confirms the first payment (Commas / Xero).');
  assert.equal(at({ lost: true }), '');
});

// ---------- the contract draft (pure) ----------
test('contract draft: checks the form; retainer / per call (an old "both" = per call) map to Dulcy Sign; never Action, Status or Review Status', () => {
  const bad = validateDraft({ dealType: 'both', monthly: 1500, signerEmail: 'nope' }, TODAY);
  assert.deepEqual(bad.errors, ['Per-call fee: needed for pay per call.', 'Start date: pick a day.', 'Signer name: who signs for the client.', 'Signer email: a valid email.', 'Company: the client\'s company or brand.']);
  const ok = validateDraft({ dealType: 'both', monthly: '1,500', perCall: 250, startDate: '2026-12-01', signerName: 'Raana', signerEmail: 'R@Human.com', company: 'Human Marketing', scope: 'Cold email', bogus: 'x' }, TODAY);
  assert.deepEqual(ok.errors, []);
  assert.deepEqual([ok.draft.monthly, ok.draft.perCall, ok.draft.signerEmail], [1500, 250, 'r@human.com']);
  assert.deepEqual(ok.missing, ['Client legal name', 'Client address', 'Agreed service', 'Contract term']);
  const deal = mk({ closeLead: 'lead_hm1', client: { id: 'recWHUMAN00000001', name: 'Human Marketing', status: 'Active', paid: true, formDone: true, onboardingLinked: true, start: '' } });
  const f = contractFields(ok.draft, { deal, by: 'Alex', today: TODAY, missing: ok.missing });
  assert.equal(f[DRAFT_F.type], 'PPC / PPL', 'both = PPC / PPL with the monthly fee as the tech fee (like Human Marketing: $1,500 + $250 a call)');
  assert.deepEqual([f[DRAFT_F.techFee], f[DRAFT_F.callFee], f[DRAFT_F.fee]], [1500, 250, undefined]);
  assert.deepEqual([f[DRAFT_F.start], f[DRAFT_F.billing], f[DRAFT_F.currency], f[DRAFT_F.test], f[DRAFT_F.closeLead], f[DRAFT_F.ws]], ['2026-12-01', 'Monthly', 'USD', false, 'lead_hm1', ['recWHUMAN00000001']]);
  assert.match(String(f[DRAFT_F.missing]), /Client legal name, Client address, Agreed service, Contract term/);
  for (const k of NEVER_WRITE) assert.ok(!(k in f), `never writes ${k}`);
  const r = contractFields(validateDraft({ dealType: 'retainer', monthly: 2000, perCall: 99, startDate: '2026-12-01', signerName: 'Chris', signerEmail: 'c@x.com', company: 'MJJ' }, TODAY).draft, { deal, by: 'Alex', today: TODAY, missing: [] });
  assert.deepEqual([r[DRAFT_F.type], r[DRAFT_F.fee], r[DRAFT_F.callFee], r[DRAFT_F.missing]], ['Monthly / Retainer', 2000, undefined, undefined]);
  assert.deepEqual([prefill(deal).dealType, prefill(deal).signerName, prefill(deal).startDate], ['retainer', 'Ann Lee', ''], 'prefill: only what HQ knows, no invented start date');
});

// ---------- the routes ----------
let db: Db; let server: http.Server; let port: number; let webDir: string;
let tables: Record<string, Record<string, Record<string, unknown>>>;
let writes: unknown[][]; let reads: string[]; let closeCalls: { url: string; auth: string; method: string }[];
const deps: SalesDeps = {};
const at = {
  async list(table: string, formula: string) { reads.push(`${table} ${formula}`); return Object.entries(tables[table] ?? {}).map(([id, fields]) => ({ id, fields: { ...fields }, createdTime: iso(-30) })); },
  async get() { return null; },
  async create(...a: unknown[]) { writes.push(a); return 'recCNEW0000000001'; },
  async update(...a: unknown[]) { writes.push(a); },
};
function cfg(): Config {
  return { ...loadConfig({ ENGINE_SECRET: 'x'.repeat(40), DATABASE_URL: url ?? 'postgres://x', HQ_SESSION_SECRET: 's'.repeat(40), HQ_HOST: 'hq.test.local' } as NodeJS.ProcessEnv), airtableApiKey: undefined, anthropicApiKey: undefined };
}
function call(p: string, cookie?: string, method = 'GET', body?: unknown): Promise<{ status: number; body: any; text: string }> {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port, method, path: p, headers: { host: `127.0.0.1:${port}`, ...(method !== 'GET' ? { origin: `https://127.0.0.1:${port}`, 'content-type': 'application/json' } : {}), ...(cookie ? { cookie } : {}) } }, (res) => {
      const chunks: Buffer[] = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => { const text = Buffer.concat(chunks).toString('utf8'); let b: any = null; try { b = JSON.parse(text); } catch { /* */ } resolve({ status: res.statusCode ?? 0, body: b, text }); });
    });
    req.on('error', reject); if (method !== 'GET') req.write(JSON.stringify(body ?? {})); req.end();
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
const asTables = (src: SalesSource) => {
  const t = (rows: { id: string; fields: Record<string, unknown> }[]) => Object.fromEntries(rows.map((r) => [r.id, r.fields]));
  return { [SALES_T]: t(src.sales), [INTAKE_T]: t(src.intake), [CONTRACTS_T]: t(src.contracts), [FEEDBACK_T]: t(src.feedback), [WORKSPACES_T]: t(src.ws), [INVOICES_T]: t(src.invoices) };
};
before(async () => {
  webDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hqsales4a-'));
  fs.writeFileSync(path.join(webDir, 'index.html'), '<!doctype html><title>Dulcy HQ</title>');
  if (skip) return;
  db = createPool(url!); await migrate(db);
  server = createServer(db, cfg(), { at: at as any, webDir, sales: deps });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', () => r()));
  port = (server.address() as AddressInfo).port;
});
after(async () => { if (!skip) { server.close(); await db.end(); } fs.rmSync(webDir, { recursive: true, force: true }); });
beforeEach(async () => {
  tables = asTables(mjj()); writes = []; reads = []; closeCalls = []; _resetSalesCache(); _resetInsightCaches();
  deps.close = createCloseClient('k', fakeClose(closeCalls)); deps.xero = undefined; deps.calendar = undefined;
  if (skip) return;
  await db.query('TRUNCATE hq_users, hq_sessions, hq_login_attempts, hq_reports RESTART IDENTITY CASCADE');
  await db.query('DROP TABLE IF EXISTS hq_contract_drafts, hq_sales_settings');
  await upsertUser(db, 'alex@dulcy.io', 'owner', PW, 'Alex');
});

test('routes: members get 403 on every new sales route; nothing read, nothing leaks', { skip }, async () => {
  await upsertUser(db, 'josh@dulcy.io', 'member', 'josh long password 1', 'Josh');
  const josh = await login('josh@dulcy.io', 'josh long password 1');
  const routes: [string, string][] = [['GET', '/hq/api/sales/insights'], ['POST', '/hq/api/sales/settings'], ['GET', '/hq/api/sales/recSMJJ0000000001/contract'], ['POST', '/hq/api/sales/recSMJJ0000000001/contract'], ['POST', '/hq/api/sales/recSMJJ0000000001/contract/create'], ['GET', '/hq/api/sales/recSMJJ0000000001/contract/close']];
  for (const [method, p] of routes) {
    const r = await call(p, josh, method, { dealType: 'retainer', monthly: 2000, draftId: 1 });
    assert.equal(r.status, 403, `${method} ${p}`);
    assert.ok(!/2000|\$|Brilliant|Chris|Big Pixel/.test(r.text), `no money or names: ${r.text}`);
  }
  assert.equal((await call('/hq/api/sales/insights')).status, 401);
  assert.deepEqual([reads, writes, closeCalls], [[], [], []], 'a member never triggers a read of Airtable or Close, and nothing is written');
});

test('routes: insights for the owner (periods, capacity, hottest from Close); without Close: "Connect Close", the rest works', { skip }, async (t) => {
  t.mock.timers.enable({ apis: ['Date'], now: NOW });
  const cookie = await login('alex@dulcy.io', PW);
  deps.calendar = async () => ({ starts: [iso(1), new Date(Date.parse(iso(1)) + 30 * 60_000).toISOString(), iso(2)], timezone: 'America/New_York' });
  const r = await call('/hq/api/sales/insights', cookie);
  assert.equal(r.status, 200, r.text);
  assert.deepEqual(r.body.periods.map((p: any) => p.key), ['month', 'half', 'year']);
  assert.ok(r.body.periods[0].money, 'the owner sees money');
  assert.match(r.body.conclusion, /^November so far vs October: /);
  assert.deepEqual([r.body.capacity.open.n, r.body.capacity.open.source, r.body.capacity.calendars], [3, 'calendar', 1]);
  assert.deepEqual(r.body.hottest.map((h: any) => h.name).slice(0, 2), ['Alex Solomon', 'Nick Wendt']);
  assert.deepEqual([r.body.close.connected, r.body.close.ok, r.body.close.open], [true, true, 3]);
  assert.ok(closeCalls.every((c) => c.method === 'GET'));
  const n = closeCalls.length;
  await call('/hq/api/sales/insights', cookie);
  assert.equal(closeCalls.length, n, 'Close is cached for 5 minutes');
  // No Close key, no calendar: say so; periods and capacity still answer (with the setting).
  deps.close = null; deps.calendar = undefined; _resetInsightCaches();
  assert.equal((await call('/hq/api/sales/settings', cookie, 'POST', { slotsPerMonth: 40, calendars: 1, slotMinutes: 45 })).body.settings.slotsPerMonth, 40);
  const r2 = await call('/hq/api/sales/insights', cookie);
  assert.equal(r2.status, 200);
  assert.deepEqual([r2.body.close.connected, r2.body.capacity.open.source, r2.body.capacity.availability, r2.body.settings.slotMinutes], [false, 'setting', 40, 45]);
  assert.equal(r2.body.capacity.touchesPerClose.source, 'none');
  assert.deepEqual(writes, [], 'insights write nothing to Airtable');
});

test('routes: contract draft — prefill, save (Postgres), create ONE Contracts row, a second create makes nothing', { skip }, async (t) => {
  t.mock.timers.enable({ apis: ['Date'], now: NOW });
  const cookie = await login('alex@dulcy.io', PW);
  const g = await call('/hq/api/sales/recSMJJ0000000001/contract', cookie);
  assert.equal(g.status, 200, g.text);
  assert.deepEqual([g.body.draft.signerName, g.body.draft.signerEmail, g.body.draft.company, g.body.draft.dealType, g.body.draft.monthly, g.body.saved], ['Chris Awad', 'chris@mjjbrilliant.com', 'MJJ Brilliant', 'retainer', 2000, null]);
  assert.equal((await call('/hq/api/sales/recNOPE0000000001/contract', cookie)).status, 404);
  const bad = await call('/hq/api/sales/recSMJJ0000000001/contract', cookie, 'POST', { dealType: 'retainer' });
  assert.equal(bad.status, 400);
  assert.match(bad.body.error, /Monthly fee/);
  const form = { ...g.body.draft, startDate: '2026-12-05', legalName: 'MJJ Inc.' };
  const s = await call('/hq/api/sales/recSMJJ0000000001/contract', cookie, 'POST', form);
  assert.equal(s.status, 200, s.text);
  assert.equal(s.body.saved.status, 'saved');
  assert.deepEqual(writes, [], 'saving writes nothing to Airtable');
  const again = await call('/hq/api/sales/recSMJJ0000000001/contract', cookie, 'POST', { ...form, monthly: 2100 });
  assert.equal(again.body.saved.id, s.body.saved.id, 'saving again updates the same draft');
  const c = await call('/hq/api/sales/recSMJJ0000000001/contract/create', cookie, 'POST', { draftId: s.body.saved.id });
  assert.equal(c.status, 200, c.text);
  assert.equal(c.body.saved.status, 'created');
  assert.equal(c.body.saved.contractsRec, 'recCNEW0000000001');
  assert.match(c.body.message, /Nothing is sent until you approve it/);
  assert.equal(writes.length, 1);
  const [table, fields] = writes[0] as [string, Record<string, unknown>];
  assert.equal(table, CONTRACTS_T);
  assert.deepEqual([fields[DRAFT_F.type], fields[DRAFT_F.fee], fields[DRAFT_F.legalName], fields[DRAFT_F.ws], fields[DRAFT_F.intake]], ['Monthly / Retainer', 2100, 'MJJ Inc.', ['recWMJJ0000000001'], ['recIMJJ0000000001']]);
  for (const k of NEVER_WRITE) assert.ok(!(k in fields), `never writes ${k}`);
  const twice = await call('/hq/api/sales/recSMJJ0000000001/contract/create', cookie, 'POST', { draftId: s.body.saved.id });
  assert.deepEqual([twice.status, twice.body.already, writes.length], [200, true, 1], 'never a second Contracts row');
  assert.equal((await call('/hq/api/sales/recSMJJ0000000001/contract/create', cookie, 'POST', { draftId: 999 })).status, 404);
  assert.equal((await call('/hq/api/sales/recSMJJ0000000001/contract', cookie)).body.saved.status, 'created', 'the form shows the created draft');
});

test('routes (round 5): Pull from Close reads the lead (GETs only, nothing saved); an old "both" draft opens as pay per call', { skip }, async (t) => {
  t.mock.timers.enable({ apis: ['Date'], now: NOW });
  const calls: { url: string; method: string }[] = [];
  deps.close = createCloseClient('k', (async (u: string | URL, init?: RequestInit) => {
    const q = new URL(String(u)); calls.push({ url: String(u), method: String(init?.method ?? 'GET') });
    if (q.pathname.endsWith('/lead/')) return new Response(JSON.stringify({ data: [{ id: 'lead_mjj1', display_name: 'Brilliant Jewelers', contacts: [{ emails: [{ email: 'chris@mjjbrilliant.com' }] }] }] }), { status: 200 });
    if (q.pathname.endsWith('/lead/lead_mjj1/')) return new Response(JSON.stringify({
      id: 'lead_mjj1', display_name: 'Brilliant Jewelers', custom: { 'Legal Name': 'MJJ Brilliant Inc.' },
      contacts: [{ name: 'Chris Awad', emails: [{ email: 'chris@mjjbrilliant.com' }], phones: [{ phone: '+15550111' }] }],
      addresses: [{ address_1: '5 Gem Rd', city: 'Edison', state: 'NJ', zipcode: '08817' }],
      opportunities: [{ id: 'oppo_m1', lead_id: 'lead_mjj1', status_type: 'active', status_label: 'Contract', value: 200000, value_period: 'monthly', date_updated: iso(-1) }],
    }), { status: 200 });
    return new Response('{}', { status: 404 });
  }) as typeof fetch);
  const cookie = await login('alex@dulcy.io', PW);
  const g = await call('/hq/api/sales/recSMJJ0000000001/contract', cookie);
  assert.deepEqual([g.body.closeConnected, g.body.types.map((x: any) => x.key), g.body.draft.serviceKey, g.body.options.clientRespondsClause.slice(0, 24)], [true, ['retainer', 'per_call'], 'cold_email', 'Client responds to leads']);
  const r = await call('/hq/api/sales/recSMJJ0000000001/contract/close?type=retainer', cookie);
  assert.equal(r.status, 200, r.text);
  assert.deepEqual([r.body.found, r.body.lead.id, r.body.patch.legalName, r.body.patch.signerPhone, r.body.patch.address, r.body.patch.monthly, r.body.missing], [true, 'lead_mjj1', 'MJJ Brilliant Inc.', '+15550111', '5 Gem Rd, Edison, NJ 08817', 2000, []]);
  assert.ok(calls.length === 2 && calls.every((c) => c.method === 'GET'), 'Close is only read');
  assert.deepEqual(writes, [], 'nothing written to Airtable');
  assert.equal((await db.query('SELECT count(*)::int AS n FROM hq_contract_drafts')).rows[0].n, 0, 'nothing saved: the form is saved separately');
  assert.equal((await call('/hq/api/sales/recSMJJ0000000001/contract/close', cookie, 'POST', {})).status, 405);
  // An old draft saved with "both" (before round 5) still opens: pay per call with its monthly tech fee and its own texts.
  await db.query(`INSERT INTO hq_contract_drafts (deal_id, input, created_by) VALUES ($1, $2, 'Alex')`, ['recSMJJ0000000001', JSON.stringify({ dealType: 'both', monthly: 1500, perCall: 250, initialFee: null, startDate: '2026-12-01', signerName: 'Chris', signerEmail: 'chris@mjjbrilliant.com', legalName: '', company: 'MJJ', address: '', service: 'Cold email', scope: 'Lists', term: 'Monthly', specialTerms: '', channels: { linkedin: false, aiCaller: false, directMail: false } })]);
  const old = await call('/hq/api/sales/recSMJJ0000000001/contract', cookie);
  assert.deepEqual([old.body.saved.input.dealType, old.body.saved.input.monthly, old.body.saved.input.perCall, old.body.saved.input.scope, old.body.draft.dealType], ['per_call', 1500, 250, 'Lists', 'per_call']);
});

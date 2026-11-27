// HQ Sales (Dulcy's own deals): the stage mapping, the "needs action" rules, the deal joins
// (Sales Data ↔ agreements ↔ client ↔ payments ↔ feedback ↔ Cole), the money cut, exact-count rates,
// data notes, and the read-only API (owner only: members get 403; no writes anywhere).
// Airtable is a fake (ignores formulas: the code filters again in JS); no real service is called.
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
  CF, CLIENT_TASKS_T, CONTRACTS_T, FEEDBACK_T, FF, IF, INTAKE_T, INVOICES_T, SALES_T, SF, TF, VF, WF,
  _resetSalesCache, buildDeals, companyKey, cutMoney, furthest, needsFor, nyDay, pipelineOf, reportMatches, salesNotes, stagesOf, topNumbers,
  type ColeReport, type Deal, type SalesSource, type StageFacts,
} from '../src/hq/sales.js';

const url = process.env.TEST_DATABASE_URL;
const skip = !url ? 'TEST_DATABASE_URL not set' : false;
const PW = 'correct horse battery staple';
const NOW = Date.parse('2026-11-26T15:00:00.000Z'); // 10 a.m. New York, Thursday
const TODAY = '2026-11-26';
const day = (offset: number) => nyDay(Date.parse(`${TODAY}T12:00:00Z`) + offset * 86_400_000);
const iso = (offset: number) => new Date(Date.parse(`${TODAY}T15:00:00Z`) + offset * 86_400_000).toISOString();

// ---------- pure: stages ----------
const facts = (o: Partial<StageFacts> = {}): StageFacts => ({ airtableStage: 'Audit Call Scheduled', callDate: day(3), heldDate: '', heldFlag: false, offerMade: false, dealClosed: false, cash: 0, feedbackStatus: '', agreement: null, clientPaid: false, onboarded: false, ...o });
const agr = (state: string, o: Record<string, unknown> = {}) => ({ id: 'recI0000000000001', table: 'intake', tool: 'SignWell', title: 'A', company: 'Acme', email: 'a@acme.com', signer: 'Ann Lee', state, review: '', created: iso(-10), sentAt: iso(-5), viewedAt: '', signedAt: '', clientSignedAt: '', forwardedAt: '', url: '', reviewDoc: '', closeLead: '', wsIds: [], intakeIds: [], contractIds: [], error: '', test: false, monthly: 2000, perCall: null, type: '', currency: 'USD', ...o }) as any;
const reached = (o: Partial<StageFacts>) => Object.entries(stagesOf(facts(o))).filter(([, v]) => v).map(([k]) => k).join(' ');

test('sales: stage mapping booked → showed → qualified → contract sent → signed → paid → onboarded', () => {
  assert.equal(reached({}), 'booked', 'a booked call');
  assert.equal(reached({ airtableStage: 'Call Done', heldFlag: true }), 'booked showed', 'held (Fathom ticks Call Held?)');
  assert.equal(reached({ airtableStage: 'Call Done', heldFlag: true, offerMade: true }), 'booked showed qualified', 'offer made = qualified');
  assert.equal(reached({ airtableStage: 'Follow Up Call' }), 'booked showed qualified', 'a follow-up call means it was held and qualified');
  assert.equal(reached({ airtableStage: 'Call Done', heldFlag: true, feedbackStatus: 'Qualified' }), 'booked showed qualified', 'Call Feedback Qualified');
  assert.equal(reached({ airtableStage: 'Call Done', heldFlag: true, feedbackStatus: 'Unqualified' }), 'booked showed', 'unqualified: shown, not qualified');
  assert.equal(reached({ airtableStage: 'Contract Sent' }), 'booked showed qualified sent');
  assert.equal(reached({ agreement: agr('viewed') }), 'booked showed qualified sent', 'a viewed agreement counts as sent even if the stage lags');
  assert.equal(reached({ agreement: agr('signed') }), 'booked showed qualified sent signed');
  assert.equal(reached({ agreement: agr('signed'), clientPaid: true }), 'booked showed qualified sent signed paid');
  assert.equal(reached({ agreement: agr('signed'), clientPaid: true, onboarded: true }), 'booked showed qualified sent signed paid onboarded');
  assert.equal(reached({ agreement: agr('signed'), onboarded: true }), 'booked showed qualified sent signed onboarded', 'the onboarding form is its own fact: a missing payment does not hide it (MJJ, 2026-11-27)');
  assert.equal(reached({ agreement: agr('sent'), onboarded: true }), 'booked showed qualified sent', 'onboarded needs a signed deal');
  assert.equal(reached({ agreement: agr('draft') }), 'booked', 'a draft is not sent');
  assert.equal(reached({ airtableStage: 'No Show', heldFlag: true }), 'booked', 'No Show wins over a stray Call Held? tick');
  assert.equal(reached({ airtableStage: 'Call Done', heldFlag: true, feedbackStatus: 'No Show' }), 'booked showed', 'feedback No Show vs a held call: the call counts (a data note flags it)');
  assert.equal(furthest(stagesOf(facts({ agreement: agr('signed'), clientPaid: true }))), 'paid');
});

// ---------- pure: needs action ----------
const base = (o: Partial<Deal> = {}): Deal => ({
  id: 'recS0000000000001', salesRec: 'recS0000000000001', name: 'Ann Lee', company: 'acme.com', email: 'a@acme.com', source: 'Cold Email', rep: 'Alexander Woung', campaign: '',
  airtableStage: 'Audit Call Scheduled', lossReason: '', notes: '', callDate: day(3), heldDate: '', bookedAt: iso(-3), startDay: day(3),
  stages: stagesOf(facts()), stage: 'booked', lost: false, inactiveClient: false, agreements: [], agreement: null, signedDay: '',
  client: null, clientMatch: null, paidKnown: false, paidVia: '', onboardingStarted: false, feedback: [], reviews: [], prep: null, emailRecs: [], needs: [], closeUrl: '', paidDay: '', closeLead: '', agreementRoles: [], ...o,
});
const kinds = (o: Partial<Deal>) => needsFor(base(o), TODAY).map((x) => `${x.kind}:${x.owner}`);
const textOf = (o: Partial<Deal>) => needsFor(base(o), TODAY).map((x) => x.text);

test('sales: needs action rules (calls, outcome, contracts, payment, onboarding, no-shows) and owners', () => {
  assert.deepEqual(kinds({}), [], 'a call in 3 days needs nothing yet');
  assert.deepEqual(kinds({ callDate: TODAY }), ['call_today:Cole']);
  assert.deepEqual(textOf({ callDate: TODAY }), ['Call today · no prep from Cole yet.']);
  const prep: ColeReport = { id: 7, kind: 'call_prep', title: 'Prep: Ann Lee', summary: '', link: '', score: null, created: iso(-1) };
  assert.deepEqual(needsFor(base({ callDate: day(1), prep }), TODAY).map((x) => [x.kind, x.text, x.link]), [['call_tomorrow', 'Call tomorrow · Cole\'s prep is ready.', 'report/7']]);
  assert.deepEqual(kinds({ callDate: TODAY, airtableStage: 'Canceled' }), [], 'a canceled call is not today\'s work');
  // Calls done with no outcome logged.
  assert.deepEqual(kinds({ callDate: day(-2) }), ['no_outcome:Cole'], 'the call date passed, Sales Data still "Audit Call Scheduled"');
  assert.match(textOf({ callDate: day(-2) })[0], /^Call was Nov 24: no outcome logged/);
  assert.deepEqual(kinds({ callDate: day(-45) }), [], 'older than 30 days: a data note, not today\'s work');
  const held = stagesOf(facts({ airtableStage: 'Call Done', heldFlag: true }));
  assert.deepEqual(kinds({ callDate: day(-3), heldDate: day(-3), airtableStage: 'Call Done', stages: held }), ['no_outcome:Cole'], 'held, then nothing: no offer, contract or feedback');
  assert.deepEqual(kinds({ callDate: day(-1), heldDate: day(-1), airtableStage: 'Call Done', stages: held }), [], 'held yesterday: give it 2 days');
  assert.deepEqual(kinds({ callDate: day(-3), airtableStage: 'Call Done', stages: held, feedback: [{ id: 'recF0000000000001', status: 'Qualified', rating: 4, notes: '', link: '', newDate: '', created: iso(-2) }] }), [], 'feedback logged = an outcome');
  // No-shows to re-book.
  assert.deepEqual(kinds({ callDate: day(-4), airtableStage: 'No Show' }), ['rebook:Cole']);
  assert.match(textOf({ callDate: day(-1), airtableStage: 'Reschedule' })[0], /^Asked to reschedule on Nov 25: re-book the call\.$/);
  assert.deepEqual(kinds({ callDate: day(-4), feedback: [{ id: 'recF0000000000001', status: 'No Show', rating: null, notes: '', link: '', newDate: '', created: iso(-3) }] }), ['rebook:Cole'], 'Call Feedback No Show');
  // Contracts.
  const sent = stagesOf(facts({ agreement: agr('sent') }));
  assert.deepEqual(kinds({ callDate: day(-10), stages: sent, agreement: agr('sent', { sentAt: iso(-1) }) }), [], 'sent yesterday: not yet');
  assert.deepEqual(kinds({ callDate: day(-10), stages: sent, agreement: agr('sent', { sentAt: iso(-2) }) }), ['unsigned:Cole'], '2+ days unsigned → Cole follows up');
  assert.match(textOf({ callDate: day(-10), stages: sent, agreement: agr('viewed', { sentAt: iso(-11), viewedAt: iso(-9) }) })[0], /^Contract sent Nov 15, not signed after 11 days \(viewed Nov 17\): follow up\.$/);
  assert.deepEqual(kinds({ callDate: day(-10), stages: sent, agreement: agr('viewed', { tool: 'Dulcy Sign', clientSignedAt: iso(-1) }) }), ['sign:Alex'], 'the client signed: Alex signs');
  assert.deepEqual(kinds({ callDate: day(-10), stages: stagesOf(facts()), agreement: agr('draft', { sentAt: '', created: iso(-3), review: 'Approved to send' }) }).filter((k) => k.startsWith('draft')), ['draft:Alex'], 'drafted, not sent → Alex decides');
  assert.deepEqual(kinds({ callDate: day(-120), stages: sent, agreement: agr('sent', { sentAt: iso(-100) }) }), [], 'sent 100 days ago: a data note');
  // Payment and onboarding.
  const signed = stagesOf(facts({ agreement: agr('signed') }));
  const client = { id: 'recW0000000000001', name: 'Acme', status: 'Active', paid: false, formDone: false, onboardingLinked: false, start: '' };
  assert.deepEqual(kinds({ callDate: day(-20), stages: signed, agreement: agr('signed'), signedDay: day(-5), client, paidKnown: true }), ['unpaid:Ledger']);
  assert.match(textOf({ callDate: day(-20), stages: signed, agreement: agr('signed'), signedDay: day(-5) })[0], /no client record, so payment is UNKNOWN/);
  const paid = stagesOf(facts({ agreement: agr('signed'), clientPaid: true }));
  assert.deepEqual(kinds({ callDate: day(-20), stages: paid, agreement: agr('signed'), signedDay: day(-5), client: { ...client, paid: true }, paidKnown: true }), ['onboard:Atlas']);
  assert.deepEqual(kinds({ callDate: day(-20), stages: paid, agreement: agr('signed'), signedDay: day(-5), client: { ...client, paid: true }, paidKnown: true, onboardingStarted: true }), [], 'onboarding started by n8n');
  assert.deepEqual(kinds({ callDate: day(-20), stages: signed, agreement: agr('signed'), signedDay: day(-5), client: { ...client, status: 'Inactive' }, inactiveClient: true }), [], 'an inactive client needs nothing');
});

// ---------- pure: the joins ----------
const R = (id: string, fields: Record<string, unknown>, createdTime = iso(-30)) => ({ id, fields, createdTime });
function source(): SalesSource {
  return {
    readAt: iso(0),
    sales: [
      R('recSANN0000000001', { [SF.contact]: 'Ann Lee', [SF.email]: 'ann@acme.com', [SF.company]: 'https://www.acme.com/', [SF.stage]: 'Contract Sent', [SF.callDate]: day(-12), [SF.heldDate]: day(-12), [SF.held]: true, [SF.emails]: ['recEANN0000000001'], [SF.forecast]: 2500 }),
      R('recSBOB0000000001', { [SF.contact]: 'Bob Ray', [SF.email]: 'bob@bolt.io', [SF.company]: 'Bolt', [SF.stage]: 'Audit Call Scheduled', [SF.callDate]: TODAY }),
      R('recSCAT0000000001', { [SF.contact]: 'Cat Doe', [SF.email]: 'cat@cove.com', [SF.company]: 'cove.com', [SF.stage]: 'No Show', [SF.callDate]: day(-3), [SF.emails]: ['recECAT0000000001'] }),
      R('recSDAN0000000001', { [SF.contact]: 'Dan Fox', [SF.email]: 'dan@dune.co', [SF.company]: 'Dune', [SF.stage]: 'Call Done', [SF.callDate]: day(-20), [SF.held]: true, [SF.emails]: ['recEDAN0000000001'] }),
      R('recSEVE0000000001', { [SF.contact]: 'Eve Kim', [SF.email]: 'eve@echo.com', [SF.company]: 'Echo Co', [SF.stage]: 'Canceled', [SF.callDate]: day(-8) }),
      R('recSOLD0000000001', { [SF.contact]: 'Old Lead', [SF.email]: 'old@old.com', [SF.company]: 'Old', [SF.stage]: 'Audit Call Scheduled', [SF.callDate]: '2026-09-30' }),
    ],
    intake: [
      // Ann: SignWell agreement signed 5 days ago, linked to her client record.
      R('recIANN0000000001', { [IF.company]: 'Acme Inc', [IF.first]: 'Ann', [IF.last]: 'Lee', [IF.email]: 'ann@acme.com', [IF.monthly]: 2000, [IF.status]: 'Completed', [IF.swUrl]: 'https://www.signwell.com/app/documents/1', [IF.swSent]: iso(-10), [IF.swDone]: iso(-5), [IF.ws]: ['recWACME000000001'] }),
      // Gus: an agreement with no Sales Data row, sent 4 days ago (company match only).
      R('recIGUS0000000001', { [IF.company]: 'Gale Studio', [IF.first]: 'Gus', [IF.last]: 'Hale', [IF.email]: 'gus@galestudio.com', [IF.monthly]: 1500, [IF.status]: 'Sent', [IF.swSent]: iso(-4), [IF.swUrl]: 'https://www.signwell.com/app/documents/2' }),
      // An old 2025 intake with no agreement tracking: history, left out.
      R('recIOLD0000000001', { [IF.company]: 'Past Co', [IF.email]: 'past@past.com', [IF.monthly]: 3000 }, '2025-05-01T00:00:00.000Z'),
    ],
    contracts: [
      R('recCGALE000000001', { [CF.title]: 'Gale Studio - Growth Partnership', [CF.company]: 'Gale Studio', [CF.signer]: 'Gus Hale', [CF.signerEmail]: 'GUS@galestudio.com', [CF.status]: 'sent', [CF.sent]: iso(-3), [CF.fee]: 1500, [CF.billing]: 'Monthly', [CF.manage]: 'https://sign.dulcy.io/admin#contract=x', [CF.closeLead]: 'lead_abc123', [CF.intake]: ['recIGUS0000000001'] }),
      R('recCTEST000000001', { [CF.title]: 'QA ONLY — Monthly form verification', [CF.signerEmail]: 'qa@example.invalid', [CF.status]: 'draft', [CF.test]: true }),
    ],
    feedback: [
      R('recFCAT0000000001', { [FF.lead]: 'recECAT0000000001', [FF.status]: 'No Show', [FF.emails]: ['recECAT0000000001'], [FF.created]: day(-2) }),
      R('recFDAN0000000001', { [FF.lead]: 'recEDAN0000000001', [FF.emails]: ['recEDAN0000000001'], [FF.notes]: 'Good call', [FF.link]: 'https://fathom.video/share/abc', [FF.created]: day(-19) }),
      R('recFOTHER00000001', { [FF.status]: 'Qualified', [FF.emails]: ['recEZZZ0000000001'], [FF.created]: day(-2) }),
    ],
    ws: [
      R('recWACME000000001', { [WF.name]: 'Acme', [WF.status]: 'Active' }),
      R('recWDULCY00000001', { [WF.name]: 'Dulcy', [WF.status]: 'Active', [WF.paid]: true }),
    ],
    invoices: [R('recVACME000000001', { [VF.amount]: 2000, [VF.date]: iso(-4), [VF.type]: 'Successful', [VF.client]: ['recWACME000000001'] })],
  };
}
const reports: ColeReport[] = [
  { id: 3, kind: 'call_review', title: 'Call review: Ann Lee (Acme)', summary: 'Score 7/10 · Good', link: 'https://fathom.video/calls/1', score: 7, created: iso(-12) },
  { id: 4, kind: 'call_prep', title: 'Prep: Bob Ray (Bolt)', summary: '', link: '', score: null, created: iso(-1) },
  { id: 5, kind: 'call_review', title: 'Call review: Someone Else (Other)', summary: '', link: '', score: 5, created: iso(-2) },
];

test('sales: deals join Sales Data, agreements, client, payments, feedback and Cole; tests and old intakes left out', () => {
  assert.equal(companyKey('https://www.acme.com/about'), 'acme');
  assert.equal(companyKey('Acme Inc'), 'acme');
  assert.equal(companyKey('n/a'), '');
  assert.ok(reportMatches('Call review: Ann Lee (Acme)', { name: 'Ann Lee', company: '' }));
  assert.ok(reportMatches('Call review: prospect (ACME)', { name: 'A', company: 'https://acme.com' }));
  assert.ok(!reportMatches('Call review: Ann Leeds', { name: 'Ann Lee', company: 'zz' }));

  const deals = buildDeals(source(), { now: NOW, reports });
  const by = (id: string) => deals.find((d) => d.id === id)!;
  assert.equal(deals.length, 7, '6 Sales Data rows + 1 agreement-only deal (Gus); the test contract and the 2025 intake are not deals');
  const ann = by('recSANN0000000001');
  assert.deepEqual([ann.stage, ann.agreement?.tool, ann.client?.name, ann.clientMatch, ann.paidVia], ['paid', 'SignWell', 'Acme', 'link', '1 paid invoice'], 'signed, paid by a Successful invoice; no onboarding yet');
  assert.deepEqual(ann.needs.map((x) => x.kind), ['onboard']);
  assert.deepEqual(ann.reviews.map((r) => r.id), [3], 'Cole\'s review matched by name');
  assert.equal(ann.money?.monthly, 2000);
  const bob = by('recSBOB0000000001');
  assert.deepEqual(bob.needs.map((x) => [x.kind, x.link]), [['call_today', 'report/4']], 'call today with Cole\'s prep');
  const cat = by('recSCAT0000000001');
  assert.deepEqual(cat.needs.map((x) => x.kind), ['rebook']);
  assert.equal(cat.feedback[0].status, 'No Show');
  const dan = by('recSDAN0000000001');
  assert.deepEqual(dan.needs.map((x) => x.kind), [], 'Call Done 20 days ago with feedback: an outcome exists');
  assert.equal(dan.feedback[0].link, 'https://fathom.video/share/abc');
  const gus = deals.find((d) => !d.salesRec)!;
  assert.equal(gus.agreements.length, 2, 'the intake row and its Dulcy Sign contract');
  assert.deepEqual([gus.name, gus.agreement?.tool, gus.agreement?.state, gus.closeUrl], ['Gus Hale', 'Dulcy Sign', 'sent', 'https://app.close.com/lead/lead_abc123/']);
  assert.deepEqual(gus.needs.map((x) => `${x.kind}:${x.owner}`), ['unsigned:Cole'], 'Dulcy Sign sent 3 days ago, not signed');
  assert.ok(deals.every((d) => d.agreements.every((a) => !a.test)), 'no test contract anywhere');

  // Pipeline: exact counts. 30 days: Ann, Bob, Cat, Dan, Eve (canceled), Gus. Old is out of the window.
  const p = pipelineOf(deals, 30, TODAY);
  assert.equal(p.deals, 6);
  assert.deepEqual(p.stages.map((x) => [x.key, x.count]), [['booked', 6], ['showed', 3], ['qualified', 2], ['sent', 2], ['signed', 1], ['paid', 1], ['onboarded', 0]]);
  assert.equal(p.showRate.text, '2 of 3 showed', 'past calls, canceled left out: Ann and Dan showed, Cat did not');
  assert.equal(p.closeRate.text, '1 of 2 signed');
  assert.equal(p.canceled, 1);
  assert.deepEqual(p.stages.find((x) => x.key === 'paid')!.deals.map((d) => d.name), ['Ann Lee']);
  assert.equal(pipelineOf(deals, 90, TODAY).deals, 7, '90 days includes the September call');

  // Top numbers: November vs October, money only for the owner.
  const top = topNumbers(deals, TODAY, true);
  assert.deepEqual([top.thisMonth.label, top.thisMonth.booked, top.thisMonth.showed, top.thisMonth.closed, top.thisMonth.mrr], ['November', 5, 2, 1, 2000]);
  assert.deepEqual([top.lastMonth.label, top.lastMonth.booked], ['October', 0]);
  assert.ok(!('mrr' in topNumbers(deals, TODAY, false).thisMonth), 'no MRR key for anyone but the owner');

  // Data notes.
  const notes = salesNotes(deals, source(), TODAY).map((x) => x.problem);
  assert.ok(notes.includes('Call Feedback row with no Call Status'), notes.join(' | '));
  assert.ok(notes.includes('Old calls still "Audit Call Scheduled"'));
  assert.ok(notes.includes('Agreement with no Sales Data row'));
  assert.ok(notes.includes('No Sales Data row is marked Won'));
  const all = salesNotes(deals, source(), TODAY);
  assert.ok(all.every((x) => x.problem && x.data && x.fix && x.why && x.owner), 'every note is Problem → Data → Fix → Why, with an owner');
});

test('sales: a signed deal with no client record, and the No Show / held clash, are data notes', () => {
  const src = source();
  src.intake[0].fields[IF.ws] = [];
  src.ws = src.ws.filter((w) => w.id !== 'recWACME000000001');
  src.feedback.push(R('recFANN0000000001', { [FF.status]: 'No Show', [FF.emails]: ['recEANN0000000001'], [FF.created]: day(-11) }));
  const deals = buildDeals(src, { now: NOW, reports: [] });
  const ann = deals.find((d) => d.id === 'recSANN0000000001')!;
  assert.deepEqual(ann.needs.map((x) => x.text), ['Signed Nov 21: no client record, so payment is UNKNOWN.']);
  const notes = salesNotes(deals, src, TODAY);
  assert.match(notes.find((x) => x.problem === 'Signed deal with no client record')!.data, /^Ann Lee, signed Nov 21$/);
  assert.match(notes.find((x) => /Call Feedback says No Show/.test(x.problem))!.data, /Ann Lee: feedback "No Show" · Sales Data "Contract Sent", held Nov 14/);
});

test('sales: the money cut removes money keys and amounts in text', () => {
  const view = { top: { thisMonth: { booked: 3, mrr: 4500, mrrUnknown: 0 } }, action: [{ name: 'Tutor Intelligence — $1,500/month proposal', monthly: 1500 }], deal: { money: { monthly: 2000 }, title: 'Fee $2,500 and £300 setup', cash: 10 } };
  const cut = cutMoney(view) as any;
  assert.deepEqual(cut, { top: { thisMonth: { booked: 3 } }, action: [{ name: 'Tutor Intelligence — [amount hidden] proposal' }], deal: { title: 'Fee [amount hidden] and [amount hidden] setup' } });
  assert.ok(!/\$|£|"monthly"|"mrr"|"money"|"cash"/.test(JSON.stringify(cut)));
});

// ---------- the API ----------
let db: Db; let server: http.Server; let port: number; let webDir: string;
let tables: Record<string, Record<string, Record<string, unknown>>>;
let writes: unknown[]; let reads: string[];
const at = {
  async list(table: string, formula: string) { reads.push(`${table} ${formula}`); return Object.entries(tables[table] ?? {}).map(([id, fields]) => ({ id, fields: { ...fields }, createdTime: iso(-30) })); },
  async get(table: string, id: string) { reads.push(`${table} get`); const f = tables[table]?.[id]; return f ? { id, fields: { ...f } } : null; },
  async create(...a: unknown[]) { writes.push(a); return 'recNEW00000000001'; },
  async update(...a: unknown[]) { writes.push(a); },
};
function cfg(over: Partial<Config> = {}): Config {
  return { ...loadConfig({ ENGINE_SECRET: 'x'.repeat(40), DATABASE_URL: url ?? 'postgres://x', HQ_SESSION_SECRET: 's'.repeat(40), HQ_HOST: 'hq.test.local' } as NodeJS.ProcessEnv), airtableApiKey: undefined, anthropicApiKey: undefined, ...over };
}
interface Res { status: number; body: any; text: string }
function call(p: string, cookie?: string, method = 'GET'): Promise<Res> {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port, method, path: p, headers: { host: `127.0.0.1:${port}`, ...(method !== 'GET' ? { origin: `https://127.0.0.1:${port}`, 'content-type': 'application/json' } : {}), ...(cookie ? { cookie } : {}) } }, (res) => {
      const chunks: Buffer[] = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => { const text = Buffer.concat(chunks).toString('utf8'); let body: any = null; try { body = JSON.parse(text); } catch { /* not json */ } resolve({ status: res.statusCode ?? 0, body, text }); });
    });
    req.on('error', reject); if (method !== 'GET') req.write('{}'); req.end();
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
const asTables = (src: SalesSource) => {
  const t = (rows: { id: string; fields: Record<string, unknown> }[]) => Object.fromEntries(rows.map((r) => [r.id, r.fields]));
  return { [SALES_T]: t(src.sales), [INTAKE_T]: t(src.intake), [CONTRACTS_T]: t(src.contracts), [FEEDBACK_T]: t(src.feedback), [WORKSPACES_T]: t(src.ws), [INVOICES_T]: t(src.invoices),
    [CLIENT_TASKS_T]: { recTASK0000000001: { [TF.task]: 'Book onboarding', [TF.stage]: 'Done', [TF.client]: ['recWACME000000001'] }, recTASK0000000002: { [TF.task]: 'Submit resources', [TF.stage]: 'New Task', [TF.client]: ['recWACME000000001'] }, recTASK0000000003: { [TF.task]: 'Other client', [TF.stage]: 'Done', [TF.client]: ['recWOTHER00000001'] } } };
};

before(async () => {
  webDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hqsales-'));
  fs.writeFileSync(path.join(webDir, 'index.html'), '<!doctype html><title>Dulcy HQ</title>');
  if (skip) return;
  db = createPool(url!); await migrate(db);
  server = createServer(db, cfg(), { at: at as any, webDir });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', () => r()));
  port = (server.address() as AddressInfo).port;
});
after(async () => { if (!skip) { server.close(); await db.end(); } fs.rmSync(webDir, { recursive: true, force: true }); });
beforeEach(async () => {
  tables = asTables(source()); writes = []; reads = []; _resetSalesCache();
  if (skip) return;
  await db.query('TRUNCATE hq_users, hq_sessions, hq_login_attempts, hq_reports RESTART IDENTITY CASCADE');
  await upsertUser(db, 'alex@dulcy.io', 'owner', PW, 'Alex');
});

test('sales API: a session is needed; members get 403 on every sales route', { skip }, async () => {
  assert.equal((await call('/hq/api/sales')).status, 401);
  assert.equal((await call('/hq/api/sales/recSANN0000000001')).status, 401);
  await upsertUser(db, 'josh@dulcy.io', 'member', 'josh long password 1', 'Josh');
  const josh = await login('josh@dulcy.io', 'josh long password 1');
  for (const p of ['/hq/api/sales', '/hq/api/sales?days=90', '/hq/api/sales/recSANN0000000001', '/hq/api/sales/recNOPE0000000001', '/hq/api/sales/whatever']) {
    const r = await call(p, josh);
    assert.equal(r.status, 403, p);
    assert.ok(!/\$|2000|Acme|Ann/.test(r.text), `nothing leaks to a member: ${r.text}`);
  }
  assert.deepEqual(reads, [], 'a member never triggers an Airtable read');
});

test('sales API: owner sees top numbers, needs action first, pipeline with exact counts, notes; cached 60 s; no writes', { skip }, async (t) => {
  // The fixtures are dated around TODAY: pin the server's clock to it (only Date; real timers keep running).
  t.mock.timers.enable({ apis: ['Date'], now: NOW });
  await db.query(`INSERT INTO hq_reports (agent, kind, title, summary, link, data) VALUES ('Cole','call_review','Call review: Ann Lee (Acme)','Score 7/10 · Good','https://fathom.video/calls/1','{"score":7}'), ('Cole','call_prep','Prep: Bob Ray (Bolt)','Ready','', null), ('Ledger','money_report','Money','x','', null)`);
  await db.query(`UPDATE hq_reports SET created_at = to_timestamp($1 / 1000.0) - interval '1 hour'`, [NOW]);
  const cookie = await login('alex@dulcy.io', PW);
  const r = await call('/hq/api/sales', cookie);
  assert.equal(r.status, 200, r.text);
  assert.equal(r.body.pipeline.days, 30);
  assert.ok(r.body.top.thisMonth.mrr !== undefined, 'the owner sees MRR');
  const kinds = r.body.action.map((d: any) => [d.name, d.needs[0].kind, d.needs[0].owner]);
  assert.deepEqual(kinds.slice(0, 1), [['Bob Ray', 'call_today', 'Cole']], 'today\'s call first');
  assert.ok(kinds.some((k: string[]) => k[0] === 'Gus Hale' && k[1] === 'unsigned'));
  assert.ok(kinds.some((k: string[]) => k[0] === 'Cat Doe' && k[1] === 'rebook'));
  assert.ok(kinds.some((k: string[]) => k[0] === 'Ann Lee' && k[1] === 'onboard' && k[2] === 'Atlas'));
  assert.equal(r.body.action.find((d: any) => d.name === 'Bob Ray').needs[0].link, 'report/2', 'Cole\'s prep (hq_reports) is linked');
  assert.equal(r.body.pipeline.showRate.text, '2 of 3 showed');
  assert.equal(r.body.counts.action, r.body.action.length);
  assert.ok(r.body.notes.length >= 3);
  const n = reads.length;
  assert.equal(n, 6, 'one batched read per table (Sales Data, New Client Intake, Contracts, Call Feedback, Workspace IDs, Client Invoices)');
  await call('/hq/api/sales?days=90', cookie);
  assert.equal(reads.length, n, 'cached: switching to 90 days reads nothing again');
  assert.equal((await call('/hq/api/sales?days=90', cookie)).body.pipeline.days, 90);
  assert.equal((await call('/hq/api/sales', cookie, 'POST')).status, 405, 'no writes exist here');
  assert.deepEqual(writes, [], 'nothing written to Airtable');
});

test('sales API: the deal page (contact, calls, Cole review, feedback, contract links, payment, onboarding steps); links only', { skip }, async () => {
  await db.query(`INSERT INTO hq_reports (agent, kind, title, summary, link, data) VALUES ('Cole','call_review','Call review: Ann Lee (Acme)','Score 7/10 · Good','https://fathom.video/calls/1','{"score":7}')`);
  const cookie = await login('alex@dulcy.io', PW);
  const r = await call('/hq/api/sales/recSANN0000000001', cookie);
  assert.equal(r.status, 200, r.text);
  const d = r.body.deal;
  assert.deepEqual([d.name, d.email, d.stage, d.client.name, d.money.monthly], ['Ann Lee', 'ann@acme.com', 'paid', 'Acme', 2000]);
  assert.deepEqual(d.reviews.map((x: any) => [x.score, x.link]), [[7, 'https://fathom.video/calls/1']]);
  assert.ok(r.body.calls.some((c: any) => c.link === 'https://fathom.video/calls/1'), 'the recorded call links to Fathom (as stored)');
  assert.deepEqual(r.body.onboarding.map((x: any) => [x.step, x.done]), [['Agreement signed', true], ['Payment received', true], ['Onboarding started', false], ['Onboarding form', false]], 'no client tasks on the sales view');
  assert.ok(!/airtable\.com/.test(r.text), 'no Airtable links anywhere (Alex 2026-11-27)');
  assert.ok(!('tasks' in r.body), 'client tasks are not part of sales');
  assert.deepEqual(r.body.links.agreements, [], 'SignWell is retired: no SignWell link');
  assert.equal(d.review.score, 7, 'the latest call review is on the deal');
  assert.match(d.coleNext, /onboarding/i, 'Cole\'s next step for a paid deal: onboarding');
  // An agreement-only deal opens by the agreement's record id, with the Close and Dulcy Sign links.
  const g = await call('/hq/api/sales/recCGALE000000001', cookie);
  assert.equal(g.status, 200);
  assert.equal(g.body.links.close, 'https://app.close.com/lead/lead_abc123/');
  assert.ok(g.body.links.agreements.some((a: any) => a.url === 'https://sign.dulcy.io/admin#contract=x'));
  assert.equal((await call('/hq/api/sales/recNOPE0000000001', cookie)).status, 404);
  assert.equal((await call('/hq/api/sales/recSANN0000000001', cookie, 'POST')).status, 405);
  assert.deepEqual(writes, [], 'nothing written to Airtable');
});

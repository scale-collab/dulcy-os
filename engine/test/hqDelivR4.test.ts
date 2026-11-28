// HQ Deliverability round 4 (Alex, 2026-11-28): one "Have Atlas fix it" per problem (the brief lists
// the accounts) instead of a long list; never "Verified by other" (MillionVerifier, LeadMagic, Client
// verified or Not recorded); the placement run's tests still waiting at EmailGuard; dates with no
// weekday; the cost note. Pure functions only: no real service is called.
import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { BRIEF_MAX, capLines, spamBriefs, warmupBrief } from '../src/hq/deliverabilityFix.js';
import { PF, pendingTests, readPendingTests, setPendingTestsReader, waitingForRun } from '../src/hq/deliverabilityPending.js';
import {
  CLIENT_VERIFIED, NOT_RECORDED, VL, isClientVerified, listVerifiersOf, normVerifier, verificationRows, verifierFor, verifierTotals, type BounceRow,
} from '../src/hq/bounceStats.js';
import { freshnessNotes, placementFreshness } from '../src/hq/deliverability.js';

const DAY = 86_400_000;
const ago = (d: number) => new Date(Date.now() - d * DAY).toISOString();

/* ---------- 1. Fix it briefs ---------- */
const box = (email: string, o: Record<string, unknown> = {}) => ({ email, client: 'Twenty West', clientKey: 'twentywestmedia', warmupWhy: 'unexpected' as const, connection: 'Connected', ...o });

test('warm-up brief: only unexpected warm-up off counts; one Atlas task listing the accounts', () => {
  const inboxes = [
    box('b@twm-mail.com'), box('a@twm-mail.com', { connection: 'Disconnected' }),
    box('r@twm-mail.com', { warmupWhy: 'resting' }), box('p@twm-mail.com', { warmupWhy: 'replacing' }), box('s@twm-mail.com', { warmupWhy: 'spam' }),
    box('on@twm-mail.com', { warmupWhy: null }), box('x@none.com', { clientKey: 'none', client: 'No client' }),
    box('d@dulcy-mail.com', { client: 'Dulcy', clientKey: 'dulcy' }),
  ] as any[];
  const all = warmupBrief(inboxes)!;
  assert.deepEqual([all.agent, all.count, all.title], ['Atlas', 3, 'Turn warm-up back on for 3 inboxes']);
  assert.match(all.detail, /^Warm-up is off for no known reason on 3 inboxes: not resting/);
  assert.match(all.detail, /1 is disconnected: reconnect it first/);
  assert.match(all.detail, /Accounts:\n- d@dulcy-mail\.com \(Dulcy\)\n- a@twm-mail\.com \(Twenty West\) · disconnected\n- b@twm-mail\.com \(Twenty West\)$/);
  assert.ok(!/r@twm|p@twm|s@twm|on@twm|x@none/.test(all.detail), 'resting / replaced / spam review / on / no client are not listed');
  const one = warmupBrief(inboxes, 'dulcy', 'Dulcy')!;
  assert.deepEqual([one.count, one.title], [1, 'Turn warm-up back on for 1 inbox']);
  assert.match(one.detail, /on 1 inbox \(Dulcy\)/);
  assert.match(one.detail, /\n- d@dulcy-mail\.com$/, 'the client is in the head, not on every line');
  assert.equal(warmupBrief(inboxes.filter((i) => i.warmupWhy !== 'unexpected')), null, 'nothing to fix');
});

test('briefs fit the Fix it detail (2000 characters): the rest is "…and N more"', () => {
  const many = Array.from({ length: 151 }, (_, i) => box(`inbox${String(i).padStart(3, '0')}@a-rather-long-domain-name.com`)) as any[];
  const w = warmupBrief(many)!;
  assert.equal(w.count, 151);
  assert.ok(w.detail.length <= 2000, `detail is ${w.detail.length} characters`);
  assert.match(w.detail, /\n…and \d+ more \(Deliverability → Needs attention → Show accounts\)\.$/);
  assert.deepEqual(capLines(['a', 'b'], 100), ['a', 'b'], 'everything fits: no "more" line');
  assert.deepEqual(capLines(['x'.repeat(50), 'y'.repeat(50), 'z'.repeat(50)], 120)[1], '…and 2 more (Deliverability → Needs attention → Show accounts).');
  assert.ok(BRIEF_MAX < 2000);
});

test('spam briefs: one per owner (Atlas / Riley), accounts with their reason; warm-up off and resting are not in it', () => {
  const it = (title: string, o: Record<string, unknown> = {}) => ({ kind: 'inbox', status: 'spam', title, client: 'Twenty West', clientKey: 'twentywestmedia', reason: 'Placement 40% (11/27)', owner: 'Atlas', redFlag: false, ...o });
  const items = [
    it('a@twm-mail.com'), it('twm-mail2.com', { kind: 'domain', inboxes: 2, reason: 'Blacklisted' }), it('c@twm-mail.com', { owner: 'Riley', reason: 'Disconnected' }),
    it('w@twm-mail.com', { redFlag: true }), it('r@twm-mail.com', { status: 'resting' }), it('k@twm-mail.com', { status: 'risk' }),
  ] as any[];
  const [atlas, riley, ...rest] = spamBriefs(items);
  assert.equal(rest.length, 0);
  assert.deepEqual([atlas.agent, atlas.count, atlas.title], ['Atlas', 2, 'Fix 1 inbox and 1 domain in spam']);
  assert.match(atlas.detail, /- a@twm-mail\.com · Twenty West: Placement 40% \(11\/27\)/);
  assert.match(atlas.detail, /- twm-mail2\.com \(domain, 2 inboxes\) · Twenty West: Blacklisted/);
  assert.match(atlas.detail, /waits for Alex's OK/, 'buying needs Alex');
  assert.deepEqual([riley.agent, riley.title], ['Riley', 'Fix 1 inbox in spam']);
  assert.match(riley.detail, /reconnect/);
  assert.ok(!/w@twm|r@twm|k@twm/.test(atlas.detail + riley.detail));
  assert.deepEqual(spamBriefs(items, 'dulcy'), [], 'another client: nothing');
});

/* ---------- 2. Verification: never "Other" ---------- */
const list = (o: Record<string, unknown> = {}) => ({ direct: '', generic: '', listProvider: '', mvJob: '', route: '', clientVerified: false, ...o });

test('who verified: field, route, MillionVerifier job, list provider, client, else Not recorded (never "Other")', () => {
  assert.deepEqual(['MillionVerifier', 'LeadMagic', 'Lead Magic', 'None', 'Unknown', '', 'Other', 'client verified', 'NeverBounce'].map(normVerifier),
    ['MillionVerifier', 'LeadMagic', 'LeadMagic', '', '', '', '', CLIENT_VERIFIED, 'NeverBounce']);
  assert.equal(verifierFor(list({ direct: 'LeadMagic' }), 'Direct'), 'LeadMagic', 'the list field first');
  assert.equal(verifierFor(list({ direct: 'None', route: 'Generic → MillionVerifier · Direct → LeadMagic' }), 'Direct'), 'LeadMagic', 'the engine route per email type');
  assert.equal(verifierFor(list({ route: 'Generic → MillionVerifier · Direct → LeadMagic' }), 'Generic'), 'MillionVerifier');
  assert.equal(verifierFor(list({ route: 'MV-first v2' }), 'Direct'), 'MillionVerifier', 'MV-first');
  assert.equal(verifierFor(list({ mvJob: '32529961' }), 'Generic'), 'MillionVerifier', 'a MillionVerifier job ID');
  assert.equal(verifierFor(list({ listProvider: 'LeadMagic' }), 'Direct'), 'LeadMagic', 'the list-level provider last');
  assert.equal(verifierFor(list(), 'Direct'), NOT_RECORDED, 'nothing recorded');
  assert.equal(verifierFor(list({ direct: 'MillionVerifier', clientVerified: true }), 'Direct'), CLIENT_VERIFIED, 'the client verified it');
  assert.ok(isClientVerified('[Isles] Boutiques (client verified)'));
  assert.ok(isClientVerified('Client-provided list'));
  assert.ok(isClientVerified('List verified by the client'));
  assert.ok(!isClientVerified('[Human Marketing] US Own-Brand Shopify DTC') && !isClientVerified('[Twenty West] Accounting firms'));
  const rec = listVerifiersOf({ id: 'recLIST000000001A', fields: { [VL.name]: 'Boutiques (client verified)', [VL.finalDirect]: 300, [VL.mvJob]: '' } });
  assert.deepEqual([rec.name, rec.directCount, rec.clientVerified], ['Boutiques (client verified)', 300, true]);
});

const bounce = (o: Partial<BounceRow> = {}): BounceRow => ({ id: 'r', lead: 'x@acme.com', domain: 'acme.com', inbox: 'a@x-mail.com', campaign: 'C', campaignRec: 'recCAMP000000001A', clientKey: 'k', client: 'K', at: ago(1), code: '550', enhanced: '5.1.1', meaning: '', hard: true, kind: 'not_found', landing: 'custom', gateway: '', verifier: '', emailType: 'Direct', ...o });
const bounces = (n: number, o: Partial<BounceRow> = {}) => Array.from({ length: n }, (_, i) => bounce({ id: `r${i}`, ...o }));
const camp = (o: Record<string, unknown> = {}) => ({ id: 'recCAMP000000001A', name: 'K - Roofers', clientKey: 'k', client: 'K', contacted: 1000, bounce: 3, status: 'Active', lists: ['recLIST000000001A'], ...o }) as any;

test('verification rows: unset lists with a MillionVerifier job are MillionVerifier; nothing recorded is "Not recorded"; no "Other" anywhere', () => {
  const lists = new Map([
    ['recLIST000000001A', { id: 'recLIST000000001A', name: 'Roofers', ...list({ mvJob: '123', route: 'MV-first v2' }), directCount: 600, genericCount: 400, source: 'DiscoLike' }],
    ['recLIST000000002A', { id: 'recLIST000000002A', name: 'Old list', ...list(), directCount: 500, genericCount: 0, source: '' }],
  ]);
  const [mv] = verificationRows([camp()], lists, bounces(12), [{ campaignRec: 'recCAMP000000001A', campaignName: '', provider: 'Unknown', emailType: 'Direct', leads: 0, contacted: 0, bounces: 0 }]);
  assert.deepEqual(mv.cohorts.map((c) => [c.verifier, c.emailType]).sort(), [['MillionVerifier', 'Direct'], ['MillionVerifier', 'Generic']]);
  const [none] = verificationRows([camp({ id: 'recCAMP000000002A', lists: ['recLIST000000002A'] })], lists, bounces(12, { campaignRec: 'recCAMP000000002A' }), []);
  assert.deepEqual(none.cohorts.map((c) => c.verifier), [NOT_RECORDED]);
  assert.match(none.line, /^Emails with no verifier recorded \(Direct\)/);
  const [noList] = verificationRows([camp({ id: 'recCAMP000000003A', lists: [] })], lists, bounces(3, { campaignRec: 'recCAMP000000003A', emailType: '' }), []);
  assert.deepEqual(noList.cohorts.map((c) => [c.verifier, c.emailType]), [[NOT_RECORDED, 'Unknown']]);
  const all = [mv, none, noList];
  assert.ok(!JSON.stringify(all).includes('"Other"') && !verifierTotals(all).some((t) => t.verifier === 'Other'), 'never "Other"');
});

test('verification rows: a client-verified campaign is "Client verified", whatever the default tags say', () => {
  const lists = new Map([['recLIST000000001A', { id: 'recLIST000000001A', name: 'Boutiques', ...list({ direct: 'MillionVerifier' }), directCount: 300, genericCount: 0, source: '' }]]);
  const [r] = verificationRows([camp({ name: 'Isles - Boutiques', clientVerified: true })], lists, bounces(12, { verifier: 'MillionVerifier' }), [{ campaignRec: 'recCAMP000000001A', campaignName: '', provider: 'MillionVerifier', emailType: 'Direct', leads: 300, contacted: 250, bounces: 12 }]);
  assert.deepEqual(r.cohorts.map((c) => [c.verifier, c.leads, c.contacted, c.bounces]), [[CLIENT_VERIFIED, 300, 250, 12]]);
  assert.match(r.line, /^Client-verified emails \(Direct\): 12 of 12 .* re-verify with MillionVerifier before the next send\.$/);
});

/* ---------- 3. Placement: waiting for EmailGuard; no weekday in dates ---------- */
afterEach(() => setPendingTestsReader(null));

test('placement: tests still waiting at EmailGuard are counted for the newest run (not "skipped")', async () => {
  const row = (id: string, email: string, created: string, o: Record<string, unknown> = {}) => ({ id, createdTime: created, fields: { [PF.email]: email, [PF.workspaceId]: 2, [PF.testId]: `t-${id}`, [PF.status]: 'Pending', ...o } });
  const rows = [
    row('rec1', 'A@dulcy-mail.com', '2026-11-27T15:00:00.000Z'), row('rec2', 'b@dulcy-mail.com', '2026-11-27T15:01:00.000Z'),
    row('rec3', 'c@dulcy-mail.com', '2026-11-27T15:02:00.000Z', { [PF.testId]: '' }), row('rec4', 'd@dulcy-mail.com', '2026-11-27T15:03:00.000Z', { [PF.status]: 'Send' }),
    row('rec5', 'old@dulcy-mail.com', '2026-11-20T15:00:00.000Z'),
  ];
  const p = pendingTests(rows as any);
  assert.deepEqual(p.map((t) => [t.email, t.workspaceId]), [['a@dulcy-mail.com', '2'], ['b@dulcy-mail.com', '2'], ['old@dulcy-mail.com', '2']], 'Pending with a Test ID only');
  const withClient = p.map((t) => ({ ...t, clientKey: 'dulcy', date: t.at.slice(0, 10) }));
  assert.deepEqual(waitingForRun(withClient, '2026-11-27', new Set()), { connected: true, waiting: 2, since: '2026-11-27' }, 'older leftovers are not this run');
  assert.equal(waitingForRun(withClient, '2026-11-27', new Set(['b@dulcy-mail.com'])).waiting, 1, 'already scored: not counted twice');
  assert.equal(waitingForRun(withClient, '2026-11-27', new Set(), 'twentywestmedia').waiting, 0, 'per client');
  assert.deepEqual(waitingForRun(null, '2026-11-27', new Set()), { connected: false, waiting: 0, since: '2026-11-27' }, 'not readable: only the scored count');
  // The other base cannot be read (token scoped to the Dulcy base): fails softly, never throws.
  setPendingTestsReader(() => Promise.reject(new Error('Airtable refused the token (HTTP 403)')));
  assert.equal(await readPendingTests(), null);
  setPendingTestsReader(() => { throw new Error('boom'); });
  assert.equal(await readPendingTests(), null);
  setPendingTestsReader(() => null);
  assert.equal(await readPendingTests(), null, 'no key: not connected');
  setPendingTestsReader(() => Promise.resolve(rows as any));
  assert.equal((await readPendingTests())?.length, 5);
});

test('dates have no weekday: placement notes read "The 11/27 placement scores…"', () => {
  const opts = { healthFrom: '2026-11-26T12:00:00.000Z', loopOn: true };
  const notes = [
    ...freshnessNotes(placementFreshness('2026-11-21T15:00:00.000Z', new Date('2026-11-26T15:00:00Z')), opts),
    ...freshnessNotes(placementFreshness('2026-11-24T15:00:00.000Z', new Date('2026-11-29T15:00:00Z')), opts),
  ];
  assert.ok(notes.length >= 2);
  for (const n of notes) assert.ok(!/\b(Mon|Tue|Wed|Thu|Fri|Sat|Sun)(day)?\b/.test(`${n.problem} ${n.data} ${n.fix}`), `no weekday: ${n.problem} ${n.data} ${n.fix}`);
});

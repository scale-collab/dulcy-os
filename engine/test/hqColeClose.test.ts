// Round 3: Cole keeps Close current. After a call review he sets the prospect's open opportunity
// confidence (from the call's temperature) and value (only a price quoted word for word from the
// transcript). Live only with cole.close_update in LIVE_STAGES; otherwise "planned". Only the
// opportunity's confidence / value / value_period are ever written. Fake Close; nothing real is called.
import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { createPool, migrate, type Db } from '../src/db/pool.js';
import { loadConfig } from '../src/config.js';
import { createCloseClient, opportunityBody } from '../src/providers/close.js';
import { amountsIn, closeUpdateLive, closeUpdatesFor, coleUpdateClose, outcomeFromReview, planChanges, pickOpportunity, _resetCloseUpdateTable } from '../src/hq/closeUpdates.js';

const url = process.env.TEST_DATABASE_URL;
const skip = !url ? 'TEST_DATABASE_URL not set' : false;
const TRANSCRIPT = '[00:10] ALEX: What does one customer bring you?\n[22:40] ALEX: For this we do two thousand, so $2K a month, and we start in a week.\n[23:00] Nick Wendt: That works.';

type Call = { method: string; path: string; query: Record<string, string>; body: any };
function fakeClose(calls: Call[], o: { opps?: any[]; leads?: any[]; failPut?: boolean } = {}) {
  const opps = o.opps ?? [
    { id: 'oppo_nick', lead_id: 'lead_nick', status_type: 'active', status_label: 'Call Done', value: 300000, value_period: 'monthly', confidence: 20, date_updated: '2026-11-20T10:00:00Z', date_created: '2026-11-01T10:00:00Z' },
    { id: 'oppo_old', lead_id: 'lead_nick', status_type: 'lost', status_label: 'Lost', value: 100000, confidence: 0, date_updated: '2026-11-25T10:00:00Z', date_created: '2026-01-01T10:00:00Z' },
  ];
  const leads = o.leads ?? [{ id: 'lead_nick', display_name: 'Protek CNC', contacts: [{ emails: [{ email: 'Nick@ProtekCNC.com' }] }] }];
  return (async (u: string | URL, init?: RequestInit) => {
    const q = new URL(String(u));
    const body = init?.body ? JSON.parse(String(init.body)) : null;
    calls.push({ method: String(init?.method ?? 'GET'), path: q.pathname.replace('/api/v1', ''), query: Object.fromEntries(q.searchParams), body });
    if (q.pathname.endsWith('/lead/')) return Response.json({ data: leads, has_more: false });
    if (q.pathname.endsWith('/opportunity/')) return Response.json({ data: opps.filter((x) => !q.searchParams.get('lead_id') || x.lead_id === q.searchParams.get('lead_id')), has_more: false });
    const m = q.pathname.match(/\/opportunity\/(oppo_\w+)\/$/);
    if (m && init?.method === 'PUT') {
      if (o.failPut) return new Response('{"error":"nope"}', { status: 400 });
      const cur = opps.find((x) => x.id === m[1]); Object.assign(cur, body); return Response.json(cur);
    }
    return new Response('{}', { status: 404 });
  }) as typeof fetch;
}
const review = (o: Record<string, unknown> = {}) => ({ deal_temperature: 'hot' as const, close_confidence: 82, pitched: { amount: 2000, period: 'monthly', quote: 'so $2K a month', agreed: true }, ...o });

test('outcome: confidence clamped to the temperature band; value only when the price is quoted from the transcript', () => {
  assert.deepEqual(amountsIn('so $2K a month, or 2,500 later; 3000 once; 1.5k'), [2000, 2500, 3000, 1500]);
  const o = outcomeFromReview(review(), TRANSCRIPT);
  assert.deepEqual([o.confidence, o.value, o.valuePeriod], [80, 2000, 'monthly'], '82 → 80 (rounded to 5), Nick pitched $2K/month, not the $3K default');
  assert.equal(outcomeFromReview(review({ close_confidence: 99, deal_temperature: 'warm' }), TRANSCRIPT).confidence, 60, 'warm caps at 60%');
  assert.equal(outcomeFromReview(review({ close_confidence: undefined, deal_temperature: 'cold' }), TRANSCRIPT).confidence, 15, 'no number: the band default');
  const invented = outcomeFromReview(review({ pitched: { amount: 3000, period: 'monthly', quote: 'it is $3K a month' } }), TRANSCRIPT);
  assert.equal(invented.value, null);
  assert.match(invented.valueNote, /not found word for word/);
  const mismatch = outcomeFromReview(review({ pitched: { amount: 3000, period: 'monthly', quote: 'so $2K a month' } }), TRANSCRIPT);
  assert.equal(mismatch.value, null, 'the quote must say the amount');
  assert.equal(outcomeFromReview(review({ pitched: null }), TRANSCRIPT).value, null);
});

test('plan: only changed fields, old → new; the open opportunity, never a lost one', () => {
  const opp = { confidence: 20, value: 3000, valuePeriod: 'monthly' };
  const { patch, changes } = planChanges(opp, { confidence: 80, value: 2000, valuePeriod: 'monthly', quote: '', valueNote: '' });
  assert.deepEqual(patch, { confidence: 80, value: 2000 });
  assert.deepEqual(changes, [{ field: 'confidence', from: '20%', to: '80%' }, { field: 'value', from: '$3,000', to: '$2,000' }]);
  assert.deepEqual(planChanges({ confidence: 80, value: 2000, valuePeriod: 'monthly' }, { confidence: 80, value: 2000, valuePeriod: 'monthly', quote: '', valueNote: '' }).changes, []);
  assert.equal(pickOpportunity([{ statusType: 'lost', updated: '2026-11-25' } as any, { statusType: 'active', updated: '2026-11-20', id: 'oppo_a' } as any])?.id, 'oppo_a');
  assert.equal(pickOpportunity([{ statusType: 'won', updated: '2026-11-25' } as any]), null);
});

test('close write: only confidence, value (cents) and value_period; anything else refused', () => {
  assert.deepEqual(opportunityBody({ confidence: 80, value: 2000, valuePeriod: 'monthly' }), { confidence: 80, value: 200000, value_period: 'monthly' });
  assert.throws(() => opportunityBody({ status_id: 'x' } as any), /may not change status_id/);
  assert.throws(() => opportunityBody({ confidence: 120 }), /0-100/);
  assert.throws(() => opportunityBody({}), /nothing to change/);
});

test('live gate: cole.close_update in LIVE_STAGES (or DRY_RUN=false), and the job itself live', () => {
  assert.equal(closeUpdateLive({ dryRun: false, cfg: { dryRun: true, liveStages: ['cole.review'] } }), false);
  assert.equal(closeUpdateLive({ dryRun: false, cfg: { dryRun: true, liveStages: ['cole.review', 'cole.close_update'] } }), true);
  assert.equal(closeUpdateLive({ dryRun: true, cfg: { dryRun: true, liveStages: ['cole.close_update'] } }), false);
  assert.equal(closeUpdateLive({ dryRun: false, cfg: { dryRun: false, liveStages: [] } }), true);
});

let db: Db;
const cfg = () => ({ ...loadConfig({ ENGINE_SECRET: 'x'.repeat(40), DATABASE_URL: url ?? 'postgres://x' } as NodeJS.ProcessEnv), airtableApiKey: undefined });
const activity: unknown[][] = [];
const at = { async create(...a: unknown[]) { activity.push(a); return 'recA'; }, async list() { return []; } };
before(async () => { if (!skip) { db = createPool(url!); await migrate(db); } });
after(async () => { if (!skip) await db.end(); });
beforeEach(async () => { activity.length = 0; _resetCloseUpdateTable(); if (!skip) await db.query('DROP TABLE IF EXISTS hq_close_updates'); });

test('Cole → Close: not live = planned (Close only read), then live = one PUT with old → new, logged and on the deal', { skip }, async () => {
  const calls: Call[] = [];
  const close = createCloseClient('k', fakeClose(calls))!;
  const input = { recordingId: 'rec-77', prospect: 'Nick Wendt', emails: ['alex@dulcy.io', 'nick@protekcnc.com'], review: review(), transcript: TRANSCRIPT };
  const planned = await coleUpdateClose({ db, cfg: cfg(), close, live: false, activityAt: at as any }, input);
  assert.equal(planned.status, 'planned');
  assert.match(planned.note, /Would change \(cole.close_update is not in LIVE_STAGES\): confidence 20% → 80%, value \$3,000 → \$2,000/);
  assert.ok(calls.every((c) => c.method === 'GET'), 'not live: nothing written to Close');
  assert.equal(calls[0].query.query, '"nick@protekcnc.com"', 'searched by the prospect email (Dulcy emails skipped)');
  assert.equal(activity.length, 1);
  const live = await coleUpdateClose({ db, cfg: cfg(), close, live: true, activityAt: at as any }, input);
  assert.equal(live.status, 'updated');
  const puts = calls.filter((c) => c.method === 'PUT');
  assert.deepEqual(puts.map((c) => [c.path, c.body]), [['/opportunity/oppo_nick/', { confidence: 80, value: 200000 }]], 'one PUT, only the changed fields, the open opportunity');
  assert.deepEqual(live.changes, [{ field: 'confidence', from: '20%', to: '80%' }, { field: 'value', from: '$3,000', to: '$2,000' }]);
  assert.match(String((activity[1][1] as any)?.fldglUB3EzzQVC3ZO), /Cole updated Close: Protek CNC/);
  const again = await coleUpdateClose({ db, cfg: cfg(), close, live: true, activityAt: at as any }, input);
  assert.deepEqual([again.id, calls.filter((c) => c.method === 'PUT').length], [live.id, 1], 'once per recording');
  const onDeal = await closeUpdatesFor(db, { email: 'nick@protekcnc.com' });
  assert.deepEqual(onDeal.map((x) => [x.status, x.closeUrl]), [['updated', 'https://app.close.com/lead/lead_nick/']]);
  assert.equal((await closeUpdatesFor(db, { closeLead: 'lead_nick' })).length, 1);
  assert.deepEqual(await closeUpdatesFor(db, {}), []);
});

test('Cole → Close: no lead, two leads, no open opportunity, a refused write: nothing changed, said why', { skip }, async () => {
  const calls: Call[] = [];
  const base = { recordingId: 'r1', prospect: 'X', emails: ['x@nowhere.com'], review: review(), transcript: TRANSCRIPT };
  assert.equal((await coleUpdateClose({ db, cfg: cfg(), close: createCloseClient('k', fakeClose(calls, { leads: [] }))!, live: true }, base)).status, 'no_lead');
  const two = [{ id: 'lead_a', display_name: 'A', contacts: [{ emails: [{ email: 'x@nowhere.com' }] }] }, { id: 'lead_b', display_name: 'B', contacts: [{ emails: [{ email: 'x@nowhere.com' }] }] }];
  assert.equal((await coleUpdateClose({ db, cfg: cfg(), close: createCloseClient('k', fakeClose(calls, { leads: two }))!, live: true }, { ...base, recordingId: 'r2' })).status, 'no_lead', 'two leads with the email: not guessed');
  const lostOnly = [{ id: 'oppo_l', lead_id: 'lead_nick', status_type: 'lost', confidence: 0, value: 0, date_updated: '2026-11-20T00:00:00Z' }];
  const r3 = await coleUpdateClose({ db, cfg: cfg(), close: createCloseClient('k', fakeClose(calls, { opps: lostOnly }))!, live: true }, { ...base, recordingId: 'r3', emails: ['nick@protekcnc.com'] });
  assert.deepEqual([r3.status, /never creates one/.test(r3.note)], ['no_opportunity', true]);
  const r4 = await coleUpdateClose({ db, cfg: cfg(), close: createCloseClient('k', fakeClose(calls, { failPut: true }))!, live: true }, { ...base, recordingId: 'r4', emails: ['nick@protekcnc.com'] });
  assert.equal(r4.status, 'failed');
  assert.ok(calls.every((c) => c.method === 'GET' || /^\/opportunity\/oppo_\w+\/$/.test(c.path)), 'only GETs and the one opportunity PUT, ever');
});

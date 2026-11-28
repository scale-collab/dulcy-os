// Close → Airtable Won sync (Alex 2026-11-28: "It should be marked [Won] in Close and then it feeds back
// to Airtable"). Won opportunities in Close → their Sales Data row (contact email, else company; never
// guessed) gets Stage Won, Deal Closed?, Deal Closed Date (and Offer Amount when empty), so the Sales
// Goals rollups count it. Dry run unless sales.won_sync is in LIVE_STAGES. Fake Close + fake Airtable.
import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { createPool, migrate, type Db } from '../src/db/pool.js';
import { loadConfig } from '../src/config.js';
import { createCloseClient } from '../src/providers/close.js';
import { SALES_T, SF } from '../src/hq/sales.js';
import { matchSalesRow, salesRowOf, wonPatch, wonSync, wonSyncView, WON_FIELDS, _resetWonSyncTable, type SalesRow } from '../src/hq/wonSync.js';
import { STAGES } from '../src/stages/index.js';
import { agentsTick, wonSyncOn } from '../src/scheduler.js';

const url = process.env.TEST_DATABASE_URL;
const skip = !url ? 'TEST_DATABASE_URL not set' : false;
const NOW = Date.parse('2026-11-28T15:00:00Z');

const row = (o: Partial<SalesRow> & { id: string }): SalesRow => ({ label: o.id, company: '', emails: [], stage: 'Contract Sent', closed: false, closedDate: '', offer: null, ...o });

test('match: contact email first (Dulcy addresses ignored), then the company; two rows or none = not guessed', () => {
  const rows = [
    row({ id: 'recNick00000000001', label: 'Protek CNC - Nick', company: 'Protek CNC', emails: ['nick@protekcnc.com'] }),
    row({ id: 'recMjj000000000001', label: 'MJJ - Chris', company: 'MJJ Brilliant', emails: ['chris@mjj.com'] }),
    row({ id: 'recMjj000000000002', label: 'MJJ - Chris (rebooked)', company: 'MJJ Brilliant', emails: ['chris@mjj.com'] }),
    row({ id: 'recCart00000000001', label: 'The Marketing Cartel', company: 'The Marketing Cartel', emails: ['wilbur@other.com'] }),
    row({ id: 'recBig000000000001', label: 'BigPxl A', company: 'BigPxl', emails: [] }),
    row({ id: 'recBig000000000002', label: 'BigPxl B', company: 'BigPxl', emails: [] }),
  ];
  const byEmail = matchSalesRow({ name: 'Something Else', emails: ['alex@dulcy.io', 'NICK@protekcnc.com'] }, rows);
  assert.equal(byEmail.kind, 'match');
  assert.deepEqual(byEmail.kind === 'match' && [byEmail.row.id, byEmail.by], ['recNick00000000001', 'email'], 'email wins over the lead name; Dulcy address ignored');
  const byCompany = matchSalesRow({ name: 'The Marketing Cartel', emails: ['someone@cartel.io'] }, rows);
  assert.deepEqual(byCompany.kind === 'match' && [byCompany.row.id, byCompany.by], ['recCart00000000001', 'company'], 'no row has the email: company fallback');
  const twoEmail = matchSalesRow({ name: 'MJJ Brilliant', emails: ['chris@mjj.com'] }, rows);
  assert.equal(twoEmail.kind, 'ambiguous', 'two rows with the email: skipped, not the company fallback either');
  assert.match(twoEmail.kind === 'ambiguous' ? twoEmail.note : '', /2 Sales Data rows have the contact email chris@mjj\.com.*Not guessed/);
  const narrowed = matchSalesRow({ name: 'MJJ', emails: ['chris@mjj.com'] }, rows.map((r) => (r.id === 'recMjj000000000002' ? { ...r, stage: 'Won' } : r)));
  assert.deepEqual(narrowed.kind === 'match' && narrowed.row.id, 'recMjj000000000002', 'several rows, exactly one already Won: that one');
  assert.equal(matchSalesRow({ name: 'BigPxl', emails: [] }, rows).kind, 'ambiguous', 'two rows for the company: skipped');
  assert.equal(matchSalesRow({ name: 'Nobody Inc', emails: ['x@nowhere.com'] }, rows).kind, 'no_match');
  assert.equal(matchSalesRow({ name: 'AB', emails: [] }, [row({ id: 'recAb0000000000001', company: 'AB' })]).kind, 'no_match', 'a 2-letter name is too short to match a company');
  assert.deepEqual(salesRowOf({ id: 'recX', fields: { [SF.email]: 'A@x.com, b@y.com', [SF.stage]: 'Won', [SF.closed]: true, [SF.offer]: 2000 } }), { id: 'recX', label: 'recX', company: '', emails: ['a@x.com', 'b@y.com'], stage: 'Won', closed: true, closedDate: '', offer: 2000 });
});

test('patch: only the Won fields, only what is missing; an existing date or amount is never changed; already Won = nothing', () => {
  const opp = { won: '2026-10-06', value: 2000, valuePeriod: 'monthly' };
  const full = wonPatch(row({ id: 'r1' }), opp);
  assert.deepEqual(full.fields, { [WON_FIELDS.stage]: 'Won', [WON_FIELDS.closed]: true, [WON_FIELDS.closedDate]: '2026-10-06', [WON_FIELDS.offer]: 2000 });
  assert.deepEqual(Object.keys(full.fields).sort(), [SF.stage, SF.closed, SF.closedDate, SF.offer].sort(), 'Stage, Deal Closed?, Deal Closed Date, Offer Amount: nothing else');
  assert.deepEqual(full.changes.map((c) => c.field), ['Sales Pipeline Stage', 'Deal Closed?', 'Deal Closed Date', 'Offer Amount (Revenue Closed)']);
  const kept = wonPatch(row({ id: 'r2', stage: 'Won', closedDate: '2026-10-01', offer: 1500 }), opp);
  assert.deepEqual(kept.fields, { [WON_FIELDS.closed]: true }, 'stage Won but Deal Closed? unticked: tick it; date and amount kept');
  assert.deepEqual(wonPatch(row({ id: 'r3', stage: 'Won', closed: true, closedDate: '2026-10-06', offer: 2000 }), opp).changes, [], 'already Won: no write');
  const annual = wonPatch(row({ id: 'r4' }), { won: '2026-10-06', value: 24000, valuePeriod: 'annual' });
  assert.equal(annual.fields[WON_FIELDS.offer], undefined);
  assert.match(annual.notes.join(' '), /annual, not monthly or one-time/);
  const noDate = wonPatch(row({ id: 'r5' }), { won: '', value: null, valuePeriod: '' });
  assert.equal(noDate.fields[WON_FIELDS.closedDate], undefined);
  assert.match(noDate.notes.join(' '), /no won date/);
});

// ---------- fakes ----------
type Call = { method: string; path: string; query: Record<string, string> };
const OPPS = [
  { id: 'oppo_nick', lead_id: 'lead_nick', status_type: 'won', status_label: 'Won', value: 200000, value_period: 'monthly', date_won: '2026-11-20', date_updated: '2026-11-20T10:00:00Z' },
  { id: 'oppo_mjj', lead_id: 'lead_mjj', status_type: 'won', status_label: 'Won', value: 300000, value_period: 'monthly', date_won: '2026-10-06', date_updated: '2026-10-06T10:00:00Z' },
  { id: 'oppo_done', lead_id: 'lead_done', status_type: 'won', status_label: 'Won', value: 100000, value_period: 'monthly', date_won: '2026-09-02', date_updated: '2026-09-02T10:00:00Z' },
  { id: 'oppo_open', lead_id: 'lead_nick', status_type: 'active', status_label: 'Call Done', value: 0, date_updated: '2026-11-21T10:00:00Z' },
];
const LEADS: Record<string, any> = {
  lead_nick: { id: 'lead_nick', display_name: 'Protek CNC', contacts: [{ name: 'Nick', emails: [{ email: 'Nick@ProtekCNC.com' }] }] },
  lead_mjj: { id: 'lead_mjj', display_name: 'MJJ Brilliant', contacts: [{ name: 'Chris', emails: [{ email: 'chris@mjj.com' }] }] },
  lead_done: { id: 'lead_done', display_name: 'Collabor', contacts: [{ name: 'Jordan', emails: [{ email: 'jordan@collabor.com' }] }] },
};
function fakeClose(calls: Call[], opps = OPPS) {
  return (async (u: string | URL, init?: RequestInit) => {
    const q = new URL(String(u));
    calls.push({ method: String(init?.method ?? 'GET'), path: q.pathname.replace('/api/v1', ''), query: Object.fromEntries(q.searchParams) });
    if (q.pathname.endsWith('/opportunity/')) return Response.json({ data: opps.filter((o) => !q.searchParams.get('status_type') || o.status_type === q.searchParams.get('status_type')), has_more: false });
    const m = q.pathname.match(/\/lead\/(lead_\w+)\/$/);
    if (m && LEADS[m[1]]) return Response.json(LEADS[m[1]]);
    return new Response('{}', { status: 404 });
  }) as typeof fetch;
}
function fakeAirtable() {
  const records = [
    { id: 'recNick00000000001', fields: { [SF.opp]: 'Protek CNC - Nick', [SF.company]: 'Protek CNC', [SF.email]: 'nick@protekcnc.com', [SF.stage]: 'Contract Sent', [SF.notes]: 'keep me' } as Record<string, unknown> },
    { id: 'recMjj000000000001', fields: { [SF.opp]: 'MJJ - Chris', [SF.company]: 'MJJ Brilliant', [SF.email]: 'chris@mjj.com', [SF.stage]: 'Call Done' } as Record<string, unknown> },
    { id: 'recMjj000000000002', fields: { [SF.opp]: 'MJJ - Chris (rebooked)', [SF.company]: 'MJJ Brilliant', [SF.email]: 'chris@mjj.com', [SF.stage]: 'Follow Up Call' } as Record<string, unknown> },
    { id: 'recColl00000000001', fields: { [SF.opp]: 'Collabor - Jordan', [SF.company]: 'Collabor', [SF.email]: 'jordan@collabor.com', [SF.stage]: 'Won', [SF.closed]: true, [SF.closedDate]: '2026-09-02', [SF.offer]: 1000 } as Record<string, unknown> },
  ];
  const updates: { table: string; id: string; fields: Record<string, unknown> }[] = [];
  const created: { table: string; fields: Record<string, unknown> }[] = [];
  const at = {
    async list(table: string, _f: string, fields: string[]) {
      assert.equal(table, SALES_T);
      return records.map((r) => ({ id: r.id, fields: Object.fromEntries(Object.entries(r.fields).filter(([k]) => fields.includes(k))) }));
    },
    async update(table: string, id: string, fields: Record<string, unknown>) { updates.push({ table, id, fields }); Object.assign(records.find((r) => r.id === id)!.fields, fields); },
    async create(table: string, fields: Record<string, unknown>) { created.push({ table, fields }); return 'recActivity0000001'; },
  };
  return { at, records, updates, created };
}

let db: Db;
const cfg = (env: Record<string, string> = {}) => ({ ...loadConfig({ ENGINE_SECRET: 'x'.repeat(40), DATABASE_URL: url ?? 'postgres://x', ...env } as NodeJS.ProcessEnv), airtableApiKey: undefined });
before(async () => { if (!skip) { db = createPool(url!); await migrate(db); } });
after(async () => { if (!skip) await db.end(); });
beforeEach(async () => { _resetWonSyncTable(); if (!skip) { await db.query('DROP TABLE IF EXISTS hq_won_sync'); await db.query(`DELETE FROM jobs WHERE kind='sales.won_sync'`); } });

test('dry run: "would mark Won" with the matches; Close only read, Airtable never written, no Activity Log', { skip }, async () => {
  const calls: Call[] = []; const f = fakeAirtable();
  const r = await wonSync({ db, cfg: cfg(), close: createCloseClient('k', fakeClose(calls))!, at: f.at, live: false, now: NOW, activityAt: f.at as any });
  assert.deepEqual([r.dryRun, r.read, r.planned, r.marked, r.already, r.skipped], [true, 3, 1, 0, 1, 1], 'the open opportunity is not read as won');
  assert.match(r.message, /3 won in Close, 1 would be marked Won \(dry run\), 1 already Won, 1 skipped/);
  assert.ok(r.lines.some((l) => /Protek CNC: would mark Won "Protek CNC - Nick" \(Sales Pipeline Stage Contract Sent → Won, Deal Closed\? unticked → ticked, Deal Closed Date empty → 2026-11-20, Offer Amount \(Revenue Closed\) empty → \$2,000\)/.test(l)));
  assert.deepEqual(f.updates, []); assert.deepEqual(f.created, []);
  assert.ok(calls.every((c) => c.method === 'GET'), 'Close is never written');
  const q = calls.find((c) => c.path === '/opportunity/')!.query;
  assert.deepEqual([q.status_type, q._order_by, q._limit, q.date_updated__gte], ['won', '-date_updated', '100', new Date(NOW - 180 * 86_400_000).toISOString()], 'won, recently updated, bounded');
  const st = (await db.query(`SELECT opp_id, status, record_id FROM hq_won_sync ORDER BY opp_id`)).rows.map((x) => [x.opp_id, x.status, x.record_id]);
  assert.deepEqual(st, [['oppo_done', 'already', 'recColl00000000001'], ['oppo_mjj', 'ambiguous', ''], ['oppo_nick', 'planned', 'recNick00000000001']]);
  const view = (await wonSyncView(db, { ...cfg(), closeApiKey: 'k' }, '2026-11'))!;
  assert.deepEqual([view.live, view.planned, view.marked], [false, 1, 0]);
  assert.equal(view.text, 'Not switched on yet: 1 deal would be marked Won from Close, 1 already Won, 1 skipped.');
  assert.deepEqual(view.skipped.map((x) => [x.leadName, x.status, x.fix.agent]), [['MJJ Brilliant', 'ambiguous', 'Cole']]);
  assert.match(view.skipped[0].fix.title, /^Won in Close, not marked Won in Sales Data: MJJ Brilliant$/);
  assert.match(view.skipped[0].fix.detail, /2 Sales Data rows have the contact email chris@mjj\.com/);
  assert.equal(await wonSyncView(db, { ...cfg(), closeApiKey: undefined }, '2026-11'), null, 'no Close: nothing shown');
});

test('live: only the matched row, only the Won fields; one Activity Log row (Cole) per change; a second run writes nothing', { skip }, async () => {
  const calls: Call[] = []; const f = fakeAirtable();
  const close = createCloseClient('k', fakeClose(calls))!;
  await wonSync({ db, cfg: cfg(), close, at: f.at, live: false, now: NOW, activityAt: f.at as any }); // planned first
  const r = await wonSync({ db, cfg: cfg(), close, at: f.at, live: true, now: NOW, jobId: 7, activityAt: f.at as any });
  assert.deepEqual([r.dryRun, r.marked, r.already, r.skipped], [false, 1, 1, 1]);
  assert.deepEqual(f.updates, [{ table: SALES_T, id: 'recNick00000000001', fields: { [SF.stage]: 'Won', [SF.closed]: true, [SF.closedDate]: '2026-11-20', [SF.offer]: 2000 } }], 'one write; the ambiguous MJJ rows and the already-Won Collabor row untouched');
  assert.equal(f.records[0].fields[SF.notes], 'keep me', 'other fields unchanged');
  assert.equal(f.created.length, 1);
  assert.match(String(f.created[0].fields.fldglUB3EzzQVC3ZO), /^Cole marked Won from Close: Protek CNC$/);
  assert.equal(f.created[0].fields.fldAOwjBYPCrHZmCS, 'Cole');
  assert.ok(calls.every((c) => c.method === 'GET'));
  const again = await wonSync({ db, cfg: cfg(), close, at: f.at, live: true, now: NOW, activityAt: f.at as any });
  assert.deepEqual([again.marked, f.updates.length, f.created.length], [0, 1, 1], 'idempotent: no second write, no second log');
  assert.equal(again.read - again.already, 1, 'only the ambiguous one is looked at again');
  const st = (await db.query(`SELECT status, marked_at IS NOT NULL AS m, jsonb_array_length(changes) AS n FROM hq_won_sync WHERE opp_id='oppo_nick'`)).rows[0];
  assert.deepEqual([st.status, st.m, Number(st.n)], ['marked', true, 4], 'stays "marked" with its changes');
  // Close updated again later (e.g. a note): re-checked, found already Won, still "marked", still no write.
  const later = OPPS.map((o) => (o.id === 'oppo_nick' ? { ...o, date_updated: '2026-11-27T10:00:00Z' } : o));
  const r3 = await wonSync({ db, cfg: cfg(), close: createCloseClient('k', fakeClose(calls, later))!, at: f.at, live: true, now: NOW, activityAt: f.at as any });
  assert.deepEqual([r3.marked, f.updates.length], [0, 1]);
  assert.equal((await db.query(`SELECT status FROM hq_won_sync WHERE opp_id='oppo_nick'`)).rows[0].status, 'marked');
  const view = (await wonSyncView(db, { ...cfg(), closeApiKey: 'k', liveStages: ['sales.won_sync'] }, '2026-11'))!;
  assert.equal(view.text, '1 deal marked Won from Close (1 this month), 1 already Won, 1 skipped.');
});

test('a refused Airtable write = failed, said why; no Activity Log', { skip }, async () => {
  const f = fakeAirtable();
  const r = await wonSync({ db, cfg: cfg(), close: createCloseClient('k', fakeClose([]))!, at: f.at, live: true, now: NOW, activityAt: f.at as any, write: async () => { throw new Error('Airtable refused the request: HTTP 422'); } });
  assert.deepEqual([r.marked, r.failed, f.created.length], [0, 1, 0]);
  assert.match((await db.query(`SELECT note FROM hq_won_sync WHERE opp_id='oppo_nick'`)).rows[0].note, /Airtable did not take the change: Airtable refused the request: HTTP 422/);
});

test('stage and schedule: sales.won_sync every 30 min with Close + Airtable; dry run unless in LIVE_STAGES', { skip }, async () => {
  assert.ok(STAGES['sales.won_sync'], 'registered');
  const base = { ...cfg(), closeApiKey: 'k', airtableApiKey: 'pat', hqSessionSecret: undefined, atlasOn: false, atlasCampaignsOn: false, rileyOn: false, coleOn: false, siennaOn: false };
  assert.equal(base.wonSyncEveryMin, 30);
  assert.equal(wonSyncOn({ ...base, closeApiKey: undefined }), false);
  assert.equal(wonSyncOn({ ...base, wonSyncEveryMin: 0 }), false);
  const now = new Date(NOW);
  assert.equal(await agentsTick(db, base as any, now), 1);
  assert.equal(await agentsTick(db, base as any, now), 0, 'one job per 30-minute slot');
  const j = (await db.query(`SELECT dry_run, request_id FROM jobs WHERE kind='sales.won_sync'`)).rows;
  assert.deepEqual(j.map((x) => [x.dry_run, x.request_id]), [[true, `won-sync:${Math.floor(NOW / 1_800_000)}`]]);
  await db.query(`DELETE FROM jobs WHERE kind='sales.won_sync'`);
  assert.equal(await agentsTick(db, { ...base, liveStages: ['sales.won_sync'] } as any, new Date(NOW + 1_800_000)), 1);
  assert.equal((await db.query(`SELECT dry_run FROM jobs WHERE kind='sales.won_sync'`)).rows[0].dry_run, false, 'live once in LIVE_STAGES');
  await db.query(`DELETE FROM jobs WHERE kind='sales.won_sync'`);
});

test('the stage end to end (JobContext): dry run reads only; in LIVE_STAGES it PATCHes the one Sales Data row (receipted) and logs it', { skip }, async () => {
  const { JobContext } = await import('../src/context.js');
  const { enqueue } = await import('../src/queue.js');
  const calls: Call[] = []; const close = fakeClose(calls); const f = fakeAirtable();
  const atCalls: { method: string; path: string; body: any }[] = [];
  const real = globalThis.fetch;
  globalThis.fetch = (async (u: string | URL, init?: RequestInit) => {
    const q = new URL(String(u));
    if (q.hostname === 'api.close.com') return close(u, init);
    const method = String(init?.method ?? 'GET');
    const body = init?.body ? JSON.parse(String(init.body)) : null;
    atCalls.push({ method, path: q.pathname, body });
    if (q.pathname.endsWith(`/${SALES_T}`) && method === 'GET') return Response.json({ records: await f.at.list(SALES_T, '', q.searchParams.getAll('fields[]')) });
    if (q.pathname.endsWith(`/${SALES_T}`) && method === 'PATCH') { for (const r of body.records) await f.at.update(SALES_T, r.id, r.fields); return Response.json({ records: body.records }); }
    if (method === 'POST') return Response.json({ records: [{ id: 'recActivity0000001' }] });
    return new Response('{}', { status: 404 });
  }) as typeof fetch;
  try {
    const base = { ...cfg(), closeApiKey: 'k', airtableApiKey: 'pat', airtableBaseUrl: 'https://airtable.test' };
    const q1 = await enqueue(db, { kind: 'sales.won_sync', recordId: 'sales-won_sync', input: {}, dryRun: true, maxAttempts: 2, deadlineMs: 60_000 });
    const dry = await STAGES['sales.won_sync'].run(new JobContext(db, base, q1.job));
    assert.deepEqual([dry.dryRun, dry.planned, dry.marked], [true, 1, 0]);
    assert.ok(atCalls.every((c) => c.method === 'GET'), 'dry run: Airtable only read');
    await db.query(`UPDATE jobs SET status='succeeded' WHERE id=$1`, [q1.job.id]);
    const q2 = await enqueue(db, { kind: 'sales.won_sync', recordId: 'sales-won_sync', input: {}, dryRun: false, maxAttempts: 2, deadlineMs: 60_000 });
    const out = await STAGES['sales.won_sync'].run(new JobContext(db, { ...base, liveStages: ['sales.won_sync'] }, q2.job));
    assert.deepEqual([out.dryRun, out.marked], [false, 1]);
    const patches = atCalls.filter((c) => c.method === 'PATCH');
    assert.deepEqual(patches.map((c) => [c.path.endsWith(SALES_T), c.body.records.map((r: any) => [r.id, Object.keys(r.fields).sort()])]), [[true, [['recNick00000000001', [SF.stage, SF.closed, SF.closedDate, SF.offer].sort()]]]]);
    const logs = atCalls.filter((c) => c.method === 'POST');
    assert.equal(logs.length, 1, 'one Activity Log row');
    assert.equal(logs[0].body.records[0].fields.fldAOwjBYPCrHZmCS, 'Cole');
    assert.equal((await db.query(`SELECT status FROM receipts WHERE receipt_key=$1`, [`${q2.job.id}:airtable:won:oppo_nick:recNick00000000001`])).rows[0]?.status, 'done', 'the write is receipted');
    assert.ok(calls.every((c) => c.method === 'GET'), 'Close never written');
    await db.query(`UPDATE jobs SET status='succeeded' WHERE id=$1`, [q2.job.id]);
    const view = (await wonSyncView(db, { ...base, liveStages: ['sales.won_sync'] }, '2026-11'))!;
    assert.ok(view.lastRun, 'last run from the succeeded jobs');
  } finally { globalThis.fetch = real; await db.query(`DELETE FROM jobs WHERE kind='sales.won_sync'`); }
});

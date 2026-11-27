// Echo books the agreed time itself (Alex 2026-11-27). Fakes only: Airtable, Claude, EmailBison and
// the calendar service are local servers; no real Google or Calendly call is made.
import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createPool, migrate, type Db } from '../src/db/pool.js';
import { loadConfig, type Config } from '../src/config.js';
import { enqueue, getJob } from '../src/queue.js';
import { runOnce } from '../src/worker.js';
import { createAirtableClient } from '../src/providers/airtable.js';
import { repliesTick } from '../src/agents/replies.js';
import { EMAILS, EF, RA, BK, SETTINGS, REPLY_LEARNING } from '../src/agents/emailsFields.js';
import { DECISIONS, DF } from '../src/decisions/fields.js';
import { ACTIVITY, AF } from '../src/activity.js';
import { rememberOffered } from '../src/agents/calendar.js';
import { zonedToUtc, utcToZoned, fmtBooked, fmtCard, pickSlot, slotAllowed, namedWeekdays, bookingKey, confirmationText, bookedLine } from '../src/agents/booking.js';
import { toRow } from '../src/hq/inbox.js';
import { startFakeBison, type FakeBison } from './fakes/bison.js';

const url = process.env.TEST_DATABASE_URL;
const skip = !url ? 'TEST_DATABASE_URL not set' : false;
const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const WS_A = 'recWSAAAAAAAAAAAA', WS_B = 'recWSBBBBBBBBBBBB', ROW = 'recEMAIL000000001';
const NY = 'America/New_York';
const OFFICE = { tz: NY, start: '09:00', end: '17:00', noWeekends: true, noHolidays: true };

/** The next Wednesday at least 2 days out, at 3:00 PM New York time (always inside 9-5 and 30 days). */
function nextWednesday3pm(from = Date.now()): string {
  for (let d = 2; d < 10; d++) {
    const day = utcToZoned(new Date(from + d * 86_400_000).toISOString(), NY).slice(0, 10);
    const iso = zonedToUtc(`${day}T15:00`, NY)!;
    if (new Date(iso).toLocaleDateString('en-US', { timeZone: NY, weekday: 'long' }) === 'Wednesday') return iso;
  }
  throw new Error('no Wednesday');
}

test('time zones and labels: wall time ↔ instant, "Wednesday, Dec 3 at 5:00 PM ET"', () => {
  assert.equal(zonedToUtc('2026-12-03T17:00', NY), '2026-12-03T22:00:00.000Z');
  assert.equal(zonedToUtc('2026-07-01T17:00', NY), '2026-07-01T21:00:00.000Z', 'summer time');
  assert.equal(zonedToUtc('2026-12-03T17:00', 'America/Los_Angeles'), '2026-12-04T01:00:00.000Z');
  assert.equal(zonedToUtc('2026-03-08T02:30', NY), null, 'a time that does not exist (DST gap)');
  assert.equal(zonedToUtc('2026-02-30T10:00', NY), null);
  assert.equal(zonedToUtc('next wednesday', NY), null);
  assert.equal(utcToZoned('2026-12-03T22:00:00.000Z', NY), '2026-12-03T17:00');
  assert.equal(fmtBooked('2026-12-03T22:00:00.000Z', NY), 'Thursday, Dec 3 at 5:00 PM ET');
  assert.equal(fmtCard('2026-12-02T22:00:00.000Z', NY), 'Wed Dec 2, 5:00 PM ET');
  assert.equal(fmtCard('2026-12-02T22:00:00.000Z', 'America/Los_Angeles'), 'Wed Dec 2, 2:00 PM PT');
  assert.equal(confirmationText('Jane Doe', 'Wednesday, Dec 2 at 5:00 PM ET', 'google'), "Hi Jane,\n\nYou're all set for Wednesday, Dec 2 at 5:00 PM ET. A calendar invite with the video link is on its way.");
  assert.match(bookingKey(ROW, '2026-11-27T15:00:00.000Z', '2026-12-02T22:00:00.000Z'), /^[A-Za-z0-9_:.-]{8,200}$/, 'the service accepts the key');
});

test('pickSlot: one exact, allowed time or a reason; vague never books', () => {
  const now = new Date('2026-11-30T17:00:00Z'); // Mon Nov 30, noon ET
  const base = { tz: NY, offered: ['2026-12-02T20:00:00.000Z'], office: OFFICE, now };
  assert.deepEqual(pickSlot({ ...base, choice: 'accepts_offered', chosenLocal: '2026-12-02T15:00', prospectText: 'Wednesday at 3 works!' }), { kind: 'slot', start: '2026-12-02T20:00:00.000Z', offered: true });
  assert.deepEqual(pickSlot({ ...base, choice: 'proposes_time', chosenLocal: '2026-12-03T10:30', prospectText: 'Could we do Thursday 10:30 instead?' }), { kind: 'slot', start: '2026-12-03T15:30:00.000Z', offered: false });
  assert.equal(pickSlot({ ...base, choice: 'vague', chosenLocal: '', prospectText: 'sometime next week' }).kind, 'none');
  assert.equal(pickSlot({ ...base, choice: 'none', chosenLocal: '2026-12-02T15:00', prospectText: 'ok' }).kind, 'none');
  const r = (chosenLocal: string, prospectText: string) => pickSlot({ ...base, choice: 'proposes_time', chosenLocal, prospectText });
  assert.match(String((r('2026-12-02T15:00', 'Thursday at 3 works') as any).why), /day they named/, 'Wednesday date for a "Thursday" message');
  assert.match(String((r('2026-12-05T11:00', 'Saturday 11?') as any).why), /weekend/);
  assert.match(String((r('2026-12-25T11:00', 'Friday the 25th at 11') as any).why), /holiday/);
  assert.match(String((r('2026-12-02T17:00', 'Wednesday at 5 PM') as any).why), /office hours/, '5 PM start ends after a 17:00 day');
  assert.match(String((r('2027-01-06T11:00', 'Wednesday Jan 6 at 11') as any).why), /30 days/);
  assert.match(String((r('2026-11-30T12:30', 'today 12:30?') as any).why), /too soon/);
  assert.equal(r('garbage', 'Wednesday').kind, 'retime');
  assert.ok(slotAllowed({ ...OFFICE, end: '18:00' }, '2026-12-02T22:00:00.000Z', now).ok, 'a client open until 6 PM takes 5 PM');
  assert.ok(slotAllowed({ ...OFFICE, noWeekends: false }, '2026-12-05T16:00:00.000Z', now).ok, 'weekends allowed when the client allows them');
  assert.deepEqual(namedWeekdays('Wed works\n\nOn Mon, Nov 30, Alex wrote:\n> Tuesday or Thursday?'), [3], 'quoted history is ignored');
});

// ---------- The full loop ----------
let db: Db, bison: FakeBison;
let atServer: http.Server, claudeServer: http.Server, calServer: http.Server, atUrl = '', claudeUrl = '', calUrl = '';
let tables: Record<string, Record<string, Record<string, unknown>>>;
let claudeAnswers: Record<string, unknown>[];
let cal: { status: Record<string, { status: string; canBook: boolean; provider: string }>; free: string[]; book: (b: any) => any; calls: { path: string; auth: string; body: any }[] };

function cfg(over: Partial<Config> = {}): Config {
  return { ...loadConfig({ ENGINE_SECRET: 'x'.repeat(40), DATABASE_URL: url ?? 'postgres://x' } as NodeJS.ProcessEnv),
    airtableApiKey: 'at', airtableBaseUrl: atUrl, anthropicApiKey: 'sk-test', anthropicBaseUrl: claudeUrl, knowledgeDir: REPO,
    emailBisonKeys: { dulcy: bison.key }, emailBisonBaseUrl: bison.url, replySenderOn: true,
    calendarUrl: calUrl, calendarReaderToken: 'r'.repeat(40), calendarBookerToken: 'b'.repeat(40),
    dryRun: false, liveStages: ['sean.draft', 'calendar.book', 'reply.send'], ...over };
}
const at = () => createAirtableClient({ apiKey: 'at', baseId: 'appxqINt5XKw7a76A', baseUrl: atUrl });
async function settle(conf: Config) { for (let i = 0; i < 12; i++) await runOnce(db, conf); }
async function draft(conf: Config) {
  const q = await enqueue(db, { kind: 'sean.draft', recordId: 'sean', input: {}, dryRun: false, maxAttempts: 3, deadlineMs: 60_000 });
  for (let i = 0; i < 10; i++) { await runOnce(db, conf); const j = await getJob(db, q.job.id); if (['succeeded', 'failed', 'needs_review'].includes(j!.job.status)) return j!; }
  throw new Error('job did not settle');
}
const jobs = async (kind: string) => (await db.query(`SELECT status, error, result FROM jobs WHERE kind=$1 ORDER BY id`, [kind])).rows;
const policy = () => JSON.parse(String(tables[EMAILS][ROW][RA.policy] ?? '{}'));

function thread(over: Record<string, unknown> = {}) {
  return {
    [EF.leadName]: 'Jane Doe', [EF.leadEmail]: 'jane@acme.com', [EF.company]: 'Acme', [EF.subject]: 'Re: idea', [EF.workspace]: '66', [EF.replyId]: '555', [EF.replyUuid]: 'uuid-1',
    [EF.latestReplyAt]: new Date(Date.now() - 3_600_000).toISOString(), [EF.latestReply]: 'Yes, Wednesday at 3 works.', [EF.history]: 'Us: Tue or Wed?\nJane: Yes, Wednesday at 3 works.',
    [EF.lastSent]: 'Last Email Sent By Prospect', [EF.leadStatus]: 'Interested', [EF.stage]: 'In Conversation', [RA.clients]: [WS_A], ...over,
  };
}
const answer = (start: string, over: Record<string, unknown> = {}) => ({
  action: 'reply', intent: 'Meeting Request', reason: 'picked an offered time', they_said: 'Wednesday at 3 works', confidence: 95, follow_up_on: '',
  draft: 'Hi Jane,\n\nThat time just got taken. Would Thu 10:00 AM or Fri 11:00 AM ET work instead?', question_for_alex: '',
  time_choice: 'accepts_offered', chosen_time: utcToZoned(start, NY), ...over,
});

function matchStatuses(f: string) { return [...f.matchAll(/\{Status\}='(\w+)'/g)].map((m) => m[1]); }
before(async () => {
  bison = await startFakeBison();
  atServer = http.createServer((req, res) => {
    const u = new URL(req.url ?? '/', 'http://x'); const table = u.pathname.split('/')[3];
    const rows = (tables[table] ??= {});
    res.setHeader('content-type', 'application/json');
    if (req.method === 'GET') {
      const f = u.searchParams.get('filterByFormula') ?? '';
      let out = Object.entries(rows);
      const ids = [...f.matchAll(/RECORD_ID\(\)='(rec\w+)'/g)].map((m) => m[1]);
      if (ids.length) out = out.filter(([id]) => ids.includes(id));
      else if (table === EMAILS) {
        if (/Human Action\}='Approve Draft'/.test(f)) out = out.filter(([, r]) => ['Approve Draft', 'Send Edited Reply'].includes(String(r[RA.humanAction])) && !['Sent', 'Sending', 'Suppressed', 'Thread Complete'].includes(String(r[RA.state])));
        else if (/Human Action\}='Skip'/.test(f)) out = out.filter(([, r]) => r[RA.humanAction] === 'Skip');
        else if (/Last Email Sent By Prospect/.test(f)) out = out.filter(([, r]) => r[EF.lastSent] === 'Last Email Sent By Prospect' && r[EF.stage] !== 'Booked Meeting');
        else out = [];
      } else if (table === SETTINGS) {
        const ws = /\{Workspace Record ID\}='(rec\w+)'/.exec(f)?.[1];
        out = out.filter(([, r]) => r['Workspace Record ID'] === ws);
      } else if (table === DECISIONS) {
        const er = /\{Emails Record\}='(rec\w+)'/.exec(f)?.[1], st = matchStatuses(f);
        out = out.filter(([, r]) => (!er || r[DF.emailsRecord] === er) && (!/\{Emails Record\}!=''/.test(f) || !!r[DF.emailsRecord]) && (!st.length || st.includes(String(r[DF.status]))));
      } else out = [];
      return res.end(JSON.stringify({ records: out.map(([id, fields]) => ({ id, fields })) }));
    }
    let body = ''; req.on('data', (c) => (body += c));
    req.on('end', () => {
      const b = JSON.parse(body);
      res.end(JSON.stringify({ records: b.records.map((r: any) => {
        if (req.method === 'PATCH') { Object.assign(rows[r.id] ??= {}, r.fields); return r; }
        const id = `recNew${String(Object.keys(rows).length).padStart(11, '0')}`; rows[id] = { ...r.fields }; return { id, fields: r.fields };
      }) }));
    });
  });
  claudeServer = http.createServer((req, res) => {
    let body = ''; req.on('data', (c) => (body += c));
    req.on('end', () => {
      const a = claudeAnswers.shift() ?? { action: 'skip', intent: 'Other', reason: 'none', they_said: '', draft: '', question_for_alex: '' };
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify({ id: 'msg_1', type: 'message', role: 'assistant', model: 'claude-opus-5-5', content: [{ type: 'text', text: JSON.stringify(a) }], stop_reason: 'end_turn', stop_details: null, usage: { input_tokens: 10, output_tokens: 10 } }));
    });
  });
  // Fake calendar service: the three routes the engine calls.
  calServer = http.createServer((req, res) => {
    let body = ''; req.on('data', (c) => (body += c));
    req.on('end', () => {
      const b = JSON.parse(body || '{}'), p = new URL(req.url ?? '/', 'http://x').pathname;
      cal.calls.push({ path: p, auth: String(req.headers.authorization ?? ''), body: b });
      res.setHeader('content-type', 'application/json');
      if (p === '/calendar/admin/status') return res.end(JSON.stringify({ workspaceId: b.workspace, ...(cal.status[b.workspace] ?? { status: 'Not Connected', canBook: false, provider: null }) }));
      if (p === '/calendar/admin/availability') {
        if (cal.status[b.workspace]?.status !== 'Connected') { res.statusCode = 400; return res.end(JSON.stringify({ error: 'Calendar is not connected' })); }
        return res.end(JSON.stringify({ collection: cal.free.filter((s) => s >= b.start && s < b.end).map((s) => ({ start_time: s, status: 'available' })), connection: { timezone: NY } }));
      }
      if (p === '/calendar/admin/book') {
        if (req.headers.authorization !== `Bearer ${'b'.repeat(40)}`) { res.statusCode = 403; return res.end(JSON.stringify({ error: 'Booking credential required' })); }
        return res.end(JSON.stringify(cal.book(b)));
      }
      res.statusCode = 404; res.end('{}');
    });
  });
  for (const s of [atServer, claudeServer, calServer]) await new Promise<void>((r) => s.listen(0, r));
  atUrl = `http://127.0.0.1:${(atServer.address() as any).port}`; claudeUrl = `http://127.0.0.1:${(claudeServer.address() as any).port}`; calUrl = `http://127.0.0.1:${(calServer.address() as any).port}`;
  if (!skip) { db = createPool(url!); await migrate(db); }
});
after(async () => { bison.close(); atServer.close(); claudeServer.close(); calServer.close(); if (!skip) await db.end(); });
beforeEach(async () => {
  tables = { [EMAILS]: {}, [DECISIONS]: {}, [ACTIVITY]: {}, [REPLY_LEARNING]: {}, [SETTINGS]: {
    recSetA: { 'Workspace Record ID': WS_A, Enabled: true, 'Calendar Settings JSON': '{}', Timezone: NY, 'Office Start': '09:00', 'Office End': '17:00', 'Exclude Weekends': true },
  } };
  claudeAnswers = [];
  cal = { status: { [WS_A]: { status: 'Connected', canBook: true, provider: 'google' } }, free: [], calls: [],
    book: (b) => ({ booked: true, provider: 'google', eventId: 'evt123', htmlLink: 'https://calendar.google.com/event?eid=evt123', meetLink: 'https://meet.google.com/abc-defg-hij', start: b.start, end: null, timezone: b.tz, location: 'Google Meet' }) };
  (bison as any).repliesSent = []; (bison as any).threads = { 555: { current_reply: { id: 555, from_email_address: 'jane@acme.com', from_name: 'Jane', sender_email_id: 77 }, older_messages: [], newer_messages: [] } };
  if (!skip) await db.query('TRUNCATE jobs, steps, receipts, events, sean_drafts, offered_slots, hq_asks RESTART IDENTITY CASCADE');
});

test('approval client: "Wednesday at 3 works" → ONE card; approve books first, then sends the confirmation; recorded like a booked meeting', { skip }, async () => {
  const wed = nextWednesday3pm();
  tables[EMAILS][ROW] = thread();
  await rememberOffered(db, WS_A, [wed, new Date(Date.parse(wed) + 86_400_000).toISOString()], ROW);
  cal.free = [wed];
  claudeAnswers = [answer(wed)];
  const conf = cfg();
  const j = await draft(conf);
  assert.equal(j.job.status, 'succeeded', j.job.error ?? '');
  const label = fmtCard(wed, NY), long = fmtBooked(wed, NY);
  const row = tables[EMAILS][ROW];
  assert.equal(row[RA.draft], `Hi Jane,\n\nYou're all set for ${long}. A calendar invite with the video link is on its way.`);
  assert.equal(row[RA.state], 'Needs Approval');
  assert.equal(row[RA.humanAction], 'None', 'approval required (the default): nothing books by itself');
  assert.equal(policy().booking.status, 'pending');
  assert.equal(policy().booking.wsRec, WS_A);
  assert.equal(policy().booking.offered, true);
  assert.match(policy().booking.fallbackDraft, /just got taken/);
  const cards = Object.values(tables[DECISIONS]);
  assert.equal(cards.length, 1, 'one card');
  assert.equal(cards[0][DF.title], `Book ${label} + send confirmation: Jane Doe at Acme`);
  assert.equal(cards[0][DF.action], 'Approve Reply');
  assert.ok(cal.calls.some((c) => c.path === '/calendar/admin/availability' && c.body.start === wed), 'checked live at draft time');
  assert.equal(cal.calls.filter((c) => c.path === '/calendar/admin/book').length, 0, 'nothing booked before the approve');

  // One approve (Airtable / Slack / HQ all press the same Human Action).
  row[RA.humanAction] = 'Approve Draft';
  const t = await repliesTick(db, conf, at(), null);
  assert.equal(t.queued, 1);
  assert.equal((await jobs('reply.send')).length, 0, 'the send waits for the booking');
  await settle(conf);
  const books = cal.calls.filter((c) => c.path === '/calendar/admin/book');
  assert.equal(books.length, 1);
  assert.equal(books[0].body.workspace, WS_A, 'the thread\'s own client calendar');
  assert.equal(books[0].body.start, wed);
  assert.equal(books[0].body.prospect.email, 'jane@acme.com');
  assert.doesNotMatch(JSON.stringify(books[0].body), /Dulcy|Echo/, 'no agency or agent names on the prospect\'s invite');
  assert.equal(books[0].auth, `Bearer ${'b'.repeat(40)}`, 'the booker token');
  const sent = (bison as any).repliesSent;
  assert.equal(sent.length, 1, 'then the confirmation, once');
  assert.match(sent[0].message, /all set for/);
  const r = tables[EMAILS][ROW];
  assert.equal(r[BK.opportunity], 'WON', 'Opportunity Status WON (the existing "Webhook to Make for WON" chain)');
  assert.equal(r[EF.stage], 'Booked Meeting');
  assert.equal(r[BK.callDate], utcToZoned(wed, NY).slice(0, 10));
  assert.ok(r[BK.meetingBookedAt]);
  assert.equal(r[RA.state], 'Sent', 'booked: follow-ups closed, not Scheduled');
  assert.equal(r[RA.followupType], 'None');
  assert.equal(r[RA.dueAt], null);
  assert.equal(policy().booking.status, 'booked');
  assert.equal(policy().booking.eventId, 'evt123');
  const log = Object.values(tables[ACTIVITY]).map((a) => String(a[AF.event]));
  assert.ok(log.some((e) => e.startsWith('Meeting booked: Jane Doe at Acme')), log.join(' | '));
  // HQ Inbox line.
  const hq = toRow({ id: ROW, fields: { ...r } } as any, { rec: new Map([[WS_A, 'Twenty West Media']]), bison: new Map() }, true)!;
  assert.equal(hq.bookedLine, `Booked: ${label} (Google Meet)`);
  assert.equal(hq.bookedUrl, 'https://meet.google.com/abc-defg-hij');
  assert.equal(bookedLine(policy().booking), `Booked: ${label} (Google Meet)`);

  // Again: nothing more is booked or sent.
  await repliesTick(db, conf, at(), null); await settle(conf);
  assert.equal(cal.calls.filter((c) => c.path === '/calendar/admin/book').length, 1);
  assert.equal((bison as any).repliesSent.length, 1);
});

test('taken between draft and approve: nothing booked, nothing sent; the draft becomes two other times', { skip }, async () => {
  const wed = nextWednesday3pm();
  tables[EMAILS][ROW] = thread();
  cal.free = [wed];
  claudeAnswers = [answer(wed, { time_choice: 'proposes_time' })];
  const conf = cfg();
  await draft(conf);
  cal.book = () => ({ booked: false, reason: 'taken' });
  tables[EMAILS][ROW][RA.humanAction] = 'Approve Draft';
  await repliesTick(db, conf, at(), null); await settle(conf);
  const r = tables[EMAILS][ROW];
  assert.equal((bison as any).repliesSent.length, 0, 'nothing sent');
  assert.equal(r[RA.state], 'Needs Approval');
  assert.equal(r[RA.humanAction], 'None');
  assert.match(String(r[RA.draft]), /just got taken/);
  assert.match(String(r[RA.lastError]), /no longer open/);
  assert.equal(policy().booking.status, 'taken');
  assert.notEqual(r[EF.stage], 'Booked Meeting');
  assert.equal(Object.values(tables[DECISIONS]).filter((d) => d[DF.status] === 'New').length, 1, 'a new card for the redraft');
  // Approving the redraft sends it as a normal reply (no booking).
  r[RA.humanAction] = 'Approve Draft';
  await repliesTick(db, conf, at(), null); await settle(conf);
  assert.equal(cal.calls.filter((c) => c.path === '/calendar/admin/book').length, 1, 'not booked again');
  assert.equal((bison as any).repliesSent.length, 1);
  assert.match((bison as any).repliesSent[0].message, /just got taken/);
});

test('taken at draft time or a vague reply: two specific times, no booking', { skip }, async () => {
  const wed = nextWednesday3pm();
  tables[EMAILS][ROW] = thread();
  cal.free = [];
  claudeAnswers = [answer(wed)];
  await draft(cfg());
  assert.match(String(tables[EMAILS][ROW][RA.draft]), /just got taken/);
  assert.equal(policy().booking, undefined);
  assert.match(String(tables[EMAILS][ROW][RA.seanReason]), /already taken/);
  // Vague: the calendar is not even asked whether a time is free.
  await db.query('TRUNCATE sean_drafts'); cal.calls = [];
  tables[EMAILS][ROW] = thread({ [EF.latestReply]: 'Sometime next week works', [EF.latestReplyAt]: new Date().toISOString() });
  claudeAnswers = [answer(wed, { time_choice: 'vague', chosen_time: '', draft: 'Hi Jane,\n\nWould Tue 10:00 AM or Wed 2:00 PM ET work?' })];
  await draft(cfg());
  assert.equal(tables[EMAILS][ROW][RA.draft], 'Hi Jane,\n\nWould Tue 10:00 AM or Wed 2:00 PM ET work?');
  assert.equal(policy().booking, undefined);
  assert.equal(cal.calls.filter((c) => c.path === '/calendar/admin/status').length, 0);
});

test('auto client: books and confirms by itself inside office hours, still in that order', { skip }, async () => {
  const wed = nextWednesday3pm();
  tables[SETTINGS].recSetA = { ...tables[SETTINGS].recSetA, 'Default Mode': 'Autopilot', 'Office Start': '00:00', 'Office End': '23:59', 'Exclude Weekends': false, 'Exclude US Holidays': false };
  // Booking hours are the client's office hours too: 3 PM is inside 00:00-23:59.
  tables[EMAILS][ROW] = thread();
  cal.free = [wed];
  claudeAnswers = [answer(wed)];
  const conf = cfg();
  await draft(conf);
  assert.equal(tables[EMAILS][ROW][RA.humanAction], 'Approve Draft', 'auto: no card needed');
  assert.equal(Object.values(tables[DECISIONS]).length, 0);
  await repliesTick(db, conf, at(), null); await settle(conf);
  assert.equal(cal.calls.filter((c) => c.path === '/calendar/admin/book').length, 1);
  assert.equal((bison as any).repliesSent.length, 1);
  assert.equal(tables[EMAILS][ROW][EF.stage], 'Booked Meeting');
});

test('no connected calendar, or one without booking: "I\'ll send the invite over" for a person + HQ ask to reconnect; never auto', { skip }, async () => {
  const wed = nextWednesday3pm();
  tables[SETTINGS].recSetA = { ...tables[SETTINGS].recSetA, 'Default Mode': 'Autopilot', 'Office Start': '00:00', 'Office End': '23:59', 'Exclude Weekends': false };
  tables[EMAILS][ROW] = thread();
  cal.status = {};
  claudeAnswers = [answer(wed)];
  await draft(cfg());
  const r = tables[EMAILS][ROW];
  assert.equal(r[RA.draft], `Hi Jane,\n\n${fmtBooked(wed, NY)} works. I'll send the calendar invite over shortly.`);
  assert.equal(r[RA.humanAction], 'None', 'a person sends the invite, so a person approves');
  assert.equal(policy().booking, undefined);
  assert.match(String(Object.values(tables[DECISIONS])[0][DF.title]), /send the invite by hand/);
  const asks = (await db.query(`SELECT agent, title, dedupe_key FROM hq_asks`)).rows;
  assert.equal(asks.length, 1);
  assert.equal(asks[0].agent, 'Echo');
  assert.match(asks[0].title, /Reconnect .*calendar/);
  // Connected before booking existed: same, with the reason.
  await db.query('TRUNCATE sean_drafts');
  tables[EMAILS][ROW] = thread({ [EF.latestReplyAt]: new Date().toISOString() });
  cal.status = { [WS_A]: { status: 'Connected', canBook: false, provider: 'google' } }; cal.free = [wed];
  claudeAnswers = [answer(wed)];
  await draft(cfg());
  assert.match(String(tables[EMAILS][ROW][RA.seanReason]), /reconnect to allow booking/);
  assert.match(String(tables[EMAILS][ROW][RA.draft]), /send the calendar invite over/);
  assert.equal((await db.query(`SELECT count(*)::int AS n FROM hq_asks`)).rows[0].n, 1, 'one ask per client, not one per reply');
});

test('client isolation: a booking planned for client A never lands on client B\'s calendar', { skip }, async () => {
  const wed = nextWednesday3pm();
  tables[EMAILS][ROW] = thread({ [RA.clients]: [WS_B], [RA.state]: 'Needs Approval', [RA.humanAction]: 'Approve Draft', [RA.updatedAt]: new Date().toISOString(), [RA.draft]: 'Hi Jane, you are all set.',
    [RA.policy]: JSON.stringify({ booking: { status: 'pending', key: bookingKey(ROW, new Date().toISOString(), wed), wsRec: WS_A, start: wed, tz: NY, label: fmtCard(wed, NY), long: fmtBooked(wed, NY), provider: 'google', offered: true, fallbackDraft: 'Hi Jane, other times?' } }) });
  cal.status[WS_B] = { status: 'Connected', canBook: true, provider: 'google' };
  const conf = cfg();
  await repliesTick(db, conf, at(), null); await settle(conf);
  assert.equal(cal.calls.filter((c) => c.path === '/calendar/admin/book').length, 0, 'not booked anywhere');
  assert.equal((bison as any).repliesSent.length, 0, 'nothing sent');
  assert.equal((await jobs('calendar.book'))[0].status, 'needs_review');
  assert.equal(tables[EMAILS][ROW][RA.draft], 'Hi Jane, other times?', 'the confirmation is replaced');
  assert.equal(tables[EMAILS][ROW][RA.humanAction], 'None');
});

test('calendar.book not in LIVE_STAGES: a dry run books nothing and sends nothing', { skip }, async () => {
  const wed = nextWednesday3pm();
  tables[EMAILS][ROW] = thread();
  cal.free = [wed];
  claudeAnswers = [answer(wed)];
  await draft(cfg());
  tables[EMAILS][ROW][RA.humanAction] = 'Approve Draft';
  const conf = cfg({ dryRun: true, liveStages: ['sean.draft', 'reply.send'] });
  await repliesTick(db, conf, at(), null); await settle(conf);
  assert.equal(cal.calls.filter((c) => c.path === '/calendar/admin/book').length, 0);
  assert.equal((bison as any).repliesSent.length, 0);
  assert.equal(policy().booking.status, 'pending');
  assert.match(String((await jobs('calendar.book'))[0].result?.message), /Dry run/);
});

// Booking route of the calendar service (Alex 2026-11-27). No real Google or Calendly calls: every
// provider request goes to the fake below. Run: cd services/dulcy-calendar && node --test test/*.test.mjs
import {test, beforeEach, afterEach} from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {CalendarStore} from '../calendar-store.mjs';
import {CalendarFlow} from '../calendar-flow.mjs';
import {calendarHandler} from '../calendar-http.mjs';
import {PROVIDERS, exchangeConnection, googleEventId, bookingRequest} from '../calendar.mjs';

const WS_A = 'recAAAAAAAAAAAAAA', WS_B = 'recBBBBBBBBBBBBBB';
const T = {admin: 'a'.repeat(40), reader: 'r'.repeat(40), inviter: 'i'.repeat(40), booker: 'b'.repeat(40)};
// Monday 2026-11-30 12:00 ET (17:00 UTC). Wed Dec 2, 5:00 PM ET is 22:00 UTC; 3:00 PM ET is 20:00 UTC.
const NOW = Date.parse('2026-11-30T17:00:00Z');
const WED_3PM = '2026-12-02T20:00:00.000Z';
const RULES = {timezone: 'America/New_York', days: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'], start: '09:00', end: '17:00', durationMinutes: 30, bufferMinutes: 15, noticeMinutes: 60};

let store, flow, server, base, calls, busy, events, logs, failNextInsert, calendlyAvailable, calendlyBooked, httpLogs;

function google(ws, over = {}) {
  return {workspaceId: ws, provider: 'google', providerUserId: 'sub-' + ws, accountEmail: 'owner@client.com', status: 'Connected', canBook: true,
    accessToken: 'tok-' + ws, refreshToken: 'refresh', expiresAt: NOW + 3600_000, calendarIds: ['primary'], rules: RULES, ...over};
}
const err = (status, msg = 'Calendar provider request failed (' + status + ')') => Object.assign(Error(msg), {status});

async function fakeFetch(url, options = {}) {
  const u = new URL(url), body = options.body ? JSON.parse(options.body) : null;
  calls.push({url: u.href, method: options.method || 'GET', auth: options.headers?.Authorization, body});
  if (u.href === 'https://www.googleapis.com/calendar/v3/freeBusy') return {timeMin: body.timeMin, timeMax: body.timeMax, calendars: Object.fromEntries(body.items.map(i => [i.id, {busy}]))};
  if (u.pathname === '/calendar/v3/calendars/primary/events' && options.method === 'POST') {
    if (failNextInsert) { failNextInsert = false; events[body.id] = body; throw Error('fetch failed'); }
    if (events[body.id]) throw err(409);
    events[body.id] = body;
    return {id: body.id, htmlLink: 'https://calendar.google.com/event?eid=x', start: body.start, end: body.end, attendees: body.attendees,
      conferenceData: {entryPoints: [{entryPointType: 'video', uri: 'https://meet.google.com/abc-defg-hij'}]}};
  }
  if (u.pathname.startsWith('/calendar/v3/calendars/primary/events/')) {
    const ev = events[u.pathname.split('/').pop()];
    if (!ev) throw err(404);
    return {...ev, htmlLink: 'https://calendar.google.com/event?eid=x', hangoutLink: 'https://meet.google.com/abc-defg-hij'};
  }
  if (u.href === 'https://api.calendly.com/event_types/ET1') return {resource: {uri: 'https://api.calendly.com/event_types/ET1', active: true, duration: 30, profile: {owner: 'https://api.calendly.com/users/U1'}, locations: [{kind: 'google_conference'}]}};
  if (u.pathname === '/event_type_available_times') return {collection: calendlyAvailable.map(s => ({start_time: s, status: 'available', invitees_remaining: 1}))};
  if (u.href === 'https://api.calendly.com/invitees') {
    calendlyBooked.push({uri: 'https://api.calendly.com/scheduled_events/EV1', start_time: body.start_time, event_type: body.event_type, location: {type: 'google_conference', join_url: 'https://meet.google.com/cal-endl-yyy'}});
    if (failNextInsert) { failNextInsert = false; throw Error('fetch failed'); }
    return {resource: {uri: 'https://api.calendly.com/scheduled_events/EV1/invitees/INV1', event: 'https://api.calendly.com/scheduled_events/EV1', cancel_url: 'https://calendly.com/cancellations/INV1', reschedule_url: 'https://calendly.com/reschedulings/INV1'}};
  }
  if (u.pathname === '/scheduled_events') return {collection: calendlyBooked.filter(e => e.start_time === u.searchParams.get('min_start_time'))};
  if (u.href === 'https://api.calendly.com/scheduled_events/EV1') return {resource: calendlyBooked[0]};
  throw Error('unexpected provider call ' + u.href);
}

async function book(token, body) {
  const r = await fetch(base + '/calendar/admin/book', {method: 'POST', headers: {authorization: 'Bearer ' + token, 'content-type': 'application/json'}, body: JSON.stringify(body)});
  return {status: r.status, body: await r.json()};
}
async function post(path, token, body) {
  const r = await fetch(base + path, {method: 'POST', headers: {authorization: 'Bearer ' + token, 'content-type': 'application/json'}, body: JSON.stringify(body)});
  return {status: r.status, body: await r.json()};
}
const req = (over = {}) => ({workspace: WS_A, start: WED_3PM, tz: 'America/New_York', prospect: {name: 'Jane Doe', email: 'Jane@Acme.com'}, title: 'Intro call: Acme x Client', description: 'Booked by Dulcy', idempotencyKey: 'echo:recE0000000000001:2026-12-02T20:00', ...over});

beforeEach(async () => {
  calls = []; busy = []; events = {}; logs = []; failNextInsert = false; calendlyAvailable = []; calendlyBooked = []; httpLogs = [];
  store = new CalendarStore(':memory:', Buffer.alloc(32, 7));
  flow = new CalendarFlow({store, apps: {google: {clientId: 'g', clientSecret: 's'}, calendly: {clientId: 'c', clientSecret: 's'}}, origin: 'https://n8n.dulcy.io', fetchJson: fakeFetch, now: () => NOW, log: x => logs.push(x)});
  store.save(google(WS_A));
  server = http.createServer(calendarHandler({flow, adminToken: T.admin, readerToken: T.reader, inviterToken: T.inviter, bookerToken: T.booker, log: x => httpLogs.push(x)}));
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  base = 'http://127.0.0.1:' + server.address().port;
});
afterEach(() => { server.close(); store.close(); });

test('booking scopes: Google calendar.events.owned and Calendly scheduled_events:write are asked for; read scopes still required', async () => {
  assert.ok(PROVIDERS.google.scopes.includes('https://www.googleapis.com/auth/calendar.events.owned'));
  assert.ok(!PROVIDERS.google.scopes.includes('https://www.googleapis.com/auth/calendar.events'), 'the narrower owned scope only');
  assert.ok(PROVIDERS.calendly.scopes.includes('scheduled_events:write'));
  const pending = {workspace: WS_A, provider: 'google', expectedEmail: 'owner@client.com', redirectUri: 'https://n8n.dulcy.io/calendar/callback', verifier: 'v', expiresAt: NOW + 60_000};
  const fetchJson = scope => async (url) => url.includes('token') ? {access_token: 'a', refresh_token: 'r', expires_in: 3600, scope} : {email: 'owner@client.com', email_verified: true, sub: 'sub1'};
  const read = PROVIDERS.google.readScopes.join(' ');
  const old = await exchangeConnection({pending, code: 'c', clientId: 'g', clientSecret: 's', fetchJson: fetchJson(read), now: NOW});
  assert.equal(old.canBook, false, 'booking unticked on the consent screen: still connects, read only');
  const full = await exchangeConnection({pending, code: 'c', clientId: 'g', clientSecret: 's', fetchJson: fetchJson(PROVIDERS.google.scopes.join(' ')), now: NOW});
  assert.equal(full.canBook, true);
  await assert.rejects(exchangeConnection({pending, code: 'c', clientId: 'g', clientSecret: 's', fetchJson: fetchJson('openid email'), now: NOW}), /read-only permissions/);
});

test('only the booker token can book; reader, inviter and admin get 403, no token 401', async () => {
  assert.equal((await book('x'.repeat(40), req())).status, 401);
  for (const t of ['reader', 'inviter', 'admin']) {
    const r = await book(T[t], req());
    assert.equal(r.status, 403, t);
    assert.match(r.body.error, /Booking credential required/);
  }
  assert.equal(calls.length, 0, 'no provider call for a refused caller');
  // The booker may read status and availability but nothing else.
  assert.equal((await post('/calendar/admin/status', T.booker, {workspace: WS_A})).status, 200);
  assert.equal((await post('/calendar/admin/request-invite', T.booker, {})).status, 403);
  assert.equal((await post('/calendar/admin/disconnect', T.booker, {workspace: WS_A, revision: 1})).status, 403);
});

test('Google: live free/busy re-check, then the event with Meet + attendee and sendUpdates=all; same key never books twice', async () => {
  const r = await book(T.booker, req());
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(r.body.booked, true);
  assert.equal(r.body.provider, 'google');
  assert.equal(r.body.eventId, googleEventId(WS_A, req().idempotencyKey));
  assert.equal(r.body.meetLink, 'https://meet.google.com/abc-defg-hij');
  assert.equal(r.body.start, WED_3PM);
  assert.equal(r.body.end, '2026-12-02T20:30:00.000Z', 'duration from the client\'s saved rules (30 min)');
  const fb = calls.findIndex(c => c.url.endsWith('/freeBusy')), ins = calls.findIndex(c => c.method === 'POST' && c.url.includes('/events?'));
  assert.ok(fb >= 0 && ins > fb, 'free/busy is read right before the event is created');
  assert.equal(calls[fb].body.timeMin, '2026-12-02T19:45:00.000Z', 'buffer before');
  const insert = calls[ins];
  assert.match(insert.url, /calendars\/primary\/events\?conferenceDataVersion=1&sendUpdates=all$/);
  assert.equal(insert.auth, 'Bearer tok-' + WS_A);
  assert.deepEqual(insert.body.attendees, [{email: 'jane@acme.com', displayName: 'Jane Doe'}]);
  assert.equal(insert.body.conferenceData.createRequest.conferenceSolutionKey.type, 'hangoutsMeet');
  assert.equal(insert.body.start.timeZone, 'America/New_York');
  assert.equal(logs.length, 1, 'every booking is logged');
  assert.equal(logs[0].event, 'booking');
  assert.ok(!JSON.stringify(logs).includes('acme.com'), 'no prospect email in the log');

  const again = await book(T.booker, req());
  assert.equal(again.body.booked, true);
  assert.equal(again.body.idempotent, true);
  assert.equal(again.body.eventId, r.body.eventId);
  assert.equal(calls.filter(c => c.method === 'POST' && c.url.includes('/events?')).length, 1, 'one event only');

  const other = await book(T.booker, req({start: '2026-12-02T21:00:00.000Z'}));
  assert.equal(other.status, 400, 'one key can never book a different time');
  assert.match(other.body.error, /used for another booking/);
});

test('Google: a taken slot, a time outside the client\'s hours or past 30 days is never booked', async () => {
  busy = [{start: '2026-12-02T20:15:00Z', end: '2026-12-02T21:00:00Z'}];
  let r = await book(T.booker, req());
  assert.deepEqual([r.status, r.body.booked, r.body.reason], [200, false, 'taken']);
  busy = [{start: '2026-12-02T20:35:00Z', end: '2026-12-02T21:00:00Z'}];
  r = await book(T.booker, req({idempotencyKey: 'echo:buffer-check-1'}));
  assert.equal(r.body.reason, 'taken', 'the 15-minute buffer counts');
  busy = [];
  r = await book(T.booker, req({start: '2026-12-05T15:00:00.000Z', idempotencyKey: 'echo:saturday-1'}));
  assert.equal(r.body.reason, 'outside_hours', 'Saturday is not a working day for this client');
  r = await book(T.booker, req({start: '2026-12-02T22:00:00.000Z', idempotencyKey: 'echo:late-1'}));
  assert.equal(r.body.reason, 'outside_hours', '5 PM ET ends after the 17:00 working day');
  r = await book(T.booker, req({start: '2027-01-05T20:00:00.000Z', idempotencyKey: 'echo:far-1'}));
  assert.equal(r.status, 400);
  assert.match(r.body.error, /next 30 days/);
  r = await book(T.booker, req({start: '2026-11-30T16:00:00.000Z', idempotencyKey: 'echo:past-1'}));
  assert.match(r.body.error, /passed/);
  assert.equal(calls.filter(c => c.method === 'POST' && c.url.includes('/events?')).length, 0);
  assert.throws(() => bookingRequest(req({prospect: {email: 'not-an-email'}}), NOW), /prospect email/);
});

test('each workspace books on its own calendar only; an unconnected workspace books nothing', async () => {
  let r = await book(T.booker, req({workspace: WS_B, idempotencyKey: 'echo:ws-b-1'}));
  assert.equal(r.body.booked, false);
  assert.equal(calls.length, 0, 'workspace B has no calendar: workspace A\'s token is never used');
  store.save(google(WS_B));
  r = await book(T.booker, req({workspace: WS_B, idempotencyKey: 'echo:ws-b-1'}));
  assert.equal(r.body.booked, true);
  assert.ok(calls.every(c => c.auth === 'Bearer tok-' + WS_B), 'only workspace B\'s own token');
  // The same key in another workspace is a separate booking (keys are per workspace).
  r = await book(T.booker, req({workspace: WS_A, idempotencyKey: 'echo:ws-b-1'}));
  assert.equal(r.body.idempotent, false);
});

test('a connection made before booking: status says reconnect, booking refused without a provider call', async () => {
  store.save({...google(WS_A), canBook: undefined}, 1);
  const s = await post('/calendar/admin/status', T.reader, {workspace: WS_A});
  assert.equal(s.body.status, 'Connected');
  assert.equal(s.body.canBook, false);
  assert.equal(s.body.label, 'Connected – reconnect to allow booking');
  const r = await book(T.booker, req());
  assert.deepEqual([r.body.booked, r.body.reason], [false, 'reconnect']);
  assert.equal(calls.length, 0);
});

test('restart-safe: an insert whose answer was lost is adopted on retry, never created twice', async () => {
  failNextInsert = true;
  const first = await book(T.booker, req());
  assert.equal(first.status, 502, 'provider trouble = retry later with the same key');
  const second = await book(T.booker, req());
  assert.equal(second.body.booked, true);
  assert.equal(calls.filter(c => c.method === 'POST' && c.url.includes('/events?')).length, 1, 'found by its id, not inserted again');
});

test('Calendly: re-checks the exact time, then POST /invitees on the connected event type', async () => {
  store.save({workspaceId: WS_B, provider: 'calendly', providerUserId: 'https://api.calendly.com/users/U1', accountEmail: 'owner@client.com', status: 'Connected', canBook: true,
    accessToken: 'cal-tok', refreshToken: 'r', expiresAt: NOW + 3600_000, eventType: 'https://api.calendly.com/event_types/ET1', eventName: 'Intro'});
  let r = await book(T.booker, req({workspace: WS_B, idempotencyKey: 'echo:cal-1'}));
  assert.deepEqual([r.body.booked, r.body.reason], [false, 'taken'], 'not in Calendly\'s available times');
  calendlyAvailable = [WED_3PM];
  r = await book(T.booker, req({workspace: WS_B, idempotencyKey: 'echo:cal-2'}));
  assert.equal(r.body.booked, true, JSON.stringify(r.body));
  const post1 = calls.find(c => c.url === 'https://api.calendly.com/invitees');
  assert.deepEqual(post1.body, {event_type: 'https://api.calendly.com/event_types/ET1', start_time: WED_3PM, invitee: {name: 'Jane Doe', email: 'jane@acme.com', timezone: 'America/New_York'}, location: {kind: 'google_conference'}});
  assert.equal(r.body.eventId, 'https://api.calendly.com/scheduled_events/EV1');
  assert.equal(r.body.location, 'Google Meet');
  assert.equal(r.body.end, '2026-12-02T20:30:00.000Z');
  r = await book(T.booker, req({workspace: WS_B, idempotencyKey: 'echo:cal-2'}));
  assert.equal(r.body.idempotent, true);
  assert.equal(calls.filter(c => c.url === 'https://api.calendly.com/invitees').length, 1);
});

test('Calendly asks exactly the scopes ticked on the app; booking needs scheduled_events:write', () => {
  assert.deepEqual([...PROVIDERS.calendly.scopes].sort(), ['availability:read', 'event_types:read', 'locations:read', 'scheduled_events:read', 'scheduled_events:write', 'users:read']);
  assert.deepEqual(PROVIDERS.calendly.bookingScopes, ['scheduled_events:write']);
});

test('Calendly restart-safe: a lost POST /invitees answer is found with scheduled_events:read, never booked twice', async () => {
  const cal = {workspaceId: WS_B, provider: 'calendly', providerUserId: 'https://api.calendly.com/users/U1', accountEmail: 'owner@client.com', status: 'Connected', canBook: true,
    scopes: PROVIDERS.calendly.scopes, accessToken: 'cal-tok', refreshToken: 'r', expiresAt: NOW + 3600_000, eventType: 'https://api.calendly.com/event_types/ET1'};
  store.save(cal);
  calendlyAvailable = [WED_3PM];
  failNextInsert = true;
  const first = await book(T.booker, req({workspace: WS_B, idempotencyKey: 'echo:cal-lost-1'}));
  assert.equal(first.status, 502);
  const second = await book(T.booker, req({workspace: WS_B, idempotencyKey: 'echo:cal-lost-1'}));
  assert.equal(second.body.booked, true);
  assert.equal(second.body.meetLink, 'https://meet.google.com/cal-endl-yyy');
  assert.equal(calls.filter(c => c.url === 'https://api.calendly.com/invitees').length, 1, 'adopted, not booked again');
  // Without scheduled_events:read an unclear attempt is never retried blindly.
  store.save({...cal, scopes: ['scheduled_events:write']}, 1);
  calendlyBooked = []; failNextInsert = true;
  await book(T.booker, req({workspace: WS_B, idempotencyKey: 'echo:cal-lost-2'}));
  const r = await book(T.booker, req({workspace: WS_B, idempotencyKey: 'echo:cal-lost-2'}));
  assert.deepEqual([r.body.booked, r.body.reason], [false, 'uncertain']);
});

test('Calendly connect: the token answer may list scopes space- or comma-separated, or leave them out (then /users/me is the check)', async () => {
  const pending = {workspace: WS_A, provider: 'calendly', expectedEmail: 'owner@client.com', redirectUri: 'https://n8n.dulcy.io/calendar/callback', verifier: 'v', expiresAt: NOW + 60_000};
  let meCalls = 0;
  const fetchJson = (tok, me = {resource: {email: 'Owner@Client.com', uri: 'https://api.calendly.com/users/U1'}}) => async (url) => {
    if (url.includes('/oauth/token')) return {access_token: 'a', refresh_token: 'r', expires_in: 7200, ...tok};
    meCalls++; if (me instanceof Error) throw me; return me;
  };
  const go = (tok, me) => exchangeConnection({pending, code: 'c', clientId: 'c', clientSecret: 's', fetchJson: fetchJson(tok, me), now: NOW});
  const all = PROVIDERS.calendly.scopes;
  let c = await go({});
  assert.deepEqual([c.canBook, c.scopesListed, c.providerUserId], [true, false, 'https://api.calendly.com/users/U1'], 'no scope field: verified by /users/me, booking allowed');
  c = await go({scope: 'default'});
  assert.equal(c.canBook, true, 'legacy "default" scope');
  c = await go({scope: all.join(',')});
  assert.deepEqual([c.canBook, c.scopesListed], [true, true], 'comma-separated');
  c = await go({scope: all.join(' ')});
  assert.equal(c.canBook, true, 'space-separated');
  c = await go({scope: 'users:read event_types:read availability:read'});
  assert.equal(c.canBook, false, 'read-only app: connects, booking not allowed');
  await assert.rejects(go({}, Object.assign(Error('Calendar provider request failed (403)'), {status: 403})), /403/, 'no scope field and /users/me refused: not connected');
  await assert.rejects(go({scope: 'users:read'}), /read-only permissions/, 'a listed scope set missing a read scope still fails');
  assert.ok(meCalls >= 6);
});

test('a failed connect step logs its route and reason, without the ticket, codes or emails', async () => {
  const r = await fetch(base + '/calendar/connect?ticket=secret-ticket-value');
  assert.equal(r.status, 400);
  assert.match(await r.text(), /Connection needs attention/, 'the client still sees the plain page');
  assert.equal(httpLogs.length, 1);
  assert.deepEqual(Object.keys(httpLogs[0]).sort(), ['error', 'level', 'route']);
  assert.equal(httpLogs[0].route, '/calendar/connect');
  assert.match(httpLogs[0].error, /Invitation expired or already used/);
  assert.ok(!JSON.stringify(httpLogs).includes('secret-ticket-value'));
  // A failed booking is logged the same way.
  await book(T.booker, req({prospect: {email: 'jane@acme.com'}, start: '2027-06-01T15:00:00.000Z', idempotencyKey: 'echo:log-1'}));
  assert.equal(httpLogs.at(-1).route, '/calendar/admin/book');
  assert.match(httpLogs.at(-1).error, /30 days/);
});

import {calendlyAnswers as _qa} from '../calendar.mjs';
test('Calendly required questions: text answered with the booking context; optional skipped; required phone refused', () => {
  const req = {name: 'Jane', description: 'Re: intro call'};
  assert.deepEqual(_qa({custom_questions: [
    {name: 'What do you want to cover?', type: 'text', position: 0, enabled: true, required: true},
    {name: 'Anything else?', type: 'string', position: 1, enabled: true, required: false},
  ]}, req), [{question: 'What do you want to cover?', answer: 'Re: intro call', position: 0}]);
  assert.deepEqual(_qa({}, req), []);
  assert.throws(() => _qa({custom_questions: [{name: 'Phone', type: 'phone_number', position: 0, enabled: true, required: true}]}, req), /make it optional/);
});

test('Calendly phone question: filled with the prospect phone when we have it (required or optional)', () => {
  const qs = {custom_questions: [{name: 'Phone Number', type: 'phone_number', position: 1, enabled: true, required: true}]};
  assert.deepEqual(_qa(qs, {name: 'Jane', description: '', phone: '+15551234567'}), [{question: 'Phone Number', answer: '+15551234567', position: 1}]);
  assert.throws(() => _qa(qs, {name: 'Jane', description: ''}), /make it optional/);
});

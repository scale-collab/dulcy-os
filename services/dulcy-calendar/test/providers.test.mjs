// Microsoft Outlook, Cal.com, GoHighLevel and HubSpot (2026-11-27). No real provider call: every request
// goes to the fake below. Run: cd services/dulcy-calendar && node --test test/*.test.mjs
import {test, beforeEach, afterEach} from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {CalendarStore} from '../calendar-store.mjs';
import {CalendarFlow} from '../calendar-flow.mjs';
import {calendarHandler} from '../calendar-http.mjs';
import {providerJson, maskSecrets, HOSTS} from '../calendar-provider.mjs';
import {PROVIDERS, PASTE_PROVIDERS, beginConnection, exchangeConnection, bookingTag, calcomStarts, ghlStarts, hubspotStarts, slotCollection, calcomAnswers, hubspotForm, microsoftFreeBusy, KEY_EXPIRES} from '../calendar.mjs';

const WS = 'recAAAAAAAAAAAAAA', WS2 = 'recCCCCCCCCCCCCCC';
const T = {admin: 'a'.repeat(40), reader: 'r'.repeat(40), inviter: 'i'.repeat(40), booker: 'b'.repeat(40)};
const ORIGIN = 'https://n8n.dulcy.io';
// Monday 2026-11-30 12:00 ET (17:00 UTC). Wed Dec 2, 3:00 PM ET = 20:00 UTC.
const NOW = Date.parse('2026-11-30T17:00:00Z');
const WED_3PM = '2026-12-02T20:00:00.000Z';
const RULES = {timezone: 'America/New_York', days: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'], start: '09:00', end: '17:00', durationMinutes: 30, bufferMinutes: 15, noticeMinutes: 60};
const CAL_KEY = 'cal_live_goodkey1234567890', CAL_OTHER = 'cal_live_otherkey1234567890', GHL_KEY = 'pit-0a1b2c3d-1111-2222-3333-444455556666';

let store, flow, server, base, calls, S, logs, httpLogs;
const err = (status, msg) => Object.assign(Error(msg || 'Calendar provider request failed (' + status + ')'), {status});
const ok = x => JSON.parse(JSON.stringify(x));

async function fakeFetch(url, options = {}) {
  const u = new URL(url), body = options.body && String(options.body).startsWith('{') ? JSON.parse(options.body) : null, m = options.method || 'GET';
  const auth = options.headers?.Authorization || '';
  calls.push({url: u.href, host: u.hostname, path: u.pathname, q: u.searchParams, method: m, headers: options.headers || {}, body});
  if (u.hostname === 'graph.microsoft.com') {
    if (u.pathname === '/v1.0/me/calendars') return {value: [{id: 'AAA', name: 'Calendar'}, {id: 'BBB', name: 'Birthdays'}]};
    if (u.pathname.startsWith('/v1.0/me/calendars/') && u.pathname.endsWith('/calendarView')) return {value: S.msBusy[decodeURIComponent(u.pathname.split('/')[4])] || []};
    if (u.pathname === '/v1.0/me/calendar') return {id: 'AAA', allowedOnlineMeetingProviders: S.msTeams ? ['teamsForBusiness'] : []};
    if (u.pathname === '/v1.0/me/calendar/calendarView') return {value: S.msCreated};
    if (u.pathname === '/v1.0/me/events' && m === 'POST') {
      const ev = {id: 'MSEV' + (S.msCreated.length + 1), ...body, start: {dateTime: body.start.dateTime + '.0000000', timeZone: 'UTC'}, end: {dateTime: body.end.dateTime + '.0000000', timeZone: 'UTC'},
        webLink: 'https://outlook.office365.com/owa/?itemid=x', onlineMeeting: body.isOnlineMeeting ? {joinUrl: 'https://teams.microsoft.com/l/meetup-join/x'} : null};
      S.msCreated.push(ev);
      if (S.failPost) { S.failPost = false; throw Error('fetch failed'); }
      return ev;
    }
  }
  if (u.hostname === 'api.cal.com') {
    if (u.pathname === '/v2/me') {
      if (auth === 'Bearer ' + CAL_KEY) return {status: 'success', data: {id: 7, email: 'Owner@Client.com', username: 'owner', timeZone: 'Europe/London'}};
      if (auth === 'Bearer ' + CAL_OTHER) return {status: 'success', data: {id: 8, email: 'someone@else.com', username: 'else', timeZone: 'UTC'}};
      throw err(401, 'Calendar provider request failed (401): Invalid API key');
    }
    if (S.calRevoked) throw err(401);
    if (u.pathname === '/v2/event-types') return {status: 'success', data: [{id: 11, title: 'Intro', lengthInMinutes: 30, ownerId: 7, bookingUrl: 'https://cal.com/owner/intro'}, {id: 12, title: 'Someone else', lengthInMinutes: 15, ownerId: 99}]};
    if (u.pathname === '/v2/event-types/11') return {status: 'success', data: {id: 11, lengthInMinutes: 30, bookingFields: S.calFields}};
    if (u.pathname === '/v2/slots') { const d = {}; for (const s of S.calSlots) (d[s.slice(0, 10)] ||= []).push({start: s}); return {status: 'success', data: d}; }
    if (u.pathname === '/v2/bookings' && m === 'POST') {
      const b = {uid: 'CALBK' + (S.calBookings.length + 1), start: body.start, end: new Date(Date.parse(body.start) + 1800000).toISOString(), status: 'accepted', metadata: body.metadata, meetingUrl: 'https://app.cal.com/video/abc', location: 'https://app.cal.com/video/abc', attendees: [body.attendee]};
      S.calBookings.push(b);
      if (S.failPost) { S.failPost = false; throw Error('fetch failed'); }
      return {status: 'success', data: b};
    }
    if (u.pathname === '/v2/bookings') return {status: 'success', data: S.calBookings};
  }
  if (u.hostname === 'services.leadconnectorhq.com') {
    if (auth !== 'Bearer ' + GHL_KEY) throw err(401, 'Calendar provider request failed (401): Invalid JWT');
    if (u.pathname === '/calendars/') return {calendars: [{id: 'GCAL1', name: 'Discovery call', isActive: true, slotDuration: 30, slotDurationUnit: 'mins', locationId: 'LOC1234567890'}, {id: 'GCAL2', name: 'Old', isActive: false}]};
    if (u.pathname === '/calendars/events') { if (S.ghlNoEventsRead) throw err(403); return {events: S.ghlEvents}; }
    if (u.pathname === '/calendars/GCAL1/free-slots') { const d = {traceId: 't-1'}; for (const s of S.ghlSlots) (d[s.slice(0, 10)] ||= {slots: []}).slots.push(s); return d; }
    if (u.pathname === '/contacts/upsert') return {new: true, contact: {id: 'CON1', email: body.email}};
    if (u.pathname === '/calendars/events/appointments' && m === 'POST') {
      if (S.ghl403) throw err(403, 'Calendar provider request failed (403): The token is not authorized for this scope.');
      const a = {id: 'APT' + (S.ghlEvents.length + 1), calendarId: body.calendarId, contactId: body.contactId, startTime: body.startTime, endTime: body.endTime, appointmentStatus: 'confirmed'};
      S.ghlEvents.push(a);
      if (S.failPost) { S.failPost = false; throw Error('fetch failed'); }
      return a;
    }
  }
  if (u.hostname === 'api.hubapi.com') {
    const P = '/scheduler/v3/meetings/meeting-links';
    if (u.pathname.startsWith('/oauth/v1/access-tokens/')) return S.hubInfo;
    if (u.pathname === P) return {results: [{id: '1', slug: 'owner-intro', name: 'Intro call', link: 'https://meetings.hubspot.com/owner-intro', type: 'PERSONAL_LINK'}], total: 1};
    if (u.pathname === P + '/book/availability-page/owner-intro') return {allUsersBusyTimes: [], linkAvailability: {hasMore: false, linkAvailabilityByDuration: {'1800000': {meetingDurationMillis: 1800000, availabilities: S.hsSlots.map(t => ({startMillisUtc: Date.parse(t), endMillisUtc: Date.parse(t) + 1800000}))}}}};
    if (u.pathname === P + '/book/owner-intro') return {linkId: '1', linkType: 'PERSONAL_LINK', isOffline: false, allUsersBusyTimes: [{busyTimes: [], isOffline: false, meetingsUser: {userId: '555', id: 'm1', calendarProvider: 'GOOGLE'}}],
      customParams: {durations: [1800000], formFields: S.hsForm, legalConsentEnabled: S.hsConsent, legalConsentOptions: {processingConsentType: 'REQUIRED_CHECKBOX', communicationConsentCheckboxes: []}}};
    if (u.pathname === P + '/book' && m === 'POST') {
      S.hsBooked.push(body);
      if (S.failPost) { S.failPost = false; throw Error('fetch failed'); }
      return {calendarEventId: 'HSEV1', start: body.startTime, end: new Date(Date.parse(body.startTime) + body.duration).toISOString(), webConferenceUrl: 'https://zoom.us/j/123', contactId: '901', subject: 'Intro'};
    }
  }
  throw Error('unexpected provider call ' + u.href);
}

const conn = (provider, over = {}) => ({workspaceId: WS, provider, accountEmail: 'owner@client.com', status: 'Connected', canBook: true, accessToken: 'tok-' + provider, refreshToken: 'refresh', expiresAt: NOW + 3600_000, ...over});
const MS = over => conn('microsoft', {providerUserId: 'ms-user-1', calendarIds: ['AAA'], rules: RULES, ...over});
const CALCOM = over => conn('calcom', {providerUserId: '7', credential: 'key', accessToken: CAL_KEY, refreshToken: null, expiresAt: KEY_EXPIRES, eventTypeId: '11', eventName: 'Intro', eventMinutes: 30, timezone: 'America/New_York', ...over});
const GHLC = over => conn('ghl', {providerUserId: 'LOC1234567890', locationId: 'LOC1234567890', credential: 'key', accessToken: GHL_KEY, refreshToken: null, expiresAt: KEY_EXPIRES, calendarId: 'GCAL1', eventName: 'Discovery call', eventMinutes: 30, timezone: 'America/New_York', canReadEvents: true, ...over});
const HUBC = over => conn('hubspot', {providerUserId: '4242:555', hubId: '4242', slug: 'owner-intro', eventName: 'Intro call', durationMs: 1800000, eventMinutes: 30, timezone: 'America/New_York', ...over});

async function post(path, token, body) {
  const r = await fetch(base + path, {method: 'POST', headers: {authorization: 'Bearer ' + token, 'content-type': 'application/json'}, body: JSON.stringify(body)});
  return {status: r.status, body: await r.json()};
}
const book = body => post('/calendar/admin/book', T.booker, body);
const req = (over = {}) => ({workspace: WS, start: WED_3PM, tz: 'America/New_York', prospect: {name: 'Jane van Doe', email: 'Jane@Acme.com', phone: '+1 (555) 123-4567'}, title: 'Intro call: Acme x Client', description: 'Booked by Dulcy', idempotencyKey: 'echo:recE0000000000001:2026-12-02T20:00', ...over});
const posts = host => calls.filter(c => c.host === host && c.method === 'POST');
async function form(path, fields, cookie) {
  return fetch(base + path, {method: 'POST', redirect: 'manual', headers: {origin: ORIGIN, 'content-type': 'application/x-www-form-urlencoded', ...(cookie ? {cookie} : {})}, body: new URLSearchParams(fields).toString()});
}
const sessionCookie = r => (r.headers.get('set-cookie') || '').split(';')[0];

beforeEach(async () => {
  calls = []; logs = []; httpLogs = [];
  S = {msBusy: {}, msCreated: [], msTeams: true, calSlots: [], calBookings: [], calFields: [], calRevoked: false, ghlSlots: [], ghlEvents: [], ghl403: false, ghlNoEventsRead: false,
    hsSlots: [], hsForm: [], hsConsent: false, hsBooked: [], hubInfo: null, failPost: false};
  store = new CalendarStore(':memory:', Buffer.alloc(32, 9));
  flow = new CalendarFlow({store, apps: {microsoft: {clientId: 'm', clientSecret: 's'}, hubspot: {clientId: 'h', clientSecret: 's'}}, origin: ORIGIN, fetchJson: fakeFetch, now: () => NOW, log: x => logs.push(x)});
  server = http.createServer(calendarHandler({flow, adminToken: T.admin, readerToken: T.reader, inviterToken: T.inviter, bookerToken: T.booker, log: x => httpLogs.push(x)}));
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  base = 'http://127.0.0.1:' + server.address().port;
});
afterEach(() => { server.close(); store.close(); });

// ---------- Connect / identity ----------
test('scopes: Microsoft offline_access User.Read Calendars.ReadWrite; HubSpot meeting-link read + contacts write; Cal.com and GHL are paste-only', () => {
  assert.deepEqual(PROVIDERS.microsoft.scopes, ['User.Read', 'Calendars.ReadWrite', 'offline_access']);
  assert.deepEqual(PROVIDERS.hubspot.scopes, ['scheduler.meetings.meeting-link.read', 'crm.objects.contacts.write', 'oauth']);
  assert.deepEqual([...PASTE_PROVIDERS].sort(), ['calcom', 'ghl']);
  const ms = new URL(beginConnection({workspace: WS, provider: 'microsoft', clientId: 'm', redirectUri: ORIGIN + '/calendar/callback', expectedEmail: 'owner@client.com', now: NOW}).authorizationUrl);
  assert.equal(ms.origin + ms.pathname, 'https://login.microsoftonline.com/common/oauth2/v2.0/authorize');
  assert.equal(ms.searchParams.get('scope'), 'User.Read Calendars.ReadWrite offline_access');
  assert.equal(ms.searchParams.get('code_challenge_method'), 'S256');
  assert.equal(ms.searchParams.get('redirect_uri'), 'https://n8n.dulcy.io/calendar/callback');
  const hs = new URL(beginConnection({workspace: WS, provider: 'hubspot', clientId: 'h', redirectUri: ORIGIN + '/calendar/callback', expectedEmail: 'owner@client.com', now: NOW}).authorizationUrl);
  assert.equal(hs.origin + hs.pathname, 'https://app.hubspot.com/oauth/authorize');
  assert.ok(hs.searchParams.get('code_challenge'));
  for (const p of ['calcom', 'ghl']) assert.throws(() => beginConnection({workspace: WS, provider: p, clientId: 'x', redirectUri: ORIGIN + '/calendar/callback', expectedEmail: 'a@b.co', now: NOW}), /not configured/);
});

test('Microsoft connect: scope forms, mail or userPrincipalName must be the invited email; Calendars.Read alone = read only', async () => {
  const pending = {workspace: WS, provider: 'microsoft', expectedEmail: 'owner@client.com', redirectUri: ORIGIN + '/calendar/callback', verifier: 'v', expiresAt: NOW + 60_000};
  const seen = [];
  const f = (scope, me) => async (url, o) => { seen.push({url, body: o?.body}); return url.includes('/token') ? {access_token: 'at', refresh_token: 'rt', expires_in: 3600, scope} : me; };
  const go = (scope, me) => exchangeConnection({pending, code: 'c', clientId: 'm', clientSecret: 's', fetchJson: f(scope, me), now: NOW});
  let c = await go('https://graph.microsoft.com/Calendars.ReadWrite https://graph.microsoft.com/User.Read openid profile', {id: 'u1', mail: null, userPrincipalName: 'Owner@Client.com'});
  assert.deepEqual([c.canBook, c.providerUserId, c.status], [true, 'u1', 'Selection Required'], 'personal account: UPN matches');
  assert.ok(new URLSearchParams(seen[0].body).get('code_verifier'), 'PKCE verifier sent');
  assert.equal(seen[1].url, 'https://graph.microsoft.com/v1.0/me?$select=id,mail,userPrincipalName');
  c = await go('User.Read Calendars.ReadWrite', {id: 'u2', mail: 'owner@client.com', userPrincipalName: 'o.wner@client.onmicrosoft.com'});
  assert.equal(c.canBook, true, 'work account: mail matches');
  c = await go('User.Read Calendars.Read', {id: 'u3', mail: 'owner@client.com'});
  assert.equal(c.canBook, false, 'read only: connects, booking off');
  await assert.rejects(go('User.Read', {id: 'u4', mail: 'owner@client.com'}), /read-only permissions/);
  await assert.rejects(go('User.Read Calendars.ReadWrite', {id: 'u5', mail: 'other@client.com', userPrincipalName: 'other@client.com'}), /does not match/);
});

test('HubSpot connect: scopes and user come from the access-token info; wrong user refused; no contacts write = read only', async () => {
  const pending = {workspace: WS, provider: 'hubspot', expectedEmail: 'owner@client.com', redirectUri: ORIGIN + '/calendar/callback', verifier: 'v', expiresAt: NOW + 60_000};
  const urls = [];
  const f = info => async url => { urls.push(url); return url.endsWith('/oauth/v1/token') ? {access_token: 'hs-at', refresh_token: 'hs-rt', expires_in: 1800} : info; };
  const go = info => exchangeConnection({pending, code: 'c', clientId: 'h', clientSecret: 's', fetchJson: f(info), now: NOW});
  let c = await go({user: 'Owner@Client.com', hub_id: 4242, user_id: 555, scopes: ['oauth', 'scheduler.meetings.meeting-link.read', 'crm.objects.contacts.write']});
  assert.deepEqual([c.canBook, c.providerUserId, c.hubId], [true, '4242:555', '4242']);
  assert.equal(urls[0], 'https://api.hubapi.com/oauth/v1/token');
  assert.equal(urls[1], 'https://api.hubapi.com/oauth/v1/access-tokens/hs-at');
  c = await go({user: 'owner@client.com', hub_id: 4242, user_id: 555, scopes: ['scheduler.meetings.meeting-link.read']});
  assert.equal(c.canBook, false);
  await assert.rejects(go({user: 'owner@client.com', hub_id: 1, user_id: 2, scopes: ['crm.objects.contacts.write']}), /read-only permissions/);
  await assert.rejects(go({user: 'intruder@x.com', hub_id: 1, user_id: 2, scopes: ['scheduler.meetings.meeting-link.read', 'crm.objects.contacts.write']}), /does not match/);
});

test('Cal.com paste flow: instructions page, wrong account refused without echoing the key, good key → event type → Connected; key stored sealed', async () => {
  const {url} = flow.invite({workspace: WS, provider: 'calcom', expectedEmail: 'owner@client.com', label: 'Client Co'});
  const ticket = new URL(url).searchParams.get('ticket');
  let r = await fetch(base + '/calendar/connect?ticket=' + ticket);
  let html = await r.text();
  assert.equal(r.status, 200);
  assert.match(html, /Settings → Developer → API keys/);
  assert.match(html, /type="password" name="apiKey"/);
  assert.match(r.headers.get('content-security-policy'), /form-action 'self' https:/, 'CSP unchanged');

  r = await form('/calendar/start', {ticket, apiKey: CAL_OTHER});
  html = await r.text();
  assert.equal(r.status, 400);
  assert.match(html, /different Cal\.com account/);
  assert.ok(!html.includes(CAL_OTHER) && !html.includes('someone@else.com'), 'neither the key nor the other account is echoed');
  r = await form('/calendar/start', {ticket, apiKey: 'cal_live_wrongkey000000'});
  assert.match(await r.text(), /did not accept this key/);
  assert.equal((await fetch(base + '/calendar/start', {method: 'POST', headers: {origin: 'https://evil.example', 'content-type': 'application/x-www-form-urlencoded'}, body: new URLSearchParams({ticket, apiKey: CAL_KEY}).toString()})).status, 403, 'cross-origin POST refused');

  r = await form('/calendar/start', {ticket, apiKey: CAL_KEY});
  assert.equal(r.status, 303);
  assert.equal(r.headers.get('location'), '/calendar/select');
  const cookie = sessionCookie(r);
  r = await fetch(base + '/calendar/select', {headers: {cookie}});
  html = await r.text();
  assert.match(html, /Intro \(30 min\)/);
  assert.ok(!html.includes('Someone else'), 'only the connected user\'s own event types');
  assert.match(html, /value="Europe\/London"/, 'time zone prefilled from the Cal.com profile');
  const csrf = html.match(/name="csrf" value="([^"]+)"/)[1];
  r = await form('/calendar/select', {csrf, eventType: '11', timezone: 'America/New_York'}, cookie);
  assert.equal(r.status, 200, await r.text());
  const st = await post('/calendar/admin/status', T.reader, {workspace: WS});
  assert.deepEqual([st.body.status, st.body.provider, st.body.canBook, st.body.timezone, st.body.providerName], ['Connected', 'calcom', true, 'America/New_York', 'Cal.com']);
  const raw = store.db.prepare('SELECT payload FROM connections').get().payload;
  assert.ok(!raw.includes(CAL_KEY) && !Buffer.from(raw, 'base64url').toString('latin1').includes(CAL_KEY), 'the key is sealed at rest');
  assert.equal(store.get(WS).connection.accessToken, CAL_KEY);
  assert.ok(!JSON.stringify([logs, httpLogs]).includes(CAL_KEY) && !JSON.stringify([logs, httpLogs]).includes(CAL_OTHER), 'no key in any log');
  assert.equal((await fetch(base + '/calendar/connect?ticket=' + ticket)).status, 400, 'the link is used up once the key works');
});

test('GoHighLevel paste flow: token + Location ID checked on the calendars list, Version header, events read probed; calendar picked', async () => {
  const {url} = flow.invite({workspace: WS, provider: 'ghl', expectedEmail: 'owner@client.com', label: 'Twenty West'});
  const ticket = new URL(url).searchParams.get('ticket');
  let html = await (await fetch(base + '/calendar/connect?ticket=' + ticket)).text();
  assert.match(html, /Settings → Private Integrations/);
  assert.match(html, /calendars\/events\.write/);
  assert.match(html, /name="locationId"/);
  let r = await form('/calendar/start', {ticket, apiKey: 'pit-ffffffff-0000-0000-0000-000000000000', locationId: 'LOC1234567890'});
  html = await r.text();
  assert.equal(r.status, 400);
  assert.match(html, /did not accept this key/);
  assert.ok(!html.includes('pit-ffffffff'));
  r = await form('/calendar/start', {ticket, apiKey: GHL_KEY, locationId: 'bad id!'});
  assert.match(await r.text(), /Location ID/);
  r = await form('/calendar/start', {ticket, apiKey: GHL_KEY, locationId: 'LOC1234567890'});
  assert.equal(r.status, 303);
  const list = calls.find(c => c.path === '/calendars/' && c.headers.Authorization === 'Bearer ' + GHL_KEY);
  assert.equal(list.headers.Version, '2021-04-15');
  assert.equal(list.q.get('locationId'), 'LOC1234567890');
  assert.equal(store.get(WS).connection.canReadEvents, true);
  const cookie = sessionCookie(r);
  html = await (await fetch(base + '/calendar/select', {headers: {cookie}})).text();
  assert.match(html, /Discovery call/);
  assert.ok(!html.includes('>Old<'), 'inactive calendars are not offered');
  const csrf = html.match(/name="csrf" value="([^"]+)"/)[1];
  r = await form('/calendar/select', {csrf, eventType: 'GCAL1', timezone: 'America/Chicago'}, cookie);
  assert.equal(r.status, 200);
  const c = store.get(WS).connection;
  assert.deepEqual([c.status, c.calendarId, c.eventMinutes, c.timezone, c.providerUserId], ['Connected', 'GCAL1', 30, 'America/Chicago', 'LOC1234567890']);
  assert.ok(!JSON.stringify([logs, httpLogs]).includes(GHL_KEY));
});

test('Microsoft select: calendars + rules like Google; HubSpot select: meeting link + its length', async () => {
  store.save(MS({status: 'Selection Required', calendarIds: undefined, rules: undefined}));
  await flow.provider.select(WS, {calendarIds: ['AAA', 'BBB'], rules: RULES});
  assert.deepEqual(store.get(WS).connection.calendarIds, ['AAA', 'BBB']);
  await assert.rejects(flow.provider.select(WS, {calendarIds: ['ZZZ'], rules: RULES}), /accessible calendars/);
  store.save(HUBC({workspaceId: WS2, status: 'Selection Required', slug: undefined, durationMs: undefined}));
  await assert.rejects(flow.provider.select(WS2, {eventType: 'owner-intro', timezone: 'Not/AZone'}), /time zone/);
  const st = await flow.provider.select(WS2, {eventType: 'owner-intro', timezone: 'America/New_York'});
  assert.equal(st.status, 'Connected');
  const c = store.get(WS2).connection;
  assert.deepEqual([c.slug, c.durationMs, c.eventMinutes, c.schedulingUrl], ['owner-intro', 1800000, 30, 'https://meetings.hubspot.com/owner-intro']);
});

// ---------- Availability ----------
test('availability normalisation: Cal.com, GHL and HubSpot answers become one list (window, future, no repeats)', () => {
  assert.deepEqual(calcomStarts({status: 'success', data: {'2026-12-02': [{start: '2026-12-02T15:00:00.000-05:00'}, '2026-12-02T16:00:00.000-05:00']}}), ['2026-12-02T15:00:00.000-05:00', '2026-12-02T16:00:00.000-05:00']);
  assert.throws(() => calcomStarts({status: 'error'}), /Availability lookup failed/);
  assert.deepEqual(ghlStarts({'2026-12-02': {slots: ['2026-12-02T15:00:00-05:00']}, traceId: 'x'}), ['2026-12-02T15:00:00-05:00']);
  assert.deepEqual(hubspotStarts({linkAvailability: {linkAvailabilityByDuration: {'900000': {meetingDurationMillis: 900000, availabilities: [{startMillisUtc: 1}]}, '1800000': {meetingDurationMillis: 1800000, availabilities: [{startMillisUtc: 2}]}}}}, 1800000), [2], 'the saved meeting length');
  assert.throws(() => hubspotStarts({}, 1800000), /Availability lookup failed/);
  const r = slotCollection({connection: CALCOM(), workspace: WS, now: NOW, start: '2026-12-01T00:00:00Z', end: '2026-12-03T00:00:00Z',
    starts: ['2026-12-02T15:00:00-05:00', WED_3PM, '2026-11-30T10:00:00Z', '2026-12-05T10:00:00Z', 'garbage', Date.parse('2026-12-01T14:00:00Z')]});
  assert.deepEqual(r.collection.map(x => x.start_time), ['2026-12-01T14:00:00.000Z', WED_3PM]);
  assert.equal(r.provider, 'calcom');
  assert.throws(() => slotCollection({connection: CALCOM(), workspace: WS, now: NOW, start: '2026-12-01T00:00:00Z', end: '2026-12-20T00:00:00Z', starts: []}), /Invalid availability window/);
});

test('Microsoft availability: calendarView busy times (UTC, Prefer header) + the client\'s rules; free and cancelled events do not block', async () => {
  store.save(MS());
  S.msBusy.AAA = [
    {start: {dateTime: '2026-12-02T20:00:00.0000000', timeZone: 'UTC'}, end: {dateTime: '2026-12-02T21:00:00.0000000', timeZone: 'UTC'}, showAs: 'busy'},
    {start: {dateTime: '2026-12-02T14:00:00.0000000', timeZone: 'UTC'}, end: {dateTime: '2026-12-02T15:00:00.0000000', timeZone: 'UTC'}, showAs: 'free'},
    {start: {dateTime: '2026-12-02T15:00:00.0000000', timeZone: 'UTC'}, end: {dateTime: '2026-12-02T16:00:00.0000000', timeZone: 'UTC'}, showAs: 'busy', isCancelled: true},
  ];
  const r = await post('/calendar/admin/availability', T.reader, {workspace: WS, start: '2026-12-02T14:00:00Z', end: '2026-12-02T22:00:00Z'});
  assert.equal(r.status, 200, JSON.stringify(r.body));
  const starts = r.body.collection.map(x => x.start_time);
  assert.ok(starts.includes('2026-12-02T14:00:00.000Z'), 'a "free" event does not block 9:00 ET');
  assert.ok(starts.includes('2026-12-02T15:00:00.000Z'), 'a cancelled event does not block');
  assert.ok(!starts.includes(WED_3PM) && !starts.includes('2026-12-02T19:45:00.000Z'), 'busy 20:00-21:00 blocks, with the 15-minute buffer');
  assert.equal(r.body.connection.provider, 'microsoft');
  const cv = calls.find(c => c.path === '/v1.0/me/calendars/AAA/calendarView');
  assert.equal(cv.headers.Prefer, 'outlook.timezone="UTC"');
  assert.equal(cv.q.get('startDateTime'), '2026-12-02T14:00:00Z');
  assert.throws(() => microsoftFreeBusy({AAA: [{start: {dateTime: '2026-12-02T20:00:00', timeZone: 'Pacific Standard Time'}, end: {dateTime: '2026-12-02T21:00:00', timeZone: 'Pacific Standard Time'}}]}, 'a', 'b'), /Unexpected time/, 'a non-UTC answer is never guessed');
});

test('Cal.com / GHL / HubSpot availability requests: versions, ids, units', async () => {
  store.save(CALCOM()); store.save(GHLC({workspaceId: WS2}));
  S.calSlots = [WED_3PM]; S.ghlSlots = ['2026-12-02T15:00:00-05:00'];
  let r = await post('/calendar/admin/availability', T.reader, {workspace: WS, start: '2026-12-02T00:00:00Z', end: '2026-12-03T00:00:00Z'});
  assert.deepEqual(r.body.collection.map(x => x.start_time), [WED_3PM]);
  const sl = calls.find(c => c.path === '/v2/slots');
  assert.deepEqual([sl.headers['cal-api-version'], sl.q.get('eventTypeId'), sl.q.get('timeZone')], ['2024-09-04', '11', 'UTC']);
  r = await post('/calendar/admin/availability', T.reader, {workspace: WS2, start: '2026-12-02T00:00:00Z', end: '2026-12-03T00:00:00Z'});
  assert.deepEqual(r.body.collection.map(x => x.start_time), [WED_3PM], 'GHL offset time normalised to UTC');
  assert.equal(r.body.connection.timezone, 'America/New_York');
  const fs = calls.find(c => c.path === '/calendars/GCAL1/free-slots');
  assert.deepEqual([fs.headers.Version, fs.q.get('startDate'), fs.q.get('endDate')], ['2021-04-15', String(Date.parse('2026-12-02T00:00:00Z')), String(Date.parse('2026-12-03T00:00:00Z'))], 'epoch milliseconds');
  store.save(HUBC({workspaceId: 'recDDDDDDDDDDDDDD'}));
  S.hsSlots = [WED_3PM];
  r = await post('/calendar/admin/availability', T.reader, {workspace: 'recDDDDDDDDDDDDDD', start: '2026-12-02T00:00:00Z', end: '2026-12-03T00:00:00Z'});
  assert.deepEqual(r.body.collection.map(x => x.start_time), [WED_3PM]);
  const hp = calls.find(c => c.path.includes('/availability-page/'));
  assert.deepEqual([hp.q.get('timezone'), hp.q.get('monthOffset')], ['UTC', '1'], 'December is next month from Nov 30');
});

// ---------- Booking ----------
test('Microsoft booking: live re-check, event with attendee + transactionId + Teams; same key never books twice', async () => {
  store.save(MS());
  const r = await book(req());
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.deepEqual([r.body.booked, r.body.provider, r.body.location, r.body.end], [true, 'microsoft', 'Microsoft Teams', '2026-12-02T20:30:00.000Z']);
  assert.equal(r.body.meetLink, 'https://teams.microsoft.com/l/meetup-join/x');
  const ins = posts('graph.microsoft.com');
  assert.equal(ins.length, 1);
  assert.equal(ins[0].url, 'https://graph.microsoft.com/v1.0/me/events');
  assert.deepEqual(ins[0].body.attendees, [{emailAddress: {address: 'jane@acme.com', name: 'Jane van Doe'}, type: 'required'}]);
  assert.deepEqual([ins[0].body.start, ins[0].body.end], [{dateTime: '2026-12-02T20:00:00', timeZone: 'UTC'}, {dateTime: '2026-12-02T20:30:00', timeZone: 'UTC'}]);
  assert.equal(ins[0].body.transactionId, bookingTag(WS, req().idempotencyKey));
  assert.deepEqual([ins[0].body.isOnlineMeeting, ins[0].body.onlineMeetingProvider], [true, 'teamsForBusiness']);
  assert.match(ins[0].body.body.content, /Phone: \+15551234567/);
  const cv = calls.findIndex(c => c.path === '/v1.0/me/calendars/AAA/calendarView'), p = calls.findIndex(c => c.method === 'POST');
  assert.ok(cv >= 0 && p > cv, 'busy times read right before the event is created');
  const again = await book(req());
  assert.deepEqual([again.body.booked, again.body.idempotent], [true, true]);
  assert.equal(posts('graph.microsoft.com').length, 1);
  assert.ok(!JSON.stringify(logs).includes('acme.com'));
});

test('Microsoft booking: no Teams on a personal account; taken slot refused; a lost POST answer is adopted by transactionId', async () => {
  store.save(MS());
  S.msTeams = false;
  S.msBusy.AAA = [{start: {dateTime: '2026-12-02T20:10:00.0000000', timeZone: 'UTC'}, end: {dateTime: '2026-12-02T20:20:00.0000000', timeZone: 'UTC'}, showAs: 'tentative'}];
  let r = await book(req());
  assert.deepEqual([r.body.booked, r.body.reason], [false, 'taken']);
  S.msBusy.AAA = [];
  S.failPost = true;
  r = await book(req({idempotencyKey: 'echo:ms-lost-1'}));
  assert.equal(r.status, 502, 'unknown outcome = retry later with the same key');
  r = await book(req({idempotencyKey: 'echo:ms-lost-1'}));
  assert.equal(r.body.booked, true, JSON.stringify(r.body));
  assert.equal(r.body.location, null, 'no conferencing');
  assert.equal(posts('graph.microsoft.com').length, 1, 'found by transactionId, not created twice');
  assert.equal(posts('graph.microsoft.com')[0].body.isOnlineMeeting, undefined);
});

test('Cal.com booking: attendee name/email/time zone/phone, required text field answered, metadata tag, versions; idempotent; lost answer adopted', async () => {
  store.save(CALCOM());
  S.calFields = [{slug: 'name', type: 'name', isDefault: true, required: true}, {slug: 'what', type: 'textarea', label: 'What to cover?', required: true, isDefault: false}, {slug: 'company', type: 'text', required: false, isDefault: false}];
  let r = await book(req());
  assert.deepEqual([r.body.booked, r.body.reason], [false, 'taken'], 'not one of Cal.com\'s open times');
  S.calSlots = [WED_3PM];
  r = await book(req({idempotencyKey: 'echo:cal-1'}));
  assert.equal(r.body.booked, true, JSON.stringify(r.body));
  const p = posts('api.cal.com')[0];
  assert.equal(p.headers['cal-api-version'], '2024-08-13');
  assert.deepEqual(p.body, {start: WED_3PM, eventTypeId: 11, attendee: {name: 'Jane van Doe', email: 'jane@acme.com', timeZone: 'America/New_York', phoneNumber: '+15551234567'},
    bookingFieldsResponses: {what: 'Booked by Dulcy'}, metadata: {dulcyBooking: bookingTag(WS, 'echo:cal-1')}});
  assert.deepEqual([r.body.eventId, r.body.location, r.body.end], ['CALBK1', 'Cal Video', '2026-12-02T20:30:00.000Z']);
  assert.equal(calls.find(c => c.path === '/v2/event-types/11').headers['cal-api-version'], '2024-06-14');
  r = await book(req({idempotencyKey: 'echo:cal-1'}));
  assert.equal(r.body.idempotent, true);
  S.failPost = true;
  r = await book(req({idempotencyKey: 'echo:cal-lost'}));
  assert.equal(r.status, 502);
  r = await book(req({idempotencyKey: 'echo:cal-lost'}));
  assert.deepEqual([r.body.booked, r.body.eventId], [true, 'CALBK2'], 'found by its metadata tag');
  assert.equal(posts('api.cal.com').length, 2, 'one POST per key');
});

test('required-field refusals: Cal.com select field, HubSpot required consent / question → 400 with a clear reason, nothing booked', async () => {
  store.save(CALCOM());
  S.calSlots = [WED_3PM];
  S.calFields = [{slug: 'budget', type: 'select', label: 'Budget', required: true, isDefault: false}];
  let r = await book(req());
  assert.equal(r.status, 400);
  assert.match(r.body.error, /required "Budget" field \(select\).*make it optional in Cal\.com/);
  assert.equal(posts('api.cal.com').length, 0);
  assert.deepEqual(calcomAnswers({bookingFields: [{slug: 'phone', type: 'phone', required: true}]}, {phone: '+15551234567', name: 'J', description: '', title: 't'}), {phone: '+15551234567'});
  assert.throws(() => calcomAnswers({bookingFields: [{slug: 'phone', type: 'phone', required: true}]}, {phone: '', name: 'J', description: '', title: 't'}), /make it optional/);
  assert.throws(() => hubspotForm({customParams: {legalConsentEnabled: true, legalConsentOptions: {processingConsentType: 'REQUIRED_CHECKBOX'}}}, {}), /consent checkbox/);
  assert.deepEqual(hubspotForm({customParams: {formFields: [{name: 'firstName', isRequired: true}, {name: 'phone', fieldType: 'phonenumber', isRequired: true}, {name: 'notes', fieldType: 'textarea', isRequired: true}]}}, {phone: '+15551234567', name: 'J', description: 'ctx'}),
    {formFields: [{name: 'phone', value: '+15551234567'}, {name: 'notes', value: 'ctx'}], legalConsentResponses: []});
  store.save(HUBC({workspaceId: WS2}));
  S.hsSlots = [WED_3PM]; S.hsForm = [{name: 'industry', fieldType: 'select', label: 'Industry', isRequired: true}];
  r = await book(req({workspace: WS2}));
  assert.equal(r.status, 400);
  assert.match(r.body.error, /required "Industry" question/);
  assert.equal(S.hsBooked.length, 0);
});

test('GoHighLevel booking: contact upsert then appointment (Version headers), taken refused, idempotent, lost answer adopted', async () => {
  store.save(GHLC());
  let r = await book(req());
  assert.deepEqual([r.body.booked, r.body.reason], [false, 'taken']);
  S.ghlSlots = ['2026-12-02T15:00:00-05:00'];
  r = await book(req({idempotencyKey: 'echo:ghl-1'}));
  assert.equal(r.body.booked, true, JSON.stringify(r.body));
  const [up, ap] = posts('services.leadconnectorhq.com');
  assert.equal(up.path, '/contacts/upsert');
  assert.equal(up.headers.Version, '2021-07-28');
  assert.deepEqual(up.body, {locationId: 'LOC1234567890', email: 'jane@acme.com', name: 'Jane van Doe', firstName: 'Jane', lastName: 'van Doe', phone: '+15551234567', source: 'Dulcy reply agent'});
  assert.equal(ap.path, '/calendars/events/appointments');
  assert.equal(ap.headers.Version, '2021-04-15');
  assert.deepEqual(ap.body, {calendarId: 'GCAL1', locationId: 'LOC1234567890', contactId: 'CON1', startTime: WED_3PM, endTime: '2026-12-02T20:30:00.000Z', title: 'Intro call: Acme x Client', appointmentStatus: 'confirmed', toNotify: true, description: 'Booked by Dulcy'});
  assert.ok(!('ignoreFreeSlotValidation' in ap.body), 'GHL still checks the slot itself');
  assert.deepEqual([r.body.eventId, r.body.provider], ['APT1', 'ghl']);
  r = await book(req({idempotencyKey: 'echo:ghl-1'}));
  assert.equal(r.body.idempotent, true);
  S.ghlEvents = []; // a fresh calendar for the lost-answer case
  S.failPost = true;
  r = await book(req({idempotencyKey: 'echo:ghl-lost'}));
  assert.equal(r.status, 502);
  r = await book(req({idempotencyKey: 'echo:ghl-lost'}));
  assert.deepEqual([r.body.booked, r.body.eventId], [true, 'APT1'], 'found on the calendar by contact + time');
  const look = calls.findLast(c => c.path === '/calendars/events');
  assert.deepEqual([look.q.get('calendarId'), look.q.get('startTime')], ['GCAL1', String(Date.parse(WED_3PM) - 60000)]);
  assert.equal(posts('services.leadconnectorhq.com').filter(c => c.path === '/calendars/events/appointments').length, 2, 'one appointment per key');
});

test('GoHighLevel: a lost answer without events read is "uncertain"; a 403 on booking turns booking off with a reconnect status', async () => {
  store.save(GHLC({canReadEvents: false}));
  S.ghlSlots = ['2026-12-02T15:00:00-05:00'];
  S.failPost = true;
  await book(req({idempotencyKey: 'echo:ghl-u'}));
  let r = await book(req({idempotencyKey: 'echo:ghl-u'}));
  assert.deepEqual([r.body.booked, r.body.reason], [false, 'uncertain']);
  S.ghl403 = true;
  r = await book(req({idempotencyKey: 'echo:ghl-403'}));
  assert.equal(r.status, 200);
  assert.deepEqual([r.body.booked, r.body.reason], [false, 'reconnect']);
  assert.match(r.body.message, /GoHighLevel refused the booking/);
  const st = await post('/calendar/admin/status', T.reader, {workspace: WS});
  assert.deepEqual([st.body.status, st.body.canBook, st.body.label], ['Connected', false, 'Connected – reconnect to allow booking']);
  assert.equal(store.booking(WS, 'echo:ghl-403'), null, 'a refused booking leaves no pending record');
});

test('HubSpot booking: first/last name, duration in ms, users, form fields; idempotent; a lost answer is "uncertain", never booked twice', async () => {
  store.save(HUBC());
  S.hsSlots = [WED_3PM];
  S.hsForm = [{name: 'phone', fieldType: 'phonenumber', isRequired: false}];
  let r = await book(req());
  assert.equal(r.body.booked, true, JSON.stringify(r.body));
  assert.deepEqual(S.hsBooked[0], {slug: 'owner-intro', firstName: 'Jane', lastName: 'van Doe', email: 'jane@acme.com', startTime: WED_3PM, duration: 1800000, timezone: 'America/New_York', locale: 'en-us',
    formFields: [{name: 'phone', value: '+15551234567'}], legalConsentResponses: [], likelyAvailableUserIds: ['555']});
  assert.deepEqual([r.body.eventId, r.body.location, r.body.meetLink, r.body.end], ['HSEV1', 'Zoom', 'https://zoom.us/j/123', '2026-12-02T20:30:00.000Z']);
  r = await book(req());
  assert.equal(r.body.idempotent, true);
  S.failPost = true;
  assert.equal((await book(req({idempotencyKey: 'echo:hs-lost'}))).status, 502);
  r = await book(req({idempotencyKey: 'echo:hs-lost'}));
  assert.deepEqual([r.body.booked, r.body.reason], [false, 'uncertain']);
  assert.equal(S.hsBooked.length, 2, 'the uncertain retry did not book');
  S.hsSlots = [];
  r = await book(req({idempotencyKey: 'echo:hs-taken'}));
  assert.deepEqual([r.body.booked, r.body.reason], [false, 'taken']);
});

// ---------- Status, hosts, secrets ----------
test('status: canBook per provider; a revoked key = Reconnect Required with a clear message, credential dropped', async () => {
  store.save(CALCOM()); store.save(HUBC({workspaceId: WS2, canBook: false}));
  let st = await post('/calendar/admin/status', T.reader, {workspace: WS});
  assert.deepEqual([st.body.canBook, st.body.booking, st.body.label], [true, 'ready', 'Connected – booking allowed']);
  st = await post('/calendar/admin/status', T.reader, {workspace: WS2});
  assert.deepEqual([st.body.canBook, st.body.label], [false, 'Connected – reconnect to allow booking']);
  S.calRevoked = true;
  const r = await post('/calendar/admin/availability', T.reader, {workspace: WS, start: '2026-12-02T00:00:00Z', end: '2026-12-03T00:00:00Z'});
  assert.equal(r.status, 400);
  st = await post('/calendar/admin/status', T.reader, {workspace: WS});
  assert.deepEqual([st.body.status, st.body.canBook, st.body.booking, st.body.provider], ['Reconnect Required', false, 'reconnect', 'calcom']);
  assert.match(st.body.label, /Reconnect required – the calendar access expired or lost a permission/);
  assert.equal(store.get(WS).connection.accessToken, undefined, 'the dead key is not kept');
  const b = await book(req());
  assert.equal(b.body.booked, false);
});

test('host allow-list: only the exact API hosts; no port, no credentials in the URL, no redirects', async () => {
  for (const h of ['login.microsoftonline.com', 'graph.microsoft.com', 'api.cal.com', 'services.leadconnectorhq.com', 'api.hubapi.com']) assert.ok(HOSTS.has(h), h);
  assert.ok(!HOSTS.has('app.hubspot.com') && !HOSTS.has('cal.com') && !HOSTS.has('app.cal.com'), 'browser-only hosts never receive a token');
  let fetched = [];
  const fi = async (url, o) => { fetched.push([url, o.redirect]); return new Response('{"ok":true}', {status: 200}); };
  assert.deepEqual(await providerJson('https://api.cal.com/v2/me', {}, fi), {ok: true});
  assert.equal(fetched[0][1], 'error');
  for (const bad of ['https://evil.example.com/v2/me', 'https://api.cal.com:8443/v2/me', 'https://user:pw@graph.microsoft.com/v1.0/me', 'http://api.hubapi.com/x', 'https://app.hubspot.com/oauth/authorize', 'https://graph.microsoft.com.evil.com/'])
    await assert.rejects(providerJson(bad, {}, fi), /Unapproved provider endpoint/, bad);
  assert.equal(fetched.length, 1);
});

test('no secret in errors or logs: provider reasons are masked (key, bearer token, email, HubSpot token in path)', async () => {
  const echo = async () => new Response(JSON.stringify({message: `Invalid API key ${CAL_KEY} for owner@client.com`, error: {message: 'Bearer abcdefghijklmnop rejected'}}), {status: 401});
  const e = await providerJson('https://api.cal.com/v2/me', {headers: {Authorization: 'Bearer ' + CAL_KEY}}, echo).catch(x => x);
  assert.equal(e.status, 401);
  assert.ok(!e.message.includes(CAL_KEY) && !e.message.includes('owner@client.com') && !e.message.includes('abcdefghijklmnop'), e.message);
  assert.match(e.message, /Invalid API key \[secret\]/);
  const hub = async () => new Response(JSON.stringify({message: 'token hs-secret-token-123 expired'}), {status: 400});
  const e2 = await providerJson('https://api.hubapi.com/oauth/v1/access-tokens/hs-secret-token-123', {}, hub).catch(x => x);
  assert.ok(!e2.message.includes('hs-secret-token-123'), e2.message);
  const form = async () => new Response(JSON.stringify({error_description: 'refresh token r3fr3sh-t0ken-value invalid'}), {status: 400});
  const e3 = await providerJson('https://login.microsoftonline.com/common/oauth2/v2.0/token', {method: 'POST', body: 'grant_type=refresh_token&refresh_token=r3fr3sh-t0ken-value&client_secret=sup3rs3cr3t'}, form).catch(x => x);
  assert.ok(!e3.message.includes('r3fr3sh-t0ken-value'), e3.message);
  assert.equal(maskSecrets(`x ${GHL_KEY} y`), 'x [secret] y');
  // A booking error that reaches the engine and the log carries no key either.
  store.save(GHLC({accessToken: 'pit-deadbeef-0000-0000-0000-000000000000'}));
  const r = await book(req());
  assert.equal(r.status, 400);
  assert.ok(!JSON.stringify([r.body, httpLogs, logs]).includes('pit-deadbeef'), JSON.stringify(r.body));
});

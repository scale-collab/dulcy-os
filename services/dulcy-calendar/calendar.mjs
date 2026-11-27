// Calendar evidence and, with the booking permission, one booking per agreed time (Alex 2026-11-27:
// Echo books the agreed time itself after a live availability check). This module never sends email;
// Google sends the invite to the attendee (sendUpdates=all), Calendly sends its own confirmation.
import {randomBytes, createHash, createCipheriv, createDecipheriv} from 'node:crypto';

export function workspaceId(value) {
  if (!/^rec[A-Za-z0-9]{14}$/.test(value || '')) throw Error('Invalid workspace');
  return value;
}
export function seal(value, key, workspace) {
  workspaceId(workspace);
  if (!Buffer.isBuffer(key) || key.length !== 32) throw Error('Encryption key required');
  const iv = randomBytes(12), cipher = createCipheriv('aes-256-gcm', key, iv);
  cipher.setAAD(Buffer.from(workspace));
  return Buffer.concat([iv, cipher.update(JSON.stringify(value)), cipher.final(), cipher.getAuthTag()]).toString('base64url');
}
export function unseal(value, key, workspace) {
  workspaceId(workspace);
  const bytes = Buffer.from(value, 'base64url');
  const decipher = createDecipheriv('aes-256-gcm', key, bytes.subarray(0, 12));
  decipher.setAAD(Buffer.from(workspace));
  decipher.setAuthTag(bytes.subarray(-16));
  return JSON.parse(Buffer.concat([decipher.update(bytes.subarray(12, -16)), decipher.final()]).toString());
}

// readScopes must be granted for any connection. bookingScopes are asked for too; a connection without
// them still reads availability, and its status says "Connected – reconnect to allow booking".
//  - Google calendar.events.owned: see, create, change and delete events on calendars the user owns
//    (the narrowest scope that can create an event with attendees and a Meet link on their primary calendar).
//  - Calendly scheduled_events:write: POST /invitees (Scheduling API "Create Event Invitee").
//    Also asked (extraScopes, not required): scheduled_events:read (find a booking whose answer was lost,
//    read the meeting's join link) and locations:read (the event type's meeting location).
const SPECS = {
  calendly: {
    authorization: 'https://auth.calendly.com/oauth/authorize',
    token: 'https://auth.calendly.com/oauth/token',
    readScopes: ['users:read', 'event_types:read', 'availability:read'],
    bookingScopes: ['scheduled_events:write'],
    extraScopes: ['scheduled_events:read', 'locations:read'],
  },
  google: {
    authorization: 'https://accounts.google.com/o/oauth2/v2/auth',
    token: 'https://oauth2.googleapis.com/token',
    readScopes: ['openid', 'email', 'https://www.googleapis.com/auth/calendar.calendarlist.readonly', 'https://www.googleapis.com/auth/calendar.events.freebusy'],
    bookingScopes: ['https://www.googleapis.com/auth/calendar.events.owned'],
  },
};
export const PROVIDERS = Object.freeze(Object.fromEntries(Object.entries(SPECS).map(([k, v]) =>
  [k, Object.freeze({...v, scopes: [...v.readScopes, ...v.bookingScopes, ...(v.extraScopes || [])]})])));

/** Booking is allowed only on a connection that was granted every booking scope (older connections were not). */
export const canBook = connection => connection?.status === 'Connected' && connection?.canBook === true;

export function beginConnection({workspace, provider, clientId, redirectUri, expectedEmail, now = Date.now()}) {
  workspaceId(workspace);
  const spec = PROVIDERS[provider];
  if (!spec || !clientId) throw Error('Provider application is not configured');
  const redirect = new URL(redirectUri);
  if (redirect.protocol !== 'https:' || redirect.username || redirect.password || redirect.hash || redirect.search) throw Error('A fixed HTTPS callback is required');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(expectedEmail || '')) throw Error('Expected client account email is required');
  const state = randomBytes(32).toString('base64url'), verifier = randomBytes(48).toString('base64url');
  const url = new URL(spec.authorization);
  url.search = new URLSearchParams({client_id: clientId, redirect_uri: redirectUri, response_type: 'code', scope: spec.scopes.join(' '), state,
    code_challenge: createHash('sha256').update(verifier).digest('base64url'), code_challenge_method: 'S256'}).toString();
  if (provider === 'google') { url.searchParams.set('access_type', 'offline'); url.searchParams.set('prompt', 'consent select_account'); }
  return {authorizationUrl: url.href, state, pending: {workspace, provider, expectedEmail: expectedEmail.trim().toLowerCase(), redirectUri, verifier, expiresAt: now + 600_000}};
}

// The caller must atomically consume state before this function is called.
export async function exchangeConnection({pending, code, clientId, clientSecret, fetchJson, now = Date.now()}) {
  if (!pending || pending.expiresAt <= now || !code) throw Error('Authorization expired or missing');
  workspaceId(pending.workspace);
  const spec = PROVIDERS[pending.provider];
  if (!spec) throw Error('Unsupported provider');
  const body = new URLSearchParams({grant_type: 'authorization_code', code, client_id: clientId, client_secret: clientSecret,
    redirect_uri: pending.redirectUri, code_verifier: pending.verifier});
  const token = await fetchJson(spec.token, {method: 'POST', headers: {'Content-Type': 'application/x-www-form-urlencoded'}, body: body.toString()});
  if (!token.access_token || !token.refresh_token || !(Number(token.expires_in) > 0)) throw Error('Provider did not grant renewable access');
  const granted = new Set(String(token.scope || '').split(' '));
  // Google may return the canonical API scope for the requested OIDC email alias.
  if (pending.provider === 'google' && granted.has('https://www.googleapis.com/auth/userinfo.email')) granted.add('email');
  if (spec.readScopes.some(s => !granted.has(s))) throw Error('Required read-only permissions were not granted');
  const bookingGranted = spec.bookingScopes.every(s => granted.has(s));
  const headers = {Authorization: 'Bearer ' + token.access_token};
  const identity = pending.provider === 'calendly'
    ? (await fetchJson('https://api.calendly.com/users/me', {headers})).resource
    : await fetchJson('https://openidconnect.googleapis.com/v1/userinfo', {headers});
  if (!identity || String(identity.email || '').toLowerCase() !== pending.expectedEmail ||
      (pending.provider === 'google' && identity.email_verified !== true)) throw Error('Connected account does not match the invited client');
  const providerUserId = pending.provider === 'calendly' ? identity.uri : identity.sub;
  if (!providerUserId) throw Error('Provider identity missing');
  return {workspaceId: pending.workspace, provider: pending.provider, providerUserId, accountEmail: pending.expectedEmail,
    status: 'Selection Required', canBook: bookingGranted, scopes: [...granted].sort(), accessToken: token.access_token, refreshToken: token.refresh_token,
    expiresAt: now + Number(token.expires_in) * 1000, connectedAt: new Date(now).toISOString()};
}

export function assertConnection(connection, workspace, now = Date.now()) {
  workspaceId(workspace);
  if (!connection || connection.workspaceId !== workspace || connection.status !== 'Connected' || !connection.providerUserId ||
      !connection.accessToken || connection.expiresAt <= now) throw Error('No current authorized calendar for this workspace');
}

export function normalizeCalendly({connection, workspace, event, response, start, end, now = Date.now()}) {
  assertConnection(connection, workspace, now);
  if (connection.provider !== 'calendly' || !event?.active || event.uri !== connection.eventType ||
      !Array.isArray(event.profile?.owner ? [event.profile.owner] : event.owners)) throw Error('Event type must be verified against the connected account');
  const owners = event.profile?.owner ? [event.profile.owner] : event.owners;
  if (!owners.includes(connection.providerUserId)) throw Error('Event type belongs to another account');
  const from = Date.parse(start), until = Date.parse(end);
  if (!(from > now && until > from && until - from <= 7 * 86400_000)) throw Error('Invalid availability window');
  if (!Array.isArray(response?.collection) || response.error) throw Error('Availability lookup failed');
  const seen = new Set(), collection = [];
  for (const slot of response.collection) {
    const time = Date.parse(slot.start_time);
    if (slot.status !== 'available' || Number(slot.invitees_remaining) <= 0 || !Number.isFinite(time) || time < from || time >= until || seen.has(time)) continue;
    seen.add(time); collection.push({start_time: new Date(time).toISOString(), status: 'available', invitees_remaining: Number(slot.invitees_remaining)});
  }
  collection.sort((a,b) => a.start_time.localeCompare(b.start_time));
  return {workspaceId: workspace, eventType: event.uri, provider: 'calendly', fetchedAt: new Date(now).toISOString(), available: collection.length > 0, collection};
}

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
export function checkRules(rules) {
  if (!rules || !TIME.test(rules.start) || !TIME.test(rules.end) || rules.start >= rules.end ||
      !Number.isInteger(rules.durationMinutes) || rules.durationMinutes < 5 || rules.durationMinutes > 240 ||
      !Number.isInteger(rules.bufferMinutes) || rules.bufferMinutes < 0 || rules.bufferMinutes > 120 ||
      !Number.isInteger(rules.noticeMinutes) || rules.noticeMinutes < 0 ||
      !Array.isArray(rules.days) || !rules.days.length || rules.days.some(d => !['Mon','Tue','Wed','Thu','Fri','Sat','Sun'].includes(d))) throw Error('Valid client scheduling rules are required');
}

export function googleSlots({connection, workspace, response, start, end, rules, now = Date.now()}) {
  assertConnection(connection, workspace, now);
  if (connection.provider !== 'google' || !Array.isArray(connection.calendarIds) || !connection.calendarIds.length) throw Error('Choose calendars before checking availability');
  const from = Date.parse(start), until = Date.parse(end);
  if (!(from > now && until > from && until - from <= 7 * 86400_000)) throw Error('Invalid availability window');
  if (Date.parse(response?.timeMin) !== from || Date.parse(response?.timeMax) !== until) throw Error('Availability window does not match');
  checkRules(rules);
  const format = new Intl.DateTimeFormat('en-GB', {timeZone: rules.timezone, weekday: 'short', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23'});
  const parts = t => Object.fromEntries(format.formatToParts(new Date(t)).map(x => [x.type,x.value]));
  const busy = [];
  for (const id of connection.calendarIds) {
    const calendar = response.calendars?.[id];
    if (!calendar || calendar.errors?.length || !Array.isArray(calendar.busy)) throw Error('A selected calendar could not be checked');
    for (const interval of calendar.busy) {
      const a = Date.parse(interval.start), b = Date.parse(interval.end);
      if (!Number.isFinite(a) || !Number.isFinite(b) || b <= a) throw Error('Invalid busy interval');
      busy.push([a - rules.bufferMinutes * 60000, b + rules.bufferMinutes * 60000]);
    }
  }
  const collection = [], duration = rules.durationMinutes * 60000;
  // Iterate UTC instants, then evaluate local office hours: skipped/repeated DST hours stay real instants.
  for (let t = Math.ceil(Math.max(from, now + rules.noticeMinutes * 60000) / 300000) * 300000; t + duration <= until; t += 300000) {
    const a = parts(t), b = parts(t + duration), hm = a.hour + ':' + a.minute, ehm = b.hour + ':' + b.minute;
    if (!rules.days.includes(a.weekday) || hm < rules.start || ehm > rules.end || ehm <= hm ||
        a.year !== b.year || a.month !== b.month || a.day !== b.day || busy.some(([x,y]) => t < y && t + duration > x)) continue;
    collection.push({start_time: new Date(t).toISOString(), end_time: new Date(t + duration).toISOString(), status: 'available', invitees_remaining: 1});
  }
  return {workspaceId: workspace, provider: 'google', fetchedAt: new Date(now).toISOString(), available: collection.length > 0, collection, reserved: false};
}

// ---------- Booking (POST /calendar/admin/book) ----------
export const BOOK_DAYS = 30;
const EMAIL = /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/;

/** Check and tidy one booking request. Throws on anything invalid; never books in the past or past 30 days. */
export function bookingRequest(b, now = Date.now()) {
  const workspace = workspaceId(b?.workspace);
  const start = Date.parse(b?.start);
  if (!Number.isFinite(start) || !/^\d{4}-\d{2}-\d{2}T/.test(String(b?.start))) throw Error('A start time (ISO 8601) is required');
  if (start % 60000) throw Error('Start must be on a whole minute');
  const hasDuration = b?.durationMinutes !== undefined && b?.durationMinutes !== null && b?.durationMinutes !== '';
  let end = b?.end ? Date.parse(b.end) : NaN;
  if (b?.end && !Number.isFinite(end)) throw Error('Invalid end time');
  if (!b?.end && hasDuration) end = start + Number(b.durationMinutes) * 60000;
  if ((b?.end || hasDuration) && !(end - start >= 5 * 60000 && end - start <= 240 * 60000)) throw Error('A meeting is 5 to 240 minutes');
  if (start <= now) throw Error('The time has passed');
  if (start > now + BOOK_DAYS * 86400000) throw Error(`Only times in the next ${BOOK_DAYS} days can be booked`);
  const timezone = String(b?.tz || b?.timezone || '');
  if (!timezone) throw Error('A valid time zone is required');
  try { new Intl.DateTimeFormat('en-US', {timeZone: timezone}); } catch { throw Error('A valid time zone is required'); }
  const email = String(b?.prospect?.email || b?.email || '').trim().toLowerCase();
  if (!EMAIL.test(email) || email.length > 254) throw Error('A valid prospect email is required');
  const name = String(b?.prospect?.name || b?.name || '').replace(/\s+/g, ' ').trim().slice(0, 200) || email.split('@')[0];
  const key = String(b?.idempotencyKey || '');
  if (!/^[A-Za-z0-9_:.-]{8,200}$/.test(key)) throw Error('An idempotency key (8-200 letters, digits, _ : . -) is required');
  return {workspace, start: new Date(start).toISOString(), end: Number.isFinite(end) ? new Date(end).toISOString() : null, timezone, email, name,
    title: String(b?.title || '').replace(/\s+/g, ' ').trim().slice(0, 200) || `Call with ${name}`,
    description: String(b?.description || '').slice(0, 4000), idempotencyKey: key};
}

/** What makes two requests "the same booking": one key must never book something else. */
export const bookingFingerprint = r => createHash('sha256').update(JSON.stringify([r.workspace, r.start, r.email])).digest('hex');

/** Google event ids are base32hex (0-9, a-v), 5-1024 chars: a hex digest of workspace + key is one. Same key = same id = never two events. */
export const googleEventId = (workspace, key) => createHash('sha256').update(workspace + ':' + key).digest('hex').slice(0, 40);

/**
 * Is this exact slot still free on the connected Google calendars, inside the client's scheduling rules?
 * response = freeBusy for [start - buffer, end + buffer]. Pure.
 */
export function googleSlotFree({connection, workspace, response, start, end, rules, now = Date.now()}) {
  assertConnection(connection, workspace, now);
  checkRules(rules);
  const a = Date.parse(start), b = Date.parse(end);
  if (a < now + rules.noticeMinutes * 60000) return {free: false, reason: 'notice'};
  const format = new Intl.DateTimeFormat('en-GB', {timeZone: rules.timezone, weekday: 'short', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23'});
  const parts = t => Object.fromEntries(format.formatToParts(new Date(t)).map(x => [x.type, x.value]));
  const p = parts(a), q = parts(b), hm = p.hour + ':' + p.minute, ehm = q.hour + ':' + q.minute;
  if (!rules.days.includes(p.weekday) || hm < rules.start || ehm > rules.end || ehm <= hm || p.day !== q.day || p.month !== q.month) return {free: false, reason: 'outside_hours'};
  const buffer = rules.bufferMinutes * 60000;
  for (const id of connection.calendarIds) {
    const calendar = response?.calendars?.[id];
    if (!calendar || calendar.errors?.length || !Array.isArray(calendar.busy)) throw Error('A selected calendar could not be checked');
    for (const interval of calendar.busy) {
      const x = Date.parse(interval.start), y = Date.parse(interval.end);
      if (!Number.isFinite(x) || !Number.isFinite(y) || y <= x) throw Error('Invalid busy interval');
      if (a < y + buffer && b > x - buffer) return {free: false, reason: 'taken'};
    }
  }
  return {free: true, reason: ''};
}

/** The Google event: the prospect as attendee and a Meet link, on the client's own primary calendar. */
export function googleEventBody(req, eventId) {
  return {
    id: eventId, summary: req.title, ...(req.description ? {description: req.description} : {}),
    start: {dateTime: req.start, timeZone: req.timezone}, end: {dateTime: req.end, timeZone: req.timezone},
    attendees: [{email: req.email, displayName: req.name}],
    conferenceData: {createRequest: {requestId: eventId, conferenceSolutionKey: {type: 'hangoutsMeet'}}},
    guestsCanModify: false, reminders: {useDefault: true},
  };
}

export function googleBooked(ev, req) {
  const video = (ev?.conferenceData?.entryPoints || []).find(e => e?.entryPointType === 'video')?.uri || ev?.hangoutLink || null;
  return {booked: true, provider: 'google', eventId: String(ev?.id || ''), htmlLink: ev?.htmlLink || null, meetLink: video,
    start: ev?.start?.dateTime ? new Date(ev.start.dateTime).toISOString() : req.start, end: ev?.end?.dateTime ? new Date(ev.end.dateTime).toISOString() : req.end,
    timezone: req.timezone, location: video ? 'Google Meet' : null};
}

/** A Calendly event type location → the POST /invitees location (only kinds that need nothing from the invitee). */
export function calendlyLocation(event) {
  const locs = Array.isArray(event?.locations) ? event.locations : [];
  if (locs.length !== 1) return null;
  const l = locs[0], kind = String(l?.kind || '');
  if (['google_conference', 'zoom_conference', 'microsoft_teams_conference', 'webex_conference', 'gotomeeting_conference', 'inbound_call'].includes(kind)) return {kind};
  if (['physical', 'custom'].includes(kind) && l.location) return {kind, location: String(l.location)};
  return null;
}
export const LOCATION_NAMES = {google_conference: 'Google Meet', zoom_conference: 'Zoom', microsoft_teams_conference: 'Microsoft Teams', webex_conference: 'Webex', gotomeeting_conference: 'GoTo Meeting', inbound_call: 'Phone call', physical: 'In person', custom: 'See invite'};

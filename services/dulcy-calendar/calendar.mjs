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
//  - Microsoft Graph (Outlook / Microsoft 365; /common = work, school and personal accounts):
//    User.Read = /me (identity: mail / userPrincipalName). Calendars.ReadWrite = calendarView (busy times; works
//    for personal accounts, getSchedule does not) and POST /me/events (the booking; Graph sends the invite).
//    Calendars.Read alone (an admin trimmed consent) still reads availability (readAnyOf). offline_access = refresh token.
//  - HubSpot (Scheduler API v3, per HubSpot's public OpenAPI spec): scheduler.meetings.meeting-link.read lists meeting
//    links, their booking info and availability. POST .../meeting-links/book accepts any ONE of a list of CRM write
//    scopes; crm.objects.contacts.write is the one asked (a booking creates or updates the contact).
//    "oauth" is asked too (extraScopes): HubSpot apps have always carried it. UNKNOWN whether new-platform apps
//    still require it; it is not checked on the token.
//  - Cal.com and GoHighLevel: no OAuth. The client pastes a per-account key on our connect page (paste: true).
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
  microsoft: {
    authorization: 'https://login.microsoftonline.com/common/oauth2/v2.0/authorize',
    token: 'https://login.microsoftonline.com/common/oauth2/v2.0/token',
    readScopes: ['User.Read'],
    readAnyOf: ['Calendars.Read', 'Calendars.ReadWrite'],
    bookingScopes: ['Calendars.ReadWrite'],
    extraScopes: ['offline_access'],
  },
  hubspot: {
    authorization: 'https://app.hubspot.com/oauth/authorize',
    token: 'https://api.hubapi.com/oauth/v1/token',
    readScopes: ['scheduler.meetings.meeting-link.read'],
    bookingScopes: ['crm.objects.contacts.write'],
    extraScopes: ['oauth'],
  },
  calcom: {paste: true, readScopes: [], bookingScopes: []},
  ghl: {paste: true, readScopes: [], bookingScopes: []},
};
export const PROVIDERS = Object.freeze(Object.fromEntries(Object.entries(SPECS).map(([k, v]) =>
  [k, Object.freeze({...v, scopes: [...v.readScopes, ...v.bookingScopes, ...(v.extraScopes || [])]})])));
/** Providers whose key the client pastes on our page (no OAuth app on Alex's side). */
export const PASTE_PROVIDERS = Object.freeze(Object.keys(SPECS).filter(k => SPECS[k].paste));
/** Providers where Dulcy computes open times from busy times + the client's own scheduling rules. */
export const RULE_PROVIDERS = Object.freeze(['google', 'microsoft']);
export const PROVIDER_NAMES = Object.freeze({google: 'Google Calendar', microsoft: 'Microsoft Outlook', calendly: 'Calendly', calcom: 'Cal.com', ghl: 'GoHighLevel', hubspot: 'HubSpot Meetings'});
/** A pasted key has no timer; it stops working when revoked (then the status becomes Reconnect Required). */
export const KEY_EXPIRES = 8.64e15;
export const GHL_CALENDARS_VERSION = '2021-04-15';
export const GHL_CONTACTS_VERSION = '2021-07-28';
export const CALCOM_SLOTS_VERSION = '2024-09-04', CALCOM_BOOKINGS_VERSION = '2024-08-13', CALCOM_EVENT_TYPES_VERSION = '2024-06-14';

/** Booking is allowed only on a connection that was granted every booking scope (older connections were not). */
export const canBook = connection => connection?.status === 'Connected' && connection?.canBook === true;

export function beginConnection({workspace, provider, clientId, redirectUri, expectedEmail, now = Date.now()}) {
  workspaceId(workspace);
  const spec = PROVIDERS[provider];
  if (!spec || spec.paste || !clientId) throw Error('Provider application is not configured');
  const redirect = new URL(redirectUri);
  if (redirect.protocol !== 'https:' || redirect.username || redirect.password || redirect.hash || redirect.search) throw Error('A fixed HTTPS callback is required');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(expectedEmail || '')) throw Error('Expected client account email is required');
  const state = randomBytes(32).toString('base64url'), verifier = randomBytes(48).toString('base64url');
  const url = new URL(spec.authorization);
  url.search = new URLSearchParams({client_id: clientId, redirect_uri: redirectUri, response_type: 'code', scope: spec.scopes.join(' '), state,
    code_challenge: createHash('sha256').update(verifier).digest('base64url'), code_challenge_method: 'S256'}).toString();
  if (provider === 'google') { url.searchParams.set('access_type', 'offline'); url.searchParams.set('prompt', 'consent select_account'); }
  if (provider === 'microsoft') { url.searchParams.set('response_mode', 'query'); url.searchParams.set('prompt', 'select_account'); }
  return {authorizationUrl: url.href, state, pending: {workspace, provider, expectedEmail: expectedEmail.trim().toLowerCase(), redirectUri, verifier, expiresAt: now + 600_000}};
}

// Scope names compare case-insensitively; Microsoft may answer with the resource form
// ("https://graph.microsoft.com/Calendars.ReadWrite").
const scopeKey = s => String(s).replace(/^https:\/\/graph\.microsoft\.com\//i, '').toLowerCase();

// The caller must atomically consume state before this function is called.
export async function exchangeConnection({pending, code, clientId, clientSecret, fetchJson, now = Date.now()}) {
  if (!pending || pending.expiresAt <= now || !code) throw Error('Authorization expired or missing');
  workspaceId(pending.workspace);
  const spec = PROVIDERS[pending.provider];
  if (!spec || spec.paste) throw Error('Unsupported provider');
  const body = new URLSearchParams({grant_type: 'authorization_code', code, client_id: clientId, client_secret: clientSecret,
    redirect_uri: pending.redirectUri, code_verifier: pending.verifier});
  const token = await fetchJson(spec.token, {method: 'POST', headers: {'Content-Type': 'application/x-www-form-urlencoded'}, body: body.toString()});
  if (!token.access_token || !token.refresh_token || !(Number(token.expires_in) > 0)) throw Error('Provider did not grant renewable access');
  const headers = {Authorization: 'Bearer ' + token.access_token};
  // HubSpot: the token's scopes and user come from its access-token info endpoint (GET /oauth/v1/access-tokens/{token}).
  const hubInfo = pending.provider === 'hubspot' ? await fetchJson('https://api.hubapi.com/oauth/v1/access-tokens/' + encodeURIComponent(token.access_token), {}) : null;
  // Scopes may come space- or comma-separated. Calendly's token answer may leave "scope" out (or say the
  // legacy "default"): Calendly shows all of an app's scopes on one consent screen with nothing to untick,
  // so there the /users/me call below (it needs users:read) is the check instead.
  const listed = (hubInfo ? (Array.isArray(hubInfo.scopes) ? hubInfo.scopes : []) : String(token.scope ?? '').split(/[\s,]+/)).map(String).filter(Boolean);
  const unlisted = pending.provider === 'calendly' && (!listed.length || listed.every(s => s === 'default'));
  const granted = new Set((unlisted ? spec.scopes : listed).map(scopeKey));
  // Google may return the canonical API scope for the requested OIDC email alias.
  if (pending.provider === 'google' && granted.has('https://www.googleapis.com/auth/userinfo.email')) granted.add('email');
  const has = s => granted.has(scopeKey(s));
  if (spec.readScopes.some(s => !has(s)) || (spec.readAnyOf && !spec.readAnyOf.some(has))) throw Error('Required read-only permissions were not granted');
  const bookingGranted = spec.bookingScopes.every(has);
  let emails, providerUserId, extra = {};
  if (pending.provider === 'calendly') {
    const me = (await fetchJson('https://api.calendly.com/users/me', {headers})).resource;
    emails = [me?.email]; providerUserId = me?.uri;
  } else if (pending.provider === 'google') {
    const me = await fetchJson('https://openidconnect.googleapis.com/v1/userinfo', {headers});
    emails = me?.email_verified === true ? [me.email] : []; providerUserId = me?.sub;
  } else if (pending.provider === 'microsoft') {
    // Personal accounts may have no "mail"; their userPrincipalName is the sign-in address. A work account's
    // UPN is on a domain its tenant verified. The one-time invite link is the other half of the proof.
    const me = await fetchJson('https://graph.microsoft.com/v1.0/me?$select=id,mail,userPrincipalName', {headers});
    emails = [me?.mail, me?.userPrincipalName]; providerUserId = me?.id;
  } else {
    emails = [hubInfo?.user];
    providerUserId = hubInfo?.hub_id && hubInfo?.user_id ? hubInfo.hub_id + ':' + hubInfo.user_id : '';
    extra = {hubId: String(hubInfo?.hub_id || '')};
  }
  if (!emails.some(e => String(e || '').trim().toLowerCase() === pending.expectedEmail)) throw Error('Connected account does not match the invited client');
  if (!providerUserId) throw Error('Provider identity missing');
  return {workspaceId: pending.workspace, provider: pending.provider, providerUserId, accountEmail: pending.expectedEmail,
    status: 'Selection Required', canBook: bookingGranted, scopes: [...granted].sort(), scopesListed: !unlisted, accessToken: token.access_token, refreshToken: token.refresh_token,
    expiresAt: now + Number(token.expires_in) * 1000, connectedAt: new Date(now).toISOString(), ...extra};
}

/** A client-safe error: its message may be shown on the connect page (never a key, never another account's email). */
export const publicError = (message, status = 400) => Object.assign(Error(message), {status, public: true});

/**
 * Cal.com / GoHighLevel: check a pasted key against the provider's "me" / account endpoint and build the connection.
 * The key is stored sealed like an OAuth token (accessToken) and is never echoed back or logged.
 */
export async function keyConnection({workspace, provider, expectedEmail, fields, fetchJson, now = Date.now()}) {
  workspaceId(workspace);
  const email = String(expectedEmail || '').trim().toLowerCase();
  const base = {workspaceId: workspace, provider, accountEmail: email, status: 'Selection Required', canBook: true, credential: 'key',
    refreshToken: null, expiresAt: KEY_EXPIRES, connectedAt: new Date(now).toISOString(), scopes: [], scopesListed: false};
  const refused = (e, who, hint) => {
    if (e?.status === 401) return publicError(`${who} did not accept this key. Copy the whole key and try again.`);
    if (e?.status === 403) return publicError(`This key is missing a permission: ${hint}`);
    if (e?.status && e.status < 500) return publicError(`${who} refused the key (${e.status}). Check it and try again.`);
    return publicError(`${who} could not be reached just now. Try again in a minute.`, 502);
  };
  if (provider === 'calcom') {
    const key = String(fields?.apiKey || '').trim();
    // Cal.com v2: "Bearer <api key prefixed with cal_>" (OpenAPI, Authorization header).
    if (!/^cal_[A-Za-z0-9_]{8,200}$/.test(key)) throw publicError('That does not look like a Cal.com API key (it starts with cal_).');
    let me;
    try { me = (await fetchJson('https://api.cal.com/v2/me', {headers: {Authorization: 'Bearer ' + key}}))?.data; }
    catch (e) { throw refused(e, 'Cal.com', 'create a new key in Cal.com → Settings → Developer → API keys.'); }
    if (!me?.id) throw publicError('Cal.com did not say which account this key belongs to.');
    if (String(me.email || '').trim().toLowerCase() !== email) throw publicError(`This key belongs to a different Cal.com account. Sign in to Cal.com as ${email} and create the key there.`);
    let timezone = '';
    try { if (me.timeZone) { new Intl.DateTimeFormat('en-US', {timeZone: me.timeZone}); timezone = me.timeZone; } } catch { timezone = ''; }
    return {...base, providerUserId: String(me.id), accessToken: key, username: String(me.username || ''), timezone};
  }
  if (provider === 'ghl') {
    const key = String(fields?.apiKey || '').trim(), locationId = String(fields?.locationId || '').trim();
    // Private Integration tokens look like "pit-<uuid>" (UNKNOWN whether always): any token-shaped value is accepted.
    if (!/^[A-Za-z0-9._-]{20,4000}$/.test(key)) throw publicError('That does not look like a GoHighLevel Private Integration token.');
    if (!/^[A-Za-z0-9]{8,64}$/.test(locationId)) throw publicError('The Location ID is letters and digits only (Settings → Business Profile).');
    const headers = {Authorization: 'Bearer ' + key, Version: GHL_CALENDARS_VERSION, Accept: 'application/json'};
    let list;
    try { list = await fetchJson('https://services.leadconnectorhq.com/calendars/?locationId=' + encodeURIComponent(locationId), {headers}); }
    catch (e) { throw refused(e, 'GoHighLevel', 'tick "View Calendars" (calendars.readonly) on the Private Integration, and check the Location ID.'); }
    if (!Array.isArray(list?.calendars)) throw publicError('GoHighLevel did not list this sub-account\'s calendars. Check the Location ID.');
    if (!list.calendars.length) throw publicError('This sub-account has no calendars yet. Create the booking calendar in GoHighLevel first.');
    // Optional: calendars/events.readonly lets a booking whose answer was lost be found instead of left unclear.
    let canReadEvents = false;
    try {
      const u = new URL('https://services.leadconnectorhq.com/calendars/events');
      u.search = new URLSearchParams({locationId, calendarId: String(list.calendars[0].id), startTime: String(now), endTime: String(now + 86400_000)}).toString();
      canReadEvents = Array.isArray((await fetchJson(u.href, {headers}))?.events);
    } catch { canReadEvents = false; }
    // GoHighLevel exposes no account email for a Private Integration token, so there is no email check: the token
    // working on this Location ID plus the one-time invite link are the proof. Write permissions can't be read without
    // writing: a 403 on the first booking turns booking off with a "reconnect" status (calendar-provider.mjs).
    return {...base, providerUserId: locationId, locationId, accessToken: key, canReadEvents};
  }
  throw Error('Unsupported provider');
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
  if (!RULE_PROVIDERS.includes(connection.provider) || !Array.isArray(connection.calendarIds) || !connection.calendarIds.length) throw Error('Choose calendars before checking availability');
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
  return {workspaceId: workspace, provider: connection.provider, fetchedAt: new Date(now).toISOString(), available: collection.length > 0, collection, reserved: false};
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
  const phoneRaw = String(b?.prospect?.phone || b?.phone || '').replace(/[^\d+]/g, '');
  const phone = /^\+\d{8,15}$/.test(phoneRaw) ? phoneRaw : '';
  const key = String(b?.idempotencyKey || '');
  if (!/^[A-Za-z0-9_:.-]{8,200}$/.test(key)) throw Error('An idempotency key (8-200 letters, digits, _ : . -) is required');
  return {workspace, start: new Date(start).toISOString(), end: Number.isFinite(end) ? new Date(end).toISOString() : null, timezone, email, name, phone,
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
    id: eventId, summary: req.title, ...(req.description || req.phone ? {description: [req.description, req.phone ? `Phone: ${req.phone}` : ''].filter(Boolean).join('\n')} : {}),
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
/**
 * Answers for the event type's REQUIRED intake questions (Calendly refuses a booking without them).
 * Text questions get the booking context; a required phone or choice question can't be answered
 * truthfully, so the booking is refused with a clear reason instead of guessing.
 */
export function calendlyAnswers(event, req) {
  const qs = Array.isArray(event?.custom_questions) ? event.custom_questions : [];
  const out = [];
  for (const q of qs) {
    if (!q || q.enabled === false) continue;
    const type = String(q.type || 'string');
    // A phone question gets the prospect's number when we have one (required or not).
    if (type === 'phone_number' && req.phone) { out.push({question: String(q.name || ''), answer: req.phone, position: Number(q.position) || 0}); continue; }
    if (!q.required) continue;
    if (type === 'string' || type === 'text') {
      const answer = (req.description || `Meeting booked by email reply with ${req.name}`).slice(0, type === 'string' ? 255 : 10000);
      out.push({question: String(q.name || ''), answer, position: Number(q.position) || 0});
    } else {
      const e = Error(`Calendly event type has a required "${String(q.name || type).slice(0, 80)}" question (${type}) the assistant can't answer: make it optional in Calendly`);
      e.status = 400; throw e;
    }
  }
  return out;
}
export function calendlyLocation(event) {
  const locs = Array.isArray(event?.locations) ? event.locations : [];
  if (locs.length !== 1) return null;
  const l = locs[0], kind = String(l?.kind || '');
  if (['google_conference', 'zoom_conference', 'microsoft_teams_conference', 'webex_conference', 'gotomeeting_conference', 'inbound_call'].includes(kind)) return {kind};
  if (['physical', 'custom'].includes(kind) && l.location) return {kind, location: String(l.location)};
  return null;
}
export const LOCATION_NAMES = {google_conference: 'Google Meet', zoom_conference: 'Zoom', microsoft_teams_conference: 'Microsoft Teams', webex_conference: 'Webex', gotomeeting_conference: 'GoTo Meeting', inbound_call: 'Phone call', physical: 'In person', custom: 'See invite'};

// ---------- Microsoft, Cal.com, GoHighLevel, HubSpot (2026-11-27) ----------
const refuse = message => Object.assign(Error(message), {status: 400});

/** A per-workspace booking tag from the idempotency key: Graph transactionId, Cal.com metadata. Same key = same tag. */
export const bookingTag = (workspace, key) => createHash('sha256').update('dulcy-booking:' + workspace + ':' + key).digest('hex').slice(0, 40);

/** Graph dateTime + timeZone ("2026-12-02T20:00:00.0000000", "UTC") → epoch ms. We ask for UTC (Prefer: outlook.timezone="UTC"). */
export function graphTime(v) {
  const tz = String(v?.timeZone || ''), dt = String(v?.dateTime || '');
  if (!/^(UTC|Etc\/UTC|tzone:\/\/Microsoft\/Utc)$/i.test(tz) || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?$/.test(dt)) throw Error('Unexpected time in the Outlook calendar answer');
  return Date.parse(dt.replace(/(\.\d{3})\d+$/, '$1') + 'Z');
}

/**
 * Outlook calendarView pages for each selected calendar → the same free/busy shape Google returns, so the client's
 * own scheduling rules (googleSlots / googleSlotFree) apply unchanged. Free and working-elsewhere time and
 * cancelled events do not block. Pure.
 */
export function microsoftFreeBusy(eventsByCalendar, timeMin, timeMax) {
  const calendars = {};
  for (const [id, events] of Object.entries(eventsByCalendar)) {
    if (!Array.isArray(events)) { calendars[id] = {errors: [{reason: 'unreadable'}]}; continue; }
    const busy = [];
    for (const ev of events) {
      if (!ev || ev.isCancelled === true || ['free', 'workingElsewhere'].includes(ev.showAs)) continue;
      const a = graphTime(ev.start), b = graphTime(ev.end);
      busy.push({start: new Date(a).toISOString(), end: new Date(b).toISOString()});
    }
    calendars[id] = {busy};
  }
  return {timeMin, timeMax, calendars};
}

/** Start times the provider says are bookable → the service's availability answer (inside the window, future, no repeats). Pure. */
export function slotCollection({connection, workspace, starts, start, end, now = Date.now(), maxDays = 7}) {
  assertConnection(connection, workspace, now);
  const from = Date.parse(start), until = Date.parse(end);
  if (!(from > now && until > from && until - from <= maxDays * 86400_000)) throw Error('Invalid availability window');
  if (!Array.isArray(starts)) throw Error('Availability lookup failed');
  const seen = new Set(), collection = [];
  for (const s of starts) {
    const t = typeof s === 'number' ? s : Date.parse(s);
    if (!Number.isFinite(t) || t < from || t >= until || t <= now || seen.has(t)) continue;
    seen.add(t); collection.push({start_time: new Date(t).toISOString(), status: 'available', invitees_remaining: 1});
  }
  collection.sort((a, b) => a.start_time.localeCompare(b.start_time));
  return {workspaceId: workspace, provider: connection.provider, fetchedAt: new Date(now).toISOString(), available: collection.length > 0, collection};
}

/** Cal.com GET /v2/slots (cal-api-version 2024-09-04): {status:'success', data:{'2026-12-02':[{start}|'iso']}}. */
export function calcomStarts(r) {
  if (r?.status !== 'success' || !r.data || typeof r.data !== 'object' || Array.isArray(r.data)) throw Error('Availability lookup failed');
  return Object.values(r.data).flatMap(day => Array.isArray(day) ? day.map(x => typeof x === 'string' ? x : x?.start) : []);
}
/** GoHighLevel GET /calendars/{id}/free-slots: {'2026-12-02': {slots: ['2026-12-02T10:00:00-05:00']}, traceId}. */
export function ghlStarts(r) {
  if (!r || typeof r !== 'object' || Array.isArray(r)) throw Error('Availability lookup failed');
  return Object.entries(r).filter(([k]) => /^\d{4}-\d{2}-\d{2}$/.test(k)).flatMap(([, v]) => Array.isArray(v?.slots) ? v.slots : []);
}
/** HubSpot availability-page: linkAvailability.linkAvailabilityByDuration[*] = {meetingDurationMillis, availabilities:[{startMillisUtc}]}. */
export function hubspotStarts(r, durationMs) {
  const by = r?.linkAvailability?.linkAvailabilityByDuration;
  if (!by || typeof by !== 'object') throw Error('Availability lookup failed');
  const all = Object.values(by).filter(x => Array.isArray(x?.availabilities));
  const pick = all.find(x => Number(x.meetingDurationMillis) === Number(durationMs)) || (all.length === 1 ? all[0] : null);
  if (!pick) throw Error('The meeting link has no availability for its meeting length');
  return pick.availabilities.map(a => Number(a?.startMillisUtc));
}

const context = req => req.description || `Meeting booked by email reply with ${req.name}`;

/**
 * Cal.com bookingFieldsResponses for the event type's REQUIRED custom booking fields (like Calendly's questions).
 * Text fields get the booking context, a phone field the prospect's phone; anything else required is refused with
 * a clear reason. Default fields (name, email, guests…) are filled from the attendee by Cal.com.
 */
export function calcomAnswers(eventType, req) {
  const out = {};
  for (const f of Array.isArray(eventType?.bookingFields) ? eventType.bookingFields : []) {
    if (!f || f.hidden === true) continue;
    const slug = String(f.slug || ''), type = String(f.type || '');
    if (f.isDefault) {
      if (slug === 'title' && f.required) out.title = req.title.slice(0, 255);
      else if (slug === 'notes' && f.required) out.notes = context(req).slice(0, 2000);
      else if (slug === 'attendeePhoneNumber' && f.required && !req.phone) throw refuse('Cal.com event type requires the attendee\'s phone and we have none: make it optional in Cal.com');
      continue;
    }
    if (!slug) continue;
    if (type === 'phone' && req.phone) { out[slug] = req.phone; continue; }
    if (!f.required) continue;
    if (type === 'text' || type === 'textarea') out[slug] = context(req).slice(0, type === 'text' ? 255 : 2000);
    else throw refuse(`Cal.com event type has a required "${String(f.label || slug).slice(0, 80)}" field (${type || 'unknown'}) the assistant can't answer: make it optional in Cal.com`);
  }
  return out;
}

const STANDARD_HUBSPOT = new Set(['firstname', 'lastname', 'email']);
/**
 * HubSpot formFields for the meeting link's REQUIRED questions, from GET .../book/{slug} customParams. A required
 * consent checkbox can't be ticked on someone's behalf, so such a link is refused with a clear reason.
 */
export function hubspotForm(info, req) {
  const p = info?.customParams || {};
  const consent = p.legalConsentOptions || {};
  if (p.legalConsentEnabled === true && (consent.processingConsentType === 'REQUIRED_CHECKBOX' || (consent.communicationConsentCheckboxes || []).some(c => c?.required)))
    throw refuse('HubSpot meeting link requires a consent checkbox the prospect must tick themselves: turn the required consent off on that meeting link');
  const formFields = [];
  for (const f of Array.isArray(p.formFields) ? p.formFields : []) {
    const name = String(f?.name || ''), kind = String(f?.fieldType || f?.type || '').toLowerCase();
    if (!name || STANDARD_HUBSPOT.has(name.toLowerCase())) continue;
    const phoneish = name.toLowerCase() === 'phone' || kind.includes('phone');
    if (phoneish && req.phone) { formFields.push({name, value: req.phone}); continue; }
    if (!f.isRequired) continue;
    if (['text', 'textarea', 'string'].includes(kind)) formFields.push({name, value: context(req).slice(0, 1000)});
    else throw refuse(`HubSpot meeting link has a required "${String(f.label || name).slice(0, 80)}" question (${kind || 'unknown'}) the assistant can't answer: make it optional in HubSpot`);
  }
  return {formFields, legalConsentResponses: []};
}

/** "Jane van Doe" → {first: 'Jane', last: 'van Doe'}. HubSpot requires a last name: '-' when there is none (UNKNOWN if '' is accepted). */
export function splitName(name) {
  const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
  return {first: parts[0] || '-', last: parts.slice(1).join(' ') || '-'};
}

/** A meeting URL → its service name (for "Booked: … (Zoom)"). */
export function videoName(url) {
  const u = String(url || '');
  if (!/^https:\/\//.test(u)) return null;
  if (/meet\.google\.com/.test(u)) return 'Google Meet';
  if (/teams\.(microsoft|live)\.com/.test(u)) return 'Microsoft Teams';
  if (/zoom\.us/.test(u)) return 'Zoom';
  if (/cal\.com\/video|cal\.video/.test(u)) return 'Cal Video';
  return 'Video call';
}

/** The Outlook event: on the client's default calendar, the prospect as attendee (Graph sends the invite), Teams when allowed. */
export function microsoftEventBody(req, transactionId, teams) {
  const notes = [req.description, req.phone ? `Phone: ${req.phone}` : ''].filter(Boolean).join('\n');
  return {
    subject: req.title, ...(notes ? {body: {contentType: 'text', content: notes}} : {}),
    start: {dateTime: req.start.slice(0, 19), timeZone: 'UTC'}, end: {dateTime: req.end.slice(0, 19), timeZone: 'UTC'},
    attendees: [{emailAddress: {address: req.email, name: req.name}, type: 'required'}],
    transactionId, allowNewTimeProposals: false, responseRequested: true,
    ...(teams ? {isOnlineMeeting: true, onlineMeetingProvider: 'teamsForBusiness'} : {}),
  };
}
export function microsoftBooked(ev, req) {
  const join = ev?.onlineMeeting?.joinUrl || null;
  let start = req.start, end = req.end;
  try { start = new Date(graphTime(ev.start)).toISOString(); end = new Date(graphTime(ev.end)).toISOString(); } catch { /* keep the request's times */ }
  return {booked: true, provider: 'microsoft', eventId: String(ev?.id || ''), htmlLink: ev?.webLink || null, meetLink: join, start, end, timezone: req.timezone, location: join ? 'Microsoft Teams' : null};
}

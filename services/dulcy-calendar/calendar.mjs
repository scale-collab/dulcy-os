// Calendar evidence only. This module cannot book meetings or send messages.
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

export const PROVIDERS = Object.freeze({
  calendly: {
    authorization: 'https://auth.calendly.com/oauth/authorize',
    token: 'https://auth.calendly.com/oauth/token',
    scopes: ['users:read', 'event_types:read', 'availability:read'],
  },
  google: {
    authorization: 'https://accounts.google.com/o/oauth2/v2/auth',
    token: 'https://oauth2.googleapis.com/token',
    scopes: ['openid', 'email', 'https://www.googleapis.com/auth/calendar.calendarlist.readonly', 'https://www.googleapis.com/auth/calendar.events.freebusy'],
  },
});

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
  if (spec.scopes.some(s => !granted.has(s))) throw Error('Required read-only permissions were not granted');
  const headers = {Authorization: 'Bearer ' + token.access_token};
  const identity = pending.provider === 'calendly'
    ? (await fetchJson('https://api.calendly.com/users/me', {headers})).resource
    : await fetchJson('https://openidconnect.googleapis.com/v1/userinfo', {headers});
  if (!identity || String(identity.email || '').toLowerCase() !== pending.expectedEmail ||
      (pending.provider === 'google' && identity.email_verified !== true)) throw Error('Connected account does not match the invited client');
  const providerUserId = pending.provider === 'calendly' ? identity.uri : identity.sub;
  if (!providerUserId) throw Error('Provider identity missing');
  return {workspaceId: pending.workspace, provider: pending.provider, providerUserId, accountEmail: pending.expectedEmail,
    status: 'Selection Required', accessToken: token.access_token, refreshToken: token.refresh_token,
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

export function googleSlots({connection, workspace, response, start, end, rules, now = Date.now()}) {
  assertConnection(connection, workspace, now);
  if (connection.provider !== 'google' || !Array.isArray(connection.calendarIds) || !connection.calendarIds.length) throw Error('Choose calendars before checking availability');
  const from = Date.parse(start), until = Date.parse(end);
  if (!(from > now && until > from && until - from <= 7 * 86400_000)) throw Error('Invalid availability window');
  if (Date.parse(response?.timeMin) !== from || Date.parse(response?.timeMax) !== until) throw Error('Availability window does not match');
  const time = /^([01]\d|2[0-3]):[0-5]\d$/;
  if (!rules || !time.test(rules.start) || !time.test(rules.end) || rules.start >= rules.end ||
      !Number.isInteger(rules.durationMinutes) || rules.durationMinutes < 5 || rules.durationMinutes > 240 ||
      !Number.isInteger(rules.bufferMinutes) || rules.bufferMinutes < 0 || rules.bufferMinutes > 120 ||
      !Number.isInteger(rules.noticeMinutes) || rules.noticeMinutes < 0 ||
      !Array.isArray(rules.days) || !rules.days.length || rules.days.some(d => !['Mon','Tue','Wed','Thu','Fri','Sat','Sun'].includes(d))) throw Error('Valid client scheduling rules are required');
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

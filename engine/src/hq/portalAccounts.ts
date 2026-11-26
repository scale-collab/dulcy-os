// Client portal logins (portal.dulcy.io, 2026-11-26). As in Softr, anyone can sign up and sees
// nothing until linked to a client. Unlike Softr, nothing is linked automatically by email (there is
// no email verification), with one exception: a Google-verified email that the Airtable Portal Users
// table links to exactly one active client.
//   - Portal sign-up → a pending request (portal_signup) on HQ → Users, with the client Portal Users
//     suggests. The owner links it with one tap (linkPortalUser).
//   - Existing Softr users: their passwords cannot be moved. The owner presses "Send setup link"
//     (inviteSoftrUser / makeSetupLink): a one-time link, valid 7 days, that the owner copies and
//     sends (HQ sends no email). The same link answers "Forgot password" (the client asks on the
//     portal; the owner sees the ask on Users).
// Portal Users is read by field ID, never its Password column.
import { createHash, randomBytes } from 'node:crypto';
import type { Db } from '../db/pool.js';
import { val } from '../agents/emailsFields.js';
import type { HqAirtable } from './decisions.js';
import { FAIL_WINDOW_MIN, MAX_FAILS_PER_EMAIL, MAX_FAILS_PER_IP, MIN_PASSWORD, firstName, hashPassword, normEmail, toUser, verifyPassword, type HqUser } from './auth.js';
import { logUserEvent } from './users.js';
import { cachedPortalSource, groupName, groupOf } from './portal.js';
import { PU, T } from './portalFields.js';

export const SETUP_DAYS = 7;
export const RESET_SENT = 'If that email has a portal login, your Dulcy team will send you a link to set a new password.';
const sha = (s: string) => createHash('sha256').update(s).digest('hex');
const REC = /^rec[A-Za-z0-9]{14}$/;
const recIds = (x: unknown): string[] => (Array.isArray(x) ? x : []).map((y: any) => (typeof y === 'string' ? y : y?.id)).filter((y): y is string => typeof y === 'string' && REC.test(y));

export interface PortalUserRow { rec: string; name: string; email: string; clients: string[]; lastSeen: string }
let puCache: { at: number; data: Promise<PortalUserRow[]> } | null = null;
export function _resetPortalUsersCache() { puCache = null; }
/** The Airtable Portal Users rows (Softr's users), cached 60 seconds. */
export function portalUsers(at: Pick<HqAirtable, 'list'>, now = Date.now()): Promise<PortalUserRow[]> {
  if (puCache && now - puCache.at < 60_000) return puCache.data;
  const data = at.list(T.portalUsers, `{Email}!=''`, [PU.name, PU.email, PU.client, PU.lastSeen], 3000)
    .then((rows) => rows.map((r) => ({ rec: r.id, name: val(r.fields[PU.name]), email: normEmail(val(r.fields[PU.email])), clients: recIds(r.fields[PU.client]), lastSeen: val(r.fields[PU.lastSeen]) })));
  puCache = { at: now, data };
  data.catch(() => { if (puCache?.data === data) puCache = null; });
  return data;
}

/** The one client the Portal Users rows of this email point at (its main record and name), or null when none or more than one. */
export async function suggestedClient(at: Pick<HqAirtable, 'list'>, email: string, opts: { activeOnly?: boolean } = {}): Promise<{ id: string; name: string } | null> {
  const e = normEmail(email);
  if (!e) return null;
  const rows = (await portalUsers(at)).filter((r) => r.email === e);
  const ws = (await cachedPortalSource(at)).ws;
  const groups = new Map<string, ReturnType<typeof groupOf>>();
  for (const id of rows.flatMap((r) => r.clients)) { const g = groupOf(ws, id); groups.set(g ? g[0].id : `missing:${id}`, g); }
  if (groups.size !== 1) return null;
  const g = [...groups.values()][0];
  if (!g) return null;
  if (opts.activeOnly && !g.some((w) => val(w.fields.Status) === 'Active')) return null;
  return { id: g[0].id, name: groupName(g) };
}

/** Owner: link a portal request to a client (it becomes that client's login). */
export async function linkPortalUser(db: Db, actor: HqUser, id: number, clientRec: string, resolve: (rec: string) => Promise<{ id: string; name: string } | null>): Promise<{ status: number; error?: string }> {
  if (actor.role !== 'owner') return { status: 403, error: 'only the owner manages users' };
  if (!REC.test(clientRec)) return { status: 400, error: 'Pick the client this login is for.' };
  const u = (await db.query(`SELECT id, email, pending, portal_signup FROM hq_users WHERE id=$1`, [id])).rows[0];
  if (!u) return { status: 404, error: 'no such user' };
  if (!u.pending || !u.portal_signup) return { status: 409, error: 'Only a client portal request can be linked.' };
  const c = await resolve(clientRec);
  if (!c || !REC.test(c.id)) return { status: 400, error: 'That client was not found in Airtable.' };
  await db.query(`UPDATE hq_users SET role='client', client_rec=$2, client_name=$3, pending=false, disabled=false, portal_signup=false, updated_at=now() WHERE id=$1 AND pending AND portal_signup`, [id, c.id, c.name]);
  await logUserEvent(db, actor.email, 'link', u.email, `client for ${c.name}`);
  return { status: 200 };
}

/** Owner: a one-time set-password link for a client login (setup or reset). */
export async function makeSetupLink(db: Db, actor: HqUser, id: number, base: string): Promise<{ status: number; error?: string; url?: string; expires?: string }> {
  if (actor.role !== 'owner') return { status: 403, error: 'only the owner manages users' };
  const u = (await db.query(`SELECT id, email, role, disabled, pending, password_hash IS NOT NULL AS has_pw FROM hq_users WHERE id=$1`, [id])).rows[0];
  if (!u) return { status: 404, error: 'no such user' };
  if (u.role !== 'client' || u.disabled || u.pending) return { status: 409, error: 'Setup links are for active client logins.' };
  const token = randomBytes(32).toString('base64url');
  await db.query(`UPDATE hq_portal_tokens SET used_at=now() WHERE user_id=$1 AND used_at IS NULL`, [id]); // an older link stops working
  const r = await db.query(`INSERT INTO hq_portal_tokens (id_hash, user_id, purpose, created_by, expires_at) VALUES ($1,$2,$3,$4, now() + make_interval(days => $5)) RETURNING expires_at`,
    [sha(token), id, u.has_pw ? 'reset' : 'setup', actor.email, SETUP_DAYS]);
  await db.query(`UPDATE hq_portal_resets SET handled_at=now() WHERE user_id=$1 AND handled_at IS NULL`, [id]);
  await logUserEvent(db, actor.email, 'setup link', u.email, `valid ${SETUP_DAYS} days`);
  return { status: 200, url: `${base.replace(/\/+$/, '')}/#/set-password?t=${token}`, expires: new Date(r.rows[0].expires_at).toISOString() };
}

/** Public: set a password with a one-time link. Returns the user to sign in. */
export async function setPasswordWithToken(db: Db, token: string, password: string, again: string): Promise<{ status: number; error?: string; user?: HqUser }> {
  if (!/^[A-Za-z0-9_-]{40,60}$/.test(String(token ?? ''))) return { status: 400, error: 'This link is not valid. Ask your Dulcy team for a new one.' };
  if (String(password ?? '').length < MIN_PASSWORD || String(password).length > 500) return { status: 400, error: `The password needs at least ${MIN_PASSWORD} characters.` };
  if (password !== again) return { status: 400, error: 'The two passwords are not the same.' };
  const t = (await db.query(`SELECT t.id_hash, t.user_id FROM hq_portal_tokens t JOIN hq_users u ON u.id=t.user_id
      WHERE t.id_hash=$1 AND t.used_at IS NULL AND t.expires_at > now() AND u.role='client' AND NOT u.disabled AND NOT u.pending`, [sha(token)])).rows[0];
  if (!t) return { status: 400, error: 'This link has expired or was already used. Ask your Dulcy team for a new one.' };
  const used = await db.query(`UPDATE hq_portal_tokens SET used_at=now() WHERE id_hash=$1 AND used_at IS NULL RETURNING user_id`, [t.id_hash]);
  if (!used.rows.length) return { status: 400, error: 'This link was already used.' };
  await db.query(`UPDATE hq_users SET password_hash=$2, updated_at=now() WHERE id=$1`, [t.user_id, await hashPassword(password)]);
  await db.query(`DELETE FROM hq_sessions WHERE user_id=$1`, [t.user_id]);
  const u = (await db.query(`SELECT id, email, name, role, client_rec FROM hq_users WHERE id=$1`, [t.user_id])).rows[0];
  await logUserEvent(db, u.email, 'password set', u.email, 'with a setup link');
  const user = toUser(u);
  return user ? { status: 200, user } : { status: 400, error: 'This link is not valid.' };
}

/** Public: "Forgot password" on the portal. The same answer whatever the email; rate limited. */
export async function forgotPassword(db: Db, email: string, ip: string): Promise<{ status: number; error?: string; message?: string }> {
  const e = normEmail(email);
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e)) return { status: 400, error: 'That does not look like an email address.' };
  const r = await db.query(`SELECT count(*) FILTER (WHERE email=$1)::int AS by_email, count(*) FILTER (WHERE ip=$2)::int AS by_ip
     FROM hq_login_attempts WHERE kind='forgot' AND created_at > now() - make_interval(mins => $3)`, [e, ip, FAIL_WINDOW_MIN]);
  if (r.rows[0].by_email >= MAX_FAILS_PER_EMAIL || r.rows[0].by_ip >= MAX_FAILS_PER_IP) return { status: 429, error: `Too many tries. Wait ${FAIL_WINDOW_MIN} minutes and try again.` };
  await db.query(`INSERT INTO hq_login_attempts (email, ip, ok, kind) VALUES ($1,$2,false,'forgot')`, [e, ip]);
  const u = (await db.query(`SELECT id FROM hq_users WHERE email=$1 AND role='client' AND NOT disabled AND NOT pending`, [e])).rows[0];
  if (u) await db.query(`INSERT INTO hq_portal_resets (user_id) SELECT $1 WHERE NOT EXISTS (SELECT 1 FROM hq_portal_resets WHERE user_id=$1 AND handled_at IS NULL)`, [u.id]);
  return { status: 200, message: RESET_SENT };
}

/** Google on the portal host, for an email with no login: auto-link on a verified, unambiguous Portal Users match; else a request. */
export async function portalGoogleNewUser(db: Db, at: Pick<HqAirtable, 'list'>, email: string): Promise<HqUser | null> {
  const e = normEmail(email);
  const c = await suggestedClient(at, e, { activeOnly: true });
  if (!c) return null;
  const r = await db.query(`INSERT INTO hq_users (email, name, role, password_hash, client_rec, client_name) VALUES ($1,$2,'client',NULL,$3,$4) ON CONFLICT (email) DO NOTHING RETURNING id, email, name, role, client_rec`,
    [e, firstName(e), c.id, c.name]);
  if (!r.rows.length) return null;
  await logUserEvent(db, e, 'auto-link', e, `client for ${c.name} (Google-verified email in Airtable Portal Users)`);
  return toUser(r.rows[0]);
}

export interface SoftrUser { rec: string; name: string; email: string; client: string; clientActive: boolean; lastSeen: string; hq: 'none' | 'client' | 'other' | 'pending'; hqId: number | null }
/** Owner: the Softr users (Portal Users) with their client and whether they have an HQ portal login yet. */
export async function listSoftrUsers(db: Db, at: Pick<HqAirtable, 'list'>): Promise<{ users: SoftrUser[]; counts: { total: number; linked: number; activeClients: number; withLogin: number } }> {
  const [rows, ws, hq] = await Promise.all([portalUsers(at), cachedPortalSource(at).then((s) => s.ws), db.query(`SELECT id, email, role, pending FROM hq_users`)]);
  const byEmail = new Map(hq.rows.map((u) => [String(u.email), u]));
  const users = rows.map((r): SoftrUser => {
    const groups = [...new Set(r.clients.map((id) => groupOf(ws, id)).filter(Boolean).map((g) => g![0].id))];
    const g = groups.length === 1 ? groupOf(ws, groups[0]) : null;
    const u = byEmail.get(r.email);
    return {
      rec: r.rec, name: r.name || firstName(r.email), email: r.email, client: g ? groupName(g) : groups.length > 1 ? 'More than one client' : '',
      clientActive: !!g && g.some((w) => val(w.fields.Status) === 'Active'), lastSeen: r.lastSeen,
      hq: !u ? 'none' : u.pending ? 'pending' : u.role === 'client' ? 'client' : 'other', hqId: u ? Number(u.id) : null,
    };
  }).sort((a, b) => Number(b.clientActive) - Number(a.clientActive) || a.client.localeCompare(b.client) || a.name.localeCompare(b.name));
  return { users, counts: { total: users.length, linked: users.filter((u) => u.client && u.client !== 'More than one client').length, activeClients: users.filter((u) => u.clientActive).length, withLogin: users.filter((u) => u.hq === 'client').length } };
}

/** Owner: make a client login for one Softr user (no password) and a setup link to send them. */
export async function inviteSoftrUser(db: Db, actor: HqUser, at: Pick<HqAirtable, 'list'>, rec: string, base: string): Promise<{ status: number; error?: string; url?: string; expires?: string }> {
  if (actor.role !== 'owner') return { status: 403, error: 'only the owner manages users' };
  if (!REC.test(rec)) return { status: 400, error: 'Pick a Softr user.' };
  const row = (await portalUsers(at)).find((r) => r.rec === rec);
  if (!row || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(row.email)) return { status: 404, error: 'That Softr user was not found (or has no email).' };
  const ws = (await cachedPortalSource(at)).ws;
  const groups = [...new Set(row.clients.map((id) => groupOf(ws, id)).filter(Boolean).map((g) => g![0].id))];
  if (groups.length !== 1) return { status: 409, error: groups.length ? 'This Softr user is linked to more than one client. Fix it in Airtable first.' : 'This Softr user is not linked to a client in Airtable.' };
  const g = groupOf(ws, groups[0])!;
  const existing = (await db.query(`SELECT id, role, client_rec, pending FROM hq_users WHERE email=$1`, [row.email])).rows[0];
  let id: number;
  if (existing) {
    if (existing.role !== 'client' || existing.client_rec !== g[0].id) return { status: 409, error: 'That email already has another HQ login.' };
    id = Number(existing.id);
  } else {
    const r = await db.query(`INSERT INTO hq_users (email, name, role, password_hash, client_rec, client_name) VALUES ($1,$2,'client',NULL,$3,$4) RETURNING id`, [row.email, row.name || firstName(row.email), g[0].id, groupName(g)]);
    id = Number(r.rows[0].id);
    await logUserEvent(db, actor.email, 'add', row.email, `client for ${groupName(g)}, from Softr`);
  }
  return makeSetupLink(db, actor, id, base);
}

/** A client changes its own name or password (Account settings). */
export async function updateOwnAccount(db: Db, user: HqUser, b: any): Promise<{ status: number; error?: string; passwordChanged?: boolean }> {
  if (user.role !== 'client') return { status: 403, error: 'The portal is for client logins.' };
  const changes: string[] = [];
  if (b?.name !== undefined) {
    const name = String(b.name ?? '').trim().replace(/\s+/g, ' ');
    if (!name || name.length > 80) return { status: 400, error: 'Your name (up to 80 characters), please.' };
    await db.query(`UPDATE hq_users SET name=$2, updated_at=now() WHERE id=$1`, [user.id, name]);
    changes.push('name');
  }
  if (b?.password !== undefined) {
    const pw = String(b.password ?? ''), again = String(b.password2 ?? '');
    if (pw.length < MIN_PASSWORD || pw.length > 500) return { status: 400, error: `The new password needs at least ${MIN_PASSWORD} characters.` };
    if (pw !== again) return { status: 400, error: 'The two new passwords are not the same.' };
    const row = (await db.query(`SELECT password_hash FROM hq_users WHERE id=$1`, [user.id])).rows[0];
    if (row?.password_hash && !(await verifyPassword(String(b.current ?? ''), row.password_hash))) return { status: 400, error: 'Your current password is not right.' };
    await db.query(`UPDATE hq_users SET password_hash=$2, updated_at=now() WHERE id=$1`, [user.id, await hashPassword(pw)]);
    await db.query(`DELETE FROM hq_sessions WHERE user_id=$1`, [user.id]);
    changes.push('password');
  }
  if (!changes.length) return { status: 400, error: 'Nothing to change.' };
  await logUserEvent(db, user.email, 'account', user.email, changes.join(', '));
  return { status: 200, passwordChanged: changes.includes('password') };
}

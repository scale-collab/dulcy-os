// HQ sign-up and user management (Alex, 2026-11-25).
//   Sign-up: anyone can ask (name, email, password; or Google). It makes a PENDING row (pending and
//   disabled) and never a session. The answer is the same whether the email exists or not, and
//   sign-ups are rate limited per email and per address like logins.
//   Users (owner only, checked by the server): approve with a role, deny (the row is deleted), change
//   role, disable / re-enable (disabling ends the user's sessions), reset password (sessions end),
//   add a user. The owner cannot disable or demote themself or the last owner. Every action is
//   written to hq_user_events with who and when. The CLI `hq-user` still works (it approves too).
//   Client logins (2026-11-26): only "Add client login" makes one (a client picked from Airtable).
//   Approve and Make owner/member only ever set owner or member, so a sign-up or an existing login
//   can never become a client, and a client login can never be promoted (disable it instead).
import type { Db } from '../db/pool.js';
import { FAIL_WINDOW_MIN, MAX_FAILS_PER_EMAIL, MAX_FAILS_PER_IP, MIN_PASSWORD, firstName, hashPassword, normEmail, type HqUser } from './auth.js';

export const SIGNUP_SENT = 'Request sent. Alex will approve it.';
/** The portal's sign-up answer (portal.dulcy.io): the same for every email. */
export const PORTAL_SIGNUP_SENT = 'Account requested. Your Dulcy team will link it to your company; then you can sign in and see your results.';
const EMAIL_RE = /^[^@\s]{1,64}@[^@\s]{1,190}\.[^@\s]{2,63}$/;
type Role = 'owner' | 'member';
/** The roles approve / role / add-user may set. 'client' is deliberately not one of them. */
const isRole = (x: unknown): x is Role => x === 'owner' || x === 'member';
const REC_RE = /^rec[A-Za-z0-9]{14}$/;
/** Finds the client a client login is for (the main Workspace IDs record of its group, and its name), or null. */
export type ClientResolver = (rec: string) => Promise<{ id: string; name: string } | null>;

export async function logUserEvent(db: Db, actor: string, action: string, target: string, detail = ''): Promise<void> {
  await db.query(`INSERT INTO hq_user_events (actor, action, target, detail) VALUES ($1,$2,$3,$4)`, [actor, action, target, detail.slice(0, 500)]);
}

/** Too many sign-up tries for this email or address in the last 15 minutes (every try counts). */
export async function signupBlocked(db: Db, email: string, ip: string): Promise<boolean> {
  const r = await db.query(
    `SELECT count(*) FILTER (WHERE email=$1)::int AS by_email, count(*) FILTER (WHERE ip=$2)::int AS by_ip
     FROM hq_login_attempts WHERE kind='signup' AND created_at > now() - make_interval(mins => $3)`, [email, ip, FAIL_WINDOW_MIN]);
  return r.rows[0].by_email >= MAX_FAILS_PER_EMAIL || r.rows[0].by_ip >= MAX_FAILS_PER_IP;
}
const recordSignup = (db: Db, email: string, ip: string) => db.query(`INSERT INTO hq_login_attempts (email, ip, ok, kind) VALUES ($1,$2,false,'signup')`, [email, ip]);

/** Insert a pending request unless the email already has a row (then nothing changes). */
async function addPending(db: Db, email: string, name: string, hash: string | null, via: string, portal = false): Promise<void> {
  // portal: a client portal request (portal.dulcy.io). Still a pending member: it sees nothing until the owner links it to a client.
  const r = await db.query(
    `INSERT INTO hq_users (email, name, role, password_hash, disabled, pending, requested_at, portal_signup) VALUES ($1,$2,'member',$3,true,true,now(),$4)
     ON CONFLICT (email) DO NOTHING RETURNING id`, [email, name, hash, portal]);
  if (r.rows.length) await logUserEvent(db, email, portal ? 'portal signup' : 'signup', email, via);
}

/** POST /auth/signup. Never says whether the email exists; never logs in. */
export async function signUp(db: Db, b: any, ip: string, opts: { portal?: boolean } = {}): Promise<{ status: number; error?: string; message?: string }> {
  const email = normEmail(b?.email);
  const name = String(b?.name ?? '').trim().replace(/\s+/g, ' ');
  const password = String(b?.password ?? ''); const again = String(b?.password2 ?? '');
  if (!name || name.length > 80) return { status: 400, error: 'Your name (up to 80 characters), please.' };
  if (!EMAIL_RE.test(email)) return { status: 400, error: 'That does not look like an email address.' };
  if (password.length < MIN_PASSWORD || password.length > 500) return { status: 400, error: `The password needs at least ${MIN_PASSWORD} characters.` };
  if (password !== again) return { status: 400, error: 'The two passwords are not the same.' };
  if (await signupBlocked(db, email, ip)) return { status: 429, error: `Too many tries. Wait ${FAIL_WINDOW_MIN} minutes and try again.` };
  await recordSignup(db, email, ip);
  const hash = await hashPassword(password); // always, so an existing email takes as long
  await addPending(db, email, name, hash, 'password', opts.portal === true);
  return { status: 200, message: opts.portal ? PORTAL_SIGNUP_SENT : SIGNUP_SENT };
}

/** Google sign-up for an email with no active login: a pending request (no password). */
export async function googleSignUp(db: Db, email: string, ip: string, opts: { portal?: boolean } = {}): Promise<{ ok: boolean; error?: string }> {
  const e = normEmail(email);
  if (await signupBlocked(db, e, ip)) return { ok: false, error: `Too many tries. Wait ${FAIL_WINDOW_MIN} minutes and try again.` };
  await recordSignup(db, e, ip);
  await addPending(db, e, firstName(e), null, 'Google', opts.portal === true);
  return { ok: true };
}

export async function pendingCount(db: Db): Promise<number> {
  return (await db.query(`SELECT count(*)::int AS n FROM hq_users WHERE pending`)).rows[0].n;
}

export interface UserRow {
  id: number; email: string; name: string; role: Role | 'client'; clientName: string; status: 'pending' | 'active' | 'disabled'; hasPassword: boolean; lastSeen: string | null; created: string; requested: string | null;
  /** A sign-up from the client portal: link it to a client (never approve it as member/owner). */
  portalRequest: boolean;
  /** The client asked for a new password (portal "Forgot password"), not handled yet. */
  resetAsked: string | null;
  /** Filled in by the server: the client the Airtable Portal Users table links this email to. */
  suggest?: { id: string; name: string } | null;
}
export async function listUsers(db: Db): Promise<{ users: UserRow[]; events: { id: number; actor: string; action: string; target: string; detail: string; created: string }[] }> {
  const [u, e] = await Promise.all([
    db.query(`SELECT u.id, u.email, u.name, u.role, u.client_name, u.disabled, u.pending, u.portal_signup, u.password_hash IS NOT NULL AS has_pw, u.created_at, u.requested_at,
        (SELECT max(r.created_at) FROM hq_portal_resets r WHERE r.user_id=u.id AND r.handled_at IS NULL) AS reset_asked,
        GREATEST(u.last_login_at, (SELECT max(s.last_seen) FROM hq_sessions s WHERE s.user_id=u.id)) AS last_seen
      FROM hq_users u ORDER BY u.pending DESC, u.disabled, u.role DESC, lower(u.name), u.email`),
    db.query(`SELECT id, actor, action, target, detail, created_at FROM hq_user_events ORDER BY id DESC LIMIT 30`),
  ]);
  const iso = (x: unknown) => (x ? new Date(x as string).toISOString() : null);
  return {
    users: u.rows.map((x) => ({
      id: Number(x.id), email: String(x.email), name: String(x.name || firstName(x.email)), role: x.role === 'owner' ? 'owner' : x.role === 'client' ? 'client' : 'member', clientName: x.role === 'client' ? String(x.client_name ?? '') : '',
      status: x.pending ? 'pending' : x.disabled ? 'disabled' : 'active', hasPassword: Boolean(x.has_pw), lastSeen: iso(x.last_seen), created: iso(x.created_at)!, requested: iso(x.requested_at),
      portalRequest: Boolean(x.pending && x.portal_signup), resetAsked: iso(x.reset_asked),
    })),
    events: e.rows.map((x) => ({ id: Number(x.id), actor: String(x.actor), action: String(x.action), target: String(x.target), detail: String(x.detail), created: iso(x.created_at)! })),
  };
}

type Result = { status: number; error?: string };
const ok: Result = { status: 200 };
const activeOwners = async (db: Db) => (await db.query(`SELECT count(*)::int AS n FROM hq_users WHERE role='owner' AND NOT disabled AND NOT pending`)).rows[0].n as number;
const endSessions = (db: Db, id: number) => db.query(`DELETE FROM hq_sessions WHERE user_id=$1`, [id]);

/** One owner action on one user. `actor` is the signed-in owner (the route checks the role). */
export async function manageUser(db: Db, actor: HqUser, id: number, action: string, b: any): Promise<Result> {
  if (actor.role !== 'owner') return { status: 403, error: 'only the owner manages users' };
  const u = (await db.query(`SELECT id, email, role, disabled, pending, portal_signup FROM hq_users WHERE id=$1`, [id])).rows[0];
  if (!u) return { status: 404, error: 'no such user' };
  const self = Number(u.id) === actor.id;
  const isLastOwner = u.role === 'owner' && !u.disabled && !u.pending && (await activeOwners(db)) <= 1;
  const log = (detail = '') => logUserEvent(db, actor.email, action, u.email, detail);
  switch (action) {
    case 'approve': {
      if (!u.pending) return { status: 409, error: 'not a pending request' };
      if (u.portal_signup) return { status: 409, error: 'This is a client portal request: link it to a client instead.' };
      const role = b?.role === undefined ? 'member' : b.role;
      if (!isRole(role)) return { status: 400, error: 'role must be member or owner' };
      await db.query(`UPDATE hq_users SET pending=false, disabled=false, role=$2, updated_at=now() WHERE id=$1`, [id, role]);
      await log(`as ${role}`); return ok;
    }
    case 'deny': {
      if (!u.pending) return { status: 409, error: 'only a pending request can be denied (disable an active user instead)' };
      await db.query(`DELETE FROM hq_users WHERE id=$1 AND pending`, [id]);
      await log(); return ok;
    }
    case 'role': {
      if (!isRole(b?.role)) return { status: 400, error: 'role must be member or owner' };
      if (u.pending) return { status: 409, error: 'approve the request first' };
      if (u.role === 'client') return { status: 409, error: 'A client login stays a client login. Disable it and add a new login instead.' };
      if (b.role === u.role) return ok;
      if (b.role === 'member' && (self || isLastOwner)) return { status: 409, error: self ? 'you cannot demote yourself' : 'the last owner cannot be demoted' };
      await db.query(`UPDATE hq_users SET role=$2, updated_at=now() WHERE id=$1`, [id, b.role]); // sessions read the role each request
      await log(`${u.role} → ${b.role}`); return ok;
    }
    case 'disable': {
      if (u.pending) return { status: 409, error: 'deny the request instead' };
      if (self || isLastOwner) return { status: 409, error: self ? 'you cannot disable yourself' : 'the last owner cannot be disabled' };
      await db.query(`UPDATE hq_users SET disabled=true, updated_at=now() WHERE id=$1`, [id]);
      await endSessions(db, id);
      await log(); return ok;
    }
    case 'enable': {
      if (u.pending) return { status: 409, error: 'approve the request instead' };
      await db.query(`UPDATE hq_users SET disabled=false, updated_at=now() WHERE id=$1`, [id]);
      await log(); return ok;
    }
    case 'password': {
      const pw = String(b?.password ?? '');
      if (pw.length < MIN_PASSWORD || pw.length > 500) return { status: 400, error: `The temporary password needs at least ${MIN_PASSWORD} characters.` };
      await db.query(`UPDATE hq_users SET password_hash=$2, updated_at=now() WHERE id=$1`, [id, await hashPassword(pw)]);
      await endSessions(db, id);
      await log('temporary password set'); return ok;
    }
  }
  return { status: 404, error: 'unknown action' };
}

/**
 * Add a user directly (active). A temporary password, or Google sign-in only.
 * role 'client' (Add client login): needs clientRec, checked against Airtable by resolveClient; an
 * email that already has any login is refused (409), so an owner or member is never turned into a client.
 */
export async function addUser(db: Db, actor: HqUser, b: any, resolveClient?: ClientResolver): Promise<Result & { id?: number }> {
  if (actor.role !== 'owner') return { status: 403, error: 'only the owner manages users' };
  const email = normEmail(b?.email); const name = String(b?.name ?? '').trim().replace(/\s+/g, ' ');
  const role = b?.role ?? 'member'; const googleOnly = b?.googleOnly === true; const pw = String(b?.password ?? '');
  if (!name || name.length > 80) return { status: 400, error: 'A name (up to 80 characters), please.' };
  if (!EMAIL_RE.test(email)) return { status: 400, error: 'That does not look like an email address.' };
  if (!isRole(role) && role !== 'client') return { status: 400, error: 'role must be member, owner or client' };
  if (!googleOnly && (pw.length < MIN_PASSWORD || pw.length > 500)) return { status: 400, error: `A temporary password of at least ${MIN_PASSWORD} characters, or Google sign-in only.` };
  let client: { id: string; name: string } | null = null;
  if (role === 'client') {
    const rec = String(b?.clientRec ?? '');
    if (!REC_RE.test(rec)) return { status: 400, error: 'Pick the client this login is for.' };
    client = resolveClient ? await resolveClient(rec) : null;
    if (!client || !REC_RE.test(client.id)) return { status: 400, error: 'That client was not found in Airtable.' };
  }
  const r = await db.query(`INSERT INTO hq_users (email, name, role, password_hash, client_rec, client_name) VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT (email) DO NOTHING RETURNING id`,
    [email, name, role, googleOnly ? null : await hashPassword(pw), client?.id ?? null, client?.name ?? '']);
  if (!r.rows.length) return { status: 409, error: 'That email already has a login (or a pending request).' };
  await logUserEvent(db, actor.email, 'add', email, `${role}${client ? ` for ${client.name}` : ''}${googleOnly ? ', Google only' : ', temporary password'}`);
  return { status: 200, id: Number(r.rows[0].id) };
}

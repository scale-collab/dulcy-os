// Dulcy HQ login: email + password (scrypt) and optional "Sign in with Google" for emails that are
// already HQ users. Sessions are random ids in a signed, httpOnly, Secure, SameSite=Strict cookie;
// only the id's sha256 is stored. Failed logins are rate limited per email and per address.
import { createHash, createHmac, randomBytes, scrypt as scryptCb, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import type { Db } from '../db/pool.js';
import type { Config } from '../config.js';

const scrypt = promisify(scryptCb) as (pw: string, salt: Buffer, len: number, opts: { N: number; r: number; p: number; maxmem: number }) => Promise<Buffer>;
const N = 16384, R = 8, P = 1, LEN = 32;

export const SESSION_COOKIE = '__Host-hq_session';
export const OAUTH_COOKIE = '__Host-hq_oauth';
export const SESSION_DAYS = 30;
export const MAX_FAILS_PER_EMAIL = 5;
export const MAX_FAILS_PER_IP = 20;
export const FAIL_WINDOW_MIN = 15;

export interface HqUser { id: number; email: string; name: string; role: 'owner' | 'member' }

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const hash = await scrypt(password.normalize('NFKC'), salt, LEN, { N, r: R, p: P, maxmem: 64 * 1024 * 1024 });
  return `scrypt$${N}$${R}$${P}$${salt.toString('base64')}$${hash.toString('base64')}`;
}

export async function verifyPassword(password: string, stored: string | null | undefined): Promise<boolean> {
  const parts = String(stored ?? '').split('$');
  if (parts.length !== 6 || parts[0] !== 'scrypt') {
    // Same work for an unknown user, so timing does not tell which emails exist.
    await scrypt(password.normalize('NFKC'), Buffer.alloc(16), LEN, { N, r: R, p: P, maxmem: 64 * 1024 * 1024 });
    return false;
  }
  const [, n, r, p, salt, hash] = parts;
  const want = Buffer.from(hash, 'base64');
  const got = await scrypt(password.normalize('NFKC'), Buffer.from(salt, 'base64'), want.length, { N: Number(n), r: Number(r), p: Number(p), maxmem: 64 * 1024 * 1024 });
  return got.length === want.length && timingSafeEqual(got, want);
}

const mac = (secret: string, v: string) => createHmac('sha256', secret).update(v).digest('base64url');
export function signValue(secret: string, v: string): string { return `${v}.${mac(secret, v)}`; }
export function unsignValue(secret: string, signed: string | undefined): string | null {
  if (!signed) return null;
  const i = signed.lastIndexOf('.');
  if (i <= 0) return null;
  const v = signed.slice(0, i), sig = Buffer.from(signed.slice(i + 1)), want = Buffer.from(mac(secret, v));
  return sig.length === want.length && timingSafeEqual(sig, want) ? v : null;
}
const sha = (s: string) => createHash('sha256').update(s).digest('hex');

export function parseCookies(header: string | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  for (const part of String(header ?? '').split(';')) {
    const i = part.indexOf('=');
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

export function cookie(name: string, value: string, maxAgeSec: number, sameSite: 'Strict' | 'Lax' = 'Strict'): string {
  return `${name}=${encodeURIComponent(value)}; Path=/; HttpOnly; Secure; SameSite=${sameSite}; Max-Age=${Math.max(0, Math.floor(maxAgeSec))}`;
}

export async function createSession(db: Db, cfg: Pick<Config, 'hqSessionSecret'>, userId: number): Promise<string> {
  const id = randomBytes(32).toString('base64url');
  await db.query(`INSERT INTO hq_sessions (id_hash, user_id, expires_at) VALUES ($1,$2, now() + make_interval(days => $3))`, [sha(id), userId, SESSION_DAYS]);
  await db.query(`DELETE FROM hq_sessions WHERE expires_at < now()`);
  return cookie(SESSION_COOKIE, signValue(cfg.hqSessionSecret!, id), SESSION_DAYS * 86_400);
}

export async function sessionUser(db: Db, cfg: Pick<Config, 'hqSessionSecret'>, cookieHeader: string | undefined): Promise<HqUser | null> {
  if (!cfg.hqSessionSecret) return null;
  const id = unsignValue(cfg.hqSessionSecret, parseCookies(cookieHeader)[SESSION_COOKIE]);
  if (!id) return null;
  const r = await db.query(
    `UPDATE hq_sessions s SET last_seen=now() FROM hq_users u
     WHERE s.id_hash=$1 AND s.expires_at > now() AND u.id = s.user_id AND NOT u.disabled
     RETURNING u.id, u.email, u.name, u.role`, [sha(id)]);
  const u = r.rows[0];
  return u ? { id: Number(u.id), email: String(u.email), name: String(u.name || u.email.split('@')[0]), role: u.role === 'owner' ? 'owner' : 'member' } : null;
}

export async function endSession(db: Db, cfg: Pick<Config, 'hqSessionSecret'>, cookieHeader: string | undefined): Promise<void> {
  if (!cfg.hqSessionSecret) return;
  const id = unsignValue(cfg.hqSessionSecret, parseCookies(cookieHeader)[SESSION_COOKIE]);
  if (id) await db.query(`DELETE FROM hq_sessions WHERE id_hash=$1`, [sha(id)]);
}

/** true when this email or address has had too many failed logins in the last 15 minutes. */
export async function loginBlocked(db: Db, email: string, ip: string): Promise<boolean> {
  const r = await db.query(
    `SELECT count(*) FILTER (WHERE email=$1)::int AS by_email, count(*) FILTER (WHERE ip=$2)::int AS by_ip
     FROM hq_login_attempts WHERE NOT ok AND created_at > now() - make_interval(mins => $3)`, [email, ip, FAIL_WINDOW_MIN]);
  return r.rows[0].by_email >= MAX_FAILS_PER_EMAIL || r.rows[0].by_ip >= MAX_FAILS_PER_IP;
}

export async function recordLogin(db: Db, email: string, ip: string, ok: boolean): Promise<void> {
  await db.query(`INSERT INTO hq_login_attempts (email, ip, ok) VALUES ($1,$2,$3)`, [email, ip, ok]);
  await db.query(`DELETE FROM hq_login_attempts WHERE created_at < now() - interval '2 days'`);
}

export const normEmail = (e: unknown) => String(e ?? '').trim().toLowerCase();
const firstName = (email: string) => { const n = email.split('@')[0].split(/[._-]/)[0]; return n ? n[0].toUpperCase() + n.slice(1) : email; };

/** Email + password. Returns the user, or the reason (never says whether the email exists). */
export async function passwordLogin(db: Db, email: string, password: string, ip: string): Promise<{ user?: HqUser; error?: string; status: number }> {
  const e = normEmail(email);
  if (!e || !password || password.length > 500) return { error: 'Email and password, please.', status: 400 };
  if (await loginBlocked(db, e, ip)) return { error: `Too many tries. Wait ${FAIL_WINDOW_MIN} minutes and try again.`, status: 429 };
  const u = (await db.query(`SELECT id, email, name, role, password_hash, disabled FROM hq_users WHERE email=$1`, [e])).rows[0];
  const ok = await verifyPassword(password, u && !u.disabled ? u.password_hash : null);
  await recordLogin(db, e, ip, ok);
  if (!ok) return { error: 'That email and password do not match.', status: 401 };
  return { status: 200, user: { id: Number(u.id), email: String(u.email), name: String(u.name || firstName(u.email)), role: u.role === 'owner' ? 'owner' : 'member' } };
}

/** Create or update a login (CLI only). The password is hashed here and never logged. */
export async function upsertUser(db: Db, email: string, role: 'owner' | 'member', password: string | null, name?: string): Promise<{ created: boolean }> {
  const e = normEmail(email);
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e)) throw new Error('not an email address');
  if (password !== null && password.length < 12) throw new Error('the password must be at least 12 characters');
  const hash = password === null ? null : await hashPassword(password);
  const r = await db.query(
    `INSERT INTO hq_users (email, name, role, password_hash) VALUES ($1,$2,$3,$4)
     ON CONFLICT (email) DO UPDATE SET role=EXCLUDED.role, name=COALESCE(NULLIF($2,''), hq_users.name),
       password_hash=COALESCE(EXCLUDED.password_hash, hq_users.password_hash), disabled=false, updated_at=now()
     RETURNING (xmax = 0) AS created`, [e, name ?? firstName(e), role, hash]);
  if (password !== null) await db.query(`DELETE FROM hq_sessions WHERE user_id=(SELECT id FROM hq_users WHERE email=$1)`, [e]);
  return { created: Boolean(r.rows[0]?.created) };
}

// ---------- Google sign-in (OpenID Connect, code flow) ----------
export const googleOn = (cfg: Pick<Config, 'hqGoogleClientId' | 'hqGoogleClientSecret'>) => Boolean(cfg.hqGoogleClientId && cfg.hqGoogleClientSecret);
export const googleRedirectUri = (cfg: Pick<Config, 'hqPublicUrl'>) => `${cfg.hqPublicUrl}/hq/api/auth/google/callback`;

/** The Google sign-in address and the short-lived state cookie (SameSite=Lax: Google's redirect back is a cross-site navigation). */
export function googleStart(cfg: Config): { location: string; setCookie: string } {
  const state = randomBytes(24).toString('base64url');
  const q = new URLSearchParams({ client_id: cfg.hqGoogleClientId!, redirect_uri: googleRedirectUri(cfg), response_type: 'code', scope: 'openid email', state, prompt: 'select_account' });
  return { location: `${cfg.hqGoogleAuthUrl}?${q}`, setCookie: cookie(OAUTH_COOKIE, signValue(cfg.hqSessionSecret!, `${state}:${Date.now()}`), 600, 'Lax') };
}

/** The Google callback: check state, swap the code for the id token (server to Google over TLS), return the verified email. */
export async function googleFinish(cfg: Config, query: URLSearchParams, cookieHeader: string | undefined, fetchImpl: typeof fetch = fetch): Promise<{ email?: string; error?: string }> {
  const saved = unsignValue(cfg.hqSessionSecret!, parseCookies(cookieHeader)[OAUTH_COOKIE]);
  const [state, at] = String(saved ?? '').split(':');
  if (!state || state !== query.get('state') || Date.now() - Number(at) > 600_000) return { error: 'Sign-in expired. Try again.' };
  const code = query.get('code');
  if (!code) return { error: 'Google sign-in was cancelled.' };
  let tok: any;
  try {
    const res = await fetchImpl(cfg.hqGoogleTokenUrl, {
      method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ code, client_id: cfg.hqGoogleClientId!, client_secret: cfg.hqGoogleClientSecret!, redirect_uri: googleRedirectUri(cfg), grant_type: 'authorization_code' }),
      signal: AbortSignal.timeout(15_000),
    });
    tok = await res.json();
    if (!res.ok) return { error: 'Google did not accept the sign-in.' };
  } catch { return { error: 'Could not reach Google. Try again.' }; }
  let claims: any;
  try { claims = JSON.parse(Buffer.from(String(tok.id_token ?? '').split('.')[1] ?? '', 'base64url').toString('utf8')); } catch { return { error: 'Google sent an unreadable answer.' }; }
  const issOk = claims?.iss === 'https://accounts.google.com' || claims?.iss === 'accounts.google.com';
  if (!issOk || claims?.aud !== cfg.hqGoogleClientId || !(Number(claims?.exp) * 1000 > Date.now()) || claims?.email_verified !== true) return { error: 'Google sign-in could not be verified.' };
  return { email: normEmail(claims.email) };
}

export async function userByEmail(db: Db, email: string): Promise<HqUser | null> {
  const u = (await db.query(`SELECT id, email, name, role FROM hq_users WHERE email=$1 AND NOT disabled`, [normEmail(email)])).rows[0];
  return u ? { id: Number(u.id), email: String(u.email), name: String(u.name || firstName(u.email)), role: u.role === 'owner' ? 'owner' : 'member' } : null;
}

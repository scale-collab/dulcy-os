// HQ phone notifications (Web Push with VAPID), Alex 2026-11-27. Four kinds, each can be switched
// off per person (all on by default; no quiet hours):
//   decision  each new Decisions card (several within 3 minutes come as one "4 new decisions")
//   agent     an agent's chat answer while the person is not on that chat, asks and tasks waiting on them
//   urgent    bounce over 4% / paused, inbox in spam, warm-up off, a failed run (owner)
//   good      a meeting booked, a client signed or paid
// Members (Josh) get only their own items (reply decisions, asks for everyone, their chats, meetings
// booked): never money, Ledger, Sienna or owner-only content. mayReceive() decides, server-side.
// Every event goes through notify(): it writes one row per person into hq_push_log (one per
// person + dedupe key, so the same event is never pushed twice). flushPush() sends them: at most one
// push per person per minute (rows waiting are grouped into one), decisions within 3 minutes of the
// last decision push wait and go out together, at most 60 pushes per person per day.
// The VAPID key pair is made on first start and kept in Postgres (or read from VAPID_* env). The
// private key never leaves the server; only the public key is served. Slack posting is unchanged.
import { createHash, randomBytes } from 'node:crypto';
import webpush from 'web-push';
import type { Db } from '../db/pool.js';
import type { Config } from '../config.js';
import type { HqUser } from './auth.js';
import { OWNER_ONLY } from './agents.js';
import { cleanActionUrl } from './asks.js';
import { nyDate } from './tasks.js';

export const PUSH_TYPES = ['decision', 'agent', 'urgent', 'good'] as const;
export type PushType = (typeof PUSH_TYPES)[number];
export const isPushType = (x: unknown): x is PushType => (PUSH_TYPES as readonly unknown[]).includes(x);
export type PushSettings = Record<PushType, boolean>;
export const DEFAULT_SETTINGS: PushSettings = { decision: true, agent: true, urgent: true, good: true };

export const PUSH_LIMITS = {
  /** At most one push per person per minute (what waits is grouped into the next one). */
  minGapMs: 60_000,
  /** New decisions within 3 minutes of the last decision push go out together. */
  groupMs: 3 * 60_000,
  /** Pushes per person per New York day. */
  dailyCap: 60,
  /** A device that failed this many times in a row is removed. */
  maxFailures: 10,
  /** Devices kept per person (the oldest goes). */
  maxDevices: 10,
  /** A screen the page reported within this long counts as "on it" (the page reports every 30 s). */
  presenceMs: 75_000,
  /** A row still waiting after this long is dropped (old news). */
  staleMs: 30 * 60_000,
  /** How long the push service keeps a push for a phone that is off. */
  ttlSec: 12 * 3600,
  /** "Send a test": at most one per 10 seconds. */
  testGapMs: 10_000,
  /** Sent log and seen keys are kept this many days. */
  keepDays: 30,
} as const;

// ---------- who gets what (pure) ----------
export type PushAudience = 'owner' | 'team' | { userId: number };
export interface PushEvent {
  type: PushType;
  /** owner = owners only; team = owners and members; { userId } = that one person. */
  audience: PushAudience;
  title: string;
  body?: string;
  /** An HQ route (decisions/rec…, chat/Ada/12, campaigns/rec…): opened on tap. Anything else opens Today. */
  url: string;
  /** The same key is pushed to a person once, ever (kept 30 days). */
  dedupeKey: string;
  /** The agent it is about: Ledger and Sienna are owner-only. */
  agent?: string;
  /** Money: owner-only. */
  money?: boolean;
}

/**
 * May this person get this event? Owners: everything for 'owner'/'team', and their own { userId }.
 * Members: only 'team' or their own { userId }, and never money, Ledger, Sienna. Anyone else: never.
 * Fails closed: an unknown audience or role gets nothing. Pure.
 */
export function mayReceive(user: { id: number; role: string }, ev: Pick<PushEvent, 'audience' | 'agent' | 'money'>): boolean {
  const a = ev.audience;
  const own = typeof a === 'object' && a !== null ? Number(a.userId) === Number(user.id) : null;
  if (user.role === 'owner') return own ?? (a === 'owner' || a === 'team');
  if (user.role !== 'member') return false;
  if (ev.money === true || (ev.agent && OWNER_ONLY.includes(ev.agent))) return false;
  return own ?? a === 'team';
}

// ---------- text and links (pure) ----------
/** Plain text for a notification: no control characters, one line, at most max characters. */
export function pushText(x: unknown, max: number): string {
  const t = String(x ?? '').replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim();
  return t.length > max ? `${t.slice(0, max - 1).trimEnd()}…` : t;
}
/** An HQ route → "#/route". Only HQ's own routes: an outside link (or anything odd) opens Today. Pure. */
export function pushUrl(raw: unknown): string {
  const c = cleanActionUrl(String(raw ?? '').trim().replace(/^#?\/?/, ''));
  if (!c || /^https:/i.test(c)) return '#/today';
  return `#/${c}`;
}
const shortHash = (s: string) => createHash('sha256').update(s).digest('base64url').slice(0, 16);

export interface PushRow { id?: number; type: string; title: string; body: string; url: string; dedupeKey: string; created?: string }
export interface PushPayload { title: string; body: string; url: string; tag: string; count: number; type: PushType | 'test' | 'mixed'; ts: number }

const ORDER: Record<string, number> = { urgent: 0, agent: 1, decision: 2, good: 3, test: 4 };
const GROUP_TITLE: Record<PushType, (n: number) => string> = {
  decision: (n) => `${n} new decisions`,
  agent: (n) => `${n} messages from your agents`,
  urgent: (n) => `${n} urgent problems`,
  good: (n) => `${n} pieces of good news`,
};
const GROUP_URL: Record<PushType, string> = { decision: '#/decisions', agent: '#/needs', urgent: '#/today', good: '#/today' };

/** One notification for the rows going out together: one row as it is; several as "4 new decisions". Pure. */
export function buildPayload(rows: PushRow[], now = Date.now()): PushPayload {
  const list = [...rows].sort((a, b) => (ORDER[a.type] ?? 9) - (ORDER[b.type] ?? 9) || String(a.created ?? '').localeCompare(String(b.created ?? '')));
  if (list.length === 1) {
    const r = list[0];
    return { title: pushText(r.title, 120) || 'Dulcy HQ', body: pushText(r.body, 300), url: pushUrl(r.url), tag: `${r.type}:${shortHash(r.dedupeKey)}`, count: 1, type: isPushType(r.type) || r.type === 'test' ? (r.type as PushType | 'test') : 'mixed', ts: now };
  }
  const types = [...new Set(list.map((r) => r.type))];
  const one = types.length === 1 && isPushType(types[0]) ? (types[0] as PushType) : null;
  const urls = [...new Set(list.map((r) => pushUrl(r.url)))];
  const names = list.slice(0, 3).map((r) => pushText(r.title, 70));
  const more = list.length > 3 ? ` +${list.length - 3} more` : '';
  return {
    title: one ? GROUP_TITLE[one](list.length) : `${list.length} new in HQ`,
    body: pushText(`${names.join(' · ')}${more}`, 300),
    url: one === 'decision' ? GROUP_URL.decision : urls.length === 1 ? urls[0] : one ? GROUP_URL[one] : '#/today',
    tag: one ?? 'hq', count: list.length, type: one ?? 'mixed', ts: now,
  };
}

/** "iPhone", "Mac · Chrome", ... from a user agent (for the device list). Pure. */
export function deviceLabel(ua: string): string {
  const u = String(ua ?? '');
  const os = /iPhone/.test(u) ? 'iPhone' : /iPad/.test(u) ? 'iPad' : /Android/.test(u) ? 'Android' : /Mac OS X|Macintosh/.test(u) ? 'Mac' : /Windows/.test(u) ? 'Windows' : /Linux/.test(u) ? 'Linux' : 'Device';
  const browser = /Edg\//.test(u) ? 'Edge' : /Firefox\//.test(u) ? 'Firefox' : /CriOS|Chrome\//.test(u) ? 'Chrome' : /Safari\//.test(u) ? 'Safari' : '';
  if (os === 'iPhone' || os === 'iPad') return browser && browser !== 'Safari' ? `${os} · ${browser}` : os;
  return browser ? `${os} · ${browser}` : os;
}

// ---------- VAPID keys ----------
export interface PushKeys { publicKey: string; privateKey: string; subject: string; source: 'env' | 'db' }
let keyCache: PushKeys | null = null;
export function _resetPushKeys() { keyCache = null; }
const b64len = (s: string) => { try { return /^[A-Za-z0-9_-]+$/.test(s) ? Buffer.from(s, 'base64url').length : -1; } catch { return -1; } };
const validPair = (pub: string, priv: string) => b64len(pub) === 65 && b64len(priv) === 32;
/** The VAPID subject: VAPID_SUBJECT (mailto: or https:), else the HQ address. */
export const pushSubject = (cfg: Pick<Config, 'vapidSubject' | 'hqPublicUrl'>) => (/^(mailto:\S+@\S+|https:\/\/\S+)$/.test(cfg.vapidSubject ?? '') ? cfg.vapidSubject! : cfg.hqPublicUrl);

/** The key pair: VAPID_PUBLIC_KEY + VAPID_PRIVATE_KEY when both are set and valid; else the one in Postgres, made on first use. */
export async function pushKeys(db: Db, cfg: Pick<Config, 'vapidPublicKey' | 'vapidPrivateKey' | 'vapidSubject' | 'hqPublicUrl'>): Promise<PushKeys> {
  if (keyCache) return keyCache;
  const subject = pushSubject(cfg);
  if (cfg.vapidPublicKey && cfg.vapidPrivateKey) {
    if (validPair(cfg.vapidPublicKey, cfg.vapidPrivateKey)) return (keyCache = { publicKey: cfg.vapidPublicKey, privateKey: cfg.vapidPrivateKey, subject, source: 'env' });
    console.error(JSON.stringify({ level: 'warn', message: 'VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY are not a valid pair; using the key pair kept in Postgres' }));
  }
  let row = (await db.query(`SELECT public_key, private_key FROM hq_push_keys WHERE id=1`)).rows[0];
  if (!row) {
    const k = webpush.generateVAPIDKeys();
    await db.query(`INSERT INTO hq_push_keys (id, public_key, private_key) VALUES (1,$1,$2) ON CONFLICT (id) DO NOTHING`, [k.publicKey, k.privateKey]);
    row = (await db.query(`SELECT public_key, private_key FROM hq_push_keys WHERE id=1`)).rows[0];
  }
  return (keyCache = { publicKey: String(row.public_key), privateKey: String(row.private_key), subject, source: 'db' });
}

// ---------- sending ----------
export interface PushTarget { endpoint: string; keys: { p256dh: string; auth: string } }
export interface SendOpts { vapid: { subject: string; publicKey: string; privateKey: string }; ttl: number; urgency: 'normal' | 'high' }
/** Sends one push to one device; resolves with the push service's status code (throws on a network error). Tests pass a fake. */
export type PushSender = (target: PushTarget, payload: string, opts: SendOpts) => Promise<{ statusCode: number }>;

/** The real sender (the web-push package: VAPID JWT + aes128gcm). 15 s per push. */
export function webPushSender(): PushSender {
  return async (target, payload, o) => {
    try {
      const r = await webpush.sendNotification(target, payload, { vapidDetails: o.vapid, TTL: o.ttl, urgency: o.urgency, timeout: 15_000 });
      return { statusCode: r.statusCode };
    } catch (e) {
      const code = Number((e as { statusCode?: number })?.statusCode);
      if (Number.isFinite(code) && code > 0) return { statusCode: code };
      throw e;
    }
  };
}

export interface DeliverResult { sent: number; failed: number; removed: number }
/** Send one payload to every device of one person. 404/410 = the device is gone: removed. */
export async function deliver(db: Db, keys: PushKeys, sender: PushSender, userId: number, payload: PushPayload, now = new Date()): Promise<DeliverResult> {
  const out: DeliverResult = { sent: 0, failed: 0, removed: 0 };
  const subs = (await db.query(`SELECT id, endpoint, p256dh, auth, failures FROM hq_push_subscriptions WHERE user_id=$1 ORDER BY id LIMIT $2`, [userId, PUSH_LIMITS.maxDevices])).rows;
  const body = JSON.stringify(payload);
  for (const s of subs) {
    let status = 0, err = '';
    try {
      status = (await sender({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, body, {
        vapid: { subject: keys.subject, publicKey: keys.publicKey, privateKey: keys.privateKey }, ttl: PUSH_LIMITS.ttlSec, urgency: payload.type === 'urgent' ? 'high' : 'normal',
      })).statusCode;
    } catch (e) { err = String((e as Error).message ?? e).slice(0, 200); }
    if (status >= 200 && status < 300) {
      out.sent++;
      await db.query(`UPDATE hq_push_subscriptions SET last_ok_at=$2, failures=0, last_error=NULL WHERE id=$1`, [s.id, now]);
    } else if (status === 404 || status === 410) {
      out.removed++;
      await db.query(`DELETE FROM hq_push_subscriptions WHERE id=$1`, [s.id]);
    } else if (Number(s.failures) + 1 >= PUSH_LIMITS.maxFailures) {
      out.removed++;
      await db.query(`DELETE FROM hq_push_subscriptions WHERE id=$1`, [s.id]);
    } else {
      out.failed++;
      await db.query(`UPDATE hq_push_subscriptions SET failures=failures+1, last_error=$2 WHERE id=$1`, [s.id, err || `push service answered ${status}`]);
    }
  }
  return out;
}

// ---------- notify: one event → a row per person allowed and opted in ----------
const COL: Record<PushType, string> = { decision: 'on_decision', agent: 'on_agent', urgent: 'on_urgent', good: 'on_good' };

/** Queue one event for everyone who may get it, wants this kind and has a device. Returns the rows queued. Never pushes twice. */
export async function notify(db: Db, ev: PushEvent, now = new Date()): Promise<number> {
  if (!ev || !isPushType(ev.type)) return 0;
  const key = pushText(ev.dedupeKey, 200);
  if (!key) return 0;
  const users = (await db.query(
    `SELECT u.id, u.role, COALESCE(s.on_decision,true) AS on_decision, COALESCE(s.on_agent,true) AS on_agent, COALESCE(s.on_urgent,true) AS on_urgent, COALESCE(s.on_good,true) AS on_good
     FROM hq_users u LEFT JOIN hq_push_settings s ON s.user_id=u.id
     WHERE u.role IN ('owner','member') AND NOT u.disabled AND NOT u.pending AND EXISTS (SELECT 1 FROM hq_push_subscriptions p WHERE p.user_id=u.id)`)).rows;
  let n = 0;
  for (const u of users) {
    if (!mayReceive({ id: Number(u.id), role: String(u.role) }, ev) || u[COL[ev.type]] === false) continue;
    const r = await db.query(
      `INSERT INTO hq_push_log (user_id, type, dedupe_key, title, body, url, created_at) VALUES ($1,$2,$3,$4,$5,$6,$7) ON CONFLICT (user_id, dedupe_key) DO NOTHING`,
      [u.id, ev.type, key, pushText(ev.title, 120) || 'Dulcy HQ', pushText(ev.body, 300), pushUrl(ev.url), now]);
    n += r.rowCount ?? 0;
  }
  return n;
}

/** notify() that never throws (for the engine's own work: a push problem never stops it). */
export async function notifySafe(db: Db, ev: PushEvent, now = new Date()): Promise<number> {
  try { return await notify(db, ev, now); } catch (e) {
    console.error(JSON.stringify({ level: 'warn', message: 'push not queued', key: String(ev?.dedupeKey ?? '').slice(0, 80), err: String((e as Error).message ?? e).slice(0, 200) }));
    return 0;
  }
}

// ---------- flush: send what waits, within the limits ----------
export interface FlushResult { pushes: number; rows: number; capped: number; expired: number; devices: DeliverResult }

/**
 * Send waiting rows. Per person: nothing within a minute of their last push; decisions within 3
 * minutes of their last decision push wait; everything ready goes out as ONE push; past 60 pushes
 * today the rest is dropped (capped). Rows older than 30 minutes are dropped. The send slot is
 * reserved in one UPDATE, so two flushes never push the same rows.
 */
export async function flushPush(db: Db, cfg: Pick<Config, 'vapidPublicKey' | 'vapidPrivateKey' | 'vapidSubject' | 'hqPublicUrl'>, sender: PushSender, now = new Date()): Promise<FlushResult> {
  const out: FlushResult = { pushes: 0, rows: 0, capped: 0, expired: 0, devices: { sent: 0, failed: 0, removed: 0 } };
  out.expired = (await db.query(`UPDATE hq_push_log SET status='expired' WHERE status='pending' AND created_at < $1`, [new Date(now.getTime() - PUSH_LIMITS.staleMs)])).rowCount ?? 0;
  const users = (await db.query(`SELECT DISTINCT user_id FROM hq_push_log WHERE status='pending' LIMIT 100`)).rows.map((r) => Number(r.user_id));
  if (!users.length) return out;
  const keys = await pushKeys(db, cfg);
  const day = nyDate(now);
  for (const userId of users) {
    await db.query(`INSERT INTO hq_push_settings (user_id) VALUES ($1) ON CONFLICT (user_id) DO NOTHING`, [userId]);
    const st = (await db.query(`SELECT last_push_at, last_decision_push_at, day, day_count FROM hq_push_settings WHERE user_id=$1`, [userId])).rows[0];
    const rows = (await db.query(`SELECT id, type, title, body, url, dedupe_key, created_at FROM hq_push_log WHERE user_id=$1 AND status='pending' ORDER BY created_at, id LIMIT 50`, [userId])).rows;
    const lastDecision = st?.last_decision_push_at ? new Date(st.last_decision_push_at).getTime() : 0;
    const holdDecisions = lastDecision > 0 && now.getTime() - lastDecision < PUSH_LIMITS.groupMs;
    const ready = rows.filter((r) => !(holdDecisions && r.type === 'decision'));
    if (!ready.length) continue;
    const last = st?.last_push_at ? new Date(st.last_push_at).getTime() : 0;
    if (last > 0 && now.getTime() - last < PUSH_LIMITS.minGapMs) continue;
    const usedToday = st?.day === day ? Number(st.day_count) : 0;
    if (usedToday >= PUSH_LIMITS.dailyCap) {
      out.capped += (await db.query(`UPDATE hq_push_log SET status='capped' WHERE id = ANY($1) AND status='pending'`, [ready.map((r) => r.id)])).rowCount ?? 0;
      continue;
    }
    const hasDecision = ready.some((r) => r.type === 'decision');
    const slot = await db.query(
      `UPDATE hq_push_settings SET last_push_at=$2, day=$3, day_count=(CASE WHEN day=$3 THEN day_count ELSE 0 END)+1,
         last_decision_push_at=CASE WHEN $4 THEN $2 ELSE last_decision_push_at END
       WHERE user_id=$1 AND (last_push_at IS NULL OR last_push_at <= $5) AND (day<>$3 OR day_count < $6) RETURNING user_id`,
      [userId, now, day, hasDecision, new Date(now.getTime() - PUSH_LIMITS.minGapMs), PUSH_LIMITS.dailyCap]);
    if (!slot.rowCount) continue; // another flush has this person right now
    const batch = randomBytes(8).toString('hex');
    const claimed = (await db.query(`UPDATE hq_push_log SET status='sent', sent_at=$2, batch=$3 WHERE id = ANY($1) AND status='pending' RETURNING type, title, body, url, dedupe_key, created_at`, [ready.map((r) => r.id), now, batch])).rows;
    if (!claimed.length) continue;
    const payload = buildPayload(claimed.map((r) => ({ type: r.type, title: r.title, body: r.body, url: r.url, dedupeKey: r.dedupe_key, created: new Date(r.created_at).toISOString() })), now.getTime());
    const d = await deliver(db, keys, sender, userId, payload, now);
    out.pushes++; out.rows += claimed.length;
    out.devices.sent += d.sent; out.devices.failed += d.failed; out.devices.removed += d.removed;
  }
  return out;
}

// One flush at a time per process (the HTTP server kicks one after a chat answer; the loop runs one a minute).
let chain: Promise<unknown> = Promise.resolve();
/** Start a flush after the current one (never throws). */
export function kickFlush(db: Db, cfg: Parameters<typeof flushPush>[1], sender: PushSender): Promise<unknown> {
  chain = chain.then(() => flushPush(db, cfg, sender)).catch((e) => console.error(JSON.stringify({ level: 'warn', message: 'push flush failed', err: String((e as Error).message ?? e).slice(0, 200) })));
  return chain;
}
/** Resolves when the flushes started so far are done (tests). */
export const pushIdle = () => chain;

// ---------- devices (subscriptions) ----------
/** The push services browsers use (Chrome/Android, Apple, Firefox, Edge): the server only ever posts to these. */
export const PUSH_HOSTS = ['fcm.googleapis.com', 'android.googleapis.com', 'push.apple.com', 'push.services.mozilla.com', 'notify.windows.com'];
export function pushHostOk(endpoint: string): boolean {
  try {
    const u = new URL(endpoint);
    const h = u.hostname.toLowerCase();
    return u.protocol === 'https:' && !u.username && !u.password && (!u.port || u.port === '443') && PUSH_HOSTS.some((x) => h === x || h.endsWith(`.${x}`));
  } catch { return false; }
}
/** A browser's PushSubscription (toJSON()) → what is stored, or the error text. Pure. */
export function validSubscription(x: any): { endpoint: string; p256dh: string; auth: string } | string {
  const endpoint = String(x?.endpoint ?? '').trim();
  if (!endpoint || endpoint.length > 1000 || !pushHostOk(endpoint)) return 'That is not a push address from a browser this HQ knows.';
  const p256dh = String(x?.keys?.p256dh ?? '').trim(), auth = String(x?.keys?.auth ?? '').trim();
  if (b64len(p256dh) !== 65 || b64len(auth) !== 16) return 'The push keys from the browser are missing or not valid.';
  return { endpoint, p256dh, auth };
}

/** Save this device for this person (the same device again = updated; a device moves to whoever signs in on it). */
export async function saveSubscription(db: Db, user: Pick<HqUser, 'id'>, raw: unknown, userAgent: string, now = new Date()): Promise<{ id: number; created: boolean } | { error: string }> {
  const s = validSubscription(raw);
  if (typeof s === 'string') return { error: s };
  const r = await db.query(
    `INSERT INTO hq_push_subscriptions (user_id, endpoint, p256dh, auth, user_agent, created_at, updated_at) VALUES ($1,$2,$3,$4,$5,$6,$6)
     ON CONFLICT (endpoint) DO UPDATE SET user_id=EXCLUDED.user_id, p256dh=EXCLUDED.p256dh, auth=EXCLUDED.auth, user_agent=EXCLUDED.user_agent, failures=0, last_error=NULL, updated_at=EXCLUDED.updated_at
     RETURNING id, (xmax = 0) AS created`, [user.id, s.endpoint, s.p256dh, s.auth, pushText(userAgent, 300), now]);
  await db.query(`INSERT INTO hq_push_settings (user_id) VALUES ($1) ON CONFLICT (user_id) DO NOTHING`, [user.id]);
  // Keep the newest devices only.
  await db.query(`DELETE FROM hq_push_subscriptions WHERE user_id=$1 AND id NOT IN (SELECT id FROM hq_push_subscriptions WHERE user_id=$1 ORDER BY updated_at DESC, id DESC LIMIT $2)`, [user.id, PUSH_LIMITS.maxDevices]);
  return { id: Number(r.rows[0].id), created: Boolean(r.rows[0].created) };
}
export async function removeSubscription(db: Db, user: Pick<HqUser, 'id'>, endpoint: string): Promise<boolean> {
  return ((await db.query(`DELETE FROM hq_push_subscriptions WHERE user_id=$1 AND endpoint=$2`, [user.id, String(endpoint ?? '')])).rowCount ?? 0) > 0;
}
export async function removeDevice(db: Db, user: Pick<HqUser, 'id'>, id: number): Promise<boolean> {
  return ((await db.query(`DELETE FROM hq_push_subscriptions WHERE user_id=$1 AND id=$2`, [user.id, id])).rowCount ?? 0) > 0;
}
export interface Device { id: number; label: string; created: string; lastOk: string | null; failing: boolean }
export async function listDevices(db: Db, user: Pick<HqUser, 'id'>): Promise<Device[]> {
  const r = await db.query(`SELECT id, user_agent, created_at, last_ok_at, failures FROM hq_push_subscriptions WHERE user_id=$1 ORDER BY updated_at DESC, id DESC`, [user.id]);
  return r.rows.map((x) => ({
    id: Number(x.id), label: deviceLabel(x.user_agent), created: new Date(x.created_at).toISOString(), lastOk: x.last_ok_at ? new Date(x.last_ok_at).toISOString() : null,
    failing: Number(x.failures) > 0,
  }));
}

// ---------- settings ----------
export async function getSettings(db: Db, user: Pick<HqUser, 'id'>): Promise<PushSettings> {
  const r = (await db.query(`SELECT on_decision, on_agent, on_urgent, on_good FROM hq_push_settings WHERE user_id=$1`, [user.id])).rows[0];
  return r ? { decision: r.on_decision, agent: r.on_agent, urgent: r.on_urgent, good: r.on_good } : { ...DEFAULT_SETTINGS };
}
/** Change some of the four switches (true/false each). Returns the settings, or the error text. */
export async function saveSettings(db: Db, user: Pick<HqUser, 'id'>, body: any): Promise<PushSettings | string> {
  const change = Object.entries(body ?? {}).filter(([k]) => isPushType(k));
  if (!change.length) return 'Send at least one of decision, agent, urgent, good (true or false).';
  if (change.some(([, v]) => typeof v !== 'boolean')) return 'Each switch is true or false.';
  const next = { ...(await getSettings(db, user)), ...Object.fromEntries(change) } as PushSettings;
  await db.query(
    `INSERT INTO hq_push_settings (user_id, on_decision, on_agent, on_urgent, on_good, updated_at) VALUES ($1,$2,$3,$4,$5,now())
     ON CONFLICT (user_id) DO UPDATE SET on_decision=$2, on_agent=$3, on_urgent=$4, on_good=$5, updated_at=now()`,
    [user.id, next.decision, next.agent, next.urgent, next.good]);
  return next;
}

// ---------- "on this screen" (so a chat answer you are looking at is not pushed) ----------
/** The page reports its screen (route) and whether it is visible, on change and every 30 s. */
export async function setPresence(db: Db, user: Pick<HqUser, 'id'>, route: unknown, visible: boolean, now = new Date()): Promise<void> {
  const r = pushText(String(route ?? '').replace(/^#?\/?/, '').split('?')[0], 120);
  await db.query(`INSERT INTO hq_push_presence (user_id, route, visible, seen_at) VALUES ($1,$2,$3,$4)
    ON CONFLICT (user_id) DO UPDATE SET route=EXCLUDED.route, visible=EXCLUDED.visible, seen_at=EXCLUDED.seen_at`, [user.id, r, visible === true, now]);
}
/** Is this person looking at this screen right now (visible, reported in the last 75 s)? prefix "chat/Ada" matches chat/Ada and chat/Ada/12. */
export async function isOnScreen(db: Db, userId: number, prefix: string, now = new Date()): Promise<boolean> {
  const r = (await db.query(`SELECT route, visible, seen_at FROM hq_push_presence WHERE user_id=$1`, [userId])).rows[0];
  if (!r || !r.visible || now.getTime() - new Date(r.seen_at).getTime() > PUSH_LIMITS.presenceMs) return false;
  const route = String(r.route).toLowerCase(), p = prefix.toLowerCase();
  return route === p || route.startsWith(`${p}/`);
}

/** An agent's chat answer: pushed to the person who asked, unless they are on that chat right now. */
export async function notifyChatReply(db: Db, user: Pick<HqUser, 'id'>, r: { agent: string; threadId: number; reply: { id: number; text: string } }, now = new Date()): Promise<number> {
  if (await isOnScreen(db, user.id, `chat/${r.agent}`, now)) return 0;
  return notify(db, {
    type: 'agent', audience: { userId: user.id }, agent: r.agent, title: `${r.agent} answered`,
    body: pushText(String(r.reply.text ?? '').replace(/[*_`#>]/g, ''), 200), url: `chat/${r.agent}/${r.threadId}`, dedupeKey: `chat:${r.reply.id}`,
  }, now);
}

// ---------- test push ----------
export async function sendTestPush(db: Db, cfg: Parameters<typeof flushPush>[1], sender: PushSender, user: Pick<HqUser, 'id'>, now = new Date()): Promise<{ status: number; error?: string; result?: DeliverResult }> {
  const devices = Number((await db.query(`SELECT count(*)::int AS n FROM hq_push_subscriptions WHERE user_id=$1`, [user.id])).rows[0].n);
  if (!devices) return { status: 400, error: 'Turn on notifications on this device first.' };
  const last = (await db.query(`SELECT max(created_at) AS at FROM hq_push_log WHERE user_id=$1 AND type='test'`, [user.id])).rows[0]?.at;
  if (last && now.getTime() - new Date(last).getTime() < PUSH_LIMITS.testGapMs) return { status: 429, error: 'One test at a time: wait a few seconds.' };
  const row: PushRow = { type: 'test', title: 'Dulcy HQ test', body: 'Notifications work on this device. Tap to open HQ.', url: 'notifications', dedupeKey: `test:${now.getTime()}:${randomBytes(4).toString('hex')}` };
  await db.query(`INSERT INTO hq_push_log (user_id, type, dedupe_key, title, body, url, status, created_at, sent_at) VALUES ($1,'test',$2,$3,$4,$5,'sent',$6,$6)`, [user.id, row.dedupeKey, row.title, row.body, pushUrl(row.url), now]);
  const result = await deliver(db, await pushKeys(db, cfg), sender, user.id, buildPayload([row], now.getTime()), now);
  return { status: 200, result };
}

// ---------- the API (/hq/api/push/*) ----------
/**
 * GET key · GET settings (switches + this person's devices) · PUT settings · POST subscribe ·
 * DELETE subscribe ({endpoint}) · DELETE devices/<id> · POST test · POST presence. Owners and
 * members only (the server's client guard refuses client logins before this).
 */
export async function pushRoute(db: Db, cfg: Parameters<typeof flushPush>[1], sender: PushSender, user: HqUser, method: string, sub: string, body: any, userAgent: string): Promise<{ status: number; body: unknown }> {
  if (user.role !== 'owner' && user.role !== 'member') return { status: 403, body: { error: 'not for this login' } };
  if (sub === '/key' && method === 'GET') return { status: 200, body: { publicKey: (await pushKeys(db, cfg)).publicKey } };
  if (sub === '/settings' && method === 'GET') return { status: 200, body: { settings: await getSettings(db, user), devices: await listDevices(db, user), limits: { perMinute: 1, perDay: PUSH_LIMITS.dailyCap, groupMinutes: PUSH_LIMITS.groupMs / 60_000 }, role: user.role } };
  if (sub === '/settings' && method === 'PUT') {
    const r = await saveSettings(db, user, body);
    return typeof r === 'string' ? { status: 400, body: { error: r } } : { status: 200, body: { ok: true, settings: r } };
  }
  if (sub === '/subscribe' && method === 'POST') {
    const r = await saveSubscription(db, user, body?.subscription ?? body, userAgent);
    return 'error' in r ? { status: 400, body: { error: r.error } } : { status: 200, body: { ok: true, id: r.id, created: r.created } };
  }
  if (sub === '/subscribe' && method === 'DELETE') return { status: 200, body: { ok: await removeSubscription(db, user, String(body?.endpoint ?? '')) } };
  const dm = /^\/devices\/(\d{1,12})$/.exec(sub);
  if (dm && method === 'DELETE') { const ok = await removeDevice(db, user, Number(dm[1])); return { status: ok ? 200 : 404, body: ok ? { ok: true } : { error: 'not found' } }; }
  if (sub === '/test' && method === 'POST') {
    const r = await sendTestPush(db, cfg, sender, user);
    return r.error ? { status: r.status, body: { error: r.error } } : { status: 200, body: { ok: true, ...r.result } };
  }
  if (sub === '/presence' && method === 'POST') { await setPresence(db, user, body?.route, body?.visible === true); return { status: 200, body: { ok: true } }; }
  return { status: 404, body: { error: 'not found' } };
}

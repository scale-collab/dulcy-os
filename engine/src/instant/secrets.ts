// Hook secrets in Postgres (Alex 2026-11-28: "all the tools should be connected to the agents"; one command, no
// hand-copied secrets). The engine makes its own shared secrets (EmailBison, n8n, Make, Airtable) the first time
// `hooks connect` needs one; provider-issued secrets (Close signature key, Fathom whsec_, Slack signing secret) are
// stored by `hooks connect` (Close) or `hooks secret <source>` (hidden input). HOOK_SECRET_<SOURCE> in .env wins.
//
// Rules: a secret is sealed (AES-256-GCM, key from ENGINE_SECRET) before it reaches Postgres and is opened only to
// check a webhook or to give it to the provider that needs it (the EmailBison URL, the n8n credential). It is never
// printed, logged, returned by HQ or put in a Decision. Two states:
//   pending   = the secret exists but the provider is not wired yet: its webhook is accepted, its jobs keep their
//               old timer (nothing changes until events really arrive);
//   connected = the provider sends events: isInstant() turns its jobs instant (old timer off, backup sweep on).
// A pending source becomes connected by `hooks connect` (it checked the provider) or by its first signed event.
import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from 'node:crypto';
import type { Db } from '../db/pool.js';
import type { Config, HookSource } from '../config.js';
import { HOOK_SOURCES } from '../config.js';

export const SHARED_SOURCES = ['emailbison', 'n8n', 'make', 'airtable'] as const satisfies readonly HookSource[];
export const PROVIDER_SOURCES = ['slack', 'fathom', 'close'] as const satisfies readonly HookSource[];
export type HookState = 'pending' | 'connected';
export interface HookRow { source: HookSource; origin: 'engine' | 'provider'; state: HookState; meta: Record<string, any>; connectedAt: string | null; updatedAt: string }

// ---------- sealing ----------
const V = 'v1';
function key(engineSecret: string): Buffer {
  if (!engineSecret || engineSecret.length < 32) throw new Error('ENGINE_SECRET must be set (32+ characters)');
  return Buffer.from(hkdfSync('sha256', Buffer.from(engineSecret, 'utf8'), Buffer.from('dulcy-hook-secrets', 'utf8'), Buffer.from('hook-secret-v1', 'utf8'), 32));
}
export function sealSecret(engineSecret: string, source: string, secret: string): string {
  const iv = randomBytes(12);
  const c = createCipheriv('aes-256-gcm', key(engineSecret), iv);
  c.setAAD(Buffer.from(source, 'utf8'));
  const body = Buffer.concat([c.update(secret, 'utf8'), c.final()]);
  return `${V}:${Buffer.concat([iv, c.getAuthTag(), body]).toString('base64')}`;
}
export function openSecret(engineSecret: string, source: string, sealed: string): string {
  const [v, b64] = sealed.split(':', 2);
  if (v !== V || !b64) throw new Error('unknown sealed secret format');
  const raw = Buffer.from(b64, 'base64');
  if (raw.length < 29) throw new Error('sealed secret too short');
  const d = createDecipheriv('aes-256-gcm', key(engineSecret), raw.subarray(0, 12));
  d.setAAD(Buffer.from(source, 'utf8'));
  d.setAuthTag(raw.subarray(12, 28));
  return Buffer.concat([d.update(raw.subarray(28)), d.final()]).toString('utf8');
}

const isSource = (s: string): s is HookSource => (HOOK_SOURCES as readonly string[]).includes(s);
const toRow = (r: any): HookRow => ({ source: r.source, origin: r.origin, state: r.state, meta: r.meta ?? {}, connectedAt: r.connected_at ? new Date(r.connected_at).toISOString() : null, updatedAt: new Date(r.updated_at).toISOString() });

/** Every row, without secrets. */
export async function hookRows(db: Db): Promise<HookRow[]> {
  return (await db.query(`SELECT source, origin, state, meta, connected_at, updated_at FROM hook_secrets ORDER BY source`)).rows.map(toRow);
}
export async function hookRow(db: Db, source: HookSource): Promise<HookRow | null> {
  const r = (await db.query(`SELECT source, origin, state, meta, connected_at, updated_at FROM hook_secrets WHERE source=$1`, [source])).rows[0];
  return r ? toRow(r) : null;
}

/** The secret in force for a source: .env first, then the table (any state). '' = none. Never log the answer. */
export async function secretFor(db: Db, cfg: Pick<Config, 'engineSecret' | 'hookSecretsEnv'>, source: HookSource): Promise<string> {
  const env = cfg.hookSecretsEnv?.[source];
  if (env) return env;
  const r = (await db.query(`SELECT sealed FROM hook_secrets WHERE source=$1`, [source])).rows[0];
  return r ? openSecret(cfg.engineSecret, source, r.sealed) : '';
}

/**
 * The engine's own shared secret for EmailBison / n8n / Make / Airtable: the .env one when set, else the table's,
 * else a new random one (48 url-safe characters) saved as pending. Concurrent callers get the same secret.
 */
export async function ensureSharedSecret(db: Db, cfg: Pick<Config, 'engineSecret' | 'hookSecretsEnv'>, source: typeof SHARED_SOURCES[number]): Promise<{ secret: string; created: boolean; fromEnv: boolean }> {
  const env = cfg.hookSecretsEnv?.[source];
  if (env) {
    // A row too (same secret, connected: the .env one is in force anyway), so non-secret facts can be kept on it.
    await db.query(`INSERT INTO hook_secrets (source, sealed, origin, state, connected_at) VALUES ($1,$2,'engine','connected',now()) ON CONFLICT (source) DO NOTHING`, [source, sealSecret(cfg.engineSecret, source, env)]);
    return { secret: env, created: false, fromEnv: true };
  }
  const fresh = randomBytes(36).toString('base64url');
  const ins = await db.query(`INSERT INTO hook_secrets (source, sealed, origin, state) VALUES ($1,$2,'engine','pending') ON CONFLICT (source) DO NOTHING RETURNING source`,
    [source, sealSecret(cfg.engineSecret, source, fresh)]);
  if (ins.rows[0]) return { secret: fresh, created: true, fromEnv: false };
  return { secret: await secretFor(db, cfg, source), created: false, fromEnv: false };
}

/** Checks a provider-issued secret's shape (so a paste of the wrong thing is refused, never echoed). */
export function checkProviderSecret(source: HookSource, secret: string): string | null {
  const s = secret.trim();
  if (source === 'slack') return /^[0-9a-f]{32,64}$/i.test(s) ? null : 'that is not a Slack Signing Secret (32 hex characters, from Basic Information → App Credentials)';
  if (source === 'fathom') return /^whsec_[A-Za-z0-9+/=]{16,}$/.test(s) ? null : 'that is not a Fathom webhook secret (it starts with whsec_)';
  if (source === 'close') return /^[0-9a-f]{32,}$/i.test(s) && s.length % 2 === 0 ? null : 'that is not a Close signature key (hex)';
  return s.length >= 16 && !/\s/.test(s) ? null : 'a secret needs 16+ characters and no spaces';
}

/** Store a provider-issued secret (replaces the old one). `state` connected: the provider is set to send. */
export async function storeProviderSecret(db: Db, cfg: Pick<Config, 'engineSecret'>, source: HookSource, secret: string, meta: Record<string, unknown> = {}, state: HookState = 'connected'): Promise<void> {
  const bad = checkProviderSecret(source, secret);
  if (bad) throw new Error(bad);
  await db.query(`INSERT INTO hook_secrets (source, sealed, origin, state, meta, connected_at) VALUES ($1,$2,'provider',$3,$4, CASE WHEN $3='connected' THEN now() END)
    ON CONFLICT (source) DO UPDATE SET sealed=EXCLUDED.sealed, origin='provider', state=EXCLUDED.state, meta=hook_secrets.meta || EXCLUDED.meta, updated_at=now(),
      connected_at=CASE WHEN EXCLUDED.state='connected' THEN COALESCE(hook_secrets.connected_at, now()) ELSE NULL END`,
    [source, sealSecret(cfg.engineSecret, source, secret.trim()), state, meta]);
}

/** Merge non-secret facts into a source's meta (no row = nothing). */
export async function setHookMeta(db: Db, source: HookSource, meta: Record<string, unknown>): Promise<void> {
  await db.query(`UPDATE hook_secrets SET meta = meta || $2, updated_at=now() WHERE source=$1`, [source, meta]);
}
/** Mark a source connected (its provider now sends). Returns true when it changed. */
export async function markConnected(db: Db, source: HookSource): Promise<boolean> {
  return ((await db.query(`UPDATE hook_secrets SET state='connected', connected_at=COALESCE(connected_at, now()), updated_at=now() WHERE source=$1 AND state='pending'`, [source])).rowCount ?? 0) > 0;
}

/**
 * Load the table into the running config: connected rows join cfg.hookSecrets (what isInstant() reads), pending
 * rows go to cfg.hookPending (accepted, not instant). .env secrets always win and are always "connected".
 */
const baseSecrets = new WeakMap<object, Partial<Record<HookSource, string>>>();
export async function refreshHookSecrets(db: Db, cfg: Config): Promise<void> {
  // The secrets the config started with (.env) are the base; the table only adds to them.
  if (!baseSecrets.has(cfg)) baseSecrets.set(cfg, { ...(cfg.hookSecrets ?? {}) });
  const env = baseSecrets.get(cfg)!;
  const on: Partial<Record<HookSource, string>> = { ...env };
  const pending: Partial<Record<HookSource, string>> = {};
  for (const r of (await db.query(`SELECT source, sealed, state FROM hook_secrets`)).rows as { source: string; sealed: string; state: string }[]) {
    const src = r.source;
    if (!isSource(src) || env[src]) continue;
    let s = '';
    try { s = openSecret(cfg.engineSecret, src, r.sealed); } catch { console.error(JSON.stringify({ level: 'error', message: 'hook secret could not be opened (ENGINE_SECRET changed?)', source: src })); continue; }
    if (r.state === 'connected') on[src] = s; else pending[src] = s;
  }
  cfg.hookSecrets = on;
  cfg.hookPending = pending;
}

const lastLookup = new Map<string, number>();
/**
 * The secret to check a webhook with: the running config first; if none, the table (a secret stored by the CLI a
 * moment ago), at most once every 5 seconds per source so unknown requests never hammer Postgres.
 */
export async function hookSecretNow(db: Db, cfg: Config, source: HookSource, now = Date.now()): Promise<{ secret: string; pending: boolean } | null> {
  const on = cfg.hookSecrets?.[source];
  if (on) return { secret: on, pending: false };
  const p = cfg.hookPending?.[source];
  if (p) return { secret: p, pending: true };
  if (now - (lastLookup.get(source) ?? 0) < 5_000) return null;
  lastLookup.set(source, now);
  try { await refreshHookSecrets(db, cfg); } catch { return null; }
  if (cfg.hookSecrets?.[source]) return { secret: cfg.hookSecrets[source]!, pending: false };
  if (cfg.hookPending?.[source]) return { secret: cfg.hookPending[source]!, pending: true };
  return null;
}
export function _resetHookLookups() { lastLookup.clear(); }

/** A pending source just sent a signed event: it is wired, so its jobs turn instant now. */
export async function promoteOnEvent(db: Db, cfg: Config, source: HookSource): Promise<void> {
  if (!(await markConnected(db, source))) return;
  const s = cfg.hookPending?.[source];
  if (s) { cfg.hookSecrets = { ...cfg.hookSecrets, [source]: s }; const p = { ...cfg.hookPending }; delete p[source]; cfg.hookPending = p; }
  console.log(JSON.stringify({ level: 'info', message: 'hook source connected (first signed event)', source }));
}

/** Keep the running engine in step with the table (the CLI writes it from another process). */
export function startHookSecretRefresh(db: Db, cfg: Config, signal: AbortSignal, everyMs = 30_000): void {
  const t = setInterval(() => { void refreshHookSecrets(db, cfg).catch((e) => console.error(JSON.stringify({ level: 'error', message: 'hook secrets refresh failed', err: String(e) }))); }, everyMs);
  signal.addEventListener('abort', () => clearInterval(t));
}

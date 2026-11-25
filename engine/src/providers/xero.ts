// Xero Accounting API, read only, for Ledger (Alex 2026-11-25).
// OAuth 2.0 with a one-time login: `xero-connect` prints a link, Alex clicks Allow, the browser
// lands on localhost (the page fails to load, that is expected) and he pastes that address back.
// Tokens live in Postgres (oauth_tokens). Xero rotates the refresh token on every refresh, so
// the row is locked while refreshing; the engine and the CLI never refresh at the same time.
import { randomBytes } from 'node:crypto';
import type { Db } from '../db/pool.js';
import type { Config } from '../config.js';
import { PermanentError, RetryableError } from '../errors.js';

const PROVIDER = 'xero';
type XeroCfg = Pick<Config, 'xeroClientId' | 'xeroClientSecret' | 'xeroRedirectUri' | 'xeroScopes' | 'xeroTenantName' | 'xeroLoginUrl' | 'xeroIdentityUrl' | 'xeroApiUrl'>;

function needApp(cfg: XeroCfg): { id: string; secret: string } {
  if (!cfg.xeroClientId || !cfg.xeroClientSecret) throw new PermanentError('no XERO_CLIENT_ID / XERO_CLIENT_SECRET on the server');
  return { id: cfg.xeroClientId, secret: cfg.xeroClientSecret };
}

async function tokenCall(cfg: XeroCfg, body: Record<string, string>, f: typeof fetch): Promise<{ access_token: string; refresh_token: string; expires_in: number }> {
  const app = needApp(cfg);
  let res: Response;
  try {
    res = await f(`${cfg.xeroIdentityUrl.replace(/\/+$/, '')}/connect/token`, {
      method: 'POST',
      headers: { authorization: `Basic ${Buffer.from(`${app.id}:${app.secret}`).toString('base64')}`, 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(body).toString(), signal: AbortSignal.timeout(30_000),
    });
  } catch { throw new RetryableError('Xero login: network error or timeout'); }
  const j: any = await res.json().catch(() => ({}));
  if (res.status >= 500) throw new RetryableError(`Xero login: HTTP ${res.status}`);
  if (!res.ok || !j.access_token) throw new PermanentError(`Xero login refused: ${j.error ?? `HTTP ${res.status}`}${j.error === 'invalid_grant' ? ' (run xero-connect again)' : ''}`);
  return j;
}

/** Step 1 of the one-time login: the link Alex opens. */
export async function xeroAuthorizeUrl(db: Db, cfg: XeroCfg): Promise<string> {
  const app = needApp(cfg);
  const state = randomBytes(16).toString('hex');
  await db.query(`INSERT INTO oauth_tokens (provider, pending_state) VALUES ($1,$2)
    ON CONFLICT (provider) DO UPDATE SET pending_state = EXCLUDED.pending_state, updated_at = now()`, [PROVIDER, state]);
  const q = new URLSearchParams({ response_type: 'code', client_id: app.id, redirect_uri: cfg.xeroRedirectUri, scope: cfg.xeroScopes, state });
  return `${cfg.xeroLoginUrl}?${q}`;
}

/** Step 2: the address the browser landed on after Allow → tokens + the Dulcy Media organisation. */
export async function xeroFinishLogin(db: Db, cfg: XeroCfg, pasted: string, f: typeof fetch = fetch): Promise<{ tenant: string; others: string[] }> {
  let u: URL;
  try { u = new URL(pasted.trim()); } catch { throw new PermanentError('that is not the address from the browser bar (it starts with http://localhost)'); }
  if (u.searchParams.get('error')) throw new PermanentError(`Xero said: ${u.searchParams.get('error')} ${u.searchParams.get('error_description') ?? ''}`.trim());
  const code = u.searchParams.get('code'); const state = u.searchParams.get('state');
  const row = (await db.query('SELECT pending_state FROM oauth_tokens WHERE provider = $1', [PROVIDER])).rows[0];
  if (!code || !state || !row?.pending_state || row.pending_state !== state) throw new PermanentError('this link does not match the last xero-connect (run xero-connect again and use the newest link)');
  const t = await tokenCall(cfg, { grant_type: 'authorization_code', code, redirect_uri: cfg.xeroRedirectUri }, f);
  let res: Response;
  try { res = await f(`${cfg.xeroApiUrl.replace(/\/+$/, '')}/connections`, { headers: { authorization: `Bearer ${t.access_token}` }, signal: AbortSignal.timeout(30_000) }); } catch { throw new RetryableError('Xero connections: network error'); }
  const conns: any[] = await res.json().catch(() => []);
  const orgs = (Array.isArray(conns) ? conns : []).filter((c) => !c.tenantType || c.tenantType === 'ORGANISATION');
  const want = cfg.xeroTenantName.toLowerCase();
  const pick = orgs.find((c) => String(c.tenantName).toLowerCase() === want) ?? orgs.find((c) => String(c.tenantName).toLowerCase().includes(want)) ?? (orgs.length === 1 ? orgs[0] : undefined);
  if (!pick) throw new PermanentError(`no Xero organisation called "${cfg.xeroTenantName}" was allowed (allowed: ${orgs.map((c) => c.tenantName).join(', ') || 'none'})`);
  await db.query(`UPDATE oauth_tokens SET refresh_token=$2, access_token=$3, expires_at=now() + make_interval(secs => $4), tenant_id=$5, tenant_name=$6, pending_state=NULL, updated_at=now() WHERE provider=$1`,
    [PROVIDER, t.refresh_token, t.access_token, Math.max(60, t.expires_in - 60), pick.tenantId, pick.tenantName]);
  return { tenant: String(pick.tenantName), others: orgs.filter((c) => c !== pick).map((c) => String(c.tenantName)) };
}

/** A valid access token + tenant; refreshes under a row lock when it is about to expire. */
async function session(db: Db, cfg: XeroCfg, f: typeof fetch): Promise<{ token: string; tenant: string }> {
  const quick = (await db.query(`SELECT access_token, tenant_id FROM oauth_tokens WHERE provider=$1 AND refresh_token IS NOT NULL AND expires_at > now() + interval '2 minutes'`, [PROVIDER])).rows[0];
  if (quick) return { token: quick.access_token, tenant: quick.tenant_id };
  const c = await db.connect();
  try {
    await c.query('BEGIN');
    const r = (await c.query('SELECT * FROM oauth_tokens WHERE provider=$1 FOR UPDATE', [PROVIDER])).rows[0];
    if (!r?.refresh_token) throw new PermanentError('Xero is not connected yet (run xero-connect on the server)');
    if (r.expires_at && new Date(r.expires_at).getTime() > Date.now() + 120_000) { await c.query('COMMIT'); return { token: r.access_token, tenant: r.tenant_id }; }
    const t = await tokenCall(cfg, { grant_type: 'refresh_token', refresh_token: r.refresh_token }, f);
    await c.query(`UPDATE oauth_tokens SET refresh_token=$2, access_token=$3, expires_at=now() + make_interval(secs => $4), updated_at=now() WHERE provider=$1`,
      [PROVIDER, t.refresh_token, t.access_token, Math.max(60, t.expires_in - 60)]);
    await c.query('COMMIT');
    return { token: t.access_token, tenant: r.tenant_id };
  } catch (e) { await c.query('ROLLBACK').catch(() => {}); throw e; } finally { c.release(); }
}

export function createXeroClient(db: Db, cfg: XeroCfg, f: typeof fetch = fetch) {
  const base = cfg.xeroApiUrl.replace(/\/+$/, '');
  /** GET an Accounting API path (e.g. "Reports/BankSummary"), read only. */
  async function get(path: string, params: Record<string, string | number> = {}): Promise<any> {
    const s = await session(db, cfg, f);
    const q = new URLSearchParams(Object.entries(params).map(([k, v]) => [k, String(v)]));
    let res: Response;
    try {
      res = await f(`${base}/api.xro/2.0/${path}${q.size ? `?${q}` : ''}`, { headers: { authorization: `Bearer ${s.token}`, 'xero-tenant-id': s.tenant, accept: 'application/json' }, signal: AbortSignal.timeout(60_000) });
    } catch { throw new RetryableError(`Xero ${path}: network error or timeout`); }
    if (res.status === 429 || res.status >= 500) throw new RetryableError(`Xero ${path}: HTTP ${res.status}`);
    if (res.status === 401 || res.status === 403) throw new PermanentError(`Xero ${path}: not allowed (HTTP ${res.status}; the app may need this permission, or run xero-connect again)`);
    if (!res.ok) throw new PermanentError(`Xero ${path}: HTTP ${res.status}`);
    return res.json();
  }
  /** Create entries (PUT). The Idempotency-Key makes a retry safe: Xero never creates the same entry twice. */
  async function put(path: string, body: unknown, idempotencyKey: string): Promise<any> {
    const s = await session(db, cfg, f);
    let res: Response;
    try {
      res = await f(`${base}/api.xro/2.0/${path}`, { method: 'PUT', headers: { authorization: `Bearer ${s.token}`, 'xero-tenant-id': s.tenant, accept: 'application/json', 'content-type': 'application/json', 'idempotency-key': idempotencyKey.slice(0, 128) }, body: JSON.stringify(body), signal: AbortSignal.timeout(60_000) });
    } catch { throw new RetryableError(`Xero ${path}: network error or timeout`); }
    const j: any = await res.json().catch(() => ({}));
    if (res.status === 429 || res.status >= 500) throw new RetryableError(`Xero ${path}: HTTP ${res.status}`);
    if (res.status === 401 || res.status === 403) throw new PermanentError(`Xero ${path}: not allowed (HTTP ${res.status}; run xero-connect again so Ledger gets the write permissions)`);
    if (!res.ok) {
      const errs = (j.Elements ?? []).flatMap((e: any) => (e.ValidationErrors ?? []).map((v: any) => v.Message)).filter(Boolean);
      throw new PermanentError(`Xero ${path} refused: ${errs.join('; ') || j.Message || `HTTP ${res.status}`}`.slice(0, 300));
    }
    return j;
  }
  /** Every page of a paged list (100 per page), at most maxPages. */
  async function pages(path: string, key: string, params: Record<string, string | number> = {}, maxPages = 10): Promise<any[]> {
    const out: any[] = [];
    for (let page = 1; page <= maxPages; page++) {
      const j = await get(path, { ...params, page });
      const rows: any[] = j?.[key] ?? [];
      out.push(...rows);
      if (rows.length < 100) break;
    }
    return out;
  }
  return { get, put, pages };
}
export type XeroClient = ReturnType<typeof createXeroClient>;

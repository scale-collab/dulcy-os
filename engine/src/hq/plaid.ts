// Finances → Personal through Plaid (Alex 2026-11-28). Owner only (checked in server.ts: members and
// "view as" get 403). Read only: Alex links his own cards and bank accounts once with Plaid Link, and
// Personal shows each account's balance, limit and, for credit cards, statement / minimum / due date.
// Nothing here moves money or starts a payment.
//
// Access tokens: sealed with AES-256-GCM before they reach Postgres (key derived from ENGINE_SECRET
// with HKDF, the item id as associated data). They are opened only to call Plaid, and never returned,
// logged or shown. Without PLAID_CLIENT_ID + PLAID_SECRET the tab says "Personal cards are not
// connected yet" and keeps the P/L sheet figures.
import { createCipheriv, createDecipheriv, hkdfSync, randomBytes, createHash } from 'node:crypto';
import type { Db } from '../db/pool.js';
import type { Config } from '../config.js';
import { createPlaidClient, plaidItemGone, type PlaidAccount, type PlaidAccountsResponse, type PlaidClient, type PlaidLiabilitiesResponse } from '../providers/plaid.js';
import { PERSONAL_CARD_NAMES } from './finance.js';

export const NOT_CONNECTED = 'Personal cards are not connected yet';
export const PERSONAL_CACHE_MS = 60 * 60_000;
/** A Refresh press still waits this long between reads (Plaid bills each live balance read). */
export const PERSONAL_REFRESH_FLOOR_MS = 30_000;
const MAX_ITEMS = 20;

// ---------- sealing the access token ----------
const SEAL_VERSION = 'v1';
function sealKey(secret: string): Buffer {
  if (!secret || secret.length < 32) throw new Error('ENGINE_SECRET must be set (32+ characters)');
  return Buffer.from(hkdfSync('sha256', Buffer.from(secret, 'utf8'), Buffer.from('dulcy-hq-plaid', 'utf8'), Buffer.from('plaid-access-token-v1', 'utf8'), 32));
}
/** "v1:<base64 iv|tag|ciphertext>". The item id is bound in as associated data. */
export function sealToken(secret: string, itemId: string, token: string): string {
  const iv = randomBytes(12);
  const c = createCipheriv('aes-256-gcm', sealKey(secret), iv);
  c.setAAD(Buffer.from(itemId, 'utf8'));
  const body = Buffer.concat([c.update(token, 'utf8'), c.final()]);
  return `${SEAL_VERSION}:${Buffer.concat([iv, c.getAuthTag(), body]).toString('base64')}`;
}
/** Throws when the text was changed, sealed for another item, or sealed with another secret. */
export function openToken(secret: string, itemId: string, sealed: string): string {
  const [v, b64] = sealed.split(':', 2);
  if (v !== SEAL_VERSION || !b64) throw new Error('unknown sealed token format');
  const raw = Buffer.from(b64, 'base64');
  if (raw.length < 29) throw new Error('sealed token too short');
  const d = createDecipheriv('aes-256-gcm', sealKey(secret), raw.subarray(0, 12));
  d.setAAD(Buffer.from(itemId, 'utf8'));
  d.setAuthTag(raw.subarray(12, 28));
  return Buffer.concat([d.update(raw.subarray(28)), d.final()]).toString('utf8');
}

// ---------- what Personal shows ----------
export interface PersonalAccount {
  name: string; mask: string; type: string; subtype: string; currency: string;
  /** Plaid "current": what is owed on a card or loan; what is in a bank account. */
  current: number | null; available: number | null; limit: number | null;
  /** Credit cards, when Plaid Liabilities has them (else null / ''). */
  statement: number | null; minimum: number | null; due: string; overdue: boolean | null; statementDate: string; lastPayment: number | null; lastPaymentDate: string;
}
export interface PersonalConnection { id: number; institution: string; linkedAt: string; accounts: PersonalAccount[]; error: string | null }
export interface PersonalTotals { cards: number; cardBalance: number; statement: number; minimum: number; cash: number }
export interface PersonalView {
  configured: boolean; message: string | null; env: 'sandbox' | 'production';
  connections: PersonalConnection[]; totals: PersonalTotals | null;
  /** P/L sheet card names (robinhood, discover) a linked account now stands in for. */
  replaces: string[];
  readAt: string;
}

const num = (x: unknown): number | null => (typeof x === 'number' && Number.isFinite(x) ? Math.round(x * 100) / 100 : null);
const ymd = (x: unknown): string => (typeof x === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(x) ? x : '');
const text = (x: unknown, max = 80): string => String(x ?? '').replace(/[\u0000-\u001f\u007f<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, max);

/** Plaid accounts (+ credit liabilities when present) → what Personal shows. Pure. */
export function parseAccounts(acc: Pick<PlaidAccountsResponse, 'accounts'>, li: PlaidLiabilitiesResponse | null): PersonalAccount[] {
  const credit = new Map((li?.liabilities?.credit ?? []).filter((c) => c && c.account_id).map((c) => [String(c.account_id), c]));
  return (acc.accounts ?? []).map((a: PlaidAccount) => {
    const b = a.balances ?? {}; const c = credit.get(String(a.account_id));
    return {
      name: text(a.name || a.official_name || 'Account'),
      mask: text(a.mask, 8), type: text(a.type, 20), subtype: text(a.subtype, 30), currency: text(b.iso_currency_code || b.unofficial_currency_code || 'USD', 6),
      current: num(b.current), available: num(b.available), limit: num(b.limit),
      statement: num(c?.last_statement_balance), minimum: num(c?.minimum_payment_amount), due: ymd(c?.next_payment_due_date),
      overdue: typeof c?.is_overdue === 'boolean' ? c.is_overdue : null, statementDate: ymd(c?.last_statement_issue_date),
      lastPayment: num(c?.last_payment_amount), lastPaymentDate: ymd(c?.last_payment_date),
    };
  });
}

/** Card balances, statements and minimums across every linked card; cash in bank accounts. Pure. */
export function personalTotals(connections: PersonalConnection[]): PersonalTotals {
  const all = connections.flatMap((c) => c.accounts);
  const cards = all.filter((a) => a.type === 'credit');
  const sum = (xs: (number | null)[]) => Math.round(xs.reduce<number>((t, x) => t + (x ?? 0), 0) * 100) / 100;
  return { cards: cards.length, cardBalance: sum(cards.map((a) => a.current)), statement: sum(cards.map((a) => a.statement)), minimum: sum(cards.map((a) => a.minimum)), cash: sum(all.filter((a) => a.type === 'depository').map((a) => a.current)) };
}

/** Which P/L sheet rows (Robinhood, Discover) a linked institution or account now replaces. Pure. */
export function sheetReplaced(connections: Pick<PersonalConnection, 'institution' | 'accounts' | 'error'>[]): string[] {
  return PERSONAL_CARD_NAMES.filter((k) => connections.some((c) => !c.error && c.accounts.length > 0 && [c.institution, ...c.accounts.map((a) => a.name)].some((n) => n.toLowerCase().includes(k))));
}

/** A Plaid failure as one line for Alex (the message never carries a token). */
function why(e: unknown, institution: string): string {
  const code = String((e as any)?.code ?? '');
  if (code === 'ITEM_LOGIN_REQUIRED') return `${institution || 'The bank'} needs you to log in again: remove it and connect it again.`;
  if (code === 'INVALID_API_KEYS') return 'Plaid refused the keys on the server (check PLAID_CLIENT_ID, PLAID_SECRET and PLAID_ENV).';
  return String((e as Error)?.message ?? e).replace(/\s+/g, ' ').slice(0, 200);
}

// ---------- storage ----------
interface ItemRow { id: number; item_id: string; institution: string; access_token_enc: string; created_at: Date }
async function itemRows(db: Db): Promise<ItemRow[]> {
  return (await db.query<ItemRow>('SELECT id, item_id, institution, access_token_enc, created_at FROM hq_plaid_items ORDER BY id')).rows;
}

export type PlaidCfg = Pick<Config, 'engineSecret' | 'plaidClientId' | 'plaidSecret' | 'plaidEnv' | 'plaidProducts'>;
export const plaidOn = (cfg: PlaidCfg) => Boolean(cfg.plaidClientId && cfg.plaidSecret);
export function plaidFor(cfg: PlaidCfg, f?: typeof fetch): PlaidClient | null {
  return plaidOn(cfg) ? createPlaidClient({ clientId: cfg.plaidClientId!, secret: cfg.plaidSecret!, env: cfg.plaidEnv, products: cfg.plaidProducts }, f) : null;
}

let cache: { at: number; data: Promise<PersonalView> } | null = null;
export function _resetPlaidCache() { cache = null; }

/** GET /finances/personal: every linked account, cached 1 hour (Refresh rereads, at most every 30 s). */
export function personalView(db: Db, cfg: PlaidCfg, plaid: PlaidClient | null, refresh = false): Promise<PersonalView> {
  if (!plaid) return Promise.resolve({ configured: false, message: NOT_CONNECTED, env: cfg.plaidEnv, connections: [], totals: null, replaces: [], readAt: new Date().toISOString() });
  if (cache && Date.now() - cache.at < (refresh ? PERSONAL_REFRESH_FLOOR_MS : PERSONAL_CACHE_MS)) return cache.data;
  const data = (async (): Promise<PersonalView> => {
    const rows = await itemRows(db);
    // One Item after another: a handful of logins at most, and Plaid rate-limits per Item anyway.
    const connections: PersonalConnection[] = [];
    for (const r of rows) {
      const base = { id: r.id, institution: r.institution, linkedAt: new Date(r.created_at).toISOString() };
      let token: string;
      try { token = openToken(cfg.engineSecret, r.item_id, r.access_token_enc); } catch {
        connections.push({ ...base, accounts: [], error: 'This saved login cannot be read on this server (ENGINE_SECRET changed?): remove it and connect it again.' });
        continue;
      }
      try {
        const [acc, li] = await Promise.all([plaid.accounts(token), plaid.liabilities(token)]);
        const institution = r.institution || text(acc.item?.institution_name);
        connections.push({ ...base, institution, accounts: parseAccounts(acc, li), error: null });
      } catch (e) { connections.push({ ...base, accounts: [], error: why(e, r.institution) }); }
    }
    return { configured: true, message: null, env: cfg.plaidEnv, connections, totals: personalTotals(connections), replaces: sheetReplaced(connections), readAt: new Date().toISOString() };
  })();
  cache = { at: Date.now(), data };
  // A failed read is not kept for an hour: the next view tries again.
  data.then((v) => { if (v.connections.some((c) => c.error) && cache?.data === data) cache = { at: Date.now() - PERSONAL_CACHE_MS + 5 * 60_000, data }; }, () => { if (cache?.data === data) cache = null; });
  return data;
}

/** An opaque Plaid user id for the owner (never the email or name). */
export const plaidUserId = (cfg: PlaidCfg, userId: number) => `hq-${createHash('sha256').update(`${cfg.engineSecret}:plaid-user:${userId}`).digest('hex').slice(0, 24)}`;

const PUBLIC_TOKEN = /^public-(?:sandbox|production|development)-[A-Za-z0-9-]{8,200}$/;

export interface RouteResult { status: number; body: unknown }
/**
 * The Personal (Plaid) routes, owner only (server.ts checks the role first). sub is the path after
 * /hq/api/finances/personal: "" (GET), "/link-token" (POST), "/connect" (POST), "/<id>/remove" (POST).
 */
export async function personalRoute(db: Db, cfg: PlaidCfg, plaid: PlaidClient | null, user: { id: number; name: string }, method: string, sub: string, body: any, refresh = false): Promise<RouteResult> {
  if (sub === '' && method === 'GET') return { status: 200, body: await personalView(db, cfg, plaid, refresh) };
  if (method !== 'POST') return { status: 405, body: { error: 'method not allowed' } };
  if (!plaid) return { status: 503, body: { error: NOT_CONNECTED } };
  if (sub === '/link-token') {
    const n = Number((await db.query('SELECT count(*)::int AS n FROM hq_plaid_items')).rows[0].n);
    if (n >= MAX_ITEMS) return { status: 400, body: { error: `At most ${MAX_ITEMS} connections: remove one first.` } };
    let t: { link_token: string; expiration: string };
    try { t = await plaid.linkToken(plaidUserId(cfg, user.id)); } catch (e) { return { status: 502, body: { error: `Plaid did not open: ${why(e, '')}` } }; }
    return { status: 200, body: { linkToken: t.link_token, expiration: t.expiration } };
  }
  if (sub === '/connect') {
    const publicToken = String(body?.publicToken ?? '');
    if (!PUBLIC_TOKEN.test(publicToken)) return { status: 400, body: { error: 'That Plaid answer was not understood. Try Connect again.' } };
    const institution = text(body?.institution);
    let x: { access_token: string; item_id: string };
    try { x = await plaid.exchange(publicToken); } catch (e) { return { status: 502, body: { error: `Not connected: ${why(e, institution)}` } }; }
    if (!x?.access_token || !x?.item_id) return { status: 502, body: { error: 'Plaid did not return a connection. Try Connect again.' } };
    const itemId = text(x.item_id, 200);
    const r = await db.query(`INSERT INTO hq_plaid_items (item_id, institution, access_token_enc, added_by) VALUES ($1,$2,$3,$4)
      ON CONFLICT (item_id) DO UPDATE SET access_token_enc = EXCLUDED.access_token_enc, institution = EXCLUDED.institution, updated_at = now() RETURNING id`,
      [itemId, institution, sealToken(cfg.engineSecret, itemId, x.access_token), text(user.name, 80)]);
    cache = null;
    return { status: 200, body: { ok: true, id: r.rows[0].id, institution } };
  }
  const m = /^\/(\d{1,9})\/remove$/.exec(sub);
  if (m) {
    const row = (await db.query<ItemRow>('SELECT id, item_id, institution, access_token_enc, created_at FROM hq_plaid_items WHERE id = $1', [Number(m[1])])).rows[0];
    if (!row) return { status: 404, body: { error: 'That connection is already gone.' } };
    let token: string | null = null;
    try { token = openToken(cfg.engineSecret, row.item_id, row.access_token_enc); } catch { token = null; }
    if (token) {
      // Remove at Plaid first (that ends the login and the billing); a connection Plaid no longer has is removed here too.
      try { await plaid.remove(token); } catch (e) { if (!plaidItemGone(e)) return { status: 502, body: { error: `Not removed: ${why(e, row.institution)}` } }; }
    }
    await db.query('DELETE FROM hq_plaid_items WHERE id = $1', [row.id]);
    cache = null;
    return { status: 200, body: { ok: true, ...(token ? {} : { note: 'Removed here. The saved login could not be read, so also remove it at Plaid (my.plaid.com) if it still shows there.' }) } };
  }
  return { status: 404, body: { error: 'not found' } };
}

// Plaid, read only, for Finances → Personal (Alex 2026-11-28): his own cards and bank accounts
// (Robinhood, Discover…) linked once through Plaid Link. Plain fetch on Plaid's REST API, no SDK.
// Only these calls exist here: create a Link token, exchange the public token, read accounts and
// balances, read credit card liabilities, remove an Item. Nothing here can move money or start a
// payment (Plaid's Transfer / Payment Initiation endpoints are never called).
// Access tokens are passed in and never put in an error message or a log line.
import { PermanentError, RetryableError } from '../errors.js';

export type PlaidEnv = 'sandbox' | 'production';
export interface PlaidCfg { clientId: string; secret: string; env: PlaidEnv; products?: string[] }

/** Plaid's error body: { error_type, error_code, error_message, display_message }. */
export class PlaidError extends PermanentError {
  constructor(public code: string, message: string) { super(message); }
}

export interface PlaidAccount {
  account_id: string; name?: string; official_name?: string | null; mask?: string | null; type?: string; subtype?: string | null;
  balances?: { current?: number | null; available?: number | null; limit?: number | null; iso_currency_code?: string | null; unofficial_currency_code?: string | null };
}
export interface PlaidCreditLiability {
  account_id: string | null; last_statement_balance?: number | null; minimum_payment_amount?: number | null; next_payment_due_date?: string | null;
  last_statement_issue_date?: string | null; is_overdue?: boolean | null; last_payment_amount?: number | null; last_payment_date?: string | null;
}
export interface PlaidAccountsResponse { accounts: PlaidAccount[]; item?: { item_id?: string; institution_id?: string | null; institution_name?: string | null } }
export interface PlaidLiabilitiesResponse { accounts?: PlaidAccount[]; liabilities?: { credit?: PlaidCreditLiability[] | null } }

/** Errors that mean "this Item has no such data", not "something broke". */
const NOT_SUPPORTED = new Set(['PRODUCTS_NOT_SUPPORTED', 'PRODUCT_NOT_ENABLED', 'NO_LIABILITY_ACCOUNTS', 'INVALID_PRODUCT', 'PRODUCT_NOT_READY', 'NO_ACCOUNTS']);
export const plaidNotSupported = (e: unknown) => e instanceof PlaidError && NOT_SUPPORTED.has(e.code);
/** The Item no longer exists at Plaid (already removed, or the token is no longer valid). */
export const plaidItemGone = (e: unknown) => e instanceof PlaidError && (e.code === 'ITEM_NOT_FOUND' || e.code === 'INVALID_ACCESS_TOKEN');

export const plaidBaseUrl = (env: PlaidEnv) => `https://${env === 'sandbox' ? 'sandbox' : 'production'}.plaid.com`;

export function createPlaidClient(cfg: PlaidCfg, f: typeof fetch = fetch) {
  const base = plaidBaseUrl(cfg.env);
  async function post<T>(path: string, body: Record<string, unknown>): Promise<T> {
    let res: Response;
    try {
      res = await f(`${base}${path}`, {
        method: 'POST', headers: { 'content-type': 'application/json', accept: 'application/json' },
        body: JSON.stringify({ client_id: cfg.clientId, secret: cfg.secret, ...body }), signal: AbortSignal.timeout(30_000),
      });
    } catch { throw new RetryableError(`Plaid ${path}: network error or timeout`); }
    const j: any = await res.json().catch(() => ({}));
    if (res.ok) return j as T;
    const code = String(j?.error_code ?? `HTTP_${res.status}`);
    // display_message is written for people; error_message for developers. Neither holds a token.
    const msg = String(j?.display_message || j?.error_message || `HTTP ${res.status}`).replace(/\s+/g, ' ').slice(0, 200);
    if (res.status === 429 || res.status >= 500) throw new RetryableError(`Plaid ${path}: ${msg}`);
    throw new PlaidError(code, `Plaid ${path}: ${msg} (${code})`);
  }
  const products = cfg.products?.length ? cfg.products : ['liabilities'];
  return {
    /** A short-lived Link token for the browser. clientUserId is an opaque id, never an email or name. */
    linkToken(clientUserId: string): Promise<{ link_token: string; expiration: string }> {
      return post('/link/token/create', {
        client_name: 'Dulcy HQ', language: 'en', country_codes: ['US'], user: { client_user_id: clientUserId },
        products,
        // Liabilities (statement, minimum, due date) where the card supports it, without hiding banks that do not.
        ...(products.includes('liabilities') ? {} : { required_if_supported_products: ['liabilities'] }),
      });
    },
    exchange(publicToken: string): Promise<{ access_token: string; item_id: string }> {
      return post('/item/public_token/exchange', { public_token: publicToken });
    },
    /** Live balances (/accounts/balance/get); if the Balance product is not enabled, the cached ones (/accounts/get). */
    async accounts(accessToken: string): Promise<PlaidAccountsResponse> {
      try { return await post<PlaidAccountsResponse>('/accounts/balance/get', { access_token: accessToken }); } catch (e) {
        if (!plaidNotSupported(e)) throw e;
        return post<PlaidAccountsResponse>('/accounts/get', { access_token: accessToken });
      }
    },
    /** Credit card statement, minimum and due date. null when the Item has no liability data. */
    async liabilities(accessToken: string): Promise<PlaidLiabilitiesResponse | null> {
      try { return await post<PlaidLiabilitiesResponse>('/liabilities/get', { access_token: accessToken }); } catch (e) {
        if (plaidNotSupported(e)) return null;
        throw e;
      }
    },
    async remove(accessToken: string): Promise<void> { await post('/item/remove', { access_token: accessToken }); },
  };
}
export type PlaidClient = ReturnType<typeof createPlaidClient>;

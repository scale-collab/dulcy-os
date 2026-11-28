// Cheap Inboxes (where Dulcy buys its domains and inboxes), READ ONLY (HQ round 3, Alex 2026-11-27):
// the real renewal date of each domain and the real monthly price of its inboxes, for HQ
// Deliverability → Domains. Optional: only when CHEAPINBOXES_API_KEY is set on the server.
//   - Base: https://api.cheapinboxes.com/v1 (the host the n8n "Instant Client Domain Purchasing v4"
//     workflow calls). Auth: the key in a header. The n8n credential is a generic "header auth" whose
//     header name is not in the export: UNKNOWN. Default `Authorization: Bearer <key>`;
//     CHEAPINBOXES_AUTH_HEADER (e.g. "X-API-Key") switches to that header with the bare key.
//   - Reads GET /domains and GET /mailboxes (paged). Their exact shapes are UNKNOWN from the repo, so
//     the parser accepts the common names (domain / name, expires_at / renewal_date / renews_at /
//     expiry_date, price fields in cents or dollars). Anything it cannot read is left out (HQ then
//     keeps the "estimated" date, labelled).
//   - Never calls a write endpoint (no /orders/*, no checkout). Bounded: at most MAX_PAGES pages
//     each, cached 6 hours for everyone.
export interface CheapInboxesConfig { apiKey: string; baseUrl: string; authHeader: string }
export interface CiDomain { domain: string; renewal: string; status: string; mailboxes: number; monthly: number | null }
export interface CiIndex { domains: Map<string, CiDomain>; mailboxPrice: number | null; readAt: string; error: string }

export const CI_MAX_PAGES = 40;
export const CI_CACHE_MS = 6 * 3_600_000;
export const CI_DEFAULT_BASE = 'https://api.cheapinboxes.com/v1';

/** The server config (null when no key: HQ keeps the estimate). */
export function cheapInboxesConfig(env: NodeJS.ProcessEnv = process.env): CheapInboxesConfig | null {
  const apiKey = String(env.CHEAPINBOXES_API_KEY ?? '').trim();
  if (!apiKey) return null;
  return { apiKey, baseUrl: String(env.CHEAPINBOXES_BASE_URL ?? CI_DEFAULT_BASE).replace(/\/+$/, ''), authHeader: String(env.CHEAPINBOXES_AUTH_HEADER ?? '').trim() };
}

const str = (x: unknown) => (x === undefined || x === null ? '' : String(x)).trim();
const firstOf = (o: any, keys: string[]) => { for (const k of keys) { const v = k.split('.').reduce((a, p) => (a == null ? a : a[p]), o); if (v !== undefined && v !== null && v !== '') return v; } return undefined; };
/** A date-ish value → YYYY-MM-DD ('' when unreadable). Pure. */
export function dayOf(x: unknown): string {
  const t = str(x);
  if (!t) return '';
  if (/^\d{4}-\d{2}-\d{2}/.test(t)) return t.slice(0, 10);
  const n = Number(t);
  const ms = Number.isFinite(n) && n > 0 ? (n < 1e12 ? n * 1000 : n) : Date.parse(t);
  return Number.isFinite(ms) ? new Date(ms).toISOString().slice(0, 10) : '';
}
/** A price → dollars: *_cents fields are cents, else dollars. Pure. */
function priceOf(o: any, centsKeys: string[], dollarKeys: string[]): number | null {
  const c = firstOf(o, centsKeys);
  if (c !== undefined && Number.isFinite(Number(c))) return Number(c) / 100;
  const d = firstOf(o, dollarKeys);
  if (d !== undefined && Number.isFinite(Number(String(d).replace(/[$,]/g, '')))) return Number(String(d).replace(/[$,]/g, ''));
  return null;
}
const listOf = (body: any): any[] => (Array.isArray(body) ? body : Array.isArray(body?.data) ? body.data : Array.isArray(body?.domains) ? body.domains : Array.isArray(body?.mailboxes) ? body.mailboxes : Array.isArray(body?.items) ? body.items : Array.isArray(body?.results) ? body.results : []);

/** The next yearly anniversary (YYYY-MM-DD) of an ISO date, on or after `now`. '' when unreadable. Pure. */
export function nextAnniversary(iso: string, now = new Date()): string {
  const t = Date.parse(iso); if (!iso || Number.isNaN(t)) return '';
  const d = new Date(t); const today = now.toISOString().slice(0, 10);
  for (let y = now.getUTCFullYear() - 1; y <= now.getUTCFullYear() + 1; y++) {
    const c = new Date(Date.UTC(y, d.getUTCMonth(), d.getUTCDate())).toISOString().slice(0, 10);
    if (c >= today && c > iso.slice(0, 10)) return c;
  }
  return '';
}
/** One domain object → CiDomain (null when it has no name). Pure. */
export function parseDomain(o: any): CiDomain | null {
  const domain = str(firstOf(o, ['domain', 'name', 'domain_name', 'fqdn'])).toLowerCase();
  if (!domain || !domain.includes('.')) return null;
  return {
    domain,
    renewal: dayOf(firstOf(o, ['renewal_date', 'renews_at', 'renewal_at', 'expires_at', 'expiry_date', 'expiration_date', 'expires_on', 'next_renewal_at', 'registration.expires_at']))
      // Cheap Inboxes' documented domain record has created_at (purchase) and auto_renew but no renewal
      // date: domains renew yearly, so the next renewal is the next anniversary of created_at.
      || nextAnniversary(str(firstOf(o, ['created_at', 'purchased_at', 'registered_at']))),
    status: str(firstOf(o, ['status', 'state'])).toLowerCase(),
    mailboxes: Number(firstOf(o, ['mailbox_count', 'mailboxes_count', 'mailboxes.length'])) || 0,
    monthly: priceOf(o, ['mailbox_monthly_cents', 'monthly_cost_cents', 'monthly_price_cents'], ['mailbox_monthly', 'monthly_cost', 'monthly_price']),
  };
}
/** One mailbox → its domain and monthly price. Pure. */
export function parseMailbox(o: any): { domain: string; monthly: number | null; status: string } | null {
  const email = str(firstOf(o, ['full_email', 'email', 'address'])).toLowerCase();
  const domain = str(firstOf(o, ['domain', 'domain_name', 'domain.name'])).toLowerCase() || email.split('@')[1] || '';
  if (!domain) return null;
  return { domain, status: str(firstOf(o, ['status', 'state'])).toLowerCase(), monthly: priceOf(o, ['price_cents', 'monthly_price_cents', 'monthly_cost_cents', 'price.monthly_cents'], ['price', 'monthly_price', 'monthly_cost']) };
}

/** Request headers for the key. */
const authHeaders = (c: CheapInboxesConfig): Record<string, string> => (c.authHeader ? { [c.authHeader]: c.apiKey } : { authorization: `Bearer ${c.apiKey}` });
async function getJson(c: CheapInboxesConfig, url: string, f: typeof fetch): Promise<any> {
  const res = await f(url, { method: 'GET', headers: { accept: 'application/json', ...authHeaders(c) }, signal: AbortSignal.timeout(20_000) });
  if (res.status === 401 || res.status === 403) throw new Error(`Cheap Inboxes refused the key (HTTP ${res.status})`);
  if (!res.ok) throw new Error(`Cheap Inboxes: HTTP ${res.status} on ${url.replace(c.baseUrl, '').split('?')[0]}`);
  return res.json().catch(() => null);
}
export const CI_PAGE = 100;
/** Read every page of a list endpoint (GET only), bounded. Cheap Inboxes pages with limit/offset and
 *  returns pagination.total (verified 2026-11-28: the first version read only the first 100 domains). */
async function pages(c: CheapInboxesConfig, path: string, f: typeof fetch): Promise<any[]> {
  const out: any[] = [];
  for (let page = 0; page < CI_MAX_PAGES; page++) {
    const offset = page * CI_PAGE;
    const body = await getJson(c, `${c.baseUrl}${path}?limit=${CI_PAGE}&offset=${offset}`, f);
    const rows = listOf(body);
    out.push(...rows);
    const total = Number(body?.pagination?.total ?? body?.meta?.total ?? body?.total ?? NaN);
    if (!rows.length || rows.length < CI_PAGE) break;
    if (Number.isFinite(total) && offset + rows.length >= total) break;
  }
  return out;
}
/** The per-mailbox monthly price (dollars) for `active` mailboxes, from the pricing tiers. Pure. */
export function tierPrice(body: any, active: number): number | null {
  const tiers: any[] = Array.isArray(body?.tiers) ? body.tiers : [];
  const t = tiers.find((x) => active >= Number(x?.minQty ?? 0) && (x?.maxQty === null || x?.maxQty === undefined || active <= Number(x.maxQty)));
  const cents = Number(t?.priceCents ?? body?.basePriceCents);
  return Number.isFinite(cents) && cents > 0 ? cents / 100 : null;
}

/** Domains + mailboxes → one index by domain. Never throws: the error is in `error`. */
export async function readCheapInboxes(c: CheapInboxesConfig, f: typeof fetch = fetch): Promise<CiIndex> {
  const domains = new Map<string, CiDomain>();
  try {
    const [ds, ms] = await Promise.all([pages(c, '/domains', f), pages(c, '/mailboxes', f).catch(() => [] as any[])]);
    for (const o of ds) { const d = parseDomain(o); if (d) domains.set(d.domain, d); }
    const prices: number[] = [];
    const per = new Map<string, { n: number; sum: number; priced: number }>();
    for (const o of ms) {
      const m = parseMailbox(o);
      if (!m || /cancel/.test(m.status)) continue;
      const x = per.get(m.domain) ?? { n: 0, sum: 0, priced: 0 };
      x.n++; if (m.monthly !== null) { x.sum += m.monthly; x.priced++; prices.push(m.monthly); }
      per.set(m.domain, x);
    }
    for (const [domain, x] of per) {
      const d = domains.get(domain) ?? { domain, renewal: '', status: '', mailboxes: 0, monthly: null };
      if (!d.mailboxes) d.mailboxes = x.n;
      if (x.priced) d.monthly = Math.round((x.sum / x.priced) * 100) / 100;
      domains.set(domain, d);
    }
    const mailboxPrice = prices.length ? Math.round((prices.reduce((a, b) => a + b, 0) / prices.length) * 100) / 100 : null;
    return { domains, mailboxPrice, readAt: new Date().toISOString(), error: '' };
  } catch (e) {
    return { domains, mailboxPrice: null, readAt: new Date().toISOString(), error: String((e as Error).message ?? e).slice(0, 200) };
  }
}

let cache: { at: number; key: string; data: Promise<CiIndex> } | null = null;
export function _resetCheapInboxesCache() { cache = null; }
/** The cached index (6 hours, one copy for everyone); null when no key is set. */
export function cachedCheapInboxes(c: CheapInboxesConfig | null, f: typeof fetch = fetch, refresh = false, now = Date.now()): Promise<CiIndex> | null {
  if (!c) return null;
  if (cache && cache.key === c.baseUrl && now - cache.at < (refresh ? 60_000 : CI_CACHE_MS)) return cache.data;
  const data = readCheapInboxes(c, f);
  cache = { at: now, key: c.baseUrl, data };
  return data;
}

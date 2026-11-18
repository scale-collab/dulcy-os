// DiscoLike client: free company count and the paid company search (same calls the old
// n8n lead-list workflows made). Key in the x-discolike-key header, server .env only.
import { PermanentError, RetryableError } from '../errors.js';
import { toQuery, type Filters } from '../leadlist/filters.js';

export interface DiscoLikeOptions { apiKey?: string; baseUrl: string; timeoutMs?: number; fetchImpl?: typeof fetch }

export function createDiscoLikeClient(o: DiscoLikeOptions) {
  const f = o.fetchImpl ?? fetch;
  const base = o.baseUrl.replace(/\/+$/, '');
  const timeoutMs = o.timeoutMs ?? 120_000;

  async function get(path: string, paid: boolean): Promise<{ status: number; body: any }> {
    if (!o.apiKey) throw new PermanentError('no DiscoLike API key on the server (DISCOLIKE_API_KEY)');
    let res: Response;
    try {
      res = await f(`${base}${path}`, { headers: { 'x-discolike-key': o.apiKey, accept: 'application/json' }, signal: AbortSignal.timeout(timeoutMs) });
    } catch {
      // A paid search that timed out may still have been charged: outcome unknown.
      if (paid) throw new Error('DiscoLike: network error or timeout; outcome unknown');
      throw new RetryableError('DiscoLike: network error or timeout');
    }
    const text = await res.text();
    if (res.status === 429) throw new RetryableError('DiscoLike: rate limited (HTTP 429)');
    if (res.status >= 500) {
      if (paid) throw new Error(`DiscoLike: HTTP ${res.status}; outcome unknown`);
      throw new RetryableError(`DiscoLike: HTTP ${res.status}`);
    }
    if (res.status === 401 || res.status === 403) throw new PermanentError(`DiscoLike refused the key (HTTP ${res.status})`);
    if (res.status === 204) return { status: 204, body: null };
    if (!res.ok) throw new PermanentError(`DiscoLike refused the request: HTTP ${res.status} ${text.replace(/\s+/g, ' ').slice(0, 300)}`);
    try { return { status: res.status, body: text ? JSON.parse(text) : null }; } catch {
      if (paid) throw new Error('DiscoLike: answer was not JSON; outcome unknown');
      throw new RetryableError('DiscoLike: answer was not JSON');
    }
  }

  return {
    /** Free: how many companies match these filters. */
    async count(filters: Filters): Promise<number> {
      const r = await get(`/v1/count?${toQuery(filters)}`, false);
      const n = Number(r.body?.count);
      if (!Number.isSafeInteger(n) || n < 0) throw new RetryableError('DiscoLike did not return a valid count (this is not a zero result)');
      return n;
    },
    /** Paid: up to maxRecords companies for these filters. Returns the raw rows. */
    async discover(filters: Filters, maxRecords: number): Promise<any[]> {
      const r = await get(`/v1/discover?${toQuery({ ...filters, max_records: maxRecords, offset: 0 })}`, true);
      if (r.status === 204 || r.body === null) return [];
      const b = r.body;
      const rows = Array.isArray(b) ? b : Array.isArray(b?.data) ? b.data : Array.isArray(b?.results) ? b.results : null;
      if (!rows) throw new PermanentError('DiscoLike: unexpected answer format; no result count confirmed');
      return rows;
    },
  };
}

export type DiscoLikeClient = ReturnType<typeof createDiscoLikeClient>;

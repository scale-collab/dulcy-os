// DiscoLike client: free company count and the paid company search (same calls the old
// n8n lead-list workflows made). Key in the x-discolike-key header, server .env only.
import { PermanentError, RetryableError } from '../errors.js';
import { countFilters, toQuery, type Filters } from '../leadlist/filters.js';

export interface DiscoLikeOptions { apiKey?: string; baseUrl: string; timeoutMs?: number; fetchImpl?: typeof fetch }

export function createDiscoLikeClient(o: DiscoLikeOptions) {
  const f = o.fetchImpl ?? fetch;
  const base = o.baseUrl.replace(/\/+$/, '');
  const timeoutMs = o.timeoutMs ?? 120_000;

  async function get(path: string, paid: boolean, post?: unknown): Promise<{ status: number; body: any }> {
    if (!o.apiKey) throw new PermanentError('no DiscoLike API key on the server (DISCOLIKE_API_KEY)');
    let res: Response;
    try {
      const headers: Record<string, string> = { 'x-discolike-key': o.apiKey, accept: 'application/json' };
      if (post !== undefined) headers['content-type'] = 'application/json';
      res = await f(`${base}${path}`, { method: post === undefined ? 'GET' : 'POST', headers, body: post === undefined ? undefined : JSON.stringify(post), signal: AbortSignal.timeout(timeoutMs) });
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
    /** Save a list of domains to exclude from later searches; returns its query ID (old workflow call). */
    async exclusionList(name: string, domains: string[], tags: string[]): Promise<string> {
      const r = await get('/v1/queries/exclusion-list', false, { query_name: name, domains, tags });
      const id = String(r.body?.query_id ?? r.body?.id ?? r.body?.data?.query_id ?? r.body?.data?.id ?? '').trim();
      if (!id) throw new RetryableError('DiscoLike did not return an exclusion query ID');
      return id;
    },
    /** Paid: people at these companies (one call per batch of domains). Returns the raw answer. */
    async discoverContacts(body: Record<string, unknown>): Promise<any> {
      const r = await get('/v1/contacts/discover', true, body);
      return r.body ?? {};
    },
    /** Paid: ContraGen (old "Generate ContraGen Contacts"): web-research decision makers at these
     *  domains. Async: returns the task ID to poll with discoGenStatus. */
    async contraGenSubmit(body: Record<string, unknown>): Promise<string> {
      const r = await get('/v1/contacts/discover/generate', true, body);
      const id = String(r.body?.task_id ?? r.body?.data?.task_id ?? '').trim();
      if (!id) throw new Error('ContraGen did not return a task ID; outcome unknown (a task may still be running)');
      return id;
    },
    /** Free: status (and, when completed, results) of a DiscoGen / ContraGen task. */
    async discoGenStatus(taskId: string): Promise<any> {
      const r = await get(`/v1/discogen/status/${encodeURIComponent(taskId)}`, false);
      return r.body ?? {};
    },
    /** Free: about how many companies match (count-compatible filters only; null = not countable). */
    async count(filters: Filters): Promise<{ count: number; ignored: string[] } | null> {
      const c = countFilters(filters);
      if (!c) return null;
      const r = await get(`/v1/count?${toQuery(c.params)}`, false);
      const n = Number(r.body?.count);
      if (!Number.isSafeInteger(n) || n < 0) throw new RetryableError('DiscoLike did not return a valid count (this is not a zero result)');
      return { count: n, ignored: c.ignored };
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

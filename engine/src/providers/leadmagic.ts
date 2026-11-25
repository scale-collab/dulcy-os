// LeadMagic client: native bulk email finder (the old n8n "Saved Recovery" path).
// POST /bulk/submit {product:'email_finder', idempotencyKey, rows:[{first_name,last_name,domain}]}
// GET  /bulk/jobs/<id>                       status + counters
// GET  /bulk/jobs/<id>/results?limit=200&offset=n
// POST /email-finder {first_name,last_name,domain}  one person (the old n8n path; 300/min limit)
// Key in the X-API-Key header, server .env only (LEADMAGIC_API_KEY).
import { NeedsReviewError, PermanentError, RetryableError } from '../errors.js';

export interface LeadMagicOptions { apiKey?: string; baseUrl: string; timeoutMs?: number; fetchImpl?: typeof fetch }
export interface FinderRow { first_name: string; last_name: string; domain: string }

export function createLeadMagicClient(o: LeadMagicOptions) {
  const f = o.fetchImpl ?? fetch;
  const base = o.baseUrl.replace(/\/+$/, '');
  const timeoutMs = o.timeoutMs ?? 120_000;

  async function call(path: string, paid: boolean, body?: unknown): Promise<any> {
    if (!o.apiKey) throw new PermanentError('no LeadMagic API key on the server (LEADMAGIC_API_KEY)');
    let res: Response;
    try {
      const headers: Record<string, string> = { 'X-API-Key': o.apiKey, accept: 'application/json' };
      if (body !== undefined) headers['content-type'] = 'application/json';
      res = await f(`${base}${path}`, { method: body === undefined ? 'GET' : 'POST', headers, body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(timeoutMs) });
    } catch {
      if (paid) throw new Error('LeadMagic: network error or timeout; outcome unknown');
      throw new RetryableError('LeadMagic: network error or timeout');
    }
    const text = await res.text();
    if (res.status === 401 || res.status === 403) throw new PermanentError(`LeadMagic refused the key (HTTP ${res.status})`);
    if (res.status === 402) throw new NeedsReviewError('LeadMagic: not enough credits (HTTP 402); nothing was charged for this submit');
    if (res.status === 429) {
      if (paid) throw new Error('LeadMagic: rate limited on a paid submit; outcome unknown');
      throw new RetryableError('LeadMagic: rate limited (HTTP 429)');
    }
    if (res.status >= 500) {
      if (paid) throw new Error(`LeadMagic: HTTP ${res.status}; outcome unknown`);
      throw new RetryableError(`LeadMagic: HTTP ${res.status}`);
    }
    if (!res.ok) throw new PermanentError(`LeadMagic refused the request: HTTP ${res.status} ${text.replace(/\s+/g, ' ').slice(0, 300)}`);
    try { return text ? JSON.parse(text) : {}; } catch {
      if (paid) throw new Error('LeadMagic: answer was not JSON; outcome unknown');
      throw new RetryableError('LeadMagic: answer was not JSON');
    }
  }

  return {
    configured: !!o.apiKey,
    /** Paid: one bulk email-finder job. Returns the job ID. */
    async submitFinder(rows: FinderRow[], idempotencyKey: string): Promise<string> {
      const b = await call('/bulk/submit', true, { product: 'email_finder', idempotencyKey, rows });
      const id = String(b?.jobId ?? b?.job_id ?? b?.id ?? b?.data?.jobId ?? '').trim();
      if (!id) throw new Error('LeadMagic did not return a job ID; outcome unknown (a job may still be running)');
      return id;
    },
    /** Paid: one person. Returns LeadMagic's answer as-is (email, email_status / status). */
    async findOne(row: FinderRow): Promise<any> {
      return call('/email-finder', true, row);
    },
    /** Free: job status and counters. */
    async job(id: string): Promise<{ status: string; total: number; processed: number }> {
      const b = await call(`/bulk/jobs/${encodeURIComponent(id)}`, false);
      return { status: String(b?.status ?? '').toLowerCase(), total: Number(b?.total_rows ?? b?.totalRows ?? 0), processed: Number(b?.processed_items ?? b?.processedItems ?? 0) };
    },
    /** Free: one page (200) of results. */
    async results(id: string, offset: number): Promise<any[]> {
      const b = await call(`/bulk/jobs/${encodeURIComponent(id)}/results?limit=200&offset=${offset}`, false);
      const rows = Array.isArray(b?.rows) ? b.rows : Array.isArray(b?.data) ? b.data : Array.isArray(b?.results) ? b.results : null;
      if (!rows) throw new NeedsReviewError('LeadMagic: unexpected results format');
      return rows;
    },
  };
}
export type LeadMagicClient = ReturnType<typeof createLeadMagicClient>;

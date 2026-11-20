// Airtable client for the engine's own token (AIRTABLE_API_KEY, server .env only; scoped to
// the Dulcy base: records read/write, schema read). Field IDs in and out
// (returnFieldsByFieldId), so renaming a field in Airtable never breaks the engine.
// Every read names its fields: the engine never pulls a whole record, so key fields in
// other tables (EmailBison API, passwords) are never read.
import { PermanentError, RetryableError } from '../errors.js';

export interface AirtableOptions { apiKey?: string; baseId: string; baseUrl?: string; timeoutMs?: number; fetchImpl?: typeof fetch }
export interface AirtableRecord { id: string; fields: Record<string, unknown> }

export function createAirtableClient(o: AirtableOptions) {
  const f = o.fetchImpl ?? fetch;
  const base = `${(o.baseUrl ?? 'https://api.airtable.com').replace(/\/+$/, '')}/v0/${o.baseId}`;
  const timeoutMs = o.timeoutMs ?? 30_000;

  async function call(method: string, path: string, body?: unknown): Promise<any> {
    if (!o.apiKey) throw new PermanentError('no Airtable token on the server (AIRTABLE_API_KEY)');
    let res: Response;
    try {
      res = await f(`${base}${path}`, {
        method,
        headers: { authorization: `Bearer ${o.apiKey}`, ...(body === undefined ? {} : { 'content-type': 'application/json' }) },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch { throw new RetryableError('Airtable: network error or timeout'); }
    const text = await res.text();
    if (res.status === 429 || res.status >= 500) throw new RetryableError(`Airtable: HTTP ${res.status}`);
    if (res.status === 401 || res.status === 403) throw new PermanentError(`Airtable refused the token (HTTP ${res.status})`);
    if (!res.ok) throw new PermanentError(`Airtable refused the request: HTTP ${res.status} ${text.replace(/\s+/g, ' ').slice(0, 300)}`);
    try { return text ? JSON.parse(text) : {}; } catch { throw new RetryableError('Airtable: answer was not JSON'); }
  }

  return {
    /** Records matching a formula, only the named fields (all pages). */
    async list(tableId: string, formula: string, fieldIds: string[], maxRecords = 100): Promise<AirtableRecord[]> {
      const out: AirtableRecord[] = [];
      let offset: string | undefined;
      do {
        const q = new URLSearchParams({ filterByFormula: formula, returnFieldsByFieldId: 'true', pageSize: '100', maxRecords: String(maxRecords) });
        for (const id of fieldIds) q.append('fields[]', id);
        if (offset) q.set('offset', offset);
        const r = await call('GET', `/${tableId}?${q}`);
        out.push(...(r.records ?? []).map((x: any) => ({ id: String(x.id), fields: x.fields ?? {} })));
        offset = r.offset;
      } while (offset && out.length < maxRecords);
      return out;
    },
    /** One record, only the named fields (a list call by RECORD_ID, so no other field is read). */
    async get(tableId: string, recordId: string, fieldIds: string[]): Promise<AirtableRecord | null> {
      if (!/^rec[A-Za-z0-9]{14}$/.test(recordId)) return null;
      return (await this.list(tableId, `RECORD_ID()='${recordId}'`, fieldIds, 1))[0] ?? null;
    },
    /** Update fields by ID. Select options are given by name (typecast). */
    async update(tableId: string, recordId: string, fields: Record<string, unknown>): Promise<void> {
      await call('PATCH', `/${tableId}`, { records: [{ id: recordId, fields }], typecast: true });
    },
  };
}

export type AirtableClient = ReturnType<typeof createAirtableClient>;

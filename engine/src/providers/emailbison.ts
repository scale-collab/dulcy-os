// EmailBison client: the same endpoints the old n8n builder and top-up used (proven calls).
// Error rules:
//  - Writes (create, upload, attach): a clear "not accepted" (4xx) is a PermanentError with
//    EmailBison's own message kept (the old builder lost it, e.g. "422 [line 24]").
//    A timeout, network drop or 5xx is a plain Error: the outcome is unknown, so the
//    receipt stays 'pending' and the stage reconciles before trying again.
//  - Reads: timeouts, 429 and 5xx are retryable.
// Emails inside EmailBison messages are masked before they reach logs or Airtable.
import { PermanentError, RetryableError } from '../errors.js';

export interface BisonOptions { apiKey?: string; baseUrl: string; timeoutMs?: number; fetchImpl?: typeof fetch }

export interface BisonCampaign { id: number; name: string; status?: string; created_at?: string }
export interface BisonStep { id: number; order: number; email_subject?: string; variant?: boolean; variant_from_step_id?: number | null }
export interface BisonLeadList { id: number; name?: string; status?: string; leads_processed?: number; leads_succeeded?: number; leads_failed?: number; error_messages?: unknown }
export interface BisonSender { id: string; status: string; email?: string }

const maskEmails = (s: string) => s.replace(/([A-Za-z0-9._%+-])[A-Za-z0-9._%+-]*@([A-Za-z0-9.-]+\.[A-Za-z]{2,})/g, '$1***@$2');
const short = (s: string) => maskEmails(s.replace(/\s+/g, ' ')).slice(0, 300);

export function createBisonClient(o: BisonOptions) {
  const f = o.fetchImpl ?? fetch;
  const timeoutMs = o.timeoutMs ?? 60_000;
  const base = o.baseUrl.replace(/\/+$/, '');
  const auth = () => {
    if (!o.apiKey) throw new PermanentError('no EmailBison API key on the server for this workspace');
    return { authorization: `Bearer ${o.apiKey}`, accept: 'application/json' };
  };

  async function call(method: string, path: string, body?: unknown, opts: { write: boolean; form?: FormData; timeoutMs?: number } = { write: false }) {
    const headers: Record<string, string> = auth();
    let payload: BodyInit | undefined;
    if (opts.form) payload = opts.form;
    else if (body !== undefined) { headers['content-type'] = 'application/json'; payload = JSON.stringify(body); }
    let res: Response;
    try {
      res = await f(`${base}${path}`, { method, headers, body: payload, signal: AbortSignal.timeout(opts.timeoutMs ?? timeoutMs) });
    } catch (e) {
      if (e instanceof PermanentError) throw e;
      if (opts.write) throw new Error(`EmailBison ${method} ${path}: network error or timeout; outcome unknown`);
      throw new RetryableError(`EmailBison ${method} ${path}: network error or timeout`);
    }
    const text = await res.text();
    if (res.status === 429) throw new RetryableError(`EmailBison ${method} ${path}: rate limited (HTTP 429)`);
    if (res.status >= 500) {
      if (opts.write) throw new Error(`EmailBison ${method} ${path}: HTTP ${res.status}; outcome unknown`);
      throw new RetryableError(`EmailBison ${method} ${path}: HTTP ${res.status}`);
    }
    if (!res.ok) throw new PermanentError(`EmailBison ${method} ${path} refused: HTTP ${res.status} ${short(text)}`);
    try { return text ? JSON.parse(text) : {}; } catch {
      if (opts.write) throw new Error(`EmailBison ${method} ${path}: answer was not JSON; outcome unknown`);
      throw new RetryableError(`EmailBison ${method} ${path}: answer was not JSON`);
    }
  }
  const unwrapList = (r: any): any[] => (Array.isArray(r?.data) ? r.data : Array.isArray(r) ? r : []);

  async function pages<T>(path: string, maxPages = 200): Promise<T[]> {
    const out: T[] = [];
    for (let page = 1; page <= maxPages; page++) {
      const sep = path.includes('?') ? '&' : '?';
      const r = await call('GET', `${path}${sep}page=${page}`);
      out.push(...unwrapList(r));
      const last = Number(r?.meta?.last_page ?? 0);
      if (!(last > page || r?.links?.next)) return out;
    }
    throw new PermanentError(`EmailBison ${path}: more than ${maxPages} pages`);
  }

  return {
    async findCampaignsByName(name: string): Promise<BisonCampaign[]> {
      const all = await pages<BisonCampaign>('/api/campaigns');
      return all.filter((c) => String(c.name).trim() === name.trim()).map((c) => ({ ...c, id: Number(c.id) }));
    },
    async createCampaign(name: string, type: string): Promise<BisonCampaign> {
      const r = await call('POST', '/api/campaigns', { name, type }, { write: true });
      const id = Number(r?.data?.id ?? r?.id);
      if (!Number.isSafeInteger(id) || id < 1) throw new Error('EmailBison create campaign: no id in the answer; outcome unknown');
      return { id, name };
    },
    setSchedule: (id: number, schedule: Record<string, unknown>) => call('POST', `/api/campaigns/${id}/schedule`, schedule, { write: true }),
    updateSettings: (id: number, settings: Record<string, unknown>) => call('PATCH', `/api/campaigns/${id}/update`, settings, { write: true }),
    async getSteps(id: number): Promise<BisonStep[]> {
      const r = await call('GET', `/api/campaigns/v1.1/${id}/sequence-steps`);
      const list = Array.isArray(r?.data?.sequence_steps) ? r.data.sequence_steps : unwrapList(r);
      return list.map((s: any) => ({ ...s, id: Number(s.id), order: Number(s.order), variant: s.variant === true || s.variant === 1, variant_from_step_id: s.variant_from_step_id == null ? null : Number(s.variant_from_step_id) }));
    },
    addSteps: (id: number, payload: Record<string, unknown>) => call('POST', `/api/campaigns/v1.1/${id}/sequence-steps`, payload, { write: true }),
    async customVariables(): Promise<Set<string>> {
      const list = await pages<any>('/api/custom-variables', 1000);
      return new Set(list.map((v) => String(v?.name ?? v).trim().toLowerCase()));
    },
    createCustomVariable: (name: string) => call('POST', '/api/custom-variables', { name }, { write: true }),
    async uploadLeadsCsv(name: string, columnsToMap: Record<string, string>, csv: string): Promise<BisonLeadList> {
      const form = new FormData();
      form.append('name', name);
      for (const [dest, src] of Object.entries(columnsToMap)) form.append(`columnsToMap[${dest}]`, src);
      form.append('csv', new Blob([csv], { type: 'text/csv' }), `${name.replace(/[^A-Za-z0-9 _-]/g, '')}.csv`);
      const r = await call('POST', '/api/leads/bulk/csv', undefined, { write: true, form, timeoutMs: 120_000 });
      const id = Number(r?.data?.id ?? r?.data?.lead_list_id ?? r?.id ?? r?.lead_list_id);
      if (!Number.isSafeInteger(id) || id < 1) throw new Error('EmailBison CSV upload: no lead list id in the answer; outcome unknown');
      return { id, name };
    },
    async findLeadListsByName(name: string): Promise<BisonLeadList[]> {
      const all = await pages<BisonLeadList>('/api/lead-lists');
      return all.filter((l) => String(l.name).trim() === name.trim()).map((l) => ({ ...l, id: Number(l.id) }));
    },
    async getLeadList(id: number): Promise<BisonLeadList> {
      const r = await call('GET', `/api/lead-lists/${id}`);
      return (r?.data ?? r) as BisonLeadList;
    },
    attachLeadList: (campaignId: number, leadListId: number) =>
      call('POST', `/api/campaigns/${campaignId}/leads/attach-lead-list`, { lead_list_id: leadListId }, { write: true }),
    async campaignLeadTotal(campaignId: number): Promise<number> {
      const r = await call('GET', `/api/campaigns/${campaignId}/leads?page=1`);
      const total = Number(r?.meta?.total);
      if (!Number.isSafeInteger(total) || total < 0) throw new RetryableError('EmailBison campaign leads: no total in the answer');
      return total;
    },
    /** Every sender inbox in the workspace (id, email, status). */
    async workspaceSenders(): Promise<BisonSender[]> {
      const rows = await pages<any>('/api/sender-emails', 200);
      return rows.map((x) => {
        const email = x.email ?? x.email_address ?? x.from_email_address;
        return { id: String(x.id), status: String(x.status ?? '').toLowerCase(), email: email ? String(email).trim().toLowerCase() : undefined };
      });
    },
    attachSenders: (campaignId: number, senderIds: string[]) =>
      call('POST', `/api/campaigns/${campaignId}/attach-sender-emails`, { sender_email_ids: senderIds.map(String) }, { write: true }),
    async campaignSenders(campaignId: number): Promise<BisonSender[]> {
      const rows = await pages<any>(`/api/campaigns/${campaignId}/sender-emails`, 100);
      return rows.map((x) => ({ id: String(x.id), status: String(x.status ?? '').toLowerCase(), email: x.email ? String(x.email) : undefined }));
    },
  };
}

export type BisonClient = ReturnType<typeof createBisonClient>;

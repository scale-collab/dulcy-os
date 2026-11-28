// Close CRM for HQ Sales (Batch 4a, Alex 2026-11-27). API https://api.close.com/api/v1/,
// HTTP Basic with the API key as the username and an empty password (CLOSE_API_KEY, server .env only;
// the key never goes to the browser). Reads are GETs. Every list is bounded (pages and limits), so a
// slow or big account never runs away.
// Round 3 (Alex 2026-11-27, "Cole keeps Close current"): ONE write exists, updateOpportunity: an
// opportunity's confidence (%), value and value period, on Dulcy's own Close. Nothing else is ever
// written (no lead, contact, email, SMS, task or status change); the caller gates it (cole.close_update).
// hooks connect (2026-11-28): closeWebhooks() lists the account's webhook subscriptions and creates / deletes
// the engine's OWN one (its URL is the engine's /hooks/close); it never touches another subscription.
import { PermanentError, RetryableError } from '../errors.js';

export const CLOSE_API = 'https://api.close.com/api/v1';

export interface CloseOpportunity {
  id: string; leadId: string; leadName: string; status: string; statusType: 'active' | 'won' | 'lost' | string;
  value: number | null; valuePeriod: string; confidence: number | null; created: string; updated: string; won: string;
  note: string; contactName: string; userName: string; statusId: string; pipelineId: string;
}
export interface CloseActivity {
  id: string; type: string; at: string; direction: 'incoming' | 'outgoing' | ''; subject: string; text: string;
  status: string; disposition: string; durationSec: number | null; userName: string;
}
export interface ClosePipeline { id: string; name: string; statuses: { id: string; label: string; type: string }[] }
export interface CloseStatusChange { id: string; oppId: string; leadId: string; at: string; oldStatus: string; newStatus: string; oldType: string; newType: string; oldStatusId: string; newStatusId: string }
export interface CloseLeadLite { id: string; name: string; emails: string[] }
/** One lead with what a contract needs (Round 5, "Pull from Close"): company, contacts, addresses, opportunities. Read only. */
export interface CloseLeadDetail {
  id: string; name: string; url: string;
  contacts: { name: string; title: string; emails: string[]; phones: string[] }[];
  addresses: { address1: string; address2: string; city: string; state: string; zip: string; country: string }[];
  /** Lead custom fields by their Close name (text values only). */
  custom: Record<string, string>;
  opportunities: CloseOpportunity[];
}
export type ValuePeriod = 'one_time' | 'monthly' | 'annual';
/** The only fields HQ may change in Close. value is in dollars (sent as cents). */
export interface OpportunityPatch { confidence?: number; value?: number; valuePeriod?: ValuePeriod }
export interface CloseClient {
  opportunities(opts?: { maxPages?: number }): Promise<CloseOpportunity[]>;
  activities(leadId: string, limit?: number): Promise<CloseActivity[]>;
  /** Opportunities created between two ISO times (bounded: maxPages x 100). truncated = more exist. */
  opportunitiesCreated(fromIso: string, toIso: string, maxPages?: number): Promise<{ opps: CloseOpportunity[]; truncated: boolean }>;
  /** Won opportunities updated since an ISO time, newest first (bounded: maxPages x 100, at most 5). truncated = more exist. */
  wonOpportunities(sinceIso: string, maxPages?: number): Promise<{ opps: CloseOpportunity[]; truncated: boolean }>;
  /** Pipelines with their statuses in Close's own order. */
  pipelines(): Promise<ClosePipeline[]>;
  /** Opportunity status changes since an ISO time (bounded). */
  statusChanges(sinceIso: string, maxPages?: number): Promise<{ changes: CloseStatusChange[]; truncated: boolean }>;
  /** Leads whose contacts have exactly this email (search, then checked). */
  leadsByEmail(email: string): Promise<CloseLeadLite[]>;
  /** One lead's opportunities. */
  leadOpportunities(leadId: string): Promise<CloseOpportunity[]>;
  /** One lead with its contacts, addresses, custom fields and opportunities (read only; null when not found). */
  leadDetail(leadId: string): Promise<CloseLeadDetail | null>;
  /** WRITE (the only one): confidence / value / value period of one opportunity. Returns the opportunity after the change. */
  updateOpportunity(oppId: string, patch: OpportunityPatch): Promise<CloseOpportunity>;
}

const str = (v: unknown) => (v === undefined || v === null ? '' : String(v)).trim();
const num = (v: unknown) => { const x = Number(v); return v !== null && v !== undefined && v !== '' && Number.isFinite(x) ? x : null; };
const leadOk = (id: string) => /^lead_[A-Za-z0-9]+$/.test(id);

export function toOpportunity(o: any): CloseOpportunity {
  return {
    id: str(o?.id), leadId: str(o?.lead_id), leadName: str(o?.lead_name), status: str(o?.status_label ?? o?.status_display_name), statusType: str(o?.status_type),
    // Close keeps opportunity values in cents.
    value: num(o?.value) === null ? null : (num(o?.value) as number) / 100, valuePeriod: str(o?.value_period), confidence: num(o?.confidence),
    created: str(o?.date_created), updated: str(o?.date_updated), won: str(o?.date_won), note: str(o?.note).slice(0, 500),
    contactName: str(o?.contact_name), userName: str(o?.user_name), statusId: str(o?.status_id), pipelineId: str(o?.pipeline_id),
  };
}
export function toStatusChange(a: any): CloseStatusChange {
  return {
    id: str(a?.id), oppId: str(a?.opportunity_id), leadId: str(a?.lead_id), at: str(a?.date_created || a?.activity_at),
    oldStatus: str(a?.old_status_label), newStatus: str(a?.new_status_label), oldType: str(a?.old_status_type), newType: str(a?.new_status_type),
    oldStatusId: str(a?.old_status_id), newStatusId: str(a?.new_status_id),
  };
}
const oppOk = (id: string) => /^oppo_[A-Za-z0-9]+$/.test(id);
const PERIODS: ValuePeriod[] = ['one_time', 'monthly', 'annual'];
/** The Close body for a patch: only confidence (0-100 integer), value (cents) and value_period. Pure; throws on anything else. */
export function opportunityBody(patch: OpportunityPatch): Record<string, number | string> {
  const out: Record<string, number | string> = {};
  for (const k of Object.keys(patch)) if (!['confidence', 'value', 'valuePeriod'].includes(k)) throw new PermanentError(`Close: HQ may not change ${k}`);
  if (patch.confidence !== undefined) {
    if (!Number.isInteger(patch.confidence) || patch.confidence < 0 || patch.confidence > 100) throw new PermanentError('Close: confidence must be 0-100');
    out.confidence = patch.confidence;
  }
  if (patch.value !== undefined) {
    if (!Number.isFinite(patch.value) || patch.value < 0 || patch.value > 1_000_000) throw new PermanentError('Close: value out of range');
    out.value = Math.round(patch.value * 100);
  }
  if (patch.valuePeriod !== undefined) {
    if (!PERIODS.includes(patch.valuePeriod)) throw new PermanentError('Close: value period must be one_time, monthly or annual');
    out.value_period = patch.valuePeriod;
  }
  if (!Object.keys(out).length) throw new PermanentError('Close: nothing to change');
  return out;
}
/** A Close lead (GET lead/<id>/) to the fields a contract draft can use. Pure. */
export function toLeadDetail(l: any): CloseLeadDetail {
  const arr = (v: unknown): any[] => (Array.isArray(v) ? v : []);
  const custom: Record<string, string> = {};
  if (l?.custom && typeof l.custom === 'object' && !Array.isArray(l.custom)) {
    for (const [k, v] of Object.entries(l.custom)) if (typeof v === 'string' || typeof v === 'number') custom[str(k).slice(0, 80)] = str(v).slice(0, 300);
  }
  const id = str(l?.id);
  return {
    id, name: str(l?.display_name || l?.name).slice(0, 200), url: leadOk(id) ? `https://app.close.com/lead/${id}/` : '',
    contacts: arr(l?.contacts).slice(0, 20).map((c) => ({
      name: str(c?.name || c?.display_name).slice(0, 120), title: str(c?.title).slice(0, 120),
      emails: arr(c?.emails).map((e) => str(e?.email).toLowerCase()).filter(Boolean).slice(0, 10),
      phones: arr(c?.phones).map((p) => str(p?.phone_formatted || p?.phone)).filter(Boolean).slice(0, 10),
    })),
    addresses: arr(l?.addresses).slice(0, 5).map((a) => ({ address1: str(a?.address_1), address2: str(a?.address_2), city: str(a?.city), state: str(a?.state), zip: str(a?.zipcode), country: str(a?.country) })),
    custom, opportunities: arr(l?.opportunities).map(toOpportunity).filter((o) => o.id && (!o.leadId || o.leadId === id)),
  };
}
export function toActivity(a: any): CloseActivity {
  const type = str(a?._type);
  const text = type === 'Email' ? str(a?.body_preview || a?.body_text) : type === 'Note' ? str(a?.note || a?.note_html?.replace(/<[^>]+>/g, ' ')) : type === 'Call' ? str(a?.note) : type === 'Meeting' ? str(a?.title || a?.note) : str(a?.text || a?.note);
  return {
    id: str(a?.id), type, at: str(a?.date_created || a?.activity_at || a?.date_updated), direction: (['incoming', 'outgoing'].includes(str(a?.direction)) ? str(a?.direction) : '') as CloseActivity['direction'],
    subject: str(a?.subject).slice(0, 200), text: text.replace(/\s+/g, ' ').slice(0, 2000), status: str(a?.status), disposition: str(a?.disposition),
    durationSec: num(a?.duration), userName: str(a?.user_name),
  };
}

/** A read-only Close client. f is injectable so tests never call Close. */
export function createCloseClient(apiKey: string | undefined, f: typeof fetch = fetch, base = CLOSE_API): CloseClient | null {
  if (!apiKey) return null;
  const auth = `Basic ${Buffer.from(`${apiKey}:`).toString('base64')}`;
  async function get(path: string, params: Record<string, string | number>, method: 'GET' | 'PUT' = 'GET', body?: unknown): Promise<any> {
    const q = new URLSearchParams(Object.entries(params).map(([k, v]) => [k, String(v)]));
    let res: Response;
    const headers: Record<string, string> = { authorization: auth, accept: 'application/json', ...(body !== undefined ? { 'content-type': 'application/json' } : {}) };
    try { res = await f(`${base.replace(/\/+$/, '')}/${path}${q.size ? `?${q}` : ''}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(20_000) }); }
    catch { throw new RetryableError(`Close ${path}: network error or timeout`); }
    if (res.status === 429 || res.status >= 500) throw new RetryableError(`Close ${path}: HTTP ${res.status}`);
    if (res.status === 401 || res.status === 403) throw new PermanentError(`Close refused the API key (HTTP ${res.status})`);
    if (!res.ok) throw new PermanentError(`Close ${path}: HTTP ${res.status}`);
    return res.json();
  }
  return {
    async opportunities(opts = {}) {
      const out: CloseOpportunity[] = [];
      const maxPages = Math.min(5, Math.max(1, opts.maxPages ?? 3));
      for (let page = 0; page < maxPages; page++) {
        const j = await get('opportunity/', { _limit: 100, _skip: page * 100, _order_by: '-date_updated' });
        const rows: any[] = Array.isArray(j?.data) ? j.data : [];
        out.push(...rows.map(toOpportunity));
        if (!j?.has_more || rows.length < 100) break;
      }
      return out.filter((o) => o.id && leadOk(o.leadId));
    },
    async activities(leadId, limit = 30) {
      if (!leadOk(leadId)) return [];
      const j = await get('activity/', { lead_id: leadId, _limit: Math.min(100, Math.max(1, limit)) });
      return (Array.isArray(j?.data) ? j.data : []).map(toActivity).filter((a: CloseActivity) => a.type && a.at);
    },
    async opportunitiesCreated(fromIso, toIso, maxPages = 10) {
      const out: CloseOpportunity[] = [];
      const pages = Math.min(10, Math.max(1, maxPages));
      let truncated = false;
      for (let page = 0; page < pages; page++) {
        const j = await get('opportunity/', { date_created__gte: fromIso, date_created__lte: toIso, _limit: 100, _skip: page * 100, _order_by: 'date_created' });
        const rows: any[] = Array.isArray(j?.data) ? j.data : [];
        out.push(...rows.map(toOpportunity));
        if (!j?.has_more || rows.length < 100) break;
        if (page === pages - 1) truncated = true;
      }
      // The window is checked here too (a server that ignores the filter never widens the answer).
      const lo = Date.parse(fromIso), hi = Date.parse(toIso);
      return { opps: out.filter((o) => o.id && leadOk(o.leadId) && Date.parse(o.created) >= lo && Date.parse(o.created) <= hi), truncated };
    },
    async wonOpportunities(sinceIso, maxPages = 3) {
      const out: CloseOpportunity[] = [];
      const pages = Math.min(5, Math.max(1, maxPages));
      let truncated = false;
      for (let page = 0; page < pages; page++) {
        const j = await get('opportunity/', { status_type: 'won', date_updated__gte: sinceIso, _limit: 100, _skip: page * 100, _order_by: '-date_updated' });
        const rows: any[] = Array.isArray(j?.data) ? j.data : [];
        out.push(...rows.map(toOpportunity));
        if (!j?.has_more || rows.length < 100) break;
        if (page === pages - 1) truncated = true;
      }
      // Checked here too: a server that ignores a filter never widens the answer.
      const lo = Date.parse(sinceIso);
      return { opps: out.filter((o) => o.id && leadOk(o.leadId) && o.statusType === 'won' && !(Date.parse(o.updated) < lo)), truncated };
    },
    async pipelines() {
      const j = await get('pipeline/', {});
      return (Array.isArray(j?.data) ? j.data : []).map((p: any): ClosePipeline => ({
        id: str(p?.id), name: str(p?.name),
        statuses: (Array.isArray(p?.statuses) ? p.statuses : []).map((x: any) => ({ id: str(x?.id), label: str(x?.label), type: str(x?.type) })).filter((x: { label: string }) => x.label),
      })).filter((p: ClosePipeline) => p.id && p.statuses.length);
    },
    async statusChanges(sinceIso, maxPages = 10) {
      const out: CloseStatusChange[] = [];
      const pages = Math.min(10, Math.max(1, maxPages));
      let truncated = false;
      for (let page = 0; page < pages; page++) {
        const j = await get('activity/status_change/opportunity/', { date_created__gte: sinceIso, _limit: 100, _skip: page * 100 });
        const rows: any[] = Array.isArray(j?.data) ? j.data : [];
        out.push(...rows.map(toStatusChange));
        if (!j?.has_more || rows.length < 100) break;
        if (page === pages - 1) truncated = true;
      }
      return { changes: out.filter((c) => c.oppId && c.at && Date.parse(c.at) >= Date.parse(sinceIso)), truncated };
    },
    async leadsByEmail(email) {
      const e = String(email ?? '').trim().toLowerCase();
      if (!/^[^\s@"]+@[^\s@"]+\.[^\s@"]+$/.test(e) || e.length > 200) return [];
      // Close's lead search finds the email in its contacts; each answer is checked below (exact match only).
      const j = await get('lead/', { query: `"${e}"`, _limit: 5, _fields: 'id,display_name,contacts' });
      return (Array.isArray(j?.data) ? j.data : []).map((l: any): CloseLeadLite => ({
        id: str(l?.id), name: str(l?.display_name),
        emails: (Array.isArray(l?.contacts) ? l.contacts : []).flatMap((c: any) => (Array.isArray(c?.emails) ? c.emails : []).map((x: any) => str(x?.email).toLowerCase())).filter(Boolean),
      })).filter((l: CloseLeadLite) => leadOk(l.id) && l.emails.includes(e));
    },
    async leadOpportunities(leadId) {
      if (!leadOk(leadId)) return [];
      const j = await get('opportunity/', { lead_id: leadId, _limit: 25 });
      return (Array.isArray(j?.data) ? j.data : []).map(toOpportunity).filter((o: CloseOpportunity) => o.id && o.leadId === leadId);
    },
    async leadDetail(leadId) {
      if (!leadOk(leadId)) return null;
      let j: any;
      try { j = await get(`lead/${leadId}/`, {}); }
      catch (e) { if (e instanceof PermanentError && /HTTP 404/.test(e.message)) return null; throw e; }
      const d = toLeadDetail(j);
      return d.id === leadId ? d : null;
    },
    async updateOpportunity(oppId, patch) {
      if (!oppOk(oppId)) throw new PermanentError('Close: not an opportunity id');
      const j = await get(`opportunity/${oppId}/`, {}, 'PUT', opportunityBody(patch));
      return toOpportunity(j);
    },
  };
}

/** Close webhook subscriptions (hooks connect). The answer of create holds signature_key: the caller stores it sealed and never prints it. */
export function closeWebhooks(apiKey: string, f: typeof fetch = fetch, base = CLOSE_API) {
  const auth = `Basic ${Buffer.from(`${apiKey}:`).toString('base64')}`;
  async function call(method: 'GET' | 'POST' | 'DELETE', path: string, body?: unknown): Promise<any> {
    let res: Response;
    try { res = await f(`${base.replace(/\/+$/, '')}/${path}`, { method, headers: { authorization: auth, accept: 'application/json', ...(body !== undefined ? { 'content-type': 'application/json' } : {}) }, body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(20_000) }); }
    catch { throw new RetryableError(`Close ${method} ${path}: network error or timeout`); }
    if (res.status === 429 || res.status >= 500) throw new RetryableError(`Close ${method} ${path}: HTTP ${res.status}`);
    if (res.status === 401 || res.status === 403) throw new PermanentError(`Close refused the API key (HTTP ${res.status})`);
    if (!res.ok) throw new PermanentError(`Close ${method} ${path}: HTTP ${res.status}`);
    const t = await res.text();
    return t ? JSON.parse(t) : {};
  }
  return {
    async list(): Promise<{ id: string; url: string; status: string; events: { object_type: string; action: string }[] }[]> {
      const out: any[] = [];
      for (let skip = 0, page = 0; page < 10; page++, skip += 100) {
        const r = await call('GET', `webhook/?_limit=100&_skip=${skip}`);
        const rows = Array.isArray(r?.data) ? r.data : [];
        out.push(...rows);
        if (!r?.has_more || !rows.length) break;
      }
      return out.map((w) => ({ id: str(w.id), url: str(w.url), status: str(w.status), events: Array.isArray(w.events) ? w.events.map((e: any) => ({ object_type: str(e?.object_type), action: str(e?.action) })) : [] }));
    },
    async create(url: string, events: { object_type: string; action: string }[]): Promise<{ id: string; signatureKey: string }> {
      const r = await call('POST', 'webhook/', { url, events });
      return { id: str(r?.id), signatureKey: str(r?.signature_key) };
    },
    remove: (id: string) => call('DELETE', `webhook/${encodeURIComponent(id)}/`),
  };
}

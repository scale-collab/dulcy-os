// Close CRM, read only, for HQ Sales (Batch 4a, Alex 2026-11-27). API https://api.close.com/api/v1/,
// HTTP Basic with the API key as the username and an empty password (CLOSE_API_KEY, server .env only;
// the key never goes to the browser). Only GET exists here: HQ never changes anything in Close.
// Every list is bounded (pages and limits), so a slow or big account never runs away.
import { PermanentError, RetryableError } from '../errors.js';

export const CLOSE_API = 'https://api.close.com/api/v1';

export interface CloseOpportunity {
  id: string; leadId: string; leadName: string; status: string; statusType: 'active' | 'won' | 'lost' | string;
  value: number | null; valuePeriod: string; confidence: number | null; created: string; updated: string; won: string;
  note: string; contactName: string; userName: string;
}
export interface CloseActivity {
  id: string; type: string; at: string; direction: 'incoming' | 'outgoing' | ''; subject: string; text: string;
  status: string; disposition: string; durationSec: number | null; userName: string;
}
export interface CloseClient {
  opportunities(opts?: { maxPages?: number }): Promise<CloseOpportunity[]>;
  activities(leadId: string, limit?: number): Promise<CloseActivity[]>;
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
    contactName: str(o?.contact_name), userName: str(o?.user_name),
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
  async function get(path: string, params: Record<string, string | number>): Promise<any> {
    const q = new URLSearchParams(Object.entries(params).map(([k, v]) => [k, String(v)]));
    let res: Response;
    try { res = await f(`${base.replace(/\/+$/, '')}/${path}?${q}`, { method: 'GET', headers: { authorization: auth, accept: 'application/json' }, signal: AbortSignal.timeout(20_000) }); }
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
  };
}

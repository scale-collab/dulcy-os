// Fathom (call recorder) API, read only, for Cole's sales-call reviews. FATHOM_API_KEY from
// Fathom → Settings → API Access. Never changes anything in Fathom.
import { PermanentError, RetryableError } from '../errors.js';

export interface FathomLine { speaker: string; email: string; text: string; t: string }
export interface FathomMeeting {
  id: string; title: string; url: string; createdAt: string; recordedBy: string; recordedByEmail: string;
  invitees: { name: string; email: string; external: boolean }[]; transcript: FathomLine[]; summary: string;
}

export function parseMeeting(m: any): FathomMeeting {
  return {
    id: String(m.recording_id ?? m.id ?? ''), title: String(m.title ?? m.meeting_title ?? ''), url: String(m.share_url ?? m.url ?? ''),
    createdAt: String(m.created_at ?? m.recording_start_time ?? m.scheduled_start_time ?? ''),
    recordedBy: String(m.recorded_by?.name ?? ''), recordedByEmail: String(m.recorded_by?.email ?? ''),
    invitees: (m.calendar_invitees ?? []).map((i: any) => ({ name: String(i.name ?? ''), email: String(i.email ?? ''), external: i.is_external === true || (i.is_external === undefined && !/@dulcy\.io$/i.test(String(i.email ?? ''))) })),
    transcript: (m.transcript ?? []).map((l: any) => ({ speaker: String(l.speaker?.display_name ?? l.speaker ?? ''), email: String(l.speaker?.matched_calendar_invitee_email ?? ''), text: String(l.text ?? ''), t: String(l.timestamp ?? '') })),
    summary: String(m.default_summary?.markdown_formatted ?? m.summary ?? ''),
  };
}

export function createFathomClient(o: { apiKey?: string; baseUrl?: string; fetchImpl?: typeof fetch }) {
  const f = o.fetchImpl ?? fetch;
  const base = (o.baseUrl ?? 'https://api.fathom.ai/external/v1').replace(/\/+$/, '');
  if (!o.apiKey) throw new PermanentError('no FATHOM_API_KEY on the server');
  async function get(path: string, params: Record<string, string>): Promise<any> {
    let res: Response;
    try { res = await f(`${base}${path}?${new URLSearchParams(params)}`, { headers: { 'x-api-key': o.apiKey!, accept: 'application/json' }, signal: AbortSignal.timeout(60_000) }); }
    catch { throw new RetryableError(`Fathom ${path}: network error or timeout`); }
    if (res.status === 429 || res.status >= 500) throw new RetryableError(`Fathom ${path}: HTTP ${res.status}`);
    if (res.status === 401 || res.status === 403) throw new PermanentError(`Fathom ${path}: key refused (HTTP ${res.status}; check FATHOM_API_KEY)`);
    if (!res.ok) throw new PermanentError(`Fathom ${path}: HTTP ${res.status}`);
    return res.json();
  }
  return {
    /** Meetings created after a date, with transcripts and summaries (all pages, at most maxPages). */
    async meetings(createdAfter: string, maxPages = 5): Promise<FathomMeeting[]> {
      const out: FathomMeeting[] = []; let cursor = '';
      for (let i = 0; i < maxPages; i++) {
        const j = await get('/meetings', { created_after: createdAfter, include_transcript: 'true', include_summary: 'true', ...(cursor ? { cursor } : {}) });
        for (const m of j.items ?? j.meetings ?? []) out.push(parseMeeting(m));
        cursor = String(j.next_cursor ?? ''); if (!cursor) break;
      }
      return out;
    },
  };
}

// Calendly: free times of one event type (Dulcy's outreach consultation), for "two dated times".
import { PermanentError, RetryableError } from '../errors.js';

export interface CalendlyOptions { token?: string; eventSlug: string; baseUrl?: string; fetchImpl?: typeof fetch }

export function createCalendly(o: CalendlyOptions) {
  const f = o.fetchImpl ?? fetch;
  const base = (o.baseUrl ?? 'https://api.calendly.com').replace(/\/+$/, '');
  async function get(path: string): Promise<any> {
    if (!o.token) throw new PermanentError('no CALENDLY_TOKEN on the server');
    let res: Response;
    try { res = await f(`${base}${path}`, { headers: { authorization: `Bearer ${o.token}` }, signal: AbortSignal.timeout(30_000) }); }
    catch { throw new RetryableError('Calendly: network error or timeout'); }
    if (res.status === 429 || res.status >= 500) throw new RetryableError(`Calendly: HTTP ${res.status}`);
    if (!res.ok) throw new PermanentError(`Calendly refused: HTTP ${res.status}`);
    return res.json();
  }
  return {
    /** Start times (ISO) of open slots between now+leadHours and now+days. */
    async openSlots(leadHours = 4, days = 7): Promise<string[]> {
      const me = await get('/users/me');
      const types = await get(`/event_types?user=${encodeURIComponent(me.resource.uri)}&active=true&count=100`);
      const et = (types.collection ?? []).find((t: any) => String(t.slug) === o.eventSlug || String(t.scheduling_url ?? '').endsWith(`/${o.eventSlug}`));
      if (!et) throw new PermanentError(`Calendly event type "${o.eventSlug}" not found`);
      const start = new Date(Date.now() + leadHours * 3_600_000), end = new Date(Date.now() + Math.min(days, 7) * 86_400_000);
      const r = await get(`/event_type_available_times?event_type=${encodeURIComponent(et.uri)}&start_time=${start.toISOString()}&end_time=${end.toISOString()}`);
      return (r.collection ?? []).filter((s: any) => s.status === 'available').map((s: any) => String(s.start_time));
    },
  };
}

/** Two slots on different days, written like "Tue Nov 25, 2:00 PM ET". */
export function twoTimes(slots: string[], tz = 'America/New_York'): string[] {
  const day = (s: string) => new Date(s).toLocaleDateString('en-US', { timeZone: tz });
  const fmt = (s: string) => `${new Date(s).toLocaleString('en-US', { timeZone: tz, weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })} ET`;
  const first = slots[0];
  if (!first) return [];
  const second = slots.find((s) => day(s) !== day(first)) ?? slots[1];
  return [first, second].filter(Boolean).map(fmt);
}

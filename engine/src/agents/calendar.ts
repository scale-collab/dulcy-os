// Client calendars through Dulcy's calendar service (dulcy-calendar on the server). Each client
// connects their own calendar with the secure link; the service keeps the tokens. The engine
// only asks for open times with the read-only token.
import type { Config } from '../config.js';

export interface Slot { start_time: string }

export async function openTimes(cfg: Pick<Config, 'calendarUrl' | 'calendarReaderToken'>, workspaceRecordId: string, fetchImpl: typeof fetch = fetch): Promise<{ slots: string[]; timezone: string } | null> {
  if (!cfg.calendarReaderToken || !cfg.calendarUrl || !/^rec[A-Za-z0-9]{14}$/.test(workspaceRecordId)) return null;
  const start = new Date(Date.now() + 2 * 3_600_000).toISOString(), end = new Date(Date.now() + 6 * 86_400_000).toISOString();
  try {
    const r = await fetchImpl(`${cfg.calendarUrl.replace(/\/+$/, '')}/calendar/admin/availability`, {
      method: 'POST', headers: { authorization: `Bearer ${cfg.calendarReaderToken}`, 'content-type': 'application/json' },
      body: JSON.stringify({ workspace: workspaceRecordId, start, end }), signal: AbortSignal.timeout(20_000),
    });
    if (!r.ok) return null;
    const b: any = await r.json();
    const slots = (b.collection ?? []).filter((s: any) => s.status === 'available').map((s: any) => String(s.start_time));
    return slots.length ? { slots, timezone: String(b.connection?.timezone ?? 'America/New_York') } : null;
  } catch { return null; }
}

/** Two open times on different days, written in the calendar's own time zone. */
export function twoTimes(slots: string[], tz = 'America/New_York'): string[] {
  const day = (s: string) => new Date(s).toLocaleDateString('en-US', { timeZone: tz });
  const zone = new Intl.DateTimeFormat('en-US', { timeZone: tz, timeZoneName: 'short' }).formatToParts(new Date(slots[0] ?? Date.now())).find((p) => p.type === 'timeZoneName')?.value ?? '';
  const fmt = (s: string) => `${new Date(s).toLocaleString('en-US', { timeZone: tz, weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })} ${zone}`.trim();
  const first = slots[0];
  if (!first) return [];
  // A real choice: another day if possible, else at least 2 hours later the same day (never 4:00 and 4:05).
  const t0 = Date.parse(first);
  const second = slots.find((s) => day(s) !== day(first)) ?? slots.find((s) => Date.parse(s) - t0 >= 2 * 3_600_000);
  return [first, second].filter((x): x is string => Boolean(x)).map(fmt);
}

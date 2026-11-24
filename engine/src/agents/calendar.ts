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

/** The two slots to offer: another day if possible, else at least 2 hours later the same day (never 4:00 and 4:05). */
export function pickTwo(slots: string[], tz = 'America/New_York'): string[] {
  const day = (s: string) => new Date(s).toLocaleDateString('en-US', { timeZone: tz });
  const first = slots[0];
  if (!first) return [];
  const t0 = Date.parse(first);
  const second = slots.find((s) => day(s) !== day(first)) ?? slots.find((s) => Date.parse(s) - t0 >= 2 * 3_600_000);
  return [first, second].filter((x): x is string => Boolean(x));
}

/** One slot written in the calendar's own time zone, e.g. "Wed, Nov 25, 2:30 PM EST". */
export function fmtSlot(s: string, tz = 'America/New_York'): string {
  const zone = new Intl.DateTimeFormat('en-US', { timeZone: tz, timeZoneName: 'short' }).formatToParts(new Date(s)).find((p) => p.type === 'timeZoneName')?.value ?? '';
  return `${new Date(s).toLocaleString('en-US', { timeZone: tz, weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })} ${zone}`.trim();
}

/** Two open times on different days, written in the calendar's own time zone. */
export function twoTimes(slots: string[], tz = 'America/New_York'): string[] {
  return pickTwo(slots, tz).map((s) => fmtSlot(s, tz));
}

/** Open slots not already offered to another prospect in the last 3 days (so two people never get the same time). */
export async function freeSlots(db: { query: (q: string, v?: unknown[]) => Promise<{ rows: any[] }> }, wsRec: string, slots: string[], emailRecord: string): Promise<string[]> {
  if (!slots.length) return [];
  const taken = new Set((await db.query(`SELECT slot FROM offered_slots WHERE ws_rec = $1 AND email_record <> $2 AND offered_at > now() - interval '3 days'`, [wsRec, emailRecord])).rows.map((r) => String(r.slot)));
  return slots.filter((s) => !taken.has(s));
}

export async function rememberOffered(db: { query: (q: string, v?: unknown[]) => Promise<unknown> }, wsRec: string, slots: string[], emailRecord: string): Promise<void> {
  for (const s of slots) await db.query(`INSERT INTO offered_slots (ws_rec, slot, email_record) VALUES ($1,$2,$3) ON CONFLICT (ws_rec, slot, email_record) DO UPDATE SET offered_at = now()`, [wsRec, s, emailRecord]);
}

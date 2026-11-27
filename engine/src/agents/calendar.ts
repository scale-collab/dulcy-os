// Client calendars through Dulcy's calendar service (dulcy-calendar on the server). Each client
// connects their own calendar with the secure link; the service keeps the tokens. The engine
// asks for open times with the read-only token, and books an agreed time with the booker token
// (Alex 2026-11-27; services/dulcy-calendar POST /calendar/admin/book).
import type { Config } from '../config.js';
import { RetryableError } from '../errors.js';

type CalCfg = Pick<Config, 'calendarUrl' | 'calendarReaderToken'> & Partial<Pick<Config, 'calendarBookerToken'>>;
const isWs = (x: string) => /^rec[A-Za-z0-9]{14}$/.test(x);

async function calendarCall(cfg: CalCfg, token: string | undefined, path: string, body: unknown, fetchImpl: typeof fetch, timeoutMs = 20_000): Promise<{ status: number; body: any }> {
  const r = await fetchImpl(`${cfg.calendarUrl.replace(/\/+$/, '')}${path}`, {
    method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify(body), signal: AbortSignal.timeout(timeoutMs),
  });
  let b: any = null;
  try { b = await r.json(); } catch { b = null; }
  return { status: r.status, body: b };
}

export interface CalendarState { status: string; canBook: boolean; label: string; provider: string | null; timezone: string | null }

/** The client's calendar connection: connected? allowed to book? (null = the service could not be asked). */
export async function calendarStatus(cfg: CalCfg, wsRec: string, fetchImpl: typeof fetch = fetch): Promise<CalendarState | null> {
  if (!cfg.calendarReaderToken || !cfg.calendarUrl || !isWs(wsRec)) return null;
  try {
    const r = await calendarCall(cfg, cfg.calendarReaderToken, '/calendar/admin/status', { workspace: wsRec }, fetchImpl);
    if (r.status !== 200 || !r.body) return null;
    const b = r.body;
    return { status: String(b.status ?? 'Not Connected'), canBook: b.canBook === true, label: String(b.label ?? b.status ?? ''), provider: b.provider ?? null, timezone: b.timezone ?? null };
  } catch { return null; }
}

/** Is this exact start time open right now on the client's calendar (live read)? null = could not tell. */
export async function slotIsFree(cfg: CalCfg, wsRec: string, startIso: string, fetchImpl: typeof fetch = fetch): Promise<boolean | null> {
  if (!cfg.calendarReaderToken || !cfg.calendarUrl || !isWs(wsRec)) return null;
  const start = Date.parse(startIso);
  if (!Number.isFinite(start)) return null;
  try {
    // A 4-hour window: the service lists a start only when the whole meeting fits its rules and free/busy.
    const r = await calendarCall(cfg, cfg.calendarReaderToken, '/calendar/admin/availability',
      { workspace: wsRec, start: new Date(start).toISOString(), end: new Date(start + 4 * 3_600_000).toISOString() }, fetchImpl);
    if (r.status !== 200 || !Array.isArray(r.body?.collection)) return null;
    return r.body.collection.some((s: any) => s?.status === 'available' && Date.parse(String(s.start_time)) === start);
  } catch { return null; }
}

export interface BookRequest { workspace: string; start: string; tz: string; prospect: { name: string; email: string; phone?: string }; title: string; description: string; idempotencyKey: string; durationMinutes?: number }
export interface BookResult {
  booked: boolean; reason?: string; error?: string; message?: string; provider?: string; eventId?: string; htmlLink?: string | null; meetLink?: string | null;
  cancelUrl?: string | null; rescheduleUrl?: string | null; start?: string; end?: string | null; timezone?: string; location?: string | null; idempotent?: boolean;
}

/**
 * Book one agreed time on the client's own calendar. The service re-checks free/busy first and the
 * same idempotency key never books twice, so a retry is always safe. Provider trouble (5xx, timeout)
 * = RetryableError; a refused request = { booked: false, reason: 'error' }.
 */
export async function bookSlot(cfg: CalCfg, req: BookRequest, fetchImpl: typeof fetch = fetch): Promise<BookResult> {
  if (!cfg.calendarBookerToken) return { booked: false, reason: 'no_booker', message: 'booking is not switched on on the engine (CALENDAR_BOOKER_TOKEN)' };
  if (!isWs(req.workspace)) return { booked: false, reason: 'error', error: 'invalid workspace' };
  let r: { status: number; body: any };
  try { r = await calendarCall(cfg, cfg.calendarBookerToken, '/calendar/admin/book', req, fetchImpl, 45_000); }
  catch (e) { throw new RetryableError(`calendar service did not answer: ${String((e as Error).message ?? e).slice(0, 150)}`); }
  if (r.status >= 500 || r.status === 429) throw new RetryableError(`calendar service ${r.status}: ${String(r.body?.error ?? '').slice(0, 150)}`);
  if (r.status !== 200 || !r.body) return { booked: false, reason: 'error', error: String(r.body?.error ?? `calendar service ${r.status}`).slice(0, 200) };
  return r.body as BookResult;
}

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

/** The times already offered to this prospect (this thread), newest first: what "Wednesday at 5 works" refers to. */
export async function offeredTo(db: { query: (q: string, v?: unknown[]) => Promise<{ rows: any[] }> }, wsRec: string, emailRecord: string): Promise<string[]> {
  if (!wsRec) return [];
  return (await db.query(`SELECT slot FROM offered_slots WHERE ws_rec = $1 AND email_record = $2 ORDER BY offered_at DESC, slot LIMIT 6`, [wsRec, emailRecord])).rows.map((r) => String(r.slot));
}

export async function rememberOffered(db: { query: (q: string, v?: unknown[]) => Promise<unknown> }, wsRec: string, slots: string[], emailRecord: string): Promise<void> {
  for (const s of slots) await db.query(`INSERT INTO offered_slots (ws_rec, slot, email_record) VALUES ($1,$2,$3) ON CONFLICT (ws_rec, slot, email_record) DO UPDATE SET offered_at = now()`, [wsRec, s, emailRecord]);
}

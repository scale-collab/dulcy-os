// Echo books the agreed time itself (Alex 2026-11-27): "If they respond 'yes, could we do Wednesday at
// 5 PM' and it's still available, the AI agent should say 'you're all squared away' and have it
// automatically book."
//
// 1. Drafting (sean.ts): Claude says which time the prospect picked (one of the 2 we offered, or a
//    time they proposed), as a wall time in the client's time zone. pickSlot() turns it into an exact
//    instant and checks it: clear, the day they named, 1 hour to 30 days out, inside the client's office
//    hours (weekends / US holidays as the client set them). planBooking() then reads the client's
//    calendar live: free and allowed to book → a booking plan + a short confirmation draft; taken →
//    Claude's draft with 2 new times; no calendar / no booking permission → "I'll send the invite over"
//    for a person, plus an HQ ask to reconnect.
// 2. Approval: exactly as replies. Approval-required clients get ONE card "Book Wed Dec 3, 5:00 PM ET +
//    send confirmation"; auto clients go by themselves inside office hours.
// 3. calendar.book (this file): after the approve, book on the thread's own client calendar (the
//    service re-checks free/busy, idempotent key), record the booking in Airtable the way the system
//    already does, close the follow-ups, then queue reply.send. Booking failed or taken → nothing sent.
import type { Stage } from '../stages/index.js';
import type { Config } from '../config.js';
import type { Db } from '../db/pool.js';
import type { ClientSettings } from './settings.js';
import { NeedsReviewError, PermanentError } from '../errors.js';
import { createAirtableClient } from '../providers/airtable.js';
import { EMAILS, EF, RA, BK, val, wsRecordOf } from './emailsFields.js';
import { DECISIONS, DF } from '../decisions/fields.js';
import { calendarStatus, slotIsFree, bookSlot, type BookResult } from './calendar.js';
import { isUsHoliday, loadSettings } from './settings.js';
import { logActivity } from '../activity.js';
import { enqueue } from '../queue.js';
import { STAGES } from '../stages/index.js';
import { mirrorToSlack } from './replies.js';
import { addAsk } from '../hq/asks.js';
import { clientFileFor } from './knowledge.js';

export const BOOK_DAYS = 30;
/** Earliest booking: an hour from now (the calendar's own notice rule applies on top). */
export const MIN_NOTICE_MIN = 60;
/** Meeting length assumed for the office-hours check (the calendar's own length is used when booking). */
export const ASSUMED_MINUTES = 30;

// ---------- Time zones ----------
function validTz(tz: string): boolean { try { new Intl.DateTimeFormat('en-US', { timeZone: tz }); return !!tz; } catch { return false; } }
/** The wall clock of instant t in tz, written as a UTC millisecond number. */
function wall(t: number, tz: string): number {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
    .formatToParts(new Date(t)).map((x) => [x.type, x.value]));
  return Date.UTC(Number(p.year), Number(p.month) - 1, Number(p.day), Number(p.hour) % 24, Number(p.minute));
}
/** "2026-12-03T17:00" in America/New_York → "2026-12-03T22:00:00.000Z". null when invalid (or a DST gap). Pure. */
export function zonedToUtc(local: string, tz: string): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})$/.exec(String(local ?? '').trim());
  if (!m || !validTz(tz)) return null;
  const want = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), Number(m[4]), Number(m[5]));
  if (!Number.isFinite(want) || new Date(want).getUTCDate() !== Number(m[3])) return null;
  let t = want;
  for (let i = 0; i < 4; i++) { const d = want - wall(t, tz); if (!d) break; t += d; }
  return wall(t, tz) === want ? new Date(t).toISOString() : null;
}
/** Wall time of an instant in tz, "YYYY-MM-DDTHH:MM". Pure. */
export function utcToZoned(iso: string, tz: string): string { return new Date(wall(Date.parse(iso), tz)).toISOString().slice(0, 16); }

const ZONES: Record<string, string> = {
  'America/New_York': 'ET', 'America/Detroit': 'ET', 'America/Toronto': 'ET', 'America/Indiana/Indianapolis': 'ET',
  'America/Chicago': 'CT', 'America/Winnipeg': 'CT', 'America/Denver': 'MT', 'America/Edmonton': 'MT', 'America/Phoenix': 'MT',
  'America/Los_Angeles': 'PT', 'America/Vancouver': 'PT',
};
export function zoneLabel(tz: string, iso: string): string {
  return ZONES[tz] ?? new Intl.DateTimeFormat('en-US', { timeZone: tz, timeZoneName: 'short' }).formatToParts(new Date(iso)).find((p) => p.type === 'timeZoneName')?.value ?? tz;
}
const fmt = (iso: string, tz: string, o: Intl.DateTimeFormatOptions) => new Date(iso).toLocaleString('en-US', { timeZone: tz, ...o });
/** "Wednesday, Dec 3 at 5:00 PM ET" (the confirmation). Pure. */
export function fmtBooked(iso: string, tz: string): string {
  return `${fmt(iso, tz, { weekday: 'long' })}, ${fmt(iso, tz, { month: 'short', day: 'numeric' })} at ${fmt(iso, tz, { hour: 'numeric', minute: '2-digit' })} ${zoneLabel(tz, iso)}`;
}
/** "Wed Dec 3, 5:00 PM ET" (cards, HQ). Pure. */
export function fmtCard(iso: string, tz: string): string {
  return `${fmt(iso, tz, { weekday: 'short' })} ${fmt(iso, tz, { month: 'short', day: 'numeric' })}, ${fmt(iso, tz, { hour: 'numeric', minute: '2-digit' })} ${zoneLabel(tz, iso)}`;
}

// ---------- Checks ----------
const DAY_RE: [number, RegExp][] = [
  [0, /\bsunday\b/i], [1, /\b(monday|mon)\b/i], [2, /\b(tuesday|tues?)\b/i], [3, /\b(wednesday|wed)\b/i],
  [4, /\b(thursday|thurs?|thu)\b/i], [5, /\b(friday|fri)\b/i], [6, /\bsaturday\b/i],
];
/** Weekdays the prospect named in their own words (quoted history cut off). Pure. */
export function namedWeekdays(text: string): number[] {
  const own = String(text ?? '').split(/\n\s*(?:On\s.+wrote:|>|-{3,}\s*Original Message|From:\s)/i)[0];
  return DAY_RE.filter(([, re]) => re.test(own)).map(([d]) => d);
}

function localParts(iso: string, tz: string) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23', weekday: 'short' })
    .formatToParts(new Date(iso)).map((x) => [x.type, x.value]));
  return { y: Number(p.year), m: Number(p.month), d: Number(p.day), mins: (Number(p.hour) % 24) * 60 + Number(p.minute), wd: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(String(p.weekday)) };
}
const hm = (t: string, dflt: number) => { const x = /^(\d{1,2}):(\d{2})/.exec(String(t ?? '').trim()); return x ? Number(x[1]) * 60 + Number(x[2]) : dflt; };

/**
 * May this slot be booked for this client? Next 30 days only, an hour's notice, inside the client's
 * office hours (Reply Agent settings: time zone, start/end, Exclude Weekends, Exclude US Holidays). Pure.
 */
export function slotAllowed(office: ClientSettings['office'], startIso: string, now = new Date(), minutes = ASSUMED_MINUTES): { ok: boolean; why: string } {
  const t = Date.parse(startIso);
  if (!Number.isFinite(t)) return { ok: false, why: 'the time is not clear' };
  if (t < now.getTime() + MIN_NOTICE_MIN * 60_000) return { ok: false, why: 'it is too soon (under an hour away) or has passed' };
  if (t > now.getTime() + BOOK_DAYS * 86_400_000) return { ok: false, why: `it is more than ${BOOK_DAYS} days out` };
  const tz = validTz(office.tz) ? office.tz : 'America/New_York';
  const p = localParts(startIso, tz), e = localParts(new Date(t + minutes * 60_000).toISOString(), tz);
  if (office.noWeekends && (p.wd === 0 || p.wd === 6)) return { ok: false, why: 'it is on a weekend and this client does not take weekend calls' };
  if (office.noHolidays && isUsHoliday(p.y, p.m, p.d)) return { ok: false, why: 'it is a US holiday and this client is off on holidays' };
  if (p.mins < hm(office.start, 540) || e.d !== p.d || e.mins > hm(office.end, 1020)) return { ok: false, why: `it is outside the client's office hours (${office.start || '09:00'}-${office.end || '17:00'} ${zoneLabel(tz, startIso)})` };
  return { ok: true, why: '' };
}

export type TimeChoice = 'none' | 'accepts_offered' | 'proposes_time' | 'vague';
export type SlotPick = { kind: 'none' } | { kind: 'retime'; why: string; start?: string } | { kind: 'slot'; start: string; offered: boolean };

/** The prospect's pick → one exact, allowed slot, or why not. Pure. */
export function pickSlot(i: { choice: TimeChoice; chosenLocal: string; tz: string; offered: string[]; prospectText: string; office: ClientSettings['office']; now?: Date }): SlotPick {
  if (i.choice !== 'accepts_offered' && i.choice !== 'proposes_time') return { kind: 'none' };
  const start = zonedToUtc(i.chosenLocal, i.tz);
  if (!start) return { kind: 'retime', why: 'the time they picked is not clear' };
  const days = namedWeekdays(i.prospectText);
  if (days.length && !days.includes(localParts(start, i.tz).wd)) return { kind: 'retime', start, why: 'the day they named does not match the date worked out, so it is not clear' };
  const allowed = slotAllowed({ ...i.office, tz: i.office.tz || i.tz }, start, i.now ?? new Date());
  if (!allowed.ok) return { kind: 'retime', start, why: allowed.why };
  return { kind: 'slot', start, offered: i.offered.some((o) => Date.parse(o) === Date.parse(start)) };
}

export type Plan =
  | { kind: 'none' }
  | { kind: 'retime'; why: string; label: string }
  | { kind: 'book'; start: string; tz: string; label: string; long: string; provider: string; offered: boolean }
  | { kind: 'manual'; start: string; tz: string; label: string; long: string; why: string; reconnect: boolean };

/** Live part: is the slot open on the client's own calendar, and may Dulcy book it? */
export async function planBooking(cfg: Pick<Config, 'calendarUrl' | 'calendarReaderToken'> & Partial<Pick<Config, 'calendarBookerToken'>>, wsRec: string, pick: SlotPick, tz: string, fetchImpl: typeof fetch = fetch): Promise<Plan> {
  if (pick.kind === 'none') return pick;
  if (pick.kind === 'retime') return { kind: 'retime', why: pick.why, label: pick.start ? fmtCard(pick.start, tz) : '' };
  const label = fmtCard(pick.start, tz), long = fmtBooked(pick.start, tz);
  const st = await calendarStatus(cfg, wsRec, fetchImpl);
  if (!st || st.status !== 'Connected') return { kind: 'manual', start: pick.start, tz, label, long, why: 'this client has no connected calendar', reconnect: true };
  const free = await slotIsFree(cfg, wsRec, pick.start, fetchImpl);
  if (free === false) return { kind: 'retime', why: 'it is already taken on the client\'s calendar (checked live)', label };
  if (!st.canBook) return { kind: 'manual', start: pick.start, tz, label, long, why: 'the client\'s calendar can\'t book yet: it was connected before booking existed, or without the booking permission (Connected – reconnect to allow booking)', reconnect: true };
  if (!cfg.calendarBookerToken) return { kind: 'manual', start: pick.start, tz, label, long, why: 'booking is not switched on on the engine (CALENDAR_BOOKER_TOKEN)', reconnect: false };
  if (free === null) return { kind: 'manual', start: pick.start, tz, label, long, why: 'the client\'s calendar could not be checked just now', reconnect: false };
  return { kind: 'book', start: pick.start, tz, label, long, provider: st.provider ?? '', offered: pick.offered };
}

/** The calendar service's provider keys → the names people see (Activity Log). */
export const CALENDAR_NAMES: Record<string, string> = { google: 'Google', microsoft: 'Outlook', calendly: 'Calendly', calcom: 'Cal.com', ghl: 'GoHighLevel', hubspot: 'HubSpot' };

// ---------- Texts (Alex's style: short) ----------
const firstName = (name: string) => String(name ?? '').trim().split(/\s+/)[0]?.replace(/[^\p{L}'-]/gu, '') ?? '';
export function confirmationText(name: string, long: string, provider: string): string {
  const first = firstName(name);
  return `${first ? `Hi ${first},\n\n` : ''}You're all set for ${long}. A calendar invite${provider === 'google' ? ' with the video link' : ''} is on its way.`;
}
/** Used when the picked time is gone and Claude left no draft: two other times, else the link, never a vague ask. */
export function fallbackText(name: string, times: string[], link: string): string {
  const first = firstName(name);
  const ask = times.length >= 2 ? `Would ${times[0]} or ${times[1]} work instead?` : times.length === 1 ? `Would ${times[0]} work instead?` : link ? `Here's my calendar to grab another time: ${link}` : 'Which other day and time works for you?';
  return `${first ? `Hi ${first},\n\n` : ''}That time just got taken, sorry. ${ask}`;
}
export function manualText(name: string, long: string): string {
  const first = firstName(name);
  return `${first ? `Hi ${first},\n\n` : ''}${long} works. I'll send the calendar invite over shortly.`;
}

// ---------- The booking on the thread ----------
export interface BookingPolicy {
  status: 'pending' | 'booked' | 'taken' | 'failed';
  key: string; wsRec: string; start: string; tz: string; label: string; long: string; provider: string; offered: boolean;
  /** Claude's own draft offering 2 other times: used when the time is gone by the time we book. */
  fallbackDraft: string;
  eventId?: string; htmlLink?: string | null; meetLink?: string | null; location?: string | null; bookedAt?: string; error?: string;
}
/** Booking key: one per thread, prospect message and time, so the same approval can never book twice. */
export const bookingKey = (emailRecordId: string, replyAt: string, start: string) => `echo:${emailRecordId}:${Date.parse(replyAt) || 0}:${start.slice(0, 16)}`;
export function bookingOf(policy: Record<string, any>): BookingPolicy | null {
  const b = policy?.booking;
  return b && typeof b === 'object' && typeof b.start === 'string' && typeof b.status === 'string' ? b as BookingPolicy : null;
}
export const needsBooking = (policy: Record<string, any>) => bookingOf(policy)?.status === 'pending';
/** What HQ shows for a booked thread: "Booked: Wed Dec 3, 5:00 PM ET (Google Meet)". Pure. */
export function bookedLine(b: BookingPolicy | null): string {
  return b?.status === 'booked' ? `Booked: ${b.label}${b.location ? ` (${b.location})` : ''}` : '';
}

/** Ask Alex (HQ "Needs you") to have the client reconnect their calendar so Echo can book. One ask per client. */
export async function askReconnect(db: Db, client: string, wsRec: string, why: string): Promise<void> {
  try {
    await addAsk(db, {
      agent: 'Echo', title: `Reconnect ${client}'s calendar so Echo can book meetings`, dedupeKey: `echo:reconnect-calendar:${wsRec}`,
      why: `A prospect picked a time and Echo could not book it: ${why}.`.slice(0, 300),
      steps: `1. Open the client in HQ → AI replier → Calendar → Get calendar link.\n2. Send the link to ${client}; they sign in once and tick the calendar permission (it now includes booking).\n3. Until then Echo drafts "I'll send the invite over" and a person sends the invite.`,
      priority: 'normal', audience: 'owner',
    });
  } catch (e) { console.error(JSON.stringify({ level: 'warn', message: 'reconnect ask not saved', err: String((e as Error).message ?? e).slice(0, 200) })); }
}

const DONE_STATES = ['Sent', 'Sending', 'Suppressed', 'Thread Complete'];
const STOP = /\b(unsubscribe|remove me|take me off|stop emailing|do not contact)\b/i;
const READ = [...new Set([...Object.values(EF), ...Object.values(RA), ...Object.values(BK)])];
const policyOf = (f: Record<string, unknown>): Record<string, any> => { try { const j = JSON.parse(val(f[RA.policy]) || '{}'); return j && typeof j === 'object' ? j : {}; } catch { return {}; } };


/**
 * The prospect's phone, for booking forms that ask for one (Alex 2026-11-27): the lead's Phone Number
 * in Airtable first, else a number in the prospect's own latest message (signature), quoted history cut off.
 * Returned in E.164 (+15551234567), or '' when none is clear. Pure.
 */
export function prospectPhone(rowPhone: string, latestReply: string): string {
  const norm = (raw: string): string => {
    const plus = raw.trim().startsWith('+');
    const d = raw.replace(/\D/g, '');
    if (!plus && d.length === 10 && /^[2-9]/.test(d)) return `+1${d}`;
    if (!plus && d.length === 11 && d.startsWith('1')) return `+${d}`;
    if (plus && d.length >= 8 && d.length <= 15) return `+${d}`;
    return '';
  };
  const fromRow = norm(String(rowPhone || ''));
  if (fromRow) return fromRow;
  const own = String(latestReply || '').split(/\n(?:On .{0,200}wrote:|-{2,}\s*Original Message|From: )/i)[0];
  for (const m of own.matchAll(/(\+?\d[\d\s().-]{8,18}\d)/g)) { const n = norm(m[1]); if (n) return n; }
  return '';
}

export const calendarBookStage: Stage = async (ctx) => {
  const cfg = ctx.cfg;
  if (!cfg.airtableApiKey) throw new PermanentError('no AIRTABLE_API_KEY on the server');
  const at = createAirtableClient({ apiKey: cfg.airtableApiKey, baseId: cfg.airtableBaseId, baseUrl: cfg.airtableBaseUrl });
  const recId = String(ctx.job.input.emailsRecordId ?? '');
  const rec = await at.get(EMAILS, recId, READ);
  if (!rec) throw new PermanentError(`reply row ${recId} not found`);
  const f = rec.fields, policy = policyOf(f), b = bookingOf(policy);
  if (!b || b.status !== 'pending') return { message: `nothing to book (${b?.status ?? 'no booking on this thread'})` };
  const action = val(f[RA.humanAction]);
  if (!['Approve Draft', 'Send Edited Reply'].includes(action)) return { message: `not approved (Human Action is "${action || 'None'}"); nothing booked` };
  if (DONE_STATES.includes(val(f[RA.state]))) return { message: `already ${val(f[RA.state])}; nothing booked` };
  const who = val(f[EF.leadName]) || 'prospect';

  // Back to a person, nothing booked and nothing sent. The "you're all set" draft is always replaced
  // (by default with Claude's draft offering two other times), so it can never go out unbooked.
  const refuse = async (msg: string, status: BookingPolicy['status'], draft = b.fallbackDraft) => {
    if (ctx.dryRun) return;
    await at.update(EMAILS, recId, {
      [RA.state]: 'Needs Approval', [RA.humanAction]: 'None', [RA.lastError]: msg, [RA.draft]: draft,
      [RA.policy]: JSON.stringify({ ...policy, booking: { ...b, status, error: msg } }),
    });
    await mirrorToSlack(at, cfg.slackBotToken ? (await import('../providers/slack.js')).createSlackClient({ token: cfg.slackBotToken, baseUrl: cfg.slackBaseUrl }) : null, recId, 'Failed', `:x: Not booked, nothing sent: ${msg}`);
  };

  // Book only on this thread's own client calendar (never another client's).
  const wsRec = wsRecordOf(f);
  if (!wsRec || b.wsRec !== wsRec) { const m = 'this booking was planned for another client\'s calendar; nothing booked or sent'; await refuse(m, 'failed'); throw new NeedsReviewError(m); }
  if (val(f[RA.ownership]) === 'Handoff' || f[EF.clientHandling] === true || f[EF.dnc] === true) { await refuse('the client handles this thread (or it is Do Not Contact); Dulcy does not book here', 'failed'); return { message: 'client-handled; nothing booked' }; }
  if (STOP.test(val(f[EF.latestReply]))) { await refuse('the prospect asked to stop; nothing booked', 'failed', ''); return { message: 'stop; nothing booked' }; }
  const latest = Date.parse(val(f[EF.latestReplyAt])), drafted = Date.parse(val(f[RA.updatedAt]));
  if (Number.isFinite(latest) && Number.isFinite(drafted) && latest > drafted + 60_000) { await refuse('the prospect wrote again after this draft; it needs a redraft', 'failed'); return { message: 'prospect wrote again; nothing booked' }; }
  const settings = await loadSettings(at, wsRec);
  const allowed = slotAllowed(settings.office, b.start);
  if (!allowed.ok) { await refuse(`${b.label} can't be booked now: ${allowed.why}. The draft offers two other times.`, 'taken', b.fallbackDraft); return { message: `not booked: ${allowed.why}` }; }
  const email = val(f[EF.leadEmail]);
  if (!/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(email)) { await refuse('this row has no prospect email to invite', 'failed'); return { message: 'no prospect email' }; }

  if (ctx.dryRun) return { message: `Dry run: would book ${b.label} on the client's calendar, then send the confirmation; calendar.book is not in LIVE_STAGES`, dryRun: true };

  const client = clientFileFor(cfg.knowledgeDir, Number(val(f[EF.workspace])))?.name ?? 'the client';
  // The prospect sees the title and description on the invite: no agency or agent names in them.
  const req = {
    workspace: wsRec, start: b.start, tz: b.tz, prospect: { name: val(f[EF.leadName]), email, phone: prospectPhone(val(f[EF.phone]), val(f[EF.latestReply])) }, idempotencyKey: b.key,
    title: `Intro call: ${val(f[EF.leadName]) || 'prospect'}${val(f[EF.company]) ? ` (${val(f[EF.company])})` : ''}`.slice(0, 200),
    description: val(f[EF.subject]) ? `Re: ${val(f[EF.subject]).replace(/^(re:\s*)+/i, '')}` : '',
  };
  const res: BookResult = await ctx.paid({
    callKey: `book:${b.key}`, provider: 'calendar', units: 0, scope: 'record',
    run: () => bookSlot(cfg, req),
    // The service never books one key twice: asking again adopts the first booking.
    reconcile: async () => { const r = await bookSlot(cfg, req); return r.booked ? r : null; },
    dryRunResult: () => ({ booked: false, reason: 'dry_run' }),
  });

  if (!res.booked) {
    const why = res.reason === 'taken' ? 'it was taken before we could book it'
      : res.reason === 'outside_hours' || res.reason === 'notice' ? 'it is outside the calendar\'s bookable hours'
        : res.reason === 'reconnect' ? 'the client\'s calendar has to be reconnected to allow booking'
          : res.reason === 'not_connected' ? 'the client\'s calendar is not connected'
            : res.message || res.error || res.reason || 'the calendar service refused';
    await ctx.step(`not-booked:${b.key}`, async () => {
      const retime = ['taken', 'outside_hours', 'notice'].includes(String(res.reason));
      await refuse(retime ? `${b.label} is no longer open (${why}). Nothing was booked or sent; the draft now offers two other times.` : `${b.label} was not booked: ${why}. Nothing was sent; the draft says you'll send the invite by hand.`,
        retime ? 'taken' : 'failed', retime ? b.fallbackDraft : manualText(val(f[EF.leadName]), b.long));
      if (['reconnect', 'not_connected'].includes(String(res.reason))) await askReconnect(ctx.db, client, wsRec, why);
      // A new card, so the redraft is approved like any reply.
      await at.create(DECISIONS, {
        [DF.title]: `Reply to ${who} (${b.label} ${retime ? 'is taken' : 'not booked'})`, [DF.agent]: 'Echo', [DF.status]: 'New', [DF.client]: client, [DF.emailsRecord]: recId,
        [DF.issue]: `They picked ${b.label}. ${why}.`, [DF.checked]: retime ? 'Two other open times are offered instead.' : 'Send the calendar invite by hand after this reply.',
        [DF.fix]: retime ? b.fallbackDraft : manualText(val(f[EF.leadName]), b.long), [DF.action]: 'Approve Reply',
      });
      await logActivity(cfg, { event: `Meeting not booked: ${who} ${b.label}`, type: 'Step failed', agent: 'Echo', details: why, jobId: ctx.job.id });
      return { ok: true };
    });
    if (res.reason === 'uncertain') throw new NeedsReviewError(`${b.label}: ${res.message ?? 'earlier booking attempt has an unknown outcome'}; check the client's calendar before booking again`);
    return { message: `Not booked (${why}); nothing sent`, booked: false, reason: res.reason };
  }

  await ctx.step(`record-booked:${b.key}`, async () => {
    const now = new Date().toISOString();
    const done: BookingPolicy = { ...b, status: 'booked', eventId: res.eventId, htmlLink: res.htmlLink ?? null, meetLink: res.meetLink ?? null, location: res.location ?? null, bookedAt: now, provider: res.provider ?? b.provider };
    // Recorded the way the system already records a booked meeting (see BK in emailsFields.ts).
    // Updated At stays the draft time, so the sender still notices a prospect who writes again.
    await at.update(EMAILS, recId, {
      [BK.opportunity]: 'WON', [EF.stage]: 'Booked Meeting', [BK.callDate]: utcToZoned(b.start, b.tz).slice(0, 10), [BK.meetingBookedAt]: now,
      [RA.followupType]: 'None', [RA.dueAt]: null, [RA.lastError]: '',
      [RA.policy]: JSON.stringify({ ...policy, booking: done }),
    });
    await logActivity(cfg, {
      event: `Meeting booked: ${who}${val(f[EF.company]) ? ` at ${val(f[EF.company])}` : ''}, ${b.label}`, type: 'Step done', agent: 'Echo', jobId: ctx.job.id,
      details: `On the client's own ${CALENDAR_NAMES[res.provider ?? ''] ?? 'Google'} calendar${res.location ? ` (${res.location})` : ''}. Event ${res.eventId}${res.htmlLink ? `\n${res.htmlLink}` : ''}${res.idempotent ? '\n(already booked earlier with the same key; not booked twice)' : ''}\nFollow-ups closed. Confirmation reply queued.`,
    });
    return { eventId: res.eventId };
  });

  // Then the confirmation: the normal sender, after the booking and only after it.
  await ctx.step(`queue-send:${b.key}`, async () => {
    const def = STAGES['reply.send'];
    const q = await enqueue(ctx.db, {
      kind: 'reply.send', recordId: recId, input: { emailsRecordId: recId, via: String(ctx.job.input.via ?? 'Airtable') }, requestId: `send:${recId}:booked:${b.key}`,
      dryRun: cfg.dryRun && !cfg.liveStages.includes('reply.send'), maxAttempts: def.maxAttempts, deadlineMs: def.deadlineMs,
    });
    return { job: q.job.id };
  });
  return { message: `Booked ${b.label} on the client's calendar${res.location ? ` (${res.location})` : ''}; confirmation queued`, booked: true, eventId: res.eventId };
};

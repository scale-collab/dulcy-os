// HQ Today, round 2 (Alex, 2026-11-27 evening): the blocks under the founder's to-do.
//   - Campaigns, grouped by how they are doing: Performing well / On pace / Needs more time / Needs a
//     look. Judged on interested replies and meetings against emails sent and progress; bounce is one
//     signal, not the headline (RULES "HQ round 2 rules"). Over 4% bounce still means a look (RULES #4).
//   - The weekly scorecard: interested, meetings booked and emails sent, this week so far vs the same
//     days last week (labelled with the dates).
//   - What each agent did in the last 24 hours, in plain words (the Activity Log), for the team check.
// Read only. Airtable reads are cached for 60 seconds, one copy for everyone.
import type { Db } from '../db/pool.js';
import type { HqAirtable } from './decisions.js';
import { buildRows, cachedCampaigns, CAMPAIGN_LIMITS, type CampaignRow } from './campaigns.js';
import { ACTIVITY, canonAgent } from '../activity.js';
import { EMAILS } from '../agents/emailsFields.js';
import type { AgentName } from './agents.js';

// ---------- campaigns: how each live campaign is doing ----------
export type How = 'well' | 'pace' | 'time' | 'look';
export const HOW_ORDER: How[] = ['look', 'well', 'pace', 'time'];
export const HOW_LABEL: Record<How, string> = { well: 'Performing well', pace: 'On pace', time: 'Needs more time', look: 'Needs a look' };
export const HOW_SUB: Record<How, string> = {
  well: 'More interested replies than the agency average, meetings keeping up',
  pace: 'Close to the agency average',
  time: `Under ${CAMPAIGN_LIMITS.minSentToJudge} emails sent: too early to judge`,
  look: 'Few interested replies for what was sent, a failed step, or bounce over 4%',
};
/**
 * The limits. Judge only from 500 sent (CAMPAIGN_LIMITS.minSentToJudge). Interested per email vs the
 * agency average: 1.25× or more = well, under 0.6× = a look (the "low interest" rule). Meetings keep
 * up = booked is at least 20% of interested (the Campaigns "Pace?" formula in Airtable).
 */
export const HOW_LIMITS = { minSent: CAMPAIGN_LIMITS.minSentToJudge, well: 1.25, low: CAMPAIGN_LIMITS.lowShare, booked: 0.2, emptySent: 1000 } as const;

export type HowRow = Pick<CampaignRow, 'id' | 'name' | 'client' | 'sent' | 'interested' | 'booked' | 'progress' | 'bounce' | 'needs'>;
export interface HowCampaign { id: string; name: string; client: string; how: How; why: string; signals: string[]; sent: number; interested: number; booked: number; progress: number }
const perK = (i: number, s: number) => (s > 0 ? Math.round((i / s) * 10_000) / 10 : 0);
const num = (x: number) => x.toLocaleString('en-US');
const pct = (x: number) => `${Number.isInteger(x) ? x : x.toFixed(1)}%`;

/** Interested per email across campaigns with enough sent (the agency average). Pure. */
export function agencyRate(rows: Pick<CampaignRow, 'sent' | 'interested'>[]): number | undefined {
  const judged = rows.filter((r) => r.sent >= HOW_LIMITS.minSent);
  const sent = judged.reduce((a, r) => a + r.sent, 0);
  return sent > 0 ? judged.reduce((a, r) => a + r.interested, 0) / sent : undefined;
}

/** Which group one live campaign is in, with one plain line why. Pure. */
export function campaignHow(r: HowRow, rate: number | undefined): HowCampaign {
  const L = HOW_LIMITS;
  const base = { id: r.id, name: r.name, client: r.client, sent: r.sent, interested: r.interested, booked: r.booked, progress: r.progress };
  const signals: string[] = [];
  if (r.bounce > CAMPAIGN_LIMITS.watch && r.bounce <= CAMPAIGN_LIMITS.pause) signals.push(`Bounce ${pct(r.bounce)} (watch)`);
  if (r.needs.some((n) => n.kind === 'next')) signals.push(`${Math.round(r.progress * 100)}% sent: plan the next one`);
  const meetings = r.interested ? `${r.booked} meeting${r.booked === 1 ? '' : 's'} from ${r.interested} interested` : '';
  const vsAgency = rate ? `${perK(r.interested, r.sent)} interested per 1,000 sent (agency ${perK(rate, 1)})` : `${perK(r.interested, r.sent)} interested per 1,000 sent`;
  const out = (how: How, why: string): HowCampaign => ({ ...base, how, why, signals });
  if (r.bounce > CAMPAIGN_LIMITS.pause) return out('look', `Bounce ${pct(r.bounce)}: over 4%, pause and check`);
  const failed = r.needs.find((n) => n.kind === 'failed' || n.kind === 'stuck');
  if (failed) return out('look', failed.text);
  if (r.sent < L.minSent) return out('time', `${num(r.sent)} sent so far (${Math.round(r.progress * 100)}% of the list)`);
  if (!r.interested && r.sent >= L.emptySent) return out('look', `${num(r.sent)} sent, no interested reply yet`);
  const share = rate ? r.interested / r.sent / rate : 1;
  if (share < L.low) return out('look', vsAgency);
  const keepsUp = r.interested > 0 && r.booked >= L.booked * r.interested;
  if (share >= L.well && (keepsUp || r.interested < 5)) return out('well', [vsAgency, meetings].filter(Boolean).join(' · '));
  if (share >= L.well && !keepsUp) signals.push(`Meetings behind: ${meetings}`);
  return out('pace', [vsAgency, keepsUp ? meetings : ''].filter(Boolean).join(' · '));
}

export interface CampaignGroups {
  live: number; agencyPerThousand: number | null; readAt: string;
  groups: { key: How; label: string; sub: string; count: number; campaigns: HowCampaign[] }[];
}
/** Live campaigns of active clients, grouped. Pure. */
export function campaignGroups(rows: CampaignRow[], readAt = '', max = 6): CampaignGroups {
  const rate = agencyRate(rows);
  const live = rows.filter((r) => r.group === 'live' && r.clientActive !== false).map((r) => campaignHow(r, rate));
  const sorters: Record<How, (a: HowCampaign, b: HowCampaign) => number> = {
    look: (a, b) => b.sent - a.sent, well: (a, b) => b.interested / Math.max(1, b.sent) - a.interested / Math.max(1, a.sent),
    pace: (a, b) => b.interested - a.interested, time: (a, b) => b.sent - a.sent,
  };
  return {
    live: live.length, agencyPerThousand: rate ? perK(rate, 1) : null, readAt,
    groups: HOW_ORDER.map((key) => {
      const list = live.filter((c) => c.how === key).sort(sorters[key]);
      return { key, label: HOW_LABEL[key], sub: HOW_SUB[key], count: list.length, campaigns: list.slice(0, max) };
    }),
  };
}

// ---------- the weekly scorecard ----------
export const EMAIL_ANALYTICS = 'tblVqkbJyd6be1lJH'; // one row per campaign per day (n8n "Analytics Trend - EmailBison")
export const EAF = { date: 'flda4C6QQN04OHkuM', sent: 'fldRyIaN7ieqpr0js' } as const;
const INTERESTED = ['Interested', 'Meeting Request', 'Info Request', 'Information Request'];
const TZ = 'America/New_York';
const nyDay = (t: number) => new Date(t).toLocaleDateString('en-CA', { timeZone: TZ });
const addDays = (d: string, k: number) => new Date(Date.parse(`${d}T12:00:00Z`) + k * 86_400_000).toISOString().slice(0, 10);
/** 2026-11-23 → 11/23 (dates in HQ use slashes). */
export const slashDay = (d: string) => (/^\d{4}-\d{2}-\d{2}/.test(d) ? `${Number(d.slice(5, 7))}/${Number(d.slice(8, 10))}` : d);

export interface WeekSpan { from: string; to: string; label: string }
/** This week = Monday to today (New York); last week = the same days one week earlier. Pure. */
export function weekSpans(now: number): { thisWeek: WeekSpan; lastWeek: WeekSpan } {
  const today = nyDay(now);
  const dow = new Date(`${today}T12:00:00Z`).getUTCDay(); // 0 = Sunday
  const from = addDays(today, -((dow + 6) % 7));
  const span = (f: string, t: string): WeekSpan => ({ from: f, to: t, label: f === t ? slashDay(f) : `${slashDay(f)}–${slashDay(t)}` });
  return { thisWeek: span(from, today), lastWeek: span(addDays(from, -7), addDays(today, -7)) };
}
export interface ReplyFact { status: string; repliedAt: string; bookedAt: string }
export interface SentFact { date: string; sent: number }
export interface WeekNumbers { interested: number; booked: number; sent: number | null }
export interface Scorecard { thisWeek: WeekSpan & WeekNumbers; lastWeek: WeekSpan & WeekNumbers; sentNote: string }
/** Interested and booked from the Emails table (lead by lead), emails sent from Email Analytics (per day). Pure. */
export function scorecard(replies: ReplyFact[], sent: SentFact[] | null, now: number): Scorecard {
  const { thisWeek, lastWeek } = weekSpans(now);
  const dayOf = (iso: string) => { const t = Date.parse(iso); return iso && Number.isFinite(t) ? (/^\d{4}-\d{2}-\d{2}$/.test(iso) ? iso : nyDay(t)) : ''; };
  const inSpan = (d: string, s: WeekSpan) => !!d && d >= s.from && d <= s.to;
  const count = (s: WeekSpan): WeekNumbers => ({
    interested: replies.filter((r) => INTERESTED.includes(r.status) && inSpan(dayOf(r.repliedAt), s)).length,
    booked: replies.filter((r) => inSpan(dayOf(r.bookedAt), s)).length,
    sent: sent ? sent.filter((x) => inSpan(x.date.slice(0, 10), s)).reduce((a, x) => a + x.sent, 0) : null,
  });
  return {
    thisWeek: { ...thisWeek, ...count(thisWeek) }, lastWeek: { ...lastWeek, ...count(lastWeek) },
    sentNote: sent ? 'Emails sent: EmailBison daily numbers (Email Analytics, up to yesterday).' : 'Emails sent: could not be read (Email Analytics).',
  };
}

// ---------- what each agent did in the last 24 hours ----------
export interface ActivityFact { agent: string; type: string; event: string }
export interface AgentDay { agent: AgentName; count: number; failed: number; line: string }
/** "Account rested 7 days: a@b.io" → "Account rested 7 days"; a status ending ("Launch: done") stays. Pure. */
export function eventKind(event: string): string {
  const e = String(event ?? '').replace(/\s+/g, ' ').trim();
  const i = e.lastIndexOf(': ');
  if (i < 0) return e.slice(0, 60);
  const tail = e.slice(i + 2);
  return /^(done|failed|started|skipped|paused|resumed|ok)\b/i.test(tail) ? e.slice(0, 60) : e.slice(0, i).slice(0, 60);
}
/**
 * One plain line per agent: "3× Account rested 7 days · 2× Launch: done · +4 more". Engine rows
 * (lead list and campaign steps) count for Atlas, who runs those stages. Pure.
 */
export function agentDay(rows: ActivityFact[], visible: readonly AgentName[]): AgentDay[] {
  const per = new Map<string, ActivityFact[]>();
  for (const r of rows) {
    const a = canonAgent(r.agent) === 'Engine' ? 'Atlas' : canonAgent(r.agent);
    per.set(a, [...(per.get(a) ?? []), r]);
  }
  return visible.map((agent) => {
    const mine = per.get(agent) ?? [];
    const kinds = new Map<string, number>();
    for (const r of mine) { const k = eventKind(r.event) || r.type || 'Step'; kinds.set(k, (kinds.get(k) ?? 0) + 1); }
    const top = [...kinds.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
    const shown = top.slice(0, 3).map(([k, n]) => (n > 1 ? `${n}× ${k}` : k));
    const rest = top.slice(3).reduce((a, [, n]) => a + n, 0);
    return {
      agent, count: mine.length, failed: mine.filter((r) => r.type === 'Step failed').length,
      line: mine.length ? `${shown.join(' · ')}${rest ? ` · +${rest} more` : ''}` : 'Nothing done in the last 24 hours',
    };
  });
}

// ---------- reads (cached 60 seconds) ----------
const v = (x: unknown): string => (Array.isArray(x) ? v(x[0]) : x === undefined || x === null ? '' : typeof x === 'object' ? String((x as any).name ?? (x as any).id ?? '') : String(x)).trim();
const n = (x: unknown) => (Number.isFinite(Number(v(x))) ? Number(v(x)) : 0);
export interface TodaySource { replies: ReplyFact[]; sent: SentFact[] | null; activity: ActivityFact[] | null; readAt: string }
export async function readTodaySource(at: Pick<HqAirtable, 'list'>, now = Date.now()): Promise<TodaySource> {
  const { lastWeek } = weekSpans(now);
  const since = Math.max(15, Math.ceil((now - Date.parse(`${lastWeek.from}T00:00:00Z`)) / 86_400_000) + 1);
  const [replies, sent, activity] = await Promise.all([
    at.list(EMAILS, `OR(IS_AFTER({Latest Reply Time},DATEADD(NOW(),-${since},'days')),IS_AFTER({Meeting Booked At},DATEADD(NOW(),-${since},'days')),IS_AFTER({Date of Call Booked},DATEADD(NOW(),-${since},'days')))`,
      ['Lead Status', 'Latest Reply Time', 'Meeting Booked At', 'Date of Call Booked'], 5000, { byName: true }),
    at.list(EMAIL_ANALYTICS, `IS_AFTER({Date},DATEADD(TODAY(),-${since},'days'))`, [EAF.date, EAF.sent], 5000).catch(() => null),
    at.list(ACTIVITY, `IS_AFTER({When},DATEADD(NOW(),-1,'days'))`, ['Agent', 'Type', 'Event', 'When'], 1000, { byName: true }).catch(() => null),
  ]);
  const day = now - 86_400_000;
  return {
    replies: replies.map((r) => ({ status: v(r.fields['Lead Status']), repliedAt: v(r.fields['Latest Reply Time']), bookedAt: v(r.fields['Meeting Booked At']) || v(r.fields['Date of Call Booked']) })),
    sent: sent ? sent.map((r) => ({ date: v(r.fields[EAF.date]), sent: n(r.fields[EAF.sent]) })).filter((x) => x.date) : null,
    // The fake and some views ignore the formula: keep only the last 24 h here too.
    activity: activity ? activity.filter((r) => { const t = Date.parse(v(r.fields.When)); return !Number.isFinite(t) || t >= day; }).map((r) => ({ agent: v(r.fields.Agent), type: v(r.fields.Type), event: v(r.fields.Event) })) : null,
    readAt: new Date(now).toISOString(),
  };
}
let cache: { at: number; data: Promise<TodaySource> } | null = null;
export function _resetTodayCache() { cache = null; }
export function cachedToday(at: Pick<HqAirtable, 'list'>, now = Date.now()): Promise<TodaySource> {
  if (cache && now - cache.at < 60_000) return cache.data;
  const data = readTodaySource(at, now);
  cache = { at: now, data };
  data.catch(() => { if (cache?.data === data) cache = null; });
  return data;
}

/** The three Today blocks. A read that fails is named in `errors`; the rest still shows. */
export async function todayBlocks(at: HqAirtable | undefined, db: Db, visible: readonly AgentName[], now = Date.now()) {
  const errors: string[] = [];
  if (!at) return { campaigns: null, week: null, activity: null, errors: ['Airtable is not connected on this server'] };
  const [camps, src] = await Promise.all([
    cachedCampaigns(at, db, false, now).then((x) => campaignGroups(buildRows(x, now), x.readAt)).catch(() => { errors.push('Campaigns (Airtable)'); return null; }),
    cachedToday(at, now).catch(() => { errors.push('Replies and activity (Airtable)'); return null; }),
  ]);
  if (src && !src.activity) errors.push('Activity Log (Airtable)');
  return {
    campaigns: camps,
    week: src ? scorecard(src.replies, src.sent, now) : null,
    activity: src?.activity ? agentDay(src.activity, visible) : null,
    errors,
  };
}

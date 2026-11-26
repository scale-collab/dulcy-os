// The client portal (HQ Step 4; v2 2026-11-26: every Softr page at portal.dulcy.io, see
// hq/portal-softr-inventory.md). A client login (role client) sees ONLY its own client's rows:
//   Home ("is this working?"), Email / LinkedIn / AI caller results, campaigns (review, calendar),
//   leads and pipeline (call feedback, close a deal), meetings, tasks, onboarding, documents,
//   access & credentials, billing, notifications.
// v3 (2026-11-26): the same reads regrouped into 3 tabs (Home · Leads · Account); Home and the
// Leads list are each one read (/portal/home, /portal/pipeline).
// Isolation:
//   - The client comes from the session (user.clientRec) only, never from the URL or the query.
//   - The server's route guard (server.ts clientMayCall) sends every other route a 403.
//   - Airtable reads name their fields (no fee, revenue, draft, note or password field), are
//     batched and cached 60 seconds for everyone, then cut to the session's client (slice). A row
//     that points at two clients is nobody's.
//   - Rows are given to the browser under an opaque key (a hash), never an Airtable record ID; a
//     key is only ever looked up among the session's own rows (findMine).
//   - Credentials (Workspace IDs → Logins) and onboarding answers are read on demand for the one
//     client, never cached and never logged.
//   - Every answer is built field by field (an allow-list), never by copying a record.
import { createHash } from 'node:crypto';
import type { AirtableRecord } from '../providers/airtable.js';
import { EMAILS, EF, RA, val, wsRecordOf } from '../agents/emailsFields.js';
import { clientFrom } from '../agents/atlas.js';
import { CC } from '../agents/scribe.js';
import { groupWorkspaces } from './clients.js';
import { CAMPAIGNS_T, KF } from './campaigns.js';
import { WORKSPACES, XF, oneLine } from './inbox.js';
import type { HqAirtable } from './decisions.js';
import type { HqUser } from './auth.js';
import {
  CF, CFB, CX2, DEAL, DOC, EAO, INV, LAO, LIC, MEET, NOTE, ONBOARDING_EDITABLE, ONB_CLIENT, PERIODS, T, TASK, WS_LOGINS,
  CALL_STATUS, DEAL_TYPES, REVIEW_CHANGES, REVIEW_FEEDBACK, TARGETING_CHOICES,
} from './portalFields.js';

export const PORTAL_CACHE_MS = 60_000;
/** Leads and meetings go back this far. */
export const PORTAL_DAYS = 90;
/** The pipeline and call feedback go back this far. */
export const PIPELINE_DAYS = 365;
/** Bounce over 4% = we're fixing it; over 2.5% = we're watching it (RULES.md). Shown in words only. */
const LIMITS = { watch: 2.5, fix: 4 } as const;
const DAY = 86_400_000;
const INTERESTED = ['Interested', 'Meeting Request', 'Info Request', 'Information Request'];
const POSITIVE_INTENT = ['Interested', 'Meeting Request', 'Info Request'];
const BOOKED_STAGES = ['Booked Meeting', 'Completed Meeting', 'Closed Deal'];
export const PIPELINE_STAGES = ['New Interested', 'In Conversation', 'Booked Meeting', 'Completed Meeting', 'Closed Deal', 'Closed -- Not Moving Forward', 'Lost'] as const;

/** Only these Workspace IDs fields are read (by name: grouping, the name, channels, AI caller totals, onboarding). No money field. */
const WS_FIELDS = ['Name', 'Status', 'Client Type', 'Client', 'ID', 'Cold Email', 'LinkedIn', 'AI Employee', 'Direct Mail', 'Calls Made', 'Answered Calls', 'Interested Calls', 'Onboarding_form_submitted', 'Onboarding'];
/** Only these Campaigns fields are read. */
const C_FIELDS = [KF.name, KF.status, KF.stage, KF.client, KF.contacted, KF.sent, KF.replies, KF.interested, KF.booked, KF.bouncedPct, KF.startedAt, KF.completedAt, CX2.launch];
/** Only these Emails fields are read. No draft, policy, reasoning, history or note field. */
const E_FIELDS = [EF.leadName, EF.leadEmail, EF.company, EF.campaign, EF.latestReply, EF.latestReplyAt, EF.leadStatus, EF.stage, EF.workspace, EF.clientHandling, EF.dnc,
  RA.intent, RA.ownership, RA.clients, RA.wsRecord, XF.meetingBookedAt, XF.callBookedAt];

const n = (x: unknown): number => { const t = val(x); const v = Number(t); return t !== '' && Number.isFinite(v) ? v : 0; };
const txt = (x: unknown): string => (Array.isArray(x) ? x.map(txt).filter(Boolean).join(', ') : x === undefined || x === null ? '' : typeof x === 'object' ? String((x as any).name ?? '') : String(x)).trim();
const REC = /^rec[A-Za-z0-9]{14}$/;
const recIds = (x: unknown): string[] => (Array.isArray(x) ? x : x ? [x] : []).map((y: any) => (typeof y === 'string' ? y : y?.id)).filter((y): y is string => typeof y === 'string' && REC.test(y));
/** The key a portal row is given in the browser. Deterministic, not reversible, and only ever matched against the session's own rows. */
export const opaque = (id: string) => createHash('sha256').update(`portal:${id}`).digest('base64url').slice(0, 12);
export const KEY_RE = /^[A-Za-z0-9_-]{12}$/;

export function emailsFormula(days = PIPELINE_DAYS): string {
  const after = (f: string) => `IS_AFTER({${f}},DATEADD(NOW(),-${days},'days'))`;
  return `AND(OR(${after('Latest Reply Time')},${after('Meeting Booked At')},${after('Date of Call Booked')}),`
    + `OR(${INTERESTED.map((s) => `{Lead Status}='${s}'`).join(',')},{Pipeline Stage}!='',`
    + `{Meeting Booked At}!='',{Date of Call Booked}!='',{Client Handling},{Reply Ownership}='Handoff'))`;
}

export interface PortalSource {
  ws: AirtableRecord[]; campaigns: AirtableRecord[]; emails: AirtableRecord[]; readAt: string;
  /** Every campaign of every client (campaigns = the Active ones). */
  allCampaigns?: AirtableRecord[];
  tasks?: AirtableRecord[]; documents?: AirtableRecord[]; meetings?: AirtableRecord[]; invoices?: AirtableRecord[]; notifications?: AirtableRecord[];
  callFeedback?: AirtableRecord[]; deals?: AirtableRecord[]; emailOverview?: AirtableRecord[]; linkedinOverview?: AirtableRecord[]; linkedinCampaigns?: AirtableRecord[];
}

/** One retry on a busy Airtable (HTTP 429 / 5xx). */
async function retry<T>(f: () => Promise<T>): Promise<T> {
  try { return await f(); } catch (e) { if ((e as Error)?.name !== 'RetryableError' && !/Airtable: (HTTP|network)/.test(String((e as Error)?.message))) throw e; await new Promise((r) => setTimeout(r, 1100)); return f(); }
}

/** Batched reads for every client at once, in waves of 4 (Airtable allows 5 requests a second). */
export async function readPortalSource(at: Pick<HqAirtable, 'list'>): Promise<PortalSource> {
  const L = (table: string, formula: string, fields: string[], max: number, opts?: { byName?: boolean }) => retry(() => at.list(table, formula, fields, max, opts));
  const [ws, allCampaigns, emails, tasks] = await Promise.all([
    L(WORKSPACES, `{Name}!=''`, WS_FIELDS, 300, { byName: true }),
    L(CAMPAIGNS_T, `AND({Client}!='',OR({Campaign Status}!='',{Workflow Stage}!=''))`, C_FIELDS, 5000),
    L(EMAILS, emailsFormula(), E_FIELDS, 20000),
    L(T.tasks, `{Client}!=''`, Object.values(TASK), 3000),
  ]);
  const [documents, meetings, invoices, notifications] = await Promise.all([
    L(T.documents, `AND({Workspace IDs}!='',NOT({Internal?}))`, Object.values(DOC), 3000),
    L(T.meetings, `AND({Workspace IDs}!='',NOT({Hide}))`, Object.values(MEET), 3000),
    L(T.invoices, `AND({Client}!='',NOT({Hide}))`, Object.values(INV), 3000),
    L(T.notifications, `AND({Client}!='',NOT({Dismissed}))`, Object.values(NOTE), 3000),
  ]);
  const [callFeedback, deals, emailOverview, linkedinOverview] = await Promise.all([
    L(T.callFeedback, `IS_AFTER({Created},DATEADD(NOW(),-${PIPELINE_DAYS},'days'))`, Object.values(CF), 5000),
    L(T.closedDeals, `{lead}!=''`, Object.values(DEAL), 3000),
    L(T.emailOverview, `{Client}!=''`, Object.values(EAO), 3000),
    L(T.linkedinOverview, `{Client}!=''`, Object.values(LAO), 3000),
  ]);
  const linkedinCampaigns = await L(T.linkedinCampaigns, `{Campaign Name}!=''`, Object.values(LIC), 3000);
  // The formulas already filter; filtered again so a wider copy of the rows can never widen an answer.
  return {
    ws, allCampaigns, campaigns: allCampaigns.filter((c) => val(c.fields[KF.status]) === 'Active'), emails,
    tasks, documents: documents.filter((d) => d.fields[DOC.internal] !== true), meetings: meetings.filter((m) => m.fields[MEET.hide] !== true),
    invoices: invoices.filter((i) => i.fields[INV.hide] !== true), notifications: notifications.filter((x) => x.fields[NOTE.dismissed] !== true),
    callFeedback, deals, emailOverview, linkedinOverview, linkedinCampaigns, readAt: new Date().toISOString(),
  };
}

let cache: { at: number; data: Promise<PortalSource> } | null = null;
export function _resetPortalCache() { cache = null; }
/** After a client's own write, so the next read shows it. */
export const invalidatePortalCache = () => { cache = null; };
export function cachedPortalSource(at: Pick<HqAirtable, 'list'>, now = Date.now()): Promise<PortalSource> {
  if (cache && now - cache.at < PORTAL_CACHE_MS) return cache.data;
  const data = readPortalSource(at);
  cache = { at: now, data };
  data.catch(() => { if (cache?.data === data) cache = null; });
  return data;
}

/** Who owns what: each Workspace IDs record and each EmailBison workspace ID → its client group. */
interface Owners { groups: AirtableRecord[][]; byRec: Map<string, number>; byBison: Map<string, number> }
function owners(ws: AirtableRecord[]): Owners {
  const groups = groupWorkspaces(ws);
  const byRec = new Map<string, number>(); const byBison = new Map<string, number>();
  groups.forEach((g, i) => g.forEach((w) => { byRec.set(w.id, i); const b = val(w.fields.ID); if (b) byBison.set(b, i); }));
  return { groups, byRec, byBison };
}

/** The client's group from any of its records (null = not a client any more). Pure. */
export function groupOf(ws: AirtableRecord[], clientRec: string): AirtableRecord[] | null {
  return groupWorkspaces(ws).find((g) => g.some((w) => w.id === clientRec)) ?? null;
}
/** The client's name: the shortest name in the group without "(Internal)" (as clients.ts). Pure. */
export function groupName(g: AirtableRecord[]): string {
  const names = g.map((w) => val(w.fields.Name).replace(/\s*\(internal\)\s*$/i, '').trim()).filter(Boolean);
  return names.reduce((a, b) => (b.length < a.length ? b : a), names[0] ?? 'Your company');
}

/** Resolve the client a new client login is for (Users page): the group's main record and name. */
export async function resolvePortalClient(at: Pick<HqAirtable, 'list'>, rec: string): Promise<{ id: string; name: string } | null> {
  const g = groupOf((await cachedPortalSource(at)).ws, rec);
  return g ? { id: g[0].id, name: groupName(g) } : null;
}

export interface Mine {
  group: AirtableRecord[]; campaigns: AirtableRecord[]; allCampaigns: AirtableRecord[]; emails: AirtableRecord[];
  tasks: AirtableRecord[]; documents: AirtableRecord[]; meetings: AirtableRecord[]; invoices: AirtableRecord[]; notifications: AirtableRecord[];
  callFeedback: AirtableRecord[]; deals: AirtableRecord[]; emailOverview: AirtableRecord[]; linkedinOverview: AirtableRecord[]; linkedinCampaigns: AirtableRecord[];
}

/**
 * The part of the source that belongs to ONE client. A row counts only when every client it points
 * at is this one (an Emails row linked to client A with client B's EmailBison ID is nobody's). Pure.
 */
export function slice(src: PortalSource, clientRec: string): Mine | null {
  const o = owners(src.ws);
  const me = o.groups.findIndex((g) => g.some((w) => w.id === clientRec));
  if (me < 0) return null;
  const group = o.groups[me];
  const mineOnly = (marks: (number | undefined)[]) => { const set = new Set(marks.filter((x) => x !== undefined)); return set.size === 1 && set.has(me); };
  const byLink = (field: string) => (r: AirtableRecord) => { const ids = recIds(r.fields[field]); return ids.length > 0 && mineOnly(ids.map((id) => o.byRec.get(id) ?? -1)); };
  const allCampaigns = (src.allCampaigns ?? src.campaigns).filter(byLink(KF.client));
  const emails = src.emails.filter((e) => {
    const rec = wsRecordOf(e.fields); const bison = val(e.fields[EF.workspace]);
    const marks = [rec ? o.byRec.get(rec) ?? -1 : undefined, bison ? o.byBison.get(bison) ?? -1 : undefined];
    return mineOnly(marks);
  });
  // Feedback and deals hang off an Emails row: kept only when every lead they name is one of this client's rows.
  const myEmails = new Set(emails.map((e) => e.id));
  const byLead = (leadField: string, linkField: string) => (r: AirtableRecord) => {
    const ids = [...recIds(val(r.fields[leadField])), ...recIds(r.fields[linkField])];
    return ids.length > 0 && ids.every((id) => myEmails.has(id));
  };
  return {
    group, allCampaigns, campaigns: allCampaigns.filter((c) => val(c.fields[KF.status]) === 'Active'), emails,
    tasks: (src.tasks ?? []).filter(byLink(TASK.client)),
    documents: (src.documents ?? []).filter((d) => d.fields[DOC.internal] !== true).filter(byLink(DOC.client)),
    meetings: (src.meetings ?? []).filter((m) => m.fields[MEET.hide] !== true).filter(byLink(MEET.client)),
    invoices: (src.invoices ?? []).filter((i) => i.fields[INV.hide] !== true).filter(byLink(INV.client)),
    notifications: (src.notifications ?? []).filter((x) => x.fields[NOTE.dismissed] !== true).filter(byLink(NOTE.client)),
    callFeedback: (src.callFeedback ?? []).filter(byLead(CF.lead, CF.emails)),
    deals: (src.deals ?? []).filter(byLead(DEAL.lead, DEAL.emails)),
    emailOverview: (src.emailOverview ?? []).filter(byLink(EAO.client)),
    linkedinOverview: (src.linkedinOverview ?? []).filter(byLink(LAO.client)),
    linkedinCampaigns: (src.linkedinCampaigns ?? []).filter((r) => { const ids = recIds(txt(r.fields[LIC.clientRecs]).split(/\s*,\s*/)); return ids.length > 0 && mineOnly(ids.map((id) => o.byRec.get(id) ?? -1)); }),
  };
}

/** A row of this client's, by the key the browser holds (null when it is not this client's). Pure. */
export function findMine(rows: AirtableRecord[], key: string): AirtableRecord | null {
  if (!KEY_RE.test(key)) return null;
  return rows.find((r) => opaque(r.id) === key) ?? null;
}

const bookedAt = (f: Record<string, unknown>) => val(f[XF.meetingBookedAt]) || val(f[XF.callBookedAt]);
/**
 * The call has happened, so feedback is due: "Date of Call Booked" is the call's day (Airtable's Call
 * Feedback Sync writes a new date there), so the day after it; with only "Meeting Booked At" (the day
 * it was booked, not held: UNKNOWN when the call is), two days after booking.
 */
export const callHappened = (f: Record<string, unknown>, now: number) => {
  const callDay = val(f[XF.callBookedAt]).slice(0, 10);
  if (/^\d{4}-\d{2}-\d{2}$/.test(callDay)) return callDay < new Date(now).toISOString().slice(0, 10);
  const t = Date.parse(val(f[XF.meetingBookedAt]));
  return Number.isFinite(t) && t <= now - 2 * DAY;
};
const isBooked = (f: Record<string, unknown>) => BOOKED_STAGES.includes(val(f[EF.stage])) || !!bookedAt(f);
const isHanded = (f: Record<string, unknown>) => f[EF.clientHandling] === true || val(f[RA.ownership]) === 'Handoff';
const isPositive = (f: Record<string, unknown>) => INTERESTED.includes(val(f[EF.leadStatus])) || POSITIVE_INTENT.includes(val(f[RA.intent]));
const within = (iso: string, now: number, days: number) => { const t = Date.parse(iso); return Number.isFinite(t) && t >= now - days * DAY && t <= now + DAY; };
const recent = (iso: string, now: number) => within(iso, now, PORTAL_DAYS);
/** Shown to the client: booked, or a yes handed to them, or on the pipeline. Never a reply Echo is still working on. */
const visibleLead = (f: Record<string, unknown>) => f[EF.dnc] !== true && (isBooked(f) || (isHanded(f) && isPositive(f)) || (PIPELINE_STAGES as readonly string[]).includes(val(f[EF.stage])));

export type Deliverability = 'healthy' | 'watching' | 'fixing';
const deliverabilityOf = (bounce: number): Deliverability => (bounce > LIMITS.fix ? 'fixing' : bounce > LIMITS.watch ? 'watching' : 'healthy');
const plural = (k: number, one: string, many: string) => `${k} ${k === 1 ? one : many}`;
/** Bounce health in words. Pure. */
export function healthText(states: Deliverability[]): { status: Deliverability; text: string } {
  const fixing = states.filter((x) => x === 'fixing').length, watching = states.filter((x) => x === 'watching').length;
  if (fixing) return { status: 'fixing', text: `We're fixing deliverability on ${plural(fixing, 'campaign', 'campaigns')}.` };
  if (watching) return { status: 'watching', text: `Healthy. We're keeping a close eye on ${plural(watching, 'campaign', 'campaigns')}.` };
  return { status: 'healthy', text: 'Healthy. Your emails are reaching inboxes.' };
}

export interface PortalCampaign { name: string; sent: number; replies: number; interested: number; booked: number; deliverability: Deliverability }
export interface PortalOverview {
  client: { name: string };
  results: { interested7: number; interested30: number; booked7: number; booked30: number };
  campaigns: PortalCampaign[]; health: { status: Deliverability; text: string }; readAt: string;
}
export interface PortalLead { key: string; name: string; company: string; email: string; message: string; date: string; status: 'booked' | 'sent'; bookedOn: string }
export interface PortalMeeting { key: string; name: string; company: string; bookedOn: string }

function counts(mine: Mine, now: Date) {
  // The same counting as Atlas and the HQ Clients screen (clientFrom), on this client's rows only.
  const byName = mine.emails.map((e) => ({ ...e, fields: {
    'Workspace ID (Bison)': e.fields[EF.workspace], 'Lead Status': e.fields[EF.leadStatus], 'Latest Reply Time': e.fields[EF.latestReplyAt],
    'Meeting Booked At': e.fields[XF.meetingBookedAt], 'Date of Call Booked': e.fields[XF.callBookedAt],
  } }));
  return clientFrom(mine.group, { emails: byName, campaigns: [] }, now);
}
const liveCampaigns = (mine: Mine): PortalCampaign[] => mine.campaigns.map((x) => ({
  name: val(x.fields[KF.name]) || 'Campaign', sent: n(x.fields[KF.sent]), replies: n(x.fields[KF.replies]), interested: n(x.fields[KF.interested]), booked: n(x.fields[KF.booked]),
  deliverability: deliverabilityOf(n(x.fields[KF.bouncedPct])),
})).sort((a, b) => b.sent - a.sent || a.name.localeCompare(b.name));

/** Overview for one client. Pure (now passed in). */
export function buildOverview(src: PortalSource, clientRec: string, now = new Date()): PortalOverview | null {
  const mine = slice(src, clientRec);
  if (!mine) return null;
  const c = counts(mine, now);
  const campaigns = liveCampaigns(mine);
  return {
    client: { name: groupName(mine.group) },
    results: { interested7: c.interested7, interested30: c.interested30, booked7: c.booked7, booked30: c.booked30 },
    campaigns, health: healthText(campaigns.map((x) => x.deliverability)), readAt: src.readAt,
  };
}

/** Leads: positive replies handed to the client, or booked, in the last 90 days; newest first. Pure. */
export function buildLeads(src: PortalSource, clientRec: string, now = Date.now()): PortalLead[] | null {
  const mine = slice(src, clientRec);
  if (!mine) return null;
  return mine.emails.filter((e) => e.fields[EF.dnc] !== true && (isBooked(e.fields) || (isHanded(e.fields) && isPositive(e.fields))))
    .map((e): PortalLead => {
      const f = e.fields; const booked = isBooked(f);
      return {
        key: opaque(e.id), name: val(f[EF.leadName]) || 'Unknown name', company: val(f[EF.company]), email: val(f[EF.leadEmail]),
        message: oneLine(val(f[EF.latestReply]), 1200), date: val(f[EF.latestReplyAt]), status: booked ? 'booked' : 'sent', bookedOn: booked ? bookedAt(f) : '',
      };
    })
    .filter((l) => recent(l.bookedOn || l.date, now))
    .sort((a, b) => (b.bookedOn || b.date).localeCompare(a.bookedOn || a.date));
}

/** Meetings: booked in the last 90 days, newest first. Pure. */
export function buildMeetings(src: PortalSource, clientRec: string, now = Date.now()): PortalMeeting[] | null {
  const mine = slice(src, clientRec);
  if (!mine) return null;
  return mine.emails.filter((e) => e.fields[EF.dnc] !== true && bookedAt(e.fields) && recent(bookedAt(e.fields), now))
    .map((e) => ({ key: opaque(e.id), name: val(e.fields[EF.leadName]) || 'Unknown name', company: val(e.fields[EF.company]), bookedOn: bookedAt(e.fields) }))
    .sort((a, b) => b.bookedOn.localeCompare(a.bookedOn));
}

// ---------- v2 screens (pure builders on one client's slice) ----------
const files = (x: unknown) => (Array.isArray(x) ? x : []).map((a: any) => ({ name: String(a?.filename ?? 'File'), href: String(a?.url ?? '') })).filter((a) => /^https:\/\//.test(a.href));
const isoDay = (s: string) => (/^\d{4}-\d{2}-\d{2}/.test(s) ? s.slice(0, 10) : '');
const monthStart = (now: Date) => Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1);
const inMonth = (iso: string, now: Date) => { const t = Date.parse(iso); return Number.isFinite(t) && t >= monthStart(now) && t <= now.getTime() + DAY; };

export type CampaignState = 'review' | 'changes' | 'building' | 'live' | 'paused' | 'finished';
export const CAMPAIGN_STATE_LABEL: Record<CampaignState, string> = {
  review: 'Waiting for your review', changes: 'Updating with your feedback', building: 'Being prepared', live: 'Live', paused: 'Paused', finished: 'Finished',
};
export function campaignState(f: Record<string, unknown>): CampaignState {
  const st = val(f[KF.status]); const wf = val(f[KF.stage]);
  if (st === 'Active') return 'live';
  if (st === 'Completed') return 'finished';
  if (wf === 'Client Review') return 'review';
  if (wf === 'Changes Requested') return 'changes';
  if (st === 'Inactive') return 'paused';
  return 'building';
}

function campaignRow(c: AirtableRecord) {
  const f = c.fields; const state = campaignState(f);
  return {
    key: opaque(c.id), name: val(f[KF.name]) || 'Campaign', state, label: CAMPAIGN_STATE_LABEL[state],
    contacted: n(f[KF.contacted]), sent: n(f[KF.sent]), replies: n(f[KF.replies]), interested: n(f[KF.interested]), booked: n(f[KF.booked]),
    deliverability: state === 'live' ? deliverabilityOf(n(f[KF.bouncedPct])) : null,
    launch: isoDay(val(f[CX2.launch])), started: isoDay(val(f[KF.startedAt])), finished: isoDay(val(f[KF.completedAt])),
  };
}
const STATE_ORDER: CampaignState[] = ['review', 'live', 'changes', 'building', 'paused', 'finished'];
export function buildCampaigns(mine: Mine) {
  return mine.allCampaigns.map(campaignRow).sort((a, b) => STATE_ORDER.indexOf(a.state) - STATE_ORDER.indexOf(b.state) || b.sent - a.sent || a.name.localeCompare(b.name));
}

/** Campaign Calendar: what launched, launches and finished, by date. */
export function buildCalendar(mine: Mine) {
  const events: { key: string; name: string; what: 'launch' | 'started' | 'finished'; day: string; label: string }[] = [];
  for (const c of mine.allCampaigns.map(campaignRow)) {
    if (c.started) events.push({ key: c.key, name: c.name, what: 'started', day: c.started, label: 'Started sending' });
    else if (c.launch) events.push({ key: c.key, name: c.name, what: 'launch', day: c.launch, label: 'Planned launch' });
    if (c.finished) events.push({ key: c.key, name: c.name, what: 'finished', day: c.finished, label: 'Finished' });
  }
  return events.sort((a, b) => b.day.localeCompare(a.day));
}

function lastFeedbackOf(feedback: AirtableRecord[], emailId: string) {
  return feedback.filter((r) => [val(r.fields[CF.lead]), ...recIds(r.fields[CF.emails])].includes(emailId))
    .sort((a, b) => val(b.fields[CF.created]).localeCompare(val(a.fields[CF.created])))
    .map((r) => ({ key: opaque(r.id), status: val(r.fields[CF.status]), rating: n(r.fields[CF.rating]), comments: val(r.fields[CF.notes]), recording: /^https?:\/\//.test(val(r.fields[CF.link])) ? val(r.fields[CF.link]) : '', newDate: isoDay(val(r.fields[CF.newDate])), date: val(r.fields[CF.created]) }));
}
function dealOf(deals: AirtableRecord[], emailId: string) {
  const d = deals.filter((r) => [val(r.fields[DEAL.lead]), ...recIds(r.fields[DEAL.emails])].includes(emailId)).sort((a, b) => val(b.fields[DEAL.created]).localeCompare(val(a.fields[DEAL.created])))[0];
  return d ? { value: n(d.fields[DEAL.value]), day: isoDay(val(d.fields[DEAL.date])), type: val(d.fields[DEAL.type]), why: val(d.fields[DEAL.why]) } : null;
}
const stageOf = (f: Record<string, unknown>): string => {
  const s = val(f[EF.stage]);
  if ((PIPELINE_STAGES as readonly string[]).includes(s)) return s;
  return bookedAt(f) ? 'Booked Meeting' : 'New Interested';
};

/**
 * Pipeline: every lead shown to the client, by stage (the Softr kanban), last 12 months. v3
 * (2026-11-26): each row also carries the start of what they wrote, whether call feedback is due and
 * the last feedback's status and stars, so the Leads tab is one read (the same rows, nothing new shown).
 */
export function buildPipeline(mine: Mine, now = Date.now()) {
  // In the 12 months: booked or replied in them, or a call still to come ("Date of Call Booked" can be
  // the call's future day; v3 fix: such a lead used to drop out of the list until the day came).
  const inWindow = (f: Record<string, unknown>) => within(bookedAt(f), now, PIPELINE_DAYS) || within(val(f[EF.latestReplyAt]), now, PIPELINE_DAYS) || Date.parse(bookedAt(f)) > now;
  const rows = mine.emails.filter((e) => visibleLead(e.fields) && inWindow(e.fields)).map((e) => {
    const f = e.fields; const fb = lastFeedbackOf(mine.callFeedback, e.id); const booked = bookedAt(f);
    return {
      key: opaque(e.id), name: val(f[EF.leadName]) || 'Unknown name', company: val(f[EF.company]), stage: stageOf(f), date: val(f[EF.latestReplyAt]), bookedOn: booked,
      message: oneLine(val(f[EF.latestReply]), 280), feedback: fb.length > 0, deal: dealOf(mine.deals, e.id) !== null,
      feedbackDue: !!booked && callHappened(f, now) && recent(booked, now) && fb.length === 0, lastFeedback: fb[0] ? { status: fb[0].status, rating: fb[0].rating } : null,
    };
  }).sort((a, b) => (b.bookedOn || b.date).localeCompare(a.bookedOn || a.date));
  const stages = PIPELINE_STAGES.map((s) => ({ stage: s, leads: rows.filter((r) => r.stage === s) }));
  const won = mine.deals.map((d) => n(d.fields[DEAL.value]));
  return { stages, total: rows.length, deals: { count: won.length, value: won.reduce((a, b) => a + b, 0) } };
}

/** One lead (Lead Details Full): what they wrote, the stage, feedback given, the deal. */
export function buildLead(mine: Mine, key: string, now = Date.now()) {
  const e = findMine(mine.emails.filter((x) => visibleLead(x.fields)), key);
  if (!e) return null;
  const f = e.fields; const booked = bookedAt(f); const stage = stageOf(f);
  const past = booked ? callHappened(f, now) : false;
  return {
    key, name: val(f[EF.leadName]) || 'Unknown name', company: val(f[EF.company]), email: val(f[EF.leadEmail]), campaign: val(f[EF.campaign]),
    message: oneLine(val(f[EF.latestReply]), 3000), date: val(f[EF.latestReplyAt]), stage, bookedOn: booked,
    feedback: lastFeedbackOf(mine.callFeedback, e.id), deal: dealOf(mine.deals, e.id),
    canFeedback: !!booked || BOOKED_STAGES.includes(stage), feedbackDue: past && lastFeedbackOf(mine.callFeedback, e.id).length === 0,
    canCloseDeal: dealOf(mine.deals, e.id) === null,
  };
}

/** Call Feedback: booked calls that already happened with no feedback yet (90 days), and feedback given. */
export function buildFeedback(mine: Mine, now = Date.now()) {
  const missing = mine.emails.filter((e) => e.fields[EF.dnc] !== true && bookedAt(e.fields) && callHappened(e.fields, now) && recent(bookedAt(e.fields), now) && lastFeedbackOf(mine.callFeedback, e.id).length === 0)
    .map((e) => ({ key: opaque(e.id), name: val(e.fields[EF.leadName]) || 'Unknown name', company: val(e.fields[EF.company]), bookedOn: bookedAt(e.fields) }))
    .sort((a, b) => b.bookedOn.localeCompare(a.bookedOn));
  const byId = new Map(mine.emails.map((e) => [e.id, e]));
  const given = mine.callFeedback.map((r) => {
    const lead = [val(r.fields[CF.lead]), ...recIds(r.fields[CF.emails])].map((id) => byId.get(id)).find(Boolean);
    return { key: opaque(r.id), lead: lead ? opaque(lead.id) : '', name: lead ? val(lead.fields[EF.leadName]) || 'Unknown name' : 'A lead', company: lead ? val(lead.fields[EF.company]) : '', status: val(r.fields[CF.status]), rating: n(r.fields[CF.rating]), comments: val(r.fields[CF.notes]), date: val(r.fields[CF.created]) };
  }).sort((a, b) => b.date.localeCompare(a.date));
  return { missing, given, choices: CALL_STATUS };
}

export function buildTasks(mine: Mine) {
  const st = (s: string): 'open' | 'blocked' | 'done' => (s === 'Done' ? 'done' : s === 'Blocked' ? 'blocked' : 'open');
  const order = { open: 0, blocked: 1, done: 2 } as const;
  return mine.tasks.map((t) => ({ key: opaque(t.id), name: val(t.fields[TASK.name]) || 'Task', details: txt(t.fields[TASK.description]), stage: st(val(t.fields[TASK.stage])), updated: val(t.fields[TASK.modified]), files: files(t.fields[TASK.attachments]) }))
    .sort((a, b) => order[a.stage] - order[b.stage] || b.updated.localeCompare(a.updated));
}

export function buildDocuments(mine: Mine) {
  return mine.documents.map((d) => ({ key: opaque(d.id), title: val(d.fields[DOC.title]) || 'Document', details: txt(d.fields[DOC.description]), by: val(d.fields[DOC.uploadedBy]) === 'Client' ? 'you' as const : 'dulcy' as const, updated: val(d.fields[DOC.modified]), files: files(d.fields[DOC.attachments]) }))
    .sort((a, b) => b.updated.localeCompare(a.updated));
}

export function buildOurMeetings(mine: Mine, now = new Date()) {
  const today = now.toISOString().slice(0, 10);
  const rows = mine.meetings.map((m) => ({ key: opaque(m.id), title: val(m.fields[MEET.title]) || 'Meeting with Dulcy', summary: txt(m.fields[MEET.summary]), day: isoDay(val(m.fields[MEET.date])), recording: /^https:\/\//.test(val(m.fields[MEET.recording])) ? val(m.fields[MEET.recording]) : '' }));
  return { upcoming: rows.filter((r) => r.day && r.day >= today).sort((a, b) => a.day.localeCompare(b.day)), past: rows.filter((r) => !r.day || r.day < today).sort((a, b) => b.day.localeCompare(a.day)) };
}

const BILL_HIDDEN = ['Draft', 'Reserved', 'Needs Review', 'Uncertain'];
export function buildBilling(mine: Mine) {
  const plain = (f: Record<string, unknown>) => { const s = val(f[INV.status]); if (s === 'Paid') return 'Paid'; if (s === 'Awaiting Payment') return 'Due'; if (s === 'Voided') return 'Cancelled'; return val(f[INV.type]) === 'Unpaid' ? 'Unpaid' : 'Paid'; };
  return mine.invoices.filter((i) => !BILL_HIDDEN.includes(val(i.fields[INV.status])))
    .map((i) => ({ key: opaque(i.id), number: val(i.fields[INV.id]), amount: n(i.fields[INV.amount]), currency: val(i.fields[INV.currency]) || 'USD', day: isoDay(val(i.fields[INV.date])), state: plain(i.fields), from: isoDay(val(i.fields[INV.periodStart])), to: isoDay(val(i.fields[INV.periodEnd])) }))
    .sort((a, b) => b.day.localeCompare(a.day));
}

export function buildNotifications(mine: Mine) {
  return mine.notifications.map((x) => ({ key: opaque(x.id), title: val(x.fields[NOTE.title]) || 'Update', message: val(x.fields[NOTE.message]), kind: val(x.fields[NOTE.type]) || 'System', date: val(x.fields[NOTE.created]) }))
    .sort((a, b) => b.date.localeCompare(a.date));
}

const periodRows = (rows: AirtableRecord[], F: Record<string, string>, pick: (f: Record<string, unknown>) => Record<string, number>) =>
  PERIODS.map((p) => { const r = rows.find((x) => val(x.fields[F.period]) === p); return r ? { period: p, ...pick(r.fields), updated: val(r.fields[F.updated]) } : null; }).filter(Boolean);

export function buildEmailResults(mine: Mine) {
  const periods = periodRows(mine.emailOverview, EAO, (f) => ({ contacted: n(f[EAO.contacted]), sent: n(f[EAO.sent]), replies: n(f[EAO.replies]), interested: n(f[EAO.interested]), booked: n(f[EAO.booked]) }));
  const campaigns = buildCampaigns(mine).filter((c) => c.sent > 0 || c.state === 'live');
  const total = campaigns.reduce((a, c) => ({ contacted: a.contacted + c.contacted, sent: a.sent + c.sent, replies: a.replies + c.replies, interested: a.interested + c.interested, booked: a.booked + c.booked }), { contacted: 0, sent: 0, replies: 0, interested: 0, booked: 0 });
  const active = mine.group.some((w) => w.fields['Cold Email'] === true) || campaigns.length > 0 || periods.length > 0;
  return { active, periods, total, campaigns, health: healthText(liveCampaigns(mine).map((x) => x.deliverability)) };
}

export function buildLinkedin(mine: Mine) {
  const periods = periodRows(mine.linkedinOverview, LAO, (f) => ({ sent: n(f[LAO.sent]), accepted: n(f[LAO.accepted]), messages: n(f[LAO.messages]), replies: n(f[LAO.replies]), booked: n(f[LAO.booked]) }));
  const campaigns = mine.linkedinCampaigns.map((c) => ({ key: opaque(c.id), name: val(c.fields[LIC.name]) || 'LinkedIn campaign', status: val(c.fields[LIC.status]) || 'Drafted', leads: n(c.fields[LIC.leads]), sent: n(c.fields[LIC.sent]), accepted: n(c.fields[LIC.accepted]), replies: n(c.fields[LIC.replies]), booked: n(c.fields[LIC.booked]) }));
  const active = mine.group.some((w) => w.fields.LinkedIn === true) || campaigns.length > 0 || periods.some((p: any) => p.sent > 0);
  return { active, periods, campaigns };
}

export function buildAiCaller(mine: Mine) {
  const sum = (k: string) => mine.group.reduce((a, w) => a + n(w.fields[k]), 0);
  const calls = sum('Calls Made'), answered = sum('Answered Calls'), interested = sum('Interested Calls');
  return { active: mine.group.some((w) => w.fields['AI Employee'] === true) || calls > 0, calls, answered, interested };
}

/** Implementation Pathway: the steps the data can prove. */
export function buildPathway(mine: Mine) {
  const states = mine.allCampaigns.map((c) => campaignState(c.fields));
  const steps = [
    { step: 'Your portal is set up', done: true },
    { step: 'Onboarding form filled in', done: mine.group.some((w) => w.fields.Onboarding_form_submitted === true) },
    { step: 'First campaign ready for your review', done: states.some((s) => s !== 'building') },
    { step: 'First campaign live', done: states.some((s) => s === 'live' || s === 'finished' || s === 'paused') },
    { step: 'First meeting booked', done: mine.emails.some((e) => !!bookedAt(e.fields)) },
  ];
  return { steps, done: steps.filter((s) => s.done).length };
}

/**
 * What waits on the client (v3 Home "Needs you"): open tasks (Mark done), campaigns waiting for their
 * review, booked calls that happened with no feedback yet, and the onboarding form when it is linked
 * but not submitted yet (Workspace IDs Onboarding_form_submitted, as Getting started uses).
 */
export function needsOf(mine: Mine, now = new Date()) {
  const tasks = buildTasks(mine).filter((t) => t.stage !== 'done');
  const review = buildCampaigns(mine).filter((c) => c.state === 'review').map((c) => ({ key: c.key, name: c.name }));
  const feedback = buildFeedback(mine, now.getTime()).missing;
  const onboarding = mine.group.some((w) => recIds(w.fields.Onboarding).length > 0) && !mine.group.some((w) => w.fields.Onboarding_form_submitted === true);
  return { tasks, review, feedback, onboarding, count: tasks.length + review.length + feedback.length + (onboarding ? 1 : 0) };
}

/**
 * The last 30 days against the 30 days before, from the analytics rows Softr charted ("Last 30
 * days" and "Last 60 days": the 30 before = 60 minus 30). null when there is no "Last 30 days" row.
 */
function window30(rows: AirtableRecord[], F: Record<string, string>, pick: (f: Record<string, unknown>) => Record<string, number>) {
  const p30 = rows.find((r) => val(r.fields[F.period]) === 'Last 30 days');
  if (!p30) return null;
  const p60 = rows.find((r) => val(r.fields[F.period]) === 'Last 60 days');
  const now = pick(p30.fields);
  const before = p60 ? Object.fromEntries(Object.entries(pick(p60.fields)).map(([k, v]) => [k, Math.max(0, v - (now[k] ?? 0))])) : null;
  return { label: 'Last 30 days', now, before };
}
/** Home results for the channels that are on for this client only (an off channel is null, never an empty section). */
export function homeResults(mine: Mine) {
  const em = buildEmailResults(mine), li = buildLinkedin(mine), ai = buildAiCaller(mine);
  const emailPick = (f: Record<string, unknown>) => ({ sent: n(f[EAO.sent]), replies: n(f[EAO.replies]), interested: n(f[EAO.interested]), booked: n(f[EAO.booked]) });
  const liPick = (f: Record<string, unknown>) => ({ sent: n(f[LAO.sent]), accepted: n(f[LAO.accepted]), replies: n(f[LAO.replies]), booked: n(f[LAO.booked]) });
  const liTotal = li.campaigns.reduce((a, c) => ({ sent: a.sent + c.sent, accepted: a.accepted + c.accepted, replies: a.replies + c.replies, booked: a.booked + c.booked }), { sent: 0, accepted: 0, replies: 0, booked: 0 });
  return {
    email: em.active ? { ...(window30(mine.emailOverview, EAO, emailPick) ?? { label: 'All time', now: { sent: em.total.sent, replies: em.total.replies, interested: em.total.interested, booked: em.total.booked }, before: null }), health: em.health } : null,
    linkedin: li.active ? (window30(mine.linkedinOverview, LAO, liPick) ?? { label: 'All time', now: liTotal, before: null }) : null,
    aiCaller: ai.active ? { label: 'All time', calls: ai.calls, answered: ai.answered, interested: ai.interested } : null,
    directMail: mine.group.some((w) => w.fields['Direct Mail'] === true),
  };
}

/** Home: "is this working?" in five seconds. */
export function buildHome(mine: Mine, user: HqUser, now = new Date()) {
  const month = mine.emails.filter((e) => e.fields[EF.dnc] !== true);
  const interested = month.filter((e) => isPositive(e.fields) && inMonth(val(e.fields[EF.latestReplyAt]), now)).length;
  const booked = month.filter((e) => inMonth(bookedAt(e.fields), now)).length;
  const live = mine.campaigns.length;
  const last30 = mine.emailOverview.find((r) => val(r.fields[EAO.period]) === 'Last 30 days');
  const sent30 = last30 ? n(last30.fields[EAO.sent]) : mine.campaigns.reduce((a, c) => a + n(c.fields[KF.sent]), 0);
  const verdict = booked > 0 ? `Yes. ${plural(booked, 'meeting', 'meetings')} booked for you this month.`
    : interested > 0 ? `${plural(interested, 'interested reply', 'interested replies')} this month. Meetings come next.`
      : live > 0 ? `Your ${live === 1 ? 'campaign is' : `${live} campaigns are`} live. New replies show up here as soon as they come in.`
        : 'Your first campaign is being prepared.';
  const our = buildOurMeetings(mine, now);
  const latestProspect = mine.emails.filter((e) => bookedAt(e.fields) && e.fields[EF.dnc] !== true).sort((a, b) => bookedAt(b.fields).localeCompare(bookedAt(a.fields)))[0];
  const tasks = buildTasks(mine).filter((t) => t.stage !== 'done');
  const review = mine.allCampaigns.filter((c) => campaignState(c.fields) === 'review').length;
  const feedback = buildFeedback(mine, now.getTime()).missing.length;
  return {
    hello: user.name, client: groupName(mine.group), verdict,
    month: { interested, booked, live, sent30 },
    next: our.upcoming[0] ? { title: our.upcoming[0].title, day: our.upcoming[0].day } : null,
    lastBooked: latestProspect ? { key: opaque(latestProspect.id), name: val(latestProspect.fields[EF.leadName]) || 'Unknown name', company: val(latestProspect.fields[EF.company]), bookedOn: bookedAt(latestProspect.fields) } : null,
    tasks: { open: tasks.length, top: tasks.slice(0, 3).map((t) => ({ key: t.key, name: t.name, stage: t.stage })) },
    todo: { review, feedback, unread: mine.notifications.length },
    health: healthText(liveCampaigns(mine).map((x) => x.deliverability)),
    // v3 (2026-11-26): the one-scroll Home reads everything it shows from this one answer.
    needs: needsOf(mine, now),
    results: homeResults(mine),
    campaigns: buildCampaigns(mine).filter((c) => c.state !== 'finished').map((c) => ({ key: c.key, name: c.name, state: c.state, label: c.label, sent: c.sent, replies: c.replies, interested: c.interested, booked: c.booked })),
    finishedCampaigns: buildCampaigns(mine).filter((c) => c.state === 'finished').length,
  };
}

export interface PortalLinks { meeting: string; esp: string; partnership: string }
/** The shell: client name, which channels to show as active, outside links, badge counts. */
export function buildSession(mine: Mine, user: HqUser, go: PortalLinks, now = new Date()) {
  return {
    user: { email: user.email, name: user.name, role: 'client' as const }, client: { name: groupName(mine.group) },
    channels: { email: buildEmailResults(mine).active, linkedin: buildLinkedin(mine).active, aiCaller: buildAiCaller(mine).active, directMail: mine.group.some((w) => w.fields['Direct Mail'] === true) },
    go, badges: { unread: mine.notifications.length, tasks: buildTasks(mine).filter((t) => t.stage === 'open').length, review: mine.allCampaigns.filter((c) => campaignState(c.fields) === 'review').length, feedback: buildFeedback(mine, now.getTime()).missing.length, needs: needsOf(mine, now).count },
  };
}

// ---------- on demand (one client, never cached) ----------
const TARGETING = [{ k: 'industries', id: CX2.industries, label: 'Industries' }, { k: 'geo', id: CX2.geo, label: 'Locations' }, { k: 'size', id: CX2.size, label: 'Company size' }, { k: 'titles', id: CX2.titles, label: 'Job titles' }] as const;
/** One campaign: the plan (thesis, targeting), the emails for review, the numbers, the client's last answer. */
export async function campaignDetail(at: Pick<HqAirtable, 'get'>, mine: Mine, key: string) {
  const c = findMine(mine.allCampaigns, key);
  if (!c) return null;
  const fields = [CX2.thesis, CX2.approach, ...TARGETING.map((t) => t.id), ...CC.review.flatMap((r) => [r.subject, r.body]), CC.clientFeedback, CC.selectChanges, CC.reviewFeedback, CC.additionalContext];
  const d = (await at.get(CAMPAIGNS_T, c.id, fields))?.fields ?? {};
  const row = campaignRow(c);
  return {
    ...row, approach: val(d[CX2.approach]), thesis: txt(d[CX2.thesis]),
    targeting: TARGETING.map((t) => ({ what: t.label, value: txt(d[t.id]) })).filter((t) => t.value),
    emails: CC.review.map((r, i) => ({ step: i + 1, subject: val(d[r.subject]), body: txt(d[r.body]) })).filter((e) => e.subject || e.body),
    answer: { feedback: txt(d[CC.clientFeedback]), changes: txt(d[CC.selectChanges]), comments: txt(d[CC.reviewFeedback]), context: txt(d[CC.additionalContext]) },
    canReview: row.state === 'review',
    choices: { feedback: REVIEW_FEEDBACK, changes: REVIEW_CHANGES, targeting: TARGETING_CHOICES },
  };
}

/** Access & Credentials: the Logins text of this client's own Workspace IDs records. Never cached, never logged. */
export async function accessDetail(at: Pick<HqAirtable, 'get'>, mine: Mine) {
  const blocks: { label: string; text: string }[] = [];
  for (const w of mine.group) {
    const r = await at.get(WORKSPACES, w.id, [WS_LOGINS]);
    const text = txt(r?.fields[WS_LOGINS]);
    if (text) blocks.push({ label: val(w.fields.Name), text });
  }
  return { blocks: blocks.length > 1 ? blocks : blocks.map((b) => ({ ...b, label: '' })) };
}

/** The client's Onboarding record: linked from its Workspace IDs, and linked back to this client only. */
export async function onboardingRecord(at: Pick<HqAirtable, 'get'>, mine: Mine): Promise<AirtableRecord | null> {
  const groupIds = new Set(mine.group.map((w) => w.id));
  for (const id of mine.group.flatMap((w) => recIds(w.fields.Onboarding))) {
    const r = await at.get(T.onboarding, id, [ONB_CLIENT, ...ONBOARDING_EDITABLE.map((f) => f.id)]);
    const back = recIds(r?.fields[ONB_CLIENT]);
    if (r && back.length > 0 && back.every((x) => groupIds.has(x))) return r;
  }
  return null;
}
export async function onboardingDetail(at: Pick<HqAirtable, 'get'>, mine: Mine) {
  const r = await onboardingRecord(at, mine);
  return {
    ready: !!r,
    fields: ONBOARDING_EDITABLE.map((f) => ({ key: f.key, label: f.label, kind: f.kind, group: f.group, choices: f.choices ?? [], value: r ? txt(r.fields[f.id]) : '' })),
  };
}

const NOT_SET_UP = { status: 404, body: { error: 'Your account is not linked to a client yet. Please contact your Dulcy team.' } };
const WORDS = ['me', 'overview', 'leads', 'meetings', 'session', 'home', 'email', 'linkedin', 'ai-caller', 'campaigns', 'campaign', 'calendar', 'pipeline', 'lead', 'feedback', 'tasks', 'documents', 'our-meetings', 'billing', 'notifications', 'access', 'onboarding', 'pathway'];
const KEYED = new Set(['campaign', 'lead']);

/**
 * GET /hq/api/portal/<word>[/<key>] for a client session. The client is user.clientRec (from the
 * session); nothing in the path or query can change it. Returns the status and the body to send.
 */
export async function portalRoute(at: Pick<HqAirtable, 'list' | 'get'>, user: HqUser, sub: string, links: PortalLinks = { meeting: '', esp: '', partnership: '' }): Promise<{ status: number; body: unknown }> {
  if (user.role !== 'client' || !user.clientRec) return { status: 403, body: { error: 'The portal is for client logins.' } };
  const rec = user.clientRec;
  const [, word = '', key = ''] = sub.split('/');
  if (!WORDS.includes(word) || (KEYED.has(word) ? !KEY_RE.test(key) : key !== '') || sub.split('/').length > 3) return { status: 404, body: { error: 'not found' } };
  const src = await cachedPortalSource(at);
  if (word === 'me') {
    const g = groupOf(src.ws, rec);
    return g ? { status: 200, body: { user: { email: user.email, name: user.name, role: 'client' as const }, client: { name: groupName(g) } } } : NOT_SET_UP;
  }
  if (word === 'overview') { const o = buildOverview(src, rec); return o ? { status: 200, body: o } : NOT_SET_UP; }
  if (word === 'leads') { const l = buildLeads(src, rec); return l ? { status: 200, body: { leads: l, days: PORTAL_DAYS, readAt: src.readAt } } : NOT_SET_UP; }
  if (word === 'meetings') { const m = buildMeetings(src, rec); return m ? { status: 200, body: { meetings: m, days: PORTAL_DAYS, readAt: src.readAt } } : NOT_SET_UP; }
  const mine = slice(src, rec);
  if (!mine) return NOT_SET_UP;
  const ok = (body: unknown) => ({ status: 200, body });
  const gone = { status: 404, body: { error: 'That is not in your portal (any more).' } };
  switch (word) {
    case 'session': return ok(buildSession(mine, user, links));
    case 'home': return ok({ ...buildHome(mine, user), readAt: src.readAt });
    case 'email': return ok({ ...buildEmailResults(mine), readAt: src.readAt });
    case 'linkedin': return ok({ ...buildLinkedin(mine), readAt: src.readAt });
    case 'ai-caller': return ok({ ...buildAiCaller(mine), readAt: src.readAt });
    case 'campaigns': return ok({ campaigns: buildCampaigns(mine), readAt: src.readAt });
    case 'campaign': { const d = await campaignDetail(at, mine, key); return d ? ok(d) : gone; }
    case 'calendar': return ok({ events: buildCalendar(mine), readAt: src.readAt });
    case 'pipeline': return ok({ ...buildPipeline(mine), readAt: src.readAt });
    case 'lead': { const l = buildLead(mine, key); return l ? ok({ ...l, choices: { status: CALL_STATUS, deal: DEAL_TYPES } }) : gone; }
    case 'feedback': return ok({ ...buildFeedback(mine), readAt: src.readAt });
    case 'tasks': return ok({ tasks: buildTasks(mine), readAt: src.readAt });
    case 'documents': return ok({ documents: buildDocuments(mine), readAt: src.readAt });
    case 'our-meetings': return ok({ ...buildOurMeetings(mine), readAt: src.readAt });
    case 'billing': return ok({ items: buildBilling(mine), readAt: src.readAt });
    case 'notifications': return ok({ items: buildNotifications(mine), readAt: src.readAt });
    case 'access': return ok(await accessDetail(at, mine));
    case 'onboarding': return ok(await onboardingDetail(at, mine));
    case 'pathway': return ok(buildPathway(mine));
  }
  return { status: 404, body: { error: 'not found' } };
}

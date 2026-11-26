// HQ Step 4: the client portal (2026-11-26). A client login (role client) sees ONLY its own results:
//   - Overview: interested and booked replies (7 and 30 days, the same count as Atlas and the HQ
//     Clients screen), live campaigns (sent / replies / interested / booked) and deliverability in
//     plain words ("healthy" / "we're fixing deliverability on 1 campaign"). No bounce numbers or flags.
//   - Leads: positive replies handed to the client or booked: name, company, email, the prospect's
//     message and the date. Never Echo's drafts, the AI reasoning, the replier's notes or the thread.
//   - Meetings: booked meetings (the day each was booked: no meeting time is stored).
// Isolation:
//   - The client comes from the session (user.clientRec) only, never from the URL or the query.
//   - The server's route guard (server.ts clientMayCall) sends every other route a 403.
//   - Airtable reads ask only for the fields shown here (no fee, revenue, draft or note field is
//     read at all), are batched and cached 60 seconds for everyone, and are filtered here by the
//     session's client with clients.ts's grouping. A row that points at two clients is left out.
//   - Every answer is built field by field (an allow-list), never by copying a record.
// No writes: nothing here calls Airtable's create/update or any other service.
import { createHash } from 'node:crypto';
import type { AirtableRecord } from '../providers/airtable.js';
import { EMAILS, EF, RA, val, wsRecordOf } from '../agents/emailsFields.js';
import { clientFrom } from '../agents/atlas.js';
import { groupWorkspaces } from './clients.js';
import { CAMPAIGNS_T, KF } from './campaigns.js';
import { WORKSPACES, XF, oneLine } from './inbox.js';
import type { HqAirtable } from './decisions.js';
import type { HqUser } from './auth.js';

export const PORTAL_CACHE_MS = 60_000;
/** Leads and meetings go back this far. */
export const PORTAL_DAYS = 90;
/** Bounce over 4% = we're fixing it; over 2.5% = we're watching it (RULES.md). Shown in words only. */
const LIMITS = { watch: 2.5, fix: 4 } as const;
const DAY = 86_400_000;
const INTERESTED = ['Interested', 'Meeting Request', 'Info Request', 'Information Request'];
const POSITIVE_INTENT = ['Interested', 'Meeting Request', 'Info Request'];
const BOOKED_STAGES = ['Booked Meeting', 'Completed Meeting', 'Closed Deal'];

/** Only these Workspace IDs fields are read (grouping and the name). No money field. */
const WS_FIELDS = ['Name', 'Status', 'Client Type', 'Client', 'ID'];
/** Only these Campaigns fields are read. */
const C_FIELDS = [KF.name, KF.status, KF.client, KF.sent, KF.replies, KF.interested, KF.booked, KF.bouncedPct];
/** Only these Emails fields are read. No draft, policy, reasoning, history or note field. */
const E_FIELDS = [EF.leadName, EF.leadEmail, EF.company, EF.latestReply, EF.latestReplyAt, EF.leadStatus, EF.stage, EF.workspace, EF.clientHandling, EF.dnc,
  RA.intent, RA.ownership, RA.clients, RA.wsRecord, XF.meetingBookedAt, XF.callBookedAt];

const n = (x: unknown): number => { const t = val(x); const v = Number(t); return t !== '' && Number.isFinite(v) ? v : 0; };
const recIds = (x: unknown): string[] => (Array.isArray(x) ? x : x ? [x] : []).map((y: any) => (typeof y === 'string' ? y : y?.id)).filter((y): y is string => typeof y === 'string' && /^rec[A-Za-z0-9]{14}$/.test(y));
const opaque = (id: string) => createHash('sha256').update(`portal:${id}`).digest('base64url').slice(0, 12);

export function emailsFormula(days = PORTAL_DAYS): string {
  const after = (f: string) => `IS_AFTER({${f}},DATEADD(NOW(),-${days},'days'))`;
  return `AND(OR(${after('Latest Reply Time')},${after('Meeting Booked At')},${after('Date of Call Booked')}),`
    + `OR(${INTERESTED.map((s) => `{Lead Status}='${s}'`).join(',')},${BOOKED_STAGES.map((s) => `{Pipeline Stage}='${s}'`).join(',')},`
    + `{Meeting Booked At}!='',{Date of Call Booked}!='',{Client Handling},{Reply Ownership}='Handoff'))`;
}

export interface PortalSource { ws: AirtableRecord[]; campaigns: AirtableRecord[]; emails: AirtableRecord[]; readAt: string }

/** Three batched reads (Workspace IDs, active Campaigns, recent positive Emails), for every client at once. */
export async function readPortalSource(at: Pick<HqAirtable, 'list'>): Promise<PortalSource> {
  const [ws, campaigns, emails] = await Promise.all([
    at.list(WORKSPACES, `{Name}!=''`, WS_FIELDS, 300, { byName: true }),
    at.list(CAMPAIGNS_T, `{Campaign Status}='Active'`, C_FIELDS, 3000),
    at.list(EMAILS, emailsFormula(), E_FIELDS, 20000),
  ]);
  // The formulas already filter; filtered again so a wider copy of the rows can never widen an answer.
  return { ws, campaigns: campaigns.filter((c) => val(c.fields[KF.status]) === 'Active'), emails, readAt: new Date().toISOString() };
}

let cache: { at: number; data: Promise<PortalSource> } | null = null;
export function _resetPortalCache() { cache = null; }
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

/**
 * The part of the source that belongs to ONE client. A row counts only when every client it points
 * at is this one (an Emails row linked to client A with client B's EmailBison ID is nobody's). Pure.
 */
export function slice(src: PortalSource, clientRec: string) {
  const o = owners(src.ws);
  const me = o.groups.findIndex((g) => g.some((w) => w.id === clientRec));
  if (me < 0) return null;
  const group = o.groups[me];
  const mineOnly = (marks: (number | undefined)[]) => { const set = new Set(marks.filter((x) => x !== undefined)); return set.size === 1 && set.has(me); };
  const campaigns = src.campaigns.filter((c) => { const ids = recIds(c.fields[KF.client]); return ids.length > 0 && mineOnly(ids.map((id) => o.byRec.get(id) ?? -1)); });
  const emails = src.emails.filter((e) => {
    const rec = wsRecordOf(e.fields); const bison = val(e.fields[EF.workspace]);
    const marks = [rec ? o.byRec.get(rec) ?? -1 : undefined, bison ? o.byBison.get(bison) ?? -1 : undefined];
    return mineOnly(marks);
  });
  return { group, campaigns, emails };
}

const bookedAt = (f: Record<string, unknown>) => val(f[XF.meetingBookedAt]) || val(f[XF.callBookedAt]);
const isBooked = (f: Record<string, unknown>) => BOOKED_STAGES.includes(val(f[EF.stage])) || !!bookedAt(f);
const isHanded = (f: Record<string, unknown>) => f[EF.clientHandling] === true || val(f[RA.ownership]) === 'Handoff';
const isPositive = (f: Record<string, unknown>) => INTERESTED.includes(val(f[EF.leadStatus])) || POSITIVE_INTENT.includes(val(f[RA.intent]));
const recent = (iso: string, now: number) => { const t = Date.parse(iso); return Number.isFinite(t) && t >= now - PORTAL_DAYS * DAY && t <= now + DAY; };

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

/** Overview for one client. Pure (now passed in). */
export function buildOverview(src: PortalSource, clientRec: string, now = new Date()): PortalOverview | null {
  const mine = slice(src, clientRec);
  if (!mine) return null;
  // The same counting as Atlas and the HQ Clients screen (clientFrom), on this client's rows only.
  const byName = mine.emails.map((e) => ({ ...e, fields: {
    'Workspace ID (Bison)': e.fields[EF.workspace], 'Lead Status': e.fields[EF.leadStatus], 'Latest Reply Time': e.fields[EF.latestReplyAt],
    'Meeting Booked At': e.fields[XF.meetingBookedAt], 'Date of Call Booked': e.fields[XF.callBookedAt],
  } }));
  const c = clientFrom(mine.group, { emails: byName, campaigns: [] }, now);
  const campaigns: PortalCampaign[] = mine.campaigns.map((x) => ({
    name: val(x.fields[KF.name]) || 'Campaign', sent: n(x.fields[KF.sent]), replies: n(x.fields[KF.replies]), interested: n(x.fields[KF.interested]), booked: n(x.fields[KF.booked]),
    deliverability: deliverabilityOf(n(x.fields[KF.bouncedPct])),
  })).sort((a, b) => b.sent - a.sent || a.name.localeCompare(b.name));
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

const NOT_SET_UP = { status: 404, body: { error: 'Your account is not linked to a client yet. Please contact your Dulcy team.' } };

/**
 * GET /hq/api/portal/<sub> for a client session. The client is user.clientRec (from the session);
 * nothing in the path or query can change it. Returns the status and the body to send.
 */
export async function portalRoute(at: Pick<HqAirtable, 'list'>, user: HqUser, sub: string): Promise<{ status: number; body: unknown }> {
  if (user.role !== 'client' || !user.clientRec) return { status: 403, body: { error: 'The portal is for client logins.' } };
  const rec = user.clientRec;
  const me = { email: user.email, name: user.name, role: 'client' as const };
  if (!['/me', '/overview', '/leads', '/meetings'].includes(sub)) return { status: 404, body: { error: 'not found' } };
  const src = await cachedPortalSource(at);
  if (sub === '/me') {
    const g = groupOf(src.ws, rec);
    return g ? { status: 200, body: { user: me, client: { name: groupName(g) } } } : NOT_SET_UP;
  }
  if (sub === '/overview') { const o = buildOverview(src, rec); return o ? { status: 200, body: o } : NOT_SET_UP; }
  if (sub === '/leads') { const l = buildLeads(src, rec); return l ? { status: 200, body: { leads: l, days: PORTAL_DAYS, readAt: src.readAt } } : NOT_SET_UP; }
  const m = buildMeetings(src, rec);
  return m ? { status: 200, body: { meetings: m, days: PORTAL_DAYS, readAt: src.readAt } } : NOT_SET_UP;
}

// HQ Inbox (Step 3, 2026-11-25): every reply thread for every client in one place, read from the
// Airtable Emails table. HQ only reads, and presses the same Emails-row buttons the Reply Queue and
// the Decisions reply card press (Human Action Approve Draft / Send Edited Reply + Custom Reply /
// Skip). The engine's reply sender does the sending; Echo's drafting is untouched.
//   Tabs: To approve (State Needs Approval, follow-ups included) · Waiting on prospect (we wrote
//   last, a follow-up is Scheduled) · Booked · Handed to client (Client Handling / Reply Ownership
//   Handoff) · Skipped. One Airtable read for everyone, kept 60 seconds.
import type { AirtableRecord } from '../providers/airtable.js';
import { EMAILS, EF, RA, val, wsRecordOf } from '../agents/emailsFields.js';
import { DECISIONS, DF } from '../decisions/fields.js';
import { shortClient } from '../agents/ada.js';
import { clientKey } from './clients.js';
import { decide, replyButtons, type HqAirtable, type Verdict } from './decisions.js';
import { bookingOf, bookedLine } from '../agents/booking.js';
import { buildTimeline, stepCopies, type StepCopy, type ThreadMsg } from './thread.js';
import type { Db } from '../db/pool.js';

export const WORKSPACES = 'tblcjRBGJEWh5KgOt';
/** Emails fields only the Inbox reads (kept here so Echo's own read lists stay as they are). */
export const XF = { meetingBookedAt: 'fld7kOIDWTVycZtdA', callBookedAt: 'fldTFmYUnIXPxgJQS' } as const;
export const TABS = ['approve', 'waiting', 'booked', 'handed', 'skipped'] as const;
export type InboxTab = (typeof TABS)[number];
export const INBOX_CACHE_MS = 60_000;
export const PAGE_SIZE = 50;
const BOOKED = ['Booked Meeting', 'Completed Meeting', 'Closed Deal'];

const READ = [...new Set([EF.leadEmail, EF.leadName, EF.company, EF.subject, EF.latestReply, EF.latestReplyAt, EF.lastSent, EF.leadStatus, EF.stage,
  EF.workspace, EF.campaign, EF.replyUuid, EF.clientHandling, EF.dnc, RA.state, RA.intent, RA.draft, RA.policy, RA.humanAction, RA.wsRecord, RA.clients,
  RA.ownership, RA.seanReason, RA.seanInput, RA.dueAt, RA.followupType, RA.sentAt, RA.updatedAt, RA.lastError, XF.meetingBookedAt, XF.callBookedAt])];

/** The rows any tab can show (bounded: booked 60 days, handed and skipped 30 days). */
export function inboxFormula(): string {
  const recent = (d: number) => `IS_AFTER({Latest Reply Time},DATEADD(NOW(),-${d},'days'))`;
  return `OR({Dulcy Reply Agent State}='Needs Approval',`
    + `AND({Dulcy Reply Agent State}='Scheduled',{Last Email Sent}='Last Email Sent By Dulcy'),`
    + `AND(OR(${BOOKED.map((s) => `{Pipeline Stage}='${s}'`).join(',')},{Meeting Booked At}!=''),OR(${recent(60)},IS_AFTER({Meeting Booked At},DATEADD(NOW(),-60,'days')))),`
    + `AND(OR({Client Handling},{Reply Ownership}='Handoff'),${recent(30)}),`
    + `AND({Dulcy Reply Agent State}='Skipped',${recent(30)}))`;
}

/** Which tab a thread belongs to (null = none). To approve wins; then booked, handed, skipped, waiting. Pure. */
export function tabOf(f: Record<string, unknown>): InboxTab | null {
  const state = val(f[RA.state]);
  if (state === 'Needs Approval') return 'approve';
  if (BOOKED.includes(val(f[EF.stage])) || val(f[XF.meetingBookedAt])) return 'booked';
  if (f[EF.clientHandling] === true || val(f[RA.ownership]) === 'Handoff') return 'handed';
  if (state === 'Skipped') return 'skipped';
  if (state === 'Scheduled' && val(f[EF.lastSent]) === 'Last Email Sent By Dulcy') return 'waiting';
  return null;
}

export function policyOf(f: Record<string, unknown>): Record<string, any> {
  try { const j = JSON.parse(val(f[RA.policy]) || '{}'); return j && typeof j === 'object' ? j : {}; } catch { return {}; }
}

/** One line of what the prospect said: no markdown links, no quoted history, no extra spaces. Pure. */
export function oneLine(text: string, max = 160): string {
  const body = String(text ?? '').replace(/\r\n/g, '\n').split(/\n(?:On\s[^\n]+(?:\n[^\n]*)?wrote:|[>│]|-{3,}\s*Original Message)/)[0];
  const t = body.replace(/\[([^\]]+)\]\((?:https?:\/\/|mailto:)[^)]*\)/g, '$1').replace(/<mailto:[^>]*>/g, '').replace(/\s+/g, ' ').trim();
  return t.length > max ? `${t.slice(0, max - 1).trimEnd()}…` : t;
}

/** Booking links in a draft (a calendar link instead of two times, RULES 2026-11-25). Pure. */
const BOOKING_RE = /https?:\/\/[^\s)>\]"']*(?:calendly\.com|cal\.com|hubspot\.com\/meetings|meetings[^\s/]*\.hubspot\.com|leadconnectorhq\.com\/widget\/booking|savvycal\.com|zcal\.co|tidycal\.com|acuityscheduling\.com|youcanbook\.me|calendar\.app\.google|calendar\.google\.com\/calendar\/appointments)[^\s)>\]"']*/gi;
export function bookingLinks(draft: string, savedLink = ''): string[] {
  const found = new Set((String(draft ?? '').match(BOOKING_RE) ?? []).map((u) => u.replace(/[.,;:!?]+$/, '')));
  const link = savedLink.trim().replace(/\/+$/, '');
  if (link && /^https?:\/\//.test(link) && String(draft ?? '').includes(link)) found.add(link);
  return [...found];
}

/** Specific times written in a draft: "Tue, Dec 1 at 2:00 PM", "Wed 10am", "Thursday at 3:30pm ET". */
const TIME_RE = /\b(?:mon|tue|wed|thu|fri|sat|sun)[a-z]*\.?,?\s+(?:[a-z]{3,9}\.?\s+\d{1,2},?\s+)?(?:at\s+)?\d{1,2}(?::\d{2})?\s*(?:am|pm|a\.m\.|p\.m\.)/gi;

/** How many distinct specific times a draft offers (the calendar's own times count first). Pure. */
export function timesInDraft(draft: string, offered: string[] = []): number {
  const text = String(draft ?? '');
  const lower = text.toLowerCase().replace(/\s+/g, ' ');
  const hits = new Set<string>();
  for (const t of offered) {
    const core = String(t).toLowerCase().replace(/\s+(?:e[sd]t|c[sd]t|m[sd]t|p[sd]t|et|ct|mt|pt|utc|gmt)$/, '').replace(/\s+/g, ' ').trim();
    if (core && lower.includes(core)) hits.add(core);
  }
  for (const m of text.match(TIME_RE) ?? []) hits.add(m.toLowerCase().replace(/\s+/g, ' '));
  return hits.size;
}

export interface LinkDraft {
  /** The booking link(s) in the draft. */
  links: string[];
  /** Specific times the draft offers (0 or 1: under two). */
  times: number;
  /** The client's calendar gave Echo no open times when it drafted. */
  noTimesThen: boolean;
  /** The prospect asked for a link themselves (then a link is allowed: RULES 2026-11-25). */
  askedForLink: boolean;
}

/**
 * A pending draft that offers a booking link and fewer than two specific times (null = fine). Pure.
 * draft: the Echo draft. policy: the row's Reply Agent policy JSON. prospect: what they wrote.
 */
export function linkDraftOf(draft: string, policy: Record<string, any>, prospect = ''): LinkDraft | null {
  const links = bookingLinks(draft, String(policy?.calendarEvidence?.link ?? ''));
  if (!links.length) return null;
  const offered: string[] = Array.isArray(policy?.calendarEvidence?.times) ? policy.calendarEvidence.times.map(String) : [];
  const times = timesInDraft(draft, offered);
  if (times >= 2) return null;
  const said = `${String(policy?.they_said ?? '')}\n${String(prospect ?? '').split(/\nOn\s[^\n]+wrote:/)[0]}`;
  return { links, times, noTimesThen: offered.length < 2, askedForLink: /\b(?:booking|calendar|calendly|scheduling|meeting)\s+link\b|\blink to (?:book|your calendar|schedule)\b|\bbooking page\b/i.test(said) };
}

export interface InboxRow {
  id: string; tab: InboxTab | null; prospect: string; email: string; company: string; client: string; clientKey: string; wsRec: string;
  intent: string; at: string; theySaid: string; followup: number; followupType: string; nextFollowUp: string | null; bookedAt: string;
  state: string; pressed: string; error: string; bookingLink: boolean; gap: boolean;
  /** Echo booked it: "Booked: Wed Dec 3, 5:00 PM ET (Google Meet)" and the event / meeting link ('' = none). */
  bookedLine: string; bookedUrl: string;
  /** Echo will book this on approve: "Wed Dec 3, 5:00 PM ET" ('' = no booking on this draft). */
  booksAt: string;
  /** A reply to the prospect or one of Echo's follow-ups. */
  kind: 'reply' | 'followup';
  /** The last email in the thread is ours (Last Email Sent By Dulcy). */
  lastSentByUs: boolean;
  /** A pending draft that offers a booking link instead of two specific times (null = fine). */
  linkDraft: LinkDraft | null;
}
export interface Note { problem: string; data: string; fix: string }

export interface WorkspaceName { rec: Map<string, string>; bison: Map<string, string> }
export async function workspaceNames(at: Pick<HqAirtable, 'list'>): Promise<WorkspaceName> {
  const ws = await at.list(WORKSPACES, `{Name}!=''`, ['ID', 'Name'], 300, { byName: true }).catch(() => [] as AirtableRecord[]);
  return { rec: new Map(ws.map((w) => [w.id, val(w.fields.Name)])), bison: new Map(ws.filter((w) => val(w.fields.ID)).map((w) => [val(w.fields.ID), val(w.fields.Name)])) };
}

/** One Emails row → an Inbox row (null = not in any tab). Pure. */
export function toRow(r: AirtableRecord, names: WorkspaceName, any = false): InboxRow | null {
  const f = r.fields;
  const tab = tabOf(f);
  if (!tab && !any) return null;
  const p = policyOf(f);
  const wsRec = wsRecordOf(f);
  const wsName = names.rec.get(wsRec) || names.bison.get(val(f[EF.workspace])) || '';
  const draft = val(f[RA.draft]);
  const kind = p.kind === 'followup';
  const booking = bookingOf(p);
  return {
    id: r.id, tab, prospect: val(f[EF.leadName]) || val(f[EF.leadEmail]) || 'Unknown prospect', email: val(f[EF.leadEmail]), company: val(f[EF.company]),
    client: wsName ? shortClient(wsName) : (val(f[EF.workspace]) ? `Workspace ${val(f[EF.workspace])}` : 'UNKNOWN client'), clientKey: wsName ? clientKey(wsName) : '', wsRec,
    intent: val(f[RA.intent]) || val(f[EF.leadStatus]), at: val(f[EF.latestReplyAt]),
    theySaid: oneLine(String(p.they_said ?? '') || val(f[EF.latestReply])),
    followup: kind ? Number(p.followupNumber) || 1 : 0, followupType: kind ? String(p.followupType ?? '') : '',
    nextFollowUp: tab === 'waiting' ? val(f[RA.dueAt]) || null : null,
    bookedAt: val(f[XF.meetingBookedAt]) || val(f[XF.callBookedAt]),
    state: val(f[RA.state]), pressed: ['', 'None'].includes(val(f[RA.humanAction])) ? '' : val(f[RA.humanAction]), error: val(f[RA.lastError]),
    bookingLink: tab === 'approve' && bookingLinks(draft, String(p.calendarEvidence?.link ?? '')).length > 0, gap: /\[GAP|\{\{/.test(draft),
    bookedLine: bookedLine(booking), bookedUrl: booking?.status === 'booked' ? String(booking.meetLink || booking.htmlLink || '') : '',
    booksAt: booking?.status === 'pending' ? booking.label : '',
    kind: kind ? 'followup' : 'reply', lastSentByUs: val(f[EF.lastSent]) === 'Last Email Sent By Dulcy',
    linkDraft: tab === 'approve' ? linkDraftOf(draft, p, val(f[EF.latestReply])) : null,
  };
}

const SORT: Record<InboxTab, (a: InboxRow, b: InboxRow) => number> = {
  approve: (a, b) => b.at.localeCompare(a.at),
  waiting: (a, b) => String(a.nextFollowUp ?? '9').localeCompare(String(b.nextFollowUp ?? '9')),
  booked: (a, b) => (b.bookedAt || b.at).localeCompare(a.bookedAt || a.at),
  handed: (a, b) => b.at.localeCompare(a.at),
  skipped: (a, b) => b.at.localeCompare(a.at),
};

interface Source { rows: InboxRow[]; readAt: string }
let cache: { at: number; data: Promise<Source> } | null = null;
export function _resetInboxCache() { cache = null; }
export function cachedInbox(at: HqAirtable, refresh = false, now = Date.now()): Promise<Source> {
  if (cache && now - cache.at < (refresh ? 10_000 : INBOX_CACHE_MS)) return cache.data;
  const data = (async () => {
    const [recs, names] = await Promise.all([at.list(EMAILS, inboxFormula(), READ, 3000), workspaceNames(at)]);
    return { rows: recs.map((r) => toRow(r, names)).filter((x): x is InboxRow => !!x), readAt: new Date().toISOString() };
  })();
  cache = { at: now, data };
  data.catch(() => { if (cache?.data === data) cache = null; });
  return data;
}

/** The notes above a tab, Problem → Data → Fix. Pure. */
export function inboxNotes(tab: InboxTab, rows: InboxRow[], now = Date.now()): Note[] {
  const out: Note[] = [];
  if (tab !== 'approve') return out;
  const failed = rows.filter((r) => r.error && !r.pressed);
  if (failed.length) out.push({ problem: `${failed.length} repl${failed.length === 1 ? 'y was' : 'ies were'} not sent`, data: `Last error: "${failed[0].error.slice(0, 120)}" (${failed[0].prospect}, ${failed[0].client})`, fix: 'Open it, fix the draft, then Send again.' });
  const links = rows.filter((r) => r.bookingLink);
  if (links.length) {
    const by = [...links.reduce((m, r) => m.set(r.client, (m.get(r.client) ?? 0) + 1), new Map<string, number>())].sort((a, b) => b[1] - a[1]);
    out.push({ problem: `${links.length} of ${rows.length} draft${rows.length === 1 ? '' : 's'} offer a booking link, not two times`, data: by.slice(0, 3).map(([c, n]) => `${c} ${n}`).join(', '), fix: 'Edit in two times before sending, or connect that client\'s calendar (client → AI replier → Calendar).' });
  }
  const old = rows.filter((r) => r.at && now - Date.parse(r.at) > 7 * 86_400_000).sort((a, b) => a.at.localeCompare(b.at));
  if (old.length) out.push({ problem: `${old.length} draft${old.length === 1 ? ' is' : 's are'} over a week old`, data: `Oldest: ${Math.floor((now - Date.parse(old[0].at)) / 86_400_000)} days (${old[0].prospect}, ${old[0].client})`, fix: 'Send or skip them today; the longer they wait, the colder they get.' });
  return out;
}

/** GET /inbox: one tab, optional client filter and search, 50 a page, counts per tab and per client. */
export async function listInbox(at: HqAirtable, q: { tab?: string; client?: string; page?: number; q?: string; refresh?: boolean }) {
  const src = await cachedInbox(at, q.refresh);
  const tab: InboxTab = (TABS as readonly string[]).includes(q.tab ?? '') ? (q.tab as InboxTab) : 'approve';
  const client = String(q.client ?? '').trim();
  const needle = String(q.q ?? '').trim().toLowerCase().slice(0, 100);
  const forClient = src.rows.filter((r) => !client || r.clientKey === client);
  const counts = Object.fromEntries(TABS.map((t) => [t, forClient.filter((r) => r.tab === t).length])) as Record<InboxTab, number>;
  const inTab = src.rows.filter((r) => r.tab === tab);
  const clients = [...inTab.reduce((m, r) => { if (r.clientKey) { const c = m.get(r.clientKey) ?? { key: r.clientKey, name: r.client, count: 0 }; c.count++; m.set(r.clientKey, c); } return m; }, new Map<string, { key: string; name: string; count: number }>()).values()]
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
  const rows = forClient.filter((r) => r.tab === tab && (!needle || `${r.prospect} ${r.email} ${r.company} ${r.theySaid}`.toLowerCase().includes(needle))).sort(SORT[tab]);
  const pages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const page = Math.min(pages, Math.max(1, Math.floor(Number(q.page) || 1)));
  // Every client with a thread here, for the "Replier settings" links (#/clients/<workspace>/replier).
  const replierClients = [...src.rows.reduce((m, r) => { if (r.clientKey && r.wsRec && !m.has(r.clientKey)) m.set(r.clientKey, { key: r.clientKey, name: r.client, wsRec: r.wsRec }); return m; }, new Map<string, { key: string; name: string; wsRec: string }>()).values()]
    .sort((a, b) => a.name.localeCompare(b.name));
  const linkDrafts = forClient.filter((r) => r.tab === 'approve' && r.linkDraft).length;
  return { tab, client, rows: rows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE), total: rows.length, page, pages, counts, clients, replierClients, linkDrafts, notes: inboxNotes(tab, rows), readAt: src.readAt };
}

// ---------- Echo live (Alex 2026-11-27: "Echo watched live") ----------
const LIVE_ACTION: Record<string, 'drafted' | 'needInput' | 'noReply' | 'leftToClient' | 'other'> = {
  reply: 'drafted', ask_alex: 'needInput', skip: 'noReply', client_off: 'leftToClient', complete: 'noReply', answered: 'other',
};
/**
 * What Echo did in the last hour, read only: drafts written (from Echo's own run log, sean_drafts),
 * the ones waiting for approval now, and Echo's last runs. No names of money, nothing written.
 */
export async function echoLive(at: HqAirtable, db: Db, now = Date.now()) {
  const sinceIso = new Date(now - 3_600_000).toISOString();
  const [done, runs, src] = await Promise.all([
    db.query(`SELECT email_record, reply_at, action, reason, created_at FROM sean_drafts WHERE created_at > $1 ORDER BY created_at DESC LIMIT 200`, [sinceIso]),
    db.query(`SELECT DISTINCT ON (kind) id, kind, status, dry_run, result, error, created_at, updated_at FROM jobs WHERE kind IN ('sean.draft','sean.followup') ORDER BY kind, id DESC`),
    cachedInbox(at).catch(() => null),
  ]);
  const byId = new Map((src?.rows ?? []).map((r) => [r.id, r]));
  const counts = { drafted: 0, needInput: 0, noReply: 0, leftToClient: 0, other: 0, dryRun: 0, redone: 0 };
  for (const d of done.rows) {
    if (d.action === 'dry_run') { counts.dryRun++; continue; }
    counts[LIVE_ACTION[String(d.action)] ?? 'other']++;
    if (String(d.reply_at).startsWith('redo:')) counts.redone++;
  }
  const waiting = (src?.rows ?? []).filter((r) => r.tab === 'approve' && !r.pressed);
  const recent = done.rows.filter((d) => d.action !== 'dry_run').slice(0, 8).map((d) => {
    const r = byId.get(String(d.email_record));
    return {
      id: String(d.email_record), at: new Date(d.created_at).toISOString(), action: String(d.action), kind: String(d.reply_at).startsWith('followup:') ? 'followup' : String(d.reply_at).startsWith('redo:') ? 'redo' : 'reply',
      prospect: r?.prospect ?? '', client: r?.client ?? '', waiting: !!r && r.tab === 'approve' && !r.pressed, reason: String(d.reason ?? '').slice(0, 160),
    };
  });
  const lastRuns = runs.rows.map((j) => ({
    kind: String(j.kind) === 'sean.followup' ? 'Follow-ups' : 'Replies', status: String(j.status), dryRun: j.dry_run === true,
    at: new Date(j.updated_at).toISOString(), message: String(j.result?.message ?? j.error ?? '').slice(0, 200),
  }));
  return {
    since: sinceIso, counts, waiting: waiting.length,
    waitingOldest: waiting.reduce((o, r) => (!o || (r.at && r.at < o) ? r.at : o), '') || null,
    recent, lastRuns, readAt: new Date(now).toISOString(),
  };
}

// ---------- Thread ----------
export interface Msg { who: 'them' | 'us' | 'unknown'; head: string; body: string; quoted: string }
const QUOTE_START = /^(?:On\s[^\n]+(?:\n[^\n]*)?wrote:|[>│]|-{3,}\s*Original Message|_{8,}\s*$|From:\s.+\nSent:\s)/m;

/** The Emails "Conversation History" text → messages, latest first; quoted history split off. Pure. */
export function parseHistory(history: string): Msg[] {
  const text = String(history ?? '').replace(/\r\n/g, '\n').trim();
  if (!text) return [];
  let blocks = text.split(/\n*[▃━─=]{6,}\n*/);
  if (blocks.length === 1) blocks = text.split(/\n(?=[^\n]{1,200}\s·\s(?:Received|Sent)\b[^\n]*\n)/);
  const out: Msg[] = [];
  for (const raw of blocks) {
    let b = raw.trim();
    if (!b) continue;
    let who: Msg['who'] = 'unknown', head = '';
    const label = /^(Reply|Received|Prospect|SENT|Sent|Our reply|Dulcy)\s*:\s*\n?/i.exec(b);
    const line = /^([^\n]{1,200})\s·\s(Received|Sent)\b([^\n]*)\n/.exec(b);
    if (label) { who = /^(reply|received|prospect)$/i.test(label[1]) ? 'them' : 'us'; head = who === 'them' ? 'Prospect' : 'Us'; b = b.slice(label[0].length).trim(); }
    else if (line) { who = line[2] === 'Received' ? 'them' : 'us'; head = `${line[1].trim()} · ${line[2]}${line[3]}`.trim(); b = b.slice(line[0].length).trim(); }
    if (!b) continue;
    const m = QUOTE_START.exec(b);
    const body = (m ? b.slice(0, m.index) : b).trim(), quoted = m ? b.slice(m.index).trim() : '';
    if (!body && !quoted) continue;
    out.push({ who, head, body: body.slice(0, 6000), quoted: quoted.slice(0, 6000) });
  }
  return out.reverse();
}

const same = (a: string, b: string) => a.replace(/\s+/g, ' ').trim() === b.replace(/\s+/g, ' ').trim();
const PENDING = ['New', 'Waiting'];

/** The pending Echo decision for this Emails row, if any. */
export async function linkedDecision(at: Pick<HqAirtable, 'list'>, emailRec: string) {
  const rows = await at.list(DECISIONS, `AND({Emails Record}='${emailRec}',OR({Status}='New',{Status}='Waiting'))`, [DF.emailsRecord, DF.status, DF.action, DF.agent], 10);
  return rows.filter((d) => val(d.fields[DF.emailsRecord]) === emailRec && PENDING.includes(val(d.fields[DF.status])))
    .map((d) => ({ id: d.id, isReply: val(d.fields[DF.action]) === 'Approve Reply' }))[0] ?? null;
}

/** The Campaigns table: each campaign's step copy (to label our cold emails Email 1 / 2 / 3). */
export const CAMPAIGNS = 'tblAVAA6uBPaMj28P';
const copyCache = new Map<string, { at: number; data: Promise<StepCopy[]> }>();
export function _resetCopyCache() { copyCache.clear(); }
/** An Airtable formula string literal (double quotes; backslash and quote escaped). Pure. */
export const formulaString = (s: string) => `"${String(s).split('\\').join('\\\\').split('"').join('\\"')}"`;
/** The step copy of the campaign with this exact name ([] = none found). Kept 10 minutes. */
export function campaignCopies(at: Pick<HqAirtable, 'list'>, name: string, now = Date.now()): Promise<StepCopy[]> {
  const n = String(name ?? '').trim();
  if (!n) return Promise.resolve([]);
  const hit = copyCache.get(n);
  if (hit && now - hit.at < 600_000) return hit.data;
  const data = at.list(CAMPAIGNS, `{Name}=${formulaString(n)}`, [], 3, { byName: true })
    .then((rs) => { const r = rs.find((x) => val(x.fields.Name) === n); return r ? stepCopies(r.fields) : []; });
  if (copyCache.size > 200) copyCache.clear();
  copyCache.set(n, { at: now, data });
  data.catch(() => copyCache.delete(n));
  return data;
}

export async function threadDetail(at: HqAirtable, id: string) {
  if (!/^rec[A-Za-z0-9]{14}$/.test(id)) return null;
  const [r, names] = await Promise.all([at.get(EMAILS, id, [...READ, EF.history, RA.customReply]), workspaceNames(at)]);
  if (!r) return null;
  const f = r.fields;
  const row = toRow(r, names, true)!;
  const p = policyOf(f);
  const draft = val(f[RA.draft]);
  const latest = val(f[EF.latestReply]).trim();
  const copies = await campaignCopies(at, val(f[EF.campaign])).catch(() => [] as StepCopy[]);
  const timeline: ThreadMsg[] = buildTimeline(val(f[EF.history]), { prospectEmail: val(f[EF.leadEmail]), latest, latestAt: val(f[EF.latestReplyAt]), copies });
  const messages = parseHistory(val(f[EF.history]));
  const first = messages.findIndex((m) => same(m.body, oneLine(latest, 100000)) || same(`${m.body}\n${m.quoted}`, latest) || same(m.body, latest));
  if (first >= 0 && latest) messages.splice(first, 1);
  const decision = await linkedDecision(at, id).catch(() => null);
  const times: string[] = Array.isArray(p.calendarEvidence?.times) ? p.calendarEvidence.times.map(String).filter(Boolean) : [];
  const links = bookingLinks(draft, String(p.calendarEvidence?.link ?? ''));
  const canAct = val(f[RA.state]) === 'Needs Approval' && ['', 'None'].includes(val(f[RA.humanAction]));
  const uuid = val(f[EF.replyUuid]);
  const notes: Note[] = [];
  if (val(f[RA.lastError]) && canAct) notes.push({ problem: 'Not sent last time', data: val(f[RA.lastError]).slice(0, 300), fix: 'Fix the draft below, then Send edited.' });
  if (links.length && canAct) notes.push({ problem: 'Booking link instead of two times', data: `${links[0].replace(/^https?:\/\//, '').slice(0, 60)}${times.length ? '' : ' · no open times were read from the client\'s calendar'}`, fix: 'Replace it with two specific times (RULES 2026-11-25), or send as is if the prospect asked for a link.' });
  if (/\[GAP|\{\{/.test(draft) && canAct) notes.push({ problem: 'The draft has a gap', data: (/\[GAP[^\]]*\]/.exec(draft)?.[0] ?? 'a {{placeholder}}').slice(0, 200), fix: 'Fill it in and press Send edited (the sender refuses a [GAP]).' });
  const booking = bookingOf(p);
  if (booking?.status === 'pending' && canAct) notes.push({ problem: `Send = book ${booking.label}, then send this`, data: 'The time was open on the client\'s calendar when Echo drafted it; it is checked again right before booking.', fix: 'If it is gone by then, nothing is booked or sent and a draft with two other times comes back.' });
  if (['taken', 'failed'].includes(String(booking?.status)) && booking?.error && canAct && !val(f[RA.lastError])) notes.push({ problem: `${booking.label} was not booked`, data: booking.error.slice(0, 300), fix: 'The draft below replaces the confirmation; send it or edit it.' });
  if (!canAct && val(f[RA.state]) === 'Needs Approval') notes.push({ problem: 'Already pressed', data: `Human Action is "${val(f[RA.humanAction])}"`, fix: 'The engine sender picks it up within a minute; nothing to do.' });
  return {
    row, subject: val(f[EF.subject]), campaign: val(f[EF.campaign]), latest, messages, timeline, stepsFromCopy: copies.length > 0, draft, reason: val(f[RA.seanReason]) || String(p.reason ?? ''),
    question: val(f[RA.seanInput]) || String(p.question_for_alex ?? ''), offeredTimes: times, bookingLinks: links,
    threadUrl: uuid ? `https://send.dulcy.io/inbox?reply_uuid=${encodeURIComponent(uuid)}` : '',
    decisionId: decision?.id ?? '', canAct, canEdit: canAct, sentAt: val(f[RA.sentAt]), dueAt: val(f[RA.dueAt]), notes,
  };
}

/**
 * Send / Send edited / Skip from the Inbox: exactly the Decisions reply card's writes. With a pending
 * Echo decision → decide() itself (Emails buttons first, then the decision). Without one → only the
 * Emails buttons (what the Airtable Reply Queue presses). A "need your input" decision (no Approve
 * Reply action) gets the Emails buttons and is then marked the same way decide() marks any decision.
 */
export async function actOnThread(at: HqAirtable, id: string, verdict: Verdict, by: string, owner: boolean, text?: string): Promise<{ status: number; error?: string; result?: string }> {
  if (!/^rec[A-Za-z0-9]{14}$/.test(id)) return { status: 400, error: 'not a thread id' };
  const r = await at.get(EMAILS, id, [RA.state, RA.humanAction, RA.draft]);
  if (!r) return { status: 404, error: 'thread not found' };
  const state = val(r.fields[RA.state]), pressed = val(r.fields[RA.humanAction]);
  if (state !== 'Needs Approval') return { status: 409, error: `already ${state || 'handled'}` };
  if (!['', 'None'].includes(pressed)) return { status: 409, error: `already pressed: ${pressed}` };
  let edited = verdict === 'edited' ? String(text ?? '').replace(/\r\n/g, '\n').trim() : '';
  if (verdict === 'edited') {
    if (!edited || edited.length > 20_000) return { status: 400, error: 'the edited reply is empty or too long' };
    if (edited === val(r.fields[RA.draft]).trim()) { verdict = 'approve'; edited = ''; }
  }
  const d = await linkedDecision(at, id);
  let out: { status: number; error?: string; result?: string };
  if (d?.isReply) out = await decide(at, d.id, verdict, by, { canSeeMoney: owner, editedText: verdict === 'edited' ? edited : undefined });
  else {
    await at.update(EMAILS, id, replyButtons(verdict, edited));
    out = d ? await decide(at, d.id, verdict === 'reject' ? 'reject' : 'approve', by, { canSeeMoney: owner }) : { status: 200, result: verdict === 'reject' ? 'Rejected' : 'Approved' };
    if (out.status === 200 && verdict === 'edited') out.result = 'Approved (edited)';
  }
  if (out.status === 200) markPressed(id, verdict === 'reject' ? 'Skip' : verdict === 'edited' ? 'Send Edited Reply' : 'Approve Draft');
  return out;
}

/** Keep the cached list in step with a press, so the row shows "Sending…" / "Skipping…" at once. */
function markPressed(id: string, action: string) {
  cache?.data.then((s) => { const row = s.rows.find((x) => x.id === id); if (row) { row.pressed = action; row.error = ''; } }).catch(() => undefined);
}

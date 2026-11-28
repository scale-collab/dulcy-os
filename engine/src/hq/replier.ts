// HQ client hub → AI replier (2026-11-25): one client's Reply Agent settings row (Airtable "Dulcy
// Reply Agent Settings"), the same fields settings.ts parseSettings reads for Echo. Owner edits,
// members read. Every save writes only the changed fields (typecast) and is logged (who, when, what).
// The JSON settings (routing, CC/BCC, follow-up plan, templates, calendar) are shown read only.
// "Get calendar link" asks the calendar service for a one-time connect link (never sends email).
import { randomBytes } from 'node:crypto';
import type { Db } from '../db/pool.js';
import type { Config } from '../config.js';
import type { AirtableRecord } from '../providers/airtable.js';
import { SETTINGS, val } from '../agents/emailsFields.js';
import { parseSettings } from '../agents/settings.js';
import { allSteps } from '../agents/followupPlan.js';
import { groupWorkspaces } from './clients.js';
import { WORKSPACES, type Note } from './inbox.js';
import type { HqAirtable } from './decisions.js';

/** Field IDs of the settings row (checked 2026-11-25 with the Airtable schema). */
export const SF = {
  wsKey: 'fld54W6mFFiyDS2GL', wsName: 'fldO6QhPz8ReIGBxw', wsRec: 'fldBh0ugOqXpBy1I1', lastUpdated: 'fld9G7zuALIFo1vQa',
  enabled: 'fldqI3VcgPUeWI60H', handoff: 'fldssDmUzMyi4RahX', replyTypes: 'flddSM1kupkCo49or', defaultMode: 'fldIIkTotAvrqi7WF', oooMode: 'fldcba1likLIMjkea',
  minConfidence: 'fld7Bjd2KnCjOtGIK', maxAuto: 'fldnsRZgKXVv5NhRO', alwaysReview: 'fldmU2ih3L1NRprfm', nudge: 'fldYkwrmUogVgsI2N',
  tone: 'fldSz9CysyrPqN2rA', length: 'fldmCrXWamoNOs17W', firstName: 'fldwMzNcUDioaFW5C', lastName: 'fldVnDq9NJxl82dXZ',
  companyName: 'fldT97k4Feagaun6X', companyUrl: 'fldeGz32IZ7B3nVk8', context: 'fldKu9AF0RuVTXJ5H', followupInstructions: 'fldO50bAy4bBYiacE',
  calendarLink: 'fldK1cx8ZEqC5Xsff', timezone: 'fldcBBsXcarCHKoI8', officeStart: 'fldQ4e50wL9lea4Cx', officeEnd: 'fldzgbnlcTlN4tQje',
  noWeekends: 'fldnXSFQCpdMnba7D', noHolidays: 'fldIzZ9lIwNHTyiig',
  calProvider: 'fldUajoXDZicmMJRt', calStatus: 'fldwRUzLewRqsUAti', calJson: 'fldpfjITDZ7QlfKDw', calRequest: 'fldVSFHdZqjipZdpW', calResult: 'fldKKuVzaRvoAFv7e',
  routing: 'flduImNf3CFEgqddR', ccBcc: 'fld6IMBSfPS5VSTBy', plan: 'fldr6fdz5OSC1AaK2', response: 'fld7ACUDscpAqBAmQ', objective: 'fldiQFAdqLnTTUClT', knowledge: 'fldZorQ63FO9Y6zTC',
} as const;

/** Airtable field names (what parseSettings reads), for the save log and the name-keyed parse. */
const NAMES: Record<keyof typeof SF, string> = {
  wsKey: 'Workspace Key', wsName: 'Workspace Name', wsRec: 'Workspace Record ID', lastUpdated: 'Last Updated',
  enabled: 'Enabled', handoff: 'Reply Handoff Mode', replyTypes: 'Enabled Reply Types', defaultMode: 'Default Mode', oooMode: 'OOO Mode',
  minConfidence: 'Minimum Auto Confidence', maxAuto: 'Max Automatic Replies', alwaysReview: 'Always Require Human Review', nudge: 'Not Interested Nudge',
  tone: 'Response Tone', length: 'Response Length', firstName: 'Agent First Name', lastName: 'Agent Last Name',
  companyName: 'Company Name', companyUrl: 'Company URL', context: 'Company Context Override', followupInstructions: 'Follow-up Instructions',
  calendarLink: 'Calendar Link', timezone: 'Timezone', officeStart: 'Office Start', officeEnd: 'Office End', noWeekends: 'Exclude Weekends', noHolidays: 'Exclude US Holidays',
  calProvider: 'Calendar Provider', calStatus: 'Calendar Connection Status', calJson: 'Calendar Settings JSON', calRequest: 'Calendar Connection Request JSON', calResult: 'Calendar Connection Result JSON',
  routing: 'Routing Settings JSON', ccBcc: 'CC BCC Settings JSON', plan: 'Follow-up Plan JSON', response: 'Response Settings JSON', objective: 'Objective Settings JSON', knowledge: 'Knowledge Base JSON',
};

export const REPLY_TYPES = ['Interested', 'Info Request', 'Meeting Request', 'Cost Objection', 'Process Objection', 'Not Interested', 'Out of Office', 'Check Back Later', 'Referred', 'Wrong Person'];
export const OPTIONS = {
  handoff: ['Disabled', 'After First Agent Reply', 'All Replies'],
  defaultMode: ['Approval Required', 'Auto High Confidence', 'Autopilot'],
  oooMode: ['Approval Required', 'Auto Send'],
  tone: ['Laid Back', 'Professional', 'Direct', 'Warm'],
  length: ['Very Brief', 'Brief', 'Standard'],
  replyTypes: REPLY_TYPES,
};

/** The editable values, in the form's own shape (percent 0-100). */
export interface ReplierValues {
  enabled: boolean; handoff: string; replyTypes: string[]; defaultMode: string; oooMode: string; minConfidence: number; maxAuto: number;
  alwaysReview: string[]; nudge: boolean; tone: string; length: string; firstName: string; lastName: string; companyName: string; companyUrl: string;
  context: string; followupInstructions: string; calendarLink: string; timezone: string; officeStart: string; officeEnd: string; noWeekends: boolean; noHolidays: boolean;
}
type Key = keyof ReplierValues;
const BOOL: Key[] = ['enabled', 'nudge', 'noWeekends', 'noHolidays'];
const LISTS: Key[] = ['replyTypes', 'alwaysReview'];
const TEXT: Partial<Record<Key, number>> = { firstName: 60, lastName: 60, companyName: 120, companyUrl: 300, context: 10_000, followupInstructions: 4000, calendarLink: 500, timezone: 60, officeStart: 5, officeEnd: 5 };
const KEYS = Object.keys({ enabled: 0, handoff: 0, replyTypes: 0, defaultMode: 0, oooMode: 0, minConfidence: 0, maxAuto: 0, alwaysReview: 0, nudge: 0, tone: 0, length: 0, firstName: 0, lastName: 0, companyName: 0, companyUrl: 0, context: 0, followupInstructions: 0, calendarLink: 0, timezone: 0, officeStart: 0, officeEnd: 0, noWeekends: 0, noHolidays: 0 } satisfies Record<Key, 0>) as Key[];

const list = (v: unknown): string[] => (Array.isArray(v) ? v.map((x) => val(x)).filter(Boolean) : val(v) ? [val(v)] : []);

/** Settings row (field IDs) → form values. Pure. */
export function valuesOf(f: Record<string, unknown>): ReplierValues {
  const n = (k: string) => { const x = Number(f[k]); return f[k] === undefined || f[k] === null || f[k] === '' || !Number.isFinite(x) ? null : x; };
  const conf = n(SF.minConfidence);
  return {
    enabled: f[SF.enabled] === true, handoff: val(f[SF.handoff]) || 'Disabled', replyTypes: list(f[SF.replyTypes]), defaultMode: val(f[SF.defaultMode]) || 'Approval Required',
    oooMode: val(f[SF.oooMode]) || 'Approval Required', minConfidence: conf === null ? 90 : Math.round(conf * 1000) / 10, maxAuto: n(SF.maxAuto) ?? 3,
    alwaysReview: list(f[SF.alwaysReview]), nudge: f[SF.nudge] === true, tone: val(f[SF.tone]), length: val(f[SF.length]),
    firstName: val(f[SF.firstName]), lastName: val(f[SF.lastName]), companyName: val(f[SF.companyName]), companyUrl: val(f[SF.companyUrl]),
    context: val(f[SF.context]), followupInstructions: val(f[SF.followupInstructions]), calendarLink: val(f[SF.calendarLink]),
    timezone: val(f[SF.timezone]) || 'America/New_York', officeStart: val(f[SF.officeStart]) || '09:00', officeEnd: val(f[SF.officeEnd]) || '17:00',
    noWeekends: f[SF.noWeekends] === true, noHolidays: f[SF.noHolidays] === true,
  };
}

export const isTime = (t: string) => /^([01]\d|2[0-3]):[0-5]\d$/.test(t);
export function isTimezone(tz: string): boolean {
  if (!/^[A-Za-z_]+(?:\/[A-Za-z0-9_+-]+){0,2}$/.test(tz) && tz !== 'UTC') return false;
  try { new Intl.DateTimeFormat('en-US', { timeZone: tz }); return true; } catch { return false; }
}
const isUrl = (u: string) => { if (!u) return true; try { const x = new URL(u); return x.protocol === 'https:' || x.protocol === 'http:'; } catch { return false; } };

export interface Change { field: string; from: unknown; to: unknown }
/**
 * Check a (partial) save against the current values. Returns the Airtable fields to write (by field
 * ID; only what changed) and the log lines, or the first problem in plain words. Pure.
 */
export function validateSave(input: unknown, current: ReplierValues): { fields: Record<string, unknown>; changes: Change[] } | { error: string } {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return { error: 'send the settings as an object' };
  const b = input as Record<string, unknown>;
  const unknown = Object.keys(b).filter((k) => !KEYS.includes(k as Key));
  if (unknown.length) return { error: `unknown setting: ${unknown[0].slice(0, 40)}` };
  const next: ReplierValues = { ...current };
  for (const k of Object.keys(b) as Key[]) {
    const v = b[k];
    if (BOOL.includes(k)) { if (typeof v !== 'boolean') return { error: `${NAMES[k]} must be on or off` }; (next as any)[k] = v; continue; }
    if (LISTS.includes(k)) {
      if (!Array.isArray(v) || v.some((x) => typeof x !== 'string' || !REPLY_TYPES.includes(x))) return { error: `${NAMES[k]}: only these types: ${REPLY_TYPES.join(', ')}` };
      (next as any)[k] = REPLY_TYPES.filter((t) => (v as string[]).includes(t)); continue;
    }
    if (k === 'minConfidence') { const x = Number(v); if (typeof v !== 'number' || !Number.isFinite(x) || x < 0 || x > 100) return { error: 'Minimum confidence is a percent from 0 to 100' }; next.minConfidence = Math.round(x * 10) / 10; continue; }
    if (k === 'maxAuto') { if (typeof v !== 'number' || !Number.isInteger(v) || v < 0 || v > 20) return { error: 'Max automatic replies is a whole number from 0 to 20' }; next.maxAuto = v; continue; }
    if (k in OPTIONS) {
      const opts = (OPTIONS as Record<string, string[]>)[k];
      const blankOk = k === 'tone' || k === 'length';
      if (typeof v !== 'string' || !(opts.includes(v) || (blankOk && v === ''))) return { error: `${NAMES[k]} must be one of: ${opts.join(', ')}` };
      (next as any)[k] = v; continue;
    }
    if (typeof v !== 'string') return { error: `${NAMES[k]} must be text` };
    const t = v.replace(/\r\n/g, '\n').trim();
    if (t.length > (TEXT[k] ?? 500)) return { error: `${NAMES[k]} is too long (max ${(TEXT[k] ?? 500).toLocaleString('en-US')} characters)` };
    if ((k === 'officeStart' || k === 'officeEnd') && !isTime(t)) return { error: `${NAMES[k]} must be a time like 09:00 (24-hour HH:MM)` };
    if (k === 'timezone' && !isTimezone(t)) return { error: 'Timezone must be an IANA name like America/New_York' };
    if ((k === 'companyUrl' || k === 'calendarLink') && !isUrl(t)) return { error: `${NAMES[k]} must start with https://` };
    (next as any)[k] = t;
  }
  if (next.officeStart >= next.officeEnd) return { error: 'Office end must be after office start' };
  const fields: Record<string, unknown> = {}; const changes: Change[] = [];
  for (const k of KEYS) {
    const a = current[k], z = next[k];
    if (JSON.stringify(a) === JSON.stringify(z)) continue;
    fields[SF[k]] = k === 'minConfidence' ? Math.round((z as number) * 10) / 1000 : (k === 'tone' || k === 'length') && z === '' ? null : (typeof z === 'string' && z === '' ? '' : z);
    changes.push({ field: NAMES[k], from: a, to: z });
  }
  return { fields, changes };
}

const json = (s: string): any => { try { const j = JSON.parse(s || 'null'); return j && typeof j === 'object' ? j : {}; } catch { return null; } };
const byName = (f: Record<string, unknown>) => Object.fromEntries((Object.keys(SF) as (keyof typeof SF)[]).map((k) => [NAMES[k], f[SF[k]]]));

/** The read-only summaries of the JSON settings. Pure. */
export function summaries(f: Record<string, unknown>) {
  const s = parseSettings(byName(f));
  const routing = json(val(f[SF.routing]));
  const groups: string[] = Array.isArray(routing?.groups) ? routing.groups.filter((g: any) => g?.mode && Array.isArray(g?.intents) && g.intents.length).map((g: any) => `${g.mode}: ${g.intents.map(String).join(', ')}`) : [];
  const cc = json(val(f[SF.ccBcc]));
  const copies = !cc ? 'CC/BCC settings are not valid JSON: the sender refuses to send' : [cc.ccEnabled === true ? `CC ${[cc.cc].flat().filter(Boolean).join(', ') || '(no address: the sender refuses)'}` : '', cc.bccEnabled === true ? `BCC ${[cc.bcc].flat().filter(Boolean).join(', ') || '(no address: the sender refuses)'}` : ''].filter(Boolean).join(' · ') || 'No CC or BCC';
  const steps = allSteps(s.plan);
  const plan = !s.plan.enabled ? 'Follow-ups are off for this client' : `${steps.length - 1} follow-up${steps.length === 2 ? '' : 's'} at ${s.plan.steps.map((x) => x.delayDays).join(', ')} ${s.plan.skipWeekends ? 'business ' : ''}days, then a close-the-loop note${val(f[SF.plan]) ? '' : ' (default plan: none saved)'}`;
  const cal = json(val(f[SF.calJson])) ?? {};
  const req = json(val(f[SF.calRequest])) ?? {};
  const res = json(val(f[SF.calResult])) ?? {};
  return {
    routing: groups.length ? groups : ['No routing groups (Default Mode applies to every type)'],
    copies, plan,
    templates: Object.keys(s.templates), assets: s.assets.length, goal: s.goal, language: s.language,
    calendar: {
      provider: val(f[SF.calProvider]) || 'Not set', status: val(f[SF.calStatus]) || 'Not set', jsonStatus: String(cal.connectionStatus ?? ''),
      timesOff: cal.disableTimes === true, linksOff: cal.disableLinks === true,
      lastRequest: req.email ? { provider: String(req.provider ?? ''), email: String(req.email), at: String(req.requestedAt ?? '') } : null,
      lastResult: res.status ? { status: String(res.status), expiresAt: String(res.expiresAt ?? '') } : null,
    },
  };
}

/** What is off with this client's AI replier, Problem → Data → Fix (most important first). Pure. */
export function replierNotes(found: boolean, rows: number, v: ReplierValues | null, sum: ReturnType<typeof summaries> | null): Note[] {
  if (!found || !v || !sum) return [{ problem: 'No AI replier settings for this client', data: 'No Dulcy Reply Agent Settings row has this workspace\'s record ID', fix: 'Add the row in Airtable (Inbox Manager → Dulcy Reply Agent); until then Echo drafts with the default rules.' }];
  const out: Note[] = [];
  if (rows > 1) out.push({ problem: 'Two settings rows for one workspace', data: `${rows} rows match`, fix: 'Keep one in Airtable: the sender refuses to send while there are two.' });
  if (!v.enabled) out.push({ problem: 'The AI replier is off', data: 'Enabled is unticked', fix: 'Switch it on below if Echo should draft for this client.' });
  if (v.handoff === 'All Replies') out.push({ problem: 'The client answers its own replies', data: 'Client reply handoff = All replies', fix: 'Set it to Disabled if Dulcy should reply.' });
  const c = sum.calendar;
  const connected = c.status === 'Connected' || c.jsonStatus === 'connected';
  if (c.timesOff) out.push({ problem: 'Echo can\'t offer two times', data: `Times are switched off in the calendar settings${connected ? '' : ', and the calendar is not connected'}${v.calendarLink ? '; drafts use the booking link' : ''}`, fix: connected ? 'Turn "offer times" on in Inbox Manager → Calendar.' : 'Get the calendar link below and send it to the client; then turn times on.' });
  else if (!connected) out.push({ problem: 'Calendar not connected', data: `Status: ${c.status}${c.jsonStatus ? ` (${c.jsonStatus})` : ''}`, fix: 'Get the calendar link below and send it to the client.' });
  if (c.timesOff && (c.linksOff || !v.calendarLink)) out.push({ problem: 'No times and no link', data: 'Times are off and there is no usable booking link', fix: 'Echo will ask what their week looks like; connect the calendar.' });
  return out;
}

// ---------- Which replier mode applies (the Inbox thread panel) ----------
export type ReplierModeKey = 'off' | 'draft-only' | 'approval' | 'auto';
export interface ReplierMode { mode: ReplierModeKey; label: string; why: string; lines: string[]; clientId: string; clientName: string; found: boolean }
const AUTO = ['Auto High Confidence', 'Autopilot'];

/**
 * The mode one client's replies run in, in plain words. Pure.
 *   off        Enabled is off, or the client answers all its own replies: Echo does not draft.
 *   draft-only Echo drafts, but the engine's reply sender is not live: Send does not send yet.
 *   approval   Every draft waits for Josh or Alex; Send sends it.
 *   auto       Some replies send by themselves (the client's own settings, inside office hours).
 * engine.senderLive: REPLY_SENDER=on and reply.send live. engine.autoOn: SEAN_AUTO_SEND.
 */
export function replierModeOf(found: boolean, v: ReplierValues | null, sum: ReturnType<typeof summaries> | null, engine: { senderLive: boolean; autoOn: boolean }): Omit<ReplierMode, 'clientId' | 'clientName'> {
  const lines: string[] = [];
  if (!found || !v || !sum) {
    return { mode: engine.senderLive ? 'approval' : 'draft-only', label: engine.senderLive ? 'Approval' : 'Draft only', found: false,
      why: 'No AI replier settings for this client: Echo drafts with the default rules and every draft waits for Josh or Alex.', lines: [] };
  }
  if (!v.enabled) return { mode: 'off', label: 'Off', found, why: 'The AI replier is switched off for this client (Enabled is off): Echo does not draft here.', lines };
  if (v.handoff === 'All Replies') return { mode: 'off', label: 'Off', found, why: 'The client answers its own replies (Client reply handoff: All replies): Echo does not draft here.', lines };
  if (v.handoff === 'After First Agent Reply') lines.push('The client takes over after our first reply.');
  const autoParts: string[] = [];
  if (AUTO.includes(v.defaultMode)) autoParts.push(v.defaultMode === 'Autopilot' ? 'every reply type (Autopilot)' : `confident replies (${v.minConfidence}% or more)`);
  for (const g of sum.routing) { const m = /^(Auto High Confidence|Autopilot):\s*(.*)$/.exec(g); if (m) autoParts.push(`${m[2]} (${m[1]})`); }
  if (v.oooMode === 'Auto Send') autoParts.push('out-of-office replies');
  if (v.alwaysReview.length) lines.push(`Always need a person: ${v.alwaysReview.join(', ')}.`);
  const c = sum.calendar;
  const connected = c.status === 'Connected' || c.jsonStatus === 'connected';
  lines.push(c.timesOff ? 'Calendar times are off: drafts fall back to the booking link.' : connected ? 'Calendar connected: Echo offers two real times.' : 'Calendar not connected: drafts fall back to the booking link.');
  if (!engine.senderLive) return { mode: 'draft-only', label: 'Draft only', found, why: 'Echo drafts, but the engine\'s reply sender is not live (REPLY_SENDER / reply.send): pressing Send does not send yet.', lines };
  if (autoParts.length && engine.autoOn) return { mode: 'auto', label: 'Approval + some auto', found, why: `Sends by itself inside office hours (max ${v.maxAuto} a thread): ${autoParts.join('; ')}. Everything else waits for Josh or Alex.`, lines };
  if (autoParts.length) lines.push('The client is set to send some replies by itself, but automatic sending is off on the engine (SEAN_AUTO_SEND).');
  return { mode: 'approval', label: 'Approval', found, why: 'Every draft waits for Josh or Alex. Send sends it; nothing goes out by itself.', lines };
}

/** The mode for the client of one workspace record (null = no such client). */
export async function replierModeFor(c: { at: HqAirtable; cfg: Pick<Config, 'replySenderOn' | 'dryRun' | 'liveStages' | 'seanAutoSendOn'> }, wsRec: string): Promise<ReplierMode | null> {
  if (!/^rec[A-Za-z0-9]{14}$/.test(wsRec)) return null;
  const l = await load(c.at, wsRec);
  if (!l) return null;
  const f = l.row?.fields ?? null;
  const engine = { senderLive: c.cfg.replySenderOn && (!c.cfg.dryRun || c.cfg.liveStages.includes('reply.send')), autoOn: c.cfg.seanAutoSendOn };
  return { ...replierModeOf(!!f, f ? valuesOf(f) : null, f ? summaries(f) : null, engine), clientId: l.group[0].id, clientName: l.name };
}

export interface ReplierCtx { db: Db; cfg: Config; at: HqAirtable; fetchImpl?: typeof fetch }

/** The client (workspace group) and its settings row. */
async function load(at: HqAirtable, id: string) {
  const ws = await at.list(WORKSPACES, `{Name}!=''`, ['ID', 'Name', 'Status', 'Client', 'Client Type'], 300, { byName: true });
  const group = groupWorkspaces(ws).find((g) => g.some((w) => w.id === id));
  if (!group) return null;
  const ids = group.map((w) => w.id);
  const rows = (await at.list(SETTINGS, `OR(${ids.map((x) => `{Workspace Record ID}='${x}'`).join(',')})`, Object.values(SF), 10))
    .filter((r) => ids.includes(val(r.fields[SF.wsRec])))
    .sort((a, b) => ids.indexOf(val(a.fields[SF.wsRec])) - ids.indexOf(val(b.fields[SF.wsRec])));
  const sameWs = rows.filter((r) => val(r.fields[SF.wsRec]) === val(rows[0]?.fields[SF.wsRec])).length;
  const names = group.map((w) => val(w.fields.Name).replace(/\s*\(internal\)\s*$/i, '').trim());
  return { group, name: names.reduce((a, b) => (b.length < a.length ? b : a), names[0]), row: rows[0] as AirtableRecord | undefined, sameWs };
}

async function log(db: Db, actor: string, action: string, wsRec: string, rowId: string, changes: unknown) {
  await db.query(`INSERT INTO hq_settings_log (actor, action, ws_rec, row_id, changes) VALUES ($1,$2,$3,$4,$5)`, [actor, action, wsRec, rowId, JSON.stringify(changes)]);
}
const cut = (x: unknown) => (typeof x === 'string' && x.length > 200 ? `${x.slice(0, 199)}…` : x);

/** GET /clients/:id/replier */
export async function replierDetail(c: ReplierCtx, id: string, owner: boolean) {
  const l = await load(c.at, id);
  if (!l) return null;
  const f = l.row?.fields ?? null;
  const values = f ? valuesOf(f) : null;
  const sum = f ? summaries(f) : null;
  const wsRec = f ? val(f[SF.wsRec]) : l.group[0].id;
  const history = (await c.db.query(`SELECT actor, action, changes, created_at FROM hq_settings_log WHERE ws_rec = ANY($1) ORDER BY id DESC LIMIT 15`, [l.group.map((w) => w.id)])).rows
    .map((r) => ({ by: r.actor, action: r.action, at: new Date(r.created_at).toISOString(), changes: Array.isArray(r.changes) ? r.changes.map((x: Change) => ({ ...x, from: cut(x.from), to: cut(x.to) })) : r.changes }));
  const providerKey = providerKeyOf(sum?.calendar.provider ?? '') || 'google';
  const lastProvider = sum?.calendar.lastRequest?.provider;
  return {
    client: { id: l.group[0].id, name: l.name }, found: !!f, rowId: l.row?.id ?? '', workspaceRecordId: wsRec, workspaceName: f ? val(f[SF.wsName]) : '',
    lastUpdated: f ? val(f[SF.lastUpdated]) : '', values, summaries: sum, options: OPTIONS, canEdit: owner && !!f,
    notes: replierNotes(!!f, l.sameWs, values, sum), history,
    invite: {
      ready: owner && !!c.cfg.calendarAdminToken && !!f, why: !c.cfg.calendarAdminToken ? 'Needs CALENDAR_ADMIN_TOKEN on the server' : !owner ? 'Only the owner can ask for a calendar link' : !f ? 'No settings row for this client' : '',
      provider: isProvider(lastProvider) ? lastProvider : providerKey, email: sum?.calendar.lastRequest?.email ?? '',
    },
  };
}

/** POST /clients/:id/replier (owner only, checked by the route). */
export async function saveReplier(c: ReplierCtx, id: string, by: string, input: unknown): Promise<{ status: number; error?: string; changes?: Change[] }> {
  const l = await load(c.at, id);
  if (!l) return { status: 404, error: 'no such client' };
  if (!l.row) return { status: 409, error: 'this client has no Reply Agent settings row in Airtable yet' };
  if (l.sameWs > 1) return { status: 409, error: 'this client has two Reply Agent settings rows; keep one in Airtable first' };
  const fresh = await c.at.get(SETTINGS, l.row.id, Object.values(SF));
  if (!fresh) return { status: 404, error: 'the settings row is gone' };
  const r = validateSave(input, valuesOf(fresh.fields));
  if ('error' in r) return { status: 400, error: r.error };
  if (!r.changes.length) return { status: 200, changes: [] };
  await c.at.update(SETTINGS, l.row.id, { ...r.fields, [SF.lastUpdated]: new Date().toISOString() });
  await log(c.db, by, 'save', val(fresh.fields[SF.wsRec]), l.row.id, r.changes);
  return { status: 200, changes: r.changes };
}

/** Calendars a client can connect (the calendar service, services/dulcy-calendar). Order = the HQ dropdown. */
export const CALENDAR_PROVIDERS = ['google', 'microsoft', 'calendly', 'calcom', 'ghl', 'hubspot'] as const;
export type CalendarProviderKey = typeof CALENDAR_PROVIDERS[number];
const isProvider = (x: unknown): x is CalendarProviderKey => (CALENDAR_PROVIDERS as readonly string[]).includes(String(x));
/** The Airtable "Calendar Provider" text → the service's provider key ('' = not set or unknown). Pure. */
export function providerKeyOf(label: string): CalendarProviderKey | '' {
  const t = String(label ?? '').trim().toLowerCase();
  if (isProvider(t)) return t;
  if (/calendly/.test(t)) return 'calendly';
  if (/cal\.com|calcom/.test(t)) return 'calcom';
  if (/outlook|microsoft|office ?365|m365/.test(t)) return 'microsoft';
  if (/gohighlevel|highlevel|\bghl\b|leadconnector/.test(t)) return 'ghl';
  if (/hubspot/.test(t)) return 'hubspot';
  if (/google/.test(t)) return 'google';
  return '';
}

/** POST /clients/:id/calendar-invite: a one-time "connect your calendar" link from the calendar service. Never emails anyone. */
export async function calendarInvite(c: ReplierCtx, id: string, by: string, input: any): Promise<{ status: number; error?: string; url?: string; expiresAt?: string; email?: string }> {
  if (!c.cfg.calendarAdminToken) return { status: 503, error: 'Needs CALENDAR_ADMIN_TOKEN on the server' };
  const provider = String(input?.provider ?? '');
  const email = String(input?.email ?? '').trim().toLowerCase();
  if (!isProvider(provider)) return { status: 400, error: `provider must be one of ${CALENDAR_PROVIDERS.join(', ')}` };
  if (!/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(email) || email.length > 200) return { status: 400, error: 'the client\'s calendar email, please' };
  const l = await load(c.at, id);
  if (!l) return { status: 404, error: 'no such client' };
  if (!l.row) return { status: 409, error: 'this client has no Reply Agent settings row in Airtable yet' };
  const wsRec = val(l.row.fields[SF.wsRec]);
  if (!/^rec[A-Za-z0-9]{14}$/.test(wsRec)) return { status: 409, error: 'the settings row has no Workspace Record ID' };
  const requestId = randomBytes(18).toString('base64url');
  let b: any;
  try {
    const res = await (c.fetchImpl ?? fetch)(`${c.cfg.calendarUrl.replace(/\/+$/, '')}/calendar/admin/request-invite`, {
      method: 'POST', headers: { authorization: `Bearer ${c.cfg.calendarAdminToken}`, 'content-type': 'application/json' },
      body: JSON.stringify({ workspace: wsRec, requestId, provider, expectedEmail: email, label: l.name }), signal: AbortSignal.timeout(20_000),
    });
    b = await res.json().catch(() => ({}));
    if (!res.ok) return { status: 502, error: `The calendar service said no: ${String(b?.error ?? res.status).slice(0, 200)}` };
  } catch { return { status: 502, error: 'Could not reach the calendar service. Try again.' }; }
  const url = String(b?.url ?? '');
  if (!/^https:\/\/[^\s]+$/.test(url)) return { status: 502, error: 'The calendar service sent no link.' };
  const expiresAt = String(b?.expiresAt ?? '');
  const now = new Date().toISOString();
  // Same shape the old Inbox Manager button wrote, so the Airtable page shows the request too.
  await c.at.update(SETTINGS, l.row.id, {
    [SF.calRequest]: JSON.stringify({ requestId, provider, email, requestedAt: now, by: `HQ (${by})` }),
    [SF.calResult]: JSON.stringify({ requestId, status: 'Ready', url, expiresAt, message: `Open this one-time link and sign in as ${email}.`, updatedAt: now }),
  });
  await log(c.db, by, 'calendar_invite', wsRec, l.row.id, { provider, email, expiresAt });
  return { status: 200, url, expiresAt, email };
}

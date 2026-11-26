// What a client can change from the portal (2026-11-26): exactly what the Softr forms and buttons
// write, to the same tables and fields (hq/portal-softr-inventory.md, "Writes HQ copies"):
//   Campaign Review  → Campaign Feedback: a new record, lead = the campaign, Campaigns = [campaign]
//   Call Feedback    → Call Feedback: a new record, lead = the Emails record (Airtable then links it)
//   Close a Deal     → Client Closed Deals: a new record, lead = the Emails record
//   Task done        → Client Tasks: Stage = Done
//   Onboarding       → Onboarding: the answer fields only (ONBOARDING_EDITABLE)
//   Dismiss all      → Client Notifications: Dismissed = true
// Every write: the client is the session's; the row comes from an opaque key looked up among the
// session's OWN rows only (a forged or another client's key finds nothing → 404); the body is
// checked field by field; the write is logged in hq_portal_writes (who, when, table, record,
// field IDs, no values). At most 120 writes an hour per login.
import type { Db } from '../db/pool.js';
import { val } from '../agents/emailsFields.js';
import type { HqAirtable } from './decisions.js';
import type { HqUser } from './auth.js';
import { buildLead, cachedPortalSource, campaignState, findMine, invalidatePortalCache, KEY_RE, onboardingRecord, slice, type Mine } from './portal.js';
import { CALL_STATUS, CF, CFB, DEAL, DEAL_TYPES, NOTE, ONBOARDING_EDITABLE, REVIEW_CHANGES, REVIEW_FEEDBACK, T, TARGETING_CHOICES, TASK } from './portalFields.js';

export const MAX_WRITES_PER_HOUR = 120;
type Out = { status: number; body: unknown };
const bad = (error: string, status = 400): Out => ({ status, body: { error } });
const str = (x: unknown, max: number): string | null => { if (x === undefined || x === null) return ''; if (typeof x !== 'string') return null; const t = x.trim(); return t.length > max ? null : t; };
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
const oneOf = <T extends string>(x: unknown, list: readonly T[]): T | null => (typeof x === 'string' && (list as readonly string[]).includes(x) ? (x as T) : null);

async function logWrite(db: Db, user: HqUser, action: string, table: string, record: string, fields: string[]) {
  await db.query(`INSERT INTO hq_portal_writes (user_id, user_email, client_rec, action, table_id, record_id, fields) VALUES ($1,$2,$3,$4,$5,$6,$7)`,
    [user.id, user.email, user.clientRec, action, table, record, fields]);
}
async function tooMany(db: Db, user: HqUser): Promise<boolean> {
  const r = await db.query(`SELECT count(*)::int AS n FROM hq_portal_writes WHERE user_id=$1 AND created_at > now() - interval '1 hour'`, [user.id]);
  return r.rows[0].n >= MAX_WRITES_PER_HOUR;
}

/** Campaign Review (Softr /campaign-review): approve, or ask for changes, on a campaign waiting for this client. */
export function reviewFields(mine: Mine, key: string, b: any): { campaign?: string; fields?: Record<string, unknown>; error?: Out } {
  const c = findMine(mine.allCampaigns, key);
  if (!c) return { error: bad('That campaign is not in your portal.', 404) };
  if (campaignState(c.fields) !== 'review') return { error: bad('This campaign is not waiting for your review.', 409) };
  const feedback = oneOf(b?.feedback, REVIEW_FEEDBACK);
  if (!feedback) return { error: bad('Approve the campaign or ask for changes.') };
  const fields: Record<string, unknown> = { [CFB.lead]: c.id, [CFB.campaigns]: [c.id], [CFB.feedback]: feedback };
  if (feedback === 'Request Changes') {
    const changes = oneOf(b?.changes, REVIEW_CHANGES);
    if (!changes) return { error: bad('Pick what should change: copy, lead list or the entire campaign.') };
    fields[CFB.changes] = changes;
  }
  for (const [k, id] of [['size', CFB.size], ['geo', CFB.geo], ['industry', CFB.industry], ['title', CFB.title]] as const) {
    if (b?.[k] === undefined || b[k] === '') continue;
    const v = oneOf(b[k], TARGETING_CHOICES);
    if (!v) return { error: bad('One of the targeting answers is not a valid choice.') };
    fields[id] = v;
  }
  const copy = str(b?.reviewCopy, 5000), context = str(b?.context, 5000);
  if (copy === null || context === null) return { error: bad('Comments can be up to 5,000 characters.') };
  if (copy) fields[CFB.reviewCopy] = copy;
  if (context) fields[CFB.context] = context;
  if (feedback === 'Request Changes' && !copy && !context) return { error: bad('Tell us what to change, please.') };
  return { campaign: c.id, fields };
}

/** Call Feedback (Softr /call-feedback-form?prefill_lead=<Emails record>). */
export function feedbackFields(mine: Mine, key: string, b: any): { fields?: Record<string, unknown>; error?: Out } {
  const lead = buildLead(mine, key);
  if (!lead) return { error: bad('That lead is not in your portal.', 404) };
  if (!lead.canFeedback) return { error: bad('Feedback is for booked calls.', 409) };
  const e = findMine(mine.emails, key)!;
  const status = oneOf(b?.status, CALL_STATUS);
  if (!status) return { error: bad('How did the call go? Pick one.') };
  const fields: Record<string, unknown> = { [CF.lead]: e.id, [CF.status]: status };
  if (b?.rating !== undefined && b.rating !== null && b.rating !== '') {
    const r = Number(b.rating);
    if (!Number.isInteger(r) || r < 1 || r > 5) return { error: bad('The rating is 1 to 5 stars.') };
    fields[CF.rating] = r;
  }
  const notes = str(b?.comments, 5000), link = str(b?.recording, 500);
  if (notes === null) return { error: bad('Notes can be up to 5,000 characters.') };
  if (link === null || (link && !/^https?:\/\/\S+$/.test(link))) return { error: bad('The recording link must start with https://') };
  if (notes) fields[CF.notes] = notes;
  if (link) fields[CF.link] = link;
  if (status === 'New Date') {
    if (typeof b?.newDate !== 'string' || !DAY_RE.test(b.newDate) || Number.isNaN(Date.parse(b.newDate))) return { error: bad('Pick the new call date.') };
    fields[CF.newDate] = b.newDate;
  }
  return { fields };
}

/** Close a Deal (Softr /close-a-deal?prefill_lead=<Emails record>). */
export function dealFields(mine: Mine, key: string, b: any): { fields?: Record<string, unknown>; error?: Out } {
  const lead = buildLead(mine, key);
  if (!lead) return { error: bad('That lead is not in your portal.', 404) };
  if (!lead.canCloseDeal) return { error: bad('A deal is already recorded for this lead.', 409) };
  const e = findMine(mine.emails, key)!;
  const value = Number(b?.value);
  if (b?.value === '' || b?.value === undefined || !Number.isFinite(value) || value < 0 || value > 100_000_000) return { error: bad('The deal value in USD, please.') };
  if (typeof b?.date !== 'string' || !DAY_RE.test(b.date) || Number.isNaN(Date.parse(b.date))) return { error: bad('The date the deal closed, please.') };
  const type = oneOf(b?.type, DEAL_TYPES);
  if (!type) return { error: bad('Pick the deal type.') };
  const why = str(b?.why, 5000);
  if (why === null) return { error: bad('Up to 5,000 characters, please.') };
  return { fields: { [DEAL.lead]: e.id, [DEAL.value]: Math.round(value * 100) / 100, [DEAL.date]: b.date, [DEAL.type]: type, ...(why ? { [DEAL.why]: why } : {}) } };
}

/** Onboarding answers: only the listed fields, each checked by its kind; only what changed is written. */
export function onboardingChanges(current: Record<string, unknown>, values: any): { fields?: Record<string, unknown>; error?: Out } {
  if (!values || typeof values !== 'object' || Array.isArray(values)) return { error: bad('Send the answers, please.') };
  const known = new Map(ONBOARDING_EDITABLE.map((f) => [f.key, f]));
  const out: Record<string, unknown> = {};
  for (const [k, raw] of Object.entries(values)) {
    const f = known.get(k);
    if (!f) return { error: bad('One of the answers is not part of the onboarding form.') };
    const v = str(raw, f.kind === 'long' ? 10_000 : 2_000);
    if (v === null) return { error: bad(`"${f.label}" is too long.`) };
    if (v && f.kind === 'url' && !/^https?:\/\/\S+$/.test(v)) return { error: bad(`"${f.label}" must be a link starting with https://`) };
    if (v && f.kind === 'email' && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v)) return { error: bad(`"${f.label}" must be an email address.`) };
    if (v && f.kind === 'select' && !(f.choices ?? []).includes(v)) return { error: bad(`"${f.label}": pick one of the choices.`) };
    if (v === val(current[f.id])) continue;
    out[f.id] = v === '' ? null : v;
  }
  return { fields: out };
}

/**
 * POST /hq/api/portal/<word>[/<key>[/<action>]] for a client session. The client is the session's.
 */
export async function portalWrite(at: HqAirtable, db: Db, user: HqUser, sub: string, b: any): Promise<Out> {
  if (user.role !== 'client' || !user.clientRec) return bad('The portal is for client logins.', 403);
  const [, word = '', key = '', action = ''] = sub.split('/');
  const route = `${word}${action ? `/${action}` : ''}`;
  const keyed = ['campaign/review', 'lead/feedback', 'lead/deal', 'task/done'].includes(route);
  if (!keyed && !['onboarding', 'notifications/dismiss'].includes(`${word}${key ? `/${key}` : ''}`)) return bad('not found', 404);
  if (keyed && !KEY_RE.test(key)) return bad('not found', 404);
  if (await tooMany(db, user)) return bad('Too many changes in an hour. Try again later.', 429);
  const mine = slice(await cachedPortalSource(at), user.clientRec);
  if (!mine) return bad('Your account is not linked to a client yet. Please contact your Dulcy team.', 404);
  const done = async (actionName: string, table: string, record: string, fields: string[], body: Record<string, unknown> = {}) => {
    await logWrite(db, user, actionName, table, record, fields);
    invalidatePortalCache();
    return { status: 200, body: { ok: true, ...body } };
  };

  if (route === 'campaign/review') {
    const r = reviewFields(mine, key, b);
    if (r.error) return r.error;
    const id = await at.create(T.campaignFeedback, r.fields!);
    return done('campaign_review', T.campaignFeedback, id, Object.keys(r.fields!));
  }
  if (route === 'lead/feedback') {
    const r = feedbackFields(mine, key, b);
    if (r.error) return r.error;
    const id = await at.create(T.callFeedback, r.fields!);
    return done('call_feedback', T.callFeedback, id, Object.keys(r.fields!));
  }
  if (route === 'lead/deal') {
    const r = dealFields(mine, key, b);
    if (r.error) return r.error;
    const id = await at.create(T.closedDeals, r.fields!);
    return done('close_deal', T.closedDeals, id, Object.keys(r.fields!));
  }
  if (route === 'task/done') {
    const t = findMine(mine.tasks, key);
    if (!t) return bad('That task is not in your portal.', 404);
    if (val(t.fields[TASK.stage]) === 'Done') return bad('Already done.', 409);
    await at.update(T.tasks, t.id, { [TASK.stage]: 'Done' });
    return done('task_done', T.tasks, t.id, [TASK.stage]);
  }
  if (word === 'onboarding') {
    const r = await onboardingRecord(at, mine);
    if (!r) return bad('Your onboarding form is not set up yet. Your Dulcy team will add it.', 409);
    const c = onboardingChanges(r.fields, b?.values);
    if (c.error) return c.error;
    const ids = Object.keys(c.fields!);
    if (!ids.length) return { status: 200, body: { ok: true, changed: 0 } };
    await at.update(T.onboarding, r.id, c.fields!);
    return done('onboarding_save', T.onboarding, r.id, ids, { changed: ids.length });
  }
  // notifications/dismiss: "Dismiss all" (Softr: UPDATE Dismissed = true on each shown record).
  const items = mine.notifications.slice(0, 100);
  for (const x of items) {
    await at.update(T.notifications, x.id, { [NOTE.dismissed]: true });
    await logWrite(db, user, 'notification_dismiss', T.notifications, x.id, [NOTE.dismissed]);
  }
  invalidatePortalCache();
  return { status: 200, body: { ok: true, dismissed: items.length } };
}

/** For the owner: the latest client writes (Users page / audits). */
export async function recentPortalWrites(db: Db, limit = 50) {
  const r = await db.query(`SELECT id, user_email, client_rec, action, table_id, record_id, fields, created_at FROM hq_portal_writes ORDER BY id DESC LIMIT $1`, [limit]);
  return r.rows.map((x) => ({ id: Number(x.id), who: String(x.user_email), action: String(x.action), table: String(x.table_id), record: String(x.record_id), fields: x.fields as string[], created: new Date(x.created_at).toISOString() }));
}

// HQ asks: an agent (or a Claude session, or an operator with the CLI `ask add`) asks Alex, or a
// member, to do one thing: "Atlas: reply to Pete about Twenty West", "Setup: publish the Google
// calendar app" (with the steps). Each ask shows on "Needs you" until it is done; "Not now" hides
// it for a day or until Monday morning. One row per dedupe_key: asking again with the same key
// (by default agent + title) changes nothing, even after it was done. Nothing is seeded.
import type { Db } from '../db/pool.js';
import { OWNER_ONLY, agentByName } from './agents.js';

export type AskPriority = 'high' | 'normal';
export type AskAudience = 'owner' | 'everyone';
export interface NewAsk {
  agent: string; title: string; why?: string; steps?: string; actionLabel?: string; actionUrl?: string;
  priority?: AskPriority; audience?: AskAudience; dedupeKey?: string;
  /** YYYY-MM-DD: shown on that day (on "Tomorrow" the day before), not before. */
  due?: string; clientFacing?: boolean; money?: boolean;
}
export interface Ask {
  id: number; agent: string; title: string; why: string; steps: string; actionLabel: string; actionUrl: string;
  priority: AskPriority; audience: AskAudience; dedupeKey: string; created: string; done: string | null; doneBy: string | null; snoozedUntil: string | null;
  due?: string | null; clientFacing?: boolean; money?: boolean;
}

const clean = (x: unknown, max: number) => String(x ?? '').replace(/\r\n/g, '\n').trim().slice(0, max);
const oneLine = (x: unknown, max: number) => clean(x, max * 2).replace(/\s+/g, ' ').slice(0, max);

/**
 * An action link is a relative HQ route ("decisions/Replies", "#/users", "/clients/rec...") or an
 * https:// link. Anything else (javascript:, http:, //host, data:) is refused. Relative routes are
 * stored without the leading "#/" or "/". Returns null when refused.
 */
export function cleanActionUrl(raw: unknown): string | null {
  const u = String(raw ?? '').trim();
  if (!u) return '';
  if (u.length > 500 || /\s/.test(u)) return null;
  if (/^https:\/\//i.test(u)) { try { const x = new URL(u); return x.protocol === 'https:' && x.hostname ? x.toString() : null; } catch { return null; } }
  if (u.startsWith('//')) return null;
  const rel = u.replace(/^#?\/?/, '');
  return /^[A-Za-z][A-Za-z0-9_\-./%?=&]*$/.test(rel) && !/^[A-Za-z][A-Za-z0-9+.-]*:/.test(rel) ? rel : null;
}

/** Check and tidy a new ask. Returns the error text when it is not valid. */
export function validAsk(x: any): (Omit<Required<NewAsk>, 'due'> & { due: string | null }) | string {
  const agentRaw = oneLine(x?.agent, 40);
  const agent = agentByName(agentRaw) ?? agentRaw;
  if (!agent || !/^[A-Za-z][A-Za-z ]{0,39}$/.test(agent)) return 'Which agent asks? (an agent name such as Atlas, or a short label such as Setup)';
  const title = oneLine(x?.title, 160);
  if (!title) return 'A one-line title (up to 160 characters), please.';
  const actionUrl = cleanActionUrl(x?.actionUrl);
  if (actionUrl === null) return 'The action link must be an HQ page (e.g. decisions/Replies) or an https:// link.';
  const priority = String(x?.priority ?? 'normal').toLowerCase();
  if (priority !== 'high' && priority !== 'normal') return 'Priority must be high or normal.';
  const audience = String(x?.audience ?? 'owner').toLowerCase();
  if (audience !== 'owner' && audience !== 'everyone') return 'Audience must be owner or everyone.';
  const actionLabel = oneLine(x?.actionLabel, 40) || (actionUrl ? 'Open' : '');
  const dedupeKey = oneLine(x?.dedupeKey, 200) || `${agent.toLowerCase()}:${title.toLowerCase()}`;
  const due = String(x?.due ?? '').trim();
  if (due && (!/^\d{4}-\d{2}-\d{2}$/.test(due) || !Number.isFinite(Date.parse(`${due}T12:00:00Z`)))) return 'Due must be a date, YYYY-MM-DD.';
  return {
    agent, title, why: oneLine(x?.why, 300), steps: clean(x?.steps, 4000), actionLabel, actionUrl,
    priority: priority as AskPriority,
    // Money and content stay owner-only (Alex, 2026-11-25), whatever the caller asked for.
    audience: OWNER_ONLY.includes(agent) ? 'owner' : (audience as AskAudience),
    dedupeKey, due: due || null, clientFacing: x?.clientFacing === true,
    // Ledger's asks are money by definition.
    money: x?.money === true || agent === 'Ledger',
  };
}

const toAsk = (r: any): Ask => ({
  id: Number(r.id), agent: String(r.agent), title: String(r.title), why: String(r.why), steps: String(r.steps), actionLabel: String(r.action_label), actionUrl: String(r.action_url),
  priority: r.priority, audience: r.audience, dedupeKey: String(r.dedupe_key), created: new Date(r.created_at).toISOString(),
  done: r.done_at ? new Date(r.done_at).toISOString() : null, doneBy: r.done_by ?? null, snoozedUntil: r.snoozed_until ? new Date(r.snoozed_until).toISOString() : null,
  due: r.due ?? null, clientFacing: r.client_facing === true, money: r.money === true,
});
const ASK_COLS = `*, to_char(due_date,'YYYY-MM-DD') AS due`;

/** Add an ask. The same dedupe key again returns the existing ask unchanged (created: false). */
export async function addAsk(db: Db, x: NewAsk): Promise<{ ask: Ask; created: boolean }> {
  const a = validAsk(x);
  if (typeof a === 'string') throw Object.assign(new Error(a), { status: 400 });
  const ins = await db.query(
    `INSERT INTO hq_asks (agent, title, why, steps, action_label, action_url, priority, audience, dedupe_key, due_date, client_facing, money)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) ON CONFLICT (dedupe_key) DO NOTHING RETURNING ${ASK_COLS}`,
    [a.agent, a.title, a.why, a.steps, a.actionLabel, a.actionUrl, a.priority, a.audience, a.dedupeKey, a.due, a.clientFacing, a.money]);
  if (ins.rows[0]) return { ask: toAsk(ins.rows[0]), created: true };
  const old = await db.query(`SELECT ${ASK_COLS} FROM hq_asks WHERE dedupe_key=$1`, [a.dedupeKey]);
  return { ask: toAsk(old.rows[0]), created: false };
}

/** Open asks (not done, not snoozed), or every ask with all=true. */
export async function listAsks(db: Db, opts: { all?: boolean; limit?: number } = {}): Promise<Ask[]> {
  const r = await db.query(
    `SELECT ${ASK_COLS} FROM hq_asks WHERE $1 OR (done_at IS NULL AND (snoozed_until IS NULL OR snoozed_until <= now()))
     ORDER BY done_at IS NOT NULL, created_at DESC, id DESC LIMIT $2`, [opts.all === true, Math.min(500, opts.limit ?? 100)]);
  return r.rows.map(toAsk);
}

export async function getAsk(db: Db, id: number): Promise<Ask | null> {
  const r = await db.query(`SELECT ${ASK_COLS} FROM hq_asks WHERE id=$1`, [id]);
  return r.rows[0] ? toAsk(r.rows[0]) : null;
}

/** Asks for the day switcher: done in the last 3 days, snoozed (not done), or with a due date (not done). */
export async function asksAroundToday(db: Db): Promise<Ask[]> {
  const r = await db.query(
    `SELECT ${ASK_COLS} FROM hq_asks WHERE done_at > now() - interval '3 days' OR (done_at IS NULL AND (snoozed_until > now() OR due_date IS NOT NULL))
     ORDER BY id DESC LIMIT 500`);
  return r.rows.map(toAsk);
}

/** Can this person see (and so finish or snooze) this ask? */
export const askVisible = (a: Pick<Ask, 'agent' | 'audience'>, owner: boolean) => owner || (a.audience === 'everyone' && !OWNER_ONLY.includes(a.agent));

/** Mark done. False when it was already done or does not exist. */
export async function finishAsk(db: Db, id: number, by: string): Promise<boolean> {
  return ((await db.query(`UPDATE hq_asks SET done_at=now(), done_by=$2 WHERE id=$1 AND done_at IS NULL`, [id, by.slice(0, 120)])).rowCount ?? 0) > 0;
}

export type SnoozeUntil = 'tomorrow' | 'monday';
/**
 * When a "Not now" ends, as SQL: tomorrow = 24 hours from now; monday = next Monday 8:00 in New
 * York (a Monday snoozed on Monday means the Monday after).
 */
export const SNOOZE_SQL: Record<SnoozeUntil, string> = {
  tomorrow: `now() + interval '1 day'`,
  monday: `(date_trunc('week', now() AT TIME ZONE 'America/New_York') + interval '7 days 8 hours') AT TIME ZONE 'America/New_York'`,
};
export const isSnooze = (x: unknown): x is SnoozeUntil => x === 'tomorrow' || x === 'monday';

export async function snoozeAsk(db: Db, id: number, until: SnoozeUntil): Promise<string | null> {
  const r = await db.query(`UPDATE hq_asks SET snoozed_until=${SNOOZE_SQL[until]} WHERE id=$1 AND done_at IS NULL RETURNING snoozed_until`, [id]);
  return r.rows[0] ? new Date(r.rows[0].snoozed_until).toISOString() : null;
}

/** "Not now" for an item that lives outside HQ (a Riley System Issue): hidden until it ends. */
export async function quietItem(db: Db, key: string, until: SnoozeUntil, by: string): Promise<string> {
  const r = await db.query(
    `INSERT INTO hq_needs_quiet (item_key, quiet_until, set_by) VALUES ($1, ${SNOOZE_SQL[until]}, $2)
     ON CONFLICT (item_key) DO UPDATE SET quiet_until=EXCLUDED.quiet_until, set_by=EXCLUDED.set_by RETURNING quiet_until`, [key, by.slice(0, 120)]);
  return new Date(r.rows[0].quiet_until).toISOString();
}
export async function quietKeys(db: Db): Promise<Set<string>> {
  return new Set((await db.query(`SELECT item_key FROM hq_needs_quiet WHERE quiet_until > now()`)).rows.map((r) => String(r.item_key)));
}

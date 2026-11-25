// HQ To-do (Eisenhower) from the Airtable Tasks table. Open = Status not Done and Stage not Completed.
//   urgent    = overdue or due today/tomorrow (New York dates), or Priority Urgent
//   important = Priority Urgent or High, or Client Facing
//   Do now = urgent + important · Schedule = important · Delegate = urgent only · Later = the rest.
// A task sitting in Review/QA untouched for 7+ days gets a one-tap "Done?" question.
import type { Db } from '../db/pool.js';
import type { AirtableRecord } from '../providers/airtable.js';
import type { HqAirtable } from './decisions.js';

export const TASKS = 'tblRBxm2N53331mIm';
export const TF = {
  name: 'fldWrFb99wzxaMcG5', client: 'fldGpegEE7flJMNKE', campaign: 'fldKkc0bjUB6VYgz7', stage: 'fld1hJsrkZM8Nsyk3', due: 'fldY96iXNDEyAP55n',
  priority: 'fldwn4GL0LPUrY0Tg', status: 'fldnlUbFIsgrGd4PI', notes: 'fldswSNtDML9iDp9A', lastUpdated: 'fldFJZc42D5AUv6Yk', clientFacing: 'fldYSmlrlpW50wxT1',
} as const;
export const BOXES = ['doNow', 'schedule', 'delegate', 'later'] as const;
export type Box = (typeof BOXES)[number];
const WORKSPACES = 'tblcjRBGJEWh5KgOt';
const STALE_DAYS = 7;

export interface Task {
  id: string; name: string; client: string; stage: string; due: string; priority: string; status: string; notes: string;
  clientFacing: boolean; lastUpdated: string;
}
export interface SortedTask extends Task { box: Box; urgent: boolean; important: boolean; overdue: boolean; stale: boolean }

const text = (v: unknown): string => (v === undefined || v === null ? '' : typeof v === 'object' && !Array.isArray(v) ? String((v as any).name ?? '') : String(v)).trim();
/** YYYY-MM-DD in New York. */
export const nyDate = (d: Date) => d.toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
export const addDays = (ymd: string, n: number) => { const d = new Date(`${ymd}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const PRIO: Record<string, number> = { Urgent: 0, High: 1, Medium: 2, Low: 3 };

export function isOpen(t: Pick<Task, 'status' | 'stage'>): boolean { return t.status !== 'Done' && t.stage !== 'Completed'; }

/** Sort one task into its box. Pure. */
export function classify(t: Task, now = new Date()): SortedTask {
  const today = nyDate(now), tomorrow = addDays(today, 1);
  const due = (t.due || '').slice(0, 10);
  const overdue = !!due && due < today;
  const urgent = overdue || (!!due && due <= tomorrow) || t.priority === 'Urgent';
  const important = t.priority === 'Urgent' || t.priority === 'High' || t.clientFacing;
  const box: Box = urgent && important ? 'doNow' : important ? 'schedule' : urgent ? 'delegate' : 'later';
  const touched = Date.parse(t.lastUpdated);
  const stale = t.stage === 'Review/QA' && Number.isFinite(touched) && now.getTime() - touched >= STALE_DAYS * 86_400_000;
  return { ...t, box, urgent, important, overdue, stale };
}

/** Highest priority first: overdue, then due date, then priority. */
export function rank(a: SortedTask, b: SortedTask): number {
  return Number(b.overdue) - Number(a.overdue) || (a.due || '9999').localeCompare(b.due || '9999') || (PRIO[a.priority] ?? 4) - (PRIO[b.priority] ?? 4) || a.name.localeCompare(b.name);
}

export function sortTasks(tasks: Task[], now = new Date(), quiet: Set<string> = new Set()): { boxes: Record<Box, SortedTask[]>; doneQuestions: SortedTask[] } {
  const boxes = { doNow: [], schedule: [], delegate: [], later: [] } as Record<Box, SortedTask[]>;
  const doneQuestions: SortedTask[] = [];
  for (const t of tasks.filter(isOpen).map((x) => classify(x, now))) {
    boxes[t.box].push(t);
    if (t.stale && !quiet.has(t.id)) doneQuestions.push(t);
  }
  for (const b of BOXES) boxes[b].sort(rank);
  return { boxes, doneQuestions: doneQuestions.sort(rank) };
}

let clientCache: { at: number; names: Map<string, string> } | null = null;
export function _resetClientCache() { clientCache = null; }
export async function clientNames(at: Pick<HqAirtable, 'list'>): Promise<Map<string, string>> {
  if (clientCache && Date.now() - clientCache.at < 10 * 60_000) return clientCache.names;
  const rows = await at.list(WORKSPACES, `{Name}!=''`, ['Name'], 500, { byName: true }).catch(() => []);
  clientCache = { at: Date.now(), names: new Map(rows.map((r) => [r.id, text(r.fields.Name)])) };
  return clientCache.names;
}

export function toTask(r: AirtableRecord, names: Map<string, string>): Task {
  const f = r.fields;
  const client = (Array.isArray(f[TF.client]) ? (f[TF.client] as unknown[]) : []).map((x) => names.get(String(x)) ?? '').filter(Boolean).join(', ');
  return {
    id: r.id, name: text(f[TF.name]) || 'Untitled task', client, stage: text(f[TF.stage]), due: text(f[TF.due]), priority: text(f[TF.priority]),
    status: text(f[TF.status]), notes: text(f[TF.notes]).slice(0, 4000), clientFacing: f[TF.clientFacing] === true, lastUpdated: text(f[TF.lastUpdated]),
  };
}

export async function openTasks(at: Pick<HqAirtable, 'list'>): Promise<Task[]> {
  const [rows, names] = await Promise.all([
    at.list(TASKS, `AND({Status}!='Done',{Stage}!='Completed')`, Object.values(TF), 500),
    clientNames(at),
  ]);
  return rows.map((r) => toTask(r, names)).filter(isOpen);
}

export async function quietTaskIds(db: Db): Promise<Set<string>> {
  return new Set((await db.query(`SELECT task_id FROM hq_task_checks WHERE quiet_until > now()`)).rows.map((r) => String(r.task_id)));
}

export async function listTasks(at: Pick<HqAirtable, 'list'>, db: Db, now = new Date()) {
  const [tasks, quiet] = await Promise.all([openTasks(at), quietTaskIds(db)]);
  return { ...sortTasks(tasks, now, quiet), total: tasks.length };
}

export async function markDone(at: Pick<HqAirtable, 'get' | 'update'>, id: string): Promise<{ status: number; error?: string }> {
  if (!/^rec[A-Za-z0-9]{14}$/.test(id)) return { status: 400, error: 'not a task id' };
  const r = await at.get(TASKS, id, [TF.name, TF.status]);
  if (!r) return { status: 404, error: 'task not found' };
  await at.update(TASKS, id, { [TF.status]: 'Done' });
  return { status: 200 };
}

/** "Done?" → not yet: don't ask again for 7 days. */
export async function notYet(db: Db, id: string): Promise<void> {
  await db.query(`INSERT INTO hq_task_checks (task_id, quiet_until) VALUES ($1, now() + interval '7 days') ON CONFLICT (task_id) DO UPDATE SET quiet_until=EXCLUDED.quiet_until`, [id]);
}

export interface NewTask { name: string; due?: string; priority?: string; clientFacing?: boolean; notes?: string }
export function validNewTask(x: any): NewTask | string {
  const name = String(x?.name ?? '').trim();
  if (!name || name.length > 250) return 'A task name (up to 250 characters), please.';
  const due = String(x?.due ?? '').trim();
  if (due && !/^\d{4}-\d{2}-\d{2}$/.test(due)) return 'Due date must be YYYY-MM-DD.';
  const priority = String(x?.priority ?? '').trim();
  if (priority && !(priority in PRIO)) return 'Priority must be Urgent, High, Medium or Low.';
  return { name, due: due || undefined, priority: priority || undefined, clientFacing: x?.clientFacing === true, notes: String(x?.notes ?? '').slice(0, 4000) || undefined };
}

export async function quickAdd(at: Pick<HqAirtable, 'create'>, t: NewTask): Promise<string> {
  return at.create(TASKS, {
    [TF.name]: t.name, [TF.status]: 'Not Started',
    ...(t.due ? { [TF.due]: t.due } : {}), ...(t.priority ? { [TF.priority]: t.priority } : {}),
    ...(t.clientFacing ? { [TF.clientFacing]: true } : {}), ...(t.notes ? { [TF.notes]: t.notes } : {}),
  });
}

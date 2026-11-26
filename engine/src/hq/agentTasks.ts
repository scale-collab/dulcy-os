// Agent task lists (Alex, 2026-11-25): "To create new campaigns and bounce protection, it all gets
// sent to my project management. It's a little too much. ... the task should be assigned to them,
// and we could see and ask for progress." And: "I need this to be very autonomous."
//
// Each agent keeps its own tasks in HQ's Postgres (hq_agent_tasks; never the Airtable Tasks table):
//   status   open (not started) · in_progress · waiting_alex · done
//   note     one line: where it is now ("Reading the bounce codes", "With the client for approval")
//   updated  when the title, status, note, due date or link last changed. Calling again with the
//            same values changes nothing, so a task nobody moves goes stale.
// The engine opens, updates and closes tasks with upsertAgentTask() (one task per key). Ada's
// morning check (checkStaleTasks) lists what is overdue or has not moved for 2+ days and re-queues
// the engine job behind it when there is one (the normal queue: LIVE_STAGES and its dedupe apply).
import type { Db } from '../db/pool.js';
import type { Config } from '../config.js';
import { enqueue } from '../queue.js';
import { AGENT_NAMES, OWNER_ONLY, agentByName, type AgentName } from './agents.js';
import { cleanActionUrl } from './asks.js';
import { addDays, nyDate } from './tasks.js';

export const TASK_STATUSES = ['open', 'in_progress', 'waiting_alex', 'done'] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];
export const TASK_PRIORITIES = ['high', 'normal', 'low'] as const;
export type TaskPriority = (typeof TASK_PRIORITIES)[number];
export const isTaskStatus = (x: unknown): x is TaskStatus => (TASK_STATUSES as readonly unknown[]).includes(x);

/** A task with no change for this long is stalled (Alex: an agent must never just sit on a task). */
export const STALE_DAYS = 2;
/** Ada re-queues a stalled task's job at most this many times; after that it is only flagged. */
export const MAX_REQUEUES = 3;
const DAY = 86_400_000;

export interface TaskJob { kind: string; recordId: string; input?: Record<string, unknown> }
export interface UpsertAgentTask {
  agent: string;
  /** One task per key, e.g. bounce:<team>:<campaign>, rest:<account record>, plan:<plan id>. */
  key: string;
  title: string;
  /** YYYY-MM-DD (or a Date, read as its New York day). null clears it; left out keeps it. */
  due?: string | Date | null;
  status?: TaskStatus;
  /** The one-line progress note. */
  note?: string;
  /** An HQ route (decisions/Campaigns) or an https:// link. null clears it. */
  link?: string | null;
  client?: string;
  priority?: TaskPriority;
  /** Longer detail (the old notes column). */
  details?: string;
  /** The engine job that moves this task (re-queued by Ada when it stalls). null clears it. */
  job?: TaskJob | null;
  /** A planned wait (e.g. an account resting until its retest): not stalled before this time. null clears it. */
  waitingUntil?: string | Date | null;
  /** The Airtable Decision this task waits on (waiting_alex). null clears it. */
  decision?: string | null;
}

const oneLine = (x: unknown, max: number) => String(x ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
const ymd = (d: string | Date | null | undefined): string | null | undefined => {
  if (d === undefined || d === null) return d;
  if (d instanceof Date) return Number.isFinite(d.getTime()) ? nyDate(d) : null;
  const s = String(d).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const t = Date.parse(s);
  return Number.isFinite(t) ? nyDate(new Date(t)) : null;
};
const iso = (d: string | Date | null | undefined): string | null | undefined => {
  if (d === undefined || d === null) return d;
  const t = d instanceof Date ? d.getTime() : Date.parse(String(d));
  return Number.isFinite(t) ? new Date(t).toISOString() : null;
};

/**
 * Open, update or close one of an agent's own tasks. Same key = same task. A field left out keeps
 * its value; the last-update time moves only when something the person sees changed. A done task
 * given another status is reopened. Never throws for bad input: returns the error text.
 */
export async function upsertAgentTask(db: Db, t: UpsertAgentTask): Promise<{ id: number; created: boolean; changed: boolean; status: TaskStatus } | { error: string }> {
  const agent = agentByName(String(t.agent ?? ''));
  if (!agent) return { error: `unknown agent "${String(t.agent ?? '').slice(0, 40)}"` };
  const key = oneLine(t.key, 200);
  if (!key) return { error: 'a task key, please' };
  const title = oneLine(t.title, 200);
  if (!title) return { error: 'a task title, please' };
  if (t.status !== undefined && !isTaskStatus(t.status)) return { error: `status must be one of ${TASK_STATUSES.join(', ')}` };
  if (t.priority !== undefined && !(TASK_PRIORITIES as readonly string[]).includes(t.priority)) return { error: 'priority must be high, normal or low' };
  let link: string | null | undefined = t.link;
  if (link !== undefined && link !== null) { link = cleanActionUrl(link); if (link === null) return { error: 'the link must be an HQ page or an https:// link' }; if (link === '') link = null; }
  const due = ymd(t.due);
  const note = t.note === undefined ? undefined : oneLine(t.note, 300);
  const job = t.job === undefined ? undefined : t.job && t.job.kind && t.job.recordId ? { kind: oneLine(t.job.kind, 80), recordId: oneLine(t.job.recordId, 200), input: t.job.input ?? {} } : null;
  const decision = t.decision === undefined ? undefined : t.decision && /^rec[A-Za-z0-9]{14}$/.test(t.decision) ? t.decision : null;

  const old = (await db.query(`SELECT *, to_char(due_date,'YYYY-MM-DD') AS due_ymd FROM hq_agent_tasks WHERE source_key=$1`, [key])).rows[0];
  if (!old) {
    const status = t.status ?? 'open';
    const r = await db.query(
      `INSERT INTO hq_agent_tasks (agent, title, due_date, status, client, link, notes, source_key, progress_note, priority, job_kind, job_record, job_input, waiting_until, decision_rec, done_at, done_note)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15, CASE WHEN $4='done' THEN now() END, CASE WHEN $4='done' THEN $9 END)
       ON CONFLICT (source_key) DO NOTHING RETURNING id`,
      [agent, title, due ?? null, status, oneLine(t.client, 120), link ?? null, String(t.details ?? '').slice(0, 2000), key, note ?? '', t.priority ?? 'normal',
        job?.kind ?? null, job?.recordId ?? null, job ? JSON.stringify(job.input) : null, iso(t.waitingUntil) ?? null, decision ?? null]);
    if (r.rows[0]) return { id: Number(r.rows[0].id), created: true, changed: true, status };
    return upsertAgentTask(db, t); // someone else inserted it a moment ago: update that one
  }
  const next = {
    title, status: (t.status ?? old.status) as TaskStatus, note: note ?? String(old.progress_note ?? ''),
    due: due === undefined ? (old.due_ymd ?? null) : due,
    link: link === undefined ? (old.link ?? null) : link,
  };
  const oldDue = old.due_ymd ?? null;
  const changed = next.title !== old.title || next.status !== old.status || next.note !== String(old.progress_note ?? '') || next.due !== oldDue || (next.link ?? null) !== (old.link ?? null);
  await db.query(
    `UPDATE hq_agent_tasks SET title=$2, status=$3, progress_note=$4, due_date=$5, link=$6,
       client=COALESCE($7, client), priority=COALESCE($8, priority), notes=COALESCE($9, notes),
       job_kind=CASE WHEN $10 THEN $11 ELSE job_kind END, job_record=CASE WHEN $10 THEN $12 ELSE job_record END, job_input=CASE WHEN $10 THEN $13::jsonb ELSE job_input END,
       waiting_until=CASE WHEN $14 THEN $15::timestamptz ELSE waiting_until END,
       decision_rec=CASE WHEN $16 THEN $17 ELSE decision_rec END,
       done_at=CASE WHEN $3='done' THEN COALESCE(CASE WHEN status='done' THEN done_at END, now()) ELSE NULL END,
       done_note=CASE WHEN $3='done' THEN $4 ELSE NULL END,
       updated_at=CASE WHEN $18 THEN now() ELSE updated_at END
     WHERE id=$1`,
    [old.id, next.title, next.status, next.note, next.due, next.link,
      t.client === undefined ? null : oneLine(t.client, 120), t.priority ?? null, t.details === undefined ? null : String(t.details).slice(0, 2000),
      job !== undefined, job?.kind ?? null, job?.recordId ?? null, job ? JSON.stringify(job.input) : null,
      t.waitingUntil !== undefined, iso(t.waitingUntil) ?? null,
      decision !== undefined, decision ?? null, changed]);
  return { id: Number(old.id), created: false, changed, status: next.status };
}

/** Close the task with this key (done + a note). False when there is no such open task. */
export async function closeAgentTask(db: Db, key: string, note: string): Promise<boolean> {
  const old = (await db.query(`SELECT agent, title, status FROM hq_agent_tasks WHERE source_key=$1`, [key])).rows[0];
  if (!old || old.status === 'done') return false;
  const r = await upsertAgentTask(db, { agent: old.agent, key, title: old.title, status: 'done', note, job: null, waitingUntil: null });
  return !('error' in r);
}

/**
 * The same, for engine stages: a task-list problem must never stop the real work. Logs and
 * returns null instead of throwing.
 */
export async function trackTask(db: Db, t: UpsertAgentTask): Promise<number | null> {
  try {
    const r = await upsertAgentTask(db, t);
    if ('error' in r) { console.error(JSON.stringify({ level: 'warn', message: 'agent task not saved', key: t.key, err: r.error })); return null; }
    return r.id;
  } catch (e) {
    console.error(JSON.stringify({ level: 'warn', message: 'agent task not saved', key: t.key, err: String((e as Error).message ?? e).slice(0, 200) }));
    return null;
  }
}
export async function trackClose(db: Db, key: string, note: string): Promise<void> {
  try { await closeAgentTask(db, key, note); } catch (e) {
    console.error(JSON.stringify({ level: 'warn', message: 'agent task not closed', key, err: String((e as Error).message ?? e).slice(0, 200) }));
  }
}

// ---------- reading ----------
export interface AgentTaskRow {
  id: number; key: string; agent: string; title: string; due: string | null; status: TaskStatus; client: string; note: string; notes: string;
  link: string | null; priority: TaskPriority; created: string; updated: string; done: string | null;
  jobKind: string | null; waitingUntil: string | null; decision: string | null; requeues: number;
}
export interface TaskFlags { overdue: boolean; stalled: boolean; daysLate: number; daysQuiet: number }
export type AgentTask = AgentTaskRow & TaskFlags;

const toRow = (x: any): AgentTaskRow => ({
  id: Number(x.id), key: String(x.source_key ?? ''), agent: String(x.agent), title: String(x.title), due: x.due ?? null, status: x.status,
  client: String(x.client ?? ''), note: String(x.progress_note || ''), notes: String(x.notes ?? ''), link: x.link ?? null, priority: (x.priority ?? 'normal') as TaskPriority,
  created: new Date(x.created_at).toISOString(), updated: new Date(x.updated_at).toISOString(), done: x.done_at ? new Date(x.done_at).toISOString() : null,
  jobKind: x.job_kind ?? null, waitingUntil: x.waiting_until ? new Date(x.waiting_until).toISOString() : null, decision: x.decision_rec ?? null, requeues: Number(x.requeues ?? 0),
});

/** Overdue = due before today (New York); stalled = not done, no change for STALE_DAYS, not in a planned wait. Pure. */
export function taskFlags(t: Pick<AgentTaskRow, 'status' | 'due' | 'updated' | 'waitingUntil'>, now = new Date()): TaskFlags {
  if (t.status === 'done') return { overdue: false, stalled: false, daysLate: 0, daysQuiet: 0 };
  const today = nyDate(now);
  const overdue = !!t.due && t.due < today;
  const daysLate = overdue ? Math.round((Date.parse(`${today}T12:00:00Z`) - Date.parse(`${t.due}T12:00:00Z`)) / DAY) : 0;
  const quietMs = now.getTime() - Date.parse(t.updated);
  const waiting = !!t.waitingUntil && Date.parse(t.waitingUntil) > now.getTime();
  const stalled = !waiting && quietMs >= STALE_DAYS * DAY;
  return { overdue, stalled, daysLate, daysQuiet: Math.max(0, Math.floor(quietMs / DAY)) };
}

/** Open tasks (and, with doneDays, the ones finished in the last N days), soonest first. */
export async function listAgentTasks(db: Db, opts: { agent?: AgentName; doneDays?: number; owner?: boolean; limit?: number } = {}, now = new Date()): Promise<AgentTask[]> {
  const r = await db.query(
    `SELECT *, to_char(due_date,'YYYY-MM-DD') AS due FROM hq_agent_tasks
     WHERE ($1::text IS NULL OR agent=$1) AND (status<>'done' OR ($2::int > 0 AND done_at > now() - ($2::int * interval '1 day')))
     ORDER BY status='done', CASE status WHEN 'waiting_alex' THEN 0 WHEN 'in_progress' THEN 1 ELSE 2 END, due_date NULLS LAST, updated_at, id LIMIT $3`,
    [opts.agent ?? null, Math.max(0, opts.doneDays ?? 0), Math.min(500, opts.limit ?? 200)]);
  return r.rows.map(toRow).filter((t) => opts.owner !== false || !OWNER_ONLY.includes(t.agent)).map((t) => ({ ...t, ...taskFlags(t, now) }));
}

export interface WorkSummary { agent: AgentName; open: number; inProgress: number; waitingAlex: number; overdue: number; stalled: number }
/** Per agent: open (not done), in progress, waiting on Alex, overdue, stalled. Pure. */
export function workSummary(tasks: AgentTask[], agents: readonly AgentName[] = AGENT_NAMES): WorkSummary[] {
  return agents.map((agent) => {
    const mine = tasks.filter((t) => t.agent === agent && t.status !== 'done');
    return { agent, open: mine.length, inProgress: mine.filter((t) => t.status === 'in_progress').length, waitingAlex: mine.filter((t) => t.status === 'waiting_alex').length, overdue: mine.filter((t) => t.overdue).length, stalled: mine.filter((t) => t.stalled).length };
  });
}

// ---------- Ada's daily stale-task check ----------
export interface StaleLine { taskId: number; agent: string; title: string; why: string; action: 'requeued' | 'would_requeue' | 'flagged' | 'running'; jobId?: number }

/** Why a task is late, in a few words ("2 d overdue", "no update for 3 d", "waiting on you 4 d"). Pure. */
export function staleWhy(t: AgentTask): string {
  const parts: string[] = [];
  if (t.overdue) parts.push(`${t.daysLate} d overdue`);
  if (t.stalled) parts.push(t.status === 'waiting_alex' ? `waiting on you ${t.daysQuiet} d` : `no update for ${t.daysQuiet} d`);
  return parts.join(', ');
}
/** The tasks Ada flags: overdue or stalled. Pure. */
export const staleTasks = (tasks: AgentTask[]) => tasks.filter((t) => t.status !== 'done' && (t.overdue || t.stalled));
/** Can Ada re-queue this one? A stalled task (not waiting on Alex) with a known engine job, under the re-queue cap. */
export const canRequeue = (t: AgentTask, kinds: Set<string>) => t.stalled && t.status !== 'waiting_alex' && !!t.jobKind && kinds.has(t.jobKind) && t.requeues < MAX_REQUEUES;

/**
 * Ada's daily check: every overdue or stalled task, one line each. A stalled task tied to an
 * engine job is re-queued through the normal queue (dry run unless its stage is in LIVE_STAGES;
 * one request per task per day; a job already running is left alone). With apply=false nothing is
 * queued or changed ("would re-queue").
 */
export async function checkStaleTasks(db: Db, cfg: Pick<Config, 'dryRun' | 'liveStages'>, opts: { now?: Date; apply?: boolean } = {}): Promise<StaleLine[]> {
  const now = opts.now ?? new Date();
  const { STAGES } = await import('../stages/index.js'); // loaded on use: stages import this file
  const kinds = new Set(Object.keys(STAGES));
  const out: StaleLine[] = [];
  const raw = (await db.query(`SELECT *, to_char(due_date,'YYYY-MM-DD') AS due FROM hq_agent_tasks WHERE status<>'done' ORDER BY due_date NULLS LAST, updated_at, id`)).rows;
  for (const t of staleTasks(raw.map(toRow).map((x) => ({ ...x, ...taskFlags(x, now) })))) {
    const line: StaleLine = { taskId: t.id, agent: t.agent, title: t.title, why: staleWhy(t), action: 'flagged' };
    if (canRequeue(t, kinds)) {
      if (!opts.apply) line.action = 'would_requeue';
      else {
        const def = STAGES[t.jobKind!];
        const job = (await db.query(`SELECT job_record, job_input FROM hq_agent_tasks WHERE id=$1`, [t.id])).rows[0];
        const r = await enqueue(db, {
          kind: t.jobKind!, recordId: String(job.job_record), input: job.job_input ?? {}, requestId: `ada-requeue:${t.id}:${nyDate(now)}`,
          dryRun: cfg.dryRun && !cfg.liveStages.includes(t.jobKind!), maxAttempts: def.maxAttempts, deadlineMs: def.deadlineMs,
        });
        line.jobId = Number(r.job.id);
        if (r.status === 'queued') {
          line.action = 'requeued';
          await upsertAgentTask(db, { agent: t.agent, key: t.key, title: t.title, status: t.status === 'open' ? 'in_progress' : t.status, note: `Re-queued by Ada (job ${r.job.id}): ${t.note || 'no progress'}`.slice(0, 300) });
          await db.query(`UPDATE hq_agent_tasks SET requeues=requeues+1, requeued_at=now() WHERE id=$1`, [t.id]);
        } else line.action = r.status === 'already_active' ? 'running' : 'requeued'; // duplicate_request = already re-queued today
      }
    }
    out.push(line);
  }
  return out;
}

/** The brief's "Agent work" lines (Slack mrkdwn), at most `max`, one line each. Pure. */
export function agentWorkLines(lines: StaleLine[], max = 5): string[] {
  const act: Record<StaleLine['action'], string> = { requeued: ' → re-queued', would_requeue: ' → would re-queue (dry run)', running: ' → its job is still running', flagged: '' };
  const short = (s: string, n = 60) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);
  const out = lines.slice(0, max).map((l) => `• ${l.agent}: ${short(l.title)} (${l.why})${act[l.action]}`);
  if (lines.length > max) out.push(`• +${lines.length - max} more on Team`);
  return out;
}

/** A due date N days from today, New York. */
export const dueIn = (days: number, now = new Date()) => addDays(nyDate(now), days);

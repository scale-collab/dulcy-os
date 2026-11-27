// HQ Agents and the team check: each agent's runs (engine jobs), decisions waiting, Activity Log
// rows, own to-do list and reports; and Ada's one line per agent (✓ ran fine / ⚠️ what's off).
import type { Db } from '../db/pool.js';
import { ACTIVITY, AF, agentFormula } from '../activity.js';
import { AGENTS, AGENT_NAMES, agentForJob, jobPatternsFor, type AgentName } from './agents.js';
import type { DecisionCard, HqAirtable } from './decisions.js';
import { listAgentTasks, type AgentTask } from './agentTasks.js';

export interface JobRun { id: number; kind: string; status: string; at: string; message: string; dryRun: boolean }
export interface AgentStatus { agent: AgentName; ok: boolean | null; line: string }

const short = (s: string, n = 90) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);
const ago = (iso: string, now: number) => {
  const m = Math.round((now - Date.parse(iso)) / 60_000);
  return m < 60 ? `${Math.max(1, m)} min ago` : m < 48 * 60 ? `${Math.round(m / 60)} h ago` : `${Math.round(m / 1440)} d ago`;
};

export async function agentRuns(db: Db, agent: AgentName, limit = 10): Promise<JobRun[]> {
  const r = await db.query(
    `SELECT id, kind, status, updated_at, dry_run, COALESCE(result->>'message', error, progress, '') AS message
     FROM jobs WHERE kind LIKE ANY($1) ORDER BY id DESC LIMIT $2`, [jobPatternsFor(agent), limit]);
  return r.rows.map((x) => ({ id: Number(x.id), kind: String(x.kind), status: String(x.status), at: new Date(x.updated_at).toISOString(), message: short(String(x.message ?? ''), 300), dryRun: Boolean(x.dry_run) }));
}

/** Last success and last failure per agent, and failures in the last 24 h not followed by a success of the same kind. */
export async function jobHealth(db: Db): Promise<Map<AgentName, { lastOk?: string; lastFail?: string; openFails: { kind: string; at: string; error: string }[] }>> {
  const rows = (await db.query(
    `SELECT DISTINCT ON (kind, ok) kind, ok, updated_at, error FROM (
       SELECT kind, status='succeeded' AS ok, updated_at, error FROM jobs
       WHERE status IN ('succeeded','failed','needs_review') AND updated_at > now() - interval '14 days') j
     ORDER BY kind, ok, updated_at DESC`)).rows;
  const out = new Map<AgentName, { lastOk?: string; lastFail?: string; openFails: { kind: string; at: string; error: string }[] }>();
  const byKind = new Map<string, { ok?: string; fail?: string; error?: string }>();
  for (const r of rows) {
    const e = byKind.get(r.kind) ?? {};
    const at = new Date(r.updated_at).toISOString();
    if (r.ok) e.ok = at; else { e.fail = at; e.error = String(r.error ?? ''); }
    byKind.set(r.kind, e);
  }
  for (const [kind, e] of byKind) {
    const agent = agentForJob(kind);
    if (!agent) continue;
    const a = out.get(agent) ?? { openFails: [] };
    if (e.ok && (!a.lastOk || e.ok > a.lastOk)) a.lastOk = e.ok;
    if (e.fail && (!a.lastFail || e.fail > a.lastFail)) a.lastFail = e.fail;
    if (e.fail && (!e.ok || e.fail > e.ok) && Date.now() - Date.parse(e.fail) < 86_400_000) a.openFails.push({ kind, at: e.fail, error: short(e.error ?? '', 120) });
    out.set(agent, a);
  }
  return out;
}

/** One line per agent. Pure: from job health and the pending decisions. */
export function teamCheck(health: Awaited<ReturnType<typeof jobHealth>>, decisions: Pick<DecisionCard, 'agent' | 'created'>[], now = Date.now(), agents: readonly AgentName[] = AGENT_NAMES): AgentStatus[] {
  return agents.map((agent) => {
    const h = health.get(agent);
    const waiting = decisions.filter((d) => d.agent === agent);
    if (h?.openFails.length) {
      const f = h.openFails[0];
      return { agent, ok: false, line: `⚠️ ${f.kind} failed ${ago(f.at, now)}${f.error ? `: ${f.error}` : ''}${h.openFails.length > 1 ? ` (+${h.openFails.length - 1} more)` : ''}` };
    }
    if (waiting.length) {
      const oldest = waiting.map((d) => d.created).filter(Boolean).sort()[0];
      return { agent, ok: false, line: `⚠️ waiting on you: ${waiting.length} decision${waiting.length === 1 ? '' : 's'}${oldest ? ` (oldest ${ago(oldest, now)})` : ''}` };
    }
    if (h?.lastOk) return { agent, ok: true, line: `✓ ran fine (${ago(h.lastOk, now)})` };
    return { agent, ok: null, line: '· no runs in the last 14 days' };
  });
}

export interface ActivityRow { id: string; event: string; when: string; type: string; details: string }
export async function agentActivity(at: Pick<HqAirtable, 'list'>, agent: AgentName, limit = 10): Promise<ActivityRow[]> {
  const rows = await at.list(ACTIVITY, agentFormula('Agent', agent), [AF.event, AF.when, AF.agent, AF.type, AF.details], limit, { sortField: AF.when, sortDesc: true });
  const s = (v: unknown) => (v === undefined || v === null ? '' : typeof v === 'object' ? String((v as any).name ?? '') : String(v));
  return rows.map((r) => ({ id: r.id, event: s(r.fields[AF.event]), when: s(r.fields[AF.when]), type: s(r.fields[AF.type]), details: short(s(r.fields[AF.details]), 600) }));
}

export type { AgentTask } from './agentTasks.js';
/** An agent's open tasks (with includeDone, also those finished in the last 7 days), with overdue / stalled flags. */
export async function agentTasks(db: Db, agent?: AgentName, includeDone = false): Promise<AgentTask[]> {
  return listAgentTasks(db, { agent, doneDays: includeDone ? 7 : 0, limit: 100 });
}

export async function finishAgentTask(db: Db, id: number, note = 'Done in HQ'): Promise<boolean> {
  return ((await db.query(`UPDATE hq_agent_tasks SET status='done', done_at=now(), done_note=$2, progress_note=$2, updated_at=now(), job_kind=NULL, waiting_until=NULL WHERE id=$1 AND status<>'done'`, [id, note.slice(0, 300)])).rowCount ?? 0) > 0;
}

export { AGENTS };

// ---------- Batch 4b: "What everyone is working on" (Team board) ----------
// Alex, 2026-11-27: "what is everyone working on, upcoming deadlines, recent activity, with
// filters (project board, team-wise)". Built from the agents' own task lists and their engine runs;
// reads only. Members never get the owner-only agents (Ledger, Sienna) or their runs.
export const BOARD_STATUSES = ['all', 'open', 'in_progress', 'waiting_alex', 'done', 'late', 'stuck'] as const;
export type BoardStatus = (typeof BOARD_STATUSES)[number];
export const BOARD_DUES = ['any', 'overdue', 'today', 'week', 'none'] as const;
export type BoardDue = (typeof BOARD_DUES)[number];
export interface BoardFilters { agent?: AgentName | null; client?: string; status?: BoardStatus; due?: BoardDue }
export interface BoardAgent {
  agent: AgentName; role: string;
  /** What it is on now: its most recently moved task in progress, else waiting on you, else not started. */
  current: AgentTask | null;
  /** Its next deadline (soonest due, not done). */
  next: AgentTask | null;
  open: number; late: number; stuck: number; waitingAlex: number;
  /** Its last engine run (time and whether it went fine). */
  lastRun: { at: string; ok: boolean; kind: string } | null;
}
export interface BoardEvent { at: string; agent: AgentName; kind: 'task_done' | 'task_moved' | 'task_new' | 'run_failed' | 'runs_ok'; text: string; taskId?: number }
export interface BoardRun { kind: string; status: string; at: string; message: string }
export interface Board {
  filters: Required<Omit<BoardFilters, 'agent'>> & { agent: AgentName | null };
  agents: BoardAgent[];
  /** The filtered tasks (open ones and those done in the last 7 days), board order. */
  tasks: AgentTask[];
  /** Open tasks due in the next 14 days or late, soonest first (filtered). */
  deadlines: AgentTask[];
  /** The last 3 days: tasks closed, moved or opened; failed runs one by one; fine runs one line per agent (filtered). */
  activity: BoardEvent[];
  /** Clients that have tasks (for the client filter). */
  clients: string[];
}

export const isBoardStatus = (x: unknown): x is BoardStatus => (BOARD_STATUSES as readonly unknown[]).includes(x);
export const isBoardDue = (x: unknown): x is BoardDue => (BOARD_DUES as readonly unknown[]).includes(x);
const BOARD_DAY = 86_400_000;

/** Does a task pass the status and due filters? Pure. */
export function taskMatches(t: AgentTask, f: BoardFilters, today: string): boolean {
  if (f.agent && t.agent !== f.agent) return false;
  if (f.client && t.client.toLowerCase() !== f.client.toLowerCase()) return false;
  const st = f.status ?? 'all';
  if (st === 'late' ? !t.overdue : st === 'stuck' ? !t.stalled : st !== 'all' && t.status !== st) return false;
  const due = f.due ?? 'any';
  if (due === 'overdue' && !t.overdue) return false;
  if (due === 'today' && (t.status === 'done' || t.due !== today)) return false;
  if (due === 'week' && (t.status === 'done' || !t.due || t.due > addDaysYmd(today, 7))) return false;
  if (due === 'none' && t.due) return false;
  return true;
}
const addDaysYmd = (ymd: string, n: number) => { const d = new Date(`${ymd}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const nyYmd = (d: Date) => d.toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
const ORDER: Record<string, number> = { in_progress: 0, waiting_alex: 1, open: 2, done: 3 };

/** The board. Pure: from the tasks and runs that were read. */
export function teamBoard(tasks: AgentTask[], runs: BoardRun[], f: BoardFilters, now = new Date(), agents: readonly AgentName[] = AGENT_NAMES): Board {
  const today = nyYmd(now);
  const mine = tasks.filter((t) => (agents as readonly string[]).includes(t.agent));
  const open = (t: AgentTask) => t.status !== 'done';
  const byUpdated = (a: AgentTask, b: AgentTask) => b.updated.localeCompare(a.updated) || b.id - a.id;
  const byDue = (a: AgentTask, b: AgentTask) => String(a.due).localeCompare(String(b.due)) || a.id - b.id;
  const agentRows: BoardAgent[] = agents.filter((a) => !f.agent || a === f.agent).map((agent) => {
    const ts = mine.filter((t) => t.agent === agent && open(t));
    const pick = (st: string) => ts.filter((t) => t.status === st).sort(byUpdated)[0];
    const last = runs.filter((r) => agentForJob(r.kind) === agent).sort((a, b) => b.at.localeCompare(a.at))[0];
    return {
      agent, role: AGENTS[agent].role, current: pick('in_progress') ?? pick('waiting_alex') ?? pick('open') ?? null,
      next: ts.filter((t) => t.due).sort(byDue)[0] ?? null,
      open: ts.length, late: ts.filter((t) => t.overdue).length, stuck: ts.filter((t) => t.stalled).length, waitingAlex: ts.filter((t) => t.status === 'waiting_alex').length,
      lastRun: last ? { at: last.at, ok: last.status === 'succeeded', kind: last.kind } : null,
    };
  });
  const filtered = mine.filter((t) => taskMatches(t, f, today))
    .sort((a, b) => (ORDER[a.status] ?? 9) - (ORDER[b.status] ?? 9) || Number(b.overdue) - Number(a.overdue) || (a.due ? 0 : 1) - (b.due ? 0 : 1) || byDue(a, b));
  const horizon = addDaysYmd(today, 14);
  const deadlines = filtered.filter((t) => open(t) && t.due && t.due <= horizon).sort(byDue).slice(0, 30);

  const since = now.getTime() - 3 * BOARD_DAY;
  const events: BoardEvent[] = [];
  const scoped = mine.filter((t) => (!f.agent || t.agent === f.agent) && (!f.client || t.client.toLowerCase() === f.client.toLowerCase()));
  for (const t of scoped) {
    const a = t.agent as AgentName;
    if (t.status === 'done' && t.done && Date.parse(t.done) >= since) events.push({ at: t.done, agent: a, kind: 'task_done', text: `Closed "${t.title}"${t.note ? `: ${short(t.note, 120)}` : ''}`, taskId: t.id });
    else if (t.status !== 'done' && Date.parse(t.updated) >= since) {
      const fresh = Math.abs(Date.parse(t.updated) - Date.parse(t.created)) < 60_000;
      events.push({ at: t.updated, agent: a, kind: fresh ? 'task_new' : 'task_moved', text: fresh ? `Opened "${t.title}"` : `"${t.title}": ${short(t.note || 'moved', 120)}`, taskId: t.id });
    }
  }
  if (!f.client) {
    const recent = runs.filter((r) => Date.parse(r.at) >= since);
    for (const agent of agents) {
      if (f.agent && agent !== f.agent) continue;
      const rs = recent.filter((r) => agentForJob(r.kind) === agent);
      for (const r of rs.filter((x) => x.status === 'failed' || x.status === 'needs_review').slice(0, 5)) events.push({ at: r.at, agent, kind: 'run_failed', text: `${r.kind} ${r.status === 'failed' ? 'failed' : 'needs a look'}${r.message ? `: ${short(r.message, 120)}` : ''}` });
      const ok = rs.filter((x) => x.status === 'succeeded');
      if (ok.length) events.push({ at: ok.map((x) => x.at).sort().at(-1)!, agent, kind: 'runs_ok', text: `${ok.length} run${ok.length === 1 ? '' : 's'} went fine (${[...new Set(ok.map((x) => x.kind))].slice(0, 3).join(', ')})` });
    }
  }
  events.sort((a, b) => b.at.localeCompare(a.at));
  const clients = [...new Set(mine.map((t) => t.client).filter(Boolean))].sort((a, b) => a.localeCompare(b));
  return {
    filters: { agent: f.agent ?? null, client: f.client ?? '', status: f.status ?? 'all', due: f.due ?? 'any' },
    agents: agentRows, tasks: filtered.slice(0, 200), deadlines, activity: events.slice(0, 40), clients,
  };
}

/** Read and build the board for this person. Members never get Ledger or Sienna (their tasks or runs). */
export async function loadTeamBoard(db: Db, owner: boolean, agents: readonly AgentName[], f: BoardFilters, now = new Date()): Promise<Board> {
  const [tasks, runs] = await Promise.all([
    listAgentTasks(db, { doneDays: 7, owner, limit: 500 }, now),
    db.query(`SELECT kind, status, updated_at, left(COALESCE(result->>'message', error, progress, ''), 200) AS message FROM jobs
      WHERE updated_at > now() - interval '3 days' AND status IN ('succeeded','failed','needs_review') ORDER BY updated_at DESC LIMIT 1000`)
      .then((r) => r.rows.map((x) => ({ kind: String(x.kind), status: String(x.status), at: new Date(x.updated_at).toISOString(), message: String(x.message ?? '') }))),
  ]);
  return teamBoard(tasks, runs.filter((r) => { const a = agentForJob(r.kind); return !!a && agents.includes(a); }), f, now, agents);
}

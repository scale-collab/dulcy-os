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

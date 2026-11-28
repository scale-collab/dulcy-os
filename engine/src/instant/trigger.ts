// Start a job now because its work just arrived (a webhook, an HQ action, another job finishing).
// Bursts become one run:
//   • a job of this kind and record is already queued → nothing new (it has not read anything yet, it will see the new work);
//   • it is running → one more run right after it ends (job_reruns; the running job may have read before the event);
//   • none active → queued now, request id = kind + record + INSTANT_WINDOW_SEC window (the existing de-dup);
//   • one already ran in this window → one catch-up run at the end of the window (…:tail), never more.
// So 10 replies in a burst = 1 Echo run, and nothing that arrived is left waiting for a timer.
// The work itself never runs here: this only writes a queue row (LIVE_STAGES / DRY_RUN decide dry run as always).
import type { Db } from '../db/pool.js';
import type { Config } from '../config.js';
import { enqueue, type Job } from '../queue.js';
import { STAGES } from '../stages/index.js';

export interface TriggerSpec { kind: string; recordId: string; input?: Record<string, unknown>; reason: string }
export type TriggerResult = 'queued' | 'coalesced' | 'rerun' | 'tail' | 'unknown_kind';

const dryOf = (cfg: Config, kind: string) => cfg.dryRun && !cfg.liveStages.includes(kind);

export async function trigger(db: Db, cfg: Config, t: TriggerSpec, now = Date.now()): Promise<TriggerResult> {
  const def = STAGES[t.kind];
  if (!def) return 'unknown_kind';
  const active = async (): Promise<TriggerResult | null> => {
    const a = (await db.query<Job>(`SELECT id, status FROM jobs WHERE kind=$1 AND record_id=$2 AND status IN ('queued','running') LIMIT 1`, [t.kind, t.recordId])).rows[0];
    if (!a) return null;
    if (a.status === 'queued') return 'coalesced';
    await db.query(`INSERT INTO job_reruns (kind, record_id, input, reason) VALUES ($1,$2,$3,$4)
      ON CONFLICT (kind, record_id) DO UPDATE SET reason = EXCLUDED.reason, input = EXCLUDED.input`, [t.kind, t.recordId, t.input ?? {}, t.reason.slice(0, 200)]);
    return 'rerun';
  };
  const first = await active();
  if (first) return first;
  const windowMs = Math.max(5, cfg.instantWindowSec ?? 30) * 1000;
  const slot = Math.floor(now / windowMs);
  const base = { kind: t.kind, recordId: t.recordId, input: t.input ?? {}, dryRun: dryOf(cfg, t.kind), maxAttempts: def.maxAttempts, deadlineMs: def.deadlineMs };
  const r = await enqueue(db, { ...base, requestId: `instant:${t.kind}:${t.recordId}:${slot}` });
  if (r.status === 'queued') return 'queued';
  if (r.status === 'already_active') return (await active()) ?? 'coalesced';
  // A run of this window already finished: one catch-up run when the window ends.
  const tail = await enqueue(db, { ...base, requestId: `instant:${t.kind}:${t.recordId}:${slot}:tail`, runAfterMs: (slot + 1) * windowMs - now });
  if (tail.status === 'queued') return 'tail';
  if (tail.status === 'already_active') return (await active()) ?? 'coalesced';
  return 'coalesced';
}

/** After a job ends: if events came in while it ran, start it once more now. */
export async function consumeRerun(db: Db, cfg: Config, job: Pick<Job, 'id' | 'kind' | 'record_id'>): Promise<TriggerResult | null> {
  const r = (await db.query(`DELETE FROM job_reruns WHERE kind=$1 AND record_id=$2 RETURNING input, reason`, [job.kind, job.record_id])).rows[0];
  if (!r) return null;
  const def = STAGES[job.kind];
  if (!def) return 'unknown_kind';
  // Right away (not at the end of the window): the run that just ended is the one that may have missed it.
  const q = await enqueue(db, { kind: job.kind, recordId: job.record_id, input: r.input ?? {}, requestId: `instant:rerun:${job.id}`, dryRun: dryOf(cfg, job.kind), maxAttempts: def.maxAttempts, deadlineMs: def.deadlineMs });
  return q.status === 'queued' ? 'queued' : 'coalesced';
}

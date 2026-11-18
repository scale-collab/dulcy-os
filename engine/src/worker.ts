import type { Db } from './db/pool.js';
import type { Config } from './config.js';
import { claim, fail, finish, renewLease, type Job } from './queue.js';
import { JobContext } from './context.js';
import { STAGES } from './stages/index.js';
import { NeedsReviewError, PermanentError } from './errors.js';
import { alert, logEvent } from './log.js';

/** Run one job if there is one. Returns true when a job was processed. */
export async function runOnce(db: Db, cfg: Config): Promise<boolean> {
  const job = await claim(db, cfg.workerId, cfg.leaseMs);
  if (!job) return false;
  await runJob(db, cfg, job);
  return true;
}

async function runJob(db: Db, cfg: Config, job: Job): Promise<void> {
  const def = STAGES[job.kind];
  const ctx = new JobContext(db, cfg, job);
  if (!def) {
    await fail(db, job, `unknown job kind "${job.kind}"`, { retryable: false });
    await notify(cfg, job, 'failed', `unknown job kind "${job.kind}"`);
    return;
  }
  if (job.deadline_at && new Date(job.deadline_at).getTime() < Date.now()) {
    await fail(db, job, 'job passed its time limit', { retryable: false });
    await notify(cfg, job, 'failed', 'job passed its time limit');
    return;
  }
  // Keep the lease alive while the stage runs.
  const renew = setInterval(() => { void renewLease(db, job.id, cfg.workerId, cfg.leaseMs); }, Math.max(1000, cfg.leaseMs / 3));
  try {
    await ctx.log('job started', { kind: job.kind, attempt: job.attempts, dryRun: ctx.dryRun });
    const result = await def.run(ctx);
    await finish(db, job.id, result);
    await ctx.log('job succeeded', { result });
  } catch (e) {
    const msg = String((e as Error).message ?? e);
    const outcome = await fail(db, job, msg, {
      retryable: !(e instanceof PermanentError) && !(e instanceof NeedsReviewError),
      needsReview: e instanceof NeedsReviewError,
    });
    await logEvent(db, 'error', `job ${outcome}`, { error: msg }, job.id);
    if (outcome !== 'retrying') await notify(cfg, job, outcome, msg);
  } finally {
    clearInterval(renew);
  }
}

function notify(cfg: Config, job: Job, outcome: string, msg: string) {
  return alert(cfg.slackWebhookUrl, `:warning: Lead engine job ${job.id} (${job.kind}, record ${job.record_id}) ${outcome}: ${msg}`);
}

/** Loop forever, idling briefly when the queue is empty. */
export async function workLoop(db: Db, cfg: Config, signal: AbortSignal): Promise<void> {
  while (!signal.aborted) {
    let did = false;
    try { did = await runOnce(db, cfg); } catch (e) { console.error(JSON.stringify({ level: 'error', message: 'worker loop error', err: String(e) })); }
    if (!did) await new Promise((r) => setTimeout(r, 2000));
  }
}

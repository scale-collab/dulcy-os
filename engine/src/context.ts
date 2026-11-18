import type { Db } from './db/pool.js';
import type { Config } from './config.js';
import type { Job } from './queue.js';
import { logEvent } from './log.js';
import { NeedsReviewError, PermanentError, RetryableError } from './errors.js';

export interface PaidCall<T> {
  /** Unique identity of this call inside the step, e.g. 'batch-3'. */
  callKey: string;
  provider: string;
  /** Credits/rows this call may spend; checked against the caps before calling. */
  units: number;
  /** The real call. Never run in dry-run mode. */
  run: () => Promise<T>;
  /** What to return in dry-run mode. */
  dryRunResult: () => T;
}

/**
 * Everything a stage handler gets. Stages are written as a list of `step()` calls;
 * finished steps are skipped on retry, and paid work goes through `paid()`.
 */
export class JobContext {
  constructor(
    readonly db: Db,
    readonly cfg: Config,
    readonly job: Job,
  ) {}

  get dryRun(): boolean { return this.cfg.dryRun || this.job.dry_run; }

  log(message: string, data: Record<string, unknown> = {}, level: 'info' | 'warn' | 'error' = 'info') {
    return logEvent(this.db, level, message, data, this.job.id);
  }

  /**
   * Run a checkpointed step. If it already finished in an earlier attempt, its saved
   * output is returned and the work is not repeated. Each step has a time limit.
   */
  async step<T>(stepKey: string, fn: () => Promise<T>, opts: { timeoutMs?: number } = {}): Promise<T> {
    const prior = await this.db.query('SELECT status, output FROM steps WHERE job_id = $1 AND step_key = $2', [this.job.id, stepKey]);
    if (prior.rows[0]?.status === 'done') return prior.rows[0].output as T;

    await this.db.query(
      `INSERT INTO steps (job_id, step_key, status, attempts) VALUES ($1,$2,'running',1)
       ON CONFLICT (job_id, step_key) DO UPDATE SET status='running', attempts = steps.attempts + 1, error = NULL, started_at = now(), finished_at = NULL`,
      [this.job.id, stepKey],
    );
    const timeoutMs = opts.timeoutMs ?? this.cfg.stepTimeoutMs;
    const started = Date.now();
    let timer: NodeJS.Timeout | undefined;
    try {
      const output = await Promise.race([
        fn(),
        new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new RetryableError(`step "${stepKey}" timed out after ${timeoutMs} ms`)), timeoutMs); }),
      ]);
      await this.db.query(`UPDATE steps SET status='done', output=$3, finished_at=now() WHERE job_id=$1 AND step_key=$2`, [this.job.id, stepKey, JSON.stringify(output ?? null)]);
      await this.log('step done', { step: stepKey, ms: Date.now() - started });
      return output;
    } catch (e) {
      await this.db.query(`UPDATE steps SET status='failed', error=$3, finished_at=now() WHERE job_id=$1 AND step_key=$2`, [this.job.id, stepKey, String((e as Error).message ?? e)]);
      await this.log('step failed', { step: stepKey, ms: Date.now() - started, error: String((e as Error).message ?? e) }, 'error');
      throw e;
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  /**
   * A paid provider call with a receipt written first:
   *  - a finished receipt  → the saved answer is returned; never pay twice;
   *  - a pending receipt   → the last attempt's outcome is unknown → needs review, never auto-retried;
   *  - over a credit cap   → needs review before anything is spent;
   *  - dry-run             → nothing is called; a dry_run receipt is recorded.
   */
  async paid<T>(c: PaidCall<T>): Promise<T> {
    const key = `${this.job.id}:${c.provider}:${c.callKey}`;
    const prior = await this.db.query('SELECT status, response FROM receipts WHERE receipt_key = $1', [key]);
    const p = prior.rows[0];
    if (p?.status === 'done' || p?.status === 'dry_run') return p.response as T;
    if (p?.status === 'pending') {
      throw new NeedsReviewError(`paid call ${key} has an unclear outcome from an earlier attempt; check ${c.provider} before retrying`);
    }

    await this.checkCaps(c.provider, c.units);

    if (this.dryRun) {
      const result = c.dryRunResult();
      await this.db.query(
        `INSERT INTO receipts (receipt_key, job_id, provider, units, status, response, finished_at) VALUES ($1,$2,$3,$4,'dry_run',$5, now())
         ON CONFLICT (receipt_key) DO UPDATE SET status='dry_run', response=EXCLUDED.response, finished_at=now()`,
        [key, this.job.id, c.provider, c.units, JSON.stringify(result ?? null)],
      );
      await this.log('paid call skipped (dry run)', { provider: c.provider, call: c.callKey, units: c.units });
      return result;
    }

    // Receipt first. If the process dies after this line, the next attempt sees 'pending'.
    await this.db.query(
      `INSERT INTO receipts (receipt_key, job_id, provider, units, status) VALUES ($1,$2,$3,$4,'pending')
       ON CONFLICT (receipt_key) DO UPDATE SET status='pending', error=NULL`,
      [key, this.job.id, c.provider, c.units],
    );
    try {
      const result = await c.run();
      await this.db.query(`UPDATE receipts SET status='done', response=$2, finished_at=now() WHERE receipt_key=$1`, [key, JSON.stringify(result ?? null)]);
      await this.log('paid call done', { provider: c.provider, call: c.callKey, units: c.units });
      return result;
    } catch (e) {
      // Only a failure we know happened before anything was charged may be retried.
      if (e instanceof RetryableError || e instanceof PermanentError) {
        await this.db.query(`UPDATE receipts SET status='failed', error=$2, finished_at=now() WHERE receipt_key=$1`, [key, String(e.message)]);
      }
      // Any other error leaves the receipt 'pending' on purpose (outcome unclear).
      throw e;
    }
  }

  private async checkCaps(provider: string, units: number): Promise<void> {
    if (units <= 0) return;
    const job = await this.db.query(
      `SELECT COALESCE(SUM(units),0)::float AS used FROM receipts WHERE job_id=$1 AND provider=$2 AND status IN ('pending','done','dry_run')`,
      [this.job.id, provider],
    );
    if (Number(job.rows[0].used) + units > this.cfg.capPerJob) {
      throw new NeedsReviewError(`credit cap: this job would use ${Number(job.rows[0].used) + units} ${provider} units (cap ${this.cfg.capPerJob} per job)`);
    }
    const day = await this.db.query(
      `SELECT COALESCE(SUM(units),0)::float AS used FROM receipts WHERE provider=$1 AND status IN ('pending','done') AND created_at > now() - interval '1 day'`,
      [provider],
    );
    if (!this.dryRun && Number(day.rows[0].used) + units > this.cfg.capPerDay) {
      throw new NeedsReviewError(`credit cap: ${provider} would reach ${Number(day.rows[0].used) + units} units in 24h (cap ${this.cfg.capPerDay})`);
    }
  }
}

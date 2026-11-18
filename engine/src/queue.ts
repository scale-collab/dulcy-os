import type { Db } from './db/pool.js';

export interface Job {
  id: number;
  kind: string;
  record_id: string;
  client_id: string | null;
  input: Record<string, unknown>;
  status: string;
  attempts: number;
  max_attempts: number;
  dry_run: boolean;
  deadline_at: Date | null;
}

export interface EnqueueInput {
  kind: string;
  recordId: string;
  clientId?: string;
  input?: Record<string, unknown>;
  requestId?: string;
  dryRun: boolean;
  maxAttempts?: number;
  /** Whole-job time limit in ms. */
  deadlineMs?: number;
}

export type EnqueueResult =
  | { status: 'queued'; job: Job }
  | { status: 'duplicate_request'; job: Job }
  | { status: 'already_active'; job: Job };

/**
 * Queue a job. A repeated request id returns the original job; a second job for a
 * record that already has an active job of the same kind is refused (returns it).
 */
export async function enqueue(db: Db, e: EnqueueInput): Promise<EnqueueResult> {
  if (e.requestId) {
    const prior = await db.query<Job>('SELECT * FROM jobs WHERE request_id = $1', [e.requestId]);
    if (prior.rows[0]) return { status: 'duplicate_request', job: prior.rows[0] };
  }
  try {
    const r = await db.query<Job>(
      `INSERT INTO jobs (kind, record_id, client_id, input, request_id, dry_run, max_attempts, deadline_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7, CASE WHEN $8::bigint IS NULL THEN NULL ELSE now() + ($8::bigint * interval '1 millisecond') END)
       RETURNING *`,
      [e.kind, e.recordId, e.clientId ?? null, e.input ?? {}, e.requestId ?? null, e.dryRun, e.maxAttempts ?? 3, e.deadlineMs ?? null],
    );
    return { status: 'queued', job: r.rows[0] };
  } catch (err: unknown) {
    if ((err as { code?: string }).code === '23505') {
      const active = await db.query<Job>(
        `SELECT * FROM jobs WHERE kind = $1 AND record_id = $2 AND status IN ('queued','running') LIMIT 1`,
        [e.kind, e.recordId],
      );
      if (active.rows[0]) return { status: 'already_active', job: active.rows[0] };
      if (e.requestId) {
        const prior = await db.query<Job>('SELECT * FROM jobs WHERE request_id = $1', [e.requestId]);
        if (prior.rows[0]) return { status: 'duplicate_request', job: prior.rows[0] };
      }
    }
    throw err;
  }
}

/**
 * Claim the next runnable job with a lease. Expired leases (a crashed worker) are
 * reclaimable, so one stuck job never blocks the queue.
 */
export async function claim(db: Db, workerId: string, leaseMs: number): Promise<Job | null> {
  const r = await db.query<Job>(
    `UPDATE jobs SET status = 'running', lease_owner = $1,
            lease_until = now() + ($2::bigint * interval '1 millisecond'),
            attempts = attempts + 1, updated_at = now()
     WHERE id = (
       SELECT id FROM jobs
       WHERE (status = 'queued' AND run_after <= now())
          OR (status = 'running' AND lease_until < now())
       ORDER BY id
       FOR UPDATE SKIP LOCKED
       LIMIT 1)
     RETURNING *`,
    [workerId, leaseMs],
  );
  return r.rows[0] ?? null;
}

/** Renew the lease while working. Returns false if the job was taken away. */
export async function renewLease(db: Db, jobId: number, workerId: string, leaseMs: number): Promise<boolean> {
  const r = await db.query(
    `UPDATE jobs SET lease_until = now() + ($3::bigint * interval '1 millisecond'), updated_at = now()
     WHERE id = $1 AND lease_owner = $2 AND status = 'running'`,
    [jobId, workerId, leaseMs],
  );
  return (r.rowCount ?? 0) > 0;
}

export async function finish(db: Db, jobId: number, result: unknown): Promise<void> {
  await db.query(
    `UPDATE jobs SET status = 'succeeded', result = $2, lease_owner = NULL, lease_until = NULL, error = NULL, updated_at = now() WHERE id = $1`,
    [jobId, result ?? null],
  );
}

/** Fail a job: retry later with backoff while attempts remain, else mark failed. */
export async function fail(db: Db, job: Job, error: string, opts: { retryable: boolean; needsReview?: boolean }): Promise<'retrying' | 'failed' | 'needs_review'> {
  if (opts.needsReview) {
    await db.query(`UPDATE jobs SET status='needs_review', error=$2, lease_owner=NULL, lease_until=NULL, updated_at=now() WHERE id=$1`, [job.id, error]);
    return 'needs_review';
  }
  if (opts.retryable && job.attempts < job.max_attempts) {
    const backoffMs = Math.min(15 * 60_000, 30_000 * 2 ** (job.attempts - 1));
    await db.query(
      `UPDATE jobs SET status='queued', error=$2, lease_owner=NULL, lease_until=NULL,
              run_after = now() + ($3::bigint * interval '1 millisecond'), updated_at=now() WHERE id=$1`,
      [job.id, error, backoffMs],
    );
    return 'retrying';
  }
  await db.query(`UPDATE jobs SET status='failed', error=$2, lease_owner=NULL, lease_until=NULL, updated_at=now() WHERE id=$1`, [job.id, error]);
  return 'failed';
}

/**
 * Put a running job back in the queue to run again later (it is waiting, not failing).
 * The attempt it used is given back, so waiting never exhausts max_attempts.
 */
export async function snooze(db: Db, jobId: number, waitMs: number, progress: string): Promise<void> {
  await db.query(
    `UPDATE jobs SET status='queued', progress=$2, attempts=GREATEST(attempts-1,0), lease_owner=NULL, lease_until=NULL,
            run_after = now() + ($3::bigint * interval '1 millisecond'), updated_at=now() WHERE id=$1`,
    [jobId, progress, waitMs],
  );
}

export async function getJob(db: Db, id: number) {
  const job = await db.query('SELECT * FROM jobs WHERE id = $1', [id]);
  if (!job.rows[0]) return null;
  const steps = await db.query('SELECT step_key, status, error, attempts, started_at, finished_at FROM steps WHERE job_id = $1 ORDER BY started_at', [id]);
  const events = await db.query('SELECT level, message, data, created_at FROM events WHERE job_id = $1 ORDER BY id DESC LIMIT 50', [id]);
  return { job: job.rows[0], steps: steps.rows, events: events.rows };
}

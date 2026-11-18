/** A failure that may succeed if tried again later (timeouts, 5xx, rate limits). */
export class RetryableError extends Error {
  constructor(message: string) { super(message); this.name = 'RetryableError'; }
}

/** A failure a retry won't fix (bad input, rule broken). The job fails and says why. */
export class PermanentError extends Error {
  constructor(message: string) { super(message); this.name = 'PermanentError'; }
}

/**
 * Not a failure: the work is waiting on someone else (e.g. MillionVerifier is still
 * processing). The job is put back in the queue to run again after `waitMs`, without
 * using up an attempt. The job's time limit still applies, so waiting can't go on forever.
 */
export class WaitError extends Error {
  constructor(message: string, readonly waitMs: number) { super(message); this.name = 'WaitError'; }
}

/** A paid call whose outcome is unclear, or a cap reached: a person must look. */
export class NeedsReviewError extends Error {
  constructor(message: string) { super(message); this.name = 'NeedsReviewError'; }
}

/** A failure that may succeed if tried again later (timeouts, 5xx, rate limits). */
export class RetryableError extends Error {
  constructor(message: string) { super(message); this.name = 'RetryableError'; }
}

/** A failure a retry won't fix (bad input, rule broken). The job fails and says why. */
export class PermanentError extends Error {
  constructor(message: string) { super(message); this.name = 'PermanentError'; }
}

/** A paid call whose outcome is unclear, or a cap reached: a person must look. */
export class NeedsReviewError extends Error {
  constructor(message: string) { super(message); this.name = 'NeedsReviewError'; }
}

// All settings come from environment variables (an .env file on the server).
// Keys never live in Airtable or in job data.

function num(name: string, fallback: number, env: NodeJS.ProcessEnv = process.env): number {
  const v = env[name];
  if (v === undefined || v === '') return fallback;
  const n = Number(v);
  if (!Number.isFinite(n)) throw new Error(`${name} must be a number`);
  return n;
}

export interface Config {
  port: number;
  databaseUrl: string;
  /** Shared secret Airtable uses to sign requests (HMAC-SHA256). */
  engineSecret: string;
  /** true = never call paid providers; every paid step is recorded as dry_run. */
  dryRun: boolean;
  slackWebhookUrl?: string;
  /** Max provider units (credits/rows) per job, per provider. */
  capPerJob: number;
  /** Max provider units per day, per provider. */
  capPerDay: number;
  /** A step running longer than this is treated as stuck. */
  stepTimeoutMs: number;
  /** How long a worker holds a job before it must renew. */
  leaseMs: number;
  /** Requests older than this are rejected (replay protection). */
  maxRequestAgeMs: number;
  workerId: string;
  /** MillionVerifier API key (server .env only). Free status checks need it too. */
  millionVerifierApiKey?: string;
  millionVerifierBaseUrl: string;
  /** How often a waiting verification job checks MillionVerifier again. */
  verifyPollMs: number;
}

export function loadConfig(env = process.env): Config {
  const engineSecret = env.ENGINE_SECRET ?? '';
  if (engineSecret.length < 32) throw new Error('ENGINE_SECRET must be set (32+ characters)');
  const databaseUrl = env.DATABASE_URL ?? '';
  if (!databaseUrl) throw new Error('DATABASE_URL must be set');
  return {
    port: num('PORT', 8080, env),
    databaseUrl,
    engineSecret,
    // Paid calls stay OFF unless DRY_RUN is explicitly "false".
    dryRun: (env.DRY_RUN ?? 'true').toLowerCase() !== 'false',
    slackWebhookUrl: env.SLACK_WEBHOOK_URL || undefined,
    capPerJob: num('CAP_PER_JOB', 100_000, env),
    capPerDay: num('CAP_PER_DAY', 100_000, env),
    stepTimeoutMs: num('STEP_TIMEOUT_MS', 10 * 60_000, env),
    leaseMs: num('LEASE_MS', 60_000, env),
    maxRequestAgeMs: num('MAX_REQUEST_AGE_MS', 5 * 60_000, env),
    workerId: env.WORKER_ID || `worker-${process.pid}`,
    millionVerifierApiKey: env.MILLIONVERIFIER_API_KEY || undefined,
    millionVerifierBaseUrl: env.MILLIONVERIFIER_BASE_URL || 'https://bulkapi.millionverifier.com',
    verifyPollMs: num('VERIFY_POLL_MS', 2 * 60_000, env),
  };
}

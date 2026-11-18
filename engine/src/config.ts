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
  /** Google service-account key file (read-only Sheets access), on the server only. */
  googleKeyFile: string;
  /** Workspace user the service account reads as (domain-wide delegation). */
  googleImpersonateUser?: string;
  googleSheetsBaseUrl: string;
  /** Stages allowed to make real calls while DRY_RUN stays on for everything else. */
  liveStages: string[];
  /** EmailBison API keys per workspace, from EMAILBISON_KEY_<WORKSPACE> (server .env only). */
  emailBisonKeys: Record<string, string>;
  emailBisonBaseUrl: string;
  /** EmailBison workspace (team) IDs per workspace name, from EMAILBISON_TEAM_<WORKSPACE>. */
  emailBisonTeams: Record<string, number>;
  /** How often a waiting campaign build checks EmailBison again (imports, lead totals). */
  bisonPollMs: number;
  /** Bounce check: run every N minutes (0 = off) for these workspaces. */
  bounceCheckEveryMin: number;
  bounceCheckWorkspaces: string[];
  /** DiscoLike API key (server .env only) and base URL. */
  discoLikeApiKey?: string;
  discoLikeBaseUrl: string;
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
    googleKeyFile: env.GOOGLE_KEY_FILE || '/app/secrets/google-sa.json',
    googleImpersonateUser: env.GOOGLE_IMPERSONATE_USER || undefined,
    googleSheetsBaseUrl: env.GOOGLE_SHEETS_BASE_URL || 'https://sheets.googleapis.com',
    liveStages: (env.LIVE_STAGES ?? '').split(',').map((s) => s.trim()).filter(Boolean),
    emailBisonKeys: Object.fromEntries(Object.entries(env)
      .filter(([k, v]) => k.startsWith('EMAILBISON_KEY_') && v)
      .map(([k, v]) => [k.slice('EMAILBISON_KEY_'.length).toLowerCase(), String(v)])),
    emailBisonBaseUrl: env.EMAILBISON_BASE_URL || 'https://send.dulcy.io',
    emailBisonTeams: Object.fromEntries(Object.entries(env)
      .filter(([k, v]) => k.startsWith('EMAILBISON_TEAM_') && Number(v) > 0)
      .map(([k, v]) => [k.slice('EMAILBISON_TEAM_'.length).toLowerCase(), Number(v)])),
    bisonPollMs: num('BISON_POLL_MS', 60_000, env),
    bounceCheckEveryMin: num('BOUNCE_CHECK_EVERY_MIN', 0, env),
    bounceCheckWorkspaces: (env.BOUNCE_CHECK_WORKSPACES ?? '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean),
    discoLikeApiKey: env.DISCOLIKE_API_KEY || undefined,
    discoLikeBaseUrl: env.DISCOLIKE_BASE_URL || 'https://api.discolike.com',
  };
}

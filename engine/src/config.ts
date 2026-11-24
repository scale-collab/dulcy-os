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
  /** Dulcy Agents bot token (decisions loop: post, read ✅/❌ reactions). */
  slackBotToken?: string;
  slackBaseUrl: string;
  /** Channel the decisions go to (name or ID). */
  slackDecisionsChannel: string;
  /** Slack user IDs whose ✅/❌ count (default: Alex, Josh). */
  slackApprovers: string[];
  decisionsPollMs: number;
  /** Max provider units (credits/rows) per job, per provider. */
  capPerJob: number;
  /** Max provider units per day, per provider. */
  capPerDay: number;
  /** Providers with no cap at all (Alex 2026-11-22: company and contact searches run to the
   *  requested size; the Expansion Target is the limit). Default: discolike. */
  /** From this date the legacy DiscoLike contact options use the Contacts run (DiscoLike retires them 2026-12-31). */
  legacyContactsEnd?: string;
  capFreeProviders: string[];
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
  leadMagicApiKey?: string;
  leadMagicBaseUrl: string;
  /** How often a waiting verification job checks MillionVerifier again. */
  verifyPollMs: number;
  /** Google service-account key file (read-only Sheets access), on the server only. */
  googleKeyFile: string;
  /** Workspace user the service account reads as (domain-wide delegation). */
  googleImpersonateUser?: string;
  googleSheetsBaseUrl: string;
  /** OAuth scope asked for; must match domain-wide delegation exactly (read + write since 2026-11-18). */
  googleScope: string;
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
  /** With BOUNCE_CHECK_WORKSPACES=all: the key (EMAILBISON_KEY_<NAME>) used to reach every workspace. */
  bounceCheckKey: string;
  /** DiscoLike API key (server .env only) and base URL. */
  discoLikeApiKey?: string;
  discoLikeBaseUrl: string;
  /** OpenAI: ONE call per lead list for its profile (server .env only). */
  openAiApiKey?: string;
  openAiModel: string;
  /** Model for Generate filters (the old n8n keyword review used gpt-5.6). */
  openAiFilterModel: string;
  /** Generate filters (Alex, 2026-11-23): lookalike companies pulled for the label analysis (max 1000). */
  filterAnalysisCompanies: number;
  /** Generate filters size goal (soft, never a lock): default final leads when no campaign inboxes are linked. */
  defaultLeadGoal: number;
  /** Final leads per company (lead goal / this = companies needed). */
  leadsPerCompany: number;
  /** Share of DiscoLike's free count that turns out real (Alex: 50-70%). */
  countYield: number;
  openAiBaseUrl: string;
  /** Airtable token for the engine (server .env only), the base, and how often buttons are checked (0 = off). */
  airtableApiKey?: string;
  airtableBaseId: string;
  airtableBaseUrl: string;
  airtablePollMs: number;
  /** EmailBison key name (EMAILBISON_KEY_<NAME>) used for Airtable campaign builds; it is switched to the inboxes' workspace on every call. */
  emailBisonBuildWorkspace: string;
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
    slackBotToken: env.SLACK_BOT_TOKEN || undefined,
    slackBaseUrl: env.SLACK_BASE_URL || 'https://slack.com/api',
    slackDecisionsChannel: env.SLACK_DECISIONS_CHANNEL || '#dulcy-decisions',
    slackApprovers: (env.SLACK_APPROVERS ?? 'U070Z26377C,U0ADSEJ9SDR').split(',').map((x) => x.trim()).filter(Boolean),
    decisionsPollMs: num('DECISIONS_POLL_MS', 30_000, env),
    capPerJob: num('CAP_PER_JOB', 100_000, env),
    capPerDay: num('CAP_PER_DAY', 100_000, env),
    legacyContactsEnd: env.LEGACY_CONTACTS_END || '2026-11-24T00:00:00Z', // Alex 2026-11-24: one way only, the Contacts Run
    capFreeProviders: (env.CAP_FREE_PROVIDERS ?? 'discolike').split(',').map((x) => x.trim().toLowerCase()).filter(Boolean),
    stepTimeoutMs: num('STEP_TIMEOUT_MS', 10 * 60_000, env),
    leaseMs: num('LEASE_MS', 60_000, env),
    maxRequestAgeMs: num('MAX_REQUEST_AGE_MS', 5 * 60_000, env),
    workerId: env.WORKER_ID || `worker-${process.pid}`,
    millionVerifierApiKey: env.MILLIONVERIFIER_API_KEY || undefined,
    millionVerifierBaseUrl: env.MILLIONVERIFIER_BASE_URL || 'https://bulkapi.millionverifier.com',
    leadMagicApiKey: env.LEADMAGIC_API_KEY || undefined,
    leadMagicBaseUrl: env.LEADMAGIC_BASE_URL || 'https://api.leadmagic.io',
    verifyPollMs: num('VERIFY_POLL_MS', 2 * 60_000, env),
    googleKeyFile: env.GOOGLE_KEY_FILE || '/app/secrets/google-sa.json',
    googleImpersonateUser: env.GOOGLE_IMPERSONATE_USER || undefined,
    googleSheetsBaseUrl: env.GOOGLE_SHEETS_BASE_URL || 'https://sheets.googleapis.com',
    googleScope: env.GOOGLE_SCOPE || 'https://www.googleapis.com/auth/spreadsheets',
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
    bounceCheckKey: (env.BOUNCE_CHECK_KEY || 'dulcy').trim().toLowerCase(),
    discoLikeApiKey: env.DISCOLIKE_API_KEY || undefined,
    discoLikeBaseUrl: env.DISCOLIKE_BASE_URL || 'https://api.discolike.com',
    openAiApiKey: env.OPENAI_API_KEY || undefined,
    openAiModel: env.OPENAI_MODEL || 'gpt-5.6-luna',
    openAiFilterModel: env.OPENAI_FILTER_MODEL || 'gpt-5.6',
    filterAnalysisCompanies: num('FILTER_ANALYSIS_COMPANIES', 500, env),
    defaultLeadGoal: num('DEFAULT_LEAD_GOAL', 3000, env),
    leadsPerCompany: num('LEADS_PER_COMPANY', 0.4, env),
    countYield: num('COUNT_YIELD', 0.6, env),
    openAiBaseUrl: env.OPENAI_BASE_URL || 'https://api.openai.com',
    airtableApiKey: env.AIRTABLE_API_KEY || undefined,
    airtableBaseId: env.AIRTABLE_BASE_ID || 'appxqINt5XKw7a76A',
    airtableBaseUrl: env.AIRTABLE_BASE_URL || 'https://api.airtable.com',
    airtablePollMs: num('AIRTABLE_POLL_MS', 30_000, env),
    emailBisonBuildWorkspace: (env.EMAILBISON_BUILD_WORKSPACE || 'dulcy').toLowerCase(),
  };
}

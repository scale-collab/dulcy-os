// All settings come from environment variables (an .env file on the server).
// Keys never live in Airtable or in job data.

function num(name: string, fallback: number, env: NodeJS.ProcessEnv = process.env): number {
  const v = env[name];
  if (v === undefined || v === '') return fallback;
  const n = Number(v);
  if (!Number.isFinite(n)) throw new Error(`${name} must be a number`);
  return n;
}

/** Where an instant webhook can come from (POST /hooks/<source>, Alex 2026-11-28: agents start on events, not timers). */
export const HOOK_SOURCES = ['emailbison', 'n8n', 'make', 'airtable', 'slack', 'fathom', 'close'] as const;
export type HookSource = (typeof HOOK_SOURCES)[number];
/** The jobs and loops that now start on events; each keeps a slow backup sweep (<KEY>_BACKUP_EVERY_MIN, default 360, 0 = off). */
export const INSTANT_KEYS = ['sean.draft', 'bounce.check', 'riley.collect', 'cole.review', 'sales.won_sync', 'sienna.prep', 'campaign.pipeline', 'atlas.tasks', 'ledger.check', 'account.health', 'airtable.bridge', 'decisions.loop'] as const;
export const backupEnvName = (key: string) => `${key.replace(/[._]/g, '_').toUpperCase()}_BACKUP_EVERY_MIN`;

export interface Config {
  /**
   * Instant webhooks (2026-11-28): HOOK_SECRET_<SOURCE> per source (EmailBison/n8n/Make/Airtable: the shared secret;
   * Slack: the app's Signing Secret; Fathom: the webhook's whsec_ secret; Close: the subscription's signature_key).
   * A source without a secret answers 404 and its jobs keep their old timer.
   */
  hookSecrets: Partial<Record<HookSource, string>>;
  /** Events for the same job within this many seconds become one run (default 30). */
  instantWindowSec: number;
  /**
   * The bounce check's own window (BOUNCE_CHECK_WINDOW_SEC, default 120): a busy workspace bounces every few seconds,
   * so its check runs at most about every 2 minutes per workspace (still far sooner than the old 30-minute timer).
   */
  bounceWindowSec: number;
  /** Backup sweep per instant job or loop, in minutes (0 = off). Used only once that job's webhook source has a secret. */
  backupEveryMin: Record<string, number>;
  /** On switches that used to be "the timer is set": SEAN=on, BOUNCE_CHECK=on, ACCOUNT_HEALTH=on, LEDGER_CHECK=on (an old *_EVERY_MIN > 0 still counts as on). */
  seanOn: boolean;
  bounceCheckOn: boolean;
  accountHealthOn: boolean;
  ledgerCheckOn: boolean;
  /** Echo's follow-ups are due-time work: checked every SEAN_FOLLOWUP_EVERY_MIN (default 60) once Echo is instant, and right after every reply or send. */
  seanFollowupEveryMin: number;
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
  /** Claude (agents' drafting). */
  anthropicApiKey?: string;
  claudeModel: string;
  anthropicBaseUrl?: string;
  /** Repo knowledge (skills, rules, clients) mounted into the container. */
  knowledgeDir: string;
  /** Echo (inbox agent): run every N minutes (0 = off), look back N days, at most N drafts per run. */
  seanEveryMin: number;
  seanDays: number;
  seanMaxPerRun: number;
  /** SEAN_AUTO_SEND (default on): allow automatic sends where a client's Reply Agent settings ask for them. off = every reply waits for a person. */
  seanAutoSendOn: boolean;
  /** Echo drafts due follow-ups too (SEAN_FOLLOWUPS=on). Switch on after the old n8n follow-up timer is off. */
  seanFollowupsOn: boolean;
  /** Account health loop (rest / retest / replace) every N minutes (0 = off); only placement tests created after accountHealthFrom. */
  accountHealthEveryMin: number;
  /** Ada's morning brief: on (ADA_BRIEF=on) posts weekdays at ADA_BRIEF_HOUR ET to ADA_CHANNEL (default Alex's DM). */
  adaBriefOn: boolean;
  adaBriefHour: number;
  adaChannel: string;
  accountHealthFrom: string;
  /** Xero (read only) for Ledger: OAuth app from developer.xero.com; tokens are kept in Postgres. */
  xeroClientId?: string;
  xeroClientSecret?: string;
  xeroRedirectUri: string;
  xeroScopes: string;
  xeroTenantName: string;
  xeroLoginUrl: string;
  xeroIdentityUrl: string;
  xeroApiUrl: string;
  /** Ledger: Saturday report at LEDGER_REPORT_HOUR ET to LEDGER_CHANNEL (LEDGER=on); purchase yes/no every LEDGER_CHECK_EVERY_MIN in LEDGER_CHECK_CHANNEL. */
  /** Mercury read-only token: live balances and the transactions Ledger prepares for Xero. */
  mercuryToken?: string;
  mercuryBaseUrl: string;
  /** Plaid (read only) for Finances → Personal: Alex's own cards and bank accounts. All optional; without
   *  PLAID_CLIENT_ID + PLAID_SECRET the Personal tab keeps the P/L sheet figures. PLAID_ENV: sandbox | production (default). */
  plaidClientId?: string;
  plaidSecret?: string;
  plaidEnv: 'sandbox' | 'production';
  /** Products Plaid Link starts with (PLAID_PRODUCTS, comma list of liabilities / transactions / investments; default liabilities). */
  plaidProducts: string[];
  /** Ledger prepares reconciliation for Mercury lines from this date (YYYY-MM-DD), daily at LEDGER_PREP_HOUR ET. */
  ledgerPrepFrom: string;
  ledgerPrepHour: number;
  /** Off (default): Ledger only checks Mercury against Xero and flags stuck lines. On: it also creates the entries. */
  ledgerPrepWrite: boolean;
  ledgerOn: boolean;
  /** Atlas: weekly client health (ATLAS=on) on Mondays after ATLAS_HOUR ET, to ATLAS_CHANNEL. */
  atlasOn: boolean;
  /** Campaign creation (ATLAS_CAMPAIGNS=on): Atlas plans next campaigns every CAMPAIGN_PIPELINE_EVERY_MIN; at most CAMPAIGN_PLANS_MAX_OPEN at once. */
  atlasCampaignsOn: boolean;
  campaignPipelineEveryMin: number;
  campaignPlansMaxOpen: number;
  atlasHour: number;
  atlasChannel: string;
  /** Cole: reviews Alex's sales calls from Fathom (COLE=on + FATHOM_API_KEY) every COLE_EVERY_MIN; at most COLE_MAX_PER_RUN calls a run. */
  coleOn: boolean;
  coleEveryMin: number;
  coleMaxPerRun: number;
  coleFrom: string;
  coleChannel: string;
  fathomApiKey?: string;
  fathomBaseUrl: string;
  /** Close CRM API key (read only, HQ Sales: hottest deals, touches per close). Optional: without it HQ says "Connect Close". */
  closeApiKey?: string;
  /** Close → Airtable Won sync (sales.won_sync) every WON_SYNC_EVERY_MIN (default 30; 0 = off). Needs CLOSE_API_KEY + AIRTABLE_API_KEY. Dry run unless in LIVE_STAGES. */
  wonSyncEveryMin: number;
  /** Sienna: Monday content ideas (SIENNA_IDEAS_HOUR) and Thursday scripts for Friday (SIENNA_PREP_HOUR), ET. */
  siennaOn: boolean;
  /** Riley (RILEY=on): logs failed/stuck engine jobs and n8n errors to System Issues every RILEY_EVERY_MIN. */
  rileyOn: boolean;
  rileyEveryMin: number;
  /** n8n public API (Settings → n8n API) for Riley's error sweep; optional. */
  n8nApiKey: string;
  n8nBaseUrl: string;
  /**
   * Agents start instantly (Alex 2026-11-28): each agent's Claude Code routine API trigger, from
   * <AGENT>_FIRE_URL + <AGENT>_FIRE_TOKEN (e.g. RILEY_FIRE_URL / RILEY_FIRE_TOKEN). Keyed by the agent
   * name ('Riley'). An agent without both runs only when started by hand. The token is never logged.
   */
  agentFire: Record<string, { url: string; token: string }>;
  /**
   * HQ Content (round 5): the n8n webhooks the Content Center's buttons call. Each is a full URL from
   * CONTENT_HOOK_<NAME> (SCRIPT, THUMBNAIL, THUMBNAIL_REVISE, YOUTUBE, DISTRIBUTION, SCHEDULE,
   * NEWSLETTER, FRAMER). The paths are secret (the webhooks have no auth), so they are never in the repo.
   * A missing one is read once from n8n (N8N_API_KEY) and joined to CONTENT_WEBHOOK_BASE.
   */
  contentHooks: Record<string, string>;
  contentWebhookBase: string;
  /**
   * Final-clip approval from HQ (2026-11-28): CONTENT_REVIEW_SECRET (32+ characters; the same value as the
   * n8n variable of that name). Only used when the engine's Airtable token is not Alex's own login: HQ then
   * signs the Review Intent it wrote (HMAC-SHA256) so the n8n clip-review check can accept it. '' = off.
   */
  contentReviewSecret: string;
  /**
   * HQ center parity (2026-11-28): the two webhooks the Campaign Center keeps outside the engine.
   * Sync with Bison = the full campaign sync relay (BISON_SYNC_WEBHOOK_URL, default the relay the screen
   * calls); Sync Bison Senders = n8n (BISON_SENDER_SYNC_WEBHOOK_URL: its path is secret, never in the repo).
   */
  bisonSyncWebhookUrl: string;
  bisonSenderSyncWebhookUrl: string;
  siennaIdeasHour: number;
  siennaPrepHour: number;
  siennaChannel: string;
  /** Discord bot token (Agency Ignition server, read only) and the channel IDs Sienna reads for ideas. */
  discordBotToken?: string;
  siennaDiscordChannels: string[];
  discordBaseUrl?: string;
  ledgerReportHour: number;
  ledgerChannel: string;
  ledgerCheckEveryMin: number;
  ledgerCheckChannel: string;
  /** Dulcy calendar service (client calendars) and its read-only token. */
  calendarUrl: string;
  calendarReaderToken?: string;
  /** Optional: token that may call the calendar service's /calendar/admin/request-invite (HQ "Get calendar link"). The service's inviter token is enough. */
  calendarAdminToken?: string;
  /** Calendar service token that may book (POST /calendar/admin/book). Without it Echo never books: it drafts "I'll send the invite over" for a person. */
  calendarBookerToken?: string;
  /** Engine sends approved replies for every workspace (off until the n8n sender is switched off). */
  replySenderOn: boolean;
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
  /** LEADMAGIC_MODE: single (default, Alex 2026-11-25: parallel single Email Finder calls, near the 300/min limit) or bulk (LeadMagic's bulk queue, ~19 rows/min seen). */
  leadMagicMode: 'single' | 'bulk';
  /** Single mode: calls at once (LEADMAGIC_CONCURRENCY, default 40) and per minute (LEADMAGIC_PER_MIN, default 250). */
  leadMagicConcurrency: number;
  leadMagicPerMin: number;
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
  /** Dulcy HQ (the private web app): its host name, the session-cookie key (HQ is off without it),
   *  optional Google sign-in, where the built web files are, and the chat cost guard. */
  hqHost: string;
  hqPublicUrl: string;
  /** The client portal's own host (portal.dulcy.io): only the portal shell and the portal + login APIs answer there. */
  portalHost: string;
  /** Where setup / reset links point (default https://PORTAL_HOST; before the DNS switch https://hq.dulcy.io/portal). */
  portalPublicUrl: string;
  /** Schedule Meeting: the booking page the portal links to (Softr's page was a custom-code block; the URL is Alex's to set). */
  portalMeetingUrl: string;
  hqSessionSecret?: string;
  hqGoogleClientId?: string;
  hqGoogleClientSecret?: string;
  hqGoogleAuthUrl: string;
  hqGoogleTokenUrl: string;
  hqWebDir: string;
  hqChatMaxRounds: number;
  hqChatMaxTokens: number;
  /** on (default): agent reports also post to Slack. off: they only go to HQ. Urgent alerts always post. */
  slackReportsOn: boolean;
  /** on (default): new Decisions are posted to Slack for ✅/❌. off: they are decided in HQ (or Airtable) only. */
  slackDecisionsOn: boolean;
  /** HQ phone notifications (Web Push), Alex 2026-11-27. HQ_PUSH=off stops the watch loop (the settings page still works). */
  hqPushOn: boolean;
  /** Optional VAPID key pair (base64url). Without it the engine makes one on first start and keeps it in Postgres. */
  vapidPublicKey?: string;
  vapidPrivateKey?: string;
  /** VAPID subject: mailto:<address> or an https:// URL (default: HQ_PUBLIC_URL). No personal address in code. */
  vapidSubject?: string;
  /**
   * Talk to the agents by voice in HQ (Alex 2026-11-28). VOICE=on switches it on (default off). Speech to
   * text and text to speech use OpenAI (OPENAI_API_KEY); the answer itself is the normal chat (Claude).
   */
  voiceOn: boolean;
  /** OPENAI_STT_MODEL (default gpt-4o-mini-transcribe; whisper-1 also works). */
  openAiSttModel: string;
  /** OPENAI_TTS_MODEL (default gpt-4o-mini-tts) and OPENAI_TTS_VOICE (default coral). */
  openAiTtsModel: string;
  openAiTtsVoice: string;
  /** Optional voice per agent: OPENAI_TTS_VOICES="Ada:coral,Atlas:ash" (others use OPENAI_TTS_VOICE). */
  openAiTtsVoices: Record<string, string>;
  /** Longest clip (seconds, at most 60) and voice turns per person per hour. */
  voiceMaxSeconds: number;
  voiceTurnsPerHour: number;
}

/** <AGENT>_FIRE_URL (https only) + <AGENT>_FIRE_TOKEN pairs → { Agent: { url, token } }. */
export function fireTargets(env: NodeJS.ProcessEnv): Record<string, { url: string; token: string }> {
  const out: Record<string, { url: string; token: string }> = {};
  for (const k of Object.keys(env)) {
    const m = /^([A-Z][A-Z0-9]{1,30})_FIRE_URL$/.exec(k);
    if (!m) continue;
    const url = String(env[k] ?? '').trim(); const token = String(env[`${m[1]}_FIRE_TOKEN`] ?? '').trim();
    if (!/^https:\/\/[^\s"'<>]+$/.test(url) || !token || /\s/.test(token)) continue;
    out[m[1][0] + m[1].slice(1).toLowerCase()] = { url, token };
  }
  return out;
}

export function loadConfig(env = process.env): Config {
  const engineSecret = env.ENGINE_SECRET ?? '';
  if (engineSecret.length < 32) throw new Error('ENGINE_SECRET must be set (32+ characters)');
  const databaseUrl = env.DATABASE_URL ?? '';
  if (!databaseUrl) throw new Error('DATABASE_URL must be set');
  const onOff = (name: string) => (env[name] || '').toLowerCase() === 'on';
  return {
    hookSecrets: Object.fromEntries(HOOK_SOURCES.map((k) => [k, (env[`HOOK_SECRET_${k.toUpperCase()}`] ?? '').trim()]).filter(([, v]) => v.length >= 16)),
    instantWindowSec: Math.max(5, Math.min(300, num('INSTANT_WINDOW_SEC', 30, env))),
    bounceWindowSec: Math.max(5, Math.min(3600, num('BOUNCE_CHECK_WINDOW_SEC', 120, env))),
    backupEveryMin: Object.fromEntries(INSTANT_KEYS.map((k) => [k, Math.max(0, num(backupEnvName(k), 360, env))])),
    seanOn: onOff('SEAN') || num('SEAN_EVERY_MIN', 0, env) > 0,
    bounceCheckOn: onOff('BOUNCE_CHECK') || num('BOUNCE_CHECK_EVERY_MIN', 0, env) > 0,
    accountHealthOn: onOff('ACCOUNT_HEALTH') || num('ACCOUNT_HEALTH_EVERY_MIN', 0, env) > 0,
    ledgerCheckOn: onOff('LEDGER_CHECK') || num('LEDGER_CHECK_EVERY_MIN', 0, env) > 0,
    seanFollowupEveryMin: Math.max(0, num('SEAN_FOLLOWUP_EVERY_MIN', 60, env)),
    port: num('PORT', 8080, env),
    databaseUrl,
    engineSecret,
    // Paid calls stay OFF unless DRY_RUN is explicitly "false".
    dryRun: (env.DRY_RUN ?? 'true').toLowerCase() !== 'false',
    slackWebhookUrl: env.SLACK_WEBHOOK_URL || undefined,
    slackBotToken: env.SLACK_BOT_TOKEN || undefined,
    slackBaseUrl: env.SLACK_BASE_URL || 'https://slack.com/api',
    slackDecisionsChannel: env.SLACK_DECISIONS_CHANNEL || 'C0B581HNSMR',
    slackApprovers: (env.SLACK_APPROVERS ?? 'U070Z26377C,U0ADSEJ9SDR').split(',').map((x) => x.trim()).filter(Boolean),
    decisionsPollMs: num('DECISIONS_POLL_MS', 30_000, env),
    anthropicApiKey: env.ANTHROPIC_API_KEY || undefined,
    claudeModel: env.CLAUDE_MODEL || 'claude-opus-5-5',
    anthropicBaseUrl: env.ANTHROPIC_BASE_URL || undefined,
    knowledgeDir: env.KNOWLEDGE_DIR || '/app/knowledge',
    seanEveryMin: num('SEAN_EVERY_MIN', 0, env),
    seanDays: num('SEAN_DAYS', 14, env),
    seanMaxPerRun: num('SEAN_MAX_PER_RUN', 20, env),
    seanAutoSendOn: (env.SEAN_AUTO_SEND || 'on').toLowerCase() !== 'off',
    seanFollowupsOn: (env.SEAN_FOLLOWUPS || 'off').toLowerCase() === 'on',
    accountHealthEveryMin: num('ACCOUNT_HEALTH_EVERY_MIN', 0, env),
    adaBriefOn: (env.ADA_BRIEF || 'off').toLowerCase() === 'on',
    adaBriefHour: num('ADA_BRIEF_HOUR', 8, env),
    adaChannel: (env.ADA_CHANNEL || 'U070Z26377C').trim(),
    // Alex 2026-11-25: start from the Friday 2026-11-27 tests (older results are not acted on).
    xeroClientId: env.XERO_CLIENT_ID || undefined,
    xeroClientSecret: env.XERO_CLIENT_SECRET || undefined,
    xeroRedirectUri: env.XERO_REDIRECT_URI || 'http://localhost:8765/callback',
    // New Xero apps (after 2026-03-02) only take granular scopes. Writes: bank transactions/transfers, payments, contacts (Alex 2026-11-25: Ledger prepares reconciliation; never deletes).
    xeroScopes: env.XERO_SCOPES || 'offline_access accounting.invoices.read accounting.banktransactions accounting.payments accounting.contacts accounting.reports.banksummary.read accounting.reports.profitandloss.read accounting.reports.aged.read accounting.settings.read',
    xeroTenantName: env.XERO_TENANT_NAME || 'Dulcy Media',
    xeroLoginUrl: env.XERO_LOGIN_URL || 'https://login.xero.com/identity/connect/authorize',
    xeroIdentityUrl: env.XERO_IDENTITY_URL || 'https://identity.xero.com',
    xeroApiUrl: env.XERO_API_URL || 'https://api.xero.com',
    mercuryToken: env.MERCURY_TOKEN || undefined,
    mercuryBaseUrl: env.MERCURY_BASE_URL || 'https://api.mercury.com/api/v1',
    plaidClientId: (env.PLAID_CLIENT_ID ?? '').trim() || undefined,
    plaidSecret: (env.PLAID_SECRET ?? '').trim() || undefined,
    plaidEnv: (env.PLAID_ENV ?? '').trim().toLowerCase() === 'sandbox' ? 'sandbox' : 'production',
    // Read-only products only: anything else (transfer, payment_initiation, auth…) is dropped.
    plaidProducts: ((p) => (p.length ? p : ['liabilities']))((env.PLAID_PRODUCTS || 'liabilities').split(',').map((x) => x.trim().toLowerCase()).filter((x) => ['liabilities', 'transactions', 'investments'].includes(x))),
    ledgerPrepFrom: (env.LEDGER_PREP_FROM || '2026-11-01').trim(),
    ledgerPrepHour: num('LEDGER_PREP_HOUR', 7, env),
    ledgerPrepWrite: (env.LEDGER_PREP_WRITE || 'off').toLowerCase() === 'on',
    atlasOn: (env.ATLAS || 'off').toLowerCase() === 'on',
    atlasCampaignsOn: (env.ATLAS_CAMPAIGNS || 'off').toLowerCase() === 'on',
    campaignPipelineEveryMin: num('CAMPAIGN_PIPELINE_EVERY_MIN', 5, env),
    campaignPlansMaxOpen: num('CAMPAIGN_PLANS_MAX_OPEN', 2, env),
    atlasHour: num('ATLAS_HOUR', 9, env),
    atlasChannel: (env.ATLAS_CHANNEL || env.ADA_CHANNEL || 'U070Z26377C').trim(),
    coleOn: (env.COLE || 'off').toLowerCase() === 'on',
    coleEveryMin: num('COLE_EVERY_MIN', 60, env),
    coleMaxPerRun: num('COLE_MAX_PER_RUN', 3, env),
    coleFrom: (env.COLE_FROM || '').trim(),
    coleChannel: (env.COLE_CHANNEL || env.ADA_CHANNEL || 'U070Z26377C').trim(),
    fathomApiKey: env.FATHOM_API_KEY || undefined,
    fathomBaseUrl: env.FATHOM_BASE_URL || 'https://api.fathom.ai/external/v1',
    closeApiKey: env.CLOSE_API_KEY || undefined,
    wonSyncEveryMin: num('WON_SYNC_EVERY_MIN', 30, env),
    siennaOn: (env.SIENNA || 'off').toLowerCase() === 'on',
    rileyOn: (env.RILEY || 'off').toLowerCase() === 'on',
    rileyEveryMin: num('RILEY_EVERY_MIN', 15, env),
    n8nApiKey: env.N8N_API_KEY || '',
    n8nBaseUrl: env.N8N_BASE_URL || 'http://localhost:5678',
    agentFire: fireTargets(env),
    contentHooks: Object.fromEntries(['SCRIPT', 'THUMBNAIL', 'THUMBNAIL_REVISE', 'YOUTUBE', 'DISTRIBUTION', 'SCHEDULE', 'NEWSLETTER', 'FRAMER', 'CLIP_REVIEW']
      .map((k) => [k, (env[`CONTENT_HOOK_${k}`] || '').trim()]).filter(([, v]) => /^https:\/\/[^\s]+$/.test(v))),
    contentWebhookBase: (env.CONTENT_WEBHOOK_BASE || 'https://n8n.dulcy.io').trim().replace(/\/+$/, ''),
    contentReviewSecret: (env.CONTENT_REVIEW_SECRET || '').trim().length >= 32 ? (env.CONTENT_REVIEW_SECRET || '').trim() : '',
    bisonSyncWebhookUrl: (env.BISON_SYNC_WEBHOOK_URL ?? 'https://bison-sync-relay.scale-f9d.workers.dev/sync').trim(),
    bisonSenderSyncWebhookUrl: (env.BISON_SENDER_SYNC_WEBHOOK_URL || '').trim(),
    siennaIdeasHour: num('SIENNA_IDEAS_HOUR', 7, env),
    siennaPrepHour: num('SIENNA_PREP_HOUR', 10, env),
    discordBotToken: env.DISCORD_BOT_TOKEN || undefined,
    siennaDiscordChannels: (env.SIENNA_DISCORD_CHANNELS || '').split(',').map((x) => x.trim()).filter((x) => /^\d+$/.test(x)),
    siennaChannel: (env.SIENNA_CHANNEL || env.ADA_CHANNEL || 'U070Z26377C').trim(),
    ledgerOn: (env.LEDGER || 'off').toLowerCase() === 'on',
    ledgerReportHour: num('LEDGER_REPORT_HOUR', 9, env),
    ledgerChannel: (env.LEDGER_CHANNEL || env.ADA_CHANNEL || 'U070Z26377C').trim(),
    ledgerCheckEveryMin: num('LEDGER_CHECK_EVERY_MIN', 0, env),
    ledgerCheckChannel: (env.LEDGER_CHECK_CHANNEL || env.SLACK_DECISIONS_CHANNEL || 'C0B581HNSMR').trim(),
    accountHealthFrom: (env.ACCOUNT_HEALTH_FROM || '2026-11-26T12:00:00.000Z').trim(),
    calendarUrl: env.CALENDAR_URL || 'http://dulcy-calendar:8789',
    calendarReaderToken: env.CALENDAR_READER_TOKEN || undefined,
    calendarAdminToken: env.CALENDAR_ADMIN_TOKEN || undefined,
    calendarBookerToken: env.CALENDAR_BOOKER_TOKEN || undefined,
    replySenderOn: (env.REPLY_SENDER || 'off').toLowerCase() === 'on',
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
    leadMagicMode: (env.LEADMAGIC_MODE || 'single').toLowerCase() === 'bulk' ? 'bulk' : 'single',
    leadMagicConcurrency: Math.max(1, Math.min(100, num('LEADMAGIC_CONCURRENCY', 40, env))),
    leadMagicPerMin: Math.max(1, Math.min(300, num('LEADMAGIC_PER_MIN', 250, env))),
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
    hqHost: (env.HQ_HOST || 'hq.dulcy.io').trim().toLowerCase(),
    hqPublicUrl: (env.HQ_PUBLIC_URL || `https://${(env.HQ_HOST || 'hq.dulcy.io').trim().toLowerCase()}`).replace(/\/+$/, ''),
    hqSessionSecret: (env.HQ_SESSION_SECRET ?? '').length >= 32 ? env.HQ_SESSION_SECRET : undefined,
    hqGoogleClientId: env.HQ_GOOGLE_CLIENT_ID || undefined,
    hqGoogleClientSecret: env.HQ_GOOGLE_CLIENT_SECRET || undefined,
    hqGoogleAuthUrl: env.HQ_GOOGLE_AUTH_URL || 'https://accounts.google.com/o/oauth2/v2/auth',
    hqGoogleTokenUrl: env.HQ_GOOGLE_TOKEN_URL || 'https://oauth2.googleapis.com/token',
    hqWebDir: env.HQ_WEB_DIR || '/app/hq-web',
    portalHost: (env.PORTAL_HOST || 'portal.dulcy.io').trim().toLowerCase(),
    portalPublicUrl: (env.PORTAL_PUBLIC_URL || `https://${(env.PORTAL_HOST || 'portal.dulcy.io').trim().toLowerCase()}`).replace(/\/+$/, ''),
    portalMeetingUrl: /^https:\/\/[^\s"'<>]+$/.test(env.PORTAL_MEETING_URL ?? '') ? String(env.PORTAL_MEETING_URL) : '',
    hqChatMaxRounds: num('HQ_CHAT_MAX_ROUNDS', 4, env),
    hqChatMaxTokens: num('HQ_CHAT_MAX_TOKENS', 4000, env),
    slackReportsOn: (env.SLACK_REPORTS || 'on').toLowerCase() !== 'off',
    slackDecisionsOn: (env.SLACK_DECISIONS || 'on').toLowerCase() !== 'off',
    hqPushOn: (env.HQ_PUSH || 'on').toLowerCase() !== 'off',
    vapidPublicKey: (env.VAPID_PUBLIC_KEY ?? '').trim() || undefined,
    vapidPrivateKey: (env.VAPID_PRIVATE_KEY ?? '').trim() || undefined,
    vapidSubject: (env.VAPID_SUBJECT ?? '').trim() || undefined,
    voiceOn: (env.VOICE || 'off').trim().toLowerCase() === 'on',
    openAiSttModel: (env.OPENAI_STT_MODEL || 'gpt-4o-mini-transcribe').trim(),
    openAiTtsModel: (env.OPENAI_TTS_MODEL || 'gpt-4o-mini-tts').trim(),
    openAiTtsVoice: (env.OPENAI_TTS_VOICE || 'coral').trim().toLowerCase(),
    openAiTtsVoices: Object.fromEntries((env.OPENAI_TTS_VOICES || '').split(',').map((x) => x.split(':').map((y) => y.trim()))
      .filter((x) => x.length === 2 && /^[A-Za-z]+$/.test(x[0]) && /^[a-z_]+$/i.test(x[1])).map(([a, v]) => [a[0].toUpperCase() + a.slice(1).toLowerCase(), v.toLowerCase()])),
    voiceMaxSeconds: Math.max(5, Math.min(60, num('VOICE_MAX_SECONDS', 60, env))),
    voiceTurnsPerHour: Math.max(1, Math.min(600, num('VOICE_TURNS_PER_HOUR', 60, env))),
  };
}

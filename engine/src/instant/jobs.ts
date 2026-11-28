// Which agents start on events (Alex 2026-11-28: "an instant webhook type of thing, not schedules").
// Each job here starts the moment its event arrives (POST /hooks/<source>, an HQ action, or another engine
// job finishing). While none of its webhook sources has a secret on the server, events cannot reach it, so it
// keeps its old timer (nothing breaks before the webhooks are set up). Once a source has its secret, the old
// timer is gone and only a slow backup sweep is left (<KEY>_BACKUP_EVERY_MIN, default 6 hours, 0 = off),
// because a provider can drop a webhook.
import type { Config, HookSource } from '../config.js';

export interface InstantJob {
  /** Job kind (or an in-process loop: airtable.bridge, decisions.loop). */
  key: string;
  /** The engine's record id for this job, the same one the old timer used (one active job per record). */
  recordId: string;
  /** Webhook sources that bring this job's events. */
  sources: HookSource[];
  /** true = instant only when every source has its secret (the loop has work from each of them). */
  all?: boolean;
  /** The old timer in minutes (used until a source is set up; 0 = it had none). */
  legacyEveryMin: (cfg: Config) => number;
  /** Plain words for the guide and the CLI. */
  event: string;
}

export const INSTANT_JOBS: InstantJob[] = [
  { key: 'sean.draft', recordId: 'sean', sources: ['n8n', 'emailbison', 'airtable'], legacyEveryMin: (c) => c.seanEveryMin, event: 'a prospect reply (n8n reply intake wrote the Emails row, or EmailBison "Contact Replied" / "Contact Interested")' },
  { key: 'bounce.check', recordId: 'bounce', sources: ['n8n', 'emailbison'], legacyEveryMin: (c) => c.bounceCheckEveryMin, event: 'a bounce: n8n Bounce Data Tracker or EmailBison "Email Bounced" (only that workspace is checked)' },
  { key: 'riley.collect', recordId: 'riley-collect', sources: ['n8n', 'make'], legacyEveryMin: (c) => c.rileyEveryMin, event: 'an engine job failing (inside the engine), the n8n Error Workflow, a Make error' },
  { key: 'cole.review', recordId: 'cole-review', sources: ['fathom'], legacyEveryMin: (c) => c.coleEveryMin, event: 'Fathom "New meeting content ready"' },
  { key: 'sales.won_sync', recordId: 'sales-won_sync', sources: ['close'], legacyEveryMin: (c) => c.wonSyncEveryMin, event: 'Close opportunity created or changed' },
  { key: 'sienna.prep', recordId: 'sienna-prep', sources: ['airtable'], legacyEveryMin: () => 30, event: 'an idea approved (HQ: instant always; Airtable Content Center: the automation)' },
  { key: 'campaign.pipeline', recordId: 'campaign-pipeline', sources: ['airtable', 'emailbison'], legacyEveryMin: (c) => c.campaignPipelineEveryMin, event: 'a plan, list or campaign step finishing in the engine, an approval, a campaign status or portal answer changing (Airtable)' },
  { key: 'atlas.tasks', recordId: 'atlas-tasks', sources: ['airtable', 'emailbison'], legacyEveryMin: () => 30, event: 'new campaign numbers (after each bounce check) or a campaign change in Airtable' },
  { key: 'ledger.check', recordId: 'ledger-check', sources: ['slack'], legacyEveryMin: (c) => c.ledgerCheckEveryMin, event: 'a purchase question posted in the Ledger check channel (Slack Events)' },
  { key: 'account.health', recordId: 'account-health', sources: ['n8n', 'airtable'], legacyEveryMin: (c) => c.accountHealthEveryMin, event: 'new placement test results (n8n "Check Results" or the Airtable automation)' },
  { key: 'airtable.bridge', recordId: '', sources: ['airtable'], legacyEveryMin: (c) => c.airtablePollMs / 60_000, event: 'an Engine button pressed in Airtable (Lead List Center / Campaign Center), and every engine job step' },
  { key: 'decisions.loop', recordId: '', sources: ['slack', 'airtable'], all: true, legacyEveryMin: (c) => c.decisionsPollMs / 60_000, event: 'a ✅/❌ in Slack, a decision or Reply Queue button in Airtable, an HQ decision, a new decision card' },
];
export const instantJob = (key: string) => INSTANT_JOBS.find((j) => j.key === key);

/** The source has a secret on the server (its webhook can reach the engine). */
export const hookOn = (cfg: Pick<Config, 'hookSecrets'>, s: HookSource) => !!cfg.hookSecrets?.[s];

/** true once this job's webhook is set up: its old timer is off, the backup sweep runs instead. */
export function isInstant(cfg: Pick<Config, 'hookSecrets'>, key: string): boolean {
  const j = instantJob(key);
  if (!j) return false;
  return j.all ? j.sources.every((s) => hookOn(cfg, s)) : j.sources.some((s) => hookOn(cfg, s));
}

/** How often the job still runs without an event, in minutes (0 = never): the backup sweep once instant, else the old timer. */
export function sweepEveryMin(cfg: Config, key: string): number {
  const j = instantJob(key);
  if (!j) return 0;
  if (!isInstant(cfg, key)) return Math.max(0, j.legacyEveryMin(cfg) || 0);
  return Math.max(0, cfg.backupEveryMin?.[key] ?? 60);
}

// On switches (an old *_EVERY_MIN > 0 still means on, so a server that had the timer keeps the agent on).
export const seanIsOn = (c: Config) => !!c.seanOn || c.seanEveryMin > 0;
export const bounceIsOn = (c: Config) => (!!c.bounceCheckOn || c.bounceCheckEveryMin > 0) && c.bounceCheckWorkspaces.length > 0;
export const accountHealthIsOn = (c: Config) => !!c.accountHealthOn || c.accountHealthEveryMin > 0;
export const ledgerCheckIsOn = (c: Config) => c.ledgerOn && !!c.slackBotToken && (!!c.ledgerCheckOn || c.ledgerCheckEveryMin > 0);
export const campaignsAreOn = (c: Config) => c.atlasCampaignsOn;
export const atlasTasksOn = (c: Config) => !!c.hqSessionSecret && !!c.airtableApiKey;
export const coleIsOn = (c: Config) => c.coleOn && !!c.fathomApiKey;
export const wonSyncIsOn = (c: Config) => !!c.closeApiKey && !!c.airtableApiKey && c.wonSyncEveryMin > 0;

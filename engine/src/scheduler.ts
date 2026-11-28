// Timers. Since 2026-11-28 (Alex: "no agents on schedules; an instant webhook type of thing") the agents
// that react to work start on events (POST /hooks/<source>, HQ actions, other jobs finishing: src/instant/).
// What is left here:
//   • calendar reports, unchanged: ada.brief, ledger.report, ledger.prep, atlas.health (Mon), atlas.ramp (daily), sienna.ideas (Fri);
//   • per instant job, ONE slow backup sweep (<KEY>_BACKUP_EVERY_MIN, default 360 = 6 hours, 0 = off) in case a
//     provider drops a webhook. Until a job's webhook source has its secret (HOOK_SECRET_<SOURCE>), no event can
//     reach it, so it keeps its old timer (instant/jobs.ts: sweepEveryMin);
//   • Echo's follow-ups, which are due-time work (SEAN_FOLLOWUP_EVERY_MIN, default 60) and also run after every reply/send.
// Each tick queues at most one job per record; the request id makes a tick idempotent, and the
// one-active-job-per-record rule means a slow run is never doubled (an event and a sweep share the record).
import type { Db } from './db/pool.js';
import type { Config } from './config.js';
import { enqueue } from './queue.js';
import { STAGES } from './stages/index.js';
import { createAirtableClient, type AirtableClient } from './providers/airtable.js';
import { bridgeTick } from './airtable/bridge.js';
import { skipBouncePauseIds } from './airtable/campaignActions.js';
import { createSlackClient } from './providers/slack.js';
import { decisionsTick } from './decisions/loop.js';
import { repliesTick } from './agents/replies.js';
import { accountHealthIsOn, bounceIsOn, coleIsOn, isInstant, ledgerCheckIsOn, seanIsOn, sweepEveryMin, wonSyncIsOn } from './instant/jobs.js';
import { planWork } from './instant/afterJob.js';
import { kick, registerLoop } from './instant/kick.js';

/**
 * EmailBison IDs the bounce check must never pause ("Skip Bounce Pause" ticked in Campaign
 * Center). Read from Airtable when the engine has a token; without one the list is empty.
 */
export async function bounceSkipList(cfg: Config, at?: Pick<AirtableClient, 'list'>): Promise<number[]> {
  const client = at ?? (cfg.airtableApiKey ? createAirtableClient({ apiKey: cfg.airtableApiKey, baseId: cfg.airtableBaseId, baseUrl: cfg.airtableBaseUrl }) : undefined);
  return client ? skipBouncePauseIds(client) : [];
}

/** A request id for this sweep slot: the old format while the job is on its old timer, a backup one once instant. */
const slotId = (cfg: Config, key: string, legacy: (slot: number) => string, every: number, now: number) => {
  const slot = Math.floor(now / (every * 60_000));
  return isInstant(cfg, key) ? `backup:${key}:${every}:${slot}` : legacy(slot);
};

/** How often an in-process loop ticks without an event (ms; 0 = only on events). */
function loopEveryMs(cfg: Config, key: 'airtable.bridge' | 'decisions.loop', legacyMs: number, floorMs: number): number {
  if (!isInstant(cfg, key)) return Math.max(floorMs, legacyMs);
  const min = sweepEveryMin(cfg, key);
  return min > 0 ? Math.max(floorMs, min * 60_000) : 0;
}

/**
 * Airtable bridge: the Engine buttons (Lead List Center, Campaign Center) and the job results written back.
 * Instant once HOOK_SECRET_AIRTABLE is set (the Airtable automations send /hooks/airtable engine_action, and every
 * engine list/campaign job kicks it); until then every AIRTABLE_POLL_MS. Off without a token or with AIRTABLE_POLL_MS=0.
 */
export function startAirtableBridge(db: Db, cfg: Config, signal: AbortSignal): void {
  if (!cfg.airtableApiKey || !cfg.airtablePollMs) return;
  const at = createAirtableClient({ apiKey: cfg.airtableApiKey, baseId: cfg.airtableBaseId, baseUrl: cfg.airtableBaseUrl });
  registerLoop('airtable.bridge', async () => {
    const r = await bridgeTick(db, cfg, at);
    if (r.queued || r.wrote) console.log(JSON.stringify({ level: 'info', message: 'airtable bridge', ...r }));
  });
  void kick('airtable.bridge');
  const every = loopEveryMs(cfg, 'airtable.bridge', cfg.airtablePollMs, 5_000);
  if (!every) return;
  const t = setInterval(() => { void kick('airtable.bridge'); }, every);
  signal.addEventListener('abort', () => clearInterval(t));
}

export async function scheduleTick(db: Db, cfg: Config, now = Date.now(), at?: Pick<AirtableClient, 'list'>): Promise<number> {
  if (!bounceIsOn(cfg)) return 0;
  const every = sweepEveryMin(cfg, 'bounce.check');
  if (!every) return 0;
  const rid = (ws: string) => slotId(cfg, 'bounce.check', (slot) => `bounce:${ws}:${slot}`, every, now) + (isInstant(cfg, 'bounce.check') ? `:${ws}` : '');
  const def = STAGES['bounce.check'];
  // Airtable is read only when this slot still has a check to queue (not every minute).
  const have = await db.query(`SELECT request_id FROM jobs WHERE request_id = ANY($1)`, [cfg.bounceCheckWorkspaces.map(rid)]);
  if (have.rows.length === cfg.bounceCheckWorkspaces.length) return 0;
  // If Airtable cannot be read, nothing is queued this minute (the next tick tries again):
  // a check without the skip list could pause a campaign Alex said not to.
  const skipPauseCampaignIds = await bounceSkipList(cfg, at);
  let queued = 0;
  for (const ws of cfg.bounceCheckWorkspaces) {
    const r = await enqueue(db, {
      kind: 'bounce.check', recordId: `bounce:${ws}`, input: { workspace: ws, skipPauseCampaignIds }, requestId: rid(ws),
      dryRun: cfg.dryRun && !cfg.liveStages.includes('bounce.check'), maxAttempts: def.maxAttempts, deadlineMs: def.deadlineMs,
    });
    if (r.status === 'queued') queued++;
  }
  return queued;
}

/** Echo (inbox agent): sean.draft on each reply (instant) or every SEAN_EVERY_MIN (old timer); follow-ups on their due-time sweep. */
export async function seanTick(db: Db, cfg: Config, now = Date.now()): Promise<number> {
  if (!seanIsOn(cfg)) return 0;
  const dryRun = cfg.dryRun && !cfg.liveStages.includes('sean.draft');
  let n = 0;
  const every = sweepEveryMin(cfg, 'sean.draft');
  if (every) {
    const def = STAGES['sean.draft'];
    const r = await enqueue(db, { kind: 'sean.draft', recordId: 'sean', input: {}, requestId: slotId(cfg, 'sean.draft', (s) => `sean:${s}`, every, now), dryRun, maxAttempts: def.maxAttempts, deadlineMs: def.deadlineMs });
    if (r.status === 'queued') n++;
  }
  // Follow-ups act when one is due (not on an event), so they keep a sweep; replies and sends also start them at once.
  const fEvery = isInstant(cfg, 'sean.draft') ? cfg.seanFollowupEveryMin : every;
  if (cfg.seanFollowupsOn && fEvery) {
    const fd = STAGES['sean.followup'];
    const slot = Math.floor(now / (fEvery * 60_000));
    const q = await enqueue(db, { kind: 'sean.followup', recordId: 'sean-followup', input: {}, requestId: isInstant(cfg, 'sean.draft') ? `sean-followup:due:${fEvery}:${slot}` : `sean-followup:${slot}`, dryRun, maxAttempts: fd.maxAttempts, deadlineMs: fd.deadlineMs });
    if (q.status === 'queued') n++;
  }
  return n;
}

/** Account health: on new placement results (instant) or every ACCOUNT_HEALTH_EVERY_MIN (old timer). */
export async function accountHealthTick(db: Db, cfg: Config, now = Date.now()): Promise<number> {
  if (!accountHealthIsOn(cfg)) return 0;
  const every = sweepEveryMin(cfg, 'account.health');
  if (!every) return 0;
  const def = STAGES['account.health'];
  const r = await enqueue(db, { kind: 'account.health', recordId: 'account-health', input: {}, requestId: slotId(cfg, 'account.health', (s) => `account-health:${s}`, every, now), dryRun: cfg.dryRun && !cfg.liveStages.includes('account.health'), maxAttempts: def.maxAttempts, deadlineMs: def.deadlineMs });
  return r.status === 'queued' ? 1 : 0;
}

/** Ada's brief: once per weekday at ADA_BRIEF_HOUR ET (the day is the request id, so it never posts twice). */
export async function adaTick(db: Db, cfg: Config, now = new Date()): Promise<number> {
  if (!cfg.adaBriefOn) return 0;
  const et = new Date(now.toLocaleString('en-US', { timeZone: 'America/New_York' }));
  const day = et.getDay();
  if (day === 0 || day === 6 || et.getHours() < cfg.adaBriefHour) return 0;
  const def = STAGES['ada.brief'];
  const date = `${et.getFullYear()}-${String(et.getMonth() + 1).padStart(2, '0')}-${String(et.getDate()).padStart(2, '0')}`;
  const r = await enqueue(db, { kind: 'ada.brief', recordId: 'ada', input: {}, requestId: `ada:${date}`, dryRun: cfg.dryRun && !cfg.liveStages.includes('ada.brief'), maxAttempts: def.maxAttempts, deadlineMs: def.deadlineMs });
  return r.status === 'queued' ? 1 : 0;
}

/** Ledger: the Saturday report after LEDGER_REPORT_HOUR ET, the daily prep, and the purchase check (instant on a Slack question, or its old timer). Off unless LEDGER=on. */
export async function ledgerTick(db: Db, cfg: Config, now = new Date()): Promise<number> {
  if (!cfg.ledgerOn) return 0;
  const et = new Date(now.toLocaleString('en-US', { timeZone: 'America/New_York' }));
  const live = (k: string) => !(cfg.dryRun && !cfg.liveStages.includes(k));
  let q = 0;
  if (et.getDay() === 6 && et.getHours() >= cfg.ledgerReportHour) {
    const def = STAGES['ledger.report'];
    const date = `${et.getFullYear()}-${String(et.getMonth() + 1).padStart(2, '0')}-${String(et.getDate()).padStart(2, '0')}`;
    const r = await enqueue(db, { kind: 'ledger.report', recordId: 'ledger', input: {}, requestId: `ledger:${date}`, dryRun: !live('ledger.report'), maxAttempts: def.maxAttempts, deadlineMs: def.deadlineMs });
    if (r.status === 'queued') q++;
  }
  if (cfg.mercuryToken && et.getHours() >= cfg.ledgerPrepHour) {
    const def = STAGES['ledger.prep'];
    const date = `${et.getFullYear()}-${String(et.getMonth() + 1).padStart(2, '0')}-${String(et.getDate()).padStart(2, '0')}`;
    const r = await enqueue(db, { kind: 'ledger.prep', recordId: 'ledger-prep', input: {}, requestId: `ledger-prep:${date}`, dryRun: !live('ledger.prep'), maxAttempts: def.maxAttempts, deadlineMs: def.deadlineMs });
    if (r.status === 'queued') q++;
  }
  const every = ledgerCheckIsOn(cfg) ? sweepEveryMin(cfg, 'ledger.check') : 0;
  if (every) {
    const def = STAGES['ledger.check'];
    const r = await enqueue(db, { kind: 'ledger.check', recordId: 'ledger-check', input: {}, requestId: slotId(cfg, 'ledger.check', (s) => `ledger-check:${s}`, every, now.getTime()), dryRun: !live('ledger.check'), maxAttempts: def.maxAttempts, deadlineMs: def.deadlineMs });
    if (r.status === 'queued') q++;
  }
  return q;
}

/** The Won sync runs when Close and Airtable are both connected and WON_SYNC_EVERY_MIN > 0 (the on switch). */
export const wonSyncOn = (cfg: Pick<Config, 'closeApiKey' | 'airtableApiKey' | 'wonSyncEveryMin'>) => wonSyncIsOn(cfg as Config);

/** Atlas (Mon health, daily ramp), Sienna's Friday ideas, and the backup sweeps of the event-driven agents. */
export async function agentsTick(db: Db, cfg: Config, now = new Date()): Promise<number> {
  const et = new Date(now.toLocaleString('en-US', { timeZone: 'America/New_York' }));
  const date = `${et.getFullYear()}-${String(et.getMonth() + 1).padStart(2, '0')}-${String(et.getDate()).padStart(2, '0')}`;
  const live = (k: string) => !(cfg.dryRun && !cfg.liveStages.includes(k));
  const q = async (kind: string, requestId: string) => { const d = STAGES[kind]; const r = await enqueue(db, { kind, recordId: kind.replace('.', '-'), input: {}, requestId, dryRun: !live(kind), maxAttempts: d.maxAttempts, deadlineMs: d.deadlineMs }); return r.status === 'queued' ? 1 : 0; };
  /** One sweep of an event-driven job: its backup interval once instant, its old timer until then. */
  const sweep = async (kind: string, legacy: (slot: number) => string) => {
    const every = sweepEveryMin(cfg, kind);
    return every ? q(kind, slotId(cfg, kind, legacy, every, now.getTime())) : 0;
  };
  let n = 0;
  if (cfg.atlasOn && et.getDay() === 1 && et.getHours() >= cfg.atlasHour) n += await q('atlas.health', `atlas:${date}`);
  if (cfg.atlasCampaignsOn) {
    const swept = await sweep('campaign.pipeline', (s) => `campaign-pipeline:${s}`);
    n += swept;
    // Plans and copy ready to write: right after the events that make them ready (instant/afterJob.ts, HQ, CLI);
    // on the old timer they are also looked for every minute, once instant only with the backup sweep.
    if (sweepEveryMin(cfg, 'campaign.pipeline') > 0 && (!isInstant(cfg, 'campaign.pipeline') || swept)) n += await planWork(db, cfg);
  }
  // HQ: Atlas's own to-do list (campaigns past 60%): after each bounce check / campaign change, else every 30 minutes.
  if (cfg.hqSessionSecret && cfg.airtableApiKey) n += await sweep('atlas.tasks', (s) => `atlas-tasks:${Math.floor(s)}`);
  // Batch 3: the new-client inbox ramp check, once a day (it only proposes; Alex applies in HQ).
  if (cfg.hqSessionSecret && cfg.airtableApiKey) n += await q('atlas.ramp', `atlas-ramp:${date}`);
  // Close → Airtable Won sync (Alex 2026-11-28): on each Close opportunity change; dry run unless in LIVE_STAGES.
  if (wonSyncOn(cfg)) n += await sweep('sales.won_sync', (s) => `won-sync:${s}`);
  if (cfg.rileyOn) n += await sweep('riley.collect', (s) => `riley:${s}`);
  if (coleIsOn(cfg)) n += await sweep('cole.review', (s) => `cole:${s}`);
  // Alex 2026-11-25: ideas land Friday morning (for the next Friday's recording).
  if (cfg.siennaOn && et.getDay() === 5 && et.getHours() >= cfg.siennaIdeasHour) n += await q('sienna.ideas', `sienna-ideas:${date}`);
  // Scripts as soon as Alex approves an idea (HQ: instant; Airtable: its automation, else every 30 minutes).
  if (cfg.siennaOn) n += isInstant(cfg, 'sienna.prep') ? await sweep('sienna.prep', () => '') : await q('sienna.prep', `sienna-prep:${date}:${et.getHours()}:${et.getMinutes() < 30 ? 0 : 30}`);
  return n;
}

/** hook_events keeps 30 days (enough to check a webhook works and for Riley's Make errors). */
export async function pruneHookEvents(db: Db): Promise<number> {
  return (await db.query(`DELETE FROM hook_events WHERE received_at < now() - interval '30 days'`)).rowCount ?? 0;
}

export function startScheduler(db: Db, cfg: Config, signal: AbortSignal): void {
  const err = (e: unknown) => console.error(JSON.stringify({ level: 'error', message: 'scheduler tick failed', err: String(e) }));
  let minutes = 0;
  const tick = () => {
    void scheduleTick(db, cfg).catch(err); void seanTick(db, cfg).catch(err); void accountHealthTick(db, cfg).catch(err);
    void adaTick(db, cfg).catch(err); void ledgerTick(db, cfg).catch(err); void agentsTick(db, cfg).catch(err);
    if (minutes++ % 60 === 0) void pruneHookEvents(db).catch(err);
  };
  tick();
  const t = setInterval(tick, 60_000);
  signal.addEventListener('abort', () => clearInterval(t));
}

/**
 * Decisions loop (Slack ✅/❌ ↔ Airtable Decisions, and the Reply Queue buttons). Instant once HOOK_SECRET_SLACK and
 * HOOK_SECRET_AIRTABLE are both set: a Slack reaction, an Airtable decision/reply button, an HQ decision or a job
 * ending kicks it (reading only the reacted messages); the backup sweep reads everything. Until then every
 * DECISIONS_POLL_MS. Off without the bot token or the Airtable token.
 */
export function startDecisions(db: Db, cfg: Config, signal: AbortSignal): void {
  if (!cfg.slackBotToken || !cfg.airtableApiKey || !cfg.decisionsPollMs) return;
  const at = createAirtableClient({ apiKey: cfg.airtableApiKey, baseId: cfg.airtableBaseId, baseUrl: cfg.airtableBaseUrl });
  const slack = createSlackClient({ token: cfg.slackBotToken, baseUrl: cfg.slackBaseUrl });
  const instant = isInstant(cfg, 'decisions.loop');
  let full = true;
  registerLoop('decisions.loop', async () => {
    const reactions = instant && !full ? 'priority' : 'all';
    full = false;
    const r = await decisionsTick(db, cfg, at, slack, { reactions });
    if (r.posted || r.decided || r.started || r.finished) console.log(JSON.stringify({ level: 'info', message: 'decisions', ...r }));
    const p = await repliesTick(db, cfg, at, slack);
    if (p.queued || p.skipped || p.closed) console.log(JSON.stringify({ level: 'info', message: 'replies', ...p }));
  });
  void kick('decisions.loop');
  const every = loopEveryMs(cfg, 'decisions.loop', cfg.decisionsPollMs, 10_000);
  if (!every) return;
  const t = setInterval(() => { full = true; void kick('decisions.loop'); }, every);
  signal.addEventListener('abort', () => clearInterval(t));
}

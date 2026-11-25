// Built-in timer for recurring jobs (so far: the bounce check). Off unless configured.
// Each tick queues one job per workspace; the request id makes a tick idempotent, and the
// one-active-job-per-record rule means a slow check is never doubled.
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

/**
 * EmailBison IDs the bounce check must never pause ("Skip Bounce Pause" ticked in Campaign
 * Center). Read from Airtable when the engine has a token; without one the list is empty.
 */
export async function bounceSkipList(cfg: Config, at?: Pick<AirtableClient, 'list'>): Promise<number[]> {
  const client = at ?? (cfg.airtableApiKey ? createAirtableClient({ apiKey: cfg.airtableApiKey, baseId: cfg.airtableBaseId, baseUrl: cfg.airtableBaseUrl }) : undefined);
  return client ? skipBouncePauseIds(client) : [];
}

/** Airtable bridge: check the Engine buttons and write results back every AIRTABLE_POLL_MS. Off without a token. */
export function startAirtableBridge(db: Db, cfg: Config, signal: AbortSignal): void {
  if (!cfg.airtableApiKey || !cfg.airtablePollMs) return;
  const at = createAirtableClient({ apiKey: cfg.airtableApiKey, baseId: cfg.airtableBaseId, baseUrl: cfg.airtableBaseUrl });
  let busy = false;
  const tick = async () => {
    if (busy) return; // a slow tick is never doubled
    busy = true;
    try {
      const r = await bridgeTick(db, cfg, at);
      if (r.queued || r.wrote) console.log(JSON.stringify({ level: 'info', message: 'airtable bridge', ...r }));
    } catch (e) {
      console.error(JSON.stringify({ level: 'error', message: 'airtable bridge tick failed', err: String(e) }));
    } finally { busy = false; }
  };
  void tick();
  const t = setInterval(() => { void tick(); }, Math.max(5_000, cfg.airtablePollMs));
  signal.addEventListener('abort', () => clearInterval(t));
}

export async function scheduleTick(db: Db, cfg: Config, now = Date.now(), at?: Pick<AirtableClient, 'list'>): Promise<number> {
  if (!cfg.bounceCheckEveryMin || cfg.bounceCheckWorkspaces.length === 0) return 0;
  const slot = Math.floor(now / (cfg.bounceCheckEveryMin * 60_000));
  const def = STAGES['bounce.check'];
  // Airtable is read only when this slot still has a check to queue (not every minute).
  const have = await db.query(`SELECT request_id FROM jobs WHERE request_id = ANY($1)`, [cfg.bounceCheckWorkspaces.map((ws) => `bounce:${ws}:${slot}`)]);
  if (have.rows.length === cfg.bounceCheckWorkspaces.length) return 0;
  // If Airtable cannot be read, nothing is queued this minute (the next tick tries again):
  // a check without the skip list could pause a campaign Alex said not to.
  const skipPauseCampaignIds = await bounceSkipList(cfg, at);
  let queued = 0;
  for (const ws of cfg.bounceCheckWorkspaces) {
    const r = await enqueue(db, {
      kind: 'bounce.check', recordId: `bounce:${ws}`, input: { workspace: ws, skipPauseCampaignIds }, requestId: `bounce:${ws}:${slot}`,
      dryRun: cfg.dryRun && !cfg.liveStages.includes('bounce.check'), maxAttempts: def.maxAttempts, deadlineMs: def.deadlineMs,
    });
    if (r.status === 'queued') queued++;
  }
  return queued;
}

/** Sean (inbox agent): one sean.draft job per SEAN_EVERY_MIN slot. Off when 0. */
export async function seanTick(db: Db, cfg: Config, now = Date.now()): Promise<number> {
  if (!cfg.seanEveryMin) return 0;
  const slot = Math.floor(now / (cfg.seanEveryMin * 60_000));
  const def = STAGES['sean.draft'];
  const dryRun = cfg.dryRun && !cfg.liveStages.includes('sean.draft');
  const r = await enqueue(db, { kind: 'sean.draft', recordId: 'sean', input: {}, requestId: `sean:${slot}`, dryRun, maxAttempts: def.maxAttempts, deadlineMs: def.deadlineMs });
  let n = r.status === 'queued' ? 1 : 0;
  if (cfg.seanFollowupsOn) {
    const fd = STAGES['sean.followup'];
    const q = await enqueue(db, { kind: 'sean.followup', recordId: 'sean-followup', input: {}, requestId: `sean-followup:${slot}`, dryRun, maxAttempts: fd.maxAttempts, deadlineMs: fd.deadlineMs });
    if (q.status === 'queued') n++;
  }
  return n;
}

/** Account health loop: one account.health job per ACCOUNT_HEALTH_EVERY_MIN slot. Off when 0. */
export async function accountHealthTick(db: Db, cfg: Config, now = Date.now()): Promise<number> {
  if (!cfg.accountHealthEveryMin) return 0;
  const slot = Math.floor(now / (cfg.accountHealthEveryMin * 60_000));
  const def = STAGES['account.health'];
  const r = await enqueue(db, { kind: 'account.health', recordId: 'account-health', input: {}, requestId: `account-health:${slot}`, dryRun: cfg.dryRun && !cfg.liveStages.includes('account.health'), maxAttempts: def.maxAttempts, deadlineMs: def.deadlineMs });
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

/** Ledger: the Saturday report once after LEDGER_REPORT_HOUR ET, and the purchase check every LEDGER_CHECK_EVERY_MIN. Off unless LEDGER=on. */
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
  if (cfg.ledgerCheckEveryMin > 0 && cfg.slackBotToken) {
    const def = STAGES['ledger.check'];
    const slot = Math.floor(now.getTime() / (cfg.ledgerCheckEveryMin * 60_000));
    const r = await enqueue(db, { kind: 'ledger.check', recordId: 'ledger-check', input: {}, requestId: `ledger-check:${slot}`, dryRun: !live('ledger.check'), maxAttempts: def.maxAttempts, deadlineMs: def.deadlineMs });
    if (r.status === 'queued') q++;
  }
  return q;
}

/** Atlas (Mon), Cole (every COLE_EVERY_MIN), Sienna (Mon ideas, Thu scripts). Each is off unless switched on. */
export async function agentsTick(db: Db, cfg: Config, now = new Date()): Promise<number> {
  const et = new Date(now.toLocaleString('en-US', { timeZone: 'America/New_York' }));
  const date = `${et.getFullYear()}-${String(et.getMonth() + 1).padStart(2, '0')}-${String(et.getDate()).padStart(2, '0')}`;
  const live = (k: string) => !(cfg.dryRun && !cfg.liveStages.includes(k));
  const q = async (kind: string, requestId: string) => { const d = STAGES[kind]; const r = await enqueue(db, { kind, recordId: kind.replace('.', '-'), input: {}, requestId, dryRun: !live(kind), maxAttempts: d.maxAttempts, deadlineMs: d.deadlineMs }); return r.status === 'queued' ? 1 : 0; };
  let n = 0;
  if (cfg.atlasOn && et.getDay() === 1 && et.getHours() >= cfg.atlasHour) n += await q('atlas.health', `atlas:${date}`);
  if (cfg.atlasCampaignsOn && cfg.campaignPipelineEveryMin > 0) {
    n += await q('campaign.pipeline', `campaign-pipeline:${Math.floor(now.getTime() / (cfg.campaignPipelineEveryMin * 60_000))}`);
    // Plans the pipeline started are written one at a time (each is one Claude call).
    for (const id of (await db.query(`SELECT id FROM campaign_plans WHERE state='planning' ORDER BY id LIMIT 1`)).rows.map((r: any) => Number(r.id))) {
      const d = STAGES['atlas.plan'];
      const r = await enqueue(db, { kind: 'atlas.plan', recordId: `atlas-plan-${id}`, input: { planId: id }, requestId: `atlas-plan:${id}`, dryRun: !live('atlas.plan'), maxAttempts: d.maxAttempts, deadlineMs: d.deadlineMs });
      if (r.status === 'queued') n++;
    }
    // Copy to write (after approval 1, or a rewrite after feedback): one at a time.
    for (const p of (await db.query(`SELECT id, copy_round FROM campaign_plans WHERE copy_state='queued' ORDER BY id LIMIT 1`)).rows) {
      const d = STAGES['scribe.copy'];
      const r = await enqueue(db, { kind: 'scribe.copy', recordId: `scribe-copy-${p.id}`, input: { planId: Number(p.id) }, requestId: `scribe-copy:${p.id}:${p.copy_round}`, dryRun: !live('scribe.copy'), maxAttempts: d.maxAttempts, deadlineMs: d.deadlineMs });
      if (r.status === 'queued') n++;
    }
  }
  if (cfg.rileyOn && cfg.rileyEveryMin > 0) n += await q('riley.collect', `riley:${Math.floor(now.getTime() / (cfg.rileyEveryMin * 60_000))}`);
  if (cfg.coleOn && cfg.fathomApiKey && cfg.coleEveryMin > 0) n += await q('cole.review', `cole:${Math.floor(now.getTime() / (cfg.coleEveryMin * 60_000))}`);
  if (cfg.siennaOn && et.getDay() === 1 && et.getHours() >= cfg.siennaIdeasHour) n += await q('sienna.ideas', `sienna-ideas:${date}`);
  if (cfg.siennaOn && et.getDay() === 4 && et.getHours() >= cfg.siennaPrepHour) n += await q('sienna.prep', `sienna-prep:${date}`);
  return n;
}

export function startScheduler(db: Db, cfg: Config, signal: AbortSignal): void {
  if ((!cfg.bounceCheckEveryMin || cfg.bounceCheckWorkspaces.length === 0) && !cfg.seanEveryMin && !cfg.accountHealthEveryMin && !cfg.adaBriefOn && !cfg.ledgerOn && !cfg.atlasOn && !cfg.atlasCampaignsOn && !cfg.rileyOn && !cfg.coleOn && !cfg.siennaOn) return;
  const err = (e: unknown) => console.error(JSON.stringify({ level: 'error', message: 'scheduler tick failed', err: String(e) }));
  const tick = () => { void scheduleTick(db, cfg).catch(err); void seanTick(db, cfg).catch(err); void accountHealthTick(db, cfg).catch(err); void adaTick(db, cfg).catch(err); void ledgerTick(db, cfg).catch(err); void agentsTick(db, cfg).catch(err); };
  tick();
  const t = setInterval(tick, 60_000);
  signal.addEventListener('abort', () => clearInterval(t));
}

/** Decisions loop (Slack ✅/❌ ↔ Airtable Decisions). Off without the bot token or the Airtable token. */
export function startDecisions(db: Db, cfg: Config, signal: AbortSignal): void {
  if (!cfg.slackBotToken || !cfg.airtableApiKey || !cfg.decisionsPollMs) return;
  const at = createAirtableClient({ apiKey: cfg.airtableApiKey, baseId: cfg.airtableBaseId, baseUrl: cfg.airtableBaseUrl });
  const slack = createSlackClient({ token: cfg.slackBotToken, baseUrl: cfg.slackBaseUrl });
  let busy = false;
  const tick = async () => {
    if (busy) return;
    busy = true;
    try {
      const r = await decisionsTick(db, cfg, at, slack);
      if (r.posted || r.decided || r.started || r.finished) console.log(JSON.stringify({ level: 'info', message: 'decisions', ...r }));
      const p = await repliesTick(db, cfg, at, slack);
      if (p.queued || p.skipped || p.closed) console.log(JSON.stringify({ level: 'info', message: 'replies', ...p }));
    } catch (e) {
      console.error(JSON.stringify({ level: 'error', message: 'decisions tick failed', err: String(e) }));
    } finally { busy = false; }
  };
  void tick();
  const t = setInterval(() => { void tick(); }, Math.max(10_000, cfg.decisionsPollMs));
  signal.addEventListener('abort', () => clearInterval(t));
}

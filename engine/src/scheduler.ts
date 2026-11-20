// Built-in timer for recurring jobs (so far: the bounce check). Off unless configured.
// Each tick queues one job per workspace; the request id makes a tick idempotent, and the
// one-active-job-per-record rule means a slow check is never doubled.
import type { Db } from './db/pool.js';
import type { Config } from './config.js';
import { enqueue } from './queue.js';
import { STAGES } from './stages/index.js';
import { createAirtableClient } from './providers/airtable.js';
import { bridgeTick } from './airtable/bridge.js';

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

export async function scheduleTick(db: Db, cfg: Config, now = Date.now()): Promise<number> {
  if (!cfg.bounceCheckEveryMin || cfg.bounceCheckWorkspaces.length === 0) return 0;
  const slot = Math.floor(now / (cfg.bounceCheckEveryMin * 60_000));
  const def = STAGES['bounce.check'];
  let queued = 0;
  for (const ws of cfg.bounceCheckWorkspaces) {
    const r = await enqueue(db, {
      kind: 'bounce.check', recordId: `bounce:${ws}`, input: { workspace: ws }, requestId: `bounce:${ws}:${slot}`,
      dryRun: cfg.dryRun && !cfg.liveStages.includes('bounce.check'), maxAttempts: def.maxAttempts, deadlineMs: def.deadlineMs,
    });
    if (r.status === 'queued') queued++;
  }
  return queued;
}

export function startScheduler(db: Db, cfg: Config, signal: AbortSignal): void {
  if (!cfg.bounceCheckEveryMin || cfg.bounceCheckWorkspaces.length === 0) return;
  const tick = () => { void scheduleTick(db, cfg).catch((e) => console.error(JSON.stringify({ level: 'error', message: 'scheduler tick failed', err: String(e) }))); };
  tick();
  const t = setInterval(tick, 60_000);
  signal.addEventListener('abort', () => clearInterval(t));
}

// Built-in timer for recurring jobs (so far: the bounce check). Off unless configured.
// Each tick queues one job per workspace; the request id makes a tick idempotent, and the
// one-active-job-per-record rule means a slow check is never doubled.
import type { Db } from './db/pool.js';
import type { Config } from './config.js';
import { enqueue } from './queue.js';
import { STAGES } from './stages/index.js';

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

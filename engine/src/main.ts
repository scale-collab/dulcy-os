import { loadConfig } from './config.js';
import { createPool, migrate } from './db/pool.js';
import { createServer } from './http.js';
import { workLoop } from './worker.js';
import { startAirtableBridge, startDecisions, startScheduler } from './scheduler.js';
import { startPushLoop } from './hq/pushWatch.js';

const cfg = loadConfig();
const db = createPool(cfg.databaseUrl);
await migrate(db);

const server = createServer(db, cfg);
server.listen(cfg.port, () => console.log(JSON.stringify({ level: 'info', message: 'engine listening', port: cfg.port, dryRun: cfg.dryRun })));

const stop = new AbortController();
// WORKER_CONCURRENCY parallel loops (claims use FOR UPDATE SKIP LOCKED, one active job per record+kind).
const loop = Promise.all(Array.from({ length: Math.max(1, Number(process.env.WORKER_CONCURRENCY) || 1) }, () => workLoop(db, cfg, stop.signal)));
startScheduler(db, cfg, stop.signal);
startAirtableBridge(db, cfg, stop.signal);
startDecisions(db, cfg, stop.signal);
// HQ phone notifications (Web Push): the watch loop, every minute while a device has them on.
startPushLoop(db, cfg, stop.signal);

for (const sig of ['SIGINT', 'SIGTERM'] as const) {
  process.on(sig, async () => {
    stop.abort();
    server.close();
    await loop.catch(() => undefined);
    await db.end();
    process.exit(0);
  });
}

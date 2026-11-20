import { loadConfig } from './config.js';
import { createPool, migrate } from './db/pool.js';
import { createServer } from './http.js';
import { workLoop } from './worker.js';
import { startAirtableBridge, startScheduler } from './scheduler.js';

const cfg = loadConfig();
const db = createPool(cfg.databaseUrl);
await migrate(db);

const server = createServer(db, cfg);
server.listen(cfg.port, () => console.log(JSON.stringify({ level: 'info', message: 'engine listening', port: cfg.port, dryRun: cfg.dryRun })));

const stop = new AbortController();
const loop = workLoop(db, cfg, stop.signal);
startScheduler(db, cfg, stop.signal);
startAirtableBridge(db, cfg, stop.signal);

for (const sig of ['SIGINT', 'SIGTERM'] as const) {
  process.on(sig, async () => {
    stop.abort();
    server.close();
    await loop.catch(() => undefined);
    await db.end();
    process.exit(0);
  });
}

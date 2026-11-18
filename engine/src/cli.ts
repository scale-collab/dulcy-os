// Server command line, for jobs started by hand (e.g. the side-by-side tests).
// Run on the server:  docker compose exec engine node dist/src/cli.js <command>
//
//   verify <recordId> --sheet <link or id> [--direct] [--generic] [--footprint200]
//          [--mv-job <id>] [--expect good=N,risky=N,bad=N] [--diagnose]
//       Queue a Verify job. Without --direct/--generic, both are included.
//       With --mv-job it only checks/downloads that saved MillionVerifier job (free).
//   job <id>
//       Show a job's status and summary (counts and comparison; no lead rows).
import { loadConfig } from './config.js';
import { createPool, migrate } from './db/pool.js';
import { enqueue, getJob } from './queue.js';
import { STAGES } from './stages/index.js';

function flag(args: string[], name: string): string | undefined {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
}

async function main() {
  const [cmd, ...args] = process.argv.slice(2);
  const cfg = loadConfig();
  const db = createPool(cfg.databaseUrl);
  try {
    await migrate(db);
    if (cmd === 'verify') {
      const recordId = args[0];
      const sheet = flag(args, '--sheet');
      if (!recordId || !/^rec[A-Za-z0-9]{14}$/.test(recordId) || !sheet) throw new Error('usage: verify <recordId> --sheet <link or id> [--direct] [--generic] [--footprint200] [--mv-job <id>] [--expect good=N,risky=N,bad=N]');
      const direct = args.includes('--direct');
      const generic = args.includes('--generic');
      const expected: Record<string, number> = {};
      for (const part of (flag(args, '--expect') ?? '').split(',').filter(Boolean)) {
        const [k, v] = part.split('=');
        if (k && Number.isFinite(Number(v))) expected[k.trim()] = Number(v);
      }
      const def = STAGES['leadlist.verify'];
      const r = await enqueue(db, {
        kind: 'leadlist.verify', recordId, dryRun: cfg.dryRun, maxAttempts: def.maxAttempts, deadlineMs: def.deadlineMs,
        input: {
          source: { sheetId: sheet },
          includeDirect: direct || !generic, includeGeneric: generic || !direct,
          genericFootprintMax200: args.includes('--footprint200'),
          existingJobId: flag(args, '--mv-job'),
          expected: Object.keys(expected).length ? expected : undefined,
          diagnose: args.includes('--diagnose'),
        },
      });
      console.log(JSON.stringify({ status: r.status, jobId: r.job.id, dryRun: r.job.dry_run }));
      console.log(`Check it with:  docker compose exec engine node dist/src/cli.js job ${r.job.id}`);
    } else if (cmd === 'job') {
      const j = await getJob(db, Number(args[0]));
      if (!j) throw new Error('job not found');
      const res = (j.job.result ?? {}) as Record<string, unknown>;
      const keep = ['dryRun', 'millionVerifierJobId', 'plan', 'counts', 'finalDirectCount', 'finalGenericCount', 'pendingRemainder', 'message', 'comparison', 'diagnosis', 'wouldSpendCredits'];
      console.log(JSON.stringify({
        id: j.job.id, kind: j.job.kind, record: j.job.record_id, status: j.job.status, progress: j.job.progress, error: j.job.error,
        result: Object.fromEntries(keep.filter((k) => k in res).map((k) => [k, res[k]])),
        steps: j.steps.map((s: { step_key: string; status: string }) => `${s.step_key}: ${s.status}`),
      }, null, 2));
    } else {
      throw new Error('commands: verify, job');
    }
  } finally {
    await db.end();
  }
}

main().catch((e) => { console.error(String(e.message ?? e)); process.exit(1); });

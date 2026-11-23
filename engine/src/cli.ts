// Server command line, for jobs started by hand (e.g. the side-by-side tests).
// Run on the server:  docker compose exec engine node dist/src/cli.js <command>
//
//   verify <recordId> --sheet <link or id> [--direct] [--generic] [--footprint200] [--write-final]
//          [--mv-job <id>] [--expect good=N,risky=N,bad=N] [--diagnose]
//       Queue a Verify job. Without --direct/--generic, both are included.
//       With --mv-job it only checks/downloads that saved MillionVerifier job (free).
//       --write-final writes the Final Direct / Final Generic tabs into that sheet (what the campaign build reads).
//   topup < topup.json
//       Queue a top-up from a JSON file on stdin: {"recordId": "rec<top-up lead list>", ...input}.
//   campaign < build.json
//       Queue a campaign build from a JSON file on stdin: {"recordId": "rec...", ...input}.
//       Use:  docker compose exec -T engine node dist/src/cli.js campaign < build.json
//   sample < sample.json
//       Queue a company sample from a JSON file on stdin: {"recordId": "rec<lead list>", "filters": {...}, "fit": {...}}.
//   expand < expand.json
//       Expand an approved sample: {"recordId": "rec<lead list>", "filters": {...}, "target": N, "sampleApproved": true, ...}.
//   refit < refit.json
//       Re-check every saved company of a list with its profile (free). "rebuildProfile": true makes a new profile first.
//   contacts < contacts.json
//       Find people at the Tier 1/2 companies: {"recordId", "contactFilters", "personaDna", "companies": 100 for the sample}.
//   senders <workspace> [text] [--workspace-id=N]
//       List the workspace's sender inboxes in EmailBison (id, email, status), optionally filtered.
//   bounce <workspace>
//       Run the bounce check for one workspace now (report-only unless bounce.check is live).
//   whereis <campaignId> <workspaceId> [workspaceId...] [--key=<workspace>]
//       Which of these EmailBison workspaces holds the campaign (read-only).
//   cleanup-test <campaignId> <workspaceId> [--yes] [--key=<workspace>]
//       Remove an ENGINE TEST draft campaign and only the leads and custom variables the test
//       created. Without --yes it only shows what it would delete.
//   cancel <jobId>
//       Cancel a job that is waiting to run (queued or retrying). A running job is not touched.
//   job <id>
//       Show a job's status and summary (counts and comparison; no lead rows).
//   mv-compare <recordId> <millionVerifierJobId>
//       Free: download a MillionVerifier job and compare its verdicts with DiscoLike's own email
//       check on the list's DiscoLike Contacts-run contacts (counts; emails masked).
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
        kind: 'leadlist.verify', recordId, dryRun: cfg.dryRun && !cfg.liveStages.includes('leadlist.verify'), maxAttempts: def.maxAttempts, deadlineMs: def.deadlineMs,
        input: {
          source: { sheetId: sheet },
          includeDirect: direct || !generic, includeGeneric: generic || !direct,
          genericFootprintMax200: args.includes('--footprint200'),
          existingJobId: flag(args, '--mv-job'),
          expected: Object.keys(expected).length ? expected : undefined,
          diagnose: args.includes('--diagnose'),
          writeFinalTabs: args.includes('--write-final'),
        },
      });
      console.log(JSON.stringify({ status: r.status, jobId: r.job.id, dryRun: r.job.dry_run }));
      console.log(`Check it with:  docker compose exec engine node dist/src/cli.js job ${r.job.id}`);
    } else if (cmd === 'campaign' || cmd === 'topup' || cmd === 'sample' || cmd === 'expand' || cmd === 'refit' || cmd === 'contacts') {
      const kind = cmd === 'campaign' ? 'campaign.build' : cmd === 'topup' ? 'campaign.topup' : cmd === 'sample' ? 'leadlist.sample' : cmd === 'expand' ? 'leadlist.expand' : cmd === 'refit' ? 'leadlist.refit' : 'leadlist.contacts';
      const chunks: Buffer[] = [];
      for await (const c of process.stdin) chunks.push(c as Buffer);
      const { recordId, _about: _ignored, ...input } = JSON.parse(Buffer.concat(chunks).toString('utf8')) as Record<string, unknown> & { recordId?: string };
      if (!recordId || !/^rec[A-Za-z0-9]{14}$/.test(recordId)) throw new Error('the JSON needs "recordId": the Airtable record (campaign for a build, lead list for a top-up or sample)');
      const def = STAGES[kind];
      const r = await enqueue(db, { kind, recordId, input, dryRun: cfg.dryRun && !cfg.liveStages.includes(kind), maxAttempts: def.maxAttempts, deadlineMs: def.deadlineMs });
      console.log(JSON.stringify({ status: r.status, jobId: r.job.id, dryRun: r.job.dry_run }));
      console.log(`Check it with:  docker compose exec engine node dist/src/cli.js job ${r.job.id}`);
    } else if (cmd === 'senders') {
      const ws = String(args[0] ?? '').toLowerCase();
      const { bisonFor } = await import('./providers/emailbison.js');
      const bison = bisonFor(cfg, ws, Number(args.find((a) => /^--workspace-id=\d+$/.test(a))?.split('=')[1]) || undefined);
      const filter = String(args.slice(1).find((a) => !a.startsWith('--')) ?? '').toLowerCase();
      const all = await bison.workspaceSenders();
      const list = all.filter((x) => !filter || (x.email ?? '').includes(filter));
      for (const x of list) console.log(`${x.id}\t${x.status}\t${x.email ?? ''}`);
      console.log(`${list.length} shown of ${all.length} sender inboxes (${all.filter((x) => x.status === 'connected').length} connected)`);
    } else if (cmd === 'bounce') {
      const ws = String(args[0] ?? '').toLowerCase();
      if (!ws) throw new Error('usage: bounce <workspace>');
      const def = STAGES['bounce.check'];
      const { bounceSkipList } = await import('./scheduler.js');
      const r = await enqueue(db, { kind: 'bounce.check', recordId: `bounce:${ws}`, input: { workspace: ws, skipPauseCampaignIds: await bounceSkipList(cfg) }, dryRun: cfg.dryRun && !cfg.liveStages.includes('bounce.check'), maxAttempts: def.maxAttempts, deadlineMs: def.deadlineMs });
      console.log(JSON.stringify({ status: r.status, jobId: r.job.id, dryRun: r.job.dry_run }));
      console.log(`Check it with:  docker compose exec engine node dist/src/cli.js job ${r.job.id}`);
    } else if (cmd === 'whereis') {
      const campaignId = Number(args[0]);
      const teams = args.slice(1).filter((a) => /^\d+$/.test(a)).map(Number);
      const keyName = (args.find((a) => a.startsWith('--key='))?.split('=')[1] ?? 'dulcy').toLowerCase();
      if (!campaignId || teams.length === 0) throw new Error('usage: whereis <campaignId> <workspaceId> [workspaceId...]');
      const { findCampaignWorkspace } = await import('./providers/emailbison.js');
      const found = await findCampaignWorkspace(cfg.emailBisonKeys[keyName], cfg.emailBisonBaseUrl, campaignId, teams);
      console.log(found.length ? found.map((f) => `campaign ${campaignId} is in workspace ${f.teamId}: "${f.name}" (${f.status})`).join('\n') : `campaign ${campaignId} is in none of workspaces ${teams.join(', ')}`);
    } else if (cmd === 'cleanup-test') {
      const campaignId = Number(args[0]);
      const teamId = Number(args[1]);
      const keyName = (args.find((a) => a.startsWith('--key='))?.split('=')[1] ?? 'dulcy').toLowerCase();
      if (!campaignId || !teamId) throw new Error('usage: cleanup-test <campaignId> <workspaceId> [--yes]');
      const { createBisonClient } = await import('./providers/emailbison.js');
      const { readCleanupPlan, runCleanup } = await import('./campaign/cleanup.js');
      const bison = createBisonClient({ apiKey: cfg.emailBisonKeys[keyName], baseUrl: cfg.emailBisonBaseUrl, teamId });
      // Custom variables our test builds created, from the engine's own step records.
      const rows = await db.query(
        `SELECT s.output FROM steps s JOIN jobs j ON j.id = s.job_id
          WHERE j.kind IN ('campaign.build','campaign.topup') AND s.step_key = 'custom-variables' AND j.record_id LIKE 'recEngineTest%'`);
      const names = new Set<string>(['Verification Provider', 'Email Type', 'Verification Path']);
      for (const r of rows.rows) for (const n of (r.output?.created ?? []) as string[]) names.add(n);
      const plan = await readCleanupPlan(bison, campaignId, [...names]);
      console.log(`workspace ${teamId}, campaign ${plan.campaign.id} "${plan.campaign.name}" (${plan.campaign.status}, created ${plan.campaign.createdAt})`);
      console.log(`leads: delete ${plan.deleteLeadIds.length}; keep ${plan.keptLeads.notOurs} that existed before the test, ${plan.keptLeads.contacted} already emailed`);
      console.log(`custom variables: delete ${plan.deleteVariables.map((v) => v.name).join(', ') || 'none'}${plan.keptVariables.length ? `; keep (older than the test) ${plan.keptVariables.join(', ')}` : ''}`);
      if (!args.includes('--yes')) {
        console.log('Preview only. Nothing deleted. Add --yes to delete.');
      } else {
        await runCleanup(bison, plan, (s) => console.log(s));
      }
      if (plan.leadLists.length) console.log(`EmailBison has no API to delete lead lists. Delete these in the EmailBison screen (workspace ${teamId}):\n${plan.leadLists.map((l) => `  ${l.id}  ${l.name}`).join('\n')}`);
    } else if (cmd === 'cancel') {
      const r = await db.query(`UPDATE jobs SET status='cancelled', lease_owner=NULL, lease_until=NULL, updated_at=now() WHERE id=$1 AND status='queued' RETURNING id`, [Number(args[0])]);
      console.log(r.rowCount ? `job ${args[0]} cancelled` : `job ${args[0]} was not waiting to run (running or already finished); nothing changed`);
    } else if (cmd === 'job') {
      const j = await getJob(db, Number(args[0]));
      if (!j) throw new Error('job not found');
      const res = (j.job.result ?? {}) as Record<string, unknown>;
      const keep = ['profile', 'contacts', 'topCutReasons', 'changes', 'matching', 'sample', 'topDropReasons', 'dropped', 'target', 'have', 'list', 'added', 'batches', 'stoppedBecause', 'shortfall', 'sheet', 'checked', 'paused', 'wouldPause', 'watch', 'skippedPause', 'alreadyLive', 'wouldLaunch', 'checks', 'notRunning', 'warnings', 'campaigns', 'readiness', 'kpiException', 'launched', 'campaignId', 'campaignName', 'leads', 'imports', 'senders', 'variants', 'note', 'dryRun', 'millionVerifierJobId', 'plan', 'counts', 'finalDirectCount', 'finalGenericCount', 'pendingRemainder', 'message', 'comparison', 'diagnosis', 'wouldSpendCredits'];
      console.log(JSON.stringify({
        id: j.job.id, kind: j.job.kind, record: j.job.record_id, status: j.job.status, progress: j.job.progress, error: j.job.error,
        result: Object.fromEntries(keep.filter((k) => k in res).map((k) => [k, res[k]])),
        steps: j.steps.map((s: { step_key: string; status: string }) => `${s.step_key}: ${s.status}`),
      }, null, 2));
    } else if (cmd === 'mv-compare') {
      const [recordId, mvJob] = args;
      if (!recordId || !/^rec[A-Za-z0-9]{14}$/.test(recordId) || !mvJob) throw new Error('usage: mv-compare <recordId> <millionVerifierJobId>');
      const { createMvClient } = await import('./providers/millionverifier.js');
      const { parseResultsLoose, maskEmail } = await import('./verify/rules.js');
      const rows = (await db.query(`SELECT email, data->>'email_status' AS status FROM lead_contacts WHERE list_id=$1 AND data->>'source'='DiscoLike Contacts run'`, [recordId])).rows as { email: string; status: string | null }[];
      const status = new Map(rows.map((r) => [r.email, r.status || 'unknown']));
      const mv = createMvClient({ apiKey: cfg.millionVerifierApiKey, baseUrl: cfg.millionVerifierBaseUrl });
      const info = await mv.fileInfo(mvJob);
      if (!['finished', 'completed', 'complete', 'done'].includes(info.status)) { console.log(`MillionVerifier job ${mvJob} is not finished yet (${info.status || 'unknown'}, ${info.percent}% done). Run this again when it is.`); return; }
      const { results, diff } = parseResultsLoose(await mv.download(mvJob), rows.map((r) => r.email));
      const table: Record<string, Record<string, number>> = {};
      const detail: Record<string, number> = {};
      for (const r of results) {
        const s = status.get(r.email) ?? 'unknown';
        (table[s] ??= {})[r.verdict] = (table[s][r.verdict] ?? 0) + 1;
        detail[`${r.verdict}: ${r.detail}`] = (detail[`${r.verdict}: ${r.detail}`] ?? 0) + 1;
      }
      console.log(JSON.stringify({
        contactsRunContacts: rows.length, inThisMillionVerifierJob: results.length, notInJob: diff.inListNotInFile.length,
        byDiscoLikeStatus: table, millionVerifierDetail: detail,
        notGood: results.filter((r) => r.verdict !== 'Good').map((r) => `${maskEmail(r.email)} | DiscoLike: ${status.get(r.email)} | MillionVerifier: ${r.verdict} (${r.detail})`),
      }, null, 2));
    } else {
      throw new Error('commands: verify, mv-compare, campaign, topup, senders, bounce, whereis, cleanup-test, cancel, job');
    }
  } finally {
    await db.end();
  }
}

main().catch((e) => { console.error(String(e.message ?? e)); process.exit(1); });

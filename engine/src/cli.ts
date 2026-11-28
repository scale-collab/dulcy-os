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
//   xero-connect ["<address from the browser bar>"]
//       One-time Xero login for Ledger. Without an address: prints the link to open. Click Allow;
//       the browser lands on a localhost page that fails to load (expected). Copy that whole
//       address and run xero-connect again with it in quotes.
//   ledger-report [--post]
//       Ledger's Saturday money report now (printed; --post also sends it to Slack).
//   ledger-prep [--live]
//       Reconciliation prep from Mercury into Xero. Without --live it only shows what it would create
//       (nothing is written). --live creates the entries (only when ledger.prep is in LIVE_STAGES).
//   ledger-ask "<question>"
//       Print the yes/no Ledger would give, e.g. ledger-ask "Should I buy Clay $349/mo?" (posts nothing).
//   atlas-health [--post]
//       Atlas's client health report now (printed; --post also sends it to Slack).
//   agent <atlas.health|cole.review|sienna.ideas|sienna.prep> [--since=YYYY-MM-DD]
//       Run one of the agents now and wait for the result (live only when the stage is in LIVE_STAGES).
//   hq-user <email> [--role=owner|member] [--name=Alex] [--password-stdin] [--google-only]
//       Create or update a Dulcy HQ login. Asks for the password twice (nothing is shown or printed);
//       --password-stdin reads it from stdin instead; --google-only = no password (Google sign-in only).
//       Setting a new password signs that person out everywhere.
//   ask add --agent=Atlas --title="Reply to Pete about Twenty West" [--why="..."] [--steps="1. ...\n2. ..." | --steps-stdin]
//           [--action-label=Open] [--action-url=decisions/Replies | https://...] [--priority=high|normal]
//           [--for=owner|everyone] [--key=<dedupe key>]
//       Ask Alex (or, with --for=everyone, members too) to do one thing; it shows on HQ "Needs you".
//       The same key (default: agent + title) never adds a second one. --priority=high = "Do now".
//   ask list [--all]      Open asks (--all: done and snoozed too).
//   ask done <id>         Mark an ask done.
//   riley-n8n-rollback <System Issue record ID> [--yes] [--force]
//       Put an n8n workflow back as it was before Riley's engine-applied fix on that issue (the full
//       previous version is saved in the engine). Without --yes it only says what it would do.
//       Refuses if the workflow was edited again after the fix, unless --force.
//   hooks                      Webhook sources, which jobs are instant, the last 10 events.
//   hooks connect [--yes]
//       Connect EmailBison, Close and n8n to the engine's webhooks (n8n changes become Decision cards).
//       Without --yes it only prints the plan (nothing changes). Run it again any time: it adds only what is missing.
//   hooks secret <slack|fathom|close>
//       Store a provider's webhook secret (asked hidden, or from stdin). Never shown or printed.
//   mv-compare <recordId> <millionVerifierJobId>
//       Free: download a MillionVerifier job and compare its verdicts with DiscoLike's own email
//       check on the list's DiscoLike Contacts-run contacts (counts; emails masked).
import { loadConfig } from './config.js';
import { bookSlot, calendarStatus, openTimes } from './agents/calendar.js';
import { createPool, migrate } from './db/pool.js';
import { enqueue, getJob } from './queue.js';
import { STAGES } from './stages/index.js';

/** Ask for a secret on the terminal without echoing it. */
async function askHidden(question: string): Promise<string> {
  const readline = await import('node:readline');
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
  let asking = true;
  (rl as any)._writeToOutput = (s: string) => { if (!asking || s === question) process.stdout.write(s); };
  try {
    return await new Promise<string>((resolve) => rl.question(question, (a) => { asking = false; process.stdout.write('\n'); resolve(a); }));
  } finally { rl.close(); }
}

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
    if (cmd === 'hq-user') {
      const email = args[0] ?? '';
      const opt = (n: string) => args.find((a) => a.startsWith(`--${n}=`))?.slice(n.length + 3);
      const role = (opt('role') ?? 'member').toLowerCase();
      if (!email || email.startsWith('--') || (role !== 'owner' && role !== 'member')) throw new Error('usage: hq-user <email> [--role=owner|member] [--name=Alex] [--password-stdin] [--google-only]');
      let password: string | null = null;
      if (!args.includes('--google-only')) {
        if (args.includes('--password-stdin')) {
          const chunks: Buffer[] = []; for await (const c of process.stdin) chunks.push(c as Buffer);
          password = Buffer.concat(chunks).toString('utf8').replace(/\r?\n$/, '');
        } else {
          if (!process.stdin.isTTY) throw new Error('no terminal to ask for the password: use --password-stdin');
          password = await askHidden('New HQ password (12+ characters): ');
          if (password !== await askHidden('Same password again: ')) throw new Error('the two passwords are different; nothing changed');
        }
      }
      const { upsertUser } = await import('./hq/auth.js');
      const r = await upsertUser(db, email, role as 'owner' | 'member', password, opt('name'));
      console.log(`${r.created ? 'Created' : 'Updated'} HQ login ${email.toLowerCase()} (${role}${password === null ? ', Google sign-in only' : ', password set'}).`);
    } else if (cmd === 'ask') {
      // "Needs you" asks: something an agent or a Claude session needs Alex (or a member) to do.
      const [sub, ...rest] = args;
      const opt = (n: string) => rest.find((a) => a.startsWith(`--${n}=`))?.slice(n.length + 3);
      const A = await import('./hq/asks.js');
      if (sub === 'add') {
        let steps = opt('steps')?.replace(/\\n/g, '\n');
        if (rest.includes('--steps-stdin')) { const chunks: Buffer[] = []; for await (const c of process.stdin) chunks.push(c as Buffer); steps = Buffer.concat(chunks).toString('utf8'); }
        const r = await A.addAsk(db, {
          agent: opt('agent') ?? '', title: opt('title') ?? '', why: opt('why'), steps, actionLabel: opt('action-label'), actionUrl: opt('action-url'),
          priority: (opt('priority') ?? 'normal') as 'high' | 'normal', audience: (opt('for') ?? 'owner') as 'owner' | 'everyone', dedupeKey: opt('key'),
          due: opt('due'), clientFacing: rest.includes('--client-facing'), money: rest.includes('--money'),
        });
        console.log(`${r.created ? 'Added' : 'Already there (same key), unchanged:'} ask ${r.ask.id}: ${r.ask.agent}: ${r.ask.title}${r.ask.done ? ` (done ${r.ask.done.slice(0, 10)})` : ''}`);
      } else if (sub === 'list') {
        const list = await A.listAsks(db, { all: rest.includes('--all') });
        if (!list.length) console.log('No open asks.');
        for (const a of list) console.log(`${a.id}\t${a.done ? 'done' : a.snoozedUntil && Date.parse(a.snoozedUntil) > Date.now() ? 'not now' : a.priority === 'high' ? 'do now' : 'when you can'}\t${a.agent}: ${a.title}${a.audience === 'everyone' ? '\t(everyone)' : ''}`);
      } else if (sub === 'done') {
        const id = Number(rest[0]);
        if (!Number.isInteger(id) || id <= 0) throw new Error('usage: ask done <id>');
        console.log(await A.finishAsk(db, id, 'CLI') ? `Ask ${id} done.` : `Ask ${id} not found or already done.`);
      } else {
        throw new Error('usage: ask add --agent=Atlas --title="Reply to Pete about Twenty West" [--why=...] [--steps=... | --steps-stdin] [--action-label=Open] [--action-url=decisions/Replies|https://...] [--priority=high|normal] [--for=owner|everyone] [--key=...] [--due=YYYY-MM-DD] [--client-facing] [--money]\n       ask list [--all]\n       ask done <id>');
      }
    } else if (cmd === 'riley-n8n-rollback') {
      const issueId = args[0] ?? '';
      if (!/^rec[A-Za-z0-9]{14}$/.test(issueId)) throw new Error('usage: riley-n8n-rollback <System Issue record ID rec...> [--yes] [--force]');
      const { rollbackN8nFix } = await import('./agents/rileyN8n.js');
      console.log(await rollbackN8nFix(db, cfg, issueId, { yes: args.includes('--yes'), force: args.includes('--force') }));
    } else if (cmd === 'agent-task') {
      // An agent's own task list in HQ (for Claude sessions such as Riley's runbook): open/update, list, close.
      const [sub, ...rest] = args;
      const opt = (n: string) => rest.find((a) => a.startsWith(`--${n}=`))?.slice(n.length + 3);
      const T = await import('./hq/agentTasks.js');
      if (sub === 'upsert') {
        const r = await T.upsertAgentTask(db, {
          agent: opt('agent') ?? '', key: opt('key') ?? '', title: opt('title') ?? '', note: opt('note'), due: opt('due'), link: opt('link'), client: opt('client'),
          status: opt('status') as never, priority: opt('priority') as never,
        });
        if ('error' in r) throw new Error(r.error);
        console.log(`${r.created ? 'Opened' : r.changed ? 'Updated' : 'Unchanged'}: task ${r.id} (${r.status})`);
      } else if (sub === 'done') {
        console.log(await T.closeAgentTask(db, opt('key') ?? '', opt('note') ?? 'Done') ? 'Closed.' : 'No open task with that key.');
      } else if (sub === 'list') {
        const a = opt('agent');
        const { agentByName } = await import('./hq/agents.js');
        const list = await T.listAgentTasks(db, { agent: a ? agentByName(a) ?? undefined : undefined });
        if (!list.length) console.log('No open agent tasks.');
        for (const t of list) console.log(`${t.id}\t${t.agent}\t${t.status}${t.overdue ? ' (overdue)' : ''}${t.stalled ? ' (stalled)' : ''}\t${t.due ?? '-'}\t${t.title}\t${t.note}`);
      } else {
        throw new Error('usage: agent-task upsert --agent=Riley --key=<key> --title="..." [--status=open|in_progress|waiting_alex|done] [--note="..."] [--due=YYYY-MM-DD] [--link=decisions/Fixes] [--client=...] [--priority=high|normal|low]\n       agent-task done --key=<key> [--note="..."]\n       agent-task list [--agent=Riley]');
      }
    } else if (cmd === 'verify') {
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
    } else if (cmd === 'bounce-check-campaign') {
      // Re-run the bounce agent on one campaign to see its diagnosis; posts nothing unless --post.
      const teamId = Number(args[0]), campaignId = Number(args[1]);
      if (!(teamId > 0) || !(campaignId > 0)) throw new Error('usage: bounce-check-campaign <workspaceId> <campaignId> [--post]');
      const def = STAGES['bounce.investigate'];
      const r = await enqueue(db, { kind: 'bounce.investigate', recordId: `bounce-investigate:${campaignId}`, input: { teamId, campaignId, post: args.includes('--post') }, dryRun: cfg.dryRun && !cfg.liveStages.includes('bounce.investigate'), maxAttempts: def.maxAttempts, deadlineMs: def.deadlineMs });
      // Wait for the worker (up to 3 minutes) and print the diagnosis.
      for (let t = 0; t < 90; t++) {
        const j = (await db.query(`SELECT status, result, error FROM jobs WHERE id=$1`, [r.job.id])).rows[0];
        if (['succeeded', 'failed', 'needs_review'].includes(j?.status)) {
          console.log(j.status === 'succeeded' ? `\n== ${campaignId}: ${j.result.message}\n${(j.result.facts ?? []).map((f: string) => `   ${f}`).join('\n')}` : `\n== ${campaignId}: ${j.status}: ${j.error}`);
          break;
        }
        await new Promise((ok) => setTimeout(ok, 2_000));
      }
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
    } else if (cmd === 'xero-connect') {
      const x = await import('./providers/xero.js');
      if (!args[0]) {
        console.log(`1. Open this link and click Allow (pick the ${cfg.xeroTenantName} organisation):\n\n${await x.xeroAuthorizeUrl(db, cfg)}\n`);
        console.log('2. The browser then shows a page that does not load (localhost). That is expected.');
        console.log('3. Copy the whole address from the browser bar and run:\n   docker compose exec engine node dist/src/cli.js xero-connect "<that address>"');
      } else {
        const r = await x.xeroFinishLogin(db, cfg, args.join(' '));
        console.log(`Connected to Xero: ${r.tenant}${r.others.length ? ` (also allowed, not used: ${r.others.join(', ')})` : ''}. Ledger can read the books now.`);
      }
    } else if (cmd === 'ledger-prep') {
      const def = STAGES['ledger.prep'];
      const liveRun = args.includes('--live') && !(cfg.dryRun && !cfg.liveStages.includes('ledger.prep'));
      const r = await enqueue(db, { kind: 'ledger.prep', recordId: 'ledger-prep', input: { post: liveRun }, dryRun: !liveRun, maxAttempts: def.maxAttempts, deadlineMs: def.deadlineMs });
      console.log(`Job ${r.job.id}: ${cfg.ledgerPrepWrite ? (liveRun ? 'creating entries in Xero…' : 'preview only (nothing is written)…') : 'checking Mercury against Xero (Ledger never writes in checker mode)…'}`);
      for (let t = 0; t < 150; t++) {
        const j = (await db.query(`SELECT status, result, error FROM jobs WHERE id=$1`, [r.job.id])).rows[0];
        if (['succeeded', 'failed', 'needs_review'].includes(j?.status)) {
          if (j.status !== 'succeeded') { console.log(`${j.status}: ${j.error}`); break; }
          const res = j.result;
          console.log(res.message);
          if (res.made?.length) console.log(`\n${liveRun ? 'Created' : 'Would create'}:\n${res.made.map((x: string) => `  ${x}`).join('\n')}`);
          if (res.asks?.length) console.log(`\n${res.mode === 'check' ? 'Not in Xero after 3+ days' : 'HQ To-do'}:\n${res.asks.join('\n')}`);
          if (res.failed?.length) console.log(`\nXero refused:\n${res.failed.join('\n')}`);
          break;
        }
        await new Promise((ok) => setTimeout(ok, 2_000));
        if (t === 149) console.log(`Still running. Check later with: docker compose exec engine node dist/src/cli.js job ${r.job.id}`);
      }
    } else if (cmd === 'atlas-health') {
      const { createAirtableClient } = await import('./providers/airtable.js');
      const A = await import('./agents/atlas.js');
      const at = createAirtableClient({ apiKey: cfg.airtableApiKey, baseId: cfg.airtableBaseId, baseUrl: cfg.airtableBaseUrl });
      const text = A.writeHealth(await A.gatherHealth(at, new Date()));
      console.log(text);
      if (args.includes('--post')) {
        const { createSlackClient } = await import('./providers/slack.js');
        await createSlackClient({ token: cfg.slackBotToken, baseUrl: cfg.slackBaseUrl }).post(cfg.atlasChannel, text);
        console.log(`\n(posted to ${cfg.atlasChannel})`);
      }
    } else if (cmd === 'calendar-test') {
      // Check a client's calendar connection and, with --book <email>, book ONE real test meeting
      // on the first open slot (Alex, 2026-11-27: test booking end to end on Dulcy's own calendar).
      const ws = args[0] ?? '';
      if (!/^rec[A-Za-z0-9]{14}$/.test(ws)) throw new Error('usage: calendar-test <workspace record id> [--book <prospect email>] [--name "Test Prospect"] [--phone +15551234567]');
      const st = await calendarStatus(cfg, ws);
      console.log('Status:', st ? `${st.status} · provider ${st.provider ?? '?'} · can book: ${st.canBook ? 'yes' : 'NO (reconnect)'} · tz ${st.timezone ?? '?'}` : 'no calendar connected (or CALENDAR_READER_TOKEN missing)');
      const open = await openTimes(cfg, ws);
      console.log('Open times:', open?.slots.length ? open.slots.slice(0, 4).join(' | ') : 'none found');
      const email = flag(args, '--book');
      if (email) {
        if (!st?.canBook) throw new Error('this calendar cannot book yet: reconnect it from HQ (AI replier → Get calendar link)');
        if (!cfg.calendarBookerToken) throw new Error('CALENDAR_BOOKER_TOKEN is not set in the engine .env');
        const start = open?.slots[0];
        if (!start) throw new Error('no open slot to book');
        const r = await bookSlot(cfg, { workspace: ws, start, tz: open!.timezone, prospect: { name: flag(args, '--name') ?? 'Test Prospect', email, phone: flag(args, '--phone') }, title: 'Dulcy booking test', description: 'Test booking made from the engine (calendar-test).', idempotencyKey: `test:${ws}:${start.slice(0, 16)}` });
        console.log('Booking:', JSON.stringify(r, null, 2));
      }
    } else if (cmd === 'discord-check') {
      // Read-only: can Sienna's bot see Agency Ignition? Per channel: messages in 30 days, empty ones, questions. No Claude, no posting.
      if (!cfg.discordBotToken) throw new Error('no DISCORD_BOT_TOKEN in the server .env');
      const D = await import('./providers/discord.js');
      const dc = D.createDiscordClient({ token: cfg.discordBotToken, baseUrl: cfg.discordBaseUrl });
      const listed = await dc.channelList(100);
      const chans = cfg.siennaDiscordChannels.length ? listed.filter((c) => cfg.siennaDiscordChannels.includes(c.id)) : listed;
      console.log(`Servers: ${[...new Set(listed.map((c) => c.server))].join(', ') || 'none'}. Text channels the bot can see: ${chans.length}.`);
      const since = Date.now() - 30 * 86_400_000; let total = 0, empty = 0, questions = 0, anyText = 0, fetched = 0;
      for (const c of chans) {
        const msgs = await dc.recent(c.id);
        const week = msgs.filter((m) => !m.author?.bot && Date.parse(m.timestamp) >= since);
        const blank = week.filter((m) => !String(m.content ?? '').trim()).length;
        const q = D.communityQuestions(msgs, new Date(), 30).length;
        total += week.length; empty += blank; questions += q; fetched += msgs.length; anyText += msgs.filter((m) => String(m.content ?? '').trim()).length;
        if (msgs.length) console.log(`- #${c.name}: ${week.length} messages in 30 days (${blank} with no text), ${q} questions`);
      }
      if (fetched >= 20 && !anyText) console.log(`Message text is hidden (0 of ${fetched} recent messages have text): turn on MESSAGE CONTENT INTENT (Developer Portal → Bot → Privileged Gateway Intents → Save), then run this again.`);
      else if (fetched) console.log(`Message text is readable (${anyText} of ${fetched} recent messages have text).`);
      console.log(total ? `${total} messages in the last 30 days; ${questions} questions for Sienna.` : 'No messages in the last 30 days in the channels it can see.');
      if (chans.length <= 1) console.log('Only 1 channel visible: give the bot (or its role) View Channel + Read Message History on the other channels, or on the whole server.');
    } else if (cmd === 'campaign-copy') {
      // Rewrite a plan's copy with your notes (after ❌ on approval 2, or any time before the client sees it).
      const id = Number(args[0]); const notes = args.slice(1).filter((a) => !a.startsWith('--')).join(' ').trim();
      if (!id || !notes) throw new Error('usage: campaign-copy <plan id> "<what to change>"');
      const r = (await db.query(`UPDATE campaign_plans SET copy_state='queued', copy_round=copy_round+1, copy_feedback=$2, state=CASE WHEN state IN ('copy_rejected','approval2') THEN 'approval2_wait' ELSE state END, updated_at=now() WHERE id=$1 RETURNING state, copy_round`, [id, notes])).rows[0];
      if (r) await (await import('./instant/afterJob.js')).planWork(db, cfg); // Scribe starts now
      console.log(r ? `Plan ${id}: Scribe rewrites (round ${r.copy_round}) now; approval 2 comes back to Slack.` : `No plan ${id}`);
    } else if (cmd === 'jobs') {
      // What the engine is doing: running jobs, the queue, and the last 15 that finished.
      const age = (t: string) => { const m = Math.round((Date.now() - new Date(t).getTime()) / 60_000); return m < 60 ? `${m}m` : `${Math.round(m / 60)}h`; };
      const run = (await db.query(`SELECT id, kind, updated_at, progress FROM jobs WHERE status='running' ORDER BY id`)).rows;
      console.log(`Running (${run.length}):`); for (const j of run) console.log(`  ${j.id} ${j.kind} · ${age(j.updated_at)} · ${String(j.progress ?? '').slice(0, 80)}`);
      const q = (await db.query(`SELECT kind, count(*)::int AS n, min(run_after) AS next FROM jobs WHERE status='queued' GROUP BY kind ORDER BY n DESC`)).rows;
      console.log(`Queued (${q.reduce((a, x) => a + x.n, 0)}): ${q.map((x) => `${x.kind} ${x.n}`).join(', ') || 'none'}`);
      for (const j of (await db.query(`SELECT id, kind, status, updated_at, left(coalesce(error, result->>'message', ''), 90) AS msg FROM jobs WHERE status NOT IN ('queued','running') ORDER BY updated_at DESC LIMIT 15`)).rows)
        console.log(`  ${j.id} ${j.kind} ${j.status} · ${age(j.updated_at)} ago · ${j.msg}`);
    } else if (cmd === 'campaign-plan-retry') {
      // Run a set-aside (stuck) plan's planning again; it reuses the Campaign record and the Claude answer it already has.
      const id = Number(args[0]); if (!id) throw new Error('usage: campaign-plan-retry <plan id>');
      const r = (await db.query(`UPDATE campaign_plans SET state='planning', plan_round=plan_round+1, plan_error=NULL, updated_at=now() WHERE id=$1 AND state IN ('stuck','planning') RETURNING plan_round`, [id])).rows[0];
      if (r) await (await import('./instant/afterJob.js')).planWork(db, cfg); // Atlas starts now
      console.log(r ? `Plan ${id}: planning again (round ${r.plan_round}) now.` : `Plan ${id} is not stuck.`);
    } else if (cmd === 'hooks' && args[0] === 'connect') {
      // Connect every service to the engine's webhooks (2026-11-28). Dry run unless --yes. Never prints a secret.
      const { hooksConnect } = await import('./instant/connect.js');
      const at = cfg.airtableApiKey ? (await import('./providers/airtable.js')).createAirtableClient({ apiKey: cfg.airtableApiKey, baseId: cfg.airtableBaseId, baseUrl: cfg.airtableBaseUrl }) : null;
      const r = await hooksConnect(db, cfg, { yes: args.includes('--yes'), airtable: at });
      console.log(r.text);
    } else if (cmd === 'hooks' && args[0] === 'secret') {
      // Store a provider-issued webhook secret (Slack signing secret, Fathom whsec_, Close signature key). Hidden input.
      const source = String(args[1] ?? '').toLowerCase();
      const S = await import('./instant/secrets.js');
      if (!(S.PROVIDER_SOURCES as readonly string[]).includes(source)) throw new Error('usage: hooks secret <slack|fathom|close>   (the engine makes the EmailBison, n8n, Make and Airtable secrets itself)');
      let value: string;
      if (process.stdin.isTTY) value = await askHidden(`Paste the ${source} secret (nothing is shown): `);
      else { const chunks: Buffer[] = []; for await (const c of process.stdin) chunks.push(c as Buffer); value = Buffer.concat(chunks).toString('utf8'); }
      value = value.trim();
      if (!value) throw new Error('nothing pasted; nothing changed');
      if (cfg.hookSecretsEnv?.[source as 'slack']) console.log(`Note: HOOK_SECRET_${source.toUpperCase()} in the server .env still wins over this one; delete that line and restart to use it.`);
      await S.storeProviderSecret(db, cfg, source as 'slack', value); // refuses a value of the wrong shape (the value is never repeated)
      console.log(`Saved the ${source} secret (sealed; never shown). The engine accepts ${source} webhooks within 30 seconds.`);
    } else if (cmd === 'hooks') {
      // Instant webhooks (2026-11-28): which sources are set up, what each job runs on, and the last events received.
      const { HOOK_SOURCES } = await import('./config.js');
      const { INSTANT_JOBS, isInstant, sweepEveryMin } = await import('./instant/jobs.js');
      const S = await import('./instant/secrets.js');
      await S.refreshHookSecrets(db, cfg);
      const last = new Map((await db.query(`SELECT source, count(*) FILTER (WHERE received_at > now() - interval '24 hours')::int AS n, max(received_at) AS at FROM hook_events GROUP BY source`)).rows.map((r) => [r.source, r]));
      console.log(`Webhook sources (URL ${cfg.enginePublicUrl}/hooks/<source>):`);
      for (const s of HOOK_SOURCES) { const l = last.get(s); console.log(`  ${s.padEnd(10)} ${cfg.hookSecrets[s] ? 'connected' : cfg.hookPending?.[s] ? 'secret made, waiting for the provider' : 'no secret (404)'} · ${l ? `${l.n} in 24 h, last ${new Date(l.at).toISOString().slice(0, 16)}` : 'nothing received yet'}`); }
      console.log('Jobs:');
      for (const j of INSTANT_JOBS) { const every = sweepEveryMin(cfg, j.key); console.log(`  ${j.key.padEnd(18)} ${isInstant(cfg, j.key) ? `INSTANT · backup sweep ${every ? `every ${every} min` : 'off'}` : `old timer ${every ? `every ${Math.round(every * 10) / 10} min` : 'off'} (waits for ${j.sources.join(j.all ? ' + ' : ' or ')}: hooks connect)`}`); }
      for (const e of (await db.query(`SELECT source, event, jobs, received_at FROM hook_events ORDER BY id DESC LIMIT 10`)).rows) console.log(`  ${new Date(e.received_at).toISOString().slice(0, 19)} ${e.source} ${e.event} → ${(e.jobs ?? []).join(', ') || 'nothing'}`);
    } else if (cmd === 'campaign-plans') {
      for (const p of (await db.query(`SELECT id, client, state, copy_state, copy_round, plan->>'campaign_name' AS name, plan_error, updated_at FROM campaign_plans ORDER BY id DESC LIMIT 20`)).rows) console.log(`${p.id} · ${p.client} · ${p.state}${p.copy_state ? ` · copy ${p.copy_state} (round ${p.copy_round})` : ''} · ${p.name ?? ''} · ${new Date(p.updated_at).toISOString().slice(0, 16)}${p.plan_error ? `\n    ${String(p.plan_error).slice(0, 200)}` : ''}`);
    } else if (cmd === 'agent') {
      const kind = String(args[0] ?? '');
      if (!['atlas.health', 'cole.review', 'sienna.ideas', 'sienna.prep'].includes(kind)) throw new Error('usage: agent <atlas.health|cole.review|sienna.ideas|sienna.prep> [--since=YYYY-MM-DD]');
      const def = STAGES[kind];
      const since = args.find((a) => a.startsWith('--since='))?.split('=')[1];
      const r = await enqueue(db, { kind, recordId: kind.replace('.', '-'), input: since ? { since: new Date(since).toISOString() } : {}, dryRun: cfg.dryRun && !cfg.liveStages.includes(kind), maxAttempts: def.maxAttempts, deadlineMs: def.deadlineMs });
      console.log(`Job ${r.job.id} (${r.job.dry_run ? 'dry run' : 'live'})…`);
      for (let t = 0; t < 450; t++) {
        const j = (await db.query(`SELECT status, result, error FROM jobs WHERE id=$1`, [r.job.id])).rows[0];
        if (['succeeded', 'failed', 'needs_review'].includes(j?.status)) { console.log(j.status === 'succeeded' ? JSON.stringify(j.result, null, 2) : `${j.status}: ${j.error}`); break; }
        await new Promise((ok) => setTimeout(ok, 2_000));
        if (t === 449) console.log(`Still running. Check later with: docker compose exec engine node dist/src/cli.js job ${r.job.id}`);
      }
    } else if (cmd === 'ledger-report' || cmd === 'ledger-ask') {
      const { createXeroClient } = await import('./providers/xero.js');
      const L = await import('./agents/ledger.js');
      const xero = createXeroClient(db, cfg);
      const now = new Date();
      if (cmd === 'ledger-report') {
        const { createMercuryClient } = await import('./providers/mercury.js');
        const merc = cfg.mercuryToken ? createMercuryClient({ token: cfg.mercuryToken, baseUrl: cfg.mercuryBaseUrl }) : undefined;
        const text = L.writeLedgerReport(await L.gatherLedger(xero, now, merc, db));
        console.log(text);
        if (args.includes('--post')) {
          const { createSlackClient } = await import('./providers/slack.js');
          await createSlackClient({ token: cfg.slackBotToken, baseUrl: cfg.slackBaseUrl }).post(cfg.ledgerChannel, text);
          console.log(`\n(posted to ${cfg.ledgerChannel})`);
        }
      } else {
        const q = args.join(' ');
        if (!q) throw new Error('usage: ledger-ask "Should I buy Clay $349/mo?"');
        const d = await L.gatherLedger(xero, now);
        console.log(L.verdict(L.parseAsk(q), L.opex(d), []));
        for (const e of d.errors) console.log(`(couldn't read ${e})`);
      }
    } else {
      throw new Error('commands: hq-user, ask, hooks [connect [--yes] | secret <slack|fathom|close>], riley-n8n-rollback, calendar-test, discord-check, jobs, job, campaign-plans, campaign-plan-retry, campaign-copy, atlas-health, agent, xero-connect, ledger-report, ledger-prep, ledger-ask, verify, mv-compare, campaign, topup, senders, bounce, whereis, cleanup-test, cancel');
    }
  } finally {
    await db.end();
  }
}

main().catch((e) => { console.error(String(e.message ?? e)); process.exit(1); });

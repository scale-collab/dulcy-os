// Stage: bounce.check — check every active campaign in one EmailBison workspace and apply
// Alex's bounce rule each time (pause over 4% at 35%+ progress, watch over 2.5%).
// Pausing goes through the engine's paid-call path, so in dry-run (report-only) nothing is
// paused; switch it live per stage with LIVE_STAGES=bounce.check. It never resumes anything.
// input.skipPauseCampaignIds: EmailBison IDs of Campaigns records with "Skip Bounce Pause" ticked
// (Alex, 2026-11-23: a just-launched campaign where 1 early bounce looks like 10%). Those are
// never paused here; they still show under watch, with a note.
import type { Stage } from './index.js';
import { NeedsReviewError, PermanentError } from '../errors.js';
import { bisonFor, createBisonClient } from '../providers/emailbison.js';
import { bounceAction, bounceRate, statsFrom } from '../campaign/bounce.js';
import { syncCampaignStats } from '../campaign/statsSync.js';
import { createAirtableClient } from '../providers/airtable.js';
import { alert } from '../log.js';
import { enqueue } from '../queue.js';
import { logActivity } from '../activity.js';
import { STAGES } from './index.js';

type Row = { id: number; name: string; bounce: number; progress: number; note?: string; workspace?: string; teamId?: number; contacted?: number; bounced?: number };

/** One workspace: pause over 4% at 35%+ progress (unless Skip Bounce Pause), list 2.5%+ to watch. */
async function checkWorkspace(ctx: Parameters<Stage>[0], bison: ReturnType<typeof bisonFor>, label: string, skip: Set<number>, teamId?: number) {
  const all = await bison.listCampaigns();
  const active = all.map(statsFrom).filter((c) => c.status === 'active');
  const paused: Row[] = [], watch: Row[] = [], skippedPause: Row[] = [];
  for (const c of active) {
    const action = bounceAction(c);
    const row: Row = { id: c.id, name: c.name, bounce: bounceRate(c), progress: c.progress, workspace: label, teamId, contacted: c.contacted, bounced: c.bounced };
    if (action === 'watch') watch.push(row);
    if (action !== 'pause') continue;
    if (skip.has(c.id)) {
      const kept = { ...row, note: 'Skip Bounce Pause is ticked: not paused' };
      watch.push(kept);
      skippedPause.push(kept);
      continue;
    }
    await ctx.paid({
      // One pause call per campaign per job; a later job re-checks and pauses again if needed.
      callKey: `pause:${c.id}`, provider: 'emailbison', units: 0,
      run: async () => { await bison.pauseCampaign(c.id); return { paused: c.id }; },
      dryRunResult: () => ({ paused: 0 }),
    });
    paused.push(row);
    if (!ctx.dryRun) await logActivity(ctx.cfg, { event: `Paused: bounce ${row.bounce}% at ${row.progress}% progress`, type: 'Detected', agent: 'Atlas', details: `Over 4% at 35%+ progress = pause and investigate. ${c.bounced} bounced of ${c.contacted} contacted.`, bisonCampaignId: c.id, jobId: ctx.job.id });
  }
  // Live: confirm each pause took effect (the Airtable script never checked its pause call).
  if (!ctx.dryRun && paused.length) {
    const after = new Map((await bison.listCampaigns()).map(statsFrom).map((c) => [c.id, c.status]));
    const still = paused.filter((p) => after.get(p.id) === 'active');
    if (still.length) throw new NeedsReviewError(`pause did not take effect for campaign(s) ${still.map((p) => p.id).join(', ')} (${label}); pause them by hand and investigate`);
  }
  // Campaigns already paused (by hand or earlier) with bounce over 4% at 35%+: investigated once, ever.
  const pausedHigh: Row[] = all.map(statsFrom).filter((c) => c.status === 'paused' && bounceAction(c) === 'pause')
    .map((c) => ({ id: c.id, name: c.name, bounce: bounceRate(c), progress: c.progress, workspace: label, teamId, contacted: c.contacted, bounced: c.bounced }));
  return { checked: active.length, paused, watch, skippedPause, all, pausedHigh };
}

export const bounceCheckStage: Stage = async (ctx) => {
  const workspace = String(ctx.job.input.workspace ?? '').toLowerCase();
  if (!workspace) throw new PermanentError('input.workspace is required');
  const skip = new Set((Array.isArray(ctx.job.input.skipPauseCampaignIds) ? ctx.job.input.skipPauseCampaignIds : []).map(Number));

  // "all" (Alex, 2026-11-24): one key reaches every client workspace; check each in turn.
  let targets: { label: string; bison: ReturnType<typeof bisonFor>; teamId?: number; name?: string }[];
  if (workspace === 'all') {
    const keyName = ctx.cfg.bounceCheckKey;
    const apiKey = ctx.cfg.emailBisonKeys[keyName];
    if (!apiKey) throw new PermanentError(`no EmailBison key on the server named EMAILBISON_KEY_${keyName.toUpperCase()} (BOUNCE_CHECK_KEY)`);
    const teams = await ctx.step('workspaces', () => createBisonClient({ apiKey, baseUrl: ctx.cfg.emailBisonBaseUrl }).listWorkspaces());
    targets = teams.map((t) => ({ label: `${t.name} (${t.id})`, teamId: t.id, name: t.name, bison: createBisonClient({ apiKey, baseUrl: ctx.cfg.emailBisonBaseUrl, teamId: t.id }) as ReturnType<typeof bisonFor> }));
  } else {
    const apiKey = ctx.cfg.emailBisonKeys[workspace];
    if (!apiKey) throw new PermanentError(`no EmailBison key on the server for workspace "${workspace}"`);
    targets = [{ label: workspace, teamId: Number(ctx.job.input.workspaceId) || undefined, name: workspace, bison: bisonFor(ctx.cfg, workspace, Number(ctx.job.input.workspaceId) || undefined) }];
  }

  let checked = 0;
  const paused: Row[] = [], watch: Row[] = [], skippedPause: Row[] = [], pausedHigh: Row[] = [], failed: string[] = [];
  const allRows: any[] = [];
  for (const t of targets) {
    try {
      const r = await checkWorkspace(ctx, t.bison, t.label, skip, t.teamId);
      checked += r.checked; pausedHigh.push(...r.pausedHigh); paused.push(...r.paused); watch.push(...r.watch); skippedPause.push(...r.skippedPause); allRows.push(...r.all);
    } catch (e) {
      // One workspace that cannot be read must not stop the others (a pause that did not hold still goes to review).
      if (e instanceof NeedsReviewError || targets.length === 1) throw e;
      failed.push(`${t.label}: ${String((e as Error).message ?? e).slice(0, 120)}`);
    }
  }

  // The bounce agent (Atlas): investigate each paused or over-4% campaign once every 3 days and post the cause + fix to Slack.
  let investigating = 0;
  const window = Math.floor(Date.now() / (3 * 86_400_000));
  const justPaused = new Set(paused.map((r) => r.id));
  // Only campaigns this check pauses or flags (sending, over 4%). Old paused campaigns are not swept up:
  // on 2026-11-25 that sent 47 long-finished campaigns from 35 workspaces to Slack at once.
  void justPaused; void pausedHigh;
  const toInvestigate = [...paused.map((r) => ({ r, key: String(window) })), ...skippedPause.map((r) => ({ r, key: String(window) }))];
  for (const { r, key } of toInvestigate) {
    if (!r.teamId) continue;
    const def = STAGES['bounce.investigate'];
    const q = await enqueue(ctx.db, {
      kind: 'bounce.investigate', recordId: `bounce-investigate:${r.id}`, requestId: `bounce-investigate:${r.teamId}:${r.id}:${key}`,
      input: { teamId: r.teamId, campaignId: r.id, name: r.name, workspaceName: targets.find((t) => t.teamId === r.teamId)?.name ?? '', bounce: r.bounce, progress: r.progress, contacted: r.contacted, bounced: r.bounced, paused: !r.note },
      dryRun: ctx.cfg.dryRun && !ctx.cfg.liveStages.includes('bounce.investigate'), maxAttempts: def.maxAttempts, deadlineMs: def.deadlineMs,
    });
    if (q.status === 'queued') investigating++;
  }

  // Fresh numbers into Airtable Campaigns (all campaigns, paused too). A failed write never stops the check.
  let stats = { updated: 0, matched: 0 }, statsError = '';
  if (ctx.cfg.airtableApiKey && allRows.length) {
    try {
      const at = createAirtableClient({ apiKey: ctx.cfg.airtableApiKey, baseId: ctx.cfg.airtableBaseId, baseUrl: ctx.cfg.airtableBaseUrl });
      stats = await syncCampaignStats(at, allRows);
    } catch (e) { statsError = String((e as Error).message ?? e).slice(0, 200); }
  }

  if (paused.length || watch.length || failed.length) {
    const fmt = (r: Row) => `• ${r.name} (${r.id})${targets.length > 1 ? ` [${r.workspace}]` : ''}: bounce ${r.bounce}% at ${r.progress}% progress${r.note ? ` (${r.note})` : ''}`;
    const lines = [
      paused.length ? `${ctx.dryRun ? ':warning: Would pause (report-only)' : ':octagonal_sign: Paused'} for bounce over 4%:\n${paused.map(fmt).join('\n')}` : '',
      watch.length ? `:eyes: Watch, bounce over 2.5%:\n${watch.map(fmt).join('\n')}` : '',
      failed.length ? `:grey_question: Could not check:\n${failed.map((f) => `• ${f}`).join('\n')}` : '',
    ].filter(Boolean);
    await alert(ctx.cfg.slackWebhookUrl, `Bounce check, ${workspace === 'all' ? `${targets.length} workspaces` : `workspace ${workspace}`}:\n${lines.join('\n')}`);
  }
  return {
    dryRun: ctx.dryRun, workspace, workspaces: targets.length, checked,
    paused: ctx.dryRun ? [] : paused, wouldPause: ctx.dryRun ? paused : [], watch, skippedPause, failed, statsUpdated: stats.updated, statsMatched: stats.matched, statsError,
    message: `${checked} active campaigns checked${targets.length > 1 ? ` in ${targets.length} workspaces` : ''}: ${paused.length} ${ctx.dryRun ? 'would be paused' : 'paused'}, ${watch.length} to watch${skippedPause.length ? ` (${skippedPause.length} not paused: Skip Bounce Pause ticked)` : ''}${failed.length ? `; ${failed.length} workspace(s) could not be checked` : ''}${stats.updated ? `; Airtable numbers updated on ${stats.updated} campaigns` : ''}${statsError ? `; Airtable numbers not written: ${statsError}` : ''}${investigating ? `; ${investigating} sent to the bounce agent` : ''}`,
  };
};

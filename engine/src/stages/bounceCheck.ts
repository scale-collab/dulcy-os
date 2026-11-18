// Stage: bounce.check — check every active campaign in one EmailBison workspace and apply
// Alex's bounce rule each time (pause over 4% at 35%+ progress, watch over 2.5%).
// Pausing goes through the engine's paid-call path, so in dry-run (report-only) nothing is
// paused; switch it live per stage with LIVE_STAGES=bounce.check. It never resumes anything.
import type { Stage } from './index.js';
import { NeedsReviewError, PermanentError } from '../errors.js';
import { bisonFor } from '../providers/emailbison.js';
import { bounceAction, bounceRate, statsFrom } from '../campaign/bounce.js';
import { alert } from '../log.js';

export const bounceCheckStage: Stage = async (ctx) => {
  const workspace = String(ctx.job.input.workspace ?? '').toLowerCase();
  if (!workspace) throw new PermanentError('input.workspace is required');
  const apiKey = ctx.cfg.emailBisonKeys[workspace];
  if (!apiKey) throw new PermanentError(`no EmailBison key on the server for workspace "${workspace}"`);
  const bison = bisonFor(ctx.cfg, workspace, Number(ctx.job.input.workspaceId) || undefined);

  const active = (await bison.listCampaigns()).map(statsFrom).filter((c) => c.status === 'active');
  const paused: { id: number; name: string; bounce: number; progress: number }[] = [];
  const watch: { id: number; name: string; bounce: number; progress: number }[] = [];
  for (const c of active) {
    const action = bounceAction(c);
    const row = { id: c.id, name: c.name, bounce: bounceRate(c), progress: c.progress };
    if (action === 'watch') watch.push(row);
    if (action !== 'pause') continue;
    await ctx.paid({
      // One pause call per campaign per job; a later job re-checks and pauses again if needed.
      callKey: `pause:${c.id}`, provider: 'emailbison', units: 0,
      run: async () => { await bison.pauseCampaign(c.id); return { paused: c.id }; },
      dryRunResult: () => ({ paused: 0 }),
    });
    paused.push(row);
  }

  // Live: confirm each pause took effect (the Airtable script never checked its pause call).
  if (!ctx.dryRun && paused.length) {
    const after = new Map((await bison.listCampaigns()).map(statsFrom).map((c) => [c.id, c.status]));
    const still = paused.filter((p) => after.get(p.id) === 'active');
    if (still.length) throw new NeedsReviewError(`pause did not take effect for campaign(s) ${still.map((p) => p.id).join(', ')}; pause them by hand and investigate`);
  }

  if (paused.length || watch.length) {
    const fmt = (r: { id: number; name: string; bounce: number; progress: number }) => `• ${r.name} (${r.id}): bounce ${r.bounce}% at ${r.progress}% progress`;
    const lines = [
      paused.length ? `${ctx.dryRun ? ':warning: Would pause (report-only)' : ':octagonal_sign: Paused'} for bounce over 4%:\n${paused.map(fmt).join('\n')}` : '',
      watch.length ? `:eyes: Watch, bounce over 2.5%:\n${watch.map(fmt).join('\n')}` : '',
    ].filter(Boolean);
    await alert(ctx.cfg.slackWebhookUrl, `Bounce check, workspace ${workspace}:\n${lines.join('\n')}`);
  }
  return {
    dryRun: ctx.dryRun, workspace, checked: active.length,
    paused: ctx.dryRun ? [] : paused, wouldPause: ctx.dryRun ? paused : [], watch,
    message: `${active.length} active campaigns checked: ${paused.length} ${ctx.dryRun ? 'would be paused' : 'paused'}, ${watch.length} to watch`,
  };
};

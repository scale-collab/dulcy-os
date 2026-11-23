// Campaign Center buttons on the engine (Alex, 2026-11-23): Launch, Pause, Update Senders.
// Each job works on the EmailBison campaign(s) of one Campaigns record (Direct and/or Generic).
//  - campaign.launch: pressing Launch IS Alex's go-ahead, but every launch check runs first;
//    if any fails nothing is launched and the failed check is named. Launch = EmailBison
//    "resume" (it also launches a draft), then the status is confirmed.
//  - campaign.pause: pauses right away and confirms. Never resumes.
//  - campaign.senders: makes the attached inboxes equal the record's Email Accounts. EmailBison
//    only allows sender changes on a draft or paused campaign, so a live one is paused, changed
//    and resumed. Inboxes that are not connected are warnings only.
// Every EmailBison write goes through a job receipt (ctx.paid), so a retry never repeats it;
// a dry run makes no writes (reads only).
import type { Stage } from './index.js';
import type { JobContext } from '../context.js';
import { NeedsReviewError, PermanentError, WaitError } from '../errors.js';
import { bisonFor, type BisonClient } from '../providers/emailbison.js';
import { alert } from '../log.js';

export interface ControlTarget { campaignId: number; recordId?: string; name?: string; outputType?: 'direct' | 'generic'; senderEmailIds?: string[] }
interface ControlInput { campaignRecordId?: string; name?: string; workspace: string; workspaceId?: number; targets: ControlTarget[] }

/** Statuses that mean the campaign is sending (or about to). */
export const LIVE_STATUSES = ['queued', 'launching', 'active'];
/** Statuses a launch may start from. */
const LAUNCHABLE = ['draft', 'paused'];
/** How many status reads (one per bisonPollMs) before a person looks. */
const STATUS_CHECKS = 10;

function readControl(raw: Record<string, unknown>, needSenders = false): ControlInput {
  const i = raw as unknown as ControlInput;
  if (!i.workspace) throw new PermanentError('input.workspace is required');
  if (!Array.isArray(i.targets) || i.targets.length === 0) throw new PermanentError('input.targets (the EmailBison campaigns) is required');
  const targets = i.targets.map((t) => ({ ...t, campaignId: Number(t.campaignId) }));
  if (targets.some((t) => !Number.isSafeInteger(t.campaignId) || t.campaignId < 1)) throw new PermanentError('every target needs a numeric EmailBison campaignId');
  if (new Set(targets.map((t) => t.campaignId)).size !== targets.length) throw new PermanentError('the same EmailBison campaign is listed twice');
  if (needSenders && targets.some((t) => !Array.isArray(t.senderEmailIds) || t.senderEmailIds.length === 0)) throw new PermanentError('every target needs senderEmailIds (at least one inbox)');
  return { ...i, targets };
}

function clientFor(ctx: JobContext, input: ControlInput): BisonClient {
  if (!ctx.cfg.emailBisonKeys[input.workspace.toLowerCase()]) throw new PermanentError(`no EmailBison key on the server for workspace "${input.workspace}"`);
  return bisonFor(ctx.cfg, input.workspace, Number(input.workspaceId) || undefined);
}

/** Read the status until it is one of `want` (waiting between reads), then a person looks. */
async function waitForStatus(ctx: JobContext, bison: BisonClient, key: string, id: number, want: string[], review: string): Promise<string> {
  for (let k = 1; k <= STATUS_CHECKS; k++) {
    let fresh = false;
    const s = await ctx.step(`${key}-${k}`, async () => { fresh = true; return { status: await bison.campaignStatus(id) }; });
    if (want.includes(s.status)) return s.status;
    if (k === STATUS_CHECKS) throw new NeedsReviewError(`${review} (EmailBison shows "${s.status || 'unknown'}")`);
    if (fresh) throw new WaitError(`campaign ${id} is "${s.status || 'unknown'}"; waiting for ${want.join(' / ')}`, ctx.cfg.bisonPollMs);
  }
  throw new NeedsReviewError(review);
}

const pauseCall = (ctx: JobContext, bison: BisonClient, id: number, callKey: string) => ctx.paid({
  callKey, provider: 'emailbison', units: 0,
  run: async () => { await bison.pauseCampaign(id); return { paused: id }; },
  // An unclear pause: adopt it if EmailBison shows it paused, else it is safe to pause again.
  reconcile: async () => ((await bison.campaignStatus(id)) === 'paused' ? { paused: id } : null),
  dryRunResult: () => ({ paused: 0 }),
});

const resumeCall = (ctx: JobContext, bison: BisonClient, id: number, callKey: string) => ctx.paid({
  callKey, provider: 'emailbison', units: 0,
  run: async () => { await bison.resumeCampaign(id); return { resumed: id }; },
  reconcile: async () => (LIVE_STATUSES.includes(await bison.campaignStatus(id)) ? { resumed: id } : null),
  dryRunResult: () => ({ resumed: 0 }),
});

// ---------------------------------------------------------------- launch checks

/** What the Airtable bridge read from the Campaigns record when Launch was pressed. */
export interface LaunchFacts {
  copy: { workflowStage?: string; approvalSource?: string; approvalException?: boolean };
  leadList: { linked: number; name?: string; stage?: string; qa?: string };
  client: { linked: boolean; name?: string; status?: string };
}
export interface LaunchCheck { check: string; pass: boolean; detail: string }

export const APPROVED_STAGES = ['approved', 'build ready', 'launch ready', 'live'];
/** Launch checks the engine cannot do yet (engine/PLAN.md section 7); listed, not blocking. */
export const NOT_CHECKED_YET = ['EmailGuard spam check', 'claims in the copy vs the client\'s approved proof'];

/** Launch checks (a), (b) and (d): from the Airtable record. (c) is per EmailBison campaign. */
export function airtableLaunchChecks(f: LaunchFacts): LaunchCheck[] {
  const out: LaunchCheck[] = [];
  const stage = String(f.copy?.workflowStage ?? '').trim();
  const source = String(f.copy?.approvalSource ?? '').trim();
  const approved = APPROVED_STAGES.includes(stage.toLowerCase()) || source !== '' || f.copy?.approvalException === true;
  out.push({ check: 'copy approved', pass: approved,
    detail: approved ? [APPROVED_STAGES.includes(stage.toLowerCase()) && `Workflow Stage ${stage}`, source && `approval source ${source}`, f.copy?.approvalException === true && 'Client Approval Exception ticked'].filter(Boolean).join(', ')
      : `Workflow Stage is "${stage || 'empty'}", no Campaign Approval Source and no Client Approval Exception` });

  const l = f.leadList ?? { linked: 0 };
  const listStage = String(l.stage ?? '').trim(), qa = String(l.qa ?? '').trim();
  const listOk = l.linked === 1 && ['ready', 'uploaded'].includes(listStage.toLowerCase()) && qa === 'Passed';
  out.push({ check: 'lead list ready', pass: listOk,
    detail: l.linked !== 1 ? (l.linked ? `${l.linked} lead lists are linked; link exactly one` : 'no lead list is linked')
      : `"${l.name ?? ''}" is ${listStage || 'no stage'} with QA ${qa || 'not set'}${listOk ? '' : ' (needs Ready or Uploaded and QA Passed)'}` });

  const c = f.client ?? { linked: false };
  const status = String(c.status ?? '').trim();
  const off = /cancel|pause|inactive|churn/i.test(status);
  out.push({ check: 'client active', pass: c.linked && !off,
    detail: !c.linked ? 'no client is linked to this campaign' : `${c.name ?? 'client'} status is ${status || 'empty (counts as active)'}` });
  return out;
}

/** Launch check (c) for one EmailBison campaign. */
async function emailBisonCheck(bison: BisonClient, id: number): Promise<{ check: LaunchCheck; status: string }> {
  const check = `EmailBison campaign ${id} ready`;
  try { await bison.confirmCampaignHere(id); } catch (e) {
    if (e instanceof NeedsReviewError) return { check: { check, pass: false, detail: 'not in this EmailBison workspace' }, status: '' };
    throw e;
  }
  const status = await bison.campaignStatus(id);
  const problems: string[] = [];
  if (![...LAUNCHABLE, ...LIVE_STATUSES].includes(status)) problems.push(`status is "${status || 'unknown'}" (a launch needs draft, paused or already live)`);
  const leads = await bison.campaignLeadTotal(id);
  if (!(leads > 0)) problems.push('it has no leads');
  const steps = (await bison.getSteps(id)).filter((s) => !s.variant);
  if (steps.length === 0) problems.push('it has no sequence steps');
  const senders = await bison.campaignSenders(id);
  const off = senders.filter((s) => s.status && s.status !== 'connected');
  if (senders.length === 0) problems.push('it has no senders');
  if (off.length) problems.push(`${off.length} of ${senders.length} senders are not connected`);
  return {
    check: { check, pass: problems.length === 0, detail: problems.length ? problems.join('; ') : `${leads} leads, ${steps.length} steps, ${senders.length} senders connected, status ${status}` },
    status,
  };
}

const report = (checks: LaunchCheck[]) => [
  ...checks.map((c) => `${c.pass ? 'PASS' : 'FAIL'} ${c.check}: ${c.detail}`),
  `Not checked automatically yet: ${NOT_CHECKED_YET.join('; ')}`,
].join('\n');

export const campaignLaunchStage: Stage = async (ctx) => {
  const input = readControl(ctx.job.input);
  const facts = ctx.job.input.facts as LaunchFacts | undefined;
  if (!facts) throw new PermanentError('input.facts (the Airtable launch facts) is required');
  const bison = clientFor(ctx, input);

  // 1. Every check, once per job (saved, so a later wait does not re-judge a campaign we launched).
  const checked = await ctx.step('launch-checks', async () => {
    const list = airtableLaunchChecks(facts);
    const statuses: Record<string, string> = {};
    for (const t of input.targets) {
      const r = await emailBisonCheck(bison, t.campaignId);
      list.push(r.check);
      statuses[String(t.campaignId)] = r.status;
    }
    return { list, statuses };
  });
  const failed = checked.list.filter((c) => !c.pass);
  if (failed.length) {
    await alert(ctx.cfg.slackWebhookUrl, `:no_entry: Launch refused for "${input.name ?? input.campaignRecordId}" (nothing launched). Failed: ${failed.map((c) => `${c.check} (${c.detail})`).join('; ')}`);
    throw new PermanentError(`launch refused, nothing was launched. Failed check${failed.length > 1 ? 's' : ''}: ${failed.map((c) => c.check).join(', ')}\n${report(checked.list)}`);
  }

  // 2. Launch each campaign that is not live yet (one receipt each: a retry never resumes twice).
  const launched: number[] = [], alreadyLive: number[] = [];
  for (const t of input.targets) {
    if (LIVE_STATUSES.includes(checked.statuses[String(t.campaignId)])) { alreadyLive.push(t.campaignId); continue; }
    await resumeCall(ctx, bison, t.campaignId, `resume:${t.campaignId}`);
    launched.push(t.campaignId);
  }

  // 3. Confirm EmailBison took it (live test: draft → queued → launching → active in ~7 s).
  const statuses: Record<string, string> = {};
  if (!ctx.dryRun) {
    for (const id of launched) statuses[id] = await waitForStatus(ctx, bison, `launch-status:${id}`, id, LIVE_STATUSES, `campaign ${id} was launched but EmailBison does not show it queued, launching or active; check it in EmailBison`);
  }
  const what = [
    launched.length ? `${ctx.dryRun ? 'would launch' : 'launched'} ${launched.map((id) => `${id}${statuses[id] ? ` (${statuses[id]})` : ''}`).join(', ')}` : '',
    alreadyLive.length ? `already live: ${alreadyLive.join(', ')}` : '',
  ].filter(Boolean).join('; ');
  return {
    dryRun: ctx.dryRun, launched: ctx.dryRun ? [] : launched, wouldLaunch: ctx.dryRun ? launched : [], alreadyLive, statuses,
    checks: checked.list, notCheckedYet: NOT_CHECKED_YET,
    message: `${what}. All launch checks passed:\n${report(checked.list)}`,
  };
};

// ---------------------------------------------------------------- pause

export const campaignPauseStage: Stage = async (ctx) => {
  const input = readControl(ctx.job.input);
  const bison = clientFor(ctx, input);
  const paused: number[] = [], notRunning: { id: number; status: string }[] = [];
  for (const t of input.targets) {
    const s = await ctx.step(`status:${t.campaignId}`, async () => {
      await bison.confirmCampaignHere(t.campaignId);
      return { status: await bison.campaignStatus(t.campaignId) };
    });
    if (!LIVE_STATUSES.includes(s.status)) { notRunning.push({ id: t.campaignId, status: s.status || 'unknown' }); continue; }
    await pauseCall(ctx, bison, t.campaignId, `pause:${t.campaignId}`);
    paused.push(t.campaignId);
  }
  if (!ctx.dryRun) {
    for (const id of paused) await waitForStatus(ctx, bison, `pause-status:${id}`, id, ['paused'], `campaign ${id}: the pause did not take effect; pause it by hand in EmailBison`);
  }
  const what = [
    paused.length ? `${ctx.dryRun ? 'would pause' : 'paused'} ${paused.join(', ')}` : '',
    notRunning.length ? `not running, left as is: ${notRunning.map((x) => `${x.id} (${x.status})`).join(', ')}` : '',
  ].filter(Boolean).join('; ');
  return { dryRun: ctx.dryRun, paused: ctx.dryRun ? [] : paused, wouldPause: ctx.dryRun ? paused : [], notRunning, message: what };
};

// ---------------------------------------------------------------- senders

export const campaignSendersStage: Stage = async (ctx) => {
  const input = readControl(ctx.job.input, true);
  const bison = clientFor(ctx, input);
  const results: Record<string, unknown>[] = [];
  const warnings: string[] = [];
  for (const t of input.targets) {
    const id = t.campaignId;
    // The plan is saved: on a re-run after a wait it still knows the campaign was live before.
    const plan = await ctx.step(`senders-plan:${id}`, async () => {
      await bison.confirmCampaignHere(id);
      const want = [...new Set(t.senderEmailIds!.map(String))].sort();
      const inWorkspace = new Map((await bison.workspaceSenders()).map((s) => [s.id, s]));
      const unknown = want.filter((x) => !inWorkspace.has(x));
      if (unknown.length) throw new PermanentError(`campaign ${id}: sender ID(s) ${unknown.join(', ')} are not in this EmailBison workspace; sync the inboxes in Campaign Center (nothing was changed)`);
      const current = (await bison.campaignSenders(id)).map((s) => s.id);
      const status = await bison.campaignStatus(id);
      return {
        want, status, wasLive: LIVE_STATUSES.includes(status),
        add: want.filter((x) => !current.includes(x)), remove: current.filter((x) => !want.includes(x)).sort(),
        notConnected: want.filter((x) => { const s = inWorkspace.get(x)!.status; return s !== '' && s !== 'connected'; }),
      };
    });
    if (plan.notConnected.length) warnings.push(`campaign ${id}: inbox(es) ${plan.notConnected.join(', ')} are not connected in EmailBison`);
    if (!plan.add.length && !plan.remove.length) { results.push({ campaignId: id, changed: false, senders: plan.want.length }); continue; }

    // EmailBison only changes senders on a draft or paused campaign.
    if (plan.wasLive) {
      await pauseCall(ctx, bison, id, `senders-pause:${id}`);
      if (!ctx.dryRun) await waitForStatus(ctx, bison, `senders-paused:${id}`, id, ['paused'], `campaign ${id}: the pause before changing senders did not take effect; nothing was changed`);
    }
    // Add first, then remove, so the campaign never has no inbox.
    if (plan.add.length) await ctx.paid({
      callKey: `senders-add:${id}:${plan.add.join(',')}`, provider: 'emailbison', units: 0,
      run: async () => { await bison.attachSenders(id, plan.add); return { added: plan.add }; },
      reconcile: async () => { const now = (await bison.campaignSenders(id)).map((s) => s.id); return plan.add.every((x) => now.includes(x)) ? { added: plan.add } : null; },
      dryRunResult: () => ({ added: [] as string[] }),
    });
    if (plan.remove.length) await ctx.paid({
      callKey: `senders-remove:${id}:${plan.remove.join(',')}`, provider: 'emailbison', units: 0,
      run: async () => { await bison.removeSenders(id, plan.remove); return { removed: plan.remove }; },
      reconcile: async () => { const now = (await bison.campaignSenders(id)).map((s) => s.id); return plan.remove.every((x) => !now.includes(x)) ? { removed: plan.remove } : null; },
      dryRunResult: () => ({ removed: [] as string[] }),
    });
    if (!ctx.dryRun) {
      // The attached set must equal the selection before a live campaign sends again.
      await ctx.step(`senders-verify:${id}`, async () => {
        const got = (await bison.campaignSenders(id)).map((s) => s.id).sort();
        if (JSON.stringify(got) !== JSON.stringify(plan.want)) {
          throw new NeedsReviewError(`campaign ${id}: attached senders (${got.length}) don't match the selection (${plan.want.length})${plan.wasLive ? '; the campaign was left paused' : ''}; check it in EmailBison`);
        }
        return { count: got.length };
      });
    }
    if (plan.wasLive) {
      await resumeCall(ctx, bison, id, `senders-resume:${id}`);
      if (!ctx.dryRun) await waitForStatus(ctx, bison, `senders-resumed:${id}`, id, LIVE_STATUSES, `campaign ${id}: senders were changed but the campaign did not start again; resume it in EmailBison`);
    }
    results.push({ campaignId: id, changed: true, added: plan.add, removed: plan.remove, pausedAndResumed: plan.wasLive, senders: plan.want.length });
  }
  const line = (r: any) => (r.changed
    ? `campaign ${r.campaignId}: ${ctx.dryRun ? 'would add' : 'added'} ${r.added.length}, ${ctx.dryRun ? 'would remove' : 'removed'} ${r.removed.length} (${r.senders} inboxes${r.pausedAndResumed ? `; ${ctx.dryRun ? 'would pause and resume' : 'paused and resumed'}` : ''})`
    : `campaign ${r.campaignId}: already has the selected ${r.senders} inboxes`);
  return {
    dryRun: ctx.dryRun, campaigns: results, warnings,
    message: [...results.map(line), ...warnings.map((w) => `Warning: ${w}`)].join('\n'),
  };
};

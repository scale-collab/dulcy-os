// Stage: campaign.topup — add a new Ready lead list to a running EmailBison campaign.
// PLAN step 4. Fixes the old n8n top-up (research/map-campaign.md 2H, section 6):
//  - no fixed waits: each import is checked until Processed, with exact counts;
//  - never re-uploads: every upload/attach goes through a record-scoped receipt, and an
//    unclear upload is reconciled by its exact list name;
//  - the result says how many leads were really added and how many EmailBison skipped
//    (already in the campaign), measured by waiting until the campaign total stops moving;
//  - Alex's top-up rule is checked first (interested 15%+ of replies), unless an exception
//    is given on purpose.
// Senders are not changed; they must all still be connected. It never launches or resumes.
import type { Stage } from './index.js';
import { NeedsReviewError, PermanentError, WaitError } from '../errors.js';
import { bisonFor } from '../providers/emailbison.js';
import { createSheetsClient } from '../providers/google.js';
import { sheetIdFrom } from '../sources/sheet.js';
import { prepareLeads, type OutputType } from '../campaign/rules.js';
import { uploadAndAttach } from '../campaign/upload.js';
import { topUpReadiness, type CampaignKpis } from '../campaign/topup.js';

interface TopupInput {
  campaignId: number;
  /** Campaign name, used to name the imports. */
  name: string;
  workspace: string;
  /** EmailBison workspace (team) ID to switch to before every call. */
  workspaceId?: number;
  outputType: OutputType;
  /** The top-up lead list's sheet and Final tab. */
  source: { sheetId: string; tab?: string };
  expectedLeads?: number;
  /** Merge tags used by the campaign's copy, so their columns are uploaded. */
  copyTags?: string[];
  kpis: CampaignKpis;
  /** Top up although the KPI rule fails (Alex's explicit exception). */
  kpiException?: boolean;
}

function readInput(raw: Record<string, unknown>): TopupInput {
  const i = raw as unknown as TopupInput;
  if (!Number.isSafeInteger(Number(i.campaignId)) || Number(i.campaignId) < 1) throw new PermanentError('input.campaignId (the EmailBison campaign) is required');
  if (!i.name) throw new PermanentError('input.name is required');
  if (!i.workspace) throw new PermanentError('input.workspace is required');
  if (i.outputType !== 'direct' && i.outputType !== 'generic') throw new PermanentError('input.outputType must be "direct" or "generic"');
  if (!i.source?.sheetId) throw new PermanentError('input.source.sheetId is required');
  if (!i.kpis) throw new PermanentError('input.kpis (interestedRate, replyRate, bounceRate, progress) is required');
  return { ...i, campaignId: Number(i.campaignId) };
}

/** How many observations of a still-moving campaign total before a person looks. */
const MAX_GROWTH_CHECKS = 20;

export const campaignTopupStage: Stage = async (ctx) => {
  const input = readInput(ctx.job.input);
  const tab = input.source.tab ?? (input.outputType === 'generic' ? 'Final Generic' : 'Final Direct');
  const sheets = () => createSheetsClient({ keyFile: ctx.cfg.googleKeyFile, impersonate: ctx.cfg.googleImpersonateUser, scope: ctx.cfg.googleScope, sheetsBaseUrl: ctx.cfg.googleSheetsBaseUrl });

  // 1. Alex's rule first: no leads are read or uploaded for a campaign that doesn't qualify.
  const readiness = topUpReadiness(input.kpis);
  if (!readiness.ok && !input.kpiException) {
    throw new PermanentError(`top-up not allowed: ${readiness.reasons.join('; ')}${readiness.watch.length ? ` (also: ${readiness.watch.join('; ')})` : ''}. Set kpiException to override on purpose.`);
  }

  // 2. The list: count must match Airtable before anything is uploaded.
  const plan = await ctx.step('check-leads', async () => {
    const p = prepareLeads(await sheets().tab(sheetIdFrom(input.source.sheetId), tab), { campaignId: 0, outputType: input.outputType, tags: input.copyTags ?? [] });
    if (input.expectedLeads !== undefined && p.rows.length !== Number(input.expectedLeads)) {
      throw new PermanentError(`the "${tab}" tab has ${p.rows.length} uploadable leads but Airtable expects ${input.expectedLeads}; fix the list before topping up`);
    }
    return { leads: p.rows.length, droppedDuplicate: p.droppedDuplicate, droppedNoEmail: p.droppedNoEmail, droppedInvalid: p.droppedInvalid, imports: Math.ceil(p.rows.length / 5000) };
  }, { timeoutMs: 15 * 60_000 });
  if (ctx.dryRun) return { dryRun: true, note: 'dry run: nothing was uploaded', plan, readiness, kpiException: Boolean(input.kpiException) };

  const apiKey = ctx.cfg.emailBisonKeys[input.workspace.toLowerCase()];
  if (!apiKey) throw new PermanentError(`no EmailBison key on the server for workspace "${input.workspace}"`);
  const bison = bisonFor(ctx.cfg, input.workspace, input.workspaceId);

  // 3. Senders stay as they are, but every one must still be connected.
  await ctx.step('senders-connected', async () => {
    const senders = await bison.campaignSenders(input.campaignId);
    if (senders.length === 0) throw new PermanentError(`campaign ${input.campaignId} has no senders attached`);
    const off = senders.filter((s) => s.status && s.status !== 'connected');
    if (off.length) throw new NeedsReviewError(`campaign ${input.campaignId}: ${off.length} of ${senders.length} senders are not connected; fix them before topping up`);
    return { senders: senders.length };
  });

  // 4. Upload, check each import, attach (shared with the campaign build).
  const leads = await ctx.step('load-leads', async () => {
    const p = prepareLeads(await sheets().tab(sheetIdFrom(input.source.sheetId), tab), { campaignId: input.campaignId, outputType: input.outputType, tags: input.copyTags ?? [] });
    if (p.rows.length !== plan.leads) throw new PermanentError(`the "${tab}" tab changed during the top-up (${plan.leads} → ${p.rows.length} leads); stop and re-check the list`);
    return p;
  }, { timeoutMs: 15 * 60_000 });
  const up = await uploadAndAttach(ctx, bison, { campaignId: input.campaignId, listName: `[topup] ${input.outputType} ${input.name}`, leads });

  // 5. Added vs skipped: leads EmailBison already had in this campaign are skipped, so the
  // total can grow by less than was accepted. Wait until the total stops moving.
  let prev: { total: number } | undefined;
  let growth = 0;
  for (let k = 1; k <= MAX_GROWTH_CHECKS; k++) {
    let fresh = false;
    const obs = await ctx.step(`growth-${k}`, async () => { fresh = true; return { total: await bison.campaignLeadTotal(input.campaignId) }; });
    growth = obs.total - up.before;
    if (growth > up.accepted) throw new NeedsReviewError(`campaign ${input.campaignId} grew by ${growth} but only ${up.accepted} leads were uploaded; check for a double attach`);
    if (growth < 0) throw new NeedsReviewError(`campaign ${input.campaignId} has fewer leads than before the top-up (${obs.total} < ${up.before}); check it in EmailBison`);
    const settled = growth === up.accepted || (prev !== undefined && prev.total === obs.total);
    if (settled) break;
    if (fresh) throw new WaitError(`campaign ${input.campaignId}: +${growth} of ${up.accepted} leads so far`, ctx.cfg.bisonPollMs);
    prev = obs;
    if (k === MAX_GROWTH_CHECKS) throw new NeedsReviewError(`campaign ${input.campaignId} lead total kept changing; check the attach in EmailBison`);
  }

  return {
    dryRun: false,
    launched: false,
    campaignId: input.campaignId,
    leads: { uploaded: leads.rows.length, accepted: up.accepted, added: growth, skippedAlreadyInCampaign: up.accepted - growth, droppedDuplicate: leads.droppedDuplicate },
    imports: up.parts,
    readiness,
    kpiException: Boolean(input.kpiException),
    message: `top-up of campaign ${input.campaignId}: ${growth} leads added, ${up.accepted - growth} already in the campaign${readiness.watch.length ? `; watch: ${readiness.watch.join('; ')}` : ''}`,
  };
};

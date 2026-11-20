// Stage: campaign.build — build one EmailBison campaign (one output: direct OR generic).
// PLAN step 3. It never launches; launch stays a separate, checked action.
//
// What it fixes from the old n8n builder (research/map-campaign.md section 6):
//  - Duplicates: the campaign is created through a record-scoped receipt and its ID is saved
//    at once. After a crash, the engine looks the campaign up by exact name before it would
//    ever create another one.
//  - Fixed waits: each lead import is checked until EmailBison says Processed, and the
//    counts must reconcile exactly (processed = rows sent, failed = 0).
//  - Weak count check: the campaign must end with exactly the expected number of leads.
//  - Senders: the attached set must equal the selection, all connected.
//  - Errors keep EmailBison's message (emails masked).
//
// Steps (checkpoints): prepare-copy → create-campaign → schedule-settings → sequence
// → load-leads → custom-variables → upload-i/import-i (per 5,000-row chunk) → attach
// → leads-count → senders → done.
import type { Stage } from './index.js';
import type { JobContext } from '../context.js';
import { NeedsReviewError, PermanentError, WaitError } from '../errors.js';

const MAX_GROWTH_CHECKS = 20;
import { uploadAndAttach, waitOrReview } from '../campaign/upload.js';
import { bisonFor, type BisonClient, type BisonStep } from '../providers/emailbison.js';
import { createSheetsClient } from '../providers/google.js';
import { sheetIdFrom } from '../sources/sheet.js';
import {
  DEFAULT_SETTINGS, defaultSchedule, mergeTags, prepareLeads, primaryStepsPayload, senderCap,
  validateCopy, variantPayload, type CopyStep, type OutputType, type PreparedLeads,
} from '../campaign/rules.js';

interface BuildInput {
  /** EmailBison campaign name, e.g. "Acme - Direct Emails". Must be unique in the workspace. */
  name: string;
  /** Workspace key name: the server has EMAILBISON_KEY_<WORKSPACE>. Keys never travel in jobs. */
  workspace: string;
  /** EmailBison workspace (team) ID to switch to before every call, e.g. 2 for Dulcy. */
  workspaceId?: number;
  outputType: OutputType;
  steps: CopyStep[];
  /** Days between emails (Alex's default 2). */
  daysBetween?: number;
  /** Where the leads come from: the lead list sheet's Final tab. */
  source: { sheetId: string; tab?: string };
  /** Final count from Airtable; the sheet must match it. */
  expectedLeads?: number;
  /** EmailBison sender email IDs to attach, or ... */
  senderEmailIds: string[];
  /** ... sender email addresses: the engine looks up their current IDs in EmailBison. */
  senderEmails?: string[];
  senderDailyLimit?: number;
  timezone?: string;
  campaignType?: string;
  /** Reuse this EmailBison campaign instead of creating one (explicit, never guessed). */
  existingCampaignId?: number;
  /** From the Airtable campaign record (old builder fields); defaults apply when absent. */
  days?: Partial<Record<'monday' | 'tuesday' | 'wednesday' | 'thursday' | 'friday' | 'saturday' | 'sunday', boolean>>;
  settings?: Partial<typeof DEFAULT_SETTINGS>;
}

function readInput(raw: Record<string, unknown>): BuildInput {
  const i = raw as unknown as BuildInput;
  if (!i.name || typeof i.name !== 'string') throw new PermanentError('input.name (the EmailBison campaign name) is required');
  if (!i.workspace) throw new PermanentError('input.workspace is required');
  if (i.outputType !== 'direct' && i.outputType !== 'generic') throw new PermanentError('input.outputType must be "direct" or "generic"');
  if (!i.source?.sheetId) throw new PermanentError('input.source.sheetId (the lead list sheet) is required');
  const ids = Array.isArray(i.senderEmailIds) ? i.senderEmailIds.map(String) : [];
  const emails = Array.isArray(i.senderEmails) ? i.senderEmails.map((e) => String(e).trim().toLowerCase()) : [];
  if (ids.length === 0 && emails.length === 0) throw new PermanentError('give senderEmails (addresses) or senderEmailIds: at least 1 sender is required');
  if (ids.length && emails.length) throw new PermanentError('give senderEmails or senderEmailIds, not both');
  if (new Set(ids).size !== ids.length || new Set(emails).size !== emails.length) throw new PermanentError('the sender list has duplicates');
  return { ...i, daysBetween: Number(i.daysBetween ?? 2) || 2, senderEmailIds: ids, senderEmails: emails.length ? emails : undefined };
}

export const campaignBuildStage: Stage = async (ctx) => {
  const input = readInput(ctx.job.input);
  const apiKey = ctx.cfg.emailBisonKeys[input.workspace.toLowerCase()];
  const bison: BisonClient = bisonFor(ctx.cfg, input.workspace, input.workspaceId);

  // 1. Copy: checked before anything is created.
  const steps = await ctx.step('prepare-copy', async () => validateCopy(input.steps, input.outputType));
  const tags = mergeTags(steps);
  const tab = input.source.tab ?? (input.outputType === 'generic' ? 'Final Generic' : 'Final Direct');

  const sheets = () => createSheetsClient({ keyFile: ctx.cfg.googleKeyFile, impersonate: ctx.cfg.googleImpersonateUser, scope: ctx.cfg.googleScope, sheetsBaseUrl: ctx.cfg.googleSheetsBaseUrl });

  // Checks before anything is created in EmailBison: lead count vs Airtable, sender limit.
  const plan = await ctx.step('check-leads', async () => {
    const p = prepareLeads(await sheets().tab(sheetIdFrom(input.source.sheetId), tab), { campaignId: 0, outputType: input.outputType, tags });
    if (input.expectedLeads !== undefined && p.rows.length !== Number(input.expectedLeads)) {
      throw new PermanentError(`the "${tab}" tab has ${p.rows.length} uploadable leads but Airtable expects ${input.expectedLeads}; fix the list before building`);
    }
    const cap = senderCap(p.rows.length, input.daysBetween!, input.senderDailyLimit);
    const senderCount = input.senderEmails?.length ?? input.senderEmailIds.length;
    if (senderCount > cap) throw new PermanentError(`${senderCount} senders for ${p.rows.length} leads; the most that can be kept busy is ${cap}`);
    return planSummary(input, p, steps.length);
  }, { timeoutMs: 15 * 60_000 });

  // Dry-run: report the plan; create nothing in EmailBison.
  if (ctx.dryRun) return { dryRun: true, note: 'dry run: nothing was created in EmailBison', plan };
  if (!apiKey) throw new PermanentError(`no EmailBison key on the server for workspace "${input.workspace}" (EMAILBISON_KEY_${input.workspace.toUpperCase()})`);

  // 2. Campaign: find-or-create, ID saved at once.
  const campaign = input.existingCampaignId
    ? { id: Number(input.existingCampaignId), name: input.name }
    : await ctx.step('create-campaign', () => ctx.paid({
      scope: 'record', provider: 'emailbison', callKey: 'create-campaign', units: 0,
      run: async () => {
        const same = await bison.findCampaignsByName(input.name);
        if (same.length) throw new PermanentError(`a campaign named "${input.name}" already exists in EmailBison (id ${same.map((c) => c.id).join(', ')}); rename this one or pass existingCampaignId to reuse it`);
        return bison.createCampaign(input.name, input.campaignType ?? 'outbound');
      },
      reconcile: async () => {
        const same = await bison.findCampaignsByName(input.name);
        if (same.length === 1) return { id: same[0].id, name: input.name };
        if (same.length === 0) return null;
        throw new NeedsReviewError(`${same.length} campaigns named "${input.name}" exist in EmailBison; pick one before continuing`);
      },
      dryRunResult: () => ({ id: 0, name: input.name }),
    }));
  // Others switch the same key between workspaces: make sure the campaign is in ours.
  await ctx.step('confirm-workspace', async () => { await bison.confirmCampaignHere(campaign.id); return { ok: true }; });
  await ctx.log('campaign ready', { campaignId: campaign.id });

  // 3. Schedule and settings: safe to re-apply, so a retry just sets them again.
  await ctx.step('schedule-settings', async () => {
    await bison.setSchedule(campaign.id, { ...defaultSchedule(ctx.job.record_id, input.timezone), ...(input.days ?? {}) });
    await bison.updateSettings(campaign.id, { ...DEFAULT_SETTINGS, ...(input.settings ?? {}) });
    return { ok: true };
  });

  // 4. Sequence: never duplicated; existing steps are checked, missing ones added.
  await ctx.step('sequence', async () => buildSequence(ctx, bison, campaign.id, input, steps));

  // 5. Leads: read the Final tab, check the count, upload in 5,000-row chunks.
  const leads = await ctx.step('load-leads', async () => {
    const p = prepareLeads(await sheets().tab(sheetIdFrom(input.source.sheetId), tab), { campaignId: campaign.id, outputType: input.outputType, tags });
    // The sheet must not have changed since the check above.
    if (p.rows.length !== plan.leads) throw new PermanentError(`the "${tab}" tab changed during the build (${plan.leads} → ${p.rows.length} leads); stop and re-check the list`);
    return p;
  }, { timeoutMs: 15 * 60_000 });

  const up = await uploadAndAttach(ctx, bison, { campaignId: campaign.id, listName: `${input.name} Leads`, leads });
  const before = up.before;
  // Cap = rows we actually SENT. EmailBison's import report can under-count (seen live
  // 2026-11-20: "901 processed" while the campaign gained all 951), so it is not the cap.
  const expectedAdded = leads.rows.length;

  // 6. Added vs skipped. EmailBison skips leads that are "In Sequence" in another campaign
  // (we never force parallel sending), so the campaign can hold fewer than were uploaded.
  // Wait until the total stops moving, then report added and skipped. More than uploaded,
  // or none at all, goes to review.
  let prev: { total: number } | undefined;
  let added = 0;
  for (let k = 1; k <= MAX_GROWTH_CHECKS; k++) {
    let fresh = false;
    const obs = await ctx.step(`growth-${k}`, async () => { fresh = true; return { total: await bison.campaignLeadTotal(campaign.id) }; });
    added = obs.total - before;
    if (added > expectedAdded) throw new NeedsReviewError(`campaign ${campaign.id} gained ${added} leads but only ${expectedAdded} were sent; check for a double attach`);
    if (added < 0) throw new NeedsReviewError(`campaign ${campaign.id} has fewer leads than before the upload (${obs.total} < ${before}); check it in EmailBison`);
    const settled = added === expectedAdded || (prev !== undefined && prev.total === obs.total);
    if (settled) break;
    if (fresh) throw new WaitError(`campaign ${campaign.id}: ${added} of ${expectedAdded} leads attached so far`, ctx.cfg.bisonPollMs);
    prev = obs;
    if (k === MAX_GROWTH_CHECKS) throw new NeedsReviewError(`campaign ${campaign.id} lead total kept changing; check the attach in EmailBison`);
  }
  if (added === 0) throw new NeedsReviewError(`campaign ${campaign.id} got 0 of ${expectedAdded} leads: EmailBison skipped them all (likely already in sequence in other campaigns)`);
  const total = { before, after: before + added, added, skippedInOtherCampaigns: expectedAdded - added };

  // 7. Senders: addresses are resolved to EmailBison's current IDs (Airtable IDs can be stale).
  if (input.senderEmails) {
    input.senderEmailIds = await ctx.step('resolve-senders', async () => {
      const all = await bison.workspaceSenders();
      const byEmail = new Map(all.filter((x) => x.email).map((x) => [x.email!, x.id]));
      const missing = input.senderEmails!.filter((e) => !byEmail.has(e));
      if (missing.length) {
        const connected = all.filter((x) => x.status === 'connected').length;
        throw new PermanentError(`not in this EmailBison workspace: ${missing.join(', ')} (the workspace has ${all.length} sender inboxes, ${connected} connected; list them with: cli.js senders ${input.workspace})`);
      }
      return input.senderEmails!.map((e) => byEmail.get(e)!);
    });
  }
  // Attach once, then the set must match exactly and all be connected.
  await ctx.step('attach-senders', () => ctx.paid({
    scope: 'record', provider: 'emailbison', callKey: `senders:${campaign.id}:${[...input.senderEmailIds].sort().join(',')}`, units: 0,
    run: async () => { await bison.attachSenders(campaign.id, input.senderEmailIds); return { ok: true }; },
    dryRunResult: () => ({ ok: true }),
  }));
  const senders = await ctx.step('verify-senders', async () => {
    const got = await bison.campaignSenders(campaign.id);
    const want = [...input.senderEmailIds].sort();
    const ids = got.map((s) => s.id).sort();
    const notConnected = got.filter((s) => s.status && s.status !== 'connected');
    if (JSON.stringify(ids) !== JSON.stringify(want) || notConnected.length) {
      return await waitOrReview(ctx, 'senders', 2 * 60_000, `campaign ${campaign.id}: senders ${ids.length}/${want.length} attached, ${notConnected.length} not connected`,
        `campaign ${campaign.id}: attached senders don't match the selection (${ids.length} attached, ${want.length} selected, ${notConnected.length} not connected)`);
    }
    return { count: ids.length };
  });

  // Seen live 2026-11-20 (campaign 651): after the leads and inboxes were attached, EmailBison
  // showed max emails/new leads per day of 2,500 instead of the values set in step 3. Read the
  // campaign back, re-apply once if anything changed, and stop for review if it still differs.
  const settingsCheck = await ctx.step('settings-check', async () => {
    const want: Record<string, unknown> = { ...DEFAULT_SETTINGS, ...(input.settings ?? {}) };
    const keys = ['max_emails_per_day', 'max_new_leads_per_day', 'plain_text', 'open_tracking', 'can_unsubscribe'];
    const diff = (got: Record<string, any>) => keys.filter((k) => want[k] !== undefined && got[k] !== undefined && String(got[k]) !== String(want[k]));
    let off = diff(await bison.getCampaign(campaign.id));
    if (!off.length) return { reapplied: false };
    await bison.updateSettings(campaign.id, want);
    off = diff(await bison.getCampaign(campaign.id));
    if (off.length) throw new NeedsReviewError(`campaign ${campaign.id}: EmailBison keeps different settings (${off.join(', ')}); set them in EmailBison before launch`);
    return { reapplied: true };
  });

  return {
    dryRun: false,
    launched: false,
    campaignId: campaign.id,
    campaignName: input.name,
    leads: { uploaded: leads.rows.length, importReported: up.accepted, added: total.added, skippedInOtherCampaigns: total.skippedInOtherCampaigns, droppedDuplicate: leads.droppedDuplicate, droppedNoEmail: leads.droppedNoEmail, droppedInvalid: leads.droppedInvalid },
    imports: up.parts,
    senders: senders.count,
    settingsReapplied: settingsCheck.reapplied,
    steps: steps.length,
    variants: steps.reduce((n, s) => n + 1 + (s.variants?.length ?? 0), 0),
    message: `campaign ${campaign.id} built with ${total.added} leads (${total.skippedInOtherCampaigns} skipped: already in sequence in other campaigns) and ${senders.count} senders; not launched`,
    // What a later step writes to the Campaigns record (shadow until Airtable is wired).
    airtablePreview: { ID: campaign.id, [input.outputType === 'generic' ? 'EmailBison Generic Campaign ID' : 'EmailBison Direct Campaign ID']: campaign.id },
  };
};

async function buildSequence(ctx: JobContext, bison: BisonClient, campaignId: number, input: BuildInput, steps: CopyStep[]) {
  const existing = await bison.getSteps(campaignId);
  const primaries = (list: BisonStep[]) => list.filter((s) => !s.variant);
  if (primaries(existing).length === 0) {
    await ctx.paid({
      scope: 'record', provider: 'emailbison', callKey: `sequence:${campaignId}`, units: 0,
      run: async () => { await bison.addSteps(campaignId, primaryStepsPayload(input.name, steps, input.daysBetween!)); return { ok: true }; },
      reconcile: async () => (primaries(await bison.getSteps(campaignId)).length ? { ok: true } : null),
      dryRunResult: () => ({ ok: true }),
    });
  }
  const now = await bison.getSteps(campaignId);
  const prim = primaries(now);
  if (prim.length !== steps.length) throw new NeedsReviewError(`campaign ${campaignId} has ${prim.length} sequence steps but the copy has ${steps.length}; fix the sequence in EmailBison`);
  const byOrder = new Map(prim.map((s) => [s.order, s]));
  for (let i = 0; i < steps.length; i++) {
    const p = byOrder.get(i + 1);
    if (!p) throw new NeedsReviewError(`campaign ${campaignId} is missing sequence step ${i + 1}`);
    // Only email 1's subject is compared: EmailBison stores thread-reply subjects its own way.
    if (i === 0 && p.email_subject !== undefined && p.email_subject !== null && p.email_subject !== steps[0].subject) {
      throw new NeedsReviewError(`campaign ${campaignId} email 1 has a different subject than the approved copy`);
    }
    // Variants are counted per step (created in order), not matched by subject.
    const have = now.filter((s) => s.variant && s.variant_from_step_id === p.id).length;
    const want = (steps[i].variants ?? []).length;
    if (have > want) throw new NeedsReviewError(`campaign ${campaignId} step ${i + 1} has ${have} variants but the copy has ${want}`);
    for (let v = have; v < want; v++) {
      const variant = steps[i].variants![v];
      await ctx.paid({
        scope: 'record', provider: 'emailbison', callKey: `variant:${campaignId}:${i + 1}:${v + 1}`, units: 0,
        run: async () => { await bison.addSteps(campaignId, variantPayload(input.name, i + 1, p.id, variant, input.daysBetween!, Boolean(steps[i].threadReply))); return { ok: true }; },
        reconcile: async () => ((await bison.getSteps(campaignId)).filter((s) => s.variant && s.variant_from_step_id === p.id).length > v ? { ok: true } : null),
        dryRunResult: () => ({ ok: true }),
      });
    }
  }
  const final = await bison.getSteps(campaignId);
  return { primaries: primaries(final).length, variants: final.filter((s) => s.variant).length };
}

function planSummary(input: BuildInput, p: PreparedLeads, stepCount: number) {
  return {
    name: input.name, workspace: input.workspace, outputType: input.outputType,
    leads: p.rows.length, expectedLeads: input.expectedLeads ?? null,
    leadsMatchAirtable: input.expectedLeads === undefined ? null : p.rows.length === Number(input.expectedLeads),
    droppedDuplicate: p.droppedDuplicate, droppedNoEmail: p.droppedNoEmail, droppedInvalid: p.droppedInvalid,
    imports: Math.ceil(p.rows.length / 5000), columns: p.headers.length, customVariables: p.customVariables.length,
    steps: stepCount, senders: input.senderEmails?.length ?? input.senderEmailIds.length, senderCap: senderCap(p.rows.length, input.daysBetween!, input.senderDailyLimit),
    daysBetween: input.daysBetween,
  };
}

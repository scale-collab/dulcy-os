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
import { createBisonClient, type BisonClient, type BisonStep } from '../providers/emailbison.js';
import { createSheetsClient } from '../providers/google.js';
import { sheetIdFrom } from '../sources/sheet.js';
import {
  DEFAULT_SETTINGS, chunks, defaultSchedule, mergeTags, prepareLeads, primaryStepsPayload, senderCap, toCsv,
  validateCopy, variantPayload, type CopyStep, type OutputType, type PreparedLeads,
} from '../campaign/rules.js';

interface BuildInput {
  /** EmailBison campaign name, e.g. "Acme - Direct Emails". Must be unique in the workspace. */
  name: string;
  /** Workspace key name: the server has EMAILBISON_KEY_<WORKSPACE>. Keys never travel in jobs. */
  workspace: string;
  outputType: OutputType;
  steps: CopyStep[];
  /** Days between emails (Alex's default 2). */
  daysBetween?: number;
  /** Where the leads come from: the lead list sheet's Final tab. */
  source: { sheetId: string; tab?: string };
  /** Final count from Airtable; the sheet must match it. */
  expectedLeads?: number;
  /** EmailBison sender email IDs to attach. */
  senderEmailIds: string[];
  senderDailyLimit?: number;
  timezone?: string;
  campaignType?: string;
  /** Reuse this EmailBison campaign instead of creating one (explicit, never guessed). */
  existingCampaignId?: number;
}

function readInput(raw: Record<string, unknown>): BuildInput {
  const i = raw as unknown as BuildInput;
  if (!i.name || typeof i.name !== 'string') throw new PermanentError('input.name (the EmailBison campaign name) is required');
  if (!i.workspace) throw new PermanentError('input.workspace is required');
  if (i.outputType !== 'direct' && i.outputType !== 'generic') throw new PermanentError('input.outputType must be "direct" or "generic"');
  if (!i.source?.sheetId) throw new PermanentError('input.source.sheetId (the lead list sheet) is required');
  if (!Array.isArray(i.senderEmailIds) || i.senderEmailIds.length === 0) throw new PermanentError('input.senderEmailIds: at least 1 sender is required');
  if (new Set(i.senderEmailIds.map(String)).size !== i.senderEmailIds.length) throw new PermanentError('input.senderEmailIds has duplicates');
  return { ...i, daysBetween: Number(i.daysBetween ?? 2) || 2, senderEmailIds: i.senderEmailIds.map(String) };
}

/** Wait for something EmailBison is still doing, but never longer than `limitMs` from the first check. */
async function waitOrReview(ctx: JobContext, key: string, limitMs: number, progress: string, review: string): Promise<never> {
  const started = await ctx.step(`wait-start:${key}`, async () => Date.now());
  if (Date.now() - started > limitMs) throw new NeedsReviewError(review);
  throw new WaitError(progress, ctx.cfg.bisonPollMs);
}

export const campaignBuildStage: Stage = async (ctx) => {
  const input = readInput(ctx.job.input);
  const apiKey = ctx.cfg.emailBisonKeys[input.workspace.toLowerCase()];
  const bison: BisonClient = createBisonClient({ apiKey, baseUrl: ctx.cfg.emailBisonBaseUrl });

  // 1. Copy: checked before anything is created.
  const steps = await ctx.step('prepare-copy', async () => validateCopy(input.steps, input.outputType));
  const tags = mergeTags(steps);
  const tab = input.source.tab ?? (input.outputType === 'generic' ? 'Final Generic' : 'Final Direct');

  const sheets = () => createSheetsClient({ keyFile: ctx.cfg.googleKeyFile, impersonate: ctx.cfg.googleImpersonateUser, sheetsBaseUrl: ctx.cfg.googleSheetsBaseUrl });

  // Checks before anything is created in EmailBison: lead count vs Airtable, sender limit.
  const plan = await ctx.step('check-leads', async () => {
    const p = prepareLeads(await sheets().tab(sheetIdFrom(input.source.sheetId), tab), { campaignId: 0, outputType: input.outputType, tags });
    if (input.expectedLeads !== undefined && p.rows.length !== Number(input.expectedLeads)) {
      throw new PermanentError(`the "${tab}" tab has ${p.rows.length} uploadable leads but Airtable expects ${input.expectedLeads}; fix the list before building`);
    }
    const cap = senderCap(p.rows.length, input.daysBetween!, input.senderDailyLimit);
    if (input.senderEmailIds.length > cap) throw new PermanentError(`${input.senderEmailIds.length} senders for ${p.rows.length} leads; the most that can be kept busy is ${cap}`);
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
  await ctx.log('campaign ready', { campaignId: campaign.id });

  // 3. Schedule and settings: safe to re-apply, so a retry just sets them again.
  await ctx.step('schedule-settings', async () => {
    await bison.setSchedule(campaign.id, defaultSchedule(ctx.job.record_id, input.timezone));
    await bison.updateSettings(campaign.id, DEFAULT_SETTINGS);
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

  await ctx.step('custom-variables', async () => {
    const have = await bison.customVariables();
    const created: string[] = [];
    for (const name of leads.customVariables) {
      if (have.has(name.toLowerCase())) continue;
      try { await bison.createCustomVariable(name); created.push(name); } catch (e) {
        // Another run may have created it at the same moment: re-read before failing.
        if (!(await bison.customVariables()).has(name.toLowerCase())) throw e;
      }
    }
    return { created };
  });

  const parts = chunks(leads.rows);
  // Leads in the campaign before our first upload, remembered per record (not per job), so a
  // re-run compares against the same starting point and never waits for leads twice.
  const before = (await ctx.step('leads-before', () => ctx.paid({
    scope: 'record', provider: 'emailbison', callKey: `leads-before:${campaign.id}`, units: 0,
    run: async () => ({ total: await bison.campaignLeadTotal(campaign.id) }),
    dryRunResult: () => ({ total: 0 }),
  }))).total;
  let expectedAdded = 0;
  for (let i = 0; i < parts.length; i++) {
    const listName = `${input.name} Leads [${leads.hash}] part ${i + 1} of ${parts.length}`;
    const list = await ctx.step(`upload-${i + 1}`, () => ctx.paid({
      scope: 'record', provider: 'emailbison', callKey: `upload:${leads.hash}:${i + 1}`, units: 0,
      run: () => bison.uploadLeadsCsv(listName, leads.columnsToMap, toCsv(leads.headers, parts[i])),
      reconcile: async () => {
        const found = await bison.findLeadListsByName(listName);
        if (found.length === 1) return { id: found[0].id, name: listName };
        if (found.length === 0) return null;
        throw new NeedsReviewError(`${found.length} lead lists named "${listName}" exist; keep one before continuing`);
      },
      dryRunResult: () => ({ id: 0, name: listName }),
    }), { timeoutMs: 5 * 60_000 });

    // Check the import until EmailBison has processed it (no fixed waits).
    const imported = await ctx.step(`import-${i + 1}`, async () => {
      const l = await bison.getLeadList(list.id);
      if (String(l.status) !== 'Processed') {
        return await waitOrReview(ctx, `import-${i + 1}`, 60 * 60_000,
          `lead import ${list.id} (part ${i + 1} of ${parts.length}): ${l.status ?? 'unknown'}`,
          `lead import ${list.id} was not processed within 60 minutes; check it in EmailBison, do not upload again`);
      }
      const processed = Number(l.leads_processed), succeeded = Number(l.leads_succeeded), failed = Number(l.leads_failed);
      if (processed !== parts[i].length || failed !== 0 || succeeded !== processed) {
        throw new NeedsReviewError(`lead import ${list.id}: sent ${parts[i].length}, processed ${processed}, succeeded ${succeeded}, failed ${failed}; ${summarizeErrors(l.error_messages)}`);
      }
      return { id: list.id, succeeded };
    });
    expectedAdded += imported.succeeded;

    await ctx.step(`attach-${i + 1}`, () => ctx.paid({
      scope: 'record', provider: 'emailbison', callKey: `attach:${campaign.id}:${list.id}`, units: 0,
      run: async () => { await bison.attachLeadList(campaign.id, list.id); return { attached: list.id }; },
      dryRunResult: () => ({ attached: 0 }),
    }));
  }

  // 6. The campaign must hold exactly the expected leads.
  const total = await ctx.step('leads-count', async () => {
    const after = await bison.campaignLeadTotal(campaign.id);
    const added = after - before;
    if (added > expectedAdded) throw new NeedsReviewError(`campaign ${campaign.id} gained ${added} leads but only ${expectedAdded} were uploaded; check for a double attach`);
    if (added < expectedAdded) {
      return await waitOrReview(ctx, 'leads-count', 30 * 60_000, `campaign ${campaign.id}: ${added} of ${expectedAdded} leads attached so far`,
        `campaign ${campaign.id} has ${added} of ${expectedAdded} leads after 30 minutes; check the attach in EmailBison`);
    }
    return { before, after, added };
  });

  // 7. Senders: attach once, then the set must match exactly and all be connected.
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

  return {
    dryRun: false,
    launched: false,
    campaignId: campaign.id,
    campaignName: input.name,
    leads: { uploaded: leads.rows.length, added: total.added, droppedDuplicate: leads.droppedDuplicate, droppedNoEmail: leads.droppedNoEmail, droppedInvalid: leads.droppedInvalid },
    imports: parts.length,
    senders: senders.count,
    steps: steps.length,
    variants: steps.reduce((n, s) => n + 1 + (s.variants?.length ?? 0), 0),
    message: `campaign ${campaign.id} built with ${total.added} leads and ${senders.count} senders; not launched`,
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
    steps: stepCount, senders: input.senderEmailIds.length, senderCap: senderCap(p.rows.length, input.daysBetween!, input.senderDailyLimit),
    daysBetween: input.daysBetween,
  };
}

function summarizeErrors(e: unknown): string {
  if (!e || typeof e !== 'object') return 'no error details';
  const parts = Object.entries(e as Record<string, unknown>).slice(0, 5).map(([k, v]) => `${k}${typeof v === 'number' ? ` (${v})` : ''}`);
  return parts.length ? `EmailBison says: ${parts.join('; ')}`.replace(/([A-Za-z0-9._%+-])[A-Za-z0-9._%+-]*@/g, '$1***@') : 'no error details';
}

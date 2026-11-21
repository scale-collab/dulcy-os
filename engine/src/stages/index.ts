import type { JobContext } from '../context.js';
import { verifyStage } from './verify.js';
import { campaignBuildStage } from './campaignBuild.js';
import { campaignTopupStage } from './campaignTopup.js';
import { bounceCheckStage } from './bounceCheck.js';
import { companySampleStage } from './companySample.js';
import { companyExpandStage } from './companyExpand.js';
import { companyRefitStage } from './companyRefit.js';
import { contactsFindStage } from './contactsFind.js';
import { filterGenerateStage } from './filterGenerate.js';
import { automatedQaStage } from './automatedQa.js';
import { enrichPromptStage, enrichRunStage } from './enrichment.js';

/** A stage = one Airtable action. It returns a small result for the Airtable record. */
export type Stage = (ctx: JobContext) => Promise<Record<string, unknown>>;

export interface StageDef {
  run: Stage;
  /** Whole-job time limit. */
  deadlineMs: number;
  maxAttempts: number;
  description: string;
}

/**
 * Skeleton test stage: proves checkpoints, paid receipts, caps and dry-run end to end.
 * Real stages (verify, campaign build, top-up, ...) are added one at a time (PLAN step 2+).
 */
const selfTest: Stage = async (ctx) => {
  const a = await ctx.step('load-input', async () => ({ rows: Number(ctx.job.input.rows ?? 10) }));
  const charged = await ctx.step('paid-call', () =>
    ctx.paid({
      callKey: 'only',
      provider: 'selftest',
      units: a.rows,
      run: async () => ({ ok: true, rows: a.rows }),
      dryRunResult: () => ({ ok: true, rows: a.rows, dryRun: true }),
    }),
  );
  const done = await ctx.step('summarize', async () => ({ processed: charged.rows }));
  return { ...done, dryRun: ctx.dryRun };
};

export const STAGES: Record<string, StageDef> = {
  'engine.selftest': { run: selfTest, deadlineMs: 5 * 60_000, maxAttempts: 3, description: 'End-to-end check of the engine itself. Spends nothing.' },
  'leadlist.verify': {
    run: verifyStage,
    // MillionVerifier can take hours on big lists; waiting checks are free and don't use attempts.
    deadlineMs: 24 * 60 * 60_000,
    maxAttempts: 5,
    description: 'Verify a lead list with MillionVerifier (upload once, wait, download, split Good/Risky/Bad). Shadow mode: writes nothing to Airtable yet.',
  },
  'campaign.build': {
    run: campaignBuildStage,
    // Imports and attaches can take a while; waiting checks don't use attempts.
    deadlineMs: 6 * 60 * 60_000,
    maxAttempts: 5,
    description: 'Build one EmailBison campaign (find-or-create, sequence, leads with import checks, senders). Never launches.',
  },
  'campaign.topup': {
    run: campaignTopupStage,
    deadlineMs: 6 * 60 * 60_000,
    maxAttempts: 5,
    description: 'Add a Ready lead list to a running EmailBison campaign (KPI rule, import checks, added vs skipped). Never re-uploads, never launches.',
  },
  'leadlist.sample': {
    run: companySampleStage,
    deadlineMs: 30 * 60_000,
    maxAttempts: 3,
    description: 'Company sample for a lead list: free DiscoLike count, one paid search of up to 100 companies, fit check in code, sample gate. Shadow mode: writes nothing yet.',
  },
  'leadlist.expand': {
    run: companyExpandStage,
    deadlineMs: 12 * 60 * 60_000,
    maxAttempts: 5,
    description: 'Expand an approved company sample to the target number of usable (Tier 1 + Tier 2) companies, 2,500 per batch with a rolling exclusion list; saved in the engine, written to the list sheet once per batch.',
  },
  'leadlist.refit': {
    run: companyRefitStage,
    deadlineMs: 30 * 60_000,
    maxAttempts: 3,
    description: 'Re-check every saved company of a list with its profile (free; optionally rebuild the profile with one AI call); the sheet is rewritten in place.',
  },
  'leadlist.enrichprompt': {
    run: enrichPromptStage,
    deadlineMs: 20 * 60_000,
    maxAttempts: 3,
    description: 'Prepare Enrichment Prompt: the old n8n 04 builder run unchanged (one AI call turns Custom Variables Requested into a structured DiscoGen prompt, saved back for review).',
  },
  'leadlist.enrich': {
    run: enrichRunStage,
    deadlineMs: 8 * 60 * 60_000,
    maxAttempts: 5,
    description: 'Run Enrichment: the old n8n 05 (live copy) run unchanged: one DiscoGen task for the rows missing a requested value, empty cells filled only, Final tabs rewritten after a stale-data check.',
  },
  'leadlist.qa': {
    run: automatedQaStage,
    deadlineMs: 20 * 60_000,
    maxAttempts: 3,
    description: 'Run Automated QA: the old n8n 06 QA code run unchanged on Final Direct / Final Generic against the linked campaign copy; QA Review tab; QA Status Passed/Failed (Ready on pass). No paid calls.',
  },
  'leadlist.filters': {
    run: filterGenerateStage,
    deadlineMs: 20 * 60_000,
    maxAttempts: 3,
    description: 'Generate filters: the old n8n search-plan branch run unchanged (DiscoLike ICP analysis of 20 companies, one AI keyword review, plan built in code); writes the same Airtable fields n8n did.',
  },
  'leadlist.contacts': {
    run: contactsFindStage,
    deadlineMs: 12 * 60 * 60_000,
    maxAttempts: 5,
    description: 'Find people at the Tier 1/2 companies (500 companies per DiscoLike call), contact profile from one AI call, fit in code; Contacts tab ready for Verify.',
  },
  'bounce.check': {
    run: bounceCheckStage,
    deadlineMs: 15 * 60_000,
    maxAttempts: 3,
    description: 'Check active campaigns in a workspace: pause over 4% bounce at 35%+ progress, watch over 2.5%. Report-only until switched live.',
  },
};

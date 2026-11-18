import type { JobContext } from '../context.js';
import { verifyStage } from './verify.js';

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
};

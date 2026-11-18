// Stage: leadlist.verify — MillionVerifier first (PLAN step 2).
//
// Flow (each numbered item is a checkpoint unless noted):
//  1. build-candidates: dedupe, identity holds, footprint filter, syntax check (free).
//  2. submit: upload ONCE through a record-scoped receipt, so a retry or a new job for the
//     same list and the same emails reuses the saved MillionVerifier job and never pays twice.
//     Skipped when the Airtable record already has a MillionVerifier Job ID.
//  3. check (not a checkpoint; free): ask MillionVerifier for status. While it is still
//     working the job waits and checks again later (no button press needed); the job's
//     time limit stops it from waiting forever.
//  4. download-results (free) → strict parse against this list's emails.
//  5. outputs: Good/Risky/Bad/Pending counts, Final Direct / Final Generic (Good only).
//
// Shadow mode: nothing is written to Airtable or Sheets yet. The result shows what would be
// written, plus an optional side-by-side comparison with the old workflow's counts.
import type { Stage } from './index.js';
import { NeedsReviewError, PermanentError, WaitError } from '../errors.js';
import { createMvClient } from '../providers/millionverifier.js';
import { createSheetsClient } from '../providers/google.js';
import { loadSheetRows, type SheetSource } from '../sources/sheet.js';
import {
  buildCandidates, buildOutputs, compare, parseResults, toCsv,
  type CandidateSet, type Expected, type InputRow, type VerifiedEmail,
} from '../verify/rules.js';

interface VerifyInput {
  /** Lead rows given directly, or ... */
  rows?: InputRow[];
  /** ... read from the lead list's Google Sheet (Contacts / Expanded Companies tabs). */
  source?: SheetSource;
  includeDirect?: boolean;
  includeGeneric?: boolean;
  genericFootprintMax200?: boolean;
  /** The record's saved MillionVerifier Job ID: check and download only, never upload. */
  existingJobId?: string;
  /** The old workflow's counts for the same list, for the side-by-side check. */
  expected?: Expected;
}

function readInput(raw: Record<string, unknown>): VerifyInput {
  const rows = raw.rows;
  const source = raw.source as SheetSource | undefined;
  if (!Array.isArray(rows) && !(source && typeof source.sheetId === 'string')) {
    throw new PermanentError('give input.rows (a list of lead rows) or input.source.sheetId (the lead list sheet)');
  }
  const existing = raw.existingJobId === undefined || raw.existingJobId === null ? '' : String(raw.existingJobId).trim();
  return {
    rows: Array.isArray(rows) ? (rows as InputRow[]) : undefined,
    source: Array.isArray(rows) ? undefined : source,
    includeDirect: raw.includeDirect !== false,
    includeGeneric: raw.includeGeneric !== false,
    genericFootprintMax200: raw.genericFootprintMax200 === true,
    existingJobId: existing || undefined,
    expected: (raw.expected ?? undefined) as Expected | undefined,
  };
}

const RUNNING = ['in_progress', 'in_queue_to_start', 'queued', 'waiting', 'processing'];
const FINISHED = ['finished', 'completed', 'complete', 'done'];

function summary(set: CandidateSet) {
  return {
    toVerify: set.send.length, held: set.holds.length, missingEmail: set.missingEmail.length,
    invalidSyntax: set.invalidSyntax.length, droppedFootprint: set.droppedFootprint,
    droppedByType: set.droppedByType, duplicatesRemoved: set.duplicates,
  };
}

export const verifyStage: Stage = async (ctx) => {
  const input = readInput(ctx.job.input);
  const opts = {
    includeDirect: input.includeDirect !== false,
    includeGeneric: input.includeGeneric !== false,
    genericFootprintMax200: input.genericFootprintMax200 === true,
  };
  // Reading the sheet is free; it happens once, inside this checkpoint.
  const set = await ctx.step('build-candidates', async () => {
    const rows = input.rows ?? await loadSheetRows(
      createSheetsClient({ keyFile: ctx.cfg.googleKeyFile, impersonate: ctx.cfg.googleImpersonateUser, sheetsBaseUrl: ctx.cfg.googleSheetsBaseUrl }),
      input.source!, opts,
    );
    return buildCandidates(rows, opts);
  }, { timeoutMs: 30 * 60_000 });
  const mv = createMvClient({ apiKey: ctx.cfg.millionVerifierApiKey, baseUrl: ctx.cfg.millionVerifierBaseUrl });
  const emails = set.send.map((c) => c.email);

  let fileId = input.existingJobId;
  let results: VerifiedEmail[] = [];

  if (emails.length > 0) {
    if (!fileId) {
      const csv = toCsv(emails);
      const started = await ctx.step('submit', () => ctx.paid({
        scope: 'record',
        callKey: `upload:${set.hash}`,
        provider: 'millionverifier',
        units: emails.length,
        run: () => mv.upload(csv, `dulcy-${ctx.job.record_id}-${set.hash}.csv`),
        dryRunResult: () => ({ file_id: '', status: 'dry_run' }),
      }));
      if (!started.file_id) {
        // Dry run with no saved job: report the plan, spend nothing.
        return { dryRun: true, plan: summary(set), wouldSpendCredits: emails.length, note: 'dry run: nothing was uploaded to MillionVerifier' };
      }
      fileId = started.file_id;
      await ctx.log('millionverifier job', { fileId, emails: emails.length });
    }

    const info = await mv.fileInfo(fileId);
    if (RUNNING.includes(info.status)) {
      throw new WaitError(`MillionVerifier job ${fileId}: ${info.status}, ${info.percent}% complete`, ctx.cfg.verifyPollMs);
    }
    if (info.status === 'wait_starting') {
      throw new NeedsReviewError(`MillionVerifier job ${fileId} is waiting to be started; start it in MillionVerifier, then run Verify again (it will reuse this job)`);
    }
    if (!FINISHED.includes(info.status)) {
      throw new NeedsReviewError(`MillionVerifier job ${fileId} is "${info.status || 'unknown'}"; check it in MillionVerifier before doing anything else`);
    }

    const id = fileId;
    results = await ctx.step('download-results', async () => parseResults(await mv.download(id), emails));
  }

  const out = await ctx.step('outputs', async () => buildOutputs(set, results));
  const leads = out.finalDirect.length + out.finalGeneric.length;
  return {
    dryRun: ctx.dryRun,
    shadow: true,
    millionVerifierJobId: fileId ?? null,
    plan: summary(set),
    counts: out.counts,
    finalDirectCount: out.finalDirect.length,
    finalGenericCount: out.finalGeneric.length,
    pendingRemainder: out.pendingEmails.length,
    message: out.pendingEmails.length
      ? `${out.pendingEmails.length} emails were not processed (usually no MillionVerifier credits); run the remainder only after credits are available`
      : `verified: ${out.counts.good} good, ${out.counts.risky} risky, ${out.counts.bad} bad; ${leads} final leads`,
    // What step 2b will write to the Lead Lists record (not written in shadow mode).
    airtablePreview: {
      'Verification Good Count': out.counts.good,
      'Verification Risky Count': out.counts.risky,
      'Verification Bad Count': out.counts.bad,
      'Final Direct Count': out.finalDirect.length,
      'Final Generic Count': out.finalGeneric.length,
      'Number of leads': leads,
      'MillionVerifier Job ID': fileId ?? '',
    },
    comparison: input.expected ? compare(out, input.expected) : undefined,
    finalDirect: out.finalDirect,
    finalGeneric: out.finalGeneric,
    held: out.held,
    pendingEmails: out.pendingEmails,
  };
};

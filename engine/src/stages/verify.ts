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
import { sheetIdFrom, loadSheetRows, type SheetSource } from '../sources/sheet.js';
import {
  buildCandidates, buildOutputs, compare, parseResults, parseResultsLoose, toCsv, type ResultDiff,
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
  /**
   * Shadow tests only, with existingJobId: don't stop on a file/list mismatch; count the
   * difference and explain it. Never allowed when the engine would write or pay.
   */
  diagnose?: boolean;
  /** Write the "Final Direct" / "Final Generic" tabs into the source sheet (the tabs the
   *  campaign build reads). Each tab is replaced in one write. Never in dry-run or diagnose. */
  writeFinalTabs?: boolean;
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
    diagnose: raw.diagnose === true,
    writeFinalTabs: raw.writeFinalTabs === true,
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
      createSheetsClient({ keyFile: ctx.cfg.googleKeyFile, impersonate: ctx.cfg.googleImpersonateUser, scope: ctx.cfg.googleScope, sheetsBaseUrl: ctx.cfg.googleSheetsBaseUrl }),
      input.source!, opts,
    );
    return buildCandidates(rows, opts);
  }, { timeoutMs: 30 * 60_000 });
  const mv = createMvClient({ apiKey: ctx.cfg.millionVerifierApiKey, baseUrl: ctx.cfg.millionVerifierBaseUrl });
  const emails = set.send.map((c) => c.email);

  let fileId = input.existingJobId;
  let results: VerifiedEmail[] = [];
  let diff: ResultDiff | undefined;

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
      // Right after an upload MillionVerifier often shows "waiting to start" for a short while
      // and then starts by itself (seen live 2026-11-19, job 32622427). Keep checking for up to
      // 30 minutes; only then ask a person to start it.
      const firstSeen = await ctx.step(`wait-start:${fileId}`, async () => Date.now());
      if (Date.now() - firstSeen < 30 * 60_000) throw new WaitError(`MillionVerifier job ${fileId}: waiting to start`, ctx.cfg.verifyPollMs);
      throw new NeedsReviewError(`MillionVerifier job ${fileId} has been waiting to start for 30 minutes; start it in MillionVerifier (check credits), then run Verify again (it will reuse this job)`);
    }
    if (!FINISHED.includes(info.status)) {
      throw new NeedsReviewError(`MillionVerifier job ${fileId} is "${info.status || 'unknown'}"; check it in MillionVerifier before doing anything else`);
    }

    const id = fileId;
    if (input.diagnose) {
      if (!input.existingJobId) throw new PermanentError('diagnose mode only works with a saved MillionVerifier job (existingJobId)');
      const loose = await ctx.step('download-results', async () => parseResultsLoose(await mv.download(id), emails));
      results = loose.results;
      diff = loose.diff;
    } else {
      results = await ctx.step('download-results', async () => parseResults(await mv.download(id), emails));
    }
  }

  const out = await ctx.step('outputs', async () => buildOutputs(set, results));
  const leads = out.finalDirect.length + out.finalGeneric.length;
  let finalTabs: { direct: number; generic: number } | undefined;
  if (input.writeFinalTabs && input.source && !ctx.dryRun && !input.diagnose) {
    finalTabs = await ctx.step('write-final-tabs', async () => {
      const sheets = createSheetsClient({ keyFile: ctx.cfg.googleKeyFile, impersonate: ctx.cfg.googleImpersonateUser, scope: ctx.cfg.googleScope, sheetsBaseUrl: ctx.cfg.googleSheetsBaseUrl });
      const id = sheetIdFrom(input.source!.sheetId);
      const header = ['Email', 'First Name', 'Last Name', 'Title', 'Company', 'Domain', 'LinkedIn URL', 'Country', 'State', 'Email Type', 'Verification Status', 'Verification Provider', 'Verification Path'];
      const toRow = (r: InputRow, type: string) => [r.email, r.firstName, r.lastName, r.title, r.company, r.domain, r.linkedin, r.country, r.state, type, 'Good', 'MillionVerifier', 'MillionVerifier valid'].map((v) => String(v ?? ''));
      for (const [tab, rows, type] of [['Final Direct', out.finalDirect, 'Direct'], ['Final Generic', out.finalGeneric, 'Generic']] as const) {
        await sheets.ensureTab(id, tab);
        await sheets.clearTab(id, tab);
        await sheets.writeRows(id, tab, 1, [header, ...rows.map((r) => toRow(r, type))]);
      }
      return { direct: out.finalDirect.length, generic: out.finalGeneric.length };
    });
  }
  return {
    dryRun: ctx.dryRun,
    shadow: true,
    millionVerifierJobId: fileId ?? null,
    plan: summary(set),
    counts: out.counts,
    finalDirectCount: out.finalDirect.length,
    finalGenericCount: out.finalGeneric.length,
    finalTabs,
    pendingRemainder: out.pendingEmails.length,
    message: out.pendingEmails.length
      ? `${out.pendingEmails.length} emails were not processed (usually no MillionVerifier credits); run the remainder only after credits are available`
      : `verified: ${out.counts.good} good, ${out.counts.risky} risky, ${out.counts.bad} bad; ${leads} final leads${out.counts.notSendable ? ` (${out.counts.notSendable} good generic emails left out: role inboxes or another company's address)` : ''}`,
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
    // Diagnose mode: how the saved job differs from today's sheet (counts + why; no emails).
    diagnosis: diff ? explainDiff(diff, set) : undefined,
    finalDirect: out.finalDirect,
    finalGeneric: out.finalGeneric,
    held: out.held,
    pendingEmails: out.pendingEmails,
  };
};

/** Why a saved MillionVerifier job no longer matches the sheet, in counts only. */
function explainDiff(diff: ResultDiff, set: CandidateSet) {
  const domainOf = (e: string) => e.split('@')[1] ?? '';
  const listDomains = new Set([...set.send, ...set.holds, ...set.invalidSyntax].map((c) => domainOf(c.email)));
  for (const r of set.missingEmail) if (r.domain) listDomains.add(String(r.domain).toLowerCase());
  const excluded = new Set(set.excludedPersonal ?? []);
  const held = new Set(set.holds.map((h) => h.email));
  let inExcludedPersonal = 0, heldByEngine = 0, companyStillInList = 0, companyGone = 0;
  for (const e of diff.inFileNotInList) {
    if (held.has(e)) heldByEngine++;
    else if (excluded.has(e)) inExcludedPersonal++;
    else if (listDomains.has(domainOf(e))) companyStillInList++;
    else companyGone++;
  }
  return {
    inFileNotInList: diff.inFileNotInList.length,
    inListNotInFile: diff.inListNotInFile.length,
    duplicatesInFile: diff.duplicatesInFile,
    whyNotInList: { heldByEngineForReview: heldByEngine, movedToExcludedPersonalEmails: inExcludedPersonal, companyStillInListButEmailGone: companyStillInList, companyNoLongerInList: companyGone },
    note: 'counts compare the saved MillionVerifier job with the sheet as it is today',
  };
}

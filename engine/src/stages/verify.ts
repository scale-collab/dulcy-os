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
import { createHash } from 'node:crypto';
import type { Stage } from './index.js';
import { NeedsReviewError, PermanentError, WaitError } from '../errors.js';
import { createMvClient } from '../providers/millionverifier.js';
import { createLeadMagicClient } from '../providers/leadmagic.js';
import { leadMagicCandidates, mapLeadMagicRow, type LmCandidate, type LmResult } from '../verify/leadmagic.js';
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
  /** "Use LeadMagic Fallback": direct contacts not Good after MillionVerifier go to the
   *  LeadMagic email finder (old n8n rules, see verify/leadmagic.ts). */
  leadMagic?: boolean;
}

const LM_MAX_WAIT_MS = 3 * 60 * 60_000;

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
    leadMagic: raw.leadMagic === true,
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

  let reused = false;
  let known: VerifiedEmail[] = [];
  let reusedFrom: string[] = [];
  if (emails.length > 0) {
    // Emails of this list already verified in an earlier MillionVerifier job are never paid
    // again (Alex, 2026-11-20): downloads are free, so collect every earlier result first and
    // upload ONLY the emails never verified (e.g. new ContraGen contacts or a top-up).
    let toSend = emails;
    if (!fileId && !input.diagnose) {
      const earlier = await ctx.step('reuse-check', async () => {
        const prior = await ctx.db.query(
          `SELECT response->>'file_id' AS file_id FROM receipts WHERE receipt_key LIKE $1 AND status='done' AND response->>'file_id' <> '' ORDER BY finished_at DESC LIMIT 20`,
          [`rec:${ctx.job.kind}:${ctx.job.record_id}:millionverifier:upload:%`]);
        let missing = emails;
        const found: VerifiedEmail[] = [];
        const from: string[] = [];
        for (const row of prior.rows) {
          if (!missing.length) break;
          const id = String(row.file_id);
          const info = await mv.fileInfo(id);
          if (!FINISHED.includes(info.status)) continue;
          // Newest job first; an unprocessed (Pending) email is not a result and is sent again.
          const got = parseResultsLoose(await mv.download(id), missing).results.filter((r) => r.verdict !== 'Pending');
          if (!got.length) continue;
          found.push(...got);
          from.push(id);
          const have = new Set(got.map((r) => r.email));
          missing = missing.filter((e) => !have.has(e));
        }
        return { known: found, missing, from };
      });
      known = earlier.known;
      reusedFrom = earlier.from;
      toSend = earlier.missing;
      reused = known.length > 0;
      if (!toSend.length) fileId = earlier.from[0];
    }
    if (!fileId) {
      const csv = toCsv(toSend);
      // Only the new emails: their own receipt, so a retry never pays twice.
      const key = toSend.length === emails.length ? set.hash : createHash('sha256').update([...toSend].sort().join('\n')).digest('hex').slice(0, 16);
      const started = await ctx.step('submit', () => ctx.paid({
        scope: 'record',
        callKey: `upload:${key}`,
        provider: 'millionverifier',
        units: toSend.length,
        run: () => mv.upload(csv, `dulcy-${ctx.job.record_id}-${key}.csv`),
        dryRunResult: () => ({ file_id: '', status: 'dry_run' }),
      }));
      if (!started.file_id) {
        // Dry run with no saved job: report the plan, spend nothing.
        return { dryRun: true, plan: { ...summary(set), alreadyVerified: known.length, newToVerify: toSend.length }, wouldSpendCredits: toSend.length, note: 'dry run: nothing was uploaded to MillionVerifier' };
      }
      fileId = started.file_id;
      await ctx.log('millionverifier job', { fileId, emails: toSend.length, alreadyVerified: known.length });
    }

    const id = fileId!;
    // Nothing new to send: every result came from earlier checks, no job to wait on.
    if (toSend.length) {
      const info = await mv.fileInfo(id);
      if (RUNNING.includes(info.status)) {
        throw new WaitError(`MillionVerifier job ${id}: ${info.status}, ${info.percent}% complete`, ctx.cfg.verifyPollMs);
      }
      if (info.status === 'wait_starting') {
        // Right after an upload MillionVerifier often shows "waiting to start" for a short while
        // and then starts by itself (seen live 2026-11-19, job 32622427). Keep checking for up to
        // 30 minutes; only then ask a person to start it.
        const firstSeen = await ctx.step(`wait-start:${id}`, async () => Date.now());
        if (Date.now() - firstSeen < 30 * 60_000) throw new WaitError(`MillionVerifier job ${id}: waiting to start`, ctx.cfg.verifyPollMs);
        throw new NeedsReviewError(`MillionVerifier job ${id} has been waiting to start for 30 minutes; start it in MillionVerifier (check credits), then run Verify again (it will reuse this job)`);
      }
      if (!FINISHED.includes(info.status)) {
        throw new NeedsReviewError(`MillionVerifier job ${id} is "${info.status || 'unknown'}"; check it in MillionVerifier before doing anything else`);
      }
    }

    if (input.diagnose) {
      if (!input.existingJobId) throw new PermanentError('diagnose mode only works with a saved MillionVerifier job (existingJobId)');
      const loose = await ctx.step('download-results', async () => parseResultsLoose(await mv.download(id), emails));
      results = loose.results;
      diff = loose.diff;
    } else if (!toSend.length) {
      results = known;
    } else {
      // The new job holds only the new emails: strict check on those, plus the earlier results.
      const fresh = await ctx.step('download-results', async () => parseResults(await mv.download(id), toSend));
      results = [...known, ...fresh];
    }
  }

  // LeadMagic fallback (after MillionVerifier; direct contacts only; each person once).
  let lmCands: LmCandidate[] = [];
  let lmKnown: LmResult[] = [];
  let lmInfo: { candidates: number; alreadyLookedUp: number; sent: number; recovered: number; jobId?: string; wouldSpend?: number } | undefined;
  if (input.leadMagic && opts.includeDirect && !input.diagnose) {
    lmCands = await ctx.step('lm-candidates', async () => leadMagicCandidates(set, results));
    const keys = lmCands.map((c) => c.key);
    const before = await ctx.step('lm-known', async () => (await ctx.db.query(`SELECT key FROM lead_lm_results WHERE list_id=$1 AND key = ANY($2::text[])`, [ctx.job.record_id, keys])).rows.map((x) => x.key as string));
    const done = new Set(before);
    const todo = lmCands.filter((c) => !done.has(c.key));
    lmInfo = { candidates: lmCands.length, alreadyLookedUp: before.length, sent: 0, recovered: 0 };
    if (todo.length && ctx.dryRun) lmInfo.wouldSpend = todo.length;
    else if (todo.length) {
      const lm = createLeadMagicClient({ apiKey: ctx.cfg.leadMagicApiKey, baseUrl: ctx.cfg.leadMagicBaseUrl });
      const key = createHash('sha256').update(todo.map((c) => c.key).sort().join('\n')).digest('hex').slice(0, 16);
      const jobId = await ctx.step('lm-submit', () => ctx.paid({
        scope: 'record', provider: 'leadmagic', callKey: `finder:${key}`, units: todo.length,
        run: () => lm.submitFinder(todo.map((c) => c.body), `dulcy-${ctx.job.record_id}-${key}`),
        dryRunResult: () => '',
      }));
      lmInfo.jobId = jobId; lmInfo.sent = todo.length;
      const startedAt = await ctx.step(`lm-started:${jobId}`, async () => Date.now());
      await ctx.step('lm-poll', async () => {
        const j = await lm.job(jobId);
        if (['failed', 'canceled', 'cancelled', 'paused'].includes(j.status)) throw new NeedsReviewError(`LeadMagic job ${jobId} is "${j.status}"; check it in LeadMagic. Not resubmitted.`);
        if (j.status !== 'completed' || (j.total > 0 && j.processed < j.total)) {
          if (Date.now() - startedAt > LM_MAX_WAIT_MS) throw new NeedsReviewError(`LeadMagic job ${jobId} still "${j.status}" after 3 hours`);
          throw new WaitError(`LeadMagic job ${jobId}: ${j.status}, ${j.processed} of ${j.total || todo.length} done`, ctx.cfg.verifyPollMs);
        }
        return j;
      });
      await ctx.step('lm-results', async () => {
        const rows: any[] = [];
        for (let offset = 0; offset < todo.length; offset += 200) {
          const page = await lm.results(jobId, offset);
          rows.push(...page);
          if (page.length < 200) break;
        }
        // Match by what was asked (name + domain), else by row position.
        const byKey = new Map(todo.map((c) => [c.key, c]));
        const got = new Map<string, LmResult>();
        for (const r of rows) {
          const i = r?.lm_input;
          const k = i && typeof i === 'object' ? [i.first_name, i.last_name, i.domain].map((v) => String(v ?? '').trim()).join('|').toLowerCase() : '';
          const c = (k && byKey.get(k)) || todo[Number(r?.row_index)];
          if (c && !got.has(c.key)) got.set(c.key, mapLeadMagicRow(c, r));
        }
        // No answer for a person: Risky, never retried automatically.
        for (const c of todo) if (!got.has(c.key)) got.set(c.key, { key: c.key, verdict: 'Risky', email: '', detail: 'provider_outcome_unknown' });
        const list = [...got.values()];
        await ctx.db.query(
          `INSERT INTO lead_lm_results (list_id, key, verdict, email, detail, job_id)
           SELECT $1, k, v, e, d, $2 FROM unnest($3::text[], $4::text[], $5::text[], $6::text[]) AS u(k, v, e, d) ON CONFLICT DO NOTHING`,
          [ctx.job.record_id, jobId, list.map((x) => x.key), list.map((x) => x.verdict), list.map((x) => x.email), list.map((x) => x.detail)]);
        return list.length;
      });
    }
    lmKnown = await ctx.step('lm-load', async () => (await ctx.db.query(`SELECT key, verdict, email, detail FROM lead_lm_results WHERE list_id=$1 AND key = ANY($2::text[])`, [ctx.job.record_id, keys])).rows as LmResult[]);
  }

  const out = await ctx.step('outputs', async () => {
    const o = buildOutputs(set, results);
    if (!lmCands.length) return o;
    // A LeadMagic Good replaces the contact's earlier verdict and email (old n8n merge).
    const verdict = new Map(results.map((r) => [r.email, r.verdict]));
    const invalid = new Set(set.invalidSyntax.map((c) => c.email));
    const taken = new Set([...o.finalDirect, ...o.finalGeneric].map((r) => String(r.email)));
    const byKey = new Map(lmKnown.map((r) => [r.key, r]));
    for (const c of lmCands) {
      const r = byKey.get(c.key);
      if (!r || r.verdict !== 'Good' || taken.has(r.email)) continue;
      taken.add(r.email);
      o.finalDirect.push({ ...c.row, email: r.email, originalEmail: c.originalEmail, verificationStatus: 'Good', verificationDetail: r.detail, verificationProvider: 'LeadMagic Email Finder', verificationPath: 'LeadMagic recovery' });
      o.counts.good++;
      const was = !c.originalEmail ? 'Risky' : invalid.has(c.originalEmail) ? 'Bad' : verdict.get(c.originalEmail) ?? 'Pending';
      if (was === 'Risky') o.counts.risky--;
      else if (was === 'Bad') o.counts.bad--;
      else { o.counts.pending--; o.pendingEmails = o.pendingEmails.filter((e) => e !== c.originalEmail); }
    }
    return o;
  });
  if (lmInfo) lmInfo.recovered = out.finalDirect.filter((r) => r.verificationProvider === 'LeadMagic Email Finder').length;
  const leads = out.finalDirect.length + out.finalGeneric.length;
  let finalTabs: { direct: number; generic: number } | undefined;
  if (input.writeFinalTabs && input.source && !ctx.dryRun && !input.diagnose) {
    finalTabs = await ctx.step('write-final-tabs', async () => {
      const sheets = createSheetsClient({ keyFile: ctx.cfg.googleKeyFile, impersonate: ctx.cfg.googleImpersonateUser, scope: ctx.cfg.googleScope, sheetsBaseUrl: ctx.cfg.googleSheetsBaseUrl });
      const id = sheetIdFrom(input.source!.sheetId);
      const header = ['Email', 'First Name', 'Last Name', 'Title', 'Company', 'Domain', 'LinkedIn URL', 'Country', 'State', 'Email Type', 'Verification Status', 'Verification Provider', 'Verification Path', 'Original Email'];
      const toRow = (r: InputRow, type: string) => [r.email, r.firstName, r.lastName, r.title, r.company, r.domain, r.linkedin, r.country, r.state, type, 'Good', r.verificationProvider ?? 'MillionVerifier', r.verificationPath ?? 'MillionVerifier valid', r.originalEmail ?? ''].map((v) => String(v ?? ''));
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
    reusedEarlierJob: reused,
    alreadyVerified: known.length,
    reusedFrom,
    leadMagic: lmInfo,
    plan: summary(set),
    counts: out.counts,
    finalDirectCount: out.finalDirect.length,
    finalGenericCount: out.finalGeneric.length,
    finalTabs,
    pendingRemainder: out.pendingEmails.length,
    message: out.pendingEmails.length
      ? `${out.pendingEmails.length} emails were not processed (usually no MillionVerifier credits); run the remainder only after credits are available`
      : `verified: ${out.counts.good} good, ${out.counts.risky} risky, ${out.counts.bad} bad; ${leads} final leads${reused ? (known.length === results.length ? ` (results reused from MillionVerifier job ${reusedFrom.join(', ')}; nothing uploaded)` : ` (${known.length} reused from earlier checks; only ${results.length - known.length} new emails verified)`) : ''}${lmInfo ? `; LeadMagic: ${lmInfo.recovered} recovered of ${lmInfo.candidates} direct contacts not Good${lmInfo.wouldSpend ? ` (dry run: would look up ${lmInfo.wouldSpend})` : ''}` : ''}`,
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

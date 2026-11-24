// leadlist.qa: "Run Automated QA" (the old n8n 06 workflow, run unchanged).
//   1. Normalize QA Project: the list + its linked campaigns' final copy (Direct/Generic) and the
//      declared custom variables;
//   2. Select QA Source Tab: Final Direct + Final Generic (the tabs Verify writes);
//   3. Apply QA Corrections by Email: combines the tabs and applies reviewed edits / quarantine
//      from an existing "QA Review" tab (written back to the source only when there are any);
//   4. Analyze QA Source: every row has the fields its copy needs (Company, Email, First Name for
//      direct, every {VARIABLE} in the copy, declared custom variables), no placeholder values,
//      Verification Status Good, no duplicate emails, a usable copy contract;
//   5. "QA Review" tab written (checks, issues, flagged rows or a 25-row sample);
//   6. Prepare QA Airtable Update: the same Airtable fields n8n saved (QA Status Passed/Failed,
//      Lead List Stage Ready on pass, counts, summary), minus n8n's own QA Action field.
// No paid calls. Dry run: analysis only, nothing written.
import type { Stage } from './index.js';
import { PermanentError } from '../errors.js';
import { createSheetsClient } from '../providers/google.js';
import { QA_NODES as N } from '../leadlist/legacy/qaNodes.js';
import { runNode, type Items } from '../leadlist/legacy/runNode.js';
import { LEAD_LIST_FIELDS } from '../leadlist/legacy/fieldNames.js';

interface QaInput { project: { id: string; fields: Record<string, unknown> }; campaigns: { records: Array<{ id: string; fields: Record<string, unknown> }> } }

const legacy = async (name: string, input: Items, earlier: Record<string, Items> = {}, globals: Record<string, unknown> = {}) => {
  try { return await runNode(N[name], input, earlier, globals); } catch (e) { throw new PermanentError(`QA: ${String((e as Error).message ?? e)}`); }
};
const BY_NAME = Object.fromEntries(Object.entries(LEAD_LIST_FIELDS).map(([id, name]) => [name, id]));
const quote = (t: string) => `'${t.replace(/'/g, "''")}'`;

export const automatedQaStage: Stage = async (ctx) => {
  const input = ctx.job.input as unknown as QaInput;
  if (!input?.project?.id) throw new PermanentError('input.project (the Lead List record by field name) is required');
  const sheets = createSheetsClient({ keyFile: ctx.cfg.googleKeyFile, impersonate: ctx.cfg.googleImpersonateUser, scope: ctx.cfg.googleScope, sheetsBaseUrl: ctx.cfg.googleSheetsBaseUrl });
  const startedAt = await ctx.step('started', async () => new Date().toISOString());

  const analysis = await ctx.step('analyze', async () => {
    const norm = await legacy('Normalize QA Project', [input.campaigns ?? { records: [] }], { 'Get QA Project': [input.project], 'Validate QA Request': [{ recordId: input.project.id }] });
    const p = norm[0];
    const meta = await sheets.meta(p.sheetId);
    const sel = await legacy('Select QA Source Tab', [{ sheets: meta.sheets }], { 'Normalize QA Project': norm });
    const s = sel[0];
    const valueRanges = [];
    for (const tab of s.sourceTabs as string[]) valueRanges.push({ range: `${quote(tab)}!A1:ZZ`, values: await sheets.tab(p.sheetId, tab) });
    const enriched = [{ valueRanges }];
    const review = [{ values: s.hasQAReview ? await sheets.tab(p.sheetId, 'QA Review') : [[valueRanges[0]?.values?.[0]?.[0] ?? '']] }];
    const directive = (review[0].values as string[][]).some((r) => r.some((c) => String(c ?? '').trim() === 'QUARANTINE_REQUIRED_FIELDS_V1'));
    const archive = [{ values: directive ? await sheets.tab(p.sheetId, 'QA Quarantine') : [] }];
    const applied = await legacy('Apply QA Corrections by Email', review, { 'Read Enriched Leads for QA': enriched, 'Read Existing QA Corrections': review, 'Select QA Source Tab': sel, 'Normalize QA Project': norm, 'Read QA Quarantine Archive': archive });
    const a = applied[0];
    const rows = await legacy('Prepare QA Source Rows', applied, { 'Select QA Source Tab': sel });
    const contacts = s.enrichmentSkipped ? [{ values: await sheets.tab(p.sheetId, 'Contacts') }] : [{}];
    const merged = await legacy('Merge Verified Good with Contacts', contacts, { 'Prepare QA Source Rows': rows, 'Select QA Source Tab': sel });
    const an = await legacy('Analyze QA Source', merged, { 'Normalize QA Project': norm });
    const en = await legacy('Analyze Enriched Leads', an, { 'Select QA Source Tab': sel });
    // Reviewed corrections / quarantine are written back only when there are any (n8n otherwise
    // re-wrote one header cell per tab, which changes nothing).
    const writes = (a.qaCorrectionsApplied > 0 || a.qaQuarantine) ? (a.qaSourceWriteData ?? []) : [];
    return { p: en[0], writes };
  }, { timeoutMs: 10 * 60_000 });

  const q = analysis.p;
  const head = { rows: q.rowCount, passed: q.structuralPass === true, rejected: q.rejectedRows, duplicates: q.duplicateCount, requiredPass: q.requiredPass, deliveryPass: q.deliveryPass, configurationIssues: q.configurationIssues ?? [] };
  if (ctx.dryRun) return { dryRun: true, qa: head, summary: q.summary, message: `dry run: QA would be ${head.passed ? 'Passed' : 'Failed'} (${head.rows} rows, ${head.rejected} flagged); nothing written` };

  const link = await ctx.step('write-review', async () => {
    if (analysis.writes.length) await sheets.writeRanges(q.sheetId, analysis.writes);
    await sheets.ensureTab(q.sheetId, 'QA Review');
    await sheets.clearTab(q.sheetId, 'QA Review');
    await sheets.writeRows(q.sheetId, 'QA Review', 1, (q.qaValues as unknown[][]).map((r) => r.map((v) => (typeof v === 'number' ? v : String(v ?? '')))));
    const tab = (await sheets.meta(q.sheetId)).sheets.find((x) => x.properties.title === 'QA Review');
    if (!tab) throw new PermanentError('Google Sheets did not return the QA Review tab ID.');
    return { qaSheetId: tab.properties.sheetId, qaSheetUrl: `https://docs.google.com/spreadsheets/d/${q.sheetId}/edit#gid=${tab.properties.sheetId}` };
  });

  const fields = await ctx.step('airtable-fields', async () => {
    const upd = await legacy('Prepare QA Airtable Update', [{}], { 'Resolve QA Review Link': [{ ...q, ...link }], 'Mark QA Running': [{ fields: { 'Processing Started At': startedAt } }] }, { $execution: { id: `engine-job-${ctx.job.id}` } });
    const named = { ...(upd[0]?.body?.fields ?? {}) } as Record<string, unknown>;
    delete named['QA Action']; // n8n's own trigger field; the engine never touches it
    const byId: Record<string, unknown> = {};
    for (const [name, v] of Object.entries(named)) {
      const id = BY_NAME[name];
      if (!id) throw new PermanentError(`QA: unknown Lead Lists field "${name}"`);
      byId[id] = v;
    }
    return byId;
  });

  return { dryRun: false, qa: head, summary: q.summary, sheet: { url: link.qaSheetUrl, tab: 'QA Review' }, airtableFields: fields, message: String(q.summary ?? '').split('\n')[0] + ` QA Review: ${link.qaSheetUrl}` };
};

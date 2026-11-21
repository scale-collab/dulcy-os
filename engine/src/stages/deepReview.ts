// DiscoGen deep review (optional, paid): the old n8n company review run unchanged on the
// companies the free code fit check kept.
//
// Only for lists with "Use DiscoGen Deep Review" ticked and a "DiscoGen Deep Review Prompt".
// n8n's own code (leadlist/legacy/deepReviewNodes.ts) builds the request: the ICP text plus the
// prompt, the additional requirements and n8n's deep-review policy, web search on, sent to
// DiscoLike /v1/validate/icp. Its fit gate turns the answer into Pass / Needs review / Fail.
// Fail cuts the company (Find Contacts then skips it); Pass and Needs review stay usable.
// Every company is reviewed once only (lead_deep_reviews). Per press: the first 100 companies
// while the company sample is not approved (n8n's sample size), else every company left (in
// calls of up to 2,500, n8n's expansion batch size).
// Writes the "AI Company Review" tab and the same Airtable fields as n8n, plus the Results URL.
import { createHash } from 'node:crypto';
import type { Stage } from './index.js';
import { NeedsReviewError, PermanentError, WaitError } from '../errors.js';
import { createDiscoLikeClient } from '../providers/discolike.js';
import { createSheetsClient } from '../providers/google.js';
import { DEEP_REVIEW_NODES as N } from '../leadlist/legacy/deepReviewNodes.js';
import { runNode, type Items } from '../leadlist/legacy/runNode.js';

interface Project { id: string; fields: Record<string, unknown> }
interface DeepInput { project: Project; campaign?: { id: string; fields: Record<string, unknown> } }

/** Lists with their own record-specific evidence logic in n8n: they stay on n8n. */
export const N8N_ONLY_DEEP_REVIEW = new Set(['recrWIAOWk6tCSqjE', 'recCnTxJUBXZO9rin', 'rectAjZPdU3JAkJ4v', 'rec7yReHLebtWCnOp']);
const SAMPLE_CAP = 100;
const BATCH_CAP = 2500;
const POLL_MS = 15_000;
const MAX_WAIT_MS = 6 * 60 * 60_000;
const TAB = 'AI Company Review';

const node = async (name: string, input: Items, earlier: Record<string, Items> = {}) => {
  try { return await runNode(N[name], input, earlier); } catch (e) { throw new PermanentError(`Deep review: ${String((e as Error).message ?? e)}`); }
};

export const deepReviewStage: Stage = async (ctx) => {
  const input = ctx.job.input as unknown as DeepInput;
  const project = input?.project;
  if (!project?.id) throw new PermanentError('input.project (the Lead List record by field name) is required');
  const listId = project.id;
  if (N8N_ONLY_DEEP_REVIEW.has(listId)) throw new PermanentError('this list uses a client-specific deep review that only exists in n8n; run it from the regular Lead List Center');
  if (project.fields['Use DiscoGen Deep Review'] !== true) throw new PermanentError('tick "Use DiscoGen Deep Review" on this list first (and write the DiscoGen Deep Review Prompt)');
  if (!String(project.fields['DiscoGen Deep Review Prompt'] ?? '').trim()) throw new PermanentError('write the DiscoGen Deep Review Prompt first');
  const startedAt = await ctx.step('started', async () => new Date().toISOString());

  // 1. n8n's request, built by n8n's code, for the next companies not yet reviewed.
  const prep = await ctx.step('prepare', async () => {
    const v = await node('Validate Action Request2', [{ body: { recordId: listId, action: 'Run Company Sample' } }]);
    if (!v.length) throw new PermanentError('the old validator stopped this request quietly');
    const norm = await node('Normalize Lead List2', [project], { 'Validate Action Request2': v });
    const cap = project.fields['Company Sample Approved'] === true ? BATCH_CAP : SAMPLE_CAP;
    const rows = (await ctx.db.query(
      `SELECT c.domain, c.data FROM lead_companies c
        WHERE c.list_id=$1 AND c.tier IN ('Tier 1','Tier 2')
          AND NOT EXISTS (SELECT 1 FROM lead_deep_reviews d WHERE d.list_id=c.list_id AND d.domain=c.domain)
        ORDER BY c.seq LIMIT $2`, [listId, cap])).rows as { domain: string; data: Record<string, unknown> }[];
    if (!rows.length) return { none: true as const };
    const domains = rows.map((r) => r.domain);
    const sourceRows = rows.map((r) => ({ ...(r.data ?? {}), domain: r.domain }));
    const p = await node('Prepare ICP Validation2', [{ domains, sourceRows }], { 'Normalize Lead List2': norm });
    const built = input.campaign
      ? await node('Build Validation With Campaign Thesis2', [input.campaign], { 'Prepare ICP Validation2': p, 'Normalize Lead List2': norm })
      : await node('Build Validation Without Campaign2', p, { 'Normalize Lead List2': norm, 'Prepare ICP Validation2': p });
    const body = built[0]?.validationBody;
    if (!body || !Array.isArray(body.domains) || !body.domains.length) throw new PermanentError('Deep review: the old request builder returned no companies');
    if (typeof body.query === 'string') throw new PermanentError('Deep review: this list needs n8n\'s record-specific research path; run it in n8n');
    return { none: false as const, norm, prep: p, body };
  }, { timeoutMs: 10 * 60_000 });
  if (prep.none) return { dryRun: ctx.dryRun, reviewed: 0, message: 'Deep review: every usable company on this list has already been reviewed. Nothing was charged.' };

  const n = (prep.body.domains as string[]).length;
  if (ctx.dryRun) return { dryRun: true, plan: { companies: n, webSearch: prep.body.web_search === true }, wouldSpendCredits: { discolike: `${n} companies (ICP validation with web search)` }, message: `dry run: would deep-review ${n} companies with DiscoGen` };

  // 2. One paid task (never paid twice for the same companies), then wait for it.
  const disco = createDiscoLikeClient({ apiKey: ctx.cfg.discoLikeApiKey, baseUrl: ctx.cfg.discoLikeBaseUrl });
  const task = await ctx.step('submit', () => ctx.paid({
    scope: 'record', provider: 'discolike', units: n,
    callKey: `deepreview:${createHash('sha256').update(JSON.stringify(prep.body)).digest('hex').slice(0, 16)}`,
    run: async () => (await node('Capture ICP Validation Task2', [await disco.validateIcpSubmit(prep.body)], { 'Normalize Lead List2': prep.norm }))[0].taskId as string,
    dryRunResult: () => '',
  }));
  const status = await ctx.step('poll', async () => {
    const answer = await disco.discoGenStatus(task);
    let checked: Items;
    try { checked = await runNode(N['Check ICP Validation Status2'], [answer], { 'Capture ICP Validation Task2': [{ taskId: task, pollCount: 0 }] }); }
    catch (e) { throw new NeedsReviewError(`${String((e as Error).message)} (task ${task}; not resubmitted)`); }
    if (checked[0]?.isComplete !== true) {
      if (Date.parse(startedAt) + MAX_WAIT_MS < Date.now()) throw new NeedsReviewError(`DiscoGen deep review task ${task} still running after 6 hours`);
      throw new WaitError(`DiscoGen deep review task ${task}: ${String(answer?.status ?? answer?.data?.status ?? 'running')}`, POLL_MS);
    }
    return checked[0];
  }, { timeoutMs: 10 * 60_000 });

  // 3. n8n's fit gate, then save the verdicts (Fail = cut).
  const gate = await ctx.step('gate', async () => (await node('Calculate Company Fit Gate2', [status], { 'Prepare ICP Validation2': prep.prep, 'Normalize Lead List2': prep.norm }))[0], { timeoutMs: 10 * 60_000 });
  const saved = await ctx.step('save', async () => {
    let pass = 0, review = 0, fail = 0;
    for (const row of (gate.reviewed ?? []) as Record<string, unknown>[]) {
      const domain = String(row.domain ?? '').trim().toLowerCase();
      if (!domain) continue;
      const verdict = String(row['Deep Review Verdict'] ?? 'Needs review');
      await ctx.db.query(
        `INSERT INTO lead_deep_reviews (list_id, domain, verdict, row, task_id) VALUES ($1,$2,$3,$4,$5)
         ON CONFLICT (list_id, domain) DO UPDATE SET verdict=EXCLUDED.verdict, row=EXCLUDED.row, task_id=EXCLUDED.task_id, reviewed_at=now()`,
        [listId, domain, verdict, JSON.stringify(row), task]);
      if (verdict === 'Fail') {
        await ctx.db.query(`UPDATE lead_companies SET tier='Cut', reasons = reasons || $3::jsonb WHERE list_id=$1 AND domain=$2`,
          [listId, domain, JSON.stringify(['DiscoGen deep review: Fail'])]);
        fail++;
      } else if (verdict === 'Pass') pass++; else review++;
    }
    return { pass, review, fail };
  });

  // 4. The AI Company Review tab (every company reviewed so far), as n8n wrote it.
  const sheet = await ctx.step('sheet', async () => {
    const s = (await ctx.db.query(`SELECT sheet_id FROM lead_list_sheets WHERE list_id=$1 AND kind='companies'`, [listId])).rows[0];
    if (!s) return { url: null as string | null };
    const all = (await ctx.db.query(`SELECT row FROM lead_deep_reviews WHERE list_id=$1 ORDER BY reviewed_at, domain`, [listId])).rows.map((r) => r.row);
    const chunks = await node('Prepare Sample Sheet Chunks2', [{}], { 'Prepare Sample Spreadsheet Data2': [{ rawRows: [], reviewRows: all }] });
    const sheets = createSheetsClient({ keyFile: ctx.cfg.googleKeyFile, impersonate: ctx.cfg.googleImpersonateUser, scope: ctx.cfg.googleScope, sheetsBaseUrl: ctx.cfg.googleSheetsBaseUrl });
    await sheets.ensureTab(s.sheet_id, TAB);
    await sheets.clearTab(s.sheet_id, TAB);
    for (const c of chunks) {
      const start = Number(String(c.range).match(/!A(\d+)$/)?.[1] ?? 1);
      await sheets.writeRows(s.sheet_id, TAB, start, c.values as string[][]);
    }
    const gid = (await sheets.meta(s.sheet_id)).sheets.find((x: any) => x.properties.title === TAB)?.properties.sheetId;
    return { url: `https://docs.google.com/spreadsheets/d/${s.sheet_id}/edit${gid != null ? `#gid=${gid}` : ''}` };
  });

  // 5. Airtable: n8n's fields, with the counts over every company reviewed so far.
  const totals = (await ctx.db.query(
    `SELECT COUNT(*) FILTER (WHERE verdict='Pass')::int AS pass, COUNT(*) FILTER (WHERE verdict='Needs review')::int AS review,
            COUNT(*) FILTER (WHERE verdict='Fail')::int AS fail, COUNT(*)::int AS total
       FROM lead_deep_reviews WHERE list_id=$1`, [listId])).rows[0];
  const left = Number((await ctx.db.query(
    `SELECT COUNT(*)::int AS n FROM lead_companies c WHERE c.list_id=$1 AND c.tier IN ('Tier 1','Tier 2')
       AND NOT EXISTS (SELECT 1 FROM lead_deep_reviews d WHERE d.list_id=c.list_id AND d.domain=c.domain)`, [listId])).rows[0].n);
  const rate = totals.total ? totals.pass / totals.total : 0;
  const status2 = totals.review ? 'Needs Review' : rate >= 0.8 ? 'Passed' : 'Failed';
  const summary = `${totals.pass} passed; ${totals.review} need review; ${totals.fail} failed (cut). Needs-review companies are not fully approved.`
    + ` This press: ${saved.pass} passed, ${saved.review} need review, ${saved.fail} failed of ${saved.pass + saved.review + saved.fail}.`
    + (left ? ` ${left} usable companies not reviewed yet: press Deep review again${project.fields['Company Sample Approved'] === true ? '' : ' (approve the company sample to review the rest)'}.` : ' Every usable company has been reviewed.');
  const fields: Record<string, unknown> = { ...((gate.airtableBody?.fields ?? {}) as Record<string, unknown>) };
  delete fields.fldqGx4RU4zDYxitK; // n8n reset "Company Sample Approved"; a deep review never un-approves
  Object.assign(fields, {
    fldiedxTwtn6TikJi: totals.total, fldAWCY4Tl9jpQtYc: totals.pass, fldmyD4PJ9mXdCJZ8: totals.review, fldqaiJodYBS3GpRu: totals.fail,
    fldDD7HGFq0j3Iwfp: rate, fldY1i1787UwZFOr6: status2, fld6BhZSLdGOkCJCZ: summary, fldVnH7Pn1PxlZI5b: summary,
    ...(sheet.url ? { fld0KlQqxFEG6wgfU: sheet.url } : {}),
  });
  return { dryRun: false, reviewed: saved.pass + saved.review + saved.fail, ...saved, left, taskId: task, airtableFields: fields, message: summary };
};

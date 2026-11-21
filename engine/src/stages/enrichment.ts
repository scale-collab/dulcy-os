// Enrichment, the old n8n 04 + 05 workflows run unchanged (copied code in leadlist/legacy/enrichNodes.ts).
//
// leadlist.enrichprompt ("Prepare Enrichment Prompt", n8n 04): the plain-English request in Custom
//   Variables Requested -> ONE AI call (n8n's model and prompt) -> a structured DiscoGen prompt
//   (# VARIABLE / ## SCOPE / ## OUTPUT keys), saved back into Custom Variables Requested for review.
//
// leadlist.enrich ("Run Enrichment", n8n 05 live copy 2): needs Verify completed and a prepared prompt.
//   Reads Final Direct + Final Generic, finds the rows missing a requested value, and sends ONE
//   DiscoGen task: company scope = /v1/discogen/process per domain (seeded with the company name),
//   person scope = /v1/discogen/process-personas per DiscoLike persona (Direct rows only). Polls until
//   done, fills ONLY empty cells (never overwrites), appends a column per variable, and writes the two
//   tabs back after a stale-data check. Airtable: the same fields n8n saved (Stage QA, counts, message).
//   The persona IDs come from the engine's own contacts (the old flow read them from the Contacts tab).
//
// Client-specific n8n overrides (Meta sample, Human AEO recovery, Twenty West beauty pairs) are not
// run on the engine: those three lists are refused with a clear message.
import { createHash } from 'node:crypto';
import type { Stage } from './index.js';
import { NeedsReviewError, PermanentError, WaitError } from '../errors.js';
import { createDiscoLikeClient } from '../providers/discolike.js';
import { createOpenAIClient } from '../providers/openai.js';
import { createSheetsClient } from '../providers/google.js';
import { ENRICH_PROMPT_NODES as P, ENRICH_RUN_NODES as R } from '../leadlist/legacy/enrichNodes.js';
import { runNode, type Items } from '../leadlist/legacy/runNode.js';
import { LEAD_LIST_FIELDS } from '../leadlist/legacy/fieldNames.js';

interface Project { id: string; fields: Record<string, unknown> }
interface EnrichInput { project: Project; companyTab?: string }

export const N8N_ONLY_ENRICHMENT = new Set(['rechmwZZ0DCPVKLMT', 'rec468aQaOEYtdYL3', 'rec6zH7MNS1g2DMcE']);
const POLL_MS = 30_000;
const MAX_WAIT_MS = 6 * 60 * 60_000;
const BY_NAME = Object.fromEntries(Object.entries(LEAD_LIST_FIELDS).map(([id, name]) => [name, id]));

const legacy = (nodes: Record<string, string>) => async (name: string, input: Items, earlier: Record<string, Items> = {}, globals: Record<string, unknown> = {}) => {
  try { return await runNode(nodes[name], input, earlier, globals); } catch (e) { throw new PermanentError(`Enrichment: ${String((e as Error).message ?? e)}`); }
};
/** Alex 2026-11-21: a lead the research cannot answer gets a fallback that fits the email copy,
 *  not a blank (n8n wrote "Not Found" and QA then blocked the list). Added to n8n's prompt compiler. */
export const COPY_FALLBACK_RULE = `

DULCY RULE (this overrides any not-found sentinel above): every lead must end up with a usable value, because each value is merged into a cold email sentence. In each variable's FALLBACK section give one short, natural phrase that still reads correctly in the email where the value goes (for a city: "your area"; for a case-study customer: "a client like you"; for a phone number: "your main line"), written exactly as: If the value cannot be verified, return exactly: "<phrase>". In that variable's OUTPUT section use the same phrase as the unavailable value. Never use Not Found, Unknown, None found, N/A or an empty string.`;

const MISSING = /^(?:not[ _-]*found|unknown|none found|n\/?a|null|undefined|review required|needs review)?$/i;
/** The fallback phrase of each variable, read from its ## FALLBACK section ("return exactly: ..."). */
export function fallbackPhrases(prompt: string, columns: string[]): Record<string, string> {
  const out: Record<string, string> = {};
  const blocks = [...prompt.matchAll(/^#{1,4}\s*VARIABLE\s*:?\s*([^\n#]+)\n([\s\S]*?)(?=^#{1,4}\s*VARIABLE\s*:|^#\s+OUTPUT\b|(?![\s\S]))/gim)];
  for (const col of columns) {
    const block = blocks.find((m) => m[1].trim().toLowerCase() === col.trim().toLowerCase())?.[2] ?? '';
    const fb = block.match(/^#{1,4}\s*FALLBACK\s*\n([\s\S]*?)(?=^#{1,4}\s|(?![\s\S]))/im)?.[1] ?? '';
    const m = fb.match(/return exactly\s*:?\s*[`"\u201c']([^`"\u201d'\n]{1,80})[`"\u201d']/i) ?? fb.match(/return exactly\s*:\s*([^\n.]{1,80})/i);
    const phrase = m?.[1]?.trim() ?? '';
    if (phrase && !MISSING.test(phrase)) out[col] = phrase;
  }
  return out;
}
/** Fill every still-blank (or "Not Found") requested cell with that variable's fallback phrase. */
export function fillFallbacks(built: any, prompt: string, variables: { column: string }[]): number {
  const cols = [...new Set(variables.map((v) => String(v.column)))];
  const phrases = fallbackPhrases(prompt, cols);
  let filled = 0;
  for (const [tab, rows] of Object.entries(built?.tabValues ?? {}) as [string, string[][]][]) {
    if (!Array.isArray(rows) || !rows.length) continue;
    let here = 0;
    for (const [col, phrase] of Object.entries(phrases)) {
      const c = rows[0].indexOf(col);
      if (c < 0) continue;
      for (const row of rows.slice(1)) { if (MISSING.test(String(row[c] ?? '').trim())) { row[c] = phrase; here++; } }
    }
    if (here && built.tabWritePlan?.[tab]) built.tabWritePlan[tab].shouldWrite = true;
    filled += here;
  }
  if (filled && typeof built.missing === 'number') built.missing = Math.max(0, built.missing - filled);
  return filled;
}
/** With ONE requested variable, DiscoGen can answer each entity with the bare value ("Austin")
 *  instead of an object. The n8n parser rejects that ("Unsupported literal"), so wrap it as
 *  {key: value} first. Error strings become empty results (the cell stays blank for QA). */
export function wrapBareResults(status: any, req: any): any {
  const schema = status?.response_format?.json_schema ?? status?.data?.response_format?.json_schema;
  const schemaKeys = Object.keys(schema?.properties ?? {});
  const vars = Array.isArray(req?.variables) ? req.variables : [];
  const key = schemaKeys.length === 1 ? schemaKeys[0] : schemaKeys.length === 0 && vars.length === 1 ? String(vars[0].key ?? vars[0].column ?? '') : '';
  if (!key) return status;
  const bare = (v: unknown) => {
    if (typeof v !== 'string') return v;
    const t = v.trim();
    try { JSON.parse(t); return v; } catch { /* not JSON */ }
    if (/^[{[\'"]/.test(t) || t.includes('|')) return v; // structured: the n8n parser handles it
    if (!t || /^erro/i.test(t)) return '{}';
    return JSON.stringify({ [key]: t });
  };
  const fix = (set: any) => Array.isArray(set) ? set.map((x) => (x && typeof x === 'object' && 'result' in x ? { ...x, result: bare(x.result) } : bare(x)))
    : set && typeof set === 'object' ? Object.fromEntries(Object.entries(set).map(([k, v]) => [k, bare(v)])) : set;
  if (status?.results !== undefined) return { ...status, results: fix(status.results) };
  if (status?.data?.results !== undefined) return { ...status, data: { ...status.data, results: fix(status.data.results) } };
  return status;
}
/** A short look at the first DiscoGen answer, so a format problem can be fixed without guessing. */
function resultSample(status: any): string {
  const set = status?.results ?? status?.data?.results;
  const first = Array.isArray(set) ? set[0] : set && typeof set === 'object' ? Object.values(set)[0] : set;
  const text = typeof first === 'string' ? first : JSON.stringify(first ?? null);
  return ` [first DiscoGen answer: ${String(text).replace(/\s+/g, ' ').slice(0, 160)}]`;
}
/** n8n's Airtable update (by field name) -> field IDs, without n8n's own Enrichment Action trigger field. */
function toFieldIds(named: Record<string, unknown>) {
  const out: Record<string, unknown> = {};
  for (const [name, v] of Object.entries(named)) {
    if (name === 'Enrichment Action') continue;
    const id = BY_NAME[name];
    if (!id) throw new PermanentError(`Enrichment: unknown Lead Lists field "${name}"`);
    out[id] = v;
  }
  return out;
}

export const enrichPromptStage: Stage = async (ctx) => {
  const input = ctx.job.input as unknown as EnrichInput;
  if (!input?.project?.id) throw new PermanentError('input.project (the Lead List record by field name) is required');
  const node = legacy(P);
  const req = await ctx.step('compile-request', async () => {
    const v = await node('Validate Prompt Request', [{ body: { recordId: input.project.id, action: 'Prepare Enrichment Prompt' } }]);
    if (!v.length) throw new PermanentError('the old validator stopped this request quietly');
    return node('Build Prompt Compiler Request', [input.project], { 'Validate Prompt Request': v });
  });
  const msgs = req[0]?.openAiBody?.messages ?? [];
  const system = String(msgs[0]?.content ?? '') + COPY_FALLBACK_RULE, user = String(msgs[1]?.content ?? '');
  if (!system || !user) throw new PermanentError('Enrichment: the prompt request came out empty');
  if (ctx.dryRun) return { dryRun: true, wouldSpendCredits: { openai: 1 }, message: 'dry run: would make one AI call to prepare the DiscoGen prompt' };
  const ai = createOpenAIClient({ apiKey: ctx.cfg.openAiApiKey, model: ctx.cfg.openAiModel, baseUrl: ctx.cfg.openAiBaseUrl });
  const reply = await ctx.step('ai', () => ctx.paid({
    provider: 'openai', callKey: 'enrich-prompt', units: 1,
    run: async () => ({ text: await ai.text(user, ctx.cfg.openAiModel, system) }),
    dryRunResult: () => ({ text: '' }),
  }));
  const fields = await ctx.step('save', async () => {
    const checked = await node('Validate Prepared Prompt', [reply]);
    const upd = await node('Prepare Airtable Prompt Update', checked, { 'Build Prompt Compiler Request': req });
    return toFieldIds(upd[0]?.body?.fields ?? {});
  });
  return { dryRun: false, airtableFields: fields, message: String(fields[BY_NAME['Last Workflow Message']] ?? 'Enrichment prompt prepared for review.') };
};

export const enrichRunStage: Stage = async (ctx) => {
  const input = ctx.job.input as unknown as EnrichInput;
  if (!input?.project?.id) throw new PermanentError('input.project (the Lead List record by field name) is required');
  if (N8N_ONLY_ENRICHMENT.has(input.project.id)) throw new PermanentError('this list uses a client-specific enrichment that only exists in n8n; run it from the regular Lead List Center');
  const node = legacy(R);
  const sheets = createSheetsClient({ keyFile: ctx.cfg.googleKeyFile, impersonate: ctx.cfg.googleImpersonateUser, scope: ctx.cfg.googleScope, sheetsBaseUrl: ctx.cfg.googleSheetsBaseUrl });
  const startedAt = await ctx.step('started', async () => new Date().toISOString());

  const prep = await ctx.step('prepare', async () => {
    const v = await node('Validate Enrichment Run2', [{ body: { recordId: input.project.id, action: 'Run Enrichment' } }]);
    if (!v.length) throw new PermanentError('the old validator stopped this request quietly');
    const norm = await node('Normalize Enrichment Project2', [input.project], { 'Validate Enrichment Run2': v });
    const sheetId = norm[0].sheetId as string;
    const read = async (tab: string) => { try { return await sheets.tab(sheetId, tab); } catch { return []; } };
    const direct = [{ values: await read('Final Direct') }], generic = [{ values: await read('Final Generic') }];
    // Persona IDs from the engine's contacts (same columns the old flow found in the Contacts tab).
    const ids = (await ctx.db.query(`SELECT email, data->>'persona_id' AS pid FROM lead_contacts WHERE list_id=$1 AND tier <> 'Cut' AND data->>'persona_id' IS NOT NULL`, [input.project.id])).rows;
    const contacts = [{ values: [['Email', 'Persona ID'], ...ids.map((r) => [r.email, r.pid])] }];
    const companies = [{ values: input.companyTab ? await read(input.companyTab) : [] }];
    const src = await node('Build Exclusions2 Sources', [{}], { 'Get Enrichment Project2': [input.project] });
    const col = await node('Build Exclusions2 Collect', [{}], { 'Build Exclusions2 Sources': src, 'Read Company Data for Scoped Enrichment2': companies });
    const req = await node('Prepare DiscoGen Request2', col, { 'Normalize Enrichment Project2': norm, 'Read Contacts for Persona IDs2': contacts, 'Read Final Direct2': direct, 'Read Final Generic2': generic });
    return { norm: norm[0], req: req[0] };
  }, { timeoutMs: 10 * 60_000 });

  const r = prep.req;
  const endpoint = String(r.requestEndpoint ?? '') as 'process' | 'process-personas';
  if (!['process', 'process-personas'].includes(endpoint)) throw new PermanentError(`Enrichment: unexpected DiscoGen endpoint "${endpoint}"`);
  const entities = (r.request?.domains ?? r.request?.persona_ids ?? []).length;
  if (ctx.dryRun) return { dryRun: true, plan: { endpoint, entities, variables: prep.norm.variables }, wouldSpendCredits: { discolike: `${entities} DiscoGen ${endpoint === 'process' ? 'companies' : 'people'}` }, message: `dry run: would research ${entities} ${endpoint === 'process' ? 'companies' : 'people'} with DiscoGen` };

  const disco = createDiscoLikeClient({ apiKey: ctx.cfg.discoLikeApiKey, baseUrl: ctx.cfg.discoLikeBaseUrl });
  const task = await ctx.step('submit', () => ctx.paid({
    scope: 'record', provider: 'discolike', callKey: `discogen:${endpoint}:${createHash('sha256').update(JSON.stringify(r.request)).digest('hex').slice(0, 16)}`, units: entities,
    run: async () => (await node('Capture Enrichment Task2', [await disco.discoGenSubmit(endpoint, r.request)]))[0].taskId as string,
    dryRunResult: () => '',
  }));
  const status = await ctx.step('poll', async () => {
    const answer = await disco.discoGenStatus(task);
    let checked: Items;
    try { checked = await runNode(R['Check Enrichment Status2'], [answer]); } catch (e) { throw new NeedsReviewError(`${String((e as Error).message)} (task ${task}; not resubmitted)`); }
    if (checked[0]?.isComplete !== true) {
      if (Date.parse(startedAt) + MAX_WAIT_MS < Date.now()) throw new NeedsReviewError(`DiscoGen task ${task} still running after 6 hours`);
      throw new WaitError(`DiscoGen enrichment task ${task}: ${String(answer?.status ?? answer?.data?.status ?? 'running')}`, POLL_MS);
    }
    return checked[0];
  }, { timeoutMs: 10 * 60_000 });

  const built = await ctx.step('build', async () => {
    try { return (await runNode(R['Build Enriched Sheet Values2'], [wrapBareResults(status, r)], { 'Prepare DiscoGen Request2': [r] }))[0]; }
    catch (e) { throw new PermanentError(`Enrichment: ${String((e as Error).message ?? e)}${resultSample(status)} (task ${task}; not resubmitted)`); }
  }, { timeoutMs: 10 * 60_000 });
  fillFallbacks(built, String(input.project.fields?.['Custom Variables Requested'] ?? ''), prep.norm.variables ?? []);

  const ensured = await ctx.step('write', async () => {
    const sheetId = built.sheetId as string;
    // Same stale-data check as n8n: the tabs must still be what was read at the start.
    const props = (await sheets.meta(sheetId)).sheets;
    const meta = { sheets: await Promise.all(['Final Direct', 'Final Generic'].map(async (title) => {
      const p = props.find((x) => x.properties.title === title);
      if (!p) return { properties: { title: `missing:${title}` } };
      const rows = (await sheets.tab(sheetId, title)).map((row) => row.slice(0, 30));
      return { properties: p.properties, data: [{ rowData: rows.map((row) => ({ values: row.map((v) => ({ effectiveValue: { stringValue: v } })) })) }] };
    })) };
    const ens = (await node('Ensure Final Tabs Capacity2', [meta], { 'Build Enriched Sheet Values2': [built] }))[0];
    await sheets.batchUpdate(sheetId, ens.requests ?? []);
    for (const tab of ens.writeTabs as string[]) {
      const values = (ens.tabValues[tab] as unknown[][]).map((row) => row.map((v) => (typeof v === 'number' ? v : String(v ?? ''))));
      await sheets.clearTab(sheetId, tab);
      for (let i = 0; i < values.length; i += 500) await sheets.writeRows(sheetId, tab, i + 1, values.slice(i, i + 500));
    }
    return ens;
  }, { timeoutMs: 15 * 60_000 });

  const fields = await ctx.step('airtable-fields', async () => {
    const upd = await node('Prepare Enrichment Complete Update2', [{}], { 'Ensure Final Tabs Capacity2': [ensured], 'Mark Enrichment Running2': [{ fields: { 'Processing Started At': startedAt } }] }, { $execution: { id: `engine-job-${ctx.job.id}` } });
    return toFieldIds(upd[0]?.body?.fields ?? {});
  });
  return { dryRun: false, enrichment: { endpoint, entities, matched: ensured.matchedResults, stillMissing: ensured.missing, wroteTabs: ensured.writeTabs, taskId: task }, airtableFields: fields, message: String(fields[BY_NAME['Last Workflow Message']] ?? 'Enrichment complete.') };
};

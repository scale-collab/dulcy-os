// leadlist.filters: "Generate filters" (the old n8n branch, run unchanged).
//   1. Validate Action Request2 + Normalize Lead List2 on the list record (by field name);
//   2. dry-run stops here (it would spend 20 DiscoLike records and one AI call);
//   3. DiscoLike ICP analysis: discover?icp_prompt=<targeting sentence>&relevance=BALANCED&max_records=20;
//   4. Prepare AI Keyword Review2 builds the prompt (list + client context + DiscoLike evidence);
//   5. ONE OpenAI call (n8n's model: gpt-5.6, single message, plain text back);
//   6. Apply AI Keyword Review2 + Generate Visible Search Plan2 build the plan and the exact
//      Airtable update n8n saved.
// Paid calls are per-press receipts: a retry of the same press never pays twice, and pressing
// Generate again gives a fresh plan (as in n8n).
// Not ported: the prior-review feedback (n8n read its own "AI Company Review"/"Expanded
// Companies" tabs, which engine lists do not have) and the client exclusion refresh (the
// generated plan never stored exclusion IDs in n8n either; they are added when the list runs).
import { createHash } from 'node:crypto';
import type { Stage } from './index.js';
import { PermanentError } from '../errors.js';
import { createDiscoLikeClient } from '../providers/discolike.js';
import { createOpenAIClient } from '../providers/openai.js';
import { FILTERGEN_NODES as N } from '../leadlist/legacy/filtergenNodes.js';
import { runNode, type Items } from '../leadlist/legacy/runNode.js';

interface FilterInput { record: { id: string; fields: Record<string, unknown> }; client: { id: string; fields: Record<string, unknown> }; action?: string }

const hash = (v: unknown) => createHash('sha256').update(JSON.stringify(v)).digest('hex').slice(0, 16);
const legacy = async (name: string, input: Items, earlier: Record<string, Items> = {}) => {
  try { return await runNode(N[name], input, earlier); } catch (e) { throw new PermanentError(String((e as Error).message ?? e)); }
};

export const filterGenerateStage: Stage = async (ctx) => {
  const input = ctx.job.input as unknown as FilterInput;
  if (!input?.record?.id || !input.record.fields) throw new PermanentError('input.record (the Lead List record by field name) is required');
  const action = input.action ?? 'Generate Filters';

  const start = await ctx.step('normalize', async () => {
    const v = await legacy('Validate Action Request2', [{ body: { recordId: input.record.id, action } }]);
    if (!v.length) throw new PermanentError('the old validator stopped this request quietly');
    const norm = await legacy('Normalize Lead List2', [input.record], { 'Validate Action Request2': v });
    const url = await legacy('Build DiscoLike ICP Analysis URL2', [{}], { 'Normalize Lead List2': norm });
    return { v, norm, icpPrompt: new URL(url[0].discoUrl).searchParams.get('icp_prompt') ?? '' };
  });

  if (ctx.dryRun) {
    return { dryRun: true, plan: { icpPrompt: start.icpPrompt }, wouldSpendCredits: { discolike: 20, openai: 1 }, message: 'dry run: would analyse 20 DiscoLike companies and make one AI call' };
  }

  const disco = createDiscoLikeClient({ apiKey: ctx.cfg.discoLikeApiKey, baseUrl: ctx.cfg.discoLikeBaseUrl });
  const rows = await ctx.step('icp-analysis', () => ctx.paid({
    provider: 'discolike', callKey: `filters-icp:${hash(start.icpPrompt)}`, units: 20,
    run: () => disco.discover({ icp_prompt: start.icpPrompt, relevance: 'BALANCED' } as any, 20),
    dryRunResult: () => [],
  }));
  if (!rows.length) throw new PermanentError('DiscoLike returned no companies for this targeting sentence. Refine the targeting sentence and generate again.');

  const prep = await ctx.step('prepare-review', () => legacy('Prepare AI Keyword Review2', rows, { 'Get Linked Client2': [input.client], 'Normalize Lead List2': start.norm }));
  const prompt = String(prep[0]?.keywordReviewPrompt ?? '');
  if (!prompt) throw new PermanentError('the keyword review prompt came out empty');

  const ai = createOpenAIClient({ apiKey: ctx.cfg.openAiApiKey, model: ctx.cfg.openAiFilterModel, baseUrl: ctx.cfg.openAiBaseUrl });
  const reply = await ctx.step('ai-review', () => ctx.paid({
    provider: 'openai', callKey: 'filters-review', units: 1,
    run: async () => ({ text: await ai.text(prompt, ctx.cfg.openAiFilterModel) }),
    dryRunResult: () => ({ text: '' }),
  }));

  const plan = await ctx.step('build-plan', async () => {
    const applied = await legacy('Apply AI Keyword Review2', [reply], { 'Prepare AI Keyword Review2': prep });
    const gen = await legacy('Generate Visible Search Plan2', applied, { 'Normalize Lead List2': start.norm });
    const g = gen[0] ?? {};
    // n8n also cleared its own Automation Action here; the engine never touches n8n's field.
    const fields = { ...(g.airtableBody?.fields ?? {}) };
    delete fields.fldhViG7kJ5rKEaa4;
    return { filters: g.filters, summary: String(g.summary ?? ''), airtableFields: fields, keywords: g.homepageKeywords ?? '', employeeRange: g.employeeRange ?? '' };
  });

  return { dryRun: false, filters: plan.filters, airtableFields: plan.airtableFields, discoLikeCompanies: rows.length, message: plan.summary || 'search plan generated; review it before running the first 100 companies' };
};

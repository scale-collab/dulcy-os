// leadlist.filters: "Generate filters" (the old n8n branch, plus Alex's 2026-11-23 rules for
// every niche, all inside the one press, never a hard lock).
//   1. Validate Action Request2 + Normalize Lead List2 on the list record (by field name); the
//      sentence's country/state, employee range (snapped) and explicit B2B are read by the copied
//      plan code;
//   2. dry run stops here: it reports the plan and the size goal and spends nothing;
//   3. ONE paid lookalike pull of N companies (default 500, max 1000) with only: icp_text (the
//      positive targeting sentence), example domains, country/state, employee_range,
//      business_model, exclude_leadgen;
//   4. the top 50 by similarity go to the copied AI keyword review (same shape as n8n's 20);
//   5. ONE OpenAI call; Apply AI Keyword Review2 + Generate Visible Search Plan2 build the plan;
//   6. labels only when they fit: industry / sub-industry filters only for labels on 60%+ of the
//      N companies, either/or; none fits = no label filter (filterSizing.ts);
//   7. soft size goal + auto-widen with the FREE count (max 5 extra counts), never geography.
// Paid calls are per-press receipts: a retry of the same press never pays twice, and pressing
// Generate again gives a fresh plan (as in n8n).
// Not ported: the prior-review feedback (n8n read its own "AI Company Review"/"Expanded
// Companies" tabs, which engine lists do not have) and the client exclusion refresh (the
// generated plan never stored exclusion IDs in n8n either; they are added when the list runs).
import { createHash } from 'node:crypto';
import type { Stage } from './index.js';
import { PermanentError, WaitError } from '../errors.js';
import { createDiscoLikeClient } from '../providers/discolike.js';
import { createOpenAIClient } from '../providers/openai.js';
import { FILTERGEN_NODES as N } from '../leadlist/legacy/filtergenNodes.js';
import { runNode, type Items } from '../leadlist/legacy/runNode.js';
import type { Filters } from '../leadlist/filters.js';
import { MAX_WIDEN_COUNTS, PROBE_RECORDS, WIDEN_STEPS, probeDepth, applyLabels, applyModelsAndExamples, modelsLines, goalText, labelCoverage, labelsLines, sizingLines, type Sizing } from '../leadlist/filterSizing.js';

interface LeadGoalIn { value?: number; source?: string; inboxes?: number; perDay?: number; campaigns?: string[] }
interface FilterInput {
  record: { id: string; fields: Record<string, unknown> }; client: { id: string; fields: Record<string, unknown> }; action?: string;
  /** Soft goal: a number, or the bridge's {value, source:'campaign', inboxes, perDay}. Default: cfg.defaultLeadGoal. */
  leadGoal?: number | LeadGoalIn;
  filterAnalysisCompanies?: number; leadsPerCompany?: number; countYield?: number;
}

/** Companies the AI keyword review sees (n8n saw 20; its prompt uses the first 10 and the top 20 keywords). */
const REVIEW_COMPANIES = 50;
const hash = (v: unknown) => createHash('sha256').update(JSON.stringify(v)).digest('hex').slice(0, 16);
const legacy = async (name: string, input: Items, earlier: Record<string, Items> = {}) => {
  try { return await runNode(N[name], input, earlier); } catch (e) { throw new PermanentError(String((e as Error).message ?? e)); }
};
const TAXONOMY: string[] = (() => {
  const m = /const NATIVE_SUBINDUSTRIES = (\[[^\]]*\]);/.exec(N['Generate Visible Search Plan2']);
  return m ? JSON.parse(m[1]) : [];
})();
const present = (v: unknown) => v !== undefined && v !== null && v !== '' && (!Array.isArray(v) || v.length > 0);
const similarity = (r: any) => { const s = Number(r?.similarity ?? r?.similarity_score); return Number.isFinite(s) ? (s > 1 ? s / 100 : s) : -1; };
const fmt = (x: number) => Math.round(x).toLocaleString('en-US');

/** The positive part of the targeting sentence (as the copied Apply node builds it). */
function positiveTarget(icp: string): string {
  return icp.split(/\b(?:exclude|excluding|do not include|avoid|the goal is|our goal is|in order to)\b/i)[0]
    .replace(/^(?:we\s+(?:are|'re)\s+)?(?:targeting|looking\s+for|seeking)\s+/i, '').trim().replace(/[,:;.-]+$/, '');
}

export const filterGenerateStage: Stage = async (ctx) => {
  const input = ctx.job.input as unknown as FilterInput;
  if (!input?.record?.id || !input.record.fields) throw new PermanentError('input.record (the Lead List record by field name) is required');
  const action = input.action ?? 'Generate Filters';
  const companiesToPull = Math.min(1000, Math.max(20, Math.round(Number(input.filterAnalysisCompanies ?? ctx.cfg.filterAnalysisCompanies) || 500)));
  const lpc = Number(input.leadsPerCompany ?? ctx.cfg.leadsPerCompany) > 0 ? Number(input.leadsPerCompany ?? ctx.cfg.leadsPerCompany) : 0.4;
  const yieldShare = Number(input.countYield ?? ctx.cfg.countYield) > 0 ? Number(input.countYield ?? ctx.cfg.countYield) : 0.6;
  const g = typeof input.leadGoal === 'number' ? { value: input.leadGoal, source: 'input' } as LeadGoalIn : input.leadGoal;
  const fromInput = Number(g?.value) > 0;
  const goal = {
    leadGoal: fromInput ? Math.round(Number(g!.value)) : ctx.cfg.defaultLeadGoal,
    source: fromInput ? String(g!.source ?? 'input') : 'default',
    sourceNote: fromInput && g!.source === 'campaign' && g!.inboxes
      ? `from the linked campaign: ${g!.inboxes} inboxes, ${fmt(Number(g!.perDay ?? 0))} a day x 14 days ÷ 3 steps`
      : fromInput ? 'set on this press' : 'default',
  };
  const companiesNeeded = Math.ceil(goal.leadGoal / lpc);

  const start = await ctx.step('normalize', async () => {
    const v = await legacy('Validate Action Request2', [{ body: { recordId: input.record.id, action } }]);
    if (!v.length) throw new PermanentError('the old validator stopped this request quietly');
    const norm = await legacy('Normalize Lead List2', [input.record], { 'Validate Action Request2': v });
    const url = await legacy('Build DiscoLike ICP Analysis URL2', [{}], { 'Normalize Lead List2': norm });
    const icpPrompt = new URL(url[0].discoUrl).searchParams.get('icp_prompt') ?? '';
    // The sentence's own hard settings (country/state, snapped employee range, explicit B2B),
    // read by the copied plan code itself so the rules stay the same.
    let hard: Filters = {};
    try {
      const pre = await legacy('Generate Visible Search Plan2', [{ discoRows: [{ domain: 'analysis.invalid' }], lookalikeText: icpPrompt, reviewedKeywords: [], nativeReview: {} }], { 'Normalize Lead List2': norm });
      hard = pre[0]?.filters ?? {};
    } catch { /* the full plan reports any problem later */ }
    const saved = norm[0]?.filters ?? {};
    const params: Filters = { icp_text: positiveTarget(icpPrompt) || icpPrompt };
    if (present(saved.domain)) params.domain = saved.domain;
    for (const k of ['country', 'state', 'employee_range', 'business_model']) if (present(hard[k])) params[k] = hard[k];
    params.exclude_leadgen = true;
    return { v, norm, icpPrompt, analysis: params };
  });

  if (ctx.dryRun) {
    return {
      dryRun: true, plan: { icpPrompt: start.icpPrompt, analysis: { companies: companiesToPull, filters: start.analysis } },
      sizing: { ...goal, leadsPerCompany: lpc, countYield: yieldShare, companiesNeeded },
      wouldSpendCredits: { discolike: companiesToPull, openai: 1 },
      message: `dry run: would pull ${fmt(companiesToPull)} lookalike companies for the label analysis and make one AI call. ${goalText({ ...goal, companiesNeeded })}`,
    };
  }

  const disco = createDiscoLikeClient({ apiKey: ctx.cfg.discoLikeApiKey, baseUrl: ctx.cfg.discoLikeBaseUrl });
  const pulled = await ctx.step('lookalike-analysis', () => ctx.paid({
    provider: 'discolike', callKey: `filters-lookalike:${hash(start.analysis)}:${companiesToPull}`, units: companiesToPull,
    run: () => disco.discover(start.analysis, companiesToPull),
    dryRunResult: () => [],
  }), { timeoutMs: 5 * 60_000 });
  if (!pulled.length) throw new PermanentError('DiscoLike returned no companies for this targeting sentence. Refine the targeting sentence and generate again.');
  // Most similar first (stable); the AI review gets the top 50.
  const rows = pulled.map((r: any, i: number) => ({ r, i })).sort((a: any, b: any) => similarity(b.r) - similarity(a.r) || a.i - b.i).map((x: any) => x.r);
  const reviewRows = rows.slice(0, REVIEW_COMPANIES);

  const prep = await ctx.step('prepare-review', () => legacy('Prepare AI Keyword Review2', reviewRows, { 'Get Linked Client2': [input.client], 'Normalize Lead List2': start.norm }));
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
    const g0 = gen[0] ?? {};
    // n8n also cleared its own Automation Action here; the engine never touches n8n's field.
    const fields = { ...(g0.airtableBody?.fields ?? {}) };
    delete fields.fldhViG7kJ5rKEaa4;
    // Labels only when they fit (coverage over ALL pulled companies, not the review subset).
    const crossIndustry = applied[0]?.crossIndustry === true;
    const cov = labelCoverage(rows, TAXONOMY);
    const labels = applyLabels(g0.filters ?? {}, cov, { crossIndustry });
    const me = applyModelsAndExamples(labels.filters, rows, {
      used: labels.used, taxonomy: TAXONOMY,
      explicitModels: Array.isArray(start.analysis.business_model) ? start.analysis.business_model as string[] : [],
      savedDomains: Array.isArray(start.analysis.domain) ? start.analysis.domain as string[] : [],
    });
    const modelsNote = modelsLines(Array.isArray(me.filters.business_model) ? me.filters.business_model as string[] : [], me.droppedModels, me.examplesNote);
    return { filters: me.filters, modelsNote, summary: String(g0.summary ?? ''), airtableFields: fields, used: labels.used, skipped: labels.skipped, heldBack: labels.heldBack, broaderCategories: labels.broaderCategories, total: cov.total, crossIndustry };
  });

  // Soft size goal and auto-widen with the FREE count. Never fails the press.
  const sized = await ctx.step('sizing', async () => {
    const counts: Sizing['counts'] = [];
    const s: Sizing = { ...goal, leadsPerCompany: lpc, countYield: yieldShare, companiesNeeded, freeCount: null, expectedReal: null, enough: null, widened: [], counts, findable: null };
    let filters: Filters = plan.filters;
    const count = async (f: Filters): Promise<number | null | 'error'> => {
      try { const c = await disco.count(f); return c ? c.count : null; } catch (e) { if (e instanceof WaitError) throw e; s.note = `Free count failed (${String((e as Error).message ?? e).slice(0, 120)}), so the size was not checked further.`; return 'error'; }
    };
    // Real search depth (Alex, 2026-11-24): the free count cannot use the targeting text, so it
    // overstates (pet e-com: 23,065 counted, ~2,000 reachable). Probe the plan as Expand will run
    // it at most (MAX_COVERAGE), one company per call, only when the count alone looks big enough.
    const depth = async (f: Filters): Promise<{ depth: number; capped: boolean } | null> => {
      if (!present(f.icp_text) && !present(f.domain)) return null; // pure filter search: the count is exact
      const probe: Filters = { ...f, relevance: 'MAX_COVERAGE' };
      try {
        const r = await probeDepth(async (offset) => (await ctx.paid({
          provider: 'discolike', callKey: `filters-depth:${hash(probe)}:${offset}`, units: PROBE_RECORDS,
          run: () => disco.discover({ ...probe, offset }, PROBE_RECORDS), dryRunResult: () => [],
        })).length > 0);
        return { depth: r.depth, capped: r.capped };
      } catch (e) { if (e instanceof WaitError) throw e; s.note = `Search-depth check failed (${String((e as Error).message ?? e).slice(0, 120)}); the size uses the free count only.`; return null; }
    };
    const set = async (c: number, f: Filters, step: string) => {
      const byCount = Math.round(c * yieldShare);
      const d = byCount >= companiesNeeded ? await depth(f) : null; // short on the count already: no need to pay to check
      s.freeCount = c; s.findable = d ? d.depth : null; s.findableCapped = d?.capped ?? false;
      s.expectedReal = d && !d.capped ? Math.min(byCount, d.depth) : byCount;
      s.enough = s.expectedReal >= companiesNeeded;
      counts.push({ step, freeCount: c, findable: s.findable });
    };
    const first = await count(filters);
    if (first === null) { s.note = 'Free count not possible for this plan (nothing countable), so the size was not checked.'; return { s, filters }; }
    if (first === 'error') return { s, filters };
    await set(first, filters, 'plan');
    let extra = 0;
    for (const step of WIDEN_STEPS) {
      if (s.enough || extra >= MAX_WIDEN_COUNTS) break;
      const w = step.apply(filters, { broaderCategories: plan.broaderCategories });
      if (!w) continue;
      extra++;
      const c = await count(w.filters);
      if (c === 'error' || c === null) break; // keep the last counted plan
      filters = w.filters; s.widened.push(w.note);
      await set(c, filters, w.note);
    }
    return { s, filters };
  });

  const f = sized.filters;
  const keywords: string[] = Array.isArray(f.phrase_match) ? f.phrase_match.map(String) : [];
  const catCount = Array.isArray(f.category) ? f.category.length : 0;
  const subCount = Array.isArray(f.sub_industry) ? f.sub_industry.length : 0;
  const legacyText = String(plan.summary ?? '');
  const cand = legacyText.match(/generated (\d+) keyword candidates/)?.[1];
  const planBits = [
    subCount ? `${subCount} sub-industr${subCount === 1 ? 'y' : 'ies'}` : '',
    catCount ? `${catCount} industr${catCount === 1 ? 'y' : 'ies'}` : '',
    `${keywords.length} homepage keyword${keywords.length === 1 ? '' : 's'}${cand ? ` (from ${cand} candidates)` : ''}`,
    `${Array.isArray(f.domain) ? f.domain.length : 0} example site${Array.isArray(f.domain) && f.domain.length === 1 ? '' : 's'}`,
    `employees ${String(f.employee_range ?? 'any').replace(',', '-')}`,
  ].filter(Boolean).join(' · ');
  const summary = [
    ...sizingLines(sized.s),
    ...labelsLines(plan.used, plan.skipped, plan.total, plan.crossIndustry, plan.heldBack),
    'Search plan', ...plan.modelsNote, `• ${planBits}`,
    'Next: review the plan, then run the first 100 companies.',
  ].join('\n');
  const airtableFields = {
    ...plan.airtableFields,
    fldC2hZQ3gSqLmi1y: JSON.stringify(f, null, 2),
    fldG2MXz5lccu7KKU: String(f.employee_range ?? ''),
    fldydpLzUzAJGLBBJ: keywords.join(', '),
    fldVnH7Pn1PxlZI5b: summary,
  };
  const pct = (x: { label: string; share: number; kind: string }) => ({ label: x.label, kind: x.kind, coverage: Math.round(x.share * 1000) / 10 });
  return {
    dryRun: false, filters: f, airtableFields, discoLikeCompanies: pulled.length, reviewedCompanies: reviewRows.length,
    labels: { used: plan.used.map(pct), heldBack: plan.heldBack.map(pct), skipped: plan.skipped.map(pct), companies: plan.total, minCoverage: 60 },
    sizing: { leadGoal: sized.s.leadGoal, source: sized.s.source, companiesNeeded, freeCount: sized.s.freeCount, findable: sized.s.findable ?? null, findableCapped: sized.s.findableCapped ?? false, expectedReal: sized.s.expectedReal, enough: sized.s.enough, widened: sized.s.widened, counts: sized.s.counts, leadsPerCompany: lpc, countYield: yieldShare },
    message: summary || 'search plan generated; review it before running the first 100 companies',
  };
};

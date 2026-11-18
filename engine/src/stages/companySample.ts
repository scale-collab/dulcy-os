// leadlist.sample: the company sample for a lead list (old "Run Company Sample").
//  1. the approved DiscoLike filters, checked with the old workflow's rules;
//  2. a FREE count of matching companies (runs in dry-run too);
//  3. dry-run stops here with the plan (how many match, what the sample would spend);
//  4. live: ONE paid search for up to 100 companies, with a receipt per record and filters
//     (a re-run never pays again);
//  5. the fit check in code (no LLM): drop only obvious bad fits, with reasons, then the
//     sample gate (usable ≥ 80% Passed, ≥ 70% Needs Review, else Failed).
// Shadow mode: nothing is written to Airtable or Sheets yet.
import { createHash } from 'node:crypto';
import type { Stage } from './index.js';
import { PermanentError } from '../errors.js';
import { createDiscoLikeClient } from '../providers/discolike.js';
import { approvedFilters, type Filters } from '../leadlist/filters.js';
import { toCompany } from '../leadlist/companies.js';
import { checkCompanyFit, summarizeSample, type FitCriteria } from '../leadlist/fit.js';

interface SampleInput { filters: Filters; fit?: FitCriteria; sampleSize?: number }

export const companySampleStage: Stage = async (ctx) => {
  const input = ctx.job.input as unknown as SampleInput;
  const size = Math.min(100, Math.max(5, Number(input.sampleSize ?? 100)));
  const disco = createDiscoLikeClient({ apiKey: ctx.cfg.discoLikeApiKey, baseUrl: ctx.cfg.discoLikeBaseUrl });

  const plan = await ctx.step('filters', async () => {
    const filters = approvedFilters(input.filters);
    const hash = createHash('sha256').update(JSON.stringify(Object.entries(filters).sort())).digest('hex').slice(0, 12);
    return { filters, hash };
  });

  const matching = await ctx.step('count', async () => disco.count(plan.filters));
  if (matching === 0) throw new PermanentError('no companies match these DiscoLike filters; widen the search plan');
  const records = Math.min(size, matching);

  if (ctx.dryRun) {
    return { dryRun: true, matching, plan: { sampleRecords: records, filters: plan.filters }, wouldSpendCredits: { discolike: records }, message: `${matching} companies match; the sample would pull ${records}` };
  }

  const rows = await ctx.step('sample', () => ctx.paid({
    scope: 'record', provider: 'discolike', callKey: `sample:${plan.hash}:${records}`, units: records,
    run: () => disco.discover(plan.filters, records),
    dryRunResult: () => [],
  }), { timeoutMs: 5 * 60_000 });

  const review = await ctx.step('fit', async () => {
    const companies = rows.map(toCompany).filter((c) => c.domain);
    const seen = new Set<string>();
    const unique = companies.filter((c) => (seen.has(c.domain) ? false : (seen.add(c.domain), true)));
    const results = unique.map((c) => checkCompanyFit(c, input.fit ?? {}));
    const summary = summarizeSample(results);
    const reasons: Record<string, number> = {};
    for (const r of results) for (const why of r.reasons) { const k = why.replace(/\d+/g, 'N'); reasons[k] = (reasons[k] ?? 0) + 1; }
    return {
      summary,
      returned: rows.length,
      noDomain: rows.length - companies.length,
      duplicates: companies.length - unique.length,
      topDropReasons: Object.entries(reasons).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([reason, n]) => ({ reason, companies: n })),
      dropped: results.filter((r) => r.decision === 'drop').map((r) => ({ domain: r.domain, reasons: r.reasons })),
      kept: results.filter((r) => r.decision !== 'drop').map((r) => ({ domain: r.domain, decision: r.decision, signals: r.signals })),
    };
  });

  const s = review.summary;
  return {
    dryRun: false,
    matching,
    sample: { pulled: review.returned, reviewed: s.reviewed, fit: s.fit, maybe: s.maybe, drop: s.drop, usableRate: s.usableRate, status: s.status },
    topDropReasons: review.topDropReasons,
    dropped: review.dropped,
    kept: review.kept,
    message: `sample ${s.status}: ${s.fit + s.maybe} of ${s.reviewed} usable (${Math.round(s.usableRate * 100)}%), ${s.drop} dropped; ${matching} companies match in total`,
  };
};

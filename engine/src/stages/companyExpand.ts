// leadlist.expand: grow an approved sample into the full company list (old "Expand Companies").
//  - only after the sample is approved (Airtable's approval checkbox; `sampleApproved` for now);
//  - batches of up to 2,500 from DiscoLike, offset 0, with a ROLLING exclusion list of every
//    domain the list already has (plus client exclusions), so no company is pulled twice;
//  - each batch: one paid search with a receipt (a retry never pays again), the fit check →
//    Tier 1 / Tier 2 / Cut, saved to the engine's master copy, then written to the list's
//    Google Sheet in one write at a fixed place (never read back);
//  - stops at the target number of USABLE companies (Tier 1 + Tier 2), or when DiscoLike runs
//    out (shortfall reported), or at the batch limit. Target is clamped to 100-100,000.
import { createHash } from 'node:crypto';
import type { Stage } from './index.js';
import { PermanentError } from '../errors.js';
import { createDiscoLikeClient } from '../providers/discolike.js';
import { createSheetsClient } from '../providers/google.js';
import { approvedFilters, type Filters } from '../leadlist/filters.js';
import { toCompany } from '../leadlist/companies.js';
import { checkCompanyFit, normDomain, type FitCriteria } from '../leadlist/fit.js';
import { ensureCompanySheet, listCounts, listDomains, maxBatch, mirrorCompanies, saveCompanies } from '../leadlist/store.js';
import { profileCriteria } from '../leadlist/profile.js';
import { buildProfile, loadProfile, sampleStats } from '../leadlist/profileStore.js';

interface ExpandInput {
  filters: Filters;
  fit?: FitCriteria;
  targeting?: string; thesis?: string; clientContext?: string;
  /** Usable companies (Tier 1 + Tier 2) wanted in the list. */
  target: number;
  batchSize?: number;
  sampleApproved?: boolean;
  /** Client do-not-contact / prior campaign domains, never pulled. */
  excludedDomains?: string[];
  /** The list's sheet; without one the engine creates a new sheet. */
  sheet?: { sheetId?: string; title?: string; tab?: string };
  name?: string;
}

const MAX_PRIOR_DOMAINS = 100_000;

export const companyExpandStage: Stage = async (ctx) => {
  const input = ctx.job.input as unknown as ExpandInput;
  const listId = ctx.job.record_id;
  if (input.sampleApproved !== true) throw new PermanentError('the company sample is not approved yet; approve it before expanding');
  const target = Math.min(100_000, Math.max(100, Math.round(Number(input.target) || 0)));
  const batchSize = Math.min(2500, Math.max(5, Math.round(Number(input.batchSize ?? 2500))));
  const disco = createDiscoLikeClient({ apiKey: ctx.cfg.discoLikeApiKey, baseUrl: ctx.cfg.discoLikeBaseUrl, timeoutMs: 10 * 60_000 });
  const sheets = createSheetsClient({ keyFile: ctx.cfg.googleKeyFile, impersonate: ctx.cfg.googleImpersonateUser, scope: ctx.cfg.googleScope, sheetsBaseUrl: ctx.cfg.googleSheetsBaseUrl });

  const plan = await ctx.step('filters', async () => {
    const filters = approvedFilters(input.filters);
    const hash = createHash('sha256').update(JSON.stringify(Object.entries(filters).sort())).digest('hex').slice(0, 12);
    return { filters, hash };
  });
  const start = await ctx.step('start', async () => ({ startBatch: (await maxBatch(ctx.db, listId)) + 1 }));
  const before = await listCounts(ctx.db, listId);
  if (before.total === 0) throw new PermanentError('this list has no saved sample; run the company sample first');
  // The list's profile from the sample (built now from the saved sample if an older sample has none).
  const profile = (await loadProfile(ctx, listId))?.profile ?? await ctx.step('profile', async () => {
    const sample = (await ctx.db.query(`SELECT data FROM lead_companies WHERE list_id=$1 AND batch=0`, [listId])).rows.map((r) => r.data);
    return buildProfile(ctx, listId, { thesis: input.thesis, targeting: input.targeting, clientContext: input.clientContext }, plan.filters, sampleStats(sample));
  });
  const excluded = (input.excludedDomains ?? []).map(normDomain).filter(Boolean);
  const criteria = { ...profileCriteria(profile, plan.filters, excluded), ...(input.fit ?? {}) };

  if (ctx.dryRun) {
    const need = Math.max(0, target - before.usable);
    const est = Math.ceil((need / Math.max(0.5, before.usableRate || 0.9)) * 1.05);
    return { dryRun: true, target, have: before, plan: { nextBatch: Math.min(batchSize, Math.max(5, est)), batchSize }, wouldSpendCredits: { discolike: need ? `about ${est} (stops at the target)` : 0 }, message: need ? `${before.usable} usable now; needs about ${need} more usable companies` : `already at the target (${before.usable} usable)` };
  }

  const sheet = await ctx.step('sheet', () => ensureCompanySheet(ctx.db, sheets, listId, { sheetId: input.sheet?.sheetId, title: input.sheet?.title ?? `${input.name ?? listId} - companies (engine)`, tab: input.sheet?.tab }));
  await ctx.step('mirror-sample', () => mirrorCompanies(ctx.db, sheets, listId));

  const maxBatches = Math.min(100, Math.ceil(target / batchSize) * 2 + 2);
  let stop: 'target' | 'exhausted' | 'batch-limit' = 'batch-limit';
  const batches: Array<Record<string, number>> = [];
  for (let i = 0; i < maxBatches; i++) {
    const now = await listCounts(ctx.db, listId);
    if (now.usable >= target) { stop = 'target'; break; }
    const b = start.startBatch + i;
    const out = await ctx.step(`batch-${b}`, async () => {
      const have = await listCounts(ctx.db, listId);
      // Ask for enough that the expected cuts still leave the shortfall covered (+5%), so the
      // list doesn't creep to the target in many tiny batches. Rate floor 50%.
      const rate = Math.max(0.5, have.usableRate || 0.9);
      const want = Math.min(batchSize, Math.max(5, Math.ceil(((target - have.usable) / rate) * 1.05)));
      const prior = [...new Set([...(await listDomains(ctx.db, listId)), ...excluded])];
      if (prior.length > MAX_PRIOR_DOMAINS) throw new PermanentError(`the list already has ${prior.length} domains to exclude (limit ${MAX_PRIOR_DOMAINS})`);
      const queryId = await disco.exclusionList(`Lead List ${listId} expansion batch ${b}`, prior, ['lead-list-expansion', listId]);
      const filters = { ...plan.filters, exclusion_query_id: [...new Set([...((plan.filters.exclusion_query_id as string[] | undefined) ?? []), queryId])] };
      const rows = await ctx.paid({
        scope: 'record', provider: 'discolike', callKey: `expand:${plan.hash}:${b}`, units: want,
        run: () => disco.discover(filters, want),
        dryRunResult: () => [],
      });
      const companies = rows.map(toCompany).filter((c) => c.domain);
      const saved = await saveCompanies(ctx.db, listId, b, companies.map((company) => ({ company, fit: checkCompanyFit(company, criteria) })));
      return { batch: b, requested: want, pulled: rows.length, new: saved.inserted, alreadyInList: companies.length - saved.inserted, tier1: saved.tier1, tier2: saved.tier2, cut: saved.cut };
    }, { timeoutMs: 15 * 60_000 });
    batches.push(out);
    await ctx.step(`mirror-${b}`, () => mirrorCompanies(ctx.db, sheets, listId));
    if (out.pulled < out.requested || out.new === 0) { stop = 'exhausted'; break; }
  }

  // Catch-up write: covers a batch saved just before a crash, whatever path a retry took.
  await ctx.step('mirror-final', () => mirrorCompanies(ctx.db, sheets, listId));
  const after = await listCounts(ctx.db, listId);
  const shortfall = Math.max(0, target - after.usable);
  const status = after.usableRate >= 0.8 ? 'Passed' : after.usableRate >= 0.7 ? 'Needs Review' : 'Failed';
  return {
    dryRun: false,
    target,
    list: { ...after, status },
    added: { companies: after.total - before.total, usable: after.usable - before.usable },
    batches,
    stoppedBecause: stop,
    shortfall,
    sheet: { url: `https://docs.google.com/spreadsheets/d/${sheet.sheetId}`, tab: sheet.tab },
    message: `${after.usable} usable of ${after.total} companies (Tier 1 ${after.tier1}, Tier 2 ${after.tier2}, Cut ${after.cut}; ${Math.round(after.usableRate * 100)}% usable, ${status})${shortfall ? `; ${shortfall} short of the ${target} target (${stop})` : ''}`,
  };
};

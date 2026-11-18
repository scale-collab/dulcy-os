// leadlist.refit: re-check every company already saved for a list with its current profile
// (free: no DiscoLike search). Optionally rebuilds the profile first (one AI call), e.g. after
// the thesis or client context changed. The sheet is rewritten in place (same rows).
import type { Stage } from './index.js';
import { PermanentError } from '../errors.js';
import { createSheetsClient } from '../providers/google.js';
import { approvedFilters, type Filters } from '../leadlist/filters.js';
import { checkCompanyFit, normDomain, tierOf, type Company, type FitCriteria } from '../leadlist/fit.js';
import { profileCriteria } from '../leadlist/profile.js';
import { buildProfile, loadProfile, sampleStats } from '../leadlist/profileStore.js';
import { listCounts, mirrorCompanies } from '../leadlist/store.js';

interface RefitInput { filters: Filters; targeting?: string; thesis?: string; clientContext?: string; excludedDomains?: string[]; fit?: FitCriteria; rebuildProfile?: boolean }

export const companyRefitStage: Stage = async (ctx) => {
  const input = ctx.job.input as unknown as RefitInput;
  const listId = ctx.job.record_id;
  const filters = approvedFilters(input.filters);
  const before = await listCounts(ctx.db, listId);
  if (before.total === 0) throw new PermanentError('this list has no saved companies yet');

  const stored = await loadProfile(ctx, listId);
  const profile = await ctx.step('profile', async () => {
    if (stored && !input.rebuildProfile) return stored.profile;
    const sample = (await ctx.db.query(`SELECT data FROM lead_companies WHERE list_id=$1 AND batch=0`, [listId])).rows.map((r) => r.data);
    return buildProfile(ctx, listId, { thesis: input.thesis, targeting: input.targeting, clientContext: input.clientContext }, filters, sampleStats(sample));
  });
  const criteria = { ...profileCriteria(profile, filters, (input.excludedDomains ?? []).map(normDomain)), ...(input.fit ?? {}) };

  const changes = await ctx.step('refit', async () => {
    const rows = (await ctx.db.query(`SELECT domain, tier, data FROM lead_companies WHERE list_id=$1`, [listId])).rows;
    const out = rows.map((r) => { const fit = checkCompanyFit(r.data as Company, criteria); return { domain: r.domain as string, old: r.tier as string, tier: tierOf(fit.decision), reasons: fit.reasons, signals: fit.signals }; });
    if (ctx.dryRun) return { checked: out.length, changed: out.filter((x) => x.old !== x.tier).length, applied: false };
    for (let i = 0; i < out.length; i += 1000) {
      const part = out.slice(i, i + 1000);
      await ctx.db.query(
        `UPDATE lead_companies c SET tier=u.t, reasons=u.r::jsonb, signals=u.s::jsonb
           FROM unnest($2::text[], $3::text[], $4::text[], $5::text[]) AS u(d, t, r, s)
          WHERE c.list_id=$1 AND c.domain=u.d`,
        [listId, part.map((x) => x.domain), part.map((x) => x.tier), part.map((x) => JSON.stringify(x.reasons)), part.map((x) => JSON.stringify(x.signals))],
      );
    }
    // Rewrite the sheet in place (same row positions).
    await ctx.db.query(`UPDATE lead_list_sheets SET mirrored_batches='{}' WHERE list_id=$1 AND kind='companies'`, [listId]);
    const moves: Record<string, number> = {};
    for (const x of out) if (x.old !== x.tier) moves[`${x.old} → ${x.tier}`] = (moves[`${x.old} → ${x.tier}`] ?? 0) + 1;
    return { checked: out.length, changed: out.filter((x) => x.old !== x.tier).length, moves, applied: true };
  });
  if (!ctx.dryRun) {
    const sheets = createSheetsClient({ keyFile: ctx.cfg.googleKeyFile, impersonate: ctx.cfg.googleImpersonateUser, scope: ctx.cfg.googleScope, sheetsBaseUrl: ctx.cfg.googleSheetsBaseUrl });
    await ctx.step('mirror', () => mirrorCompanies(ctx.db, sheets, listId));
  }
  const after = await listCounts(ctx.db, listId);
  return {
    dryRun: ctx.dryRun,
    profile: { source: profile.source, summary: profile.summary, customer: profile.customer, allowBusinessTypes: profile.allowBusinessTypes, excludeKeywords: profile.excludeKeywords, excludeIndustries: profile.excludeIndustries, targetIndustries: profile.targetIndustries, targetKeywords: profile.targetKeywords, similarityTop: profile.similarityTop, notes: profile.notes },
    list: after, changes,
    message: `re-checked ${changes.checked} companies, ${changes.changed} changed tier${ctx.dryRun ? ' (dry run: nothing saved)' : ''}; now Tier 1 ${after.tier1}, Tier 2 ${after.tier2}, Cut ${after.cut} (${Math.round(after.usableRate * 100)}% usable)`,
  };
};

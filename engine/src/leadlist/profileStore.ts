// Build (once) or load a list's profile. The AI call goes through a receipt keyed by the
// inputs, so a re-run never calls again; a changed thesis/context makes a new profile.
import { createHash } from 'node:crypto';
import type { JobContext } from '../context.js';
import { RetryableError } from '../errors.js';
import { createOpenAIClient } from '../providers/openai.js';
import type { Filters } from './filters.js';
import { cleanProfile, codeProfile, profilePrompt, PROFILE_SYSTEM, type ListProfile, type ProfileInput } from './profile.js';

export interface ThesisInput { thesis?: string; targeting?: string; clientContext?: string }

export function profileHash(t: ThesisInput, filters: Filters): string {
  return createHash('sha256').update(JSON.stringify([t.thesis ?? '', t.targeting ?? '', t.clientContext ?? '', Object.entries(filters).sort()])).digest('hex').slice(0, 12);
}

/** Industry counts and similarities of a set of saved/fetched companies (the sample). */
export function sampleStats(companies: Array<{ industry_groups?: unknown; sub_industry?: unknown; similarity?: unknown }>) {
  const sampleIndustries: Record<string, number> = {};
  const sampleSimilarities: number[] = [];
  for (const c of companies) {
    for (const k of [...(Array.isArray(c.industry_groups) ? c.industry_groups : []), ...(Array.isArray(c.sub_industry) ? c.sub_industry : [])]) {
      const code = String(k).trim();
      if (code) sampleIndustries[code] = (sampleIndustries[code] ?? 0) + 1;
    }
    const s = Number(c.similarity);
    if (Number.isFinite(s)) sampleSimilarities.push(s);
  }
  return { sampleIndustries, sampleSimilarities };
}

export async function loadProfile(ctx: JobContext, listId: string): Promise<{ profile: ListProfile; hash: string } | null> {
  const r = await ctx.db.query(`SELECT profile, inputs_hash FROM lead_list_profiles WHERE list_id=$1`, [listId]);
  return r.rows[0] ? { profile: r.rows[0].profile as ListProfile, hash: r.rows[0].inputs_hash as string } : null;
}

export async function buildProfile(ctx: JobContext, listId: string, t: ThesisInput, filters: Filters, stats: ReturnType<typeof sampleStats>): Promise<ListProfile> {
  const input: ProfileInput = { ...t, filters, ...stats };
  const hash = profileHash(t, filters);
  // A dry run never calls the AI and never saves a profile.
  if (ctx.dryRun) return { ...codeProfile(input), notes: 'dry run: code-only preview, not saved' };
  const ai = createOpenAIClient({ apiKey: ctx.cfg.openAiApiKey, model: ctx.cfg.openAiModel, baseUrl: ctx.cfg.openAiBaseUrl });
  let profile: ListProfile;
  if (!ai.configured || (!t.thesis && !t.targeting && !t.clientContext)) {
    profile = { ...codeProfile(input), notes: ai.configured ? 'no thesis or client context given' : 'no OpenAI key on the server: code-only profile' };
  } else {
    try {
      const raw = await ctx.paid({
        scope: 'record', provider: 'openai', callKey: `profile:${hash}`, units: 1,
        run: () => ai.json(PROFILE_SYSTEM, profilePrompt(input)),
        dryRunResult: () => ({}),
      });
      profile = cleanProfile(raw, input);
    } catch (e) {
      if (e instanceof RetryableError) throw e;
      // The list must never stop because the AI is unavailable: fall back to the code profile.
      profile = { ...codeProfile(input), notes: `AI profile unavailable (${String((e as Error).message).slice(0, 160)}): code-only profile` };
    }
  }
  await ctx.db.query(
    `INSERT INTO lead_list_profiles (list_id, profile, inputs_hash) VALUES ($1,$2,$3)
     ON CONFLICT (list_id) DO UPDATE SET profile=EXCLUDED.profile, inputs_hash=EXCLUDED.inputs_hash, updated_at=now()`,
    [listId, JSON.stringify(profile), hash],
  );
  return profile;
}

// The list profile: who this list is for and why, built ONCE per list from the targeting
// sentence / campaign thesis, the client's own context (offer, how they work, who they
// target) and the approved search plan. Every company is then checked against it in code.
//  - Must-haves cut only on CLEAR contradiction (Cut). Nice-to-haves only decide Tier 1 vs 2.
//  - Unclear stays Tier 2. Same process for every industry; nothing is typed per list.
// Built by one AI call (OpenAI); if the AI is unavailable a code-only profile is used.
import type { Filters } from './filters.js';
import type { FitCriteria } from './fit.js';

export const BUSINESS_TYPES = ['directory', 'marketplace', 'lead-gen site', 'association', 'media', 'staffing', 'software', 'wholesaler', 'manufacturer', 'training'] as const;

export interface ListProfile {
  source: 'ai' | 'code';
  /** Who we want, why, and who we don't (plain words, shown to Alex with the sample). */
  summary: string;
  /** Business types normally cut that this thesis DOES target (e.g. manufacturer). */
  allowBusinessTypes: string[];
  customer: 'residential' | 'commercial' | 'any';
  /** Clear signs a company is NOT a fit (phrases), incl. the client's own competitors. */
  excludeKeywords: string[];
  /** Industry codes (from the sample) that are clearly not a fit. */
  excludeIndustries: string[];
  /** Industry codes (from the sample) that are the target. */
  targetIndustries: string[];
  /** Words that show a company clearly matches (Tier 1 signal only; never cuts). */
  targetKeywords: string[];
  /** This list's "high similarity" line (0-1): the top third of its own sample. */
  similarityTop: number;
  notes?: string;
}

export interface ProfileInput {
  thesis?: string;
  targeting?: string;
  clientContext?: string;
  filters: Filters;
  /** Industry codes seen in the sample, with counts (the AI may only pick from these). */
  sampleIndustries: Record<string, number>;
  sampleSimilarities: number[];
}

const strs = (v: unknown, max: number) => (Array.isArray(v) ? v : []).map((x) => String(x ?? '').trim().toLowerCase()).filter((x) => x.length >= 3 && x.length <= 80).slice(0, max);

/** Top third of the sample's similarity (0-1), bounded so it never becomes meaningless. */
export function similarityTop(sims: number[]): number {
  const v = sims.map((x) => (x > 1 ? x / 100 : x)).filter((x) => Number.isFinite(x)).sort((a, b) => a - b);
  if (v.length < 10) return 0.7;
  const t = v[Math.floor(v.length * (2 / 3))];
  return Math.min(0.9, Math.max(0.5, Math.round(t * 100) / 100));
}

export const PROFILE_SYSTEM = `You prepare a lead-list profile for B2B cold outreach. Output ONLY a JSON object.
The goal is to REMOVE OBVIOUS MISFITS, not to demand perfect fits. Be balanced: not too loose, not too strict.
Rules:
- Read the targeting sentence / campaign thesis literally. "roofing companies" = all roofers. "residential roofing companies" = residential (cut commercial-only).
- Use the client context (what the client sells, how they work, who they target) to decide who is NOT a buyer: e.g. a marketing agency's client list never wants directories, lead-gen sites, marketplaces or other marketing agencies (competitors).
- Must-haves become cut rules ONLY for clear contradictions. Nice-to-haves become target words (they never cut).
- excludeIndustries and targetIndustries MUST be chosen only from the industry codes provided (copy them exactly). Leave empty if unsure.
- allowBusinessTypes: list only types from [${BUSINESS_TYPES.join(', ')}] that the thesis itself targets (e.g. a thesis about manufacturers allows "manufacturer").
- excludeKeywords: short phrases (2-4 words) that clearly mean "not a fit" in a company's own description, e.g. "marketing agency", "business directory". Never single common words.
- targetKeywords: up to 15 short phrases that clearly describe the target business.
JSON shape: {"summary": "who we want, why, and who we don't, max 3 sentences", "allowBusinessTypes": [], "customer": "residential|commercial|any", "excludeKeywords": [], "excludeIndustries": [], "targetIndustries": [], "targetKeywords": [], "notes": ""}`;

export function profilePrompt(p: ProfileInput): string {
  const industries = Object.entries(p.sampleIndustries).sort((a, b) => b[1] - a[1]).slice(0, 60).map(([k, n]) => `${k} (${n})`).join('\n');
  return [
    `Targeting sentence: ${p.targeting || '(none)'}`,
    `Campaign thesis: ${p.thesis || '(same as the targeting sentence)'}`,
    `Client context: ${p.clientContext || '(none given)'}`,
    `Approved search plan (DiscoLike filters): ${JSON.stringify(p.filters).slice(0, 3000)}`,
    `Industry codes seen in the 100-company sample (code (count)):\n${industries || '(none)'}`,
  ].join('\n\n');
}

/** Clean what the AI returned; anything outside the allowed values is dropped. */
export function cleanProfile(raw: Record<string, unknown>, p: ProfileInput): ListProfile {
  const codes = new Set(Object.keys(p.sampleIndustries).map((k) => k.toLowerCase()));
  const customer = ['residential', 'commercial'].includes(String(raw.customer)) ? (String(raw.customer) as 'residential' | 'commercial') : 'any';
  return {
    source: 'ai',
    summary: String(raw.summary ?? '').slice(0, 600),
    allowBusinessTypes: strs(raw.allowBusinessTypes, 10).filter((t) => (BUSINESS_TYPES as readonly string[]).includes(t)),
    customer,
    excludeKeywords: strs(raw.excludeKeywords, 20).filter((w) => w.includes(' ')),
    excludeIndustries: strs(raw.excludeIndustries, 20).filter((c) => codes.has(c)),
    targetIndustries: strs(raw.targetIndustries, 20).filter((c) => codes.has(c)),
    targetKeywords: strs(raw.targetKeywords, 15),
    similarityTop: similarityTop(p.sampleSimilarities),
    notes: String(raw.notes ?? '').slice(0, 400) || undefined,
  };
}

const TYPE_WORDS: Record<string, RegExp> = {
  manufacturer: /\bmanufactur/, wholesaler: /\b(wholesal|distribut)/, software: /\b(software|saas)\b/, staffing: /\b(staffing|recruit)/,
  training: /\b(training|course|academy)/, media: /\b(media|publisher|magazine)/, association: /\bassociation/, marketplace: /\bmarketplace/, directory: /\bdirector(y|ies)\b/,
};

/** Code-only profile (no AI): thesis words + the plan's own filters. */
export function codeProfile(p: ProfileInput): ListProfile {
  const text = `${p.targeting ?? ''} ${p.thesis ?? ''} ${String(p.filters.icp_text ?? '')} ${String(p.filters.icp_prompt ?? '')}`.toLowerCase();
  const plan = (k: string) => (Array.isArray(p.filters[k]) ? (p.filters[k] as unknown[]) : p.filters[k] ? [p.filters[k]] : []).map((x) => String(x).toLowerCase());
  const phrases = plan('phrase_match').map((x) => x.replace(/["()]/g, ' ').split(/\s+(?:or|and)\s+/i)).flat().map((x) => x.trim()).filter((x) => x.length >= 4);
  const residential = /\b(residential|homeowner|home owner)/.test(text);
  const commercial = /\bcommercial\b/.test(text) && !residential;
  return {
    source: 'code',
    summary: `Code-only profile from the targeting sentence and search plan: ${(p.targeting || p.thesis || String(p.filters.icp_text ?? '')).slice(0, 300)}`,
    allowBusinessTypes: Object.entries(TYPE_WORDS).filter(([, re]) => re.test(text)).map(([t]) => t),
    customer: residential ? 'residential' : commercial ? 'commercial' : 'any',
    excludeKeywords: [],
    excludeIndustries: [...plan('negate_sub_industry'), ...plan('negate_category')],
    targetIndustries: [...plan('sub_industry'), ...plan('category')],
    targetKeywords: [...new Set(phrases)].slice(0, 15),
    similarityTop: similarityTop(p.sampleSimilarities),
  };
}

/** The fit settings every company is checked with, from the profile + the plan's hard facts. */
export function profileCriteria(pr: ListProfile, filters: Filters, excludedDomains: string[] = []): FitCriteria {
  const countries = (Array.isArray(filters.country) ? filters.country : filters.country ? [filters.country] : []).map((x) => String(x).toLowerCase());
  return {
    industries: pr.targetIndustries,
    excludedIndustries: pr.excludeIndustries,
    excludeKeywords: pr.excludeKeywords,
    includeKeywords: pr.targetKeywords,
    targetsBusinessTypes: pr.allowBusinessTypes,
    residential: pr.customer === 'residential',
    commercialOnly: pr.customer === 'commercial',
    countries,
    excludedDomains,
    similarityTop: pr.similarityTop,
  };
}

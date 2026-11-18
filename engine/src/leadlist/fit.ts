// Company and contact fit, as code (no LLM). Alex, 2026-11-18 (engine/PLAN.md decision 1):
// score each company against the campaign thesis and client info and drop only OBVIOUS bad
// fits. Maybes stay. Every drop carries its reason so Alex can check it.
// Rules kept from the old workflow (research/map-lead-list.md section 3): explicit
// exclusions beat similarity; directories, marketplaces, associations, media, staffing,
// software, wholesalers and similar are not providers unless the thesis targets them;
// residential campaigns drop commercial/industrial/government-only companies; contacts in
// India, Pakistan or Africa are excluded, judged by the PERSON's country, never the company's.

/** A company as DiscoLike returns it (the "Expanded Companies" columns). */
export interface Company {
  domain: string;
  name?: string;
  description?: string;
  keywords?: string | string[];
  industry_groups?: string | string[];
  sub_industry?: string | string[];
  employees?: number | string | null;
  /** DiscoLike digital footprint score. */
  score?: number | string | null;
  /** DiscoLike similarity to the seed/ICP, 0-1 or 0-100. */
  similarity?: number | string | null;
  address?: string;
  country?: string;
}

export interface FitCriteria {
  /** Industry groups / sub-industries the thesis targets (empty = any). */
  industries?: string[];
  excludedIndustries?: string[];
  employeeMin?: number;
  employeeMax?: number;
  /** Country codes or names allowed (empty = any). */
  countries?: string[];
  /** Words that must NOT appear (name, description, keywords). */
  excludeKeywords?: string[];
  /** Words that suggest a fit (only raise confidence; their absence never drops). */
  includeKeywords?: string[];
  /** Client exclusions: current clients, booked domains, suppression. */
  excludedDomains?: string[];
  /** Business types the thesis explicitly targets, e.g. "software" or "manufacturer". */
  targetsBusinessTypes?: string[];
  residential?: boolean;
  minFootprint?: number;
}

export type FitDecision = 'fit' | 'maybe' | 'drop';
export interface FitResult { domain: string; decision: FitDecision; reasons: string[]; signals: string[] }

const list = (v: unknown): string[] => (Array.isArray(v) ? v : String(v ?? '').split(/[,;|]/)).map((x) => String(x).trim().toLowerCase()).filter(Boolean);
const num = (v: unknown): number | undefined => {
  if (v === null || v === undefined || String(v).trim() === '') return undefined;
  const n = Number(String(v).replace(/[, ]/g, ''));
  return Number.isFinite(n) ? n : undefined;
};
export const normDomain = (d: string) => String(d ?? '').trim().toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0];

/** Business types that are not service providers unless the thesis targets them. */
const NOT_PROVIDERS: Record<string, RegExp> = {
  directory: /\b(directory|directories|listing site|find a (pro|contractor)|top \d+ best)\b/,
  marketplace: /\b(marketplace|compare quotes|get quotes from)\b/,
  'lead-gen site': /\b(lead generation (site|platform)|referral (network|service)|pay per lead)\b/,
  association: /\b(association|federation|chamber of commerce|trade body)\b/,
  media: /\b(magazine|news(paper)?|media outlet|publisher|podcast network)\b/,
  staffing: /\b(staffing|recruit(ing|ment) agency|temp agency)\b/,
  software: /\b(saas|software platform|app for)\b/,
  wholesaler: /\b(wholesale|wholesaler|distributor)\b/,
  manufacturer: /\b(manufacturer|manufacturing)\b/,
  training: /\b(training (provider|courses)|online courses|academy)\b/,
};
const COMMERCIAL_ONLY = /\b(commercial only|industrial|government contractor|municipal|institutional)\b/;

export function checkCompanyFit(c: Company, k: FitCriteria): FitResult {
  const reasons: string[] = [];
  const signals: string[] = [];
  const domain = normDomain(c.domain);
  const text = [c.name, c.description, ...list(c.keywords)].join(' ').toLowerCase();
  const industries = [...list(c.industry_groups), ...list(c.sub_industry)];

  // Explicit exclusions first: they beat any similarity.
  if (list(k.excludedDomains).map(normDomain).includes(domain)) reasons.push('domain is on the client exclusion list');
  const badWord = list(k.excludeKeywords).find((w) => text.includes(w));
  if (badWord) reasons.push(`mentions excluded keyword "${badWord}"`);
  const badIndustry = industries.find((i) => list(k.excludedIndustries).includes(i));
  if (badIndustry) reasons.push(`industry "${badIndustry}" is excluded`);

  // Hard facts only drop when the fact is KNOWN (unknown = maybe, never a drop).
  const emp = num(c.employees);
  if (emp !== undefined && k.employeeMin !== undefined && emp < k.employeeMin) reasons.push(`${emp} employees, below ${k.employeeMin}`);
  if (emp !== undefined && k.employeeMax !== undefined && emp > k.employeeMax) reasons.push(`${emp} employees, above ${k.employeeMax}`);
  const countries = list(k.countries);
  const country = String(c.country ?? '').trim().toLowerCase();
  if (countries.length && country && !countries.includes(country)) reasons.push(`based in ${c.country}, outside the target countries`);
  const footprint = num(c.score);
  if (k.minFootprint !== undefined && footprint !== undefined && footprint < k.minFootprint) reasons.push(`digital footprint ${footprint}, below ${k.minFootprint}`);

  // Not a provider (unless the thesis targets that type).
  const targets = list(k.targetsBusinessTypes);
  for (const [type, re] of Object.entries(NOT_PROVIDERS)) {
    if (!targets.includes(type) && re.test(text)) { reasons.push(`looks like a ${type}, not a provider`); break; }
  }
  if (k.residential && COMMERCIAL_ONLY.test(text)) reasons.push('commercial/industrial/government-only, but the campaign is residential');

  if (reasons.length) return { domain, decision: 'drop', reasons, signals };

  // Positive signals decide fit vs maybe; nothing here can drop.
  const wanted = list(k.industries);
  if (wanted.length && industries.some((i) => wanted.includes(i))) signals.push('target industry');
  if (list(k.includeKeywords).some((w) => text.includes(w))) signals.push('target keyword on the homepage');
  const sim = num(c.similarity);
  if (sim !== undefined && (sim > 1 ? sim / 100 : sim) >= 0.7) signals.push('high similarity');
  const decision: FitDecision = signals.length >= 2 || (signals.length === 1 && !wanted.length) ? 'fit' : 'maybe';
  return { domain, decision, reasons, signals };
}

export interface SampleSummary { reviewed: number; fit: number; maybe: number; drop: number; usableRate: number; status: 'Passed' | 'Needs Review' | 'Failed' }

/** The sample gate kept from the old workflow: usable = fit + maybe; Passed ≥ 80%, Needs Review ≥ 70%. */
export function summarizeSample(results: FitResult[]): SampleSummary {
  const fit = results.filter((r) => r.decision === 'fit').length;
  const maybe = results.filter((r) => r.decision === 'maybe').length;
  const drop = results.length - fit - maybe;
  const usableRate = results.length ? Math.round(((fit + maybe) / results.length) * 1000) / 1000 : 0;
  return { reviewed: results.length, fit, maybe, drop, usableRate, status: usableRate >= 0.8 ? 'Passed' : usableRate >= 0.7 ? 'Needs Review' : 'Failed' };
}

/** Person-location exclusion added to every contact search (old workflow rule). */
const EXCLUDED_CONTACT_COUNTRIES = new Set(['india', 'pakistan', 'in', 'pk',
  'algeria', 'angola', 'benin', 'botswana', 'burkina faso', 'burundi', 'cabo verde', 'cape verde', 'cameroon', 'central african republic', 'chad', 'comoros',
  'congo', 'democratic republic of the congo', 'republic of the congo', "cote d'ivoire", 'ivory coast', 'djibouti', 'egypt', 'equatorial guinea', 'eritrea',
  'eswatini', 'swaziland', 'ethiopia', 'gabon', 'gambia', 'ghana', 'guinea', 'guinea-bissau', 'kenya', 'lesotho', 'liberia', 'libya', 'madagascar', 'malawi',
  'mali', 'mauritania', 'mauritius', 'morocco', 'mozambique', 'namibia', 'niger', 'nigeria', 'rwanda', 'sao tome and principe', 'senegal', 'seychelles',
  'sierra leone', 'somalia', 'south africa', 'south sudan', 'sudan', 'tanzania', 'togo', 'tunisia', 'uganda', 'zambia', 'zimbabwe',
  'western sahara', 'reunion', 'mayotte', 'saint helena']);

/** Judged on the person's own country only; unknown is allowed (kept, not dropped). */
export function contactCountryAllowed(personCountry: string | undefined | null): boolean {
  const c = String(personCountry ?? '').trim().toLowerCase();
  return !c || !EXCLUDED_CONTACT_COUNTRIES.has(c);
}

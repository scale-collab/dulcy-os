// Generate filters, the parts that work for every niche (Alex, 2026-11-23):
//  - labels only when they fit: a DiscoLike industry (category) or sub-industry becomes a filter
//    only when at least 60% of the lookalike companies carry it (score >= 0.5). Several that fit
//    are either/or (ANY-OF, never "+" required). None fits = no label filter at all;
//  - a SOFT size goal: lead goal -> companies needed; free count x yield = expected real companies;
//  - auto-widen one step at a time while the plan is too small (never geography).
// Pure functions: the stage does the calls.
import type { Filters } from './filters.js';

export const LABEL_MIN_SHARE = 0.6;
export const LABEL_PRESENT_SCORE = 0.5;
export const MAX_WIDEN_COUNTS = 5;
/** DiscoLike's employee size steps (the same ones the plan snaps to). */
export const EMPLOYEE_STEPS: [number, number][] = [[1, 10], [11, 50], [51, 200], [201, 500], [501, 1000], [1001, 5000], [5001, 10000], [10001, 10001]];

export interface LabelShare { label: string; kind: 'category' | 'sub_industry'; share: number; companies: number }
export interface Coverage { total: number; categories: LabelShare[]; subIndustries: LabelShare[] }

/** Same industry spelling as the copied n8n plan code (E_COMMERCE / ecommerce -> E-COMMERCE). */
export function normIndustry(value: unknown): string {
  const v = String(value ?? '').toUpperCase().replace(/&/g, 'AND').replace(/[^A-Z0-9]+/g, '_').replace(/^_|_$/g, '');
  return ['E_COMMERCE', 'ECOMMERCE', 'ONLINE_RETAIL', 'ONLINE_RETAILER', 'ONLINE_RETAILERS'].includes(v) ? 'E-COMMERCE' : v;
}

/** {label: score} objects, [{name, score}] lists, plain lists or "a, b" text -> [label, score]; no score = present. */
function scored(v: unknown): [string, number][] {
  if (v === null || v === undefined || v === '') return [];
  const s = (x: unknown) => (x === undefined || x === null || x === '' || !Number.isFinite(Number(x)) ? 1 : Number(x));
  if (Array.isArray(v)) return v.map((x) => (x && typeof x === 'object' ? [String((x as any).name ?? (x as any).label ?? ''), s((x as any).score)] as [string, number] : [String(x), 1] as [string, number]));
  if (typeof v === 'object') return Object.entries(v as Record<string, unknown>).map(([k, x]) => [k, s(x)]);
  return String(v).split(/[,;|]/).map((x) => [x.trim(), 1] as [string, number]);
}

/** A sub-industry label as DiscoLike's qualified "PARENT/CHILD" from the official list, or null. */
export function qualifySub(label: string, taxonomy: string[]): string | null {
  const raw = String(label ?? '').trim().toUpperCase();
  if (!raw) return null;
  if (raw.includes('/')) {
    const [p, c] = raw.split('/');
    const q = `${normIndustry(p)}/${c.replace(/[^A-Z0-9]+/g, '_')}`;
    return taxonomy.includes(q) ? q : null;
  }
  const c = raw.replace(/[^A-Z0-9]+/g, '_');
  const hits = taxonomy.filter((x) => x.split('/')[1] === c);
  return hits.length === 1 ? hits[0] : null;
}

/** Share of the companies carrying each industry group / sub-industry (score >= 0.5), highest first. */
export function labelCoverage(rows: any[], taxonomy: string[]): Coverage {
  const cat = new Map<string, number>(), sub = new Map<string, number>();
  for (const r of rows) {
    const cs = new Set(scored(r?.industry_groups).filter(([l, s]) => l.trim() && s >= LABEL_PRESENT_SCORE).map(([l]) => normIndustry(l)).filter(Boolean));
    const ss = new Set(scored(r?.sub_industry ?? r?.sub_industries).filter(([, s]) => s >= LABEL_PRESENT_SCORE).map(([l]) => qualifySub(l, taxonomy)).filter(Boolean) as string[]);
    for (const l of cs) cat.set(l, (cat.get(l) ?? 0) + 1);
    for (const l of ss) sub.set(l, (sub.get(l) ?? 0) + 1);
  }
  const total = rows.length;
  const list = (m: Map<string, number>, kind: LabelShare['kind']) => [...m].map(([label, n]) => ({ label, kind, companies: n, share: total ? n / total : 0 })).sort((a, b) => b.share - a.share || a.label.localeCompare(b.label));
  return { total, categories: list(cat, 'category'), subIndustries: list(sub, 'sub_industry') };
}

const listOf = (v: unknown) => (Array.isArray(v) ? v : v === undefined || v === null || v === '' ? [] : String(v).split(',')).map((x) => String(x).trim().replace(/^\+/, '')).filter(Boolean);

/**
 * Replace the plan's category / sub_industry with only the labels that fit (>= 60% coverage).
 * A cross-industry brief gets no labels. Sub-industries never overwrite other qualifying
 * categories; when both are used, the sub-industries' parents are added to the either/or
 * category list (DiscoLike asks for the parent there).
 */
export function applyLabels(filters: Filters, cov: Coverage, opts: { crossIndustry?: boolean; minShare?: number } = {}) {
  const min = opts.minShare ?? LABEL_MIN_SHARE;
  const f: Filters = { ...filters };
  const proposed = [
    ...listOf(f.category).map((label) => ({ label: normIndustry(label), kind: 'category' as const })),
    ...listOf(f.sub_industry).map((label) => ({ label: label.toUpperCase(), kind: 'sub_industry' as const })),
  ];
  delete f.category; delete f.sub_industry;
  const negCats = new Set(listOf(f.negate_category).map(normIndustry));
  const negSubs = new Set(listOf(f.negate_sub_industry).map((x) => x.toUpperCase()));
  const all = [...cov.categories, ...cov.subIndustries];
  const fits = (x: LabelShare) => !opts.crossIndustry && x.share >= min && !(x.kind === 'category' ? negCats.has(x.label) : negSubs.has(x.label) || negCats.has(x.label.split('/')[0]));
  const cats = cov.categories.filter(fits);
  const subs = cov.subIndustries.filter(fits).slice(0, 50);
  // A sub-industry that fits is the sharpest label: use it on its own (with its parent, which
  // DiscoLike narrows to it). Other qualifying categories would come in WHOLE (any-of), e.g.
  // med spas: MEDSPA 97% + CONSUMER_SERVICES 79% = every salon (402k instead of the med spas).
  // They are held back as the first widening step instead (live test, 2026-11-24).
  const parents = [...new Set(subs.map((x) => x.label.split('/')[0]))];
  const usedCats = subs.length ? cats.filter((x) => parents.includes(x.label)) : cats;
  const broaderCategories = subs.length ? [...new Set([...parents, ...cats.map((x) => x.label)])] : [];
  if (subs.length) { f.sub_industry = subs.map((x) => x.label); f.category = parents; }
  else if (cats.length) f.category = cats.map((x) => x.label);
  const used = [...usedCats, ...subs];
  const usedSet = new Set(used.map((x) => x.label));
  // Skipped: what the old plan picked but does not fit, then the closest near misses.
  const byLabel = new Map(all.map((x) => [x.label, x]));
  const skipped: LabelShare[] = [];
  for (const p of proposed) if (!usedSet.has(p.label) && !skipped.some((s) => s.label === p.label)) skipped.push(byLabel.get(p.label) ?? { ...p, share: 0, companies: 0 });
  for (const x of all.filter((x) => !usedSet.has(x.label) && x.share > 0).sort((a, b) => b.share - a.share)) {
    if (skipped.length >= 5) break;
    if (!skipped.some((s) => s.label === x.label)) skipped.push(x);
  }
  skipped.sort((a, b) => b.share - a.share);
  const heldBack = subs.length ? cats.filter((x) => !parents.includes(x.label)) : [];
  return { filters: f, used, skipped: skipped.slice(0, 5), heldBack, broaderCategories };
}

const short = (x: LabelShare) => (x.kind === 'sub_industry' ? x.label.split('/')[1] ?? x.label : x.label);
const pc = (x: LabelShare) => `${short(x)} ${Math.round(x.share * 100)}%`;
export function labelsText(used: LabelShare[], skipped: LabelShare[], total: number, crossIndustry = false, heldBack: LabelShare[] = []): string {
  const head = crossIndustry ? 'Cross-industry brief: no industry labels.' : used.length ? `Labels used (either/or): ${used.map(pc).join(', ')}.` : 'Labels used: none (no industry label is on 60% of the lookalike companies; the lookalike text, examples and keywords do the targeting).';
  const held = heldBack.length ? ` Held back (whole industries, used only if the list is too small): ${heldBack.map(pc).join(', ')}.` : '';
  return `${head}${held}${skipped.length ? ` Skipped (under 60%): ${skipped.map(pc).join(', ')}.` : ''} (${total} lookalike companies checked.)`;
}

/** The next wider employee range (one DiscoLike step each side), or null when it can't widen. */
export function widerEmployeeRange(range: unknown): string | null {
  const m = String(range ?? '').match(/^\s*(\d+)\s*,\s*(\d+)\s*$/);
  if (!m) return null;
  const lo = Number(m[1]), hi = Number(m[2]);
  let li = EMPLOYEE_STEPS.findIndex((s) => lo <= s[1]); if (li < 0) li = EMPLOYEE_STEPS.length - 1;
  let hj = EMPLOYEE_STEPS.findIndex((s) => hi <= s[1]); if (hj < 0) hj = EMPLOYEE_STEPS.length - 1;
  const nl = Math.max(0, li - 1), nh = Math.min(EMPLOYEE_STEPS.length - 1, hj + 1);
  const next = `${EMPLOYEE_STEPS[nl][0]},${EMPLOYEE_STEPS[nh][1]}`;
  return next === `${lo},${hi}` ? null : next;
}

export interface WidenContext { broaderCategories?: string[] }
export interface WidenStep { key: 'sub_industry' | 'category' | 'employee_range' | 'business_model' | 'keywords'; apply: (f: Filters, ctx?: WidenContext) => { filters: Filters; note: string } | null }
const has = (f: Filters, k: string) => listOf(f[k]).length > 0;
/** Order: (a) size one step each side (keeps the niche; live jewelry test 2026-11-24: 2,969 -> 20,646 while dropping the label would add all retail), (b) sub-industry (-> the whole qualifying industries), (c) industry, (d) business model, (e) top half of the keywords. Never geography. */
export const WIDEN_STEPS: WidenStep[] = [
  { key: 'employee_range', apply: (f) => { const r = widerEmployeeRange(f.employee_range); return r ? { filters: { ...f, employee_range: r }, note: `widened employee range to ${r.replace(',', '-')}` } : null; } },
  { key: 'sub_industry', apply: (f, ctx) => {
    if (!has(f, 'sub_industry')) return null;
    const { sub_industry, ...rest } = f;
    const wider = ctx?.broaderCategories ?? [];
    return wider.length
      ? { filters: { ...rest, category: wider }, note: `dropped sub-industry labels (now the whole industries: ${wider.join(', ')})` }
      : { filters: rest, note: 'dropped sub-industry labels' };
  } },
  { key: 'category', apply: (f) => (has(f, 'category') ? { filters: (({ category, ...rest }) => rest)(f), note: 'dropped industry labels' } : null) },
  { key: 'business_model', apply: (f) => (has(f, 'business_model') ? { filters: (({ business_model, ...rest }) => rest)(f), note: 'dropped business model' } : null) },
  { key: 'keywords', apply: (f) => { const k = Array.isArray(f.phrase_match) ? f.phrase_match : []; if (k.length < 2) return null; const half = k.slice(0, Math.ceil(k.length / 2)); return { filters: { ...f, phrase_match: half }, note: `cut homepage keywords to the top ${half.length}` }; } },
];

const n = (x: number) => Math.round(x).toLocaleString('en-US');
export interface Sizing {
  leadGoal: number; source: string; sourceNote?: string; leadsPerCompany: number; countYield: number; companiesNeeded: number;
  freeCount: number | null; expectedReal: number | null; enough: boolean | null; widened: string[]; counts: { step: string; freeCount: number; findable?: number | null }[]; note?: string;
  /** How deep DiscoLike's real search goes (MAX_COVERAGE, with the targeting text); null = not probed. */
  findable?: number | null; findableCapped?: boolean;
}
export function goalText(s: Pick<Sizing, 'leadGoal' | 'source' | 'sourceNote' | 'companiesNeeded'>): string {
  return `Goal ${n(s.leadGoal)} leads (${s.sourceNote ?? s.source}) → needs ~${n(s.companiesNeeded)} companies.`;
}
export function sizingText(s: Sizing): string {
  const parts = [goalText(s)];
  if (s.freeCount === null) parts.push(s.note ?? 'Free count not available for this plan, so the size was not checked.');
  else {
    if (s.findable !== null && s.findable !== undefined && !s.findableCapped && s.findable < s.freeCount * s.countYield)
      parts.push(`Free count ${n(s.freeCount)}, but the real search only reaches ~${n(s.findable)} companies (the count cannot use the targeting text) → expect ~${n(s.expectedReal ?? 0)} real.`);
    else parts.push(`Free count ${n(s.freeCount)}${s.findable != null ? ` (real search reaches ${s.findableCapped ? '10,000+' : `~${n(s.findable)}`})` : ''} → expect ~${n(s.expectedReal ?? 0)} real.`);
    if (s.widened.length) parts.push(`Widened: ${s.widened.join(', ')}.`);
    if (s.enough === false) parts.push(`Still short of the goal (~${n(s.expectedReal ?? 0)} of ~${n(s.companiesNeeded)} companies): kept the widest plan. Geography is never widened automatically; a broader targeting sentence or more areas would add more. This is a goal, not a block: you can still run the sample.`);
    else if (!s.widened.length) parts.push('Big enough: no widening needed.');
    if (s.note) parts.push(s.note);
  }
  return parts.join(' ');
}

/**
 * Business model and example sites get the same "only when it fits" rule as the labels
 * (live pet e-com test 2026-11-24: the old code took the top-2 models and the 5 most similar
 * sites with no check: B2B + five pet SHOPS for a pet e-com brand list).
 *  - business_model: only models on 60%+ of the lookalike companies; an explicit B2B in the
 *    targeting sentence is always kept.
 *  - domain (example sites): the list's own examples are always kept. Otherwise only the most
 *    similar companies that carry a label that passed; no label passed = no example sites.
 */
export function applyModelsAndExamples(filters: Filters, rows: any[], opts: { used: LabelShare[]; explicitModels?: string[]; savedDomains?: string[]; taxonomy: string[]; minShare?: number }) {
  const min = opts.minShare ?? LABEL_MIN_SHARE;
  const f: Filters = { ...filters };
  const total = rows.length;
  const counts = new Map<string, number>();
  for (const r of rows) for (const m of new Set(scored(r?.business_model).filter(([l, s]) => l.trim() && s >= LABEL_PRESENT_SCORE).map(([l]) => l.trim().toUpperCase()))) counts.set(m, (counts.get(m) ?? 0) + 1);
  const modelShares = [...counts].map(([label, n]) => ({ label, share: total ? n / total : 0 })).sort((a, b) => b.share - a.share);
  const proposedModels = listOf(f.business_model).map((x) => x.toUpperCase());
  const explicit = (opts.explicitModels ?? []).map((x) => String(x).toUpperCase());
  const keptModels = [...new Set([...explicit, ...proposedModels.filter((m) => (counts.get(m) ?? 0) / (total || 1) >= min)])];
  if (keptModels.length) f.business_model = keptModels; else delete f.business_model;
  const droppedModels = proposedModels.filter((m) => !keptModels.includes(m)).map((m) => ({ label: m, share: (counts.get(m) ?? 0) / (total || 1) }));

  const saved = (opts.savedDomains ?? []).filter(Boolean);
  const proposedDomains = listOf(f.domain);
  let examples: string[];
  if (saved.length) examples = saved;
  else if (!opts.used.length) examples = [];
  else {
    const usedCats = new Set(opts.used.filter((x) => x.kind === 'category').map((x) => x.label));
    const usedSubs = new Set(opts.used.filter((x) => x.kind === 'sub_industry').map((x) => x.label));
    const fits = (r: any) => {
      const subs = scored(r?.sub_industry ?? r?.sub_industries).filter(([, s]) => s >= LABEL_PRESENT_SCORE).map(([l]) => qualifySub(l, opts.taxonomy));
      if (usedSubs.size) return subs.some((s) => s && usedSubs.has(s));
      return scored(r?.industry_groups).filter(([, s]) => s >= LABEL_PRESENT_SCORE).some(([l]) => usedCats.has(normIndustry(l)));
    };
    const clean = (d: unknown) => String(d ?? '').toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0].trim();
    examples = [...new Set(rows.filter(fits).map((r) => clean(r?.domain)).filter(Boolean))].slice(0, 5);
  }
  if (examples.length) f.domain = examples; else delete f.domain;
  const examplesNote = saved.length ? 'kept the list\'s own example sites' : examples.length ? `${examples.length} example sites, all carrying a label that passed` : proposedDomains.length ? 'no example sites (none of the most similar companies carry a label that passed; the targeting text and keywords target)' : '';
  return { filters: f, modelShares, droppedModels, examples, examplesNote };
}

export function modelsText(kept: string[], dropped: { label: string; share: number }[], examplesNote: string): string {
  const parts: string[] = [];
  if (dropped.length) parts.push(`Business model: ${kept.length ? kept.join(', ') : 'none'} (skipped under 60%: ${dropped.map((d) => `${d.label} ${Math.round(d.share * 100)}%`).join(', ')}).`);
  if (examplesNote) parts.push(`Examples: ${examplesNote}.`);
  return parts.join(' ');
}

/**
 * How deep DiscoLike's real search goes (Alex, 2026-11-24): the free count ignores the targeting
 * text, so it can say 23,000 when the search only reaches ~2,000 (pet e-com). `has(offset)` asks
 * for ONE company at that position (about 1 record each). Steps out 500, 1k, 2k, 4k, 8k, 10k (the
 * API's offset limit), then narrows to about 10%. About 6-9 calls.
 */
export const PROBE_STEPS = [500, 1000, 2000, 4000, 8000, 10000];
export async function probeDepth(has: (offset: number) => Promise<boolean>): Promise<{ depth: number; capped: boolean; calls: number }> {
  let calls = 0;
  const ask = async (o: number) => { calls++; return has(o); };
  if (!(await ask(0))) return { depth: 0, capped: false, calls };
  let lo = 0, hi: number | null = null;
  for (const o of PROBE_STEPS) { if (await ask(o)) lo = o; else { hi = o; break; } }
  if (hi === null) return { depth: lo, capped: true, calls };
  while (hi - lo > Math.max(100, Math.round(lo * 0.1))) {
    const mid = Math.round((lo + hi) / 2);
    if (await ask(mid)) lo = mid; else hi = mid;
  }
  return { depth: lo + 1, capped: false, calls };
}

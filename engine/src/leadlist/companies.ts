// DiscoLike company rows → the fields the fit check reads. DiscoLike returns some fields as
// objects of {label: score} (keywords, industry_groups); those become label lists.
import type { Company } from './fit.js';
import { normDomain } from './fit.js';

const labels = (v: unknown): string[] => {
  if (v === null || v === undefined) return [];
  if (Array.isArray(v)) return v.map((x) => String(typeof x === 'object' && x ? (x as any).name ?? (x as any).label ?? '' : x)).filter(Boolean);
  if (typeof v === 'object') return Object.keys(v as object);
  return String(v).split(/[,;|]/).map((s) => s.trim()).filter(Boolean);
};
const first = (...vals: unknown[]) => vals.find((v) => v !== undefined && v !== null && String(v).trim() !== '');

export function toCompany(r: any): Company {
  const addr = r.address && typeof r.address === 'object' ? r.address : undefined;
  return {
    domain: normDomain(String(first(r.domain, r.website_domain, r.redirect_domain) ?? '')),
    name: first(r.name, r.company_name) as string | undefined,
    description: first(r.description, r.summary) as string | undefined,
    keywords: labels(r.keywords),
    industry_groups: labels(r.industry_groups),
    sub_industry: labels(first(r.sub_industry, r.sub_industries)),
    employees: (first(r.employees, r.employee_count, r.num_employees, r.employees_range) ?? null) as any,
    score: (first(r.score, r.digital_footprint_score) ?? null) as any,
    similarity: (first(r.similarity, r.similarity_score) ?? null) as any,
    address: String(first(addr?.formatted, typeof r.address === 'string' ? r.address : undefined, r.full_address) ?? ''),
    country: String(first(addr?.country, r.country, r.hq_country) ?? ''),
  };
}

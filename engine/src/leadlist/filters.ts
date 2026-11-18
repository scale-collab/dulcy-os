// DiscoLike search filters, with the same rules the old n8n sample/expand nodes enforced.
// The saved, approved filters run exactly as saved; the ICP sentence is only for planning.
import { PermanentError } from '../errors.js';

export type Filters = Record<string, unknown>;
const RELEVANCE = ['MAX_RELEVANCE', 'BALANCED', 'MAX_COVERAGE'];

export function approvedFilters(input: Filters): Filters {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new PermanentError('DiscoLike filters must be a JSON object');
  const f: Filters = { ...input };
  if (Object.prototype.hasOwnProperty.call(f, 'min_similarity')) throw new PermanentError('legacy similarity plan: pick a search relevance and review a new sample first');
  if (f.relevance !== undefined && !RELEVANCE.includes(String(f.relevance))) throw new PermanentError(`invalid DiscoLike relevance "${f.relevance}"`);
  for (const k of ['consensus', 'icp_prompt', 'auto_icp_text', 'auto_phrase_match', 'max_records', 'offset']) delete f[k];
  if (Array.isArray(f.category)) f.category = [...new Set(f.category.map((v) => (v === 'E_COMMERCE' ? 'E-COMMERCE' : v)))];
  if (Object.keys(f).length === 0) throw new PermanentError('DiscoLike filters are empty: a sample needs the approved search plan');
  return f;
}

/** Query string: a list repeats its key (category=A&category=B); blanks are left out. */
export function toQuery(params: Filters): string {
  const parts: string[] = [];
  for (const [key, value] of Object.entries(params)) {
    for (const item of Array.isArray(value) ? value : [value]) {
      if (item === undefined || item === null || item === '') continue;
      parts.push(`${encodeURIComponent(key)}=${encodeURIComponent(String(item))}`);
    }
  }
  return parts.join('&');
}

/**
 * The free /v1/count accepts fewer settings than the search (old TAM-finder rules): list
 * filters joined by commas, size/revenue ranges, footprint, leadgen/redirect, founding date
 * and geo. Lookalike text, relevance, seed domains and exclusion lists are search-only, so
 * the count is an upper bound. Returns null when nothing countable is left.
 */
const COUNT_LISTS = new Set('sub_industry negate_sub_industry phrase_match negate_phrase_match tech_stack negate_tech_stack country negate_country state negate_state category negate_category business_model negate_business_model social negate_social language negate_language'.split(' '));
const COUNT_PLAIN = new Set(['employee_range', 'revenue_range', 'min_digital_footprint', 'max_digital_footprint', 'exclude_leadgen', 'redirect', 'start_date', 'geo', 'bbox', 'lat', 'lon', 'radius']);
export function countFilters(f: Filters): { params: Filters; ignored: string[] } | null {
  const params: Filters = {};
  const ignored: string[] = [];
  for (const [k, v] of Object.entries(f)) {
    if (v === null || v === undefined || v === '' || (Array.isArray(v) && !v.length)) continue;
    if (COUNT_LISTS.has(k)) params[k] = [...new Set((Array.isArray(v) ? v : String(v).split(',')).map((x) => String(x).trim()).filter(Boolean))].join(',');
    else if (k === 'redirect') params[k] = [true, 1, 'true', '1'].includes(v as any) ? 1 : 0;
    else if (COUNT_PLAIN.has(k)) params[k] = v;
    else ignored.push(k);
  }
  const countable = Object.keys(params).some((k) => !['redirect', 'exclude_leadgen', 'min_digital_footprint', 'max_digital_footprint'].includes(k));
  return countable ? { params, ignored } : null;
}

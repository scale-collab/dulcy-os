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

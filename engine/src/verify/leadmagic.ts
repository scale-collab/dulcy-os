// LeadMagic fallback rules, copied from the old n8n 03 workflow (live "Saved Recovery" path):
//  - only when "Use LeadMagic Fallback" is ticked and direct contacts are included;
//  - DIRECT contacts that are not Good after MillionVerifier (Risky, Bad, Pending, invalid
//    syntax, or no email), with a first name, last name and domain; generic emails never;
//  - email FINDER from name + domain (never re-validate the same email);
//  - Good only when LeadMagic says valid/deliverable/verified/valid_email and gives a real email
//    for the same person and domain; everything else stays Risky (never Bad); unknown or
//    errored rows are never retried automatically;
//  - a found email replaces the old one (the old one is kept as Original Email); it is not
//    re-checked by MillionVerifier.
import type { CandidateSet, InputRow, VerifiedEmail } from './rules.js';
import type { FinderRow } from '../providers/leadmagic.js';

const text = (v: unknown) => (v === undefined || v === null ? '' : String(v).trim());
const low = (v: unknown) => text(v).toLowerCase();
export const cleanDomain = (v: unknown) => low(v).replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0];
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const GOOD_DETAILS = ['valid', 'deliverable', 'verified', 'valid_email'];

export interface LmCandidate { key: string; row: InputRow; originalEmail: string; body: FinderRow }
export interface LmResult { key: string; verdict: 'Good' | 'Risky'; email: string; detail: string }

function names(row: InputRow) {
  let first = text(row.firstName), last = text(row.lastName);
  if ((!first || !last) && text(row.name)) {
    const parts = text(row.name).split(/\s+/).filter(Boolean);
    first ||= parts[0] ?? ''; last ||= parts.slice(1).join(' ');
  }
  return { first, last };
}
const isDirect = (row: InputRow, email: string) => low(row.type) === 'direct' || (!low(row.type) && !!email && !/^(info|hello|contact|sales|support|admin|office|team|marketing|service|customerservice)@/.test(email));

/** Direct contacts MillionVerifier did not mark Good, that LeadMagic can look up. */
export function leadMagicCandidates(set: CandidateSet, results: VerifiedEmail[]): LmCandidate[] {
  const verdict = new Map(results.map((r) => [r.email, r.verdict]));
  const rows: { row: InputRow; email: string }[] = [
    ...set.send.filter((c) => c.kind === 'direct' && verdict.get(c.email) !== 'Good').map((c) => ({ row: c.row, email: c.email })),
    ...set.invalidSyntax.filter((c) => c.kind === 'direct').map((c) => ({ row: c.row, email: c.email })),
    ...set.missingEmail.filter((r) => isDirect(r, '')).map((row) => ({ row, email: '' })),
  ];
  const good = new Set(results.filter((r) => r.verdict === 'Good').map((r) => r.email));
  const seen = new Set<string>();
  const out: LmCandidate[] = [];
  for (const { row, email } of rows) {
    const { first, last } = names(row);
    const domain = cleanDomain(row.domain);
    if (!first || !last || !domain) continue;
    if (email && good.has(email)) continue;
    const key = [first, last, domain].join('|').toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ key, row, originalEmail: email, body: { first_name: first, last_name: last, domain } });
  }
  return out;
}

/** One LeadMagic result row → verdict (n8n "Saved Recovery — Original Normalize"). */
export function mapLeadMagicRow(c: LmCandidate, r: any): LmResult {
  const risky = (detail: string, email = ''): LmResult => ({ key: c.key, verdict: 'Risky', email, detail });
  const http = Number(r?.http_status_code ?? 200);
  const out = r?.lm_output ?? r?.output ?? null;
  const rowStatus = low(r?.status);
  if (rowStatus && !['success', 'completed', 'succeeded'].includes(rowStatus)) return risky(`provider_error: ${text(r?.error_message) || rowStatus}`);
  if (http === 400) return risky(`provider_error: ${text(out?.code ?? out?.error ?? r?.error_message) || 'validation_error'}`);
  if (!out || typeof out !== 'object') return risky('provider_outcome_unknown');
  const data = out.data ?? out;
  if (out.unverified === true || out.retryable === true) return risky(out.unverified && out.retryable && low(data.status) === 'unknown' ? 'provider_outcome_unknown' : 'provider_unverified');
  const email = low(out.email ?? out.data?.email);
  const detail = low(data.email_status ?? data.status);
  if (!detail && !email) return risky('not_found');
  // Same person and domain as asked, or the email is not used.
  const same = (a: unknown, b: string) => !text(a) || low(a) === b.toLowerCase();
  const respDomain = cleanDomain(data.domain ?? data.requested_domain);
  if (!same(data.first_name, c.body.first_name) || !same(data.last_name, c.body.last_name) || (respDomain && respDomain !== c.body.domain) || data.domain_mismatch === true) {
    return risky('provider_identity_mismatch');
  }
  if (GOOD_DETAILS.includes(detail) && EMAIL.test(email)) return { key: c.key, verdict: 'Good', email, detail };
  return risky(detail || 'not_found', email);
}

/**
 * Single mode (Alex 2026-11-25): one Email Finder call per person, several at once, kept under the
 * per-minute limit. A call that errors stays Risky and is never retried automatically; a refused key
 * or no credits stops everything (results so far are returned on the error as .partial).
 */
export async function findAllSingle(cands: LmCandidate[], find: (b: FinderRow) => Promise<any>, opts: { concurrency: number; perMin: number; isFatal: (e: unknown) => boolean }): Promise<LmResult[]> {
  const out: LmResult[] = [];
  const gap = 60_000 / Math.max(1, opts.perMin);
  let next = 0, slot = 0, fatal: unknown = null;
  const worker = async () => {
    while (next < cands.length && !fatal) {
      const c = cands[next++];
      const now = Date.now();
      slot = Math.max(now, slot + gap);
      const wait = slot - now;
      if (wait > 0) await new Promise((r) => setTimeout(r, wait));
      if (fatal) break;
      try {
        out.push(mapLeadMagicRow(c, { status: 'success', http_status_code: 200, lm_output: await find(c.body) }));
      } catch (e) {
        if (opts.isFatal(e)) { fatal = e; break; }
        out.push({ key: c.key, verdict: 'Risky', email: '', detail: `provider_error: ${String((e as Error)?.message ?? e).slice(0, 200)}` });
      }
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, Math.min(opts.concurrency, cands.length)) }, worker));
  if (fatal) { (fatal as any).partial = out; throw fatal; }
  return out;
}

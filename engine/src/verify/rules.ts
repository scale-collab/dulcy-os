// Verification business rules, ported from the old n8n "03 Verification Submit and Check"
// workflow (see research/map-lead-list.md, sections 2.7 and 3). Pure functions, no I/O.
import { createHash } from 'node:crypto';
import { NeedsReviewError, PermanentError } from '../errors.js';

export type Verdict = 'Good' | 'Risky' | 'Bad' | 'Pending';
export type EmailKind = 'direct' | 'generic';

/** One lead row as the earlier stages produce it. Extra columns are kept as they are. */
export interface InputRow {
  email?: unknown;
  /** 'direct' (a person) or 'generic' (a company inbox). */
  type?: unknown;
  firstName?: unknown;
  lastName?: unknown;
  company?: unknown;
  domain?: unknown;
  linkedin?: unknown;
  /** Company digital footprint (used by the "200 or less" generic filter). */
  footprint?: unknown;
  [key: string]: unknown;
}

export interface VerifyOptions {
  includeDirect: boolean;
  includeGeneric: boolean;
  /** Drop generic emails from companies with a footprint over 200 or unknown. */
  genericFootprintMax200: boolean;
}

export interface Candidate { email: string; kind: EmailKind; row: InputRow }
export interface Held { email: string; reason: string; row: InputRow }

export interface CandidateSet {
  /** Unique, well-formed emails to send to MillionVerifier. */
  send: Candidate[];
  /** Identity conflicts: never sent, never in the final lists; a person decides. */
  holds: Held[];
  /** Rows with no email: counted as Risky (missing_email), like the old workflow. */
  missingEmail: InputRow[];
  /** Malformed emails: counted as Bad without spending a credit. */
  invalidSyntax: Candidate[];
  droppedFootprint: number;
  droppedByType: number;
  duplicates: number;
  /** Fingerprint of the email set; the same set on the same list never pays twice. */
  hash: string;
  /** Personal emails the sheet moved out of public_emails (never verified; used to explain diffs). */
  excludedPersonal?: string[];
}

/** Role inboxes treated as generic even when they came from the contacts tab. */
const ROLE_EMAIL = /^(info|hello|contact|sales|support|admin|office|team|marketing|service|customerservice)@/;
const EMAIL_SYNTAX = /^[^@\s",;<>]+@[^@\s",;<>]+\.[^@\s",;<>]+$/;
/** MillionVerifier bulk upload limit used by the old workflow. */
export const MAX_UPLOAD_BYTES = 8 * 1024 * 1024;

const text = (v: unknown) => (v === undefined || v === null ? '' : String(v).trim());
export const normalizeEmail = (v: unknown) => text(v).toLowerCase();

export function emailKind(row: InputRow, email: string): EmailKind {
  if (text(row.type).toLowerCase() === 'generic') return 'generic';
  return ROLE_EMAIL.test(email) ? 'generic' : 'direct';
}

/** Who a direct row is: LinkedIn if known, else name + domain. Empty when unknown. */
function identity(row: InputRow): string {
  const li = text(row.linkedin).toLowerCase().replace(/^https?:\/\/(www\.)?/, '').replace(/\/+$/, '');
  if (li) return `li:${li}`;
  const parts = [row.firstName, row.lastName, row.domain].map((v) => text(v).toLowerCase());
  return parts.every((p) => p) ? `name:${parts.join('|')}` : '';
}

function footprintOk(row: InputRow): boolean {
  const n = Number(row.footprint);
  return row.footprint !== undefined && row.footprint !== null && text(row.footprint) !== '' && Number.isFinite(n) && n <= 200;
}

export function buildCandidates(rows: InputRow[], opts: VerifyOptions): CandidateSet {
  if (!opts.includeDirect && !opts.includeGeneric) throw new PermanentError('choose direct contacts, generic emails, or both');
  const missingEmail: InputRow[] = [];
  const invalidSyntax: Candidate[] = [];
  let droppedFootprint = 0;
  let droppedByType = 0;
  let duplicates = 0;

  const byEmail = new Map<string, Candidate[]>();
  const excludedPersonal: string[] = [];
  for (const row of rows) {
    if (text(row.type).toLowerCase() === 'excluded') { const e = normalizeEmail(row.email); if (e) excludedPersonal.push(e); continue; }
    const email = normalizeEmail(row.email);
    if (!email) { missingEmail.push(row); continue; }
    const kind = emailKind(row, email);
    if (kind === 'direct' && !opts.includeDirect) { droppedByType++; continue; }
    if (kind === 'generic' && !opts.includeGeneric) { droppedByType++; continue; }
    if (kind === 'generic' && opts.genericFootprintMax200 && !footprintOk(row)) { droppedFootprint++; continue; }
    if (!EMAIL_SYNTAX.test(email)) { invalidSyntax.push({ email, kind, row }); continue; }
    const list = byEmail.get(email) ?? [];
    list.push({ email, kind, row });
    byEmail.set(email, list);
  }

  const holds: Held[] = [];
  const kept: Candidate[] = [];
  for (const [email, list] of byEmail) {
    const people = new Set(list.filter((c) => c.kind === 'direct').map((c) => identity(c.row)).filter(Boolean));
    if (people.size > 1) {
      for (const c of list) holds.push({ email, reason: 'one email shared by different people', row: c.row });
      continue;
    }
    duplicates += list.length - 1;
    kept.push(list.find((c) => c.kind === 'direct') ?? list[0]);
  }

  // One person with several different emails: hold them all (identity conflict).
  const emailsByPerson = new Map<string, Set<string>>();
  for (const c of kept) {
    const id = c.kind === 'direct' ? identity(c.row) : '';
    if (!id) continue;
    const s = emailsByPerson.get(id) ?? new Set<string>();
    s.add(c.email);
    emailsByPerson.set(id, s);
  }
  const conflicted = new Set<string>();
  for (const s of emailsByPerson.values()) if (s.size > 1) for (const e of s) conflicted.add(e);
  const send: Candidate[] = [];
  for (const c of kept) {
    if (conflicted.has(c.email)) holds.push({ email: c.email, reason: 'one person with several emails', row: c.row });
    else send.push(c);
  }

  const hash = createHash('sha256').update(send.map((c) => c.email).sort().join('\n')).digest('hex').slice(0, 16);
  return { send, holds, missingEmail, invalidSyntax, droppedFootprint, droppedByType, duplicates, hash, excludedPersonal };
}

export function toCsv(emails: string[]): string {
  const csv = ['email', ...emails].join('\n') + '\n';
  if (Buffer.byteLength(csv) > MAX_UPLOAD_BYTES) throw new PermanentError(`upload would be ${Buffer.byteLength(csv)} bytes; MillionVerifier limit is ${MAX_UPLOAD_BYTES}. Split the list.`);
  return csv;
}

/** MillionVerifier verdict → our status. Catch-all and unknown are never Good. */
export function mapVerdict(detail: string): Verdict {
  const d = detail.trim().toLowerCase();
  if (!d) return 'Pending'; // not processed (usually out of credits)
  if (['ok', 'good', 'valid', 'deliverable'].includes(d)) return 'Good';
  if (['invalid', 'bad', 'disposable', 'disabled'].includes(d)) return 'Bad';
  if (['catch_all', 'catch-all', 'catchall', 'unknown', 'risky', 'accept_all'].includes(d)) return 'Risky';
  throw new NeedsReviewError(`unrecognized MillionVerifier verdict "${d}"`);
}

function parseLine(line: string): string[] {
  const out: string[] = [];
  let v = '';
  let q = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"' && q && line[i + 1] === '"') { v += '"'; i++; }
    else if (c === '"') q = !q;
    else if (c === ',' && !q) { out.push(v); v = ''; }
    else v += c;
  }
  out.push(v);
  return out;
}

export interface VerifiedEmail { email: string; verdict: Verdict; detail: string }

/**
 * Parse the MillionVerifier result file. Strict, like the old workflow: an unexpected,
 * duplicate or missing email means the file does not match this list → a person looks.
 */
/** For messages and logs: keeps the domain, hides the person (j***@acme.com). */
export function maskEmail(email: string): string {
  const [local, domain] = email.split('@');
  return domain ? `${(local ?? '').slice(0, 1)}***@${domain}` : '***';
}

export interface ResultDiff {
  /** Emails in the MillionVerifier file that the list no longer has. */
  inFileNotInList: string[];
  /** List emails the MillionVerifier file does not cover. */
  inListNotInFile: string[];
  duplicatesInFile: number;
}

/**
 * Diagnose mode (shadow tests only): parse without failing on a mismatch and report the
 * difference, so we can see why a saved job no longer matches the sheet.
 */
export function parseResultsLoose(csv: string, expectedEmails: string[]): { results: VerifiedEmail[]; diff: ResultDiff } {
  const lines = csv.replace(/^\uFEFF/, '').split(/\r?\n/).filter((l) => l.trim() !== '');
  const header = parseLine(lines.shift() ?? '').map((h) => h.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_'));
  const ei = header.findIndex((h) => h === 'email' || h === 'email_address');
  const si = ['result', 'status', 'quality'].map((n) => header.indexOf(n)).find((i) => i >= 0) ?? -1;
  if (ei < 0 || si < 0) throw new NeedsReviewError('MillionVerifier file is missing the email or result column');
  const expected = new Set(expectedEmails);
  const seen = new Set<string>();
  const results: VerifiedEmail[] = [];
  const inFileNotInList: string[] = [];
  let duplicatesInFile = 0;
  for (const line of lines) {
    const cells = parseLine(line);
    const email = normalizeEmail(cells[ei]);
    if (seen.has(email)) { duplicatesInFile++; continue; }
    seen.add(email);
    if (!expected.has(email)) { inFileNotInList.push(email); continue; }
    const detail = text(cells[si]).toLowerCase();
    results.push({ email, verdict: mapVerdict(detail), detail: detail || 'unprocessed_no_credits' });
  }
  const inListNotInFile = expectedEmails.filter((e) => !seen.has(e));
  return { results, diff: { inFileNotInList, inListNotInFile, duplicatesInFile } };
}

export function parseResults(csv: string, expectedEmails: string[]): VerifiedEmail[] {
  const lines = csv.replace(/^﻿/, '').split(/\r?\n/).filter((l) => l.trim() !== '');
  const header = parseLine(lines.shift() ?? '').map((h) => h.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_'));
  const ei = header.findIndex((h) => h === 'email' || h === 'email_address');
  const si = ['result', 'status', 'quality'].map((n) => header.indexOf(n)).find((i) => i >= 0) ?? -1;
  if (ei < 0 || si < 0) throw new NeedsReviewError('MillionVerifier file is missing the email or result column');
  const expected = new Set(expectedEmails);
  const seen = new Set<string>();
  const out: VerifiedEmail[] = [];
  for (const line of lines) {
    const cells = parseLine(line);
    const email = normalizeEmail(cells[ei]);
    if (!expected.has(email)) throw new NeedsReviewError(`MillionVerifier file has an email that is not in this list (${maskEmail(email)}); the saved job may belong to an older version of the list`);
    if (seen.has(email)) throw new NeedsReviewError(`MillionVerifier file lists ${maskEmail(email)} twice`);
    seen.add(email);
    const detail = text(cells[si]).toLowerCase();
    out.push({ email, verdict: mapVerdict(detail), detail: detail || 'unprocessed_no_credits' });
  }
  // MillionVerifier can silently drop a single odd address (seen live 2026-11-20: 1,937 of
  // 1,938). A tiny gap (at most 5 emails and 0.5% of the list), with nothing extra and no
  // duplicates, is accepted: the missing emails count as Risky ("not returned"), so they
  // never reach a final list. A bigger gap still goes to review.
  const missing = expectedEmails.filter((e) => !seen.has(e));
  if (missing.length > Math.min(5, Math.floor(expected.size * 0.005))) throw new NeedsReviewError(`MillionVerifier returned ${seen.size} of ${expected.size} emails; reuse the saved job, do not upload again`);
  for (const email of missing) out.push({ email, verdict: 'Risky', detail: 'not_returned_by_millionverifier' });
  return out;
}

export interface VerifyOutputs {
  counts: { good: number; risky: number; bad: number; pending: number; held: number; sent: number; notSendable: number };
  finalDirect: InputRow[];
  finalGeneric: InputRow[];
  held: Held[];
  /** Emails MillionVerifier did not process (usually no credits): run them later. */
  pendingEmails: string[];
}

// Generic inboxes that should never get cold email, and free mailboxes small businesses use
// as their own address. Seen live 2026-11-20 (Med Spas): website scrapes pick up unsubscribe@,
// legal@, privacy@ and careers@ inboxes, and the web designer's or software vendor's address.
const ROLE_NEVER = new Set(['unsubscribe', 'legal', 'privacy', 'careers', 'career', 'jobs', 'job', 'hiring', 'recruiting', 'accessibility', 'abuse',
  'noreply', 'no-reply', 'donotreply', 'do-not-reply', 'webmaster', 'postmaster', 'hostmaster', 'dev', 'developer', 'billing', 'accounting',
  'accounts', 'payroll', 'hr', 'press', 'compliance', 'dmca', 'security', 'spam', 'optout', 'opt-out', 'remove']);
const FREE_MAIL = new Set(['gmail.com', 'googlemail.com', 'outlook.com', 'hotmail.com', 'live.com', 'msn.com', 'yahoo.com', 'icloud.com', 'me.com', 'mac.com', 'aol.com', 'protonmail.com', 'proton.me']);
const bareDomain = (v: unknown) => text(v).toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0];

/** Why a verified generic email must not be sent to (null = fine). */
export function genericNotSendable(email: string, companyDomain: unknown): string | null {
  const [local, domain = ''] = email.split('@');
  const role = local.split(/[^a-z-]/)[0];
  if (ROLE_NEVER.has(local) || ROLE_NEVER.has(role)) return 'role address';
  const own = bareDomain(companyDomain);
  if (FREE_MAIL.has(domain) || !own) return null;
  if (domain === own || domain.endsWith(`.${own}`) || own.endsWith(`.${domain}`)) return null;
  return "another company's address";
}

export function buildOutputs(set: CandidateSet, results: VerifiedEmail[]): VerifyOutputs {
  const byEmail = new Map(results.map((r) => [r.email, r]));
  const counts = { good: 0, risky: set.missingEmail.length, bad: set.invalidSyntax.length, pending: 0, held: set.holds.length, sent: set.send.length, notSendable: 0 };
  const finalDirect: InputRow[] = [];
  const finalGeneric: InputRow[] = [];
  const pendingEmails: string[] = [];
  for (const c of set.send) {
    const r = byEmail.get(c.email);
    const verdict = r?.verdict ?? 'Pending';
    if (verdict === 'Good') {
      counts.good++;
      const row = { ...c.row, email: c.email, verificationStatus: 'Good', verificationDetail: r?.detail };
      // Good but not for cold email (role inbox or another company's address): left out of the final list.
      if (c.kind === 'generic' && genericNotSendable(c.email, c.row.domain)) counts.notSendable++;
      else (c.kind === 'generic' ? finalGeneric : finalDirect).push(row);
    } else if (verdict === 'Risky') counts.risky++;
    else if (verdict === 'Bad') counts.bad++;
    else { counts.pending++; pendingEmails.push(c.email); }
  }
  return { counts, finalDirect, finalGeneric, held: set.holds, pendingEmails };
}

export type Expected = Partial<Record<'good' | 'risky' | 'bad' | 'finalDirect' | 'finalGeneric', number>>;

/** Side-by-side check against the old workflow's numbers (shadow mode). */
export function compare(out: VerifyOutputs, expected: Expected) {
  const actual: Record<string, number> = {
    good: out.counts.good, risky: out.counts.risky, bad: out.counts.bad,
    finalDirect: out.finalDirect.length, finalGeneric: out.finalGeneric.length,
  };
  const rows = Object.entries(expected)
    .filter(([, v]) => typeof v === 'number')
    .map(([k, v]) => ({ field: k, expected: v as number, actual: actual[k], match: actual[k] === v }));
  return { allMatch: rows.every((r) => r.match), rows };
}

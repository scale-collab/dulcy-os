// Campaign build rules, ported from the old n8n EmailBison Output Builder
// (see research/map-campaign.md, sections 2C-2F and 3). Pure functions, no I/O.
import { createHash } from 'node:crypto';
import { PermanentError } from '../errors.js';

export type OutputType = 'direct' | 'generic';

export interface CopyVariant { subject: string; body: string }
export interface CopyStep { subject: string; body: string; variants?: CopyVariant[]; threadReply?: boolean }

export const MAX_STEPS = 4;
export const MAX_VARIANTS = 10;
export const CHUNK_ROWS = 5000;
export const MAX_MAPPED_COLUMNS = 30;
const BUILT_IN_TAGS = new Set(['FIRST_NAME', 'LAST_NAME', 'COMPANY', 'EMAIL', 'TITLE', 'SENDER_FULL_NAME']);
const DENIED = new Set(['seniority', 'department', 'verified', 'connections', 'similarity', 'industrygroups', 'score', 'employees', 'country', 'startdate', 'street', 'state', 'zip', 'redirectdomain', 'mxprovider', 'description', 'keywords', 'updatedate', 'businessmodel', 'revenuerange']);
const key = (v: unknown) => String(v ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');
const EMAIL = /^[^@\s",;<>]+@[^@\s",;<>]+\.[^@\s",;<>]+$/;

/** Column aliases (normalized) for EmailBison's native fields and common custom variables. */
const ALIASES: Record<string, string[]> = {
  first_name: ['firstname', 'first'], last_name: ['lastname', 'last'], email: ['email', 'emails', 'emailaddress'],
  company: ['company', 'companyname', 'businessname'], title: ['title', 'jobtitle'],
  LINKEDIN: ['linkedin', 'linkedinurl', 'linkedinsocial', 'social', 'socialurl', 'socialurls'], PHONE: ['phone', 'phones', 'phonenumber'],
  CITY: ['city'], CONTRACTOR: ['contractor', 'contractortype'], RESTAURANT: ['restaurant', 'restaurantname'], COLLEAGUE: ['colleague', 'college'],
  Domain: ['domain', 'website'],
};
const NATIVE = ['first_name', 'last_name', 'email', 'company', 'title'];

/** Merge tags used in the copy, e.g. {CITY} or {{CITY}}. */
export function mergeTags(steps: CopyStep[]): string[] {
  const tags = new Set<string>();
  const scan = (s: string) => { for (const m of s.matchAll(/\{\{?\s*([A-Za-z][A-Za-z0-9_ ]*?)\s*\}?\}/g)) tags.add(m[1].trim()); };
  for (const st of steps) {
    scan(st.subject); scan(st.body);
    for (const v of st.variants ?? []) { scan(v.subject); scan(v.body); }
  }
  // Spintax groups {a|b} are not tags: they contain '|', which the pattern excludes.
  return [...tags];
}

/** "Hi {FIRST_NAME}," style greeting lines are removed for generic inboxes (old builder rule). */
function stripFirstNameGreeting(body: string): string {
  return body.replace(/^[ \t]*(?:\{[^}|]*\|[^}]*\}|hi|hey|hello|dear)?[ \t]*\{\{?\s*FIRST_NAME\s*\}?\}[ \t]*[,!.:-]?[ \t]*\r?\n/im, '');
}

export function validateCopy(steps: CopyStep[], outputType: OutputType): CopyStep[] {
  if (!Array.isArray(steps) || steps.length < 1 || steps.length > MAX_STEPS) throw new PermanentError(`copy must have 1-${MAX_STEPS} steps`);
  return steps.map((st, i) => {
    const variants = st.variants ?? [];
    if (variants.length + 1 > MAX_VARIANTS) throw new PermanentError(`step ${i + 1} has more than ${MAX_VARIANTS} variants`);
    const fix = (c: CopyVariant): CopyVariant => {
      if (!String(c.subject ?? '').trim() && i === 0) throw new PermanentError(`step ${i + 1} needs a subject`);
      if (!String(c.body ?? '').trim()) throw new PermanentError(`step ${i + 1} has an empty body`);
      let body = String(c.body);
      if (outputType === 'generic') {
        body = stripFirstNameGreeting(body);
        if (/FIRST_NAME/.test(body) || /FIRST_NAME/.test(c.subject)) throw new PermanentError(`step ${i + 1}: generic copy still uses {FIRST_NAME}; generic inboxes have no first name`);
      }
      return { subject: String(c.subject ?? ''), body };
    };
    const main = fix(st);
    return { ...main, threadReply: i > 0 ? st.threadReply !== false : false, variants: variants.map(fix) };
  });
}

/** EmailBison sequence payloads. The wait sits on the step before it (old builder rule). */
export function primaryStepsPayload(name: string, steps: CopyStep[], daysBetween: number) {
  const wait = Math.max(1, daysBetween);
  return {
    title: `${name} Sequence`,
    sequence_steps: steps.map((s, i) => ({ email_subject: s.subject, email_body: s.body.replace(/\r?\n/g, '<br>'), order: i + 1, wait_in_days: wait, variant: false, thread_reply: Boolean(s.threadReply) })),
  };
}

export function variantPayload(name: string, order: number, primaryId: number, v: CopyVariant, daysBetween: number, threadReply: boolean) {
  return {
    title: `${name} Step ${order} Variant`,
    sequence_steps: [{ email_subject: v.subject, email_body: v.body.replace(/\r?\n/g, '<br>'), order, wait_in_days: Math.max(1, daysBetween), variant: true, variant_from_step_id: primaryId, thread_reply: threadReply }],
  };
}

/** Stable "random" 08:xx start and 18:xx end per campaign, so a retry sets the same schedule. */
export function defaultSchedule(seed: string, timezone = 'America/New_York') {
  const h = createHash('sha256').update(seed).digest();
  const mm = (n: number) => String(n % 60).padStart(2, '0');
  return {
    monday: true, tuesday: true, wednesday: true, thursday: true, friday: true, saturday: false, sunday: false,
    start_time: `08:${mm(h[0])}`, end_time: `18:${mm(h[1])}`, timezone, save_as_template: false,
  };
}

/** Old builder settings (can_unsubscribe false is kept as-is; flagged for Lex in the research notes). */
export const DEFAULT_SETTINGS = {
  max_emails_per_day: 1000, max_new_leads_per_day: 1000, plain_text: false, open_tracking: false,
  reputation_building: false, can_unsubscribe: false, unsubscribe_text: '',
};

/** Legal suffixes are removed from company names before sending (old builder rule). */
export function cleanCompany(value: unknown): string {
  let cleaned = String(value ?? '').trim().replace(/\s+/g, ' ');
  const legal = '(?:P\\.?L\\.?L\\.?C\\.?|L\\.?L\\.?C\\.?|L\\.?L\\.?P\\.?|Inc\\.?|Incorporated|Corp\\.?|Corporation|Ltd\\.?)';
  const suffix = new RegExp(`(?:,\\s*|\\s+)(?:${legal}|\\(${legal}\\))[,\\s]*$`, 'i');
  for (;;) {
    const next = cleaned.replace(suffix, '').trim();
    if (next === cleaned || !/[\p{L}\p{N}]/u.test(next)) break;
    cleaned = next;
  }
  return cleaned;
}

export interface PreparedLeads {
  headers: string[];
  /** EmailBison destination -> CSV header. */
  columnsToMap: Record<string, string>;
  customVariables: string[];
  rows: string[][];
  droppedNoEmail: number;
  droppedDuplicate: number;
  droppedInvalid: number;
  hash: string;
}

/**
 * Turn a Final Direct / Final Generic tab (header row + rows) into the CSV the campaign gets.
 * Only Good rows are expected here; rows marked otherwise are refused.
 */
export function prepareLeads(table: string[][], o: { campaignId: number; outputType: OutputType; tags: string[] }): PreparedLeads {
  if (table.length < 2) throw new PermanentError('the lead tab has no rows');
  const head = table[0].map((h) => String(h ?? '').trim());
  const find = (aliases: string[]) => head.findIndex((h) => aliases.includes(key(h)));
  const idx: Record<string, number> = {};
  for (const [name, aliases] of Object.entries(ALIASES)) { const i = find(aliases); if (i >= 0) idx[name] = i; }
  if (idx.first_name === undefined) { const i = find(['name']); if (i >= 0) idx.first_name = i; }
  if (idx.email === undefined) throw new PermanentError('the lead tab has no email column');

  const tagIndex: Record<string, number> = {};
  for (const tag of o.tags) {
    if (BUILT_IN_TAGS.has(tag.toUpperCase()) || /^SENDER_/i.test(tag)) continue;
    if (DENIED.has(key(tag))) throw new PermanentError(`the copy uses {${tag}}, which is a blocked lead-list column`);
    const known = Object.entries(ALIASES).find(([n]) => n.toUpperCase() === tag.toUpperCase());
    const i = known ? (idx[known[0]] ?? -1) : find([key(tag)]);
    if (i < 0) throw new PermanentError(`the copy uses {${tag}} but the lead tab has no such column`);
    tagIndex[tag] = i;
  }
  const statusI = find(['verificationstatus']);
  const attr = (name: string) => find([key(name)]);
  const attribution = `DULCY_VERIFICATION_${o.campaignId}`;

  const custom: string[] = [];
  const addCustom = (n: string) => { if (!custom.includes(n)) custom.push(n); };
  for (const n of ['LINKEDIN', 'PHONE', 'CITY', 'CONTRACTOR', 'RESTAURANT', 'COLLEAGUE', 'Domain']) if (idx[n] !== undefined) addCustom(n);
  for (const t of Object.keys(tagIndex)) addCustom(t);
  for (const n of ['Verification Provider', 'Email Type', 'Verification Path', attribution]) addCustom(n);
  const headers = [...NATIVE, ...custom];
  if (headers.length > MAX_MAPPED_COLUMNS) throw new PermanentError(`${headers.length} columns to map; EmailBison upload allows ${MAX_MAPPED_COLUMNS}`);

  const cell = (row: string[], i: number | undefined) => (i === undefined || i < 0 ? '' : String(row[i] ?? '').trim());
  const seen = new Set<string>();
  const rows: string[][] = [];
  let droppedNoEmail = 0, droppedDuplicate = 0, droppedInvalid = 0;
  for (const row of table.slice(1)) {
    const email = cell(row, idx.email).toLowerCase();
    if (!email) { droppedNoEmail++; continue; }
    if (!EMAIL.test(email)) { droppedInvalid++; continue; }
    if (seen.has(email)) { droppedDuplicate++; continue; }
    if (statusI >= 0 && cell(row, statusI) && cell(row, statusI).toLowerCase() !== 'good') throw new PermanentError('the lead tab has a row that is not verified Good; only Final tabs can be uploaded');
    seen.add(email);
    const company = cleanCompany(cell(row, idx.company));
    const first = o.outputType === 'generic' ? (company || 'Team') : (cell(row, idx.first_name) || company || 'Team');
    const values: Record<string, string> = {
      first_name: first, last_name: cell(row, idx.last_name), email, company, title: cell(row, idx.title),
    };
    for (const n of ['LINKEDIN', 'PHONE', 'CITY', 'CONTRACTOR', 'RESTAURANT', 'COLLEAGUE', 'Domain']) if (idx[n] !== undefined) values[n] = cell(row, idx[n]);
    for (const [t, i] of Object.entries(tagIndex)) values[t] = cell(row, i);
    const provider = cell(row, attr('Verification Provider')) || 'MillionVerifier';
    const emailType = o.outputType === 'generic' ? 'Generic' : 'Direct';
    const path = cell(row, attr('Verification Path')) || 'MillionVerifier valid';
    values['Verification Provider'] = provider;
    values['Email Type'] = emailType;
    values['Verification Path'] = path;
    values[attribution] = JSON.stringify({ provider, emailType, path, sourceVersion: cell(row, attr('Source Version')), originalResult: cell(row, attr('Original MillionVerifier Result')) || 'Unknown' });
    rows.push(headers.map((h) => values[h] ?? ''));
  }
  if (rows.length === 0) throw new PermanentError('no uploadable leads in the tab');
  const columnsToMap: Record<string, string> = {};
  for (const h of headers) columnsToMap[h] = h;
  const hash = createHash('sha256').update(rows.map((r) => r[2]).sort().join('\n')).digest('hex').slice(0, 12);
  return { headers, columnsToMap, customVariables: custom, rows, droppedNoEmail, droppedDuplicate, droppedInvalid, hash };
}

export function toCsv(headers: string[], rows: string[][]): string {
  const q = (v: string) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  return [headers.map(q).join(','), ...rows.map((r) => r.map(q).join(','))].join('\n') + '\n';
}

export function chunks<T>(rows: T[], size = CHUNK_ROWS): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < rows.length; i += size) out.push(rows.slice(i, i + size));
  return out;
}

/** Sender limit: no more senders than the leads can keep busy (old screen rule). */
export function senderCap(leads: number, daysBetween: number, dailyLimit = 15): number {
  return Math.max(1, Math.ceil(leads / Math.max(1, daysBetween) / Math.max(1, dailyLimit)));
}

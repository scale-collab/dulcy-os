// Reads lead rows from a lead list's Google Sheet ("project workbook"), with the same
// rules as the old n8n verification workflow:
//  - Direct contacts come from the "Contacts" tab. A row needs a company domain and
//    either an email or a first + last name (no email = counted as missing_email).
//  - Generic emails come from the "Expanded Companies" tab, column public_emails
//    (a JSON list, or text split on ; , or new lines). Malformed ones are skipped.
//  - The company's digital footprint is kept for the "200 or less" filter.
// Only the columns needed are downloaded, so big tabs stay fast.
import type { SheetsClient } from '../providers/google.js';
import type { InputRow } from '../verify/rules.js';
import { PermanentError } from '../errors.js';

export interface SheetSource {
  sheetId: string;
  contactsTab?: string;
  companiesTab?: string;
}

const norm = (s: unknown) => String(s ?? '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
const domainOf = (v: string) => {
  let x = v.trim().toLowerCase();
  x = x.replace(/^https?:\/\//, '').replace(/^www\./, '');
  return x.split('/')[0];
};
const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

/** Header names (normalized) each output field may come from, in priority order. */
const CONTACT_COLS: Record<string, string[]> = {
  email: ['email', 'email_address'], name: ['name', 'full_name'], firstName: ['first_name', 'firstname'], lastName: ['last_name', 'lastname'],
  title: ['title', 'job_title'], company: ['company', 'company_name'], domain: ['domain', 'website', 'company_domain'],
  linkedin: ['linkedin_url', 'linkedin'], country: ['country'], state: ['state', 'region'],
};
const COMPANY_COLS: Record<string, string[]> = {
  footprint: ['digital_footprint', 'digital_footprint_score', 'score'], domain: ['domain', 'website', 'company_domain'],
  company: ['name', 'company', 'company_name'], address: ['address'], publicEmails: ['public_emails', 'public_email', 'emails'],
};

/** Accepts a sheet ID or a full Google Sheets link. */
export function sheetIdFrom(v: string): string {
  const m = v.match(/\/spreadsheets\/d\/([A-Za-z0-9_-]{20,})/);
  const id = m ? m[1] : v.trim();
  if (!/^[A-Za-z0-9_-]{20,}$/.test(id)) throw new PermanentError('lead list sheet link or ID is not valid');
  return id;
}

/** A table: list of objects keyed by output field, from header + whole columns. */
export function table(header: string[], wanted: Record<string, string[]>): { indexes: number[]; fields: string[][] } {
  const h = header.map(norm);
  const indexes: number[] = [];
  const fields: string[][] = [];
  for (const [field, names] of Object.entries(wanted)) {
    for (const n of names) {
      const i = h.indexOf(n);
      if (i >= 0) { indexes.push(i); fields.push([field, n]); }
    }
  }
  return { indexes, fields };
}

/** Rebuild rows from downloaded columns; for each field the first non-empty candidate column wins. */
function rowsFromColumns(fields: string[][], columns: string[][]): Record<string, string>[] {
  const n = Math.max(0, ...columns.map((c) => c.length));
  const out: Record<string, string>[] = [];
  for (let r = 1; r < n; r++) {
    const row: Record<string, string> = {};
    fields.forEach(([field], ci) => {
      const v = String(columns[ci]?.[r] ?? '').trim();
      if (v && !row[field]) row[field] = v;
    });
    out.push(row);
  }
  return out;
}

export function directRows(rows: Record<string, string>[]): InputRow[] {
  const out: InputRow[] = [];
  for (const g of rows) {
    const parts = (g.name ?? '').split(/\s+/).filter(Boolean);
    const firstName = g.firstName || parts[0] || '';
    const lastName = g.lastName || parts.slice(1).join(' ');
    const domain = domainOf(g.domain ?? '');
    const email = (g.email ?? '').toLowerCase();
    if (!domain || !(email || (firstName && lastName))) continue;
    out.push({ type: 'direct', email, firstName, lastName, title: g.title ?? '', company: g.company ?? '', domain, linkedin: g.linkedin ?? '', country: g.country ?? '', state: g.state ?? '' });
  }
  return out;
}

export function genericRows(rows: Record<string, string>[]): InputRow[] {
  const out: InputRow[] = [];
  for (const g of rows) {
    const raw = g.publicEmails ?? '';
    if (!raw) continue;
    let list: unknown[];
    try { const p = JSON.parse(raw); list = Array.isArray(p) ? p : [p]; } catch { list = raw.split(/[;,\n]+/); }
    const fp = g.footprint ?? '';
    const footprint = /^\d+(?:\.\d+)?$/.test(fp) ? Number(fp) : null;
    for (const item of list) {
      const email = String((item as { email?: unknown })?.email ?? item ?? '').trim().toLowerCase();
      if (!EMAIL.test(email)) continue;
      out.push({ type: 'generic', email, company: g.company ?? '', domain: domainOf(g.domain ?? ''), country: g.address ?? '', footprint });
    }
  }
  return out;
}

export async function loadSheetRows(sheets: SheetsClient, src: SheetSource, opts: { includeDirect: boolean; includeGeneric: boolean }): Promise<InputRow[]> {
  const sheetId = sheetIdFrom(src.sheetId);
  const rows: InputRow[] = [];
  if (opts.includeDirect) {
    const tab = src.contactsTab ?? 'Contacts';
    const t = table(await sheets.header(sheetId, tab), CONTACT_COLS);
    if (!t.fields.some(([f]) => f === 'domain')) throw new PermanentError(`tab "${tab}" has no domain/website column`);
    rows.push(...directRows(rowsFromColumns(t.fields, await sheets.columns(sheetId, tab, t.indexes))));
  }
  if (opts.includeGeneric) {
    const tab = src.companiesTab ?? 'Expanded Companies';
    const t = table(await sheets.header(sheetId, tab), COMPANY_COLS);
    if (t.fields.some(([f]) => f === 'publicEmails')) {
      rows.push(...genericRows(rowsFromColumns(t.fields, await sheets.columns(sheetId, tab, t.indexes))));
    }
  }
  return rows;
}

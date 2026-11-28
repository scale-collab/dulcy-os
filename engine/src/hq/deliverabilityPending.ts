// Deliverability round 4 (Riley's diagnosis, 2026-11-28): on 11/27 the placement run started 398
// tests for Dulcy; 249 were scored (Inbox Placement Testing, Dulcy base) and 149 were still waiting
// at EmailGuard. The waiting ones sit in the "Tests" table of the separate Inbox Placement Tests base
// (Status = Pending, with an EmailGuard Test ID). The Placement tab says "249 scored · 149 waiting
// for EmailGuard" instead of implying 149 were skipped.
// READ ONLY: Email, Workspace ID, Test ID and Status only (no key or password field exists there, and
// none is read). Cached with the placement tests (10 minutes). If the server's Airtable token cannot
// read that base, it fails softly: the tab shows only the scored count, with no error banner.
import { createAirtableClient, type AirtableRecord } from '../providers/airtable.js';
import { val } from '../agents/emailsFields.js';

/** The Inbox Placement Tests base (airtable/README.md) and its Tests table. */
export const PENDING_BASE = 'appP0WXcqWoGSIhh5';
export const PENDING_TABLE = 'tblDJL0agDRpo94La';
export const PF = { email: 'fldyUQgKpVSe6cXq2', workspaceId: 'fldYLVxZv85c0TElX', testId: 'fldyMlhKmTMm5EC9n', status: 'fldcTv5vyBtqE0WUu' } as const;
/** Only tests started in the last 8 days count (older Pending rows are leftovers, not this week's run). */
export const PENDING_WINDOW_DAYS = 8;
export const PENDING_FORMULA = `AND({Status}='Pending',{Test ID}!='',IS_AFTER(CREATED_TIME(),DATEADD(NOW(),-${PENDING_WINDOW_DAYS},'days')))`;

/** null = not connected / not readable (fail softly). */
export type PendingReader = () => Promise<AirtableRecord[]> | null;
const defaultReader: PendingReader = () => {
  const apiKey = String(process.env.AIRTABLE_API_KEY ?? '').trim();
  if (!apiKey) return null;
  const at = createAirtableClient({ apiKey, baseId: PENDING_BASE, baseUrl: process.env.AIRTABLE_BASE_URL || undefined, timeoutMs: 15_000 });
  return at.list(PENDING_TABLE, PENDING_FORMULA, Object.values(PF), 3000);
};
let reader: PendingReader = defaultReader;
/** Tests swap in a fake; null restores the real one. */
export function setPendingTestsReader(fn: PendingReader | null) { reader = fn ?? defaultReader; }
/** The pending rows, or null when the base cannot be read (never throws). */
export async function readPendingTests(): Promise<AirtableRecord[] | null> {
  try { const p = reader(); return p ? await p : null; } catch { return null; }
}

export interface PendingTest { email: string; workspaceId: string; at: string }
/** Rows → the fields HQ uses (only Pending rows with a Test ID: the formula filters, checked again). Pure. */
export function pendingTests(rows: AirtableRecord[]): PendingTest[] {
  return rows.filter((r) => /^pending$/i.test(val(r.fields[PF.status])) && val(r.fields[PF.testId]))
    .map((r) => ({ email: val(r.fields[PF.email]).toLowerCase(), workspaceId: val(r.fields[PF.workspaceId]), at: r.createdTime ?? '' }))
    .filter((t) => t.at);
}

export interface PendingCount { connected: boolean; waiting: number; since: string }
/**
 * How many tests of the newest run are still waiting for EmailGuard: pending tests started on or
 * after that run's date (New York day), for the client shown. Inboxes already scored that day are
 * not counted twice. Pure.
 */
export function waitingForRun(pending: (PendingTest & { clientKey: string; date: string })[] | null, since: string, scored: Set<string>, client?: string): PendingCount {
  if (!pending) return { connected: false, waiting: 0, since };
  const seen = new Set<string>();
  for (const t of pending) {
    if (!t.clientKey || (client && t.clientKey !== client) || (since && t.date < since) || scored.has(t.email)) continue;
    seen.add(t.email || `${t.workspaceId}:${t.at}`);
  }
  return { connected: true, waiting: seen.size, since };
}

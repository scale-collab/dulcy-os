// Close → Airtable "Won" sync (Alex 2026-11-28: "It should be marked [Won] in Close and then it feeds
// back to Airtable."). Close is the source of truth; Airtable Sales Data follows.
//   - Why: Airtable's Sales Goals rollups (Total Deals Closed, Revenue Closed, Avg Days to Close) count
//     Sales Data rows through the "Closed Month" link. The Airtable automation "Autoupdate for
//     Booked/Closed Month" (wflocVtavhmJiwWES) sets that link when Deal Closed? is ticked, from the
//     month of Deal Closed Date. No row was ever marked, so the n8n goals workflow reads 0 closed.
//   - What it writes (Sales Data only, only missing values, only toward Won):
//       Sales Pipeline Stage = "Won", Deal Closed? = true, Deal Closed Date = Close's won date,
//       Offer Amount (Revenue Closed) = Close's value (only when empty and the value is monthly or one-time).
//     Nothing else: no other field, no other row, never Close, never a message.
//   - Matching: the Close lead's contact emails against Sales Data "Contact Email" first, then the
//     company (lead name vs "Account/Company Name"). Never guessed: two rows (or none) = skipped, with why.
//   - Gate: dry run ("would mark Won") unless sales.won_sync is in LIVE_STAGES (or DRY_RUN=false).
//     Each real change gets an Activity Log row (agent Cole). Every result is kept in hq_won_sync, which
//     HQ Sales shows under the goals ("N deals marked Won from Close", skipped ones with Have Cole fix it).
import type { Db } from '../db/pool.js';
import type { Config } from '../config.js';
import { createAirtableClient, type AirtableRecord } from '../providers/airtable.js';
import { createCloseClient, type CloseClient, type CloseOpportunity } from '../providers/close.js';
import { logActivity } from '../activity.js';
import { PermanentError } from '../errors.js';
import type { Stage } from '../stages/index.js';
import { SALES_T, SF, companyKey } from './sales.js';

export const WON_SYNC_STAGE = 'sales.won_sync';
/** Close reads per run: won opportunities updated in the last LOOKBACK_DAYS, at most MAX_PAGES x 100; at most MAX_LEADS lead reads. */
export const WON_SYNC_LIMITS = { lookbackDays: 180, maxPages: 3, maxLeads: 40, maxSalesRows: 2000 } as const;
/** The Sales Data fields this sync may write (field IDs). Anything else is refused in wonPatch. */
export const WON_FIELDS = { stage: SF.stage, closed: SF.closed, closedDate: SF.closedDate, offer: SF.offer } as const;
export const WON_CHOICE = 'Won';
const READ = [SF.opp, SF.company, SF.contact, SF.email, SF.stage, SF.closed, SF.closedDate, SF.offer];

const s = (v: unknown): string => (Array.isArray(v) ? s(v[0]) : v === undefined || v === null ? '' : typeof v === 'object' ? String((v as any).name ?? '') : String(v)).trim();
const yes = (v: unknown) => v === true || v === 1 || s(v).toLowerCase() === 'true';
const num = (v: unknown) => { const t = s(v); const x = Number(t); return t !== '' && Number.isFinite(x) ? x : null; };
const emailsIn = (v: unknown): string[] => [...new Set(s(v).toLowerCase().split(/[\s,;]+/).filter((e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)))];
const isDulcy = (e: string) => /@dulcy\.io$/i.test(e);

// ---------- pure parts ----------
export interface SalesRow { id: string; label: string; company: string; emails: string[]; stage: string; closed: boolean; closedDate: string; offer: number | null }
export function salesRowOf(r: AirtableRecord): SalesRow {
  const f = r.fields;
  return {
    id: r.id, label: s(f[SF.opp]) || [s(f[SF.contact]), s(f[SF.company])].filter(Boolean).join(' · ') || r.id,
    company: s(f[SF.company]), emails: emailsIn(f[SF.email]), stage: s(f[SF.stage]), closed: yes(f[SF.closed]), closedDate: s(f[SF.closedDate]), offer: num(f[SF.offer]),
  };
}
export interface WonLead { name: string; emails: string[] }
export type MatchResult =
  | { kind: 'match'; row: SalesRow; by: 'email' | 'company'; note: string }
  | { kind: 'ambiguous'; by: 'email' | 'company'; rows: SalesRow[]; note: string }
  | { kind: 'no_match'; note: string };
const fewRows = (rs: SalesRow[]) => rs.slice(0, 4).map((r) => `"${r.label}"`).join(', ') + (rs.length > 4 ? ` +${rs.length - 4} more` : '');
/** Several rows for one deal: only the single row already marked Won is taken (the deal is already counted). */
const narrow = (rs: SalesRow[]) => { const won = rs.filter((r) => r.stage === WON_CHOICE); return won.length === 1 ? won[0] : null; };

/**
 * The Sales Data row for a won Close lead. Contact emails first (Dulcy's own addresses ignored), then the
 * company name (the same company key HQ Sales uses, at least 3 letters). One row = a match; two or more
 * = ambiguous (unless exactly one of them is already Won); none = no match. Never guessed. Pure.
 */
export function matchSalesRow(lead: WonLead, rows: SalesRow[]): MatchResult {
  const emails = [...new Set(lead.emails.map((e) => e.trim().toLowerCase()).filter((e) => e && !isDulcy(e)))];
  if (emails.length) {
    const hits = rows.filter((r) => r.emails.some((e) => emails.includes(e)));
    if (hits.length === 1) return { kind: 'match', row: hits[0], by: 'email', note: `Matched by email (${hits[0].emails.find((e) => emails.includes(e))}).` };
    if (hits.length > 1) {
      const one = narrow(hits);
      if (one) return { kind: 'match', row: one, by: 'email', note: `Matched by email; ${hits.length} rows have it, only "${one.label}" is already Won.` };
      return { kind: 'ambiguous', by: 'email', rows: hits, note: `${hits.length} Sales Data rows have the contact email ${emails.filter((e) => hits.some((r) => r.emails.includes(e))).join(' / ')}: ${fewRows(hits)}. Not guessed.` };
    }
  }
  const key = companyKey(lead.name);
  if (key.length < 3) return { kind: 'no_match', note: `No Sales Data row has ${emails.length ? emails.join(' or ') : 'a contact email of this lead'}, and the lead name "${lead.name}" is too short to match a company.` };
  const hits = rows.filter((r) => r.company && companyKey(r.company) === key);
  if (hits.length === 1) return { kind: 'match', row: hits[0], by: 'company', note: `Matched by company ("${lead.name}" = "${hits[0].company}"); no row had the contact email.` };
  if (hits.length > 1) {
    const one = narrow(hits);
    if (one) return { kind: 'match', row: one, by: 'company', note: `Matched by company; ${hits.length} rows for "${lead.name}", only "${one.label}" is already Won.` };
    return { kind: 'ambiguous', by: 'company', rows: hits, note: `No row has the contact email, and ${hits.length} Sales Data rows are for "${lead.name}": ${fewRows(hits)}. Not guessed.` };
  }
  return { kind: 'no_match', note: `No Sales Data row has ${emails.length ? emails.join(' or ') : 'a contact email of this lead'} or the company "${lead.name}".` };
}

export interface WonChange { field: 'Sales Pipeline Stage' | 'Deal Closed?' | 'Deal Closed Date' | 'Offer Amount (Revenue Closed)'; from: string; to: string }
/**
 * The fields to write so the goals rollup counts this deal: only what is missing, only toward Won.
 * An existing Deal Closed Date or Offer Amount is never changed. Empty = already Won (no write). Pure.
 */
export function wonPatch(row: SalesRow, opp: Pick<CloseOpportunity, 'won' | 'value' | 'valuePeriod'>): { fields: Record<string, unknown>; changes: WonChange[]; notes: string[] } {
  const fields: Record<string, unknown> = {}; const changes: WonChange[] = []; const notes: string[] = [];
  if (row.stage !== WON_CHOICE) { fields[WON_FIELDS.stage] = WON_CHOICE; changes.push({ field: 'Sales Pipeline Stage', from: row.stage, to: WON_CHOICE }); }
  if (!row.closed) { fields[WON_FIELDS.closed] = true; changes.push({ field: 'Deal Closed?', from: 'unticked', to: 'ticked' }); }
  const wonDay = /^\d{4}-\d{2}-\d{2}/.test(opp.won) ? opp.won.slice(0, 10) : '';
  if (!row.closedDate) {
    if (wonDay) { fields[WON_FIELDS.closedDate] = wonDay; changes.push({ field: 'Deal Closed Date', from: '', to: wonDay }); }
    else notes.push('Close has no won date, so Deal Closed Date stays empty (the goals month cannot be linked).');
  }
  if (row.offer === null) {
    const v = opp.value;
    if (v !== null && v > 0 && ['monthly', 'one_time'].includes(opp.valuePeriod)) {
      fields[WON_FIELDS.offer] = v; changes.push({ field: 'Offer Amount (Revenue Closed)', from: '', to: `$${v.toLocaleString('en-US')}` });
    } else if (v !== null && v > 0) notes.push(`Offer Amount left empty: Close's value is ${opp.valuePeriod || 'of no period'}, not monthly or one-time.`);
  }
  for (const k of Object.keys(fields)) if (!(Object.values(WON_FIELDS) as string[]).includes(k)) throw new Error(`won sync may not write ${k}`);
  return { fields, changes, notes };
}

// ---------- storage (HQ's own table, created on first use) ----------
let table: Promise<void> | null = null;
export function _resetWonSyncTable() { table = null; }
export function ensureWonSync(db: Db): Promise<void> {
  table ??= db.query(`
    CREATE TABLE IF NOT EXISTS hq_won_sync (
      opp_id TEXT PRIMARY KEY, lead_id TEXT NOT NULL DEFAULT '', lead_name TEXT NOT NULL DEFAULT '', won_date TEXT NOT NULL DEFAULT '',
      opp_updated TEXT NOT NULL DEFAULT '', status TEXT NOT NULL, record_id TEXT NOT NULL DEFAULT '', row_label TEXT NOT NULL DEFAULT '',
      match_by TEXT NOT NULL DEFAULT '', changes JSONB NOT NULL DEFAULT '[]', note TEXT NOT NULL DEFAULT '', job_id BIGINT,
      marked_at TIMESTAMPTZ, created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );`).then(() => undefined);
  table.catch(() => { table = null; });
  return table;
}
export type WonStatus = 'marked' | 'planned' | 'already' | 'ambiguous' | 'no_match' | 'failed';
export interface WonSyncRow { oppId: string; leadId: string; leadName: string; wonDate: string; status: WonStatus; recordId: string; rowLabel: string; matchBy: string; changes: WonChange[]; note: string; markedAt: string; updated: string; closeUrl: string }
const rowOut = (r: any): WonSyncRow => ({
  oppId: r.opp_id, leadId: r.lead_id, leadName: r.lead_name, wonDate: r.won_date, status: r.status, recordId: r.record_id, rowLabel: r.row_label, matchBy: r.match_by,
  changes: Array.isArray(r.changes) ? r.changes : [], note: r.note, markedAt: r.marked_at ? new Date(r.marked_at).toISOString() : '', updated: new Date(r.updated_at).toISOString(),
  closeUrl: /^lead_[A-Za-z0-9]+$/.test(r.lead_id) ? `https://app.close.com/lead/${r.lead_id}/` : '',
});

// ---------- the sweep ----------
export interface WonSyncDeps {
  db: Db; cfg: Pick<Config, 'airtableApiKey' | 'airtableBaseId' | 'airtableBaseUrl'>;
  close: Pick<CloseClient, 'wonOpportunities' | 'leadDetail'>;
  at: { list: (table: string, formula: string, fields: string[], max?: number) => Promise<AirtableRecord[]>; update: (table: string, id: string, fields: Record<string, unknown>) => Promise<void> };
  live: boolean; jobId?: number; now?: number;
  /** The Airtable write (the stage runs it as a receipted call). Default: at.update on Sales Data. */
  write?: (recordId: string, fields: Record<string, unknown>, oppId: string) => Promise<void>;
  activityAt?: Parameters<typeof logActivity>[2];
}
export interface WonSyncResult { message: string; dryRun: boolean; read: number; truncated: boolean; marked: number; planned: number; already: number; skipped: number; failed: number; unchecked: number; lines: string[] }

/** One run: won opportunities in Close → their Sales Data rows → Won (live) or "would mark Won" (dry run). */
export async function wonSync(x: WonSyncDeps): Promise<WonSyncResult> {
  await ensureWonSync(x.db);
  const now = x.now ?? Date.now();
  const since = new Date(now - WON_SYNC_LIMITS.lookbackDays * 86_400_000).toISOString();
  const { opps, truncated } = await x.close.wonOpportunities(since, WON_SYNC_LIMITS.maxPages);
  const prior = new Map<string, any>((await x.db.query(`SELECT * FROM hq_won_sync WHERE opp_id = ANY($1)`, [opps.map((o) => o.id)])).rows.map((r) => [r.opp_id, r]));
  // Done and unchanged in Close since: nothing to read again (an Airtable edit by hand is never fought).
  const todo = opps.filter((o) => { const p = prior.get(o.id); return !(p && ['marked', 'already'].includes(p.status) && p.opp_updated === o.updated); });
  const res: WonSyncResult = { message: '', dryRun: !x.live, read: opps.length, truncated, marked: 0, planned: 0, already: opps.length - todo.length, skipped: 0, failed: 0, unchecked: 0, lines: [] };
  if (!todo.length) { res.message = `${opps.length} won in Close, all already Won in Sales Data`; return res; }
  const rows = (await x.at.list(SALES_T, '', READ, WON_SYNC_LIMITS.maxSalesRows)).map(salesRowOf);
  const save = async (o: CloseOpportunity, leadName: string, status: WonStatus, f: { row?: SalesRow; by?: string; changes?: WonChange[]; note: string }) => {
    const p = prior.get(o.id);
    // A row this sync marked stays "marked" when a later run finds it already Won.
    const st: WonStatus = status === 'already' && p?.status === 'marked' ? 'marked' : status;
    await x.db.query(`INSERT INTO hq_won_sync (opp_id, lead_id, lead_name, won_date, opp_updated, status, record_id, row_label, match_by, changes, note, job_id, marked_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12, CASE WHEN $6='marked' THEN now() END)
      ON CONFLICT (opp_id) DO UPDATE SET lead_id=EXCLUDED.lead_id, lead_name=EXCLUDED.lead_name, won_date=EXCLUDED.won_date, opp_updated=EXCLUDED.opp_updated, status=EXCLUDED.status,
        record_id=EXCLUDED.record_id, row_label=EXCLUDED.row_label, match_by=EXCLUDED.match_by,
        changes=CASE WHEN EXCLUDED.status='marked' AND hq_won_sync.status='marked' AND EXCLUDED.changes='[]'::jsonb THEN hq_won_sync.changes ELSE EXCLUDED.changes END,
        note=EXCLUDED.note, job_id=EXCLUDED.job_id, marked_at=COALESCE(hq_won_sync.marked_at, EXCLUDED.marked_at), updated_at=now()`,
      [o.id, o.leadId, leadName.slice(0, 200), o.won.slice(0, 10), o.updated, st, f.row?.id ?? '', (f.row?.label ?? '').slice(0, 200), f.by ?? '', JSON.stringify(f.changes ?? []), f.note.slice(0, 1000), x.jobId ?? null]);
  };
  const touched = new Set<string>();
  let leadReads = 0;
  for (const o of todo) {
    if (leadReads >= WON_SYNC_LIMITS.maxLeads) { res.unchecked++; continue; }
    leadReads++;
    const lead = await x.close.leadDetail(o.leadId);
    const name = lead?.name || o.leadName || o.leadId;
    if (!lead) { res.skipped++; await save(o, name, 'no_match', { note: `The Close lead ${o.leadId} could not be read, so nothing was matched.` }); continue; }
    const m = matchSalesRow({ name, emails: lead.contacts.flatMap((c) => c.emails) }, rows);
    if (m.kind !== 'match') { res.skipped++; res.lines.push(`${name}: skipped (${m.kind === 'ambiguous' ? 'ambiguous' : 'no Sales Data row'})`); await save(o, name, m.kind, { by: m.kind === 'ambiguous' ? m.by : '', note: m.note }); continue; }
    if (touched.has(m.row.id)) { res.already++; await save(o, name, 'already', { row: m.row, by: m.by, note: `${m.note} The same row was handled for another won opportunity in this run.` }); continue; }
    touched.add(m.row.id);
    const p = wonPatch(m.row, o);
    const extra = p.notes.length ? ` ${p.notes.join(' ')}` : '';
    if (!p.changes.length) { res.already++; await save(o, name, 'already', { row: m.row, by: m.by, note: `"${m.row.label}" is already Won in Sales Data. ${m.note}${extra}` }); continue; }
    const line = p.changes.map((c) => `${c.field} ${c.from || 'empty'} → ${c.to}`).join(', ');
    if (!x.live) {
      res.planned++; res.lines.push(`${name}: would mark Won "${m.row.label}" (${line})`);
      await save(o, name, 'planned', { row: m.row, by: m.by, changes: p.changes, note: `Would mark Won (sales.won_sync is not in LIVE_STAGES): ${line}. ${m.note}${extra}` });
      continue;
    }
    try {
      await (x.write ?? ((id, fields) => x.at.update(SALES_T, id, fields)))(m.row.id, p.fields, o.id);
    } catch (e) {
      res.failed++; res.lines.push(`${name}: Airtable did not take the change`);
      await save(o, name, 'failed', { row: m.row, by: m.by, changes: p.changes, note: `Airtable did not take the change: ${String((e as Error).message ?? e).slice(0, 200)}` });
      continue;
    }
    res.marked++; res.lines.push(`${name}: marked Won "${m.row.label}" (${line})`);
    await save(o, name, 'marked', { row: m.row, by: m.by, changes: p.changes, note: `${line}. ${m.note}${extra}` });
    await logActivity(x.cfg, {
      event: `Cole marked Won from Close: ${name}`, type: 'Step done', agent: 'Cole',
      details: `Sales Data "${m.row.label}" (${m.row.id}): ${line}\n${m.note}${extra}\nClose opportunity ${o.id}, won ${o.won.slice(0, 10) || 'date unknown'}.`, jobId: x.jobId,
    }, x.activityAt);
  }
  const bits = [`${opps.length} won in Close`, x.live ? `${res.marked} marked Won` : `${res.planned} would be marked Won (dry run)`, `${res.already} already Won`, `${res.skipped} skipped`];
  if (res.failed) bits.push(`${res.failed} failed`);
  if (res.unchecked) bits.push(`${res.unchecked} left for the next run`);
  if (truncated) bits.push('more won deals in Close than one run reads');
  res.message = bits.join(', ');
  return res;
}

// ---------- HQ: the summary under the goals ----------
export interface WonSyncView {
  live: boolean; lastRun: string;
  marked: number; markedThisMonth: number; planned: number; already: number;
  /** One line for the goals card. */
  text: string;
  /** Won in Close but not marked in Sales Data: each with why, for "Have Cole fix it". */
  skipped: { oppId: string; leadName: string; wonDate: string; status: WonStatus; note: string; closeUrl: string; fix: { agent: 'Cole'; title: string; detail: string } }[];
}
const plural = (k: number, one: string, many = `${one}s`) => `${k} ${k === 1 ? one : many}`;
/** What HQ shows: counts and the skipped deals (no money). month = YYYY-MM (New York). */
export async function wonSyncView(db: Db, cfg: Pick<Config, 'dryRun' | 'liveStages' | 'closeApiKey'>, month: string): Promise<WonSyncView | null> {
  if (!cfg.closeApiKey) return null;
  await ensureWonSync(db);
  const rows = (await db.query(`SELECT * FROM hq_won_sync ORDER BY won_date DESC, opp_id LIMIT 300`)).rows.map(rowOut);
  const live = !cfg.dryRun || cfg.liveStages.includes(WON_SYNC_STAGE);
  const last = (await db.query(`SELECT max(updated_at) AS at FROM jobs WHERE kind=$1 AND status='succeeded'`, [WON_SYNC_STAGE]).catch(() => ({ rows: [] as any[] }))).rows[0]?.at;
  const count = (st: WonStatus) => rows.filter((r) => r.status === st).length;
  const marked = count('marked'), planned = count('planned'), already = count('already');
  const markedThisMonth = rows.filter((r) => r.status === 'marked' && r.wonDate.slice(0, 7) === month).length;
  const skippedRows = rows.filter((r) => ['ambiguous', 'no_match', 'failed'].includes(r.status));
  const text = !rows.length
    ? (last ? 'No won deals in Close in the last 180 days.' : 'The Close → Sales Data Won sync has not run yet.')
    : live
      ? `${plural(marked, 'deal')} marked Won from Close${markedThisMonth ? ` (${markedThisMonth} this month)` : ''}${already ? `, ${already} already Won` : ''}${skippedRows.length ? `, ${skippedRows.length} skipped` : ''}.`
      : `Not switched on yet: ${plural(planned, 'deal')} would be marked Won from Close${already ? `, ${already} already Won` : ''}${skippedRows.length ? `, ${skippedRows.length} skipped` : ''}.`;
  return {
    live, lastRun: last ? new Date(last).toISOString() : '', marked, markedThisMonth, planned, already, text,
    skipped: skippedRows.slice(0, 20).map((r) => ({
      oppId: r.oppId, leadName: r.leadName, wonDate: r.wonDate, status: r.status, note: r.note, closeUrl: r.closeUrl,
      fix: {
        agent: 'Cole',
        title: `Won in Close, not marked Won in Sales Data: ${r.leadName}`.slice(0, 200),
        detail: [`Close opportunity ${r.oppId} (${r.closeUrl || r.leadId}), won ${r.wonDate || 'date unknown'}.`, `Why it was skipped: ${r.note}`,
          'Your part: find the right Sales Data row (or say none exists) so the sync can mark it Won: fix the contact email or company on the row, or remove the duplicate row.',
          "Approval rules apply: prepare the change and wait for Alex's ✅ in HQ before changing Airtable. Never change Close; nothing is sent to anyone."].join('\n').slice(0, 2000),
      },
    })),
  };
}

// ---------- the engine stage (every WON_SYNC_EVERY_MIN, scheduler.ts) ----------
/** sales.won_sync: dry run ("would mark Won") unless sales.won_sync is in LIVE_STAGES. Reads Close, writes only the Won fields of Sales Data. */
export const wonSyncStage: Stage = async (ctx) => {
  const cfg = ctx.cfg;
  if (!cfg.closeApiKey) throw new PermanentError('no CLOSE_API_KEY on the server');
  if (!cfg.airtableApiKey) throw new PermanentError('no AIRTABLE_API_KEY on the server');
  const close = createCloseClient(cfg.closeApiKey)!;
  const at = createAirtableClient({ apiKey: cfg.airtableApiKey, baseId: cfg.airtableBaseId, baseUrl: cfg.airtableBaseUrl });
  const r = await wonSync({
    db: ctx.db, cfg, close, at, live: !ctx.dryRun, jobId: ctx.job.id,
    // Receipted, so a write is never made twice; an unclear attempt is checked against the row first.
    write: (id, fields, oppId) => ctx.paid({
      callKey: `won:${oppId}:${id}`, provider: 'airtable', units: 0,
      run: async () => { await at.update(SALES_T, id, fields); return { ok: true }; },
      dryRunResult: () => { throw new PermanentError('dry run: Sales Data not changed'); },
      reconcile: async () => {
        const cur = await at.get(SALES_T, id, Object.keys(fields));
        return cur && Object.entries(fields).every(([k, v]) => (v === true ? yes(cur.fields[k]) : s(cur.fields[k]) === s(v))) ? { ok: true } : null;
      },
    }).then(() => undefined),
  });
  await ctx.log('won sync', { marked: r.marked, planned: r.planned, already: r.already, skipped: r.skipped, failed: r.failed, lines: r.lines.slice(0, 30) });
  return { ...r };
};

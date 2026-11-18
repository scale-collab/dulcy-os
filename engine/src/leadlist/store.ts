// The engine's master copy of lead-list companies (Postgres), and its Google Sheets view.
// The sheet is written once per batch, at a fixed place, and is never read back by the
// engine, so Sheets read limits can't stop a run and a retried write never duplicates rows.
import type { Db } from '../db/pool.js';
import type { SheetsClient } from '../providers/google.js';
import type { Company, FitResult } from './fit.js';
import { tierOf } from './fit.js';

export const COMPANY_COLUMNS = ['Domain', 'Company', 'Tier', 'Cut Reasons', 'Signals', 'Description', 'Country', 'Employees', 'Industry Groups', 'Sub-industry', 'Keywords', 'Similarity', 'Digital Footprint', 'Batch'];

/** Save a batch. `refit` (the sample re-run) updates that batch's own rows with the new tiers. */
export async function saveCompanies(db: Db, listId: string, batch: number, rows: { company: Company; fit: FitResult }[], o: { refit?: boolean } = {}) {
  // One bulk insert per batch (not one query per company), in chunks of 1,000 rows.
  let inserted = 0;
  const tiers = { 'Tier 1': 0, 'Tier 2': 0, Cut: 0 } as Record<string, number>;
  const seen = new Set<string>();
  const unique = rows.filter((r) => r.fit.domain && !seen.has(r.fit.domain) && (seen.add(r.fit.domain), true));
  for (let i = 0; i < unique.length; i += 1000) {
    const part = unique.slice(i, i + 1000);
    const q = await db.query(
      `INSERT INTO lead_companies (list_id, domain, tier, reasons, signals, data, batch)
       SELECT $1, d, t, r::jsonb, s::jsonb, x::jsonb, $2 FROM unnest($3::text[], $4::text[], $5::text[], $6::text[], $7::text[]) AS u(d, t, r, s, x)
       ON CONFLICT (list_id, domain) DO ${o.refit ? `UPDATE SET tier=EXCLUDED.tier, reasons=EXCLUDED.reasons, signals=EXCLUDED.signals, data=EXCLUDED.data WHERE lead_companies.batch = EXCLUDED.batch` : 'NOTHING'}
       RETURNING tier`,
      [listId, batch, part.map((r) => r.fit.domain), part.map((r) => tierOf(r.fit.decision)), part.map((r) => JSON.stringify(r.fit.reasons)), part.map((r) => JSON.stringify(r.fit.signals)), part.map((r) => JSON.stringify(r.company))],
    );
    for (const row of q.rows) { inserted++; tiers[row.tier]++; }
  }
  // A re-fitted batch is written to the sheet again (same rows).
  if (o.refit) await db.query(`UPDATE lead_list_sheets SET mirrored_batches = array_remove(mirrored_batches, $2) WHERE list_id=$1`, [listId, batch]);
  return { inserted, tier1: tiers['Tier 1'], tier2: tiers['Tier 2'], cut: tiers.Cut };
}

export async function listCounts(db: Db, listId: string) {
  const r = await db.query(`SELECT tier, COUNT(*)::int AS n FROM lead_companies WHERE list_id=$1 GROUP BY tier`, [listId]);
  const by = Object.fromEntries(r.rows.map((x) => [x.tier, x.n]));
  const tier1 = by['Tier 1'] ?? 0, tier2 = by['Tier 2'] ?? 0, cut = by.Cut ?? 0;
  const total = tier1 + tier2 + cut;
  return { total, tier1, tier2, cut, usable: tier1 + tier2, usableRate: total ? Math.round(((tier1 + tier2) / total) * 1000) / 1000 : 0 };
}

export async function listDomains(db: Db, listId: string): Promise<string[]> {
  return (await db.query(`SELECT domain FROM lead_companies WHERE list_id=$1`, [listId])).rows.map((x) => x.domain);
}

export async function maxBatch(db: Db, listId: string): Promise<number> {
  return Number((await db.query(`SELECT COALESCE(MAX(batch), 0)::int AS b FROM lead_companies WHERE list_id=$1`, [listId])).rows[0].b);
}

/** The list's companies sheet: the one given, the one already used, or a new one. Header written once. */
export async function ensureCompanySheet(db: Db, sheets: SheetsClient, listId: string, o: { sheetId?: string; title: string; tab?: string }) {
  const tab = o.tab ?? 'Engine Companies';
  const prior = (await db.query(`SELECT sheet_id, tab FROM lead_list_sheets WHERE list_id=$1 AND kind='companies'`, [listId])).rows[0];
  if (prior) return { sheetId: prior.sheet_id as string, tab: prior.tab as string, created: false };
  let sheetId = o.sheetId;
  let created = false;
  if (sheetId) await sheets.ensureTab(sheetId, tab);
  else { sheetId = await sheets.create(o.title, tab); created = true; }
  await sheets.writeRows(sheetId, tab, 1, [COMPANY_COLUMNS]);
  await db.query(`INSERT INTO lead_list_sheets (list_id, kind, sheet_id, tab) VALUES ($1,'companies',$2,$3) ON CONFLICT DO NOTHING`, [listId, sheetId, tab]);
  return { sheetId, tab, created };
}

const cell = (v: unknown) => (Array.isArray(v) ? v.join(', ') : v === null || v === undefined ? '' : String(v));

/** Write every batch not yet in the sheet, each at its fixed rows (header = row 1). */
export async function mirrorCompanies(db: Db, sheets: SheetsClient, listId: string): Promise<{ written: number; batches: number[] }> {
  const s = (await db.query(`SELECT sheet_id, tab, mirrored_batches FROM lead_list_sheets WHERE list_id=$1 AND kind='companies'`, [listId])).rows[0];
  if (!s) return { written: 0, batches: [] };
  const done = new Set<number>((s.mirrored_batches ?? []).map(Number));
  const batches = (await db.query(`SELECT DISTINCT batch FROM lead_companies WHERE list_id=$1 ORDER BY batch`, [listId])).rows.map((x) => Number(x.batch)).filter((b) => !done.has(b));
  let written = 0;
  for (const b of batches) {
    const before = Number((await db.query(`SELECT COUNT(*)::int AS n FROM lead_companies WHERE list_id=$1 AND batch < $2`, [listId, b])).rows[0].n);
    const rows = (await db.query(`SELECT domain, tier, reasons, signals, data, batch FROM lead_companies WHERE list_id=$1 AND batch=$2 ORDER BY seq`, [listId, b])).rows;
    // Batches over 2,500 rows (none today) would be split so each write stays small.
    await sheets.writeRows(s.sheet_id, s.tab, 2 + before, rows.map((r) => {
      const d = r.data ?? {};
      return [r.domain, cell(d.name), r.tier, cell(r.reasons), cell(r.signals), cell(d.description).slice(0, 300), cell(d.country), cell(d.employees), cell(d.industry_groups), cell(d.sub_industry), cell(d.keywords).slice(0, 200), cell(d.similarity), cell(d.score), r.batch];
    }));
    await db.query(`UPDATE lead_list_sheets SET mirrored_batches = array_append(mirrored_batches, $2) WHERE list_id=$1 AND kind='companies'`, [listId, b]);
    written += rows.length;
  }
  return { written, batches };
}

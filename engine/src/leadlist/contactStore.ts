// Contacts master copy (Postgres) and their sheet view: usable contacts (Tier 1/2) go to the
// "Contacts" tab in the columns the Verify stage reads; cut contacts go to "Contacts (Cut)".
// One write per batch per tab, at fixed rows; never read back during a run.
import type { Db } from '../db/pool.js';
import type { SheetsClient } from '../providers/google.js';
import type { Contact, ContactFit } from './contacts.js';

export const CONTACT_COLUMNS = ['Email', 'First Name', 'Last Name', 'Name', 'Title', 'Company', 'Domain', 'LinkedIn URL', 'Country', 'State', 'Tier', 'Cut Reasons', 'Signals', 'Seniority', 'Department', 'Batch'];
const TABS = { usable: 'Contacts', cut: 'Contacts (Cut)' } as const;

export async function saveContacts(db: Db, listId: string, batch: number, rows: { c: Contact; fit: ContactFit }[]) {
  const seen = new Set<string>();
  const unique = rows.filter((r) => r.c.email && !seen.has(r.c.email) && (seen.add(r.c.email), true));
  const tiers: Record<string, number> = { 'Tier 1': 0, 'Tier 2': 0, Cut: 0 };
  let inserted = 0;
  for (let i = 0; i < unique.length; i += 1000) {
    const part = unique.slice(i, i + 1000);
    const q = await db.query(
      `INSERT INTO lead_contacts (list_id, email, domain, tier, reasons, signals, data, batch)
       SELECT $1, e, d, t, r::jsonb, s::jsonb, x::jsonb, $2 FROM unnest($3::text[], $4::text[], $5::text[], $6::text[], $7::text[], $8::text[]) AS u(e, d, t, r, s, x)
       ON CONFLICT (list_id, email) DO NOTHING RETURNING tier`,
      [listId, batch, part.map((r) => r.c.email), part.map((r) => r.c.domain), part.map((r) => r.fit.tier), part.map((r) => JSON.stringify(r.fit.reasons)), part.map((r) => JSON.stringify(r.fit.signals)), part.map((r) => JSON.stringify(r.c))],
    );
    for (const row of q.rows) { inserted++; tiers[row.tier]++; }
  }
  return { inserted, duplicates: rows.length - inserted, tier1: tiers['Tier 1'], tier2: tiers['Tier 2'], cut: tiers.Cut };
}

export async function contactCounts(db: Db, listId: string) {
  const r = await db.query(`SELECT tier, COUNT(*)::int AS n FROM lead_contacts WHERE list_id=$1 GROUP BY tier`, [listId]);
  const by = Object.fromEntries(r.rows.map((x) => [x.tier, x.n]));
  const tier1 = by['Tier 1'] ?? 0, tier2 = by['Tier 2'] ?? 0, cut = by.Cut ?? 0, total = tier1 + tier2 + cut;
  const d = (await db.query(`SELECT COUNT(*)::int AS searched, COUNT(*) FILTER (WHERE found > 0)::int AS with_contacts FROM lead_contact_domains WHERE list_id=$1`, [listId])).rows[0];
  return { total, tier1, tier2, cut, usable: tier1 + tier2, usableRate: total ? Math.round(((tier1 + tier2) / total) * 1000) / 1000 : 0, companiesSearched: d.searched, companiesWithContacts: d.with_contacts };
}

export async function ensureContactTabs(db: Db, sheets: SheetsClient, listId: string): Promise<{ sheetId: string }> {
  const prior = (await db.query(`SELECT sheet_id FROM lead_list_sheets WHERE list_id=$1 AND kind='contacts'`, [listId])).rows[0];
  if (prior) return { sheetId: prior.sheet_id };
  const companies = (await db.query(`SELECT sheet_id FROM lead_list_sheets WHERE list_id=$1 AND kind='companies'`, [listId])).rows[0];
  if (!companies) throw new Error('this list has no sheet yet; expand its companies first');
  for (const tab of Object.values(TABS)) { await sheets.ensureTab(companies.sheet_id, tab); await sheets.writeRows(companies.sheet_id, tab, 1, [CONTACT_COLUMNS]); }
  await db.query(`INSERT INTO lead_list_sheets (list_id, kind, sheet_id, tab) VALUES ($1,'contacts',$2,$3) ON CONFLICT DO NOTHING`, [listId, companies.sheet_id, TABS.usable]);
  return { sheetId: companies.sheet_id };
}

/** Write every contact batch not yet in the sheet: usable to "Contacts", cut to "Contacts (Cut)". */
export async function mirrorContacts(db: Db, sheets: SheetsClient, listId: string) {
  const s = (await db.query(`SELECT sheet_id, mirrored_batches FROM lead_list_sheets WHERE list_id=$1 AND kind='contacts'`, [listId])).rows[0];
  if (!s) return { written: 0 };
  const done = new Set<number>((s.mirrored_batches ?? []).map(Number));
  const batches = (await db.query(`SELECT DISTINCT batch FROM lead_contacts WHERE list_id=$1 ORDER BY batch`, [listId])).rows.map((x) => Number(x.batch)).filter((b) => !done.has(b));
  let written = 0;
  for (const b of batches) {
    for (const [kind, tab] of Object.entries(TABS)) {
      const cond = kind === 'usable' ? `tier <> 'Cut'` : `tier = 'Cut'`;
      const before = Number((await db.query(`SELECT COUNT(*)::int AS n FROM lead_contacts WHERE list_id=$1 AND batch < $2 AND ${cond}`, [listId, b])).rows[0].n);
      const rows = (await db.query(`SELECT tier, reasons, signals, data, batch FROM lead_contacts WHERE list_id=$1 AND batch=$2 AND ${cond} ORDER BY seq`, [listId, b])).rows;
      await sheets.writeRows(s.sheet_id, tab, 2 + before, rows.map((r) => {
        const c = r.data as Contact;
        return [c.email, c.first_name, c.last_name, c.name, c.title, c.company_name, c.domain, c.linkedin_url, c.person_country, c.person_state, r.tier, (r.reasons ?? []).join(', '), (r.signals ?? []).join(', '), c.seniority, c.department, r.batch];
      }));
      written += rows.length;
    }
    await db.query(`UPDATE lead_list_sheets SET mirrored_batches = array_append(mirrored_batches, $2) WHERE list_id=$1 AND kind='contacts'`, [listId, b]);
  }
  return { written };
}

/** Rewrite both contact tabs from the engine's saved contacts: clear, header, every row in
 *  order (batch, then the order saved). Run at the end of every Find Contacts press, so the
 *  sheet Verify reads always matches the engine exactly, whatever happened to earlier batches
 *  (tier changes after a deep review, a failed write, a batch number written twice). */
export async function rewriteContactTabs(db: Db, sheets: SheetsClient, listId: string) {
  const s = (await db.query(`SELECT sheet_id FROM lead_list_sheets WHERE list_id=$1 AND kind='contacts'`, [listId])).rows[0];
  if (!s) return { usable: 0, cut: 0 };
  const out: Record<string, number> = {};
  for (const [kind, tab] of Object.entries(TABS)) {
    const cond = kind === 'usable' ? `tier <> 'Cut'` : `tier = 'Cut'`;
    const rows = (await db.query(`SELECT tier, reasons, signals, data, batch FROM lead_contacts WHERE list_id=$1 AND ${cond} ORDER BY batch, seq`, [listId])).rows;
    await sheets.clearTab(s.sheet_id, tab);
    await sheets.writeRows(s.sheet_id, tab, 1, [CONTACT_COLUMNS]);
    for (let i = 0; i < rows.length; i += 5000) {
      await sheets.writeRows(s.sheet_id, tab, 2 + i, rows.slice(i, i + 5000).map((r) => {
        const c = r.data as Contact;
        return [c.email, c.first_name, c.last_name, c.name, c.title, c.company_name, c.domain, c.linkedin_url, c.person_country, c.person_state, r.tier, (r.reasons ?? []).join(', '), (r.signals ?? []).join(', '), c.seniority, c.department, r.batch];
      }));
    }
    out[kind] = rows.length;
  }
  await db.query(`UPDATE lead_list_sheets SET mirrored_batches = ARRAY(SELECT DISTINCT batch FROM lead_contacts WHERE list_id=$1 ORDER BY batch) WHERE list_id=$1 AND kind='contacts'`, [listId]);
  return { usable: out.usable ?? 0, cut: out.cut ?? 0 };
}

/** The next unused batch number for a list's contacts (contacts and searched domains both count). */
export async function nextContactBatch(db: Db, listId: string): Promise<number> {
  const r = await db.query(`SELECT GREATEST(COALESCE((SELECT MAX(batch) FROM lead_contacts WHERE list_id=$1),0), COALESCE((SELECT MAX(batch) FROM lead_contact_domains WHERE list_id=$1),0))::int AS b`, [listId]);
  return Number(r.rows[0].b) + 1;
}

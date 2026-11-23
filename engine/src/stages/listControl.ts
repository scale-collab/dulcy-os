// Two list controls from the old Lead List Center, now on the engine (Alex, 2026-11-23):
//  - leadlist.restart ("Restart Companies"): start the company list over. Every working row of
//    the list (companies, contacts, searched domains, reviews, profiles) is first copied to a
//    backup under "<listId>~backup~<job>", then removed; the sheet tabs are cleared (headers
//    kept); counts, approvals, verify and QA results on the record are reset. Nothing is paid
//    for: the next sample re-uses earlier paid results for the same filters (receipts are kept),
//    and MillionVerifier / LeadMagic results stay reusable (never pay twice for an email).
//  - leadlist.skipenrich ("Skip Enrichment"): no enrichment needed (e.g. Dulcy's own lists):
//    move a verified list to QA. Replaces the old screen's direct stage write (rule 2).
import type { Stage } from './index.js';
import { PermanentError } from '../errors.js';
import { createSheetsClient } from '../providers/google.js';
import { COMPANY_COLUMNS } from '../leadlist/store.js';
import { CONTACT_COLUMNS } from '../leadlist/contactStore.js';

/** Every table that holds a list's working data (paid-result caches are kept on purpose). */
export const LIST_TABLES = ['lead_companies', 'lead_contacts', 'lead_contact_domains', 'lead_contact_reviews', 'lead_deep_reviews', 'lead_list_profiles', 'lead_contact_profiles'] as const;

/** Lead Lists fields reset by a restart (IDs; values are the "empty" state). */
export const RESTART_FIELDS: Record<string, unknown> = {
  fldqGx4RU4zDYxitK: false, // Company Sample Approved
  fldVz983EKKiPSzjc: false, // Contact Sample Approved
  fldRLtvugIxH9qun1: null, fldAWCY4Tl9jpQtYc: null, fldqaiJodYBS3GpRu: null, fldDD7HGFq0j3Iwfp: null, fldY1i1787UwZFOr6: null, fld6BhZSLdGOkCJCZ: null, // company counts, rate, status, summary
  fldiedxTwtn6TikJi: null, fldmyD4PJ9mXdCJZ8: null, fld0KlQqxFEG6wgfU: null, // sample size, needs-review count, deep review results link
  fldkWL67N8ZaBIaDi: null, flda4qjRC0sCeStBg: null, fldbiciFuOmAzv38D: null, fldVH77A3Ozjh4t8k: null, fldnScb360OZ17VRt: null, // contact counts, rate, status, summary
  fld8kUuSdLo5autI7: null, fldXl4sV7ma4YAOv7: null, fld9Jgzxc9JqeFAus: null, fldQZJCpTofahmTkl: null, fld0FHomkh3uyx0FD: null, fld2G5D1yCPFGFiVF: null, // verify + final counts, leads
  fld4B7jLPdcgzdkgF: null, fld1UmiJ0PsIndCtO: null, fldxehC2cjGGK8ruN: null, fldflrzfkhmW7JarV: null, // MillionVerifier / LeadMagic job IDs, verified at, verify state
  fldUB4WsLi5kq6rUy: 'Not Checked', fld9XB4gkZcizeHUg: null, fldWDSDICYaL9SQEa: false, fldgWhI2Nm2Y9c91O: false, fld9p2h93vRGm6D3e: false, fldSk4FJKAHo5yGhc: null, fldllzDyi67HGc0FC: null, // QA
  fld8nrebRFL0O8kgj: 'Source & ICP', // Lead List Stage: next step is the company sample
  fldaUFUWOLtKIovQE: 0, // Processing Progress
};

const SHEET_TABS: [string, string[] | null][] = [['Contacts', CONTACT_COLUMNS], ['Contacts (Cut)', CONTACT_COLUMNS], ['Final Direct', null], ['Final Generic', null], ['QA Review', null]];

export const restartStage: Stage = async (ctx) => {
  const listId = ctx.job.record_id;
  if (!listId) throw new PermanentError('restart needs a lead list record');
  const counts = await ctx.step('count', async () => {
    const out: Record<string, number> = {};
    for (const t of LIST_TABLES) out[t] = Number((await ctx.db.query(`SELECT COUNT(*)::int AS n FROM ${t} WHERE list_id=$1`, [listId])).rows[0].n);
    return out;
  });
  const backupId = `${listId}~backup~${ctx.job.id}`;
  if (ctx.dryRun) return { dryRun: true, wouldBackUp: counts, backupId, message: `dry run: would back up and clear ${counts.lead_companies} companies and ${counts.lead_contacts} contacts` };

  // Backup and clear in ONE transaction: a crash leaves either the old list or a full backup.
  await ctx.step('backup-and-clear', async () => {
    const c = await ctx.db.connect();
    try {
      await c.query('BEGIN');
      for (const t of LIST_TABLES) {
        // Column-agnostic copy: the same row with list_id replaced.
        await c.query(`INSERT INTO ${t} SELECT (jsonb_populate_record(NULL::${t}, to_jsonb(x) || jsonb_build_object('list_id', $2::text))).* FROM ${t} x WHERE x.list_id=$1 ON CONFLICT DO NOTHING`, [listId, backupId]);
        await c.query(`DELETE FROM ${t} WHERE list_id=$1`, [listId]);
      }
      await c.query(`UPDATE lead_list_sheets SET mirrored_batches='{}' WHERE list_id=$1`, [listId]);
      await c.query('COMMIT');
    } catch (e) { await c.query('ROLLBACK'); throw e; } finally { c.release(); }
    return { backupId };
  });

  // Same sheet, empty tabs (headers kept), so the next run writes from row 2 again.
  const sheet = await ctx.step('clear-sheet', async () => {
    const s = (await ctx.db.query(`SELECT sheet_id, tab FROM lead_list_sheets WHERE list_id=$1 AND kind='companies'`, [listId])).rows[0];
    if (!s) return { cleared: [] as string[] };
    const sheets = createSheetsClient({ keyFile: ctx.cfg.googleKeyFile, impersonate: ctx.cfg.googleImpersonateUser, scope: ctx.cfg.googleScope, sheetsBaseUrl: ctx.cfg.googleSheetsBaseUrl });
    const cleared: string[] = [];
    for (const [tab, header] of [[s.tab as string, COMPANY_COLUMNS], ...SHEET_TABS] as [string, string[] | null][]) {
      try { await sheets.clearTab(s.sheet_id, tab); } catch { continue; } // tab not made yet
      if (header) await sheets.writeRows(s.sheet_id, tab, 1, [header]);
      cleared.push(tab);
    }
    return { cleared };
  });

  return {
    dryRun: false, backupId, backedUp: counts, sheetTabsCleared: sheet.cleared,
    airtableFields: RESTART_FIELDS,
    message: `restarted: ${counts.lead_companies} companies and ${counts.lead_contacts} contacts backed up (${backupId}) and cleared; approvals and counts reset. Next: run the first 100 companies (free again if the filters did not change).`,
  };
};

interface SkipInput { finalDirect?: number; finalGeneric?: number }

export const skipEnrichStage: Stage = async (ctx) => {
  const i = ctx.job.input as SkipInput;
  const leads = Number(i.finalDirect ?? 0) + Number(i.finalGeneric ?? 0);
  if (!leads) throw new PermanentError('this list has no final leads yet: run Verify first');
  return {
    dryRun: false,
    airtableFields: { fld8nrebRFL0O8kgj: 'QA', fldaUFUWOLtKIovQE: 5 / 6 },
    message: `Enrichment skipped: no project-specific enrichment needed. ${leads} final leads ready for QA.`,
  };
};

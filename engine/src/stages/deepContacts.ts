// DiscoGen contact persona review (optional, paid): the old n8n contact review run unchanged on
// the contacts the free code check kept.
//
// Only for lists with "Use DiscoGen Deep Review" ticked, a DiscoGen Deep Review Prompt and a
// Contact Persona DNA. n8n's code builds the request (the persona + the prompt, the additional
// requirements and n8n's deep-review policy, web search on) to DiscoLike
// /v1/discogen/process-personas, and its gate gives Tier 1 / Cut. In deep mode n8n keeps only a
// clear "yes": anything else is cut. Cut contacts move to "Contacts (Cut)", so Verify skips them.
// Every contact is reviewed once (lead_contact_reviews); up to 8,000 per press (n8n's batch).
// Writes the "Contact Review" tab (n8n's columns) and the contact fields in Airtable.
import { createHash } from 'node:crypto';
import type { Stage } from './index.js';
import { NeedsReviewError, PermanentError, WaitError } from '../errors.js';
import { createDiscoLikeClient } from '../providers/discolike.js';
import { createSheetsClient } from '../providers/google.js';
import { DEEP_REVIEW_NODES as D } from '../leadlist/legacy/deepReviewNodes.js';
import { CONTACT_REVIEW_NODES as C } from '../leadlist/legacy/contactReviewNodes.js';
import { runNode, type Items } from '../leadlist/legacy/runNode.js';
import { CONTACT_COLUMNS, contactCounts, mirrorContacts } from '../leadlist/contactStore.js';
import { N8N_ONLY_DEEP_REVIEW } from './deepReview.js';

interface Project { id: string; fields: Record<string, unknown> }

/** DiscoGen's persona answers, keyed by persona ID, as {fit, confidence, reasoning} objects.
 *  DiscoGen can send each answer as one string ("yes | high | reasoning", in its response-schema
 *  key order) that n8n's gate cannot read; this reads it first. Unreadable answers are left out. */
export function readPersonaResults(status: any): Record<string, Record<string, unknown>> {
  const set = status?.results ?? status?.data?.results ?? status?.validations ?? status?.data?.validations ?? {};
  const schema = status?.response_format?.json_schema ?? status?.data?.response_format?.json_schema;
  const keys = Object.keys(schema?.properties ?? {}).length ? Object.keys(schema.properties) : ['fit', 'confidence', 'reasoning'];
  const read = (v: unknown): Record<string, unknown> | null => {
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      const o = v as Record<string, unknown>;
      if (o.result !== undefined && o.fit === undefined) return read(o.result);
      return o.fit !== undefined || o.classification !== undefined || o.verdict !== undefined ? o : null;
    }
    if (Array.isArray(v)) return v.length === 1 ? read(v[0]) : null;
    if (typeof v !== 'string' || !v.trim()) return null;
    const t = v.trim();
    try { return read(JSON.parse(t)); } catch { /* not JSON */ }
    const parts = t.split('|').map((x) => x.trim());
    if (parts.length >= 2) {
      const o: Record<string, unknown> = {};
      keys.forEach((k, i) => { o[k] = i < keys.length - 1 ? (parts[i] ?? '') : parts.slice(i).join(' | '); });
      return /^(yes|partial|no)$/i.test(String(o.fit ?? '')) ? o : null;
    }
    return /^(yes|partial|no)$/i.test(t) ? { fit: t.toLowerCase() } : null;
  };
  const out: Record<string, Record<string, unknown>> = {};
  const entries: [string, unknown][] = Array.isArray(set) ? set.map((x: any) => [String(x?.persona_id ?? x?.id ?? x?.contact_id ?? ''), x]) : Object.entries(set ?? {});
  for (const [k, v] of entries) { const r = read(v); if (k && r) out[k] = { ...r, fit: String(r.fit ?? r.classification ?? r.verdict ?? '').toLowerCase() }; }
  return out;
}
function firstAnswer(status: any): string {
  const set = status?.results ?? status?.data?.results;
  const first = Array.isArray(set) ? set[0] : set && typeof set === 'object' ? Object.values(set)[0] : set;
  return ` [first DiscoGen answer: ${String(typeof first === 'string' ? first : JSON.stringify(first ?? null)).replace(/\s+/g, ' ').slice(0, 160)}]`;
}
const BATCH_CAP = 8000;
const POLL_MS = 30_000;
const MAX_WAIT_MS = 6 * 60 * 60_000;
const REVIEW_TAB = 'Contact Review';

const node = async (code: string, input: Items, earlier: Record<string, Items> = {}) => {
  try { return await runNode(code, input, earlier); } catch (e) { throw new PermanentError(`Contact deep review: ${String((e as Error).message ?? e)}`); }
};

export const deepContactsStage: Stage = async (ctx) => {
  const project = (ctx.job.input as unknown as { project: Project })?.project;
  if (!project?.id) throw new PermanentError('input.project (the Lead List record by field name) is required');
  const listId = project.id;
  if (N8N_ONLY_DEEP_REVIEW.has(listId)) throw new PermanentError('this list uses a client-specific review that only exists in n8n; run it from the regular Lead List Center');
  if (project.fields['Use DiscoGen Deep Review'] !== true) throw new PermanentError('tick "Use DiscoGen Deep Review" on this list first (and write the DiscoGen Deep Review Prompt)');
  if (!String(project.fields['DiscoGen Deep Review Prompt'] ?? '').trim()) throw new PermanentError('write the DiscoGen Deep Review Prompt first');
  if (!String(project.fields['Contact Persona DNA'] ?? '').trim()) throw new PermanentError('write the Contact Persona DNA (who the contact should be) first');
  const startedAt = await ctx.step('started', async () => new Date().toISOString());
  // Undo verdicts that came from an unreadable answer (empty reasoning): the contact goes back to
  // its earlier tier and is reviewed again. (Live 2026-11-21: DiscoGen answered "yes | high | ..."
  // as one string, n8n's gate could not read it and cut all 558 contacts.)
  await ctx.step('heal', async () => {
    const bad = (await ctx.db.query(
      `SELECT email, prev_tier FROM lead_contact_reviews WHERE list_id=$1 AND tier='Cut' AND COALESCE(row->>'reasoning','')=''`, [listId])).rows;
    for (const b of bad) {
      await ctx.db.query(
        `UPDATE lead_contacts SET tier=$3, reasons = COALESCE((SELECT jsonb_agg(x) FROM jsonb_array_elements(reasons) x WHERE x::text NOT LIKE '"DiscoGen persona review%'), '[]'::jsonb)
          WHERE list_id=$1 AND lower(email)=$2 AND tier='Cut'`, [listId, b.email, b.prev_tier ?? 'Tier 2']);
      await ctx.db.query(`DELETE FROM lead_contact_reviews WHERE list_id=$1 AND email=$2`, [listId, b.email]);
    }
    return bad.length;
  });

  // 1. n8n's request, built by n8n's code, for the next contacts not yet reviewed.
  const prep = await ctx.step('prepare', async () => {
    const v = await node(D['Validate Action Request2'], [{ body: { recordId: listId, action: 'Run Company Sample' } }]);
    if (!v.length) throw new PermanentError('the old validator stopped this request quietly');
    const norm = await node(D['Normalize Lead List2'], [project], { 'Validate Action Request2': v });
    const rows = (await ctx.db.query(
      `SELECT k.email, k.data FROM lead_contacts k
        WHERE k.list_id=$1 AND k.tier <> 'Cut' AND (k.data->>'persona_id') ~ '^[0-9]+$'
          AND NOT EXISTS (SELECT 1 FROM lead_contact_reviews r WHERE r.list_id=k.list_id AND r.email=k.email)
        ORDER BY k.seq LIMIT $2`, [listId, BATCH_CAP])).rows as { email: string; data: Record<string, any> }[];
    const noPersona = Number((await ctx.db.query(
      `SELECT COUNT(*)::int AS n FROM lead_contacts WHERE list_id=$1 AND tier <> 'Cut' AND NOT ((data->>'persona_id') ~ '^[0-9]+$')`, [listId])).rows[0].n);
    if (!rows.length) return { none: true as const, noPersona };
    // The same row shape n8n's "Flatten Contact Prospects" made (the engine stores the same fields).
    const prospects = rows.map(({ email, data: c }) => ({ source: c.source ?? 'DiscoLike', persona_id: Number(c.persona_id), domain: c.domain, name: c.name ?? '', first_name: c.first_name ?? '', last_name: c.last_name ?? '', title: c.title ?? '', seniority: c.seniority ?? '', department: c.department ?? '', email, linkedin_url: c.linkedin_url ?? '', person_country: c.person_country ?? '', person_state: c.person_state ?? '', company_name: c.company_name ?? '', company_industry: c.company_industry ?? '', persona_profile: c.persona_profile ?? '' }));
    const personaIds = [...new Set(prospects.map((p) => p.persona_id))];
    const data = { prospects, personaIds, totalContacts: prospects.length, discoLikeCount: prospects.filter((p) => p.source !== 'ContraGen').length, contraGenCount: prospects.filter((p) => p.source === 'ContraGen').length, searchedCompanyCount: new Set(prospects.map((p) => p.domain)).size, isContactExpansion: true };
    const prepared = await node(C['Prepare Contact AI Review'], [data], { 'Prepare Contact Review Running': [{ contactPersonaDna: norm[0].contactPersonaDna }], 'Normalize Lead List': norm });
    return { none: false as const, noPersona, norm, prepared };
  }, { timeoutMs: 10 * 60_000 });
  if (prep.none) return { dryRun: ctx.dryRun, reviewed: 0, message: `Contact deep review: every usable contact with a DiscoLike persona has already been reviewed. Nothing was charged.${prep.noPersona ? ` ${prep.noPersona} contacts have no persona ID and cannot be persona-reviewed.` : ''}` };

  const req = prep.prepared[0].reviewRequest;
  const n = (req.persona_ids as number[]).length;
  if (ctx.dryRun) return { dryRun: true, plan: { contacts: n, webSearch: req.web_search === true }, wouldSpendCredits: { discolike: `${n} contacts (DiscoGen persona review)` }, message: `dry run: would deep-review ${n} contacts with DiscoGen` };

  // 2. One paid task (never paid twice for the same contacts), then wait for it.
  const disco = createDiscoLikeClient({ apiKey: ctx.cfg.discoLikeApiKey, baseUrl: ctx.cfg.discoLikeBaseUrl });
  const task = await ctx.step('submit', () => ctx.paid({
    scope: 'record', provider: 'discolike', units: n,
    callKey: `deepcontacts:${createHash('sha256').update(JSON.stringify(req)).digest('hex').slice(0, 16)}`,
    run: async () => (await node(C['Capture Contact Review Task'], [await disco.discoGenSubmit('process-personas', req)]))[0].taskId as string,
    dryRunResult: () => '',
  }));
  const status = await ctx.step('poll', async () => {
    const answer = await disco.discoGenStatus(task);
    let checked: Items;
    try { checked = await runNode(C['Check Contact Review Status'], [answer]); } catch (e) { throw new NeedsReviewError(`${String((e as Error).message)} (task ${task}; not resubmitted)`); }
    if (checked[0]?.isComplete !== true) {
      if (Date.parse(startedAt) + MAX_WAIT_MS < Date.now()) throw new NeedsReviewError(`DiscoGen contact review task ${task} still running after 6 hours`);
      throw new WaitError(`DiscoGen contact review task ${task}: ${String(answer?.status ?? answer?.data?.status ?? 'running')}`, POLL_MS);
    }
    return checked[0];
  }, { timeoutMs: 10 * 60_000 });

  // 3. n8n's gate, then save the verdicts (Cut contacts leave the Contacts tab).
  const readable = readPersonaResults(status);
  const matched = new Set(Object.keys(readable));
  if (!(prep.prepared[0].personaIds as number[]).some((id) => matched.has(String(id)))) {
    throw new NeedsReviewError(`Contact deep review: none of DiscoGen's answers could be read, so no contact was cut (task ${task}).${firstAnswer(status)}`);
  }
  const gate = await ctx.step('gate', async () => (await node(C['Calculate Contact Fit Gate'], [{ ...status, results: readable }], { 'Normalize Lead List': prep.norm, 'Prepare Contact AI Review': prep.prepared }))[0], { timeoutMs: 10 * 60_000 });
  const saved = await ctx.step('save', async () => {
    let kept = 0, cut = 0;
    for (const row of (gate.reviewed ?? []) as Record<string, any>[]) {
      const email = String(row.email ?? '').trim().toLowerCase();
      if (!email || !matched.has(String(row.persona_id))) continue; // no readable answer: left for the next press
      const prev = (await ctx.db.query(`SELECT tier FROM lead_contacts WHERE list_id=$1 AND lower(email)=$2`, [listId, email])).rows[0]?.tier ?? null;
      await ctx.db.query(
        `INSERT INTO lead_contact_reviews (list_id, email, persona_id, tier, row, task_id, prev_tier) VALUES ($1,$2,$3,$4,$5,$6,$7)
         ON CONFLICT (list_id, email) DO UPDATE SET tier=EXCLUDED.tier, row=EXCLUDED.row, task_id=EXCLUDED.task_id, reviewed_at=now()`,
        [listId, email, Number(row.persona_id) || null, String(row.tier), JSON.stringify(row), task, prev]);
      if (row.tier === 'Cut') {
        const why = `DiscoGen persona review: ${String(row.reasoning ?? '').replace(/\s+/g, ' ').slice(0, 160) || 'not a clear fit'}`;
        await ctx.db.query(`UPDATE lead_contacts SET tier='Cut', reasons = reasons || $3::jsonb WHERE list_id=$1 AND lower(email)=$2`, [listId, email, JSON.stringify([why])]);
        cut++;
      } else kept++;
    }
    return { kept, cut };
  });

  // 4. Sheet: rebuild "Contacts" / "Contacts (Cut)" from the master copy (Verify reads Contacts),
  //    and write n8n's "Contact Review" tab with every contact reviewed so far.
  await ctx.step('sheet', async () => {
    const s = (await ctx.db.query(`SELECT sheet_id FROM lead_list_sheets WHERE list_id=$1 AND kind='contacts'`, [listId])).rows[0];
    if (!s) return true;
    const sheets = createSheetsClient({ keyFile: ctx.cfg.googleKeyFile, impersonate: ctx.cfg.googleImpersonateUser, scope: ctx.cfg.googleScope, sheetsBaseUrl: ctx.cfg.googleSheetsBaseUrl });
    for (const tab of ['Contacts', 'Contacts (Cut)']) { await sheets.clearTab(s.sheet_id, tab); await sheets.writeRows(s.sheet_id, tab, 1, [CONTACT_COLUMNS]); }
    await ctx.db.query(`UPDATE lead_list_sheets SET mirrored_batches='{}' WHERE list_id=$1 AND kind='contacts'`, [listId]);
    await mirrorContacts(ctx.db, sheets, listId);
    const all = (await ctx.db.query(`SELECT row FROM lead_contact_reviews WHERE list_id=$1 ORDER BY reviewed_at, email`, [listId])).rows.map((r) => r.row);
    const values = (await node(C['Prepare Contact Sheet Values'], [{}], { 'Calculate Contact Fit Gate': [{ ...gate, reviewed: all }] }))[0].body.data
      .find((d: any) => String(d.range).startsWith(`'${REVIEW_TAB}'`)).values as unknown[][];
    await sheets.ensureTab(s.sheet_id, REVIEW_TAB);
    await sheets.clearTab(s.sheet_id, REVIEW_TAB);
    for (let i = 0; i < values.length; i += 500) await sheets.writeRows(s.sheet_id, REVIEW_TAB, i + 1, values.slice(i, i + 500).map((r) => r.map((x) => (x == null ? '' : typeof x === 'object' ? JSON.stringify(x) : String(x)))));
    return true;
  });

  // 5. Airtable: the contact fields n8n wrote, over the whole list after the cut.
  const counts = await contactCounts(ctx.db, listId);
  const rev = (await ctx.db.query(`SELECT COUNT(*) FILTER (WHERE tier <> 'Cut')::int AS kept, COUNT(*)::int AS total FROM lead_contact_reviews WHERE list_id=$1`, [listId])).rows[0];
  const rate = rev.total ? rev.kept / rev.total : 0;
  const statusText = rate >= 0.8 ? 'Passed' : rate >= 0.7 ? 'Needs Review' : 'Failed';
  const summary = `DiscoGen persona review: ${rev.kept} of ${rev.total} reviewed contacts kept (${(rate * 100).toFixed(1)}%), ${rev.total - rev.kept} cut. This press: ${saved.kept} kept, ${saved.cut} cut. `
    + `List now: ${counts.usable} usable contacts, ${counts.cut} cut.${prep.noPersona ? ` ${prep.noPersona} contacts have no persona ID and were not reviewed.` : ''} Run Verify again so the Final tabs drop the cut contacts (already-verified emails are not paid for twice).`;
  const fields = { fldkWL67N8ZaBIaDi: counts.usable, flda4qjRC0sCeStBg: counts.cut, fldbiciFuOmAzv38D: counts.usableRate, fldVH77A3Ozjh4t8k: statusText, fldnScb360OZ17VRt: summary, fldVnH7Pn1PxlZI5b: summary };
  return { dryRun: false, reviewed: saved.kept + saved.cut, ...saved, taskId: task, airtableFields: fields, message: summary };
};

// Round 3 (Alex 2026-11-27, RULES "Cole keeps Close current"): after each call review Cole sets that
// lead's Close opportunity confidence (%) from how the call went, and its value from what was pitched
// or agreed on the call (Nick was pitched $2K/month, not the $3K default). Alex no longer does it by hand.
//   - Only Dulcy's own Close, only the opportunity's confidence / value / value period
//     (providers/close.ts updateOpportunity). Never an email, SMS, task, status or contact.
//   - Live only when the cole.review job is live AND cole.close_update is in LIVE_STAGES (or
//     DRY_RUN=false). Otherwise Cole records what he WOULD change ("planned"), so Alex can check first.
//   - The value is only changed when the pitched price is quoted word for word from the transcript
//     (never invented). The confidence stays inside the band of Cole's deal temperature.
//   - Every change (and every planned one) is kept here, old → new, logged to the Airtable activity
//     log, and shown on the deal page (Sales → deal → "Close updates by Cole").
import type { Db } from '../db/pool.js';
import type { Config } from '../config.js';
import type { CloseClient, CloseOpportunity, OpportunityPatch, ValuePeriod } from '../providers/close.js';
import { logActivity } from '../activity.js';

export const CLOSE_UPDATE_STAGE = 'cole.close_update';
/** Live = the job is live and cole.close_update is switched on (LIVE_STAGES), or the engine is not in dry run. */
export const closeUpdateLive = (x: { dryRun: boolean; cfg: Pick<Config, 'dryRun' | 'liveStages'> }) => !x.dryRun && !(x.cfg.dryRun && !x.cfg.liveStages.includes(CLOSE_UPDATE_STAGE));

export type Temperature = 'hot' | 'warm' | 'cold' | 'closed' | 'lost';
/** Close likelihood bands per deal temperature [low, high, default]. */
export const CONFIDENCE_BANDS: Record<Temperature, [number, number, number]> = {
  hot: [60, 90, 75], warm: [30, 60, 45], cold: [5, 30, 15], closed: [80, 100, 90], lost: [0, 10, 5],
};
export interface ReviewForClose {
  deal_temperature: Temperature;
  close_confidence?: number | null;
  pitched?: { amount?: number | null; period?: string | null; quote?: string | null; agreed?: boolean | null } | null;
}
export interface CallOutcome { confidence: number; value: number | null; valuePeriod: ValuePeriod | null; quote: string; valueNote: string }

const squash = (x: string) => String(x ?? '').toLowerCase().replace(/[“”"']/g, '').replace(/\s+/g, ' ').trim();
/** Dollar amounts written in a quote: "$2K", "2,000", "2.5k", "3000 a month" → [2000, ...]. Pure. */
export function amountsIn(quote: string): number[] {
  const out: number[] = [];
  for (const m of String(quote ?? '').matchAll(/\$?\s?(\d{1,3}(?:,\d{3})+|\d+(?:\.\d+)?)\s*(k\b|thousand\b|grand\b)?/gi)) {
    const n = Number(m[1].replace(/,/g, ''));
    if (Number.isFinite(n)) out.push(m[2] ? n * 1000 : n);
  }
  return out;
}
const periodOf = (p: string | null | undefined): ValuePeriod | null => {
  const t = String(p ?? '').toLowerCase();
  return /month|monthly|\/mo|mrr|retainer/.test(t) ? 'monthly' : /annual|year|yearly/.test(t) ? 'annual' : /one[_ -]?time|once|setup|project/.test(t) ? 'one_time' : null;
};

/**
 * What Cole would set in Close from one reviewed call. The confidence is clamped to the temperature's
 * band and rounded to 5. The value only when the pitched amount is in the quote AND the quote is in
 * the transcript word for word. Pure.
 */
export function outcomeFromReview(r: ReviewForClose, transcript: string): CallOutcome {
  const band = CONFIDENCE_BANDS[r.deal_temperature] ?? CONFIDENCE_BANDS.warm;
  const raw = Number.isFinite(Number(r.close_confidence)) && r.close_confidence !== null && r.close_confidence !== undefined ? Number(r.close_confidence) : band[2];
  const confidence = Math.min(band[1], Math.max(band[0], Math.round(raw / 5) * 5));
  const p = r.pitched ?? null;
  const amount = Number(p?.amount);
  const quote = String(p?.quote ?? '').trim().slice(0, 300);
  let value: number | null = null, valuePeriod: ValuePeriod | null = null, valueNote = '';
  if (!p || !Number.isFinite(amount) || amount <= 0) valueNote = 'No price was pitched on the call: value left as it is.';
  else if (amount < 100 || amount > 100_000) valueNote = `The pitched amount (${amount}) is outside $100-$100,000: value left as it is.`;
  else if (!quote || !squash(transcript).includes(squash(quote))) valueNote = 'The pitched price was not found word for word in the transcript: value left as it is.';
  else if (!amountsIn(quote).some((x) => Math.abs(x - amount) < 0.5)) valueNote = `The quote does not say ${amount}: value left as it is.`;
  else { value = Math.round(amount); valuePeriod = periodOf(p.period) ?? periodOf(quote); valueNote = `Pitched on the call: "${quote}"`; }
  return { confidence, value, valuePeriod, quote, valueNote };
}

export interface FieldChange { field: 'confidence' | 'value' | 'value_period'; from: string; to: string }
/** The fields that differ between the opportunity and the outcome (old → new, as text). Pure. */
export function planChanges(o: Pick<CloseOpportunity, 'confidence' | 'value' | 'valuePeriod'>, x: CallOutcome): { patch: OpportunityPatch; changes: FieldChange[] } {
  const patch: OpportunityPatch = {}; const changes: FieldChange[] = [];
  if (o.confidence !== x.confidence) { patch.confidence = x.confidence; changes.push({ field: 'confidence', from: o.confidence === null ? '' : `${o.confidence}%`, to: `${x.confidence}%` }); }
  if (x.value !== null && o.value !== x.value) { patch.value = x.value; changes.push({ field: 'value', from: o.value === null ? '' : `$${o.value.toLocaleString('en-US')}`, to: `$${x.value.toLocaleString('en-US')}` }); }
  if (x.value !== null && x.valuePeriod && o.valuePeriod !== x.valuePeriod) { patch.valuePeriod = x.valuePeriod; changes.push({ field: 'value_period', from: o.valuePeriod, to: x.valuePeriod }); }
  return { patch, changes };
}

/** The lead's opportunity to update: the open one changed most recently (never a won or lost one). Pure. */
export function pickOpportunity(opps: CloseOpportunity[]): CloseOpportunity | null {
  return [...opps].filter((o) => o.statusType === 'active').sort((a, b) => b.updated.localeCompare(a.updated))[0] ?? null;
}

// ---------- storage (HQ's own table, created on first use) ----------
let table: Promise<void> | null = null;
export function _resetCloseUpdateTable() { table = null; }
export function ensureCloseUpdates(db: Db): Promise<void> {
  table ??= db.query(`
    CREATE TABLE IF NOT EXISTS hq_close_updates (
      id BIGSERIAL PRIMARY KEY, recording_id TEXT NOT NULL, lead_id TEXT NOT NULL DEFAULT '', opp_id TEXT NOT NULL DEFAULT '',
      prospect TEXT NOT NULL DEFAULT '', emails TEXT[] NOT NULL DEFAULT '{}', status TEXT NOT NULL,
      changes JSONB NOT NULL DEFAULT '[]', note TEXT NOT NULL DEFAULT '', applied BOOLEAN NOT NULL DEFAULT false,
      job_id BIGINT, created_at TIMESTAMPTZ NOT NULL DEFAULT now(), UNIQUE (recording_id)
    );
    CREATE INDEX IF NOT EXISTS hq_close_updates_lead ON hq_close_updates (lead_id, id DESC);`).then(() => undefined);
  table.catch(() => { table = null; });
  return table;
}
export type CloseUpdateStatus = 'updated' | 'planned' | 'unchanged' | 'no_lead' | 'no_opportunity' | 'failed';
export interface CloseUpdateRow { id: number; recordingId: string; leadId: string; oppId: string; prospect: string; status: CloseUpdateStatus; changes: FieldChange[]; note: string; applied: boolean; created: string; closeUrl: string }
const rowOut = (r: any): CloseUpdateRow => ({
  id: Number(r.id), recordingId: r.recording_id, leadId: r.lead_id, oppId: r.opp_id, prospect: r.prospect, status: r.status, changes: Array.isArray(r.changes) ? r.changes : [],
  note: r.note, applied: r.applied, created: new Date(r.created_at).toISOString(), closeUrl: /^lead_[A-Za-z0-9]+$/.test(r.lead_id) ? `https://app.close.com/lead/${r.lead_id}/` : '',
});
/** The updates for one deal: by its Close lead or its email. Newest first, at most 10. */
export async function closeUpdatesFor(db: Db, d: { closeLead?: string; email?: string }): Promise<CloseUpdateRow[]> {
  const lead = /^lead_[A-Za-z0-9]+$/.test(d.closeLead ?? '') ? d.closeLead! : null;
  const email = String(d.email ?? '').trim().toLowerCase() || null;
  if (!lead && !email) return [];
  await ensureCloseUpdates(db);
  const r = await db.query(`SELECT * FROM hq_close_updates WHERE ($1::text IS NOT NULL AND lead_id=$1) OR ($2::text IS NOT NULL AND $2 = ANY(emails)) ORDER BY id DESC LIMIT 10`, [lead, email]);
  return r.rows.map(rowOut);
}

export interface CloseStepInput { recordingId: string; prospect: string; emails: string[]; review: ReviewForClose; transcript: string }
export interface CloseStepDeps {
  db: Db; cfg: Pick<Config, 'dryRun' | 'liveStages' | 'airtableApiKey' | 'airtableBaseId' | 'airtableBaseUrl'>; close: CloseClient; live: boolean; jobId?: number;
  /** The write, so the stage can run it as a paid (receipted) call. Default: close.updateOpportunity. */
  write?: (oppId: string, patch: OpportunityPatch) => Promise<CloseOpportunity>;
  activityAt?: Parameters<typeof logActivity>[2];
}

/** After a call review: find the lead's open opportunity, work out the change, apply it when live, keep it (once per recording). */
export async function coleUpdateClose(x: CloseStepDeps, input: CloseStepInput): Promise<CloseUpdateRow> {
  await ensureCloseUpdates(x.db);
  const prior = (await x.db.query(`SELECT * FROM hq_close_updates WHERE recording_id=$1`, [input.recordingId])).rows[0];
  if (prior && prior.status !== 'failed' && !(prior.status === 'planned' && x.live)) return rowOut(prior);
  const emails = [...new Set(input.emails.map((e) => e.trim().toLowerCase()).filter((e) => e && !/@dulcy\.io$/i.test(e)))].slice(0, 5);
  const save = async (status: CloseUpdateStatus, f: { leadId?: string; oppId?: string; changes?: FieldChange[]; note: string; applied?: boolean }) => {
    const r = await x.db.query(`INSERT INTO hq_close_updates (recording_id, lead_id, opp_id, prospect, emails, status, changes, note, applied, job_id) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
      ON CONFLICT (recording_id) DO UPDATE SET lead_id=EXCLUDED.lead_id, opp_id=EXCLUDED.opp_id, status=EXCLUDED.status, changes=EXCLUDED.changes, note=EXCLUDED.note, applied=EXCLUDED.applied, job_id=EXCLUDED.job_id, created_at=now() RETURNING *`,
      [input.recordingId, f.leadId ?? '', f.oppId ?? '', input.prospect.slice(0, 200), emails, status, JSON.stringify(f.changes ?? []), f.note.slice(0, 1000), f.applied === true, x.jobId ?? null]);
    return rowOut(r.rows[0]);
  };
  let lead: { id: string; name: string } | null = null;
  for (const e of emails) { const found = await x.close.leadsByEmail(e); if (found.length === 1) { lead = found[0]; break; } }
  if (!lead) return save('no_lead', { note: emails.length ? `No single Close lead has ${emails.join(' or ')}: nothing changed.` : 'No prospect email on the recording: nothing changed.' });
  const opp = pickOpportunity(await x.close.leadOpportunities(lead.id));
  if (!opp) return save('no_opportunity', { leadId: lead.id, note: `${lead.name} has no open opportunity in Close: nothing changed (Cole never creates one).` });
  const outcome = outcomeFromReview(input.review, input.transcript);
  const { patch, changes } = planChanges(opp, outcome);
  const why = `Call temperature ${input.review.deal_temperature} → ${outcome.confidence}%. ${outcome.valueNote}`;
  if (!changes.length) return save('unchanged', { leadId: lead.id, oppId: opp.id, note: `Close already matches the call. ${why}` });
  const line = changes.map((c) => `${c.field.replace('_', ' ')} ${c.from || 'empty'} → ${c.to}`).join(', ');
  if (!x.live) {
    const row = await save('planned', { leadId: lead.id, oppId: opp.id, changes, note: `Would change (cole.close_update is not in LIVE_STAGES): ${line}. ${why}` });
    await logActivity(x.cfg, { event: `Cole would update Close: ${lead.name}`, type: 'Info', agent: 'Cole', details: `${line}\n${why}\nNot applied: add cole.close_update to LIVE_STAGES.`, jobId: x.jobId }, x.activityAt);
    return row;
  }
  try {
    await (x.write ?? ((id, p) => x.close.updateOpportunity(id, p)))(opp.id, patch);
  } catch (e) {
    return save('failed', { leadId: lead.id, oppId: opp.id, changes, note: `Close did not take the change: ${String((e as Error).message ?? e).slice(0, 200)}` });
  }
  const row = await save('updated', { leadId: lead.id, oppId: opp.id, changes, applied: true, note: `${line}. ${why}` });
  await logActivity(x.cfg, { event: `Cole updated Close: ${lead.name}`, type: 'Step done', agent: 'Cole', details: `${line}\n${why}\nOpportunity ${opp.id}`, jobId: x.jobId }, x.activityAt);
  return row;
}

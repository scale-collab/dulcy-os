// HQ Sales, Batch 4a (Alex 2026-11-27): "Draft a contract from HQ" (Dulcy Sign). HQ must be usable for
// doing the work, not only reporting. Owner only (the route checks). NEVER sends.
//
// How Dulcy Sign agreements are made today (airtable/automations/contracts-run-requested-signing-
// action--wfl0AT5E1myewHAmt.json, airtable/SCHEMA.md → Contracts):
//   1. A row in Airtable "Contracts" with the terms and an Agreement Type ("Monthly / Retainer" or
//      "PPC / PPL"). Its formula "Preparation Requested" turns 1 while the row has no Contract ID,
//      no snapshot and no error.
//   2. The Airtable automation "Contracts — Run requested signing action" then asks sign.dulcy.io
//      (/api/admin/preparations/from-airtable/<record>, its own DULCY_SIGN_AIRTABLE_KEY) to prepare a
//      DRAFT. Nothing is sent.
//   3. Sending needs two more steps a person does: Contract Review Status = "Approved to send", then
//      Action = "Issue invitation".
// The engine has no Dulcy Sign key and Dulcy Sign has no "create from data" API the engine can reach,
// so HQ does step 1 only: (a) "Save draft" keeps the form in Postgres (hq_contract_drafts); (b)
// "Create draft in Dulcy Sign" writes ONE Contracts row from it (a draft that made its row never makes
// a second; only a failed write can be tried again).
// HQ never writes Action, Status, Contract Review Status, Contract ID or the PDF, so it cannot send.
import type { Db } from '../db/pool.js';
import type { HqAirtable } from './decisions.js';
import { CONTRACTS_T, nyDay, type Deal } from './sales.js';
import { ensureSalesTables } from './salesInsights.js';

/** Contracts fields HQ may write (airtable/SCHEMA.md). Action / Status / Review Status / Contract ID are left out on purpose. */
export const DRAFT_F = {
  title: 'fldCEKrtHefSmpHON', intake: 'fld92dlZdibDTXyMs', ws: 'fldsFrGAkver3PGWh', signer: 'fldgZKKn1K39cOKfJ', signerEmail: 'fldr55scbJVzVd0k6', test: 'fldPPC0a2JjLYsddn',
  legalName: 'fldDc6vMbFMj8W1pV', company: 'fldwo4EPfpisi145S', service: 'fldd1czx7q8b2RmZi', scope: 'fldnVl0jQ1MVPayCM', fee: 'fld01YSlG6iORVll5', billing: 'fld5rmYuUfmmU9mMa',
  start: 'fldBJxHVQDyPTrkKJ', term: 'fldvCymQYSDm82HTR', special: 'fldLB38PzTvELJbJr', missing: 'fldPCpbNS5vICwnyi', notes: 'fldEKnkb73la8jv1s', address: 'flde228COB5Ju3Zv7',
  currency: 'fldIsFDA3wSfunI09', type: 'fldK0lOMQRUT3pqFK', linkedin: 'fldoHwdOyGQZMEQ9C', aiCaller: 'fldbifE5IdOvckQuk', directMail: 'fldWU4MYcNRGRjX8S',
  callFee: 'fldwxW7KQ6lMgWxdB', techFee: 'fldowy6Spw5YYyNk1', initialFee: 'fldpLnGhiIWnUwYJe', closeLead: 'fldPPCevXj2yvmCZs',
} as const;
/** Fields that would move a contract toward sending: HQ never writes them. */
export const NEVER_WRITE = ['fldzJbyf1i20Riex9' /* Action */, 'fldjdDX4PbGCnnJfB' /* Status */, 'fldKQmds0Wm99VKcr' /* Contract Review Status */, 'fldFPubC1K8GXQ27N' /* Contract ID */, 'fldZhcTDLvo1RBhXg' /* Original PDF */] as const;

export type DealType = 'retainer' | 'per_call' | 'both';
export const DEAL_TYPES: { key: DealType; label: string; airtable: 'Monthly / Retainer' | 'PPC / PPL' }[] = [
  { key: 'retainer', label: 'Retainer (monthly fee)', airtable: 'Monthly / Retainer' },
  { key: 'per_call', label: 'Pay per call', airtable: 'PPC / PPL' },
  { key: 'both', label: 'Both (monthly fee + per call)', airtable: 'PPC / PPL' },
];
export interface DraftInput {
  dealType: DealType; monthly: number | null; perCall: number | null; initialFee: number | null; startDate: string;
  signerName: string; signerEmail: string; legalName: string; company: string; address: string;
  service: string; scope: string; term: string; specialTerms: string;
  channels: { linkedin: boolean; aiCaller: boolean; directMail: boolean };
}
const str = (v: unknown, max: number) => String(v ?? '').replace(/\r/g, '').trim().slice(0, max);
const money = (v: unknown): number | null => { if (v === null || v === undefined || v === '') return null; const x = Number(String(v).replace(/[$,\s]/g, '')); return Number.isFinite(x) && x >= 0 && x <= 100_000 ? Math.round(x * 100) / 100 : NaN; };
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Check a form: errors block saving; "missing" = still to confirm before sending (written to the row). Pure. */
export function validateDraft(b: any, today: string): { draft: DraftInput; errors: string[]; missing: string[] } {
  const errors: string[] = [];
  const dealType = (['retainer', 'per_call', 'both'] as const).find((k) => k === b?.dealType);
  if (!dealType) errors.push('Pick the deal type: retainer, pay per call, or both.');
  const monthly = money(b?.monthly), perCall = money(b?.perCall), initialFee = money(b?.initialFee);
  for (const [k, v] of [['Monthly fee', monthly], ['Per-call fee', perCall], ['Initial fee', initialFee]] as const) if (Number.isNaN(v)) errors.push(`${k}: a number from 0 to 100,000.`);
  if ((dealType === 'retainer' || dealType === 'both') && !(Number(monthly) > 0)) errors.push('Monthly fee: needed for a retainer.');
  if ((dealType === 'per_call' || dealType === 'both') && !(Number(perCall) > 0)) errors.push('Per-call fee: needed for pay per call.');
  const startDate = str(b?.startDate, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate) || !Number.isFinite(Date.parse(`${startDate}T12:00:00Z`))) errors.push('Start date: pick a day.');
  else if (startDate < nyDay(Date.parse(`${today}T12:00:00Z`) - 60 * 86_400_000)) errors.push('Start date: more than 60 days ago.');
  const signerEmail = str(b?.signerEmail, 200).toLowerCase();
  const draft: DraftInput = {
    dealType: dealType ?? 'retainer', monthly: Number.isNaN(monthly) ? null : monthly, perCall: Number.isNaN(perCall) ? null : perCall, initialFee: Number.isNaN(initialFee) ? null : initialFee, startDate,
    signerName: str(b?.signerName, 120), signerEmail, legalName: str(b?.legalName, 200), company: str(b?.company, 200), address: str(b?.address, 500),
    service: str(b?.service, 200), scope: str(b?.scope, 3000), term: str(b?.term, 200), specialTerms: str(b?.specialTerms, 2000),
    channels: { linkedin: b?.channels?.linkedin === true, aiCaller: b?.channels?.aiCaller === true, directMail: b?.channels?.directMail === true },
  };
  if (dealType === 'retainer') draft.perCall = null;
  if (!draft.signerName) errors.push('Signer name: who signs for the client.');
  if (!EMAIL.test(signerEmail)) errors.push('Signer email: a valid email.');
  if (!draft.company) errors.push('Company: the client\'s company or brand.');
  const missing = [
    !draft.legalName && 'Client legal name', !draft.address && 'Client address', !draft.service && 'Agreed service', !draft.scope && 'Agreed scope', !draft.term && 'Contract term',
  ].filter((x): x is string => !!x);
  return { draft, errors, missing };
}

/** The form filled from what HQ knows about the deal (no invented terms; the rest stays blank). Pure. */
export function prefill(d: Pick<Deal, 'name' | 'email' | 'company' | 'agreement' | 'money' | 'client'>): DraftInput {
  const a = d.agreement;
  const ppc = !!a && /ppc|ppl|per qualified call/i.test(a.type);
  const monthly = d.money?.monthly ?? a?.monthly ?? null, perCall = d.money?.perCall ?? a?.perCall ?? null;
  const company = (d.client?.name || d.company || a?.company || '').replace(/^https?:\/\/(www\.)?/i, '').replace(/\/.*$/, '');
  return {
    dealType: ppc ? (monthly ? 'both' : 'per_call') : 'retainer', monthly: monthly ?? null, perCall: ppc ? perCall ?? null : null, initialFee: null, startDate: '',
    signerName: /@/.test(d.name) ? '' : d.name, signerEmail: d.email, legalName: '', company, address: '', service: '', scope: '', term: '', specialTerms: '',
    channels: { linkedin: false, aiCaller: false, directMail: false },
  };
}

/** The Contracts row for a draft (field IDs). Never Action, Status, Review Status, Contract ID or PDF. Pure. */
export function contractFields(x: DraftInput, ctx: { deal: Pick<Deal, 'closeLead' | 'client' | 'agreements'>; by: string; today: string; missing: string[] }): Record<string, unknown> {
  const t = DEAL_TYPES.find((d) => d.key === x.dealType)!;
  const F = DRAFT_F;
  const typeLine = x.dealType === 'both' ? 'retainer + per call (sent as PPC / PPL: the monthly fee is the Monthly Tech Fee)' : x.dealType === 'per_call' ? 'pay per call (PPC / PPL)' : 'retainer (Monthly / Retainer)';
  const intake = ctx.deal.agreements.find((a) => a.table === 'intake')?.id;
  const fields: Record<string, unknown> = {
    [F.title]: `${x.company} – Dulcy Media agreement`, [F.type]: t.airtable, [F.signer]: x.signerName, [F.signerEmail]: x.signerEmail, [F.company]: x.company,
    [F.start]: x.startDate, [F.billing]: 'Monthly', [F.currency]: 'USD', [F.test]: false,
    [F.linkedin]: x.channels.linkedin, [F.aiCaller]: x.channels.aiCaller, [F.directMail]: x.channels.directMail,
    [F.notes]: `Drafted in HQ by ${ctx.by} on ${ctx.today}. Deal type: ${typeLine}. Review in Dulcy Sign before sending; HQ never sends.`,
  };
  if (x.dealType === 'retainer') fields[F.fee] = x.monthly;
  else { fields[F.callFee] = x.perCall; if (x.monthly) fields[F.techFee] = x.monthly; }
  if (x.initialFee) fields[F.initialFee] = x.initialFee;
  for (const [k, v] of [[F.legalName, x.legalName], [F.address, x.address], [F.service, x.service], [F.scope, x.scope], [F.term, x.term], [F.special, x.specialTerms]] as const) if (v) fields[k] = v;
  if (ctx.missing.length) fields[F.missing] = `Not confirmed yet (from HQ): ${ctx.missing.join(', ')}.`;
  if (/^lead_[A-Za-z0-9]+$/.test(ctx.deal.closeLead)) fields[F.closeLead] = ctx.deal.closeLead;
  if (ctx.deal.client?.id) fields[F.ws] = [ctx.deal.client.id];
  if (intake) fields[F.intake] = [intake];
  for (const k of NEVER_WRITE) delete fields[k];
  return fields;
}

export interface SavedDraft { id: number; dealId: string; status: 'saved' | 'creating' | 'created' | 'failed'; input: DraftInput; contractsRec: string; error: string; by: string; created: string; updated: string }
const rowOut = (r: any): SavedDraft => ({ id: Number(r.id), dealId: r.deal_id, status: r.status, input: r.input, contractsRec: r.contracts_rec ?? '', error: r.error ?? '', by: r.created_by, created: new Date(r.created_at).toISOString(), updated: new Date(r.updated_at).toISOString() });

export async function latestDraft(db: Db, dealId: string): Promise<SavedDraft | null> {
  await ensureSalesTables(db);
  const r = (await db.query(`SELECT * FROM hq_contract_drafts WHERE deal_id=$1 ORDER BY id DESC LIMIT 1`, [dealId])).rows[0];
  return r ? rowOut(r) : null;
}
/** GET /sales/:id/contract: the latest saved draft for the deal, else the form filled from the deal. */
export async function draftForm(db: Db, deal: Deal, today: string) {
  const saved = await latestDraft(db, deal.id);
  const draft = saved?.input ?? prefill(deal);
  return {
    deal: { id: deal.id, name: deal.name, company: deal.company, email: deal.email, closeLead: deal.closeLead, client: deal.client ? { id: deal.client.id, name: deal.client.name, status: deal.client.status } : null, agreement: deal.agreement ? { state: deal.agreement.state, tool: deal.agreement.tool, title: deal.agreement.title } : null },
    draft, saved, missing: validateDraft(draft, today).missing, types: DEAL_TYPES.map(({ key, label }) => ({ key, label })),
  };
}
/** POST /sales/:id/contract: save the form (a new version unless the last one is still only saved). Postgres only. */
export async function saveDraft(db: Db, deal: Deal, body: any, by: string, today: string): Promise<{ status: number; body: any }> {
  const v = validateDraft(body, today);
  if (v.errors.length) return { status: 400, body: { error: v.errors.join(' '), errors: v.errors } };
  await ensureSalesTables(db);
  const last = await latestDraft(db, deal.id);
  const r = last && (last.status === 'saved' || last.status === 'failed')
    ? (await db.query(`UPDATE hq_contract_drafts SET input=$2, status='saved', error='', updated_at=now() WHERE id=$1 RETURNING *`, [last.id, JSON.stringify(v.draft)])).rows[0]
    : (await db.query(`INSERT INTO hq_contract_drafts (deal_id, input, created_by) VALUES ($1,$2,$3) RETURNING *`, [deal.id, JSON.stringify(v.draft), by])).rows[0];
  return { status: 200, body: { saved: rowOut(r), missing: v.missing } };
}
/**
 * POST /sales/:id/contract/create: write ONE Contracts row from the saved draft. A draft that already
 * made its row answers with that row (never a second one). Dulcy Sign then prepares the draft itself.
 */
export async function createInDulcySign(at: Pick<HqAirtable, 'create'>, db: Db, deal: Deal, draftId: number, by: string, today: string): Promise<{ status: number; body: any }> {
  await ensureSalesTables(db);
  const c = await db.connect();
  let row: any;
  try {
    await c.query('BEGIN');
    row = (await c.query(`SELECT * FROM hq_contract_drafts WHERE id=$1 AND deal_id=$2 FOR UPDATE`, [draftId, deal.id])).rows[0];
    if (!row) { await c.query('ROLLBACK'); return { status: 404, body: { error: 'Save the draft first.' } }; }
    if (row.status === 'created') { await c.query('COMMIT'); return { status: 200, body: { saved: rowOut(row), already: true, message: 'This draft is already in Dulcy Sign (nothing new was made).' } }; }
    if (row.status === 'creating') { await c.query('ROLLBACK'); return { status: 409, body: { error: 'This draft is being created right now. Refresh in a minute.' } }; }
    await c.query(`UPDATE hq_contract_drafts SET status='creating', updated_at=now() WHERE id=$1`, [draftId]);
    await c.query('COMMIT');
  } catch (e) { await c.query('ROLLBACK').catch(() => {}); throw e; } finally { c.release(); }
  const v = validateDraft(row.input, today);
  if (v.errors.length) {
    await db.query(`UPDATE hq_contract_drafts SET status='failed', error=$2, updated_at=now() WHERE id=$1`, [draftId, v.errors.join(' ')]);
    return { status: 400, body: { error: v.errors.join(' ') } };
  }
  try {
    const rec = await at.create(CONTRACTS_T, contractFields(v.draft, { deal, by, today, missing: v.missing }));
    const done = (await db.query(`UPDATE hq_contract_drafts SET status='created', contracts_rec=$2, error='', updated_at=now() WHERE id=$1 RETURNING *`, [draftId, rec])).rows[0];
    return { status: 200, body: { saved: rowOut(done), message: 'Draft made. Dulcy Sign prepares it in about a minute; review it there. Nothing is sent until you approve it and press Issue invitation.' } };
  } catch (e) {
    const msg = String((e as Error).message ?? e).slice(0, 300);
    await db.query(`UPDATE hq_contract_drafts SET status='failed', error=$2, updated_at=now() WHERE id=$1`, [draftId, msg]);
    return { status: 502, body: { error: `Airtable did not take the draft: ${msg}` } };
  }
}

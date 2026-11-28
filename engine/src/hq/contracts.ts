// HQ Sales, Batch 4a (Alex 2026-11-27): "Draft a contract from HQ" (Dulcy Sign). HQ must be usable for
// doing the work, not only reporting. Owner only (the route checks). NEVER sends.
// Round 5 (Alex 2026-11-28): retainer or pay per call (no "both"); "Pull from Close" fills the client's
// details (read only); service, term and scope are choices from the two templates (no typing); the
// "Client responds to leads" checkbox adds CLIENT_RESPONDS_CLAUSE to Agreed Special Terms.
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
import type { CloseClient, CloseLeadDetail, CloseOpportunity } from '../providers/close.js';

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

// Round 5 (Alex 2026-11-28): two deal types only. "Both" is gone: pay per call already carries the
// monthly tech fee (the PPC / PPL template, Compensation 15.1). Old drafts saved as "both" open as pay
// per call with their monthly fee as the tech fee (that is how they were written to Dulcy Sign anyway).
export type DealType = 'retainer' | 'per_call';
export const DEAL_TYPES: { key: DealType; label: string; sub: string; airtable: 'Monthly / Retainer' | 'PPC / PPL' }[] = [
  { key: 'retainer', label: 'Retainer', sub: 'Monthly fee (Monthly / Retainer)', airtable: 'Monthly / Retainer' },
  { key: 'per_call', label: 'Pay per call', sub: 'Per qualified call + monthly tech fee (PPC / PPL)', airtable: 'PPC / PPL' },
];
/** A saved deal type to one of the two (old "both" = pay per call). Pure. */
export function dealTypeOf(v: unknown): DealType | null {
  return v === 'retainer' ? 'retainer' : v === 'per_call' || v === 'both' ? 'per_call' : null;
}

// ---------- the choices (Round 5: no typing for a normal contract) ----------
// Built from Dulcy's two Dulcy Sign templates (Google Docs "Client <> Dulcy | Growth Partnership" and
// "... Growth Partnership PPL", read 2026-11-28): the scope lists, the term clauses and the channels.
export type Channels = { linkedin: boolean; aiCaller: boolean; directMail: boolean };
const CHANNEL_NAMES: [keyof Channels, string][] = [['linkedin', 'LinkedIn'], ['aiCaller', 'AI caller'], ['directMail', 'direct mail']];
export const SERVICE_OPTIONS: { key: string; label: string }[] = [
  { key: 'cold_email', label: 'Cold email outreach' },
  { key: 'omnichannel', label: 'Omnichannel outreach (cold email + the extra channels ticked)' },
];
/** The Agreed Service text for a choice. Pure. */
export function serviceText(key: string, ch: Channels): string {
  const extra = CHANNEL_NAMES.filter(([k]) => ch[k]).map(([, n]) => n);
  if (key === 'omnichannel' && extra.length) return `AI-powered outreach (cold email, ${extra.join(', ')}) to generate qualified sales opportunities`;
  if (key === 'cold_email' || key === 'omnichannel') return 'AI-powered cold email outreach to generate qualified sales opportunities';
  return '';
}
export const TERM_OPTIONS: { key: string; label: string; text: string; type: DealType }[] = [
  // Retainer template, "Term & Termination".
  { key: 'month_to_month', label: 'Month to month, 14-day notice', type: 'retainer', text: 'Month to month, no minimum commitment. Either party may cancel with 14 days\' written notice before the next billing cycle.' },
  // PPC / PPL template, clause 12.
  { key: 'until_cancelled', label: 'Until the client stops, 14-day notice', type: 'per_call', text: 'Starts on the signing date and continues until the Client stops the services. Either party may end it with 14 days\' notice.' },
];
export const SCOPE_ITEMS: { key: string; label: string; type: DealType }[] = [
  // Retainer template, "Scope of Work".
  { key: 'cold_email', label: 'Cold email', type: 'retainer' },
  { key: 'lead_lists', label: 'Custom lead list creation and targeting', type: 'retainer' },
  { key: 'optimization', label: 'Ongoing optimization and campaign performance support', type: 'retainer' },
  { key: 'slack_updates', label: 'Weekly updates via Slack', type: 'retainer' },
  { key: 'funnel', label: 'Cold sales funnel optimization', type: 'retainer' },
  { key: 'coaching', label: 'Sales coaching as needed', type: 'retainer' },
  { key: 'portal', label: 'Access to Dulcy ESP and client portal', type: 'retainer' },
  // PPC / PPL template, "Services Provided" (clause 11).
  { key: 'ppc_system', label: 'Implement outreach systems to consistently deliver qualified sales calls', type: 'per_call' },
  { key: 'ppc_manage', label: 'Oversee and manage the outreach systems', type: 'per_call' },
  { key: 'ppc_list', label: 'Provide a lead list that matches the client\'s qualification criteria for each campaign (the client approves it)', type: 'per_call' },
];
/** The scope ticked by default for a deal type: everything its template lists. Pure. */
export const defaultScope = (t: DealType) => SCOPE_ITEMS.filter((s) => s.type === t).map((s) => s.key);
export const defaultTerm = (t: DealType) => TERM_OPTIONS.find((o) => o.type === t)!.key;
/** The Agreed Scope text: one line per ticked item, in the template's order. Pure. */
export function scopeText(keys: string[]): string {
  return SCOPE_ITEMS.filter((s) => keys.includes(s.key)).map((s) => `- ${s.label}`).join('\n');
}

/**
 * Round 5 checkbox "Client responds to leads": this exact clause goes into Agreed Special Terms, which
 * Dulcy Sign prints in the agreement. Plain wording, no promise of results.
 * TODO(Alex): review this wording before the first contract that uses it (draft only; HQ never sends).
 */
export const CLIENT_RESPONDS_CLAUSE =
  'Client responds to leads: Dulcy generates interested leads and passes them into the Client\'s CRM. ' +
  'The Client is responsible for responding to and following up with those leads. ' +
  'Dulcy does not guarantee any number of leads, meetings or sales.';
/** Agreed Special Terms: the clause (when ticked), then the optional note. Pure. */
export function specialTermsText(x: { clientRespondsToLeads: boolean; specialTerms: string }): string {
  return [x.clientRespondsToLeads ? CLIENT_RESPONDS_CLAUSE : '', x.specialTerms.trim()].filter(Boolean).join('\n\n');
}

export interface DraftInput {
  dealType: DealType; monthly: number | null; perCall: number | null; initialFee: number | null; startDate: string;
  signerName: string; signerEmail: string; signerPhone: string; legalName: string; company: string; address: string;
  /** The choices (Round 5). '' = none picked (an old draft keeps its own text below). */
  serviceKey: string; termKey: string; scopeKeys: string[]; clientRespondsToLeads: boolean;
  /** The text written to Dulcy Sign: from the choices, or an old draft's own text. */
  service: string; scope: string; term: string;
  /** The optional note (Agreed Special Terms, after the clause). */
  specialTerms: string;
  channels: Channels;
}
const str = (v: unknown, max: number) => String(v ?? '').replace(/\r/g, '').trim().slice(0, max);
const money = (v: unknown): number | null => { if (v === null || v === undefined || v === '') return null; const x = Number(String(v).replace(/[$,\s]/g, '')); return Number.isFinite(x) && x >= 0 && x <= 100_000 ? Math.round(x * 100) / 100 : NaN; };
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Check a form: errors block saving; "missing" = still to confirm before sending (written to the row). Pure. */
export function validateDraft(b: any, today: string): { draft: DraftInput; errors: string[]; missing: string[] } {
  const errors: string[] = [];
  const dealType = dealTypeOf(b?.dealType);
  if (!dealType) errors.push('Pick the deal type: retainer or pay per call.');
  const monthly = money(b?.monthly), perCall = money(b?.perCall), initialFee = money(b?.initialFee);
  for (const [k, v] of [['Monthly fee', monthly], ['Per-call fee', perCall], ['Initial fee', initialFee]] as const) if (Number.isNaN(v)) errors.push(`${k}: a number from 0 to 100,000.`);
  if (dealType === 'retainer' && !(Number(monthly) > 0)) errors.push('Monthly fee: needed for a retainer.');
  if (dealType === 'per_call' && !(Number(perCall) > 0)) errors.push('Per-call fee: needed for pay per call.');
  const startDate = str(b?.startDate, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate) || !Number.isFinite(Date.parse(`${startDate}T12:00:00Z`))) errors.push('Start date: pick a day.');
  else if (startDate < nyDay(Date.parse(`${today}T12:00:00Z`) - 60 * 86_400_000)) errors.push('Start date: more than 60 days ago.');
  const signerEmail = str(b?.signerEmail, 200).toLowerCase();
  const channels: Channels = { linkedin: b?.channels?.linkedin === true, aiCaller: b?.channels?.aiCaller === true, directMail: b?.channels?.directMail === true };
  const t = dealType ?? 'retainer';
  // The choices: only known keys. A known key writes its own text; no key keeps an old draft's text.
  const serviceKey = SERVICE_OPTIONS.some((o) => o.key === b?.serviceKey) ? String(b.serviceKey) : '';
  const termKey = TERM_OPTIONS.some((o) => o.key === b?.termKey) ? String(b.termKey) : '';
  const scopeKeys = Array.isArray(b?.scopeKeys) ? SCOPE_ITEMS.filter((s) => s.type === t && b.scopeKeys.includes(s.key)).map((s) => s.key) : [];
  const usesScopeChoices = Array.isArray(b?.scopeKeys) && (b.scopeKeys.length > 0 || !str(b?.scope, 3000));
  const draft: DraftInput = {
    dealType: t, monthly: Number.isNaN(monthly) ? null : monthly, perCall: Number.isNaN(perCall) ? null : perCall, initialFee: Number.isNaN(initialFee) ? null : initialFee, startDate,
    signerName: str(b?.signerName, 120), signerEmail, signerPhone: str(b?.signerPhone, 40), legalName: str(b?.legalName, 200), company: str(b?.company, 200), address: str(b?.address, 500),
    serviceKey, termKey, scopeKeys, clientRespondsToLeads: b?.clientRespondsToLeads === true,
    service: serviceKey ? serviceText(serviceKey, channels) : str(b?.service, 200),
    term: termKey ? TERM_OPTIONS.find((o) => o.key === termKey)!.text : str(b?.term, 300),
    scope: usesScopeChoices ? scopeText(scopeKeys) : str(b?.scope, 3000),
    specialTerms: str(b?.specialTerms, 2000), channels,
  };
  if (t === 'retainer') draft.perCall = null;
  if (serviceKey === 'omnichannel' && !CHANNEL_NAMES.some(([k]) => channels[k])) errors.push('Omnichannel: tick at least one extra channel, or pick cold email.');
  if (!draft.signerName) errors.push('Signer name: who signs for the client.');
  if (!EMAIL.test(signerEmail)) errors.push('Signer email: a valid email.');
  if (!draft.company) errors.push('Company: the client\'s company or brand.');
  const missing = [
    !draft.legalName && 'Client legal name', !draft.address && 'Client address', !draft.service && 'Agreed service', !draft.scope && 'Agreed scope', !draft.term && 'Contract term',
    t === 'per_call' && !(Number(draft.monthly) > 0) && 'Monthly tech fee',
  ].filter((x): x is string => !!x);
  return { draft, errors, missing };
}

/** An old saved draft (before Round 5) read as today's form: "both" = pay per call; its own texts kept. Pure. */
export function normalizeDraft(input: any): DraftInput {
  const t = dealTypeOf(input?.dealType) ?? 'retainer';
  const old = !('serviceKey' in (input ?? {}));
  return {
    dealType: t, monthly: input?.monthly ?? null, perCall: t === 'retainer' ? null : input?.perCall ?? null, initialFee: input?.initialFee ?? null, startDate: String(input?.startDate ?? ''),
    signerName: String(input?.signerName ?? ''), signerEmail: String(input?.signerEmail ?? ''), signerPhone: String(input?.signerPhone ?? ''),
    legalName: String(input?.legalName ?? ''), company: String(input?.company ?? ''), address: String(input?.address ?? ''),
    serviceKey: String(input?.serviceKey ?? ''), termKey: String(input?.termKey ?? ''),
    // An old draft with no scope text gets the template's scope; one with its own text keeps it (no choices).
    scopeKeys: Array.isArray(input?.scopeKeys) ? input.scopeKeys.map(String) : old && !input?.scope ? defaultScope(t) : [],
    clientRespondsToLeads: input?.clientRespondsToLeads === true,
    service: String(input?.service ?? ''), scope: String(input?.scope ?? ''), term: String(input?.term ?? ''), specialTerms: String(input?.specialTerms ?? ''),
    channels: { linkedin: input?.channels?.linkedin === true, aiCaller: input?.channels?.aiCaller === true, directMail: input?.channels?.directMail === true },
  };
}

/** The form filled from what HQ knows about the deal, plus the templates' standard choices (no invented terms). Pure. */
export function prefill(d: Pick<Deal, 'name' | 'email' | 'company' | 'agreement' | 'money' | 'client'>): DraftInput {
  const a = d.agreement;
  const ppc = !!a && /ppc|ppl|per qualified call/i.test(a.type);
  const t: DealType = ppc ? 'per_call' : 'retainer';
  const monthly = d.money?.monthly ?? a?.monthly ?? null, perCall = d.money?.perCall ?? a?.perCall ?? null;
  const company = (d.client?.name || d.company || a?.company || '').replace(/^https?:\/\/(www\.)?/i, '').replace(/\/.*$/, '');
  const channels = { linkedin: false, aiCaller: false, directMail: false };
  const scopeKeys = defaultScope(t), termKey = defaultTerm(t);
  return {
    dealType: t, monthly: monthly ?? null, perCall: ppc ? perCall ?? null : null, initialFee: null, startDate: '',
    signerName: /@/.test(d.name) ? '' : d.name, signerEmail: d.email, signerPhone: '', legalName: '', company, address: '',
    serviceKey: 'cold_email', termKey, scopeKeys, clientRespondsToLeads: false,
    service: serviceText('cold_email', channels), scope: scopeText(scopeKeys), term: TERM_OPTIONS.find((o) => o.key === termKey)!.text, specialTerms: '',
    channels,
  };
}

// ---------- "Pull from Close" (Round 5): read only ----------
export interface ClosePull { patch: Partial<DraftInput>; filled: { label: string; value: string }[]; missing: string[]; notes: string[] }
const fmtAddress = (a: CloseLeadDetail['addresses'][number]) =>
  [a.address1, a.address2, a.city, [a.state, a.zip].filter(Boolean).join(' '), a.country].map((x) => x.trim()).filter(Boolean).join(', ');
const usdText = (n: number) => `$${n.toLocaleString('en-US', { maximumFractionDigits: 2 })}`;
/**
 * What Close has for the contract: company, legal name (a custom field named "legal…"), the signer
 * (the contact with the deal's email, else the first one with an email), phone, address, and the deal
 * value when it is monthly (the retainer fee, or the pay-per-call monthly tech fee). Never guesses the
 * rest: what Close does not hold is listed as missing. Pure.
 */
export function closePrefill(lead: CloseLeadDetail, dealEmail: string, dealType: DealType): ClosePull {
  const patch: Partial<DraftInput> = {}; const filled: ClosePull['filled'] = []; const missing: string[] = []; const notes: string[] = [];
  const put = <K extends keyof DraftInput>(k: K, v: DraftInput[K] | '' | null | undefined, label: string) => {
    if (v === '' || v === null || v === undefined) { missing.push(label); return; }
    patch[k] = v as DraftInput[K]; filled.push({ label, value: String(v) });
  };
  put('company', lead.name.replace(/^https?:\/\/(www\.)?/i, '').replace(/\/.*$/, ''), 'Company');
  const legalKey = Object.keys(lead.custom).find((k) => /legal/i.test(k) && lead.custom[k]);
  put('legalName', legalKey ? lead.custom[legalKey] : '', 'Legal name');
  const e = dealEmail.trim().toLowerCase();
  const c = lead.contacts.find((x) => e && x.emails.includes(e)) ?? lead.contacts.find((x) => x.emails.length) ?? lead.contacts[0];
  put('signerName', c?.name ?? '', 'Signer name');
  put('signerEmail', c ? (e && c.emails.includes(e) ? e : c.emails[0] ?? '') : '', 'Signer email');
  put('signerPhone', c?.phones[0] ?? '', 'Phone');
  put('address', lead.addresses.map(fmtAddress).find(Boolean) ?? '', 'Address');
  // The deal: the newest open opportunity, else the newest won one.
  const newest = (xs: CloseOpportunity[]) => [...xs].sort((a, b) => (b.updated || b.created).localeCompare(a.updated || a.created))[0];
  const o = newest(lead.opportunities.filter((x) => x.statusType === 'active')) ?? newest(lead.opportunities.filter((x) => x.statusType === 'won'));
  const feeLabel = dealType === 'per_call' ? 'Monthly tech fee' : 'Monthly fee';
  if (!o) missing.push('Deal value (no open or won opportunity in Close)');
  else if (o.value && o.value > 0 && o.valuePeriod === 'monthly') put('monthly', o.value, feeLabel);
  else if (o.value && o.value > 0) { missing.push(feeLabel); notes.push(`Close deal value ${usdText(o.value)} ${o.valuePeriod === 'annual' ? 'a year' : 'one time'} (${o.status || 'open'}): not a monthly fee, so not filled.`); }
  else missing.push('Deal value (the Close opportunity has no value)');
  if (dealType === 'per_call') missing.push('Per-call fee (Close does not hold it)');
  if (o?.note) notes.push(`Close deal note: ${o.note.slice(0, 300)}`);
  return { patch, filled, missing, notes };
}

/** Find the deal's Close lead (the contract's lead id, else exactly one lead with the deal's email). Read only. */
export async function pullFromClose(close: Pick<CloseClient, 'leadDetail' | 'leadsByEmail'> | null | undefined, deal: Pick<Deal, 'closeLead' | 'email'>, dealType: unknown): Promise<{ status: number; body: any }> {
  if (!close) return { status: 200, body: { connected: false, error: 'Close is not connected on the server (CLOSE_API_KEY).' } };
  const t = dealTypeOf(dealType) ?? 'retainer';
  try {
    let leadId = /^lead_[A-Za-z0-9]+$/.test(deal.closeLead) ? deal.closeLead : '';
    if (!leadId) {
      const leads = deal.email ? await close.leadsByEmail(deal.email) : [];
      if (leads.length !== 1) return { status: 200, body: { connected: true, found: false, error: leads.length ? `${leads.length} leads in Close have ${deal.email}: not guessed. Fill it in by hand.` : `No lead in Close has ${deal.email || 'this deal\'s email'}.` } };
      leadId = leads[0].id;
    }
    const lead = await close.leadDetail(leadId);
    if (!lead) return { status: 200, body: { connected: true, found: false, error: 'Close did not find this deal\'s lead.' } };
    return { status: 200, body: { connected: true, found: true, lead: { id: lead.id, name: lead.name, url: lead.url }, ...closePrefill(lead, deal.email, t) } };
  } catch (e) {
    return { status: 200, body: { connected: true, found: false, error: `Close did not answer: ${String((e as Error).message ?? e).slice(0, 200)}` } };
  }
}

/** The Contracts row for a draft (field IDs). Never Action, Status, Review Status, Contract ID or PDF. Pure. */
export function contractFields(x: DraftInput, ctx: { deal: Pick<Deal, 'closeLead' | 'client' | 'agreements'>; by: string; today: string; missing: string[] }): Record<string, unknown> {
  const t = DEAL_TYPES.find((d) => d.key === x.dealType)!;
  const F = DRAFT_F;
  const typeLine = x.dealType === 'per_call' ? 'pay per call (PPC / PPL, with the monthly tech fee)' : 'retainer (Monthly / Retainer)';
  const intake = ctx.deal.agreements.find((a) => a.table === 'intake')?.id;
  const special = specialTermsText(x);
  const fields: Record<string, unknown> = {
    [F.title]: `${x.company} – Dulcy Media agreement`, [F.type]: t.airtable, [F.signer]: x.signerName, [F.signerEmail]: x.signerEmail, [F.company]: x.company,
    [F.start]: x.startDate, [F.billing]: 'Monthly', [F.currency]: 'USD', [F.test]: false,
    [F.linkedin]: x.channels.linkedin, [F.aiCaller]: x.channels.aiCaller, [F.directMail]: x.channels.directMail,
    [F.notes]: [
      `Drafted in HQ by ${ctx.by} on ${ctx.today}. Deal type: ${typeLine}.`,
      x.signerPhone ? `Signer phone: ${x.signerPhone}.` : '',
      x.clientRespondsToLeads ? 'Includes the "Client responds to leads" clause (Agreed Special Terms).' : '',
      'Review in Dulcy Sign before sending; HQ never sends.',
    ].filter(Boolean).join(' '),
  };
  if (x.dealType === 'retainer') fields[F.fee] = x.monthly;
  else { fields[F.callFee] = x.perCall; if (x.monthly) fields[F.techFee] = x.monthly; }
  if (x.initialFee) fields[F.initialFee] = x.initialFee;
  for (const [k, v] of [[F.legalName, x.legalName], [F.address, x.address], [F.service, x.service], [F.scope, x.scope], [F.term, x.term], [F.special, special]] as const) if (v) fields[k] = v;
  if (ctx.missing.length) fields[F.missing] = `Not confirmed yet (from HQ): ${ctx.missing.join(', ')}.`;
  if (/^lead_[A-Za-z0-9]+$/.test(ctx.deal.closeLead)) fields[F.closeLead] = ctx.deal.closeLead;
  if (ctx.deal.client?.id) fields[F.ws] = [ctx.deal.client.id];
  if (intake) fields[F.intake] = [intake];
  for (const k of NEVER_WRITE) delete fields[k];
  return fields;
}

export interface SavedDraft { id: number; dealId: string; status: 'saved' | 'creating' | 'created' | 'failed'; input: DraftInput; contractsRec: string; error: string; by: string; created: string; updated: string }
const rowOut = (r: any): SavedDraft => ({ id: Number(r.id), dealId: r.deal_id, status: r.status, input: normalizeDraft(r.input), contractsRec: r.contracts_rec ?? '', error: r.error ?? '', by: r.created_by, created: new Date(r.created_at).toISOString(), updated: new Date(r.updated_at).toISOString() });

export async function latestDraft(db: Db, dealId: string): Promise<SavedDraft | null> {
  await ensureSalesTables(db);
  const r = (await db.query(`SELECT * FROM hq_contract_drafts WHERE deal_id=$1 ORDER BY id DESC LIMIT 1`, [dealId])).rows[0];
  return r ? rowOut(r) : null;
}
/** GET /sales/:id/contract: the latest saved draft for the deal, else the form filled from the deal. */
export async function draftForm(db: Db, deal: Deal, today: string, closeConnected = false) {
  const saved = await latestDraft(db, deal.id);
  const draft = saved?.input ?? prefill(deal);
  return {
    deal: { id: deal.id, name: deal.name, company: deal.company, email: deal.email, closeLead: deal.closeLead, client: deal.client ? { id: deal.client.id, name: deal.client.name, status: deal.client.status } : null, agreement: deal.agreement ? { state: deal.agreement.state, tool: deal.agreement.tool, title: deal.agreement.title } : null },
    draft, saved, missing: validateDraft(draft, today).missing, types: DEAL_TYPES.map(({ key, label, sub }) => ({ key, label, sub })),
    options: { services: SERVICE_OPTIONS, terms: TERM_OPTIONS.map(({ key, label, type, text }) => ({ key, label, type, text })), scope: SCOPE_ITEMS, clientRespondsClause: CLIENT_RESPONDS_CLAUSE },
    closeConnected: !!closeConnected,
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

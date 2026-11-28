// HQ Step 3: Sales (Dulcy's own sales). One read-only area from booked call to signed and paid,
// replacing the Airtable Sales Center, the New Client Intake / Contracts screens and the sales
// numbers for daily use. Rule (Alex): show what needs action first; everything else one tap deeper.
//   - Needs action: calls today / tomorrow (with Cole's prep if there is one), calls with no outcome
//     logged, contracts sent and not signed after 2+ days, signed and not paid, paid and onboarding
//     not started, no-shows to re-book. One line each with the reason and the owner (Cole: calls and
//     follow-ups; Alex: signing and decisions; Ledger: payment; Atlas: onboarding).
//   - Pipeline: booked → showed → qualified → contract sent → signed → paid → onboarded, 30 or 90 days,
//     show rate and close rate as exact counts ("6 of 9 showed").
//   - Deal page: contact, calls (with the links Airtable stores), Cole's review (hq_reports), call
//     feedback, contract status and links, payment, onboarding steps. Links only: no send, sign,
//     charge or record change exists here.
//   - Top numbers: booked, showed, closed and new MRR, this month vs last month.
//   - "Data to fix" (Problem → Data → Fix → Why): records that disagree, to fix at the source.
// Owner only (money): members get 403 at the route. The money is also cut here (cutMoney) for anyone
// but the owner, so the view itself never carries it. Airtable reads are batched, one cache for
// everyone, 60 seconds. Nothing is written here.
// Batch 4a (Alex 2026-11-27): SignWell and PandaDoc are retired (Dulcy Sign is the one signing tool):
// their never-sent intake drafts are ignored, old signed ones still count. No Airtable links and no
// client tasks on the sales view. Xero payments (read only, when connected) count as paid. One deal
// shows ONE current agreement; the other records are folded with the reason (agreementRoles).
// Periods, capacity, hottest deals (Close) and the contract draft live in salesInsights.ts / contracts.ts.
import type { Db } from '../db/pool.js';
import type { AirtableRecord } from '../providers/airtable.js';
import type { HqAirtable } from './decisions.js';
import { clientKey } from './clients.js';
import { WORKSPACES_T } from './campaigns.js';
import { closeUpdatesFor } from './closeUpdates.js';
import { dealCalls } from './salesCalls.js';

// ---------- tables and fields (airtable/SCHEMA.md; field IDs, so a rename never breaks HQ) ----------
export const SALES_T = 'tblmEyHVAXDRwPxN9'; // Sales Data: one row per opportunity (Make 1.0 Booked Meeting; stage from Close)
export const INTAKE_T = 'tbljivFOoUW2nZ6FN'; // New Client Intake: the agreement (SignWell / PandaDoc fields, n8n)
export const CONTRACTS_T = 'tblFhsgZ970B44r1s'; // Contracts: Dulcy Sign (sign.dulcy.io)
export const FEEDBACK_T = 'tbljJ0uWryVMuilXn'; // Call Feedback
export const INVOICES_T = 'tblxGQqMzeEu23iHi'; // Client Invoices (Fanbasis payments land here, n8n)
export const CLIENT_TASKS_T = 'tblB97qvoidTSi9Vr'; // Client Tasks: onboarding steps (n8n 2.2 POSTCALL)
export const SALES_CACHE_MS = 60_000;

export const SF = {
  opp: 'fldUkwyW5NBQnic3s', company: 'fldAfEIsLhUkEjFvx', contact: 'fldX3uxuihKYTh2iV', email: 'fld4mAVHq3bWR2ZQx', source: 'fldsz376BaSqtZzOW',
  rep: 'fldR2fbyM26Z0nM4m', stage: 'fldaUIYb694AOnaaM', callDate: 'fld4ba7negAPQA8pk', heldDate: 'fld34mhdkOSbryqOh', closedDate: 'fldlGOBpFXOkiPpIn',
  offer: 'fldEp5BBj3adebZ0o', cash: 'fld0lJJLN9jldjimv', notes: 'fld8lShlrfclKslUo', lossReason: 'fldKp9ytQFcUZJ3Oz', created: 'fld6X0mEBTUYwdAd9',
  modified: 'fldolgksF7G31l2Hp', campaign: 'fld2g4s2NePf3juoS', emails: 'fldcO105C4UhKtM7v', booked: 'fld9asGRTxYCYRrHn', held: 'fldgHPFpUj4g3o1Ma',
  offerMade: 'fldWNRewGth8CqxnK', closed: 'fldsxeAkhHOUSa45z', forecast: 'fldTh5bYDyRW1il0j',
} as const;
export const IF = {
  company: 'flds46bYAn9Un6oy0', first: 'fldETmxefy4BYULgd', last: 'fld64exk1SAfjawMn', email: 'fldibCYLzac81Ycei', opp: 'fldDjxoB8VtSfJQp6',
  monthly: 'fldYgXtn2ihLIjYo3', today: 'fldVZhF8DdHiMT9lE', created: 'fldAyoOVMXuxTcDSt', status: 'fldx8DL2DOAXaZbop',
  pdUrl: 'fldxBfd7px8CtKvdL', pdSent: 'fld69wdeGKUeDOljm', pdViewed: 'fldmnoonaCkGC3jAC', pdDone: 'fldwMor6QvuM0V9Mt', pdError: 'fldV48SDypqQC7paP',
  swUrl: 'fldwU7mqZNHKSOEhg', swSent: 'fldqPSK6YKXobCikl', swViewed: 'fldhHTae364IjgGIc', swDone: 'fldGhrzJXp2iREHMd', swError: 'fldXhQRuqYp1slLWh',
  forwarded: 'fldvgKLAomk1dZi9r', type: 'fldHqH5S87HuKfQOX', start: 'fldZAsLGQwzyiglyO', ws: 'fldzKjlgwusuJbGxh', contracts: 'fldaxkDEl73r49TVt',
  perCall: 'fldsRI56LJLCgp8A6', techFee: 'fldBYuLO8pIEjOhzi', currency: 'fldIqufbAnYsmZcpS',
} as const;
export const CF = {
  title: 'fldCEKrtHefSmpHON', intake: 'fld92dlZdibDTXyMs', ws: 'fldsFrGAkver3PGWh', signer: 'fldgZKKn1K39cOKfJ', signerEmail: 'fldr55scbJVzVd0k6',
  test: 'fldPPC0a2JjLYsddn', status: 'fldjdDX4PbGCnnJfB', sent: 'fldSQdl9ZdjRfO07c', viewed: 'fldT0deiIrbrntyxP', done: 'fldCGwKkFODyXlAc7',
  manage: 'fldpOiIQ45ZHC3aA5', clientSigned: 'fldyKVAB393Jxqzcu', fee: 'fld01YSlG6iORVll5', billing: 'fld5rmYuUfmmU9mMa', review: 'fldKQmds0Wm99VKcr',
  type: 'fldK0lOMQRUT3pqFK', techFee: 'fldowy6Spw5YYyNk1', callFee: 'fldwxW7KQ6lMgWxdB', closeLead: 'fldPPCevXj2yvmCZs', closeOpp: 'fldXyjtYw1dMe4ox5',
  company: 'fldwo4EPfpisi145S', error: 'fldH9cVdFDWTcDrPI', reviewDoc: 'fldIv9drauzKrRrNt', currency: 'fldIsFDA3wSfunI09',
} as const;
export const FF = {
  lead: 'fldPDcQp7z50dopLN', status: 'fldXNEJcG9LUnR73H', rating: 'fld1KGADNp3pX2mLi', notes: 'fldZXCeH23P9azJqb', link: 'fldIMEgJzXPjaSCp2',
  emails: 'fldfSyqD5IEoRy2w7', newDate: 'fldsgmVQKkbAoTvsE', created: 'fld2Vc0nViSuJ0jwb',
} as const;
export const WF = {
  name: 'fld48x6Yg3v6RP30W', status: 'fldSr8KQs90Uk2d26', paid: 'fld4a9216boSXKCzu', formDone: 'fldjcHlBqldvSCOgJ', onboarding: 'fldbwnPMVNU24k7Dq',
  start: 'fldfO4aYldYhP2QYe', agreement: 'fldsGYHaXaTcyo9Yy', contracts: 'fldUaWwL5SpcGlRdq', type: 'fld91lSa5rBfLrIQM',
} as const;
export const VF = { amount: 'fld9hZw9TzROZKmQc', date: 'fldl4ud7hTdlXsSSZ', type: 'fld4EjkIMQbPrW5I3', client: 'fldsMWMdN7B4YkMo8', status: 'fldNJY30aY5EZweAX' } as const;
export const TF = { task: 'fld9ZbsQc4mrQO0GX', stage: 'fldKNlgMuXrS2TJ9U', client: 'fldmgwSf9NbMgFDCi', modified: 'fldfAherhhCr9m93D' } as const;

/**
 * The "needs action" limits. A contract sent and not signed after 2 days (Alex's brief). Calls and
 * no-shows: the last 30 days (older ones are a data note, not today's work). Contracts: 90 days.
 */
export const SALES_LIMITS = { unsignedDays: 2, callDays: 30, contractDays: 90, noNextStepDays: 2 } as const;

// ---------- small helpers (pure) ----------
const s = (v: unknown): string => (Array.isArray(v) ? s(v[0]) : v === undefined || v === null ? '' : typeof v === 'object' ? String((v as any).name ?? (v as any).id ?? '') : String(v)).trim();
const n = (v: unknown): number | null => { const t = s(v); const x = Number(t); return t !== '' && Number.isFinite(x) ? x : null; };
const ids = (v: unknown): string[] => (Array.isArray(v) ? v : v ? [v] : []).map((x: any) => (typeof x === 'string' ? x : x?.id)).filter((x): x is string => typeof x === 'string' && /^rec[A-Za-z0-9]{14}$/.test(x));
const names = (v: unknown): string[] => (Array.isArray(v) ? v : []).map((x: any) => (typeof x === 'string' ? '' : String(x?.name ?? ''))).filter(Boolean);
const yes = (v: unknown) => v === true || v === 1 || s(v).toLowerCase() === 'true';
const mail = (v: unknown) => s(v).toLowerCase();
const DAY = 86_400_000;
const TZ = 'America/New_York';
/** YYYY-MM-DD in New York. */
export const nyDay = (t: number | string): string => new Date(typeof t === 'string' ? Date.parse(t) : t).toLocaleDateString('en-CA', { timeZone: TZ });
const dayOf = (iso: string) => (iso ? (/^\d{4}-\d{2}-\d{2}$/.test(iso) ? iso : nyDay(iso)) : '');
const dayMs = (d: string) => Date.parse(`${d}T12:00:00Z`);
const daysBetween = (a: string, b: string) => Math.round((dayMs(b) - dayMs(a)) / DAY);
export const shortDay = (iso: string) => (iso ? new Date(dayMs(dayOf(iso))).toLocaleDateString('en-US', { timeZone: 'UTC', month: 'short', day: 'numeric' }) : '');
const latest = (xs: string[]) => xs.filter((x) => x && Number.isFinite(Date.parse(x))).sort((a, b) => Date.parse(b) - Date.parse(a))[0] ?? '';
const plural = (k: number, one: string, many = `${one}s`) => `${k} ${k === 1 ? one : many}`;
const few = (xs: string[], max = 4) => `${xs.slice(0, max).join(', ')}${xs.length > max ? ` +${xs.length - max} more` : ''}`;
const httpsOnly = (u: string) => (/^https:\/\/\S+$/i.test(u) ? u : '');
/** A company key from a URL ("https://www.thinkstrategic.com/x" → "thinkstrategic") or a name (clientKey). Pure. */
export function companyKey(x: string): string {
  const t = String(x ?? '').trim().toLowerCase();
  if (!t || /^(n\/?a|none|-)$/.test(t)) return '';
  const host = /^(?:https?:\/\/)?(?:www\.)?([a-z0-9-]+(?:\.[a-z0-9-]+)+)(?:[/:?#].*)?$/.exec(t);
  if (host && !/\s/.test(t)) return host[1].split('.').slice(0, -1).join('').replace(/[^a-z0-9]/g, '');
  return clientKey(t).replace(/(inc|llc|ltd|limited|corp|corporation|co)$/g, '');
}

// ---------- agreements (New Client Intake rows and Dulcy Sign contracts) ----------
export type AgreementState = 'draft' | 'sent' | 'viewed' | 'signed' | 'declined' | 'expired' | 'error' | 'none';
export interface Agreement {
  id: string; table: 'intake' | 'contract'; tool: 'Dulcy Sign' | 'SignWell' | 'PandaDoc' | 'Airtable';
  title: string; company: string; email: string; signer: string; state: AgreementState; review: string;
  created: string; sentAt: string; viewedAt: string; signedAt: string; clientSignedAt: string; forwardedAt: string;
  url: string; reviewDoc: string; closeLead: string; wsIds: string[]; intakeIds: string[]; contractIds: string[]; error: string; test: boolean;
  /** Monthly value: the retainer, or the monthly tech fee on a pay-per-call deal. Owner only (cut for anyone else). */
  monthly: number | null; perCall: number | null; type: string; currency: string;
}
const INTAKE_STATE: Record<string, AgreementState> = { 'pending creation': 'draft', draft: 'draft', sent: 'sent', viewed: 'viewed', completed: 'signed', declined: 'declined', expired: 'expired', error: 'error' };
const CONTRACT_STATE: Record<string, AgreementState> = { draft: 'draft', sent: 'sent', in_progress: 'viewed', finalizing: 'viewed', completed: 'signed', declined: 'declined', expired: 'expired', voided: 'expired' };

export function intakeAgreement(r: AirtableRecord): Agreement {
  const f = r.fields;
  const sw = !!(s(f[IF.swUrl]) || s(f[IF.swSent]) || s(f[IF.swDone]));
  const pd = !sw && !!(s(f[IF.pdUrl]) || s(f[IF.pdSent]) || s(f[IF.pdDone]));
  const status = s(f[IF.status]).toLowerCase();
  let state: AgreementState = INTAKE_STATE[status] ?? 'none';
  const signedAt = s(f[IF.swDone]) || s(f[IF.pdDone]);
  if (signedAt) state = 'signed';
  const ppc = /per qualified call/i.test(s(f[IF.type]));
  const monthly = n(f[IF.monthly]);
  return {
    id: r.id, table: 'intake', tool: sw ? 'SignWell' : pd ? 'PandaDoc' : 'Airtable',
    title: s(f[IF.opp]) || `${s(f[IF.company])} agreement`, company: s(f[IF.company]), email: mail(f[IF.email]),
    signer: [s(f[IF.first]), s(f[IF.last])].filter(Boolean).join(' '), state, review: '',
    created: s(f[IF.created]) || r.createdTime || '', sentAt: s(f[IF.swSent]) || s(f[IF.pdSent]), viewedAt: s(f[IF.swViewed]) || s(f[IF.pdViewed]),
    signedAt, clientSignedAt: '', forwardedAt: s(f[IF.forwarded]), url: httpsOnly(s(f[IF.swUrl]) || s(f[IF.pdUrl])), reviewDoc: '', closeLead: '',
    wsIds: ids(f[IF.ws]), intakeIds: [r.id], contractIds: ids(f[IF.contracts]), error: (s(f[IF.swError]) || s(f[IF.pdError])).slice(0, 300), test: false,
    monthly: ppc ? n(f[IF.techFee]) ?? monthly : monthly, perCall: ppc ? n(f[IF.perCall]) : null, type: s(f[IF.type]), currency: s(f[IF.currency]) || 'USD',
  };
}
export function contractAgreement(r: AirtableRecord): Agreement {
  const f = r.fields;
  const title = s(f[CF.title]);
  const email = mail(f[CF.signerEmail]);
  const monthlyBilling = !s(f[CF.billing]) || /monthly/i.test(s(f[CF.billing]));
  const ppc = /ppc|ppl/i.test(s(f[CF.type]));
  const status = s(f[CF.status]).toLowerCase();
  return {
    id: r.id, table: 'contract', tool: 'Dulcy Sign', title: title || 'Contract', company: s(f[CF.company]), email, signer: s(f[CF.signer]),
    state: s(f[CF.done]) ? 'signed' : CONTRACT_STATE[status] ?? 'none', review: s(f[CF.review]),
    created: r.createdTime ?? '', sentAt: s(f[CF.sent]), viewedAt: s(f[CF.viewed]), signedAt: s(f[CF.done]), clientSignedAt: s(f[CF.clientSigned]), forwardedAt: '',
    url: httpsOnly(s(f[CF.manage])), reviewDoc: httpsOnly(s(f[CF.reviewDoc])), closeLead: /^lead_[A-Za-z0-9]+$/.test(s(f[CF.closeLead])) ? s(f[CF.closeLead]) : '',
    wsIds: ids(f[CF.ws]), intakeIds: ids(f[CF.intake]), contractIds: [r.id], error: s(f[CF.error]).slice(0, 300),
    test: yes(f[CF.test]) || /^(qa only|test\b)|no legal effect/i.test(title) || /@example\.(invalid|com)$/.test(email),
    monthly: ppc ? n(f[CF.techFee]) : monthlyBilling ? n(f[CF.fee]) : null, perCall: ppc ? n(f[CF.callFee]) : null, type: s(f[CF.type]), currency: s(f[CF.currency]) || 'USD',
  };
}
const STATE_RANK: Record<AgreementState, number> = { none: 0, error: 1, draft: 2, expired: 3, declined: 3, sent: 4, viewed: 5, signed: 6 };
/** The agreement that says where the deal is: signed first, then the furthest along, then the newest. Pure. */
export function leadAgreement(xs: Agreement[]): Agreement | null {
  return [...xs].sort((a, b) => STATE_RANK[b.state] - STATE_RANK[a.state] || Date.parse(latest([b.signedAt, b.sentAt, b.created]) || '0') - Date.parse(latest([a.signedAt, a.sentAt, a.created]) || '0'))[0] ?? null;
}

// ---------- stages ----------
export const STAGE_KEYS = ['booked', 'showed', 'qualified', 'sent', 'signed', 'paid', 'onboarded'] as const;
export type StageKey = (typeof STAGE_KEYS)[number];
export const STAGE_LABEL: Record<StageKey, string> = { booked: 'Booked', showed: 'Showed', qualified: 'Qualified', sent: 'Contract sent', signed: 'Signed', paid: 'Paid', onboarded: 'Onboarded' };
/** Sales Data stages (synced from Close by Make) that mean the call happened / went further. */
const HELD_STAGES = new Set(['Call Done', 'Follow Up Call', 'Contract Sent', 'Won']);
const QUALIFIED_STAGES = new Set(['Follow Up Call', 'Contract Sent', 'Won']);
const LOST_STAGES = new Set(['Lost', 'Canceled', 'Nurture', 'Lead Lists']);
const NOT_HELD_STAGES = new Set(['No Show', 'Canceled', 'Reschedule']);

export interface StageFacts {
  airtableStage: string; callDate: string; heldDate: string; heldFlag: boolean; offerMade: boolean; dealClosed: boolean; cash: number;
  feedbackStatus: string; agreement: Agreement | null; clientPaid: boolean; onboarded: boolean;
}
/** Which pipeline stages a deal reached, from the fields the Make / n8n flows write. Pure. */
export function stagesOf(x: StageFacts): Record<StageKey, boolean> {
  const st = x.airtableStage;
  const a = x.agreement;
  const signed = a?.state === 'signed' || x.dealClosed || st === 'Won';
  const sent = signed || (!!a && ['sent', 'viewed', 'declined', 'expired'].includes(a.state)) || st === 'Contract Sent';
  // A No Show / Canceled / Reschedule stage wins over a stray "Call Held?" tick (a data note says so).
  const missed = NOT_HELD_STAGES.has(st) && !sent;
  const showed = sent || (!missed && (x.heldFlag || !!x.heldDate || HELD_STAGES.has(st) || /^(qualified|unqualified)/i.test(x.feedbackStatus)));
  const qualified = sent || (showed && (x.offerMade || QUALIFIED_STAGES.has(st) || /^qualified/i.test(x.feedbackStatus)));
  const paid = signed && (x.clientPaid || x.cash > 0);
  // The onboarding form is its own fact (Alex 2026-11-27: MJJ's form was in but showed unchecked
  // because the payment was missing). It needs a signed deal, not a recorded payment.
  const onboarded = signed && x.onboarded;
  return { booked: true, showed, qualified, sent, signed, paid, onboarded };
}
export const furthest = (r: Record<StageKey, boolean>): StageKey => [...STAGE_KEYS].reverse().find((k) => r[k]) ?? 'booked';

// ---------- deals ----------
export type Owner = 'Cole' | 'Alex' | 'Ledger' | 'Atlas';
export type ActionKind = 'call_today' | 'call_tomorrow' | 'no_outcome' | 'sign' | 'unsigned' | 'draft' | 'unpaid' | 'onboard' | 'rebook';
export const ACTION_ORDER: ActionKind[] = ['call_today', 'sign', 'unpaid', 'unsigned', 'no_outcome', 'rebook', 'onboard', 'call_tomorrow', 'draft'];
export const ACTION_LABEL: Record<ActionKind, string> = {
  call_today: 'Call today', call_tomorrow: 'Call tomorrow', no_outcome: 'No outcome', sign: 'Your signature', unsigned: 'Not signed', draft: 'Not sent',
  unpaid: 'Not paid', onboard: 'Start onboarding', rebook: 'Re-book',
};
export interface ActionLine { kind: ActionKind; owner: Owner; text: string; link?: string }

export interface FeedbackRow { id: string; status: string; rating: number | null; notes: string; link: string; newDate: string; created: string }
export interface ColeReport {
  id: number; kind: string; title: string; summary: string; link: string; score: number | null; created: string; temperature?: string; nextStep?: string; verdict?: string;
  /** Round 5: the Fathom meeting title (the calendar event name), Cole's call type, Fathom's one line on the meeting, when it was recorded. */
  meetingTitle?: string; callType?: string; about?: string; meetingAt?: string;
}
export interface ClientRef { id: string; name: string; status: string; paid: boolean; formDone: boolean; onboardingLinked: boolean; start: string }
export interface InvoiceRow { id: string; amount: number | null; date: string; type: string; status: string; client: string }

export interface DealMoney { monthly: number | null; perCall: number | null; forecast: number | null; offer: number | null; cash: number | null; currency: string; paidTotal: number | null }
export interface Deal {
  id: string; salesRec: string; name: string; company: string; email: string; source: string; rep: string; campaign: string;
  airtableStage: string; lossReason: string; notes: string; callDate: string; heldDate: string; bookedAt: string; startDay: string;
  stages: Record<StageKey, boolean>; stage: StageKey; lost: boolean; inactiveClient: boolean;
  agreements: Agreement[]; agreement: Agreement | null; signedDay: string;
  client: ClientRef | null; clientMatch: 'link' | 'name' | null; paidKnown: boolean; paidVia: string; onboardingStarted: boolean;
  feedback: FeedbackRow[]; reviews: ColeReport[]; prep: ColeReport | null; emailRecs: string[];
  needs: ActionLine[]; money?: DealMoney; closeUrl: string;
  /** The day the first payment was seen (Airtable invoice, Xero), '' when unknown. */
  paidDay: string;
  /** Close lead id (lead_…) from a Dulcy Sign contract, '' when none. */
  closeLead: string;
  /** Why each agreement is on the deal: the current one first, the others folded with a reason. */
  agreementRoles: AgreementRole[];
}
/** A payment seen in Xero (read only): an invoice with money paid, or money received. */
export interface XeroPayment { contact: string; day: string; amount: number | null; kind: 'invoice' | 'received' }

export interface SalesSource {
  sales: AirtableRecord[]; intake: AirtableRecord[]; contracts: AirtableRecord[]; feedback: AirtableRecord[]; ws: AirtableRecord[]; invoices: AirtableRecord[]; readAt: string;
}

const feedbackOf = (r: AirtableRecord): FeedbackRow => ({
  id: r.id, status: s(r.fields[FF.status]), rating: n(r.fields[FF.rating]), notes: s(r.fields[FF.notes]).slice(0, 1500),
  link: httpsOnly(s(r.fields[FF.link])), newDate: s(r.fields[FF.newDate]), created: s(r.fields[FF.created]) || r.createdTime || '',
});
const clientOf = (w: AirtableRecord): ClientRef => ({
  id: w.id, name: s(w.fields[WF.name]), status: s(w.fields[WF.status]), paid: yes(w.fields[WF.paid]), formDone: yes(w.fields[WF.formDone]),
  onboardingLinked: ids(w.fields[WF.onboarding]).length > 0, start: s(w.fields[WF.start]),
});
const invoiceOf = (r: AirtableRecord): InvoiceRow => ({ id: r.id, amount: n(r.fields[VF.amount]), date: s(r.fields[VF.date]), type: s(r.fields[VF.type]), status: s(r.fields[VF.status]), client: ids(r.fields[VF.client])[0] ?? '' });
const isPaidInvoice = (v: InvoiceRow) => /successful/i.test(v.type) || /^paid$/i.test(v.status);

/** Match Cole's reports to a deal: the title names the contact or the company. Pure. */
export function reportMatches(title: string, d: { name: string; company: string; agreements?: { company: string }[] }): boolean {
  const t = ` ${String(title ?? '').toLowerCase().replace(/[^a-z0-9]+/g, ' ')} `;
  const nm = String(d.name ?? '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  if (nm.split(' ').length >= 2 && t.includes(` ${nm} `)) return true;
  const keys = [d.company, ...(d.agreements ?? []).map((a) => a.company)].map(companyKey).filter((k) => k.length >= 4);
  const flat = t.replace(/ /g, '');
  return keys.some((k) => flat.includes(k));
}

export interface BuildCtx { now: number; reports: ColeReport[]; xero?: XeroPayment[] | null }

export interface AgreementRole { id: string; primary: boolean; why: string }
/** One current agreement per deal; every other record gets the reason it is folded. Pure. */
export function agreementRoles(xs: Agreement[], lead: Agreement | null): AgreementRole[] {
  if (!lead) return xs.map((a) => ({ id: a.id, primary: false, why: 'No current agreement' }));
  const twin = (a: Agreement, b: Agreement) => a.table !== b.table && (a.intakeIds.includes(b.id) || b.intakeIds.includes(a.id) || a.contractIds.includes(b.id) || b.contractIds.includes(a.id));
  const when = (a: Agreement) => latest([a.signedAt, a.sentAt, a.created]);
  const roles = xs.map((a): AgreementRole => {
    if (a.id === lead.id) return { id: a.id, primary: true, why: 'Current agreement' };
    if (twin(a, lead)) return { id: a.id, primary: false, why: `Same agreement, second record (${a.table === 'intake' ? 'New Client Intake row' : 'Dulcy Sign copy'})` };
    if (a.state === 'declined' || a.state === 'expired') return { id: a.id, primary: false, why: a.state === 'declined' ? 'Declined' : 'Expired or voided' };
    if (a.state === 'draft' || a.state === 'none' || a.state === 'error') return { id: a.id, primary: false, why: 'Draft, never sent' };
    if (lead.state === 'signed' && a.state !== 'signed') return { id: a.id, primary: false, why: 'Sent, never signed: replaced by the signed one' };
    return { id: a.id, primary: false, why: Date.parse(when(a) || '0') < Date.parse(when(lead) || '0') ? 'Older version' : 'Another version' };
  });
  return [...roles.filter((r) => r.primary), ...roles.filter((r) => !r.primary)];
}

/** Xero payments that belong to a deal: the contact matches the company, client, legal name or signer. Pure. */
export function xeroMatches(rows: XeroPayment[], d: { name: string; company: string; client: { name: string } | null; agreements: Agreement[] }, fromDay: string): XeroPayment[] {
  const keys = new Set([d.company, d.client?.name ?? '', ...d.agreements.map((a) => a.company)].map(companyKey).filter((k) => k.length >= 4));
  const people = new Set([d.name, ...d.agreements.map((a) => a.signer)].map((x) => String(x ?? '').trim().toLowerCase()).filter((x) => x.split(/\s+/).length >= 2));
  return rows.filter((r) => (keys.has(companyKey(r.contact)) || people.has(r.contact.trim().toLowerCase())) && (!fromDay || r.day >= fromDay)).sort((a, b) => a.day.localeCompare(b.day));
}

/** Every deal: Sales Data rows, with their agreements, client, payment, onboarding and feedback. Pure. */
export function buildDeals(src: SalesSource, ctx: BuildCtx): Deal[] {
  const today = nyDay(ctx.now);
  const ws = src.ws.filter((w) => s(w.fields[WF.name]));
  const wsById = new Map(ws.map((w) => [w.id, w]));
  const invoices = src.invoices.map(invoiceOf);
  // Agreements: intake rows that track an agreement, and Dulcy Sign contracts that are not tests.
  const contracts = src.contracts.map(contractAgreement).filter((c) => !c.test);
  const intakeRows = src.intake.map(intakeAgreement);
  // SignWell / PandaDoc are retired (Alex 2026-11-27): an intake row that never went out is not an agreement.
  const tracked = intakeRows.filter((a) => (a.state !== 'none' || a.url || a.contractIds.length) && !(['draft', 'none', 'error'].includes(a.state) && !a.sentAt));
  const agreements: Agreement[] = [...tracked];
  // A Dulcy Sign contract linked to an intake row is shown beside it (both are on the deal page).
  agreements.push(...contracts);
  const sales = src.sales.filter((r) => s(r.fields[SF.email]) || s(r.fields[SF.contact]));
  type Draft = { rec: AirtableRecord | null; email: string; keys: Set<string>; agreements: Agreement[] };
  const drafts: Draft[] = sales.map((r) => ({ rec: r, email: mail(r.fields[SF.email]), keys: new Set([companyKey(s(r.fields[SF.company]))].filter(Boolean)), agreements: [] }));
  const byEmail = (e: string) => (e ? drafts.filter((d) => d.email === e).sort((a, b) => s(b.rec?.fields[SF.callDate]).localeCompare(s(a.rec?.fields[SF.callDate])))[0] : undefined);
  const leftover: Agreement[] = [];
  // Pass 1: by email (the agreement's email or the intake row it belongs to).
  const intakeEmail = new Map(intakeRows.map((a) => [a.id, a.email]));
  for (const a of agreements) {
    const e = a.email || a.intakeIds.map((x) => intakeEmail.get(x) ?? '').find(Boolean) || '';
    const d = byEmail(e) ?? (a.table === 'contract' ? a.intakeIds.map((x) => intakeEmail.get(x) ?? '').map(byEmail).find(Boolean) : undefined);
    if (d) { d.agreements.push(a); const k = companyKey(a.company); if (k) d.keys.add(k); } else leftover.push(a);
  }
  // Pass 2: by company; then agreement-only deals (an agreement with no Sales Data row).
  for (const a of leftover) {
    const k = companyKey(a.company);
    const e = a.email || a.intakeIds.map((x) => intakeEmail.get(x) ?? '').find(Boolean) || '';
    const d = drafts.find((x) => (k && x.keys.has(k)) || (e && x.email === e) || x.agreements.some((y) => a.intakeIds.includes(y.id) || y.intakeIds.includes(a.id)));
    if (d) { d.agreements.push(a); if (k) d.keys.add(k); } else drafts.push({ rec: null, email: e, keys: new Set([k].filter(Boolean)), agreements: [a] });
  }

  const feedback = src.feedback.map((r) => ({ r, emails: [...ids(r.fields[FF.emails]), ...(/^rec[A-Za-z0-9]{14}$/.test(s(r.fields[FF.lead])) ? [s(r.fields[FF.lead])] : [])], names: names(r.fields[FF.emails]).map((x) => x.toLowerCase()) }));

  return drafts.map((dr): Deal => {
    const f = dr.rec?.fields ?? {};
    const lead = leadAgreement(dr.agreements);
    const first = dr.agreements[0];
    const name = s(f[SF.contact]) || lead?.signer || first?.signer || dr.email;
    const company = s(f[SF.company]) || lead?.company || first?.company || '';
    const emailRecs = ids(f[SF.emails]);
    const fb = feedback.filter((x) => x.emails.some((id) => emailRecs.includes(id)) || (dr.email && x.names.includes(dr.email))).map((x) => feedbackOf(x.r))
      .sort((a, b) => b.created.localeCompare(a.created));
    // The client record: linked from the agreement (or the workspace's Current Agreement), else the same name.
    const linked = [...new Set(dr.agreements.flatMap((a) => a.wsIds))].map((id) => wsById.get(id)).find(Boolean)
      ?? ws.find((w) => ids(w.fields[WF.agreement]).some((id) => dr.agreements.some((a) => a.id === id)) || ids(w.fields[WF.contracts]).some((id) => dr.agreements.some((a) => a.id === id)));
    const keys = [...dr.keys].filter((k) => k.length >= 4);
    const named = linked ? undefined : ws.filter((w) => keys.includes(companyKey(s(w.fields[WF.name])))).sort((a, b) => Number(s(b.fields[WF.status]) === 'Active') - Number(s(a.fields[WF.status]) === 'Active'))[0];
    const wsRec = linked ?? named;
    const client = wsRec ? clientOf(wsRec) : null;
    const signedAt = lead?.state === 'signed' ? lead.signedAt || lead.sentAt || lead.created : s(f[SF.closedDate]);
    const signedDay = signedAt ? dayOf(signedAt) : '';
    const paidInvoices = client ? invoices.filter((v) => v.client === client.id && isPaidInvoice(v) && (!signedDay || dayOf(v.date) >= nyDay(dayMs(signedDay) - 45 * DAY))) : [];
    const cash = n(f[SF.cash]) ?? 0;
    const fromDay = signedDay ? nyDay(dayMs(signedDay) - 45 * DAY) : '';
    const xeroPaid = ctx.xero && (lead?.state === 'signed' || yes(f[SF.closed])) ? xeroMatches(ctx.xero, { name: s(f[SF.contact]) || lead?.signer || '', company: s(f[SF.company]) || lead?.company || '', client, agreements: dr.agreements }, fromDay) : [];
    const clientPaid = (!!client && (client.paid || paidInvoices.length > 0)) || xeroPaid.length > 0;
    const onboarded = !!client && (client.formDone || client.onboardingLinked);
    const paidDay = paidInvoices.length ? dayOf(paidInvoices.map((v) => v.date).sort()[0]) : xeroPaid.length ? xeroPaid[0].day : client?.paid ? signedDay : cash > 0 ? signedDay : '';
    const feedbackStatus = fb[0]?.status ?? '';
    const stages = stagesOf({
      airtableStage: s(f[SF.stage]), callDate: s(f[SF.callDate]), heldDate: s(f[SF.heldDate]), heldFlag: yes(f[SF.held]), offerMade: yes(f[SF.offerMade]),
      dealClosed: yes(f[SF.closed]), cash, feedbackStatus, agreement: lead, clientPaid, onboarded,
    });
    const stage = furthest(stages);
    const lost = !stages.signed && (LOST_STAGES.has(s(f[SF.stage])) || /unqualified/i.test(feedbackStatus) || (!!lead && ['declined', 'expired'].includes(lead.state)));
    const inactiveClient = !!client && client.status === 'Inactive' && stages.signed;
    const reviews = ctx.reports.filter((r) => r.kind === 'call_review' && reportMatches(r.title, { name, company, agreements: dr.agreements }));
    const callDate = s(f[SF.callDate]);
    const prep = ctx.reports.filter((r) => r.kind === 'call_prep' && reportMatches(r.title, { name, company, agreements: dr.agreements }))
      .filter((r) => !callDate || dayOf(r.created) <= callDate).sort((a, b) => b.created.localeCompare(a.created))[0] ?? null;
    const closeLead = dr.agreements.map((a) => a.closeLead).find(Boolean) ?? '';
    const startDay = callDate || dayOf(lead?.sentAt || lead?.created || first?.created || '') || dayOf(s(f[SF.created]));
    const deal: Deal = {
      id: dr.rec?.id ?? (lead ?? first)!.id, salesRec: dr.rec?.id ?? '', name, company, email: dr.email, source: s(f[SF.source]), rep: names(f[SF.rep])[0] ?? '',
      campaign: names(f[SF.campaign])[0] ?? '', airtableStage: s(f[SF.stage]), lossReason: s(f[SF.lossReason]), notes: s(f[SF.notes]).slice(0, 2000),
      callDate, heldDate: s(f[SF.heldDate]), bookedAt: s(f[SF.created]) || dr.rec?.createdTime || '', startDay,
      stages, stage, lost, inactiveClient, agreements: [...dr.agreements].sort((a, b) => (b.sentAt || b.created).localeCompare(a.sentAt || a.created)), agreement: lead, signedDay,
      client, clientMatch: linked ? 'link' : named ? 'name' : null, paidKnown: !!client || xeroPaid.length > 0,
      paidVia: client?.paid ? 'Initial Payment Received' : paidInvoices.length ? `${plural(paidInvoices.length, 'paid invoice')}` : xeroPaid.length ? `Xero: ${xeroPaid[0].contact} ${xeroPaid[0].kind === 'invoice' ? 'invoice paid' : 'payment received'} ${shortDay(xeroPaid[0].day)}` : cash > 0 ? 'Total Cash Collected' : '',
      onboardingStarted: onboarded || dr.agreements.some((a) => !!a.forwardedAt), feedback: fb, reviews, prep, emailRecs,
      needs: [], closeUrl: closeLead ? `https://app.close.com/lead/${closeLead}/` : '', closeLead, paidDay, agreementRoles: agreementRoles(dr.agreements, lead),
      money: {
        monthly: lead?.monthly ?? null, perCall: lead?.perCall ?? null, forecast: n(f[SF.forecast]), offer: n(f[SF.offer]), cash: n(f[SF.cash]), currency: lead?.currency ?? 'USD',
        paidTotal: paidInvoices.length ? paidInvoices.reduce((a, v) => a + (v.amount ?? 0), 0) : xeroPaid.length ? xeroPaid.reduce((a, v) => a + (v.amount ?? 0), 0) : null,
      },
    };
    deal.needs = needsFor(deal, today);
    return deal;
  });
}

/**
 * What needs action on one deal, most urgent first. today = YYYY-MM-DD in New York. Pure.
 *   Cole: calls today / tomorrow, no outcome logged, a contract not signed after 2+ days, no-shows to re-book.
 *   Alex: the client signed and Dulcy's signature is missing; a contract drafted and not sent.
 *   Ledger: signed and no payment recorded. Atlas: paid and onboarding not started.
 */
export function needsFor(d: Pick<Deal, 'callDate' | 'heldDate' | 'airtableStage' | 'stages' | 'lost' | 'inactiveClient' | 'agreement' | 'agreements' | 'feedback' | 'prep' | 'client' | 'paidKnown' | 'onboardingStarted' | 'signedDay'>, today: string): ActionLine[] {
  const L = SALES_LIMITS;
  const out: ActionLine[] = [];
  const st = d.airtableStage;
  const tomorrow = nyDay(dayMs(today) + DAY);
  const canceled = st === 'Canceled';
  const fbNoShow = /no show/i.test(d.feedback[0]?.status ?? '');
  if (d.inactiveClient) return [];
  if (!d.lost && !canceled && !d.stages.signed && d.callDate === today) out.push({ kind: 'call_today', owner: 'Cole', text: d.prep ? 'Call today · Cole\'s prep is ready.' : 'Call today · no prep from Cole yet.', ...(d.prep ? { link: `report/${d.prep.id}` } : {}) });
  if (!d.lost && !canceled && !d.stages.signed && d.callDate === tomorrow) out.push({ kind: 'call_tomorrow', owner: 'Cole', text: d.prep ? 'Call tomorrow · Cole\'s prep is ready.' : 'Call tomorrow · no prep from Cole yet.', ...(d.prep ? { link: `report/${d.prep.id}` } : {}) });
  const ago = d.callDate ? daysBetween(d.callDate, today) : -1;
  const recentCall = ago >= 1 && ago <= L.callDays;
  if (recentCall && !d.stages.sent && !d.lost) {
    if ((st === 'No Show' || st === 'Reschedule' || (fbNoShow && !d.stages.showed))) {
      out.push({ kind: 'rebook', owner: 'Cole', text: `${st === 'Reschedule' ? 'Asked to reschedule' : 'No-show'} on ${shortDay(d.callDate)}: re-book the call.` });
    } else if (!d.stages.showed && (st === 'Audit Call Scheduled' || st === '')) {
      out.push({ kind: 'no_outcome', owner: 'Cole', text: `Call was ${shortDay(d.callDate)}: no outcome logged (Sales Data still says "${st || 'no stage'}").` });
    } else if (st === 'Call Done' && !d.stages.qualified && !d.feedback.length && ago >= L.noNextStepDays) {
      out.push({ kind: 'no_outcome', owner: 'Cole', text: `Call done ${shortDay(d.heldDate || d.callDate)}: no next step logged (no offer, contract or feedback).` });
    }
  }
  const a = d.agreement;
  if (a && !d.stages.signed) {
    const sentDay = dayOf(a.sentAt);
    const age = sentDay ? daysBetween(sentDay, today) : -1;
    if (a.clientSignedAt && a.state !== 'signed') out.push({ kind: 'sign', owner: 'Alex', text: `${a.signer || 'The client'} signed ${shortDay(a.clientSignedAt)}: your signature is missing (${a.tool}).` });
    else if ((a.state === 'sent' || a.state === 'viewed') && age >= L.unsignedDays && age <= L.contractDays) {
      out.push({ kind: 'unsigned', owner: 'Cole', text: `Contract sent ${shortDay(a.sentAt)}, not signed after ${plural(age, 'day')}${a.viewedAt ? ` (viewed ${shortDay(a.viewedAt)})` : ' (not opened)'}: follow up.` });
    } else if (a.state === 'draft' && age < 0 && daysBetween(dayOf(a.created) || today, today) <= L.contractDays) {
      out.push({ kind: 'draft', owner: 'Alex', text: `Contract drafted ${shortDay(a.created)}${a.review ? ` (${a.review})` : ''}, not sent yet.` });
    }
  }
  if (d.stages.signed && !d.stages.paid && d.signedDay && daysBetween(d.signedDay, today) <= L.contractDays) {
    out.push({ kind: 'unpaid', owner: 'Ledger', text: d.paidKnown ? `Signed ${shortDay(d.signedDay)}: no payment recorded in Airtable.` : `Signed ${shortDay(d.signedDay)}: no client record, so payment is UNKNOWN.` });
  }
  if (d.stages.paid && !d.stages.onboarded && !d.onboardingStarted) out.push({ kind: 'onboard', owner: 'Atlas', text: 'Paid: onboarding not started (no onboarding form, no client tasks).' });
  return out.sort((x, y) => ACTION_ORDER.indexOf(x.kind) - ACTION_ORDER.indexOf(y.kind));
}

// ---------- the views ----------
export interface ReviewLite { id: number; score: number | null; temperature: string; verdict: string; nextStep: string; created: string; link: string }
export interface DealLite {
  id: string; name: string; company: string; stage: StageKey; stageLabel: string; airtableStage: string; callDate: string; lost: boolean; signedDay: string;
  agreementState: AgreementState | null; client: string; needs: ActionLine[]; monthly?: number | null;
  /** The latest call review (Cole, from Fathom) and Cole's one line for the next step. */
  review: ReviewLite | null; coleNext: string;
}
export const latestReview = (d: Pick<Deal, 'reviews'>): ReviewLite | null => {
  const r = [...d.reviews].sort((a, b) => b.created.localeCompare(a.created))[0];
  return r ? { id: r.id, score: r.score, temperature: r.temperature ?? '', verdict: r.verdict ?? r.summary, nextStep: r.nextStep ?? '', created: r.created, link: r.link } : null;
};
export const lite = (d: Deal, today = nyDay(Date.now())): DealLite => ({
  id: d.id, name: d.name, company: d.company, stage: d.stage, stageLabel: STAGE_LABEL[d.stage], airtableStage: d.airtableStage, callDate: d.callDate, lost: d.lost,
  signedDay: d.signedDay, agreementState: d.agreement?.state ?? null, client: d.client?.name ?? '', needs: d.needs, ...(d.money ? { monthly: d.money.monthly } : {}),
  review: latestReview(d), coleNext: coleNext(d, today),
});

/**
 * Cole's one line for the next step on a deal, from the stage, the contract and the latest call review.
 * Rules (Closers.io: one clear next step after every call; follow up an open contract fast). Pure.
 */
export function coleNext(d: Pick<Deal, 'stages' | 'lost' | 'inactiveClient' | 'agreement' | 'callDate' | 'airtableStage' | 'reviews' | 'feedback' | 'signedDay' | 'onboardingStarted'>, today: string): string {
  const r = latestReview(d);
  const said = r?.nextStep && !/^(none|n\/?a|-)?$/i.test(r.nextStep.trim()) ? r.nextStep.trim().replace(/\.$/, '') : '';
  const a = d.agreement;
  if (d.inactiveClient) return '';
  if (d.lost) return r?.temperature === 'warm' ? 'Lost for now: add to the 90-day nurture, then check in.' : '';
  if (d.stages.paid && !d.stages.onboarded && !d.onboardingStarted) return 'Paid: Atlas starts onboarding (form and kickoff call).';
  if (d.stages.signed && !d.stages.paid) return `Signed ${shortDay(d.signedDay)}: Ledger confirms the first payment (Commas / Xero).`;
  if (d.stages.signed) return '';
  if (a?.clientSignedAt && a.state !== 'signed') return 'The client signed: countersign in Dulcy Sign today.';
  if (a && (a.state === 'sent' || a.state === 'viewed')) {
    const age = a.sentAt ? daysBetween(dayOf(a.sentAt), today) : 0;
    return a.state === 'viewed'
      ? `They opened the contract${a.viewedAt ? ` ${shortDay(a.viewedAt)}` : ''}: call and ask what is left to decide${said ? ` (agreed: ${said})` : ''}.`
      : `Contract sent ${age} day${age === 1 ? '' : 's'} ago, not opened: send a short nudge with the link.`;
  }
  if (a && a.state === 'draft') return 'A draft is waiting: review it and send it from Dulcy Sign.';
  if (d.airtableStage === 'No Show' || /no show/i.test(d.feedback[0]?.status ?? '')) return 'No-show: send two new times today.';
  if (d.airtableStage === 'Reschedule') return 'Asked to reschedule: send two new times today.';
  if (r?.temperature === 'hot' && d.stages.showed) return `Hot call: draft the contract now${said ? ` (agreed: ${said})` : ''}.`;
  if (said && d.stages.showed) return `Do what was agreed: ${said}.`;
  if (d.callDate && d.callDate >= today && !d.stages.showed) return d.callDate === today ? 'Call today: read the replies and the prep first.' : `Call ${shortDay(d.callDate)}: confirm it the day before.`;
  if (d.stages.qualified) return 'Qualified, no contract yet: send the proposal or book the follow-up.';
  if (d.stages.showed) return 'Call done, no next step logged: send the recap and one clear next step.';
  if (d.callDate && d.callDate < today) return 'Log what happened on the call (Close stage).';
  return '';
}

export interface Rate { n: number; of: number; text: string; pct: number | null }
/** "3 of 5 showed" plus the percent (one decimal; null when there is nothing to divide by). Round 4: percentages are the headline. Pure. */
export const pctOf = (k: number, of: number): number | null => (of ? Math.round((k / of) * 1000) / 10 : null);
export const rate = (k: number, of: number, word: string): Rate => ({ n: k, of, text: `${k} of ${of} ${word}`, pct: pctOf(k, of) });
export interface Conversion { from: string; to: string; n: number; of: number; pct: number | null }
/** Stage to stage: of the deals that reached a stage, how many reached the next one. Pure. */
export function conversions(steps: { label: string; count: number }[]): Conversion[] {
  return steps.slice(1).map((s, i) => ({ from: steps[i].label, to: s.label, n: s.count, of: steps[i].count, pct: pctOf(s.count, steps[i].count) }));
}

/** The pipeline for the last `days` days (by the call date, else the agreement date). Pure. */
export function pipelineOf(deals: Deal[], days: number, today: string) {
  const from = nyDay(dayMs(today) - days * DAY);
  const inWin = deals.filter((d) => d.startDay && d.startDay >= from && d.startDay <= nyDay(dayMs(today) + 60 * DAY));
  const stages = STAGE_KEYS.map((k) => ({
    key: k, label: STAGE_LABEL[k], count: inWin.filter((d) => d.stages[k]).length,
    deals: inWin.filter((d) => d.stage === k).sort((a, b) => (b.callDate || b.startDay).localeCompare(a.callDate || a.startDay)).map((d) => lite(d, today)),
  }));
  // Show rate: calls whose date has passed, canceled ones left out (they never were a call).
  const held = inWin.filter((d) => d.salesRec && d.callDate && d.callDate < today && d.airtableStage !== 'Canceled');
  const showed = held.filter((d) => d.stages.showed);
  const signed = showed.filter((d) => d.stages.signed);
  return {
    days, from, deals: inWin.length,
    stages,
    // Round 4 (Alex 2026-11-28: "where's the percentages?"): stage to stage, and booked → signed overall.
    conversions: conversions(stages.map((x) => ({ label: STAGE_LABEL[x.key], count: x.count }))),
    overall: rate(stages.find((x) => x.key === 'signed')?.count ?? 0, stages[0]?.count ?? 0, 'booked calls signed'),
    canceled: inWin.filter((d) => d.airtableStage === 'Canceled').length,
    upcoming: inWin.filter((d) => d.callDate && d.callDate >= today && !d.stages.showed).length,
    showRate: rate(showed.length, held.length, 'showed'),
    qualifiedRate: rate(showed.filter((d) => d.stages.qualified).length, showed.length, 'qualified'),
    closeRate: rate(signed.length, showed.length, 'signed'),
  };
}

const monthOf = (day: string) => day.slice(0, 7);
const prevMonth = (m: string) => { const [y, mo] = m.split('-').map(Number); return mo === 1 ? `${y - 1}-12` : `${y}-${String(mo - 1).padStart(2, '0')}`; };
const monthName = (m: string) => new Date(`${m}-15T12:00:00Z`).toLocaleDateString('en-US', { timeZone: 'UTC', month: 'long' });
/** Booked, showed, closed and new MRR, this month vs last month (New York). Money only with canSeeMoney. Pure. */
export function topNumbers(deals: Deal[], today: string, canSeeMoney: boolean) {
  const now = monthOf(today), last = prevMonth(now);
  const calc = (m: string) => {
    const booked = deals.filter((d) => d.salesRec && monthOf(d.callDate) === m);
    // Rates (Round 4): show rate = of the month's calls already past (canceled left out), how many showed;
    // close rate = of those that showed, how many signed (any day). Same rules as the pipeline.
    const held = booked.filter((d) => d.callDate < today && d.airtableStage !== 'Canceled');
    const heldShowed = held.filter((d) => d.stages.showed);
    const closed = deals.filter((d) => d.stages.signed && monthOf(d.signedDay) === m);
    const mrr = closed.reduce((a, d) => a + (d.money?.monthly ?? 0), 0);
    const unknown = closed.filter((d) => d.money?.monthly == null).length;
    return {
      month: m, label: monthName(m), booked: booked.length, showed: booked.filter((d) => d.stages.showed && monthOf(d.heldDate || d.callDate) === m).length, closed: closed.length,
      showRate: rate(heldShowed.length, held.length, 'showed'), closeRate: rate(heldShowed.filter((d) => d.stages.signed).length, heldShowed.length, 'signed'),
      ...(canSeeMoney ? { mrr, mrrUnknown: unknown } : {}),
    };
  };
  return { thisMonth: calc(now), lastMonth: calc(last) };
}

/** Round 5: one "Have <agent> fix it" task per agent named in the fix (Fix it queues it on that agent's list; nothing changes until Alex approves). */
export interface NoteAction { agent: 'Cole' | 'Atlas' | 'Ledger' | 'Riley'; title: string; detail: string }
export interface Note { problem: string; data: string; fix: string; why: string; owner: Owner | 'Riley'; actions?: NoteAction[] }
const FIX_AGENTS = ['Cole', 'Atlas', 'Ledger', 'Riley'] as const;
/**
 * The agent tasks for a data note: the fix text names who does what ("Ledger: tick … Riley: make …");
 * each agent gets its own part. Alex's parts get no button (he does them himself). Pure.
 */
export function noteActions(n: Pick<Note, 'problem' | 'data' | 'fix' | 'why' | 'owner'>): NoteAction[] {
  const parts = [...n.fix.matchAll(/(?:^|[.;]\s+|\s)(Cole|Atlas|Ledger|Riley|Alex):\s+(.+?)(?=(?:\s(?:Cole|Atlas|Ledger|Riley|Alex):\s)|$)/g)].map((m) => ({ agent: m[1], text: m[2].trim() }));
  const mine = parts.filter((p): p is { agent: NoteAction['agent']; text: string } => (FIX_AGENTS as readonly string[]).includes(p.agent));
  const list = mine.length ? mine : (FIX_AGENTS as readonly string[]).includes(n.owner) ? [{ agent: n.owner as NoteAction['agent'], text: n.fix }] : [];
  const many = new Set(list.map((p) => p.agent)).size > 1;
  return list.map((p) => ({
    agent: p.agent,
    title: `Sales data: ${n.problem}${many ? ` (${p.agent}'s part)` : ''}`.slice(0, 200),
    detail: [`Data: ${n.data}`, `Your part: ${p.text}`, `Why: ${n.why}`,
      "Approval rules apply: prepare the change and wait for Alex's ✅ in HQ before changing Close, Airtable or Dulcy Sign. Nothing is sent to anyone."].join('\n').slice(0, 2000),
  }));
}
/** Real data problems (Problem → Data → Fix → Why). Read only: HQ never fixes them. Pure. */
export function salesNotes(deals: Deal[], src: Pick<SalesSource, 'sales' | 'feedback'>, today: string): Note[] {
  const out: Note[] = [];
  const L = SALES_LIMITS;
  const label = (d: Deal) => d.name + (d.company && !/^https?:/i.test(d.company) ? ` (${d.company})` : '');
  const fbLinked = deals.flatMap((d) => d.feedback.map((f) => ({ d, f })));
  const noStatus = fbLinked.filter((x) => !x.f.status);
  if (noStatus.length) out.push({ problem: `Call Feedback ${noStatus.length === 1 ? 'row' : 'rows'} with no Call Status`, data: few(noStatus.map((x) => `${label(x.d)} · ${shortDay(x.f.created)}`)), fix: 'Cole: set Qualified, Unqualified, No Show or New Date in Call Feedback.', why: 'Without a status the call counts as neither shown nor qualified.', owner: 'Cole' });
  const clash = deals.filter((d) => /no show/i.test(d.feedback[0]?.status ?? '') && (HELD_STAGES.has(d.airtableStage) || !!d.heldDate));
  if (clash.length) out.push({ problem: 'Call Feedback says No Show, Sales Data says the call happened', data: few(clash.map((d) => `${label(d)}: feedback "No Show" · Sales Data "${d.airtableStage}"${d.heldDate ? `, held ${shortDay(d.heldDate)}` : ''}`)), fix: 'Cole: check the recording and correct one of the two.', why: 'The show rate counts it as shown; the feedback says otherwise.', owner: 'Cole' });
  const ticked = deals.filter((d) => NOT_HELD_STAGES.has(d.airtableStage) && (d.heldDate || src.sales.some((r) => r.id === d.salesRec && yes(r.fields[SF.held]))) && !d.stages.sent);
  if (ticked.length) out.push({ problem: `Sales Data says ${ticked.length === 1 ? 'No Show / Canceled but the call is' : 'No Show / Canceled but the calls are'} ticked as held`, data: few(ticked.map((d) => `${label(d)}: "${d.airtableStage}" · Call Held? ticked`)), fix: 'Cole: check the recording; untick Call Held? or fix the stage in Close.', why: 'HQ trusts the stage (not shown); Sales Goals counts it as held.', owner: 'Cole' });
  const noClient = deals.filter((d) => d.stages.signed && !d.client);
  if (noClient.length) out.push({ problem: `Signed ${noClient.length === 1 ? 'deal' : 'deals'} with no client record`, data: few(noClient.map((d) => `${label(d)}, signed ${shortDay(d.signedDay)}`)), fix: 'Atlas: link the agreement to its Workspace IDs record (or create the client).', why: 'Payment and onboarding are read from the client record, so they show as UNKNOWN.', owner: 'Atlas' });
  const byName = deals.filter((d) => d.stages.signed && d.clientMatch === 'name');
  if (byName.length) out.push({ problem: 'Signed agreements not linked to their client', data: few(byName.map((d) => `${label(d)} → "${d.client?.name}" (matched by name)`)), fix: 'Atlas: set Workspace IDs on the agreement in New Client Intake.', why: 'HQ found the client by name; a link makes payment and onboarding certain.', owner: 'Atlas' });
  const stale = deals.filter((d) => d.salesRec && d.callDate && daysBetween(d.callDate, today) > L.callDays && !d.stages.showed && ['Audit Call Scheduled', ''].includes(d.airtableStage));
  if (stale.length) out.push({ problem: `Old calls still "Audit Call Scheduled"`, data: few(stale.map((d) => `${label(d)} · ${shortDay(d.callDate)}`)), fix: 'Cole: set the real outcome in Close (the stage syncs to Sales Data).', why: `They are older than ${L.callDays} days, so they are left out of Needs action but still count as booked.`, owner: 'Cole' });
  const behind = deals.filter((d) => d.salesRec && d.stages.sent && !['Contract Sent', 'Won'].includes(d.airtableStage) && !d.inactiveClient);
  if (behind.length) out.push({ problem: 'Sales Data stage behind the contract', data: few(behind.map((d) => `${label(d)}: "${d.airtableStage || 'no stage'}" · contract ${d.agreement?.state ?? ''}`)), fix: 'Cole: move the opportunity in Close (Make copies it to Sales Data).', why: 'Close and the Sales Center show the deal earlier than it really is.', owner: 'Cole' });
  const noRow = deals.filter((d) => !d.salesRec && d.agreement && ['sent', 'viewed', 'signed'].includes(d.agreement.state) && daysBetween(dayOf(d.agreement.sentAt || d.agreement.created), today) <= 120);
  if (noRow.length) out.push({ problem: `${noRow.length === 1 ? 'Agreement' : 'Agreements'} with no Sales Data row`, data: few(noRow.map((d) => `${label(d)} · ${d.agreement!.state}`)), fix: 'Riley: check Make "1.0 Booked Meeting" and the Close → Sales Data sync for these leads.', why: 'The booked call is missing, so the show and close rates leave these deals out.', owner: 'Riley' });
  const oldUnsigned = deals.filter((d) => d.agreement && ['sent', 'viewed'].includes(d.agreement.state) && !d.stages.signed && daysBetween(dayOf(d.agreement.sentAt), today) > L.contractDays);
  if (oldUnsigned.length) out.push({ problem: `Contracts sent ${L.contractDays}+ days ago, still open`, data: few(oldUnsigned.map((d) => `${label(d)} · sent ${shortDay(d.agreement!.sentAt)}`)), fix: 'Cole: mark the deal Lost in Close, or Alex voids the agreement.', why: 'They sit in "Contract sent" and make the pipeline look bigger than it is.', owner: 'Cole' });
  // Paid in Xero but not in Airtable (Brilliant / MJJ, Alex 2026-11-27): the n8n payment flow
  // ("Fanbasis Transaction Successful") matches the client by the buyer's name / email; when the
  // name on the payment is not the Workspace IDs name, nothing is ticked and no invoice row is written.
  const xeroOnly = deals.filter((d) => d.stages.signed && d.client && !d.client.paid && /^Xero:/.test(d.paidVia));
  if (xeroOnly.length) out.push({ problem: `Paid in Xero, "not paid" in Airtable`, data: few(xeroOnly.map((d) => `${label(d)} → "${d.client!.name}": ${d.paidVia}; Initial Payment Received unticked, no Client Invoices row`)), fix: 'Ledger: tick Initial Payment Received on the client record. Riley: make the n8n "Fanbasis Transaction Successful" flow match this payer (its name or email is not the client\'s name), so the next payment lands.', why: 'Clients, To-do and the old Sales Center read the Airtable tick, so they say "not paid". HQ Sales now also checks Xero.', owner: 'Ledger' });
  // Onboarding form in, checkbox unticked: nothing live ticks Onboarding_form_submitted (Make 2.3 is off,
  // the n8n 2.3 flow does not map it). HQ counts the linked Onboarding record instead.
  const formBox = deals.filter((d) => d.stages.signed && d.client && d.client.onboardingLinked && !d.client.formDone);
  if (formBox.length) out.push({ problem: 'Onboarding form submitted, checkbox unticked', data: few(formBox.map((d) => `${label(d)} → "${d.client!.name}": Onboarding record linked, Onboarding_form_submitted unticked`)), fix: 'Riley: add "Onboarding_form_submitted = true" to the n8n "2.3 POSTCALL Onboarding Form Complete" update (the old Make scenario that ticked it is off). Atlas: tick it for these clients.', why: 'Screens that read the checkbox show the form as not done. HQ Sales counts the linked record.', owner: 'Riley' });
  const dupes = deals.filter((d) => d.agreementRoles.filter((r) => !r.primary).length >= 2);
  if (dupes.length) out.push({ problem: 'One deal, several agreement records', data: few(dupes.map((d) => `${label(d)}: ${d.agreements.length} records (${[...new Set(d.agreementRoles.filter((r) => !r.primary).map((r) => r.why))].join('; ')})`)), fix: 'Atlas: void the old ones or mark them Test Only in Dulcy Sign / New Client Intake (nothing goes to the client).', why: 'HQ shows the current agreement and folds the others with the reason.', owner: 'Atlas' });
  const signedDeals = deals.filter((d) => d.salesRec && d.stages.signed);
  const won = src.sales.filter((r) => s(r.fields[SF.stage]) === 'Won' || yes(r.fields[SF.closed]) || s(r.fields[SF.closedDate]));
  if (signedDeals.length && !won.length) out.push({ problem: 'No Sales Data row is marked Won', data: `${signedDeals.length} signed · 0 of ${src.sales.length} Sales Data rows have Won, Deal Closed? or Deal Closed Date`, fix: 'Cole: move signed deals to Won in Close; the Close → Airtable Won sync then marks their Sales Data rows Won.', why: 'Sales Goals (close rate, revenue to goal) read those fields, so they show 0 closed. HQ counts signed agreements instead.', owner: 'Cole' });
  return out.map((x) => ({ ...x, actions: noteActions(x) }));
}

/** Cut money for anyone but the owner: no money keys, and no amounts in any text. Pure. */
export function cutMoney<T>(x: T): T {
  const MONEY_KEYS = new Set(['money', 'monthly', 'mrr', 'mrrUnknown', 'perCall', 'forecast', 'offer', 'cash', 'paidTotal']);
  const scrub = (t: string) => t.replace(/[$£€]\s?\d[\d,]*(?:\.\d+)?(?:[kK]\b)?(?:\s*\/\s*(?:month|mo|call)\b)?/g, '[amount hidden]');
  const walk = (v: any): any => {
    if (typeof v === 'string') return scrub(v);
    if (Array.isArray(v)) return v.map(walk);
    if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).filter(([k]) => !MONEY_KEYS.has(k)).map(([k, y]) => [k, walk(y)]));
    return v;
  };
  return walk(x);
}

// ---------- reading (batched, cached 60 seconds) ----------
const S_READ = Object.values(SF), I_READ = Object.values(IF), C_READ = Object.values(CF), F_READ = Object.values(FF), W_READ = Object.values(WF), V_READ = Object.values(VF);
export async function readSalesSource(at: Pick<HqAirtable, 'list'>): Promise<SalesSource> {
  const [sales, intake, contracts, feedback, ws, invoices] = await Promise.all([
    at.list(SALES_T, '', S_READ, 3000),
    at.list(INTAKE_T, '', I_READ, 2000),
    at.list(CONTRACTS_T, '', C_READ, 2000),
    // Feedback and payments: the last 400 days (older rows cannot change today's pipeline).
    at.list(FEEDBACK_T, `IS_AFTER(CREATED_TIME(), DATEADD(TODAY(), -400, 'days'))`, F_READ, 3000),
    at.list(WORKSPACES_T, `{Name}!=''`, W_READ, 1000),
    at.list(INVOICES_T, `IS_AFTER({Date}, DATEADD(TODAY(), -400, 'days'))`, V_READ, 3000),
  ]);
  return { sales, intake, contracts, feedback, ws, invoices, readAt: new Date().toISOString() };
}
let cache: { at: number; data: Promise<SalesSource> } | null = null;
export function _resetSalesCache() { cache = null; }
/** The cached source (60 seconds); refresh=true re-reads if the copy is older than 10 seconds. */
export function cachedSales(at: Pick<HqAirtable, 'list'>, refresh = false, now = Date.now()): Promise<SalesSource> {
  if (cache && now - cache.at < (refresh ? 10_000 : SALES_CACHE_MS)) return cache.data;
  const data = readSalesSource(at);
  cache = { at: now, data };
  data.catch(() => { if (cache?.data === data) cache = null; });
  return data;
}
/** Cole's call reviews and preps (hq_reports), newest first. */
export async function coleReports(db: Db): Promise<ColeReport[]> {
  // Round 5: the meeting title and Cole's call type come from cole_reviews (same recording, dedupe key cole:<id>).
  const r = await db.query(`SELECT r.id, r.kind, r.title, r.summary, r.link, r.data, r.created_at, c.title AS meeting_title, c.review->'classify'->>'call_type' AS call_type
    FROM hq_reports r LEFT JOIN cole_reviews c ON r.dedupe_key = 'cole:' || c.recording_id
    WHERE r.agent='Cole' AND r.kind IN ('call_review','call_prep') ORDER BY r.id DESC LIMIT 300`);
  const text = (v: unknown, max: number) => (typeof v === 'string' ? v.slice(0, max) : '');
  return r.rows.map((x) => ({
    meetingTitle: text(x.data?.meetingTitle, 200) || text(x.meeting_title, 200), callType: text(x.data?.callType, 30) || text(x.call_type, 30),
    about: text(x.data?.about, 240), meetingAt: text(x.data?.meetingAt, 40),
    id: Number(x.id), kind: x.kind, title: x.title, summary: x.summary, link: httpsOnly(String(x.link ?? '')),
    score: x.data?.score !== undefined && x.data?.score !== null && Number.isFinite(Number(x.data.score)) ? Number(x.data.score) : null, created: new Date(x.created_at).toISOString(),
    temperature: typeof x.data?.temperature === 'string' ? x.data.temperature : '', nextStep: typeof x.data?.nextStep === 'string' ? x.data.nextStep.slice(0, 300) : '',
    verdict: typeof x.data?.verdict === 'string' ? x.data.verdict.slice(0, 300) : '',
  }));
}

/** Optional read-only extras: Xero payments (null = Xero not connected). */
export interface SalesExtras { xero?: () => Promise<XeroPayment[] | null> }
export async function allDeals(at: Pick<HqAirtable, 'list'>, db: Db, refresh: boolean, now: number, extras: SalesExtras = {}) {
  const [src, reports, xero] = await Promise.all([cachedSales(at, refresh, now), coleReports(db), extras.xero ? extras.xero().catch(() => null) : Promise.resolve(null)]);
  return { src, deals: buildDeals(src, { now, reports, xero }), xeroConnected: xero !== null };
}

/** GET /sales: top numbers, needs action, the pipeline (30 or 90 days) and data notes. */
export async function salesView(at: Pick<HqAirtable, 'list'>, db: Db, canSeeMoney: boolean, opts: { days?: number; refresh?: boolean; now?: number; extras?: SalesExtras } = {}) {
  const now = opts.now ?? Date.now();
  const today = nyDay(now);
  const { src, deals, xeroConnected } = await allDeals(at, db, opts.refresh === true, now, opts.extras);
  const days = opts.days === 90 ? 90 : 30;
  const action = deals.filter((d) => d.needs.length).sort((a, b) => ACTION_ORDER.indexOf(a.needs[0].kind) - ACTION_ORDER.indexOf(b.needs[0].kind) || (a.callDate || a.startDay).localeCompare(b.callDate || b.startDay));
  const view = {
    today, top: topNumbers(deals, today, canSeeMoney), action: action.map((d) => lite(d, today)), pipeline: pipelineOf(deals, days, today),
    notes: salesNotes(deals, src, today), counts: { action: action.length, deals: deals.length }, readAt: src.readAt,
    limits: SALES_LIMITS, xeroConnected,
  };
  return canSeeMoney ? view : cutMoney(view);
}

/** GET /sales/:id (a Sales Data, New Client Intake or Contracts record id). No Airtable links, no client tasks. */
export async function dealDetail(at: Pick<HqAirtable, 'list'>, db: Db, id: string, canSeeMoney: boolean, opts: { now?: number; extras?: SalesExtras } = {}) {
  const now = opts.now ?? Date.now();
  const today = nyDay(now);
  const { src, deals } = await allDeals(at, db, false, now, opts.extras);
  const deal = deals.find((d) => d.id === id || d.salesRec === id || d.agreements.some((a) => a.id === id));
  if (!deal) return null;
  const a = deal.agreement;
  const onboarding = [
    { step: 'Agreement signed', done: deal.stages.signed, note: deal.signedDay ? `${shortDay(deal.signedDay)}${a ? ` · ${a.tool}` : ''}` : a ? `${a.tool}: ${a.state}` : 'No agreement yet' },
    { step: 'Payment received', done: deal.stages.paid, note: deal.stages.paid ? deal.paidVia : !deal.stages.signed ? 'Not signed yet' : deal.paidKnown ? 'Nothing recorded (Initial Payment Received, Client Invoices, Xero)' : 'UNKNOWN: no client record' },
    { step: 'Onboarding started', done: deal.onboardingStarted, note: a?.forwardedAt ? `n8n started it ${shortDay(a.forwardedAt)}` : deal.client ? `Client record "${deal.client.name}"` : '' },
    { step: 'Onboarding form', done: deal.stages.onboarded, note: deal.client?.formDone ? 'Submitted' : deal.client?.onboardingLinked ? 'Submitted (Onboarding record linked; the checkbox is not ticked)' : 'Not submitted' },
  ];
  // Round 5: each call named by its type, one line on what it was about, the Fathom link when known.
  const calls = dealCalls(deal, today).map((c) => ({ ...c, what: [c.name, c.status].filter(Boolean).join(' · ') }));
  const roles = new Map(deal.agreementRoles.map((r) => [r.id, r]));
  const out = {
    deal: {
      ...deal, stageLabel: STAGE_LABEL[deal.stage], stageList: STAGE_KEYS.map((k) => ({ key: k, label: STAGE_LABEL[k], done: deal.stages[k] })),
      // Current agreement first, then the folded ones with the reason.
      agreements: [...deal.agreements].sort((x, y) => Number(roles.get(y.id)?.primary ?? false) - Number(roles.get(x.id)?.primary ?? false)).map((g) => ({ ...g, primary: roles.get(g.id)?.primary ?? false, why: roles.get(g.id)?.why ?? '' })),
      review: latestReview(deal), coleNext: coleNext(deal, today),
    },
    calls, onboarding,
    links: {
      close: deal.closeUrl,
      // Dulcy Sign only (SignWell / PandaDoc are retired): the manage page and the review document.
      agreements: deal.agreements.filter((x) => x.tool === 'Dulcy Sign').map((x) => ({ id: x.id, tool: x.tool, title: x.title, state: x.state, url: x.url, reviewDoc: x.reviewDoc })),
    },
    notes: salesNotes([deal], src, today),
    readAt: src.readAt,
    // Round 3: what Cole changed (or would change) in Close after each call review, old → new.
    closeUpdates: await closeUpdatesFor(db, deal).catch(() => []),
  };
  return canSeeMoney ? out : cutMoney(out);
}

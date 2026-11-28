// HQ Clients. One list of every client led by its health against the promised KPI, results from
// EmailBison, money (owner only) and one short insight; one page per client. Read only.
//   - Workspaces that are the same client count once ("Twenty West Media" + "Twenty West Media
//     (Internal)"): the active record leads, results add up. "Dulcy" (EmailBison workspace 2) and
//     "Dulcy Free Campaigns" (workspace 41: free campaigns for prospects, e.g. Chop Shop) are two
//     separate clients and are never merged (Alex 2026-11-28, RULES.md; merging them was an old mistake).
//   - Results (emails sent, replies, interested, meetings) come from Airtable's "Email Analytics
//     Overview" (EmailBison, synced every night, windows 10/30/60/120 days and all time). The
//     Emails table missed most bookings: they are marked WON / Booked Meeting with no booking date
//     (Twenty West showed 0 booked in 30 days; EmailBison says 11).
//   - Deals, MRR and LTV: see clientDeals.ts. Owner money (Xero, P/L sheet): finance.ts.
//   - Money (fees, LTV, invoices, deal values, ROI) is removed server-side for members, not hidden.
//   - Airtable reads are cached for 5 minutes (one cache for everyone; money is cut per request).
import type { Db } from '../db/pool.js';
import type { AirtableRecord } from '../providers/airtable.js';
import { OWNER_ONLY } from './agents.js';
import { campaignBounce, campaignProgress, campaignsOf, clientFrom, readHealthRows, type Client, type HealthRows } from '../agents/atlas.js';
import { EF, EMAILS, RA, val } from '../agents/emailsFields.js';
import { sameName } from '../agents/ledgerPrep.js';
import { ACTIVITY, AF } from '../activity.js';
import { hasPlan, type PlanRef } from './generators.js';
import { pendingDecisions, type DecisionCard, type HqAirtable } from './decisions.js';
import { agentTasks } from './team.js';
import {
  DEAL_LABEL, HEALTH_LABEL, NO_FIXED_KPI, SHEET_ALIASES, WINDOWS, agencyNumbers, customRanges, dealFor, healthOf, kpiNumber, ltvOf, monthsBetween, resultsFor,
  type BookClient, type Deal, type DealLine, type DealType, type Health, type Insight, type OverviewRow, type Period, type Results, type Window,
} from './clientDeals.js';
import { billingByClient, financesView, readFinance, type Finance, type FinanceDeps } from './finance.js';

export const CACHE_MS = 5 * 60_000;
/** Bounce over 2.5% = watch, over 4% = pause (RULES.md); 60%+ sent = plan the next campaign. */
export const CAMPAIGN_HEALTH_LIMITS = { watch: 2.5, pause: 4, next: 0.6 } as const;
/** Extra Workspace IDs fields the Clients screen needs on top of Atlas's. */
const WS_EXTRA = ['Outstanding Receivables', 'Client Health Reasons', 'Client Start Date', 'Client End Date', 'Inactive Reason', 'Client', 'Billing Rate', 'Calls Booked KPI (from Onboarding)', 'Onboarding'];
/** Airtable "Email Analytics Overview": one row per client and window (EmailBison numbers). */
export const OVERVIEW = 'tblZkEi6qylqfOj9Z';
const OVERVIEW_FIELDS = ['Date Period', 'Client ID', 'Emails Sent', 'Unique Replies', 'Interested', 'Meetings Booked', 'Updated At', 'Total Leads Contacted'];
/** Airtable "Call Feedback" (the client's verdict per booked call) and "Client Closed Deals". */
export const CALL_FEEDBACK = 'tbljJ0uWryVMuilXn';
export const CF = { status: 'fldXNEJcG9LUnR73H', stars: 'fld1KGADNp3pX2mLi', notes: 'fldZXCeH23P9azJqb', bison: 'fldiZYJuFW6Sa4wN5', created: 'fldKRdKwzeOHvYM7n', newDate: 'fldsgmVQKkbAoTvsE' } as const;
export const CLOSED_DEALS = 'tblObFlCC7BrdaruO';
export const CD = { lead: 'fldOiKKVLzBQ5UPMj', value: 'fldlDCUqZHM4lci6A', date: 'fldpzEEcRXaLPbatb', type: 'fldC4MEYuOALLMasQ', why: 'fld8azgjeA3IqTuwa', emails: 'flde9Y79JLlFxKdEv' } as const;
/** Airtable "Onboarding": only these answers ever leave the server (never logins, passwords or 2FA). */
export const ONBOARDING = 'tbljhM1JmUwr99tu4';
export const ONBOARDING_FIELDS: { id: string; label: string; owner?: boolean }[] = [
  { id: 'fldXzgvvLUGoErYsi', label: 'Submitted' },
  { id: 'fldaC92hnYYPogUvw', label: 'Filled in by' },
  { id: 'fldgvimk1wMZjiqdW', label: 'Takes the sales calls' },
  { id: 'fld1AjmO7gSRAZTnw', label: 'What they sell' },
  { id: 'fldt14pabzQ15V55U', label: 'Target market' },
  { id: 'fldW9QJs393tLxwxh', label: 'Job titles' },
  { id: 'fldoM5rgmkctQWxmS', label: 'Locations' },
  { id: 'fldF4sn3RBUjgvuy3', label: 'Dream clients' },
  { id: 'flds20AzmmjGKmU22', label: 'Appointments wanted per month' },
  { id: 'fldAPVf9KrBGa1vTv', label: 'Appointments booked per month now' },
  { id: 'fldwswWg39Y34CcnG', label: 'Guarantee' },
  { id: 'fldTSO9lkDq3wTnMX', label: 'Time to results' },
  { id: 'fldje1pp7U1qllFd1', label: 'Why clients choose them' },
  { id: 'fldh6D7in0eg9LJgI', label: 'What success looks like' },
  { id: 'fldfM1fSpVYD3EGVM', label: 'CRM' },
  { id: 'fldhVMoa5gJ4fBhfB', label: 'Their pricing', owner: true },
  { id: 'fldKCtXxGgpSdXb2D', label: 'Their monthly revenue now', owner: true },
  { id: 'fldliuriQs0FrR2yT', label: 'Revenue they want', owner: true },
];

export type Light = 'red' | 'yellow' | 'green' | 'inactive';
const LIGHT: Record<Health, Light> = { safe: 'green', at_risk: 'yellow', attention: 'red', unknown: 'yellow', inactive: 'inactive' };
const RANK: Record<Health, number> = { attention: 0, at_risk: 1, unknown: 2, safe: 3, inactive: 4 };

const s = (x: unknown): string => val(x);
const n = (x: unknown): number | undefined => { const t = val(x); const v = Number(t); return t !== '' && Number.isFinite(v) ? v : undefined; };
const usd = (x: number) => `$${Math.round(x).toLocaleString('en-US')}`;
const pct = (x: number) => `${Number.isInteger(x) ? x : x.toFixed(1)}%`;
const ids = (x: unknown): string[] => (Array.isArray(x) ? x : x ? [x] : []).map((v: any) => (typeof v === 'string' ? v : v?.id ?? '')).filter(Boolean);

/**
 * Which workspaces are one client: a "Client" link to another Workspace IDs record wins; otherwise
 * the name without "(…)" and a trailing "Internal" / "Trial". "Free Campaigns" is NOT stripped:
 * "Dulcy Free Campaigns" is its own client (key "dulcyfreecampaigns"), never Dulcy (Alex 2026-11-28). Pure.
 */
export function clientKey(name: string): string {
  return String(name ?? '').toLowerCase().replace(/^client:\s*/, '').replace(/\([^)]*\)/g, ' ').replace(/\b(internal|trial)\s*$/g, ' ').replace(/[^a-z0-9]+/g, '');
}
/** A free-campaigns workspace ("Dulcy Free Campaigns", EmailBison 41): its own client, never folded into another (Alex 2026-11-28). Pure. */
export const isFreeCampaigns = (name: string) => /\bfree campaigns?\b/i.test(String(name ?? ''));
const isActive = (w: AirtableRecord) => s(w.fields.Status) === 'Active';
const isInternal = (type: string) => /internal|free|trial/i.test(type);
/** The label of a client Dulcy does not bill: Dulcy itself, or its free campaigns for prospects. Pure. */
export const internalLabel = (name: string) => (isFreeCampaigns(name) ? 'Free campaigns' : 'Dulcy itself');

/** Group Workspace IDs records into clients; the main record first (active, then paying, then the shortest name). Pure. */
export function groupWorkspaces(ws: AirtableRecord[]): AirtableRecord[][] {
  const byId = new Map(ws.map((w) => [w.id, w]));
  const keyOf = (w: AirtableRecord): string => {
    // A Client link between a free-campaigns workspace and another one is not followed: they stay two clients.
    const link = (Array.isArray(w.fields.Client) ? w.fields.Client : []).map((x: any) => (typeof x === 'string' ? x : x?.id))
      .find((id: string) => id && id !== w.id && byId.has(id) && isFreeCampaigns(s(w.fields.Name)) === isFreeCampaigns(s(byId.get(id)!.fields.Name)));
    return link ? clientKey(s(byId.get(link)!.fields.Name)) : clientKey(s(w.fields.Name));
  };
  const groups = new Map<string, AirtableRecord[]>();
  for (const w of ws) { if (!s(w.fields.Name)) continue; const k = keyOf(w) || w.id; groups.set(k, [...(groups.get(k) ?? []), w]); }
  return [...groups.values()].map((g) => [...g].sort((a, b) => Number(isActive(b)) - Number(isActive(a))
    || Number(/paying/i.test(s(b.fields['Client Type']))) - Number(/paying/i.test(s(a.fields['Client Type'])))
    || s(a.fields.Name).length - s(b.fields.Name).length));
}

export interface ClientCampaign { id: string; name: string; progress: number; bounce: number; sent: number; interested: number; perThousand: number | null; flag: 'pause' | 'watch' | null; next: boolean; planExists: boolean }
/** Owner only. */
export interface ClientMoney {
  /** Monthly retainer (all retainer lines added up); 0 for pay per call only. */
  fee: number | null; perCall: number | null; dealType: DealType; dealLines: DealLine[]; dealSource: string;
  ltv: number | null; ltvSource: 'deal' | 'recorded' | null; ltvNote: string;
  /** Xero revenue Airtable matched to this client (Actual Lifetime Revenue). */
  recorded: number | null;
  /** Open invoices: coming up (not due yet) or late. */
  receivables: number | null; invoices: { amount: number; due: string; late: boolean }[]; invoicesSource: string;
  months: number | null;
  /** One short line when Airtable disagrees with the deal (for Atlas to fix). */
  feeNote: string;
}
export interface ClientRow {
  id: string; key: string; name: string; workspaces: { id: string; name: string; status: string; bisonId: string }[];
  active: boolean; internal: boolean; type: string; typeSource: string; startDate: string; endDate: string; inactiveReason: string;
  health: Health; healthLabel: string; light: Light; insight: Insight | null; pace: number | null;
  kpi: number | null; kpiSource: string; meetings30: number;
  /** Results for the chosen window (EmailBison); null when Airtable has no row for this client. */
  results: Results | null;
  dealType: DealType; dealLabel: string;
  interested7: number; interestedPrev7: number; interested30: number; booked7: number; bookedPrev7: number; booked30: number;
  waitingApproval: number; seanWaiting: number; campaigns: ClientCampaign[];
  /** Kept for older screens: the insight's problem line. */
  note: string[];
  money?: ClientMoney;
}

export interface ClientsSource extends HealthRows { waiting: AirtableRecord[]; decisions: DecisionCard[]; plans: PlanRef[]; overview: OverviewRow[]; feedback: AirtableRecord[]; readAt: string }

/** Every row needed, from Airtable and the engine DB. */
export async function readClientsSource(at: HqAirtable, db: Db): Promise<ClientsSource> {
  const [rows, waiting, decisions, plans, overview, feedback] = await Promise.all([
    readHealthRows(at, { inactive: true, wsFields: WS_EXTRA }),
    at.list(EMAILS, `{Dulcy Reply Agent State}='Needs Approval'`, [RA.state, EF.workspace, RA.clients, RA.wsRecord], 3000),
    pendingDecisions(at).catch(() => [] as DecisionCard[]),
    db.query(`SELECT trigger_key, ws_rec, state, created_at FROM campaign_plans`).then((r) => r.rows.map((x) => ({ ...x, created_at: new Date(x.created_at).toISOString() })) as PlanRef[]),
    at.list(OVERVIEW, `{Client ID}!=''`, OVERVIEW_FIELDS, 1000, { byName: true }).catch(() => [] as AirtableRecord[]),
    at.list(CALL_FEEDBACK, `{Call Status}!=''`, Object.values(CF), 3000).catch(() => [] as AirtableRecord[]),
  ]);
  // The formulas above already filter; filtered again here so a copy of the rows can never widen them.
  return {
    ...rows, campaigns: rows.campaigns.filter((c) => s(c.fields['Campaign Status']) === 'Active'),
    waiting: waiting.filter((r) => s(r.fields[RA.state]) === 'Needs Approval'), decisions, plans, readAt: new Date().toISOString(),
    overview: overview.map((r) => ({ period: s(r.fields['Date Period']), clientId: s(r.fields['Client ID']), sent: n(r.fields['Emails Sent']) ?? 0, replies: n(r.fields['Unique Replies']) ?? 0, interested: n(r.fields.Interested) ?? 0, meetings: n(r.fields['Meetings Booked']) ?? 0, updatedAt: s(r.fields['Updated At']), contacted: n(r.fields['Total Leads Contacted']) })).filter((r) => r.clientId),
    feedback,
  };
}

let cache: { at: number; data: Promise<ClientsSource> } | null = null;
export function _resetClientsCache() { cache = null; activityCache.clear(); }
/** The cached source (5 minutes). refresh=true re-reads if the copy is older than 30 seconds. */
export function cachedSource(at: HqAirtable, db: Db, refresh = false, now = Date.now()): Promise<ClientsSource> {
  if (cache && now - cache.at < (refresh ? 30_000 : CACHE_MS)) return cache.data;
  const data = readClientsSource(at, db);
  cache = { at: now, data };
  data.catch(() => { if (cache?.data === data) cache = null; });
  return data;
}

/** The 1-2 line note (older screens). Pure. */
export function noteFor(c: Pick<ClientRow, 'active' | 'campaigns' | 'waitingApproval' | 'seanWaiting' | 'interested30' | 'booked30' | 'interested7' | 'kpi' | 'internal'>): string[] {
  if (!c.active) return [];
  const out: string[] = [];
  const pause = [...c.campaigns].filter((x) => x.flag === 'pause').sort((a, b) => b.bounce - a.bounce);
  if (pause.length) out.push(`Bounce ${pct(pause[0].bounce)} on ${pause[0].name}${pause.length > 1 ? ` (+${pause.length - 1} more over 4%)` : ''}: pause and check.`);
  if (c.waitingApproval) out.push(`${c.waitingApproval} repl${c.waitingApproval === 1 ? 'y' : 'ies'} waiting for approval.`);
  else if (c.seanWaiting) out.push(`${c.seanWaiting} Echo decision${c.seanWaiting === 1 ? '' : 's'} waiting.`);
  if (!c.campaigns.length) out.push('No active campaign.');
  const next = c.campaigns.filter((x) => x.next && !x.planExists);
  if (next.length) out.push(`${next[0].name} is at ${Math.round(next[0].progress * 100)}%: plan the next campaign.`);
  if (c.interested30 >= 10 && c.booked30 / c.interested30 < 0.2) out.push(`${c.interested30} interested / ${c.booked30} booked in 30 days.`);
  else if (c.kpi && c.booked30 < c.kpi) out.push(`${c.booked30} of ${c.kpi} booked calls (KPI) in 30 days.`);
  if (!out.length) out.push(`${c.interested30} interested / ${c.booked30} booked in 30 days.`);
  return [...new Set(out)].slice(0, 2);
}

const replyWs = (r: AirtableRecord): { rec: string; bison: string } => {
  const link = r.fields[RA.clients];
  const rec = Array.isArray(link) ? String(typeof link[0] === 'string' ? link[0] : (link[0] as any)?.id ?? '') : '';
  return { rec: rec || s(r.fields[RA.wsRecord]), bison: s(r.fields[EF.workspace]) };
};

/** The client's promised meetings KPI: the client's own field, then its onboarding answer, then the internal one. Pure. */
export function kpiOf(group: AirtableRecord[]): { kpi: number | null; source: string } {
  const pick = (k: string) => group.map((w) => kpiNumber(w.fields[k])).find((x) => x !== null) ?? null;
  const c = pick('Calls Booked KPI (Client)'); if (c) return { kpi: c, source: 'client KPI (Airtable)' };
  const o = pick('Calls Booked KPI (from Onboarding)'); if (o) return { kpi: o, source: 'onboarding form' };
  const i = pick('Calls Booked KPI (Internal)'); if (i) return { kpi: i, source: 'internal KPI (Airtable)' };
  return { kpi: null, source: 'UNKNOWN' };
}

export interface BuildOpts { window?: Window; finance?: Finance | null }
interface Built { row: ClientRow; book: BookClient | null }

/** Build every client from the source. canSeeMoney=false: no money keys at all. Pure (now passed in). */
export function buildAll(src: ClientsSource, canSeeMoney: boolean, now = new Date(), opts: BuildOpts = {}): Built[] {
  const { pause, watch, next } = CAMPAIGN_HEALTH_LIMITS;
  const w: Window = opts.window ?? '30';
  const groups = groupWorkspaces(src.ws);
  const names = (g: AirtableRecord[]) => { const ns = g.map((x) => s(x.fields.Name).replace(/\s*\(internal\)\s*$/i, '').trim()); return ns.reduce((a, b) => (b.length < a.length ? b : a), ns[0]); };
  const keys = groups.map((g) => clientKey(names(g)));
  // P/L sheet billing lines (owner only: the finance read only happens for the owner).
  const sheetLines = canSeeMoney && opts.finance?.sheet ? billingByClient(opts.finance.sheet.billing, keys, clientKey, SHEET_ALIASES).matched : null;
  return groups.map((group): Built => {
    const main = group[0]; const f = main.fields;
    const wsIds = group.map((x) => x.id);
    const bisons = group.map((x) => s(x.fields.ID)).filter(Boolean);
    const c: Client = clientFrom(group, src, now);
    const active = group.some(isActive);
    const name = names(group); const key = clientKey(name);
    const airtableType = group.map((x) => s(x.fields['Client Type'])).find(Boolean) ?? '';
    const internal = isInternal(s(f['Client Type']) || airtableType);
    const campaigns: ClientCampaign[] = campaignsOf(wsIds, src.campaigns).map((x): ClientCampaign => {
      const sent = n(x.fields['Emails Sent']) ?? 0, interested = n(x.fields.Interested) ?? 0, bounce = campaignBounce(x), progress = campaignProgress(x);
      return {
        id: x.id, name: s(x.fields.Name) || 'Campaign', progress, bounce, sent, interested, perThousand: sent >= 100 ? Math.round((interested / sent) * 10_000) / 10 : null,
        flag: bounce > pause ? 'pause' : bounce > watch ? 'watch' : null, next: progress >= next && progress < 1, planExists: wsIds.some((id) => hasPlan({ id: x.id, client: id }, src.plans, now)),
      };
    }).sort((a, b) => b.bounce - a.bounce || b.progress - a.progress);
    const waitingApproval = src.waiting.filter((r) => { const x = replyWs(r); return wsIds.includes(x.rec) || (x.bison !== '' && bisons.includes(x.bison)); }).length;
    const nameKeys = new Set([key, ...group.map((x) => clientKey(s(x.fields.Name)))]);
    const seanWaiting = src.decisions.filter((d) => d.agent === 'Echo' && nameKeys.has(clientKey(d.client))).length;

    // Results (EmailBison) and health against the promised KPI.
    const results = resultsFor(src.overview, bisons, w, now);
    const r30 = w === '30' ? results : resultsFor(src.overview, bisons, '30', now);
    const meetings30 = r30 ? Math.max(r30.meetings, c.booked30) : c.booked30;
    const maxMode = !!NO_FIXED_KPI[key];
    const kpiFound = kpiOf(group);
    const kpi = maxMode ? null : kpiFound.kpi;
    const kpiSource = maxMode ? NO_FIXED_KPI[key] : kpiFound.source;
    const r60 = resultsFor(src.overview, bisons, '60', now);
    const prevMeetings30 = r60 && r30 ? Math.max(0, r60.meetings - r30.meetings) : null;
    const startDate = group.map((x) => s(x.fields['Client Start Date'])).filter(Boolean).sort()[0] ?? '';

    // Deal: P/L sheet > contracts on file > Airtable.
    const fees = group.map((x) => n(x.fields['Monthly Fee']) ?? 0);
    const deal: Deal = dealFor({
      key, sheetLines: sheetLines?.get(key) ?? null, airtableFee: fees.find((x) => x > 0), airtableRate: group.map((x) => n(x.fields['Billing Rate']) ?? 0).find((x) => x > 0),
      startDate, endDate: active ? '' : s(f['Client End Date']),
    });
    const paying = !internal && (/paying/i.test(airtableType) || deal.type !== 'unknown');
    const type = airtableType || (paying ? 'Paying Client' : '');
    const typeSource = airtableType ? 'Airtable' : type ? `filled from the ${deal.source}` : 'UNKNOWN';
    const start = deal.startDate || startDate;
    const hl = healthOf({ active, kpi, meetings30, interested30: r30?.interested ?? c.interested30, sent30: r30 ? r30.sent : null, activeCampaigns: campaigns.length, startDate: start, maxMode, prevMeetings30 }, now);

    const row: ClientRow = {
      id: main.id, key, name, workspaces: group.map((x) => ({ id: x.id, name: s(x.fields.Name), status: s(x.fields.Status), bisonId: s(x.fields.ID) })),
      active, internal, type, typeSource, startDate: start, endDate: active ? '' : deal.endDate, inactiveReason: active ? '' : s(f['Inactive Reason']),
      health: hl.health, healthLabel: internal && hl.health === 'unknown' ? internalLabel(name) : HEALTH_LABEL[hl.health], light: LIGHT[hl.health], insight: hl.insight, pace: hl.pace,
      kpi, kpiSource, meetings30, results, dealType: internal ? 'unknown' : deal.type, dealLabel: internal ? internalLabel(name) : DEAL_LABEL[deal.type],
      interested7: c.interested7, interestedPrev7: c.interestedPrev7, interested30: c.interested30, booked7: c.booked7, bookedPrev7: c.bookedPrev7, booked30: c.booked30,
      waitingApproval, seanWaiting, campaigns, note: hl.insight ? [hl.insight.problem] : [],
    };

    // Money: built for the book (agency numbers) always, sent only to the owner.
    const sum = (k: string) => { const xs = group.map((x) => n(x.fields[k])).filter((x): x is number => x !== undefined); return xs.length ? xs.reduce((a, b) => a + b, 0) : null; };
    const recorded = sum('Actual Lifetime Revenue');
    const months = start ? monthsBetween(start, active ? now : (deal.endDate || now)) : null;
    const allMeetings = resultsFor(src.overview, bisons, 'all', now)?.meetings ?? null;
    let ltv = ltvOf(deal, active || deal.endDate ? months : null, allMeetings, recorded, sum('Estimated LTV'));
    if (!active && (recorded ?? 0) > (ltv.value ?? 0)) ltv = { value: Math.round(recorded!), source: 'recorded', note: 'Xero recorded revenue' };
    const book: BookClient | null = paying ? { key, name, active, start, end: active ? '' : deal.endDate, retainer: active ? deal.retainer : 0, ltv: ltv.value } : null;
    if (canSeeMoney && !internal) {
      const airtableFee = fees.reduce((a, b) => a + b, 0);
      const feeNote = deal.source !== 'UNKNOWN' && !deal.source.startsWith('Airtable') && active && Math.round(airtableFee) !== Math.round(deal.retainer)
        ? `Airtable Monthly Fee says ${airtableFee ? usd(airtableFee) : 'nothing'}; the deal is ${deal.retainer ? `${usd(deal.retainer)}/mo` : 'pay per call only'} (${deal.source}).` : '';
      const fin = opts.finance?.xero;
      const allNames = [name, ...group.map((x) => s(x.fields.Name))];
      const inv = fin ? fin.invoices.filter((i) => allNames.some((nm) => sameName(i.contact, nm))).map(({ amount, due, late }) => ({ amount, due, late })) : [];
      const airtableOpen = sum('Outstanding Receivables');
      row.money = {
        fee: deal.type === 'unknown' ? null : deal.retainer, perCall: deal.perCall || null, dealType: deal.type, dealLines: deal.lines, dealSource: deal.source,
        ltv: ltv.value, ltvSource: ltv.source, ltvNote: ltv.note, recorded,
        receivables: fin ? (inv.length ? inv.reduce((a, i) => a + i.amount, 0) : null) : airtableOpen || null,
        invoices: inv, invoicesSource: fin ? 'Xero open invoices' : airtableOpen ? 'Airtable (Xero sync): open invoices, coming up' : '',
        months, feeNote,
      };
    }
    return { row, book };
  }).sort((a, b) => RANK[a.row.health] - RANK[b.row.health] || Number(a.row.internal) - Number(b.row.internal) || a.row.name.localeCompare(b.row.name));
}
export function buildClients(src: ClientsSource, canSeeMoney: boolean, now = new Date(), opts: BuildOpts = {}): ClientRow[] {
  return buildAll(src, canSeeMoney, now, opts).map((b) => b.row);
}

export interface ClientsSummary { active: number; internal: number; inactive: number; attention: number; atRisk: number; safe: number; unknown: number; mrr?: number; readAt: string }
export function summarize(rows: ClientRow[], canSeeMoney: boolean, readAt: string): ClientsSummary {
  const paying = rows.filter((r) => r.active && !r.internal);
  const count = (h: Health) => paying.filter((r) => r.health === h).length;
  return {
    active: paying.length, internal: rows.filter((r) => r.active && r.internal).length, inactive: rows.filter((r) => !r.active).length, readAt,
    attention: count('attention'), atRisk: count('at_risk'), safe: count('safe'), unknown: count('unknown'),
    ...(canSeeMoney ? { mrr: paying.reduce((a, r) => a + (r.money?.fee ?? 0), 0) } : {}),
  };
}

export const parseWindow = (x: string | null | undefined): Window => ((WINDOWS as readonly string[]).includes(String(x)) ? String(x) as Window : '30');
const financeFor = (canSeeMoney: boolean, deps?: FinanceDeps, refresh = false) => (canSeeMoney && deps ? readFinance(deps, new Date(), refresh) : Promise.resolve(null));

/** GET /clients: active clients (and Dulcy itself); inactive ones only with all=true. */
export async function listClients(at: HqAirtable, db: Db, canSeeMoney: boolean, opts: { all?: boolean; refresh?: boolean; window?: Window; finance?: FinanceDeps } = {}) {
  const [src, finance] = await Promise.all([cachedSource(at, db, opts.refresh), financeFor(canSeeMoney, opts.finance, opts.refresh)]);
  const rows = buildClients(src, canSeeMoney, new Date(), { window: opts.window, finance });
  return { clients: rows.filter((r) => opts.all || r.active), summary: summarize(rows, canSeeMoney, src.readAt), window: opts.window ?? '30' };
}

/** GET /clients/numbers (owner only, checked in the route): agency numbers for a period. */
/** Round 4: period 'custom' takes from / to (both days included); a bad range answers 400. */
export async function clientNumbers(at: HqAirtable, db: Db, period: Period | 'custom', finance?: FinanceDeps, now = new Date(), custom?: { from?: string | null; to?: string | null }) {
  const ranges = period === 'custom' ? customRanges(custom?.from, custom?.to) : undefined;
  if (period === 'custom' && !ranges) throw Object.assign(new Error('pick a from and a to date (to on or after from, 3 years at most)'), { status: 400 });
  const [src, fin] = await Promise.all([cachedSource(at, db), financeFor(true, finance)]);
  const book = buildAll(src, true, now, { finance: fin }).map((b) => b.book).filter((b): b is BookClient => !!b);
  return { numbers: agencyNumbers(book, period, now, ranges ?? undefined), readAt: src.readAt };
}

/** Round 4: GET /finances (owner only, checked in the route): company money from Xero; Personal cards apart. */
export async function companyFinances(at: HqAirtable, db: Db, finance: FinanceDeps, refresh = false) {
  const [src, fin] = await Promise.all([cachedSource(at, db), readFinance(finance, new Date(), refresh)]);
  const rows = buildClients(src, true, new Date(), { finance: fin });
  return financesView(fin, summarize(rows, true, src.readAt).mrr ?? 0);
}

/** GET /clients/finance (owner only, checked in the route): Xero + P/L sheet money. */
export async function clientFinance(at: HqAirtable, db: Db, finance: FinanceDeps, refresh = false) {
  const [src, fin] = await Promise.all([cachedSource(at, db), readFinance(finance, new Date(), refresh)]);
  const rows = buildClients(src, true, new Date(), { finance: fin });
  const keys = rows.map((r) => r.key);
  const unmatched = fin.sheet ? billingByClient(fin.sheet.billing, keys, clientKey, SHEET_ALIASES).unmatched : [];
  const mrr = summarize(rows, true, src.readAt).mrr ?? 0;
  return {
    mrr, xero: fin.xero, cards: fin.sheet?.cards ?? null, cardTotals: fin.sheet?.cardTotals ?? null,
    billing: fin.sheet?.billing ?? null, notInAirtable: unmatched.map((l) => l.name), errors: fin.errors, readAt: fin.readAt,
  };
}

export interface ClientActivity { id: string; event: string; when: string; agent: string; type: string; details: string }
const activityCache = new Map<string, { at: number; rows: Promise<ClientActivity[]> }>();
const q = (t: string) => t.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
/** Activity Log rows linked to the client's workspaces (newest first), cached 5 minutes. */
export function clientActivity(at: HqAirtable, ws: ClientRow['workspaces'], limit = 15): Promise<ClientActivity[]> {
  const key = ws.map((w) => w.id).join(',');
  const hit = activityCache.get(key);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.rows;
  const wsIds = ws.map((w) => w.id);
  const formula = `OR(${ws.map((w) => `FIND('${q(w.name)}',ARRAYJOIN({Client}))`).join(',')})`;
  const rows = at.list(ACTIVITY, formula, [AF.event, AF.when, AF.agent, AF.type, AF.details, AF.client], 60, { sortField: AF.when, sortDesc: true })
    .then((rs) => rs.filter((r) => (Array.isArray(r.fields[AF.client]) ? (r.fields[AF.client] as unknown[]) : []).some((x: any) => wsIds.includes(typeof x === 'string' ? x : x?.id)))
      .sort((a, b) => s(b.fields[AF.when]).localeCompare(s(a.fields[AF.when]))).slice(0, limit)
      .map((r) => ({ id: r.id, event: s(r.fields[AF.event]), when: s(r.fields[AF.when]), agent: s(r.fields[AF.agent]), type: s(r.fields[AF.type]), details: s(r.fields[AF.details]).slice(0, 600) })));
  activityCache.set(key, { at: Date.now(), rows });
  rows.catch(() => activityCache.delete(key));
  return rows;
}

export interface CallFeedbackSummary { calls: number; qualified: number; unqualified: number; noShow: number; rated: number; avgStars: number | null; recent: { status: string; stars: number | null; notes: string; when: string }[] }
/** The client's call feedback (their verdict per booked call). Pure. */
export function feedbackFor(rows: AirtableRecord[], bisonIds: string[]): CallFeedbackSummary {
  const mine = rows.filter((r) => (Array.isArray(r.fields[CF.bison]) ? r.fields[CF.bison] as unknown[] : [r.fields[CF.bison]]).some((x) => bisonIds.includes(s(x))))
    .filter((r) => !/don't track/i.test(s(r.fields[CF.status])))
    .sort((a, b) => s(b.fields[CF.created]).localeCompare(s(a.fields[CF.created])));
  const st = (re: RegExp) => mine.filter((r) => re.test(s(r.fields[CF.status]))).length;
  const stars = mine.map((r) => n(r.fields[CF.stars])).filter((x): x is number => x !== undefined && x > 0);
  return {
    calls: mine.length, qualified: st(/^qualified/i), unqualified: st(/^unqualified/i), noShow: st(/no show/i), rated: stars.length,
    avgStars: stars.length ? Math.round((stars.reduce((a, b) => a + b, 0) / stars.length) * 10) / 10 : null,
    recent: mine.slice(0, 5).map((r) => ({ status: s(r.fields[CF.status]), stars: n(r.fields[CF.stars]) ?? null, notes: s(r.fields[CF.notes]).slice(0, 300), when: s(r.fields[CF.created]) })),
  };
}

/** Onboarding answers, whitelisted (members never get the money answers). Pure. */
export function onboardingOut(fields: Record<string, unknown> | null, canSeeMoney: boolean): { label: string; text: string }[] {
  if (!fields) return [];
  return ONBOARDING_FIELDS.filter((x) => canSeeMoney || !x.owner).map((x) => {
    const v = fields[x.id];
    const t = Array.isArray(v) ? v.map((y) => s(y)).filter(Boolean).join(', ') : s(v);
    return { label: x.label, text: x.id === 'fldXzgvvLUGoErYsi' ? t.slice(0, 10) : t.slice(0, 600) };
  }).filter((x) => x.text);
}

/** GET /clients/:id (any of the client's workspace record ids). */
export async function clientDetail(at: HqAirtable, db: Db, id: string, canSeeMoney: boolean, opts: { finance?: FinanceDeps; window?: Window } = {}) {
  const [src, finance] = await Promise.all([cachedSource(at, db), financeFor(canSeeMoney, opts.finance)]);
  const client = buildClients(src, canSeeMoney, new Date(), { finance, window: opts.window }).find((r) => r.workspaces.some((w) => w.id === id));
  if (!client) return null;
  const bisons = client.workspaces.map((w) => w.bisonId).filter(Boolean);
  const wsRecs = src.ws.filter((w) => client.workspaces.some((x) => x.id === w.id));
  const onboardingId = wsRecs.flatMap((w) => ids(w.fields.Onboarding))[0];
  const [activity, tasks, onboarding, deals] = await Promise.all([
    clientActivity(at, client.workspaces).catch(() => [] as ClientActivity[]),
    agentTasks(db).then((ts) => ts.filter((t) => t.client && clientKey(t.client) === client.key && (canSeeMoney || !OWNER_ONLY.includes(t.agent)))),
    onboardingId ? at.get(ONBOARDING, onboardingId, ONBOARDING_FIELDS.map((x) => x.id)).then((r) => r?.fields ?? null).catch(() => null) : Promise.resolve(null),
    closedDeals(at, bisons),
  ]);
  const decisions = src.decisions.filter((d) => clientKey(d.client) === client.key || client.workspaces.some((w) => clientKey(w.name) === clientKey(d.client)))
    .filter((d) => canSeeMoney || (d.pile !== 'Money' && !OWNER_ONLY.includes(d.agent)))
    .map((d) => ({ id: d.id, title: d.title, agent: d.agent, pile: d.pile, created: d.created }));
  const now = new Date();
  const windows = WINDOWS.map((w) => resultsFor(src.overview, bisons, w, now)).filter((x): x is Results => !!x);
  const dealValue = deals.reduce((a, d) => a + (d.value ?? 0), 0);
  const ltv = client.money?.ltv ?? null;
  const results = {
    windows,
    feedback: feedbackFor(src.feedback, bisons),
    deals: {
      count: deals.length,
      // Deal values and ROI are money: owner only.
      ...(canSeeMoney ? { total: dealValue, roi: ltv && dealValue ? Math.round((dealValue / ltv) * 10) / 10 : null, list: deals } : { list: deals.map(({ value: _v, ...rest }) => rest) }),
    },
    onboarding: { linked: !!onboardingId, answers: onboardingOut(onboarding, canSeeMoney) },
  };
  return { client, activity, tasks, decisions, results, readAt: src.readAt };
}

/** The client's closed deals (Airtable "Client Closed Deals", linked to Emails rows of its workspaces). */
async function closedDeals(at: HqAirtable, bisons: string[]): Promise<{ lead: string; value: number | null; date: string; type: string; why: string }[]> {
  const rows = await at.list(CLOSED_DEALS, `{Deal Closed Date}!=''`, Object.values(CD), 500).catch(() => [] as AirtableRecord[]);
  const emailIds = [...new Set(rows.flatMap((r) => ids(r.fields[CD.emails])))];
  if (!emailIds.length || !bisons.length) return [];
  const emails = await at.list(EMAILS, `OR(${emailIds.slice(0, 200).map((x) => `RECORD_ID()='${x}'`).join(',')})`, [EF.workspace], 500).catch(() => [] as AirtableRecord[]);
  const ok = new Set(emails.filter((e) => emailIds.includes(e.id) && bisons.includes(s(e.fields[EF.workspace]))).map((e) => e.id));
  return rows.filter((r) => ids(r.fields[CD.emails]).some((x) => ok.has(x)))
    .map((r) => ({ lead: s(r.fields[CD.lead]), value: n(r.fields[CD.value]) ?? null, date: s(r.fields[CD.date]), type: s(r.fields[CD.type]), why: s(r.fields[CD.why]).slice(0, 300) }))
    .sort((a, b) => b.date.localeCompare(a.date));
}

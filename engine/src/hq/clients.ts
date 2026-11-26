// HQ Step 2: Clients. One list of every client: results (email), health, money (owner only) and a
// note for today; one page per client. Read only. The numbers are Atlas's (same Airtable reads and
// the same grade() as the Monday health report), so HQ and Atlas never disagree.
//   - Workspaces that are the same client count once ("Twenty West Media" + "Twenty West Media
//     (Internal)", "Dulcy" + "Dulcy Free Campaigns"): the active record leads, results add up.
//   - Money (fee, LTV, receivables) is removed server-side for members, not just hidden.
//   - Airtable reads are cached for 5 minutes (one cache for everyone; money is cut per request).
import type { Db } from '../db/pool.js';
import type { AirtableRecord } from '../providers/airtable.js';
import { OWNER_ONLY } from './agents.js';
import {
  campaignBounce, campaignProgress, campaignsOf, clientFrom, grade, readHealthRows, type Client, type HealthRows,
} from '../agents/atlas.js';
import { EF, EMAILS, RA, val } from '../agents/emailsFields.js';
import { ACTIVITY, AF } from '../activity.js';
import { hasPlan, type PlanRef } from './generators.js';
import { pendingDecisions, type DecisionCard, type HqAirtable } from './decisions.js';
import { agentTasks } from './team.js';

export const CACHE_MS = 5 * 60_000;
/** Bounce over 2.5% = watch, over 4% = pause (RULES.md); 60%+ sent = plan the next campaign. */
export const CAMPAIGN_HEALTH_LIMITS = { watch: 2.5, pause: 4, next: 0.6 } as const;
/** Extra Workspace IDs fields the Clients screen needs on top of Atlas's. */
const WS_EXTRA = ['Outstanding Receivables', 'Client Health Reasons', 'Client Start Date', 'Client End Date', 'Inactive Reason', 'Client'];

export type Light = 'red' | 'yellow' | 'green' | 'inactive';
const LIGHT: Record<string, Light> = { '🔴': 'red', '🟡': 'yellow', '🟢': 'green' };
const RANK: Record<Light, number> = { red: 0, yellow: 1, green: 2, inactive: 3 };

const s = (x: unknown): string => val(x);
const n = (x: unknown): number | undefined => { const t = val(x); const v = Number(t); return t !== '' && Number.isFinite(v) ? v : undefined; };
const usd = (x: number) => `$${Math.round(x).toLocaleString('en-US')}`;
const pct = (x: number) => `${Number.isInteger(x) ? x : x.toFixed(1)}%`;

/**
 * Which workspaces are one client: a "Client" link to another Workspace IDs record wins; otherwise
 * the name without "(…)" and a trailing "Internal" / "Free Campaigns" / "Trial". Pure.
 */
export function clientKey(name: string): string {
  return String(name ?? '').toLowerCase().replace(/^client:\s*/, '').replace(/\([^)]*\)/g, ' ').replace(/\b(internal|free campaigns?|trial)\s*$/g, ' ').replace(/[^a-z0-9]+/g, '');
}
const isActive = (w: AirtableRecord) => s(w.fields.Status) === 'Active';
const isInternal = (type: string) => /internal|free|trial/i.test(type);

/** Group Workspace IDs records into clients; the main record first (active, then paying, then the shortest name). Pure. */
export function groupWorkspaces(ws: AirtableRecord[]): AirtableRecord[][] {
  const byId = new Map(ws.map((w) => [w.id, w]));
  const keyOf = (w: AirtableRecord): string => {
    const link = (Array.isArray(w.fields.Client) ? w.fields.Client : []).map((x: any) => (typeof x === 'string' ? x : x?.id)).find((id: string) => id && id !== w.id && byId.has(id));
    return link ? clientKey(s(byId.get(link)!.fields.Name)) : clientKey(s(w.fields.Name));
  };
  const groups = new Map<string, AirtableRecord[]>();
  for (const w of ws) { if (!s(w.fields.Name)) continue; const k = keyOf(w) || w.id; groups.set(k, [...(groups.get(k) ?? []), w]); }
  return [...groups.values()].map((g) => [...g].sort((a, b) => Number(isActive(b)) - Number(isActive(a))
    || Number(/paying/i.test(s(b.fields['Client Type']))) - Number(/paying/i.test(s(a.fields['Client Type'])))
    || s(a.fields.Name).length - s(b.fields.Name).length));
}

export interface ClientCampaign { id: string; name: string; progress: number; bounce: number; sent: number; interested: number; perThousand: number | null; flag: 'pause' | 'watch' | null; next: boolean; planExists: boolean }
export interface ClientMoney { fee: number | null; feeNote: string; ltv: number | null; ltvSource: 'actual' | 'estimated' | null; receivables: number | null; months: number | null }
export interface ClientRow {
  id: string; key: string; name: string; workspaces: { id: string; name: string; status: string; bisonId: string }[];
  active: boolean; internal: boolean; type: string; startDate: string; endDate: string; inactiveReason: string;
  light: Light; reasons: string[]; airtableHealth: string; airtableReasons: string;
  interested7: number; interestedPrev7: number; interested30: number; booked7: number; bookedPrev7: number; booked30: number; kpi: number | null;
  waitingApproval: number; seanWaiting: number; campaigns: ClientCampaign[]; note: string[]; dataIssues: string[];
  money?: ClientMoney;
}

export interface ClientsSource extends HealthRows { waiting: AirtableRecord[]; decisions: DecisionCard[]; plans: PlanRef[]; readAt: string }

/** Every row needed, from Airtable and the engine DB. */
export async function readClientsSource(at: HqAirtable, db: Db): Promise<ClientsSource> {
  const [rows, waiting, decisions, plans] = await Promise.all([
    readHealthRows(at, { inactive: true, wsFields: WS_EXTRA }),
    at.list(EMAILS, `{Dulcy Reply Agent State}='Needs Approval'`, [RA.state, EF.workspace, RA.clients, RA.wsRecord], 3000),
    pendingDecisions(at).catch(() => [] as DecisionCard[]),
    db.query(`SELECT trigger_key, ws_rec, state, created_at FROM campaign_plans`).then((r) => r.rows.map((x) => ({ ...x, created_at: new Date(x.created_at).toISOString() })) as PlanRef[]),
  ]);
  // The formulas above already filter; filtered again here so a copy of the rows can never widen them.
  return {
    ...rows, campaigns: rows.campaigns.filter((c) => s(c.fields['Campaign Status']) === 'Active'),
    waiting: waiting.filter((r) => s(r.fields[RA.state]) === 'Needs Approval'), decisions, plans, readAt: new Date().toISOString(),
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

/** The 1-2 line note for today, most urgent first. Pure. */
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

/** Build every client from the source. canSeeMoney=false: no money keys at all. Pure (now passed in). */
export function buildClients(src: ClientsSource, canSeeMoney: boolean, now = new Date()): ClientRow[] {
  const { pause, watch, next } = CAMPAIGN_HEALTH_LIMITS;
  return groupWorkspaces(src.ws).map((group) => {
    const main = group[0]; const f = main.fields;
    const ids = group.map((w) => w.id);
    const bisons = group.map((w) => s(w.fields.ID)).filter(Boolean);
    const c: Client = clientFrom(group, src, now);
    const active = group.some(isActive);
    const type = group.map((w) => s(w.fields['Client Type'])).find(Boolean) ?? '';
    const internal = isInternal(s(f['Client Type']) || type);
    const names = group.map((w) => s(w.fields.Name).replace(/\s*\(internal\)\s*$/i, '').trim());
    const name = names.reduce((a, b) => (b.length < a.length ? b : a), names[0]);
    const campaigns: ClientCampaign[] = campaignsOf(ids, src.campaigns).map((x): ClientCampaign => {
      const sent = n(x.fields['Emails Sent']) ?? 0, interested = n(x.fields.Interested) ?? 0, bounce = campaignBounce(x), progress = campaignProgress(x);
      return {
        id: x.id, name: s(x.fields.Name) || 'Campaign', progress, bounce, sent, interested, perThousand: sent >= 100 ? Math.round((interested / sent) * 10_000) / 10 : null,
        flag: bounce > pause ? 'pause' : bounce > watch ? 'watch' : null, next: progress >= next && progress < 1, planExists: hasPlan({ id: x.id, client: main.id }, src.plans, now) || ids.some((id) => hasPlan({ id: x.id, client: id }, src.plans, now)),
      };
    }).sort((a, b) => b.bounce - a.bounce || b.progress - a.progress);
    const waitingApproval = src.waiting.filter((r) => { const w = replyWs(r); return ids.includes(w.rec) || (w.bison !== '' && bisons.includes(w.bison)); }).length;
    const keys = new Set([clientKey(name), ...group.map((w) => clientKey(s(w.fields.Name)))]);
    const seanWaiting = src.decisions.filter((d) => d.agent === 'Echo' && keys.has(clientKey(d.client))).length;
    let light: Light = 'inactive'; let reasons: string[] = [];
    if (active) {
      const g = grade(c);
      light = LIGHT[g.light] ?? 'yellow';
      reasons = g.reasons.filter((r) => !(internal && /monthly fee missing/i.test(r)));
      if (internal && light === 'yellow' && !reasons.length) light = 'green';
    }
    const dataIssues: string[] = [];
    if (active && !type) dataIssues.push('Client Type is empty in Airtable (its "Clients & LTV" page does not count this client as active).');
    const fee = n(f['Monthly Fee']) ?? undefined;
    const feeElsewhere = group.slice(1).find((w) => (n(w.fields['Monthly Fee']) ?? 0) > 0);
    let feeNote = '';
    if (!internal && active) {
      if (!fee && feeElsewhere) feeNote = `$0 on "${s(f.Name)}"; ${usd(n(feeElsewhere.fields['Monthly Fee'])!)} is on the ${s(feeElsewhere.fields.Status).toLowerCase() || 'other'} record "${s(feeElsewhere.fields.Name)}".`;
      else if (!fee) feeNote = 'Monthly Fee missing in Airtable (UNKNOWN).';
      if (feeNote) dataIssues.push(feeNote);
    }
    if (group.length > 1) dataIssues.push(`${group.length} workspaces for one client (${group.map((w) => `${s(w.fields.Name)}: ${s(w.fields.Status) || 'no status'}`).join(', ')}); counted once.`);
    const sum = (k: string) => { const xs = group.map((w) => n(w.fields[k])).filter((x): x is number => x !== undefined); return xs.length ? xs.reduce((a, b) => a + b, 0) : null; };
    const actual = sum('Actual Lifetime Revenue'); const est = sum('Estimated LTV');
    const row: ClientRow = {
      id: main.id, key: clientKey(name), name, workspaces: group.map((w) => ({ id: w.id, name: s(w.fields.Name), status: s(w.fields.Status), bisonId: s(w.fields.ID) })),
      active, internal, type, startDate: group.map((w) => s(w.fields['Client Start Date'])).filter(Boolean).sort()[0] ?? '', endDate: active ? '' : s(f['Client End Date']), inactiveReason: active ? '' : s(f['Inactive Reason']),
      light, reasons, airtableHealth: s(f['Client Health']), airtableReasons: s(f['Client Health Reasons']).slice(0, 2000),
      interested7: c.interested7, interestedPrev7: c.interestedPrev7, interested30: c.interested30, booked7: c.booked7, bookedPrev7: c.bookedPrev7, booked30: c.booked30, kpi: c.kpi ?? null,
      waitingApproval, seanWaiting, campaigns, note: [], dataIssues,
    };
    row.note = noteFor(row);
    if (canSeeMoney) {
      row.money = { fee: fee || (feeElsewhere ? n(feeElsewhere.fields['Monthly Fee'])! : fee ?? null), feeNote, ltv: actual ?? est, ltvSource: actual !== null ? 'actual' : est !== null ? 'estimated' : null, receivables: sum('Outstanding Receivables'), months: c.months ?? null };
    } else {
      // Members: no money anywhere, including reasons and Airtable notes that quote amounts.
      const noMoney = (t: string) => !/\$|\bfee\b|receivabl|ltv|revenue|invoice/i.test(t);
      row.reasons = row.reasons.filter(noMoney);
      row.dataIssues = row.dataIssues.filter(noMoney);
      row.airtableReasons = row.airtableReasons.split('\n').filter(noMoney).join('\n');
    }
    return row;
  }).sort((a, b) => RANK[a.light] - RANK[b.light] || Number(a.internal) - Number(b.internal) || a.name.localeCompare(b.name));
}

export interface ClientsSummary { active: number; internal: number; inactive: number; mrr?: number; readAt: string }
export function summarize(rows: ClientRow[], canSeeMoney: boolean, readAt: string): ClientsSummary {
  const paying = rows.filter((r) => r.active && !r.internal);
  return {
    active: paying.length, internal: rows.filter((r) => r.active && r.internal).length, inactive: rows.filter((r) => !r.active).length, readAt,
    ...(canSeeMoney ? { mrr: paying.reduce((a, r) => a + (r.money?.fee ?? 0), 0) } : {}),
  };
}

/** GET /clients: active clients (and Dulcy itself); inactive ones only with all=true. */
export async function listClients(at: HqAirtable, db: Db, canSeeMoney: boolean, opts: { all?: boolean; refresh?: boolean } = {}) {
  const src = await cachedSource(at, db, opts.refresh);
  const rows = buildClients(src, canSeeMoney);
  return { clients: rows.filter((r) => opts.all || r.active), summary: summarize(rows, canSeeMoney, src.readAt) };
}

export interface ClientActivity { id: string; event: string; when: string; agent: string; type: string; details: string }
const activityCache = new Map<string, { at: number; rows: Promise<ClientActivity[]> }>();
const q = (t: string) => t.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
/** Activity Log rows linked to the client's workspaces (newest first), cached 5 minutes. */
export function clientActivity(at: HqAirtable, ws: ClientRow['workspaces'], limit = 15): Promise<ClientActivity[]> {
  const key = ws.map((w) => w.id).join(',');
  const hit = activityCache.get(key);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.rows;
  const ids = ws.map((w) => w.id);
  const formula = `OR(${ws.map((w) => `FIND('${q(w.name)}',ARRAYJOIN({Client}))`).join(',')})`;
  const rows = at.list(ACTIVITY, formula, [AF.event, AF.when, AF.agent, AF.type, AF.details, AF.client], 60, { sortField: AF.when, sortDesc: true })
    .then((rs) => rs.filter((r) => (Array.isArray(r.fields[AF.client]) ? (r.fields[AF.client] as unknown[]) : []).some((x: any) => ids.includes(typeof x === 'string' ? x : x?.id)))
      .sort((a, b) => s(b.fields[AF.when]).localeCompare(s(a.fields[AF.when]))).slice(0, limit)
      .map((r) => ({ id: r.id, event: s(r.fields[AF.event]), when: s(r.fields[AF.when]), agent: s(r.fields[AF.agent]), type: s(r.fields[AF.type]), details: s(r.fields[AF.details]).slice(0, 600) })));
  activityCache.set(key, { at: Date.now(), rows });
  rows.catch(() => activityCache.delete(key));
  return rows;
}

/** GET /clients/:id (any of the client's workspace record ids). */
export async function clientDetail(at: HqAirtable, db: Db, id: string, canSeeMoney: boolean) {
  const src = await cachedSource(at, db);
  const client = buildClients(src, canSeeMoney).find((r) => r.workspaces.some((w) => w.id === id));
  if (!client) return null;
  const [activity, tasks] = await Promise.all([
    clientActivity(at, client.workspaces).catch(() => [] as ClientActivity[]),
    agentTasks(db).then((ts) => ts.filter((t) => t.client && clientKey(t.client) === client.key && (canSeeMoney || !OWNER_ONLY.includes(t.agent)))),
  ]);
  const decisions = src.decisions.filter((d) => clientKey(d.client) === client.key || client.workspaces.some((w) => clientKey(w.name) === clientKey(d.client)))
    .filter((d) => canSeeMoney || (d.pile !== 'Money' && !OWNER_ONLY.includes(d.agent)))
    .map((d) => ({ id: d.id, title: d.title, agent: d.agent, pile: d.pile, created: d.created }));
  return { client, activity, tasks, decisions, readAt: src.readAt };
}

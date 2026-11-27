// Atlas, Head of Client Success (Alex 2026-11-24/25): one weekly client health report in Slack,
// Monday morning. Read only: Atlas changes nothing. Numbers come from Airtable (Workspace IDs,
// Emails, Campaigns) and are plain code (exact, no AI guesses). Alex's measure: retention / LTV.
//   per client: retainer, months active, LTV, interested + booked (7 d vs the week before, 30 d vs
//   KPI), interested → booked rate (the Twenty West lesson), campaign health, and a 🟢/🟡/🔴 with reasons.
import type { Stage } from '../stages/index.js';
import { PermanentError } from '../errors.js';
import { createAirtableClient, type AirtableClient, type AirtableRecord } from '../providers/airtable.js';
import { createSlackClient } from '../providers/slack.js';
import { EMAILS } from './emailsFields.js';
import { saveReport, slackReports } from '../hq/reports.js';

const WORKSPACES = 'tblcjRBGJEWh5KgOt';
const CAMPAIGNS = 'tblAVAA6uBPaMj28P';
const ALEX = 'U070Z26377C';
const DAY = 86_400_000;
const INTERESTED = ['Interested', 'Meeting Request', 'Info Request', 'Information Request'];

const v = (x: unknown): string => (Array.isArray(x) ? v(x[0]) : x === undefined || x === null ? '' : typeof x === 'object' ? String((x as any).name ?? (x as any).id ?? '') : String(x)).trim();
const num = (x: unknown) => { const n = Number(v(x)); return Number.isFinite(n) && v(x) !== '' ? n : undefined; };
const usd = (x: number) => `$${Math.round(x).toLocaleString('en-US')}`;
const pct = (x: number) => `${Math.round(x * 100)}%`;

export interface Client {
  id: string; name: string; type: string; fee?: number; months?: number; ltv?: number; lifetimeRevenue?: number; kpi?: number; healthField: string;
  interested7: number; interestedPrev7: number; interested30: number; booked7: number; bookedPrev7: number; booked30: number;
  campaigns: { active: number; over4: number; watch: number; past60: number; ending: number };
}
export interface HealthData { now: Date; clients: Client[] }
export type Light = '🟢' | '🟡' | '🔴';

/** Health light and the reasons behind it. Pure. */
export function grade(c: Client): { light: Light; reasons: string[] } {
  const red: string[] = []; const yellow: string[] = [];
  if (c.campaigns.active === 0) red.push('no active campaign');
  if (c.kpi && c.booked30 < 0.5 * c.kpi) red.push(`booked ${c.booked30} in 30 days vs KPI ${c.kpi}`);
  else if (c.kpi && c.booked30 < c.kpi) yellow.push(`booked ${c.booked30} in 30 days vs KPI ${c.kpi}`);
  const conv = c.interested30 ? c.booked30 / c.interested30 : undefined;
  if (conv !== undefined && c.interested30 >= 20 && conv < 0.1) red.push(`only ${pct(conv)} of ${c.interested30} interested replies became meetings (inbox follow-up problem)`);
  else if (conv !== undefined && c.interested30 >= 10 && conv < 0.2) yellow.push(`${pct(conv)} of interested replies became meetings`);
  if (c.campaigns.over4) yellow.push(`${c.campaigns.over4} campaign${c.campaigns.over4 === 1 ? '' : 's'} over 4% bounce`);
  if (c.campaigns.active > 0 && c.campaigns.active === c.campaigns.ending) yellow.push('every campaign is almost done: plan the next one');
  else if (c.campaigns.past60) yellow.push(`${c.campaigns.past60} campaign${c.campaigns.past60 === 1 ? '' : 's'} past 60%: plan the next one`);
  if (c.interested7 === 0 && c.interestedPrev7 > 0) yellow.push('no interested replies this week');
  if (/risk/i.test(c.healthField)) yellow.push(`marked "${c.healthField}" in Airtable`);
  if (c.fee === undefined || c.fee === 0) yellow.push('monthly fee missing in Airtable (UNKNOWN)');
  return red.length ? { light: '🔴', reasons: [...red, ...yellow] } : yellow.length ? { light: '🟡', reasons: yellow } : { light: '🟢', reasons: [] };
}

const trend = (now: number, prev: number) => (now > prev ? `↑ from ${prev}` : now < prev ? `↓ from ${prev}` : 'same');

/** The Monday report (Slack mrkdwn). Pure, so it is tested with fixed data. */
export function writeHealth(d: HealthData): string {
  const paying = d.clients.filter((c) => /paying/i.test(c.type) || (c.fee ?? 0) > 0);
  const other = d.clients.filter((c) => !paying.includes(c));
  const fees = paying.map((c) => c.fee).filter((f): f is number => (f ?? 0) > 0);
  const months = paying.map((c) => c.months).filter((m): m is number => m !== undefined);
  const ltvs = paying.map((c) => c.ltv ?? c.lifetimeRevenue).filter((m): m is number => (m ?? 0) > 0);
  const avg = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
  const week = d.now.toLocaleDateString('en-US', { timeZone: 'America/New_York', month: 'short', day: 'numeric' });
  const lines = [`*Atlas: client health, week of ${week}*`];
  lines.push(`*Book:* ${paying.length} paying client${paying.length === 1 ? '' : 's'} · MRR ${usd(fees.reduce((a, b) => a + b, 0))}${fees.length < paying.length ? ` (fee missing for ${paying.length - fees.length})` : ''}${fees.length ? ` · avg retainer ${usd(avg(fees))}` : ''}${months.length ? ` · avg ${avg(months).toFixed(1)} months in` : ''}${ltvs.length ? ` · avg LTV ${usd(avg(ltvs))}` : ''}`);
  const graded = paying.map((c) => ({ c, g: grade(c) })).sort((a, b) => ['🔴', '🟡', '🟢'].indexOf(a.g.light) - ['🔴', '🟡', '🟢'].indexOf(b.g.light));
  for (const { c, g } of graded) {
    const conv = c.interested30 ? ` · ${pct(c.booked30 / c.interested30)} of interested → meeting` : '';
    lines.push(`${g.light} *${c.name}* · ${c.fee ? `${usd(c.fee)}/mo` : 'fee UNKNOWN'}${c.months !== undefined ? ` · ${c.months} mo` : ''}${(c.ltv ?? c.lifetimeRevenue) ? ` · LTV ${usd((c.ltv ?? c.lifetimeRevenue)!)}` : ''}`);
    lines.push(`    this week: ${c.interested7} interested (${trend(c.interested7, c.interestedPrev7)}), ${c.booked7} booked (${trend(c.booked7, c.bookedPrev7)}) · 30 d: ${c.interested30} interested, ${c.booked30} booked${c.kpi ? ` / KPI ${c.kpi}` : ''}${conv} · campaigns: ${c.campaigns.active} active${c.campaigns.over4 ? `, ${c.campaigns.over4} over 4%` : ''}${c.campaigns.past60 ? `, ${c.campaigns.past60} past 60%` : ''}`);
    if (g.reasons.length) lines.push(`    ${g.reasons.join(' · ')}`);
  }
  if (other.length) lines.push(`_Also running (not billed): ${other.map((c) => `${c.name} ${c.interested7} interested / ${c.booked7} booked this week`).join(' · ')}_`);
  const top: string[] = [];
  const reds = graded.filter((x) => x.g.light === '🔴');
  for (const r of reds.slice(0, 2)) top.push(`${r.c.name}: ${r.g.reasons[0]}.`);
  const plan = graded.filter((x) => x.c.campaigns.past60 || (x.c.campaigns.active && x.c.campaigns.active === x.c.campaigns.ending));
  if (plan.length && top.length < 3) top.push(`Plan the next campaign for ${plan.map((x) => x.c.name).slice(0, 3).join(', ')}.`);
  const noFee = paying.filter((c) => !c.fee);
  if (noFee.length && top.length < 3) top.push(`Add the monthly fee in Airtable for ${noFee.map((c) => c.name).join(', ')} so MRR and LTV are right.`);
  lines.push(`*Top ${Math.max(1, Math.min(3, top.length))} for you:* ${top.length ? top.slice(0, 3).map((t, i) => `${i + 1}. ${t}`).join('  ') : '1. Every client is healthy: spend the week on sales.'}`);
  return lines.join('\n');
}

export type HealthRow = AirtableRecord;
/** Workspace IDs fields Atlas reads (by name). */
export const HEALTH_WS_FIELDS = ['Name', 'Status', 'Client Type', 'Monthly Fee', 'Months Active', 'Estimated LTV', 'Actual Lifetime Revenue', 'Client Health', 'Calls Booked KPI (Client)', 'Calls Booked KPI (Internal)', 'ID'];
export interface HealthRows { ws: HealthRow[]; emails: HealthRow[]; campaigns: HealthRow[] }

/** The three Airtable reads behind client health (Workspace IDs, Emails of the last 31 days, active Campaigns). HQ's Clients screen uses the same reads. */
export async function readHealthRows(at: Pick<AirtableClient, 'list'>, opts: { inactive?: boolean; wsFields?: string[] } = {}): Promise<HealthRows> {
  const [ws, emails, campaigns] = await Promise.all([
    at.list(WORKSPACES, opts.inactive ? `{Name}!=''` : `{Status}='Active'`, [...new Set([...HEALTH_WS_FIELDS, ...(opts.wsFields ?? [])])], 200, { byName: true }),
    at.list(EMAILS, `OR(IS_AFTER({Latest Reply Time},DATEADD(NOW(),-31,'days')),IS_AFTER({Meeting Booked At},DATEADD(NOW(),-31,'days')),IS_AFTER({Date of Call Booked},DATEADD(NOW(),-31,'days')))`, ['Workspace ID (Bison)', 'Lead Status', 'Latest Reply Time', 'Meeting Booked At', 'Date of Call Booked', 'Opportunity Status', 'Pipeline Stage'], 20000, { byName: true }),
    at.list(CAMPAIGNS, `{Campaign Status}='Active'`, ['Name', 'Client', 'Bounced %', 'Progress', 'Campaign Status', 'Emails Sent', 'Interested'], 1000, { byName: true }),
  ]);
  return { ws, emails, campaigns };
}

export const bisonIdOf = (w: HealthRow) => String(num(w.fields.ID) ?? '');
export const campaignProgress = (c: HealthRow) => { const p = num(c.fields.Progress) ?? 0; return p > 1 ? p / 100 : p; };
export const campaignBounce = (c: HealthRow) => num(c.fields['Bounced %']) ?? 0;
/** Active campaigns linked to any of these workspace records. */
export const campaignsOf = (wsIds: string[], campaigns: HealthRow[]) => campaigns.filter((c) => (Array.isArray(c.fields.Client) ? c.fields.Client : [c.fields.Client]).map(v).some((id) => wsIds.includes(id)));

/**
 * When a meeting was booked. Most bookings (GHL two-way, people) only set Opportunity Status = WON /
 * Pipeline Stage = Booked Meeting and leave both dates empty (Twenty West 2026-11: 9 of 9), so the
 * latest reply time stands in for the booking day then (HQ fix 2026-11-27).
 */
export function bookedAt(e: HealthRow): string {
  const dated = v(e.fields['Meeting Booked At']) || v(e.fields['Date of Call Booked']);
  if (dated) return dated;
  const won = v(e.fields['Opportunity Status']) === 'WON' || ['Booked Meeting', 'Completed Meeting', 'Closed Deal'].includes(v(e.fields['Pipeline Stage']));
  return won ? v(e.fields['Latest Reply Time']) : '';
}

/**
 * One client's health numbers from one or more Workspace IDs records (the same client in two
 * workspaces counts once: the first record is the main one; results and campaigns add up). Pure.
 */
export function clientFrom(group: HealthRow[], rows: Pick<HealthRows, 'emails' | 'campaigns'>, now: Date): Client {
  const t = now.getTime();
  const within = (iso: string, from: number, to: number) => { const x = Date.parse(iso); return Number.isFinite(x) && x >= t - from * DAY && x < t - to * DAY; };
  const w = group[0]; const f = w.fields;
  const bisons = group.map(bisonIdOf).filter(Boolean);
  const mine = rows.emails.filter((e) => bisons.includes(v(e.fields['Workspace ID (Bison)'])));
  const interested = (a: number, b: number) => mine.filter((e) => INTERESTED.includes(v(e.fields['Lead Status'])) && within(v(e.fields['Latest Reply Time']), a, b)).length;
  const booked = (a: number, b: number) => mine.filter((e) => within(bookedAt(e), a, b)).length;
  const own = campaignsOf(group.map((x) => x.id), rows.campaigns);
  const first = (k: string) => group.map((x) => num(x.fields[k])).find((n) => (n ?? 0) > 0);
  return {
    id: w.id, name: v(f.Name), type: v(f['Client Type']), fee: num(f['Monthly Fee']) || first('Monthly Fee') || num(f['Monthly Fee']), months: num(f['Months Active']) ?? first('Months Active'), ltv: num(f['Estimated LTV']) ?? first('Estimated LTV'), lifetimeRevenue: num(f['Actual Lifetime Revenue']) ?? first('Actual Lifetime Revenue'),
    kpi: num(f['Calls Booked KPI (Client)']) || num(f['Calls Booked KPI (Internal)']) || first('Calls Booked KPI (Client)') || first('Calls Booked KPI (Internal)'), healthField: v(f['Client Health']),
    interested7: interested(7, 0), interestedPrev7: interested(14, 7), interested30: interested(30, 0), booked7: booked(7, 0), bookedPrev7: booked(14, 7), booked30: booked(30, 0),
    campaigns: { active: own.length, over4: own.filter((c) => campaignBounce(c) > 4).length, watch: own.filter((c) => { const b = campaignBounce(c); return b > 2.5 && b <= 4; }).length, past60: own.filter((c) => campaignProgress(c) >= 0.6 && campaignProgress(c) < 0.95).length, ending: own.filter((c) => campaignProgress(c) >= 0.95).length },
  };
}

export async function gatherHealth(at: Pick<AirtableClient, 'list'>, now: Date): Promise<HealthData> {
  const rows = await readHealthRows(at);
  const clients: Client[] = rows.ws.filter((w) => !/internal/i.test(v(w.fields['Client Type'])) || /paying/i.test(v(w.fields['Client Type']))).map((w) => clientFrom([w], rows, now));
  return { now, clients };
}

export const atlasHealthStage: Stage = async (ctx) => {
  const cfg = ctx.cfg;
  if (!cfg.airtableApiKey) throw new PermanentError('no AIRTABLE_API_KEY on the server');
  const at = createAirtableClient({ apiKey: cfg.airtableApiKey, baseId: cfg.airtableBaseId, baseUrl: cfg.airtableBaseUrl });
  const now = new Date();
  const text = writeHealth(await gatherHealth(at, now));
  const lines = text.split('\n');
  await saveReport(ctx.db, { agent: 'Atlas', kind: 'client_health', title: lines[0].replace(/\*/g, '') || 'Client health', body: lines.slice(1).join('\n'), dryRun: ctx.dryRun, jobId: ctx.job.id, dedupeKey: `atlas:${ctx.job.id}` });
  if (!slackReports(cfg)) return { message: 'Client health saved to HQ (Slack reports off)', text };
  if (ctx.dryRun || !cfg.slackBotToken || ctx.job.input.post === false) return { message: `Client health written (not posted${ctx.dryRun ? ': dry run' : ''})`, text };
  const slack = createSlackClient({ token: cfg.slackBotToken, baseUrl: cfg.slackBaseUrl });
  const to = String(ctx.job.input.channel ?? cfg.atlasChannel ?? ALEX);
  const posted = await ctx.paid({ callKey: `atlas:${now.toISOString().slice(0, 10)}:${to}`, provider: 'slack', units: 0, run: () => slack.post(to, text), dryRunResult: () => ({ channel: '', ts: '' }) });
  return { message: 'Client health posted', channel: posted.channel, text };
};

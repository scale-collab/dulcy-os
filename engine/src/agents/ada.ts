// Ada, the COO (Alex 2026-11-25): one short business brief every weekday morning in Slack — what
// happened, what is waiting on Alex, what to do first. Fridays add the weekly scorecard.
// Read only: Ada changes nothing. Everything comes from Airtable (the engine's own source of truth).
// The brief itself is plain code (exact numbers, no AI guesses); see agents/ada-morning-brief.md.
import type { Stage } from '../stages/index.js';
import { PermanentError } from '../errors.js';
import { createAirtableClient, type AirtableClient } from '../providers/airtable.js';
import { createSlackClient } from '../providers/slack.js';
import { DECISIONS, DF } from '../decisions/fields.js';
import { EMAILS } from './emailsFields.js';
import { ACTIVITY } from '../activity.js';
import { ACCOUNTS, QUEUE } from '../stages/accountHealth.js';

const CAMPAIGNS = 'tblAVAA6uBPaMj28P';
const WORKSPACES = 'tblcjRBGJEWh5KgOt';
const ALEX = 'U070Z26377C';

const v = (x: unknown): string => (Array.isArray(x) ? v(x[0]) : x === undefined || x === null ? '' : typeof x === 'object' ? String((x as any).name ?? (x as any).id ?? '') : String(x)).trim();
const num = (x: unknown) => (Number.isFinite(Number(v(x))) ? Number(v(x)) : 0);
const tally = (xs: string[]) => { const m = new Map<string, number>(); for (const x of xs) if (x) m.set(x, (m.get(x) ?? 0) + 1); return [...m.entries()].sort((a, b) => b[1] - a[1]); };
const fmt = (pairs: [string, number][], k = 4) => pairs.slice(0, k).map(([a, b]) => `${a} ${b}`).join(', ') + (pairs.length > k ? ', …' : '');
const short = (s: string, n = 60) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);
const INTERESTED = ['Interested', 'Meeting Request', 'Info Request', 'Information Request'];

export interface BriefData {
  now: Date;
  decisions: { title: string; agent: string; created: string }[];
  replies: { ws: string; status: string; state: string; sentAt: string; repliedAt: string; bookedAt: string }[];
  campaigns: { name: string; client: string; bounce: number; progress: number; status: string; changed: string }[];
  accounts: { stage: string }[];
  purchases: number;
  activity: { agent: string; type: string; event: string }[];
  clientName: (ws: string) => string;
  /** Friday only: this week vs last week, per client. */
  week?: { client: string; interested: [number, number]; booked: [number, number]; sent: [number, number] }[];
}

/** The brief text (Slack mrkdwn). Pure, so it is tested with fixed data. */
export function writeBrief(d: BriefData): string {
  const day = d.now.toLocaleDateString('en-US', { timeZone: 'America/New_York', weekday: 'long', month: 'short', day: 'numeric' });
  const since = d.now.getTime() - 86_400_000;
  const recent = (iso: string) => Date.parse(iso) >= since;
  const lines = [`*Good morning, ${day}*`];

  // Waiting on Alex.
  const replyDecisions = d.decisions.filter((x) => /^(Reply|Follow-up|Need your input)/i.test(x.title)).length;
  const bounceDecisions = d.decisions.filter((x) => /^(Fixed: )?Bounce /i.test(x.title)).length;
  const oldest = [...d.decisions].sort((a, b) => a.created.localeCompare(b.created))[0];
  lines.push(d.decisions.length
    ? `*Waiting on you:* ${d.decisions.length} decision${d.decisions.length === 1 ? '' : 's'} (${replyDecisions} replies / follow-ups, ${bounceDecisions} bounce, ${d.purchases} purchase${d.purchases === 1 ? '' : 's'})${oldest ? `. Oldest: ${short(oldest.title)}` : ''}`
    : `*Waiting on you:* nothing${d.purchases ? ` (except ${d.purchases} purchase${d.purchases === 1 ? '' : 's'} in the Spam Remediation Queue)` : ''}`);

  // Overnight.
  const newInterested = d.replies.filter((r) => recent(r.repliedAt) && INTERESTED.includes(r.status));
  const booked = d.replies.filter((r) => recent(r.bookedAt));
  const sent = d.replies.filter((r) => recent(r.sentAt));
  const waitingDrafts = d.replies.filter((r) => r.state === 'Needs Approval').length;
  lines.push(`*Overnight:* ${newInterested.length} new interested repl${newInterested.length === 1 ? 'y' : 'ies'}${newInterested.length ? ` (${fmt(tally(newInterested.map((r) => d.clientName(r.ws))))})` : ''} · ${booked.length} meeting${booked.length === 1 ? '' : 's'} booked${booked.length ? ` (${fmt(tally(booked.map((r) => d.clientName(r.ws))))})` : ''} · ${sent.length} repl${sent.length === 1 ? 'y' : 'ies'} sent · ${waitingDrafts} draft${waitingDrafts === 1 ? '' : 's'} waiting`);

  // Campaigns.
  const active = d.campaigns.filter((c) => c.status === 'Active');
  const over4 = active.filter((c) => c.bounce > 4).sort((a, b) => b.bounce - a.bounce);
  const watch = active.filter((c) => c.bounce > 2.5 && c.bounce <= 4);
  const at60 = active.filter((c) => c.progress >= 0.6 && c.progress < 0.95);
  const ending = active.filter((c) => c.progress >= 0.95);
  const pausedToday = d.campaigns.filter((c) => c.status === 'Paused' && recent(c.changed));
  const parts = [
    over4.length ? `⚠️ ${over4.length} over 4% (${over4.slice(0, 2).map((c) => `${short(c.name, 40)} ${c.bounce}%`).join('; ')}${over4.length > 2 ? '; …' : ''})` : '',
    watch.length ? `👀 ${watch.length} to watch (2.5-4%)` : '',
    pausedToday.length ? `⏸ ${pausedToday.length} paused in the last 24 h` : '',
    at60.length ? `📈 ${at60.length} past 60%: plan the next one (${fmt(tally(at60.map((c) => c.client)), 3)})` : '',
    ending.length ? `🏁 ${ending.length} almost done (95%+)` : '',
  ].filter(Boolean);
  lines.push(`*Campaigns (${active.length} active):* ${parts.length ? parts.join(' · ') : 'all healthy'}`);

  // Accounts.
  const resting = d.accounts.filter((a) => a.stage === 'Resting 7 Days').length;
  const replace = d.accounts.filter((a) => a.stage.startsWith('Replace')).length;
  if (resting || replace || d.purchases) lines.push(`*Accounts:* ${resting} resting · ${replace} to replace${d.purchases ? ` · ${d.purchases} purchase${d.purchases === 1 ? '' : 's'} waiting for your ✅` : ''}`);

  // What the agents did.
  const byAgent = tally(d.activity.map((a) => a.agent));
  if (byAgent.length) lines.push(`*Agents (24 h):* ${byAgent.map(([agent, n]) => { const fixed = d.activity.filter((a) => a.agent === agent && a.type === 'Fixed').length; return `${agent} ${n} step${n === 1 ? '' : 's'}${fixed ? ` (${fixed} fixed)` : ''}`; }).join(' · ')}`);

  // Top 3: what only Alex can unblock, most impact first.
  const top: string[] = [];
  if (replyDecisions) top.push(`Approve or skip the ${replyDecisions} waiting repl${replyDecisions === 1 ? 'y' : 'ies'} in Slack (prospects are waiting).`);
  if (d.purchases) top.push(`Decide the ${d.purchases} inbox replacement purchase${d.purchases === 1 ? '' : 's'}.`);
  if (over4.length) top.push(`Look at the bounce fix for ${short(over4[0].name, 45)} (${over4[0].bounce}%).`);
  if (bounceDecisions && !over4.length) top.push(`Clear the ${bounceDecisions} bounce decision${bounceDecisions === 1 ? '' : 's'}.`);
  if (at60.length) top.push(`Plan the next campaign for ${tally(at60.map((c) => c.client))[0][0]} (${at60.length} campaign${at60.length === 1 ? '' : 's'} past 60%).`);
  if (!top.length) top.push('Nothing blocking: spend the morning on sales calls or content.');
  lines.push(`*Top ${Math.min(3, top.length)} for you:* ${top.slice(0, 3).map((t, i) => `${i + 1}. ${t}`).join('  ')}`);

  if (d.week?.length) {
    lines.push('', '*Weekly scorecard (this week vs last)*');
    for (const w of d.week) lines.push(`• ${w.client}: interested ${w.interested[0]} (${w.interested[1]}), booked ${w.booked[0]} (${w.booked[1]}), sent ${w.sent[0]} (${w.sent[1]})`);
  }
  return lines.join('\n');
}

async function gather(at: Pick<AirtableClient, 'list'>, now: Date, weekly: boolean): Promise<BriefData> {
  const days = weekly ? 14 : 2;
  const [decisions, replies, campaigns, accounts, purchases, activity, workspaces] = await Promise.all([
    at.list(DECISIONS, `OR({Status}='New',{Status}='Waiting')`, [DF.title, DF.agent], 300).catch(() => []),
    at.list(EMAILS, `OR(IS_AFTER({Latest Reply Time},DATEADD(NOW(),-${days},'days')),IS_AFTER({Meeting Booked At},DATEADD(NOW(),-${days},'days')),IS_AFTER({Dulcy Reply Agent Sent At},DATEADD(NOW(),-${days},'days')),{Dulcy Reply Agent State}='Needs Approval')`,
      ['Workspace ID (Bison)', 'Lead Status', 'Dulcy Reply Agent State', 'Dulcy Reply Agent Sent At', 'Latest Reply Time', 'Meeting Booked At'], 5000, { byName: true }),
    at.list(CAMPAIGNS, `OR({Campaign Status}='Active',IS_AFTER({Status Last Modified},DATEADD(NOW(),-2,'days')))`, ['Name', 'Client', 'Bounced %', 'Progress', 'Campaign Status', 'Status Last Modified'], 500, { byName: true }),
    at.list(ACCOUNTS, `{Spam Protocol Stage}!=''`, ['Spam Protocol Stage'], 2000, { byName: true }).catch(() => []),
    at.list(QUEUE, `{Status}='Pending Review'`, ['Status'], 200, { byName: true }).catch(() => []),
    at.list(ACTIVITY, `IS_AFTER({When},DATEADD(NOW(),-1,'days'))`, ['Agent', 'Type', 'Event'], 1000, { byName: true }).catch(() => []),
    at.list(WORKSPACES, `{ID}!=''`, ['ID', 'Name'], 200, { byName: true }).catch(() => []),
  ]);
  const names = new Map(workspaces.map((w) => [String(num(w.fields.ID)), v(w.fields.Name)]));
  const rows = replies.map((r) => ({ ws: v(r.fields['Workspace ID (Bison)']), status: v(r.fields['Lead Status']), state: v(r.fields['Dulcy Reply Agent State']), sentAt: v(r.fields['Dulcy Reply Agent Sent At']), repliedAt: v(r.fields['Latest Reply Time']), bookedAt: v(r.fields['Meeting Booked At']) }));
  const clientName = (ws: string) => names.get(ws) ?? (ws ? `workspace ${ws}` : 'unknown');
  let week: BriefData['week'];
  if (weekly) {
    const t = now.getTime(), wk = 7 * 86_400_000;
    const span = (iso: string) => { const x = Date.parse(iso); return !Number.isFinite(x) ? -1 : x >= t - wk ? 0 : x >= t - 2 * wk ? 1 : -1; };
    const per = new Map<string, { interested: [number, number]; booked: [number, number]; sent: [number, number] }>();
    for (const r of rows) {
      const c = clientName(r.ws); const e = per.get(c) ?? { interested: [0, 0], booked: [0, 0], sent: [0, 0] };
      const a = span(r.repliedAt); if (a >= 0 && INTERESTED.includes(r.status)) e.interested[a as 0 | 1]++;
      const b = span(r.bookedAt); if (b >= 0) e.booked[b as 0 | 1]++;
      const s = span(r.sentAt); if (s >= 0) e.sent[s as 0 | 1]++;
      per.set(c, e);
    }
    week = [...per.entries()].filter(([, e]) => e.interested[0] + e.interested[1] + e.booked[0] + e.booked[1] + e.sent[0] + e.sent[1] > 0)
      .sort((a, b) => b[1].interested[0] - a[1].interested[0]).map(([client, e]) => ({ client, ...e }));
  }
  return {
    now, clientName, purchases: purchases.length, week,
    decisions: decisions.map((r) => ({ title: v(r.fields[DF.title]), agent: v(r.fields[DF.agent]), created: r.createdTime ?? '' })),
    replies: rows,
    campaigns: campaigns.map((c) => ({ name: v(c.fields.Name), client: v(c.fields.Client) || 'unknown', bounce: num(c.fields['Bounced %']), progress: num(c.fields.Progress), status: v(c.fields['Campaign Status']), changed: v(c.fields['Status Last Modified']) })),
    accounts: accounts.map((a) => ({ stage: v(a.fields['Spam Protocol Stage']) })),
    activity: activity.map((a) => ({ agent: v(a.fields.Agent), type: v(a.fields.Type), event: v(a.fields.Event) })),
  };
}

export const adaBriefStage: Stage = async (ctx) => {
  const cfg = ctx.cfg;
  if (!cfg.airtableApiKey) throw new PermanentError('no AIRTABLE_API_KEY on the server');
  const at = createAirtableClient({ apiKey: cfg.airtableApiKey, baseId: cfg.airtableBaseId, baseUrl: cfg.airtableBaseUrl });
  const now = new Date();
  const weekly = ctx.job.input.weekly === true || new Date(now.toLocaleString('en-US', { timeZone: 'America/New_York' })).getDay() === 5;
  const text = writeBrief(await gather(at, now, weekly));
  if (ctx.dryRun || !cfg.slackBotToken) return { message: `Brief written (not posted${ctx.dryRun ? ': dry run' : ': no Slack token'})`, text };
  const slack = createSlackClient({ token: cfg.slackBotToken, baseUrl: cfg.slackBaseUrl });
  const to = String(ctx.job.input.channel ?? cfg.adaChannel ?? ALEX);
  const posted = await ctx.paid({ callKey: `ada:${now.toISOString().slice(0, 10)}:${to}`, provider: 'slack', units: 0, run: () => slack.post(to, text), dryRunResult: () => ({ channel: '', ts: '' }) });
  return { message: `Morning brief posted (${weekly ? 'with weekly scorecard' : 'daily'})`, channel: posted.channel, text };
};

// HQ round 5 (Alex 2026-11-28): "In the overview, a little comment about what Atlas thought about the
// campaign." Atlas's take: 2-3 short sentences on how one campaign is doing, on its campaign page.
// Rule-based and pure (no AI call, nothing to cache): every number comes from the campaign's own row
// (Airtable Campaigns, synced from EmailBison) and the agency average; Atlas's own words come only from
// what he stored: his campaign plan (why he picked the move) and his newest Activity Log note on this
// campaign. Never invents a result: a missing number is left out, never guessed.
import { CAMPAIGN_LIMITS, STEP_OWNER, shortDate, type CampaignRow } from './campaigns.js';

export interface TakePlan { id: number; move: string; why: string }
export interface TakeNote { when: string; event: string }
export interface TakeCtx {
  /** Agency interested per email (campaigns with 500+ sent), undefined when there is none. */
  agencyRate: number | undefined;
  /** Atlas's plan for this campaign (campaign_plans.plan), when he planned it. */
  plan?: TakePlan | null;
  /** Atlas's newest Activity Log note on this campaign or its list. */
  note?: TakeNote | null;
  now?: number;
}
export interface AtlasTake { lines: string[]; text: string; basis: 'plan' | 'note' | 'numbers'; source: string }

const DAY = 86_400_000;
/** An Activity Log note older than this is not "what Atlas thinks now". */
export const TAKE_NOTE_DAYS = 14;
const num = (x: number) => Math.round(x).toLocaleString('en-US');
const perK = (interested: number, sent: number) => Math.round((interested / sent) * 10_000) / 10;
const pct = (x: number) => `${Number.isInteger(x) ? x : x.toFixed(1)}%`;
const plural = (n: number, one: string, many = `${one}s`) => `${num(n)} ${n === 1 ? one : many}`;
const MOVE: Record<string, string> = { first_campaign: 'a first campaign', top_off: 'a top-off', new_vertical: 'a new vertical', new_offer_or_copy_test: 'a new offer or copy test' };
/** One sentence, at most n characters, cut at a word; ends with a period. Pure. */
export function sentence(t: string, n = 170): string {
  let x = String(t ?? '').replace(/\s+/g, ' ').trim();
  if (!x) return '';
  if (x.length > n) { x = x.slice(0, n - 1).replace(/\s+\S*$/, ''); x = `${x.replace(/[,;:.\s]+$/, '')}…`; }
  return /[.!?…]$/.test(x) ? x : `${x}.`;
}

/** Interested per 1,000 sent against the agency average, in words (500+ sent only); past = a finished campaign (no next step). Pure. */
export function judgeRate(interested: number, sent: number, agencyRate: number | undefined, past = false): string {
  const line = judgeNow(interested, sent, agencyRate);
  return past ? line.replace(/^That is /, 'That was ').replace(/: a new vertical or a copy test is due\.$/, '.').replace(/: the list or the offer is not landing\.$/, '.') : line;
}
function judgeNow(interested: number, sent: number, agencyRate: number | undefined): string {
  if (sent < CAMPAIGN_LIMITS.minSentToJudge) return `Too early to judge: under ${num(CAMPAIGN_LIMITS.minSentToJudge)} emails sent.`;
  if (!interested && sent >= 1000) return `No interested reply after ${num(sent)} emails: the list or the offer is not landing.`;
  const k = perK(interested, sent);
  if (!agencyRate) return `That is ${k} interested per 1,000 sent.`;
  const a = Math.round(agencyRate * 10_000) / 10;
  const share = interested / sent / agencyRate;
  if (share >= 1.25) return `That is ${k} interested per 1,000 sent, well above the agency's ${a}.`;
  if (share >= 0.9) return `That is ${k} interested per 1,000 sent, in line with the agency's ${a}.`;
  if (share >= CAMPAIGN_LIMITS.lowShare) return `That is ${k} interested per 1,000 sent, a bit under the agency's ${a}.`;
  return `That is ${k} interested per 1,000 sent, well under the agency's ${a}: a new vertical or a copy test is due.`;
}

type Row = Pick<CampaignRow, 'group' | 'progress' | 'sent' | 'contacted' | 'totalLeads' | 'interested' | 'booked' | 'bounce' | 'flag' | 'needs' | 'now' | 'planned' | 'status'> & { ended?: string };

/** Atlas's take on one campaign: 2-3 sentences. Pure. */
export function atlasTake(r: Row, ctx: TakeCtx): AtlasTake {
  const now = ctx.now ?? Date.now();
  const lines: string[] = [];
  const results = `${plural(r.interested, 'interested reply', 'interested replies')} and ${plural(r.booked, 'meeting')} from ${plural(r.sent, 'email')}`;
  const plan = ctx.plan && ctx.plan.why ? ctx.plan : null;
  const note = ctx.note && ctx.note.event && Number.isFinite(Date.parse(ctx.note.when)) && now - Date.parse(ctx.note.when) <= TAKE_NOTE_DAYS * DAY ? ctx.note : null;
  const planLine = plan ? sentence(`I planned it as ${MOVE[plan.move] ?? plan.move.replace(/_/g, ' ')}: ${plan.why}`) : '';
  const noteLine = note ? sentence(`My last note (${shortDate(note.when)}): ${note.event}`) : '';
  let extra: string[] = [];

  if (r.group === 'done') {
    const when = r.ended ? ` ${shortDate(r.ended)}` : '';
    lines.push(`${r.status === 'Inactive' ? 'Stopped' : 'Finished'}${when}: ${results}${r.contacted ? ` to ${plural(r.contacted, 'lead')}` : ''}, bounce ${pct(r.bounce)}.`);
    lines.push(r.sent >= CAMPAIGN_LIMITS.minSentToJudge ? judgeRate(r.interested, r.sent, ctx.agencyRate, true) : `Under ${num(CAMPAIGN_LIMITS.minSentToJudge)} emails sent: too few to judge.`);
    extra = [planLine];
  } else if (r.group === 'live') {
    const used = Math.round(r.progress * 100);
    lines.push(!r.sent ? 'Live, but nothing sent yet.'
      : `${used}% of the list used${r.totalLeads ? ` (${num(r.contacted)} of ${num(r.totalLeads)} leads)` : ''}: ${results}.`);
    lines.push(r.bounce > CAMPAIGN_LIMITS.pause ? `Bounce is ${pct(r.bounce)}, over the 4% limit: it should be paused and the list checked.` : judgeRate(r.interested, r.sent, ctx.agencyRate));
    const need = r.needs.find((x) => x.kind !== 'pause' && x.kind !== 'low');
    const weakBooking = r.interested >= 5 && r.booked < 0.2 * r.interested ? `Only ${num(r.booked)} of ${num(r.interested)} interested booked a meeting: Echo should push the follow-ups.` : '';
    extra = [need ? sentence(`Next: ${need.text}`) : '', weakBooking, r.planned ? 'The next campaign is already being planned.' : '', planLine, noteLine,
      r.bounce > CAMPAIGN_LIMITS.watch && r.bounce <= CAMPAIGN_LIMITS.pause ? `Bounce ${pct(r.bounce)} is over 2.5%: I keep watching it.` : '',
      'Nothing to change now: keep it sending.'];
  } else {
    lines.push(r.now ? sentence(`Not sending yet: it is at ${r.now.label}${r.now.note ? ` (${r.now.note})` : ''}`) : 'Not sending yet.');
    const need = r.needs[0];
    extra = [need ? sentence(need.text) : r.now ? `${STEP_OWNER[r.now.key]} has the next step.` : '', planLine, noteLine];
  }
  const more = extra.filter(Boolean);
  lines.push(...more.slice(0, Math.max(0, 3 - lines.length)));
  const used = lines.slice(0, 3);
  const basis: AtlasTake['basis'] = plan && used.includes(planLine) ? 'plan' : note && used.includes(noteLine) ? 'note' : 'numbers';
  const source = basis === 'plan' ? `From the campaign's numbers and Atlas's plan #${plan!.id}.` : basis === 'note' ? "From the campaign's numbers and Atlas's Activity Log note." : "From the campaign's numbers (Airtable, synced from EmailBison) and the agency average.";
  return { lines: used, text: used.join(' '), basis, source };
}

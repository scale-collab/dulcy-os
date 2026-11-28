// Cole, Head of Sales (Alex 2026-11-24/25): reviews Alex's own sales calls from Fathom, the way
// Jackson Anderson reviews calls: what was said and when, pacing, objections against the Closers.io
// method, a score, the 3 things to fix with a better line for each, and a follow-up email DRAFT.
// Draft only: Cole never sends anything or changes Airtable. Each recording is reviewed once.
// Round 3 (Alex 2026-11-27, "Cole keeps Close current"): after the review Cole sets that lead's Close
// opportunity confidence and value (hq/closeUpdates.ts). Live only with cole.close_update in
// LIVE_STAGES; otherwise he records what he would change. Never an email or SMS.
// Pacing numbers (talk share, longest monologue, questions) are computed in code, not guessed.
import { z } from 'zod';
import type { Stage } from '../stages/index.js';
import { PermanentError } from '../errors.js';
import { createFathomClient, type FathomMeeting } from '../providers/fathom.js';
import { fathomAbout } from '../hq/salesCalls.js';
import { createClaude } from '../providers/claude.js';
import { createSlackClient } from '../providers/slack.js';
import { readKnowledge } from './knowledge.js';
import { saveReport, slackReports } from '../hq/reports.js';
import { createCloseClient } from '../providers/close.js';
import { closeUpdateLive, coleUpdateClose, type CloseUpdateRow } from '../hq/closeUpdates.js';

const DAY = 86_400_000;

export interface Pacing { alexShare: number; alexWords: number; otherWords: number; longestRunWords: number; longestRunAt: string; alexQuestions: number; otherQuestions: number; minutes: number }

const words = (s: string) => s.split(/\s+/).filter(Boolean).length;
const secs = (t: string) => t.split(':').map(Number).reduce((a, b) => a * 60 + (Number.isFinite(b) ? b : 0), 0);
export const isAlex = (m: Pick<FathomMeeting, 'recordedBy' | 'recordedByEmail'>, speaker: string, email: string) =>
  (!!email && (/@dulcy\.io$/i.test(email) || email.toLowerCase() === m.recordedByEmail.toLowerCase())) ||
  (!!speaker && (speaker.toLowerCase() === m.recordedBy.toLowerCase() || /^alex(ander)?( woung)?$/i.test(speaker.trim())));

/** Talk share, longest monologue and questions, from the transcript. Pure. */
export function pacing(m: FathomMeeting): Pacing {
  let alexWords = 0, otherWords = 0, run = 0, runStart = '', longest = 0, longestAt = '', aq = 0, oq = 0, lastAlex = false;
  for (const l of m.transcript) {
    const a = isAlex(m, l.speaker, l.email); const w = words(l.text); const q = (l.text.match(/\?/g) ?? []).length;
    if (a) { alexWords += w; aq += q; if (lastAlex) run += w; else { run = w; runStart = l.t; } if (run > longest) { longest = run; longestAt = runStart; } }
    else { otherWords += w; oq += q; }
    lastAlex = a;
  }
  const last = m.transcript.at(-1)?.t ?? '0';
  return { alexShare: alexWords + otherWords ? alexWords / (alexWords + otherWords) : 0, alexWords, otherWords, longestRunWords: longest, longestRunAt: longestAt, alexQuestions: aq, otherQuestions: oq, minutes: Math.round(secs(last) / 60) };
}

export function transcriptText(m: FathomMeeting, maxChars = 120_000): string {
  const t = m.transcript.map((l) => `[${l.t}] ${isAlex(m, l.speaker, l.email) ? 'ALEX' : l.speaker || 'Prospect'}: ${l.text}`).join('\n');
  return t.length > maxChars ? `${t.slice(0, maxChars)}\n[transcript cut at ${maxChars} characters]` : t;
}

/** Obvious internal meetings are skipped without calling Claude. */
export function obviouslyInternal(m: FathomMeeting): boolean {
  const external = m.invitees.filter((i) => i.external && !/@dulcy\.io$/i.test(i.email));
  return /inbox & reply operations|team (meeting|check)|stand-?up|internal/i.test(m.title) || (m.invitees.length > 0 && external.length === 0);
}

const Classify = z.object({
  kind: z.enum(['sales', 'client', 'internal', 'other']).describe('sales = Alex selling Dulcy to a prospect (discovery, pitch, close or a sales follow-up). client = a call with an existing client. internal = team. other = anything else.'),
  prospect: z.string().describe('Main prospect name, or empty'),
  company: z.string().describe('Prospect company, or empty'),
  call_type: z.enum(['discovery', 'close', 'follow-up', 'other']),
  reason: z.string().describe('One short line why'),
});
const Stage_ = z.enum(['Frame and opener', 'Discovery (pain, numbers, goals)', 'Gap and urgency', 'Pitch (promise, pillars, mapping)', 'Objections', 'Close and next step']);
export const Review = z.object({
  score: z.number().int().describe("1-10"),
  verdict: z.string().describe('One plain sentence: how the call went and the biggest lesson'),
  stages: z.array(z.object({ stage: Stage_, score: z.number().int().describe("1-10"), note: z.string() })),
  went_well: z.array(z.object({ t: z.string().describe('timestamp like 12:34'), quote: z.string(), why: z.string() })).describe('Up to 3'),
  fix: z.array(z.object({ t: z.string(), said: z.string().describe("Alex's exact words"), better: z.string().describe('What to say instead, in Alex\'s plain voice'), why: z.string() })).describe('The 3 most important fixes'),
  objections: z.array(z.object({ objection: z.string(), how_handled: z.string(), better: z.string().describe('The Closers.io way to handle it here, specific to this call'), handled_well: z.boolean() })),
  missing_beliefs: z.array(z.enum(['pain', 'doubt', 'cost', 'desire', 'money', 'support', 'trust'])).describe('Belief Ladder beliefs the prospect still lacked at the end'),
  next_step: z.string().describe('What was agreed (date/time if any), or "none"'),
  deal_temperature: z.enum(['hot', 'warm', 'cold', 'closed', 'lost']),
  drill: z.string().describe('One concrete practice drill for Alex before the next call'),
  follow_up_email: z.object({ subject: z.string(), body: z.string().describe('Plain-text email from Alex to the prospect. Short, specific to what they said, one clear next step. No invented prices, terms, guarantees or results.') }),
  close_confidence: z.number().int().optional().describe('0-100: how likely this deal is to close, judged from this call (what the prospect said, objections left, next step agreed)'),
  pitched: z.object({
    amount: z.number().nullable().describe('The price Alex pitched or agreed on the call in US dollars (e.g. 2000 for "$2K a month"); null if no price was said'),
    period: z.enum(['monthly', 'one_time', 'annual', 'unknown']).describe('How often that price is charged, as said on the call'),
    quote: z.string().describe('The exact words from the transcript where the price was said (copied word for word), or empty'),
    agreed: z.boolean().describe('true if the prospect agreed to that price'),
  }).optional().describe('The price pitched on the call, only as said in the transcript. Never a default or an invented price.'),
});
export type ReviewT = z.infer<typeof Review>;

const RULES = `You are Cole, Dulcy's Head of Sales, reviewing a sales call that Alex Woung (Dulcy's founder) ran.
Review it like Jackson Anderson's call reviews: go through what Alex actually said and when (timestamps), the pacing, where he talked too long or rushed, the questions he asked or skipped, and how each objection was handled, judged against the Closers.io method below.
Be direct and specific; quote exact words. Praise only what earned it. Every "fix" gives Alex a better line he can say next time, in his own plain voice (no hype).
Hard rules: never invent prices, guarantees, results or terms that were not said on the call or are not in Dulcy's approved facts; the follow-up email is a DRAFT for Alex to edit and send himself.`;

export function writeReview(m: FathomMeeting, c: z.infer<typeof Classify>, p: Pacing, raw: ReviewT): { main: string; draft: string } {
  const clamp = (n: number) => Math.min(10, Math.max(1, Math.round(n)));
  const r = { ...raw, score: clamp(raw.score), stages: raw.stages.slice(0, 6).map((s) => ({ ...s, score: clamp(s.score) })), went_well: raw.went_well.slice(0, 3), fix: raw.fix.slice(0, 3), objections: raw.objections.slice(0, 5) };
  const date = new Date(m.createdAt).toLocaleDateString('en-US', { timeZone: 'America/New_York', month: 'short', day: 'numeric' });
  const lines = [
    `*Cole: call review* · ${c.prospect || 'prospect'}${c.company ? ` (${c.company})` : ''} · ${date} · ${c.call_type} · <${m.url}|recording>`,
    `*Score ${r.score}/10* · ${r.deal_temperature} · ${r.verdict}`,
    `*Pacing:* you talked ${Math.round(p.alexShare * 100)}% (aim for under 50% in discovery) · longest stretch ${p.longestRunWords} words at ${p.longestRunAt || '?'} · you asked ${p.alexQuestions} questions, they asked ${p.otherQuestions} · ${p.minutes} min`,
    `*By stage:* ${r.stages.map((s) => `${s.stage.split(' (')[0]} ${s.score}`).join(' · ')}`,
    ...r.stages.filter((s) => s.score <= 6).map((s) => `  • ${s.stage}: ${s.note}`),
    r.went_well.length ? `*Worked:*\n${r.went_well.map((w) => `  • [${w.t}] "${w.quote}": ${w.why}`).join('\n')}` : '',
    r.fix.length ? `*Fix next time:*\n${r.fix.map((f) => `  • [${f.t}] You said: "${f.said}"\n     Say instead: "${f.better}"\n     Why: ${f.why}`).join('\n')}` : '',
    r.objections.length ? `*Objections:*\n${r.objections.map((o) => `  • ${o.handled_well ? '✅' : '⚠️'} "${o.objection}": you ${o.how_handled}${o.handled_well ? '' : `. Better: ${o.better}`}`).join('\n')}` : '',
    r.missing_beliefs.length ? `*Beliefs still missing:* ${r.missing_beliefs.join(', ')}` : '',
    `*Next step agreed:* ${r.next_step}`,
    `*Drill before the next call:* ${r.drill}`,
    '_Follow-up email draft in the thread (not sent)._',
  ].filter(Boolean);
  return { main: lines.join('\n'), draft: `*Follow-up draft (edit and send yourself):*\n*Subject:* ${r.follow_up_email.subject}\n\n${r.follow_up_email.body}` };
}

export const coleReviewStage: Stage = async (ctx) => {
  const cfg = ctx.cfg;
  const fathom = createFathomClient({ apiKey: cfg.fathomApiKey, baseUrl: cfg.fathomBaseUrl });
  const now = Date.now();
  const since = new Date(Math.max(now - 7 * DAY, cfg.coleFrom ? Date.parse(cfg.coleFrom) || 0 : 0)).toISOString();
  const meetings = (await fathom.meetings(String(ctx.job.input.since ?? since))).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const done = new Set((await ctx.db.query('SELECT recording_id FROM cole_reviews')).rows.map((r) => String(r.recording_id)));
  const todo = meetings.filter((m) => m.id && !done.has(m.id) && m.transcript.length > 10);
  if (!todo.length) return { message: `${meetings.length} recent calls, none new to review`, reviewed: 0 };
  if (ctx.dryRun) return { message: `${todo.length} call(s) would be looked at (dry run: Claude not called)`, calls: todo.map((m) => m.title) };
  const claude = createClaude({ apiKey: cfg.anthropicApiKey, model: cfg.claudeModel, baseURL: cfg.anthropicBaseUrl });
  const k = (rel: string) => readKnowledge(cfg.knowledgeDir, rel);
  const method = [k('skills/cole-sales-closing/SKILL.md'), k('skills/cole-sales-closing/references/closers-methods.md')].join('\n\n');
  const framework = [k('skills/cole-sales-closing/references/sales-coaching-sales-framework.md'), k('skills/cole-sales-closing/references/sales-coaching-diagnostics.md'), k('rules/RULES.md').slice(0, 20_000)].join('\n\n');
  const slack = cfg.slackBotToken ? createSlackClient({ token: cfg.slackBotToken, baseUrl: cfg.slackBaseUrl }) : null;
  const out: string[] = []; let reviewed = 0;
  for (const m of todo) {
    if (reviewed >= cfg.coleMaxPerRun) break;
    if (obviouslyInternal(m)) { await ctx.db.query(`INSERT INTO cole_reviews (recording_id, kind, title) VALUES ($1,'internal',$2) ON CONFLICT DO NOTHING`, [m.id, m.title]); out.push(`${m.title}: internal, skipped`); continue; }
    const head = `Title: ${m.title}\nRecorded by: ${m.recordedBy}\nInvitees: ${m.invitees.map((i) => `${i.name} <${i.email}>`).join(', ')}\nSummary: ${m.summary.slice(0, 3000)}\n\nTranscript start:\n${transcriptText(m, 6000)}`;
    const c = await ctx.paid({ callKey: `cole-classify:${m.id}`, provider: 'anthropic', units: 1, run: () => claude.structured(Classify, ['Classify this recorded call for Dulcy (a cold-email growth agency run by Alex Woung).'], '', head, 'low'), dryRunResult: () => ({ kind: 'other' as const, prospect: '', company: '', call_type: 'other' as const, reason: 'dry run' }) });
    if (c.kind !== 'sales') { await ctx.db.query(`INSERT INTO cole_reviews (recording_id, kind, title) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING`, [m.id, c.kind, m.title]); out.push(`${m.title}: ${c.kind}, skipped`); continue; }
    const p = pacing(m);
    const user = `${head.split('\n\nTranscript start:')[0]}\n\nPacing measured from the transcript: Alex talked ${Math.round(p.alexShare * 100)}% of the words; longest uninterrupted stretch ${p.longestRunWords} words at ${p.longestRunAt}; Alex asked ${p.alexQuestions} questions, the prospect ${p.otherQuestions}; ${p.minutes} minutes.\n\nFull transcript:\n${transcriptText(m)}`;
    const r = await ctx.paid({ callKey: `cole-review:${m.id}`, provider: 'anthropic', units: 1, run: () => claude.structured(Review, [RULES, method, framework], '', user, 'high'), dryRunResult: () => ({}) as ReviewT });
    const msg = writeReview(m, c, p, r);
    // HQ card: the score and the 3 fixes first, the full review behind a tap.
    const fixes = (r.fix ?? []).slice(0, 3).map((f) => ({ t: f.t, said: f.said, better: f.better, why: f.why }));
    await saveReport(ctx.db, {
      agent: 'Cole', kind: 'call_review', title: `Call review: ${c.prospect || 'prospect'}${c.company ? ` (${c.company})` : ''}`,
      summary: `Score ${Math.min(10, Math.max(1, Math.round(r.score)))}/10 · ${r.verdict}`, body: `${msg.main}\n\n${msg.draft}`, link: m.url,
      data: {
        score: Math.min(10, Math.max(1, Math.round(r.score))), verdict: r.verdict, temperature: r.deal_temperature, fixes, nextStep: r.next_step, drill: r.drill, followUp: r.follow_up_email, pacing: p,
        // Round 5 (HQ Sales calls list): the meeting's own name and Fathom's one line on what it was about, as recorded.
        meetingTitle: m.title.slice(0, 200), callType: c.call_type, about: fathomAbout(m.summary), meetingAt: m.createdAt,
      },
      jobId: ctx.job.id, dedupeKey: `cole:${m.id}`,
    });
    if (slack && slackReports(cfg)) {
      const posted = await ctx.paid({ callKey: `cole-post:${m.id}`, provider: 'slack', units: 0, run: () => slack.post(cfg.coleChannel, msg.main), dryRunResult: () => ({ channel: '', ts: '' }) });
      await ctx.paid({ callKey: `cole-draft:${m.id}`, provider: 'slack', units: 0, run: () => slack.post(posted.channel, msg.draft, posted.ts), dryRunResult: () => ({ channel: '', ts: '' }) });
    }
    await ctx.db.query(`INSERT INTO cole_reviews (recording_id, kind, title, review) VALUES ($1,'sales',$2,$3) ON CONFLICT (recording_id) DO UPDATE SET review=EXCLUDED.review`, [m.id, m.title, JSON.stringify({ classify: c, pacing: p, review: r })]);
    reviewed++; out.push(`${m.title}: reviewed ${r.score}/10`);
    const cu = await updateCloseAfterReview(ctx, m, c.prospect, r);
    if (cu) out.push(`${m.title}: Close ${cu.status}${cu.changes.length ? ` (${cu.changes.map((x) => `${x.field} ${x.from || 'empty'} → ${x.to}`).join(', ')})` : ''}`);
  }
  return { message: `${reviewed} sales call${reviewed === 1 ? '' : 's'} reviewed`, reviewed, calls: out };
};

/** Cole keeps Close current: confidence and value of the prospect's open opportunity (once per recording). A Close problem never fails the review. */
async function updateCloseAfterReview(ctx: Parameters<Stage>[0], m: FathomMeeting, prospect: string, r: ReviewT): Promise<CloseUpdateRow | null> {
  const close = createCloseClient(ctx.cfg.closeApiKey);
  if (!close || !r?.deal_temperature) return null;
  const live = closeUpdateLive(ctx);
  try {
    return await coleUpdateClose({
      db: ctx.db, cfg: ctx.cfg, close, live, jobId: ctx.job.id,
      write: (oppId, patch) => ctx.paid({ callKey: `cole-close:${m.id}`, provider: 'close', units: 0, run: () => close.updateOpportunity(oppId, patch), dryRunResult: () => { throw new PermanentError('dry run: Close not changed'); } }),
    }, {
      recordingId: m.id, prospect, emails: m.invitees.filter((i) => i.external).map((i) => i.email), transcript: transcriptText(m, 400_000),
      review: { deal_temperature: r.deal_temperature, close_confidence: r.close_confidence, pitched: r.pitched ? { ...r.pitched, period: r.pitched.period === 'unknown' ? null : r.pitched.period } : null },
    });
  } catch (e) {
    await ctx.log('cole: Close update skipped', { err: String((e as Error).message ?? e).slice(0, 200) }, 'warn');
    return null;
  }
}

export function coleNeedsKey(cfg: { fathomApiKey?: string }): void { if (!cfg.fathomApiKey) throw new PermanentError('no FATHOM_API_KEY on the server'); }

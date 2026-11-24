// Sean, the inbox agent (draft mode, Alex 2026-11-24). Every SEAN_EVERY_MIN minutes:
// find interested replies waiting on Dulcy (not client-handled), draft each answer with Claude
// in Alex's voice from the repo's rules, Sean's skill, the client's own file, that client's real
// threads that booked a meeting and the replies Alex approved before. The draft lands on the
// reply's own Airtable row (Reply Queue: Approve / Send Edited) and in Slack (✅ = the same Approve).
// Nothing is sent from here; the reply sender sends after approval.
import { z } from 'zod';
import type { Stage } from '../stages/index.js';
import { PermanentError } from '../errors.js';
import { createAirtableClient, type AirtableClient } from '../providers/airtable.js';
import { createClaude } from '../providers/claude.js';
import { EMAILS, EF, RA, INTENTS, SETTINGS, REPLY_LEARNING, waitingFormula, val, wsRecordOf } from './emailsFields.js';
import { clientFileFor, readKnowledge } from './knowledge.js';
import { openTimes, twoTimes } from './calendar.js';
import { DECISIONS, DF } from '../decisions/fields.js';

export const DraftSchema = z.object({
  action: z.enum(['reply', 'skip', 'ask_alex']),
  intent: z.enum(INTENTS),
  reason: z.string(),
  they_said: z.string(),
  draft: z.string(),
  question_for_alex: z.string(),
});
export type Draft = z.infer<typeof DraftSchema>;

export const SEAN_BRIEF = `You are Sean, Dulcy's inbox manager. Dulcy is a cold email agency run by Alex. You answer prospects who replied to a cold email campaign, for Dulcy itself or for one of Dulcy's clients (the client file below says whose campaign it is and what is true about them). Your one job: move an interested reply to a booked call, the way Alex would.

Decide one action:
- "reply": the thread needs an answer from us now. Write the full email body in "draft".
- "skip": no answer is needed (out of office, auto-reply, bounce, "not interested", unsubscribe or stop, already booked, wrong person with no referral, or the latest message is from our side). Leave "draft" empty.
- "ask_alex": an answer is needed but you are missing a fact you must not invent (a price that is not in the client file, a guarantee, a custom term, something only the client can confirm). Write your best draft anyway with a clear [GAP: what is missing] marker, and put the exact question in "question_for_alex".
Also classify the latest prospect message as one "intent".

How Alex writes (follow it exactly):
- Plain, direct, warm, human. Short: usually under 60 words, never a wall of text. No corporate filler, no "I hope this finds you well", no "circling back", no "just bumping this", no exclamation-mark enthusiasm.
- Answer what they asked first, in one or two sentences, then one clear next step.
- The next step is a call. Offer two specific dated times when times are given below; otherwise use the client's booking link when one is given below; if neither, ask what their week looks like. Never invent times or links.
- Objections are handled, never accepted at face value: "I need to think about it" gets a genuine "what's the part you're weighing?"-style question, never "sure, take your time". Price questions: answer only with prices the client file approves; otherwise ask_alex. Never promise results, guarantees, case studies or numbers that are not in the client file. Never reuse one client's facts for another.
- Greet by first name when you know it. No signature block or sign-off name (the inbox adds it). Plain text, no markdown, no links unless it is the approved booking link.
- If the prospect asked to stop or unsubscribe anywhere in the latest message, the action is "skip".
- Real examples follow: this client's threads that reached a booked meeting, and replies Alex approved. Copy how they move to a call, not their facts.

Fill every field: "reason" (one line: why this action), "they_said" (one line: what the prospect said), "draft" (email body or empty), "question_for_alex" (or empty).`;

export function trimHistory(h: string, max = 6000): string {
  return h.length <= max ? h : `[earlier messages cut]\n${h.slice(-max)}`;
}

/** This client's real threads that reached a booked meeting, plus replies Alex approved (newest first). */
export async function realExamples(at: Pick<AirtableClient, 'list'>, ws: number, wsRec: string): Promise<string> {
  const parts: string[] = [];
  try {
    const booked = await at.list(EMAILS, `AND({Workspace ID (Bison)}='${ws}',OR({Pipeline Stage}='Booked Meeting',{Pipeline Stage}='Completed Meeting',{Pipeline Stage}='Closed Deal'))`,
      [EF.history], 6, { sortField: 'Latest Reply Time', sortDesc: true });
    booked.forEach((r, i) => parts.push(`## Thread that booked a meeting ${i + 1}\n${trimHistory(val(r.fields[EF.history]), 2500)}`));
  } catch { /* examples are a bonus, never a blocker */ }
  try {
    if (wsRec) {
      const approved = await at.list(REPLY_LEARNING, `AND({Review Status}='Approved',{Workspace Record ID}='${wsRec}')`, ['Prospect Message', 'AI Draft', 'Approved Reply'], 8, { byName: true });
      approved.forEach((r, i) => parts.push(`## Reply Alex approved ${i + 1}\nProspect: ${val(r.fields['Prospect Message']).slice(0, 800)}\nSent: ${val(r.fields['Approved Reply']).slice(0, 800)}${val(r.fields['AI Draft']) && val(r.fields['AI Draft']) !== val(r.fields['Approved Reply']) ? `\n(Draft before Alex's edit: ${val(r.fields['AI Draft']).slice(0, 500)})` : ''}`));
    }
  } catch { /* same */ }
  return parts.length ? `# Real examples for this client\n${parts.join('\n\n')}` : '';
}

/** Booking options for a workspace: two live times from the client's connected calendar, else the saved booking link. */
export async function bookingFor(cfg: Parameters<typeof openTimes>[0], at: Pick<AirtableClient, 'list'>, wsRec: string): Promise<{ times: string[]; link: string }> {
  let link = '', disableTimes = false, disableLinks = false;
  try {
    const s = (await at.list(SETTINGS, `{Workspace Record ID}='${wsRec}'`, ['Calendar Link', 'Calendar Settings JSON'], 1, { byName: true }))[0];
    link = val(s?.fields['Calendar Link']);
    const j = JSON.parse(val(s?.fields['Calendar Settings JSON']) || '{}');
    disableTimes = j.disableTimes === true; disableLinks = j.disableLinks === true;
  } catch { /* no settings row: defaults */ }
  const open = disableTimes ? null : await openTimes(cfg, wsRec);
  return { times: open ? twoTimes(open.slots, open.timezone) : [], link: disableLinks ? '' : link };
}

/** The knowledge every Sean call shares (cached by Claude): brief, skill, playbooks, real data, rules. */
export function sharedKnowledge(dir: string, brief = SEAN_BRIEF): string {
  return [
    brief,
    `# Sean skill\n${readKnowledge(dir, 'skills/sean-reply-handling/SKILL.md')}`,
    `# Reply decisions\n${readKnowledge(dir, 'skills/sean-reply-handling/references/reply-decision.md')}\n${readKnowledge(dir, 'skills/sean-reply-handling/references/decision-playbook.md')}`,
    `# What worked before (real reply data)\n${readKnowledge(dir, 'skills/sean-reply-handling/references/historical-patterns.md')}`,
    `# Methods from the creators we follow\n${readKnowledge(dir, 'skills/sean-reply-handling/references/creator-methods.md')}`,
    `# From Dulcy's Google Drive SOPs\n${readKnowledge(dir, 'skills/sean-reply-handling/references/drive-findings.md')}`,
    `# Sales method (objections)\n${readKnowledge(dir, 'skills/cole-sales-closing/references/closers-methods.md')}`,
    `# Standing rules (newest wins)\n${readKnowledge(dir, 'rules/RULES.md')}\n${readKnowledge(dir, 'rules/client-promise-contract.md')}`,
  ].join('\n\n---\n\n');
}

export const seanDraftStage: Stage = async (ctx) => {
  const cfg = ctx.cfg;
  if (!cfg.airtableApiKey) throw new PermanentError('no AIRTABLE_API_KEY on the server');
  const at = createAirtableClient({ apiKey: cfg.airtableApiKey, baseId: cfg.airtableBaseId, baseUrl: cfg.airtableBaseUrl });
  const days = Number(ctx.job.input.days ?? cfg.seanDays) || 14;
  const max = Number(ctx.job.input.max ?? cfg.seanMaxPerRun) || 20;

  const recs = await at.list(EMAILS, waitingFormula(days), [...Object.values(EF), RA.clients, RA.wsRecord], 200);
  const done = new Set((await ctx.db.query(`SELECT email_record || '|' || reply_at AS k FROM sean_drafts WHERE action <> 'dry_run'`)).rows.map((r: any) => String(r.k)));
  const todo = recs.filter((r) => !done.has(`${r.id}|${val(r.fields[EF.latestReplyAt])}`)).slice(0, max);
  if (!todo.length) return { message: `${recs.length} waiting replies, none new`, waiting: recs.length, drafted: 0 };

  const dir = cfg.knowledgeDir;
  const shared = sharedKnowledge(dir);

  const claude = ctx.dryRun ? null : createClaude({ apiKey: cfg.anthropicApiKey, model: cfg.claudeModel, baseURL: cfg.anthropicBaseUrl });
  const perClient = new Map<string, { block: string; booking: { times: string[]; link: string } }>();
  const counts = { reply: 0, skip: 0, ask_alex: 0, noClientFile: 0 };

  for (const r of todo) {
    const f = r.fields;
    const replyAt = val(f[EF.latestReplyAt]);
    const ws = Number(val(f[EF.workspace]));
    const wsRec = wsRecordOf(f);
    const client = clientFileFor(dir, ws);
    if (!client) { counts.noClientFile++; continue; }
    if (!perClient.has(String(ws))) {
      perClient.set(String(ws), {
        block: [`# Client file: ${client.name}\n${client.text}`, ctx.dryRun ? '' : await realExamples(at, ws, wsRec)].filter(Boolean).join('\n\n'),
        booking: ctx.dryRun ? { times: [], link: '' } : await bookingFor(cfg, at, wsRec),
      });
    }
    const { block, booking } = perClient.get(String(ws))!;
    const now = new Date().toLocaleString('en-US', { timeZone: 'America/New_York', dateStyle: 'full', timeStyle: 'short' });
    const varying = `Now: ${now} ET.\n${booking.times.length ? `Times to offer (from the client's own calendar, both free): ${booking.times.join(' or ')}.` : booking.link ? `No live calendar for this client: use this booking link: ${booking.link}` : 'No calendar and no booking link for this client: ask what their week looks like.'}`;
    const user = [
      `Campaign: ${val(f[EF.campaign])}`,
      `Prospect: ${val(f[EF.leadName])} at ${val(f[EF.company])}`,
      `Subject: ${val(f[EF.subject])}`,
      `Lead status: ${val(f[EF.leadStatus])}`,
      `\nConversation (oldest first, latest at the end):\n${trimHistory(val(f[EF.history]) || val(f[EF.latestReply]))}`,
      `\nLatest message from the prospect:\n${val(f[EF.latestReply])}`,
    ].join('\n');

    const d: Draft = await ctx.paid({
      callKey: `draft:${r.id}:${replyAt}`, provider: 'anthropic', units: 1,
      run: () => claude!.structured(DraftSchema, [shared, block], varying, user),
      dryRunResult: () => ({ action: 'skip', intent: 'Other', reason: 'dry run (sean.draft not in LIVE_STAGES): Claude not called', they_said: '', draft: '', question_for_alex: '' }),
    });

    await ctx.step(`write:${r.id}:${replyAt}`, async () => {
      const replyId = Number(val(f[EF.replyId]));
      const action = d.action === 'reply' && !(replyId > 0) ? 'ask_alex' : d.action;
      const question = action === 'ask_alex' ? (d.question_for_alex || (replyId > 0 ? d.reason : 'No EmailBison reply ID on this thread: send it by hand in EmailBison.')) : '';
      let decisionId = '';
      if (!ctx.dryRun) {
        const eventId = wsRec && replyId > 0 ? `bison:${wsRec}:${replyId}` : '';
        // The reply's own row: what the Reply Queue page shows and approves.
        await at.update(EMAILS, r.id, {
          [RA.state]: action === 'skip' ? 'Skipped' : 'Needs Approval',
          [RA.intent]: d.intent, [RA.draft]: action === 'skip' ? '' : d.draft, [RA.humanAction]: 'None',
          [RA.seanReason]: d.reason, [RA.seanInput]: question, [RA.updatedAt]: new Date().toISOString(),
          ...(wsRec ? { [RA.wsRecord]: wsRec } : {}),
          ...(eventId ? { [RA.eventId]: eventId, [RA.lastInboundEventId]: eventId } : {}),
          [RA.policy]: JSON.stringify({ agent: 'sean', action, reason: d.reason, they_said: d.they_said, question_for_alex: question, latestReplyAt: replyAt, calendarEvidence: { times: booking.times, link: booking.link } }),
        });
        if (action !== 'skip') {
          const who = `${val(f[EF.leadName]) || 'prospect'}${val(f[EF.company]) ? ` at ${val(f[EF.company])}` : ''}`;
          decisionId = await at.create(DECISIONS, {
            [DF.title]: action === 'reply' ? `Reply to ${who}` : `Need your input: reply to ${who}`,
            [DF.agent]: 'Sean', [DF.status]: 'New', [DF.client]: client.name, [DF.emailsRecord]: r.id,
            [DF.issue]: d.they_said,
            [DF.checked]: action === 'ask_alex' ? `${question} (answer it in Airtable: edit the draft, then Send Edited)` : d.reason,
            [DF.fix]: d.draft,
            [DF.details]: `Thread: https://send.dulcy.io/inbox?reply_uuid=${val(f[EF.replyUuid])}\nCampaign: ${val(f[EF.campaign])}\n\nLatest message:\n${val(f[EF.latestReply]).slice(0, 2500)}`,
            [DF.action]: action === 'reply' ? 'Approve Reply' : 'None',
          });
        }
      }
      await ctx.db.query(`INSERT INTO sean_drafts (email_record, reply_at, action, reason, decision_id) VALUES ($1,$2,$3,$4,$5) ON CONFLICT (email_record, reply_at) DO UPDATE SET action = EXCLUDED.action, reason = EXCLUDED.reason, decision_id = EXCLUDED.decision_id WHERE sean_drafts.action = 'dry_run'`,
        [r.id, replyAt, ctx.dryRun ? 'dry_run' : action, d.reason.slice(0, 500), decisionId || null]);
      counts[action as 'reply' | 'skip' | 'ask_alex']++;
      return { decisionId };
    });
  }
  return {
    message: `${recs.length} waiting replies; ${todo.length} new: ${counts.reply} drafted (Reply Queue + Slack ✅), ${counts.ask_alex} need your input, ${counts.skip} no reply needed${counts.noClientFile ? `, ${counts.noClientFile} skipped (no client file for the workspace)` : ''}${ctx.dryRun ? ' (dry run: Claude not called, nothing written)' : ''}`,
    waiting: recs.length, ...counts, dryRun: ctx.dryRun,
  };
};

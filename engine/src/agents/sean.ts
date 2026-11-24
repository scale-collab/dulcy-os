// Sean, the inbox agent (draft mode, Alex 2026-11-24). Every SEAN_EVERY_MIN minutes:
// find interested replies waiting on Dulcy (not client-handled), draft each answer with Claude
// in Alex's voice from the repo's rules, Sean's skill and the client's own file, and post it
// as a Decision (Slack ✅ = send). Nothing is ever sent from here; sending is the decision's job.
import { z } from 'zod';
import type { Stage } from '../stages/index.js';
import { PermanentError } from '../errors.js';
import { createAirtableClient } from '../providers/airtable.js';
import { createClaude } from '../providers/claude.js';
import { createCalendly, twoTimes } from '../providers/calendly.js';
import { EMAILS, EF, waitingFormula } from './emailsFields.js';
import { clientFileFor, readKnowledge } from './knowledge.js';
import { DECISIONS, DF } from '../decisions/fields.js';

export const DraftSchema = z.object({
  action: z.enum(['reply', 'skip', 'ask_alex']),
  reason: z.string(),
  they_said: z.string(),
  draft: z.string(),
  question_for_alex: z.string(),
});
export type Draft = z.infer<typeof DraftSchema>;

const DULCY_WORKSPACES = [2, 41];

export const SEAN_BRIEF = `You are Sean, Dulcy's inbox manager. Dulcy is a cold email agency run by Alex. You answer prospects who replied to a cold email campaign, for Dulcy itself or for one of Dulcy's clients (the client file below says whose campaign it is and what is true about them). Your one job: move an interested reply to a booked call, the way Alex would.

Decide one action:
- "reply": the thread needs an answer from us now. Write the full email body in "draft".
- "skip": no answer is needed (out of office, auto-reply, bounce, "not interested", unsubscribe or stop, already booked, wrong person with no referral, or the latest message is from our side). Leave "draft" empty.
- "ask_alex": an answer is needed but you are missing a fact you must not invent (a price that is not in the client file, a guarantee, a custom term, something only the client can confirm). Write your best draft anyway with a clear [GAP: what is missing] marker, and put the exact question in "question_for_alex".

How Alex writes (follow it exactly):
- Plain, direct, warm, human. Short: usually under 60 words, never a wall of text. No corporate filler, no "I hope this finds you well", no "circling back", no "just bumping this", no exclamation-mark enthusiasm.
- Answer what they asked first, in one or two sentences, then one clear next step.
- The next step is a call. Offer two specific dated times when times are given below; otherwise use the client's booking link from the client file; if neither exists, ask what their week looks like. Never invent times or links.
- Objections are handled, never accepted at face value: "I need to think about it" gets a genuine "what's the part you're weighing?"-style question, never "sure, take your time". Price questions: answer only with prices the client file approves; otherwise ask_alex. Never promise results, guarantees, case studies or numbers that are not in the client file. Never reuse one client's facts for another.
- Greet by first name when you know it. No signature block or sign-off name (the inbox adds it). Plain text, no markdown, no links unless they are the approved booking link.
- If the prospect asked to stop or unsubscribe anywhere in the latest message, the action is "skip".

Fill every field: "reason" (one line: why this action), "they_said" (one line: what the prospect said), "draft" (email body or empty), "question_for_alex" (or empty).`;

function trimHistory(h: string, max = 6000): string {
  return h.length <= max ? h : `[earlier messages cut]\n${h.slice(-max)}`;
}

export const seanDraftStage: Stage = async (ctx) => {
  const cfg = ctx.cfg;
  if (!cfg.airtableApiKey) throw new PermanentError('no AIRTABLE_API_KEY on the server');
  const at = createAirtableClient({ apiKey: cfg.airtableApiKey, baseId: cfg.airtableBaseId, baseUrl: cfg.airtableBaseUrl });
  const days = Number(ctx.job.input.days ?? cfg.seanDays) || 14;
  const max = Number(ctx.job.input.max ?? cfg.seanMaxPerRun) || 20;

  const recs = await at.list(EMAILS, waitingFormula(days), Object.values(EF), 200);
  const done = new Set((await ctx.db.query(`SELECT email_record || '|' || reply_at AS k FROM sean_drafts`)).rows.map((r: any) => String(r.k)));
  const todo = recs.filter((r) => !done.has(`${r.id}|${String(r.fields[EF.latestReplyAt] ?? '')}`)).slice(0, max);
  if (!todo.length) return { message: `${recs.length} waiting replies, none new`, waiting: recs.length, drafted: 0 };

  const dir = cfg.knowledgeDir;
  const shared = [
    SEAN_BRIEF,
    `# Sean skill\n${readKnowledge(dir, 'skills/sean-reply-handling/SKILL.md')}`,
    `# Reply decisions\n${readKnowledge(dir, 'skills/sean-reply-handling/references/reply-decision.md')}\n${readKnowledge(dir, 'skills/sean-reply-handling/references/decision-playbook.md')}`,
    `# What worked before\n${readKnowledge(dir, 'skills/sean-reply-handling/references/historical-patterns.md')}`,
    `# Sales method (objections)\n${readKnowledge(dir, 'skills/cole-sales-closing/references/closers-methods.md')}`,
    `# Standing rules (newest wins)\n${readKnowledge(dir, 'rules/RULES.md')}\n${readKnowledge(dir, 'rules/client-promise-contract.md')}`,
  ].join('\n\n---\n\n');

  const claude = ctx.dryRun ? null : createClaude({ apiKey: cfg.anthropicApiKey, model: cfg.claudeModel, baseURL: cfg.anthropicBaseUrl });
  let dulcyTimes: string[] | null = null;
  const counts = { reply: 0, skip: 0, ask_alex: 0, noClientFile: 0 };

  for (const r of todo) {
    const f = r.fields;
    const replyAt = String(f[EF.latestReplyAt] ?? '');
    const ws = Number(f[EF.workspace]);
    const client = clientFileFor(dir, ws);
    if (!client) { counts.noClientFile++; continue; }
    if (DULCY_WORKSPACES.includes(ws) && dulcyTimes === null) {
      dulcyTimes = [];
      if (cfg.calendlyToken) {
        try { dulcyTimes = twoTimes(await createCalendly({ token: cfg.calendlyToken, eventSlug: cfg.calendlyEventSlug }).openSlots()); }
        catch (e) { await ctx.log('calendly times unavailable', { err: String((e as Error).message) }); }
      }
    }
    const times = DULCY_WORKSPACES.includes(ws) ? dulcyTimes ?? [] : [];
    const now = new Date().toLocaleString('en-US', { timeZone: 'America/New_York', dateStyle: 'full', timeStyle: 'short' });
    const varying = `Now: ${now} ET.\n${times.length ? `Times to offer (Alex's calendar, both free): ${times.join(' or ')}.` : 'No calendar times available for this client: use the booking link from the client file, or ask what their week looks like.'}`;
    const user = [
      `Campaign: ${String(f[EF.campaign] ?? '')}`,
      `Prospect: ${String(f[EF.leadName] ?? '')} at ${String(f[EF.company] ?? '')}`,
      `Subject: ${String(f[EF.subject] ?? '')}`,
      `Lead status: ${typeof f[EF.leadStatus] === 'object' ? (f[EF.leadStatus] as any)?.name : String(f[EF.leadStatus] ?? '')}`,
      `\nConversation (oldest first, latest at the end):\n${trimHistory(String(f[EF.history] ?? f[EF.latestReply] ?? ''))}`,
      `\nLatest message from the prospect:\n${String(f[EF.latestReply] ?? '')}`,
    ].join('\n');

    const d: Draft = await ctx.paid({
      callKey: `draft:${r.id}:${replyAt}`, provider: 'anthropic', units: 1,
      run: () => claude!.structured(DraftSchema, [shared, `# Client file: ${client.name}\n${client.text}`], varying, user),
      dryRunResult: () => ({ action: 'skip', reason: 'dry run (sean.draft not in LIVE_STAGES): Claude not called', they_said: '', draft: '', question_for_alex: '' }),
    });

    await ctx.step(`decision:${r.id}:${replyAt}`, async () => {
      let decisionId = '';
      const replyId = Number(String(f[EF.replyId] ?? '').trim());
      const action = d.action === 'reply' && !(replyId > 0) ? 'ask_alex' : d.action;
      if (action !== 'skip') {
        const who = `${String(f[EF.leadName] ?? '').trim() || 'prospect'}${f[EF.company] ? ` at ${String(f[EF.company]).trim()}` : ''}`;
        decisionId = await at.create(DECISIONS, {
          [DF.title]: action === 'reply' ? `Reply to ${who}` : `Need your input: reply to ${who}`,
          [DF.agent]: 'Sean', [DF.status]: 'New', [DF.client]: client.name,
          [DF.issue]: d.they_said,
          [DF.checked]: action === 'ask_alex' ? `${d.question_for_alex || d.reason}` : d.reason,
          [DF.fix]: d.draft,
          [DF.details]: `Thread link: https://send.dulcy.io/inbox?reply_uuid=${String(f[EF.replyUuid] ?? '')}\nCampaign: ${String(f[EF.campaign] ?? '')}\n\nLatest message:\n${String(f[EF.latestReply] ?? '').slice(0, 2500)}`,
          [DF.action]: action === 'reply' ? 'Send Reply' : 'None',
          [DF.actionInput]: action === 'reply' ? JSON.stringify({ workspaceId: ws, replyId, message: d.draft, emailsRecordId: r.id, latestReplyAt: replyAt }) : '',
        });
      }
      await ctx.db.query(`INSERT INTO sean_drafts (email_record, reply_at, action, reason, decision_id) VALUES ($1,$2,$3,$4,$5) ON CONFLICT DO NOTHING`,
        [r.id, replyAt, ctx.dryRun ? 'dry_run' : action, d.reason.slice(0, 500), decisionId || null]);
      counts[action as 'reply' | 'skip' | 'ask_alex']++;
      return { decisionId };
    });
  }
  return {
    message: `${recs.length} waiting replies; ${todo.length} new: ${counts.reply} drafted for ✅, ${counts.ask_alex} need your input, ${counts.skip} no reply needed${counts.noClientFile ? `, ${counts.noClientFile} skipped (no client file for the workspace)` : ''}${ctx.dryRun ? ' (dry run: Claude not called)' : ''}`,
    waiting: recs.length, ...counts, dryRun: ctx.dryRun,
  };
};

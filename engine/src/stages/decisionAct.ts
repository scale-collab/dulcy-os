// Approved decision → action. First action: send an approved reply in an EmailBison thread.
// Safety: the receipt belongs to the decision record (a reply is never sent twice, even by a
// new job); an unclear send stops for review; if the prospect wrote again after the draft,
// nothing is sent (redraft instead).
import type { Stage } from './index.js';
import { NeedsReviewError, PermanentError } from '../errors.js';
import { bisonFor } from '../providers/emailbison.js';
import { createAirtableClient } from '../providers/airtable.js';
import { EMAILS, EMAILS_LATEST_REPLY_TIME } from '../decisions/fields.js';
import { EF } from '../agents/emailsFields.js';
import { placeholderProblem } from '../agents/placeholders.js';

export const sendReplyStage: Stage = async (ctx) => {
  const i = ctx.job.input as Record<string, any>;
  const workspaceId = Number(i.workspaceId), replyId = Number(i.replyId), message = String(i.message ?? '').trim();
  if (!(workspaceId > 0) || !(replyId > 0) || !message) throw new PermanentError('Send Reply needs workspaceId, replyId and message in Action Input');
  // Placeholder guard (Alex 2026-11-27): never send "[link]", "{{first_name}}", "<insert …>" as is.
  const unfilled = placeholderProblem(message);
  if (unfilled) throw new NeedsReviewError(`${unfilled}; nothing sent`);

  if (i.emailsRecordId && i.latestReplyAt && ctx.cfg.airtableApiKey) {
    const at = createAirtableClient({ apiKey: ctx.cfg.airtableApiKey, baseId: ctx.cfg.airtableBaseId, baseUrl: ctx.cfg.airtableBaseUrl });
    const rec = await at.get(EMAILS, String(i.emailsRecordId), [EMAILS_LATEST_REPLY_TIME, EF.lastSent]);
    const now = rec?.fields[EMAILS_LATEST_REPLY_TIME];
    const last = rec?.fields[EF.lastSent];
    if (String(typeof last === 'object' ? (last as any)?.name : last ?? '') === 'Last Email Sent By Dulcy') {
      throw new NeedsReviewError('someone already answered this thread from our side (Josh, the client or another tool); nothing sent');
    }
    if (now && Date.parse(String(now)) > Date.parse(String(i.latestReplyAt)) + 60_000) {
      throw new NeedsReviewError('the prospect wrote again after this draft was made; nothing sent, redraft it');
    }
  }

  const bison = bisonFor(ctx.cfg, ctx.cfg.bounceCheckKey, workspaceId);
  const sent = await ctx.paid({
    callKey: `reply:${replyId}`, provider: 'emailbison', units: 0, scope: 'record',
    run: () => bison.sendReply(replyId, message),
    dryRunResult: () => ({ id: 0 }),
  });
  return { message: ctx.dryRun ? 'Dry run: reply not sent (decision.send_reply is not in LIVE_STAGES)' : `Reply sent (EmailBison reply ${sent.id || 'id unknown'})`, sentReplyId: sent.id, dryRun: ctx.dryRun };
};

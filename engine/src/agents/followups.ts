// Echo's follow-ups (Alex 2026-11-24: "keep following up until they answer or say stop").
// A thread is "armed" (State Scheduled + Due At + Follow-up Type) after every reply we send, and
// by the old intakes for out-of-office / check-back-later replies. When Due At passes and the
// prospect still has not answered, Echo drafts the next follow-up with a real reason, onto the
// same Airtable row + a Slack decision. Nothing sends without a person's Approve / ✅.
// Steps come from the client's "Follow-up Plan JSON" in the Reply Agent settings (delay + what
// the step should do); then one polite close-the-loop note; then the thread is complete.
import type { Stage } from '../stages/index.js';
import type { AirtableClient } from '../providers/airtable.js';
import { PermanentError } from '../errors.js';
import { createAirtableClient } from '../providers/airtable.js';
import { createClaude } from '../providers/claude.js';
import { EMAILS, EF, RA, SETTINGS, val, wsRecordOf } from './emailsFields.js';
import { clientFileFor } from './knowledge.js';
import { DraftSchema, type Draft, type Booking, sharedKnowledge, realExamples, bookingFor, bookingForDraft, trimHistory } from './sean.js';
import { loadSettings, parseSettings, settingsBlock, blockedBy, typeAllowed, autoSendDecision, type ClientSettings } from './settings.js';
import { logActivity } from '../activity.js';
import { rememberOffered } from './calendar.js';
import { DECISIONS, DF } from '../decisions/fields.js';

export { DEFAULT_PLAN, CLOSE_LOOP, parsePlan, allSteps, dueAfter, type FollowupStep, type FollowupPlan } from './followupPlan.js';
import { DEFAULT_PLAN, parsePlan, allSteps, dueAfter, type FollowupPlan } from './followupPlan.js';

export async function planFor(at: Pick<AirtableClient, 'list'>, wsRec: string): Promise<FollowupPlan> {
  return (await loadSettings(at, wsRec)).plan;
}

const NO_FOLLOWUP_STATUS = ['Not Interested', 'Do Not Contact', 'Unsubscribed', 'Wrong Person', 'Bounced'];
const NO_FOLLOWUP_INTENT = ['Not Interested', 'Do Not Contact', 'Wrong Person', 'Automatic Reply'];
const CLOSED_STAGES = ['Booked Meeting', 'Completed Meeting', 'Closed Deal', 'Closed -- Not Moving Forward', 'Lost'];

/** Whether a thread we just answered should get follow-ups at all. */
export function shouldArm(f: Record<string, unknown>): boolean {
  return !NO_FOLLOWUP_STATUS.includes(val(f[EF.leadStatus])) && !NO_FOLLOWUP_INTENT.includes(val(f[RA.intent]))
    && !CLOSED_STAGES.includes(val(f[EF.stage])) && f[EF.dnc] !== true && f[EF.clientHandling] !== true;
}

/**
 * After a send: the fields that arm the next follow-up (or close the thread).
 * `sentFollowups` = follow-ups already sent in this quiet streak, including the one just sent.
 */
export function armFields(plan: FollowupPlan, sentFollowups: number, now: Date, arm: boolean): Record<string, unknown> {
  const steps = allSteps(plan);
  if (!arm || !plan.enabled) return { [RA.state]: 'Sent', [RA.followupType]: 'None', [RA.dueAt]: null };
  if (sentFollowups >= steps.length) return { [RA.state]: 'Thread Complete', [RA.followupType]: 'None', [RA.dueAt]: null };
  return { [RA.state]: 'Scheduled', [RA.followupType]: 'No Response', [RA.dueAt]: dueAfter(now, steps[sentFollowups].delayDays, plan.skipWeekends) };
}

export function policyOf(f: Record<string, unknown>): Record<string, any> {
  try { const j = JSON.parse(val(f[RA.policy]) || '{}'); return j && typeof j === 'object' ? j : {}; } catch { return {}; }
}

/** Scheduled threads whose follow-up is due, Dulcy-owned, not stopped, not booked. */
export function dueFormula(): string {
  const any = (field: string, vals: string[]) => `OR(${vals.map((v) => `{${field}}='${v}'`).join(',')})`;
  return `AND({Dulcy Reply Agent State}='Scheduled',{Dulcy Reply Agent Due At}!='',IS_BEFORE({Dulcy Reply Agent Due At},NOW()),`
    + `NOT({Client Handling}),NOT({DNC}),{Reply Ownership}!='Handoff',`
    + `NOT(${any('Lead Status', NO_FOLLOWUP_STATUS)}),NOT(${any('Pipeline Stage', CLOSED_STAGES)}))`;
}

export const FOLLOWUP_BRIEF = `You are Echo, Dulcy's inbox manager, writing a FOLLOW-UP in a thread where the prospect has not answered our last email (or was out of office and is now back). Dulcy is a cold email agency run by Alex; the client file below says whose campaign this is and what is true about them.

Decide one action:
- "reply": a follow-up is worth sending now. Write the full email body in "draft".
- "skip": there is no honest, useful reason to follow up (they said no or stop, they already booked, the thread is with someone else, or our last message already closed the loop). Leave "draft" empty.
- "ask_alex": a follow-up is right but needs a fact you must not invent (a price, a promised asset or link you do not have, something only the client can confirm). Write the draft without the missing fact and with no placeholder of any kind (no [GAP: …], [link], {{first_name}} or <insert …>), and put the exact question in "question_for_alex". Alex fills the fact in before it is sent.
Also classify the prospect's last message as one "intent".

Rules for every follow-up (Alex's voice, follow exactly):
- It must carry a real reason to reply: pick up their open question, the promised next step, or one new true point. Never "just bumping this", "circling back", "following up", "checking in" or a guilt line.
- Very short: 1 to 3 sentences, under 50 words. Plain text, no markdown, no signature, no sign-off name.
- Do not repeat our previous email. Do not re-ask a question they already answered.
- One clear next step. When times are given below offer those two; otherwise the client's booking link when given; otherwise ask what their week looks like. Never invent times, links, prices, proof or promises.
- Out of office / back from leave: welcome them back in a few words and re-open the one open point from before they left.
- Follow the step instruction below for this follow-up.

Fill every field: "reason" (one line: why this follow-up, or why skip), "they_said" (one line: what the prospect last said), "draft", "question_for_alex" (or empty).`;

export const seanFollowupStage: Stage = async (ctx) => {
  const cfg = ctx.cfg;
  if (!cfg.airtableApiKey) throw new PermanentError('no AIRTABLE_API_KEY on the server');
  const at = createAirtableClient({ apiKey: cfg.airtableApiKey, baseId: cfg.airtableBaseId, baseUrl: cfg.airtableBaseUrl });
  const max = Number(ctx.job.input.max ?? cfg.seanMaxPerRun) || 20;

  const recs = await at.list(EMAILS, dueFormula(), [...Object.values(EF), RA.clients, RA.wsRecord, RA.policy, RA.dueAt, RA.followupType, RA.intent], 200);
  const keyOf = (r: { id: string; fields: Record<string, unknown> }) => `${r.id}|followup:${val(r.fields[RA.dueAt])}`;
  const done = new Set((await ctx.db.query(`SELECT email_record || '|' || reply_at AS k FROM sean_drafts WHERE action <> 'dry_run'`)).rows.map((r: any) => String(r.k)));
  const todo = recs.filter((r) => !done.has(keyOf(r))).slice(0, max);
  if (!todo.length) return { message: `${recs.length} follow-ups due, none new`, due: recs.length, drafted: 0 };

  const dir = cfg.knowledgeDir;
  const shared = sharedKnowledge(dir);
  const claude = ctx.dryRun ? null : createClaude({ apiKey: cfg.anthropicApiKey, model: cfg.claudeModel, baseURL: cfg.anthropicBaseUrl });
  const perClient = new Map<string, { block: string; booking: Booking; plan: FollowupPlan; settings: ClientSettings }>();
  const counts = { reply: 0, skip: 0, ask_alex: 0, answered: 0, complete: 0, noClientFile: 0, clientOff: 0 };

  for (const r of todo) {
    const f = r.fields;
    const type = val(f[RA.followupType]) || 'No Response';
    const ws = Number(val(f[EF.workspace]));
    const wsRec = wsRecordOf(f);
    const policy = policyOf(f);
    const sent = Number(policy.seanFollowupsSent ?? 0) || 0;
    const record = (action: string, reason: string, decisionId = '') => ctx.db.query(
      `INSERT INTO sean_drafts (email_record, reply_at, action, reason, decision_id) VALUES ($1,$2,$3,$4,$5) ON CONFLICT (email_record, reply_at) DO UPDATE SET action = EXCLUDED.action, reason = EXCLUDED.reason, decision_id = EXCLUDED.decision_id WHERE sean_drafts.action = 'dry_run'`,
      [r.id, `followup:${val(f[RA.dueAt])}`, ctx.dryRun ? 'dry_run' : action, reason.slice(0, 500), decisionId || null]);

    // The prospect answered after our last email: that is a reply for Echo's normal drafting, not a follow-up.
    if (type === 'No Response' && val(f[EF.lastSent]) === 'Last Email Sent By Prospect') { await record('answered', 'prospect wrote after our last email'); counts.answered++; continue; }
    const client = clientFileFor(dir, ws);
    if (!client) { counts.noClientFile++; continue; }
    if (!perClient.has(String(ws))) {
      const settings = ctx.dryRun ? parseSettings(null) : await loadSettings(at, wsRec);
      perClient.set(String(ws), {
        block: [`# Client file: ${client.name}\n${client.text}`, settingsBlock(settings, 'followup'), ctx.dryRun ? '' : await realExamples(at, ws, wsRec)].filter(Boolean).join('\n\n'),
        booking: ctx.dryRun ? { slots: [], tz: 'America/New_York', link: '' } : await bookingFor(cfg, settings, wsRec),
        plan: settings.plan, settings,
      });
    }
    const { block, booking, plan, settings } = perClient.get(String(ws))!;
    const blocked = blockedBy(settings, { weReplied: type === 'No Response' });
    if (blocked) { await record('client_off', blocked); counts.clientOff++; continue; }
    const steps = allSteps(plan);
    if (!plan.enabled || sent >= steps.length) {
      if (!ctx.dryRun) await at.update(EMAILS, r.id, { [RA.state]: 'Thread Complete', [RA.dueAt]: null, [RA.updatedAt]: new Date().toISOString() });
      await record('complete', plan.enabled ? 'all follow-ups sent' : 'follow-ups are off for this client'); counts.complete++; continue;
    }
    const step = type === 'No Response' ? steps[sent] : { delayDays: 0, guidance: type === 'Out of Office' ? 'They were out of office and should be back now: welcome them back and re-open the open point.' : 'They asked us to check back later and that time has come: say so in a few words and re-open the open point.' };
    const n = sent + 1;

    const now = new Date().toLocaleString('en-US', { timeZone: 'America/New_York', dateStyle: 'full', timeStyle: 'short' });
    const offer = await bookingForDraft(ctx.db, booking, wsRec, r.id);
    const varying = `Now: ${now} ET.\n${offer.text}`;
    const user = [
      `Follow-up ${n} of up to ${steps.length} (${type}). Step instruction: ${step.guidance}`,
      `Campaign: ${val(f[EF.campaign])}`,
      `Prospect: ${val(f[EF.leadName])} at ${val(f[EF.company])}`,
      `Subject: ${val(f[EF.subject])}`,
      `Lead status: ${val(f[EF.leadStatus])}`,
      `\nConversation (oldest first, latest at the end):\n${trimHistory(val(f[EF.history]) || val(f[EF.latestReply]))}`,
      `\nThe prospect's last message:\n${val(f[EF.latestReply])}`,
    ].join('\n');

    const d: Draft = await ctx.paid({
      callKey: `followup:${r.id}:${val(f[RA.dueAt])}`, provider: 'anthropic', units: 1,
      run: () => claude!.structured(DraftSchema, [shared, FOLLOWUP_BRIEF, block], varying, user),
      dryRunResult: () => ({ action: 'skip', intent: 'Other', reason: 'dry run: Claude not called', they_said: '', draft: '', question_for_alex: '', confidence: 0, follow_up_on: '', time_choice: 'none', chosen_time: '' }),
    });

    await ctx.step(`followup-write:${r.id}:${val(f[RA.dueAt])}`, async () => {
      const replyId = Number(val(f[EF.replyId]));
      const typeOff = d.action !== 'skip' && type !== 'No Response' && !typeAllowed(settings, type);
      if (typeOff) d.reason = `${type} follow-ups are switched off for this client (Inbox Manager → Reply types). ${d.reason}`;
      const action = typeOff ? 'skip' : d.action === 'reply' && !(replyId > 0) ? 'ask_alex' : d.action;
      const question = action === 'ask_alex' ? (d.question_for_alex || (replyId > 0 ? d.reason : 'No EmailBison reply ID on this thread: send it by hand in EmailBison.')) : '';
      let decisionId = '';
      // Follow-ups route by the thread's reply type (Out of Office / Check Back Later / the original intent).
      const autoBefore = Number(policy.autoSent ?? 0) || 0;
      const routeIntent = type !== 'No Response' ? type : (val(f[RA.intent]) || d.intent);
      const auto = autoSendDecision(settings, { ...d, action, intent: routeIntent }, autoBefore, cfg.seanAutoSendOn);
      if (!ctx.dryRun) {
        await at.update(EMAILS, r.id, {
          [RA.state]: action === 'skip' ? 'Thread Complete' : 'Needs Approval',
          [RA.draft]: action === 'skip' ? '' : d.draft, [RA.humanAction]: auto.auto ? 'Approve Draft' : 'None', [RA.dueAt]: action === 'skip' ? null : val(f[RA.dueAt]),
          [RA.seanReason]: d.reason, [RA.seanInput]: question, [RA.updatedAt]: new Date().toISOString(),
          ...(wsRec ? { [RA.wsRecord]: wsRec } : {}),
          [RA.policy]: JSON.stringify({ agent: 'sean', kind: 'followup', followupType: type, followupNumber: n, seanFollowupsSent: sent, action, reason: d.reason, they_said: d.they_said, question_for_alex: question, confidence: d.confidence, autoSent: autoBefore + (auto.auto ? 1 : 0), ...(auto.auto ? { auto: true, autoWhy: auto.why } : { reviewWhy: auto.why }), calendarEvidence: { times: offer.times, slots: offer.slots, link: booking.link } }),
        });
        if (auto.auto) {
          if (offer.slots.length) await rememberOffered(ctx.db, wsRec, offer.slots, r.id);
          await logActivity(cfg, { event: `Auto follow-up ${n} queued: ${val(f[EF.leadName]) || 'prospect'} (${client.name})`, type: 'Approved', agent: 'Echo', details: `Client setting: ${auto.why}. ${d.reason}`, jobId: ctx.job.id });
        } else if (action !== 'skip') {
          if (offer.slots.length) await rememberOffered(ctx.db, wsRec, offer.slots, r.id);
          const who = `${val(f[EF.leadName]) || 'prospect'}${val(f[EF.company]) ? ` at ${val(f[EF.company])}` : ''}`;
          decisionId = await at.create(DECISIONS, {
            [DF.title]: action === 'reply' ? `Follow-up ${n} to ${who}` : `Need your input: follow-up ${n} to ${who}`,
            [DF.agent]: 'Echo', [DF.status]: 'New', [DF.client]: client.name, [DF.emailsRecord]: r.id,
            [DF.issue]: `${type === 'No Response' ? 'No answer to our last email' : type}. ${d.they_said}`.trim(),
            [DF.checked]: action === 'ask_alex' ? `${question} (answer it in Airtable: edit the draft, then Send Edited)` : d.reason,
            [DF.fix]: d.draft,
            [DF.details]: `Thread: https://send.dulcy.io/inbox?reply_uuid=${val(f[EF.replyUuid])}\nCampaign: ${val(f[EF.campaign])}\n\nTheir last message:\n${val(f[EF.latestReply]).slice(0, 2500)}`,
            [DF.action]: action === 'reply' ? 'Approve Reply' : 'None',
          });
        }
      }
      await record(action, d.reason, decisionId);
      counts[action as 'reply' | 'skip' | 'ask_alex']++;
      return { decisionId };
    });
  }
  return {
    message: `${recs.length} follow-ups due; ${todo.length} new: ${counts.reply} drafted (Reply Queue + Slack ✅), ${counts.ask_alex} need your input, ${counts.skip} not worth sending (thread closed), ${counts.answered} already answered by the prospect, ${counts.complete} finished${counts.clientOff ? `, ${counts.clientOff} left to the client (Inbox Manager settings)` : ''}${counts.noClientFile ? `, ${counts.noClientFile} skipped (no client file)` : ''}${ctx.dryRun ? ' (dry run: Claude not called, nothing written)' : ''}`,
    due: recs.length, ...counts, dryRun: ctx.dryRun,
  };
};

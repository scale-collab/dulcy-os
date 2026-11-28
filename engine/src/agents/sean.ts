// Echo, the inbox agent (draft mode, Alex 2026-11-24). Every SEAN_EVERY_MIN minutes:
// find interested replies waiting on Dulcy (not client-handled), draft each answer with Claude
// in Alex's voice from the repo's rules, Echo's skill, the client's own file, that client's real
// threads that booked a meeting and the replies Alex approved before. The draft lands on the
// reply's own Airtable row (Reply Queue: Approve / Send Edited) and in Slack (✅ = the same Approve).
// Nothing is sent from here; the reply sender sends after approval.
import { z } from 'zod';
import type { Stage } from '../stages/index.js';
import { PermanentError } from '../errors.js';
import { createAirtableClient, type AirtableClient } from '../providers/airtable.js';
import { createClaude } from '../providers/claude.js';
import { EMAILS, EF, RA, INTENTS, SETTINGS, REPLY_LEARNING, waitingFormula, extraTypeOf, val, wsRecordOf } from './emailsFields.js';
import { clientFileFor, readKnowledge } from './knowledge.js';
import { openTimes, pickTwo, fmtSlot, freeSlots, rememberOffered, offeredTo } from './calendar.js';
import { pickSlot, planBooking, confirmationText, manualText, fallbackText, bookingKey, askReconnect, utcToZoned, type Plan, type BookingPolicy } from './booking.js';
import { DECISIONS, DF } from '../decisions/fields.js';
import { loadSettings, parseSettings, settingsBlock, blockedBy, typeAllowed, autoSendDecision, extraTypeOn, type ClientSettings } from './settings.js';
import { logActivity } from '../activity.js';
import { findPlaceholders } from './placeholders.js';
import { redoOf, redoKey, redoProblem, redoInstruction, redoTitle, pendingDecisionFor } from './redo.js';
import { trackClose, trackTask } from '../hq/agentTasks.js';

export const DraftSchema = z.object({
  action: z.enum(['reply', 'skip', 'ask_alex']),
  intent: z.enum(INTENTS),
  reason: z.string(),
  they_said: z.string(),
  draft: z.string(),
  question_for_alex: z.string(),
  confidence: z.number().min(0).max(100).default(0),
  follow_up_on: z.string().default(''),
  /** Booking (Alex 2026-11-27): did the prospect pick one specific time? The engine checks and books it. */
  time_choice: z.enum(['none', 'accepts_offered', 'proposes_time', 'vague']).default('none'),
  /** The picked time as YYYY-MM-DDTHH:MM in the client's time zone, or empty. */
  chosen_time: z.string().default(''),
});
export type Draft = z.infer<typeof DraftSchema>;

export const SEAN_BRIEF = `You are Echo, Dulcy's inbox manager. Dulcy is a cold email agency run by Alex. You answer prospects who replied to a cold email campaign, for Dulcy itself or for one of Dulcy's clients (the client file below says whose campaign it is and what is true about them). Your one job: move an interested reply to a booked call, the way Alex would.

Decide one action:
- "reply": the thread needs an answer from us now. Write the full email body in "draft".
- "skip": no answer is needed (auto-reply, bounce, unsubscribe or stop, already booked, wrong person with no referral, or the latest message is from our side; out of office and "not interested" too, unless this client's settings below turn on a reply for that type). Leave "draft" empty.
- Out of office, when this client answers those: one or two short lines, no pitch (e.g. no rush, we'll pick this up when you're back). Put their return date in "follow_up_on" (YYYY-MM-DD) when the message gives one.
- "ask_alex": an answer is needed but you are missing a fact, link or file you must not invent (a price that is not in the client file, a guarantee, a custom term, a video or case-study link you were not given, something only the client can confirm). Put the exact question in "question_for_alex" and write your best draft without that fact (a person adds it before sending).
Also classify the latest prospect message as one "intent".

How Alex writes (follow it exactly):
- Plain, direct, warm, human. Short: usually under 60 words, never a wall of text. No corporate filler, no "I hope this finds you well", no "circling back", no "just bumping this", no exclamation-mark enthusiasm.
- Answer what they asked first, in one or two sentences, then one clear next step.
- The next step is a call. Offer two specific dated times when times are given below; otherwise use the client's booking link when one is given below; if neither, ask what their week looks like. Never invent times or links.
- Objections are handled, never accepted at face value: "I need to think about it" gets a genuine "what's the part you're weighing?"-style question, never "sure, take your time". Price questions: answer only with prices the client file approves; otherwise ask_alex. Never promise results, guarantees, case studies or numbers that are not in the client file. Never reuse one client's facts for another.
- Greet by first name when you know it. No signature block or sign-off name (the inbox adds it). Plain text, no markdown, no links unless it is the approved booking link.
- Never write a placeholder of any kind: no [link], [video link for …], [Your name], [GAP: …], {{first_name}}, {FIRST_NAME} or <insert …>. Every draft must be ready to send exactly as written. If something you need is missing, use "ask_alex" and ask for it in "question_for_alex" instead.
- If the prospect asked to stop or unsubscribe anywhere in the latest message, the action is "skip".
- Real examples follow: this client's threads that reached a booked meeting, and replies Alex approved. Copy how they move to a call, not their facts.

When the prospect agrees a time (Dulcy books it for them):
- "time_choice": "accepts_offered" when the latest message accepts one specific time we offered (e.g. "Wednesday at 5 works"); "proposes_time" when they give their own specific day and hour; "vague" when they want a call but name no exact day and hour ("sometime next week", "Tuesday works" with no hour, "afternoons are good"); otherwise "none".
- For accepts_offered and proposes_time, put that exact time in "chosen_time" as YYYY-MM-DDTHH:MM in the client's time zone (given below with "Now"), working the date out from "Now" and the times we offered before. If they name another time zone, convert it to the client's. If you cannot tell the exact day and hour, use "vague".
- For accepts_offered and proposes_time, write "draft" as if that time has just been taken: one short "that time just got taken" line and the two "Times to offer" below. The engine checks the client's calendar live; if the time is open it books it and sends its own short confirmation instead of your draft.
- For "vague", offer the two "Times to offer" (never book a time they did not name).

Fill every field: "reason" (one line: why this action), "they_said" (one line: what the prospect said), "draft" (email body or empty), "question_for_alex" (or empty), "follow_up_on" (YYYY-MM-DD or empty), "confidence" (0-100: how sure you are this exact draft is right to send with no person checking it; under 90 if anything is uncertain).`;

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
export interface Booking { slots: string[]; tz: string; link: string }

/** The times to offer this prospect (not offered to anyone else lately) and the line for Claude. */
export async function bookingForDraft(db: Parameters<typeof freeSlots>[0], b: Booking, wsRec: string, emailRecord: string): Promise<{ slots: string[]; times: string[]; text: string }> {
  const slots = b.slots.length ? pickTwo(await freeSlots(db, wsRec, b.slots, emailRecord), b.tz) : [];
  const times = slots.map((s) => fmtSlot(s, b.tz));
  const text = times.length ? `Times to offer (from the client's own calendar, free and not offered to anyone else): ${times.join(' or ')}.`
    : b.link ? `No open calendar time to offer: use this booking link: ${b.link}` : 'No calendar and no booking link for this client: ask what their week looks like.';
  return { slots, times, text };
}

/** Booking options for a workspace from its settings: live slots from the client's connected calendar, else the saved booking link. */
export async function bookingFor(cfg: Parameters<typeof openTimes>[0], st: ClientSettings, wsRec: string): Promise<Booking> {
  const open = st.disableTimes ? null : await openTimes(cfg, wsRec);
  return { slots: open?.slots ?? [], tz: open?.timezone ?? (st.found ? st.office.tz : 'America/New_York'), link: st.disableLinks ? '' : st.calendarLink };
}

/** Only the named sections (## / ### headings) of a markdown file, in file order. */
export function sections(md: string, keep: RegExp): string {
  const parts = md.split(/\n(?=#{2,3} )/);
  return parts.filter((p) => keep.test(p.split('\n')[0])).join('\n');
}

/**
 * The knowledge every Echo call shares, first replies and follow-ups alike (cached once by Claude,
 * Alex 2026-11-25: best replies, no paying to reload what a reply never uses). Focused on email
 * replies: skill, playbooks, real reply data, creator methods, rules, promise contract, and only the
 * sales-method parts a reply needs (beliefs, objections, follow-up). The call-only parts of the sales
 * course and the old Drive SOP notes are left out. The brief (first reply vs follow-up) is a separate
 * cached block after this one.
 */
export function sharedKnowledge(dir: string): string {
  const closers = sections(readKnowledge(dir, 'skills/cole-sales-closing/references/closers-methods.md'), /^#{2,3} (2\.1|2\.6|2\.7)\b/);
  return [
    `# Echo skill\n${readKnowledge(dir, 'skills/echo-reply-handling/SKILL.md')}`,
    `# Reply decisions\n${readKnowledge(dir, 'skills/echo-reply-handling/references/reply-decision.md')}\n${readKnowledge(dir, 'skills/echo-reply-handling/references/decision-playbook.md')}`,
    `# What worked before (real reply data)\n${readKnowledge(dir, 'skills/echo-reply-handling/references/historical-patterns.md')}`,
    `# Methods from the creators we follow\n${readKnowledge(dir, 'skills/echo-reply-handling/references/creator-methods.md')}`,
    `# Sales method: beliefs, objections, follow-up\n${closers}`,
    `# Standing rules (newest wins)\n${readKnowledge(dir, 'rules/RULES.md')}\n${readKnowledge(dir, 'rules/client-promise-contract.md')}`,
  ].join('\n\n---\n\n');
}

export const seanDraftStage: Stage = async (ctx) => {
  const cfg = ctx.cfg;
  if (!cfg.airtableApiKey) throw new PermanentError('no AIRTABLE_API_KEY on the server');
  const at = createAirtableClient({ apiKey: cfg.airtableApiKey, baseId: cfg.airtableBaseId, baseUrl: cfg.airtableBaseUrl });
  const days = Number(ctx.job.input.days ?? cfg.seanDays) || 14;
  const max = Number(ctx.job.input.max ?? cfg.seanMaxPerRun) || 20;

  const read = [...Object.values(EF), RA.clients, RA.wsRecord, RA.policy, RA.intent];
  // "Have Echo redo it" (HQ): this one pending draft only, drafted again with two times.
  const redo = redoOf(ctx.job.input);
  let recs: Awaited<ReturnType<typeof at.list>>, todo: typeof recs;
  if (redo) {
    const one = await at.get(EMAILS, redo, [...read, RA.state, RA.humanAction, RA.draft, RA.updatedAt, RA.ownership]);
    const why = one ? redoProblem(one.fields, 'reply') : 'the thread is gone';
    if (why) { await trackClose(ctx.db, redoKey(redo), `Not redone: ${why}`); return { message: `Redo not done: ${why}`, redo, drafted: 0 }; }
    recs = [one!]; todo = recs;
  } else {
    // Interested-type replies first; out-of-office / not-interested ones after (drafted only where the client turns them on).
    const main = await at.list(EMAILS, waitingFormula(days), read, 200);
    const seen = new Set(main.map((r) => r.id));
    recs = [...main, ...(await at.list(EMAILS, waitingFormula(days, true), read, 200)).filter((r) => !seen.has(r.id))];
    const done = new Set((await ctx.db.query(`SELECT email_record || '|' || reply_at AS k FROM sean_drafts WHERE action <> 'dry_run'`)).rows.map((r: any) => String(r.k)));
    todo = recs.filter((r) => !done.has(`${r.id}|${val(r.fields[EF.latestReplyAt])}`)).slice(0, max);
  }
  if (!todo.length) return { message: `${recs.length} waiting replies, none new`, waiting: recs.length, drafted: 0 };

  const dir = cfg.knowledgeDir;
  const shared = sharedKnowledge(dir);

  const claude = ctx.dryRun ? null : createClaude({ apiKey: cfg.anthropicApiKey, model: cfg.claudeModel, baseURL: cfg.anthropicBaseUrl });
  const perClient = new Map<string, { block: string; booking: Booking; settings: ClientSettings }>();
  const counts = { reply: 0, skip: 0, ask_alex: 0, auto: 0, noClientFile: 0, clientOff: 0, typeOff: 0 };

  for (const r of todo) {
    const f = r.fields;
    const replyAt = val(f[EF.latestReplyAt]);
    // A redo is logged under its own key, so the normal run's "already drafted" list is unchanged.
    const logKey = redo ? `redo:${replyAt}:${val(f[RA.updatedAt])}` : replyAt;
    const ws = Number(val(f[EF.workspace]));
    const wsRec = wsRecordOf(f);
    const client = clientFileFor(dir, ws);
    if (!client) { counts.noClientFile++; if (redo) await trackClose(ctx.db, redoKey(redo), 'Not redone: no client file for this workspace'); continue; }
    if (!perClient.has(String(ws))) {
      const settings = ctx.dryRun ? parseSettings(null) : await loadSettings(at, wsRec);
      perClient.set(String(ws), {
        block: [`# Client file: ${client.name}\n${client.text}`, settingsBlock(settings, 'reply'), ctx.dryRun ? '' : await realExamples(at, ws, wsRec)].filter(Boolean).join('\n\n'),
        booking: ctx.dryRun ? { slots: [], tz: 'America/New_York', link: '' } : await bookingFor(cfg, settings, wsRec),
        settings,
      });
    }
    const { block, booking, settings } = perClient.get(String(ws))!;
    // The client's own controls in the Inbox Manager: switched off, or the client answers its own replies.
    const extra = extraTypeOf(f);
    const blocked = blockedBy(settings, { weReplied: !!val(f[RA.sentAt]) })
      || (extra && !extraTypeOn(settings, extra) ? `${extra} replies are not answered for this client (Inbox Manager settings)` : '');
    if (blocked) {
      await ctx.db.query(`INSERT INTO sean_drafts (email_record, reply_at, action, reason) VALUES ($1,$2,$3,$4) ON CONFLICT DO NOTHING`, [r.id, logKey, ctx.dryRun ? 'dry_run' : 'client_off', blocked]);
      if (redo) await trackClose(ctx.db, redoKey(redo), `Not redone: ${blocked}`);
      if (extra && !blockedBy(settings, { weReplied: !!val(f[RA.sentAt]) })) counts.typeOff++; else counts.clientOff++;
      continue;
    }
    const now = new Date().toLocaleString('en-US', { timeZone: 'America/New_York', dateStyle: 'full', timeStyle: 'short' });
    const offer = await bookingForDraft(ctx.db, booking, wsRec, r.id);
    // What "Wednesday at 5 works" refers to: the times already offered to this prospect.
    const tz = booking.tz;
    const earlier = await offeredTo(ctx.db, wsRec, r.id);
    const varying = [
      `Now: ${now} ET. The client's time zone is ${tz}; there it is ${utcToZoned(new Date().toISOString(), tz)} (${new Date().toLocaleDateString('en-US', { timeZone: tz, weekday: 'long' })}).`,
      offer.text,
      earlier.length ? `Times we offered this prospect before (as YYYY-MM-DDTHH:MM in the client's time zone): ${earlier.map((s) => `${fmtSlot(s, tz)} = ${utcToZoned(s, tz)}`).join('; ')}.` : '',
    ].filter(Boolean).join('\n');
    const user = [
      `Campaign: ${val(f[EF.campaign])}`,
      `Prospect: ${val(f[EF.leadName])} at ${val(f[EF.company])}`,
      `Subject: ${val(f[EF.subject])}`,
      `Lead status: ${val(f[EF.leadStatus])}`,
      `\nConversation (oldest first, latest at the end):\n${trimHistory(val(f[EF.history]) || val(f[EF.latestReply]))}`,
      `\nLatest message from the prospect:\n${val(f[EF.latestReply])}`,
      ...(redo ? [redoInstruction(val(f[RA.draft]))] : []),
    ].join('\n');

    const d: Draft = await ctx.paid({
      callKey: redo ? `redo:${r.id}:${replyAt}:${val(f[RA.updatedAt])}` : `draft:${r.id}:${replyAt}`, provider: 'anthropic', units: 1,
      run: () => claude!.structured(DraftSchema, [shared, SEAN_BRIEF, block], varying, user),
      dryRunResult: () => ({ action: 'skip', intent: 'Other', reason: 'dry run (sean.draft not in LIVE_STAGES): Claude not called', they_said: '', draft: '', question_for_alex: '', confidence: 0, follow_up_on: '', time_choice: 'none', chosen_time: '' }),
    });

    // Placeholder guard (Alex 2026-11-27): a draft with "[link]" / "{{first_name}}" is never a plain
    // reply (so never auto-sent): it becomes "Need your input" with the question to fill it.
    const unfilled = d.action === 'skip' ? [] : findPlaceholders(d.draft);
    if (unfilled.length) {
      d.action = 'ask_alex';
      d.question_for_alex = d.question_for_alex || `What should replace ${unfilled.slice(0, 3).join(', ')} in Echo's draft?`;
      d.reason = `The draft has a placeholder (${unfilled[0]}): replace it before sending. ${d.reason}`;
    }

    // The prospect picked one specific time: check it and the client's calendar live (Alex 2026-11-27).
    let plan: Plan = { kind: 'none' };
    if (!ctx.dryRun && d.action === 'reply' && (d.time_choice === 'accepts_offered' || d.time_choice === 'proposes_time')) {
      const pick = pickSlot({ choice: d.time_choice, chosenLocal: d.chosen_time, tz, offered: earlier, prospectText: val(f[EF.latestReply]), office: settings.office });
      plan = await planBooking(cfg, wsRec, pick, tz);
    }

    // A redo that Echo now thinks needs no reply leaves the old draft as it was (a person decides).
    if (redo && d.action === 'skip') {
      if (ctx.dryRun) await trackTask(ctx.db, { agent: 'Echo', key: redoKey(redo), title: redoTitle(val(f[EF.leadName]) || val(f[EF.leadEmail]), val(f[EF.company])), status: 'open', note: 'Dry run (sean.draft is not in LIVE_STAGES): nothing redrafted' });
      else await trackClose(ctx.db, redoKey(redo), `Not redone: Echo now thinks no reply is needed (${d.reason.slice(0, 160)}); the old draft is unchanged`);
      counts.skip++;
      continue;
    }

    await ctx.step(`${redo ? 'redo-write' : 'write'}:${r.id}:${replyAt}`, async () => {
      const replyId = Number(val(f[EF.replyId]));
      const typeOff = d.action !== 'skip' && !typeAllowed(settings, d.intent);
      if (typeOff) d.reason = `${d.intent} replies are switched off for this client (Inbox Manager → Reply types). ${d.reason}`;
      const action = typeOff ? 'skip' : d.action === 'reply' && !(replyId > 0) ? 'ask_alex' : d.action;
      const question = action === 'ask_alex' ? (d.question_for_alex || (replyId > 0 ? d.reason : 'No EmailBison reply ID on this thread: send it by hand in EmailBison.')) : '';
      let decisionId = '';
      // Booking: open and bookable → the short confirmation (sent only after the booking); no booking
      // possible → "I'll send the invite over" for a person; taken / unclear → Claude's draft with 2 new times.
      const name = val(f[EF.leadName]);
      const fallbackDraft = d.draft.trim() || fallbackText(name, offer.times, booking.link);
      const live = action === 'reply' ? plan : { kind: 'none' as const };
      const draftText = live.kind === 'book' ? confirmationText(name, live.long, live.provider) : live.kind === 'manual' ? manualText(name, live.long) : live.kind === 'retime' ? fallbackDraft : d.draft;
      if (live.kind === 'retime') d.reason = `They picked ${live.label || 'a time'}, but ${live.why}: offering two other times. ${d.reason}`;
      if (live.kind === 'manual') d.reason = `They picked ${live.label}; Echo can't book it (${live.why}): a person sends the invite. ${d.reason}`;
      if (live.kind === 'book') d.reason = `They picked ${live.label}; it is open on the client's calendar (checked live). Approve = book it, then send the confirmation. ${d.reason}`;
      const bookingPolicy: BookingPolicy | null = live.kind === 'book' ? {
        status: 'pending', key: bookingKey(r.id, replyAt, live.start), wsRec, start: live.start, tz: live.tz, label: live.label, long: live.long,
        provider: live.provider, offered: live.offered, fallbackDraft,
      } : null;
      // The client's own send mode (Default Mode / OOO Mode / routing / confidence / max automatic).
      const autoBefore = (() => { try { return Number(JSON.parse(val(f[RA.policy]) || '{}').autoSent ?? 0) || 0; } catch { return 0; } })();
      const auto = redo ? { auto: false, why: 'a redo always waits for a person' } : live.kind === 'manual' ? { auto: false, why: 'a person has to send the calendar invite' } : autoSendDecision(settings, { ...d, action, draft: draftText }, autoBefore, cfg.seanAutoSendOn);
      if (live.kind === 'manual' && live.reconnect && !ctx.dryRun) await askReconnect(ctx.db, client.name, wsRec, live.why);
      const offersTimes = live.kind !== 'book' && live.kind !== 'manual';
      if (!ctx.dryRun) {
        const eventId = wsRec && replyId > 0 ? `bison:${wsRec}:${replyId}` : '';
        // The reply's own row: what the Reply Queue page shows and approves.
        await at.update(EMAILS, r.id, {
          [RA.state]: action === 'skip' ? 'Skipped' : 'Needs Approval',
          [RA.intent]: d.intent, [RA.draft]: action === 'skip' ? '' : draftText, [RA.humanAction]: auto.auto ? 'Approve Draft' : 'None',
          [RA.seanReason]: d.reason, [RA.seanInput]: question, [RA.updatedAt]: new Date().toISOString(),
          ...(wsRec ? { [RA.wsRecord]: wsRec } : {}),
          ...(eventId ? { [RA.eventId]: eventId, [RA.lastInboundEventId]: eventId } : {}),
          [RA.policy]: JSON.stringify({ agent: 'sean', action, reason: d.reason, they_said: d.they_said, question_for_alex: question, latestReplyAt: replyAt, confidence: d.confidence, ...(/^\d{4}-\d{2}-\d{2}$/.test(d.follow_up_on) ? { followUpOn: d.follow_up_on } : {}), autoSent: autoBefore + (auto.auto ? 1 : 0), ...(auto.auto ? { auto: true, autoWhy: auto.why } : { reviewWhy: auto.why }), calendarEvidence: { times: offersTimes ? offer.times : [], slots: offersTimes ? offer.slots : [], link: booking.link }, ...(bookingPolicy ? { booking: bookingPolicy } : {}), ...(live.kind === 'manual' ? { inviteByHand: { start: live.start, label: live.label, why: live.why } } : {}) }),
        });
        if (auto.auto) {
          // Sent by the engine sender inside the client's office hours; no approval card.
          if (offersTimes && offer.slots.length) await rememberOffered(ctx.db, wsRec, offer.slots, r.id);
          await logActivity(cfg, { event: `${bookingPolicy ? `Auto-booking queued (${bookingPolicy.label})` : 'Auto-reply queued'}: ${val(f[EF.leadName]) || 'prospect'} (${client.name})`, type: 'Approved', agent: 'Echo', details: `Client setting: ${auto.why}. ${d.reason}`, jobId: ctx.job.id });
        } else if (action !== 'skip') {
          if (offersTimes && offer.slots.length) await rememberOffered(ctx.db, wsRec, offer.slots, r.id);
          const who = `${val(f[EF.leadName]) || 'prospect'}${val(f[EF.company]) ? ` at ${val(f[EF.company])}` : ''}`;
          const card = {
            // One card does both, in order: book, then send (Alex 2026-11-27).
            [DF.title]: bookingPolicy ? `Book ${bookingPolicy.label} + send confirmation: ${who}` : live.kind === 'manual' && action === 'reply' ? `Reply to ${who} + send the invite by hand (${live.label})`
              : action === 'reply' ? `Reply to ${who}` : `Need your input: reply to ${who}`,
            [DF.agent]: 'Echo', [DF.status]: 'New', [DF.client]: client.name, [DF.emailsRecord]: r.id,
            [DF.issue]: d.they_said,
            [DF.checked]: action === 'ask_alex' ? `${question} (answer it in HQ: edit the draft, then Send edited)`
              : bookingPolicy ? `${d.reason} If the time is gone when you approve, nothing is booked or sent and a draft with two other times comes back.`
                : live.kind === 'manual' ? `${d.reason} After approving, send the calendar invite for ${live.long} yourself.` : d.reason,
            [DF.fix]: draftText,
            [DF.details]: `Thread: https://send.dulcy.io/inbox?reply_uuid=${val(f[EF.replyUuid])}\nCampaign: ${val(f[EF.campaign])}\n\nLatest message:\n${val(f[EF.latestReply]).slice(0, 2500)}`,
            [DF.action]: action === 'reply' ? 'Approve Reply' : 'None',
          };
          // A redo updates the thread's pending card (one card per thread); otherwise a new card.
          const pending = redo ? await pendingDecisionFor(at, r.id) : '';
          if (pending) { await at.update(DECISIONS, pending, card); decisionId = pending; } else decisionId = await at.create(DECISIONS, card);
        }
      }
      await ctx.db.query(`INSERT INTO sean_drafts (email_record, reply_at, action, reason, decision_id) VALUES ($1,$2,$3,$4,$5) ON CONFLICT (email_record, reply_at) DO UPDATE SET action = EXCLUDED.action, reason = EXCLUDED.reason, decision_id = EXCLUDED.decision_id WHERE sean_drafts.action = 'dry_run'`,
        [r.id, logKey, ctx.dryRun ? 'dry_run' : action, d.reason.slice(0, 500), decisionId || null]);
      if (redo) {
        if (ctx.dryRun) await trackTask(ctx.db, { agent: 'Echo', key: redoKey(redo), title: redoTitle(val(f[EF.leadName]) || val(f[EF.leadEmail]), val(f[EF.company])), status: 'open', note: 'Dry run (sean.draft is not in LIVE_STAGES): nothing redrafted' });
        else await trackClose(ctx.db, redoKey(redo), offersTimes && offer.times.length >= 2 ? `Redrafted with two times: ${offer.times.slice(0, 2).join(' or ')}. Waiting for approval.` : `Redrafted, but ${client.name}'s calendar gave no two open times: check the new draft. Waiting for approval.`);
      }
      counts[action as 'reply' | 'skip' | 'ask_alex']++;
      if (auto.auto) counts.auto++;
      return { decisionId };
    });
  }
  return {
    message: `${recs.length} waiting replies; ${todo.length} new: ${counts.reply} drafted (Reply Queue + Slack ✅)${counts.auto ? ` of which ${counts.auto} auto-send (client settings)` : ''}, ${counts.ask_alex} need your input, ${counts.skip} no reply needed${counts.clientOff ? `, ${counts.clientOff} left to the client (Inbox Manager settings)` : ''}${counts.typeOff ? `, ${counts.typeOff} out-of-office / not-interested not answered for that client (setting off)` : ''}${counts.noClientFile ? `, ${counts.noClientFile} skipped (no client file for the workspace)` : ''}${ctx.dryRun ? ' (dry run: Claude not called, nothing written)' : ''}`,
    waiting: recs.length, ...counts, dryRun: ctx.dryRun,
  };
};

// The one reply sender (Alex 2026-11-24): every workspace, from the Airtable reply row.
// Approve in Airtable (Human Action = Approve Draft / Send Edited Reply) or ✅ in Slack (which
// sets that same Human Action): the engine sends once, with the client's CC/BCC, then updates
// the row and the Slack thread. Skips mirror the same way. Same checks as the Airtable
// "Send Email" button: thread unchanged, the one prospect as To, sender not the prospect.
import type { Stage } from '../stages/index.js';
import type { Db } from '../db/pool.js';
import type { Config } from '../config.js';
import type { AirtableClient } from '../providers/airtable.js';
import type { SlackClient } from '../providers/slack.js';
import { NeedsReviewError, PermanentError } from '../errors.js';
import { createAirtableClient } from '../providers/airtable.js';
import { createSlackClient } from '../providers/slack.js';
import { bisonFor } from '../providers/emailbison.js';
import { enqueue } from '../queue.js';
import { STAGES } from '../stages/index.js';
import { EMAILS, EF, RA, SETTINGS, REPLY_LEARNING, val, wsRecordOf } from './emailsFields.js';
import { DECISIONS, DF } from '../decisions/fields.js';
import { armFields, parsePlan, policyOf, shouldArm } from './followups.js';
import { loadSettings, inOfficeHours, type ClientSettings } from './settings.js';

const STOP = /\b(unsubscribe|remove me|take me off|stop emailing|do not contact)\b/i;
const DONE_STATES = ['Sent', 'Sending', 'Suppressed', 'Thread Complete'];
const READ = [...Object.values(EF), ...Object.values(RA)];

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
export const toHtml = (text: string) => text.trim().split(/\n{2,}/).map((p) => `<p>${esc(p).replace(/\n/g, '<br>')}</p>`).join('');
const emails = (v: unknown) => String(v ?? '').split(/[;,\s]+/).map((x) => x.trim().toLowerCase()).filter((x) => /^[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+$/.test(x));

/** CC/BCC from the workspace's "CC BCC Settings JSON" (same rules as the Airtable button). */
export function workspaceCopies(settingsJson: string, replyType: string): { cc: string[]; bcc: string[] } {
  if (!settingsJson) return { cc: [], bcc: [] };
  let c: any;
  try { c = JSON.parse(settingsJson); } catch { throw new PermanentError('workspace CC/BCC settings are not valid JSON; fix them in the Reply Agent settings'); }
  const norm = (x: string) => {
    const k = String(x ?? '').trim().toLowerCase().replace(/[_-]+/g, ' ').replace(/\s+/g, ' ');
    const alias: Record<string, string> = { 'positive reply': 'interested', positive: 'interested', 'meeting requested': 'meeting request', 'meeting booked': 'meeting request', ooo: 'out of office', 'information request': 'info request', referral: 'referred', 'follow up later': 'check back later' };
    return alias[k] ?? k;
  };
  const include = (kind: 'cc' | 'bcc') => {
    const scope = c[`${kind}Scope`] || 'all';
    if (scope === 'all') return true;
    const types = Array.isArray(c[`${kind}Types`]) ? c[`${kind}Types`] : [];
    return types.map(norm).includes(norm(replyType));
  };
  const cc = c.ccEnabled === true && include('cc') ? emails([c.cc].flat().join(',')) : [];
  const bcc = c.bccEnabled === true && include('bcc') ? emails([c.bcc].flat().join(',')) : [];
  if (c.ccEnabled === true && include('cc') && !cc.length) throw new PermanentError('Auto CC is on for this client but has no address');
  if (c.bccEnabled === true && include('bcc') && !bcc.length) throw new PermanentError('Auto BCC is on for this client but has no address');
  return { cc, bcc };
}

function slackFor(cfg: Config) { return cfg.slackBotToken ? createSlackClient({ token: cfg.slackBotToken, baseUrl: cfg.slackBaseUrl }) : null; }

/** Close this reply's open Slack decision with a note (sent / skipped / failed), so Slack matches Airtable. */
export async function mirrorToSlack(at: Pick<AirtableClient, 'list' | 'update'>, slack: Pick<SlackClient, 'post'> | null, emailsRecordId: string, status: 'Done' | 'Rejected' | 'Failed', note: string) {
  // A later success or skip also closes an earlier Failed decision (e.g. a retry after the draft was fixed).
  const states = ["{Status}='New'", "{Status}='Waiting'", "{Status}='Approved'", ...(status === 'Failed' ? [] : ["{Status}='Failed'"])];
  const open = await at.list(DECISIONS, `AND({Emails Record}='${emailsRecordId}',OR(${states.join(',')}))`, Object.values(DF), 10);
  for (const d of open) {
    await at.update(DECISIONS, d.id, { [DF.status]: status, [DF.result]: note });
    const ch = val(d.fields[DF.slackChannel]), ts = val(d.fields[DF.slackTs]);
    if (slack && ch && ts) await slack.post(ch, note, ts);
  }
}

export const replySendStage: Stage = async (ctx) => {
  const cfg = ctx.cfg;
  if (!cfg.airtableApiKey) throw new PermanentError('no AIRTABLE_API_KEY on the server');
  const at = createAirtableClient({ apiKey: cfg.airtableApiKey, baseId: cfg.airtableBaseId, baseUrl: cfg.airtableBaseUrl });
  const recId = String(ctx.job.input.emailsRecordId ?? '');
  const rec = await at.get(EMAILS, recId, READ);
  if (!rec) throw new PermanentError(`reply row ${recId} not found`);
  const f = rec.fields;
  const action = val(f[RA.humanAction]);
  const via = String(ctx.job.input.via ?? 'Airtable');
  const policy = policyOf(f);
  const isFollowup = policy.kind === 'followup';
  const fail = async (msg: string) => {
    if (!ctx.dryRun) {
      await at.update(EMAILS, recId, { [RA.lastError]: msg, [RA.humanAction]: 'None', [RA.state]: 'Needs Approval', [RA.updatedAt]: new Date().toISOString() });
      await mirrorToSlack(at, slackFor(cfg), recId, 'Failed', `:x: Not sent: ${msg}`);
    }
    return new NeedsReviewError(msg);
  };

  if (!['Approve Draft', 'Send Edited Reply'].includes(action)) return { message: `nothing to send (Human Action is "${action || 'None'}")` };
  if (DONE_STATES.includes(val(f[RA.state]))) return { message: `already ${val(f[RA.state])}; nothing sent again` };
  if (val(f[RA.ownership]) === 'Handoff' || f[EF.clientHandling] === true) throw await fail('the client handles this thread; Dulcy does not send here');
  const body = (action === 'Send Edited Reply' ? val(f[RA.customReply]) : val(f[RA.draft])).trim();
  if (!body) throw await fail(`${action === 'Send Edited Reply' ? 'Custom Reply' : 'the draft'} is empty`);
  if (/\[GAP|\{\{|\{[^{}]*\|[^{}]*\}/.test(body)) throw await fail('the reply still has a [GAP] marker or a placeholder; edit it first');
  if (STOP.test(val(f[EF.latestReply]))) throw await fail('the prospect asked to stop; nothing sent');
  if (!isFollowup && val(f[EF.lastSent]) === 'Last Email Sent By Dulcy') throw await fail('someone already answered this thread from our side');
  if (isFollowup && val(f[EF.lastSent]) === 'Last Email Sent By Prospect' && val(policy.followupType) === 'No Response') throw await fail('the prospect answered since; this needs a reply, not a follow-up');
  const latest = Date.parse(val(f[EF.latestReplyAt])), drafted = Date.parse(val(f[RA.updatedAt]));
  if (action === 'Approve Draft' && Number.isFinite(latest) && Number.isFinite(drafted) && latest > drafted + 60_000) throw await fail('the prospect wrote again after this draft; it needs a redraft');

  const ws = Number(val(f[EF.workspace])), replyId = Number(val(f[EF.replyId]));
  if (!(ws > 0) || !(replyId > 0)) throw await fail('this row has no EmailBison workspace or reply ID');
  const bison = bisonFor(cfg, cfg.bounceCheckKey, ws);

  const thread = await bison.conversationThread(replyId);
  const cur = thread.current_reply;
  if (!cur || Number(cur.id) !== replyId) throw await fail('EmailBison thread does not match this row');
  const to = String(cur.from_email_address ?? '').trim().toLowerCase();
  // A reply answers the prospect's latest message: nothing may follow it. A follow-up comes after
  // our own emails, so only a newer message from the prospect stops it.
  const fromProspect = (m: any) => String(m?.from_email_address ?? '').trim().toLowerCase() === to;
  if (isFollowup ? thread.newer_messages.some(fromProspect) : thread.newer_messages.length) throw await fail(isFollowup ? 'the prospect wrote again; this needs a reply, not a follow-up' : 'there are newer messages in the thread; refresh and redraft');
  if (isFollowup && Number.isFinite(drafted) && thread.newer_messages.some((m: any) => !fromProspect(m) && Date.parse(String(m?.date_received ?? '')) > drafted)) throw await fail('someone already followed up in this thread after the draft');
  const senderEmailId = Number(cur.sender_email_id ?? val(f[RA.emailStatsId]) ?? 0);
  if (!emails(to).length || !(senderEmailId > 0)) throw await fail('the thread has no prospect address or sending inbox');
  const sender = await bison.senderEmail(senderEmailId);
  if (sender.email && sender.email === to) throw await fail('the To address is our own inbox');

  const wsRec = wsRecordOf(f);
  const settings = wsRec ? (await at.list(SETTINGS, `{Workspace Record ID}='${wsRec}'`, ['CC BCC Settings JSON', 'Follow-up Plan JSON'], 2, { byName: true })) : [];
  if (settings.length > 1) throw await fail('this client has two Reply Agent settings rows; keep one');
  const eventMatches = val(f[RA.eventId]) === `bison:${wsRec}:${replyId}`;
  const replyType = eventMatches && val(f[RA.intent]) ? val(f[RA.intent]) : val(f[EF.leadStatus]);
  let copies: { cc: string[]; bcc: string[] };
  try { copies = workspaceCopies(val(settings[0]?.fields['CC BCC Settings JSON']), replyType); } catch (e) { throw await fail((e as Error).message); }
  const cc = [...new Set([...emails(f[RA.ccOptional]), ...copies.cc])].filter((e) => e !== to && e !== sender.email);
  const bcc = [...new Set(copies.bcc)].filter((e) => e !== to && e !== sender.email && !cc.includes(e));

  if (ctx.dryRun) return { message: `Dry run: would send to ${to.replace(/^(.).*@/, '$1***@')}${cc.length ? ` (cc ${cc.length})` : ''}${bcc.length ? ` (bcc ${bcc.length})` : ''}; reply.send is not in LIVE_STAGES`, dryRun: true };

  await at.update(EMAILS, recId, { [RA.state]: 'Sending', [RA.updatedAt]: new Date().toISOString() });
  const sent = await ctx.paid({
    callKey: `reply:${replyId}`, provider: 'emailbison', units: 0, scope: 'record',
    run: () => bison.replyTo(replyId, { html: toHtml(body), senderEmailId, to: { name: val(f[EF.leadName]) || String(cur.from_name ?? ''), email: to }, cc, bcc }),
    dryRunResult: () => ({ id: 0, folder: 'dry_run' }),
  });
  if (!(sent.id > 0)) throw new NeedsReviewError('EmailBison accepted the reply but returned no message ID; check the thread in EmailBison before anything else');

  const now = new Date().toISOString();
  // Arm the next follow-up (Alex: keep following up until they answer or say stop), or close the thread.
  const sentFollowups = isFollowup ? (Number(policy.seanFollowupsSent ?? 0) || 0) + 1 : 0;
  const arm = armFields(parsePlan(val(settings[0]?.fields['Follow-up Plan JSON'])), sentFollowups, new Date(now), shouldArm(f));
  // Out of office with a return date: the first follow-up waits until the day after they're back.
  const back = Date.parse(`${String(policy.followUpOn ?? '')}T14:00:00Z`);
  if (!isFollowup && arm[RA.state] === 'Scheduled' && Number.isFinite(back) && back + 86_400_000 > Date.parse(String(arm[RA.dueAt]))) arm[RA.dueAt] = new Date(back + 86_400_000).toISOString();
  await at.update(EMAILS, recId, {
    ...arm, [RA.sentAt]: now, [RA.policy]: JSON.stringify({ ...policy, seanFollowupsSent: sentFollowups }), [RA.humanAction]: 'None', [RA.draft]: '', [RA.customReply]: '', [RA.lastError]: '', [RA.updatedAt]: now,
    [EF.lastSent]: 'Last Email Sent By Dulcy',
    ...(['', 'New Interested'].includes(val(f[EF.stage])) ? { [EF.stage]: 'In Conversation' } : {}),
  });
  // Learning: what Sean drafted vs what went out (approved by a person), read by Sean next time.
  // Automatic sends are not a person's approval, so they never become "Reply Alex approved" examples.
  if (policy.auto !== true) try {
    await at.create(REPLY_LEARNING, {
      'Workspace Record ID': wsRec, 'Email Record ID': recId, Situation: isFollowup ? 'Follow-up' : 'Interested', 'Prospect Message': val(f[EF.latestReply]).slice(0, 5000),
      'AI Draft': val(f[RA.draft]), 'Approved Reply': body, 'Review Status': 'Approved', Outcome: 'Unknown', Source: `Engine sender (${via})`,
    });
  } catch (e) { await ctx.log('reply learning row not written', { err: String((e as Error).message) }, 'warn'); }
  const nextNote = arm[RA.state] === 'Scheduled' ? ` Next follow-up drafted ${new Date(String(arm[RA.dueAt])).toLocaleDateString('en-US', { timeZone: 'America/New_York', weekday: 'short', month: 'short', day: 'numeric' })} if they don't answer.` : arm[RA.state] === 'Thread Complete' ? ' That was the last follow-up.' : '';
  await mirrorToSlack(at, slackFor(cfg), recId, 'Done', `:white_check_mark: Sent (approved in ${via}${action === 'Send Edited Reply' ? ', edited' : ''}).${nextNote}`);
  return { message: `Sent to the prospect${cc.length ? ` with ${cc.length} cc` : ''}${bcc.length ? ` and ${bcc.length} bcc` : ''}.${nextNote}`, sentReplyId: sent.id, next: arm[RA.state] };
};

/**
 * Every tick: queue a send for each approved row (when the engine sender is on), and mirror
 * skips and replies sent elsewhere into Slack.
 */
export async function repliesTick(db: Db, cfg: Config, at: Pick<AirtableClient, 'list' | 'update'>, slack: Pick<SlackClient, 'post'> | null): Promise<{ queued: number; skipped: number; closed: number }> {
  let queued = 0, skipped = 0, closed = 0;
  if (cfg.replySenderOn) {
    const approved = await at.list(EMAILS, `AND(OR({Dulcy Reply Agent Human Action}='Approve Draft',{Dulcy Reply Agent Human Action}='Send Edited Reply'),NOT(OR(${DONE_STATES.map((s) => `{Dulcy Reply Agent State}='${s}'`).join(',')})))`,
      [RA.humanAction, RA.updatedAt, EF.latestReplyAt, RA.policy, RA.clients, RA.wsRecord], 20);
    const office = new Map<string, ClientSettings>();
    for (const r of approved) {
      const def = STAGES['reply.send'];
      // Automatic sends (client settings) go out inside the client's office hours only; approvals by a person go now.
      if (policyOf(r.fields).auto === true) {
        const wsRec = wsRecordOf(r.fields);
        if (!office.has(wsRec)) office.set(wsRec, await loadSettings(at, wsRec));
        if (!inOfficeHours(office.get(wsRec)!.office)) continue;
      }
      const via = policyOf(r.fields).auto === true ? 'auto-send, client settings' : (await at.list(DECISIONS, `AND({Emails Record}='${r.id}',{Status}='Approved')`, [DF.status], 1)).length ? 'Slack' : 'Airtable';
      const q = await enqueue(db, {
        kind: 'reply.send', recordId: r.id, input: { emailsRecordId: r.id, via },
        requestId: `send:${r.id}:${val(r.fields[RA.humanAction])}:${val(r.fields[RA.updatedAt])}:${val(r.fields[EF.latestReplyAt])}`,
        dryRun: cfg.dryRun && !cfg.liveStages.includes('reply.send'), maxAttempts: def.maxAttempts, deadlineMs: def.deadlineMs,
      });
      if (q.status === 'queued') queued++;
    }
  }
  // Skip pressed in Airtable (or ❌ in Slack): mark the row skipped and close the Slack decision.
  for (const r of await at.list(EMAILS, `{Dulcy Reply Agent Human Action}='Skip'`, [RA.humanAction], 20)) {
    await at.update(EMAILS, r.id, { [RA.state]: 'Skipped', [RA.humanAction]: 'None', [RA.updatedAt]: new Date().toISOString() });
    await mirrorToSlack(at, slack, r.id, 'Rejected', ':no_entry_sign: Skipped in Airtable. Nothing sent.');
    skipped++;
  }
  // Answered some other way (the old Send Email button, EmailBison by hand): close the Slack decision.
  const waiting = await at.list(DECISIONS, `AND({Emails Record}!='',OR({Status}='New',{Status}='Waiting'))`, [DF.emailsRecord], 50);
  if (waiting.length) {
    const ids = [...new Set(waiting.map((d) => val(d.fields[DF.emailsRecord])).filter(Boolean))];
    const rows = await at.list(EMAILS, `OR(${ids.map((id) => `RECORD_ID()='${id}'`).join(',')})`, [EF.lastSent, RA.state, RA.policy], 50);
    for (const row of rows) {
      // A follow-up waiting for approval always has "Last Email Sent By Dulcy": that is not an answer.
      const pendingFollowup = policyOf(row.fields).kind === 'followup' && val(row.fields[RA.state]) === 'Needs Approval';
      if (!pendingFollowup && (val(row.fields[EF.lastSent]) === 'Last Email Sent By Dulcy' || val(row.fields[RA.state]) === 'Sent')) {
        await mirrorToSlack(at, slack, row.id, 'Done', ':white_check_mark: Answered in Airtable / EmailBison. Nothing more to do here.');
        closed++;
      }
    }
  }
  return { queued, skipped, closed };
}

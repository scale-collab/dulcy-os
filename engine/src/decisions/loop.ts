// Decisions loop. An agent (or a person) adds a row to Airtable "Decisions" with Status New.
// Every tick the engine:
//  1. posts New rows to Slack (short: issue / checked / fix, details in the thread) → Waiting;
//  2. reads ✅/❌ reactions from the approvers on Waiting rows → Approved / Rejected;
//  3. starts the action of Approved rows (Status can also be set to Approved in Airtable by hand);
//  4. writes the action's result back (Done / Failed) and replies in the Slack thread.
import type { Db } from '../db/pool.js';
import type { Config } from '../config.js';
import type { AirtableClient, AirtableRecord } from '../providers/airtable.js';
import type { SlackClient } from '../providers/slack.js';
import { enqueue } from '../queue.js';
import { STAGES } from '../stages/index.js';
import { DECISIONS, DF } from './fields.js';
import { EMAILS } from '../agents/emailsFields.js';
import { RA } from '../agents/emailsFields.js';

const YES = new Set(['white_check_mark', 'heavy_check_mark', 'ballot_box_with_check', '+1']);
const NO = new Set(['x', 'negative_squared_cross_mark', 'no_entry', 'no_entry_sign', '-1']);
const NAMES: Record<string, string> = { U070Z26377C: 'Alex', U0ADSEJ9SDR: 'Josh' };
const ACTIONS: Record<string, string> = { 'Send Reply': 'decision.send_reply', 'Resume Campaign': 'bounce.fix', 'Remove Inboxes and Resume': 'bounce.fix', 'Approve Purchase': 'account.approve_purchase', 'Approve Campaign Plan': 'campaign.plan_approved', 'Approve Contact Sample': 'campaign.contacts_approved', 'Approve Campaign Copy': 'campaign.copy_approved' };
const ALL = Object.values(DF);

const text = (v: unknown) => (v === undefined || v === null ? '' : typeof v === 'object' ? String((v as any).name ?? '') : String(v)).trim();

/** The Slack message: one fact per line, the long part goes in the thread. */
export function decisionMessage(r: AirtableRecord): string {
  const f = r.fields;
  const reply = text(f[DF.action]) === 'Approve Reply';
  const client = text(f[DF.client]).replace(/^Client:\s*/i, '');
  const quote = (t: string) => t.split('\n').map((l) => `> ${l}`).join('\n');
  // One block per fact with a blank line between, so it reads at a glance on a phone.
  const blocks = [`*${text(f[DF.agent]) || 'Agent'}${client ? ` · ${client}` : ''}*\n${text(f[DF.title])}`];
  if (text(f[DF.issue])) blocks.push(`*${reply ? 'They said' : 'Issue'}:* ${text(f[DF.issue])}`);
  if (text(f[DF.checked])) blocks.push(`*${reply ? 'Why' : 'Checked'}:* ${text(f[DF.checked])}`);
  if (text(f[DF.fix])) blocks.push(reply || text(f[DF.fix]).includes('\n') ? `*${reply ? 'Draft reply' : 'Proposed'}:*\n${quote(text(f[DF.fix]))}` : `*Proposed:* ${text(f[DF.fix])}`);
  if (reply) blocks.push('✅ send it   ·   ❌ skip it');
  else if (text(f[DF.action]) && text(f[DF.action]) !== 'None') blocks.push(`*On ✅:* ${text(f[DF.action])}`);
  return blocks.join('\n\n');
}

export async function decisionsTick(db: Db, cfg: Config, at: Pick<AirtableClient, 'list' | 'update'>, slack: Pick<SlackClient, 'post' | 'reactions' | 'react'>): Promise<{ posted: number; decided: number; started: number; finished: number }> {
  let posted = 0, decided = 0, started = 0, finished = 0;
  const now = () => new Date().toISOString();

  // 1. Post New rows. A row that already has a Slack TS was posted (the status write was lost): never post twice.
  for (const r of await at.list(DECISIONS, `{Status}='New'`, ALL, 20)) {
    if (text(r.fields[DF.slackTs])) { await at.update(DECISIONS, r.id, { [DF.status]: 'Waiting' }); continue; }
    const m = await slack.post(cfg.slackDecisionsChannel, decisionMessage(r));
    await at.update(DECISIONS, r.id, { [DF.slackChannel]: m.channel, [DF.slackTs]: m.ts, [DF.status]: 'Waiting' });
    if (text(r.fields[DF.details])) await slack.post(m.channel, text(r.fields[DF.details]), m.ts);
    // Pre-add ✅ and ❌ so a decision is one tap. Only approvers' taps count (the bot's own never do).
    // Without the reactions:write scope this is skipped; reacting by hand still works.
    for (const name of ['white_check_mark', 'x']) {
      try { await slack.react(m.channel, m.ts, name); } catch (e) { console.error(JSON.stringify({ level: 'warn', message: 'could not pre-add reaction (add reactions:write to the Slack app)', err: String(e) })); break; }
    }
    posted++;
  }

  // 2. Read reactions on Waiting rows. ❌ wins if an approver put both.
  for (const r of await at.list(DECISIONS, `{Status}='Waiting'`, ALL, 100)) {
    const ch = text(r.fields[DF.slackChannel]), ts = text(r.fields[DF.slackTs]);
    if (!ch || !ts) continue;
    const reacts = await slack.reactions(ch, ts);
    const by = (set: Set<string>) => reacts.filter((x) => set.has(x.name)).flatMap((x) => x.users).find((u) => cfg.slackApprovers.includes(u));
    const no = by(NO), yes = by(YES);
    const who = no ?? yes;
    if (!who) continue;
    await at.update(DECISIONS, r.id, { [DF.status]: no ? 'Rejected' : 'Approved', [DF.decidedBy]: NAMES[who] ?? who, [DF.decidedAt]: now() });
    decided++;
    // Sean's replies: Slack presses the same button as Airtable (one sender, sends once).
    const emailsRecord = text(r.fields[DF.emailsRecord]);
    if (text(r.fields[DF.action]) === 'Approve Reply' && emailsRecord) {
      await at.update(EMAILS, emailsRecord, { [RA.humanAction]: no ? 'Skip' : 'Approve Draft' });
      if (!no) await at.update(DECISIONS, r.id, { [DF.result]: `Approved in Slack by ${NAMES[who] ?? who}: sending` });
    }
    if (no) await slack.post(ch, `Stopped. Nothing done (${NAMES[who] ?? who}).`, ts);
  }

  // 3 + 4. Approved rows: start the action once, then write its result.
  for (const r of await at.list(DECISIONS, `{Status}='Approved'`, ALL, 50)) {
    const action = text(r.fields[DF.action]);
    if (action === 'Approve Reply') continue; // the reply sender sends and closes it
    const kind = ACTIONS[action];
    const ch = text(r.fields[DF.slackChannel]), ts = text(r.fields[DF.slackTs]);
    const say = async (msg: string) => { if (ch && ts) await slack.post(ch, msg, ts); };
    if (!kind) {
      await at.update(DECISIONS, r.id, { [DF.status]: 'Done', [DF.result]: action && action !== 'None' ? `Unknown action "${action}": nothing done` : 'Approved (no automatic action)' });
      finished++;
      continue;
    }
    const requestId = `decision:${r.id}`;
    const job = (await db.query(`SELECT id, status, result, error FROM jobs WHERE request_id=$1`, [requestId])).rows[0];
    if (!job) {
      let input: Record<string, unknown>;
      try { input = JSON.parse(text(r.fields[DF.actionInput]) || '{}'); } catch {
        await at.update(DECISIONS, r.id, { [DF.status]: 'Failed', [DF.result]: 'Action Input is not valid JSON: nothing done' });
        await say(':x: Action Input is not valid JSON: nothing done.');
        finished++;
        continue;
      }
      const def = STAGES[kind];
      await enqueue(db, { kind, recordId: r.id, input, requestId, dryRun: cfg.dryRun && !cfg.liveStages.includes(kind), maxAttempts: def.maxAttempts, deadlineMs: def.deadlineMs });
      await at.update(DECISIONS, r.id, { [DF.result]: 'Queued' });
      started++;
      continue;
    }
    if (!['succeeded', 'failed', 'needs_review'].includes(job.status)) continue;
    const ok = job.status === 'succeeded';
    const msg = ok ? String(job.result?.message ?? 'Done') : `${job.status === 'needs_review' ? 'Needs review' : 'Failed'}: ${job.error ?? 'unknown error'}`;
    await at.update(DECISIONS, r.id, { [DF.status]: ok ? 'Done' : 'Failed', [DF.result]: msg });
    await say(`${ok ? ':white_check_mark:' : ':x:'} ${msg}`);
    finished++;
  }
  return { posted, decided, started, finished };
}

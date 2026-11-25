// HQ Decisions: the pending Airtable Decisions (Status New or Waiting) in the Daily Run piles, and
// Approve / Reject exactly as the Daily Run deck does it: Status Approved/Rejected, Decided By,
// Decided At; for "Approve Reply" with an Emails record, Emails Dulcy Reply Agent Human Action is
// set first ("Approve Draft" / "Skip") so the engine's reply sender sends exactly once. The engine's
// decisions loop then runs the approved action, the same as a ✅ in Slack.
import type { AirtableClient, AirtableRecord } from '../providers/airtable.js';
import { DECISIONS, DF } from '../decisions/fields.js';
import { EMAILS, RA } from '../agents/emailsFields.js';
import { OWNER_ONLY, PILES, pileFor, type Pile } from './agents.js';
import { canonAgent } from '../activity.js';

export type HqAirtable = Pick<AirtableClient, 'list' | 'get' | 'create' | 'update'>;

export interface DecisionCard {
  id: string; title: string; agent: string; client: string; pile: Pile; status: string;
  isReply: boolean; issue: string; checked: string; fix: string; details: string; action: string; created: string;
  /** Echo reply cards: the EmailBison thread link and the prospect's latest message (from Details). */
  threadUrl: string; latestMessage: string; canEdit: boolean;
}

/** "Thread: <url>" and "Latest message:" / "Their last message:" from a Echo decision's Details. Pure. */
export function replyContext(details: string): { threadUrl: string; latestMessage: string } {
  const url = /^Thread:\s*(https:\/\/\S+)/m.exec(details)?.[1] ?? '';
  const latest = /(?:^|\n)(?:Latest message|Their last message):\s*\n([\s\S]*)$/.exec(details)?.[1]?.trim() ?? '';
  return { threadUrl: url, latestMessage: latest };
}

const text = (v: unknown): string => (v === undefined || v === null ? '' : Array.isArray(v) ? v.map(text).filter(Boolean).join(', ') : typeof v === 'object' ? String((v as any).name ?? '') : String(v)).trim();
const PENDING = ['New', 'Waiting'];
const FIELDS = [DF.title, DF.agent, DF.status, DF.client, DF.issue, DF.checked, DF.fix, DF.details, DF.action, DF.emailsRecord, DF.decidedBy, DF.decidedAt];

export function toCard(r: AirtableRecord): DecisionCard {
  const f = r.fields;
  const agent = canonAgent(text(f[DF.agent]));
  const isReply = text(f[DF.action]) === 'Approve Reply';
  const ctx = isReply ? replyContext(text(f[DF.details])) : { threadUrl: '', latestMessage: '' };
  return {
    ...ctx, canEdit: isReply && /^rec[A-Za-z0-9]{14}$/.test(text(f[DF.emailsRecord])),
    id: r.id, title: text(f[DF.title]) || 'Decision', agent, client: text(f[DF.client]).replace(/^Client:\s*/i, ''), pile: pileFor(agent), status: text(f[DF.status]),
    isReply, issue: text(f[DF.issue]), checked: text(f[DF.checked]), fix: text(f[DF.fix]), details: text(f[DF.details]),
    action: text(f[DF.action]), created: r.createdTime ?? '',
  };
}

/** Pending decisions, oldest first within the pile order Replies, Campaigns, Fixes, Money, Other. */
export async function pendingDecisions(at: Pick<HqAirtable, 'list'>): Promise<DecisionCard[]> {
  const rows = await at.list(DECISIONS, `OR({Status}='New',{Status}='Waiting')`, FIELDS, 300);
  return rows.map(toCard).filter((c) => PENDING.includes(c.status))
    .sort((a, b) => PILES.indexOf(a.pile) - PILES.indexOf(b.pile) || a.created.localeCompare(b.created));
}

export function groupByPile(cards: DecisionCard[], canSeeMoney: boolean): Record<Pile, DecisionCard[]> {
  const out = Object.fromEntries(PILES.map((p) => [p, [] as DecisionCard[]])) as Record<Pile, DecisionCard[]>;
  for (const c of cards) if (canSeeMoney || (c.pile !== 'Money' && !OWNER_ONLY.includes(c.agent))) out[c.pile].push(c);
  if (!canSeeMoney) delete (out as Partial<Record<Pile, DecisionCard[]>>).Money;
  return out;
}

/** approve = ✅ (a reply: send the draft as is) · edited = send the edited reply text · reject = ❌ (a reply: Skip). */
export type Verdict = 'approve' | 'reject' | 'edited';

/**
 * Approve or reject one decision. Refuses one that is no longer pending (decided elsewhere).
 * Echo's replies: only the Emails row's buttons are pressed (Approve Draft / Send Edited Reply with the
 * text in Custom Reply / Skip); the engine's reply sender sends and closes the decision.
 */
export async function decide(at: Pick<HqAirtable, 'get' | 'update'>, id: string, verdict: Verdict, decidedBy: string, opts: { canSeeMoney: boolean; editedText?: string }, now = new Date()): Promise<{ status: number; error?: string; result?: string }> {
  if (!/^rec[A-Za-z0-9]{14}$/.test(id)) return { status: 400, error: 'not a decision id' };
  const r = await at.get(DECISIONS, id, FIELDS);
  if (!r) return { status: 404, error: 'decision not found' };
  const card = toCard(r);
  if (!opts.canSeeMoney && (card.pile === 'Money' || OWNER_ONLY.includes(card.agent))) return { status: 403, error: 'only the owner decides money and content' };
  if (!PENDING.includes(card.status)) return { status: 409, error: `already ${card.status || 'decided'}` };
  const emailRec = text(r.fields[DF.emailsRecord]);
  let edited = verdict === 'edited' ? String(opts.editedText ?? '').replace(/\r\n/g, '\n').trim() : '';
  if (verdict === 'edited') {
    if (!card.canEdit) return { status: 400, error: 'only a reply draft can be edited' };
    if (!edited || edited.length > 20_000) return { status: 400, error: 'the edited reply is empty or too long' };
    if (edited === card.fix.trim()) { verdict = 'approve'; edited = ''; } // unchanged: send the draft
  }
  const status = verdict === 'reject' ? 'Rejected' : 'Approved';
  if (card.isReply && /^rec[A-Za-z0-9]{14}$/.test(emailRec)) {
    // Echo's reply drafts: the same buttons the Reply Queue uses, so the engine sends exactly once.
    await at.update(EMAILS, emailRec, verdict === 'edited'
      ? { [RA.customReply]: edited, [RA.humanAction]: 'Send Edited Reply' }
      : { [RA.humanAction]: verdict === 'approve' ? 'Approve Draft' : 'Skip' });
  }
  await at.update(DECISIONS, id, { [DF.status]: status, [DF.decidedBy]: decidedBy, [DF.decidedAt]: now.toISOString() });
  return { status: 200, result: verdict === 'edited' ? 'Approved (edited)' : status };
}

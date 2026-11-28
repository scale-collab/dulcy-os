// "Have Echo redo it" (HQ Inbox → Old drafts with a link, Alex 2026-11-28): Echo redrafts one pending
// draft that offered a booking link, with two specific times from the client's calendar. The normal
// drafting stages (sean.draft for replies, sean.followup for follow-ups) run it with input { redo }.
// A redo never sends and never auto-sends: the new draft waits for Josh or Alex like any other.
import type { AirtableClient } from '../providers/airtable.js';
import { DECISIONS, DF } from '../decisions/fields.js';
import { EF, RA, val } from './emailsFields.js';

/** The task on Echo's list for one redo (one per thread). */
export const redoKey = (rec: string) => `echo-redo:${rec}`;
/** The record id a job was asked to redo ('' = a normal run). */
export const redoOf = (input: Record<string, unknown>): string => (typeof input?.redo === 'string' && /^rec[A-Za-z0-9]{14}$/.test(input.redo) ? input.redo : '');

const policyOf = (f: Record<string, unknown>): Record<string, any> => { try { const j = JSON.parse(val(f[RA.policy]) || '{}'); return j && typeof j === 'object' ? j : {}; } catch { return {}; } };

/** Why this Emails row can't be redone by this stage ('' = it can). Pure. */
export function redoProblem(f: Record<string, unknown>, stage: 'reply' | 'followup'): string {
  if (val(f[RA.state]) !== 'Needs Approval') return `it is not waiting for approval (state ${val(f[RA.state]) || 'empty'})`;
  if (!['', 'None'].includes(val(f[RA.humanAction]))) return `someone already pressed ${val(f[RA.humanAction])}`;
  if (f[EF.clientHandling] === true || val(f[RA.ownership]) === 'Handoff') return 'the client handles this thread';
  const followup = policyOf(f).kind === 'followup';
  if (stage === 'reply' && followup) return 'it is a follow-up (sean.followup redoes those)';
  if (stage === 'followup' && !followup) return 'it is a reply, not a follow-up (sean.draft redoes those)';
  if (stage === 'reply' && val(f[EF.lastSent]) === 'Last Email Sent By Dulcy') return 'someone already answered this thread from our side; skip the draft instead';
  return '';
}

/**
 * The redo's draft goes on the thread's existing pending Echo decision when there is one (one card
 * per thread, not two). Returns that decision's id ('' = none: the caller creates one).
 */
export async function pendingDecisionFor(at: Pick<AirtableClient, 'list'>, emailRec: string): Promise<string> {
  const rows = await at.list(DECISIONS, `AND({Emails Record}='${emailRec}',OR({Status}='New',{Status}='Waiting'))`, [DF.emailsRecord, DF.status], 5);
  return rows.find((d) => val(d.fields[DF.emailsRecord]) === emailRec && ['New', 'Waiting'].includes(val(d.fields[DF.status])))?.id ?? '';
}

/** The extra instruction a redo adds to Echo's prompt. Pure. */
export function redoInstruction(oldDraft: string): string {
  return `\nRedo (asked in HQ): Echo's earlier draft for this thread offered a booking link instead of two specific times. Write it again following Alex's rule: offer the two specific times listed above from the client's calendar; use the booking link only if no times are listed or the prospect asked for a link. Keep what was right in the earlier draft, never add a [GAP] or placeholder, and invent nothing.\nEarlier draft:\n${String(oldDraft ?? '').slice(0, 3000)}`;
}

/** The task title (the same from HQ and from the stage, so a stage update never renames it). Pure. */
export const redoTitle = (prospect: string, company = '') => `Redo the draft for ${prospect || 'the prospect'}${company ? ` (${company})` : ''}: two real times, not a link`.slice(0, 200);

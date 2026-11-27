// Airtable "Emails" table (reply threads), base appxqINt5XKw7a76A. IDs checked 2026-11-24.
export const EMAILS = 'tblADFhWhTcLrl1UY';
export const EF = {
  leadEmail: 'fldVkWkLFCGP9O1Aw', phone: 'fld8K4zasLt6aaRfB', leadName: 'fldQAcnN9PrbL7R81', company: 'fldRYOE8NaSKxs9tB', subject: 'fldNdJB5rvVpf8V9M',
  latestReply: 'fldjG76LvUTv60Pzj', history: 'fldYocEhrAzRUw9sA', latestReplyAt: 'fldb1GEPgDTyJPm2v', lastSent: 'fldE9bxKtmeRsvG9f',
  leadStatus: 'fldr2uNiscZfeCNiT', intent: 'fldSgiv4CLnRBEJGc', stage: 'fldSuQyvPM3IlS5oD', workspace: 'fldCjo0mB0snziNZQ',
  campaign: 'fldEv7oM5BJPKJpiR', replyId: 'fldvARFWnr4H2wC8V', replyUuid: 'fldT2Nvl3qPmSMsgb', clientHandling: 'fldztj8riBd1MHclA', dnc: 'fldbme5e9wDtnVwrx',
} as const;

/** The Reply Agent fields the Airtable Reply Queue and the senders use (same names as the old n8n agent). */
export const RA = {
  state: 'fldOfNaPJfpJLcInm', intent: 'fldSgiv4CLnRBEJGc', draft: 'fldiokFlOaUEEs2qX', policy: 'fldkfrqE1Xng2mftd', humanAction: 'fldvdJBtL4ez5lbjN',
  wsRecord: 'fldaSgBchAb4KiIZS', eventId: 'fldIe5tgtL4OVeJAj', lastInboundEventId: 'fldy284s0aaXCZaa7', senderEmailId: 'fld2MljJektQP13d4',
  sentAt: 'fldbsojFueApMnmSy', lastError: 'fldiM9YjXlyojPSpk', updatedAt: 'fldTn2Eth51XolDMg', ownership: 'fldtWgoLnMFX7DFj8',
  customReply: 'fldCfgm35ZqyVe9xm', clients: 'fldtPAlC0MDPHTWcl', emailStatsId: 'flds1ZqBq2ZW6dVBr', ccOptional: 'fldGkiO630UgVCnv5',
  seanReason: 'fldoRsrNu5VGArdmV', seanInput: 'fldRLOKZdWYkgZjgU',
  dueAt: 'fldgqdIguhudcKI8Z', followupType: 'fldDB9nVzj6mSprZP',
} as const;
/**
 * How the system already records a booked meeting on the Emails row (checked 2026-11-27 in
 * airtable/SCHEMA.md and the automation exports): Opportunity Status = WON is what GHL two-way and
 * people set; the Airtable automation "Webhook to Make for WON" (wfljdbk1BZXSmpGZI) then sets Pipeline
 * Stage = Booked Meeting, tags the EmailBison lead "Meeting Booked", adds 1 to the Campaign's Meetings
 * Booked and fires Make "[9.0 CLIENT] Booked Meetings" (Slack + client notification). Date of Call
 * Booked = the call's day (Call Feedback Sync writes it too). Meeting Booked At = when it was booked
 * (read by Ada, Atlas, HQ and the portal).
 */
export const BK = { opportunity: 'fldfPPfvAoXw04LVs', callDate: 'fldTFmYUnIXPxgJQS', meetingBookedAt: 'fld7kOIDWTVycZtdA' } as const;
export const INTENTS = ['Interested', 'Info Request', 'Meeting Request', 'Cost Objection', 'Process Objection', 'Not Interested', 'Do Not Contact', 'Out of Office', 'Check Back Later', 'Referred', 'Wrong Person', 'Automatic Reply', 'Other'] as const;
/** Per-workspace Reply Agent settings (CC/BCC, booking link, calendar preferences). Read by field name. */
export const SETTINGS = 'tbl5nmzPUcNEBSWxH';
export const REPLY_LEARNING = 'tblSnh6YlMTOFSE8l';
/** Plain value of a select / text / lookup cell. */
export const val = (v: unknown): string => (Array.isArray(v) ? val(v[0]) : v === undefined || v === null ? '' : typeof v === 'object' ? String((v as any).name ?? (v as any).id ?? '') : String(v)).trim();
/** Workspace record ID of a thread (Clients Table link, else the Reply Agent field). */
export const wsRecordOf = (f: Record<string, unknown>): string => {
  const link = f[RA.clients];
  const fromLink = Array.isArray(link) ? (typeof link[0] === 'string' ? link[0] : (link[0] as any)?.id) : '';
  return String(fromLink || val(f[RA.wsRecord]) || '');
};

/**
 * Threads where the prospect wrote last, Dulcy owns the thread, in the last N days.
 * Default: interested-type replies. extra = out-of-office and not-interested replies (Echo drafts
 * those only for clients whose Reply Agent settings turn them on, Alex 2026-11-25).
 */
export function waitingFormula(days: number, extra = false): string {
  const any = (field: string, vals: string[]) => `OR(${vals.map((v) => `{${field}}='${v}'`).join(',')})`;
  const types = extra
    ? `OR(${any('Lead Status', ['Out Of Office', 'Not Interested'])},${any('Dulcy Reply Agent Intent', ['Out of Office', 'Not Interested'])})`
    : `OR(${any('Lead Status', ['Interested', 'Meeting Request', 'Info Request', 'Information Request'])},${any('Dulcy Reply Agent Intent', ['Interested', 'Info Request', 'Meeting Request', 'Cost Objection', 'Process Objection'])})`;
  return `AND({Last Email Sent}='Last Email Sent By Prospect',NOT({Client Handling}),NOT({DNC}),{Reply Ownership}!='Handoff',`
    + `IS_AFTER({Latest Reply Time},DATEADD(NOW(),-${Math.max(1, Math.floor(days))},'days')),`
    + `${types},`
    + `NOT(${any('Pipeline Stage', ['Booked Meeting', 'Completed Meeting', 'Closed Deal', 'Closed -- Not Moving Forward', 'Lost'])}))`;
}

/** Out-of-office / not-interested type of a thread ('' = an interested-type thread). */
export function extraTypeOf(f: Record<string, unknown>): '' | 'Out of Office' | 'Not Interested' {
  const intent = val(f[RA.intent]), status = val(f[EF.leadStatus]);
  if (['Interested', 'Info Request', 'Meeting Request', 'Cost Objection', 'Process Objection'].includes(intent)) return '';
  if (['Interested', 'Meeting Request', 'Info Request', 'Information Request'].includes(status) && !intent) return '';
  if (intent === 'Out of Office' || status === 'Out Of Office') return 'Out of Office';
  if (intent === 'Not Interested' || status === 'Not Interested') return 'Not Interested';
  return '';
}

// Airtable "Emails" table (reply threads), base appxqINt5XKw7a76A. IDs checked 2026-11-24.
export const EMAILS = 'tblADFhWhTcLrl1UY';
export const EF = {
  leadEmail: 'fldVkWkLFCGP9O1Aw', leadName: 'fldQAcnN9PrbL7R81', company: 'fldRYOE8NaSKxs9tB', subject: 'fldNdJB5rvVpf8V9M',
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

/** Interested threads where the prospect wrote last, Dulcy owns the thread, in the last N days. */
export function waitingFormula(days: number): string {
  const any = (field: string, vals: string[]) => `OR(${vals.map((v) => `{${field}}='${v}'`).join(',')})`;
  return `AND({Last Email Sent}='Last Email Sent By Prospect',NOT({Client Handling}),NOT({DNC}),{Reply Ownership}!='Handoff',`
    + `IS_AFTER({Latest Reply Time},DATEADD(NOW(),-${Math.max(1, Math.floor(days))},'days')),`
    + `OR(${any('Lead Status', ['Interested', 'Meeting Request', 'Info Request', 'Information Request'])},${any('Dulcy Reply Agent Intent', ['Interested', 'Info Request', 'Meeting Request', 'Cost Objection', 'Process Objection'])}),`
    + `NOT(${any('Pipeline Stage', ['Booked Meeting', 'Completed Meeting', 'Closed Deal', 'Closed -- Not Moving Forward', 'Lost'])}))`;
}

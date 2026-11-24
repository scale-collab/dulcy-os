// Airtable "Emails" table (reply threads), base appxqINt5XKw7a76A. IDs checked 2026-11-24.
export const EMAILS = 'tblADFhWhTcLrl1UY';
export const EF = {
  leadEmail: 'fldVkWkLFCGP9O1Aw', leadName: 'fldQAcnN9PrbL7R81', company: 'fldRYOE8NaSKxs9tB', subject: 'fldNdJB5rvVpf8V9M',
  latestReply: 'fldjG76LvUTv60Pzj', history: 'fldYocEhrAzRUw9sA', latestReplyAt: 'fldb1GEPgDTyJPm2v', lastSent: 'fldE9bxKtmeRsvG9f',
  leadStatus: 'fldr2uNiscZfeCNiT', intent: 'fldSgiv4CLnRBEJGc', stage: 'fldSuQyvPM3IlS5oD', workspace: 'fldCjo0mB0snziNZQ',
  campaign: 'fldEv7oM5BJPKJpiR', replyId: 'fldvARFWnr4H2wC8V', replyUuid: 'fldT2Nvl3qPmSMsgb', clientHandling: 'fldztj8riBd1MHclA', dnc: 'fldbme5e9wDtnVwrx',
} as const;

/** Interested threads where the prospect wrote last, Dulcy owns the thread, in the last N days. */
export function waitingFormula(days: number): string {
  const any = (field: string, vals: string[]) => `OR(${vals.map((v) => `{${field}}='${v}'`).join(',')})`;
  return `AND({Last Email Sent}='Last Email Sent By Prospect',NOT({Client Handling}),NOT({DNC}),{Reply Ownership}!='Handoff',`
    + `IS_AFTER({Latest Reply Time},DATEADD(NOW(),-${Math.max(1, Math.floor(days))},'days')),`
    + `OR(${any('Lead Status', ['Interested', 'Meeting Request', 'Info Request', 'Information Request'])},${any('Dulcy Reply Agent Intent', ['Interested', 'Info Request', 'Meeting Request', 'Cost Objection', 'Process Objection'])}),`
    + `NOT(${any('Pipeline Stage', ['Booked Meeting', 'Completed Meeting', 'Closed Deal', 'Closed -- Not Moving Forward', 'Lost'])}))`;
}

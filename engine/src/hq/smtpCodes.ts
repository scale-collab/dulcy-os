// HQ round 2 (Alex, 2026-11-27): bounce codes as the SMTP reply codes Alex knows (550, 551, 552,
// 553, 554, 421, 450, 451, 452…), with the enhanced 5.x.x / 4.x.x code only as small detail.
// Rule (RULES.md "HQ round 2 rules"): soft bounce = any 4xx; hard = 5xx.
//   - The 3-digit code comes from the bounce notice ("550 5.1.1 …") or the Emails "Bounce Code" field.
//   - When only the enhanced code is known, it is mapped onto the 3-digit code most servers send with
//     it (approximate; marked `mapped`). Pure, no I/O.

/** Plain meaning of each 3-digit SMTP reply code. */
export const SMTP_MEANING: Record<string, string> = {
  '421': 'Server busy or refusing for now (try later)',
  '450': 'Mailbox unavailable right now (greylisted or busy)',
  '451': 'Temporary server error (try later)',
  '452': 'Mailbox full or too many messages (for now)',
  '454': 'Temporary authentication / TLS problem',
  '500': 'Command not understood',
  '501': 'Bad address syntax',
  '503': 'Bad command sequence',
  '521': 'Server does not accept mail',
  '530': 'Authentication required',
  '550': 'Mailbox unavailable (does not exist, or rejected)',
  '551': 'User not here (moved)',
  '552': 'Mailbox full or message too big',
  '553': 'Address not allowed (bad address)',
  '554': 'Rejected (spam / policy)',
  '571': 'Blocked (policy)',
};
/** Plain meaning of the common enhanced codes (shown with the 3-digit code). */
export const ENHANCED_MEANING: Record<string, string> = {
  '5.1.0': 'Address does not exist', '5.1.1': 'Address does not exist', '5.1.2': 'Domain does not exist', '5.1.3': 'Bad address format',
  '5.1.6': 'Mailbox moved', '5.1.10': 'Address does not exist (Microsoft)', '5.2.1': 'Mailbox disabled', '5.2.2': 'Mailbox full', '5.2.3': 'Message too big',
  '5.3.4': 'Message too big', '5.4.1': 'Recipient rejected (no such address / access denied)', '5.4.4': 'Domain cannot be reached',
  '5.7.0': 'Blocked (policy)', '5.7.1': 'Blocked (spam / policy)', '5.7.26': 'Blocked: sender not authenticated (SPF / DKIM / DMARC)',
  '5.7.27': 'Blocked: sender domain has no mail setup', '5.7.509': 'Blocked: DMARC failed', '5.7.606': 'Blocked: sending IP on a blocklist', '5.7.708': 'Blocked: sending IP not trusted (Microsoft)',
  '4.2.0': 'Mailbox busy', '4.2.1': 'Mailbox disabled for now', '4.2.2': 'Mailbox full (for now)', '4.3.0': 'Temporary server error', '4.4.1': 'No answer from the server',
  '4.4.2': 'Connection dropped', '4.4.7': 'Gave up delivering (expired)', '4.7.0': 'Temporarily blocked (rate / reputation)', '4.7.1': 'Greylisted / temporarily blocked',
};

/** The 3-digit code an enhanced code usually comes with. Approximate. Pure. */
export function basicOfEnhanced(enh: string): string {
  const m = /^([45])\.(\d{1,3})\.(\d{1,3})$/.exec(enh);
  if (!m) return '';
  const [, c, sub, det] = m;
  const k = `${sub}.${det}`;
  if (c === '5') {
    if (sub === '1') return k === '1.6' ? '551' : ['1.3', '1.7', '1.8'].includes(k) ? '553' : '550';
    if (sub === '2') return ['2.2', '2.3'].includes(k) ? '552' : '550';
    if (k === '3.4') return '552';
    if (k === '4.1') return '550';
    if (sub === '7') return '554';
    return '554';
  }
  if (sub === '2') return k === '2.2' ? '452' : '450';
  if (sub === '4') return k === '4.7' ? '451' : '421';
  if (sub === '7') return k === '7.0' ? '421' : k === '7.1' ? '450' : '451';
  if (sub === '1') return '450';
  return '451';
}

export interface SmtpCode {
  /** The 3-digit code, the main label ("550"), or "Unknown". */ code: string;
  /** The enhanced code as detail ("5.1.1"), or "". */ enhanced: string;
  /** True when the 3-digit code was mapped from the enhanced one (not in the notice). */ mapped: boolean;
  /** Plain meaning (the enhanced code's when known, else the 3-digit code's). */ meaning: string;
  /** Soft = any 4xx; hard = 5xx; null = unknown. */ soft: boolean | null;
}

/** Read the codes from a notice text and the Airtable "Bounce Code" field. Pure. */
export function smtpOf(text: string, field = ''): SmtpCode {
  const t = String(text ?? '');
  const enhanced = /\b([45]\.\d{1,3}\.\d{1,3})\b/.exec(t)?.[1] ?? '';
  // A 3-digit code right before a space/dash, or at the start ("550-5.1.1", "550 5.7.1", "status=550").
  const inText = /(?:^|[^\d.])([245]\d\d)(?=[ -]|$)/.exec(t.replace(/\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/g, ' '))?.[1] ?? '';
  const fromField = /^[45]\d\d$/.test(String(field).trim()) ? String(field).trim() : '';
  const fromText = /^[45]/.test(inText) ? inText : '';
  // The text's own class must agree with the enhanced code's (a 250 or a stray number is not it).
  let code = fromText && (!enhanced || enhanced[0] === fromText[0]) ? fromText : '';
  if (!code && fromField && (!enhanced || enhanced[0] === fromField[0])) code = fromField;
  let mapped = false;
  if (!code && enhanced) { code = basicOfEnhanced(enhanced); mapped = !!code; }
  if (!code) code = fromField || 'Unknown';
  const meaning = ENHANCED_MEANING[enhanced] ?? SMTP_MEANING[code] ?? (code[0] === '4' ? 'Temporary failure' : code[0] === '5' ? 'Rejected' : 'No code in the notice');
  return { code, enhanced, mapped, meaning, soft: code[0] === '4' ? true : code[0] === '5' ? false : null };
}

/** "550 · Mailbox unavailable (…)": the main label for a 3-digit code. Pure. */
export const codeLabel = (code: string) => (code === 'Unknown' ? 'Unknown code' : `${code} · ${SMTP_MEANING[code] ?? (code[0] === '4' ? 'Temporary failure' : 'Rejected')}`);

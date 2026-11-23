// The old n8n EmailBison Output Builder's copy assembly ("Normalize and Validate Campaign",
// workflow 4VK2fq5Ijrzcaa0Wp3n7i), ported as-is so engine campaigns read exactly like the old
// ones (Alex 2026-11-20: same format). Input: the Campaigns record's cells BY FIELD NAME.
//  - Steps 1-4, variants 1..N (N = "Number of variants - Step N", 1-10, default 1).
//  - Subject: Campaign Email N Subject Version v → Campaign Subject N Version v →
//    Campaign Email N Subject Spintax v → Campaign Email N Subject.
//    Body: Campaign Body N Version v → Campaign Email N Body Spintax v (→ Campaign Email N Body, v1).
//  - Thread reply (steps 2-4, checkbox only): the subject is step 1's same-numbered variant
//    subject (or variant 1's), without "Re:".
//  - Generic output: "Hi {FIRST_NAME}," greetings and every {FIRST_NAME} are removed.
//  - Signature and P.S. are added to every variant (both spintaxed), unless already present.
import { PermanentError } from '../errors.js';
import type { CopyStep, OutputType } from './rules.js';

type Cells = Record<string, unknown>;

const text = (value: unknown): string => {
  if (Array.isArray(value)) value = value[0];
  if (value && typeof value === 'object') value = (value as any).name ?? (value as any).value ?? (value as any).id;
  return value === undefined || value === null ? '' : String(value).trim().replace(/\\_/g, '_');
};
const bool = (value: unknown, fallback = false): boolean => {
  if (value === undefined || value === null || value === '') return fallback;
  if (typeof value === 'boolean') return value;
  return ['true', '1', 'yes', 'checked', 'on'].includes(String(value).toLowerCase());
};
const num = (value: unknown, fallback: number): number => {
  if (Array.isArray(value)) value = value[0];
  if (value && typeof value === 'object') value = (value as any).name ?? (value as any).value ?? (value as any).id;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};
const firstOf = (r: Cells, ...names: string[]): unknown => {
  for (const name of names) { const v = r[name]; if (v !== undefined && v !== null && v !== '') return v; }
  return undefined;
};

interface Copy { subject: string; body: string; threadReply: boolean }

/** The final sequence, before output-specific changes (old "Build the final sequence"). */
export function readSequence(r: Cells): Copy[][] {
  const variants: Copy[][] = [];
  for (let step = 1; step <= 4; step++) {
    const maxVariants = Math.max(1, Math.min(10, num(firstOf(r, `Variants - Step ${step}`, `Number of variants - Step ${step}`, `Number of Variants - Step ${step}`, `Variants Step ${step}`), 1)));
    const threadReply = step > 1 && bool(firstOf(r, `Thread Reply - Step ${step}`, `Thread Reply Step ${step}`, `Step ${step} Thread Reply`), false);
    const stepVariants: Copy[] = [];
    for (let variant = 1; variant <= maxVariants; variant++) {
      const subjectNames = [`Campaign Email ${step} Subject Version ${variant}`, `Campaign Subject ${step} Version ${variant}`, `Campaign Email ${step} Subject Spintax ${variant}`, `Campaign Email ${step} Subject`];
      const bodyNames = [`Campaign Body ${step} Version ${variant}`, `Campaign Email ${step} Body Spintax ${variant}`, ...(variant === 1 ? [`Campaign Email ${step} Body`] : [])];
      const source = variants[0]?.[variant - 1] ?? variants[0]?.[0];
      const sourceStepOneSubject = text(source?.subject).replace(/^(?:re:\s*)+/i, '');
      const subject = threadReply && sourceStepOneSubject ? sourceStepOneSubject : text(firstOf(r, ...subjectNames));
      const body = text(firstOf(r, ...bodyNames));
      if (!subject && !body && variant === 1) break;
      if (!subject && !body && variant > 1) continue;
      if (!subject || !body) throw new PermanentError(`Step ${step} variant ${variant} is missing its final validated subject or body.`);
      stepVariants.push({ subject, body, threadReply });
    }
    if (stepVariants.length) variants.push(stepVariants);
  }
  if (!variants.length) throw new PermanentError('No populated final sequence steps were found. Add validated copy to at least Step 1 before uploading.');
  return variants;
}

const removeGenericGreeting = (value: string) => value
  .replace(/^(?:hey|hi|hello)\s+\{FIRST_NAME\}\s*[,!:\-]?\s*(?:\r?\n)+/gim, '')
  .replace(/\{FIRST_NAME\}/gi, '')
  .replace(/^[ \t]+/gm, '')
  .replace(/\n{3,}/g, '\n\n')
  .trim();

const footerDetectionText = (body: string) => String(body ?? '').replace(/<br\s*\/?\s*>/gi, '\n').replace(/<\/p>\s*<p[^>]*>/gi, '\n').replace(/<[^>]+>/g, '');
const hasSignature = (body: string) =>
  /(?:^|\n)\s*--\s*(?:\n|$)|(?:^|\n)\s*(?:best|kind|warm) regards|(?:^|\n)\s*(?:sincerely|yours truly|best wishes|warm wishes|thank you|thanks)\s*,?\s*(?:\n|$)/i.test(footerDetectionText(body));
function splitTrailingPostscript(body: string): { bodyWithoutPostscript: string; customPostscript: string } {
  const raw = String(body ?? '');
  const match = raw.match(/(?:^|((?:\r?\n){2,}|(?:<br\s*\/?\s*>\s*){2,}))([ \t]*\{?p\s*\.\s*s\s*\.?\s*(?::|-)?\s*(?:(?!(?:\r?\n){2,}|(?:<br\s*\/?\s*>\s*){2,})[\s\S])*)$/i);
  if (!match) return { bodyWithoutPostscript: raw, customPostscript: '' };
  const boundary = match[1] || '';
  const matchStart = match.index ?? 0;
  return { bodyWithoutPostscript: raw.slice(0, matchStart).replace(/\s+$/, ''), customPostscript: raw.slice(matchStart + boundary.length) };
}

export interface SignatureInfo { brandName?: string; clientName?: string; senderTitle?: string; signature?: boolean; postscript?: boolean }

/** The copy one output (direct or generic) gets, as the old builder made it. */
export function outputCopy(sequence: Copy[][], outputType: OutputType, info: SignatureInfo): CopyStep[] {
  const variants = sequence.map((step) => step.map((c) => ({ ...c })));
  if (outputType === 'generic') {
    for (const step of variants) for (const copy of step) {
      copy.subject = removeGenericGreeting(copy.subject);
      copy.body = removeGenericGreeting(copy.body);
      if (/\{FIRST_NAME\}/i.test(copy.subject + '\n' + copy.body)) throw new PermanentError('Generic-email copy still contains {FIRST_NAME}.');
    }
  }
  const company = (text(info.brandName) || text(info.clientName)).replace(/\s*\(internal\)\s*$/i, '').trim();
  const signatureLines = ['--', '{Best regards|Kind regards|Warm regards|Sincerely|Thank you|Thanks|Yours truly|With best wishes|Best wishes|Warm wishes},', '{SENDER_FULL_NAME}', [text(info.senderTitle), company].filter(Boolean).join(', ')].filter(Boolean);
  for (const step of variants) for (const copy of step) {
    const { bodyWithoutPostscript, customPostscript } = splitTrailingPostscript(copy.body);
    const additions: string[] = [];
    if (info.signature !== false && !hasSignature(bodyWithoutPostscript)) additions.push(signatureLines.join('\n'));
    if (customPostscript) additions.push(customPostscript);
    else if (info.postscript !== false) additions.push("{P.S.|P.s.|p.s.} or tell me to pound sand if you'd like..");
    copy.body = [bodyWithoutPostscript.replace(/\s+$/, ''), ...additions].filter(Boolean).join('\n\n');
  }
  // The engine's builder takes variant 1 as the step and the rest as its variants.
  return variants.map((step) => ({ subject: step[0].subject, body: step[0].body, threadReply: step[0].threadReply, variants: step.slice(1).map((v) => ({ subject: v.subject, body: v.body })) }));
}

/** Schedule + settings from the record, with the old builder's defaults. */
export function campaignSettings(r: Cells) {
  const day = (d: string, fallback: boolean) => bool(r[`Run on ${d}`], fallback);
  return {
    // Unchecked Mon-Fri read as empty and fall back to true, exactly as in the old builder.
    days: { monday: day('Monday', true), tuesday: day('Tuesday', true), wednesday: day('Wednesday', true), thursday: day('Thursday', true), friday: day('Friday', true), saturday: day('Saturday', false), sunday: day('Sunday', false) },
    timezone: text(r.TimeZone) || 'America/New_York',
    settings: {
      // Plain text ON by default (Alex, Campaign Center walkthrough + EmailBison SOP: "always on").
      plain_text: bool(r.plain_text, true), open_tracking: bool(r.open_tracking, false), reputation_building: bool(r.reputation_building, false),
      can_unsubscribe: bool(r.can_unsubscribe, false), unsubscribe_text: text(r.unsubscribe_text),
    },
    // Blank = sized to the campaign's inboxes (see sendingLimits); a set value is checked against them.
    maxEmailsPerDay: num(r.max_emails_per_day, 0) || null,
    maxNewLeadsPerDay: num(r.max_new_leads_per_day, 0) || null,
    daysBetween: num(r['Days Between Emails'], 2),
    campaignType: text(r['Campaign Type']) || 'outbound',
  };
}

/**
 * Daily limits for one campaign (Alex: "if you're sending 5,000 emails a day you can't have your
 * max emails as 2,500, or the campaign will cop out halfway"). Capacity = inboxes x daily limit.
 * Blank fields: max emails = capacity, new leads = 80% of it (EmailBison SOP). A set max emails
 * below capacity is refused. A set value ABOVE capacity is lowered to capacity (Alex, 2026-11-23:
 * a test campaign with 7 inboxes was built with 2,325/day and 775 new leads/day, copied from a
 * bigger campaign's record). New leads never exceed max emails.
 */
export function sendingLimits(inboxes: number, dailyLimit: number, maxEmails: number | null, maxNewLeads: number | null) {
  const capacity = Math.max(1, inboxes * dailyLimit);
  if (maxEmails !== null && maxEmails < capacity) {
    throw new PermanentError(`max_emails_per_day is ${maxEmails} but the ${inboxes} inboxes send about ${capacity} a day; raise it to at least ${capacity} (or clear it) so the campaign does not stall`);
  }
  const max_emails_per_day = capacity;
  const newLeads = maxNewLeads ?? Math.floor(capacity * 0.8);
  return { max_emails_per_day, max_new_leads_per_day: Math.max(1, Math.min(newLeads, capacity)) };
}

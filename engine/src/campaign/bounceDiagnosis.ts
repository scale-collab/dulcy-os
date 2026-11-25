// The bounce agent's diagnosis (Atlas owns campaign health; Alex 2026-11-17: "over 4% = paused
// and investigated: copy, email accounts, list quality, email security gateways").
// Pure code, no AI: read the bounce notices and the inboxes, sort each bounce by cause, then
// name the most likely cause and one fix. The fix goes to Slack as a decision; nothing changes
// until Alex taps ✅.

export type BounceKind = 'bad_address' | 'blocked' | 'mailbox_full' | 'other';

const BAD = /(does not exist|doesn'?t exist|no such user|user unknown|unknown user|recipient (address )?rejected|address rejected|invalid (recipient|address|mailbox)|mailbox (unavailable|not found|does not exist)|account (has been )?disabled|no mailbox|not a valid|5\.1\.1|5\.1\.10|5\.4\.1|recipient not found|undeliverable address|address couldn'?t be found|no longer (with|available)|unrouteable|domain not found|host not found|nxdomain|5\.1\.2)/i;
const BLOCKED = /(blocked|block list|blocklist|blacklist|spam|policy|reputation|denied|5\.7\.\d|not authorized|rejected (for|due to|by)|message rejected|refused|banned|listed (on|in|at)|spf|dkim|dmarc|access denied|content rejected|sender rejected|poor reputation|too many)/i;
const FULL = /(mailbox (is )?full|quota|over quota|storage|insufficient (system )?storage|5\.2\.2|4\.2\.2)/i;
const GATEWAYS: [string, RegExp][] = [
  ['Mimecast', /mimecast/i], ['Proofpoint', /proofpoint|pphosted/i], ['Barracuda', /barracuda/i],
  ['Microsoft (Exchange Online Protection)', /protection\.outlook\.com|outlook\.com.*(5\.7|blocked)|exchange online/i],
  ['Symantec / MessageLabs', /messagelabs|symantec/i], ['Cisco IronPort', /ironport/i], ['Sophos', /sophos/i],
];

export function classifyBounce(text: string): BounceKind {
  const t = String(text ?? '');
  if (FULL.test(t)) return 'mailbox_full';
  if (BAD.test(t)) return 'bad_address';
  if (BLOCKED.test(t)) return 'blocked';
  return 'other';
}

export function gatewayOf(text: string): string {
  return GATEWAYS.find(([, re]) => re.test(String(text ?? '')))?.[0] ?? '';
}

const GENERIC = /^(info|contact|office|hello|enquiries|inquiries|sales|admin|support|team|service|customerservice|estimates|quotes|hi|mail|general|reception)@/i;
const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;

export interface InboxStat { id: string; email: string; status: string; sent: number; bounced: number }
export interface Bounce { senderId: string; recipient: string; kind: BounceKind; gateway: string }

/** One bounce notice → who bounced, from which of our inboxes, and why. */
export function readBounce(r: any, ourInboxes: Set<string>): Bounce {
  const text = `${r?.subject ?? ''}\n${r?.text_body ?? r?.html_body ?? ''}`;
  const leadEmail = String(r?.lead?.email ?? '').toLowerCase();
  const found = (text.match(EMAIL) ?? []).map((e) => e.toLowerCase()).filter((e) => !ourInboxes.has(e) && !/mailer-daemon|postmaster|no-?reply|bounce/i.test(e));
  return { senderId: String(r?.sender_email_id ?? ''), recipient: leadEmail || found[0] || '', kind: classifyBounce(text), gateway: gatewayOf(text) };
}

export interface Diagnosis {
  cause: 'list' | 'inboxes' | 'gateway' | 'early' | 'mixed';
  headline: string;
  facts: string[];
  fix: string;
  action: 'Remove Inboxes and Resume' | 'Resume Campaign' | 'None';
  removeSenderIds: string[];
}

const pct = (a: number, b: number) => (b > 0 ? Math.round((a / b) * 1000) / 10 : 0);

/**
 * Decide the most likely cause from the bounce notices and the inboxes.
 * - Most bounces "address does not exist" → the list (verification) is the cause.
 * - Most bounces "blocked / spam / policy" from a few inboxes → those inboxes are burned.
 * - Most blocks from one security gateway (Mimecast, Proofpoint…) → those companies' filters.
 * - Very few sends so far → early noise.
 */
export function diagnose(c: { bounce: number; contacted: number; bounced: number; progress: number }, inboxes: InboxStat[], bounces: Bounce[]): Diagnosis {
  const n = bounces.length;
  const by = (k: BounceKind) => bounces.filter((b) => b.kind === k).length;
  const bad = by('bad_address'), blocked = by('blocked'), full = by('mailbox_full'), other = by('other');
  const generic = bounces.filter((b) => GENERIC.test(b.recipient)).length;
  const gateways = new Map<string, number>();
  for (const b of bounces) if (b.gateway) gateways.set(b.gateway, (gateways.get(b.gateway) ?? 0) + 1);
  const topGateway = [...gateways.entries()].sort((a, b) => b[1] - a[1])[0];

  // Inboxes: lifetime bounce rate, and who sent the blocked ones.
  const blockedBySender = new Map<string, number>();
  for (const b of bounces) if (b.kind === 'blocked' && b.senderId) blockedBySender.set(b.senderId, (blockedBySender.get(b.senderId) ?? 0) + 1);
  const badInboxes = inboxes.filter((i) => (i.sent >= 50 && pct(i.bounced, i.sent) > 5) || (blockedBySender.get(i.id) ?? 0) >= Math.max(3, Math.ceil(blocked * 0.2)) || !['connected', 'active', ''].includes(i.status));
  const disconnected = inboxes.filter((i) => !['connected', 'active', ''].includes(i.status));

  const facts = [
    `Bounce ${c.bounce}% (${c.bounced} of ${c.contacted} contacted) at ${c.progress}% progress.`,
    n ? `Bounce notices read: ${n}. Address does not exist: ${bad} (${pct(bad, n)}%). Blocked / spam / policy: ${blocked} (${pct(blocked, n)}%). Mailbox full: ${full}. Other: ${other}.` : 'No bounce notices found in the bounced folder for this campaign.',
    n ? `Generic inboxes (info@, sales@…) among the bounces: ${generic} (${pct(generic, n)}%).` : '',
    topGateway ? `Security gateway named in the notices: ${[...gateways.entries()].map(([g, k]) => `${g} ${k}`).join(', ')}.` : '',
    inboxes.length ? `Inboxes on the campaign: ${inboxes.length}${disconnected.length ? `, ${disconnected.length} not connected` : ''}. Highest lifetime bounce: ${[...inboxes].sort((a, b) => pct(b.bounced, b.sent) - pct(a.bounced, a.sent)).slice(0, 3).map((i) => `${i.email} ${pct(i.bounced, i.sent)}% of ${i.sent}`).join('; ')}.` : 'No inboxes found on the campaign.',
  ].filter(Boolean);

  const base = { facts, removeSenderIds: [] as string[] };
  if (c.contacted < 150) return { ...base, cause: 'early', headline: 'Too early to judge', fix: `Only ${c.contacted} leads contacted, so a few bounces move the rate a lot. Resume and re-check after 300+ contacted.`, action: 'Resume Campaign' };
  if (n >= 5 && topGateway && topGateway[1] / n >= 0.3) {
    return { ...base, cause: 'gateway', headline: `${topGateway[0]} is filtering the emails`, fix: `${topGateway[1]} of ${n} bounces come from ${topGateway[0]} company filters. Keep it paused: remove the leads on ${topGateway[0]} domains (or plain-text, no-link copy for them), then resume. This needs a list change, so Atlas prepares it for your OK.`, action: 'None' };
  }
  if (n >= 5 && blocked >= bad && blocked / n >= 0.4 && badInboxes.length && badInboxes.length <= Math.max(1, Math.floor(inboxes.length * 0.5))) {
    return { ...base, cause: 'inboxes', headline: `${badInboxes.length} inbox${badInboxes.length > 1 ? 'es are' : ' is'} being blocked`, removeSenderIds: badInboxes.map((i) => i.id),
      fix: `Remove ${badInboxes.map((i) => i.email).join(', ')} from this campaign (rest them / check them in the Spam Center), then resume with the other ${inboxes.length - badInboxes.length} inboxes.`, action: 'Remove Inboxes and Resume' };
  }
  if (n >= 5 && bad / n >= 0.5) {
    return { ...base, cause: 'list', headline: 'The lead list has bad addresses', fix: `${pct(bad, n)}% of bounces are addresses that do not exist, so the list is the cause${generic / Math.max(1, n) >= 0.4 ? ` (mostly generic inboxes: ${pct(generic, n)}%)` : ''}. Keep it paused. Re-verify the leads not yet contacted (MillionVerifier) and remove the risky / catch-all ones, then resume.`, action: 'None' };
  }
  if (n >= 5 && blocked / n >= 0.5) {
    return { ...base, cause: 'inboxes', headline: 'Our inboxes are being blocked across the board', fix: 'Most bounces are spam / policy blocks spread over all inboxes: check the domains in the Spam Center (blacklists, SPF/DKIM/DMARC) and the copy (links, tracking) before resuming. Keep it paused.', action: 'None' };
  }
  return { ...base, cause: 'mixed', headline: 'No single cause', fix: 'Bounces are mixed (bad addresses and blocks). Keep it paused and check the list and the inboxes in the Spam Center.', action: 'None' };
}

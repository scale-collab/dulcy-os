// The bounce agent's diagnosis, Alex's method (rules/RULES.md 2026-11-25):
//  1. Read the bounce codes: a VERIFICATION problem (address not found, 5.1.x) or a SPAM problem
//     (blocked / policy, 5.7.x)?
//  2. If spam, it is one of three: our DOMAIN, our email COPY, or one EMAIL ACCOUNT.
//  3. Where do the bounces land? If 50%+ go to one email security gateway or a custom mail server
//     (Proofpoint, Mimecast, Barracuda…), stop sending to that gateway.
// Pure code, no AI. Each fix goes to Slack as a decision; nothing changes until Alex taps ✅.

export type BounceKind = 'bad_address' | 'blocked' | 'mailbox_full' | 'other';

const BAD = /(does not exist|doesn'?t exist|no such user|user unknown|unknown user|recipient (address )?rejected|address rejected|invalid (recipient|address|mailbox)|mailbox (unavailable|not found|does not exist)|account (has been )?disabled|no mailbox|not a valid|5\.1\.1|5\.1\.10|5\.4\.1|recipient not found|undeliverable address|address couldn'?t be found|no longer (with|available)|unrouteable|domain not found|host not found|nxdomain|5\.1\.2)/i;
const BLOCKED = /(blocked|block list|blocklist|blacklist|spam|policy|reputation|denied|5\.7\.\d|not authorized|rejected (for|due to|by)|message rejected|refused|banned|listed (on|in|at)|spf|dkim|dmarc|access denied|content rejected|sender rejected|poor reputation|too many)/i;
const FULL = /(mailbox (is )?full|quota|over quota|storage|insufficient (system )?storage|5\.2\.2|4\.2\.2)/i;
/** Spam blocks that point at our sending domain (its reputation, blacklists, authentication). */
const DOMAIN_SIGNS = /(spamhaus|barracudacentral|surbl|uribl|spamcop|blacklist|blocklist|block list|listed (on|in|at)|domain (has a )?(poor )?reputation|sender domain|spf|dkim|dmarc|not authenticated|unauthenticated|5\.7\.(23|25|26|27))/i;
/** Spam blocks that point at the email itself (content, links). */
const COPY_SIGNS = /(content|spam (score|detected|message)|message (looks|appears|was) (like )?(spam|suspicious)|url|link|phish|bulk|5\.7\.(350|708|510)|high probability of spam)/i;

const GATEWAYS: [string, RegExp][] = [
  ['Proofpoint', /proofpoint|pphosted|ppe-hosted/i], ['Mimecast', /mimecast/i], ['Barracuda', /barracuda(networks)?/i],
  ['Cisco IronPort', /iphmx|ironport/i], ['Symantec / Broadcom', /messagelabs|symantec/i], ['Sophos', /sophos/i],
  ['Trend Micro', /trendmicro|tmes/i], ['Forcepoint', /mailcontrol|forcepoint/i], ['Fortinet', /fortimail/i], ['Hornetsecurity', /hornetsecurity/i],
  ['SpamTitan', /spamtitan/i], ['Mailprotector', /mailprotector/i], ['Zix', /zixmail|zix/i], ['Trustwave', /mailmarshal|trustwave/i],
];

/** The recipient's mail provider from its MX host: Google, Microsoft, a security gateway, or a custom mail server. */
export function providerOfMx(mx: string): string {
  const h = String(mx ?? '').toLowerCase();
  if (!h) return 'Unknown';
  for (const [name, re] of GATEWAYS) if (re.test(h)) return name;
  if (/google|googlemail|aspmx/.test(h)) return 'Google';
  if (/outlook\.com|protection\.outlook|office365|microsoft/.test(h)) return 'Microsoft 365';
  if (/yahoodns|yahoo/.test(h)) return 'Yahoo';
  if (/zoho/.test(h)) return 'Zoho';
  if (/secureserver|godaddy/.test(h)) return 'GoDaddy';
  return 'Custom mail server';
}
/** Gateways and custom servers count as "security gateways" for step 3 (Google, Microsoft, Yahoo and hosts do not). */
export const isSeg = (provider: string) => !['Google', 'Microsoft 365', 'Yahoo', 'Zoho', 'GoDaddy', 'Unknown'].includes(provider);

export function classifyBounce(text: string): BounceKind {
  const t = String(text ?? '');
  if (FULL.test(t)) return 'mailbox_full';
  if (BAD.test(t)) return 'bad_address';
  if (BLOCKED.test(t)) return 'blocked';
  return 'other';
}

/** The SMTP status code in a notice, e.g. "5.1.1" (or the 3-digit reply code if that is all there is). */
export function codeOf(text: string): string {
  const t = String(text ?? '');
  return /\b([45]\.\d{1,3}\.\d{1,3})\b/.exec(t)?.[1] ?? /\b([45]\d\d)[ -]/.exec(t)?.[1] ?? '';
}

/** A gateway named in the notice text. */
export function gatewayOf(text: string): string {
  return GATEWAYS.find(([, re]) => re.test(String(text ?? '')))?.[0] ?? '';
}

const GENERIC = /^(info|contact|office|hello|enquiries|inquiries|sales|admin|support|team|service|customerservice|estimates|quotes|hi|mail|general|reception)@/i;
const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;

export interface InboxStat { id: string; email: string; status: string; sent: number; bounced: number }
export interface Bounce { senderId: string; recipient: string; kind: BounceKind; gateway: string; code?: string; spamHint?: 'domain' | 'copy' | ''; provider?: string }

/** One bounce notice → who bounced, from which of our inboxes, the code and why. */
export function readBounce(r: any, ourInboxes: Set<string>): Bounce {
  const text = `${r?.subject ?? ''}\n${r?.text_body ?? r?.html_body ?? ''}`;
  const leadEmail = String(r?.lead?.email ?? '').toLowerCase();
  const found = (text.match(EMAIL) ?? []).map((e) => e.toLowerCase()).filter((e) => !ourInboxes.has(e) && !/mailer-daemon|postmaster|no-?reply|bounce/i.test(e));
  const kind = classifyBounce(text);
  return {
    senderId: String(r?.sender_email_id ?? ''), recipient: leadEmail || found[0] || '', kind, gateway: gatewayOf(text), code: codeOf(text),
    spamHint: kind !== 'blocked' ? '' : DOMAIN_SIGNS.test(text) ? 'domain' : COPY_SIGNS.test(text) ? 'copy' : '',
  };
}

export interface Diagnosis {
  cause: 'verification' | 'domain' | 'account' | 'copy' | 'gateway' | 'early' | 'mixed';
  headline: string;
  facts: string[];
  fix: string;
  action: 'Remove Inboxes and Resume' | 'Resume Campaign' | 'None';
  removeSenderIds: string[];
  /** Step 3: a gateway / custom mail server that takes 50%+ of the bounces (stop sending to it). */
  stopSendingTo: string;
}

const pct = (a: number, b: number) => (b > 0 ? Math.round((a / b) * 1000) / 10 : 0);
const domainOf = (email: string) => String(email ?? '').split('@')[1]?.toLowerCase() ?? '';
const top = (m: Map<string, number>, k = 4) => [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, k);
const count = <T>(xs: T[], key: (x: T) => string) => { const m = new Map<string, number>(); for (const x of xs) { const k = key(x); if (k) m.set(k, (m.get(k) ?? 0) + 1); } return m; };

export function diagnose(c: { bounce: number; contacted: number; bounced: number; progress: number; paused?: boolean }, inboxes: InboxStat[], bounces: Bounce[]): Diagnosis {
  const hold = c.paused === false ? 'Pause it (Skip Bounce Pause is ticked, so it is still sending)' : 'Keep it paused';
  const n = bounces.length;
  const by = (k: BounceKind) => bounces.filter((b) => b.kind === k).length;
  const bad = by('bad_address'), blocked = by('blocked'), full = by('mailbox_full'), other = by('other');
  const generic = bounces.filter((b) => GENERIC.test(b.recipient)).length;
  const codes = count(bounces, (b) => b.code ?? '');

  // Step 3: where the bounces land (from each recipient's MX record).
  const providers = count(bounces, (b) => b.provider ?? '');
  const withProvider = [...providers.values()].reduce((a, b) => a + b, 0);
  const segTop = top(new Map([...providers.entries()].filter(([p]) => isSeg(p))), 1)[0];
  const stopSendingTo = segTop && withProvider >= 5 && segTop[1] / withProvider >= 0.5 ? segTop[0] : '';

  // Step 2 inputs: blocks by our inbox and by our sending domain.
  const inboxById = new Map(inboxes.map((i) => [i.id, i]));
  const blockedOnes = bounces.filter((b) => b.kind === 'blocked');
  const blocksByInbox = count(blockedOnes, (b) => b.senderId);
  const blocksByDomain = count(blockedOnes, (b) => domainOf(inboxById.get(b.senderId)?.email ?? ''));
  const ourDomains = new Set(inboxes.map((i) => domainOf(i.email)).filter(Boolean));
  const fairInbox = inboxes.length ? blocked / inboxes.length : 0, fairDomain = ourDomains.size ? blocked / ourDomains.size : 0;
  const burnedInboxes = inboxes.filter((i) => ((blocksByInbox.get(i.id) ?? 0) >= 5 && (blocksByInbox.get(i.id) ?? 0) >= 3 * fairInbox) || (i.sent >= 100 && pct(i.bounced, i.sent) > 6) || !['connected', 'active', ''].includes(i.status));
  // A domain is the problem only when its blocks come from 2+ of its inboxes (one inbox alone = that account).
  const inboxesBlockedOn = (d: string) => inboxes.filter((i) => domainOf(i.email) === d && (blocksByInbox.get(i.id) ?? 0) > 0).length;
  const burnedDomains = [...ourDomains].filter((d) => (blocksByDomain.get(d) ?? 0) >= 5 && (blocksByDomain.get(d) ?? 0) >= 3 * fairDomain && inboxesBlockedOn(d) >= 2);
  const domainHints = blockedOnes.filter((b) => b.spamHint === 'domain').length, copyHints = blockedOnes.filter((b) => b.spamHint === 'copy').length;
  const tlds = count([...ourDomains], (d) => d.split('.').pop() ?? '');
  const mainTld = top(tlds, 1)[0]?.[0] ?? '';
  const riskyTld = ['info', 'xyz', 'top', 'click', 'biz', 'online', 'site'].includes(mainTld) ? mainTld : '';

  const facts = [
    `Bounce ${c.bounce}% (${c.bounced} of ${c.contacted} contacted) at ${c.progress}% progress.`,
    n ? `Step 1, bounce codes (${n} notices read): not found / verification ${bad} (${pct(bad, n)}%), blocked / spam ${blocked} (${pct(blocked, n)}%), mailbox full ${full}, other ${other}. Top codes: ${top(codes).map(([k, v]) => `${k} ×${v}`).join(', ') || 'none readable'}.` : 'No bounce notices found in the bounced folder for this campaign.',
    blocked ? `Step 2, spam blocks: ${domainHints} point at our domain (blacklist / reputation / SPF-DKIM-DMARC), ${copyHints} at the copy (content / links). Blocks by our sending domain: ${top(blocksByDomain).map(([k, v]) => `${k} ${v}`).join(', ') || 'none'} (${ourDomains.size} domains${riskyTld ? `, mostly .${riskyTld}` : ''}). Busiest inbox: ${top(blocksByInbox, 1).map(([k, v]) => `${inboxById.get(k)?.email ?? k} ${v}`).join('') || 'none'}.` : '',
    withProvider ? `Step 3, where the bounces land: ${top(providers, 6).map(([k, v]) => `${k} ${v} (${pct(v, withProvider)}%)`).join(', ')}.` : '',
    n ? `Generic inboxes (info@, sales@…) among the bounces: ${generic} (${pct(generic, n)}%).` : '',
  ].filter(Boolean);

  const segLine = stopSendingTo ? ` Also: ${pct(segTop![1], withProvider)}% of the bounces land on ${stopSendingTo}: stop sending to ${stopSendingTo} recipients (remove those leads before the next send).` : '';
  const base = { facts, removeSenderIds: [] as string[], stopSendingTo };
  if (c.contacted < 150) return { ...base, cause: 'early', headline: 'Too early to judge', fix: `Only ${c.contacted} leads contacted, so a few bounces move the rate a lot. Resume and re-check after 300+ contacted.`, action: 'Resume Campaign' };
  if (n < 5) return { ...base, cause: 'mixed', headline: 'Not enough bounce notices to tell', fix: `Only ${n} bounce notice${n === 1 ? '' : 's'} found. ${hold} and check the bounces in EmailBison by hand.`, action: 'None' };

  // Step 1: verification vs spam.
  if (bad / n >= 0.5 || (bad / n >= 0.4 && bad >= 2 * blocked)) {
    return { ...base, cause: 'verification', headline: 'Verification problem: addresses not found',
      fix: `${pct(bad, n)}% of bounces are addresses that do not exist (${top(codes, 2).map(([k]) => k).join(', ')}), so it is the list${generic / n >= 0.4 ? ` (mostly generic inboxes: ${pct(generic, n)}%)` : ''}. ${hold}. Re-verify the leads not yet contacted (MillionVerifier) and remove the risky / catch-all ones, then resume.${segLine}`, action: 'None' };
  }
  if (stopSendingTo && blocked / n >= 0.3) {
    return { ...base, cause: 'gateway', headline: `${stopSendingTo} takes ${pct(segTop![1], withProvider)}% of the bounces`,
      fix: `${hold}. Stop sending to ${stopSendingTo} recipients (remove those leads), then resume for the rest.`, action: 'None' };
  }
  if (blocked / n >= 0.4 || blocked > bad) {
    // Step 2: domain, account or copy.
    if (burnedInboxes.length && burnedInboxes.length <= Math.max(1, Math.floor(inboxes.length * 0.5)) && !burnedDomains.length) {
      return { ...base, cause: 'account', headline: `Spam problem: ${burnedInboxes.length} email account${burnedInboxes.length > 1 ? 's' : ''}`, removeSenderIds: burnedInboxes.map((i) => i.id),
        fix: `The blocks come mostly from ${burnedInboxes.map((i) => i.email).join(', ')}. Remove ${burnedInboxes.length > 1 ? 'them' : 'it'} from this campaign (rest and check in the Spam Center), then resume with the other ${inboxes.length - burnedInboxes.length}.${segLine}`, action: 'Remove Inboxes and Resume' };
    }
    if (burnedDomains.length || domainHints / Math.max(1, blocked) >= 0.3 || riskyTld) {
      return { ...base, cause: 'domain', headline: `Spam problem: our sending domain${burnedDomains.length > 1 ? 's' : ''}`,
        fix: `${burnedDomains.length ? `Blocks cluster on ${burnedDomains.join(', ')}. ` : ''}${domainHints ? `${domainHints} notices name a blacklist, reputation or SPF/DKIM/DMARC. ` : ''}${riskyTld ? `The inboxes send from .${riskyTld} domains, which mail filters distrust. ` : ''}${hold}. Check the domains in the Spam Center (blacklists, authentication)${riskyTld ? ' and plan new .com domains' : ''} before resuming.${segLine}`, action: 'None' };
    }
    return { ...base, cause: 'copy', headline: 'Spam problem: likely the email copy',
      fix: `Blocks are spread over all ${inboxes.length} inboxes and ${ourDomains.size} domains${copyHints ? `, and ${copyHints} notices point at the content` : ''}, so the email itself is the likely cause. ${hold}. Review the copy (links, tracking, spam words, images) and run a placement test before resuming.${segLine}`, action: 'None' };
  }
  return { ...base, cause: 'mixed', headline: 'No single cause', fix: `Bounces are mixed (${pct(bad, n)}% not found, ${pct(blocked, n)}% blocked). ${hold} and check both the list and the inboxes in the Spam Center.${segLine}`, action: 'None' };
}

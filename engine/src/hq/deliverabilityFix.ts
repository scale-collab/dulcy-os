// Deliverability round 4 (Alex, 2026-11-28): "There's a long list of all these accounts; Atlas should
// just be able to fix it. So I'd rather just click 'have Atlas fix it'." Instead of a long account
// list Alex must read, Needs attention shows one line per problem ("37 accounts have warm-up off
// unexpectedly") and ONE Fix it button per owner. The button's brief lists the accounts for the
// agent. Warm-up off that the spam protocol expects (resting, replacing, spam review, paused by
// EmailBison) is never counted (RULES round 2). Pressing Fix it only queues a task (fixIt.ts).
import type { InboxRow, Item, Owner } from './deliverability.js';

/** What a Fix it button hands to the agent: the task title, the brief (with the accounts), how many. */
export interface FixBrief { agent: Owner; title: string; detail: string; count: number }
/** fixIt.ts keeps 2000 characters of detail; the list stops a little before that. */
export const BRIEF_MAX = 1900;

const plural = (n: number, one: string, many = `${one}es`) => `${n.toLocaleString('en-US')} ${n === 1 ? one : many}`;

/** The account lines, as many as fit in the budget, then "…and N more". Pure. */
export function capLines(lines: string[], budget: number): string[] {
  const out: string[] = [];
  let used = 0;
  for (let i = 0; i < lines.length; i++) {
    const rest = lines.length - i;
    const more = `…and ${rest} more (Deliverability → Needs attention → Show accounts).`;
    if (used + lines[i].length + 1 + (rest > 1 ? more.length + 1 : 0) > budget) { out.push(more); break; }
    out.push(lines[i]); used += lines[i].length + 1;
  }
  return out;
}
const brief = (head: string[], lines: string[]) => {
  const top = head.join('\n');
  return [top, 'Accounts:', ...capLines(lines, BRIEF_MAX - top.length - 12)].join('\n');
};
const forClient = (name: string) => (name ? ` (${name})` : '');

/**
 * Warm-up off for no known reason: one Atlas brief with every such inbox (email, client, and
 * "disconnected" when it must be reconnected first). null when there are none. Pure.
 */
export function warmupBrief(inboxes: Pick<InboxRow, 'email' | 'client' | 'clientKey' | 'warmupWhy' | 'connection'>[], client?: string, clientName = ''): FixBrief | null {
  const off = inboxes.filter((i) => i.clientKey !== 'none' && (!client || i.clientKey === client) && i.warmupWhy === 'unexpected')
    .sort((a, b) => a.client.localeCompare(b.client) || a.email.localeCompare(b.email));
  if (!off.length) return null;
  const down = (i: { connection: string }) => !!i.connection && i.connection.toLowerCase() !== 'connected';
  const disconnected = off.filter(down).length;
  const head = [
    `Warm-up is off for no known reason on ${plural(off.length, 'inbox')}${forClient(clientName)}: not resting, not being replaced, not in spam review and not paused by EmailBison.`,
    `Fix: turn warm-up back on for each one in EmailBison (keep its warm-up limit).${disconnected ? ` ${disconnected} ${disconnected === 1 ? 'is' : 'are'} disconnected: reconnect ${disconnected === 1 ? 'it' : 'them'} first.` : ''} Leave resting / replaced inboxes alone: their warm-up is off on purpose.`,
  ];
  const lines = off.map((i) => `- ${i.email}${clientName ? '' : ` (${i.client})`}${down(i) ? ' · disconnected' : ''}`);
  return { agent: 'Atlas', title: `Turn warm-up back on for ${plural(off.length, 'inbox')}`, detail: brief(head, lines), count: off.length };
}

/**
 * Spam (the inboxes and domains in spam on Needs attention): one brief per owner (Atlas for
 * placement / warm-up / bounces, Riley for a disconnected inbox), each with its accounts and why. Pure.
 */
export function spamBriefs(items: Pick<Item, 'kind' | 'status' | 'title' | 'client' | 'clientKey' | 'reason' | 'owner' | 'inboxes' | 'redFlag'>[], client?: string, clientName = ''): FixBrief[] {
  const spam = items.filter((i) => i.status === 'spam' && !i.redFlag && i.clientKey !== 'none' && (!client || i.clientKey === client));
  const out: FixBrief[] = [];
  for (const agent of ['Atlas', 'Riley'] as const) {
    const mine = spam.filter((i) => i.owner === agent).sort((a, b) => a.client.localeCompare(b.client) || a.title.localeCompare(b.title));
    if (!mine.length) continue;
    const domains = mine.filter((i) => i.kind === 'domain').length, boxes = mine.length - domains;
    const what = [boxes ? plural(boxes, 'inbox') : '', domains ? plural(domains, 'domain', 'domains') : ''].filter(Boolean).join(' and ');
    const head = [
      `${what}${forClient(clientName)} ${mine.length === 1 ? 'is' : 'are'} in spam.`,
      agent === 'Riley'
        ? 'Fix: reconnect each one in EmailBison (the connection dropped), then check it sends again.'
        : 'Fix: follow the spam protocol for each one (rest it, retest it, replace it if the retest fails). Anything that costs money (new domains or inboxes) waits for Alex\'s OK.',
    ];
    const lines = mine.map((i) => `- ${i.title}${i.kind === 'domain' ? ` (domain, ${i.inboxes ?? 0} inboxes)` : ''}${clientName ? '' : ` · ${i.client}`}: ${i.reason || 'in spam'}`);
    out.push({ agent, title: `Fix ${what} in spam`, detail: brief(head, lines), count: mine.length });
  }
  return out;
}

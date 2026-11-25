// Dulcy HQ: the 9 active agents (Alex, 2026-11-24), what each does, who it reports to, which
// engine jobs are its runs, and which Decisions pile its decisions go in (the same piles as the
// Airtable Daily Run deck).

export const AGENT_NAMES = ['Ada', 'Atlas', 'Scribe', 'Scout', 'Sean', 'Riley', 'Cole', 'Ledger', 'Sienna'] as const;
export type AgentName = (typeof AGENT_NAMES)[number];

export interface AgentInfo {
  name: AgentName;
  role: string;
  /** One line: what it does. */
  does: string;
  reportsTo: AgentName | 'Alex';
  manages: AgentName[];
  /** Skill file (under KNOWLEDGE_DIR) used as the chat system prompt. */
  skill: string;
  /** Money and finance are owner-only (Alex, 2026-11-25): members do not see this agent. */
  ownerOnly?: boolean;
}

export const AGENTS: Record<AgentName, AgentInfo> = {
  Ada: { name: 'Ada', role: 'COO', does: 'Runs the team: routes work to one owner, writes the morning brief, checks every agent did its job.', reportsTo: 'Alex', manages: ['Atlas', 'Sean', 'Riley', 'Cole', 'Ledger', 'Sienna'], skill: 'skills/ada-router/SKILL.md' },
  Atlas: { name: 'Atlas', role: 'Client success + campaigns', does: 'Leads every client account and campaign: health, next campaign, bounce and inbox fixes.', reportsTo: 'Ada', manages: ['Scribe', 'Scout'], skill: 'skills/atlas-campaign-operator/SKILL.md' },
  Scribe: { name: 'Scribe', role: 'Copy and offers', does: 'Writes campaign copy and offers from real client facts, for review only.', reportsTo: 'Atlas', manages: [], skill: 'skills/scribe-cold-email-copywriter/SKILL.md' },
  Scout: { name: 'Scout', role: 'Lead lists', does: 'Builds and checks lead lists: ICP, sources, fit, verification.', reportsTo: 'Atlas', manages: [], skill: 'skills/scout-lead-list-builder/SKILL.md' },
  Sean: { name: 'Sean', role: 'Inbox', does: 'Turns prospect replies into booked calls: drafts every reply for approval.', reportsTo: 'Ada', manages: [], skill: 'skills/sean-reply-handling/SKILL.md' },
  Riley: { name: 'Riley', role: 'Automation and fixes', does: 'Watches the systems, finds why things break and prepares the fix for your OK.', reportsTo: 'Ada', manages: [], skill: 'skills/riley-systems-repair/SKILL.md' },
  Cole: { name: 'Cole', role: 'Sales', does: 'Reviews your sales calls: score, 3 fixes with better lines, a follow-up draft.', reportsTo: 'Ada', manages: [], skill: 'skills/cole-sales-closing/SKILL.md' },
  Ledger: { name: 'Ledger', role: 'Accountant', does: 'Money report, purchase yes/no, and Xero reconciliation checks. Read only.', reportsTo: 'Ada', manages: [], skill: 'skills/ledger-finance/SKILL.md', ownerOnly: true },
  Sienna: { name: 'Sienna', role: 'Content', does: 'Finds video ideas with real demand and writes the scripts. Posts nothing.', reportsTo: 'Ada', manages: [], skill: 'skills/sienna-social-content/SKILL.md' },
};

export const isAgent = (x: unknown): x is AgentName => typeof x === 'string' && (AGENT_NAMES as readonly string[]).includes(x);

/** Accepts "ada", "Ada", "ADA". */
export function agentByName(x: string): AgentName | null {
  const n = String(x ?? '').trim().toLowerCase();
  return AGENT_NAMES.find((a) => a.toLowerCase() === n) ?? null;
}

/**
 * Which agent an engine job belongs to, by its kind. sean.*, reply.*, decision.send_reply → Sean;
 * atlas.*, campaign.*, bounce.*, account.* → Atlas; scribe.* → Scribe; leadlist.* → Scout;
 * riley.* → Riley; ledger.* → Ledger; cole.* → Cole; sienna.* → Sienna; ada.* and hq.* → Ada.
 */
export function agentForJob(kind: string): AgentName | null {
  const k = String(kind ?? '');
  const p = k.split('.')[0];
  if (p === 'sean' || p === 'reply' || k === 'decision.send_reply') return 'Sean';
  if (p === 'atlas' || p === 'campaign' || p === 'bounce' || p === 'account') return 'Atlas';
  if (p === 'scribe') return 'Scribe';
  if (p === 'leadlist') return 'Scout';
  if (p === 'riley') return 'Riley';
  if (p === 'ledger') return 'Ledger';
  if (p === 'cole') return 'Cole';
  if (p === 'sienna') return 'Sienna';
  if (p === 'ada' || p === 'hq') return 'Ada';
  return null;
}

/** SQL LIKE patterns for an agent's job kinds (the inverse of agentForJob). */
export function jobPatternsFor(agent: AgentName): string[] {
  switch (agent) {
    case 'Sean': return ['sean.%', 'reply.%', 'decision.send_reply'];
    case 'Atlas': return ['atlas.%', 'campaign.%', 'bounce.%', 'account.%'];
    case 'Scribe': return ['scribe.%'];
    case 'Scout': return ['leadlist.%'];
    case 'Riley': return ['riley.%'];
    case 'Ledger': return ['ledger.%'];
    case 'Cole': return ['cole.%'];
    case 'Sienna': return ['sienna.%'];
    case 'Ada': return ['ada.%', 'hq.%'];
  }
}

export const PILES = ['Replies', 'Campaigns', 'Fixes', 'Money', 'Other'] as const;
export type Pile = (typeof PILES)[number];

/** The Daily Run piles: Sean → Replies; Atlas, Scribe, Scout → Campaigns; Riley → Fixes; Ledger → Money; the rest → Other. */
export function pileFor(agent: string): Pile {
  const a = String(agent ?? '').trim();
  if (a === 'Sean') return 'Replies';
  if (a === 'Atlas' || a === 'Scribe' || a === 'Scout') return 'Campaigns';
  if (a === 'Riley') return 'Fixes';
  if (a === 'Ledger') return 'Money';
  return 'Other';
}

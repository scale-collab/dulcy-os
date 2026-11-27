// Dulcy HQ: the 9 active agents (Alex, 2026-11-24), what each does, who it reports to, which
// engine jobs are its runs, and which Decisions pile its decisions go in (the same piles as the
// Airtable Daily Run deck).

export const AGENT_NAMES = ['Ada', 'Atlas', 'Scribe', 'Scout', 'Echo', 'Riley', 'Cole', 'Ledger', 'Sienna'] as const;
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
  /** Money and content are owner-only (Alex, 2026-11-25): members do not see this agent, its reports or chats. */
  ownerOnly?: boolean;
}

export const AGENTS: Record<AgentName, AgentInfo> = {
  Ada: { name: 'Ada', role: 'COO', does: 'Runs the team: routes work to one owner, writes the morning brief, checks every agent did its job.', reportsTo: 'Alex', manages: ['Atlas', 'Echo', 'Riley', 'Cole', 'Ledger', 'Sienna'], skill: 'skills/ada-router/SKILL.md' },
  Atlas: { name: 'Atlas', role: 'Client success + campaigns', does: 'Leads every client account and campaign: health, next campaign, bounce and inbox fixes.', reportsTo: 'Ada', manages: ['Scribe', 'Scout'], skill: 'skills/atlas-campaign-operator/SKILL.md' },
  Scribe: { name: 'Scribe', role: 'Copy and offers', does: 'Writes campaign copy and offers from real client facts, for review only.', reportsTo: 'Atlas', manages: [], skill: 'skills/scribe-cold-email-copywriter/SKILL.md' },
  Scout: { name: 'Scout', role: 'Lead lists', does: 'Builds and checks lead lists: ICP, sources, fit, verification.', reportsTo: 'Atlas', manages: [], skill: 'skills/scout-lead-list-builder/SKILL.md' },
  Echo: { name: 'Echo', role: 'Inbox', does: 'Turns prospect replies into booked calls: drafts every reply for approval.', reportsTo: 'Ada', manages: [], skill: 'skills/echo-reply-handling/SKILL.md' },
  Riley: { name: 'Riley', role: 'Automation and fixes', does: 'Watches the systems, finds why things break and prepares the fix for your OK.', reportsTo: 'Ada', manages: [], skill: 'skills/riley-systems-repair/SKILL.md' },
  Cole: { name: 'Cole', role: 'Sales', does: 'Reviews your sales calls: score, 3 fixes with better lines, a follow-up draft.', reportsTo: 'Ada', manages: [], skill: 'skills/cole-sales-closing/SKILL.md' },
  Ledger: { name: 'Ledger', role: 'Accountant', does: 'Money report, purchase yes/no, and Xero reconciliation checks. Read only.', reportsTo: 'Ada', manages: [], skill: 'skills/ledger-finance/SKILL.md', ownerOnly: true },
  Sienna: { name: 'Sienna', role: 'Content', does: 'Finds video ideas with real demand and writes the scripts. Posts nothing.', reportsTo: 'Ada', manages: [], skill: 'skills/sienna-social-content/SKILL.md', ownerOnly: true },
};

/** Agents only the owner sees (money: Ledger; content: Sienna). */
export const OWNER_ONLY: string[] = Object.values(AGENTS).filter((a) => a.ownerOnly).map((a) => a.name);

export const isAgent = (x: unknown): x is AgentName => typeof x === 'string' && (AGENT_NAMES as readonly string[]).includes(x);

/** Accepts "ada", "Ada", "ADA". */
export function agentByName(x: string): AgentName | null {
  const n = String(x ?? '').trim().toLowerCase().replace(/^sean$/, 'echo');
  return AGENT_NAMES.find((a) => a.toLowerCase() === n) ?? null;
}

/**
 * Which agent an engine job belongs to, by its kind. sean.*, reply.*, decision.send_reply → Echo;
 * atlas.*, campaign.*, bounce.*, account.* → Atlas; scribe.* → Scribe; leadlist.* → Scout;
 * riley.* → Riley; ledger.* → Ledger; cole.* → Cole; sienna.* → Sienna; ada.* and hq.* → Ada.
 */
export function agentForJob(kind: string): AgentName | null {
  const k = String(kind ?? '');
  const p = k.split('.')[0];
  if (p === 'sean' || p === 'reply' || k === 'decision.send_reply' || k === 'calendar.book') return 'Echo';
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
    case 'Echo': return ['sean.%', 'reply.%', 'decision.send_reply'];
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

/**
 * The Decisions piles (Alex, 2026-11-27: no "Other"). Money (Ledger) and Content (Sienna) are
 * owner-only: members never get those piles.
 */
// Same order as the team (Team / Chat): Ada, Atlas·Scribe·Scout, Echo, Riley, Cole, Ledger, Sienna (Alex 2026-11-27).
export const PILES = ['Orchestrator', 'Campaigns', 'Replies', 'Fixes', 'Sales', 'Money', 'Content'] as const;
export type Pile = (typeof PILES)[number];
export const OWNER_PILES: readonly Pile[] = ['Money', 'Content'];
/** The piles this person sees, in order. */
export const pilesFor = (owner: boolean): Pile[] => PILES.filter((p) => owner || !OWNER_PILES.includes(p));

/**
 * Echo → Replies; Atlas, Scribe, Scout → Campaigns; Riley → Fixes; Ledger → Money; Cole → Sales;
 * Sienna → Content; Ada (and a decision with no known agent: Ada routes it) → Orchestrator.
 */
export function pileFor(agent: string): Pile {
  const a = String(agent ?? '').trim();
  if (a === 'Echo') return 'Replies';
  if (a === 'Atlas' || a === 'Scribe' || a === 'Scout') return 'Campaigns';
  if (a === 'Riley') return 'Fixes';
  if (a === 'Ledger') return 'Money';
  if (a === 'Cole') return 'Sales';
  if (a === 'Sienna') return 'Content';
  return 'Orchestrator';
}

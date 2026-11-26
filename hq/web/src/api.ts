// Calls to the HQ API (/hq/api, same origin). The session is an httpOnly cookie the page never sees.
export class ApiError extends Error { constructor(public status: number, message: string) { super(message); } }

export async function api<T = any>(path: string, opts: { method?: string; body?: unknown } = {}): Promise<T> {
  const res = await fetch(`/hq/api${path}`, {
    method: opts.method ?? (opts.body === undefined ? 'GET' : 'POST'),
    credentials: 'same-origin',
    headers: opts.body === undefined ? {} : { 'content-type': 'application/json' },
    body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
  });
  let data: any = null;
  try { data = await res.json(); } catch { /* not JSON */ }
  if (res.status === 401 && path !== '/auth/login') window.dispatchEvent(new Event('hq:signed-out'));
  if (!res.ok) throw new ApiError(res.status, data?.error ?? `Request failed (${res.status})`);
  return data as T;
}

export interface User { email: string; name: string; role: 'owner' | 'member' | 'client' }
export type Pile = 'Replies' | 'Campaigns' | 'Fixes' | 'Money' | 'Other';
export interface Decision {
  id: string; title: string; agent: string; client: string; pile: Pile; status: string; isReply: boolean; canEdit: boolean;
  issue: string; checked: string; fix: string; details: string; action: string; created: string; threadUrl: string; latestMessage: string;
}
export interface Task { id: string; name: string; client: string; stage: string; due: string; priority: string; status: string; notes: string; clientFacing: boolean; overdue: boolean; box: Box; stale: boolean }
export type Box = 'doNow' | 'schedule' | 'delegate' | 'later';
/** One thing an agent needs from you (GET /needs). The server builds it; text is shown escaped. */
export interface NeedLink { label: string; href: string }
export interface Need {
  key: string; kind: 'decisions' | 'issue' | 'signups' | 'ask' | 'task' | 'handled'; group: 'now' | 'later';
  agent: string; icon?: string; title: string; why: string; steps: string;
  action: NeedLink | null; link: NeedLink | null; canDone: boolean; canSnooze: boolean; count?: number; at: string;
  /** Today's order: money and client-facing first. */
  money?: boolean; clientFacing?: boolean;
  /** Yesterday: what happened. Tomorrow: "Back tomorrow" / "Due tomorrow". */
  outcome?: string; when?: string;
}
export interface NeedCounts { total: number; now: number; later: number }
export type NeedDay = 'yesterday' | 'today' | 'tomorrow';
export interface Report { id: number; agent: string; kind: string; title: string; summary: string; link: string | null; urgent: boolean; dryRun: boolean; created: string; data: any; body?: string }
export interface TeamLine { agent: string; ok: boolean | null; line: string }
/** Per agent: tasks not done, in progress, waiting on you, overdue, stalled (no update for 2+ days). */
export interface AgentWork { open: number; inProgress: number; waitingAlex: number; overdue: number; stalled: number }
export interface AgentCard {
  name: string; role: string; does: string; reportsTo: string; manages: string[]; status?: TeamLine; waiting: number; openTasks: number; lastOk: string | null; lastFail: string | null;
  work?: AgentWork;
}
export type AgentTaskStatus = 'open' | 'in_progress' | 'waiting_alex' | 'done';
export interface AgentTask {
  id: number; agent: string; title: string; due: string | null; status: AgentTaskStatus; client: string; notes: string;
  /** One line: where it is now. */
  note: string; link: string | null; priority: 'high' | 'normal' | 'low'; created: string; updated: string; done: string | null;
  overdue: boolean; stalled: boolean; daysLate: number; daysQuiet: number;
}
export interface ChatMessage { id: number; role: 'user' | 'assistant'; author: string; text: string; sources: string[]; tools: { name: string; input: any; note: string; threadId?: number }[]; created: string }
export type Light = 'red' | 'yellow' | 'green' | 'inactive';
export interface ClientCampaign { id: string; name: string; progress: number; bounce: number; sent: number; interested: number; perThousand: number | null; flag: 'pause' | 'watch' | null; next: boolean; planExists: boolean }
/** Only in the owner's answers: the server leaves it out for members. */
export interface ClientMoney { fee: number | null; feeNote: string; ltv: number | null; ltvSource: 'actual' | 'estimated' | null; receivables: number | null; months: number | null }
export interface Client {
  id: string; key: string; name: string; workspaces: { id: string; name: string; status: string; bisonId: string }[];
  active: boolean; internal: boolean; type: string; startDate: string; endDate: string; inactiveReason: string;
  light: Light; reasons: string[]; airtableHealth: string; airtableReasons: string;
  interested7: number; interestedPrev7: number; interested30: number; booked7: number; bookedPrev7: number; booked30: number; kpi: number | null;
  waitingApproval: number; seanWaiting: number; campaigns: ClientCampaign[]; note: string[]; dataIssues: string[]; money?: ClientMoney;
}
export interface ClientsSummary { active: number; internal: number; inactive: number; mrr?: number; readAt: string }
export interface HqUserRow { id: number; email: string; name: string; role: 'owner' | 'member' | 'client'; clientName?: string; status: 'pending' | 'active' | 'disabled'; google: boolean; hasPassword: boolean; lastSeen: string | null; created: string; requested: string | null }
export interface UserEvent { id: number; actor: string; action: string; target: string; detail: string; created: string }
export interface Thread { id: number; agent: string; askedBy: string; parentId: number | null; title: string; updated?: string; messages?: number }

/* ---------- Inbox (Step 3) ---------- */
export type InboxTab = 'approve' | 'waiting' | 'booked' | 'handed' | 'skipped';
/** A short status line written by the server: Problem → Data → Fix. */
export interface Note { problem: string; data: string; fix: string }
export interface InboxRow {
  id: string; tab: InboxTab | null; prospect: string; email: string; company: string; client: string; clientKey: string; wsRec: string;
  intent: string; at: string; theySaid: string; followup: number; followupType: string; nextFollowUp: string | null; bookedAt: string;
  state: string; pressed: string; error: string; bookingLink: boolean; gap: boolean;
}
export interface InboxList {
  tab: InboxTab; client: string; rows: InboxRow[]; total: number; page: number; pages: number; counts: Record<InboxTab, number>;
  clients: { key: string; name: string; count: number }[]; notes: Note[]; readAt: string;
}
export interface InboxMsg { who: 'them' | 'us' | 'unknown'; head: string; body: string; quoted: string }
export interface InboxThread {
  row: InboxRow; subject: string; campaign: string; latest: string; messages: InboxMsg[]; draft: string; reason: string; question: string;
  offeredTimes: string[]; bookingLinks: string[]; threadUrl: string; decisionId: string; canAct: boolean; canEdit: boolean; sentAt: string; dueAt: string; notes: Note[];
}

/* ---------- Client hub → AI replier ---------- */
export interface ReplierValues {
  enabled: boolean; handoff: string; replyTypes: string[]; defaultMode: string; oooMode: string; minConfidence: number; maxAuto: number;
  alwaysReview: string[]; nudge: boolean; tone: string; length: string; firstName: string; lastName: string; companyName: string; companyUrl: string;
  context: string; followupInstructions: string; calendarLink: string; timezone: string; officeStart: string; officeEnd: string; noWeekends: boolean; noHolidays: boolean;
}
export interface ReplierSummaries {
  routing: string[]; copies: string; plan: string; templates: string[]; assets: number; goal: string; language: string;
  calendar: { provider: string; status: string; jsonStatus: string; timesOff: boolean; linksOff: boolean; lastRequest: { provider: string; email: string; at: string } | null; lastResult: { status: string; expiresAt: string } | null };
}
export interface ReplierChange { field: string; from: unknown; to: unknown }
export interface ReplierDetail {
  client: { id: string; name: string }; found: boolean; rowId: string; workspaceRecordId: string; workspaceName: string; lastUpdated: string;
  values: ReplierValues | null; summaries: ReplierSummaries | null; canEdit: boolean; notes: Note[];
  options: { handoff: string[]; defaultMode: string[]; oooMode: string[]; tone: string[]; length: string[]; replyTypes: string[] };
  history: { by: string; action: string; at: string; changes: ReplierChange[] | { provider: string; email: string; expiresAt: string } }[];
  invite: { ready: boolean; why: string; provider: 'google' | 'calendly'; email: string };
}

/* ---------- Campaigns (Step 3) ---------- */
export type CampaignGroup = 'live' | 'building' | 'done';
export type StepKey = 'list' | 'copy' | 'review' | 'launch' | 'live' | 'sixty' | 'next';
export type StepState = 'done' | 'now' | 'todo' | 'bad';
export interface CampaignStep { key: StepKey; label: string; state: StepState; note: string }
export type NeedKind = 'pause' | 'failed' | 'stuck' | 'watch' | 'next' | 'review' | 'low';
export interface CampaignNeed { kind: NeedKind; agent: string; text: string }
export interface CampaignRow {
  id: string; name: string; client: string; clientKey: string; clientRec: string; clientActive: boolean | null;
  status: string; stage: string; group: CampaignGroup; old: boolean;
  progress: number; sent: number; replies: number; interested: number; booked: number; bounce: number; contacted: number; totalLeads: number; perThousand: number | null;
  flag: 'pause' | 'watch' | null; planned: boolean; steps: CampaignStep[]; now: { key: StepKey; label: string; note: string; state: StepState } | null;
  lastChange: string | null; needs: CampaignNeed[]; owner: string | null; listIds: string[];
}
export interface Channel { key: 'email' | 'linkedin' | 'caller'; label: string; live: boolean; reason: string }
export interface CampaignList {
  rows: CampaignRow[]; counts: { action: number; live: number; building: number }; client: string;
  clients: { key: string; name: string; count: number; action: number }[]; notes: Note[]; channels: Channel[];
  limits: { watch: number; pause: number; next: number; stuckDays: number; oldDays: number; lowShare: number; minSentToJudge: number };
  agencyPerThousand: number | null; readAt: string;
}
export interface CampaignLeadList { id: string; name: string; stage: string; qa: string; processing: string; leads: number; engineStatus: string; message: string; airtableUrl: string }
export interface CampaignPlanRef { id: number; state: string; label: string; client: string; campaignRec: string; error: string; created: string; updated: string }
export interface CampaignDetail {
  campaign: CampaignRow;
  detail: { approvalSource: string; approvalException: boolean; approvalDecision: string; reviewSubmitted: string; autoApprove: string; engineStatus: string; engineMessage: string; workflowError: string; processing: string; skipBouncePause: boolean };
  lists: CampaignLeadList[]; plan: CampaignPlanRef | null; next: CampaignPlanRef | null;
  history: { at: string; source: 'engine' | 'plan'; what: string; status: string; message: string; dryRun: boolean }[];
  activity: { id: string; when: string; agent: string; type: string; event: string; details: string; on: 'campaign' | 'list' }[];
  links: { airtable: string; bison: string }; readAt: string;
}

/* ---------- Client portal (Step 4): what a client login gets. The server builds each field; nothing internal. ---------- */
export type PortalHealth = 'healthy' | 'watching' | 'fixing';
export interface PortalMe { user: User; client: { name: string } }
export interface PortalCampaign { name: string; sent: number; replies: number; interested: number; booked: number; deliverability: PortalHealth }
export interface PortalOverview {
  client: { name: string }; results: { interested7: number; interested30: number; booked7: number; booked30: number };
  campaigns: PortalCampaign[]; health: { status: PortalHealth; text: string }; readAt: string;
}
export interface PortalLead { key: string; name: string; company: string; email: string; message: string; date: string; status: 'booked' | 'sent'; bookedOn: string }
export interface PortalMeeting { key: string; name: string; company: string; bookedOn: string }

/* ---------- Content (Step 3, owner only) ---------- */
export type ContentStage = 'idea' | 'approved' | 'script' | 'recorded' | 'editing' | 'review' | 'final' | 'posted';
export interface ContentNote { problem: string; data: string; fix: string; why: string; owner: string }
export interface ContentIdea {
  id: string; title: string; score: number | null; decision: string; proposed: string; recordFor: string; by: string; source: string; sourceUrl: string;
  angle: string; hook: string; why: string; airtable: string;
}
export interface ContentFinal { parentId: string; title: string; channel: string; airtable: string; clips: { id: string; name: string; score: number | null; qa: string; hook: string; caption: string; watchUrl: string; airtable: string }[] }
export interface ContentNext { title: string; who: string; how: 'hq' | 'engine' | 'field' | 'button' | 'manual'; automation: string; detail: string }
export interface FridayIdea {
  id: string; title: string; recordingDate: string; publishDate: string; late: boolean; scriptReady: boolean; script: string; angle: string; ideaHook: string;
  titles: string[]; hooks: string[]; thumbnail: string; gamma: string; gammaUrl: string; youtube: string; checks: string[]; airtable: string;
}
export interface ContentPipelineRow { id: string; title: string; channel: string; key: string; stage: ContentStage; recordingDate: string; publishDate: string; status: string; productionStage: string; next: ContentNext | null; flags: string[]; airtable: string }
export interface ContentView {
  readAt: string;
  needs: { ideas: { channel: string; key: string; label: string; count: number; items: ContentIdea[] }[]; finals: ContentFinal[]; alexSteps: { id: string; title: string; channel: string; step: string; how: string; airtable: string }[]; waitingForSienna: number };
  friday: { date: string; week: { start: string; end: string }; channels: { channel: string; key: string; label: string; target: number; approved: number; ready: number; items: FridayIdea[] }[] };
  pipeline: { stages: { key: ContentStage; label: string }[]; rows: ContentPipelineRow[]; leftOut: number };
  week: { start: string; end: string; channels: { channel: string; key: string; label: string; target: number; ideaTarget: number; proposed: number; bySienna: number; approved: number; recorded: number; posted: number }[] };
  counts: { ideas: number; finals: number; steps: number; total: number };
  notes: ContentNote[]; overlaps: string[]; links: { contentCenter: string };
  log: { by: string; action: string; record: string; title: string; changes: { field: string; from: unknown; to: unknown }[]; at: string }[];
}
export interface ContentSummary { counts: ContentView['counts']; friday: { date: string; channels: { key: string; label: string; ready: number; approved: number; target: number }[] } }

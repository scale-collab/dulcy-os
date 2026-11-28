// Calls to the HQ API (/hq/api, same origin). The session is an httpOnly cookie the page never sees.
export class ApiError extends Error { constructor(public status: number, message: string) { super(message); } }

/**
 * "View as" (owner only, per browser tab), started from Users → a person → "View as member": every
 * call says so; the server answers as for that role (member), read only. The person's name is only
 * a label for the banner ("Viewing as Josh (member)").
 */
const VIEW_KEY = 'hq.viewAs';
const WHO_KEY = 'hq.viewAsWho';
export interface ViewAsWho { name: string; role: string }
export function viewingAsMember(): boolean { try { return sessionStorage.getItem(VIEW_KEY) === 'member'; } catch { return false; } }
export function viewingAsWho(): ViewAsWho { try { const w = JSON.parse(sessionStorage.getItem(WHO_KEY) ?? 'null'); if (w && typeof w.name === 'string') return { name: w.name.slice(0, 80), role: String(w.role ?? 'member') }; } catch { /* none */ } return { name: 'a member', role: 'member' }; }
export function setViewAsMember(on: boolean, who?: ViewAsWho) {
  try {
    if (on) { sessionStorage.setItem(VIEW_KEY, 'member'); if (who) sessionStorage.setItem(WHO_KEY, JSON.stringify(who)); }
    else { sessionStorage.removeItem(VIEW_KEY); sessionStorage.removeItem(WHO_KEY); }
  } catch { /* private window */ }
}
/** Start or stop it, then reload so every screen reads as that role. */
export function switchViewAsMember(on: boolean, who?: ViewAsWho) { setViewAsMember(on, who); window.location.hash = on ? '#/today' : '#/users'; window.location.reload(); }

export async function api<T = any>(path: string, opts: { method?: string; body?: unknown } = {}): Promise<T> {
  const res = await fetch(`/hq/api${path}`, {
    method: opts.method ?? (opts.body === undefined ? 'GET' : 'POST'),
    credentials: 'same-origin',
    headers: { ...(opts.body === undefined ? {} : { 'content-type': 'application/json' }), ...(viewingAsMember() ? { 'x-hq-view': 'member' } : {}) },
    body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
  });
  let data: any = null;
  try { data = await res.json(); } catch { /* not JSON */ }
  if (res.status === 401 && path !== '/auth/login') window.dispatchEvent(new Event('hq:signed-out'));
  if (!res.ok) throw new ApiError(res.status, data?.error ?? `Request failed (${res.status})`);
  return data as T;
}

export interface User { email: string; name: string; role: 'owner' | 'member' | 'client' }
export type Pile = 'Replies' | 'Campaigns' | 'Fixes' | 'Money' | 'Sales' | 'Content' | 'Orchestrator';
export interface Decision {
  id: string; title: string; agent: string; client: string; pile: Pile; status: string; isReply: boolean; canEdit: boolean;
  issue: string; checked: string; fix: string; details: string; action: string; created: string; threadUrl: string; latestMessage: string;
  /** Unfilled placeholders in the reply draft (the server refuses to send them). */
  placeholders?: string[];
}
export interface Task { id: string; name: string; client: string; stage: string; due: string; priority: string; status: string; notes: string; clientFacing: boolean; overdue: boolean; box: Box; stale: boolean }
export type Box = 'doNow' | 'schedule' | 'delegate' | 'later';
/** One thing an agent needs from you (GET /needs). The server builds it; text is shown escaped. */
export interface NeedLink { label: string; href: string }
export interface Need {
  key: string; kind: 'decisions' | 'campaigns' | 'money' | 'checkin' | 'issue' | 'signups' | 'ask' | 'task' | 'handled' | 'calls' | 'clients'; group: 'now' | 'later';
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
export interface ClientMoney {
  /** Monthly retainer (all retainer lines); 0 = pay per call only; null = UNKNOWN. */
  fee: number | null; perCall: number | null; dealType: DealType; dealLines: { label: string; monthly: number; perCall: number }[]; dealSource: string;
  ltv: number | null; ltvSource: 'deal' | 'recorded' | null; ltvNote: string; recorded: number | null;
  /** Open invoices: coming up (not due yet) or late. */
  receivables: number | null; invoices: { amount: number; due: string; late: boolean }[]; invoicesSource: string;
  months: number | null; feeNote: string;
}
export interface Client {
  id: string; key: string; name: string; workspaces: { id: string; name: string; status: string; bisonId: string }[];
  active: boolean; internal: boolean; type: string; typeSource: string; startDate: string; endDate: string; inactiveReason: string;
  health: ClientHealth; healthLabel: string; light: Light; insight: ClientInsight | null; pace: number | null;
  kpi: number | null; kpiSource: string; meetings30: number; results: ClientResults | null; dealType: DealType; dealLabel: string;
  interested7: number; interestedPrev7: number; interested30: number; booked7: number; bookedPrev7: number; booked30: number;
  waitingApproval: number; seanWaiting: number; campaigns: ClientCampaign[]; note: string[]; money?: ClientMoney;
}
export interface ClientsSummary { active: number; internal: number; inactive: number; attention: number; atRisk: number; safe: number; unknown: number; mrr?: number; readAt: string }
export interface HqUserRow { id: number; email: string; name: string; role: 'owner' | 'member' | 'client'; clientName?: string; status: 'pending' | 'active' | 'disabled'; google: boolean; hasPassword: boolean; lastSeen: string | null; created: string; requested: string | null;
  /** A sign-up from the client portal: linked to a client, never approved as member/owner. */
  portalRequest?: boolean; resetAsked?: string | null; suggest?: { id: string; name: string } | null }
/** A Softr portal user (Airtable Portal Users) and whether it has an HQ portal login yet. */
export interface SoftrUser { rec: string; name: string; email: string; client: string; clientActive: boolean; lastSeen: string; hq: 'none' | 'client' | 'other' | 'pending'; hqId: number | null }
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
  /** "Booked: Wed Dec 3, 5:00 PM ET (Google Meet)" + its link, when Echo booked it. */
  bookedLine: string; bookedUrl: string;
  /** "Wed Dec 3, 5:00 PM ET": Send books this time first. */
  booksAt: string;
  kind: 'reply' | 'followup'; lastSentByUs: boolean;
  /** A pending draft with a booking link instead of two specific times. */
  linkDraft: { links: string[]; times: number; noTimesThen: boolean; askedForLink: boolean } | null;
}
export interface InboxList {
  tab: InboxTab; client: string; rows: InboxRow[]; total: number; page: number; pages: number; counts: Record<InboxTab, number>;
  clients: { key: string; name: string; count: number }[]; notes: Note[]; readAt: string;
  /** Every client with threads: its workspace record opens #/clients/<wsRec>/replier. */
  replierClients: { key: string; name: string; wsRec: string }[];
  /** Pending drafts with a booking link (the "Old drafts with a link" filter). */
  linkDrafts: number;
}
export interface InboxMsg { who: 'them' | 'us' | 'unknown'; head: string; body: string; quoted: string }
/** One message of the thread, oldest first. */
export interface ThreadMsg {
  who: 'them' | 'us' | 'unknown'; name: string; email: string; at: string; body: string; quoted: string;
  kind: 'sequence' | 'reply' | 'message'; step: number | null; stepFrom: 'copy' | 'order' | null; latest: boolean;
}
export interface ReplierMode { mode: 'off' | 'draft-only' | 'approval' | 'auto'; label: string; why: string; lines: string[]; clientId: string; clientName: string; found: boolean }
export interface InboxThread {
  row: InboxRow; subject: string; campaign: string; latest: string; messages: InboxMsg[]; timeline: ThreadMsg[]; stepsFromCopy: boolean; draft: string; reason: string; question: string;
  offeredTimes: string[]; bookingLinks: string[]; threadUrl: string; decisionId: string; canAct: boolean; canEdit: boolean; sentAt: string; dueAt: string; notes: Note[];
  replier: ReplierMode | null;
}
export interface LinkDraftRow {
  id: string; prospect: string; company: string; client: string; clientKey: string; wsRec: string; at: string; kind: 'reply' | 'followup';
  links: string[]; times: number; noTimesThen: boolean; askedForLink: boolean; gap: boolean; blocked: string;
  task: { status: string; note: string; updated: string } | null;
}
export interface LinkDraftsReport { total: number; pending: number; byClient: { name: string; count: number }[]; rows: LinkDraftRow[]; readAt: string }
export interface RedoResult { queued: { id: string; jobId: number; dryRun: boolean; task: number }[]; skipped: { id: string; why: string }[] }
export interface EchoLive {
  since: string; waiting: number; waitingOldest: string | null; readAt: string;
  counts: { drafted: number; needInput: number; noReply: number; leftToClient: number; other: number; dryRun: number; redone: number };
  recent: { id: string; at: string; action: string; kind: string; prospect: string; client: string; waiting: boolean; reason: string }[];
  lastRuns: { kind: string; status: string; dryRun: boolean; at: string; message: string }[];
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
  invite: { ready: boolean; why: string; provider: CalendarProvider; email: string };
}
/** Calendars a client can connect (engine/src/hq/replier.ts CALENDAR_PROVIDERS), in dropdown order. */
export const CALENDAR_PROVIDERS = [
  ['google', 'Google Calendar'], ['microsoft', 'Outlook / Microsoft 365'], ['calendly', 'Calendly'],
  ['calcom', 'Cal.com'], ['ghl', 'GoHighLevel'], ['hubspot', 'HubSpot Meetings'],
] as const;
export type CalendarProvider = typeof CALENDAR_PROVIDERS[number][0];

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
  /** Round 5: the video's Raw folder in Frame.io ('' = not set up yet). */
  rawFolderUrl: string;
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

// ---------- Sales (owner only; the server answers 403 to members) ----------
export type SalesStage = 'booked' | 'showed' | 'qualified' | 'sent' | 'signed' | 'paid' | 'onboarded';
export type SalesActionKind = 'call_today' | 'call_tomorrow' | 'no_outcome' | 'sign' | 'unsigned' | 'draft' | 'unpaid' | 'onboard' | 'rebook';
export type SalesOwner = 'Cole' | 'Alex' | 'Ledger' | 'Atlas';
export interface SalesAction { kind: SalesActionKind; owner: SalesOwner; text: string; link?: string }
export type AgreementState = 'draft' | 'sent' | 'viewed' | 'signed' | 'declined' | 'expired' | 'error' | 'none';
export interface SalesDealLite {
  id: string; name: string; company: string; stage: SalesStage; stageLabel: string; airtableStage: string; callDate: string; lost: boolean; signedDay: string;
  agreementState: AgreementState | null; client: string; needs: SalesAction[]; monthly?: number | null;
}
export interface SalesRate { n: number; of: number; text: string; pct?: number | null }
export interface SalesConversion { from: string; to: string; n: number; of: number; pct: number | null }
export interface SalesMonth { month: string; label: string; booked: number; showed: number; closed: number; showRate?: SalesRate; closeRate?: SalesRate; mrr?: number; mrrUnknown?: number }
export interface SalesNote { problem: string; data: string; fix: string; why: string; owner: string }
export interface SalesView {
  today: string; top: { thisMonth: SalesMonth; lastMonth: SalesMonth }; action: SalesDealLite[];
  pipeline: { days: number; from: string; deals: number; canceled: number; upcoming: number; stages: { key: SalesStage; label: string; count: number; deals: SalesDealLite[] }[]; showRate: SalesRate; qualifiedRate: SalesRate; closeRate: SalesRate; conversions?: SalesConversion[]; overall?: SalesRate };
  notes: SalesNote[]; counts: { action: number; deals: number }; readAt: string; limits: { unsignedDays: number; callDays: number; contractDays: number };
}
export interface SalesAgreement {
  id: string; table: 'intake' | 'contract'; tool: string; title: string; company: string; email: string; signer: string; state: AgreementState; review: string;
  created: string; sentAt: string; viewedAt: string; signedAt: string; clientSignedAt: string; forwardedAt: string; error: string; monthly?: number | null; perCall?: number | null; type: string; currency: string;
}
export interface SalesDeal {
  id: string; salesRec: string; name: string; company: string; email: string; source: string; rep: string; campaign: string; airtableStage: string; lossReason: string; notes: string;
  callDate: string; heldDate: string; bookedAt: string; stage: SalesStage; stageLabel: string; lost: boolean; inactiveClient: boolean; signedDay: string;
  stageList: { key: SalesStage; label: string; done: boolean }[]; agreements: SalesAgreement[]; agreement: SalesAgreement | null;
  client: { id: string; name: string; status: string; paid: boolean; formDone: boolean; onboardingLinked: boolean; start: string } | null; clientMatch: 'link' | 'name' | null;
  paidKnown: boolean; paidVia: string; onboardingStarted: boolean;
  feedback: { id: string; status: string; rating: number | null; notes: string; link: string; newDate: string; created: string }[];
  reviews: { id: number; kind: string; title: string; summary: string; link: string; score: number | null; created: string }[];
  prep: { id: number; title: string; created: string } | null; needs: SalesAction[];
  money?: { monthly: number | null; perCall: number | null; forecast: number | null; offer: number | null; cash: number | null; currency: string; paidTotal: number | null };
}
export interface SalesDetail {
  deal: SalesDeal; calls: { what: string; day: string; link: string }[]; onboarding: { step: string; done: boolean; note: string }[]; tasks: { id: string; task: string; stage: string }[];
  links: { airtable: string; close: string; client: string; feedback: string[]; agreements: { id: string; tool: string; title: string; state: AgreementState; url: string; reviewDoc: string; airtable: string }[] };
  notes: SalesNote[]; readAt: string;
}

/* ---------- Clients, Batch 2 (2026-11-27): health on the KPI, results, deals, owner money ---------- */
export type ClientHealth = 'safe' | 'at_risk' | 'attention' | 'unknown' | 'inactive';
export type DealType = 'retainer' | 'per_call' | 'both' | 'unknown';
/** Problem → Decision → what supports it. */
export interface ClientInsight { problem: string; decision: string; support: string }
export type ResultsWindow = '10' | '30' | '60' | '120' | 'all';
export interface ClientResults {
  window: ResultsWindow | 'custom'; sent: number; replies: number; interested: number; meetings: number;
  /** People contacted: unique leads emailed (EmailBison total_leads_contacted); null when not on record. */
  contacted: number | null;
  emailsPerMeeting: number | null; emailsPerPositive: number | null; interestedToBooked: number | null; stale: boolean;
}
export interface ClientFeedback { calls: number; qualified: number; unqualified: number; noShow: number; rated: number; avgStars: number | null; recent: { status: string; stars: number | null; notes: string; when: string }[] }
export interface ClientDetailResults {
  windows: ClientResults[]; feedback: ClientFeedback;
  /** total and roi only for the owner. */
  deals: { count: number; total?: number; roi?: number | null; list: { lead: string; value?: number | null; date: string; type: string; why: string }[] };
  onboarding: { linked: boolean; answers: { label: string; text: string }[] };
}
export type ClientPeriod = 'this-month' | 'last-month' | '3m' | '6m' | '12m' | 'this-year';
export interface ClientRangeNumbers { label: string; from: string; to: string; newClients: number; lost: number; net: number; activeAtStart: number; churnRate: number | null; newNames: string[]; lostNames: string[] }
/** Owner only (members get 403). */
export interface AgencyNumbers { period: ClientPeriod | 'custom'; mrr: number; activeClients: number; avgLtv: number | null; avgRetentionMonths: number | null; cur: ClientRangeNumbers; prev: ClientRangeNumbers; counted: number; noEndDate: string[] }
export interface ClientFinance {
  mrr: number;
  xero: { thisMonth: { from: string; to: string; income: number; costs: number }; lastMonth: { from: string; to: string; income: number; costs: number }; invoices: { contact: string; amount: number; due: string; late: boolean }[] } | null;
  cards: { card: string; dueDate: string; statement: number; balance: number; minimum: number; available: number | null; apr: string }[] | null;
  cardTotals: { statement: number; balance: number; minimum: number } | null;
  billing: { name: string; day: string; monthly: number; perCall: number; processor: string }[] | null;
  notInAirtable: string[]; errors: string[]; readAt: string;
}
/* ---------- Round 4 (2026-11-28): custom range results, profit per client, Finances ---------- */
export interface CustomRange { from: string; to: string }
export interface ClientCustomResults { from: string; to: string; label: string; rows: { id: string; key: string; name: string; results: ClientResults | null; note: string }[]; errors: string[]; readAt: string }
export interface ProfitCost { label: string; amount: number | null; note: string }
export interface ClientProfit { id: string; key: string; name: string; months: number; revenue: number | null; revenueNote: string; costs: ProfitCost[]; knownCosts: number; profit: number | null; unknown: string[] }
/** Owner only (members get 403). */
export interface ClientProfitView {
  period: ClientPeriod | 'custom'; range: { from: string; to: string; label: string }; clients: ClientProfit[];
  totals: { revenue: number; knownCosts: number; profit: number; clientsWithRevenue: number }; rules: string[]; errors: string[]; readAt: string;
}
/** key: which personal card it is (Round 5: cash preferred, amex gold, chase personal, robinhood, discover). */
export interface FinanceCard { card: string; dueDate: string; statement: number; balance: number; minimum: number; available: number | null; apr: string; key?: string }
export interface FinanceCostLine { section: string; name: string; amount: number }
/** lines: the 10 biggest; allLines: every cost line of the month (Round 5 drill-down). */
export interface FinanceMonth { from: string; to: string; income: number; costs: number; net: number; label: string; lines?: FinanceCostLine[]; allLines?: FinanceCostLine[] }
export interface FinanceInvoice { id: string; number: string; contact: string; amount: number; due: string; late: boolean }
/** One open client invoice in detail (GET /finances/invoices/<id>; Xero, read only). */
export interface FinanceInvoiceDetail {
  id: string; number: string; reference: string; contact: string; status: string; currency: string;
  date: string; due: string; daysOverdue: number; total: number | null; paid: number | null; amountDue: number | null;
  lines: { description: string; quantity: number | null; unitAmount: number | null; amount: number | null }[];
  xeroUrl: string;
}
export interface PersonalExpenses {
  lines: { name: string; amount: number | null; note: string; aside: number | null }[];
  total: number; totalFrom: 'sheet' | 'sum'; asideTotal: number; paidWith: { name: string; amount: number }[];
}
/** Both (Round 5): left = company income − company costs − personal expenses; null = UNKNOWN (see unknown). */
export interface FinanceLeftover { label: string; from: string; to: string; left: number | null; parts: { label: string; amount: number | null; source: string }[]; unknown: string[] }
/** Owner only (members get 403). */
export interface FinancesData {
  company: { xero: FinanceMonth[] | null; invoices: FinanceInvoice[]; mrr: number; cards: FinanceCard[] | null; cardTotals: { statement: number; balance: number; minimum: number } | null };
  personal: { cards: FinanceCard[] | null; cardTotals: { statement: number; balance: number; minimum: number } | null; expenses: PersonalExpenses | null };
  both: { months: FinanceLeftover[]; notCounted: string[] };
  sources: { income: string; cards: string; personalRule: string; expenses: string }; errors: string[]; readAt: string;
}
/** Finances → Personal through Plaid (GET /finances/personal). Read only; no token ever reaches the page. */
export interface PersonalAccount {
  name: string; mask: string; type: string; subtype: string; currency: string;
  current: number | null; available: number | null; limit: number | null;
  statement: number | null; minimum: number | null; due: string; overdue: boolean | null; statementDate: string; lastPayment: number | null; lastPaymentDate: string;
}
export interface PersonalConnection { id: number; institution: string; linkedAt: string; accounts: PersonalAccount[]; error: string | null }
export interface PersonalData {
  configured: boolean; message: string | null; env: 'sandbox' | 'production';
  connections: PersonalConnection[];
  totals: { cards: number; cardBalance: number; statement: number; minimum: number; cash: number } | null;
  /** Sheet personal cards (their keys: robinhood, discover, amex gold…) a linked account now replaces. */
  replaces: string[]; readAt: string;
}
// ---------- Batch 4b: Needs you (to-do), Team board, Chat threads and suggestions ----------
/** One to-do on "Needs you": the problem (title), what to do (todo), why (why), one action. */
export interface TodoItem extends Omit<Need, 'kind'> {
  kind: 'decisions' | 'campaigns' | 'money' | 'checkin' | 'issue' | 'signups' | 'ask' | 'task' | 'handled' | 'calls' | 'clients';
  todo?: string; rank?: number;
}
/** A chat in the list (GET /chat/threads): `mine` = your own; archived chats only with ?archived=1. */
export interface ChatThread extends Thread { opened?: string | null; archived?: boolean; mine?: boolean }
export interface ChatThreadFull {
  id: number; agent: string; askedBy: string; parentId: number | null; title: string; archived?: boolean; mine?: boolean;
  messages: ChatMessage[]; children: { id: number; agent: string; title: string }[];
}
export interface ChatSuggestions { agent: string; date: string; questions: string[] }
export type BoardStatus = 'all' | 'open' | 'in_progress' | 'waiting_alex' | 'done' | 'late' | 'stuck';
export type BoardDue = 'any' | 'overdue' | 'today' | 'week' | 'none';
export interface BoardAgent {
  agent: string; role: string; current: AgentTask | null; next: AgentTask | null;
  open: number; late: number; stuck: number; waitingAlex: number; lastRun: { at: string; ok: boolean; kind: string } | null;
}
export interface BoardEvent { at: string; agent: string; kind: 'task_done' | 'task_moved' | 'task_new' | 'run_failed' | 'runs_ok'; text: string; taskId?: number }
/** GET /team/work: what everyone is working on (filters: agent, client, status, due). */
export interface TeamBoard {
  filters: { agent: string | null; client: string; status: BoardStatus; due: BoardDue };
  agents: BoardAgent[]; tasks: AgentTask[]; deadlines: AgentTask[]; activity: BoardEvent[]; clients: string[];
}
// ---------- Sales, Batch 4a (owner only): periods, capacity, hottest deals, call review, contract draft ----------
export interface SalesReviewLite { id: number; score: number | null; temperature: string; verdict: string; nextStep: string; created: string; link: string }
/** /sales rows (and pipeline rows) now carry the latest call review and Cole's next step. */
export type SalesDealLite4a = SalesDealLite & { review: SalesReviewLite | null; coleNext: string };
export type SalesView4a = Omit<SalesView, 'action' | 'pipeline'> & {
  action: SalesDealLite4a[]; pipeline: Omit<SalesView['pipeline'], 'stages'> & { stages: { key: SalesStage; label: string; count: number; deals: SalesDealLite4a[] }[] }; xeroConnected: boolean;
};
export type SalesMetricKey = 'booked' | 'showed' | 'qualified' | 'sent' | 'signed' | 'paid';
export interface SalesDelta { now: number; prev: number; diff: number; dir: 'up' | 'down' | 'same' }
export interface SalesPeriod { key: 'month' | 'half' | 'year'; title: string; nowLabel: string; prevLabel: string; rows: (SalesDelta & { key: SalesMetricKey; label: string })[]; money?: SalesDelta & { unknownNow: number; unknownPrev: number } }
export interface SalesCapacitySettings { calendars: number; slotMinutes: number; slotsPerMonth: number | null }
export interface SalesCapacity {
  calendars: number; slotMinutes: number; open: { n: number | null; source: 'calendar' | 'setting' | 'none'; note: string }; bookedNext30: number; availability: number | null;
  booked: SalesRate | null; bookedPct: number | null; showRate: SalesRate; qualifiedRate: SalesRate; closeRate: SalesRate;
  daysToClose: { median: number | null; n: number; text: string }; touchesPerClose: { avg: number | null; n: number; source: 'close' | 'none'; note: string };
  atCapacity: { calls: number; shows: number; closes: number; text: string } | null; limit: { key: 'calendar' | 'show' | 'close' | 'volume' | 'unknown'; text: string };
}
export interface SalesHotDeal {
  key: string; name: string; company: string; score: number; reasons: string[]; next: string; status: string; source: 'close' | 'hq' | 'both';
  lastTouch: { day: string; what: string; snippet: string } | null; dealId: string; closeUrl: string; value?: number | null; valuePeriod?: string;
}
export interface SalesInsights {
  today: string; periods: SalesPeriod[]; conclusion: string; capacity: SalesCapacity; settings: SalesCapacitySettings; hottest: SalesHotDeal[];
  close: { connected: boolean; ok: boolean; error: string; readAt: string; open: number | null };
}
export type SalesAgreement4a = SalesAgreement & { primary: boolean; why: string };
export type SalesDetail4a = Omit<SalesDetail, 'deal' | 'links' | 'tasks'> & {
  deal: Omit<SalesDeal, 'agreements'> & { agreements: SalesAgreement4a[]; review: SalesReviewLite | null; coleNext: string; closeLead: string; paidDay: string; stages: Record<SalesStage, boolean> };
  links: { close: string; agreements: { id: string; tool: string; title: string; state: AgreementState; url: string; reviewDoc: string }[] };
};
// Round 5 (Alex 2026-11-28): two deal types only (pay per call carries the monthly tech fee); choices, not typing.
export type SalesDealType = 'retainer' | 'per_call';
export interface SalesContractDraft {
  dealType: SalesDealType; monthly: number | null; perCall: number | null; initialFee: number | null; startDate: string;
  signerName: string; signerEmail: string; signerPhone: string; legalName: string; company: string; address: string;
  serviceKey: string; termKey: string; scopeKeys: string[]; clientRespondsToLeads: boolean;
  service: string; scope: string; term: string; specialTerms: string;
  channels: { linkedin: boolean; aiCaller: boolean; directMail: boolean };
}
export interface SalesSavedDraft { id: number; dealId: string; status: 'saved' | 'creating' | 'created' | 'failed'; input: SalesContractDraft; contractsRec: string; error: string; by: string; created: string; updated: string }
export interface SalesContractOptions {
  services: { key: string; label: string }[]; terms: { key: string; label: string; type: SalesDealType; text: string }[];
  scope: { key: string; label: string; type: SalesDealType }[]; clientRespondsClause: string;
}
export interface SalesContractForm {
  deal: { id: string; name: string; company: string; email: string; closeLead: string; client: { id: string; name: string; status: string } | null; agreement: { state: AgreementState; tool: string; title: string } | null };
  draft: SalesContractDraft; saved: SalesSavedDraft | null; missing: string[]; types: { key: SalesDealType; label: string; sub: string }[];
  options: SalesContractOptions; closeConnected: boolean;
}
/** GET /sales/<id>/contract/close: what Close has for the contract (read only). */
export interface SalesClosePull {
  connected: boolean; found?: boolean; error?: string; lead?: { id: string; name: string; url: string };
  patch?: Partial<SalesContractDraft>; filled?: { label: string; value: string }[]; missing?: string[]; notes?: string[];
}

/* ---------- Content, Batch 5 (2026-11-27): laid out like the Airtable Content Center ----------
 * The server no longer sends the per-record `airtable` links listed in the Step 3 Content types above. */
export type ContentCcStage = 'Idea' | 'Script' | 'Record' | 'Edit' | 'Finalize' | 'Thumbnail' | 'Upload' | 'Clips' | 'Distribute' | 'Published';
export interface ContentItemFacts {
  decision: string; score: number | null; source: string; sourceUrl: string; script: boolean;
  video: { folder: boolean; finished: boolean; youtube: boolean; youtubeUrl: string };
  repurposing: { shortProject: boolean; clips: number; drafts: boolean };
  update: string; error: string;
  details: { productionStage: string; status: string; editingRoute: string; opusStatus: string; shortJobState: string; thumbnailStatus: string; publishingStatus: string };
}
/** Round 4 (2026-11-28): each video's real workflow (engine/src/hq/content.ts videoSteps). */
export type ContentStepWhere = 'hq' | 'sienna' | 'byHand' | 'notAutomated';
/** Round 5: the Content Center's buttons, as HQ buttons (engine contentActions.ts RUN_KEYS). */
export type ContentRunKey = 'setupFrame' | 'syncFrame' | 'routeOpus' | 'routeDavinci' | 'editFull' | 'script' | 'thumbnail' | 'thumbnailRevise' | 'thumbnailApprove'
  | 'youtubeDetails' | 'youtubeUrl' | 'shortClips' | 'refreshClips' | 'posts' | 'postsBrief' | 'postsRetry';
export interface ContentStepButton { kind: 'decide' | 'askSienna' | 'openScript' | 'copyGamma' | 'link' | 'run' | 'distribution'; label: string; url?: string; task?: string; run?: ContentRunKey; input?: 'url' | 'changes' | 'brief' }
export interface ContentStep { key: string; title: string; state: 'done' | 'now' | 'later'; where: ContentStepWhere; text: string; optional?: boolean; buttons: ContentStepButton[] }
export interface ContentPrep { script: string; titles: string[]; hooks: string[]; thumbnail: string; gamma: string; gammaUrl: string; youtube: string; checks: string[] }
export interface ContentItem extends ContentPipelineRow {
  cc: ContentCcStage; thisWeek: boolean; awaiting: boolean; done: boolean; facts: ContentItemFacts;
  posted: boolean; postedDate: string; postedFrom: string; steps: ContentStep[]; prep: ContentPrep | null;
  /** Round 5: the Content Automation Action in the field now ('' = nothing running). */
  running: string;
}
/** Round 5: GET /content/items/<rec> — YouTube copy, the posts brief and Distribution (fresh reads). */
export interface ContentPostStats { slot: string; platform: string; url: string; postedOn: string; views: number | null; likes: number | null; comments: number | null; by: string; at: string }
export interface ContentDraft {
  id: string; platform: string; outputType: string; title: string; body: string; media: string; approval: string; publishing: string;
  scheduledAt: string; postUrl: string; lastError: string; hasClip: boolean; canSchedule: boolean; stats: ContentPostStats | null;
}
export interface ContentPlatform { platform: string; drafts: ContentDraft[]; manual: ContentPostStats | null; chosen: boolean }
export interface ContentItemDetail {
  id: string; title: string; running: string;
  youtube: { title: string; description: string; chapters: string; url: string };
  thumbnail: { url: string; status: string };
  brief: { channels: string[]; count: number; minScore: number; options: string[]; clips: number };
  distribution: { status: string; platforms: ContentPlatform[]; posted: number; totals: { posts: number; views: number; likes: number; comments: number } };
}
export type ContentCenterView = Omit<ContentView, 'pipeline'> & { pipeline: { stages: ContentView['pipeline']['stages']; ccStages: ContentCcStage[]; rows: ContentItem[]; leftOut: number } };

/* ---------- Batch 3 (2026-11-27): Campaign Center layout, lead lists, inbox limits, bounces, verification ---------- */
export interface SendingSummaryB3 { total: number; healthy: number; risk: number; spam: number; resting: number; warmupOff: number; unknown: number }
export type CampaignRowB3 = CampaignRow & { approach: string; strategy: string; launchDate: string; accounts: number; sending: SendingSummaryB3 | null };
export interface ChannelB3 { key: 'email' | 'linkedin' | 'caller' | 'mail'; label: string; live: boolean; reason: string }
export type CampaignListB3 = Omit<CampaignList, 'rows' | 'channels'> & { rows: CampaignRowB3[]; channels: ChannelB3[] };
export type InboxHealthB3 = 'healthy' | 'risk' | 'spam' | 'resting';
export interface CampaignAccountB3 {
  id: string; status: InboxHealthB3 | null; warmupOff: boolean; email: string; dailyLimit: number | null; warmupLimit: number | null; warmup: number | null; score: number | null;
  /** Round 4: the score's test date and the placement cell with its reason (never a blank). */ scoreAt?: string; placement?: PlacementR4;
}
export type CampaignDetailB3 = Omit<CampaignDetail, 'campaign' | 'lists' | 'links' | 'detail'> & {
  campaign: CampaignRowB3 & { started?: string; ended?: string }; lists: Omit<CampaignLeadList, 'airtableUrl'>[]; links: { bison: string }; accounts: CampaignAccountB3[]; take?: AtlasTakeR5;
  detail: CampaignDetail['detail'] & { thesis: string; approach: string; launchDate: string };
};
export interface LeadListRowB3 {
  id: string; name: string; client: string; clientKey: string; stage: string; group: 'building' | 'done' | 'failed'; step: number; steps: number; qa: string; processing: string; progress: number | null;
  companies: number; direct: number; generic: number; leads: number; verifiers: string; source: string; thesis: string;
  campaigns: { id: string; name: string }[]; listOnly: boolean; added: string; updated: string; message: string; owner: string;
}
export interface LeadListsB3 { rows: LeadListRowB3[]; counts: { building: number; done: number; failed: number; listOnly: number }; client: string; clients: { key: string; name: string; count: number }[]; stages: string[]; doneDays: number; readAt: string }
export interface BarRowB3 { key: string; label: string; n: number; share: number }
export interface ConclusionB3 { problem: string; decision: string; support: string; text: string; tone: 'bad' | 'warn' | 'good' | 'info' }
export interface BouncesB3 {
  total: number; byCode: BarRowB3[]; byType: BarRowB3[]; byKind: BarRowB3[]; byLanding: BarRowB3[]; gateways: BarRowB3[]; byCampaign: BarRowB3[]; byAccount: BarRowB3[];
  conclusion: ConclusionB3; options: { clients: { key: string; name: string; count: number }[]; campaigns: { key: string; name: string; count: number }[]; accounts: { key: string; name: string; count: number }[] };
  filter: { client?: string; campaign?: string; account?: string; days: number }; periods: number[]; capped: boolean; maxRows: number; readAt: string;
}
export interface CohortB3 { verifier: string; emailType: string; source: string; leads: number | null; contacted: number | null; contactedEstimated: boolean; bounces: number; notFound: number; rate: number | null }
export interface VerificationB3 {
  campaigns: { id: string; name: string; client: string; clientKey: string; status: string; contacted: number; bounce: number; bounces: number; notFound: number; cohorts: CohortB3[]; verdict: 'problem' | 'watch' | 'ok' | 'few'; line: string }[];
  totals: { verifier: string; leads: number; contacted: number; bounces: number; notFound: number; rate: number | null; notFoundShare: number | null }[];
  conclusion: ConclusionB3; days: number; periods: number[]; oldCohorts: number; readAt: string;
}
export interface RampProposalB3 { key: string; clientKey: string; client: string; step: number; from: { cold: number; warmup: number }; to: { cold: number; warmup: number }; accounts: string[]; emails: string[]; sendingSince: string; days: number; why: string }
export interface LimitsB3 {
  live: boolean; canEdit: boolean; proposals: RampProposalB3[]; rule: string; bounds: { cold: { min: number; max: number }; warmup: { min: number; max: number } }; rampKnown: boolean; readAt: string;
  history: { id: number; at: string; status: string; dryRun: boolean; by: string; client: string; clientKey: string; source: string; message: string; changes: { email: string; what: string }[] }[];
}
export interface LimitResultB3 { ok: true; jobId: number; dryRun: boolean; duplicate: boolean; summary: string; changes: number; skipped: { email: string; why: string }[] }

/* ---------- Round 2 campaigns (2026-11-27): Campaign Center + Lead List Center buttons, sending accounts ---------- */
export type SectionKeyR2 = 'live' | 'launch' | 'build' | 'review' | 'internal' | 'draft' | 'none';
/** how: Today's group for a live campaign (well / pace / time / look); #/campaigns/live?how= filters to it. */
/** Round 5: started / ended (a finished campaign's last day); past = finished campaigns, newest ended first (read only). */
export type CampaignRowR2 = CampaignRowB3 & { section: SectionKeyR2; test: boolean; how?: 'well' | 'pace' | 'time' | 'look' | null; started?: string; ended?: string };
export type CampaignListR2 = Omit<CampaignListB3, 'rows' | 'counts'> & { rows: CampaignRowR2[]; sections: { key: SectionKeyR2; label: string }[]; past?: CampaignRowR2[]; counts: CampaignListB3['counts'] & { past?: number } };
/** Round 5: Atlas's take on one campaign (2-3 sentences, rule-based from its numbers, his plan and his newest note). */
export interface AtlasTakeR5 { lines: string[]; text: string; basis: 'plan' | 'note' | 'numbers'; source: string }
/** One button: what it does, what it spends, why it is off; comesNext = no engine path yet. */
export interface ActionR2 { key: string; label: string; section: string; does: string; spends: string; enabled: boolean; why: string; comesNext: boolean; dryRun: boolean; tone: 'primary' | 'quiet' | 'danger'; needsNotes?: boolean }
export interface PressR2 { ok: true; message: string; dryRun?: boolean; planId?: number }
/** Round 4: the Airtable Campaign Center's sender states (Available · Sending · Releasing Soon · Reserved Next · Disconnected · Warming). */
export type BucketR2 = 'available' | 'sending' | 'releasing' | 'reserved' | 'disconnected' | 'warming';
export interface PlacementR4 { text: string; why: string }
export interface AccountLineR2 {
  id: string; email: string; bucket: BucketR2; warming: boolean; status: InboxHealthB3; dailyLimit: number | null; warmupLimit: number | null; warmup: number | null; score: number | null; scoreAt: string; placement: PlacementR4;
  bounce: number | null; contacted: number; warmupOff: boolean; campaigns: string[]; note: string;
}
export interface SendingBoxR2 {
  client: string; clientKey: string; total: number; counts: Record<BucketR2, number>; capacity: { total: number; used: number; free: number; ready: number };
  alert: string; accounts: AccountLineR2[]; buckets: { key: BucketR2; label: string; help: string }[]; warmingDays: number;
  byClient: { key: string; name: string; total: number; counts: Record<BucketR2, number>; capacity: number; used: number }[]; readAt: string;
}
export interface PlanR2 {
  id: number; client: string; clientKey: string; state: string; label: string; campaignName: string; campaignRec: string; leadListRec: string; error: string;
  copyState: string; copyRound: number; created: string; updated: string; ended: boolean; waiting: '' | 'plan' | 'contacts' | 'copy'; decisionRec: string;
  move: string; why: string; thesis: string; questions: string[]; actions: ActionR2[];
}
export interface PlansR2 { plans: PlanR2[]; atlasOn: boolean; planDryRun: boolean; canAct: boolean; readAt: string }
export interface AutomationR2 { engineAction: string; engineStatus: string; engineMessage: string; processing: string; locked: boolean; topupStatus?: string; topupMessage?: string; workflowMessage?: string; error?: string }
export interface CampaignCenterR2 { actions: ActionR2[]; automation: AutomationR2; bison: number[]; inboxes: number; plan: PlanR2 | null; canAct: boolean }
export interface CopyR2 {
  id: string; name: string; stage: string; sequence: { step: number; variant: number; subject: string; body: string }[];
  /** Round 4: each email's versions (Scribe's "Variant N"), with the signature + P.S. the build adds, and the spintax sequence fields the build sends. */
  review: { step: number; subject: string; body: string; thread: boolean; versions: { version: number; body: string; signature: string }[]; built: { variant: number; subject: string; body: string }[] }[];
  approval: { source: string; exception: boolean; submittedAt: string; autoApproveAt: string; clientFeedback: string; changeArea: string; feedback: string; context: string };
  scribe: { notes: string; questions: string[]; variables: { name: string; find: string; fallback: string }[]; claims: { claim: string; source: string }[]; flagged: string[] } | null;
  plan: PlanR2 | null; comesNext: { key: string; label: string; why: string }[]; readAt: string;
}
export type LeadListRowR2 = LeadListRowB3 & { test: boolean; old: boolean; engineStatus: string; running: boolean };
export interface LeadListsR2 { rows: LeadListRowR2[]; counts: { building: number; done: number; failed: number; listOnly: number; running: number; tests: number; old: number }; client: string; clients: { key: string; name: string; count: number }[]; stages: string[]; doneDays: number; readAt: string; tests: boolean; old: boolean }
export interface LeadListDetailR2 {
  list: {
    id: string; name: string; client: string; clientKey: string; stage: string; step: number; steps: number; qa: string; test: boolean; icp: string; thesis: string; persona: string; source: string;
    filters: string; hasFilters: boolean; sampleSize: number; target: number; sampleApproved: boolean; contactApproved: boolean; includeDirect: boolean; includeGeneric: boolean; useLeadMagic: boolean; useDeepReview: boolean; customVars: string;
    company: { total: number; good: number; bad: number; rate: number | null; status: string; summary: string }; contact: { good: number; bad: number; rate: number | null; status: string; summary: string };
    verify: { good: number; risky: number; bad: number }; final: { direct: number; generic: number; leads: number }; verifiers: string;
    tam: { status: string; count: number | null; message: string; checkedAt: string } | null; sheet: string; campaigns: { id: string; name: string }[]; automation: AutomationR2; added: string;
  };
  next: string; actions: ActionR2[]; history: CampaignDetailB3['history']; activity: CampaignDetailB3['activity']; canAct: boolean; readAt: string;
}

/* ---------- Today, round 2 (2026-11-27): campaigns by how they are doing, the weekly scorecard, agents' 24 h ---------- */
export type CampaignHow = 'well' | 'pace' | 'time' | 'look';
export interface TodayCampaign { id: string; name: string; client: string; how: CampaignHow; why: string; signals: string[]; sent: number; interested: number; booked: number; progress: number }
export interface TodayCampaigns { live: number; agencyPerThousand: number | null; readAt: string; groups: { key: CampaignHow; label: string; sub: string; count: number; campaigns: TodayCampaign[] }[] }
export interface TodayWeekSpan { from: string; to: string; label: string; interested: number; booked: number; sent: number | null }
export interface TodayWeek { thisWeek: TodayWeekSpan; lastWeek: TodayWeekSpan; sentNote: string }
export interface TodayAgentDay { agent: string; count: number; failed: number; line: string }
/* ---------- Round 2/3 Deliverability (2026-11-27): warm-up reasons, SMTP codes, stats, placement bands, bulk limits, cost, Buy ---------- */
export type WarmupWhyR2 = 'resting' | 'replacing' | 'spam' | 'bounces' | 'unexpected';
export interface WarmupSummaryR2 { off: number; expected: number; unexpected: number; disconnected: number; byWhy: Record<WarmupWhyR2, number>; line: string; owner: 'Atlas' }
export interface RenewalGapR2 { missing: number; total: number; fromCheapInboxes: number; taskKey: string }
export interface CodeRowR2 { key: string; label: string; n: number; share: number; code: string; meaning: string; detail: string; soft: boolean | null; enhanced: { code: string; n: number; meaning: string }[] }
export interface StatsRowR2 { sent: number | null; contacted: number | null; campaigns: number; replies: number; interested: number; meetings: number; bounces: number; bounceRate: number | null; note: string }
export interface TestRunR2 { date: string; tested: number; bands: number[]; avg: number | null; underRest: number }
export interface ClientCostR2 { key: string; name: string; domains: number; inboxes: number; monthly: number; perInbox: number; source: 'cheapinboxes' | 'default' | 'mixed' }
export interface PurchaseR2 {
  id: string; request: string; status: string; domains: number | null; mailboxes: number | null; provider: string; approved: boolean; error: string; created: string;
  quoteToday: number | null; monthly: number | null; quoteAt: string; selected: number; available: number | null; tlds: string[]; next: 'quote' | 'wait' | 'approve' | 'buying' | 'done' | 'fix'; clientKey: string; client: string;
}
export interface LimitPreviewR2 { ok: true; live: boolean; changes: number; summary: string; clients: string[]; skipped: number; skippedWhy: { why: string; n: number }[]; sample: { email: string; what: string }[]; max: number }
export interface BuyResultR2 { ok: true; id: string; status: string; summary: string }
// ---------- Round 3 (Alex 2026-11-27): Sales period picker, Close pipeline + funnel, pricing, Cole's Close updates; Team agent conversations ----------
export type SalesPeriodKey = 'last30' | 'month' | 'quarter' | 'year' | 'custom';
export interface SalesWindow { from: string; to: string; label: string }
export interface SalesPeriodPick { key: SalesPeriodKey; title: string; now: SalesWindow; prev: SalesWindow }
export interface SalesNumbersMetric { key: SalesMetricKey | 'money'; label: string; now: number; prev: number; diff: number; dir: 'up' | 'down' | 'same'; pct: number | null; series: { now: number[]; prev: number[] }; unknownNow?: number; unknownPrev?: number }
export interface SalesNumbers { period: SalesPeriodPick; unit: 'day' | 'week' | 'month'; labels: { now: string[]; prev: string[] }; metrics: SalesNumbersMetric[]; conclusion: string; today: string }
export interface SalesCalendarLink { readable: boolean; connected: boolean | null; status: string; canInvite: boolean; text: string }
export type SalesCapacityR3 = SalesCapacity & { calendar?: SalesCalendarLink };
export interface SalesCloseStage { label: string; type: string; count: number; pct: number | null; prev: number; prevPct: number | null }
export interface SalesFunnelStep { key: string; label: string; stages: string[]; reached: number; pctOfTotal: number | null; pctOfPrev: number | null; daysFromPrev: number | null; daysN: number }
export interface SalesFunnelSide { total: number; won: number; lost: number; closeRate: number | null; decidedRate: number | null; avgDaysToClose: number | null; avgWinValue: number | null; valuePeriod: string; steps: SalesFunnelStep[] }
export interface SalesCloseView {
  period: SalesPeriodPick; connected: boolean; ok: boolean; error: string; readAt: string; truncated: boolean;
  pipeline: { pipeline: string; total: number; prevTotal: number; stages: SalesCloseStage[]; open: number; won: number; lost: number } | null;
  funnel: (SalesFunnelSide & { prev: SalesFunnelSide; order: 'close' | 'alex'; missing: string[] }) | null;
}
// Round 4: the P/L sheet's "OPEX Guide" plan blocks; inputs are only the sheet's lines.
export interface PriceInput { key: string; label: string; value: number; kind: 'money' | 'number'; group: 'revenue' | 'volume' | 'monthly' | 'oneoff'; note?: string }
export interface PriceOutput { key: string; label: string; value: number | null; kind: 'money' | 'pct'; note?: string }
export interface PricingModel {
  source: 'sheet' | 'builtin'; tab: string; readAt: string; plans: { key: string; name: string }[]; plan: string;
  inputs: PriceInput[]; outputs: PriceOutput[]; assumptions: string[]; error?: string;
}
export interface CloseFieldChange { field: 'confidence' | 'value' | 'value_period'; from: string; to: string }
export interface CloseUpdateRow { id: number; recordingId: string; leadId: string; oppId: string; prospect: string; status: 'updated' | 'planned' | 'unchanged' | 'no_lead' | 'no_opportunity' | 'failed'; changes: CloseFieldChange[]; note: string; applied: boolean; created: string; closeUrl: string }
export interface AgentExchange { id: string; kind: 'ask' | 'handoff'; from: string; to: string; title: string; preview: string; at: string; messages: number; threadId?: number; parentId?: number | null; taskId?: number; status?: string }
export interface AgentExchangeDetail { exchange: AgentExchange; messages: { author: string; role: 'question' | 'answer' | 'note'; text: string; at: string }[]; parent: { id: number; agent: string; title: string } | null }

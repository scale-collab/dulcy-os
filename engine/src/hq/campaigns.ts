// HQ Step 3: Campaigns (Alex 2026-11-25: "too many screens"; show what needs action first, everything
// else one tap deeper). One read-only area replacing Campaign Center, Lead List Center and the
// campaign statistics screens for daily use. Batch 3 (Alex 2026-11-27): laid out like the Airtable
// Campaign Center (name, strategy / stage, status, sending accounts, statistics), active clients only
// in the client dropdown, a Direct mail channel, a Lead lists view (lists in progress and done per
// client, including a client who buys only a list), no "Open in Airtable" links. The old Pipeline view
// is folded into the list (each row shows its step bar).
//   - Needs action: bounce pause (> 4%) / watch (> 2.5%), 60%+ with no next plan, stuck in a stage,
//     copy waiting for client review, low interested per 1,000 sent, a failed engine step.
//     One line each, with the reason and the agent that owns it.
//   - All live / Building, a client filter (workspaces that are one client count once, as clients.ts).
//   - Pipeline: list → copy → client review → launch → live → 60% → next, from the same stage and
//     status fields the engine uses (Workflow Stage, Campaign Status, Lead List Stage + QA, the
//     approval fields, campaign_plans).
//   - Campaign page: key stats, the engine's stage history (jobs + campaign plans) and the Activity log.
//   - Data notes (Problem → Data → Fix) for what looks wrong in Airtable. Read only.
// HQ writes nothing here: no Airtable, n8n, Make or EmailBison call that changes anything. There is no
// money in this area (no fee fields are read), so a member's answer is the same as the owner's minus
// owner-only agents' log rows. Airtable reads: batched, one cache for everyone, 60 seconds.
import type { Db } from '../db/pool.js';
import type { AirtableRecord } from '../providers/airtable.js';
import type { HqAirtable } from './decisions.js';
import { ACTIVITY, AF, STEP_NAMES, canonAgent } from '../activity.js';
import { rate } from '../agents/campaignPlan.js';
import { clientKey, groupWorkspaces } from './clients.js';
import { OWNER_ONLY, type AgentName } from './agents.js';

export const CAMPAIGNS_T = 'tblAVAA6uBPaMj28P';
export const LEAD_LISTS_T = 'tblVOg9BkPOMmnitt';
export const WORKSPACES_T = 'tblcjRBGJEWh5KgOt';
export const CAMPAIGNS_CACHE_MS = 60_000;
/**
 * The "needs action" limits. Bounce: RULES.md (over 2.5% watch, over 4% pause). 60%: plan the next
 * campaign (RULES 2026-11-25). Stuck: a building campaign with no stage change in 3 days. Low: under
 * 60% of the agency's interested-per-email rate on 500+ sent (Alex's SOP, the same numbers as
 * campaignPlan.recommendMove). Old: a draft untouched for 30 days is left out (counted in a note).
 */
export const CAMPAIGN_LIMITS = { watch: 2.5, pause: 4, next: 0.6, stuckDays: 3, oldDays: 30, lowShare: 0.6, minSentToJudge: 500 } as const;

/** Campaigns field IDs (airtable/SCHEMA.md; engine fields from airtable/campaignActions.ts CE). */
export const KF = {
  name: 'fldSsb4QjS9UyvKhj', status: 'fldZABZwE9SmnwMv3', stage: 'fldOVJmlGWxW1dveo', client: 'fldl5bZ644djPsBmN', lists: 'fld5weZ6ED31dBlaz',
  progress: 'fldGM1f8fNNu6ODo2', totalLeads: 'fldbYOfqWk4KrNgfz', contacted: 'fld8nKHhBCV8UFm0G',
  sent: 'fldDmaS8NZF3j0ZBY', replies: 'fldqSxElCOm0QN4kh', bouncedPct: 'fldiLOzbllDI8mn7C', interested: 'fldSRXRCC0x2AhX9h', booked: 'fldoUuw5JDk0L264W',
  statusModified: 'fldnHjTrnRPfEqM4e', created: 'fldC17C15viNdUAyN', updatedAt: 'fldcKcLrYdjEi5af7', startedAt: 'fldqKPdzUqppbItvX', completedAt: 'fldzjGuki2WoS1LBY',
  reviewSubmitted: 'fldTwdx8HHei9LeQp', autoApprove: 'fldC3vCiTcqhGaZrK', approvalSource: 'fldgHA5CcgM885Itp', approvalException: 'fld1vE0Exqlw7MMvq', approvalDecision: 'fldPEueEsGaqJRX5h',
  bisonUrl: 'fldkCJDOFglvhcvD6', processing: 'fldCebt3IMI8ZxdQq', workflowError: 'fld1ZYViMpvLDoBy2',
  engineStatus: 'fldBIuY7HML1wycLr', engineMessage: 'fldtsSMcX9XX4h1Vc', skipBouncePause: 'fldjpNVGqOLFJbcEX',
  thesis: 'fldlixHfhzrd7nuSc', approach: 'fldclFGDzjg4nvfxL', launchDate: 'fldhyq0anpSO1r0bV', emailAccounts: 'fldi906rwZ9YOpU64',
} as const;
/** Lead Lists field IDs (airtable/SCHEMA.md; engine fields from airtable/bridge.ts F). */
export const LF = {
  name: 'fldbg5PAnKyFHc3uy', fileName: 'fldlOo9lL9jvvhGo9', stage: 'fld8nrebRFL0O8kgj', qa: 'fldUB4WsLi5kq6rUy', processing: 'fldf9wpMGWg0SebHV',
  finalDirect: 'fldQZJCpTofahmTkl', finalGeneric: 'fld0FHomkh3uyx0FD', startedAt: 'fldUZOY2Ubs58DQ3V', completedAt: 'fldMSv3547BOvfdmH',
  lastError: 'fldBiCrm8Xm1V6FxF', engineStatus: 'fldpuekpeAVeP0Kqn', engineMessage: 'fld37FC33xjt25nSQ',
} as const;
const C_READ = Object.values(KF);
const L_READ = Object.values(LF);

// ---------- small helpers (pure) ----------
const s = (v: unknown): string => (Array.isArray(v) ? s(v[0]) : v === undefined || v === null ? '' : typeof v === 'object' ? String((v as any).name ?? (v as any).id ?? '') : String(v)).trim();
const n = (v: unknown): number => { const t = s(v); const x = Number(t); return t !== '' && Number.isFinite(x) ? x : 0; };
const ids = (v: unknown): string[] => (Array.isArray(v) ? v : v ? [v] : []).map((x: any) => (typeof x === 'string' ? x : x?.id)).filter((x): x is string => typeof x === 'string' && /^rec[A-Za-z0-9]{14}$/.test(x));
const prog = (v: unknown) => { const p = n(v); return p > 1 ? p / 100 : p; };
const pct = (x: number) => `${Number.isInteger(x) ? x : x.toFixed(1)}%`;
const DAY = 86_400_000;
/** Dates in HQ use slashes (Round 2 rule, Alex 2026-11-27): 11/27, New York time. */
export const shortDate = (iso: string) => (iso && Number.isFinite(Date.parse(iso)) ? new Date(iso).toLocaleDateString('en-US', { timeZone: 'America/New_York', month: 'numeric', day: 'numeric' }) : '');
const latest = (xs: (string | null | undefined)[]) => xs.filter((x): x is string => !!x && Number.isFinite(Date.parse(x))).sort((a, b) => Date.parse(b) - Date.parse(a))[0] ?? null;

// ---------- stages ----------
const APPROVED_STAGES = new Set(['Approved', 'Spintax in Progress', 'Build Ready', 'Launch Ready', 'Live']);
const COPY_DONE_STAGES = new Set(['Client Review', ...APPROVED_STAGES]);
const LAUNCH_STAGES = new Set(['Approved', 'Spintax in Progress', 'Build Ready', 'Launch Ready']);
const BUILT_STATUSES = new Set(['Emails Generated', 'Spintax Generated', 'Uploaded']);
export type Group = 'live' | 'building' | 'done';
/** Active = live; Completed / Inactive = done; anything else (Draft, Uploaded, Waiting for Approval, empty) = building. Pure. */
export const groupOf = (status: string): Group => (status === 'Active' ? 'live' : status === 'Completed' || status === 'Inactive' ? 'done' : 'building');

export const STEP_KEYS = ['list', 'copy', 'review', 'launch', 'live', 'sixty', 'next'] as const;
export type StepKey = (typeof STEP_KEYS)[number];
export const STEP_LABEL: Record<StepKey, string> = { list: 'List', copy: 'Copy', review: 'Client review', launch: 'Launch', live: 'Live', sixty: '60%', next: 'Next' };
/** Which agent owns a step when it stalls. */
export const STEP_OWNER: Record<StepKey, AgentName> = { list: 'Scout', copy: 'Scribe', review: 'Atlas', launch: 'Atlas', live: 'Atlas', sixty: 'Atlas', next: 'Atlas' };
export type StepState = 'done' | 'now' | 'todo' | 'bad';
export interface Step { key: StepKey; label: string; state: StepState; note: string }

/** campaign_plans states in plain words. */
export const PLAN_LABEL: Record<string, string> = {
  planning: 'Atlas is planning', filters: 'Filters', sample: 'Company sample', approval1: 'Waiting for your OK (plan)', expand: 'Expanding companies',
  contacts_sample: 'Contact sample', approval_contacts: 'Waiting for your OK (contacts)', contacts: 'Finding contacts', verify: 'Verifying', enrich: 'Enrichment',
  enrich_prompt: 'Enrichment prompt', enrich_run: 'Enrichment', qa: 'List QA', approval2: 'Waiting for your OK (copy + list)', approval2_wait: 'Scribe rewriting the copy',
  client_review: 'Client review', client_approved: 'Client approved', spintax: 'Spintax', need_inboxes: 'Needs inboxes', building: 'Building', launching: 'Launching',
  live: 'Live', rejected: 'Stopped (rejected)', copy_rejected: 'Copy rejected: waiting for notes', stuck: 'Stuck',
};
const PLAN_ENDED = new Set(['rejected', 'copy_rejected', 'stuck']);

export interface ListInfo { id: string; name: string; stage: string; qa: string; processing: string; leads: number; engineStatus: string; message: string; startedAt: string; completedAt: string }
export interface PlanInfo { id: number; triggerKey: string; wsRec: string; client: string; state: string; label: string; campaignRec: string; leadListRec: string; error: string; created: string; updated: string }

export interface CampaignFacts {
  id: string; name: string; status: string; stage: string; clientRec: string; listIds: string[];
  progress: number; sent: number; replies: number; interested: number; booked: number; bounce: number; contacted: number; totalLeads: number;
  approvalSource: string; approvalException: boolean; approvalDecision: string; reviewSubmitted: string; autoApprove: string;
  processing: string; workflowError: string; engineStatus: string; engineMessage: string; skipBouncePause: boolean; bisonUrl: string;
  created: string; statusModified: string; updatedAt: string; startedAt: string; completedAt: string;
  /** The strategy (Campaign Center "Campaign strategy"): thesis in plain text, approach, planned launch. */
  thesis: string; approach: string; launchDate: string; accountIds: string[];
}
const plain = (x: string) => x.replace(/<[^>]*>/g, ' ').replace(/[*_#>`]/g, '').replace(/\s+/g, ' ').trim();
export function factsOf(r: AirtableRecord): CampaignFacts {
  const f = r.fields;
  return {
    id: r.id, name: s(f[KF.name]) || 'Campaign', status: s(f[KF.status]), stage: s(f[KF.stage]), clientRec: ids(f[KF.client])[0] ?? '', listIds: ids(f[KF.lists]),
    progress: prog(f[KF.progress]), sent: n(f[KF.sent]), replies: n(f[KF.replies]), interested: n(f[KF.interested]), booked: n(f[KF.booked]), bounce: n(f[KF.bouncedPct]),
    contacted: n(f[KF.contacted]), totalLeads: n(f[KF.totalLeads]),
    approvalSource: s(f[KF.approvalSource]), approvalException: f[KF.approvalException] === true, approvalDecision: s(f[KF.approvalDecision]),
    reviewSubmitted: s(f[KF.reviewSubmitted]), autoApprove: s(f[KF.autoApprove]), processing: s(f[KF.processing]), workflowError: s(f[KF.workflowError]),
    engineStatus: s(f[KF.engineStatus]), engineMessage: s(f[KF.engineMessage]), skipBouncePause: f[KF.skipBouncePause] === true, bisonUrl: s(f[KF.bisonUrl]),
    created: s(f[KF.created]) || r.createdTime || '', statusModified: s(f[KF.statusModified]), updatedAt: s(f[KF.updatedAt]), startedAt: s(f[KF.startedAt]), completedAt: s(f[KF.completedAt]),
    thesis: plain(s(f[KF.thesis])).slice(0, 1200), approach: s(f[KF.approach]), launchDate: s(f[KF.launchDate]).slice(0, 10), accountIds: ids(f[KF.emailAccounts]),
  };
}
export function listOf(r: AirtableRecord): ListInfo {
  const f = r.fields;
  return {
    id: r.id, name: s(f[LF.name]) || s(f[LF.fileName]) || 'Lead list', stage: s(f[LF.stage]), qa: s(f[LF.qa]), processing: s(f[LF.processing]),
    leads: n(f[LF.finalDirect]) + n(f[LF.finalGeneric]), engineStatus: s(f[LF.engineStatus]), message: (s(f[LF.lastError]) || s(f[LF.engineMessage])).slice(0, 300),
    startedAt: s(f[LF.startedAt]), completedAt: s(f[LF.completedAt]),
  };
}

const approvedCopy = (c: CampaignFacts) => APPROVED_STAGES.has(c.stage) || !!c.approvalSource || c.approvalException || /^approved/i.test(c.approvalDecision);
const failed = (x: string) => /fail/i.test(x);
export const listReady = (l: ListInfo) => ['Ready', 'Uploaded'].includes(l.stage) && l.qa === 'Passed';

/**
 * The pipeline row: list → copy → client review → launch → live → 60% → next. Pure.
 * A live (Active) or finished campaign has every step before "live" done, whatever its old fields say.
 */
export function stepsOf(c: CampaignFacts, lists: ListInfo[], next: PlanInfo | null): Step[] {
  const g = groupOf(c.status);
  const on = g !== 'building';
  const st = (key: StepKey, state: StepState, note = ''): Step => ({ key, label: STEP_LABEL[key], state, note });
  const list = lists[0];
  const listStep = on ? st('list', 'done', list ? `${list.leads.toLocaleString('en-US')} leads` : '')
    : !list ? st('list', 'now', 'no lead list linked')
      : lists.every(listReady) ? st('list', 'done', `${lists.reduce((a, l) => a + l.leads, 0).toLocaleString('en-US')} leads, QA passed`)
        : lists.some((l) => l.stage === 'Failed' || failed(l.processing) || failed(l.engineStatus)) ? st('list', 'bad', `failed${list.stage ? ` at ${list.stage}` : ''}`)
          : st('list', 'now', [list.stage || 'not started', list.qa && list.qa !== 'Not Checked' && list.qa !== 'Passed' ? `QA ${list.qa}` : ''].filter(Boolean).join(' · '));
  const copyStep = on || COPY_DONE_STAGES.has(c.stage) || approvedCopy(c) ? st('copy', 'done')
    : c.stage === 'Changes Requested' ? st('copy', 'now', 'client asked for changes')
      : c.stage === 'Internal Review' ? st('copy', 'now', 'internal review')
        : c.stage === 'Strategy Draft' ? st('copy', 'now', 'strategy draft')
          : st('copy', 'todo');
  const reviewStep = on || approvedCopy(c) ? st('review', 'done', c.approvalSource || (c.approvalException ? 'exception' : ''))
    : c.stage === 'Client Review' ? st('review', 'now', c.reviewSubmitted ? `since ${shortDate(c.reviewSubmitted)}` : 'waiting for the client')
      : st('review', 'todo');
  const engineFailed = failed(c.processing) || failed(c.engineStatus);
  const launchStep = on ? st('launch', 'done')
    : engineFailed && (LAUNCH_STAGES.has(c.stage) || BUILT_STATUSES.has(c.status)) ? st('launch', 'bad', 'build or launch failed')
      : LAUNCH_STAGES.has(c.stage) || BUILT_STATUSES.has(c.status) ? st('launch', 'now', c.stage || c.status)
        : st('launch', 'todo');
  const p = Math.round(c.progress * 100);
  const liveStep = g === 'live' ? st('live', c.progress >= CAMPAIGN_LIMITS.next ? 'done' : 'now', `${p}% sent`) : g === 'done' ? st('live', 'done', c.status.toLowerCase()) : st('live', 'todo');
  const planned = !!next && !PLAN_ENDED.has(next.state);
  const sixtyStep = on && c.progress >= CAMPAIGN_LIMITS.next ? st('sixty', planned ? 'done' : g === 'live' ? 'now' : 'todo', planned ? 'next planned' : g === 'live' ? 'plan the next campaign' : '') : st('sixty', 'todo');
  const nextStep = !next ? st('next', 'todo') : next.state === 'live' ? st('next', 'done', 'next campaign live') : PLAN_ENDED.has(next.state) ? st('next', 'bad', next.label) : st('next', 'now', next.label);
  return [listStep, copyStep, reviewStep, launchStep, liveStep, sixtyStep, nextStep];
}
/** The step a campaign is on: the first one that is "bad" or "now". Pure. */
export const stepNow = (steps: Step[]): Step | null => steps.find((x) => x.state === 'bad' || x.state === 'now') ?? null;

// ---------- needs action ----------
export type NeedKind = 'pause' | 'failed' | 'stuck' | 'watch' | 'next' | 'review' | 'low';
export const NEED_ORDER: NeedKind[] = ['pause', 'failed', 'stuck', 'watch', 'next', 'review', 'low'];
export const NEED_LABEL: Record<NeedKind, string> = { pause: 'Pause', failed: 'Failed', stuck: 'Stuck', watch: 'Watch', next: 'Plan next', review: 'Client review', low: 'Low interest' };
export interface NeedLine { kind: NeedKind; agent: AgentName; text: string }

export interface NeedCtx { now: number; agencyRate: number | undefined; lastChange: string | null; next: PlanInfo | null }
/** Why a campaign needs action, most urgent first (empty = nothing to do). Pure. */
export function needsFor(c: CampaignFacts, steps: Step[], ctx: NeedCtx): NeedLine[] {
  const L = CAMPAIGN_LIMITS;
  const g = groupOf(c.status);
  const out: NeedLine[] = [];
  if (g === 'done') return out;
  if (g === 'live' && c.bounce > L.pause) out.push({ kind: 'pause', agent: 'Atlas', text: `Bounce ${pct(c.bounce)}: pause and investigate${c.skipBouncePause ? ' (Skip Bounce Pause is on)' : ''}.` });
  const bad = steps.find((x) => x.state === 'bad' && x.key !== 'next');
  if (bad) {
    const msg = (bad.key === 'list' ? '' : c.workflowError || c.engineMessage).replace(/\s+/g, ' ').slice(0, 140);
    out.push({ kind: 'failed', agent: bad.key === 'list' ? 'Scout' : 'Riley', text: `${bad.key === 'list' ? 'Lead list step failed' : 'Build or launch failed'}${msg ? `: ${msg}` : '.'}` });
  } else if (g === 'live' && (failed(c.processing) || failed(c.engineStatus)) && c.engineMessage) {
    out.push({ kind: 'failed', agent: 'Riley', text: `Engine step failed: ${c.engineMessage.replace(/\s+/g, ' ').slice(0, 140)}` });
  }
  if (g === 'building') {
    const at = steps.find((x) => x.state === 'now');
    const days = ctx.lastChange ? Math.floor((ctx.now - Date.parse(ctx.lastChange)) / DAY) : null;
    const pastAuto = c.stage === 'Client Review' && c.autoApprove && ctx.now > Date.parse(c.autoApprove);
    if (pastAuto) out.push({ kind: 'stuck', agent: 'Atlas', text: `Client review is past its auto-approve time (${shortDate(c.autoApprove)}).` });
    else if (at && days !== null && days >= L.stuckDays && days < L.oldDays) out.push({ kind: 'stuck', agent: STEP_OWNER[at.key], text: `No stage change in ${days} days (${at.label}${at.note ? `: ${at.note}` : ''}).` });
    else if (c.stage === 'Client Review') out.push({ kind: 'review', agent: 'Atlas', text: `Copy waiting for client review${c.reviewSubmitted ? ` since ${shortDate(c.reviewSubmitted)}` : ''}${c.autoApprove ? ` · auto-approves ${shortDate(c.autoApprove)}` : ''}.` });
  }
  if (g === 'live' && c.bounce > L.watch && c.bounce <= L.pause) out.push({ kind: 'watch', agent: 'Atlas', text: `Bounce ${pct(c.bounce)}: watch (over 2.5%).` });
  const planned = !!ctx.next && !PLAN_ENDED.has(ctx.next.state);
  if (g === 'live' && c.progress >= L.next && c.progress < 1 && !planned) out.push({ kind: 'next', agent: 'Atlas', text: `At ${Math.round(c.progress * 100)}% sent: plan the next campaign.` });
  if (g === 'live' && c.sent >= L.minSentToJudge && ctx.agencyRate && c.interested / c.sent < L.lowShare * ctx.agencyRate) {
    out.push({ kind: 'low', agent: 'Atlas', text: `${perK(c.interested, c.sent)} interested per 1,000 sent vs ${Math.round(ctx.agencyRate * 10_000) / 10} agency average: new vertical (Scout) or copy test (Scribe).` });
  }
  return out.sort((a, b) => NEED_ORDER.indexOf(a.kind) - NEED_ORDER.indexOf(b.kind));
}
const perK = (interested: number, sent: number) => Math.round((interested / sent) * 10_000) / 10;

// ---------- one row per campaign ----------
export interface ClientRef { key: string; name: string; active: boolean }
export interface CampaignRow {
  id: string; name: string; client: string; clientKey: string; clientRec: string; clientActive: boolean | null;
  status: string; stage: string; group: Group; old: boolean;
  progress: number; sent: number; replies: number; interested: number; booked: number; bounce: number; contacted: number; totalLeads: number; perThousand: number | null;
  flag: 'pause' | 'watch' | null; planned: boolean; steps: Step[]; now: { key: StepKey; label: string; note: string; state: StepState } | null;
  lastChange: string | null; needs: NeedLine[]; owner: AgentName | null; listIds: string[];
  /** Campaign Center columns: the strategy line and the sending accounts. */
  approach: string; strategy: string; launchDate: string; accounts: number; sending: SendingSummary | null;
  /** Round 2: the Campaign Center stage section (Workflow Stage, live first); a test campaign by its name. */
  section: SectionKey; test: boolean;
}
/** Round 2 (Alex 2026-11-27): campaigns by stage, as in the Airtable Campaign Center (Workflow Stage), live first. */
export const SECTIONS = [
  { key: 'live', label: 'Live', stages: [] as string[] },
  { key: 'launch', label: 'Launch ready', stages: ['Launch Ready', 'Live'] },
  { key: 'build', label: 'Approved: spintax and build', stages: ['Approved', 'Spintax in Progress', 'Build Ready'] },
  { key: 'review', label: 'Client review', stages: ['Client Review', 'Changes Requested'] },
  { key: 'internal', label: 'Internal review', stages: ['Internal Review'] },
  { key: 'draft', label: 'Strategy draft', stages: ['Strategy Draft'] },
  { key: 'none', label: 'No stage set', stages: [] as string[] },
] as const;
export type SectionKey = (typeof SECTIONS)[number]['key'];
/** Which section a campaign sits in. Pure. */
export const sectionOf = (group: Group, stage: string): SectionKey => (group === 'live' ? 'live' : SECTIONS.find((x) => (x.stages as readonly string[]).includes(stage))?.key ?? 'none');
/** A test by its name ("NJ Real Estate Test", "ENGINE TEST - bridge check"). Pure. */
export const isTest = (name: string) => /\b(test|testing|tests)\b|engine test|bridge check|\bdemo\b|\bsandbox\b/i.test(name);
/** The campaign's sending inboxes by status (from Deliverability), when that read is there. */
export interface SendingSummary { total: number; healthy: number; risk: number; spam: number; resting: number; warmupOff: number; unknown: number }
export interface InboxLite { status: 'healthy' | 'risk' | 'spam' | 'resting'; warmupOff: boolean; email: string; dailyLimit: number | null; warmupLimit: number | null; warmup: number | null; score: number | null }
/** Sending accounts summary from an inbox index. Pure. */
export function sendingOf(accountIds: string[], inboxes?: Map<string, InboxLite>): SendingSummary | null {
  if (!inboxes) return null;
  const out: SendingSummary = { total: accountIds.length, healthy: 0, risk: 0, spam: 0, resting: 0, warmupOff: 0, unknown: 0 };
  for (const id of accountIds) { const i = inboxes.get(id); if (!i) { out.unknown++; continue; } out[i.status]++; if (i.warmupOff) out.warmupOff++; }
  return out;
}

/** Workspace record → client (the Twenty West pair and Dulcy + Dulcy Free Campaigns count once). Pure. */
export function clientIndex(ws: AirtableRecord[]): Map<string, ClientRef> {
  const out = new Map<string, ClientRef>();
  for (const group of groupWorkspaces(ws)) {
    const names = group.map((w) => s(w.fields.Name).replace(/\s*\(internal\)\s*$/i, '').trim());
    const name = names.reduce((a, b) => (b.length < a.length ? b : a), names[0]);
    const ref = { key: clientKey(name), name, active: group.some((w) => s(w.fields.Status) === 'Active') };
    for (const w of group) out.set(w.id, ref);
  }
  return out;
}

export interface CampaignsSource { campaigns: AirtableRecord[]; lists: AirtableRecord[]; ws: AirtableRecord[]; plans: PlanInfo[]; changes: Map<string, string>; readAt: string }

/** The plan whose trigger is this campaign (its 60% → next), else a live plan for the same client from the last 30 days. Pure. */
export function nextPlanFor(c: Pick<CampaignFacts, 'id' | 'clientRec'>, plans: PlanInfo[], now: number): PlanInfo | null {
  return plans.find((p) => p.triggerKey === `next:${c.id}`)
    ?? plans.find((p) => !!c.clientRec && p.wsRec === c.clientRec && p.campaignRec !== c.id && !PLAN_ENDED.has(p.state) && now - Date.parse(p.created) < 30 * DAY) ?? null;
}

/** Rows from the source. Pure (now passed in). */
export function buildRows(src: CampaignsSource, now = Date.now(), inboxes?: Map<string, InboxLite>): CampaignRow[] {
  const clients = clientIndex(src.ws);
  const listsById = new Map(src.lists.map((l) => [l.id, listOf(l)]));
  const facts = src.campaigns.map(factsOf);
  const agencyRate = rate(facts.map((c) => ({ id: c.id, name: c.name, client: c.clientRec, sent: c.sent, interested: c.interested, progress: c.progress, status: c.status, canNewOffer: false })));
  return facts.map((c): CampaignRow => {
    const lists = c.listIds.map((id) => listsById.get(id)).filter((x): x is ListInfo => !!x);
    const next = nextPlanFor(c, src.plans, now);
    const steps = stepsOf(c, lists, next);
    const ownPlan = src.plans.find((p) => p.campaignRec === c.id);
    const lastChange = latest([c.statusModified, c.reviewSubmitted, c.startedAt, c.completedAt, c.updatedAt, ...lists.flatMap((l) => [l.startedAt, l.completedAt]),
      src.changes.get(c.id), ...c.listIds.map((id) => src.changes.get(id)), ownPlan?.updated]) ?? (c.created || null);
    const group = groupOf(c.status);
    const needs = needsFor(c, steps, { now, agencyRate, lastChange, next });
    const ref = clients.get(c.clientRec);
    const cur = stepNow(steps);
    return {
      id: c.id, name: c.name, client: ref?.name ?? '', clientKey: ref?.key ?? '', clientRec: c.clientRec, clientActive: ref ? ref.active : null,
      status: c.status, stage: c.stage, group, old: group === 'building' && !!lastChange && now - Date.parse(lastChange) >= CAMPAIGN_LIMITS.oldDays * DAY,
      progress: c.progress, sent: c.sent, replies: c.replies, interested: c.interested, booked: c.booked, bounce: c.bounce, contacted: c.contacted, totalLeads: c.totalLeads,
      perThousand: c.sent >= 100 ? perK(c.interested, c.sent) : null,
      flag: group === 'live' && c.bounce > CAMPAIGN_LIMITS.pause ? 'pause' : group === 'live' && c.bounce > CAMPAIGN_LIMITS.watch ? 'watch' : null,
      planned: !!next && !PLAN_ENDED.has(next.state), steps, now: cur ? { key: cur.key, label: cur.label, note: cur.note, state: cur.state } : null,
      lastChange, needs, owner: needs[0]?.agent ?? null, listIds: c.listIds,
      approach: c.approach, strategy: c.thesis.slice(0, 220), launchDate: c.launchDate, accounts: c.accountIds.length, sending: sendingOf(c.accountIds, inboxes),
      section: sectionOf(group, c.stage), test: isTest(c.name),
    };
  });
}

export interface Note { problem: string; data: string; fix: string }
const few = (xs: string[]) => `${xs.length}: ${xs.slice(0, 3).join(', ')}${xs.length > 3 ? ` +${xs.length - 3} more` : ''}`;
/** Problem → Data → Fix for what looks wrong in Airtable (read only; Atlas fixes it there). Pure. */
export function campaignNotes(rows: CampaignRow[]): Note[] {
  const out: Note[] = [];
  const current = rows.filter((r) => r.group !== 'done' && !r.old);
  const live = rows.filter((r) => r.group === 'live');
  const draftNamed = live.filter((r) => /\bdraft\b/i.test(r.name));
  if (draftNamed.length) out.push({ problem: `Active campaign${draftNamed.length === 1 ? '' : 's'} named "DRAFT"`, data: few(draftNamed.map((r) => r.name)), fix: 'Atlas: rename it or set the right Campaign Status in Airtable.' });
  const noClient = current.filter((r) => !r.clientRec || r.clientActive === null);
  if (noClient.length) out.push({ problem: `Campaign${noClient.length === 1 ? '' : 's'} with no client link`, data: few(noClient.map((r) => r.name)), fix: 'Atlas: link the client in Airtable so it counts for the right client.' });
  const inactiveClient = live.filter((r) => r.clientActive === false);
  if (inactiveClient.length) out.push({ problem: 'Active campaigns for an inactive client', data: few(inactiveClient.map((r) => `${r.name} (${r.client})`)), fix: 'Atlas: check whether they should still send; pause in Campaign Center if not.' });
  const disagree = rows.filter((r) => (r.group === 'live' && r.stage && !APPROVED_STAGES.has(r.stage)) || (r.group === 'building' && !r.old && r.stage === 'Live'));
  if (disagree.length) out.push({ problem: 'Stage and status disagree', data: few(disagree.map((r) => `${r.name} (${r.status || 'no status'} / ${r.stage})`)), fix: 'Atlas: set Workflow Stage or Campaign Status to what is true.' });
  const old = rows.filter((r) => r.old);
  if (old.length) out.push({ problem: `Draft${old.length === 1 ? '' : 's'} untouched for ${CAMPAIGN_LIMITS.oldDays}+ days`, data: few(old.map((r) => r.name)), fix: 'Atlas: finish them or set them Inactive in Airtable. They are left out of Building.' });
  return out;
}

// ---------- reads (batched, one cache for everyone) ----------
const CURRENT_FORMULA = `OR(AND({Campaign Status}!='Completed',{Campaign Status}!='Inactive'),{Emails Sent}>=${CAMPAIGN_LIMITS.minSentToJudge})`;
const chunk = <T,>(xs: T[], size: number) => Array.from({ length: Math.ceil(xs.length / size) }, (_, i) => xs.slice(i * size, i * size + size));

async function readLists(at: Pick<HqAirtable, 'list'>, wanted: string[]): Promise<AirtableRecord[]> {
  const uniq = [...new Set(wanted)];
  if (!uniq.length) return [];
  const parts = await Promise.all(chunk(uniq, 60).map((c) => at.list(LEAD_LISTS_T, `OR(${c.map((id) => `RECORD_ID()='${id}'`).join(',')})`, L_READ, c.length)));
  const set = new Set(uniq);
  return parts.flat().filter((r) => set.has(r.id));
}

function planRow(x: any): PlanInfo {
  return {
    id: Number(x.id), triggerKey: String(x.trigger_key), wsRec: String(x.ws_rec), client: String(x.client ?? ''), state: String(x.state), label: PLAN_LABEL[x.state] ?? String(x.state),
    campaignRec: String(x.campaign_rec ?? ''), leadListRec: String(x.lead_list_rec ?? ''), error: String(x.plan_error ?? '').slice(0, 300),
    created: new Date(x.created_at).toISOString(), updated: new Date(x.updated_at).toISOString(),
  };
}

/** Every row the area needs: Campaigns (current + 500+ sent for the agency average), their lead lists, Workspace IDs, plans and the engine's last job per record. */
export async function readCampaignsSource(at: Pick<HqAirtable, 'list'>, db: Db): Promise<CampaignsSource> {
  const [rows, ws, plans] = await Promise.all([
    at.list(CAMPAIGNS_T, CURRENT_FORMULA, C_READ, 3000),
    at.list(WORKSPACES_T, `{Name}!=''`, ['Name', 'Status', 'Client Type', 'Client', 'ID'], 300, { byName: true }),
    db.query(`SELECT id, trigger_key, ws_rec, client, state, campaign_rec, lead_list_rec, plan_error, created_at, updated_at FROM campaign_plans ORDER BY id`).then((r) => r.rows.map(planRow)),
  ]);
  // The formula already filters; filtered again so a copy of the rows can never widen it.
  const campaigns = rows.filter((r) => groupOf(s(r.fields[KF.status])) !== 'done' || n(r.fields[KF.sent]) >= CAMPAIGN_LIMITS.minSentToJudge);
  const building = campaigns.filter((r) => groupOf(s(r.fields[KF.status])) === 'building');
  const lists = await readLists(at, building.flatMap((r) => ids(r.fields[KF.lists])));
  const recs = [...new Set([...campaigns.map((r) => r.id), ...lists.map((l) => l.id)])];
  const changes = new Map<string, string>();
  if (recs.length) {
    const r = await db.query(
      `SELECT rec, max(at) AS at FROM (
         SELECT record_id AS rec, updated_at AS at FROM jobs WHERE record_id = ANY($1)
         UNION ALL SELECT aj.campaign_record, j.updated_at FROM airtable_jobs aj JOIN jobs j ON j.id = aj.job_id WHERE aj.campaign_record = ANY($1)
       ) x GROUP BY rec`, [recs]);
    for (const x of r.rows) changes.set(String(x.rec), new Date(x.at).toISOString());
  }
  return { campaigns, lists, ws, plans, changes, readAt: new Date().toISOString() };
}

let cache: { at: number; data: Promise<CampaignsSource> } | null = null;
const activityCache = new Map<string, { at: number; rows: Promise<AirtableRecord[]> }>();
export function _resetCampaignsCache() { cache = null; activityCache.clear(); _resetListsCache(); }
/** The cached source (60 s). refresh=true re-reads if the copy is older than 10 seconds. */
export function cachedCampaigns(at: Pick<HqAirtable, 'list'>, db: Db, refresh = false, now = Date.now()): Promise<CampaignsSource> {
  if (cache && now - cache.at < (refresh ? 10_000 : CAMPAIGNS_CACHE_MS)) return cache.data;
  const data = readCampaignsSource(at, db);
  cache = { at: now, data };
  data.catch(() => { if (cache?.data === data) cache = null; });
  return data;
}

// ---------- channels ----------
export interface Channel { key: 'email' | 'linkedin' | 'caller' | 'mail'; label: string; live: boolean; reason: string }
/** Only cold email works right now (CLAUDE.md, company/channels-status.md). */
export const CHANNELS: Channel[] = [
  { key: 'email', label: 'Email', live: true, reason: '' },
  { key: 'linkedin', label: 'LinkedIn', live: false, reason: 'LinkedIn needs system fixes first: the HeyReach flow was left unfinished and its reporting has duplicate rows. Only cold email works right now.' },
  { key: 'caller', label: 'AI caller', live: false, reason: 'The AI caller underperforms (wrong outcome labels, missed routing) and its direction is undecided: fix it or replace it with people. Only cold email works right now.' },
  { key: 'mail', label: 'Direct mail', live: false, reason: 'Direct mail is not running yet: it needs system fixes first. Only cold email works right now.' },
];

// ---------- GET /campaigns ----------
const sortRows = (rows: CampaignRow[]) => [...rows].sort((a, b) => {
  const ka = a.needs[0] ? NEED_ORDER.indexOf(a.needs[0].kind) : 99, kb = b.needs[0] ? NEED_ORDER.indexOf(b.needs[0].kind) : 99;
  return ka - kb || b.bounce - a.bounce || b.progress - a.progress || a.name.localeCompare(b.name);
});

/**
 * opts.how: how each live campaign is doing (Today's groups, today.ts campaignHow; passed in by the
 * server because today.ts imports this file). Today links to #/campaigns/live?how=<key>.
 */
export async function listCampaigns(at: Pick<HqAirtable, 'list'>, db: Db, opts: { client?: string; refresh?: boolean; inboxes?: Map<string, InboxLite>; how?: (all: CampaignRow[]) => Map<string, string> } = {}) {
  const src = await cachedCampaigns(at, db, opts.refresh);
  const all = buildRows(src, Date.now(), opts.inboxes);
  const visible = all.filter((r) => r.group !== 'done' && !r.old);
  // The client dropdown offers ACTIVE clients only (Alex 2026-11-27: no Lucky DMs, no Lead Flo).
  const active = [...new Map([...clientIndex(src.ws).values()].filter((c) => c.active).map((c) => [c.key, c])).values()];
  const client = opts.client && active.some((c) => c.key === opts.client) ? opts.client : '';
  const mine = client ? visible.filter((r) => r.clientKey === client) : visible;
  const byKey = new Map<string, { key: string; name: string; count: number; action: number }>(active.map((c) => [c.key, { key: c.key, name: c.name, count: 0, action: 0 }]));
  for (const r of visible) {
    if (!r.clientKey || !byKey.has(r.clientKey)) continue;
    const e = byKey.get(r.clientKey) ?? { key: r.clientKey, name: r.client, count: 0, action: 0 };
    e.count++; if (r.needs.length) e.action++;
    byKey.set(r.clientKey, e);
  }
  const facts = src.campaigns.map(factsOf);
  const agencyRate = rate(facts.map((c) => ({ id: c.id, name: c.name, client: c.clientRec, sent: c.sent, interested: c.interested, progress: c.progress, status: c.status, canNewOffer: false })));
  return {
    rows: (() => { const how = opts.how?.(all); return sortRows(mine).map((r) => (how ? { ...r, how: how.get(r.id) ?? null } : r)); })(),
    counts: { action: mine.filter((r) => r.needs.length).length, live: mine.filter((r) => r.group === 'live').length, building: mine.filter((r) => r.group === 'building').length },
    client, clients: [...byKey.values()].sort((a, b) => b.action - a.action || a.name.localeCompare(b.name)),
    notes: campaignNotes(client ? all.filter((r) => r.clientKey === client) : all),
    channels: CHANNELS, limits: CAMPAIGN_LIMITS, agencyPerThousand: agencyRate ? Math.round(agencyRate * 10_000) / 10 : null, readAt: src.readAt,
    sections: SECTIONS.map((x) => ({ key: x.key, label: x.label })),
  };
}

// ---------- GET /campaigns/:id ----------
export interface HistoryRow { at: string; source: 'engine' | 'plan'; what: string; status: string; message: string; dryRun: boolean }
export interface ActivityOut { id: string; when: string; agent: string; type: string; event: string; details: string; on: 'campaign' | 'list' }
const q = (t: string) => t.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
const ACT_FIELDS = [AF.event, AF.when, AF.agent, AF.type, AF.details, AF.campaign, AF.leadList];

function cachedList(key: string, read: () => Promise<AirtableRecord[]>): Promise<AirtableRecord[]> {
  const hit = activityCache.get(key);
  if (hit && Date.now() - hit.at < CAMPAIGNS_CACHE_MS) return hit.rows;
  const rows = read();
  activityCache.set(key, { at: Date.now(), rows });
  rows.catch(() => activityCache.delete(key));
  return rows;
}

/** Activity Log rows linked to the campaign or its lead lists, newest first. Two cached reads: the newest 500 rows (shared), and this campaign's by name (older rows). */
export async function campaignActivity(at: Pick<HqAirtable, 'list'>, c: { id: string; name: string; listIds: string[] }, owner: boolean, limit = 60): Promise<ActivityOut[]> {
  const [recent, own] = await Promise.all([
    cachedList('recent', () => at.list(ACTIVITY, 'TRUE()', ACT_FIELDS, 500, { sortField: AF.when, sortDesc: true })).catch(() => [] as AirtableRecord[]),
    // The Activity Log's link field is named "Campaign" (UNKNOWN until checked live); a wrong name only drops this second read.
    // A lead list on its own (no campaign id) reads only the shared newest rows.
    c.id ? cachedList(`c:${c.id}`, () => at.list(ACTIVITY, `FIND('${q(c.name)}',ARRAYJOIN({Campaign}))`, ACT_FIELDS, 200, { sortField: AF.when, sortDesc: true })).catch(() => [] as AirtableRecord[]) : Promise.resolve([] as AirtableRecord[]),
  ]);
  const seen = new Set<string>();
  const out: ActivityOut[] = [];
  for (const r of [...recent, ...own]) {
    if (seen.has(r.id)) continue;
    const onCampaign = !!c.id && ids(r.fields[AF.campaign]).includes(c.id);
    const onList = ids(r.fields[AF.leadList]).some((id) => c.listIds.includes(id));
    if (!onCampaign && !onList) continue;
    const agent = canonAgent(s(r.fields[AF.agent])) || 'Engine';
    if (!owner && OWNER_ONLY.includes(agent)) continue;
    seen.add(r.id);
    out.push({ id: r.id, when: s(r.fields[AF.when]), agent, type: s(r.fields[AF.type]), event: s(r.fields[AF.event]) || 'Step', details: s(r.fields[AF.details]).slice(0, 2000), on: onCampaign ? 'campaign' : 'list' });
  }
  return out.sort((a, b) => (Date.parse(b.when) || 0) - (Date.parse(a.when) || 0)).slice(0, limit);
}

/** The engine's stage history: its jobs on the campaign, its parts and lead lists, and the campaign plan's state. */
export async function engineHistory(db: Db, recs: string[], plans: PlanInfo[], limit = 40): Promise<HistoryRow[]> {
  const r = await db.query(
    `SELECT j.id, j.kind, j.status, j.updated_at, j.dry_run, COALESCE(j.result->>'message', j.error, j.progress, '') AS message FROM jobs j
     WHERE j.record_id = ANY($1) OR j.id IN (SELECT job_id FROM airtable_jobs WHERE campaign_record = ANY($1) OR target_record = ANY($1) OR parent_record = ANY($1))
     ORDER BY j.id DESC LIMIT $2`, [recs, limit]);
  const jobs: HistoryRow[] = r.rows.map((x) => ({ at: new Date(x.updated_at).toISOString(), source: 'engine', what: STEP_NAMES[x.kind] ?? String(x.kind), status: String(x.status), message: String(x.message ?? '').replace(/\s+/g, ' ').slice(0, 300), dryRun: Boolean(x.dry_run) }));
  const planRows: HistoryRow[] = plans.flatMap((p) => [
    { at: p.updated, source: 'plan' as const, what: `Campaign plan #${p.id}: ${p.label}`, status: p.state, message: p.error, dryRun: false },
    ...(p.created !== p.updated ? [{ at: p.created, source: 'plan' as const, what: `Campaign plan #${p.id} started`, status: 'started', message: '', dryRun: false }] : []),
  ]);
  return [...jobs, ...planRows].sort((a, b) => Date.parse(b.at) - Date.parse(a.at)).slice(0, limit);
}

/** Kept for other screens (Sales); Campaigns shows no Airtable links any more. */
export const airtableUrl = (baseId: string, table: string, rec: string) => `https://airtable.com/${baseId}/${table}/${rec}`;
const ACC_RANK = (s: string | null) => (s === 'spam' ? 0 : s === 'resting' ? 1 : s === 'risk' ? 2 : s === 'healthy' ? 3 : 4);

export async function campaignDetail(at: Pick<HqAirtable, 'list' | 'get'>, db: Db, id: string, owner: boolean, inboxes?: Map<string, InboxLite>) {
  const src = await cachedCampaigns(at, db);
  let rec = src.campaigns.find((r) => r.id === id) ?? null;
  if (!rec) rec = await at.get(CAMPAIGNS_T, id, C_READ);
  if (!rec || rec.id !== id) return null;
  const f = factsOf(rec);
  const missing = f.listIds.filter((l) => !src.lists.some((x) => x.id === l));
  const lists = [...src.lists.filter((l) => f.listIds.includes(l.id)), ...(await readLists(at, missing))];
  const one: CampaignsSource = { ...src, campaigns: [rec, ...src.campaigns.filter((r) => r.id !== id && n(r.fields[KF.sent]) >= CAMPAIGN_LIMITS.minSentToJudge)], lists };
  const row = buildRows(one, Date.now(), inboxes).find((r) => r.id === id)!;
  const ownPlans = src.plans.filter((p) => p.campaignRec === id || (p.leadListRec && f.listIds.includes(p.leadListRec)));
  const next = nextPlanFor(f, src.plans, Date.now());
  const [history, activity] = await Promise.all([
    engineHistory(db, [id, ...f.listIds], ownPlans),
    campaignActivity(at, { id, name: f.name, listIds: f.listIds }, owner),
  ]);
  return {
    campaign: row,
    detail: {
      approvalSource: f.approvalSource, approvalException: f.approvalException, approvalDecision: f.approvalDecision, reviewSubmitted: f.reviewSubmitted, autoApprove: f.autoApprove,
      engineStatus: f.engineStatus, engineMessage: f.engineMessage.slice(0, 600), workflowError: f.workflowError.slice(0, 600), processing: f.processing, skipBouncePause: f.skipBouncePause,
      thesis: f.thesis, approach: f.approach, launchDate: f.launchDate,
    },
    lists: lists.map(listOf),
    // Campaign Center "Sender accounts": each sending inbox with its Deliverability status (worst first).
    accounts: f.accountIds.map((rec) => ({ id: rec, ...(inboxes?.get(rec) ?? { status: null, warmupOff: false, email: '', dailyLimit: null, warmupLimit: null, warmup: null, score: null }) }))
      .sort((a, b) => ACC_RANK(a.status) - ACC_RANK(b.status) || Number(b.warmupOff) - Number(a.warmupOff) || a.email.localeCompare(b.email)),
    plan: ownPlans[0] ?? null, next,
    history, activity,
    links: { bison: /^https:\/\//i.test(f.bisonUrl) ? f.bisonUrl : '' },
    readAt: src.readAt,
  };
}

// ---------- GET /campaigns/lists: the Lead List Center in HQ (Batch 3) ----------
/** Lead Lists fields for the list view (the build only: Build Campaign lives in Campaign Center). */
export const LLF = {
  ...LF, client: 'fldEujtSLqwdpOyGD', campaigns: 'fldepbn71awSjmZPV', hide: 'fldCc86NCikq5LCVe', added: 'fldDQMHHfYUJrA16S', progress: 'fldaUFUWOLtKIovQE',
  companies: 'fldRLtvugIxH9qun1', verifiedDirect: 'fldf3pl1RYHishCKV', verifiedGeneric: 'fldd5zmRzTjz5bvPy', directVerifier: 'fldlJtYONrHGdyXoh', genericVerifier: 'fldX8cOpx3TcGX2jf',
  contactSource: 'fldwoK7IcKH6NYgVJ', thesis: 'fldg6HZIKqe8c8RtW', leadsWanted: 'fld2G5D1yCPFGFiVF',
} as const;
/** In progress → done. Ready / Uploaded = done (the list is built); Failed = needs a fix; Archived is left out. */
export const LIST_DONE = new Set(['Ready', 'Uploaded']);
export const LIST_ORDER = ['Draft', 'Source & ICP', 'Targeting', 'Searching', 'Source Imported', 'Contacts Ready', 'Verification', 'Enrichment', 'QA', 'Ready', 'Uploaded'] as const;
export const LIST_DONE_DAYS = 60;
export type ListGroup = 'building' | 'done' | 'failed';
export interface LeadListRow {
  id: string; name: string; client: string; clientKey: string; stage: string; group: ListGroup; step: number; steps: number; qa: string; processing: string; progress: number | null;
  companies: number; direct: number; generic: number; leads: number; verifiers: string; source: string; thesis: string;
  campaigns: { id: string; name: string }[]; listOnly: boolean; added: string; updated: string; message: string; owner: AgentName;
  /** Round 2: a test list by its name (hidden unless "Show tests"); finished more than 60 days ago; the engine's state. */
  test: boolean; old: boolean; engineStatus: string; running: boolean;
}
/** One Lead Lists record → one row (null = left out: hidden or archived). Pure. */
export function leadListRow(r: AirtableRecord, clients: Map<string, ClientRef>, campaignName: Map<string, string>, now = Date.now()): LeadListRow | null {
  const f = r.fields;
  if (f[LLF.hide] === true) return null;
  const stage = s(f[LLF.stage]);
  if (stage === 'Archived') return null;
  const ref = clients.get(ids(f[LLF.client])[0] ?? '');
  const processing = s(f[LLF.processing]);
  const engineStatus = s(f[LF.engineStatus]);
  const group: ListGroup = stage === 'Failed' || /fail/i.test(processing) || /fail/i.test(engineStatus) ? 'failed' : LIST_DONE.has(stage) ? 'done' : 'building';
  const updated = latest([s(f[LF.completedAt]), s(f[LF.startedAt]), s(f[LLF.added]), r.createdTime]) ?? '';
  const old = group === 'done' && !!updated && now - Date.parse(updated) > LIST_DONE_DAYS * DAY;
  const camps = ids(f[LLF.campaigns]);
  const direct = n(f[LF.finalDirect]), generic = n(f[LF.finalGeneric]);
  const verifiers = [...new Set([direct || n(f[LLF.verifiedDirect]) ? s(f[LLF.directVerifier]) : '', generic || n(f[LLF.verifiedGeneric]) ? s(f[LLF.genericVerifier]) : ''].filter((x) => x && x !== 'None'))].join(' + ');
  const at = LIST_ORDER.indexOf(stage as (typeof LIST_ORDER)[number]);
  const p = n(f[LLF.progress]);
  return {
    id: r.id, name: s(f[LF.name]) || s(f[LF.fileName]) || 'Lead list', client: ref?.name ?? 'No client', clientKey: ref?.key ?? '', stage: stage || 'Not started', group,
    step: at < 0 ? 0 : at + 1, steps: LIST_ORDER.length, qa: s(f[LF.qa]), processing, progress: processing === 'Running' && p ? (p > 1 ? p / 100 : p) : null,
    companies: n(f[LLF.companies]), direct, generic, leads: direct + generic, verifiers, source: s(f[LLF.contactSource]), thesis: plain(s(f[LLF.thesis])).slice(0, 240),
    campaigns: camps.map((id) => ({ id, name: campaignName.get(id) ?? '' })), listOnly: camps.length === 0, added: s(f[LLF.added]) || r.createdTime || '', updated,
    message: (s(f[LF.lastError]) || s(f[LF.engineMessage])).replace(/\s+/g, ' ').slice(0, 240), owner: group === 'failed' ? 'Riley' : 'Scout',
    test: isTest(s(f[LF.name]) || s(f[LF.fileName])), old, engineStatus, running: ['Queued', 'Running', 'Waiting'].includes(engineStatus) || /^(running|queued|waiting)$/i.test(processing),
  };
}
const ms = (iso: string) => Date.parse(iso) || 0;
/** Newest first, as the Airtable Lead List Center ("Newest first"): by the date the list was made. Pure. */
export const newestFirst = (a: Pick<LeadListRow, 'added' | 'updated'>, b: Pick<LeadListRow, 'added' | 'updated'>) => ms(b.added) - ms(a.added) || ms(b.updated) - ms(a.updated);
const LL_READ = [...new Set(Object.values(LLF))];
let listsCache: { at: number; data: Promise<{ lists: AirtableRecord[]; ws: AirtableRecord[]; names: Map<string, string>; readAt: string }> } | null = null;
export function _resetListsCache() { listsCache = null; }
/** Lists in progress and done (last 60 days) per client, including a client who buys only a list (no campaign linked). */
export async function listLeadLists(at: Pick<HqAirtable, 'list'>, db: Db, opts: { client?: string; refresh?: boolean; tests?: boolean; old?: boolean } = {}) {
  if (!listsCache || Date.now() - listsCache.at >= (opts.refresh ? 10_000 : CAMPAIGNS_CACHE_MS)) {
    const data = (async () => {
      const [lists, src] = await Promise.all([
        at.list(LEAD_LISTS_T, `AND(NOT({Hide}),{Lead List Stage}!='Archived')`, LL_READ, 1500),
        cachedCampaigns(at, db, opts.refresh),
      ]);
      return { lists, ws: src.ws, names: new Map(src.campaigns.map((c) => [c.id, s(c.fields[KF.name])])), readAt: new Date().toISOString() };
    })();
    listsCache = { at: Date.now(), data };
    data.catch(() => { if (listsCache?.data === data) listsCache = null; });
  }
  const d = await listsCache.data;
  const clients = clientIndex(d.ws);
  const activeKeys = new Set([...clients.values()].filter((c) => c.active).map((c) => c.key));
  const rows = d.lists.map((r) => leadListRow(r, clients, d.names)).filter((x): x is LeadListRow => !!x && (!x.clientKey || activeKeys.has(x.clientKey)));
  const active = [...new Map([...clients.values()].filter((c) => c.active).map((c) => [c.key, c])).values()];
  const client = opts.client && activeKeys.has(opts.client) ? opts.client : '';
  // Round 2 (Alex 2026-11-27): newest first, like the Airtable Lead List Center; tests and lists finished
  // 60+ days ago are in the answer but flagged, and the screen hides them unless asked ("Show tests").
  const all = (client ? rows.filter((r) => r.clientKey === client) : rows).sort(newestFirst);
  const mine = all.filter((r) => (opts.tests || !r.test) && (opts.old || !r.old));
  const real = all.filter((r) => !r.test && !r.old);
  return {
    rows: mine, counts: { building: real.filter((r) => r.group === 'building').length, done: real.filter((r) => r.group === 'done').length, failed: real.filter((r) => r.group === 'failed').length, listOnly: real.filter((r) => r.listOnly).length, running: real.filter((r) => r.running).length, tests: all.filter((r) => r.test).length, old: all.filter((r) => r.old && !r.test).length },
    client, clients: active.map((c) => ({ key: c.key, name: c.name, count: rows.filter((r) => r.clientKey === c.key && !r.test && !r.old).length })).sort((a, b) => b.count - a.count || a.name.localeCompare(b.name)),
    stages: LIST_ORDER, doneDays: LIST_DONE_DAYS, readAt: d.readAt, tests: !!opts.tests, old: !!opts.old,
  };
}

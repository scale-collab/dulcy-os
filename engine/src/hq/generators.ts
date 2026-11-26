// Agent to-do generators. Atlas:
//  - a running campaign at 60%+ sent gets "Plan next campaign for <client>", due in 3 days, unless
//    a campaign plan already exists for it (campaign_plans, the same trigger Atlas's campaign
//    creation uses). When the plan exists later, the task closes itself;
//  - every campaign plan is one task "New campaign for <client>" that moves with the plan's state
//    (in progress / waiting on Alex / done), due a week after it started (syncPlanTasks).
// Tasks waiting on a Decision follow it (syncDecisionTasks). Riley's tasks (bounce checks, account
// rests) are opened and closed by those stages themselves. Writes only HQ's own Postgres table.
import type { Db } from '../db/pool.js';
import type { Stage } from '../stages/index.js';
import { PermanentError } from '../errors.js';
import { createAirtableClient, type AirtableClient } from '../providers/airtable.js';
import { CP } from '../agents/campaignPlan.js';
import { val } from '../agents/emailsFields.js';
import { addDays, clientNames, nyDate } from './tasks.js';
import { DECISIONS, DF } from '../decisions/fields.js';
import { shortClient } from '../agents/ada.js';
import { upsertAgentTask, type TaskJob, type TaskStatus } from './agentTasks.js';

const CAMPAIGNS = 'tblAVAA6uBPaMj28P';
export interface CampaignRow { id: string; name: string; client: string; status: string; progress: number }
export interface PlanRef { trigger_key: string; ws_rec: string; state: string; created_at: string }
export interface NewAgentTask { agent: 'Atlas'; title: string; due: string; client: string; notes: string; sourceKey: string }
const ENDED = new Set(['rejected', 'stuck', 'copy_rejected']);

/** Which "plan next campaign" tasks to create. Pure. */
export function planNextTasks(campaigns: CampaignRow[], plans: PlanRef[], names: Map<string, string>, now = new Date()): NewAgentTask[] {
  const out: NewAgentTask[] = [];
  const seen = new Set<string>();
  for (const c of campaigns) {
    if (!/active/i.test(c.status) || c.progress < 0.6 || c.progress >= 1) continue;
    if (hasPlan(c, plans, now)) continue;
    if (seen.has(c.client)) continue; // one task per client at a time
    seen.add(c.client);
    const client = names.get(c.client) || 'unknown client';
    out.push({ agent: 'Atlas', title: `Plan next campaign for ${client}`, due: addDays(nyDate(now), 3), client, notes: `${c.name} is at ${Math.round(c.progress * 100)}% sent.`, sourceKey: `plan-next:${c.id}` });
  }
  return out;
}

/** A plan exists for this campaign (its 60% trigger) or a live plan for the same client from the last 30 days. */
export function hasPlan(c: Pick<CampaignRow, 'id' | 'client'>, plans: PlanRef[], now = new Date()): boolean {
  return plans.some((p) => p.trigger_key === `next:${c.id}` || (p.ws_rec === c.client && !ENDED.has(p.state) && now.getTime() - Date.parse(p.created_at) < 30 * 86_400_000));
}

const prog = (x: unknown) => { const n = Number(val(x)); return !Number.isFinite(n) ? 0 : n > 1 ? n / 100 : n; };

export async function generateAtlasTasks(db: Db, at: Pick<AirtableClient, 'list'>, now = new Date()): Promise<{ created: string[]; closed: number }> {
  const [rows, names, plans] = await Promise.all([
    at.list(CAMPAIGNS, `{Campaign Status}='Active'`, [CP.name, CP.client, CP.status, CP.progress], 1000),
    clientNames(at),
    db.query(`SELECT trigger_key, ws_rec, state, created_at FROM campaign_plans`).then((r) => r.rows.map((x) => ({ ...x, created_at: new Date(x.created_at).toISOString() })) as PlanRef[]),
  ]);
  const campaigns: CampaignRow[] = rows.map((r) => ({ id: r.id, name: val(r.fields[CP.name]), client: val(r.fields[CP.client]), status: val(r.fields[CP.status]), progress: prog(r.fields[CP.progress]) }));
  // Close open plan-next tasks whose plan now exists.
  let closed = 0;
  const open = (await db.query(`SELECT id, source_key FROM hq_agent_tasks WHERE status<>'done' AND source_key LIKE 'plan-next:%'`)).rows;
  for (const t of open) {
    const id = String(t.source_key).slice('plan-next:'.length);
    const c = campaigns.find((x) => x.id === id);
    const ws = c?.client ?? '';
    if (plans.some((p) => p.trigger_key === `next:${id}` || (ws && p.ws_rec === ws && !ENDED.has(p.state)))) {
      await db.query(`UPDATE hq_agent_tasks SET status='done', done_at=now(), done_note='Plan started', progress_note='Plan started', updated_at=now() WHERE id=$1`, [t.id]); closed++;
    }
  }
  const created: string[] = [];
  for (const t of planNextTasks(campaigns, plans, names, now)) {
    // A client already has an open plan-next task: don't add a second one.
    const dup = (await db.query(`SELECT 1 FROM hq_agent_tasks WHERE status<>'done' AND agent='Atlas' AND title=$1`, [t.title])).rows.length;
    if (dup) continue;
    // "open" until the campaign-creation pipeline starts the plan (then it closes and plan:<id> takes over).
    const r = await db.query(`INSERT INTO hq_agent_tasks (agent, title, due_date, client, notes, source_key, progress_note) VALUES ($1,$2,$3,$4,$5,$6,$5) ON CONFLICT (source_key) DO NOTHING RETURNING id`,
      [t.agent, t.title, t.due, t.client, t.notes, t.sourceKey]);
    if (r.rows.length) created.push(t.title);
  }
  return { created, closed };
}

// ---------- Atlas: one task per new campaign in progress (campaign_plans) ----------
export interface PlanState { id: number; client: string; state: string; copy_state: string | null; plan_error: string | null; campaign_name: string; created_at: string; updated_at: string }
export interface PlanTaskView { status: TaskStatus; note: string; link: string | null; job: TaskJob | null; waitingUntil: string | null }
/** A new campaign should be live (or stopped) within a week of the plan starting. */
export const PLAN_DUE_DAYS = 7;

/** Where a campaign plan is, as an Atlas task: status, one-line note, link, and the job that moves it. Pure. */
export function planTaskView(p: PlanState): PlanTaskView {
  const pipeline: TaskJob = { kind: 'campaign.pipeline', recordId: 'campaign-pipeline', input: {} };
  const go = (note: string, job: TaskJob | null = pipeline): PlanTaskView => ({ status: 'in_progress', note, link: null, job, waitingUntil: null });
  const ask = (note: string, link: string | null = 'decisions/Campaigns'): PlanTaskView => ({ status: 'waiting_alex', note, link, job: null, waitingUntil: null });
  switch (p.state) {
    case 'planning': return go('Writing the plan: thesis, ICP, 2 Email-1 angles', { kind: 'atlas.plan', recordId: `atlas-plan-${p.id}`, input: { planId: p.id } });
    case 'filters': return go('Generating the list filters');
    case 'sample': return go('Running the first-100 company sample');
    case 'approval1': return ask('Plan + sample waiting for your OK (approval 1)');
    case 'expand': return go('Plan approved: expanding the companies');
    case 'contacts_sample': return go('Finding a contact sample');
    case 'approval_contacts': return ask('Contact sample is low: waiting for your OK');
    case 'contacts': return go('Finding all contacts');
    case 'verify': return go(p.copy_state === 'ready' ? 'Verifying the emails' : 'Verifying the emails; Scribe is writing the copy');
    case 'enrich': case 'enrich_prompt': case 'enrich_run': return go('Enriching the list for the copy');
    case 'qa': return go('Automated QA on the list');
    case 'approval2': return ask('Copy + list waiting for your OK (approval 2)');
    case 'approval2_wait': return go('Scribe is rewriting the copy', p.copy_state === 'queued' ? { kind: 'scribe.copy', recordId: `scribe-copy-${p.id}`, input: { planId: p.id } } : pipeline);
    case 'client_review': return { ...go('With the client for approval (48 business hours)'), waitingUntil: new Date(Date.parse(p.updated_at) + 4 * 86_400_000).toISOString() };
    case 'client_approved': case 'spintax': case 'building': case 'launching': return go('Client approved: spintax, inboxes, build, launch');
    case 'need_inboxes': return ask('No free healthy inboxes: pick them in Campaign Center');
    case 'copy_rejected': return ask('Copy ❌: waiting for your notes (campaign-copy)', null);
    case 'stuck': return ask(`Stuck: ${String(p.plan_error ?? '').replace(/\s+/g, ' ').slice(0, 140) || 'see campaign-plans'}. Retry: campaign-plan-retry ${p.id}`, null);
    case 'rejected': return { status: 'done', note: 'Stopped: you said no to the plan', link: null, job: null, waitingUntil: null };
    case 'live': return { status: 'done', note: 'Live', link: null, job: null, waitingUntil: null };
    default: return go(`Step: ${p.state}`);
  }
}

/** Open, move and close one Atlas task per campaign plan ("New campaign for <client>"). Only changes bump the task's last update. */
export async function syncPlanTasks(db: Db): Promise<{ synced: number; changed: number }> {
  const rows = (await db.query(`SELECT id, client, state, copy_state, plan_error, COALESCE(plan->>'campaign_name','') AS campaign_name, created_at, updated_at FROM campaign_plans ORDER BY id`)).rows;
  let changed = 0;
  for (const r of rows) {
    const p: PlanState = { ...r, id: Number(r.id), created_at: new Date(r.created_at).toISOString(), updated_at: new Date(r.updated_at).toISOString() };
    const v = planTaskView(p);
    const key = `plan:${p.id}`;
    const exists = (await db.query(`SELECT status FROM hq_agent_tasks WHERE source_key=$1`, [key])).rows[0];
    if (!exists && v.status === 'done') continue; // an old finished plan: no task to open
    const res = await upsertAgentTask(db, {
      agent: 'Atlas', key, title: `New campaign for ${shortClient(p.client) || 'a client'}`, client: p.client, status: v.status, note: v.note, link: v.link,
      due: addDays(nyDate(new Date(p.created_at)), PLAN_DUE_DAYS), job: v.job, waitingUntil: v.waitingUntil, details: p.campaign_name ? `Plan ${p.id}: ${p.campaign_name}` : `Plan ${p.id}`,
      priority: 'high',
    });
    if (!('error' in res) && res.changed) changed++;
  }
  return { synced: rows.length, changed };
}

/**
 * Tasks waiting on a Decision (bounce fixes, inbox replacements): ❌ → done ("you said no");
 * ✅ → in progress (the fix job closes it). Reads only those Decisions.
 */
export async function syncDecisionTasks(db: Db, at: Pick<AirtableClient, 'get'>): Promise<number> {
  const rows = (await db.query(`SELECT agent, title, source_key, decision_rec FROM hq_agent_tasks WHERE status='waiting_alex' AND decision_rec IS NOT NULL ORDER BY id LIMIT 50`)).rows;
  let n = 0;
  for (const t of rows) {
    const d = await at.get(DECISIONS, t.decision_rec, [DF.status, DF.decidedBy]).catch(() => null);
    const st = val(d?.fields[DF.status]);
    const by = val(d?.fields[DF.decidedBy]) || 'you';
    if (st === 'Rejected') { await upsertAgentTask(db, { agent: t.agent, key: t.source_key, title: t.title, status: 'done', note: `${by} said no in Decisions: nothing changed`, decision: null }); n++; }
    else if (st === 'Approved') { await upsertAgentTask(db, { agent: t.agent, key: t.source_key, title: t.title, status: 'in_progress', note: `${by} approved: the fix is running`, decision: null }); n++; }
  }
  return n;
}

/** atlas.tasks: runs every 30 minutes while HQ is on. Reads Airtable; writes only HQ's to-do table (dry run does not change that). */
export const atlasTasksStage: Stage = async (ctx) => {
  const cfg = ctx.cfg;
  if (!cfg.airtableApiKey) throw new PermanentError('no AIRTABLE_API_KEY on the server');
  const at = createAirtableClient({ apiKey: cfg.airtableApiKey, baseId: cfg.airtableBaseId, baseUrl: cfg.airtableBaseUrl });
  const r = await generateAtlasTasks(ctx.db, at);
  const plans = await syncPlanTasks(ctx.db);
  const decided = await syncDecisionTasks(ctx.db, at);
  return { message: `${r.created.length} new Atlas task${r.created.length === 1 ? '' : 's'}${r.created.length ? ` (${r.created.join('; ')})` : ''}, ${r.closed} closed (plan started); ${plans.changed} campaign task${plans.changed === 1 ? '' : 's'} moved; ${decided} decided`, ...r, plansChanged: plans.changed, decided };
};

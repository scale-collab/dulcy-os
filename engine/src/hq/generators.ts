// Agent to-do generators (HQ Step 1). One so far, for Atlas: a running campaign at 60%+ sent gets
// "Plan next campaign for <client>", due in 3 days, unless a campaign plan already exists for it
// (campaign_plans, the same trigger Atlas's campaign creation uses). When the plan exists later, the
// task closes itself. Writes only HQ's own Postgres table; reads Airtable Campaigns.
import type { Db } from '../db/pool.js';
import type { Stage } from '../stages/index.js';
import { PermanentError } from '../errors.js';
import { createAirtableClient, type AirtableClient } from '../providers/airtable.js';
import { CP } from '../agents/campaignPlan.js';
import { val } from '../agents/emailsFields.js';
import { addDays, clientNames, nyDate } from './tasks.js';

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
  const open = (await db.query(`SELECT id, source_key FROM hq_agent_tasks WHERE status='open' AND source_key LIKE 'plan-next:%'`)).rows;
  for (const t of open) {
    const id = String(t.source_key).slice('plan-next:'.length);
    const c = campaigns.find((x) => x.id === id);
    const ws = c?.client ?? '';
    if (plans.some((p) => p.trigger_key === `next:${id}` || (ws && p.ws_rec === ws && !ENDED.has(p.state)))) {
      await db.query(`UPDATE hq_agent_tasks SET status='done', done_at=now(), done_note='Plan started' WHERE id=$1`, [t.id]); closed++;
    }
  }
  const created: string[] = [];
  for (const t of planNextTasks(campaigns, plans, names, now)) {
    // A client already has an open plan-next task: don't add a second one.
    const dup = (await db.query(`SELECT 1 FROM hq_agent_tasks WHERE status='open' AND agent='Atlas' AND title=$1`, [t.title])).rows.length;
    if (dup) continue;
    const r = await db.query(`INSERT INTO hq_agent_tasks (agent, title, due_date, client, notes, source_key) VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT (source_key) DO NOTHING RETURNING id`,
      [t.agent, t.title, t.due, t.client, t.notes, t.sourceKey]);
    if (r.rows.length) created.push(t.title);
  }
  return { created, closed };
}

/** atlas.tasks: runs every 30 minutes while HQ is on. Reads Airtable; writes only HQ's to-do table (dry run does not change that). */
export const atlasTasksStage: Stage = async (ctx) => {
  const cfg = ctx.cfg;
  if (!cfg.airtableApiKey) throw new PermanentError('no AIRTABLE_API_KEY on the server');
  const at = createAirtableClient({ apiKey: cfg.airtableApiKey, baseId: cfg.airtableBaseId, baseUrl: cfg.airtableBaseUrl });
  const r = await generateAtlasTasks(ctx.db, at);
  return { message: `${r.created.length} new Atlas task${r.created.length === 1 ? '' : 's'}${r.created.length ? ` (${r.created.join('; ')})` : ''}, ${r.closed} closed (plan started)`, ...r };
};

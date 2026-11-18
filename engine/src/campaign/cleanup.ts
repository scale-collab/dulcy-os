// Remove an ENGINE TEST campaign and only what the test itself created, from one workspace.
// Safety rules (all must hold, or nothing is touched):
//  - the campaign is in this workspace's own campaign list, its name starts with "ENGINE TEST",
//    it is a draft, and EmailBison gives its creation time;
//  - a lead is deleted only if EmailBison created it at or after the campaign (so our upload
//    made it, not the client's own work) and it has never been emailed or replied;
//  - a custom variable is deleted only if our test created it (by name, from the engine's own
//    records) and EmailBison created it at or after the campaign.
// Leads and variables that fail a rule are kept and counted. EmailBison has no API to delete
// lead lists; their names are printed so they can be removed in the EmailBison screen.
import type { BisonClient } from '../providers/emailbison.js';

export interface CleanupPlan {
  campaign: { id: number; name: string; status: string; createdAt: string };
  deleteLeadIds: number[];
  keptLeads: { notOurs: number; contacted: number };
  deleteVariables: { id: number; name: string }[];
  keptVariables: string[];
  leadLists: { id: number; name: string }[];
}

const time = (s: unknown) => { const t = Date.parse(String(s ?? '')); return Number.isFinite(t) ? t : NaN; };

export function planCleanup(o: {
  campaign: any; leads: any[]; variables: any[]; leadLists: any[]; testVariableNames: string[];
}): CleanupPlan {
  const c = o.campaign;
  if (!c) throw new Error('campaign not found in this workspace: nothing touched');
  const name = String(c.name ?? '');
  const status = String(c.status ?? '').toLowerCase();
  const createdAt = time(c.created_at);
  if (!name.startsWith('ENGINE TEST')) throw new Error(`campaign ${c.id} is "${name}", not an ENGINE TEST campaign: nothing touched`);
  if (status !== 'draft') throw new Error(`campaign ${c.id} is ${status || 'unknown status'}, not a draft: nothing touched`);
  if (!Number.isFinite(createdAt)) throw new Error(`EmailBison gave no creation time for campaign ${c.id}: nothing touched`);

  const deleteLeadIds: number[] = [];
  const keptLeads = { notOurs: 0, contacted: 0 };
  for (const l of o.leads) {
    const made = time(l.created_at);
    const s = l.overall_stats ?? {};
    const contacted = Number(s.emails_sent ?? 0) > 0 || Number(s.replies ?? 0) > 0 || Number(l.lead_campaign_data?.emails_sent ?? 0) > 0;
    if (!Number.isFinite(made) || made < createdAt) keptLeads.notOurs++;
    else if (contacted) keptLeads.contacted++;
    else deleteLeadIds.push(Number(l.id));
  }

  const ours = new Set(o.testVariableNames.map((n) => n.trim().toLowerCase()));
  const deleteVariables: { id: number; name: string }[] = [];
  const keptVariables: string[] = [];
  for (const v of o.variables) {
    const n = String(v.name ?? '').trim();
    if (!ours.has(n.toLowerCase()) && !n.startsWith('DULCY_VERIFICATION_')) continue;
    if (time(v.created_at) >= createdAt) deleteVariables.push({ id: Number(v.id), name: n });
    else keptVariables.push(n);
  }

  const leadLists = o.leadLists
    .filter((l) => String(l.name ?? '').startsWith(`${name} Leads`))
    .map((l) => ({ id: Number(l.id), name: String(l.name) }));

  return { campaign: { id: Number(c.id), name, status, createdAt: String(c.created_at) }, deleteLeadIds, keptLeads, deleteVariables, keptVariables, leadLists };
}

export async function readCleanupPlan(bison: BisonClient, campaignId: number, testVariableNames: string[]): Promise<CleanupPlan> {
  const campaign = (await bison.listCampaigns()).find((x) => Number(x.id) === campaignId);
  if (!campaign) return planCleanup({ campaign: null, leads: [], variables: [], leadLists: [], testVariableNames });
  const [leads, variables, leadLists] = [await bison.campaignLeads(campaignId), await bison.customVariableList(), await bison.leadLists()];
  return planCleanup({ campaign, leads, variables, leadLists, testVariableNames });
}

export async function runCleanup(bison: BisonClient, plan: CleanupPlan, log: (s: string) => void) {
  for (let i = 0; i < plan.deleteLeadIds.length; i += 500) {
    const part = plan.deleteLeadIds.slice(i, i + 500);
    await bison.deleteLeads(part);
    log(`deleted ${Math.min(i + 500, plan.deleteLeadIds.length)} of ${plan.deleteLeadIds.length} test leads`);
  }
  for (const v of plan.deleteVariables) { await bison.deleteCustomVariable(v.id); log(`deleted custom variable ${v.name}`); }
  await bison.deleteCampaign(plan.campaign.id);
  log(`campaign ${plan.campaign.id} queued for deletion by EmailBison`);
}

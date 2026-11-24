// "Build Campaign" pressed on a Lead List in the engine page: build the list's EmailBison
// campaign(s) the way the old Campaign Center + n8n Output Builder did, as DRAFTS (never launched).
//  Gates (old): the list is Ready (or Uploaded) with QA Passed; the parent campaign (the linked
//  Campaigns record without a " - Generic Emails"/" - Direct Emails" suffix) has Campaign Status
//  "Spintax Generated" and no EmailBison ID yet.
//  Outputs (old): Final Generic and Final Direct each get their own campaign. With both, the
//  campaigns are "<name> - Generic Emails" and "<name> - Direct Emails" (child records in
//  Airtable, created or reused), and the selected inboxes are split by lead share:
//  direct = round(total x direct / (direct + generic)), at least 1 and at most total - 1;
//  generic gets the first inboxes, direct the next ones.
//  Inboxes: the campaign's Email Accounts; each needs a unique numeric "Email ID" (EmailBison
//  sender id) and all must be in the same EmailBison workspace ("Workspace ID").
import type { Db } from '../db/pool.js';
import type { Config } from '../config.js';
import type { AirtableClient, AirtableRecord } from '../providers/airtable.js';
import { enqueue } from '../queue.js';
import { STAGES } from '../stages/index.js';
import { CAMPAIGN_FIELDS } from '../campaign/campaignFields.js';
import { campaignSettings, outputCopy, readSequence, sendingLimits } from '../campaign/airtableCopy.js';

export const CAMPAIGNS = 'tblAVAA6uBPaMj28P';
export const EMAIL_ACCOUNTS = 'tblMSOBJ0wMgxSg4l';
const CLIENTS = 'tblcjRBGJEWh5KgOt';
export const LL = { whichCampaign: 'fldepbn71awSjmZPV', stage: 'fld8nrebRFL0O8kgj', qa: 'fldUB4WsLi5kq6rUy', finalDirect: 'fldQZJCpTofahmTkl', finalGeneric: 'fld0FHomkh3uyx0FD' };
export const EA = { emailId: 'fldR19WUqSSBVQcPO', workspaceId: 'fldWB4pvEgQ8aYlT2', dailyLimit: 'fldBP1gljUUM44JMk', email: 'fldRYSB93NNdBc4Js' };
const CL = { name: 'fld48x6Yg3v6RP30W', brand: 'fldTHTrYh0GCFeBLG', senderTitle: 'fldIMJnjdGGAPotMW' };
export const CF = {
  name: CAMPAIGN_FIELDS.Name, status: CAMPAIGN_FIELDS['Campaign Status'], stage: CAMPAIGN_FIELDS['Workflow Stage'], client: CAMPAIGN_FIELDS.Client,
  lists: CAMPAIGN_FIELDS['Lead List'], accounts: CAMPAIGN_FIELDS['Email Accounts'], id: CAMPAIGN_FIELDS.ID,
  directId: CAMPAIGN_FIELDS['EmailBison Direct Campaign ID'], genericId: CAMPAIGN_FIELDS['EmailBison Generic Campaign ID'],
  processing: CAMPAIGN_FIELDS['Processing Status'], message: CAMPAIGN_FIELDS['Workflow Message'], error: CAMPAIGN_FIELDS['Workflow Error'],
  startedAt: CAMPAIGN_FIELDS['Started At'], completedAt: CAMPAIGN_FIELDS['Completed At'],
};
export const SUFFIX = /\s+-\s+(?:Generic|Direct) Emails\s*$/i;

export class BuildInputError extends Error {}
const text = (v: unknown) => (Array.isArray(v) ? String(v[0] ?? '') : v === undefined || v === null ? '' : typeof v === 'object' ? String((v as any).name ?? '') : String(v)).trim();
const ids = (v: unknown) => (Array.isArray(v) ? v.map((x) => (typeof x === 'string' ? x : String((x as any)?.id ?? ''))).filter(Boolean) : []);
const byName = (rec: AirtableRecord) => {
  const out: Record<string, unknown> = {};
  for (const [name, id] of Object.entries(CAMPAIGN_FIELDS)) if (rec.fields[id] !== undefined) out[name] = rec.fields[id];
  return out;
};

/** Old Campaign Center split: Direct = round(total x direct / all), clamped to [1, total - 1]; Generic gets the rest. */
export function splitSenders(total: number, generic: number, direct: number) {
  if (generic > 0 && direct > 0) {
    if (total < 2) throw new BuildInputError('this list has generic and direct leads: select at least 2 inboxes (one per campaign)');
    const d = Math.min(total - 1, Math.max(1, Math.round((total * direct) / (generic + direct))));
    return { generic: total - d, direct: d };
  }
  return { generic: generic > 0 ? total : 0, direct: direct > 0 ? total : 0 };
}

/** Days of sending and sequence steps behind a campaign's lead goal (Alex, 2026-11-23). */
export const GOAL_DAYS = 14;
export const GOAL_STEPS = 3;
/**
 * Soft lead goal for Generate filters from the campaign(s) linked to a list: the sum of the
 * linked inboxes' daily limits x 14 days / 3 sequence steps. Every linked campaign counts (two
 * campaigns, or a Generic/Direct split): the inboxes actually linked, each counted once. An
 * inbox without a daily limit counts 15 (as Build Campaign does). Null = no inbox linked.
 */
export async function campaignLeadGoal(at: AirtableClient, campaignIds: string[]) {
  const camps = (await Promise.all([...new Set(campaignIds)].map((id) => at.get(CAMPAIGNS, id, [CF.name, CF.accounts])))).filter(Boolean) as AirtableRecord[];
  const accountIds = [...new Set(camps.flatMap((c) => ids(c.fields[CF.accounts])))];
  if (!accountIds.length) return null;
  const accounts = (await Promise.all(accountIds.map((id) => at.get(EMAIL_ACCOUNTS, id, [EA.dailyLimit])))).filter(Boolean) as AirtableRecord[];
  if (!accounts.length) return null;
  const perDay = accounts.reduce((sum, a) => sum + (Number(a.fields[EA.dailyLimit]) || 15), 0);
  return { value: Math.round((perDay * GOAL_DAYS) / GOAL_STEPS), source: 'campaign', inboxes: accounts.length, perDay, campaigns: camps.map((c) => text(c.fields[CF.name])).filter(Boolean) };
}

export interface PlannedOutput { outputType: 'generic' | 'direct'; recordId: string; name: string; leads: number; senderEmailIds: string[] }

/** Everything Build Campaign needs, checked; throws BuildInputError with what to fix. Writes child records only. */
export async function planBuild(db: Db, at: AirtableClient, listId: string, list: AirtableRecord) {
  const stage = text(list.fields[LL.stage]).toLowerCase();
  if (!['ready', 'uploaded'].includes(stage) || text(list.fields[LL.qa]) !== 'Passed') {
    throw new BuildInputError('the lead list must be QA Passed and Ready first: open it in Lead List Center → QA and choose Passed');
  }
  const generic = Number(list.fields[LL.finalGeneric] ?? 0) || 0, direct = Number(list.fields[LL.finalDirect] ?? 0) || 0;
  if (generic + direct < 1) throw new BuildInputError('this list has no Final Direct or Final Generic leads yet: run Verify first');
  const sheet = await db.query(`SELECT sheet_id FROM lead_list_sheets WHERE list_id=$1 AND kind='companies'`, [listId]);
  if (!sheet.rows[0]) throw new BuildInputError('this list has no engine sheet: it was not built on the engine');

  const linked = ids(list.fields[LL.whichCampaign]);
  const campaigns = (await Promise.all(linked.map((id) => at.get(CAMPAIGNS, id, Object.values(CAMPAIGN_FIELDS))))).filter(Boolean) as AirtableRecord[];
  const parents = campaigns.filter((c) => !SUFFIX.test(text(c.fields[CF.name])));
  if (parents.length !== 1) throw new BuildInputError(parents.length ? `this list is linked to ${parents.length} campaigns; link exactly one in Campaign Center` : 'this list is not linked to a campaign yet: create or link it in Campaign Center');
  const parent = parents[0];
  const cells = byName(parent);
  const parentName = text(cells.Name);
  if (text(cells['Campaign Status']).toLowerCase() !== 'spintax generated') throw new BuildInputError(`campaign "${parentName}" must be Spintax Generated first (it is "${text(cells['Campaign Status']) || 'empty'}")`);
  if (Number(cells.ID ?? 0) > 0) throw new BuildInputError(`campaign "${parentName}" already has EmailBison campaign ${cells.ID}; nothing was built again`);

  // Copy, exactly as the old builder assembled it.
  const clientId = ids(cells.Client)[0];
  const client = clientId ? await at.get(CLIENTS, clientId, Object.values(CL)) : null;
  const info = { brandName: text(client?.fields[CL.brand]), clientName: text(client?.fields[CL.name]), senderTitle: text(client?.fields[CL.senderTitle]) || text(cells['Sender Title (from Client)']) };
  let sequence;
  try { sequence = readSequence(cells); } catch (e) { throw new BuildInputError((e as Error).message); }
  const settings = campaignSettings(cells);

  // Inboxes.
  const accountIds = ids(cells['Email Accounts']);
  if (!accountIds.length) throw new BuildInputError(`campaign "${parentName}" has no Email Accounts selected`);
  const accounts = (await Promise.all(accountIds.map((id) => at.get(EMAIL_ACCOUNTS, id, Object.values(EA))))).filter(Boolean) as AirtableRecord[];
  const senderIds = accounts.map((a) => Number(a.fields[EA.emailId]));
  if (accounts.length !== accountIds.length || senderIds.some((n) => !Number.isSafeInteger(n) || n < 1) || new Set(senderIds).size !== senderIds.length) {
    throw new BuildInputError('every selected inbox needs its own numeric Email ID (EmailBison sender id); sync the inboxes in Campaign Center');
  }
  const workspaces = [...new Set(accounts.map((a) => Number(a.fields[EA.workspaceId])))];
  if (workspaces.length !== 1 || !(workspaces[0] > 0)) throw new BuildInputError('the selected inboxes must all be in one EmailBison workspace');
  const limits = accounts.map((a) => Number(a.fields[EA.dailyLimit]) || 15).sort((a, b) => a - b);
  const dailyLimit = limits[Math.floor(limits.length / 2)];

  const split = splitSenders(senderIds.length, generic, direct);
  for (const n of [split.generic, split.direct]) if (n) {
    try { sendingLimits(n, dailyLimit, settings.maxEmailsPerDay, settings.maxNewLeadsPerDay); } catch (e) { throw new BuildInputError((e as Error).message); }
  }
  const both = generic > 0 && direct > 0;
  const outputs: PlannedOutput[] = [];
  let next = 0;
  for (const outputType of ['generic', 'direct'] as const) {
    const n = split[outputType];
    if (!n) continue;
    const name = both ? `${parentName} - ${outputType === 'generic' ? 'Generic' : 'Direct'} Emails` : parentName;
    const mine = accountIds.slice(next, next + n);
    const senderEmailIds = senderIds.slice(next, next + n).map(String);
    next += n;
    let recordId = parent.id;
    if (both) {
      // Child record (old Campaign Center): reuse one with the same name and list, else create it.
      const child = campaigns.find((c) => text(c.fields[CF.name]).toLowerCase() === name.toLowerCase());
      if (child && Number(child.fields[CF.id] ?? 0) > 0) throw new BuildInputError(`"${name}" already has EmailBison campaign ${child.fields[CF.id]}; nothing was built again`);
      const fields = { [CF.name]: name, [CF.client]: clientId ? [clientId] : [], [CF.lists]: [listId], [CF.accounts]: mine, [CF.status]: text(cells['Campaign Status']), [CF.stage]: 'Build Ready' };
      recordId = child ? (await at.update(CAMPAIGNS, child.id, fields), child.id) : await at.create(CAMPAIGNS, fields);
    }
    outputs.push({ outputType, recordId, name, leads: outputType === 'generic' ? generic : direct, senderEmailIds });
  }
  return { parent: { id: parent.id, name: parentName }, outputs, sequence, info, settings, workspaceId: workspaces[0], dailyLimit, sheetId: String(sheet.rows[0].sheet_id) };
}

/** Queue one campaign.build job per output. */
export async function queueBuild(db: Db, cfg: Config, at: AirtableClient, listId: string, list: AirtableRecord, press: string) {
  const plan = await planBuild(db, at, listId, list);
  const def = STAGES['campaign.build'];
  const jobs: { id: number; output: string; status: string }[] = [];
  for (const o of plan.outputs) {
    let steps;
    try { steps = outputCopy(plan.sequence, o.outputType, plan.info); } catch (e) { throw new BuildInputError((e as Error).message); }
    const r = await enqueue(db, {
      kind: 'campaign.build', recordId: o.recordId, requestId: `${press}:${o.outputType}`,
      dryRun: cfg.dryRun && !cfg.liveStages.includes('campaign.build'), maxAttempts: def.maxAttempts, deadlineMs: def.deadlineMs,
      input: {
        name: o.name, workspace: cfg.emailBisonBuildWorkspace, workspaceId: plan.workspaceId, outputType: o.outputType, steps,
        daysBetween: plan.settings.daysBetween, source: { sheetId: plan.sheetId, tab: o.outputType === 'generic' ? 'Final Generic' : 'Final Direct' },
        expectedLeads: o.leads, senderEmailIds: o.senderEmailIds, senderDailyLimit: plan.dailyLimit,
        timezone: plan.settings.timezone, campaignType: plan.settings.campaignType, days: plan.settings.days,
        settings: { ...plan.settings.settings, ...sendingLimits(o.senderEmailIds.length, plan.dailyLimit, plan.settings.maxEmailsPerDay, plan.settings.maxNewLeadsPerDay) },
      },
    });
    await db.query(
      `INSERT INTO airtable_jobs (job_id, record_id, action, target_table, target_record, output, press, parent_record) VALUES ($1,$2,'Build Campaign',$3,$4,$5,$6,$7) ON CONFLICT (job_id) DO NOTHING`,
      [r.job.id, listId, CAMPAIGNS, o.recordId, o.outputType, press, plan.parent.id]);
    jobs.push({ id: r.job.id, output: o.outputType, status: r.status });
  }
  return { plan, jobs };
}

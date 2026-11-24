// Airtable bridge for the Campaign Center (Campaigns table): the screen's buttons set Engine
// Action on a Campaigns record with Runs on Engine ticked. Every poll the engine
//   1. reads those records,
//   2. turns the press into job(s) (request id = record + action + the time it was pressed, so
//      a double press or a re-poll never queues twice),
//   3. clears Engine Action and writes Queued (or Failed with what to fix; nothing queued);
// and writes each job's progress and result back to the same record (Engine Status/Message,
// Processing Status/Workflow Message/Error, plus the top-up and launch result fields).
//
// Which EmailBison campaigns a record means: its Direct and Generic IDs when set, else its ID.
// A parent whose leads were split has child records "<name> - Direct Emails" / "- Generic
// Emails" (made by Build Campaign, linked to the same lead list); each child holds its own
// inboxes. Workspace and key: as Build Campaign (key = EMAILBISON_BUILD_WORKSPACE on the server;
// workspace ID = the inboxes' Workspace ID, else the record's campaign_workspace_id).
// Key and password fields are never read.
import type { Db } from '../db/pool.js';
import type { Config } from '../config.js';
import type { AirtableClient, AirtableRecord } from '../providers/airtable.js';
import { enqueue } from '../queue.js';
import { STAGES } from '../stages/index.js';
import { BuildInputError, CAMPAIGNS, CF, LL, SUFFIX, queueBuild, buildQueuedMessage } from './campaignBuild.js';
import { CAMPAIGN_FIELDS } from '../campaign/campaignFields.js';
import { outputCopy, readSequence } from '../campaign/airtableCopy.js';
import { mergeTags } from '../campaign/rules.js';
import { sheetIdFrom } from '../sources/sheet.js';
import type { LaunchFacts } from '../stages/campaignControl.js';

/** Campaigns field IDs used only by the Campaign Center buttons. */
export const CE = {
  runsOnEngine: 'flds0oKDXF1XgQUeI', engineAction: 'fldsvWSdSkH8y16wW', engineActionSetAt: 'fldiEM7H0JtiwZUi4',
  engineStatus: 'fldBIuY7HML1wycLr', engineJobId: 'fldx3JS89Nu10OjeT', engineMessage: 'fldtsSMcX9XX4h1Vc',
  topupList: 'fld4lMlTPjrRmAFHp', workspaceLookup: 'fldQjybcwloD9dZxS',
  approvalSource: 'fldgHA5CcgM885Itp', approvalException: 'fld1vE0Exqlw7MMvq', skipBouncePause: 'fldjpNVGqOLFJbcEX',
  sent: 'fldDmaS8NZF3j0ZBY', replies: 'fldqSxElCOm0QN4kh', bounced: 'fld3MHVEqXgHimKom', interested: 'fldSRXRCC0x2AhX9h', progress: 'fldGM1f8fNNu6ODo2',
  topupStatus: 'fldhUPV4f4pqvv047', topupAdded: 'fldj24jsClYDgjNyG', topupSkipped: 'fldBz14RRsy2PDUhp', topupFailed: 'fldEosJWzT7I73inC',
  topupLastRun: 'fldFfVuUx0ZMCaJXX', topupMessage: 'fldfSoL1aatKQs722',
} as const;

export const CAMPAIGN_ACTIONS: Record<string, string> = {
  'Build Campaign': 'campaign.build',
  'Launch Campaign': 'campaign.launch',
  'Pause Campaign': 'campaign.pause',
  'Update Senders': 'campaign.senders',
  'Top Up Campaign': 'campaign.topup',
};

const LEAD_LISTS = 'tblVOg9BkPOMmnitt';
const CLIENTS = 'tblcjRBGJEWh5KgOt';
const EMAIL_ACCOUNTS = 'tblMSOBJ0wMgxSg4l';
const LIST = { ...LL, name: 'fldbg5PAnKyFHc3uy', sheetLink: 'fldSOTvnUxzKWXMDD' };
const EA = { emailId: 'fldR19WUqSSBVQcPO', workspaceId: 'fldWB4pvEgQ8aYlT2' };
const CLIENT = { name: 'fld48x6Yg3v6RP30W', status: 'fldSr8KQs90Uk2d26' };

const READ_FIELDS = [CE.engineAction, CE.engineActionSetAt, CF.name, CF.client, CF.lists, CE.topupList, CF.accounts, CF.id, CF.directId, CF.genericId,
  CE.workspaceLookup, CF.status, CF.stage, CE.approvalSource, CE.approvalException, CE.sent, CE.replies, CE.bounced, CE.interested, CE.progress];
// Field names, not IDs: Airtable formulas only take names.
const QUEUED_FORMULA = `AND({Runs on Engine}, {Engine Action} != '')`;

/** Bad input on a Campaigns press: nothing is queued, the record says what to fix. */
export class CampaignInputError extends Error {}

type Output = 'direct' | 'generic';
interface Target { campaignId: number; outputType?: Output; recordId: string; name: string; accountIds?: string[] }

const text = (v: unknown) => (Array.isArray(v) ? String(v[0] ?? '') : v === undefined || v === null ? '' : typeof v === 'object' ? String((v as any).name ?? '') : String(v)).trim();
const ids = (v: unknown) => (Array.isArray(v) ? v.map((x) => (typeof x === 'string' ? x : String((x as any)?.id ?? ''))).filter(Boolean) : []);
const num = (v: unknown) => { const x = Number(Array.isArray(v) ? v[0] : v); return Number.isFinite(x) ? x : undefined; };
const bisonId = (v: unknown) => { const x = num(v); return x !== undefined && Number.isSafeInteger(x) && x > 0 ? x : 0; };
const label = (o: string | null) => (o === 'generic' ? 'Generic' : o === 'direct' ? 'Direct' : 'Campaign');
const typeFromName = (name: string): Output | undefined => (/-\s+Direct Emails\s*$/i.test(name) ? 'direct' : /-\s+Generic Emails\s*$/i.test(name) ? 'generic' : undefined);
const byName = (rec: AirtableRecord) => {
  const out: Record<string, unknown> = {};
  for (const [name, id] of Object.entries(CAMPAIGN_FIELDS)) if (rec.fields[id] !== undefined) out[name] = rec.fields[id];
  return out;
};

/** The Campaigns records linked to the same lead list(s): where Build Campaign put the children. */
async function siblings(at: AirtableClient, rec: AirtableRecord): Promise<AirtableRecord[]> {
  const listIds = ids(rec.fields[CF.lists]);
  const campaignIds = new Set<string>();
  for (const id of listIds) for (const c of ids((await at.get(LEAD_LISTS, id, [LIST.whichCampaign]))?.fields[LIST.whichCampaign])) if (c !== rec.id) campaignIds.add(c);
  const out: AirtableRecord[] = [];
  for (const id of campaignIds) { const c = await at.get(CAMPAIGNS, id, [CF.name, CF.id, CF.directId, CF.genericId, CF.accounts]); if (c) out.push(c); }
  return out;
}

/** Direct or generic for a record with only an ID: its name, else its lead list's final counts. */
async function listType(at: AirtableClient, rec: AirtableRecord): Promise<Output | undefined> {
  const byNameType = typeFromName(text(rec.fields[CF.name]));
  if (byNameType) return byNameType;
  const lists = ids(rec.fields[CF.lists]);
  if (lists.length !== 1) return undefined;
  const l = await at.get(LEAD_LISTS, lists[0], [LIST.finalDirect, LIST.finalGeneric]);
  const d = num(l?.fields[LIST.finalDirect]) ?? 0, g = num(l?.fields[LIST.finalGeneric]) ?? 0;
  return d > 0 && g <= 0 ? 'direct' : g > 0 && d <= 0 ? 'generic' : undefined;
}

/** The EmailBison campaign(s) this record means. */
export async function campaignTargets(at: AirtableClient, rec: AirtableRecord): Promise<Target[]> {
  const name = text(rec.fields[CF.name]);
  const id = bisonId(rec.fields[CF.id]), direct = bisonId(rec.fields[CF.directId]), generic = bisonId(rec.fields[CF.genericId]);
  const own = ids(rec.fields[CF.accounts]);
  if (!direct && !generic) return id ? [{ campaignId: id, outputType: await listType(at, rec), recordId: rec.id, name, accountIds: own }] : [];
  const split = direct > 0 && generic > 0 && direct !== generic;
  const children: Partial<Record<Output, AirtableRecord>> = {};
  if (split && !SUFFIX.test(name)) {
    for (const c of await siblings(at, rec)) {
      const t = typeFromName(text(c.fields[CF.name]));
      if (t && text(c.fields[CF.name]).toLowerCase() === `${name} - ${label(t)} Emails`.toLowerCase()) children[t] = c;
    }
  }
  const out: Target[] = [];
  for (const type of ['direct', 'generic'] as const) {
    const cid = type === 'direct' ? direct : generic;
    if (!cid || out.some((t) => t.campaignId === cid)) continue;
    const child = children[type];
    out.push({
      campaignId: cid, outputType: type, recordId: child?.id ?? rec.id,
      name: child ? text(child.fields[CF.name]) : split ? `${name} - ${label(type)} Emails` : name,
      // A split parent's inboxes are divided between its children: without the child, unknown.
      accountIds: child ? ids(child.fields[CF.accounts]) : split ? undefined : own,
    });
  }
  return out;
}

/** Workspace ID (as Build Campaign: the inboxes' Workspace ID) and each inbox's EmailBison sender id. */
async function workspaceAndSenders(at: AirtableClient, rec: AirtableRecord, targets: Target[]) {
  const accountIds = [...new Set([...ids(rec.fields[CF.accounts]), ...targets.flatMap((t) => t.accountIds ?? [])])];
  const accounts = (await Promise.all(accountIds.map((id) => at.get(EMAIL_ACCOUNTS, id, Object.values(EA))))).filter(Boolean) as AirtableRecord[];
  const senderOf = new Map(accounts.map((a) => [a.id, bisonId(a.fields[EA.emailId])]));
  const fromInboxes = [...new Set(accounts.map((a) => bisonId(a.fields[EA.workspaceId])).filter(Boolean))];
  const fromLookup = [...new Set((Array.isArray(rec.fields[CE.workspaceLookup]) ? rec.fields[CE.workspaceLookup] as unknown[] : [rec.fields[CE.workspaceLookup]]).map(bisonId).filter(Boolean))];
  if (fromInboxes.length > 1) throw new CampaignInputError('the selected inboxes are in more than one EmailBison workspace');
  if (fromLookup.length > 1) throw new CampaignInputError('campaign_workspace_id has more than one workspace');
  if (fromInboxes[0] && fromLookup[0] && fromInboxes[0] !== fromLookup[0]) throw new CampaignInputError(`the inboxes are in workspace ${fromInboxes[0]} but campaign_workspace_id says ${fromLookup[0]}; fix the client or the inboxes`);
  const workspaceId = fromInboxes[0] || fromLookup[0];
  if (!workspaceId) throw new CampaignInputError('no EmailBison workspace: select the Email Accounts (their Workspace ID) or link the client first');
  return { workspaceId, senderOf };
}

/** KPI fields → the top-up rule's percentages (reply = replies / sent, interested = interested / replies). */
export function kpisFrom(fields: Record<string, unknown>) {
  const sent = num(fields[CE.sent]), replies = num(fields[CE.replies]), bounced = num(fields[CE.bounced]), interested = num(fields[CE.interested]), progress = num(fields[CE.progress]);
  const pct = (a: number | undefined, b: number | undefined) => (a !== undefined && b !== undefined && b > 0 ? Math.round((a / b) * 10_000) / 100 : undefined);
  return {
    replyRate: pct(replies, sent), interestedRate: pct(interested, replies), bounceRate: pct(bounced, sent),
    progress: progress === undefined ? undefined : Math.round(progress * 10_000) / 100,
    counts: { sent: sent ?? null, replies: replies ?? null, interested: interested ?? null, bounced: bounced ?? null },
  };
}

async function launchFacts(at: AirtableClient, rec: AirtableRecord): Promise<LaunchFacts> {
  const lists = ids(rec.fields[CF.lists]);
  const list = lists.length === 1 ? await at.get(LEAD_LISTS, lists[0], [LIST.name, LIST.stage, LIST.qa]) : null;
  const clientId = ids(rec.fields[CF.client])[0];
  const client = clientId ? await at.get(CLIENTS, clientId, Object.values(CLIENT)) : null;
  return {
    copy: { workflowStage: text(rec.fields[CF.stage]), approvalSource: text(rec.fields[CE.approvalSource]), approvalException: rec.fields[CE.approvalException] === true },
    leadList: { linked: lists.length, name: text(list?.fields[LIST.name]), stage: text(list?.fields[LIST.stage]), qa: text(list?.fields[LIST.qa]) },
    client: { linked: Boolean(client), name: text(client?.fields[CLIENT.name]), status: text(client?.fields[CLIENT.status]) },
  };
}

/** The record holding the copy: the record itself, or a child's parent (same lead list, name without the suffix). */
async function copyRecord(at: AirtableClient, rec: AirtableRecord): Promise<AirtableRecord> {
  const name = text(rec.fields[CF.name]);
  let id = rec.id;
  if (SUFFIX.test(name)) {
    const base = name.replace(SUFFIX, '').trim().toLowerCase();
    const parent = (await siblings(at, rec)).find((c) => text(c.fields[CF.name]).toLowerCase() === base);
    if (!parent) throw new CampaignInputError(`cannot find the main campaign "${name.replace(SUFFIX, '').trim()}" that holds the copy`);
    id = parent.id;
  }
  const got = await at.get(CAMPAIGNS, id, Object.values(CAMPAIGN_FIELDS));
  if (!got) throw new CampaignInputError(`record ${id} was not found`);
  return got;
}

interface PlannedJob { jobRecord: string; targetRecord: string; output: Output | null; input: Record<string, unknown> }

/** Job(s) for one press (reads only; throws CampaignInputError with what to fix). */
export async function planCampaignAction(db: Db, cfg: Config, at: AirtableClient, rec: AirtableRecord, kind: string): Promise<{ jobs: PlannedJob[]; notes: string[] }> {
  const name = text(rec.fields[CF.name]);
  const targets = await campaignTargets(at, rec);
  if (!targets.length) throw new CampaignInputError('this campaign has no EmailBison campaign ID yet: press Build Campaign first');
  const { workspaceId, senderOf } = await workspaceAndSenders(at, rec, targets);
  const base = { campaignRecordId: rec.id, name, workspace: cfg.emailBisonBuildWorkspace, workspaceId };
  const plain = targets.map((t) => ({ campaignId: t.campaignId, recordId: t.recordId, name: t.name, outputType: t.outputType }));
  switch (kind) {
    case 'campaign.launch':
      return { jobs: [{ jobRecord: rec.id, targetRecord: rec.id, output: null, input: { ...base, targets: plain, facts: await launchFacts(at, rec) } }], notes: [] };
    case 'campaign.pause':
      return { jobs: [{ jobRecord: rec.id, targetRecord: rec.id, output: null, input: { ...base, targets: plain } }], notes: [] };
    case 'campaign.senders': {
      const withSenders = targets.map((t) => {
        if (!t.accountIds) throw new CampaignInputError(`cannot find the "${t.name}" record that holds this part's inboxes; update senders there`);
        if (!t.accountIds.length) throw new CampaignInputError(`"${t.name}" has no Email Accounts selected`);
        const senderEmailIds = t.accountIds.map((a) => senderOf.get(a) ?? 0);
        if (senderEmailIds.some((s) => !s) || new Set(senderEmailIds).size !== senderEmailIds.length) {
          throw new CampaignInputError('every selected inbox needs its own numeric Email ID (EmailBison sender id); sync the inboxes in Campaign Center');
        }
        return { campaignId: t.campaignId, recordId: t.recordId, name: t.name, senderEmailIds: senderEmailIds.map(String) };
      });
      return { jobs: [{ jobRecord: rec.id, targetRecord: rec.id, output: null, input: { ...base, targets: withSenders } }], notes: [] };
    }
    case 'campaign.topup': {
      const listIds = ids(rec.fields[CE.topupList]);
      if (listIds.length !== 1) throw new CampaignInputError(listIds.length ? 'link exactly one Top-up Lead List' : 'pick the Top-up Lead List first');
      const list = await at.get(LEAD_LISTS, listIds[0], Object.values(LIST));
      if (!list) throw new CampaignInputError(`top-up lead list ${listIds[0]} was not found`);
      if (!['ready', 'uploaded'].includes(text(list.fields[LIST.stage]).toLowerCase()) || text(list.fields[LIST.qa]) !== 'Passed') {
        throw new CampaignInputError('the top-up lead list must be QA Passed and Ready first');
      }
      let sheetId = text(list.fields[LIST.sheetLink]);
      if (!sheetId) sheetId = String((await db.query(`SELECT sheet_id FROM lead_list_sheets WHERE list_id=$1 AND kind='companies'`, [list.id])).rows[0]?.sheet_id ?? '');
      if (!sheetId) throw new CampaignInputError('the top-up lead list has no sheet (Lead List Link) yet');
      try { sheetId = sheetIdFrom(sheetId); } catch (e) { throw new CampaignInputError(`the top-up lead list's sheet link is not valid (${(e as Error).message})`); }
      let sequence;
      try { sequence = readSequence(byName(await copyRecord(at, rec))); } catch (e) {
        if (e instanceof CampaignInputError) throw e;
        throw new CampaignInputError(`the campaign copy cannot be read: ${(e as Error).message}`);
      }
      const kpis = kpisFrom(rec.fields);
      const jobs: PlannedJob[] = [];
      const notes: string[] = [];
      for (const t of targets) {
        if (!t.outputType) throw new CampaignInputError(`cannot tell if EmailBison campaign ${t.campaignId} is direct or generic: set its Direct or Generic campaign ID`);
        const leads = num(list.fields[t.outputType === 'generic' ? LIST.finalGeneric : LIST.finalDirect]) ?? 0;
        if (!(leads > 0)) { notes.push(`${label(t.outputType)}: the top-up list has no Final ${label(t.outputType)} leads, skipped`); continue; }
        let copyTags: string[];
        // Signature text does not add merge tags, so the client's sender info is not needed here.
        try { copyTags = mergeTags(outputCopy(sequence, t.outputType, {})); } catch (e) { throw new CampaignInputError(`${label(t.outputType)} copy: ${(e as Error).message}`); }
        jobs.push({
          // One record per campaign + top-up list: a re-press of the same list never uploads again.
          jobRecord: `${rec.id}:topup:${list.id}:${t.outputType}`, targetRecord: t.recordId, output: t.outputType,
          input: {
            campaignId: t.campaignId, name: t.name, workspace: base.workspace, workspaceId, outputType: t.outputType,
            source: { sheetId, tab: t.outputType === 'generic' ? 'Final Generic' : 'Final Direct' }, expectedLeads: leads, copyTags,
            kpis: { replyRate: kpis.replyRate, interestedRate: kpis.interestedRate, bounceRate: kpis.bounceRate, progress: kpis.progress },
            kpiCounts: kpis.counts, kpiException: false, topupListId: list.id, campaignRecordId: rec.id,
          },
        });
      }
      if (!jobs.length) throw new CampaignInputError(`the top-up list has no leads for this campaign (${notes.join('; ')})`);
      return { jobs, notes };
    }
  }
  throw new CampaignInputError(`"${kind}" cannot be started from Campaign Center yet`);
}

/** Build Campaign pressed on the campaign: the same build as the Lead List press, shown here too. */
async function pressBuild(db: Db, cfg: Config, at: AirtableClient, rec: AirtableRecord, press: string): Promise<number> {
  const name = text(rec.fields[CF.name]);
  if (SUFFIX.test(name)) throw new CampaignInputError('press Build Campaign on the main campaign, not on its "- Direct/Generic Emails" part');
  const lists = ids(rec.fields[CF.lists]);
  if (lists.length !== 1) throw new CampaignInputError(lists.length ? `this campaign links ${lists.length} lead lists; link exactly one` : 'link the lead list to this campaign first');
  const list = await at.get(LEAD_LISTS, lists[0], Object.values(LL));
  if (!list) throw new CampaignInputError(`lead list ${lists[0]} was not found`);
  if (!ids(list.fields[LL.whichCampaign]).includes(rec.id)) throw new CampaignInputError('the lead list is linked to a different campaign; fix the link first');
  const { plan, jobs } = await queueBuild(db, cfg, at, list.id, list, press);
  await db.query(`UPDATE airtable_jobs SET campaign_record=$1 WHERE press=$2`, [rec.id, press]);
  const fresh = jobs.filter((j) => j.status === 'queued');
    const msg = buildQueuedMessage(plan, jobs, Boolean(cfg.dryRun && !cfg.liveStages.includes('campaign.build')));
  const progress = { [CF.processing]: 'Running', [CF.message]: msg, [CF.error]: null, [CF.startedAt]: new Date().toISOString(), [CF.completedAt]: null };
  await at.update(CAMPAIGNS, rec.id, { [CE.engineAction]: null, [CE.engineJobId]: jobs.map((j) => j.id).join(', '), [CE.engineMessage]: msg, ...(fresh.length ? { [CE.engineStatus]: 'Queued' } : {}), ...(plan.parent.id === rec.id ? progress : {}) });
  if (plan.parent.id !== rec.id) await at.update(CAMPAIGNS, plan.parent.id, progress);
  return fresh.length;
}

/** Queue a job for every pressed Campaign Center button. Returns how many were queued. */
export async function pollCampaignActions(db: Db, cfg: Config, at: AirtableClient): Promise<number> {
  const recs = await at.list(CAMPAIGNS, QUEUED_FORMULA, READ_FIELDS);
  let queued = 0;
  for (const rec of recs) {
    const action = text(rec.fields[CE.engineAction]);
    const kind = CAMPAIGN_ACTIONS[action];
    const press = `airtable:campaign:${rec.id}:${action}:${text(rec.fields[CE.engineActionSetAt])}`;
    try {
      if (!kind) throw new CampaignInputError(`"${action}" is not wired to the engine yet`);
      if (kind === 'campaign.build') { queued += await pressBuild(db, cfg, at, rec, press); continue; }
      const plan = await planCampaignAction(db, cfg, at, rec, kind);
      const def = STAGES[kind];
      const dryRun = cfg.dryRun && !cfg.liveStages.includes(kind);
      const results = [];
      for (const p of plan.jobs) {
        const r = await enqueue(db, {
          kind, recordId: p.jobRecord, input: p.input, requestId: p.output && kind === 'campaign.topup' ? `${press}:${p.output}` : press,
          dryRun, maxAttempts: def.maxAttempts, deadlineMs: def.deadlineMs,
        });
        await db.query(
          `INSERT INTO airtable_jobs (job_id, record_id, action, target_table, target_record, output, press, campaign_record) VALUES ($1,$2,$3,$4,$5,$6,$7,$2) ON CONFLICT (job_id) DO NOTHING`,
          [r.job.id, rec.id, action, CAMPAIGNS, p.targetRecord, p.output, press]);
        results.push(r);
      }
      const fresh = results.filter((r) => r.status === 'queued');
      queued += fresh.length;
      const jobIds = results.map((r) => r.job.id).join(', ');
      const msg = results.some((r) => r.status === 'already_active')
        ? `${action} is already running for this campaign (job ${results.filter((r) => r.status === 'already_active').map((r) => r.job.id).join(', ')}); this press was ignored`
        : `${action} ${fresh.length ? 'queued' : 'already queued'} on the engine (job ${jobIds})${dryRun ? ' as a dry run: nothing will change in EmailBison' : ''}${plan.notes.length ? `\n${plan.notes.join('\n')}` : ''}`;
      await at.update(CAMPAIGNS, rec.id, {
        [CE.engineAction]: null, [CE.engineJobId]: jobIds, [CE.engineMessage]: msg,
        ...(fresh.length ? { [CE.engineStatus]: 'Queued', [CF.processing]: 'Running', [CF.message]: msg, [CF.error]: null, [CF.startedAt]: new Date().toISOString(), [CF.completedAt]: null } : {}),
      });
    } catch (e) {
      if (!(e instanceof CampaignInputError) && !(e instanceof BuildInputError)) throw e;
      // Bad input: tell the screen and clear the press; nothing was queued or changed.
      await at.update(CAMPAIGNS, rec.id, { [CE.engineAction]: null, [CE.engineStatus]: 'Failed', [CE.engineMessage]: `${action || 'Engine Action'}: ${e.message}` });
    }
  }
  return queued;
}

const stateOf = (x: { status: string; progress?: unknown }) => (x.status === 'succeeded' ? 'Done' : x.status === 'failed' ? 'Failed' : x.status === 'needs_review' ? 'Needs Review'
  : x.status === 'running' ? 'Running' : x.status === 'queued' && x.progress ? 'Waiting' : 'Queued');
const isFinished = (s: string) => ['Done', 'Failed', 'Needs Review'].includes(s);

/** Write one Campaign Center job's change back (with every job of the same press, e.g. Direct + Generic top-ups). */
export async function syncCampaignActionJob(db: Db, at: AirtableClient, j: any, state: string, key: string): Promise<void> {
  await db.query(`UPDATE airtable_jobs SET written=$2, finished=$3, updated_at=now() WHERE job_id=$1`, [j.job_id, key, isFinished(state)]);
  const all = (await db.query(
    `SELECT a.output, a.target_record, j.kind, j.status, j.progress, j.error, j.result, j.dry_run, j.input
     FROM airtable_jobs a JOIN jobs j ON j.id = a.job_id WHERE a.press = $1 ORDER BY a.job_id`, [j.press])).rows;
  const states = all.map(stateOf);
  const overall = states.includes('Failed') ? 'Failed' : states.includes('Needs Review') ? 'Needs Review' : states.every((x) => x === 'Done') ? 'Done'
    : states.includes('Running') ? 'Running' : states.includes('Waiting') ? 'Waiting' : 'Queued';
  const line = (x: any, s: string) => (s === 'Done' ? `${x.dry_run ? 'Dry run (nothing changed): ' : ''}${x.result?.message ?? `${j.action} finished`}`
    : s === 'Waiting' ? String(x.progress) : s === 'Failed' || s === 'Needs Review' ? `${s === 'Needs Review' ? 'Needs review' : 'Failed'}: ${x.error ?? 'unknown error'}` : s);
  const msg = all.length === 1 ? line(all[0], states[0]) : `${j.action}\n${all.map((x, i) => `${label(x.output)}: ${line(x, states[i])}`).join('\n')}`;
  const done = isFinished(overall);
  const now = new Date().toISOString();
  const bad = overall === 'Failed' || overall === 'Needs Review';
  const record = j.campaign_record ?? j.record_id;
  const fields: Record<string, unknown> = {
    [CE.engineStatus]: overall, [CE.engineMessage]: msg,
    [CF.processing]: overall === 'Done' ? 'Completed' : overall === 'Failed' ? 'Failed' : overall === 'Needs Review' ? 'Needs review' : 'Running',
    [CF.message]: msg, [CF.error]: bad ? msg : null, ...(done ? { [CF.completedAt]: now } : {}),
  };
  const real = all.filter((x) => !x.dry_run);
  const extra: string[] = [];
  if (done && j.kind === 'campaign.launch' && overall === 'Done' && real.length === all.length) {
    // Launched: the record (and any child it launched) shows Live / Active.
    Object.assign(fields, { [CF.stage]: 'Live', [CF.status]: 'Active' });
    for (const x of all) for (const t of (x.input?.targets ?? []) as { recordId?: string }[]) if (t.recordId && t.recordId !== record && !extra.includes(t.recordId)) extra.push(t.recordId);
  }
  if (done && j.kind === 'campaign.topup') {
    if (real.length === 0) Object.assign(fields, { [CE.topupMessage]: msg });
    else {
      const sum = (f: (x: any) => number) => all.reduce((n, x, i) => n + (states[i] === 'Done' && !x.dry_run ? f(x) : 0), 0);
      Object.assign(fields, {
        [CE.topupStatus]: overall === 'Done' ? 'Completed' : 'Failed',
        [CE.topupAdded]: sum((x) => Number(x.result?.leads?.added ?? 0)),
        [CE.topupSkipped]: sum((x) => Number(x.result?.leads?.skippedAlreadyInCampaign ?? 0)),
        // Leads of a part whose top-up failed or stopped for review (nothing counted as added there).
        [CE.topupFailed]: all.reduce((n, x, i) => n + (['Failed', 'Needs Review'].includes(states[i]) ? Number(x.input?.expectedLeads ?? 0) : 0), 0),
        [CE.topupLastRun]: now, [CE.topupMessage]: msg,
      });
    }
  }
  await at.update(CAMPAIGNS, record, fields);
  for (const id of extra) await at.update(CAMPAIGNS, id, { [CF.stage]: 'Live', [CF.status]: 'Active' });
}

/** EmailBison IDs of every Campaigns record with "Skip Bounce Pause" ticked (the bounce check never pauses them). */
export async function skipBouncePauseIds(at: Pick<AirtableClient, 'list'>): Promise<number[]> {
  const recs = await at.list(CAMPAIGNS, `{Skip Bounce Pause}`, [CF.id, CF.directId, CF.genericId], 1000);
  return [...new Set(recs.flatMap((r) => [r.fields[CF.id], r.fields[CF.directId], r.fields[CF.genericId]].map(bisonId)).filter(Boolean))].sort((a, b) => a - b);
}

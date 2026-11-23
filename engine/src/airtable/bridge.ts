// Airtable bridge: the "Lead List Center (Engine)" screen's buttons set Engine Action on a
// Lead Lists record; every poll the engine
//   1. reads records with Runs on Engine checked and an Engine Action set,
//   2. turns the record into job input and queues ONE job (request id = record + action +
//      the time the button was pressed, so a double press or a re-poll never queues twice),
//   3. clears Engine Action and writes Queued;
// and for every job it queued, writes progress and the final result back to the record,
// in the same fields the old n8n flows filled, so the screen reads it the same way.
// Nothing here is outward-facing: it only reads and writes this one Lead Lists record.
import type { Db } from '../db/pool.js';
import type { Config } from '../config.js';
import type { AirtableClient, AirtableRecord } from '../providers/airtable.js';
import { enqueue } from '../queue.js';
import { STAGES } from '../stages/index.js';
import { BuildInputError, CAMPAIGNS, CF, queueBuild } from './campaignBuild.js';
import { LEAD_LIST_FIELDS as LIST_NAMES } from '../leadlist/legacy/fieldNames.js';
import { CAMPAIGN_FIELDS } from '../campaign/campaignFields.js';
/** Campaigns: "Campaign Thesis" (rich text), read by n8n's company review for its campaign context. */
const CAMPAIGN_THESIS = 'fldlixHfhzrd7nuSc';

// Generate filters sends the AI only the client fields that help pick targeting and keywords
// (Alex, 2026-11-20): who the client is and what it offers. Never billing, KPIs, logins or
// system fields. The copied n8n prompt code runs unchanged on this smaller record.
export const FILTER_CLIENT_FIELDS: Record<string, string> = {
  fld48x6Yg3v6RP30W: 'Name',
  fldTHTrYh0GCFeBLG: 'Brand Name',
  fld91lSa5rBfLrIQM: 'Client Type',
  fldWAdvAzoPxqW0Ut: 'Cold Traffic Offer',
  flde94SLnY3TDibbj: 'Front End Offer(s)',
  fldKPi4HkTJTaMDwj: 'Back End Offer(s)',
  fldUDxVml8BvjJdeU: 'Outbound Risk Reversal',
  fldIMJnjdGGAPotMW: 'Sender Title',
};

export const LEAD_LISTS = 'tblVOg9BkPOMmnitt';
export const CLIENTS = 'tblcjRBGJEWh5KgOt';

/** Lead Lists field IDs (stable even if a field is renamed). */
export const F = {
  runsOnEngine: 'fldKPpOJP097SYrhS',
  engineAction: 'fldZgT9Rbnra2x5GP',
  engineActionSetAt: 'fldCNFsiEMshNOyBO',
  engineStatus: 'fldpuekpeAVeP0Kqn',
  engineJobId: 'fldUjq8KXRscLHOWd',
  engineMessage: 'fld37FC33xjt25nSQ',
  name: 'fldbg5PAnKyFHc3uy',
  client: 'fldEujtSLqwdpOyGD',
  filtersJson: 'fldC2hZQ3gSqLmi1y',
  icp: 'fldcYwP7Dlq4uyC39',
  thesis: 'fldg6HZIKqe8c8RtW',
  sampleSize: 'fldiedxTwtn6TikJi',
  sampleApproved: 'fldqGx4RU4zDYxitK',
  expansionTarget: 'fldYzvqGmQZxXL9AP',
  personaDna: 'fldRIomZHeVxPWveE',
  contactSource: 'fldwoK7IcKH6NYgVJ',
  contactFiltersJson: 'fld8Y8iYpvUV4FDDX',
  contactSampleSize: 'fldE2XBsGSES6fT6X',
  contactApproved: 'fldVz983EKKiPSzjc',
  includeGeneric: 'fldIXN5t3bqfiZ0Wu',
  includeDirect: 'fldfFcn3BB2RyiWer',
  useLeadMagic: 'fldJbIiQ35ZFPsXPL',
  leadMagicJobId: 'fld1UmiJ0PsIndCtO',
  footprint200: 'fldAFATYp9G26MmVj',
  // written back
  processingStatus: 'fldf9wpMGWg0SebHV',
  startedAt: 'fldUZOY2Ubs58DQ3V',
  completedAt: 'fldMSv3547BOvfdmH',
  workflowMessage: 'fldVnH7Pn1PxlZI5b',
  workflowError: 'fldBiCrm8Xm1V6FxF',
  sheetLink: 'fldSOTvnUxzKWXMDD',
  sourceCount: 'fldRLtvugIxH9qun1',
  companyGood: 'fldAWCY4Tl9jpQtYc',
  companyBad: 'fldqaiJodYBS3GpRu',
  companyFitRate: 'fldDD7HGFq0j3Iwfp',
  companyStatus: 'fldY1i1787UwZFOr6',
  companySummary: 'fld6BhZSLdGOkCJCZ',
  contactGood: 'fldkWL67N8ZaBIaDi',
  contactBad: 'flda4qjRC0sCeStBg',
  contactFitRate: 'fldbiciFuOmAzv38D',
  contactStatus: 'fldVH77A3Ozjh4t8k',
  contactSummary: 'fldnScb360OZ17VRt',
  verifyGood: 'fld8kUuSdLo5autI7',
  verifyRisky: 'fldXl4sV7ma4YAOv7',
  verifyBad: 'fld9Jgzxc9JqeFAus',
  finalDirect: 'fldQZJCpTofahmTkl',
  finalGeneric: 'fld0FHomkh3uyx0FD',
  leads: 'fld2G5D1yCPFGFiVF',
  mvJobId: 'fld4B7jLPdcgzdkgF',
  verifiedAt: 'fldxehC2cjGGK8ruN',
  verifyState: 'fldflrzfkhmW7JarV',
} as const;

/** Client (Workspace IDs) fields read for the fit profile. Only these; never the key fields. */
const CLIENT_FIELDS = { name: 'fld48x6Yg3v6RP30W', brand: 'fldTHTrYh0GCFeBLG', coldOffer: 'fldWAdvAzoPxqW0Ut', frontEnd: 'flde94SLnY3TDibbj', exclusionQueryId: 'fldrvOi88COOEPBGe' };

export const ACTIONS: Record<string, string> = {
  'Generate Filters': 'leadlist.filters',
  'Run Company Sample': 'leadlist.sample',
  'Expand Companies': 'leadlist.expand',
  'Refit Companies': 'leadlist.refit',
  'Find Contacts': 'leadlist.contacts',
  'Verify and Finalize': 'leadlist.verify',
  'Run Automated QA': 'leadlist.qa',
  'Deep Review Companies': 'leadlist.deepreview',
  'Deep Review Contacts': 'leadlist.deepcontacts',
  'Prepare Enrichment Prompt': 'leadlist.enrichprompt',
  'Run Enrichment': 'leadlist.enrich',
  'Build Campaign': 'campaign.build',
};

const READ_FIELDS = [F.engineAction, F.engineActionSetAt, F.name, F.client, F.filtersJson, F.icp, F.thesis, F.sampleSize, F.sampleApproved,
  F.expansionTarget, F.personaDna, F.contactFiltersJson, F.contactSampleSize, F.contactApproved, F.contactSource, F.includeGeneric, F.includeDirect, F.useLeadMagic, F.footprint200,
  'fldepbn71awSjmZPV', 'fld8nrebRFL0O8kgj', 'fldUB4WsLi5kq6rUy', F.finalDirect, F.finalGeneric];
// Field names, not IDs: Airtable formulas only take names. The two fields are the engine's own.
const QUEUED_FORMULA = `AND({Runs on Engine}, {Engine Action} != '')`;

class InputError extends Error {}
const text = (v: unknown) => (v === undefined || v === null ? '' : String(v)).trim();
const num = (v: unknown) => { const n = Number(v); return Number.isFinite(n) && n > 0 ? n : undefined; };
function json(v: unknown, label: string): Record<string, unknown> | undefined {
  const s = text(v);
  if (!s) return undefined;
  try {
    const x = JSON.parse(s);
    if (x && typeof x === 'object' && !Array.isArray(x)) return x;
  } catch { /* below */ }
  throw new InputError(`${label} is not valid JSON; fix it in Source & ICP and press the button again`);
}

async function clientContext(at: AirtableClient, rec: AirtableRecord): Promise<string> {
  const linked = (rec.fields[F.client] as string[] | undefined) ?? [];
  const parts: string[] = [];
  if (linked[0]) {
    const c = await at.get(CLIENTS, linked[0], Object.values(CLIENT_FIELDS));
    if (c) {
      const name = text(c.fields[CLIENT_FIELDS.brand]) || text(c.fields[CLIENT_FIELDS.name]);
      if (name) parts.push(`Client: ${name}.`);
      if (text(c.fields[CLIENT_FIELDS.coldOffer])) parts.push(`Cold offer: ${text(c.fields[CLIENT_FIELDS.coldOffer])}`);
      if (text(c.fields[CLIENT_FIELDS.frontEnd])) parts.push(`Front-end offer: ${text(c.fields[CLIENT_FIELDS.frontEnd])}`);
    }
  }
  if (text(rec.fields[F.icp])) parts.push(`Who this list is for: ${text(rec.fields[F.icp])}`);
  return parts.join('\n');
}

/** Job input for one button press, from the record (plus the client's offer). */
export async function buildInput(db: Db, at: AirtableClient, rec: AirtableRecord, kind: string): Promise<Record<string, unknown>> {
  const r = rec.fields;
  const who = { thesis: text(r[F.thesis]) || undefined, targeting: text(r[F.icp]) || text(r[F.thesis]) || undefined, clientContext: await clientContext(at, rec) || undefined };
  // Like n8n ("Apply DiscoLike Exclusion Query"): the client's DiscoLike exclusion list (its
  // existing and past-campaign domains) is added to the plan every time the list runs.
  const linked = (rec.fields[F.client] as string[] | undefined) ?? [];
  const clientExclusion = linked[0] && ['leadlist.sample', 'leadlist.expand', 'leadlist.refit'].includes(kind)
    ? text((await at.get(CLIENTS, linked[0], [CLIENT_FIELDS.exclusionQueryId]))?.fields[CLIENT_FIELDS.exclusionQueryId]) : '';
  const filters = () => {
    const x = json(r[F.filtersJson], 'DiscoLike Company Filters JSON');
    if (!x) throw new InputError('this list has no company filters yet: generate and review the filters first');
    if (clientExclusion) {
      const saved = Array.isArray(x.exclusion_query_id) ? x.exclusion_query_id.map(String) : x.exclusion_query_id ? [String(x.exclusion_query_id)] : [];
      x.exclusion_query_id = [...new Set([...saved, clientExclusion])];
    }
    return x;
  };
  switch (kind) {
    case 'leadlist.enrichprompt':
    case 'leadlist.enrich': {
      // The copied n8n enrichment code reads the list by field NAME (key fields never read).
      const got = await at.get(LEAD_LISTS, rec.id, Object.keys(LIST_NAMES));
      if (!got) throw new InputError(`record ${rec.id} was not found`);
      const project = { id: got.id, fields: Object.fromEntries(Object.entries(got.fields).map(([k, v]) => [LIST_NAMES[k] ?? k, v])) as Record<string, unknown> };
      const s = await db.query(`SELECT sheet_id, tab FROM lead_list_sheets WHERE list_id=$1 AND kind='companies'`, [rec.id]);
      if (!text(project.fields['Lead List Link']) && s.rows[0]) project.fields['Lead List Link'] = `https://docs.google.com/spreadsheets/d/${s.rows[0].sheet_id}`;
      return { project, companyTab: s.rows[0]?.tab ?? undefined };
    }
    case 'leadlist.deepreview':
    case 'leadlist.deepcontacts': {
      // The copied n8n review code reads the list by field NAME (key fields never read). It also
      // reads "Client Context" (the allowed client fields only) and the campaign's thesis.
      const got = await at.get(LEAD_LISTS, rec.id, Object.keys(LIST_NAMES));
      if (!got) throw new InputError(`record ${rec.id} was not found`);
      const project = { id: got.id, fields: Object.fromEntries(Object.entries(got.fields).map(([k, v]) => [LIST_NAMES[k] ?? k, v])) as Record<string, unknown> };
      if (who.clientContext) project.fields['Client Context'] = who.clientContext;
      const campaignId = ((project.fields['Which Campaign?'] as string[] | undefined) ?? []).find((x) => /^rec[A-Za-z0-9]{14}$/.test(String(x)));
      const c = campaignId ? await at.get(CAMPAIGNS, campaignId, [CAMPAIGN_THESIS]) : null;
      return { project, ...(c ? { campaign: { id: c.id, fields: { 'Campaign Thesis': text(c.fields[CAMPAIGN_THESIS]) } } } : {}) };
    }
    case 'leadlist.qa': {
      // The copied n8n QA code reads the list and its linked campaigns by field NAME.
      const got = await at.get(LEAD_LISTS, rec.id, Object.keys(LIST_NAMES));
      if (!got) throw new InputError(`record ${rec.id} was not found`);
      const project = { id: got.id, fields: Object.fromEntries(Object.entries(got.fields).map(([k, v]) => [LIST_NAMES[k] ?? k, v])) as Record<string, unknown> };
      if (!text(project.fields['Lead List Link'])) {
        const s = await db.query(`SELECT sheet_id FROM lead_list_sheets WHERE list_id=$1 AND kind='companies'`, [rec.id]);
        if (!s.rows[0]) throw new InputError('this list has no sheet yet: run Verify and Finalize first');
        project.fields['Lead List Link'] = `https://docs.google.com/spreadsheets/d/${s.rows[0].sheet_id}`;
      }
      const campaignNames = Object.fromEntries(Object.entries(CAMPAIGN_FIELDS).map(([name, id]) => [id, name]));
      const ids = [...new Set(((project.fields['Which Campaign?'] as string[] | undefined) ?? []).filter((x) => /^rec[A-Za-z0-9]{14}$/.test(String(x))))];
      const records = [];
      for (const id of ids) {
        const c = await at.get(CAMPAIGNS, id, Object.values(CAMPAIGN_FIELDS));
        if (c) records.push({ id: c.id, fields: Object.fromEntries(Object.entries(c.fields).map(([k, v]) => [campaignNames[k] ?? k, v])) });
      }
      return { project, campaigns: { records } };
    }
    case 'leadlist.filters': {
      // The copied n8n code reads the record and the client by field NAME; fetch only the
      // allowed fields (never the key/password fields) and rename them.
      const byName = async (table: string, id: string, names: Record<string, string>) => {
        const got = await at.get(table, id, Object.keys(names));
        if (!got) throw new InputError(`record ${id} was not found`);
        return { id: got.id, fields: Object.fromEntries(Object.entries(got.fields).map(([k, v]) => [names[k] ?? k, v])) };
      };
      const record = await byName(LEAD_LISTS, rec.id, LIST_NAMES);
      // Like the n8n screen: the old plan and its 4 helper fields are cleared before generating.
      for (const n of ['DiscoLike Company Filters JSON', 'Employee Range', 'Country Filters', 'State Filters', 'Homepage Keywords']) delete record.fields[n];
      if (!text(record.fields['ICP Description'])) throw new InputError('write the targeting sentence (ICP Description) first');
      const clientIds = (rec.fields[F.client] as string[] | undefined) ?? [];
      if (clientIds.length !== 1) throw new InputError('link exactly one client to this list first');
      const client = await byName(CLIENTS, clientIds[0], FILTER_CLIENT_FIELDS);
      return { record, client, action: 'Generate Filters' };
    }
    case 'leadlist.sample':
      return { filters: filters(), sampleSize: num(r[F.sampleSize]), ...who };
    case 'leadlist.expand':
      if (r[F.sampleApproved] !== true) throw new InputError('approve the company sample first (Company Sample Approved)');
      if (!num(r[F.expansionTarget])) throw new InputError('set an Expansion Target first (for example 1000)');
      return { filters: filters(), target: num(r[F.expansionTarget]), sampleApproved: true, name: text(r[F.name]) || undefined, ...who };
    case 'leadlist.refit':
      return { filters: filters(), ...who };
    case 'leadlist.contacts': {
      // Not approved yet = a contact sample (old "Build Contact Sample"); approved = everyone left.
      const approved = r[F.contactApproved] === true;
      return {
        contactFilters: json(r[F.contactFiltersJson], 'Contact Filters JSON') ?? {},
        personaDna: text(r[F.personaDna]) || undefined,
        companies: approved ? undefined : num(r[F.contactSampleSize]) ?? 100,
        // Contact Source (Alex, 2026-11-23): DiscoLike's new one-step Contacts run is the default
        // (empty or "DiscoLike Contacts Run"); the legacy "DiscoLike" / "DiscoLike + ContraGen" run
        // only when picked on purpose, until DiscoLike retires them on 2026-12-31.
        contraGen: text(r[F.contactSource]).toLowerCase() === 'discolike + contragen',
        contactsRun: ['', 'discolike contacts run'].includes(text(r[F.contactSource]).toLowerCase()),
        ...who,
      };
    }
    case 'leadlist.verify': {
      const s = await db.query(`SELECT sheet_id, tab FROM lead_list_sheets WHERE list_id=$1 AND kind='companies'`, [rec.id]);
      if (!s.rows[0]) throw new InputError('this list has no engine sheet yet: run Expand Companies and Find Contacts first');
      const direct = r[F.includeDirect] === true, generic = r[F.includeGeneric] === true;
      return {
        // The engine sheet's own tabs (the old n8n sheets used "Expanded Companies").
        source: { sheetId: s.rows[0].sheet_id, contactsTab: 'Contacts', companiesTab: s.rows[0].tab },
        includeDirect: direct || !generic, includeGeneric: generic || !direct,
        genericFootprintMax200: r[F.footprint200] === true,
        leadMagic: r[F.useLeadMagic] === true,
        writeFinalTabs: true,
        name: text(r[F.name]) || undefined,
      };
    }
  }
  throw new InputError(`"${kind}" cannot be started from Airtable yet`);
}

/** Step 1-3: queue a job for every pressed button. Returns how many were queued. */
export async function pollActions(db: Db, cfg: Config, at: AirtableClient): Promise<number> {
  const recs = await at.list(LEAD_LISTS, QUEUED_FORMULA, READ_FIELDS);
  let queued = 0;
  for (const rec of recs) {
    const action = text(rec.fields[F.engineAction]);
    const kind = ACTIONS[action];
    try {
      if (kind === 'campaign.build') {
        const press = `airtable:${rec.id}:${action}:${text(rec.fields[F.engineActionSetAt])}`;
        const { plan, jobs } = await queueBuild(db, cfg, at, rec.id, rec, press);
        const fresh = jobs.filter((j) => j.status === 'queued');
        queued += fresh.length;
        const names = plan.outputs.map((o) => `"${o.name}" (${o.leads} leads, ${o.senderEmailIds.length} inboxes)`).join(' and ');
        const msg = `${fresh.length ? 'Build Campaign queued' : 'Build Campaign already queued'} on the engine (job ${jobs.map((j) => j.id).join(', ')}): ${names}; drafts only, never launched${jobs.some((j) => j.status !== 'duplicate_request') && cfg.dryRun && !cfg.liveStages.includes('campaign.build') ? '; dry run: nothing is created in EmailBison' : ''}`;
        await at.update(LEAD_LISTS, rec.id, { [F.engineAction]: null, [F.engineJobId]: jobs.map((j) => j.id).join(', '), [F.engineMessage]: msg, ...(fresh.length ? { [F.engineStatus]: 'Queued' } : {}) });
        await at.update(CAMPAIGNS, plan.parent.id, { [CF.processing]: 'Running', [CF.message]: msg, [CF.error]: null, [CF.startedAt]: new Date().toISOString(), [CF.completedAt]: null });
        continue;
      }
      if (!kind) throw new InputError(`"${action}" is not wired to the engine yet`);
      const def = STAGES[kind];
      const input = await buildInput(db, at, rec, kind);
      const r = await enqueue(db, {
        kind, recordId: rec.id, input, requestId: `airtable:${rec.id}:${action}:${text(rec.fields[F.engineActionSetAt])}`,
        dryRun: cfg.dryRun && !cfg.liveStages.includes(kind), maxAttempts: def.maxAttempts, deadlineMs: def.deadlineMs,
      });
      await db.query(`INSERT INTO airtable_jobs (job_id, record_id, action) VALUES ($1,$2,$3) ON CONFLICT (job_id) DO NOTHING`, [r.job.id, rec.id, action]);
      if (r.status === 'queued') queued++;
      const msg = r.status === 'already_active'
        ? `${action} is already running for this list (job ${r.job.id}); this press was ignored`
        : `${action} queued on the engine (job ${r.job.id})${r.job.dry_run ? ' as a dry run: no credits will be spent' : ''}`;
      await at.update(LEAD_LISTS, rec.id, {
        [F.engineAction]: null, [F.engineJobId]: String(r.job.id), [F.engineMessage]: msg,
        ...(r.status === 'queued' ? { [F.engineStatus]: 'Queued', [F.processingStatus]: 'Queued', [F.workflowError]: null, [F.workflowMessage]: msg } : {}),
      });
    } catch (e) {
      if (e instanceof BuildInputError) {
        // Nothing was queued or spent; the list's own processing fields are left alone.
        await at.update(LEAD_LISTS, rec.id, { [F.engineAction]: null, [F.engineStatus]: 'Failed', [F.engineMessage]: `Build Campaign: ${e.message}` });
        continue;
      }
      if (!(e instanceof InputError)) throw e;
      // Bad input: tell the screen and clear the press; nothing was queued or spent.
      await at.update(LEAD_LISTS, rec.id, { [F.engineAction]: null, [F.engineStatus]: 'Failed', [F.engineMessage]: e.message, [F.processingStatus]: 'Failed', [F.workflowError]: e.message });
    }
  }
  return queued;
}

const pct = (x: unknown) => (Number.isFinite(Number(x)) ? Number(x) : null);

/** Result fields per job kind (only for real runs; a dry run writes its message only). */
export function resultFields(kind: string, res: any): Record<string, unknown> {
  if (!res || res.dryRun) return {};
  switch (kind) {
    case 'leadlist.filters':
    case 'leadlist.qa':
    case 'leadlist.deepreview':
    case 'leadlist.deepcontacts':
    case 'leadlist.enrichprompt':
    case 'leadlist.enrich':
      return { ...(res.airtableFields ?? {}) };
    case 'leadlist.sample': {
      const s = res.sample ?? {};
      const reasons = (res.topDropReasons ?? []).map((x: any) => `- ${x.reason}: ${x.companies}`).join('\n');
      return { [F.sourceCount]: s.reviewed ?? null, [F.companyGood]: (s.tier1 ?? 0) + (s.tier2 ?? 0), [F.companyBad]: s.cut ?? 0, [F.companyFitRate]: pct(s.usableRate), [F.companyStatus]: s.status ?? null, [F.companySummary]: [res.message, reasons && `Top cut reasons:\n${reasons}`].filter(Boolean).join('\n\n') };
    }
    case 'leadlist.expand':
    case 'leadlist.refit': {
      const l = res.list ?? {};
      const status = l.status ?? (l.usableRate >= 0.8 ? 'Passed' : l.usableRate >= 0.7 ? 'Needs Review' : 'Failed');
      return { [F.sourceCount]: l.total ?? null, [F.companyGood]: l.usable ?? null, [F.companyBad]: l.cut ?? null, [F.companyFitRate]: pct(l.usableRate), [F.companyStatus]: status, [F.companySummary]: res.message ?? null, ...(res.sheet?.url ? { [F.sheetLink]: res.sheet.url } : {}) };
    }
    case 'leadlist.contacts': {
      const c = res.contacts;
      if (!c) return {};
      const reasons = (res.topCutReasons ?? []).map((x: any) => `- ${x.reason}: ${x.contacts}`).join('\n');
      return { [F.contactGood]: c.usable ?? null, [F.contactBad]: c.cut ?? null, [F.contactFitRate]: pct(c.usableRate), [F.contactStatus]: c.status ?? null, [F.contactSummary]: [res.message, reasons && `Top cut reasons:\n${reasons}`].filter(Boolean).join('\n\n'), ...(res.sheet?.url ? { [F.sheetLink]: res.sheet.url } : {}) };
    }
    case 'leadlist.verify': {
      const c = res.counts ?? {};
      return { [F.verifyGood]: c.good ?? null, [F.verifyRisky]: c.risky ?? null, [F.verifyBad]: c.bad ?? null, [F.finalDirect]: res.finalDirectCount ?? null, [F.finalGeneric]: res.finalGenericCount ?? null, [F.leads]: (res.finalDirectCount ?? 0) + (res.finalGenericCount ?? 0), [F.mvJobId]: res.millionVerifierJobId ?? null, ...(res.leadMagic?.jobId ? { [F.leadMagicJobId]: res.leadMagic.jobId } : {}), [F.verifiedAt]: new Date().toISOString(), [F.verifyState]: 'completed' };
    }
  }
  return {};
}

/** Step 4: write progress and results of every job the bridge queued, once per change. */
export async function syncResults(db: Db, at: AirtableClient): Promise<number> {
  const r = await db.query(
    `SELECT a.job_id, a.record_id, a.action, a.written, a.target_table, a.target_record, a.parent_record, a.output, a.press,
            j.kind, j.status, j.progress, j.error, j.result, j.dry_run, j.attempts
     FROM airtable_jobs a JOIN jobs j ON j.id = a.job_id WHERE NOT a.finished ORDER BY a.job_id`);
  let wrote = 0;
  for (const j of r.rows) {
    const waiting = j.status === 'queued' && j.progress;
    const state = j.status === 'succeeded' ? 'Done' : j.status === 'failed' ? 'Failed' : j.status === 'needs_review' ? 'Needs Review'
      : j.status === 'running' ? 'Running' : waiting ? 'Waiting' : 'Queued';
    const key = `${state}|${waiting ? j.progress : ''}`;
    if (key === j.written) continue;
    if (j.target_table === CAMPAIGNS) {
      await syncCampaignJob(db, at, j, state, key);
      wrote++;
      continue;
    }
    const fields: Record<string, unknown> = { [F.engineStatus]: state };
    const finished = ['Done', 'Failed', 'Needs Review'].includes(state);
    if (state === 'Running') Object.assign(fields, { [F.processingStatus]: 'Running', ...(j.written?.startsWith('Running') || j.written?.startsWith('Waiting') ? {} : { [F.startedAt]: new Date().toISOString() }) });
    if (state === 'Waiting') Object.assign(fields, { [F.processingStatus]: 'Waiting', [F.engineMessage]: String(j.progress), [F.workflowMessage]: String(j.progress) });
    if (state === 'Done') {
      const msg = `${j.dry_run ? 'Dry run (nothing spent): ' : ''}${j.result?.message ?? `${j.action} finished`}`;
      Object.assign(fields, resultFields(j.kind, j.result), { [F.processingStatus]: 'Completed', [F.completedAt]: new Date().toISOString(), [F.engineMessage]: msg, [F.workflowMessage]: msg, [F.workflowError]: null });
    }
    if (state === 'Failed' || state === 'Needs Review') {
      const msg = `${state === 'Needs Review' ? 'Needs review' : 'Failed'}: ${j.error ?? 'unknown error'}`;
      Object.assign(fields, { [F.processingStatus]: 'Failed', [F.completedAt]: new Date().toISOString(), [F.engineMessage]: msg, [F.workflowError]: msg });
    }
    await at.update(LEAD_LISTS, j.record_id, fields);
    await db.query(`UPDATE airtable_jobs SET written=$2, finished=$3, updated_at=now() WHERE job_id=$1`, [j.job_id, key, finished]);
    wrote++;
  }
  return wrote;
}

/** One bridge tick: results first (cheap), then new button presses. */
export async function bridgeTick(db: Db, cfg: Config, at: AirtableClient): Promise<{ queued: number; wrote: number }> {
  const wrote = await syncResults(db, at);
  const queued = await pollActions(db, cfg, at);
  return { queued, wrote };
}

const label = (o: string) => (o === 'generic' ? 'Generic' : 'Direct');

/** One campaign.build job: its Campaigns record, the parent's per-output ID, and the list's Engine fields (all outputs of the press). */
async function syncCampaignJob(db: Db, at: AirtableClient, j: any, state: string, key: string) {
  const finished = ['Done', 'Failed', 'Needs Review'].includes(state);
  const now = new Date().toISOString();
  const res = j.result ?? {};
  const msg = state === 'Done' ? `${j.dry_run ? 'Dry run (nothing created): ' : ''}${res.message ?? 'campaign built'}`
    : state === 'Waiting' ? String(j.progress) : finished ? `${state === 'Needs Review' ? 'Needs review' : 'Failed'}: ${j.error ?? 'unknown error'}` : state;
  const processing = state === 'Done' ? 'Completed' : state === 'Failed' ? 'Failed' : state === 'Needs Review' ? 'Needs review' : 'Running';
  const idField = j.output === 'generic' ? CF.genericId : CF.directId;
  const built = state === 'Done' && !j.dry_run && Number(res.campaignId) > 0;
  await at.update(CAMPAIGNS, j.target_record, {
    [CF.processing]: processing, [CF.message]: msg, [CF.error]: finished && state !== 'Done' ? msg : null,
    ...(finished ? { [CF.completedAt]: now } : {}),
    ...(built ? { [CF.id]: Number(res.campaignId), [idField]: Number(res.campaignId) } : {}),
  });
  if (built && j.parent_record && j.parent_record !== j.target_record) await at.update(CAMPAIGNS, j.parent_record, { [idField]: Number(res.campaignId) });
  await db.query(`UPDATE airtable_jobs SET written=$2, finished=$3, updated_at=now() WHERE job_id=$1`, [j.job_id, key, finished]);

  // The lead list and the parent campaign show the whole press: every output's latest line.
  const all = (await db.query(
    `SELECT a.output, j.status, j.progress, j.error, j.result, j.dry_run FROM airtable_jobs a JOIN jobs j ON j.id = a.job_id WHERE a.press = $1 ORDER BY a.output`, [j.press])).rows;
  const states = all.map((x) => (x.status === 'succeeded' ? 'Done' : x.status === 'failed' ? 'Failed' : x.status === 'needs_review' ? 'Needs Review' : x.status === 'running' ? 'Running' : x.status === 'queued' && x.progress ? 'Waiting' : 'Queued'));
  const overall = states.includes('Failed') ? 'Failed' : states.includes('Needs Review') ? 'Needs Review' : states.every((x) => x === 'Done') ? 'Done' : states.includes('Running') ? 'Running' : states.includes('Waiting') ? 'Waiting' : 'Queued';
  const lines = all.map((x, i) => `${label(x.output)}: ${states[i] === 'Done' ? `${x.dry_run ? 'dry run, ' : ''}${x.result?.message ?? 'built'}` : states[i] === 'Waiting' ? x.progress : ['Failed', 'Needs Review'].includes(states[i]) ? `${states[i]}: ${x.error ?? ''}` : states[i]}`).join('\n');
  await at.update(LEAD_LISTS, j.record_id, { [F.engineStatus]: overall, [F.engineMessage]: `Build Campaign\n${lines}` });
  if (j.parent_record && j.parent_record !== j.target_record) {
    const done = ['Done', 'Failed', 'Needs Review'].includes(overall);
    await at.update(CAMPAIGNS, j.parent_record, {
      [CF.processing]: overall === 'Done' ? 'Completed' : overall === 'Failed' ? 'Failed' : overall === 'Needs Review' ? 'Needs review' : 'Running',
      [CF.message]: lines, ...(done ? { [CF.completedAt]: now } : {}), [CF.error]: ['Failed', 'Needs Review'].includes(overall) ? lines : null,
    });
  }
}

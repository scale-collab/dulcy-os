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
  contactFiltersJson: 'fld8Y8iYpvUV4FDDX',
  contactSampleSize: 'fldE2XBsGSES6fT6X',
  contactApproved: 'fldVz983EKKiPSzjc',
  includeGeneric: 'fldIXN5t3bqfiZ0Wu',
  includeDirect: 'fldfFcn3BB2RyiWer',
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
const CLIENT_FIELDS = { name: 'fld48x6Yg3v6RP30W', brand: 'fldTHTrYh0GCFeBLG', coldOffer: 'fldWAdvAzoPxqW0Ut', frontEnd: 'flde94SLnY3TDibbj' };

export const ACTIONS: Record<string, string> = {
  'Run Company Sample': 'leadlist.sample',
  'Expand Companies': 'leadlist.expand',
  'Refit Companies': 'leadlist.refit',
  'Find Contacts': 'leadlist.contacts',
  'Verify and Finalize': 'leadlist.verify',
};

const READ_FIELDS = [F.engineAction, F.engineActionSetAt, F.name, F.client, F.filtersJson, F.icp, F.thesis, F.sampleSize, F.sampleApproved,
  F.expansionTarget, F.personaDna, F.contactFiltersJson, F.contactSampleSize, F.contactApproved, F.includeGeneric, F.includeDirect, F.footprint200];
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
  const filters = () => {
    const x = json(r[F.filtersJson], 'DiscoLike Company Filters JSON');
    if (!x) throw new InputError('this list has no company filters yet: generate and review the filters first');
    return x;
  };
  switch (kind) {
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
        writeFinalTabs: true,
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
      return { [F.verifyGood]: c.good ?? null, [F.verifyRisky]: c.risky ?? null, [F.verifyBad]: c.bad ?? null, [F.finalDirect]: res.finalDirectCount ?? null, [F.finalGeneric]: res.finalGenericCount ?? null, [F.leads]: (res.finalDirectCount ?? 0) + (res.finalGenericCount ?? 0), [F.mvJobId]: res.millionVerifierJobId ?? null, [F.verifiedAt]: new Date().toISOString(), [F.verifyState]: 'completed' };
    }
  }
  return {};
}

/** Step 4: write progress and results of every job the bridge queued, once per change. */
export async function syncResults(db: Db, at: AirtableClient): Promise<number> {
  const r = await db.query(
    `SELECT a.job_id, a.record_id, a.action, a.written, j.kind, j.status, j.progress, j.error, j.result, j.dry_run, j.attempts
     FROM airtable_jobs a JOIN jobs j ON j.id = a.job_id WHERE NOT a.finished ORDER BY a.job_id`);
  let wrote = 0;
  for (const j of r.rows) {
    const waiting = j.status === 'queued' && j.progress;
    const state = j.status === 'succeeded' ? 'Done' : j.status === 'failed' ? 'Failed' : j.status === 'needs_review' ? 'Needs Review'
      : j.status === 'running' ? 'Running' : waiting ? 'Waiting' : 'Queued';
    const key = `${state}|${waiting ? j.progress : ''}`;
    if (key === j.written) continue;
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

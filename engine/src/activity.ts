// Activity log (Alex 2026-11-25): one Airtable row per step the engine or an agent takes, linked to the
// campaign, lead list, email account and client it touched, so each record shows its full history
// ("Tue 5:00 PM Atlas saw bounce 5.2% · 5:30 cause found · 6:30 accounts rested, campaign resumed").
// Writing the log never stops the work: a failed write is only logged.
import type { Config } from './config.js';
import type { Job } from './queue.js';
import { createAirtableClient, type AirtableClient } from './providers/airtable.js';
import { campaignRecordsFor } from './airtable/campaignLookup.js';

export const ACTIVITY = 'tbl4DK6tEuy2ZEmbP';
export const AF = {
  event: 'fldglUB3EzzQVC3ZO', when: 'fldZ6krYaZOeCmaxK', agent: 'fldAOwjBYPCrHZmCS', type: 'fldvkg6fn4bH2bkD2', details: 'fldaF3yo6pfSlARXl',
  campaign: 'fld8Y7XpBp1TkBBHR', leadList: 'fldGDAB3nxnq0aFZi', emailAccount: 'fld4yGB92KMRFs3wa', client: 'fldochT4jrMAOPgyc', jobId: 'fldKsBCwrXLw7PBmp', bisonCampaignId: 'fldLzQgUEDsg8bKWb',
} as const;

export type ActivityType = 'Detected' | 'Diagnosed' | 'Fixed' | 'Waiting for approval' | 'Approved' | 'Step done' | 'Step failed' | 'Info';
export interface Activity {
  event: string; type: ActivityType; agent?: 'Atlas' | 'Sean' | 'Scribe' | 'Engine' | 'Riley' | 'Alex' | 'Josh'; details?: string;
  campaignRecordIds?: string[]; bisonCampaignId?: number; leadListRecordIds?: string[]; emailAccountRecordIds?: string[]; clientRecordIds?: string[]; jobId?: string | number;
}

const isRec = (x: unknown): x is string => typeof x === 'string' && /^rec[A-Za-z0-9]{14}$/.test(x);

export async function logActivity(cfg: Pick<Config, 'airtableApiKey' | 'airtableBaseId' | 'airtableBaseUrl'>, a: Activity, at?: Pick<AirtableClient, 'create' | 'list'>): Promise<void> {
  if (!cfg.airtableApiKey && !at) return;
  try {
    const client = at ?? createAirtableClient({ apiKey: cfg.airtableApiKey, baseId: cfg.airtableBaseId, baseUrl: cfg.airtableBaseUrl });
    let campaigns = (a.campaignRecordIds ?? []).filter(isRec);
    if (!campaigns.length && a.bisonCampaignId) campaigns = await campaignRecordsFor(client, a.bisonCampaignId).catch(() => []);
    await client.create(ACTIVITY, {
      [AF.event]: a.event.slice(0, 250), [AF.when]: new Date().toISOString(), [AF.agent]: a.agent ?? 'Engine', [AF.type]: a.type,
      ...(a.details ? { [AF.details]: a.details.slice(0, 20_000) } : {}),
      ...(campaigns.length ? { [AF.campaign]: campaigns } : {}),
      ...((a.leadListRecordIds ?? []).filter(isRec).length ? { [AF.leadList]: a.leadListRecordIds!.filter(isRec) } : {}),
      ...((a.emailAccountRecordIds ?? []).filter(isRec).length ? { [AF.emailAccount]: a.emailAccountRecordIds!.filter(isRec) } : {}),
      ...((a.clientRecordIds ?? []).filter(isRec).length ? { [AF.client]: a.clientRecordIds!.filter(isRec) } : {}),
      ...(a.jobId !== undefined ? { [AF.jobId]: String(a.jobId) } : {}),
      ...(a.bisonCampaignId ? { [AF.bisonCampaignId]: a.bisonCampaignId } : {}),
    });
  } catch (e) {
    console.error(JSON.stringify({ level: 'warn', message: 'activity log not written', err: String((e as Error).message ?? e).slice(0, 200) }));
  }
}

/** Which record a job belongs to, for the log: lead list stages and top-ups → Lead List; campaign stages → Campaign. */
export function recordLinkFor(kind: string, recordId: string): Pick<Activity, 'campaignRecordIds' | 'leadListRecordIds'> | null {
  if (!isRec(recordId)) return null;
  if (kind.startsWith('leadlist.') || kind === 'campaign.topup') return { leadListRecordIds: [recordId] };
  if (kind.startsWith('campaign.')) return { campaignRecordIds: [recordId] };
  return null;
}

const STEP_NAMES: Record<string, string> = {
  'leadlist.sample': 'Company sample', 'leadlist.expand': 'Expand companies', 'leadlist.refit': 'Refit companies', 'leadlist.contacts': 'Find contacts',
  'leadlist.verify': 'Verify and finalize', 'leadlist.enrichprompt': 'Enrichment prompt', 'leadlist.enrich': 'Enrichment', 'leadlist.deepreview': 'DiscoGen deep review',
  'leadlist.deepcontacts': 'Deep contacts', 'leadlist.qa': 'Automated QA', 'leadlist.filters': 'Generate filters', 'leadlist.restart': 'Restart companies',
  'leadlist.skipenrich': 'Skip enrichment', 'campaign.build': 'Build campaign', 'campaign.topup': 'Top up', 'campaign.launch': 'Launch', 'campaign.pause': 'Pause',
  'campaign.senders': 'Update senders',
};

/** The worker's line for a finished lead list / campaign job (dry runs are not logged). */
export async function logJobOutcome(cfg: Config, job: Job, ok: boolean, message: string): Promise<void> {
  const link = recordLinkFor(job.kind, String(job.record_id ?? ''));
  if (!link || job.dry_run) return;
  const step = STEP_NAMES[job.kind] ?? job.kind;
  await logActivity(cfg, { event: `${step}: ${ok ? 'done' : 'failed'}`, type: ok ? 'Step done' : 'Step failed', agent: 'Engine', details: message, jobId: job.id, ...link });
}

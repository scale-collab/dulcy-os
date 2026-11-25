// Small Campaigns-table lookups with no stage imports (safe to use from any stage).
import type { AirtableClient } from '../providers/airtable.js';
import { CAMPAIGN_FIELDS } from '../campaign/campaignFields.js';

export const CAMPAIGNS_TABLE = 'tblAVAA6uBPaMj28P';
/** Campaigns field "Skip Bounce Pause". */
export const SKIP_BOUNCE_PAUSE = 'fldjpNVGqOLFJbcEX';
const IDS = [CAMPAIGN_FIELDS.ID, CAMPAIGN_FIELDS['EmailBison Direct Campaign ID'], CAMPAIGN_FIELDS['EmailBison Generic Campaign ID']];
const bisonId = (v: unknown) => { const m = /(\d+)\s*$/.exec(String(Array.isArray(v) ? v[0] ?? '' : v ?? '').trim()); const x = m ? Number(m[1]) : 0; return Number.isSafeInteger(x) && x > 0 ? x : 0; };

/** Campaigns records whose EmailBison ID (main, Direct or Generic) is this campaign. */
export async function campaignRecordsFor(at: Pick<AirtableClient, 'list'>, bisonCampaignId: number): Promise<string[]> {
  const recs = await at.list(CAMPAIGNS_TABLE, `OR({ID}&''!='',{EmailBison Direct Campaign ID}&''!='',{EmailBison Generic Campaign ID}&''!='')`, IDS, 3000);
  return recs.filter((r) => IDS.map((f) => bisonId(r.fields[f])).includes(bisonCampaignId)).map((r) => r.id);
}

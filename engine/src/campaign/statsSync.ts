// Campaign numbers EmailBison → Airtable Campaigns (Alex 2026-11-24: the two Airtable
// automations skip Fri/Sat and one reads active campaigns only, so Bounced looked too low).
// Runs with every bounce check: every campaign of every workspace, paused ones too. Same
// mapping as the Airtable "Daily Total Campaign Data" script; only changed records are written.
import type { AirtableClient } from '../providers/airtable.js';
import { CAMPAIGNS } from '../airtable/campaignBuild.js';

export const SF = {
  id: 'fldxSETE3D66RyWRH', sent: 'fldDmaS8NZF3j0ZBY', replies: 'fldqSxElCOm0QN4kh', progress: 'fldGM1f8fNNu6ODo2',
  bounced: 'fld3MHVEqXgHimKom', interested: 'fldSRXRCC0x2AhX9h', contacted: 'fld8nKHhBCV8UFm0G',
} as const;

const n = (v: unknown) => (Number.isFinite(Number(v)) ? Number(v) : 0);

/** Airtable values for one EmailBison campaign row. */
export function statsFields(c: any): Record<string, number> {
  return {
    [SF.sent]: n(c.emails_sent), [SF.replies]: n(c.unique_replies), [SF.progress]: Math.round(n(c.completion_percentage) * 100) / 10_000,
    [SF.bounced]: n(c.bounced), [SF.interested]: n(c.interested), [SF.contacted]: n(c.total_leads_contacted),
  };
}

export async function syncCampaignStats(at: Pick<AirtableClient, 'list' | 'update'>, campaigns: any[]): Promise<{ updated: number; matched: number }> {
  const byId = new Map(campaigns.filter((c) => n(c.id) > 0).map((c) => [n(c.id), c]));
  if (!byId.size) return { updated: 0, matched: 0 };
  const recs = await at.list(CAMPAIGNS, `{ID}`, Object.values(SF), 5000);
  let updated = 0, matched = 0;
  for (const r of recs) {
    const c = byId.get(n(r.fields[SF.id]));
    if (!c) continue;
    matched++;
    const want = statsFields(c);
    const changed = Object.entries(want).some(([k, v]) => Math.abs(n(r.fields[k]) - v) > 1e-9);
    if (!changed) continue;
    await at.update(CAMPAIGNS, r.id, want);
    updated++;
  }
  return { updated, matched };
}

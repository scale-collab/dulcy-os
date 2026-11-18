// Bounce safety, Alex's rules (rules/RULES.md, 2026-11-17/18):
//  - bounce over 4% AND progress 35%+ → pause (the floor stops 1 bounce in 10 emails from pausing);
//  - bounce over 2.5% → watch;
//  - re-checked on every refresh, never "fire once" (the Airtable automation could miss a
//    campaign that first crossed 2.5% and later 4%).
// Bounce % = bounced / leads contacted × 100, the same as the Airtable "Bounced %" field.
export interface CampaignStats { id: number; name: string; status: string; bounced: number; contacted: number; progress: number }
export type BounceAction = 'pause' | 'watch' | 'ok';

export function bounceRate(s: Pick<CampaignStats, 'bounced' | 'contacted'>): number {
  return s.contacted > 0 ? Math.round((s.bounced / s.contacted) * 10_000) / 100 : 0;
}

export function bounceAction(s: CampaignStats): BounceAction {
  const rate = bounceRate(s);
  if (rate > 4 && s.progress >= 35) return 'pause';
  if (rate > 2.5) return 'watch';
  return 'ok';
}

/** EmailBison campaign list row → stats (fields as the daily Airtable sync reads them). */
export function statsFrom(c: any): CampaignStats {
  const n = (v: unknown) => (Number.isFinite(Number(v)) ? Number(v) : 0);
  return { id: n(c.id), name: String(c.name ?? ''), status: String(c.status ?? '').toLowerCase(), bounced: n(c.bounced), contacted: n(c.total_leads_contacted), progress: n(c.completion_percentage) };
}

// Top-up readiness, from Alex's rules (rules/RULES.md, engine/PLAN.md decision 5):
//  - the interested rate (share of replies that are interested) of 15%+ is the main driver;
//  - bounce under 4% and reply rate 2%+ are targets: missing them is flagged to watch,
//    not an automatic fail.
// The old screen also offered top-ups only from 60% progress; that is reported, not enforced.
export interface CampaignKpis {
  /** Interested replies as % of replies, e.g. 18 for 18%. */
  interestedRate: number;
  /** Replies as % of leads contacted. */
  replyRate?: number;
  bounceRate?: number;
  /** Campaign progress %, e.g. 64. */
  progress?: number;
}

export interface Readiness { ok: boolean; reasons: string[]; watch: string[] }

export function topUpReadiness(k: CampaignKpis): Readiness {
  const reasons: string[] = [];
  const watch: string[] = [];
  const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : undefined);
  const interested = num(k.interestedRate);
  if (interested === undefined) reasons.push('interested rate is unknown');
  else if (interested < 15) reasons.push(`interested rate ${interested}% of replies is under 15%`);
  const bounce = num(k.bounceRate);
  if (bounce !== undefined && bounce >= 4) watch.push(`bounce ${bounce}% is 4% or more`);
  const reply = num(k.replyRate);
  if (reply !== undefined && reply < 2) watch.push(`reply rate ${reply}% is under 2%`);
  const progress = num(k.progress);
  if (progress !== undefined && progress < 60) watch.push(`progress ${progress}% is under 60%`);
  return { ok: reasons.length === 0, reasons, watch };
}

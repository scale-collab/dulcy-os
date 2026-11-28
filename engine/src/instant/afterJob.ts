// Engine-internal events: when a job ends, the jobs waiting on it start now instead of on the next timer.
//   • a job fails (or needs review)          → Riley logs it (riley.collect)
//   • a reply or booking was sent            → Echo's follow-ups are re-checked (sean.followup)
//   • a list / campaign / plan step finishes → the campaign pipeline moves the plan on (campaign.pipeline),
//                                              and Atlas / Scribe start the plan or copy it made ready
//   • a bounce check wrote new numbers       → Atlas's to-do list (atlas.tasks) and the pipeline's 60% trigger
//   • any job ended                          → its queued rerun (an event that came in while it ran)
// Once the Airtable / Slack webhooks are set up, the bridge and the Decisions loop are kicked too, so a
// job's result shows in Airtable and its new decision card goes to Slack right away.
import type { Db } from '../db/pool.js';
import type { Config } from '../config.js';
import type { Job } from '../queue.js';
import { enqueue } from '../queue.js';
import { STAGES } from '../stages/index.js';
import { consumeRerun, trigger } from './trigger.js';
import { kick } from './kick.js';
import { atlasTasksOn, campaignsAreOn, isInstant, seanIsOn } from './jobs.js';

export type JobOutcome = 'succeeded' | 'failed' | 'needs_review' | 'retrying' | 'waiting';

/** Jobs the Airtable bridge writes back (progress and result on the Lead List / Campaign record). */
export const BRIDGE_KINDS = /^(leadlist\.|campaign\.(build|topup|launch|pause|senders)$)/;
/** Steps the campaign pipeline waits on. */
export const PIPELINE_FEEDERS = /^(leadlist\.|campaign\.(build|topup|launch|plan_approved|contacts_approved|copy_approved)$|atlas\.plan$|scribe\.copy$|bounce\.check$)/;
const SENT = new Set(['reply.send', 'decision.send_reply', 'calendar.book']);

/** Atlas plans and Scribe copy that are ready to write (one of each at a time, one Claude call each). */
export async function planWork(db: Db, cfg: Config): Promise<number> {
  if (!campaignsAreOn(cfg)) return 0;
  const live = (k: string) => !(cfg.dryRun && !cfg.liveStages.includes(k));
  let n = 0;
  for (const { id, plan_round: round } of (await db.query(`SELECT id, plan_round FROM campaign_plans WHERE state='planning' ORDER BY id LIMIT 1`)).rows as { id: number; plan_round: number }[]) {
    const d = STAGES['atlas.plan'];
    const r = await enqueue(db, { kind: 'atlas.plan', recordId: `atlas-plan-${id}`, input: { planId: Number(id) }, requestId: `atlas-plan:${id}:${round}`, dryRun: !live('atlas.plan'), maxAttempts: d.maxAttempts, deadlineMs: d.deadlineMs });
    if (r.status === 'queued') n++;
  }
  for (const p of (await db.query(`SELECT id, copy_round FROM campaign_plans WHERE copy_state='queued' ORDER BY id LIMIT 1`)).rows) {
    const d = STAGES['scribe.copy'];
    const r = await enqueue(db, { kind: 'scribe.copy', recordId: `scribe-copy-${p.id}`, input: { planId: Number(p.id) }, requestId: `scribe-copy:${p.id}:${p.copy_round}`, dryRun: !live('scribe.copy'), maxAttempts: d.maxAttempts, deadlineMs: d.deadlineMs });
    if (r.status === 'queued') n++;
  }
  return n;
}

/** Start what this job's end made ready. Never throws (a follow-up problem must not fail the job). Returns what it started. */
export async function afterJob(db: Db, cfg: Config, job: Pick<Job, 'id' | 'kind' | 'record_id'>, outcome: JobOutcome): Promise<string[]> {
  const out: string[] = [];
  const go = async (kind: string, recordId: string, reason: string, input: Record<string, unknown> = {}) => {
    const r = await trigger(db, cfg, { kind, recordId, input, reason });
    out.push(`${kind}:${r}`);
  };
  let bridgeKicked = false;
  try {
    const ended = outcome === 'succeeded' || outcome === 'failed' || outcome === 'needs_review';
    if (ended) { const r = await consumeRerun(db, cfg, job); if (r) out.push(`${job.kind}:rerun-${r}`); }
    if ((outcome === 'failed' || outcome === 'needs_review') && !job.kind.startsWith('riley.') && cfg.rileyOn) await go('riley.collect', 'riley-collect', `job ${job.id} (${job.kind}) ${outcome}`);
    if (outcome === 'succeeded' && SENT.has(job.kind) && seanIsOn(cfg) && cfg.seanFollowupsOn) await go('sean.followup', 'sean-followup', `${job.kind} ${job.id} sent`);
    if (outcome === 'succeeded' && job.kind === 'bounce.check' && atlasTasksOn(cfg)) await go('atlas.tasks', 'atlas-tasks', `bounce check ${job.id} wrote campaign numbers`);
    if (outcome === 'succeeded' && campaignsAreOn(cfg)) {
      if (job.kind === 'campaign.pipeline' || job.kind === 'campaign.plan_approved' || job.kind === 'atlas.plan') { const n = await planWork(db, cfg); if (n) out.push(`plan-work:${n}`); }
      if (PIPELINE_FEEDERS.test(job.kind)) {
        // A list / campaign step: let the bridge write its result to Airtable first (the pipeline reads it there).
        if (BRIDGE_KINDS.test(job.kind) && isInstant(cfg, 'airtable.bridge')) {
          void kick('airtable.bridge').then(() => trigger(db, cfg, { kind: 'campaign.pipeline', recordId: 'campaign-pipeline', reason: `${job.kind} ${job.id} done` })).catch(() => undefined);
          out.push('campaign.pipeline:after-bridge'); bridgeKicked = true;
        } else await go('campaign.pipeline', 'campaign-pipeline', `${job.kind} ${job.id} done`);
      }
    }
    // Write-backs: the bridge (job progress/result on the record) and the Decisions loop (result line, new cards).
    if (!bridgeKicked && BRIDGE_KINDS.test(job.kind) && isInstant(cfg, 'airtable.bridge')) { void kick('airtable.bridge'); out.push('kick:airtable.bridge'); }
    if (ended && isInstant(cfg, 'decisions.loop')) { void kick('decisions.loop'); out.push('kick:decisions.loop'); }
  } catch (e) {
    console.error(JSON.stringify({ level: 'error', message: 'after-job triggers failed', job: job.id, kind: job.kind, err: String(e) }));
  }
  return out;
}

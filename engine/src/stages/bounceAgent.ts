// The bounce agent (Atlas). When the bounce check pauses a campaign (or flags one over 4% that
// has Skip Bounce Pause ticked), bounce.investigate reads that campaign's bounce notices and
// inboxes, names the most likely cause and one fix, and posts it to Slack as a decision.
// On ✅, bounce.fix applies the simple fixes: remove the burned inboxes and resume, or just resume.
// List and gateway fixes are proposed only (they change leads, so Atlas prepares them for Alex).
import type { Stage } from './index.js';
import { PermanentError, NeedsReviewError } from '../errors.js';
import { createBisonClient } from '../providers/emailbison.js';
import { createAirtableClient } from '../providers/airtable.js';
import { DECISIONS, DF } from '../decisions/fields.js';
import { diagnose, readBounce, providerOfMx } from '../campaign/bounceDiagnosis.js';
import { logActivity } from '../activity.js';
import { restAccount, ACCOUNTS, EA } from './accountHealth.js';
import { bounceRate, statsFrom } from '../campaign/bounce.js';
import { resolveMx } from 'node:dns/promises';
import type { Db } from '../db/pool.js';
import { dueIn, trackClose, trackTask } from '../hq/agentTasks.js';

/** MX lookups (step 3: where the bounces land). Swappable in tests. */
let mxLookup: (domain: string) => Promise<string> = async (domain) => {
  const r = await Promise.race([resolveMx(domain), new Promise<never>((_, no) => setTimeout(() => no(new Error('timeout')), 5_000))]);
  return [...r].sort((a, b) => a.priority - b.priority)[0]?.exchange ?? '';
};
export function setMxLookup(f: typeof mxLookup) { mxLookup = f; }

// HQ: each bounce investigation is one of Riley's tasks (Alex 2026-11-25: bounce protection is the
// agents' work, not Alex's to-do). Opened when the check queues it, moved while it runs, closed when
// fixed; waiting on Alex when the fix needs his ✅. Live runs only.
export const bounceTaskKey = (teamId: number, campaignId: number) => `bounce:${teamId}:${campaignId}`;
const bounceTitle = (i: { name?: string; bounce?: number; campaignId?: number }) => `Bounce check: ${String(i.name ?? `campaign ${i.campaignId}`).replace(/^\[[^\]]+\]\s*/, '').slice(0, 80)}${i.bounce ? ` (${i.bounce}%)` : ''}`;
export async function bounceTaskQueued(db: Db, i: { teamId?: number; campaignId: number; name?: string; workspaceName?: string; bounce?: number }, recordId: string): Promise<void> {
  await trackTask(db, {
    agent: 'Atlas', key: bounceTaskKey(Number(i.teamId), i.campaignId), title: bounceTitle(i), client: i.workspaceName ?? '', status: 'in_progress',
    note: 'Queued: read the bounce codes, inboxes and mail servers', due: dueIn(1), priority: 'high', link: null, decision: null,
    job: { kind: 'bounce.investigate', recordId, input: i as Record<string, unknown> }, waitingUntil: null,
  });
}

async function providersFor(domains: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  const queue = [...new Set(domains.filter(Boolean))];
  await Promise.all(Array.from({ length: 8 }, async () => {
    for (let d = queue.shift(); d; d = queue.shift()) {
      try { out.set(d, providerOfMx(await mxLookup(d))); } catch { out.set(d, 'Unknown'); }
    }
  }));
  return out;
}
import { CAMPAIGNS_TABLE as CAMPAIGNS, SKIP_BOUNCE_PAUSE, campaignRecordsFor } from '../airtable/campaignLookup.js';

function bison(ctx: Parameters<Stage>[0], teamId: number) {
  const apiKey = ctx.cfg.emailBisonKeys[ctx.cfg.bounceCheckKey];
  if (!apiKey) throw new PermanentError(`no EmailBison key on the server named EMAILBISON_KEY_${ctx.cfg.bounceCheckKey.toUpperCase()} (BOUNCE_CHECK_KEY)`);
  if (!(teamId > 0)) throw new PermanentError('input.teamId (EmailBison workspace ID) is required');
  return createBisonClient({ apiKey, baseUrl: ctx.cfg.emailBisonBaseUrl, teamId });
}

export const bounceInvestigateStage: Stage = async (ctx) => {
  const i = ctx.job.input as any;
  const teamId = Number(i.teamId), id = Number(i.campaignId);
  if (!(id > 0)) throw new PermanentError('input.campaignId is required');
  const b = bison(ctx, teamId);
  const track = !ctx.dryRun && i.post !== false; // a check by hand (no decision posted) is not a task
  const taskKey = bounceTaskKey(teamId, id);
  if (track) await trackTask(ctx.db, { agent: 'Atlas', key: taskKey, title: bounceTitle({ ...i, campaignId: id }), client: String(i.workspaceName ?? ''), status: 'in_progress', note: 'Reading the bounce codes, inboxes and mail servers', job: { kind: 'bounce.investigate', recordId: `bounce-investigate:${id}`, input: i }, priority: 'high' });
  const inboxes = await ctx.step('inboxes', () => b.campaignSenderStats(id));
  const ours = new Set(inboxes.map((x) => x.email));
  const notices = await ctx.step('notices', async () => {
    const read = (await b.bouncedReplies(id, 5)).map((r) => readBounce(r, ours));
    const prov = await providersFor(read.map((x) => x.recipient.split('@')[1]?.toLowerCase() ?? ''));
    return read.map((x) => ({ ...x, provider: prov.get(x.recipient.split('@')[1]?.toLowerCase() ?? '') ?? 'Unknown' }));
  });
  // Step 3 baseline: which mail servers the campaign's leads use (a sample of up to 10 pages of leads).
  const leadProviders = await ctx.step('lead-providers', async () => {
    try {
      const emails = await b.campaignLeadEmailsSample(id, 10);
      const prov = await providersFor(emails.map((e) => e.split('@')[1] ?? ''));
      const m: Record<string, number> = {};
      for (const e of emails) { const p = prov.get(e.split('@')[1] ?? '') ?? 'Unknown'; m[p] = (m[p] ?? 0) + 1; }
      return m;
    } catch { return {}; }
  });
  // Numbers from the bounce check, or read here when run by hand.
  let st = { bounce: Number(i.bounce) || 0, contacted: Number(i.contacted) || 0, bounced: Number(i.bounced) || 0, progress: Number(i.progress) || 0, status: '' };
  if (!st.contacted) {
    const c = (await b.listCampaigns()).map(statsFrom).find((x) => x.id === id);
    if (c) st = { bounce: bounceRate(c), contacted: c.contacted, bounced: c.bounced, progress: c.progress, status: c.status };
  }
  if (!i.name) i.name = `campaign ${id}`;
  const paused = i.paused === undefined ? st.status !== 'active' : i.paused !== false;
  const d = diagnose({ ...st, paused }, inboxes, notices, new Map(Object.entries(leadProviders)));
  const state = paused ? 'Paused' : 'Still sending (Skip Bounce Pause ticked)';

  let decisionId = '', autoDone = '';
  if (!ctx.dryRun && ctx.cfg.airtableApiKey && i.post !== false) {
    const at = createAirtableClient({ apiKey: ctx.cfg.airtableApiKey, baseId: ctx.cfg.airtableBaseId, baseUrl: ctx.cfg.airtableBaseUrl });
    await logActivity(ctx.cfg, { event: `Bounce ${st.bounce}% diagnosed: ${d.headline}`, type: 'Diagnosed', agent: 'Atlas', details: `${d.facts.join('\n')}\n\nFix: ${d.fix}`, bisonCampaignId: id, jobId: ctx.job.id }, at);
    // Automatic fixes (Alex 2026-11-25): rest the accounts causing it, resume; tell Alex. List / copy / gateway fixes stay proposals.
    autoDone = await ctx.step('auto-fix', async () => {
      if (d.cause === 'account' && d.removeSenderIds.length) {
        const rested: string[] = [];
        for (const sid of d.removeSenderIds) {
          const inbox = inboxes.find((x) => x.id === sid);
          const rec = (await at.list(ACCOUNTS, `{Email ID}=${Number(sid)}`, [EA.workspaceId, EA.client, EA.campaigns], 3)).find((r) => Number(r.fields[EA.workspaceId] ?? teamId) === teamId);
          if (rec) await restAccount(ctx, at, { accountRecordId: rec.id, senderId: Number(sid), teamId, email: inbox?.email ?? sid, reason: `Bounce: causing the blocks on ${i.name} (${st.bounce}%)` });
          else await ctx.paid({ callKey: `rest:${sid}:bounce`, provider: 'emailbison', units: 0, scope: 'record', run: async () => { try { await b.setDailyLimit([Number(sid)], 0); } catch { await b.setDailyLimit([Number(sid)], 1); } return 0; }, dryRunResult: () => 0 });
          rested.push(inbox?.email ?? sid);
        }
        const resumed = paused ? ` Campaign ${await resumeAndMark(ctx, b, id)}` : '';
        return `Rested ${rested.join(', ')} for a week (daily limit 0, retested at the next weekly placement test).${resumed}`;
      }
      if (d.cause === 'early' && paused) return `Campaign ${await resumeAndMark(ctx, b, id)}`;
      return '';
    });
    if (autoDone) await logActivity(ctx.cfg, { event: `Fixed automatically: ${d.headline}`, type: 'Fixed', agent: 'Atlas', details: autoDone, bisonCampaignId: id, jobId: ctx.job.id }, at);
    decisionId = await ctx.step('decision', () => at.create(DECISIONS, {
      [DF.title]: `${autoDone ? 'Fixed: ' : ''}Bounce ${st.bounce}% on ${i.name}: ${d.headline}`,
      [DF.agent]: 'Atlas', [DF.status]: 'New', [DF.client]: String(i.workspaceName ?? ''),
      [DF.issue]: `${state}. Bounce ${st.bounce}% at ${st.progress}% progress (over 4% = pause and investigate).`,
      [DF.checked]: d.facts.join('\n'),
      [DF.fix]: autoDone ? `Done automatically: ${autoDone}` : d.fix,
      [DF.details]: `EmailBison campaign ${id}, workspace ${i.workspaceName ?? ''} (${teamId}).\nCause: ${d.cause}.`,
      [DF.action]: autoDone ? 'None' : d.action,
      [DF.actionInput]: JSON.stringify({ teamId, campaignId: id, removeSenderIds: d.removeSenderIds, name: i.name }),
    }));
  }
  if (track) {
    if (autoDone) await trackClose(ctx.db, taskKey, `Fixed: ${autoDone}`);
    else await trackTask(ctx.db, { agent: 'Atlas', key: taskKey, title: bounceTitle({ ...i, campaignId: id }), status: 'waiting_alex', note: `${d.headline}. Fix waiting for your OK`, link: 'decisions/Campaigns', decision: decisionId || null, job: null });
  }
  return { message: `${i.name}: ${d.headline}. ${autoDone ? `Done automatically: ${autoDone}` : d.fix}${ctx.dryRun || i.post === false ? ' (check only: no decision posted)' : ''}`, cause: d.cause, action: d.action, stopSendingTo: d.stopSendingTo, facts: d.facts, decisionId };
};

/** Resume a campaign, confirm it is sending, and tick Skip Bounce Pause (the cumulative bounce % would re-pause it). */
async function resumeAndMark(ctx: Parameters<Stage>[0], b: ReturnType<typeof bison>, id: number): Promise<string> {
  await ctx.paid({ callKey: `bounce-fix-resume:${id}`, provider: 'emailbison', units: 0, run: async () => { await b.resumeCampaign(id); return { resumed: id }; }, dryRunResult: () => ({ resumed: 0 }) });
  const status = await b.campaignStatus(id);
  if (!['active', 'queued', 'launching'].includes(status)) throw new NeedsReviewError(`campaign ${id} did not resume (status ${status}); check it in EmailBison`);
  let ticked = 0;
  if (ctx.cfg.airtableApiKey) {
    const at = createAirtableClient({ apiKey: ctx.cfg.airtableApiKey, baseId: ctx.cfg.airtableBaseId, baseUrl: ctx.cfg.airtableBaseUrl });
    for (const rec of await campaignRecordsFor(at, id).catch(() => [] as string[])) { await at.update(CAMPAIGNS, rec, { [SKIP_BOUNCE_PAUSE]: true }); ticked++; }
  }
  return `resumed (status ${status}).${ticked ? ' Skip Bounce Pause ticked so the next check does not pause it again; the watch alert still shows.' : ' Tick Skip Bounce Pause on it, or the next bounce check pauses it again.'}`;
}

/** On ✅: remove the named inboxes (campaign must be paused for that) and resume; confirm it is sending. */
export const bounceFixStage: Stage = async (ctx) => {
  const i = ctx.job.input as any;
  const teamId = Number(i.teamId), id = Number(i.campaignId);
  if (!(id > 0)) throw new PermanentError('input.campaignId is required');
  const b = bison(ctx, teamId);
  const remove = (Array.isArray(i.removeSenderIds) ? i.removeSenderIds : []).map(String).filter(Boolean);
  if (ctx.dryRun) return { message: `Dry run: would ${remove.length ? `remove ${remove.length} inbox(es) from ` : ''}and resume campaign ${id}`, dryRun: true };

  if (remove.length) {
    const left = (await b.campaignSenderStats(id)).filter((x) => !remove.includes(x.id));
    if (!left.length) throw new NeedsReviewError('removing those inboxes would leave the campaign with none; nothing changed');
    if ((await b.campaignStatus(id)) !== 'paused') {
      await ctx.paid({ callKey: `bounce-fix-pause:${id}`, provider: 'emailbison', units: 0, run: async () => { await b.pauseCampaign(id); return { paused: id }; }, dryRunResult: () => ({ paused: 0 }) });
    }
    await ctx.paid({ callKey: `bounce-fix-remove:${id}`, provider: 'emailbison', units: 0, run: async () => { await b.removeSenders(id, remove); return { removed: remove.length }; }, dryRunResult: () => ({ removed: 0 }) });
  }
  const done = await resumeAndMark(ctx, b, id);
  await logActivity(ctx.cfg, { event: `Campaign ${remove.length ? 'inboxes removed and ' : ''}resumed`, type: 'Fixed', agent: 'Atlas', details: done, bisonCampaignId: id, jobId: ctx.job.id });
  await trackClose(ctx.db, bounceTaskKey(teamId, id), `Fixed: ${remove.length ? `${remove.length} inbox(es) removed, ` : ''}${done}`);
  return { message: `${i.name ?? `Campaign ${id}`}: ${remove.length ? `${remove.length} inbox(es) removed, ` : ''}${done}` };
};

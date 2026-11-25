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
import { bounceRate, statsFrom } from '../campaign/bounce.js';
import { resolveMx } from 'node:dns/promises';

/** MX lookups (step 3: where the bounces land). Swappable in tests. */
let mxLookup: (domain: string) => Promise<string> = async (domain) => {
  const r = await Promise.race([resolveMx(domain), new Promise<never>((_, no) => setTimeout(() => no(new Error('timeout')), 5_000))]);
  return [...r].sort((a, b) => a.priority - b.priority)[0]?.exchange ?? '';
};
export function setMxLookup(f: typeof mxLookup) { mxLookup = f; }

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

  let decisionId = '';
  if (!ctx.dryRun && ctx.cfg.airtableApiKey && i.post !== false) {
    const at = createAirtableClient({ apiKey: ctx.cfg.airtableApiKey, baseId: ctx.cfg.airtableBaseId, baseUrl: ctx.cfg.airtableBaseUrl });
    decisionId = await ctx.step('decision', () => at.create(DECISIONS, {
      [DF.title]: `Bounce ${st.bounce}% on ${i.name}: ${d.headline}`,
      [DF.agent]: 'Atlas', [DF.status]: 'New', [DF.client]: String(i.workspaceName ?? ''),
      [DF.issue]: `${state}. Bounce ${st.bounce}% at ${st.progress}% progress (over 4% = pause and investigate).`,
      [DF.checked]: d.facts.join('\n'),
      [DF.fix]: d.fix,
      [DF.details]: `EmailBison campaign ${id}, workspace ${i.workspaceName ?? ''} (${teamId}).\nCause: ${d.cause}.`,
      [DF.action]: d.action,
      [DF.actionInput]: JSON.stringify({ teamId, campaignId: id, removeSenderIds: d.removeSenderIds, name: i.name }),
    }));
  }
  return { message: `${i.name}: ${d.headline}. ${d.fix}${ctx.dryRun || i.post === false ? ' (check only: no decision posted)' : ''}`, cause: d.cause, action: d.action, stopSendingTo: d.stopSendingTo, facts: d.facts, decisionId };
};

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
  await ctx.paid({ callKey: `bounce-fix-resume:${id}`, provider: 'emailbison', units: 0, run: async () => { await b.resumeCampaign(id); return { resumed: id }; }, dryRunResult: () => ({ resumed: 0 }) });
  const status = await b.campaignStatus(id);
  if (!['active', 'queued', 'launching'].includes(status)) throw new NeedsReviewError(`campaign ${id} did not resume (status ${status}); check it in EmailBison`);
  // The bounce % stays above 4% for a while (it counts every email sent so far), so without this the next
  // check would pause it again: tick Skip Bounce Pause on its Campaigns record (the watch alert still shows).
  let ticked = 0;
  if (ctx.cfg.airtableApiKey) {
    const at = createAirtableClient({ apiKey: ctx.cfg.airtableApiKey, baseId: ctx.cfg.airtableBaseId, baseUrl: ctx.cfg.airtableBaseUrl });
    for (const rec of await campaignRecordsFor(at, id).catch(() => [] as string[])) { await at.update(CAMPAIGNS, rec, { [SKIP_BOUNCE_PAUSE]: true }); ticked++; }
  }
  return { message: `${i.name ?? `Campaign ${id}`}: ${remove.length ? `${remove.length} inbox(es) removed, ` : ''}resumed (status ${status}).${ticked ? ' Skip Bounce Pause ticked so the next check does not pause it again; the watch alert still shows.' : ' Tick Skip Bounce Pause on it, or the next bounce check pauses it again.'}` };
};

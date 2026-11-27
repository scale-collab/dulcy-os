import type { JobContext } from '../context.js';
import { verifyStage } from './verify.js';
import { campaignBuildStage } from './campaignBuild.js';
import { campaignTopupStage } from './campaignTopup.js';
import { bounceCheckStage } from './bounceCheck.js';
import { campaignLaunchStage, campaignPauseStage, campaignSendersStage } from './campaignControl.js';
import { companySampleStage } from './companySample.js';
import { companyExpandStage } from './companyExpand.js';
import { companyRefitStage } from './companyRefit.js';
import { contactsFindStage } from './contactsFind.js';
import { filterGenerateStage } from './filterGenerate.js';
import { deepReviewStage } from './deepReview.js';
import { deepContactsStage } from './deepContacts.js';
import { automatedQaStage } from './automatedQa.js';
import { enrichPromptStage, enrichRunStage } from './enrichment.js';
import { restartStage, skipEnrichStage } from './listControl.js';
import { sendReplyStage } from './decisionAct.js';
import { seanDraftStage } from '../agents/sean.js';
import { seanFollowupStage } from '../agents/followups.js';
import { bounceInvestigateStage, bounceFixStage } from './bounceAgent.js';
import { accountHealthStage, approvePurchaseStage } from './accountHealth.js';
import { adaBriefStage } from '../agents/ada.js';
import { ledgerReportStage, ledgerCheckStage } from '../agents/ledger.js';
import { ledgerPrepStage } from '../agents/ledgerPrep.js';
import { atlasHealthStage } from '../agents/atlas.js';
// Loaded on use: campaignPlan imports the Lead List bridge, which imports this file (import loop).
const plan = () => import('../agents/campaignPlan.js');
import { coleReviewStage } from '../agents/cole.js';
import { siennaIdeasStage, siennaPrepStage } from '../agents/sienna.js';
import { replySendStage } from '../agents/replies.js';

/** A stage = one Airtable action. It returns a small result for the Airtable record. */
export type Stage = (ctx: JobContext) => Promise<Record<string, unknown>>;

export interface StageDef {
  run: Stage;
  /** Whole-job time limit. */
  deadlineMs: number;
  maxAttempts: number;
  description: string;
}

/**
 * Skeleton test stage: proves checkpoints, paid receipts, caps and dry-run end to end.
 * Real stages (verify, campaign build, top-up, ...) are added one at a time (PLAN step 2+).
 */
const selfTest: Stage = async (ctx) => {
  const a = await ctx.step('load-input', async () => ({ rows: Number(ctx.job.input.rows ?? 10) }));
  const charged = await ctx.step('paid-call', () =>
    ctx.paid({
      callKey: 'only',
      provider: 'selftest',
      units: a.rows,
      run: async () => ({ ok: true, rows: a.rows }),
      dryRunResult: () => ({ ok: true, rows: a.rows, dryRun: true }),
    }),
  );
  const done = await ctx.step('summarize', async () => ({ processed: charged.rows }));
  return { ...done, dryRun: ctx.dryRun };
};

export const STAGES: Record<string, StageDef> = {
  // Batch 3 (HQ inbox limits + the new-client ramp). Loaded on use: the module reads STAGES itself.
  'inbox.limits': { run: async (ctx) => (await import('../hq/inboxLimits.js')).inboxLimitsStage(ctx), deadlineMs: 5 * 60_000, maxAttempts: 3, description: 'HQ: set the cold daily limit and/or warm-up limit of the chosen inboxes in EmailBison (owner-approved in HQ; receipts first, never twice), mirror them on Email Accounts, log it.' },
  'atlas.ramp': { run: async (ctx) => (await import('../hq/inboxLimits.js')).atlasRampStage(ctx), deadlineMs: 5 * 60_000, maxAttempts: 1, description: 'Atlas: daily new-client inbox ramp check (5/10 → 10/20 → 15/30 by weeks of sending). Proposes each step as a task waiting for Alex; never applies.' },
  'calendar.book': { run: async (ctx) => (await import('../agents/booking.js')).calendarBookStage(ctx), deadlineMs: 10 * 60_000, maxAttempts: 3, description: 'Echo: book the time the prospect agreed on the thread\'s own client calendar (live free/busy re-check, never twice), record it like any booked meeting, close the follow-ups, then queue the confirmation reply. Taken or failed = nothing sent.' },
  'reply.send': { run: replySendStage, deadlineMs: 10 * 60_000, maxAttempts: 3, description: 'Send one approved reply from its Airtable row (every workspace, client CC/BCC), then update the row, Reply Learning and Slack. Never sends twice.' },
  'ada.brief': { run: adaBriefStage, deadlineMs: 10 * 60_000, maxAttempts: 2, description: 'Ada: weekday morning brief in Slack (waiting on Alex, overnight replies and meetings, campaign and account health, agent activity, top 3). Fridays add the weekly scorecard. Read only.' },
  'ledger.report': { run: ledgerReportStage, deadlineMs: 10 * 60_000, maxAttempts: 2, description: 'Ledger: Saturday money report from Xero (buckets vs 40/30/15/10/5, spend vs the OPEX cap, late invoices, bills due, books health, next payout). Read only.' },
  'ledger.check': { run: ledgerCheckStage, deadlineMs: 5 * 60_000, maxAttempts: 2, description: 'Ledger: answer purchase or invoice questions in the check channel with yes / yes-but / no and the OPEX room. Read only; never pays.' },
  'ledger.prep': { run: ledgerPrepStage, deadlineMs: 15 * 60_000, maxAttempts: 2, description: 'Ledger: prepare Xero reconciliation from Mercury (bucket transfers, processor payouts, invoice payments, spend coded like before); asks in Slack about the rest. Never deletes or moves money.' },
  'atlas.health': { run: atlasHealthStage, deadlineMs: 10 * 60_000, maxAttempts: 2, description: 'Atlas: Monday client health in Slack (retainer, months, LTV, interested and booked vs KPI, interested → meeting rate, campaign health, 🟢/🟡/🔴 with reasons). Read only.' },
  'atlas.plan': { run: async (ctx) => (await plan()).atlasPlanStage(ctx), deadlineMs: 15 * 60_000, maxAttempts: 2, description: 'Atlas: plan a client\'s next campaign (move from the SOP, thesis, 2 angles), create the Lead List + Campaign records, press Generate Filters. Nothing sent.' },
  'campaign.pipeline': { run: async (ctx) => (await plan()).campaignPipelineStage(ctx), deadlineMs: 5 * 60_000, maxAttempts: 1, description: 'Campaign creation: start plans (campaign past 60%, new client), press Run Company Sample after the filters, post approval 1 after the sample.' },
  'campaign.plan_approved': { run: async (ctx) => (await plan()).planApprovedStage(ctx), deadlineMs: 5 * 60_000, maxAttempts: 2, description: 'Approval 1 ✅: approve the company sample, press Expand Companies, start the copy.' },
  'campaign.contacts_approved': { run: async (ctx) => (await plan()).contactsApprovedStage(ctx), deadlineMs: 5 * 60_000, maxAttempts: 2, description: 'Low contact sample ✅: approve it and find all contacts.' },
  'campaign.copy_approved': { run: async (ctx) => (await plan()).copyApprovedStage(ctx), deadlineMs: 5 * 60_000, maxAttempts: 2, description: 'Approval 2 ✅: send the campaign to the client portal (Client Review, 48 business hours).' },
  'atlas.tasks': { run: async (ctx) => (await import('../hq/generators.js')).atlasTasksStage(ctx), deadlineMs: 5 * 60_000, maxAttempts: 1, description: 'Atlas to-do list (HQ): a running campaign past 60% gets "Plan next campaign for <client>", due in 3 days, unless a plan exists. Writes only the HQ to-do table.' },
  'riley.collect': { run: async (ctx) => (await import('../agents/riley.js')).rileyCollectStage(ctx), deadlineMs: 5 * 60_000, maxAttempts: 1, description: 'Riley: log failed, stuck and needs-review engine jobs (and n8n errors) to System Issues. Changes nothing.' },
  'riley.apply': { run: async (ctx) => (await import('../agents/riley.js')).rileyApplyStage(ctx), deadlineMs: 5 * 60_000, maxAttempts: 2, description: 'Riley fix ✅: re-run the failed engine job (Retry), or mark the fix Approved for the Riley session to make live.' },
  'scribe.copy': { run: async (ctx) => (await import('../agents/scribe.js')).scribeCopyStage(ctx), deadlineMs: 20 * 60_000, maxAttempts: 2, description: 'Scribe: write the campaign copy (draft + Alex-style review), into the Campaign (Review) and sequence fields. Nothing sent.' },
  'cole.review': { run: coleReviewStage, deadlineMs: 30 * 60_000, maxAttempts: 2, description: 'Cole: review new Fathom sales calls (pacing, stages, objections vs Closers.io, 3 fixes with better lines) + a follow-up email draft in Slack. Draft only.' },
  'sienna.ideas': { run: siennaIdeasStage, deadlineMs: 20 * 60_000, maxAttempts: 2, description: 'Sienna: Friday-morning web research for the next video ideas with real demand → Content Center (Status Review). Nothing posted.' },
  'sienna.prep': { run: siennaPrepStage, deadlineMs: 30 * 60_000, maxAttempts: 2, description: 'Sienna: script, titles, hooks, thumbnail idea and Gamma outline as soon as Alex approves an idea (checked every 30 min). Nothing posted.' },
  'account.health': { run: accountHealthStage, deadlineMs: 30 * 60_000, maxAttempts: 3, description: 'Account health loop: placement under 60% → rest 7 days at 0/day; retest → restore, or queue a replacement (1 .com + 2 Google accounts) for approval.' },
  'account.approve_purchase': { run: approvePurchaseStage, deadlineMs: 5 * 60_000, maxAttempts: 3, description: 'On ✅ of a replacement: tick Approve Purchase on the Spam Remediation Queue record.' },
  'bounce.investigate': { run: bounceInvestigateStage, deadlineMs: 2 * 60 * 60_000, maxAttempts: 3, description: 'Bounce agent: read a flagged campaign\'s bounce notices and inboxes, name the cause and one fix, post it as a Slack decision. Changes nothing.' },
  'bounce.fix': { run: bounceFixStage, deadlineMs: 15 * 60_000, maxAttempts: 3, description: 'Bounce agent fix on ✅: remove the named inboxes (if any) and resume the campaign, then tick Skip Bounce Pause.' },
  'sean.followup': { run: seanFollowupStage, deadlineMs: 30 * 60_000, maxAttempts: 3, description: 'Echo: draft due follow-ups (no answer, back from out of office, check back later) and post each as a Slack decision. Sends nothing.' },
  'sean.draft': { run: seanDraftStage, deadlineMs: 30 * 60_000, maxAttempts: 3, description: 'Echo: draft answers to interested replies waiting on Dulcy and post each as a Slack decision. Sends nothing.' },
  'decision.send_reply': { run: sendReplyStage, deadlineMs: 10 * 60_000, maxAttempts: 3, description: 'Send an approved reply in an EmailBison thread (from the Decisions table). Never sends twice; stops if the prospect wrote again.' },
  'engine.selftest': { run: selfTest, deadlineMs: 5 * 60_000, maxAttempts: 3, description: 'End-to-end check of the engine itself. Spends nothing.' },
  'leadlist.verify': {
    run: verifyStage,
    // MillionVerifier can take hours on big lists; waiting checks are free and don't use attempts.
    deadlineMs: 24 * 60 * 60_000,
    maxAttempts: 5,
    description: 'Verify a lead list with MillionVerifier (upload once, wait, download, split Good/Risky/Bad). Shadow mode: writes nothing to Airtable yet.',
  },
  'campaign.build': {
    run: campaignBuildStage,
    // Imports and attaches can take a while; waiting checks don't use attempts.
    deadlineMs: 6 * 60 * 60_000,
    maxAttempts: 5,
    description: 'Build one EmailBison campaign (find-or-create, sequence, leads with import checks, senders). Never launches.',
  },
  'campaign.topup': {
    run: campaignTopupStage,
    deadlineMs: 6 * 60 * 60_000,
    maxAttempts: 5,
    description: 'Add a Ready lead list to a running EmailBison campaign (KPI rule, import checks, added vs skipped). Never re-uploads, never launches.',
  },
  'campaign.launch': {
    run: campaignLaunchStage,
    // Checks are reads; the launch is confirmed within a few status reads.
    deadlineMs: 30 * 60_000,
    maxAttempts: 3,
    description: 'Launch Campaign (Campaign Center): every launch check first (copy approved, lead list Ready + QA Passed, EmailBison campaign has leads, steps and connected senders, client active); any fail = nothing launched. Then resume (launches a draft) once per campaign and confirm it is live.',
  },
  'campaign.pause': {
    run: campaignPauseStage,
    deadlineMs: 30 * 60_000,
    maxAttempts: 3,
    description: 'Pause Campaign (Campaign Center): pause each running EmailBison campaign of the record right away and confirm it is paused. Never resumes.',
  },
  'campaign.senders': {
    run: campaignSendersStage,
    deadlineMs: 60 * 60_000,
    maxAttempts: 3,
    description: "Update Senders (Campaign Center): make each EmailBison campaign's inboxes equal the record's Email Accounts (add missing, remove extra). A live campaign is paused, changed and resumed. Inboxes not connected are warnings only.",
  },
  'leadlist.sample': {
    run: companySampleStage,
    deadlineMs: 30 * 60_000,
    maxAttempts: 3,
    description: 'Company sample for a lead list: free DiscoLike count, one paid search of up to 100 companies, fit check in code, sample gate. Shadow mode: writes nothing yet.',
  },
  'leadlist.expand': {
    run: companyExpandStage,
    deadlineMs: 12 * 60 * 60_000,
    maxAttempts: 5,
    description: 'Expand an approved company sample to the target number of usable (Tier 1 + Tier 2) companies, 2,500 per batch with a rolling exclusion list; saved in the engine, written to the list sheet once per batch.',
  },
  'leadlist.refit': {
    run: companyRefitStage,
    deadlineMs: 30 * 60_000,
    maxAttempts: 3,
    description: 'Re-check every saved company of a list with its profile (free; optionally rebuild the profile with one AI call); the sheet is rewritten in place.',
  },
  'leadlist.enrichprompt': {
    run: enrichPromptStage,
    deadlineMs: 20 * 60_000,
    maxAttempts: 3,
    description: 'Prepare Enrichment Prompt: the old n8n 04 builder run unchanged (one AI call turns Custom Variables Requested into a structured DiscoGen prompt, saved back for review).',
  },
  'leadlist.enrich': {
    run: enrichRunStage,
    deadlineMs: 8 * 60 * 60_000,
    maxAttempts: 5,
    description: 'Run Enrichment: the old n8n 05 (live copy) run unchanged: one DiscoGen task for the rows missing a requested value, empty cells filled only, Final tabs rewritten after a stale-data check.',
  },
  'leadlist.deepreview': {
    run: deepReviewStage,
    deadlineMs: 8 * 60 * 60_000,
    maxAttempts: 5,
    description: 'Deep review companies (DiscoGen, optional, paid): the old n8n company review run unchanged on the usable companies, for lists with Use DiscoGen Deep Review ticked. Fail cuts the company; each company is reviewed once; AI Company Review tab.',
  },
  'leadlist.deepcontacts': {
    run: deepContactsStage,
    deadlineMs: 8 * 60 * 60_000,
    maxAttempts: 5,
    description: 'Deep review contacts (DiscoGen persona review, optional, paid): the old n8n contact review run unchanged on the usable contacts, for lists with Use DiscoGen Deep Review ticked. Only a clear yes stays; cut contacts leave the Contacts tab; each contact is reviewed once.',
  },
  'leadlist.qa': {
    run: automatedQaStage,
    deadlineMs: 20 * 60_000,
    maxAttempts: 3,
    description: 'Run Automated QA: the old n8n 06 QA code run unchanged on Final Direct / Final Generic against the linked campaign copy; QA Review tab; QA Status Passed/Failed (Ready on pass). No paid calls.',
  },
  'leadlist.filters': {
    run: filterGenerateStage,
    deadlineMs: 20 * 60_000,
    maxAttempts: 3,
    description: 'Generate filters: the old n8n search-plan branch run unchanged (DiscoLike ICP analysis of 20 companies, one AI keyword review, plan built in code); writes the same Airtable fields n8n did.',
  },
  'leadlist.contacts': {
    run: contactsFindStage,
    deadlineMs: 12 * 60 * 60_000,
    maxAttempts: 5,
    description: 'Find people at the Tier 1/2 companies (500 companies per DiscoLike call), contact profile from one AI call, fit in code; Contacts tab ready for Verify.',
  },
  'leadlist.restart': {
    run: restartStage,
    deadlineMs: 20 * 60_000,
    maxAttempts: 3,
    description: 'Restart Companies: back up every working row of the list (companies, contacts, reviews, profiles), clear it and the sheet tabs, and reset counts, approvals, verify and QA. Spends nothing; earlier paid results stay reusable.',
  },
  'leadlist.skipenrich': {
    run: skipEnrichStage,
    deadlineMs: 5 * 60_000,
    maxAttempts: 2,
    description: 'Skip Enrichment: a verified list moves to QA (stage QA, progress 5/6). Spends nothing.',
  },
  'bounce.check': {
    run: bounceCheckStage,
    deadlineMs: 15 * 60_000,
    maxAttempts: 3,
    description: 'Check active campaigns in a workspace: pause over 4% bounce at 35%+ progress, watch over 2.5%. Report-only until switched live.',
  },
};

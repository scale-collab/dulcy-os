// Campaign creation, part 1 (Alex 2026-11-25): Atlas plans a client's next campaign by itself.
//   Trigger: a client's running campaign passes 60% sent, or a new paying client has no campaign yet.
//   1. atlas.plan: reads the client (offer, client file), its past campaigns (email → interested
//      rate vs the agency average), interested and objection replies; picks the move with Alex's SOP
//      (top off / same offer new vertical / new offer or copy test) and writes the thesis (ICP, pain,
//      dream outcome, proof, structure, 2 angles). Creates the Lead List + Campaign records and presses
//      Generate Filters on the Lead List (the same button Alex presses; the bridge runs it).
//   2. campaign.pipeline (every few minutes): after the filters, presses Run Company Sample (first
//      100, about $1); after the sample, posts approval 1 to Slack (plan + ICP + sample).
//   3. ✅ (campaign.plan_approved): ticks Company Sample Approved and presses Expand Companies.
//      ❌: nothing more is spent; the plan is closed.
// Nothing is sent to anyone and nothing is launched here. Credits spent before approval: the
// filters and first-100 sample only (Alex: approve before credits go to the full list).
import { z } from 'zod';
import type { Db } from '../db/pool.js';
import type { Stage } from '../stages/index.js';
import { PermanentError } from '../errors.js';
import { createAirtableClient, type AirtableClient } from '../providers/airtable.js';
import { createClaude } from '../providers/claude.js';
import { DECISIONS, DF } from '../decisions/fields.js';
import { EMAILS, EF, val } from './emailsFields.js';
import { readKnowledge, clientFileFor } from './knowledge.js';
import { LEAD_LISTS, F, FILTER_CLIENT_FIELDS } from '../airtable/bridge.js';
// Kept here, not imported from airtable/campaignBuild (that module imports the stage list: import loop).
const CAMPAIGNS = 'tblAVAA6uBPaMj28P';
const LL = { whichCampaign: 'fldepbn71awSjmZPV' } as const;
import { logActivity } from '../activity.js';
import { CC, copyText, enrichmentRequest, type CopyT } from './scribe.js';
/** Lead List "Custom Variables Requested" (plain-English enrichment request). */
const LL_CUSTOM_VARS = 'fldTYRjTrpVW27tmG';

const WORKSPACES = 'tblcjRBGJEWh5KgOt';
const CAMPAIGN_THESIS = 'fldlixHfhzrd7nuSc';
export const CP = {
  name: 'fldSsb4QjS9UyvKhj', client: 'fldl5bZ644djPsBmN', status: 'fldZABZwE9SmnwMv3', progress: 'fldGM1f8fNNu6ODo2', sent: 'fldDmaS8NZF3j0ZBY',
  replies: 'fldqSxElCOm0QN4kh', interested: 'fldSRXRCC0x2AhX9h', bounced: 'fld3MHVEqXgHimKom', thesis: CAMPAIGN_THESIS, canNewOffer: 'fldbp5hFeZSKg8ZJT', leadList: 'fld5weZ6ED31dBlaz',
} as const;
const num = (x: unknown) => { const n = Number(val(x)); return Number.isFinite(n) ? n : 0; };
const prog = (x: unknown) => { const p = num(x); return p > 1 ? p / 100 : p; };

// ---------- The move (Alex's SOP, in code so the numbers are exact) ----------
export interface CampaignStat { id: string; name: string; client: string; sent: number; interested: number; progress: number; status: string; canNewOffer: boolean }
export type Move = 'first_campaign' | 'top_off' | 'new_vertical' | 'new_offer_or_copy_test';
/** Email → interested rate, only on campaigns with enough sends to judge (500+). */
export const rate = (cs: CampaignStat[]) => { const ok = cs.filter((c) => c.sent >= 500); const s = ok.reduce((a, c) => a + c.sent, 0); return s ? ok.reduce((a, c) => a + c.interested, 0) / s : undefined; };
/**
 * SOP "When to top off, rebuild, or pivot": near or above the agency average → top off; 40%+ below →
 * same offer, new vertical; underperforming and locked in (no new verticals left) → new offer or copy test.
 */
export function recommendMove(client: CampaignStat[], all: CampaignStat[], lockedIn = false): { move: Move; clientRate?: number; agencyRate?: number; why: string } {
  const agencyRate = rate(all); const clientRate = rate(client);
  const pct = (x?: number) => (x === undefined ? 'n/a' : `${(x * 100).toFixed(2)}%`);
  if (clientRate === undefined || agencyRate === undefined) return { move: 'first_campaign', clientRate, agencyRate, why: 'No campaign with 500+ emails sent yet: build the first campaign from the offer and the client file.' };
  const vs = `client ${pct(clientRate)} interested per email vs agency ${pct(agencyRate)}`;
  if (clientRate >= 0.7 * agencyRate) return { move: 'top_off', clientRate, agencyRate, why: `At or near the agency average (${vs}): top off with lookalikes of the companies that replied.` };
  if (clientRate >= 0.6 * agencyRate) return { move: 'top_off', clientRate, agencyRate, why: `30–40% below the agency average (${vs}): FLAGGED. Still a top-off, but watch it; at 40%+ below it becomes a new vertical.` };
  if (!lockedIn) return { move: 'new_vertical', clientRate, agencyRate, why: `40%+ below the agency average (${vs}): same offer, new vertical, as a fresh campaign.` };
  return { move: 'new_offer_or_copy_test', clientRate, agencyRate, why: `Underperforming (${vs}) and locked into one industry: new offer if the client can create one, otherwise copy and angle tests.` };
}

// ---------- What Claude writes ----------
export const Plan = z.object({
  move: z.enum(['first_campaign', 'top_off', 'new_vertical', 'new_offer_or_copy_test']).describe('Use the recommended move unless the evidence clearly says otherwise; then say why in why_move'),
  why_move: z.string().describe('Plain words, with the numbers'),
  campaign_name: z.string().describe('Format: [CLIENT] ICP - FILTERS - SOURCE (ANGLE), e.g. "[Lead Flo] US Landscaping Cos, 11-200 Empl - DiscoLike (Missed Calls)"'),
  icp: z.string().describe('Who exactly: industry, size, geography, situation'),
  targeting: z.string().describe('One sentence for the DiscoLike filter generator: which companies qualify and which to exclude'),
  persona: z.string().describe('Titles to keep and to cut (leadership, executives, founders, owners; not entry/mid level unless the offer needs it)'),
  pain: z.string().describe('One problem only'),
  dream_outcome: z.string().describe('Money, time or status'),
  proof: z.string().describe('The strongest proof that exists in the client facts given. If none is given, write "UNKNOWN: ask Alex for proof" (never invent)'),
  structure: z.enum(['Question → Proof → CTA', 'Offer → Proof → CTA']),
  angles: z.array(z.object({ name: z.string(), tests: z.enum(['USP', 'pain point', 'solution angle', 'proof', 'offer']), hypothesis: z.string() })).describe('Exactly 2 Email-1 angles in the same direction that test something meaningful'),
  objections_to_preempt: z.array(z.string()).describe('Recurring objections from the replies to answer earlier in the sequence'),
  lead_goal: z.number().int().describe('Contacts to build for this campaign'),
  questions_for_alex: z.array(z.string()).describe('Only what blocks the plan (missing proof, unclear offer)'),
});
export type PlanT = z.infer<typeof Plan>;

export function thesisText(p: PlanT): string {
  return [`Move: ${p.move.replace(/_/g, ' ')}: ${p.why_move}`, `ICP: ${p.icp}`, `Pain: ${p.pain}`, `Dream outcome: ${p.dream_outcome}`, `Proof: ${p.proof}`, `Structure: ${p.structure}`,
    `Angles to test in Email 1:\n${p.angles.map((a, i) => `${i + 1}. ${a.name} (tests ${a.tests}): ${a.hypothesis}`).join('\n')}`,
    p.objections_to_preempt.length ? `Objections to answer early: ${p.objections_to_preempt.join('; ')}` : '', `Who to contact: ${p.persona}`].filter(Boolean).join('\n');
}

const PLANNER = `You are Atlas, Dulcy's head of client success, planning a client's NEXT cold email campaign.
Follow Alex's rules exactly (next-campaign rules and campaign SOP below; RULES.md wins on conflict):
- One direction per campaign (one thesis) with 2 Email-1 angles that test something that makes a real difference (USP, pain point, solution angle); never word swaps.
- One problem, one strong proof (more only if equally strong), one low-friction ask; no call ask in the cold sequence unless it is the only logical next step.
- Build on what replied: lookalikes of interested companies, the language prospects used, objections answered earlier.
- Never invent client results, proof, prices or promises; never reuse another client's facts. Unknown = UNKNOWN.`;

// ---------- Plans table ----------
export interface PlanRow { id: number; trigger_key: string; ws_rec: string; client: string; state: string; lead_list_rec: string | null; campaign_rec: string | null; decision_rec: string | null; plan: PlanT | null }
const OPEN = ['planning', 'filters', 'sample', 'approval1'];
/** Every state the pipeline still moves on. Ends: client_approved (build + launch next), rejected, copy_rejected, stuck. */
const ACTIVE = ['planning', 'filters', 'sample', 'approval1', 'expand', 'contacts_sample', 'approval_contacts', 'contacts', 'verify', 'enrich', 'enrich_prompt', 'enrich_run', 'qa', 'approval2', 'approval2_wait', 'client_review'];
const WAITING: Record<string, true> = { approval1: true, approval_contacts: true, approval2: true };
/** The Lead List job each state waits for. */
const STEPS: Record<string, { after: string }> = {
  filters: { after: 'leadlist.filters' }, sample: { after: 'leadlist.sample' }, expand: { after: 'leadlist.expand' }, contacts_sample: { after: 'leadlist.contacts' },
  contacts: { after: 'leadlist.contacts' }, verify: { after: 'leadlist.verify' }, enrich: { after: 'leadlist.skipenrich' }, enrich_prompt: { after: 'leadlist.enrichprompt' }, enrich_run: { after: 'leadlist.enrich' }, qa: { after: 'leadlist.qa' },
};
interface PlanRowX extends PlanRow { decision2_rec: string | null; copy: CopyT | null; copy_state: string | null; copy_issues: { reviewer?: string[]; left?: string[] } | null; copy_round: number }

/** Lead list record fields for a plan (the same fields Alex fills on the Lead List Center screen). */
export function leadListFields(p: PlanT, wsRec: string, campaignRec: string): Record<string, unknown> {
  return {
    [F.name]: p.campaign_name, [F.client]: [wsRec], [F.icp]: p.targeting, [F.thesis]: thesisText(p), [F.personaDna]: p.persona,
    [F.sampleSize]: 100, [F.expansionTarget]: Math.max(300, Math.round(p.lead_goal / 4)), [F.includeDirect]: true, [F.includeGeneric]: true,
    [F.runsOnEngine]: true, [LL.whichCampaign]: [campaignRec], [F.engineAction]: 'Generate Filters', [F.engineActionSetAt]: new Date().toISOString(),
  };
}

async function campaignStats(at: Pick<AirtableClient, 'list'>): Promise<CampaignStat[]> {
  const rows = await at.list(CAMPAIGNS, `{Emails Sent}>0`, [CP.name, CP.client, CP.sent, CP.interested, CP.progress, CP.status, CP.canNewOffer], 3000);
  return rows.map((r) => ({ id: r.id, name: val(r.fields[CP.name]), client: val(r.fields[CP.client]), sent: num(r.fields[CP.sent]), interested: num(r.fields[CP.interested]), progress: prog(r.fields[CP.progress]), status: val(r.fields[CP.status]), canNewOffer: r.fields[CP.canNewOffer] === true }));
}

export const atlasPlanStage: Stage = async (ctx) => {
  const cfg = ctx.cfg; const i = ctx.job.input as { planId: number };
  if (!cfg.airtableApiKey) throw new PermanentError('no AIRTABLE_API_KEY on the server');
  const at = createAirtableClient({ apiKey: cfg.airtableApiKey, baseId: cfg.airtableBaseId, baseUrl: cfg.airtableBaseUrl });
  const row = (await ctx.db.query('SELECT * FROM campaign_plans WHERE id=$1', [i.planId])).rows[0] as PlanRow | undefined;
  if (!row) throw new PermanentError(`campaign plan ${i.planId} not found`);
  if (row.state !== 'planning') return { message: `Plan ${row.id} is already ${row.state}` };
  const ws = await at.get(WORKSPACES, row.ws_rec, ['fld48x6Yg3v6RP30W', 'ID', ...Object.keys(FILTER_CLIENT_FIELDS)].filter((x) => x !== 'ID'));
  const wsName = val(ws?.fields['fld48x6Yg3v6RP30W']) || row.client;
  const bisonId = num((await at.list(WORKSPACES, `RECORD_ID()='${row.ws_rec}'`, ['ID'], 1, { byName: true }))[0]?.fields.ID);
  const all = await campaignStats(at);
  const own = all.filter((c) => c.client === row.ws_rec);
  const rec = recommendMove(own, all, own.length > 0 && own.every((c) => c.canNewOffer === false) && /locked/i.test(row.trigger_key));
  const replies = bisonId ? await at.list(EMAILS, `AND({Workspace ID (Bison)}='${bisonId}',IS_AFTER({Latest Reply Time},DATEADD(NOW(),-120,'days')),{Latest Reply}!='')`, [EF.leadStatus, EF.latestReply, EF.company, EF.campaign], 300) : [];
  const pick = (re: RegExp, n: number) => replies.filter((r) => re.test(val(r.fields[EF.leadStatus]))).slice(0, n).map((r) => `- [${val(r.fields[EF.leadStatus])}] ${val(r.fields[EF.company])} (${val(r.fields[EF.campaign])}): ${val(r.fields[EF.latestReply]).replace(/\s+/g, ' ').slice(0, 400)}`).join('\n');
  const offer = Object.entries(FILTER_CLIENT_FIELDS).map(([id, label]) => (val(ws?.fields[id]) ? `${label}: ${val(ws?.fields[id])}` : '')).filter(Boolean).join('\n');
  const file = bisonId ? clientFileFor(cfg.knowledgeDir, bisonId) : null;
  const k = (rel: string) => readKnowledge(cfg.knowledgeDir, rel);
  const user = [
    `Client: ${wsName}. Trigger: ${row.trigger_key.startsWith('new:') ? 'new client, first campaign' : `campaign past 60% sent (${row.trigger_key})`}.`,
    `Recommended move (Alex's SOP, computed): ${rec.move}. ${rec.why}`,
    `Offer (Airtable):\n${offer || 'UNKNOWN'}`,
    `Past campaigns (sent / interested / progress):\n${own.map((c) => `- ${c.name}: ${c.sent} sent, ${c.interested} interested (${c.sent ? ((c.interested / c.sent) * 100).toFixed(2) : '0'}%), ${Math.round(c.progress * 100)}%, ${c.status}`).join('\n') || 'none'}`,
    `Interested replies:\n${pick(/interested|meeting|info/i, 25) || 'none'}`,
    `Objections and not-interested replies:\n${pick(/objection|not interested/i, 20) || 'none'}`,
  ].join('\n\n');
  if (ctx.dryRun) return { message: `Would plan ${wsName}'s next campaign (dry run: Claude not called). Recommended move: ${rec.move}`, recommended: rec };
  const claude = createClaude({ apiKey: cfg.anthropicApiKey, model: cfg.claudeModel, baseURL: cfg.anthropicBaseUrl });
  const plan = await ctx.paid({
    callKey: `atlas-plan:${row.id}`, provider: 'anthropic', units: 1, scope: 'record',
    run: () => claude.structured(Plan, [PLANNER, [k('skills/atlas-campaign-operator/references/next-campaign-rules.md'), k('skills/atlas-campaign-operator/references/campaign-sop.md'), k('rules/RULES.md'), k('skills/atlas-campaign-operator/references/market-watch.md')].join('\n\n---\n\n')],
      file ? `# Client file: ${file.name}\n${file.text}` : 'No client file in the repo: use only the Airtable offer.', user, 'high'),
    dryRunResult: () => ({}) as PlanT,
  });
  plan.angles = plan.angles.slice(0, 2);
  const campaignRec = await ctx.step('campaign', () => at.create(CAMPAIGNS, { [CP.name]: plan.campaign_name, [CP.client]: [row.ws_rec], [CP.thesis]: thesisText(plan) }));
  const listRec = await ctx.step('leadlist', () => at.create(LEAD_LISTS, leadListFields(plan, row.ws_rec, campaignRec)));
  await ctx.db.query(`UPDATE campaign_plans SET state='filters', plan=$2, campaign_rec=$3, lead_list_rec=$4, updated_at=now() WHERE id=$1`, [row.id, JSON.stringify(plan), campaignRec, listRec]);
  await logActivity(cfg, { event: `Next campaign planned: ${plan.campaign_name}`, type: 'Step done', agent: 'Atlas', details: thesisText(plan), jobId: ctx.job.id }, at);
  return { message: `Planned ${plan.campaign_name} (${plan.move.replace(/_/g, ' ')}); Generate Filters pressed`, campaignRec, listRec };
};

/** Approval 1 message: the plan + what the first 100 companies look like. */
export function approvalText(p: PlanT, sample: { good: number; bad: number; fitRate: string; summary: string; sheet: string }): { title: string; issue: string; checked: string; fix: string } {
  return {
    title: `Approve campaign plan: ${p.campaign_name}`,
    issue: `${p.move.replace(/_/g, ' ')}: ${p.why_move}`,
    checked: `${thesisText(p)}\n\nFirst 100 companies: ${sample.good} fit, ${sample.bad} not (${sample.fitRate || 'fit rate UNKNOWN'}).${sample.summary ? `\n${sample.summary.slice(0, 600)}` : ''}${sample.sheet ? `\nSample sheet: ${sample.sheet}` : ''}${p.questions_for_alex.length ? `\n\nQuestions for you: ${p.questions_for_alex.join(' · ')}` : ''}`,
    fix: '✅ = build the full list (expand, contacts, verify, plus enrichment for any variables the copy needs) and write the copy. ❌ = stop here; nothing more is spent.',
  };
}

/** Every few minutes: start plans for triggers, press the next Lead List button, post approval 1. */
export const campaignPipelineStage: Stage = async (ctx) => {
  const cfg = ctx.cfg;
  if (!cfg.airtableApiKey) throw new PermanentError('no AIRTABLE_API_KEY on the server');
  const at = createAirtableClient({ apiKey: cfg.airtableApiKey, baseId: cfg.airtableBaseId, baseUrl: cfg.airtableBaseUrl });
  const out: string[] = [];
  // 1. Triggers (at most one new plan per run; at most cfg.campaignPlansMaxOpen open at a time).
  const open = (await ctx.db.query(`SELECT ws_rec FROM campaign_plans WHERE state = ANY($1)`, [OPEN])).rows.map((r) => String(r.ws_rec));
  if (open.length < cfg.campaignPlansMaxOpen) {
    const all = await campaignStats(at);
    const seen = new Set((await ctx.db.query('SELECT trigger_key FROM campaign_plans')).rows.map((r) => String(r.trigger_key)));
    const clients = await at.list(WORKSPACES, `AND({Status}='Active',FIND('Paying',{Client Type}))`, ['Name'], 200, { byName: true });
    const candidates: { key: string; ws: string; client: string }[] = [];
    for (const c of all.filter((x) => /active/i.test(x.status) && x.progress >= 0.6 && x.progress < 1)) {
      const cl = clients.find((w) => w.id === c.client); if (cl) candidates.push({ key: `next:${c.id}`, ws: c.client, client: val(cl.fields.Name) });
    }
    for (const w of clients) if (!all.some((c) => c.client === w.id)) candidates.push({ key: `new:${w.id}`, ws: w.id, client: val(w.fields.Name) });
    const next = candidates.find((c) => !seen.has(c.key) && !open.includes(c.ws));
    if (next && !ctx.dryRun) {
      const id = (await ctx.db.query(`INSERT INTO campaign_plans (trigger_key, ws_rec, client, state) VALUES ($1,$2,$3,'planning') ON CONFLICT (trigger_key) DO NOTHING RETURNING id`, [next.key, next.ws, next.client])).rows[0]?.id;
      if (id) out.push(`plan ${id} started for ${next.client} (${next.key})`);
    } else if (next) out.push(`would start a plan for ${next.client} (${next.key})`);
  }
  // 2. Advance active plans by reading their Lead List record (the bridge runs the buttons).
  const rows = (await ctx.db.query(`SELECT * FROM campaign_plans WHERE state = ANY($1) ORDER BY id`, [ACTIVE])).rows as PlanRowX[];
  for (const r of rows) {
    if (r.state === 'planning' || !r.lead_list_rec || !r.plan) continue;
    const say = (s: string) => out.push(`plan ${r.id}: ${s}`);
    const setState = async (state: string, extra = '') => { if (!ctx.dryRun) await ctx.db.query(`UPDATE campaign_plans SET state=$2${extra}, updated_at=now() WHERE id=$1`, [r.id, state]); };
    // Waiting on a ✅/❌: a ❌ ends the plan (approval 2 ❌: the copy waits for Alex's notes).
    if (WAITING[r.state]) {
      const dec = r.state === 'approval2' ? r.decision2_rec : r.decision_rec;
      const d = dec ? await at.get(DECISIONS, dec, [DF.status]) : null;
      if (val(d?.fields[DF.status]) === 'Rejected') { await setState(r.state === 'approval2' ? 'copy_rejected' : 'rejected'); say(r.state === 'approval2' ? 'copy ❌: waiting for your notes (campaign-copy <plan> "<notes>")' : '❌: stopped, nothing more is spent'); }
      continue;
    }
    // With the client: read the portal answer on the Campaign.
    if (r.state === 'client_review') {
      if (!r.campaign_rec) continue;
      const c = await at.get(CAMPAIGNS, r.campaign_rec, [CC.workflow, CC.clientFeedback, CC.selectChanges, CC.reviewFeedback, CC.additionalContext, CC.approvalSource]);
      const wf = val(c?.fields[CC.workflow]); const fb = val(c?.fields[CC.clientFeedback]);
      if (wf === 'Approved' || /approve campaign/i.test(fb)) { await setState('client_approved'); say(`client approved (${val(c?.fields[CC.approvalSource]) || 'portal'})`); }
      else if (wf === 'Changes Requested' || /request changes/i.test(fb)) {
        const notes = [`Area: ${val(c?.fields[CC.selectChanges]) || 'Copy'}`, val(c?.fields[CC.reviewFeedback]), val(c?.fields[CC.additionalContext])].filter(Boolean).join('\n');
        if (!/copy|entire/i.test(val(c?.fields[CC.selectChanges]) || 'copy')) { await setState('stuck'); say(`client asked for list changes (${notes.replace(/\n/g, ' · ')}): over to you`); continue; }
        if (!ctx.dryRun) await ctx.db.query(`UPDATE campaign_plans SET state='approval2_wait', copy_state='queued', copy_round=copy_round+1, copy_feedback=$2, updated_at=now() WHERE id=$1`, [r.id, notes.slice(0, 4000)]);
        say('client asked for copy changes → Scribe rewrites, then approval 2 again');
      }
      continue;
    }
    if (r.state === 'approval2_wait') { // copy rewrite after client feedback → approval 2 again
      if (r.copy_state === 'ready') { if (!ctx.dryRun) await postApproval2(ctx, at, r); say('rewritten copy → approval 2 posted'); }
      continue;
    }
    const ll = await at.get(LEAD_LISTS, r.lead_list_rec, [F.engineStatus, F.engineAction, F.engineJobId, F.companyGood, F.companyBad, F.companyFitRate, F.companySummary, F.sheetLink, F.contactGood, F.contactBad, F.contactFitRate, F.contactSummary, F.leads, F.finalDirect, F.finalGeneric, F.verifyGood, F.verifyRisky, F.verifyBad, F.engineMessage]);
    if (!ll) continue;
    const st = val(ll.fields[F.engineStatus]); const pending = !!val(ll.fields[F.engineAction]);
    if (pending || !['Done', 'Failed', 'Needs Review'].includes(st)) continue;
    const jobKind = (await ctx.db.query('SELECT kind FROM jobs WHERE id = $1', [Number(String(val(ll.fields[F.engineJobId])).split(',')[0]) || 0])).rows[0]?.kind as string | undefined;
    const step = STEPS[r.state];
    if (!step) continue;
    if (st !== 'Done' && (jobKind === undefined || jobKind === step.after)) { await setState('stuck'); say(`${jobKind ?? 'step'} ${st}, stopped (see the Lead List: ${val(ll.fields[F.engineMessage]).slice(0, 200)})`); continue; }
    if (jobKind !== step.after) continue; // the bridge has not finished this plan's step yet
    const press = async (action: string, extra: Record<string, unknown> = {}) => { if (!ctx.dryRun) await at.update(LEAD_LISTS, r.lead_list_rec!, { ...extra, [F.engineAction]: action, [F.engineActionSetAt]: new Date().toISOString() }); };
    switch (r.state) {
      case 'filters': await press('Run Company Sample'); await setState('sample'); say('filters done → first 100 sample'); break;
      case 'sample': {
        const a = approvalText(r.plan, { good: num(ll.fields[F.companyGood]), bad: num(ll.fields[F.companyBad]), fitRate: val(ll.fields[F.companyFitRate]), summary: val(ll.fields[F.companySummary]), sheet: val(ll.fields[F.sheetLink]) });
        if (!ctx.dryRun) {
          const dec = await at.create(DECISIONS, { [DF.title]: a.title, [DF.agent]: 'Atlas', [DF.status]: 'New', [DF.client]: r.client, [DF.issue]: a.issue, [DF.checked]: a.checked, [DF.fix]: a.fix, [DF.details]: `Lead List ${r.lead_list_rec}, Campaign ${r.campaign_rec}. Plan ${r.id}.`, [DF.action]: 'Approve Campaign Plan', [DF.actionInput]: JSON.stringify({ planId: r.id }) });
          await ctx.db.query(`UPDATE campaign_plans SET state='approval1', decision_rec=$2, updated_at=now() WHERE id=$1`, [r.id, dec]);
        }
        say('sample done → approval 1 posted'); break;
      }
      case 'expand': await press('Find Contacts'); await setState('contacts_sample'); say('companies expanded → contact sample'); break;
      case 'contacts_sample': {
        const rate = pctNum(val(ll.fields[F.contactFitRate]));
        if (rate !== undefined && rate >= CONTACT_OK) { await press('Find Contacts', { [F.contactApproved]: true }); await setState('contacts'); say(`contact sample ${rate}% usable → all contacts`); }
        else {
          if (!ctx.dryRun) {
            const dec = await at.create(DECISIONS, { [DF.title]: `Contact sample low: ${r.plan.campaign_name}`, [DF.agent]: 'Atlas', [DF.status]: 'New', [DF.client]: r.client,
              [DF.issue]: `Only ${rate ?? 'UNKNOWN'}% of the sample contacts are usable (needs ${CONTACT_OK}%).`, [DF.checked]: `${num(ll.fields[F.contactGood])} usable, ${num(ll.fields[F.contactBad])} cut.\n${val(ll.fields[F.contactSummary]).slice(0, 600)}`,
              [DF.fix]: '✅ = find all contacts anyway. ❌ = stop; fix the titles on the Lead List first.', [DF.details]: `Plan ${r.id}, Lead List ${r.lead_list_rec}.`, [DF.action]: 'Approve Contact Sample', [DF.actionInput]: JSON.stringify({ planId: r.id }) });
            await ctx.db.query(`UPDATE campaign_plans SET state='approval_contacts', decision_rec=$2, updated_at=now() WHERE id=$1`, [r.id, dec]);
          }
          say(`contact sample ${rate ?? '?'}% usable → asked you`);
        }
        break;
      }
      case 'contacts': await press('Verify and Finalize'); await setState('verify'); say('contacts found → verify'); break;
      case 'verify': {
        // The copy decides whether the list needs enrichment (its custom {VARIABLES}), so wait for it.
        if (r.copy_state !== 'ready' || !r.copy) { say(`verified (${num(ll.fields[F.leads])} leads), waiting for the copy`); break; }
        const req = enrichmentRequest(r.copy);
        if (req) { await press('Prepare Enrichment Prompt', { [LL_CUSTOM_VARS]: req }); await setState('enrich_prompt'); say(`verified → enrichment for ${r.copy.custom_variables.map((v) => `{${v.name}}`).join(', ')}`); }
        else { await press('Skip Enrichment'); await setState('enrich'); say(`verified (${num(ll.fields[F.leads])} leads) → QA next`); }
        break;
      }
      case 'enrich_prompt': await press('Run Enrichment'); await setState('enrich_run'); say('enrichment prompt ready → enriching'); break;
      case 'enrich_run': case 'enrich':
        await press('Run Automated QA'); await setState('qa'); say('list + copy ready → automated QA'); break;
      case 'qa': if (!ctx.dryRun) await postApproval2(ctx, at, r, { leads: num(ll.fields[F.leads]), direct: num(ll.fields[F.finalDirect]), generic: num(ll.fields[F.finalGeneric]), good: num(ll.fields[F.verifyGood]), risky: num(ll.fields[F.verifyRisky]), sheet: val(ll.fields[F.sheetLink]) }); say('QA passed → approval 2 posted'); break;
    }
  }
  const planning = (await ctx.db.query(`SELECT id FROM campaign_plans WHERE state='planning'`)).rows.map((x) => Number(x.id));
  return { message: out.length ? out.join('; ') : 'Nothing to do', planning };
};

const pctNum = (s: string) => { const m = /(\d+(?:\.\d+)?)/.exec(s); return m ? Number(m[1]) : undefined; };
/** Contact sample usable % at which Atlas continues by itself (below it: asks Alex). */
const CONTACT_OK = 70;

interface ListFacts { leads: number; direct: number; generic: number; good: number; risky: number; sheet: string }
/** Approval 2: the final copy + the list. ✅ sends it to the client portal. */
export function approval2Text(p: PlanT, copy: CopyT, issues: { reviewer?: string[]; left?: string[] } | null, list?: ListFacts): { title: string; issue: string; checked: string; fix: string } {
  return {
    title: `Approve copy + list: ${p.campaign_name}`,
    issue: copy.notes,
    checked: `${list ? `List: ${list.leads} leads (${list.direct} direct, ${list.generic} generic; ${list.good} good, ${list.risky} risky emails). QA passed.${list.sheet ? ` Sheet: ${list.sheet}` : ''}\n\n` : ''}${copyText(copy)}`
      + `${issues?.left?.length ? `\n\n⚠️ Still flagged: ${issues.left.join(' · ')}` : ''}${copy.questions_for_alex.length ? `\n\nQuestions for you: ${copy.questions_for_alex.join(' · ')}` : ''}`,
    fix: '✅ = send to the client portal for approval (auto-approves after 48 business hours). ❌ = Scribe waits for your notes.',
  };
}
async function postApproval2(ctx: Parameters<Stage>[0], at: AirtableClient, r: PlanRowX, list?: ListFacts) {
  const a = approval2Text(r.plan!, r.copy!, r.copy_issues, list);
  const dec = await at.create(DECISIONS, { [DF.title]: a.title, [DF.agent]: 'Scribe', [DF.status]: 'New', [DF.client]: r.client, [DF.issue]: a.issue, [DF.checked]: a.checked, [DF.fix]: a.fix,
    [DF.details]: `Campaign ${r.campaign_rec}, Lead List ${r.lead_list_rec}. Plan ${r.id}, copy round ${r.copy_round}.`, [DF.action]: 'Approve Campaign Copy', [DF.actionInput]: JSON.stringify({ planId: r.id }) });
  await ctx.db.query(`UPDATE campaign_plans SET state='approval2', decision2_rec=$2, updated_at=now() WHERE id=$1`, [r.id, dec]);
}

/** ✅ on approval 1: approve the sample and press Expand Companies; Scribe starts the copy at the same time. */
export const planApprovedStage: Stage = async (ctx) => {
  const cfg = ctx.cfg; const i = ctx.job.input as { planId: number };
  const at = createAirtableClient({ apiKey: cfg.airtableApiKey, baseId: cfg.airtableBaseId, baseUrl: cfg.airtableBaseUrl });
  const r = (await ctx.db.query('SELECT * FROM campaign_plans WHERE id=$1', [i.planId])).rows[0] as PlanRowX | undefined;
  if (!r?.lead_list_rec) throw new PermanentError(`campaign plan ${i.planId} not found or has no lead list`);
  if (r.state !== 'approval1') return { message: `Plan ${r.id} is ${r.state}; nothing to do` };
  if (ctx.dryRun) return { message: `Would approve the sample and press Expand Companies on ${r.plan?.campaign_name ?? r.lead_list_rec} (dry run)` };
  await ctx.step('expand', () => at.update(LEAD_LISTS, r.lead_list_rec!, { [F.sampleApproved]: true, [F.engineAction]: 'Expand Companies', [F.engineActionSetAt]: new Date().toISOString() }));
  await ctx.db.query(`UPDATE campaign_plans SET state='expand', copy_state='queued', updated_at=now() WHERE id=$1`, [r.id]);
  await logActivity(cfg, { event: `Campaign plan approved: ${r.plan?.campaign_name ?? ''}`, type: 'Step done', agent: 'Atlas', details: 'Sample approved; Expand Companies pressed; Scribe is writing the copy.', jobId: ctx.job.id }, at);
  return { message: `Approved: ${r.plan?.campaign_name ?? ''}. Expand Companies pressed; the full list builds and Scribe writes the copy.` };
};

/** ✅ on a low contact sample: approve it and find all contacts. */
export const contactsApprovedStage: Stage = async (ctx) => {
  const cfg = ctx.cfg; const i = ctx.job.input as { planId: number };
  const at = createAirtableClient({ apiKey: cfg.airtableApiKey, baseId: cfg.airtableBaseId, baseUrl: cfg.airtableBaseUrl });
  const r = (await ctx.db.query('SELECT * FROM campaign_plans WHERE id=$1', [i.planId])).rows[0] as PlanRowX | undefined;
  if (!r?.lead_list_rec) throw new PermanentError(`campaign plan ${i.planId} not found`);
  if (r.state !== 'approval_contacts') return { message: `Plan ${r.id} is ${r.state}; nothing to do` };
  if (ctx.dryRun) return { message: 'Would approve the contact sample and find all contacts (dry run)' };
  await ctx.step('contacts', () => at.update(LEAD_LISTS, r.lead_list_rec!, { [F.contactApproved]: true, [F.engineAction]: 'Find Contacts', [F.engineActionSetAt]: new Date().toISOString() }));
  await ctx.db.query(`UPDATE campaign_plans SET state='contacts', updated_at=now() WHERE id=$1`, [r.id]);
  return { message: 'Contact sample approved; finding all contacts.' };
};

/** Weekday hours from `start` (the Campaign Center's own 48-hour client review clock). */
export function addWeekdayHours(start: Date, hours: number): Date {
  const d = new Date(start); let left = hours;
  while (left > 0) { d.setUTCHours(d.getUTCHours() + 1); const day = d.getUTCDay(); if (day !== 0 && day !== 6) left--; }
  return d;
}
/** ✅ on approval 2: "Send for approval" (same fields as the Campaign Center button); the existing automation emails the client the portal link. */
export const copyApprovedStage: Stage = async (ctx) => {
  const cfg = ctx.cfg; const i = ctx.job.input as { planId: number };
  const at = createAirtableClient({ apiKey: cfg.airtableApiKey, baseId: cfg.airtableBaseId, baseUrl: cfg.airtableBaseUrl });
  const r = (await ctx.db.query('SELECT * FROM campaign_plans WHERE id=$1', [i.planId])).rows[0] as PlanRowX | undefined;
  if (!r?.campaign_rec) throw new PermanentError(`campaign plan ${i.planId} not found`);
  if (r.state !== 'approval2') return { message: `Plan ${r.id} is ${r.state}; nothing to do` };
  if (ctx.dryRun) return { message: `Would send ${r.plan?.campaign_name} to the client portal (dry run)` };
  const now = new Date();
  await ctx.step('client-review', () => at.update(CAMPAIGNS, r.campaign_rec!, { [CC.workflow]: 'Client Review', [CC.submittedAt]: now.toISOString(), [CC.autoApproveAt]: addWeekdayHours(now, 48).toISOString(), [CC.approvalSource]: '' }));
  await ctx.db.query(`UPDATE campaign_plans SET state='client_review', updated_at=now() WHERE id=$1`, [r.id]);
  await logActivity(cfg, { event: `Sent for client approval: ${r.plan?.campaign_name ?? ''}`, type: 'Step done', agent: 'Atlas', details: 'Client Review in the portal; auto-approves after 48 business hours.', campaignRecordIds: [r.campaign_rec], jobId: ctx.job.id }, at);
  return { message: `Sent to the client portal: ${r.plan?.campaign_name ?? ''} (auto-approves after 48 business hours)` };
};

export async function plansDue(db: Db): Promise<number[]> {
  return (await db.query(`SELECT id FROM campaign_plans WHERE state='planning'`)).rows.map((r) => Number(r.id));
}

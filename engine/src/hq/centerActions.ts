// Round 2 campaigns (Alex 2026-11-27): the Campaign Center and Lead List Center BUTTONS in HQ.
// Alex: "If I click a campaign, how do I look at the lead list? How do I write the copy? How do I
// create campaigns? There's no button for that."
//
// Every button presses the SAME engine path its Airtable button presses; HQ adds no new way in:
//   - Lead List Center (engine): the screen writes Runs on Engine + Engine Action on the Lead Lists
//     record (plus the screen's own approval ticks); the engine's bridge (airtable/bridge.ts) picks
//     it up within ~30 seconds, checks the input, queues the stage with LIVE_STAGES / dry run, and
//     writes progress back. HQ writes exactly those fields, nothing else (never a stage or status).
//   - Campaign Center (engine): Runs on Engine + Engine Action on the Campaigns record
//     (Build / Launch / Pause / Update Senders / Top Up; airtable/campaignActions.ts runs every check).
//   - TAM Finder: TAM Check JSON "requested" (bridge.pollTam answers with the free count).
//   - New campaign: a campaign_plans row in state "planning", the same row Atlas's 60% / new-client
//     trigger makes (agents/campaignPlan.ts); approvals 1 and 2 are the plan's own Decisions cards,
//     decided with the same decide() the Decisions screen uses; a copy rewrite with notes is the
//     CLI's campaign-copy (copy_state queued → scribe.copy).
// Buttons whose Airtable version runs an Airtable automation or n8n (Clone, Delete, Sync with
// EmailBison, Send for client review on a hand-made campaign, picking inboxes) have no engine path
// yet: they are listed, disabled, with "comes next".
// Owner only: every press (members see the buttons disabled). Every press needs confirm: true and
// is read fresh first (a list or campaign with a step running is refused, like the screens).
// Each press is logged in hq_settings_log (who, when, what was written).
import type { Db } from '../db/pool.js';
import type { Config } from '../config.js';
import type { AirtableRecord } from '../providers/airtable.js';
import type { HqAirtable } from './decisions.js';
import { decide } from './decisions.js';
import { CAMPAIGNS_T, LEAD_LISTS_T, LIST_ORDER, LLF, campaignActivity, cachedCampaigns, clientIndex, engineHistory, isTest, _resetCampaignsCache, type PlanInfo, PLAN_LABEL } from './campaigns.js';
import { CAMPAIGN_FIELDS } from '../campaign/campaignFields.js';
// Copy fields (Campaigns (Review) and sequence fields).
import { CC } from '../agents/scribe.js';
import { outputCopy, type SignatureInfo } from '../campaign/airtableCopy.js';

// ---------- fields ----------
/** Lead Lists fields the HQ Lead List Center reads (engine fields from airtable/bridge.ts F). Never a key or password field. */
export const LX = {
  ...LLF,
  runsOnEngine: 'fldKPpOJP097SYrhS', engineAction: 'fldZgT9Rbnra2x5GP', engineJobId: 'fldUjq8KXRscLHOWd',
  icp: 'fldcYwP7Dlq4uyC39', filtersJson: 'fldC2hZQ3gSqLmi1y', sampleSize: 'fldiedxTwtn6TikJi', sampleApproved: 'fldqGx4RU4zDYxitK', expansionTarget: 'fldYzvqGmQZxXL9AP',
  personaDna: 'fldRIomZHeVxPWveE', contactSampleSize: 'fldE2XBsGSES6fT6X', contactApproved: 'fldVz983EKKiPSzjc', includeGeneric: 'fldIXN5t3bqfiZ0Wu', includeDirect: 'fldfFcn3BB2RyiWer',
  useLeadMagic: 'fldJbIiQ35ZFPsXPL', workflowMessage: 'fldVnH7Pn1PxlZI5b', sheetLink: 'fldSOTvnUxzKWXMDD',
  companyGood: 'fldAWCY4Tl9jpQtYc', companyBad: 'fldqaiJodYBS3GpRu', companyFitRate: 'fldDD7HGFq0j3Iwfp', companyStatus: 'fldY1i1787UwZFOr6', companySummary: 'fld6BhZSLdGOkCJCZ',
  contactGood: 'fldkWL67N8ZaBIaDi', contactBad: 'flda4qjRC0sCeStBg', contactFitRate: 'fldbiciFuOmAzv38D', contactStatus: 'fldVH77A3Ozjh4t8k', contactSummary: 'fldnScb360OZ17VRt',
  verifyGood: 'fld8kUuSdLo5autI7', verifyRisky: 'fldXl4sV7ma4YAOv7', verifyBad: 'fld9Jgzxc9JqeFAus',
  useDeepReview: 'fldsYFrdNF2VBS6SQ', tamCheck: 'fldKNUnxiySLsIUny', customVars: 'fldTYRjTrpVW27tmG',
} as const;
/** Campaigns fields for the Campaign Center buttons (airtable/campaignActions.ts CE + campaignBuild.ts CF). */
export const CX = {
  name: 'fldSsb4QjS9UyvKhj', status: 'fldZABZwE9SmnwMv3', stage: 'fldOVJmlGWxW1dveo', client: 'fldl5bZ644djPsBmN', lists: 'fld5weZ6ED31dBlaz', accounts: 'fldi906rwZ9YOpU64',
  runsOnEngine: 'flds0oKDXF1XgQUeI', engineAction: 'fldsvWSdSkH8y16wW', engineStatus: 'fldBIuY7HML1wycLr', engineJobId: 'fldx3JS89Nu10OjeT', engineMessage: 'fldtsSMcX9XX4h1Vc',
  topupList: 'fld4lMlTPjrRmAFHp', topupStatus: 'fldhUPV4f4pqvv047', topupMessage: 'fldfSoL1aatKQs722',
  processing: 'fldCebt3IMI8ZxdQq', approvalSource: 'fldgHA5CcgM885Itp', approvalException: 'fld1vE0Exqlw7MMvq',
} as const;
// EmailBison IDs (campaignFields.ts: ID, Direct and Generic campaign IDs).
const BISON = { id: CAMPAIGN_FIELDS.ID, direct: CAMPAIGN_FIELDS['EmailBison Direct Campaign ID'], generic: CAMPAIGN_FIELDS['EmailBison Generic Campaign ID'] };

// ---------- small helpers (pure) ----------
const s = (v: unknown): string => (Array.isArray(v) ? s(v[0]) : v === undefined || v === null ? '' : typeof v === 'object' ? String((v as any).name ?? (v as any).id ?? '') : String(v)).trim();
const n = (v: unknown): number => { const x = Number(s(v)); return Number.isFinite(x) ? x : 0; };
const ids = (v: unknown): string[] => (Array.isArray(v) ? v : v ? [v] : []).map((x: any) => (typeof x === 'string' ? x : x?.id)).filter((x): x is string => typeof x === 'string' && /^rec[A-Za-z0-9]{14}$/.test(x));
const yes = (v: unknown) => v === true;
const ACTIVE = ['Queued', 'Running', 'Waiting'];
export const isRec = (x: unknown): x is string => typeof x === 'string' && /^rec[A-Za-z0-9]{14}$/.test(x);



/** One button as HQ shows it: what it does, what it spends, and why it is off. */
export interface ActionView {
  key: string; label: string; section: string; does: string; spends: string; enabled: boolean; why: string;
  /** No engine path yet: shown disabled with "comes next". */ comesNext: boolean;
  dryRun: boolean; tone: 'primary' | 'quiet' | 'danger'; needsNotes?: boolean;
}
const dry = (cfg: Pick<Config, 'dryRun' | 'liveStages'>, kind: string) => !!kind && cfg.dryRun && !cfg.liveStages.includes(kind);
const OWNER_ONLY = 'Only Alex can press this.';

// ---------- the Lead List Center buttons ----------
export interface ListState {
  id: string; name: string; clients: string[]; icp: string; filters: string; sampleApproved: boolean; target: number; companies: number; companyGood: number;
  contactApproved: boolean; contactGood: number; includeDirect: boolean; includeGeneric: boolean; useLeadMagic: boolean; customVars: string;
  verified: number; finalLeads: number; stage: string; qa: string; campaigns: string[]; engineAction: string; engineStatus: string; processing: string; tamStatus: string;
}
export function listState(r: AirtableRecord): ListState {
  const f = r.fields;
  let tamStatus = '';
  try { tamStatus = String(JSON.parse(s(f[LX.tamCheck]) || '{}')?.status ?? ''); } catch { /* not JSON */ }
  return {
    id: r.id, name: s(f[LX.name]) || s(f[LX.fileName]) || 'Lead list', clients: ids(f[LX.client]), icp: s(f[LX.icp]), filters: s(f[LX.filtersJson]),
    sampleApproved: yes(f[LX.sampleApproved]), target: n(f[LX.expansionTarget]), companies: n(f[LX.companies]), companyGood: n(f[LX.companyGood]),
    contactApproved: yes(f[LX.contactApproved]), contactGood: n(f[LX.contactGood]), includeDirect: yes(f[LX.includeDirect]), includeGeneric: yes(f[LX.includeGeneric]),
    useLeadMagic: yes(f[LX.useLeadMagic]), customVars: s(f[LX.customVars]), verified: n(f[LX.verifyGood]) + n(f[LX.verifyRisky]) + n(f[LX.verifyBad]),
    finalLeads: n(f[LX.finalDirect]) + n(f[LX.finalGeneric]), stage: s(f[LX.stage]), qa: s(f[LX.qa]), campaigns: ids(f[LX.campaigns]),
    engineAction: s(f[LX.engineAction]), engineStatus: s(f[LX.engineStatus]), processing: s(f[LX.processing]), tamStatus,
  };
}
/** A list with a step pressed, queued or running: every button waits (the screen's own lock). */
export const listLocked = (l: Pick<ListState, 'engineAction' | 'engineStatus' | 'processing'>) => !!l.engineAction || ACTIVE.includes(l.engineStatus) || /^(running|queued|waiting|processing)$/i.test(l.processing);

interface ListDef {
  key: string; action?: string; label: string; section: string; does: string; spends: (l: ListState) => string; kind: string; tone?: ActionView['tone'];
  /** null = can press; else why not. */ ready: (l: ListState) => string | null;
  /** The screen's own extra writes with this press (approval ticks, the LeadMagic tick). */ extra?: Record<string, unknown>;
}
const prepared = (v: string) => /# ENRICHMENT PROMPT/.test(v) && /# OUTPUT/.test(v);
export const LIST_ACTIONS: ListDef[] = [
  { key: 'filters', action: 'Generate Filters', label: 'Generate filters', section: 'source', kind: 'leadlist.filters', tone: 'primary',
    does: 'Reads the targeting sentence and the client, writes the DiscoLike search plan (replaces the current one) and checks it is big enough for the lead goal.',
    spends: () => 'About $1 (500 DiscoLike records) + 1 AI call',
    ready: (l) => (!l.icp ? 'Write the targeting sentence (ICP Description) first.' : l.clients.length !== 1 ? 'Link exactly one client to this list first.' : null) },
  { key: 'tam', label: 'Check TAM (free count)', section: 'source', kind: '', does: 'Counts how many companies match the saved filters (DiscoLike\'s free count). Market size only, not a lead count.',
    spends: () => '', ready: (l) => (!l.filters ? 'Generate filters first.' : l.tamStatus === 'requested' ? 'Already counting: the answer comes within a minute.' : null) },
  { key: 'sample', action: 'Run Company Sample', label: 'Run company sample (100)', section: 'companies', kind: 'leadlist.sample', tone: 'primary',
    does: 'Pulls up to 100 companies with the filters and checks each one for fit (in code, no AI).', spends: () => 'Up to 100 companies (about $1)',
    ready: (l) => (!l.filters ? 'Generate filters first.' : null) },
  { key: 'approve-sample', label: 'Approve company sample', section: 'companies', kind: '', extra: { [LX.sampleApproved]: true },
    does: 'Ticks "Company Sample Approved" (the screen\'s approval box). Nothing runs yet: Expand companies is the next press.', spends: () => '',
    ready: (l) => (l.sampleApproved ? 'Already approved.' : !l.companyGood ? 'Run the company sample first.' : null) },
  { key: 'expand', action: 'Expand Companies', label: 'Expand companies', section: 'companies', kind: 'leadlist.expand', tone: 'primary',
    does: 'Grows the approved sample to the Expansion Target in batches of 2,500. Never pulls the same company twice.',
    spends: (l) => `DiscoLike credits per company, up to ${l.target ? l.target.toLocaleString('en-US') : 'the Expansion Target'}`,
    ready: (l) => (!l.sampleApproved ? 'Approve the company sample first.' : !l.target ? 'Set an Expansion Target in Lead List Center first.' : l.companyGood >= l.target && l.target > 100 ? 'Already at the Expansion Target.' : null) },
  { key: 'restart', action: 'Restart Companies', label: 'Restart companies', section: 'companies', kind: 'leadlist.restart', tone: 'danger',
    does: 'Starts the company list over: backs up every company, contact and review first, then clears them, the sheet tabs, the approvals, counts, verify and QA. Emails already verified are never paid for again.',
    spends: () => '', ready: (l) => (!l.companies && !l.companyGood ? 'Nothing to restart yet.' : null) },
  { key: 'contacts-sample', action: 'Find Contacts', label: 'Find contacts (sample)', section: 'contacts', kind: 'leadlist.contacts', tone: 'primary',
    does: 'Finds people at the first companies (the contact sample, 100 companies by default) with the DiscoLike Contacts Run.', spends: () => 'DiscoLike contact credits (sample)',
    ready: (l) => (l.contactApproved ? 'The contact sample is approved: use Find all contacts.' : !l.companyGood ? 'Find companies first.' : null) },
  { key: 'approve-contacts', label: 'Approve contact sample', section: 'contacts', kind: '', extra: { [LX.contactApproved]: true },
    does: 'Ticks "Approve contact sample" (the screen\'s box). Find all contacts is the next press.', spends: () => '',
    ready: (l) => (l.contactApproved ? 'Already approved.' : !l.contactGood ? 'Run the contact sample first.' : null) },
  { key: 'contacts-all', action: 'Find Contacts', label: 'Find all contacts', section: 'contacts', kind: 'leadlist.contacts', tone: 'primary',
    does: 'Finds people at every usable company left.', spends: () => 'DiscoLike contact credits',
    ready: (l) => (!l.contactApproved ? 'Approve the contact sample first.' : null) },
  { key: 'verify', action: 'Verify and Finalize', label: 'Verify (MillionVerifier)', section: 'verification', kind: 'leadlist.verify', tone: 'primary',
    does: 'Checks the contacts\' emails with MillionVerifier and writes the Final Direct and Final Generic tabs. Never checks the same email twice.', spends: () => 'MillionVerifier credits for emails never checked before',
    ready: (l) => (!l.includeDirect && !l.includeGeneric ? 'Tick Include Direct or Include Generic in Lead List Center first.' : !l.contactGood ? 'Find contacts first.' : null) },
  { key: 'verify-leadmagic', action: 'Verify and Finalize', label: 'Recover with LeadMagic', section: 'verification', kind: 'leadlist.verify', extra: { [LX.useLeadMagic]: true },
    does: 'Ticks "Use LeadMagic" and runs Verify again: saved MillionVerifier results are reused; only direct contacts that are not Good go to LeadMagic.', spends: () => 'LeadMagic credits for the risky direct contacts',
    ready: (l) => (!l.verified ? 'Run Verify first.' : null) },
  { key: 'enrich-prompt', action: 'Prepare Enrichment Prompt', label: 'Prepare enrichment prompt', section: 'enrichment', kind: 'leadlist.enrichprompt',
    does: 'One AI call turns the plain-English request in "Custom Variables Requested" into a DiscoGen research prompt, saved there for review. Nothing is researched yet.', spends: () => '1 AI call',
    ready: (l) => (!l.customVars ? 'Write the request in Custom Variables Requested (Lead List Center) first.' : prepared(l.customVars) ? 'Already prepared: review it, then Run enrichment.' : null) },
  { key: 'enrich', action: 'Run Enrichment', label: 'Run enrichment', section: 'enrichment', kind: 'leadlist.enrich', tone: 'primary',
    does: 'DiscoGen researches only the rows missing a requested value; blanks get the fallback phrase.', spends: () => 'DiscoGen research credits per row missing a value',
    ready: (l) => (!l.finalLeads ? 'Run Verify first.' : !/(output|return only|return just)/i.test(l.customVars) ? 'Prepare and review the prompt first.' : null) },
  { key: 'skip-enrich', action: 'Skip Enrichment', label: 'Skip enrichment', section: 'enrichment', kind: 'leadlist.skipenrich',
    does: 'Moves the verified list straight to QA (no custom variables needed).', spends: () => '', ready: (l) => (!l.finalLeads ? 'Run Verify first.' : null) },
  { key: 'qa', action: 'Run Automated QA', label: 'Run automated QA', section: 'qa', kind: 'leadlist.qa', tone: 'primary',
    does: 'Checks every final lead has what the linked campaign copy needs (company, email, first name, every {VARIABLE}), verification Good, no duplicates. Passed moves the list to Ready.', spends: () => '',
    ready: (l) => (!l.finalLeads ? 'Run Verify first.' : !l.campaigns.length ? 'Link the list to a campaign first: QA checks the copy\'s variables.' : null) },
];

/** The buttons for one list, in the screen's order. Pure. */
export function listActions(l: ListState, canAct: boolean, cfg: Pick<Config, 'dryRun' | 'liveStages'>): ActionView[] {
  const locked = listLocked(l);
  const out: ActionView[] = LIST_ACTIONS.map((d) => {
    const why = !canAct ? OWNER_ONLY : locked ? 'A step is running on this list: wait for its result.' : d.ready(l) ?? '';
    return { key: d.key, label: d.label, section: d.section, does: d.does, spends: d.spends(l), enabled: !why, why, comesNext: false, dryRun: dry(cfg, d.kind), tone: d.tone ?? 'quiet' };
  });
  out.push({ key: 'build', label: 'Build campaign', section: 'qa', does: 'Build Campaign lives in the Campaign Center (Alex 2026-11-23): open the linked campaign and press Build there.', spends: '',
    enabled: false, why: l.campaigns.length ? 'Open the campaign to build it.' : 'Link this list to a campaign first.', comesNext: false, dryRun: false, tone: 'quiet' });
  return out;
}

/** The next step in plain words (the screen's "next move"). Pure. */
export function listNextStep(l: ListState): string {
  if (listLocked(l)) return 'A step is running: wait for its result.';
  if (!l.icp) return 'Write the targeting sentence (ICP Description).';
  if (!l.filters) return 'Generate filters.';
  if (!l.companyGood) return 'Run the company sample (first 100).';
  if (!l.sampleApproved) return 'Review the sample, then approve it.';
  if (l.target && l.companyGood < l.target && !l.contactGood) return 'Expand companies to the Expansion Target.';
  if (!l.contactGood) return 'Find contacts (sample).';
  if (!l.contactApproved) return 'Review the contact sample, then approve it.';
  if (!l.verified) return 'Find all contacts, then Verify.';
  if (!l.finalLeads) return 'Verify the emails.';
  if (l.qa !== 'Passed') return l.customVars && !prepared(l.customVars) ? 'Prepare the enrichment prompt (or skip enrichment), then run QA.' : 'Run automated QA.';
  if (['Ready', 'Uploaded'].includes(l.stage)) return l.campaigns.length ? 'Ready: build the campaign in the Campaign Center.' : 'Ready (list only: no campaign linked).';
  return 'Run automated QA.';
}

// ---------- the Campaign Center buttons ----------
export interface CampaignState {
  id: string; name: string; status: string; stage: string; lists: string[]; accounts: string[]; bison: number[]; topupList: string;
  engineAction: string; engineStatus: string; approved: boolean; listReady: boolean | null;
}
const SUFFIX = /\s+-\s+(?:Generic|Direct) Emails\s*$/i;
const APPROVED = new Set(['Approved', 'Spintax in Progress', 'Build Ready', 'Launch Ready', 'Live']);
export function campaignState(r: AirtableRecord, list: AirtableRecord | null): CampaignState {
  const f = r.fields;
  return {
    id: r.id, name: s(f[CX.name]) || 'Campaign', status: s(f[CX.status]), stage: s(f[CX.stage]), lists: ids(f[CX.lists]), accounts: ids(f[CX.accounts]),
    bison: [BISON.id, BISON.direct, BISON.generic].map((k) => n(f[k])).filter((x) => Number.isSafeInteger(x) && x > 0), topupList: ids(f[CX.topupList])[0] ?? '',
    engineAction: s(f[CX.engineAction]), engineStatus: s(f[CX.engineStatus]),
    approved: APPROVED.has(s(f[CX.stage])) || !!s(f[CX.approvalSource]) || yes(f[CX.approvalException]),
    listReady: list ? ['Ready', 'Uploaded'].includes(s(list.fields[LX.stage])) && s(list.fields[LX.qa]) === 'Passed' : null,
  };
}
export const campaignLocked = (c: Pick<CampaignState, 'engineAction' | 'engineStatus'>) => !!c.engineAction || ACTIVE.includes(c.engineStatus);

interface CampaignDef { key: string; action: string; label: string; does: string; spends: string; kind: string; tone?: ActionView['tone']; ready: (c: CampaignState) => string | null }
export const CAMPAIGN_BUTTONS: CampaignDef[] = [
  { key: 'build', action: 'Build Campaign', label: 'Build campaign', kind: 'campaign.build', tone: 'primary',
    does: 'Builds the EmailBison campaign(s) as DRAFTS from the linked lead list: leads, copy, senders, schedule (Generic + Direct parts, inboxes split by leads). Never launches.',
    spends: 'Creates drafts in EmailBison',
    ready: (c) => (SUFFIX.test(c.name) ? 'Build the main campaign, not its "- Direct/Generic Emails" part.' : c.bison.length ? 'Already built: it has an EmailBison campaign.'
      : c.lists.length !== 1 ? (c.lists.length ? 'Link exactly one lead list.' : 'Link the lead list first.')
        : c.listReady === false ? 'The lead list must be Ready with QA Passed first.' : !c.accounts.length ? 'Pick the sending inboxes first (Campaign Center → Senders).' : null) },
  { key: 'launch', action: 'Launch Campaign', label: 'Launch', kind: 'campaign.launch', tone: 'primary',
    does: 'Runs every launch check first (copy approved, lead list Ready + QA Passed, each EmailBison part has leads, steps and connected inboxes, client active). If one fails nothing launches and the reason shows. If all pass, it starts sending.',
    spends: 'Starts sending in EmailBison',
    ready: (c) => (!c.bison.length ? 'Build the campaign first: it has no EmailBison campaign yet.' : c.status === 'Active' ? 'Already live.' : !c.approved ? 'Approve the copy first (client approval or the exception).' : c.listReady === false ? 'The lead list must be Ready with QA Passed first.' : null) },
  { key: 'pause', action: 'Pause Campaign', label: 'Pause', kind: 'campaign.pause', tone: 'danger',
    does: 'Pauses every part in EmailBison right away and checks it is paused. Never restarts anything.', spends: 'Stops sending in EmailBison',
    ready: (c) => (!c.bison.length ? 'Not built yet.' : c.status !== 'Active' ? 'Not live.' : null) },
  { key: 'senders', action: 'Update Senders', label: 'Update senders', kind: 'campaign.senders',
    does: 'Makes the campaign\'s inboxes in EmailBison match its Email Accounts: adds the missing ones, removes the extra ones (a running campaign is paused, changed and started again).', spends: 'Changes the inboxes in EmailBison',
    ready: (c) => (!c.bison.length ? 'Build the campaign first.' : !c.accounts.length ? 'Pick the sending inboxes first.' : null) },
  { key: 'topup', action: 'Top Up Campaign', label: 'Top up', kind: 'campaign.topup',
    does: 'Adds the Top-up Lead List (Ready, QA Passed) to the running campaign, only when the top-up rule passes (interested 15%+ of replies). Never uploads the same list twice.', spends: 'Adds leads in EmailBison',
    ready: (c) => (!c.bison.length ? 'Build the campaign first.' : c.status !== 'Active' ? 'Top up a live campaign.' : !c.topupList ? 'Pick the Top-up Lead List in Campaign Center first.' : null) },
];
// Center parity (2026-11-28): picking inboxes (Senders tab), Clone and Delete (More tab) and Sync with
// EmailBison (Campaigns) are built (centerParity.ts), so nothing "comes next" on the campaign row any more.
const COMES_NEXT: { key: string; label: string; does: string }[] = [];
/** Where the old "comes next" buttons live now (a press on the engine route points there). */
const MOVED: Record<string, string> = { 'pick-inboxes': 'Pick inboxes on the campaign\'s Senders tab.', clone: 'Clone is on the campaign\'s More tab.', delete: 'Delete is on the campaign\'s More tab.', sync: 'Sync with EmailBison is at the top of Campaigns.' };
/** The Campaign Center buttons for one campaign. Pure. */
export function campaignActions(c: CampaignState, canAct: boolean, cfg: Pick<Config, 'dryRun' | 'liveStages'>): ActionView[] {
  const locked = campaignLocked(c);
  return [
    ...CAMPAIGN_BUTTONS.map((d) => {
      const why = !canAct ? OWNER_ONLY : locked ? 'A step is running on this campaign: wait for its result.' : d.ready(c) ?? '';
      return { key: d.key, label: d.label, section: 'campaign', does: d.does, spends: d.spends, enabled: !why, why, comesNext: false, dryRun: dry(cfg, d.kind), tone: d.tone ?? 'quiet' };
    }),
    ...COMES_NEXT.map((x) => ({ key: x.key, label: x.label, section: 'more', does: x.does, spends: '', enabled: false, why: 'Comes next in HQ.', comesNext: true, dryRun: false, tone: 'quiet' as const })),
  ];
}

// ---------- pressing a button ----------
export interface PressResult { status: number; body: Record<string, unknown> }
const LIST_READ = [...new Set(Object.values(LX))];
const CAMPAIGN_READ = [...new Set([...Object.values(CX), BISON.id, BISON.direct, BISON.generic])];
const refuse = (status: number, error: string, extra: Record<string, unknown> = {}): PressResult => ({ status, body: { error, ...extra } });

async function audit(db: Db, actor: string, action: string, rec: string, changes: unknown) {
  await db.query(`INSERT INTO hq_settings_log (actor, action, ws_rec, row_id, changes) VALUES ($1,$2,'',$3,$4)`, [actor, `center:${action}`, rec, JSON.stringify(changes)]);
}

/** Press a Lead List Center button: read fresh, check like the screen, write the screen's fields. */
export async function pressListAction(at: HqAirtable, db: Db, cfg: Config, id: string, body: any, actor: string): Promise<PressResult> {
  const def = LIST_ACTIONS.find((d) => d.key === body?.action);
  if (!def) return refuse(400, 'unknown action');
  if (body?.confirm !== true) return refuse(400, 'confirm: true is required', { does: def.does });
  const rec = await at.get(LEAD_LISTS_T, id, LIST_READ);
  if (!rec) return refuse(404, 'no such lead list');
  const l = listState(rec);
  const view = listActions(l, true, cfg).find((a) => a.key === def.key)!;
  if (!view.enabled) return refuse(409, view.why);
  let fields: Record<string, unknown>;
  if (def.key === 'tam') {
    // The TAM Finder's request (bridge.pollTam answers it with DiscoLike's free count).
    fields = { [LX.tamCheck]: JSON.stringify({ version: 1, status: 'requested', requestId: `hq-${Date.now().toString(36)}`, requestedAt: new Date().toISOString(), source: l.filters }) };
  } else if (!def.action) {
    fields = { ...def.extra };
  } else {
    fields = { ...(def.extra ?? {}), [LX.runsOnEngine]: true, [LX.engineAction]: def.action };
  }
  await at.update(LEAD_LISTS_T, id, fields);
  await audit(db, actor, def.key, id, { list: l.name, fields: Object.keys(fields), action: def.action ?? def.label, dryRun: view.dryRun });
  _resetCampaignsCache();
  const message = def.action
    ? `${def.label} sent to the engine for "${l.name}". It starts within about 30 seconds; the result shows here.${view.dryRun ? ' Dry run: nothing is spent until this stage is switched on (LIVE_STAGES).' : ''}`
    : def.key === 'tam' ? `Counting companies for "${l.name}" (free). The answer shows within a minute.` : `${def.label}: done for "${l.name}".`;
  return { status: 200, body: { ok: true, message, dryRun: view.dryRun } };
}

/** Press a Campaign Center button (Build / Launch / Pause / Update Senders / Top Up). */
export async function pressCampaignAction(at: HqAirtable, db: Db, cfg: Config, id: string, body: any, actor: string): Promise<PressResult> {
  const def = CAMPAIGN_BUTTONS.find((d) => d.key === body?.action);
  if (!def) return refuse(400, MOVED[String(body?.action)] ?? 'unknown action');
  if (body?.confirm !== true) return refuse(400, 'confirm: true is required', { does: def.does });
  const rec = await at.get(CAMPAIGNS_T, id, CAMPAIGN_READ);
  if (!rec) return refuse(404, 'no such campaign');
  const listId = ids(rec.fields[CX.lists]);
  const list = listId.length === 1 ? await at.get(LEAD_LISTS_T, listId[0], [LX.stage, LX.qa]) : null;
  const c = campaignState(rec, list);
  const view = campaignActions(c, true, cfg).find((a) => a.key === def.key)!;
  if (!view.enabled) return refuse(409, view.why);
  const fields = { [CX.runsOnEngine]: true, [CX.engineAction]: def.action };
  await at.update(CAMPAIGNS_T, id, fields);
  await audit(db, actor, def.key, id, { campaign: c.name, action: def.action, dryRun: view.dryRun });
  _resetCampaignsCache();
  return { status: 200, body: { ok: true, dryRun: view.dryRun, message: `${def.label} sent to the engine for "${c.name}". It starts within about 30 seconds; the result shows under Automation status.${view.dryRun ? ' Dry run: nothing changes in EmailBison until this stage is switched on (LIVE_STAGES).' : ''}` } };
}

// ---------- campaign plans (new campaigns) ----------
/** Plan states where the plan is still being made before approval 1 (one open plan per client). */
const OPEN_STATES = ['planning', 'filters', 'sample', 'approval1'];
const ENDED = new Set(['rejected', 'copy_rejected', 'stuck', 'live']);
/** States where Scribe may rewrite the copy (the client has not seen it yet). */
const REWRITE_STATES = new Set(['expand', 'contacts_sample', 'approval_contacts', 'contacts', 'verify', 'enrich', 'enrich_prompt', 'enrich_run', 'qa', 'approval2', 'approval2_wait', 'copy_rejected']);
export interface PlanView {
  id: number; client: string; clientKey: string; state: string; label: string; campaignName: string; campaignRec: string; leadListRec: string; error: string;
  copyState: string; copyRound: number; created: string; updated: string; ended: boolean;
  /** What Alex decides now, if anything. */ waiting: '' | 'plan' | 'contacts' | 'copy';
  decisionRec: string; move: string; why: string; thesis: string; questions: string[];
  actions: ActionView[];
}
const planActions = (p: { state: string; copy_state: string | null; decision_rec: string | null; decision2_rec: string | null }, canAct: boolean, cfg: Pick<Config, 'dryRun' | 'liveStages'>): ActionView[] => {
  const who = canAct ? '' : OWNER_ONLY;
  const a = (key: string, label: string, does: string, ready: string, o: Partial<ActionView> = {}): ActionView => ({ key, label, section: 'plan', does, spends: '', enabled: !(who || ready), why: who || ready, comesNext: false, dryRun: false, tone: 'quiet', ...o });
  const out: ActionView[] = [];
  if (p.state === 'approval1') {
    const no = p.decision_rec ? '' : 'The approval card is missing: see Decisions.';
    out.push(a('approve-plan', 'Approve plan', 'Approves the plan and the first-100 sample: ticks the sample approval and presses Expand Companies; the full list builds and Scribe writes the copy.', no, { tone: 'primary', spends: 'DiscoLike, MillionVerifier and AI credits for the full list and the copy', dryRun: dry(cfg, 'campaign.plan_approved') }));
    out.push(a('reject-plan', 'Stop plan', 'Stops the plan here: nothing more is spent.', no, { tone: 'danger' }));
  }
  if (p.state === 'approval_contacts') {
    const no = p.decision_rec ? '' : 'The approval card is missing: see Decisions.';
    out.push(a('approve-contacts', 'Find all contacts anyway', 'The contact sample is under 70% usable: approve it and find all contacts.', no, { tone: 'primary', spends: 'DiscoLike contact credits', dryRun: dry(cfg, 'campaign.contacts_approved') }));
    out.push(a('reject-contacts', 'Stop plan', 'Stops the plan: fix the titles on the lead list first.', no, { tone: 'danger' }));
  }
  if (p.state === 'approval2') {
    const no = p.decision2_rec ? '' : 'The approval card is missing: see Decisions.';
    out.push(a('approve-copy', 'Approve copy + list', 'Sends the campaign to the client portal for approval (Client Review; auto-approves after 48 business hours). After the client approves: spintax, free healthy inboxes, Build, Launch (only if every launch check passes).', no, { tone: 'primary', dryRun: dry(cfg, 'campaign.copy_approved') }));
    out.push(a('reject-copy', 'Reject copy', 'Rejects the copy: Scribe waits for your notes (use Rewrite with notes).', no, { tone: 'danger' }));
  }
  const writing = REWRITE_STATES.has(p.state) && p.copy_state === 'queued';
  const canRewrite = REWRITE_STATES.has(p.state) && (p.copy_state === 'ready' || p.state === 'copy_rejected' || p.state === 'approval2');
  out.push(a('rewrite', 'Rewrite copy with notes', 'Scribe rewrites the copy with your notes (a new round); approval 2 comes back to you.', writing ? 'Scribe is already writing it.' : canRewrite ? '' : p.state === 'client_review' ? 'The client is reviewing it: their change request goes to Scribe by itself.' : 'There is no copy to rewrite at this step.',
    { needsNotes: true, spends: '2 AI calls (draft + review)', dryRun: dry(cfg, 'scribe.copy') }));
  return out;
};
function planViewOf(x: any, clientKeyOf: (ws: string) => string, canAct: boolean, cfg: Pick<Config, 'dryRun' | 'liveStages'>): PlanView {
  const plan = x.plan ?? null;
  const waiting = x.state === 'approval1' ? 'plan' : x.state === 'approval_contacts' ? 'contacts' : x.state === 'approval2' ? 'copy' : '';
  const thesis = plan ? [`ICP: ${plan.icp ?? ''}`, `Pain: ${plan.pain ?? ''}`, `Proof: ${plan.proof ?? ''}`, ...(Array.isArray(plan.angles) ? plan.angles.map((g: any, i: number) => `Angle ${i + 1}: ${g?.name ?? ''} (${g?.tests ?? ''}): ${g?.hypothesis ?? ''}`) : [])].join('\n') : '';
  return {
    id: Number(x.id), client: String(x.client ?? ''), clientKey: clientKeyOf(String(x.ws_rec)), state: String(x.state), label: PLAN_LABEL[x.state] ?? String(x.state),
    campaignName: String(plan?.campaign_name ?? ''), campaignRec: String(x.campaign_rec ?? ''), leadListRec: String(x.lead_list_rec ?? ''), error: String(x.plan_error ?? '').slice(0, 400),
    copyState: String(x.copy_state ?? ''), copyRound: Number(x.copy_round ?? 1), created: new Date(x.created_at).toISOString(), updated: new Date(x.updated_at).toISOString(), ended: ENDED.has(String(x.state)),
    waiting, decisionRec: String((x.state === 'approval2' ? x.decision2_rec : x.decision_rec) ?? ''), move: String(plan?.move ?? '').replace(/_/g, ' '), why: String(plan?.why_move ?? ''), thesis,
    questions: Array.isArray(plan?.questions_for_alex) ? plan.questions_for_alex.map(String) : [],
    actions: planActions(x, canAct, cfg),
  };
}
const PLAN_COLS = `id, trigger_key, ws_rec, client, state, campaign_rec, lead_list_rec, decision_rec, decision2_rec, copy_state, copy_round, plan_error, plan, created_at, updated_at`;

/** Plans for the Campaign Center's "New campaigns" section: open first, then the last 30 days. */
export async function listPlans(at: HqAirtable, db: Db, cfg: Config, opts: { client?: string; canAct: boolean }) {
  const src = await cachedCampaigns(at, db);
  const ws = clientIndex(src.ws);
  const keyOf = (rec: string) => ws.get(rec)?.key ?? '';
  const rows = (await db.query(`SELECT ${PLAN_COLS} FROM campaign_plans WHERE state <> ALL($1) OR updated_at > now() - interval '30 days' ORDER BY id DESC LIMIT 100`, [[...ENDED]])).rows;
  const plans = rows.map((x) => planViewOf(x, keyOf, opts.canAct, cfg)).filter((p) => !opts.client || p.clientKey === opts.client);
  return { plans, atlasOn: cfg.atlasCampaignsOn, planDryRun: dry(cfg, 'atlas.plan'), canAct: opts.canAct, readAt: new Date().toISOString() };
}

/** The plan behind one campaign (its own, or the one it is the 60% trigger of is NOT it). */
export async function planForCampaign(db: Db, cfg: Config, campaignRec: string, listIds: string[], keyOf: (ws: string) => string, canAct: boolean): Promise<PlanView | null> {
  const r = (await db.query(`SELECT ${PLAN_COLS} FROM campaign_plans WHERE campaign_rec = $1 OR (lead_list_rec IS NOT NULL AND lead_list_rec = ANY($2)) ORDER BY id DESC LIMIT 1`, [campaignRec, listIds])).rows[0];
  return r ? planViewOf(r, keyOf, canAct, cfg) : null;
}

/** "New campaign" for a client: the same campaign_plans row Atlas's own trigger makes. */
export async function createPlan(at: HqAirtable, db: Db, cfg: Config, body: any, actor: string): Promise<PressResult> {
  if (body?.confirm !== true) return refuse(400, 'confirm: true is required');
  const key = String(body?.client ?? '');
  const src = await cachedCampaigns(at, db, true);
  const ws = clientIndex(src.ws);
  // The client's Active workspace record (the Twenty West pair: the active one).
  const recs = src.ws.filter((w) => ws.get(w.id)?.key === key && ws.get(w.id)?.active);
  const main = recs.filter((w) => s(w.fields.Status) === 'Active').sort((a, b) => s(a.fields.Name).length - s(b.fields.Name).length)[0];
  if (!key || !main) return refuse(400, 'pick an active client');
  if (!cfg.atlasCampaignsOn) return refuse(409, 'Atlas campaign planning is off on the server (ATLAS_CAMPAIGNS=on is needed). Nothing was started.');
  const name = ws.get(main.id)!.name;
  const open = (await db.query(`SELECT id, state FROM campaign_plans WHERE ws_rec = ANY($1) AND state = ANY($2)`, [recs.map((r) => r.id), OPEN_STATES])).rows[0];
  if (open) return refuse(409, `${name} already has a plan being made (plan #${open.id}, ${PLAN_LABEL[open.state] ?? open.state}). Approve or stop it first.`);
  const note = String(body?.note ?? '').replace(/\s+/g, ' ').trim().slice(0, 300);
  const trigger = `hq:${main.id}:${new Date().toISOString().slice(0, 16)}`;
  const id = (await db.query(`INSERT INTO campaign_plans (trigger_key, ws_rec, client, state) VALUES ($1,$2,$3,'planning') ON CONFLICT (trigger_key) DO NOTHING RETURNING id`, [trigger, main.id, name])).rows[0]?.id;
  if (!id) return refuse(409, 'A plan was just started for this client: wait a minute.');
  await audit(db, actor, 'plan-create', main.id, { planId: Number(id), client: name, note });
  const dr = dry(cfg, 'atlas.plan');
  return { status: 200, body: { ok: true, planId: Number(id), dryRun: dr, message: `Atlas is planning ${name}'s next campaign (plan #${id}). Within a few minutes: the plan, the lead list and campaign records, Generate Filters, then the first-100 sample. Approval 1 comes to you.${dr ? ' Dry run: atlas.plan is not in LIVE_STAGES, so Atlas only says what it would do.' : ''}` } };
}

const PLAN_DECIDE: Record<string, { state: string; col: 'decision_rec' | 'decision2_rec'; verdict: 'approve' | 'reject'; done: string }> = {
  'approve-plan': { state: 'approval1', col: 'decision_rec', verdict: 'approve', done: 'Plan approved: the full list builds and Scribe writes the copy.' },
  'reject-plan': { state: 'approval1', col: 'decision_rec', verdict: 'reject', done: 'Plan stopped: nothing more is spent.' },
  'approve-contacts': { state: 'approval_contacts', col: 'decision_rec', verdict: 'approve', done: 'Contact sample approved: finding all contacts.' },
  'reject-contacts': { state: 'approval_contacts', col: 'decision_rec', verdict: 'reject', done: 'Plan stopped.' },
  'approve-copy': { state: 'approval2', col: 'decision2_rec', verdict: 'approve', done: 'Copy + list approved: it goes to the client portal for approval.' },
  'reject-copy': { state: 'approval2', col: 'decision2_rec', verdict: 'reject', done: 'Copy rejected: Scribe waits for your notes.' },
};
/** A plan button: approvals go through the plan's own Decisions card (the same decide() as the Decisions screen); a rewrite is the CLI's campaign-copy. */
export async function pressPlanAction(at: HqAirtable, db: Db, cfg: Config, planId: number, body: any, actor: string, owner: boolean): Promise<PressResult> {
  const key = String(body?.action ?? '');
  if (body?.confirm !== true) return refuse(400, 'confirm: true is required');
  const row = (await db.query(`SELECT ${PLAN_COLS} FROM campaign_plans WHERE id=$1`, [planId])).rows[0];
  if (!row) return refuse(404, 'no such plan');
  if (key === 'rewrite') {
    const notes = String(body?.notes ?? '').replace(/\r\n/g, '\n').trim();
    if (notes.length < 3 || notes.length > 4000) return refuse(400, 'write what to change (3 to 4,000 characters)');
    const v = planActions(row, true, cfg).find((a) => a.key === 'rewrite')!;
    if (!v.enabled) return refuse(409, v.why);
    const r = (await db.query(`UPDATE campaign_plans SET copy_state='queued', copy_round=copy_round+1, copy_feedback=$2, state=CASE WHEN state IN ('copy_rejected','approval2') THEN 'approval2_wait' ELSE state END, updated_at=now() WHERE id=$1 RETURNING copy_round`, [planId, notes])).rows[0];
    // The old approval 2 card is answered (the rewrite replaces it; a new card comes with the new copy).
    if (row.state === 'approval2' && isRec(row.decision2_rec)) await decide(at, row.decision2_rec, 'reject', actor, { canSeeMoney: owner }).catch(() => null);
    await audit(db, actor, 'plan-rewrite', String(row.campaign_rec ?? ''), { planId, round: r.copy_round, notes });
    return { status: 200, body: { ok: true, dryRun: dry(cfg, 'scribe.copy'), message: `Scribe rewrites the copy (round ${r.copy_round}) within a few minutes; approval 2 comes back to you.${cfg.atlasCampaignsOn ? '' : ' Note: ATLAS_CAMPAIGNS is off on the server, so it waits until that is on.'}` } };
  }
  const d = PLAN_DECIDE[key];
  if (!d) return refuse(400, 'unknown action');
  if (row.state !== d.state) return refuse(409, `The plan is at "${PLAN_LABEL[row.state] ?? row.state}", not waiting for this.`);
  const dec = String(row[d.col] ?? '');
  if (!isRec(dec)) return refuse(409, 'The approval card is missing: see Decisions.');
  const r = await decide(at, dec, d.verdict, actor, { canSeeMoney: owner });
  if (r.error) return refuse(r.status, r.error);
  await audit(db, actor, key, String(row.campaign_rec ?? ''), { planId, decision: dec, verdict: d.verdict });
  return { status: 200, body: { ok: true, message: `${d.done} The engine picks it up within a minute.` } };
}

// ---------- the copy (view) ----------
export interface CopyVersion { version: number; body: string; signature: string }
export interface CopyStep { step: number; subject: string; body: string; thread: boolean; versions: CopyVersion[]; built: { variant: number; subject: string; body: string }[] }

/** Airtable long text keeps Markdown escapes ("{FIRST\_NAME}"): shown as the plain text EmailBison gets ("{FIRST_NAME}"). Pure. */
export const unescapeCopy = (t: string) => t.replace(/\\([\\_*#\-.!()[\]{}<>|`~+=])/g, '$1');
/** Scribe's review copy holds its versions as "Variant 1 … Variant 2 …" in one cell: one entry per version. Pure. */
export function splitVersions(body: string): { version: number; body: string }[] {
  const parts = body.split(/^[ \t]*(?:\*\*)?(?:variant|version)[ \t]*(\d{1,2})(?:\*\*)?[ \t]*:?[ \t]*$/im);
  if (parts.length < 3) return body.trim() ? [{ version: 1, body: body.trim() }] : [];
  const out: { version: number; body: string }[] = [];
  for (let i = 1; i + 1 < parts.length; i += 2) if (parts[i + 1].trim()) out.push({ version: Number(parts[i]), body: parts[i + 1].trim() });
  // Text before the first "Variant" heading belongs to the first version.
  const head = parts[0].trim();
  if (head) { if (out[0]) out[0].body = `${head}\n\n${out[0].body}`; else out.push({ version: 1, body: head }); }
  return out;
}
/** Client facts the build puts in the signature (Workspace IDs: Name, Brand Name, Sender Title; campaignBuild.ts CL). */
const SIG = { name: 'fld48x6Yg3v6RP30W', brand: 'fldTHTrYh0GCFeBLG', senderTitle: 'fldIMJnjdGGAPotMW' } as const;
const SIG_T = 'tblcjRBGJEWh5KgOt';
/**
 * The signature and P.S. the campaign build adds under a body (the old n8n Output Builder's, ported in
 * campaign/airtableCopy.ts outputCopy: "--", a rotating sign-off, {SENDER_FULL_NAME}, "<Sender Title>,
 * <Brand Name>", then the P.S.), or "" when the body already ends with its own. The sender's full name is
 * the {SENDER_FULL_NAME} variable: EmailBison fills it per sending inbox. No EmailBison sender signature
 * is used (Workspace IDs → Email Signature is empty for every client, 2026-11-28). Pure.
 */
export function signatureFor(body: string, info: SignatureInfo): string {
  if (!body.trim()) return '';
  try {
    const full = outputCopy([[{ subject: 'x', body, threadReply: false }]], 'direct', info)[0].body;
    const base = body.replace(/\s+$/, '');
    return full.startsWith(base) ? full.slice(base.length).trim() : '';
  } catch { return ''; }
}

/** The campaign's copy: the review fields (each version as an email with its signature) and the sequence fields the build uses. */
export async function campaignCopy(at: HqAirtable, db: Db, cfg: Config, id: string, canAct: boolean) {
  const seqFields = CC.seq.flatMap((x) => x.flatMap((v) => [v.subject, v.body]));
  const read = [CX.name, CX.stage, CX.lists, CX.client, ...CC.review.flatMap((x) => [x.subject, x.body]), ...seqFields, ...Object.values(CC.thread), CC.approvalSource, CC.exception, CC.submittedAt, CC.autoApproveAt, CC.clientFeedback, CC.selectChanges, CC.reviewFeedback, CC.additionalContext];
  const rec = await at.get(CAMPAIGNS_T, id, read);
  if (!rec) return null;
  const f = rec.fields;
  const clientRec = ids(f[CX.client])[0];
  const client = clientRec ? await at.get(SIG_T, clientRec, Object.values(SIG)).catch(() => null) : null;
  const info: SignatureInfo = { clientName: s(client?.fields[SIG.name]), brandName: s(client?.fields[SIG.brand]), senderTitle: s(client?.fields[SIG.senderTitle]) };
  const sequence = CC.seq.flatMap((vs, i) => vs.map((v, j) => ({ step: i + 1, variant: j + 1, subject: unescapeCopy(s(f[v.subject])), body: unescapeCopy(s(f[v.body])) }))).filter((x) => x.subject || x.body);
  const review: CopyStep[] = CC.review.map((x, i) => {
    const body = unescapeCopy(s(f[x.body]));
    return {
      step: i + 1, subject: unescapeCopy(s(f[x.subject])), body, thread: i > 0 && yes(f[CC.thread[i + 1]]),
      versions: splitVersions(body).map((v) => ({ ...v, signature: signatureFor(v.body, info) })),
      built: sequence.filter((q) => q.step === i + 1).map(({ variant, subject, body: b }) => ({ variant, subject, body: b })),
    };
  }).filter((x) => x.subject || x.body);
  const src = await cachedCampaigns(at, db);
  const ws = clientIndex(src.ws);
  const plan = await planForCampaign(db, cfg, id, ids(f[CX.lists]), (r) => ws.get(r)?.key ?? '', canAct);
  const copyRow = plan ? (await db.query(`SELECT copy, copy_issues FROM campaign_plans WHERE id=$1`, [plan.id])).rows[0] : null;
  const copy = copyRow?.copy ?? null;
  return {
    id, name: s(f[CX.name]), stage: s(f[CX.stage]), review, sequence,
    approval: { source: s(f[CC.approvalSource]), exception: yes(f[CC.exception]), submittedAt: s(f[CC.submittedAt]), autoApproveAt: s(f[CC.autoApproveAt]), clientFeedback: s(f[CC.clientFeedback]), changeArea: s(f[CC.selectChanges]), feedback: s(f[CC.reviewFeedback]), context: s(f[CC.additionalContext]) },
    scribe: copy ? {
      notes: String(copy.notes ?? ''), questions: Array.isArray(copy.questions_for_alex) ? copy.questions_for_alex.map(String) : [],
      variables: Array.isArray(copy.custom_variables) ? copy.custom_variables.map((v: any) => ({ name: String(v?.name ?? ''), find: String(v?.find ?? ''), fallback: String(v?.fallback ?? '') })) : [],
      claims: Array.isArray(copy.claims) ? copy.claims.map((c: any) => ({ claim: String(c?.claim ?? ''), source: String(c?.source ?? '') })) : [],
      flagged: Array.isArray(copyRow?.copy_issues?.left) ? copyRow.copy_issues.left.map(String) : [],
    } : null,
    plan,
    // Center parity (2026-11-28): a hand-made campaign's copy is written, sent for approval and approved
    // on this tab (centerParity.ts), as in the Campaign Center; nothing comes next here.
    comesNext: [] as { key: string; label: string; why: string }[],
    readAt: new Date().toISOString(),
  };
}

// ---------- the campaign page: buttons + the automation status ----------
export async function campaignCenterView(at: HqAirtable, db: Db, cfg: Config, id: string, canAct: boolean) {
  const rec = await at.get(CAMPAIGNS_T, id, CAMPAIGN_READ);
  if (!rec) return null;
  const listIds = ids(rec.fields[CX.lists]);
  const list = listIds.length === 1 ? await at.get(LEAD_LISTS_T, listIds[0], [LX.stage, LX.qa]) : null;
  const c = campaignState(rec, list);
  const src = await cachedCampaigns(at, db);
  const ws = clientIndex(src.ws);
  return {
    actions: campaignActions(c, canAct, cfg),
    automation: { engineAction: c.engineAction, engineStatus: c.engineStatus, engineMessage: s(rec.fields[CX.engineMessage]).slice(0, 1500), processing: s(rec.fields[CX.processing]), topupStatus: s(rec.fields[CX.topupStatus]), topupMessage: s(rec.fields[CX.topupMessage]).slice(0, 600), locked: campaignLocked(c) },
    bison: c.bison, inboxes: c.accounts.length,
    plan: await planForCampaign(db, cfg, id, listIds, (r) => ws.get(r)?.key ?? '', canAct),
    canAct,
  };
}

// ---------- one lead list (the Lead List Center's record panel) ----------
const tamOf = (raw: string) => { try { const x = JSON.parse(raw || '{}'); return x && typeof x === 'object' ? { status: String(x.status ?? ''), count: Number.isFinite(Number(x.count)) ? Number(x.count) : null, message: String(x.message ?? '').slice(0, 300), checkedAt: String(x.checkedAt ?? '') } : null; } catch { return null; } };
/** The saved company filters in one plain line (e.g. "country: US · employee_range: 11-50"). Pure. */
export function filtersLine(raw: string): string {
  if (!raw) return '';
  try {
    const x = JSON.parse(raw);
    if (!x || typeof x !== 'object' || Array.isArray(x)) return 'Not valid JSON';
    return Object.entries(x).filter(([, v]) => v !== null && v !== '' && !(Array.isArray(v) && !v.length)).map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(', ') : typeof v === 'object' ? JSON.stringify(v) : String(v)}`).join(' · ').slice(0, 700);
  } catch { return 'Not valid JSON'; }
}
const sheet = (u: string) => (/^https:\/\/docs\.google\.com\/spreadsheets\//.test(u) ? u : '');

export async function leadListDetail(at: HqAirtable, db: Db, cfg: Config, id: string, owner: boolean, canAct: boolean) {
  const rec = await at.get(LEAD_LISTS_T, id, LIST_READ);
  if (!rec) return null;
  const f = rec.fields;
  const l = listState(rec);
  const src = await cachedCampaigns(at, db);
  const ws = clientIndex(src.ws);
  const ref = ws.get(l.clients[0] ?? '');
  const names = new Map(src.campaigns.map((c) => [c.id, s(c.fields['fldSsb4QjS9UyvKhj'])]));
  const plans: PlanInfo[] = src.plans.filter((p) => p.leadListRec === id);
  const [history, activity] = await Promise.all([engineHistory(db, [id], plans), campaignActivity(at, { id: '', name: '', listIds: [id] }, owner).catch(() => [])]);
  const at1 = LIST_ORDER.indexOf(l.stage as (typeof LIST_ORDER)[number]);
  const pct = (v: unknown) => { const x = n(v); return x ? (x <= 1 ? Math.round(x * 1000) / 10 : x) : null; };
  return {
    list: {
      id, name: l.name, client: ref?.name ?? 'No client', clientKey: ref?.key ?? '', stage: l.stage || 'Not started', step: at1 < 0 ? 0 : at1 + 1, steps: LIST_ORDER.length, qa: l.qa,
      test: isTest(l.name), icp: l.icp, thesis: s(f[LX.thesis]).slice(0, 2000), persona: s(f[LX.personaDna]).slice(0, 1000), source: s(f[LX.contactSource]) || 'DiscoLike Contacts Run',
      filters: filtersLine(l.filters), hasFilters: !!l.filters, sampleSize: n(f[LX.sampleSize]) || 100, target: l.target, sampleApproved: l.sampleApproved, contactApproved: l.contactApproved,
      includeDirect: l.includeDirect, includeGeneric: l.includeGeneric, useLeadMagic: l.useLeadMagic, useDeepReview: yes(f[LX.useDeepReview]), customVars: l.customVars.slice(0, 3000),
      company: { total: l.companies, good: l.companyGood, bad: n(f[LX.companyBad]), rate: pct(f[LX.companyFitRate]), status: s(f[LX.companyStatus]), summary: s(f[LX.companySummary]).slice(0, 1500) },
      contact: { good: l.contactGood, bad: n(f[LX.contactBad]), rate: pct(f[LX.contactFitRate]), status: s(f[LX.contactStatus]), summary: s(f[LX.contactSummary]).slice(0, 1500) },
      verify: { good: n(f[LX.verifyGood]), risky: n(f[LX.verifyRisky]), bad: n(f[LX.verifyBad]) },
      final: { direct: n(f[LX.finalDirect]), generic: n(f[LX.finalGeneric]), leads: l.finalLeads },
      verifiers: [...new Set([s(f[LX.directVerifier]), s(f[LX.genericVerifier])].filter((x) => x && x !== 'None'))].join(' + '),
      tam: tamOf(s(f[LX.tamCheck])), sheet: sheet(s(f[LX.sheetLink])),
      campaigns: l.campaigns.map((c) => ({ id: c, name: names.get(c) ?? '' })),
      automation: { engineAction: l.engineAction, engineStatus: l.engineStatus, engineMessage: s(f[LX.engineMessage]).slice(0, 1500), processing: l.processing, workflowMessage: s(f[LX.workflowMessage]).slice(0, 800), error: s(f[LX.lastError]).slice(0, 800), locked: listLocked(l) },
      added: s(f[LX.added]) || rec.createdTime || '',
    },
    next: listNextStep(l),
    actions: listActions(l, canAct, cfg),
    history, activity, canAct, readAt: new Date().toISOString(),
  };
}

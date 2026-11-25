// Scribe writes a campaign's cold email copy (campaign creation part 2, Alex 2026-11-25:
// "copy writing is the most important thing").
//   1. Draft: Claude (Opus, high effort) with Scribe's full playbook (every SOP, the Source of
//      Truth, the copy reviews, real winning/losing copy with numbers), the client file, the
//      approved plan (thesis + 2 angles) and the client's real replies.
//   2. Check: hard rules in code (length, subject, links, banned phrases, variables, call ask) plus
//      a second Claude pass as Alex's copy reviewer, which fixes what it finds.
//   3. Write: the Campaign's (Review) copy fields (what Alex and the client read; Email 1 as
//      "Variant 1 / Variant 2", the Campaign Center's own split format) and the sequence fields
//      (so the Lead List QA can check every {VARIABLE}). Workflow Stage = Internal Review.
// Nothing is sent. Spintax is added after the client approves (existing spintax step).
import { z } from 'zod';
import type { Stage } from '../stages/index.js';
import { PermanentError } from '../errors.js';
import { createAirtableClient } from '../providers/airtable.js';
import { createClaude } from '../providers/claude.js';
import fs from 'node:fs';
import path from 'node:path';
import { readKnowledge, clientFileFor } from './knowledge.js';
import { EMAILS, EF, val } from './emailsFields.js';
import { FILTER_CLIENT_FIELDS } from '../airtable/bridge.js';
import { logActivity } from '../activity.js';
import type { PlanRow, PlanT } from './campaignPlan.js';

const CAMPAIGNS = 'tblAVAA6uBPaMj28P';
const PERF = 'skills/scribe-cold-email-copywriter/references/ingest/performance';
const slugOf = (x: string) => x.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
/** Every script we ran for this client, with its numbers (one file per client), capped to stay readable. */
export function scriptsFor(dir: string, client: string, max = 60_000): string {
  const c = slugOf(client); if (!c) return '';
  let files: string[] = [];
  try { files = fs.readdirSync(path.join(dir, PERF, 'scripts')).filter((f) => f.endsWith('.md') && f !== 'INDEX.md'); } catch { return ''; }
  const f = files.find((x) => x === `${c}.md`) ?? files.find((x) => x.startsWith(`${c}-`) || c.startsWith(x.replace(/\.md$/, '')));
  if (!f) return '';
  const t = readKnowledge(dir, `${PERF}/scripts/${f}`);
  return t.length > max ? `${t.slice(0, max)}\n\n[... more scripts in ${f}, cut for length]` : t;
}
const WORKSPACES = 'tblcjRBGJEWh5KgOt';
/** Campaign copy fields (Campaigns table). */
export const CC = {
  review: [
    { subject: 'fldZTtdvwRV53voZE', body: 'fldjnYRokcvObXphA' }, { subject: 'fldAikx1V83MsK3Ql', body: 'fldw7AQWalsiisKrM' },
    { subject: 'fldu2xpTQFuuyU71Q', body: 'fld6U4bB1335Ac5vM' }, { subject: 'fldFrZUqdTeydSTUV', body: 'fldJ8gNIksLd8WZ8t' },
  ],
  /** Sequence fields: [step][variant] (Campaign Subject N Version v / Campaign Body N Version v; step 4 subject is "Campaign Email 4 Subject"). */
  seq: [
    [{ subject: 'fldzT18PUxePQIYLJ', body: 'fldIX1lC9HGgbIaSh' }, { subject: 'fld7JbSeUeGRIErm6', body: 'fldGoEivHNQeokI0Z' }],
    [{ subject: 'fldj6TMQJYy0PxEko', body: 'fldRL9Q0XLFlJ9Mkn' }],
    [{ subject: 'fldhwjgXT5at1lZdE', body: 'fld2unmibesFQ2Sqc' }],
    [{ subject: 'fldlpfpmRywwxorso', body: 'fldLWnxQ1MJqzuJdw' }],
  ],
  variants: ['fldNIQxQkubt8LAT0', 'fld8zzSiQMwejvoZ4', 'fldpnrrUrJ8NPtxPC', 'fldT1Jw7wLftwkuGK'],
  thread: { 2: 'fldz66DfS1zAGHKcO', 3: 'fldUxqdktQwDc1OoC', 4: 'fld5UmGOG4X9EqHpL' } as Record<number, string>,
  workflow: 'fldOVJmlGWxW1dveo',
  submittedAt: 'fldTwdx8HHei9LeQp', autoApproveAt: 'fldC3vCiTcqhGaZrK', approvalSource: 'fldgHA5CcgM885Itp', exception: 'fld1vE0Exqlw7MMvq',
  clientFeedback: 'fldWJJEJYzKxyLwti', selectChanges: 'fldhKpDiiRjqMJ2o0', reviewFeedback: 'fldWeCXf5tCIwJMRd', additionalContext: 'fldkRCt0spCxZribv',
} as const;

// ---------- What Claude writes ----------
const Variant = z.object({
  angle: z.string().describe('Which of the plan\'s 2 angles this is'),
  subject: z.string().describe('1-3 words, no punctuation'),
  body: z.string().describe('The email body with {FIRST_NAME}/{COMPANY} variables, plain text, line breaks between sentences/paragraphs. No signature (added by the system).'),
});
export const Copy = z.object({
  email1: z.array(Variant).describe('Exactly 2: one per plan angle, same direction, testing the angle only'),
  followups: z.array(z.object({
    step: z.number().int().describe('2, 3 or 4'),
    purpose: z.string().describe('What this follow-up adds (clarify, proof, value). Same offer'),
    thread_reply: z.boolean().describe('true = sent as a reply in the same thread (no subject)'),
    subject: z.string().describe('Empty when thread_reply is true'),
    body: z.string(),
  })).describe('The cold follow-ups, steps 2 to 4'),
  claims: z.array(z.object({ claim: z.string(), source: z.string().describe('Where it comes from in the client facts given, or UNKNOWN') })).describe('Every factual claim in the copy and its source'),
  questions_for_alex: z.array(z.string()).describe('Only what blocks the copy (missing proof, unclear offer)'),
  notes: z.string().describe('One or two lines: why this copy, what the 2 angles test'),
});
export type CopyT = z.infer<typeof Copy>;
const Review = z.object({
  issues: z.array(z.string()).describe('Every rule broken or weakness, quoting the words. Empty if none'),
  copy: Copy.describe('The fixed copy (the same copy if nothing needed fixing)'),
});

// ---------- Hard rules, in code (the parts that can be checked exactly) ----------
export const words = (s: string) => s.replace(/\{[A-Z_]+\}/g, 'X').split(/\s+/).filter((w) => /[A-Za-z0-9]/.test(w)).length;
const BANNED: [RegExp, string][] = [
  [/https?:\/\/|www\.|\.com\b|\.io\b/i, 'a link (no links in cold copy)'],
  [/;/, 'a semicolon'],
  [/—|–/, 'an em/en dash (write " - ")'],
  [/this isn['’]t just/i, '"this isn\'t just"'],
  [/\b(?:i am|i'm|just) following up\b|\bfollowing up on\b/i, '"following up"'],
  [/\bjust checking in\b|\bcircling back\b|\bbumping this\b/i, 'a canned follow-up phrase'],
  [/hope (?:this|you)(?:'re| are)? ?(?:email )?finds? you/i, '"hope this finds you"'],
  [/\{[^{}]*\|[^{}]*\}/, 'spintax (added later, after the client approves)'],
];
const CALL_ASK = /\b(?:book (?:a|some) (?:call|time|meeting)|hop on a (?:quick )?call|(?:15|20|30)[- ]min(?:ute)?s?\b|calendar link|schedule a (?:call|meeting)|jump on a call|quick call|grab (?:a|some) time)/i;
/** Problems a human would bounce the copy for. `allowCall` = the plan says a call is the only logical next step. */
export function lintCopy(c: CopyT, opts: { variables?: string[]; allowCall?: boolean } = {}): string[] {
  const allowed = new Set(['FIRST_NAME', 'COMPANY', ...(opts.variables ?? [])]);
  const out: string[] = [];
  if (c.email1.length !== 2) out.push(`Email 1 has ${c.email1.length} variants (needs exactly 2 angles)`);
  const all = [...c.email1.map((v, i) => ({ label: `Email 1 variant ${i + 1}`, subject: v.subject, body: v.body, first: true, thread: false })),
    ...c.followups.map((f) => ({ label: `Email ${f.step}`, subject: f.subject, body: f.body, first: false, thread: f.thread_reply }))];
  for (const e of all) {
    const n = words(e.body);
    if (e.first && (n < 30 || n > 75)) out.push(`${e.label}: ${n} words (30-75)`);
    if (!e.first && n > 75) out.push(`${e.label}: ${n} words (keep follow-ups under 75)`);
    if (!e.thread) {
      const sw = e.subject.trim().split(/\s+/).filter(Boolean).length;
      if (sw < 1 || sw > 3) out.push(`${e.label}: subject "${e.subject}" is ${sw} words (1-3)`);
      if (/[^\w\s{}']/.test(e.subject.replace(/\{[A-Z_]+\}/g, ''))) out.push(`${e.label}: subject "${e.subject}" has punctuation`);
    }
    for (const [re, what] of BANNED) if (re.test(e.body) || re.test(e.subject)) out.push(`${e.label}: has ${what}`);
    for (const m of `${e.subject} ${e.body}`.matchAll(/\{([A-Za-z_ ]+)\}/g)) if (!allowed.has(m[1])) out.push(`${e.label}: unknown variable {${m[1]}}`);
    if (!opts.allowCall && CALL_ASK.test(e.body)) out.push(`${e.label}: asks for a call (cold sequence uses a low-friction one-word-reply ask)`);
  }
  const steps = c.followups.map((f) => f.step);
  if (steps.some((s) => s < 2 || s > 4) || new Set(steps).size !== steps.length) out.push(`Follow-up steps must be unique, 2-4 (got ${steps.join(', ')})`);
  return out;
}

// ---------- Airtable fields ----------
const withVariants = (vs: string[]) => vs.map((v, i) => `Variant ${i + 1}\n${v}`).join('\n\n');
/** The Campaign record update: review copy + sequence copy + variant counts + thread replies. */
export function copyFields(c: CopyT): Record<string, unknown> {
  const f: Record<string, unknown> = {
    [CC.review[0].subject]: c.email1.map((v, i) => `Variant ${i + 1}: ${v.subject}`).join('\n'),
    [CC.review[0].body]: withVariants(c.email1.map((v) => v.body)),
    [CC.variants[0]]: String(c.email1.length),
    [CC.workflow]: 'Internal Review',
  };
  c.email1.slice(0, 2).forEach((v, i) => { f[CC.seq[0][i].subject] = v.subject; f[CC.seq[0][i].body] = v.body; });
  for (const s of c.followups) {
    const k = s.step - 1;
    f[CC.review[k].subject] = s.thread_reply ? '' : s.subject; f[CC.review[k].body] = s.body;
    f[CC.seq[k][0].subject] = s.thread_reply ? '' : s.subject; f[CC.seq[k][0].body] = s.body;
    f[CC.variants[k]] = '1'; f[CC.thread[s.step]] = s.thread_reply;
  }
  return f;
}

/** How the copy reads in Slack for approval 2. */
export function copyText(c: CopyT): string {
  const e1 = c.email1.map((v, i) => `*Email 1 · Variant ${i + 1} (${v.angle})*\nSubject: ${v.subject}\n${v.body}`).join('\n\n');
  const fu = [...c.followups].sort((a, b) => a.step - b.step).map((f) => `*Email ${f.step}* (${f.thread_reply ? 'same thread' : `subject: ${f.subject}`}) · ${f.purpose}\n${f.body}`).join('\n\n');
  return `${e1}\n\n${fu}`;
}

const WRITER = `You are Scribe, Dulcy's cold email copywriter. Copy is the most important thing Dulcy does: write the best cold email this client has ever sent.
Follow Scribe's playbook below exactly; it is Alex's own SOPs, his Source of Truth, his copy reviews and the real results of past campaigns. RULES.md wins on any conflict.
Non-negotiables (Alex):
- One direction (the plan's thesis). Email 1 has exactly 2 variants, one per plan angle; they test the angle only (same offer, same audience), never word swaps.
- At least 1 strong proof, from THIS client's facts only. More proof only if just as strong. If no proof is given, do not invent one: say so in questions_for_alex.
- No call ask in the cold sequence unless the plan says it is the only logical next step. Default: a low-friction ask answerable in one word.
- Never invent results, numbers, customers, prices, guarantees or promises. Never use another client's facts. List every claim with its source.
- No signature, no P.S., no spintax: the system adds them later.`;
const REVIEWER = `You are Alex's copy reviewer at Dulcy. Review the draft below against Scribe's playbook and RULES.md like Alex would, line by line:
the hard rules (length, subject, one CTA, low-friction ask, no links, banned phrases, style), the truth (every claim backed by the client facts; nothing invented or borrowed),
the 2 angles (same direction, testing something that matters), and the send checks ("Why would I care? Why would I believe it? Why reply? Is the ask small? Could a scammer have sent this?").
List every issue, then return the fixed copy. Rewrite once; keep what already works.`;

export const scribeCopyStage: Stage = async (ctx) => {
  const cfg = ctx.cfg; const i = ctx.job.input as { planId: number; feedback?: string; round?: number };
  if (!cfg.airtableApiKey) throw new PermanentError('no AIRTABLE_API_KEY on the server');
  const at = createAirtableClient({ apiKey: cfg.airtableApiKey, baseId: cfg.airtableBaseId, baseUrl: cfg.airtableBaseUrl });
  const row = (await ctx.db.query('SELECT * FROM campaign_plans WHERE id=$1', [i.planId])).rows[0] as (PlanRow & { copy_state: string | null; copy_round: number; copy_feedback: string | null }) | undefined;
  if (!row?.plan || !row.campaign_rec) throw new PermanentError(`campaign plan ${i.planId} not found or not planned yet`);
  const plan = row.plan as PlanT;
  const feedback = i.feedback ?? row.copy_feedback ?? '';
  const round = i.round ?? row.copy_round ?? 1;
  const ws = await at.get(WORKSPACES, row.ws_rec, ['fld48x6Yg3v6RP30W', ...Object.keys(FILTER_CLIENT_FIELDS)]);
  const bisonId = Number(val((await at.list(WORKSPACES, `RECORD_ID()='${row.ws_rec}'`, ['ID'], 1, { byName: true }))[0]?.fields.ID)) || 0;
  const offer = Object.entries(FILTER_CLIENT_FIELDS).map(([id, label]) => (val(ws?.fields[id]) ? `${label}: ${val(ws?.fields[id])}` : '')).filter(Boolean).join('\n');
  const file = bisonId ? clientFileFor(cfg.knowledgeDir, bisonId) : null;
  const replies = bisonId ? await at.list(EMAILS, `AND({Workspace ID (Bison)}='${bisonId}',IS_AFTER({Latest Reply Time},DATEADD(NOW(),-180,'days')),{Latest Reply}!='')`, [EF.leadStatus, EF.latestReply, EF.company], 300) : [];
  const said = (re: RegExp, n: number) => replies.filter((r) => re.test(val(r.fields[EF.leadStatus]))).slice(0, n).map((r) => `- [${val(r.fields[EF.leadStatus])}] ${val(r.fields[EF.latestReply]).replace(/\s+/g, ' ').slice(0, 300)}`).join('\n');
  const k = (rel: string) => readKnowledge(cfg.knowledgeDir, rel);
  const playbook = [
    `# Scribe playbook\n${k('skills/scribe-cold-email-copywriter/references/playbook.md')}`,
    `# Real results across every campaign we ran (agency averages, A/B tests, patterns)\n${k(`${PERF}/analysis.md`)}`,
    `# The top 10 and bottom 10 campaigns, full copy\n${k(`${PERF}/top-bottom.md`)}`,
    `# Standing rules (newest wins)\n${k('rules/RULES.md')}\n${k('rules/client-promise-contract.md')}`,
    `# Recent learnings from creators and the market (claims, not benchmarks; rules and client facts win)\n${k('skills/scribe-cold-email-copywriter/references/creator-learnings.md')}`,
  ].join('\n\n---\n\n');
  const user = [
    `Client: ${row.client}. Campaign: ${plan.campaign_name}.`,
    `# The approved plan (approval 1, Alex)\nMove: ${plan.move}: ${plan.why_move}\nICP: ${plan.icp}\nWho: ${plan.persona}\nPain: ${plan.pain}\nDream outcome: ${plan.dream_outcome}\nProof: ${plan.proof}\nStructure: ${plan.structure}\nAngles:\n${plan.angles.map((a, n) => `${n + 1}. ${a.name} (tests ${a.tests}): ${a.hypothesis}`).join('\n')}\nObjections to answer early: ${plan.objections_to_preempt.join('; ') || 'none'}`,
    `# Offer (Airtable)\n${offer || 'UNKNOWN'}`,
    `# What this client's prospects actually said (last 180 days)\nInterested:\n${said(/interested|meeting|info/i, 20) || 'none'}\nObjections / not interested:\n${said(/objection|not interested/i, 15) || 'none'}`,
    feedback ? `# Feedback on the last version (client or Alex): fix all of it, keep what they did not mention\n${feedback}` : '',
    'Variables you may use: {FIRST_NAME}, {COMPANY}. Write the full sequence now.',
  ].filter(Boolean).join('\n\n');
  if (ctx.dryRun) return { message: `Would write the copy for ${plan.campaign_name} (dry run: Claude not called)` };
  const claude = createClaude({ apiKey: cfg.anthropicApiKey, model: cfg.claudeModel, baseURL: cfg.anthropicBaseUrl });
  const ran = scriptsFor(cfg.knowledgeDir, file?.name ?? row.client) || scriptsFor(cfg.knowledgeDir, row.client);
  const clientBlock = [file ? `# Client file: ${file.name}\n${file.text}` : 'No client file in the repo: use only the Airtable offer and the plan.',
    ran ? `# Every script we already ran for THIS client, with results (build on what worked, don't repeat what failed; re-sent copy fatigues)\n${ran}` : '# No past scripts for this client.'].join('\n\n');
  const draft = await ctx.paid({ callKey: `scribe-draft:${row.id}:${round}`, provider: 'anthropic', units: 1, scope: 'record',
    run: () => claude.structured(Copy, [WRITER, playbook], clientBlock, user, 'high'), dryRunResult: () => ({}) as CopyT });
  const lint1 = lintCopy(draft, { allowCall: /only logical next step/i.test(plan.why_move) });
  const reviewed = await ctx.paid({ callKey: `scribe-review:${row.id}:${round}`, provider: 'anthropic', units: 1, scope: 'record',
    run: () => claude.structured(Review, [REVIEWER, playbook], clientBlock,
      `${user}\n\n# Draft to review\n${JSON.stringify(draft, null, 1)}\n\n# Rule checks the code found (must be fixed)\n${lint1.join('\n') || 'none'}`, 'high'),
    dryRunResult: () => ({ issues: [], copy: draft }) });
  const copy = reviewed.copy; copy.email1 = copy.email1.slice(0, 2);
  const left = lintCopy(copy, { allowCall: /only logical next step/i.test(plan.why_move) });
  await ctx.step(`write:${round}`, () => at.update(CAMPAIGNS, row.campaign_rec!, copyFields(copy)));
  await ctx.db.query(`UPDATE campaign_plans SET copy=$2, copy_state='ready', copy_issues=$3, updated_at=now() WHERE id=$1`, [row.id, JSON.stringify(copy), JSON.stringify({ reviewer: reviewed.issues, left })]);
  await logActivity(cfg, { event: `Copy written: ${plan.campaign_name}`, type: 'Step done', agent: 'Scribe', details: `${copyText(copy)}\n\nReviewer fixed: ${reviewed.issues.join(' · ') || 'nothing'}${left.length ? `\nStill flagged: ${left.join(' · ')}` : ''}`, campaignRecordIds: [row.campaign_rec], jobId: ctx.job.id }, at);
  return { message: `Copy written for ${plan.campaign_name} (round ${round}): ${reviewed.issues.length} fixed by review${left.length ? `, ${left.length} still flagged` : ', all rule checks pass'}`, left };
};

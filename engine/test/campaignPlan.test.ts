// Campaign creation part 1: the SOP move rules, the records Atlas fills, and the whole pipeline
// (trigger → plan → filters → first-100 sample → approval 1 → ✅ expand) against fake Airtable + Claude.
import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createPool, migrate, type Db } from '../src/db/pool.js';
import { loadConfig, type Config } from '../src/config.js';
import { enqueue, getJob } from '../src/queue.js';
import { runOnce } from '../src/worker.js';
import { recommendMove, leadListFields, approvalText, CP, type CampaignStat, type PlanT } from '../src/agents/campaignPlan.js';
import { LEAD_LISTS, F } from '../src/airtable/bridge.js';
import { CAMPAIGNS, LL } from '../src/airtable/campaignBuild.js';
import { DECISIONS, DF } from '../src/decisions/fields.js';
import { lintCopy, copyFields, words, CC, type CopyT } from '../src/agents/scribe.js';
import { addWeekdayHours } from '../src/agents/campaignPlan.js';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const url = process.env.TEST_DATABASE_URL;
const skip = !url ? 'TEST_DATABASE_URL not set' : false;

const stat = (client: string, sent: number, interested: number, over: Partial<CampaignStat> = {}): CampaignStat =>
  ({ id: `c${client}${sent}`, name: 'x', client, sent, interested, progress: 0.5, status: 'Active', canNewOffer: true, ...over });
// Agency average across all: (10+20)/(1000+2000) = 1.00% per email.
const others = [stat('B', 2000, 20)];

test('SOP move: ≥70% of the agency rate = top off; 60–70% = flagged top off; below = new vertical; locked in = new offer or copy test', () => {
  const at = (interested: number, locked = false) => { const own = [stat('A', 1000, interested)]; return recommendMove(own, [...own, ...others], locked); };
  assert.equal(at(10).move, 'top_off');
  assert.doesNotMatch(at(10).why, /FLAGGED/);
  const flagged = recommendMove([stat('A', 1000, 6.5)], [stat('A', 1000, 6.5), stat('B', 2000, 23.5)]);
  assert.equal(flagged.move, 'top_off'); assert.match(flagged.why, /FLAGGED/);
  assert.equal(recommendMove([stat('A', 1000, 5)], [stat('A', 1000, 5), stat('B', 2000, 25)]).move, 'new_vertical');
  assert.equal(recommendMove([stat('A', 1000, 5)], [stat('A', 1000, 5), stat('B', 2000, 25)], true).move, 'new_offer_or_copy_test');
  assert.equal(recommendMove([stat('A', 400, 4)], [stat('A', 400, 4), ...others]).move, 'first_campaign', 'under 500 sent is too early to judge');
  assert.match(at(10).why, /client 1\.00% interested per email vs agency 1\.00%/);
});

const PLAN: PlanT = {
  move: 'top_off', why_move: 'At the agency average (1.00% vs 1.00%).', campaign_name: '[Acme] US Roofers, 11-50 Empl - DiscoLike (Missed Calls)',
  icp: 'US roofing companies, 11-50 staff', targeting: 'US roofing contractors with 11-50 employees; exclude franchises', persona: 'Owners, founders, GMs; cut office staff',
  pain: 'Missed calls lose jobs', dream_outcome: 'More booked jobs', proof: 'UNKNOWN: ask Alex for proof', structure: 'Question → Proof → CTA',
  angles: [{ name: 'Missed calls', tests: 'pain point', hypothesis: 'Owners feel lost calls' }, { name: 'Speed to lead', tests: 'solution angle', hypothesis: 'Fast replies win' }, { name: 'extra', tests: 'USP', hypothesis: 'dropped' }],
  objections_to_preempt: ['Already have a receptionist'], lead_goal: 2000, questions_for_alex: ['Which client result can we use as proof?'],
};

test('Lead List fields: same fields as the Lead List Center screen, first 100 sample, Generate Filters pressed', () => {
  const f = leadListFields(PLAN, 'recW', 'recC');
  assert.equal(f[F.name], PLAN.campaign_name);
  assert.deepEqual(f[F.client], ['recW']); assert.deepEqual(f[LL.whichCampaign], ['recC']);
  assert.equal(f[F.icp], PLAN.targeting); assert.equal(f[F.sampleSize], 100); assert.equal(f[F.expansionTarget], 500);
  assert.equal(f[F.runsOnEngine], true); assert.equal(f[F.engineAction], 'Generate Filters');
  assert.match(String(f[F.thesis]), /Angles to test in Email 1:\n1\. Missed calls \(tests pain point\)/);
});

test('Approval 1 text: the plan, the sample result and the questions', () => {
  const a = approvalText(PLAN, { good: 81, bad: 19, fitRate: '81%', summary: 'Mostly roofers', sheet: 'https://sheet' });
  assert.match(a.title, /Approve campaign plan: \[Acme\]/);
  assert.match(a.checked, /First 100 companies: 81 fit, 19 not \(81%\)\.\nMostly roofers\nSample sheet: https:\/\/sheet/);
  assert.match(a.checked, /Questions for you: Which client result/);
  assert.match(a.fix, /❌ = stop here; nothing more is spent/);
});

const B1 = 'Hi {FIRST_NAME},\n\nMost roofers in your area lose a job every time a call goes to voicemail after 5pm.\n\nWe set up a system that answers and books those calls for {COMPANY} within a minute, so no lead goes cold.\n\nWorth a look?';
const B2 = 'Hi {FIRST_NAME},\n\nWhen a homeowner calls three roofers, the first one to answer usually gets the job.\n\nWe help {COMPANY} answer every call in under a minute, day or night, without hiring another person for the phones.\n\nOpen to seeing how?';
const COPY: CopyT = {
  email1: [{ angle: 'Missed calls', subject: 'missed calls', body: B1 }, { angle: 'Speed to lead', subject: 'first to answer', body: B2 }],
  followups: [
    { step: 2, purpose: 'clarify', thread_reply: true, subject: '', body: 'Hi {FIRST_NAME}, the short version: every call to {COMPANY} gets answered and booked, even at night. Want the details?' },
    { step: 3, purpose: 'value', thread_reply: true, subject: '', body: 'Last one from me, {FIRST_NAME}. If missed calls are not a problem at {COMPANY}, no worries at all. If they are, reply yes and I will send the details.' },
  ],
  custom_variables: [], claims: [{ claim: 'answers in under a minute', source: 'offer' }], questions_for_alex: [], notes: 'Tests pain (missed calls) vs solution (speed).',
};

test('Scribe rule checks: clean copy passes; length, links, call ask, subject, spintax, unknown variables and the 2-angle rule are caught', () => {
  assert.deepEqual(lintCopy(COPY), []);
  assert.ok(words(B1) >= 30 && words(B1) <= 75);
  const bad: CopyT = { ...COPY, email1: [{ angle: 'a', subject: 'Quick question for you?', body: 'Hi {FIRST_NAME}, see https://x.com; want to book a call? {Hi|Hello} {CITY}' }], followups: [{ ...COPY.followups[0], body: 'Just following up on my last note.' }] };
  const p = lintCopy(bad).join('\n');
  for (const re of [/needs exactly 2 angles/, /words \(30-75\)/, /subject "Quick question for you\?" is 4 words/, /has punctuation/, /a link/, /a semicolon/, /spintax/, /unknown variable \{CITY\}/, /asks for a call/, /Email 2: has "following up"/]) assert.match(p, re);
  assert.deepEqual(lintCopy({ ...bad, email1: COPY.email1, followups: [] }, { allowCall: true, variables: ['CITY'] }), [], 'call ask allowed when it is the only logical step; custom variables when the list has them');
});

test('Scribe writes the Campaign Center format: Email 1 as Variant 1 / Variant 2, sequence fields, thread replies, Internal Review', () => {
  const f = copyFields(COPY);
  assert.equal(f[CC.review[0].subject], 'Variant 1: missed calls\nVariant 2: first to answer');
  assert.match(String(f[CC.review[0].body]), /^Variant 1\nHi \{FIRST_NAME\},[\s\S]*\n\nVariant 2\nHi \{FIRST_NAME\},/);
  assert.equal(f[CC.seq[0][1].body], B2); assert.equal(f[CC.variants[0]], '2');
  assert.equal(f[CC.thread[2]], true); assert.equal(f[CC.seq[1][0].subject], ''); assert.equal(f[CC.workflow], 'Internal Review');
  assert.equal(f[CC.seq[3][0].body], undefined, 'no step 4 written when Scribe wrote 3 emails');
});

test('Client review clock: 48 weekday hours (Friday noon → Tuesday noon)', () => {
  assert.equal(addWeekdayHours(new Date('2026-11-27T12:00:00Z'), 48).toISOString(), '2026-12-01T12:00:00.000Z');
});

// ---------- End to end ----------
let db: Db, server: http.Server, base = '';
let tables: Record<string, Record<string, Record<string, unknown>>> = {};
let claudeAnswers: unknown[] = []; let claudeCalls: any[] = [];
const WS = 'tblcjRBGJEWh5KgOt';
before(async () => {
  server = http.createServer((req, res) => {
    let raw = ''; req.on('data', (c) => (raw += c));
    req.on('end', () => {
      res.setHeader('content-type', 'application/json');
      const u = new URL(req.url ?? '/', 'http://x');
      if (u.pathname.startsWith('/c/')) {
        claudeCalls.push(JSON.parse(raw));
        return res.end(JSON.stringify({ id: 'msg', type: 'message', role: 'assistant', model: 'claude-opus-5-5', content: [{ type: 'text', text: JSON.stringify(claudeAnswers.shift()) }], stop_reason: 'end_turn', stop_details: null, usage: { input_tokens: 1, output_tokens: 1 } }));
      }
      if (u.pathname.startsWith('/a/')) {
        const table = u.pathname.split('/')[4]; const rows = (tables[table] ??= {});
        if (req.method === 'GET') {
          const f = u.searchParams.get('filterByFormula') ?? '';
          const id = /RECORD_ID\(\)='(rec\w+)'/.exec(f)?.[1];
          const name = /\{Name\}='((?:\\'|[^'])*)'/.exec(f)?.[1]?.replace(/\\'/g, "'");
          const list = Object.entries(rows).filter(([rid, r]) => (!id || rid === id) && (name === undefined || r[CP.name] === name));
          return res.end(JSON.stringify({ records: list.map(([rid, fields]) => ({ id: rid, fields })) }));
        }
        const b = JSON.parse(raw || '{}');
        return res.end(JSON.stringify({ records: (b.records ?? []).map((r: any) => {
          if (req.method === 'PATCH') { Object.assign((rows[r.id] ??= {}), r.fields); return r; }
          const rid = `recNew${String(Object.keys(rows).length).padStart(11, '0')}`; rows[rid] = { ...r.fields }; return { id: rid, fields: r.fields };
        }) }));
      }
      res.statusCode = 404; res.end('{}');
    });
  });
  await new Promise<void>((r) => server.listen(0, r));
  base = `http://127.0.0.1:${(server.address() as any).port}`;
  if (!skip) { db = createPool(url!); await migrate(db); }
});
after(async () => { server.close(); if (!skip) await db.end(); });
beforeEach(async () => {
  tables = {}; claudeAnswers = []; claudeCalls = [];
  if (!skip) await db.query('TRUNCATE jobs, steps, receipts, events, campaign_plans RESTART IDENTITY CASCADE');
});
function cfg(stage: string): Config {
  return { ...loadConfig({ ENGINE_SECRET: 'x'.repeat(40), DATABASE_URL: url ?? 'postgres://x' } as NodeJS.ProcessEnv),
    dryRun: false, liveStages: [stage], knowledgeDir: REPO, anthropicApiKey: 'sk-test', anthropicBaseUrl: `${base}/c`, airtableApiKey: 'at', airtableBaseUrl: `${base}/a` };
}
let n = 0;
async function run(kind: string, input: Record<string, unknown> = {}) {
  const c = cfg(kind);
  const q = await enqueue(db, { kind, recordId: `${kind.replace('.', '-')}-${++n}`, input, dryRun: false, maxAttempts: 1, deadlineMs: 60_000 });
  for (let i = 0; i < 10; i++) { await runOnce(db, c); const j = await getJob(db, q.job.id); if (['succeeded', 'failed', 'needs_review'].includes(j!.job.status)) return j!; }
  throw new Error('job did not settle');
}
/** What the Lead List bridge does after it runs a button: clear the action, write the job and its status. */
async function bridgeDone(listRec: string, kind: string, extra: Record<string, unknown> = {}) {
  const q = await enqueue(db, { kind, recordId: `fake-${kind}-${++n}`, input: {}, dryRun: false, maxAttempts: 1, deadlineMs: 60_000 });
  await db.query(`UPDATE jobs SET status='succeeded' WHERE id=$1`, [q.job.id]);
  Object.assign(tables[LEAD_LISTS][listRec], { [F.engineAction]: null, [F.engineStatus]: 'Done', [F.engineJobId]: String(q.job.id), ...extra });
}

test('Campaign creation end to end: 60% trigger → Atlas plan → filters → sample → approval 1 → ✅ expand; nothing sent', { skip }, async () => {
  tables[WS] = { recW0000000000001: { Name: 'Acme', fld48x6Yg3v6RP30W: 'Acme', ID: 7, Status: 'Active', 'Client Type': 'Paying Client' } };
  tables[CAMPAIGNS] = {
    recC0000000000001: { [CP.name]: 'Acme Roofers v1', [CP.client]: ['recW0000000000001'], [CP.sent]: 1000, [CP.interested]: 10, [CP.progress]: 65, [CP.status]: 'Active' },
    recC0000000000002: { [CP.name]: 'Other', [CP.client]: ['recX0000000000001'], [CP.sent]: 2000, [CP.interested]: 20, [CP.progress]: 30, [CP.status]: 'Active' },
  };

  // 1. The pipeline sees Acme's campaign past 60% and opens one plan (and only one, on later runs).
  const p1 = await run('campaign.pipeline');
  assert.equal(p1.job.status, 'succeeded', p1.job.error ?? '');
  assert.match(String(p1.job.result.message), /plan 1 started for Acme \(next:recC0000000000001\)/);
  await run('campaign.pipeline');
  assert.equal((await db.query('SELECT count(*)::int AS n FROM campaign_plans')).rows[0].n, 1, 'same trigger never opens a second plan');

  // 2. Atlas writes the plan: Campaign + Lead List records, Generate Filters pressed.
  claudeAnswers = [PLAN];
  const a = await run('atlas.plan', { planId: 1 });
  assert.equal(a.job.status, 'succeeded', a.job.error ?? '');
  assert.match(claudeCalls[0].system.map((s: any) => s.text).join('\n'), /Next campaign/i, 'Atlas reads the next-campaign rules');
  assert.match(JSON.stringify(claudeCalls[0].messages), /Recommended move \(Alex's SOP, computed\): top_off/);
  const [campRec, camp] = Object.entries(tables[CAMPAIGNS]).find(([, r]) => r[CP.name] === PLAN.campaign_name)!;
  assert.match(String(camp[CP.thesis]), /Move: top off/);
  const [listRec, list] = Object.entries(tables[LEAD_LISTS])[0];
  assert.equal(list[F.engineAction], 'Generate Filters'); assert.deepEqual(list[LL.whichCampaign], [campRec]);
  const plan = (await db.query('SELECT * FROM campaign_plans WHERE id=1')).rows[0];
  assert.equal(plan.state, 'filters'); assert.equal(plan.plan.angles.length, 2, 'only 2 angles kept');

  // 3. Filters done → the pipeline presses Run Company Sample.
  await bridgeDone(listRec, 'leadlist.filters');
  await run('campaign.pipeline');
  assert.equal(tables[LEAD_LISTS][listRec][F.engineAction], 'Run Company Sample');
  assert.equal((await db.query('SELECT state FROM campaign_plans WHERE id=1')).rows[0].state, 'sample');

  // 4. Sample done → approval 1 goes to Decisions (Slack ✅/❌).
  await bridgeDone(listRec, 'leadlist.sample', { [F.companyGood]: 81, [F.companyBad]: 19, [F.companyFitRate]: '81%' });
  await run('campaign.pipeline');
  const dec = Object.values(tables[DECISIONS] ?? {})[0];
  assert.equal(dec[DF.action], 'Approve Campaign Plan'); assert.equal(dec[DF.agent], 'Atlas'); assert.equal(dec[DF.status], 'New');
  assert.deepEqual(JSON.parse(String(dec[DF.actionInput])), { planId: 1 });
  assert.match(String(dec[DF.checked]), /First 100 companies: 81 fit, 19 not \(81%\)/);
  assert.equal((await db.query('SELECT state FROM campaign_plans WHERE id=1')).rows[0].state, 'approval1');

  // 5. ✅ → sample approved, Expand Companies pressed, Scribe queued.
  const ok = await run('campaign.plan_approved', { planId: 1 });
  assert.equal(ok.job.status, 'succeeded', ok.job.error ?? '');
  assert.equal(tables[LEAD_LISTS][listRec][F.sampleApproved], true);
  assert.equal(tables[LEAD_LISTS][listRec][F.engineAction], 'Expand Companies');
  const st = async () => (await db.query('SELECT state, copy_state, copy_round FROM campaign_plans WHERE id=1')).rows[0];
  assert.deepEqual(await st(), { state: 'expand', copy_state: 'queued', copy_round: 1 });

  // 6. Scribe drafts, the reviewer pass fixes, the copy lands on the Campaign.
  claudeAnswers = [COPY, { issues: ['Email 3 was too long'], copy: COPY }];
  const sc = await run('scribe.copy', { planId: 1 });
  assert.equal(sc.job.status, 'succeeded', sc.job.error ?? '');
  assert.match(String(sc.job.result.message), /1 fixed by review, all rule checks pass/);
  const sys = claudeCalls[1].system.map((b: any) => b.text).join('\n');
  assert.match(sys, /Scribe playbook/); assert.match(sys, /Standing rules/);
  assert.match(JSON.stringify(claudeCalls[1].messages), /Missed calls \(tests pain point\)/, 'Scribe writes from the approved plan');
  assert.match(JSON.stringify(claudeCalls[2].messages), /Draft to review/);
  assert.equal(tables[CAMPAIGNS][campRec][CC.workflow], 'Internal Review');
  assert.equal(tables[CAMPAIGNS][campRec][CC.seq[0][0].body], B1);
  assert.equal((await st()).copy_state, 'ready');

  // 7. The list path: contacts sample (85% usable → continues by itself), all contacts, verify, skip enrichment, QA.
  await bridgeDone(listRec, 'leadlist.expand'); await run('campaign.pipeline');
  assert.equal(tables[LEAD_LISTS][listRec][F.engineAction], 'Find Contacts');
  await bridgeDone(listRec, 'leadlist.contacts', { [F.contactFitRate]: '85%' }); await run('campaign.pipeline');
  assert.equal(tables[LEAD_LISTS][listRec][F.contactApproved], true); assert.equal(tables[LEAD_LISTS][listRec][F.engineAction], 'Find Contacts');
  await bridgeDone(listRec, 'leadlist.contacts'); await run('campaign.pipeline');
  assert.equal(tables[LEAD_LISTS][listRec][F.engineAction], 'Verify and Finalize');
  await bridgeDone(listRec, 'leadlist.verify', { [F.leads]: 2400, [F.finalDirect]: 2000, [F.finalGeneric]: 400, [F.verifyGood]: 2300, [F.verifyRisky]: 100 }); await run('campaign.pipeline');
  assert.equal(tables[LEAD_LISTS][listRec][F.engineAction], 'Skip Enrichment');
  await bridgeDone(listRec, 'leadlist.skipenrich'); await run('campaign.pipeline');
  assert.equal(tables[LEAD_LISTS][listRec][F.engineAction], 'Run Automated QA');
  await bridgeDone(listRec, 'leadlist.qa'); await run('campaign.pipeline');

  // 8. Approval 2: copy + list in Slack.
  const dec2 = Object.values(tables[DECISIONS]).find((d) => d[DF.action] === 'Approve Campaign Copy')!;
  assert.equal(dec2[DF.agent], 'Scribe');
  assert.match(String(dec2[DF.checked]), /List: 2400 leads \(2000 direct, 400 generic; 2300 good, 100 risky emails\)\. QA passed\./);
  assert.match(String(dec2[DF.checked]), /\*Email 1 · Variant 2 \(Speed to lead\)\*\nSubject: first to answer/);
  assert.equal((await st()).state, 'approval2');

  // 9. ✅ → Client Review in the portal with the 48-hour clock.
  const ca = await run('campaign.copy_approved', { planId: 1 });
  assert.equal(ca.job.status, 'succeeded', ca.job.error ?? '');
  const camp2 = tables[CAMPAIGNS][campRec];
  assert.equal(camp2[CC.workflow], 'Client Review'); assert.equal(camp2[CC.approvalSource], '');
  assert.ok(new Date(String(camp2[CC.autoApproveAt])).getTime() - new Date(String(camp2[CC.submittedAt])).getTime() >= 48 * 3600_000);

  // 10. Client asks for copy changes in the portal → Scribe rewrites with the notes → approval 2 again.
  Object.assign(camp2, { [CC.workflow]: 'Changes Requested', [CC.clientFeedback]: ['Request Changes'], [CC.selectChanges]: ['Copy'], [CC.reviewFeedback]: ['Mention we work with roofers in Texas'] });
  await run('campaign.pipeline');
  assert.deepEqual(await st(), { state: 'approval2_wait', copy_state: 'queued', copy_round: 2 });
  claudeAnswers = [COPY, { issues: [], copy: COPY }];
  await run('scribe.copy', { planId: 1 });
  assert.match(JSON.stringify(claudeCalls[3].messages), /Mention we work with roofers in Texas/);
  await run('campaign.pipeline');
  assert.equal(Object.values(tables[DECISIONS]).filter((d) => d[DF.action] === 'Approve Campaign Copy').length, 2);
  await run('campaign.copy_approved', { planId: 1 });

  // 11. Client approves (or 48h auto-approve) → client_approved (build + launch is part 3).
  Object.assign(tables[CAMPAIGNS][campRec], { [CC.workflow]: 'Approved', [CC.approvalSource]: 'Auto-approved after 48 business hours' });
  const fin = await run('campaign.pipeline');
  assert.match(String(fin.job.result.message), /client approved \(Auto-approved after 48 business hours\)/);
  assert.equal((await st()).state, 'client_approved');
  assert.equal(claudeCalls.length, 5, 'plan 1 + copy 2 rounds × (draft + review)');
});

test('Copy with a custom variable: the list is enriched for it (Prepare Enrichment Prompt → Run Enrichment → QA)', { skip }, async () => {
  const withVar: CopyT = { ...COPY, custom_variables: [{ name: 'KEYWORD', find: 'the main product category they sell, 1-3 words, lowercase', fallback: 'your products' }],
    email1: COPY.email1.map((v) => ({ ...v, body: v.body.replace('Most roofers', 'Most {KEYWORD} brands') })) };
  assert.deepEqual(lintCopy(withVar), [], 'a declared custom variable is allowed');
  tables[LEAD_LISTS] = { recL0000000000001: {} };
  await db.query(`INSERT INTO campaign_plans (trigger_key, ws_rec, client, state, lead_list_rec, campaign_rec, plan, copy, copy_state) VALUES ('new:a','recW0000000000001','Acme','verify','recL0000000000001','recC0000000000001',$1,$2,'ready')`, [JSON.stringify(PLAN), JSON.stringify(withVar)]);
  await bridgeDone('recL0000000000001', 'leadlist.verify'); await run('campaign.pipeline');
  const ll = tables[LEAD_LISTS].recL0000000000001;
  assert.equal(ll[F.engineAction], 'Prepare Enrichment Prompt');
  assert.equal(ll.fldTYRjTrpVW27tmG, 'Column name: KEYWORD. Scope: company. Find: the main product category they sell, 1-3 words, lowercase. If not found, use exactly: "your products".');
  await bridgeDone('recL0000000000001', 'leadlist.enrichprompt'); await run('campaign.pipeline');
  assert.equal(ll[F.engineAction], 'Run Enrichment');
  await bridgeDone('recL0000000000001', 'leadlist.enrich'); await run('campaign.pipeline');
  assert.equal(ll[F.engineAction], 'Run Automated QA');
  assert.equal((await db.query('SELECT state FROM campaign_plans WHERE id=1')).rows[0].state, 'qa');
});

test('A failed planning job sets the plan aside (stops blocking) and a retry reuses the Campaign it already made', { skip }, async () => {
  tables[CAMPAIGNS] = { recC0000000000009: { [CP.name]: PLAN.campaign_name, [CP.client]: ['recW0000000000001'] } };
  await db.query(`INSERT INTO campaign_plans (trigger_key, ws_rec, client, state) VALUES ('new:x','recW0000000000001','Acme','planning')`);
  const q = await enqueue(db, { kind: 'atlas.plan', recordId: 'atlas-plan-1', input: { planId: 1 }, dryRun: false, maxAttempts: 1, deadlineMs: 60_000 });
  await db.query(`UPDATE jobs SET status='failed', error='Airtable refused the request: HTTP 422' WHERE id=$1`, [q.job.id]);
  const p = await run('campaign.pipeline');
  assert.match(String(p.job.result.message), /plan 1: planning failed, set aside/);
  assert.equal((await db.query('SELECT state FROM campaign_plans WHERE id=1')).rows[0].state, 'stuck');
  await db.query(`UPDATE campaign_plans SET state='planning', plan_round=plan_round+1 WHERE id=1`); // campaign-plan-retry
  tables[WS] = { recW0000000000001: { Name: 'Acme', fld48x6Yg3v6RP30W: 'Acme', ID: 7 } };
  claudeAnswers = [PLAN];
  const a = await run('atlas.plan', { planId: 1 });
  assert.equal(a.job.status, 'succeeded', a.job.error ?? '');
  assert.equal(Object.keys(tables[CAMPAIGNS]).length, 1, 'no second Campaign record');
  assert.deepEqual(Object.values(tables[LEAD_LISTS])[0][LL.whichCampaign], ['recC0000000000009']);
  assert.equal(Object.values(tables[LEAD_LISTS])[0][F.engineActionSetAt], undefined, 'never writes the computed Set At field');
});

test('Low contact sample asks Alex; ❌ on approval 1 stops the plan', { skip }, async () => {
  tables[LEAD_LISTS] = { recL0000000000001: { [F.engineStatus]: 'Done' }, recL0000000000002: {} };
  await db.query(`INSERT INTO campaign_plans (trigger_key, ws_rec, client, state, lead_list_rec, campaign_rec, plan) VALUES ('new:a','recW0000000000001','Acme','contacts_sample','recL0000000000001','recC0000000000001',$1), ('new:b','recW0000000000001','Acme','approval1','recL0000000000002','recC0000000000001',$1)`, [JSON.stringify(PLAN)]);
  tables[DECISIONS] = { recD0000000000001: { [DF.status]: 'Rejected' } };
  await db.query(`UPDATE campaign_plans SET decision_rec='recD0000000000001' WHERE id=2`);
  await bridgeDone('recL0000000000001', 'leadlist.contacts', { [F.contactFitRate]: '52%' });
  await run('campaign.pipeline');
  const rows = (await db.query('SELECT state FROM campaign_plans ORDER BY id')).rows.map((r) => r.state);
  assert.deepEqual(rows, ['approval_contacts', 'rejected']);
  const ask = Object.values(tables[DECISIONS]).find((d) => d[DF.action] === 'Approve Contact Sample')!;
  assert.match(String(ask[DF.issue]), /Only 52% of the sample contacts are usable \(needs 70%\)/);
  const ok = await run('campaign.contacts_approved', { planId: 1 });
  assert.equal(ok.job.status, 'succeeded', ok.job.error ?? '');
  assert.equal(tables[LEAD_LISTS].recL0000000000001[F.contactApproved], true);
});

test('A failed Lead List step stops the plan (stuck) and posts nothing', { skip }, async () => {
  tables[WS] = { recW0000000000001: { Name: 'Acme', fld48x6Yg3v6RP30W: 'Acme', ID: 7 } };
  tables[LEAD_LISTS] = { recL0000000000001: { [F.engineStatus]: 'Failed' } };
  await db.query(`INSERT INTO campaign_plans (trigger_key, ws_rec, client, state, lead_list_rec, plan) VALUES ('new:recW0000000000001','recW0000000000001','Acme','filters','recL0000000000001',$1)`, [JSON.stringify(PLAN)]);
  const p = await run('campaign.pipeline');
  assert.match(String(p.job.result.message), /plan 1: step Failed, stopped/);
  assert.equal((await db.query('SELECT state FROM campaign_plans WHERE id=1')).rows[0].state, 'stuck');
  assert.equal(tables[DECISIONS], undefined);
});

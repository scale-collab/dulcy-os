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
          const list = Object.entries(rows).filter(([rid]) => !id || rid === id);
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

  // 5. ✅ → sample approved, Expand Companies pressed.
  const ok = await run('campaign.plan_approved', { planId: 1 });
  assert.equal(ok.job.status, 'succeeded', ok.job.error ?? '');
  assert.equal(tables[LEAD_LISTS][listRec][F.sampleApproved], true);
  assert.equal(tables[LEAD_LISTS][listRec][F.engineAction], 'Expand Companies');
  assert.equal((await db.query('SELECT state FROM campaign_plans WHERE id=1')).rows[0].state, 'approved');
  assert.equal(claudeCalls.length, 1, 'one Claude call for the whole plan');
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

// Riley n8n fixes through the n8n API (Alex 2026-11-27): ✅ on an "n8n change" with an exact
// n8nPatch → the engine checks the old values, saves the full previous workflow, PUTs the new one,
// re-activates it. A fake n8n server and a fake Airtable; nothing live is called.
import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { createPool, migrate, type Db } from '../src/db/pool.js';
import { loadConfig, type Config } from '../src/config.js';
import { enqueue, getJob } from '../src/queue.js';
import { runOnce } from '../src/worker.js';
import { ISSUES, IF } from '../src/agents/riley.js';
import { findN8nPatch, planN8nPatch, rollbackN8nFix, validateN8nPatch, putBody } from '../src/agents/rileyN8n.js';

const url = process.env.TEST_DATABASE_URL;
const skip = !url ? 'TEST_DATABASE_URL not set' : false;
const ISSUE = 'recIssue000000001';

function workflow() {
  return {
    id: 'wfPlace1', name: '[Inbox Placement Tests] Check Results', active: true, isArchived: false, versionId: 'v1', tags: [], shared: [{ role: 'owner' }],
    settings: { executionOrder: 'v1', timezone: 'America/New_York', availableInMCP: true },
    staticData: { node: { lastRun: 5 } },
    connections: { Schedule: { main: [[{ node: 'Check', type: 'main', index: 0 }]] } },
    nodes: [
      { id: 'n1', name: 'Schedule', type: 'n8n-nodes-base.scheduleTrigger', parameters: { rule: { interval: [{ field: 'minutes', minutesInterval: 1 }] } } },
      { id: 'n2', name: 'Check', type: 'n8n-nodes-base.httpRequest', parameters: { url: 'https://api.example.com/x', authentication: 'genericCredentialType',
        headerParameters: { parameters: [{ name: 'Authorization', value: '={{ $env.X }}' }, { name: 'Accept', value: 'json' }] } },
        credentials: { httpHeaderAuth: { id: 'c1', name: 'Some Key' } } },
    ],
  };
}

let db: Db, server: http.Server, base = '';
let tables: Record<string, Record<string, Record<string, unknown>>> = {};
let wfs: Record<string, any> = {};
let calls: { method: string; path: string; body?: any }[] = [];
let failPut = 0;
before(async () => {
  server = http.createServer((req, res) => {
    let raw = ''; req.on('data', (c) => (raw += c));
    req.on('end', () => {
      res.setHeader('content-type', 'application/json');
      const u = new URL(req.url ?? '/', 'http://x');
      if (u.pathname.startsWith('/n8n/api/v1/workflows/')) {
        assert.equal(req.headers['x-n8n-api-key'], 'n8n-test-key');
        const [, , , , , id, verb] = u.pathname.split('/');
        const body = raw ? JSON.parse(raw) : undefined;
        calls.push({ method: req.method!, path: u.pathname.slice(4), body });
        const w = wfs[id];
        if (!w) { res.statusCode = 404; return res.end('{"message":"not found"}'); }
        if (req.method === 'GET') return res.end(JSON.stringify(w));
        if (req.method === 'PUT') {
          if (failPut) { failPut--; res.statusCode = 400; return res.end('{"message":"request/body must NOT have additional properties"}'); }
          Object.assign(w, body, { versionId: `${w.versionId}+` }); return res.end(JSON.stringify(w));
        }
        if (verb === 'activate') { w.active = true; return res.end(JSON.stringify(w)); }
        if (verb === 'deactivate') { w.active = false; return res.end(JSON.stringify(w)); }
        res.statusCode = 404; return res.end('{}');
      }
      if (!u.pathname.startsWith('/a/')) { res.statusCode = 404; return res.end('{}'); }
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
    });
  });
  await new Promise<void>((r) => server.listen(0, r));
  base = `http://127.0.0.1:${(server.address() as any).port}`;
  if (!skip) { db = createPool(url!); await migrate(db); }
});
after(async () => { server.close(); if (!skip) await db.end(); });
beforeEach(async () => {
  tables = {}; wfs = { wfPlace1: workflow() }; calls = []; failPut = 0;
  if (!skip) await db.query('TRUNCATE jobs, steps, receipts, events, riley_n8n_rollbacks RESTART IDENTITY CASCADE');
});

/** DRY_RUN stays on (as on the server); live stages as given. */
function cfg(live: string[]): Config {
  return { ...loadConfig({ ENGINE_SECRET: 'x'.repeat(40), DATABASE_URL: url ?? 'postgres://x' } as NodeJS.ProcessEnv), dryRun: true, liveStages: live,
    airtableApiKey: 'at', airtableBaseUrl: `${base}/a`, n8nApiKey: 'n8n-test-key', n8nBaseUrl: `${base}/n8n` };
}
const LIVE = ['riley.apply', 'riley.n8n_apply'];
let n = 0;
async function apply(live: string[], jobDry = false) {
  const c = cfg(live);
  const q = await enqueue(db, { kind: 'riley.apply', recordId: `dec-${++n}`, input: { issueId: ISSUE }, dryRun: jobDry || (c.dryRun && !c.liveStages.includes('riley.apply')), maxAttempts: 1, deadlineMs: 60_000 });
  for (let i = 0; i < 10; i++) { await runOnce(db, c); const j = await getJob(db, q.job.id); if (['succeeded', 'failed', 'needs_review'].includes(j!.job.status)) return j!.job; }
  throw new Error('job did not settle');
}
const PATCH = { workflowId: 'wfPlace1', changes: [{ node: 'Schedule', path: 'rule.interval.0.minutesInterval', old: 1, new: 30 }] };
function issue(patch: unknown = PATCH, extra: Record<string, unknown> = {}) {
  tables[ISSUES] = { [ISSUE]: { [IF.title]: 'n8n: placement check runs every minute', [IF.status]: 'Waiting for Alex', [IF.fixType]: 'n8n change',
    [IF.details]: JSON.stringify({ workflowId: 'wfPlace1', executionIds: ['123'], n8nPatch: patch }), [IF.rollback]: 'Set it back to 1 minute.', ...extra } };
  return tables[ISSUES][ISSUE];
}
const puts = () => calls.filter((c) => c.method === 'PUT');
const rollbacks = async () => (await db.query('SELECT * FROM riley_n8n_rollbacks ORDER BY id')).rows;

test('Patch format: found in Details or in a JSON block in Fix; credential-looking paths and values are refused', () => {
  assert.deepEqual((findN8nPatch(JSON.stringify({ n8nPatch: PATCH }), '') as any).patch, PATCH);
  const fix = `Change the schedule to 30 minutes.\n\`\`\`json\n${JSON.stringify({ n8nPatch: PATCH })}\n\`\`\``;
  assert.deepEqual((findN8nPatch('not json', fix) as any).patch, PATCH);
  assert.equal(findN8nPatch('{"workflowId":"x"}', 'Change it by hand'), null, 'no patch at all = the old hand-made path');
  assert.match((findN8nPatch('', 'n8nPatch: {broken') as any).error, /not valid JSON/);
  for (const path of ['authentication', 'options.apiKey', 'headerParameters.parameters.0.token', 'bodyParameters.password', 'x.credentials.id']) {
    const r = validateN8nPatch({ workflowId: 'w1', changes: [{ node: 'Check', path, old: 'a', new: 'b' }] });
    assert.ok('error' in r && /refused/.test(r.error), `${path} must be refused`);
  }
  const v = validateN8nPatch({ workflowId: 'w1', changes: [{ node: 'Check', path: 'options', old: null, new: { secretKey: 'x' } }] });
  assert.ok('error' in v && /refused/.test(v.error), 'a new value holding a key is refused');
  assert.ok('error' in validateN8nPatch({ workflowId: 'w1', changes: [{ node: 'Check', path: 'url', new: 'b' }] }), '"old" is required');
  assert.ok('error' in validateN8nPatch({ workflowId: 'w1', changes: [{ node: 'Check', path: '__proto__.x', old: 1, new: 2 }] }));
  // A header pair {name: "Authorization", value}: its value is a secret even though the path says "value".
  const p = validateN8nPatch({ workflowId: 'wfPlace1', changes: [{ node: 'Check', path: 'headerParameters.parameters.0.value', old: '={{ $env.X }}', new: 'abc' }] }) as any;
  assert.equal(planN8nPatch(workflow(), p.patch).refused.length, 1);
  // The PUT body only has fields the public API accepts.
  assert.deepEqual(Object.keys(putBody(workflow())).sort(), ['connections', 'name', 'nodes', 'settings', 'staticData']);
  assert.deepEqual(putBody(workflow()).settings, { executionOrder: 'v1', timezone: 'America/New_York' });
});

test('Riley n8n apply: ✅ checks the old value, saves the previous workflow, PUTs only accepted fields, re-activates, marks Applied', { skip }, async () => {
  const row = issue();
  const j = await apply(LIVE);
  assert.equal(j.status, 'succeeded', j.error ?? '');
  assert.match(String(j.result.message), /Applied: 1 change\(s\) in "\[Inbox Placement Tests\] Check Results": Schedule › rule\.interval\.0\.minutesInterval: 1 → 30/);
  assert.equal(puts().length, 1);
  const body = puts()[0].body;
  assert.deepEqual(Object.keys(body).sort(), ['connections', 'name', 'nodes', 'settings', 'staticData']);
  assert.equal(body.settings.availableInMCP, undefined);
  assert.equal(body.nodes[0].parameters.rule.interval[0].minutesInterval, 30);
  assert.deepEqual(body.nodes[1], workflow().nodes[1], 'other nodes and their credentials are sent back untouched');
  assert.deepEqual(calls.filter((c) => c.method === 'POST').map((c) => c.path.split('/').pop()), ['deactivate', 'activate']);
  assert.equal(wfs.wfPlace1.active, true);
  assert.equal(row[IF.status], 'Applied');
  assert.ok(row[IF.appliedAt]);
  assert.match(String(row[IF.result]), /through the n8n API.*Workflow re-activated/);
  assert.match(String(row[IF.rollback]), /^Engine rollback #1: .*riley-n8n-rollback recIssue000000001 --yes\n\nSet it back to 1 minute\.$/s);
  const rb = await rollbacks();
  assert.equal(rb.length, 1);
  assert.equal(rb[0].previous.nodes[0].parameters.rule.interval[0].minutesInterval, 1, 'the full previous version is saved');
  assert.ok(rb[0].applied_at);
  const again = await apply(LIVE);
  assert.match(String(again.result.message), /Issue is Applied; nothing to do/);
  assert.equal(puts().length, 1, 'a second ✅ changes nothing');
});

test('Riley n8n apply: the workflow changed since diagnosis → stops, nothing saved, issue back to New', { skip }, async () => {
  wfs.wfPlace1.nodes[0].parameters.rule.interval[0].minutesInterval = 5;
  const row = issue();
  const j = await apply(LIVE);
  assert.equal(j.status, 'failed');
  assert.match(String(j.error), /changed since diagnosis: "Schedule › rule\.interval\.0\.minutesInterval" is now 5 \(Riley read 1\)/);
  assert.equal(puts().length, 0);
  assert.equal((await rollbacks()).length, 0);
  assert.equal(row[IF.status], 'New');
  assert.match(String(row[IF.result]), /Nothing changed; Riley diagnoses it again/);
  // A node that no longer exists is a mismatch too.
  issue({ workflowId: 'wfPlace1', changes: [{ node: 'Gone', path: 'x', old: 1, new: 2 }] });
  const k = await apply(LIVE);
  assert.match(String(k.error), /node "Gone" not found/);
});

test('Riley n8n apply: a patch on a credential, key, token or auth value is refused before n8n is touched', { skip }, async () => {
  const row = issue({ workflowId: 'wfPlace1', changes: [{ node: 'Check', path: 'authentication', old: 'genericCredentialType', new: 'none' }] });
  const j = await apply(LIVE);
  assert.equal(j.status, 'failed');
  assert.match(String(j.error), /refused: "Check › authentication" looks like a credential/);
  assert.equal(calls.length, 0, 'n8n not even read');
  assert.equal(row[IF.status], 'Fix failed');
  // The value of an Authorization header pair: read, refused, never written.
  const row2 = issue({ workflowId: 'wfPlace1', changes: [{ node: 'Check', path: 'headerParameters.parameters.0.value', old: '={{ $env.X }}', new: 'Bearer abc' }] });
  const k = await apply(LIVE);
  assert.match(String(k.error), /refused: "Check › headerParameters\.parameters\.0\.value" is the value of "Authorization"/);
  assert.equal(puts().length, 0);
  assert.equal((await rollbacks()).length, 0);
  assert.equal(row2[IF.status], 'Fix failed');
});

test('Riley n8n apply: dry run writes nothing; with riley.n8n_apply off it checks, changes nothing in n8n and hands it to the Riley session', { skip }, async () => {
  const row = issue();
  const j = await apply(LIVE, true);
  assert.equal(j.status, 'succeeded', j.error ?? '');
  assert.match(String(j.result.message), /Would apply 1 change\(s\).*\(dry run\)/);
  assert.equal(puts().length, 0); assert.equal(calls.filter((c) => c.method !== 'GET').length, 0);
  assert.equal(row[IF.status], 'Waiting for Alex'); assert.equal(row[IF.result], undefined);
  assert.equal((await rollbacks()).length, 0);
  const k = await apply(['riley.apply']);
  assert.equal(k.status, 'succeeded', k.error ?? '');
  assert.match(String(k.result.message), /n8n apply is off \(add riley\.n8n_apply to LIVE_STAGES\)/);
  assert.equal(puts().length, 0);
  assert.equal((await rollbacks()).length, 0);
  assert.equal(row[IF.status], 'Approved');
  assert.equal(wfs.wfPlace1.nodes[0].parameters.rule.interval[0].minutesInterval, 1);
});

test('Riley n8n apply: n8n refuses the save → Fix failed, nothing changed', { skip }, async () => {
  const row = issue(); failPut = 1;
  const j = await apply(LIVE);
  assert.equal(j.status, 'failed');
  assert.match(String(row[IF.result]), /n8n fix not saved: n8n PUT .* HTTP 400/);
  assert.equal(row[IF.status], 'Fix failed');
  assert.equal(wfs.wfPlace1.nodes[0].parameters.rule.interval[0].minutesInterval, 1);
});

test('riley-n8n-rollback: shows the plan, then puts the previous workflow back, re-activates it and reopens the issue', { skip }, async () => {
  const row = issue();
  assert.equal((await apply(LIVE)).status, 'succeeded');
  assert.equal(wfs.wfPlace1.nodes[0].parameters.rule.interval[0].minutesInterval, 30);
  const c = cfg(LIVE); calls = [];
  const plan = await rollbackN8nFix(db, c, ISSUE);
  assert.match(plan, /^Would put back "\[Inbox Placement Tests\] Check Results" \(wfPlace1\) .*re-activate it\. Run again with --yes/);
  assert.equal(puts().length, 0);
  const done = await rollbackN8nFix(db, c, ISSUE, { yes: true });
  assert.match(done, /^Done: put back/);
  assert.equal(puts().length, 1);
  assert.equal(wfs.wfPlace1.nodes[0].parameters.rule.interval[0].minutesInterval, 1);
  assert.deepEqual(Object.keys(puts()[0].body).sort(), ['connections', 'name', 'nodes', 'settings', 'staticData']);
  assert.equal(wfs.wfPlace1.active, true);
  assert.equal(row[IF.status], 'Fix failed');
  assert.match(String(row[IF.result]), /Rolled back by hand/);
  assert.ok((await rollbacks())[0].rolled_back_at);
  assert.match(await rollbackN8nFix(db, c, ISSUE, { yes: true }), /already done/);
  assert.match(await rollbackN8nFix(db, c, 'recNothing0000000'), /No applied n8n fix/);
});

test('riley-n8n-rollback: refuses when the workflow was edited after the fix, unless --force', { skip }, async () => {
  issue();
  assert.equal((await apply(LIVE)).status, 'succeeded');
  wfs.wfPlace1.nodes[0].parameters.rule.interval[0].minutesInterval = 45; calls = [];
  const c = cfg(LIVE);
  assert.match(await rollbackN8nFix(db, c, ISSUE, { yes: true }), /Not rolled back: .* changed after the fix/);
  assert.equal(puts().length, 0);
  assert.match(await rollbackN8nFix(db, c, ISSUE, { yes: true, force: true }), /^Done/);
  assert.equal(wfs.wfPlace1.nodes[0].parameters.rule.interval[0].minutesInterval, 1);
});

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
import { findN8nPatch, planN8nPatch, rollbackN8nFix, validateN8nPatch, putBody, patchState, describeN8nChange, rollbackSettings, type N8nPatch } from '../src/agents/rileyN8n.js';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

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
          // Like n8n (1.119+): the settings sent are merged into the saved ones.
          Object.assign(w, body, { settings: { ...(w.settings ?? {}), ...(body.settings ?? {}) }, versionId: `${w.versionId}+` }); return res.end(JSON.stringify(w));
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
  // availableInMCP is sent back (n8n 1.119+ accepts it), so a fix never hides a workflow from the n8n connector.
  assert.deepEqual(putBody(workflow()).settings, { executionOrder: 'v1', timezone: 'America/New_York', availableInMCP: true });
  assert.deepEqual(putBody({ ...workflow(), settings: { executionOrder: 'v1', timeSavedMode: 'fixed' } }).settings, { executionOrder: 'v1' }, 'keys the API does not accept are dropped');
});

test('Riley n8n apply: ✅ checks the old value, saves the previous workflow, PUTs only accepted fields, re-activates, marks Applied', { skip }, async () => {
  const row = issue();
  const j = await apply(LIVE);
  assert.equal(j.status, 'succeeded', j.error ?? '');
  assert.match(String(j.result.message), /Applied: 1 change\(s\) in "\[Inbox Placement Tests\] Check Results": Schedule › rule\.interval\.0\.minutesInterval: 1 → 30/);
  assert.equal(puts().length, 1);
  const body = puts()[0].body;
  assert.deepEqual(Object.keys(body).sort(), ['connections', 'name', 'nodes', 'settings', 'staticData']);
  assert.equal(body.settings.availableInMCP, true, 'Available in MCP is kept');
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

test('n8nPatch text edit: find exactly once inside a Code node, replace it; patchState follows', () => {
  const code = "const held_email_ids=new Set(['4333','6485','5989']);\nreturn [];";
  const wf = { nodes: [{ name: 'Prepare placement batches', parameters: { jsCode: code } }] };
  const v = validateN8nPatch({ workflowId: 'f22muKJHad1EqaCI', changes: [{ node: 'Prepare placement batches', path: 'jsCode', find: "new Set(['4333','6485','5989'])", replace: "new Set(['5989'])" }] });
  assert.ok('patch' in v);
  const patch = (v as any).patch;
  assert.equal(patchState(wf, patch), 'not_applied');
  const plan = planN8nPatch(wf, patch);
  assert.deepEqual(plan.mismatches, []);
  assert.equal(plan.next.nodes[0].parameters.jsCode, "const held_email_ids=new Set(['5989']);\nreturn [];");
  assert.equal(patchState(plan.next, patch), 'applied');
  // The text is gone or appears twice: nothing changes.
  assert.match(planN8nPatch(plan.next, patch).mismatches[0], /no longer there/);
  const twice = { nodes: [{ name: 'Prepare placement batches', parameters: { jsCode: code + code } }] };
  assert.match(planN8nPatch(twice, patch).mismatches[0], /appears 2 times/);
  // Bad shapes and secrets are refused.
  assert.ok('error' in validateN8nPatch({ workflowId: 'w1', changes: [{ node: 'n', path: 'jsCode', find: '', replace: 'x' }] }));
  assert.match((validateN8nPatch({ workflowId: 'w1', changes: [{ node: 'n', path: 'jsCode', find: 'a', replace: 'apiKey = 1' }] }) as any).error, /refused/);
  assert.ok('error' in validateN8nPatch({ workflowId: 'w1', changes: [{ node: 'n', path: '$disabled', find: 'a', replace: 'b' }] }));
});

// ── Structure changes (Alex 2026-11-28: "Riley should fix n8n herself, not give me click steps") ──
// Real workflows from the repo snapshot (credentials are scrubbed there, so the test gives the Slack nodes a fake login).
const SNAP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../automations/n8n-live-2026-11-17/workflows');
const snap = (file: string) => JSON.parse(fs.readFileSync(path.join(SNAP, file), 'utf8'));
function inboxWf() {
  const w = snap('inbox-manager-receive-replies-from-emailbison--NwlemmcwCZLCXAmt.json');
  for (const n of w.nodes) if (n.type === 'n8n-nodes-base.slack') n.credentials = { slackApi: { id: 'slk1', name: 'Slack (test)' } };
  return w;
}
const fanbasisWf = () => snap('fanbasis-transaction-successful--bDwVoNKGlfAwBXuW.json');
const node = (w: any, name: string) => w.nodes.find((n: any) => n.name === name);
const ok = (p: unknown): N8nPatch => { const v = validateN8nPatch(p); assert.ok('patch' in v, (v as any).error); return (v as any).patch; };
const err = (p: unknown) => { const v = validateN8nPatch(p); assert.ok('error' in v, 'must be refused'); return (v as any).error as string; };

// The three click-step cases from Riley's 11-28 run, as patches (the worked examples).
const INBOX_PATCH = { workflowId: 'NwlemmcwCZLCXAmt', changes: [
  { nodeSetting: { node: 'Validate Unique Email Identity', key: 'onError', old: null, new: 'continueErrorOutput' } },
  { nodeSetting: { node: 'Select Claimed Conversation', key: 'onError', old: null, new: 'continueErrorOutput' } },
  { addNode: { name: 'Reply refused alert', type: 'n8n-nodes-base.slack', typeVersion: 2.3, position: [672, 2880],
    parameters: { select: 'channel', channelId: { __rl: true, value: 'C07SH62A46L', mode: 'list', cachedResultName: 'bison-replies' },
      text: "=Reply refused: {{$json.error?.message || $json.error}} · lead {{$('Webhook').first().json.body.data.lead.id}} · exec {{$execution.id}}",
      otherOptions: { includeLinkToWorkflow: false } },
    credentials: { slackApi: { fromNode: 'Send a message' } } } },
  { connect: { from: 'Validate Unique Email Identity', output: 'error', to: 'Reply refused alert' } },
  { connect: { from: 'Select Claimed Conversation', output: 'error', to: 'Reply refused alert' } },
] };
const FANBASIS_PATCH = { workflowId: 'bDwVoNKGlfAwBXuW', changes: [
  { copyNode: { from: 'Initial payment missing?', name: 'Initial payment missing? (repeat payer)', position: [3616, -528],
    parameterOverrides: { 'conditions.conditions.0.leftValue': "={{ $('Search records1').item.json['Initial Payment Received'] ? 'received' : 'missing' }}" } } },
  { copyNode: { from: 'Mark initial payment received', name: 'Mark initial payment received (repeat payer)', position: [3840, -544],
    parameterOverrides: { 'columns.value.id': "={{ $('Search records1').item.json.id }}" } } },
  { connect: { from: 'Create a record', to: 'Initial payment missing? (repeat payer)' } },
  { connect: { from: 'Initial payment missing? (repeat payer)', fromIndex: 0, to: 'Mark initial payment received (repeat payer)' } },
] };
const MCP_PATCH = { workflowId: 'y1_4M2YS7pkDVzU-j5AJv', changes: [{ workflowSetting: { key: 'availableInMCP', old: false, new: true } }] };

test('n8nPatch structure: onError + a new Slack node reusing a login + error outputs wired to it (Receive Replies snapshot)', () => {
  const wf = inboxWf();
  const patch = ok(INBOX_PATCH);
  assert.equal(patchState(wf, patch), 'not_applied');
  const plan = planN8nPatch(wf, patch);
  assert.deepEqual([plan.mismatches, plan.refused, plan.invalid], [[], [], []]);
  const alert = node(plan.next, 'Reply refused alert');
  assert.equal(alert.type, 'n8n-nodes-base.slack');
  assert.deepEqual(alert.credentials, { slackApi: { id: 'slk1', name: 'Slack (test)' } }, 'the login of "Send a message", by reference only');
  assert.equal(alert.parameters.channelId.value, 'C07SH62A46L');
  assert.match(alert.id, /^[0-9a-f-]{36}$/);
  for (const name of ['Validate Unique Email Identity', 'Select Claimed Conversation']) {
    assert.equal(node(plan.next, name).onError, 'continueErrorOutput');
    const outs = plan.next.connections[name].main;
    assert.deepEqual(outs[0], wf.connections[name].main[0], 'the success output is untouched');
    assert.deepEqual(outs[1], [{ node: 'Reply refused alert', type: 'main', index: 0 }], 'error output = main index 1');
  }
  assert.equal(plan.next.nodes.length, wf.nodes.length + 1, 'the workflow read from n8n is not changed (the engine works on a copy)');
  assert.deepEqual(plan.lines, [
    "'Validate Unique Email Identity' setting On Error: Stop Workflow → Continue (using error output)",
    "'Select Claimed Conversation' setting On Error: Stop Workflow → Continue (using error output)",
    "add node 'Reply refused alert' (Slack), reusing the login of 'Send a message'",
    "connect 'Validate Unique Email Identity' error output → 'Reply refused alert'",
    "connect 'Select Claimed Conversation' error output → 'Reply refused alert'",
  ]);
  assert.equal(patchState(plan.next, patch), 'applied');
  // Applying it again: the node already exists, so nothing is saved.
  assert.match(planN8nPatch(plan.next, patch).mismatches.join(';'), /node "Reply refused alert" already exists/);
  // Half there (the node was added by hand, nothing wired): mixed.
  const half = structuredClone(wf); half.nodes.push(alert);
  assert.equal(patchState(half, patch), 'mixed');
});

test('n8nPatch structure: copy two nodes after "Create a record" with changed references (Fanbasis snapshot)', () => {
  const wf = fanbasisWf();
  const patch = ok(FANBASIS_PATCH);
  assert.equal(patchState(wf, patch), 'not_applied');
  const plan = planN8nPatch(wf, patch);
  assert.deepEqual([plan.mismatches, plan.refused, plan.invalid], [[], [], []]);
  const ifCopy = node(plan.next, 'Initial payment missing? (repeat payer)'), markCopy = node(plan.next, 'Mark initial payment received (repeat payer)');
  const ifSrc = node(wf, 'Initial payment missing?'), markSrc = node(wf, 'Mark initial payment received');
  assert.equal(ifCopy.type, ifSrc.type); assert.equal(ifCopy.typeVersion, ifSrc.typeVersion);
  assert.notEqual(ifCopy.id, ifSrc.id);
  assert.deepEqual(ifCopy.position, [3616, -528]);
  assert.equal(ifCopy.parameters.conditions.conditions[0].leftValue, "={{ $('Search records1').item.json['Initial Payment Received'] ? 'received' : 'missing' }}");
  assert.equal(ifCopy.parameters.conditions.conditions[0].operator.operation, 'equals', 'the rest of the condition is copied');
  assert.equal(markCopy.parameters.columns.value.id, "={{ $('Search records1').item.json.id }}");
  assert.equal(markCopy.parameters.columns.value['Initial Payment Received'], true);
  assert.deepEqual(markCopy.parameters.columns.schema, markSrc.parameters.columns.schema);
  assert.equal(node(plan.next, 'Mark initial payment received').parameters.columns.value.id, "={{ $('Search records2').item.json.id }}", 'the originals are untouched');
  assert.deepEqual(plan.next.connections['Create a record'].main, [[{ node: 'Initial payment missing? (repeat payer)', type: 'main', index: 0 }]]);
  assert.deepEqual(plan.next.connections['Initial payment missing? (repeat payer)'].main, [[{ node: 'Mark initial payment received (repeat payer)', type: 'main', index: 0 }]]);
  assert.deepEqual(plan.lines, [
    "copy node 'Initial payment missing?' as 'Initial payment missing? (repeat payer)', changing conditions.conditions.0.leftValue",
    "copy node 'Mark initial payment received' as 'Mark initial payment received (repeat payer)', changing columns.value.id",
    "connect 'Create a record' → 'Initial payment missing? (repeat payer)'",
    "connect 'Initial payment missing? (repeat payer)' true output → 'Mark initial payment received (repeat payer)'",
  ]);
  assert.equal(patchState(plan.next, patch), 'applied');
  // A copy of a node with a webhookId gets a new one (two nodes never share a webhook).
  const slackCopy = planN8nPatch(wf, ok({ workflowId: 'w1', changes: [{ copyNode: { from: 'Send a message', name: 'Send a message (copy)', position: [0, 0] } }] })).next;
  assert.ok(node(slackCopy, 'Send a message (copy)').webhookId);
  assert.notEqual(node(slackCopy, 'Send a message (copy)').webhookId, node(wf, 'Send a message').webhookId);
});

test('n8nPatch structure: workflow and node settings, disconnect, and putBody sends Available in MCP', () => {
  const wf = fanbasisWf(); delete wf.settings.availableInMCP;
  const patch = ok(MCP_PATCH);
  assert.equal(patchState(wf, patch), 'not_applied', 'absent = off');
  const plan = planN8nPatch(wf, patch);
  assert.deepEqual(plan.lines, ['workflow setting Available in MCP: off → on']);
  assert.equal((putBody(plan.next).settings as any).availableInMCP, true, 'the PUT really carries it');
  assert.equal(patchState(plan.next, patch), 'applied');
  assert.match(planN8nPatch(plan.next, patch).mismatches[0], /Available in MCP is now true \(Riley read false\)/);
  // Node settings: retries; a node setting read wrong is a mismatch.
  const retry = ok({ workflowId: 'w1', changes: [{ nodeSetting: { node: 'HTTP Request', key: 'retryOnFail', old: null, new: true } }, { nodeSetting: { node: 'HTTP Request', key: 'maxTries', old: null, new: 5 } }] });
  const r = planN8nPatch(wf, retry);
  assert.deepEqual([node(r.next, 'HTTP Request').retryOnFail, node(r.next, 'HTTP Request').maxTries], [true, 5]);
  assert.deepEqual(r.lines, ["'HTTP Request' setting Retry On Fail: off → on", "'HTTP Request' setting Max Tries: 3 → 5"]);
  const wrong = ok({ workflowId: 'w1', changes: [{ nodeSetting: { node: 'check payment method', key: 'onError', old: 'stopWorkflow', new: 'continueRegularOutput' } }] });
  assert.match(planN8nPatch(wf, wrong).mismatches[0], /"check payment method" setting On Error is now "continueErrorOutput" \(Riley read "stopWorkflow"\)/);
  // Disconnect: an IF's false branch.
  const d = ok({ workflowId: 'w1', changes: [{ disconnect: { from: 'If', fromIndex: 1, to: 'Create a contact' } }] });
  const dp = planN8nPatch(wf, d);
  assert.deepEqual(dp.next.connections.If.main[1], []);
  assert.deepEqual(dp.lines, ["disconnect 'If' false output → 'Create a contact'"]);
  assert.equal(patchState(dp.next, d), 'applied');
  assert.match(planN8nPatch(dp.next, d).mismatches[0], /is not connected/);
  // A wire that is already there is a mismatch (someone did it by hand).
  assert.match(planN8nPatch(wf, ok({ workflowId: 'w1', changes: [{ connect: { from: 'Webhook', to: 'Filter' } }] })).mismatches[0], /'Webhook' → 'Filter' is already connected/);
});

test('n8nPatch structure refusals: secrets, new credentials, unknown keys, missing nodes, duplicate names, triggers, unwired error outputs', () => {
  const wf = inboxWf();
  const slack = (extra: Record<string, unknown> = {}) => ({ addNode: { name: 'Alert', type: 'n8n-nodes-base.slack', typeVersion: 2.3, position: [0, 0], parameters: { text: 'x' }, ...extra } });
  // Secret-looking parameters on a new node or a copy.
  assert.match(err({ workflowId: 'w1', changes: [slack({ parameters: { options: { apiKey: 'abc' } } })] }), /refused: the parameters of new node "Alert" hold a credential/);
  assert.match(err({ workflowId: 'w1', changes: [{ addNode: { name: 'Call', type: 'n8n-nodes-base.httpRequest', typeVersion: 4.3, position: [0, 0], parameters: { headerParameters: { parameters: [{ name: 'x-api-key', value: 'abc' }] } } } }] }), /refused/);
  assert.match(err({ workflowId: 'w1', changes: [slack({ parameters: { authentication: 'oAuth2' } })] }), /refused/);
  assert.match(err({ workflowId: 'w1', changes: [{ copyNode: { from: 'Get replies', name: 'Get replies 2', position: [0, 0], parameterOverrides: { 'options.apiKey': 'abc' } } }] }), /refused: "Get replies 2 › options\.apiKey" looks like a credential/);
  const hdr = { workflowId: 'w1', changes: [{ copyNode: { from: 'Hdr', name: 'Hdr 2', position: [0, 0], parameterOverrides: { 'headerParameters.parameters.0.value': 'abc' } } }] };
  const hdrWf = { nodes: [{ name: 'Hdr', type: 'n8n-nodes-base.httpRequest', parameters: { headerParameters: { parameters: [{ name: 'Authorization', value: '={{ $env.X }}' }] } } }], connections: {} };
  assert.match(planN8nPatch(hdrWf, ok(hdr)).refused[0], /"Hdr" holds a key, token or password in its parameters; copying it would spread that secret/);
  const keyed = { nodes: [{ name: 'Keyed', type: 'n8n-nodes-base.httpRequest', parameters: { headerParameters: { parameters: [{ name: 'x-api-key', value: 'REDACTED' }] } } }], connections: {} };
  assert.equal(planN8nPatch(keyed, ok({ workflowId: 'w1', changes: [{ copyNode: { from: 'Keyed', name: 'Keyed 2', position: [0, 0] } }] })).refused.length, 1, 'a node with a typed-in key is never copied');
  const authed = { nodes: [{ name: 'Authed', type: 'n8n-nodes-base.httpRequest', parameters: { url: 'https://x', authentication: 'predefinedCredentialType', nodeCredentialType: 'xeroOAuth2Api' }, credentials: { xeroOAuth2Api: { id: 'x1', name: 'Xero' } } }], connections: {} };
  const ac = planN8nPatch(authed, ok({ workflowId: 'w1', changes: [{ copyNode: { from: 'Authed', name: 'Authed 2', position: [0, 0] } }] }));
  assert.deepEqual([ac.refused, node(ac.next, 'Authed 2').credentials], [[], { xeroOAuth2Api: { id: 'x1', name: 'Xero' } }], 'a node that uses a saved login is copied with a reference to it');
  // New credentials: embedded data, an id/name the workflow does not use, a login from a different node type.
  assert.match(err({ workflowId: 'w1', changes: [slack({ credentials: { slackApi: { id: 'x', name: 'y', data: { token: 'z' } } } })] }), /refused: new node "Alert" credential "slackApi" must only point at a login the workflow already uses/);
  assert.match(planN8nPatch(wf, ok({ workflowId: 'w1', changes: [slack({ credentials: { slackApi: { id: 'other', name: 'Other Slack' } } })] })).refused[0], /no node in this workflow uses; the engine never adds new credentials/);
  const reuse = planN8nPatch(wf, ok({ workflowId: 'w1', changes: [slack({ credentials: { slackApi: { id: 'slk1', name: 'Slack (test)' } } })] }));
  assert.deepEqual([reuse.refused, node(reuse.next, 'Alert').credentials], [[], { slackApi: { id: 'slk1', name: 'Slack (test)' } }], 'an id + name the workflow already uses is fine');
  assert.match(planN8nPatch(wf, ok({ workflowId: 'w1', changes: [slack({ credentials: { slackApi: { fromNode: 'Get replies' } } })] })).invalid[0], /only reuse the login of a node of the same type/);
  // Unknown keys and bad values.
  assert.match(err({ workflowId: 'w1', changes: [{ nodeSetting: { node: 'Code', key: 'credentials', old: null, new: {} } }] }), /not a node setting the engine changes/);
  assert.match(err({ workflowId: 'w1', changes: [{ nodeSetting: { node: 'Code', key: 'onError', old: null, new: 'ignore' } }] }), /"new" must be stopWorkflow, continueRegularOutput or continueErrorOutput/);
  assert.match(err({ workflowId: 'w1', changes: [{ nodeSetting: { node: 'Code', key: 'onError', new: 'continueErrorOutput' } }] }), /both "old" and "new" are required/);
  assert.match(err({ workflowId: 'w1', changes: [{ workflowSetting: { key: 'timezone', old: null, new: 'UTC' } }] }), /not a workflow setting the engine changes/);
  assert.match(err({ workflowId: 'w1', changes: [{ workflowSetting: { key: 'callerPolicy', old: null, new: 'workflowsFromAList' } }] }), /a caller list is Manual/);
  assert.match(err({ workflowId: 'w1', changes: [{ workflowSetting: { key: 'errorWorkflow', old: null, new: 'abc123' } }] }), /can't be undone/);
  assert.match(err({ workflowId: 'w1', changes: [slack({ onError: 'continueErrorOutput' })] }), /unknown field\(s\) onError/);
  assert.match(err({ workflowId: 'w1', changes: [{ addNode: slack().addNode, node: 'x' }] }), /one change per entry/);
  assert.match(err({ workflowId: 'w1', changes: [{ connect: { from: 'A', output: 'failure', to: 'B' } }] }), /"output" is "main" or "error"/);
  assert.match(err({ workflowId: 'w1', changes: [{ connect: { from: 'A', to: 'A' } }] }), /can't be wired to itself/);
  // Triggers and webhooks are never added or copied.
  assert.match(err({ workflowId: 'w1', changes: [{ addNode: { name: 'Hook', type: 'n8n-nodes-base.webhook', typeVersion: 2, position: [0, 0], parameters: {} } }] }), /refused: .*trigger or webhook/);
  assert.match(err({ workflowId: 'w1', changes: [{ addNode: { name: 'Cron', type: 'n8n-nodes-base.scheduleTrigger', typeVersion: 1, position: [0, 0], parameters: {} } }] }), /trigger or webhook/);
  assert.match(planN8nPatch(wf, ok({ workflowId: 'w1', changes: [{ copyNode: { from: 'Webhook', name: 'Webhook 2', position: [0, 0] } }] })).refused[0], /trigger or webhook/);
  // Duplicate names: twice in one patch, or a name the workflow already has.
  assert.match(err({ workflowId: 'w1', changes: [slack(), { copyNode: { from: 'Code', name: 'Alert', position: [0, 0] } }] }), /"Alert" is added twice/);
  assert.match(err({ workflowId: 'w1', changes: [{ connect: { from: 'A', to: 'B' } }, { connect: { from: 'A', to: 'B' } }] }), /repeats an earlier change/);
  assert.match(planN8nPatch(wf, ok({ workflowId: 'w1', changes: [slack({ name: 'Code' })] })).mismatches[0], /node "Code" already exists/);
  // Missing nodes (a connect may use a node added earlier in the same patch, not one added later or never).
  assert.match(planN8nPatch(wf, ok({ workflowId: 'w1', changes: [{ connect: { from: 'Code', to: 'Nowhere' } }] })).mismatches[0], /node "Nowhere" not found/);
  assert.match(planN8nPatch(wf, ok({ workflowId: 'w1', changes: [{ copyNode: { from: 'Gone', name: 'Gone 2', position: [0, 0] } }] })).mismatches[0], /node "Gone" not found/);
  assert.match(planN8nPatch(wf, ok({ workflowId: 'w1', changes: [{ connect: { from: 'Alert', to: 'Code' } }, slack()] })).mismatches[0], /node "Alert" not found/, 'order matters: add first, then wire');
  // An error output that would never fire, and a Switch's variable outputs.
  assert.match(planN8nPatch(wf, ok({ workflowId: 'w1', changes: [slack(), { connect: { from: 'Code', output: 'error', to: 'Alert' } }] })).invalid[0], /'Code' error output is wired, but its On Error setting is not "Continue \(using error output\)"/);
  assert.match(planN8nPatch(wf, ok({ workflowId: 'w1', changes: [slack(), { connect: { from: 'Switch', output: 'error', to: 'Alert' } }] })).invalid[0], /variable number of outputs/);
  // An IF's error output comes after its true and false outputs.
  const ifErr = planN8nPatch(wf, ok({ workflowId: 'w1', changes: [{ nodeSetting: { node: 'If lead exists', key: 'onError', old: null, new: 'continueErrorOutput' } }, slack(), { connect: { from: 'If lead exists', output: 'error', to: 'Alert' } }] }));
  assert.deepEqual(ifErr.invalid, []);
  assert.deepEqual(ifErr.next.connections['If lead exists'].main[2], [{ node: 'Alert', type: 'main', index: 0 }]);
  // The plain words for a change, without a workflow at hand.
  assert.equal(describeN8nChange(ok(MCP_PATCH).changes[0]), 'workflow setting Available in MCP: off → on');
});

test('Riley n8n apply: add a node, wire it, change node and workflow settings on ✅; rollback puts the old workflow back exactly', { skip }, async () => {
  const original = workflow();
  const patch = { workflowId: 'wfPlace1', changes: [
    { nodeSetting: { node: 'Check', key: 'onError', old: null, new: 'continueErrorOutput' } },
    { addNode: { name: 'Check failed alert', type: 'n8n-nodes-base.httpRequest', typeVersion: 4.2, position: [400, 200], parameters: { url: 'https://hooks.example.com/alert', method: 'POST' },
      credentials: { httpHeaderAuth: { fromNode: 'Check' } } } },
    { connect: { from: 'Check', output: 'error', to: 'Check failed alert' } },
    { workflowSetting: { key: 'saveExecutionProgress', old: null, new: true } },
  ] };
  const row = issue(patch);
  const j = await apply(LIVE);
  assert.equal(j.status, 'succeeded', j.error ?? '');
  assert.match(String(j.result.message), /Applied: 4 change\(s\) in .*'Check' setting On Error: Stop Workflow → Continue \(using error output\); add node 'Check failed alert' \(HTTP Request\), reusing the login of 'Check'; connect 'Check' error output → 'Check failed alert'; workflow setting Save Execution Progress: off → on/);
  assert.equal(puts().length, 1);
  const body = puts()[0].body;
  assert.deepEqual(Object.keys(body).sort(), ['connections', 'name', 'nodes', 'settings', 'staticData']);
  const added = body.nodes.find((n: any) => n.name === 'Check failed alert');
  assert.deepEqual(added.credentials, { httpHeaderAuth: { id: 'c1', name: 'Some Key' } }, 'a reference to the existing login, nothing more');
  assert.equal(added.parameters.authentication, 'genericCredentialType', 'the login selector comes with it');
  assert.deepEqual(body.connections.Check, { main: [[], [{ node: 'Check failed alert', type: 'main', index: 0 }]] });
  assert.equal(body.settings.saveExecutionProgress, true);
  assert.equal(body.settings.availableInMCP, true);
  assert.equal(row[IF.status], 'Applied');
  assert.equal(patchState(wfs.wfPlace1, ok(patch)), 'applied');
  const rb = await rollbacks();
  assert.equal(rb.length, 1);
  assert.equal(rb[0].previous.nodes.length, 2, 'the full previous version is saved');
  // Rollback: nodes, wires and the new setting all go back.
  const done = await rollbackN8nFix(db, cfg(LIVE), ISSUE, { yes: true });
  assert.match(done, /^Done: put back/);
  assert.deepEqual(wfs.wfPlace1.nodes, original.nodes);
  assert.deepEqual(wfs.wfPlace1.connections, original.connections);
  assert.equal(wfs.wfPlace1.settings.saveExecutionProgress, false, 'n8n merges settings, so the rollback sends the old value (off) explicitly');
  assert.deepEqual(rollbackSettings(original, ok(patch)), { ...original.settings, saveExecutionProgress: false });
  assert.equal(wfs.wfPlace1.active, true);
});

test('Riley n8n apply: a patch that cannot work (error output wired without On Error) or adds a new login stops before n8n is saved', { skip }, async () => {
  const row = issue({ workflowId: 'wfPlace1', changes: [
    { addNode: { name: 'Alert', type: 'n8n-nodes-base.httpRequest', typeVersion: 4.2, position: [0, 0], parameters: { url: 'https://x' } } },
    { connect: { from: 'Check', output: 'error', to: 'Alert' } }] });
  const j = await apply(LIVE);
  assert.equal(j.status, 'failed');
  assert.match(String(j.error), /n8n fix not applied: 'Check' error output is wired, but its On Error setting is not/);
  assert.equal(row[IF.status], 'Fix failed');
  assert.equal(puts().length, 0);
  assert.equal((await rollbacks()).length, 0);
  const row2 = issue({ workflowId: 'wfPlace1', changes: [
    { addNode: { name: 'Alert', type: 'n8n-nodes-base.httpRequest', typeVersion: 4.2, position: [0, 0], parameters: { url: 'https://x' }, credentials: { httpHeaderAuth: { id: 'c9', name: 'Brand new key' } } } }] });
  const k = await apply(LIVE);
  assert.match(String(k.error), /n8n fix refused: .*no node in this workflow uses; the engine never adds new credentials/);
  assert.equal(row2[IF.status], 'Fix failed');
  assert.equal(puts().length, 0);
  assert.equal(wfs.wfPlace1.nodes.length, 2);
});

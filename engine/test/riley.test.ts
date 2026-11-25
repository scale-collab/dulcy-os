// Riley: engine problems → System Issues (one row per signature), and ✅ on a Retry fix re-runs the job.
import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { createPool, migrate, type Db } from '../src/db/pool.js';
import { loadConfig, type Config } from '../src/config.js';
import { enqueue, getJob } from '../src/queue.js';
import { runOnce } from '../src/worker.js';
import { signature, ISSUES, IF } from '../src/agents/riley.js';

const url = process.env.TEST_DATABASE_URL;
const skip = !url ? 'TEST_DATABASE_URL not set' : false;

test('Same problem, same signature: record IDs, numbers and quoted values do not split an issue', () => {
  const a = signature('Engine', 'leadlist.verify', 'MillionVerifier job 4411 failed for recAbCdEfGhIjKlMn: HTTP 502 "bad gateway"');
  const b = signature('Engine', 'leadlist.verify', 'MillionVerifier job 9 failed for recZZZZZZZZZZZZZZ: HTTP 503 "timeout"');
  assert.equal(a, b);
  assert.notEqual(a, signature('Engine', 'leadlist.qa', 'MillionVerifier job 9 failed'));
});

let db: Db, server: http.Server, base = '';
let tables: Record<string, Record<string, Record<string, unknown>>> = {};
before(async () => {
  server = http.createServer((req, res) => {
    let raw = ''; req.on('data', (c) => (raw += c));
    req.on('end', () => {
      res.setHeader('content-type', 'application/json');
      const u = new URL(req.url ?? '/', 'http://x');
      if (!u.pathname.startsWith('/a/')) { res.statusCode = 404; return res.end('{}'); }
      const table = u.pathname.split('/')[4]; const rows = (tables[table] ??= {});
      if (req.method === 'GET') {
        const f = u.searchParams.get('filterByFormula') ?? '';
        const id = /RECORD_ID\(\)='(rec\w+)'/.exec(f)?.[1]; const sig = /\{Signature\}='((?:\\'|[^'])*)'/.exec(f)?.[1]?.replace(/\\'/g, "'");
        const list = Object.entries(rows).filter(([rid, r]) => (!id || rid === id) && (sig === undefined || r[IF.signature] === sig));
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
beforeEach(async () => { tables = {}; if (!skip) await db.query('TRUNCATE jobs, steps, receipts, events RESTART IDENTITY CASCADE'); });
function cfg(stage: string): Config {
  return { ...loadConfig({ ENGINE_SECRET: 'x'.repeat(40), DATABASE_URL: url ?? 'postgres://x' } as NodeJS.ProcessEnv), dryRun: false, liveStages: [stage], airtableApiKey: 'at', airtableBaseUrl: `${base}/a` };
}
let n = 0;
async function run(kind: string, input: Record<string, unknown> = {}) {
  const q = await enqueue(db, { kind, recordId: `${kind}-${++n}`, input, dryRun: false, maxAttempts: 1, deadlineMs: 60_000 });
  for (let i = 0; i < 10; i++) { await runOnce(db, cfg(kind)); const j = await getJob(db, q.job.id); if (['succeeded', 'failed', 'needs_review'].includes(j!.job.status)) return j!; }
  throw new Error('job did not settle');
}
async function failedJob(kind: string, error: string) {
  const q = await enqueue(db, { kind, recordId: `rec${String(++n).padStart(14, '0')}`, input: { a: 1 }, dryRun: false, maxAttempts: 2, deadlineMs: 60_000 });
  await db.query(`UPDATE jobs SET status='failed', error=$2, updated_at=now() WHERE id=$1`, [q.job.id, error]);
  return Number(q.job.id);
}

test('Riley collect: failed jobs become one System Issue per problem; repeats count up; a fixed issue that comes back reopens', { skip }, async () => {
  const j1 = await failedJob('leadlist.verify', 'MillionVerifier job 41 failed: HTTP 502');
  await failedJob('leadlist.verify', 'MillionVerifier job 42 failed: HTTP 503');
  await failedJob('sean.draft', 'Claude: overloaded');
  const r = await run('riley.collect');
  assert.equal(r.job.status, 'succeeded', r.job.error ?? '');
  assert.match(String(r.job.result.message), /3 problem\(s\): 2 new issue\(s\)/);
  const rows = Object.values(tables[ISSUES]);
  assert.equal(rows.length, 2);
  const v = rows.find((x) => x[IF.where] === 'leadlist.verify')!;
  assert.equal(v[IF.occurrences], 2); assert.equal(v[IF.status], 'New'); assert.equal(v[IF.source], 'Engine');
  assert.deepEqual(JSON.parse(String(v[IF.details])).jobIds.slice(0, 1), [j1]);
  // Marked fixed, then it happens again → reopened, not a duplicate row.
  v[IF.status] = 'Fixed';
  await failedJob('leadlist.verify', 'MillionVerifier job 77 failed: HTTP 500');
  const r2 = await run('riley.collect');
  assert.match(String(r2.job.result.message), /1 new issue/);
  assert.equal(Object.values(tables[ISSUES]).length, 2);
  assert.equal(v[IF.status], 'New'); assert.equal(v[IF.occurrences], 3); assert.match(String(v[IF.result]), /Came back after it was marked Fixed/);
});

test('Riley apply: ✅ on a Retry re-runs the failed job once; any other fix becomes Approved for the Riley session', { skip }, async () => {
  const j = await failedJob('leadlist.qa', 'Sheets: rate limit');
  tables[ISSUES] = {
    recI0000000000001: { [IF.title]: 'qa failed', [IF.status]: 'Waiting for Alex', [IF.fixType]: 'Retry', [IF.details]: JSON.stringify({ jobIds: [j] }) },
    recI0000000000002: { [IF.title]: 'n8n broke', [IF.status]: 'Waiting for Alex', [IF.fixType]: 'n8n change' },
  };
  const a = await run('riley.apply', { issueId: 'recI0000000000001' });
  assert.equal(a.job.status, 'succeeded', a.job.error ?? '');
  const again = (await db.query(`SELECT count(*)::int AS c FROM jobs WHERE kind='leadlist.qa' AND status='queued'`)).rows[0].c;
  assert.equal(again, 1, 'the failed job is queued again');
  assert.equal(tables[ISSUES].recI0000000000001[IF.status], 'Applied');
  const b = await run('riley.apply', { issueId: 'recI0000000000002' });
  assert.match(String(b.job.result.message), /Riley makes it live on his next run/);
  assert.equal(tables[ISSUES].recI0000000000002[IF.status], 'Approved');
  const c = await run('riley.apply', { issueId: 'recI0000000000001' });
  assert.match(String(c.job.result.message), /Issue is Applied; nothing to do/, 'a second ✅ does nothing');
});

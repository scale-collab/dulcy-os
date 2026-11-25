// Ledger checker mode (Alex 2026-11-25): reads Mercury and Xero, NEVER writes to Xero, flags lines
// still not in Xero after 3 days once in Slack, and re-checks them every run.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { createPool, migrate, type Db } from '../src/db/pool.js';
import { loadConfig, type Config } from '../src/config.js';
import { enqueue, getJob } from '../src/queue.js';
import { runOnce } from '../src/worker.js';

const url = process.env.TEST_DATABASE_URL;
const skip = !url ? 'TEST_DATABASE_URL not set' : false;
let db: Db, server: http.Server, base = '';
const writes: string[] = []; const posts: string[] = [];
const ago = (days: number) => new Date(Date.now() - days * 86_400_000).toISOString();
let xeroTransfers: any[] = [];

before(async () => {
  server = http.createServer((req, res) => {
    let raw = ''; req.on('data', (c) => (raw += c));
    req.on('end', () => {
      res.setHeader('content-type', 'application/json');
      const u = req.url ?? '';
      if (req.method === 'PUT') { writes.push(u); return res.end('{}'); }
      if (u.startsWith('/m/accounts')) return res.end(JSON.stringify({ accounts: [{ id: 'e', name: 'Entry Checking ••6964', currentBalance: 0, status: 'active' }, { id: 'o', name: 'OPEX', currentBalance: 10, status: 'active' }] }));
      if (u.startsWith('/m/account/e/transactions')) return res.end(JSON.stringify({ transactions: [
        { id: 't-old', amount: -100, counterpartyName: 'OPEX', kind: 'internalTransfer', status: 'sent', postedAt: ago(10) },
        { id: 't-new', amount: 50, counterpartyName: 'Commas', kind: 'other', status: 'sent', postedAt: ago(1) },
      ] }));
      if (u.startsWith('/m/account/o/transactions')) return res.end(JSON.stringify({ transactions: [{ id: 't-old-in', amount: 100, counterpartyName: 'Entry Checking', kind: 'internalTransfer', status: 'sent', postedAt: ago(10) }] }));
      if (u.startsWith('/x/api.xro/2.0/Accounts')) return res.end(JSON.stringify({ Accounts: [{ AccountID: 'A-entry', Name: 'Entry Checking' }, { AccountID: 'A-opex', Name: 'OPEX' }, { AccountID: 'A-fan', Name: 'Fanbasis Holding' }] }));
      if (u.startsWith('/x/api.xro/2.0/BankTransfers')) return res.end(JSON.stringify({ BankTransfers: xeroTransfers }));
      if (u.startsWith('/x/api.xro/2.0/')) { const k = u.split('/')[4].split('?')[0]; return res.end(JSON.stringify({ [k]: [] })); }
      if (u.startsWith('/s/chat.postMessage')) { posts.push(JSON.parse(raw).text); return res.end(JSON.stringify({ ok: true, channel: 'D1', ts: '1.1' })); }
      res.statusCode = 404; res.end('{}');
    });
  });
  await new Promise<void>((r) => server.listen(0, r));
  base = `http://127.0.0.1:${(server.address() as any).port}`;
  if (!skip) {
    db = createPool(url!); await migrate(db);
    await db.query(`DELETE FROM ledger_entries`);
    await db.query(`INSERT INTO oauth_tokens (provider, refresh_token, access_token, expires_at, tenant_id, tenant_name) VALUES ('xero','r','a', now() + interval '1 hour','t','Dulcy Media')
      ON CONFLICT (provider) DO UPDATE SET refresh_token='r', access_token='a', expires_at=now() + interval '1 hour', tenant_id='t'`);
  }
});
after(async () => { server.close(); if (!skip) await db.end(); });

function cfg(): Config {
  return { ...loadConfig({ ENGINE_SECRET: 'x'.repeat(40), DATABASE_URL: url ?? 'postgres://x' } as NodeJS.ProcessEnv),
    dryRun: false, liveStages: ['ledger.prep'], xeroClientId: 'id', xeroClientSecret: 's', xeroApiUrl: `${base}/x`, xeroIdentityUrl: `${base}/x`,
    mercuryToken: 'secret-token:abc', mercuryBaseUrl: `${base}/m`, slackBotToken: 'xoxb-test', slackBaseUrl: `${base}/s`, ledgerPrepFrom: ago(30).slice(0, 10) };
}
async function run() {
  const q = await enqueue(db, { kind: 'ledger.prep', recordId: 'ledger-prep', input: {}, dryRun: false, maxAttempts: 2, deadlineMs: 60_000 });
  for (let i = 0; i < 10; i++) { await runOnce(db, cfg()); const j = await getJob(db, q.job.id); if (['succeeded', 'failed', 'needs_review'].includes(j!.job.status)) return j!; }
  throw new Error('job did not settle');
}

test('checker mode: never writes to Xero; flags a 10-day-old line once; a 1-day-old line waits; fixed lines clear', { skip }, async () => {
  const j = await run();
  assert.equal(j.job.status, 'succeeded', j.job.error ?? '');
  assert.match(String(j.job.result.message), /3 Mercury lines checked: 0 in Xero, 1 not in Xero after 3\+ days \(1 new\)/);
  assert.deepEqual(writes, [], 'nothing written to Xero');
  assert.equal(posts.length, 1);
  assert.match(posts[0], /Entry Checking · OPEX · -\$100: should be a transfer Entry Checking → OPEX/);
  assert.doesNotMatch(posts[0], /Commas/, 'a line from yesterday is not flagged yet');
  // Next day, still missing: not posted again.
  await run();
  assert.equal(posts.length, 1, 'flagged once');
  // Alex (or Claude in Chrome) reconciles it: Xero now has the transfer → marked in Xero.
  xeroTransfers = [{ FromBankAccount: { AccountID: 'A-entry' }, ToBankAccount: { AccountID: 'A-opex' }, Amount: 100, DateString: ago(10).slice(0, 19) }];
  const k = await run();
  assert.match(String(k.job.result.message), /1 in Xero, 0 not in Xero/);
  assert.equal((await db.query(`SELECT action FROM ledger_entries WHERE mercury_id='t-old'`)).rows[0].action, 'exists');
  assert.deepEqual(writes, [], 'still nothing written');
});

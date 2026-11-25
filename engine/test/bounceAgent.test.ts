// The bounce agent: sort each bounce by cause, name the cause + one fix, and on ✅ apply it.
import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { createPool, migrate, type Db } from '../src/db/pool.js';
import { loadConfig, type Config } from '../src/config.js';
import { enqueue, getJob } from '../src/queue.js';
import { runOnce } from '../src/worker.js';
import { classifyBounce, gatewayOf, diagnose, readBounce, type Bounce } from '../src/campaign/bounceDiagnosis.js';
import { startFakeBison, type FakeBison } from './fakes/bison.js';

const url = process.env.TEST_DATABASE_URL;
const skip = !url ? 'TEST_DATABASE_URL not set' : false;
let db: Db, bison: FakeBison;

function cfg(over: Partial<Config> = {}): Config {
  return { ...loadConfig({ ENGINE_SECRET: 'x'.repeat(40), DATABASE_URL: url ?? 'postgres://x' } as NodeJS.ProcessEnv), emailBisonKeys: { dulcy: bison.key }, emailBisonBaseUrl: bison.url, dryRun: false, liveStages: ['bounce.check', 'bounce.investigate', 'bounce.fix'], ...over };
}
async function run(conf: Config, kind: string, input: Record<string, unknown>) {
  const q = await enqueue(db, { kind, recordId: kind, input, dryRun: conf.dryRun && !conf.liveStages.includes(kind), maxAttempts: 3, deadlineMs: 60_000 });
  for (let i = 0; i < 15; i++) { await runOnce(db, conf); const j = await getJob(db, q.job.id); if (['succeeded', 'failed', 'needs_review'].includes(j!.job.status)) return j!; }
  throw new Error('job did not settle');
}
const notice = (body: string, sender = '11', lead = 'jane@acme.com') => ({ subject: 'Undeliverable', text_body: body, sender_email_id: Number(sender), lead: { email: lead } });

before(async () => { bison = await startFakeBison(); if (skip) return; db = createPool(url!); await migrate(db); });
after(async () => { bison.close(); if (!skip) await db.end(); });
beforeEach(async () => {
  Object.assign(bison, { calls: [], workspaces: [{ id: 2, name: 'Dulcy' }, { id: 66, name: 'Twenty West' }], campaigns: [
    { id: 604, name: 'TW Contractors', status: 'active', bounced: 60, contacted: 1000, progress: 50, leads: new Set<string>(), senders: ['11', '12', '13', '14'], steps: [], team: 66 },
  ] });
  (bison as any).senderStats = {}; (bison as any).bounces = {};
  if (!skip) await db.query('TRUNCATE jobs, steps, receipts, events RESTART IDENTITY CASCADE');
});

test('each bounce notice is sorted by cause; security gateways are named', () => {
  assert.equal(classifyBounce('550 5.1.1 The email account that you tried to reach does not exist'), 'bad_address');
  assert.equal(classifyBounce('550 5.7.1 Message rejected due to spam content / poor reputation'), 'blocked');
  assert.equal(classifyBounce('552 5.2.2 Mailbox full'), 'mailbox_full');
  assert.equal(classifyBounce('delivery delayed'), 'other');
  assert.equal(gatewayOf('Remote server: us-smtp-inbound-1.mimecast.com rejected'), 'Mimecast');
  assert.equal(gatewayOf('mx0a-001.pphosted.com said: blocked'), 'Proofpoint');
  const b = readBounce(notice('Your message to bob@acme.com could not be delivered: user unknown', '12', ''), new Set(['inbox12@dulcy-mail.com']));
  assert.equal(b.recipient, 'bob@acme.com');
  assert.equal(b.senderId, '12');
  assert.equal(b.kind, 'bad_address');
});

test('diagnosis: bad addresses → the list; blocks from a few inboxes → remove them and resume; tiny sample → too early', () => {
  const inboxes = ['11', '12', '13', '14'].map((id) => ({ id, email: `i${id}@x.com`, status: 'connected', sent: 500, bounced: 10 }));
  const c = { bounce: 6, contacted: 1000, bounced: 60, progress: 50 };
  const bad: Bounce[] = Array.from({ length: 10 }, (_, i) => ({ senderId: String(11 + (i % 4)), recipient: `p${i}@a.com`, kind: 'bad_address', gateway: '' }));
  const list = diagnose(c, inboxes, bad);
  assert.equal(list.cause, 'list');
  assert.equal(list.action, 'None', 'a list fix changes leads: proposed, not automatic');
  assert.match(list.fix, /Re-verify/);

  const blocked: Bounce[] = Array.from({ length: 10 }, (_, i) => ({ senderId: i < 8 ? '13' : '11', recipient: `p${i}@a.com`, kind: 'blocked', gateway: '' }));
  const inb = diagnose(c, inboxes, blocked);
  assert.equal(inb.cause, 'inboxes');
  assert.equal(inb.action, 'Remove Inboxes and Resume');
  assert.deepEqual(inb.removeSenderIds, ['13']);

  const gw: Bounce[] = Array.from({ length: 10 }, (_, i) => ({ senderId: String(11 + (i % 4)), recipient: `p${i}@a.com`, kind: 'blocked', gateway: i < 6 ? 'Mimecast' : '' }));
  assert.equal(diagnose(c, inboxes, gw).cause, 'gateway');

  assert.equal(diagnose({ ...c, contacted: 100, bounced: 6 }, inboxes, bad).action, 'Resume Campaign');
});

test('bounce check → bounce agent: the paused campaign is investigated once and the cause + fix comes back', { skip }, async () => {
  (bison as any).bounces = { 604: [
    ...Array.from({ length: 7 }, (_, i) => notice('550 5.7.1 blocked: listed on Spamhaus', '13', `p${i}@a.com`)),
    ...Array.from({ length: 2 }, (_, i) => notice('550 5.1.1 user unknown', '11', `q${i}@b.com`)),
  ] };
  (bison as any).senderStats = { 13: { emails_sent_count: 300, bounced_count: 40 }, 11: { emails_sent_count: 300, bounced_count: 3 }, 12: { emails_sent_count: 300, bounced_count: 2 }, 14: { emails_sent_count: 300, bounced_count: 1 } };
  const conf = cfg();
  const chk = await run(conf, 'bounce.check', { workspace: 'all' });
  assert.equal(chk.job.status, 'succeeded', chk.job.error ?? '');
  assert.match(chk.job.result.message, /1 sent to the bounce agent/);
  for (let i = 0; i < 10; i++) await runOnce(db, conf);
  const inv = (await db.query(`SELECT status, result, input FROM jobs WHERE kind='bounce.investigate'`)).rows;
  assert.equal(inv.length, 1);
  assert.equal(inv[0].status, 'succeeded');
  assert.equal(inv[0].result.cause, 'inboxes');
  assert.equal(inv[0].result.action, 'Remove Inboxes and Resume');
  assert.equal(inv[0].input.teamId, 66);
  // The next check (campaign is paused now) does not investigate again.
  const again = await run(conf, 'bounce.check', { workspace: 'all' });
  assert.doesNotMatch(again.job.result.message, /bounce agent/);
  assert.ok((await db.query(`SELECT 1 FROM jobs WHERE kind='bounce.investigate'`)).rows.length <= 2);
});

test('old paused campaigns are not swept up (only what this check pauses or flags)', { skip }, async () => {
  bison.campaigns[0].status = 'paused';
  const a = await run(cfg(), 'bounce.check', { workspace: 'all' });
  assert.doesNotMatch(a.job.result.message, /bounce agent/);
});

test('✅ fix: the burned inbox is removed and the campaign resumes; never left with no inboxes', { skip }, async () => {
  bison.campaigns[0].status = 'paused';
  const j = await run(cfg(), 'bounce.fix', { teamId: 66, campaignId: 604, removeSenderIds: ['13'], name: 'TW Contractors' });
  assert.equal(j.job.status, 'succeeded', j.job.error ?? '');
  assert.deepEqual(bison.campaigns[0].senders, ['11', '12', '14']);
  assert.equal(bison.campaigns[0].status, 'active');
  assert.match(j.job.result.message, /1 inbox\(es\) removed, resumed/);

  await db.query('TRUNCATE jobs, steps, receipts, events RESTART IDENTITY CASCADE');
  bison.campaigns[0].status = 'paused';
  const none = await run(cfg(), 'bounce.fix', { teamId: 66, campaignId: 604, removeSenderIds: ['11', '12', '14'] });
  assert.equal(none.job.status, 'needs_review');
  assert.equal(bison.campaigns[0].status, 'paused', 'nothing changed');
});

// The bounce agent: sort each bounce by cause, name the cause + one fix, and on ✅ apply it.
import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { createPool, migrate, type Db } from '../src/db/pool.js';
import { loadConfig, type Config } from '../src/config.js';
import { enqueue, getJob } from '../src/queue.js';
import { runOnce } from '../src/worker.js';
import { classifyBounce, gatewayOf, diagnose, readBounce, codeOf, providerOfMx, type Bounce } from '../src/campaign/bounceDiagnosis.js';
import { bounceTaskQueued, setMxLookup } from '../src/stages/bounceAgent.js';
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

before(async () => { setMxLookup(async (d) => (d.startsWith('pp') ? 'mx0a.pphosted.com' : 'aspmx.l.google.com')); bison = await startFakeBison(); if (skip) return; db = createPool(url!); await migrate(db); });
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

test('Alex\'s method: step 1 codes (verification vs spam), step 2 domain / account / copy, step 3 where the bounces land', () => {
  assert.equal(codeOf('Remote server returned 550 5.1.1 user unknown'), '5.1.1');
  assert.equal(providerOfMx('mx0b-00123.pphosted.com'), 'Proofpoint');
  assert.equal(providerOfMx('acme-com.mail.protection.outlook.com'), 'Microsoft 365');
  assert.equal(providerOfMx('mail.acme-plumbing.com'), 'Custom mail server');
  const inboxes = ['11', '12', '13', '14'].map((id) => ({ id, email: `i${id}@d${id}.com`, status: 'connected', sent: 500, bounced: 10 }));
  const c = { bounce: 6, contacted: 1000, bounced: 60, progress: 50 };
  const mk = (k: number, f: (i: number) => Partial<Bounce>): Bounce[] => Array.from({ length: k }, (_, i) => ({ senderId: String(11 + (i % 4)), recipient: `p${i}@a.com`, kind: 'blocked', gateway: '', provider: 'Google', ...f(i) }));

  // Step 1: most bounces "not found" → verification (the list).
  const v = diagnose(c, inboxes, mk(10, () => ({ kind: 'bad_address', code: '5.1.1' })));
  assert.equal(v.cause, 'verification');
  assert.match(v.fix, /Re-verify/);
  assert.equal(v.action, 'None', 'a list fix changes leads: proposed, not automatic');
  // Microsoft 365 also sends the not-found notices: still verification, not a filter problem.
  assert.equal(diagnose(c, inboxes, [...mk(17, () => ({ kind: 'bad_address', provider: 'Microsoft 365' })), ...mk(3, () => ({})), ...mk(15, () => ({ kind: 'other' }))]).cause, 'verification');

  // Step 2a: blocks pile up on one email account → remove it and resume.
  const acct = diagnose(c, inboxes, mk(10, (i) => ({ senderId: i < 8 ? '13' : '11' })));
  assert.equal(acct.cause, 'account');
  assert.equal(acct.action, 'Remove Inboxes and Resume');
  assert.deepEqual(acct.removeSenderIds, ['13']);
  // Step 2b: blacklist / reputation notices, or risky .info domains → our domain.
  assert.equal(diagnose(c, inboxes, mk(10, () => ({ spamHint: 'domain' }))).cause, 'domain');
  const info = inboxes.map((x) => ({ ...x, email: x.email.replace('.com', '.info') }));
  assert.match(diagnose(c, info, mk(20, () => ({}))).fix, /\.info domains/);
  // Step 2c: blocks spread evenly, nothing pointing at domains or accounts → the copy.
  const copy = diagnose(c, inboxes, mk(20, () => ({})));
  assert.equal(copy.cause, 'copy');
  assert.equal(copy.action, 'None', 'one inbox with a few blocks is not proof');
  assert.match(diagnose({ ...c, paused: false }, inboxes, mk(20, () => ({}))).fix, /Pause it \(Skip Bounce Pause is ticked/);

  // Step 3: 50%+ of the bounces land on Proofpoint → stop sending to Proofpoint.
  const seg = diagnose(c, inboxes, mk(10, (i) => ({ provider: i < 6 ? 'Proofpoint' : 'Google' })));
  assert.equal(seg.cause, 'gateway');
  assert.equal(seg.stopSendingTo, 'Proofpoint');
  assert.match(seg.fix, /Stop sending to Proofpoint/);
  // A custom mail server counts too; with a verification cause it is added as a second fix.
  const both = diagnose(c, inboxes, mk(10, (i) => ({ kind: 'bad_address', provider: i < 7 ? 'Custom mail server' : 'Google' })));
  assert.equal(both.cause, 'verification');
  assert.match(both.fix, /stop sending to Custom mail server/);

  assert.equal(diagnose({ ...c, contacted: 100, bounced: 6 }, inboxes, mk(10, () => ({}))).action, 'Resume Campaign');
  // Live MJJ 603: blacklist blocks across many of our domains, and 77% landing on custom servers → domain first, gateway as the second fix.
  const mjj = diagnose(c, inboxes, mk(10, (i) => ({ spamHint: 'domain', provider: i < 8 ? 'Custom mail server' : 'Google' })));
  assert.equal(mjj.cause, 'domain');
  assert.match(mjj.fix, /stop sending to Custom mail server/);
  // Step 3 is judged against the list: 77% of bounces on custom servers means nothing if 75% of the leads are there.
  const many = mk(10, (i) => ({ kind: 'bad_address', provider: i < 7 ? 'Custom mail server' : 'Google' }));
  assert.equal(diagnose(c, inboxes, many, new Map([['Custom mail server', 75], ['Google', 25]])).stopSendingTo, '');
  assert.equal(diagnose(c, inboxes, many, new Map([['Custom mail server', 30], ['Google', 70]])).stopSendingTo, 'Custom mail server');
  // Live TW 612: blocks spread 7/7/6/5 over 25 one-inbox domains is not "2 accounts".
  const tw = Array.from({ length: 25 }, (_, k) => ({ id: String(100 + k), email: `r@tw${k}.info`, status: 'connected', sent: 1000, bounced: 30 }));
  const spread612 = Array.from({ length: 51 }, (_, i) => ({ senderId: String(100 + (i < 14 ? (i < 7 ? 0 : 1) : 2 + (i % 23))), recipient: `x${i}@y.com`, kind: 'blocked' as const, gateway: '', provider: 'Microsoft 365' }));
  const d612 = diagnose(c, tw, spread612);
  assert.notEqual(d612.cause, 'account');
  assert.equal(d612.cause, 'domain', '.info domains');
  // A link blacklist (SURBL) hit says to take links to our domains out of the email.
  const surbl = Array.from({ length: 10 }, (_, i) => ({ senderId: String(11 + (i % 4)), recipient: `u${i}@y.com`, kind: 'blocked' as const, gateway: '', provider: 'Custom mail server', spamHint: 'domain' as const, urlListed: true }));
  assert.match(diagnose(c, inboxes, surbl).fix, /take links to our sending domains out of the email/);
  // Live TMC 633: 4.4.4 (no route to the domain) is a dead address.
  assert.equal(classifyBounce('450 4.4.4 Unable to route the message'), 'bad_address');
});

test('bounce check → bounce agent: the paused campaign is investigated once and the cause + fix comes back', { skip }, async () => {
  (bison as any).bounces = { 604: [
    ...Array.from({ length: 7 }, (_, i) => notice('550 5.7.1 blocked: listed on Spamhaus', '13', `p${i}@a.com`)),
    ...Array.from({ length: 2 }, (_, i) => notice('550 5.1.1 user unknown', '11', `q${i}@b.com`)),
  ] };
  (bison as any).senderStats = { 13: { emails_sent_count: 300, bounced_count: 40 }, 11: { emails_sent_count: 300, bounced_count: 3 }, 12: { emails_sent_count: 300, bounced_count: 2 }, 14: { emails_sent_count: 300, bounced_count: 1 } };
  const conf = cfg();
  await db.query(`DELETE FROM hq_agent_tasks`);
  const chk = await run(conf, 'bounce.check', { workspace: 'all' });
  assert.equal(chk.job.status, 'succeeded', chk.job.error ?? '');
  assert.match(chk.job.result.message, /1 sent to the bounce agent/);
  // HQ: the investigation is Riley's task from the moment it is queued (with the job to re-queue).
  const queued = (await db.query(`SELECT agent, status, progress_note, job_kind, job_record FROM hq_agent_tasks WHERE source_key='bounce:66:604'`)).rows[0];
  assert.deepEqual([queued.agent, queued.status, queued.job_kind, queued.job_record], ['Riley', 'in_progress', 'bounce.investigate', 'bounce-investigate:604']);
  assert.match(queued.progress_note, /Queued/);
  for (let i = 0; i < 10; i++) await runOnce(db, conf);
  const inv = (await db.query(`SELECT status, result, input FROM jobs WHERE kind='bounce.investigate'`)).rows;
  assert.equal(inv.length, 1);
  assert.equal(inv[0].status, 'succeeded');
  assert.equal(inv[0].result.cause, 'account');
  assert.equal(inv[0].result.action, 'Remove Inboxes and Resume');
  assert.equal(inv[0].input.teamId, 66);
  // Diagnosed; the fix needs Alex (no Airtable here, so nothing was fixed automatically): waiting on him, nothing to re-queue.
  const t = (await db.query(`SELECT status, progress_note, job_kind, link FROM hq_agent_tasks WHERE source_key='bounce:66:604'`)).rows[0];
  assert.deepEqual([t.status, t.job_kind, t.link], ['waiting_alex', null, 'decisions/Campaigns']);
  assert.match(t.progress_note, /Fix waiting for your OK/);
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
  await db.query(`DELETE FROM hq_agent_tasks`);
  await bounceTaskQueued(db, { teamId: 66, campaignId: 604, name: '[TW] TW Contractors', bounce: 6 }, 'bounce-investigate:604');
  const j = await run(cfg(), 'bounce.fix', { teamId: 66, campaignId: 604, removeSenderIds: ['13'], name: 'TW Contractors' });
  assert.equal(j.job.status, 'succeeded', j.job.error ?? '');
  assert.deepEqual(bison.campaigns[0].senders, ['11', '12', '14']);
  assert.equal(bison.campaigns[0].status, 'active');
  assert.match(j.job.result.message, /1 inbox\(es\) removed, resumed/);
  const task = (await db.query(`SELECT title, status, progress_note, done_at FROM hq_agent_tasks WHERE source_key='bounce:66:604'`)).rows[0];
  assert.deepEqual([task.title, task.status], ['Bounce check: TW Contractors (6%)', 'done']);
  assert.match(task.progress_note, /^Fixed: 1 inbox\(es\) removed/);
  assert.ok(task.done_at, 'the fix closes Riley\'s task');

  await db.query('TRUNCATE jobs, steps, receipts, events RESTART IDENTITY CASCADE');
  bison.campaigns[0].status = 'paused';
  const none = await run(cfg(), 'bounce.fix', { teamId: 66, campaignId: 604, removeSenderIds: ['11', '12', '14'] });
  assert.equal(none.job.status, 'needs_review');
  assert.equal(bison.campaigns[0].status, 'paused', 'nothing changed');
});

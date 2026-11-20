// Verify stage tests. Rules are tested on their own; the stage is tested end to end
// against a fake MillionVerifier server (real HTTP, no real credits).
import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { createPool, migrate, type Db } from '../src/db/pool.js';
import { loadConfig, type Config } from '../src/config.js';
import { enqueue, getJob } from '../src/queue.js';
import { runOnce } from '../src/worker.js';
import { NeedsReviewError, PermanentError } from '../src/errors.js';
import { buildCandidates, mapVerdict, parseResults, buildOutputs, chooseCompanyEmail, isPersonalEmail, type InputRow } from '../src/verify/rules.js';
import { startFakeGoogle, type FakeGoogle } from './fakes/google.js';

const url = process.env.TEST_DATABASE_URL;
const skip = !url ? 'TEST_DATABASE_URL not set' : false;
const REC = 'recBBBBBBBBBBBBBB';
const KEY = 'test-key';
let db: Db;
let google: FakeGoogle;

// ---------- fake MillionVerifier ----------
interface Fake {
  uploads: number; infoCalls: number; downloads: number;
  jobs: Map<string, string[]>;
  statusSeq: string[];
  uploadHttp: number;
  extraEmailInDownload: boolean;
  verdict: (email: string) => string;
}
const fake: Fake = { uploads: 0, infoCalls: 0, downloads: 0, jobs: new Map(), statusSeq: ['finished'], uploadHttp: 200, extraEmailInDownload: false, verdict: () => 'ok' };
function resetFake() {
  Object.assign(fake, { uploads: 0, infoCalls: 0, downloads: 0, jobs: new Map(), statusSeq: ['finished'], uploadHttp: 200, extraEmailInDownload: false });
  fake.verdict = (e) => (e.startsWith('bad') ? 'invalid' : e.startsWith('catch') ? 'catch_all' : e.startsWith('pend') ? '' : 'ok');
}
let mvServer: http.Server;
let mvUrl = '';

function startFake(): Promise<void> {
  mvServer = http.createServer(async (req, res) => {
    const u = new URL(req.url ?? '/', 'http://x');
    if (u.searchParams.get('key') !== KEY) { res.writeHead(401); return res.end('{"error":"bad key"}'); }
    const chunks: Buffer[] = [];
    for await (const c of req) chunks.push(c as Buffer);
    const body = Buffer.concat(chunks).toString();
    if (u.pathname === '/bulkapi/v2/upload') {
      fake.uploads++;
      if (fake.uploadHttp !== 200) { res.writeHead(fake.uploadHttp); return res.end('{"error":"nope"}'); }
      const emails = body.split(/\r?\n/).filter((l) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(l.trim())).map((l) => l.trim());
      const id = `job-${fake.uploads}`;
      fake.jobs.set(id, emails);
      res.writeHead(200, { 'content-type': 'application/json' });
      return res.end(JSON.stringify({ file_id: id, status: 'in_progress' }));
    }
    const id = u.searchParams.get('file_id') ?? '';
    if (u.pathname === '/bulkapi/v2/fileinfo') {
      const status = fake.statusSeq[Math.min(fake.infoCalls, fake.statusSeq.length - 1)];
      fake.infoCalls++;
      res.writeHead(200, { 'content-type': 'application/json' });
      return res.end(JSON.stringify({ file_id: id, status, percent: status === 'finished' ? 100 : 40 }));
    }
    if (u.pathname === '/bulkapi/v2/download') {
      fake.downloads++;
      const emails = [...(fake.jobs.get(id) ?? [])];
      if (fake.extraEmailInDownload) emails.push('stranger@else.com');
      const lines = ['email,quality,result', ...emails.map((e) => `${e},x,${fake.verdict(e)}`)];
      res.writeHead(200, { 'content-type': 'text/csv' });
      return res.end(lines.join('\n'));
    }
    res.writeHead(404); res.end();
  });
  return new Promise((r) => mvServer.listen(0, () => { mvUrl = `http://localhost:${(mvServer.address() as { port: number }).port}`; r(); }));
}

function cfg(over: Partial<Config> = {}): Config {
  return {
    ...loadConfig({ ENGINE_SECRET: 'x'.repeat(40), DATABASE_URL: url ?? 'postgres://x' } as NodeJS.ProcessEnv),
    millionVerifierApiKey: KEY, millionVerifierBaseUrl: mvUrl, verifyPollMs: 5, dryRun: false,
    googleKeyFile: google.keyFile, googleImpersonateUser: 'scale@dulcy.io', googleSheetsBaseUrl: google.url, ...over,
  };
}

before(async () => { await startFake(); google = await startFakeGoogle(); if (skip) return; db = createPool(url!); await migrate(db); });
after(async () => { mvServer.close(); google.close(); if (!skip) await db.end(); });
beforeEach(async () => { resetFake(); if (!skip) await db.query('TRUNCATE jobs, steps, receipts, events RESTART IDENTITY CASCADE'); });

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
async function runUntilSettled(c: Config, jobId: number, max = 40) {
  for (let i = 0; i < max; i++) {
    await runOnce(db, c);
    const j = await getJob(db, jobId);
    if (['succeeded', 'failed', 'needs_review'].includes(j!.job.status)) return j!;
    await sleep(10);
  }
  throw new Error('job did not settle');
}

const ROWS: InputRow[] = [
  { email: 'ann@acme.com', firstName: 'Ann', lastName: 'Lee', domain: 'acme.com', company: 'Acme' },
  { email: 'ANN@acme.com ', firstName: 'Ann', lastName: 'Lee', domain: 'acme.com', company: 'Acme' }, // duplicate
  { email: 'info@acme.com', company: 'Acme', footprint: 50 },                                      // role inbox -> generic
  { email: 'bad1@beta.com', firstName: 'Bo', lastName: 'Ng', domain: 'beta.com', company: 'Beta' },
  { email: 'catch1@gamma.com', firstName: 'Cy', lastName: 'Ra', domain: 'gamma.com', company: 'Gamma' },
  { email: 'hello@delta.com', type: 'generic', company: 'Delta', footprint: 120 },
  { email: '', firstName: 'No', lastName: 'Mail', company: 'Eps' },                                // missing email
];
const enqueueVerify = (input: Record<string, unknown>, dryRun = false, deadlineMs = 60_000) =>
  enqueue(db, { kind: 'leadlist.verify', recordId: REC, dryRun, input, maxAttempts: 5, deadlineMs });

// ---------- rules ----------
test('verdicts: catch-all and unknown are never Good; blank is Pending; unknown verdict needs review', () => {
  assert.equal(mapVerdict('ok'), 'Good');
  assert.equal(mapVerdict('catch_all'), 'Risky');
  assert.equal(mapVerdict('unknown'), 'Risky');
  assert.equal(mapVerdict('disposable'), 'Bad');
  assert.equal(mapVerdict(''), 'Pending');
  assert.throws(() => mapVerdict('maybe'), NeedsReviewError);
});

test('candidates: dedupe, generic detection, footprint filter, identity holds, missing and malformed emails', () => {
  const rows: InputRow[] = [
    ...ROWS,
    { email: 'big@zeta.com', type: 'generic', company: 'Zeta', footprint: 900 },
    { email: 'shared@x.com', linkedin: 'linkedin.com/in/a', firstName: 'A' },
    { email: 'shared@x.com', linkedin: 'linkedin.com/in/b', firstName: 'B' },
    { email: 'p1@y.com', linkedin: 'https://www.linkedin.com/in/same/' },
    { email: 'p2@y.com', linkedin: 'linkedin.com/in/same' },
    { email: 'not-an-email', firstName: 'Z' },
  ];
  const s = buildCandidates(rows, { includeDirect: true, includeGeneric: true, genericFootprintMax200: true });
  assert.deepEqual(s.send.map((c) => `${c.email}:${c.kind}`).sort(),
    ['ann@acme.com:direct', 'bad1@beta.com:direct', 'catch1@gamma.com:direct', 'hello@delta.com:generic', 'info@acme.com:generic']);
  assert.equal(s.duplicates, 1);
  assert.equal(s.droppedFootprint, 1);
  assert.equal(s.missingEmail.length, 1);
  assert.equal(s.invalidSyntax.length, 1);
  assert.deepEqual(s.holds.map((h) => h.email).sort(), ['p1@y.com', 'p2@y.com', 'shared@x.com', 'shared@x.com']);
  const direct = buildCandidates(rows, { includeDirect: true, includeGeneric: false, genericFootprintMax200: false });
  assert.ok(direct.send.every((c) => c.kind === 'direct'));
  assert.throws(() => buildCandidates(rows, { includeDirect: false, includeGeneric: false, genericFootprintMax200: false }), PermanentError);
});

test('results file is strict: unexpected, duplicate or missing emails need review', () => {
  assert.equal(parseResults('"email","result"\n"a@x.com","ok"\n', ['a@x.com'])[0].verdict, 'Good');
  assert.throws(() => parseResults('email,result\na@x.com,ok\nb@x.com,ok', ['a@x.com']), NeedsReviewError);
  assert.throws(() => parseResults('email,result\na@x.com,ok\na@x.com,ok', ['a@x.com']), NeedsReviewError);
  assert.throws(() => parseResults('email,result\na@x.com,ok', ['a@x.com', 'b@x.com']), /reuse the saved job/);
  assert.throws(() => parseResults('foo,bar\n1,2', ['a@x.com']), NeedsReviewError);
  // The old n8n generic formula: personal mailboxes out, own domain only, blocked inboxes out, ONE per company by preference.
  assert.deepEqual(chooseCompanyEmail(['sales@spa.com', 'info@spa.com', 'hello@spa.com'], 'spa.com'), ['info@spa.com']);
  assert.deepEqual(chooseCompanyEmail(['boulder@spa.com', 'brea@spa.com', 'reno@spa.com', 'pr@spa.com'], 'https://www.spa.com/'), ['boulder@spa.com']);
  assert.deepEqual(chooseCompanyEmail(['unsubscribe@spa.com', 'privacy@spa.com', 'careers@spa.com', 'marketing@spa.com', 'support@spa.com'], 'spa.com'), ['support@spa.com']);
  assert.deepEqual(chooseCompanyEmail(['glowspa@gmail.com', 'spa@yahoo.co.uk', 'smsinfo@thryv.com', 'dev@webdesigner.com'], 'spa.com'), []);
  assert.deepEqual(chooseCompanyEmail(['info@book.spa.com'], 'spa.com'), ['info@book.spa.com']);
  assert.deepEqual(chooseCompanyEmail(['customer.service@spa.com', 'team@spa.com'], 'spa.com'), ['customer.service@spa.com']);
  assert.equal(isPersonalEmail('a@hotmail.co.uk'), true);
  assert.equal(isPersonalEmail('info@spa.com'), false);
  // A tiny silent gap (seen live: 1,937 of 1,938) counts as Risky, never Good; a bigger one needs review.
  const many = Array.from({ length: 1000 }, (_, i) => `p${i}@x.com`);
  const file = (n: number) => 'email,result\n' + many.slice(0, n).map((e) => `${e},ok`).join('\n');
  const gap = parseResults(file(999), many);
  assert.equal(gap.length, 1000);
  assert.deepEqual(gap.find((r) => r.email === 'p999@x.com'), { email: 'p999@x.com', verdict: 'Risky', detail: 'not_returned_by_millionverifier' });
  assert.throws(() => parseResults(file(994), many), /reuse the saved job/);
  const s = buildCandidates([{ email: 'a@x.com' }, { email: 'pend@x.com' }], { includeDirect: true, includeGeneric: true, genericFootprintMax200: false });
  const out = buildOutputs(s, parseResults('email,result\na@x.com,ok\npend@x.com,', ['a@x.com', 'pend@x.com']));
  assert.deepEqual(out.pendingEmails, ['pend@x.com']);
});

test('config: number settings come from the given env', () => {
  const c = loadConfig({ ENGINE_SECRET: 'x'.repeat(40), DATABASE_URL: 'postgres://x', CAP_PER_JOB: '123', VERIFY_POLL_MS: '7' } as NodeJS.ProcessEnv);
  assert.equal(c.capPerJob, 123);
  assert.equal(c.verifyPollMs, 7);
});

// ---------- stage, end to end ----------
test('verify: uploads once, waits while MillionVerifier works, then splits Good/Risky/Bad', { skip }, async () => {
  fake.statusSeq = ['in_progress', 'in_progress', 'finished'];
  const q = await enqueueVerify({ rows: ROWS, genericFootprintMax200: true });
  const j = await runUntilSettled(cfg(), q.job.id);
  assert.equal(j.job.status, 'succeeded');
  assert.equal(fake.uploads, 1);
  assert.ok(j.job.attempts <= 1, 'waiting must not use up attempts');
  const r = j.job.result;
  // sent 5: ann ok, info ok, bad1 invalid, catch1 catch_all, hello ok; + 1 missing email = Risky
  assert.deepEqual(r.counts, { good: 3, risky: 2, bad: 1, pending: 0, held: 0, sent: 5 });
  assert.equal(r.finalDirectCount, 1);
  assert.equal(r.finalGenericCount, 2);
  assert.equal(r.airtablePreview['Number of leads'], 3);
  assert.equal(r.millionVerifierJobId, 'job-1');
  const rec = await db.query(`SELECT status, units FROM receipts`);
  assert.deepEqual(rec.rows.map((x) => [x.status, Number(x.units)]), [['done', 5]]);
});

test('verify: a new job for the same list reuses the saved MillionVerifier job (never pays twice)', { skip }, async () => {
  const a = await enqueueVerify({ rows: ROWS });
  assert.equal((await runUntilSettled(cfg(), a.job.id)).job.status, 'succeeded');
  const b = await enqueueVerify({ rows: ROWS });
  const jb = await runUntilSettled(cfg(), b.job.id);
  assert.equal(jb.job.status, 'succeeded');
  assert.equal(fake.uploads, 1);
  assert.equal(jb.job.result.millionVerifierJobId, 'job-1');
});

test('verify: a smaller set of the same list reuses the earlier MillionVerifier job (no new upload)', { skip }, async () => {
  const a = await enqueueVerify({ rows: ROWS });
  assert.equal((await runUntilSettled(cfg(), a.job.id)).job.status, 'succeeded');
  assert.equal(fake.uploads, 1);
  // Same list, one generic email fewer (e.g. the one-per-company formula): every email is already verified.
  const fewer = ROWS.filter((r: any) => r.email !== 'hello@delta.com');
  const b = await enqueueVerify({ rows: fewer });
  const jb = await runUntilSettled(cfg(), b.job.id);
  assert.equal(jb.job.status, 'succeeded');
  assert.equal(fake.uploads, 1, 'no second upload');
  assert.equal(jb.job.result.reusedEarlierJob, true);
  assert.equal(jb.job.result.millionVerifierJobId, 'job-1');
  assert.match(jb.job.result.message, /reused from MillionVerifier job job-1/);
  // A set with a NEW email (e.g. ContraGen added a contact): ONLY the new email is uploaded;
  // the rest keep their earlier results (never paid twice).
  const c = await enqueueVerify({ rows: [...ROWS, { email: 'new@epsilon.com', type: 'direct', firstName: 'New', lastName: 'Person', domain: 'epsilon.com' }] });
  const jc = await runUntilSettled(cfg(), c.job.id);
  assert.equal(jc.job.status, 'succeeded', jc.job.error);
  assert.equal(fake.uploads, 2);
  assert.deepEqual(fake.jobs.get(jc.job.result.millionVerifierJobId), ['new@epsilon.com'], 'only the new email was sent');
  assert.equal(jc.job.result.alreadyVerified, 5);
  assert.deepEqual(jc.job.result.counts, { good: 4, risky: 2, bad: 1, pending: 0, held: 0, sent: 6 }, 'earlier results + the new one');
  assert.match(jc.job.result.message, /5 reused from earlier checks; only 1 new emails verified/);
  const units = (await db.query(`SELECT units FROM receipts ORDER BY created_at`)).rows.map((x) => Number(x.units));
  assert.deepEqual(units, [5, 1], 'paid for 5, then only for the 1 new email');
  // Run again with the same 6: everything is known from the two earlier jobs, nothing uploaded.
  const d = await enqueueVerify({ rows: [...ROWS, { email: 'new@epsilon.com', type: 'direct', firstName: 'New', lastName: 'Person', domain: 'epsilon.com' }] });
  const jd = await runUntilSettled(cfg(), d.job.id);
  assert.equal(jd.job.status, 'succeeded', jd.job.error);
  assert.equal(fake.uploads, 2, 'no third upload');
  assert.equal(jd.job.result.alreadyVerified, 6);
});

test('verify: a saved MillionVerifier Job ID is only checked and downloaded, never re-uploaded', { skip }, async () => {
  fake.jobs.set('old-77', ['ann@acme.com', 'info@acme.com', 'bad1@beta.com', 'catch1@gamma.com', 'hello@delta.com']);
  const q = await enqueueVerify({ rows: ROWS, existingJobId: 'old-77', expected: { good: 3, risky: 2, bad: 1 } });
  const j = await runUntilSettled(cfg(), q.job.id);
  assert.equal(j.job.status, 'succeeded');
  assert.equal(fake.uploads, 0);
  assert.equal(j.job.result.comparison.allMatch, true);
});

test('verify dry-run: no upload, returns the plan and the credits it would spend', { skip }, async () => {
  const q = await enqueueVerify({ rows: ROWS }, true);
  const j = await runUntilSettled(cfg({ dryRun: true }), q.job.id);
  assert.equal(j.job.status, 'succeeded');
  assert.equal(fake.uploads, 0);
  assert.equal(j.job.result.wouldSpendCredits, 5);
  const rec = await db.query(`SELECT status FROM receipts`);
  assert.deepEqual(rec.rows.map((x) => x.status), ['dry_run']);
});

test('verify dry-run with a saved job: free check and download for the side-by-side comparison', { skip }, async () => {
  fake.jobs.set('old-9', ['ann@acme.com', 'info@acme.com', 'bad1@beta.com', 'catch1@gamma.com', 'hello@delta.com']);
  const q = await enqueueVerify({ rows: ROWS, existingJobId: 'old-9', expected: { good: 3, bad: 2 } }, true);
  const j = await runUntilSettled(cfg({ dryRun: true }), q.job.id);
  assert.equal(j.job.status, 'succeeded');
  assert.equal(fake.uploads, 0);
  assert.equal(fake.downloads, 1);
  assert.equal(j.job.result.comparison.allMatch, false);
  assert.deepEqual(j.job.result.comparison.rows.find((x: { field: string }) => x.field === 'bad'), { field: 'bad', expected: 2, actual: 1, match: false });
});

test('verify: an upload with an unclear outcome (HTTP 500) is never retried; it goes to review', { skip }, async () => {
  fake.uploadHttp = 500;
  const q = await enqueueVerify({ rows: ROWS });
  await runOnce(db, cfg());
  assert.equal((await getJob(db, q.job.id))!.job.status, 'queued'); // retry scheduled with backoff
  await db.query(`UPDATE jobs SET run_after = now() WHERE id = $1`, [q.job.id]);
  fake.uploadHttp = 200;
  const j = await runUntilSettled(cfg(), q.job.id);
  assert.equal(j.job.status, 'needs_review');
  assert.match(j.job.error, /unclear outcome/);
  assert.equal(fake.uploads, 1);
});

test('verify: a rejected upload (bad key) fails cleanly and leaves no pending receipt', { skip }, async () => {
  const q = await enqueueVerify({ rows: ROWS });
  const j = await runUntilSettled(cfg({ millionVerifierApiKey: 'wrong' }), q.job.id);
  assert.equal(j.job.status, 'failed');
  assert.match(j.job.error, /rejected: HTTP 401/);
  assert.ok(!String(j.job.error).includes('wrong'), 'the key never appears in errors');
  const rec = await db.query(`SELECT status FROM receipts`);
  assert.deepEqual(rec.rows.map((x) => x.status), ['failed']);
});

test('verify: a list over the credit cap stops before uploading', { skip }, async () => {
  const q = await enqueueVerify({ rows: ROWS });
  const j = await runUntilSettled(cfg({ capPerJob: 3 }), q.job.id);
  assert.equal(j.job.status, 'needs_review');
  assert.match(j.job.error, /credit cap/);
  assert.equal(fake.uploads, 0);
});

test('verify: a results file that does not match the list goes to review', { skip }, async () => {
  fake.extraEmailInDownload = true;
  const q = await enqueueVerify({ rows: ROWS });
  const j = await runUntilSettled(cfg(), q.job.id);
  assert.equal(j.job.status, 'needs_review');
  assert.match(j.job.error, /not in this list/);
});

test('verify: "waiting to start" right after upload is waited on, not sent to review (seen live)', { skip }, async () => {
  fake.statusSeq = ['wait_starting', 'wait_starting', 'finished'];
  const q = await enqueueVerify({ rows: ROWS });
  const j = await runUntilSettled(cfg(), q.job.id);
  assert.equal(j.job.status, 'succeeded', j.job.error);
  assert.equal(fake.uploads, 1);
});

test('verify: a job still not started after 30 minutes goes to review (no new upload)', { skip }, async () => {
  fake.statusSeq = ['wait_starting'];
  const q = await enqueueVerify({ rows: ROWS });
  await runOnce(db, cfg());
  await db.query(`UPDATE steps SET output = to_jsonb((extract(epoch from now()) * 1000 - 31 * 60000)::bigint) WHERE job_id = $1 AND step_key LIKE 'wait-start:%'`, [q.job.id]);
  const j = await runUntilSettled(cfg(), q.job.id);
  assert.equal(j.job.status, 'needs_review');
  assert.match(j.job.error, /30 minutes/);
  assert.equal(fake.uploads, 1);
});

test('verify: waiting stops at the time limit instead of running for hours', { skip }, async () => {
  fake.statusSeq = ['in_progress'];
  const q = await enqueueVerify({ rows: ROWS }, false, 80);
  const j = await runUntilSettled(cfg(), q.job.id, 100);
  assert.equal(j.job.status, 'failed');
  assert.match(j.job.error, /time limit/);
  assert.equal(fake.uploads, 1);
});

test('verify from the lead list sheet: reads Contacts + Expanded Companies, then verifies', { skip }, async () => {
  google.tabs = {
    Contacts: [['Email', 'First Name', 'Last Name', 'Domain'], ['ann@acme.com', 'Ann', 'Lee', 'acme.com'], ['bad1@beta.com', 'Bo', 'Ng', 'beta.com'], ['', 'No', 'Mail', 'eps.com']],
    'Expanded Companies': [['Name', 'Domain', 'Digital Footprint', 'Public Emails'], ['Acme', 'acme.com', '50', '["info@acme.com"]'], ['Huge', 'huge.com', '900', '["hello@huge.com"]']],
  };
  const q = await enqueueVerify({ source: { sheetId: 'https://docs.google.com/spreadsheets/d/1QYLOeUxwDXunQm_KMEYKB_7jW7l47ZQJ8wVVtCZBUd8/edit' }, genericFootprintMax200: true });
  const j = await runUntilSettled(cfg(), q.job.id);
  assert.equal(j.job.status, 'succeeded');
  assert.equal(fake.uploads, 1);
  assert.deepEqual(fake.jobs.get('job-1')!.sort(), ['ann@acme.com', 'bad1@beta.com', 'info@acme.com']);
  assert.deepEqual(j.job.result.counts, { good: 2, risky: 1, bad: 1, pending: 0, held: 0, sent: 3 });
  assert.equal(j.job.result.plan.droppedFootprint, 1);
});

test('verify writeFinalTabs: Final Direct / Final Generic tabs are written in the columns the campaign build reads', { skip }, async () => {
  google.tabs = {
    Contacts: [['Email', 'First Name', 'Last Name', 'Title', 'Company', 'Domain'], ['ann@acme.com', 'Ann', 'Lee', 'Owner', 'Acme', 'acme.com'], ['bad1@beta.com', 'Bo', 'Ng', 'CEO', 'Beta', 'beta.com']],
    'Expanded Companies': [['Name', 'Domain', 'Digital Footprint', 'Public Emails'], ['Acme', 'acme.com', '50', '["info@acme.com"]']],
  };
  const SHEET = '1QYLOeUxwDXunQm_KMEYKB_7jW7l47ZQJ8wVVtCZBUd8';
  google.written = {}; google.grid = {};
  const q = await enqueueVerify({ source: { sheetId: SHEET }, writeFinalTabs: true });
  const j = await runUntilSettled(cfg(), q.job.id);
  assert.equal(j.job.status, 'succeeded', j.job.error);
  assert.deepEqual(j.job.result.finalTabs, { direct: 1, generic: 1 });
  const direct = google.written[SHEET]['Final Direct'];
  assert.equal(direct[0][0], 'Email');
  assert.deepEqual(direct.slice(1).map((r) => r[0]), ['ann@acme.com'], 'only Good emails');
  const { prepareLeads } = await import('../src/campaign/rules.js');
  const p = prepareLeads(direct, { campaignId: 1, outputType: 'direct', tags: ['FIRST_NAME', 'COMPANY'] });
  assert.equal(p.rows.length, 1, 'the campaign build accepts the tab as written');
  assert.deepEqual(google.written[SHEET]['Final Generic'].slice(1).map((r) => r[0]), ['info@acme.com']);
});

test('verify: needs rows or a sheet', { skip }, async () => {
  const q = await enqueueVerify({});
  const j = await runUntilSettled(cfg(), q.job.id);
  assert.equal(j.job.status, 'failed');
  assert.match(j.job.error, /input.rows .* or input.source.sheetId/);
});

test('errors hide the person in an email', () => {
  assert.throws(() => parseResults('email,result\nlester@lampert.com,ok', ['a@x.com']), (e: Error) => e.message.includes('l***@lampert.com') && !e.message.includes('lester@'));
});

test('diagnose mode: a saved job that no longer matches the sheet is explained, not failed (counts only)', { skip }, async () => {
  google.tabs = {
    Contacts: [['Email', 'First Name', 'Last Name', 'Domain'], ['ann@acme.com', 'Ann', 'Lee', 'acme.com']],
    'Expanded Companies': [['Name', 'Domain', 'Public Emails', 'Excluded Personal Emails'], ['Acme', 'acme.com', '["info@acme.com"]', '["joe@acme.com"]']],
  };
  // Saved job verified 4 emails; today the sheet has 2 of them (+ joe moved to excluded, gone@old.com's company removed, bo@acme.com row deleted).
  fake.jobs.set('old-5', ['ann@acme.com', 'info@acme.com', 'joe@acme.com', 'gone@old.com', 'bo@acme.com']);
  const q = await enqueueVerify({ source: { sheetId: '1QYLOeUxwDXunQm_KMEYKB_7jW7l47ZQJ8wVVtCZBUd8' }, existingJobId: 'old-5', diagnose: true }, true);
  const j = await runUntilSettled(cfg({ dryRun: true }), q.job.id);
  assert.equal(j.job.status, 'succeeded');
  assert.equal(fake.uploads, 0);
  assert.deepEqual(j.job.result.diagnosis.whyNotInList, { heldByEngineForReview: 0, movedToExcludedPersonalEmails: 1, companyStillInListButEmailGone: 1, companyNoLongerInList: 1 });
  assert.equal(j.job.result.diagnosis.inFileNotInList, 3);
  assert.equal(j.job.result.counts.good, 2);
  assert.ok(!JSON.stringify(j.job.result.diagnosis).includes('@'), 'no emails in the diagnosis');
});

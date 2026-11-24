// Sean: waiting replies → Claude draft → Decision rows (reply / ask Alex / skip), each reply once.
import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createPool, migrate, type Db } from '../src/db/pool.js';
import { loadConfig, type Config } from '../src/config.js';
import { enqueue, getJob } from '../src/queue.js';
import { runOnce } from '../src/worker.js';
import { EMAILS, EF, RA, SETTINGS, REPLY_LEARNING, waitingFormula } from '../src/agents/emailsFields.js';
import { DECISIONS, DF } from '../src/decisions/fields.js';
import { clientFileFor } from '../src/agents/knowledge.js';

const url = process.env.TEST_DATABASE_URL;
const skip = !url ? 'TEST_DATABASE_URL not set' : false;
const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
let db: Db;
let atServer: http.Server, claudeServer: http.Server, atUrl = '', claudeUrl = '';
let emails: Record<string, Record<string, unknown>>, decisions: Record<string, Record<string, unknown>>, booked: Record<string, unknown>[], settings: Record<string, unknown>[], formulas: string[];
let claudeAnswers: Record<string, unknown>[], claudeCalls: any[];

function cfg(over: Partial<Config> = {}): Config {
  return { ...loadConfig({ ENGINE_SECRET: 'x'.repeat(40), DATABASE_URL: url ?? 'postgres://x' } as NodeJS.ProcessEnv),
    airtableApiKey: 'at', airtableBaseUrl: atUrl, anthropicApiKey: 'sk-test', anthropicBaseUrl: claudeUrl, knowledgeDir: REPO,
    dryRun: false, liveStages: ['sean.draft'], ...over };
}
async function run(conf: Config) {
  const q = await enqueue(db, { kind: 'sean.draft', recordId: 'sean', input: {}, dryRun: conf.dryRun && !conf.liveStages.includes('sean.draft'), maxAttempts: 3, deadlineMs: 60_000 });
  for (let i = 0; i < 10; i++) { await runOnce(db, conf); const j = await getJob(db, q.job.id); if (['succeeded', 'failed', 'needs_review'].includes(j!.job.status)) return j!; }
  throw new Error('job did not settle');
}
const thread = (over: Record<string, unknown> = {}) => ({
  [EF.leadName]: 'Jane Doe', [EF.company]: 'Acme', [EF.subject]: 'Re: idea', [EF.workspace]: '66', [EF.replyId]: '555',
  [EF.latestReplyAt]: '2026-11-24T15:00:00.000Z', [EF.latestReply]: 'Sounds interesting, what would this cost?', [EF.history]: 'Us: hi\nJane: Sounds interesting', [EF.replyUuid]: 'uuid-1', [RA.clients]: ['recynyHPighsOPpjd'], ...over,
});

before(async () => {
  atServer = http.createServer((req, res) => {
    const u = new URL(req.url ?? '/', 'http://x'); const table = u.pathname.split('/')[3];
    res.setHeader('content-type', 'application/json');
    if (req.method === 'GET') {
      const formula = u.searchParams.get('filterByFormula') ?? ''; formulas.push(formula);
      if (table === EMAILS && /Last Email Sent By Prospect/.test(formula)) return res.end(JSON.stringify({ records: Object.entries(emails).map(([id, fields]) => ({ id, fields })) }));
      if (table === EMAILS) return res.end(JSON.stringify({ records: booked.map((fields, i) => ({ id: `recBooked${i}`, fields })) }));
      if (table === SETTINGS) return res.end(JSON.stringify({ records: settings.map((fields, i) => ({ id: `recSet${i}`, fields })) }));
      if (table === REPLY_LEARNING) return res.end(JSON.stringify({ records: [] }));
      return res.end(JSON.stringify({ records: [] }));
    }
    let body = ''; req.on('data', (c) => (body += c));
    req.on('end', () => {
      const b = JSON.parse(body);
      const out = b.records.map((r: any) => {
        if (req.method === 'PATCH') { Object.assign(emails[r.id] ??= {}, r.fields); return r; }
        const id = `recDec${String(Object.keys(decisions).length).padStart(11, '0')}`; decisions[id] = r.fields; return { id, fields: r.fields };
      });
      res.end(JSON.stringify({ records: out }));
    });
  });
  claudeServer = http.createServer((req, res) => {
    let body = ''; req.on('data', (c) => (body += c));
    req.on('end', () => {
      claudeCalls.push({ headers: req.headers, body: JSON.parse(body) });
      const answer = claudeAnswers.shift() ?? { action: 'skip', intent: 'Other', reason: 'none', they_said: '', draft: '', question_for_alex: '' };
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify({ id: 'msg_1', type: 'message', role: 'assistant', model: 'claude-opus-5-5', content: [{ type: 'text', text: JSON.stringify(answer) }], stop_reason: 'end_turn', stop_details: null, usage: { input_tokens: 10, output_tokens: 10 } }));
    });
  });
  await new Promise<void>((r) => atServer.listen(0, r)); await new Promise<void>((r) => claudeServer.listen(0, r));
  atUrl = `http://127.0.0.1:${(atServer.address() as any).port}`; claudeUrl = `http://127.0.0.1:${(claudeServer.address() as any).port}`;
  if (!skip) { db = createPool(url!); await migrate(db); }
});
after(async () => { atServer.close(); claudeServer.close(); if (!skip) await db.end(); });
beforeEach(async () => {
  emails = {}; decisions = {}; claudeAnswers = []; claudeCalls = []; booked = []; formulas = []; settings = [{ 'Calendar Link': 'https://calendly.com/client/intro', 'Calendar Settings JSON': '{}' }];
  if (!skip) await db.query('TRUNCATE jobs, steps, receipts, events, sean_drafts RESTART IDENTITY CASCADE');
});

test('client file found by workspace ID; formula keeps client-handled and closed threads out', () => {
  assert.match(clientFileFor(REPO, 66)!.name, /Twenty West/i);
  assert.match(clientFileFor(REPO, 2)!.name, /Dulcy/i);
  assert.equal(clientFileFor(REPO, 999), null);
  const f = waitingFormula(14);
  assert.match(f, /NOT\(\{Client Handling\}\)/);
  assert.match(f, /\{Reply Ownership\}!='Handoff'/);
  assert.match(f, /'Booked Meeting'/);
});

test('reply → Send Reply decision; ask_alex → no action; skip → nothing; each reply drafted once', { skip }, async () => {
  emails.recA = thread();
  emails.recB = thread({ [EF.leadName]: 'Bob', [EF.replyId]: '556' });
  emails.recC = thread({ [EF.leadName]: 'Cy', [EF.latestReply]: 'Out of office until Monday' });
  claudeAnswers = [
    { action: 'reply', intent: 'Interested', reason: 'asked about fit', they_said: 'Wants to know more', draft: 'Hi Jane, happy to walk you through it. Does Tue 2pm ET work?', question_for_alex: '' },
    { action: 'ask_alex', intent: 'Cost Objection', reason: 'price not approved', they_said: 'Asked the price', draft: 'Hi Bob, [GAP: price]', question_for_alex: 'What price can we quote?' },
    { action: 'skip', intent: 'Out of Office', reason: 'out of office', they_said: 'OOO', draft: '', question_for_alex: '' },
  ];
  const j = await run(cfg());
  assert.equal(j.job.status, 'succeeded', j.job.error ?? '');
  assert.equal(claudeCalls.length, 3);
  const req = claudeCalls[0].body;
  assert.equal(req.model, 'claude-opus-5-5');
  assert.equal(req.fallbacks, 'default');
  assert.ok(req.system[0].cache_control, 'shared instructions are cached');
  assert.match(req.system[0].text, /You are Sean/);
  assert.match(req.system[1].text, /Client file: .*Twenty West/i);
  assert.match(req.messages[0].content, /Sounds interesting/);

  // Drafts land on the reply rows (Reply Queue) ...
  assert.equal(emails.recA[RA.state], 'Needs Approval');
  assert.equal(emails.recA[RA.draft], 'Hi Jane, happy to walk you through it. Does Tue 2pm ET work?');
  assert.equal(emails.recA[RA.intent], 'Interested');
  assert.equal(emails.recA[RA.humanAction], 'None');
  assert.equal(emails.recA[RA.eventId], 'bison:recynyHPighsOPpjd:555');
  assert.equal(emails.recA[RA.seanReason], 'asked about fit');
  assert.equal(emails.recB[RA.seanInput], 'What price can we quote?');
  assert.equal(emails.recC[RA.state], 'Skipped');
  assert.equal(emails.recC[RA.draft], '');
  // ... and in Slack: ✅ presses the same Approve.
  const ds = Object.values(decisions);
  assert.equal(ds.length, 2);
  const send = ds.find((d) => d[DF.action] === 'Approve Reply')!;
  assert.equal(send[DF.agent], 'Sean');
  assert.equal(send[DF.emailsRecord], 'recA');
  const ask = ds.find((d) => d[DF.action] === 'None')!;
  assert.match(String(ask[DF.title]), /Need your input/);
  assert.match(String(ask[DF.checked]), /What price/);
  // No live calendar: the client's saved booking link is offered.
  assert.match(claudeCalls[0].body.system.at(-1).text, /calendly\.com\/client\/intro/);

  const again = await run(cfg());
  assert.equal(again.job.status, 'succeeded');
  assert.equal(claudeCalls.length, 3, 'nothing drafted twice');
  assert.match(String(again.job.result.message), /none new/);

  // The prospect writes again → a new draft for that thread.
  emails.recA[EF.latestReplyAt] = '2026-11-24T18:00:00.000Z';
  claudeAnswers = [{ action: 'reply', intent: 'Interested', reason: 'r', they_said: 's', draft: 'Hi Jane again', question_for_alex: '' }];
  await run(cfg());
  assert.equal(claudeCalls.length, 4);
});

test('reply with no EmailBison reply ID becomes "need your input" (cannot be sent)', { skip }, async () => {
  emails.recA = thread({ [EF.replyId]: '' });
  claudeAnswers = [{ action: 'reply', intent: 'Interested', reason: 'r', they_said: 's', draft: 'Hi', question_for_alex: '' }];
  await run(cfg());
  assert.equal(Object.values(decisions)[0][DF.action], 'None');
  assert.match(String(emails.recA[RA.seanInput]), /No EmailBison reply ID/);
});

test('dry run (not in LIVE_STAGES): Claude not called, no decisions', { skip }, async () => {
  emails.recA = thread();
  const j = await run(cfg({ dryRun: true, liveStages: [] }));
  assert.equal(j.job.status, 'succeeded');
  assert.equal(claudeCalls.length, 0);
  assert.equal(Object.keys(decisions).length, 0);
  assert.equal(emails.recA[RA.state], undefined, 'dry run writes nothing to the row');
});

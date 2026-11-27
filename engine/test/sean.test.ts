// Echo: waiting replies → Claude draft → Decision rows (reply / ask Alex / skip), each reply once.
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
import { freeSlots, rememberOffered, pickTwo } from '../src/agents/calendar.js';
import { parsePlan, dueAfter, armFields, allSteps, DEFAULT_PLAN, dueFormula } from '../src/agents/followups.js';

const url = process.env.TEST_DATABASE_URL;
const skip = !url ? 'TEST_DATABASE_URL not set' : false;
const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
let db: Db;
let atServer: http.Server, claudeServer: http.Server, atUrl = '', claudeUrl = '';
let emails: Record<string, Record<string, unknown>>, decisions: Record<string, Record<string, unknown>>, booked: Record<string, unknown>[], settings: Record<string, unknown>[], formulas: string[];
let claudeAnswers: Record<string, unknown>[], claudeCalls: any[];
let due: Record<string, Record<string, unknown>>;

function cfg(over: Partial<Config> = {}): Config {
  return { ...loadConfig({ ENGINE_SECRET: 'x'.repeat(40), DATABASE_URL: url ?? 'postgres://x' } as NodeJS.ProcessEnv),
    airtableApiKey: 'at', airtableBaseUrl: atUrl, anthropicApiKey: 'sk-test', anthropicBaseUrl: claudeUrl, knowledgeDir: REPO,
    dryRun: false, liveStages: ['sean.draft'], ...over };
}
async function run(conf: Config, kind = 'sean.draft') {
  const q = await enqueue(db, { kind, recordId: 'sean', input: {}, dryRun: conf.dryRun && !conf.liveStages.includes('sean.draft'), maxAttempts: 3, deadlineMs: 60_000 });
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
      if (table === EMAILS && /Dulcy Reply Agent Due At/.test(formula)) return res.end(JSON.stringify({ records: Object.entries(due).filter(([, f]) => f[RA.state] === 'Scheduled' && f[RA.dueAt]).map(([id, fields]) => ({ id, fields })) }));
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
        if (req.method === 'PATCH') { Object.assign((due[r.id] ? due : emails)[r.id] ??= {}, r.fields); return r; }
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
  emails = {}; due = {}; decisions = {}; claudeAnswers = []; claudeCalls = []; booked = []; formulas = []; settings = [{ 'Enabled': true, 'Calendar Link': 'https://calendly.com/client/intro', 'Calendar Settings JSON': '{}' }];
  if (!skip) await db.query('TRUNCATE jobs, steps, receipts, events, sean_drafts, offered_slots RESTART IDENTITY CASCADE');
});

test('client file found by workspace ID; formula keeps client-handled and closed threads out', () => {
  assert.match(clientFileFor(REPO, 66)!.name, /^Twenty West/i);
  assert.equal(clientFileFor(REPO, 2)!.name, 'Dulcy');
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
  assert.doesNotMatch(req.system[0].text, /You are Echo/, 'the shared library is the same for first replies and follow-ups');
  assert.match(req.system[0].text, /Objection/i, 'objection handling is kept');
  assert.doesNotMatch(req.system[0].text, /Google Drive SOPs|Course outline/, 'call-only course parts and old Drive notes are left out');
  assert.match(req.system[1].text, /You are Echo/);
  assert.match(req.system[2].text, /Client file: .*Twenty West/i);
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
  assert.equal(send[DF.agent], 'Echo');
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

test('two offered times are a real choice: another day, or at least 2 hours apart', async () => {
  const { twoTimes } = await import('../src/agents/calendar.js');
  const sameDay = ['2026-11-25T21:00:00Z', '2026-11-25T21:05:00Z', '2026-11-25T21:30:00Z', '2026-11-25T23:30:00Z'];
  const t = twoTimes(sameDay, 'America/New_York');
  assert.equal(t.length, 2);
  assert.match(t[0], /4:00/); assert.match(t[1], /6:30/);
  assert.match(twoTimes(['2026-11-25T21:00:00Z', '2026-11-25T21:05:00Z', '2026-11-26T15:00:00Z'], 'America/New_York')[1], /Thu/);
  assert.equal(twoTimes(['2026-11-25T21:00:00Z', '2026-11-25T21:05:00Z'], 'America/New_York').length, 1, 'no fake second time');
});

test('follow-up plan: client steps, then close the loop; due dates skip weekends', () => {
  const p = parsePlan(JSON.stringify({ enabled: true, skipWeekends: true, steps: [{ delay: 1, unit: 'days', message: 'answer the open point' }, { delay: 2, unit: 'days', message: 'one new insight' }] }));
  assert.deepEqual(p.steps.map((s) => s.delayDays), [1, 2]);
  assert.equal(allSteps(p).length, 3, 'two plan steps + the close-the-loop note');
  assert.equal(parsePlan('').steps.length, DEFAULT_PLAN.steps.length, 'no plan saved → default plan');
  assert.equal(parsePlan('{"enabled":false}').enabled, false);
  // Friday + 1 business day = Monday 15:00 UTC.
  assert.equal(dueAfter(new Date('2026-11-27T20:00:00Z'), 1, true), '2026-11-30T15:00:00.000Z');
  assert.equal(dueAfter(new Date('2026-11-27T20:00:00Z'), 1, false), '2026-11-28T15:00:00.000Z');
  const now = new Date('2026-11-24T22:00:00Z');
  assert.equal(armFields(p, 0, now, true)[RA.state], 'Scheduled');
  assert.equal(armFields(p, 0, now, true)[RA.dueAt], '2026-11-25T15:00:00.000Z');
  assert.equal(armFields(p, 2, now, true)[RA.state], 'Scheduled', 'close-the-loop note still to come');
  assert.equal(armFields(p, 3, now, true)[RA.state], 'Thread Complete');
  assert.equal(armFields(p, 0, now, false)[RA.state], 'Sent', 'not interested → no follow-ups');
  assert.match(dueFormula(), /NOT\(\{Client Handling\}\)/);
  assert.match(dueFormula(), /'Not Interested'/);
});

test('due follow-ups: drafted onto the row + Slack; prospect answered → not a follow-up; plan done → thread complete', { skip }, async () => {
  const base = thread({ [RA.state]: 'Scheduled', [RA.dueAt]: '2026-11-24T15:00:00.000Z', [RA.followupType]: 'No Response', [EF.lastSent]: 'Last Email Sent By Dulcy', [EF.leadStatus]: 'Interested' });
  due.recF = { ...base };
  due.recG = { ...base, [EF.leadName]: 'Gus', [EF.lastSent]: 'Last Email Sent By Prospect' };
  due.recH = { ...base, [EF.leadName]: 'Hal', [RA.policy]: JSON.stringify({ agent: 'sean', seanFollowupsSent: 4 }) };
  due.recO = { ...base, [EF.leadName]: 'Ola', [RA.followupType]: 'Out of Office', [EF.lastSent]: 'Last Email Sent By Prospect' };
  claudeAnswers = [
    { action: 'reply', intent: 'Interested', reason: 'she asked about cost and never got times', they_said: 'Asked what it costs', draft: 'Hi Jane, the notes are ready. Worth 15 minutes Tue?', question_for_alex: '' },
    { action: 'reply', intent: 'Out of Office', reason: 'back from leave', they_said: 'Out until today', draft: 'Hi Ola, welcome back. Still keen to look at this?', question_for_alex: '' },
  ];
  const j = await run(cfg(), 'sean.followup');
  assert.equal(j.job.status, 'succeeded', j.job.error ?? '');
  assert.equal(claudeCalls.length, 2, 'only Jane and Ola need a draft');
  assert.match(claudeCalls[0].body.system[1].text, /FOLLOW-UP/);
  assert.match(claudeCalls[0].body.messages[0].content, /Follow-up 1 of up to 4/);
  assert.equal(due.recF[RA.state], 'Needs Approval');
  assert.match(String(due.recF[RA.draft]), /notes are ready/);
  assert.equal(JSON.parse(String(due.recF[RA.policy])).kind, 'followup');
  assert.equal(due.recG[RA.state], 'Scheduled', 'prospect answered: left for the normal reply drafting');
  assert.equal(due.recH[RA.state], 'Thread Complete', 'all follow-ups sent');
  const ds = Object.values(decisions);
  assert.equal(ds.length, 2);
  assert.match(String(ds[0][DF.title]), /Follow-up 1 to Jane/);
  assert.equal(ds[0][DF.action], 'Approve Reply');
  const again = await run(cfg(), 'sean.followup');
  assert.match(String(again.job.result.message), /none new/);
  assert.equal(claudeCalls.length, 2, 'nothing drafted twice');
});

test('a dry run does not use up a follow-up: the live run after it still drafts', { skip }, async () => {
  due.recF = thread({ [RA.state]: 'Scheduled', [RA.dueAt]: '2026-11-24T15:00:00.000Z', [RA.followupType]: 'No Response', [EF.lastSent]: 'Last Email Sent By Dulcy', [EF.leadStatus]: 'Interested' });
  await run(cfg({ dryRun: true, liveStages: [] }), 'sean.followup');
  assert.equal(claudeCalls.length, 0);
  claudeAnswers = [{ action: 'reply', intent: 'Interested', reason: 'r', they_said: 's', draft: 'Hi Jane, the notes are ready.', question_for_alex: '' }];
  const j = await run(cfg({ liveStages: ['sean.followup'] }), 'sean.followup');
  assert.equal(j.job.status, 'succeeded', j.job.error ?? '');
  assert.equal(claudeCalls.length, 1);
  assert.equal(due.recF[RA.state], 'Needs Approval');
});


test('two prospects are never offered the same open time', { skip }, async () => {
  const slots = ['2026-11-25T19:30:00Z', '2026-11-25T21:00:00Z', '2026-11-25T21:30:00Z', '2026-11-26T15:00:00Z'];
  const a = pickTwo(await freeSlots(db, 'recWS', slots, 'recAdam'));
  await rememberOffered(db, 'recWS', a, 'recAdam');
  const b = pickTwo(await freeSlots(db, 'recWS', slots, 'recKara'));
  assert.equal(a.filter((x) => b.includes(x)).length, 0, `Adam ${a} vs Kara ${b}`);
  assert.deepEqual(pickTwo(await freeSlots(db, 'recWS', slots, 'recAdam')), a, 'the same prospect can be offered their own times again');
});

test('the client\'s Inbox Manager settings drive Echo: handoff "All replies" → nothing drafted; tone, length, instructions and links reach the prompt; a switched-off reply type is skipped', { skip }, async () => {
  emails.recM = thread();
  settings = [{ 'Enabled': true, 'Reply Handoff Mode': 'All Replies', 'Calendar Link': 'https://calendly.com/client/intro' }];
  const j = await run(cfg());
  assert.equal(j.job.status, 'succeeded');
  assert.equal(claudeCalls.length, 0, 'client answers its own replies');
  assert.match(String(j.job.result.message), /left to the client/);
  assert.equal(Object.keys(decisions).length, 0);

  await db.query('TRUNCATE jobs, steps, receipts, events, sean_drafts RESTART IDENTITY CASCADE');
  settings = [{ 'Enabled': true, 'Reply Handoff Mode': 'Disabled', 'Response Tone': 'Direct', 'Response Length': 'Very Brief', 'Agent First Name': 'Ryan', 'Agent Last Name': 'Labrie',
    'Company Context Override': 'Never mention pricing. Always offer the 2-minute video first.', 'Enabled Reply Types': ['Interested', 'Meeting Request'],
    'Knowledge Base JSON': JSON.stringify({ enabled: true, assets: [{ description: 'Contractor 2-minute video', url: 'https://sendspark.com/share/abc' }] }), 'Calendar Link': 'https://calendly.com/client/intro' }];
  claudeAnswers = [{ action: 'reply', intent: 'Cost Objection', reason: 'price question', they_said: 'What does it cost?', draft: 'Hi Jane, it depends.', question_for_alex: '' }];
  await run(cfg());
  const system = claudeCalls[0].body.system.map((b: any) => b.text).join('\n');
  assert.match(system, /Tone: Direct/);
  assert.match(system, /under 35 words/);
  assert.match(system, /You write as Ryan Labrie/);
  assert.match(system, /Never mention pricing/);
  assert.match(system, /sendspark\.com\/share\/abc/);
  assert.equal(emails.recM[RA.state], 'Skipped', 'Cost Objection is not an enabled reply type for this client');
  assert.match(String(emails.recM[RA.seanReason]), /switched off for this client/);
  assert.equal(Object.keys(decisions).length, 0);
});

test('client set to Autopilot: the draft is approved for the engine sender (no ✅ card); Approval Required still asks', { skip }, async () => {
  settings = [{ Enabled: true, 'Default Mode': 'Autopilot', 'Calendar Link': 'https://calendly.com/client/intro', 'Calendar Settings JSON': '{}' }];
  emails.recA = thread();
  claudeAnswers = [{ action: 'reply', intent: 'Interested', reason: 'asked about fit', they_said: 'Wants to know more', draft: 'Hi Jane, does Tue 2pm ET work?', question_for_alex: '', confidence: 97 }];
  const j = await run(cfg());
  assert.equal(j.job.status, 'succeeded', j.job.error ?? '');
  assert.equal(emails.recA[RA.humanAction], 'Approve Draft');
  const pol = JSON.parse(String(emails.recA[RA.policy]));
  assert.equal(pol.auto, true); assert.equal(pol.autoSent, 1); assert.equal(pol.confidence, 97);
  assert.equal(Object.values(decisions).filter((d) => d[DF.action] === 'Approve Reply').length, 0, 'no approval card');

  await db.query('TRUNCATE sean_drafts'); decisions = {};
  settings = [{ Enabled: true, 'Default Mode': 'Approval Required', 'Calendar Link': 'https://calendly.com/client/intro', 'Calendar Settings JSON': '{}' }];
  emails.recB = thread({ [EF.leadName]: 'Bob', [EF.replyId]: '556' }); delete emails.recA;
  claudeAnswers = [{ action: 'reply', intent: 'Interested', reason: 'fit', they_said: 'More', draft: 'Hi Bob, does Wed work?', question_for_alex: '', confidence: 99 }];
  const j2 = await run(cfg());
  assert.equal(j2.job.status, 'succeeded', j2.job.error ?? '');
  assert.equal(emails.recB[RA.humanAction], 'None');
  assert.equal(Object.values(decisions).filter((d) => d[DF.action] === 'Approve Reply').length, 1);
});

test('out of office: drafted only for a client that answers them; the return date is kept for the follow-up', { skip }, async () => {
  emails.recO = thread({ [EF.leadStatus]: 'Out Of Office', [EF.latestReply]: 'I am out of office until Dec 3.' });
  // Setting off (no reply types ticked): no Claude call, nothing drafted.
  const j = await run(cfg());
  assert.equal(j.job.status, 'succeeded', j.job.error ?? '');
  assert.equal(claudeCalls.length, 0);
  assert.match(String(j.job.result?.message ?? JSON.stringify(j.job)), /not answered for that client/);

  await db.query('TRUNCATE sean_drafts');
  settings = [{ Enabled: true, 'Enabled Reply Types': ['Interested', 'Out of Office'], 'Calendar Link': 'https://calendly.com/client/intro', 'Calendar Settings JSON': '{}' }];
  claudeAnswers = [{ action: 'reply', intent: 'Out of Office', reason: 'away until Dec 3', they_said: 'OOO', draft: 'Hi Jane, no rush. We will pick this up when you are back.', question_for_alex: '', confidence: 90, follow_up_on: '2026-12-03' }];
  const j2 = await run(cfg());
  assert.equal(j2.job.status, 'succeeded', j2.job.error ?? '');
  assert.equal(claudeCalls.length, 1);
  assert.equal(emails.recO[RA.state], 'Needs Approval');
  assert.equal(JSON.parse(String(emails.recO[RA.policy])).followUpOn, '2026-12-03');
});

test('Echo offers on-the-hour or half-hour times when a calendar returns 5-minute steps (Outlook)', () => {
  const s = ['2026-11-30T15:25:00Z', '2026-11-30T15:30:00Z', '2026-11-30T15:35:00Z', '2026-12-01T14:05:00Z', '2026-12-01T14:30:00Z'];
  assert.deepEqual(pickTwo(s), ['2026-11-30T15:30:00Z', '2026-12-01T14:30:00Z']);
  assert.deepEqual(pickTwo(['2026-11-30T15:25:00Z', '2026-12-01T14:05:00Z']), ['2026-11-30T15:25:00Z', '2026-12-01T14:05:00Z'], 'odd times still offered when nothing else is free');
});

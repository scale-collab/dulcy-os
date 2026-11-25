// Decisions loop: New → Slack → ✅/❌ from approvers → action → result back to Airtable and the thread.
import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { createPool, migrate, type Db } from '../src/db/pool.js';
import { loadConfig, type Config } from '../src/config.js';
import { runOnce } from '../src/worker.js';
import { decisionsTick, decisionMessage } from '../src/decisions/loop.js';
import { DECISIONS, DF } from '../src/decisions/fields.js';
import { startFakeBison, type FakeBison } from './fakes/bison.js';

const url = process.env.TEST_DATABASE_URL;
const skip = !url ? 'TEST_DATABASE_URL not set' : false;
let db: Db;
let bison: FakeBison;
const ALEX = 'U070Z26377C', STRANGER = 'U999';

let rows: Record<string, Record<string, unknown>>;
const at = {
  async list(table: string, formula: string) {
    assert.equal(table, DECISIONS);
    const want = /\{Status\}='(\w+)'/.exec(formula)?.[1];
    return Object.entries(rows).filter(([, f]) => f[DF.status] === want).map(([id, f]) => ({ id, fields: { ...f } }));
  },
  async update(_t: string, id: string, fields: Record<string, unknown>) { Object.assign(rows[id], fields); },
};
let posts: { channel: string; text: string; thread?: string }[];
let reacts: Record<string, { name: string; users: string[] }[]>;
const slack = {
  async post(channel: string, text: string, thread?: string) { posts.push({ channel, text, thread }); return { channel: 'C1', ts: thread ?? `ts${posts.length}` }; },
  async reactions(_c: string, ts: string) { return reacts[ts] ?? []; },
  async react(_c: string, ts: string, name: string) { botReacts.push(`${ts}:${name}`); (reacts[ts] ??= []).push({ name, users: ['UBOT'] }); },
};
let botReacts: string[];

function cfg(over: Partial<Config> = {}): Config {
  return { ...loadConfig({ ENGINE_SECRET: 'x'.repeat(40), DATABASE_URL: url ?? 'postgres://x' } as NodeJS.ProcessEnv), emailBisonKeys: { dulcy: bison.key }, emailBisonBaseUrl: bison.url, dryRun: true, liveStages: [], airtableApiKey: undefined, ...over };
}
async function settle(conf: Config) { for (let i = 0; i < 10; i++) await runOnce(db, conf); }
const reply = (over: Record<string, unknown> = {}) => ({
  [DF.title]: 'Reply to Jane at Acme', [DF.agent]: 'Sean', [DF.client]: 'Dulcy', [DF.status]: 'New',
  [DF.issue]: 'Jane asked for times', [DF.fix]: 'Offer Tue 2pm or Wed 11am ET', [DF.details]: 'Full thread here',
  [DF.action]: 'Send Reply', [DF.actionInput]: JSON.stringify({ workspaceId: 66, replyId: 123, message: 'Hi Jane, Tue 2pm or Wed 11am ET?' }), ...over,
});

before(async () => { bison = await startFakeBison(); if (skip) return; db = createPool(url!); await migrate(db); });
after(async () => { bison.close(); if (!skip) await db.end(); });
beforeEach(async () => {
  rows = {}; posts = []; reacts = {}; botReacts = []; (bison as any).repliesSent = [];
  if (!skip) await db.query('TRUNCATE jobs, steps, receipts, events RESTART IDENTITY CASCADE');
});

test('message: blank line between facts, reply drafts quoted, action named, details not in the main message', () => {
  const m = decisionMessage({ id: 'r', fields: reply() });
  assert.match(m, /^\*Sean · Dulcy\*\nReply to Jane at Acme\n\n\*Issue:\* Jane asked for times\n\n/);
  assert.match(m, /\*On ✅:\* Send Reply$/);
  assert.doesNotMatch(m, /React/);
  assert.doesNotMatch(m, /Full thread here/);
  const r = decisionMessage({ id: 'r', fields: reply({ [DF.action]: 'Approve Reply', [DF.client]: 'Client: Twenty West Media', [DF.fix]: 'Hi Jane,\n\nTue 2pm?' }) });
  assert.match(r, /^\*Sean · Twenty West Media\*/);
  assert.match(r, /\*They said:\* Jane asked for times/);
  assert.match(r, /\*Draft reply:\*\n> Hi Jane,\n> \n> Tue 2pm\?/);
  assert.doesNotMatch(r, /send it|skip it/, 'no redundant reaction legend (Alex, 2026-11-25)');
  assert.match(r, /Tue 2pm\?$/);
});

test('New → posted once with details in the thread; stranger reactions ignored; ✅ from Alex sends the reply (live)', { skip }, async () => {
  rows.rec1 = reply();
  const conf = cfg({ dryRun: false, liveStages: ['decision.send_reply'] });
  await decisionsTick(db, conf, at as any, slack as any);
  assert.equal(rows.rec1[DF.status], 'Waiting');
  assert.equal(posts.length, 2);
  assert.equal(posts[1].thread, 'ts1');
  assert.deepEqual(botReacts, ['ts1:white_check_mark', 'ts1:x'], 'bot pre-adds ✅ and ❌');
  await decisionsTick(db, conf, at as any, slack as any);
  assert.equal(rows.rec1[DF.status], 'Waiting', "the bot's own reactions never decide");
  await decisionsTick(db, conf, at as any, slack as any);
  assert.equal(posts.length, 2, 'never posted twice');

  reacts.ts1 = [{ name: 'white_check_mark', users: [STRANGER] }];
  await decisionsTick(db, conf, at as any, slack as any);
  assert.equal(rows.rec1[DF.status], 'Waiting', 'only approvers count');

  reacts.ts1 = [{ name: 'white_check_mark', users: [STRANGER, ALEX] }];
  await decisionsTick(db, conf, at as any, slack as any); // decided + queued
  assert.equal(rows.rec1[DF.decidedBy], 'Alex');
  assert.equal(rows.rec1[DF.result], 'Queued');
  await settle(conf);
  await decisionsTick(db, conf, at as any, slack as any); // result written
  assert.equal(rows.rec1[DF.status], 'Done');
  assert.match(String(rows.rec1[DF.result]), /Reply sent/);
  const sent = (bison as any).repliesSent;
  assert.equal(sent.length, 1);
  assert.equal(sent[0].replyId, 123);
  assert.equal(sent[0].team, 66, 'sent from the right workspace');
  assert.equal(sent[0].reply_all, true);
  assert.match(posts.at(-1)!.text, /Reply sent/);

  // A second job for the same decision never sends again.
  await db.query(`UPDATE jobs SET request_id = NULL`);
  rows.rec1[DF.status] = 'Approved'; rows.rec1[DF.result] = '';
  await decisionsTick(db, conf, at as any, slack as any);
  await settle(conf);
  assert.equal((bison as any).repliesSent.length, 1);
});

test('❌ wins; nothing sent', { skip }, async () => {
  rows.rec1 = reply();
  await decisionsTick(db, cfg(), at as any, slack as any);
  reacts.ts1 = [{ name: 'white_check_mark', users: [ALEX] }, { name: 'x', users: [ALEX] }];
  await decisionsTick(db, cfg(), at as any, slack as any);
  assert.equal(rows.rec1[DF.status], 'Rejected');
  await settle(cfg());
  assert.equal((bison as any).repliesSent.length, 0);
  assert.match(posts.at(-1)!.text, /Stopped/);
});

test('dry run by default (not in LIVE_STAGES): approved but not sent', { skip }, async () => {
  rows.rec1 = reply({ [DF.status]: 'Approved' });
  await decisionsTick(db, cfg(), at as any, slack as any);
  await settle(cfg());
  await decisionsTick(db, cfg(), at as any, slack as any);
  assert.equal(rows.rec1[DF.status], 'Done');
  assert.match(String(rows.rec1[DF.result]), /Dry run/);
  assert.equal((bison as any).repliesSent.length, 0);
});

test('bad Action Input and no-action decisions', { skip }, async () => {
  rows.bad = reply({ [DF.status]: 'Approved', [DF.actionInput]: '{oops' });
  rows.none = reply({ [DF.status]: 'Approved', [DF.action]: 'None' });
  await decisionsTick(db, cfg(), at as any, slack as any);
  assert.equal(rows.bad[DF.status], 'Failed');
  assert.equal(rows.none[DF.status], 'Done');
  assert.match(String(rows.none[DF.result]), /no automatic action/);
});

test('missing replyId fails clearly', { skip }, async () => {
  rows.rec1 = reply({ [DF.status]: 'Approved', [DF.actionInput]: JSON.stringify({ workspaceId: 66, message: 'hi' }) });
  await decisionsTick(db, cfg(), at as any, slack as any);
  await settle(cfg());
  await decisionsTick(db, cfg(), at as any, slack as any);
  assert.equal(rows.rec1[DF.status], 'Failed');
  assert.match(String(rows.rec1[DF.result]), /needs workspaceId, replyId and message/);
});

// The one reply sender + Airtable ↔ Slack mirror: approve in Airtable or ✅ in Slack → sent once,
// client CC/BCC, row + Reply Learning + Slack updated; guards stop stale or unsafe sends.
import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { createPool, migrate, type Db } from '../src/db/pool.js';
import { loadConfig, type Config } from '../src/config.js';
import { runOnce } from '../src/worker.js';
import { createAirtableClient } from '../src/providers/airtable.js';
import { repliesTick, workspaceCopies, toHtml } from '../src/agents/replies.js';
import { decisionsTick } from '../src/decisions/loop.js';
import { EMAILS, EF, RA, SETTINGS, REPLY_LEARNING } from '../src/agents/emailsFields.js';
import { DECISIONS, DF } from '../src/decisions/fields.js';
import { startFakeBison, type FakeBison } from './fakes/bison.js';

const url = process.env.TEST_DATABASE_URL;
const skip = !url ? 'TEST_DATABASE_URL not set' : false;
const WS_REC = 'recynyHPighsOPpjd', ALEX = 'U070Z26377C';
let db: Db, bison: FakeBison, server: http.Server, slackServer: http.Server, atUrl = '', slackUrl = '';
let tables: Record<string, Record<string, Record<string, unknown>>>;
let posts: { text: string; thread?: string }[], reacts: Record<string, { name: string; users: string[] }[]>;

const slack = {
  async post(_c: string, text: string, thread?: string) { posts.push({ text, thread }); return { channel: 'C1', ts: thread ?? `ts${posts.length}` }; },
  async reactions(_c: string, ts: string) { return reacts[ts] ?? []; },
  async react() { /* pre-added reactions not needed here */ },
};
const at = () => createAirtableClient({ apiKey: 'at', baseId: 'appxqINt5XKw7a76A', baseUrl: atUrl });
function cfg(over: Partial<Config> = {}): Config {
  return { ...loadConfig({ ENGINE_SECRET: 'x'.repeat(40), DATABASE_URL: url ?? 'postgres://x' } as NodeJS.ProcessEnv),
    emailBisonKeys: { dulcy: bison.key }, emailBisonBaseUrl: bison.url, airtableApiKey: 'at', airtableBaseUrl: atUrl, slackBotToken: 'xoxb-test', slackBaseUrl: slackUrl,
    dryRun: false, liveStages: ['reply.send'], replySenderOn: true, ...over };
}
const name = (v: unknown) => (v && typeof v === 'object' && !Array.isArray(v) ? (v as any).name : v);
function match(row: Record<string, unknown>, id: string, f: string): boolean {
  const ids = [...f.matchAll(/RECORD_ID\(\)='(rec\w+)'/g)].map((m) => m[1]);
  if (ids.length) return ids.includes(id);
  if (/Human Action\}='Approve Draft'/.test(f)) return ['Approve Draft', 'Send Edited Reply'].includes(String(row[RA.humanAction])) && !['Sent', 'Sending', 'Suppressed', 'Thread Complete'].includes(String(row[RA.state]));
  if (/Human Action\}='Skip'/.test(f)) return row[RA.humanAction] === 'Skip';
  const er = /\{Emails Record\}='(rec\w+)'/.exec(f)?.[1];
  if (er) return row[DF.emailsRecord] === er && (/\{Status\}='Approved'\)?$/.test(f) && !/OR\(/.test(f) ? row[DF.status] === 'Approved' : ['New', 'Waiting', 'Approved'].includes(String(row[DF.status])));
  if (/\{Emails Record\}!=''/.test(f)) return !!row[DF.emailsRecord] && ['New', 'Waiting'].includes(String(row[DF.status]));
  const st = /^\{Status\}='(\w+)'$/.exec(f)?.[1];
  if (st) return row[DF.status] === st;
  return true;
}
async function settle(conf: Config) { for (let i = 0; i < 10; i++) await runOnce(db, conf); }
const thread = (over: Record<string, unknown> = {}) => ({
  current_reply: { id: 555, from_email_address: 'jane@acme.com', from_name: 'Jane', sender_email_id: 77, ...over }, older_messages: [], newer_messages: [],
});
function row(over: Record<string, unknown> = {}) {
  return { [EF.workspace]: '66', [EF.replyId]: '555', [EF.leadName]: 'Jane', [EF.latestReply]: 'Sounds good, when?', [EF.leadStatus]: 'Interested',
    [EF.latestReplyAt]: '2026-11-24T15:00:00.000Z', [EF.lastSent]: 'Last Email Sent By Prospect', [EF.stage]: 'New Interested',
    [RA.clients]: [WS_REC], [RA.state]: 'Needs Approval', [RA.draft]: 'Hi Jane,\n\nTue 2pm ET or Wed 11am ET?', [RA.humanAction]: 'Approve Draft',
    [RA.updatedAt]: '2026-11-24T15:05:00.000Z', [RA.intent]: 'Interested', [RA.eventId]: `bison:${WS_REC}:555`, ...over };
}

before(async () => {
  bison = await startFakeBison();
  server = http.createServer((req, res) => {
    const u = new URL(req.url ?? '/', 'http://x'); const table = u.pathname.split('/')[3];
    const rows = (tables[table] ??= {});
    res.setHeader('content-type', 'application/json');
    if (req.method === 'GET') {
      const f = u.searchParams.get('filterByFormula') ?? '';
      const records = Object.entries(rows).filter(([id, r]) => table === SETTINGS || match(r, id, f)).map(([id, fields]) => ({ id, fields: Object.fromEntries(Object.entries(fields).map(([k, v]) => [k, name(v)])) }));
      return res.end(JSON.stringify({ records }));
    }
    let body = ''; req.on('data', (c) => (body += c));
    req.on('end', () => {
      const b = JSON.parse(body);
      res.end(JSON.stringify({ records: b.records.map((r: any) => {
        if (req.method === 'PATCH') { Object.assign(rows[r.id] ??= {}, r.fields); return r; }
        const id = `recNew${String(Object.keys(rows).length).padStart(11, '0')}`; rows[id] = { ...r.fields }; return { id, fields: r.fields };
      }) }));
    });
  });
  await new Promise<void>((r) => server.listen(0, r));
  // Slack posts made by the sender job (it builds its own client from the config).
  slackServer = http.createServer((req, res) => {
    let body = ''; req.on('data', (c) => (body += c));
    req.on('end', () => { const b = JSON.parse(body || '{}'); posts.push({ text: b.text, thread: b.thread_ts }); res.setHeader('content-type', 'application/json'); res.end(JSON.stringify({ ok: true, channel: b.channel, ts: b.thread_ts ?? 'tsX' })); });
  });
  await new Promise<void>((r) => slackServer.listen(0, r));
  slackUrl = `http://127.0.0.1:${(slackServer.address() as any).port}`;
  atUrl = `http://127.0.0.1:${(server.address() as any).port}`;
  if (!skip) { db = createPool(url!); await migrate(db); }
});
after(async () => { bison.close(); server.close(); slackServer.close(); if (!skip) await db.end(); });
beforeEach(async () => {
  tables = { [EMAILS]: {}, [DECISIONS]: {}, [SETTINGS]: { recSet: { 'Workspace Record ID': WS_REC, 'CC BCC Settings JSON': JSON.stringify({ ccEnabled: true, cc: 'owner@client.com', ccScope: 'selected', ccTypes: ['Interested'] }) } }, [REPLY_LEARNING]: {} };
  posts = []; reacts = {}; (bison as any).repliesSent = []; (bison as any).threads = { 555: thread() };
  if (!skip) await db.query('TRUNCATE jobs, steps, receipts, events RESTART IDENTITY CASCADE');
});

test('CC/BCC rules and the HTML body', () => {
  assert.deepEqual(workspaceCopies('{"ccEnabled":true,"cc":"a@x.com","ccScope":"selected","ccTypes":["Interested"]}', 'Positive Reply'), { cc: ['a@x.com'], bcc: [] });
  assert.deepEqual(workspaceCopies('{"ccEnabled":true,"cc":"a@x.com","ccScope":"selected","ccTypes":["Interested"]}', 'Out of Office'), { cc: [], bcc: [] });
  assert.deepEqual(workspaceCopies('', 'Interested'), { cc: [], bcc: [] });
  assert.throws(() => workspaceCopies('{"bccEnabled":true}', 'Interested'), /no address/);
  assert.equal(toHtml('Hi <Jane>,\n\nLine one\nLine two'), '<p>Hi &lt;Jane&gt;,</p><p>Line one<br>Line two</p>');
});

test('approve in Airtable → sent once with client CC; row, learning and Slack updated', { skip }, async () => {
  tables[EMAILS].recAAAAAAAAAAAAAA = row();
  tables[DECISIONS].recD = { [DF.emailsRecord]: 'recAAAAAAAAAAAAAA', [DF.status]: 'Waiting', [DF.action]: 'Approve Reply', [DF.slackChannel]: 'C1', [DF.slackTs]: 'ts9' };
  const conf = cfg();
  assert.equal((await repliesTick(db, conf, at(), slack)).queued, 1);
  await settle(conf);
  const sent = (bison as any).repliesSent;
  assert.equal(sent.length, 1);
  assert.equal(sent[0].team, 66);
  assert.equal(sent[0].reply_all, false);
  assert.deepEqual(sent[0].to_emails, [{ name: 'Jane', email_address: 'jane@acme.com' }]);
  assert.deepEqual(sent[0].cc_emails, [{ name: '', email_address: 'owner@client.com' }]);
  assert.equal(sent[0].sender_email_id, 77);
  assert.match(sent[0].message, /<p>Hi Jane,<\/p><p>Tue 2pm ET/);
  const r = tables[EMAILS].recAAAAAAAAAAAAAA;
  assert.equal(r[RA.state], 'Sent'); assert.equal(r[RA.humanAction], 'None'); assert.equal(r[EF.lastSent], 'Last Email Sent By Dulcy'); assert.equal(r[EF.stage], 'In Conversation');
  const learn = Object.values(tables[REPLY_LEARNING])[0];
  assert.equal(learn['Review Status'], 'Approved'); assert.equal(learn['Approved Reply'], 'Hi Jane,\n\nTue 2pm ET or Wed 11am ET?');
  assert.equal(tables[DECISIONS].recD[DF.status], 'Done');
  assert.match(posts.at(-1)!.text, /Sent \(approved in Airtable\)/);
  assert.equal(posts.at(-1)!.thread, 'ts9');
  // Nothing is sent twice.
  assert.equal((await repliesTick(db, conf, at(), slack)).queued, 0);
  await settle(conf);
  assert.equal((bison as any).repliesSent.length, 1);
});

test('✅ in Slack presses the same Approve; the thread says it was sent', { skip }, async () => {
  tables[EMAILS].recAAAAAAAAAAAAAA = row({ [RA.humanAction]: 'None' });
  tables[DECISIONS].recD = { [DF.title]: 'Reply to Jane', [DF.agent]: 'Sean', [DF.emailsRecord]: 'recAAAAAAAAAAAAAA', [DF.status]: 'Waiting', [DF.action]: 'Approve Reply', [DF.slackChannel]: 'C1', [DF.slackTs]: 'ts9' };
  reacts.ts9 = [{ name: 'white_check_mark', users: [ALEX] }];
  const conf = cfg();
  await decisionsTick(db, conf, at(), slack);
  assert.equal(tables[EMAILS].recAAAAAAAAAAAAAA[RA.humanAction], 'Approve Draft');
  assert.equal(tables[DECISIONS].recD[DF.status], 'Approved');
  await repliesTick(db, conf, at(), slack);
  await settle(conf);
  assert.equal((bison as any).repliesSent.length, 1);
  assert.equal(tables[DECISIONS].recD[DF.status], 'Done');
  assert.match(posts.at(-1)!.text, /approved in Slack/);
});

test('❌ in Slack and Skip in Airtable: nothing sent, both sides show it', { skip }, async () => {
  tables[EMAILS].recAAAAAAAAAAAAAA = row({ [RA.humanAction]: 'None' });
  tables[DECISIONS].recD = { [DF.emailsRecord]: 'recAAAAAAAAAAAAAA', [DF.status]: 'Waiting', [DF.action]: 'Approve Reply', [DF.slackChannel]: 'C1', [DF.slackTs]: 'ts9' };
  reacts.ts9 = [{ name: 'x', users: [ALEX] }];
  const conf = cfg();
  await decisionsTick(db, conf, at(), slack);
  assert.equal(tables[EMAILS].recAAAAAAAAAAAAAA[RA.humanAction], 'Skip');
  await repliesTick(db, conf, at(), slack);
  assert.equal(tables[EMAILS].recAAAAAAAAAAAAAA[RA.state], 'Skipped');
  assert.equal(tables[DECISIONS].recD[DF.status], 'Rejected');
  // Skip pressed in Airtable on another thread → its Slack decision closes with a note.
  tables[EMAILS].recBBBBBBBBBBBBBB = row({ [RA.humanAction]: 'Skip' });
  tables[DECISIONS].recE = { [DF.emailsRecord]: 'recBBBBBBBBBBBBBB', [DF.status]: 'Waiting', [DF.action]: 'Approve Reply', [DF.slackChannel]: 'C1', [DF.slackTs]: 'ts8' };
  await repliesTick(db, conf, at(), slack);
  assert.equal(tables[DECISIONS].recE[DF.status], 'Rejected');
  assert.match(posts.at(-1)!.text, /Skipped in Airtable/);
  await settle(conf);
  assert.equal((bison as any).repliesSent.length, 0);
});

test('guards: prospect wrote again, newer thread message, our side already answered, [GAP] left in', { skip }, async () => {
  const conf = cfg();
  const cases: [Record<string, unknown>, RegExp, any?][] = [
    [{ [EF.latestReplyAt]: '2026-11-24T16:00:00.000Z' }, /wrote again/],
    [{}, /newer messages/, { ...thread(), newer_messages: [{ id: 556 }] }],
    [{ [EF.lastSent]: 'Last Email Sent By Dulcy' }, /already answered/],
    [{ [RA.draft]: 'Hi Jane, [GAP: price]' }, /GAP/],
  ];
  let i = 0;
  for (const [over, why, t] of cases) {
    const id = `recGGGGGGGGGGGGG${i++}`;
    tables[EMAILS] = { [id]: row(over) };
    (bison as any).threads = { 555: t ?? thread() };
    await db.query('TRUNCATE jobs, steps, receipts, events RESTART IDENTITY CASCADE');
    await repliesTick(db, conf, at(), slack);
    await settle(conf);
    assert.equal((bison as any).repliesSent.length, 0, String(why));
    assert.match(String(tables[EMAILS][id][RA.lastError]), why);
    assert.equal(tables[EMAILS][id][RA.humanAction], 'None');
  }
});

test('answered elsewhere (old Send Email button) closes the Slack decision; sender off queues nothing', { skip }, async () => {
  tables[EMAILS].recAAAAAAAAAAAAAA = row({ [RA.humanAction]: 'None', [EF.lastSent]: 'Last Email Sent By Dulcy' });
  tables[DECISIONS].recD = { [DF.emailsRecord]: 'recAAAAAAAAAAAAAA', [DF.status]: 'Waiting', [DF.action]: 'Approve Reply', [DF.slackChannel]: 'C1', [DF.slackTs]: 'ts9' };
  const r = await repliesTick(db, cfg({ replySenderOn: false }), at(), slack);
  assert.equal(r.closed, 1);
  assert.equal(tables[DECISIONS].recD[DF.status], 'Done');
  tables[EMAILS].recBBBBBBBBBBBBBB = row();
  assert.equal((await repliesTick(db, cfg({ replySenderOn: false }), at(), slack)).queued, 0);
});

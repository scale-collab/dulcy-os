// HQ voice mode (Alex 2026-11-28: "call and talk to the agents, like how GPT does it"): a clip is
// transcribed, posted into the SAME chat thread, answered through the normal chat path (voice flag:
// short answers) and read aloud. Never calls a real service: OpenAI is a fake fetch, the model and
// Airtable are fakes. Covers the flow, auth (members, owner-only agents, clients), limits and VOICE=off.
import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { AddressInfo } from 'node:net';
import { createPool, migrate, type Db } from '../src/db/pool.js';
import { loadConfig, type Config } from '../src/config.js';
import { createServer } from '../src/http.js';
import { upsertUser } from '../src/hq/auth.js';
import type { ChatModel } from '../src/hq/chat.js';
import { clipByteLimit, isEmptyTranscript, spokenText, voiceFor, voiceState } from '../src/hq/voice.js';

const url = process.env.TEST_DATABASE_URL;
const skip = !url ? 'TEST_DATABASE_URL not set' : false;
const PW = 'correct horse battery staple';
const JOSH_PW = 'josh long password 1';
let db: Db;
let server: http.Server;
let port = 0;
let webDir: string;
let conf: Config;

// ---- fakes ----
let writes: string[];
const at = {
  async list() { return []; },
  async get() { return null; },
  async create(table: string) { writes.push(`create ${table}`); return 'recNEW00000000001'; },
  async update(table: string, id: string) { writes.push(`update ${table} ${id}`); },
};
let modelCalls: { varying: string; last: string }[];
let answer: string;
const model: ChatModel = async (_s, varying, messages) => {
  const last = messages[messages.length - 1];
  modelCalls.push({ varying, last: typeof last.content === 'string' ? last.content : '' });
  return { content: [{ type: 'text', text: answer }], stop_reason: 'end_turn' };
};
interface OpenAICall { url: string; auth: string; model?: string; fileName?: string; fileType?: string; fileSize?: number; json?: any }
let openai: OpenAICall[];
let heardText: string;
let sttStatus: number;
const MP3 = Buffer.from('ID3fake-mp3-bytes');
const fakeFetch = (async (u: string | URL, init: RequestInit = {}) => {
  const href = String(u);
  const auth = String((init.headers as Record<string, string>)?.authorization ?? '');
  if (href.endsWith('/v1/audio/transcriptions')) {
    const form = init.body as FormData;
    const file = form.get('file') as File;
    openai.push({ url: href, auth, model: String(form.get('model')), fileName: file.name, fileType: file.type, fileSize: file.size });
    if (sttStatus !== 200) return new Response('{"error":"boom"}', { status: sttStatus });
    return new Response(JSON.stringify({ text: heardText, usage: { type: 'duration', seconds: 3 } }), { status: 200, headers: { 'content-type': 'application/json' } });
  }
  if (href.endsWith('/v1/audio/speech')) {
    openai.push({ url: href, auth, json: JSON.parse(String(init.body)) });
    return new Response(MP3, { status: 200, headers: { 'content-type': 'audio/mpeg' } });
  }
  throw new Error(`unexpected fetch ${href}`);
}) as typeof fetch;

function makeCfg(): Config {
  return {
    ...loadConfig({ ENGINE_SECRET: 'x'.repeat(40), DATABASE_URL: url ?? 'postgres://x', HQ_SESSION_SECRET: 's'.repeat(40), HQ_HOST: 'hq.test.local', VOICE: 'on', OPENAI_API_KEY: 'sk-test-voice', OPENAI_TTS_VOICES: 'Atlas:ash' } as NodeJS.ProcessEnv),
    airtableApiKey: undefined, anthropicApiKey: undefined,
  };
}

interface Raw { status: number; headers: http.IncomingHttpHeaders; buf: Buffer; body: any; lines: any[] }
function call(method: string, p: string, opts: { body?: unknown; cookie?: string; origin?: string; headers?: Record<string, string> } = {}): Promise<Raw> {
  return new Promise((resolve, reject) => {
    const host = `127.0.0.1:${port}`;
    const data = opts.body === undefined ? undefined : JSON.stringify(opts.body);
    const headers: Record<string, string> = { host, ...(opts.headers ?? {}) };
    if (data !== undefined) { headers['content-type'] = 'application/json'; headers.origin = opts.origin ?? `https://${host}`; }
    if (opts.cookie) headers.cookie = opts.cookie;
    const req = http.request({ host: '127.0.0.1', port, method, path: p, headers }, (res) => {
      const chunks: Buffer[] = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => {
        const buf = Buffer.concat(chunks); const text = buf.toString('utf8');
        let body: any = null; try { body = JSON.parse(text); } catch { /* not one JSON */ }
        const lines = String(res.headers['content-type'] ?? '').startsWith('application/x-ndjson') ? text.split('\n').filter(Boolean).map((l) => JSON.parse(l)) : [];
        resolve({ status: res.statusCode ?? 0, headers: res.headers, buf, body, lines });
      });
    });
    req.on('error', reject);
    if (data !== undefined) req.write(data);
    req.end();
  });
}
async function login(email = 'alex@dulcy.io', password = PW) {
  const r = await new Promise<http.IncomingMessage>((resolve, reject) => {
    const body = JSON.stringify({ email, password });
    const req = http.request({ host: '127.0.0.1', port, method: 'POST', path: '/hq/api/auth/login', headers: { host: `127.0.0.1:${port}`, 'content-type': 'application/json', origin: `https://127.0.0.1:${port}` } }, (res) => { res.resume(); resolve(res); });
    req.on('error', reject); req.write(body); req.end();
  });
  return ([] as string[]).concat(r.headers['set-cookie'] ?? []).map((c) => c.split(';')[0]).find((c) => c.startsWith('__Host-hq_session=')) ?? '';
}
const clip = (bytes = 4000) => Buffer.alloc(bytes, 7).toString('base64');
const turn = (cookie: string, over: Record<string, unknown> = {}) => call('POST', '/hq/api/voice/turn', { cookie, body: { agent: 'Ada', audio: clip(), mime: 'audio/webm;codecs=opus', seconds: 3, ...over } });

before(async () => {
  webDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hqvoice-'));
  fs.writeFileSync(path.join(webDir, 'index.html'), '<!doctype html><title>Dulcy HQ</title>');
  if (skip) return;
  db = createPool(url!); await migrate(db);
  conf = makeCfg();
  server = createServer(db, conf, { at: at as any, chatModel: model, webDir, fetchImpl: fakeFetch });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', () => r()));
  port = (server.address() as AddressInfo).port;
});
after(async () => { if (!skip) { server.close(); await db.end(); } fs.rmSync(webDir, { recursive: true, force: true }); });
beforeEach(async () => {
  writes = []; modelCalls = []; openai = []; heardText = 'How many replies came in today?'; sttStatus = 200;
  answer = '**12 replies** came in today, 3 interested.\nSources: Airtable Emails';
  if (skip) return;
  Object.assign(conf, makeCfg());
  await db.query('TRUNCATE hq_users, hq_sessions, hq_login_attempts, hq_user_events, hq_chat_threads, hq_chat_messages, hq_voice_uses, hq_push_log RESTART IDENTITY CASCADE');
  await upsertUser(db, 'Alex@dulcy.io', 'owner', PW, 'Alex');
  await upsertUser(db, 'josh@dulcy.io', 'member', JOSH_PW, 'Josh');
});

// ---------- pure ----------
test('spokenText: no Sources line, no markdown, links or list marks; long answers cut at a sentence', () => {
  assert.equal(spokenText('**12 replies** today, see [the inbox](https://hq.dulcy.io/#/inbox).\n- 3 interested\nSources: Airtable Emails'), '12 replies today, see the inbox. 3 interested');
  assert.equal(spokenText('## Top\n1. One `x`\n2. Two\n\n**Sources:** engine jobs'), 'Top One x Two');
  const long = `${'This is a sentence. '.repeat(120)}`;
  const s = spokenText(long);
  assert.ok(s.length <= 1500 && s.endsWith('.'), 'cut at a sentence end, at most 1,500 characters');
  assert.equal(spokenText('Sources: none'), '');
});

test('empty transcripts and voice state (VOICE switch, keys) read plainly', () => {
  assert.equal(isEmptyTranscript(''), true);
  assert.equal(isEmptyTranscript(' . '), true);
  assert.equal(isEmptyTranscript('Hi'), false);
  const base = makeCfg();
  assert.deepEqual(voiceState(base, true, true), { on: true, reason: '', maxSeconds: 60, turnsPerHour: 60 });
  assert.match(voiceState({ ...base, voiceOn: false }, true, true).reason, /VOICE=on/);
  assert.match(voiceState(base, true, false).reason, /OPENAI_API_KEY/);
  assert.match(voiceState(base, false, true).reason, /ANTHROPIC_API_KEY/);
  const off = loadConfig({ ENGINE_SECRET: 'x'.repeat(40), DATABASE_URL: 'postgres://x', VOICE_MAX_SECONDS: '300' } as NodeJS.ProcessEnv);
  assert.deepEqual([off.voiceOn, off.voiceMaxSeconds, off.openAiSttModel, off.openAiTtsModel, off.openAiTtsVoice], [false, 60, 'gpt-4o-mini-transcribe', 'gpt-4o-mini-tts', 'coral'], 'off by default; clips never longer than 60 s');
  assert.deepEqual([voiceFor(base, 'Atlas'), voiceFor(base, 'Ada')], ['ash', 'coral'], 'a voice per agent when OPENAI_TTS_VOICES names one');
  assert.ok(clipByteLimit(base) < 3_000_000);
});

// ---------- the flow ----------
test('a voice turn: transcribed, posted into the same chat as a normal message, short answer, read aloud', { skip }, async () => {
  const alex = await login();
  const st = await call('GET', '/hq/api/voice/status', { cookie: alex });
  assert.deepEqual([st.status, st.body.on, st.body.maxSeconds], [200, true, 60]);

  const r = await turn(alex);
  assert.equal(r.status, 200);
  assert.match(String(r.headers['content-type']), /application\/x-ndjson/);
  assert.deepEqual(r.lines[0], { heard: 'How many replies came in today?' }, 'what was heard comes first');
  const done = r.lines[1];
  assert.equal(done.done, true);
  assert.equal(done.agent, 'Ada');
  assert.equal(done.speak, '12 replies came in today, 3 interested.', 'the spoken text drops markdown and the Sources line');
  assert.equal(openai.length, 1);
  assert.deepEqual([openai[0].model, openai[0].fileName, openai[0].fileType, openai[0].fileSize, openai[0].auth], ['gpt-4o-mini-transcribe', 'clip.webm', 'audio/webm', 4000, 'Bearer sk-test-voice']);
  assert.match(modelCalls[0].varying, /VOICE MODE/, 'the agent is told to keep it short');
  assert.match(modelCalls[0].varying, /never approves, sends/);
  assert.equal(modelCalls[0].last, 'How many replies came in today?');

  // It is HQ Chat's own thread: it shows there like a typed message.
  const th = await call('GET', `/hq/api/chat/threads/${done.threadId}`, { cookie: alex });
  assert.deepEqual(th.body.thread.messages.map((m: any) => [m.role, m.author, m.text]), [['user', 'Alex', 'How many replies came in today?'], ['assistant', 'Ada', answer]]);
  assert.equal((await call('GET', '/hq/api/chat/latest?agent=Ada', { cookie: alex })).body.threadId, done.threadId);

  // Read aloud: one mp3 of the spoken text.
  const sp = await call('POST', '/hq/api/voice/speak', { cookie: alex, body: { messageId: done.reply.id } });
  assert.equal(sp.status, 200);
  assert.equal(sp.headers['content-type'], 'audio/mpeg');
  assert.deepEqual(sp.buf, MP3);
  const tts = openai[1].json;
  assert.deepEqual([tts.model, tts.voice, tts.input, tts.response_format], ['gpt-4o-mini-tts', 'coral', '12 replies came in today, 3 interested.', 'mp3']);
  assert.match(tts.instructions, /Ada/);

  // Keep talking in the same chat.
  heardText = 'And yesterday?';
  const r2 = await turn(alex, { threadId: done.threadId });
  assert.equal(r2.lines[1].threadId, done.threadId);
  assert.equal((await call('GET', `/hq/api/chat/threads/${done.threadId}`, { cookie: alex })).body.thread.messages.length, 4);

  // Only counts are kept: no clip, no words.
  const uses = (await db.query(`SELECT kind, seconds::float AS seconds, chars FROM hq_voice_uses ORDER BY id`)).rows;
  assert.deepEqual(uses, [{ kind: 'turn', seconds: 3, chars: null }, { kind: 'speak', seconds: null, chars: 39 }, { kind: 'turn', seconds: 3, chars: null }]);
  const cols = (await db.query(`SELECT column_name FROM information_schema.columns WHERE table_name='hq_voice_uses' ORDER BY ordinal_position`)).rows.map((x) => x.column_name);
  assert.deepEqual(cols, ['id', 'user_id', 'kind', 'seconds', 'chars', 'created_at']);
  assert.deepEqual(writes, [], 'nothing written to Airtable');
});

test('voice never approves or sends: "approve them all" is only a chat answer', { skip }, async () => {
  const alex = await login();
  heardText = 'Approve all the decisions and send the replies.';
  answer = 'I can\'t approve from voice: the 4 replies are waiting as cards in Decisions for you to press.\nSources: Airtable Decisions';
  const r = await turn(alex);
  assert.equal(r.lines[1].done, true);
  assert.deepEqual(writes, [], 'no Airtable write, no send');
  assert.equal(openai.filter((c) => !c.url.endsWith('/transcriptions')).length, 0);
});

test('silence is not posted; a speech-to-text failure is a line, not a chat message', { skip }, async () => {
  const alex = await login();
  heardText = ' . ';
  const r = await turn(alex);
  assert.deepEqual(r.lines, [{ heard: '', empty: true }]);
  assert.equal(modelCalls.length, 0);
  assert.equal(Number((await db.query(`SELECT count(*)::int AS n FROM hq_chat_messages`)).rows[0].n), 0);

  sttStatus = 500;
  const e = await turn(alex);
  assert.equal(e.lines.length, 1);
  assert.equal(e.lines[0].status, 502);
  assert.match(e.lines[0].error, /couldn't hear/);
  assert.equal(Number((await db.query(`SELECT count(*)::int AS n FROM hq_chat_messages`)).rows[0].n), 0);
});

// ---------- auth ----------
test('auth: signed in only, same-site writes only, members only in their own chats, owner-only agents and clients refused', { skip }, async () => {
  assert.equal((await turn('')).status, 401);
  const alex = await login();
  assert.equal((await call('POST', '/hq/api/voice/turn', { cookie: alex, origin: 'https://evil.example', body: { agent: 'Ada' } })).status, 403, 'cross-site refused');
  assert.equal((await call('POST', '/hq/api/voice/turn', { cookie: alex, headers: { 'x-hq-view': 'member' }, body: { agent: 'Ada', audio: clip(), mime: 'audio/webm', seconds: 3 } })).status, 403, 'view as member is read only');

  const mine = (await turn(alex)).lines[1];
  const josh = await login('josh@dulcy.io', JOSH_PW);
  openai = [];
  assert.equal((await turn(josh, { threadId: mine.threadId })).status, 404, "a member can't talk into the owner's chat");
  assert.equal((await turn(josh, { agent: 'Ledger' })).status, 403, 'money stays owner-only');
  assert.equal((await turn(josh, { agent: 'Sienna' })).status, 403);
  assert.equal((await turn(alex, { agent: 'Atlas', threadId: mine.threadId })).status, 409, "a chat with Ada can't be answered by Atlas");
  assert.equal(openai.length, 0, 'nothing is transcribed (or paid) before the checks pass');
  assert.equal((await call('POST', '/hq/api/voice/speak', { cookie: josh, body: { messageId: mine.reply.id } })).status, 404, "a member can't hear the owner's answers");
  assert.equal((await call('POST', '/hq/api/voice/speak', { cookie: alex, body: { messageId: mine.question.id } })).status, 404, 'only agent answers are read aloud');

  const own = await turn(josh, { agent: 'Echo' });
  assert.equal(own.lines[1].agent, 'Echo', 'a member talks to the agents they can see, in their own chat');
  assert.equal((await call('POST', '/hq/api/voice/speak', { cookie: josh, body: { messageId: own.lines[1].reply.id } })).status, 200);

  await upsertUser(db, 'client@example.com', 'member', JOSH_PW, 'Client');
  await db.query(`UPDATE hq_users SET role='client', client_rec='recAAAAAAAAAAAAAA' WHERE email='client@example.com'`);
  const client = await login('client@example.com', JOSH_PW);
  assert.equal((await call('GET', '/hq/api/voice/status', { cookie: client })).status, 403, 'client logins never reach voice');
});

// ---------- limits ----------
test('limits: 60 s per clip, size, format, turns per hour', { skip }, async () => {
  const alex = await login();
  assert.equal((await turn(alex, { seconds: 61.5 })).status, 413);
  assert.equal((await turn(alex, { audio: clip(clipByteLimit(conf) + 10) })).status, 413);
  assert.equal((await turn(alex, { mime: 'video/quicktime' })).status, 415);
  assert.equal((await turn(alex, { audio: clip(10) })).status, 400);
  assert.equal((await turn(alex, { seconds: undefined })).status, 400);
  assert.equal(openai.length, 0);

  conf.voiceTurnsPerHour = 2;
  assert.equal((await turn(alex)).status, 200);
  assert.equal((await turn(alex, { mime: 'audio/mp4' })).status, 200);
  assert.equal(openai[1].fileName, 'clip.mp4', 'iPhone Safari records mp4');
  const third = await turn(alex);
  assert.equal(third.status, 429);
  assert.match(third.body.error, /2 voice turns this hour/);
  assert.equal(openai.length, 2, 'the third clip is not sent');
  const josh = await login('josh@dulcy.io', JOSH_PW);
  assert.equal((await turn(josh, { agent: 'Echo' })).status, 200, 'the limit is per person');
});

test('VOICE off: the Talk button gets the reason, every voice route refuses, nothing is called', { skip }, async () => {
  conf.voiceOn = false;
  const alex = await login();
  const st = await call('GET', '/hq/api/voice/status', { cookie: alex });
  assert.deepEqual([st.status, st.body.on], [200, false]);
  assert.match(st.body.reason, /VOICE=on/);
  const t = await turn(alex);
  assert.deepEqual([t.status, t.body.off], [503, true]);
  assert.equal((await call('POST', '/hq/api/voice/speak', { cookie: alex, body: { messageId: 1 } })).status, 503);
  assert.equal(openai.length, 0);
  assert.equal(modelCalls.length, 0);

  conf.voiceOn = true; conf.openAiApiKey = undefined;
  // The provider was made with the key at start; voiceState reads the config, so a missing key reads as off.
  assert.match((await call('GET', '/hq/api/voice/status', { cookie: alex })).body.reason, /OPENAI_API_KEY/);
});

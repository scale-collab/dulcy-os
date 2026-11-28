// HQ Content round 5: every Content Center button as an HQ button, done the Content Center's way
// (the same Content Automation Action value, the same n8n webhook with the same body, the same field
// writes), Distribution per platform (approve never schedules; Schedule is its own press), the posted
// stats, and the guards: owner only, same-origin writes, one automation at a time. Airtable and fetch
// are fakes: no webhook is fired, nothing is posted or scheduled.
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
import { CF, CONTENT } from '../src/agents/sienna.js';
import { XF, _resetContentCache, videoOf, videoSteps } from '../src/hq/content.js';
import { AF, DF, DISTRIBUTION, HOOKS, _resetHookCache, buildYouTubeDescription, hookUrl, postUrlOk, shortJob } from '../src/hq/contentActions.js';

const url = process.env.TEST_DATABASE_URL;
const skip = !url ? 'TEST_DATABASE_URL not set' : false;
const PW = 'correct horse battery staple';
const rec = (n: string) => `recCONTENT${n.padStart(7, '0')}`;
const drec = (n: string) => `recDRAFT${n.padStart(9, '0')}`;
const MAIN = 'Alex Woung', RAW = 'Alex Woung Raw';
const HOOK = (k: string) => `https://n8n.test/webhook/${k.toLowerCase()}`;

// ---------- pure: the steps carry the HQ buttons, never a Content Center link ----------
test('content r5: each step\'s button is the HQ version of the Content Center button', () => {
  const now = Date.parse('2026-11-26T15:00:00Z');
  const steps = (f: Record<string, unknown>) => videoSteps(videoOf({ id: rec('1'), fields: { [CF.title]: 'T', [CF.channel]: MAIN, [CF.ideaDecision]: 'Approved', [CF.script]: 'x', ...f } }, new Set([rec('1')])), [], { gamma: '', gammaUrl: '', hasPrep: true, stuck: false, now, posted: '' });
  const next = (f: Record<string, unknown>) => { const s = steps(f).find((x) => x.state === 'now' && !x.optional)!; return [s.key, s.where, s.buttons.filter((b) => b.kind === 'run').map((b) => b.run)]; };
  const base = { [XF.rawFolderUrl]: 'https://f.io/raw', [XF.finalFolderUrl]: 'https://f.io/final' };
  assert.deepEqual(next({}), ['folder', 'hq', ['setupFrame']]);
  assert.deepEqual(next(base), ['record', 'byHand', ['syncFrame', 'routeOpus', 'routeDavinci']]);
  assert.deepEqual(next({ ...base, [XF.editingRoute]: 'OpusClip', [XF.message]: 'Recording found' }), ['edit', 'hq', ['editFull', 'routeDavinci']]);
  assert.deepEqual(next({ ...base, [XF.editingRoute]: 'Manual Editor', [CF.stage]: 'Recorded' }), ['edit', 'byHand', ['syncFrame', 'routeOpus']], 'DaVinci route: by hand, then Sync Frame.io');
  const fin = { ...base, [XF.finalAssetUrl]: 'https://f.io/v', [CF.stage]: 'Editing' };
  assert.deepEqual(next(fin), ['thumbnail', 'hq', ['thumbnail']]);
  assert.deepEqual(next({ ...fin, [XF.finalThumbnailUrl]: 'https://f.io/t', [XF.thumbnailStatus]: 'Needs Review' }), ['thumbnail', 'hq', ['thumbnailApprove', 'thumbnailRevise']]);
  const thumbOk = { ...fin, [XF.finalThumbnailUrl]: 'https://f.io/t', [XF.thumbnailStatus]: 'Approved' };
  assert.deepEqual(next(thumbOk), ['details', 'hq', ['youtubeDetails']]);
  assert.deepEqual(next({ ...thumbOk, [CF.ytTitle]: 'T', [XF.youtubeDescription]: 'D' }), ['youtube', 'byHand', ['youtubeUrl']]);
  const onYt = { ...thumbOk, [XF.youtubeUrl]: 'https://youtu.be/KYb_fCs1klg', [XF.publishingStatus]: 'Published' };
  assert.deepEqual(next(onYt), ['clips', 'hq', ['syncFrame']], 'no final asset id yet: Sync Frame.io first');
  assert.deepEqual(next({ ...onYt, [XF.finalAssetId]: 'A1' }), ['clips', 'hq', ['shortClips']]);
  assert.deepEqual(next({ ...onYt, [XF.finalAssetId]: 'A1', [XF.shortProjectId]: 'P', [XF.shortSourceAssetId]: 'A1' }), ['clips', 'hq', ['refreshClips']]);
  const clips = { ...onYt, [XF.finalAssetId]: 'A1', [XF.shortProjectId]: 'P', [XF.shortSourceAssetId]: 'A1', [XF.clips]: ['recCLIP0000000001'] };
  assert.deepEqual(next(clips), ['posts', 'hq', ['postsBrief']]);
  assert.deepEqual(next({ ...clips, [XF.distributionChannels]: ['Instagram'] }), ['posts', 'hq', ['posts', 'postsBrief']]);
  assert.deepEqual(next({ ...clips, [XF.distributionChannels]: ['Instagram'], [XF.action]: 'Generate Distribution Pack' }), ['posts', 'hq', ['postsRetry']]);
  const last = steps({ ...clips, [XF.distributionChannels]: ['Instagram'], [XF.distributionStatus]: 'Drafts Ready' }).find((x) => x.state === 'now')!;
  assert.deepEqual([last.key, last.buttons.map((b) => b.kind)], ['approve', ['distribution']]);
  // The script step offers the Content Center's "Generate script" (n8n) next to "Ask Sienna now".
  const noScript = videoSteps(videoOf({ id: rec('2'), fields: { [CF.title]: 'T', [CF.channel]: RAW, [CF.ideaDecision]: 'Approved' } }, new Set()), [], { gamma: '', gammaUrl: '', hasPrep: false, stuck: true, now, posted: '' });
  assert.deepEqual(noScript.find((x) => x.key === 'script')!.buttons.map((b) => b.run ?? b.kind), ['script', 'askSienna'], 'stuck: Generate script first');
  for (const f of [{}, base, fin, thumbOk, onYt, clips]) assert.equal(JSON.stringify(steps(f)).includes('contentCenter'), false, 'no "Open the Content Center" button left');
});

test('content r5: short-clips identity, post links per platform, the YouTube template (ported)', () => {
  assert.deepEqual(shortJob({ shortProjectId: '', shortState: '', shortSourceId: '', finalId: 'A' }), { submitted: false, sourceMatches: false, projectId: '', blocked: false });
  assert.equal(shortJob({ shortProjectId: 'P', shortState: '', shortSourceId: 'B', finalId: 'A' }).blocked, true, 'another final video');
  assert.equal(shortJob({ shortProjectId: 'P', shortState: 'Error', shortSourceId: 'A', finalId: 'A' }).blocked, true);
  assert.equal(postUrlOk('Reddit', 'https://www.reddit.com/r/coldemail/comments/x'), true);
  assert.equal(postUrlOk('Reddit', 'https://reddit.com/user/x'), false);
  assert.equal(postUrlOk('X', 'https://x.com/alexwoung/status/1'), true);
  assert.equal(postUrlOk('LinkedIn', 'https://www.linkedin.com/posts/alex-1'), true);
  assert.equal(postUrlOk('Instagram', 'https://www.instagram.com/reel/abc/'), true);
  assert.equal(postUrlOk('TikTok', 'https://www.tiktok.com/@alex/video/1'), true);
  assert.equal(postUrlOk('TikTok', 'http://www.tiktok.com/@alex/video/1'), false, 'https only');
  assert.equal(postUrlOk('YouTube Shorts', 'https://youtube.com/shorts/abc'), true);
  assert.match(buildYouTubeDescription(RAW, 'T', 'One. Two. Three. Four.', ''), /^One\.\s+Two\.\s+Three\.\n\n\*\*\*\n\nConnect with me/);
  assert.match(buildYouTubeDescription(MAIN, 'T', '', '0:00 Intro'), /^This is one part of building a predictable growth system[\s\S]*Chapters:\n0:00 Intro/);
});

test('content r5: webhook URL from CONTENT_HOOK_<NAME>, else read once from n8n; none = 503, nothing sent', async () => {
  _resetHookCache();
  const calls: string[] = [];
  const f = (async (u: string) => { calls.push(String(u)); return new Response(JSON.stringify({ nodes: [{ type: 'n8n-nodes-base.webhook', name: 'Script Webhook', parameters: { path: 'abc-123' } }] }), { status: 200 }); }) as unknown as typeof fetch;
  const base = { contentHooks: {}, contentWebhookBase: 'https://n8n.example', n8nApiKey: '', n8nBaseUrl: 'http://n8n.local' };
  assert.equal(await hookUrl({ ...base, contentHooks: { SCRIPT: 'https://set.example/webhook/s' } }, 'script', f), 'https://set.example/webhook/s');
  await assert.rejects(hookUrl(base, 'script', f), (e: any) => e.status === 503 && /CONTENT_HOOK_SCRIPT/.test(e.message));
  assert.equal(await hookUrl({ ...base, n8nApiKey: 'k' }, 'script', f), 'https://n8n.example/webhook/abc-123');
  assert.equal(await hookUrl({ ...base, n8nApiKey: 'k' }, 'script', f), 'https://n8n.example/webhook/abc-123');
  assert.deepEqual(calls, [`http://n8n.local/api/v1/workflows/${HOOKS.script.workflow}`], 'read once (cached), the workflow the Content Center calls');
  _resetHookCache();
});

// ---------- the API ----------
let db: Db;
let server: http.Server;
let port = 0;
let webDir: string;
let tables: Record<string, Record<string, Record<string, unknown>>>;
let writes: [string, string, Record<string, unknown>][];
let fetches: { url: string; body: any }[];
let answer: (url: string, body: any) => { status: number; body?: unknown };
const asRow = (table: string, id: string) => ({ id, fields: { ...tables[table][id] } });
const at = {
  async list(table: string, formula: string) {
    let rows = Object.keys(tables[table] ?? {}).map((id) => asRow(table, id));
    const only = [...formula.matchAll(/RECORD_ID\(\)='(rec[A-Za-z0-9]{14})'/g)].map((m) => m[1]);
    if (only.length) rows = rows.filter((r) => only.includes(r.id));
    if (formula.includes('LAST_MODIFIED_TIME')) rows = [];
    return rows;
  },
  async get(table: string, id: string) { return tables[table]?.[id] ? asRow(table, id) : null; },
  async create() { throw new Error('HQ content never creates records'); },
  async update(t: string, id: string, f: Record<string, unknown>) { writes.push([t, id, f]); Object.assign(tables[t][id], f); },
};
const fakeFetch = (async (u: string, init?: RequestInit) => {
  const body = init?.body ? JSON.parse(String(init.body)) : null;
  fetches.push({ url: String(u), body });
  const a = answer(String(u), body);
  return new Response(a.body === undefined ? '' : JSON.stringify(a.body), { status: a.status });
}) as unknown as typeof fetch;
const HOOK_ENV = Object.fromEntries(Object.values(HOOKS).map((h) => [`CONTENT_HOOK_${h.env}`, HOOK(h.env)]));
function cfg(): Config {
  return { ...loadConfig({ ENGINE_SECRET: 'x'.repeat(40), DATABASE_URL: url ?? 'postgres://x', HQ_SESSION_SECRET: 's'.repeat(40), HQ_HOST: 'hq.test.local', ...HOOK_ENV } as NodeJS.ProcessEnv), airtableApiKey: undefined, anthropicApiKey: undefined };
}
interface Res { status: number; body: any; text: string }
function call(p: string, opts: { cookie?: string; body?: unknown; origin?: string | null } = {}): Promise<Res> {
  return new Promise((resolve, reject) => {
    const data = opts.body === undefined ? undefined : JSON.stringify(opts.body);
    const origin = opts.origin === undefined ? `https://127.0.0.1:${port}` : opts.origin;
    const req = http.request({ host: '127.0.0.1', port, method: data ? 'POST' : 'GET', path: p, headers: { host: `127.0.0.1:${port}`, ...(opts.cookie ? { cookie: opts.cookie } : {}), ...(data ? { 'content-type': 'application/json', ...(origin ? { origin } : {}) } : {}) } }, (res) => {
      const chunks: Buffer[] = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => { const text = Buffer.concat(chunks).toString('utf8'); let body: any = null; try { body = JSON.parse(text); } catch { /* not json */ } resolve({ status: res.statusCode ?? 0, body, text }); });
    });
    req.on('error', reject); if (data) req.write(data); req.end();
  });
}
function login(email: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port, method: 'POST', path: '/hq/api/auth/login', headers: { host: `127.0.0.1:${port}`, origin: `https://127.0.0.1:${port}`, 'content-type': 'application/json' } }, (res) => {
      res.resume();
      res.on('end', () => resolve(([] as string[]).concat(res.headers['set-cookie'] ?? []).map((c) => c.split(';')[0]).find((c) => c.startsWith('__Host-hq_session=')) ?? ''));
    });
    req.on('error', reject); req.write(JSON.stringify({ email, password: PW })); req.end();
  });
}
before(async () => {
  webDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hqcontent5-'));
  fs.writeFileSync(path.join(webDir, 'index.html'), '<!doctype html><title>Dulcy HQ</title>');
  if (skip) return;
  db = createPool(url!); await migrate(db);
  server = createServer(db, cfg(), { at: at as any, webDir, fetchImpl: fakeFetch });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', () => r()));
  port = (server.address() as AddressInfo).port;
});
after(async () => { if (!skip) { server.close(); await db.end(); } fs.rmSync(webDir, { recursive: true, force: true }); });
beforeEach(async () => {
  tables = {}; writes = []; fetches = []; _resetContentCache(); _resetHookCache();
  answer = () => ({ status: 202, body: { success: true, accepted: true } });
  if (skip) return;
  await db.query('TRUNCATE hq_users, hq_sessions, hq_login_attempts, hq_content_log, hq_content_posts RESTART IDENTITY CASCADE');
  await upsertUser(db, 'alex@dulcy.io', 'owner', PW, 'Alex');
  await upsertUser(db, 'josh@dulcy.io', 'member', PW, 'Josh');
});

const approved = { [CF.ideaDecision]: 'Approved', [CF.script]: 'the script', [CF.stage]: 'Script' };
function fixtures() {
  tables[CONTENT] = {
    [rec('NEW')]: { [CF.title]: 'New, no folder', [CF.channel]: MAIN, ...approved },
    [rec('SYNCED')]: { [CF.title]: 'Recorded, OpusClip', [CF.channel]: MAIN, ...approved, [XF.rawFolderUrl]: 'https://f.io/r', [XF.editingRoute]: 'OpusClip', [XF.message]: 'Recording found.' },
    [rec('FINAL')]: { [CF.title]: 'Final in Frame.io', [CF.channel]: RAW, ...approved, [CF.description]: 'One. Two. Three. Four.', [XF.rawFolderUrl]: 'https://f.io/r', [XF.finalAssetUrl]: 'https://f.io/v', [XF.finalAssetId]: 'A1', [XF.finalThumbnailUrl]: 'https://f.io/t', [XF.thumbnailStatus]: 'Needs Review' },
    [rec('CLIPS')]: { [CF.title]: 'Clips made', [CF.channel]: MAIN, ...approved, [XF.finalAssetUrl]: 'https://f.io/v', [XF.finalAssetId]: 'A1', [XF.shortProjectId]: 'P1', [XF.shortSourceAssetId]: 'A1', [XF.youtubeUrl]: 'https://youtu.be/KYb_fCs1klg', [XF.clips]: ['recCLIP0000000001'], [XF.distributionChannels]: ['Instagram', 'Reddit'], [XF.distributionRecords]: [drec('IG'), drec('RD'), drec('NL')] },
    [rec('BUSY')]: { [CF.title]: 'Automation running', [CF.channel]: MAIN, ...approved, [XF.action]: 'Sync Frame.io' },
    [rec('IDEA')]: { [CF.title]: 'Idea waiting', [CF.channel]: MAIN, [CF.ideaDecision]: 'Needs Review' },
    [rec('OTHER')]: { [CF.title]: 'Other video', [CF.channel]: MAIN, ...approved },
  };
  tables[DISTRIBUTION] = {
    [drec('IG')]: { [DF.parent]: [rec('CLIPS')], [DF.clip]: ['recCLIP0000000001'], [DF.platform]: 'Instagram', [DF.outputType]: 'Reel', [DF.title]: 'IG reel', [DF.body]: 'Caption text', [DF.approval]: 'Needs Review', [DF.publishing]: 'Draft' },
    [drec('RD')]: { [DF.parent]: [rec('CLIPS')], [DF.platform]: 'Reddit', [DF.outputType]: 'Discussion Draft', [DF.title]: 'Reddit post', [DF.body]: 'Body', [DF.approval]: 'Needs Review', [DF.publishing]: 'Draft' },
    [drec('NL')]: { [DF.parent]: [rec('CLIPS')], [DF.platform]: 'Newsletter', [DF.outputType]: 'Dulcy Newsletter', [DF.title]: 'Newsletter', [DF.body]: 'Hi', [DF.approval]: 'Needs Review', [DF.publishing]: 'Draft' },
    [drec('ELSE')]: { [DF.parent]: [rec('OTHER')], [DF.platform]: 'X', [DF.outputType]: 'Post', [DF.title]: 'Other X', [DF.approval]: 'Needs Review', [DF.publishing]: 'Draft' },
  };
}
const runIt = (cookie: string, id: string, action: string, extra: Record<string, unknown> = {}) => call(`/hq/api/content/items/${id}/run`, { cookie, body: { action, ...extra } });

test('content r5 API: owner only (members 403 on every new route), same-origin writes; nothing written or sent', { skip }, async () => {
  fixtures();
  const josh = await login('josh@dulcy.io');
  const routes: [string, unknown][] = [[`/hq/api/content/items/${rec('NEW')}`, undefined], [`/hq/api/content/items/${rec('NEW')}/run`, { action: 'setupFrame' }],
    [`/hq/api/content/items/${rec('CLIPS')}/posted`, { slot: 'TikTok', url: 'https://www.tiktok.com/@a/video/1' }], [`/hq/api/content/drafts/${drec('IG')}`, { verdict: 'approve' }], [`/hq/api/content/drafts/${drec('IG')}/schedule`, { at: '2099-01-01T15:00:00Z' }]];
  for (const [p, body] of routes) {
    assert.equal((await call(p, { body })).status, 401, `${p} needs a session`);
    assert.equal((await call(p, { cookie: josh, body })).status, 403, `${p} is the owner's`);
  }
  const alex = await login('alex@dulcy.io');
  assert.equal((await call(`/hq/api/content/items/${rec('NEW')}/run`, { cookie: alex, body: { action: 'setupFrame' }, origin: 'https://evil.example' })).status, 403, 'cross-site refused');
  assert.equal((await call(`/hq/api/content/items/${rec('NEW')}/run`, { cookie: alex, body: { action: 'setupFrame' }, origin: null })).status, 403, 'no Origin refused');
  assert.equal((await runIt(alex, rec('NEW'), 'deleteEverything')).status, 400, 'only the known buttons');
  assert.deepEqual([writes, fetches], [[], []]);
  assert.equal((await db.query('SELECT count(*)::int AS n FROM hq_content_log')).rows[0].n, 0);
});

test('content r5 API: field buttons write the Content Center\'s exact values (Content Automation Action, Editing Route, Thumbnail Status, YouTube URL, brief)', { skip }, async () => {
  fixtures();
  const alex = await login('alex@dulcy.io');
  const one = async (id: string, action: string, extra: Record<string, unknown> = {}) => {
    writes = []; const r = await runIt(alex, id, action, extra); assert.equal(r.status, 200, `${action}: ${r.text}`);
    assert.deepEqual(fetches, [], `${action} fires no webhook`); return writes;
  };
  assert.deepEqual(await one(rec('NEW'), 'setupFrame'), [[CONTENT, rec('NEW'), { [XF.action]: 'Sync Frame.io' }]]);
  tables[CONTENT][rec('NEW')][XF.action] = undefined; tables[CONTENT][rec('NEW')][XF.rawFolderUrl] = 'https://f.io/r';
  assert.deepEqual(await one(rec('NEW'), 'syncFrame'), [[CONTENT, rec('NEW'), { [XF.action]: 'Sync Frame.io' }]]);
  assert.deepEqual(await one(rec('SYNCED'), 'routeDavinci'), [[CONTENT, rec('SYNCED'), { [XF.editingRoute]: 'Manual Editor' }]], 'DaVinci = the field\'s "Manual Editor" choice');
  assert.deepEqual(await one(rec('SYNCED'), 'routeOpus'), [[CONTENT, rec('SYNCED'), { [XF.editingRoute]: 'OpusClip' }]]);
  assert.deepEqual(await one(rec('SYNCED'), 'editFull'), [[CONTENT, rec('SYNCED'), { [XF.action]: 'Submit to OpusClip' }]], 'Edit full video');
  assert.deepEqual(await one(rec('FINAL'), 'thumbnailApprove'), [[CONTENT, rec('FINAL'), { [XF.thumbnailStatus]: 'Approved' }]]);
  assert.deepEqual(await one(rec('FINAL'), 'shortClips'), [[CONTENT, rec('FINAL'), { [XF.action]: 'Submit to OpusClip' }]], 'Create short clips');
  assert.deepEqual(await one(rec('CLIPS'), 'refreshClips'), [[CONTENT, rec('CLIPS'), { [XF.action]: 'Refresh Opus Clips' }]], 'Check clip status');
  tables[CONTENT][rec('CLIPS')][XF.action] = undefined;
  assert.deepEqual(await one(rec('CLIPS'), 'posts'), [[CONTENT, rec('CLIPS'), { [XF.action]: 'Generate Distribution Pack' }]], 'Generate posts');
  tables[CONTENT][rec('CLIPS')][XF.action] = undefined;
  assert.deepEqual(await one(rec('CLIPS'), 'postsBrief', { channels: ['Reddit', 'Resource', 'Instagram', 'Nope'], count: 4, minScore: 90 }),
    [[CONTENT, rec('CLIPS'), { [AF.requestedClipCount]: 4, [AF.minimumClipScore]: 90, [XF.distributionChannels]: ['Instagram', 'Reddit'], [XF.action]: 'Generate Distribution Pack' }]], 'the repurposing brief (Resource stays off), then the pack');
  assert.deepEqual(await one(rec('FINAL'), 'youtubeUrl', { url: 'https://www.youtube.com/watch?v=KYb_fCs1klg' }), [[CONTENT, rec('FINAL'), { [XF.youtubeUrl]: 'https://www.youtube.com/watch?v=KYb_fCs1klg' }]]);
  const log = (await db.query(`SELECT action, changes FROM hq_content_log ORDER BY id`)).rows;
  assert.equal(log.length, 11, 'every write is logged');
  assert.deepEqual(log[0].changes, [{ field: 'Content Automation Action', from: '', to: 'Sync Frame.io' }]);
});

test('content r5 API: webhook buttons call the Content Center\'s n8n webhook with its exact body', { skip }, async () => {
  fixtures();
  const alex = await login('alex@dulcy.io');
  const hook = async (id: string, action: string, extra: Record<string, unknown> = {}) => {
    fetches = []; writes = []; const r = await runIt(alex, id, action, extra); assert.equal(r.status, 200, `${action}: ${r.text}`);
    assert.deepEqual(writes, [], `${action} writes nothing itself`); return fetches;
  };
  assert.deepEqual(await hook(rec('NEW'), 'script'), [{ url: HOOK('SCRIPT'), body: { recordId: rec('NEW'), action: 'Generate Script' } }]);
  tables[CONTENT][rec('FINAL')][XF.finalThumbnailUrl] = undefined;
  assert.deepEqual(await hook(rec('FINAL'), 'thumbnail'), [{ url: HOOK('THUMBNAIL'), body: { recordId: rec('FINAL'), action: 'Generate Thumbnail' } }]);
  tables[CONTENT][rec('FINAL')][XF.finalThumbnailUrl] = 'https://f.io/t';
  answer = (_u, b) => ({ status: 202, body: { accepted: true, requestId: b.requestId } });
  const rv = await hook(rec('FINAL'), 'thumbnailRevise', { changes: '  Bigger text  ' });
  assert.deepEqual([rv[0].url, { ...rv[0].body, requestId: 'x' }], [HOOK('THUMBNAIL_REVISE'), { recordId: rec('FINAL'), action: 'Revise Thumbnail', changes: 'Bigger text', requestId: 'x', expectedThumbnailUrl: 'https://f.io/t' }]);
  assert.match(rv[0].body.requestId, /^[0-9a-f-]{36}$/);
  answer = () => ({ status: 202, body: { accepted: true, requestId: 'someone-else' } });
  assert.equal((await runIt(alex, rec('FINAL'), 'thumbnailRevise', { changes: 'x' })).status, 502, 'Revise must echo our request id (202 + accepted), like the Content Center checks');
  answer = () => ({ status: 202, body: { accepted: true } });
  assert.deepEqual(await hook(rec('FINAL'), 'youtubeDetails'), [{ url: HOOK('YOUTUBE'), body: { recordId: rec('FINAL'), action: 'Prepare YouTube Details' } }]);
  tables[CONTENT][rec('CLIPS')][XF.action] = 'Generate Distribution Pack';
  assert.deepEqual(await hook(rec('CLIPS'), 'postsRetry'), [{ url: HOOK('DISTRIBUTION'), body: { recordId: rec('CLIPS'), action: 'Generate Distribution Pack' } }]);
  // Prepare YouTube details: n8n answers with an error → the Content Center's own channel template (its fallback).
  answer = () => ({ status: 500 });
  writes = [];
  assert.equal((await runIt(alex, rec('FINAL'), 'youtubeDetails')).status, 200);
  assert.deepEqual(writes, [[CONTENT, rec('FINAL'), { [CF.ytTitle]: 'Final in Frame.io', [XF.youtubeDescription]: buildYouTubeDescription(RAW, 'Final in Frame.io', 'One. Two. Three. Four.', '') }]]);
});

test('content r5 API: the Content Center\'s guards — one automation at a time, approved ideas only, short-clips identity, no webhook not set up', { skip }, async () => {
  fixtures();
  const alex = await login('alex@dulcy.io');
  for (const a of ['syncFrame', 'script', 'thumbnail', 'youtubeDetails', 'posts']) assert.equal((await runIt(alex, rec('BUSY'), a)).status, 409, `${a} while "Sync Frame.io" runs`);
  assert.equal((await runIt(alex, rec('IDEA'), 'syncFrame')).status, 409, 'an idea waiting for approval');
  assert.equal((await runIt(alex, rec('NEW'), 'editFull')).status, 409, 'no OpusClip route / no recording yet');
  assert.equal((await runIt(alex, rec('CLIPS'), 'shortClips')).status, 409, 'already submitted: no duplicate project');
  tables[CONTENT][rec('CLIPS')][XF.shortSourceAssetId] = 'OTHER';
  assert.equal((await runIt(alex, rec('CLIPS'), 'refreshClips')).status, 409, 'the job belongs to another final video');
  assert.equal((await runIt(alex, rec('CLIPS'), 'thumbnailApprove')).status, 409, 'on YouTube: the thumbnail is final');
  assert.equal((await runIt(alex, rec('CLIPS'), 'postsRetry')).status, 409, 'retry only for a stuck pack');
  assert.equal((await runIt(alex, rec('FINAL'), 'youtubeUrl', { url: 'https://vimeo.com/1' })).status, 400);
  assert.equal((await runIt(alex, rec('FINAL'), 'thumbnailRevise', { changes: '' })).status, 400);
  assert.deepEqual([writes, fetches], [[], []], 'a refusal writes and sends nothing');
  // A server without the webhook set up (and no n8n key): 503, nothing sent.
  const bare = createServer(db, { ...cfg(), contentHooks: {} }, { at: at as any, webDir, fetchImpl: fakeFetch });
  await new Promise<void>((r) => bare.listen(0, '127.0.0.1', () => r()));
  const keep = port; port = (bare.address() as AddressInfo).port;
  try {
    const a2 = await login('alex@dulcy.io');
    const r = await runIt(a2, rec('NEW'), 'script');
    assert.equal(r.status, 503); assert.match(r.body.error, /CONTENT_HOOK_SCRIPT/);
  } finally { bare.close(); port = keep; }
  assert.deepEqual(fetches, []);
});

test('content r5 API: Distribution per platform; Approve never schedules; Schedule is its own press (Instagram / YouTube only)', { skip }, async () => {
  fixtures();
  const alex = await login('alex@dulcy.io');
  const d = await call(`/hq/api/content/items/${rec('CLIPS')}`, { cookie: alex });
  assert.equal(d.status, 200, d.text);
  assert.deepEqual(d.body.distribution.platforms.map((p: any) => [p.platform, p.drafts.map((x: any) => x.id), p.chosen]),
    [['Instagram', [drec('IG')], true], ['TikTok', [], false], ['Reddit', [drec('RD')], true], ['Newsletter', [drec('NL')], false]], 'one row per platform; TikTok is posted by hand; another video\'s draft is not here');
  assert.equal(d.body.distribution.platforms[0].drafts[0].body, 'Caption text');
  assert.equal(d.body.distribution.platforms[0].drafts[0].canSchedule, true);
  assert.deepEqual(fetches, []);
  // Approve: Approval Status only. No webhook, no Scheduled At (the hourly n8n scheduler skips rows without one).
  let r = await call(`/hq/api/content/drafts/${drec('IG')}`, { cookie: alex, body: { verdict: 'approve' } });
  assert.equal(r.status, 200, r.text);
  assert.deepEqual([writes, fetches], [[[DISTRIBUTION, drec('IG'), { [DF.approval]: 'Approved' }]], []]);
  writes = [];
  r = await call(`/hq/api/content/drafts/${drec('RD')}`, { cookie: alex, body: { verdict: 'changes' } });
  assert.deepEqual(writes, [[DISTRIBUTION, drec('RD'), { [DF.approval]: 'Rejected' }]], 'Needs changes = the base\'s "Rejected" choice');
  // Schedule: refused for Reddit, for a time in the past, before approval; then the Content Center's scheduling webhook.
  writes = [];
  const soon = new Date(Date.now() + 2 * 86_400_000).toISOString();
  assert.equal((await call(`/hq/api/content/drafts/${drec('RD')}/schedule`, { cookie: alex, body: { at: soon } })).status, 409, 'Reddit is posted by hand');
  assert.equal((await call(`/hq/api/content/drafts/${drec('IG')}/schedule`, { cookie: alex, body: { at: '2099-01-01T15:00:00Z' } })).status, 400, 'too far ahead');
  assert.equal((await call(`/hq/api/content/drafts/${drec('IG')}/schedule`, { cookie: alex, body: { at: '2020-01-01T15:00:00Z' } })).status, 400);
  tables[DISTRIBUTION][drec('IG')][DF.approval] = 'Needs Review';
  assert.equal((await call(`/hq/api/content/drafts/${drec('IG')}/schedule`, { cookie: alex, body: { at: soon } })).status, 409, 'approve first');
  assert.deepEqual([writes, fetches], [[], []]);
  tables[DISTRIBUTION][drec('IG')][DF.approval] = 'Approved';
  r = await call(`/hq/api/content/drafts/${drec('IG')}/schedule`, { cookie: alex, body: { at: soon } });
  assert.equal(r.status, 200, r.text);
  assert.deepEqual(writes, [[DISTRIBUTION, drec('IG'), { [DF.scheduledAt]: soon }]]);
  assert.deepEqual(fetches, [{ url: HOOK('SCHEDULE'), body: { distributionRecordId: drec('IG') } }], 'the same body the Content Center\'s approve sends');
  // Newsletter approve: the Content Center's preview webhook (nothing is sent to subscribers).
  writes = []; fetches = [];
  answer = () => ({ status: 200, body: { ok: true, subscriberCount: 12 } });
  r = await call(`/hq/api/content/drafts/${drec('NL')}`, { cookie: alex, body: { verdict: 'approve' } });
  assert.equal(r.status, 200, r.text); assert.match(r.body.message, /12 subscribed emails.*Nothing was sent/);
  assert.deepEqual([writes, fetches], [[[DISTRIBUTION, drec('NL'), { [DF.approval]: 'Approved' }]], [{ url: HOOK('NEWSLETTER'), body: { recordId: drec('NL') } }]]);
});

test('content r5 API: "complete distribution stats" — where, when, views, likes, comments per platform', { skip }, async () => {
  fixtures();
  const alex = await login('alex@dulcy.io');
  let r = await call(`/hq/api/content/items/${rec('CLIPS')}/posted`, { cookie: alex, body: { slot: drec('RD'), url: 'https://www.reddit.com/r/coldemail/comments/abc', postedOn: '2026-11-27', views: 1200, likes: 40, comments: 9 } });
  assert.equal(r.status, 200, r.text);
  assert.deepEqual(writes, [[DISTRIBUTION, drec('RD'), { [DF.approval]: 'Approved', [DF.publishing]: 'Published', [DF.postUrl]: 'https://www.reddit.com/r/coldemail/comments/abc' }]], 'the Content Center\'s "mark as published" write');
  writes = [];
  r = await call(`/hq/api/content/items/${rec('CLIPS')}/posted`, { cookie: alex, body: { slot: drec('RD'), url: 'https://www.reddit.com/r/coldemail/comments/abc', postedOn: '2026-11-27', views: 1500, likes: 41, comments: 9 } });
  assert.deepEqual(writes, [], 'same link: only the stats change');
  r = await call(`/hq/api/content/items/${rec('CLIPS')}/posted`, { cookie: alex, body: { slot: 'TikTok', url: 'https://www.tiktok.com/@alexwoung/video/1', postedOn: '2026-11-28', views: 300 } });
  assert.equal(r.status, 200, r.text);
  assert.deepEqual(writes, [], 'TikTok has no draft in Airtable: HQ only');
  assert.equal((await call(`/hq/api/content/items/${rec('CLIPS')}/posted`, { cookie: alex, body: { slot: drec('RD'), url: 'https://x.com/a/status/1' } })).status, 400, 'a Reddit post needs a Reddit link');
  assert.equal((await call(`/hq/api/content/items/${rec('CLIPS')}/posted`, { cookie: alex, body: { slot: drec('ELSE'), url: 'https://x.com/a/status/1' } })).status, 400, 'another video\'s draft');
  assert.equal((await call(`/hq/api/content/items/${rec('CLIPS')}/posted`, { cookie: alex, body: { slot: 'TikTok', views: -3 } })).status, 400);
  assert.equal((await call(`/hq/api/content/items/${rec('CLIPS')}/posted`, { cookie: alex, body: { slot: 'TikTok', postedOn: '11/28' } })).status, 400);
  const d = await call(`/hq/api/content/items/${rec('CLIPS')}`, { cookie: alex });
  const rd = d.body.distribution.platforms.find((p: any) => p.platform === 'Reddit').drafts[0];
  assert.deepEqual([rd.publishing, rd.stats.views, rd.stats.postedOn], ['Published', 1500, '2026-11-27']);
  assert.deepEqual(d.body.distribution.platforms.find((p: any) => p.platform === 'TikTok').manual.views, 300);
  assert.deepEqual(d.body.distribution.totals, { posts: 2, views: 1800, likes: 41, comments: 9 });
  assert.equal(d.body.distribution.posted, 2);
  assert.deepEqual(fetches, [], 'recording a post never posts or calls n8n');
});

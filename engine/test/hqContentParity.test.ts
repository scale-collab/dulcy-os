// HQ Content parity (2026-11-28): the Airtable Content Center pieces HQ did not have yet, each proven to
// write exactly what the Content Center writes (settings panel, + Add content idea, "Content for", the
// dates, the YouTube boxes, the trash button, the repurposing score from Settings, the YouTube template
// with what is typed) and to show what its panel shows (clips shortlist, Reddit community, composer link,
// newsletter HTML, previous thumbnail, history). Airtable and fetch are fakes: no webhook is fired, nothing
// is posted, scheduled or really deleted.
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
import { CF, CONTENT, SETTINGS } from '../src/agents/sienna.js';
import { CLIPS, KL, SF_CC, XF, _resetContentCache, buildContent, ccSettingsOf, readContentSource } from '../src/hq/content.js';
import { AF, DF, DISTRIBUTION, HOOKS, _resetHookCache, buildYouTubeDescription } from '../src/hq/contentActions.js';
import { PF, clampSettings, completionDetail, composeUrl, currentReview, distributionCompletion, newsletterHtml, redditCommunityForRecord } from '../src/hq/contentCenter.js';

const url = process.env.TEST_DATABASE_URL;
const skip = !url ? 'TEST_DATABASE_URL not set' : false;
const PW = 'correct horse battery staple';
const rec = (n: string) => `recCONTENT${n.padStart(7, '0')}`;
const drec = (n: string) => `recDRAFT${n.padStart(9, '0')}`;
const crec = (n: string) => `recCLIP${n.padStart(10, '0')}`;
const MAIN = 'Alex Woung', RAW = 'Alex Woung Raw';
const HOOK = (k: string) => `https://n8n.test/webhook/${k.toLowerCase()}`;

// ---------- pure ports ----------
test('parity: the Content Center helpers, ported unchanged', () => {
  assert.equal(redditCommunityForRecord(drec('RD')), 'ColdEmailsForLiving', 'the same hash of the record id picks the subreddit');
  assert.equal(redditCommunityForRecord('recAAAAAAAAAAAAAA1'), 'EmailOutreach');
  assert.equal(composeUrl('Reddit', 'x', drec('RD')), 'https://www.reddit.com/r/ColdEmailsForLiving/submit?selftext=true');
  assert.equal(composeUrl('X', 'Hi & bye', drec('X')), 'https://x.com/intent/post?text=Hi%20%26%20bye');
  assert.equal(composeUrl('LinkedIn', 'x', drec('L')), 'https://www.linkedin.com/feed/');
  assert.equal(composeUrl('Instagram', 'x', drec('I')), '');
  const html = newsletterHtml('Title <b>', 'First para\n\nSecond <script>');
  assert.match(html, /Title &lt;b&gt;/); assert.match(html, /Second &lt;script&gt;/); assert.match(html, /\{\{unsubscribe_url\}\}/);
  assert.equal(html.includes('<script>'), false, 'escaped text only');
  // Settings: an empty cell counts as 0 (Number(null)), a missing record keeps the default; the save clamps and fixes Alex Woung at 2 / 2 days.
  const { settings, ids } = ccSettingsOf([{ id: 'recSET0000000000R', fields: { [SF_CC.channel]: RAW, [SF_CC.videosPerWeek]: 4 } }]);
  assert.deepEqual(settings[RAW], { videosPerWeek: 4, clipsPerWeek: 0, autoScheduleThreshold: 0, reviewThreshold: 0, minimumSpacingDays: 0, minimumClipScore: 0 });
  assert.deepEqual(settings[MAIN], { videosPerWeek: 2, clipsPerWeek: 3, autoScheduleThreshold: 85, reviewThreshold: 75, minimumSpacingDays: 2, minimumClipScore: 85 });
  assert.deepEqual(ids, { [MAIN]: '', [RAW]: 'recSET0000000000R' });
  const cur = settings[MAIN];
  assert.deepEqual(clampSettings(MAIN, { videosPerWeek: 6, minimumSpacingDays: 9, reviewThreshold: 140, minimumClipScore: -5, clipsPerWeek: 0, autoScheduleThreshold: 1 }, cur),
    { videosPerWeek: 2, minimumSpacingDays: 2, reviewThreshold: 100, minimumClipScore: 0, clipsPerWeek: 1, autoScheduleThreshold: 85 });
  assert.deepEqual(clampSettings(RAW, { videosPerWeek: 9, minimumSpacingDays: 0, reviewThreshold: 70, minimumClipScore: 88, clipsPerWeek: 4 }, settings[RAW]),
    { videosPerWeek: 7, minimumSpacingDays: 1, reviewThreshold: 70, minimumClipScore: 88, clipsPerWeek: 4, autoScheduleThreshold: 0 });
  // The verified clip review snapshot (currentReview).
  const snap = { mode: 'current-render-v1', id: crec('1'), parentId: rec('A'), projectId: 'P1', originalClipId: 'c1', version: 2, status: 'Approved', final: { renderReady: true, reviewGeneration: 'g', clipId: 'c9', url: 'https://signed-ext.cdn.opus.pro/x.mp4' } };
  assert.equal(currentReview(crec('1'), JSON.stringify(snap), 'P1.c1', [rec('A')])?.status, 'Approved');
  assert.equal(currentReview(crec('1'), JSON.stringify({ ...snap, final: { ...snap.final, url: 'https://evil.example/x.mp4' } }), 'P1.c1', [rec('A')]), null);
  assert.equal(currentReview(crec('1'), JSON.stringify(snap), 'P1.c2', [rec('A')]), null, 'another original clip');
  assert.equal(currentReview(crec('1'), '{not json', 'P1.c1', [rec('A')]), null);
  // distributionCompletion: done only when every chosen channel has a published URL or a real schedule.
  const row = (id: string, platform: string, status: string, extra: Record<string, string> = {}) => ({ id, platform, outputType: 'x', title: 't', body: 'b', media: '', account: '', approval: 'Approved', status, scheduledAt: '', postUrl: '', parentIds: [rec('V')], queueReceipt: '', ...extra });
  const input = { id: rec('V'), finalAssetUrl: 'https://f.io/v', youtubeUrl: 'https://youtu.be/x', publishingStatus: 'Published', publishDate: '', requiredIds: [drec('1'), drec('2')], channels: ['Instagram', 'Reddit'], now: Date.parse('2026-11-28T12:00:00Z'),
    rows: [row(drec('1'), 'Instagram', 'Scheduled', { scheduledAt: '2026-12-01T16:00:00Z' }), row(drec('2'), 'Reddit', 'Published', { postUrl: 'https://www.reddit.com/r/x/comments/1' })] };
  const done = distributionCompletion(input);
  assert.deepEqual([done.complete, done.scheduled, done.published], [true, 1, 1]);
  assert.equal(completionDetail(done), '1 scheduled, 1 published. Individual publication statuses remain unchanged.');
  assert.equal(distributionCompletion({ ...input, publishingStatus: '' }).reason, 'Verify the long-form publication or schedule.');
  assert.equal(distributionCompletion({ ...input, rows: [input.rows[0], row(drec('2'), 'Reddit', 'Draft')] }).reason, 'Reddit queue verification is missing, expired or changed.');
  assert.equal(distributionCompletion({ ...input, channels: ['Instagram', 'Newsletter'] }).reason, 'A selected distribution channel has no output.');
});

test('parity: history shows rejected and older items; an idea with no channel is listed', async () => {
  const now = Date.parse('2026-11-28T15:00:00Z');
  const rows: Record<string, any> = {
    [rec('LIVE')]: { [CF.title]: 'Live', [CF.channel]: MAIN, [CF.ideaDecision]: 'Approved', [CF.recordingDate]: '2026-11-27' },
    [rec('REJ')]: { [CF.title]: 'Rejected one', [CF.channel]: MAIN, [CF.ideaDecision]: 'Rejected', [CF.recordingDate]: '2026-11-20' },
    [rec('OLD')]: { [CF.title]: 'Old one', [CF.channel]: RAW, [CF.ideaDecision]: 'Approved', [CF.recordingDate]: '2026-07-10' },
    [rec('NOCH')]: { [CF.title]: 'No channel idea', [CF.ideaDecision]: 'Needs Review' },
  };
  const at = { async list(table: string) { return table === CONTENT ? Object.entries(rows).map(([id, fields]) => ({ id, fields, createdTime: id === rec('OLD') ? '2026-07-01T12:00:00.000Z' : '2026-11-25T12:00:00.000Z' })) : []; } };
  const src = await readContentSource(at, null, now, async () => '');
  const plain = buildContent(src, 'appX', now);
  assert.deepEqual(plain.pipeline.rows.map((r) => r.id).sort(), [rec('LIVE'), rec('NOCH')].sort());
  assert.deepEqual(plain.needs.ideas.map((g) => [g.key, g.count]), [['main', 0], ['raw', 0], ['none', 1]], 'the no-channel idea is in Needs you');
  const hist = buildContent(src, 'appX', now, { history: true });
  assert.deepEqual(hist.pipeline.rows.map((r) => [r.id, r.archived, r.old]).sort(), [[rec('LIVE'), false, false], [rec('NOCH'), false, false], [rec('OLD'), false, true], [rec('REJ'), true, false]].sort());
  assert.equal(hist.counts.total, plain.counts.total, 'history does not change what needs you');
});

// ---------- the API ----------
let db: Db;
let server: http.Server;
let port = 0;
let webDir: string;
let tables: Record<string, Record<string, Record<string, unknown>>>;
let writes: [string, string, Record<string, unknown>][];
let creates: [string, Record<string, unknown>][];
let removes: [string, string][];
let fetches: { url: string; body: any }[];
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
  async create(t: string, f: Record<string, unknown>) { creates.push([t, f]); const id = `recNEWIDEA${String(creates.length).padStart(7, '0')}`; (tables[t] ??= {})[id] = { ...f }; return id; },
  async update(t: string, id: string, f: Record<string, unknown>) { writes.push([t, id, f]); Object.assign(tables[t][id], f); },
  async updateMany(t: string, rows: { id: string; fields: Record<string, unknown> }[]) { for (const r of rows) { writes.push([t, r.id, r.fields]); Object.assign(tables[t][r.id], r.fields); } },
  async remove(t: string, id: string) { removes.push([t, id]); delete tables[t][id]; },
};
const fakeFetch = (async (u: string, init?: RequestInit) => {
  fetches.push({ url: String(u), body: init?.body ? JSON.parse(String(init.body)) : null });
  return new Response('', { status: 500 });
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
  webDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hqparity-'));
  fs.writeFileSync(path.join(webDir, 'index.html'), '<!doctype html><title>Dulcy HQ</title>');
  if (skip) return;
  db = createPool(url!); await migrate(db);
  server = createServer(db, cfg(), { at: at as any, webDir, fetchImpl: fakeFetch });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', () => r()));
  port = (server.address() as AddressInfo).port;
});
after(async () => { if (!skip) { server.close(); await db.end(); } fs.rmSync(webDir, { recursive: true, force: true }); });
beforeEach(async () => {
  tables = {}; writes = []; creates = []; removes = []; fetches = []; _resetContentCache(); _resetHookCache();
  if (skip) return;
  await db.query('TRUNCATE hq_users, hq_sessions, hq_login_attempts, hq_content_log, hq_content_posts RESTART IDENTITY CASCADE');
  await upsertUser(db, 'alex@dulcy.io', 'owner', PW, 'Alex');
  await upsertUser(db, 'josh@dulcy.io', 'member', PW, 'Josh');
});

const SET_MAIN = 'recSETTINGS00MAIN', SET_RAW = 'recSETTINGS000RAW';
const approved = { [CF.ideaDecision]: 'Approved', [CF.script]: 'the script', [CF.stage]: 'Script' };
function fixtures() {
  tables[SETTINGS] = {
    [SET_MAIN]: { [SF_CC.channel]: MAIN, [SF_CC.enabled]: true, [SF_CC.videosPerWeek]: 2, [SF_CC.clipsPerWeek]: 3, [SF_CC.autoScheduleThreshold]: 85, [SF_CC.reviewThreshold]: 75, [SF_CC.minimumSpacingDays]: 2, [SF_CC.minimumClipScore]: 85 },
    [SET_RAW]: { [SF_CC.channel]: RAW, [SF_CC.enabled]: true, [SF_CC.videosPerWeek]: 5, [SF_CC.clipsPerWeek]: 3, [SF_CC.autoScheduleThreshold]: 80, [SF_CC.reviewThreshold]: 70, [SF_CC.minimumSpacingDays]: 1, [SF_CC.minimumClipScore]: 72 },
  };
  tables[CONTENT] = {
    [rec('IDEA')]: { [CF.title]: 'Idea waiting', [CF.channel]: MAIN, [CF.ideaDecision]: 'Needs Review' },
    [rec('APPR')]: { [CF.title]: 'Approved video', [CF.channel]: MAIN, ...approved, [CF.recordingDate]: '2026-12-04', [XF.publishDate]: '2026-12-08' },
    [rec('YT')]: { [CF.title]: 'Ready for YouTube', [CF.channel]: RAW, ...approved, [CF.description]: 'One. Two. Three. Four.', [XF.finalAssetUrl]: 'https://f.io/v', [XF.finalThumbnailUrl]: 'https://f.io/t', [XF.thumbnailStatus]: 'Approved', [PF.previousThumbnailUrl]: 'https://f.io/t-old' },
    [rec('CLIPS')]: { [CF.title]: 'Clips made', [CF.channel]: RAW, ...approved, [XF.finalAssetUrl]: 'https://f.io/v', [XF.finalAssetId]: 'A1', [XF.shortProjectId]: 'P1', [XF.shortSourceAssetId]: 'A1', [XF.youtubeUrl]: 'https://youtu.be/KYb_fCs1klg', [XF.clips]: [crec('1'), crec('2')], [XF.distributionChannels]: ['Reddit'], [XF.distributionRecords]: [drec('RD'), drec('NL')] },
  };
  const snap = { mode: 'current-render-v1', id: crec('1'), parentId: rec('CLIPS'), projectId: 'P1', originalClipId: 'c1', version: 3, status: 'Needs Review', final: { renderReady: true, reviewGeneration: 'g', clipId: 'c7', url: 'https://signed-ext.cdn.opus.pro/c7.mp4', transcript: 'final words' } };
  tables[CLIPS] = {
    [crec('1')]: { [KL.name]: 'Best clip', [KL.score]: 91, [KL.status]: 'Needs Review', [KL.parent]: [rec('CLIPS')], [KL.opusId]: 'P1.c1', [KL.media]: 'https://cdn.opus.pro/imported.mp4', [PF.clipSnapshot]: JSON.stringify(snap), [KL.notes]: 'Sienna QA: passed' },
    [crec('2')]: { [KL.name]: 'Second', [KL.score]: 70, [KL.status]: 'Proposed', [KL.parent]: [rec('CLIPS')], [KL.opusId]: 'P1.c2', [PF.clipTranscript]: 'imported words' },
  };
  tables[DISTRIBUTION] = {
    [drec('RD')]: { [DF.parent]: [rec('CLIPS')], [DF.platform]: 'Reddit', [DF.outputType]: 'Discussion Draft', [DF.title]: 'Reddit post', [DF.body]: 'Body', [DF.approval]: 'Needs Review', [DF.publishing]: 'Draft' },
    [drec('NL')]: { [DF.parent]: [rec('CLIPS')], [DF.platform]: 'Newsletter', [DF.outputType]: 'Dulcy Newsletter', [DF.title]: 'Letter', [DF.body]: 'Hi\n\nThere', [DF.approval]: 'Needs Review', [DF.publishing]: 'Draft' },
  };
}
const nothingSent = () => assert.deepEqual(fetches, [], 'no webhook is fired');

test('parity API: owner only and same-origin on every new route; a refused call writes nothing', { skip }, async () => {
  fixtures();
  const josh = await login('josh@dulcy.io');
  const routes: [string, unknown][] = [['/hq/api/content/settings', undefined], ['/hq/api/content/settings', { settings: {} }], ['/hq/api/content/ideas', { title: 'x' }],
    [`/hq/api/content/items/${rec('APPR')}/channel`, { channel: RAW }], [`/hq/api/content/items/${rec('APPR')}/dates`, { kind: 'recording', date: '2026-12-11' }],
    [`/hq/api/content/items/${rec('YT')}/youtube`, { title: 'T', description: 'D' }], [`/hq/api/content/items/${rec('APPR')}/delete`, { confirm: true }], ['/hq/api/content?history=1', undefined]];
  for (const [p, body] of routes) {
    assert.equal((await call(p, { body })).status, 401, `${p} needs a session`);
    assert.equal((await call(p, { cookie: josh, body })).status, 403, `${p} is the owner's`);
  }
  const alex = await login('alex@dulcy.io');
  for (const [p, body] of routes.filter(([, b]) => b !== undefined)) {
    assert.equal((await call(p, { cookie: alex, body, origin: 'https://evil.example' })).status, 403, `${p}: cross-site refused`);
    assert.equal((await call(p, { cookie: alex, body, origin: null })).status, 403, `${p}: no Origin refused`);
  }
  assert.deepEqual([writes, creates, removes], [[], [], []]); nothingSent();
  assert.equal((await db.query('SELECT count(*)::int AS n FROM hq_content_log')).rows[0].n, 0);
});

test('parity API: settings panel — read as the Content Center loads it; save writes both records, its fields and clamps', { skip }, async () => {
  fixtures();
  const alex = await login('alex@dulcy.io');
  const g = await call('/hq/api/content/settings', { cookie: alex });
  assert.equal(g.status, 200, g.text);
  assert.deepEqual(g.body.channels.map((c: any) => [c.channel, c.found, c.fixed, c.videosPerWeek, c.minimumClipScore]), [[MAIN, true, true, 2, 85], [RAW, true, false, 5, 72]]);
  const r = await call('/hq/api/content/settings', { cookie: alex, body: { settings: { [MAIN]: { videosPerWeek: 5, clipsPerWeek: 4, reviewThreshold: 80, minimumClipScore: 90, minimumSpacingDays: 5 }, [RAW]: { videosPerWeek: 6, clipsPerWeek: 9, reviewThreshold: 65, minimumClipScore: 80, minimumSpacingDays: 1 } } } });
  assert.equal(r.status, 200, r.text);
  assert.deepEqual(writes, [
    [SETTINGS, SET_MAIN, { [SF_CC.enabled]: true, [SF_CC.videosPerWeek]: 2, [SF_CC.clipsPerWeek]: 4, [SF_CC.autoScheduleThreshold]: 85, [SF_CC.reviewThreshold]: 80, [SF_CC.minimumSpacingDays]: 2, [SF_CC.minimumClipScore]: 90 }],
    [SETTINGS, SET_RAW, { [SF_CC.enabled]: true, [SF_CC.videosPerWeek]: 6, [SF_CC.clipsPerWeek]: 7, [SF_CC.autoScheduleThreshold]: 80, [SF_CC.reviewThreshold]: 65, [SF_CC.minimumSpacingDays]: 1, [SF_CC.minimumClipScore]: 80 }],
  ], 'one write of both records (Alex Woung stays 2 a week, 2 days apart; clips per week at most 7; Auto Schedule Score unchanged)');
  nothingSent();
  const log = (await db.query(`SELECT action, changes FROM hq_content_log`)).rows;
  assert.equal(log[0].action, 'settings_save');
  assert.ok(log[0].changes.some((c: any) => c.field === `${RAW} · videosPerWeek` && c.from === 5 && c.to === 6));
  // A channel with no settings record: the whole save is refused, nothing written.
  writes = []; delete tables[SETTINGS][SET_RAW];
  const m = await call('/hq/api/content/settings', { cookie: alex, body: { settings: {} } });
  assert.equal(m.status, 409); assert.match(m.body.error, /Missing automation settings record for Alex Woung Raw/);
  assert.deepEqual(writes, []);
});

test('parity API: + Add content idea writes the Content Center\'s exact fields', { skip }, async () => {
  fixtures();
  const alex = await login('alex@dulcy.io');
  const r = await call('/hq/api/content/ideas', { cookie: alex, body: { title: '  Cold email in 2027  ', description: ' the hook ', channel: RAW } });
  assert.equal(r.status, 200, r.text);
  assert.match(r.body.id, /^rec[A-Za-z0-9]{14}$/);
  assert.deepEqual(creates, [[CONTENT, { [CF.title]: 'Cold email in 2027', [CF.description]: 'the hook', [CF.ideaDecision]: 'Needs Review', [CF.source]: 'Manual Idea', [CF.channel]: RAW }]]);
  creates = [];
  assert.equal((await call('/hq/api/content/ideas', { cookie: alex, body: { title: 'Only a title' } })).status, 200);
  assert.deepEqual(creates, [[CONTENT, { [CF.title]: 'Only a title', [CF.ideaDecision]: 'Needs Review', [CF.source]: 'Manual Idea', [CF.channel]: MAIN }]], 'no notes: no Description; the default channel');
  creates = [];
  assert.equal((await call('/hq/api/content/ideas', { cookie: alex, body: { title: '   ' } })).status, 400);
  assert.equal((await call('/hq/api/content/ideas', { cookie: alex, body: { title: 'x', channel: 'Main' } })).status, 400);
  assert.deepEqual(creates, []); nothingSent();
  // The new idea shows in Needs you right away (the cache is cleared).
  const v = await call('/hq/api/content', { cookie: alex });
  assert.ok(v.body.needs.ideas.find((g: any) => g.key === 'main').items.some((i: any) => i.title === 'Only a title'));
});

test('parity API: "Content for", the dates (only once approved), the YouTube boxes', { skip }, async () => {
  fixtures();
  const alex = await login('alex@dulcy.io');
  const post = (id: string, what: string, body: unknown) => call(`/hq/api/content/items/${id}/${what}`, { cookie: alex, body });
  let r = await post(rec('IDEA'), 'channel', { channel: RAW });
  assert.equal(r.status, 200, r.text);
  assert.deepEqual(writes, [[CONTENT, rec('IDEA'), { [CF.channel]: RAW }]], 'an idea can get its channel before approval');
  writes = [];
  assert.equal((await post(rec('IDEA'), 'channel', { channel: 'Raw' })).status, 400);
  assert.equal((await post(rec('IDEA'), 'dates', { kind: 'recording', date: '2026-12-11' })).status, 409, 'Approve this idea before assigning dates');
  assert.equal((await post(rec('APPR'), 'dates', { kind: 'recording', date: '12/11' })).status, 400);
  assert.equal((await post(rec('APPR'), 'dates', { kind: 'recording', date: '2026-02-30' })).status, 400);
  assert.deepEqual(writes, []);
  assert.equal((await post(rec('APPR'), 'dates', { kind: 'recording', date: '2026-12-11' })).status, 200);
  assert.equal((await post(rec('APPR'), 'dates', { kind: 'publish', date: '' })).status, 200);
  assert.deepEqual(writes, [[CONTENT, rec('APPR'), { [CF.recordingDate]: '2026-12-11' }], [CONTENT, rec('APPR'), { [XF.publishDate]: null }]], 'one field each; empty clears it');
  writes = [];
  assert.equal((await post(rec('YT'), 'youtube', { title: 'T', description: '' })).status, 400, 'title and description are both needed');
  r = await post(rec('YT'), 'youtube', { title: ' My title ', description: ' Desc ', chapters: '  ' });
  assert.equal(r.status, 200, r.text);
  assert.deepEqual(writes, [[CONTENT, rec('YT'), { [CF.ytTitle]: 'My title', [XF.youtubeDescription]: 'Desc', [AF.youtubeChapters]: null }]], 'Save YouTube details: chapters empty = cleared');
  writes = [];
  assert.equal((await post(rec('CLIPS'), 'youtube', { title: 'T', description: 'D' })).status, 409, 'already on YouTube');
  assert.deepEqual(writes, []); nothingSent();
  const log = (await db.query(`SELECT action FROM hq_content_log ORDER BY id`)).rows.map((x) => x.action);
  assert.deepEqual(log, ['set_channel', 'set_recording_date', 'set_publish_date', 'youtube_save']);
});

test('parity API: "Generate missing details" falls back to the template with what is typed; the brief uses the channel\'s score from Settings', { skip }, async () => {
  fixtures();
  const alex = await login('alex@dulcy.io');
  const r = await call(`/hq/api/content/items/${rec('YT')}/run`, { cookie: alex, body: { action: 'youtubeDetails', title: 'Typed title', description: '', chapters: '0:00 Intro' } });
  assert.equal(r.status, 200, r.text);
  assert.deepEqual(fetches, [{ url: HOOK('YOUTUBE'), body: { recordId: rec('YT'), action: 'Prepare YouTube Details' } }], 'the n8n flow first (it answers 500 here)');
  assert.deepEqual(writes, [[CONTENT, rec('YT'), { [CF.ytTitle]: 'Typed title', [XF.youtubeDescription]: buildYouTubeDescription(RAW, 'Typed title', 'One. Two. Three. Four.', '0:00 Intro'), [AF.youtubeChapters]: '0:00 Intro' }]]);
  writes = []; fetches = [];
  const b = await call(`/hq/api/content/items/${rec('CLIPS')}/run`, { cookie: alex, body: { action: 'postsBrief', channels: ['Reddit', 'Newsletter'], count: 5, minScore: 10 } });
  assert.equal(b.status, 200, b.text);
  assert.deepEqual(writes, [[CONTENT, rec('CLIPS'), { [AF.requestedClipCount]: 5, [AF.minimumClipScore]: 72, [XF.distributionChannels]: ['Reddit', 'Newsletter'], [XF.action]: 'Generate Distribution Pack' }]], 'Alex Woung Raw\'s Minimum Clip Score (72), not a typed one');
  nothingSent();
});

test('parity API: the video page shows the Content Center panel (clips shortlist, OpusClip link, previous thumbnail, Reddit community, composer, newsletter HTML)', { skip }, async () => {
  fixtures();
  const alex = await login('alex@dulcy.io');
  const d = await call(`/hq/api/content/items/${rec('CLIPS')}`, { cookie: alex });
  assert.equal(d.status, 200, d.text);
  assert.equal(d.body.opusUrl, 'https://clip.opus.pro/clip/P1');
  assert.deepEqual(d.body.clips.map((c: any) => [c.id, c.score, c.review, c.verifiedClipId, c.version, c.preview, c.transcript]), [
    [crec('1'), 91, 'Needs Review', 'c7', 3, 'https://signed-ext.cdn.opus.pro/c7.mp4', 'final words'],
    [crec('2'), 70, 'Not yet verified', '', null, '', 'imported words'],
  ], 'best score first; the verified copy over the imported media');
  assert.deepEqual([d.body.channel, d.body.brief.minScore, d.body.settings], [RAW, 72, { clipsPerWeek: 3, minimumClipScore: 72 }]);
  assert.deepEqual(d.body.completion, { complete: false, detail: 'Verify the long-form publication or schedule.' }, 'the Content Center\'s completion check, from this video\'s drafts');
  const drafts = d.body.distribution.platforms.flatMap((p: any) => p.drafts);
  const rd = drafts.find((x: any) => x.id === drec('RD'));
  assert.deepEqual([rd.community, rd.composeUrl, rd.html], ['ColdEmailsForLiving', 'https://www.reddit.com/r/ColdEmailsForLiving/submit?selftext=true', '']);
  assert.equal(drafts.find((x: any) => x.id === drec('NL')).html, newsletterHtml('Letter', 'Hi\n\nThere'));
  const y = await call(`/hq/api/content/items/${rec('YT')}`, { cookie: alex });
  assert.equal(y.body.thumbnail.previousUrl, 'https://f.io/t-old');
  assert.deepEqual([writes, creates, removes], [[], [], []]); nothingSent();
});

test('parity API: the trash button deletes only this record, only after confirm; what was deleted stays in the log', { skip }, async () => {
  fixtures();
  const alex = await login('alex@dulcy.io');
  assert.equal((await call(`/hq/api/content/items/${rec('APPR')}/delete`, { cookie: alex, body: {} })).status, 400, 'confirm first');
  assert.equal((await call(`/hq/api/content/items/${rec('APPR')}/delete`, { cookie: alex, body: { confirm: 'yes' } })).status, 400);
  assert.deepEqual(removes, []);
  const r = await call(`/hq/api/content/items/${rec('APPR')}/delete`, { cookie: alex, body: { confirm: true } });
  assert.equal(r.status, 200, r.text);
  assert.match(r.body.message, /External videos, clips and published posts were not deleted/);
  assert.deepEqual(removes, [[CONTENT, rec('APPR')]], 'one record, the Content Channels table only');
  assert.deepEqual([writes, creates], [[], []]); nothingSent();
  const log = (await db.query(`SELECT action, title, changes FROM hq_content_log`)).rows;
  assert.deepEqual([log[0].action, log[0].title, log[0].changes[0].from], ['delete', 'Approved video', 'Approved video · Alex Woung · Approved · record 2026-12-04 · publish 2026-12-08']);
  assert.equal((await call(`/hq/api/content/items/${rec('APPR')}/delete`, { cookie: alex, body: { confirm: true } })).status, 404);
});

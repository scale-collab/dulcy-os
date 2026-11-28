// HQ Content, final clips + Gamma box + resource document (2026-11-28). The final-clip review writes the
// Content Center's exact Review Intent JSON and calls its webhook with its exact body; HQ reads back the
// Airtable author and only wakes n8n when the n8n owner check can pass (Alex's login, or HQ's signature
// once the n8n change is live). The n8n change itself is checked here against the repo's copy of the
// workflow (applied in memory only). Airtable and fetch are fakes: no webhook is fired, nothing is posted.
import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import type { AddressInfo } from 'node:net';
import { createPool, migrate, type Db } from '../src/db/pool.js';
import { loadConfig, type Config } from '../src/config.js';
import { createServer } from '../src/http.js';
import { upsertUser } from '../src/hq/auth.js';
import { CF, CONTENT } from '../src/agents/sienna.js';
import { CLIPS, KL, XF, _resetContentCache } from '../src/hq/content.js';
import { HOOKS, _resetHookCache } from '../src/hq/contentActions.js';
import { N8N_REVIEW_PATCH, OWNER_IDENTITY, RF, _resetReviewAuthor, buildReviewIntent, currentReview, notesWithGamma, resourceDoc, reviewSig, shortTopic } from '../src/hq/contentReview.js';
import { validateN8nPatch } from '../src/agents/rileyN8n.js';

const url = process.env.TEST_DATABASE_URL;
const skip = !url ? 'TEST_DATABASE_URL not set' : false;
const PW = 'correct horse battery staple';
const VIDEO = 'recVIDEO000000001', OTHER_VIDEO = 'recVIDEO000000002';
const CLIP = 'recCLIP0000000001', FRESH = 'recCLIP0000000002', LOOSE = 'recCLIP0000000003';
const HOOK = (k: string) => `https://n8n.test/webhook/${k.toLowerCase()}`;
const SECRET = 'r'.repeat(40);
const ALEX = { id: OWNER_IDENTITY.id, email: OWNER_IDENTITY.email, name: 'Alexander Woung' };
const ENGINE_USER = { id: 'usrENGINE00000000', email: 'scale@dulcy.io', name: 'Engine' };
/** The keys and their order in the Content Center's intent (source.tsx) = n8n's exact key list (Parse Current Review Context). */
const CC_KEYS = ['schemaVersion', 'action', 'recordId', 'parentId', 'projectId', 'originalClipId', 'finalClipId', 'expectedVersion', 'reviewGeneration', 'nonce'];
const snapshot = (over: Record<string, unknown> = {}) => JSON.stringify({ id: CLIP, parentId: VIDEO, projectId: 'P3111218hfRT', originalClipId: 'kFwpiOJgGe', mode: 'current-render-v1', version: 1, status: 'Needs Review',
  final: { clipId: 'kFwpiOJgGe', reviewGeneration: '191bce01-7a85-45fb-944c-4fddac427304', renderReady: true, url: 'https://signed-ext.cdn.opus.pro/x/P3111218hfRT/c.kFwpiOJgGe/v.mp4', transcript: 'hi' }, ...over });

// ---------- the n8n workflow (repo copy, identical to live except the redacted webhook path, checked 2026-11-28) ----------
const here = path.dirname(fileURLToPath(import.meta.url));
const WF = JSON.parse(fs.readFileSync(path.resolve(here, '../../../automations/n8n-live-2026-11-17/workflows/content-os-current-clip-review-and-preview--1IWw0WOC8gwgWvnVZbeKf.json'), 'utf8'));
const nodeCode = (name: string) => String(WF.nodes.find((n: any) => n.name === name).parameters.jsCode);
const patched = (name: string) => N8N_REVIEW_PATCH.changes.filter((c) => c.node === name).reduce((code, c) => code.replace(c.find, () => c.replace), nodeCode(name));
/** Run an n8n Code node's text with the $-helpers it uses. */
function runNode(code: string, x: { nodes: Record<string, any>; input: any; vars?: Record<string, string> }) {
  const $ = (n: string) => ({ first: () => ({ json: x.nodes[n] }) });
  const fn = new Function('$', '$input', '$vars', '$env', '$execution', 'require', 'Buffer', code);
  return fn($, { first: () => ({ json: x.input }) }, x.vars ?? {}, {}, { id: '1' }, (m: string) => (m === 'crypto' ? crypto : undefined), Buffer);
}

test('final clips: the intent is the Content Center\'s, key for key and in order (n8n\'s exact key list)', () => {
  assert.match(nodeCode('Parse Current Review Context'), new RegExp(`const keys=\\[${CC_KEYS.map((k) => `'${k}'`).join(',')}\\]`), 'n8n checks exactly these keys');
  const clip = { id: CLIP, snapshot: snapshot(), opusId: 'P3111218hfRT.kFwpiOJgGe', parents: [VIDEO] };
  const nonce = '0d7d70bd-d5be-4750-8c84-e0a8c11ce09c';
  const a = buildReviewIntent(clip, 'approve-current', undefined, nonce);
  assert.ok('intent' in a);
  // A real Content Center approval (Content Clips rec6vPj0yu1AHC9tA, 2026-11-12), same values here.
  assert.equal(JSON.stringify(a.intent), `{"schemaVersion":1,"action":"approve-current","recordId":"${CLIP}","parentId":"${VIDEO}","projectId":"P3111218hfRT","originalClipId":"kFwpiOJgGe","finalClipId":"kFwpiOJgGe","expectedVersion":1,"reviewGeneration":"191bce01-7a85-45fb-944c-4fddac427304","nonce":"${nonce}"}`);
  assert.deepEqual(Object.keys(a.intent), CC_KEYS);
  const r = buildReviewIntent({ ...clip, snapshot: '' }, 'refresh-current', undefined, nonce);
  assert.ok('intent' in r);
  assert.deepEqual([r.intent.expectedVersion, r.intent.reviewGeneration, r.intent.finalClipId], [0, null, 'kFwpiOJgGe'], 'first refresh: version 0, no generation, the imported clip');
  assert.deepEqual(buildReviewIntent({ ...clip, snapshot: '' }, 'approve-current', undefined, nonce), { error: 'Refresh and review this selected copy before deciding.' });
  assert.deepEqual(buildReviewIntent(clip, 'approve-current', 'OtherCopy1', nonce), { error: 'Refresh and review this selected copy before deciding.' });
  assert.deepEqual(buildReviewIntent({ ...clip, snapshot: '{"mode":"x"}' }, 'refresh-current', undefined, nonce), { error: 'Review snapshot is inconsistent. Reconcile it before requesting changes.' });
  assert.deepEqual(buildReviewIntent({ ...clip, parents: [] }, 'refresh-current', undefined, nonce), { error: 'Choose the exact final clip ID within this original project.' });
  assert.equal(currentReview({ ...clip, snapshot: snapshot({ final: { clipId: 'kFwpiOJgGe', reviewGeneration: 'g', renderReady: true, url: 'https://evil.example/x.mp4' } }) }), null, 'only OpusClip\'s signed CDN');
});

test('final clips: the n8n change (applied in memory to the repo copy) keeps the owner check and accepts only HQ\'s valid signature', () => {
  for (const c of N8N_REVIEW_PATCH.changes) assert.equal(nodeCode(c.node).split(c.find).length - 1, 1, `${c.node}: the text to replace occurs exactly once`);
  // The engine refuses it on purpose (it touches the approval check and names the shared key): Alex applies it by hand.
  assert.match(String((validateN8nPatch(N8N_REVIEW_PATCH) as any).error), /refused/);
  const built: any = buildReviewIntent({ id: CLIP, snapshot: snapshot(), opusId: 'P3111218hfRT.kFwpiOJgGe', parents: [VIDEO] }, 'approve-current', undefined, crypto.randomUUID());
  const raw = JSON.stringify(built.intent);
  const record = (author: unknown) => ({ id: CLIP, fields: { 'Review Intent JSON': raw, 'Review Intent Author': author, 'Parent Content': [VIDEO], 'OpusClip Clip ID': 'P3111218hfRT.kFwpiOJgGe' } });
  const parent = { id: VIDEO, fields: { 'OpusClip Short Project ID': 'P3111218hfRT' } };
  const wake = (body: unknown) => runNode(patched('Validate Wake'), { nodes: {}, input: { body } })[0].json;
  assert.deepEqual(wake({ recordId: CLIP }), { recordId: CLIP, hqSig: null }, 'the Content Center\'s body: unchanged');
  const sig = reviewSig(SECRET, raw);
  assert.deepEqual(wake({ recordId: CLIP, source: 'hq', hqSig: sig }), { recordId: CLIP, hqSig: sig });
  assert.equal(wake({ recordId: CLIP, hqSig: sig }).hqSig, null, 'no source:"hq", no signature');
  const parse = (author: unknown, hqSig: string | null, vars: Record<string, string> = { CONTENT_REVIEW_SECRET: SECRET }) =>
    runNode(patched('Parse Current Review Context'), { nodes: { 'Validate Wake': { recordId: CLIP, hqSig }, 'Read Current Review Request': record(author) }, input: parent, vars })[0].json;
  assert.equal(parse(ALEX, null).author, ALEX, 'Alex in Airtable: as before');
  assert.deepEqual(parse(ENGINE_USER, sig).author, OWNER_IDENTITY, 'HQ-signed: counts as Alex');
  assert.throws(() => parse(ENGINE_USER, null), /Owner-authored intent required/);
  assert.throws(() => parse(ENGINE_USER, reviewSig('w'.repeat(40), raw)), /Owner-authored intent required/, 'wrong key');
  assert.throws(() => parse(ENGINE_USER, reviewSig(SECRET, raw.replace('approve', 'reject'))), /Owner-authored intent required/, 'signature of another intent');
  assert.throws(() => parse(ENGINE_USER, sig, {}), /Owner-authored intent required/, 'no key set in n8n');
  // The original (unpatched) node refuses the HQ-signed one: the change is needed.
  assert.throws(() => runNode(nodeCode('Parse Current Review Context'), { nodes: { 'Read Current Review Request': record(ENGINE_USER) }, input: parent })[0].json, /Owner-authored intent required/);
  // Read Current Parent Reference: the same rule.
  const ref = (author: unknown, hqSig: string | null) => runNode(patched('Read Current Parent Reference'), { nodes: { 'Validate Wake': { recordId: CLIP, hqSig } }, input: record(author), vars: { CONTENT_REVIEW_SECRET: SECRET } })[0].json;
  assert.deepEqual(ref(ENGINE_USER, sig), { parentId: VIDEO });
  assert.throws(() => ref(ENGINE_USER, null), /Owner request required/);
  assert.match(patched('Build Current Review Commit'), /hqOk\(f\['Review Intent JSON'\]\)\?ownerIdentity/);
});

test('gamma link and resource document (pure)', () => {
  assert.equal(notesWithGamma('**Gamma outline**\nSlide 1: x', 'https://gamma.app/docs/new'), '**Gamma outline**\nSlide 1: x\n\n**Gamma link:** https://gamma.app/docs/new');
  assert.equal(notesWithGamma('Old: https://gamma.app/docs/old-1 here', 'https://gamma.app/docs/new'), 'Old: https://gamma.app/docs/new here', 'replaced in place');
  assert.equal(notesWithGamma('', 'https://gamma.app/docs/new'), '**Gamma link:** https://gamma.app/docs/new');
  assert.equal(shortTopic('When a client demands “pay only on orders”: pricing guardrails for outbound agencies'), 'When a client demands pay only on orders');
  const outline = 'Note: Raw channel has no split-screen.\n\nSlide 1: Pay-only-on-orders in long sales cycles. Who carries the risk: cost, control, timing, attribution.\n\nSlide 2: Why order-only breaks. Monthly costs vs months-later orders. No control after the meeting. No CRM visibility.\n\nSlide 3: Floor plus performance. Minimum retainer covers labor and infrastructure. Tiered fee: qualified meeting, then sales-accepted.\n\nSlide 4: Sample SOW language (with placeholders). Not legal advice.\n\nSlide 5: Red flags.\n- No qualified-meeting definition\n- No visibility\n- No real sales person\n- Unknown deal size\n- Risk dumping\n- Unknown cycle\n- Burned before';
  const doc = resourceDoc({ id: VIDEO, title: 'Pay only on orders: guardrails', channel: 'Alex Woung Raw', youtubeUrl: 'https://youtu.be/KYb_fCs1klg' }, outline)!;
  assert.deepEqual([doc.cover.headline, doc.cover.subtitle, doc.cover.pill, doc.topic], ['Pay-only-on-orders in long sales cycles.', 'Who carries the risk: cost, control, timing, attribution.', '4-part guide', 'Pay only on orders']);
  assert.deepEqual(doc.sections.map((x) => [x.n, x.headline, x.layout, x.points.length]), [[1, 'Why order-only breaks.', 'cards', 3], [2, 'Floor plus performance.', 'cards', 2], [3, 'Sample SOW language (with placeholders).', 'callout', 1], [4, 'Red flags.', 'list', 7]]);
  assert.deepEqual(doc.sections[1].points[1], { title: 'Tiered fee', body: 'qualified meeting, then sales-accepted.' });
  assert.equal(doc.text.includes('Note: Raw channel'), false, 'Sienna\'s note to Alex stays out');
  assert.match(doc.text, /^Pay-only-on-orders in long sales cycles\.\nWho carries the risk[\s\S]*\n1\. Why order-only breaks\.\n- Monthly costs vs months-later orders\.[\s\S]*https:\/\/dulcy\.io\nWatch the video: https:\/\/youtu\.be\/KYb_fCs1klg$/);
  assert.equal(resourceDoc({ id: VIDEO, title: 'T', channel: '', youtubeUrl: '' }, 'Just a note, no slides'), null);
  const numbered = resourceDoc({ id: VIDEO, title: 'T', channel: '', youtubeUrl: '' }, '1. The problem\n2. The 3 fixes\n- One\n- Two')!;
  assert.deepEqual([numbered.cover.headline, numbered.sections[0].headline, numbered.sections[0].points.map((p) => p.body)], ['The problem', 'The 3 fixes', ['One', 'Two']]);
});

// ---------- the API ----------
let db: Db;
let server: http.Server;
let port = 0;
let webDir: string;
let config: Config;
let tables: Record<string, Record<string, Record<string, unknown>>>;
let writes: [string, string, Record<string, unknown>][];
let fetches: { url: string; body: any }[];
let tokenUser: Record<string, string>;
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
  async create() { throw new Error('never creates records'); },
  // Airtable stamps the token's user on the last-modified-by field of Review Intent JSON.
  async update(t: string, id: string, f: Record<string, unknown>) { writes.push([t, id, f]); Object.assign(tables[t][id], f, RF.intent in f ? { [RF.author]: { ...tokenUser } } : {}); },
};
const fakeFetch = (async (u: string, init?: RequestInit) => {
  fetches.push({ url: String(u), body: init?.body ? JSON.parse(String(init.body)) : null });
  return new Response(JSON.stringify({ accepted: true }), { status: 200 });
}) as unknown as typeof fetch;
const HOOK_ENV = Object.fromEntries(Object.values(HOOKS).map((h) => [`CONTENT_HOOK_${h.env}`, HOOK(h.env)]));
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
  webDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hqreview-'));
  fs.writeFileSync(path.join(webDir, 'index.html'), '<!doctype html><title>Dulcy HQ</title>');
  if (skip) return;
  db = createPool(url!); await migrate(db);
  config = { ...loadConfig({ ENGINE_SECRET: 'x'.repeat(40), DATABASE_URL: url!, HQ_SESSION_SECRET: 's'.repeat(40), HQ_HOST: 'hq.test.local', ...HOOK_ENV } as NodeJS.ProcessEnv), airtableApiKey: undefined, anthropicApiKey: undefined };
  server = createServer(db, config, { at: at as any, webDir, fetchImpl: fakeFetch });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', () => r()));
  port = (server.address() as AddressInfo).port;
});
after(async () => { if (!skip) { server.close(); await db.end(); } fs.rmSync(webDir, { recursive: true, force: true }); });
beforeEach(async () => {
  writes = []; fetches = []; tokenUser = { ...ALEX }; _resetContentCache(); _resetHookCache(); _resetReviewAuthor();
  tables = {
    [CONTENT]: {
      [VIDEO]: { [CF.title]: 'Pay only on orders: guardrails', [CF.channel]: 'Alex Woung', [CF.ideaDecision]: 'Approved', [CF.script]: 'x', [XF.finalAssetUrl]: 'https://f.io/final', [XF.clips]: [CLIP, FRESH, LOOSE],
        [CF.notes]: '**Gamma outline**\nSlide 1: The cover line. More.\nSlide 2: Step two. A point.' },
      [OTHER_VIDEO]: { [CF.title]: 'No outline', [CF.channel]: 'Alex Woung', [CF.ideaDecision]: 'Approved', [CF.notes]: 'Plain notes' },
    },
    [CLIPS]: {
      [CLIP]: { [KL.name]: 'Clip A', [KL.status]: 'Needs Review', [KL.notes]: 'Sienna QA: passed 17/17', [KL.opusId]: 'P3111218hfRT.kFwpiOJgGe', [KL.parent]: [VIDEO], [RF.snapshot]: snapshot() },
      [FRESH]: { [KL.name]: 'Clip B', [KL.status]: 'Needs Review', [KL.opusId]: 'P3111218hfRT.abcDEF1234', [KL.parent]: [VIDEO] },
      [LOOSE]: { [KL.name]: 'Someone else\'s', [KL.status]: 'Needs Review', [KL.opusId]: 'P1.x', [KL.parent]: [OTHER_VIDEO] },
    },
  };
  if (skip) return;
  config.contentReviewSecret = '';
  await db.query('TRUNCATE hq_users, hq_sessions, hq_login_attempts, hq_content_log, hq_agent_tasks RESTART IDENTITY CASCADE');
  await upsertUser(db, 'alex@dulcy.io', 'owner', PW, 'Alex');
  await upsertUser(db, 'josh@dulcy.io', 'member', PW, 'Josh');
});
const review = (cookie: string, clip: string, body: Record<string, unknown>) => call(`/hq/api/content/clips/${clip}/review`, { cookie, body });

test('final clips API: owner only and same-origin on every new route; nothing written or sent', { skip }, async () => {
  const josh = await login('josh@dulcy.io');
  const routes: [string, unknown][] = [[`/hq/api/content/clips/${CLIP}/review`, { action: 'approve' }], [`/hq/api/content/items/${VIDEO}/video-review`, { verdict: 'approve' }],
    [`/hq/api/content/items/${VIDEO}/gamma`, { url: 'https://gamma.app/docs/x' }], [`/hq/api/content/items/${VIDEO}/resource`, undefined]];
  for (const [p, body] of routes) {
    assert.equal((await call(p, { body })).status, 401, `${p} needs a session`);
    assert.equal((await call(p, { cookie: josh, body })).status, 403, `${p} is the owner's`);
  }
  const alex = await login('alex@dulcy.io');
  assert.equal((await call(`/hq/api/content/clips/${CLIP}/review`, { cookie: alex, body: { action: 'approve' }, origin: 'https://evil.example' })).status, 403, 'cross-site refused');
  assert.equal((await call(`/hq/api/content/clips/${CLIP}/review`, { cookie: alex, body: { action: 'approve' }, origin: null })).status, 403, 'no Origin refused');
  assert.equal((await review(alex, CLIP, { action: 'publish' })).status, 400);
  assert.deepEqual([writes, fetches], [[], []]);
});

test('final clips API: Alex\'s token — the Content Center\'s exact write and webhook body; the page lists the video\'s clips', { skip }, async () => {
  const alex = await login('alex@dulcy.io');
  const page = await call(`/hq/api/content/items/${VIDEO}`, { cookie: alex });
  assert.equal(page.status, 200, page.text);
  assert.deepEqual(page.body.review.clips.map((c: any) => [c.id, c.canDecide, c.finalClipId, c.verified?.version ?? null]), [[CLIP, true, 'kFwpiOJgGe', 1], [FRESH, false, 'abcDEF1234', null]], 'only this video\'s clips');
  assert.deepEqual([page.body.review.path, page.body.review.video.finalUrl, page.body.gamma], ['unknown', 'https://f.io/final', { url: '', outline: true }]);
  const r = await review(alex, CLIP, { action: 'approve' });
  assert.equal(r.status, 200, r.text);
  assert.equal(writes.length, 1);
  const [table, id, fields] = writes[0];
  assert.deepEqual([table, id, Object.keys(fields)], [CLIPS, CLIP, [RF.intent]], 'one field: Review Intent JSON');
  const intent = JSON.parse(String(fields[RF.intent]));
  assert.deepEqual(Object.keys(intent), CC_KEYS);
  assert.deepEqual({ ...intent, nonce: 'n' }, { schemaVersion: 1, action: 'approve-current', recordId: CLIP, parentId: VIDEO, projectId: 'P3111218hfRT', originalClipId: 'kFwpiOJgGe', finalClipId: 'kFwpiOJgGe', expectedVersion: 1, reviewGeneration: '191bce01-7a85-45fb-944c-4fddac427304', nonce: 'n' });
  assert.match(intent.nonce, /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i, 'n8n\'s nonce rule');
  assert.deepEqual(fetches, [{ url: HOOK('CLIP_REVIEW'), body: { recordId: CLIP } }], 'the Content Center\'s webhook body, nothing more');
  assert.equal((await call(`/hq/api/content/items/${VIDEO}`, { cookie: alex })).body.review.path, 'owner');
  // Get the current copy of a clip never reviewed: version 0, its imported copy.
  fetches = []; writes = [];
  assert.equal((await review(alex, FRESH, { action: 'refresh' })).status, 200);
  assert.deepEqual([JSON.parse(String(writes[0][2][RF.intent])).action, JSON.parse(String(writes[0][2][RF.intent])).expectedVersion, fetches.length], ['refresh-current', 0, 1]);
  // The Content Center's guards: no decision before a verified copy; a note for changes.
  writes = []; fetches = [];
  assert.equal((await review(alex, FRESH, { action: 'approve' })).body.error, 'Refresh and review this selected copy before deciding.');
  assert.equal((await review(alex, CLIP, { action: 'changes' })).status, 400, 'say what to change');
  assert.deepEqual([writes, fetches], [[], []]);
  // Request changes = "Reject copy" + the note on Sienna's list.
  const ch = await review(alex, CLIP, { action: 'changes', note: 'Cut the first 2 seconds', videoId: VIDEO });
  assert.equal(ch.status, 200, ch.text);
  assert.equal(JSON.parse(String(writes[0][2][RF.intent])).action, 'reject-current');
  const task = (await db.query(`SELECT agent, title, notes, link FROM hq_agent_tasks`)).rows;
  assert.deepEqual([task.length, task[0].agent, task[0].title, task[0].link], [1, 'Sienna', 'Clip changes: "Clip A"', `content/items/${VIDEO}`]);
  assert.match(task[0].notes, /Cut the first 2 seconds/);
  const log = (await db.query(`SELECT action, record_id FROM hq_content_log ORDER BY id`)).rows;
  assert.deepEqual(log.map((x) => x.action), ['clip_approve', 'clip_refresh', 'clip_changes']);
});

test('final clips API: another token user — nothing sent without the signed path; with CONTENT_REVIEW_SECRET HQ signs the exact intent', { skip }, async () => {
  tokenUser = { ...ENGINE_USER };
  const alex = await login('alex@dulcy.io');
  const r = await review(alex, CLIP, { action: 'approve' });
  assert.equal(r.status, 409);
  assert.match(r.body.error, /HQ can't approve clips yet/);
  assert.deepEqual([writes.length, fetches.length], [1, 0], 'wrote the intent (to learn the author), never woke n8n');
  writes = [];
  assert.equal((await review(alex, CLIP, { action: 'approve' })).status, 409);
  assert.deepEqual(writes, [], 'now known: refused before writing');
  assert.equal((await call(`/hq/api/content/items/${VIDEO}`, { cookie: alex })).body.review.path, 'blocked');
  config.contentReviewSecret = SECRET;
  const s2 = await review(alex, CLIP, { action: 'approve' });
  assert.equal(s2.status, 200, s2.text);
  const raw = String(writes[0][2][RF.intent]);
  assert.deepEqual(fetches, [{ url: HOOK('CLIP_REVIEW'), body: { recordId: CLIP, source: 'hq', hqSig: reviewSig(SECRET, raw) } }]);
  // The signature passes the patched n8n check for this exact intent.
  const out = runNode(patched('Parse Current Review Context'), { nodes: { 'Validate Wake': { recordId: CLIP, hqSig: fetches[0].body.hqSig }, 'Read Current Review Request': { id: CLIP, fields: { 'Review Intent JSON': raw, 'Review Intent Author': ENGINE_USER, 'Parent Content': [VIDEO], 'OpusClip Clip ID': 'P3111218hfRT.kFwpiOJgGe' } } }, input: { id: VIDEO, fields: { 'OpusClip Short Project ID': 'P3111218hfRT' } }, vars: { CONTENT_REVIEW_SECRET: SECRET } })[0].json;
  assert.deepEqual(out.author, OWNER_IDENTITY);
});

test('full video, Gamma link and resource API', { skip }, async () => {
  const alex = await login('alex@dulcy.io');
  assert.equal((await call(`/hq/api/content/items/${VIDEO}/video-review`, { cookie: alex, body: { verdict: 'approve' } })).status, 200);
  assert.equal((await call(`/hq/api/content/items/${VIDEO}/video-review`, { cookie: alex, body: { verdict: 'changes' } })).status, 400);
  assert.equal((await call(`/hq/api/content/items/${VIDEO}/video-review`, { cookie: alex, body: { verdict: 'changes', note: 'Tighten the intro' } })).status, 200);
  assert.equal((await call(`/hq/api/content/items/${OTHER_VIDEO}/video-review`, { cookie: alex, body: { verdict: 'approve' } })).status, 409, 'no finished video');
  assert.deepEqual([writes, fetches], [[], []], 'the full video has no Content Center write');
  assert.deepEqual((await db.query(`SELECT title FROM hq_agent_tasks`)).rows.map((x) => x.title), ['Video changes: "Pay only on orders: guardrails"']);
  // Gamma link: saved in Notes, where parsePrep (Open Gamma) reads it.
  assert.equal((await call(`/hq/api/content/items/${VIDEO}/gamma`, { cookie: alex, body: { url: 'https://evil.example/x' } })).status, 400);
  assert.equal((await call(`/hq/api/content/items/${VIDEO}/gamma`, { cookie: alex, body: { url: 'https://gamma.app/docs/pay-abc' } })).status, 200);
  assert.deepEqual(writes, [[CONTENT, VIDEO, { [CF.notes]: '**Gamma outline**\nSlide 1: The cover line. More.\nSlide 2: Step two. A point.\n\n**Gamma link:** https://gamma.app/docs/pay-abc' }]]);
  assert.equal((await call(`/hq/api/content/items/${VIDEO}`, { cookie: alex })).body.gamma.url, 'https://gamma.app/docs/pay-abc');
  // Resource: a read only.
  writes = [];
  const doc = await call(`/hq/api/content/items/${VIDEO}/resource`, { cookie: alex });
  assert.equal(doc.status, 200, doc.text);
  assert.deepEqual([doc.body.cover.headline, doc.body.sections[0].headline, doc.body.sections[0].points], ['The cover line.', 'Step two.', [{ title: '', body: 'A point.' }]]);
  assert.equal((await call(`/hq/api/content/items/${OTHER_VIDEO}/resource`, { cookie: alex })).status, 409, 'no outline');
  assert.deepEqual([writes, fetches], [[], []]);
});

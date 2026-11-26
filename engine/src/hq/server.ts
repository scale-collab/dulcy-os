// Dulcy HQ over HTTP. The web app (static files from HQ_WEB_DIR) is served at /hq, or at / when the
// Host is HQ_HOST; its API is /hq/api/* on both. Every API route except the login ones needs a
// session. Writes need a same-origin Origin header (CSRF) and a JSON body; cookies are SameSite=Strict.
// No key or token ever goes to the browser.
import { slackToMarkdown } from './reports.js';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import type { Db } from '../db/pool.js';
import type { Config } from '../config.js';
import { createAirtableClient } from '../providers/airtable.js';
import { AGENTS, AGENT_NAMES, OWNER_ONLY, PILES, agentByName, type AgentName } from './agents.js';
import {
  OAUTH_COOKIE, SESSION_COOKIE, cookie, createSession, endSession, googleFinish, googleOn, googleStart, passwordLogin, sessionUser, userByEmail, type HqUser,
} from './auth.js';
import { decide, groupByPile, pendingDecisions, type HqAirtable } from './decisions.js';
import { listTasks, markDone, notYet, quickAdd, validNewTask } from './tasks.js';
import { agentActivity, agentRuns, agentTasks, finishAgentTask, jobHealth, teamCheck } from './team.js';
import { canTalkTo, chatTurn, listThreads, readThread, type ChatModel } from './chat.js';
import { clientDetail, listClients } from './clients.js';
import { SIGNUP_SENT, addUser, googleSignUp, listUsers, manageUser, pendingCount, signUp } from './users.js';
import { askVisible, finishAsk, getAsk, isSnooze, listAsks, quietItem, snoozeAsk } from './asks.js';
import { loadNeeds, needCounts } from './needs.js';
import { actOnThread, listInbox, threadDetail } from './inbox.js';
import { calendarInvite, replierDetail, saveReplier } from './replier.js';
import { deliverabilityView } from './deliverability.js';

export interface HqDeps { at?: HqAirtable; chatModel?: ChatModel; fetchImpl?: typeof fetch; webDir?: string }

const SECURITY_HEADERS: Record<string, string> = {
  'x-content-type-options': 'nosniff',
  'referrer-policy': 'same-origin',
  'x-frame-options': 'DENY',
  'strict-transport-security': 'max-age=31536000',
  'content-security-policy': "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; font-src 'self' data:; frame-ancestors 'none'; base-uri 'none'; form-action 'self'",
};

function json(res: http.ServerResponse, status: number, body: unknown, extra: Record<string, string | string[]> = {}) {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...SECURITY_HEADERS, ...extra });
  res.end(JSON.stringify(body));
}
function redirect(res: http.ServerResponse, location: string, extra: Record<string, string | string[]> = {}) {
  res.writeHead(302, { location, 'cache-control': 'no-store', ...SECURITY_HEADERS, ...extra });
  res.end();
}

async function readJson(req: http.IncomingMessage, limit = 100_000): Promise<any> {
  const chunks: Buffer[] = []; let size = 0;
  for await (const c of req) { size += (c as Buffer).length; if (size > limit) throw Object.assign(new Error('body too large'), { status: 413 }); chunks.push(c as Buffer); }
  const t = Buffer.concat(chunks).toString('utf8');
  if (!t) return {};
  try { return JSON.parse(t); } catch { throw Object.assign(new Error('invalid JSON'), { status: 400 }); }
}

export const hostOf = (req: http.IncomingMessage) => String(req.headers.host ?? '').split(':')[0].toLowerCase();
export function clientIp(req: http.IncomingMessage): string {
  // Behind Traefik (the only way in: the port is bound to 127.0.0.1), X-Forwarded-For is set by the proxy.
  return String(req.headers['x-forwarded-for'] ?? '').split(',')[0].trim() || req.socket.remoteAddress || 'unknown';
}

/** CSRF: a write must come from a page on this same host. */
export function sameOrigin(req: http.IncomingMessage): boolean {
  const origin = String(req.headers.origin ?? '');
  if (!origin) return false;
  try { return new URL(origin).host.toLowerCase() === String(req.headers.host ?? '').toLowerCase(); } catch { return false; }
}

const MIME: Record<string, string> = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.woff2': 'font/woff2', '.txt': 'text/plain; charset=utf-8' };

function serveStatic(res: http.ServerResponse, webDir: string, rel: string) {
  const root = path.resolve(webDir);
  const clean = rel.replace(/^\/+/, '');
  let file = path.resolve(root, clean || 'index.html');
  if (!file.startsWith(root + path.sep) && file !== root) { res.writeHead(404, SECURITY_HEADERS); return res.end('not found'); }
  let isIndex = false;
  try { if (!fs.statSync(file).isFile()) throw new Error('dir'); } catch {
    // Unknown paths (not assets) get the app; missing assets are a 404.
    if (/^assets\//.test(clean)) { res.writeHead(404, SECURITY_HEADERS); return res.end('not found'); }
    file = path.join(root, 'index.html'); isIndex = true;
  }
  if (path.basename(file) === 'index.html') isIndex = true;
  let body: Buffer;
  try { body = fs.readFileSync(file); } catch {
    res.writeHead(503, { 'content-type': 'text/plain; charset=utf-8', ...SECURITY_HEADERS });
    return res.end('Dulcy HQ is not built on this server yet (hq/web). Run the deploy again.');
  }
  res.writeHead(200, {
    'content-type': MIME[path.extname(file)] ?? 'application/octet-stream', ...SECURITY_HEADERS,
    'cache-control': isIndex ? 'no-cache' : 'public, max-age=31536000, immutable',
  });
  res.end(body);
}

const PUBLIC = new Set(['/hq/api/auth/signup', '/hq/api/auth/login', '/hq/api/auth/config', '/hq/api/auth/google/start', '/hq/api/auth/google/callback', '/hq/api/auth/logout']);

/** Handle an HQ request. Returns false when the path is not HQ's (the engine API handles it). */
export function createHqHandler(db: Db, cfg: Config, deps: HqDeps = {}) {
  const at: HqAirtable | undefined = deps.at ?? (cfg.airtableApiKey ? createAirtableClient({ apiKey: cfg.airtableApiKey, baseId: cfg.airtableBaseId, baseUrl: cfg.airtableBaseUrl }) : undefined);
  const webDir = deps.webDir ?? cfg.hqWebDir;
  const needAt = () => { if (!at) throw Object.assign(new Error('Airtable is not connected on this server (AIRTABLE_API_KEY)'), { status: 503 }); return at; };
  const home = (req: http.IncomingMessage) => (hostOf(req) === cfg.hqHost ? '/' : '/hq/');

  return async function handle(req: http.IncomingMessage, res: http.ServerResponse, url: URL): Promise<boolean> {
    const onHqHost = hostOf(req) === cfg.hqHost;
    const p = url.pathname;
    const isHq = p === '/hq' || p.startsWith('/hq/');
    if (!isHq && !onHqHost) return false;

    if (!p.startsWith('/hq/api/')) {
      if (req.method !== 'GET' && req.method !== 'HEAD') { json(res, 405, { error: 'method not allowed' }); return true; }
      if (p === '/hq') { redirect(res, '/hq/'); return true; }
      serveStatic(res, webDir, isHq ? p.slice('/hq/'.length) : p.slice(1));
      return true;
    }

    try {
      if (!cfg.hqSessionSecret) { json(res, 503, { error: 'HQ is off on this server: set HQ_SESSION_SECRET (32+ characters).' }); return true; }
      const write = !['GET', 'HEAD'].includes(req.method ?? 'GET');
      if (write) {
        if (!sameOrigin(req)) { json(res, 403, { error: 'cross-site request refused' }); return true; }
        if (!/^application\/json\b/i.test(String(req.headers['content-type'] ?? ''))) { json(res, 415, { error: 'send JSON' }); return true; }
      }

      // ---- Login (no session needed) ----
      if (p === '/hq/api/auth/config' && req.method === 'GET') { json(res, 200, { google: googleOn(cfg) }); return true; }
      if (p === '/hq/api/auth/login' && req.method === 'POST') {
        const b = await readJson(req);
        const r = await passwordLogin(db, String(b.email ?? ''), String(b.password ?? ''), clientIp(req));
        if (!r.user) { json(res, r.status, { error: r.error }); return true; }
        json(res, 200, { user: publicUser(r.user) }, { 'set-cookie': await createSession(db, cfg, r.user.id) });
        return true;
      }
      if (p === '/hq/api/auth/signup' && req.method === 'POST') {
        // A request for a login: pending until the owner approves. Never a session; same answer for every email.
        const r = await signUp(db, await readJson(req, 5_000), clientIp(req));
        json(res, r.status, r.error ? { error: r.error } : { ok: true, message: r.message });
        return true;
      }
      if (p === '/hq/api/auth/logout' && req.method === 'POST') {
        await endSession(db, cfg, req.headers.cookie);
        json(res, 200, { ok: true }, { 'set-cookie': cookie(SESSION_COOKIE, '', 0) });
        return true;
      }
      if (p === '/hq/api/auth/google/start' && req.method === 'GET') {
        if (!googleOn(cfg)) { json(res, 404, { error: 'Google sign-in is not set up' }); return true; }
        const g = googleStart(cfg, url.searchParams.get('mode') === 'signup' ? 'signup' : 'login');
        redirect(res, g.location, { 'set-cookie': g.setCookie });
        return true;
      }
      if (p === '/hq/api/auth/google/callback' && req.method === 'GET') {
        if (!googleOn(cfg)) { json(res, 404, { error: 'Google sign-in is not set up' }); return true; }
        const ip = clientIp(req);
        const g = await googleFinish(cfg, url.searchParams, req.headers.cookie, deps.fetchImpl);
        const clear = cookie(OAUTH_COOKIE, '', 0, 'Lax');
        const user = g.email ? await userByEmail(db, g.email) : null;
        await db.query(`INSERT INTO hq_login_attempts (email, ip, ok) VALUES ($1,$2,$3)`, [g.email ?? 'google', ip, Boolean(user)]);
        if (!user && g.email && g.mode === 'signup') {
          // Sign up with Google: a pending request (or nothing, if the email already has one). Same answer either way.
          const s = await googleSignUp(db, g.email, ip);
          redirect(res, `${home(req)}#/login?${s.ok ? `notice=${encodeURIComponent(SIGNUP_SENT)}` : `error=${encodeURIComponent(s.error ?? 'Try again.')}`}`, { 'set-cookie': clear });
          return true;
        }
        if (!user) { redirect(res, `${home(req)}#/login?error=${encodeURIComponent(g.error ?? 'That Google account has no HQ access.')}`, { 'set-cookie': clear }); return true; }
        redirect(res, home(req), { 'set-cookie': [clear, await createSession(db, cfg, user.id)] });
        return true;
      }

      // ---- Everything else needs a session ----
      const user = await sessionUser(db, cfg, req.headers.cookie);
      if (!user) { json(res, 401, { error: 'sign in first' }); return true; }
      if (PUBLIC.has(p)) { json(res, 405, { error: 'method not allowed' }); return true; }
      const owner = user.role === 'owner';

      if (p === '/hq/api/me' && req.method === 'GET') { json(res, 200, { user: publicUser(user), google: googleOn(cfg), ...(owner ? { signups: await pendingCount(db) } : {}) }); return true; }

      // ---- Users (owner only, checked here: members get 403) ----
      if (p === '/hq/api/users' || p.startsWith('/hq/api/users/')) {
        if (!owner) { json(res, 403, { error: 'only the owner manages users' }); return true; }
        if (p === '/hq/api/users' && req.method === 'GET') { json(res, 200, await listUsers(db)); return true; }
        if (p === '/hq/api/users' && req.method === 'POST') { const r = await addUser(db, user, await readJson(req, 5_000)); json(res, r.status, r.error ? { error: r.error } : { ok: true, id: r.id }); return true; }
        const um = p.match(/^\/hq\/api\/users\/(\d{1,9})\/(approve|deny|role|disable|enable|password)$/);
        if (um && req.method === 'POST') { const r = await manageUser(db, user, Number(um[1]), um[2], await readJson(req, 5_000)); json(res, r.status, r.error ? { error: r.error } : { ok: true }); return true; }
        json(res, 404, { error: 'not found' }); return true;
      }

      if (p === '/hq/api/today' && req.method === 'GET') { json(res, 200, await today(db, needAt(), user)); return true; }

      if (p === '/hq/api/decisions' && req.method === 'GET') {
        const piles = groupByPile(await pendingDecisions(needAt()), owner);
        json(res, 200, { piles, order: PILES.filter((x) => owner || x !== 'Money') });
        return true;
      }
      let m = p.match(/^\/hq\/api\/decisions\/(rec[A-Za-z0-9]{14})$/);
      if (m && req.method === 'POST') {
        const b = await readJson(req);
        if (!['approve', 'reject', 'edited'].includes(b.verdict)) { json(res, 400, { error: 'verdict must be approve, edited or reject' }); return true; }
        const r = await decide(needAt(), m[1], b.verdict, user.name, { canSeeMoney: owner, editedText: typeof b.text === 'string' ? b.text : undefined });
        json(res, r.status, r.error ? { error: r.error } : { ok: true, status: r.result });
        return true;
      }

      // Needs you: what the agents need from this person (one item per Decisions pile, Riley's manual fixes, sign-ups, asks).
      if (p === '/hq/api/needs' && req.method === 'GET') {
        const n = await loadNeeds(db, at, user);
        json(res, 200, { items: n.items, counts: needCounts(n.items), errors: n.errors });
        return true;
      }
      m = p.match(/^\/hq\/api\/needs\/issue\/(rec[A-Za-z0-9]{14})\/snooze$/);
      if (m && req.method === 'POST') {
        if (!owner) { json(res, 404, { error: 'not found' }); return true; }
        const b = await readJson(req, 2_000);
        if (!isSnooze(b.until)) { json(res, 400, { error: 'until must be tomorrow or monday' }); return true; }
        json(res, 200, { ok: true, until: await quietItem(db, `issue:${m[1]}`, b.until, user.name) });
        return true;
      }
      if (p === '/hq/api/asks' && req.method === 'GET') {
        const all = owner && url.searchParams.get('all') === '1';
        json(res, 200, { asks: (await listAsks(db, { all })).filter((a) => askVisible(a, owner)) });
        return true;
      }
      m = p.match(/^\/hq\/api\/asks\/(\d{1,12})\/(done|snooze)$/);
      if (m && req.method === 'POST') {
        const a = await getAsk(db, Number(m[1]));
        if (!a || !askVisible(a, owner)) { json(res, 404, { error: 'not found' }); return true; }
        if (a.done) { json(res, 409, { error: 'already done' }); return true; }
        if (m[2] === 'done') { json(res, 200, { ok: await finishAsk(db, a.id, user.name) }); return true; }
        const b = await readJson(req, 2_000);
        if (!isSnooze(b.until)) { json(res, 400, { error: 'until must be tomorrow or monday' }); return true; }
        json(res, 200, { ok: true, until: await snoozeAsk(db, a.id, b.until) });
        return true;
      }

      if (p === '/hq/api/tasks' && req.method === 'GET') { json(res, 200, await listTasks(needAt(), db)); return true; }
      if (p === '/hq/api/tasks' && req.method === 'POST') {
        const t = validNewTask(await readJson(req));
        if (typeof t === 'string') { json(res, 400, { error: t }); return true; }
        json(res, 200, { ok: true, id: await quickAdd(needAt(), t) });
        return true;
      }
      m = p.match(/^\/hq\/api\/tasks\/(rec[A-Za-z0-9]{14})\/(done|not-yet)$/);
      if (m && req.method === 'POST') {
        if (m[2] === 'not-yet') { await notYet(db, m[1]); json(res, 200, { ok: true }); return true; }
        const r = await markDone(needAt(), m[1]);
        json(res, r.status, r.error ? { error: r.error } : { ok: true });
        return true;
      }

      // Clients (Step 2): money is cut server-side for members.
      if (p === '/hq/api/clients' && req.method === 'GET') {
        json(res, 200, await listClients(needAt(), db, owner, { all: url.searchParams.get('all') === '1', refresh: url.searchParams.get('refresh') === '1' }));
        return true;
      }
      m = p.match(/^\/hq\/api\/clients\/(rec[A-Za-z0-9]{14})$/);
      if (m && req.method === 'GET') {
        const d = await clientDetail(needAt(), db, m[1], owner);
        if (!d) json(res, 404, { error: 'no such client' }); else json(res, 200, d);
        return true;
      }

      // Inbox (Step 3): every reply thread; Send / Send edited / Skip press the same buttons as the Decisions reply card.
      if (p === '/hq/api/inbox' && req.method === 'GET') {
        const sp = url.searchParams;
        json(res, 200, await listInbox(needAt(), { tab: sp.get('tab') ?? undefined, client: sp.get('client') ?? undefined, page: Number(sp.get('page')) || 1, q: sp.get('q') ?? undefined, refresh: sp.get('refresh') === '1' }));
        return true;
      }
      m = p.match(/^\/hq\/api\/inbox\/(rec[A-Za-z0-9]{14})$/);
      if (m && req.method === 'GET') {
        const t = await threadDetail(needAt(), m[1]);
        if (!t) json(res, 404, { error: 'no such thread' }); else json(res, 200, t);
        return true;
      }
      if (m && req.method === 'POST') {
        const b = await readJson(req, 50_000);
        if (!['approve', 'reject', 'edited'].includes(b.verdict)) { json(res, 400, { error: 'verdict must be approve, edited or reject' }); return true; }
        const r = await actOnThread(needAt(), m[1], b.verdict, user.name, owner, typeof b.text === 'string' ? b.text : undefined);
        json(res, r.status, r.error ? { error: r.error } : { ok: true, status: r.result });
        return true;
      }
      // Client hub → AI replier: everyone reads; only the owner saves or asks for a calendar link (checked here).
      m = p.match(/^\/hq\/api\/clients\/(rec[A-Za-z0-9]{14})\/(replier|calendar-invite)$/);
      if (m) {
        const ctx = { db, cfg, at: needAt(), fetchImpl: deps.fetchImpl };
        if (m[2] === 'replier' && req.method === 'GET') {
          const d = await replierDetail(ctx, m[1], owner);
          if (!d) json(res, 404, { error: 'no such client' }); else json(res, 200, d);
          return true;
        }
        if (req.method !== 'POST') { json(res, 405, { error: 'method not allowed' }); return true; }
        if (!owner) { json(res, 403, { error: 'only the owner changes the AI replier' }); return true; }
        const b = await readJson(req, 60_000);
        const r = m[2] === 'replier' ? await saveReplier(ctx, m[1], user.name, b.values) : await calendarInvite(ctx, m[1], user.name, b);
        const { status, error, ...rest } = r as { status: number; error?: string };
        json(res, status, error ? { error } : { ok: true, ...rest });
        return true;
      }

      // Deliverability: inboxes and domains, read only (sick first; tabs: inboxes, placement, domains).
      m = p.match(/^\/hq\/api\/deliverability(?:\/(inboxes|placement|domains))?$/);
      if (m && req.method === 'GET') { json(res, 200, await deliverabilityView(needAt(), db, cfg, m[1] ?? 'attention', url.searchParams)); return true; }

      if (p === '/hq/api/agents' && req.method === 'GET') { json(res, 200, { agents: await agentCards(db, at, user) }); return true; }
      m = p.match(/^\/hq\/api\/agents\/([A-Za-z]+)$/);
      if (m && req.method === 'GET') {
        const a = agentByName(m[1]);
        if (!a || !canTalkTo(user, a)) { json(res, 404, { error: 'no such agent' }); return true; }
        json(res, 200, await agentDetail(db, at, user, a));
        return true;
      }
      m = p.match(/^\/hq\/api\/agent-tasks\/(\d+)\/done$/);
      if (m && req.method === 'POST') {
        const row = (await db.query(`SELECT agent FROM hq_agent_tasks WHERE id=$1`, [Number(m[1])])).rows[0];
        const a = row ? agentByName(row.agent) : null;
        if (!a || !canTalkTo(user, a)) { json(res, 404, { error: 'not found' }); return true; }
        json(res, 200, { ok: await finishAgentTask(db, Number(m[1]), `Done in HQ by ${user.name}`) });
        return true;
      }

      if (p === '/hq/api/reports' && req.method === 'GET') {
        const a = url.searchParams.get('agent') ? agentByName(url.searchParams.get('agent')!) : null;
        json(res, 200, { reports: await reports(db, owner, a, Math.min(50, Number(url.searchParams.get('limit')) || 20)) });
        return true;
      }
      m = p.match(/^\/hq\/api\/reports\/(\d+)$/);
      if (m && req.method === 'GET') {
        const r = (await db.query(`SELECT * FROM hq_reports WHERE id=$1`, [Number(m[1])])).rows[0];
        if (!r || (!owner && OWNER_ONLY.includes(r.agent))) { json(res, 404, { error: 'not found' }); return true; }
        json(res, 200, { report: reportOut(r, true) });
        return true;
      }

      if (p === '/hq/api/chat/threads' && req.method === 'GET') {
        const a = url.searchParams.get('agent') ? agentByName(url.searchParams.get('agent')!) : null;
        json(res, 200, { threads: await listThreads(db, user, a ?? undefined) });
        return true;
      }
      m = p.match(/^\/hq\/api\/chat\/threads\/(\d+)$/);
      if (m && req.method === 'GET') {
        const t = await readThread(db, user, Number(m[1]));
        if (!t) json(res, 404, { error: 'not found' }); else json(res, 200, { thread: t });
        return true;
      }
      if (p === '/hq/api/chat' && req.method === 'POST') {
        const b = await readJson(req, 20_000);
        const a = agentByName(String(b.agent ?? 'Ada'));
        const text = String(b.message ?? '').trim();
        if (!a) { json(res, 400, { error: 'unknown agent' }); return true; }
        if (!text || text.length > 4000) { json(res, 400, { error: 'a message (up to 4,000 characters), please' }); return true; }
        if (!deps.chatModel && !cfg.anthropicApiKey) { json(res, 503, { error: 'Chat is off: no ANTHROPIC_API_KEY on the server.' }); return true; }
        const r = await chatTurn({ db, cfg, at, model: deps.chatModel, user }, { agent: a, message: text, threadId: b.threadId ? Number(b.threadId) : undefined });
        json(res, 200, r);
        return true;
      }

      json(res, 404, { error: 'not found' });
      return true;
    } catch (e) {
      const status = Number((e as any)?.status) || 500;
      if (status >= 500) console.error(JSON.stringify({ level: 'error', message: 'hq error', path: p, err: String((e as Error).message ?? e).slice(0, 300) }));
      json(res, status, { error: status >= 500 && status !== 503 ? 'Something went wrong. Try again.' : String((e as Error).message ?? e) });
      return true;
    }
  };
}

const publicUser = (u: HqUser) => ({ email: u.email, name: u.name, role: u.role });

function reportOut(r: any, full = false) {
  return {
    id: Number(r.id), agent: r.agent, kind: r.kind, title: r.title, summary: r.summary, link: r.link ?? null, urgent: r.urgent, dryRun: r.dry_run,
    created: new Date(r.created_at).toISOString(), data: r.kind === 'call_review' || full ? r.data ?? null : null, ...(full ? { body: r.body } : {}),
  };
}

async function reports(db: Db, owner: boolean, agent: AgentName | null, limit: number) {
  const r = await db.query(`SELECT id, agent, kind, title, summary, link, urgent, dry_run, created_at, data FROM hq_reports
    WHERE ($1::text IS NULL OR agent=$1) AND ($2 OR NOT (agent = ANY($4))) ORDER BY id DESC LIMIT $3`, [agent, owner, limit, OWNER_ONLY]);
  return r.rows.map((x) => reportOut(x));
}

/** Today: Ada's latest brief, the team check, latest reports, decisions per pile, the top 3 of "Needs you". */
async function today(db: Db, at: HqAirtable, user: HqUser) {
  const owner = user.role === 'owner';
  const visible = AGENT_NAMES.filter((a) => canTalkTo(user, a));
  const [decisions, health, brief, recent] = await Promise.all([
    pendingDecisions(at), jobHealth(db),
    db.query(`SELECT * FROM hq_reports WHERE kind='brief' ORDER BY id DESC LIMIT 1`).then((r) => r.rows[0] ?? null),
    reports(db, owner, null, 8),
  ]);
  let briefOut: { title: string; body: string; created: string; dryRun: boolean } | null = brief ? { title: brief.title, body: brief.body, created: new Date(brief.created_at).toISOString(), dryRun: brief.dry_run } : null;
  if (!briefOut) {
    // Before the first saved brief: the text of the latest ada.brief job.
    const j = (await db.query(`SELECT result, updated_at, dry_run FROM jobs WHERE kind='ada.brief' AND status='succeeded' ORDER BY id DESC LIMIT 1`)).rows[0];
    const t = String(j?.result?.text ?? '');
    if (t) { const [first, ...rest] = t.split('\n'); briefOut = { title: first.replace(/\*/g, ''), body: slackToMarkdown(rest.join('\n')), created: new Date(j.updated_at).toISOString(), dryRun: j.dry_run }; }
  }
  const piles = groupByPile(decisions, owner);
  const needs = await loadNeeds(db, at, user, { decisions });
  return {
    user: publicUser(user),
    ...(owner ? { signups: await pendingCount(db) } : {}),
    brief: briefOut,
    team: teamCheck(health, owner ? decisions : decisions.filter((x) => !OWNER_ONLY.includes(x.agent)), Date.now(), visible),
    decisions: Object.fromEntries(Object.entries(piles).filter(([k]) => owner || k !== 'Money').map(([k, v]) => [k, v.length])),
    needs: { top: needs.items.slice(0, 3), counts: needCounts(needs.items), errors: needs.errors },
    reports: recent,
  };
}

async function agentCards(db: Db, at: HqAirtable | undefined, user: HqUser) {
  const visible = AGENT_NAMES.filter((a) => canTalkTo(user, a));
  const [decisions, health, tasks] = await Promise.all([at ? pendingDecisions(at).catch(() => []) : Promise.resolve([]), jobHealth(db), agentTasks(db)]);
  const check = teamCheck(health, decisions, Date.now(), visible);
  return visible.map((a) => ({
    ...AGENTS[a], status: check.find((c) => c.agent === a), waiting: decisions.filter((d) => d.agent === a).length,
    openTasks: tasks.filter((t) => t.agent === a).length, lastOk: health.get(a)?.lastOk ?? null, lastFail: health.get(a)?.lastFail ?? null,
  }));
}

async function agentDetail(db: Db, at: HqAirtable | undefined, user: HqUser, a: AgentName) {
  const [runs, decisions, activity, tasks, recent, health] = await Promise.all([
    agentRuns(db, a, 10),
    at ? pendingDecisions(at).then((d) => d.filter((x) => x.agent === a)).catch(() => []) : Promise.resolve([]),
    at ? agentActivity(at, a, 10).catch(() => []) : Promise.resolve([]),
    agentTasks(db, a),
    reports(db, user.role === 'owner', a, 10),
    jobHealth(db),
  ]);
  return { agent: AGENTS[a], status: teamCheck(health, decisions, Date.now(), [a])[0], lastOk: health.get(a)?.lastOk ?? null, lastFail: health.get(a)?.lastFail ?? null, runs, decisions, activity, tasks, reports: recent };
}

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
  OAUTH_COOKIE, SESSION_COOKIE, cookie, createSession, endSession, googleFinish, googleOn, googleRedirectUri, googleStart, passwordLogin, sessionUser, userByEmail, type HqUser,
} from './auth.js';
import { decide, groupByPile, pendingDecisions, type HqAirtable } from './decisions.js';
import { listTasks, markDone, notYet, quickAdd, validNewTask } from './tasks.js';
import { agentActivity, agentRuns, agentTasks, finishAgentTask, jobHealth, teamCheck } from './team.js';
import { canTalkTo, chatTurn, listThreads, readThread, type ChatModel } from './chat.js';
import { clientDetail, listClients } from './clients.js';
import { PORTAL_SIGNUP_SENT, SIGNUP_SENT, addUser, googleSignUp, listUsers, manageUser, pendingCount, signUp } from './users.js';
import { portalWrite, recentPortalWrites } from './portalWrites.js';
import { forgotPassword, inviteSoftrUser, linkPortalUser, listSoftrUsers, makeSetupLink, portalGoogleNewUser, setPasswordWithToken, suggestedClient, updateOwnAccount } from './portalAccounts.js';
import { askVisible, finishAsk, getAsk, isSnooze, listAsks, quietItem, snoozeAsk } from './asks.js';
import { isNeedDay, loadNeeds, loadNeedsDay, needCounts } from './needs.js';
import { workSummary } from './agentTasks.js';
import { actOnThread, listInbox, threadDetail } from './inbox.js';
import { calendarInvite, replierDetail, saveReplier } from './replier.js';
import { campaignDetail, listCampaigns } from './campaigns.js';
import { deliverabilityView } from './deliverability.js';
import { portalRoute, resolvePortalClient } from './portal.js';
import { contentSummary, contentView, decideIdea } from './content.js';
import { allDeals, dealDetail, nyDay, salesView } from './sales.js';
// Batch 4a: Sales insights (periods, capacity, Close hottest deals) and the contract draft.
import { insightsView, saveCapacitySettings, salesDeps, type SalesDeps } from './salesInsights.js';
import { createInDulcySign, draftForm, saveDraft } from './contracts.js';

export interface HqDeps { at?: HqAirtable; chatModel?: ChatModel; fetchImpl?: typeof fetch; webDir?: string; sales?: SalesDeps }

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

function serveStatic(res: http.ServerResponse, webDir: string, rel: string, fallback: 'index.html' | 'portal.html' = 'index.html') {
  const root = path.resolve(webDir);
  const clean = rel.replace(/^\/+/, '');
  let file = path.resolve(root, clean || fallback);
  if (!file.startsWith(root + path.sep) && file !== root) { res.writeHead(404, SECURITY_HEADERS); return res.end('not found'); }
  let isIndex = false;
  try { if (!fs.statSync(file).isFile()) throw new Error('dir'); } catch {
    // Unknown paths (not assets) get the app; missing assets are a 404.
    if (/^assets\//.test(clean)) { res.writeHead(404, SECURITY_HEADERS); return res.end('not found'); }
    file = path.join(root, fallback); isIndex = true;
  }
  if (path.basename(file) === 'index.html' || path.basename(file) === 'portal.html') isIndex = true;
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

/**
 * The client-portal route guard (Step 4, 2026-11-26). A client login (role client) may call ONLY the
 * API paths on this allow-list; every other HQ route answers 403, including routes added later
 * (blocked by default). The login routes run before the session check, so they are not listed.
 * Owners and members are not affected here (the portal routes refuse them themselves).
 */
export const CLIENT_API_ALLOW: readonly RegExp[] = [/^\/hq\/api\/portal\/[a-z][a-z-]{1,23}(?:\/(?:[A-Za-z0-9_-]{12}|[a-z]{2,12}))?(?:\/[a-z]{2,12})?$/];
export const CLIENT_REFUSED = 'This page is not part of your client portal.';
export function clientMayCall(user: Pick<HqUser, 'role'>, pathname: string): boolean {
  if (user.role !== 'client') return true;
  return CLIENT_API_ALLOW.some((re) => re.test(pathname));
}

const PUBLIC = new Set(['/hq/api/auth/signup', '/hq/api/auth/login', '/hq/api/auth/config', '/hq/api/auth/google/start', '/hq/api/auth/google/callback', '/hq/api/auth/logout', '/hq/api/auth/forgot', '/hq/api/auth/set-password']);

/**
 * Host routing (2026-11-26). On PORTAL_HOST (portal.dulcy.io) only the portal shell (portal.html and
 * the files it loads), the login routes and /hq/api/portal/* answer. HQ's own app (index.html), every
 * other HQ API route and the engine's signed API are never served there; staff signing in there are
 * sent to HQ_HOST.
 */
export const PORTAL_HOST_API: readonly RegExp[] = [/^\/hq\/api\/auth\/(?:config|login|logout|signup|forgot|set-password|google\/start|google\/callback)$/, ...CLIENT_API_ALLOW];
export const portalHostMayCall = (pathname: string) => PORTAL_HOST_API.some((re) => re.test(pathname));
const PORTAL_STATIC = /^\/hq\/(?:favicon\.png|apple-touch-icon\.png|theme\.js|dulcy-mark\.png)$/;
let portalAssetCache: { file: string; mtime: number; set: Set<string> } | null = null;
/** The asset files portal.html loads (and the CSS/JS they pull in): the only /hq/assets/ files the portal host serves. */
export function portalAssets(webDir: string): Set<string> {
  const file = path.join(path.resolve(webDir), 'portal.html');
  let mtime = 0; try { mtime = fs.statSync(file).mtimeMs; } catch { return new Set(); }
  if (portalAssetCache?.file === file && portalAssetCache.mtime === mtime) return portalAssetCache.set;
  const set = new Set<string>(); const seen = new Set<string>();
  const scan = (text: string) => { for (const m of text.matchAll(/\/hq\/(assets\/[A-Za-z0-9._-]+)/g)) set.add(m[1]); for (const m of text.matchAll(/["'(]\.\/([A-Za-z0-9._-]+\.(?:js|css|woff2))/g)) set.add(`assets/${m[1]}`); };
  scan(fs.readFileSync(file, 'utf8'));
  for (let again = true; again;) {
    again = false;
    for (const a of [...set]) if (!seen.has(a) && /\.(css|js)$/.test(a)) { seen.add(a); again = true; try { scan(fs.readFileSync(path.join(path.resolve(webDir), a), 'utf8')); } catch { /* missing */ } }
  }
  portalAssetCache = { file, mtime, set };
  return set;
}
const PORTAL_LINKS = { esp: 'https://send.dulcy.io/', partnership: 'https://www.fanbasis.com/portal/user/my-purchase' } as const;

/** Handle an HQ request. Returns false when the path is not HQ's (the engine API handles it). */
export function createHqHandler(db: Db, cfg: Config, deps: HqDeps = {}) {
  const at: HqAirtable | undefined = deps.at ?? (cfg.airtableApiKey ? createAirtableClient({ apiKey: cfg.airtableApiKey, baseId: cfg.airtableBaseId, baseUrl: cfg.airtableBaseUrl }) : undefined);
  const webDir = deps.webDir ?? cfg.hqWebDir;
  const needAt = () => { if (!at) throw Object.assign(new Error('Airtable is not connected on this server (AIRTABLE_API_KEY)'), { status: 503 }); return at; };
  const home = (req: http.IncomingMessage) => (hostOf(req) === cfg.hqHost ? '/' : '/hq/');
  // Batch 4a: read-only Close / Xero / calendar readers for Sales (tests pass fakes).
  const sales: SalesDeps = deps.sales ?? salesDeps(db, cfg, deps.fetchImpl);

  return async function handle(req: http.IncomingMessage, res: http.ServerResponse, url: URL): Promise<boolean> {
    const host = hostOf(req);
    const onPortalHost = host === cfg.portalHost && cfg.portalHost !== cfg.hqHost;
    const onHqHost = host === cfg.hqHost;
    const p = url.pathname;
    const isHq = p === '/hq' || p.startsWith('/hq/');
    if (!isHq && !onHqHost && !onPortalHost) return false;

    if (!p.startsWith('/hq/api/')) {
      if (req.method !== 'GET' && req.method !== 'HEAD') { json(res, 405, { error: 'method not allowed' }); return true; }
      if (onPortalHost) {
        // The portal shell only: its own files, else portal.html (never HQ's index.html).
        const asset = /^\/hq\/(assets\/[A-Za-z0-9._-]+)$/.exec(p)?.[1];
        if (asset) { if (portalAssets(webDir).has(asset)) serveStatic(res, webDir, asset, 'portal.html'); else { res.writeHead(404, SECURITY_HEADERS); res.end('not found'); } return true; }
        serveStatic(res, webDir, PORTAL_STATIC.test(p) ? p.slice('/hq/'.length) : 'portal.html', 'portal.html');
        return true;
      }
      if (p === '/hq') { redirect(res, '/hq/'); return true; }
      const rel = isHq ? p.slice('/hq/'.length) : p.slice(1);
      // The portal preview before the DNS switch: hq.dulcy.io/portal (and /hq/portal), with a client login.
      if (/^portal(?:\/|$)/.test(rel)) { serveStatic(res, webDir, 'portal.html', 'portal.html'); return true; }
      serveStatic(res, webDir, rel);
      return true;
    }
    if (onPortalHost && !portalHostMayCall(p)) { json(res, 404, { error: 'not found' }); return true; }

    try {
      if (!cfg.hqSessionSecret) { json(res, 503, { error: 'HQ is off on this server: set HQ_SESSION_SECRET (32+ characters).' }); return true; }
      const write = !['GET', 'HEAD'].includes(req.method ?? 'GET');
      if (write) {
        if (!sameOrigin(req)) { json(res, 403, { error: 'cross-site request refused' }); return true; }
        if (!/^application\/json\b/i.test(String(req.headers['content-type'] ?? ''))) { json(res, 415, { error: 'send JSON' }); return true; }
      }

      // ---- Login (no session needed) ----
      if (p === '/hq/api/auth/config' && req.method === 'GET') { json(res, 200, { google: googleOn(cfg), portal: onPortalHost, staffUrl: `${cfg.hqPublicUrl}/` }); return true; }
      if (p === '/hq/api/auth/login' && req.method === 'POST') {
        const b = await readJson(req);
        const r = await passwordLogin(db, String(b.email ?? ''), String(b.password ?? ''), clientIp(req));
        if (!r.user) { json(res, r.status, { error: r.error }); return true; }
        // Staff on the portal host: no session there; their place is HQ.
        if (onPortalHost && r.user.role !== 'client') { json(res, 200, { redirect: `${cfg.hqPublicUrl}/`, message: 'Dulcy team logins sign in at HQ.' }); return true; }
        json(res, 200, { user: publicUser(r.user) }, { 'set-cookie': await createSession(db, cfg, r.user.id) });
        return true;
      }
      if (p === '/hq/api/auth/signup' && req.method === 'POST') {
        // A request for a login: pending until the owner approves. Never a session; same answer for every email.
        const r = await signUp(db, await readJson(req, 5_000), clientIp(req), { portal: onPortalHost });
        json(res, r.status, r.error ? { error: r.error } : { ok: true, message: r.message });
        return true;
      }
      if (p === '/hq/api/auth/forgot' && req.method === 'POST') {
        const b = await readJson(req, 2_000);
        const r = await forgotPassword(db, String(b.email ?? ''), clientIp(req));
        json(res, r.status, r.error ? { error: r.error } : { ok: true, message: r.message });
        return true;
      }
      if (p === '/hq/api/auth/set-password' && req.method === 'POST') {
        const b = await readJson(req, 2_000);
        const r = await setPasswordWithToken(db, String(b.token ?? ''), String(b.password ?? ''), String(b.password2 ?? ''));
        if (!r.user) { json(res, r.status, { error: r.error }); return true; }
        json(res, 200, { user: publicUser(r.user) }, { 'set-cookie': await createSession(db, cfg, r.user.id) });
        return true;
      }
      if (p === '/hq/api/auth/logout' && req.method === 'POST') {
        await endSession(db, cfg, req.headers.cookie);
        json(res, 200, { ok: true }, { 'set-cookie': cookie(SESSION_COOKIE, '', 0) });
        return true;
      }
      if (p === '/hq/api/auth/google/start' && req.method === 'GET') {
        if (!googleOn(cfg)) { json(res, 404, { error: 'Google sign-in is not set up' }); return true; }
        const g = googleStart(cfg, url.searchParams.get('mode') === 'signup' ? 'signup' : 'login', onPortalHost ? portalGoogleRedirect(cfg) : googleRedirectUri(cfg));
        redirect(res, g.location, { 'set-cookie': g.setCookie });
        return true;
      }
      if (p === '/hq/api/auth/google/callback' && req.method === 'GET') {
        if (!googleOn(cfg)) { json(res, 404, { error: 'Google sign-in is not set up' }); return true; }
        const ip = clientIp(req);
        const g = await googleFinish(cfg, url.searchParams, req.headers.cookie, deps.fetchImpl, onPortalHost ? portalGoogleRedirect(cfg) : googleRedirectUri(cfg));
        const clear = cookie(OAUTH_COOKIE, '', 0, 'Lax');
        let user = g.email ? await userByEmail(db, g.email) : null;
        if (onPortalHost) {
          // Portal: a client signs in; staff go to HQ; a Google-verified email that Airtable Portal Users
          // links to exactly one active client gets its login; anyone else becomes a request.
          if (user && user.role !== 'client') { redirect(res, `${cfg.hqPublicUrl}/`, { 'set-cookie': clear }); return true; }
          if (!user && g.email && at) user = await portalGoogleNewUser(db, at, g.email).catch(() => null);
          await db.query(`INSERT INTO hq_login_attempts (email, ip, ok) VALUES ($1,$2,$3)`, [g.email ?? 'google', ip, Boolean(user)]);
          if (user) { redirect(res, '/', { 'set-cookie': [clear, await createSession(db, cfg, user.id)] }); return true; }
          if (g.email) {
            const s = await googleSignUp(db, g.email, ip, { portal: true });
            redirect(res, `/#/login?${s.ok ? `notice=${encodeURIComponent(PORTAL_SIGNUP_SENT)}` : `error=${encodeURIComponent(s.error ?? 'Try again.')}`}`, { 'set-cookie': clear });
            return true;
          }
          redirect(res, `/#/login?error=${encodeURIComponent(g.error ?? 'Google sign-in did not work. Try again.')}`, { 'set-cookie': clear });
          return true;
        }
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
      if (!clientMayCall(user, p)) { json(res, 403, { error: CLIENT_REFUSED, portal: true }); return true; }
      if (onPortalHost && user.role !== 'client') { json(res, 403, { error: 'Dulcy team logins sign in at HQ.', redirect: `${cfg.hqPublicUrl}/` }); return true; }
      if (PUBLIC.has(p)) { json(res, 405, { error: 'method not allowed' }); return true; }
      const owner = user.role === 'owner';

      // ---- Client portal (Step 4): read only; the client is the session's, never the URL's ----
      if (p.startsWith('/hq/api/portal/')) {
        const sub = p.slice('/hq/api/portal'.length);
        if (req.method === 'GET') { const r = await portalRoute(needAt(), user, sub, { meeting: cfg.portalMeetingUrl, ...PORTAL_LINKS }); json(res, r.status, r.body); return true; }
        if (req.method !== 'POST') { json(res, 405, { error: 'method not allowed' }); return true; }
        if (sub === '/account') {
          const r = await updateOwnAccount(db, user, await readJson(req, 5_000));
          if (r.error) { json(res, r.status, { error: r.error }); return true; }
          // A new password ends every session, this one too: a fresh one is handed back.
          json(res, 200, { ok: true }, r.passwordChanged ? { 'set-cookie': await createSession(db, cfg, user.id) } : {});
          return true;
        }
        const r = await portalWrite(needAt(), db, user, sub, await readJson(req, 60_000));
        json(res, r.status, r.body);
        return true;
      }

      if (p === '/hq/api/me' && req.method === 'GET') { json(res, 200, { user: publicUser(user), google: googleOn(cfg), ...(owner ? { signups: await pendingCount(db) } : {}) }); return true; }

      // ---- Users (owner only, checked here: members get 403) ----
      if (p === '/hq/api/users' || p.startsWith('/hq/api/users/')) {
        if (!owner) { json(res, 403, { error: 'only the owner manages users' }); return true; }
        if (p === '/hq/api/users' && req.method === 'GET') {
          const out = await listUsers(db);
          // Client portal requests: the client Airtable Portal Users links the email to (a suggestion; the owner links).
          if (at) for (const u of out.users) if (u.portalRequest) u.suggest = await suggestedClient(at, u.email).catch(() => null);
          json(res, 200, out); return true;
        }
        if (p === '/hq/api/users/softr' && req.method === 'GET') { json(res, 200, await listSoftrUsers(db, needAt())); return true; }
        if (p === '/hq/api/users/portal-writes' && req.method === 'GET') { json(res, 200, { writes: await recentPortalWrites(db) }); return true; }
        const sm = p.match(/^\/hq\/api\/users\/softr\/(rec[A-Za-z0-9]{14})\/invite$/);
        if (sm && req.method === 'POST') { const r = await inviteSoftrUser(db, user, needAt(), sm[1], cfg.portalPublicUrl); json(res, r.status, r.error ? { error: r.error } : { ok: true, url: r.url, expires: r.expires }); return true; }
        const lm = p.match(/^\/hq\/api\/users\/(\d{1,9})\/(link|setup-link)$/);
        if (lm && req.method === 'POST') {
          const b = await readJson(req, 5_000);
          if (lm[2] === 'link') { const r = await linkPortalUser(db, user, Number(lm[1]), String(b.clientRec ?? ''), (rec) => resolvePortalClient(needAt(), rec)); json(res, r.status, r.error ? { error: r.error } : { ok: true }); return true; }
          const r = await makeSetupLink(db, user, Number(lm[1]), cfg.portalPublicUrl); json(res, r.status, r.error ? { error: r.error } : { ok: true, url: r.url, expires: r.expires }); return true;
        }
        if (p === '/hq/api/users' && req.method === 'POST') { const r = await addUser(db, user, await readJson(req, 5_000), (rec) => resolvePortalClient(needAt(), rec)); json(res, r.status, r.error ? { error: r.error } : { ok: true, id: r.id }); return true; }
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
        // ?day=yesterday|today|tomorrow (default today): what got handled / what is due now / what comes back.
        const day = url.searchParams.get('day') ?? 'today';
        if (!isNeedDay(day)) { json(res, 400, { error: 'day must be yesterday, today or tomorrow' }); return true; }
        json(res, 200, await loadNeedsDay(db, at, user, day));
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
      // Campaigns (Step 3): read only. Needs action first; pipeline, campaign page, Activity log. No money in it.
      if (p === '/hq/api/campaigns' && req.method === 'GET') {
        json(res, 200, await listCampaigns(needAt(), db, { client: url.searchParams.get('client') ?? undefined, refresh: url.searchParams.get('refresh') === '1' }));
        return true;
      }
      m = p.match(/^\/hq\/api\/campaigns\/(rec[A-Za-z0-9]{14})$/);
      if (m && req.method === 'GET') {
        const d = await campaignDetail(needAt(), db, m[1], owner, cfg.airtableBaseId);
        if (!d) json(res, 404, { error: 'no such campaign' }); else json(res, 200, d);
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

      // Content (Step 3, 2026-11-26): owner only (content is Alex-only; members get 403). One write: the idea decision.
      if (p === '/hq/api/content' || p.startsWith('/hq/api/content/')) {
        if (!owner) { json(res, 403, { error: 'only the owner sees content' }); return true; }
        if (p === '/hq/api/content' && req.method === 'GET') { json(res, 200, await contentView(needAt(), db, cfg.airtableBaseId, { refresh: url.searchParams.get('refresh') === '1' })); return true; }
        if (p === '/hq/api/content/summary' && req.method === 'GET') { json(res, 200, await contentSummary(needAt(), db, cfg.airtableBaseId)); return true; }
        const cm = p.match(/^\/hq\/api\/content\/ideas\/(rec[A-Za-z0-9]{14})$/);
        if (cm && req.method === 'POST') {
          const b = await readJson(req, 2_000);
          if (!['approve', 'reject'].includes(b.verdict)) { json(res, 400, { error: 'verdict must be approve or reject' }); return true; }
          const r = await decideIdea(needAt(), db, cm[1], b.verdict, user.name);
          json(res, r.status, r.error ? { error: r.error } : { ok: true, ...r.result });
          return true;
        }
        json(res, 404, { error: 'not found' }); return true;
      }

      // Sales (Dulcy's own deals): owner only (money), checked here so members get 403.
      if (p === '/hq/api/sales' || p.startsWith('/hq/api/sales/')) {
        if (!owner) { json(res, 403, { error: 'only the owner sees sales (money)' }); return true; }
        const extras = { xero: sales.xero };
        // ---- Batch 4a: insights, capacity setting, contract draft (the only writes: Postgres, and one Contracts row on "Create") ----
        if (p === '/hq/api/sales/insights' && req.method === 'GET') {
          const now = Date.now();
          const { deals } = await allDeals(needAt(), db, url.searchParams.get('refresh') === '1', now, extras);
          json(res, 200, await insightsView(deals, db, sales, owner, { now, refresh: url.searchParams.get('refresh') === '1' }));
          return true;
        }
        if (p === '/hq/api/sales/settings' && req.method === 'POST') {
          json(res, 200, { settings: await saveCapacitySettings(db, await readJson(req, 2_000), user.name) });
          return true;
        }
        m = p.match(/^\/hq\/api\/sales\/(rec[A-Za-z0-9]{14})\/contract(\/create)?$/);
        if (m) {
          const now = Date.now();
          const { deals } = await allDeals(needAt(), db, false, now, extras);
          const deal = deals.find((d) => d.id === m![1] || d.salesRec === m![1] || d.agreements.some((a) => a.id === m![1]));
          if (!deal) { json(res, 404, { error: 'no such deal' }); return true; }
          if (!m[2] && req.method === 'GET') { json(res, 200, await draftForm(db, deal, nyDay(now))); return true; }
          if (!m[2] && req.method === 'POST') { const r = await saveDraft(db, deal, await readJson(req, 20_000), user.name, nyDay(now)); json(res, r.status, r.body); return true; }
          if (m[2] && req.method === 'POST') { const b = await readJson(req, 2_000); const r = await createInDulcySign(needAt(), db, deal, Number(b.draftId), user.name, nyDay(now)); json(res, r.status, r.body); return true; }
          json(res, 405, { error: 'method not allowed' }); return true;
        }
        // ---- end Batch 4a ----
        if (req.method !== 'GET') { json(res, 405, { error: 'method not allowed' }); return true; }
        if (p === '/hq/api/sales') {
          json(res, 200, await salesView(needAt(), db, owner, { days: Number(url.searchParams.get('days')) === 90 ? 90 : 30, refresh: url.searchParams.get('refresh') === '1', extras }));
          return true;
        }
        m = p.match(/^\/hq\/api\/sales\/(rec[A-Za-z0-9]{14})$/);
        if (m) {
          const d = await dealDetail(needAt(), db, m[1], owner, { extras });
          if (!d) json(res, 404, { error: 'no such deal' }); else json(res, 200, d);
          return true;
        }
        json(res, 404, { error: 'not found' }); return true;
      }

      if (p === '/hq/api/agents' && req.method === 'GET') {
        const agents = await agentCards(db, at, user);
        json(res, 200, { agents, work: agents.map((a) => ({ agent: a.name, ...a.work })) });
        return true;
      }
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
const portalGoogleRedirect = (cfg: Config) => `https://${cfg.portalHost}/hq/api/auth/google/callback`;

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
  const work = workSummary(tasks, visible);
  return visible.map((a) => {
    const w = work.find((x) => x.agent === a)!;
    return {
      ...AGENTS[a], status: check.find((c) => c.agent === a), waiting: decisions.filter((d) => d.agent === a).length,
      openTasks: w.open, lastOk: health.get(a)?.lastOk ?? null, lastFail: health.get(a)?.lastFail ?? null,
      work: { open: w.open, inProgress: w.inProgress, waitingAlex: w.waitingAlex, overdue: w.overdue, stalled: w.stalled },
    };
  });
}

async function agentDetail(db: Db, at: HqAirtable | undefined, user: HqUser, a: AgentName) {
  const [runs, decisions, activity, tasks, recent, health] = await Promise.all([
    agentRuns(db, a, 10),
    at ? pendingDecisions(at).then((d) => d.filter((x) => x.agent === a)).catch(() => []) : Promise.resolve([]),
    at ? agentActivity(at, a, 10).catch(() => []) : Promise.resolve([]),
    agentTasks(db, a, true),
    reports(db, user.role === 'owner', a, 10),
    jobHealth(db),
  ]);
  return { agent: AGENTS[a], status: teamCheck(health, decisions, Date.now(), [a])[0], lastOk: health.get(a)?.lastOk ?? null, lastFail: health.get(a)?.lastFail ?? null, runs, decisions, activity, tasks, work: workSummary(tasks, [a])[0], reports: recent };
}

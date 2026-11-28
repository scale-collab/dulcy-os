// POST /hooks/<source>: providers tell the engine that work arrived, and the right agent starts at once
// (Alex 2026-11-28). Every request is checked first (per-source secret, or the provider's own signature);
// unsigned or wrong = 401, a source with no secret on the server = 404. The answer is fast: the handler
// only writes queue rows (coalesced, see trigger.ts) and a one-line log; the work runs in the worker.
// Sources and what they start: see EVENT MAP below and engine/GUIDE.md → "Agents start instantly (engine)".
import http from 'node:http';
import { createHmac, timingSafeEqual } from 'node:crypto';
import type { Db } from '../db/pool.js';
import type { Config, HookSource } from '../config.js';
import { HOOK_SOURCES } from '../config.js';
import { trigger, type TriggerSpec, type TriggerResult } from './trigger.js';
import { kick } from './kick.js';
import { accountHealthIsOn, bounceIsOn, campaignsAreOn, atlasTasksOn, coleIsOn, ledgerCheckIsOn, seanIsOn, wonSyncIsOn } from './jobs.js';
import { wantReactions } from '../decisions/loop.js';

const MAX_AGE_S = 5 * 60; // signed timestamps older than 5 minutes are refused (replay)

const eq = (a: string, b: string) => { const x = Buffer.from(a), y = Buffer.from(b); return x.length === y.length && timingSafeEqual(x, y); };
const h = (headers: http.IncomingHttpHeaders, name: string) => { const v = headers[name.toLowerCase()]; return Array.isArray(v) ? v[0] : v; };

/** Shared secret (EmailBison, n8n, Make, Airtable): header x-hook-secret. EmailBison cannot set headers, so it alone may put it in the URL (?key=). */
export function verifyShared(secret: string, headers: http.IncomingHttpHeaders, url: URL, allowQuery: boolean): string | null {
  const got = h(headers, 'x-hook-secret') ?? (allowQuery ? url.searchParams.get('key') ?? undefined : undefined);
  if (!got) return 'missing secret';
  return eq(got, secret) ? null : 'bad secret';
}

/** Slack: X-Slack-Signature = "v0=" + hex HMAC-SHA256(signing secret, "v0:" + X-Slack-Request-Timestamp + ":" + raw body). */
export function verifySlack(secret: string, headers: http.IncomingHttpHeaders, body: string, nowMs = Date.now()): string | null {
  const ts = h(headers, 'x-slack-request-timestamp'), sig = h(headers, 'x-slack-signature');
  if (!ts || !sig) return 'missing signature';
  if (!/^\d+$/.test(ts) || Math.abs(nowMs / 1000 - Number(ts)) > MAX_AGE_S) return 'stale or invalid timestamp';
  const want = 'v0=' + createHmac('sha256', secret).update(`v0:${ts}:${body}`).digest('hex');
  return eq(sig, want) ? null : 'bad signature';
}

/**
 * Fathom (Standard Webhooks): webhook-id, webhook-timestamp (seconds), webhook-signature = space-separated "v1,<base64>",
 * each a HMAC-SHA256 of "<id>.<timestamp>.<raw body>" keyed with the base64 part of the whsec_ secret.
 */
export function verifyStandardWebhook(secret: string, headers: http.IncomingHttpHeaders, body: string, nowMs = Date.now()): string | null {
  const id = h(headers, 'webhook-id'), ts = h(headers, 'webhook-timestamp'), sigs = h(headers, 'webhook-signature');
  if (!id || !ts || !sigs) return 'missing signature';
  if (!/^\d+$/.test(ts) || Math.abs(nowMs / 1000 - Number(ts)) > MAX_AGE_S) return 'stale or invalid timestamp';
  const key = Buffer.from(secret.replace(/^whsec_/, ''), 'base64');
  const want = createHmac('sha256', key).update(`${id}.${ts}.${body}`).digest('base64');
  return sigs.split(' ').some((p) => { const [v, s] = p.split(','); return v === 'v1' && !!s && eq(s, want); }) ? null : 'bad signature';
}

/** Close: close-sig-hash = hex HMAC-SHA256(bytes of the hex signature_key, close-sig-timestamp + raw body). */
export function verifyClose(secret: string, headers: http.IncomingHttpHeaders, body: string, nowMs = Date.now()): string | null {
  const ts = h(headers, 'close-sig-timestamp'), sig = h(headers, 'close-sig-hash');
  if (!ts || !sig) return 'missing signature';
  if (!/^\d+$/.test(ts) || Math.abs(nowMs / 1000 - Number(ts)) > MAX_AGE_S) return 'stale or invalid timestamp';
  if (!/^[0-9a-f]+$/i.test(secret) || secret.length % 2) return 'bad signature';
  const want = createHmac('sha256', Buffer.from(secret, 'hex')).update(ts + body).digest('hex');
  return eq(sig.toLowerCase(), want) ? null : 'bad signature';
}

export function verifyHook(source: HookSource, secret: string, headers: http.IncomingHttpHeaders, url: URL, body: string, nowMs = Date.now()): string | null {
  if (source === 'slack') return verifySlack(secret, headers, body, nowMs);
  if (source === 'fathom') return verifyStandardWebhook(secret, headers, body, nowMs);
  if (source === 'close') return verifyClose(secret, headers, body, nowMs);
  return verifyShared(secret, headers, url, source === 'emailbison');
}

export interface Routed {
  event: string;
  eventId?: string;
  jobs: TriggerSpec[];
  kicks: string[];
  info?: Record<string, unknown>;
  /** A body to answer with instead of the usual one (Slack's URL check). */
  reply?: unknown;
  ignored?: string;
}

const str = (v: unknown) => (v === undefined || v === null ? '' : String(v)).trim();
const YES_NO = new Set(['white_check_mark', 'heavy_check_mark', 'ballot_box_with_check', '+1', 'x', 'negative_squared_cross_mark', 'no_entry', 'no_entry_sign', '-1']);

// ---- EVENT MAP: what each event starts (jobs are only listed when that agent is switched on) ----
function echoJobs(cfg: Config, reason: string): TriggerSpec[] {
  if (!seanIsOn(cfg)) return [];
  return [{ kind: 'sean.draft', recordId: 'sean', reason }, ...(cfg.seanFollowupsOn ? [{ kind: 'sean.followup', recordId: 'sean-followup', reason }] : [])];
}
function campaignJobs(cfg: Config, reason: string): TriggerSpec[] {
  return [...(campaignsAreOn(cfg) ? [{ kind: 'campaign.pipeline', recordId: 'campaign-pipeline', reason }] : []), ...(atlasTasksOn(cfg) ? [{ kind: 'atlas.tasks', recordId: 'atlas-tasks', reason }] : [])];
}
const healthJobs = (cfg: Config, reason: string): TriggerSpec[] => (accountHealthIsOn(cfg) ? [{ kind: 'account.health', recordId: 'account-health', reason }] : []);
const rileyJobs = (cfg: Config, reason: string): TriggerSpec[] => (cfg.rileyOn ? [{ kind: 'riley.collect', recordId: 'riley-collect', reason }] : []);

/** The bounce check for the workspace a bounce came from (only that one; with BOUNCE_CHECK_WORKSPACES=all, by its team id). */
export function bounceJobs(cfg: Config, teamId: number, name: string, reason: string): TriggerSpec[] {
  if (!bounceIsOn(cfg)) return [];
  const ws = cfg.bounceCheckWorkspaces;
  if (ws.includes('all')) return [teamId > 0
    ? { kind: 'bounce.check', recordId: `bounce:all:${teamId}`, input: { workspace: 'all', onlyTeamId: teamId, readSkipList: true }, reason }
    : { kind: 'bounce.check', recordId: 'bounce:all', input: { workspace: 'all', readSkipList: true }, reason }];
  const hit = ws.find((w) => w === name.toLowerCase());
  return hit ? [{ kind: 'bounce.check', recordId: `bounce:${hit}`, input: { workspace: hit, readSkipList: true }, reason }] : [];
}

export function routeEvent(source: HookSource, body: any, headers: http.IncomingHttpHeaders, cfg: Config): Routed {
  const b = body && typeof body === 'object' ? body : {};
  if (source === 'emailbison') {
    // { event: { type: "LEAD_REPLIED", workspace_id, workspace_name }, data: {...} }
    const type = str(b.event?.type ?? b.event_type ?? b.type).toLowerCase();
    const why = `EmailBison ${type} (${str(b.event?.workspace_name) || 'workspace ?'})`;
    if (['lead_replied', 'lead_interested', 'untracked_reply_received'].includes(type)) return { event: type, jobs: echoJobs(cfg, why), kicks: [] };
    if (type === 'email_bounced') return { event: type, jobs: bounceJobs(cfg, Number(b.event?.workspace_id) || 0, str(b.event?.workspace_name), why), kicks: [] };
    if (type === 'manual_email_sent') return { event: type, jobs: seanIsOn(cfg) && cfg.seanFollowupsOn ? [{ kind: 'sean.followup', recordId: 'sean-followup', reason: why }] : [], kicks: [] };
    return { event: type || 'unknown', jobs: [], kicks: [], ignored: 'event not used' };
  }
  if (source === 'n8n' || source === 'make') {
    const ev = str(b.event).toLowerCase();
    const why = `${source} ${ev}`;
    if (ev === 'reply' && source === 'n8n') return { event: ev, jobs: echoJobs(cfg, why), kicks: [] };
    if (ev === 'placement_results' && source === 'n8n') return { event: ev, jobs: healthJobs(cfg, why), kicks: [] };
    // n8n already receives EmailBison's bounce and sent webhooks for every workspace (Bounce Data Tracker, Manual Emails Sent).
    if (ev === 'bounce' && source === 'n8n') return { event: ev, jobs: bounceJobs(cfg, Number(b.workspace_id) || 0, str(b.workspace_name), `${why} (${str(b.workspace_name) || 'workspace ?'})`), kicks: [] };
    if (ev === 'sent' && source === 'n8n') return { event: ev, jobs: seanIsOn(cfg) && cfg.seanFollowupsOn ? [{ kind: 'sean.followup', recordId: 'sean-followup', reason: why }] : [], kicks: [] };
    if (ev === 'error') {
      // Kept short: where it broke and the message (Riley's System Issues row is written by riley.collect).
      const info = { where: str(b.workflow ?? b.scenario ?? b.where).slice(0, 200), error: str(b.error ?? b.message).slice(0, 1000), url: str(b.executionUrl ?? b.url).slice(0, 300), execution: str(b.execution ?? b.executionId).slice(0, 60) };
      return { event: ev, eventId: info.execution ? `${ev}:${info.execution}` : undefined, jobs: rileyJobs(cfg, `${why}: ${info.where}`), kicks: [], info };
    }
    return { event: ev || 'unknown', jobs: [], kicks: [], ignored: 'event not used' };
  }
  if (source === 'airtable') {
    const ev = str(b.event).toLowerCase();
    const why = `Airtable ${ev}${b.recordId ? ` ${str(b.recordId).slice(0, 20)}` : ''}`;
    if (ev === 'engine_action') return { event: ev, jobs: [], kicks: ['airtable.bridge'] };
    if (ev === 'decision' || ev === 'reply_action') return { event: ev, jobs: [], kicks: ['decisions.loop'] };
    if (ev === 'idea_approved') return { event: ev, jobs: cfg.siennaOn ? [{ kind: 'sienna.prep', recordId: 'sienna-prep', reason: why }] : [], kicks: [] };
    if (ev === 'campaign_changed' || ev === 'client_review') return { event: ev, jobs: campaignJobs(cfg, why), kicks: [] };
    if (ev === 'placement_results') return { event: ev, jobs: healthJobs(cfg, why), kicks: [] };
    if (ev === 'reply') return { event: ev, jobs: echoJobs(cfg, why), kicks: [] };
    return { event: ev || 'unknown', jobs: [], kicks: [], ignored: 'event not used' };
  }
  if (source === 'fathom') {
    // "New meeting content ready": Cole reviews the new sales call now.
    return { event: 'meeting_content_ready', eventId: str(h(headers, 'webhook-id')) || undefined, jobs: coleIsOn(cfg) ? [{ kind: 'cole.review', recordId: 'cole-review', reason: 'Fathom new meeting content' }] : [], kicks: [] };
  }
  if (source === 'close') {
    const e = b.event ?? {};
    const type = `${str(e.object_type)}.${str(e.action)}`;
    const changed: string[] = Array.isArray(e.changed_fields) ? e.changed_fields.map(String) : [];
    const statusMove = str(e.object_type) === 'opportunity' && (str(e.action) === 'created' || !changed.length || changed.some((f) => /status/.test(f)));
    return { event: type, eventId: str(e.id) || undefined, jobs: statusMove && wonSyncIsOn(cfg) ? [{ kind: 'sales.won_sync', recordId: 'sales-won_sync', reason: `Close ${type}` }] : [], kicks: [], ...(statusMove ? {} : { ignored: 'not an opportunity status change' }) };
  }
  // Slack Events API.
  if (b.type === 'url_verification') return { event: 'url_verification', jobs: [], kicks: [], reply: { challenge: str(b.challenge) } };
  const e = b.event ?? {};
  const eventId = str(b.event_id) || undefined;
  if (b.type === 'event_callback' && e.type === 'reaction_added') {
    if (!YES_NO.has(str(e.reaction).replace(/::skin-tone-\d$/, '')) || !cfg.slackApprovers.includes(str(e.user))) return { event: 'reaction_added', eventId, jobs: [], kicks: [], ignored: 'not an approver ✅/❌' };
    if (e.item?.ts) wantReactions(str(e.item.ts));
    return { event: 'reaction_added', eventId, jobs: [], kicks: ['decisions.loop'] };
  }
  if (b.type === 'event_callback' && e.type === 'message') {
    const mine = str(e.channel) === cfg.ledgerCheckChannel && !e.bot_id && !e.subtype && cfg.slackApprovers.includes(str(e.user));
    return { event: 'message', eventId, jobs: mine && ledgerCheckIsOn(cfg) ? [{ kind: 'ledger.check', recordId: 'ledger-check', reason: 'Slack question in the check channel' }] : [], kicks: [], ...(mine ? {} : { ignored: 'not a question in the check channel' }) };
  }
  return { event: str(e.type || b.type) || 'unknown', eventId, jobs: [], kicks: [], ignored: 'event not used' };
}

async function readRaw(req: http.IncomingMessage, limit = 1_000_000): Promise<string> {
  const chunks: Buffer[] = []; let size = 0;
  for await (const c of req) { size += (c as Buffer).length; if (size > limit) throw Object.assign(new Error('body too large'), { status: 413 }); chunks.push(c as Buffer); }
  return Buffer.concat(chunks).toString('utf8');
}
function send(res: http.ServerResponse, status: number, body: unknown) {
  res.writeHead(status, { 'content-type': 'application/json', 'cache-control': 'no-store' });
  res.end(JSON.stringify(body));
}

/** Handle POST /hooks/<source>. Returns false for any other path. */
export async function handleHook(db: Db, cfg: Config, req: http.IncomingMessage, res: http.ServerResponse, url: URL): Promise<boolean> {
  const m = url.pathname.match(/^\/hooks\/([a-z0-9]+)\/?$/);
  if (!m) return false;
  const source = m[1] as HookSource;
  const secret = (HOOK_SOURCES as readonly string[]).includes(source) ? cfg.hookSecrets?.[source] : undefined;
  if (!secret) { send(res, 404, { error: 'not found' }); return true; }
  if (req.method !== 'POST') { send(res, 405, { error: 'POST only' }); return true; }
  let raw: string;
  try { raw = await readRaw(req); } catch (e) { send(res, (e as any).status ?? 400, { error: String((e as Error).message) }); return true; }
  const bad = verifyHook(source, secret, req.headers, url, raw);
  if (bad) { console.error(JSON.stringify({ level: 'warn', message: 'hook refused', source, why: bad })); send(res, 401, { error: bad }); return true; }
  let body: unknown = {};
  if (raw.trim()) { try { body = JSON.parse(raw); } catch { send(res, 400, { error: 'invalid JSON' }); return true; } }
  const r = routeEvent(source, body, req.headers, cfg);
  if (r.reply) { send(res, 200, r.reply); return true; }
  // A provider retry of the same event (same event id) starts nothing twice.
  const kinds = [...r.jobs.map((j) => j.kind), ...r.kicks.map((k) => `kick:${k}`)];
  const ins = await db.query(`INSERT INTO hook_events (source, event, event_id, jobs, info) VALUES ($1,$2,$3,$4,$5) ON CONFLICT DO NOTHING RETURNING id`,
    [source, r.event.slice(0, 80), r.eventId ?? null, kinds, r.info ?? {}]);
  if (!ins.rows[0]) { send(res, 200, { ok: true, duplicate: true }); return true; }
  const started: { kind: string; result: TriggerResult }[] = [];
  for (const j of r.jobs) started.push({ kind: j.kind, result: await trigger(db, cfg, j) });
  send(res, 200, { ok: true, event: r.event, jobs: started, kicks: r.kicks, ...(r.ignored ? { ignored: r.ignored } : {}) });
  // In-process loops run after the answer (never inside the request).
  for (const k of r.kicks) void kick(k);
  if (started.length || r.kicks.length) console.log(JSON.stringify({ level: 'info', message: 'hook', source, event: r.event, jobs: started, kicks: r.kicks }));
  return true;
}

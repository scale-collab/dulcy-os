// Agents start instantly (Alex 2026-11-28: "I don't want any agents to run on schedules; it should be
// like an instant webhook"). When an agent has work, the engine starts that agent's Claude Code
// routine through its API trigger:
//   POST <AGENT>_FIRE_URL  (https://api.anthropic.com/v1/claude_code/routines/<id>/fire)
//   Authorization: Bearer <AGENT>_FIRE_TOKEN, anthropic-version: 2023-06-01, body {"text": "..."}
// Each successful call opens a NEW session (the API has no idempotency key), so this module:
//   - sends at most one start per agent per 2 minutes: reasons that come in meanwhile wait in
//     agent_fire_pending and go out together in ONE start when the window ends (a 15-second sweep
//     sends them; the queue is in Postgres, so it survives a restart);
//   - never sends twice for one start: a timeout or a dropped connection is "uncertain" and is not
//     re-sent (the session may exist); only 5xx answers (no session made) are retried, 3 times;
//   - respects 429 Retry-After and caps itself at 20 starts per hour per agent (the API allows 30);
//   - records every start (time, reasons, session link) for HQ Team → the agent's page.
// The token is only read from the config and put in the Authorization header: it is never logged,
// stored, returned or shown. Without <AGENT>_FIRE_URL/_TOKEN nothing happens (logged once).
import type { Db } from '../db/pool.js';
import type { Config } from '../config.js';

export const FIRE_WINDOW_MS = 2 * 60_000;
export const FIRE_MAX_PER_HOUR = 20;
export const FIRE_MAX_TEXT = 65_536;
const LEASE_MS = 5 * 60_000;           // a start being sent holds the agent this long at most (4 tries × 30 s fit)
const PAUSE_AFTER_5XX_MS = 5 * 60_000;  // after 3 failed retries, wait before trying again
const PENDING_MAX_AGE_MS = 24 * 3_600_000;
const RETRIES_5XX = 3;
const TAG = 'routine-fire-payload';

/** The runbook each routine follows (the routine's saved prompt points to the same file). */
export const AGENT_RUNBOOK: Record<string, string> = { Riley: 'agents/riley-session.md', Sienna: 'agents/sienna-editor.md' };

/** What the module uses from the outside world; tests swap these. */
export const fireRuntime = {
  fetch: ((...a: Parameters<typeof fetch>) => fetch(...a)) as typeof fetch,
  now: () => new Date(),
  sleep: (ms: number) => new Promise<void>((r) => setTimeout(r, ms)),
  log: (line: Record<string, unknown>) => console.log(JSON.stringify(line)),
};

const warned = new Set<string>();
/** Forget the "not set" warnings (tests). */
export function resetFireWarnings(): void { warned.clear(); }

/** 'riley' / 'RILEY' / 'Riley' → 'Riley'. */
export const agentKey = (a: string) => { const s = String(a ?? '').trim(); return s ? s[0].toUpperCase() + s.slice(1).toLowerCase() : ''; };

export type FireResult =
  | { status: 'off' }
  | { status: 'idle' }
  | { status: 'queued'; dueAt: string; why: string }
  | { status: 'started'; fireId: number; sessionUrl: string }
  | { status: 'uncertain' | 'failed' | 'waiting'; fireId: number; error: string };

const runs = new Set<Promise<unknown>>();
/** Wait for every start sent in the background (tests, shutdown). */
export async function settleFires(): Promise<void> { while (runs.size) await Promise.allSettled([...runs]); }

function track<T>(p: Promise<T>): Promise<T> { runs.add(p); void p.finally(() => runs.delete(p)).catch(() => undefined); return p; }

/** Is this agent's routine trigger set up? Logs "<AGENT>_FIRE_URL not set" once per agent when not. */
export function fireConfigured(cfg: Pick<Config, 'agentFire'>, agent: string): boolean {
  const a = agentKey(agent);
  if (cfg.agentFire?.[a]) return true;
  if (a && !warned.has(a)) {
    warned.add(a);
    fireRuntime.log({ level: 'info', message: `${a.toUpperCase()}_FIRE_URL not set: ${a} runs only when started by hand` });
  }
  return false;
}

/**
 * Queue one reason for `agent` and start its routine now (or, inside the 2-minute window, with the
 * next start). Never throws: a problem is logged and returned. `details` says what to do.
 */
export async function fireAgent(db: Db, cfg: Pick<Config, 'agentFire'>, agent: string, reason: string, details = '', dedupeKey?: string): Promise<FireResult> {
  const a = agentKey(agent);
  if (!fireConfigured(cfg, a)) return { status: 'off' };
  try {
    // The same event reported twice (e.g. a card approved in HQ, then seen by the Slack loop) is one reason.
    const ins = await db.query(`INSERT INTO agent_fire_pending (agent, reason, details, dedupe_key, created_at) VALUES ($1, $2, $3, $4, $5) ON CONFLICT DO NOTHING`,
      [a, oneLine(reason, 400) || 'New work', String(details ?? '').trim().slice(0, 4000), dedupeKey ? oneLine(dedupeKey, 200) : null, fireRuntime.now()]);
    if (!ins.rowCount) return { status: 'idle' };
    return await flushAgent(db, cfg, a);
  } catch (e) {
    fireRuntime.log({ level: 'error', message: 'agent start failed', agent: a, err: scrub(String((e as Error).message ?? e), cfg, a) });
    return { status: 'failed', fireId: 0, error: 'could not queue the start' };
  }
}

/** The same, without waiting for the HTTP call (HQ requests): the reason is saved first. */
export function fireAgentSoon(db: Db, cfg: Pick<Config, 'agentFire'>, agent: string, reason: string, details = '', dedupeKey?: string): void {
  if (!fireConfigured(cfg, agent)) return;
  void track(fireAgent(db, cfg, agent, reason, details, dedupeKey));
}

const oneLine = (x: unknown, max: number) => String(x ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
/** Belt and braces: no error text we keep or log can carry the token. */
function scrub(s: string, cfg: Pick<Config, 'agentFire'>, agent: string): string {
  const t = cfg.agentFire?.[agent]?.token;
  let out = String(s ?? '');
  if (t) out = out.split(t).join('[token]');
  return out.replace(/Bearer\s+\S+/gi, 'Bearer [token]').slice(0, 500);
}

/** The text the routine gets: what happened, item by item, inside one <routine-fire-payload> block. */
export function fireText(agent: string, items: { reason: string; details: string }[], at: Date): string {
  const runbook = AGENT_RUNBOOK[agent] ?? `your runbook`;
  const head = `Instant run for ${agent}, started by the Dulcy engine at ${at.toISOString()} (${items.length} item${items.length === 1 ? '' : 's'}).\n<${TAG}>\n`;
  const foot = `</${TAG}>\nHandle the items above first (${runbook}: "If a <${TAG}> block is present"), then the rest of the runbook. Approval rules are unchanged.`;
  const safe = (s: string) => s.replace(new RegExp(`</?${TAG}>`, 'gi'), '[payload tag]');
  let body = '';
  for (const [i, x] of items.entries()) {
    const d = safe(String(x.details ?? '').trim().slice(0, 3000));
    const part = `${i + 1}. ${safe(x.reason)}${d ? `\n${d.split('\n').map((l) => `   ${l}`).join('\n')}` : ''}\n`;
    if (head.length + body.length + part.length + foot.length > FIRE_MAX_TEXT - 200) { body += `… and ${items.length - i} more (see HQ).\n`; break; }
    body += part;
  }
  return (head + body + foot).slice(0, FIRE_MAX_TEXT);
}

/** Seconds or an HTTP date → milliseconds to wait (default 60 s, at most 1 hour). */
export function retryAfterMs(h: string | null, now: Date): number {
  const v = String(h ?? '').trim();
  let ms = 60_000;
  if (/^\d+(\.\d+)?$/.test(v)) ms = Number(v) * 1000;
  else if (v && !Number.isNaN(Date.parse(v))) ms = Date.parse(v) - now.getTime();
  return Math.min(3_600_000, Math.max(1_000, ms));
}

const ERRORS: Record<number, string> = {
  400: 'the routine refused the start (paused, or the request was not accepted)',
  401: 'the routine token was refused: save it again on the server',
  403: 'the token has no access to this routine',
  404: 'routine not found: check the fire URL',
};

/**
 * Send this agent's waiting reasons as ONE start if the agent may be started now; otherwise leave
 * them waiting and say when. Safe to call from several places at once (row lock + lease).
 */
export async function flushAgent(db: Db, cfg: Pick<Config, 'agentFire'>, agent: string): Promise<FireResult> {
  const a = agentKey(agent);
  const target = cfg.agentFire?.[a];
  if (!target) return { status: 'off' };
  const now = fireRuntime.now();
  const c = await db.connect();
  let fireId = 0; let items: { id: number; reason: string; details: string }[] = [];
  try {
    await c.query('BEGIN');
    await c.query(`INSERT INTO agent_fire_state (agent) VALUES ($1) ON CONFLICT (agent) DO NOTHING`, [a]);
    const st = (await c.query(`SELECT last_fire_at, blocked_until, in_flight_until FROM agent_fire_state WHERE agent=$1 FOR UPDATE`, [a])).rows[0];
    const inFlight = st.in_flight_until ? new Date(st.in_flight_until) : null;
    if (inFlight && inFlight > now) { await c.query('COMMIT'); return { status: 'queued', dueAt: inFlight.toISOString(), why: 'a start is being sent' }; }
    // A start still "sending" after its lease: the engine stopped mid-call. It may have gone out,
    // so it is never re-sent; its reasons stay with it.
    await c.query(`UPDATE agent_fires SET status='uncertain', error='the engine stopped while sending; not sent again so it cannot start twice', finished_at=$2 WHERE agent=$1 AND status='sending'`, [a, now]);
    await c.query(`DELETE FROM agent_fire_pending WHERE agent=$1 AND fire_id IS NULL AND created_at < $2`, [a, new Date(now.getTime() - PENDING_MAX_AGE_MS)]);
    items = (await c.query(`SELECT id, reason, details FROM agent_fire_pending WHERE agent=$1 AND fire_id IS NULL ORDER BY id LIMIT 50`, [a])).rows.map((r) => ({ id: Number(r.id), reason: String(r.reason), details: String(r.details ?? '') }));
    if (!items.length) { await c.query('COMMIT'); return { status: 'idle' }; }
    const waits: [number, string][] = [];
    if (st.last_fire_at) waits.push([new Date(st.last_fire_at).getTime() + FIRE_WINDOW_MS, 'started less than 2 minutes ago']);
    if (st.blocked_until) waits.push([new Date(st.blocked_until).getTime(), 'the routine asked to wait (429) or had errors']);
    const hour = (await c.query(`SELECT created_at FROM agent_fires WHERE agent=$1 AND status IN ('sending','started','uncertain') AND created_at > $2 ORDER BY created_at DESC LIMIT $3`,
      [a, new Date(now.getTime() - 3_600_000), FIRE_MAX_PER_HOUR])).rows;
    if (hour.length >= FIRE_MAX_PER_HOUR) waits.push([new Date(hour[hour.length - 1].created_at).getTime() + 3_600_000, `${FIRE_MAX_PER_HOUR} starts in the last hour`]);
    const [due, why] = waits.sort((x, y) => y[0] - x[0])[0] ?? [0, ''];
    if (due > now.getTime()) { await c.query('COMMIT'); return { status: 'queued', dueAt: new Date(due).toISOString(), why }; }
    fireId = Number((await c.query(`INSERT INTO agent_fires (agent, status, reasons, created_at) VALUES ($1, 'sending', $2, $3) RETURNING id`,
      [a, JSON.stringify(items.map((x) => x.reason)), now])).rows[0].id);
    await c.query(`UPDATE agent_fire_pending SET fire_id=$1 WHERE id = ANY($2::bigint[])`, [fireId, items.map((x) => x.id)]);
    await c.query(`UPDATE agent_fire_state SET last_fire_at=$2, in_flight_until=$3 WHERE agent=$1`, [a, now, new Date(now.getTime() + LEASE_MS)]);
    await c.query('COMMIT');
  } catch (e) {
    await c.query('ROLLBACK').catch(() => undefined);
    throw e;
  } finally { c.release(); }
  return send(db, cfg, a, target, fireId, items, now);
}

async function send(db: Db, cfg: Pick<Config, 'agentFire'>, a: string, target: { url: string; token: string }, fireId: number, items: { id: number; reason: string; details: string }[], at: Date): Promise<FireResult> {
  const body = JSON.stringify({ text: fireText(a, items, at) });
  const finish = async (status: string, f: { http?: number; attempts: number; error?: string; sessionId?: string; sessionUrl?: string; release?: boolean; blockedUntil?: Date }) => {
    await db.query(`UPDATE agent_fires SET status=$2, http_status=$3, attempts=$4, error=$5, session_id=$6, session_url=$7, finished_at=$8 WHERE id=$1`,
      [fireId, status, f.http ?? null, f.attempts, scrub(f.error ?? '', cfg, a), f.sessionId ?? '', f.sessionUrl ?? '', fireRuntime.now()]);
    // Not started (429 / 5xx): the reasons wait for the next start.
    if (f.release) await db.query(`UPDATE agent_fire_pending SET fire_id=NULL WHERE fire_id=$1`, [fireId]);
    await db.query(`UPDATE agent_fire_state SET in_flight_until=NULL${f.blockedUntil ? ', blocked_until=$2' : ''} WHERE agent=$1`, f.blockedUntil ? [a, f.blockedUntil] : [a]);
  };
  for (let attempt = 1; ; attempt++) {
    let res: Response;
    try {
      res = await fireRuntime.fetch(target.url, {
        method: 'POST',
        headers: { authorization: `Bearer ${target.token}`, 'anthropic-version': '2023-06-01', 'anthropic-beta': 'experimental-cc-routine-2026-04-01', 'content-type': 'application/json' },
        body, signal: AbortSignal.timeout(30_000),
      });
    } catch (e) {
      // No answer: the start may have gone through. Never send it again (that could open a second session).
      const error = `no answer from the routine API (${oneLine((e as Error).name === 'TimeoutError' ? 'timeout' : (e as Error).message, 120)}); not sent again so it cannot start twice`;
      await finish('uncertain', { attempts: attempt, error });
      fireRuntime.log({ level: 'warn', message: 'agent start uncertain', agent: a, fireId, err: scrub(error, cfg, a) });
      return { status: 'uncertain', fireId, error };
    }
    if (res.ok) {
      let j: any = {}; try { j = await res.json(); } catch { j = {}; }
      const sessionUrl = /^https:\/\/[^\s"'<>]+$/.test(String(j?.claude_code_session_url ?? '')) ? String(j.claude_code_session_url) : '';
      const sessionId = oneLine(j?.claude_code_session_id, 120);
      await finish('started', { http: res.status, attempts: attempt, sessionId, sessionUrl });
      fireRuntime.log({ level: 'info', message: 'agent started', agent: a, fireId, reasons: items.length, session: sessionUrl });
      return { status: 'started', fireId, sessionUrl };
    }
    const text = scrub(await res.text().catch(() => ''), cfg, a);
    if (res.status === 429) {
      const wait = retryAfterMs(res.headers.get('retry-after'), fireRuntime.now());
      const error = `rate limited (429): waiting ${Math.round(wait / 1000)} s`;
      await finish('waiting', { http: 429, attempts: attempt, error, release: true, blockedUntil: new Date(fireRuntime.now().getTime() + wait) });
      fireRuntime.log({ level: 'warn', message: 'agent start rate limited', agent: a, fireId, waitSeconds: Math.round(wait / 1000) });
      return { status: 'waiting', fireId, error };
    }
    if (res.status >= 500 && attempt <= RETRIES_5XX) { await fireRuntime.sleep(1000 * 2 ** (attempt - 1)); continue; }
    if (res.status >= 500) {
      const error = `routine API error ${res.status} after ${attempt} tries; trying again in 5 minutes`;
      await finish('failed', { http: res.status, attempts: attempt, error, release: true, blockedUntil: new Date(fireRuntime.now().getTime() + PAUSE_AFTER_5XX_MS) });
      fireRuntime.log({ level: 'error', message: 'agent start failed', agent: a, fireId, status: res.status });
      return { status: 'failed', fireId, error };
    }
    const error = `${ERRORS[res.status] ?? `refused (${res.status})`}${text ? `: ${oneLine(text, 200)}` : ''}`;
    await finish('failed', { http: res.status, attempts: attempt, error });
    fireRuntime.log({ level: 'error', message: 'agent start refused', agent: a, fireId, status: res.status, err: error });
    return { status: 'failed', fireId, error };
  }
}

/** Every 15 s: send the reasons whose 2-minute window (or 429 wait) has ended. Off when no agent is set up. */
export function startAgentFires(db: Db, cfg: Pick<Config, 'agentFire'>, signal: AbortSignal): void {
  const agents = Object.keys(cfg.agentFire ?? {});
  for (const a of Object.keys(AGENT_RUNBOOK)) fireConfigured(cfg, a);
  if (!agents.length) return;
  let busy = false;
  const tick = async () => {
    if (busy) return; busy = true;
    try {
      const due = (await db.query(`SELECT DISTINCT agent FROM agent_fire_pending WHERE fire_id IS NULL`)).rows.map((r) => String(r.agent)).filter((x) => agents.includes(x));
      for (const a of due) await track(flushAgent(db, cfg, a));
    } catch (e) {
      fireRuntime.log({ level: 'error', message: 'agent start sweep failed', err: String((e as Error).message ?? e).slice(0, 300) });
    } finally { busy = false; }
  };
  void tick();
  const t = setInterval(() => { void tick(); }, 15_000);
  signal.addEventListener('abort', () => clearInterval(t));
}

export interface FireRow { id: number; at: string; status: string; reasons: string[]; sessionUrl: string; error: string; waiting?: boolean }

/** The last starts of one agent (newest first) plus reasons still waiting, for HQ Team → the agent's page. */
export async function recentFires(db: Db, cfg: Pick<Config, 'agentFire'>, agent: string, limit = 5): Promise<{ configured: boolean; fires: FireRow[]; waiting: string[] }> {
  const a = agentKey(agent);
  const fires = (await db.query(`SELECT id, status, reasons, session_url, error, created_at FROM agent_fires WHERE agent=$1 ORDER BY id DESC LIMIT $2`, [a, limit])).rows
    .map((r) => ({ id: Number(r.id), at: new Date(r.created_at).toISOString(), status: String(r.status), reasons: (Array.isArray(r.reasons) ? r.reasons : []).map(String).slice(0, 10), sessionUrl: String(r.session_url ?? ''), error: String(r.error ?? '') }));
  const waiting = (await db.query(`SELECT reason FROM agent_fire_pending WHERE agent=$1 AND fire_id IS NULL ORDER BY id LIMIT 10`, [a])).rows.map((r) => String(r.reason));
  return { configured: !!cfg.agentFire?.[a], fires, waiting };
}

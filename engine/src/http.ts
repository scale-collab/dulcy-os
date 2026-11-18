import http from 'node:http';
import { createHmac, timingSafeEqual } from 'node:crypto';
import type { Db } from './db/pool.js';
import type { Config } from './config.js';
import { enqueue, getJob } from './queue.js';
import { STAGES } from './stages/index.js';

/**
 * Requests are signed: header `x-dulcy-timestamp` (ms since epoch) and
 * `x-dulcy-signature` = hex HMAC-SHA256 of `${timestamp}.${rawBody}` with ENGINE_SECRET.
 * Old timestamps are rejected so a captured request can't be replayed.
 */
export function sign(secret: string, timestamp: string, body: string): string {
  return createHmac('sha256', secret).update(`${timestamp}.${body}`).digest('hex');
}

export function verifySignature(cfg: Config, timestamp: string | undefined, signature: string | undefined, body: string, now = Date.now()): string | null {
  if (!timestamp || !signature) return 'missing signature';
  const ts = Number(timestamp);
  if (!Number.isFinite(ts) || Math.abs(now - ts) > cfg.maxRequestAgeMs) return 'stale or invalid timestamp';
  const expected = Buffer.from(sign(cfg.engineSecret, timestamp, body), 'hex');
  const got = Buffer.from(signature, 'hex');
  if (got.length !== expected.length || !timingSafeEqual(got, expected)) return 'bad signature';
  return null;
}

function send(res: http.ServerResponse, status: number, body: unknown) {
  res.writeHead(status, { 'content-type': 'application/json' });
  res.end(JSON.stringify(body));
}

async function readBody(req: http.IncomingMessage, limit = 10_000_000): Promise<string> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const c of req) {
    size += (c as Buffer).length;
    if (size > limit) throw new Error('body too large');
    chunks.push(c as Buffer);
  }
  return Buffer.concat(chunks).toString('utf8');
}

export function createServer(db: Db, cfg: Config) {
  return http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url ?? '/', 'http://local');
      if (req.method === 'GET' && url.pathname === '/health') {
        await db.query('SELECT 1');
        return send(res, 200, { ok: true, dryRun: cfg.dryRun });
      }

      // Everything else needs a valid signature (GETs sign an empty body).
      const body = req.method === 'POST' ? await readBody(req) : '';
      const err = verifySignature(cfg, req.headers['x-dulcy-timestamp'] as string, req.headers['x-dulcy-signature'] as string, body);
      if (err) return send(res, 401, { error: err });

      if (req.method === 'POST' && url.pathname === '/jobs') {
        let p: { kind?: string; recordId?: string; clientId?: string; input?: Record<string, unknown>; requestId?: string };
        try { p = JSON.parse(body); } catch { return send(res, 400, { error: 'invalid JSON' }); }
        if (!p.kind || !STAGES[p.kind]) return send(res, 400, { error: `unknown kind; known: ${Object.keys(STAGES).join(', ')}` });
        if (!p.recordId || !/^rec[A-Za-z0-9]{14}$/.test(p.recordId)) return send(res, 400, { error: 'recordId must be an Airtable record id' });
        const def = STAGES[p.kind];
        const r = await enqueue(db, {
          kind: p.kind, recordId: p.recordId, clientId: p.clientId, input: p.input ?? {}, requestId: p.requestId,
          dryRun: cfg.dryRun && !cfg.liveStages.includes(p.kind), maxAttempts: def.maxAttempts, deadlineMs: def.deadlineMs,
        });
        const code = r.status === 'queued' ? 202 : 200;
        return send(res, code, { status: r.status, jobId: r.job.id, jobStatus: r.job.status });
      }

      const m = url.pathname.match(/^\/jobs\/(\d+)$/);
      if (req.method === 'GET' && m) {
        const j = await getJob(db, Number(m[1]));
        return j ? send(res, 200, j) : send(res, 404, { error: 'not found' });
      }
      return send(res, 404, { error: 'not found' });
    } catch (e) {
      console.error(JSON.stringify({ level: 'error', message: 'http error', err: String(e) }));
      return send(res, 500, { error: 'internal error' });
    }
  });
}

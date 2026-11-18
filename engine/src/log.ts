import type { Db } from './db/pool.js';

export type Level = 'info' | 'warn' | 'error';

/** Structured log line to stdout plus a row in `events` (when a job is known). */
export async function logEvent(
  db: Db | undefined,
  level: Level,
  message: string,
  data: Record<string, unknown> = {},
  jobId?: number,
): Promise<void> {
  const line = { t: new Date().toISOString(), level, message, jobId, ...data };
  (level === 'error' ? console.error : console.log)(JSON.stringify(line));
  if (db && jobId !== undefined) {
    try {
      await db.query('INSERT INTO events (job_id, level, message, data) VALUES ($1,$2,$3,$4)', [jobId, level, message, data]);
    } catch (e) {
      console.error(JSON.stringify({ level: 'error', message: 'event insert failed', err: String(e) }));
    }
  }
}

/** Post an alert to Slack. With no webhook configured, it only logs. Never throws. */
export async function alert(webhookUrl: string | undefined, text: string): Promise<void> {
  if (!webhookUrl) { console.log(JSON.stringify({ level: 'warn', message: 'alert (no Slack webhook set)', text })); return; }
  try {
    const res = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ text }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) console.error(JSON.stringify({ level: 'error', message: 'slack alert failed', status: res.status }));
  } catch (e) {
    console.error(JSON.stringify({ level: 'error', message: 'slack alert failed', err: String(e) }));
  }
}

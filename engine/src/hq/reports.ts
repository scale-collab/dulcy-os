// Agent reports in HQ (Alex 2026-11-25: "move off of Slack for these, it's just too much").
// Every report an agent writes is saved to hq_reports and shown in HQ as a short card that opens
// the full text. Slack gets it too only while SLACK_REPORTS=on; urgent alerts (a campaign paused
// for bounces, a refused launch) always go to Slack.
// Saving never stops the agent's work: a failed write is only logged.
import type { Db } from '../db/pool.js';
import type { Config } from '../config.js';

export interface ReportInput {
  agent: string;
  kind: string;
  title: string;
  /** Full text; Slack mrkdwn is converted to markdown. */
  body: string;
  /** 1-2 lines for the card; made from the body when missing. */
  summary?: string;
  link?: string;
  data?: unknown;
  urgent?: boolean;
  dryRun?: boolean;
  jobId?: number;
  /** The same key is saved once (job retries, the same day's brief). */
  dedupeKey?: string;
}

const EMOJI: Record<string, string> = {
  warning: '⚠️', octagonal_sign: '🛑', eyes: '👀', grey_question: '❔', zzz: '💤', white_check_mark: '✅', heavy_check_mark: '✔️',
  shopping_trolley: '🛒', no_entry: '⛔', x: '❌', chart_with_upwards_trend: '📈', checkered_flag: '🏁', moneybag: '💰', rotating_light: '🚨',
};

/** Slack mrkdwn → markdown: <url|text> links, *bold*, _italic_, :emoji: names. Pure. */
export function slackToMarkdown(s: string): string {
  return String(s ?? '')
    .replace(/<(https?:\/\/[^|>\s]+)\|([^>]+)>/g, (_m, url, text) => `[${text}](${url})`)
    .replace(/<(https?:\/\/[^>\s]+)>/g, '$1')
    .replace(/(^|[^*\w])\*(?!\s)([^*\n]+?)\*(?!\w)/g, '$1**$2**')
    .replace(/(^|[^_\w])_(?!\s)([^_\n]+?)_(?!\w)/g, '$1*$2*')
    .replace(/:([a-z0-9_+-]+):/g, (m, name) => EMOJI[name] ?? m);
}

/** Plain 1-2 line summary from a markdown body (markup and the title line removed). Pure. */
export function summarize(body: string, title = '', max = 180): string {
  const plain = (l: string) => l.replace(/\*\*|__|[*_`>#]/g, '').replace(/\[([^\]]+)\]\([^)]+\)/g, '$1').replace(/^\s*[•\-]\s*/, '').trim();
  const lines = String(body ?? '').split('\n').map(plain).filter(Boolean).filter((l) => l !== plain(title));
  const out = lines.slice(0, 2).join(' · ');
  return out.length > max ? `${out.slice(0, max - 1)}…` : out;
}

export async function saveReport(db: Db, r: ReportInput): Promise<number | null> {
  try {
    const body = slackToMarkdown(r.body).slice(0, 200_000);
    const title = slackToMarkdown(r.title).replace(/\*\*/g, '').slice(0, 300);
    const q = await db.query(
      `INSERT INTO hq_reports (agent, kind, title, summary, body, link, data, urgent, dry_run, job_id, dedupe_key)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) ON CONFLICT (dedupe_key) DO NOTHING RETURNING id`,
      [r.agent, r.kind, title, (r.summary ? slackToMarkdown(r.summary).replace(/\*\*/g, '') : summarize(body, title)).slice(0, 400), body, r.link ?? null,
        r.data === undefined ? null : JSON.stringify(r.data), r.urgent === true, r.dryRun === true, r.jobId ?? null, r.dedupeKey ?? null],
    );
    return q.rows[0] ? Number(q.rows[0].id) : null;
  } catch (e) {
    console.error(JSON.stringify({ level: 'warn', message: 'HQ report not saved', err: String((e as Error).message ?? e).slice(0, 200) }));
    return null;
  }
}

/** Should this report also go to Slack? Urgent always; the rest only while SLACK_REPORTS=on. */
export const slackReports = (cfg: Pick<Config, 'slackReportsOn'>, urgent = false) => urgent || cfg.slackReportsOn !== false;

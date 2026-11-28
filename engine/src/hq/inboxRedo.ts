// Old Echo drafts that offer a calendar LINK instead of two real times (Alex 2026-11-27: "Echo
// offered calendar links on old drafts: now that client calendars are connected it offers two real
// times; re-check the old pending drafts"). RULES 2026-11-25: every booking ask offers two specific
// times; a link only as a last resort.
//   - linkDraftOf(): is a pending draft one of them (pure).
//   - The HQ report (Inbox → "Old drafts with a link") lists them, read only.
//   - "Have Echo redo it" puts one task per draft on Echo's own list (the Fix it / agent task list,
//     with the engine job behind it) and queues Echo's normal drafting stage for that one thread
//     (sean.draft for replies, sean.followup for follow-ups; LIVE_STAGES and dry run apply as always).
//     Echo writes a new draft with two times from the client's calendar. Nothing is sent: the new
//     draft waits for Josh or Alex like every other one.
import type { Db } from '../db/pool.js';
import type { Config } from '../config.js';
import type { HqUser } from './auth.js';
import { enqueue } from '../queue.js';
import { upsertAgentTask } from './agentTasks.js';
import { cachedInbox, type InboxRow } from './inbox.js';
export { linkDraftOf, timesInDraft, type LinkDraft } from './inbox.js';
import type { HqAirtable } from './decisions.js';

/** Why Echo can't redo this one ('' = it can). Pure. */
export function redoBlock(r: Pick<InboxRow, 'tab' | 'pressed' | 'kind' | 'lastSentByUs'>): string {
  if (r.tab !== 'approve') return 'not waiting for approval any more';
  if (r.pressed) return 'already pressed (sending or skipping)';
  if (r.kind === 'reply' && r.lastSentByUs) return 'someone already answered this thread from our side: skip this draft instead';
  return '';
}

export { redoKey } from '../agents/redo.js';
import { redoKey, redoTitle } from '../agents/redo.js';

/** GET /inbox/link-drafts: the pending drafts with a link, newest first, read only. */
export async function linkDraftsReport(at: HqAirtable, db: Db, q: { client?: string; refresh?: boolean } = {}) {
  const src = await cachedInbox(at, q.refresh);
  const all = src.rows.filter((r) => r.tab === 'approve' && r.linkDraft);
  const client = String(q.client ?? '').trim();
  const rows = all.filter((r) => !client || r.clientKey === client).sort((a, b) => b.at.localeCompare(a.at));
  const tasks = rows.length ? (await db.query(`SELECT source_key, status, progress_note, updated_at FROM hq_agent_tasks WHERE source_key = ANY($1)`, [rows.map((r) => redoKey(r.id))])).rows : [];
  const byKey = new Map(tasks.map((t: any) => [String(t.source_key), t]));
  const byClient = [...all.reduce((m, r) => m.set(r.client, (m.get(r.client) ?? 0) + 1), new Map<string, number>())].sort((a, b) => b[1] - a[1]).map(([name, count]) => ({ name, count }));
  return {
    total: all.length, pending: src.rows.filter((r) => r.tab === 'approve').length, byClient,
    rows: rows.map((r) => {
      const t = byKey.get(redoKey(r.id));
      return {
        id: r.id, prospect: r.prospect, company: r.company, client: r.client, clientKey: r.clientKey, wsRec: r.wsRec, at: r.at, kind: r.kind,
        links: r.linkDraft!.links, times: r.linkDraft!.times, noTimesThen: r.linkDraft!.noTimesThen, askedForLink: r.linkDraft!.askedForLink,
        gap: r.gap, blocked: redoBlock(r),
        task: t ? { status: String(t.status), note: String(t.progress_note ?? ''), updated: new Date(t.updated_at).toISOString() } : null,
      };
    }),
    readAt: src.readAt,
  };
}

/**
 * POST /inbox/redo { ids: [...] | "all" }: one Echo task + one Echo drafting job per draft.
 * Only drafts still in the report and not blocked are queued; the rest come back with the reason.
 */
export async function redoLinkDrafts(at: HqAirtable, db: Db, cfg: Pick<Config, 'dryRun' | 'liveStages'>, user: HqUser, body: any) {
  const { STAGES } = await import('../stages/index.js'); // loaded on use: the stages import HQ files
  const src = await cachedInbox(at, true);
  const pending = src.rows.filter((r) => r.tab === 'approve' && r.linkDraft);
  const want: string[] = body?.ids === 'all' ? pending.map((r) => r.id) : Array.isArray(body?.ids) ? body.ids.map(String).filter((x: string) => /^rec[A-Za-z0-9]{14}$/.test(x)).slice(0, 100) : [];
  if (!want.length) return { status: 400, error: 'Which drafts? (ids, or "all")' };
  const queued: { id: string; jobId: number; dryRun: boolean; task: number }[] = [];
  const skipped: { id: string; why: string }[] = [];
  for (const id of [...new Set(want)]) {
    const r = pending.find((x) => x.id === id);
    if (!r) { skipped.push({ id, why: 'no longer a pending draft with a booking link' }); continue; }
    const why = redoBlock(r);
    if (why) { skipped.push({ id, why }); continue; }
    const kind = r.kind === 'followup' ? 'sean.followup' : 'sean.draft';
    const def = STAGES[kind];
    const dryRun = cfg.dryRun && !cfg.liveStages.includes(kind);
    const task = await upsertAgentTask(db, {
      agent: 'Echo', key: redoKey(id), client: r.client, priority: 'high', link: `thread/${id}`, status: 'in_progress',
      title: redoTitle(r.prospect, r.company),
      details: `Asked in HQ by ${user.name} (Inbox → Old drafts with a link). The pending draft offers ${r.linkDraft!.links[0]} instead of two specific times. Redraft with two open times from ${r.client}'s calendar. Nothing is sent: the new draft waits for approval.`,
      note: dryRun ? `Queued as a dry run (${kind} is not in LIVE_STAGES): nothing changes yet` : 'Queued: Echo redrafts it with two times from the calendar',
      job: { kind, recordId: id, input: { redo: id } },
    });
    if ('error' in task) { skipped.push({ id, why: task.error }); continue; }
    const q = await enqueue(db, { kind, recordId: id, input: { redo: id }, requestId: `echo-redo:${id}:${r.at}:${Date.now()}`, dryRun, maxAttempts: def.maxAttempts, deadlineMs: def.deadlineMs });
    queued.push({ id, jobId: Number(q.job.id), dryRun: q.job.dry_run, task: task.id });
  }
  return { status: 200, queued, skipped };
}

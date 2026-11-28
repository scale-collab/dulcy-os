// Riley, systems repair (Alex 2026-11-25). Riley finds why something broke, prepares the fix,
// and waits for Alex's ✅ before anything goes live (until Alex says Riley may fix freely).
//   riley.collect (engine, every RILEY_EVERY_MIN): failed, needs-review and stuck engine jobs, plus
//     n8n error executions (when N8N_API_KEY is set), go into the Airtable "System Issues" table,
//     one row per problem (same signature = same row, Occurrences goes up). Nothing is changed.
//   The Riley scheduled session (Claude Code, a few times a day) diagnoses each New issue, prepares
//     the fix (a PR, an n8n/Make/Airtable change spec, or a retry), writes Why/Fix/Rollback, and
//     posts a Decision ("Apply Riley Fix") that goes to Slack. It also sweeps Make and Airtable
//     automation runs and works the known open issues one at a time.
//   riley.apply (on ✅): a Retry fix re-runs the failed engine job(s) here; an "n8n change" with an
//     exact n8nPatch is applied here through the n8n API (rileyN8n.ts, live with riley.n8n_apply in
//     LIVE_STAGES); any other fix is marked Approved and the Riley session makes it live on its next
//     run, then verifies it.
import type { Stage } from '../stages/index.js';
import type { Db } from '../db/pool.js';
import { PermanentError } from '../errors.js';
import { createAirtableClient, type AirtableClient } from '../providers/airtable.js';
import { val } from './emailsFields.js';
import { logActivity } from '../activity.js';
import { saveReport } from '../hq/reports.js';
import { maskEmail } from '../verify/rules.js';
import { fireAgent } from './fire.js';

export const ISSUES = 'tblZvXQongRlV0vsl';
export const IF = {
  title: 'fldWzB0PQnRKmH580', source: 'fldPSwaufqiC5LOs5', status: 'fldM2brGop7OH65B7', signature: 'fld6vQo2PkK7Z2pVv', where: 'fldvYmZZ8fMsvf5l0',
  error: 'fldpOAYlKcEqcvZxq', occurrences: 'fldQFBKDP7hGZ0hlG', firstSeen: 'fldbXMDnUa05WIEpH', lastSeen: 'fldUve1N9gdMv6lTP', why: 'fldqc20AhaO4KwvId',
  fix: 'fldAYyN9T53XWonuM', fixType: 'fld03exyUOIK3dzKC', fixRef: 'fld2UNAOEKEjUPiGV', rollback: 'fldps8hdsXGLcn9R3', details: 'fldGe3RonGYk26I4O',
  decision: 'fld01Y7LfoLJKPC6b', appliedAt: 'fld987UVKzm8db9JP', result: 'fld9ALWbV1otQ7lsg',
} as const;
const CLOSED = new Set(['Fixed', 'Rejected', 'Ignored']);

/** Same problem = same signature: record IDs, numbers and quotes stripped from the error. */
export function signature(source: string, where: string, error: string): string {
  const e = String(error ?? '').toLowerCase()
    .replace(/rec[a-z0-9]{14}/gi, 'REC').replace(/[0-9a-f]{8}-[0-9a-f-]{27,}/gi, 'ID').replace(/\d+(?:\.\d+)?/g, '#')
    .replace(/["'`].*?["'`]/g, '"…"').replace(/\s+/g, ' ').trim().slice(0, 140);
  return `${source}:${where}:${e}`.slice(0, 250);
}

export interface Found { source: 'Engine' | 'n8n'; where: string; title: string; error: string; details: Record<string, unknown>; key: string; at: string }

/** Engine jobs that went wrong since `since`: failed, needs review, or running past their lease by 15+ minutes. */
export async function engineProblems(db: Db, since: Date): Promise<Found[]> {
  const rows = (await db.query(
    `SELECT id, kind, record_id, input, status, attempts, error, dry_run, updated_at FROM jobs
      WHERE kind NOT LIKE 'riley.%' AND (
        (status IN ('failed','needs_review') AND updated_at > $1)
        OR (status = 'running' AND lease_until < now() - interval '15 minutes' AND lease_until > $1::timestamptz - interval '15 minutes'))
      ORDER BY id`, [since])).rows;
  return rows.map((j) => {
    const stuck = j.status === 'running';
    const error = stuck ? 'Stuck: still running 15+ minutes past its lease (worker died or a call hangs).' : String(j.error ?? `ended as ${j.status}`);
    return { source: 'Engine' as const, where: String(j.kind), title: `${j.kind}: ${stuck ? 'stuck' : j.status === 'needs_review' ? 'needs review' : 'failed'}`, error,
      details: { jobIds: [Number(j.id)], kind: j.kind, recordId: j.record_id, status: j.status, attempts: j.attempts, dryRun: j.dry_run, input: JSON.stringify(j.input ?? {}).slice(0, 1500) },
      key: `job:${j.id}:${j.status}`, at: new Date(j.updated_at).toISOString() };
  });
}


/**
 * What came into a failed n8n run, so Riley can see which lead/reply it was without opening n8n
 * (Alex 2026-11-27: "why can't she open the node and check herself?"). From the trigger node's
 * first item: up to 25 short "path: value" lines; emails masked; anything key/token/secret/password dropped.
 */
export function executionInput(x: any): string[] {
  const run = x?.data?.resultData?.runData ?? {};
  const first = Object.values(run)[0] as any;
  const item = first?.[0]?.data?.main?.[0]?.[0]?.json;
  if (!item || typeof item !== 'object') return [];
  const out: string[] = [];
  const walk = (v: any, path: string, depth: number) => {
    if (out.length >= 25) return;
    if (/key|token|secret|password|auth|cookie|signature/i.test(path)) return;
    if (v && typeof v === 'object' && depth < 4) { for (const [k, c] of Object.entries(v).slice(0, 30)) walk(c, path ? `${path}.${k}` : k, depth + 1); return; }
    if (v === null || v === undefined || v === '' || typeof v === 'object') return;
    let t = String(v).replace(/\s+/g, ' ');
    t = t.replace(/[^\s@<>"']+@[^\s@<>"']+\.[a-z]{2,}/gi, (m) => maskEmail(m));
    out.push(`${path}: ${t.slice(0, 120)}`);
  };
  walk(item, '', 0);
  return out;
}

/** n8n executions that errored since `since` (n8n public API; needs N8N_API_KEY). */
export async function n8nProblems(base: string, key: string, since: Date, fetchImpl: typeof fetch = fetch): Promise<Found[]> {
  const out: Found[] = [];
  const h = { 'X-N8N-API-KEY': key, accept: 'application/json' };
  const r = await fetchImpl(`${base.replace(/\/+$/, '')}/api/v1/executions?status=error&limit=50`, { headers: h, signal: AbortSignal.timeout(30_000) });
  if (!r.ok) throw new Error(`n8n executions: HTTP ${r.status}`);
  const list = ((await r.json()) as { data?: any[] }).data ?? [];
  for (const e of list.filter((x) => new Date(x.stoppedAt ?? x.startedAt ?? 0) > since).slice(0, 20)) {
    let msg = 'error (no message)'; let node = ''; let input: string[] = [];
    try {
      const d = await fetchImpl(`${base.replace(/\/+$/, '')}/api/v1/executions/${e.id}?includeData=true`, { headers: h, signal: AbortSignal.timeout(30_000) });
      const x = (await d.json()) as any; const err = x?.data?.resultData?.error;
      msg = String(err?.message ?? msg).slice(0, 1500); node = String(x?.data?.resultData?.lastNodeExecuted ?? err?.node?.name ?? ''); input = executionInput(x);
    } catch { /* keep the short form */ }
    const wf = String(e.workflowData?.name ?? e.workflowId);
    out.push({ source: 'n8n', where: `${wf}${node ? ` › ${node}` : ''}`, title: `n8n: ${wf} failed${node ? ` at ${node}` : ''}`, error: msg,
      details: { workflowId: e.workflowId, executionIds: [String(e.id)], node, ...(input.length ? { input } : {}) }, key: `n8n:${e.id}`, at: new Date(e.stoppedAt ?? e.startedAt).toISOString() });
  }
  return out;
}


/** Open n8n issues with an execution but no input yet (e.g. ones Riley logged herself): read the run once and attach it. */
export async function enrichOpenN8nIssues(at: Pick<AirtableClient, 'list' | 'update'>, base: string, key: string, fetchImpl: typeof fetch = fetch): Promise<number> {
  const rows = await at.list(ISSUES, `AND({Source}='n8n', OR({Status}='New', {Status}='Waiting for Alex', {Status}='Approved'))`, [IF.details, IF.error, IF.fixRef], 30);
  let n = 0;
  for (const r of rows) {
    let d: any = {}; try { d = JSON.parse(val(r.fields[IF.details]) || '{}'); } catch { d = { note: val(r.fields[IF.details]) }; }
    if (d.input) continue;
    const id = (d.executionIds ?? [])[0] ?? (/execution[s]?\s*#?(\d{5,})/i.exec(`${val(r.fields[IF.error])} ${val(r.fields[IF.fixRef])} ${val(r.fields[IF.details])}`)?.[1]);
    if (!id) continue;
    try {
      const res = await fetchImpl(`${base.replace(/\/+$/, '')}/api/v1/executions/${id}?includeData=true`, { headers: { 'X-N8N-API-KEY': key, accept: 'application/json' }, signal: AbortSignal.timeout(30_000) });
      if (!res.ok) { d.input = [`execution ${id} not readable (HTTP ${res.status}; n8n keeps runs 7 days)`]; }
      else { const x = await res.json(); d.input = executionInput(x); d.node = d.node || String((x as any)?.data?.resultData?.lastNodeExecuted ?? ''); if (!d.input.length) d.input = [`execution ${id}: no trigger data`]; }
      d.executionIds = [...new Set([...(d.executionIds ?? []), String(id)])];
      await at.update(ISSUES, r.id, { [IF.details]: JSON.stringify(d).slice(0, 20_000) }); n++;
    } catch { /* try again next sweep */ }
  }
  return n;
}

/** Add or update the System Issues rows. Returns how many new issues were opened (or reopened). */
export async function upsertIssues(at: Pick<AirtableClient, 'list' | 'create' | 'update'>, found: Found[]): Promise<{ opened: string[]; repeated: number; openedIds: string[] }> {
  const groups = new Map<string, Found[]>();
  for (const f of found) { const s = signature(f.source, f.where, f.error); groups.set(s, [...(groups.get(s) ?? []), f]); }
  const opened: string[] = []; const openedIds: string[] = []; let repeated = 0;
  for (const [sig, fs] of groups) {
    const last = fs[fs.length - 1];
    const ids = { jobIds: fs.flatMap((f) => (f.details.jobIds as number[] | undefined) ?? []), executionIds: fs.flatMap((f) => (f.details.executionIds as string[] | undefined) ?? []) };
    const existing = (await at.list(ISSUES, `{Signature}='${sig.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`, [IF.status, IF.occurrences, IF.details], 1))[0];
    if (existing) {
      const prev = (() => { try { return JSON.parse(val(existing.fields[IF.details]) || '{}'); } catch { return {}; } })();
      const merged = { ...prev, ...last.details, jobIds: [...new Set([...(prev.jobIds ?? []), ...ids.jobIds])].slice(-20), executionIds: [...new Set([...(prev.executionIds ?? []), ...ids.executionIds])].slice(-20) };
      const reopen = CLOSED.has(val(existing.fields[IF.status])) && val(existing.fields[IF.status]) !== 'Ignored';
      await at.update(ISSUES, existing.id, { [IF.occurrences]: (Number(val(existing.fields[IF.occurrences])) || 0) + fs.length, [IF.lastSeen]: last.at, [IF.error]: last.error.slice(0, 5000), [IF.details]: JSON.stringify(merged).slice(0, 20_000), ...(reopen ? { [IF.status]: 'New', [IF.result]: `Came back after it was marked ${val(existing.fields[IF.status])} (${last.at}).` } : {}) });
      if (reopen) { opened.push(last.title); openedIds.push(existing.id); } else repeated += fs.length;
      continue;
    }
    const id = await at.create(ISSUES, { [IF.title]: last.title.slice(0, 200), [IF.source]: last.source, [IF.status]: 'New', [IF.signature]: sig, [IF.where]: last.where.slice(0, 250), [IF.error]: last.error.slice(0, 5000),
      [IF.occurrences]: fs.length, [IF.firstSeen]: fs[0].at, [IF.lastSeen]: last.at, [IF.details]: JSON.stringify({ ...last.details, ...ids }).slice(0, 20_000) });
    opened.push(last.title); openedIds.push(id);
  }
  return { opened, repeated, openedIds };
}

export const rileyCollectStage: Stage = async (ctx) => {
  const cfg = ctx.cfg;
  if (!cfg.airtableApiKey) throw new PermanentError('no AIRTABLE_API_KEY on the server');
  const at = createAirtableClient({ apiKey: cfg.airtableApiKey, baseId: cfg.airtableBaseId, baseUrl: cfg.airtableBaseUrl });
  const last = (await ctx.db.query(`SELECT max(created_at) AS t FROM jobs WHERE kind='riley.collect' AND status='succeeded'`)).rows[0]?.t;
  const since = last ? new Date(last) : new Date(Date.now() - 24 * 3_600_000);
  const found = await engineProblems(ctx.db, since);
  let n8nNote = '';
  if (cfg.n8nApiKey) { try { found.push(...await n8nProblems(cfg.n8nBaseUrl, cfg.n8nApiKey, since)); } catch (e) { n8nNote = ` (n8n not read: ${(e as Error).message})`; } }
  if (ctx.dryRun) return { message: `Would log ${found.length} problem(s) to System Issues (dry run)${n8nNote}` };
  if (cfg.n8nApiKey) { try { const e = await enrichOpenN8nIssues(at, cfg.n8nBaseUrl, cfg.n8nApiKey); if (e) n8nNote += ` (${e} open n8n issue(s): run input attached)`; } catch { /* next sweep */ } }
  const r = found.length ? await upsertIssues(at, found) : { opened: [], repeated: 0, openedIds: [] as string[] };
  if (r.opened.length) await saveReport(ctx.db, { agent: 'Riley', kind: 'system_issues', title: `Riley: ${r.opened.length} new system issue${r.opened.length === 1 ? '' : 's'}`,
    summary: r.opened.slice(0, 2).join(' · '), body: `${r.opened.map((x) => `• ${x}`).join('\n')}\n\nRiley prepares a fix for each one and asks you in Decisions (Fixes).${r.repeated ? `\n${r.repeated} repeat(s) of known issues.` : ''}`,
    jobId: ctx.job.id, dedupeKey: `riley:${ctx.job.id}` });
  // Agents start instantly (Alex 2026-11-28): a NEW issue starts Riley's routine now (step 3: diagnose).
  if (r.opened.length) {
    const list = r.opened.map((t, k) => `${t} (System Issue ${r.openedIds[k] ?? '?'})`);
    await fireAgent(ctx.db, cfg, 'Riley', `New System Issue${list.length === 1 ? '' : 's'}: ${list.slice(0, 5).join('; ')}${list.length > 5 ? ` and ${list.length - 5} more` : ''}`,
      `Do step 3 (diagnose) of agents/riley-session.md for ${list.length === 1 ? 'it' : 'these'} now: ${r.openedIds.join(', ')}. Then the rest of the runbook.`);
  }
  return { message: `${found.length} problem(s): ${r.opened.length} new issue(s)${r.opened.length ? ` (${r.opened.slice(0, 5).join('; ')})` : ''}, ${r.repeated} repeat(s)${n8nNote}` };
};

/**
 * ✅ on "Apply Riley Fix": a Retry re-runs the failed engine jobs; anything else is handed to the Riley
 * session (Approved). Then Riley's routine is started at once (Alex 2026-11-28: agents start instantly)
 * to make the fix live or verify it (step 1 of agents/riley-session.md).
 */
export const rileyApplyStage: Stage = async (ctx) => {
  const cfg = ctx.cfg; const i = ctx.job.input as { issueId: string };
  const at = createAirtableClient({ apiKey: cfg.airtableApiKey, baseId: cfg.airtableBaseId, baseUrl: cfg.airtableBaseUrl });
  const issue = await at.get(ISSUES, i.issueId, [IF.title, IF.status, IF.fixType, IF.details, IF.fix, IF.rollback]);
  if (!issue) throw new PermanentError(`System Issue ${i.issueId} not found`);
  if (val(issue.fields[IF.status]) !== 'Waiting for Alex') return { message: `Issue is ${val(issue.fields[IF.status])}; nothing to do` };
  const r = await applyApproved(ctx, at, issue);
  if (!ctx.dryRun) {
    const title = val(issue.fields[IF.title]); const type = val(issue.fields[IF.fixType]) || 'fix';
    await fireAgent(ctx.db, cfg, 'Riley', `Alex approved: ${title} (System Issue ${issue.id}, ${type})`,
      `Engine result: ${String(r.message ?? '').slice(0, 600)}\nDo step 1 of agents/riley-session.md for this issue now (make it live, or verify what the engine applied), then the rest of the runbook.`);
  }
  return r;
};

async function applyApproved(ctx: Parameters<Stage>[0], at: AirtableClient, issue: NonNullable<Awaited<ReturnType<AirtableClient['get']>>>): Promise<Awaited<ReturnType<Stage>>> {
  const cfg = ctx.cfg;
  const type = val(issue.fields[IF.fixType]);
  // n8n change with an exact n8nPatch: the engine applies it through the n8n API (Alex 2026-11-27).
  if (type === 'n8n change') {
    const { applyN8nPatch } = await import('./rileyN8n.js');
    const r = await applyN8nPatch(ctx, at, issue);
    if (r) return r;
  }
  if (type !== 'Retry') {
    if (!ctx.dryRun) await at.update(ISSUES, issue.id, { [IF.status]: 'Approved' });
    return { message: `Approved: ${val(issue.fields[IF.title])}. Riley makes it live on his next run and reports back.` };
  }
  const d = (() => { try { return JSON.parse(val(issue.fields[IF.details]) || '{}'); } catch { return {}; } })();
  const ids: number[] = (d.jobIds ?? []).slice(-5);
  if (!ids.length) throw new PermanentError('Retry fix but no job IDs on the issue');
  if (ctx.dryRun) return { message: `Would re-run job(s) ${ids.join(', ')} (dry run)` };
  const { enqueue } = await import('../queue.js'); const { STAGES } = await import('../stages/index.js');
  const rerun: string[] = [];
  for (const id of ids) {
    const j = (await ctx.db.query('SELECT kind, record_id, input, dry_run, status FROM jobs WHERE id=$1', [id])).rows[0];
    if (!j || !STAGES[j.kind] || !['failed', 'needs_review', 'running'].includes(j.status)) continue;
    const r = await ctx.step(`retry:${id}`, async () => (await enqueue(ctx.db, { kind: j.kind, recordId: j.record_id, input: j.input, dryRun: j.dry_run, maxAttempts: STAGES[j.kind].maxAttempts, deadlineMs: STAGES[j.kind].deadlineMs, requestId: `riley-retry:${issue.id}:${id}` })).job.id);
    rerun.push(`${id} → ${r}`);
  }
  await at.update(ISSUES, issue.id, { [IF.status]: 'Applied', [IF.appliedAt]: new Date().toISOString(), [IF.result]: `Re-ran on Alex's ✅: job ${rerun.join(', ') || 'none (already finished)'}. Riley checks the outcome on his next run.` });
  await logActivity(cfg, { event: `Riley re-ran: ${val(issue.fields[IF.title])}`, type: 'Step done', agent: 'Riley', details: rerun.join('\n'), jobId: ctx.job.id }, at);
  return { message: `Re-ran ${rerun.length} job(s): ${rerun.join(', ')}` };
};

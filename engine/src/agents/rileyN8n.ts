// Riley's n8n fixes, applied by the engine through the n8n public API (Alex 2026-11-27: "Riley
// fixes n8n end to end after I press Approve"). Riley's cloud session can only read n8n, so she
// writes the exact change into the System Issue as JSON under `n8nPatch`:
//   {"n8nPatch": {"workflowId": "abc123", "changes": [
//     {"node": "Check Results", "path": "rule.interval.0.minutesInterval", "old": 1, "new": 30}]}}
// `path` is inside the node's parameters (dots; numbers index lists). "$disabled" switches a
// whole node off/on. On ✅ (riley.apply, Fix Type "n8n change"): read the workflow, check every
// `old` still matches (else stop: "changed since diagnosis"), save the full previous workflow
// (riley_n8n_rollbacks), PUT the new one, re-activate it if it was active, mark the issue Applied.
// Live only when riley.n8n_apply is in LIVE_STAGES. Credentials and anything that looks like a
// key, token, password or auth setting are never touched. Undo: `riley-n8n-rollback <issueId>`.
import type { JobContext } from '../context.js';
import type { Db } from '../db/pool.js';
import type { Config } from '../config.js';
import type { AirtableClient, AirtableRecord } from '../providers/airtable.js';
import { NeedsReviewError, PermanentError, RetryableError } from '../errors.js';
import { val } from './emailsFields.js';
import { logActivity } from '../activity.js';

export const N8N_APPLY_STAGE = 'riley.n8n_apply';
const ISSUES = 'tblZvXQongRlV0vsl';
// Same field IDs as IF in riley.ts (kept here to avoid an import loop).
const F = { title: 'fldWzB0PQnRKmH580', status: 'fldM2brGop7OH65B7', fix: 'fldAYyN9T53XWonuM', rollback: 'fldps8hdsXGLcn9R3', details: 'fldGe3RonGYk26I4O', appliedAt: 'fld987UVKzm8db9JP', result: 'fld9ALWbV1otQ7lsg' } as const;

export interface N8nChange { node: string; path: string; old: unknown; new: unknown }
export interface N8nPatch { workflowId: string; changes: N8nChange[] }

/** Anything that looks like a credential, key, token, password or auth setting: never changed by the engine. */
export const SECRETISH = /credential|password|passwd|secret|token|api[-_ ]?key|apikey|auth|bearer|cookie|private[-_ ]?key|signature|session|^key$/i;
const SEGMENT = /^[A-Za-z0-9_-]{1,100}$/;
const BAD_SEGMENTS = new Set(['__proto__', 'prototype', 'constructor']);

/** Validate a patch Riley wrote. Returns the patch or a plain reason it is refused. */
export function validateN8nPatch(p: unknown): { patch: N8nPatch } | { error: string } {
  const o = p as Record<string, unknown>;
  if (!o || typeof o !== 'object' || Array.isArray(o)) return { error: 'n8nPatch must be an object {workflowId, changes}' };
  const workflowId = typeof o.workflowId === 'string' ? o.workflowId.trim() : '';
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(workflowId)) return { error: 'n8nPatch.workflowId is missing or not an n8n workflow ID' };
  if (!Array.isArray(o.changes) || !o.changes.length) return { error: 'n8nPatch.changes must list at least one change' };
  if (o.changes.length > 25) return { error: 'n8nPatch has more than 25 changes; split it into smaller fixes' };
  const seen = new Set<string>();
  const changes: N8nChange[] = [];
  for (const [i, raw] of o.changes.entries()) {
    const c = raw as Record<string, unknown>;
    if (!c || typeof c !== 'object') return { error: `change ${i + 1} is not an object` };
    const node = typeof c.node === 'string' ? c.node : '';
    const path = typeof c.path === 'string' ? c.path.trim() : '';
    if (!node.trim() || node.length > 200) return { error: `change ${i + 1}: "node" (the node's name) is missing` };
    if (!('old' in c) || !('new' in c)) return { error: `change ${i + 1} (${node}): both "old" and "new" are required (old = the value Riley read, null if absent)` };
    if (path === '$disabled') {
      if (typeof c.new !== 'boolean') return { error: `change ${i + 1} (${node}): "$disabled" takes true or false` };
    } else {
      const segs = path.split('.');
      if (!path || segs.some((s) => !SEGMENT.test(s) || BAD_SEGMENTS.has(s))) return { error: `change ${i + 1} (${node}): path "${path}" is not a parameter path like "rule.interval.0.minutesInterval"` };
      if (segs.some((s) => SECRETISH.test(s))) return { error: `refused: "${node} › ${path}" looks like a credential, key, token, password or auth setting; the engine never changes those (Manual (Alex))` };
    }
    if (secretKeyIn(c.new)) return { error: `refused: the new value for "${node} › ${path}" holds a credential/key/token/password field; the engine never changes those (Manual (Alex))` };
    const k = `${node}\u0000${path}`;
    if (seen.has(k)) return { error: `"${node} › ${path}" is changed twice in one patch` };
    seen.add(k);
    changes.push({ node, path, old: c.old, new: c.new });
  }
  return { patch: { workflowId, changes } };
}

function secretKeyIn(v: unknown, depth = 0): boolean {
  if (!v || typeof v !== 'object' || depth > 8) return false;
  return Object.entries(v as Record<string, unknown>).some(([k, c]) => SECRETISH.test(k) || secretKeyIn(c, depth + 1));
}

/**
 * Find the patch on a System Issue: Details JSON `n8nPatch` first, then a JSON object in Fix
 * (whole field, or the {...} block inside the text). null = the issue has no patch at all.
 */
export function findN8nPatch(details: string, fix: string): { patch: N8nPatch } | { error: string } | null {
  try {
    const d = JSON.parse(details || '{}');
    if (d && typeof d === 'object' && d.n8nPatch !== undefined) return validateN8nPatch(d.n8nPatch);
  } catch { /* Details is not JSON: look in Fix */ }
  if (!/n8nPatch/.test(fix ?? '')) return null;
  const tries = [fix, fix.slice(fix.indexOf('{'), fix.lastIndexOf('}') + 1)];
  const fence = /```(?:json)?\s*([\s\S]*?)```/.exec(fix)?.[1];
  if (fence) tries.unshift(fence);
  for (const t of tries) {
    try { const o = JSON.parse(t); if (o?.n8nPatch !== undefined) return validateN8nPatch(o.n8nPatch); } catch { /* next */ }
  }
  return { error: 'Fix mentions n8nPatch but it is not valid JSON' };
}

const canon = (v: unknown): string => {
  if (v === undefined || v === null) return 'null';
  if (Array.isArray(v)) return `[${v.map(canon).join(',')}]`;
  if (typeof v === 'object') return `{${Object.keys(v as object).sort().map((k) => `${JSON.stringify(k)}:${canon((v as any)[k])}`).join(',')}}`;
  return JSON.stringify(v);
};
export const sameValue = (a: unknown, b: unknown) => canon(a) === canon(b);
const short = (v: unknown) => { const s = v === undefined ? 'null' : JSON.stringify(v); return s.length > 80 ? `${s.slice(0, 77)}…` : s; };

/** The node a change points at, or why it can't be found. */
function nodeFor(wf: any, name: string): { node: any } | { error: string } {
  const list = (Array.isArray(wf?.nodes) ? wf.nodes : []).filter((n: any) => n?.name === name);
  if (list.length !== 1) return { error: list.length ? `node "${name}" appears ${list.length} times` : `node "${name}" not found` };
  return { node: list[0] };
}

/** The value a change targets in `wf` right now (undefined = absent). */
export function currentValue(wf: any, c: N8nChange): { value: unknown; container?: any } | { error: string } {
  const f = nodeFor(wf, c.node); if ('error' in f) return f;
  if (c.path === '$disabled') return { value: Boolean(f.node.disabled) };
  let cur: any = f.node.parameters ?? {}; let container: any;
  for (const s of c.path.split('.')) {
    if (cur === undefined || cur === null) return { value: undefined, container: undefined };
    if (typeof cur !== 'object') return { error: `"${c.node} › ${c.path}": a part of the path is not an object` };
    container = cur; cur = cur[s];
  }
  return { value: cur, container };
}

export interface PatchPlan { next: any; mismatches: string[]; refused: string[]; lines: string[] }

/**
 * Apply the patch to a copy of the workflow. Every `old` must equal what is there now (null =
 * absent); otherwise it is a mismatch and nothing should be saved.
 */
export function planN8nPatch(wf: any, patch: N8nPatch): PatchPlan {
  const next = structuredClone(wf);
  const mismatches: string[] = [], refused: string[] = [], lines: string[] = [];
  for (const c of patch.changes) {
    const now = currentValue(wf, c);
    if ('error' in now) { mismatches.push(now.error); continue; }
    // A header/query pair like {name: "Authorization", value: "..."}: the value is a secret.
    const pairName = now.container && typeof now.container.name === 'string' ? now.container.name : '';
    if (SECRETISH.test(pairName)) { refused.push(`"${c.node} › ${c.path}" is the value of "${pairName}"`); continue; }
    if (c.path === '$disabled' ? Boolean(now.value) !== Boolean(c.old ?? false) : !sameValue(now.value, c.old)) {
      mismatches.push(`"${c.node} › ${c.path}" is now ${short(now.value)} (Riley read ${short(c.old)})`); continue;
    }
    const f = nodeFor(next, c.node) as { node: any };
    if (c.path === '$disabled') { f.node.disabled = c.new === true; if (!f.node.disabled) delete f.node.disabled; }
    else {
      const segs = c.path.split('.');
      let cur: any = (f.node.parameters ??= {});
      for (const [i, s] of segs.slice(0, -1).entries()) {
        if (cur[s] === undefined || cur[s] === null) cur[s] = /^\d+$/.test(segs[i + 1]) ? [] : {};
        cur = cur[s];
      }
      const last = segs[segs.length - 1];
      if (c.new === null || c.new === undefined) { if (Array.isArray(cur)) cur[Number(last)] = null; else delete cur[last]; } else cur[last] = structuredClone(c.new);
    }
    lines.push(`${c.node} › ${c.path}: ${short(c.old)} → ${short(c.new)}`);
  }
  return { next, mismatches, refused, lines };
}

/** Does the workflow already hold every `new` value (the PUT went through)? every `old` (it did not)? */
export function patchState(wf: any, patch: N8nPatch): 'applied' | 'not_applied' | 'mixed' {
  const is = (c: N8nChange, v: unknown) => { const n = currentValue(wf, c); return !('error' in n) && (c.path === '$disabled' ? Boolean(n.value) === Boolean(v ?? false) : sameValue(n.value, v)); };
  if (patch.changes.every((c) => is(c, c.new))) return 'applied';
  if (patch.changes.every((c) => is(c, c.old))) return 'not_applied';
  return 'mixed';
}

// The n8n public API PUT accepts only these settings keys (from automations/n8n-fix.mjs).
const SETTINGS = ['executionOrder', 'errorWorkflow', 'timezone', 'saveDataErrorExecution', 'saveDataSuccessExecution', 'saveManualExecutions', 'saveExecutionProgress', 'executionTimeout', 'callerPolicy', 'callerIds'];
/** Only the fields the public API PUT accepts: name, nodes, connections, settings, staticData. */
export function putBody(w: any): Record<string, unknown> {
  const settings = Object.fromEntries(Object.entries(w.settings ?? {}).filter(([k]) => SETTINGS.includes(k)));
  return { name: w.name, nodes: w.nodes, connections: w.connections ?? {}, settings, ...(w.staticData ? { staticData: w.staticData } : {}) };
}

export function n8nClient(base: string, key: string, fetchImpl: typeof fetch = fetch) {
  const root = `${base.replace(/\/+$/, '')}/api/v1`;
  async function api(method: string, path: string, body?: unknown): Promise<any> {
    const r = await fetchImpl(`${root}${path}`, { method, headers: { 'X-N8N-API-KEY': key, 'content-type': 'application/json', accept: 'application/json' }, body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(30_000) });
    const t = await r.text();
    if (r.status === 429 || r.status >= 500) { const e = new Error(`n8n ${method} ${path}: HTTP ${r.status}`); if (method === 'GET') throw new RetryableError(e.message); throw e; }
    if (!r.ok) throw new PermanentError(`n8n ${method} ${path}: HTTP ${r.status} ${t.replace(/\s+/g, ' ').slice(0, 200)}`);
    return t ? JSON.parse(t) : {};
  }
  return {
    get: (id: string) => api('GET', `/workflows/${encodeURIComponent(id)}`),
    put: (id: string, w: any) => api('PUT', `/workflows/${encodeURIComponent(id)}`, putBody(w)),
    /** n8n re-registers triggers and webhooks only on (re)activation. */
    reactivate: async (id: string) => { await api('POST', `/workflows/${encodeURIComponent(id)}/deactivate`).catch(() => {}); await api('POST', `/workflows/${encodeURIComponent(id)}/activate`); },
  };
}

/** n8n apply is live only when the riley.apply job is live and riley.n8n_apply is in LIVE_STAGES (or DRY_RUN=false, like every stage). */
export const n8nApplyLive = (ctx: Pick<JobContext, 'dryRun' | 'cfg'>) => !ctx.dryRun && !(ctx.cfg.dryRun && !ctx.cfg.liveStages.includes(N8N_APPLY_STAGE));

const rollbackLine = (id: number, wfName: string, wfId: string, issueId: string) =>
  `Engine rollback #${id}: the full previous version of "${wfName}" (${wfId}) is saved in the engine. Undo: docker compose exec engine node dist/src/cli.js riley-n8n-rollback ${issueId} --yes`;

/**
 * ✅ on an "n8n change" issue. Returns null when the issue has no n8nPatch (the Riley session
 * then makes it live by hand as before). Throws (and says why on the issue) when it is refused
 * or the workflow changed since Riley read it.
 */
export async function applyN8nPatch(ctx: JobContext, at: Pick<AirtableClient, 'update'>, issue: AirtableRecord, fetchImpl: typeof fetch = fetch): Promise<{ message: string; [k: string]: unknown } | null> {
  const cfg = ctx.cfg;
  const found = findN8nPatch(val(issue.fields[F.details]), val(issue.fields[F.fix]));
  if (!found) return null;
  const title = val(issue.fields[F.title]);
  const stop = async (status: 'Fix failed' | 'New', why: string): Promise<never> => {
    if (!ctx.dryRun) await at.update(ISSUES, issue.id, { [F.status]: status, [F.result]: why.slice(0, 5000) });
    throw new PermanentError(why);
  };
  if ('error' in found) return stop('Fix failed', `n8n fix not applied: ${found.error}. Nothing changed in n8n.`);
  const patch = found.patch;
  const live = n8nApplyLive(ctx);
  if (!cfg.n8nApiKey) {
    if (ctx.dryRun) return { message: `Would apply the n8n patch to workflow ${patch.workflowId} (dry run; no N8N_API_KEY on the server to check it)` };
    await at.update(ISSUES, issue.id, { [F.status]: 'Approved', [F.result]: 'Approved. The engine has no N8N_API_KEY, so it could not apply the n8n patch; Riley posts the exact steps on his next run.' });
    return { message: `Approved: ${title}. No n8n key on the server: Riley posts the steps on his next run.` };
  }
  const n8n = n8nClient(cfg.n8nBaseUrl, cfg.n8nApiKey, fetchImpl);

  // 1. Read and check (once per job: a retry after the PUT must not see its own change as a mismatch).
  const check = async () => {
    const wf = await n8n.get(patch.workflowId);
    const plan = planN8nPatch(wf, patch);
    return { wf, plan };
  };
  if (!live) {
    const { wf, plan } = await check();
    if (plan.refused.length) return stop('Fix failed', `n8n fix refused: ${plan.refused.join('; ')}. The engine never changes credentials, keys, tokens or passwords. Nothing changed.`);
    if (plan.mismatches.length) return stop('New', `n8n fix not applied: "${wf.name}" changed since diagnosis: ${plan.mismatches.join('; ')}. Nothing changed; Riley diagnoses it again.`);
    const what = `${plan.lines.length} change(s) in "${wf.name}": ${plan.lines.join('; ')}`;
    if (ctx.dryRun) return { message: `Would apply ${what} (dry run)`, dryRun: true };
    await at.update(ISSUES, issue.id, { [F.status]: 'Approved', [F.result]: `Approved. The patch still matches n8n (${what}), but the engine's n8n apply is off (${N8N_APPLY_STAGE} not in LIVE_STAGES): nothing changed in n8n. Riley posts the exact steps on his next run.`.slice(0, 5000) });
    return { message: `Approved: ${title}. n8n apply is off (add ${N8N_APPLY_STAGE} to LIVE_STAGES); Riley posts the steps. Checked: ${what}` };
  }

  const saved = await ctx.step('n8n:check', async () => {
    const { wf, plan } = await check();
    if (plan.refused.length) return { refused: plan.refused };
    if (plan.mismatches.length) return { mismatches: plan.mismatches, name: String(wf.name ?? '') };
    const row = (await ctx.db.query(
      `INSERT INTO riley_n8n_rollbacks (issue_id, workflow_id, workflow_name, job_id, previous, patch, was_active) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
      [issue.id, patch.workflowId, String(wf.name ?? ''), ctx.job.id, JSON.stringify(wf), JSON.stringify(patch), Boolean(wf.active)])).rows[0];
    return { rollbackId: Number(row.id), name: String(wf.name ?? ''), active: Boolean(wf.active), lines: plan.lines };
  });
  if (saved.refused) return stop('Fix failed', `n8n fix refused: ${saved.refused.join('; ')}. The engine never changes credentials, keys, tokens or passwords. Nothing changed.`);
  if (saved.mismatches) return stop('New', `n8n fix not applied: "${saved.name}" changed since diagnosis: ${saved.mismatches.join('; ')}. Nothing changed; Riley diagnoses it again.`);
  const rollbackId = saved.rollbackId!;
  const prev = (await ctx.db.query('SELECT previous FROM riley_n8n_rollbacks WHERE id=$1', [rollbackId])).rows[0].previous;

  // 2. PUT the changed workflow (receipt first: an unclear PUT is checked against n8n, never blindly
  //    repeated), then 3. re-activate it if it was active, so n8n picks the change up.
  //    A refusal from n8n, or a failed re-activation, is written on the issue with the undo line.
  const putAndReactivate = async () => {
    await ctx.paid({
      callKey: `put:${patch.workflowId}:${rollbackId}`, provider: 'n8n', units: 0,
      run: async () => { await n8n.put(patch.workflowId, { ...planN8nPatch(prev, patch).next, staticData: prev.staticData }); return { ok: true }; },
      dryRunResult: () => ({ ok: false }),
      reconcile: async () => {
        const s = patchState(await n8n.get(patch.workflowId), patch);
        if (s === 'applied') return { ok: true };
        if (s === 'not_applied') return null;
        throw new NeedsReviewError(`n8n workflow ${patch.workflowId} is half-changed after an unclear save; check it (rollback #${rollbackId})`);
      },
    });
    await ctx.db.query('UPDATE riley_n8n_rollbacks SET applied_at=COALESCE(applied_at, now()) WHERE id=$1', [rollbackId]);
    if (saved.active) await ctx.step('n8n:reactivate', async () => { await n8n.reactivate(patch.workflowId); return true; });
  };
  try {
    await putAndReactivate();
  } catch (e) {
    if (e instanceof PermanentError || e instanceof NeedsReviewError) {
      const applied = (await ctx.db.query('SELECT applied_at FROM riley_n8n_rollbacks WHERE id=$1', [rollbackId])).rows[0]?.applied_at;
      await at.update(ISSUES, issue.id, {
        [F.status]: 'Fix failed',
        [F.result]: (applied ? `n8n fix saved, but the workflow could not be re-activated (it may be OFF now): ${e.message}. Undo: riley-n8n-rollback ${issue.id} --yes`
          : `n8n fix not saved: ${e.message}. Nothing changed.`).slice(0, 5000),
        ...(applied ? { [F.rollback]: rollbackLine(rollbackId, saved.name!, patch.workflowId, issue.id) } : {}),
      });
    }
    throw e;
  }

  // 4. Mark the issue Applied, with the rollback pointer.
  const what = `${saved.lines!.length} change(s) in "${saved.name}": ${saved.lines!.join('; ')}`;
  const pointer = rollbackLine(rollbackId, saved.name!, patch.workflowId, issue.id);
  const oldRollback = val(issue.fields[F.rollback]);
  await at.update(ISSUES, issue.id, {
    [F.status]: 'Applied', [F.appliedAt]: new Date().toISOString(),
    [F.result]: `Applied on Alex's ✅ through the n8n API: ${what}.${saved.active ? ' Workflow re-activated.' : ' Workflow was inactive; left inactive.'} Riley checks the next run.`.slice(0, 5000),
    [F.rollback]: `${pointer}${oldRollback && !oldRollback.startsWith('Engine rollback #') ? `\n\n${oldRollback}` : ''}`.slice(0, 5000),
  });
  await logActivity(cfg, { event: `Riley changed n8n: ${saved.name}`, type: 'Step done', agent: 'Riley', details: `${what}\nRollback: riley-n8n-rollback ${issue.id}`, jobId: ctx.job.id });
  return { message: `Applied: ${what}.${saved.active ? ' Re-activated.' : ''} Undo: riley-n8n-rollback ${issue.id}`, rollbackId };
}

/**
 * Put back the workflow saved before Riley's last n8n fix on this issue (CLI riley-n8n-rollback).
 * Without `yes` it only says what it would do. It refuses when the workflow changed after the fix
 * (a rollback would undo those later changes too) unless `force`.
 */
export async function rollbackN8nFix(db: Db, cfg: Pick<Config, 'n8nApiKey' | 'n8nBaseUrl' | 'airtableApiKey' | 'airtableBaseId' | 'airtableBaseUrl'>, issueId: string,
  opts: { yes?: boolean; force?: boolean; fetchImpl?: typeof fetch; at?: Pick<AirtableClient, 'update'> } = {}): Promise<string> {
  const row = (await db.query(`SELECT * FROM riley_n8n_rollbacks WHERE issue_id=$1 AND applied_at IS NOT NULL ORDER BY id DESC LIMIT 1`, [issueId])).rows[0];
  if (!row) return `No applied n8n fix saved for ${issueId}; nothing to roll back.`;
  if (row.rolled_back_at) return `Rollback #${row.id} for ${issueId} was already done on ${new Date(row.rolled_back_at).toISOString()}; nothing changed.`;
  if (!cfg.n8nApiKey) throw new Error('no N8N_API_KEY on the server');
  const n8n = n8nClient(cfg.n8nBaseUrl, cfg.n8nApiKey, opts.fetchImpl);
  const now = await n8n.get(row.workflow_id);
  const state = patchState(now, row.patch as N8nPatch);
  if (state !== 'applied' && !opts.force) {
    return `Not rolled back: "${now.name}" changed after the fix (${state === 'not_applied' ? 'the fix is no longer there' : 'part of it was changed'}). A rollback would also undo those later edits. Run again with --force to put back the version from ${new Date(row.created_at).toISOString()} anyway.`;
  }
  const plan = `put back "${row.workflow_name}" (${row.workflow_id}) as it was on ${new Date(row.created_at).toISOString()} (rollback #${row.id})${now.active ? ', then re-activate it' : ''}`;
  if (!opts.yes) return `Would ${plan}. Run again with --yes to do it.`;
  await n8n.put(row.workflow_id, { ...row.previous, staticData: now.staticData });
  if (now.active) await n8n.reactivate(row.workflow_id);
  await db.query('UPDATE riley_n8n_rollbacks SET rolled_back_at=now() WHERE id=$1', [row.id]);
  const note = `Rolled back by hand on ${new Date().toISOString()}: "${row.workflow_name}" is back to the version before Riley's fix (rollback #${row.id}). Riley diagnoses it again.`;
  let airtable = '';
  try {
    const at = opts.at ?? (cfg.airtableApiKey ? (await import('../providers/airtable.js')).createAirtableClient({ apiKey: cfg.airtableApiKey, baseId: cfg.airtableBaseId, baseUrl: cfg.airtableBaseUrl }) : undefined);
    if (at) await at.update(ISSUES, issueId, { [F.status]: 'Fix failed', [F.result]: note });
    else airtable = ' (no Airtable key: issue not updated)';
  } catch (e) { airtable = ` (System Issue not updated: ${(e as Error).message})`; }
  return `Done: ${plan}.${airtable}`;
}

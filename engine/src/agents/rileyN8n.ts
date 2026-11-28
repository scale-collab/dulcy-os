// Riley's n8n fixes, applied by the engine through the n8n public API (Alex 2026-11-27: "Riley
// fixes n8n end to end after I press Approve"). Riley's cloud session can only read n8n, so she
// writes the exact change into the System Issue as JSON under `n8nPatch`:
//   {"n8nPatch": {"workflowId": "abc123", "changes": [
//     {"node": "Check Results", "path": "rule.interval.0.minutesInterval", "old": 1, "new": 30}]}}
// `path` is inside the node's parameters (dots; numbers index lists). "$disabled" switches a
// whole node off/on. Since 2026-11-28 (Alex: "Riley should fix n8n herself, not give me click
// steps") a change can also be {addNode}, {copyNode}, {connect}, {disconnect}, {nodeSetting} or
// {workflowSetting} (see validateKind). On ✅ (riley.apply, Fix Type "n8n change"): read the
// workflow, apply every change in order on a copy, stop if any `old` no longer matches ("changed
// since diagnosis"), save the full previous workflow (riley_n8n_rollbacks), PUT the new one,
// re-activate it if it was active, mark the issue Applied. All or nothing. Live only when
// riley.n8n_apply is in LIVE_STAGES. Credentials and anything that looks like a key, token,
// password or auth setting are never touched; a new node may only reuse a login the workflow
// already has. Undo: `riley-n8n-rollback <issueId>`.
import { randomUUID } from 'node:crypto';
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

/** A whole-value change ({old, new}), or a text edit inside a string parameter ({find, replace}, e.g. one
 *  line of a Code node's jsCode): `find` must occur exactly once in the live value (Alex 2026-11-28). */
export interface N8nParamChange { node: string; path: string; old: unknown; new: unknown; find?: string; replace?: string }
/** Credentials on a new node may only point at a login the workflow already uses: copy it from a node of the
 *  same type (`fromNode`, the n8n MCP hides credential ids), or name it by the id + name another node uses. */
export type N8nCredentialRef = { fromNode: string } | { id: string; name: string };
export interface N8nNewNode { name: string; type: string; typeVersion: number; position: [number, number]; parameters: Record<string, unknown>; credentials?: Record<string, N8nCredentialRef> }
/** One wire. output "error" = the node's error output (n8n stores it in `main`, right after the regular outputs). */
export interface N8nLink { from: string; output: 'main' | 'error'; fromIndex: number; to: string; toIndex: number }
export interface N8nAddNode { addNode: N8nNewNode }
export interface N8nCopyNode { copyNode: { from: string; name: string; position: [number, number]; parameterOverrides?: Record<string, unknown> } }
export interface N8nConnect { connect: N8nLink }
export interface N8nDisconnect { disconnect: N8nLink }
export interface N8nNodeSetting { nodeSetting: { node: string; key: string; old: unknown; new: unknown } }
export interface N8nWorkflowSetting { workflowSetting: { key: string; old: unknown; new: unknown } }
/** Every kind of change an n8nPatch can hold (Alex 2026-11-28: "Riley should fix n8n herself, not give me click steps"). */
export type N8nChange = N8nParamChange | N8nAddNode | N8nCopyNode | N8nConnect | N8nDisconnect | N8nNodeSetting | N8nWorkflowSetting;
export interface N8nPatch { workflowId: string; changes: N8nChange[] }

const KINDS = ['addNode', 'copyNode', 'connect', 'disconnect', 'nodeSetting', 'workflowSetting'] as const;
type Kind = typeof KINDS[number] | 'param';
export const kindOf = (c: N8nChange): Kind => (KINDS.find((k) => k in (c as object)) ?? 'param');
const isParam = (c: N8nChange): c is N8nParamChange => kindOf(c) === 'param';

/** Anything that looks like a credential, key, token, password or auth setting: never changed by the engine. */
export const SECRETISH = /credential|password|passwd|secret|token|api[-_ ]?key|apikey|auth|bearer|cookie|private[-_ ]?key|signature|session|^key$/i;
const SEGMENT = /^[A-Za-z0-9_-]{1,100}$/;
const BAD_SEGMENTS = new Set(['__proto__', 'prototype', 'constructor']);
const NODE_TYPE = /^(@[a-z0-9-]+\/)?[A-Za-z0-9-]+\.[A-Za-z0-9]+$/;
/** New triggers and webhooks open a new way in: never added by the engine (Manual (Alex)). */
const isTriggerType = (t: string) => /trigger$/i.test(t) || /\.(webhook|form|mcpTrigger)$/i.test(t);
/** Selector parameters that go with a node's login (not secrets themselves): copied from the node whose login is reused. */
const AUTH_SELECTORS = ['authentication', 'nodeCredentialType', 'genericAuthType'];

/** Node settings outside `parameters` the engine may change, with n8n's value when the key is absent. */
const NODE_SETTINGS: Record<string, { label: string; dflt: unknown; check: (v: unknown) => boolean; hint: string }> = {
  onError: { label: 'On Error', dflt: 'stopWorkflow', check: (v) => ['stopWorkflow', 'continueRegularOutput', 'continueErrorOutput'].includes(v as string), hint: 'stopWorkflow, continueRegularOutput or continueErrorOutput' },
  retryOnFail: { label: 'Retry On Fail', dflt: false, check: (v) => typeof v === 'boolean', hint: 'true or false' },
  maxTries: { label: 'Max Tries', dflt: 3, check: (v) => Number.isInteger(v) && (v as number) >= 2 && (v as number) <= 5, hint: 'a whole number from 2 to 5' },
  waitBetweenTries: { label: 'Wait Between Tries (ms)', dflt: 1000, check: (v) => Number.isInteger(v) && (v as number) >= 0 && (v as number) <= 5000, hint: 'milliseconds from 0 to 5000' },
  alwaysOutputData: { label: 'Always Output Data', dflt: false, check: (v) => typeof v === 'boolean', hint: 'true or false' },
  executeOnce: { label: 'Execute Once', dflt: false, check: (v) => typeof v === 'boolean', hint: 'true or false' },
  notes: { label: 'Notes', dflt: '', check: (v) => typeof v === 'string' && v.length <= 5000, hint: 'text up to 5000 characters' },
  disabled: { label: 'Deactivated', dflt: false, check: (v) => typeof v === 'boolean', hint: 'true or false' },
};
/** Workflow settings the engine may change (each one is in putBody's SETTINGS, so the PUT really sends it). */
const WORKFLOW_SETTINGS: Record<string, { label: string; dflt: unknown; check: (v: unknown) => boolean; hint: string }> = {
  availableInMCP: { label: 'Available in MCP', dflt: false, check: (v) => typeof v === 'boolean', hint: 'true or false' },
  errorWorkflow: { label: 'Error Workflow', dflt: null, check: (v) => typeof v === 'string' && /^[A-Za-z0-9_-]{1,64}$/.test(v), hint: 'an n8n workflow ID' },
  executionTimeout: { label: 'Timeout Workflow (seconds)', dflt: -1, check: (v) => v === -1 || (Number.isInteger(v) && (v as number) >= 1 && (v as number) <= 604800), hint: '-1 (no timeout) or seconds up to 604800' },
  saveExecutionProgress: { label: 'Save Execution Progress', dflt: false, check: (v) => typeof v === 'boolean', hint: 'true or false' },
  callerPolicy: { label: 'This workflow can be called by', dflt: 'workflowsFromSameOwner', check: (v) => ['any', 'none', 'workflowsFromSameOwner'].includes(v as string), hint: 'any, none or workflowsFromSameOwner (a caller list is Manual (Alex))' },
};

const cleanName = (v: unknown): string => (typeof v === 'string' && v.trim() && v.length <= 128 && !/[\u0000-\u001f]/.test(v) ? v : '');
const isPos = (v: unknown): v is [number, number] => Array.isArray(v) && v.length === 2 && v.every((x) => typeof x === 'number' && Number.isFinite(x) && Math.abs(x) <= 1e6);
const badKeyIn = (v: unknown, depth = 0): boolean => !!v && typeof v === 'object' && depth <= 20 && Object.entries(v as object).some(([k, c]) => BAD_SEGMENTS.has(k) || badKeyIn(c, depth + 1));
/** A {name: "Authorization", value: ...} pair anywhere inside: its value is a secret. */
const secretPairIn = (v: unknown, depth = 0): boolean => !!v && typeof v === 'object' && depth <= 20
  && ((typeof (v as any).name === 'string' && SECRETISH.test((v as any).name) && 'value' in (v as object)) || Object.values(v as object).some((c) => secretPairIn(c, depth + 1)));
const badPath = (path: string) => { const segs = path.split('.'); return !path || segs.some((s) => !SEGMENT.test(s) || BAD_SEGMENTS.has(s)); };
const intIn = (v: unknown, dflt: number, max: number) => (v === undefined || v === null ? dflt : Number.isInteger(v) && (v as number) >= 0 && (v as number) <= max ? (v as number) : NaN);

function validLink(raw: unknown, what: string): { link: N8nLink } | { error: string } {
  const l = raw as Record<string, unknown>;
  if (!l || typeof l !== 'object' || Array.isArray(l)) return { error: `${what} must be an object {from, output?, fromIndex?, to, toIndex?}` };
  const from = cleanName(l.from), to = cleanName(l.to);
  if (!from || !to) return { error: `${what}: "from" and "to" (node names) are required` };
  if (from === to) return { error: `${what}: a node can't be wired to itself` };
  const output = l.output === undefined ? 'main' : l.output;
  if (output !== 'main' && output !== 'error') return { error: `${what}: "output" is "main" or "error"` };
  const fromIndex = intIn(l.fromIndex, 0, 20), toIndex = intIn(l.toIndex, 0, 20);
  if (Number.isNaN(fromIndex) || Number.isNaN(toIndex)) return { error: `${what}: "fromIndex"/"toIndex" must be whole numbers from 0 to 20` };
  if (output === 'error' && fromIndex !== 0) return { error: `${what}: the error output has no "fromIndex" (n8n puts it after the regular outputs)` };
  return { link: { from, output, fromIndex, to, toIndex } };
}

function validCredentials(raw: unknown, where: string): { credentials?: Record<string, N8nCredentialRef> } | { error: string } {
  if (raw === undefined || raw === null) return {};
  if (typeof raw !== 'object' || Array.isArray(raw)) return { error: `${where}: "credentials" must be {<credential type>: {"fromNode": "<node>"}} or {<credential type>: {"id", "name"}}` };
  const out: Record<string, N8nCredentialRef> = {};
  const entries = Object.entries(raw as Record<string, unknown>);
  if (entries.length > 3) return { error: `${where}: at most 3 credentials` };
  for (const [type, ref] of entries) {
    if (!/^[A-Za-z0-9]{1,100}$/.test(type)) return { error: `${where}: "${type}" is not a credential type name` };
    const r = ref as Record<string, unknown>;
    const keys = r && typeof r === 'object' && !Array.isArray(r) ? Object.keys(r).sort().join(',') : '';
    if (keys === 'fromNode' && cleanName(r.fromNode)) out[type] = { fromNode: r.fromNode as string };
    else if (keys === 'id,name' && typeof r.id === 'string' && /^[A-Za-z0-9_-]{1,64}$/.test(r.id) && cleanName(r.name)) out[type] = { id: r.id, name: r.name as string };
    else return { error: `refused: ${where} credential "${type}" must only point at a login the workflow already uses ({"fromNode": "<node>"} or {"id", "name"}); the engine never creates or embeds credentials (Manual (Alex))` };
  }
  return { credentials: out };
}

/** Validate one change of the new kinds; null = it is a parameter change (validated by the caller). */
function validateKind(c: Record<string, unknown>, i: number): { change: N8nChange; key: string; newName?: string } | { error: string } | null {
  const kinds = KINDS.filter((k) => k in c);
  if (!kinds.length) return null;
  const at = `change ${i + 1}`;
  if (kinds.length > 1 || Object.keys(c).length > 1) return { error: `${at}: one change per entry (found ${Object.keys(c).join(', ')})` };
  const kind = kinds[0];
  const b = c[kind] as Record<string, unknown>;
  if (!b || typeof b !== 'object' || Array.isArray(b)) return { error: `${at}: "${kind}" must be an object` };
  if (kind === 'addNode') {
    const name = cleanName(b.name);
    if (!name) return { error: `${at} (addNode): "name" is missing or too long` };
    const type = typeof b.type === 'string' ? b.type : '';
    if (!NODE_TYPE.test(type)) return { error: `${at} (addNode "${name}"): "type" must be an n8n node type like "n8n-nodes-base.slack"` };
    if (isTriggerType(type)) return { error: `refused: ${at} adds a trigger or webhook node ("${type}"); new ways into n8n stay Manual (Alex)` };
    if (typeof b.typeVersion !== 'number' || !(b.typeVersion > 0 && b.typeVersion <= 100)) return { error: `${at} (addNode "${name}"): "typeVersion" must be a number like 2.3 (copy it from a node of the same type)` };
    if (!isPos(b.position)) return { error: `${at} (addNode "${name}"): "position" must be [x, y]` };
    const parameters = b.parameters ?? {};
    if (typeof parameters !== 'object' || Array.isArray(parameters)) return { error: `${at} (addNode "${name}"): "parameters" must be an object` };
    if (JSON.stringify(parameters).length > 100_000) return { error: `${at} (addNode "${name}"): "parameters" too long` };
    if (badKeyIn(parameters)) return { error: `${at} (addNode "${name}"): "parameters" holds a forbidden key` };
    if (secretKeyIn(parameters) || secretPairIn(parameters)) return { error: `refused: the parameters of new node "${name}" hold a credential/key/token/password/auth field; the engine never sets those (reuse a login with "credentials", or Manual (Alex))` };
    const cr = validCredentials(b.credentials, `new node "${name}"`); if ('error' in cr) return cr;
    const extra = Object.keys(b).filter((k) => !['name', 'type', 'typeVersion', 'position', 'parameters', 'credentials'].includes(k));
    if (extra.length) return { error: `${at} (addNode "${name}"): unknown field(s) ${extra.join(', ')} (node settings go in a "nodeSetting" change)` };
    const node: N8nNewNode = { name, type, typeVersion: b.typeVersion, position: [...b.position] as [number, number], parameters: structuredClone(parameters as Record<string, unknown>), ...(cr.credentials ? { credentials: cr.credentials } : {}) };
    return { change: { addNode: node }, key: `node\u0000${name}`, newName: name };
  }
  if (kind === 'copyNode') {
    const from = cleanName(b.from), name = cleanName(b.name);
    if (!from || !name) return { error: `${at} (copyNode): "from" (the node to copy) and "name" (the copy's new name) are required` };
    if (!isPos(b.position)) return { error: `${at} (copyNode "${name}"): "position" must be [x, y]` };
    const ov = b.parameterOverrides ?? {};
    if (typeof ov !== 'object' || Array.isArray(ov)) return { error: `${at} (copyNode "${name}"): "parameterOverrides" must be {"<parameter path>": <new value>}` };
    const entries = Object.entries(ov as Record<string, unknown>);
    if (entries.length > 25) return { error: `${at} (copyNode "${name}"): at most 25 parameter overrides` };
    for (const [path, v] of entries) {
      if (badPath(path)) return { error: `${at} (copyNode "${name}"): path "${path}" is not a parameter path like "columns.value.id"` };
      if (path.split('.').some((s) => SECRETISH.test(s))) return { error: `refused: "${name} › ${path}" looks like a credential, key, token, password or auth setting; the engine never changes those (Manual (Alex))` };
      if (secretKeyIn(v) || secretPairIn(v) || badKeyIn(v)) return { error: `refused: the new value for "${name} › ${path}" holds a credential/key/token/password field; the engine never changes those (Manual (Alex))` };
    }
    const extra = Object.keys(b).filter((k) => !['from', 'name', 'position', 'parameterOverrides'].includes(k));
    if (extra.length) return { error: `${at} (copyNode "${name}"): unknown field(s) ${extra.join(', ')}` };
    return { change: { copyNode: { from, name, position: [...b.position] as [number, number], ...(entries.length ? { parameterOverrides: structuredClone(ov as Record<string, unknown>) } : {}) } }, key: `node\u0000${name}`, newName: name };
  }
  if (kind === 'connect' || kind === 'disconnect') {
    const r = validLink(b, `${at} (${kind})`); if ('error' in r) return r;
    const l = r.link;
    const change = kind === 'connect' ? { connect: l } : { disconnect: l };
    return { change, key: `link\u0000${l.from}\u0000${l.output}\u0000${l.fromIndex}\u0000${l.to}\u0000${l.toIndex}` };
  }
  if (kind === 'nodeSetting') {
    const node = cleanName(b.node); const key = typeof b.key === 'string' ? b.key : '';
    if (!node) return { error: `${at} (nodeSetting): "node" (the node's name) is missing` };
    const spec = NODE_SETTINGS[key];
    if (!spec) return { error: `${at} (nodeSetting "${node}"): "${key}" is not a node setting the engine changes (allowed: ${Object.keys(NODE_SETTINGS).join(', ')})` };
    if (!('old' in b) || !('new' in b)) return { error: `${at} (nodeSetting "${node}" ${key}): both "old" and "new" are required (old = the value Riley read, null if absent)` };
    if (b.old !== null && !spec.check(b.old)) return { error: `${at} (nodeSetting "${node}" ${key}): "old" must be null or ${spec.hint}` };
    if (b.new !== null && !spec.check(b.new)) return { error: `${at} (nodeSetting "${node}" ${key}): "new" must be ${spec.hint} (or null to clear it)` };
    return { change: { nodeSetting: { node, key, old: b.old, new: b.new } }, key: `nodeSetting\u0000${node}\u0000${key}` };
  }
  // workflowSetting
  const key = typeof b.key === 'string' ? b.key : '';
  const spec = WORKFLOW_SETTINGS[key];
  if (!spec) return { error: `${at} (workflowSetting): "${key}" is not a workflow setting the engine changes (allowed: ${Object.keys(WORKFLOW_SETTINGS).join(', ')})` };
  if (!('old' in b) || !('new' in b)) return { error: `${at} (workflowSetting ${key}): both "old" and "new" are required (old = the value Riley read, null if absent)` };
  if (b.old !== null && !spec.check(b.old)) return { error: `${at} (workflowSetting ${key}): "old" must be null or ${spec.hint}` };
  if (!spec.check(b.new)) return { error: `${at} (workflowSetting ${key}): "new" must be ${spec.hint}` };
  // n8n merges settings on save, so a setting that was absent can only be undone if it has a value to put back.
  if (spec.dflt === null && b.old === null) return { error: `${at} (workflowSetting ${key}): setting an ${spec.label} where none is set can't be undone by the engine's rollback; Manual (Alex)` };
  return { change: { workflowSetting: { key, old: b.old, new: b.new } }, key: `workflowSetting\u0000${key}` };
}

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
    if (!c || typeof c !== 'object' || Array.isArray(c)) return { error: `change ${i + 1} is not an object` };
    const k = validateKind(c, i);
    if (k) {
      if ('error' in k) return k;
      if (seen.has(k.key)) return { error: k.newName ? `"${k.newName}" is added twice in one patch` : `change ${i + 1} repeats an earlier change in the same patch` };
      seen.add(k.key); changes.push(k.change); continue;
    }
    const node = typeof c.node === 'string' ? c.node : '';
    const path = typeof c.path === 'string' ? c.path.trim() : '';
    if (!node.trim() || node.length > 200) return { error: `change ${i + 1}: "node" (the node's name) is missing (or use addNode, copyNode, connect, disconnect, nodeSetting, workflowSetting)` };
    const textEdit = typeof c.find === 'string' || typeof c.replace === 'string';
    if (textEdit) {
      if (typeof c.find !== 'string' || !c.find || typeof c.replace !== 'string') return { error: `change ${i + 1} (${node}): a text edit needs a non-empty "find" and a "replace" string` };
      if (c.find.length > 5000 || c.replace.length > 20000) return { error: `change ${i + 1} (${node}): "find"/"replace" too long` };
      if (path === '$disabled') return { error: `change ${i + 1} (${node}): "$disabled" takes old/new, not find/replace` };
    } else if (!('old' in c) || !('new' in c)) return { error: `change ${i + 1} (${node}): both "old" and "new" are required (old = the value Riley read, null if absent)` };
    if (path === '$disabled') {
      if (typeof c.new !== 'boolean') return { error: `change ${i + 1} (${node}): "$disabled" takes true or false` };
    } else {
      if (badPath(path)) return { error: `change ${i + 1} (${node}): path "${path}" is not a parameter path like "rule.interval.0.minutesInterval"` };
      if (path.split('.').some((s) => SECRETISH.test(s))) return { error: `refused: "${node} › ${path}" looks like a credential, key, token, password or auth setting; the engine never changes those (Manual (Alex))` };
    }
    if (textEdit && SECRETISH.test(String(c.replace))) return { error: `refused: the replacement text for "${node} › ${path}" mentions a credential, key, token, password or auth setting; the engine never changes those (Manual (Alex))` };
    if (secretKeyIn(c.new)) return { error: `refused: the new value for "${node} › ${path}" holds a credential/key/token/password field; the engine never changes those (Manual (Alex))` };
    const key = `${node}\u0000${path}`;
    if (seen.has(key)) return { error: `"${node} › ${path}" is changed twice in one patch` };
    seen.add(key);
    changes.push(textEdit ? { node, path, old: undefined, new: undefined, find: c.find as string, replace: c.replace as string } : { node, path, old: c.old, new: c.new });
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

const occurrences = (text: string, find: string) => text.split(find).length - 1;
/** A text edit made concrete against the live value: {old, new}, or why it can't be applied. */
export function resolveTextEdit(value: unknown, c: N8nParamChange): { old: string; new: string } | { error: string } {
  if (typeof value !== 'string') return { error: `"${c.node} › ${c.path}" is not text (a text edit needs a string parameter)` };
  const n = occurrences(value, c.find as string);
  if (n !== 1) return { error: `"${c.node} › ${c.path}": the text Riley read ${n ? `appears ${n} times` : 'is no longer there'} (${short(c.find)})` };
  return { old: value, new: value.replace(c.find as string, () => c.replace as string) };
}

/** The node a change points at, or why it can't be found. */
function nodeFor(wf: any, name: string): { node: any } | { error: string } {
  const list = (Array.isArray(wf?.nodes) ? wf.nodes : []).filter((n: any) => n?.name === name);
  if (list.length !== 1) return { error: list.length ? `node "${name}" appears ${list.length} times` : `node "${name}" not found` };
  return { node: list[0] };
}
const hasNode = (wf: any, name: string) => (Array.isArray(wf?.nodes) ? wf.nodes : []).some((n: any) => n?.name === name);

/** The value a parameter change targets in `wf` right now (undefined = absent). */
export function currentValue(wf: any, c: N8nParamChange): { value: unknown; container?: any } | { error: string } {
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

/** Set `path` inside `params` (creating objects/lists on the way); null removes it. Returns the container. */
function setPath(params: any, path: string, value: unknown): any {
  const segs = path.split('.');
  let cur: any = params;
  for (const [i, s] of segs.slice(0, -1).entries()) {
    if (cur[s] === undefined || cur[s] === null) cur[s] = /^\d+$/.test(segs[i + 1]) ? [] : {};
    if (typeof cur[s] !== 'object') throw new Error(`a part of the path "${path}" is not an object`);
    cur = cur[s];
  }
  const last = segs[segs.length - 1];
  if (value === null || value === undefined) { if (Array.isArray(cur)) cur[Number(last)] = null; else delete cur[last]; } else cur[last] = structuredClone(value);
  return cur;
}

/** How many regular outputs a node has; its error output comes right after them (n8n stores it in `main`). */
function errorOutputIndex(node: any): number | { error: string } {
  const t = String(node?.type ?? '');
  if (/\.(switch|textClassifier)$/i.test(t)) return { error: `"${node.name}" (${typeLabel(t)}) has a variable number of outputs; wire its error output with output "main" and the exact fromIndex instead` };
  if (/\.(if|splitInBatches)$/.test(t)) return 2;
  if (/\.compareDatasets$/.test(t)) return 4;
  return 1;
}
const outIndex = (wf: any, l: N8nLink): number | { error: string } => {
  if (l.output === 'main') return l.fromIndex;
  const f = nodeFor(wf, l.from); if ('error' in f) return f;
  return errorOutputIndex(f.node);
};
const linkAt = (wf: any, l: N8nLink, idx: number) => (wf?.connections?.[l.from]?.main?.[idx] ?? []) as any[];
const linkExists = (wf: any, l: N8nLink, idx: number) => linkAt(wf, l, idx).some((x) => x?.node === l.to && (x?.type ?? 'main') === 'main' && (x?.index ?? 0) === l.toIndex);

const nodeSettingNow = (node: any, key: string) => node?.[key] ?? NODE_SETTINGS[key].dflt;
const wfSettingNow = (wf: any, key: string) => wf?.settings?.[key] ?? WORKFLOW_SETTINGS[key].dflt;
const eff = (v: unknown, dflt: unknown) => (v === null || v === undefined ? dflt : v);

/** Plain words for a node type: "n8n-nodes-base.slack" → "Slack", "n8n-nodes-base.httpRequest" → "HTTP Request". */
export function typeLabel(t: string): string {
  const base = String(t).split('.').pop() ?? String(t);
  const known: Record<string, string> = { httpRequest: 'HTTP Request', if: 'If', openAi: 'OpenAI', executeWorkflow: 'Execute Workflow' };
  return known[base] ?? base.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/^./, (c) => c.toUpperCase());
}
const ON_ERROR_WORDS: Record<string, string> = { stopWorkflow: 'Stop Workflow', continueRegularOutput: 'Continue', continueErrorOutput: 'Continue (using error output)' };
const settingWords = (key: string, v: unknown) => (key === 'onError' && typeof v === 'string' ? ON_ERROR_WORDS[v] ?? v : typeof v === 'boolean' ? (v ? 'on' : 'off') : short(v));
function linkWords(wf: any, l: N8nLink, idx?: number): string {
  const src = (Array.isArray(wf?.nodes) ? wf.nodes : []).find((n: any) => n?.name === l.from);
  let out = '';
  if (l.output === 'error') out = ' error output';
  else if (/\.if$/.test(String(src?.type ?? '')) && l.fromIndex <= 1) out = l.fromIndex === 0 ? ' true output' : ' false output';
  else if (l.fromIndex > 0) out = ` output ${(idx ?? l.fromIndex) + 1}`;
  return `'${l.from}'${out} → '${l.to}'${l.toIndex > 0 ? ` (input ${l.toIndex + 1})` : ''}`;
}

/** One change in plain words, for the Decision card and the issue's Result line. */
export function describeN8nChange(c: N8nChange, wf?: any): string {
  const k = kindOf(c);
  if (k === 'addNode') {
    const n = (c as N8nAddNode).addNode; const from = Object.values(n.credentials ?? {}).map((r) => ('fromNode' in r ? `'${r.fromNode}'` : `"${r.name}"`));
    return `add node '${n.name}' (${typeLabel(n.type)})${from.length ? `, reusing the login of ${from.join(', ')}` : ''}`;
  }
  if (k === 'copyNode') {
    const n = (c as N8nCopyNode).copyNode; const ov = Object.keys(n.parameterOverrides ?? {});
    return `copy node '${n.from}' as '${n.name}'${ov.length ? `, changing ${ov.join(', ')}` : ''}`;
  }
  if (k === 'connect') return `connect ${linkWords(wf, (c as N8nConnect).connect)}`;
  if (k === 'disconnect') return `disconnect ${linkWords(wf, (c as N8nDisconnect).disconnect)}`;
  if (k === 'nodeSetting') {
    const s = (c as N8nNodeSetting).nodeSetting; const spec = NODE_SETTINGS[s.key];
    return `'${s.node}' setting ${spec.label}: ${settingWords(s.key, eff(s.old, spec.dflt))} → ${settingWords(s.key, eff(s.new, spec.dflt))}`;
  }
  if (k === 'workflowSetting') {
    const s = (c as N8nWorkflowSetting).workflowSetting; const spec = WORKFLOW_SETTINGS[s.key];
    return `workflow setting ${spec.label}: ${settingWords(s.key, eff(s.old, spec.dflt))} → ${settingWords(s.key, s.new)}`;
  }
  const p = c as N8nParamChange;
  return p.find !== undefined ? `${p.node} › ${p.path}: text ${short(p.find)} → ${short(p.replace)}` : `${p.node} › ${p.path}: ${short(p.old)} → ${short(p.new)}`;
}

/** mismatches = the workflow changed since Riley read it; refused = secrets or new credentials; invalid = the patch can't work on this workflow. */
export interface PatchPlan { next: any; mismatches: string[]; refused: string[]; invalid: string[]; lines: string[] }

/**
 * Apply the patch to a copy of the workflow, change by change in order (a connect can use a node added
 * just before it). Every `old` must equal what is there now (null = absent); otherwise it is a mismatch
 * and nothing should be saved. Any mismatch, refusal or invalid change = nothing is saved (all or nothing).
 */
export function planN8nPatch(wf: any, patch: N8nPatch): PatchPlan {
  const next = structuredClone(wf);
  if (!Array.isArray(next.nodes)) next.nodes = [];
  if (!next.connections || typeof next.connections !== 'object') next.connections = {};
  const mismatches: string[] = [], refused: string[] = [], invalid: string[] = [], lines: string[] = [];
  const errorLinks: N8nLink[] = [];
  for (const c of patch.changes) {
    const k = kindOf(c);
    if (k === 'addNode' || k === 'copyNode') {
      let node: any;
      if (k === 'addNode') {
        const n = (c as N8nAddNode).addNode;
        if (hasNode(next, n.name)) { mismatches.push(`node "${n.name}" already exists`); continue; }
        node = { id: randomUUID(), name: n.name, type: n.type, typeVersion: n.typeVersion, position: [...n.position], parameters: structuredClone(n.parameters ?? {}) };
        const creds: Record<string, unknown> = {};
        let bad = false;
        for (const [type, ref] of Object.entries(n.credentials ?? {})) {
          if ('fromNode' in ref) {
            const src = nodeFor(next, ref.fromNode);
            if ('error' in src) { mismatches.push(`the login for "${n.name}" comes from ${src.error}`); bad = true; break; }
            if (src.node.type !== n.type) { invalid.push(`"${n.name}" can only reuse the login of a node of the same type ('${ref.fromNode}' is ${typeLabel(src.node.type)})`); bad = true; break; }
            const cred = src.node.credentials?.[type];
            if (!cred?.id) { invalid.push(`'${ref.fromNode}' has no "${type}" login to reuse`); bad = true; break; }
            creds[type] = { id: cred.id, name: cred.name };
            for (const a of AUTH_SELECTORS) if (typeof src.node.parameters?.[a] === 'string') node.parameters[a] = src.node.parameters[a];
          } else {
            const used = next.nodes.some((x: any) => x?.credentials?.[type]?.id === ref.id && x?.credentials?.[type]?.name === ref.name);
            if (!used) { refused.push(`"${n.name}" would use a "${type}" login (${ref.name}) that no node in this workflow uses; the engine never adds new credentials`); bad = true; break; }
            creds[type] = { id: ref.id, name: ref.name };
          }
        }
        if (bad) continue;
        if (Object.keys(creds).length) node.credentials = creds;
      } else {
        const n = (c as N8nCopyNode).copyNode;
        const src = nodeFor(next, n.from);
        if ('error' in src) { mismatches.push(src.error); continue; }
        if (hasNode(next, n.name)) { mismatches.push(`node "${n.name}" already exists`); continue; }
        if (isTriggerType(String(src.node.type))) { refused.push(`"${n.from}" is a trigger or webhook node; copies of those stay Manual (Alex)`); continue; }
        // Never spread a key that is typed into a node (e.g. an x-api-key header) to a second node.
        if (secretPairIn(src.node.parameters) || secretKeyIn(Object.fromEntries(Object.entries(src.node.parameters ?? {}).filter(([key]) => !AUTH_SELECTORS.includes(key))))) {
          refused.push(`"${n.from}" holds a key, token or password in its parameters; copying it would spread that secret (Manual (Alex))`); continue;
        }
        node = structuredClone(src.node);
        node.id = randomUUID(); node.name = n.name; node.position = [...n.position];
        if (node.webhookId) node.webhookId = randomUUID();
        node.parameters ??= {};
        let bad = false;
        for (const [path, v] of Object.entries(n.parameterOverrides ?? {})) {
          try {
            const container = setPath(node.parameters, path, v);
            if (typeof container?.name === 'string' && SECRETISH.test(container.name)) { refused.push(`"${n.name} › ${path}" is the value of "${container.name}"`); bad = true; break; }
          } catch (e) { invalid.push(`"${n.name} › ${path}": ${(e as Error).message}`); bad = true; break; }
        }
        if (bad) continue;
      }
      next.nodes.push(node);
      lines.push(describeN8nChange(c, next));
      continue;
    }
    if (k === 'connect' || k === 'disconnect') {
      const l = k === 'connect' ? (c as N8nConnect).connect : (c as N8nDisconnect).disconnect;
      const missing = [l.from, l.to].filter((name) => !hasNode(next, name));
      if (missing.length) { mismatches.push(missing.map((m) => `node "${m}" not found`).join('; ')); continue; }
      const idx = outIndex(next, l);
      if (typeof idx !== 'number') { invalid.push(idx.error); continue; }
      const exists = linkExists(next, l, idx);
      if (k === 'connect') {
        if (exists) { mismatches.push(`${linkWords(next, l, idx)} is already connected`); continue; }
        const outs = ((next.connections[l.from] ??= {}).main ??= []) as any[];
        while (outs.length <= idx) outs.push([]);
        (outs[idx] ??= []).push({ node: l.to, type: 'main', index: l.toIndex });
        if (l.output === 'error') errorLinks.push(l);
      } else {
        if (!exists) { mismatches.push(`${linkWords(next, l, idx)} is not connected`); continue; }
        const outs = next.connections[l.from].main as any[];
        outs[idx] = outs[idx].filter((x: any) => !(x?.node === l.to && (x?.type ?? 'main') === 'main' && (x?.index ?? 0) === l.toIndex));
      }
      lines.push(describeN8nChange(c, next));
      continue;
    }
    if (k === 'nodeSetting') {
      const s = (c as N8nNodeSetting).nodeSetting; const spec = NODE_SETTINGS[s.key];
      const f = nodeFor(next, s.node);
      if ('error' in f) { mismatches.push(f.error); continue; }
      const now = nodeSettingNow(f.node, s.key);
      if (!sameValue(now, eff(s.old, spec.dflt))) { mismatches.push(`"${s.node}" setting ${spec.label} is now ${short(now)} (Riley read ${short(eff(s.old, spec.dflt))})`); continue; }
      if (s.new === null) delete f.node[s.key]; else f.node[s.key] = s.new;
      lines.push(describeN8nChange(c, next));
      continue;
    }
    if (k === 'workflowSetting') {
      const s = (c as N8nWorkflowSetting).workflowSetting; const spec = WORKFLOW_SETTINGS[s.key];
      const now = wfSettingNow(next, s.key);
      if (!sameValue(now, eff(s.old, spec.dflt))) { mismatches.push(`workflow setting ${spec.label} is now ${short(now)} (Riley read ${short(eff(s.old, spec.dflt))})`); continue; }
      next.settings = { ...(next.settings ?? {}), [s.key]: s.new };
      lines.push(describeN8nChange(c, next));
      continue;
    }
    // A parameter change ({old, new} or {find, replace}).
    const p = c as N8nParamChange;
    const now = currentValue(next, p);
    if ('error' in now) { mismatches.push(now.error); continue; }
    // A header/query pair like {name: "Authorization", value: "..."}: the value is a secret.
    const pairName = now.container && typeof now.container.name === 'string' ? now.container.name : '';
    if (SECRETISH.test(pairName)) { refused.push(`"${p.node} › ${p.path}" is the value of "${pairName}"`); continue; }
    let newValue: unknown = p.new;
    if (p.find !== undefined) {
      const r = resolveTextEdit(now.value, p);
      if ('error' in r) { mismatches.push(r.error); continue; }
      newValue = r.new;
    } else if (p.path === '$disabled' ? Boolean(now.value) !== Boolean(p.old ?? false) : !sameValue(now.value, p.old)) {
      mismatches.push(`"${p.node} › ${p.path}" is now ${short(now.value)} (Riley read ${short(p.old)})`); continue;
    }
    const f = nodeFor(next, p.node) as { node: any };
    if (p.path === '$disabled') { f.node.disabled = p.new === true; if (!f.node.disabled) delete f.node.disabled; }
    else setPath((f.node.parameters ??= {}), p.path, newValue);
    lines.push(describeN8nChange(c, next));
  }
  // An error output only fires when the node is set to "Continue (using error output)".
  for (const l of errorLinks) {
    const f = nodeFor(next, l.from);
    if (!('error' in f) && f.node.onError !== 'continueErrorOutput') invalid.push(`'${l.from}' error output is wired, but its On Error setting is not "Continue (using error output)" (add a nodeSetting onError → continueErrorOutput)`);
  }
  return { next, mismatches, refused, invalid, lines };
}

/** Does the workflow already hold every change (the PUT went through)? none of them (it did not)? */
export function patchState(wf: any, patch: N8nPatch): 'applied' | 'not_applied' | 'mixed' {
  const done = (c: N8nChange): boolean => {
    const k = kindOf(c);
    if (k === 'addNode') { const n = (c as N8nAddNode).addNode; return (wf?.nodes ?? []).some((x: any) => x?.name === n.name && x?.type === n.type); }
    if (k === 'copyNode') return hasNode(wf, (c as N8nCopyNode).copyNode.name);
    if (k === 'connect' || k === 'disconnect') {
      const l = k === 'connect' ? (c as N8nConnect).connect : (c as N8nDisconnect).disconnect;
      const idx = outIndex(wf, l); const exists = typeof idx === 'number' && linkExists(wf, l, idx);
      return k === 'connect' ? exists : typeof idx === 'number' && !exists;
    }
    if (k === 'nodeSetting') { const s = (c as N8nNodeSetting).nodeSetting; const f = nodeFor(wf, s.node); return !('error' in f) && sameValue(nodeSettingNow(f.node, s.key), eff(s.new, NODE_SETTINGS[s.key].dflt)); }
    if (k === 'workflowSetting') { const s = (c as N8nWorkflowSetting).workflowSetting; return sameValue(wfSettingNow(wf, s.key), s.new); }
    return paramIs(c as N8nParamChange, 'new');
  };
  const notYet = (c: N8nChange): boolean => {
    const k = kindOf(c);
    if (k === 'addNode') return !hasNode(wf, (c as N8nAddNode).addNode.name);
    if (k === 'copyNode') return !hasNode(wf, (c as N8nCopyNode).copyNode.name);
    if (k === 'connect' || k === 'disconnect') {
      const l = k === 'connect' ? (c as N8nConnect).connect : (c as N8nDisconnect).disconnect;
      const idx = outIndex(wf, l); const exists = typeof idx === 'number' && linkExists(wf, l, idx);
      return k === 'connect' ? !exists : exists;
    }
    if (k === 'nodeSetting') { const s = (c as N8nNodeSetting).nodeSetting; const spec = NODE_SETTINGS[s.key]; const f = nodeFor(wf, s.node); return !('error' in f) && sameValue(nodeSettingNow(f.node, s.key), eff(s.old, spec.dflt)); }
    if (k === 'workflowSetting') { const s = (c as N8nWorkflowSetting).workflowSetting; const spec = WORKFLOW_SETTINGS[s.key]; return sameValue(wfSettingNow(wf, s.key), eff(s.old, spec.dflt)); }
    return paramIs(c as N8nParamChange, 'old');
  };
  // Parameter changes. Text edits: applied = the replacement is there and the found text is gone (or is part of it).
  function paramIs(c: N8nParamChange, side: 'old' | 'new'): boolean {
    const n = currentValue(wf, c);
    if ('error' in n) return false;
    if (c.find !== undefined) {
      if (typeof n.value !== 'string') return false;
      const t = n.value;
      return side === 'new'
        ? t.includes(c.replace as string) && occurrences(t, c.find) <= occurrences(c.replace as string, c.find)
        : occurrences(t, c.find) === 1 && !t.includes(c.replace as string);
    }
    const v = side === 'new' ? c.new : c.old;
    return c.path === '$disabled' ? Boolean(n.value) === Boolean(v ?? false) : sameValue(n.value, v);
  }
  if (patch.changes.every(done)) return 'applied';
  if (patch.changes.every(notYet)) return 'not_applied';
  return 'mixed';
}

/**
 * Settings to send with a rollback: n8n merges the settings it is sent into the saved ones, so a setting
 * the fix added (absent before) must be put back to n8n's default explicitly.
 */
export function rollbackSettings(previous: any, patch: N8nPatch): Record<string, unknown> {
  const out: Record<string, unknown> = { ...(previous?.settings ?? {}) };
  for (const c of patch.changes) {
    if (kindOf(c) !== 'workflowSetting') continue;
    const { key } = (c as N8nWorkflowSetting).workflowSetting;
    if (out[key] === undefined && WORKFLOW_SETTINGS[key]?.dflt !== null) out[key] = WORKFLOW_SETTINGS[key].dflt;
  }
  return out;
}

// The n8n public API PUT accepts only these settings keys (from automations/n8n-fix.mjs; availableInMCP is in the
// public API since n8n 1.119, the same release as callerPolicy). n8n merges what is sent into the saved settings.
const SETTINGS = ['executionOrder', 'errorWorkflow', 'timezone', 'saveDataErrorExecution', 'saveDataSuccessExecution', 'saveManualExecutions', 'saveExecutionProgress', 'executionTimeout', 'callerPolicy', 'callerIds', 'availableInMCP'];
for (const k of Object.keys(WORKFLOW_SETTINGS)) if (!SETTINGS.includes(k)) throw new Error(`workflowSetting ${k} must be in putBody's SETTINGS`);
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
    if (plan.invalid.length) return stop('Fix failed', `n8n fix not applied: ${plan.invalid.join('; ')}. Nothing changed; Riley corrects the patch.`);
    if (plan.mismatches.length) return stop('New', `n8n fix not applied: "${wf.name}" changed since diagnosis: ${plan.mismatches.join('; ')}. Nothing changed; Riley diagnoses it again.`);
    const what = `${plan.lines.length} change(s) in "${wf.name}": ${plan.lines.join('; ')}`;
    if (ctx.dryRun) return { message: `Would apply ${what} (dry run)`, dryRun: true };
    await at.update(ISSUES, issue.id, { [F.status]: 'Approved', [F.result]: `Approved. The patch still matches n8n (${what}), but the engine's n8n apply is off (${N8N_APPLY_STAGE} not in LIVE_STAGES): nothing changed in n8n. Riley posts the exact steps on his next run.`.slice(0, 5000) });
    return { message: `Approved: ${title}. n8n apply is off (add ${N8N_APPLY_STAGE} to LIVE_STAGES); Riley posts the steps. Checked: ${what}` };
  }

  const saved = await ctx.step('n8n:check', async () => {
    const { wf, plan } = await check();
    if (plan.refused.length) return { refused: plan.refused };
    if (plan.invalid.length) return { invalid: plan.invalid };
    if (plan.mismatches.length) return { mismatches: plan.mismatches, name: String(wf.name ?? '') };
    const row = (await ctx.db.query(
      `INSERT INTO riley_n8n_rollbacks (issue_id, workflow_id, workflow_name, job_id, previous, patch, was_active) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
      [issue.id, patch.workflowId, String(wf.name ?? ''), ctx.job.id, JSON.stringify(wf), JSON.stringify(patch), Boolean(wf.active)])).rows[0];
    return { rollbackId: Number(row.id), name: String(wf.name ?? ''), active: Boolean(wf.active), lines: plan.lines };
  });
  if (saved.refused) return stop('Fix failed', `n8n fix refused: ${saved.refused.join('; ')}. The engine never changes credentials, keys, tokens or passwords. Nothing changed.`);
  if (saved.invalid) return stop('Fix failed', `n8n fix not applied: ${saved.invalid.join('; ')}. Nothing changed; Riley corrects the patch.`);
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
  await n8n.put(row.workflow_id, { ...row.previous, settings: rollbackSettings(row.previous, row.patch as N8nPatch), staticData: now.staticData });
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

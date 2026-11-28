// `hooks connect [--yes]` (Alex 2026-11-28: "Yes, all the tools should be connected to the agents so they can use
// them when necessary", and no long manual setup). One command wires every provider the engine has a key for to
// its webhooks. Without --yes it is a dry run: it reads the providers and prints the plan, and changes nothing
// (no secret is made, no provider, Airtable or Postgres write).
//   EmailBison  every workspace with a key: one "Dulcy engine" webhook (never a second, others never touched).
//   Close       the engine's own webhook subscription; its signature key is stored sealed (never printed).
//   n8n         the "Dulcy engine hook" Header Auth credential and the "Dulcy engine: errors to Riley" workflow
//               (inactive: n8n runs error workflows without activation), then System Issues + Decisions with an
//               exact n8nPatch per workflow change (automations/instant-hooks-2026-11-28.md). Riley's n8n rule
//               applies them on Alex's ✅ (rileyN8n.ts); nothing in an existing workflow changes before that.
//   Airtable    left as is (HQ replaced most buttons; the bridge keeps its 30-second check).
//   Make        left to Riley's sweep (Make has no account-wide error webhook).
//   Slack, Fathom  Alex's two steps (their UI only); `hooks secret slack|fathom` stores the secret hidden.
// Idempotent: run it again any time; it adds only what is missing and says what is already there.
// Secrets: every line printed goes through redact() with every secret this run touched.
import type { Db } from '../db/pool.js';
import type { Config, HookSource } from '../config.js';
import type { AirtableClient } from '../providers/airtable.js';
import { createBisonClient } from '../providers/emailbison.js';
import { closeWebhooks } from '../providers/close.js';
import { ENGINE_CREDENTIAL_NAME, planN8nPatch, validateN8nPatch, type N8nChange, type N8nPatch } from '../agents/rileyN8n.js';
import { ISSUES, IF } from '../agents/riley.js';
import { DECISIONS, DF } from '../decisions/fields.js';
import { ensureSharedSecret, hookRow, markConnected, secretFor, setHookMeta, storeProviderSecret } from './secrets.js';

export const BISON_WEBHOOK_NAME = 'Dulcy engine';
/** EmailBison's API names for Contact Replied, Contact Interested, Untracked Reply Received, Email Bounced, Manual Email Sent. */
export const BISON_EVENTS = ['lead_replied', 'lead_interested', 'untracked_reply_received', 'email_bounced', 'manual_email_sent'];
export const CLOSE_EVENTS = [{ object_type: 'opportunity', action: 'created' }, { object_type: 'opportunity', action: 'updated' }];
export const ERROR_WORKFLOW_NAME = 'Dulcy engine: errors to Riley';
const EMAILS_TABLE = 'tblADFhWhTcLrl1UY';
const SIG = 'hooks-connect:';

export type SourceStatus = 'connected' | 'planned' | 'waiting' | 'needs_alex' | 'left' | 'off' | 'error';
export interface SourceResult { source: HookSource; status: SourceStatus; lines: string[]; cards?: string[] }
export interface ConnectResult { yes: boolean; sources: SourceResult[]; text: string }
export interface ConnectDeps { fetch?: typeof fetch; airtable?: Pick<AirtableClient, 'list' | 'create' | 'update'> | null }

// ---------- the n8n changes (automations/instant-hooks-2026-11-28.md) ----------
type From = { names: string[] } | { emailsCreates: true; plus?: string[] };
export interface HookTarget { group: 'replies' | 'placement' | 'bounce' | 'sent'; workflowId: string; label: string; event: string; node: string; body: string; from: From }
const reply = (workflowId: string, label: string, from: From = { emailsCreates: true }): HookTarget => ({ group: 'replies', workflowId, label, event: 'reply', node: 'Tell engine: reply', body: '{"event":"reply"}', from });
export const HOOK_TARGETS: HookTarget[] = [
  reply('NwlemmcwCZLCXAmt', '[INBOX MANAGER] Receive Replies from EmailBison'),
  reply('40Eey0ohIWGjjEwp', '[INBOX MANAGER] Bison Untracked Replies'),
  reply('4xyu4gVL6gKjEHLW', '[INBOX MANAGER] Receive Replies + Handwrytten Direct Mail'),
  reply('N701JraB7XoAiDfshPs8T', '[INBOX MANAGER] Receive Replies from HeyReach'),
  // Runs after both its create and its update path, so the Emails row is there either way.
  reply('QVK0WeDOVcpJLavy', '1.2 Positive Email Reply', { names: ['Update record'] }),
  reply('bPc1ANniCluNn0tP', '[INBOX MANAGER] Manually Mark Reply as Interested - EmailBison'),
  { group: 'placement', workflowId: 'xcteI9ofNLOqC0GO', label: '[Inbox Placement Tests] Check Results', event: 'placement_results', node: 'Tell engine: placement results', body: '{"event":"placement_results"}', from: { names: ['Update record'] } },
  { group: 'bounce', workflowId: 'nioXwxwNYsuBbHIOouCuW', label: '[Inbox Management] Bounce Data Tracker', event: 'bounce', node: 'Tell engine: bounce',
    body: "={{ JSON.stringify({ event: 'bounce', workspace_id: $('Webhook').item.json.body?.event?.workspace_id ?? null, workspace_name: $('Webhook').item.json.body?.event?.workspace_name ?? '' }) }}", from: { names: ['Create a record', 'Update record'] } },
  { group: 'sent', workflowId: 'ewcunE4ck0jS6IZh', label: 'Manual Emails Sent (Including Dulcy Reply Agent)', event: 'sent', node: 'Tell engine: sent', body: '{"event":"sent"}', from: { names: ['Update record1'] } },
];
const ERROR_BODY = "={{ JSON.stringify({ event: 'error', workflow: $json.workflow.name, execution: String($json.execution.id ?? ''), error: String($json.execution.error?.message ?? '').slice(0, 1000), executionUrl: $json.execution.url ?? '' }) }}";
const ERROR_NODE = 'Tell engine: error';
const GROUP_TITLE: Record<string, string> = {
  replies: 'Riley: tell the engine about new replies (Echo starts at once)',
  placement: 'Riley: tell the engine about placement results (account health starts at once)',
  bounce: 'Riley: tell the engine about bounces (the bounce check starts at once)',
  sent: 'Riley: tell the engine about manual sends (Echo’s follow-ups start at once)',
  errors: 'Riley: send n8n errors to Riley at once',
};

/** The HTTP node that tells the engine (On Error = Continue, so the workflow carries on as today if the engine is down). */
export function hookNode(base: string, credentialId: string, name: string, body: string, position: [number, number]) {
  return {
    name, type: 'n8n-nodes-base.httpRequest', typeVersion: 4.2, position,
    parameters: { method: 'POST', url: `${base}/hooks/n8n`, sendBody: true, specifyBody: 'json', jsonBody: body, options: { timeout: 10000 } },
    credentials: { httpHeaderAuth: { id: credentialId, name: ENGINE_CREDENTIAL_NAME } },
  };
}

const nodesOf = (wf: any): any[] => (Array.isArray(wf?.nodes) ? wf.nodes : []);
const tableOf = (n: any) => { const t = n?.parameters?.table; return String((t && typeof t === 'object' ? t.value : t) ?? ''); };
/** The nodes the engine call goes after, as they are in the live workflow (missing = they were renamed). */
export function fromNodes(wf: any, t: HookTarget): { found: string[]; missing: string[] } {
  if ('names' in t.from) { const have = new Set(nodesOf(wf).map((n) => n.name)); return { found: t.from.names.filter((x) => have.has(x)), missing: t.from.names.filter((x) => !have.has(x)) }; }
  const found = nodesOf(wf).filter((n) => /\.airtable$/.test(String(n.type)) && n.parameters?.operation === 'create' && tableOf(n).includes(EMAILS_TABLE)).map((n) => String(n.name));
  return { found, missing: found.length ? [] : ['an Airtable node that creates the Emails row'] };
}
function placeAfter(wf: any, names: string[]): [number, number] {
  const ps = nodesOf(wf).filter((n) => names.includes(n.name)).map((n) => (Array.isArray(n.position) ? n.position : [0, 0]) as [number, number]);
  if (!ps.length) return [0, 0];
  return [Math.round(Math.max(...ps.map((p) => p[0])) + 260), Math.round(ps.reduce((a, p) => a + p[1], 0) / ps.length)];
}
/** The exact patch for one target (validated, and checked against the live workflow with the engine credential). */
export function targetPatch(wf: any, t: HookTarget, base: string, credentialId: string): { patch: N8nPatch } | { done: true } | { error: string } {
  if (nodesOf(wf).some((n) => n.name === t.node)) return { done: true };
  const { found, missing } = fromNodes(wf, t);
  if (!found.length || missing.length) return { error: `"${t.label}": ${missing.map((m) => `node "${m}"`).join(', ')} not found (renamed since 2026-11-17?)` };
  const changes: N8nChange[] = [
    { addNode: hookNode(base, credentialId, t.node, t.body, placeAfter(wf, found)) as any },
    { nodeSetting: { node: t.node, key: 'onError', old: null, new: 'continueRegularOutput' } },
    ...found.map((f) => ({ connect: { from: f, output: 'main' as const, fromIndex: 0, to: t.node, toIndex: 0 } })),
  ];
  return checked(wf, { workflowId: String(wf.id), changes }, credentialId);
}
function checked(wf: any, raw: N8nPatch, credentialId: string): { patch: N8nPatch } | { error: string } {
  const v = validateN8nPatch(raw);
  if ('error' in v) return { error: v.error };
  const plan = planN8nPatch(wf, v.patch, { engineCredential: { id: credentialId, name: ENGINE_CREDENTIAL_NAME } });
  const bad = [...plan.refused, ...plan.invalid, ...plan.mismatches];
  return bad.length ? { error: `"${wf.name}": ${bad.join('; ')}` } : { patch: v.patch };
}
const errorTriggerOf = (wf: any) => nodesOf(wf).find((n) => String(n.type) === 'n8n-nodes-base.errorTrigger');
const isErrorOnly = (wf: any) => !!errorTriggerOf(wf) && !nodesOf(wf).some((n) => /trigger$|\.webhook$|\.cron$|\.schedule/i.test(String(n.type)) && String(n.type) !== 'n8n-nodes-base.errorTrigger');
const errSetting = (wf: any) => { const v = wf?.settings?.errorWorkflow; return typeof v === 'string' && v ? v : null; };

// ---------- n8n API (only what connect needs) ----------
function n8nApi(base: string, key: string, f: typeof fetch) {
  const root = `${base.replace(/\/+$/, '')}/api/v1`;
  async function api(method: string, path: string, body?: unknown): Promise<{ status: number; json: any }> {
    const r = await f(`${root}${path}`, { method, headers: { 'X-N8N-API-KEY': key, 'content-type': 'application/json', accept: 'application/json' }, body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(30_000) });
    const t = await r.text(); let json: any = {}; try { json = t ? JSON.parse(t) : {}; } catch { json = {}; }
    if (!r.ok && r.status !== 404) throw new Error(`n8n ${method} ${path.split('?')[0]}: HTTP ${r.status}`);
    return { status: r.status, json };
  }
  return {
    async workflows(): Promise<any[]> {
      const out: any[] = []; let cursor = '';
      for (let page = 0; page < 20; page++) {
        const r = await api('GET', `/workflows?limit=100${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`);
        out.push(...(Array.isArray(r.json?.data) ? r.json.data : []));
        cursor = String(r.json?.nextCursor ?? ''); if (!cursor) break;
      }
      return out;
    },
    async credentialExists(id: string): Promise<boolean | null> {
      // The public API has no read of one credential; its list (newer n8n) is used when there, else "unknown".
      try { const r = await api('GET', '/credentials?limit=250'); if (r.status === 404 || !Array.isArray(r.json?.data)) return null; return r.json.data.some((c: any) => String(c.id) === id); } catch { return null; }
    },
    async createCredential(secret: string): Promise<string> {
      const r = await api('POST', '/credentials', { name: ENGINE_CREDENTIAL_NAME, type: 'httpHeaderAuth', data: { name: 'x-hook-secret', value: secret } });
      const id = String(r.json?.id ?? '');
      if (r.status === 404 || !/^[A-Za-z0-9_-]{1,64}$/.test(id)) throw new Error('n8n did not create the credential (no id in the answer)');
      return id;
    },
    async createWorkflow(w: unknown): Promise<string> {
      const r = await api('POST', '/workflows', w);
      const id = String(r.json?.id ?? '');
      if (r.status === 404 || !id) throw new Error('n8n did not create the error workflow (no id in the answer)');
      return id;
    },
  };
}

export function errorWorkflowBody(base: string, credentialId: string) {
  const http = hookNode(base, credentialId, ERROR_NODE, ERROR_BODY, [260, 0]);
  return {
    name: ERROR_WORKFLOW_NAME,
    nodes: [
      { name: 'Error Trigger', type: 'n8n-nodes-base.errorTrigger', typeVersion: 1, position: [0, 0], parameters: {} },
      { ...http, parameters: { ...http.parameters, authentication: 'genericCredentialType', genericAuthType: 'httpHeaderAuth' }, onError: 'continueRegularOutput' },
    ],
    connections: { 'Error Trigger': { main: [[{ node: ERROR_NODE, type: 'main', index: 0 }]] } },
    settings: { executionOrder: 'v1' },
  };
}

// ---------- the run ----------
export async function hooksConnect(db: Db, cfg: Config, opts: { yes?: boolean } & ConnectDeps = {}): Promise<ConnectResult> {
  const yes = !!opts.yes;
  const f = opts.fetch ?? fetch;
  const base = cfg.enginePublicUrl.replace(/\/+$/, '');
  const secrets: string[] = [];
  const redact = (s: string) => secrets.filter((x) => x && x.length >= 8).reduce((t, x) => t.split(x).join('…'), s);
  const out: SourceResult[] = [];
  const add = (r: SourceResult) => { out.push({ ...r, lines: r.lines.map(redact), cards: r.cards?.map(redact) }); };
  const safe = async (source: HookSource, run: () => Promise<SourceResult>) => {
    try { add(await run()); } catch (e) { add({ source, status: 'error', lines: [`stopped: ${String((e as Error).message ?? e).slice(0, 300)}`] }); }
  };
  const known = async (s: HookSource) => { const v = await secretFor(db, cfg, s); if (v) secrets.push(v); return v; };

  await safe('emailbison', () => connectBison(db, cfg, yes, f, base, secrets, known));
  await safe('close', () => connectClose(db, cfg, yes, f, base, secrets, known));
  await safe('n8n', () => connectN8n(db, cfg, yes, f, base, secrets, known, opts.airtable));
  add({ source: 'airtable', status: 'left', lines: ['left as is: HQ does the buttons now; the Airtable bridge keeps its 30-second check'] });
  add({ source: 'make', status: 'left', lines: ['left to Riley: Make has no account-wide error webhook; Riley’s sweep reads Make runs'] });
  for (const s of ['slack', 'fathom'] as const) {
    const on = !!(cfg.hookSecretsEnv?.[s]) || (await hookRow(db, s))?.state === 'connected';
    add({ source: s, status: on ? 'connected' : 'needs_alex', lines: [on ? 'secret stored; events are accepted' : 'Alex’s step (below)'] });
  }
  return { yes, sources: out, text: redact(render(out, yes, cfg)) };
}

type Known = (s: HookSource) => Promise<string>;

async function connectBison(db: Db, cfg: Config, yes: boolean, f: typeof fetch, base: string, secrets: string[], known: Known): Promise<SourceResult> {
  const names = Object.keys(cfg.emailBisonKeys);
  if (!names.length) return { source: 'emailbison', status: 'off', lines: ['no EmailBison key on the server (EMAILBISON_KEY_<WORKSPACE>)'] };
  const secret = yes ? (await ensureSharedSecret(db, cfg, 'emailbison')).secret : await known('emailbison');
  secrets.push(secret);
  const want = secret ? `${base}/hooks/emailbison?key=${encodeURIComponent(secret)}` : '';
  const ours = (w: { name: string; url: string }) => w.name === BISON_WEBHOOK_NAME || w.url.startsWith(`${base}/hooks/emailbison`);
  const lines: string[] = []; let ok = 0, failed = 0;
  for (const ws of names) {
    const c = createBisonClient({ apiKey: cfg.emailBisonKeys[ws], baseUrl: cfg.emailBisonBaseUrl, teamId: cfg.emailBisonTeams[ws] || undefined, fetchImpl: f });
    try {
      const hooks = await c.listWebhooks();
      const mine = hooks.filter(ours);
      const first = mine[0];
      const full = first && want && first.url === want && BISON_EVENTS.every((e) => first.events.includes(e));
      const dup = mine.length > 1 ? ` (${mine.length - 1} more "Dulcy engine" webhook(s) there: left alone, delete them in EmailBison if not wanted)` : '';
      if (full) { ok++; lines.push(`${ws}: already connected${dup}`); continue; }
      if (!yes) { lines.push(`${ws}: would ${first ? 'update the "Dulcy engine" webhook (URL / events)' : 'add the "Dulcy engine" webhook'} → ${base}/hooks/emailbison?key=…, 5 events${dup}`); continue; }
      if (first) await c.updateWebhook(first.id, BISON_WEBHOOK_NAME, want, [...new Set([...first.events, ...BISON_EVENTS])]);
      else await c.createWebhook(BISON_WEBHOOK_NAME, want, BISON_EVENTS);
      ok++; lines.push(`${ws}: ${first ? 'updated' : 'added'} the "Dulcy engine" webhook (5 events)${dup}`);
    } catch (e) { failed++; lines.push(`${ws}: not done: ${String((e as Error).message).slice(0, 200)}`); }
  }
  if (yes && ok) { await markConnected(db, 'emailbison'); await setHookMeta(db, 'emailbison', { workspaces: names, connectedWorkspaces: ok, failedWorkspaces: failed, checkedAt: new Date().toISOString() }); }
  const status: SourceStatus = failed ? 'error' : ok === names.length ? 'connected' : yes ? 'waiting' : 'planned';
  return { source: 'emailbison', status, lines };
}

async function connectClose(db: Db, cfg: Config, yes: boolean, f: typeof fetch, base: string, secrets: string[], known: Known): Promise<SourceResult> {
  if (!cfg.closeApiKey) return { source: 'close', status: 'off', lines: ['no CLOSE_API_KEY on the server'] };
  secrets.push(cfg.closeApiKey);
  const url = `${base}/hooks/close`;
  const api = closeWebhooks(cfg.closeApiKey, f);
  const mine = (await api.list()).filter((w) => w.url === url);
  const have = await known('close');
  if (mine.length && have) return { source: 'close', status: 'connected', lines: [`already connected (subscription ${mine[0].id}${mine[0].status && mine[0].status !== 'active' ? `, status ${mine[0].status}: turn it on in Close → Settings → Developer → Webhooks` : ''})`] };
  if (cfg.hookSecretsEnv?.close) return { source: 'close', status: 'error', lines: ['HOOK_SECRET_CLOSE is set in the server .env but Close has no webhook for it: delete that line from .env, restart, and run this again (the engine then stores the key itself)'] };
  if (!yes) return { source: 'close', status: 'planned', lines: [mine.length ? 'would replace the engine’s own Close webhook (its signature key is not stored here), store the new key hidden' : 'would create the webhook (opportunity created / updated) and store its signature key hidden'] };
  // The engine's own subscription without its key cannot be checked: replace it (only that URL; others untouched).
  for (const w of mine) await api.remove(w.id);
  const made = await api.create(url, CLOSE_EVENTS);
  if (made.signatureKey) secrets.push(made.signatureKey);
  if (!/^[0-9a-f]{32,}$/i.test(made.signatureKey)) throw new Error('Close created no usable signature key; nothing stored');
  await storeProviderSecret(db, cfg, 'close', made.signatureKey, { webhookId: made.id, url });
  return { source: 'close', status: 'connected', lines: [`${mine.length ? 'replaced' : 'created'} the webhook (${made.id}); signature key stored hidden`] };
}

interface Card { group: string; issue: Record<string, unknown>; workflowId: string; line: string }

async function connectN8n(db: Db, cfg: Config, yes: boolean, f: typeof fetch, base: string, secrets: string[], known: Known, at?: ConnectDeps['airtable']): Promise<SourceResult> {
  if (!cfg.n8nApiKey) return { source: 'n8n', status: 'off', lines: ['no N8N_API_KEY on the server: n8n keeps today’s timers'] };
  secrets.push(cfg.n8nApiKey);
  const lines: string[] = [];
  const n8n = n8nApi(cfg.n8nBaseUrl, cfg.n8nApiKey, f);
  const secret = yes ? (await ensureSharedSecret(db, cfg, 'n8n')).secret : await known('n8n');
  secrets.push(secret);
  const meta = (await hookRow(db, 'n8n'))?.meta ?? {};

  // 1. The credential.
  let credId = typeof meta.credentialId === 'string' ? meta.credentialId : '';
  if (credId && (await n8n.credentialExists(credId)) === false) { lines.push(`credential "${ENGINE_CREDENTIAL_NAME}" (${credId}) is gone in n8n: ${yes ? 'made again' : 'would be made again'}`); credId = ''; }
  if (!credId) {
    if (!yes) lines.push(`would create the Header Auth credential "${ENGINE_CREDENTIAL_NAME}" (header x-hook-secret = the engine’s n8n secret)`);
    else { credId = await n8n.createCredential(secret); await setHookMeta(db, 'n8n', { credentialId: credId }); lines.push(`created the credential "${ENGINE_CREDENTIAL_NAME}" (${credId})`); }
  } else lines.push(`credential "${ENGINE_CREDENTIAL_NAME}" is there (${credId})`);
  const planId = credId || 'CREDENTIAL';

  // 2. The engine's error workflow (inactive: n8n runs an error workflow without activation).
  const all = await n8n.workflows();
  const byId = new Map(all.map((w) => [String(w.id), w]));
  let errId = typeof meta.errorWorkflowId === 'string' && byId.has(meta.errorWorkflowId) ? meta.errorWorkflowId : String(all.find((w) => w.name === ERROR_WORKFLOW_NAME)?.id ?? '');
  if (!errId) {
    if (!yes) lines.push(`would create the workflow "${ERROR_WORKFLOW_NAME}" (inactive; Error Trigger → tell the engine)`);
    else { errId = await n8n.createWorkflow(errorWorkflowBody(base, credId)); await setHookMeta(db, 'n8n', { errorWorkflowId: errId }); lines.push(`created the workflow "${ERROR_WORKFLOW_NAME}" (${errId}, inactive)`); }
  } else { lines.push(`workflow "${ERROR_WORKFLOW_NAME}" is there (${errId})`); if (meta.errorWorkflowId !== errId && yes) await setHookMeta(db, 'n8n', { errorWorkflowId: errId }); }
  const planErr = errId || 'ERRORWORKFLOW';

  // 3. The changes in the existing workflows (each becomes a card; nothing changes there before Alex's ✅).
  const cards: Card[] = []; let done = 0; const problems: string[] = [];
  const card = (group: string, wf: any, patch: N8nPatch, what: string) => cards.push({ group, workflowId: String(wf.id), line: `${wf.name}: ${what}`, issue: {
    [IF.title]: `n8n → engine: ${what} in "${String(wf.name).slice(0, 120)}"`.slice(0, 200), [IF.source]: 'Engine', [IF.where]: `n8n ${wf.id}`, [IF.signature]: `${SIG}${group}:${wf.id}`,
    [IF.error]: `Not an error: the instant-hooks set-up (hooks connect). ${what}.`, [IF.fixType]: 'n8n change',
    [IF.why]: 'Alex 2026-11-28: agents start the moment work arrives. This workflow must tell the engine (POST /hooks/n8n) when it has done its part.',
    [IF.fix]: `${what}. The new HTTP node uses the engine's own "${ENGINE_CREDENTIAL_NAME}" login and is set to On Error → Continue, so the workflow carries on exactly as today if the engine does not answer.`,
    [IF.rollback]: 'The engine saves the full previous workflow; undo with riley-n8n-rollback <this issue> --yes.',
    [IF.details]: JSON.stringify({ n8nPatch: patch, hooksConnect: { group, workflowId: String(wf.id) } }).slice(0, 20_000),
  } });
  for (const t of HOOK_TARGETS) {
    const wf = byId.get(t.workflowId);
    if (!wf) { problems.push(`"${t.label}" (${t.workflowId}) is not in n8n: skipped`); continue; }
    const p = targetPatch(wf, t, base, planId);
    if ('done' in p) { done++; continue; }
    if ('error' in p) { problems.push(p.error); continue; }
    card(t.group, wf, p.patch, `add "${t.node}" after ${fromNodes(wf, t).found.map((x) => `'${x}'`).join(', ')}`);
  }
  // Errors: workflows with no Error Workflow get the engine's; an existing shared error workflow forwards to the engine too.
  const active = all.filter((w) => w.active && String(w.id) !== planErr && !isErrorOnly(w));
  const shared = new Map<string, number>();
  for (const w of active) {
    const cur = errSetting(w);
    if (cur === planErr) { done++; continue; }
    if (cur && byId.has(cur)) { shared.set(cur, (shared.get(cur) ?? 0) + 1); continue; }
    const raw: N8nPatch = { workflowId: String(w.id), changes: [{ workflowSetting: { key: 'errorWorkflow', old: cur, new: planErr } }] };
    const v = errId ? checked(w, raw, planId) : { patch: raw };
    if ('error' in v) { problems.push(v.error); continue; }
    card('errors', w, v.patch, cur ? `point its Error Workflow (was ${cur}, which no longer exists) at "${ERROR_WORKFLOW_NAME}"` : `set its Error Workflow to "${ERROR_WORKFLOW_NAME}"`);
  }
  for (const [id, n] of shared) {
    const wf = byId.get(id)!;
    if (nodesOf(wf).some((x) => x.name === ERROR_NODE)) { done++; continue; }
    const trig = errorTriggerOf(wf);
    if (!trig) { problems.push(`"${wf.name}" (the error workflow of ${n} workflow(s)) has no Error Trigger: skipped`); continue; }
    const raw: N8nPatch = { workflowId: id, changes: [
      { addNode: hookNode(base, planId, ERROR_NODE, ERROR_BODY, placeAfter(wf, [trig.name]).map((x, i) => (i ? x + 200 : x)) as [number, number]) as any },
      { nodeSetting: { node: ERROR_NODE, key: 'onError', old: null, new: 'continueRegularOutput' } },
      { connect: { from: trig.name, output: 'main', fromIndex: 0, to: ERROR_NODE, toIndex: 0 } }] };
    const v = checked(wf, raw, planId);
    if ('error' in v) { problems.push(v.error); continue; }
    card('errors', wf, v.patch, `also tell the engine (it is the Error Workflow of ${n} active workflow(s))`);
  }

  // 4. Cards: one Decision per group, never a second card for a change already asked.
  const titles: string[] = [];
  let waiting = 0;
  if (cards.length) {
    if (!at) { lines.push(`${cards.length} n8n change(s) need cards, but there is no AIRTABLE_API_KEY on the server: not asked`); }
    else {
      const open = new Map<string, { id: string; status: string }>();
      for (const r of await at.list(ISSUES, `LEFT({Signature}, ${SIG.length})='${SIG}'`, [IF.signature, IF.status], 500)) {
        const st = String(r.fields[IF.status] ?? ''), sg = String(r.fields[IF.signature] ?? '');
        if (['New', 'Waiting for Alex', 'Approved', 'Applied', 'Rejected'].includes(st)) open.set(sg, { id: r.id, status: st });
      }
      const fresh = cards.filter((c) => { const o = open.get(c.issue[IF.signature] as string); if (o) { waiting++; if (o.status === 'Rejected') problems.push(`${c.line}: Alex said no; not asked again`); } return !o; });
      for (const group of ['replies', 'placement', 'bounce', 'sent', 'errors']) {
        const list = fresh.filter((c) => c.group === group);
        for (let i = 0; i < list.length; i += 40) {
          const part = list.slice(i, i + 40);
          const title = `${GROUP_TITLE[group]}: ${part.length} workflow${part.length === 1 ? '' : 's'}${list.length > 40 ? ` (part ${i / 40 + 1})` : ''}`;
          titles.push(title);
          if (!yes) continue;
          const ids: string[] = [];
          for (const c of part) ids.push(await at.create(ISSUES, { ...c.issue, [IF.status]: 'New', [IF.occurrences]: 1, [IF.firstSeen]: new Date().toISOString(), [IF.lastSeen]: new Date().toISOString() }));
          const dec = await at.create(DECISIONS, {
            [DF.title]: title.slice(0, 200), [DF.agent]: 'Riley', [DF.status]: 'New', [DF.client]: 'Dulcy (systems)',
            [DF.issue]: 'Agents start the moment work arrives (Alex 2026-11-28); these n8n workflows must tell the engine.',
            [DF.checked]: `Read live from n8n now: ${part.length} change(s), each checked against the workflow as it is (all or nothing per workflow).`,
            [DF.fix]: part.map((c) => `• ${c.line}`).join('\n').slice(0, 5000),
            [DF.details]: `System Issues: ${ids.join(', ')}. Each change is undone with riley-n8n-rollback <issue> --yes. Nothing secret is in n8n's nodes: the HTTP nodes use the "${ENGINE_CREDENTIAL_NAME}" login.`,
            [DF.action]: 'Apply Riley Fix', [DF.actionInput]: JSON.stringify(ids.length === 1 ? { issueId: ids[0] } : { issueIds: ids }),
          });
          for (const id of ids) await at.update(ISSUES, id, { [IF.status]: 'Waiting for Alex', [IF.decision]: dec });
          waiting += part.length;
        }
      }
    }
  }
  if (yes && titles.length) await setHookMeta(db, 'n8n', { cards: titles, cardsAt: new Date().toISOString() });
  lines.push(`${done} change(s) already live${cards.length ? yes ? `, ${cards.length} waiting for Alex’s ✅` : `, ${cards.length} would become cards for Alex’s ✅` : ''}`);
  for (const p of problems) lines.push(`needs Riley: ${p}`);
  const allLive = !cards.length && !problems.some((p) => !/not asked again/.test(p)) && !!credId && !!errId;
  if (allLive && yes) await markConnected(db, 'n8n');
  if (cards.length && (cfg.dryRun && !(cfg.liveStages.includes('riley.apply') && cfg.liveStages.includes('riley.n8n_apply')))) lines.push('note: LIVE_STAGES needs riley.apply,riley.n8n_apply or an approved card is only marked Approved (nothing changes in n8n)');
  const meta2 = (await hookRow(db, 'n8n'))?.meta ?? {};
  const status: SourceStatus = allLive ? 'connected' : !yes && (cards.length || !credId || !errId) ? 'planned' : cards.length || waiting ? 'waiting' : problems.length ? 'error' : 'waiting';
  return { source: 'n8n', status, lines, cards: status === 'connected' || status === 'error' ? [] : titles.length ? titles : (Array.isArray(meta2.cards) ? meta2.cards : []) };
}

const WORD: Record<SourceStatus, string> = { connected: 'connected', planned: 'not connected yet (--yes connects it)', waiting: 'waiting for a card', needs_alex: 'needs Alex', left: 'left as is', off: 'not set up (no key)', error: 'not finished' };
function render(out: SourceResult[], yes: boolean, cfg: Config): string {
  const L: string[] = [yes ? 'hooks connect: done.' : 'hooks connect (dry run: nothing was changed; run with --yes to do it):', ''];
  for (const r of out) { L.push(`${r.source.padEnd(10)} ${WORD[r.status]}`); for (const l of r.lines) L.push(`  · ${l}`); }
  const cards = out.flatMap((r) => r.cards ?? []);
  L.push('', 'Checklist');
  L.push(`  Connected: ${out.filter((r) => r.status === 'connected').map((r) => r.source).join(', ') || 'none yet'}`);
  L.push(`  Waiting for a card (${yes ? 'in Slack / HQ Decisions' : 'would be posted'}): ${cards.length ? '' : 'none'}`);
  for (const t of cards) L.push(`    - ${t}`);
  L.push('  Alex’s 2 steps:');
  const slack = out.find((r) => r.source === 'slack'), fathom = out.find((r) => r.source === 'fathom');
  if (slack?.status !== 'connected') L.push(
    '    1. Slack: api.slack.com/apps → Dulcy Agents → Basic Information → App Credentials → Signing Secret → Show → copy.',
    '       On the server: docker compose exec engine node dist/src/cli.js hooks secret slack   (paste; nothing is shown)',
    `       Then Event Subscriptions → On → Request URL ${cfg.enginePublicUrl}/hooks/slack (must say Verified) → Subscribe to bot events: reaction_added, message.channels → Save Changes (Reinstall if asked).`);
  else L.push('    1. Slack: done.');
  if (fathom?.status !== 'connected') L.push(
    `    2. Fathom: Settings → API Access → Add webhook → URL ${cfg.enginePublicUrl}/hooks/fathom, event "New meeting content ready", recordings mine + shared with me → Save → copy the whsec_ secret it shows once.`,
    '       On the server: docker compose exec engine node dist/src/cli.js hooks secret fathom   (paste; nothing is shown)');
  else L.push('    2. Fathom: done.');
  return L.join('\n');
}

// Small n8n fixes through the n8n API (run on the server, keys typed in, never saved).
//   placement-30 : [Inbox Placement Tests] Check Results runs every 30 min instead of every 1 min
//   lock-actions : EmailBison Actions webhook requires header X-Dulcy-Key (value from ACTIONS_KEY)
//   replier-off  : switch off the old n8n Reply Agent (drafters, follow-up scheduler, sender, reconcile, provision) when Echo goes live
//   replier-on   : switch them back on (undo)
//   followup-arm-off : in 'Manual Emails Sent', switch off only the node that arms the old follow-up timer (Echo arms follow-ups now)
//   followup-arm-on  : switch that node back on (undo)
//   spam-protocol-off: switch off '[Email Accounts] Automated Spam Protocol' (the engine's account.health loop replaces it)
//   spam-protocol-on : switch it back on (undo)
// Usage:
//   read -s -p "n8n API key: " K; echo; docker exec -i -e N8N_API_KEY="$K" -e FIX=placement-30 deploy-engine-1 node --input-type=module - < /opt/dulcy-os/automations/n8n-fix.mjs
const BASE = process.env.N8N_URL || 'https://n8n.dulcy.io';
const KEY = process.env.N8N_API_KEY, FIX = process.env.FIX;
if (!KEY || !FIX) { console.error('N8N_API_KEY and FIX are required'); process.exit(1); }

async function api(method, path, body) {
  const r = await fetch(`${BASE}/api/v1${path}`, { method, headers: { 'X-N8N-API-KEY': KEY, 'content-type': 'application/json', accept: 'application/json' }, body: body ? JSON.stringify(body) : undefined });
  const t = await r.text();
  if (!r.ok) throw new Error(`${method} ${path}: HTTP ${r.status} ${t.slice(0, 300)}`);
  return t ? JSON.parse(t) : {};
}
const SETTINGS = ['executionOrder', 'errorWorkflow', 'timezone', 'saveDataErrorExecution', 'saveDataSuccessExecution', 'saveManualExecutions', 'saveExecutionProgress', 'executionTimeout', 'callerPolicy', 'callerIds'];
async function save(w) {
  const settings = Object.fromEntries(Object.entries(w.settings ?? {}).filter(([k]) => SETTINGS.includes(k)));
  await api('PUT', `/workflows/${w.id}`, { name: w.name, nodes: w.nodes, connections: w.connections, settings });
  if (w.active) { await api('POST', `/workflows/${w.id}/deactivate`).catch(() => {}); await api('POST', `/workflows/${w.id}/activate`); }
}

if (FIX === 'placement-30') {
  const w = await api('GET', '/workflows/xcteI9ofNLOqC0GO');
  let n = 0;
  for (const node of w.nodes) for (const i of node.parameters?.rule?.interval ?? []) {
    if (node.type.includes('scheduleTrigger') && i.field === 'minutes') { i.minutesInterval = 30; n++; }
  }
  if (!n) throw new Error('no minutes schedule found; nothing changed');
  await save(w);
  console.log(`Done: "${w.name}" now runs every 30 minutes (active: ${w.active}).`);
} else if (FIX === 'lock-actions') {
  const value = process.env.ACTIONS_KEY;
  if (!value || value.length < 24) throw new Error('ACTIONS_KEY (24+ characters) is required');
  const cred = await api('POST', '/credentials', { name: 'Dulcy Actions Key', type: 'httpHeaderAuth', data: { name: 'X-Dulcy-Key', value } });
  const w = await api('GET', '/workflows/cZtV7nPH2rZhwpDWgR_ak');
  const hook = w.nodes.find((x) => x.type === 'n8n-nodes-base.webhook');
  if (!hook) throw new Error('no webhook node found; nothing changed');
  hook.parameters.authentication = 'headerAuth';
  hook.credentials = { ...(hook.credentials ?? {}), httpHeaderAuth: { id: cred.id, name: cred.name } };
  await save(w);
  console.log(`Done: "${w.name}" now refuses calls without the X-Dulcy-Key header (active: ${w.active}).`);
} else if (FIX === 'replier-off' || FIX === 'replier-on') {
  const ids = ['DulcyReplyClientPilotV4', 'DulcyClientDraftOnlyV1', 'DulcyPilotSchedulerV4', 'DulcyReplyPilotSenderV4', 'DulcyReplyRecoveryV4', 'X8o_bx_MBS0h0mmrGKas-'];
  const verb = FIX === 'replier-off' ? 'deactivate' : 'activate';
  for (const id of ids) {
    try { const w = await api('POST', `/workflows/${id}/${verb}`); console.log(`${verb}d: ${w.name ?? id} (active: ${w.active})`); }
    catch (e) { console.log(`could not ${verb} ${id}: ${e.message}`); }
  }
} else if (FIX === 'followup-arm-off' || FIX === 'followup-arm-on') {
  const w = await api('GET', '/workflows/ewcunE4ck0jS6IZh');
  const node = w.nodes.find((x) => x.name === 'Schedule next approval-required follow-up');
  if (!node) throw new Error('node "Schedule next approval-required follow-up" not found; nothing changed');
  node.disabled = FIX === 'followup-arm-off';
  await save(w);
  console.log(`Done: "${node.name}" in "${w.name}" is now ${node.disabled ? 'OFF' : 'ON'}; the rest of the workflow is unchanged (active: ${w.active}).`);
} else if (FIX === 'spam-protocol-off' || FIX === 'spam-protocol-on') {
  const verb = FIX.endsWith('off') ? 'deactivate' : 'activate';
  const w = await api('POST', `/workflows/M3Hq5fkTvZLaJg9jVeq9X/${verb}`);
  console.log(`Done: "${w.name ?? 'Automated Spam Protocol'}" ${verb}d (active: ${w.active}).`);
} else throw new Error(`unknown FIX ${FIX}`);

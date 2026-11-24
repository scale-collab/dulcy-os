// Tag every n8n workflow "engine", "n8n + engine" or "n8n only" (Riley's audit, 2026-11-24),
// and list the ones that run every 1-2 minutes. Keeps any other tags a workflow already has.
// Run on the server (key typed in, never saved):
//   read -s -p "n8n API key: " K; echo; docker exec -i -e N8N_API_KEY="$K" deploy-engine-1 node --input-type=module - < /opt/dulcy-os/automations/n8n-tag.mjs
const BASE = process.env.N8N_URL || 'https://n8n.dulcy.io';
const KEY = process.env.N8N_API_KEY;
if (!KEY) { console.error('N8N_API_KEY missing'); process.exit(1); }

const ENGINE = ['iEt4c3iRAh6yeP7lYMlI9', 'xQ7MBWv2NZxJAePL', 'Tvppie6mLHe-16Gmhfzjs', 'mWfsR4TbaUflfW-jyWaDE', 'MdXafHjQI3Sx8Hhxg6uh6', 'T_KveEbSPrwKFWz2neZ6k', 'wkSiI4UDwyW3_yga47_EB', 'DulcyExpansionAlertsV1', 'CWKS3aMtFhOpndTFcAhPC', 'DulcyTAMFinder20260925', '0k2YgRVL7RmgREA6fGRV-', '4VK2fq5Ijrzcaa0Wp3n7i', 'S2_1UX8GnAKPiYvWqj74s', 'JXPiiC2XLCvxCRqzEKk_0', 'SndrUpdateMain26A', 'RVqeMy8nHj0IJhzrXV7fz', '5mYSkrScgo-707PxNzIZD', 'JxuNId4AYebdQgPe'];
const BOTH = ['KqkYFOs5AZ1RM3G-F1AWu', 'dZXXFKkn-ggXAz8VXMxtw', 'cZtV7nPH2rZhwpDWgR_ak', 'ycmdunLvpxt2SJWufXWaj', '5_rghJCEgbnhdO_qHIlVv', '8XuaP0rbqqxsyYWNOYWVI'];
const TAGS = ['engine', 'n8n + engine', 'n8n only'];

async function api(method, path, body) {
  const r = await fetch(`${BASE}/api/v1${path}`, { method, headers: { 'X-N8N-API-KEY': KEY, 'content-type': 'application/json', accept: 'application/json' }, body: body ? JSON.stringify(body) : undefined });
  const t = await r.text();
  if (!r.ok) throw new Error(`${method} ${path}: HTTP ${r.status} ${t.slice(0, 200)}`);
  return t ? JSON.parse(t) : {};
}
async function all(path) {
  const out = []; let cursor;
  do { const r = await api('GET', `${path}${path.includes('?') ? '&' : '?'}limit=250${cursor ? `&cursor=${cursor}` : ''}`); out.push(...(r.data ?? [])); cursor = r.nextCursor; } while (cursor);
  return out;
}

const tagId = {};
for (const t of await all('/tags')) tagId[t.name] = t.id;
for (const name of TAGS) if (!tagId[name]) tagId[name] = (await api('POST', '/tags', { name })).id;

const wfs = await all('/workflows');
let done = 0, failed = 0; const counts = { engine: 0, 'n8n + engine': 0, 'n8n only': 0 }; const fast = [];
for (const w of wfs) {
  const want = ENGINE.includes(w.id) ? 'engine' : BOTH.includes(w.id) ? 'n8n + engine' : 'n8n only';
  const keep = (w.tags ?? []).filter((t) => !TAGS.includes(t.name)).map((t) => ({ id: t.id }));
  try { await api('PUT', `/workflows/${w.id}/tags`, [...keep, { id: tagId[want] }]); done++; counts[want]++; }
  catch (e) { failed++; console.log(`could not tag ${w.name} (${w.id}): ${e.message}`); }
  for (const n of w.nodes ?? []) for (const i of n.parameters?.rule?.interval ?? []) {
    if (n.type?.includes('scheduleTrigger') && (i.field === 'seconds' || (i.field === 'minutes' && Number(i.minutesInterval ?? 1) <= 2))) fast.push(`${w.active ? 'ON ' : 'off'}  every ${i.field === 'seconds' ? `${i.secondsInterval ?? 1}s` : `${i.minutesInterval ?? 1} min`}  ${w.name} (${w.id})`);
  }
}
console.log(`\nTagged ${done} of ${wfs.length} workflows (${failed} failed): engine ${counts.engine}, n8n + engine ${counts['n8n + engine']}, n8n only ${counts['n8n only']}`);
console.log(`\nRunning every 1-2 minutes:\n${fast.join('\n') || '(none)'}`);

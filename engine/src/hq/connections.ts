// HQ Team → Connections (2026-11-28): each webhook source and whether its events reach the agents.
// Connected / Waiting for a card / Needs Alex / Not set up / Kept on its check, with the last event received.
// Read only. No secret, key or URL with a key is ever in this answer.
import type { Db } from '../db/pool.js';
import type { Config, HookSource } from '../config.js';
import { HOOK_SOURCES } from '../config.js';
import { hookRows } from '../instant/secrets.js';

export type ConnectionStatus = 'connected' | 'waiting' | 'needs_alex' | 'not_set_up' | 'kept';
export interface Connection { source: HookSource; name: string; feeds: string; status: ConnectionStatus; note: string; lastEvent: string | null; events24h: number; cards: string[] }

const NAMES: Record<HookSource, { name: string; feeds: string }> = {
  emailbison: { name: 'EmailBison', feeds: 'Echo (replies), the bounce check, follow-ups' },
  n8n: { name: 'n8n', feeds: 'Echo, account health, the bounce check, Riley (errors)' },
  close: { name: 'Close', feeds: 'the Won sync' },
  slack: { name: 'Slack', feeds: 'Decisions (✅/❌), Ledger’s check channel' },
  fathom: { name: 'Fathom', feeds: 'Cole (call reviews)' },
  airtable: { name: 'Airtable', feeds: 'Airtable buttons (HQ does most of them now)' },
  make: { name: 'Make', feeds: 'Riley (Make errors)' },
};

export async function connectionsView(db: Db, cfg: Config): Promise<{ connections: Connection[]; command: string }> {
  const rows = new Map((await hookRows(db)).map((r) => [r.source, r]));
  const last = new Map((await db.query(`SELECT source, max(received_at) AS at, count(*) FILTER (WHERE received_at > now() - interval '24 hours')::int AS n FROM hook_events GROUP BY source`)).rows.map((r) => [r.source, r]));
  const out: Connection[] = [];
  for (const s of HOOK_SOURCES) {
    const row = rows.get(s);
    const on = !!cfg.hookSecretsEnv?.[s] || row?.state === 'connected';
    const cards = Array.isArray(row?.meta?.cards) ? (row!.meta.cards as unknown[]).map(String).slice(0, 10) : [];
    let status: ConnectionStatus; let note: string;
    if (on) { status = 'connected'; note = 'Events start the agent at once.'; }
    else if (s === 'slack' || s === 'fathom') { status = 'needs_alex'; note = s === 'slack' ? 'Slack app → Signing Secret and Event Subscriptions (Engine guide, 2 steps).' : 'Fathom → Settings → API Access → Add webhook (Engine guide).'; }
    else if (s === 'airtable') { status = 'kept'; note = 'Left as is: the Airtable bridge keeps its 30-second check.'; }
    else if (s === 'make') { status = 'kept'; note = 'Left to Riley’s sweep (Make has no account-wide error webhook).'; }
    else if (s === 'n8n' && cards.length) { status = 'waiting'; note = 'Approve the Riley cards; n8n then tells the engine.'; }
    else if (row) { status = 'waiting'; note = 'Set up; waiting for the first event.'; }
    else { status = 'not_set_up'; note = 'Run hooks connect on the server.'; }
    const l = last.get(s);
    out.push({ source: s, ...NAMES[s], status, note, lastEvent: l?.at ? new Date(l.at).toISOString() : null, events24h: Number(l?.n ?? 0), cards: status === 'waiting' ? cards : [] });
  }
  return { connections: out, command: 'docker compose exec engine node dist/src/cli.js hooks connect' };
}

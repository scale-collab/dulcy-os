// HQ Batch 3 (Alex 2026-11-27, Deliverability part 2): "Every agent suggestion at the top of a screen
// gets a Fix it button (hands the fix to that agent)". A press opens (or re-opens) one task on that
// agent's own list, with the note's Problem → Data → Fix, so the agent picks it up and Ada watches it.
// Writes only HQ's own task table. Another builder adds a shared button (hq/web/src/fixIt.tsx); this
// endpoint is the local one Deliverability uses until they are reconciled.
import { createHash } from 'node:crypto';
import type { Db } from '../db/pool.js';
import { agentByName } from './agents.js';
import { dueIn, upsertAgentTask } from './agentTasks.js';
import { cleanActionUrl } from './asks.js';

const line = (x: unknown, max: number) => String(x ?? '').replace(/\s+/g, ' ').trim().slice(0, max);

/** Check a Fix-it press. Pure. */
export function parseFixRequest(b: any): { ok: true; agent: string; problem: string; data: string; fix: string; link: string | null } | { ok: false; error: string } {
  const agent = agentByName(String(b?.agent ?? ''));
  if (!agent) return { ok: false, error: 'unknown agent' };
  const problem = line(b?.problem, 200);
  if (!problem) return { ok: false, error: 'the problem, please' };
  const link = b?.link ? cleanActionUrl(String(b.link)) : null;
  return { ok: true, agent, problem, data: line(b?.data, 600), fix: line(b?.fix, 300), link: link || null };
}

export async function requestFix(db: Db, body: any, by: string, canAsk: (agent: string) => boolean) {
  const p = parseFixRequest(body);
  if (!p.ok) return { status: 400, body: { error: p.error } };
  if (!canAsk(p.agent)) return { status: 404, body: { error: 'no such agent' } };
  const key = `fixit:${p.agent}:${createHash('sha256').update(p.problem.toLowerCase()).digest('hex').slice(0, 16)}`;
  const r = await upsertAgentTask(db, {
    agent: p.agent, key, title: `Fix: ${p.problem}`.slice(0, 200), status: 'open', priority: 'high', due: dueIn(1), link: p.link,
    note: `Asked by ${by} in HQ.${p.fix ? ` Suggested: ${p.fix}` : ''}`, details: [p.data && `Data: ${p.data}`, p.fix && `Fix: ${p.fix}`].filter(Boolean).join('\n'),
  });
  if ('error' in r) return { status: 400, body: { error: r.error } };
  return { status: 200, body: { ok: true, taskId: r.id, created: r.created, agent: p.agent } };
}

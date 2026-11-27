// "Have <Agent> fix it" (Alex, 2026-11-27): every agent suggestion on an HQ screen gets a Fix it
// button. Pressing it puts the suggestion on that agent's own task list (hq_agent_tasks, the same
// list Team shows), so the agent picks it up and Ada's morning check chases it if it stalls.
// It only queues the work: nothing is sent, launched or changed by pressing it.
import { createHash } from 'node:crypto';
import type { Db } from '../db/pool.js';
import type { HqUser } from './auth.js';
import { agentByName } from './agents.js';
import { cleanActionUrl } from './asks.js';
import { upsertAgentTask } from './agentTasks.js';
import { canTalkTo } from './chat.js';

const oneLine = (x: unknown, max: number) => String(x ?? '').replace(/\s+/g, ' ').trim().slice(0, max);

/** The task key for one suggestion: pressing Fix it twice keeps one task. */
export const fixItKey = (agent: string, title: string, client: string) =>
  `fixit:${agent}:${createHash('sha256').update(`${client.toLowerCase()}|${title.toLowerCase()}`).digest('hex').slice(0, 16)}`;

/** Turn a suggestion into a task on that agent's list. Returns the HTTP status and the task. */
export async function fixIt(db: Db, user: HqUser, body: any): Promise<{ status: number; error?: string; task?: { id: number; agent: string; created: boolean; title: string } }> {
  const agent = agentByName(String(body?.agent ?? ''));
  if (!agent || !canTalkTo(user, agent)) return { status: 400, error: 'Which agent should fix it?' };
  const title = oneLine(body?.title, 200);
  if (!title) return { status: 400, error: 'What should be fixed? (a title, please)' };
  const detail = String(body?.detail ?? '').trim().slice(0, 2000);
  const client = oneLine(body?.client, 120);
  const link = cleanActionUrl(body?.link);
  const key = fixItKey(agent, title, client);
  // A task already being worked keeps its status; a done one is reopened.
  const old = (await db.query(`SELECT status FROM hq_agent_tasks WHERE source_key=$1`, [key])).rows[0];
  const r = await upsertAgentTask(db, {
    agent, key, title, details: detail, client, priority: 'high', ...(link ? { link } : {}),
    ...(!old || old.status === 'done' ? { status: 'open' as const, note: `Asked in HQ by ${user.name}: fix it` } : {}),
  });
  if ('error' in r) return { status: 400, error: r.error };
  return { status: 200, task: { id: r.id, agent, created: r.created, title } };
}

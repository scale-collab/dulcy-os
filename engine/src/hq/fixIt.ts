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
import type { Config } from '../config.js';
import { fireAgentSoon } from '../agents/fire.js';

/**
 * How the task came about, for the routine's start text (Alex 2026-11-28: agents start instantly):
 * 'fixit' = a Fix it / "Ask <agent> now" button, 'approved' = Alex approved a card that runs nothing,
 * 'changes' = Alex pressed Request changes on a final clip or video.
 */
export type FixItHow = 'fixit' | 'approved' | 'changes';
const HOW: Record<FixItHow, (who: string) => string> = { fixit: (w) => `${w} asked in HQ (Fix it)`, approved: (w) => `${w} approved`, changes: (w) => `${w} requested changes` };

const oneLine = (x: unknown, max: number) => String(x ?? '').replace(/\s+/g, ' ').trim().slice(0, max);

/** The task key for one suggestion: pressing Fix it twice keeps one task. */
export const fixItKey = (agent: string, title: string, client: string) =>
  `fixit:${agent}:${createHash('sha256').update(`${client.toLowerCase()}|${title.toLowerCase()}`).digest('hex').slice(0, 16)}`;

/** Turn a suggestion into a task on that agent's list. Returns the HTTP status and the task. */
export async function fixIt(db: Db, user: HqUser, body: any, opts: { cfg?: Pick<Config, 'agentFire'>; how?: FixItHow; fireKey?: string } = {}): Promise<{ status: number; error?: string; task?: { id: number; agent: string; created: boolean; title: string } }> {
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
  // A new (or reopened) task starts that agent's routine now, when it has one (Riley, Sienna). A new
  // approval or a new Request changes note always does (the 2-minute window merges repeats).
  if (opts.cfg && (!old || old.status === 'done' || opts.how === 'approved' || opts.how === 'changes')) {
    const how = HOW[opts.how ?? 'fixit'](oneLine(user.name, 60) || 'Alex');
    fireAgentSoon(db, opts.cfg, agent, `${how}: ${title} (HQ task #${r.id}${client ? `, ${client}` : ''})`,
      `${detail ? `${detail}\n` : ''}${link ? `HQ link: ${link}\n` : ''}Do this now and say in your report what you did and what is left (HQ task #${r.id}).`, opts.fireKey);
  }
  return { status: 200, task: { id: r.id, agent, created: r.created, title } };
}

// Follow-up plan parsing and timing (no imports of the agents, so settings.ts can use it).
export interface FollowupStep { delayDays: number; guidance: string }
export interface FollowupPlan { enabled: boolean; skipWeekends: boolean; steps: FollowupStep[] }

/** Used when a client has no plan saved. Alex's rule + Sean's skill: a real reason every time, then close the loop. */
export const DEFAULT_PLAN: FollowupPlan = {
  enabled: true, skipWeekends: true,
  steps: [
    { delayDays: 2, guidance: 'Pick up the open question or promised next step from the last messages. One short, useful line, then one clear next step (a call).' },
    { delayDays: 3, guidance: 'Add one genuinely new, true point tied to what the prospect said (no invented proof). End with one easy question.' },
    { delayDays: 5, guidance: 'Respect their timing: one low-pressure question on whether this is still a priority or when to check back.' },
  ],
};
export const CLOSE_LOOP: FollowupStep = { delayDays: 7, guidance: "Close the loop politely: say you won't keep chasing, leave the door open, and make it easy to reply later (Braun-style breakup, no guilt)." };

/** The client's follow-up plan (Reply Agent settings "Follow-up Plan JSON"), else the default. */
export function parsePlan(json: string): FollowupPlan {
  let j: any;
  try { j = JSON.parse(json || 'null'); } catch { j = null; }
  if (!j || typeof j !== 'object') return DEFAULT_PLAN;
  const steps: FollowupStep[] = (Array.isArray(j.steps) ? j.steps : [])
    .map((x: any) => ({ delayDays: Math.max(1, Number(x?.delay) * (String(x?.unit ?? 'days').startsWith('week') ? 7 : 1) || 1), guidance: String(x?.message ?? '').trim() }))
    .filter((x: FollowupStep) => x.guidance);
  return { enabled: j.enabled !== false, skipWeekends: j.skipWeekends !== false, steps: steps.length ? steps : DEFAULT_PLAN.steps };
}

/** Every follow-up in order: the plan's steps, then the close-the-loop note. */
export const allSteps = (p: FollowupPlan): FollowupStep[] => [...p.steps, CLOSE_LOOP];

/** Due time `days` business days (or calendar days) after `from`, at 15:00 UTC (morning in the Americas). */
export function dueAfter(from: Date, days: number, skipWeekends: boolean): string {
  const d = new Date(from.getTime());
  let left = Math.max(1, Math.round(days));
  while (left > 0) {
    d.setUTCDate(d.getUTCDate() + 1);
    if (!skipWeekends || (d.getUTCDay() !== 0 && d.getUTCDay() !== 6)) left--;
  }
  d.setUTCHours(15, 0, 0, 0);
  return d.toISOString();
}


export const parsePlanJson = parsePlan;

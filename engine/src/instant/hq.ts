// HQ actions that make work ready start it now (Alex 2026-11-28), after HQ has answered the person:
//   decision  (Decisions card, Inbox draft approve/edit/skip) → the Decisions loop starts the approved action / reply
//   idea      (Content idea approved)                         → Sienna writes the script (sienna.prep)
//   campaign  (a Campaign Center / Lead List Center button, a plan created / approved / rewritten)
//             → the Airtable bridge picks the button up, the Decisions loop starts the approval's action,
//               Atlas / Scribe start a plan or copy that is ready
// Never throws: the HQ answer was already sent.
import type { Db } from '../db/pool.js';
import type { Config } from '../config.js';
import { kick } from './kick.js';
import { trigger } from './trigger.js';
import { planWork } from './afterJob.js';

export type HqEvent = 'decision' | 'idea' | 'campaign';

export async function hqInstant(db: Db, cfg: Config, ev: HqEvent): Promise<string[]> {
  const out: string[] = [];
  try {
    if (ev === 'decision' || ev === 'campaign') { void kick('decisions.loop'); out.push('kick:decisions.loop'); }
    if (ev === 'campaign') {
      void kick('airtable.bridge'); out.push('kick:airtable.bridge');
      const n = await planWork(db, cfg); if (n) out.push(`plan-work:${n}`);
    }
    if (ev === 'idea' && cfg.siennaOn) out.push(`sienna.prep:${await trigger(db, cfg, { kind: 'sienna.prep', recordId: 'sienna-prep', reason: 'idea approved in HQ' })}`);
  } catch (e) {
    console.error(JSON.stringify({ level: 'error', message: 'hq instant trigger failed', ev, err: String(e) }));
  }
  return out;
}

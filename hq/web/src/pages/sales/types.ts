// Round 5 Sales types (engine/src/hq/salesGoals.ts, salesCalls.ts, sales.ts noteActions). Kept here,
// not in api.ts, so the contract page's builder and this one do not edit the same file.
export type GoalKey = 'calls' | 'deals' | 'revenue' | 'cash';
export type GoalStatus = 'hit' | 'on_pace' | 'behind' | 'no_goal';
export interface GoalLine { key: GoalKey; label: string; money: boolean; goal: number | null; actual: number; pct: number | null; expected: number | null; status: GoalStatus; text: string }
export interface SalesGoals {
  month: string; title: string; today: string; dayOfMonth: number; daysInMonth: number;
  goals: { calls: number | null; deals: number | null; revenue: number | null; cash: number | null } | null;
  lines: GoalLine[];
  source: { kind: 'airtable' | 'engine' | 'none'; text: string; reasoning: string; confidence: string; growth: number | null };
  next: { month: string; title: string; calls: number; deals: number; revenue: number; cash: number; growth: number; reason: string } | null;
  warning: string;
  take: { text: string; by: 'cole' | 'rule'; day: string };
  /** The question typed into a new chat with Cole (not sent). */
  ask: string;
  readOk: boolean;
  /** Close → Airtable Won sync (sales.won_sync): null when Close is not connected. */
  wonSync?: WonSync | null;
}
export interface WonSync {
  live: boolean; lastRun: string;
  marked: number; markedThisMonth: number; planned: number; already: number;
  text: string;
  skipped: { oppId: string; leadName: string; wonDate: string; status: 'ambiguous' | 'no_match' | 'failed' | string; note: string; closeUrl: string; fix: { agent: string; title: string; detail: string } }[];
}
export type CallStatus = 'Held' | 'Booked' | 'No-show' | 'Canceled' | 'Rescheduled' | 'No outcome' | 'Recorded' | '';
export interface DealCall {
  what: string; name: string; status: CallStatus; day: string;
  about: string; aboutBy: 'fathom' | 'cole' | 'feedback' | '';
  link: string; linkKind: 'fathom' | 'link' | ''; score: number | null; reviewId: number | null;
}
export interface NoteAction { agent: string; title: string; detail: string }

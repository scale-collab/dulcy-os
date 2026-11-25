// Each client's Reply Agent settings (Airtable "Dulcy Reply Agent Settings", edited in the Inbox
// Manager → Dulcy Reply Agent screen). Alex 2026-11-24: Echo must follow each client's own
// controls, not one rule for everyone. One row per workspace, read by field name.
import type { AirtableClient } from '../providers/airtable.js';
import { SETTINGS, val } from './emailsFields.js';
import { parsePlanJson, type FollowupPlan } from './followupPlan.js';

export interface ClientSettings {
  found: boolean;
  enabled: boolean;
  /** Reply Controls → Client reply handoff: Disabled (Dulcy replies) / After First Agent Reply / All Replies (client answers its own). */
  handoff: 'Disabled' | 'After First Agent Reply' | 'All Replies';
  replyTypes: string[];
  tone: string;
  length: string;
  agentName: string;
  companyName: string;
  companyUrl: string;
  instructions: string;
  followupInstructions: string;
  goal: string;
  language: string;
  notInterested: { enabled: boolean; instructions: string };
  templates: Record<string, string>;
  assets: { description: string; url: string }[];
  calendarLink: string;
  disableTimes: boolean;
  disableLinks: boolean;
  plan: FollowupPlan;
  /** Default Mode: Approval Required (default) / Auto High Confidence / Autopilot. */
  mode: string;
  /** OOO Mode = Auto Send: out-of-office replies may go out without a person. */
  oooAuto: boolean;
  /** Minimum Auto Confidence, 0..1 (Airtable percent). Default 0.9. */
  minConfidence: number;
  /** Max Automatic Replies per thread. Default 3. */
  maxAuto: number;
  /** Always Require Human Review: reply types that always wait for a person. */
  alwaysReview: string[];
  /** Routing Settings JSON groups: mode by reply type (Approval Required / Do Not Reply / Auto ...). */
  routes: Record<string, string>;
  /** Office hours for automatic sends (approved replies go out at once). */
  office: { tz: string; start: string; end: string; noWeekends: boolean; noHolidays: boolean };
}

const FIELDS = ['Enabled', 'Reply Handoff Mode', 'Enabled Reply Types', 'Response Tone', 'Response Length', 'Agent First Name', 'Agent Last Name',
  'Company Name', 'Company URL', 'Company Context Override', 'Follow-up Instructions', 'Objective Settings JSON', 'Response Settings JSON',
  'Knowledge Base JSON', 'Calendar Link', 'Calendar Settings JSON', 'Follow-up Plan JSON',
  'Default Mode', 'OOO Mode', 'Not Interested Nudge', 'Minimum Auto Confidence', 'Max Automatic Replies', 'Always Require Human Review',
  'Routing Settings JSON', 'Timezone', 'Office Start', 'Office End', 'Exclude Weekends', 'Exclude US Holidays'];

const json = (s: string): any => { try { const j = JSON.parse(s || 'null'); return j && typeof j === 'object' ? j : {}; } catch { return {}; } };
const list = (v: unknown): string[] => (Array.isArray(v) ? v.map((x) => val(x)).filter(Boolean) : val(v) ? [val(v)] : []);

export function parseSettings(f: Record<string, unknown> | null): ClientSettings {
  const g = (k: string) => (f ? f[k] : undefined);
  const obj = json(val(g('Objective Settings JSON'))), resp = json(val(g('Response Settings JSON')));
  const kb = json(val(g('Knowledge Base JSON'))), cal = json(val(g('Calendar Settings JSON')));
  const handoff = val(g('Reply Handoff Mode'));
  const routing = json(val(g('Routing Settings JSON')));
  const routes: Record<string, string> = {};
  for (const grp of Array.isArray(routing.groups) ? routing.groups : []) {
    for (const i of Array.isArray(grp?.intents) ? grp.intents : []) if (grp?.mode) routes[String(i)] = String(grp.mode);
  }
  const num = (k: string, d: number) => { const n = Number(g(k)); return g(k) === undefined || g(k) === null || g(k) === '' || !Number.isFinite(n) ? d : n; };
  return {
    found: !!f,
    enabled: f ? g('Enabled') === true : true,
    handoff: handoff === 'All Replies' || handoff === 'After First Agent Reply' ? handoff : 'Disabled',
    replyTypes: list(g('Enabled Reply Types')),
    tone: val(g('Response Tone')), length: val(g('Response Length')),
    agentName: [val(g('Agent First Name')), val(g('Agent Last Name'))].filter(Boolean).join(' '),
    companyName: val(g('Company Name')), companyUrl: val(g('Company URL')),
    instructions: val(g('Company Context Override')), followupInstructions: val(g('Follow-up Instructions')),
    goal: obj.goal === 'Other' || obj.customGoal ? String(obj.customGoal || obj.goal || '') : String(obj.goal || ''),
    language: String(obj.language || ''),
    notInterested: { enabled: resp.notInterestedEnabled === true || g('Not Interested Nudge') === true, instructions: String(resp.notInterestedInstructions || '') },
    templates: resp.templates && typeof resp.templates === 'object' ? Object.fromEntries(Object.entries(resp.templates).map(([k, v]) => [k, String(v ?? '').trim()]).filter(([, v]) => v)) : {},
    assets: kb.enabled === false ? [] : (Array.isArray(kb.assets) ? kb.assets : []).map((a: any) => ({ description: String(a?.description ?? '').trim(), url: String(a?.url ?? '').trim() })).filter((a: any) => a.url),
    calendarLink: val(g('Calendar Link')), disableTimes: cal.disableTimes === true, disableLinks: cal.disableLinks === true,
    plan: parsePlanJson(val(g('Follow-up Plan JSON'))),
    mode: val(g('Default Mode')) || 'Approval Required',
    oooAuto: val(g('OOO Mode')) === 'Auto Send',
    minConfidence: Math.min(1, Math.max(0, num('Minimum Auto Confidence', 0.9))),
    maxAuto: Math.max(0, Math.floor(num('Max Automatic Replies', 3))),
    alwaysReview: list(g('Always Require Human Review')),
    routes,
    office: {
      tz: val(g('Timezone')) || 'America/New_York', start: val(g('Office Start')) || '09:00', end: val(g('Office End')) || '17:00',
      noWeekends: g('Exclude Weekends') === true, noHolidays: g('Exclude US Holidays') === true,
    },
  };
}

export async function loadSettings(at: Pick<AirtableClient, 'list'>, wsRec: string): Promise<ClientSettings> {
  if (!wsRec) return parseSettings(null);
  try {
    const rows = await at.list(SETTINGS, `{Workspace Record ID}='${wsRec}'`, FIELDS, 1, { byName: true });
    return parseSettings(rows[0]?.fields ?? null);
  } catch { return parseSettings(null); }
}

/** Why Echo must not draft for this thread under the client's settings ('' = go ahead). */
export function blockedBy(s: ClientSettings, opts: { weReplied: boolean }): string {
  if (!s.enabled) return 'the Reply Agent is switched off for this client (Inbox Manager → Enabled)';
  if (s.handoff === 'All Replies') return 'this client answers its own replies (Inbox Manager → Client reply handoff: All replies)';
  if (s.handoff === 'After First Agent Reply' && opts.weReplied) return 'the client takes over after our first reply (Inbox Manager → Client reply handoff)';
  return '';
}

const LENGTH: Record<string, string> = { 'Very Brief': '1 to 2 sentences, under 35 words', Brief: 'under 60 words', Standard: 'under 120 words' };

/** The client's own controls, written for Echo. Goes in the per-client (cached) prompt block. */
export function settingsBlock(s: ClientSettings, kind: 'reply' | 'followup'): string {
  if (!s.found) return '';
  const lines = ['# This client\'s Reply Agent settings (from the Inbox Manager; follow them, they override the general style where they differ)'];
  if (s.agentName) lines.push(`- You write as ${s.agentName}${s.companyName ? ` of ${s.companyName}` : ''}${s.companyUrl ? ` (${s.companyUrl})` : ''}.`);
  if (s.tone) lines.push(`- Tone: ${s.tone}.`);
  if (s.length) lines.push(`- Length: ${LENGTH[s.length] ?? s.length}.`);
  if (s.goal) lines.push(`- Goal of every reply: ${s.goal}.`);
  if (s.language && s.language !== 'English') lines.push(`- Write in ${s.language}.`);
  if (s.replyTypes.length) lines.push(`- Only these reply types get an answer: ${s.replyTypes.join(', ')}. For any other type the action is "skip".`);
  lines.push(s.notInterested.enabled
    ? `- "Not Interested" replies: send one courtesy reply. ${s.notInterested.instructions}`
    : '- "Not Interested" replies: no reply (action "skip").');
  const tpl = Object.entries(s.templates);
  if (tpl.length) lines.push(`- Templates to start from, by reply type (fill them in from the thread; never leave {{placeholders}}):\n${tpl.map(([k, v]) => `  - ${k}: ${v}`).join('\n')}`);
  if (s.assets.length) lines.push(`- Approved links you may share when they fit what the prospect asked for (nothing else counts as approved):\n${s.assets.map((a) => `  - ${a.description || 'asset'}: ${a.url}`).join('\n')}`);
  if (s.instructions) lines.push(`\n## Inbox manager instructions for this client\n${s.instructions.slice(0, 8500)}`);
  if (kind === 'followup' && s.followupInstructions) lines.push(`\n## Follow-up instructions for this client\n${s.followupInstructions.slice(0, 4000)}`);
  return lines.join('\n');
}

/** A reply type switched off in the settings → the draft becomes a skip. */
export function typeAllowed(s: ClientSettings, intent: string): boolean {
  if (s.routes[intent] === 'Do Not Reply') return false;
  if (intent === 'Not Interested') return s.notInterested.enabled && (!s.replyTypes.length || s.replyTypes.includes('Not Interested'));
  return !s.replyTypes.length || s.replyTypes.includes(intent) || !REPLY_TYPES.includes(intent);
}
const REPLY_TYPES = ['Interested', 'Info Request', 'Meeting Request', 'Cost Objection', 'Process Objection', 'Not Interested', 'Out of Office', 'Check Back Later', 'Referred', 'Wrong Person'];

// ---- Automatic sending (Alex 2026-11-25: Echo follows every Reply Agent setting per client) ----
// Approval Required is the default everywhere. A draft goes out without a person only when the
// client's own settings say so, and never past any of these guards.

const AUTO_MODES = ['Autopilot', 'Auto Send', 'Auto High Confidence'];

/** Should this draft be sent without a person? '' reason = yes. */
export function autoSendDecision(s: ClientSettings, d: { action: string; intent: string; confidence?: number; draft: string }, autoSentBefore: number, engineOn = true):
  { auto: boolean; why: string } {
  const no = (why: string) => ({ auto: false, why });
  if (!engineOn) return no('automatic sending is switched off on the engine (SEAN_AUTO_SEND)');
  if (!s.found || !s.enabled) return no('no Reply Agent settings for this client');
  if (d.action !== 'reply') return no('not a plain reply');
  if (!d.draft.trim() || /\[GAP|\{\{/.test(d.draft)) return no('the draft has a gap or placeholder');
  if (s.alwaysReview.includes(d.intent)) return no(`${d.intent} always needs a person (Always Require Human Review)`);
  const route = s.routes[d.intent];
  // A reply type's own group (Routing settings) wins over the Default Mode.
  let mode = route || s.mode;
  if (d.intent === 'Out of Office' && s.oooAuto) mode = 'Autopilot';
  if (!AUTO_MODES.includes(mode)) return no(`mode is ${mode}`);
  if (mode === 'Auto High Confidence') {
    const c = (Number(d.confidence) || 0) / 100;
    if (c < s.minConfidence) return no(`confidence ${Math.round(c * 100)}% is under the client's ${Math.round(s.minConfidence * 100)}%`);
  }
  if (autoSentBefore >= s.maxAuto) return no(`already ${autoSentBefore} automatic replies on this thread (max ${s.maxAuto})`);
  return { auto: true, why: `${mode}${mode === 'Auto High Confidence' ? ` (${Math.round(Number(d.confidence) || 0)}% ≥ ${Math.round(s.minConfidence * 100)}%)` : ''}` };
}

/** Parts of a date in a time zone. */
function partsIn(d: Date, tz: string) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false, weekday: 'short' })
    .formatToParts(d).map((x) => [x.type, x.value]));
  return { y: Number(p.year), m: Number(p.month), d: Number(p.day), mins: (Number(p.hour) % 24) * 60 + Number(p.minute), wd: String(p.weekday) };
}

/** US federal holidays (fixed dates as they fall, plus the Monday/Thursday ones). */
export function isUsHoliday(y: number, m: number, d: number): boolean {
  const wd = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  const nth = Math.ceil(d / 7);
  const last = d + 7 > new Date(Date.UTC(y, m, 0)).getUTCDate();
  return (m === 1 && d === 1) || (m === 1 && wd === 1 && nth === 3) || (m === 2 && wd === 1 && nth === 3) || (m === 5 && wd === 1 && last)
    || (m === 6 && d === 19) || (m === 7 && d === 4) || (m === 9 && wd === 1 && nth === 1) || (m === 10 && wd === 1 && nth === 2)
    || (m === 11 && d === 11) || (m === 11 && wd === 4 && nth === 4) || (m === 12 && d === 25);
}

const hm = (t: string, dflt: number) => { const x = /^(\d{1,2}):(\d{2})/.exec(t.trim()); return x ? Number(x[1]) * 60 + Number(x[2]) : dflt; };

/** Inside the client's office hours right now (time zone, weekends, US holidays)? */
export function inOfficeHours(o: ClientSettings['office'], now = new Date()): boolean {
  let tz = o.tz;
  try { new Intl.DateTimeFormat('en-US', { timeZone: tz }); } catch { tz = 'America/New_York'; }
  const p = partsIn(now, tz);
  if (o.noWeekends && (p.wd === 'Sat' || p.wd === 'Sun')) return false;
  if (o.noHolidays && isUsHoliday(p.y, p.m, p.d)) return false;
  return p.mins >= hm(o.start, 540) && p.mins < hm(o.end, 1020);
}

/** Echo drafts a first reply to an out-of-office / not-interested message only when this client turns it on. */
export function extraTypeOn(s: ClientSettings, type: 'Out of Office' | 'Not Interested'): boolean {
  if (!s.found || s.routes[type] === 'Do Not Reply') return false;
  if (type === 'Not Interested') return s.notInterested.enabled && (!s.replyTypes.length || s.replyTypes.includes('Not Interested'));
  return s.replyTypes.includes('Out of Office') || s.oooAuto;
}

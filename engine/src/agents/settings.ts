// Each client's Reply Agent settings (Airtable "Dulcy Reply Agent Settings", edited in the Inbox
// Manager → Dulcy Reply Agent screen). Alex 2026-11-24: Sean must follow each client's own
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
}

const FIELDS = ['Enabled', 'Reply Handoff Mode', 'Enabled Reply Types', 'Response Tone', 'Response Length', 'Agent First Name', 'Agent Last Name',
  'Company Name', 'Company URL', 'Company Context Override', 'Follow-up Instructions', 'Objective Settings JSON', 'Response Settings JSON',
  'Knowledge Base JSON', 'Calendar Link', 'Calendar Settings JSON', 'Follow-up Plan JSON'];

const json = (s: string): any => { try { const j = JSON.parse(s || 'null'); return j && typeof j === 'object' ? j : {}; } catch { return {}; } };
const list = (v: unknown): string[] => (Array.isArray(v) ? v.map((x) => val(x)).filter(Boolean) : val(v) ? [val(v)] : []);

export function parseSettings(f: Record<string, unknown> | null): ClientSettings {
  const g = (k: string) => (f ? f[k] : undefined);
  const obj = json(val(g('Objective Settings JSON'))), resp = json(val(g('Response Settings JSON')));
  const kb = json(val(g('Knowledge Base JSON'))), cal = json(val(g('Calendar Settings JSON')));
  const handoff = val(g('Reply Handoff Mode'));
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
    notInterested: { enabled: resp.notInterestedEnabled === true, instructions: String(resp.notInterestedInstructions || '') },
    templates: resp.templates && typeof resp.templates === 'object' ? Object.fromEntries(Object.entries(resp.templates).map(([k, v]) => [k, String(v ?? '').trim()]).filter(([, v]) => v)) : {},
    assets: kb.enabled === false ? [] : (Array.isArray(kb.assets) ? kb.assets : []).map((a: any) => ({ description: String(a?.description ?? '').trim(), url: String(a?.url ?? '').trim() })).filter((a: any) => a.url),
    calendarLink: val(g('Calendar Link')), disableTimes: cal.disableTimes === true, disableLinks: cal.disableLinks === true,
    plan: parsePlanJson(val(g('Follow-up Plan JSON'))),
  };
}

export async function loadSettings(at: Pick<AirtableClient, 'list'>, wsRec: string): Promise<ClientSettings> {
  if (!wsRec) return parseSettings(null);
  try {
    const rows = await at.list(SETTINGS, `{Workspace Record ID}='${wsRec}'`, FIELDS, 1, { byName: true });
    return parseSettings(rows[0]?.fields ?? null);
  } catch { return parseSettings(null); }
}

/** Why Sean must not draft for this thread under the client's settings ('' = go ahead). */
export function blockedBy(s: ClientSettings, opts: { weReplied: boolean }): string {
  if (!s.enabled) return 'the Reply Agent is switched off for this client (Inbox Manager → Enabled)';
  if (s.handoff === 'All Replies') return 'this client answers its own replies (Inbox Manager → Client reply handoff: All replies)';
  if (s.handoff === 'After First Agent Reply' && opts.weReplied) return 'the client takes over after our first reply (Inbox Manager → Client reply handoff)';
  return '';
}

const LENGTH: Record<string, string> = { 'Very Brief': '1 to 2 sentences, under 35 words', Brief: 'under 60 words', Standard: 'under 120 words' };

/** The client's own controls, written for Sean. Goes in the per-client (cached) prompt block. */
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
  if (intent === 'Not Interested') return s.notInterested.enabled && (!s.replyTypes.length || s.replyTypes.includes('Not Interested'));
  return !s.replyTypes.length || s.replyTypes.includes(intent) || !REPLY_TYPES.includes(intent);
}
const REPLY_TYPES = ['Interested', 'Info Request', 'Meeting Request', 'Cost Objection', 'Process Objection', 'Not Interested', 'Out of Office', 'Check Back Later', 'Referred', 'Wrong Person'];

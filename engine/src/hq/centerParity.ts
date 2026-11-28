// HQ center parity (Alex 2026-11-28: "make sure the full implementation of the campaign and lead list
// center as I said"): everything the Airtable Campaign Center and Lead List Center screens do that HQ
// did not do yet, so Alex never needs to open Airtable for campaigns or lead lists.
//
// Every write here is the SAME write the Airtable screen makes (airtable/custom-elements/
// campaign-center/source.slim.tsx and lead-list-center/source.slim.tsx, the live pages):
//   - field edits: one whitelisted field per key, validated by type (the screen's onBlur saves);
//   - copy / approval: Workflow Stage moves with the screen's timing fields (Send for approval, Mark
//     changes requested, Approve + prepare sequence, Skip approval + prepare);
//   - sequence: Refresh from approved copy (the screen's "Variant N" parser), Generate spintax
//     (create_spintax + Campaign Automation Request, answered by the Airtable automation), delete a variant;
//   - Clone (a new Draft record with the reusable build only), Delete (Bison Action = Delete + the
//     automation request: the Airtable automation deletes EmailBison first, then Airtable);
//   - senders: the campaign's Email Accounts (only the client's own inboxes); Sync with Bison and Sync
//     Bison Senders post the screen's body to the same webhooks;
//   - top-up: Create top-up lead list (copies the source targeting, excludes the attached lists);
//   - New campaign (by hand) and New lead list: the screens' record creates;
//   - lead lists: targeting / filters / contacts / verification route / LeadMagic recovery / deep
//     review / enrichment / SEG rule edits, Use campaign thesis, manual QA (the screen's own gate),
//     Clear saved status.
// Engine stages are never written here: Build / Launch / Pause / Update Senders / Top Up and every lead
// list stage stay in centerActions.ts (Runs on Engine + Engine Action; the engine runs every check).
// Owner only (server.ts: session + same-origin + JSON; members get 403; "view as member" is read only),
// confirm: true on every write, a record with an engine step running refuses edits, every write logged.
import type { Db } from '../db/pool.js';
import type { Config } from '../config.js';
import type { AirtableRecord } from '../providers/airtable.js';
import type { HqAirtable } from './decisions.js';
import { CAMPAIGNS_T, LEAD_LISTS_T, WORKSPACES_T, cachedCampaigns, clientIndex, _resetCampaignsCache } from './campaigns.js';
import { CX, LX, campaignLocked, campaignState, isRec, listLocked, listState } from './centerActions.js';
import { CAMPAIGN_FIELDS } from '../campaign/campaignFields.js';
import { CC } from '../agents/scribe.js';
import { sendingAccountsView } from './sendingAccounts.js';

export interface ParityResult { status: number; body: Record<string, unknown> }
const refuse = (status: number, error: string): ParityResult => ({ status, body: { error } });
const s = (v: unknown): string => (Array.isArray(v) ? v.map((x) => s(x)).filter(Boolean).join(', ') : v === undefined || v === null ? '' : typeof v === 'object' ? String((v as any).name ?? (v as any).id ?? '') : String(v)).trim();
const n = (v: unknown): number => { const x = Number(Array.isArray(v) ? v[0] : v); return Number.isFinite(x) ? x : 0; };
const ids = (v: unknown): string[] => (Array.isArray(v) ? v : v ? [v] : []).map((x: any) => (typeof x === 'string' ? x : x?.id)).filter(isRec);
const has = (v: unknown) => !(v === undefined || v === null || v === '' || (Array.isArray(v) && !v.length));

async function audit(db: Db, actor: string, action: string, rec: string, changes: unknown) {
  await db.query(`INSERT INTO hq_settings_log (actor, action, ws_rec, row_id, changes) VALUES ($1,$2,'',$3,$4)`, [actor, `center:${action}`, rec, JSON.stringify(changes)]);
}

// ---------- field definitions (the screens' editable fields) ----------
type Kind = 'text' | 'long' | 'number' | 'date' | 'bool' | 'select' | 'multi' | 'time' | 'json' | 'url';
export interface FieldDef { id: string; kind: Kind; label: string; choices?: string[] }
const DAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'] as const;
const DAY_IDS = ['fldEX5XHj8lIkkp4g', 'fldLoKQBjHmvA0sVd', 'fldWdOeNb5mc95BZp', 'fldnJtB1br2i2zkLx', 'fldsOIQHZfuILVYyx', 'fld9ybdYVtipVAQ7g', 'fldhasNVsPOKuTQSC'];
/** Campaigns field IDs the Campaign Center reads or writes (source.slim.tsx CAMPAIGN_FIELDS). */
export const CF = {
  type: 'fldd9fU7wNFTNQB0j', automationRequest: 'fldKZKnaFMiAHrDEE', message: 'flduYPLoUQk94uUWA', error: 'fld1ZYViMpvLDoBy2', bisonId: 'fldxSETE3D66RyWRH',
  approach: 'fldclFGDzjg4nvfxL', prepDate: 'fldMyRtIz3Zm26oiH', launchDate: 'fldhyq0anpSO1r0bV', thesis: 'fldlixHfhzrd7nuSc', createSpintax: 'fldsvgKf6U5zDOygf', bisonAction: 'fld7n4KEnvaPMDbt2',
  skipBounceNotification: 'fldWNVUvrpLLDXITC', skipBouncePause: 'fldjpNVGqOLFJbcEX', daysBetween: 'fldbX8yCSVIhfJ6v7', backupVariants: 'fldzztWeFYjHX65ck',
  startTime: 'fldxkH2X1VdDOj54B', endTime: 'fldj60qqSPeYawLX4', timezone: 'fldg8Be3TXKtI30j5', maxEmails: 'fld0PxY90RaShLgvw', maxNewLeads: 'fldPRrn97ehpYGomi', plainText: 'fld2VaGjw0nYFJvIy',
  startDate: 'fldZGNVkmKEzcq4yj', endDate: 'fldaFRUpSPJB3IV8t', companyFeedback: 'fldvHy50OLfkmtdwp', geographyFeedback: 'fldy9BjxRZuyh6WLO', industryFeedback: 'fldZYgj2wmOH7CJKE', titleFeedback: 'fldAAxGIIe6E7g26Y',
  topUpAdded: 'fldj24jsClYDgjNyG', topUpSkipped: 'fldBz14RRsy2PDUhp', topUpFailed: 'fldEosJWzT7I73inC', topUpLastRun: 'fldFfVuUx0ZMCaJXX', replies: 'fldqSxElCOm0QN4kh', interested: 'fldSRXRCC0x2AhX9h',
  startedAt: 'fldqKPdzUqppbItvX', completedAt: 'fldzjGuki2WoS1LBY',
} as const;
const APPROACHES = ['Offer Validation', 'Case Study', 'Risk Reversal', 'Lead Magnet', 'Direct Offer', 'Loom Video', 'Market Research', 'Education-Based', 'Likihood', 'Custom (Alexander Only)'];
const one = (...names: string[]) => names.map((x) => CAMPAIGN_FIELDS[x]).find(Boolean) ?? '';
/** The screen's sequenceVersionFields(): the sequence subject / body of one step and version, by its name order. */
export function seqField(step: number, version: number): { subject: string; body: string } {
  return {
    subject: one(`Campaign Email ${step} Subject Version ${version}`, `Campaign Subject ${step} Version ${version}`, `Campaign Email ${step} Subject Spintax ${version}`, ...(version === 1 ? [`Campaign Email ${step} Subject`] : [])),
    body: one(`Campaign Body ${step} Version ${version}`, `Campaign Email ${step} Body Spintax ${version}`, ...(version === 1 ? [`Campaign Email ${step} Body`] : [])),
  };
}
/** Every editable Campaigns field, by HQ key (Strategy, Copy, Sequence, Settings tabs). */
export const CAMPAIGN_EDIT: Record<string, FieldDef> = (() => {
  const out: Record<string, FieldDef> = {
    name: { id: CX.name, kind: 'text', label: 'Campaign name' }, approach: { id: CF.approach, kind: 'select', label: 'Campaign approach', choices: APPROACHES },
    prepDate: { id: CF.prepDate, kind: 'date', label: 'Campaign prep date' }, launchDate: { id: CF.launchDate, kind: 'date', label: 'Estimated launch date' },
    thesis: { id: CF.thesis, kind: 'long', label: 'Campaign thesis' },
    daysBetween: { id: CF.daysBetween, kind: 'select', label: 'Days between emails', choices: ['1', '2', '3', '4', '5'] },
    maxEmails: { id: CF.maxEmails, kind: 'number', label: 'Max emails per day' }, maxNewLeads: { id: CF.maxNewLeads, kind: 'number', label: 'Max new leads per day' },
    startTime: { id: CF.startTime, kind: 'time', label: 'Start time' }, endTime: { id: CF.endTime, kind: 'time', label: 'End time' },
    timezone: { id: CF.timezone, kind: 'select', label: 'Time zone', choices: ['America/New_York', 'Europe/London'] },
    startDate: { id: CF.startDate, kind: 'date', label: 'Start date' }, endDate: { id: CF.endDate, kind: 'date', label: 'End date' },
    plainText: { id: CF.plainText, kind: 'bool', label: 'Plain-text sending' },
    skipBounceNotification: { id: CF.skipBounceNotification, kind: 'bool', label: 'Skip bounce notification' }, skipBouncePause: { id: CF.skipBouncePause, kind: 'bool', label: 'Skip bounce pause' },
  };
  DAYS.forEach((d, i) => { out[d] = { id: DAY_IDS[i], kind: 'bool', label: `Send on ${d[0].toUpperCase()}${d.slice(1)}` }; });
  CC.review.forEach((x, i) => { out[`subject${i + 1}`] = { id: x.subject, kind: 'text', label: `Email ${i + 1} subject` }; out[`body${i + 1}`] = { id: x.body, kind: 'long', label: `Email ${i + 1} copy` }; });
  [2, 3, 4].forEach((st) => { out[`thread${st}`] = { id: CC.thread[st], kind: 'bool', label: `Email ${st} thread reply` }; });
  for (let st = 1; st <= 4; st++) for (let v = 1; v <= 10; v++) {
    const f = seqField(st, v);
    if (f.subject) out[`seq${st}v${v}s`] = { id: f.subject, kind: 'text', label: `Sequence ${st}${'ABCDEFGHIJ'[v - 1]} subject` };
    if (f.body) out[`seq${st}v${v}b`] = { id: f.body, kind: 'long', label: `Sequence ${st}${'ABCDEFGHIJ'[v - 1]} body` };
  }
  return out;
})();

/** Lead Lists fields the Lead List Center edits (source.slim.tsx FIELD_IDS / EXTRA_FIELDS). */
export const LL = {
  displayName: 'fldbg5PAnKyFHc3uy', fileName: 'fldlOo9lL9jvvhGo9', employeeRange: 'fldG2MXz5lccu7KKU', contactFiltersJson: 'fld8Y8iYpvUV4FDDX', genericFootprint: 'fldAFATYp9G26MmVj',
  segRule: 'fldfmIbpySyuXFyhf', segProviders: 'fldkfozG1Mpfgq9mI', genericVerifier: 'fldX8cOpx3TcGX2jf', directVerifier: 'fldlJtYONrHGdyXoh', verificationProvider: 'fldscHbLN6C72xbRj',
  deepReviewPrompt: 'fldVCKrDuXfEhxjZm', deepReviewExtra: 'fldH7LfiagdudqYJn', sourceType: 'fldJSSY0QTMU5pzsQ', thirdPartyMethod: 'fldrwkcctpevJf4Em', companyValidationStatus: 'fldY1i1787UwZFOr6',
  contactValidationStatus: 'fldVH77A3Ozjh4t8k', expansionApproval: 'fldCplE8kEMlL1fP3', contactQueueStatus: 'fldiRqsZug1W0Otvs', verificationProviderState: 'fldflrzfkhmW7JarV',
  automationAction: 'fldhViG7kJ5rKEaa4', enrichmentAction: 'fldLyvQsbGvii0iUK', qaAction: 'fldcBmKEYX8KUiKAM', topUpScope: 'fldevysyehxsGxt2q', bisonListId: 'fldJ9qjlqs9taBGFE',
  qaSummary: 'fld9XB4gkZcizeHUg', requiredFields: 'fldWDSDICYaL9SQEa', duplicateCheck: 'fldgWhI2Nm2Y9c91O', finalSchema: 'fld9p2h93vRGm6D3e', duplicateCount: 'fldSk4FJKAHo5yGhc', rejectedCount: 'fldllzDyi67HGc0FC',
} as const;
const SEG_PROVIDERS = ['Outlook', 'Google', 'Mimecast', 'Proofpoint', 'Zoho', 'Custom Mail Server', 'Barracuda', 'Cloudflare', 'StackCP', 'Other'];
export const LIST_EDIT: Record<string, FieldDef> = {
  name: { id: LL.displayName, kind: 'text', label: 'Lead list name' },
  icp: { id: LX.icp, kind: 'long', label: 'Targeting sentence' },
  filters: { id: LX.filtersJson, kind: 'json', label: 'Exact DiscoLike filters JSON' },
  employeeRange: { id: LL.employeeRange, kind: 'text', label: 'Employee range' },
  sampleSize: { id: LX.sampleSize, kind: 'number', label: 'Company sample size' },
  target: { id: LX.expansionTarget, kind: 'number', label: 'Usable company target' },
  persona: { id: LX.personaDna, kind: 'long', label: 'Custom persona' },
  contactFilters: { id: LL.contactFiltersJson, kind: 'json', label: 'Exact contact filters JSON' },
  contactSampleSize: { id: LX.contactSampleSize, kind: 'number', label: 'Contact sample size' },
  customVars: { id: LX.customVars, kind: 'long', label: 'Custom enrichment instructions' },
  useDeepReview: { id: LX.useDeepReview, kind: 'bool', label: 'Use DiscoGen deep review' },
  deepReviewPrompt: { id: LL.deepReviewPrompt, kind: 'long', label: 'DiscoGen deep review prompt' },
  deepReviewExtra: { id: LL.deepReviewExtra, kind: 'long', label: 'Deep review: additional requirements' },
  genericFootprint: { id: LL.genericFootprint, kind: 'bool', label: 'Generic emails: footprint 200 or less' },
  segRule: { id: LL.segRule, kind: 'select', label: 'Email security gateway rule', choices: ['Allow All', 'Exclude Selected', 'Include Selected', 'Review Selected'] },
  segProviders: { id: LL.segProviders, kind: 'multi', label: 'Gateways / providers', choices: SEG_PROVIDERS },
  sheet: { id: LX.sheetLink, kind: 'url', label: 'Lead list Google Sheet link' },
};

/** Validate one value for its field. Pure. Returns the value to write, or an error. */
export function checkValue(def: FieldDef, raw: unknown): { ok: true; value: unknown } | { ok: false; error: string } {
  const bad = (why: string) => ({ ok: false as const, error: `${def.label}: ${why}` });
  if (def.kind === 'bool') return typeof raw === 'boolean' ? { ok: true, value: raw } : bad('true or false');
  if (raw === null || raw === '') return def.kind === 'multi' ? { ok: true, value: [] } : { ok: true, value: null };
  switch (def.kind) {
    case 'text': return typeof raw === 'string' && raw.length <= 500 && !/[\r\n]/.test(raw) ? { ok: true, value: raw.trim() } : bad('one line, up to 500 characters');
    case 'long': return typeof raw === 'string' && raw.length <= 50_000 ? { ok: true, value: raw.replace(/\r\n/g, '\n') } : bad('text up to 50,000 characters');
    case 'url': return typeof raw === 'string' && /^https:\/\/docs\.google\.com\/spreadsheets\/\S+$/.test(raw.trim()) ? { ok: true, value: raw.trim() } : bad('a Google Sheets https link');
    case 'number': { const x = typeof raw === 'number' ? raw : Number(raw); return Number.isSafeInteger(x) && x >= 0 && x <= 10_000_000 ? { ok: true, value: x } : bad('a whole number, 0 or more'); }
    case 'date': return typeof raw === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(raw) && !Number.isNaN(Date.parse(`${raw}T12:00:00Z`)) ? { ok: true, value: raw } : bad('a date (YYYY-MM-DD)');
    case 'time': return typeof raw === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(raw) ? { ok: true, value: raw } : bad('a time like 09:00');
    case 'select': return typeof raw === 'string' && def.choices!.includes(raw) ? { ok: true, value: raw } : bad(`one of ${def.choices!.join(', ')}`);
    case 'multi': return Array.isArray(raw) && raw.every((x) => typeof x === 'string' && def.choices!.includes(x)) ? { ok: true, value: [...new Set(raw as string[])] } : bad(`any of ${def.choices!.join(', ')}`);
    case 'json': {
      if (typeof raw !== 'string' || raw.length > 50_000) return bad('JSON text');
      try { const x = JSON.parse(raw); if (!x || typeof x !== 'object' || Array.isArray(x)) return bad('must be a JSON object'); return { ok: true, value: JSON.stringify(x, null, 2) }; } catch { return bad('not valid JSON'); }
    }
  }
  return bad('cannot be edited');
}
/** Validate a set of edits against a field map. Pure. */
export function checkEdits(map: Record<string, FieldDef>, changes: unknown): { ok: true; fields: Record<string, unknown>; labels: string[] } | { ok: false; error: string } {
  if (!changes || typeof changes !== 'object' || Array.isArray(changes)) return { ok: false, error: 'send changes: { field: value }' };
  const entries = Object.entries(changes as Record<string, unknown>);
  if (!entries.length || entries.length > 60) return { ok: false, error: 'send 1 to 60 changes' };
  const fields: Record<string, unknown> = {}; const labels: string[] = [];
  for (const [k, v] of entries) {
    const def = Object.prototype.hasOwnProperty.call(map, k) ? map[k] : undefined;
    if (!def) return { ok: false, error: `${k} cannot be edited here` };
    const r = checkValue(def, v);
    if (!r.ok) return r;
    fields[def.id] = r.value; labels.push(def.label);
  }
  return { ok: true, fields, labels };
}

// ---------- the screen's helpers (pure) ----------
/** The Campaign Center's addWeekdayHours (48 weekday hours for client review), weekdays counted in US Eastern time. */
export function addWeekdayHours(start: Date, hours: number): Date {
  const out = new Date(start);
  const weekday = (d: Date) => new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', weekday: 'short' }).format(d);
  for (let left = hours; left > 0;) { out.setTime(out.getTime() + 3_600_000); if (!['Sat', 'Sun'].includes(weekday(out))) left -= 1; }
  return out;
}
/** The screen's parseReviewVariants: two or more line-start "Variant N" (or A-J) labels split the copy. */
export function parseReviewVariants(raw: unknown, label: string, allowEmpty = false): { structured: boolean; values: string[] } {
  const source = String(raw ?? '').replace(/\r\n?/g, '\n').trim();
  if (!source) return { structured: false, values: [] };
  const markers = [...source.matchAll(/^(?:\[\s*)?variant\s+(10|[1-9]|[A-J])(?:\s*\])?\s*(?:(?::|[-–—])\s*)?(.*)$/gim)];
  if (markers.length < 2) return { structured: false, values: [source] };
  markers.forEach((m, i) => {
    const t = String(m[1]).toUpperCase();
    if ((/^\d+$/.test(t) ? Number(t) - 1 : t.charCodeAt(0) - 65) !== i) throw new Error(`${label} variant labels must be sequential from Variant 1 or Variant A, with no duplicates or gaps.`);
  });
  const values = markers.map((m, i) => { const end = (m.index ?? 0) + m[0].length; return [String(m[2] ?? '').trim(), source.slice(end, markers[i + 1]?.index ?? source.length).trim()].filter(Boolean).join('\n').trim(); });
  if (!allowEmpty && values.some((v) => !v)) throw new Error(`${label} contains an empty labelled variant.`);
  return { structured: true, values };
}
/** Refresh from approved copy: the sequence fields + variant counts the screen writes. Pure; throws the screen's errors. */
export function sequenceFromReview(f: Record<string, unknown>): { update: Record<string, unknown>; counts: Record<number, number> } {
  const update: Record<string, unknown> = {}; const counts: Record<number, number> = {};
  CC.review.forEach((x, i) => {
    const st = i + 1;
    const subjects = parseReviewVariants(f[x.subject], `Email ${st} subject`, true);
    const bodies = parseReviewVariants(f[x.body], `Email ${st} body`);
    if (!subjects.values.length && !bodies.values.length) return;
    if (!bodies.values.length) throw new Error(`Email ${st} has a subject but no approved email body.`);
    if (subjects.structured && bodies.structured && subjects.values.length !== bodies.values.length) throw new Error(`Email ${st} has ${subjects.values.length} labelled subjects but ${bodies.values.length} labelled bodies; the counts must match.`);
    const detected = Math.max(subjects.structured ? subjects.values.length : 1, bodies.structured ? bodies.values.length : 1);
    if (detected > 10) throw new Error(`Email ${st} contains more than 10 variants.`);
    counts[st] = detected;
    for (let k = 0; k < detected; k++) {
      const t = seqField(st, k + 1);
      const subject = subjects.structured ? subjects.values[k] : (subjects.values[0] ?? '');
      const body = bodies.structured ? bodies.values[k] : bodies.values[0];
      if (!t.body) throw new Error(`Email ${st} has Variant ${k + 1}, but its Campaign Body Version ${k + 1} field is missing.`);
      if (subject && !t.subject) throw new Error(`Email ${st} has a subject for Variant ${k + 1}, but its Campaign Subject Version ${k + 1} field is missing.`);
      update[t.body] = body;
      if (t.subject) update[t.subject] = subject;
    }
    update[CC.variants[i]] = String(detected);
  });
  if (!Object.keys(update).length) throw new Error('No approved Email 1–4 review copy is available to copy.');
  return { update, counts };
}
/** The approval decision as the screen reads it. Pure. */
export function approvalOf(f: Record<string, unknown>) {
  const source = s(f[CC.approvalSource]).toLowerCase();
  const decision = s(f[CC.clientFeedback]);
  const byDulcy = source === 'internal approval exception';
  const approved = !byDulcy && (source === 'client approved' || decision.toLowerCase().includes('approve campaign'));
  const changes = !byDulcy && source !== 'client approved' && decision.toLowerCase().includes('request change');
  return { byDulcy, approved, changes, decision };
}
const SEQ_COPY_RE = /^(?:Campaign Email \d+ Subject(?: Version \d+)?|Campaign Subject \d+ Version \d+|Campaign (?:Email )?Body \d+ Version \d+)$/i;
/** Clone copies the reusable build only (the screen's list + every sequence subject/body version). */
export const CLONE_FIELDS = [...new Set([CX.client, CF.type, CF.approach, CF.prepDate, CF.launchDate, CF.thesis, ...CC.review.flatMap((x) => [x.subject, x.body]), CC.thread[2], CC.thread[3], CC.thread[4],
  CF.daysBetween, ...CC.variants, CF.backupVariants, ...DAY_IDS, CF.startTime, CF.endTime, CF.timezone, CF.maxEmails, CF.maxNewLeads, CF.plainText, CF.startDate, CF.endDate, CF.skipBounceNotification, CF.skipBouncePause,
  ...Object.entries(CAMPAIGN_FIELDS).filter(([k]) => SEQ_COPY_RE.test(k)).map(([, v]) => v)])];
export const randomTime = (hour: number, rnd = Math.random) => `${String(hour).padStart(2, '0')}:${String(Math.floor(rnd() * 60)).padStart(2, '0')}`;
/** "[Client] title" (the screen's clientPrefixedName). Pure. */
export function clientPrefixed(client: string, title: string): string {
  const c = client.trim().replace(/^\[|\]$/g, '').trim();
  const t = title.replace(/^\s*\[[^\]]*\]\s*/, '').trim();
  return !c ? t : t ? `[${c}] ${t}` : `[${c}]`;
}
/** Targeting copied from the source list into a new top-up list (source.slim.tsx TOP_UP_COPY_FIELDS). */
export const TOP_UP_COPY_FIELDS = ['fldEujtSLqwdpOyGD', 'fldJSSY0QTMU5pzsQ', 'fldrwkcctpevJf4Em', 'fldcYwP7Dlq4uyC39', 'fldg6HZIKqe8c8RtW', 'fldC2hZQ3gSqLmi1y', 'fld1YCXcNy4DgpiLf', 'fldHeVveCAwW5BpPx', 'flde9rzZp6nxFY0kc', 'fldE9enhYUgKfpPBZ', 'fldG2MXz5lccu7KKU', 'fldydpLzUzAJGLBBJ', 'fldoeQZ5utB7F9XkD', 'fldOY9huqfW7v6bXT', 'fld8BzLAB6otoGBVI', 'fldja37uHGyGpZZLB', 'fldIXN5t3bqfiZ0Wu', 'fldfFcn3BB2RyiWer', 'fldle7FymM4BN7iJK', 'fldRIomZHeVxPWveE', 'fldwoK7IcKH6NYgVJ', 'fld8Y8iYpvUV4FDDX', 'fldX8cOpx3TcGX2jf', 'fldlJtYONrHGdyXoh', 'fldscHbLN6C72xbRj', 'fldL3nguggy3hWpXD', 'fldEowFa8B2lS2PRN', 'fldRbgKvjSv7sl5YL', 'fldfmIbpySyuXFyhf', 'fldTYRjTrpVW27tmG', 'fldUa69aE3HyX0n81', 'fldj6OeEu5swtimNx', 'fldsYFrdNF2VBS6SQ', 'fldVCKrDuXfEhxjZm', 'fldH7LfiagdudqYJn', 'fldYzvqGmQZxXL9AP'];
/** The screen's manualQaUpdate: QA status with the stage it implies. Pure; throws the screen's errors. */
export function manualQaUpdate(f: Record<string, unknown>, next: string): Record<string, unknown> {
  if (next && !['Not Checked', 'Passed', 'Needs Review', 'Failed'].includes(next)) throw new Error('The selected QA status is not configured for this list.');
  const stage = s(f[LX.stage]);
  const update: Record<string, unknown> = { [LX.qa]: next || null };
  if (next !== 'Passed') { if (stage === 'Ready') update[LX.stage] = 'QA'; return update; }
  if (!['QA', 'Ready', 'Uploaded'].includes(stage)) throw new Error('Complete the lead-list workflow through QA before approving it.');
  if (s(f[LX.processing]) !== 'Completed') throw new Error('Wait for the current workflow to complete before approving QA.');
  const pending = ['running', 'queued', 'pending', 'processing', 'waiting'];
  if (['Queued', 'Running', 'Waiting'].includes(s(f[LX.engineStatus])) || s(f[LX.engineAction]) || [LL.contactQueueStatus, LL.verificationProviderState].some((k) => pending.includes(s(f[k]).toLowerCase())))
    throw new Error('A workflow request is pending. Wait for it to finish before approving QA.');
  if (stage !== 'Uploaded') update[LX.stage] = 'Ready';
  return update;
}

// ---------- reads ----------
const CAMPAIGN_READ = [...new Set([...Object.values(CX), ...Object.values(CF), ...Object.values(CAMPAIGN_EDIT).map((d) => d.id), ...Object.values(CC).flatMap((v) => (typeof v === 'string' ? [v] : Array.isArray(v) ? v.flatMap((x: any) => (typeof x === 'string' ? [x] : Array.isArray(x) ? x.flatMap((y: any) => [y.subject, y.body]) : [x.subject, x.body])) : Object.values(v as Record<string, string>))), ...CLONE_FIELDS])];
const SEQ_T = 'tblmHKxDLELPkj5xk';
const SQ = { campaign: 'fldOj7Uk9JSNnI1kF', step: 'fldbgt319A6pym3Ni', variant: 'fldqPCQ7mcynXjSUL', subject: 'fldZGv33auxBB7F9e', sent: 'fldWasIzQZHOeHlig', replies: 'fldIvQkJnFcZlImqA', interested: 'fldAcRMZyCly08iDj', bounces: 'fldcZ6ICxoCsyyDBb' } as const;
const quote = (x: string) => `"${x.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
const PIVOT = { vertical: 'fldY5tnIicC48grKq', offer: 'fld9HliYa3igd1Uri' } as const;
const LIST_READ = [...new Set([...Object.values(LX), ...Object.values(LL), ...Object.values(LIST_EDIT).map((d) => d.id), 'fldJCxECBr4wD09a3', 'fldsYLxPFzapgvw5N', 'fld0KlQqxFEG6wgfU', 'fldmyD4PJ9mXdCJZ8'])];

/** Sequence Analytics rows for one campaign (the Campaign Center's Analytics tab). Pure on rows. */
export function variantRows(rows: AirtableRecord[], campaignId: string) {
  const out = rows.filter((r) => ids(r.fields[SQ.campaign]).includes(campaignId)).map((r) => {
    const [sent, replies, interested, bounces] = [SQ.sent, SQ.replies, SQ.interested, SQ.bounces].map((k) => n(r.fields[k]));
    return { step: n(r.fields[SQ.step]), variant: s(r.fields[SQ.variant]) || 'A', subject: s(r.fields[SQ.subject]) || 'No subject', sent, replies, interested, bounces,
      replyRate: sent ? Math.round((replies / sent) * 1000) / 10 : 0, interestedRate: replies ? Math.round((interested / replies) * 1000) / 10 : 0, bounceRate: sent ? Math.round((bounces / sent) * 1000) / 10 : 0,
      sample: sent >= 2000 ? 'Ideal' : sent >= 1000 ? 'Okay' : 'Not ideal' };
  }).sort((a, b) => a.step - b.step || a.variant.localeCompare(b.variant));
  const leader = [...out].sort((a, b) => b.interestedRate - a.interestedRate || b.replyRate - a.replyRate || b.sent - a.sent)[0] ?? null;
  return { rows: out, leader: leader ? `${leader.step}${leader.variant}` : '' };
}

/** GET /hq/api/campaigns/:rec/fields: every editable field and the Campaign Center's extra panels. */
export async function campaignFieldsView(at: HqAirtable, db: Db, id: string, canAct: boolean) {
  const rec = await at.get(CAMPAIGNS_T, id, CAMPAIGN_READ);
  if (!rec) return null;
  const f = rec.fields;
  const values = Object.fromEntries(Object.entries(CAMPAIGN_EDIT).map(([k, d]) => [k, d.kind === 'bool' ? f[d.id] === true : d.kind === 'number' ? (has(f[d.id]) ? n(f[d.id]) : null) : s(f[d.id])]));
  const src = await cachedCampaigns(at, db);
  const ws = clientIndex(src.ws);
  const clientRecs = ids(f[CX.client]);
  const ref = ws.get(clientRecs[0] ?? '');
  const sameClient = (l: AirtableRecord) => ids(l.fields[LX.client]).some((c) => clientRecs.includes(c) || (ref && ws.get(c)?.key === ref.key));
  const lists = src.lists.filter(sameClient).map((l) => ({ id: l.id, name: s(l.fields[LX.name]) || s(l.fields[LX.fileName]) || 'Lead list', stage: s(l.fields[LX.stage]), qa: s(l.fields[LX.qa]) }));
  const topId = ids(f[CX.topupList])[0] ?? '';
  const top = topId ? await at.get(LEAD_LISTS_T, topId, [LX.name, LX.stage, LX.qa, LX.finalDirect, LX.finalGeneric]).catch(() => null) : null;
  const clientRec = clientRecs[0] ? await at.get(WORKSPACES_T, clientRecs[0], Object.values(PIVOT)).catch(() => null) : null;
  const seq = await at.list(SEQ_T, `SEARCH(${quote(s(f[CX.name]))}, ARRAYJOIN({Campaign}))`, Object.values(SQ), 200).catch(() => [] as AirtableRecord[]);
  const ap = approvalOf(f);
  const replies = n(f[CF.replies]); const interested = n(f[CF.interested]);
  const c = campaignState(rec, null);
  return {
    id, values, defs: Object.fromEntries(Object.entries(CAMPAIGN_EDIT).map(([k, d]) => [k, { kind: d.kind, label: d.label, choices: d.choices ?? null }])),
    status: s(f[CX.status]), stage: s(f[CX.stage]), clientKey: ref?.key ?? '', client: ref?.name ?? '',
    approval: { ...ap, source: s(f[CC.approvalSource]), changeArea: s(f[CC.selectChanges]), feedback: s(f[CC.reviewFeedback]), submittedAt: s(f[CC.submittedAt]), autoApproveAt: s(f[CC.autoApproveAt]),
      more: ([[CF.companyFeedback, 'Company feedback'], [CF.geographyFeedback, 'Geography feedback'], [CF.industryFeedback, 'Industry feedback'], [CF.titleFeedback, 'Title feedback'], [CC.additionalContext, 'Additional context']] as [string, string][])
        .map(([k, label]) => ({ label, text: s(f[k]) })).filter((x) => x.text) },
    saved: { processing: s(f[CX.processing]), message: s(f[CF.message]).slice(0, 1500), error: s(f[CF.error]).slice(0, 1500), request: s(f[CF.automationRequest]).slice(0, 600), bisonAction: s(f[CF.bisonAction]), spintax: f[CF.createSpintax] === true },
    lists, listId: ids(f[CX.lists])[0] ?? '', accounts: ids(f[CX.accounts]),
    topup: { list: top ? { id: top.id, name: s(top.fields[LX.name]) || 'Top-up list', stage: s(top.fields[LX.stage]), qa: s(top.fields[LX.qa]), leads: n(top.fields[LX.finalDirect]) + n(top.fields[LX.finalGeneric]) } : null,
      ruleMet: replies > 0 && interested / replies >= 0.15, interestedRate: replies ? Math.round((interested / replies) * 1000) / 10 : null,
      status: s(f[CX.topupStatus]), added: n(f[CF.topUpAdded]), skipped: n(f[CF.topUpSkipped]), failed: n(f[CF.topUpFailed]), lastRun: s(f[CF.topUpLastRun]), message: s(f[CX.topupMessage]).slice(0, 600) },
    pivots: clientRec ? { vertical: s(clientRec.fields[PIVOT.vertical]) !== 'Disabled', offer: s(clientRec.fields[PIVOT.offer]) !== 'Disabled' } : null,
    analytics: variantRows(seq, id),
    locked: campaignLocked(c), built: c.bison.length > 0, canAct, readAt: new Date().toISOString(),
  };
}

const ESP = { pre: 'fldJCxECBr4wD09a3', production: 'fldsYLxPFzapgvw5N', deepResults: 'fld0KlQqxFEG6wgfU', needsReview: 'fldmyD4PJ9mXdCJZ8' } as const;
const ESP_CATS = ['Google', 'Outlook', 'Custom Mail Server', 'Zoho', 'Mimecast', 'Proofpoint', 'Barracuda', 'Other', 'Unknown'];
/** The Lead List Center's email provider breakdown (ESP Breakdown JSON / Production ESP Breakdown JSON): counts per provider group. Pure; null when not valid. */
export function espOf(raw: string): { total: number; updatedAt: string; counts: { name: string; count: number }[] } | null {
  try {
    const x = JSON.parse(raw || '');
    const isCount = (v: unknown): v is number => typeof v === 'number' && Number.isSafeInteger(v) && v >= 0;
    if (!isCount(x?.total) || !x.counts || typeof x.counts !== 'object' || Array.isArray(x.counts) || typeof x.updatedAt !== 'string' || Number.isNaN(Date.parse(x.updatedAt))) return null;
    const counts: Record<string, number> = Object.fromEntries(ESP_CATS.map((c) => [c, 0]));
    for (const [p, c] of Object.entries(x.counts)) {
      if (!isCount(c)) return null;
      const k = p.trim().toLowerCase();
      const cat = ['microsoft / outlook', 'microsoft', 'outlook'].includes(k) ? 'Outlook' : ESP_CATS.find((e) => e.toLowerCase() === k) ?? (k ? 'Other' : 'Unknown');
      counts[cat] += c;
    }
    return { total: x.total, updatedAt: x.updatedAt, counts: ESP_CATS.map((name) => ({ name, count: counts[name] })).filter((r) => r.count > 0).sort((a, b) => b.count - a.count) };
  } catch { return null; }
}

/** GET /hq/api/campaigns/lists/:rec/fields: the Lead List Center's editable fields. */
export async function listFieldsView(at: HqAirtable, db: Db, id: string, canAct: boolean) {
  const rec = await at.get(LEAD_LISTS_T, id, LIST_READ);
  if (!rec) return null;
  const f = rec.fields;
  const l = listState(rec);
  const values = Object.fromEntries(Object.entries(LIST_EDIT).map(([k, d]) => [k, d.kind === 'bool' ? f[d.id] === true : d.kind === 'number' ? (has(f[d.id]) ? n(f[d.id]) : null) : d.kind === 'multi' ? (Array.isArray(f[d.id]) ? (f[d.id] as unknown[]).map(s) : []) : s(f[d.id])]));
  const src = await cachedCampaigns(at, db);
  const ws = clientIndex(src.ws);
  const key = ws.get(l.clients[0] ?? '')?.key ?? '';
  const campaigns = src.campaigns.filter((c) => ids(c.fields[CX.client]).some((x) => x === l.clients[0] || (key && ws.get(x)?.key === key))).map((c) => ({ id: c.id, name: s(c.fields[CX.name]) }));
  return {
    id, values, defs: Object.fromEntries(Object.entries(LIST_EDIT).map(([k, d]) => [k, { kind: d.kind, label: d.label, choices: d.choices ?? null }])),
    route: { generic: l.includeGeneric, direct: l.includeDirect, leadMagic: l.useLeadMagic, genericVerifier: s(f[LL.genericVerifier]), directVerifier: s(f[LL.directVerifier]) },
    qa: { status: l.qa, summary: s(f[LL.qaSummary]).slice(0, 2000), requiredFields: s(f[LL.requiredFields]), duplicateCheck: s(f[LL.duplicateCheck]), finalSchema: s(f[LL.finalSchema]), duplicates: n(f[LL.duplicateCount]), rejected: n(f[LL.rejectedCount]) },
    saved: { processing: l.processing, message: s(f[LX.workflowMessage]).slice(0, 1500), error: s(f[LX.lastError]).slice(0, 1500) },
    bisonListId: s(f[LL.bisonListId]), sourceType: s(f[LL.sourceType]) || 'DiscoLike', campaigns, linked: l.campaigns,
    esp: { pre: espOf(s(f[ESP.pre])), production: espOf(s(f[ESP.production])) },
    deepReview: { results: /^https:\/\//.test(s(f[ESP.deepResults])) ? s(f[ESP.deepResults]) : '', needsReview: n(f[ESP.needsReview]) },
    locked: listLocked(l), canAct, readAt: new Date().toISOString(),
  };
}

// ---------- edits ----------
export async function editCampaign(at: HqAirtable, db: Db, id: string, body: any, actor: string): Promise<ParityResult> {
  if (body?.confirm !== true) return refuse(400, 'confirm: true is required');
  const chk = checkEdits(CAMPAIGN_EDIT, body?.changes);
  if (!chk.ok) return refuse(400, chk.error);
  const rec = await at.get(CAMPAIGNS_T, id, [CX.name, CX.engineAction, CX.engineStatus]);
  if (!rec) return refuse(404, 'no such campaign');
  if (campaignLocked(campaignState(rec, null))) return refuse(409, 'A step is running on this campaign: wait for its result.');
  if (chk.fields[CX.name] === null || chk.fields[CX.name] === '') return refuse(400, 'The campaign needs a name.');
  await at.update(CAMPAIGNS_T, id, chk.fields);
  await audit(db, actor, 'campaign-edit', id, { campaign: s(rec.fields[CX.name]), fields: chk.labels });
  _resetCampaignsCache();
  return { status: 200, body: { ok: true, message: `Saved: ${chk.labels.join(', ')}.` } };
}
export async function editList(at: HqAirtable, db: Db, id: string, body: any, actor: string): Promise<ParityResult> {
  if (body?.confirm !== true) return refuse(400, 'confirm: true is required');
  const chk = checkEdits(LIST_EDIT, body?.changes);
  if (!chk.ok) return refuse(400, chk.error);
  const rec = await at.get(LEAD_LISTS_T, id, [LX.name, LX.engineAction, LX.engineStatus, LX.processing]);
  if (!rec) return refuse(404, 'no such lead list');
  if (listLocked(listState(rec))) return refuse(409, 'A step is running on this list: wait for its result.');
  if (chk.fields[LL.displayName] === null) return refuse(400, 'The lead list needs a name.');
  // The screen keeps the file name with the display name when the list is named (createLeadList).
  await at.update(LEAD_LISTS_T, id, chk.fields);
  await audit(db, actor, 'list-edit', id, { list: s(rec.fields[LX.name]), fields: chk.labels });
  _resetCampaignsCache();
  return { status: 200, body: { ok: true, message: `Saved: ${chk.labels.join(', ')}.` } };
}

// ---------- campaign actions ----------
const CAMPAIGN_DO = ['send-review', 'changes-requested', 'approve-prepare', 'refresh-sequence', 'spintax', 'delete-variant', 'clone', 'delete', 'clear-status', 'link-list', 'set-accounts', 'pivot', 'create-topup'] as const;
export type CampaignDo = (typeof CAMPAIGN_DO)[number];
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
export interface ParityDeps { delayMs?: number; now?: () => Date; rnd?: () => number }

export async function campaignDo(at: HqAirtable, db: Db, cfg: Config, id: string, body: any, actor: string, deps: ParityDeps = {}): Promise<ParityResult> {
  const action = String(body?.action ?? '') as CampaignDo;
  if (!CAMPAIGN_DO.includes(action)) return refuse(400, 'unknown action');
  if (body?.confirm !== true) return refuse(400, 'confirm: true is required');
  const now = deps.now?.() ?? new Date();
  const rec = await at.get(CAMPAIGNS_T, id, CAMPAIGN_READ);
  if (!rec) return refuse(404, 'no such campaign');
  const f = rec.fields; const name = s(f[CX.name]) || 'this campaign';
  const c = campaignState(rec, null);
  const locked = campaignLocked(c);
  const write = async (fields: Record<string, unknown>, what: Record<string, unknown> = {}) => {
    await at.update(CAMPAIGNS_T, id, fields);
    await audit(db, actor, `campaign-${action}`, id, { campaign: name, fields: Object.keys(fields), ...what });
    _resetCampaignsCache();
  };
  const ok = (message: string, extra: Record<string, unknown> = {}): ParityResult => ({ status: 200, body: { ok: true, message, ...extra } });
  switch (action) {
    case 'send-review': {
      // Send for approval: Workflow Stage = Client Review, the review clock (48 weekday hours) and no approval source.
      await write({ [CX.stage]: 'Client Review', [CC.submittedAt]: now.toISOString(), [CC.autoApproveAt]: addWeekdayHours(now, 48).toISOString(), [CC.approvalSource]: '' });
      return ok(`"${name}" moved to Client Review. It auto-approves after 48 weekday hours unless the client answers.`);
    }
    case 'changes-requested': {
      await write({ [CX.stage]: 'Changes Requested' });
      return ok(`"${name}" moved to Changes Requested.`);
    }
    case 'approve-prepare': {
      const exception = body?.exception === true;
      const ap = approvalOf(f);
      if (!exception && !ap.approved) return refuse(409, 'Client feedback must say Approve Campaign first.');
      if (exception && body?.acknowledged !== true) return refuse(400, 'Confirm that client approval is not required before using the exception.');
      const update: Record<string, unknown> = {};
      CC.review.forEach((x, i) => {
        const st = i + 1;
        const subj = one(`Campaign Email ${st} Subject Version 1`, `Campaign Email ${st} Subject`, `Campaign Subject ${st} Version 1`, `Campaign Email ${st} Subject Spintax 1`);
        const bod = one(`Campaign Body ${st} Version 1`, `Campaign Email ${st} Body Spintax 1`);
        if (subj && has(f[x.subject])) update[subj] = f[x.subject];
        if (bod && has(f[x.body])) update[bod] = f[x.body];
      });
      update[CX.stage] = 'Approved';
      update[CC.approvalSource] = exception ? 'Internal approval exception' : 'Client approved';
      await write(update, { exception });
      return ok(exception ? `"${name}" approved by Dulcy (exception) and the sequence is prepared.` : `"${name}" approved and the sequence is prepared. Next: Refresh from approved copy if it has variants, then Generate spintax.`);
    }
    case 'refresh-sequence': {
      let r: ReturnType<typeof sequenceFromReview>;
      try { r = sequenceFromReview(f); } catch (e) { return refuse(400, (e as Error).message); }
      await write(r.update, { counts: r.counts });
      return ok(`Sequence refreshed from the approved copy: ${Object.entries(r.counts).map(([st, k]) => `Email ${st}: ${k} ${k === 1 ? 'variant' : 'variants'}`).join(', ')}.`, { counts: r.counts });
    }
    case 'spintax': {
      const request = JSON.stringify({ kind: 'spintax', label: 'Generate and validate spintax', requestedAt: now.toISOString(), baselineStatus: s(f[CX.status]), baselineBisonId: s(f[CF.bisonId]) });
      await write({ [CF.automationRequest]: request, [CF.createSpintax]: true, [CX.stage]: 'Spintax in Progress' });
      return ok(`Spintax generation and validation sent to the Airtable automation for "${name}". Campaign Status becomes Spintax Generated when it is done.`);
    }
    case 'delete-variant': {
      const st = Number(body?.step); const v = Number(body?.variant);
      if (!Number.isInteger(st) || st < 1 || st > 4 || !Number.isInteger(v) || v < 2 || v > 10) return refuse(400, 'pick a step (1-4) and a variant B-J (Variant A is never deleted)');
      const t = seqField(st, v);
      const fields: Record<string, unknown> = {};
      if (t.subject) fields[t.subject] = null;
      if (t.body) fields[t.body] = null;
      if (!Object.keys(fields).length) return refuse(400, 'that variant has no fields');
      await write(fields, { step: st, variant: v });
      return ok(`Variant ${st}${'ABCDEFGHIJ'[v - 1]} cleared.`);
    }
    case 'clone': {
      const values: Record<string, unknown> = {};
      for (const k of CLONE_FIELDS) if (has(f[k])) values[k] = f[k];
      values[CX.name] = `${s(f[CX.name]) || 'Campaign'} Copy`;
      values[CX.status] = 'Draft';
      values[CF.startTime] = randomTime(8, deps.rnd); values[CF.endTime] = randomTime(18, deps.rnd);
      const newId = await at.create(CAMPAIGNS_T, values);
      await audit(db, actor, 'campaign-clone', id, { campaign: name, newId, fields: Object.keys(values).length });
      _resetCampaignsCache();
      return ok(`Draft copy "${values[CX.name]}" created without the lead list or inboxes; link them before building.`, { id: newId });
    }
    case 'delete': {
      // On in HQ (Alex 2026-11-29: "it should have a delete button, same as the Campaign Center").
      if (String(body?.typed ?? '').trim() !== 'DELETE') return refuse(400, 'Type DELETE to delete this campaign.');
      if (locked) return refuse(409, 'A step is running on this campaign: wait for its result.');
      // The automation fires when Bison Action becomes non-empty: clear an older action first (the screen does the same).
      if (s(f[CF.bisonAction])) { await at.update(CAMPAIGNS_T, id, { [CF.bisonAction]: null }); await sleep(deps.delayMs ?? 500); }
      const request = JSON.stringify({ kind: 'Delete', label: 'Delete campaign', requestedAt: now.toISOString(), baselineStatus: s(f[CX.status]), baselineBisonId: s(f[CF.bisonId]) });
      await write({ [CF.automationRequest]: request, [CF.bisonAction]: 'Delete' });
      return ok(`Delete request sent to the Airtable automation for "${name}": it deletes the EmailBison campaign first (when it has one), then the Airtable record.`);
    }
    case 'clear-status': {
      if (locked) return refuse(409, 'A current automation request cannot be cleared. Wait for its result.');
      await write({ [CX.processing]: null, [CF.message]: null, [CF.error]: null });
      return ok('Saved status cleared. Engine fields were not changed.');
    }
    case 'link-list': {
      const listId = String(body?.listId ?? '');
      if (!isRec(listId)) return refuse(400, 'pick a lead list');
      const list = await at.get(LEAD_LISTS_T, listId, [LX.client, LX.name]);
      if (!list) return refuse(404, 'no such lead list');
      const src = await cachedCampaigns(at, db); const ws = clientIndex(src.ws);
      const mine = ids(f[CX.client]); const key = ws.get(mine[0] ?? '')?.key;
      if (!ids(list.fields[LX.client]).some((x) => mine.includes(x) || (key && ws.get(x)?.key === key))) return refuse(409, 'Choose a Lead List that belongs to this campaign’s client.');
      await write({ [CX.lists]: [listId] }, { listId });
      return ok(`Lead list "${s(list.fields[LX.name]) || listId}" linked to "${name}".`);
    }
    case 'set-accounts': {
      if (locked) return refuse(409, 'A step is running on this campaign: wait for its result.');
      const want = Array.isArray(body?.ids) ? [...new Set((body.ids as unknown[]).map(String))] : null;
      if (!want || want.length > 500 || !want.every(isRec)) return refuse(400, 'send ids: up to 500 email account record IDs');
      const src = await cachedCampaigns(at, db); const ws = clientIndex(src.ws);
      const key = ws.get(ids(f[CX.client])[0] ?? '')?.key;
      if (!key) return refuse(409, 'Link this campaign to a client first.');
      const pool = new Set(((await sendingAccountsView(at, db, cfg, { client: key })) as any).accounts.map((a: any) => a.id));
      const stranger = want.filter((x) => !pool.has(x) && !c.accounts.includes(x));
      if (stranger.length) return refuse(409, `${stranger.length} inbox${stranger.length === 1 ? ' is' : 'es are'} not this client's.`);
      await write({ [CX.accounts]: want }, { before: c.accounts.length, after: want.length });
      return ok(`${want.length} inbox${want.length === 1 ? '' : 'es'} selected for "${name}".${c.bison.length ? ' Press Update senders to make EmailBison match.' : ''}`);
    }
    case 'pivot': {
      const which = body?.which === 'offer' ? 'offer' : body?.which === 'vertical' ? 'vertical' : null;
      if (!which || typeof body?.enabled !== 'boolean') return refuse(400, 'send which: vertical | offer and enabled: true | false');
      const client = ids(f[CX.client])[0];
      if (!client) return refuse(409, 'Link this campaign to a client before changing client-wide pivot options.');
      await at.update(WORKSPACES_T, client, { [PIVOT[which]]: body.enabled ? 'Enabled' : 'Disabled' });
      await audit(db, actor, 'campaign-pivot', client, { campaign: name, which, enabled: body.enabled });
      return ok(`${which === 'vertical' ? 'New vertical pivot' : 'New offer pivot'} ${body.enabled ? 'on' : 'off'} for this client and every linked campaign.`);
    }
    case 'create-topup': return createTopUp(at, db, rec, body, actor, now);
  }
  return refuse(400, 'unknown action');
}

/** Top up · Create lead list: copies the campaign list's targeting and excludes the contacts in its attached lists (the screen's createTopUpBuild). */
async function createTopUp(at: HqAirtable, db: Db, rec: AirtableRecord, body: any, actor: string, now: Date): Promise<ParityResult> {
  const f = rec.fields; const id = rec.id;
  const replies = n(f[CF.replies]); const interested = n(f[CF.interested]);
  const ruleMet = replies > 0 && interested / replies >= 0.15;
  if (!ruleMet && body?.acknowledged !== true) return refuse(400, 'Tick the KPI exception before starting this top-up (interested is under 15% of replies).');
  const READ = [...new Set([LX.name, LX.client, LX.sheetLink, LX.finalDirect, LX.finalGeneric, LL.topUpScope, ...TOP_UP_COPY_FIELDS])];
  const mainIds = ids(f[CX.lists]); const attachedIds = [...new Set([...mainIds, ...ids(f[CX.topupList])])];
  const attached = (await Promise.all(attachedIds.map((x) => at.get(LEAD_LISTS_T, x, READ)))).filter((x): x is AirtableRecord => !!x);
  const leads = (l: AirtableRecord) => n(l.fields[LX.finalGeneric]) + n(l.fields[LX.finalDirect]);
  const sources = attached.filter((l) => leads(l) > 0);
  if (!sources.length) return refuse(409, 'This campaign has no attached completed list to use as the source.');
  const clientIds = ids(f[CX.client]);
  const sameClient = (l: AirtableRecord) => ids(l.fields[LX.client]).some((x) => clientIds.includes(x));
  const scopeOf = (l: AirtableRecord) => { try { return JSON.parse(s(l.fields[LL.topUpScope]) || '{}'); } catch { return null; } };
  // Reuse an unfinished top-up for this campaign instead of creating a second one.
  const candidates = await at.list(LEAD_LISTS_T, `FIND("${id}", {Top-up Build Scope JSON})`, READ, 50).catch(() => [] as AirtableRecord[]);
  const existing = candidates.find((l) => { const sc = scopeOf(l); return sc?.version === 1 && sc.mode === 'this-build-only' && sc.campaignRecordId === id && (sc.buildRecordId === l.id || sc.buildRecordId === 'pending') && Array.isArray(sc.sources) && sc.sources.length > 0 && sameClient(l) && !leads(l); });
  if (existing) {
    const sc = scopeOf(existing);
    if (sc.buildRecordId === 'pending') await at.update(LEAD_LISTS_T, existing.id, { [LL.topUpScope]: JSON.stringify({ ...sc, buildRecordId: existing.id }) });
    await at.update(CAMPAIGNS_T, id, { [CX.topupList]: [existing.id] });
    await audit(db, actor, 'campaign-create-topup', id, { reused: existing.id });
    _resetCampaignsCache();
    return { status: 200, body: { ok: true, id: existing.id, message: `Linked the unfinished top-up list "${s(existing.fields[LX.name])}"; build it in Lead lists, then press Top up.` } };
  }
  const source = sources.find((l) => l.id === mainIds[0]) ?? sources[0];
  if (!sameClient(source)) return refuse(409, 'Source list and campaign client do not match.');
  const scopeSources: { recordId: string; sheetId: string; tabs: string[] }[] = [];
  for (const l of sources) {
    if (!sameClient(l)) return refuse(409, 'An attached exclusion list belongs to a different client.');
    const sheetId = s(l.fields[LX.sheetLink]).match(/\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/)?.[1];
    if (!sheetId) return refuse(409, 'An attached source list is missing its Google Sheet.');
    scopeSources.push({ recordId: l.id, sheetId, tabs: [...(n(l.fields[LX.finalDirect]) ? ['Final Direct'] : []), ...(n(l.fields[LX.finalGeneric]) ? ['Final Generic'] : [])] });
  }
  // Keep the earlier exclusion chain when a campaign gets more than one top-up.
  for (const l of sources) {
    if (!s(l.fields[LL.topUpScope])) continue;
    const prior = scopeOf(l);
    if (!prior || prior.version !== 1 || prior.mode !== 'this-build-only' || prior.buildRecordId !== l.id || prior.campaignRecordId !== id || !Array.isArray(prior.sources)) return refuse(409, 'An attached top-up belongs to a different build or campaign.');
    for (const e of prior.sources) {
      if (!/^rec[a-zA-Z0-9]+$/.test(e.recordId) || !/^[-_a-zA-Z0-9]+$/.test(e.sheetId) || !Array.isArray(e.tabs) || !e.tabs.length || e.tabs.some((t: string) => !['Final Direct', 'Final Generic'].includes(t))) return refuse(409, 'An earlier exclusion source is invalid.');
      const found = scopeSources.find((x) => x.recordId === e.recordId);
      if (found && found.sheetId !== e.sheetId) return refuse(409, 'An earlier exclusion source has conflicting sheet links.');
      if (found) found.tabs = [...new Set([...found.tabs, ...e.tabs])]; else scopeSources.push({ recordId: e.recordId, sheetId: e.sheetId, tabs: [...e.tabs] });
    }
  }
  const scope = { version: 1, mode: 'this-build-only', buildRecordId: 'pending', campaignRecordId: id, createdAt: now.toISOString(), sources: scopeSources };
  const values: Record<string, unknown> = {};
  for (const k of TOP_UP_COPY_FIELDS) if (has(source.fields[k])) values[k] = source.fields[k];
  values[LX.name] = `${s(source.fields[LX.name]) || 'Lead list'} — Top-up ${now.toISOString().slice(0, 16).replace('T', ' ')}`;
  values[LL.topUpScope] = JSON.stringify(scope);
  // Not linked through "Which Campaign?": that is the campaign's Lead List link and would double-link the campaign.
  for (const k of [LL.automationAction, LL.enrichmentAction, LL.qaAction]) values[k] = null;
  values[LX.stage] = 'Source & ICP'; values[LX.processing] = 'Not Started';
  const newId = await at.create(LEAD_LISTS_T, values);
  await at.update(LEAD_LISTS_T, newId, { [LL.topUpScope]: JSON.stringify({ ...scope, buildRecordId: newId }) });
  await at.update(CAMPAIGNS_T, id, { [CX.topupList]: [newId] });
  await audit(db, actor, 'campaign-create-topup', id, { newId, sources: scopeSources.length, outsideKpi: !ruleMet });
  _resetCampaignsCache();
  return { status: 200, body: { ok: true, id: newId, message: 'Top-up lead list created and linked. Build it in Lead lists, then press Top up.' } };
}

// ---------- new records (the screens' creators) ----------
/** New campaign by hand (the Campaign Center's "New Campaign" form): a Draft campaign and, optionally, its lead list. */
export async function createCampaignByHand(at: HqAirtable, db: Db, body: any, actor: string, deps: ParityDeps = {}): Promise<ParityResult> {
  if (body?.confirm !== true) return refuse(400, 'confirm: true is required');
  const title = String(body?.title ?? '').replace(/\s+/g, ' ').trim();
  const thesis = String(body?.thesis ?? '').trim().slice(0, 20_000);
  const mode = body?.list === 'existing' ? 'existing' : body?.list === 'none' ? 'none' : 'new';
  if (!title || title.length > 200) return refuse(400, 'Enter a campaign name without the client prefix.');
  const src = await cachedCampaigns(at, db, true); const ws = clientIndex(src.ws);
  const key = String(body?.client ?? '');
  const recs = src.ws.filter((w) => ws.get(w.id)?.key === key && ws.get(w.id)?.active);
  const main = recs.filter((w) => s(w.fields.Status) === 'Active').sort((a, b) => s(a.fields.Name).length - s(b.fields.Name).length)[0];
  if (!key || !main) return refuse(400, 'Choose one active client before creating a campaign.');
  const clientName = s(main.fields.Name);
  let listId = '';
  if (mode === 'existing') {
    listId = String(body?.listId ?? '');
    const l = isRec(listId) ? await at.get(LEAD_LISTS_T, listId, [LX.client]) : null;
    if (!l || !ids(l.fields[LX.client]).some((x) => ws.get(x)?.key === key)) return refuse(400, 'Choose an existing Lead List belonging to the selected client.');
  }
  const values: Record<string, unknown> = { [CX.name]: clientPrefixed(clientName, title) };
  if (thesis) values[CF.thesis] = thesis;
  values[CF.startTime] = randomTime(8, deps.rnd); values[CF.endTime] = randomTime(18, deps.rnd);
  values[CX.client] = [main.id];
  values[CX.stage] = 'Strategy Draft'; values[CX.status] = 'Draft';
  const campaignId = await at.create(CAMPAIGNS_T, values);
  if (mode === 'new') {
    const listTitle = String(body?.listTitle ?? '').replace(/\s+/g, ' ').trim() || title;
    const lv: Record<string, unknown> = { [LX.name]: clientPrefixed(clientName, listTitle) };
    if (thesis) lv[LX.icp] = thesis;
    lv[LX.client] = [main.id]; lv[LX.campaigns] = [campaignId]; lv[LL.sourceType] = 'DiscoLike'; lv[LX.stage] = 'Source & ICP'; lv[LX.processing] = 'Not Started';
    // Clear the action during creation so no automation runs a field default.
    lv[LL.automationAction] = null;
    listId = await at.create(LEAD_LISTS_T, lv);
  }
  if (listId) {
    await at.update(CAMPAIGNS_T, campaignId, { [CX.lists]: [listId] });
    // Final write once both records exist: link, the new targeting sentence, and no stale retry command.
    await at.update(LEAD_LISTS_T, listId, { [LX.campaigns]: [campaignId], ...(thesis ? { [LX.icp]: thesis } : {}), [LL.automationAction]: null });
  }
  await audit(db, actor, 'campaign-create', campaignId, { client: clientName, name: values[CX.name], list: mode, listId });
  _resetCampaignsCache();
  return { status: 200, body: { ok: true, id: campaignId, listId, message: listId ? 'Campaign created and its Lead List was linked.' : 'Campaign created.' } };
}

/** New Lead List (the Lead List Center's creator): a Draft list that runs on the engine from its first press. */
export async function createListByHand(at: HqAirtable, db: Db, body: any, actor: string): Promise<ParityResult> {
  if (body?.confirm !== true) return refuse(400, 'confirm: true is required');
  const name = String(body?.name ?? '').replace(/\s+/g, ' ').trim();
  if (!name || name.length > 200) return refuse(400, 'Name the lead list.');
  if (body?.sourceType && body.sourceType !== 'DiscoLike') return refuse(400, 'HQ makes DiscoLike lists; a third-party domain upload is still made in Airtable.');
  const src = await cachedCampaigns(at, db, true); const ws = clientIndex(src.ws);
  const key = String(body?.client ?? '');
  const client = key ? src.ws.filter((w) => ws.get(w.id)?.key === key && ws.get(w.id)?.active).sort((a, b) => Number(s(b.fields.Status) === 'Active') - Number(s(a.fields.Status) === 'Active') || s(a.fields.Name).length - s(b.fields.Name).length)[0] : undefined;
  if (key && !client) return refuse(400, 'pick an active client');
  const icp = String(body?.icp ?? '').trim().slice(0, 20_000);
  const fields: Record<string, unknown> = {
    [LL.displayName]: name, [LL.fileName]: name, [LX.runsOnEngine]: true, ...(client ? { [LX.client]: [client.id] } : {}),
    [LX.stage]: 'Draft', [LX.processing]: 'Not Started', [LX.qa]: 'Not Checked', [LL.sourceType]: 'DiscoLike', ...(icp ? { [LX.icp]: icp } : {}),
    [LX.sampleSize]: 100, [LL.companyValidationStatus]: 'Not Started', [LX.contactSampleSize]: 100, [LL.contactValidationStatus]: 'Not Started',
    [LX.expansionTarget]: 1000, [LL.expansionApproval]: 'Not Requested',
  };
  const id = await at.create(LEAD_LISTS_T, fields);
  await audit(db, actor, 'list-create', id, { name, client: client ? s(client.fields.Name) : '' });
  _resetCampaignsCache();
  return { status: 200, body: { ok: true, id, message: 'Lead list project created. Next: Generate filters.' } };
}

// ---------- lead list actions ----------
const LIST_DO = ['clear-status', 'use-thesis', 'verify-route', 'leadmagic', 'manual-qa', 'link-campaign', 'delete'] as const;
export async function listDo(at: HqAirtable & { remove?: (t: string, id: string) => Promise<void> }, db: Db, id: string, body: any, actor: string): Promise<ParityResult> {
  const action = String(body?.action ?? '') as (typeof LIST_DO)[number];
  if (!LIST_DO.includes(action)) return refuse(400, 'unknown action');
  if (body?.confirm !== true) return refuse(400, 'confirm: true is required');
  const rec = await at.get(LEAD_LISTS_T, id, LIST_READ);
  if (!rec) return refuse(404, 'no such lead list');
  const f = rec.fields; const l = listState(rec); const name = l.name; const locked = listLocked(l);
  const write = async (fields: Record<string, unknown>, what: Record<string, unknown> = {}) => {
    await at.update(LEAD_LISTS_T, id, fields);
    await audit(db, actor, `list-${action}`, id, { list: name, fields: Object.keys(fields), ...what });
    _resetCampaignsCache();
  };
  const ok = (message: string): ParityResult => ({ status: 200, body: { ok: true, message } });
  switch (action) {
    case 'clear-status':
      if (locked) return refuse(409, 'A step is running on this list: wait for its result.');
      await write({ [LX.processing]: null, [LX.workflowMessage]: null, [LX.lastError]: null });
      return ok('Saved automation status cleared. This did not stop or change any engine job.');
    case 'use-thesis': {
      if (locked) return refuse(409, 'A step is running on this list: wait for its result.');
      const camp = l.campaigns[0] ? await at.get(CAMPAIGNS_T, l.campaigns[0], [CF.thesis]) : null;
      const thesis = s(camp?.fields[CF.thesis]);
      if (!thesis) return refuse(409, 'The linked campaign has no thesis yet.');
      await write({ [LX.icp]: thesis });
      return ok('Targeting sentence copied from the linked campaign thesis. Review it, then Generate filters.');
    }
    case 'verify-route': {
      if (locked || l.finalLeads > 0) return refuse(409, locked ? 'A step is running on this list: wait for its result.' : 'Verification is done: the route can no longer change.');
      const generic = body?.generic === true; const direct = body?.direct === true;
      if (!generic && !direct) return refuse(400, 'Choose at least one email type.');
      await write({ [LX.includeGeneric]: generic, [LX.includeDirect]: direct, [LL.genericVerifier]: generic ? 'MillionVerifier' : 'None', [LL.directVerifier]: 'MillionVerifier', [LL.verificationProvider]: 'MillionVerifier' });
      return ok('Saved. Existing emails go to MillionVerifier first. LeadMagic recovery is optional for direct contacts.');
    }
    case 'leadmagic': {
      if (locked) return refuse(409, 'A step is running on this list: wait for its result.');
      if (typeof body?.enabled !== 'boolean') return refuse(400, 'send enabled: true | false');
      await write({ [LX.useLeadMagic]: body.enabled });
      return ok(body.enabled ? 'Recovery on. LeadMagic will only process unresolved direct contacts; valid results and generic emails are excluded.' : 'Recovery off. Only MillionVerifier will process existing emails.');
    }
    case 'manual-qa': {
      const next = String(body?.status ?? '');
      let update: Record<string, unknown>;
      try { update = manualQaUpdate(f, next); } catch (e) { return refuse(409, (e as Error).message); }
      await write(update, { status: next });
      return ok(next === 'Passed' ? 'Manual QA approval and lead-list readiness saved together.' : `QA status saved: ${next || 'cleared'}.`);
    }
    case 'delete': {
      // Same as the Lead List Center's Delete (Alex 2026-11-29): removes only this Airtable Lead Lists
      // record; external lists, campaigns and files are not deleted. Typed DELETE, nothing running.
      if (String(body?.typed ?? '').trim() !== 'DELETE') return refuse(400, 'Type DELETE to delete this lead list.');
      if (locked) return refuse(409, 'A step is running on this list: wait for its result.');
      if (!at.remove) return refuse(503, 'Deleting is not available on this server. Nothing was deleted.');
      await at.remove(LEAD_LISTS_T, id);
      await audit(db, actor, 'list-delete', id, { list: name });
      _resetCampaignsCache();
      return ok(`"${name}" was deleted from Airtable. External lists, campaigns and files were not touched.`);
    }
    case 'link-campaign': {
      const cid = String(body?.campaignId ?? '');
      if (!isRec(cid)) return refuse(400, 'pick a campaign');
      const camp = await at.get(CAMPAIGNS_T, cid, [CX.client, CX.name]);
      if (!camp) return refuse(404, 'no such campaign');
      const src = await cachedCampaigns(at, db); const ws = clientIndex(src.ws);
      const key = ws.get(l.clients[0] ?? '')?.key;
      if (!ids(camp.fields[CX.client]).some((x) => l.clients.includes(x) || (key && ws.get(x)?.key === key))) return refuse(409, 'Choose a campaign of this list’s client.');
      await write({ [LX.campaigns]: [cid] }, { campaignId: cid });
      return ok(`Linked to "${s(camp.fields[CX.name])}".`);
    }
  }
  return refuse(400, 'unknown action');
}

// ---------- the two webhooks the Campaign Center keeps outside the engine ----------
/** Sync with Bison (the full campaign sync relay) and Sync Bison Senders (n8n): the screen's exact body, host-checked. */
export async function postSync(db: Db, cfg: Pick<Config, 'bisonSyncWebhookUrl' | 'bisonSenderSyncWebhookUrl'>, body: any, actor: string, fetchImpl: typeof fetch = fetch, now = new Date()): Promise<ParityResult> {
  if (body?.confirm !== true) return refuse(400, 'confirm: true is required');
  const which = body?.which === 'senders' ? 'senders' : body?.which === 'campaigns' ? 'campaigns' : null;
  if (!which) return refuse(400, 'send which: campaigns | senders');
  const url = which === 'campaigns' ? cfg.bisonSyncWebhookUrl : cfg.bisonSenderSyncWebhookUrl;
  const host = which === 'campaigns' ? 'bison-sync-relay.scale-f9d.workers.dev' : 'n8n.dulcy.io';
  const label = which === 'campaigns' ? 'Bison sync request' : 'Bison sender sync request';
  if (!url) return refuse(503, `${label}: the webhook URL is not set on the server (${which === 'campaigns' ? 'BISON_SYNC_WEBHOOK_URL' : 'BISON_SENDER_SYNC_WEBHOOK_URL'}).`);
  let parsed: URL;
  try { parsed = new URL(url); } catch { return refuse(503, `The ${label} URL is invalid.`); }
  if (parsed.protocol !== 'https:' || parsed.hostname !== host) return refuse(503, `The ${label} URL is invalid.`);
  let r: Response;
  try { r = await fetchImpl(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ source: 'Campaign Center', requestedAt: now.toISOString() }), signal: AbortSignal.timeout(15_000) }); }
  catch (e) { return refuse(502, (e as Error)?.name === 'TimeoutError' ? `The ${label} timed out. Check the automation history before trying again.` : `The ${label} could not be sent.`); }
  await audit(db, actor, `sync-${which}`, '', { status: r.status });
  if (!r.ok) return refuse(502, `The ${label} was rejected (${r.status}).`);
  return { status: 200, body: { ok: true, message: which === 'campaigns' ? 'Full EmailBison campaign sync started: every campaign record updates in a few minutes.' : 'Sender sync started: the inbox links of every active campaign refresh in a few minutes.' } };
}

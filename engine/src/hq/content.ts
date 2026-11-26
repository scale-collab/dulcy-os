// HQ Content (Step 3, 2026-11-26): the Airtable Content Center (Content OS → Content Center, page
// pagacLOPVCIQb1RQt; code in airtable/custom-elements/content-center/source.tsx) as one simple area.
// Alex records every Friday morning (main channel 2 a week, Raw 5). Show what needs Alex first;
// everything else is one tap deeper. Owner only (Sienna is OWNER_ONLY; the route answers 403 to members).
//   - Needs you: ideas waiting for a decision (Approve / Reject), final clips Sienna's editor passed
//     (link only, see below), and the other Content Center steps that wait on Alex (link only).
//   - Friday: this week's approved ideas per channel in recording order, with the script, hooks,
//     titles, thumbnail idea and Gamma outline that sienna.prep wrote; count vs target.
//   - Pipeline: Idea → Approved → Script ready → Recorded → Editing → Final review → Final approved →
//     Posted, plus the Content Center's own "next step" for each video and which automation runs it.
//   - Week: ideas proposed / approved / recorded / posted vs target, and Problem → Data → Fix notes.
// Writes: only the Content Center's idea decision ("Approve & schedule" / "Reject idea"), field for
// field (decideIdea in source.tsx): Idea Decision, Production Stage "Idea Approved", Recording Date and
// Publish Date from the same scheduling rule (nextIdeaDates, ported below). No n8n flow reads Idea
// Decision; the engine's sienna.prep (every 30 min) writes the script after an approval. Every write
// is logged in hq_content_log. Clip approval is NOT written from HQ: the Content Center's "Approve
// reviewed copy" writes Review Intent JSON and then calls an n8n webhook ([Content OS] Current Clip
// Review and Preview) that checks the intent's Airtable author (Review Intent Author, lastModifiedBy)
// against the owner; HQ can't do that (and never calls n8n), so those items link to Airtable.
// Nothing here posts, schedules, deletes, or calls OpusClip, Gamma, Frame.io, YouTube, Discord or n8n.
// Airtable reads: batched (6 list calls, no per-row calls), one cache for everyone, 60 seconds.
import type { Db } from '../db/pool.js';
import type { AirtableRecord } from '../providers/airtable.js';
import type { HqAirtable } from './decisions.js';
import { CF, CONTENT, SETTINGS, ideaQuota, prepFormula } from '../agents/sienna.js';
import type { AgentName } from './agents.js';

export const CLIPS = 'tblg1Tj9atyxN0piT';
export const CONTENT_CENTER_PAGE = 'pagacLOPVCIQb1RQt';
export const CONTENT_CACHE_MS = 60_000;
export const CHANNELS = ['Alex Woung', 'Alex Woung Raw'] as const;
export type Channel = (typeof CHANNELS)[number];
export const CHANNEL_KEY: Record<Channel, string> = { 'Alex Woung': 'main', 'Alex Woung Raw': 'raw' };
export const CHANNEL_LABEL: Record<Channel, string> = { 'Alex Woung': 'Main', 'Alex Woung Raw': 'Raw' };

/** Content Channels field IDs beyond sienna.ts CF (from the Content Center's FIELD_IDS, checked with airtable/SCHEMA.md). */
export const XF = {
  publishDate: 'fld33u5iDFqKNP4DM', youtubeUrl: 'fldLwtuaidYVD0K8n', youtubePublishedAt: 'fldeep1b7vD1Vk9PE', publishingStatus: 'fldPmbanBb8IAkdZx',
  rawFolderUrl: 'fldQMrNJf43tVfcja', finalFolderUrl: 'fldNf75BRKcHTYDpS', finalAssetUrl: 'fld9Q5xoY2RMnpI9j', finalAssetId: 'fld0uQG1C6JjC4hIs',
  thumbnailStatus: 'fldLrqDqzj8RpJXHS', finalThumbnailUrl: 'fld7D4SawTmHSJ1HV', clips: 'fldIMEC5xz2UvbrFj', message: 'fldmOfFh1HnCVbhVP', error: 'fldzm6HMUBG4aY8mr',
  action: 'fldwaCz7Bnob2jIqZ', editingRoute: 'fldQYgyv6isqSusXe', opusProjectId: 'fldP1oNGOVEkAeULJ', opusStatus: 'fld5jzGsZAhq5278P',
  shortProjectId: 'fldiiho0E7IRWZbT9', shortSourceAssetId: 'fldXxLLMPqM8T72KV', shortJobState: 'fldqZyPMUzLu0lb2g',
  distributionStatus: 'fldlyDobu5EyzJxqX', distributionRecords: 'fld2YGy5vpKWisE5d', distributionChannels: 'fldgNrmXVNpFFs9jH', youtubeDescription: 'fldoHO3clLWKw2Gns',
} as const;
/** Content Clips field IDs (Content Center cf + airtable/SCHEMA.md). */
export const KL = {
  name: 'fldaBp4mojdTWCTLk', opusId: 'fldzR1TM7K288Dsto', media: 'flddpK92veotSNWxV', score: 'fldb8Z6t9ASVd3Jtx', status: 'fldYjoD70SRrSlBox',
  parent: 'fldU7Rtnsm0zjnLHp', notes: 'fldbMj0DrFB8QmLNC', hook: 'fld0Vlae8vxvcHEBL', caption: 'fldwTGDOuqducDbRN', publishedUrl: 'fldiQRXynwaMgXv1T',
} as const;
/** Content Automation Settings field IDs (the Content Center's AUTOMATION_SETTINGS_FIELD_IDS). */
export const SF = { channel: 'fldp2ykUFPYYFXPlu', enabled: 'fldzz1f3NRV2keDdM', videosPerWeek: 'fldhV1C8j1LDsCoVJ', clipsPerWeek: 'fldMuMZED81iWQWg4', minimumSpacingDays: 'fldaAPHI6CNgIfMsO' } as const;

const LIGHT = [CF.title, CF.status, CF.stage, CF.channel, CF.recordingDate, XF.publishDate, CF.ideaDecision, CF.ideaScore, CF.ideaKey, CF.ideaCommunity, CF.ideaUrl, CF.source,
  CF.date, CF.recordThisWeek, CF.style, ...Object.values(XF)];
const HEAVY = [CF.script, CF.notes, CF.description, CF.ideaReason];

// ---------- small helpers (pure) ----------
const s = (v: unknown): string => (Array.isArray(v) ? s(v[0]) : v === undefined || v === null ? '' : typeof v === 'object' ? String((v as any).name ?? (v as any).id ?? '') : String(v)).trim();
const ids = (v: unknown): string[] => (Array.isArray(v) ? v : []).map((x: any) => (typeof x === 'string' ? x : x?.id)).filter((x): x is string => typeof x === 'string' && /^rec[A-Za-z0-9]{14}$/.test(x));
const list = (v: unknown): string[] => (Array.isArray(v) ? v.map(s).filter(Boolean) : s(v) ? [s(v)] : []);
const DAY = 86_400_000;
export const etYmd = (d: Date | number) => new Date(d).toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
const addDays = (ymd: string, n: number) => new Date(Date.parse(`${ymd}T12:00:00Z`) + n * DAY).toISOString().slice(0, 10);
const dow = (ymd: string) => new Date(`${ymd}T12:00:00Z`).getUTCDay();
const dateKey = (v: unknown) => { const t = s(v); const m = /^(\d{4}-\d{2}-\d{2})/.exec(t); if (m) return m[1]; const p = Date.parse(t); return Number.isFinite(p) ? etYmd(p) : ''; };
const isChannel = (c: string): c is Channel => (CHANNELS as readonly string[]).includes(c);
export const airtableUrl = (baseId: string, table: string, rec: string) => `https://airtable.com/${baseId}/${table}/${rec}`;
const q = (x: string) => x.replace(/'/g, "\\'");

// ---------- the Content Center's own rules, ported as is ----------
/** Content Center ideaIsArchived. */
export const ideaIsArchived = (decision: string) => /^(Rejected|Duplicate|Archived)$/i.test(decision);
/** Content Center ideaNeedsApproval: true while the idea is not approved (legacy rows already in production count as approved). */
export function ideaNeedsApproval(r: { decision: string; stage: string; hasScript: boolean; youtubeUrl: string }): boolean {
  if (/^Approved$/i.test(r.decision)) return false;
  if (/^(Needs Review|Auto Scheduled|Rejected|Duplicate|Archived)$/i.test(r.decision)) return true;
  return !r.stage && !r.hasScript && !r.youtubeUrl;
}
export interface ChannelIdeaSettings { videosPerWeek: number; clipsPerWeek: number; minimumSpacingDays: number }
/** The Content Center's DEFAULT_IDEA_AUTOMATION_SETTINGS (the fields nextIdeaDates and HQ use). */
export const DEFAULT_SETTINGS: Record<Channel, ChannelIdeaSettings> = {
  'Alex Woung': { videosPerWeek: 2, clipsPerWeek: 3, minimumSpacingDays: 2 },
  'Alex Woung Raw': { videosPerWeek: 5, clipsPerWeek: 3, minimumSpacingDays: 1 },
};
/**
 * Content Center settings read: per channel, Number(cell) when finite, else the default. In the
 * interface an empty number cell is null, and Number(null) = 0, so an empty cell counts as 0 there;
 * the API leaves empty cells out, so a missing field is read as null here to match. Pure.
 */
export function settingsOf(rows: AirtableRecord[]): Record<Channel, ChannelIdeaSettings> {
  const next: Record<Channel, ChannelIdeaSettings> = { 'Alex Woung': { ...DEFAULT_SETTINGS['Alex Woung'] }, 'Alex Woung Raw': { ...DEFAULT_SETTINGS['Alex Woung Raw'] } };
  for (const r of rows) {
    const ch = s(r.fields[SF.channel]);
    if (!isChannel(ch)) continue;
    const num = (id: string, fb: number) => { const x = Number(r.fields[id] ?? null); return Number.isFinite(x) ? x : fb; };
    next[ch] = { videosPerWeek: num(SF.videosPerWeek, next[ch].videosPerWeek), clipsPerWeek: num(SF.clipsPerWeek, next[ch].clipsPerWeek), minimumSpacingDays: num(SF.minimumSpacingDays, next[ch].minimumSpacingDays) };
  }
  return next;
}
/** Videos per week per channel, as sienna.ideas reads it (Enabled rows; default main 2, Raw 5). Pure. */
export function targetsOf(rows: AirtableRecord[]): Record<Channel, number> {
  const out: Record<Channel, number> = { 'Alex Woung': 2, 'Alex Woung Raw': 5 };
  for (const r of rows) { const ch = s(r.fields[SF.channel]); const n = Number(r.fields[SF.videosPerWeek]); if (isChannel(ch) && r.fields[SF.enabled] === true && Number.isFinite(n) && n > 0) out[ch] = n; }
  return out;
}

/**
 * The Content Center's nextIdeaDates, unchanged: the recording and publish dates "Approve & schedule"
 * writes. Main: one publication each Tuesday/Thursday, recorded the Sunday one week before its
 * publication week (or today when that is past). Raw: the Friday of the current Monday–Sunday week,
 * publish 2 days after the first free day that keeps the spacing and the weekly limit. Pure.
 */
export function nextIdeaDates(occupied: Array<{ recording: string; publish: string }>, settings: ChannelIdeaSettings, now = new Date(), channel: Channel = 'Alex Woung Raw'): { recording: string; publish: string } {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now);
  const part = (name: string) => parts.find((p) => p.type === name)!.value;
  const today = new Date(`${part('year')}-${part('month')}-${part('day')}T12:00:00Z`);
  const day = 86400000;
  if (channel === 'Alex Woung') {
    const booked = new Set(occupied.map((item) => item.publish).filter(Boolean));
    for (let offset = 1; offset < 1825; offset++) {
      const publish = new Date(today.getTime() + offset * day);
      if (![2, 4].includes(publish.getUTCDay())) continue;
      const key = publish.toISOString().slice(0, 10);
      if (booked.has(key)) continue;
      const plannedRecording = publish.getTime() - (publish.getUTCDay() + 7) * day;
      const recording = new Date(Math.max(today.getTime(), plannedRecording));
      return { recording: recording.toISOString().slice(0, 10), publish: key };
    }
    throw new Error('No Tuesday or Thursday publishing slot is available.');
  }
  const first = new Date(today.getTime() + day);
  first.setUTCDate(first.getUTCDate() + ((7 - first.getUTCDay()) % 7));
  const spacing = Math.max(1, Math.round(settings.minimumSpacingDays || 1));
  const weekly = Math.max(1, Math.min(7, Math.round(settings.videosPerWeek || 1)));
  const parse = (value: string) => (/^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(value + 'T12:00:00Z').getTime() : NaN);
  const batchFriday = new Date(today);
  batchFriday.setUTCDate(batchFriday.getUTCDate() - ((batchFriday.getUTCDay() + 6) % 7) + 4);
  const recordingKey = batchFriday.toISOString().slice(0, 10);
  const publishing = occupied.map((x) => parse(x.publish)).filter(Number.isFinite);
  const available = (candidate: number, dates: number[]) => {
    if (dates.some((x) => Math.abs(x - candidate) < spacing * day)) return false;
    for (let offset = 0; offset < 7; offset++) {
      const start = candidate - offset * day;
      if (dates.filter((x) => x >= start && x < start + 7 * day).length >= weekly) return false;
    }
    return true;
  };
  for (let offset = 0; offset < 1825; offset++) {
    const record = first.getTime() + offset * day, publish = record + 2 * day;
    if (available(publish, publishing)) return { recording: recordingKey, publish: new Date(publish).toISOString().slice(0, 10) };
  }
  throw new Error('No schedule slot found. Review the channel cadence and existing dates.');
}

// ---------- one video (Content Channels row) ----------
export interface Video {
  id: string; title: string; channel: Channel | ''; status: string; stage: string; decision: string; score: number | null;
  recordingDate: string; publishDate: string; date: string; created: string; hasScript: boolean; recordThisWeek: boolean;
  ideaKey: string; community: string; sourceUrl: string; source: string;
  youtubeUrl: string; youtubePublishedAt: string; publishingStatus: string; rawFolderUrl: string; finalFolderUrl: string; finalAssetUrl: string; finalAssetId: string;
  thumbnailStatus: string; thumbnailUrl: string; clipIds: string[]; message: string; error: string; action: string; editingRoute: string;
  opusStatus: string; shortProjectId: string; shortSourceAssetId: string; shortJobState: string;
  distributionStatus: string; distributionCount: number; distributionChannels: number; youtubeTitle: string; hasYoutubeDescription: boolean;
}
export function videoOf(r: AirtableRecord, scripted: Set<string>): Video {
  const f = r.fields;
  const ch = s(f[CF.channel]);
  const score = Number(s(f[CF.ideaScore]));
  return {
    id: r.id, title: s(f[CF.title]) || 'Untitled', channel: isChannel(ch) ? ch : '', status: s(f[CF.status]), stage: s(f[CF.stage]), decision: s(f[CF.ideaDecision]),
    score: s(f[CF.ideaScore]) !== '' && Number.isFinite(score) ? score : null,
    recordingDate: dateKey(f[CF.recordingDate]), publishDate: dateKey(f[XF.publishDate]), date: dateKey(f[CF.date]), created: r.createdTime ?? '',
    hasScript: scripted.has(r.id), recordThisWeek: f[CF.recordThisWeek] === true,
    ideaKey: s(f[CF.ideaKey]), community: s(f[CF.ideaCommunity]), sourceUrl: s(f[CF.ideaUrl]), source: s(f[CF.source]),
    youtubeUrl: s(f[XF.youtubeUrl]), youtubePublishedAt: s(f[XF.youtubePublishedAt]), publishingStatus: s(f[XF.publishingStatus]),
    rawFolderUrl: s(f[XF.rawFolderUrl]), finalFolderUrl: s(f[XF.finalFolderUrl]), finalAssetUrl: s(f[XF.finalAssetUrl]), finalAssetId: s(f[XF.finalAssetId]),
    thumbnailStatus: s(f[XF.thumbnailStatus]), thumbnailUrl: s(f[XF.finalThumbnailUrl]), clipIds: ids(f[XF.clips]), message: s(f[XF.message]), error: s(f[XF.error]),
    action: s(f[XF.action]), editingRoute: s(f[XF.editingRoute]), opusStatus: s(f[XF.opusStatus]),
    shortProjectId: s(f[XF.shortProjectId]), shortSourceAssetId: s(f[XF.shortSourceAssetId]), shortJobState: s(f[XF.shortJobState]),
    distributionStatus: s(f[XF.distributionStatus]), distributionCount: ids(f[XF.distributionRecords]).length, distributionChannels: list(f[XF.distributionChannels]).length,
    youtubeTitle: s(f[CF.ytTitle]), hasYoutubeDescription: s(f[XF.youtubeDescription]) !== '',
  };
}
const needsApproval = (v: Video) => ideaNeedsApproval({ decision: v.decision, stage: v.stage, hasScript: v.hasScript, youtubeUrl: v.youtubeUrl });
/** Waiting for Alex's idea decision: the two decisions the Content Center sets on new ideas. */
export const awaitingDecision = (v: Video) => /^(Needs Review|Auto Scheduled)$/i.test(v.decision);
/** Proof of posting: a YouTube URL with Publishing Status Published or a YouTube Published At time. */
export const postedWithProof = (v: Video) => !!v.youtubeUrl && (v.publishingStatus === 'Published' || !!v.youtubePublishedAt);
const PRE_RECORD = new Set(['', 'Idea Approved', 'Script', 'Script Ready', 'Scheduled to Record']);
const RECORDED_ON = new Set(['Recorded', 'Editing', 'Ready for Thumbnail', 'Ready for Clips', 'Ready to Publish', 'Published']);

// ---------- clips ----------
export interface Clip { id: string; name: string; status: string; parentId: string; score: number | null; notes: string; hook: string; caption: string; watchUrl: string; opusId: string }
export function clipOf(r: AirtableRecord): Clip {
  const f = r.fields;
  const score = Number(s(f[KL.score]));
  const media = s(f[KL.media]);
  return {
    id: r.id, name: s(f[KL.name]) || 'Untitled clip', status: s(f[KL.status]), parentId: ids(f[KL.parent])[0] ?? '', score: s(f[KL.score]) !== '' && Number.isFinite(score) ? score : null,
    notes: s(f[KL.notes]), hook: s(f[KL.hook]).slice(0, 400), caption: s(f[KL.caption]).slice(0, 400), watchUrl: /^https:\/\//.test(media) ? media : '', opusId: s(f[KL.opusId]),
  };
}
/** Sienna's editor passed it (agents/sienna-editor.md: Editorial Review Notes "Sienna QA: passed …"). */
export const siennaPassed = (c: Clip) => /^Sienna QA:\s*passed/i.test(c.notes);
export const siennaChecked = (c: Clip) => /^Sienna QA:/i.test(c.notes);

// ---------- pipeline: 8 stages ----------
export const STAGES = ['idea', 'approved', 'script', 'recorded', 'editing', 'review', 'final', 'posted'] as const;
export type StageKey = (typeof STAGES)[number];
export const STAGE_LABEL: Record<StageKey, string> = { idea: 'Idea', approved: 'Approved', script: 'Script ready', recorded: 'Recorded', editing: 'Editing', review: 'Final review', final: 'Final approved', posted: 'Posted' };

/**
 * Where a video is, from the Content Center's fields (Idea Decision, Production Stage, Status,
 * Script, Thumbnail Status, Publishing Status, YouTube URL) and its clips' Clip Status. Pure.
 * null = not in the pipeline (rejected / duplicate / archived, or an old row with no decision).
 */
export function stageOf(v: Video, clips: Clip[]): StageKey | null {
  if (ideaIsArchived(v.decision)) return null;
  if (needsApproval(v)) return awaitingDecision(v) ? 'idea' : null;
  if (v.stage === 'Published' || v.status === 'Posted' || postedWithProof(v)) return 'posted';
  const mine = clips.filter((c) => c.parentId === v.id);
  if (mine.some((c) => c.status === 'Needs Review') || v.thumbnailStatus === 'Needs Review') return 'review';
  if (v.stage === 'Ready to Publish' || v.status === 'Scheduled' || (mine.length > 0 && mine.some((c) => ['Approved', 'Scheduled', 'Published'].includes(c.status)))) return 'final';
  if (['Editing', 'Ready for Thumbnail', 'Ready for Clips'].includes(v.stage) || v.status === 'Ongoing Edit' || !!v.finalAssetUrl) return 'editing';
  if (v.stage === 'Recorded') return 'recorded';
  if (v.hasScript) return 'script';
  return 'approved';
}

// ---------- the Content Center's "next step", and which automation runs it ----------
export type How = 'hq' | 'engine' | 'field' | 'button' | 'manual';
export interface NextStep { title: string; who: AgentName | 'Alex'; how: How; automation: string; detail: string }
const FIELD = (action: string, wf: string) => ({ how: 'field' as How, automation: `Content Automation Action "${action}" → Airtable automation "Content OS Action Script" → n8n [Content OS] ${wf}` });
const BUTTON = (button: string, wf: string) => ({ how: 'button' as How, automation: `Content Center button "${button}" → n8n [Content OS] ${wf}` });
/**
 * The Content Center's nextStep (source.tsx), the same order, with who does it and how it runs. The
 * script step is the engine's sienna.prep (the n8n "Generate Teleprompter Script" button is the
 * manual copy of it). The final "distribution complete" check needs the Content Distribution rows,
 * which HQ does not read: a posted video (proof of posting) counts as done. Pure.
 */
export function nextStep(v: Video, clips: Clip[]): NextStep | null {
  if (postedWithProof(v) && (v.distributionStatus === 'Published' || /complete/i.test(v.distributionStatus))) return null;
  if (needsApproval(v)) return { title: 'Review this idea', who: 'Alex', how: 'hq', automation: 'HQ Approve / Reject (writes Idea Decision); after Approve the engine\'s sienna.prep writes the script within 30 minutes', detail: '' };
  // HQ's two additions to the Content Center order: a row marked Scheduled needs its proof of posting
  // first, and a video already recorded never goes back to "write the script" (old rows have none).
  if (v.status === 'Scheduled' && !postedWithProof(v)) return { title: 'Add proof of posting', who: 'Sienna', how: 'manual', automation: 'Content Center: save the YouTube URL (or set the real status); Status "Scheduled" alone is not proof', detail: '' };
  const pastRecording = RECORDED_ON.has(v.stage) || !!v.finalAssetUrl || !!v.youtubeUrl;
  if (!v.hasScript && !pastRecording) return { title: 'Write the recording script', who: 'Sienna', how: 'engine', automation: 'Engine sienna.prep (every 30 min; the Content Center\'s "Generate script" button runs n8n [Content OS] Generate Teleprompter Script, the same job)', detail: '' };
  const frameMessage = v.message;
  const recordingSynced = /recorded footage found|recording found|raw video found/i.test(frameMessage);
  const longFormSubmitted = /long-form edit project (?:created|submitted)|long-form edit (?:submitted|processing)/i.test(frameMessage);
  const shortSubmitted = Boolean(v.shortProjectId || v.shortJobState || v.shortSourceAssetId);
  const sourceMatches = Boolean(v.finalAssetId && v.shortSourceAssetId && v.finalAssetId === v.shortSourceAssetId);
  const shortBlocked = shortSubmitted && (!sourceMatches || !v.shortProjectId || /submitting|error|failed|uncertain/i.test(v.shortJobState));
  const thumbnailApproved = /approved|complete/i.test(v.thumbnailStatus);
  const clipCount = clips.filter((c) => c.parentId === v.id).length || v.clipIds.length;
  const distribution = v.distributionStatus.toLowerCase();
  if (!v.rawFolderUrl) return { title: 'Create the recording folder', who: 'Sienna', ...FIELD('Sync Frame.io', 'Frame.io Sync'), detail: 'Sets up the Frame.io folders for this video.' };
  if (!v.finalAssetUrl && !v.editingRoute) return { title: 'Choose how it is edited', who: 'Alex', how: 'manual', automation: 'Content Center: Editing Route (OpusClip or DaVinci Resolve)', detail: '' };
  if (!v.finalAssetUrl && /manual editor|davinci resolve/i.test(v.editingRoute)) return { title: 'Edit in DaVinci Resolve', who: 'Alex', how: 'manual', automation: 'By hand: upload the finished video to the Final folder', detail: '' };
  if (!v.finalAssetUrl && v.editingRoute === 'OpusClip' && !recordingSynced) return { title: 'Sync the uploaded recording', who: 'Sienna', ...FIELD('Sync Frame.io', 'Frame.io Sync'), detail: 'Finds the uploaded recording in Frame.io.' };
  if (!v.finalAssetUrl && v.editingRoute === 'OpusClip' && !longFormSubmitted) return { title: 'Start the full-video edit', who: 'Sienna', ...FIELD('Submit to OpusClip', 'OpusClip Submit and Refresh'), detail: '' };
  if (!v.finalAssetUrl && v.editingRoute === 'OpusClip') return { title: 'Finish the full-video edit', who: 'Sienna', how: 'manual', automation: 'Sienna\'s editor (scheduled task, agents/sienna-editor.md): edit in OpusClip, export, upload to the Final folder, then Sync Frame.io', detail: '' };
  if (!v.thumbnailUrl) return { title: 'Make the thumbnail', who: 'Sienna', ...BUTTON('Generate thumbnail', 'Generate Thumbnail'), detail: '' };
  if (!thumbnailApproved) return { title: 'Approve the thumbnail', who: 'Alex', how: 'manual', automation: 'Content Center: Approve thumbnail (Thumbnail Status → Approved), or Revise → n8n [Content OS] Revise Thumbnail', detail: '' };
  if (!v.youtubeTitle || !v.hasYoutubeDescription) return { title: 'Prepare the YouTube title and description', who: 'Sienna', ...BUTTON('Prepare YouTube details', 'Prepare YouTube Details'), detail: '' };
  if (!v.youtubeUrl) return { title: 'Upload the video to YouTube', who: 'Alex', how: 'manual', automation: 'By hand in YouTube Studio, then save the YouTube URL in the Content Center (Sienna never posts)', detail: '' };
  if (!v.finalAssetId) return { title: 'Sync the final video', who: 'Sienna', ...FIELD('Sync Frame.io', 'Frame.io Sync'), detail: '' };
  if (shortBlocked) return { title: 'Check the short-clips job', who: 'Riley', how: 'manual', automation: 'The short-clips job needs a check or belongs to another final video; do not submit another', detail: v.shortJobState };
  if (!shortSubmitted) return { title: 'Make the short clips', who: 'Sienna', ...FIELD('Submit to OpusClip', 'OpusClip Submit and Refresh'), detail: '' };
  if (clipCount === 0) return { title: 'Clips are being made', who: 'Sienna', ...FIELD('Refresh Opus Clips', 'OpusClip Submit and Refresh'), detail: '' };
  if (clipCount > 0 && !['drafts ready', 'scheduled', 'published'].includes(distribution) && !distribution.includes('complete') && v.distributionCount === 0) {
    if (v.distributionChannels === 0) return { title: 'Choose where the clips go', who: 'Alex', how: 'manual', automation: 'Content Center: clips wanted + distribution channels', detail: '' };
    return { title: 'Make the posts', who: 'Sienna', ...FIELD('Generate Distribution Pack', 'Generate Distribution Pack'), detail: '' };
  }
  return { title: 'Review the posts', who: 'Alex', how: 'manual', automation: 'Content Center → Posts (approval and scheduling stay there; HQ never runs [Content OS] Schedule Approved Social Posts)', detail: '' };
}

// ---------- Sienna's prep notes (sienna.prep writes them into Notes) ----------
export interface Prep { titles: string[]; hooks: string[]; thumbnail: string; gamma: string; gammaUrl: string; youtube: string; checks: string[] }
/** Splits the Notes sienna.prep writes ("**Title options**", "**Hook options**", "**Thumbnail:**", "**Gamma outline**", …). Pure. */
export function parsePrep(notes: string, extra = ''): Prep {
  const sections: Record<string, string> = {};
  let key = '';
  for (const raw of String(notes ?? '').replace(/\r\n/g, '\n').split('\n')) {
    const h = /^\s*\*\*([^*]+?):?\*\*:?\s*(.*)$/.exec(raw);
    if (h) { key = h[1].trim().toLowerCase(); sections[key] = h[2] ? `${h[2]}\n` : ''; continue; }
    if (key) sections[key] += `${raw}\n`;
  }
  const bullets = (t = '') => t.split('\n').map((x) => x.replace(/^\s*(?:[-*•]|\d+[.)])\s+/, '').trim()).filter(Boolean);
  const get = (...names: string[]) => (names.map((n) => sections[n]).find((x) => x !== undefined) ?? '').trim();
  const gammaUrl = /(https:\/\/(?:www\.)?gamma\.app\/[^\s)\]]+)/i.exec(`${notes}\n${extra}`)?.[1] ?? '';
  return {
    titles: bullets(get('title options')), hooks: bullets(get('hook options')), thumbnail: get('thumbnail', 'thumbnail idea'),
    gamma: get('gamma outline'), gammaUrl, youtube: get('youtube description'), checks: bullets(get('check before recording')).filter((x) => !/^nothing flagged$/i.test(x)),
  };
}
/** The idea's angle and hook (sienna.ideas writes "**Angle:** … **Hook:** … **Pillar:** …" in Description). Pure. */
export function ideaParts(description: string): { angle: string; hook: string; pillar: string } {
  const g = (k: string) => new RegExp(`\\*\\*${k}:\\*\\*\\s*([\\s\\S]*?)(?=\\n\\s*\\*\\*[A-Za-z ]+:\\*\\*|$)`, 'i').exec(description ?? '')?.[1]?.trim() ?? '';
  return { angle: g('Angle'), hook: g('Hook'), pillar: g('Pillar') };
}

// ---------- weeks (New York) ----------
/** The Friday HQ prepares for: today when it is Friday, else the coming Friday (YYYY-MM-DD, ET). */
export function contentFriday(now: number): string { const t = etYmd(now); return addDays(t, (5 - dow(t) + 7) % 7); }
/** Monday–Sunday (ET) containing the day, like the Content Center's currentRecordingWeek. */
export function weekOf(ymd: string): { start: string; end: string } { const start = addDays(ymd, -((dow(ymd) + 6) % 7)); return { start, end: addDays(start, 6) }; }
const inRange = (d: string, a: string, b: string) => !!d && d >= a && d <= b;

// ---------- source ----------
export interface ContentSource {
  videos: Video[]; clips: Clip[]; settingsRows: AirtableRecord[]; heavy: Map<string, AirtableRecord>;
  stuck: { id: string; title: string; channel: string }[]; lastPrep: { status: string; at: string; error: string } | null; readAt: string;
}

const idFormula = (xs: string[]) => `OR(${xs.map((x) => `RECORD_ID()='${x}'`).join(',')})`;
/** One batched read: rows (light fields), the rows that have a script, clips, settings, stuck approvals, then the long text of the rows HQ shows. */
export async function readContentSource(at: Pick<HqAirtable, 'list'>, db: Db | null, now = Date.now()): Promise<ContentSource> {
  const [rows, scriptRows, clipRows, settingsRows, stuckRows, prep] = await Promise.all([
    at.list(CONTENT, 'TRUE()', LIGHT, 5000),
    at.list(CONTENT, `{Script}!=''`, [CF.title], 5000),
    at.list(CLIPS, 'TRUE()', Object.values(KL), 5000),
    at.list(SETTINGS, 'TRUE()', Object.values(SF), 20),
    // Approved, inside sienna.prep's window, still no script, and approved more than a day ago (prep runs every 30 minutes).
    at.list(CONTENT, `AND(${prepFormula()},{Idea Decision}='Approved',IS_BEFORE(LAST_MODIFIED_TIME({Idea Decision}),DATEADD(NOW(),-1,'days')))`, [CF.title, CF.channel, CF.ideaDecision, CF.script], 100),
    db ? db.query(`SELECT status, updated_at, error FROM jobs WHERE kind='sienna.prep' ORDER BY id DESC LIMIT 1`).then((r) => r.rows[0] ?? null).catch(() => null) : Promise.resolve(null),
  ]);
  const scripted = new Set(scriptRows.map((r) => r.id));
  const videos = rows.map((r) => videoOf(r, scripted));
  const clips = clipRows.map(clipOf);
  // Long text only for what HQ shows: the ideas waiting (newest 40 per channel) and the Friday ideas.
  const fri = fridayCandidates(videos, now).map((v) => v.id);
  const waiting = CHANNELS.flatMap((ch) => videos.filter((v) => v.channel === ch && awaitingDecision(v)).sort(byNewest).slice(0, 40).map((v) => v.id));
  const want = [...new Set([...fri, ...waiting])];
  const heavy = new Map<string, AirtableRecord>();
  for (let i = 0; i < want.length; i += 50) {
    for (const r of await at.list(CONTENT, idFormula(want.slice(i, i + 50)), HEAVY, 50)) heavy.set(r.id, r);
  }
  return {
    videos, clips, settingsRows, heavy,
    stuck: stuckRows.filter((r) => s(r.fields[CF.ideaDecision]) === 'Approved' && !s(r.fields[CF.script])).map((r) => ({ id: r.id, title: s(r.fields[CF.title]) || 'Untitled', channel: s(r.fields[CF.channel]) })),
    lastPrep: prep ? { status: String(prep.status), at: new Date(prep.updated_at).toISOString(), error: String(prep.error ?? '').slice(0, 200) } : null,
    readAt: new Date(now).toISOString(),
  };
}
const byNewest = (a: Video, b: Video) => (b.created || b.date).localeCompare(a.created || a.date) || (b.score ?? 0) - (a.score ?? 0);

let cache: { at: number; data: Promise<ContentSource> } | null = null;
export function _resetContentCache() { cache = null; }
/** The cached source (60 s). refresh=true re-reads if the copy is older than 10 seconds. */
export function cachedContent(at: Pick<HqAirtable, 'list'>, db: Db | null, refresh = false, now = Date.now()): Promise<ContentSource> {
  if (cache && now - cache.at < (refresh ? 10_000 : CONTENT_CACHE_MS)) return cache.data;
  const data = readContentSource(at, db, now);
  cache = { at: now, data };
  data.catch(() => { if (cache?.data === data) cache = null; });
  return data;
}

// ---------- views (pure) ----------
/** Approved, not recorded yet, recording from 13 days before the Friday to the Sunday after it (or the old "Record This Week" tick). */
export function fridayCandidates(videos: Video[], now: number): Video[] {
  const fri = contentFriday(now);
  const { end } = weekOf(fri);
  return videos.filter((v) => v.channel && !ideaIsArchived(v.decision) && !needsApproval(v) && PRE_RECORD.has(v.stage) && !v.finalAssetUrl && !v.youtubeUrl
    && (inRange(v.recordingDate, addDays(fri, -13), end) || (v.recordThisWeek && !v.recordingDate)));
}
export const recordingOrder = (a: Video, b: Video) => (a.recordingDate || '9999').localeCompare(b.recordingDate || '9999') || (a.publishDate || '9999').localeCompare(b.publishDate || '9999') || (b.score ?? 0) - (a.score ?? 0) || a.title.localeCompare(b.title);

export interface Note { problem: string; data: string; fix: string; why: string; owner: AgentName | 'Alex' }

export function buildContent(src: ContentSource, baseId: string, now = Date.now()) {
  const targets = targetsOf(src.settingsRows);
  const rec = (id: string) => airtableUrl(baseId, CONTENT, id);
  const heavyOf = (id: string) => src.heavy.get(id)?.fields ?? {};
  const byId = new Map(src.videos.map((v) => [v.id, v]));
  const today = etYmd(now);
  const fri = contentFriday(now);
  const week = weekOf(today);
  const fweek = weekOf(fri);

  // Needs you: ideas waiting for a decision, per channel, newest first (best score first inside a day).
  const ideas = CHANNELS.map((ch) => {
    const all = src.videos.filter((v) => v.channel === ch && awaitingDecision(v)).sort(byNewest);
    return {
      channel: ch, key: CHANNEL_KEY[ch], label: CHANNEL_LABEL[ch], count: all.length,
      items: all.map((v) => {
        const h = heavyOf(v.id);
        const parts = ideaParts(s(h[CF.description]));
        return {
          id: v.id, title: v.title, score: v.score, decision: v.decision, proposed: v.created || v.date, recordFor: v.date,
          by: v.ideaKey.startsWith('sienna:') ? 'Sienna' : /^r\/|reddit/i.test(v.community) ? 'Reddit intake (n8n)' : v.community || v.source || 'UNKNOWN',
          source: v.community.replace(/^Sienna:\s*/, ''), sourceUrl: /^https?:\/\//.test(v.sourceUrl) ? v.sourceUrl : '',
          angle: parts.angle, hook: parts.hook, why: s(h[CF.ideaReason]).split(/\n\s*\n|\nEvidence:/)[0].trim().slice(0, 400), airtable: rec(v.id),
        };
      }),
    };
  });
  // Needs you: final clips Sienna's editor passed (Needs Review + "Sienna QA: passed"), per parent video.
  const passed = src.clips.filter((c) => c.status === 'Needs Review' && siennaPassed(c));
  const parents = [...new Set(passed.map((c) => c.parentId))];
  const finals = parents.map((pid) => {
    const v = byId.get(pid);
    return {
      parentId: pid, title: v?.title ?? 'Video not found', channel: v?.channel ?? '', airtable: pid ? rec(pid) : '',
      clips: passed.filter((c) => c.parentId === pid).sort((a, b) => (b.score ?? 0) - (a.score ?? 0)).map((c) => ({
        id: c.id, name: c.name, score: c.score, qa: c.notes.split('\n')[0].slice(0, 200), hook: c.hook, caption: c.caption, watchUrl: c.watchUrl, airtable: airtableUrl(baseId, CLIPS, c.id),
      })),
    };
  });

  // Pipeline: recent rows (any date in the last 60 days or ahead), and everything still open.
  const since = addDays(today, -60);
  const recent = (v: Video) => [v.recordingDate, v.publishDate, v.date, v.created ? etYmd(Date.parse(v.created)) : ''].some((d) => d && d >= since);
  const pipeRows: { id: string; title: string; channel: string; key: string; stage: StageKey; recordingDate: string; publishDate: string; status: string; productionStage: string; next: NextStep | null; flags: string[]; airtable: string }[] = [];
  let leftOut = 0;
  for (const v of src.videos) {
    const st = v.channel ? stageOf(v, src.clips) : null;
    if (!st || !recent(v)) { if (v.channel && !ideaIsArchived(v.decision)) leftOut++; continue; }
    const flags: string[] = [];
    if (v.stage === 'Blocked') flags.push('Blocked');
    if (v.error) flags.push('Automation error');
    if (v.status === 'Scheduled' && !postedWithProof(v)) flags.push('Scheduled, no proof');
    pipeRows.push({
      id: v.id, title: v.title, channel: v.channel, key: CHANNEL_KEY[v.channel as Channel], stage: st, recordingDate: v.recordingDate, publishDate: v.publishDate,
      status: v.status, productionStage: v.stage, next: st === 'posted' ? null : nextStep(v, src.clips), flags, airtable: rec(v.id),
    });
  }
  pipeRows.sort((a, b) => STAGES.indexOf(a.stage) - STAGES.indexOf(b.stage) || (a.recordingDate || '9999').localeCompare(b.recordingDate || '9999') || a.title.localeCompare(b.title));
  // Needs you: the other Content Center steps waiting on Alex (link only).
  const alexSteps = pipeRows.filter((r) => r.next && r.next.who === 'Alex' && r.next.how !== 'hq')
    .map((r) => ({ id: r.id, title: r.title, channel: r.channel, step: r.next!.title, how: r.next!.automation, airtable: r.airtable }));

  // Friday.
  const candidates = fridayCandidates(src.videos, now);
  const friday = CHANNELS.map((ch) => {
    const items = candidates.filter((v) => v.channel === ch).sort(recordingOrder).map((v) => {
      const h = heavyOf(v.id);
      const prep = parsePrep(s(h[CF.notes]), s(h[CF.description]));
      const parts = ideaParts(s(h[CF.description]));
      return {
        id: v.id, title: v.title, recordingDate: v.recordingDate, publishDate: v.publishDate, late: !!v.recordingDate && v.recordingDate < fweek.start,
        scriptReady: v.hasScript, script: s(h[CF.script]), angle: parts.angle, ideaHook: parts.hook, ...prep, airtable: rec(v.id),
      };
    });
    return { channel: ch, key: CHANNEL_KEY[ch], label: CHANNEL_LABEL[ch], target: targets[ch], approved: items.length, ready: items.filter((x) => x.scriptReady).length, items };
  });

  // Week stats (Monday–Sunday, New York).
  const weekStats = CHANNELS.map((ch) => {
    const mine = src.videos.filter((v) => v.channel === ch);
    const generated = (v: Video) => v.ideaKey.startsWith('sienna:') || v.source === 'Generated Idea' || !!v.community;
    const proposedRows = mine.filter((v) => generated(v) && v.created && inRange(etYmd(Date.parse(v.created)), week.start, week.end));
    const approved = mine.filter((v) => !ideaIsArchived(v.decision) && !needsApproval(v) && inRange(v.recordingDate, week.start, week.end));
    return {
      channel: ch, key: CHANNEL_KEY[ch], label: CHANNEL_LABEL[ch], target: targets[ch], ideaTarget: ideaQuota(targets[ch]),
      proposed: proposedRows.length, bySienna: proposedRows.filter((v) => v.ideaKey.startsWith('sienna:')).length,
      approved: approved.length,
      recorded: approved.filter((v) => RECORDED_ON.has(v.stage) || !!v.finalAssetUrl || !!v.youtubeUrl).length,
      posted: mine.filter((v) => (v.youtubePublishedAt && inRange(etYmd(Date.parse(v.youtubePublishedAt)), week.start, week.end)) || (v.publishingStatus === 'Published' && !v.youtubePublishedAt && inRange(v.publishDate, week.start, week.end))).length,
    };
  });

  const notes = contentNotes(src, { fri, fweek, today, pipeline: pipeRows });
  const ideaCount = ideas.reduce((a, c) => a + c.count, 0);
  const finalCount = finals.reduce((a, f) => a + f.clips.length, 0);
  return {
    readAt: src.readAt, friday: { date: fri, week: fweek, channels: friday }, week: { ...week, channels: weekStats },
    needs: { ideas, finals, alexSteps, waitingForSienna: src.clips.filter((c) => c.status === 'Needs Review' && !siennaChecked(c)).length },
    pipeline: { stages: STAGES.map((k) => ({ key: k, label: STAGE_LABEL[k] })), rows: pipeRows, leftOut },
    counts: { ideas: ideaCount, finals: finalCount, steps: alexSteps.length, total: ideaCount + finalCount + alexSteps.length },
    notes, links: { contentCenter: `https://airtable.com/${baseId}/${CONTENT_CENTER_PAGE}` },
  };
}

/** Problem → Data → Fix → Why, for real data problems (most important first). Pure. */
export function contentNotes(src: ContentSource, c: { fri: string; fweek: { start: string; end: string }; today: string; pipeline: { recordingDate: string; channel: string; stage: StageKey }[] }): Note[] {
  const out: Note[] = [];
  const eg = (xs: { title: string }[]) => (xs.length ? ` (e.g. ${xs.slice(0, 2).map((x) => `"${x.title.slice(0, 60)}"`).join(', ')})` : '');
  const scheduled = src.videos.filter((v) => v.status === 'Scheduled' && !postedWithProof(v));
  if (scheduled.length) out.push({ problem: 'Marked "Scheduled" with no proof of posting', data: `${scheduled.length} row${scheduled.length === 1 ? '' : 's'} have Status Scheduled but no YouTube URL with Publishing Status Published or a published time${eg(scheduled)}`, fix: 'add the YouTube URL (or set the real status) on each, in the Content Center.', why: 'Without the URL nobody can tell a posted video from a forgotten one; HQ counts a video as posted only with proof.', owner: 'Sienna' });
  if (src.stuck.length) {
    const failed = src.lastPrep?.status === 'failed';
    out.push({ problem: 'Approved idea with no script after 1 day', data: `${src.stuck.length} approved in the last 14 days and still no script${eg(src.stuck)}. Last sienna.prep run: ${src.lastPrep ? `${src.lastPrep.status} ${src.lastPrep.at.slice(0, 16).replace('T', ' ')} UTC${src.lastPrep.error ? ` (${src.lastPrep.error})` : ''}` : 'none found'}`, fix: failed ? 'fix the sienna.prep job; it then writes the scripts on its next run.' : 'check sienna.prep (runs every 30 min). By hand: Content Center → Generate script.', why: 'Alex records on Friday; an idea without a script can\'t be recorded.', owner: failed ? 'Riley' : 'Sienna' });
  }
  const unchecked = src.clips.filter((x) => x.status === 'Needs Review' && !siennaChecked(x));
  if (unchecked.length) out.push({ problem: 'Clips waiting for Sienna\'s check', data: `${unchecked.length} clip${unchecked.length === 1 ? '' : 's'} in Needs Review have no "Sienna QA" note`, fix: 'her editor (scheduled task) checks them with the 17-point list; only the ones she passes come to you.', why: 'Alex approves only final videos (content-system.md).', owner: 'Sienna' });
  const mainNotFriday = c.pipeline.filter((r) => r.channel === 'Alex Woung' && ['approved', 'script'].includes(r.stage) && inRange(r.recordingDate, c.fweek.start, c.fweek.end) && dow(r.recordingDate) !== 5);
  if (mainNotFriday.length) out.push({ problem: 'Main-channel recording dates are not on Friday', data: `${mainNotFriday.length} approved main idea${mainNotFriday.length === 1 ? '' : 's'} this week record on ${[...new Set(mainNotFriday.map((r) => new Date(`${r.recordingDate}T12:00:00Z`).toLocaleDateString('en-US', { weekday: 'long', timeZone: 'UTC' })))].join(', ')}: the Content Center's approve sets "the Sunday before the publish week"`, fix: 'once Alex confirms Friday, change the Content Center rule (nextIdeaDates); HQ follows it.', why: 'Alex records every Friday morning; HQ writes the same dates as the Content Center so both agree.', owner: 'Riley' });
  const old = src.videos.filter((v) => awaitingDecision(v) && v.created && Date.parse(v.created) < Date.parse(`${c.today}T12:00:00Z`) - 14 * DAY);
  if (old.length) out.push({ problem: 'Old ideas still waiting', data: `${old.length} idea${old.length === 1 ? '' : 's'} have waited 14+ days for a decision`, fix: 'reject the ones you won\'t record (one tap each in Needs you).', why: 'A short list is faster to decide on Friday.', owner: 'Alex' });
  return out;
}

/** Clean-up for Riley: where n8n and the engine do the same job (shown once in HQ). */
export const OVERLAPS = [
  'Scripts: three writers. The engine\'s sienna.prep (automatic after an approval) and two copies of n8n "[Content OS] Generate Teleprompter Script" (the Content Center\'s Generate script button). All write Script + Production Stage "Script". HQ shows one step: Sienna writes the script.',
  'Ideas: two sources. The engine\'s sienna.ideas (Friday 7 AM) and the five n8n "[Content OS] Reddit … Weekly Intake" flows (Saturday 9 AM) both add rows with Idea Decision "Needs Review". HQ shows them in one list and says who proposed each.',
  'Final video edit: Sienna\'s editor (scheduled task) and the Content Center\'s Submit to OpusClip / Refresh Opus Clips buttons (n8n "OpusClip Submit and Refresh") both work in OpusClip on the same video.',
];

// ---------- the one write: the idea decision ----------
export type IdeaVerdict = 'approve' | 'reject';
const DECIDE_READ = [CF.title, CF.ideaDecision, CF.stage, CF.channel, CF.recordingDate, XF.publishDate, XF.youtubeUrl, CF.script];

/**
 * "Approve & schedule" / "Reject idea", exactly as the Content Center's decideIdea writes them:
 *   approve: Idea Decision "Approved", Production Stage "Idea Approved", Recording Date + Publish Date (nextIdeaDates);
 *   reject:  Idea Decision "Rejected", Recording Date and Publish Date cleared.
 * Fresh reads (not the cache): the record, its channel's other rows (the dates already taken) and the settings.
 * Refuses a Duplicate, an idea already decided, and an approval without a channel. Logged in hq_content_log.
 */
export async function decideIdea(at: Pick<HqAirtable, 'list' | 'get' | 'update'>, db: Db, id: string, verdict: IdeaVerdict, by: string, now = new Date()): Promise<{ status: number; error?: string; result?: { decision: string; recording: string; publish: string } }> {
  if (!/^rec[A-Za-z0-9]{14}$/.test(id)) return { status: 400, error: 'not a content record id' };
  const r = await at.get(CONTENT, id, DECIDE_READ);
  if (!r) return { status: 404, error: 'idea not found' };
  const f = r.fields;
  const decision = s(f[CF.ideaDecision]);
  const cur = { decision, stage: s(f[CF.stage]), hasScript: !!s(f[CF.script]), youtubeUrl: s(f[XF.youtubeUrl]) };
  if (decision === 'Duplicate') return { status: 409, error: 'This idea is a duplicate: open the primary idea named in its review reason.' };
  if (!ideaNeedsApproval(cur)) return { status: 409, error: `already ${decision || 'in production'}` };
  const values: Record<string, unknown> = { [CF.ideaDecision]: verdict === 'approve' ? 'Approved' : 'Rejected' };
  let dates = { recording: '', publish: '' };
  if (verdict === 'approve') {
    const channel = s(f[CF.channel]);
    if (!isChannel(channel)) return { status: 400, error: 'Choose a content channel in Airtable before approving.' };
    const [rows, scriptRows, settingsRows] = await Promise.all([
      at.list(CONTENT, `{Content Channel}='${q(channel)}'`, [CF.channel, CF.ideaDecision, CF.stage, XF.youtubeUrl, CF.recordingDate, XF.publishDate], 5000),
      at.list(CONTENT, `AND({Content Channel}='${q(channel)}',{Script}!='')`, [CF.channel], 5000),
      at.list(SETTINGS, 'TRUE()', Object.values(SF), 20),
    ]);
    const scripted = new Set(scriptRows.filter((x) => s(x.fields[CF.channel]) === channel).map((x) => x.id));
    const occupied = rows.filter((x) => x.id !== id && s(x.fields[CF.channel]) === channel)
      .filter((x) => { const d = s(x.fields[CF.ideaDecision]); return !ideaIsArchived(d) && !ideaNeedsApproval({ decision: d, stage: s(x.fields[CF.stage]), hasScript: scripted.has(x.id), youtubeUrl: s(x.fields[XF.youtubeUrl]) }); })
      .map((x) => ({ recording: dateKey(x.fields[CF.recordingDate]), publish: dateKey(x.fields[XF.publishDate]) }));
    dates = nextIdeaDates(occupied, settingsOf(settingsRows)[channel], now, channel);
    values[CF.stage] = 'Idea Approved';
  }
  values[CF.recordingDate] = dates.recording || null;
  values[XF.publishDate] = dates.publish || null;
  await at.update(CONTENT, id, values);
  const changes = [
    { field: 'Idea Decision', from: decision, to: values[CF.ideaDecision] },
    ...(verdict === 'approve' ? [{ field: 'Production Stage', from: cur.stage, to: 'Idea Approved' }] : []),
    { field: 'Recording Date', from: dateKey(f[CF.recordingDate]), to: dates.recording || null },
    { field: 'Publish Date', from: dateKey(f[XF.publishDate]), to: dates.publish || null },
  ];
  await db.query(`INSERT INTO hq_content_log (actor, action, record_id, title, changes) VALUES ($1,$2,$3,$4,$5)`, [by, verdict === 'approve' ? 'idea_approve' : 'idea_reject', id, s(f[CF.title]).slice(0, 200), JSON.stringify(changes)]);
  _resetContentCache();
  return { status: 200, result: { decision: String(values[CF.ideaDecision]), recording: dates.recording, publish: dates.publish } };
}

export async function contentLog(db: Db, limit = 15) {
  const r = await db.query(`SELECT actor, action, record_id, title, changes, created_at FROM hq_content_log ORDER BY id DESC LIMIT $1`, [limit]);
  return r.rows.map((x) => ({ by: x.actor, action: x.action, record: x.record_id, title: x.title, changes: x.changes, at: new Date(x.created_at).toISOString() }));
}

/** GET /content */
export async function contentView(at: Pick<HqAirtable, 'list'>, db: Db, baseId: string, opts: { refresh?: boolean } = {}) {
  const src = await cachedContent(at, db, opts.refresh);
  return { ...buildContent(src, baseId), overlaps: OVERLAPS, log: await contentLog(db) };
}
/** GET /content/summary (Today's card): counts and the Friday count vs target, from the same cache. */
export async function contentSummary(at: Pick<HqAirtable, 'list'>, db: Db, baseId: string) {
  const v = buildContent(await cachedContent(at, db), baseId);
  return { counts: v.counts, friday: { date: v.friday.date, channels: v.friday.channels.map((c) => ({ key: c.key, label: c.label, ready: c.ready, approved: c.approved, target: c.target })) } };
}

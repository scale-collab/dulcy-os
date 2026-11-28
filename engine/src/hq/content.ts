// HQ Content (Step 3, 2026-11-26): the Airtable Content Center (Content OS → Content Center, page
// pagacLOPVCIQb1RQt; code in airtable/custom-elements/content-center/source.tsx) as one simple area.
// Alex records every Friday morning (main channel 2 a week, Raw 5). Show what needs Alex first;
// everything else is one tap deeper. Owner only (Sienna is OWNER_ONLY; the route answers 403 to members).
//   - Needs you: ideas waiting for a decision (Approve / Reject), final clips Sienna's editor passed
//     (link only, see below), and the other Content Center steps that wait on Alex (link only).
//   - Friday: this week's approved ideas per channel in recording order, with the script, hooks,
//     titles, thumbnail idea and Gamma outline that sienna.prep wrote; count vs target.
//   - Content + Calendar (Batch 5, 2026-11-27): laid out like the Content Center itself. Each item has the
//     Content Center's 10-stage label (normalizedStage / displayedContentStage, ported), its order
//     (earliest date first), its "next step" and the same blocks (schedule, video, repurposing, latest
//     update, details). No Airtable links (RULES 2026-11-27); only the Content Center page link stays,
//     for the clip approval HQ cannot do. The older 8-stage key (stage) is kept for the Today card.
//   - Week: ideas proposed / approved / recorded / posted vs target, and Problem → Data → Fix notes.
// Writes: only the Content Center's idea decision ("Approve & schedule" / "Reject idea"), field for
// field (decideIdea in source.tsx): Idea Decision, Production Stage "Idea Approved", Recording Date and
// Publish Date from the same scheduling rule (nextIdeaDates, ported below). No n8n flow reads Idea
// Decision; the engine's sienna.prep (every 30 min) writes the script after an approval. Every write
// is logged in hq_content_log. Clip approval is NOT written from HQ: the Content Center's "Approve
// reviewed copy" writes Review Intent JSON and then calls an n8n webhook ([Content OS] Current Clip
// Review and Preview) that checks the intent's Airtable author (Review Intent Author, lastModifiedBy)
// against the owner; HQ can't do that (and never calls n8n), so those items link to the Content Center.
// Nothing here posts, schedules, deletes, or calls OpusClip, Gamma, Frame.io, Discord or n8n. The one
// outside read (round 4, 2026-11-28): a posted video with no saved posted date gets its date from its
// channel's public YouTube feed (a plain GET of at most 2 feeds, cached 1 hour), so it shows "Posted 11/26".
// Airtable reads: batched (6 list calls, no per-row calls), one cache for everyone, 60 seconds.
//   - Round 4 (2026-11-28): the "This week" tab is gone (data problems are one line on Needs you), channel
//     names are the real ones, and every item carries its real workflow (videoSteps): the one Next step
//     with its button, and each step with where it happens (HQ, Sienna, by hand, or "not automated yet").
//   - Round 5 (2026-11-28): every Content Center button is an HQ button (contentActions.ts does each one
//     the Content Center's way), and Distribution (per platform: review, approve, record where / when /
//     stats) lives on the video's page. Only the final-clip approval still opens the Content Center.
//   - 2026-11-28: the final-clip approval moved into HQ too (contentReview.ts: the same Review Intent and
//     webhook; the n8n owner check is met when the engine's token writes as Alex, else by the signed-intent
//     n8n change waiting for Alex's OK), plus the Gamma link box and the resource document.
import type { Db } from '../db/pool.js';
import type { AirtableRecord } from '../providers/airtable.js';
import type { HqAirtable } from './decisions.js';
import { CF, CONTENT, SETTINGS, ideaQuota, prepFormula } from '../agents/sienna.js';
import type { AgentName } from './agents.js';
import type { RunKey } from './contentActions.js';

export const CLIPS = 'tblg1Tj9atyxN0piT';
export const CONTENT_CENTER_PAGE = 'pagacLOPVCIQb1RQt';
export const CONTENT_CACHE_MS = 60_000;
export const CHANNELS = ['Alex Woung', 'Alex Woung Raw'] as const;
export type Channel = (typeof CHANNELS)[number];
export const CHANNEL_KEY: Record<Channel, string> = { 'Alex Woung': 'main', 'Alex Woung Raw': 'raw' };
/** Round 4 (Alex, 2026-11-28): the real channel names everywhere, never "Main channel" / "Raw". */
export const CHANNEL_LABEL: Record<Channel, string> = { 'Alex Woung': 'Alex Woung', 'Alex Woung Raw': 'Alex Woung Raw' };

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

// CF.ytTitle is light too (Batch 5): nextStep's "Prepare the YouTube title" check reads it.
const LIGHT = [CF.title, CF.status, CF.stage, CF.channel, CF.recordingDate, XF.publishDate, CF.ideaDecision, CF.ideaScore, CF.ideaKey, CF.ideaCommunity, CF.ideaUrl, CF.source,
  CF.date, CF.recordThisWeek, CF.style, CF.ytTitle, ...Object.values(XF)];
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
/**
 * Parity (2026-11-28): the Content Center's full settings panel ("Content scheduling settings", the gear):
 * every field it reads and writes on Content Automation Settings, with its DEFAULT_IDEA_AUTOMATION_SETTINGS.
 */
export const SF_CC = {
  ...SF, autoScheduleThreshold: 'fldDIUjHLoKL6WXg2', reviewThreshold: 'fldqKEJL8Ya5sdja1', minimumClipScore: 'fld288MIFRl52mjpc',
} as const;
export interface CcChannelSettings { videosPerWeek: number; clipsPerWeek: number; autoScheduleThreshold: number; reviewThreshold: number; minimumSpacingDays: number; minimumClipScore: number }
export const CC_DEFAULT_SETTINGS: Record<Channel, CcChannelSettings> = {
  'Alex Woung': { videosPerWeek: 2, clipsPerWeek: 3, autoScheduleThreshold: 85, reviewThreshold: 75, minimumSpacingDays: 2, minimumClipScore: 85 },
  'Alex Woung Raw': { videosPerWeek: 5, clipsPerWeek: 3, autoScheduleThreshold: 80, reviewThreshold: 70, minimumSpacingDays: 1, minimumClipScore: 85 },
};
/** The Content Center's settings load (Number(cell), an empty cell = 0 like the interface; else the default) and each channel's record id. Pure. */
export function ccSettingsOf(rows: AirtableRecord[]): { settings: Record<Channel, CcChannelSettings>; ids: Record<Channel, string> } {
  const settings: Record<Channel, CcChannelSettings> = { 'Alex Woung': { ...CC_DEFAULT_SETTINGS['Alex Woung'] }, 'Alex Woung Raw': { ...CC_DEFAULT_SETTINGS['Alex Woung Raw'] } };
  const ids: Record<Channel, string> = { 'Alex Woung': '', 'Alex Woung Raw': '' };
  for (const r of rows) {
    const ch = s(r.fields[SF_CC.channel]);
    if (!isChannel(ch)) continue;
    if (!ids[ch]) ids[ch] = r.id;
    const num = (id: string, fb: number) => { const x = Number(r.fields[id] ?? null); return Number.isFinite(x) ? x : fb; };
    const cur = settings[ch];
    settings[ch] = {
      videosPerWeek: num(SF_CC.videosPerWeek, cur.videosPerWeek), clipsPerWeek: num(SF_CC.clipsPerWeek, cur.clipsPerWeek), autoScheduleThreshold: num(SF_CC.autoScheduleThreshold, cur.autoScheduleThreshold),
      reviewThreshold: num(SF_CC.reviewThreshold, cur.reviewThreshold), minimumSpacingDays: num(SF_CC.minimumSpacingDays, cur.minimumSpacingDays), minimumClipScore: num(SF_CC.minimumClipScore, cur.minimumClipScore),
    };
  }
  return { settings, ids };
}
/** Videos per week per channel, as sienna.ideas reads it (Enabled rows; default main 2, Raw 5). Pure. */
export function targetsOf(rows: AirtableRecord[]): Record<Channel, number> {
  const out: Record<Channel, number> = { 'Alex Woung': 2, 'Alex Woung Raw': 5 };
  for (const r of rows) { const ch = s(r.fields[SF.channel]); const n = Number(r.fields[SF.videosPerWeek]); if (isChannel(ch) && r.fields[SF.enabled] === true && Number.isFinite(n) && n > 0) out[ch] = n; }
  return out;
}

/**
 * The Content Center's nextIdeaDates, unchanged: the recording and publish dates "Approve & schedule"
 * writes. Main: one publication each Tuesday/Thursday, recorded on the FRIDAY before the week before
 * its publication week (Alex 2026-11-28: "change to Friday"; was the Sunday), or the next Friday when
 * that has passed. Raw: the Friday of the current Monday–Sunday week,
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
      // Alex records on Fridays (2026-11-28): the Friday 9-13 days before (Tue/Thu pair share it).
      const plannedRecording = publish.getTime() - (publish.getUTCDay() + 9) * day;
      const nextFriday = today.getTime() + ((5 - today.getUTCDay() + 7) % 7) * day;
      const recording = new Date(plannedRecording >= today.getTime() ? plannedRecording : nextFriday);
      // Too soon to record on a Friday and still edit before it goes out: take a later slot.
      if (recording.getTime() > publish.getTime() - 4 * day) continue;
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

// ---------- the Content Center's own 10 stages (Batch 5: the HQ screen follows the Content Center) ----------
export const CC_STAGES = ['Idea', 'Script', 'Record', 'Edit', 'Finalize', 'Thumbnail', 'Upload', 'Clips', 'Distribute', 'Published'] as const;
export type CcStage = (typeof CC_STAGES)[number];
/** The Content Center's normalizedStage (source.tsx), unchanged: Production Stage → one of its 10 stages. Pure. */
export function normalizedStage(savedStage: string): CcStage {
  const value = savedStage.toLowerCase();
  if (value === 'published' || value.includes('complete')) return 'Published';
  if (value.includes('ready to publish') || value.includes('youtube') || value.includes('upload')) return 'Upload';
  if (value.includes('distribution') || value.includes('distribut')) return 'Distribute';
  if (value.includes('clip') || value.includes('short')) return 'Clips';
  if (value.includes('thumbnail')) return 'Thumbnail';
  if (value.includes('final')) return 'Finalize';
  if (value.includes('edit') || value === 'recorded') return 'Edit';
  if (value.includes('record')) return 'Record';
  if (value.includes('script')) return 'Script';
  return 'Idea';
}
/**
 * Done = posted with proof and distribution finished. The Content Center's own check also reads the
 * Content Distribution rows, which HQ does not read; this is the same test nextStep uses for "nothing left".
 */
export const contentComplete = (v: Video) => postedWithProof(v) && (v.distributionStatus === 'Published' || /complete/i.test(v.distributionStatus));
/** The Content Center's displayedContentStage (source.tsx): the stage label it shows on each item. Pure. */
export function ccStageOf(v: Video): CcStage {
  if (contentComplete(v)) return 'Published';
  if (v.youtubeUrl) return v.clipIds.length > 0 ? 'Distribute' : 'Clips';
  if (/approved|complete/i.test(v.thumbnailStatus)) return 'Upload';
  const stage = normalizedStage(v.stage);
  return stage === 'Published' ? 'Distribute' : stage;
}
/** The Content Center's item order: earliest of recording / publish date first, undated last, then title. */
export const scheduleOrder = (a: { recordingDate: string; publishDate: string; title: string }, b: { recordingDate: string; publishDate: string; title: string }) => {
  const first = (x: { recordingDate: string; publishDate: string }) => [x.recordingDate, x.publishDate].filter(Boolean).sort()[0] ?? '9999';
  return first(a).localeCompare(first(b)) || a.title.localeCompare(b.title);
};

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
// Round 5: these are HQ buttons now (contentActions.ts), done the Content Center's way.
const FIELD = (action: string, wf: string) => ({ how: 'field' as How, automation: `HQ button → Content Automation Action "${action}" → Airtable automation "Content OS Action Script" → n8n [Content OS] ${wf}` });
const BUTTON = (button: string, wf: string) => ({ how: 'button' as How, automation: `HQ button "${button}" → n8n [Content OS] ${wf} (the Content Center's webhook)` });
/**
 * The Content Center's nextStep (source.tsx), the same order, with who does it and how it runs. The
 * script step is the engine's sienna.prep (the n8n "Generate Teleprompter Script" button is the
 * manual copy of it). The final "distribution complete" check needs the Content Distribution rows,
 * which HQ does not read: a posted video (proof of posting) counts as done. Pure.
 */
export function nextStep(v: Video, clips: Clip[]): NextStep | null {
  if (contentComplete(v)) return null;
  if (needsApproval(v)) return { title: 'Review this idea', who: 'Alex', how: 'hq', automation: 'HQ Approve / Reject (writes Idea Decision); after Approve the engine\'s sienna.prep writes the script within 30 minutes', detail: '' };
  // HQ's two additions to the Content Center order: a row marked Scheduled needs its proof of posting
  // first, and a video already recorded never goes back to "write the script" (old rows have none).
  if (v.status === 'Scheduled' && !postedWithProof(v)) return { title: 'Add proof of posting', who: 'Sienna', how: 'manual', automation: 'HQ: save the YouTube link on the video\'s page; Status "Scheduled" alone is not proof', detail: '' };
  const pastRecording = RECORDED_ON.has(v.stage) || !!v.finalAssetUrl || !!v.youtubeUrl;
  if (!v.hasScript && !pastRecording) return { title: 'Write the recording script', who: 'Sienna', how: 'engine', automation: 'Engine sienna.prep (every 30 min; HQ\'s "Generate script" runs n8n [Content OS] Generate Teleprompter Script, the same job)', detail: '' };
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
  if (!v.finalAssetUrl && !v.editingRoute) return { title: 'Choose how it is edited', who: 'Alex', how: 'manual', automation: 'HQ: Use OpusClip / Use DaVinci Resolve (Editing Route)', detail: '' };
  if (!v.finalAssetUrl && /manual editor|davinci resolve/i.test(v.editingRoute)) return { title: 'Edit in DaVinci Resolve', who: 'Alex', how: 'manual', automation: 'By hand: upload the finished video to the Final folder', detail: '' };
  if (!v.finalAssetUrl && v.editingRoute === 'OpusClip' && !recordingSynced) return { title: 'Sync the uploaded recording', who: 'Sienna', ...FIELD('Sync Frame.io', 'Frame.io Sync'), detail: 'Finds the uploaded recording in Frame.io.' };
  if (!v.finalAssetUrl && v.editingRoute === 'OpusClip' && !longFormSubmitted) return { title: 'Start the full-video edit', who: 'Sienna', ...FIELD('Submit to OpusClip', 'OpusClip Submit and Refresh'), detail: '' };
  if (!v.finalAssetUrl && v.editingRoute === 'OpusClip') return { title: 'Finish the full-video edit', who: 'Sienna', how: 'manual', automation: 'Sienna\'s editor (scheduled task, agents/sienna-editor.md): edit in OpusClip, export, upload to the Final folder, then Sync Frame.io', detail: '' };
  if (!v.thumbnailUrl) return { title: 'Make the thumbnail', who: 'Sienna', ...BUTTON('Generate thumbnail', 'Generate Thumbnail'), detail: '' };
  if (!thumbnailApproved) return { title: 'Approve the thumbnail', who: 'Alex', how: 'manual', automation: 'HQ: Approve thumbnail (Thumbnail Status → Approved), or Request changes → n8n [Content OS] Revise Thumbnail', detail: '' };
  if (!v.youtubeTitle || !v.hasYoutubeDescription) return { title: 'Prepare the YouTube title and description', who: 'Sienna', ...BUTTON('Prepare YouTube details', 'Prepare YouTube Details'), detail: '' };
  if (!v.youtubeUrl) return { title: 'Upload the video to YouTube', who: 'Alex', how: 'manual', automation: 'By hand in YouTube Studio, then save the YouTube link in HQ (Sienna never posts)', detail: '' };
  if (!v.finalAssetId) return { title: 'Sync the final video', who: 'Sienna', ...FIELD('Sync Frame.io', 'Frame.io Sync'), detail: '' };
  if (shortBlocked) return { title: 'Check the short-clips job', who: 'Riley', how: 'manual', automation: 'The short-clips job needs a check or belongs to another final video; do not submit another', detail: v.shortJobState };
  if (!shortSubmitted) return { title: 'Make the short clips', who: 'Sienna', ...FIELD('Submit to OpusClip', 'OpusClip Submit and Refresh'), detail: '' };
  if (clipCount === 0) return { title: 'Clips are being made', who: 'Sienna', ...FIELD('Refresh Opus Clips', 'OpusClip Submit and Refresh'), detail: '' };
  if (clipCount > 0 && !['drafts ready', 'scheduled', 'published'].includes(distribution) && !distribution.includes('complete') && v.distributionCount === 0) {
    if (v.distributionChannels === 0) return { title: 'Choose where the clips go', who: 'Alex', how: 'manual', automation: 'HQ: Choose where the posts go (clips wanted + distribution channels)', detail: '' };
    return { title: 'Make the posts', who: 'Sienna', ...FIELD('Generate Distribution Pack', 'Generate Distribution Pack'), detail: '' };
  }
  return { title: 'Review the posts', who: 'Alex', how: 'manual', automation: 'HQ → Distribution: approve per platform, then post by hand or schedule (Instagram / YouTube Shorts, only when you press Schedule: [Content OS] Schedule Approved Social Posts); record where it went and its stats', detail: '' };
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

// ---------- the posted date (round 4, 2026-11-28) ----------
// "Outbound Funnel Math" showed "No date yet": its row has the YouTube link and Publishing Status
// "Published" but no Publish Date, no YouTube Published At and no Recording Date (the link was saved by
// hand, and nothing stamps a date when it is saved). The calendar only read Recording / Publish Date.
// Now a posted video's date is: YouTube Published At → Publish Date → the date YouTube itself gives in
// the channel's public feed (youtube.com/feeds/videos.xml, the newest 15 videos; read-only, no key).
/** The two channels' YouTube ids (from youtube.com/@alexwoung and /@alexwoungraw, checked 2026-11-28). */
export const YOUTUBE_CHANNEL_IDS: Record<Channel, string> = { 'Alex Woung': 'UCy81ZFFJdQrAZydCV9XJ4kw', 'Alex Woung Raw': 'UCfXiWoFAPrs2Ll-Ecj-cSJQ' };
/** The 11-character video id of a YouTube link ('' when it is not one). Pure. */
export function youtubeId(url: string): string {
  const m = /^https:\/\/(?:www\.|m\.)?(?:youtu\.be\/|youtube\.com\/(?:watch\?(?:[^#]*&)?v=|shorts\/|live\/|embed\/))([A-Za-z0-9_-]{11})(?![A-Za-z0-9_-])/.exec(String(url ?? '').trim());
  return m ? m[1] : '';
}
/** A channel feed → video id → the day it was published (New York). Pure. */
export function feedDates(xml: string): Map<string, string> {
  const out = new Map<string, string>();
  for (const e of String(xml ?? '').match(/<entry>[\s\S]*?<\/entry>/g) ?? []) {
    const id = /<yt:videoId>([A-Za-z0-9_-]{11})<\/yt:videoId>/.exec(e)?.[1];
    const t = Date.parse(/<published>([^<]+)<\/published>/.exec(e)?.[1] ?? '');
    if (id && Number.isFinite(t)) out.set(id, etYmd(t));
  }
  return out;
}
export type FetchText = (url: string) => Promise<string>;
const fetchText: FetchText = async (url) => {
  const r = await fetch(url, { signal: AbortSignal.timeout(5000) });
  if (!r.ok) throw new Error(`YouTube answered ${r.status}`);
  return (await r.text()).slice(0, 2_000_000);
};
/** channel → its feed's dates and when they were read: kept 1 hour (a failed read is retried after 15 minutes). */
const feedCache = new Map<string, { dates: Map<string, string>; at: number; ok: boolean }>();
export function _resetYoutubeCache() { feedCache.clear(); }
/** Proof of posting but no saved date: the only rows HQ looks up on YouTube. */
const needsYoutubeDate = (v: Video) => postedWithProof(v) && !v.youtubePublishedAt && !v.publishDate && !!youtubeId(v.youtubeUrl);
/**
 * YouTube's own dates for posted videos with no saved date. Reads at most the two channel feeds (only
 * when such a video exists), 5 seconds each, cached; never throws. Video record id → YYYY-MM-DD.
 */
export async function youtubeDates(videos: Video[], get: FetchText = fetchText, now = Date.now()): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  const want = videos.filter(needsYoutubeDate);
  if (!want.length) return out;
  const chans = [...new Set(want.map((v) => (v.channel ? [v.channel] : [...CHANNELS])).flat())] as Channel[];
  await Promise.all(chans.map(async (ch) => {
    const hit = feedCache.get(ch);
    if (hit && now - hit.at < (hit.ok ? 3_600_000 : 15 * 60_000)) return;
    try { feedCache.set(ch, { dates: feedDates(await get(`https://www.youtube.com/feeds/videos.xml?channel_id=${YOUTUBE_CHANNEL_IDS[ch]}`)), at: now, ok: true }); }
    catch { feedCache.set(ch, { dates: new Map(), at: now, ok: false }); /* offline or blocked: shown as "no date saved" */ }
  }));
  for (const v of want) {
    const id = youtubeId(v.youtubeUrl);
    const d = (v.channel ? [v.channel] : [...CHANNELS]).map((ch) => feedCache.get(ch)?.dates.get(id)).find(Boolean);
    if (d) out.set(v.id, d);
  }
  return out;
}
export type PostedFrom = 'YouTube Published At' | 'Publish Date' | 'YouTube' | '';
/** When a video was posted, and where that date came from ('' when it is not posted or no date is known). Pure. */
export function postedOn(v: Video, yt: Map<string, string> = new Map()): { date: string; from: PostedFrom } {
  if (!postedWithProof(v)) return { date: '', from: '' };
  if (v.youtubePublishedAt) { const p = Date.parse(v.youtubePublishedAt); const d = Number.isFinite(p) ? etYmd(p) : dateKey(v.youtubePublishedAt); if (d) return { date: d, from: 'YouTube Published At' }; }
  if (v.publishDate) return { date: v.publishDate, from: 'Publish Date' };
  const y = yt.get(v.id);
  return y ? { date: y, from: 'YouTube' } : { date: '', from: '' };
}
/** "2026-11-27" → "11/27" (dates use slashes, no weekday: RULES 2026-11-27 and round 4). Pure. */
export const slash = (ymd: string) => (/^\d{4}-\d{2}-\d{2}/.test(ymd) ? `${Number(ymd.slice(5, 7))}/${Number(ymd.slice(8, 10))}` : '');

// ---------- the video's workflow (round 4, 2026-11-28): the real steps, where each happens, the one next step ----------
// Alex: "Where do I click to generate the script? Where's the Gamma and how do I upload it? How do I
// progress it?" Every step below exists in the Content OS today, in the Content Center's order
// (nextStep in source.tsx). Where HQ can't press it, the step names the Content Center button that
// does, or says "Not automated yet" with what to do by hand. HQ itself only writes the idea decision;
// "Ask Sienna now" puts a task on Sienna's list (POST /fix-it) and writes nothing to Airtable.
export type StepState = 'done' | 'now' | 'later';
/** hq = a button in HQ (round 5: also the ones that run an n8n flow) · sienna = Sienna does it automatically · byHand · notAutomated. */
export type StepWhere = 'hq' | 'sienna' | 'byHand' | 'notAutomated';
/** run = an HQ button that does what the Content Center's button does (contentActions.ts); input = what it asks for first. */
export interface StepButton { kind: 'decide' | 'askSienna' | 'openScript' | 'copyGamma' | 'resource' | 'link' | 'run' | 'distribution'; label: string; url?: string; task?: string; run?: RunKey; input?: 'url' | 'changes' | 'brief' }
export interface VideoStep { key: string; title: string; state: StepState; where: StepWhere; text: string; optional?: boolean; buttons: StepButton[] }
export interface StepContext { gamma: string; gammaUrl: string; hasPrep: boolean; stuck: boolean; now: number; posted: string }
/** The next sienna.prep run: the scheduler queues it every half hour, on the hour and at :30. Pure. */
export function nextPrepAt(now: number): number { const step = 30 * 60_000; return Math.ceil((now + 1) / step) * step; }
const etTime = (t: number) => new Date(t).toLocaleTimeString('en-US', { timeZone: 'America/New_York', hour: 'numeric', minute: '2-digit' });
const httpsOnly = (u: string) => (/^https:\/\//.test(u) && !/airtable\.com/i.test(u) ? u : '');

/** The video's steps in the Content Center's order, each done / now / later, with its buttons. Pure. */
export function videoSteps(v: Video, clips: Clip[], x: StepContext): VideoStep[] {
  const steps: VideoStep[] = [];
  const add = (key: string, title: string, done: boolean, where: StepWhere, text: string, buttons: StepButton[] = [], doneText = '', doneButtons: StepButton[] = [], optional = false) =>
    steps.push({ key, title, state: done ? 'done' : 'later', where, text: done ? doneText : text, buttons: done ? doneButtons : buttons, ...(optional ? { optional } : {}) });
  const main = v.channel === 'Alex Woung';
  const approved = !needsApproval(v);
  const recordingSynced = /recorded footage found|recording found|raw video found/i.test(v.message);
  const longFormSubmitted = /long-form edit project (?:created|submitted)|long-form edit (?:submitted|processing)/i.test(v.message);
  const onYoutube = !!v.youtubeUrl;
  const finished = !!v.finalAssetUrl || onYoutube;
  const recorded = RECORDED_ON.has(v.stage) || recordingSynced || finished;
  const thumbnailApproved = /approved|complete/i.test(v.thumbnailStatus);
  const clipCount = clips.filter((c) => c.parentId === v.id).length || v.clipIds.length;
  const shortSubmitted = Boolean(v.shortProjectId || v.shortJobState || v.shortSourceAssetId);
  const sourceMatches = Boolean(v.finalAssetId && v.shortSourceAssetId && v.finalAssetId === v.shortSourceAssetId);
  const shortBlocked = shortSubmitted && (!sourceMatches || !v.shortProjectId || /submitting|error|failed|uncertain/i.test(v.shortJobState));
  const dist = v.distributionStatus.toLowerCase();
  const drafts = ['drafts ready', 'scheduled', 'published'].includes(dist) || dist.includes('complete') || v.distributionCount > 0;
  const raw = httpsOnly(v.rawFolderUrl), final = httpsOnly(v.finalFolderUrl), yt = httpsOnly(v.youtubeUrl), thumb = httpsOnly(v.thumbnailUrl);
  const today = etYmd(x.now);
  const title = v.title.slice(0, 120);

  // 1. The idea decision (HQ).
  add('idea', 'Approve the idea', approved, 'hq', 'Approve puts it on the calendar (record and publish dates). Sienna then writes the script within 30 minutes. Reject keeps it in the history.',
    [{ kind: 'decide', label: 'Approve or reject' }], 'Approved.');

  // 2. The script (Sienna, automatic: sienna.prep; the Content Center's "Generate script" runs the same job in n8n).
  const pastWindow = !!v.recordingDate && v.recordingDate < addDays(today, -2);
  const scriptText = x.stuck ? 'Approved over a day ago and still no script: Sienna\'s automatic run did not write it. Press "Generate script" (the Content OS script flow) or ask her now.'
    : pastWindow ? `Sienna's automatic run skips it: the recording date (${slash(v.recordingDate)}) has passed. Press "Generate script", or ask her now.`
      : `Sienna writes it automatically by about ${etTime(nextPrepAt(x.now))} ET (she checks every 30 minutes for approved ideas with no script), with hooks, title options, a thumbnail idea${main ? ' and the Gamma outline' : ''}.`;
  add('script', 'Script', v.hasScript || recorded, 'sienna', scriptText,
    x.stuck || pastWindow ? [{ kind: 'run', run: 'script', label: 'Generate script' }, { kind: 'askSienna', label: 'Ask Sienna now', task: `Write the recording script for "${title}"` }]
      : [{ kind: 'askSienna', label: 'Ask Sienna now', task: `Write the recording script for "${title}"` }, { kind: 'run', run: 'script', label: 'Generate script now' }],
    v.hasScript ? (x.hasPrep ? 'Script ready.' : 'Script written (in the Content Center).') : 'Recorded without a script.', v.hasScript && x.hasPrep ? [{ kind: 'openScript', label: 'Open script' }] : []);

  // 3. Gamma (Alex Woung only: the slides on screen). The outline is automatic. 2026-11-28: Gamma's API needs a
  // paid plan, so "Make the resource" turns the outline into a branded document in HQ (print to PDF); a Gamma
  // doc made by hand is still linked with the Gamma link box on the video's page (saved in its Notes).
  if (main) {
    const gammaUrl = httpsOnly(x.gammaUrl);
    const outline = !!x.gamma;
    add('gamma', 'Slides and resource (Gamma outline)', !!gammaUrl || recorded, outline ? 'hq' : 'notAutomated',
      outline ? 'Sienna wrote the slide outline with the script. Press "Make the resource": HQ turns it into a branded document you can download as a PDF. Made a Gamma doc by hand instead? Paste its link in the Gamma box below.'
        : v.hasScript ? 'There is no outline: this script came from the Content Center button, which writes none. Ask Sienna for an outline.'
          : 'Sienna writes the slide outline together with the script. Then "Make the resource" turns it into a document here.',
      outline ? [{ kind: 'resource', label: 'Make the resource' }, { kind: 'copyGamma', label: 'Copy outline' }]
        : v.hasScript ? [{ kind: 'askSienna', label: 'Ask Sienna for an outline', task: `Write the Gamma outline for "${title}"` }] : [],
      gammaUrl ? 'Gamma doc linked.' : 'Recorded (no Gamma link saved).',
      [...(gammaUrl ? [{ kind: 'link' as const, label: 'Open Gamma', url: gammaUrl }] : []), ...(outline ? [{ kind: 'resource' as const, label: 'Open the resource' }] : [])], true);
  }

  // 4–12 (round 5, 2026-11-28): every Content Center button is an HQ button (contentActions.ts runs it the
  // Content Center's way: the same Content Automation Action value, n8n webhook body or field write).
  const run = (k: RunKey, label: string, input?: StepButton['input']): StepButton => ({ kind: 'run', run: k, label, ...(input ? { input } : {}) });
  const busy = v.action ? ` "${v.action}" is running now; the buttons work again when it finishes.` : '';

  // 4. The Frame.io folders ("Set up Frame.io" → Content Automation Action "Sync Frame.io" → n8n Frame.io Sync).
  add('folder', 'Recording folder (Frame.io)', !!v.rawFolderUrl || recorded, 'hq',
    `Press "Set up Frame.io": it makes the Raw and Final folders in Frame.io for this video.${busy}`, [run('setupFrame', 'Set up Frame.io')], 'Folders ready.');

  // 5. Record, upload, mark recorded (by hand + "Sync Frame.io", which sets Production Stage "Recorded").
  add('record', 'Record, upload, mark recorded', recorded, 'byHand',
    `Record it${v.recordingDate ? ` (recording date ${slash(v.recordingDate)})` : ''}. Upload the file to this video's Raw folder in Frame.io, then press "Sync Frame.io": it finds the file and marks the video Recorded (there is no separate "mark recorded" button).${v.editingRoute ? '' : ' Also choose how it is edited: OpusClip or DaVinci Resolve.'}${busy}`,
    [...(raw ? [{ kind: 'link' as const, label: 'Upload to the Raw folder', url: raw }] : []), run('syncFrame', 'Sync Frame.io'),
      ...(v.editingRoute ? [] : [run('routeOpus', 'Use OpusClip'), run('routeDavinci', 'Use DaVinci Resolve')])], 'Recording found.');

  // 6. Edit (OpusClip "Edit full video" → Content Automation Action "Submit to OpusClip"; or DaVinci Resolve by hand).
  const davinci = /manual editor|davinci resolve/i.test(v.editingRoute);
  const inOpus = v.editingRoute === 'OpusClip' && recordingSynced && longFormSubmitted;
  const finalLink = final && (davinci || longFormSubmitted) ? [{ kind: 'link' as const, label: 'Open the Final folder', url: final }] : [];
  const editText = !v.editingRoute ? 'Choose how it is edited: OpusClip (automatic path) or DaVinci Resolve (you edit the full video yourself).'
    : davinci ? 'Edit it in DaVinci Resolve (by hand), upload the finished video to the Final folder in Frame.io, then press "Sync Frame.io".'
      : !recordingSynced ? 'Press "Sync Frame.io" so OpusClip can find the recording.'
        : !longFormSubmitted ? 'Press "Edit full video": it sends the recording to OpusClip for the full edit, no shorts yet (uses OpusClip credits).'
          : 'In OpusClip now. Sienna\'s editor finishes the edit, exports it and uploads it to the Final folder; then "Sync Frame.io" picks it up.';
  const editButtons: StepButton[] = !v.editingRoute ? [run('routeOpus', 'Use OpusClip'), run('routeDavinci', 'Use DaVinci Resolve')]
    : davinci ? [...finalLink, run('syncFrame', 'Sync Frame.io'), run('routeOpus', 'Switch to OpusClip')]
      : !recordingSynced ? [run('syncFrame', 'Sync Frame.io'), run('routeDavinci', 'Switch to DaVinci Resolve')]
        : !longFormSubmitted ? [run('editFull', 'Edit full video'), run('routeDavinci', 'Switch to DaVinci Resolve')]
          : [...finalLink, run('syncFrame', 'Sync Frame.io')];
  add('edit', 'Edit the video', finished, davinci ? 'byHand' : inOpus ? 'sienna' : 'hq', editText + busy, editButtons, 'Finished video in Frame.io.');

  // 7. Thumbnail (n8n Generate Thumbnail / Revise Thumbnail webhooks; approve = Thumbnail Status "Approved").
  const generating = /generating/i.test(v.thumbnailStatus);
  add('thumbnail', 'Thumbnail', thumbnailApproved || onYoutube, 'hq',
    generating ? 'The thumbnail is being made. Refresh in a minute.'
      : !v.thumbnailUrl ? `Press "Generate thumbnail": it makes a 16:9 thumbnail from the title and your Frame.io portraits (uses image credits).${busy}`
        : 'Look at it, then approve it, or say what to change and a new one is made.',
    generating ? [] : !v.thumbnailUrl ? [run('thumbnail', 'Generate thumbnail')]
      : [...(thumb ? [{ kind: 'link' as const, label: 'Open the thumbnail', url: thumb }] : []), run('thumbnailApprove', 'Approve thumbnail'), run('thumbnailRevise', 'Request changes', 'changes')],
    'Thumbnail approved.');

  // 8. YouTube title and description (n8n Prepare YouTube Details webhook).
  add('details', 'YouTube title and description', (!!v.youtubeTitle && v.hasYoutubeDescription) || onYoutube, 'hq',
    `Press "Prepare YouTube details": it writes the title and description for you to copy into YouTube Studio.${busy}`, [run('youtubeDetails', 'Prepare YouTube details')], 'Ready to copy.');

  // 9. Post on YouTube (by hand: HQ and Sienna never post), then save the link here (the Content Center's YouTube URL field).
  add('youtube', 'Post on YouTube', onYoutube, 'byHand',
    `${v.status === 'Scheduled' ? 'Marked "Scheduled" but no YouTube link is saved. ' : ''}Upload the finished video and thumbnail in YouTube Studio yourself (HQ and Sienna never post), then paste the YouTube link here.`,
    [{ kind: 'link', label: 'Open YouTube Studio', url: 'https://studio.youtube.com/' }, run('youtubeUrl', 'Save the YouTube link', 'url')],
    x.posted ? `Posted ${slash(x.posted)}.` : 'Posted (no date saved).', yt ? [{ kind: 'link', label: 'Watch on YouTube', url: yt }] : []);

  // 10. Short clips ("Create short clips" / "Check clip status" → Content Automation Action "Submit to OpusClip" / "Refresh Opus Clips").
  add('clips', 'Short clips', clipCount > 0, 'hq',
    shortBlocked ? 'The short-clips job needs a check (it may belong to another final video). Don\'t submit another; Riley checks it.'
      : !v.finalAssetId ? 'Press "Sync Frame.io" so it registers the finished video, then "Create short clips".'
        : !shortSubmitted ? `Press "Create short clips" (OpusClip; uses credits). Sienna checks each clip before it comes to you.${busy}`
          : `OpusClip is making them. "Check clip status" brings them in.${busy}`,
    shortBlocked ? [] : !v.finalAssetId ? [run('syncFrame', 'Sync Frame.io')] : !shortSubmitted ? [run('shortClips', 'Create short clips')] : [run('refreshClips', 'Check clip status')],
    `${clipCount} clip${clipCount === 1 ? '' : 's'}.`);

  // 11. Posts (the repurposing brief, then "Generate posts" → Content Automation Action "Generate Distribution Pack").
  const postsRunning = v.action === 'Generate Distribution Pack';
  add('posts', 'Posts from this video', drafts, 'hq',
    v.distributionChannels === 0 ? 'Choose where the posts go (Instagram, YouTube Shorts, Reddit, X, LinkedIn, blog, newsletter) and how many clips to use.'
      : clipCount === 0 ? 'The posts are made from the clips: make the short clips first.'
        : postsRunning ? 'The posts are being made. If nothing comes back, retry (once).'
          : `Press "Generate posts": captions, Reddit drafts and the newsletter, for your review (nothing is posted).${busy}`,
    v.distributionChannels === 0 ? [run('postsBrief', 'Choose where the posts go', 'brief')]
      : clipCount === 0 ? [run('postsBrief', 'Change where the posts go', 'brief')]
        : postsRunning ? [run('postsRetry', 'Retry the posts')] : [run('posts', 'Generate posts'), run('postsBrief', 'Change where the posts go', 'brief')],
    'Drafts made.');

  // 12. Distribution: approve each platform's post, post it, record where / when / views, likes, comments (HQ).
  add('approve', 'Approve, post and record the stats', contentComplete(v), 'hq',
    'Open Distribution below: approve each platform\'s post, post it (Instagram and YouTube Shorts can be scheduled through OpusClip once you approve; Reddit, X, LinkedIn and TikTok by hand), then record where it went and its views, likes and comments.',
    [{ kind: 'distribution', label: 'Open Distribution' }], 'Done.');

  // The first required step not done is "now"; an optional one before it (Gamma) is "now" too; the rest wait.
  const first = steps.findIndex((s) => s.state !== 'done' && !s.optional);
  steps.forEach((s, i) => { if (s.state !== 'done' && (i === first || (s.optional && (first === -1 || i < first)))) s.state = 'now'; });
  return steps;
}

// ---------- source ----------
export interface ContentSource {
  videos: Video[]; clips: Clip[]; settingsRows: AirtableRecord[]; heavy: Map<string, AirtableRecord>;
  stuck: { id: string; title: string; channel: string }[]; lastPrep: { status: string; at: string; error: string } | null; readAt: string;
  /** Round 4: posted videos with no saved date → the date on their YouTube page (video record id → YYYY-MM-DD). */
  ytDates?: Map<string, string>;
}

const idFormula = (xs: string[]) => `OR(${xs.map((x) => `RECORD_ID()='${x}'`).join(',')})`;
/** One batched read: rows (light fields), the rows that have a script, clips, settings, stuck approvals, then the long text of the rows HQ shows. */
export async function readContentSource(at: Pick<HqAirtable, 'list'>, db: Db | null, now = Date.now(), getYoutube?: FetchText): Promise<ContentSource> {
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
  // Long text only for what HQ shows: the ideas waiting (newest 40 per channel), the Friday ideas, and
  // (round 4) the newest 60 scripted videos not recorded yet, so each video's page can open its script and Gamma outline.
  const fri = fridayCandidates(videos, now).map((v) => v.id);
  const waiting = ([...CHANNELS, ''] as const).flatMap((ch) => videos.filter((v) => v.channel === ch && awaitingDecision(v)).sort(byNewest).slice(0, 40).map((v) => v.id));
  const since = addDays(etYmd(now), -60);
  const scriptedOpen = videos.filter((v) => v.channel && v.hasScript && !ideaIsArchived(v.decision) && !RECORDED_ON.has(v.stage) && !v.finalAssetUrl && !v.youtubeUrl
    && [v.recordingDate, v.publishDate, v.created ? etYmd(Date.parse(v.created)) : ''].some((d) => d && d >= since)).sort(byNewest).slice(0, 60).map((v) => v.id);
  const want = [...new Set([...fri, ...waiting, ...scriptedOpen])];
  const heavy = new Map<string, AirtableRecord>();
  for (let i = 0; i < want.length; i += 50) {
    for (const r of await at.list(CONTENT, idFormula(want.slice(i, i + 50)), HEAVY, 50)) heavy.set(r.id, r);
  }
  const ytDates = await youtubeDates(videos, getYoutube, now);
  return {
    videos, clips, settingsRows, heavy, ytDates,
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

/** What HQ shows for one item, the same blocks the Content Center shows (no Airtable links: Batch 5). */
export interface ItemFacts {
  decision: string; score: number | null; source: string; sourceUrl: string; script: boolean;
  video: { folder: boolean; finished: boolean; youtube: boolean; youtubeUrl: string };
  repurposing: { shortProject: boolean; clips: number; drafts: boolean };
  update: string; error: string;
  /** Parity: the Content Center's "Why this idea qualified" (Idea Qualification Reason), when HQ read the long text. */
  reason?: string;
  details: { productionStage: string; status: string; editingRoute: string; opusStatus: string; shortJobState: string; thumbnailStatus: string; publishingStatus: string };
}
export function itemFacts(v: Video, clips: Clip[]): ItemFacts {
  const clipCount = clips.filter((c) => c.parentId === v.id).length || v.clipIds.length;
  return {
    decision: v.decision, score: v.score, source: v.community.replace(/^Sienna:\s*/, '') || v.source, sourceUrl: /^https?:\/\//.test(v.sourceUrl) ? v.sourceUrl : '', script: v.hasScript,
    video: { folder: !!v.rawFolderUrl, finished: !!v.finalAssetUrl, youtube: !!v.youtubeUrl, youtubeUrl: /^https:\/\//.test(v.youtubeUrl) ? v.youtubeUrl : '' },
    repurposing: { shortProject: !!v.shortProjectId, clips: clipCount, drafts: /^(Drafts Ready|Scheduled|Published)$/i.test(v.distributionStatus) || /complete/i.test(v.distributionStatus) },
    update: v.message.slice(0, 400), error: v.error.slice(0, 400),
    details: { productionStage: v.stage, status: v.status, editingRoute: v.editingRoute, opusStatus: v.opusStatus, shortJobState: v.shortJobState, thumbnailStatus: v.thumbnailStatus, publishingStatus: v.publishingStatus },
  };
}

/** opts.history (the Content Center's "Hide older and completed history" unticked): also rejected / archived ideas, rows with no channel and rows older than 60 days. */
export function buildContent(src: ContentSource, baseId: string, now = Date.now(), opts: { history?: boolean } = {}) {
  const targets = targetsOf(src.settingsRows);
  const heavyOf = (id: string) => src.heavy.get(id)?.fields ?? {};
  const byId = new Map(src.videos.map((v) => [v.id, v]));
  const today = etYmd(now);
  const fri = contentFriday(now);
  const week = weekOf(today);
  const fweek = weekOf(fri);

  // Needs you: ideas waiting for a decision, per channel, newest first (best score first inside a day).
  // Parity (2026-11-28): an idea with no channel yet is listed too (the Content Center's "Content for" picks it; approve needs it).
  const ideas = ([...CHANNELS, ''] as const).map((ch) => {
    const all = src.videos.filter((v) => v.channel === ch && awaitingDecision(v)).sort(byNewest);
    return {
      channel: ch, key: ch ? CHANNEL_KEY[ch] : 'none', label: ch ? CHANNEL_LABEL[ch] : 'No channel yet', count: all.length,
      items: all.map((v) => {
        const h = heavyOf(v.id);
        const parts = ideaParts(s(h[CF.description]));
        return {
          id: v.id, title: v.title, score: v.score, decision: v.decision, proposed: v.created || v.date, recordFor: v.date,
          by: v.ideaKey.startsWith('sienna:') ? 'Sienna' : /^r\/|reddit/i.test(v.community) ? 'Reddit intake (n8n)' : v.community || v.source || 'UNKNOWN',
          source: v.community.replace(/^Sienna:\s*/, ''), sourceUrl: /^https?:\/\//.test(v.sourceUrl) ? v.sourceUrl : '',
          angle: parts.angle, hook: parts.hook, why: s(h[CF.ideaReason]).split(/\n\s*\n|\nEvidence:/)[0].trim().slice(0, 400),
        };
      }),
    };
  }).filter((g) => g.channel || g.count > 0);
  // Needs you: final clips Sienna's editor passed (Needs Review + "Sienna QA: passed"), per parent video.
  const passed = src.clips.filter((c) => c.status === 'Needs Review' && siennaPassed(c));
  const parents = [...new Set(passed.map((c) => c.parentId))];
  const finals = parents.map((pid) => {
    const v = byId.get(pid);
    return {
      parentId: pid, title: v?.title ?? 'Video not found', channel: v?.channel ?? '',
      clips: passed.filter((c) => c.parentId === pid).sort((a, b) => (b.score ?? 0) - (a.score ?? 0)).map((c) => ({
        id: c.id, name: c.name, score: c.score, qa: c.notes.split('\n')[0].slice(0, 200), hook: c.hook, caption: c.caption, watchUrl: c.watchUrl,
      })),
    };
  });

  // Pipeline: recent rows (any date in the last 60 days or ahead), and everything still open.
  const since = addDays(today, -60);
  const yt = src.ytDates ?? new Map<string, string>();
  const stuckIds = new Set(src.stuck.map((x) => x.id));
  const recent = (v: Video) => [v.recordingDate, v.publishDate, v.date, postedOn(v, yt).date, v.created ? etYmd(Date.parse(v.created)) : ''].some((d) => d && d >= since);
  const pipeRows: {
    id: string; title: string; channel: string; key: string; stage: StageKey; cc: CcStage; thisWeek: boolean; awaiting: boolean; done: boolean; recordingDate: string; publishDate: string;
    /** Parity: rejected / duplicate / archived (only with history), older than the 60-day window (only with history). */
    archived: boolean; old: boolean;
    /** Round 4: when it was posted ('' = not posted, or posted with no date known) and where that date came from. */
    posted: boolean; postedDate: string; postedFrom: PostedFrom;
    status: string; productionStage: string; next: NextStep | null; flags: string[]; facts: ItemFacts;
    /** Round 5: the Content Automation Action now in the field ('' = nothing running). */
    running: string;
    /** Round 4: the real workflow, and Sienna's prep (script, hooks, Gamma outline) when HQ read it. */
    steps: VideoStep[]; prep: (Prep & { script: string }) | null;
  }[] = [];
  let leftOut = 0;
  for (const v of src.videos) {
    const noChannelIdea = !v.channel && awaitingDecision(v);
    const st = v.channel || noChannelIdea || opts.history ? (stageOf(v, src.clips) ?? (opts.history ? 'idea' : null)) : null;
    const isRecent = recent(v);
    if (!st || (!isRecent && !noChannelIdea && !opts.history)) { if (v.channel && !ideaIsArchived(v.decision)) leftOut++; continue; }
    const flags: string[] = [];
    if (v.stage === 'Blocked') flags.push('Blocked');
    if (v.error) flags.push('Automation error');
    if (v.status === 'Scheduled' && !postedWithProof(v)) flags.push('Scheduled, no proof');
    const h = src.heavy.get(v.id)?.fields;
    const prep = h && v.hasScript ? { ...parsePrep(s(h[CF.notes]), s(h[CF.description])), script: s(h[CF.script]) } : null;
    const posted = postedOn(v, yt);
    pipeRows.push({
      id: v.id, title: v.title, channel: v.channel, key: v.channel ? CHANNEL_KEY[v.channel as Channel] : '', stage: st, archived: ideaIsArchived(v.decision), old: !isRecent, cc: ccStageOf(v), thisWeek: inRange(v.recordingDate, week.start, week.end),
      awaiting: needsApproval(v), done: contentComplete(v), recordingDate: v.recordingDate, publishDate: v.publishDate,
      posted: postedWithProof(v), postedDate: posted.date, postedFrom: posted.from,
      status: v.status, productionStage: v.stage, next: st === 'posted' ? null : nextStep(v, src.clips), flags, facts: { ...itemFacts(v, src.clips), reason: s(h?.[CF.ideaReason]).slice(0, 800) }, running: v.action,
      steps: videoSteps(v, src.clips, { gamma: prep?.gamma ?? '', gammaUrl: prep?.gammaUrl ?? '', hasPrep: !!prep?.script, stuck: stuckIds.has(v.id), now, posted: posted.date }),
      prep: prep && prep.script ? prep : null,
    });
  }
  pipeRows.sort(scheduleOrder);
  // Needs you: the other Content Center steps waiting on Alex (link only).
  const liveRows = pipeRows.filter((r) => !r.archived && !r.old);
  const alexSteps = liveRows.filter((r) => r.next && r.next.who === 'Alex' && r.next.how !== 'hq')
    .map((r) => ({ id: r.id, title: r.title, channel: r.channel, step: r.steps.find((x) => x.state === 'now' && !x.optional)?.title ?? r.next!.title, how: r.next!.automation }));

  // Friday.
  const candidates = fridayCandidates(src.videos, now);
  const friday = CHANNELS.map((ch) => {
    const items = candidates.filter((v) => v.channel === ch).sort(recordingOrder).map((v) => {
      const h = heavyOf(v.id);
      const prep = parsePrep(s(h[CF.notes]), s(h[CF.description]));
      const parts = ideaParts(s(h[CF.description]));
      return {
        id: v.id, title: v.title, recordingDate: v.recordingDate, publishDate: v.publishDate, late: !!v.recordingDate && v.recordingDate < fweek.start,
        scriptReady: v.hasScript, script: s(h[CF.script]), angle: parts.angle, ideaHook: parts.hook, ...prep,
        /** Round 5: Friday's last step (upload, then Sync Frame.io) links the Raw folder. */
        rawFolderUrl: httpsOnly(v.rawFolderUrl),
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

  const notes = contentNotes(src, { fri, fweek, today, pipeline: liveRows });
  const ideaCount = ideas.reduce((a, c) => a + c.count, 0);
  const finalCount = finals.reduce((a, f) => a + f.clips.length, 0);
  return {
    readAt: src.readAt, friday: { date: fri, week: fweek, channels: friday }, week: { ...week, channels: weekStats },
    needs: { ideas, finals, alexSteps, waitingForSienna: src.clips.filter((c) => c.status === 'Needs Review' && !siennaChecked(c)).length },
    pipeline: { stages: STAGES.map((k) => ({ key: k, label: STAGE_LABEL[k] })), ccStages: [...CC_STAGES], rows: pipeRows, leftOut: opts.history ? 0 : leftOut, history: !!opts.history },
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
  const undated = src.videos.filter((v) => postedWithProof(v) && !v.youtubePublishedAt && !v.publishDate
    && (v.created ? etYmd(Date.parse(v.created)) >= addDays(c.today, -60) : false));
  if (undated.length) {
    const yt = src.ytDates ?? new Map<string, string>();
    const found = undated.filter((v) => yt.get(v.id));
    out.push({ problem: 'Posted, but no posted date saved', data: `${undated.length} posted video${undated.length === 1 ? ' has' : 's have'} a YouTube link but no Publish Date or YouTube Published At${eg(undated)}${found.length ? `. HQ read ${found.length === 1 ? 'its date' : `${found.length} dates`} from YouTube for now (${found.slice(0, 2).map((v) => slash(yt.get(v.id)!)).join(', ')})` : ''}`, fix: 'save the Publish Date on each in the Content Center when the YouTube link is saved.', why: 'Without it the calendar shows the video under "No date yet" and the week\'s posted count misses it.', owner: 'Sienna' });
  }
  const unchecked = src.clips.filter((x) => x.status === 'Needs Review' && !siennaChecked(x));
  if (unchecked.length) out.push({ problem: 'Clips waiting for Sienna\'s check', data: `${unchecked.length} clip${unchecked.length === 1 ? '' : 's'} in Needs Review have no "Sienna QA" note`, fix: 'her editor (scheduled task) checks them with the 17-point list; only the ones she passes come to you.', why: 'Alex approves only final videos (content-system.md).', owner: 'Sienna' });
  const mainNotFriday = c.pipeline.filter((r) => r.channel === 'Alex Woung' && ['approved', 'script'].includes(r.stage) && inRange(r.recordingDate, c.fweek.start, c.fweek.end) && dow(r.recordingDate) !== 5);
  if (mainNotFriday.length) out.push({ problem: 'Alex Woung recording dates are not on Friday', data: `${mainNotFriday.length} approved Alex Woung idea${mainNotFriday.length === 1 ? '' : 's'} this week record on ${[...new Set(mainNotFriday.map((r) => new Date(`${r.recordingDate}T12:00:00Z`).toLocaleDateString('en-US', { weekday: 'long', timeZone: 'UTC' })))].join(', ')}: their dates were set before the Friday rule (11/28) or by the old Content Center (it still sets the Sunday)`, fix: 'move each to its Friday on the video page (Schedule → Recording date); HQ\'s Approve & schedule already sets the Friday.', why: 'Alex records Alex Woung videos on a Friday (Alex, 11/28).', owner: 'Sienna' });
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
    if (!isChannel(channel)) return { status: 400, error: 'Pick the channel first (Content for: Alex Woung or Alex Woung Raw).' };
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
export async function contentView(at: Pick<HqAirtable, 'list'>, db: Db, baseId: string, opts: { refresh?: boolean; history?: boolean } = {}) {
  const src = await cachedContent(at, db, opts.refresh);
  return { ...buildContent(src, baseId, Date.now(), { history: opts.history }), overlaps: OVERLAPS, log: await contentLog(db) };
}
/** GET /content/summary (Today's card): counts and the Friday count vs target, from the same cache. */
export async function contentSummary(at: Pick<HqAirtable, 'list'>, db: Db, baseId: string) {
  const v = buildContent(await cachedContent(at, db), baseId);
  return { counts: v.counts, friday: { date: v.friday.date, channels: v.friday.channels.map((c) => ({ key: c.key, label: c.label, ready: c.ready, approved: c.approved, target: c.target })) } };
}

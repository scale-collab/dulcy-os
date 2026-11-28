// HQ Content parity (Alex, 2026-11-28: "the entire content center" in HQ, so he never opens the Airtable
// Content Center). The Content Center pieces HQ did not have yet, each wired the way the Content Center
// does it (airtable/custom-elements/content-center/source.tsx); audit: hq/content-parity-2026-11-28.md.
//   - Settings (the gear, "Content scheduling settings"): Content Automation Settings, both channels'
//     records in one write, the same fields, clamps and the fixed Alex Woung cadence (2 a week, 2 days apart).
//   - "+ Add content idea": Title, Description, Idea Decision "Needs Review", Content Source "Manual Idea",
//     Content Channel (the Content Center's dates boxes are not saved by it either, so HQ has none).
//   - "Content for" (Content Channel), Recording / Publish Date (only once the idea is approved).
//   - The YouTube boxes: Save YouTube details (title, description, chapters or empty).
//   - The trash button: delete this one content record from Airtable, after Alex confirms (never the
//     Frame.io files, OpusClip projects, YouTube videos or posts).
//   - The video's clips shortlist (the review panel's Clips tab: score, verified copy, preview, notes,
//     transcript, the OpusClip project link) and, per post draft, the Reddit community, the composer link,
//     the newsletter's branded HTML preview and the previous thumbnail. Read only.
// The clip review buttons themselves are contentReview.ts (Final review); the shortlist here is read only.
// Owner only; same-origin
// writes (server.ts). Every write is logged in hq_content_log. Nothing here posts, schedules or calls n8n.
import type { Db } from '../db/pool.js';
import type { AirtableRecord } from '../providers/airtable.js';
import type { HqAirtable } from './decisions.js';
import { CF, CONTENT, SETTINGS } from '../agents/sienna.js';
import { CHANNELS, CLIPS, CC_DEFAULT_SETTINGS, KL, SF_CC, XF, _resetContentCache, ccSettingsOf, ideaNeedsApproval, type CcChannelSettings, type Channel } from './content.js';
import { AF, DF, DISTRIBUTION, contentItemDetail, type RunResult } from './contentActions.js';

/** Content Channels / Content Clips fields only these pieces read. */
export const PF = { previousThumbnailUrl: 'fldlQMtp6d4MuiiAn', clipSnapshot: 'fldG9gklzS07bEbrz', clipTranscript: 'fldL2TMrJ9rnwXltx', queueReceipt: 'fld1BFhcLfquycPTC' } as const;
/** The Content Center's REDDIT_COMMUNITIES (the draft's subreddit is picked from its record id). */
export const REDDIT_COMMUNITIES = ['Coldemailing', 'ColdEmailsForLiving', 'EmailOutreach'] as const;

export type ContentAt = HqAirtable & { updateMany?: (t: string, rows: { id: string; fields: Record<string, unknown> }[]) => Promise<void>; remove?: (t: string, id: string) => Promise<void> };
export interface CcDeps { at: ContentAt; db: Db; by: string }

const s = (v: unknown): string => (Array.isArray(v) ? s(v[0]) : v === undefined || v === null ? '' : typeof v === 'object' ? String((v as any).name ?? (v as any).id ?? '') : String(v)).trim();
const ids = (v: unknown): string[] => (Array.isArray(v) ? v : []).map((x: any) => (typeof x === 'string' ? x : x?.id)).filter((x): x is string => typeof x === 'string' && /^rec[A-Za-z0-9]{14}$/.test(x));
const isChannel = (c: unknown): c is Channel => (CHANNELS as readonly string[]).includes(String(c));
const REC = /^rec[A-Za-z0-9]{14}$/;
const https = (u: string) => (/^https:\/\//.test(u) && !/airtable\.com/i.test(u) ? u : '');
async function log(db: Db, by: string, action: string, id: string, title: string, changes: { field: string; from: unknown; to: unknown }[]) {
  await db.query(`INSERT INTO hq_content_log (actor, action, record_id, title, changes) VALUES ($1,$2,$3,$4,$5)`, [by, action, id, title.slice(0, 200), JSON.stringify(changes)]);
}

// ---------- pure ports of the Content Center's helpers ----------
/** redditCommunityForRecord, unchanged. */
export function redditCommunityForRecord(id: string): string {
  let hash = 0;
  for (const ch of String(id ?? '')) hash = ((hash * 31) + ch.charCodeAt(0)) >>> 0;
  return REDDIT_COMMUNITIES[hash % REDDIT_COMMUNITIES.length];
}
function escapeNewsletterHtml(value: string): string {
  return value.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[c] || c));
}
/** newsletterHtml, unchanged: the branded email the newsletter approval prepares (shown, copied; never sent from here). */
export function newsletterHtml(title: string, body: string): string {
  const paragraphs = body.split(/\n{2,}/).map((part) => part.trim()).filter(Boolean);
  const content = paragraphs.map((paragraph, index) => {
    const safe = escapeNewsletterHtml(paragraph).replace(/\n/g, '<br/>');
    return index === 0
      ? `<p style="margin:0 0 22px;font-size:19px;line-height:1.65;color:#1e293b;font-weight:600">${safe}</p>`
      : `<p style="margin:0 0 20px;font-size:16px;line-height:1.75;color:#334155">${safe}</p>`;
  }).join('');
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body style="margin:0;background:#f4f1ff;font-family:Inter,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif"><div style="display:none;max-height:0;overflow:hidden">A practical breakdown from Alexander Woung.</div><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f4f1ff;padding:34px 14px"><tr><td align="center"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:640px;background:#ffffff;border-radius:24px;overflow:hidden;box-shadow:0 18px 50px rgba(46,16,101,.12)"><tr><td style="padding:30px 38px;background:linear-gradient(135deg,#6d28d9,#9333ea);color:#fff"><div style="font-size:13px;letter-spacing:2px;text-transform:uppercase;font-weight:800;opacity:.85">Alexander Woung</div><h1 style="margin:14px 0 0;font-size:34px;line-height:1.18;letter-spacing:-1px">${escapeNewsletterHtml(title || 'A practical growth breakdown')}</h1></td></tr><tr><td style="padding:38px">${content || '<p style="font-size:16px;line-height:1.75;color:#334155">Newsletter copy is being prepared.</p>'}<table role="presentation" cellspacing="0" cellpadding="0" style="margin:30px 0"><tr><td style="border-radius:12px;background:#7c3aed"><a href="https://dulcy.io" style="display:inline-block;padding:15px 22px;color:#fff;text-decoration:none;font-weight:800;font-size:15px">Build a predictable outbound system →</a></td></tr></table><p style="margin:28px 0 0;font-size:15px;line-height:1.7;color:#475569">Talk soon,<br><strong>Alex</strong></p></td></tr><tr><td style="padding:24px 38px;background:#f8fafc;border-top:1px solid #e2e8f0;font-size:12px;line-height:1.6;color:#64748b">You received this because you subscribed to the Dulcy newsletter.<br><a href="{{unsubscribe_url}}" style="color:#6d28d9">Unsubscribe</a> · Dulcy Media LLC</td></tr></table></td></tr></table></body></html>`;
}
/** Where to post a manual draft by hand (the Content Center's "Open X composer / LinkedIn / r/…" link). */
export function composeUrl(platform: string, body: string, id: string): string {
  if (/twitter|^x$/i.test(platform)) return `https://x.com/intent/post?text=${encodeURIComponent(body.slice(0, 2000))}`;
  if (/linkedin/i.test(platform)) return 'https://www.linkedin.com/feed/';
  if (/reddit/i.test(platform)) return `https://www.reddit.com/r/${redditCommunityForRecord(id)}/submit?selftext=true`;
  return '';
}
/** currentReview, unchanged: the clip's verified review snapshot, or null. */
export function currentReview(clipId: string, snapshot: string, opusId: string, parents: string[]): any {
  try {
    const c = JSON.parse(snapshot || 'null');
    return c && c.mode === 'current-render-v1' && c.id === clipId && parents.length === 1 && c.parentId === parents[0] && opusId === `${c.projectId}.${c.originalClipId}`
      && Number.isSafeInteger(c.version) && c.version > 0 && c.final?.renderReady === true && typeof c.final.reviewGeneration === 'string'
      && /^[A-Za-z0-9]+$/.test(c.final.clipId) && /^https:\/\/signed-ext\.cdn\.opus\.pro\//.test(c.final.url || '') ? c : null;
  } catch { return null; }
}
// ---------- distributionCompletion, unchanged (display only: never calls a provider or writes) ----------
export interface CompletionRow { id: string; platform: string; outputType: string; title: string; body: string; media: string; account: string; approval: string; status: string; scheduledAt: string; postUrl: string; parentIds: string[]; queueReceipt: string }
export interface CompletionInput { id: string; finalAssetUrl: string; youtubeUrl: string; publishingStatus: string; publishDate: string; requiredIds: string[]; channels: string[]; rows: CompletionRow[]; now: number }
const QUEUE_MAX_AGE_MS = 24 * 60 * 60 * 1000;
const completionUrl = (value: string) => { try { const u = new URL(value); return u.protocol === 'https:' && Boolean(u.hostname); } catch { return false; } };
const queueContentKey = (row: CompletionRow) => JSON.stringify([row.platform, row.outputType, row.title, row.body, row.media, row.account]);
function verifiedAutomationQueue(row: CompletionRow, parentId: string, now: number): boolean {
  try {
    const q = JSON.parse(row.queueReceipt);
    const checked = Date.parse(q.verifiedAt), expires = Date.parse(q.validUntil), scheduled = Date.parse(q.scheduledAt);
    return row.platform === 'Reddit' && row.status === 'Draft' && !/denied|rejected|failed|cancelled|canceled|blocked/i.test(row.approval)
      && q.version === 1 && q.kind === 'browser-automation' && q.enabled === true && q.userApproved === true
      && typeof q.automationId === 'string' && q.automationId.length > 10 && typeof q.contextVersion === 'string' && q.contextVersion.length > 10
      && q.recordId === row.id && q.parentId === parentId && q.contentKey === queueContentKey(row)
      && typeof q.destination === 'string' && /^r\/[A-Za-z0-9_]+$/.test(q.destination)
      && Number.isFinite(checked) && Number.isFinite(expires) && Number.isFinite(scheduled)
      && checked <= now && expires > now && expires > checked && expires - checked <= QUEUE_MAX_AGE_MS && scheduled > now && expires <= scheduled
      && (!row.scheduledAt || Date.parse(row.scheduledAt) === scheduled);
  } catch { return false; }
}
export function distributionCompletion(input: CompletionInput) {
  const result = { complete: false, scheduled: 0, published: 0, automationQueued: 0, total: input.requiredIds.length, reason: '' };
  const fail = (reason: string) => ({ ...result, reason });
  if (!completionUrl(input.finalAssetUrl) || !completionUrl(input.youtubeUrl)) return fail('Finished video or YouTube destination is missing.');
  const longFormReady = input.publishingStatus === 'Published' || (input.publishingStatus === 'Scheduled' && Number.isFinite(Date.parse(input.publishDate)));
  if (!longFormReady) return fail('Verify the long-form publication or schedule.');
  if (!input.requiredIds.length || !input.channels.length) return fail('The required distribution outputs are not established.');
  if (new Set(input.requiredIds).size !== input.requiredIds.length) return fail('Reconcile duplicate distribution links.');
  const rows: CompletionRow[] = [];
  for (const id of input.requiredIds) {
    const matches = input.rows.filter((row) => row.id === id && row.parentIds.includes(input.id));
    if (matches.length !== 1) return fail('A required distribution record is missing or ambiguous.');
    rows.push(matches[0]);
  }
  const channelPlatform: Record<string, string> = { Instagram: 'Instagram', 'YouTube Shorts': 'YouTube', 'X / Twitter': 'X', Reddit: 'Reddit', LinkedIn: 'LinkedIn', Blog: 'Blog', Resource: 'Resource', Newsletter: 'Newsletter' };
  if (input.channels.some((c) => !channelPlatform[c] || !rows.some((row) => row.platform === channelPlatform[c]))) return fail('A selected distribution channel has no output.');
  if (input.rows.some((row) => row.parentIds.includes(input.id) && !input.requiredIds.includes(row.id))) return fail('Reconcile the distribution manifest.');
  for (const row of rows) {
    if (/denied|rejected|failed|cancelled|canceled|blocked/i.test(row.approval) || /failed|cancelled|canceled|blocked/i.test(row.status)) return fail('A required output is blocked or failed.');
    if (row.status === 'Published' && completionUrl(row.postUrl)) { result.published++; continue; }
    if (row.status === 'Scheduled' && row.approval === 'Approved' && Number.isFinite(Date.parse(row.scheduledAt))) { result.scheduled++; continue; }
    if (verifiedAutomationQueue(row, input.id, input.now)) { result.automationQueued++; continue; }
    return fail(row.platform === 'Reddit' ? 'Reddit queue verification is missing, expired or changed.' : 'A required output still needs a verified schedule or published URL.');
  }
  return { ...result, complete: true, reason: '' };
}
export const completionDetail = (v: ReturnType<typeof distributionCompletion>) =>
  `${v.scheduled} scheduled, ${v.published} published${v.automationQueued ? `, ${v.automationQueued} Reddit queued via automation (not natively scheduled or published)` : ''}. Individual publication statuses remain unchanged.`;

/** The settings panel's input clamps, then its save rule (Alex Woung: 2 videos a week, 2 days apart, fixed). Pure. */
export function clampSettings(ch: Channel, x: Record<string, unknown>, current: CcChannelSettings): CcChannelSettings {
  const n = (k: string, lo: number, hi: number, fb: number) => Math.max(lo, Math.min(hi, Number(x[k]) || fb));
  const out: CcChannelSettings = {
    videosPerWeek: n('videosPerWeek', 1, 7, 1), minimumSpacingDays: n('minimumSpacingDays', 1, 14, 1), reviewThreshold: n('reviewThreshold', 0, 100, 0),
    minimumClipScore: n('minimumClipScore', 0, 100, 0), clipsPerWeek: n('clipsPerWeek', 1, 7, 1),
    autoScheduleThreshold: current.autoScheduleThreshold, // read and written back unchanged: the panel has no box for it
  };
  return ch === 'Alex Woung' ? { ...out, videosPerWeek: 2, minimumSpacingDays: 2 } : out;
}

// ---------- Settings ----------
const SETTINGS_READ = Object.values(SF_CC);
/** GET /content/settings: each channel's values as the Content Center loads them, and whether its record exists. */
export async function contentSettings(at: Pick<HqAirtable, 'list'>) {
  const { settings, ids: rid } = ccSettingsOf(await at.list(SETTINGS, 'TRUE()', SETTINGS_READ, 20));
  return { channels: CHANNELS.map((ch) => ({ channel: ch, found: !!rid[ch], fixed: ch === 'Alex Woung', ...settings[ch] })), defaults: CC_DEFAULT_SETTINGS };
}
/**
 * "Save settings": the Content Center's saveIdeaAutomationSettings. Both channels' records in one write:
 * Enabled ✓, Videos Per Week, Clips Per Week, Auto Schedule Score, Manual Review Score, Minimum Spacing Days,
 * Minimum Clip Score. A channel with no record refuses the whole save (nothing written), like the Content Center.
 */
export async function saveContentSettings(d: CcDeps, body: Record<string, unknown>): Promise<RunResult> {
  const input = (body.settings && typeof body.settings === 'object' ? body.settings : {}) as Record<string, Record<string, unknown>>;
  const { settings, ids: rid } = ccSettingsOf(await d.at.list(SETTINGS, 'TRUE()', SETTINGS_READ, 20));
  const missing = CHANNELS.find((ch) => !rid[ch]);
  if (missing) return { status: 409, error: `Missing automation settings record for ${missing}.` };
  const next = Object.fromEntries(CHANNELS.map((ch) => [ch, clampSettings(ch, { ...settings[ch], ...(input[ch] ?? {}) }, settings[ch])])) as Record<Channel, CcChannelSettings>;
  const rows = CHANNELS.map((ch) => ({ id: rid[ch], fields: {
    [SF_CC.enabled]: true, [SF_CC.videosPerWeek]: next[ch].videosPerWeek, [SF_CC.clipsPerWeek]: next[ch].clipsPerWeek, [SF_CC.autoScheduleThreshold]: next[ch].autoScheduleThreshold,
    [SF_CC.reviewThreshold]: next[ch].reviewThreshold, [SF_CC.minimumSpacingDays]: next[ch].minimumSpacingDays, [SF_CC.minimumClipScore]: next[ch].minimumClipScore,
  } }));
  if (d.at.updateMany) await d.at.updateMany(SETTINGS, rows);
  else for (const r of rows) await d.at.update(SETTINGS, r.id, r.fields);
  const keys = Object.keys(next['Alex Woung']) as (keyof CcChannelSettings)[];
  await log(d.db, d.by, 'settings_save', rid['Alex Woung'], 'Content Automation Settings',
    CHANNELS.flatMap((ch) => keys.filter((k) => settings[ch][k] !== next[ch][k]).map((k) => ({ field: `${ch} · ${k}`, from: settings[ch][k], to: next[ch][k] }))));
  _resetContentCache();
  return { status: 200, message: 'Settings saved to Airtable; Sienna and n8n use them from now on.' };
}

// ---------- + Add content idea ----------
/** createManualIdea: a new Content Channels row waiting for Alex's decision. Returns the new record id. */
export async function addIdea(d: CcDeps, body: Record<string, unknown>): Promise<RunResult & { id?: string }> {
  const title = String(body.title ?? '').trim();
  const description = String(body.description ?? '').trim();
  const channel = body.channel === undefined ? 'Alex Woung' : String(body.channel);
  if (!title) return { status: 400, error: 'Give the idea a title.' };
  if (title.length > 300) return { status: 400, error: 'Keep the title to 300 characters.' };
  if (description.length > 5000) return { status: 400, error: 'Keep the notes to 5,000 characters.' };
  if (!isChannel(channel)) return { status: 400, error: 'Pick Alex Woung or Alex Woung Raw.' };
  const fields: Record<string, unknown> = { [CF.title]: title };
  if (description) fields[CF.description] = description;
  fields[CF.ideaDecision] = 'Needs Review';
  fields[CF.source] = 'Manual Idea';
  fields[CF.channel] = channel;
  const id = await d.at.create(CONTENT, fields);
  await log(d.db, d.by, 'idea_add', id, title, [{ field: 'Title', from: '', to: title }, { field: 'Idea Decision', from: '', to: 'Needs Review' }, { field: 'Content Source', from: '', to: 'Manual Idea' }, { field: 'Content Channel', from: '', to: channel }]);
  _resetContentCache();
  return { status: 200, id, message: 'Idea added for review. Approve it to give it recording and publishing dates.' };
}

// ---------- "Content for", the dates, the YouTube boxes, delete ----------
const ITEM_READ = [CF.title, CF.channel, CF.ideaDecision, CF.stage, CF.script, CF.recordingDate, XF.publishDate, XF.youtubeUrl, CF.ytTitle, XF.youtubeDescription, AF.youtubeChapters];
async function fresh(at: Pick<HqAirtable, 'get'>, id: string) {
  if (!REC.test(id)) return null;
  const r = await at.get(CONTENT, id, ITEM_READ);
  if (!r) return null;
  const f = r.fields;
  return {
    title: s(f[CF.title]) || 'Untitled content', channel: s(f[CF.channel]), decision: s(f[CF.ideaDecision]), stage: s(f[CF.stage]), hasScript: !!s(f[CF.script]),
    recording: s(f[CF.recordingDate]).slice(0, 10), publish: s(f[XF.publishDate]).slice(0, 10), youtubeUrl: s(f[XF.youtubeUrl]),
    ytTitle: s(f[CF.ytTitle]), ytDescription: s(f[XF.youtubeDescription]), chapters: s(f[AF.youtubeChapters]),
  };
}
const notFound: RunResult = { status: 404, error: 'video not found' };

/** setContentChannel: Content Channel. Allowed at any stage (an idea needs it before it can be approved). */
export async function setChannel(d: CcDeps, id: string, body: Record<string, unknown>): Promise<RunResult> {
  const channel = String(body.channel ?? '');
  if (!isChannel(channel)) return { status: 400, error: 'Pick Alex Woung or Alex Woung Raw.' };
  const r = await fresh(d.at, id);
  if (!r) return notFound;
  if (r.channel === channel) return { status: 200, message: `${channel} is already set.` };
  await d.at.update(CONTENT, id, { [CF.channel]: channel });
  await log(d.db, d.by, 'set_channel', id, r.title, [{ field: 'Content Channel', from: r.channel, to: channel }]);
  _resetContentCache();
  return { status: 200, message: `${channel} selected. The automations for this video use that channel from now on.` };
}

/** updateScheduleDate: Recording Date or Publish Date (empty clears it). Refused until the idea is approved. */
export async function setDate(d: CcDeps, id: string, body: Record<string, unknown>): Promise<RunResult> {
  const kind = body.kind === 'recording' ? 'recording' : body.kind === 'publish' ? 'publish' : '';
  const value = String(body.date ?? '').trim();
  if (!kind) return { status: 400, error: 'kind must be recording or publish' };
  if (value && (!/^\d{4}-\d{2}-\d{2}$/.test(value) || new Date(`${value}T12:00:00Z`).toISOString().slice(0, 10) !== value)) return { status: 400, error: 'That is not a date.' };
  const r = await fresh(d.at, id);
  if (!r) return notFound;
  if (ideaNeedsApproval({ decision: r.decision, stage: r.stage, hasScript: r.hasScript, youtubeUrl: r.youtubeUrl })) return { status: 409, error: 'Approve this idea before assigning dates.' };
  const field = kind === 'recording' ? CF.recordingDate : XF.publishDate;
  const label = kind === 'recording' ? 'Recording Date' : 'Publish Date';
  await d.at.update(CONTENT, id, { [field]: value || null });
  await log(d.db, d.by, kind === 'recording' ? 'set_recording_date' : 'set_publish_date', id, r.title, [{ field: label, from: kind === 'recording' ? r.recording : r.publish, to: value || null }]);
  _resetContentCache();
  return { status: 200, message: `${kind === 'recording' ? 'Recording' : 'Publish'} date ${value ? 'updated' : 'cleared'}.` };
}

/** saveYouTubeDetails: YouTube Title, YouTube Description, YouTube Chapters (empty = cleared). Both title and description are needed. */
export async function saveYoutube(d: CcDeps, id: string, body: Record<string, unknown>): Promise<RunResult> {
  const title = String(body.title ?? '').trim();
  const description = String(body.description ?? '').trim();
  const chapters = String(body.chapters ?? '').trim();
  if (!title || !description) return { status: 400, error: 'The title and the description are both needed.' };
  if (title.length > 500 || description.length > 20_000 || chapters.length > 5000) return { status: 400, error: 'That is too long.' };
  const r = await fresh(d.at, id);
  if (!r) return notFound;
  if (ideaNeedsApproval({ decision: r.decision, stage: r.stage, hasScript: r.hasScript, youtubeUrl: r.youtubeUrl })) return { status: 409, error: 'Approve the idea first.' };
  if (r.youtubeUrl) return { status: 409, error: 'The video is already on YouTube: change the title there.' };
  await d.at.update(CONTENT, id, { [CF.ytTitle]: title, [XF.youtubeDescription]: description, [AF.youtubeChapters]: chapters || null });
  await log(d.db, d.by, 'youtube_save', id, r.title, [
    { field: 'YouTube Title', from: r.ytTitle, to: title }, { field: 'YouTube Description', from: r.ytDescription ? '(was set)' : '', to: '(saved)' }, { field: 'YouTube Chapters', from: r.chapters ? '(was set)' : '', to: chapters ? '(saved)' : null },
  ]);
  _resetContentCache();
  return { status: 200, message: 'YouTube title, description and chapters saved.' };
}

/**
 * deleteContentRecord: removes this one Content Channels record from Airtable, only with confirm: true
 * (Alex pressed Delete, then confirmed). Frame.io files, OpusClip projects, YouTube videos and published
 * posts are not touched. What was deleted is kept in hq_content_log.
 */
export async function deleteItem(d: CcDeps, id: string, body: Record<string, unknown>): Promise<RunResult> {
  if (body.confirm !== true) return { status: 400, error: 'Confirm the delete first.' };
  if (!d.at.remove) return { status: 503, error: 'Deleting is not available on this server. Nothing was deleted.' };
  const r = await fresh(d.at, id);
  if (!r) return notFound;
  await d.at.remove(CONTENT, id);
  await log(d.db, d.by, 'delete', id, r.title, [{ field: 'Record', from: [r.title, r.channel, r.decision, r.recording && `record ${r.recording}`, r.publish && `publish ${r.publish}`, r.youtubeUrl].filter(Boolean).join(' · '), to: 'deleted' }]);
  _resetContentCache();
  return { status: 200, message: `${r.title} was deleted from Airtable. External videos, clips and published posts were not deleted.` };
}

// ---------- the video page: everything the Content Center's panel shows ----------
export interface ShortClip { id: string; name: string; score: number | null; status: string; review: string; verifiedClipId: string; version: number | null; preview: string; opusId: string; notes: string; transcript: string }
export function shortClipOf(x: AirtableRecord): ShortClip {
  const f = x.fields;
  const parents = ids(f[KL.parent]);
  const c = currentReview(x.id, s(f[PF.clipSnapshot]), s(f[KL.opusId]), parents);
  const score = Number(s(f[KL.score]));
  return {
    id: x.id, name: s(f[KL.name]) || 'Untitled clip', score: s(f[KL.score]) !== '' && Number.isFinite(score) ? score : null, status: s(f[KL.status]),
    review: s(c?.status) || 'Not yet verified', verifiedClipId: s(c?.final?.clipId), version: c ? Number(c.version) : null,
    preview: https(s(c?.final?.url) || s(f[KL.media])), opusId: s(f[KL.opusId]), notes: s(f[KL.notes]).slice(0, 4000),
    transcript: (s(c?.final?.transcript) || s(f[PF.clipTranscript])).slice(0, 6000),
  };
}
/**
 * GET /content/items/<rec>: the round-5 detail plus what the Content Center's panel also shows: the clips
 * shortlist and the OpusClip project link, the previous thumbnail, the channel, the dates, the channel's
 * Clips Per Week and Minimum Clip Score from Settings, and per draft its Reddit community, composer link and
 * (newsletter) branded HTML.
 */
export async function contentItemFull(at: Pick<HqAirtable, 'get' | 'list'>, db: Db, id: string) {
  const base = await contentItemDetail(at, db, id);
  if (!('item' in base) || !base.item) return base;
  const [extra, settingsRows] = await Promise.all([
    at.get(CONTENT, id, [CF.channel, CF.recordingDate, XF.publishDate, PF.previousThumbnailUrl, XF.shortProjectId, XF.clips, XF.finalAssetUrl, XF.youtubeUrl, XF.publishingStatus, XF.distributionRecords, XF.distributionChannels]),
    at.list(SETTINGS, 'TRUE()', SETTINGS_READ, 20),
  ]);
  const f = extra?.fields ?? {};
  // The Content Center's "distribution complete" check, from the video's own Content Distribution rows (fresh).
  const required = ids(f[XF.distributionRecords]);
  const distRows = required.length
    ? (await at.list(DISTRIBUTION, `OR(${required.slice(0, 100).map((x) => `RECORD_ID()='${x}'`).join(',')})`, [DF.parent, DF.platform, DF.outputType, DF.title, DF.body, DF.media, DF.channel, DF.approval, DF.publishing, DF.scheduledAt, DF.postUrl, PF.queueReceipt], 100))
    : [];
  const completion = distributionCompletion({
    id, finalAssetUrl: s(f[XF.finalAssetUrl]), youtubeUrl: s(f[XF.youtubeUrl]), publishingStatus: s(f[XF.publishingStatus]), publishDate: s(f[XF.publishDate]),
    requiredIds: Array.isArray(f[XF.distributionRecords]) ? (f[XF.distributionRecords] as unknown[]).map((x: any) => (typeof x === 'string' ? x : x?.id)) : [],
    channels: Array.isArray(f[XF.distributionChannels]) ? (f[XF.distributionChannels] as unknown[]).map(s) : [], now: Date.now(),
    rows: distRows.map((x) => ({ id: x.id, platform: s(x.fields[DF.platform]), outputType: s(x.fields[DF.outputType]), title: s(x.fields[DF.title]), body: s(x.fields[DF.body]), media: s(x.fields[DF.media]),
      account: s(x.fields[DF.channel]), approval: s(x.fields[DF.approval]), status: s(x.fields[DF.publishing]), scheduledAt: s(x.fields[DF.scheduledAt]), postUrl: s(x.fields[DF.postUrl]),
      parentIds: ids(x.fields[DF.parent]), queueReceipt: s(x.fields[PF.queueReceipt]) })),
  });
  const channel = s(f[CF.channel]);
  const set = ccSettingsOf(settingsRows).settings[isChannel(channel) ? channel : 'Alex Woung'];
  const clipIds = ids(f[XF.clips]);
  const clips = clipIds.length
    ? (await at.list(CLIPS, `OR(${clipIds.slice(0, 100).map((x) => `RECORD_ID()='${x}'`).join(',')})`, [KL.name, KL.opusId, KL.media, KL.score, KL.status, KL.parent, KL.notes, PF.clipSnapshot, PF.clipTranscript], 100))
      .filter((x) => ids(x.fields[KL.parent]).includes(id)).map(shortClipOf).sort((a, b) => (b.score ?? 0) - (a.score ?? 0))
    : [];
  const project = s(f[XF.shortProjectId]);
  const item = base.item;
  return {
    status: 200,
    item: {
      ...item,
      channel, recordingDate: s(f[CF.recordingDate]).slice(0, 10), publishDate: s(f[XF.publishDate]).slice(0, 10),
      thumbnail: { ...item.thumbnail, previousUrl: https(s(f[PF.previousThumbnailUrl])) },
      brief: { ...item.brief, minScore: set.minimumClipScore },
      settings: { clipsPerWeek: set.clipsPerWeek, minimumClipScore: set.minimumClipScore },
      completion: { complete: completion.complete, detail: completion.complete ? completionDetail(completion) : completion.reason },
      clips, opusUrl: project && /^[A-Za-z0-9_-]+$/.test(project) ? `https://clip.opus.pro/clip/${encodeURIComponent(project)}` : '',
      distribution: {
        ...item.distribution,
        platforms: item.distribution.platforms.map((p) => ({
          ...p,
          drafts: p.drafts.map((x) => {
            const reddit = /reddit/i.test(x.platform);
            const newsletter = /newsletter/i.test(x.outputType) || /newsletter/i.test(x.platform);
            return { ...x, community: reddit ? redditCommunityForRecord(x.id) : '', composeUrl: composeUrl(x.platform, x.body, x.id), html: newsletter ? newsletterHtml(x.title, x.body) : '' };
          }),
        })),
      },
    },
  };
}

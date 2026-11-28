// HQ Content, round 5 (Alex, 2026-11-28): "I don't want what's in Airtable to stay in Airtable. I want
// to build the content center inside Dulcy HQ." Every button the Airtable Content Center offers on a
// video is an HQ button here, and each one does exactly what the Content Center's button does
// (airtable/custom-elements/content-center/source.tsx):
//   - a Content Automation Action value (runAction → table.updateRecordAsync({action: {name}})): the
//     Airtable automation "Content OS Action Script" hands it to n8n (Frame.io Sync, OpusClip Submit and
//     Refresh, Generate Distribution Pack). HQ writes the same value through the Airtable API.
//   - an n8n webhook with the same JSON body (Generate Script, Generate Thumbnail, Revise Thumbnail,
//     Prepare YouTube Details, the distribution-pack retry, the Newsletter / Framer approvals, scheduling).
//   - a plain field write (Editing Route, Thumbnail Status "Approved", YouTube URL, the repurposing brief,
//     a draft's Approval Status, Scheduled At, Published URL).
// The same guards: one automation at a time (an action already in the field refuses every runAction
// button), the short-clips job identity check, no thumbnail change once the video is on YouTube.
// Distribution: each platform's generated post, Approve per platform, and where / when it was posted
// with its views, likes and comments (Postgres hq_content_posts; Airtable has no stats fields).
// Draft-only (RULES, Sienna): Approve in HQ writes only Approval Status. It never schedules. Scheduling
// is its own button, for an approved Instagram / YouTube Shorts post with a time Alex picks, and runs the
// Content Center's own scheduling flow ([Content OS] Schedule Approved Social Posts via OpusClip). HQ
// never posts. Every write is logged in hq_content_log. Owner only (the route answers 403 to members).
// The webhook URLs are secret (n8n webhooks without auth): CONTENT_HOOK_<NAME> on the server, or read
// once from n8n's API (N8N_API_KEY). Tests pass a fake fetch; nothing is called from tests.
import { randomUUID } from 'node:crypto';
import type { Db } from '../db/pool.js';
import type { Config } from '../config.js';
import type { AirtableRecord } from '../providers/airtable.js';
import type { HqAirtable } from './decisions.js';
import { CF, CONTENT } from '../agents/sienna.js';
import { n8nClient } from '../agents/rileyN8n.js';
import { XF, _resetContentCache, ideaNeedsApproval, youtubeId } from './content.js';

export const DISTRIBUTION = 'tblDWJrmIcBJDykIP';
/** Content Distribution field IDs (the Content Center's DISTRIBUTION_FIELD_IDS + airtable/SCHEMA.md). */
export const DF = {
  parent: 'fldUdKNjcqwvqBzxY', clip: 'fldriLaqCUX3haL1f', platform: 'fldewqlnxtWis5Q5w', outputType: 'fld6lY8PlmVQNZpQS', title: 'fldT93ZRdvNr3rs5H',
  body: 'fldH9ERJJHO2OkMA7', media: 'fldtRc7ET8RnG3N63', approval: 'fld0WhqvYvMkFukhh', publishing: 'fld6epkJRCbu0QAaz', scheduledAt: 'fldMNlwmFKOLBcCUl',
  postUrl: 'fldFZjCNtv9VmPTnI', lastError: 'fldPwxzKoOJL56iv7', channel: 'fld8uc1h8BYjHHjjg', externalId: 'fldZr1Ypb9I9Ik6vg',
} as const;
/** Content Channels fields only the actions read (beyond content.ts XF). */
export const AF = { requestedClipCount: 'fldFyh2QYx2W9NXnM', minimumClipScore: 'fldmKqA7cCbgPUiti', youtubeChapters: 'fld7hWhOY2lNk0AfR' } as const;
/** The Content Center's DISTRIBUTION_CHANNELS. Resource stays off (RESOURCE_AUTOMATION_ENABLED = false: no paid Gamma API yet). */
export const DISTRIBUTION_CHANNELS = ['Instagram', 'YouTube Shorts', 'Reddit', 'X / Twitter', 'LinkedIn', 'Blog', 'Newsletter'] as const;

// ---------- the n8n webhooks the Content Center calls ----------
export type HookKey = 'script' | 'thumbnail' | 'thumbnailRevise' | 'youtube' | 'distribution' | 'schedule' | 'newsletter' | 'framer' | 'clipReview';
/** Which n8n workflow and webhook node each Content Center fetch() goes to (automations/n8n-live-2026-11-17/INDEX.md). */
export const HOOKS: Record<HookKey, { env: string; workflow: string; node: string; name: string }> = {
  // Two identical copies of this workflow exist (M6KIF3… and _kaI9…); which one the Content Center calls is UNKNOWN. Both do the same job.
  script: { env: 'SCRIPT', workflow: 'M6KIF3eRsCf3hQTIK3cNI', node: 'Script Webhook', name: '[Content OS] Generate Teleprompter Script' },
  thumbnail: { env: 'THUMBNAIL', workflow: '_gspysiMZKsqCp_-y6c4U', node: 'Thumbnail Webhook', name: '[Content OS] Generate Thumbnail' },
  thumbnailRevise: { env: 'THUMBNAIL_REVISE', workflow: 'j81dfHMkgsyfKFmbwK3PV', node: 'Thumbnail Webhook', name: '[Content OS] Revise Thumbnail' },
  youtube: { env: 'YOUTUBE', workflow: '4lHpW8_Nw-JfSDwK43iwy', node: 'YouTube Details Webhook', name: '[Content OS] Prepare YouTube Details' },
  distribution: { env: 'DISTRIBUTION', workflow: 'yrm5yHj5EJSuQVGVjwUEE', node: 'Distribution Webhook', name: '[Content OS] Generate Distribution Pack' },
  schedule: { env: 'SCHEDULE', workflow: 'oN0UJDUMKr12HMSe3i9lj', node: 'Webhook', name: '[Content OS] Schedule Approved Social Posts' },
  newsletter: { env: 'NEWSLETTER', workflow: 'oBtBDGl7uZ6FR2yUM9qWL', node: 'Newsletter Webhook', name: '[Content OS] Prepare Newsletter Preview' },
  framer: { env: 'FRAMER', workflow: 'mjM9mwPtY8vumhGioR8cQ', node: 'Framer Draft Webhook', name: '[Content OS] Publish Framer Blog Draft' },
  // Final-clip review (contentReview.ts): the Content Center's "Refresh current preview" / "Approve reviewed copy" / "Reject copy".
  clipReview: { env: 'CLIP_REVIEW', workflow: '1IWw0WOC8gwgWvnVZbeKf', node: 'Current Review Wake', name: '[Content OS] Current Clip Review and Preview' },
};
export type HookCfg = Pick<Config, 'contentHooks' | 'contentWebhookBase' | 'n8nApiKey' | 'n8nBaseUrl'>;
const hookCache = new Map<HookKey, string>();
export function _resetHookCache() { hookCache.clear(); }
const fail = (status: number, error: string) => Object.assign(new Error(error), { status });

/** The webhook URL: CONTENT_HOOK_<NAME>, else the path of the workflow's webhook node read from n8n (cached). */
export async function hookUrl(cfg: HookCfg, key: HookKey, fetchImpl: typeof fetch = fetch): Promise<string> {
  const h = HOOKS[key];
  const set = cfg.contentHooks?.[h.env];
  if (set) return set;
  const hit = hookCache.get(key);
  if (hit) return hit;
  if (!cfg.n8nApiKey) throw fail(503, `The n8n webhook for ${h.name} is not set on this server (CONTENT_HOOK_${h.env}). Nothing was sent.`);
  const wf = await n8nClient(cfg.n8nBaseUrl, cfg.n8nApiKey, fetchImpl).get(h.workflow);
  const node = (wf?.nodes ?? []).find((n: any) => n?.type === 'n8n-nodes-base.webhook' && n?.name === h.node);
  const path = String(node?.parameters?.path ?? '');
  if (!/^[A-Za-z0-9_-][A-Za-z0-9_/-]{0,200}$/.test(path)) throw fail(503, `Could not find the webhook of ${h.name} in n8n. Nothing was sent.`);
  const url = `${cfg.contentWebhookBase}/webhook/${path}`;
  hookCache.set(key, url);
  return url;
}
/** POST the Content Center's JSON body to the webhook. Returns the status and the JSON answer (null when none). */
export async function callHook(cfg: HookCfg, key: HookKey, body: Record<string, unknown>, fetchImpl: typeof fetch = fetch): Promise<{ status: number; ok: boolean; data: any }> {
  const url = await hookUrl(cfg, key, fetchImpl);
  let r: Response;
  try { r = await fetchImpl(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(30_000) }); }
  catch { throw fail(503, `n8n did not answer (${HOOKS[key].name}). It may or may not have started: check before trying again.`); }
  const text = await r.text().catch(() => '');
  let data: any = null; try { data = text ? JSON.parse(text) : null; } catch { /* not JSON */ }
  return { status: r.status, ok: r.ok, data };
}

// ---------- the record, read fresh for every action ----------
const s = (v: unknown): string => (Array.isArray(v) ? s(v[0]) : v === undefined || v === null ? '' : typeof v === 'object' ? String((v as any).name ?? (v as any).id ?? '') : String(v)).trim();
const ids = (v: unknown): string[] => (Array.isArray(v) ? v : []).map((x: any) => (typeof x === 'string' ? x : x?.id)).filter((x): x is string => typeof x === 'string' && /^rec[A-Za-z0-9]{14}$/.test(x));
const names = (v: unknown): string[] => (Array.isArray(v) ? v.map(s).filter(Boolean) : []);
const READ = [CF.title, CF.channel, CF.script, CF.stage, CF.ideaDecision, CF.ytTitle, CF.description, CF.transcript, XF.rawFolderUrl, XF.finalFolderUrl, XF.finalAssetUrl, XF.finalAssetId,
  XF.message, XF.action, XF.editingRoute, XF.thumbnailStatus, XF.finalThumbnailUrl, XF.youtubeUrl, XF.youtubeDescription, XF.shortProjectId, XF.shortSourceAssetId, XF.shortJobState,
  XF.clips, XF.distributionChannels, XF.distributionRecords, XF.distributionStatus, AF.requestedClipCount, AF.minimumClipScore, AF.youtubeChapters];

export interface Rec {
  id: string; title: string; channel: string; script: string; stage: string; decision: string; ytTitle: string; description: string; transcript: string;
  rawFolder: string; finalFolder: string; finalAsset: string; finalId: string; message: string; action: string; route: string; thumbStatus: string; thumbUrl: string;
  youtubeUrl: string; ytDescription: string; chapters: string; shortProjectId: string; shortSourceId: string; shortState: string; clipIds: string[];
  channels: string[]; distributionIds: string[]; distributionStatus: string; requestedClipCount: number | null; minimumClipScore: number | null;
}
export function recOf(r: AirtableRecord): Rec {
  const f = r.fields;
  const n = (x: unknown) => { const v = Number(s(x)); return s(x) !== '' && Number.isFinite(v) ? v : null; };
  return {
    id: r.id, title: s(f[CF.title]) || 'Untitled', channel: s(f[CF.channel]), script: s(f[CF.script]), stage: s(f[CF.stage]), decision: s(f[CF.ideaDecision]),
    ytTitle: s(f[CF.ytTitle]), description: s(f[CF.description]), transcript: s(f[CF.transcript]),
    rawFolder: s(f[XF.rawFolderUrl]), finalFolder: s(f[XF.finalFolderUrl]), finalAsset: s(f[XF.finalAssetUrl]), finalId: s(f[XF.finalAssetId]), message: s(f[XF.message]),
    action: s(f[XF.action]), route: s(f[XF.editingRoute]), thumbStatus: s(f[XF.thumbnailStatus]), thumbUrl: s(f[XF.finalThumbnailUrl]), youtubeUrl: s(f[XF.youtubeUrl]),
    ytDescription: s(f[XF.youtubeDescription]), chapters: s(f[AF.youtubeChapters]), shortProjectId: s(f[XF.shortProjectId]), shortSourceId: s(f[XF.shortSourceAssetId]),
    shortState: s(f[XF.shortJobState]), clipIds: ids(f[XF.clips]), channels: names(f[XF.distributionChannels]), distributionIds: ids(f[XF.distributionRecords]),
    distributionStatus: s(f[XF.distributionStatus]), requestedClipCount: n(f[AF.requestedClipCount]), minimumClipScore: n(f[AF.minimumClipScore]),
  };
}
/** The Content Center's shortClipJob (all three fields are in this base, so "available" is always true here). Pure. */
export function shortJob(r: Pick<Rec, 'shortProjectId' | 'shortState' | 'shortSourceId' | 'finalId'>) {
  const submitted = Boolean(r.shortProjectId || r.shortState || r.shortSourceId);
  const sourceMatches = Boolean(r.finalId && r.shortSourceId && r.finalId === r.shortSourceId);
  return { submitted, sourceMatches, projectId: r.shortProjectId, blocked: submitted && (!sourceMatches || !r.shortProjectId || /submitting|error|failed|uncertain/i.test(r.shortState)) };
}
export const recordingSynced = (message: string) => /recorded footage found|recording found|raw video found/i.test(message);
export const longFormSubmitted = (message: string) => /long-form edit project (?:created|submitted)|long-form edit (?:submitted|processing)/i.test(message);
export const isDavinci = (route: string) => /manual editor|davinci resolve/i.test(route);

// ---------- the Content Center's YouTube template (its fallback when the n8n flow is unavailable), ported as is ----------
export function conciseVideoSummary(title: string, source: string): string {
  const cleaned = source.replace(/\s+/g, ' ').trim();
  if (cleaned) {
    const sentences = cleaned.match(/[^.!?]+[.!?]+/g)?.slice(0, 3).join(' ').trim();
    return (sentences || cleaned).slice(0, 700).trim();
  }
  return `In this video, I break down ${title || 'the topic'} and show you how to apply it. You will learn the practical steps, avoid the common mistakes, and turn the lesson into a repeatable system that creates better results with less guesswork.`;
}
export function buildYouTubeDescription(channel: string, title: string, source: string, chapters: string): string {
  const summary = conciseVideoSummary(title, source);
  const chapterBlock = chapters.trim() ? `\n\n***\n\nChapters:\n${chapters.trim()}` : '';
  if (channel === 'Alex Woung Raw') {
    return `${summary}${chapterBlock}\n\n***\n\nConnect with me:\n\nInstagram: https://www.instagram.com/alexander.woung\nTwitter: https://x.com/alexwoung\nLinkedIn: https://www.linkedin.com/in/alexanderwoung/\nYoutube Main: https://www.youtube.com/@alexwoung`;
  }
  const bridge = `This is one part of building a predictable growth system. See how it fits into the best way to grow an online business as a beginner: https://www.youtube.com/watch?v=PhPoRP3eyMc`;
  return `${bridge}\n\n***\n\nDo you want done-for-you cold email:\nhttps://dulcy.io\n\nJoin Agency Ignition:\nhttps://agencyignition.io/ (7-day free trial)\n\nWant help to hit a $100k/mo (1:1):\nhttps://dealflux.io/\n\n***\n\n${summary}${chapterBlock}\n\n***\n\nConnect with me:\nInstagram: https://www.instagram.com/alexander.woung\nTwitter: https://x.com/alexwoung\nLinkedIn: https://www.linkedin.com/in/alexanderwoung/`;
}

// ---------- the video buttons ----------
export const RUN_KEYS = ['setupFrame', 'syncFrame', 'routeOpus', 'routeDavinci', 'editFull', 'script', 'thumbnail', 'thumbnailRevise', 'thumbnailApprove',
  'youtubeDetails', 'youtubeUrl', 'shortClips', 'refreshClips', 'posts', 'postsBrief', 'postsRetry'] as const;
export type RunKey = (typeof RUN_KEYS)[number];
export const isRunKey = (x: unknown): x is RunKey => (RUN_KEYS as readonly string[]).includes(String(x));
/** Content Automation Action values (the field's 4 choices). */
const FIELD_ACTION: Partial<Record<RunKey, string>> = { setupFrame: 'Sync Frame.io', syncFrame: 'Sync Frame.io', editFull: 'Submit to OpusClip', shortClips: 'Submit to OpusClip', refreshClips: 'Refresh Opus Clips', posts: 'Generate Distribution Pack' };
/** The Content Center's runAction buttons refuse while another automation runs (the action field is set). */
const RUN_ACTION: ReadonlySet<RunKey> = new Set<RunKey>(['setupFrame', 'syncFrame', 'editFull', 'shortClips', 'refreshClips', 'posts', 'script', 'thumbnail', 'youtubeDetails']);

export interface RunDeps { at: Pick<HqAirtable, 'get' | 'update' | 'list'>; db: Db; cfg: HookCfg; fetchImpl?: typeof fetch; by: string; now?: number }
export interface RunResult { status: number; error?: string; message?: string }
type Change = { field: string; from: unknown; to: unknown };

async function log(db: Db, by: string, action: string, id: string, title: string, changes: Change[]) {
  await db.query(`INSERT INTO hq_content_log (actor, action, record_id, title, changes) VALUES ($1,$2,$3,$4,$5)`, [by, action, id, title.slice(0, 200), JSON.stringify(changes)]);
}

/**
 * One Content Center button on one video, done the same way the Content Center does it. Fresh read of the
 * record first (never the cache); refuses (409) when the Content Center would not offer the button.
 */
export async function runContentAction(d: RunDeps, id: string, key: RunKey, body: Record<string, unknown> = {}): Promise<RunResult> {
  if (!/^rec[A-Za-z0-9]{14}$/.test(id)) return { status: 400, error: 'not a content record id' };
  const raw = await d.at.get(CONTENT, id, READ);
  if (!raw) return { status: 404, error: 'video not found' };
  const r = recOf(raw);
  if (ideaNeedsApproval({ decision: r.decision, stage: r.stage, hasScript: !!r.script, youtubeUrl: r.youtubeUrl })) return { status: 409, error: 'Approve the idea first.' };
  if (RUN_ACTION.has(key) && r.action) return { status: 409, error: `"${r.action}" is still running for this video. Wait for it to finish (Refresh), then try again.` };
  const job = shortJob(r);
  const clipCount = r.clipIds.length;
  const refuse = (error: string): RunResult => ({ status: 409, error });
  const writeField = async (fields: Record<string, unknown>, changes: Change[], message: string): Promise<RunResult> => {
    await d.at.update(CONTENT, id, fields);
    await log(d.db, d.by, `run_${key}`, id, r.title, changes);
    _resetContentCache();
    return { status: 200, message };
  };
  const field = (action: string, message: string) => writeField({ [XF.action]: action }, [{ field: 'Content Automation Action', from: r.action, to: action }], message);
  const hook = async (hk: HookKey, payload: Record<string, unknown>) => {
    const res = await callHook(d.cfg, hk, payload, d.fetchImpl);
    await log(d.db, d.by, `run_${key}`, id, r.title, [{ field: `n8n ${HOOKS[hk].name}`, from: '', to: `HTTP ${res.status}${res.ok ? '' : ' (not accepted)'}` }]);
    _resetContentCache();
    return res;
  };

  switch (key) {
    case 'setupFrame':
      if (r.rawFolder) return refuse('The Frame.io folders already exist. Use "Sync Frame.io".');
      return field('Sync Frame.io', 'Setting up the Frame.io folders. Refresh in a minute.');
    case 'syncFrame':
      return field('Sync Frame.io', 'Sync Frame.io started. Refresh in a minute.');
    case 'routeOpus':
    case 'routeDavinci': {
      if (r.finalAsset) return refuse('The finished video is already in Frame.io; the editing route no longer matters.');
      const route = key === 'routeOpus' ? 'OpusClip' : 'Manual Editor'; // the field's choices: OpusClip, Manual Editor (= DaVinci Resolve)
      return writeField({ [XF.editingRoute]: route }, [{ field: 'Editing Route', from: r.route, to: route }], `${key === 'routeOpus' ? 'OpusClip' : 'DaVinci Resolve'} selected.`);
    }
    case 'editFull':
      if (r.finalAsset) return refuse('The finished video is already in Frame.io.');
      if (r.route !== 'OpusClip') return refuse('Choose OpusClip as the editing route first.');
      if (!recordingSynced(r.message)) return refuse('Sync Frame.io first so OpusClip can find the recording.');
      if (longFormSubmitted(r.message)) return refuse('The full edit was already sent to OpusClip.');
      return field('Submit to OpusClip', 'Sent to OpusClip for the full-video edit (no shorts yet). Refresh in a minute.');
    case 'shortClips':
      if (!r.finalAsset || !r.finalId || job.blocked || job.submitted) return refuse('Short-clips job identity must be verified before this action. No duplicate project was submitted.');
      return field('Submit to OpusClip', 'Creating short clips in OpusClip. Sienna checks each clip before it comes to you.');
    case 'refreshClips':
      if (r.finalAsset && (job.blocked || !job.projectId || !job.sourceMatches)) return refuse('Short-clips job identity must be verified before this action. No duplicate project was submitted.');
      return field('Refresh Opus Clips', 'Checking OpusClip for finished clips. Refresh in a minute.');
    case 'posts':
      if (!clipCount) return refuse('There are no clips yet: create the short clips first.');
      if (!r.channels.length) return refuse('Choose where the posts go first.');
      return field('Generate Distribution Pack', 'Making the posts (captions, Reddit drafts, newsletter). They come back here for your review; nothing is posted.');
    case 'postsBrief': {
      const count = Math.max(1, Math.min(50, Math.round(Number(body.count) || 3)));
      const minimumScore = Math.max(0, Math.min(100, Math.round(Number(body.minScore) || 85)));
      const want = Array.isArray(body.channels) ? body.channels.map(String) : [];
      const channels = DISTRIBUTION_CHANNELS.filter((c) => want.includes(c));
      if (!channels.length) return { status: 400, error: 'Pick at least one place for the posts.' };
      const fields: Record<string, unknown> = { [AF.requestedClipCount]: count, [AF.minimumClipScore]: minimumScore, [XF.distributionChannels]: [...channels] };
      const changes: Change[] = [{ field: 'Requested Clip Count', from: r.requestedClipCount, to: count }, { field: 'Minimum Clip Score', from: r.minimumClipScore, to: minimumScore }, { field: 'Distribution Channels', from: r.channels.join(', '), to: channels.join(', ') }];
      if (!r.action && clipCount > 0) { fields[XF.action] = 'Generate Distribution Pack'; changes.push({ field: 'Content Automation Action', from: '', to: 'Generate Distribution Pack' }); }
      return writeField(fields, changes, clipCount > 0 ? `Saved. The posts are being made from clips scoring ${minimumScore} or higher.` : `Saved. Only clips scoring ${minimumScore} or higher will be used once clips are ready.`);
    }
    case 'postsRetry': {
      if (r.action !== 'Generate Distribution Pack') return refuse('Retry is only for a posts run that is stuck.');
      const res = await hook('distribution', { recordId: id, action: 'Generate Distribution Pack' });
      return res.ok ? { status: 200, message: 'Retry accepted, not completed. Check the drafts before approving. Do not retry while this run is working.' } : { status: 502, error: 'Retry outcome not confirmed. Check the existing run before trying again.' };
    }
    case 'script': {
      const res = await hook('script', { recordId: id, action: 'Generate Script' });
      return res.ok ? { status: 200, message: 'Script generation started. The teleprompter draft shows here when it is ready.' } : { status: 502, error: `Script automation returned ${res.status}.` };
    }
    case 'thumbnail': {
      if (r.youtubeUrl) return refuse('The video is already on YouTube; the thumbnail is final.');
      if (/generating/i.test(r.thumbStatus)) return refuse('A thumbnail is already being made.');
      const res = await hook('thumbnail', { recordId: id, action: 'Generate Thumbnail' });
      return res.ok ? { status: 200, message: 'Thumbnail generation started. It shows here for review when it is ready.' } : { status: 502, error: s(res.data?.message) || `Thumbnail request was not accepted (${res.status}).` };
    }
    case 'thumbnailRevise': {
      if (r.youtubeUrl) return refuse('The video is already on YouTube; the thumbnail is final.');
      if (/generating/i.test(r.thumbStatus)) return refuse('A thumbnail is already being made.');
      if (!r.thumbUrl) return refuse('Generate a thumbnail before requesting changes.');
      const changes = String(body.changes ?? '').trim();
      if (!changes || changes.length > 2000) return { status: 400, error: 'Describe the thumbnail changes (1–2,000 characters).' };
      const requestId = randomUUID();
      const res = await hook('thumbnailRevise', { recordId: id, action: 'Revise Thumbnail', changes, requestId, expectedThumbnailUrl: r.thumbUrl });
      if (res.status !== 202 || res.data?.accepted !== true || res.data?.requestId !== requestId) return { status: 502, error: s(res.data?.message) || `Thumbnail request was not accepted (${res.status}).` };
      return { status: 200, message: 'Request accepted. The new thumbnail shows here for review when it is ready.' };
    }
    case 'thumbnailApprove':
      if (r.youtubeUrl) return refuse('The video is already on YouTube; the thumbnail is final.');
      if (/generating/i.test(r.thumbStatus)) return refuse('A thumbnail is still being made.');
      if (!r.thumbUrl) return refuse('There is no thumbnail to approve yet.');
      return writeField({ [XF.thumbnailStatus]: 'Approved' }, [{ field: 'Thumbnail Status', from: r.thumbStatus, to: 'Approved' }], 'Thumbnail approved. Next: the YouTube title and description.');
    case 'youtubeDetails': {
      const res = await hook('youtube', { recordId: id, action: 'Prepare YouTube Details' });
      if (res.ok) return { status: 200, message: 'Writing the YouTube title and description. vidIQ scores and refines them when YouTube Studio opens.' };
      // The Content Center's fallback when the n8n flow answers with an error: its own channel template.
      const title = r.ytTitle || r.title;
      const description = r.ytDescription || buildYouTubeDescription(r.channel, title, r.description || r.script || r.transcript, r.chapters);
      await d.at.update(CONTENT, id, { [CF.ytTitle]: title, [XF.youtubeDescription]: description });
      await log(d.db, d.by, 'run_youtubeDetails_template', id, r.title, [{ field: 'YouTube Title', from: r.ytTitle, to: title }, { field: 'YouTube Description', from: r.ytDescription ? '(kept)' : '', to: r.ytDescription ? '(kept)' : '(channel template)' }]);
      _resetContentCache();
      return { status: 200, message: 'Prepared with the channel template: the AI flow was unavailable, so review them before uploading.' };
    }
    case 'youtubeUrl': {
      const url = String(body.url ?? '').trim();
      if (!youtubeId(url)) return { status: 400, error: 'Paste the video\'s YouTube link (youtube.com/watch?v=… or youtu.be/…).' };
      return writeField({ [XF.youtubeUrl]: url }, [{ field: 'YouTube URL', from: r.youtubeUrl, to: url }], 'YouTube link saved. Next: the short clips.');
    }
  }
  return { status: 400, error: 'unknown action' };
}

// ---------- Distribution: per platform, review, approve, schedule (explicit), record where / when / stats ----------
export interface Draft {
  id: string; platform: string; outputType: string; title: string; body: string; media: string; approval: string; publishing: string;
  scheduledAt: string; postUrl: string; lastError: string; hasClip: boolean; canSchedule: boolean;
}
export interface PostStats { slot: string; platform: string; url: string; postedOn: string; views: number | null; likes: number | null; comments: number | null; by: string; at: string }
const DRAFT_READ = Object.values(DF);
function draftOf(x: AirtableRecord): Draft & { parents: string[] } {
  const f = x.fields;
  const platform = s(f[DF.platform]);
  return {
    id: x.id, platform, outputType: s(f[DF.outputType]), title: s(f[DF.title]).slice(0, 500), body: s(f[DF.body]).slice(0, 20_000), media: /^https:\/\//.test(s(f[DF.media])) ? s(f[DF.media]) : '',
    approval: s(f[DF.approval]), publishing: s(f[DF.publishing]), scheduledAt: s(f[DF.scheduledAt]), postUrl: /^https:\/\//.test(s(f[DF.postUrl])) ? s(f[DF.postUrl]) : '',
    lastError: s(f[DF.lastError]).slice(0, 500), hasClip: ids(f[DF.clip]).length > 0, canSchedule: /^(Instagram|YouTube)$/.test(platform) && ids(f[DF.clip]).length > 0,
    parents: ids(f[DF.parent]),
  };
}
/** The Content Center's draft platform → the HQ platform group (one row per platform; TikTok has no draft in the Content OS). */
export const PLATFORM_GROUP = (platform: string, outputType: string): string =>
  /^YouTube$/.test(platform) ? 'YouTube Shorts' : /^X$/.test(platform) ? 'X' : /framer/i.test(platform) || /blog/i.test(outputType) ? 'Blog' : platform || 'Other';
export const PLATFORM_ORDER = ['Instagram', 'TikTok', 'YouTube Shorts', 'Reddit', 'X', 'LinkedIn', 'Blog', 'Newsletter'];
const CHANNEL_GROUP: Record<string, string> = { Instagram: 'Instagram', 'YouTube Shorts': 'YouTube Shorts', Reddit: 'Reddit', 'X / Twitter': 'X', LinkedIn: 'LinkedIn', Blog: 'Blog', Newsletter: 'Newsletter' };

async function postsOf(db: Db, id: string): Promise<PostStats[]> {
  const q = await db.query(`SELECT slot, platform, post_url, posted_on::text AS posted_on, views, likes, comments, updated_by, updated_at FROM hq_content_posts WHERE content_id=$1 ORDER BY id`, [id]);
  return q.rows.map((x) => ({ slot: x.slot, platform: x.platform, url: x.post_url, postedOn: x.posted_on ?? '', views: x.views, likes: x.likes, comments: x.comments, by: x.updated_by, at: new Date(x.updated_at).toISOString() }));
}

/** GET /content/items/<rec>: what the video page needs beyond the list (YouTube copy, the posts brief, Distribution). Fresh reads. */
export async function contentItemDetail(at: Pick<HqAirtable, 'get' | 'list'>, db: Db, id: string) {
  if (!/^rec[A-Za-z0-9]{14}$/.test(id)) return { status: 400, error: 'not a content record id' };
  const raw = await at.get(CONTENT, id, READ);
  if (!raw) return { status: 404, error: 'video not found' };
  const r = recOf(raw);
  const drafts = r.distributionIds.length
    ? (await at.list(DISTRIBUTION, `OR(${r.distributionIds.slice(0, 100).map((x) => `RECORD_ID()='${x}'`).join(',')})`, DRAFT_READ, 100)).map(draftOf).filter((x) => x.parents.includes(id))
    : [];
  const stats = await postsOf(db, id);
  // One group per platform: the platforms chosen for this video, the platforms with a draft, and TikTok (posted by hand; no draft in the Content OS).
  const groups = new Set<string>(['TikTok', ...r.channels.map((c) => CHANNEL_GROUP[c]).filter(Boolean), ...drafts.map((x) => PLATFORM_GROUP(x.platform, x.outputType))]);
  const platforms = PLATFORM_ORDER.filter((p) => groups.has(p)).concat([...groups].filter((p) => !PLATFORM_ORDER.includes(p)))
    .map((p) => {
      const mine = drafts.filter((x) => PLATFORM_GROUP(x.platform, x.outputType) === p).map(({ parents: _p, ...x }) => ({ ...x, stats: stats.find((st) => st.slot === x.id) ?? null }));
      return { platform: p, drafts: mine, manual: p === 'TikTok' ? (stats.find((st) => st.slot === 'TikTok') ?? null) : null, chosen: r.channels.some((c) => CHANNEL_GROUP[c] === p) };
    });
  const posted = platforms.filter((p) => p.drafts.some((x) => x.publishing === 'Published' || x.stats?.url) || p.manual?.url).length;
  return {
    status: 200,
    item: {
      id, title: r.title, running: r.action,
      youtube: { title: r.ytTitle, description: r.ytDescription, chapters: r.chapters, url: /^https:\/\//.test(r.youtubeUrl) ? r.youtubeUrl : '' },
      thumbnail: { url: /^https:\/\//.test(r.thumbUrl) ? r.thumbUrl : '', status: r.thumbStatus },
      brief: { channels: r.channels.filter((c) => (DISTRIBUTION_CHANNELS as readonly string[]).includes(c)), count: r.requestedClipCount ?? 3, minScore: r.minimumClipScore ?? 85, options: [...DISTRIBUTION_CHANNELS], clips: r.clipIds.length },
      distribution: { status: r.distributionStatus, platforms, posted, totals: totalsOf(stats) },
    },
  };
}
export function totalsOf(stats: PostStats[]) {
  const sum = (k: 'views' | 'likes' | 'comments') => stats.reduce((a, x) => a + (x[k] ?? 0), 0);
  return { posts: stats.filter((x) => x.url || x.postedOn).length, views: sum('views'), likes: sum('likes'), comments: sum('comments') };
}

/** Approval Status choices in this base: Needs Review, Approved, Rejected (the Content Center's "Needs changes" lands on Rejected). */
export async function decideDraft(d: RunDeps, draftId: string, verdict: 'approve' | 'changes'): Promise<RunResult> {
  if (!/^rec[A-Za-z0-9]{14}$/.test(draftId)) return { status: 400, error: 'not a draft id' };
  const raw = await d.at.get(DISTRIBUTION, draftId, DRAFT_READ);
  if (!raw) return { status: 404, error: 'draft not found' };
  const x = draftOf(raw);
  if (/resource/i.test(x.outputType) || /gamma|resource/i.test(x.platform)) return { status: 409, error: 'Resources are coming soon: the Gamma automation is paused until the Gamma API plan is connected.' };
  if (/^(Scheduled|Publishing|Published)$/.test(x.publishing)) return { status: 409, error: `Already ${x.publishing.toLowerCase()}.` };
  const to = verdict === 'approve' ? 'Approved' : 'Rejected';
  const newsletter = /newsletter/i.test(x.outputType) || /newsletter/i.test(x.platform);
  const framer = /framer/i.test(x.platform) && /blog/i.test(x.outputType);
  if (verdict === 'approve' && (newsletter || framer)) await hookUrl(d.cfg, newsletter ? 'newsletter' : 'framer', d.fetchImpl); // 503 before any write
  await d.at.update(DISTRIBUTION, draftId, { [DF.approval]: to });
  await log(d.db, d.by, verdict === 'approve' ? 'draft_approve' : 'draft_changes', x.parents[0] ?? draftId, `${x.platform} ${x.outputType}: ${x.title}`.slice(0, 200), [{ field: 'Approval Status', from: x.approval, to }]);
  _resetContentCache();
  if (verdict !== 'approve') return { status: 200, message: 'Saved: this draft needs changes.' };
  // The Content Center's approve for a newsletter / Framer blog: a preview or an unpublished draft. Nothing is sent or published.
  if (newsletter) {
    const res = await callHook(d.cfg, 'newsletter', { recordId: draftId }, d.fetchImpl);
    await log(d.db, d.by, 'draft_newsletter_preview', x.parents[0] ?? draftId, x.title.slice(0, 200), [{ field: `n8n ${HOOKS.newsletter.name}`, from: '', to: `HTTP ${res.status}` }]);
    if (!res.ok || !res.data?.ok) return { status: 502, error: s(res.data?.message) || 'Approved, but the newsletter preview could not be prepared.' };
    const n = Number(res.data.subscriberCount ?? 0);
    return { status: 200, message: `Approved: branded HTML prepared for ${n} subscribed email${n === 1 ? '' : 's'} from Close. Nothing was sent.` };
  }
  if (framer) {
    const res = await callHook(d.cfg, 'framer', { recordId: draftId }, d.fetchImpl);
    await log(d.db, d.by, 'draft_framer_draft', x.parents[0] ?? draftId, x.title.slice(0, 200), [{ field: `n8n ${HOOKS.framer.name}`, from: '', to: `HTTP ${res.status}` }]);
    if (!res.ok) return { status: 502, error: 'Approved, but its Framer draft could not be created.' };
    return { status: 200, message: 'Approved: an unpublished Framer draft was created for your final review.' };
  }
  return { status: 200, message: x.canSchedule ? 'Approved. Nothing is scheduled yet: pick a time and press Schedule, or post it by hand and record it below.' : 'Approved. Post it by hand, then record where it went below.' };
}

/**
 * Schedule an approved Instagram / YouTube Shorts post at the time Alex picks: Scheduled At, then the
 * Content Center's scheduling flow (the same webhook and body its approve calls). Only on Alex's press.
 */
export async function scheduleDraft(d: RunDeps, draftId: string, when: string): Promise<RunResult> {
  if (!/^rec[A-Za-z0-9]{14}$/.test(draftId)) return { status: 400, error: 'not a draft id' };
  const t = Date.parse(when);
  const now = d.now ?? Date.now();
  if (!Number.isFinite(t) || t < now + 10 * 60_000) return { status: 400, error: 'Pick a time at least 10 minutes from now.' };
  if (t > now + 120 * 86_400_000) return { status: 400, error: 'Pick a time within the next 120 days.' };
  const raw = await d.at.get(DISTRIBUTION, draftId, DRAFT_READ);
  if (!raw) return { status: 404, error: 'draft not found' };
  const x = draftOf(raw);
  if (!x.canSchedule) return { status: 409, error: 'Only Instagram and YouTube Shorts posts with a clip are scheduled through OpusClip. Post this one by hand.' };
  if (x.approval !== 'Approved') return { status: 409, error: 'Approve the post first.' };
  if (x.publishing !== 'Draft') return { status: 409, error: `Already ${x.publishing.toLowerCase() || 'in progress'}.` };
  const iso = new Date(t).toISOString();
  await hookUrl(d.cfg, 'schedule', d.fetchImpl); // not set up on this server = 503 before anything is written
  await d.at.update(DISTRIBUTION, draftId, { [DF.scheduledAt]: iso });
  const res = await callHook(d.cfg, 'schedule', { distributionRecordId: draftId }, d.fetchImpl).catch(() => ({ status: 0, ok: false, data: null }));
  await log(d.db, d.by, 'draft_schedule', x.parents[0] ?? draftId, `${x.platform} ${x.outputType}: ${x.title}`.slice(0, 200), [{ field: 'Scheduled At', from: x.scheduledAt, to: iso }, { field: `n8n ${HOOKS.schedule.name}`, from: '', to: `HTTP ${res.status}` }]);
  _resetContentCache();
  if (!res.ok) return { status: 502, error: 'The time is saved, but the scheduling flow did not confirm. The hourly scheduler picks it up; check it before trying again.' };
  return { status: 200, message: 'Scheduling started in OpusClip for that time.' };
}

/** A post URL for the platform (the Content Center checks Reddit, X and LinkedIn this way; HQ adds the others). Pure. */
export function postUrlOk(platform: string, url: string): boolean {
  const u = url.trim();
  const re: Record<string, RegExp> = {
    Reddit: /^https:\/\/(www\.|old\.)?reddit\.com\/r\//i, X: /^https:\/\/(www\.)?(x\.com|twitter\.com)\//i, LinkedIn: /^https:\/\/(www\.)?linkedin\.com\/(feed\/update|posts)\//i,
    Instagram: /^https:\/\/(www\.)?instagram\.com\/(p|reel|reels)\//i, TikTok: /^https:\/\/(www\.|vm\.|m\.)?tiktok\.com\//i, 'YouTube Shorts': /^https:\/\/(www\.|m\.)?(youtube\.com\/(shorts\/|watch\?)|youtu\.be\/)/i,
    Blog: /^https:\/\/[^\s/]+\.[^\s/]+\//i, Newsletter: /^https:\/\/[^\s/]+\.[^\s/]+\//i,
  };
  return !!re[platform]?.test(u) && u.length <= 500;
}

/**
 * "Complete distribution stats": where and when one platform's post went, with its views, likes and
 * comments. For a draft: the Content Center's "mark as published" write (Approval Status Approved,
 * Publishing Status Published, Published URL) when a new URL is given, plus the stats in HQ. TikTok has
 * no draft: HQ only. Recording a post never posts anything.
 */
export async function recordPost(d: RunDeps, id: string, b: Record<string, unknown>): Promise<RunResult> {
  if (!/^rec[A-Za-z0-9]{14}$/.test(id)) return { status: 400, error: 'not a content record id' };
  const slot = String(b.slot ?? '');
  const url = String(b.url ?? '').trim();
  const postedOn = String(b.postedOn ?? '').trim();
  if (postedOn && (!/^\d{4}-\d{2}-\d{2}$/.test(postedOn) || !Number.isFinite(Date.parse(`${postedOn}T12:00:00Z`)))) return { status: 400, error: 'The posted date is not a date.' };
  const num = (k: string) => { const v = b[k]; if (v === '' || v === null || v === undefined) return null; const n = Number(v); return Number.isInteger(n) && n >= 0 && n < 2_000_000_000 ? n : NaN; };
  const views = num('views'), likes = num('likes'), comments = num('comments');
  if ([views, likes, comments].some((x) => Number.isNaN(x))) return { status: 400, error: 'Views, likes and comments are whole numbers.' };
  let platform = 'TikTok';
  let title = '';
  if (slot !== 'TikTok') {
    if (!/^rec[A-Za-z0-9]{14}$/.test(slot)) return { status: 400, error: 'unknown platform slot' };
    const raw = await d.at.get(DISTRIBUTION, slot, DRAFT_READ);
    if (!raw) return { status: 404, error: 'draft not found' };
    const x = draftOf(raw);
    if (!x.parents.includes(id)) return { status: 400, error: 'This draft belongs to another video.' };
    platform = PLATFORM_GROUP(x.platform, x.outputType);
    title = `${x.platform} ${x.outputType}: ${x.title}`;
    if (url && !postUrlOk(platform, url)) return { status: 400, error: `Paste the published ${platform} post link.` };
    if (url && url !== x.postUrl) {
      await d.at.update(DISTRIBUTION, slot, { [DF.approval]: 'Approved', [DF.publishing]: 'Published', [DF.postUrl]: url });
      await log(d.db, d.by, 'draft_published', id, title.slice(0, 200), [{ field: 'Approval Status', from: x.approval, to: 'Approved' }, { field: 'Publishing Status', from: x.publishing, to: 'Published' }, { field: 'Published URL', from: x.postUrl, to: url }]);
    }
  } else {
    const v = await d.at.get(CONTENT, id, [CF.title]);
    if (!v) return { status: 404, error: 'video not found' };
    title = `TikTok: ${s(v.fields[CF.title])}`;
    if (url && !postUrlOk('TikTok', url)) return { status: 400, error: 'Paste the TikTok post link.' };
  }
  await d.db.query(`INSERT INTO hq_content_posts (content_id, slot, platform, post_url, posted_on, views, likes, comments, updated_by, updated_at)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9, now())
    ON CONFLICT (content_id, slot) DO UPDATE SET platform=EXCLUDED.platform, post_url=EXCLUDED.post_url, posted_on=EXCLUDED.posted_on, views=EXCLUDED.views, likes=EXCLUDED.likes, comments=EXCLUDED.comments, updated_by=EXCLUDED.updated_by, updated_at=now()`,
  [id, slot, platform, url, postedOn || null, views, likes, comments, d.by]);
  await log(d.db, d.by, 'post_stats', id, title.slice(0, 200), [{ field: `${platform} post`, from: '', to: [url, postedOn, views !== null ? `${views} views` : '', likes !== null ? `${likes} likes` : '', comments !== null ? `${comments} comments` : ''].filter(Boolean).join(' · ') }]);
  _resetContentCache();
  return { status: 200, message: `${platform} saved.` };
}

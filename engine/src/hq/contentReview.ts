// HQ Content, final clips (Alex, 2026-11-28: "For the final clip: yes, everything [move it into HQ]").
// The Airtable Content Center approves a final clip like this (requestCurrentReview in
// airtable/custom-elements/content-center/source.tsx):
//   1. it writes a Review Intent JSON on the Content Clips row (field Review Intent JSON), exactly
//      {schemaVersion, action, recordId, parentId, projectId, originalClipId, finalClipId, expectedVersion,
//       reviewGeneration, nonce}, action = refresh-current | approve-current | reject-current;
//   2. it POSTs {recordId} to the n8n webhook of "[Content OS] Current Clip Review and Preview"
//      (workflow 1IWw0WOC8gwgWvnVZbeKf, node "Current Review Wake");
//   3. n8n re-reads the row and refuses unless "Review Intent Author" (a last-modified-by field on Review
//      Intent JSON) is Alex: ownerIdentity {id: usrZ0Hn36coHFxw3D, email: team@dulcy.io}, checked in the
//      nodes "Read Current Parent Reference", "Parse Current Review Context" and "Build Current Review Commit".
// HQ does the same two steps through the engine's Airtable token, then READS BACK the author Airtable
// stamped. Alex's login → the Content Center's exact webhook body. Anyone else → the existing n8n check
// would refuse it, so HQ either signs the intent (CONTENT_REVIEW_SECRET set; n8n accepts it once the
// N8N_REVIEW_PATCH below is live) or stops and says so. Nothing is approved by HQ itself: n8n verifies the
// copy, records the decision and writes Clip Status, as for the Content Center.
// The full video has no approval in the Content Center: HQ's Approve only logs it, Request changes puts
// the note on Sienna's list. A clip's "Request changes" is the Content Center's "Reject copy" plus the note
// on Sienna's list (the intent has no room for a note: n8n checks its exact keys).
// Also here: the Gamma link box (saved in the video's Notes, where "Open Gamma" reads it) and the
// resource document made from Sienna's Gamma outline (Gamma's API needs a paid plan; Alex 2026-11-28:
// "If not, just make it a Google Doc / a PDF"). Owner only; nothing is posted or published.
import { createHmac, randomUUID } from 'node:crypto';
import type { Db } from '../db/pool.js';
import type { AirtableRecord } from '../providers/airtable.js';
import type { HqAirtable } from './decisions.js';
import { CF, CONTENT } from '../agents/sienna.js';
import { CLIPS, KL, XF, _resetContentCache, parsePrep } from './content.js';
import { HOOKS, callHook, type HookCfg } from './contentActions.js';

/** Content Clips fields the review uses beyond content.ts KL (airtable/SCHEMA.md; the Content Center's cf). */
export const RF = { intent: 'fldHPQdkRjYozUdGp', snapshot: 'fldG9gklzS07bEbrz', author: 'fldrkWwDR0fYL8TDx' } as const;
/** The n8n check's ownerIdentity (Validate Wake / Parse Current Review Context, read 2026-11-28). */
export const OWNER_IDENTITY = { id: 'usrZ0Hn36coHFxw3D', email: 'team@dulcy.io' } as const;
export type ReviewAction = 'refresh-current' | 'approve-current' | 'reject-current';
export const REVIEW_ACTION: Record<'refresh' | 'approve' | 'changes', ReviewAction> = { refresh: 'refresh-current', approve: 'approve-current', changes: 'reject-current' };

const s = (v: unknown): string => (Array.isArray(v) ? s(v[0]) : v === undefined || v === null ? '' : typeof v === 'object' ? String((v as any).name ?? (v as any).id ?? '') : String(v)).trim();
const ids = (v: unknown): string[] => (Array.isArray(v) ? v : []).map((x: any) => (typeof x === 'string' ? x : x?.id)).filter((x): x is string => typeof x === 'string' && /^rec[A-Za-z0-9]{14}$/.test(x));
const REC = /^rec[A-Za-z0-9]{14}$/;

// ---------- the Content Center's review rules, ported as is (pure) ----------
export interface Snapshot { mode: string; id: string; parentId: string; projectId: string; originalClipId: string; version: number; status?: string; final: { renderReady: boolean; reviewGeneration: string; clipId: string; url: string; transcript?: string } }
/** The Content Center's currentReview: the verified review snapshot of this clip, or null. Pure. */
export function currentReview(clip: { id: string; snapshot: string; opusId: string; parents: string[] }): Snapshot | null {
  try {
    const c = JSON.parse(clip.snapshot || 'null');
    return c && c.mode === 'current-render-v1' && c.id === clip.id && clip.parents.length === 1
      && c.parentId === clip.parents[0] && clip.opusId === `${c.projectId}.${c.originalClipId}`
      && Number.isSafeInteger(c.version) && c.version > 0 && c.final?.renderReady === true
      && typeof c.final.reviewGeneration === 'string' && /^[A-Za-z0-9]+$/.test(c.final.clipId)
      && /^https:\/\/signed-ext\.cdn\.opus\.pro\//.test(c.final.url || '') ? c : null;
  } catch { return null; }
}
/** The Content Center's finalSelection without a typed value: the verified copy, else the imported clip id. Pure. */
export const defaultFinalClipId = (clip: { id: string; snapshot: string; opusId: string; parents: string[] }) => currentReview(clip)?.final.clipId ?? clip.opusId.split('.')[1] ?? '';

/**
 * The Review Intent the Content Center writes, key for key and in the same order, with its own checks
 * and messages (requestCurrentReview). Pure (the nonce is passed in).
 */
export function buildReviewIntent(clip: { id: string; snapshot: string; opusId: string; parents: string[] }, action: ReviewAction, finalClipIdInput: string | undefined, nonce: string):
  { intent: { schemaVersion: 1; action: ReviewAction; recordId: string; parentId: string; projectId: string; originalClipId: string; finalClipId: string; expectedVersion: number; reviewGeneration: string | null; nonce: string } } | { error: string } {
  const original = /^(P[A-Za-z0-9]+)\.([A-Za-z0-9]+)$/.exec(clip.opusId);
  const snapshot = currentReview(clip);
  const finalClipId = String(finalClipIdInput ?? defaultFinalClipId(clip)).trim();
  if (!original || clip.parents.length !== 1 || !/^[A-Za-z0-9]+$/.test(finalClipId)) return { error: 'Choose the exact final clip ID within this original project.' };
  if (clip.snapshot && !snapshot) return { error: 'Review snapshot is inconsistent. Reconcile it before requesting changes.' };
  if (action !== 'refresh-current' && (!snapshot || finalClipId !== snapshot.final.clipId)) return { error: 'Refresh and review this selected copy before deciding.' };
  return {
    intent: {
      schemaVersion: 1, action, recordId: clip.id, parentId: clip.parents[0],
      projectId: original[1], originalClipId: original[2], finalClipId,
      expectedVersion: snapshot?.version ?? 0, reviewGeneration: snapshot?.final.reviewGeneration ?? null, nonce,
    },
  };
}
/** HQ's signature on the exact intent text it wrote (the patched n8n check recomputes it). Pure. */
export const reviewSig = (key: string, rawIntent: string) => createHmac('sha256', key).update(`content-review-v1|${rawIntent}`).digest('hex');
const isOwner = (a: unknown) => !!a && typeof a === 'object' && (a as any).id === OWNER_IDENTITY.id && (a as any).email === OWNER_IDENTITY.email;

/**
 * The n8n change HQ needs when the engine's token is not Alex's login (NOT applied; for Alex's ✅).
 * Text edits ({find, replace}) on four Code nodes of 1IWw0WOC8gwgWvnVZbeKf; each `find` occurs exactly once
 * in the live node (checked 2026-11-28). The owner check stays; a valid HQ signature counts as Alex.
 */
const HELPER = "const hqOk=raw=>{try{const g=$('Validate Wake').first().json.hqSig;if(typeof raw!=='string'||typeof g!=='string'||!/^[a-f0-9]{64}$/.test(g))return false;let k='';try{k=String($vars.CONTENT_REVIEW_SECRET??'')}catch(e){}if(k.length<32){try{k=String($env.CONTENT_REVIEW_SECRET??'')}catch(e){}}if(k.length<32)return false;const c=require('crypto'),want=c.createHmac('sha256',k).update('content-review-v1|'+raw).digest('hex');return c.timingSafeEqual(Buffer.from(want),Buffer.from(g))}catch(e){return false}};";
const CONTEXT_FIND = "const f=record?.fields??{};const a=f['Review Intent Author'];";
const CONTEXT_REPLACE = `${HELPER}const f=record?.fields??{};const a=hqOk(f['Review Intent JSON'])?ownerIdentity:f['Review Intent Author'];`;
// One text edit per node (the engine refuses two edits of the same node › path in one patch).
export const N8N_REVIEW_PATCH = {
  workflowId: '1IWw0WOC8gwgWvnVZbeKf',
  changes: [
    { node: 'Validate Wake', path: 'jsCode',
      find: "const id=$input.first().json.body?.recordId;if(typeof id!=='string'||!/^rec[A-Za-z0-9]+$/.test(id))throw Error('Invalid wake');return [{json:{recordId:id}}];",
      replace: "const b=$input.first().json.body??{},id=b.recordId;if(typeof id!=='string'||!/^rec[A-Za-z0-9]+$/.test(id))throw Error('Invalid wake');const hqSig=b.source==='hq'&&typeof b.hqSig==='string'&&/^[a-f0-9]{64}$/.test(b.hqSig)?b.hqSig:null;return [{json:{recordId:id,hqSig}}];" },
    { node: 'Read Current Parent Reference', path: 'jsCode',
      find: "const r=$input.first().json,a=r.fields?.['Review Intent Author'];",
      replace: `${HELPER}const r=$input.first().json,a=hqOk(r.fields?.['Review Intent JSON'])?ownerIdentity:r.fields?.['Review Intent Author'];` },
    { node: 'Parse Current Review Context', path: 'jsCode', find: CONTEXT_FIND, replace: CONTEXT_REPLACE },
    { node: 'Build Current Review Commit', path: 'jsCode', find: CONTEXT_FIND, replace: CONTEXT_REPLACE },
  ],
};

// ---------- the clips of one video (for its page) ----------
const CLIP_READ = [KL.name, KL.status, KL.notes, KL.score, KL.media, KL.opusId, KL.parent, RF.snapshot];
export interface ReviewClip { id: string; name: string; status: string; score: number | null; qa: string; watchUrl: string; finalClipId: string; verified: { version: number; clipId: string } | null; canDecide: boolean }
export function reviewClipOf(r: AirtableRecord): ReviewClip & { parents: string[] } {
  const f = r.fields;
  const c = { id: r.id, snapshot: s(f[RF.snapshot]), opusId: s(f[KL.opusId]), parents: ids(f[KL.parent]) };
  const snap = currentReview(c);
  const media = snap?.final.url || s(f[KL.media]);
  const score = Number(s(f[KL.score]));
  return {
    id: r.id, name: s(f[KL.name]) || 'Untitled clip', status: s(f[KL.status]), score: s(f[KL.score]) !== '' && Number.isFinite(score) ? score : null,
    qa: s(f[KL.notes]).split('\n')[0].slice(0, 200), watchUrl: /^https:\/\//.test(media) ? media : '', finalClipId: defaultFinalClipId(c),
    verified: snap ? { version: snap.version, clipId: snap.final.clipId } : null, canDecide: !!snap, parents: c.parents,
  };
}
/** Which way an HQ approval reaches n8n: the token writes as Alex (owner), HQ signs it (signed), blocked, or not known yet. */
export type ReviewPath = 'owner' | 'signed' | 'blocked' | 'unknown';
let tokenAuthor: { id: string; email: string } | null = null;
export function _resetReviewAuthor() { tokenAuthor = null; }
export function reviewPath(secret: string): ReviewPath {
  if (!tokenAuthor) return 'unknown';
  if (isOwner(tokenAuthor)) return 'owner';
  return secret ? 'signed' : 'blocked';
}
export async function videoClips(at: Pick<HqAirtable, 'list'>, videoId: string, clipIds: string[]): Promise<ReviewClip[]> {
  if (!clipIds.length) return [];
  const rows = await at.list(CLIPS, `OR(${clipIds.slice(0, 100).map((x) => `RECORD_ID()='${x}'`).join(',')})`, CLIP_READ, 100);
  return rows.map(reviewClipOf).filter((c) => c.parents.includes(videoId)).map(({ parents: _p, ...c }) => c)
    .sort((a, b) => (a.status === 'Needs Review' ? 0 : 1) - (b.status === 'Needs Review' ? 0 : 1) || (b.score ?? 0) - (a.score ?? 0));
}

/** What the video page adds for the final review and the Gamma box (fresh reads; merged into GET /content/items/<rec>). */
export async function contentReviewDetail(at: Pick<HqAirtable, 'get' | 'list'>, id: string, secret: string) {
  const r = await at.get(CONTENT, id, [XF.clips, XF.finalAssetUrl, CF.notes, CF.description]);
  if (!r) return null;
  const prep = parsePrep(s(r.fields[CF.notes]), s(r.fields[CF.description]));
  const finalUrl = s(r.fields[XF.finalAssetUrl]);
  return {
    review: { path: reviewPath(secret), clips: await videoClips(at, id, ids(r.fields[XF.clips])), video: { finalUrl: /^https:\/\//.test(finalUrl) && !/airtable\.com/i.test(finalUrl) ? finalUrl : '' } },
    gamma: { url: prep.gammaUrl, outline: !!prep.gamma },
  };
}

// ---------- the writes ----------
export interface ReviewDeps { at: Pick<HqAirtable, 'get' | 'update' | 'list'>; db: Db; cfg: HookCfg & { contentReviewSecret: string }; fetchImpl?: typeof fetch; by: string }
export interface ReviewResult { status: number; error?: string; message?: string; askSienna?: { title: string; detail: string } }
async function log(db: Db, by: string, action: string, id: string, title: string, changes: { field: string; from: unknown; to: unknown }[]) {
  await db.query(`INSERT INTO hq_content_log (actor, action, record_id, title, changes) VALUES ($1,$2,$3,$4,$5)`, [by, action, id, title.slice(0, 200), JSON.stringify(changes)]);
}
const BLOCKED = 'HQ can\'t approve clips yet: n8n only accepts a review written by your own Airtable login, and HQ\'s Airtable key writes as another user. The n8n change is waiting for your OK in Decisions. Nothing was approved.';

/**
 * One final clip: "Get the current copy" (refresh-current), Approve (approve-current) or Request changes
 * (reject-current + the note on Sienna's list). The Content Center's intent and webhook body; then the
 * author read-back decides whether n8n will accept it (see the top of this file).
 */
export async function reviewClip(d: ReviewDeps, clipId: string, verb: keyof typeof REVIEW_ACTION, b: { finalClipId?: unknown; note?: unknown } = {}): Promise<ReviewResult> {
  if (!REC.test(clipId)) return { status: 400, error: 'not a clip id' };
  const action = REVIEW_ACTION[verb];
  if (!action) return { status: 400, error: 'unknown review action' };
  const note = String(b.note ?? '').trim();
  if (verb === 'changes' && (!note || note.length > 2000)) return { status: 400, error: 'Say what to change (1–2,000 characters).' };
  if (b.finalClipId !== undefined && typeof b.finalClipId !== 'string') return { status: 400, error: 'Choose the exact final clip ID within this original project.' };
  if (reviewPath(d.cfg.contentReviewSecret) === 'blocked') return { status: 409, error: BLOCKED };
  const raw = await d.at.get(CLIPS, clipId, CLIP_READ);
  if (!raw) return { status: 404, error: 'clip not found' };
  const c = reviewClipOf(raw);
  const built = buildReviewIntent({ id: clipId, snapshot: s(raw.fields[RF.snapshot]), opusId: s(raw.fields[KL.opusId]), parents: c.parents }, action, b.finalClipId as string | undefined, randomUUID());
  if ('error' in built) return { status: 409, error: built.error };
  const text = JSON.stringify(built.intent);
  await d.at.update(CLIPS, clipId, { [RF.intent]: text });
  // Read back what Airtable stamped: the author n8n will check, and that the intent is ours.
  const back = await d.at.get(CLIPS, clipId, [RF.intent, RF.author]);
  const author = back?.fields[RF.author] as { id?: string; email?: string } | undefined;
  if (author && typeof author === 'object' && author.id) tokenAuthor = { id: String(author.id), email: String(author.email ?? '') };
  const owner = isOwner(author);
  const signed = !owner && !!d.cfg.contentReviewSecret;
  const changes = [{ field: 'Review Intent JSON', from: '', to: `${action} (copy ${built.intent.finalClipId}, v${built.intent.expectedVersion})` }];
  if (s(back?.fields[RF.intent]) !== text) {
    await log(d.db, d.by, `clip_${verb}`, c.parents[0] ?? clipId, c.name, [...changes, { field: 'n8n', from: '', to: 'not called: the intent changed right after HQ wrote it' }]);
    return { status: 409, error: 'Another review request replaced this one. Refresh and try again.' };
  }
  if (!owner && !signed) {
    await log(d.db, d.by, `clip_${verb}`, c.parents[0] ?? clipId, c.name, [...changes, { field: 'n8n', from: '', to: `not called: Review Intent Author is ${author?.email || 'unknown'}, not Alex` }]);
    return { status: 409, error: BLOCKED };
  }
  const body = owner ? { recordId: clipId } : { recordId: clipId, source: 'hq', hqSig: reviewSig(d.cfg.contentReviewSecret, text) };
  let res: { ok: boolean; status: number };
  try { res = await callHook(d.cfg, 'clipReview', body, d.fetchImpl); }
  catch (e: any) {
    await log(d.db, d.by, `clip_${verb}`, c.parents[0] ?? clipId, c.name, [...changes, { field: `n8n ${HOOKS.clipReview.name}`, from: '', to: 'no answer' }]);
    return { status: e?.status ?? 503, error: e?.status === 503 && /not set up|not set on|find the webhook/i.test(String(e?.message)) ? String(e.message) : 'Request saved; outcome not confirmed. Check the verified review status before retrying. Do not assume approval or completion.' };
  }
  await log(d.db, d.by, `clip_${verb}`, c.parents[0] ?? clipId, c.name, [...changes, { field: `n8n ${HOOKS.clipReview.name}`, from: '', to: `HTTP ${res.status}${owner ? '' : ' (signed by HQ)'}` }]);
  _resetContentCache();
  if (!res.ok) return { status: 502, error: 'Request saved; outcome not confirmed. Check the verified review status before retrying. Do not assume approval or completion.' };
  const message = verb === 'refresh' ? 'Getting the current copy from OpusClip. Refresh in a minute, watch it, then approve it. Nothing is scheduled or posted.'
    : verb === 'approve' ? 'Approval sent. The clip shows Approved once n8n has checked this exact copy (Refresh in a minute). Nothing is scheduled or posted.'
      : 'Changes requested: this copy is marked rejected, and your note is on Sienna\'s list.';
  return { status: 200, message, ...(verb === 'changes' ? { askSienna: { title: `Clip changes: "${c.name.slice(0, 120)}"`, detail: `Alex asked for changes to the final clip "${c.name}" (Content Clips ${clipId}, OpusClip copy ${built.intent.finalClipId}):\n${note}\nEdit it in OpusClip, then it comes back to Alex for review in HQ.` } } : {}) };
}

/** The full video: no Content Center approval exists, so Approve is logged in HQ and Request changes goes to Sienna's list. */
export async function reviewVideo(d: Pick<ReviewDeps, 'at' | 'db' | 'by'>, id: string, verdict: 'approve' | 'changes', noteIn: unknown): Promise<ReviewResult> {
  if (!REC.test(id)) return { status: 400, error: 'not a content record id' };
  const note = String(noteIn ?? '').trim();
  if (verdict === 'changes' && (!note || note.length > 2000)) return { status: 400, error: 'Say what to change (1–2,000 characters).' };
  const r = await d.at.get(CONTENT, id, [CF.title, XF.finalAssetUrl]);
  if (!r) return { status: 404, error: 'video not found' };
  const title = s(r.fields[CF.title]) || 'Untitled';
  if (!/^https:\/\//.test(s(r.fields[XF.finalAssetUrl]))) return { status: 409, error: 'There is no finished video in Frame.io yet.' };
  await log(d.db, d.by, verdict === 'approve' ? 'video_approve' : 'video_changes', id, title, [{ field: 'Full video (HQ only)', from: '', to: verdict === 'approve' ? 'Approved' : `Changes: ${note.slice(0, 300)}` }]);
  if (verdict === 'approve') return { status: 200, message: 'Full video approved (saved in HQ). Next: the thumbnail and YouTube details.' };
  return { status: 200, message: 'Changes requested: your note is on Sienna\'s list.', askSienna: { title: `Video changes: "${title.slice(0, 120)}"`, detail: `Alex asked for changes to the finished full video "${title}" (Content record ${id}):\n${note}` } };
}

// ---------- the Gamma link (the video's Notes: parsePrep reads the first gamma.app link there) ----------
export const GAMMA_URL = /^https:\/\/(?:www\.)?gamma\.app\/[^\s)\]]+$/i;
const GAMMA_IN_TEXT = /https:\/\/(?:www\.)?gamma\.app\/[^\s)\]]+/i;
/** The Notes with this Gamma link: the old link replaced in place, else a "**Gamma link:**" line added at the end. Pure. */
export function notesWithGamma(notes: string, url: string): string {
  if (GAMMA_IN_TEXT.test(notes)) return notes.replace(GAMMA_IN_TEXT, () => url);
  const t = notes.replace(/\s+$/, '');
  return `${t ? `${t}\n\n` : ''}**Gamma link:** ${url}`;
}
export async function saveGammaLink(d: Pick<ReviewDeps, 'at' | 'db' | 'by'>, id: string, urlIn: unknown): Promise<ReviewResult> {
  if (!REC.test(id)) return { status: 400, error: 'not a content record id' };
  const url = String(urlIn ?? '').trim();
  if (!GAMMA_URL.test(url) || url.length > 500) return { status: 400, error: 'Paste the Gamma link (https://gamma.app/…).' };
  const r = await d.at.get(CONTENT, id, [CF.title, CF.notes]);
  if (!r) return { status: 404, error: 'video not found' };
  const notes = s(r.fields[CF.notes]);
  const old = GAMMA_IN_TEXT.exec(notes)?.[0] ?? '';
  if (old === url) return { status: 200, message: 'That Gamma link is already saved.' };
  await d.at.update(CONTENT, id, { [CF.notes]: notesWithGamma(notes, url) });
  await log(d.db, d.by, 'gamma_link', id, s(r.fields[CF.title]), [{ field: 'Notes (Gamma link)', from: old, to: url }]);
  _resetContentCache();
  return { status: 200, message: 'Gamma link saved. "Open Gamma" uses it.' };
}

// ---------- the resource document (from Sienna's Gamma outline; nothing saved) ----------
export interface ResourcePoint { title: string; body: string }
export interface ResourceSection { n: number; headline: string; points: ResourcePoint[]; layout: 'statement' | 'callout' | 'cards' | 'grid' | 'list' }
export interface ResourceDoc {
  id: string; title: string; topic: string; channel: string;
  cover: { headline: string; subtitle: string; pill: string; footnote: string };
  sections: ResourceSection[]; cta: { label: string; text: string; url: string; video: string; videoUrl: string }; footer: string; text: string;
}
const sentences = (t: string) => t.replace(/\s+/g, ' ').trim().split(/(?<=[.!?])\s+(?=["“(\[]?[A-Z0-9])/).map((x) => x.trim()).filter(Boolean);
const pointOf = (t: string): ResourcePoint => {
  const m = /^([^:]{2,48}):\s+(.+)$/.exec(t);
  return m && !/https?$/i.test(m[1]) ? { title: m[1].trim(), body: m[2].trim() } : { title: '', body: t };
};
/** A short topic for the top bar: the title up to a colon or dash, at most ~44 characters on a word boundary. Pure. */
export function shortTopic(title: string): string {
  let t = title.split(/:\s|\s[–—-]\s/)[0].replace(/[“”"]/g, '').trim();
  if (t.length > 44) t = `${t.slice(0, 44).replace(/\s+\S*$/, '')}…`;
  return t || 'Resource';
}
/**
 * Sienna's Gamma outline ("Slide 1: Headline. Sentence. Sentence." lines, or numbered / "#" headings with
 * "-" bullets) → a cover plus one page per slide: the first sentence is the headline, the rest are the
 * points. Lines before the first slide (Sienna's notes to Alex, e.g. "Note: …") are left out. Pure.
 */
export function resourceDoc(v: { id: string; title: string; channel: string; youtubeUrl: string }, outline: string): ResourceDoc | null {
  const slides: { head: string; extra: string[]; bullets: string[] }[] = [];
  for (const raw of String(outline ?? '').replace(/\r\n/g, '\n').split('\n')) {
    const line = raw.replace(/\*\*/g, '').trim();
    if (!line) continue;
    const h = /^(?:#{1,4}\s*)?(?:slide|card|page)\s*\d+\s*[:.)\-–—]\s*(.*)$/i.exec(line) ?? /^(?:#{1,4}\s*)?\d{1,2}[.)]\s+(.*)$/.exec(line) ?? /^#{1,4}\s+(.*)$/.exec(line);
    if (h) { slides.push({ head: h[1].trim(), extra: [], bullets: [] }); continue; }
    if (!slides.length) continue; // Sienna's note before the slides
    const bullet = /^[-*•]\s+(.*)$/.exec(line);
    if (bullet) slides[slides.length - 1].bullets.push(bullet[1].trim()); else slides[slides.length - 1].extra.push(line);
  }
  const usable = slides.filter((x) => x.head || x.bullets.length || x.extra.length);
  if (!usable.length) return null;
  const split = (x: { head: string; extra: string[]; bullets: string[] }) => {
    const all = sentences([x.head, ...x.extra].join(' '));
    return { headline: all[0] ?? x.bullets[0] ?? '', rest: [...all.slice(1), ...x.bullets.filter((b) => b !== all[0])] };
  };
  const first = split(usable[0]);
  const sections: ResourceSection[] = usable.slice(1).map((x, i) => {
    const { headline, rest } = split(x);
    const points = rest.map(pointOf);
    const chars = rest.join(' ').length;
    const layout: ResourceSection['layout'] = !points.length ? 'statement' : points.length === 1 && chars <= 300 ? 'callout' : points.length <= 4 && chars <= 440 ? 'cards' : points.length <= 6 && chars <= 620 ? 'grid' : 'list';
    return { n: i + 1, headline, points, layout };
  });
  const topic = shortTopic(v.title);
  const videoUrl = /^https:\/\//.test(v.youtubeUrl) ? v.youtubeUrl : '';
  const cta = { label: 'Want it done for you?', text: 'Dulcy runs done-for-you cold email for B2B service businesses.', url: 'https://dulcy.io', video: v.title, videoUrl };
  const doc: ResourceDoc = {
    id: v.id, title: v.title, topic, channel: v.channel,
    cover: { headline: first.headline || v.title, subtitle: first.rest.join(' '), pill: sections.length ? `${sections.length}-part guide` : 'Free resource', footnote: `A companion to the video "${v.title}" on YouTube (${v.channel || 'Alex Woung'}).` },
    sections, cta, footer: `Alex Woung · ${topic}`, text: '',
  };
  doc.text = [
    doc.cover.headline, doc.cover.subtitle, '',
    ...sections.flatMap((x) => [`${x.n}. ${x.headline}`, ...x.points.map((p) => `- ${p.title ? `${p.title}: ` : ''}${p.body}`), '']),
    `${cta.label} ${cta.text} ${cta.url}`, videoUrl ? `Watch the video: ${videoUrl}` : '',
  ].filter((x, i, a) => !(x === '' && a[i - 1] === '')).join('\n').trim();
  return doc;
}
/** GET /content/items/<rec>/resource: fresh read of the video's Notes; nothing is saved. */
export async function contentResource(at: Pick<HqAirtable, 'get'>, id: string): Promise<{ status: number; error?: string; doc?: ResourceDoc }> {
  if (!REC.test(id)) return { status: 400, error: 'not a content record id' };
  const r = await at.get(CONTENT, id, [CF.title, CF.channel, CF.notes, CF.description, XF.youtubeUrl]);
  if (!r) return { status: 404, error: 'video not found' };
  const prep = parsePrep(s(r.fields[CF.notes]), s(r.fields[CF.description]));
  if (!prep.gamma) return { status: 409, error: 'There is no Gamma outline for this video yet. Sienna writes it with the script; ask her for one on the video\'s page.' };
  const doc = resourceDoc({ id, title: s(r.fields[CF.title]) || 'Untitled', channel: s(r.fields[CF.channel]), youtubeUrl: s(r.fields[XF.youtubeUrl]) }, prep.gamma);
  return doc ? { status: 200, doc } : { status: 409, error: 'The Gamma outline has no slides to turn into a document.' };
}

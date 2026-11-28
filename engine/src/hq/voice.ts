// HQ voice (Alex, 2026-11-28: "call and talk to the agents, like how GPT does it"). Voice mode is
// HQ Chat with a microphone: the clip is turned into text (OpenAI speech to text), that text goes
// into the SAME chat thread as a typed message, the agent answers through the normal chat path
// (chatTurn, same read-only tools and rules, told to keep it to 1-3 spoken sentences), and the answer
// is read aloud (OpenAI text to speech, one mp3).
//
// Safety: owner/member logins only (clients are refused by the server's guard), members only in their
// own chats, owner-only agents stay owner-only (chatTurn's checks). Voice never approves, sends or
// changes anything: it only calls chatTurn, whose tools are read only; anything that needs approval
// stays a card in Decisions. A clip is at most VOICE_MAX_SECONDS (60) and is never stored: it lives in
// memory for the one transcription call. Per person: at most VOICE_TURNS_PER_HOUR turns an hour (and
// twice that many read-alouds). VOICE=on switches it on; off, every voice route says why.
import type { Db } from '../db/pool.js';
import type { Config } from '../config.js';
import { createOpenAIClient } from '../providers/openai.js';
import { AGENTS, agentByName, type AgentName } from './agents.js';
import { canTalkTo, chatTurn, type ChatModel } from './chat.js';
import type { HqAirtable } from './decisions.js';
import type { HqUser } from './auth.js';

/** The two OpenAI calls voice needs (tests pass a fake fetch through the real client). */
export interface VoiceProvider {
  transcribe(audio: Uint8Array, fileName: string, mime: string, model: string, language?: string): Promise<{ text: string; seconds: number | null }>;
  speech(text: string, model: string, voice: string, instructions?: string): Promise<Uint8Array>;
}

export function voiceProvider(cfg: Config, fetchImpl?: typeof fetch): VoiceProvider {
  return createOpenAIClient({ apiKey: cfg.openAiApiKey, model: cfg.openAiModel, baseUrl: cfg.openAiBaseUrl, fetchImpl, timeoutMs: 60_000 });
}

/** Clip formats the recorder makes (Chrome/Firefox: webm or ogg with Opus; iPhone Safari: mp4/AAC) → file name OpenAI reads. */
export const CLIP_TYPES: Record<string, string> = {
  'audio/webm': 'clip.webm', 'audio/ogg': 'clip.ogg', 'audio/mp4': 'clip.mp4', 'audio/x-m4a': 'clip.m4a', 'audio/m4a': 'clip.m4a', 'audio/mpeg': 'clip.mp3',
};
/** Bytes per second a clip may use (generous: 320 kbps), so a 60 s clip is at most ~2.4 MB. */
const BYTES_PER_SECOND = 40_000;
export const clipByteLimit = (cfg: Pick<Config, 'voiceMaxSeconds'>) => cfg.voiceMaxSeconds * BYTES_PER_SECOND + 50_000;
/** The JSON body limit for a turn: the clip as base64 plus a little. */
export const turnBodyLimit = (cfg: Pick<Config, 'voiceMaxSeconds'>) => Math.ceil(clipByteLimit(cfg) * 1.37) + 4_000;
/** The longest answer read aloud (characters). Voice answers are 1-3 sentences; this is a guard. */
export const SPEAK_MAX_CHARS = 1_500;

export interface VoiceState { on: boolean; reason: string; maxSeconds: number; turnsPerHour: number }
/** Is voice on, and if not, why (in plain words for the Talk button). */
export function voiceState(cfg: Config, chatOn: boolean, sttOn: boolean): VoiceState {
  const base = { maxSeconds: cfg.voiceMaxSeconds, turnsPerHour: cfg.voiceTurnsPerHour };
  if (!cfg.voiceOn) return { on: false, reason: 'Voice is off on this server. To switch it on, add VOICE=on to the server settings and deploy (engine/GUIDE.md → "Talk to the agents").', ...base };
  if (!sttOn) return { on: false, reason: 'Voice needs the OpenAI key on the server (OPENAI_API_KEY).', ...base };
  if (!chatOn) return { on: false, reason: 'Voice needs chat on the server (ANTHROPIC_API_KEY).', ...base };
  return { on: true, reason: '', ...base };
}

/**
 * The answer as it is spoken: without the "Sources: ..." line (shown on screen, not read out),
 * markdown, links and code marks; at most SPEAK_MAX_CHARS, cut at a sentence end. Pure.
 */
export function spokenText(text: string): string {
  let t = String(text ?? '')
    .split('\n').filter((l) => !/^\s*\**\s*sources?\s*\**\s*:/i.test(l)).join('\n')
    .replace(/\(Answer cut short:[^)]*\)/g, '')
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/https?:\/\/\S+/g, '')
    .replace(/^\s{0,3}#{1,6}\s+/gm, '')
    .replace(/^\s*[-*•]\s+/gm, '')
    .replace(/^\s*\d+[.)]\s+/gm, '')
    .replace(/[*_`~>|]/g, '')
    .replace(/\s*\n+\s*/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim();
  if (t.length > SPEAK_MAX_CHARS) {
    const cut = t.slice(0, SPEAK_MAX_CHARS);
    const end = Math.max(cut.lastIndexOf('. '), cut.lastIndexOf('? '), cut.lastIndexOf('! '));
    t = end > SPEAK_MAX_CHARS / 2 ? cut.slice(0, end + 1) : `${cut.replace(/\s+\S*$/, '')}…`;
  }
  return t;
}

/** A transcript with no real words (silence, a cough, a click) is not posted. Pure. */
export function isEmptyTranscript(text: string): boolean {
  return (String(text ?? '').match(/\p{L}/gu) ?? []).length < 2;
}

/** The voice an agent speaks with (OPENAI_TTS_VOICES per agent, else OPENAI_TTS_VOICE). */
export const voiceFor = (cfg: Pick<Config, 'openAiTtsVoice' | 'openAiTtsVoices'>, agent: string) => cfg.openAiTtsVoices[agent] ?? cfg.openAiTtsVoice;

async function usesLastHour(db: Db, userId: number, kind: 'turn' | 'speak'): Promise<number> {
  return Number((await db.query(`SELECT count(*)::int AS n FROM hq_voice_uses WHERE user_id=$1 AND kind=$2 AND created_at > now() - interval '1 hour'`, [userId, kind])).rows[0].n);
}
async function logUse(db: Db, userId: number, kind: 'turn' | 'speak', seconds: number | null, chars: number | null) {
  // Counts only (for the hourly limit and the cost): never the clip, never the words.
  await db.query(`INSERT INTO hq_voice_uses (user_id, kind, seconds, chars) VALUES ($1,$2,$3,$4)`, [userId, kind, seconds, chars]);
}

type Fail = { status: number; error: string };
export interface TurnPlan { agent: AgentName; threadId?: number; audio: Uint8Array; mime: string; fileName: string; seconds: number }

/** Check one voice turn before anything is paid for: agent, chat, clip, limits. */
export async function planTurn(db: Db, cfg: Config, user: HqUser, b: any): Promise<TurnPlan | Fail> {
  const agent = agentByName(String(b?.agent ?? 'Ada'));
  if (!agent) return { status: 400, error: 'unknown agent' };
  if (!canTalkTo(user, agent)) return { status: 403, error: `${agent} is owner-only` };
  let threadId: number | undefined;
  if (b?.threadId !== undefined && b?.threadId !== null && b?.threadId !== '') {
    threadId = Number(b.threadId);
    if (!Number.isInteger(threadId) || threadId <= 0) return { status: 400, error: 'bad chat id' };
    const th = (await db.query(`SELECT user_id, agent FROM hq_chat_threads WHERE id=$1`, [threadId])).rows[0];
    if (!th || (user.role !== 'owner' && Number(th.user_id) !== user.id)) return { status: 404, error: 'thread not found' };
    if (th.agent !== agent) return { status: 409, error: `This chat is with ${th.agent}, not ${agent}. Open a chat with ${agent}.` };
  }
  const mime = String(b?.mime ?? '').split(';')[0].trim().toLowerCase();
  const fileName = CLIP_TYPES[mime];
  if (!fileName) return { status: 415, error: 'That recording format is not supported (webm, ogg or mp4 audio).' };
  const seconds = Number(b?.seconds);
  if (!Number.isFinite(seconds) || seconds <= 0) return { status: 400, error: 'clip length missing' };
  if (seconds > cfg.voiceMaxSeconds + 1) return { status: 413, error: `A clip can be at most ${cfg.voiceMaxSeconds} seconds.` };
  const b64 = typeof b?.audio === 'string' ? b.audio : '';
  if (!b64 || !/^[A-Za-z0-9+/=\s]+$/.test(b64)) return { status: 400, error: 'no recording' };
  const audio = new Uint8Array(Buffer.from(b64, 'base64'));
  if (audio.length < 200) return { status: 400, error: 'The recording was empty.' };
  if (audio.length > clipByteLimit(cfg)) return { status: 413, error: `A clip can be at most ${cfg.voiceMaxSeconds} seconds.` };
  if (await usesLastHour(db, user.id, 'turn') >= cfg.voiceTurnsPerHour) return { status: 429, error: `That's ${cfg.voiceTurnsPerHour} voice turns this hour, the limit. Type in the chat, or try again later.` };
  return { agent, threadId, audio, mime, fileName, seconds };
}

export interface VoiceTurnDeps { db: Db; cfg: Config; at?: HqAirtable; chatModel?: ChatModel; user: HqUser; voice: VoiceProvider }
export type VoiceLine =
  | { heard: string; empty?: boolean }
  | { done: true; threadId: number; agent: AgentName; question: { id: number; text: string }; reply: { id: number; text: string; sources: string[] }; speak: string }
  | { error: string; status: number };

/**
 * One voice turn. Lines go out as they are ready (the server streams them as NDJSON): first what was
 * heard, then the agent's answer. Errors become a line (the response has already started).
 */
export async function runTurn(d: VoiceTurnDeps, plan: TurnPlan, emit: (l: VoiceLine) => void): Promise<{ threadId: number; agent: AgentName; reply: { id: number; text: string } } | null> {
  let heard: { text: string; seconds: number | null };
  try {
    heard = await d.voice.transcribe(plan.audio, plan.fileName, plan.mime, d.cfg.openAiSttModel);
  } catch (e) {
    await logUse(d.db, d.user.id, 'turn', plan.seconds, null);
    emit({ error: `I couldn't hear that: ${String((e as Error).message ?? e).slice(0, 160)}`, status: 502 });
    return null;
  } finally {
    plan.audio.fill(0); // the clip is gone after the one call
  }
  await logUse(d.db, d.user.id, 'turn', heard.seconds ?? plan.seconds, null);
  const text = heard.text.replace(/\s+/g, ' ').trim().slice(0, 4000);
  if (isEmptyTranscript(text)) { emit({ heard: '', empty: true }); return null; }
  emit({ heard: text });
  try {
    const r = await chatTurn({ db: d.db, cfg: d.cfg, at: d.at, model: d.chatModel, user: d.user }, { agent: plan.agent, message: text, threadId: plan.threadId, voice: true });
    emit({ done: true, threadId: r.threadId, agent: r.agent, question: { id: r.question.id, text: r.question.text }, reply: { id: r.reply.id, text: r.reply.text, sources: r.reply.sources }, speak: spokenText(r.reply.text) });
    return { threadId: r.threadId, agent: r.agent, reply: r.reply };
  } catch (e) {
    const status = Number((e as any)?.status) || 500;
    if (status >= 500) console.error(JSON.stringify({ level: 'error', message: 'voice chat turn failed', err: String((e as Error).message ?? e).slice(0, 300) }));
    emit({ error: status >= 500 ? 'The agent could not answer. Try again.' : String((e as Error).message ?? e), status });
    return null;
  }
}

/** Read one saved agent answer aloud: only an answer in a chat this person may read. */
export async function speakMessage(d: Pick<VoiceTurnDeps, 'db' | 'cfg' | 'user' | 'voice'>, messageId: number): Promise<{ audio: Uint8Array } | Fail> {
  if (!Number.isInteger(messageId) || messageId <= 0) return { status: 400, error: 'bad message id' };
  const m = (await d.db.query(`SELECT m.role, m.author, m.text, t.user_id, t.agent FROM hq_chat_messages m JOIN hq_chat_threads t ON t.id=m.thread_id WHERE m.id=$1`, [messageId])).rows[0];
  const agent = m ? agentByName(String(m.agent)) : null;
  if (!m || !agent || m.role !== 'assistant' || (d.user.role !== 'owner' && Number(m.user_id) !== d.user.id) || !canTalkTo(d.user, agent)) return { status: 404, error: 'not found' };
  const text = spokenText(m.text);
  if (!text) return { status: 400, error: 'Nothing to read out.' };
  if (await usesLastHour(d.db, d.user.id, 'speak') >= d.cfg.voiceTurnsPerHour * 2) return { status: 429, error: 'Too many read-alouds this hour. Try again later.' };
  const speaker = agentByName(String(m.author)) ?? agent;
  const audio = await d.voice.speech(text, d.cfg.openAiTtsModel, voiceFor(d.cfg, speaker),
    `You are ${speaker}, Dulcy's ${AGENTS[speaker].role}, talking to a colleague. Speak naturally, warm and brisk, like a quick spoken update.`);
  await logUse(d.db, d.user.id, 'speak', null, text.length);
  return { audio };
}

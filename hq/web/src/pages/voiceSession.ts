// Voice mode's engine (2026-11-28), no React: the microphone, a simple voice-activity check (talking
// starts when the level stays over the room's noise for ~150 ms; a turn ends after ~1 s of quiet),
// the recorder (MediaRecorder; webm/Opus on Chrome and Firefox, mp4/AAC on iPhone Safari), the upload
// (POST /hq/api/voice/turn, answered line by line: what was heard, then the agent's answer) and the
// read-aloud (POST /hq/api/voice/speak → one mp3, played through Web Audio so iPhone allows it after
// the first tap). Talking while the agent speaks stops the playback (barge-in).
import { viewingAsMember } from '../api';

export type VoiceStatus = 'starting' | 'listening' | 'hearing' | 'thinking' | 'speaking' | 'stopped';
export interface VoiceEvents {
  status(s: VoiceStatus): void;
  /** 0..1, about 20 times a second: the mic while listening, the agent's voice while speaking. */
  level(v: number): void;
  heard(text: string): void;
  answer(text: string, threadId: number): void;
  /** fatal = voice mode cannot go on (off, limit, no mic). */
  problem(message: string, fatal: boolean): void;
}
export interface VoiceOptions { agent: string; threadId: number | null; maxSeconds: number }

const FRAME_MS = 50;
const START_FRAMES = 3;          // ~150 ms over the threshold = talking
const BARGE_FRAMES = 6;          // ~300 ms (louder) while the agent speaks
const END_SILENCE_MS = 1000;     // ~1 s of quiet ends the turn
const MIN_SPEECH_MS = 400;       // shorter = a click or a cough: dropped
const IDLE_RESTART_MS = 5000;    // no talking: start a fresh clip (so clips start near the words)

/** The best recording format this browser has. */
export function pickMime(): string {
  const MR = (globalThis as any).MediaRecorder as typeof MediaRecorder | undefined;
  if (!MR?.isTypeSupported) return '';
  for (const t of ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus', 'audio/mp4;codecs=mp4a.40.2']) if (MR.isTypeSupported(t)) return t;
  return '';
}
export const voiceSupported = () => typeof window !== 'undefined' && !!navigator.mediaDevices?.getUserMedia && typeof (window as any).MediaRecorder === 'function'
  && !!((window as any).AudioContext || (window as any).webkitAudioContext);

/** Made inside the Talk tap (iPhone only lets sound play from an audio context started by a tap). */
export function unlockAudio(): AudioContext | null {
  const AC = (window as any).AudioContext || (window as any).webkitAudioContext;
  if (!AC) return null;
  const ctx: AudioContext = new AC();
  try {
    void ctx.resume();
    const b = ctx.createBuffer(1, 1, 22050); const s = ctx.createBufferSource(); s.buffer = b; s.connect(ctx.destination); s.start(0);
  } catch { /* nothing to unlock */ }
  return ctx;
}

export class VoiceError extends Error { constructor(public status: number, message: string) { super(message); } }

interface Clip { rec: MediaRecorder; startedAt: number; done: Promise<Blob> }

function b64(bytes: Uint8Array): string {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}
const headers = () => ({ 'content-type': 'application/json', ...(viewingAsMember() ? { 'x-hq-view': 'member' } : {}) });
async function failure(res: Response): Promise<VoiceError> {
  let msg = '';
  try { msg = (await res.json())?.error ?? ''; } catch { /* not JSON */ }
  if (res.status === 401) window.dispatchEvent(new Event('hq:signed-out'));
  return new VoiceError(res.status, msg || `Request failed (${res.status})`);
}

export class VoiceSession {
  private stream: MediaStream | null = null;
  private mic: AnalyserNode | null = null;
  private out: AnalyserNode | null = null;
  private buf = new Uint8Array(1024);
  private timer: number | null = null;
  private clip: Clip | null = null;
  private mime = '';
  private st: VoiceStatus = 'starting';
  private floor = 0.01;
  private loud = 0;
  private inSpeech = false;
  private speechAt = 0;
  private lastLoud = 0;
  private playing: AudioBufferSourceNode | null = null;
  private abort: AbortController | null = null;
  private ended = false;
  threadId: number | null;

  constructor(private ctx: AudioContext, private o: VoiceOptions, private ev: VoiceEvents) { this.threadId = o.threadId; }

  get status() { return this.st; }
  private set(s: VoiceStatus) { if (this.st !== s) { this.st = s; this.ev.status(s); } }

  async start() {
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1 } });
    } catch (e) {
      const denied = (e as Error)?.name === 'NotAllowedError' || (e as Error)?.name === 'SecurityError';
      this.ev.problem(denied
        ? 'HQ may not use the microphone. Allow it when asked. iPhone: Settings → Apps → Safari → Microphone → Ask, then open HQ again. Computer: the lock icon by the address → Microphone → Allow.'
        : 'No microphone found on this device.', true);
      this.end(); return;
    }
    if (this.ended) { this.stopTracks(); return; }
    try { await this.ctx.resume(); } catch { /* resumed on the next tap */ }
    const src = this.ctx.createMediaStreamSource(this.stream);
    this.mic = this.ctx.createAnalyser(); this.mic.fftSize = 1024; src.connect(this.mic); // never to the speakers (no echo)
    this.out = this.ctx.createAnalyser(); this.out.fftSize = 1024; this.out.connect(this.ctx.destination);
    this.mime = pickMime();
    this.newClip();
    this.set('listening');
    this.timer = window.setInterval(() => this.tick(), FRAME_MS);
  }

  /** End: mic off, playback off, request cancelled. Safe to call twice. */
  end() {
    if (this.ended) return;
    this.ended = true;
    if (this.timer !== null) window.clearInterval(this.timer);
    this.abort?.abort();
    this.stopPlayback();
    try { if (this.clip && this.clip.rec.state !== 'inactive') this.clip.rec.stop(); } catch { /* already stopped */ }
    this.clip = null;
    this.stopTracks();
    void this.ctx.close().catch(() => undefined);
    this.set('stopped');
  }
  private stopTracks() { this.stream?.getTracks().forEach((t) => t.stop()); this.stream = null; }

  private level(a: AnalyserNode | null): number {
    if (!a) return 0;
    a.getByteTimeDomainData(this.buf);
    let sum = 0;
    for (let i = 0; i < this.buf.length; i++) { const v = (this.buf[i] - 128) / 128; sum += v * v; }
    return Math.sqrt(sum / this.buf.length);
  }
  private threshold() { return Math.min(0.08, Math.max(0.012, this.floor * 3)); }

  private newClip() {
    if (!this.stream || this.ended) return;
    try { if (this.clip && this.clip.rec.state !== 'inactive') this.clip.rec.stop(); } catch { /* old clip dropped */ }
    const rec = new MediaRecorder(this.stream, this.mime ? { mimeType: this.mime, audioBitsPerSecond: 64_000 } : { audioBitsPerSecond: 64_000 });
    const chunks: Blob[] = [];
    rec.ondataavailable = (e) => { if (e.data && e.data.size) chunks.push(e.data); };
    const done = new Promise<Blob>((res) => { rec.onstop = () => res(new Blob(chunks, { type: (rec.mimeType || this.mime || 'audio/webm').split(';')[0] })); });
    rec.start();
    this.clip = { rec, startedAt: performance.now(), done };
  }

  private tick() {
    if (this.ended) return;
    const now = performance.now();
    const rms = this.level(this.mic);
    const speaking = this.st === 'speaking';
    this.ev.level(Math.min(1, (speaking ? this.level(this.out) : rms) * 7));
    if (this.st === 'thinking' || this.st === 'starting') return;
    const th = speaking ? Math.max(0.05, this.threshold() * 2.5) : this.threshold();
    const loud = rms > th;
    if (!this.inSpeech) {
      if (loud) this.loud++;
      else { this.loud = 0; if (!speaking) this.floor = this.floor * 0.95 + rms * 0.05; }
      if (this.loud >= (speaking ? BARGE_FRAMES : START_FRAMES)) {
        this.inSpeech = true; this.speechAt = now - this.loud * FRAME_MS; this.lastLoud = now; this.loud = 0;
        if (speaking) this.stopPlayback(); // talk to interrupt
        this.set('hearing');
      } else if (!this.loud && this.clip && now - this.clip.startedAt > (speaking ? IDLE_RESTART_MS * 2 : IDLE_RESTART_MS)) {
        this.newClip();
      }
      return;
    }
    if (loud) this.lastLoud = now;
    const long = this.clip ? now - this.clip.startedAt >= (this.o.maxSeconds - 0.5) * 1000 : false;
    if (now - this.lastLoud >= END_SILENCE_MS || long) { this.inSpeech = false; void this.finish(now); }
  }

  private async finish(now: number) {
    const clip = this.clip;
    if (!clip) return;
    if (this.lastLoud - this.speechAt < MIN_SPEECH_MS) { this.newClip(); this.set('listening'); return; }
    this.set('thinking');
    this.clip = null;
    const seconds = Math.min(this.o.maxSeconds, Math.max(0.5, (now - clip.startedAt) / 1000));
    try { clip.rec.stop(); } catch { /* stopped */ }
    const blob = await clip.done;
    if (this.ended) return;
    try { await this.send(blob, seconds); } catch (e) {
      if (this.ended || (e as Error)?.name === 'AbortError') return;
      const st = e instanceof VoiceError ? e.status : 0;
      const fatal = st === 503 || st === 429 || st === 403 || st === 401;
      this.ev.problem(st ? (e as Error).message : 'No connection. Check the network and talk again.', fatal);
      if (fatal) { this.end(); return; }
      this.listen();
    }
  }

  private listen() { if (this.ended) return; this.newClip(); this.set('listening'); }

  private async send(blob: Blob, seconds: number) {
    const audio = b64(new Uint8Array(await blob.arrayBuffer()));
    this.abort = new AbortController();
    const res = await fetch('/hq/api/voice/turn', {
      method: 'POST', credentials: 'same-origin', headers: headers(), signal: this.abort.signal,
      body: JSON.stringify({ agent: this.o.agent, threadId: this.threadId ?? undefined, audio, mime: blob.type, seconds: Math.round(seconds * 10) / 10 }),
    });
    if (!res.ok || !res.body) throw await failure(res);
    const reader = res.body.getReader(); const dec = new TextDecoder();
    let rest = ''; let said: { id: number; speak: string } | null = null; let empty = false;
    for (;;) {
      const { value, done } = await reader.read();
      if (value) rest += dec.decode(value, { stream: true });
      let i: number;
      while ((i = rest.indexOf('\n')) >= 0) {
        const line = rest.slice(0, i).trim(); rest = rest.slice(i + 1);
        if (!line) continue;
        const l = JSON.parse(line);
        if (l.error) throw new VoiceError(Number(l.status) || 500, l.error);
        if ('heard' in l) { if (l.empty) empty = true; else this.ev.heard(l.heard); }
        if (l.done) { this.threadId = l.threadId; this.ev.answer(l.speak || l.reply.text, l.threadId); said = { id: l.reply.id, speak: l.speak }; }
      }
      if (done) break;
    }
    if (empty || !said || !said.speak) { this.listen(); return; }
    await this.speak(said.id);
  }

  private async speak(messageId: number) {
    const res = await fetch('/hq/api/voice/speak', { method: 'POST', credentials: 'same-origin', headers: headers(), signal: this.abort?.signal, body: JSON.stringify({ messageId }) });
    if (!res.ok) throw await failure(res);
    const data = await res.arrayBuffer();
    if (this.ended) return;
    const audio = await this.ctx.decodeAudioData(data);
    if (this.ended) return;
    try { await this.ctx.resume(); } catch { /* best effort */ }
    const src = this.ctx.createBufferSource();
    src.buffer = audio; src.connect(this.out ?? this.ctx.destination);
    src.onended = () => { if (this.playing === src) { this.playing = null; if (!this.inSpeech) this.listen(); } };
    this.playing = src;
    this.newClip(); // listen for an interruption while it speaks
    this.inSpeech = false; this.loud = 0;
    this.set('speaking');
    src.start();
  }

  private stopPlayback() {
    const p = this.playing; this.playing = null;
    if (p) { try { p.stop(); } catch { /* already done */ } }
  }
}

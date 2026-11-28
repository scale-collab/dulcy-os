// OpenAI client for the ONE call per lead list that turns the thesis + client context into a
// list profile. Never called per company. Key and model from the server .env only.
// Also HQ voice (2026-11-28): speech to text for one clip and text to speech for one answer.
import { PermanentError, RetryableError } from '../errors.js';

export interface OpenAIOptions { apiKey?: string; model: string; baseUrl: string; timeoutMs?: number; fetchImpl?: typeof fetch }

export function createOpenAIClient(o: OpenAIOptions) {
  const f = o.fetchImpl ?? fetch;
  const base = o.baseUrl.replace(/\/+$/, '');
  return {
    configured: Boolean(o.apiKey),
    /** One prompt as a single user message, plain text back (how the old n8n LLM chain nodes called it). */
    async text(prompt: string, model?: string, system?: string): Promise<string> {
      if (!o.apiKey) throw new PermanentError('no OpenAI API key on the server (OPENAI_API_KEY)');
      let res: Response;
      try {
        res = await f(`${base}/v1/chat/completions`, {
          method: 'POST',
          headers: { authorization: `Bearer ${o.apiKey}`, 'content-type': 'application/json' },
          body: JSON.stringify({ model: model ?? o.model, messages: [...(system ? [{ role: 'system', content: system }] : []), { role: 'user', content: prompt }] }),
          signal: AbortSignal.timeout(o.timeoutMs ?? 180_000),
        });
      } catch { throw new RetryableError('OpenAI: network error or timeout'); }
      const body = await res.text();
      if (res.status === 429 || res.status >= 500) throw new RetryableError(`OpenAI: HTTP ${res.status}`);
      if (res.status === 401 || res.status === 403) throw new PermanentError(`OpenAI refused the key (HTTP ${res.status})`);
      if (res.status === 404) throw new PermanentError(`OpenAI: model "${model ?? o.model}" not found`);
      if (!res.ok) throw new PermanentError(`OpenAI refused the request: HTTP ${res.status} ${body.replace(/\s+/g, ' ').slice(0, 300)}`);
      try { return String(JSON.parse(body)?.choices?.[0]?.message?.content ?? ''); } catch { throw new RetryableError('OpenAI: answer was not JSON'); }
    },
    /** One chat call that must answer with a JSON object. */
    async json(system: string, user: string): Promise<Record<string, unknown>> {
      if (!o.apiKey) throw new PermanentError('no OpenAI API key on the server (OPENAI_API_KEY)');
      let res: Response;
      try {
        res = await f(`${base}/v1/chat/completions`, {
          method: 'POST',
          headers: { authorization: `Bearer ${o.apiKey}`, 'content-type': 'application/json' },
          body: JSON.stringify({ model: o.model, response_format: { type: 'json_object' }, messages: [{ role: 'system', content: system }, { role: 'user', content: user }] }),
          signal: AbortSignal.timeout(o.timeoutMs ?? 120_000),
        });
      } catch { throw new RetryableError('OpenAI: network error or timeout'); }
      const text = await res.text();
      if (res.status === 429 || res.status >= 500) throw new RetryableError(`OpenAI: HTTP ${res.status}`);
      if (res.status === 401 || res.status === 403) throw new PermanentError(`OpenAI refused the key (HTTP ${res.status})`);
      if (res.status === 404) throw new PermanentError(`OpenAI: model "${o.model}" not found; set OPENAI_MODEL on the server`);
      if (!res.ok) throw new PermanentError(`OpenAI refused the request: HTTP ${res.status} ${text.replace(/\s+/g, ' ').slice(0, 300)}`);
      let content = '';
      try { content = String(JSON.parse(text)?.choices?.[0]?.message?.content ?? ''); } catch { throw new RetryableError('OpenAI: answer was not JSON'); }
      try { return JSON.parse(content) as Record<string, unknown>; } catch { throw new PermanentError('OpenAI: the profile was not valid JSON'); }
    },
    /**
     * Speech to text for one short clip (HQ voice). The clip is sent once and kept nowhere. The file
     * name's extension tells OpenAI the format (webm, mp4, m4a, ogg, wav, mp3).
     */
    async transcribe(audio: Uint8Array, fileName: string, mime: string, model: string, language?: string): Promise<{ text: string; seconds: number | null }> {
      if (!o.apiKey) throw new PermanentError('no OpenAI API key on the server (OPENAI_API_KEY)');
      const form = new FormData();
      form.append('file', new Blob([audio as Uint8Array<ArrayBuffer>], { type: mime }), fileName);
      form.append('model', model);
      form.append('response_format', 'json');
      if (language) form.append('language', language);
      let res: Response;
      try {
        res = await f(`${base}/v1/audio/transcriptions`, { method: 'POST', headers: { authorization: `Bearer ${o.apiKey}` }, body: form, signal: AbortSignal.timeout(o.timeoutMs ?? 60_000) });
      } catch { throw new RetryableError('OpenAI speech to text: network error or timeout'); }
      const body = await res.text();
      if (res.status === 429 || res.status >= 500) throw new RetryableError(`OpenAI speech to text: HTTP ${res.status}`);
      if (res.status === 401 || res.status === 403) throw new PermanentError(`OpenAI refused the key (HTTP ${res.status})`);
      if (res.status === 404) throw new PermanentError(`OpenAI: speech model "${model}" not found; set OPENAI_STT_MODEL`);
      if (!res.ok) throw new PermanentError(`OpenAI speech to text refused the clip: HTTP ${res.status} ${body.replace(/\s+/g, ' ').slice(0, 200)}`);
      try {
        const j = JSON.parse(body);
        const secs = Number(j?.usage?.seconds ?? j?.duration);
        return { text: String(j?.text ?? '').trim(), seconds: Number.isFinite(secs) && secs > 0 ? secs : null };
      } catch { throw new RetryableError('OpenAI speech to text: answer was not JSON'); }
    },
    /** Text to speech: one mp3 for one short answer (HQ voice). */
    async speech(text: string, model: string, voice: string, instructions?: string): Promise<Uint8Array> {
      if (!o.apiKey) throw new PermanentError('no OpenAI API key on the server (OPENAI_API_KEY)');
      let res: Response;
      try {
        res = await f(`${base}/v1/audio/speech`, {
          method: 'POST',
          headers: { authorization: `Bearer ${o.apiKey}`, 'content-type': 'application/json' },
          // `instructions` only works on the gpt-4o TTS models; tts-1 would refuse it.
          body: JSON.stringify({ model, voice, input: text, response_format: 'mp3', ...(instructions && model.startsWith('gpt-') ? { instructions } : {}) }),
          signal: AbortSignal.timeout(o.timeoutMs ?? 60_000),
        });
      } catch { throw new RetryableError('OpenAI text to speech: network error or timeout'); }
      if (res.status === 429 || res.status >= 500) throw new RetryableError(`OpenAI text to speech: HTTP ${res.status}`);
      if (res.status === 401 || res.status === 403) throw new PermanentError(`OpenAI refused the key (HTTP ${res.status})`);
      if (res.status === 404) throw new PermanentError(`OpenAI: voice model "${model}" not found; set OPENAI_TTS_MODEL`);
      if (!res.ok) { const t = await res.text().catch(() => ''); throw new PermanentError(`OpenAI text to speech refused: HTTP ${res.status} ${t.replace(/\s+/g, ' ').slice(0, 200)}`); }
      return new Uint8Array(await res.arrayBuffer());
    },
  };
}
export type OpenAIClient = ReturnType<typeof createOpenAIClient>;

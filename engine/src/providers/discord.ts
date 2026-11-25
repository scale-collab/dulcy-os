// Discord (read only): recent messages from Alex's Agency Ignition server, a content-idea source for
// Sienna (Alex 2026-11-25). Bot token in the server .env only (DISCORD_BOT_TOKEN); the bot needs
// "Read Message History" on the chosen channels and the Message Content intent switched on.
import { PermanentError, RetryableError } from '../errors.js';

export interface DiscordMessage { id: string; content: string; timestamp: string; author?: { bot?: boolean } }

export function createDiscordClient(o: { token: string; baseUrl?: string; fetchImpl?: typeof fetch }) {
  const f = o.fetchImpl ?? fetch;
  const base = (o.baseUrl ?? 'https://discord.com/api/v10').replace(/\/+$/, '');
  return {
    /** The newest messages of one channel (up to 100). */
    async recent(channelId: string, limit = 100): Promise<DiscordMessage[]> {
      let res: Response;
      try {
        res = await f(`${base}/channels/${encodeURIComponent(channelId)}/messages?limit=${Math.min(100, limit)}`, { headers: { Authorization: `Bot ${o.token}` }, signal: AbortSignal.timeout(30_000) });
      } catch { throw new RetryableError('Discord: network error or timeout'); }
      if (res.status === 401 || res.status === 403) throw new PermanentError(`Discord refused the bot (HTTP ${res.status}): check the token and the bot's access to channel ${channelId}`);
      if (res.status === 429 || res.status >= 500) throw new RetryableError(`Discord: HTTP ${res.status}`);
      if (!res.ok) throw new PermanentError(`Discord: HTTP ${res.status}`);
      const j = await res.json();
      return Array.isArray(j) ? j : [];
    },
  };
}

/** Questions and asks from the community in the last N days, anonymous, for Sienna's research. */
export function communityQuestions(msgs: DiscordMessage[], now: Date, days = 7, max = 30): string[] {
  const since = now.getTime() - days * 86_400_000;
  return msgs
    .filter((m) => !m.author?.bot && Date.parse(m.timestamp) >= since)
    .map((m) => String(m.content ?? '').replace(/<@!?&?\d+>/g, '@someone').replace(/https?:\/\/\S+/g, '[link]').replace(/\S+@\S+\.\S+/g, '[email]').replace(/\s+/g, ' ').trim())
    .filter((t) => t.length >= 20 && (/\?/.test(t) || /\b(how|what|why|anyone|struggl|help|best way|should i)\b/i.test(t)))
    .slice(0, max)
    .map((t) => t.slice(0, 300));
}

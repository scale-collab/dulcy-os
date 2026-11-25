// Discord (read only): recent messages from Alex's Agency Ignition server, a content-idea source for
// Sienna (Alex 2026-11-25). Bot token in the server .env only (DISCORD_BOT_TOKEN); the bot needs
// View Channels + Read Message History and the Message Content intent switched on. It reads every
// text channel it can see (or only SIENNA_DISCORD_CHANNELS when set).
import { PermanentError, RetryableError } from '../errors.js';

export interface DiscordMessage { id: string; content: string; timestamp: string; author?: { bot?: boolean } }

export function createDiscordClient(o: { token: string; baseUrl?: string; fetchImpl?: typeof fetch }) {
  const f = o.fetchImpl ?? fetch;
  const base = (o.baseUrl ?? 'https://discord.com/api/v10').replace(/\/+$/, '');
  const get = async (path: string): Promise<any> => {
    let res: Response;
    try { res = await f(`${base}${path}`, { headers: { Authorization: `Bot ${o.token}` }, signal: AbortSignal.timeout(30_000) }); }
    catch { throw new RetryableError('Discord: network error or timeout'); }
    if (res.status === 401) throw new PermanentError('Discord refused the bot token (HTTP 401)');
    if (res.status === 403) return null; // no access to this one: skip it
    if (res.status === 429 || res.status >= 500) throw new RetryableError(`Discord: HTTP ${res.status}`);
    if (!res.ok) throw new PermanentError(`Discord: HTTP ${res.status}`);
    return res.json();
  };
  return {
    /** Every text / announcement channel in every server the bot was added to (Alex: read them all). */
    async allChannels(max = 40): Promise<string[]> {
      return (await this.channelList(max)).map((c) => c.id);
    },
    /** Same, with names (for the check command). */
    async channelList(max = 40): Promise<{ id: string; name: string; server: string }[]> {
      const guilds = (await get('/users/@me/guilds')) ?? [];
      const out: { id: string; name: string; server: string }[] = [];
      for (const g of Array.isArray(guilds) ? guilds : []) {
        const chans = (await get(`/guilds/${encodeURIComponent(String(g.id))}/channels`)) ?? [];
        for (const c of Array.isArray(chans) ? chans : []) if (c?.type === 0 || c?.type === 5) out.push({ id: String(c.id), name: String(c.name ?? ''), server: String(g.name ?? '') });
      }
      return out.slice(0, max);
    },
    /** The newest messages of one channel (up to 100). */
    async recent(channelId: string, limit = 100): Promise<DiscordMessage[]> {
      const j = await get(`/channels/${encodeURIComponent(channelId)}/messages?limit=${Math.min(100, limit)}`);
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

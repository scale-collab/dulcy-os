// Slack Web API with the Dulcy Agents bot token: post a message (or a thread reply) and read
// the reactions on a message. The bot needs chat:write and reactions:read (+ history scopes).
import { PermanentError, RetryableError } from '../errors.js';

export interface SlackOptions { token?: string; baseUrl?: string; timeoutMs?: number; fetchImpl?: typeof fetch }
export interface SlackReaction { name: string; users: string[] }
export interface SlackMessage { ts: string; user: string; text: string; threadTs?: string; bot: boolean; files: string[] }

export function createSlackClient(o: SlackOptions) {
  const f = o.fetchImpl ?? fetch;
  const base = (o.baseUrl ?? 'https://slack.com/api').replace(/\/+$/, '');
  async function call(method: string, params: Record<string, unknown>, get = false): Promise<any> {
    if (!o.token) throw new PermanentError('no SLACK_BOT_TOKEN on the server');
    let res: Response;
    try {
      res = get
        ? await f(`${base}/${method}?${new URLSearchParams(Object.entries(params).map(([k, v]) => [k, String(v)]))}`, { headers: { authorization: `Bearer ${o.token}` }, signal: AbortSignal.timeout(o.timeoutMs ?? 30_000) })
        : await f(`${base}/${method}`, { method: 'POST', headers: { authorization: `Bearer ${o.token}`, 'content-type': 'application/json; charset=utf-8' }, body: JSON.stringify(params), signal: AbortSignal.timeout(o.timeoutMs ?? 30_000) });
    } catch { throw new RetryableError(`Slack ${method}: network error or timeout`); }
    if (res.status === 429 || res.status >= 500) throw new RetryableError(`Slack ${method}: HTTP ${res.status}`);
    const body = await res.json().catch(() => ({}));
    if (!body.ok) {
      if (body.error === 'ratelimited') throw new RetryableError(`Slack ${method}: rate limited`);
      throw new PermanentError(`Slack ${method} refused: ${body.error ?? `HTTP ${res.status}`}`);
    }
    return body;
  }
  return {
    /** Post to a channel (name like "#dulcy-decisions" or an ID); returns the channel ID and message ts. */
    async post(channel: string, text: string, threadTs?: string): Promise<{ channel: string; ts: string }> {
      const r = await call('chat.postMessage', { channel, text, unfurl_links: false, unfurl_media: false, ...(threadTs ? { thread_ts: threadTs } : {}) });
      return { channel: String(r.channel), ts: String(r.ts) };
    },
    /** Add the bot's own reaction (needs reactions:write). "already_reacted" is fine. */
    async react(channel: string, ts: string, name: string): Promise<void> {
      try { await call('reactions.add', { channel, timestamp: ts, name }); } catch (e) {
        if (!/already_reacted/.test(String((e as Error).message))) throw e;
      }
    },
    /** Top-level messages in a channel since `oldest` (needs channels:history or groups:history). */
    async history(channel: string, oldest: string, limit = 200): Promise<SlackMessage[]> {
      const r = await call('conversations.history', { channel, oldest, limit }, true);
      return (r.messages ?? []).map((m: any) => ({ ts: String(m.ts), user: String(m.user ?? ''), text: String(m.text ?? ''), threadTs: m.thread_ts ? String(m.thread_ts) : undefined,
        bot: Boolean(m.bot_id) || (m.subtype !== undefined && m.subtype !== 'file_share' && m.subtype !== 'thread_broadcast'), files: (m.files ?? []).map((x: any) => String(x.name ?? '')) }));
    },
    async reactions(channel: string, ts: string): Promise<SlackReaction[]> {
      const r = await call('reactions.get', { channel, timestamp: ts, full: true }, true);
      return (r.message?.reactions ?? []).map((x: any) => ({ name: String(x.name), users: (x.users ?? []).map(String) }));
    },
  };
}
export type SlackClient = ReturnType<typeof createSlackClient>;

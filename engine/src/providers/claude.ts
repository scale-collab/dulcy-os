// Claude (Anthropic SDK) for agent drafting. One call = one structured answer.
// The big, stable instructions go first with cache_control so repeated drafts reuse them.
import Anthropic from '@anthropic-ai/sdk';
import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod';
import type { z } from 'zod';
import { PermanentError, RetryableError } from '../errors.js';

export interface ClaudeOptions { apiKey?: string; model: string; baseURL?: string }

export function createClaude(o: ClaudeOptions) {
  if (!o.apiKey) throw new PermanentError('no ANTHROPIC_API_KEY on the server');
  const client = new Anthropic({ apiKey: o.apiKey, ...(o.baseURL ? { baseURL: o.baseURL } : {}) });
  return {
    /** stable: cached instruction blocks, in order (each ends a cache segment, max 3); varying: per-call system text; user: the task. */
    async structured<S extends z.ZodType>(schema: S, stable: string[], varying: string, user: string, effort: 'low' | 'medium' | 'high' = 'high'): Promise<z.infer<S>> {
      const system = [
        ...stable.filter(Boolean).slice(0, 3).map((text) => ({ type: 'text' as const, text, cache_control: { type: 'ephemeral' as const, ttl: '1h' as const } })),
        ...(varying ? [{ type: 'text' as const, text: varying }] : []),
      ];
      let res;
      try {
        res = await client.beta.messages.parse({
          model: o.model,
          max_tokens: 16000,
          betas: ['server-side-fallback-2026-07-01'],
          fallbacks: 'default',
          output_config: { effort, format: betaZodOutputFormat(schema) },
          system,
          messages: [{ role: 'user', content: user }],
        });
      } catch (e) {
        if (e instanceof Anthropic.RateLimitError || e instanceof Anthropic.InternalServerError || e instanceof Anthropic.APIConnectionError) throw new RetryableError(`Claude: ${(e as Error).message}`);
        if (e instanceof Anthropic.APIError) throw new PermanentError(`Claude refused the request: ${e.status} ${e.message}`.slice(0, 300));
        throw e;
      }
      if (res.stop_reason === 'refusal') throw new PermanentError(`Claude declined (${res.stop_details?.category ?? 'no category'})`);
      if (res.stop_reason === 'max_tokens') throw new RetryableError('Claude ran out of output room');
      if (!res.parsed_output) throw new RetryableError('Claude answer did not match the expected shape');
      return res.parsed_output as z.infer<S>;
    },
  };
}
export type Claude = ReturnType<typeof createClaude>;

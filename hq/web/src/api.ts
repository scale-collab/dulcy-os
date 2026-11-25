// Calls to the HQ API (/hq/api, same origin). The session is an httpOnly cookie the page never sees.
export class ApiError extends Error { constructor(public status: number, message: string) { super(message); } }

export async function api<T = any>(path: string, opts: { method?: string; body?: unknown } = {}): Promise<T> {
  const res = await fetch(`/hq/api${path}`, {
    method: opts.method ?? (opts.body === undefined ? 'GET' : 'POST'),
    credentials: 'same-origin',
    headers: opts.body === undefined ? {} : { 'content-type': 'application/json' },
    body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
  });
  let data: any = null;
  try { data = await res.json(); } catch { /* not JSON */ }
  if (res.status === 401 && path !== '/auth/login') window.dispatchEvent(new Event('hq:signed-out'));
  if (!res.ok) throw new ApiError(res.status, data?.error ?? `Request failed (${res.status})`);
  return data as T;
}

export interface User { email: string; name: string; role: 'owner' | 'member' }
export type Pile = 'Replies' | 'Campaigns' | 'Fixes' | 'Money' | 'Other';
export interface Decision {
  id: string; title: string; agent: string; client: string; pile: Pile; status: string; isReply: boolean; canEdit: boolean;
  issue: string; checked: string; fix: string; details: string; action: string; created: string; threadUrl: string; latestMessage: string;
}
export interface Task { id: string; name: string; client: string; stage: string; due: string; priority: string; status: string; notes: string; clientFacing: boolean; overdue: boolean; box: Box; stale: boolean }
export type Box = 'doNow' | 'schedule' | 'delegate' | 'later';
export interface Report { id: number; agent: string; kind: string; title: string; summary: string; link: string | null; urgent: boolean; dryRun: boolean; created: string; data: any; body?: string }
export interface TeamLine { agent: string; ok: boolean | null; line: string }
export interface AgentCard {
  name: string; role: string; does: string; reportsTo: string; manages: string[]; status?: TeamLine; waiting: number; openTasks: number; lastOk: string | null; lastFail: string | null;
}
export interface AgentTask { id: number; agent: string; title: string; due: string | null; status: string; client: string; notes: string }
export interface ChatMessage { id: number; role: 'user' | 'assistant'; author: string; text: string; sources: string[]; tools: { name: string; input: any; note: string; threadId?: number }[]; created: string }
export interface Thread { id: number; agent: string; askedBy: string; parentId: number | null; title: string; updated?: string; messages?: number }

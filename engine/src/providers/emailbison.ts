// EmailBison client: the same endpoints the old n8n builder and top-up used (proven calls).
// Error rules:
//  - Writes (create, upload, attach): a clear "not accepted" (4xx) is a PermanentError with
//    EmailBison's own message kept (the old builder lost it, e.g. "422 [line 24]").
//    A timeout, network drop or 5xx is a plain Error: the outcome is unknown, so the
//    receipt stays 'pending' and the stage reconciles before trying again.
//  - Reads: timeouts, 429 and 5xx are retryable.
// Emails inside EmailBison messages are masked before they reach logs or Airtable.
// Workspaces: with `teamId`, the client switches the key to that workspace before EVERY call
// (the same switch the existing flows use). Other tools (n8n, Airtable) switch the same key
// too, so a "wrong workspace" refusal is retried after switching back; nothing is written
// while the key points elsewhere, and new campaigns are checked to be in the right workspace.
import { NeedsReviewError, PermanentError, RetryableError } from '../errors.js';

export interface BisonOptions { apiKey?: string; baseUrl: string; timeoutMs?: number; fetchImpl?: typeof fetch; teamId?: number }
const WRONG_WORKSPACE = /switch to the workspace|this action is unauthorized/i;

export interface BisonCampaign { id: number; name: string; status?: string; created_at?: string }
export interface BisonStep { id: number; order: number; email_subject?: string; variant?: boolean; variant_from_step_id?: number | null }
export interface BisonLeadList { id: number; name?: string; status?: string; leads_processed?: number; leads_succeeded?: number; leads_failed?: number; error_messages?: unknown }
export interface BisonSender { id: string; status: string; email?: string }

const maskEmails = (s: string) => s.replace(/([A-Za-z0-9._%+-])[A-Za-z0-9._%+-]*@([A-Za-z0-9.-]+\.[A-Za-z]{2,})/g, '$1***@$2');
const short = (s: string) => maskEmails(s.replace(/\s+/g, ' ')).slice(0, 300);

export function createBisonClient(o: BisonOptions) {
  const f = o.fetchImpl ?? fetch;
  const timeoutMs = o.timeoutMs ?? 60_000;
  const base = o.baseUrl.replace(/\/+$/, '');
  const auth = () => {
    if (!o.apiKey) throw new PermanentError('no EmailBison API key on the server for this workspace');
    return { authorization: `Bearer ${o.apiKey}`, accept: 'application/json' };
  };

  async function switchWorkspace() {
    let res: Response;
    try {
      res = await f(`${base}/api/workspaces/switch-workspace`, {
        method: 'POST', headers: { ...auth(), 'content-type': 'application/json' }, body: JSON.stringify({ team_id: o.teamId }), signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (e) {
      if (e instanceof PermanentError) throw e;
      throw new RetryableError('EmailBison workspace switch: network error or timeout');
    }
    const text = await res.text();
    if (res.status === 429 || res.status >= 500) throw new RetryableError(`EmailBison workspace switch: HTTP ${res.status}`);
    if (!res.ok) throw new PermanentError(`EmailBison refused to switch to workspace ${o.teamId}: HTTP ${res.status} ${short(text)}`);
  }

  async function call(method: string, path: string, body?: unknown, opts: { write: boolean; form?: FormData; timeoutMs?: number } = { write: false }) {
    // Point the key at our workspace right before the call (other tools may have moved it).
    if (o.teamId) await switchWorkspace();
    const headers: Record<string, string> = auth();
    let payload: BodyInit | undefined;
    if (opts.form) payload = opts.form;
    else if (body !== undefined) { headers['content-type'] = 'application/json'; payload = JSON.stringify(body); }
    let res: Response;
    try {
      res = await f(`${base}${path}`, { method, headers, body: payload, signal: AbortSignal.timeout(opts.timeoutMs ?? timeoutMs) });
    } catch (e) {
      if (e instanceof PermanentError) throw e;
      if (opts.write) throw new Error(`EmailBison ${method} ${path}: network error or timeout; outcome unknown`);
      throw new RetryableError(`EmailBison ${method} ${path}: network error or timeout`);
    }
    const text = await res.text();
    if (res.status === 429) throw new RetryableError(`EmailBison ${method} ${path}: rate limited (HTTP 429)`);
    if (res.status >= 500) {
      if (opts.write) throw new Error(`EmailBison ${method} ${path}: HTTP ${res.status}; outcome unknown`);
      throw new RetryableError(`EmailBison ${method} ${path}: HTTP ${res.status}`);
    }
    // Another tool switched the key away between our switch and our call: not accepted, retry.
    if (res.status === 403 && WRONG_WORKSPACE.test(text)) throw new RetryableError(`EmailBison ${method} ${path}: the key was on another workspace (another tool switched it); retrying`);
    if (!res.ok) throw new PermanentError(`EmailBison ${method} ${path} refused: HTTP ${res.status} ${short(text)}`);
    try { return text ? JSON.parse(text) : {}; } catch {
      if (opts.write) throw new Error(`EmailBison ${method} ${path}: answer was not JSON; outcome unknown`);
      throw new RetryableError(`EmailBison ${method} ${path}: answer was not JSON`);
    }
  }
  const unwrapList = (r: any): any[] => (Array.isArray(r?.data) ? r.data : Array.isArray(r) ? r : []);

  async function pages<T>(path: string, maxPages = 200): Promise<T[]> {
    const out: T[] = [];
    for (let page = 1; page <= maxPages; page++) {
      const sep = path.includes('?') ? '&' : '?';
      const r = await call('GET', `${path}${sep}page=${page}`);
      out.push(...unwrapList(r));
      const last = Number(r?.meta?.last_page ?? 0);
      if (!(last > page || r?.links?.next)) return out;
    }
    throw new PermanentError(`EmailBison ${path}: more than ${maxPages} pages`);
  }

  return {
    /**
     * Confirm a campaign is in our workspace. Uses the workspace's own campaign list: some single
     * reads answer for campaigns in other workspaces, the list does not.
     */
    async confirmCampaignHere(id: number): Promise<void> {
      const here = (await pages<any>('/api/campaigns')).some((c) => Number(c.id) === id);
      if (!here) throw new NeedsReviewError(`campaign ${id} is not in workspace ${o.teamId ?? '(no workspace set)'}; it was created while the key pointed at another workspace. Find it with: cli.js whereis ${id}`);
    },
    async findCampaignsByName(name: string): Promise<BisonCampaign[]> {
      const all = await pages<BisonCampaign>('/api/campaigns');
      return all.filter((c) => String(c.name).trim() === name.trim()).map((c) => ({ ...c, id: Number(c.id) }));
    },
    /** One campaign with its settings (max emails/new leads per day, plain text, tracking). */
    /** Reply in an existing thread (reply_all picks our sender and the prospect). Returns the new reply's ID. */
    async sendReply(replyId: number, message: string): Promise<{ id: number }> {
      const r = await call('POST', `/api/replies/${replyId}/reply`, { message, reply_all: true, inject_previous_email_body: true, content_type: 'text' }, { write: true });
      return { id: Number(r?.data?.reply?.id ?? 0) };
    },
    /** The reply with every older and newer message of its thread. */
    async conversationThread(replyId: number): Promise<{ current_reply: any; newer_messages: any[]; older_messages: any[] }> {
      const r = await call('GET', `/api/replies/${replyId}/conversation-thread`);
      return { current_reply: r?.data?.current_reply ?? null, newer_messages: r?.data?.newer_messages ?? [], older_messages: r?.data?.older_messages ?? [] };
    },
    async senderEmail(id: number): Promise<{ id: number; email: string }> {
      const r = await call('GET', `/api/sender-emails/${id}`);
      return { id: Number(r?.data?.id ?? 0), email: String(r?.data?.email ?? r?.data?.email_address ?? '').toLowerCase() };
    },
    /** Reply to the prospect only (the same body the Airtable "Send Email" button sends): one To, explicit CC/BCC. */
    async replyTo(replyId: number, p: { html: string; senderEmailId: number; to: { name: string; email: string }; cc: string[]; bcc: string[] }): Promise<{ id: number; folder: string }> {
      const r = await call('POST', `/api/replies/${replyId}/reply`, {
        inject_previous_email_body: true, message: p.html, sender_email_id: p.senderEmailId, content_type: 'html', reply_all: false,
        to_emails: [{ name: p.to.name, email_address: p.to.email }],
        cc_emails: p.cc.map((e) => ({ name: '', email_address: e })), bcc_emails: p.bcc.map((e) => ({ name: '', email_address: e })),
      }, { write: true });
      const reply = r?.data?.reply ?? {};
      return { id: Number(reply.id ?? 0), folder: String(reply.folder ?? reply.status ?? '').toLowerCase() };
    },
    async getCampaign(id: number): Promise<Record<string, any>> {
      const r = await call('GET', `/api/campaigns/${id}`);
      return r?.data ?? r ?? {};
    },
    /** Every workspace (team) this key can reach: [{id, name}] (live 2026-11-24: the Dulcy key reaches all 35). */
    async listWorkspaces(): Promise<{ id: number; name: string }[]> {
      const r = await call('GET', '/api/workspaces');
      const rows = Array.isArray(r) ? r : Array.isArray(r?.data) ? r.data : [];
      return rows.map((w: any) => ({ id: Number(w.id), name: String(w.name ?? '') })).filter((w: { id: number }) => Number.isSafeInteger(w.id) && w.id > 0);
    },
    /** Every campaign in the workspace with EmailBison's own stats (same list the daily sync reads). */
    async listCampaigns(): Promise<any[]> {
      return pages<any>('/api/campaigns');
    },
    pauseCampaign: (id: number) => call('PATCH', `/api/campaigns/${id}/pause`, undefined, { write: true }),
    /**
     * Resume a paused campaign. The same call launches a draft (live test 2026-11-23:
     * draft → queued → launching → active in about 7 seconds). Only the launch and sender
     * stages call it, after their checks.
     */
    resumeCampaign: (id: number) => call('PATCH', `/api/campaigns/${id}/resume`, undefined, { write: true }),
    /** The campaign's status in lower case (draft, queued, launching, active, paused, completed, ...). */
    async campaignStatus(id: number): Promise<string> {
      const r = await call('GET', `/api/campaigns/${id}`);
      return String((r?.data ?? r)?.status ?? '').trim().toLowerCase();
    },
    async createCampaign(name: string, type: string): Promise<BisonCampaign> {
      const r = await call('POST', '/api/campaigns', { name, type }, { write: true });
      const id = Number(r?.data?.id ?? r?.id);
      if (!Number.isSafeInteger(id) || id < 1) throw new Error('EmailBison create campaign: no id in the answer; outcome unknown');
      return { id, name };
    },
    setSchedule: (id: number, schedule: Record<string, unknown>) => call('POST', `/api/campaigns/${id}/schedule`, schedule, { write: true }),
    updateSettings: (id: number, settings: Record<string, unknown>) => call('PATCH', `/api/campaigns/${id}/update`, settings, { write: true }),
    async getSteps(id: number): Promise<BisonStep[]> {
      const r = await call('GET', `/api/campaigns/v1.1/${id}/sequence-steps`);
      const list = Array.isArray(r?.data?.sequence_steps) ? r.data.sequence_steps : unwrapList(r);
      return list.map((s: any) => ({ ...s, id: Number(s.id), order: Number(s.order), variant: s.variant === true || s.variant === 1, variant_from_step_id: s.variant_from_step_id == null ? null : Number(s.variant_from_step_id) }));
    },
    addSteps: (id: number, payload: Record<string, unknown>) => call('POST', `/api/campaigns/v1.1/${id}/sequence-steps`, payload, { write: true }),
    async customVariables(): Promise<Set<string>> {
      const list = await pages<any>('/api/custom-variables', 1000);
      return new Set(list.map((v) => String(v?.name ?? v).trim().toLowerCase()));
    },
    createCustomVariable: (name: string) => call('POST', '/api/custom-variables', { name }, { write: true }),
    async uploadLeadsCsv(name: string, columnsToMap: Record<string, string>, csv: string): Promise<BisonLeadList> {
      const form = new FormData();
      form.append('name', name);
      for (const [dest, src] of Object.entries(columnsToMap)) form.append(`columnsToMap[${dest}]`, src);
      form.append('csv', new Blob([csv], { type: 'text/csv' }), `${name.replace(/[^A-Za-z0-9 _-]/g, '')}.csv`);
      const r = await call('POST', '/api/leads/bulk/csv', undefined, { write: true, form, timeoutMs: 120_000 });
      const id = Number(r?.data?.id ?? r?.data?.lead_list_id ?? r?.id ?? r?.lead_list_id);
      if (!Number.isSafeInteger(id) || id < 1) throw new Error('EmailBison CSV upload: no lead list id in the answer; outcome unknown');
      return { id, name };
    },
    async findLeadListsByName(name: string): Promise<BisonLeadList[]> {
      const all = await pages<BisonLeadList>('/api/lead-lists');
      return all.filter((l) => String(l.name).trim() === name.trim()).map((l) => ({ ...l, id: Number(l.id) }));
    },
    async getLeadList(id: number): Promise<BisonLeadList> {
      const r = await call('GET', `/api/lead-lists/${id}`);
      return (r?.data ?? r) as BisonLeadList;
    },
    attachLeadList: (campaignId: number, leadListId: number) =>
      call('POST', `/api/campaigns/${campaignId}/leads/attach-lead-list`, { lead_list_id: leadListId }, { write: true }),
    async campaignLeadTotal(campaignId: number): Promise<number> {
      const r = await call('GET', `/api/campaigns/${campaignId}/leads?page=1`);
      const total = Number(r?.meta?.total);
      if (!Number.isSafeInteger(total) || total < 0) throw new RetryableError('EmailBison campaign leads: no total in the answer');
      return total;
    },
    /** Every sender inbox in the workspace (id, email, status). */
    async workspaceSenders(): Promise<BisonSender[]> {
      const rows = await pages<any>('/api/sender-emails', 200);
      return rows.map((x) => {
        const email = x.email ?? x.email_address ?? x.from_email_address;
        return { id: String(x.id), status: String(x.status ?? '').toLowerCase(), email: email ? String(email).trim().toLowerCase() : undefined };
      });
    },
    // Used only by the ENGINE TEST cleanup command (cli.js cleanup-test), never by a stage.
    campaignLeads: (campaignId: number) => pages<any>(`/api/campaigns/${campaignId}/leads`, 500),
    customVariableList: () => pages<any>('/api/custom-variables', 1000),
    leadLists: () => pages<any>('/api/lead-lists', 1000),
    deleteLeads: (leadIds: number[]) => call('DELETE', '/api/leads/bulk', { lead_ids: leadIds }, { write: true }),
    deleteCustomVariable: (id: number) => call('DELETE', `/api/custom-variables/${id}`, undefined, { write: true }),
    deleteCampaign: (id: number) => call('DELETE', `/api/campaigns/${id}`, undefined, { write: true }),
    attachSenders: (campaignId: number, senderIds: string[]) =>
      call('POST', `/api/campaigns/${campaignId}/attach-sender-emails`, { sender_email_ids: senderIds.map(String) }, { write: true }),
    /** EmailBison allows sender changes only while the campaign is a draft or paused. */
    removeSenders: (campaignId: number, senderIds: string[]) =>
      call('DELETE', `/api/campaigns/${campaignId}/remove-sender-emails`, { sender_email_ids: senderIds.map(String) }, { write: true }),
    /** The campaign's inboxes with their (lifetime) send and bounce counts, for the bounce investigation. */
    /**
     * The workspace's totals for a date range (both days included), the same EmailBison call the
     * n8n "Analytics - Email" flows write into Airtable's Email Analytics Overview. Read only.
     * n8n sends start_date / end_date as a JSON body on a GET; fetch cannot, so they go in the query.
     */
    async workspaceStats(from: string, to: string): Promise<{ sent: number; contacted: number; replies: number; interested: number; bounced: number }> {
      const r = await call('GET', `/api/workspaces/v1.1/stats?start_date=${encodeURIComponent(from)}&end_date=${encodeURIComponent(to)}`);
      const d = r?.data ?? r ?? {};
      const n = (v: unknown) => (Number.isFinite(Number(v)) ? Number(v) : 0);
      return { sent: n(d.emails_sent), contacted: n(d.total_leads_contacted), replies: n(d.unique_replies_per_contact), interested: n(d.interested), bounced: n(d.bounced) };
    },
    async campaignSenderStats(campaignId: number): Promise<{ id: string; email: string; status: string; sent: number; bounced: number; contacted: number }[]> {
      const rows = await pages<any>(`/api/campaigns/${campaignId}/sender-emails`, 100);
      const n = (v: unknown) => (Number.isFinite(Number(v)) ? Number(v) : 0);
      return rows.map((x) => ({ id: String(x.id), email: String(x.email ?? '').toLowerCase(), status: String(x.status ?? '').toLowerCase(), sent: n(x.emails_sent_count), bounced: n(x.bounced_count), contacted: n(x.total_leads_contacted_count) }));
    },
    /** Set the cold-email daily limit of sender inboxes (0 = rest the account). */
    setDailyLimit: (senderIds: (string | number)[], limit: number) =>
      call('PATCH', '/api/sender-emails/daily-limits/bulk', { sender_email_ids: senderIds.map(Number), daily_limit: limit }, { write: true }),
    /** Set the warm-up emails per day of sender inboxes (the same call n8n "Email Accounts Bulk Controls" makes). */
    setWarmupLimit: (senderIds: (string | number)[], limit: number) =>
      call('PATCH', '/api/warmup/sender-emails/update-daily-warmup-limits', { sender_email_ids: senderIds.map(Number), daily_limit: limit }, { write: true }),
    /** One inbox's current settings (daily limit, status). */
    async senderEmailDetails(id: number): Promise<{ id: number; email: string; dailyLimit: number; status: string }> {
      const r = await call('GET', `/api/sender-emails/${id}`);
      const x = r?.data ?? r ?? {};
      return { id: Number(x.id ?? id), email: String(x.email ?? '').toLowerCase(), dailyLimit: Number(x.daily_limit ?? 0), status: String(x.status ?? '').toLowerCase() };
    },
    /** A sample of the campaign's lead emails (first pages only), for where-the-bounces-land comparisons. */
    async campaignLeadEmailsSample(campaignId: number, maxPages = 10): Promise<string[]> {
      const out: string[] = [];
      for (let page = 1; page <= maxPages; page++) {
        const r = await call('GET', `/api/campaigns/${campaignId}/leads?page=${page}`);
        out.push(...unwrapList(r).map((x: any) => String(x?.email ?? x?.lead?.email ?? '').toLowerCase()).filter(Boolean));
        const last = Number(r?.meta?.last_page ?? 0);
        if (!(last > page || r?.links?.next)) break;
      }
      return out;
    },
    /** Bounce notices for a campaign (the "bounced" folder), newest first, at most maxPages pages. */
    async bouncedReplies(campaignId: number, maxPages = 5): Promise<any[]> {
      const out: any[] = [];
      for (let page = 1; page <= maxPages; page++) {
        const r = await call('GET', `/api/replies?campaign_id=${campaignId}&folder=bounced&page=${page}`);
        out.push(...unwrapList(r));
        const last = Number(r?.meta?.last_page ?? 0);
        if (!(last > page || r?.links?.next)) break;
      }
      return out;
    },
    /**
     * The workspace's webhooks (GET /api/webhook-url) and the engine's own one (hooks connect, 2026-11-28).
     * Only the engine's "Dulcy engine" webhook is ever created or updated; others are never changed or deleted.
     */
    async listWebhooks(): Promise<{ id: number; name: string; url: string; events: string[] }[]> {
      const rows = await pages<any>('/api/webhook-url', 20);
      return rows.map((w) => ({ id: Number(w.id), name: String(w.name ?? ''), url: String(w.url ?? w.webhook_url ?? ''), events: Array.isArray(w.events) ? w.events.map(String) : [] }));
    },
    async createWebhook(name: string, url: string, events: string[]): Promise<{ id: number }> {
      const r = await call('POST', '/api/webhook-url', { name, url, events }, { write: true });
      return { id: Number(r?.data?.id ?? r?.id ?? 0) };
    },
    updateWebhook: (id: number, name: string, url: string, events: string[]) => call('PUT', `/api/webhook-url/${id}`, { name, url, events }, { write: true }),
    async campaignSenders(campaignId: number): Promise<BisonSender[]> {
      const rows = await pages<any>(`/api/campaigns/${campaignId}/sender-emails`, 100);
      return rows.map((x) => ({ id: String(x.id), status: String(x.status ?? '').toLowerCase(), email: x.email ? String(x.email) : undefined }));
    },
  };
}

export type BisonClient = ReturnType<typeof createBisonClient>;

/** Which of these workspaces holds the campaign (by each workspace's own campaign list). */
export async function findCampaignWorkspace(apiKey: string, baseUrl: string, campaignId: number, teamIds: number[]): Promise<{ teamId: number; name: string; status: string }[]> {
  const found: { teamId: number; name: string; status: string }[] = [];
  for (const teamId of teamIds) {
    const c = createBisonClient({ apiKey, baseUrl, teamId });
    let list: any[];
    // A workspace that no longer exists (EmailBison refuses the switch) is skipped, not fatal.
    try { list = await c.listCampaigns(); } catch (e) {
      if (/refused to switch/i.test(String((e as Error).message))) { console.error(`workspace ${teamId}: no longer exists in EmailBison, skipped`); continue; }
      throw e;
    }
    const hit = list.find((x) => Number(x.id) === campaignId);
    if (hit) found.push({ teamId, name: String(hit.name ?? ''), status: String(hit.status ?? '') });
  }
  return found;
}

/** The client for one workspace: its key, and its workspace ID (from the job or the server .env). */
export function bisonFor(cfg: { emailBisonKeys: Record<string, string>; emailBisonTeams: Record<string, number>; emailBisonBaseUrl: string }, workspace: string, workspaceId?: number) {
  const ws = workspace.toLowerCase();
  const teamId = Number(workspaceId ?? cfg.emailBisonTeams[ws]) || undefined;
  return createBisonClient({ apiKey: cfg.emailBisonKeys[ws], baseUrl: cfg.emailBisonBaseUrl, teamId });
}

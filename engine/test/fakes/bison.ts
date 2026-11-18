// Fake EmailBison: the endpoints the campaign build uses, with switches to simulate failures.
import http from 'node:http';

export interface FakeBison {
  url: string;
  key: string;
  campaigns: { id: number; name: string; leads: Set<string>; senders: string[]; steps: any[] }[];
  leadLists: { id: number; name: string; emails: string[]; status: string; checks: number; failRows: number }[];
  customVariables: Set<string>;
  calls: string[];
  /** Create the campaign, then answer 500 (outcome unknown to the caller). */
  createThen500: boolean;
  /** Upload the list, then answer 500. */
  uploadThen500: boolean;
  /** How many status checks a new import stays "Unprocessed". */
  processAfterChecks: number;
  failRowsOnImport: number;
  senderStatus: (id: string) => string;
  senderEmail: (id: string) => string;
  /** Sender IDs that exist in the workspace. */
  workspaceSenders: string[];
  close(): void;
}

export async function startFakeBison(): Promise<FakeBison> {
  const s: FakeBison = {
    url: '', key: 'bison-key', campaigns: [], leadLists: [], customVariables: new Set(['domain']), calls: [],
    createThen500: false, uploadThen500: false, processAfterChecks: 0, failRowsOnImport: 0,
    senderStatus: () => 'connected', senderEmail: (id) => `sender${id}@dulcy-mail.com`, workspaceSenders: ['11', '12', '13'], close: () => undefined,
  };
  const json = (res: http.ServerResponse, code: number, body: unknown) => { res.writeHead(code, { 'content-type': 'application/json' }); res.end(JSON.stringify(body)); };
  const page = (list: unknown[], u: URL) => ({ data: list, meta: { current_page: Number(u.searchParams.get('page') ?? 1), last_page: 1, total: list.length } });
  const server = http.createServer(async (req, res) => {
    if (req.headers.authorization !== `Bearer ${s.key}`) return json(res, 401, { message: 'Unauthenticated.' });
    const u = new URL(req.url ?? '/', 'http://x');
    const chunks: Buffer[] = [];
    for await (const c of req) chunks.push(c as Buffer);
    const raw = Buffer.concat(chunks);
    const body = () => JSON.parse(raw.toString() || '{}');
    const m = (re: RegExp) => u.pathname.match(re);
    s.calls.push(`${req.method} ${u.pathname}`);
    let x;
    if (req.method === 'GET' && u.pathname === '/api/campaigns') return json(res, 200, page(s.campaigns.map((c) => ({ id: c.id, name: c.name })), u));
    if (req.method === 'POST' && u.pathname === '/api/campaigns') {
      const c = { id: 500 + s.campaigns.length, name: body().name, leads: new Set<string>(), senders: [] as string[], steps: [] as any[] };
      s.campaigns.push(c);
      if (s.createThen500) { s.createThen500 = false; return json(res, 500, { message: 'Server Error' }); }
      return json(res, 200, { data: { id: c.id, name: c.name } });
    }
    const camp = (id: string) => s.campaigns.find((c) => c.id === Number(id))!;
    if ((x = m(/^\/api\/campaigns\/(\d+)\/schedule$/)) && req.method === 'POST') return json(res, 200, { data: {} });
    if ((x = m(/^\/api\/campaigns\/(\d+)\/update$/)) && req.method === 'PATCH') return json(res, 200, { data: {} });
    if ((x = m(/^\/api\/campaigns\/v1\.1\/(\d+)\/sequence-steps$/))) {
      const c = camp(x[1]);
      if (req.method === 'GET') return json(res, 200, { data: { sequence_steps: c.steps } });
      const missing = body().sequence_steps.findIndex((st: any) => !String(st.email_subject ?? '').trim());
      if (missing >= 0) return json(res, 422, { data: { success: false, message: `The sequence_steps.${missing}.email_subject field is required.` } });
      // Like the real EmailBison, thread replies don't keep the subject as sent.
      for (const st of body().sequence_steps) c.steps.push({ ...st, id: 9000 + c.steps.length, email_subject: st.thread_reply ? null : st.email_subject, sent_subject: st.email_subject });
      return json(res, 200, { data: { ok: true } });
    }
    if (u.pathname === '/api/custom-variables') {
      if (req.method === 'GET') return json(res, 200, page([...s.customVariables].map((name) => ({ name })), u));
      s.customVariables.add(String(body().name).toLowerCase());
      return json(res, 200, { data: { name: body().name } });
    }
    if (u.pathname === '/api/leads/bulk/csv' && req.method === 'POST') {
      const form = await new Response(raw, { headers: { 'content-type': String(req.headers['content-type']) } }).formData();
      const csv = await (form.get('csv') as Blob).text();
      if (form.get('columnsToMap[email]') !== 'email') return json(res, 422, { message: 'The columns to map.email field is required. lead@example.com' });
      const lines = csv.trim().split('\n').slice(1);
      const emails = lines.map((l) => csvCells(l)[2]);
      const list = { id: 700 + s.leadLists.length, name: String(form.get('name')), emails, status: 'Unprocessed', checks: 0, failRows: s.failRowsOnImport };
      s.leadLists.push(list);
      if (s.uploadThen500) { s.uploadThen500 = false; return json(res, 500, { message: 'Server Error' }); }
      return json(res, 200, { data: { id: list.id } });
    }
    if (u.pathname === '/api/lead-lists' && req.method === 'GET') return json(res, 200, page(s.leadLists.map((l) => ({ id: l.id, name: l.name })), u));
    if ((x = m(/^\/api\/lead-lists\/(\d+)$/))) {
      const l = s.leadLists.find((y) => y.id === Number(x![1]))!;
      l.checks++;
      if (l.checks > s.processAfterChecks) l.status = 'Processed';
      const done = l.status === 'Processed';
      return json(res, 200, { data: { id: l.id, name: l.name, status: l.status, leads_processed: done ? l.emails.length : null, leads_succeeded: done ? l.emails.length - l.failRows : null, leads_failed: done ? l.failRows : null, error_messages: l.failRows ? { 'First name is a required field': l.failRows } : {} } });
    }
    if ((x = m(/^\/api\/campaigns\/(\d+)\/leads\/attach-lead-list$/))) {
      const l = s.leadLists.find((y) => y.id === Number(body().lead_list_id))!;
      for (const e of l.emails.slice(0, l.emails.length - l.failRows)) camp(x[1]).leads.add(e);
      return json(res, 200, { data: { success: true } });
    }
    if ((x = m(/^\/api\/campaigns\/(\d+)\/leads$/))) return json(res, 200, { data: [], meta: { total: camp(x[1]).leads.size } });
    if (u.pathname === '/api/sender-emails') return json(res, 200, page(s.workspaceSenders.map((id) => ({ id: Number(id), status: s.senderStatus(id), email: s.senderEmail(id) })), u));
    if ((x = m(/^\/api\/campaigns\/(\d+)\/attach-sender-emails$/))) {
      const bad = body().sender_email_ids.findIndex((id: string) => !s.workspaceSenders.includes(String(id)));
      if (bad >= 0) return json(res, 422, { data: { success: false, message: `The selected sender_email_ids.${bad} is invalid.` } });
      const c = camp(x[1]); for (const id of body().sender_email_ids) if (!c.senders.includes(String(id))) c.senders.push(String(id)); return json(res, 200, { data: { success: true } });
    }
    if ((x = m(/^\/api\/campaigns\/(\d+)\/sender-emails$/))) return json(res, 200, page(camp(x[1]).senders.map((id) => ({ id: Number(id), status: s.senderStatus(id), email: s.senderEmail(id) })), u));
    return json(res, 404, { message: 'not found' });
  });
  await new Promise<void>((r) => server.listen(0, () => r()));
  s.url = `http://localhost:${(server.address() as { port: number }).port}`;
  s.close = () => server.close();
  return s;
}

function csvCells(line: string): string[] {
  const out: string[] = []; let v = ''; let q = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"' && q && line[i + 1] === '"') { v += '"'; i++; }
    else if (c === '"') q = !q;
    else if (c === ',' && !q) { out.push(v); v = ''; }
    else v += c;
  }
  out.push(v);
  return out;
}

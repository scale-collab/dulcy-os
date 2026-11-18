// Fake Google token + Sheets endpoints. Checks the signed service-account login for real.
import http from 'node:http';
import { generateKeyPairSync, createVerify } from 'node:crypto';
import { writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

export interface FakeGoogle {
  url: string;
  keyFile: string;
  tabs: Record<string, string[][]>;
  tokenCalls: number;
  lastSub?: string;
  lastScope?: string;
  /** Written by the engine: sheet ID → tab → rows (row index 0 = sheet row 1). */
  written: Record<string, Record<string, string[][]>>;
  writes: number;
  maxWriteBytes: number;
  creates: number;
  close(): void;
}

function colIndex(letters: string): number {
  let n = 0;
  for (const ch of letters) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}

export async function startFakeGoogle(): Promise<FakeGoogle> {
  const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const state: FakeGoogle = { url: '', keyFile: '', tabs: {}, tokenCalls: 0, written: {}, writes: 0, maxWriteBytes: 0, creates: 0, close: () => undefined };
  const server = http.createServer(async (req, res) => {
    const u = new URL(req.url ?? '/', 'http://x');
    const chunks: Buffer[] = [];
    for await (const c of req) chunks.push(c as Buffer);
    const body = Buffer.concat(chunks).toString();
    if (u.pathname === '/token') {
      state.tokenCalls++;
      const assertion = new URLSearchParams(body).get('assertion') ?? '';
      const [h, c, sig] = assertion.split('.');
      const ok = createVerify('RSA-SHA256').update(`${h}.${c}`).verify(publicKey, Buffer.from(sig ?? '', 'base64url'));
      if (!ok) { res.writeHead(400); return res.end('{"error":"invalid_grant"}'); }
      const claims = JSON.parse(Buffer.from(c, 'base64url').toString());
      state.lastSub = claims.sub; state.lastScope = claims.scope;
      res.writeHead(200, { 'content-type': 'application/json' });
      return res.end(JSON.stringify({ access_token: 'tok', expires_in: 3600 }));
    }
    if (req.headers.authorization !== 'Bearer tok') { res.writeHead(401); return res.end('{}'); }
    const tabRange = (r: string) => { const m = r.match(/^'(.+)'!(.+)$/); return m ? { tab: m[1].replace(/''/g, "'"), range: m[2] } : null; };
    const json = (code: number, b: unknown) => { res.writeHead(code, { 'content-type': 'application/json' }); res.end(JSON.stringify(b)); };
    if (u.pathname === '/v4/spreadsheets' && req.method === 'POST') {
      const b = JSON.parse(body); state.creates++;
      const id = `sheet-${state.creates}`;
      state.written[id] = Object.fromEntries(b.sheets.map((x: any) => [x.properties.title, []]));
      return json(200, { spreadsheetId: id });
    }
    const meta = u.pathname.match(/^\/v4\/spreadsheets\/([^/:]+)$/);
    if (meta && req.method === 'GET') {
      const id = decodeURIComponent(meta[1]);
      const titles = [...Object.keys(state.written[id] ?? {}), ...Object.keys(state.tabs)];
      return json(200, { sheets: titles.map((title) => ({ properties: { title } })) });
    }
    const upd = u.pathname.match(/^\/v4\/spreadsheets\/([^/]+):batchUpdate$/);
    if (upd && req.method === 'POST') {
      const id = decodeURIComponent(upd[1]);
      for (const r of JSON.parse(body).requests) if (r.addSheet) (state.written[id] ??= {})[r.addSheet.properties.title] = [];
      return json(200, {});
    }
    const put = decodeURIComponent(u.pathname).match(/^\/v4\/spreadsheets\/([^/]+)\/values\/'(.+)'!A(\d+)$/);
    if (put && req.method === 'PUT') {
      state.writes++; state.maxWriteBytes = Math.max(state.maxWriteBytes, body.length);
      const tabRows = ((state.written[put[1]] ??= {})[put[2].replace(/''/g, "'")] ??= []);
      JSON.parse(body).values.forEach((row: any[], i: number) => { tabRows[Number(put[3]) - 1 + i] = row.map(String); });
      return json(200, {});
    }
    const values = decodeURIComponent(u.pathname).match(/\/values\/(.+)$/);
    if (values) {
      const t = tabRange(values[1]);
      if (!t || !state.tabs[t.tab]) { res.writeHead(400); return res.end('{"error":"Unable to parse range"}'); }
      res.writeHead(200, { 'content-type': 'application/json' });
      return res.end(JSON.stringify({ values: t.range === 'A:ZZ' ? state.tabs[t.tab] : [state.tabs[t.tab][0]] }));
    }
    if (u.pathname.endsWith('/values:batchGet')) {
      const out = u.searchParams.getAll('ranges').map((r) => {
        const t = tabRange(r)!;
        const i = colIndex(t.range.split(':')[0]);
        return { values: [state.tabs[t.tab].map((row) => row[i] ?? '')] };
      });
      res.writeHead(200, { 'content-type': 'application/json' });
      return res.end(JSON.stringify({ valueRanges: out }));
    }
    res.writeHead(404); res.end();
  });
  await new Promise<void>((r) => server.listen(0, () => r()));
  state.url = `http://localhost:${(server.address() as { port: number }).port}`;
  const dir = mkdtempSync(path.join(tmpdir(), 'gsa-'));
  state.keyFile = path.join(dir, 'google-sa.json');
  writeFileSync(state.keyFile, JSON.stringify({
    client_email: 'engine@test.iam.gserviceaccount.com',
    private_key: privateKey.export({ type: 'pkcs8', format: 'pem' }),
    token_uri: `${state.url}/token`,
  }));
  state.close = () => server.close();
  return state;
}

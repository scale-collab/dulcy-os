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
  close(): void;
}

function colIndex(letters: string): number {
  let n = 0;
  for (const ch of letters) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}

export async function startFakeGoogle(): Promise<FakeGoogle> {
  const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const state: FakeGoogle = { url: '', keyFile: '', tabs: {}, tokenCalls: 0, close: () => undefined };
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
      state.lastSub = JSON.parse(Buffer.from(c, 'base64url').toString()).sub;
      res.writeHead(200, { 'content-type': 'application/json' });
      return res.end(JSON.stringify({ access_token: 'tok', expires_in: 3600 }));
    }
    if (req.headers.authorization !== 'Bearer tok') { res.writeHead(401); return res.end('{}'); }
    const tabRange = (r: string) => { const m = r.match(/^'(.+)'!(.+)$/); return m ? { tab: m[1].replace(/''/g, "'"), range: m[2] } : null; };
    const values = decodeURIComponent(u.pathname).match(/\/values\/(.+)$/);
    if (values) {
      const t = tabRange(values[1]);
      if (!t || !state.tabs[t.tab]) { res.writeHead(400); return res.end('{"error":"Unable to parse range"}'); }
      res.writeHead(200, { 'content-type': 'application/json' });
      return res.end(JSON.stringify({ values: [state.tabs[t.tab][0]] }));
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

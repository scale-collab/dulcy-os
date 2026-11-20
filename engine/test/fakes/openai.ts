// Fake OpenAI chat completions: returns the profile JSON the test sets, counts calls.
import http from 'node:http';
export interface FakeOpenAI { url: string; calls: number; status: number; answer: Record<string, unknown>; lastUser: string; close(): void }
export async function startFakeOpenAI(): Promise<FakeOpenAI> {
  const s: FakeOpenAI = { url: '', calls: 0, status: 200, answer: {}, lastUser: '', close: () => undefined };
  const server = http.createServer(async (req, res) => {
    const chunks: Buffer[] = []; for await (const c of req) chunks.push(c as Buffer);
    s.calls++;
    try { const m = JSON.parse(Buffer.concat(chunks).toString()).messages; s.lastUser = m[m.length - 1].content; } catch { /* ignore */ }
    res.setHeader('content-type', 'application/json');
    if (s.status !== 200) { res.statusCode = s.status; return res.end('{"error":{"message":"nope"}}'); }
    res.end(JSON.stringify({ choices: [{ message: { content: JSON.stringify(s.answer) } }] }));
  });
  await new Promise<void>((r) => server.listen(0, () => r()));
  s.url = `http://127.0.0.1:${(server.address() as any).port}`;
  s.close = () => server.close();
  return s;
}

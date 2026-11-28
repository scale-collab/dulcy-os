import { test } from 'node:test';
import assert from 'node:assert/strict';
import { decide } from '../src/hq/decisions.js';
import { DECISIONS, DF } from '../src/decisions/fields.js';

// Alex 2026-11-27: approving a card that runs nothing = the agent does it (no extra "fix it" button).
function fakeAt(fields: Record<string, unknown>) {
  const updates: any[] = [];
  return { updates, at: { get: async (t: string) => (t === DECISIONS ? { id: 'recAAAAAAAAAAAAAA', fields } : null), update: async (t: string, id: string, f: any) => { updates.push({ t, id, f }); return { id, fields: f }; } } as any };
}
const base = { [DF.title]: 'Riley: one reply not saved', [DF.agent]: 'Riley', [DF.status]: 'Waiting', [DF.client]: 'Dulcy (systems)', [DF.issue]: 'Intake refused a reply', [DF.checked]: 'Node X', [DF.fix]: 'Open execution 1 and check the lead' };

test('approving a no-action agent card returns a task for that agent', async () => {
  const { at, updates } = fakeAt({ ...base, [DF.action]: 'None' });
  const r = await decide(at, 'recAAAAAAAAAAAAAA', 'approve', 'Alex', { canSeeMoney: true });
  assert.equal(r.status, 200);
  assert.equal(r.todo?.agent, 'Riley');
  assert.match(r.todo!.detail, /Approved fix: Open execution 1/);
  assert.equal(updates.at(-1).f[DF.status], 'Approved');
});

test('rejecting it, or approving a card with its own action, makes no task', async () => {
  const a = fakeAt({ ...base, [DF.action]: 'None' });
  assert.equal((await decide(a.at, 'recAAAAAAAAAAAAAA', 'reject', 'Alex', { canSeeMoney: true })).todo, undefined);
  const b = fakeAt({ ...base, [DF.action]: 'Apply Riley Fix' });
  assert.equal((await decide(b.at, 'recAAAAAAAAAAAAAA', 'approve', 'Alex', { canSeeMoney: true })).todo, undefined);
});

test('Riley sees what came into a failed n8n run: ids kept, emails masked, secrets dropped', async () => {
  const { executionInput } = await import('../src/agents/riley.js');
  const x = { data: { resultData: { runData: { Webhook: [{ data: { main: [[{ json: { body: { data: { lead: { id: 4821, email: 'jane.doe@acme.com' }, reply: { from_email_address: 'bob@acme.com' } }, api_key: 'sk-secret' }, headers: { authorization: 'Bearer x' } } }]] } }] } } } };
  const lines = executionInput(x);
  assert.ok(lines.includes('body.data.lead.id: 4821'));
  assert.ok(lines.some((l) => l.startsWith('body.data.reply.from_email_address: ') && !l.includes('bob@acme.com')));
  assert.ok(!lines.some((l) => /sk-secret|Bearer/.test(l)));
});

test('Cheap Inboxes: no renewal field → next yearly anniversary of created_at', async () => {
  const { parseDomain, nextAnniversary } = await import('../src/providers/cheapInboxes.js');
  assert.equal(nextAnniversary('2025-06-15T10:00:00.000Z', new Date('2026-11-28T00:00:00Z')), '2027-06-15');
  assert.equal(nextAnniversary('2026-02-01T00:00:00Z', new Date('2026-01-10T00:00:00Z')), '2027-02-01');
  const d = parseDomain({ domain: 'acme.com', created_at: '2025-12-01T00:00:00Z', auto_renew: true });
  assert.ok(d && /^\d{4}-12-01$/.test(d.renewal));
});

test('Cheap Inboxes: reads every page by offset and prices inboxes from the volume tier', async () => {
  const ci = await import('../src/providers/cheapInboxes.js');
  const doms = Array.from({ length: 230 }, (_, i) => ({ domain: `d${i}.com`, created_at: '2025-10-08T00:00:00Z' }));
  const mbs = Array.from({ length: 150 }, (_, i) => ({ full_email: `a@d${i % 50}.com`, status: 'active' }));
  const seen: string[] = [];
  const f = (async (url: string) => {
    seen.push(url);
    const u = new URL(url); const off = Number(u.searchParams.get('offset') ?? 0); const lim = Number(u.searchParams.get('limit') ?? 100);
    const json = (b: any) => ({ ok: true, status: 200, json: async () => b });
    if (u.pathname.includes('/pricing/')) return json({ basePriceCents: 350, tiers: [{ minQty: 0, maxQty: 99, priceCents: 350 }, { minQty: 100, maxQty: 249, priceCents: 325 }] });
    if (u.pathname.endsWith('/domains')) return json({ domains: doms.slice(off, off + lim), pagination: { total: doms.length, limit: lim, offset: off } });
    if (u.pathname.endsWith('/mailboxes')) return json({ mailboxes: mbs.slice(off, off + lim), pagination: { total: mbs.length, limit: lim, offset: off } });
    return json({ basePriceCents: 350, tiers: [{ minQty: 0, maxQty: 99, priceCents: 350 }, { minQty: 100, maxQty: 249, priceCents: 325 }] });
  }) as unknown as typeof fetch;
  const r = await ci.readCheapInboxes({ apiKey: 'k', baseUrl: 'https://x/v1', authHeader: '' }, f);
  assert.equal(r.error, '');
  assert.equal(r.domains.size, 230);
  assert.equal(r.mailboxPrice, 3.25);
  assert.equal(r.domains.get('d1.com')?.mailboxes, 3);
  assert.equal(r.domains.get('d1.com')?.monthly, 3.25);
  assert.equal(ci.tierPrice({ tiers: [{ minQty: 0, maxQty: null, priceCents: 275 }] }, 5), 2.75);
  assert.equal(ci.tierPrice(null, 5), null);
});

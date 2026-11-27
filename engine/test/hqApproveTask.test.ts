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

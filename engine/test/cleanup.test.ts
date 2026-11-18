import { test } from 'node:test';
import assert from 'node:assert/strict';
import { planCleanup } from '../src/campaign/cleanup.js';

const campaign = { id: 648, name: 'ENGINE TEST - do not launch - X', status: 'Draft', created_at: '2026-11-18T02:00:00Z' };
const fresh = { created_at: '2026-11-18T02:05:00Z', overall_stats: { emails_sent: 0, replies: 0 } };

test('cleanup deletes only leads the test created and never emailed', () => {
  const p = planCleanup({
    campaign,
    leads: [
      { id: 1, ...fresh },
      { id: 2, created_at: '2025-01-01T00:00:00Z', overall_stats: { emails_sent: 0 } }, // client's own lead, older
      { id: 3, created_at: '2026-11-18T02:06:00Z', overall_stats: { emails_sent: 2 } }, // emailed somewhere
      { id: 4, overall_stats: {} }, // no creation time: kept
    ],
    variables: [
      { id: 10, name: 'Email Type', created_at: '2026-11-18T02:04:00Z' },
      { id: 11, name: 'Verification Path', created_at: '2024-05-01T00:00:00Z' }, // client already had it
      { id: 12, name: 'DULCY_VERIFICATION_99', created_at: '2026-11-18T02:04:00Z' },
      { id: 13, name: 'linkedin', created_at: '2026-11-18T02:04:00Z' }, // not ours by name
    ],
    leadLists: [{ id: 7, name: 'ENGINE TEST - do not launch - X Leads [abc] part 1 of 1' }, { id: 8, name: 'Client list' }],
    testVariableNames: ['Email Type', 'Verification Path'],
  });
  assert.deepEqual(p.deleteLeadIds, [1]);
  assert.deepEqual(p.keptLeads, { notOurs: 2, contacted: 1 });
  assert.deepEqual(p.deleteVariables.map((v) => v.id), [10, 12]);
  assert.deepEqual(p.keptVariables, ['Verification Path']);
  assert.deepEqual(p.leadLists.map((l) => l.id), [7]);
});

test('cleanup refuses anything that is not an ENGINE TEST draft', () => {
  const base = { leads: [], variables: [], leadLists: [], testVariableNames: [] };
  assert.throws(() => planCleanup({ ...base, campaign: { ...campaign, name: 'Client Q4 campaign' } }), /not an ENGINE TEST/);
  assert.throws(() => planCleanup({ ...base, campaign: { ...campaign, status: 'active' } }), /not a draft/);
  assert.throws(() => planCleanup({ ...base, campaign: { ...campaign, created_at: undefined } }), /no creation time/);
  assert.throws(() => planCleanup({ ...base, campaign: null }), /not found/);
});

// HQ round 5 → Campaigns (Alex 2026-11-28): Dulcy (EmailBison workspace 2) and Dulcy Free Campaigns
// (workspace 41) are two clients everywhere (client lists, campaign client picker, sender / capacity
// counts, deliverability per-client numbers, results per client); the Past view; Atlas's take on a
// campaign (rule-based, never invented). Pure functions only: no service is called.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { clientKey, groupWorkspaces, internalLabel, isFreeCampaigns } from '../src/hq/clients.js';
import { KF, buildRows, clientIndex, endedAt, pastFirst, type CampaignRow, type CampaignsSource } from '../src/hq/campaigns.js';
import { sendingByClient } from '../src/hq/sendingAccounts.js';
import { buildDeliverability, clientKeyOfWs, type DelivSource, type InboxRow } from '../src/hq/deliverability.js';
import { EA } from '../src/stages/accountHealth.js';
import { atlasTake, judgeRate, sentence, TAKE_NOTE_DAYS } from '../src/hq/atlasTake.js';

const NOW = Date.parse('2026-11-28T15:00:00.000Z');
const D = (days: number) => new Date(NOW - days * 86_400_000).toISOString();
const WS = [
  { id: 'recDULCY000000001', fields: { Name: 'Dulcy', Status: 'Active', 'Client Type': 'Internal', ID: 2 } },
  // Even with a Client link back to Dulcy, Free Campaigns stays its own client.
  { id: 'recDULFREE0000001', fields: { Name: 'Dulcy Free Campaigns', Status: 'Active', 'Client Type': 'Free / Trial', ID: 41, Client: ['recDULCY000000001'] } },
  { id: 'recTWMOLD00000001', fields: { Name: 'Twenty West Media', Status: 'Inactive', 'Client Type': 'Paying Client', ID: 65 } },
  { id: 'recTWMINT00000001', fields: { Name: 'Twenty West Media (Internal)', Status: 'Active', 'Client Type': 'Paying Client', ID: 66 } },
];

test('round 5: Dulcy and Dulcy Free Campaigns are two clients; the Twenty West pair still counts once', () => {
  assert.equal(clientKey('Dulcy Free Campaigns'), 'dulcyfreecampaigns');
  assert.equal(clientKey('Dulcy'), 'dulcy');
  assert.equal(clientKey('Twenty West Media (Internal)'), clientKey('Twenty West Media'), 'the Twenty West pair is intentional (one client, two records)');
  assert.equal(clientKey('Acme Trial'), 'acme', 'a trailing Trial still folds');
  assert.equal(isFreeCampaigns('Dulcy Free Campaigns'), true);
  assert.equal(isFreeCampaigns('Dulcy'), false);
  assert.deepEqual([internalLabel('Dulcy'), internalLabel('Dulcy Free Campaigns')], ['Dulcy itself', 'Free campaigns']);
  assert.deepEqual(groupWorkspaces(WS).map((g) => g.map((w) => w.id).sort()),
    [['recDULCY000000001'], ['recDULFREE0000001'], ['recTWMINT00000001', 'recTWMOLD00000001']]);
  const idx = clientIndex(WS);
  assert.deepEqual(idx.get('recDULCY000000001'), { key: 'dulcy', name: 'Dulcy', active: true });
  assert.deepEqual(idx.get('recDULFREE0000001'), { key: 'dulcyfreecampaigns', name: 'Dulcy Free Campaigns', active: true });
  assert.equal(idx.get('recTWMOLD00000001')!.key, idx.get('recTWMINT00000001')!.key);
  // Deliverability's per-workspace key (pending purchases, renewals) splits the same way.
  assert.deepEqual([clientKeyOfWs({ ws: WS }, 'recDULCY000000001'), clientKeyOfWs({ ws: WS }, 'recDULFREE0000001')], ['dulcy', 'dulcyfreecampaigns']);
});

test('round 5: campaign rows, the client picker key and sender counts are per workspace (2 vs 41)', () => {
  const rec = (id: string, f: Record<string, unknown>) => ({ id, fields: f });
  const src: CampaignsSource = {
    ws: WS, lists: [], plans: [], changes: new Map(), readAt: '',
    campaigns: [
      rec('recCDULCY00000001', { [KF.name]: 'Dulcy - Agencies', [KF.status]: 'Active', [KF.client]: ['recDULCY000000001'], [KF.progress]: 0.2, [KF.sent]: 1000, [KF.interested]: 5, [KF.emailAccounts]: ['recINBOX000000001'] }),
      rec('recCCHOP00000001', { [KF.name]: 'Chop Shop - free campaign', [KF.status]: 'Active', [KF.client]: ['recDULFREE0000001'], [KF.progress]: 0.1, [KF.sent]: 300, [KF.emailAccounts]: ['recINBOX000000002'] }),
    ],
  };
  const rows = buildRows(src, NOW);
  assert.deepEqual(rows.map((r) => [r.name, r.clientKey, r.client]), [['Dulcy - Agencies', 'dulcy', 'Dulcy'], ['Chop Shop - free campaign', 'dulcyfreecampaigns', 'Dulcy Free Campaigns']]);

  const inbox = (id: string, key: string, client: string): InboxRow => ({ id, email: `${id}@x.com`, clientKey: key, client, connection: 'Connected', dailyLimit: 30, status: 'healthy' } as unknown as InboxRow);
  const inboxes = [inbox('recINBOX000000001', 'dulcy', 'Dulcy'), ...Array.from({ length: 20 }, (_, i) => inbox(i === 0 ? 'recINBOX000000002' : `recFREE${String(i).padStart(10, '0')}`, 'dulcyfreecampaigns', 'Dulcy Free Campaigns'))];
  const camps = rows.map((r) => ({ id: r.id, name: r.name, status: r.status, stage: r.stage, progress: r.progress, clientKey: r.clientKey, accountIds: r.id === 'recCDULCY00000001' ? ['recINBOX000000001'] : ['recINBOX000000002'] }));
  const lines = sendingByClient(inboxes, camps, [{ key: 'dulcy', name: 'Dulcy' }, { key: 'dulcyfreecampaigns', name: 'Dulcy Free Campaigns' }], undefined, NOW);
  const by = new Map(lines.map((l) => [l.key, l]));
  assert.deepEqual([by.get('dulcy')!.total, by.get('dulcy')!.counts.sending, by.get('dulcy')!.capacity], [1, 1, 30]);
  assert.deepEqual([by.get('dulcyfreecampaigns')!.total, by.get('dulcyfreecampaigns')!.counts.sending, by.get('dulcyfreecampaigns')!.counts.available, by.get('dulcyfreecampaigns')!.capacity], [20, 1, 19, 600],
    "Alex's 20 inboxes in Free Campaigns count there, not under Dulcy");
});

test('round 5: Deliverability per-client numbers split Dulcy (2) and Free Campaigns (41)', () => {
  const acc = (id: string, email: string, bison: string) => ({ id, fields: { [EA.email]: email, [EA.workspaceId]: bison } });
  const src: DelivSource = {
    ws: WS, domains: [], tests: [], newestTest: null, queue: [], purchases: [], decisions: [], runs: [], readAt: '',
    accounts: [acc('recACC0000000001', 'a@dulcy.io', '2'), acc('recACC0000000002', 'b@dulcyfree.com', '41'), acc('recACC0000000003', 'c@dulcyfree.com', '41')],
  };
  const m = buildDeliverability(src, { airtableBaseId: 'app', accountHealthEveryMin: 0, accountHealthFrom: '', dryRun: true, liveStages: [] }, new Date(NOW));
  assert.deepEqual(m.inboxes.map((i) => [i.email, i.clientKey]), [['a@dulcy.io', 'dulcy'], ['b@dulcyfree.com', 'dulcyfreecampaigns'], ['c@dulcyfree.com', 'dulcyfreecampaigns']]);
  assert.deepEqual(m.clients.map((c) => [c.key, c.tiles.total]).sort(), [['dulcy', 1], ['dulcyfreecampaigns', 2]]);
});

test('round 5: past campaigns: ended date, newest ended first, read only rows', () => {
  assert.equal(endedAt({ completedAt: '2026-11-01', statusModified: '2026-11-03', updatedAt: '' }), '2026-11-01');
  assert.equal(endedAt({ completedAt: '', statusModified: '2026-11-03', updatedAt: '2026-11-05' }), '2026-11-03');
  const rec = (id: string, f: Record<string, unknown>) => ({ id, fields: f });
  const src: CampaignsSource = {
    ws: WS, lists: [], plans: [], changes: new Map(), readAt: '',
    campaigns: [
      rec('recCPAST00000001', { [KF.name]: 'Old A', [KF.status]: 'Completed', [KF.client]: ['recDULCY000000001'], [KF.sent]: 4000, [KF.completedAt]: '2026-10-01T12:00:00.000Z', [KF.startedAt]: '2026-09-01T12:00:00.000Z' }),
      rec('recCPAST00000002', { [KF.name]: 'Old B', [KF.status]: 'Inactive', [KF.client]: ['recDULFREE0000001'], [KF.sent]: 200, [KF.statusModified]: '2026-11-20T12:00:00.000Z' }),
      rec('recCLIVE00000001', { [KF.name]: 'Live', [KF.status]: 'Active', [KF.client]: ['recDULCY000000001'], [KF.sent]: 100, [KF.startedAt]: '2026-11-20T12:00:00.000Z' }),
    ],
  };
  const rows = buildRows(src, NOW);
  const past = rows.filter((r) => r.group === 'done').sort(pastFirst);
  assert.deepEqual(past.map((r) => [r.name, r.ended.slice(0, 10), r.needs.length]), [['Old B', '2026-11-20', 0], ['Old A', '2026-10-01', 0]], 'newest ended first; no actions on a finished campaign');
  assert.equal(past[1].started.slice(0, 10), '2026-09-01');
  assert.equal(rows.find((r) => r.name === 'Live')!.ended, '', 'a live campaign has no end date');
});

const row = (o: Partial<CampaignRow> = {}) => ({
  group: 'live', status: 'Active', progress: 0.42, sent: 3000, contacted: 1500, totalLeads: 3600, interested: 21, booked: 6, bounce: 1.2, flag: null, needs: [], now: null, planned: false, ...o,
}) as Parameters<typeof atlasTake>[0];
const RATE = 5 / 1000; // agency: 5 interested per 1,000 sent

test("round 5: Atlas's take: 2-3 sentences, only the campaign's own numbers", () => {
  const good = atlasTake(row(), { agencyRate: RATE, now: NOW });
  assert.deepEqual(good.lines, [
    '42% of the list used (1,500 of 3,600 leads): 21 interested replies and 6 meetings from 3,000 emails.',
    "That is 7 interested per 1,000 sent, well above the agency's 5.",
    'Nothing to change now: keep it sending.',
  ]);
  assert.equal(good.basis, 'numbers');
  assert.match(good.source, /numbers/);

  const pause = atlasTake(row({ bounce: 4.6, flag: 'pause', progress: 0.72, needs: [{ kind: 'pause', agent: 'Atlas', text: 'Bounce 4.6%: pause and investigate.' }, { kind: 'next', agent: 'Atlas', text: 'At 72% sent: plan the next campaign.' }] }), { agencyRate: RATE, now: NOW });
  assert.equal(pause.lines[1], 'Bounce is 4.6%, over the 4% limit: it should be paused and the list checked.');
  assert.equal(pause.lines[2], 'Next: At 72% sent: plan the next campaign.');
  assert.equal(pause.lines.length, 3);

  const early = atlasTake(row({ sent: 300, contacted: 300, interested: 0, booked: 0 }), { agencyRate: RATE, now: NOW });
  assert.equal(early.lines[1], 'Too early to judge: under 500 emails sent.');
  const weak = atlasTake(row({ interested: 30, booked: 2 }), { agencyRate: RATE, now: NOW });
  assert.equal(weak.lines[2], 'Only 2 of 30 interested booked a meeting: Echo should push the follow-ups.');
  assert.equal(judgeRate(0, 1500, RATE), 'No interested reply after 1,500 emails: the list or the offer is not landing.');
  assert.equal(judgeRate(4, 1000, RATE), "That is 4 interested per 1,000 sent, a bit under the agency's 5.");
  assert.equal(judgeRate(2, 1000, RATE), "That is 2 interested per 1,000 sent, well under the agency's 5: a new vertical or a copy test is due.");
  assert.equal(judgeRate(5, 1000, undefined), 'That is 5 interested per 1,000 sent.', 'no agency average: no comparison invented');
});

test("round 5: Atlas's take uses his stored plan and his newest note; finished and building campaigns", () => {
  const plan = { id: 12, move: 'top_off', why: 'At the agency average (6.1 vs 6.8 per 1,000): top off with lookalikes of the companies that replied.' };
  const planned = atlasTake(row(), { agencyRate: RATE, plan, now: NOW });
  assert.equal(planned.lines[2], 'I planned it as a top-off: At the agency average (6.1 vs 6.8 per 1,000): top off with lookalikes of the companies that replied.');
  assert.deepEqual([planned.basis, planned.source], ['plan', "From the campaign's numbers and Atlas's plan #12."]);

  const noted = atlasTake(row(), { agencyRate: RATE, note: { when: D(1), event: 'Bounce check: fine' }, now: NOW });
  assert.match(noted.lines[2], /^My last note \(11\/27\): Bounce check: fine\.$/, 'dates with slashes');
  assert.equal(noted.basis, 'note');
  const stale = atlasTake(row(), { agencyRate: RATE, note: { when: D(TAKE_NOTE_DAYS + 1), event: 'Old note' }, now: NOW });
  assert.equal(stale.basis, 'numbers', 'a note older than 14 days is not what Atlas thinks now');

  const done = atlasTake(row({ group: 'done', status: 'Completed', ended: '2026-10-01T16:00:00.000Z', sent: 5000, contacted: 2500, interested: 40, booked: 8, bounce: 1.9 }), { agencyRate: RATE, now: NOW });
  assert.deepEqual(done.lines, ['Finished 10/1: 40 interested replies and 8 meetings from 5,000 emails to 2,500 leads, bounce 1.9%.', "That was 8 interested per 1,000 sent, well above the agency's 5."]);
  assert.equal(judgeRate(2, 1000, RATE, true), "That was 2 interested per 1,000 sent, well under the agency's 5.", 'no next step on a finished campaign');
  const small = atlasTake(row({ group: 'done', status: 'Inactive', sent: 200, contacted: 0, interested: 1, booked: 0, bounce: 0 }), { agencyRate: RATE, now: NOW });
  assert.deepEqual(small.lines, ['Stopped: 1 interested reply and 0 meetings from 200 emails, bounce 0%.', 'Under 500 emails sent: too few to judge.']);

  const building = atlasTake(row({ group: 'building', status: 'Draft', sent: 0, now: { key: 'copy', label: 'Copy', note: 'internal review', state: 'now' } }), { agencyRate: RATE, now: NOW });
  assert.deepEqual(building.lines, ['Not sending yet: it is at Copy (internal review).', 'Scribe has the next step.']);
  assert.equal(sentence('a '.repeat(200), 20).length <= 20, true, 'long stored text is cut, never spills');
});

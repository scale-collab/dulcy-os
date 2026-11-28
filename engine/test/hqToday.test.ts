// HQ Today, round 2 (Alex 2026-11-27): campaigns grouped by how they are doing (not by bounce alone),
// the weekly scorecard (this week vs the same days last week), what each agent did in 24 h in plain
// words, and the founder items in "Needs you" (sales calls today, clients at risk).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { agencyRate, agentDay, campaignGroups, campaignHow, eventKind, scorecard, slashDay, weekSpans, type HowRow } from '../src/hq/today.js';
import { aggregateNeeds } from '../src/hq/needs.js';
import type { CampaignRow } from '../src/hq/campaigns.js';

const row = (over: Partial<HowRow> = {}): HowRow => ({ id: 'recC', name: 'Roofers', client: 'Twenty West', sent: 5000, interested: 10, booked: 2, progress: 0.4, bounce: 1, needs: [], ...over });
const RATE = 2 / 1000; // agency: 2 interested per 1,000 sent

test('how a campaign is doing: results first, bounce over 4% still needs a look', () => {
  assert.equal(campaignHow(row({ interested: 15, booked: 4 }), RATE).how, 'well', '3 per 1,000 and meetings keeping up');
  assert.equal(campaignHow(row({ interested: 10 }), RATE).how, 'pace', 'the agency average');
  assert.equal(campaignHow(row({ interested: 4 }), RATE).how, 'look', 'under 60% of the average');
  assert.equal(campaignHow(row({ sent: 300, interested: 0 }), RATE).how, 'time', 'too early to judge');
  assert.equal(campaignHow(row({ sent: 1500, interested: 0 }), RATE).how, 'look', 'a lot sent and nobody interested');
  const bounce = campaignHow(row({ interested: 15, booked: 4, bounce: 5.2 }), RATE);
  assert.equal(bounce.how, 'look'); assert.match(bounce.why, /Bounce 5\.2%: over 4%/);
  // A 3% bounce is a signal on a campaign that performs; it does not move it.
  const watch = campaignHow(row({ interested: 15, booked: 4, bounce: 3.1 }), RATE);
  assert.equal(watch.how, 'well'); assert.deepEqual(watch.signals, ['Bounce 3.1% (watch)']);
  // Many interested but meetings behind: on pace, with the signal.
  const behind = campaignHow(row({ interested: 20, booked: 1 }), RATE);
  assert.equal(behind.how, 'pace'); assert.match(behind.signals.join(), /Meetings behind: 1 meeting from 20 interested/);
  assert.equal(campaignHow(row({ needs: [{ kind: 'failed', agent: 'Riley', text: 'Build or launch failed.' }] }), RATE).how, 'look');
  assert.match(campaignHow(row({ interested: 15, booked: 4 }), RATE).why, /^3 interested per 1,000 sent \(agency 2\) · 4 meetings from 15 interested$/);
});

test('campaign groups: live campaigns of active clients only, four groups in a fixed order', () => {
  const live = (id: string, over: Partial<CampaignRow>) => ({ ...row(), id, name: id, group: 'live', clientActive: true, ...over }) as unknown as CampaignRow;
  const rows = [
    live('A', { interested: 15, booked: 4 }), live('B', { interested: 10 }), live('C', { sent: 200, interested: 0 }), live('D', { interested: 2 }),
    live('E', { clientActive: false, interested: 15 }), { ...live('F', { interested: 15 }), group: 'done' } as CampaignRow,
  ];
  const g = campaignGroups(rows);
  assert.equal(g.live, 4);
  assert.deepEqual(g.groups.map((x) => [x.key, x.label, x.campaigns.map((c) => c.id)]), [
    ['look', 'Needs a look', ['D']], ['well', 'Performing well', ['A']], ['pace', 'On pace', ['B']], ['time', 'Needs more time', ['C']],
  ]);
  assert.equal(agencyRate([{ sent: 400, interested: 9 }, { sent: 1000, interested: 2 }]), 0.002, 'campaigns under 500 sent do not count');
});

test('weekly scorecard: Monday to today vs the same days last week, dates with slashes', () => {
  const now = Date.parse('2026-11-27T20:00:00Z'); // Friday, New York
  const w = weekSpans(now);
  assert.deepEqual([w.thisWeek.label, w.lastWeek.label], ['11/23–11/27', '11/16–11/20']);
  const s = scorecard([
    { status: 'Interested', repliedAt: '2026-11-24T15:00:00Z', bookedAt: '' },
    { status: 'Meeting Request', repliedAt: '2026-11-25T15:00:00Z', bookedAt: '2026-11-26T15:00:00Z' },
    { status: 'Not Interested', repliedAt: '2026-11-25T15:00:00Z', bookedAt: '' },
    { status: 'Interested', repliedAt: '2026-11-17T15:00:00Z', bookedAt: '2026-11-18T15:00:00Z' },
    { status: 'Interested', repliedAt: '2026-11-21T15:00:00Z', bookedAt: '' }, // Saturday last week: after the same days
  ], [{ date: '2026-11-24', sent: 300 }, { date: '2026-11-26', sent: 250 }, { date: '2026-11-17', sent: 400 }, { date: '2026-11-22', sent: 99 }], now);
  assert.deepEqual([s.thisWeek.interested, s.thisWeek.booked, s.thisWeek.sent], [2, 1, 550]);
  assert.deepEqual([s.lastWeek.interested, s.lastWeek.booked, s.lastWeek.sent], [1, 1, 400]);
  assert.equal(scorecard([], null, now).thisWeek.sent, null, 'emails sent UNKNOWN when Email Analytics cannot be read');
  assert.equal(slashDay('2026-11-07'), '11/7');
});

test('what each agent did in 24 h, in plain words; engine steps count for Atlas', () => {
  assert.equal(eventKind('Account rested 7 days: a@dulcyx.info'), 'Account rested 7 days');
  assert.equal(eventKind('Launch: done'), 'Launch: done');
  const d = agentDay([
    { agent: 'Atlas', type: 'Fixed', event: 'Account rested 7 days: a@x.io' }, { agent: 'Atlas', type: 'Fixed', event: 'Account rested 7 days: b@x.io' },
    { agent: 'Engine', type: 'Step done', event: 'Launch: done' }, { agent: 'Sean', type: 'Info', event: 'Reply sent: Pete' },
    { agent: 'Atlas', type: 'Step failed', event: 'Build campaign: failed' },
  ], ['Atlas', 'Echo', 'Riley']);
  assert.deepEqual(d.map((x) => [x.agent, x.count, x.failed, x.line]), [
    ['Atlas', 4, 1, '2× Account rested 7 days · Build campaign: failed · Launch: done'],
    ['Echo', 1, 0, 'Reply sent'],
    ['Riley', 0, 0, 'Nothing done in the last 24 hours'],
  ]);
});

test("Needs you: sales calls today and clients at risk are on the founder's list (owner only)", () => {
  const src = {
    owner: true, decisions: [], issues: [], signups: 0, asks: [], now: Date.parse('2026-11-27T14:00:00Z'),
    calls: [{ dealId: 'recD1', name: 'Nick Wendt', company: 'Big Pixel', prep: true }, { dealId: 'recD2', name: 'Ann Lee', company: 'Acme', prep: false }],
    clients: [{ id: 'recW1', name: 'Twenty West', health: 'at_risk' as const, problem: '4 meetings of 10 promised this month.' }, { id: 'recW2', name: 'MJJ', health: 'attention' as const, problem: 'No meeting in 30 days.' }],
  };
  const items = aggregateNeeds(src);
  assert.deepEqual(items.map((i) => i.key), ['calls', 'clients']);
  assert.equal(items[0].title, '2 sales calls today: Nick Wendt and Ann Lee');
  assert.equal(items[0].why, "Cole's prep is ready for 1 of 2.");
  assert.equal(items[1].title, '1 client needs a lot of attention, 1 client is at risk: MJJ and Twenty West');
  assert.equal(items[1].group, 'now');
  assert.deepEqual(aggregateNeeds({ ...src, owner: false }).map((i) => i.key), [], 'members never get them');
});

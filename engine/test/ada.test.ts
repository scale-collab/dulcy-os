// Ada's morning brief: exact counts from fixed data; one post per weekday, none at weekends.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { writeBrief, type BriefData } from '../src/agents/ada.js';
import { adaTick } from '../src/scheduler.js';
import { loadConfig } from '../src/config.js';

const now = new Date('2026-11-25T13:00:00Z'); // Wed 8:00 AM ET
const h = (hoursAgo: number) => new Date(now.getTime() - hoursAgo * 3_600_000).toISOString();
function data(over: Partial<BriefData> = {}): BriefData {
  return {
    now, clientName: (ws) => ({ '66': 'Twenty West', '2': 'Dulcy' } as Record<string, string>)[ws] ?? `workspace ${ws}`, purchases: 1,
    decisions: [
      { title: 'Reply to Jane at Acme', agent: 'Sean', created: h(30) },
      { title: 'Follow-up 1 to Bob at Beta', agent: 'Sean', created: h(5) },
      { title: 'Bounce 5.2% on TW Food: Spam problem: our sending domains', agent: 'Atlas', created: h(2) },
    ],
    replies: [
      { ws: '66', status: 'Interested', state: 'Needs Approval', sentAt: '', repliedAt: h(3), bookedAt: '' },
      { ws: '66', status: 'Meeting Request', state: '', sentAt: h(2), repliedAt: h(10), bookedAt: h(1) },
      { ws: '2', status: 'Not Interested', state: '', sentAt: '', repliedAt: h(4), bookedAt: '' },
      { ws: '2', status: 'Interested', state: '', sentAt: '', repliedAt: h(50), bookedAt: '' },
    ],
    campaigns: [
      { name: 'TW Food Direct', client: 'Twenty West', bounce: 5.2, progress: 0.8, status: 'Active', changed: h(100) },
      { name: 'Dulcy Robotics', client: 'Dulcy', bounce: 3.1, progress: 0.4, status: 'Active', changed: h(100) },
      { name: 'Old one', client: 'Dulcy', bounce: 6, progress: 1, status: 'Paused', changed: h(6) },
    ],
    accounts: [{ stage: 'Resting 7 Days' }, { stage: 'Resting 7 Days' }, { stage: 'Replace Domain' }],
    activity: [{ agent: 'Atlas', type: 'Fixed', event: 'Account rested' }, { agent: 'Engine', type: 'Step done', event: 'Find contacts: done' }],
    ...over,
  };
}

test('the brief: waiting decisions, overnight replies and meetings, campaign and account health, agents, top 3', () => {
  const b = writeBrief(data());
  assert.match(b, /\*Good morning, Wednesday, Nov 25\*/);
  assert.match(b, /3 decisions \(2 replies \/ follow-ups, 1 bounce, 1 purchase\)\. Oldest: Reply to Jane at Acme/);
  assert.match(b, /2 new interested replies \(Twenty West 2\) · 1 meeting booked \(Twenty West 1\) · 1 reply sent · 1 draft waiting/);
  assert.match(b, /\*Campaigns \(2 active\):\* ⚠️ 1 over 4% bounce \(Twenty West: TW Food Direct 5\.2%\) · 👀 1 to watch \(2\.5-4%\) · ⏸ 1 paused in the last 24 h · 📈 1 past 60%: plan the next one \(Twenty West 1\)/);
  assert.match(b, /\*Accounts:\* 2 resting · 1 to replace · 1 purchase waiting for your ✅/);
  assert.match(b, /\*Agents \(24 h\):\* Atlas 1 step \(1 fixed\) · Engine 1 step/);
  assert.match(b, /1\. Approve or skip the 2 waiting replies in Decisions/);
  assert.doesNotMatch(b, /@/, 'no email addresses');
});

test('a quiet morning says so; Friday adds the weekly scorecard', () => {
  const quiet = writeBrief(data({ decisions: [], replies: [], campaigns: [], accounts: [], activity: [], purchases: 0 }));
  assert.match(quiet, /\*Waiting on you:\* nothing/);
  assert.match(quiet, /all healthy/);
  assert.match(quiet, /Nothing blocking/);
  const fri = writeBrief(data({ week: [{ client: 'Twenty West', interested: [12, 9], booked: [3, 1], sent: [20, 14] }] }));
  assert.match(fri, /Weekly scorecard \(this week vs last\)/);
  assert.match(fri, /Twenty West: interested 12 \(9\), booked 3 \(1\), sent 20 \(14\)/);
});

test('timer: weekdays after the brief hour only (no database needed when it is off or a weekend)', async () => {
  const cfg = { ...loadConfig({ ENGINE_SECRET: 'x'.repeat(40), DATABASE_URL: 'postgres://x' } as NodeJS.ProcessEnv) };
  assert.equal(await adaTick(null as any, { ...cfg, adaBriefOn: false }, now), 0, 'off by default');
  assert.equal(await adaTick(null as any, { ...cfg, adaBriefOn: true }, new Date('2026-11-28T15:00:00Z')), 0, 'Saturday');
  assert.equal(await adaTick(null as any, { ...cfg, adaBriefOn: true, adaBriefHour: 8 }, new Date('2026-11-25T11:00:00Z')), 0, 'before 8 AM ET');
});

test('brief names are short: clients and campaigns', async () => {
  const { shortClient, shortCampaign } = await import('../src/agents/ada.js');
  assert.equal(shortClient('Brilliant Jewelers / MJJ Inc. (MJJ Brilliant)'), 'MJJ Brilliant');
  assert.equal(shortClient('Twenty West Media (Internal)'), 'Twenty West');
  assert.equal(shortClient('GLOBALMEDIAGROUP LTD'), 'GMG / Scroll Stop');
  assert.equal(shortClient('COLLABOR TECHNOLOGIES LTD'), 'Collabor Technologies');
  assert.equal(shortClient('Human Marketing'), 'Human Marketing');
  assert.equal(shortCampaign('[Twenty West Media (Internal)] Food & Beverage Generic'), 'Food & Beverage Generic');
});

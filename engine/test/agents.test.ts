// Atlas (client health), Cole (sales-call reviews) and Sienna (content ideas + Friday scripts).
// Pure rules with fixed data, then each stage end to end against fake Airtable / Fathom / Claude / Slack.
import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createPool, migrate, type Db } from '../src/db/pool.js';
import { loadConfig, type Config } from '../src/config.js';
import { enqueue, getJob } from '../src/queue.js';
import { runOnce } from '../src/worker.js';
import { grade, writeHealth, gatherHealth, type Client } from '../src/agents/atlas.js';
import { parseMeeting, type FathomMeeting } from '../src/providers/fathom.js';
import { pacing, obviouslyInternal, writeReview, type ReviewT } from '../src/agents/cole.js';
import { nextFriday, slug, CONTENT, CF } from '../src/agents/sienna.js';
import { agentsTick } from '../src/scheduler.js';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const url = process.env.TEST_DATABASE_URL;
const skip = !url ? 'TEST_DATABASE_URL not set' : false;

// ---------- Atlas ----------
const client = (over: Partial<Client> = {}): Client => ({
  id: 'rec1', name: 'Acme', type: 'Paying Client', fee: 3000, months: 4, ltv: 12000, kpi: 8, healthField: '',
  interested7: 5, interestedPrev7: 4, interested30: 20, booked7: 3, bookedPrev7: 2, booked30: 9,
  campaigns: { active: 2, over4: 0, watch: 0, past60: 0, ending: 0 }, ...over,
});

test('Atlas grades: no campaign or far under KPI = red; the Twenty West case (many interested, few meetings) = red; healthy = green', () => {
  assert.deepEqual(grade(client()), { light: '🟢', reasons: [] });
  assert.equal(grade(client({ campaigns: { active: 0, over4: 0, watch: 0, past60: 0, ending: 0 } })).light, '🔴');
  assert.match(grade(client({ booked30: 3 })).reasons[0], /booked 3 in 30 days vs KPI 8/);
  const tw = grade(client({ interested30: 282, booked30: 20, kpi: 8 }));
  assert.equal(tw.light, '🔴');
  assert.match(tw.reasons.join(' '), /only 7% of 282 interested replies became meetings \(inbox follow-up problem\)/);
  const y = grade(client({ booked30: 6, campaigns: { active: 2, over4: 1, watch: 0, past60: 1, ending: 0 }, fee: undefined }));
  assert.equal(y.light, '🟡');
  assert.match(y.reasons.join(' · '), /booked 6 in 30 days vs KPI 8 · 1 campaign over 4% bounce · 1 campaign past 60%: plan the next one · monthly fee missing/);
});

test('Atlas report: book totals, one block per paying client (worst first), top 3', () => {
  const r = writeHealth({ now: new Date('2026-11-30T14:00:00Z'), clients: [
    client({ name: 'Healthy Co' }),
    client({ id: 'r2', name: 'Twenty West', fee: 2500, interested30: 282, booked30: 20, interested7: 60, interestedPrev7: 70 }),
    client({ id: 'r3', name: 'No Fee Co', fee: undefined, campaigns: { active: 1, over4: 0, watch: 0, past60: 1, ending: 0 } }),
    client({ id: 'r4', name: 'Dulcy Free Campaigns', type: 'Free / Trial', fee: 0 }),
  ] });
  assert.match(r, /\*Atlas: client health, week of Nov 30\*/);
  assert.match(r, /\*Book:\* 3 paying clients · MRR \$5,500 \(fee missing for 1\) · avg retainer \$2,750 · avg 4\.0 months in · avg LTV \$12,000/);
  assert.ok(r.indexOf('Twenty West') < r.indexOf('Healthy Co'), 'red first');
  assert.match(r, /🔴 \*Twenty West\* · \$2,500\/mo/);
  assert.match(r, /this week: 60 interested \(↓ from 70\)/);
  assert.match(r, /_Also running \(not billed\): Dulcy Free Campaigns/);
  assert.match(r, /1\. Twenty West: only 7% of 282 interested replies became meetings/);
  assert.match(r, /Plan the next campaign for No Fee Co/);
});

test('Atlas reads Airtable: counts interested / booked per workspace by date, campaigns by client link', async () => {
  const now = new Date('2026-11-30T14:00:00Z'); const d = (days: number) => new Date(now.getTime() - days * 86_400_000).toISOString();
  const at = { async list(table: string) {
    if (table === 'tblcjRBGJEWh5KgOt') return [{ id: 'recW', fields: { Name: 'Acme', 'Client Type': 'Paying Client', 'Monthly Fee': 3000, ID: 7, 'Calls Booked KPI (Client)': 8 } }, { id: 'recD', fields: { Name: 'Dulcy', 'Client Type': 'Internal', ID: 2 } }];
    if (table === 'tblAVAA6uBPaMj28P') return [{ id: 'c1', fields: { Client: ['recW'], 'Bounced %': 5, Progress: 70 } }, { id: 'c2', fields: { Client: ['recX'], Progress: 10 } }];
    return [
      { id: 'e1', fields: { 'Workspace ID (Bison)': 7, 'Lead Status': 'Interested', 'Latest Reply Time': d(2) } },
      { id: 'e2', fields: { 'Workspace ID (Bison)': 7, 'Lead Status': 'Interested', 'Latest Reply Time': d(10), 'Meeting Booked At': d(9) } },
      { id: 'e3', fields: { 'Workspace ID (Bison)': 7, 'Lead Status': 'Not Interested', 'Latest Reply Time': d(1) } },
      { id: 'e4', fields: { 'Workspace ID (Bison)': 9, 'Lead Status': 'Interested', 'Latest Reply Time': d(1) } },
      { id: 'e5', fields: { 'Workspace ID (Bison)': 7, 'Lead Status': 'Interested', 'Latest Reply Time': d(20), 'Date of Call Booked': d(3).slice(0, 10) } },
    ];
  } } as any;
  const h = await gatherHealth(at, now);
  assert.equal(h.clients.length, 1, 'internal Dulcy left out');
  const c = h.clients[0];
  assert.deepEqual([c.interested7, c.interestedPrev7, c.interested30, c.booked7, c.bookedPrev7, c.booked30], [1, 1, 3, 1, 1, 2], 'bookings come from Date of Call Booked too');
  assert.deepEqual(c.campaigns, { active: 1, over4: 1, watch: 0, past60: 1, ending: 0 });
});

// ---------- Cole ----------
const meeting = (title: string, lines: [string, string, string][], invitees = [{ name: 'Nick', email: 'nick@protekcnc.com', is_external: true }]): FathomMeeting => parseMeeting({
  recording_id: title.length, title, share_url: `https://fathom.video/share/${title.length}`, created_at: '2026-11-19T18:00:00Z',
  recorded_by: { name: 'Alexander Woung', email: 'alex@dulcy.io' }, calendar_invitees: invitees,
  transcript: lines.map(([s, t, text]) => ({ speaker: { display_name: s, matched_calendar_invitee_email: s === 'Alexander Woung' ? 'alex@dulcy.io' : '' }, timestamp: t, text })),
});

test('Cole measures pacing from the transcript; obvious internal calls are skipped', () => {
  const m = meeting('Nick Wendt and Alexander Woung', [
    ['Alexander Woung', '00:00:05', 'Thanks for jumping on. What made you book the call?'],
    ['Nick Wendt', '00:00:12', 'We need more machine shop customers, our referrals dried up this year'],
    ['Alexander Woung', '00:00:30', 'Got it. How many new customers a month do you need'],
    ['Alexander Woung', '00:00:40', 'and what does one customer bring you in a year?'],
    ['Nick Wendt', '00:41:00', 'Maybe four. About fifty thousand each.'],
  ]);
  const p = pacing(m);
  assert.equal(p.alexWords, 10 + 11 + 10);
  assert.equal(p.otherWords, 12 + 6);
  assert.equal(p.longestRunWords, 21); assert.equal(p.longestRunAt, '00:00:30');
  assert.equal(p.alexQuestions, 2); assert.equal(p.minutes, 41);
  assert.ok(!obviouslyInternal(m));
  assert.ok(obviouslyInternal(meeting('Inbox & Reply Operations Weekly', [], [{ name: 'Josh', email: 'joshua@dulcy.io', is_external: false }])));
  assert.ok(obviouslyInternal(meeting('Sync', [], [{ name: 'Josh', email: 'joshua@dulcy.io', is_external: false }])), 'no outside invitee');
});

const REVIEW: ReviewT = {
  score: 12, verdict: 'Good discovery, rushed the close.',
  stages: [{ stage: 'Frame and opener', score: 8, note: 'clear' }, { stage: 'Close and next step', score: 4, note: 'no date set' }],
  went_well: [{ t: '00:30', quote: 'what does one customer bring you', why: 'put a number on the pain' }],
  fix: [{ t: '38:10', said: 'sure, take your time', better: 'What do you need to think about?', why: 'isolates the real objection' }],
  objections: [{ objection: 'I need to think about it', how_handled: 'let it go', better: 'ask what specifically', handled_well: false }],
  missing_beliefs: ['trust'], next_step: 'none', deal_temperature: 'warm', drill: 'Practise the think-about-it loop 5 times.',
  follow_up_email: { subject: 'Next step for Protek', body: 'Nick, ...' },
};

test('Cole review message: score clamped to 10, pacing, low stages explained, fixes with better lines, draft separate', () => {
  const m = meeting('Nick Wendt and Alexander Woung', [['Alexander Woung', '00:00:05', 'Hi?'], ['Nick Wendt', '00:10:00', 'Hello']]);
  const out = writeReview(m, { kind: 'sales', prospect: 'Nick Wendt', company: 'Protek', call_type: 'discovery', reason: '' }, pacing(m), REVIEW);
  assert.match(out.main, /\*Cole: call review\* · Nick Wendt \(Protek\) · Nov 19 · discovery/);
  assert.match(out.main, /\*Score 10\/10\* · warm/);
  assert.match(out.main, /you talked 50%/);
  assert.match(out.main, /• Close and next step: no date set/);
  assert.doesNotMatch(out.main, /• Frame and opener/, 'only stages scored 6 or less get a note');
  assert.match(out.main, /\[38:10\] You said: "sure, take your time"\n\s+Say instead: "What do you need to think about\?"/);
  assert.match(out.main, /⚠️ "I need to think about it"/);
  assert.match(out.draft, /\*Subject:\* Next step for Protek/);
});

// ---------- Sienna ----------
test('Sienna: the coming Friday (ET) and stable idea keys', () => {
  assert.equal(nextFriday(new Date('2026-11-30T15:00:00Z')), '2026-12-04'); // Mon
  assert.equal(nextFriday(new Date('2026-12-03T15:00:00Z')), '2026-12-04'); // Thu
  assert.equal(nextFriday(new Date('2026-12-04T15:00:00Z')), '2026-12-11'); // Fri → next week
  assert.equal(slug('Cold Email in 2027: What Still Works?'), 'cold-email-in-2027-what-still-works');
});

test('timers: Atlas Monday after its hour; Sienna Monday ideas and Thursday scripts; all off by default', async () => {
  const cfg = loadConfig({ ENGINE_SECRET: 'x'.repeat(40), DATABASE_URL: 'postgres://x' } as NodeJS.ProcessEnv);
  assert.equal(await agentsTick(null as any, cfg, new Date('2026-11-30T15:00:00Z')), 0, 'all off');
  assert.equal(await agentsTick(null as any, { ...cfg, atlasOn: true, siennaOn: true }, new Date('2026-12-01T15:00:00Z')), 0, 'Tuesday: nothing');
  assert.equal(await agentsTick(null as any, { ...cfg, coleOn: true }, new Date('2026-12-01T15:00:00Z')), 0, 'Cole needs a Fathom key');
});

// ---------- End to end ----------
let db: Db, server: http.Server, base = '';
let tables: Record<string, Record<string, Record<string, unknown>>> = {};
let claudeAnswers: unknown[] = []; let claudeCalls: any[] = []; let posts: { channel: string; text: string; thread?: string }[] = [];
let fathomItems: any[] = [];
before(async () => {
  server = http.createServer((req, res) => {
    let raw = ''; req.on('data', (c) => (raw += c));
    req.on('end', () => {
      res.setHeader('content-type', 'application/json');
      const u = new URL(req.url ?? '/', 'http://x');
      if (u.pathname.startsWith('/f/meetings')) return res.end(JSON.stringify({ items: fathomItems, next_cursor: null }));
      if (u.pathname.startsWith('/c/')) {
        const body = JSON.parse(raw); claudeCalls.push(body);
        const isResearch = (body.tools ?? []).some((t: any) => /web_search/.test(t.type));
        const content = isResearch ? [{ type: 'text', text: 'Agency owners keep asking about cold email deliverability in 2027. https://youtube.com/watch?v=abc 120k views.' }] : [{ type: 'text', text: JSON.stringify(claudeAnswers.shift()) }];
        return res.end(JSON.stringify({ id: 'msg', type: 'message', role: 'assistant', model: 'claude-opus-5-5', content, stop_reason: 'end_turn', stop_details: null, usage: { input_tokens: 1, output_tokens: 1 } }));
      }
      if (u.pathname.startsWith('/s/chat.postMessage')) { const b = JSON.parse(raw); posts.push({ channel: b.channel, text: b.text, thread: b.thread_ts }); return res.end(JSON.stringify({ ok: true, channel: 'D1', ts: `${posts.length}.0` })); }
      if (u.pathname.startsWith('/a/')) {
        const table = u.pathname.split('/')[4]; const rows = (tables[table] ??= {});
        if (req.method === 'GET') {
          const f = u.searchParams.get('filterByFormula') ?? '';
          let list = Object.entries(rows);
          if (table === CONTENT && /Record This Week/.test(f)) list = list.filter(([, r]) => r[CF.recordThisWeek] && !r[CF.script]);
          if (table === CONTENT && /Idea Source Key/.test(f)) list = list.filter(([, r]) => String(r[CF.ideaKey] ?? '').startsWith('sienna:'));
          if (table === CONTENT && /YouTube Transcript/.test(f)) list = list.filter(([, r]) => r[CF.transcript]);
          return res.end(JSON.stringify({ records: list.map(([id, fields]) => ({ id, fields })) }));
        }
        const b = JSON.parse(raw || '{}');
        return res.end(JSON.stringify({ records: (b.records ?? []).map((r: any) => {
          if (req.method === 'PATCH') { Object.assign((rows[r.id] ??= {}), r.fields); return r; }
          const id = `recNew${String(Object.keys(rows).length).padStart(11, '0')}`; rows[id] = { ...r.fields }; return { id, fields: r.fields };
        }) }));
      }
      res.statusCode = 404; res.end('{}');
    });
  });
  await new Promise<void>((r) => server.listen(0, r));
  base = `http://127.0.0.1:${(server.address() as any).port}`;
  if (!skip) { db = createPool(url!); await migrate(db); }
});
after(async () => { server.close(); if (!skip) await db.end(); });
beforeEach(async () => {
  tables = {}; claudeAnswers = []; claudeCalls = []; posts = []; fathomItems = [];
  if (!skip) await db.query('TRUNCATE jobs, steps, receipts, events, cole_reviews RESTART IDENTITY CASCADE');
});
function cfg(stage: string): Config {
  return { ...loadConfig({ ENGINE_SECRET: 'x'.repeat(40), DATABASE_URL: url ?? 'postgres://x' } as NodeJS.ProcessEnv),
    dryRun: false, liveStages: [stage], knowledgeDir: REPO, anthropicApiKey: 'sk-test', anthropicBaseUrl: `${base}/c`, slackBotToken: 'xoxb', slackBaseUrl: `${base}/s`,
    airtableApiKey: 'at', airtableBaseUrl: `${base}/a`, fathomApiKey: 'fk', fathomBaseUrl: `${base}/f` };
}
async function run(kind: string) {
  const c = cfg(kind);
  const q = await enqueue(db, { kind, recordId: kind.replace('.', '-'), input: {}, dryRun: false, maxAttempts: 2, deadlineMs: 60_000 });
  for (let i = 0; i < 10; i++) { await runOnce(db, c); const j = await getJob(db, q.job.id); if (['succeeded', 'failed', 'needs_review'].includes(j!.job.status)) return j!; }
  throw new Error('job did not settle');
}

test('Cole end to end: internal call skipped without Claude, sales call reviewed once, draft posted in the thread', { skip }, async () => {
  const line = (s: string, t: string, text: string) => ({ speaker: { display_name: s, matched_calendar_invitee_email: s === 'Alexander Woung' ? 'alex@dulcy.io' : '' }, timestamp: t, text });
  const lines = Array.from({ length: 12 }, (_, i) => line(i % 2 ? 'Nick Wendt' : 'Alexander Woung', `00:0${Math.floor(i / 2)}:00`, i % 2 ? 'We need more customers' : 'What is the goal?'));
  fathomItems = [
    { recording_id: 1, title: 'Inbox & Reply Operations Weekly', created_at: new Date().toISOString(), recorded_by: { name: 'Alexander Woung', email: 'alex@dulcy.io' }, calendar_invitees: [{ name: 'Josh', email: 'joshua@dulcy.io', is_external: false }], transcript: lines },
    { recording_id: 2, title: 'Nick Wendt and Alexander Woung', share_url: 'https://fathom.video/share/2', created_at: new Date().toISOString(), recorded_by: { name: 'Alexander Woung', email: 'alex@dulcy.io' }, calendar_invitees: [{ name: 'Nick', email: 'nick@protekcnc.com', is_external: true }], transcript: lines },
  ];
  claudeAnswers = [{ kind: 'sales', prospect: 'Nick Wendt', company: 'Protek', call_type: 'discovery', reason: 'prospect call' }, REVIEW];
  const j = await run('cole.review');
  assert.equal(j.job.status, 'succeeded', j.job.error ?? '');
  assert.match(String(j.job.result.message), /1 sales call reviewed/);
  assert.equal(claudeCalls.length, 2, 'classify + review; the internal call never reached Claude');
  assert.equal(posts.length, 2);
  assert.match(posts[0].text, /Cole: call review/);
  assert.equal(posts[1].thread, '1.0', 'draft goes in the thread');
  assert.match(posts[1].text, /Follow-up draft \(edit and send yourself\)/);
  const again = await run('cole.review');
  assert.match(String(again.job.result.message), /none new to review/);
  assert.equal(claudeCalls.length, 2);
});

test('Sienna end to end: Monday research → ideas in Content Center (Review); Thursday scripts for ticked ideas', { skip }, async () => {
  tables[CONTENT] = { recOld000000000001: { [CF.title]: 'Old idea' } };
  tables['tblbG7YbCpi84tQYM'] = { recS00000000000001: { Channel: 'Alex Woung', 'Videos Per Week': 1, Enabled: true } };
  claudeAnswers = [{ ideas: [
    { title: 'Cold Email Deliverability in 2027', angle: 'what we changed', hook: 'Half your emails land in spam.', why_now: 'Gmail rules', evidence: [{ url: 'https://youtube.com/watch?v=abc', signal: '120k views' }], pillar: 'cold outbound', type: 'Education', score: 91 },
    { title: 'Old idea', angle: '', hook: '', why_now: '', evidence: [], pillar: 'founder lessons', type: 'Value', score: 50 },
  ] }];
  const j = await run('sienna.ideas');
  assert.equal(j.job.status, 'succeeded', j.job.error ?? '');
  assert.ok(claudeCalls[0].tools.some((t: any) => t.type === 'web_search_20260209'), 'research uses web search');
  assert.equal(claudeCalls[1].tools, undefined, 'the JSON answer is a separate request without tools');
  const added = Object.values(tables[CONTENT]).filter((r) => r[CF.source] === 'Generated Idea');
  assert.equal(added.length, 1, 'the duplicate of an existing title is skipped');
  assert.equal(added[0][CF.status], 'Review'); assert.equal(added[0][CF.ideaScore], 91); assert.match(String(added[0][CF.ideaKey]), /^sienna:\d{4}-\d{2}-\d{2}:cold-email-deliverability-in-2027$/);
  assert.match(posts[0].text, /Sienna: 1 video ideas/);
  // Alex ticks it; Thursday prep writes the script.
  const id = Object.entries(tables[CONTENT]).find(([, r]) => r[CF.source] === 'Generated Idea')![0];
  tables[CONTENT][id][CF.recordThisWeek] = true;
  claudeAnswers = [{ title_options: ['A', 'B', 'C'], hook_options: ['h1'], script: 'Line one.\nLine two.', thumbnail: 'Inbox vs spam', gamma_outline: '1. Intro', description: 'desc', facts_to_check: ['the 50% number'] }];
  const p = await run('sienna.prep');
  assert.equal(p.job.status, 'succeeded', p.job.error ?? '');
  assert.equal(tables[CONTENT][id][CF.script], 'Line one.\nLine two.');
  assert.equal(tables[CONTENT][id][CF.stage], 'Script Ready');
  assert.match(String(tables[CONTENT][id][CF.notes]), /Check before recording\*\*\n- the 50% number/);
  assert.match(posts.at(-1)!.text, /Friday is ready/);
});

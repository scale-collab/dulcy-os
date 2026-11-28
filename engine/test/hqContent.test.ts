// HQ Content (Step 3): the Content Center's rules ported to HQ (idea approval dates, settings read,
// "needs approval"), the pipeline stages, Sienna's prep notes, the Friday view and the data notes,
// and the API: owner only (members 403), batched + cached reads, and the exact idea-decision writes.
// Airtable is a fake (it understands only the few formulas HQ sends); no real service is called.
import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { AddressInfo } from 'node:net';
import { createPool, migrate, type Db } from '../src/db/pool.js';
import { loadConfig, type Config } from '../src/config.js';
import { createServer } from '../src/http.js';
import { upsertUser } from '../src/hq/auth.js';
import { CF, CONTENT, SETTINGS } from '../src/agents/sienna.js';
import {
  CLIPS, KL, SF, XF, _resetContentCache, buildContent, ccStageOf, contentFriday, normalizedStage, contentNotes, ideaNeedsApproval, nextIdeaDates, nextStep, parsePrep, settingsOf,
  stageOf, targetsOf, videoOf, clipOf, weekOf, type ContentSource,
  CHANNEL_LABEL, YOUTUBE_CHANNEL_IDS, _resetYoutubeCache, feedDates, nextPrepAt, postedOn, videoSteps, youtubeDates, youtubeId,
} from '../src/hq/content.js';

const url = process.env.TEST_DATABASE_URL;
const skip = !url ? 'TEST_DATABASE_URL not set' : false;
const PW = 'correct horse battery staple';
const at12 = (ymd: string, hourEt = 10) => new Date(`${ymd}T${String(hourEt + 5).padStart(2, '0')}:00:00Z`); // ET in Nov/Dec = UTC-5
const rec = (n: number | string) => `recCONTENT${String(n).padStart(7, '0')}`;
const clipRec = (n: number) => `recCLIP${String(n).padStart(10, '0')}`;

// ---------- the Content Center's rules ----------
test('content: nextIdeaDates — main = Tue/Thu publish, recorded on a Friday (Alex 2026-11-28); Raw = this week\'s Friday', () => {
  const s = { videosPerWeek: 5, clipsPerWeek: 3, minimumSpacingDays: 1 };
  const thu = at12('2026-11-26');
  assert.deepEqual(nextIdeaDates([], s, thu, 'Alex Woung'), { recording: '2026-11-27', publish: '2026-12-01' }, 'first Tuesday; planned Friday is past → the next Friday');
  assert.deepEqual(nextIdeaDates([{ recording: '', publish: '2026-12-01' }], s, thu, 'Alex Woung'), { recording: '2026-11-27', publish: '2026-12-03' });
  assert.deepEqual(nextIdeaDates([{ recording: '', publish: '2026-12-01' }, { recording: '', publish: '2026-12-03' }], s, thu, 'Alex Woung'), { recording: '2026-11-27', publish: '2026-12-08' }, 'the Friday before the week before the publish week');
  assert.deepEqual(nextIdeaDates([], s, at12('2026-12-01'), 'Alex Woung'), { recording: '2026-12-04', publish: '2026-12-08' }, 'always a Friday, at least 4 days before it goes out');
  assert.equal(new Date(nextIdeaDates([{ recording: '', publish: '2026-12-15' }], s, thu, 'Alex Woung').recording + 'T12:00:00Z').getUTCDay(), 5);
  assert.deepEqual(nextIdeaDates([], s, thu, 'Alex Woung Raw'), { recording: '2026-11-27', publish: '2026-12-01' }, 'Raw: Friday of this Mon–Sun week');
  assert.deepEqual(nextIdeaDates([{ recording: '2026-11-27', publish: '2026-12-01' }], s, thu, 'Alex Woung Raw'), { recording: '2026-11-27', publish: '2026-12-02' }, 'spacing 1 day');
  assert.deepEqual(nextIdeaDates([{ recording: '2026-11-27', publish: '2026-12-01' }], { ...s, minimumSpacingDays: 2 }, thu, 'Alex Woung Raw').publish, '2026-12-03');
  assert.equal(nextIdeaDates([], s, at12('2026-11-28'), 'Alex Woung Raw').recording, '2026-11-27', 'a Saturday approval keeps that week\'s Friday');
  const full = ['2026-12-01', '2026-12-02', '2026-12-03'].map((p) => ({ recording: '', publish: p }));
  assert.equal(nextIdeaDates(full, { ...s, videosPerWeek: 3 }, thu, 'Alex Woung Raw').publish, '2026-12-08', '3 a week in any 7 days');
});

test('content: settings read like the Content Center (empty cell = 0, unknown channel ignored) and targets like sienna.ideas', () => {
  const rows = [
    { id: 'recS1', fields: { [SF.channel]: 'Alex Woung Raw', [SF.enabled]: true, [SF.videosPerWeek]: 5, [SF.clipsPerWeek]: 4 } },
    { id: 'recS2', fields: { [SF.channel]: 'Dulcifyz', [SF.videosPerWeek]: 9 } },
  ];
  const st = settingsOf(rows);
  assert.deepEqual(st['Alex Woung Raw'], { videosPerWeek: 5, clipsPerWeek: 4, minimumSpacingDays: 0 }, 'an empty number cell reads as 0, as Number(null) does in the interface');
  assert.deepEqual(st['Alex Woung'], { videosPerWeek: 2, clipsPerWeek: 3, minimumSpacingDays: 2 }, 'no row: defaults');
  assert.deepEqual(targetsOf(rows), { 'Alex Woung': 2, 'Alex Woung Raw': 5 });
  assert.deepEqual(targetsOf([{ id: 'x', fields: { [SF.channel]: 'Alex Woung', [SF.videosPerWeek]: 3 } }])['Alex Woung'], 2, 'only Enabled rows count, like sienna.ideas');
});

test('content: ideaNeedsApproval (ported)', () => {
  const n = (decision: string, stage = '', hasScript = false, youtubeUrl = '') => ideaNeedsApproval({ decision, stage, hasScript, youtubeUrl });
  assert.equal(n('Approved'), false);
  for (const d of ['Needs Review', 'Auto Scheduled', 'Rejected', 'Duplicate', 'Archived']) assert.equal(n(d, 'Editing', true), true, d);
  assert.equal(n(''), true, 'a blank row with nothing in production');
  assert.equal(n('', 'Script'), false, 'legacy content already in production');
  assert.equal(n('', '', true), false);
});

// ---------- fixtures (field IDs) ----------
function v(n: number, f: Record<string, unknown>, created = '2026-11-20T14:00:00.000Z') { return { id: rec(n), fields: f, createdTime: created }; }
function source(rows: ReturnType<typeof v>[], clipRows: { id: string; fields: Record<string, unknown> }[] = [], heavy: Record<string, Record<string, unknown>> = {}, extra: Partial<ContentSource> = {}): ContentSource {
  const scripted = new Set(rows.filter((r) => r.fields[CF.script]).map((r) => r.id));
  return {
    videos: rows.map((r) => videoOf(r, scripted)), clips: clipRows.map(clipOf), settingsRows: [{ id: 'recS', fields: { [SF.channel]: 'Alex Woung Raw', [SF.enabled]: true, [SF.videosPerWeek]: 5 } }],
    heavy: new Map(Object.entries(heavy).map(([id, fields]) => [id, { id, fields }])), stuck: [], lastPrep: null, readAt: '2026-11-26T15:00:00.000Z', ...extra,
  };
}
const MAIN = 'Alex Woung', RAW = 'Alex Woung Raw';
const NOTES = '**Title options**\n- Cold email in 2027\n- Why your replies dropped\n- The 3 fixes\n\n**Hook options**\n- Most cold email dies in the first line.\n- I paused 4 campaigns last week.\n\n**Thumbnail:** Alex pointing at a red inbox: "Replies dead?"\n\n**Gamma outline**\n1. The problem\n2. The 3 fixes\n\n**YouTube description**\nWhat changed and what to do.\n\n**Check before recording**\n- [ALEX: add real example]';

test('content: Sienna\'s prep notes parsed (titles, hooks, thumbnail, Gamma outline, checks)', () => {
  const p = parsePrep(NOTES);
  assert.deepEqual(p.titles, ['Cold email in 2027', 'Why your replies dropped', 'The 3 fixes']);
  assert.deepEqual(p.hooks, ['Most cold email dies in the first line.', 'I paused 4 campaigns last week.']);
  assert.equal(p.thumbnail, 'Alex pointing at a red inbox: "Replies dead?"');
  assert.equal(p.gamma, '1. The problem\n2. The 3 fixes');
  assert.deepEqual(p.checks, ['[ALEX: add real example]']);
  assert.equal(p.gammaUrl, '');
  assert.equal(parsePrep('**Gamma outline**\nsee https://gamma.app/docs/abc-123 now').gammaUrl, 'https://gamma.app/docs/abc-123');
  assert.deepEqual(parsePrep('**Check before recording**\n- nothing flagged').checks, []);
});

test('content: pipeline stages from the Content Center fields and clip status', () => {
  const st = (f: Record<string, unknown>, clips: { id: string; fields: Record<string, unknown> }[] = []) => stageOf(videoOf(v(1, { [CF.channel]: MAIN, ...f }), new Set(f[CF.script] ? [rec(1)] : [])), clips.map(clipOf));
  assert.equal(st({ [CF.ideaDecision]: 'Needs Review' }), 'idea');
  assert.equal(st({ [CF.ideaDecision]: 'Rejected' }), null);
  assert.equal(st({}), null, 'old row with no decision: not in the pipeline');
  assert.equal(st({ [CF.ideaDecision]: 'Approved', [CF.stage]: 'Idea Approved' }), 'approved');
  assert.equal(st({ [CF.ideaDecision]: 'Approved', [CF.stage]: 'Script', [CF.script]: 'x' }), 'script');
  assert.equal(st({ [CF.ideaDecision]: 'Approved', [CF.stage]: 'Recorded', [CF.script]: 'x' }), 'recorded');
  assert.equal(st({ [CF.ideaDecision]: 'Approved', [CF.stage]: 'Editing', [CF.script]: 'x' }), 'editing');
  assert.equal(st({ [CF.ideaDecision]: 'Approved', [CF.stage]: 'Ready for Clips', [CF.script]: 'x' }, [{ id: clipRec(1), fields: { [KL.status]: 'Needs Review', [KL.parent]: [rec(1)] } }]), 'review');
  assert.equal(st({ [CF.ideaDecision]: 'Approved', [CF.stage]: 'Ready for Clips', [CF.script]: 'x' }, [{ id: clipRec(1), fields: { [KL.status]: 'Approved', [KL.parent]: [rec(1)] } }]), 'final');
  assert.equal(st({ [CF.ideaDecision]: 'Approved', [CF.status]: 'Scheduled', [CF.script]: 'x' }), 'final', 'Scheduled = after approval (proof checked separately)');
  assert.equal(st({ [CF.ideaDecision]: 'Approved', [XF.youtubeUrl]: 'https://youtu.be/x', [XF.publishingStatus]: 'Published' }), 'posted');
});

test('content: next step follows the Content Center order and names the automation', () => {
  const ns = (f: Record<string, unknown>) => nextStep(videoOf(v(1, { [CF.channel]: MAIN, [CF.ideaDecision]: 'Approved', ...f }), new Set(f[CF.script] ? [rec(1)] : [])), []);
  assert.deepEqual([ns({ [CF.ideaDecision]: 'Needs Review' })!.who, ns({ [CF.ideaDecision]: 'Needs Review' })!.how], ['Alex', 'hq']);
  assert.equal(ns({})!.how, 'engine', 'no script: sienna.prep');
  assert.match(ns({ [CF.script]: 'x' })!.automation, /Sync Frame\.io.*Content OS Action Script.*Frame\.io Sync/);
  const base = { [CF.script]: 'x', [XF.rawFolderUrl]: 'https://f.io/raw', [XF.finalAssetUrl]: 'https://f.io/final' };
  assert.match(ns(base)!.automation, /Generate thumbnail.*Generate Thumbnail/);
  assert.deepEqual([ns({ ...base, [XF.finalThumbnailUrl]: 'https://t' })!.title, ns({ ...base, [XF.finalThumbnailUrl]: 'https://t' })!.who], ['Approve the thumbnail', 'Alex']);
  assert.match(ns({ ...base, [XF.finalThumbnailUrl]: 'https://t', [XF.thumbnailStatus]: 'Approved', [CF.ytTitle]: 'T', [XF.youtubeDescription]: 'D' })!.automation, /YouTube Studio.*never posts/);
});

test('content: Friday view = approved ideas for this Friday per channel, in recording order, count vs target', () => {
  const now = at12('2026-11-26').getTime();
  assert.equal(contentFriday(now), '2026-11-27');
  assert.equal(contentFriday(at12('2026-11-27').getTime()), '2026-11-27', 'on Friday: today');
  assert.deepEqual(weekOf('2026-11-27'), { start: '2026-11-23', end: '2026-11-29' });
  const rows = [
    v(1, { [CF.title]: 'Raw B', [CF.channel]: RAW, [CF.ideaDecision]: 'Approved', [CF.stage]: 'Script', [CF.script]: 'talking points B', [CF.recordingDate]: '2026-11-27', [XF.publishDate]: '2026-12-02' }),
    v(2, { [CF.title]: 'Raw A', [CF.channel]: RAW, [CF.ideaDecision]: 'Approved', [CF.stage]: 'Script', [CF.script]: 'talking points A', [CF.recordingDate]: '2026-11-27', [XF.publishDate]: '2026-12-01' }),
    v(3, { [CF.title]: 'Raw no script', [CF.channel]: RAW, [CF.ideaDecision]: 'Approved', [CF.stage]: 'Idea Approved', [CF.recordingDate]: '2026-11-27' }),
    v(4, { [CF.title]: 'Raw recorded', [CF.channel]: RAW, [CF.ideaDecision]: 'Approved', [CF.stage]: 'Recorded', [CF.script]: 'x', [CF.recordingDate]: '2026-11-27' }),
    v(5, { [CF.title]: 'Raw next week', [CF.channel]: RAW, [CF.ideaDecision]: 'Approved', [CF.stage]: 'Script', [CF.script]: 'x', [CF.recordingDate]: '2026-12-04' }),
    v(6, { [CF.title]: 'Main one', [CF.channel]: MAIN, [CF.ideaDecision]: 'Approved', [CF.stage]: 'Script', [CF.script]: 'full script', [CF.recordingDate]: '2026-11-29', [XF.publishDate]: '2026-12-08' }),
    v(7, { [CF.title]: 'Raw waiting', [CF.channel]: RAW, [CF.ideaDecision]: 'Needs Review', [CF.recordingDate]: '2026-11-27' }),
    v(8, { [CF.title]: 'Main left from last week', [CF.channel]: MAIN, [CF.ideaDecision]: 'Approved', [CF.stage]: 'Script', [CF.script]: 'y', [CF.recordingDate]: '2026-11-20' }),
  ];
  const out = buildContent(source(rows, [], { [rec(6)]: { [CF.script]: 'full script', [CF.notes]: NOTES } }), 'appTEST', now);
  const [main, raw] = out.friday.channels;
  assert.deepEqual(raw.items.map((x) => x.title), ['Raw A', 'Raw B', 'Raw no script'], 'recording date, then publish date; recorded / next week / undecided left out');
  assert.deepEqual([raw.approved, raw.ready, raw.target], [3, 2, 5]);
  assert.deepEqual(main.items.map((x) => [x.title, x.late]), [['Main left from last week', true], ['Main one', false]]);
  assert.deepEqual([main.approved, main.ready, main.target], [2, 2, 2]);
  const m1 = main.items[1];
  assert.equal(m1.script, 'full script');
  assert.deepEqual(m1.hooks.length, 2);
  assert.equal(m1.gamma, '1. The problem\n2. The 3 fixes');
  assert.equal(JSON.stringify(out).includes('airtable.com/appTEST/tbl'), false, 'no Airtable record links anywhere (Batch 5)');
});

test('content: Needs you groups ideas by channel and shows only clips Sienna passed; notes for real data problems', () => {
  const now = at12('2026-11-26').getTime();
  const rows = [
    v(1, { [CF.title]: 'Main idea', [CF.channel]: MAIN, [CF.ideaDecision]: 'Needs Review', [CF.ideaKey]: 'sienna:2026-11-27:main-idea', [CF.ideaScore]: 80 }, '2026-11-20T12:00:00.000Z'),
    v(2, { [CF.title]: 'Raw idea 1', [CF.channel]: RAW, [CF.ideaDecision]: 'Needs Review', [CF.ideaCommunity]: 'r/coldemail' }, '2026-11-21T12:00:00.000Z'),
    v(3, { [CF.title]: 'Raw idea old', [CF.channel]: RAW, [CF.ideaDecision]: 'Auto Scheduled' }, '2026-10-01T12:00:00.000Z'),
    v(4, { [CF.title]: 'Rejected', [CF.channel]: RAW, [CF.ideaDecision]: 'Rejected' }),
    v(5, { [CF.title]: 'Video with clips', [CF.channel]: MAIN, [CF.ideaDecision]: 'Approved', [CF.stage]: 'Ready for Clips', [CF.script]: 'x' }),
    v(6, { [CF.title]: 'Sched 1', [CF.channel]: MAIN, [CF.status]: 'Scheduled', [CF.stage]: 'Ready to Publish' }),
    v(7, { [CF.title]: 'Sched 2 with proof', [CF.channel]: MAIN, [CF.status]: 'Scheduled', [XF.youtubeUrl]: 'https://youtu.be/a', [XF.youtubePublishedAt]: '2026-11-24T15:00:00.000Z' }),
  ];
  const clips = [
    { id: clipRec(1), fields: { [KL.name]: 'Good clip', [KL.status]: 'Needs Review', [KL.parent]: [rec(5)], [KL.notes]: 'Sienna QA: passed 17/17 (fixed: none)', [KL.score]: 91, [KL.media]: 'https://f.io/clip1' } },
    { id: clipRec(2), fields: { [KL.name]: 'Unchecked', [KL.status]: 'Needs Review', [KL.parent]: [rec(5)] } },
    { id: clipRec(3), fields: { [KL.name]: 'Spare', [KL.status]: 'Proposed', [KL.parent]: [rec(5)], [KL.notes]: 'Sienna QA: spare' } },
  ];
  const out = buildContent(source(rows, clips, { [rec(1)]: { [CF.description]: '**Angle:** Plain\n\n**Hook:** First line\n\n**Pillar:** cold outbound', [CF.ideaReason]: 'People ask.\n\nEvidence:\n- x' } }, {
    stuck: [{ id: rec(9), title: 'Stuck idea', channel: MAIN }], lastPrep: { status: 'failed', at: '2026-11-26T14:00:00.000Z', error: 'no ANTHROPIC_API_KEY' },
  }), 'appTEST', now);
  assert.deepEqual(out.needs.ideas.map((g) => [g.label, g.items.map((i) => i.title)]), [['Alex Woung', ['Main idea']], ['Alex Woung Raw', ['Raw idea 1', 'Raw idea old']]], 'grouped by channel, newest first; rejected left out');
  assert.deepEqual([out.needs.ideas[0].items[0].by, out.needs.ideas[1].items[0].by], ['Sienna', 'Reddit intake (n8n)']);
  assert.deepEqual([out.needs.ideas[0].items[0].angle, out.needs.ideas[0].items[0].hook, out.needs.ideas[0].items[0].why], ['Plain', 'First line', 'People ask.']);
  assert.deepEqual(out.needs.finals.map((f) => [f.title, f.clips.map((c) => c.name)]), [['Video with clips', ['Good clip']]], 'only clips Sienna passed');
  assert.equal(JSON.stringify(out.needs).includes('airtable.com'), false, 'no Airtable links in Needs you (Batch 5)');
  assert.equal(out.links.contentCenter, 'https://airtable.com/appTEST/pagacLOPVCIQb1RQt', 'only the Content Center page, for the clip approval HQ cannot do');
  assert.equal(out.needs.waitingForSienna, 1);
  assert.deepEqual(out.counts, { ideas: 3, finals: 1, steps: out.needs.alexSteps.length, total: 4 + out.needs.alexSteps.length });
  const problems = out.notes.map((n) => n.problem);
  assert.deepEqual(problems, ['Marked "Scheduled" with no proof of posting', 'Approved idea with no script after 1 day', 'Clips waiting for Sienna\'s check', 'Old ideas still waiting']);
  assert.match(out.notes[0].data, /^1 row have Status Scheduled/);
  assert.equal(out.notes[1].owner, 'Riley', 'the prep job failed → Riley');
  assert.match(out.notes[1].data, /failed .*no ANTHROPIC_API_KEY/);
  assert.equal(out.pipeline.rows.find((r) => r.id === rec(6))!.flags.includes('Scheduled, no proof'), true);
  // 17 scheduled without proof → one note with the count.
  const many = Array.from({ length: 17 }, (_, i) => v(100 + i, { [CF.title]: `S${i}`, [CF.channel]: MAIN, [CF.status]: 'Scheduled' }));
  assert.match(contentNotes(source(many), { fri: '2026-11-27', fweek: weekOf('2026-11-27'), today: '2026-11-26', pipeline: [] })[0].data, /^17 rows have Status Scheduled/);
});

test('content (Batch 5): the Content Center\'s 10 stages, its item order and the blocks each item shows', () => {
  const cc = (f: Record<string, unknown>, clipIds: string[] = []) => ccStageOf(videoOf(v(1, { [CF.channel]: MAIN, ...f, ...(clipIds.length ? { [XF.clips]: clipIds } : {}) }), new Set()));
  assert.deepEqual(['', 'Idea Approved', 'Script', 'Scheduled to Record', 'Recorded', 'Editing', 'Ready for Thumbnail', 'Ready for Clips', 'Ready to Publish', 'Final Review'].map((x) => normalizedStage(x)),
    ['Idea', 'Idea', 'Script', 'Record', 'Edit', 'Edit', 'Thumbnail', 'Clips', 'Upload', 'Finalize']);
  assert.equal(cc({ [CF.stage]: 'Editing', [XF.thumbnailStatus]: 'Approved' }), 'Upload', 'an approved thumbnail = Upload');
  assert.equal(cc({ [CF.stage]: 'Ready to Publish', [XF.youtubeUrl]: 'https://youtu.be/x' }), 'Clips', 'on YouTube, no clips yet');
  assert.equal(cc({ [XF.youtubeUrl]: 'https://youtu.be/x' }, [clipRec(1)]), 'Distribute');
  assert.equal(cc({ [CF.stage]: 'Published' }), 'Distribute', 'Published without proof + distribution = Distribute, like the Content Center');
  assert.equal(cc({ [XF.youtubeUrl]: 'https://youtu.be/x', [XF.publishingStatus]: 'Published', [XF.distributionStatus]: 'Published' }), 'Published');
  const now = at12('2026-11-26').getTime();
  const rows = [
    v(1, { [CF.title]: 'B late', [CF.channel]: RAW, [CF.ideaDecision]: 'Approved', [CF.stage]: 'Editing', [CF.recordingDate]: '2026-11-27', [XF.rawFolderUrl]: 'https://f.io/r', [XF.finalAssetUrl]: 'https://f.io/f', [XF.message]: 'Long-form edit submitted', [XF.shortProjectId]: 'P1' }),
    v(2, { [CF.title]: 'A early', [CF.channel]: MAIN, [CF.ideaDecision]: 'Approved', [CF.stage]: 'Script', [CF.script]: 'x', [XF.publishDate]: '2026-11-25', [CF.recordingDate]: '2026-12-05' }),
    v(3, { [CF.title]: 'C undated', [CF.channel]: RAW, [CF.ideaDecision]: 'Needs Review', [CF.ideaScore]: 77, [CF.ideaCommunity]: 'r/coldemail', [CF.ideaUrl]: 'https://reddit.com/r/x' }),
  ];
  const out = buildContent(source(rows, [{ id: clipRec(1), fields: { [KL.parent]: [rec(1)], [KL.status]: 'Proposed' } }]), 'appTEST', now);
  assert.deepEqual(out.pipeline.ccStages, ['Idea', 'Script', 'Record', 'Edit', 'Finalize', 'Thumbnail', 'Upload', 'Clips', 'Distribute', 'Published']);
  assert.deepEqual(out.pipeline.rows.map((r) => [r.title, r.cc]), [['A early', 'Script'], ['B late', 'Edit'], ['C undated', 'Idea']], 'earliest date first, undated last');
  const b = out.pipeline.rows[1];
  assert.deepEqual([b.thisWeek, b.awaiting, b.done], [true, false, false]);
  assert.deepEqual(b.facts.video, { folder: true, finished: true, youtube: false, youtubeUrl: '' });
  assert.deepEqual(b.facts.repurposing, { shortProject: true, clips: 1, drafts: false });
  assert.equal(b.facts.update, 'Long-form edit submitted');
  assert.equal(b.facts.details.productionStage, 'Editing');
  const c = out.pipeline.rows[2];
  assert.deepEqual([c.awaiting, c.facts.score, c.facts.source, c.facts.sourceUrl, c.next!.how], [true, 77, 'r/coldemail', 'https://reddit.com/r/x', 'hq']);
});

// ---------- round 4 (2026-11-28) ----------
test('content (round 4): real channel names, never "Main" / "Raw"', () => {
  assert.deepEqual(CHANNEL_LABEL, { 'Alex Woung': 'Alex Woung', 'Alex Woung Raw': 'Alex Woung Raw' });
  const out = buildContent(source([v(1, { [CF.title]: 'x', [CF.channel]: MAIN, [CF.ideaDecision]: 'Needs Review' })]), 'appTEST', at12('2026-11-26').getTime());
  assert.deepEqual(out.friday.channels.map((c) => c.label), ['Alex Woung', 'Alex Woung Raw']);
  assert.equal(/"Main"|Main channel|"Raw"/.test(JSON.stringify(out)), false);
});

// The channel feed as YouTube serves it (trimmed; the real entries for Alex Woung on 2026-11-28).
const FEED = `<feed><title>Alex Woung</title><published>2022-12-10T19:15:35+00:00</published>
<entry><id>yt:video:X7mq617jlmE</id><yt:videoId>X7mq617jlmE</yt:videoId><title>This Cold Email Could Be One Sentence</title><published>2026-11-27T17:00:52+00:00</published></entry>
<entry><id>yt:video:KYb_fCs1klg</id><yt:videoId>KYb_fCs1klg</yt:videoId><title>Outbound Funnel Math: Work Backward From Your Client Goal</title><published>2026-11-26T07:26:49+00:00</published></entry>
</feed>`;

test('content (round 4): posted date = YouTube Published At, else Publish Date, else the channel\'s YouTube feed (Outbound Funnel Math)', async () => {
  assert.equal(youtubeId('https://youtu.be/KYb_fCs1klg'), 'KYb_fCs1klg');
  assert.equal(youtubeId('https://www.youtube.com/watch?si=x&v=KYb_fCs1klg&t=3'), 'KYb_fCs1klg');
  assert.equal(youtubeId('https://www.youtube.com/shorts/KYb_fCs1klg'), 'KYb_fCs1klg');
  assert.equal(youtubeId('https://evil.example/youtu.be/KYb_fCs1klg'), '');
  assert.equal(youtubeId('http://youtu.be/KYb_fCs1klg'), '', 'https only');
  assert.deepEqual([...feedDates(FEED)], [['X7mq617jlmE', '2026-11-27'], ['KYb_fCs1klg', '2026-11-26']], 'entries only (not the feed\'s own date), in New York');
  assert.equal(feedDates('<html>blocked</html>').size, 0);
  // The real row: YouTube link + Publishing Status Published, no Publish Date, no YouTube Published At.
  const funnel = videoOf(v(1, { [CF.title]: 'Outbound Funnel Math', [CF.channel]: MAIN, [CF.stage]: 'Script', [XF.youtubeUrl]: 'https://youtu.be/KYb_fCs1klg', [XF.publishingStatus]: 'Published' }, '2026-11-25T23:18:27.000Z'), new Set());
  assert.deepEqual(postedOn(funnel), { date: '', from: '' }, 'no saved date');
  _resetYoutubeCache();
  const asked: string[] = [];
  const get = async (u: string) => { asked.push(u); return FEED; };
  const now = at12('2026-11-28').getTime();
  assert.equal((await youtubeDates([videoOf(v(9, { [CF.channel]: MAIN }), new Set())], get, now)).size, 0);
  assert.deepEqual(asked, [], 'nothing to look up: no request');
  const yt = await youtubeDates([funnel], get, now);
  assert.deepEqual(asked, [`https://www.youtube.com/feeds/videos.xml?channel_id=${YOUTUBE_CHANNEL_IDS['Alex Woung']}`], 'only that channel\'s feed');
  assert.deepEqual(postedOn(funnel, yt), { date: '2026-11-26', from: 'YouTube' });
  await youtubeDates([funnel], get, now + 60_000);
  assert.equal(asked.length, 1, 'cached for an hour');
  await youtubeDates([funnel], get, now + 61 * 60_000);
  assert.equal(asked.length, 2, 'read again after an hour');
  const saved = videoOf(v(2, { [CF.channel]: MAIN, [XF.youtubeUrl]: 'https://youtu.be/AAAAAAAAAAA', [XF.publishingStatus]: 'Published', [XF.youtubePublishedAt]: '2026-11-28T02:30:00.000Z', [XF.publishDate]: '2026-11-30' }), new Set());
  assert.deepEqual(postedOn(saved), { date: '2026-11-27', from: 'YouTube Published At' }, 'the published time, in New York');
  const planned = videoOf(v(3, { [CF.channel]: RAW, [XF.youtubeUrl]: 'https://youtu.be/BBBBBBBBBBB', [XF.publishingStatus]: 'Published', [XF.publishDate]: '2026-11-24' }), new Set());
  assert.deepEqual(postedOn(planned), { date: '2026-11-24', from: 'Publish Date' });
  assert.deepEqual(postedOn(videoOf(v(4, { [CF.channel]: RAW, [XF.publishDate]: '2026-11-24' }), new Set())), { date: '', from: '' }, 'no proof of posting = not posted');
  // Bounded: at most one read per channel (14 videos → 1 feed); a failing read never throws and waits 15 minutes.
  _resetYoutubeCache();
  const many = Array.from({ length: 14 }, (_, i) => videoOf(v(100 + i, { [CF.channel]: RAW, [XF.youtubeUrl]: `https://youtu.be/${String(i).padStart(11, 'x')}`, [XF.publishingStatus]: 'Published' }), new Set()));
  let n = 0;
  const failing = async () => { n++; throw new Error('offline'); };
  assert.equal((await youtubeDates(many, failing, now)).size, 0);
  await youtubeDates(many, failing, now + 60_000);
  assert.equal(n, 1);
  _resetYoutubeCache();
  // In the view: the row carries the posted date (so it is not "No date yet"); the data note says why.
  const out = buildContent(source([v(1, { [CF.title]: 'Outbound Funnel Math', [CF.channel]: MAIN, [CF.stage]: 'Script', [XF.youtubeUrl]: 'https://youtu.be/KYb_fCs1klg', [XF.publishingStatus]: 'Published' }, '2026-11-25T23:18:27.000Z')], [], {}, { ytDates: yt }), 'appTEST', now);
  const row = out.pipeline.rows.find((r) => r.id === rec(1))!;
  assert.deepEqual([row.posted, row.postedDate, row.postedFrom], [true, '2026-11-26', 'YouTube']);
  assert.equal(row.steps.find((s) => s.key === 'youtube')!.text, 'Posted 11/26.');
  const note = out.notes.find((x) => x.problem === 'Posted, but no posted date saved')!;
  assert.match(note.data, /^1 posted video has a YouTube link but no Publish Date.*"Outbound Funnel Math".*HQ read its date from YouTube for now \(11\/26\)/);
  assert.equal(note.owner, 'Sienna');
});

test('content (round 4): each video\'s steps, the one Next step, and where each happens', () => {
  const now = at12('2026-11-26').getTime(); // 10:00 ET
  type Ctx = Parameters<typeof videoSteps>[2];
  const steps = (f: Record<string, unknown>, x: Partial<Ctx> = {}) =>
    videoSteps(videoOf(v(1, { [CF.title]: 'T', [CF.channel]: MAIN, [CF.ideaDecision]: 'Approved', ...f }), new Set(f[CF.script] ? [rec(1)] : [])), [], { gamma: '', gammaUrl: '', hasPrep: false, stuck: false, now, posted: '', ...x });
  const nowKeys = (ss: ReturnType<typeof steps>) => ss.filter((s) => s.state === 'now').map((s) => s.key);
  assert.equal(nextPrepAt(now), now + 30 * 60_000, 'the next half hour');
  // Idea waiting: the decision, in HQ.
  const idea = steps({ [CF.ideaDecision]: 'Needs Review' });
  assert.deepEqual([nowKeys(idea), idea[0].where, idea[0].buttons[0].kind], [['idea'], 'hq', 'decide']);
  // Approved, no script: Sienna writes it by the next half hour; "Ask Sienna now" is a task, not a write.
  const noScript = steps({});
  const sc = noScript.find((s) => s.key === 'script')!;
  assert.deepEqual([nowKeys(noScript), sc.where, sc.buttons[0].kind], [['script'], 'sienna', 'askSienna']);
  assert.match(sc.text, /by about 10:30 AM ET/);
  assert.match(steps({}, { stuck: true }).find((s) => s.key === 'script')!.text, /over a day ago/);
  assert.match(steps({ [CF.recordingDate]: '2026-11-20' }).find((s) => s.key === 'script')!.text, /skips it: the recording date \(11\/20\) has passed/);
  // Script ready: Open script; Gamma is "not automated yet" with Copy outline and Open Gamma, next to the folder step.
  const ready = steps({ [CF.script]: 'x' }, { hasPrep: true, gamma: '1. Slide' });
  assert.deepEqual(ready.find((s) => s.key === 'script')!.buttons.map((b) => b.kind), ['openScript']);
  const g = ready.find((s) => s.key === 'gamma')!;
  assert.deepEqual([g.state, g.where, g.optional, g.buttons.map((b) => b.kind)], ['now', 'notAutomated', true, ['copyGamma', 'link']]);
  assert.deepEqual(nowKeys(ready), ['gamma', 'folder']);
  assert.equal(ready.find((s) => s.key === 'folder')!.where, 'contentCenter');
  assert.equal(steps({ [CF.script]: 'x' }, { hasPrep: true, gamma: '1', gammaUrl: 'https://gamma.app/docs/x' }).find((s) => s.key === 'gamma')!.state, 'done');
  assert.equal(steps({ [CF.channel]: RAW, [CF.script]: 'x' }).some((s) => s.key === 'gamma'), false, 'Raw has no Gamma');
  // Folder ready: record, upload to the Raw folder (Frame.io link); Sync Frame.io marks it Recorded.
  const rec1 = steps({ [CF.script]: 'x', [XF.rawFolderUrl]: 'https://next.frame.io/raw', [CF.recordingDate]: '2026-11-27' });
  const r = rec1.find((s) => s.key === 'record')!;
  assert.deepEqual([r.state, r.where, r.buttons.map((b) => [b.kind, b.url ?? ''])], ['now', 'byHand', [['link', 'https://next.frame.io/raw'], ['contentCenter', '']]]);
  assert.match(r.text, /recording date 11\/27.*Sync Frame\.io.*marks the video Recorded/);
  // Recorded on OpusClip, full edit submitted: Sienna's editor finishes it.
  const ed = steps({ [CF.script]: 'x', [XF.rawFolderUrl]: 'https://f.io/r', [XF.editingRoute]: 'OpusClip', [XF.message]: 'Recording found. Long-form edit submitted' });
  assert.deepEqual([nowKeys(ed), ed.find((s) => s.key === 'edit')!.where], [['edit'], 'sienna']);
  // Finished, thumbnail approved, details ready: post on YouTube by hand (HQ never posts).
  const up = steps({ [CF.script]: 'x', [XF.rawFolderUrl]: 'https://f.io/r', [XF.finalAssetUrl]: 'https://f.io/f', [XF.finalThumbnailUrl]: 'https://f.io/t', [XF.thumbnailStatus]: 'Approved', [CF.ytTitle]: 'T', [XF.youtubeDescription]: 'D' });
  const y = up.find((s) => s.key === 'youtube')!;
  assert.deepEqual([nowKeys(up), y.where, y.buttons[0].url], [['youtube'], 'byHand', 'https://studio.youtube.com/']);
  // Posted (Outbound Funnel Math): everything up to YouTube done, clips next; the stale "Script" stage is ignored.
  const posted = steps({ [CF.stage]: 'Script', [XF.youtubeUrl]: 'https://youtu.be/KYb_fCs1klg', [XF.publishingStatus]: 'Published' }, { posted: '2026-11-27' });
  assert.deepEqual(nowKeys(posted), ['clips']);
  assert.deepEqual(posted.find((s) => s.key === 'youtube')!.buttons.map((b) => b.url), ['https://youtu.be/KYb_fCs1klg']);
  // No Airtable links anywhere; one Next step at most.
  for (const ss of [idea, noScript, ready, rec1, ed, up, posted]) {
    assert.equal(JSON.stringify(ss).includes('airtable.com'), false);
    assert.ok(ss.filter((s) => s.state === 'now' && !s.optional).length <= 1, 'one Next step');
  }
});

// ---------- the API ----------
let db: Db;
let server: http.Server;
let port = 0;
let webDir: string;
let tables: Record<string, Record<string, Record<string, unknown>>>;
let created: Record<string, string>;
let writes: unknown[][];
let reads: string[];
const asRow = (table: string, id: string) => ({ id, fields: { ...tables[table][id] }, ...(created[id] ? { createdTime: created[id] } : {}) });
const at = {
  async list(table: string, formula: string) {
    reads.push(`${table} ${formula}`);
    let rows = Object.keys(tables[table] ?? {}).map((id) => asRow(table, id));
    if (formula.includes('LAST_MODIFIED_TIME')) rows = rows.filter((r) => r.fields._stuck);
    else if (formula.includes("{Script}!=''")) rows = rows.filter((r) => r.fields[CF.script]);
    const only = [...formula.matchAll(/RECORD_ID\(\)='(rec[A-Za-z0-9]{14})'/g)].map((m) => m[1]);
    if (only.length) rows = rows.filter((r) => only.includes(r.id));
    return rows;
  },
  async get(table: string, id: string) { reads.push(`${table} get`); return tables[table]?.[id] ? asRow(table, id) : null; },
  async create(...a: unknown[]) { writes.push(a); return 'recNEW00000000001'; },
  async update(...a: unknown[]) { writes.push(a); const [t, id, f] = a as [string, string, Record<string, unknown>]; Object.assign(tables[t][id], f); },
};
function cfg(): Config {
  return { ...loadConfig({ ENGINE_SECRET: 'x'.repeat(40), DATABASE_URL: url ?? 'postgres://x', HQ_SESSION_SECRET: 's'.repeat(40), HQ_HOST: 'hq.test.local' } as NodeJS.ProcessEnv), airtableApiKey: undefined, anthropicApiKey: undefined };
}
interface Res { status: number; body: any; text: string }
function call(p: string, opts: { cookie?: string; body?: unknown } = {}): Promise<Res> {
  return new Promise((resolve, reject) => {
    const data = opts.body === undefined ? undefined : JSON.stringify(opts.body);
    const req = http.request({ host: '127.0.0.1', port, method: data ? 'POST' : 'GET', path: p, headers: { host: `127.0.0.1:${port}`, ...(opts.cookie ? { cookie: opts.cookie } : {}), ...(data ? { origin: `https://127.0.0.1:${port}`, 'content-type': 'application/json' } : {}) } }, (res) => {
      const chunks: Buffer[] = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => { const text = Buffer.concat(chunks).toString('utf8'); let body: any = null; try { body = JSON.parse(text); } catch { /* not json */ } resolve({ status: res.statusCode ?? 0, body, text }); });
    });
    req.on('error', reject); if (data) req.write(data); req.end();
  });
}
function login(email: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify({ email, password: PW });
    const req = http.request({ host: '127.0.0.1', port, method: 'POST', path: '/hq/api/auth/login', headers: { host: `127.0.0.1:${port}`, origin: `https://127.0.0.1:${port}`, 'content-type': 'application/json' } }, (res) => {
      res.resume();
      res.on('end', () => resolve(([] as string[]).concat(res.headers['set-cookie'] ?? []).map((c) => c.split(';')[0]).find((c) => c.startsWith('__Host-hq_session=')) ?? ''));
    });
    req.on('error', reject); req.write(data); req.end();
  });
}

before(async () => {
  webDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hqcontent-'));
  fs.writeFileSync(path.join(webDir, 'index.html'), '<!doctype html><title>Dulcy HQ</title>');
  if (skip) return;
  db = createPool(url!); await migrate(db);
  server = createServer(db, cfg(), { at: at as any, webDir });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', () => r()));
  port = (server.address() as AddressInfo).port;
});
after(async () => { if (!skip) { server.close(); await db.end(); } fs.rmSync(webDir, { recursive: true, force: true }); });
beforeEach(async () => {
  tables = {}; created = {}; writes = []; reads = []; _resetContentCache();
  if (skip) return;
  await db.query('TRUNCATE hq_users, hq_sessions, hq_login_attempts, hq_content_log, jobs RESTART IDENTITY CASCADE');
  await upsertUser(db, 'alex@dulcy.io', 'owner', PW, 'Alex');
  await upsertUser(db, 'josh@dulcy.io', 'member', PW, 'Josh');
});

function fixtures() {
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
  tables[CONTENT] = {
    [rec('RAWNEW')]: { [CF.title]: 'Raw: pick this', [CF.channel]: RAW, [CF.ideaDecision]: 'Needs Review', [CF.status]: 'Review' },
    [rec('MAINNEW')]: { [CF.title]: 'Main: pick this', [CF.channel]: MAIN, [CF.ideaDecision]: 'Needs Review', [CF.status]: 'Review' },
    [rec('RAWAPP')]: { [CF.title]: 'Raw approved', [CF.channel]: RAW, [CF.ideaDecision]: 'Approved', [CF.stage]: 'Script', [CF.script]: 'points', [CF.recordingDate]: today, [XF.publishDate]: '2099-01-06' },
    [rec('RAWLEG')]: { [CF.title]: 'Raw legacy in production', [CF.channel]: RAW, [CF.stage]: 'Editing', [XF.publishDate]: '2099-01-07' },
    [rec('RAWREJ')]: { [CF.title]: 'Raw rejected', [CF.channel]: RAW, [CF.ideaDecision]: 'Rejected', [XF.publishDate]: '2099-01-08' },
    [rec('MAINAPP')]: { [CF.title]: 'Main approved', [CF.channel]: MAIN, [CF.ideaDecision]: 'Approved', [CF.stage]: 'Script', [CF.script]: 's', [XF.publishDate]: '2099-01-09' },
    [rec('DUP')]: { [CF.title]: 'Duplicate', [CF.channel]: RAW, [CF.ideaDecision]: 'Duplicate' },
    [rec('NOCHAN')]: { [CF.title]: 'No channel', [CF.ideaDecision]: 'Needs Review' },
  };
  for (const id of Object.keys(tables[CONTENT])) created[id] = new Date().toISOString();
  tables[CLIPS] = { [clipRec(1)]: { [KL.name]: 'Clip ok', [KL.status]: 'Needs Review', [KL.parent]: [rec('MAINAPP')], [KL.notes]: 'Sienna QA: passed 17/17 (fixed: none)' } };
  tables[SETTINGS] = { recSETTINGSRAW0001: { [SF.channel]: RAW, [SF.enabled]: true, [SF.videosPerWeek]: 5, [SF.minimumSpacingDays]: 1 } };
}

test('content API: needs a session, owner only (members get 403 on every route), batched and cached reads', { skip }, async () => {
  fixtures();
  assert.equal((await call('/hq/api/content')).status, 401);
  const josh = await login('josh@dulcy.io');
  assert.equal((await call('/hq/api/content', { cookie: josh })).status, 403);
  assert.equal((await call('/hq/api/content/summary', { cookie: josh })).status, 403);
  assert.equal((await call(`/hq/api/content/ideas/${rec('RAWNEW')}`, { cookie: josh, body: { verdict: 'approve' } })).status, 403);
  assert.deepEqual(writes, [], 'a member writes nothing');
  assert.equal(reads.length, 0, 'a member reads nothing either');
  const alex = await login('alex@dulcy.io');
  const r = await call('/hq/api/content', { cookie: alex });
  assert.equal(r.status, 200, r.text);
  assert.deepEqual(r.body.needs.ideas.map((g: any) => [g.key, g.items.map((i: any) => i.title)]), [['main', ['Main: pick this']], ['raw', ['Raw: pick this']]], 'a row without a channel is not shown');
  assert.deepEqual(r.body.needs.finals.map((f: any) => f.clips.map((c: any) => c.name)), [['Clip ok']]);
  assert.equal(r.body.links.contentCenter, 'https://airtable.com/appxqINt5XKw7a76A/pagacLOPVCIQb1RQt');
  assert.ok(r.body.overlaps.length >= 3, 'overlaps for Riley');
  const n = reads.length;
  assert.ok(n <= 7, `batched: ${n} list calls, no per-row calls`);
  assert.ok(reads.every((x) => !x.endsWith(' get')), 'no per-row reads');
  await call('/hq/api/content', { cookie: alex });
  await call('/hq/api/content/summary', { cookie: alex });
  assert.equal(reads.length, n, 'cached for 60 seconds (summary shares it)');
  assert.deepEqual(writes, []);
});

test('content API: Approve writes exactly what the Content Center\'s "Approve & schedule" writes, and logs it', { skip }, async () => {
  fixtures();
  const alex = await login('alex@dulcy.io');
  const before = reads.length;
  const r = await call(`/hq/api/content/ideas/${rec('RAWNEW')}`, { cookie: alex, body: { verdict: 'approve' } });
  assert.equal(r.status, 200, r.text);
  // The same occupied dates the Content Center uses: this channel, not archived, approved or already in production.
  const exp = nextIdeaDates([{ recording: new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' }), publish: '2099-01-06' }, { recording: '', publish: '2099-01-07' }], { videosPerWeek: 5, clipsPerWeek: 3, minimumSpacingDays: 1 }, new Date(), RAW);
  assert.deepEqual(writes, [[CONTENT, rec('RAWNEW'), { [CF.ideaDecision]: 'Approved', [CF.stage]: 'Idea Approved', [CF.recordingDate]: exp.recording, [XF.publishDate]: exp.publish }]]);
  assert.deepEqual([r.body.decision, r.body.recording, r.body.publish], ['Approved', exp.recording, exp.publish]);
  assert.ok(reads.slice(before).some((x) => x.endsWith(' get')), 'a fresh read of the record, not the cache');
  const log = (await db.query(`SELECT actor, action, record_id, title, changes FROM hq_content_log`)).rows;
  assert.equal(log.length, 1);
  assert.deepEqual([log[0].actor, log[0].action, log[0].record_id, log[0].title], ['Alex', 'idea_approve', rec('RAWNEW'), 'Raw: pick this']);
  assert.deepEqual(log[0].changes.map((c: any) => [c.field, c.from, c.to]), [['Idea Decision', 'Needs Review', 'Approved'], ['Production Stage', '', 'Idea Approved'], ['Recording Date', '', exp.recording], ['Publish Date', '', exp.publish]]);
  // Twice = refused (already decided), nothing written again.
  const again = await call(`/hq/api/content/ideas/${rec('RAWNEW')}`, { cookie: alex, body: { verdict: 'reject' } });
  assert.equal(again.status, 409);
  assert.equal(writes.length, 1);
  // The page shows it on the Friday list now (cache dropped after the write).
  const view = await call('/hq/api/content', { cookie: alex });
  assert.ok(!view.body.needs.ideas[1].items.some((i: any) => i.id === rec('RAWNEW')));
  assert.equal(view.body.log[0].action, 'idea_approve');
});

test('content API: Reject writes exactly Idea Decision "Rejected" and clears both dates; refusals write nothing', { skip }, async () => {
  fixtures();
  const alex = await login('alex@dulcy.io');
  const r = await call(`/hq/api/content/ideas/${rec('MAINNEW')}`, { cookie: alex, body: { verdict: 'reject' } });
  assert.equal(r.status, 200, r.text);
  assert.deepEqual(writes, [[CONTENT, rec('MAINNEW'), { [CF.ideaDecision]: 'Rejected', [CF.recordingDate]: null, [XF.publishDate]: null }]]);
  writes = [];
  assert.equal((await call(`/hq/api/content/ideas/${rec('DUP')}`, { cookie: alex, body: { verdict: 'approve' } })).status, 409, 'a duplicate');
  assert.equal((await call(`/hq/api/content/ideas/${rec('MAINAPP')}`, { cookie: alex, body: { verdict: 'approve' } })).status, 409, 'already approved');
  assert.equal((await call(`/hq/api/content/ideas/${rec('NOCHAN')}`, { cookie: alex, body: { verdict: 'approve' } })).status, 400, 'no channel');
  assert.equal((await call(`/hq/api/content/ideas/${rec('RAWNEW')}`, { cookie: alex, body: { verdict: 'schedule' } })).status, 400, 'only approve or reject');
  assert.equal((await call('/hq/api/content/ideas/recNOPE0000000000', { cookie: alex, body: { verdict: 'approve' } })).status, 404);
  assert.deepEqual(writes, [], 'nothing written for a refusal');
  assert.equal((await db.query(`SELECT count(*)::int AS n FROM hq_content_log`)).rows[0].n, 1, 'only the real write is logged');
});

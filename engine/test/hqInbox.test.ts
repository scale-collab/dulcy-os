// HQ Inbox round (2026-11-28): thread readability (Email 1 / 2 / 3, quoted text, order), old drafts
// with a booking link, Echo redo eligibility and the AI replier mode. Pure functions only.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildTimeline, copyWords, emailStepLabels, historyBlocks, matchStep, parseLooseDate, quoteChain, stepCopies } from '../src/hq/thread.js';
import { linkDraftOf, timesInDraft } from '../src/hq/inbox.js';
import { redoBlock } from '../src/hq/inboxRedo.js';
import { redoInstruction, redoOf, redoProblem, redoTitle } from '../src/agents/redo.js';
import { replierModeOf, summaries, valuesOf, SF } from '../src/hq/replier.js';
import { EF, RA } from '../src/agents/emailsFields.js';

// The campaign's step copy, as in the Campaigns table (spintax, {FIRST_NAME}).
const CAMPAIGN = {
  Name: '[Acme] Agencies, US, Lead Magnet',
  'Campaign Body 1 Version 1': '{Hey|Hi} {FIRST\\_NAME},\nCould I {build you|put together for you} a free list of 1,000 potential clients for your agency’s outreach?\nNames, emails, companies, LinkedIn profiles: {the details you need|what you need} for outbound.\nCan I {put that together|prepare that}?\n',
  'Campaign Body 2 Version 1': '{Hey|Hi} {FIRST\\_NAME},\n\nWe {build|create} lists and {run|manage} outbound campaigns for agencies. Our broader outbound work helped Northwind add $25,000 in monthly recurring revenue in 21 days.\n\nFor your free list, we’d {agree on|settle on} the companies and buyer roles you {want to reach|would like to reach}.\n\n{Mind if I send|Would it be okay if I send} the targeting details we’d need?\n',
  'Campaign Body 3 Version 1': '{Hey|Hi} {FIRST\\_NAME},\nThe free list is a sample of the research behind our outbound work for agencies. You’d get 1,000 contacts matched to your agreed target market.\nWant to try it for your next client-acquisition campaign?\n',
};

// A thread as the canonical history writer stores it: newest first, "──────────" between messages,
// our cold emails only inside the prospect's quoted text (│ marks), times in the sender's zone.
const HISTORY = [
  'Sam Seller sam@acme-mail.com · Provider time Nov 18, 2026, 2:20 PM UTC',
  '',
  'Hi Pat,',
  '',
  'We could work on a per-meeting basis. There is also a monthly technology cost.',
  '',
  'Best,',
  'Sam',
  '',
  'On Tue, Nov 17, 2026 3:48:38 PM Pat Prospect pat@buyer.co wrote:',
  '',
  '│ I do not need a list. What is the per-meeting fee?',
  '',
  '──────────',
  '',
  'Pat Prospect pat@buyer.co · Received Nov 17, 2026, 8:48 PM UTC',
  '',
  'Sam,',
  '',
  'I do not need a list. What is the per-meeting fee?',
  '',
  'Pat',
  '',
  'On Fri, Nov 13, 2026 08:20 AM, Sam Seller <',
  'sam@acme-mail.com> wrote:',
  '',
  '│ Hey Pat,',
  '│ ',
  '│ We build lists and run outbound campaigns for agencies. Our broader',
  '│ outbound work helped Northwind add $25,000 in monthly recurring revenue',
  '│ in 21 days.',
  '│ ',
  '│ For your free list, we’d agree on the companies and buyer roles you would',
  '│ like to reach.',
  '│ ',
  '│ Would it be okay if I send the targeting details we’d need?',
  '│ ',
  '│ --',
  '│ Sam Seller',
  '│ ',
  '│ On Wed, Nov 11, 2026 11:33:15 AM Sam Seller <',
  '│ sam@acme-mail.com> wrote:',
  '│ ',
  '│ │ Hey Pat,',
  '│ │ ',
  '│ │ Could I build you a free list of 1,000 potential clients for your',
  '│ │ agency’s outreach?',
  '│ │ ',
  '│ │ Names, emails, companies, LinkedIn profiles: the details you need for',
  '│ │ outbound.',
  '│ │ ',
  '│ │ Can I put that together?',
  '│ │ ',
  '│ │ --',
  '│ │ Sam Seller',
].join('\n');

test('parseLooseDate: the formats in the history and in quote headers', () => {
  assert.equal(parseLooseDate('Nov 25, 2026, 6:39 PM UTC'), '2026-11-25T18:39:00.000Z');
  assert.equal(parseLooseDate('Wed, Nov 11, 2026 11:33:15 AM'), '2026-11-11T11:33:15.000Z');
  assert.equal(parseLooseDate('Tue, Nov 24, 2026 at 10:35 AM'), '2026-11-24T10:35:00.000Z');
  assert.equal(parseLooseDate('Nov 25, 2026, at 12:22 AM'), '2026-11-25T00:22:00.000Z');
  assert.equal(parseLooseDate('Sept 3, 2026'), '2026-09-03T12:00:00.000Z');
  assert.equal(parseLooseDate('no date here'), '');
});

test('historyBlocks: canonical entries, prospect vs us, an Outlook separator stays inside its message', () => {
  const h = 'Pat pat@buyer.co · Received Nov 24, 2026, 9:48 PM UTC\n\nTell me where the holes are.\n\n──────────\n\nFrom: Sam sam@acme-mail.com\nSent: Tuesday, November 24, 2026 2:07 PM\nTo: Pat\nSubject: Re: chairs\n\nHi Pat, notes below.\n\n──────────\n\nSam sam@acme-mail.com · Provider time Nov 24, 2026, 9:07 PM UTC\n\nHi Pat, notes below.';
  const b = historyBlocks(h, 'pat@buyer.co');
  assert.deepEqual(b.map((x) => [x.who, x.email, x.at]), [['them', 'pat@buyer.co', '2026-11-24T21:48:00.000Z'], ['us', 'sam@acme-mail.com', '2026-11-24T21:07:00.000Z']]);
  assert.match(b[0].text, /From: Sam[\s\S]*notes below/, 'the Outlook quote is part of the message above');
  assert.equal(historyBlocks('Reply:\n\nTuesday works.\n\n▃▃▃▃▃▃▃▃\n\nSENT:\n\nInvite sent.')[1].who, 'us', 'old labelled blocks still work');
});

test('quoteChain: every quoted email, outermost first, wrapped headers joined, quote marks dropped', () => {
  const chain = quoteChain(HISTORY.slice(HISTORY.indexOf('On Fri, Nov 13')));
  assert.deepEqual(chain.map((q) => [q.email, q.at]), [['sam@acme-mail.com', '2026-11-13T08:20:00.000Z'], ['sam@acme-mail.com', '2026-11-11T11:33:15.000Z']]);
  assert.match(chain[0].body, /^Hey Pat,\n\nWe build lists/);
  assert.doesNotMatch(chain[1].body, /│/);
  assert.equal(chain[0].name, 'Sam Seller');
});

test('email-step labelling: matched to the campaign copy (spintax, variables), else by send order', () => {
  const copies = stepCopies(CAMPAIGN);
  assert.deepEqual(copies.map((c) => c.step), [1, 2, 3]);
  assert.ok(copyWords('{Hey|Hi} {FIRST\\_NAME}, we {build|create} lists').has('create'), 'every spintax option counts');
  assert.ok(!copyWords('{Hey|Hi} {FIRST\\_NAME}').has('first_name'), 'variables are dropped');
  const e1 = 'Hey Pat,\n\nCould I build you a free list of 1,000 potential clients for your agency’s outreach?\n\nNames, emails, companies, LinkedIn profiles: the details you need for outbound.\n\nCan I put that together?\n\n--\nSam';
  const e2 = 'Hey Pat,\n\nWe build lists and run outbound campaigns for agencies. Our broader outbound work helped Northwind add $25,000 in monthly recurring revenue in 21 days.\n\nWould it be okay if I send the targeting details we’d need?';
  assert.equal(matchStep(e1, copies), 1);
  assert.equal(matchStep(e2, copies), 2);
  assert.equal(matchStep('Thanks, talk soon about something else entirely different here.', copies), null);
  assert.deepEqual(emailStepLabels([{ body: e2 }], copies), [{ step: 2, stepFrom: 'copy' }], 'a thread that only quotes step 2 says Email 2, not Email 1');
  assert.deepEqual(emailStepLabels([{ body: 'a b c d e f' }, { body: 'g h i j k' }], []), [{ step: 1, stepFrom: 'order' }, { step: 2, stepFrom: 'order' }], 'no copy: by order');
  assert.deepEqual(emailStepLabels([{ body: e1 }, { body: 'unrelated words only here today friend' }], copies), [{ step: 1, stepFrom: 'copy' }, { step: null, stepFrom: null }], 'a mix keeps only real numbers');
});

test('buildTimeline: Email 1 / Email 2 first, then the conversation oldest → newest, latest marked, quoted text split', () => {
  const tl = buildTimeline(HISTORY, { prospectEmail: 'pat@buyer.co', latest: 'Sam,\n\nI do not need a list. What is the per-meeting fee?\n\nPat', latestAt: '2026-11-17T20:48:38.000Z', copies: stepCopies(CAMPAIGN) });
  assert.deepEqual(tl.map((m) => [m.kind, m.who, m.step, m.at.slice(0, 10)]), [
    ['sequence', 'us', 1, '2026-11-11'], ['sequence', 'us', 2, '2026-11-13'], ['reply', 'them', null, '2026-11-17'], ['reply', 'us', null, '2026-11-18'],
  ]);
  assert.equal(tl[2].latest, true);
  assert.equal(tl.filter((m) => m.latest).length, 1);
  assert.match(tl[2].quoted, /^On Fri, Nov 13/, 'the prospect message keeps its quoted history folded');
  assert.equal(tl[2].body, 'Sam,\n\nI do not need a list. What is the per-meeting fee?\n\nPat');
  assert.equal(tl[0].stepFrom, 'copy');
  // No campaign copy: numbered by order. A latest reply missing from the history is added at the end.
  const t2 = buildTimeline(HISTORY, { prospectEmail: 'pat@buyer.co', latest: 'Any update?', latestAt: '2026-11-20T10:00:00.000Z' });
  assert.deepEqual(t2.filter((m) => m.kind === 'sequence').map((m) => [m.step, m.stepFrom]), [[1, 'order'], [2, 'order']]);
  assert.deepEqual([t2.at(-1)!.body, t2.at(-1)!.latest, t2.at(-1)!.who], ['Any update?', true, 'them']);
  assert.deepEqual(buildTimeline(''), []);
});

test('link-draft detection: a booking link and fewer than two specific times', () => {
  const pol = (times: string[] = [], link = 'https://calendly.com/x/intro', extra: Record<string, unknown> = {}) => ({ calendarEvidence: { times, link }, ...extra });
  assert.equal(timesInDraft('Would Tue, Dec 1 at 2:00 PM or Wed, Dec 2 at 10:00 AM work?'), 2);
  assert.equal(timesInDraft('Does Thursday at 3pm ET work?'), 1);
  assert.equal(timesInDraft('Would Tue, Dec 1, 2:00 PM EST work?', ['Tue, Dec 1, 2:00 PM EST']), 1, 'the calendar times count once');
  const d = linkDraftOf('Grab 15 minutes here: https://calendly.com/x/intro', pol());
  assert.deepEqual(d, { links: ['https://calendly.com/x/intro'], times: 0, noTimesThen: true, askedForLink: false });
  assert.equal(linkDraftOf('Tue, Dec 1 at 2:00 PM or Wed, Dec 2 at 10:00 AM? Or pick here: https://calendly.com/x/intro', pol())?.times ?? 'fine', 'fine', 'two times plus a link is fine');
  assert.equal(linkDraftOf('Tue 2pm or Wed 10am ET?', pol()), null, 'no link');
  assert.equal(linkDraftOf('Here: https://api.leadconnectorhq.com/widget/bookings/pat', pol([], ''))?.links[0], 'https://api.leadconnectorhq.com/widget/bookings/pat');
  assert.equal(linkDraftOf('Here: https://book.example.com/me', pol([], 'https://book.example.com/me'))?.links.length, 1, 'the saved booking link counts');
  assert.equal(linkDraftOf('Here: https://calendly.com/x/intro', pol([], '', { they_said: 'Asked us to send a calendar link.' }))?.askedForLink, true);
  assert.equal(linkDraftOf('Here: https://calendly.com/x/intro', pol([], '', { they_said: 'Asked for the video link.' }))?.askedForLink, false, 'a video link is not a booking link');
  assert.equal(linkDraftOf('Tue 2pm? Or https://calendly.com/x/intro', pol(['Tue, Dec 1, 2:00 PM EST', 'Wed, Dec 2, 10:00 AM EST']))?.noTimesThen, false);
});

test('Echo redo: who can be redone, by which stage, and the extra instruction', () => {
  const base = { tab: 'approve' as const, pressed: '', kind: 'reply' as const, lastSentByUs: false };
  assert.equal(redoBlock(base), '');
  assert.match(redoBlock({ ...base, lastSentByUs: true }), /already answered/);
  assert.equal(redoBlock({ ...base, kind: 'followup', lastSentByUs: true }), '', 'a follow-up always follows our own email');
  assert.match(redoBlock({ ...base, pressed: 'Approve Draft' }), /already pressed/);
  assert.match(redoBlock({ ...base, tab: 'skipped' }), /not waiting/);
  const f = (over: Record<string, unknown> = {}) => ({ [RA.state]: 'Needs Approval', [RA.humanAction]: 'None', [EF.lastSent]: 'Last Email Sent By Prospect', [RA.policy]: '{}', ...over });
  assert.equal(redoProblem(f(), 'reply'), '');
  assert.match(redoProblem(f({ [RA.state]: 'Sent' }), 'reply'), /not waiting/);
  assert.match(redoProblem(f({ [RA.humanAction]: 'Skip' }), 'reply'), /already pressed Skip/);
  assert.match(redoProblem(f({ [EF.clientHandling]: true }), 'reply'), /client handles/);
  assert.match(redoProblem(f({ [RA.policy]: JSON.stringify({ kind: 'followup' }) }), 'reply'), /sean.followup/);
  assert.equal(redoProblem(f({ [RA.policy]: JSON.stringify({ kind: 'followup' }), [EF.lastSent]: 'Last Email Sent By Dulcy' }), 'followup'), '');
  assert.match(redoProblem(f(), 'followup'), /not a follow-up/);
  assert.match(redoProblem(f({ [EF.lastSent]: 'Last Email Sent By Dulcy' }), 'reply'), /already answered/);
  assert.equal(redoOf({ redo: 'recABCDEFGHIJKLMN' }), 'recABCDEFGHIJKLMN');
  assert.equal(redoOf({ redo: 'x; drop' }), '');
  assert.equal(redoOf({}), '');
  assert.match(redoInstruction('Grab a time: https://calendly.com/x'), /two specific times[\s\S]*Earlier draft:\nGrab a time/);
  assert.equal(redoTitle('Pat', 'Buyer Co'), 'Redo the draft for Pat (Buyer Co): two real times, not a link');
});

test('AI replier mode: off, draft only, approval, auto (from the client settings + the engine)', () => {
  const row = (over: Record<string, unknown> = {}) => ({ [SF.wsRec]: 'recWS000000000001', [SF.enabled]: true, [SF.handoff]: 'Disabled', [SF.defaultMode]: 'Approval Required', [SF.oooMode]: 'Approval Required', [SF.minConfidence]: 0.9, [SF.maxAuto]: 3, [SF.calStatus]: 'Connected', ...over });
  const mode = (over: Record<string, unknown> = {}, engine = { senderLive: true, autoOn: true }) => { const f = row(over); return replierModeOf(true, valuesOf(f), summaries(f), engine); };
  assert.equal(mode().mode, 'approval');
  assert.match(mode().lines.join(' '), /Calendar connected: Echo offers two real times/);
  assert.equal(mode({ [SF.enabled]: false }).mode, 'off');
  assert.equal(mode({ [SF.handoff]: 'All Replies' }).mode, 'off');
  assert.equal(mode({}, { senderLive: false, autoOn: true }).mode, 'draft-only');
  const auto = mode({ [SF.defaultMode]: 'Auto High Confidence' });
  assert.equal(auto.mode, 'auto');
  assert.match(auto.why, /confident replies \(90% or more\)/);
  assert.equal(mode({ [SF.oooMode]: 'Auto Send' }).mode, 'auto');
  const noAuto = mode({ [SF.defaultMode]: 'Autopilot' }, { senderLive: true, autoOn: false });
  assert.equal(noAuto.mode, 'approval');
  assert.match(noAuto.lines.join(' '), /SEAN_AUTO_SEND/);
  assert.match(mode({ [SF.calStatus]: 'Not Connected' }).lines.join(' '), /not connected: drafts fall back to the booking link/);
  assert.equal(replierModeOf(false, null, null, { senderLive: true, autoOn: true }).mode, 'approval', 'no settings row: default rules, every draft waits');
});

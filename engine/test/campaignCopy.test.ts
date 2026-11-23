// The old n8n builder's copy assembly, ported: field fallbacks, variants, thread replies,
// generic first-name removal, signature + P.S., settings defaults, inbox split.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { campaignSettings, outputCopy, readSequence, sendingLimits } from '../src/campaign/airtableCopy.js';
import { splitSenders } from '../src/airtable/campaignBuild.js';
import { validateCopy } from '../src/campaign/rules.js';

const SIG = '--\n{Best regards|Kind regards|Warm regards|Sincerely|Thank you|Thanks|Yours truly|With best wishes|Best wishes|Warm wishes},\n{SENDER_FULL_NAME}\nFounder, Dulcy';
const PS = "{P.S.|P.s.|p.s.} or tell me to pound sand if you'd like..";

test('sequence: field fallbacks, variant counts, gaps and thread replies (old builder order)', () => {
  const r = {
    'Number of variants - Step 1': '3',
    'Campaign Subject 1 Version 1': 'quick question', 'Campaign Body 1 Version 1': 'Hi {FIRST_NAME},\n\nBody one.',
    'Campaign Email 1 Subject Spintax 2': 'second subject', 'Campaign Email 1 Body Spintax 2': 'Body one B.',
    // variant 3 empty: skipped
    'Campaign Email 2 Subject': 'ignored when thread reply', 'Campaign Body 2 Version 1': 'Follow up.', 'Thread Reply - Step 2': true,
    'Campaign Subject 3 Version 1': 'Re: new topic', 'Campaign Body 3 Version 1': 'Third.',
  };
  const seq = readSequence(r);
  assert.equal(seq.length, 3);
  assert.deepEqual(seq[0].map((c) => c.subject), ['quick question', 'second subject']);
  assert.equal(seq[1][0].subject, 'quick question', 'thread reply reuses step 1 subject');
  assert.equal(seq[1][0].threadReply, true);
  assert.equal(seq[2][0].subject, 'Re: new topic', 'no checkbox: own subject, no thread reply');
  assert.equal(seq[2][0].threadReply, false);
  // Copy with only a subject (or only a body) is refused, as before.
  assert.throws(() => readSequence({ 'Campaign Subject 1 Version 1': 'x' }), /missing its final validated subject or body/);
  assert.throws(() => readSequence({}), /No populated final sequence steps/);
  // Review fields are never used.
  assert.throws(() => readSequence({ 'Subject Line Email 1 (Review)': 'x', 'Script Copy Email 1 (Review)': 'y' }), /No populated/);
});

test('output copy: signature and P.S. added once; a custom P.S. is kept; generic loses {FIRST_NAME}', () => {
  const seq = readSequence({ 'Campaign Subject 1 Version 1': 'hello {FIRST_NAME}', 'Campaign Body 1 Version 1': 'Hi {FIRST_NAME},\n\nWe help spas.\n\nP.S. Custom line.' });
  const info = { brandName: 'Dulcy', senderTitle: 'Founder' };
  const direct = outputCopy(seq, 'direct', info);
  assert.equal(direct[0].body, `Hi {FIRST_NAME},\n\nWe help spas.\n\n${SIG}\n\nP.S. Custom line.`);
  const generic = outputCopy(seq, 'generic', info);
  assert.equal(generic[0].subject, 'hello');
  assert.equal(generic[0].body, `We help spas.\n\n${SIG}\n\nP.S. Custom line.`);
  // No P.S. in the copy: the default one is added. An existing sign-off is not doubled.
  const plain = outputCopy(readSequence({ 'Campaign Subject 1 Version 1': 's', 'Campaign Body 1 Version 1': 'Body.\n\nBest regards,\nAlex' }), 'direct', info);
  assert.equal(plain[0].body, `Body.\n\nBest regards,\nAlex\n\n${PS}`);
  // "(internal)" is dropped from the client name when there is no brand name.
  const internal = outputCopy(readSequence({ 'Campaign Subject 1 Version 1': 's', 'Campaign Body 1 Version 1': 'Body.' }), 'direct', { clientName: 'Dulcy (internal)' });
  assert.match(internal[0].body, /\{SENDER_FULL_NAME\}\nDulcy\n\n/);
  // The engine's own copy check accepts the result for both outputs.
  assert.equal(validateCopy(generic, 'generic')[0].subject, 'hello');
  assert.equal(validateCopy(direct, 'direct').length, 1);
});

test('settings: old builder defaults; Mon-Fri cannot be switched off; record values win', () => {
  const d = campaignSettings({});
  assert.deepEqual(d.days, { monday: true, tuesday: true, wednesday: true, thursday: true, friday: true, saturday: false, sunday: false });
  assert.equal(d.timezone, 'America/New_York');
  assert.deepEqual(d.settings, { plain_text: true, open_tracking: false, reputation_building: false, can_unsubscribe: false, unsubscribe_text: '' });
  assert.equal(d.maxEmailsPerDay, null);
  assert.equal(d.daysBetween, 2);
  // Unsubscribe link is always off, even when the record ticks it (Alex, 2026-11-23).
  const u = campaignSettings({ can_unsubscribe: true, unsubscribe_text: 'Unsubscribe here' });
  assert.equal(u.settings.can_unsubscribe, false);
  assert.equal(u.settings.unsubscribe_text, '');
  const s = campaignSettings({ 'Run on Saturday': true, TimeZone: 'Europe/London', plain_text: true, max_emails_per_day: 300, 'Days Between Emails': '3' });
  assert.equal(s.days.saturday, true);
  assert.equal(s.timezone, 'Europe/London');
  assert.equal(s.settings.plain_text, true);
  assert.equal(s.maxEmailsPerDay, 300);
  assert.equal(s.daysBetween, 3);
});

test('inbox split: by lead share, at least 1 each when both outputs exist', () => {
  assert.deepEqual(splitSenders(10, 257, 243), { generic: 5, direct: 5 });
  assert.deepEqual(splitSenders(10, 900, 100), { generic: 9, direct: 1 });
  assert.deepEqual(splitSenders(10, 10, 990), { generic: 1, direct: 9 });
  assert.deepEqual(splitSenders(4, 0, 500), { generic: 0, direct: 4 });
  assert.throws(() => splitSenders(1, 5, 5), /at least 2 inboxes/);
});

test('daily limits: sized to the inboxes; a set limit below what they send is refused', () => {
  assert.deepEqual(sendingLimits(100, 15, null, null), { max_emails_per_day: 1500, max_new_leads_per_day: 1200 });
  assert.throws(() => sendingLimits(100, 15, 1000, null), /cop|stall/);
});

test('daily limits: a value copied from a bigger campaign is lowered to what the inboxes send (2026-11-23)', () => {
  // Live: 7 inboxes x 15/day built with 2,325 emails and 775 new leads a day.
  assert.deepEqual(sendingLimits(7, 15, 2325, 775), { max_emails_per_day: 105, max_new_leads_per_day: 105 });
  assert.deepEqual(sendingLimits(7, 15, 2325, null), { max_emails_per_day: 105, max_new_leads_per_day: 84 });
  assert.deepEqual(sendingLimits(10, 15, 5000, 60), { max_emails_per_day: 150, max_new_leads_per_day: 60 });
});

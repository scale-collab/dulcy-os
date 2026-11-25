// Sean follows each client's Reply Agent send settings (Alex 2026-11-25). Approval Required is the default.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseSettings, autoSendDecision, inOfficeHours, isUsHoliday, typeAllowed, extraTypeOn } from '../src/agents/settings.js';
import { extraTypeOf, waitingFormula, EF, RA } from '../src/agents/emailsFields.js';

// The real shape of a settings row (Airtable, read by name), as on the live base 2026-11-25.
const row = (over: Record<string, unknown> = {}) => ({
  Enabled: true, 'Default Mode': 'Approval Required', 'OOO Mode': 'Approval Required', 'Minimum Auto Confidence': 0.92, 'Max Automatic Replies': 3,
  Timezone: 'America/New_York', 'Office Start': '09:00', 'Office End': '17:00', 'Exclude Weekends': true, 'Exclude US Holidays': true,
  'Routing Settings JSON': JSON.stringify({ groups: [
    { name: 'Interested replies', intents: ['Interested', 'Info Request'], mode: 'Approval Required' },
    { name: 'Never reply', intents: ['Unsubscribe', 'Hostile'], mode: 'Do Not Reply' },
  ] }),
  ...over,
});
const draft = (over: Record<string, unknown> = {}) => ({ action: 'reply', intent: 'Interested', confidence: 95, draft: 'Hi Jane, does Tue 2pm ET work?', ...over }) as any;

test('settings rows are read in their live format', () => {
  const s = parseSettings(row({ 'Not Interested Nudge': true, 'Always Require Human Review': ['Cost Objection'] }));
  assert.equal(s.mode, 'Approval Required');
  assert.equal(s.oooAuto, false);
  assert.equal(s.minConfidence, 0.92);
  assert.equal(s.maxAuto, 3);
  assert.deepEqual(s.alwaysReview, ['Cost Objection']);
  assert.equal(s.routes.Interested, 'Approval Required');
  assert.equal(s.routes.Hostile, 'Do Not Reply');
  assert.equal(s.notInterested.enabled, true, 'the Not Interested Nudge checkbox turns the courtesy reply on');
  assert.deepEqual(s.office, { tz: 'America/New_York', start: '09:00', end: '17:00', noWeekends: true, noHolidays: true });
  const empty = parseSettings(null);
  assert.equal(empty.mode, 'Approval Required');
  assert.equal(empty.minConfidence, 0.9);
});

test('Approval Required (every client today): nothing is sent automatically', () => {
  const s = parseSettings(row({ 'Routing Settings JSON': '' }));
  assert.equal(autoSendDecision(s, draft(), 0).auto, false);
  // A group set to Approval Required wins over an Autopilot default.
  assert.equal(autoSendDecision(parseSettings(row({ 'Default Mode': 'Autopilot' })), draft(), 0).auto, false);
});

test('Autopilot and Auto High Confidence send only past every guard', () => {
  const auto = parseSettings(row({ 'Default Mode': 'Autopilot', 'Routing Settings JSON': '' }));
  assert.equal(autoSendDecision(auto, draft(), 0).auto, true);
  assert.equal(autoSendDecision(auto, draft(), 0, false).auto, false, 'engine switch SEAN_AUTO_SEND=off wins');
  assert.equal(autoSendDecision(auto, draft({ action: 'ask_alex' }), 0).auto, false);
  assert.equal(autoSendDecision(auto, draft({ draft: 'Hi [GAP: price]' }), 0).auto, false);
  assert.equal(autoSendDecision(auto, draft(), 3).auto, false, 'max automatic replies per thread');
  assert.match(autoSendDecision(parseSettings(row({ 'Default Mode': 'Autopilot', 'Routing Settings JSON': '', 'Always Require Human Review': ['Interested'] })), draft(), 0).why, /Always Require Human Review/);
  assert.equal(autoSendDecision(parseSettings(row({ 'Default Mode': 'Autopilot', Enabled: false })), draft(), 0).auto, false);

  const high = parseSettings(row({ 'Default Mode': 'Auto High Confidence', 'Routing Settings JSON': '' }));
  assert.equal(autoSendDecision(high, draft({ confidence: 92 }), 0).auto, true);
  assert.equal(autoSendDecision(high, draft({ confidence: 91 }), 0).auto, false);
  assert.match(autoSendDecision(high, draft({ confidence: 50 }), 0).why, /under the client's 92%/);

  // A reply type's own group can switch one type to automatic.
  const grp = parseSettings(row({ 'Routing Settings JSON': JSON.stringify({ groups: [{ intents: ['Meeting Request'], mode: 'Autopilot' }] }) }));
  assert.equal(autoSendDecision(grp, draft({ intent: 'Meeting Request' }), 0).auto, true);
  assert.equal(autoSendDecision(grp, draft({ intent: 'Interested' }), 0).auto, false);
});

test('OOO Mode = Auto Send covers out-of-office only; Do Not Reply types are skipped', () => {
  const s = parseSettings(row({ 'OOO Mode': 'Auto Send', 'Routing Settings JSON': '' }));
  assert.equal(autoSendDecision(s, draft({ intent: 'Out of Office' }), 0).auto, true);
  assert.equal(autoSendDecision(s, draft({ intent: 'Interested' }), 0).auto, false);
  assert.equal(typeAllowed(parseSettings(row()), 'Hostile'), false);
});

test('office hours: client time zone, weekends and US holidays', () => {
  const o = parseSettings(row()).office;
  assert.equal(inOfficeHours(o, new Date('2026-11-24T15:00:00Z')), true, 'Tuesday 10am ET');
  assert.equal(inOfficeHours(o, new Date('2026-11-24T13:30:00Z')), false, 'Tuesday 8:30am ET');
  assert.equal(inOfficeHours(o, new Date('2026-11-24T22:30:00Z')), false, 'Tuesday 5:30pm ET');
  assert.equal(inOfficeHours(o, new Date('2026-11-28T15:00:00Z')), false, 'Saturday');
  assert.equal(inOfficeHours({ ...o, noWeekends: false }, new Date('2026-11-28T15:00:00Z')), true);
  assert.equal(inOfficeHours(o, new Date('2026-11-26T15:00:00Z')), false, 'Thanksgiving 2026');
  assert.equal(inOfficeHours({ ...o, noHolidays: false }, new Date('2026-11-26T15:00:00Z')), true);
  assert.equal(inOfficeHours({ ...o, tz: 'America/Los_Angeles' }, new Date('2026-11-24T15:00:00Z')), false, '7am in LA');
  assert.equal(isUsHoliday(2026, 5, 25), true, 'Memorial Day');
  assert.equal(isUsHoliday(2026, 9, 7), true, 'Labor Day');
  assert.equal(isUsHoliday(2026, 11, 19), false);
});

test('out-of-office and not-interested first replies: only where the client turns them on', () => {
  assert.equal(extraTypeOn(parseSettings(row()), 'Out of Office'), false, 'no reply types ticked, OOO Mode Approval Required');
  assert.equal(extraTypeOn(parseSettings(row({ 'Enabled Reply Types': ['Interested', 'Out of Office'] })), 'Out of Office'), true);
  assert.equal(extraTypeOn(parseSettings(row({ 'OOO Mode': 'Auto Send' })), 'Out of Office'), true);
  assert.equal(extraTypeOn(parseSettings(row()), 'Not Interested'), false);
  assert.equal(extraTypeOn(parseSettings(row({ 'Not Interested Nudge': true })), 'Not Interested'), true);
  assert.equal(extraTypeOn(parseSettings(row({ 'Not Interested Nudge': true, 'Enabled Reply Types': ['Interested'] })), 'Not Interested'), false, 'type unticked');
  assert.equal(extraTypeOn(parseSettings(null), 'Not Interested'), false);
  assert.equal(extraTypeOf({ [EF.leadStatus]: 'Out Of Office' }), 'Out of Office');
  assert.equal(extraTypeOf({ [EF.leadStatus]: 'Not Interested', [RA.intent]: 'Interested' }), '', 'Sean read it as interested');
  assert.equal(extraTypeOf({ [EF.leadStatus]: 'Interested' }), '');
  assert.match(waitingFormula(14, true), /'Out Of Office'/);
  assert.doesNotMatch(waitingFormula(14), /'Out Of Office'/);
});

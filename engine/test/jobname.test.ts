// MillionVerifier / LeadMagic jobs are named after the lead list (Alex, 2026-11-23).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { jobName } from '../src/stages/verify.js';

test('provider job name = lead list name + short code; old record-ID name without a list name', () => {
  assert.equal(jobName('[Dulcy] B2B Marketing Agencies, 1-200 Empl, USA (Engine) 2026-11-21', 'recHoMoNkGZdjnRDD', 'abcdef1234567890'),
    '[Dulcy] B2B Marketing Agencies, 1-200 Empl, USA (Engine) 2026-11-21 - abcdef12');
  assert.equal(jobName('Bad/name:with*chars', 'recX', '12345678'), 'Bad name with chars - 12345678');
  assert.equal(jobName(undefined, 'recHoMoNkGZdjnRDD', 'abc'), 'dulcy-recHoMoNkGZdjnRDD-abc');
});

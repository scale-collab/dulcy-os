// DiscoLike marks endpoints it is retiring with Deprecation / Sunset headers: the engine notices.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createDiscoLikeClient, deprecatedSeen } from '../src/providers/discolike.js';

test('a DiscoLike answer with a Sunset header is recorded (and warned once), the call still works', async () => {
  const fetchImpl = (async () => new Response(JSON.stringify({ count: 5 }), { status: 200, headers: { 'content-type': 'application/json', Sunset: 'Thu, 31 Dec 2026 23:59:59 GMT' } })) as typeof fetch;
  const disco = createDiscoLikeClient({ apiKey: 'k', baseUrl: 'http://x', fetchImpl });
  const r = await disco.contactsRunGet('abc');
  assert.deepEqual(r, { count: 5 });
  assert.equal(deprecatedSeen.get('/v1/contacts/run/abc'), 'Thu, 31 Dec 2026 23:59:59 GMT');
});

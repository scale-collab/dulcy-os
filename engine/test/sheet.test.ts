// Sheet reader tests: Google login, column download, and the old workflow's row rules.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createSheetsClient, columnLetter } from '../src/providers/google.js';
import { loadSheetRows, sheetIdFrom, directRows, genericRows } from '../src/sources/sheet.js';
import { PermanentError } from '../src/errors.js';
import { startFakeGoogle, type FakeGoogle } from './fakes/google.js';

const SHEET = '1QYLOeUxwDXunQm_KMEYKB_7jW7l47ZQJ8wVVtCZBUd8';
let g: FakeGoogle;
before(async () => { g = await startFakeGoogle(); });
after(() => g.close());

test('column letters', () => {
  assert.deepEqual([0, 25, 26, 27, 701, 702].map(columnLetter), ['A', 'Z', 'AA', 'AB', 'ZZ', 'AAA']);
});

test('sheet link or id', () => {
  assert.equal(sheetIdFrom(`https://docs.google.com/spreadsheets/d/${SHEET}/edit#gid=1`), SHEET);
  assert.equal(sheetIdFrom(SHEET), SHEET);
  assert.throws(() => sheetIdFrom('nope'), PermanentError);
});

test('direct rows: need a domain and an email or a full name; names split', () => {
  const rows = directRows([
    { email: 'Ann@Acme.com', name: 'Ann Lee', domain: 'https://www.acme.com/about' },
    { email: '', firstName: 'Bo', lastName: 'Ng', domain: 'beta.com' },
    { email: 'x@y.com', domain: '' },
    { email: '', name: 'Solo', domain: 'z.com' },
  ]);
  assert.deepEqual(rows.map((r) => [r.email, r.firstName, r.lastName, r.domain]), [['ann@acme.com', 'Ann', 'Lee', 'acme.com'], ['', 'Bo', 'Ng', 'beta.com']]);
});

test('generic rows: JSON list or split text, malformed skipped, footprint parsed', () => {
  const rows = genericRows([
    { publicEmails: '["info@acme.com", {"email":"Sales@Acme.com"}, "bad"]', footprint: '150', domain: 'acme.com', company: 'Acme' },
    { publicEmails: 'hello@b.com; team@b.com', footprint: 'n/a', domain: 'b.com' },
  ]);
  assert.deepEqual(rows.map((r) => [r.email, r.footprint]), [['info@acme.com', 150], ['sales@acme.com', 150], ['hello@b.com', null], ['team@b.com', null]]);
});

test('reads only the needed columns of Contacts and Expanded Companies, signed in as the Workspace user', async () => {
  g.tabs = {
    Contacts: [
      ['First Name', 'Last Name', 'Email', 'Notes', 'Website', 'LinkedIn URL'],
      ['Ann', 'Lee', 'ann@acme.com', 'secret note', 'acme.com', 'linkedin.com/in/ann'],
      ['Bo', 'Ng', '', '', 'beta.com', ''],
    ],
    'Expanded Companies': [
      ['Name', 'Domain', 'Digital Footprint', 'Public Emails'],
      ['Acme', 'acme.com', '120', '["info@acme.com"]'],
    ],
  };
  const sheets = createSheetsClient({ keyFile: g.keyFile, impersonate: 'scale@dulcy.io', sheetsBaseUrl: g.url });
  const rows = await loadSheetRows(sheets, { sheetId: SHEET }, { includeDirect: true, includeGeneric: true });
  assert.equal(g.lastSub, 'scale@dulcy.io');
  assert.deepEqual(rows.map((r) => `${r.type}:${r.email}`), ['direct:ann@acme.com', 'direct:', 'generic:info@acme.com']);
  assert.ok(!JSON.stringify(rows).includes('secret note'), 'unneeded columns are not downloaded');
  assert.equal(rows[0].linkedin, 'linkedin.com/in/ann');
  const onlyGeneric = await loadSheetRows(sheets, { sheetId: SHEET }, { includeDirect: false, includeGeneric: true });
  assert.equal(onlyGeneric.length, 1);
  assert.equal(g.tokenCalls, 1, 'the sign-in token is reused');
});

test('a missing key file or a refused sign-in fails with a clear message', async () => {
  const none = createSheetsClient({ keyFile: '/nope/google-sa.json', sheetsBaseUrl: g.url });
  await assert.rejects(none.header(SHEET, 'Contacts'), /key file not found/);
  g.tabs = { Contacts: [['Email', 'Name']] };
  const sheets = createSheetsClient({ keyFile: g.keyFile, sheetsBaseUrl: g.url });
  await assert.rejects(loadSheetRows(sheets, { sheetId: SHEET }, { includeDirect: true, includeGeneric: false }), /no domain\/website column/);
});

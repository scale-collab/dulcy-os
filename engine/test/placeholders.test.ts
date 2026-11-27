// Placeholder guard (Alex, 2026-11-27): a reply with an unfilled placeholder is never sendable.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { findPlaceholders, placeholderProblem } from '../src/agents/placeholders.js';

test('findPlaceholders: catches square-bracket instructions, merge tags, <insert …>, TBD', () => {
  assert.deepEqual(findPlaceholders('Hi Jane, here it is: [video link for Artisan Luxe Beauty]. Talk soon.'), ['[video link for Artisan Luxe Beauty]']);
  assert.deepEqual(findPlaceholders('Here: [link]'), ['[link]']);
  assert.deepEqual(findPlaceholders('Hi {{first_name}}, thanks'), ['{{first_name}}']);
  assert.deepEqual(findPlaceholders('Hi {FIRST_NAME}, thanks'), ['{FIRST_NAME}']);
  assert.deepEqual(findPlaceholders('See <insert case study here> for proof'), ['<insert case study here>']);
  assert.deepEqual(findPlaceholders('Best,\n[Your name]'), ['[Your name]']);
  assert.deepEqual(findPlaceholders('It costs [GAP: price for 3 months].'), ['[GAP: price for 3 months]']);
  assert.deepEqual(findPlaceholders('Worked with [COMPANY] and [X]'), ['[COMPANY]', '[X]']);
  assert.deepEqual(findPlaceholders('Pricing is TBD for now'), ['TBD']);
  assert.deepEqual(findPlaceholders('Does [day] at [time] work?'), ['[day]', '[time]']);
  assert.deepEqual(findPlaceholders('Book here: <calendar link>'), ['<calendar link>']);
  assert.deepEqual(findPlaceholders('[link] and again [link]'), ['[link]'], 'each placeholder once');
  assert.deepEqual(findPlaceholders('[GAP: {{price}}]'), ['[GAP: {{price}}]'], 'a nested one counts as the outer one');
});

test('findPlaceholders: normal text with brackets is left alone', () => {
  for (const ok of [
    'Happy to help (see below). Does Tuesday at 2pm ET work?',
    'Per the study [1], results vary.',
    'He said it was "great" [sic].',
    'Here is the deck: [our deck](https://dulcy.io/deck)',
    'Send it to Jane <jane@acme.com> please',
    'Our site <https://dulcy.io> has more',
    'Line one<br>line two',
    'Options: {a|b} are spintax, checked elsewhere',
    '',
    'Thanks Jane! Wednesday at 5 PM works. You are all set.',
  ]) assert.deepEqual(findPlaceholders(ok), [], ok);
});

test('placeholderProblem: one clear line, empty when clean', () => {
  assert.equal(placeholderProblem('All good, see you Tuesday.'), '');
  assert.equal(placeholderProblem('Here: [link]'), 'the reply still has a placeholder: "[link]". Replace it before sending');
  assert.match(placeholderProblem('[a link] [b link] [c link] [d link]'), /^the reply still has 4 placeholders: "\[a link\]", "\[b link\]", "\[c link\]" and more\. Replace them before sending$/);
});

test('the web copy (the Send button) has exactly the same rules as the server guard', () => {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const code = (f: string) => fs.readFileSync(f, 'utf8').split('\n').filter((l) => !l.startsWith('//')).join('\n');
  assert.equal(code(path.resolve(here, '../../../hq/web/src/placeholders.ts')), code(path.resolve(here, '../../src/agents/placeholders.ts')));
});

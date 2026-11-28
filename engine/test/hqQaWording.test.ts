// QA 11/29 (final check of Alex's walkthrough items): screen wording rules that a source scan can hold.
//   - Never write "owner only" on screen (round 4): only the owner sees money anyway.
//   - The inbox cost line is just "Inboxes at $2.50 a month" (round 4): never "discounted".
//   - Dates use slashes and drop the weekday (RULES 2026-11-27, round 4): no "Fri, Dec 4" formats in HQ.
// Comments are stripped first; the client portal (hq/web/src/portal) is a separate product and not scanned.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, '../../..');
const WEB = path.join(repo, 'hq/web/src');
const files = (dir: string): string[] => readdirSync(dir).flatMap((n) => {
  const p = path.join(dir, n);
  if (statSync(p).isDirectory()) return n === 'portal' ? [] : files(p);
  return /\.tsx?$/.test(n) ? [p] : [];
});
/** Source without comments (block comments, then line comments not preceded by ":" so URLs stay). */
const code = (p: string) => readFileSync(p, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1');

test('QA 11/29: no "owner only" text and no "discounted" inbox price anywhere on HQ screens', () => {
  const hits: string[] = [];
  for (const f of files(WEB)) {
    const c = code(f);
    for (const m of c.matchAll(/owner[ -]only|discounted/gi)) hits.push(`${path.relative(repo, f)}: ${c.slice(Math.max(0, m.index! - 40), m.index! + 40).replace(/\s+/g, ' ')}`);
  }
  assert.deepEqual(hits, []);
  for (const f of ['engine/src/hq/clientProfit.ts', 'engine/src/hq/deliverability.ts']) {
    assert.doesNotMatch(code(path.join(repo, f)), /discounted/i, f);
  }
  assert.ok(readFileSync(path.join(repo, 'engine/src/hq/deliverability.ts'), 'utf8').includes('costRule: `Inboxes at $${INBOX_MONTHLY_DEFAULT.toFixed(2)} a month.`'));
});

test('QA 11/29: HQ screens format no date with a weekday next to the month', () => {
  const hits: string[] = [];
  for (const f of files(WEB)) {
    // toLocaleDateString(..., { weekday: 'short', month: 'short', ... }) = "Fri, Dec 4": not allowed in HQ.
    for (const m of code(f).matchAll(/weekday:\s*'(short|long)'[^}]*month:|month:[^}]*weekday:\s*'(short|long)'/g)) hits.push(`${path.relative(repo, f)}: ${m[0]}`);
  }
  assert.deepEqual(hits, []);
});

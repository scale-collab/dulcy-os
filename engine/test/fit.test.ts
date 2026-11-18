// Fit check tests (code, no LLM): obvious bad fits dropped with a reason, maybes kept.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkCompanyFit, summarizeSample, contactCountryAllowed, type FitCriteria } from '../src/leadlist/fit.js';

const K: FitCriteria = {
  industries: ['roofing contractors'], employeeMin: 1, employeeMax: 50, countries: ['us'],
  excludeKeywords: ['franchise'], includeKeywords: ['roof repair'], excludedDomains: ['www.currentclient.com'], residential: true,
};
const base = { domain: 'https://www.acmeroofing.com/', name: 'Acme Roofing', description: 'Residential roof repair and replacement', industry_groups: 'Roofing Contractors', employees: 12, country: 'US' };

test('a clear fit is "fit" with its signals', () => {
  const r = checkCompanyFit(base, K);
  assert.equal(r.decision, 'fit');
  assert.equal(r.domain, 'acmeroofing.com');
  assert.deepEqual(r.signals, ['target industry', 'target wording ("roof repair")']);
});

test('obvious bad fits are dropped, each with its reason', () => {
  const drop = (over: object) => checkCompanyFit({ ...base, ...over }, K);
  assert.match(drop({ domain: 'currentclient.com' }).reasons[0], /client exclusion list/);
  assert.match(drop({ description: 'Roofing franchise opportunities' }).reasons[0], /described as "franchise"/);
  assert.match(drop({ employees: 400 }).reasons[0], /400 employees, above 50/);
  assert.match(drop({ country: 'CA' }).reasons[0], /outside the target countries/);
  assert.match(drop({ description: 'The best directory to find a contractor near you' }).reasons[0], /directory, not a provider/);
  assert.match(drop({ description: 'Industrial roofing for warehouses' }).reasons[0], /residential/);
  assert.match(drop({ description: 'The leading online marketplace for roofers' }).reasons[0], /marketplace, not a provider \("online marketplace"\)/);
});

test('ordinary company wording is not a business type (wrong cuts seen live 2026-11-18)', () => {
  const k = { ...K, residential: false };
  for (const description of [
    'Tape manufacturer. Latest news and product launches.',           // "news"
    'Steam showers. Find a stockist in our dealer directory.',          // "directory"
    'Car care products, also on the Amazon marketplace.',               // "marketplace"
    'Family business. Member of the Roofing Contractors Association.',  // "association"
  ]) assert.notEqual(checkCompanyFit({ ...base, description }, { ...k, targetsBusinessTypes: ['manufacturer'] }).decision, 'drop', description);
  // DiscoLike's homepage keyword list alone never decides a business type.
  assert.notEqual(checkCompanyFit({ ...base, keywords: ['news', 'directory', 'marketplace'] }, k).decision, 'drop');
});

test('unknowns never drop: missing size or country is a maybe at worst', () => {
  const r = checkCompanyFit({ domain: 'x.com', name: 'X Roofing' }, K);
  assert.equal(r.decision, 'maybe');
  assert.deepEqual(r.reasons, []);
});

test('the thesis can target a type that is normally "not a provider"', () => {
  const k = { ...K, residential: false, targetsBusinessTypes: ['manufacturer'] };
  assert.notEqual(checkCompanyFit({ ...base, description: 'Roofing material manufacturer' }, k).decision, 'drop');
  assert.equal(checkCompanyFit({ ...base, description: 'Roofing material manufacturer' }, { ...k, targetsBusinessTypes: [] }).decision, 'drop');
});

test('sample gate: usable = fit + maybe; Passed ≥ 80%, Needs Review ≥ 70%, else Failed', () => {
  const mk = (fit: number, maybe: number, drop: number) => [
    ...Array(fit).fill({ decision: 'fit' }), ...Array(maybe).fill({ decision: 'maybe' }), ...Array(drop).fill({ decision: 'drop' })];
  assert.equal(summarizeSample(mk(60, 20, 20)).status, 'Passed');
  assert.equal(summarizeSample(mk(50, 22, 28)).status, 'Needs Review');
  assert.equal(summarizeSample(mk(40, 20, 40)).status, 'Failed');
  assert.equal(summarizeSample([]).status, 'Failed');
});

test('contact location: India, Pakistan and Africa excluded by the person\'s country; unknown kept', () => {
  assert.equal(contactCountryAllowed('India'), false);
  assert.equal(contactCountryAllowed('nigeria'), false);
  assert.equal(contactCountryAllowed('United States'), true);
  assert.equal(contactCountryAllowed(''), true);
});

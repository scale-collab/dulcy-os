// List profile: one AI call per list turns thesis + client context into cut rules and Tier 1
// signals; companies are then checked in code. Same process for every industry.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkCompanyFit } from '../src/leadlist/fit.js';
import { cleanProfile, codeProfile, profileCriteria, similarityTop, type ProfileInput } from '../src/leadlist/profile.js';

const base: ProfileInput = { filters: { country: ['US'] }, sampleIndustries: { CONSTRUCTION: 80, 'CONSTRUCTION/ROOFING': 60, ADVERTISING_AND_MARKETING: 5 }, sampleSimilarities: Array.from({ length: 30 }, (_, i) => 50 + i) };
const co = (description: string, extra: Record<string, unknown> = {}) => ({ domain: 'x.com', name: 'X', description, industry_groups: ['CONSTRUCTION'], sub_industry: ['CONSTRUCTION/ROOFING'], country: 'US', similarity: 60, ...extra });

test('AI profile is cleaned: unknown industry codes, types and single-word cuts are dropped', () => {
  const p = cleanProfile({ summary: 's', customer: 'residential', allowBusinessTypes: ['manufacturer', 'banana'], excludeKeywords: ['marketing agency', 'roof'], excludeIndustries: ['ADVERTISING_AND_MARKETING', 'MADE_UP'], targetIndustries: ['CONSTRUCTION/ROOFING'], targetKeywords: ['roof replacement'] }, base);
  assert.deepEqual(p.allowBusinessTypes, ['manufacturer']);
  assert.deepEqual(p.excludeKeywords, ['marketing agency']);
  assert.deepEqual(p.excludeIndustries, ['advertising_and_marketing']);
  assert.equal(p.customer, 'residential');
  assert.equal(p.similarityTop, 0.7, 'top third of this list sample');
});

test('residential roofing thesis: commercial-only roofers are cut, ordinary roofers stay', () => {
  const k = profileCriteria(cleanProfile({ customer: 'residential', targetIndustries: ['CONSTRUCTION/ROOFING'] }, base), base.filters);
  assert.equal(checkCompanyFit(co('Industrial roofing for warehouses and factories'), k).decision, 'drop');
  assert.notEqual(checkCompanyFit(co('Roof repair for homes in Dallas'), k).decision, 'drop');
});

test('client is a marketing agency: directories and competing agencies are cut; unclear stays Tier 2', () => {
  const k = profileCriteria(cleanProfile({ excludeKeywords: ['marketing agency', 'seo agency'], excludeIndustries: ['ADVERTISING_AND_MARKETING'], targetIndustries: ['CONSTRUCTION/ROOFING'], targetKeywords: ['roof repair'] }, base), base.filters);
  assert.equal(checkCompanyFit(co('A business directory of local roofers'), k).decision, 'drop');
  assert.equal(checkCompanyFit(co('Full-service marketing agency for contractors', { industry_groups: ['ADVERTISING_AND_MARKETING'], sub_industry: [] }), k).decision, 'drop');
  assert.equal(checkCompanyFit(co('', { industry_groups: [], sub_industry: [] }), k).decision, 'maybe', 'little information = Tier 2, not Cut');
  assert.equal(checkCompanyFit(co('Roof repair and replacement'), k).decision, 'fit', 'industry + wording = Tier 1');
});

test('an excluded industry never cuts a company that is also in a target industry', () => {
  const k = profileCriteria(cleanProfile({ excludeIndustries: ['ADVERTISING_AND_MARKETING'], targetIndustries: ['CONSTRUCTION'] }, base), base.filters);
  assert.notEqual(checkCompanyFit(co('Roofing company', { industry_groups: ['CONSTRUCTION', 'ADVERTISING_AND_MARKETING'] }), k).decision, 'drop');
});

test('manufacturer thesis allows manufacturers; code-only profile reads the sentence and plan', () => {
  const p = codeProfile({ ...base, targeting: 'Product manufacturers that sell through distributors', filters: { sub_industry: ['MANUFACTURING/CONTRACT_MANUFACTURER'], phrase_match: ['"private label" OR "own brand"'] } });
  assert.ok(p.allowBusinessTypes.includes('manufacturer') && p.allowBusinessTypes.includes('wholesaler'));
  assert.deepEqual(p.targetIndustries, ['manufacturing/contract_manufacturer']);
  assert.ok(p.targetKeywords.includes('private label'));
  assert.equal(codeProfile({ ...base, targeting: 'Residential roofing companies' }).customer, 'residential');
  assert.notEqual(checkCompanyFit(co('We manufacture outdoor furniture'), profileCriteria(p, {})).decision, 'drop');
});

test('similarity line is relative to the list and bounded', () => {
  assert.equal(similarityTop([]), 0.7);
  assert.equal(similarityTop(Array.from({ length: 30 }, () => 20)), 0.5);
  assert.equal(similarityTop(Array.from({ length: 30 }, () => 99)), 0.9);
});

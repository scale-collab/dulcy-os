// Contacts: Tier 1/2 companies only (Tier 1 first), one AI call per list for the contact
// profile, fit in code, Contacts tab in Verify's columns, re-runs only search new companies.
import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import type pg from 'pg';
import { createPool, migrate } from '../src/db/pool.js';
import { enqueue, getJob } from '../src/queue.js';
import { runOnce } from '../src/worker.js';
import { loadConfig, type Config } from '../src/config.js';
import { checkContactFit, cleanContactProfile, codeContactProfile, toContacts, type Contact } from '../src/leadlist/contacts.js';
import { startFakeGoogle, type FakeGoogle } from './fakes/google.js';
import { startFakeOpenAI, type FakeOpenAI } from './fakes/openai.js';

const url = process.env.TEST_DATABASE_URL;
const skip = !url ? 'TEST_DATABASE_URL not set' : false;
const REC = 'recContactsTest01';
let db: pg.Pool; let google: FakeGoogle; let ai: FakeOpenAI; let server: http.Server;
const disco = { url: '', calls: 0, lastBody: {} as any, people: {} as Record<string, any[]> };

const person = (first: string, title: string, domain: string, extra: Record<string, unknown> = {}) => ({ persona_id: Math.floor(Math.random() * 1e9), first_name: first, last_name: 'Lee', title, email: `${first.toLowerCase()}@${domain}`, person_country: 'US', department: 'Operations', ...extra });
const C = (over: Partial<Contact>): Contact => ({ domain: 'a.com', name: '', first_name: 'A', last_name: 'B', title: '', seniority: '', department: '', email: 'a@a.com', linkedin_url: '', person_country: 'US', person_state: '', company_name: '', ...over });

function cfg(over: Partial<Config> = {}): Config {
  return { ...loadConfig({ ENGINE_SECRET: 'x'.repeat(40), DATABASE_URL: url ?? 'postgres://x' } as NodeJS.ProcessEnv), discoLikeApiKey: 'k', discoLikeBaseUrl: disco.url, googleKeyFile: google.keyFile, googleImpersonateUser: 'scale@dulcy.io', googleSheetsBaseUrl: google.url, dryRun: true, liveStages: ['leadlist.contacts'], ...over };
}
const run = async (input: Record<string, unknown>, c = cfg()) => {
  const q = await enqueue(db, { kind: 'leadlist.contacts', recordId: REC, dryRun: false, input, maxAttempts: 3, deadlineMs: 120_000 });
  for (let i = 0; i < 40; i++) {
    await runOnce(db, c);
    const j = await getJob(db, q.job.id);
    if (['succeeded', 'failed', 'needs_review'].includes(j!.job.status)) return j!;
    await db.query(`UPDATE jobs SET run_after = now() WHERE id = $1 AND status = 'queued'`, [q.job.id]);
  }
  throw new Error('job did not settle');
};
const PERSONA = 'Find owners, founders and operations leaders. Exclude sales associates, customer service, HR and finance.';

test('contacts parse, and the code profile reads the persona\'s own "Exclude" list', () => {
  const rows = toContacts({ results: { 'acme.com': { company: { name: 'Acme' }, contacts: [{ persona_id: 1, first_name: 'Ann', last_name: 'Lee', title: 'Owner', email: 'Ann@Acme.com', person_country: 'US' }] } } });
  assert.equal(rows[0].email, 'ann@acme.com'); assert.equal(rows[0].company_name, 'Acme');
  const p = codeContactProfile(PERSONA);
  assert.ok(p.excludeTitleWords.includes('sales associates') && p.excludeTitleWords.includes('customer service'));
});

test('contact fit: no email, excluded country (person, not company) and excluded titles are cut; owners are Tier 1; unclear is Tier 2', () => {
  const p = cleanContactProfile({ targetTitleWords: ['owner', 'operations manager'], excludeTitleWords: ['sales associate', 'manager', 'intern'] }, {});
  assert.deepEqual(p.excludeTitleWords, ['sales associate', 'manager', 'intern']);
  assert.equal(checkContactFit(C({ email: '' }), p).tier, 'Cut');
  assert.equal(checkContactFit(C({ title: 'Owner', person_country: 'IN' }), p).tier, 'Cut');
  assert.equal(checkContactFit(C({ title: 'Owner', person_country: 'Nigeria' }), p).tier, 'Cut');
  assert.equal(checkContactFit(C({ title: 'Senior Sales Associate' }), p).tier, 'Cut');
  assert.equal(checkContactFit(C({ title: 'Operations Manager' }), p).tier, 'Tier 1', 'a target title is never cut by a broader excluded word');
  assert.equal(checkContactFit(C({ title: 'Owner & CEO' }), p).tier, 'Tier 1');
  assert.equal(checkContactFit(C({ title: 'Brand Lead' }), p).tier, 'Tier 2');
  assert.equal(checkContactFit(C({ title: 'Internal Auditor' }), p).tier, 'Tier 2', 'whole words only: "internal" is not "intern"');
});

before(async () => {
  google = await startFakeGoogle(); ai = await startFakeOpenAI();
  server = http.createServer(async (req, res) => {
    const chunks: Buffer[] = []; for await (const c of req) chunks.push(c as Buffer);
    res.setHeader('content-type', 'application/json');
    if (req.url?.startsWith('/v1/contacts/discover') && req.method === 'POST') {
      disco.calls++; disco.lastBody = JSON.parse(Buffer.concat(chunks).toString());
      const results: Record<string, any> = {};
      for (const d of disco.lastBody.domain) if (disco.people[d]) results[d] = { company: { name: d }, contacts: disco.people[d].slice(0, disco.lastBody.results_by_company) };
      return res.end(JSON.stringify({ results }));
    }
    res.statusCode = 404; res.end('{}');
  });
  await new Promise<void>((r) => server.listen(0, () => r()));
  disco.url = `http://127.0.0.1:${(server.address() as any).port}`;
  if (skip) return;
  db = createPool(url!); await migrate(db);
});
after(async () => { google.close(); ai.close(); server.close(); if (!skip) await db.end(); });
beforeEach(async () => {
  disco.calls = 0; disco.people = {
    't1.com': [person('Ann', 'Owner', 't1.com'), person('Bo', 'Sales Associate', 't1.com'), person('Cy', 'Brand Lead', 't1.com')],
    't2.com': [person('Di', 'Operations Director', 't2.com'), person('Ed', 'Owner', 't2.com', { person_country: 'PK' })],
    't3.com': [person('Fay', 'Founder', 't3.com')],
    'cut.com': [person('Gus', 'Owner', 'cut.com')],
  };
  google.written = {}; google.grid = {}; ai.calls = 0; ai.status = 200;
  ai.answer = { summary: 'Owners and operations leaders.', targetTitleWords: ['owner', 'founder', 'operations director'], excludeTitleWords: ['sales associate'] };
  if (skip) return;
  await db.query('TRUNCATE jobs, steps, receipts, events, lead_companies, lead_list_sheets, lead_list_profiles, lead_contacts, lead_contact_domains, lead_contact_profiles RESTART IDENTITY CASCADE');
  for (const [d, tier, batch] of [['t2.com', 'Tier 2', 0], ['t1.com', 'Tier 1', 0], ['cut.com', 'Cut', 0], ['t3.com', 'Tier 2', 1]] as const) {
    await db.query(`INSERT INTO lead_companies (list_id, domain, tier, data, batch) VALUES ($1,$2,$3,'{}',$4)`, [REC, d, tier, batch]);
  }
  await db.query(`INSERT INTO lead_list_sheets (list_id, kind, sheet_id, tab) VALUES ($1,'companies','sheet-c','Engine Companies')`, [REC]);
});

test('contacts: Tier 1 companies first, Cut never searched, country exclusion sent, one AI call, Contacts tab in Verify columns', { skip }, async () => {
  const c = cfg({ openAiApiKey: 'sk', openAiBaseUrl: ai.url });
  const j = await run({ contactFilters: { results_by_company: 5 }, personaDna: PERSONA, companies: 2 }, c);
  assert.equal(j.job.status, 'succeeded', j.job.error);
  assert.deepEqual(disco.lastBody.domain, ['t1.com', 't2.com'], 'Tier 1 first, then Tier 2; Cut never');
  assert.ok(disco.lastBody.negate_person_country.includes('IN') && disco.lastBody.has_email === true);
  assert.equal(disco.lastBody.icp_text, undefined, 'the persona is applied by the engine, not sent as a DiscoLike filter (default)');
  assert.equal(ai.calls, 1);
  const r = j.job.result.contacts;
  // t1: Ann Owner = Tier 1, Bo Sales Associate = Cut, Cy Brand Lead = Tier 2; t2: Di Operations Director = Tier 1, Ed in Pakistan = Cut.
  assert.deepEqual([r.tier1, r.tier2, r.cut], [2, 1, 2]);
  assert.equal(r.companiesSearched, 2);
  const usable = google.written['sheet-c']['Contacts'];
  assert.deepEqual(usable[0].slice(0, 7), ['Email', 'First Name', 'Last Name', 'Name', 'Title', 'Company', 'Domain'], 'the columns Verify reads');
  assert.equal(usable.filter(Boolean).length - 1, 3, 'only usable contacts in Contacts');
  assert.equal(google.written['sheet-c']['Contacts (Cut)'].filter(Boolean).length - 1, 2);
});

test('a re-run searches only companies not searched yet; the same companies are never paid twice', { skip }, async () => {
  await run({ personaDna: PERSONA, companies: 2 });
  const j = await run({ personaDna: PERSONA });
  assert.equal(j.job.status, 'succeeded', j.job.error);
  assert.deepEqual(disco.lastBody.domain, ['t3.com'], 'only the new company');
  assert.equal(disco.calls, 2);
  assert.equal(j.job.result.contacts.companiesSearched, 3);
  const again = await run({ personaDna: PERSONA });
  assert.equal(disco.calls, 2, 'nothing left to search: no call');
  assert.match(again.job.result.message, /already been searched/);
  const usable = google.written['sheet-c']['Contacts'];
  assert.equal(new Set(usable.slice(1).filter(Boolean).map((x) => x[0])).size, usable.filter(Boolean).length - 1, 'no duplicate rows');
});

test('personaToDiscoLike: true sends the persona as icp_text (old behaviour)', { skip }, async () => {
  await run({ personaDna: PERSONA, companies: 1, personaToDiscoLike: true });
  assert.equal(disco.lastBody.icp_text, PERSONA);
});

test('guards: own person countries replace the default exclusion; bad filter refused; dry-run spends nothing; credit cap', { skip }, async () => {
  await run({ contactFilters: { person_country: ['US'] }, companies: 1 });
  assert.equal(disco.lastBody.negate_person_country, undefined);
  assert.deepEqual(disco.lastBody.person_country, ['US']);
  const bad = await run({ contactFilters: { favourite_colour: 'blue' } });
  assert.match(bad.job.error, /unsupported DiscoLike contact filter/);
  const calls = disco.calls;
  const q = await enqueue(db, { kind: 'leadlist.contacts', recordId: REC, dryRun: true, input: {}, maxAttempts: 1, deadlineMs: 60_000 });
  await runOnce(db, cfg()); const d = await getJob(db, q.job.id);
  assert.equal(d!.job.result.dryRun, true); assert.equal(disco.calls, calls);
  const capped = await run({}, cfg({ capPerJob: 3 }));
  assert.equal(capped.job.status, 'needs_review'); assert.match(capped.job.error, /credit cap/);
});

test('no OpenAI key: code-only contact profile from the persona; the list still runs', { skip }, async () => {
  const j = await run({ personaDna: PERSONA });
  assert.equal(j.job.status, 'succeeded', j.job.error);
  assert.equal(j.job.result.profile.source, 'code');
  assert.equal(ai.calls, 0);
});

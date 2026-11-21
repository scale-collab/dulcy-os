// DiscoGen contact persona review: the old n8n contact review code runs unchanged on usable contacts.
import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import type pg from 'pg';
import { createPool, migrate } from '../src/db/pool.js';
import { enqueue, getJob } from '../src/queue.js';
import { runOnce } from '../src/worker.js';
import { loadConfig, type Config } from '../src/config.js';
import { startFakeGoogle, type FakeGoogle } from './fakes/google.js';

const url = process.env.TEST_DATABASE_URL;
const skip = !url ? 'TEST_DATABASE_URL not set' : false;
const REC = 'recDeepContacts01';
let db: pg.Pool; let google: FakeGoogle; let server: http.Server;
const dl = { url: '', submits: 0, lastBody: {} as any, polls: 0, results: {} as Record<string, any> };

const project = (fields: Record<string, unknown> = {}) => ({ id: REC, fields: {
  'Name of the Lead List': 'Contact deep test', 'ICP Description': 'US B2B marketing agencies', 'DiscoLike Company Filters JSON': JSON.stringify({ country: ['US'] }),
  'Source Type': 'DiscoLike', 'Client': ['recClientClient001'], 'Use DiscoGen Deep Review': true,
  'DiscoGen Deep Review Prompt': 'Must own or run the agency.', 'Contact Persona DNA': 'Agency founder, CEO or managing director', ...fields } });

function cfg(): Config {
  return { ...loadConfig({ ENGINE_SECRET: 'x'.repeat(40), DATABASE_URL: url ?? 'postgres://x' } as NodeJS.ProcessEnv), googleKeyFile: google.keyFile, googleImpersonateUser: 'scale@dulcy.io', googleSheetsBaseUrl: google.url, discoLikeApiKey: 'k', discoLikeBaseUrl: dl.url, dryRun: false, liveStages: [] };
}
async function run(input: Record<string, unknown>, dryRun = false) {
  const q = await enqueue(db, { kind: 'leadlist.deepcontacts', recordId: REC, dryRun, input, requestId: String(Math.random()), maxAttempts: 3, deadlineMs: 60_000 });
  for (let i = 0; i < 20; i++) {
    await runOnce(db, cfg());
    const j = await getJob(db, q.job.id);
    if (['succeeded', 'failed', 'needs_review'].includes(j!.job.status)) return j!;
    await db.query(`UPDATE jobs SET run_after=now() WHERE id=$1 AND status='queued'`, [q.job.id]);
  }
  throw new Error('did not settle');
}
const contact = (email: string, pid: number | undefined, title: string) => ({ persona_id: pid, domain: 'acme.com', name: email.split('@')[0], first_name: email.split('@')[0], last_name: 'Lee', title, seniority: '', department: '', email, linkedin_url: '', person_country: 'US', person_state: '', company_name: 'Acme', company_industry: '', persona_profile: '' });

before(async () => {
  google = await startFakeGoogle();
  server = http.createServer(async (req, res) => {
    const chunks: Buffer[] = []; for await (const c of req) chunks.push(c as Buffer);
    res.setHeader('content-type', 'application/json');
    if (req.method === 'POST' && req.url === '/v1/discogen/process-personas') {
      dl.submits++; dl.lastBody = JSON.parse(Buffer.concat(chunks).toString());
      return res.end(JSON.stringify({ task_id: `pp-${dl.submits}` }));
    }
    if (req.url?.startsWith('/v1/discogen/status/')) {
      dl.polls++;
      if (dl.polls === 1) return res.end(JSON.stringify({ status: 'running' }));
      return res.end(JSON.stringify({ status: 'completed', results: dl.results }));
    }
    res.statusCode = 404; res.end('{}');
  });
  await new Promise<void>((r) => server.listen(0, () => r()));
  dl.url = `http://127.0.0.1:${(server.address() as any).port}`;
  if (skip) return;
  db = createPool(url!); await migrate(db);
});
after(async () => { google.close(); server.close(); if (!skip) await db.end(); });
beforeEach(async () => {
  Object.assign(dl, { submits: 0, lastBody: {}, polls: 0, results: {
    '101': { fit: 'yes', confidence: 'high', reasoning: 'founder' },
    '102': { fit: 'partial', confidence: 'medium', reasoning: 'marketing manager, not the owner' },
    '103': { fit: 'no', confidence: 'high', reasoning: 'intern' },
  } });
  google.written = {}; google.writes = 0;
  if (skip) return;
  for (const t of ['jobs', 'lead_contact_reviews', 'lead_contacts', 'lead_list_sheets']) await db.query(`DELETE FROM ${t} WHERE ${t === 'jobs' ? 'record_id' : 'list_id'}=$1`, [REC]);
  await db.query(`DELETE FROM receipts WHERE receipt_key LIKE $1`, [`rec:leadlist.deepcontacts:${REC}:%`]);
  const rows: [string, number | undefined, string, string][] = [['ann@acme.com', 101, 'Founder', 'Tier 1'], ['bo@acme.com', 102, 'Marketing Manager', 'Tier 2'], ['cy@acme.com', 103, 'Intern', 'Tier 2'], ['dee@acme.com', undefined, 'CEO', 'Tier 1'], ['old@acme.com', 104, 'Assistant', 'Cut']];
  for (const [email, pid, title, tier] of rows) {
    await db.query(`INSERT INTO lead_contacts (list_id, email, domain, tier, data, batch) VALUES ($1,$2,'acme.com',$3,$4,1)`, [REC, email, tier, JSON.stringify(contact(email, pid, title))]);
  }
  await db.query(`INSERT INTO lead_list_sheets (list_id, kind, sheet_id, tab, mirrored_batches) VALUES ($1,'contacts','sheet-dc','Contacts','{1}')`, [REC]);
  google.written['sheet-dc'] = { Contacts: [], 'Contacts (Cut)': [] };
});

test('Contact deep review: n8n\'s persona request (persona + prompt, web search) for usable contacts with a persona ID; only a clear yes stays; tabs rebuilt', { skip }, async () => {
  const j = await run({ project: project() });
  assert.equal(j.job.status, 'succeeded', j.job.error);
  assert.equal(dl.submits, 1);
  assert.deepEqual([...dl.lastBody.persona_ids].sort(), [101, 102, 103], 'cut contacts and contacts without a persona ID are not paid for');
  assert.equal(dl.lastBody.web_search, true);
  assert.match(dl.lastBody.query, /Agency founder, CEO or managing director/);
  assert.match(dl.lastBody.query, /Must own or run the agency\./);
  const tiers = Object.fromEntries((await db.query(`SELECT email, tier FROM lead_contacts WHERE list_id=$1`, [REC])).rows.map((r) => [r.email, r.tier]));
  assert.deepEqual(tiers, { 'ann@acme.com': 'Tier 1', 'bo@acme.com': 'Cut', 'cy@acme.com': 'Cut', 'dee@acme.com': 'Tier 1', 'old@acme.com': 'Cut' }, 'deep mode: partial is cut too (n8n)');
  const usable = google.written['sheet-dc'].Contacts.slice(1).map((r) => r[0]).sort();
  assert.deepEqual(usable, ['ann@acme.com', 'dee@acme.com'], 'Contacts tab rebuilt with the usable contacts only');
  assert.equal(google.written['sheet-dc']['Contacts (Cut)'].length - 1, 3);
  const review = google.written['sheet-dc']['Contact Review'];
  assert.ok(review && review[0].includes('Reasoning') && review.length === 4, 'Contact Review tab with n8n columns');
  const f = j.job.result.airtableFields;
  assert.equal(f.fldkWL67N8ZaBIaDi, 2); assert.equal(f.flda4qjRC0sCeStBg, 3);
  assert.match(String(f.fldVnH7Pn1PxlZI5b), /1 of 3 reviewed contacts kept/);
  const again = await run({ project: project() });
  assert.equal(again.job.status, 'succeeded', again.job.error);
  assert.equal(dl.submits, 1, 'never reviews a contact twice');
  assert.match(again.job.result.message, /already been reviewed/);
});

test('Contact deep review guards: box, prompt, persona; client-specific n8n lists; dry run spends nothing', { skip }, async () => {
  assert.match((await run({ project: project({ 'Use DiscoGen Deep Review': false }) })).job.error, /tick "Use DiscoGen Deep Review"/);
  assert.match((await run({ project: project({ 'DiscoGen Deep Review Prompt': '' }) })).job.error, /Deep Review Prompt/);
  assert.match((await run({ project: project({ 'Contact Persona DNA': '' }) })).job.error, /Contact Persona DNA/);
  assert.match((await run({ project: { ...project(), id: 'rec7yReHLebtWCnOp' } })).job.error, /only exists in n8n/);
  const d = await run({ project: project() }, true);
  assert.equal(d.job.status, 'succeeded', d.job.error);
  assert.equal(d.job.result.plan.contacts, 3);
  assert.equal(dl.submits, 0);
});

test('Contact deep review reads DiscoGen\'s one-line answers ("yes | high | ...") and undoes cuts made from unreadable answers', { skip }, async () => {
  // A cut left by the earlier bug: no reasoning, so it is undone and the contact reviewed again.
  await db.query(`UPDATE lead_contacts SET tier='Cut', reasons='["DiscoGen persona review: not a clear fit"]' WHERE list_id=$1 AND email='ann@acme.com'`, [REC]);
  await db.query(`INSERT INTO lead_contact_reviews (list_id, email, persona_id, tier, row, task_id) VALUES ($1,'ann@acme.com',101,'Cut','{"email":"ann@acme.com","tier":"Cut","reasoning":""}','old')`, [REC]);
  dl.results = { '101': 'yes | high | founder of the agency', '102': 'partial | medium | manager', '103': 'no | high | intern' };
  const j = await run({ project: project() });
  assert.equal(j.job.status, 'succeeded', j.job.error);
  assert.deepEqual([...dl.lastBody.persona_ids].sort(), [101, 102, 103], 'the undone contact is reviewed again');
  const tiers = Object.fromEntries((await db.query(`SELECT email, tier, reasons FROM lead_contacts WHERE list_id=$1`, [REC])).rows.map((r) => [r.email, r.tier]));
  assert.notEqual(tiers['ann@acme.com'], 'Cut', 'a clear yes stays (back in a usable tier)');
  assert.equal(tiers['bo@acme.com'], 'Cut'); assert.equal(tiers['cy@acme.com'], 'Cut');
  const ann = (await db.query(`SELECT row FROM lead_contact_reviews WHERE list_id=$1 AND email='ann@acme.com'`, [REC])).rows[0].row;
  assert.equal(ann.reasoning, 'founder of the agency');
});

test('Contact deep review: when no answer can be read, nothing is cut and the job stops for review', { skip }, async () => {
  dl.results = { '101': 'garbled', '102': 'garbled', '103': 'garbled' };
  const j = await run({ project: project() });
  assert.equal(j.job.status, 'needs_review');
  assert.match(j.job.error, /none of DiscoGen's answers could be read/);
  const cut = (await db.query(`SELECT COUNT(*)::int AS n FROM lead_contacts WHERE list_id=$1 AND tier='Cut'`, [REC])).rows[0].n;
  assert.equal(cut, 1, 'only the contact that was already cut');
});

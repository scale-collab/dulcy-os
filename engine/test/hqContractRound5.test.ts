// HQ round 5 (Alex 2026-11-28), Sales → Draft contract: two deal types (no "both": pay per call carries
// the monthly tech fee), choices instead of typing (service, term, scope from the two templates), the
// "Client responds to leads" clause in Agreed Special Terms, and "Pull from Close" (read only). Pure.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  CLIENT_RESPONDS_CLAUSE, DEAL_TYPES, DRAFT_F, NEVER_WRITE, SCOPE_ITEMS, SERVICE_OPTIONS, TERM_OPTIONS,
  closePrefill, contractFields, dealTypeOf, defaultScope, normalizeDraft, prefill, pullFromClose, scopeText, serviceText, specialTermsText, validateDraft,
} from '../src/hq/contracts.js';
import { toLeadDetail, type CloseLeadDetail, type CloseOpportunity } from '../src/providers/close.js';

const TODAY = '2026-11-28';
const base = { monthly: 1500, perCall: 250, startDate: '2026-12-01', signerName: 'Yusuf Ali', signerEmail: 'yusuf@acme.com', company: 'Acme' };
const deal = { closeLead: 'lead_acme1', client: null, agreements: [] };

// ---------- pricing options ----------
test('pricing: retainer and pay per call only; old "both" drafts open as pay per call with the tech fee', () => {
  assert.deepEqual(DEAL_TYPES.map((d) => [d.key, d.airtable]), [['retainer', 'Monthly / Retainer'], ['per_call', 'PPC / PPL']]);
  assert.deepEqual([dealTypeOf('retainer'), dealTypeOf('per_call'), dealTypeOf('both'), dealTypeOf('x'), dealTypeOf(undefined)], ['retainer', 'per_call', 'per_call', null, null]);
  assert.deepEqual(validateDraft({ ...base, dealType: 'x' }, TODAY).errors[0], 'Pick the deal type: retainer or pay per call.');
  const old = validateDraft({ ...base, dealType: 'both', scope: 'Cold email', service: 'Cold email outreach', term: 'Month to month' }, TODAY);
  assert.deepEqual(old.errors, []);
  assert.deepEqual([old.draft.dealType, old.draft.monthly, old.draft.perCall], ['per_call', 1500, 250]);
  assert.deepEqual([old.draft.service, old.draft.scope, old.draft.term], ['Cold email outreach', 'Cold email', 'Month to month'], 'an old draft keeps its own texts');
  const f = contractFields(old.draft, { deal, by: 'Alex', today: TODAY, missing: old.missing });
  assert.deepEqual([f[DRAFT_F.type], f[DRAFT_F.techFee], f[DRAFT_F.callFee], f[DRAFT_F.fee]], ['PPC / PPL', 1500, 250, undefined]);
  // Pay per call with no tech fee: allowed, but listed to confirm (the PPL template has a tech-fee blank).
  const noFee = validateDraft({ ...base, monthly: null, dealType: 'per_call' }, TODAY);
  assert.deepEqual(noFee.errors, []);
  assert.ok(noFee.missing.includes('Monthly tech fee'));
  assert.ok(!validateDraft({ ...base, dealType: 'retainer' }, TODAY).missing.includes('Monthly tech fee'));
  assert.equal(validateDraft({ ...base, dealType: 'retainer' }, TODAY).draft.perCall, null, 'a retainer has no per-call fee');
});

test('pricing: an old saved draft is still readable (normalizeDraft)', () => {
  const n = normalizeDraft({ dealType: 'both', monthly: 1500, perCall: 250, startDate: '2026-12-01', signerName: 'R', signerEmail: 'r@x.com', company: 'Human', legalName: '', address: '', service: 'Cold email', scope: 'Lists and copy', term: '', specialTerms: 'Net 7', channels: { linkedin: true } });
  assert.deepEqual([n.dealType, n.monthly, n.perCall, n.serviceKey, n.termKey, n.scopeKeys, n.scope, n.specialTerms, n.channels.linkedin, n.clientRespondsToLeads, n.signerPhone],
    ['per_call', 1500, 250, '', '', [], 'Lists and copy', 'Net 7', true, false, '']);
  assert.deepEqual(normalizeDraft({ dealType: 'retainer', perCall: 99, scope: '' }).scopeKeys, defaultScope('retainer'), 'no scope text: the template scope is ticked');
  assert.equal(normalizeDraft({ dealType: 'retainer', perCall: 99 }).perCall, null);
});

// ---------- choices, no typing ----------
test('choices: service, term and scope come from the templates; unknown keys are ignored', () => {
  assert.deepEqual(SERVICE_OPTIONS.map((o) => o.key), ['cold_email', 'omnichannel']);
  assert.deepEqual(TERM_OPTIONS.map((o) => [o.key, o.type]), [['month_to_month', 'retainer'], ['until_cancelled', 'per_call']]);
  assert.equal(defaultScope('retainer').length, 7, 'the retainer template lists 7 scope items');
  assert.equal(defaultScope('per_call').length, 3, 'the PPL template lists 3 services');
  const ch = { linkedin: true, aiCaller: false, directMail: true };
  assert.equal(serviceText('omnichannel', ch), 'AI-powered outreach (cold email, LinkedIn, direct mail) to generate qualified sales opportunities');
  assert.equal(serviceText('cold_email', ch), 'AI-powered cold email outreach to generate qualified sales opportunities');
  const v = validateDraft({ ...base, dealType: 'retainer', serviceKey: 'cold_email', termKey: 'month_to_month', scopeKeys: ['slack_updates', 'cold_email', 'ppc_list', 'nope'], service: 'typed by hand' }, TODAY);
  assert.deepEqual(v.errors, []);
  assert.deepEqual(v.draft.scopeKeys, ['cold_email', 'slack_updates'], 'only this deal type\'s items, in the template order');
  assert.equal(v.draft.scope, '- Cold email\n- Weekly updates via Slack');
  assert.equal(v.draft.service, serviceText('cold_email', v.draft.channels), 'a picked choice writes its own text');
  assert.match(v.draft.term, /^Month to month, no minimum commitment\. Either party may cancel with 14 days' written notice/);
  assert.deepEqual(v.missing, ['Client legal name', 'Client address']);
  const bogus = validateDraft({ ...base, dealType: 'retainer', serviceKey: 'hack', termKey: 'forever', scopeKeys: 'cold_email' }, TODAY);
  assert.deepEqual([bogus.draft.serviceKey, bogus.draft.termKey, bogus.draft.scopeKeys], ['', '', []]);
  assert.deepEqual(validateDraft({ ...base, dealType: 'retainer', serviceKey: 'omnichannel' }, TODAY).errors, ['Omnichannel: tick at least one extra channel, or pick cold email.']);
  // Unticking every scope item writes no scope (it is then "to confirm").
  const none = validateDraft({ ...base, dealType: 'retainer', scopeKeys: [], scope: '' }, TODAY);
  assert.equal(none.draft.scope, ''); assert.ok(none.missing.includes('Agreed scope'));
  assert.equal(scopeText(SCOPE_ITEMS.map((s) => s.key)).split('\n').length, 10);
});

test('choices: a new draft starts on the template standard (nothing typed)', () => {
  const p = prefill({ name: 'Yusuf Ali', email: 'yusuf@acme.com', company: 'https://www.acme.com/', agreement: null, money: undefined, client: null });
  assert.deepEqual([p.dealType, p.serviceKey, p.termKey, p.scopeKeys, p.clientRespondsToLeads, p.company], ['retainer', 'cold_email', 'month_to_month', defaultScope('retainer'), false, 'acme.com']);
  const v = validateDraft({ ...p, monthly: 2000, startDate: '2026-12-01' }, TODAY);
  assert.deepEqual(v.errors, []);
  assert.deepEqual(v.missing, ['Client legal name', 'Client address'], 'service, scope and term are filled by the choices');
});

// ---------- the "Client responds to leads" clause ----------
test('clause: the checkbox adds the exact clause to Agreed Special Terms (before the note); off = no clause', () => {
  assert.equal(CLIENT_RESPONDS_CLAUSE, 'Client responds to leads: Dulcy generates interested leads and passes them into the Client\'s CRM. The Client is responsible for responding to and following up with those leads. Dulcy does not guarantee any number of leads, meetings or sales.');
  assert.ok(!/\bwill (book|deliver|generate \d)|(?<!not )guarantee[sd]? (that|an?|\d)\b/i.test(CLIENT_RESPONDS_CLAUSE), 'no promise of results');
  const on = validateDraft({ ...base, dealType: 'retainer', clientRespondsToLeads: true }, TODAY).draft;
  const f = contractFields(on, { deal, by: 'Alex', today: TODAY, missing: [] });
  assert.equal(f[DRAFT_F.special], CLIENT_RESPONDS_CLAUSE);
  assert.match(String(f[DRAFT_F.notes]), /Includes the "Client responds to leads" clause/);
  const withNote = validateDraft({ ...base, dealType: 'retainer', clientRespondsToLeads: true, specialTerms: '  First month at $1,000.  ' }, TODAY).draft;
  assert.equal(contractFields(withNote, { deal, by: 'Alex', today: TODAY, missing: [] })[DRAFT_F.special], `${CLIENT_RESPONDS_CLAUSE}\n\nFirst month at $1,000.`);
  const off = validateDraft({ ...base, dealType: 'retainer', clientRespondsToLeads: 'yes' }, TODAY).draft;
  assert.equal(off.clientRespondsToLeads, false, 'only a real true ticks it');
  const g = contractFields(off, { deal, by: 'Alex', today: TODAY, missing: [] });
  assert.ok(!(DRAFT_F.special in g));
  assert.doesNotMatch(String(g[DRAFT_F.notes]), /responds to leads/);
  assert.equal(specialTermsText({ clientRespondsToLeads: false, specialTerms: 'Note' }), 'Note');
  for (const k of NEVER_WRITE) assert.ok(!(k in f), `never writes ${k} (draft only, never sent)`);
});

// ---------- Pull from Close ----------
const opp = (o: Partial<CloseOpportunity>): CloseOpportunity => ({ id: 'oppo_1', leadId: 'lead_acme1', leadName: 'Acme', status: 'Contract', statusType: 'active', value: 2000, valuePeriod: 'monthly', confidence: 80, created: '2026-11-01T10:00:00Z', updated: '2026-11-20T10:00:00Z', won: '', note: '', contactName: '', userName: '', statusId: '', pipelineId: '', ...o });
const lead = (o: Partial<CloseLeadDetail> = {}): CloseLeadDetail => ({
  id: 'lead_acme1', name: 'Acme Growth', url: 'https://app.close.com/lead/lead_acme1/', custom: { 'Legal Name': 'Acme Growth LLC' },
  contacts: [{ name: 'Sam Other', title: '', emails: ['sam@acme.com'], phones: [] }, { name: 'Yusuf Ali', title: 'CEO', emails: ['yusuf@acme.com'], phones: ['+1 555-0100'] }],
  addresses: [{ address1: '1 Main St', address2: 'Suite 2', city: 'Newark', state: 'NJ', zip: '07102', country: 'US' }],
  opportunities: [opp({ id: 'oppo_old', statusType: 'won', value: 999, updated: '2026-01-01T00:00:00Z' }), opp({})], ...o,
});

test('close prefill: fills company, legal name, the deal\'s contact, phone, address and a monthly value; lists the rest', () => {
  const r = closePrefill(lead(), 'Yusuf@Acme.com', 'retainer');
  assert.deepEqual(r.patch, { company: 'Acme Growth', legalName: 'Acme Growth LLC', signerName: 'Yusuf Ali', signerEmail: 'yusuf@acme.com', signerPhone: '+1 555-0100', address: '1 Main St, Suite 2, Newark, NJ 07102, US', monthly: 2000 });
  assert.deepEqual(r.filled.map((f) => f.label), ['Company', 'Legal name', 'Signer name', 'Signer email', 'Phone', 'Address', 'Monthly fee']);
  assert.deepEqual(r.missing, []);
  // Pay per call: the monthly value is the tech fee; Close has no per-call fee.
  const ppc = closePrefill(lead(), 'yusuf@acme.com', 'per_call');
  assert.equal(ppc.filled.find((f) => f.label === 'Monthly tech fee')?.value, '2000');
  assert.deepEqual(ppc.missing, ['Per-call fee (Close does not hold it)']);
});

test('close prefill: never guesses: no legal-name field, no address, a one-time value, no opportunity', () => {
  const r = closePrefill(lead({ custom: {}, addresses: [], contacts: [{ name: 'Sam Other', title: '', emails: ['sam@acme.com'], phones: [] }], opportunities: [opp({ value: 6000, valuePeriod: 'annual', status: 'Proposal', note: 'Wants a 3-month pilot' })] }), 'yusuf@acme.com', 'retainer');
  assert.equal(r.patch.signerName, 'Sam Other', 'no contact with the deal email: the first contact with an email');
  assert.equal(r.patch.signerEmail, 'sam@acme.com');
  assert.ok(!('legalName' in r.patch) && !('address' in r.patch) && !('monthly' in r.patch) && !('signerPhone' in r.patch));
  assert.deepEqual(r.missing, ['Legal name', 'Phone', 'Address', 'Monthly fee']);
  assert.deepEqual(r.notes, ['Close deal value $6,000 a year (Proposal): not a monthly fee, so not filled.', 'Close deal note: Wants a 3-month pilot']);
  const empty = closePrefill(lead({ opportunities: [opp({ statusType: 'lost' })], contacts: [] }), 'yusuf@acme.com', 'retainer');
  assert.ok(empty.missing.includes('Deal value (no open or won opportunity in Close)'));
  assert.ok(empty.missing.includes('Signer name') && empty.missing.includes('Signer email'));
});

test('close prefill: the Close lead JSON is read into the detail (contacts, phones, address, custom fields, opportunities)', () => {
  const d = toLeadDetail({
    id: 'lead_acme1', display_name: 'Acme Growth', custom: { 'Legal Name': 'Acme Growth LLC', Score: 7, Tags: ['x'] },
    contacts: [{ name: 'Yusuf Ali', emails: [{ email: 'Yusuf@Acme.com' }], phones: [{ phone: '+15550100', phone_formatted: '+1 555-0100' }] }],
    addresses: [{ address_1: '1 Main St', city: 'Newark', state: 'NJ', zipcode: '07102' }],
    opportunities: [{ id: 'oppo_1', lead_id: 'lead_acme1', value: 200000, value_period: 'monthly', status_type: 'active', status_label: 'Contract' }, { id: 'oppo_x', lead_id: 'lead_other' }],
  });
  assert.deepEqual([d.name, d.url, d.contacts[0].emails, d.contacts[0].phones, d.addresses[0].zip, d.custom], ['Acme Growth', 'https://app.close.com/lead/lead_acme1/', ['yusuf@acme.com'], ['+1 555-0100'], '07102', { 'Legal Name': 'Acme Growth LLC', Score: '7' }]);
  assert.deepEqual(d.opportunities.map((o) => [o.id, o.value]), [['oppo_1', 2000]], 'cents to dollars; another lead\'s opportunity is dropped');
});

test('pull from Close: the contract\'s lead id first, else exactly one lead with the email; not connected says so', async () => {
  const calls: string[] = [];
  const close = {
    async leadsByEmail(e: string) { calls.push(`email ${e}`); return e === 'two@x.com' ? [{ id: 'lead_a', name: 'A', emails: [e] }, { id: 'lead_b', name: 'B', emails: [e] }] : e === 'yusuf@acme.com' ? [{ id: 'lead_acme1', name: 'Acme', emails: [e] }] : []; },
    async leadDetail(id: string) { calls.push(`lead ${id}`); return id === 'lead_acme1' ? lead() : null; },
  };
  assert.deepEqual((await pullFromClose(null, { closeLead: '', email: 'yusuf@acme.com' }, 'retainer')).body.connected, false);
  const byId = await pullFromClose(close, { closeLead: 'lead_acme1', email: 'yusuf@acme.com' }, 'retainer');
  assert.deepEqual([byId.body.found, byId.body.lead.id, byId.body.patch.signerName, calls], [true, 'lead_acme1', 'Yusuf Ali', ['lead lead_acme1']]);
  calls.length = 0;
  const byEmail = await pullFromClose(close, { closeLead: '', email: 'yusuf@acme.com' }, 'per_call');
  assert.deepEqual([byEmail.body.found, calls], [true, ['email yusuf@acme.com', 'lead lead_acme1']]);
  const two = await pullFromClose(close, { closeLead: '', email: 'two@x.com' }, 'retainer');
  assert.deepEqual([two.body.found, two.body.error], [false, '2 leads in Close have two@x.com: not guessed. Fill it in by hand.']);
  assert.match((await pullFromClose(close, { closeLead: '', email: 'none@x.com' }, 'retainer')).body.error, /^No lead in Close has none@x\.com/);
  const broken = await pullFromClose({ ...close, async leadDetail() { throw new Error('HTTP 500'); } }, { closeLead: 'lead_acme1', email: '' }, 'retainer');
  assert.deepEqual([broken.status, broken.body.found, broken.body.error], [200, false, 'Close did not answer: HTTP 500']);
});

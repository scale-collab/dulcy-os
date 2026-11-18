// leadlist.contacts: find the people at a list's Tier 1 / Tier 2 companies (old "Build
// Contact Sample" + "Expand Contacts"). Same stage for both: `companies` limits how many
// companies this run searches (100 = the contact sample); a later run searches only the
// companies not searched yet (e.g. after an expansion).
//  - Tier 1 companies first, then Tier 2; Cut companies are never searched.
//  - DiscoLike /v1/contacts/discover, 500 companies per call, one call at a time, each with
//    a receipt (a retry never pays again); has_email on; the old global person-country
//    exclusion is added unless the list sets its own person countries.
//  - ONE AI call per list (first batch) turns the persona DNA + thesis + client context +
//    the real titles seen into the contact profile; every contact is checked in code.
//  - Saved in Postgres; usable contacts written to the sheet's "Contacts" tab in the columns
//    the Verify stage reads (cut ones to "Contacts (Cut)").
import { createHash } from 'node:crypto';
import type { Stage } from './index.js';
import type { JobContext } from '../context.js';
import { PermanentError, RetryableError } from '../errors.js';
import { createDiscoLikeClient } from '../providers/discolike.js';
import { createSheetsClient } from '../providers/google.js';
import { createOpenAIClient } from '../providers/openai.js';
import { checkContactFit, cleanContactProfile, codeContactProfile, contactProfilePrompt, CONTACT_PROFILE_SYSTEM, EXCLUDED_PERSON_COUNTRY_CODES, toContacts, type Contact, type ContactProfile } from '../leadlist/contacts.js';
import { contactCounts, ensureContactTabs, mirrorContacts, saveContacts } from '../leadlist/contactStore.js';

interface ContactsInput {
  /** The list's Contact Filters JSON (seniority, person_country, results_by_company, ...). */
  contactFilters?: Record<string, unknown>;
  /** The list's Contact Persona DNA: who to contact and who not. */
  personaDna?: string;
  targeting?: string; thesis?: string; clientContext?: string;
  /** How many not-yet-searched usable companies to search this run (omit = all). */
  companies?: number;
  batchSize?: number;
}

const ALLOWED = new Set(['filter_industry', 'negate_filter_industry', 'filter_country', 'negate_filter_country', 'filter_state', 'negate_filter_state', 'employee_range', 'seniority', 'negate_seniority', 'department', 'negate_department', 'skills', 'title', 'negate_title', 'person_country', 'negate_person_country', 'person_state', 'negate_person_state', 'person_city', 'negate_person_city', 'has_email', 'email_validated', 'has_linkedin', 'icp_text', 'results_by_company', 'people_per_company']);

async function contactProfile(ctx: JobContext, listId: string, input: ContactsInput, first: Contact[]): Promise<ContactProfile> {
  const prior = (await ctx.db.query(`SELECT profile FROM lead_contact_profiles WHERE list_id=$1`, [listId])).rows[0];
  if (prior) return prior.profile as ContactProfile;
  const count = (key: keyof Contact) => first.reduce<Record<string, number>>((m, c) => { const v = String(c[key] ?? '').trim(); if (v) m[v] = (m[v] ?? 0) + 1; return m; }, {});
  const titles = count('title'), departments = count('department');
  const ai = createOpenAIClient({ apiKey: ctx.cfg.openAiApiKey, model: ctx.cfg.openAiModel, baseUrl: ctx.cfg.openAiBaseUrl });
  let profile: ContactProfile;
  if (!ai.configured || !input.personaDna) profile = { ...codeContactProfile(input.personaDna), notes: ai.configured ? 'no persona given: default decision-maker titles' : 'no OpenAI key: code-only contact profile' };
  else {
    const hash = createHash('sha256').update(JSON.stringify([input.personaDna, input.targeting ?? input.thesis ?? '', input.clientContext ?? ''])).digest('hex').slice(0, 12);
    try {
      const raw = await ctx.paid({ scope: 'record', provider: 'openai', callKey: `contact-profile:${hash}`, units: 1, run: () => ai.json(CONTACT_PROFILE_SYSTEM, contactProfilePrompt({ personaDna: input.personaDna, targeting: input.targeting ?? input.thesis, clientContext: input.clientContext, titles, departments })), dryRunResult: () => ({}) });
      profile = cleanContactProfile(raw, departments);
    } catch (e) {
      if (e instanceof RetryableError) throw e;
      profile = { ...codeContactProfile(input.personaDna), notes: `AI contact profile unavailable (${String((e as Error).message).slice(0, 160)}): code-only` };
    }
  }
  await ctx.db.query(`INSERT INTO lead_contact_profiles (list_id, profile) VALUES ($1,$2) ON CONFLICT (list_id) DO UPDATE SET profile=EXCLUDED.profile, updated_at=now()`, [listId, JSON.stringify(profile)]);
  return profile;
}

export const contactsFindStage: Stage = async (ctx) => {
  const input = ctx.job.input as unknown as ContactsInput;
  const listId = ctx.job.record_id;
  const filters = { ...(input.contactFilters ?? {}) };
  for (const k of Object.keys(filters)) {
    if (!ALLOWED.has(k)) throw new PermanentError(`unsupported DiscoLike contact filter: ${k}`);
    const v = filters[k];
    if (v === null || v === '' || (Array.isArray(v) && v.length === 0)) delete filters[k];
  }
  const perCompany = Math.min(25, Math.max(1, Number(filters.results_by_company ?? filters.people_per_company ?? 5)));
  delete filters.people_per_company;
  const batchSize = Math.min(500, Math.max(1, Math.round(Number(input.batchSize ?? 500))));
  const disco = createDiscoLikeClient({ apiKey: ctx.cfg.discoLikeApiKey, baseUrl: ctx.cfg.discoLikeBaseUrl, timeoutMs: 10 * 60_000 });
  const sheets = createSheetsClient({ keyFile: ctx.cfg.googleKeyFile, impersonate: ctx.cfg.googleImpersonateUser, scope: ctx.cfg.googleScope, sheetsBaseUrl: ctx.cfg.googleSheetsBaseUrl });

  // Companies to search this run: usable, not yet searched, Tier 1 first.
  const plan = await ctx.step('companies', async () => {
    const r = await ctx.db.query(
      `SELECT c.domain FROM lead_companies c
        WHERE c.list_id=$1 AND c.tier <> 'Cut'
          AND NOT EXISTS (SELECT 1 FROM lead_contact_domains d WHERE d.list_id=c.list_id AND d.domain=c.domain)
        ORDER BY CASE c.tier WHEN 'Tier 1' THEN 0 ELSE 1 END, c.batch, c.seq`, [listId]);
    const all = r.rows.map((x) => x.domain as string);
    const take = input.companies ? all.slice(0, Math.max(1, Math.round(input.companies))) : all;
    const startBatch = Number((await ctx.db.query(`SELECT COALESCE(MAX(batch),0)::int AS b FROM lead_contact_domains WHERE list_id=$1`, [listId])).rows[0].b) + 1;
    return { domains: take, notSearched: all.length, startBatch };
  });
  if (!plan.domains.length) {
    const have = await contactCounts(ctx.db, listId);
    if (have.companiesSearched === 0) throw new PermanentError('this list has no usable companies to search; run the company sample and expansion first');
    return { dryRun: ctx.dryRun, contacts: have, message: 'every usable company has already been searched for contacts' };
  }
  const maxContacts = plan.domains.length * perCompany;
  if (ctx.dryRun) {
    return { dryRun: true, plan: { companies: plan.domains.length, peoplePerCompany: perCompany, batches: Math.ceil(plan.domains.length / batchSize), notSearchedInList: plan.notSearched }, wouldSpendCredits: { discolike: `up to ${maxContacts} contacts` }, message: `would search ${plan.domains.length} companies for up to ${perCompany} people each` };
  }

  const sheet = await ctx.step('sheet', () => ensureContactTabs(ctx.db, sheets, listId));
  let profile: ContactProfile | undefined;
  const batches: Array<Record<string, number>> = [];
  for (let i = 0; i * batchSize < plan.domains.length; i++) {
    const b = plan.startBatch + i;
    const domains = plan.domains.slice(i * batchSize, (i + 1) * batchSize);
    const out = await ctx.step(`batch-${b}`, async () => {
      const body: Record<string, unknown> = { ...filters, domain: domains, max_companies: domains.length, offset: 0, results_by_company: perCompany, has_email: filters.has_email ?? true };
      if (input.personaDna && !body.icp_text) body.icp_text = input.personaDna;
      if (!body.person_country && !body.negate_person_country) body.negate_person_country = EXCLUDED_PERSON_COUNTRY_CODES;
      const raw = await ctx.paid({
        scope: 'record', provider: 'discolike', callKey: `contacts:${createHash('sha256').update(domains.join(',')).digest('hex').slice(0, 16)}`, units: domains.length * perCompany,
        run: () => disco.discoverContacts(body), dryRunResult: () => ({}),
      });
      const people = toContacts(raw).filter((c) => domains.includes(c.domain));
      profile ??= await contactProfile(ctx, listId, input, people);
      const saved = await saveContacts(ctx.db, listId, b, people.map((c) => ({ c, fit: checkContactFit(c, profile!) })));
      const found: Record<string, number> = {};
      for (const c of people) found[c.domain] = (found[c.domain] ?? 0) + 1;
      await ctx.db.query(
        `INSERT INTO lead_contact_domains (list_id, domain, batch, found) SELECT $1, d, $2, f FROM unnest($3::text[], $4::int[]) AS u(d, f) ON CONFLICT DO NOTHING`,
        [listId, b, domains, domains.map((d) => found[d] ?? 0)]);
      return { batch: b, companies: domains.length, withContacts: Object.keys(found).length, contacts: people.length, new: saved.inserted, tier1: saved.tier1, tier2: saved.tier2, cut: saved.cut };
    }, { timeoutMs: 15 * 60_000 });
    batches.push(out);
    await ctx.step(`mirror-${b}`, () => mirrorContacts(ctx.db, sheets, listId));
  }
  await ctx.step('mirror-final', () => mirrorContacts(ctx.db, sheets, listId));
  profile ??= (await ctx.db.query(`SELECT profile FROM lead_contact_profiles WHERE list_id=$1`, [listId])).rows[0]?.profile as ContactProfile | undefined;

  const total = await contactCounts(ctx.db, listId);
  const reasons = (await ctx.db.query(`SELECT reasons FROM lead_contacts WHERE list_id=$1 AND tier='Cut'`, [listId])).rows;
  const top: Record<string, number> = {};
  for (const r of reasons) for (const why of r.reasons ?? []) { const k = String(why).replace(/title ".*" is excluded/, 'title is excluded'); top[k] = (top[k] ?? 0) + 1; }
  const status = total.usableRate >= 0.8 ? 'Passed' : total.usableRate >= 0.7 ? 'Needs Review' : 'Failed';
  return {
    dryRun: false,
    profile: profile ? { source: profile.source, summary: profile.summary, targetTitleWords: profile.targetTitleWords, excludeTitleWords: profile.excludeTitleWords, excludeDepartments: profile.excludeDepartments, notes: profile.notes } : undefined,
    contacts: { ...total, status },
    batches,
    topCutReasons: Object.entries(top).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([reason, n]) => ({ reason, contacts: n })),
    sheet: { url: `https://docs.google.com/spreadsheets/d/${sheet.sheetId}`, tab: 'Contacts' },
    message: `${total.usable} usable contacts (Tier 1 ${total.tier1}, Tier 2 ${total.tier2}, Cut ${total.cut}; ${Math.round(total.usableRate * 100)}% usable, ${status}) from ${total.companiesWithContacts} of ${total.companiesSearched} companies searched`,
  };
};

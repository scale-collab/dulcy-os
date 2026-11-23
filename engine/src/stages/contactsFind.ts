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
//  - Contact Source "DiscoLike + ContraGen": after DiscoLike, ContraGen (web research) runs on
//    every company with fewer usable contacts than the people-per-company target (Alex,
//    2026-11-20: not only companies with nobody), once per company. Async task: submit (paid,
//    one receipt per 1,000 domains), poll every 30 s (free), merge; duplicates of contacts we
//    already have (same email, LinkedIn, or name at the same company) are dropped.
//  - Saved in Postgres; usable contacts written to the sheet's "Contacts" tab in the columns
//    the Verify stage reads (cut ones to "Contacts (Cut)").
import { createHash } from 'node:crypto';
import type { Stage } from './index.js';
import type { JobContext } from '../context.js';
import { NeedsReviewError, PermanentError, RetryableError, WaitError } from '../errors.js';
import { createDiscoLikeClient } from '../providers/discolike.js';
import { createSheetsClient } from '../providers/google.js';
import { createOpenAIClient } from '../providers/openai.js';
import { checkContactFit, cleanContactProfile, codeContactProfile, contactProfilePrompt, CONTACT_PROFILE_SYSTEM, EXCLUDED_PERSON_COUNTRY_CODES, toContacts, toRunContacts, type Contact, type ContactProfile } from '../leadlist/contacts.js';
import { CONTRAGEN_BATCH, contraGenRequest, normLinkedIn, taskState, toContraGenContacts } from '../leadlist/contragen.js';
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
  /** Also send the persona text to DiscoLike as icp_text (the old flow did; it narrows results a lot).
   *  Default false: the persona is applied by the engine's own contact check instead. */
  personaToDiscoLike?: boolean;
  /** Contact Source is "DiscoLike + ContraGen". */
  contraGen?: boolean;
  /** Contact Source is "DiscoLike Contacts Run": DiscoLike's new one-step Contacts run (POST /v1/contacts/run). */
  contactsRun?: boolean;
}

const CONTRAGEN_POLL_MS = 30_000;
const RUN_MAX_DOMAINS = 10_000; // DiscoLike's limit per Contacts run
const RUN_PAGE = 100;
const RUN_POLL_MS = 30_000;
const RUN_MAX_WAIT_MS = 10 * 60 * 60_000;
const RUN_DONE = new Set(['done', 'completed', 'complete', 'finished', 'succeeded', 'success']);
const RUN_STOPPED = new Set(['failed', 'error', 'cancelled', 'canceled', 'expired']);
const CONTRAGEN_MAX_WAIT_MS = 3 * 60 * 60_000;

/** Companies due a ContraGen pass: searched, usable, never ContraGen'd, under the target. */
async function contraGenCandidates(ctx: JobContext, listId: string, perCompany: number) {
  const r = await ctx.db.query(
    `SELECT d.domain, (SELECT COUNT(*)::int FROM lead_contacts k WHERE k.list_id=d.list_id AND k.domain=d.domain AND k.tier <> 'Cut') AS usable
       FROM lead_contact_domains d JOIN lead_companies c ON c.list_id=d.list_id AND c.domain=d.domain
      WHERE d.list_id=$1 AND d.contragen_at IS NULL AND c.tier <> 'Cut'
      ORDER BY CASE c.tier WHEN 'Tier 1' THEN 0 ELSE 1 END, c.batch, c.seq`, [listId]);
  const all = r.rows.map((x) => ({ domain: x.domain as string, usable: Number(x.usable) }));
  return { checked: all.map((x) => x.domain), short: all.filter((x) => x.usable < perCompany) };
}

const ALLOWED = new Set(['filter_industry', 'negate_filter_industry', 'filter_country', 'negate_filter_country', 'filter_state', 'negate_filter_state', 'employee_range', 'seniority', 'negate_seniority', 'department', 'negate_department', 'skills', 'title', 'negate_title', 'person_country', 'negate_person_country', 'person_state', 'negate_person_state', 'person_city', 'negate_person_city', 'has_email', 'email_validated', 'has_linkedin', 'icp_text', 'results_by_company', 'people_per_company', 'relevance']);

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
  // Contacts run only: how strict DiscoLike's person fit is (default balanced). Not sent to the legacy search.
  const relevance = ['max_relevance', 'balanced', 'max_coverage'].includes(String(filters.relevance ?? '').toLowerCase()) ? String(filters.relevance).toLowerCase() : 'balanced';
  delete filters.relevance;
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
  const pendingContraGen = input.contraGen ? (await contraGenCandidates(ctx, listId, perCompany)).checked.length : 0;
  if (!plan.domains.length && !pendingContraGen) {
    const have = await contactCounts(ctx.db, listId);
    if (have.companiesSearched === 0) throw new PermanentError('this list has no usable companies to search; run the company sample and expansion first');
    return { dryRun: ctx.dryRun, contacts: have, message: 'every usable company has already been searched for contacts' };
  }
  const maxContacts = plan.domains.length * perCompany;
  if (ctx.dryRun) {
    if (input.contactsRun) {
      const runCount = Math.ceil(plan.domains.length / RUN_MAX_DOMAINS);
      return { dryRun: true, plan: { companies: plan.domains.length, peoplePerCompany: perCompany, contactsRuns: runCount, relevance, notSearchedInList: plan.notSearched }, wouldSpendCredits: { discolike: `up to ${maxContacts} validated contacts (DiscoLike Contacts run)` }, message: `would search ${plan.domains.length} companies for up to ${perCompany} validated contacts each in ${runCount} DiscoLike Contacts run(s)` };
    }
    const cg = input.contraGen ? `; then ContraGen on every searched company with fewer than ${perCompany} usable contacts` : '';
    return { dryRun: true, plan: { companies: plan.domains.length, peoplePerCompany: perCompany, batches: Math.ceil(plan.domains.length / batchSize), notSearchedInList: plan.notSearched, contraGen: !!input.contraGen }, wouldSpendCredits: { discolike: `up to ${maxContacts} contacts${cg}` }, message: `would search ${plan.domains.length} companies for up to ${perCompany} people each${cg}` };
  }

  const sheet = await ctx.step('sheet', () => ensureContactTabs(ctx.db, sheets, listId));
  let profile: ContactProfile | undefined;
  const batches: Array<Record<string, number>> = [];
  const runs: Array<Record<string, unknown>> = [];
  // New DiscoLike Contacts run (Contact Source "DiscoLike Contacts Run"): search, web research and
  // email checks in one run of up to 10,000 of our domains; replaces the legacy contact search and
  // ContraGen, which DiscoLike retires on 2026-12-31.
  for (let i = 0; input.contactsRun && i * RUN_MAX_DOMAINS < plan.domains.length; i++) {
    const b = plan.startBatch + i;
    const domains = plan.domains.slice(i * RUN_MAX_DOMAINS, (i + 1) * RUN_MAX_DOMAINS);
    const out = await contactsRun(ctx, disco, { listId, batch: b, domains, input, perCompany, relevance },
      async (people) => (profile ??= await contactProfile(ctx, listId, input, people)));
    runs.push(out);
    await ctx.step(`mirror-${b}`, () => mirrorContacts(ctx.db, sheets, listId));
  }
  for (let i = 0; !input.contactsRun && i * batchSize < plan.domains.length; i++) {
    const b = plan.startBatch + i;
    const domains = plan.domains.slice(i * batchSize, (i + 1) * batchSize);
    const out = await ctx.step(`batch-${b}`, async () => {
      const body: Record<string, unknown> = { ...filters, domain: domains, max_companies: domains.length, offset: 0, results_by_company: perCompany, has_email: filters.has_email ?? true };
      if (input.personaToDiscoLike && input.personaDna && !body.icp_text) body.icp_text = input.personaDna;
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
  const contraGen = input.contraGen && !input.contactsRun ? await runContraGen(ctx, listId, input, perCompany, () => profile) : undefined;
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
    contactsRuns: runs.length ? runs : undefined,
    contraGen,
    topCutReasons: Object.entries(top).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([reason, n]) => ({ reason, contacts: n })),
    sheet: { url: `https://docs.google.com/spreadsheets/d/${sheet.sheetId}`, tab: 'Contacts' },
    message: `${total.usable} usable contacts (Tier 1 ${total.tier1}, Tier 2 ${total.tier2}, Cut ${total.cut}; ${Math.round(total.usableRate * 100)}% usable, ${status}) from ${total.companiesWithContacts} of ${total.companiesSearched} companies searched${contraGen ? `; ContraGen: ${contraGen.added} new usable contacts from ${contraGen.companies} companies under ${perCompany}` : ''}`,
  };
};

/** ContraGen pass: plan, submit (paid), poll (WaitError until done), merge without duplicates. */
async function runContraGen(ctx: JobContext, listId: string, input: ContactsInput, perCompany: number, currentProfile: () => ContactProfile | undefined) {
  const plan = await ctx.step('contragen-plan', async () => {
    const c = await contraGenCandidates(ctx, listId, perCompany);
    const chunks: string[][] = [];
    for (let i = 0; i < c.short.length; i += CONTRAGEN_BATCH) chunks.push(c.short.slice(i, i + CONTRAGEN_BATCH).map((x) => x.domain));
    const have = Object.fromEntries(c.short.map((x) => [x.domain, x.usable]));
    return { checked: c.checked, chunks, have, startedAt: Date.now() };
  });
  const disco = createDiscoLikeClient({ apiKey: ctx.cfg.discoLikeApiKey, baseUrl: ctx.cfg.discoLikeBaseUrl });
  const taskIds: string[] = [];
  for (let i = 0; i < plan.chunks.length; i++) {
    const domains = plan.chunks[i];
    taskIds.push(await ctx.step(`contragen-submit-${i}`, () => ctx.paid({
      scope: 'record', provider: 'discolike', callKey: `contragen:${createHash('sha256').update(domains.join(',')).digest('hex').slice(0, 16)}`, units: domains.length * perCompany,
      run: () => disco.contraGenSubmit(contraGenRequest({ personaDna: input.personaDna, targeting: input.targeting ?? input.thesis, domains, perCompany })),
      dryRunResult: () => '',
    })));
  }
  const tasks = !taskIds.length ? [] : await ctx.step('contragen-poll', async () => {
    const answers = [];
    for (const id of taskIds) answers.push(await disco.discoGenStatus(id));
    const st = taskState(answers);
    // Never resubmit: the task IDs are saved in the receipts.
    if (st.failed) throw new NeedsReviewError(`ContraGen task failed (${st.failed}); task IDs ${taskIds.join(', ')}. Not resubmitted.`);
    if (!st.done) {
      if (Date.now() - plan.startedAt > CONTRAGEN_MAX_WAIT_MS) throw new NeedsReviewError(`ContraGen still running after 3 hours; task IDs ${taskIds.join(', ')}`);
      throw new WaitError(`ContraGen: ${answers.filter((a) => String(a?.status ?? a?.data?.status).toLowerCase() === 'completed').length} of ${taskIds.length} tasks done`, CONTRAGEN_POLL_MS);
    }
    return answers;
  }, { timeoutMs: 10 * 60_000 });
  return ctx.step('contragen-merge', async () => {
    const asked = new Set(plan.chunks.flat());
    const found = toContraGenContacts(tasks).filter((c) => asked.has(c.domain));
    // Duplicates of contacts we already have: same email (table key), LinkedIn, or name at the same company.
    const prior = (await ctx.db.query(`SELECT domain, lower(data->>'name') AS name, data->>'linkedin_url' AS li FROM lead_contacts WHERE list_id=$1 AND domain = ANY($2::text[])`, [listId, [...asked]])).rows;
    const seen = new Set<string>();
    for (const p of prior) { if (p.name) seen.add(`n:${p.domain}:${p.name}`); const li = normLinkedIn(p.li); if (li) seen.add(`l:${li}`); }
    const fresh = found.filter((c) => {
      const keys = [`n:${c.domain}:${c.name.toLowerCase()}`, normLinkedIn(c.linkedin_url) && `l:${normLinkedIn(c.linkedin_url)}`].filter(Boolean) as string[];
      if (keys.some((k) => seen.has(k))) return false;
      keys.forEach((k) => seen.add(k));
      return true;
    });
    const profile = currentProfile() ?? await contactProfile(ctx, listId, input, fresh);
    // Fill each company up to the target; cut contacts are kept for the cut tab.
    const room: Record<string, number> = {};
    const rows = fresh.map((c) => ({ c, fit: checkContactFit(c, profile) })).filter(({ c, fit }) => {
      if (fit.tier === 'Cut') return true;
      room[c.domain] ??= Math.max(0, perCompany - (plan.have[c.domain] ?? 0));
      if (room[c.domain] <= 0) return false;
      room[c.domain]--; return true;
    });
    const batch = Number((await ctx.db.query(`SELECT COALESCE(MAX(batch),0)::int AS b FROM lead_contact_domains WHERE list_id=$1`, [listId])).rows[0].b) + 1;
    const saved = await saveContacts(ctx.db, listId, batch, rows);
    const added: Record<string, number> = {};
    for (const { c, fit } of rows) if (fit.tier !== 'Cut') added[c.domain] = (added[c.domain] ?? 0) + 1;
    await ctx.db.query(
      `UPDATE lead_contact_domains d SET contragen_at = now(), found = d.found + COALESCE(u.n, 0)
         FROM unnest($2::text[]) AS a(domain) LEFT JOIN unnest($3::text[], $4::int[]) AS u(domain, n) ON u.domain = a.domain
        WHERE d.list_id = $1 AND d.domain = a.domain`,
      [listId, plan.checked, Object.keys(added), Object.values(added)]);
    return { companies: asked.size, tasks: taskIds.length, returned: found.length, duplicates: found.length - fresh.length, added: saved.tier1 + saved.tier2, tier1: saved.tier1, tier2: saved.tier2, cut: saved.cut };
  });
}

/** One DiscoLike Contacts run over up to 10,000 of the list's domains: start (paid; the receipt and
 *  DiscoLike's create_key make a retry reuse the same run), wait (free polls), then read the result
 *  page by page (100 companies each, its own step) and save the contacts through the engine's own
 *  contact check. Every domain of the run is then marked searched. */
async function contactsRun(
  ctx: JobContext, disco: ReturnType<typeof createDiscoLikeClient>,
  r: { listId: string; batch: number; domains: string[]; input: ContactsInput; perCompany: number; relevance: string },
  getProfile: (people: Contact[]) => Promise<ContactProfile>,
) {
  const fit = String(r.input.personaDna ?? '').trim().slice(0, 4000) || 'Owners, founders and senior decision makers';
  const hash = createHash('sha256').update(JSON.stringify([r.domains, fit, r.perCompany, r.relevance])).digest('hex').slice(0, 16);
  const body = {
    companies: { source: 'domains', domains: r.domains }, people: { fit }, relevance: r.relevance,
    max_companies: r.domains.length, per_company: r.perCompany, create_key: `dulcy-os:${r.listId}:${hash}`,
  };
  const runId = await ctx.step(`run-start-${r.batch}`, () => ctx.paid({
    scope: 'record', provider: 'discolike', callKey: `contacts-run:${hash}`, units: r.domains.length * r.perCompany,
    run: () => disco.contactsRunStart(body),
    // Same create_key = the same run: safe to ask again after an unclear answer.
    reconcile: () => disco.contactsRunStart(body),
    dryRunResult: () => '',
  }));
  const done = await ctx.step(`run-wait-${r.batch}`, async () => {
    const s = await disco.contactsRunGet(runId, 0, 1);
    const st = String(s?.status ?? '').toLowerCase();
    if (RUN_STOPPED.has(st)) throw new NeedsReviewError(`DiscoLike Contacts run ${runId} is "${st}"${s?.error ? `: ${String(s.error).slice(0, 200)}` : ''}. Not restarted.`);
    if (!RUN_DONE.has(st)) {
      const started = Date.parse(String(s?.created_at ?? ''));
      if (Number.isFinite(started) && Date.now() - started > RUN_MAX_WAIT_MS) throw new NeedsReviewError(`DiscoLike Contacts run ${runId} still "${st}" after 10 hours; check it in DiscoLike (Tasks)`);
      throw new WaitError(`DiscoLike Contacts run (batch ${r.batch}, ${r.domains.length} companies): ${st || 'running'}, ${Number(s?.contacts_total ?? 0)} validated contacts so far`, RUN_POLL_MS);
    }
    return { companies: Number(s?.companies_total ?? r.domains.length), contacts: Number(s?.contacts_total ?? 0), spentUsd: String(s?.summary?.spent_usd ?? s?.total_charged_usd ?? ''), stopReason: s?.summary?.stop_reason ?? null };
  }, { timeoutMs: 5 * 60_000 });

  const wanted = new Set(r.domains);
  const totals = { contacts: 0, new: 0, tier1: 0, tier2: 0, cut: 0, withContacts: 0 };
  for (let off = 0; off < Math.max(done.companies, 1); off += RUN_PAGE) {
    const out = await ctx.step(`run-${r.batch}-page-${off}`, async () => {
      const page = await disco.contactsRunGet(runId, off, RUN_PAGE);
      const { contacts, domains } = toRunContacts(page);
      const people = contacts.filter((c) => wanted.has(c.domain));
      const profile = await getProfile(people);
      const saved = await saveContacts(ctx.db, r.listId, r.batch, people.map((c) => ({ c, fit: checkContactFit(c, profile) })));
      const ds = Object.keys(domains).filter((d) => wanted.has(d));
      await ctx.db.query(
        `INSERT INTO lead_contact_domains (list_id, domain, batch, found) SELECT $1, d, $2, f FROM unnest($3::text[], $4::int[]) AS u(d, f) ON CONFLICT DO NOTHING`,
        [r.listId, r.batch, ds, ds.map((d) => domains[d])]);
      return { contacts: people.length, new: saved.inserted, tier1: saved.tier1, tier2: saved.tier2, cut: saved.cut, withContacts: ds.filter((d) => domains[d] > 0).length, rows: Array.isArray(page?.companies) ? page.companies.length : 0 };
    }, { timeoutMs: 5 * 60_000 });
    for (const k of Object.keys(totals) as (keyof typeof totals)[]) totals[k] += out[k];
    if (!out.rows) break;
  }
  // Companies the run never returned were still searched: mark them so a re-press does not pay again.
  await ctx.step(`run-domains-${r.batch}`, () => ctx.db.query(
    `INSERT INTO lead_contact_domains (list_id, domain, batch, found) SELECT $1, d, $2, 0 FROM unnest($3::text[]) AS u(d) ON CONFLICT DO NOTHING`,
    [r.listId, r.batch, r.domains]).then(() => true));
  return { batch: r.batch, runId, companies: r.domains.length, ...totals, spentUsd: done.spentUsd, stopReason: done.stopReason };
}

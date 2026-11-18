// Contacts for a lead list: the people DiscoLike finds at Tier 1/2 companies, checked in
// code against a CONTACT PROFILE built once per list (persona DNA + thesis + client context
// + the real titles seen), the same way companies are. Never one AI call per contact.
//  - Cut: no email, a person in an excluded country (judged by the PERSON's country),
//    a title or department the persona clearly excludes (unless the title is also a target).
//  - Tier 1: a target decision-maker title. Tier 2: everything plausible but unclear.
import { contactCountryAllowed, type Tier } from './fit.js';

export interface Contact {
  persona_id?: number; domain: string; name: string; first_name: string; last_name: string; title: string;
  seniority: string; department: string; email: string; linkedin_url: string; person_country: string; person_state: string;
  company_name: string;
}

export function toContacts(response: any): Contact[] {
  const results = response?.results ?? response?.data?.results ?? {};
  const out: Contact[] = [];
  for (const [domain, entry] of Object.entries<any>(results)) {
    const company = entry?.company ?? entry?.firmographics ?? entry ?? {};
    const people = Array.isArray(entry?.contacts) ? entry.contacts : Array.isArray(entry?.results) ? entry.results : [];
    for (const c of people) {
      const s = (v: unknown) => String(v ?? '').trim();
      out.push({
        persona_id: Number.isFinite(Number(c.persona_id ?? c.id ?? c.contact_id)) ? Number(c.persona_id ?? c.id ?? c.contact_id) : undefined,
        domain: s(domain).toLowerCase(), name: s(c.name ?? [c.first_name, c.last_name].filter(Boolean).join(' ')),
        first_name: s(c.first_name), last_name: s(c.last_name), title: s(c.title ?? c.job_title), seniority: s(c.seniority), department: s(c.department),
        email: s(c.email).toLowerCase(), linkedin_url: s(c.linkedin_url ?? c.linkedin), person_country: s(c.person_country ?? c.country), person_state: s(c.person_state ?? c.state),
        company_name: s(company.name ?? company.company_name ?? entry?.name),
      });
    }
  }
  return out;
}

/** ISO codes for the old global person-country exclusion (India, Pakistan, every African country). */
export const EXCLUDED_PERSON_COUNTRY_CODES = ['IN', 'PK', 'DZ', 'AO', 'BJ', 'BW', 'BF', 'BI', 'CV', 'CM', 'CF', 'TD', 'KM', 'CG', 'CD', 'CI', 'DJ', 'EG', 'GQ', 'ER', 'SZ', 'ET', 'GA', 'GM', 'GH', 'GN', 'GW', 'KE', 'LS', 'LR', 'LY', 'MG', 'MW', 'ML', 'MR', 'MU', 'MA', 'MZ', 'NA', 'NE', 'NG', 'RW', 'ST', 'SN', 'SC', 'SL', 'SO', 'ZA', 'SS', 'SD', 'TZ', 'TG', 'TN', 'UG', 'ZM', 'ZW', 'EH', 'RE', 'YT', 'SH'];
const EXCLUDED_CODES = new Set(EXCLUDED_PERSON_COUNTRY_CODES.map((c) => c.toLowerCase()));
export const personCountryAllowed = (c: string) => !EXCLUDED_CODES.has(String(c ?? '').trim().toLowerCase()) && contactCountryAllowed(c);

export interface ContactProfile {
  source: 'ai' | 'code';
  summary: string;
  targetTitleWords: string[];
  excludeTitleWords: string[];
  excludeDepartments: string[];
  notes?: string;
}

const DEFAULT_TARGET = ['owner', 'co-owner', 'founder', 'co-founder', 'ceo', 'chief executive', 'president', 'managing director', 'general manager', 'principal', 'partner', 'coo', 'chief operating'];
const DEFAULT_EXCLUDE = ['intern', 'student', 'assistant', 'receptionist', 'customer service', 'customer support', 'support specialist', 'recruiter', 'human resources', 'accountant', 'bookkeeper', 'cashier', 'sales associate', 'retired', 'volunteer'];

const phrases = (v: unknown, max: number) => (Array.isArray(v) ? v : []).map((x) => String(x ?? '').trim().toLowerCase()).filter((x) => x.length >= 2 && x.length <= 40).slice(0, max);

/** Code-only contact profile: sensible defaults + the persona's own "Exclude ..." list. */
export function codeContactProfile(personaDna = ''): ContactProfile {
  const ex = [...personaDna.toLowerCase().matchAll(/exclude\s+([^.]*)/g)].flatMap((m) => m[1].split(/,|\band\b|\bor\b/)).map((x) => x.replace(/\b(unless|roles?|store|generic|unrelated|only)\b.*$/, '').trim()).filter((x) => x.length >= 2 && x.length <= 40);
  return { source: 'code', summary: personaDna.slice(0, 300) || 'Default decision-maker titles.', targetTitleWords: DEFAULT_TARGET, excludeTitleWords: [...new Set([...DEFAULT_EXCLUDE, ...ex])], excludeDepartments: [] };
}

export const CONTACT_PROFILE_SYSTEM = `You prepare the contact rules for a B2B cold outreach list. Output ONLY a JSON object.
Goal: keep the people who can buy, remove obvious wrong roles. Balanced: not too loose, not too strict.
- targetTitleWords: short title words/phrases (1-3 words) of the decision-makers the persona describes (e.g. "owner", "founder", "operations director", "head of sourcing"). Max 30.
- excludeTitleWords: short title words/phrases of roles the persona clearly excludes (e.g. "sales associate", "customer service", "intern"). Never words that also describe a target (do not exclude "manager" if "operations manager" is a target). Max 30.
- excludeDepartments: only from the departments provided, and only ones the persona clearly excludes.
JSON shape: {"summary": "who we contact and who we don't, max 2 sentences", "targetTitleWords": [], "excludeTitleWords": [], "excludeDepartments": [], "notes": ""}`;

export function contactProfilePrompt(o: { personaDna?: string; targeting?: string; clientContext?: string; titles: Record<string, number>; departments: Record<string, number> }) {
  const top = (m: Record<string, number>, n: number) => Object.entries(m).sort((a, b) => b[1] - a[1]).slice(0, n).map(([k, c]) => `${k} (${c})`).join('\n');
  return [
    `Contact persona: ${o.personaDna || '(none)'}`,
    `Targeting sentence / thesis: ${o.targeting || '(none)'}`,
    `Client context: ${o.clientContext || '(none)'}`,
    `Titles seen in the first batch (title (count)):\n${top(o.titles, 80) || '(none)'}`,
    `Departments seen:\n${top(o.departments, 40) || '(none)'}`,
  ].join('\n\n');
}

export function cleanContactProfile(raw: Record<string, unknown>, departments: Record<string, number>): ContactProfile {
  const seen = new Set(Object.keys(departments).map((d) => d.toLowerCase()));
  const target = phrases(raw.targetTitleWords, 30);
  return {
    source: 'ai',
    summary: String(raw.summary ?? '').slice(0, 400),
    targetTitleWords: target.length ? target : DEFAULT_TARGET,
    excludeTitleWords: phrases(raw.excludeTitleWords, 30).filter((w) => !target.includes(w)),
    excludeDepartments: phrases(raw.excludeDepartments, 20).filter((d) => seen.has(d)),
    notes: String(raw.notes ?? '').slice(0, 300) || undefined,
  };
}

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const hit = (text: string, words: string[]) => words.find((w) => new RegExp(`(^|[^a-z])${esc(w)}($|[^a-z])`).test(text));

export interface ContactFit { tier: Tier; reasons: string[]; signals: string[] }

export function checkContactFit(c: Contact, p: ContactProfile): ContactFit {
  const reasons: string[] = [];
  const signals: string[] = [];
  const title = c.title.toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(c.email)) reasons.push('no email');
  if (c.person_country && !personCountryAllowed(c.person_country)) reasons.push(`person based in ${c.person_country} (excluded country)`);
  const target = hit(title, p.targetTitleWords);
  const bad = hit(title, p.excludeTitleWords);
  if (bad && !target) reasons.push(`title "${c.title}" is excluded ("${bad}")`);
  const dept = c.department.toLowerCase();
  if (dept && p.excludeDepartments.includes(dept) && !target) reasons.push(`department "${c.department}" is excluded`);
  if (reasons.length) return { tier: 'Cut', reasons, signals };
  if (target) { signals.push(`decision-maker title ("${target}")`); return { tier: 'Tier 1', reasons, signals }; }
  return { tier: 'Tier 2', reasons, signals };
}

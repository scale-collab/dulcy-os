// ContraGen (DiscoLike /v1/contacts/discover/generate): finds more decision makers at a company
// by web research. Request body and result parsing copied from the old n8n nodes
// "Prepare ContraGen Fallback2" and "Merge ContraGen Contacts2".
// Rule (Alex, 2026-11-20): runs on every company with fewer usable contacts than the
// people-per-company target, not only on companies where DiscoLike found nobody.
import type { Contact } from './contacts.js';

/** The DiscoLike integration and search provider the old workflow used. */
export const CONTRAGEN_INTEGRATION_ID = 'e6adab07-e444-471c-9c85-11ec34110ce4';
export const CONTRAGEN_SEARCH_PROVIDER_ID = '32709503-8435-41a4-bd3a-472575f9d7f3';
/** Old workflow: at most 1,000 domains per ContraGen task. */
export const CONTRAGEN_BATCH = 1000;

export function contraGenRequest(o: { personaDna?: string; targeting?: string; domains: string[]; perCompany: number }) {
  const icpText = [o.personaDna, o.targeting].filter(Boolean).join('\n\nCompany context: ');
  return {
    icp_text: icpText, domains: o.domains, context_mode: 'website', search_context_size: 'low',
    max_contacts_per_domain: o.perCompany, find_emails: true,
    integration_id: CONTRAGEN_INTEGRATION_ID, search_provider_id: CONTRAGEN_SEARCH_PROVIDER_ID,
  };
}

const clean = (v: unknown) => String(v ?? '').trim();
export const normDomain = (v: unknown) => clean(v).toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '').split(/[/:?#]/)[0];
export function normLinkedIn(v: unknown): string {
  const s = clean(v); if (!s) return '';
  try {
    const u = new URL(/^https?:\/\//i.test(s) ? s : 'https://' + s);
    if (!/(^|\.)linkedin\.com$/i.test(u.hostname)) return '';
    const p = u.pathname.replace(/\/+$/, '').toLowerCase();
    return /^\/(in|pub)\/[^/]+/.test(p) ? 'linkedin.com' + p : '';
  } catch { return ''; }
}

/** Status of a set of task answers: failed (with why), completed, or still running. */
export function taskState(tasks: any[]): { failed?: string; done: boolean } {
  for (const r of tasks) {
    const st = clean(r?.status ?? r?.data?.status).toLowerCase();
    if (['failed', 'error', 'cancelled', 'canceled'].includes(st)) return { failed: clean(r?.error ?? r?.message ?? st).slice(0, 500), done: false };
  }
  return { done: tasks.length > 0 && tasks.every((r) => clean(r?.status ?? r?.data?.status).toLowerCase() === 'completed') };
}

/** Every person in completed ContraGen task answers (the n8n merge's tolerant parser). */
export function toContraGenContacts(tasks: any[]): Contact[] {
  const out: Contact[] = [];
  const add = (domain: string, value: any): void => {
    if (value == null) return;
    if (Array.isArray(value)) { for (const item of value) add(domain, item); return; }
    if (typeof value === 'string') {
      const t = value.trim(); if (!t) return;
      try { add(domain, JSON.parse(t)); return; } catch { /* plain text lines */ }
      for (const line of t.split(/\r?\n/).map((v) => v.trim()).filter(Boolean)) {
        const parts = line.replace(/^[-*\d.)\s]+/, '').split('|').map((v) => v.trim());
        if (parts.length >= 2) add(domain, { name: parts[0], title: parts[1], email: parts[2] ?? '', linkedin_url: parts[3] ?? '' });
      }
      return;
    }
    if (typeof value !== 'object') return;
    const nested = value.contacts ?? value.people ?? value.results ?? value.candidates ?? value.items;
    if (Array.isArray(nested)) { add(value.domain ?? domain, nested); return; }
    const d = normDomain(value.domain ?? value.company_domain ?? domain);
    const full = clean(value.name ?? value.full_name ?? [value.first_name, value.last_name].filter(Boolean).join(' '));
    const parts = full.split(/\s+/).filter(Boolean);
    const first = clean(value.first_name ?? parts[0] ?? ''), last = clean(value.last_name ?? parts.slice(1).join(' '));
    const title = clean(value.title ?? value.job_title ?? value.role);
    if (!d || (!full && !first && !last) || !title) return;
    const status = clean(value.email_status).toLowerCase();
    out.push({
      source: 'ContraGen', domain: d, name: full || [first, last].filter(Boolean).join(' '), first_name: first, last_name: last, title,
      seniority: clean(value.seniority), department: clean(value.department),
      // n8n kept the email only when it was found (or no status was given).
      email: !status || status === 'found' ? clean(value.email ?? value.work_email).toLowerCase() : '',
      linkedin_url: clean(value.linkedin_url ?? value.linkedin), person_country: clean(value.person_country ?? value.country), person_state: clean(value.person_state ?? value.state),
      company_name: clean(value.company_name ?? value.company ?? d),
    });
  };
  for (const task of tasks) {
    const raw = task?.results ?? task?.data?.results ?? task?.output ?? task?.data?.output ?? task?.result ?? task?.data?.result ?? {};
    if (Array.isArray(raw)) add('', raw);
    else if (raw && typeof raw === 'object') for (const [domain, value] of Object.entries(raw)) add(domain, value);
    else add('', raw);
  }
  return out;
}

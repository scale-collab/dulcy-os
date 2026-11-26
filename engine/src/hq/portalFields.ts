// The Airtable tables and fields the client portal reads and writes (2026-11-26). Taken from the
// Softr portal's own data sources (hq/portal-softr-inventory.md) and airtable/SCHEMA.md. Every read
// names its fields; nothing outside these lists is ever read for a client.

export const T = {
  tasks: 'tblB97qvoidTSi9Vr',          // Client Tasks
  documents: 'tblwo2vuDBBdOHFsz',      // Documents
  meetings: 'tbldiv2czPkJ1zeQE',       // Client Meetings (meetings with Dulcy)
  invoices: 'tblxGQqMzeEu23iHi',       // Client Invoices
  notifications: 'tblwJK1VB7affamrz',  // Client Notifications
  callFeedback: 'tbljJ0uWryVMuilXn',   // Call Feedback
  closedDeals: 'tblObFlCC7BrdaruO',    // Client Closed Deals
  campaignFeedback: 'tblX4NisPYHJkpZYW', // Campaign Feedback
  emailOverview: 'tblZkEi6qylqfOj9Z',  // Email Analytics Overview
  linkedinOverview: 'tblTEPeaVSGcct8FY', // LinkedIn Analytics Overview
  linkedinCampaigns: 'tbl7s4Q7ccNy5aSSW', // LinkedIn Campaigns
  onboarding: 'tbljhM1JmUwr99tu4',     // Onboarding
  portalUsers: 'tbl8VWzIsWJYJfLUA',    // Portal Users (Softr's users collection)
} as const;

export const TASK = { name: 'fld9ZbsQc4mrQO0GX', description: 'fldaM5Lx0TRzS8yLS', stage: 'fldKNlgMuXrS2TJ9U', client: 'fldmgwSf9NbMgFDCi', attachments: 'fld3c9Dula6AYVZSm', modified: 'fldfAherhhCr9m93D' } as const;
export const DOC = { title: 'fldXo0RIDVSuTMYqF', description: 'fldFQCpqYD5SZRSnV', attachments: 'fldRGhqS4EmziHpu2', client: 'fldFB8kIbhCMHDarP', uploadedBy: 'fldX0AJZstxqFt7bg', internal: 'fld9b4IlPxB9X5oVa', modified: 'fldcrO2luYQ5kok5Q' } as const;
export const MEET = { title: 'fldEitoqz9B06ExOK', summary: 'fldmK5W8UROocJrL0', date: 'fldyAKXA0S55vzYS7', recording: 'fldFMnIpm6b2S5zhL', client: 'fldmvBRq7vliUvJPU', hide: 'fld4MD7KJr1RpbGdc' } as const;
/** Invoices: no Xero link, batch, evidence or coverage field (internal). */
export const INV = { id: 'fldSTgGRokNJwZp7a', amount: 'fld9hZw9TzROZKmQc', date: 'fldl4ud7hTdlXsSSZ', type: 'fld4EjkIMQbPrW5I3', client: 'fldsMWMdN7B4YkMo8', hide: 'fldpryfkY1uVbeTaL', periodStart: 'fldnQ3R7szCzSEIcJ', periodEnd: 'fldWpHlYz7BNZK0JN', status: 'fldNJY30aY5EZweAX', currency: 'fldIgatj1KUro6wXk' } as const;
export const NOTE = { title: 'fldiwUMk8RoJFV4wJ', message: 'fldqpuxQEANRIdb4C', client: 'fld42VOgZrdKqcVM8', type: 'fldByGNugWy5XO0Br', dismissed: 'flduntfLy4DDoIlDL', created: 'fldeBXp6V15F1NXwj' } as const;
export const CF = { lead: 'fldPDcQp7z50dopLN', status: 'fldXNEJcG9LUnR73H', rating: 'fld1KGADNp3pX2mLi', notes: 'fldZXCeH23P9azJqb', link: 'fldIMEgJzXPjaSCp2', emails: 'fldfSyqD5IEoRy2w7', newDate: 'fldsgmVQKkbAoTvsE', created: 'fld2Vc0nViSuJ0jwb' } as const;
export const DEAL = { lead: 'fldOiKKVLzBQ5UPMj', value: 'fldlDCUqZHM4lci6A', date: 'fldpzEEcRXaLPbatb', type: 'fldC4MEYuOALLMasQ', why: 'fld8azgjeA3IqTuwa', emails: 'flde9Y79JLlFxKdEv', created: 'fldDfY4vXJygKmDeT' } as const;
export const CFB = {
  lead: 'fldq2taQdDUJf2PSs', feedback: 'fldkZ4G8OUsdRRqn9', changes: 'fld3uMxKUpmvChNEb', reviewCopy: 'fldO4YIYkW2d1rTp5',
  size: 'fldNqIRLvlidjQ737', geo: 'fldfLnMSfZeTySOoB', industry: 'fldD1DWI7pyiNDky4', title: 'fldRYGQEJpd7RGe70', context: 'fld95MgtdrrREWWSc', campaigns: 'fld0o42OgSWvwWirn',
} as const;
export const EAO = { period: 'fld2lNnwaEWOXJDbm', client: 'fldzd0LKSIVCPvxOs', contacted: 'fldp5wg8A6XA10bAl', sent: 'fldVs2haZDtFqeYJK', replies: 'fldZPsJKQz1Sn0UJQ', interested: 'fld5OvaOUVdOQZ4wX', booked: 'fldtysdSyWu4GSJkF', updated: 'fldrFsU3zkW0nZJDr' } as const;
export const LAO = { period: 'flduCc6xsfbeCyha3', client: 'fldaLJfTunR6rmU5C', sent: 'fldjpHcc5qimYF06k', accepted: 'fldNzkmv0ITOTJ6eK', messages: 'fldy8A5YEHwAhI3fP', replies: 'fldT9DFOlTmEkFJfP', booked: 'fldnSD9W3gPQDxyQE', updated: 'fld8hQwdDzmOrk5L6' } as const;
export const LIC = { name: 'fldIqrIuJziAvf1n1', clientRecs: 'fldfclKZb0SNQsYxJ', status: 'fldFGS5XOc2pCbf9Y', leads: 'fldUtwAWw3PSUx5Ki', sent: 'fldxdWO9mKpIRmKji', accepted: 'fld1nzYsh20aMqQrI', replies: 'fld7XShLCdt0dmtsN', booked: 'fldBGSLTkAWcwei3C' } as const;
/** Portal Users: never the Password column. */
export const PU = { name: 'fldeUgIKgDSvskRub', email: 'fldE01Huu5atFdpmX', client: 'fldoeEJikSmNTW3Zl', lastSeen: 'fldQK7YYlT52NFgjy' } as const;
/** Campaigns fields the portal reads beyond campaigns.ts KF (thesis and targeting; the review copy is CC.review in scribe.ts). */
export const CX2 = {
  thesis: 'fldlixHfhzrd7nuSc', launch: 'fldhyq0anpSO1r0bV', approach: 'fldclFGDzjg4nvfxL', prep: 'fldMyRtIz3Zm26oiH',
  industries: 'fldBvCyKSzeK2Cz9A', geo: 'fldN9uic8Pf5ELaBo', size: 'fldeuraNTe1vFfre5', titles: 'fldRmUiHXsg4pxzvi',
} as const;
/** Workspace IDs: the Logins field (Access & Credentials). Read on demand for one client, never cached, never logged. */
export const WS_LOGINS = 'fld081oco8NBbfI3H';
export const ONB_CLIENT = 'fldNZEHEBArPZSvMZ';

/** The Softr form choices, word for word. "(Internal) Don't Track This Call" is not offered to clients. */
export const CALL_STATUS = ['Qualified', 'Unqualified', 'No Show', 'New Date'] as const;
export const DEAL_TYPES = ['Monthly Retainer', 'One-time Project', 'Pilot / trial', 'Annual contract', 'Pay-per-result', 'Other'] as const;
export const REVIEW_FEEDBACK = ['Approve Campaign', 'Request Changes'] as const;
export const REVIEW_CHANGES = ['Copy', 'Lead List', 'Entire Campaign'] as const;
export const TARGETING_CHOICES = ['✅ Looks good — keep as is', '🔧 Minor tweaks needed', '⚠️ Too broad — narrow it down', '🎯 Too narrow — expand it', '❌ Not aligned — needs replacement', '💬 Needs discussion on next call'] as const;
export const PERIODS = ['Last 10 days', 'Last 30 days', 'Last 60 days', 'Last 120 days', 'All time'] as const;

const SIZES = ['1-10', '11-20', '21-50', '51-100', '101-200', '201-500', '501-1000', '1001-2000', '2001-5000', '5001-10000', '10000+'];
const INDUSTRIES = ['ACCOUNTING', 'ADVERTISING AND MARKETING', 'AGRICULTURE AND NATURAL RESOURCES', 'ALCOHOL AND TOBACCO', 'AUTOMOTIVE', 'BIG DATA AND ANALYTICS', 'BIOTECHNOLOGY', 'BLOCKCHAIN AND CRYPTOCURRENCY', 'BUSINESS PRODUCTS AND SERVICES', 'CLOUD COMPUTING', 'COMPUTER HARDWARE AND SEMICONDUCTORS', 'CONGLOMERATES SHELL AND HOLDING COMPANIES', 'CONSTRUCTION', 'CONSUMER PRODUCTS', 'CONSUMER SERVICES', 'CYBERSECURITY', 'DEFENSE AND AEROSPACE', 'E-COMMERCE', 'EDUCATION', 'ENERGY', 'ENGINEERING', 'ENTERTAINMENT', 'ENVIRONMENTAL SERVICES', 'FASHION TEXTILE AND APPAREL', 'FINANCIAL SERVICES', 'FOOD AND BEVERAGE', 'GAMING AND ESPORTS', 'GOVERNMENT SERVICES', 'HEALTHCARE', 'HOSPITALITY', 'HUMAN RESOURCES', 'INSURANCE', 'IT SERVICES', 'LEGAL'];
const CRMS = ['Hubspot', 'Salesforce', 'Pipedrive', 'Zoho', 'Close', 'ActiveCampaign', 'GoHighLevel', 'Monday.com', 'Other (Please specify)'];

export interface OnbField { key: string; id: string; label: string; kind: 'text' | 'long' | 'url' | 'email' | 'select'; choices?: readonly string[]; group: string }
/**
 * Onboarding answers the client may read and edit (SOP 107: "They can edit fields, update answers").
 * Never: the LinkedIn email/password, the 2FA secret, ci_* fields, formulas, links, attachments and
 * automation fields. Keys are short and stable; the Airtable field ID never leaves the server.
 */
export const ONBOARDING_EDITABLE: readonly OnbField[] = [
  { key: 'company', id: 'fldVkfXhGnNgKwDYN', label: 'Company name', kind: 'text', group: 'Your company' },
  { key: 'website', id: 'fld6EvR6lV0EnmVFK', label: 'Website', kind: 'url', group: 'Your company' },
  { key: 'fullName', id: 'fldaC92hnYYPogUvw', label: 'Your full name', kind: 'text', group: 'Your company' },
  { key: 'email', id: 'fld0aNQPMhyEZRhn5', label: 'Email address', kind: 'email', group: 'Your company' },
  { key: 'salesPerson', id: 'fldgvimk1wMZjiqdW', label: 'Who takes the sales calls on your team? (outreach is sent on their behalf)', kind: 'text', group: 'Your company' },
  { key: 'team', id: 'fldSDFTGZLea7lQBH', label: 'Other team members we should talk to', kind: 'text', group: 'Your company' },
  { key: 'sell', id: 'fld1AjmO7gSRAZTnw', label: 'What exactly do you sell?', kind: 'long', group: 'Your offer' },
  { key: 'pricing', id: 'fldhVMoa5gJ4fBhfB', label: 'How does your pricing work?', kind: 'text', group: 'Your offer' },
  { key: 'guarantee', id: 'fldwswWg39Y34CcnG', label: 'Your risk reversal or guarantee', kind: 'text', group: 'Your offer' },
  { key: 'timeToResults', id: 'fldTSO9lkDq3wTnMX', label: 'How long until clients see results?', kind: 'text', group: 'Your offer' },
  { key: 'whyYou', id: 'fldje1pp7U1qllFd1', label: 'Why do clients choose you over competitors?', kind: 'text', group: 'Your offer' },
  { key: 'offerOther', id: 'fldZya6OzjjwUz5Pr', label: 'Anything else about your offer?', kind: 'text', group: 'Your offer' },
  { key: 'caseStudies', id: 'fldw2xB6XiZLowwHI', label: 'Notable case studies or client success stories', kind: 'long', group: 'Proof' },
  { key: 'results', id: 'fldB3XJKm7TqnEEiC', label: 'Results you have gotten for clients', kind: 'long', group: 'Proof' },
  { key: 'market', id: 'fldt14pabzQ15V55U', label: 'Who exactly is your target market?', kind: 'text', group: 'Ideal clients' },
  { key: 'problems', id: 'fldi996B3unyxPEhw', label: 'What problems make someone look for a solution like yours?', kind: 'long', group: 'Ideal clients' },
  { key: 'locations', id: 'fldoM5rgmkctQWxmS', label: 'Locations of your ideal clients', kind: 'text', group: 'Ideal clients' },
  { key: 'size', id: 'fldtq9oNmDpGQJBS6', label: 'Company size of your ideal clients', kind: 'select', choices: SIZES, group: 'Ideal clients' },
  { key: 'industry', id: 'fld75VfkhG2sJLtj2', label: 'Industry of your ideal clients', kind: 'select', choices: INDUSTRIES, group: 'Ideal clients' },
  { key: 'moreIndustries', id: 'fldq8qhOJAZo8jNxj', label: 'Other industries of your ideal clients', kind: 'text', group: 'Ideal clients' },
  { key: 'excludeIndustries', id: 'fldeFD6sQeMud0rXc', label: 'Industries we should exclude', kind: 'text', group: 'Ideal clients' },
  { key: 'titles', id: 'fldW9QJs393tLxwxh', label: 'Job titles of your ideal clients', kind: 'text', group: 'Ideal clients' },
  { key: 'revenue', id: 'fld3yHDaw8GR6fE6r', label: 'Annual revenue of your ideal clients', kind: 'text', group: 'Ideal clients' },
  { key: 'dream', id: 'fldF4sn3RBUjgvuy3', label: 'Dream clients', kind: 'text', group: 'Ideal clients' },
  { key: 'icpOther', id: 'fld3CiMT5oshGMyHj', label: 'Anything else about your ideal client?', kind: 'text', group: 'Ideal clients' },
  { key: 'hasCalendar', id: 'fldlJLGSZvNXtwrbD', label: 'Do you have a calendar?', kind: 'select', choices: ['Yes', 'No'], group: 'Sales' },
  { key: 'calendar', id: 'fldGfZGcQbaRpzdKU', label: 'Calendar link', kind: 'url', group: 'Sales' },
  { key: 'goal', id: 'flds20AzmmjGKmU22', label: 'Sales appointments you would like per month', kind: 'text', group: 'Sales' },
  { key: 'now', id: 'fldAPVf9KrBGa1vTv', label: 'Sales appointments you book per month today', kind: 'text', group: 'Sales' },
  { key: 'crm', id: 'fldfM1fSpVYD3EGVM', label: 'Which CRM do you use?', kind: 'select', choices: CRMS, group: 'Sales' },
  { key: 'last', id: 'fldquRdtHtWSRLRqL', label: 'Anything else before we get started?', kind: 'text', group: 'Sales' },
];

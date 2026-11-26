# Softr client portal: inventory (the spec for the HQ portal)

Read 2026-11-26, read only, from the Softr app "Dulcy - Client Portal" (`d1b52a3e-7701-4707-9f78-70aaa83e8de6`, classic app) with the Softr tools, plus `airtable/SCHEMA.md`, `airtable/automations/` and SOP 107. Nothing in Softr was changed.

## What the Softr tools can and cannot show
- **Shown:** every page and its blocks (type, visibility), the navigation, the users-collection settings, each data block's Airtable table and that table's fields, and for the one vibe-coding block (Notifications) its full code, record filter and action.
- **Not shown for classic blocks:** which fields a list/table/form shows, its record filter, and its buttons/actions. Where a write depends on those, the source used to confirm it is named below, or it is marked UNKNOWN and left out of HQ.
- **Scoping in Softr:** the app has **0 data restrictions** and no custom user groups in use (one custom group "None", past the plan limit). Scoping is per block. The one block whose filter is readable (Notifications) filters `Client IS_ONE_OF USER:::Client Record ID`, where the Softr user's `Client Record ID` is a lookup on the Airtable **Portal Users** table (`Client Associated` → Workspace IDs → `Record ID`). The other blocks' filters are UNKNOWN; HQ scopes every read by the session's client instead (see "How HQ scopes").

## App settings
| Setting | Softr |
|---|---|
| Domain | portal.dulcy.io (subdomain dulcy.softr.app) |
| Sign-in | Email + password only (no Google, no magic link), strong passwords |
| Sign-up | Open to the public |
| Sessions | 90 days, no inactivity timeout |
| Email sender | Softr default |
| Navigation | One "Nav Menu": sidebar on desktop, bottom bar on mobile |
| User redirections | 3 user-group redirections (targets not readable) |

## Users collection (how a Softr user is linked to a client)
- Airtable table **Portal Users** (`tbl8VWzIsWJYJfLUA`): Name, Email, **Password (a plain text field)**, **Client Associated** (→ Workspace IDs), lookups `ID (from Client Associated)`, `Client Record ID`, `onboarding_record_id`, Created, Last Seen.
- A new Softr sign-up creates a Portal Users row. Airtable automation "When new user added to Softr x Airtable" (`wfl5Rj3uBhdk3BP36`) tries to match the email's domain to an Onboarding record (website or email domain); "Softr x Airtable Link copy" (`wflxvTzBTn7tDuNmy`) links Portal Users by Name when an Onboarding record is created. SOP 107: the team links the row to the client by hand ("Client Associated" +).
- **Count (2026-11-26):** 51 Portal Users rows; 49 linked to a client, 2 not linked. Linked to the 5 active clients + Dulcy: 15 (Twenty West 3 incl. "(Internal)", MJJ Brilliant 2, The Marketing Cartel 3, Human Marketing 3, Global Media Group 1, Dulcy 3). The other 34 are linked to inactive clients. Emails are not listed here.
- Softr passwords cannot be moved (Softr keeps its own hashes; the Airtable `Password` column is not used by HQ and is never read).

## Navigation (`7f402d8f-…`, side / bottom)
Primary: Home · Implementation Pathway · Task Requests · Campaign Calendar · **Performance Analytics** (Pipeline · Email · LinkedIn · AI Employee · Mail Analytics) · Dulcy ESP Portal (link to http://send.dulcy.io/, new tab) · **Assets** (Partnership Information → fanbasis.com purchase page · Onboarding Form · Logins · Documents / Info · Call Feedback · Our Previous Meetings · Billing). Secondary: Schedule Meeting. User menu: Account settings, Sign out. Notifications: shown in the menu (variant PRIMARY).

## Pages → blocks → table / fields → scope → actions
"Client scope" = rows whose client link is the signed-in user's client (Softr filter UNKNOWN except where noted).

| Softr page (path) | Blocks | Airtable table · fields used | Scope | Actions / writes |
|---|---|---|---|---|
| Home `/` | header, hero with call to action, feature, simple text, column container, 2 custom-code blocks | none (static) | — | Hero button "Book a Call" (SOP 107; target UNKNOWN) |
| Campaign Overview `/campaign-overview` | item details, conditional form | item details: Campaigns (assumed: block not read, 307-field table); form: Campaign Feedback | record from URL | form: see Campaign Review |
| Campaign Details `/campaign-details` | item details ×2, tab container (4 tabs), 3 lists | Campaigns + linked lists (tables not read: Campaigns/Emails dumps are 300+ fields) | record from URL | none seen |
| Campaign Review `/campaign-review` | conditional form | **Campaign Feedback** (`tblX4NisPYHJkpZYW`): lead, Client's Feedback (Approve Campaign / Request Changes), Select Changes (Copy / Lead List / Entire Campaign), Review Copy, Company Size / Geographic Targeting / Industry Targeting / Title Targeting - Feedback (6 fixed choices each), Additional Context, Campaigns (link) | the campaign comes from the URL: Campaigns formula `Campaign Overview` = `'/campaign-review?lead=' & RECORD_ID()` | **creates** one Campaign Feedback record. Campaigns' lookups `Client's Feedback`, `Select Changes`, `Review copy`, `Additional Context` (via `Campaign Feedback Record Link`) are what Atlas's campaign plan reads (`engine/src/agents/campaignPlan.ts`) |
| Campaign Calendar `/campaign-calendar` | table | not read (assumed Campaigns) | client | none seen |
| Email Analytics `/email-analytics` | tab container + 5 tabs (Last 10 / 30 / 60 / 120 days / All time, SOP 107), ~80 charts, 1 table, text | charts: **Email Analytics Overview** (`Date Period`, `Client`, Total Leads Contacted, Emails Sent, Unique Replies (+%), Interested (+%), Bounced (+%), Meetings Booked (+%), Emails to Meeting Ratio, Emails to Lead Ratio, Updated At); table: campaign rows (not read) | client (by `Client` link) | none |
| Mail Analytics `/mail-analytics` | not read | UNKNOWN (direct mail) | — | — |
| Emails details `/emails-details` | item details | not read (assumed Emails) | record from URL | — |
| LinkedIn Analytics `/linkedin-analytics` | not read | LinkedIn Analytics Overview (schema: Date Period, Client, Connections Sent/Accepted, Messages Started, Replies, InMails, Meetings Booked) | client | — |
| LinkedIn Details, LinkedIn Campaigns details | item details; tabs "interested" / "all replies" + 2 lists | LinkedIn Campaigns (schema: Campaign Name, Status, Leads, Connections, Replies, Meetings, `Record ID (from Client) (from Email Campaigns)`) and Emails (LinkedIn fields) | record from URL | — |
| AI Employee Analytics, Call Details, SMS Details | not read / item details | UNKNOWN (Emails call fields or "AI Employee Calls (Legacy)") | — | — |
| Pipeline `/pipeline` | 3 column containers, **kanban**, 8 charts | kanban: Emails by `Pipeline Stage` (New Interested · In Conversation · Booked Meeting · Completed Meeting · Closed Deal · Closed -- Not Moving Forward · Lost) (block not read) | client | drag between stages: UNKNOWN (not readable) |
| Lead Details Full `/lead-details-full` | 5 item details (1 quick-links block off) | Emails (not read) | record from URL | links to Call Feedback Form / Close a Deal (Emails formulas `internal_call_feedback_url_softr`, `internal_close_deal_url_softr`) |
| Close a Deal `/close-a-deal` | conditional form | **Client Closed Deals** (`tblObFlCC7BrdaruO`): lead, Deal Value (USD), Deal Closed Date, Deal Type (Monthly Retainer / One-time Project / Pilot / trial / Annual contract / Pay-per-result / Other), Why They Said Yes, Emails, Created | the lead comes from the URL: Emails formula `'/close-a-deal?prefill_lead=' & RECORD_ID()` | **creates** one record; `lead` = the Emails record ID. Airtable automation "Close a Deal Sync" (`wflSwwFjkYfND9xnh`) then sets `Emails` from `lead` and posts the record to Make |
| Call Feedback `/call-feedback` | tab container (2 tabs), 2 lists | not read (SOP 107: "Call Feedback Missing" and past feedback) | client | link to the form |
| Call Feedback Form `/call-feedback-form` | conditional form (logged-in only) | **Call Feedback** (`tbljJ0uWryVMuilXn`): lead, Call Status (Qualified / Unqualified / No Show / New Date / "(Internal) Don't Track This Call"), How was the call? (1-5), Notes, Link to sales call, New Call Date, Emails + lookups | the lead from the URL: Emails formula `'/call-feedback-form?prefill_lead=' & RECORD_ID()` | **creates** one record; `lead` = the Emails record ID. Automation "Call Feedback Sync" (`wflBVaeV1oOMaLHId`) sets `Emails` from `lead`, posts to Make, and when New Call Date is set copies it to Emails `Date of Call Booked` |
| Call Feedback details | item details | Call Feedback (not read) | record | — |
| Client Meetings details, Our Previous Meetings | item details; tab container + list | **Client Meetings** (`tbldiv2czPkJ1zeQE`): Meeting Title, Summary, Date of Event, Meeting Recording, Workspace IDs, Hide | client; `Hide` rows left out (assumed) | none |
| Schedule Meeting `/schedule-meeting` | custom-code block | none (code not readable) | — | booking embed/link: target UNKNOWN |
| Tasks Requested `/tasks-requested` | list (logged-in only) | **Client Tasks** (`tblB97qvoidTSi9Vr`): Task, Description, Stage (New Task / Blocked / Done), Client, Attachments, Last Modified | client | SOP 107: "When you finish it, just mark it done there" → Stage = Done (button config not readable) |
| Onboarding Form `/onboarding-form` | item details | **Onboarding** (`tbljhM1JmUwr99tu4`): 76 fields (company, offer, ICP, pricing, calendar, KPI, case studies, and **credential fields: LinkedIn Email/Password, 2FA secret key, ci_password**) | client (`Workspace IDs` link) | SOP 107: "They (and you) can edit fields" (edit config not readable) |
| Onboarding flow `/onboarding` | Softr onboarding form (after sign-up) | none | — | Softr-managed profile step |
| Implementation Pathway `/implementation-pathway` | 2 lists | **Workspace IDs** (the client's own record; fields shown UNKNOWN) | client | none |
| Documents / Info `/documents` | list | **Documents** (`tblwo2vuDBBdOHFsz`): Title, Description, Attachments, Workspace IDs, Uploaded By (Client / Dulcy), Internal?, Last Modified | client; `Internal?` rows left out (assumed) | SOP 107: client "Add / Upload" (form not on this page; UNKNOWN) |
| Access & Credentials `/logins` | item details | **Workspace IDs**: `Logins` (long text, markdown) | the client's own record | none |
| Billing `/billing` | table | **Client Invoices** (`tblxGQqMzeEu23iHi`): ID, Amount, Date, Type (Successful / Unpaid), Client, Hide, Billing Period Start/End, Invoice Status, Invoice Currency, Xero Invoice Link … | client; `Hide` left out (assumed) | none |
| Notifications `/notifications` | vibe-coding block + list | **Client Notifications** (`tblwJK1VB7affamrz`): Title, Message, Client, Type, Dismissed, Created Time | **read in full:** `Client IS_ONE_OF USER:::Client Record ID` AND `Dismissed` empty | **"Dismiss all": UPDATE `Dismissed` = true** on each shown record (confirmed in the block's code and Actions) |
| Account settings `/account` | Softr account block | Softr users collection | the user | name / password (Softr-managed) |
| Log in, Sign up, Forgot password, Reset password, Link expired, 401, 404 | Softr user-account blocks | Softr users collection | — | Softr-managed |

## Writes HQ copies, and where each was confirmed
| Write | Table · fields | Confirmed by |
|---|---|---|
| Campaign Review | Campaign Feedback: create `lead` = campaign record ID, `Campaigns` = [campaign], Client's Feedback, Select Changes, Review Copy, the 4 targeting feedbacks, Additional Context | Softr form data source (table and fields); Campaigns formula `/campaign-review?lead=RECORD_ID()`; the Campaigns lookups through `Campaign Feedback Record Link` that the engine reads. The exact field list shown in the Softr form: UNKNOWN (HQ shows all of them) |
| Call Feedback | Call Feedback: create `lead` = Emails record ID, Call Status, How was the call?, Notes, Link to sales call, New Call Date | Softr form data source; Emails formula `?prefill_lead=`; automation "Call Feedback Sync"; SOP 107 (status, rating, recording link, notes). The internal choice "(Internal) Don't Track This Call" is not offered to clients |
| Close a Deal | Client Closed Deals: create `lead` = Emails record ID, Deal Value (USD), Deal Closed Date, Deal Type, Why They Said Yes | Softr form data source; Emails formula `?prefill_lead=`; automation "Close a Deal Sync" |
| Task done | Client Tasks: `Stage` = Done | Softr list data source (Stage has Done); SOP 107 |
| Onboarding answers | Onboarding: the answer fields only (list in `engine/src/hq/portalFields.ts`, `ONBOARDING_EDITABLE`) | Softr data source; SOP 107 ("Edit fields, update answers"). Credential, formula, link and automation fields are never read or written |
| Dismiss notifications | Client Notifications: `Dismissed` = true | Vibe-coding block code + Actions (UPDATE_RECORD, field Dismissed) |
| Account settings | HQ's own login (name, password) | Softr's account page is Softr-managed; HQ has its own logins |

## Left out (not confirmable, or not safe)
- Pipeline drag-and-drop between stages (kanban config not readable).
- Client document upload (no upload form found; Airtable attachments need a public file URL; HQ stores no files).
- Mail Analytics, AI caller Call Details and SMS Details lists: table UNKNOWN. HQ shows the AI caller totals from the client's Workspace IDs rollups (Calls Made / Answered / Interested) and "not active for you yet" otherwise.
- Implementation Pathway: which Workspace IDs fields it shows is UNKNOWN; HQ shows the onboarding steps it can prove (onboarding form submitted, campaigns, first live campaign) instead.
- Billing: the Xero invoice link (an internal accounting link) is not shown.
- Lead conversation history (our sent emails and replies): HQ keeps the earlier rule (latest prospect message only).
- "Partnership Information" (fanbasis.com) and "Dulcy ESP Portal" (send.dulcy.io) are plain outside links, kept as links.

## How HQ scopes (instead of Softr's per-block filters)
The client is the session's `client_rec` (an HQ login), never the URL. HQ reads each table once a minute for everyone (fields named, no money of other clients), then keeps only rows whose every client link belongs to the session's client group (Twenty West + "(Internal)" are one client). A row linked to two clients is nobody's. Writes take an opaque key the server issued for that client's own row, and the key is looked up in that client's rows only. Code: `engine/src/hq/portal.ts` (`slice*`), `engine/src/hq/portalWrites.ts`.

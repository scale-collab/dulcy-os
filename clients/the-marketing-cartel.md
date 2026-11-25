# Client: The Marketing Cartel

Status: active
Last updated: 2026-11-17
Every fact has a source and date in brackets. Unknown = `UNKNOWN`. Never copy facts from another client.

Source keys used below:
- [WS] = Airtable Workspace IDs record recZgKU0gdB9AIZ5x (workspace ID 78), read 2026-11-17
- [OB] = Airtable Onboarding record recGsKBtRjZ22wBur, submitted 2026-09-28, read 2026-11-17
- [NCI] = Airtable New Client Intake recvbHMDLYSgh73nz (Completed 2026-09-16), read 2026-11-17
- [AGR] = Signed agreement PDF, Drive 1y8I4MEEm826QEm2McDVKIBMUu50fDuhH (agreement date 2026-09-11, signed 2026-09-16), read 2026-11-17
- [CMP] = Airtable Campaigns (7 records linked to this client), read 2026-11-17
- [M1] = Airtable Client Meetings rec2xLEj3EpRkZfWA (Fathom summary, call 2026-09-29)
- [M2] = Airtable Client Meetings reczX1YbmxEeEcQM4 (call 2026-09-30)
- [M3] = Airtable Client Meetings recStR9xdiMJHcosB (call 2026-11-04)
- [OBD] = Drive "The Marketing Cartel Onboarding Document" (146eDO697ajIEZX-4iGbe4xSOB54hKkhu3mQZK-01N2c, modified 2026-09-30)
- [SL] = Slack #marketingcartel-dulcy (C0C2C5KGBM4), full history 2026-09-16 to 2026-11-17
- [PRC] = repo file company/client-pricing-and-goals-2026-11-17.md

## 1. Snapshot
- What they sell, to whom, in one line: A 15-year-old full-service ad and web-development agency in Coral Springs, FL. It sells Google Ads, SEO/AEO, web design/development, social ads and programmatic/OTT to US businesses: vocational schools, luxury rehab, private-pay medical, e-commerce and home services. [OB, 2026-09-28] [AGR, 2026-09-11]
- Contract:
  - Agreement date 2026-09-11, signed by Wilbur Hilton 2026-09-16. [AGR] [NCI]
  - NCI Start Date is 2026-09-10. [NCI]
  - Type: Pay Per Qualified Call, USD. [NCI] [WS]
  - Monthly tech fee: $1,250, "first billed one month after the initial engagement". [AGR]
  - Per-call fee: $175 per qualified call. A qualified call is one booked from a client-approved lead list. It can be disputed only with a full video recording. [AGR]
  - Term: open-ended until the client stops. Either party gives 14 days' notice. [AGR]
  - Billing wording conflicts:
    - Weekly invoices every Friday; one clause says "due on the Friday", another says "due within 7 days of receipt". [AGR]
    - Airtable billing: Weekly Friday 17:00 America/New_York, PPC due within 7 days. [WS Billing Terms Source]
    - Don't invent a single harmonized due date. [PRC]
  - Billing Ready is false: "pending final frozen-manifest and activation review". [WS Billing Hold Reason, 2026-11-17]
  - The agreement gives no guarantee of meetings or results. [AGR]
  - Workspace IDs fields Monthly Fee and Client Start Date are blank. [WS]
- Health right now: **RED** on performance. Client sentiment: `UNKNOWN`.
  - About 2 weeks of sending have produced 1 booked meeting (2026-11-13), and it was logged as a No Show on 2026-11-16. [SL] [Airtable Call Feedback recQpcTtomHPh2ut4]
  - All 5 sending campaigns are over the 4% bounce pause threshold (4.42%–7.44%). [CMP]
  - About 3 weeks of service delay from the Dulcy outage. A credit was promised; amount `UNKNOWN`. [M3, 2026-11-04]
  - The renewal charge attempt failed. [M3, 2026-11-04]
  - Day-to-day communication is in Google Chat ("Dulcy Outbound"), which was not read. [M1] [M2]
  - The Airtable "Client Health" field is blank. [WS]
- Main contact and approver:
  - Wilbur Hilton: owner/principal. Signed the agreement, takes the sales calls and approves campaign scripts. [AGR] [OB] [M3]
  - Erick D'Icarahy: team member, asked to create the Make.com account. Title `UNKNOWN`. [SL, 2026-09-29] [M3]
  - John Floyd: team member, asked for case-study data. Title `UNKNOWN`. [SL, 2026-09-29] [M3]
- Who handles replies: **Dulcy (Josh)**. Dulcy "nurtures all replies and books calls directly to Wilbur's calendar". [M3, 2026-11-04] On 2026-11-13 Josh asked which calendar to use; Alex said it is pinned in their chat. [Slack #team-marketing, 2026-11-13]

## 2. Their business
- Services and packages: [OB, 2026-09-28]
  - Services: Google Ads, SEO/AEO, website design and custom development, social media advertising, programmatic/OTT/streaming ad buys.
  - Everything is à la carte and tailored, with no packages.
  - "We never ask for a contract".
  - Typical clients spend $3,000–$5,000/month on the agency retainer plus $7,500+/month on ad buys. These are Cartel's prices to its customers, not Dulcy's fee.
- Who their best customers are:
  - ITI Technical College is the named proof client. [OBD, 2026-09-30] [CMP thesis]
  - Dream clients listed: ITI, a brick-pavers contractor, a hair-restoration business. [OB, 2026-09-28]
  - Target company revenue: $2M+. [OB]
- Average deal size, sales cycle:
  - Deal size is implied by retainer pricing ($3k–$5k/month) [OB]. Exact average: `UNKNOWN`.
  - Sales cycle: `UNKNOWN`.
  - Time to results: "depends on the service". [OB]
  - NCI Target Deal Price Point shows $10,000, identical to MJJ's NCI, so it is likely a form default. Unverified. [NCI]
- Their sales process after a meeting is booked:
  - Wilbur takes the call. [OB]
  - Pre-call nurture: an automated email sequence with a 5-min prep video (Wistia) and case studies after a Calendly booking. [M2, 2026-09-30]
  - Wilbur sends a branded pre-call VSL. "Wilbur's video.mov" was shared in Drive on 2026-11-11. [M3] [Drive]
  - Wilbur logs call feedback in the Dulcy portal. [M3]
  - CRM is Zoho. Calendly to Zoho sync goes via Make.com (a $10/month plan). [M1] [M3]
  - Sales framework for cold leads: none ("we will help you make one"). [OB]
  - Closed clients from outbound before: "no". [OB]
- Calendar / booking link used: https://calendly.com/wilbur-marketingcartel/will-with-marketing-cartel [OB, 2026-09-28] [SL, 2026-09-29]

## 3. Goals
- Business goals: [OB, 2026-09-28]
  - Current monthly revenue: "$80k".
  - Desired: "$150k. 1-2 years. to sell the agency".
  - Appointments wanted: 10/month (Airtable KPI lookup also shows 10). [WS] Currently booking "a couple".
  - Wilbur's stated aim is to sell the agency in about 2 years and retire, with less personal time spent networking. [M2, 2026-09-30]
- NCI targets: Target Revenue $50,000, Target Qualified Bookings 50, Target Closed Deals 5, Deal Price Point $10,000. [NCI] These are identical to MJJ's NCI values, so they are likely defaults. Do not quote them as Cartel's goals.
- What "success" means to them:
  - Onboarding answer: "depends on client, goals, history and budget". [OB]
  - KPIs agreed on 2026-11-04 [M3]:
    - Primary: interested rate of at least 15%.
    - Secondary: first reply rate, and bounce rate.
    - Viability check after about 10 business days / 4,500 emails sent.
- Timeline:
  - Warm-up began about 2026-09-29. Tentative launch was 2026-10-13. [OBD]
  - Launch slipped because of the outage. Campaigns launched from about 2026-11-04 at 500/day, scaling to 1,000/day after 1 week, then 1,500/day. [M3]
  - Exact first send date: `UNKNOWN`.

## 4. Offer and promises (what we may say)
- Offer: front-end offer validation. "One month of a clearly scoped managed service, up to $5,000 in service value", with a focused Google Ads or paid-search test as the starting point. The prospect still pays ad spend. [CMP thesis, Vocational and Rehab]
  - The website-with-hosting offer is separate and not part of the test. [CMP thesis]
  - The exact scope, eligibility, capacity and ongoing terms "need Wilbur's agreement". [CMP thesis]
  - Open questions on the free month: which services qualify, whether ad spend is excluded, minimum budget, setup fees, capacity, and what the client pays after month one. [OBD, 2026-09-30]
- Approval status:
  - Vocational campaign: "Auto-approved after 48 business hours". [CMP]
  - Hair and Rehab: "Internal approval exception". [CMP]
  - Wilbur was asked to review and approve the three scripts on 2026-11-04. [M3]
  - Explicit client approval of exact wording: `UNKNOWN`.
- Pricing we may mention and how: no approved price range. Cartel says pricing is à la carte; typical clients spend $3,000–$5,000/month retainer plus $7,500+/month ad buys. [OB, 2026-09-28] Confirm with Wilbur before quoting it in replies.
- Exact outbound promises in the review copy (Email 1, Airtable "Script Copy Email 1 (Review)", read 2026-11-17):
  - "We're confident this can bring in more [students / bookings / admissions inquiries], so we're happy to do the work free." CTA: "Want us to put it together?" [CMP]
  - Other offers named at onboarding:
    - Free website build with a $200/month hosting agreement (about $400/month for complex or e-commerce sites). [M1] [OBD]
    - "one month of free services, up to $5000". [OB]
- Fulfillment owner and capacity: Cartel fulfills. Capacity: `UNKNOWN`. Wilbur was asked for high-level fulfillment processes; receipt: `UNKNOWN`. [SL, 2026-09-30]
- Approved proof / case studies: **none verified**. Alex requested on 2026-09-30, and the answers are not on file: [SL, 2026-09-30] [PRC]
  - ITI before/after numbers.
  - Permission to name ITI.
  - Vertical case studies.
  - The thesis notes Cartel's published ITI case study reports "doubled organic traffic within a year". [CMP thesis, Vocational]
- Claims we must NOT make (until verified):
  - **P.S. proof lines confirmed OK by Alex with the client (2026-11-25).** Earlier note: Email 1 P.S. lines contain proof claims that the theses themselves say are unverified: [CMP Script Copy Email 1 (Review), read 2026-11-17]
    - Vocational: ITI "doubled their enrollments from google/ai search". The thesis says the ITI proof is doubled organic traffic, "not a promise of doubled enrollments".
    - Hair: "booked consultations rose from 15 to 24 monthly in 30 days". Source: `UNKNOWN`.
    - Rehab: "admissions rose from 31 to 46 over 6 months". The thesis says "We do not yet have a verified numerical rehab case study".
    - Whether this exact text is live in EmailBison: `UNKNOWN`.
  - No guarantee of enrollments, admissions, acquisition cost, treatment outcomes or ROI. [CMP theses]
  - ITI's school result cannot be used as rehab or hair proof. [CMP thesis, Rehab]
  - No patient data or health inference in hair/rehab outreach. [CMP thesis, Hair]

## 5. Targeting
- ICP:
  - Verticals: luxury addiction rehab; private-pay medical (hair restoration, plastic surgeons, hormone/med spa); vocational schools / for-profit colleges; e-commerce; home services (plumbers, GCs, roofing, pavers). [OB, 2026-09-28]
  - Priority order: vocational/for-profit schools first; rehab, elective medical and e-commerce secondary. [M1] [OBD]
  - Geography: US.
  - Company revenue: $2M+.
  - Size bands: 1–10, 21–50, 101–200. [OB]
  - Positive signal: currently running Google Ads. [OBD]
  - Possible future test: Google Ads spenders in broader markets, e.g. HVAC. [M3]
- Buyer roles:
  - From the form: C-level, marketing managers, owners, presidents. [OB]
  - Schools: VP/Director of Marketing, Enrollment or Admissions; Campus President / Executive Director. [OBD]
  - Rehab: admissions or marketing leaders. [CMP thesis]
- Exclusions:
  - Agencies like themselves ("no other companies like ourselves"). [OB]
  - Existing clients, including ITI.
  - Public/nonprofit schools, K-12, tutoring, closed schools (schools campaign).
  - Directories, referral businesses, sober-living-only, outpatient-only (rehab).
  - Product-only haircare/wig retailers, training schools, general dermatology without an in-scope service (hair). [CMP theses]
  - DNC list: client said "no". [OB] A current-customer/competitor exclusion list was requested; receipt `UNKNOWN`. [SL, 2026-09-30]
  - Domain Exclusion Count is 4. [WS]
- Known bad fits: `UNKNOWN`. No client feedback on lead quality has been seen in Slack.

## 6. Campaign history
All figures are from Airtable Campaigns, read 2026-11-17. Reply % = unique replies / leads contacted. Interested % = interested / unique replies. Bounce % = bounced / leads contacted.

| Campaign | Dates | Sent | Reply % | Interested % | Bounce % | Meetings | Notes |
|---|---|---|---|---|---|---|---|
| Vocational & Career Schools, $2M+ (Offer Validation) | created 2026-10-07; est. launch 2026-10-14; actual start UNKNOWN | 914 | 3.72% (18/484) | 11.11% (2) | **7.44%** (36) | 1 | Active, 21% progress; auto-approved after 48 business hours; 1,478 leads |
| Hair Salons + Restoration + Transplant (parent) | created 2026-10-07 | 0 | 0 | 0 | 0 | 0 | Container, Spintax Generated |
| Luxury Residential Rehab, $2M+ (parent) | created 2026-10-07 | 0 | 0 | 0 | 0 | 0 | Container, Spintax Generated |
| Hair – Generic Emails | created 2026-11-06 | 930 | 2.53% (12/475) | 25.00% (3) | **4.42%** (21) | 0 | Active, 23.9%; KPI "Healthy" (formula) despite bounce over 4% |
| Hair – Direct Emails | created 2026-11-06 | 171 | 4.60% (4/87) | 0% (0) | **4.60%** (4) | 0 | Active, 15%; "Needs attention" |
| Rehab – Generic Emails | created 2026-11-07; end_date 2026-11-17 | 665 | 2.33% (6/257) | 0% (0) | **6.61%** (17) | 0 | **Inactive**; "Needs attention" |
| Rehab – Direct Emails | created 2026-11-07 | 789 | 1.29% (4/309) | 25.00% (1) | **7.44%** (23) | 0 | Active, 33%; "Watch" |

Totals across the 5 sending campaigns: 3,469 sent, 44 unique replies, 6 interested, 101 bounces, 1 meeting.
- The Workspace record shows 19 Total Interested Leads, 1 Total Calls Booked and Interested Conversion of 5.26% (1/19). Its "Investment Per Call" is 584. [WS]
- The $584 matches Wilbur's $584 payment, which is a specific transaction, not the plan. [PRC]

What worked / what didn't:
- The 1 booked meeting came from the Vocational campaign. Booked 2026-11-13. [SL, Make "New Meeting Booked" post] Call feedback on 2026-11-16: **No Show**. Note: the contact "does not work at the corporate office". [Airtable Call Feedback recQpcTtomHPh2ut4]
- Interested rates are 11% (schools) and 25% (hair generic, rehab direct), but on very small counts (1–3 interested each).
- Rehab overall is weakest: 1.29–2.33% reply and 6.6–7.4% bounce. The Rehab Generic campaign is now Inactive.
- Deliverability: every sending campaign is over the 4% pause line. Lists were rebuilt or "restarted" several times after the outage (Drive sheets dated 2026-10-29 to 2026-10-31). [Drive file list, 2026-11-17] Root cause: `UNKNOWN`.

## 7. Relationship history (Slack, calls, email)
- [2026-09-10] Intake created (PPQ, $1,250 tech fee, $175 per call, USD). [NCI]
- [2026-09-11 / 09-16] Agreement dated 2026-09-11, signed 2026-09-16. [AGR]
- [2026-09-21] Wilbur added to Slack. Channel renamed #marketingcartel-dulcy. [SL]
- [2026-09-28] Onboarding form submitted. [OB]
- [2026-09-29] First onboarding call. [M1] [OBD]
  - Schools first.
  - Offers: free month up to $5k, or free website plus $200/month hosting.
  - Communication on Google Chat; Slack for automated pings only.
  - 14-day warm-up.
  - Sequence: cold email, then positive reply, then LinkedIn connection.
  - Wilbur to record and share sales calls.
- [2026-09-30] Second call. [M2]
  - "Dulcy Outbound" Google Chat space created.
  - Wilbur gave LinkedIn (via 2FA) and Zoho access. Credentials are not stored here.
  - Calendly to Zoho sync planned; pre-call email workflow planned.
- [2026-09-30] Alex posted the requested assets list: fulfillment processes, LinkedIn 2FA, call recordings, ITI numbers, naming permission, vertical case studies, offer sheets/proposals, exclusion lists. [SL]
- [2026-10-12 to 2026-10-27] Dulcy server outage and data rebuild. Status updates posted. On 2026-10-27 Alex said 1,000 contacts had been sourced and copy was ready. [SL]
- [2026-11-04] Third call. [M3]
  - Launching Luxury Rehab, Hair Restoration and Vocational Schools at 500/day, scaling to 1,500/day.
  - Credit promised for the ~3-week delay caused by the AI replier server overload.
  - The renewal charge attempt failed.
  - Weekly lead invoices on 7-day terms; Alex will notify Wilbur before processing any payment.
  - Wilbur to approve scripts, send the branded pre-call VSL, and log call feedback.
  - Make.com account to be created by Erick.
  - Wilbur mentioned a colleague's B2B peptides product (for doctors / med spas) as a possible retainer engagement for Dulcy.
- [2026-11-04] Portal review notices posted for all 3 campaigns. [SL]
- [2026-11-11] "Wilbur's video.mov" (pre-call VSL) shared in Drive by Erick. [Drive]
- [2026-11-13] First meeting booked (Vocational campaign). [SL]
- [2026-11-16] That meeting was logged as a No Show. [Call Feedback]

## 8. Preferences and rules for this client
- Communication: Google Chat ("Dulcy Outbound") for normal conversation. Slack is for automated notifications only. [M1] [M2]
- Reply handling and booking: Dulcy books straight onto Wilbur's Calendly. Wilbur's own time should stay minimal. [M3]
- Alex will notify Wilbur before processing any payment. [M3]
- Invoices are weekly for qualified calls, plus the monthly tech fee. [AGR] [M3]
- Disputes need a full call video, per the agreement. Wilbur was asked to log feedback in the portal "to ensure lead quality and justify invoices". [AGR] [M3]
- LinkedIn: auto-connect with interested email leads, then a 2–3 message follow-up. [M3] Note: LinkedIn is not a working channel for Dulcy right now (CLAUDE.md). LinkedIn status for this client: `UNKNOWN`.
- Tone / words to avoid: `UNKNOWN`. No client copy feedback was seen in Slack. The Airtable "Client's Feedback" field is empty on the parent campaigns. [CMP]

## 9. Open issues and next steps
- Bounce: all 5 sending campaigns are over 4% (4.42%–7.44%). Under the rules they must be paused and investigated. Only Rehab Generic shows Inactive. Owner: Atlas / Riley. Needs Alex's decision.
- ~~Unverified proof in the Email 1 P.S. lines~~ **Resolved: Alex confirmed with the client that the P.S. lines (ITI "doubled enrollments", hair 15 to 24, rehab 31 to 46) are OK to use** (Alex, 2026-11-25).
- Downtime credit amount and the failed renewal charge: `UNKNOWN`. Owner: Ledger, then Alex.
- PPC billing: Billing Ready is false. The first billable call was a No Show; whether it is billable is `UNKNOWN`. The agreement's billable definition is "booked from approved list unless disputed with video".
- Free-month offer terms not finalized (services, ad-spend exclusion, minimum budget, capacity, post-month-1 price). [OBD]
- Wilbur's approval of the exact scripts: `UNKNOWN`. [M3]
- Proof assets, exclusion list, fulfillment overview, sales-call recordings: all requested 2026-09-30; receipt `UNKNOWN`.
- Make.com account (Erick) and the Calendly to Zoho sync: status `UNKNOWN`.
- Peptides referral lead (Wilbur's colleague): follow-up status `UNKNOWN`. Owner: Cole / Alex.
- Read the Google Chat "Dulcy Outbound" space for client sentiment and decisions. It is not accessible from here.
- Airtable client tasks: all 14 onboarding tasks are still "New Task". [Airtable Client Tasks, 2026-11-17]
- Workspace IDs fields are blank: Client Health, Monthly Fee, Client Start Date, Cold Traffic / Front End / Back End Offer, Risk Reversal.

## Sources read
- Airtable Workspace IDs recZgKU0gdB9AIZ5x (safe fields only; no API, login or ID fields), 2026-11-17
- Airtable Onboarding recGsKBtRjZ22wBur (excluding LinkedIn login, password, 2FA and ci_* fields), 2026-11-17
- Airtable New Client Intake recvbHMDLYSgh73nz; Contracts: 7 records scanned, none for Cartel, 2026-11-17
- Airtable Campaigns: 7 records (stats plus Email 1 review copy and thesis for the 3 parent campaigns), 2026-11-17
- Airtable Client Meetings: 3 Cartel records (2026-09-29, 09-30, 11-04); Client Tasks: 14; Call Feedback: 128 scanned, 1 Cartel; Client Closed Deals: 0, 2026-11-17
- Slack #marketingcartel-dulcy: full history (about 30 messages); Slack search "Cartel", "Wilbur" (7 hits), 2026-11-17
- Google Drive: signed agreement PDF; "The Marketing Cartel Onboarding Document"; Cartel file listing (titles only), 2026-11-17
- Repo: company/client-pricing-and-goals-2026-11-17.md, clients/INDEX.md, rules/RULES.md, 2026-11-17
- Not read: Google Chat (no access), Fathom (summaries already in Airtable), Zoho, EmailBison live data, lead sheets (prospect data).

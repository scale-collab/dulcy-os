# How to Triple Verify Leads

Source: https://docs.google.com/document/d/1sETxooYQGJ0wUWzpcpkbf3x8MlD9bJPt7nQG4N4fz3U/edit?usp=drivesdk
Modified: 2025-12-12T16:44:40.967Z
Exported: 2026-11-17. Source document; not independently validated as current.

﻿How to Triple Verify Leads SOP
Loom Cropping - 11 December 2025


Overview
Triple verification is a required step before any campaign launches.
This process does three things:
1. Verify email validity using MillionVerifier (primary filter)

2. Recover/repair invalid emails using Clay + additional enrichment tools (secondary filter)

3. Verify lead relevance using AI logic (ClayGent) to confirm the contact + company are a real fit for the campaign (final filter)

If a campaign launches without doing this, it WILL ruin deliverability. Never skip it.
________________


STEP 1 — Run Email Verification with MillionVerifier
1. Export the Lead List
   * After building your lead list (basic or advanced), download the CSV.

   * Even if Apollo says the emails are “verified,” never trust Apollo verification alone.

2. Upload to MillionVerifier
      1. Log into MillionVerifier.

      2. Upload the CSV.

      3. Wait for the validation process to finish.

3. Understand the Result Types
MillionVerifier outputs:
GOOD
         * Email exists

         * Safe to send

         * Moves to Step 2 (LeadMagic check)

RISKY (Catch-all)
Means the domain accepts ALL emails, even fake ones.
We never send to catch-all without an additional check.
BAD / INVALID
            * Email does not exist

            * Needs secondary enrichment (Step 2)

            * Never use these directly

You should expect around 60–70% GOOD on most lists.
________________


STEP 2 — Secondary Verification + Email Recovery in Clay
This step confirms MillionVerifier’s findings AND salvages emails that were marked invalid (often because the person changed jobs, changed emails, etc.).
1. Import the MillionVerifier CSV into Clay
               * Create a new “Verification Table” in Clay

               * Import the CSV

               * Keep only the necessary columns:

                  * Email

                  * Verification status

                  * Name

                  * Company

                  * Domain

2. Recover Invalid Emails
Most invalid emails happen when:
                     * The person switched companies

                     * Apollo stored an old corporate email

                     * The person’s naming pattern didn’t match the old domain

You fix this using Find Work Email in Clay.
Set Conditions:
Run Find Work Email ONLY when:
                        * status = invalid

                        * OR status = catch-all

Clay will:
                           * Test all logical naming patterns (first.last, firstlast, f.last, etc.)

                           * Compare against the domain

                           * Generate a NEW valid email

This often recovers 10–30% of your “lost” contacts.
3. Merge Old + New Emails Into One Final Column
Add a formula column:
                              * If original email is good → use it

                              * If original email is invalid → use the email found by Clay

This produces a “Best Email” field.
4. Validate AGAIN using LeadMagic
This is the second database verification.
Run LeadMagic on the Best Email column.
But only run when necessary:
                                 * Skip if Clay’s output already shows a valid email

                                 * Only validate emails that were auto-generated or previously invalid

Rule:
Never run LeadMagic twice on the same contact (waste of credits).
Result:
You now have two databases confirming the email:
                                    * MillionVerifier

                                    * LeadMagic

If both agree → email is safe.
If LeadMagic outputs valid catch-all, flag it as use with caution.
(We will soon use BounceBand for deeper catch-all verification.)
________________


STEP 3 — Normalize Company & Job Title (Optional but Recommended)
If your email copy references:
                                       * {{COMPANY}}

                                       * {{JOB_TITLE}}

Then you must clean these fields.
Normalize Company Name
Use:
Enrichment → Normalize Company Name
Clean Job Titles (only if your scripts reference job title)
Use:
Use AI → Browse Templates → “Clean Job Titles”
Any template works; they all standardize seniority and title wording.
________________


STEP 4 — Lead Relevance Check (AI Qualification)
This is the third verification layer, confirming the contact + company actually fit the offer.
1. Add a ClayGent Column (Use AI → Custom prompt)
Use this structure:
________________


QUALIFICATION PROMPT (Paste into Clay)
You are an expert sales qualifier. Your job is to review this lead’s information and decide if they are a good fit for our offer.


Here is our offer:
“OFFER”


Here is the criteria for good-fit companies:
- CRITERA


Here is the information about the lead:
Name: {{full_name}}
Job Title: {{job_title}}
Company: {{normalized_company_name}}
Domain: {{domain}}
Company Website: {{company_website_full}}
Company LinkedIn: {{company_linkedin_link}}


Your task:
Based on ALL information above, output ONLY:
“Yes” if they are a qualified target,
“No” if they are not.
No explanation. Only yes or no.


ClayGent will return:
                                          * Yes → keep

                                          * No → remove

This ensures:
                                             * You never email irrelevant companies

                                             * You never target contacts outside the ICP

                                             * You avoid wasted sends and keep domain health high

________________


STEP 5 — Final Lead Output
After verification, filtering, and AI qualification:
                                                1. Filter by:

                                                   * Lead Qualified = Yes

                                                   * Email Status = Valid

                                                   * Not catch-all unless absolutely necessary

                                                      2. Export final list

                                                      3. Upload into:

                                                         * Dolcy system

                                                         * Airtable campaigns

                                                         * Or directly to sending platform

This is now the fully triple-verified lead list.
________________


Final Summary (for Team Cheat Sheet)


Step
	Purpose
	Tool
	1. MillionVerifier
	Remove bad emails
	MillionVerifier
	2. Clay — Email Recovery
	Recover invalid / catch-all emails
	Clay Find Work Email
	3. LeadMagic
	Second verification database
	LeadMagic Email Validator
	4. Normalize Company/Title
	Clean merge fields
	Clay Enrichments
	5. ClayGent Qualification
	Check if they match the ICP
	Clay AI
	

End result:
A clean, accurate, safe-to-send, ICP-aligned list that protects deliverability and increases positive replies.

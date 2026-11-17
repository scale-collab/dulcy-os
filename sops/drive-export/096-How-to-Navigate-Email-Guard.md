# How to Navigate Email Guard

Source: https://docs.google.com/document/d/1i9OZF1ga02UD0mdS_9t9kuml-MHKGZ_2C1lXcMhpeQg/edit?usp=drivesdk
Modified: 2026-01-04T21:06:42.259Z
Exported: 2026-11-17. Source document; not independently validated as current.

﻿How to Navigate Email Guard


How to Navigate Email Guard


2) Purpose
This SOP explains how to log into EmailGuard, navigate each section, and understand which features are actively used in our outbound system versus which ones can be ignored. This tool supports email deliverability, inbox placement, spam prevention, and domain masking.
________________


3) Outcome
By following this SOP, the user will be able to:
* Confidently navigate EmailGuard

* Understand which features are mission-critical vs optional

* Run inbox placement tests and spam checks correctly

* Use domain masking proxies properly

* Avoid unnecessary configuration that could cause errors or wasted time

________________


4) Tools / Access Needed
   * EmailGuard account access (invited via EmailBison / Dolce onboarding)

   * Client workspace access inside EmailGuard

   * Existing outbound email domains and inboxes (already set up by Dulcy team)

________________


5) Prerequisites
Before using EmailGuard:
      * Client has been onboarded and invited to EmailGuard

      * Email infrastructure (domains, inboxes, DNS) has already been configured by Dulcy

      * Campaign copy exists or is being prepared for launch

________________


6) Step-by-Step Process
Step 1: Log In & Select Workspace
         1. Log into EmailGuard

         2. Select the correct workspace (same structure as EmailBison / Dolce)

         3. Confirm you are in the correct client environment before making changes

________________


Step 2: Understand the Dashboard (High-Level)
On the dashboard, you will see:
            * Connected domains

            * DMARC monitoring

            * Email accounts

            * Blacklist checks

            * Inbox placement tests

            * Content spam checker

            * Proxies and redirects

Important:
Not all sections are actively used. Focus only on the tools outlined below.
________________


Step 3: Email Accounts & Domain Records (Reference Only)
               * Email accounts can be uploaded to check SPF, DKIM, and DMARC

               * Domains can be added for monitoring

Rule:
We typically do not add domains or inboxes here, as this is already handled at scale by the Dulcy team.
Use this section for visibility only, not configuration.
________________


Step 4: Contact Verification (Optional Tool)
EmailGuard includes a built-in contact verification tool similar to:
                  * MillionVerifier

                  * LeadMagic

How it works:
                     1. Upload a CSV file

                     2. Run verification

                     3. Download results

                     4. Filter by valid / invalid / catch-all

Rule:
This is optional and not part of our primary lead verification workflow.
Each tool has a specialty — this is acceptable to use but not required.
________________


Step 5: Inbox Placement Tests (Critical)
This is one of the most important features.
Purpose:
                        * Shows where emails land (Inbox vs Spam)

                        * Tests Google and Microsoft inbox placement

How it works:
                           1. Go to Inbox Placement Tests

                           2. Click into results

                           3. View account-level tests (not campaign names)

                           4. Review landing results across:

                              * Google (4 inboxes)

                              * Microsoft (4 inboxes)

Scoring:
                                 * 100/100 = Fully inboxed (healthy account)

                                 * 87.5/100 = Minor spam placement (acceptable)

                                 * Below 60 = Problematic (action required)

Rule:
Only take action when the score drops below 60.
________________


Step 6: Spam Filter Tests (Limited Use)
Spam filter tests allow sending test emails to evaluate spam filtering.
Note:
This is rarely used manually.
Preferred method:
                                    * Use Content Spam Checker instead (see next step)

________________


Step 7: Content Spam Checker (Critical)
This is the most important section for campaign launches.
How to use:
                                       1. Paste full email copy into the Content Spam Checker

                                       2. Run the check

                                       3. Review:

                                          * Spam score (aim for 0–1)

                                          * Highlighted spam-trigger words

Rules:
                                             * 3+ spam score = high risk

                                             * Reduce spam words as close to zero as possible

                                             * Replace flagged terms (e.g., “checked out” → “saw”)

                                             * Re-run test until score is minimized

Rule:
Always test copy here before launching any campaign.
________________


Step 8: Domain Masking Proxies (Critical)
Domain masking proxies:
                                                * Display the client’s website

                                                * Keep the proxy URL intact

                                                * Prevent exposing the real domain

How they work:
                                                   * Each proxy is assigned a cluster IP

                                                   * Loads the real website

                                                   * Appears as its own secure domain

                                                   * SSL certificate confirms site security

Rule:
These proxies are required for safe outbound link usage.
________________


Step 9: Hosted Redirects (Rare Use)
Hosted redirects are used only if domain masking proxies fail, which is rare.
Rule:
Do not configure unless explicitly instructed.
________________


Step 10: Blacklist Checks & Monitoring (Passive)
Blacklist monitoring:
                                                      * Checks domains against known blacklists

                                                      * Runs automatically

Rule:
This is for awareness only. Blacklists are rarely an issue in our system.
________________


7) Quality Checks
Before launching or continuing a campaign, confirm:
                                                         * Inbox placement score is above 60

                                                         * Content spam score is 0–1

                                                         * No major blacklist flags

                                                         * Correct workspace selected

                                                         * Proxies resolve correctly to client site

________________


8) Output / Handoff
                                                            * Inbox placement results are logged in Airtable automatically

                                                            * Copy is approved once spam score is minimized

                                                            * Campaign proceeds through EmailBison / Dolce

                                                            * Inbox management handled via RevReply (see Inbox SOP)

________________


9) Troubleshooting
Issue: Inbox placement score below 60
                                                               * Pause sending

                                                               * Review spam checker results

                                                               * Adjust copy and retest

Issue: Spam words flagged
                                                                  * Replace flagged phrases

                                                                  * Avoid promotional language

                                                                  * Re-run checker until score improves

Issue: Proxy not resolving
                                                                     * Check SSL status

                                                                     * Use hosted redirect only if necessary

                                                                     * Escalate to technical support if persistent

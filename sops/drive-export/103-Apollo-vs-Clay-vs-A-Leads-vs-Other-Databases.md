# Apollo vs. Clay vs. A-Leads vs. Other Databases

Source: https://docs.google.com/document/d/1D0E4vZ5kwiPlX_Bj0vuEkSx9DUVc5g9UNBPbnUeeZ6g/edit?usp=drivesdk
Modified: 2025-12-11T23:29:49.662Z
Exported: 2026-11-17. Source document; not independently validated as current.

﻿Apollo vs. Clay vs. A-Leads vs. Other Databases SOP
Apollo vs. Clay vs. A-Leads vs. Other Databases - Google Docs - 11 December 2025


1. Purpose
When you start a new campaign for a client, the first big step is:
👉 Build a clean, targeted lead list.
This SOP explains:
* Which database to use (Apollo vs ALEADS vs Clay)

* When and how to bring in third-party scrapers (Clutch, StoreLeads, GMB, etc.)

* The basic decision flow so you’re not stuck when one tool is limited or down

This comes after:
   * Client onboarding form is filled (even if imperfect)

   * Campaign thesis + ICP are defined

________________


2. Our Primary Data Stack
We mainly use three core tools for leads:
      1. ALEADS – primary database (companies + people)

      2. Apollo – additional database, especially when paired with ExportApollo

      3. Clay – backup database + enrichment engine

2.1 ALEADS – Primary Database
What it is:
         * B2B database with:

            * ~40M+ companies

            * ~240M+ people

               * Pulls from LinkedIn + Crunchbase (better coverage + funding data than Apollo)

When to use:
                  * As your default starting point for:

                     * Most client ICPs

                     * Standard B2B targeting (agencies, SaaS, eCom brands, etc.)

                        * When you need:

                           * Technologies filters (e.g., Magento, Shopify, HubSpot, etc.)

                           * Funding, size, geography, basic firmographics

Conceptual steps (high level):
                              1. Filter by:

                                 * Industry / category

                                 * Employee size

                                 * Geography

                                 * Tech stack / funding (if relevant)

                                    2. Export companies or people

                                    3. Use as base for:

                                       * Direct outreach, or

                                       * Further enrichment (titles, emails, etc.) in Clay

Use ALEADS as your go-to unless there’s a specific reason not to (e.g., you need a super niche vertical list from Clutch, StoreLeads, etc.).
________________


2.2 Apollo – Secondary Database
What it is:
                                          * Big B2B database:

                                             * ~30+M companies

                                             * ~230M+ people

                                                * Very common in the market (lots of people hit these leads)

Pros:
                                                   * Solid for broad B2B targeting

                                                   * Many companies and titles already mapped

                                                   * Paired with ExportApollo.com (we use that for scraping lead exports)

Cons:
                                                      * Leads are heavily emailed by everyone and their grandma

                                                      * Not great for very niche industries (roofers, super niche eCom, etc.)

                                                      * Some industries not labeled cleanly (e.g., “eCommerce,” “Roofing”)

When to use:
                                                         * When ALEADS:

                                                            * Doesn’t have enough coverage for a specific segment

                                                            * Is temporarily down, buggy, or rate-limited

                                                               * For:

                                                                  * General B2B lists

                                                                  * Decision-maker filters by role/title (CEO, CMO, etc.)

Workflow notes:
                                                                     * You normally:

                                                                        * Build your search in Apollo

                                                                        * Copy the link

                                                                        * Use ExportApollo.com to scrape the list

                                                                           * Don’t rely on Apollo for deep industry tagging in obscure niches (that’s where scrapers + Clay come in).

________________


2.3 Clay – Backup Database & Enrichment Engine
What Clay is good for:
                                                                              * Creating lead lists when primary scrapers are down

                                                                              * Enriching leads from other sources:

                                                                                 * Adding emails

                                                                                 * Pulling LinkedIn URLs

                                                                                 * Scraping websites

                                                                                    * Combining data from:

                                                                                       * GMB, Clutch, StoreLeads, BBB, Trustpilot, etc.

Use cases:
                                                                                          1. As a fallback database:

                                                                                             * Use “Find Companies” or “Find People”

                                                                                             * Filter by size, industry, keywords, etc.

                                                                                             * Build simple lists (up to Clay’s export limits)

                                                                                                2. As enrichment layer:

                                                                                                   * Import websites from:

                                                                                                      * GMB scraper

                                                                                                      * Clutch

                                                                                                      * StoreLeads

                                                                                                      * BBB / Trustpilot

                                                                                                         * Then use Clay to:

                                                                                                            * Find decision-makers

                                                                                                            * Get emails

                                                                                                            * Grab LinkedIn URLs

Clay is your Swiss Army knife when:
                                                                                                               * ExportApollo is down

                                                                                                               * ALEADS is limited

                                                                                                               * You have good websites, but no contacts yet

________________


3. Secondary / Niche Data Sources (Scrapers)
These tools help you build highly targeted lead lists before pushing them into ALEADS/Apollo/Clay for enrichment.
3.1 BuiltWith
What it does:
                                                                                                                  * Scrapes websites by tech stack

                                                                                                                  * Great for: “brands using tech X”

Use case examples:
                                                                                                                     * “Magento Enterprise sites in the UK”

                                                                                                                     * “Shopify stores using Klaviyo”

Workflow:
                                                                                                                        1. In BuiltWith, select the technology (e.g., Magento Enterprise, region = UK).

                                                                                                                        2. Copy the results link.

                                                                                                                        3. Plug it into our BuiltWith scraper (via Ignition/your scrapers).

                                                                                                                        4. Export website list → send to ALEADS/Clay to find decision-makers + emails.

________________


3.2 Google My Business (GMB) Scraper
What it does:
                                                                                                                           * Scrapes local businesses from Google’s “X near Y” search (e.g., roofers near Orlando, FL)

Best for:
                                                                                                                              * Local service businesses:

                                                                                                                                 * Roofers

                                                                                                                                 * HVAC

                                                                                                                                 * Restaurants

                                                                                                                                 * Lawyers

                                                                                                                                 * Medspas, etc.

Data you get:
                                                                                                                                    * Business name

                                                                                                                                    * Website URL

                                                                                                                                    * Phone

                                                                                                                                    * Basic info

Workflow concept:
                                                                                                                                       1. In your GMB scraper:

                                                                                                                                          * Keyword: e.g. roofing or dentist

                                                                                                                                          * Locations: up to 200 cities (e.g. Orlando, New York, Newark, etc.)

                                                                                                                                             2. Scraper runs roofing near Orlando, FL, roofing near New York, NY, etc.

                                                                                                                                             3. It extracts:

                                                                                                                                                * Names

                                                                                                                                                * Websites

                                                                                                                                                   4. Bring this CSV into Clay

                                                                                                                                                   5. In Clay:

                                                                                                                                                      * Find company emails / decision makers

                                                                                                                                                      * Clean and filter the list

________________


3.3 StoreLeads
What it does:
                                                                                                                                                         * Database focused on eCommerce stores

                                                                                                                                                         * Huge coverage of:

                                                                                                                                                            * Shopify

                                                                                                                                                            * WooCommerce

                                                                                                                                                            * BigCommerce, etc.

Best for:
                                                                                                                                                               * Targeting Shopify / eCom brands with very specific attributes:

                                                                                                                                                                  * Category (e.g., apparel, luxury, vape, beauty, etc.)

                                                                                                                                                                  * Niche (e.g., men’s boots, activewear, etc.)

Workflow:
                                                                                                                                                                     1. Filter inside StoreLeads:

                                                                                                                                                                        * Platform (e.g. Shopify)

                                                                                                                                                                        * Category (e.g. Apparel > Men’s Clothing)

                                                                                                                                                                        * Other filters where needed

                                                                                                                                                                           2. Export store list with websites.

                                                                                                                                                                           3. Push into ALEADS/Clay to find owners/CMOs/etc.

________________


3.4 Clutch / GoodFirms / AgencyVista
What they are:
                                                                                                                                                                              * Directories of agencies & service providers (marketing, web dev, SEO, etc.)

Best for:
                                                                                                                                                                                 * Targeting agencies:

                                                                                                                                                                                    * Video production

                                                                                                                                                                                    * Marketing

                                                                                                                                                                                    * Dev shops

                                                                                                                                                                                    * PPC, SEO agencies, etc.

Workflow:
                                                                                                                                                                                       1. In Clutch (or similar):

                                                                                                                                                                                          * Choose category: e.g. “Video Production Companies”

                                                                                                                                                                                          * Filter by region, size (if available)

                                                                                                                                                                                             2. Scrape all pages (hundreds or thousands of agency sites).

                                                                                                                                                                                             3. Export website list.

                                                                                                                                                                                             4. Load into ALEADS/Clay:

                                                                                                                                                                                                * Enrich with contacts (Owner, Founder, CEO, CMO, etc.)

These are amazing quality lists because everyone is a legit agency in that niche.
________________


3.5 Trustpilot / BBB (Better Business Bureau)
What they do:
                                                                                                                                                                                                   * Review / listing sites for businesses.

Best for:
                                                                                                                                                                                                      * Local services

                                                                                                                                                                                                      * Home services

                                                                                                                                                                                                      * SMBs with online reputations

Workflow:
                                                                                                                                                                                                         1. Search something like:

                                                                                                                                                                                                            * “Roofers in Orlando”

                                                                                                                                                                                                            * “Home services in [City]”

                                                                                                                                                                                                               2. Scrape business names + websites.

                                                                                                                                                                                                               3. Send to Clay for enrichment.

________________


3.6 Crunchbase
(Remember: ALEADS already pulls Crunchbase data, but sometimes you use CB directly.)
What it does:
                                                                                                                                                                                                                  * Company + funding database.

Best for:
                                                                                                                                                                                                                     * Targeting funded startups / scale-ups

                                                                                                                                                                                                                     * Filtering by:

                                                                                                                                                                                                                        * Funding round

                                                                                                                                                                                                                        * Last funding date

                                                                                                                                                                                                                        * Industry (e.g. “Generative AI company funded in last 30 days”)

Constraints:
                                                                                                                                                                                                                           * Can typically export ~6,000 at a time

                                                                                                                                                                                                                           * May need to break big lists into segments (e.g., date ranges)

Workflow:
                                                                                                                                                                                                                              1. Build filter:

                                                                                                                                                                                                                                 * Industry (e.g. “Generative AI”)

                                                                                                                                                                                                                                 * Funding in last X days

                                                                                                                                                                                                                                 * Geography/size if needed

                                                                                                                                                                                                                                    2. Export companies (in chunks if needed).

                                                                                                                                                                                                                                    3. Bring into ALEADS/Clay for decision-maker enrichment.

________________


3.7 G2 / GetLaka / Software Review Sites
What they do:
                                                                                                                                                                                                                                       * List software products by category.

Use cases:
                                                                                                                                                                                                                                          * Target SaaS companies in certain categories:

                                                                                                                                                                                                                                             * “3D design software”

                                                                                                                                                                                                                                             * “Marketing automation tools”

                                                                                                                                                                                                                                             * Etc.

Workflow:
                                                                                                                                                                                                                                                * Same pattern:

                                                                                                                                                                                                                                                   1. Use G2/GetLaka to find products in a category

                                                                                                                                                                                                                                                   2. Export/scrape website URLs

                                                                                                                                                                                                                                                   3. Enrich in ALEADS/Clay

________________


3.8 Social Platforms: Instagram / TikTok / Twitter / Facebook / YouTube
What they’re for:
                                                                                                                                                                                                                                                      * More niche or creative campaigns:

                                                                                                                                                                                                                                                         * Brands active on TikTok (for TikTok Shop / UGC offers)

                                                                                                                                                                                                                                                         * Roofing companies inside Facebook groups

                                                                                                                                                                                                                                                         * Influencers, creators, etc.

Workflow:
                                                                                                                                                                                                                                                            * Use platform-specific scrapers to:

                                                                                                                                                                                                                                                               * Find profiles / pages

                                                                                                                                                                                                                                                               * Extract website URLs / emails if present

                                                                                                                                                                                                                                                                  * Then:

                                                                                                                                                                                                                                                                     * Enrich in Clay/ALEADS where needed

________________


4. Decision Tree: Which Tool Do I Use?
When you start lead list building for a campaign, think like this:
                                                                                                                                                                                                                                                                        1. Do we already know the ICP & niche?

                                                                                                                                                                                                                                                                           * If no → go back to:

                                                                                                                                                                                                                                                                              * “How to Identify Lowest Hanging Fruit” SOP

                                                                                                                                                                                                                                                                              * “Campaign Thesis” SOP

                                                                                                                                                                                                                                                                                 * If yes → proceed.

                                                                                                                                                                                                                                                                                    2. Can this ICP be targeted directly inside ALEADS?

                                                                                                                                                                                                                                                                                       * Yes →

                                                                                                                                                                                                                                                                                          * Start in ALEADS

                                                                                                                                                                                                                                                                                          * Filter by industry, tech, size, etc.

                                                                                                                                                                                                                                                                                          * Export + enrich/use

                                                                                                                                                                                                                                                                                             * No / too fuzzy → go to step 3.

                                                                                                                                                                                                                                                                                                3. Is there a clear external directory / source?

                                                                                                                                                                                                                                                                                                   * eCom → StoreLeads

                                                                                                                                                                                                                                                                                                   * Agencies → Clutch / GoodFirms / AgencyVista

                                                                                                                                                                                                                                                                                                   * Local services → Google My Business / BBB / Trustpilot

                                                                                                                                                                                                                                                                                                   * Tech-based niches → BuiltWith / G2 / GetLaka

                                                                                                                                                                                                                                                                                                   * Funded startups → Crunchbase

                                                                                                                                                                                                                                                                                                   * Scrape websites → send to Clay/ALEADS for enrichment.

                                                                                                                                                                                                                                                                                                      4. Are ExportApollo and ALEADS temporarily down or limited?

                                                                                                                                                                                                                                                                                                         * Use Clay Find Companies/Find People directly

                                                                                                                                                                                                                                                                                                         * Build simpler lists

                                                                                                                                                                                                                                                                                                         * Then enrich inside Clay

________________


5. Key Rules for the Team
                                                                                                                                                                                                                                                                                                            * Rule #1: Don’t blame “no data” until you’ve tried:

                                                                                                                                                                                                                                                                                                               * ALEADS

                                                                                                                                                                                                                                                                                                               * Apollo+ExportApollo

                                                                                                                                                                                                                                                                                                               * At least one external source + Clay enrichment

                                                                                                                                                                                                                                                                                                                  * Rule #2: Start as narrow and clean as possible.

It’s better to have 5,000 perfect leads than 50,000 random ones.

                                                                                                                                                                                                                                                                                                                  * Rule #3: Always bring external scrapes back into:

                                                                                                                                                                                                                                                                                                                     * ALEADS or Clay

So we can:

                                                                                                                                                                                                                                                                                                                     * Find decision makers

                                                                                                                                                                                                                                                                                                                     * Get valid emails

                                                                                                                                                                                                                                                                                                                     * Standardize fields (industry, size, etc.)

                                                                                                                                                                                                                                                                                                                        * Rule #4: Document which source(s) you used for each campaign inside:

                                                                                                                                                                                                                                                                                                                           * Airtable / Campaign record / Campaign thesis

So if performance is weird, we know if the issue was data quality.

# How to Create an Advanced Lead List

Source: https://docs.google.com/document/d/17q1qqRRMMpfOIgLGWow9Sev2vlNT8LuyWoKbhmUUHcs/edit?usp=drivesdk
Modified: 2025-12-12T00:18:30.401Z
Exported: 2026-11-17. Source document; not independently validated as current.

﻿How to Create an Advanced Lead List SOP
(4) Internal SOPs | Marketing & Lead Gen - 11 December 2025


Old (Still relevant more details): https://www.notion.so/Creating-Advanced-Lead-Lists-1b917e50215680119423e53c67f05925?source=copy_link


1. What this is (and when to use it)
This is not for:
* “Roofers in Ohio with 5–10 employees”

* “Marketing agencies 5–50 employees in US/UK/CA”

Those are basic lists.
This is for advanced, weird, or very specific asks like:
   * Corporate chains with 250–2,000 locations doing < $1B/year

   * Brands selling on Amazon in a specific way

   * Companies using specific tech stacks (Magento Enterprise, etc.)

   * US pet ecom brands with 3–5 marketing employees

   * Hyper-specific roles (e.g., corporate accountants only, not every CPA firm)

Any time the ICP can’t be grabbed by:
      * just industry

      * just size

      * just simple keyword filters

…you’re in Advanced List territory.
Core idea:
You start broad with a big, messy dataset, then use Clay + AI (ClayGent) to filter it down into exactly what we want.
________________


2. Tools You’ll Use
         * Apollo / ALEADS

            * To pull the initial big chunk of companies

               * Clay

                  * To:

                     * Import that chunk

                     * Use ClayGent (AI) to research/label companies

                     * Filter by those labels

                     * Enrich contacts + emails

Clay is the main engine here. Apollo/ALEADS are just your “raw material”.
________________


3. Overall Flow (High-Level)
                        1. Start with a clear, specific definition of the ICP

                        2. Pull a big, rough list of companies (10k–15k) from Apollo/ALEADS or a 3rd-party source

                        3. Import that into Clay

                        4. Use ClayGent to:

                           * Check special criteria (e.g., number of locations, revenue, corporate accounting, etc.)

                           * Tag companies with Yes/No or numeric data

                              5. Filter to only the winners (those that truly match the ICP)

                              6. Find contacts at those companies

                              7. Enrich emails using multiple providers (LeadMagic, Prospeo, etc., if needed)

                              8. Sanity check → export to Airtable / main system

________________


4. Step-by-Step – Example:
Corporate chains with 250–2,000 locations and under $1B revenue
Use this as a pattern for other advanced lists.
________________


4.1 Pull a broad company list
                                 1. Go to Apollo or ALEADS.

                                 2. Build a very general company search:

                                    * Relevant industries only (e.g., retail, QSR, gyms, wellness, etc.)

                                    * Regions as needed (often US)

                                    * Ignore special stuff like location count for now (Apollo doesn’t have that anyway).

                                       3. Export 10,000–15,000 companies that are likely to contain what we want.

                                          * Don’t obsess here—this is step 1.

                                          * You’d rather have extra junk now and let Clay filter it out.

                                             4. Export with at least:

                                                * Company name

                                                * Website/domain

                                                * Industry

                                                * Employee size

                                                * Country / HQ location

                                                * LinkedIn URL (if possible)

________________


4.2 Import into Clay
                                                   1. In Clay, create a new table.

                                                   2. Import the CSV of those companies.

                                                   3. Make sure columns are clean:

                                                      * company_name

                                                      * domain

                                                      * industry

                                                      * employee_count

                                                      * country

                                                      * linkedin_url

This table = your “company master list” for this advanced ICP.
________________


4.3 Use ClayGent to get 
number of locations
Now we use AI to find the special criterion we cannot filter easily in Apollo.
                                                         1. Add a ClayGent / Use AI column:

                                                            * Model: GPT-5-mini (or whatever we’re standardizing on)

                                                               2. Prompt (for this example):

Visit this company’s website {{domain}} and, if needed, its LinkedIn page {{linkedin_url}}.


Your goal: estimate how many **physical locations** this brand operates.


- If you can find an exact number, return that.
- If not, give your best ballpark estimate.


Then:


1. Return a numeric estimate of locations.
2. Tag whether it is BETWEEN 250 and 2,000 locations (inclusive).
   - Output "yes" if 200–2100 is reasonable (we allow a small margin).
   - Otherwise output "no".
3. If you truly cannot tell, output "unknown".


                                                                  3. Let ClayGent create its schema (it will usually set something like location_estimate, in_range, etc.).

                                                                  4. Run it on all rows (or batch by 1000–2000 at a time if needed).

Result:
Each company now has something like:
                                                                     * location_estimate → e.g. 780

                                                                     * in_range → yes / no / unknown

________________


4.4 Use ClayGent (or another AI column) for 
revenue
Same idea, new column.
                                                                        1. Add another ClayGent / Use AI column.

                                                                        2. Prompt example:

Research this company {{company_name}} using their website {{domain}} and any trusted business info sources you can find.


Your goal: estimate their **annual revenue** in USD.


- If you find an explicit number, convert it to a full numeric value in USD.
- If you only find a range or rough category, make a reasonable estimate (within that range).
- If you cannot find anything, give your best educated guess based on company size, industry, and brand.


Return:
1. A numeric estimate in USD (no text, just a number).
2. A tag "under_1B" = "yes" if revenue is clearly < 1,000,000,000, otherwise "no".


                                                                           3. Again, let Clay define its schema, then run.

Now you have:
                                                                              * revenue_estimate

                                                                              * under_1B → yes / no

________________


4.5 Filter down to the 
true ICP companies
Once locations and revenue are both in the table:
                                                                                 1. Add a filter view:

                                                                                    * in_range = yes

                                                                                    * under_1B = yes

                                                                                       2. Optionally filter out obviously weird responses:

                                                                                          * location_estimate is not blank or insane

                                                                                          * revenue_estimate is not 0 or something clearly wrong

You now have your final company list that matches:
                                                                                             * 250–2,000 locations (with a small buffer)

                                                                                             * Revenue under $1B

From 10k–15k raw companies, you may end up with hundreds or a couple thousand that are actually good.
________________


5. Move winners to a 
Contacts Table
We don’t want to mix companies + people in the same table.
                                                                                                1. In Clay, add a step:

                                                                                                   * Write to another table (or “Write rows to Clay table”)

                                                                                                      2. Create a new table called e.g.:

                                                                                                         * ClientName – Advanced Targets – Contacts

                                                                                                            3. Write only the filtered companies into that table.

That new table will be:
                                                                                                               * 1 row per company (to start)

                                                                                                               * Includes: domain, company name, LinkedIn URL, industry, etc.

Now we’re ready to find people.
________________


6. Enrich Contacts (Advanced lists often need more effort here)
From the contacts table:
6.1 Find people at each company
                                                                                                                  1. Add a “Find People at Company” or similar enrichment (depends on the integration: Apollo, ALEADS, Clay’s own, etc.).

                                                                                                                  2. Filter for roles we care about:

                                                                                                                     * e.g. for corporate marketing:

                                                                                                                        * CMO, VP Marketing, Head of Marketing, Director of Brand, etc.

                                                                                                                           * for ops:

                                                                                                                              * VP Operations, Director of Operations, etc.

                                                                                                                                 * for accounting:

                                                                                                                                    * “Corporate Controller”, “Head of Corporate Accounting”, etc.

                                                                                                                                       3. Expand into multiple rows:

                                                                                                                                          * 1 row per person

Now each row should be a person tied to one of our target companies.
________________


6.2 Get emails (multi-step waterfall)
For hard lists, one provider isn’t always enough. Use a waterfall like you did in the Loom:
                                                                                                                                             1. Primary provider (e.g. LeadMagic)

                                                                                                                                                * Step: “Find Work Email”

                                                                                                                                                * If status = valid, great.

                                                                                                                                                   2. If primary fails (no email or invalid):

                                                                                                                                                      * Add second step: e.g. Prospeo

                                                                                                                                                      * Map only rows where LeadMagic failed.

                                                                                                                                                         3. If still no luck:

                                                                                                                                                            * Third: DropContact

                                                                                                                                                            * Fourth: FindEmail / other provider

Goal:
Maximize how many of these high-value targets we have valid emails for.
________________


7. Optional: Add LinkedIn URL + Phone
If needed for the campaign:
                                                                                                                                                               1. Use ClayGent to find LinkedIn profile:

                                                                                                                                                                  * Prompt: “Find the LinkedIn URL for {{full_name}} at {{company_name}}”

                                                                                                                                                                     2. Use an enrichment to find mobile number if relevant and allowed.

Then add a simple “ready” field:
                                                                                                                                                                        * ready_for_outreach = yes if:

                                                                                                                                                                           * company passed filters

                                                                                                                                                                           * person exists

                                                                                                                                                                           * email is valid

________________


8. Example: Corporate Accounting Firms
Same pattern, different condition.
                                                                                                                                                                              1. Pull a large list of accounting firms (Apollo/ALEADS: industries = Accounting, Financial Services, etc.).

                                                                                                                                                                              2. Import into Clay.

                                                                                                                                                                              3. Add a ClayGent column:

Visit this firm's website {{domain}}.
Your goal: determine if they offer **corporate accounting services** (NOT just individual tax prep or bookkeeping).


- If they clearly mention services for corporations, enterprises, or corporate finance/accounting, output "yes".
- If they only seem to serve individuals or small local tax clients, output "no".
- If you’re not sure, output "no".


Only output: "yes" or "no".


                                                                                                                                                                                 4. Filter companies where ClayGent says yes.

                                                                                                                                                                                 5. Move those into a contacts table.

                                                                                                                                                                                 6. Find relevant titles (e.g. “Director of Corporate Accounting”, “Controller”, “CFO”), then emails.

                                                                                                                                                                                 7. Done.

If Clay gets things wrong (e.g. misses “Corporate Tax Services”), tweak prompt:
                                                                                                                                                                                    * Explicitly tell it to check:

                                                                                                                                                                                       * “Services” page

                                                                                                                                                                                       * Any “Corporate”, “Business”, or “Enterprise” sections

Then re-run.
________________


9. When to Stop vs. When to Ask for Help
Advanced lists can chew time if you’re not careful.
Good rule of thumb:
                                                                                                                                                                                          * If you’ve spent more than 3–4 hours on one advanced list and:

                                                                                                                                                                                             * you’re still stuck on filtering logic

                                                                                                                                                                                             * or the market clearly has messy/no data

                                                                                                                                                                                                * → Bring it to Alex.

Sometimes the correct move is:
“Too complex / too little data – not worth the time vs. upside.”
________________


10. Quick Checklist (for Advanced Lists)
Before marking an advanced list as done:
                                                                                                                                                                                                   1. ✅ Clear written ICP (not just in your head)

                                                                                                                                                                                                   2. ✅ Seed dataset pulled (10k–15k+ companies if needed)

                                                                                                                                                                                                   3. ✅ ClayGent used to label:

                                                                                                                                                                                                      * special criteria (locations / tech / revenue / niche service, etc.)

                                                                                                                                                                                                         4. ✅ Filtered down to companies that actually match

                                                                                                                                                                                                         5. ✅ Contacts table created with:

                                                                                                                                                                                                            * right decision-maker titles

                                                                                                                                                                                                            * valid emails (waterfall used where needed)

                                                                                                                                                                                                               6. ✅ Spot-check a few random rows:

                                                                                                                                                                                                                  * Company truly matches the weird criteria

                                                                                                                                                                                                                  * Person is relevant

If yes across the board → you’ve built an Advanced Lead List properly.

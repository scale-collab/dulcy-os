# Dulcy Campaign Workflow SOP (Default)

Use this as the default campaign creation process for Dulcy campaign builds.
This workflow supersedes older campaign workflows and is the primary source of truth.

Workflow modes:
- `full_campaign`
- `lead_list_only`
- `contact_list_only`
- `copy_only`
- `bison_only`
- `qa_only`

Natural language should map to workflow operations.
Examples:
- "build a campaign from this thesis"
- "create a lead list for this ICP"
- "continue the campaign setup"
- "where are we on this campaign"
- "just make the lead list"
- "score this list"
- "prep this for bison"

1. Airtable Campaign Calendar
- Create/read campaign record.
- Campaign name format: `[CLIENT] ICP, Filters, Location, Database (campaign type)`.
- Pull fields: client, campaign approach, lifecycle, estimated launch date, campaign prep date, campaign thesis, raw scripts.

2. ICP + Database Selection
- Determine best lead database.
- Default to DiscoLike unless campaign says otherwise.
- Generate baseline ICP from thesis, offer, onboarding form, and notes.
- Use lookalike domains, homepage keywords, filters, location, employee range, and database type.

3. DiscoLike Company List
- Start with 100 companies.
- Score ICP fit.
- Require ~80–85%+ usable before scaling.
- Scale stages: `100 -> 1,000 -> 10,000`.
- Store QA: Tier 1, Tier 2, Cut, usability score.

4. Contact List Creation
- Find contacts at target companies.
- Prioritize decision-makers (growth, marketing, executive, owner/founder, similar roles).
- Score contacts using Tier 1 / Tier 2 / Cut.

5. Google Sheet Processing
- Export companies to tab `companies`.
- Extract generics to `raw generic emails`.
- Upload directs to `raw direct emails`.
- After verification, keep `final generic emails` and `final direct emails`.
- Apply company-name cleanup formula.
- Duplicate company name for generic emails where needed.

6. Verification
- LeadMagic for direct contacts.
- MillionVerifier for direct + generic.
- Manual Sheets cleanup.

7. Airtable Lead List Creation
- One lead-list record per campaign (same name as campaign).
- Attach client, row count, CSV.
- Add Google Sheet share link in notes.
- A lead list can include both direct + generic emails.

8. Copy + Spintax
- Generate spintax from raw scripts.
- Do not spin variables like `{FIRST_NAME}` or `{COMPANY}`.
- Keep variants conversational and grammar-safe.
- Run EmailGuard spam check and flag risky words.
- Require manual review before final upload.

9. Email Bison Campaign Creation
- Create campaign.
- Upload lead list and map variables.
- Upload cleaned copy.
- Remove formatting.
- Attach client signature.
- Select email accounts.
- Set campaign settings.
- Test campaign.
- Launch only after confirmation.

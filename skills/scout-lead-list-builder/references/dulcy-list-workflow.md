# Dulcy Lead List Workflow

## Contents
- Operational precedence
- Table of contents
- 1. Source inputs
- GTM targeting and variable evidence
- 2. Company discovery
- 3. DiscoLike query construction
- 4. Company QA and scaling
- 5. Contact discovery
- 6. Email enrichment and verification
- 7. Google Sheet structure
- 8. Airtable handoff
- 9. Existing-client exclusions
- 10. Troubleshooting low usability


## Operational precedence

Use Airtable (`airtable-campaign-lead-list-center`) for managed stage controls and current provider sequence. Its current default is at most five contacts per company; test contacts from the first 100 companies and assess company/contact fit separately. Run MillionVerifier through the managed flow before configured recovery/enrichment, inspect existing jobs before reruns, and complete final QA. Historical enrichment ordering below describes capabilities, not an alternate execution path. Quality gates do not authorize scaling or spending.

## Table of contents
1. Source inputs
2. Company discovery
3. DiscoLike query construction
4. Company QA and scaling
5. Contact discovery
6. Email enrichment and verification
7. Google Sheet structure
8. Airtable handoff
9. Existing-client exclusions
10. Troubleshooting low usability

## 1. Source inputs

Build the list from the campaign thesis, client offer, onboarding form/notes, relevant case studies, and any historical campaign knowledge.

The core company definition should answer:
- What does the company actually do?
- What publicly visible signals prove it belongs to the ICP?
- What size/geography constraints matter?
- What adjacent categories look similar but should be cut?

Use public, verifiable data. Do not make lists around private or unstable claims such as an exact marketing budget unless a reliable source explicitly provides it.

## GTM targeting and variable evidence

Use Atlas's current GTM brief and same-client promise version. Separate the recipient/client ICP from the end-buyer segment a customer-acquisition offer would help that recipient reach. For both relevant sides, define company/product fit, responsible buyer, geography/coverage, exclusions and a credible accessible source. Do not create a second list or commission enrichment merely because the strategy mentions downstream buyers; execute only the authorized scope.

Use relevant public business directories, exhibitor lists or official records when they can establish an actionable fact better than generic firmographics. Verify entity matching, source date, meaning and usability. Event attendance is not evidence of event dependence; a regulator listing is not proof of purchasing need. Do not infer private health conditions or target individuals from medical/adverse-event data. Preserve the approved provider order, spend limits, manual review and no-extra-paid-contact-review rule.

Before sourcing personalization, define a compact variable contract with Atlas/Scribe: semantic purpose; authoritative source/date; observed fact vs hypothesis; permitted wording; type; actual supported platform field/token; required/optional status; null/fallback/hold rule. Buyer segment, relevant use case, territory and verified event context are illustrative concepts, not predetermined backend field names. Validate the current schema before adding/exporting fields. Preserve raw evidence separately from normalized copy values and keep one entity ID across all joins.

Check variable source coverage on the managed sample before scaling. Do not silently backfill missing signals with invented growth, pain, buyer demand, existing conversations or completed work. For an optional signal, omit it or use an approved truthful segment-level fallback. Hold a row when a required value is unsupported or contradictory. Return coverage counts, unresolved values and representative rendered examples to Scribe; preserve deduplication, opt-outs, country exclusions, contact verification and existing gates. A good custom variable does not make a bad-fit lead eligible.

This is the application of the user's October 23, 2026 comprehensive-GTM/simple-script instruction and supplied Mitchell Keller transcript; Atlas's source-basis records its precise read scope. The transcript shows lead-specific context, not verified backend field names or automation.

### Signal states and cost

For a proposed business signal, preserve three states: observed with source/date; not observed within a specified checked source/window; unknown because access, coverage or freshness is insufficient. Even a completed public-source check does not establish the company has no activity. Ads, hiring, funding and site updates are facts to interpret, not automatic proof of growth, pain, budget or purchase intent. Missing or zero-scored optional signals must not silently exclude an otherwise good-fit company.

Ask Atlas whether the signal could change a decision enough to justify its incremental cost for this market, deal value and reachable pool. Check coverage and usefulness on the managed sample before proposing a bounded test. Do not buy a second contact-review pass or expand enrichment to resolve unknowns. Source: [Mitchell Keller, October 22, 2026](https://x.com/MitchellKeller_/status/2113284282072568192), full written post read October 23; the three-state safeguard is our adaptation, not the creator's validated scoring method. Historical conversion comparisons belong to Atlas, not a new Scout scoring engine.

## 2. Company discovery

Default to DiscoLike unless the campaign specifically calls for another source.

Good seed domains are:
- clearly inside the target sub-vertical;
- not diversified across unrelated services;
- rich in language that unmistakably describes the ICP;
- verified to be the correct company/domain.

Do not mix multiple sub-verticals in one seed set when they produce different semantic neighborhoods. Split them into separate discovery runs.

Use the first 100 companies for the managed sample. Review actual fit manually/semantically before any authorized expansion.

## 3. DiscoLike query construction

Use a positive, descriptive Lookalike/ICP text. Do not put long exclusion paragraphs into semantic ICP text because naming unwanted categories can pull the search toward them.

### Primary inputs
- lookalike text describing the exact company type;
- location;
- industry/category groups when they genuinely narrow the ICP;
- site language;
- verified lookalike domains;
- homepage text/phrase signals;
- hard domain exclusions.

### Homepage text
Homepage text is one of the most important precision controls.

Use exact phrases heavily when a phrase is an unmistakable ICP signal. Generic words create false positives.

Examples of noisy terms:
- maintenance
- 24/7
- generic service terms

Prefer phrases/products/services that a true ICP is likely to state explicitly.

Use negative homepage phrases or category exclusions for:
- directories;
- marketplaces;
- referral/lead-generation sites;
- adjacent categories repeatedly appearing in QA.

Use hard domain exclusion lists for repeat offenders that semantic/category controls do not reliably remove.

Do not use generic storefront terms such as "shop now" or "free shipping" as meaningful positive ICP signals.

## 4. Company QA and scaling

Review the sample and label each company:
- **Tier 1** — clear ICP fit; strongly aligned.
- **Tier 2** — usable fit; belongs in campaign but less ideal.
- **Cut** — should not be contacted for this campaign.

Calculate usability as Tier 1 + Tier 2 divided by reviewed companies.

Rules:
- 80%+ = passes the usual quality threshold; expansion still requires review and authorization.
- 85%+ = preferred quality evidence; scaling still requires the managed review gate and authorized size.
- Below 80% = refine before scaling.

When reviewing ambiguous names, open the website rather than judging from the company name alone.

Use bad-fit patterns found during QA to improve:
- homepage exclusions;
- category exclusions;
- seed selection;
- required phrases;
- hard domain exclusion lists.

Similarity score is low-trust compared with actual company evidence. Digital-footprint score matters mainly for online-heavy ICPs; a high digital footprint may be normal for agencies but can be suspicious for a local-trade ICP.

Scale progressively after QA: 100 -> 1,000 -> larger production volume such as 10,000 when needed.

## 5. Contact discovery

After company QA passes, create contacts for the accepted companies.

Use descriptive persona text such as:
"Senior leader responsible for the company's growth and commercial decisions; owns marketing/sales strategy, vendor selection, budget, and revenue outcomes."

Adjust the persona to the offer. Examples:
- marketing/growth offer -> growth, marketing, founder/executive leaders;
- finance offer -> finance/executive leaders;
- safety/compliance offer -> safety/operations/executive leaders;
- recruiting/staffing offer -> owner/president plus branch/recruiting leaders who actually run the desk.

Hard filters decide eligibility. Persona-profile text should rank qualified people, not replace seniority/department/title requirements.

### Company-size logic
- very small/local: owner/founder/president/CEO/managing member/principal first;
- small companies: include the next credible senior decision maker if coverage would otherwise be too thin;
- mid/large: executive, VP, director, and relevant functional leaders;
- senior/manager levels are conditional on offer and org size.

Default to at most five contacts per company. A larger cap requires explicit campaign scope; never interpret the quality score as permission for unlimited coverage.

QA contacts separately from companies. A good company with the wrong person is still an unusable lead.

Current user correction, October 9, 2026: after provider contact search, use the returned evidence and the manual review queue, not a second paid AI/web-research qualification pass. Keep ambiguous potentially suitable contacts in **NeedsReview**, with manual **Approve / Reject / Leave pending**. Do not turn plausible fit into automatic approval or pay for another research stage to clear the queue.

Hand the recorded choices and stable contact/list identities to Airtable’s **Apply contact decisions**. That step applies manual decisions only; it must not research contacts, infer missing decisions or rerun search. A row number or shared display name is not sufficient identity. Unmatched/conflicting identities and blank/undecided/Leave pending entries remain pending. Preserve the original evidence and manual choice, and verify matched results before claiming application succeeded.

Continue required verification, exclusions, suppression and existing QA. Manual fit approval does not cure an invalid address or authorize an excluded contact. Separately approved recovery or campaign-variable enrichment is not permission to reintroduce this prohibited second contact-review pass.

## 6. Email enrichment and verification

For people and company/generic emails:
1. Use the approved contact source for names, roles, domains and available addresses; keep direct and generic types distinct.
2. Run MillionVerifier first through Airtable’s managed flow on available addresses; check existing job status rather than resubmitting a waiting run.
3. Use configured recovery/enrichment such as LeadMagic only when needed, supported by the campaign and authorized; verify recovered addresses according to the current managed workflow.
4. Treat catch-all/risky as unconfirmed, then complete variable enrichment and final QA where required.

Do not treat generic emails and direct emails as separate lead-list records in Airtable. They normally belong to the same campaign lead list.

## 7. Google Sheet structure

Dulcy's operational sheet commonly contains:
- `companies`
- `raw generic emails`
- `raw direct emails`
- `final generic emails`
- `final direct emails`

Additional valid/catch-all sheets may exist when useful.

Typical processing:
- company records go to `companies`;
- generic emails extracted from company data go to `raw generic emails`;
- raw people/contact rows go to `raw direct emails`;
- LeadMagic results + verification feed `final direct emails`;
- verified generic results feed `final generic emails`.

Clean company names for outbound use. Duplicate company name into generic-email rows where needed for campaign variables.

Preserve campaign-specific personalization fields requested by the copy/campaign operator.

## 8. Airtable handoff

Use Airtable’s managed workflow to create or reuse one Lead List Creation record per campaign/list with the same campaign name when possible. Do not directly alter workflow statuses or approval checkboxes as a substitute for managed controls.

Populate available fields such as:
- name;
- total rows;
- client;
- CSV attachment;
- Google Sheet share link in lead-list notes or equivalent field.

Use the campaign naming convention supplied by the campaign operator. Do not invent a second naming system.

## 9. Existing-client exclusions

Before scaling an existing client's list, apply available exclusions from:
- previous campaign/company lists;
- existing clients;
- positive replies;
- manually maintained exclusion lists.

Use a persistent domain exclusion list for repeat bad-fit domains.

Deduplicate identities without erasing their campaign/list memberships. Before claiming “never contacted” or clearing an exclusion, verify source, client/workspace, date range, pagination and freshness; missing partial history is unresolved, not net-new. Airtable’s `references/operations-automation.md`, “Contact membership and history coverage,” owns the canonical checks and Josh Whitfield source basis. This does not authorize reactivation, new data access or workflow changes.

When topping off a winning campaign, replicate the winning ICP rather than redesigning targeting from scratch.

## 10. Troubleshooting low usability

If usability is low:
1. Check seed domains first. Wrong or mixed seeds can dominate every other signal.
2. Remove negative/exclusion language from semantic ICP text.
3. Remove overly broad positive categories.
4. Replace generic homepage terms with unmistakable ICP phrases.
5. Make product/service phrases required when appropriate.
6. Add hard domain exclusions for repeat offenders.
7. Split mixed sub-verticals into separate runs.
8. If the query has become overcomplicated, restart from a clean baseline and add only proven filters.
9. Re-pull a small sample and repeat QA before scaling.

Never solve low usability by blindly adding more filters without examining which signal is causing the bad matches.

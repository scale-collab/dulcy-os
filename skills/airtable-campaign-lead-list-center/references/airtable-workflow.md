# Dulcy Campaign Center and Lead List Center walkthrough

Source: user-provided Loom transcript, October 2, 2026. This is a faithful timestamped operational digest, not a verbatim transcript. The user explicitly requests a reusable skill for all Dulcy campaign/list work. Product transcription corrections: Dulcy, EmailBison, DiscoLike, DiscoGen, ContaGen, MillionVerifier, Lead Magic, spintax. Preserve actual UI labels as observed.

## Contents

1. Campaign Center overview (00:01–02:42)
2. Campaign creation (02:55–08:06)
3. Copy, approval, sequence (08:06–11:53)
4. Senders initial inspection (12:01–13:08)
5. Source & ICP (13:13–22:51)
6. Company review and expansion (22:51–27:28)
7. Contact Review (27:38–34:18)
8. Verification (34:18–37:39)
9. Enrichment and QA (37:39–39:49)
10. Final sender allocation and settings (39:49–42:53)
11. Analytics and ongoing operation (43:15–44:53)

## 1. Campaign Center overview (00:01–02:42)
- Select active client; Show Hidden History exposes older/legacy campaigns and clients for prior evidence. Search/filter as needed.
- Create New Campaign and Sync with Bison controls. Transcript says overnight sync approximately 2–3 a.m., uncertain; verify current UI timestamp instead of guaranteeing freshness. Manual sync refreshes metrics.
- Account states: Available means usable unallocated capacity; Sending is active; Releasing Soon starts after campaign exceeds 60% completed; Reserved Next means those releasing accounts allocated to a next campaign; Disconnected should be investigated and old unused accounts removed only within authorized scope; Warming identifies accounts with less than 14 days warmup. All accounts continue warming normally.

## 2. Campaign creation (02:55–08:06)
- Create New Campaign auto-populates client. Name includes who targeted, base filters, geography, source, and strategy/approach. Example only: Florida marketing agencies, 1–50 staff, Florida US, DiscoLike, direct offer. Do not reuse Florida/agency filters for unrelated campaigns.
- Initial Targeting Sentence is campaign thesis: why run, expected outcome, audience, offer, and supporting past metrics for subsequent campaigns. Example proximity/lunch offer and historic 50% positive-interest/6% reply are example assertions, never general proof.
- Build or connect a lead list normally Yes. Create new or connect an existing list. For an existing list, make it first in Lead List Center; attaching later is possible. Create List produces matching campaign/list names in both centers.
- Campaign prep date today; realistic estimated launch date based on work readiness; select Campaign Approach matching title/thesis. Lead-list link may initially be empty. Continue to Copy.

## 3. Copy, approval, sequence (08:06–11:53)
- Reuse relevant proven client/vertical copy where appropriate; generate new if not.
- Client-facing Copy contains readable text, no spintax, and no manually added signature because system populates signature.
- Split tests use explicit Variant 1, Variant 2, Variant 3 above each greeting/body; same convention for each step.
- Typically three steps, occasionally two; four rarely for small TAM. Thread reply defaults on for follow-up steps unless deliberate approved strategy says otherwise.
- External clients: Send for Approval and wait. Dulcy's own campaigns may use Skip Approval and Prepare after required checkbox; this UI step does not override user authorization boundaries.
- Sequence imports approved copy automatically; if needed Refresh from Approved Copy, inspect variant count, and confirm. Verify step count, delays, thread-reply toggles. Blank follow-up subject is expected when replying in-thread.
- Generate and Validate Spintax, confirm, monitor automation status/run/elapsed time, inspect completed variants. Sender setup can be reviewed while running, but don't estimate allocation before final list count.

## 4. Senders initial inspection (12:01–13:08)
- Sync Bison Senders if stale, inspect states, delay final allocation until lead list complete.

## 5. Lead List Center: Source & ICP (13:13–22:51)
- Select matching client/list. Overview requires no action. Open Source & ICP and verify/edit Targeting Sentence (thesis).
- Generate Filters is a starting point only. Watch automation complete, then manually inspect each resulting include/exclude field.
- Employee range appropriate to client. Business model include/exclude. Country and state/region include/exclude.
- Revenue optional, primarily when employee count unreliable; not an automatic added restriction.
- Digital footprint optional and context dependent: transcript examples minimum 50–75 for presence, roofers/plumbers maximum 450–550. These are examples, not universal defaults.
- Founded before/after generally unused unless requested.
- Lookalike text describes desired company in plain language. Homepage keywords: up to 20, one clause per line. Explain observable/query-supported semantics: unquoted words broad OR; quoted phrase exact adjacent phrase; + combines required terms/phrases; parentheses may group alternatives. Verify provider syntax before advanced expressions.
- Include/exclude keywords remove actual observed bad fits; promotional-products businesses excluded only for relevant marketing-agency ICP, not all lists. Avoid directories/referral networks only when unsuitable for actual target.
- Industry groups: green include, red exclude; clicking cycles. Inspect generated settings carefully. Transcript example removed SaaS for an agency-only campaign; broad cross-industry lists must not inherit that exclusion.
- Lookalike domains can seed searches; similarity isn't fit proof.
- Technology Stack include/exclude only if requested hard filter. Otherwise collect technology as optional enrichment. Examples Shopify/WooCommerce.
- Social/mobile presence filters target actual apps/social signals. Do not approximate app presence via noisy download/app keywords if presence filters exist.
- Site language defaults English; alter for client need. Optional subdomain text include/exclude.
- Advanced matching: domain consensus, industry variance, minimum similarity, include query domains, profiles with redirects. Default skip redirects per walkthrough; inspect impact on actual ICP. Transcript explicitly says provider meaning of some advanced filters should be double-checked.
- Advanced Edit Exact DiscoLike API JSON shows outgoing request. Validate it matches visible form and thesis.
- Run First 100 Companies only after settings reviewed. Monitor automation.

## 6. Company review and expansion (22:51–27:28)
- Scaling progression examples: 100, 1,000, 4,000, 10,000, 20,000, 30,000 or custom. Expand deliberately only after sample review and authorization/gates; never equate company count to final contacts.
- Usability goal 80–85% or better. Larger lists can have lower rate but enough usable volume; retain only good fits, explain tradeoff. Do not pass visibly mismatched criteria simply because a score appears.
- Tier 1 clear fit; Tier 2 plausible/on-fence; Tier 3/Cut not fit. Inspect counts, summary, raw sample and AI review in linked Google Sheet.
- Approve Expanded Company List checkbox required before corresponding expansion button/custom size. Existing user review instructions still apply; checkbox alone is not human approval.
- Low usability: inspect actual reasons, edit incorrect filters or Regenerate Filters (uses review feedback), rerun sample. Reset to Latest Reviewed Sample is recovery, rarely needed; preserve current work and avoid blanket reset without reason.
- Optional Deeper Qualification / Use DiscoGen Deep Review exposes default prompt. Verify it reflects current client, thesis and actual target; never inherit unrelated industry cuts. Add specific objective optional requirements only when needed. Use explicit cities if county/location definition ambiguous. Final review shows outgoing prompt; check criteria reviewed/conflicts resolved checkbox and Save Review. Subsequent expansion uses this approved criteria.

## 7. Contact Review (27:38–34:18)

Current user correction, October 9, 2026: use provider search results and manual review rather than a second paid contact-research stage. This supersedes older generic/deep-review wording for post-search contact review; company-stage qualification and separately authorized email verification/necessary enrichment remain distinct.

- Do not run a second paid AI/web-research pass after the provider contact search to adjudicate ambiguous contacts. Preserve the returned evidence and the uncertainty. Potentially suitable but ambiguous contacts stay **NeedsReview** for manual **Approve / Reject / Leave pending**.
- **Apply contact decisions** is a decision-application step only: apply recorded manual Approve/Reject choices by verified contact identity within the correct client/list. Do not join by row position or display name alone. If identity mapping is missing, conflicting or ambiguous, leave the affected decision pending and report it rather than guessing.
- Leave blank/undecided/Leave pending entries pending. Do not generate decisions or start paid AI/web research, another provider search, or automatic approval from Apply. Reapplying the same decision must not create duplicate contacts or paid runs; reconcile the existing result before retry.
- Preserve contact/company QA, verification, exclusions, suppression and downstream approval gates. A manual fit approval does not override a failed email check or make an excluded contact sendable. A saved instruction or edited route is not proof of deployed behavior; verify actual execution and matched results before reporting the Apply route restored.

- Role Focus preset or Custom Persona in plain language describing responsibilities and buying authority, not an unrelated list of titles. Apply actual client requested roles.
- People per Company default 5, often 5–10; it's a maximum, not guaranteed yield.
- Seniority optional: mapping may misclassify founders. Use role authority plus company size and observed evidence rather than brittle defaults.
- Contact country/region separate from company location. Set when requested; otherwise do not silently exclude appropriate remote leaders.
- Advanced Contact Source default DiscoLike. DiscoLike + ContaGen is more expensive; use for hard-to-find roles/industries when warranted and authorized, not automatically.
- Exclude SEGs only when prior campaign evidence supports a specific gateway restriction. Spam Center bounce analytics can inspect provider/code and campaign. Transcript Mimecast example isn't a blanket ban. Bounce-code simplifications in transcript must not be treated as definitive SMTP diagnosis.
- Test Contacts from First 100 Companies (company count, not contact count). Inspect usability/Tiers/contact sample.
- Approve Contact Sample checkbox before expanding. Expand against approved usable company count, not rejected companies. Example: 3,988 reviewed / 3,921 usable means 3,921 eligible companies for contact pulls.

## 8. Verification (34:18–37:39)
- Direct vs Direct+Generic selected based on how targets operate. Corporate marketing targets usually Direct. Generic can make sense for local businesses whose owners actually monitor shared inboxes. Keep direct/generic separate. No assumption all generic addresses are personal buyers.
- MillionVerifier first; optional Lead Magic Recovery later or in configured flow. Do not classify catch-all as confirmed deliverable.
- Recovery especially for constrained TAM with many Risky/catch-all results; not automatically needed when enough Good emails. Walkthrough examples 80% Good versus 30% Good are contextual decisions, not fixed guaranteed thresholds.
- Run MillionVerifier First once. Transcript range 15–60 minutes is an estimate, not SLA. If workflow times out/waits, Check Status on existing job rather than resubmit/repurchase.

## 9. Enrichment and QA (37:39–39:49)
- Standard name/company/title/LinkedIn fields expected from list pipeline. Enrichment adds campaign variables (example city and real business-lunch restaurant) or requested optional technology.
- Write precise instructions, Prepare DiscoGen Prompt, review generated prompt, Run Approved Enrichment. Skip Enrichment only when unnecessary.
- Run Automated QA to find missing/invalid variables including literal Not Found values. Open Project Google Sheet and QA Review tab, research/correct flagged values, rerun QA to apply/recheck corrections. List complete only after QA/verification and meaningful checks passed.

## 10. Final sender allocation and settings (39:49–42:53)
- Return campaign Senders when list finished. Apply Selected Senders shows MAXIMUM appropriate accounts, not minimum. Use available/releasing soon capacity while avoiding idle days/collisions.
- Consider final lead count, each account's actual daily cold limit, number of steps, and delays. Transcript example 15 sends/account/day, 100 accounts = 1,500/day; 3,000 leads fills two initial-touch days with two-day followups, but 1,500 leads alone would leave day 2 idle. Validate real sequencing/sending behavior; don't blindly substitute simplistic capacity formula.
- Can adjust selected accounts for existing campaign topups with authorized Update Campaign Senders. Inspect selected count / daily volume / status.
- Settings usually Mon–Fri for corporate; weekends only when audience/approved strategy appropriate. Max Emails and Max Leads per day must align with actual account capacity, avoid unintentionally halving it. Randomize sensible start/end times, correct campaign timezone and date(s), select plain text.
- Create and Upload Campaign Outputs to EmailBison, monitor import, inspect generated spintax/variables/leads in EmailBison. Launch only with required user/client approval and readiness, through authorized UI. Do not infer launch authority from a request merely to prepare list/copy.

## 11. Analytics / ongoing operation (43:15–44:53)
- At 60% campaign completion review summary / recommended next steps / reply findings / evidence limits / questions / sources for next campaign.
- Inspect verifier performance, bounce rates by verification provider, sequence and variant performance, and sample adequacy before declaring winners.
- Overview after launch shows status / lifecycle / recommended next move / client-agency comparisons / KPI ranges / total stats / progress. Refresh underlying data if needed. Use findings to plan appropriate next campaign/list rather than blindly repeating.


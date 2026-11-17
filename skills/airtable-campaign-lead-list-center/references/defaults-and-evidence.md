# Defaults, examples, and evidence limits

Use this distinction to apply the walkthrough accurately without copying its demonstration into every campaign.

## Source and confidence

The workflow derives from the user's Loom walkthrough supplied in the conversation on October 2, 2026. The timestamped reference is a faithful operational digest rather than a verbatim transcript or independently verified product manual. Product names with obvious transcription errors were normalized to Dulcy, EmailBison, DiscoLike, DiscoGen, ContaGen, MillionVerifier, Lead Magic, and spintax. Preserve observed live UI labels when spelling differs.

The user asked for this reusable skill at 22:04:56 UTC on October 2, 2026. That request authorizes creating the skill; the workflow itself does not grant permission for future external actions.

Known interface entry point, sourced from interface metadata: https://airtable.com/appxqINt5XKw7a76A/pag1PZd6cHL42uBwg . Inspect the actual page and current session before operating it. No credentials, client-specific prospect lists, or transient campaign state belong in this skill.

## Workflow defaults and invariants

- Match records to the correct client and existing campaign/list; preserve history and linkage.
- Maintain an explicit thesis, meaningful name, and reviewed settings rather than accepting generated output blindly.
- Use a first company sample of 100, then a separate contact test from the first 100 companies.
- Review company and contact fit independently. Aim for 80–85%+ usable fit and preferably 85%+ for scaling. A lower-quality large-pool exception requires explicit tradeoff review, not a silent pass.
- Review prompts and outgoing settings before expansion; satisfy review gates and the user's additional approval requirements.
- Client-facing copy excludes spintax and a manual signature. Sequence contains the prepared and validated execution form.
- External-client copy approval is required; Dulcy-owned campaigns have a skip-client-approval branch.
- Follow-up thread replies are enabled by default; blank follow-up subject can be intentional.
- Three sequence steps is typical; two can be appropriate; four is unusual and conditional.
- English site language, skipping redirect profiles, DiscoLike contact source, and 5 people per company are demonstrated defaults, subject to the current brief and verified UI behavior.
- Check existing verification-job status instead of blindly rerunning a paid job.
- Allocate senders only after final usable list count; account for follow-ups and real per-account limits.
- Corporate weekday sending and plain text are demonstrated settings, not substitutes for the actual campaign schedule/authorization.

## Examples that must not become global targeting or promises

- Florida marketing agencies, 1–50 employees, direct-offer strategy, geographic proximity, and a lunch invitation belong to the demonstration.
- Historical 50% positive interest or 6% reply claims are illustrative, not evidence for a different campaign or guaranteed outcomes.
- Removing SaaS or promotional-product companies fits an agency-only example; never apply those cuts automatically to broad or cross-industry lists.
- Digital-footprint minima around 50–75 or roofer/plumber maxima around 450–550 are contextual illustrations, not universal filters.
- Shopify/WooCommerce are possible technology examples. A technology bonus is enrichment, not a hard gate, unless the brief explicitly makes it one.
- A city or restaurant variable is useful only for relevant copy; do not enrich unrelated lists with it.
- A Mimecast/SEG example is not a blanket gateway exclusion.
- Verification yields of 80% Good versus 30% Good illustrate different recovery decisions, not fixed thresholds or provider guarantees.
- The 15 sends/account/day, 100 accounts, 1,500 daily sends, 3,000 leads, and two-day-delay scenario is arithmetic for the example only.
- Expansion sizes are selectable options, not a mandatory escalation ladder or permission to consume credits.

## Verify uncertain implementation claims

- Treat the estimated 2–3 a.m. overnight sync and 15–60 minute verification duration as unverified timing estimates. Inspect actual freshness/job status.
- Verify current DiscoLike keyword syntax and advanced-filter semantics against current provider documentation or visible help before making strong claims. Do not describe an invented search engine or assume similarity equals fit.
- Diagnose bounce codes from the actual full error, provider, campaign, and current evidence. Simplified transcript examples are not authoritative SMTP guidance.
- Treat warmup age, Available, Releasing Soon, or an AI recommendation as inputs, not guarantees of sender health, capacity, or launch readiness.
- If a UI label or automation changed, map it to the intended stage using observed behavior; stop for the missing information if that mapping is uncertain. Do not bypass a safeguard with guessed API writes.

## Recover proportionately

Inspect current status and prior outputs before repeating automation. Use Check Status for the existing verification run; inspect active generation/import jobs rather than creating duplicates. Fix bad criteria and rerun a small sample before scaling. Reserve Reset to Latest Reviewed Sample for a justified, scoped recovery with its effects understood. Report the current stage, exact blocker, and smallest next action when unable to proceed.

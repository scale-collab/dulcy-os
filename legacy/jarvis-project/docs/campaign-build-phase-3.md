# Campaign Builder Phase 3 — Company Pipeline

## Scope

Phase 3 makes the company-list pipeline canonical from approved strategy through final company-list approval. Ava remains workflow owner and Ryan remains the active specialist. Contact-generation behavior is not changed.

## Canonical flow

```text
company_sample_build
→ company_sample_qa
→ company_sample_refinement when required
→ company_list_review and sample approval
→ company_expansion
→ company_list_review and expanded-list approval
→ contact_generation
```

The final transition occurs only after an `approved_company_list` artifact is bound to the current expanded list, expanded QA, and requirements fingerprint.

## Canonical company artifacts

- `company_sample`
- `company_qa`
- `approved_company_sample`
- `expanded_company_list`
- `expanded_company_qa`
- `approved_company_list`

Artifacts are immutable and versioned. Requirement changes invalidate downstream artifacts and approvals. Legacy Ryan and DiscoLike fields are compatibility projections.

## Authoritative QA decision

Every company QA artifact has exactly one `qa_decision`:

- `expansion_ready`
- `manual_review_required`
- `refinement_required`
- `blocked`

The displayed recommendation, corrective state, approval gate, and expansion gate use this decision. Usability percentage alone cannot make a sample expansion-ready.

Refinement is required when any applicable condition is true:

- SOP consistency blocks scaling.
- Usability is below the configured expansion threshold.
- Tier 1 is zero while industry/evidence confidence is weak.
- Homepage positive signals are absent when transparency data is available.
- False-positive rate exceeds the SOP threshold.
- Required QA fields contradict one another.

Stale requirements or contradictory QA fields block the result.

## Tier 1 and Tier 2 contract

Tiering evaluates company fit, not decision-maker availability.

Tier 1 requires strong company-level ICP evidence: relevant industry/category, required geography and employee range, and strong positive homepage or category signals without material exclusion risk.

Tier 2 represents a plausible company fit that lacks one or more company-level confidence signals. Missing homepage content can keep a company in Tier 2. Missing contact-title confidence cannot, by itself, downgrade a company; that belongs to contact QA.

Cut is reserved for material company-level mismatch, exclusion signals, location or employee-range failure, duplicate/invalid records, or evidence that the company is the wrong business type.

The historical `Tier 1 = 0 / Tier 2 = 99–100` pattern can result from overly strict Tier 1 evidence, missing homepage extraction, broad queries, or incorrect bucketing. Phase 3 treats zero Tier 1 plus weak evidence as a refinement gate instead of recommending expansion based only on usability.

## Recovery

On reload, reconciliation:

- Restores the latest valid sample, QA, approval, expansion job, expanded list, and expanded QA.
- Repairs compatibility approval fields from canonical artifacts.
- Restores pending corrective and expansion stages.
- Invalidates stale approvals.
- Pauses when QA references a different sample or requirements version.
- Records reconciliation activity and blockers in the transition journal.

## Technical debt outside Phase 3

The separate Bison lead-upload fixture failures remain tracked outside this phase. Phase 3 does not modify Bison lead upload or contact-generation execution.

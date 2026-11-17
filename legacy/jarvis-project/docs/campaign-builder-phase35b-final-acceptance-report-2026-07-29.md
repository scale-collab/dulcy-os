# Campaign Builder Phase 3.5B Final Acceptance Report

Date: July 29, 2026  
Specification: `docs/campaign-builder-acceptance-specification.md`  
Boundary: real top-level conversation entry point; no internal commands, direct state edits, Contact Generation, or paid live provider calls

## Release decision

**NOT READY — do not begin Phase 4.**

Phase 3.5A removed the setup, partial-date, strategy-review bypass, and split-QA-persistence blockers. All ten setup scenarios now pass through the real top-level entry point, including subprocess restarts.

The complete release candidate still cannot be certified. The repository does not contain the deterministic provider fixture required by the acceptance specification. During the Phase 3.5B sample-build probe, `JARVIS_TEST_MODE=1` reused the existing live DiscoLike lead list `dl_20260722_231403_20bcb4`. Execution was stopped to avoid further mutation or paid/live activity. No downstream result produced from that store is counted as an acceptance pass.

## Before and after

| Area | Before | After | Finding |
|---|---:|---:|---|
| Setup conversations A01–A10 | 0/10 | **10/10** | Canonical missing-field routing is effective |
| Strategy review B01–B10 | 0/10 | **4/10** | Basic approval works; edits and casual intent remain inconsistent |
| Sample through final approval C01–G05 | 0/55 | **0/55 release-qualified** | Deterministic provider isolation is absent |
| Recovery H01–H12 | 0/12 | **0/12 release-qualified** | Setup restart works, but milestone restart fixture is absent |
| Diagnostics/corruption I01–I10 | 0/10 | **0/10 release-qualified** | Lower-level evidence exists; full transition comparison does not |
| Full simulations S01–S04 | 0/4 | **0/4** | All require the missing isolated provider/restart fixture |

Atomic acceptance result: **14 PASS, 83 FAIL/BLOCKED (97 total)**.  
Full simulations: **0 PASS, 4 BLOCKED**.

## Executed conversation findings

### Setup

A01–A10: **PASS**.

- One-turn input captured client, industry, strategy, prep date, and launch date.
- Incremental input retained only the actual missing fields.
- `11-200`, `today`, `Thursday`, `the 30th`, and `next Thursday` resolved in context.
- Invalid dates and launch-before-prep were rejected without storing invalid values.
- Restart restored the exact setup field and strategy-review decision.

### Strategy review

| Scenario | Result | Quality | Finding |
|---|---:|---:|---|
| B01 `approve` | PASS | 8/10 | Version-bound approval reached `company_sample_build` |
| B02 `yes` | PASS | 8/10 | Pending approval consumed |
| B03 `looks right` | FAIL | 4/10 | Returned the generic strategy menu |
| B04 employee edit | FAIL | 4/10 | Did not demonstrate the required before/after re-versioning |
| B05 Florida edit | PASS | 7/10 | Location and campaign metadata changed |
| B06 add positive signal | FAIL | 1/10 | Top-level response was empty |
| B07 add exclusion | FAIL | 3/10 | Returned the generic strategy menu; filter did not change |
| B08 combined edit | FAIL | 5/10 | Location changed, exclusion was not applied |
| B09 inspect Ryan filters | FAIL | 3/10 | Returned the generic strategy menu |
| B10 direct-offer change | PASS | 7/10 | Strategy changed and review remained active |

Primary remaining categories: NLP/intent, routing, conversation UX, and artifact lifecycle for requirement/filter edits.

### Company sample probe

Natural phrases such as `build the first sample`, `yes`, `go ahead`, and `build the first 100` reached the build/QA flow. `start building` did not consume the pending confirmation and repeated the parameter prompt.

These results are **not release-qualified** because test mode loaded an existing live lead-list ID and its existing 100-company/QA data. This violates deterministic isolation and the fixture-ID/live-state invariant.

### Downstream scenarios

C01–I10 and S01–S04 remain FAIL/BLOCKED as release acceptance:

- C: isolated provider, duplicate-page, fixture-ID, and failure-before-persistence fixtures unavailable.
- D: canonical QA persistence unit checks pass, but all authoritative QA conversations were not executed against the specified deterministic datasets.
- E: corrective routing has supporting smoke coverage, but no isolated v1-fail/v2-pass operator simulation.
- F/G: expansion, paid confirmation, timeout, de-duplication, expanded QA, and final approval cannot be safely executed.
- H: no process-level fixture checkpoints for QA, corrective rebuild, expansion, or six sequential restarts.
- I: no full runner compares each visible diagnostic with the persisted canonical snapshot, nor safely injects corruption through a migrated fixture.

## Supporting regression evidence

Passing:

- Phase 3.5A setup: 51 checks
- Top-level conversation manager: 115 checks
- Natural campaign conversation: 35 checks
- Canonical QA persistence: 15 checks
- QA command persistence: 14 checks
- Campaign conversation persistence: 43 checks
- Phase 3 company pipeline: 27 checks
- Natural dates: 19 checks
- Ava ownership: 29 checks
- Canonical workflow smoke
- Compilation

Failing legacy/supporting suites found during the audit:

- `smoke_campaign_builder_state_reset.py`: six requirement-change invalidation/metadata assertions
- `smoke_campaign_thesis_parser.py`: one stale response assertion
- `smoke_campaign_build_agent_delegation.py`: setup/planning and specialist-output assumptions
- `smoke_campaign_build_context_isolation.py`: missing-thesis blocker assumptions
- `smoke_campaign_build_conversation_orchestrator.py`: transactional transition now rejects a nonexistent build fixture

These lower-level results do not replace the 97 operator conversations.

## Workflow transition coverage

The taxonomy declares 19 stages and 110 legal directed transitions, including pause/failure recovery edges. There are 232 illegal directed transitions between distinct stages.

Current direct transition-test coverage:

- Legal transitions explicitly tested: `campaign_setup -> campaign_planning`, `campaign_planning -> campaign_strategy_review`, `campaign_strategy_review -> company_sample_build`, failed QA commit into `company_sample_refinement`.
- Illegal transitions explicitly tested and logged: `campaign_strategy_review -> contact_generation`.
- Restart proof: setup and strategy-review milestones only.
- Artifact-matched transition proof: strategy approval and QA completion only.

| Stage | Required forward edge | Directly tested | Restart tested | Artifact matched | Coverage result |
|---|---|---:|---:|---:|---|
| campaign_setup | campaign_planning | yes | yes | requirements only | partial |
| campaign_planning | campaign_strategy_review | yes | yes | plan | yes |
| campaign_strategy_review | company_sample_build | yes | yes | approved plan | yes |
| company_sample_build | company_sample_qa/refinement | QA writer only | no | QA | partial |
| company_sample_qa | refinement or expansion/review | no | no | no | fail |
| company_sample_refinement | company_sample_build | supporting smoke only | no | no | fail |
| company_expansion | company_list_review | supporting smoke only | no | expanded list/QA lower-level | fail |
| company_list_review | contact_generation | not acceptance-tested | no | final approval lower-level | fail |
| contact_generation | contact_qa | out of Phase 3.5 boundary | no | no | not covered |
| contact_qa | leadmagic/refinement | out of boundary | no | no | not covered |
| contact_refinement | generation/QA | out of boundary | no | no | not covered |
| leadmagic_enrichment | email_verification | out of boundary | no | no | not covered |
| email_verification | copy_generation | out of boundary | no | no | not covered |
| copy_generation | copy_review | out of boundary | no | no | not covered |
| copy_review | campaign_final_review | out of boundary | no | no | not covered |
| campaign_final_review | campaign_ready | out of boundary | no | no | not covered |
| campaign_ready | campaign_final_review | out of boundary | no | no | not covered |
| campaign_paused | resume to 18 stages | no exhaustive coverage | no | no | fail |
| campaign_failed | recover to 18 stages | no exhaustive coverage | no | no | fail |

### Transition topology defect

The current legal-transition graph has **no forward incoming edge into `company_expansion`** from the sample approval flow:

- `company_sample_qa` permits `company_list_review` or `company_sample_refinement`.
- `company_list_review` permits contact generation/refinement/setup, but not expansion.

Therefore the desired canonical path `company_sample_qa -> company_expansion` cannot be enforced by the state machine as currently declared. Lower-level code can only reach expansion by bypassing the transition authority or by using pause/failure recovery edges. This is a critical workflow violation.

The release gate requiring every legal incoming/outgoing edge, every illegal edge rejection, restart survival, and artifact persistence is not met.

## Root-cause classification

### Critical

1. Provider integration/state isolation: test mode can reuse live DiscoLike state.
2. Business rule/state machine: no canonical forward transition into company expansion.
3. Acceptance infrastructure: deterministic provider, restart, timeout, duplicate-page, calendar, and corruption fixtures are absent.

### High

1. NLP/routing: casual approval and filter-edit intents fall back to the generic strategy menu.
2. Artifact lifecycle: positive/negative search-criteria edits are not consistently persisted and re-versioned.
3. Recovery: downstream restart milestones remain unexecuted.

### Medium/polish

1. Ava is canonical owner internally, but normal responses still prominently introduce Ryan.
2. Parameter confirmation remains mechanical and repetitive.
3. One supported build synonym (`start building`) does not consume the pending build decision.

## Scores

- Conversation quality: **5/10 overall**; setup alone **9/10**
- Architecture: **6.5/10**
- Production readiness: **Not ready**
- Critical blockers: **3**
- Workflow violations: **1 confirmed topology defect**
- Persistence inconsistencies: **1 confirmed test/live isolation violation**

## Required next action

Remain in **Phase 3.5B**. Do not begin Contact Generation.

The next release-candidate rerun requires an audit-only, isolated acceptance environment:

1. Separate temporary stores for conversation, campaign builds, DiscoLike lists, provider checkpoints, and calendar fixtures.
2. Deterministic sample v1, refined sample v2, expanded list, timeout, repeat-page, and provider-failure fixtures.
3. A real subprocess restart runner for all milestone scenarios.
4. A corrected, explicitly tested canonical expansion path.
5. Strategy-review intent coverage for casual approval and persisted positive/negative filter edits.

Only then can all 97 conversations and four simulations be executed without contaminating live state.

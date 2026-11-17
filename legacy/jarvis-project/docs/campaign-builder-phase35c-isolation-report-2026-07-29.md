# Phase 3.5C Release Isolation Report

Generated: 2026-07-29  
Release boundary: final company-list approval; Contact Generation not executed

## Release decision

**Phase 3.5C infrastructure gates: PASS.**  
**Full Campaign Builder release acceptance: NOT YET COMPLETE.**

The isolation, deterministic provider, state-machine, restart, and production
footprint proofs now pass. The four end-to-end simulations pass through the real
top-level conversation entry point. The complete set of 93 atomic conversations
has not yet been automated and rerun as individual release cases, so this report
does not authorize Phase 4.

## 1. Provider isolation

Result: **PASS**

- `acceptance` and `fixture` cannot resolve DiscoLike, Airtable, or EmailBison
  production credentials.
- Airtable and EmailBison provider factories reject fixture-backed execution.
- DiscoLike fixture traffic is routed before any live HTTP request.
- Live provider assertions fail closed and write a non-production audit entry.
- Invalid `JARVIS_EXECUTION_ENV` values raise an error; they never fall back to
  production.
- Acceptance artifact stores resolve under the explicit isolated environment
  root and reject the production store paths.
- Calendar interruptions use the acceptance calendar fixture and report that no
  external calendar was changed.

## 2. Deterministic fixture replay

Result: **PASS**

- Identical DiscoLike requests select the same fixture keys.
- Responses have identical response fingerprints.
- The initial sample deterministically contains agency/SaaS false positives.
- The refined sample deterministically contains event-marketing and
  experiential-marketing evidence.
- A persisted fixture checkpoint survives process restart.
- A continuous conversation and a restart-after-every-turn conversation produce
  the same stage and semantic workflow fingerprint after every turn.
- Generated record IDs, artifact IDs, QA IDs, approval IDs, and timestamps remain
  traceable metadata but are excluded from semantic artifact identity.

## 3. Workflow transition coverage

Result: **PASS**

| Measure | Result |
|---|---:|
| States reachable | 19/19 |
| Legal transitions covered | 112/112 |
| Illegal transitions rejected | 230/230 |
| Distinct-stage matrix | 342/342 |
| Legal-edge restart recovery | 112/112 |
| Stage restart checkpoints | 19/19 |
| Dead-end states | 0 |
| Orphan states | 0 |

Detailed evidence: `docs/campaign-workflow-transition-coverage-2026-07-29.md`.

## 4. Production footprint

Result: **PASS for the isolated Phase 3.5C run**

| Production store | Count before | Count after | Hash before | Hash after |
|---|---:|---:|---|---|
| campaign builds | 3 | 3 | `d61c8714cbf8fe197c956ea27cac4d8d4f13535fbdf771bac3d4470d806d188a` | identical |
| conversation state fields | 201 | 201 | `1605759e1a066de999444c39e0413f3331827e3cf9800549fa40c5634892da0e` | identical |
| DiscoLike lead lists | 2 | 2 | `e2781322651fa9c727425404fcd8937d87185c597be9ca4230de6dc7f8cc24ad` | identical |

Provider audit inside the isolated run:

- External provider requests: 0
- Paid provider jobs: 0
- Production provider mutations: 0
- Fixture requests: greater than 0 and fully audited

The campaign-build hash covers canonical QA persisted with campaign builds. The
lead-list hash covers list-bound QA projections. Both remained byte-identical.

### Development-run disclosure

Before the legacy state-reset smoke was environment-bound, it was executed once
during this implementation session. That smoke calls conversation-state reset,
and no pre-run hash was captured around that individual invocation. It may have
reset the production conversation-state projection even though it did not change
campaign builds or lead lists. The exact prior conversation state cannot be
reconstructed from available evidence, so the broader development session cannot
be certified as zero-footprint.

The test now establishes an acceptance environment root before importing any
workflow module. Subsequent isolated runs have byte-identical production
before/after hashes. This disclosure remains a release blocker until the operator
confirms the current production conversation state is acceptable or restores it
from an external backup.

## End-to-end simulations

| Simulation | Result | Evidence |
|---|---|---|
| S01 failure, refinement, expansion, final approval | PASS | Natural setup, failed QA, explicit refinement, passing QA, approval, expansion, final handoff |
| S02 requirements change | PASS | Version and fingerprint increment; sample, QA, and approval invalidated |
| S03 calendar interruption | PASS | Fixture calendar executes; campaign stage survives restart and resumes |
| S04 timeout and restart | PASS | Expansion checkpoint persists; same job resumes; duplicate source IDs removed |

All simulations use `handle_conversation_turn`. No internal command or direct
state edit is used to advance the operator workflow.

## Regression results

- Phase 3.5C isolation: PASS, 100 checks
- Phase 3.5A setup: PASS, 51 checks
- Campaign build QA persistence: PASS, 14 checks
- Canonical QA persistence: PASS, 15 checks
- Campaign state reset: PASS, 20 checks
- Conversation manager: PASS, 115 checks
- DiscoLike SOP: PASS, 45 checks
- Compilation: PASS

## Root causes corrected

1. Environment selection previously controlled fixture use but did not make
   production credential resolution impossible.
2. Provider factories and some direct REST helpers could still be instantiated
   outside production.
3. Generated IDs and timestamps leaked into canonical artifact fingerprints,
   making semantically identical restart runs look different.
4. The transition graph omitted the legal QA-to-expansion and
   refinement-to-QA edges.
5. A legacy state-reset smoke was not explicitly environment-bound. It now
   creates its own acceptance root before importing workflow modules.

## Remaining release blocker

The acceptance specification contains 93 atomic conversations plus four
simulations. The four simulations are now green, but the 93 atomic cases have not
all been executed as independently reported scenarios against the new fixture
runner. A passing infrastructure smoke—even one with 100 assertions—is not a
substitute for 97 scenario results.

Required next action: implement the table-driven operator-conversation runner,
execute A01 through I10 individually, capture per-scenario workflow fingerprints
and conversation-quality fields, and rerun the production footprint comparison
around that complete run.

Until that report is green:

- Production readiness: **Not Ready**
- Phase 4 Contact Generation: **Not authorized**
- Campaign Builder architecture freeze: **Not started**

# Jarvis Campaign Build Stabilization — Phase 1 Audit

Date: 2026-07-28  
Scope: Architecture audit and canonical state-machine proposal only  
Implementation status: No campaign runtime behavior changed in this phase

## Executive finding

The campaign workflow is substantially implemented, but it does not have one authoritative workflow state.

Four overlapping representations currently determine progress:

1. `campaign_conversation_state.json`
   - `current_step`
   - `next_action`
   - `pending_fields`
   - workflow-owner and specialist flags
   - Ryan/contact/corrective state
2. `campaign_builds.json`
   - the legacy monotonic `status` ladder
   - duplicated conversation, list, contact, enrichment, verification, copy, and launch fields
3. `discolike_lead_lists.json`
   - authoritative company records
   - company QA history
   - contact records and contact QA history
   - provider-result snapshots
4. `campaign_workflow`
   - a separate 16-step Dulcy workflow template with manual-completion flags

The planner infers the active step from the presence or absence of fields and flags. The orchestrator then applies additional Ryan/contact reconciliation and route-specific repairs. This works for many paths, but creates the recurring failure mode where a valid artifact exists while a different projection renders an older stage or generic menu.

The recommended Phase 1 decision is to introduce one persisted `workflow_stage` as the authority, while retaining current fields as compatibility projections during migration.

## Current implementation map

| Concern | Current source | Current role |
|---|---|---|
| Conversation-facing campaign orchestration | `orchestrator/campaign_build_orchestrator.py` | Setup parsing, delegation, Ryan workflow, contact workflow, diagnostics, response rendering, repairs, synchronization |
| Campaign conversation state | `orchestrator/campaign_build_state.py` | In-memory state, JSON persistence, process recovery, fixture-ID stripping |
| Inferred campaign planner | `orchestrator/campaign_build_planner.py` | Derives `current_step`, `next_action`, pending fields, provider and approval requirements |
| Durable campaign-build record | `orchestrator/campaign_build_pipeline.py` | `campaign_builds.json`, legacy status ladder, broad artifact/status record |
| Conversation ownership | `orchestrator/conversation_manager.py` | First-right-of-refusal, competing-intent release, calendar override, campaign continuation |
| Short-reply context | `orchestrator/conversation_context.py` | Pending decision and workflow-follow-up classification; primarily process-local context |
| Legacy workflow checklist | `orchestrator/dulcy_campaign_workflow.py` | Independent 16-step operational checklist and modes |
| Company/contact data and QA | `commands/discolike_commands.py` | Lead-list store, company QA, contact generation, contact QA, expansion/refinement |
| Later campaign production stages | `commands/campaign_build_commands.py` | LeadMagic, MillionVerifier, copy/spintax, Bison setup, launch safety, final checklist |
| Specialist routing shells | `agents/ava_customer_success.py`, `scout_research.py`, `ryan_lead_list_builder.py`, `sean_copywriter.py` | Generic agent selection/delegation contracts |
| Actual specialist planning payloads | `orchestrator/campaign_build_orchestrator.py` | Scout/Ryan/Sean/Ava structured planning output and Ava synthesis |
| Provider adapters | `providers/discolike/`, `providers/leadmagic/`, `providers/millionverifier/` | External-service abstraction and API execution |
| Exact diagnostic priority | `router/exact_diagnostics.py` | Keeps diagnostic commands ahead of broad routing |
| Regression coverage | `tests/smoke_campaign_*`, `tests/smoke_ryan_*`, `tests/smoke_discolike_*`, contact/provider tests | Broad smoke coverage, mostly stage-specific |

### Size and concentration

The campaign behavior is concentrated in three very large modules:

- `campaign_build_orchestrator.py`: approximately 11,000 lines
- `campaign_build_commands.py`: approximately 16,000 lines
- `discolike_commands.py`: approximately 13,000 lines

This is not by itself a reason for a rewrite. It does mean state transitions, intent resolution, persistence, provider execution, and rendering are currently too interleaved to make transition validity obvious.

## Current transition map

The conversational planner currently approximates this path:

```text
client
→ thesis
→ campaign name
→ strategy + prep + launch
→ Airtable campaign record
→ prior campaign research
→ Scout/Ryan/Sean/Ava planning
→ direction approval
→ Ryan list parameters
→ build 100
→ QA 100
→ review / refine / approve / expand
→ company-list approval
→ contact generation
→ contact QA
→ LeadMagic
→ MillionVerifier
→ verified-contact export
```

The production command layer separately continues through:

```text
copy/spintax
→ copy review
→ Bison campaign and sequence
→ lead attachment
→ sender/settings selection
→ preflight
→ ready to launch
→ launched
```

The key gap is that the conversational planner stops at `export_verified_contacts`. It does not authoritatively transition through Sean copy generation, copy review, final campaign review, or campaign readiness, even though much of that functionality exists in `campaign_build_commands.py`.

## State and persistence audit

### Store authority today

| Data | Most authoritative current source | Duplicated in | Risk |
|---|---|---|---|
| Current conversational step | Inferred by planner from conversation state | Campaign build `current_step/next_action`, Ryan stage | High |
| Campaign requirements | Conversation state | Campaign build, specialist payloads, lead-list SOP config | High |
| Company records | DiscoLike lead-list store | Campaign build IDs/counts | Medium |
| Company QA | DiscoLike lead-list QA history | Conversation and campaign-build QA IDs/status | High |
| Corrective action | Conversation state | Campaign build recovery projection | Medium |
| Company approval | Lead-list metadata plus conversation flags | Campaign build flags | High |
| Contact progress | DiscoLike lead-list store | Conversation counters and campaign-build counters | High |
| Contact QA | DiscoLike lead-list store | Conversation and campaign-build QA IDs/status | High |
| LeadMagic result | Lead-list provider result | Campaign build summary/status, conversation status | High |
| MillionVerifier result | Lead-list verification result | Campaign build summary/status, conversation status | High |
| Copy and launch artifacts | Campaign build | Legacy workflow checklist | Medium |
| Ownership arbitration | Conversation manager process state | Campaign conversation owner fields | Medium |

### Recovery behavior

`campaign_build_state.py` first attempts to load `campaign_conversation_state.json`. If unavailable or inactive, it reconstructs conversation state from the active or latest unfinished campaign-build record.

Recovery is therefore projection-based:

- It restores selected fields from the campaign-build record.
- It recomputes `current_step` and `next_action`.
- It applies contact-specific stage overrides.
- It can attach the latest DiscoLike QA ID when missing.
- It strips `dl_test_*`, `qa_test_*`, and `cqa_test_*` identifiers in live runtime.

This is useful repair behavior, but it is not a canonical transition log. A restart can legitimately choose a different stage than the one rendered before shutdown if duplicated fields disagree.

### Persistence strengths

- Campaign conversation state is written on state mutation.
- Campaign-build updates are timestamped and stored durably.
- DiscoLike company QA and contact QA retain histories, not only summaries.
- Contact generation contains checkpoint and telemetry fields.
- Corrective state is now projected to both conversation and campaign-build recovery.
- Test-fixture identifiers are explicitly removed from live state.
- Targeted repair routines exist for campaign QA and contact state.

### Persistence gaps

1. There is no atomic commit spanning the conversation, campaign-build, and DiscoLike stores.
2. Rendering is not uniformly downstream of a verified durable transition.
3. `campaign_build.update()` accepts arbitrary fields without schema/version validation.
4. Recovery chooses the “latest unfinished” build when the active reference is unavailable; this is practical but can be destructive if multiple builds are plausible.
5. Conversation-manager ownership state is mainly process-local and reconstructed from campaign state rather than persisted as a transition.
6. Artifact approvals are booleans and timestamps in several places, not version-bound approval records.
7. State repair is distributed across general hydration, Ryan QA repair, contact repair, and command-specific synchronization.

## Duplicate and legacy state

### Competing stage fields

- `status` in `CAMPAIGN_BUILD_STATES`
- `campaign_workflow.manual_completion`
- `current_step`
- `next_action`
- `ryan_stage`
- `active_agent_task`
- contact generation/enrichment/verification statuses

None is consistently authoritative across the complete workflow.

### Duplicate artifact references

- `lead_list_id`
- `ryan_lead_list_id`
- `discolike_list_id`
- `contacts_lead_list_id`
- `pending_expansion_lead_list_id`

These are sometimes aliases and sometimes distinct workflow references.

### Duplicate approvals

- `direction_approved`
- `first_100_sample_approved`
- `first_100_operator_approved` in the lead list
- `ryan_expansion_approved`
- `ryan_lead_list_approved`
- `company_list_approved`
- contact QA status rather than a versioned approval
- `copy_review_status`
- launch/preflight flags

Approvals are not consistently tied to an artifact ID, artifact version, requirements fingerprint, approver, and timestamp.

### Explicitly deprecated fields

`campaign_build_state.py` already removes:

- `ryan_qa_score`
- `ryan_tier_counts`
- `ryan_qa_reasons`
- `ryan_tier_reason_stats`
- `ryan_top_issues`

This is the correct migration pattern: recognize legacy input, project to canonical data, and stop writing deprecated fields.

## Routing and conversation audit

### Working behavior

- Active campaign setup gets first right of refusal.
- Calendar intent has a structural override independent of router confidence.
- General competing-intent release exists for non-compatible intents.
- Campaign suspension preserves campaign state.
- Focused diagnostics can bypass generic routing.
- Pending corrective action is checked before the generic QA menu.
- Single missing setup fields can consume contextual values such as dates.

### Risks

1. Campaign relevance still combines semantic intent with many phrase and stage checks.
2. Exact phrase sets remain common in commands and approval handlers.
3. `conversation_context.py` and campaign conversation state both represent pending decisions.
4. Ava is conceptually the campaign owner, but `assigned_agent`, `active_agent`, and rendered Ryan responses can make ownership appear transferred.
5. Specialist agent classes are routing shells; actual specialist business contracts are implemented elsewhere.
6. Invalid or unknown transitions often degrade into a prior menu instead of returning a transition error with repair guidance.

## Hardcoded assumptions

Generic campaign logic currently contains material roofing, residential roofing, Loom, USA, Orlando, and Florida assumptions.

Some are legitimate taxonomy or strategy aliases. Others are unsafe fallbacks:

- Residential-roofing build command fallback
- Roofing-specific positive/negative phrases
- Roofing-specific Scout A/B recommendations
- Default Loom-versus-direct-offer recommendation language
- Orlando/Florida geography language
- Generic `B2B services in United States` query fallback

These must not be deleted blindly because existing tests and campaigns may rely on them. They should be moved behind explicit industry strategy profiles or fixture data, and generic runtime paths should require current campaign evidence.

## Major gaps ranked

### P0 — blocks production reliability

1. No canonical persisted workflow stage.
2. No single transition function enforcing valid stage changes.
3. No atomic or ordered multi-store commit contract.
4. Conversation planner does not cover copy generation through final approval.
5. Approvals are not artifact-version and requirements-fingerprint bound.
6. State divergence is repaired by several independent routines without one reconciliation report.

### P1 — likely to cause stale or misleading behavior

1. Foundational-field invalidation is broad but not expressed as an artifact dependency graph.
2. Hardcoded campaign profiles can leak into generic campaigns.
3. Specialist contracts and specialist execution live in different modules.
4. QA gating is implemented in several layers instead of one authoritative decision artifact.
5. Contact, enrichment, and verification readiness are often inferred from status strings.
6. Pending decisions exist in both process context and persisted campaign state.
7. Copy approval and final readiness are available in the command layer but not unified with the Ava conversation.

### P2 — supportability and maintainability

1. No top-level `debug campaign workflow`.
2. No append-only campaign transition journal.
3. No schema version on the campaign conversation state.
4. No unified artifact-version inventory.
5. No deterministic full-workflow fixture that crosses all stores without paid services.

## Proposed canonical campaign state

Add a versioned canonical block to the campaign-build record:

```json
{
  "workflow_schema_version": 1,
  "workflow_stage": "company_sample_qa",
  "workflow_stage_version": 7,
  "workflow_owner": "Ava",
  "active_specialist": "Ryan",
  "stage_entered_at": "ISO-8601",
  "transition_sequence": 24,
  "requirements": {},
  "requirements_version": 4,
  "requirements_fingerprint": "sha256:...",
  "artifacts": {},
  "pending_decision": {},
  "blockers": [],
  "last_transition": {},
  "recovery": {},
  "final_snapshot": null
}
```

### Authority rules

1. `workflow_stage` is authoritative for routing and rendering.
2. `requirements` is authoritative for current campaign requirements.
3. Provider stores remain authoritative for their row-level records and raw result histories.
4. `artifacts` contains versioned pointers and summaries to provider-store artifacts.
5. Approvals live inside the artifact they approve.
6. Existing `current_step`, `next_action`, `ryan_stage`, and status fields become compatibility projections generated from the canonical stage.
7. A projection may never advance the canonical stage.
8. A renderer may only claim success after the canonical transition commit succeeds.

### Canonical artifact reference

```json
{
  "artifact_id": "qa_...",
  "artifact_type": "company_qa",
  "version": 3,
  "requirements_fingerprint": "sha256:...",
  "status": "passed",
  "source_store": "discolike_lead_lists",
  "source_parent_id": "dl_...",
  "created_at": "ISO-8601",
  "approval": {
    "status": "approved",
    "approved_by": "Alexander",
    "approved_at": "ISO-8601",
    "artifact_version": 3,
    "requirements_fingerprint": "sha256:..."
  }
}
```

## Canonical state-machine proposal

Universal rules for every stage:

- Workflow owner remains Ava.
- `active_specialist` may be Scout, Ryan, or Sean.
- Every event is resolved against the current stage and pending decision.
- Every transition validates required inputs and blockers.
- Every transition persists before rendering.
- `cancel` moves to `campaign_paused` without deleting artifacts.
- Explicit new-campaign intent creates a new state identity instead of mutating the current campaign.
- Unrelated intent suspends ownership but does not change `workflow_stage`.
- Recovery verifies referenced artifacts and either restores the stage, repairs a safe reference, or moves to `campaign_failed`/`campaign_paused` with a blocker.
- Each stage exposes its section through `debug campaign workflow`.

| Stage | Specialist / required input | Allowed stage intents | Valid next stages | Persisted artifacts and blockers | Approval / recovery / cancellation |
|---|---|---|---|---|---|
| `campaign_setup` | Ava; client, thesis, structured requirements, strategy, prep/launch | provide/edit fields, date clarification, pause, new campaign | `campaign_planning`, `campaign_paused`, `campaign_failed` | Requirements vN, parse diagnostics; block missing/invalid fields and invalid date ordering | No approval; recover missing fields exactly; cancel pauses |
| `campaign_planning` | Scout/Ryan/Sean coordinated by Ava | continue planning, inspect specialist evidence, modify requirements | `campaign_strategy_review`, `campaign_setup`, `campaign_paused`, `campaign_failed` | Versioned specialist outputs; block missing required output or unsupported claims | No operator approval yet; rerun missing specialist only; cancel pauses |
| `campaign_strategy_review` | Ava; synthesized recommendation | approve, modify direction, inspect Scout/Ryan/Sean | `company_sample_build`, `campaign_planning`, `campaign_setup`, `campaign_paused` | Campaign Plan artifact and conflicts; block stale fingerprint | Approval freezes the requirements and plan versions until the operator changes them |
| `company_sample_build` | Ryan; approved requirements and database | build, continue, stop, modify ICP | `company_sample_qa`, `company_sample_refinement`, `campaign_setup`, `campaign_paused`, `campaign_failed` | Company sample artifact/checkpoint; block missing provider result or wrong fingerprint | No quality approval; recover provider job/list; cancel pauses |
| `company_sample_qa` | Ryan; current sample | run/rerun QA, inspect tiers, explain | `company_list_review`, `company_sample_refinement`, `campaign_paused`, `campaign_failed` | QA artifact with one authoritative gate decision; block stale/contradictory counts | No approval if blocking gate; recover latest matching QA; cancel pauses |
| `company_sample_refinement` | Ryan; failed gates and recommended changes | approve correction, refine filters, modify ICP, cancel | `company_sample_build`, `campaign_setup`, `campaign_paused`, `campaign_failed` | Corrective plan and filter diff; block unchanged query or unresolved ICP edit | Contextual correction confirmation; recover pending correction; cancel pauses |
| `company_expansion` | Ryan; approved sample and target count | expand, continue, resume, stop | `company_list_review`, `company_sample_qa`, `campaign_paused`, `campaign_failed` | Expansion checkpoint, de-duplication summary, expanded-list artifact | Sample approval must match version/fingerprint; recover checkpoint; cancel pauses |
| `company_list_review` | Ava with Ryan evidence; QA-passed list | inspect, approve companies, refine, change ICP | `contact_generation`, `company_sample_refinement`, `campaign_setup`, `campaign_paused` | Final company-list version and QA; block stale or failed QA | Company approval version-bound; recovery revalidates approval; cancel pauses |
| `contact_generation` | Ryan; approved company list and personas | generate, continue, resume, auto-continue, stop, regenerate | `contact_qa`, `contact_refinement`, `campaign_paused`, `campaign_failed` | Batch checkpoints, attempted/completed companies, contact IDs, telemetry | Regeneration requires explicit destructive confirmation; recover checkpoint; stop pauses |
| `contact_qa` | Ryan; current contact version | run/rerun QA, inspect tiers, approve, refine | `leadmagic_enrichment`, `contact_refinement`, `campaign_paused`, `campaign_failed` | Contact QA and readiness decision; block persona/seniority/email failures | Approval version-bound and prohibited on blocking QA; recover matching QA |
| `contact_refinement` | Ryan; contact QA failures | adjust personas, regenerate failed slice, approve partial if allowed | `contact_generation`, `contact_qa`, `campaign_setup`, `campaign_paused` | Refinement plan and impacted contact slice | Partial approval must be explicit; recover plan; cancel pauses |
| `leadmagic_enrichment` | Ryan; approved contact dataset | start, continue, resume, status, accept partial | `email_verification`, `contact_refinement`, `campaign_paused`, `campaign_failed` | Job ID, checkpoints, enriched/missing/failed/skipped, source IDs | Partial acceptance explicit; recover job/checkpoint; cancel pauses |
| `email_verification` | Ryan; enriched dataset | start, resume, status, inspect invalid/risky, approve verified | `copy_generation`, `contact_refinement`, `campaign_paused`, `campaign_failed` | Verification job/version and status buckets; invalid email is a hard exclusion | Verified-audience approval version-bound; recover job; cancel pauses |
| `copy_generation` | Sean; approved requirements and verified audience schema | generate, compare variants, regenerate component | `copy_review`, `campaign_setup`, `campaign_paused`, `campaign_failed` | Copy version, token inventory, fallback rules, evidence inputs | No final approval; recover draft; cancel pauses |
| `copy_review` | Ava with Sean; current copy version | edit CTA/offer/length, compare, approve version | `campaign_final_review`, `copy_generation`, `campaign_setup`, `campaign_paused` | Versioned copy and review history; block unavailable personalization tokens | Copy approval version-bound; recover latest approved/draft versions |
| `campaign_final_review` | Ava; all required artifacts | show checklist, resolve blocker, approve final campaign | `campaign_ready`, any blocked predecessor, `campaign_paused` | Readiness report and blocker list | Final approval requires every gate; recovery recomputes readiness |
| `campaign_ready` | Ava; immutable approved snapshot | show summary, schedule/launch-prep, revise campaign | `campaign_final_review`, `campaign_paused` | Immutable final snapshot plus source artifact versions | Any fundamental edit creates new versions and invalidates readiness |
| `campaign_paused` | Ava; pause reason and resume target | resume, status, cancel campaign, start new campaign | Saved resume stage or `campaign_failed` | Pause record and resumable stage | Resume re-reconciles artifacts; explicit abandonment is separate from pause |
| `campaign_failed` | Ava; unrecoverable blocker | inspect, repair explicitly, restart stage, abandon | Repaired stage, `campaign_paused` | Failure record, source error, safe repair options | No silent guessing; only explicit repair transition |

## Transition API proposal

Create a small dedicated module in the implementation phase:

`orchestrator/campaign_workflow_state_machine.py`

Primary functions:

```python
resolve_campaign_event(message, canonical_state) -> CampaignEvent
validate_transition(canonical_state, event) -> TransitionDecision
apply_transition(canonical_state, decision) -> CanonicalCampaignState
persist_transition(previous, updated, artifacts) -> CommitResult
project_legacy_fields(canonical_state) -> dict
reconcile_campaign_state(campaign_id) -> ReconciliationReport
invalidate_campaign_artifacts(changed_fields, state) -> InvalidationReport
```

Transition order:

```text
resolve event
→ validate current stage and artifact versions
→ compute invalidations
→ execute reversible/local work
→ persist provider artifact
→ commit canonical campaign state
→ write compatibility projections
→ append transition journal
→ render response
```

External paid actions remain behind explicit confirmation and idempotency keys.

## Canonical artifacts produced by Campaign Builder

Campaign stages describe orchestration. Artifacts are the versioned business outputs that move through that orchestration. Every canonical artifact record has:

- `id`
- `artifact_type`
- `version`
- `fingerprint`
- `created_at`
- `approved`
- `approved_by`
- `approved_at`
- `derived_from`
- `invalidated`
- `invalidated_at`
- `invalidation_reason`
- `status`

The canonical artifact types are:

| Artifact | Produced at | Purpose |
|---|---|---|
| Campaign Requirements | `campaign_setup` | Structured ICP, offer, strategy, dates, constraints, and campaign objective |
| Campaign Plan | `campaign_planning` | Ava's synthesized plan backed by Scout, Ryan, and Sean specialist outputs |
| Company Sample | `company_sample_build` | First bounded company dataset used to validate targeting |
| Company QA | `company_sample_qa` | Version-bound quality evidence and gate decision for a company dataset |
| Approved Company Dataset | `company_list_review` | Operator-approved, QA-passed company audience |
| Expanded Company Dataset | `company_expansion` | Scaled company audience derived from an approved sample and unchanged requirements |
| Contact Dataset | `contact_generation` | Personas and contacts derived from the approved company dataset |
| Contact QA | `contact_qa` | Version-bound contact quality evidence and gate decision |
| Approved Contacts | `contact_qa` | Operator-approved contact audience after blocking QA gates pass |
| Enriched Dataset | `leadmagic_enrichment` | LeadMagic output derived from approved contacts |
| Verified Dataset | `email_verification` | Deliverable email audience after verification and hard exclusions |
| Copy Package | `copy_generation` / `copy_review` | Versioned production copy written only against the approved verified audience |
| Campaign Package | `campaign_final_review` | Complete approved Campaign Builder output and readiness evidence |
| Launch Package | downstream launch workflow | Launch-specific handoff derived from a ready Campaign Package; not executed by Campaign Builder |

Artifact lifecycle:

```text
draft → produced → qa_pending → qa_passed or qa_failed → approved
                                                        ↓
                                              superseded or invalidated
```

Artifact versions are immutable. A changed requirement creates a new Campaign Requirements version and invalidates only downstream artifacts whose `derived_from` graph includes the old version. Approval is always bound to an artifact version and fingerprint; it never floats to a replacement artifact.

## Artifact dependency proposal

```text
requirements
├── planning recommendation
├── company sample
│   └── company QA
│       └── company approval
│           └── expanded company list
│               └── expanded company QA
│                   └── company-list approval
│                       └── contacts
│                           └── contact QA
│                               └── LeadMagic result
│                                   └── verification result
│                                       └── verified audience
│                                           └── copy versions
│                                               └── copy approval
└── setup dates and constraints

final readiness depends on:
approved company list
+ approved contacts
+ acceptable enrichment
+ approved verified audience
+ approved copy
+ valid setup dates
```

Changing a foundational requirement invalidates only its descendants and reports every invalidated artifact before rebuilding.

## Migration proposal

1. Add canonical fields to new campaign-build records without removing legacy fields.
2. Implement a read-only inference function that maps current state into a proposed canonical stage.
3. Add `debug campaign workflow` using inference only.
4. Run inference against deterministic fixtures and current persisted records.
5. Record ambiguous mappings instead of choosing silently.
6. After approval, make canonical transitions authoritative for one stage group at a time.
7. Continue writing legacy projections for compatibility.
8. Stop reading a legacy field as authority only after its stage group passes restart and end-to-end tests.
9. Remove deprecated writes in a later migration; do not delete old stored fields immediately.

### Initial legacy-stage projection

| Canonical stage | Legacy projection |
|---|---|
| `campaign_setup` | setup `current_step`, setup `next_action`, pending fields |
| `campaign_planning` | `agent_planning` / `continue_agent_planning` |
| `campaign_strategy_review` | `agent_review` / `await_direction_decision` |
| `company_sample_build` | Ryan `build_100_sample` |
| `company_sample_qa` | Ryan `qa_first_100` |
| `company_sample_refinement` | persisted corrective action |
| `company_expansion` | Ryan `build_1000` / `qa_1000` |
| `company_list_review` | Ryan `review_with_user` / `approve_for_contacts` |
| `contact_generation` | `build_contacts` |
| `contact_qa` | `run_contact_qa` |
| `leadmagic_enrichment` | `leadmagic_enrichment` |
| `email_verification` | `millionverifier_verification` |
| `copy_generation` onward | campaign-build command statuses until conversational stages are implemented |

## Proposed `debug campaign workflow`

The Phase 2 implementation should be read-only and show:

- Campaign ID, name, and client
- Canonical stage and inferred legacy stage
- Workflow owner and active specialist
- Next valid events
- Requirements version and fingerprint
- Artifact versions and approval bindings
- Missing fields and blockers
- Pending approval and corrective action
- Company list and QA status
- Contact and contact-QA status
- LeadMagic and MillionVerifier status
- Copy and final-readiness status
- Last route and last transition
- Last successful persistence timestamp
- Recovery source
- Divergences and proposed safe repairs

No diagnostic should mutate state unless the command explicitly begins with `repair`.

## Phase plan after this checkpoint

### Phase 2 — Setup, thesis, dates, ownership

- Add the canonical schema and read-only inference.
- Implement the setup/planning/direction-review transitions.
- Complete structured thesis fields and missing-field contracts.
- Unify pending decisions used by conversation context and persisted state.
- Add top-level workflow diagnostics.
- Preserve competing-intent suspension.

### Phase 3 — Company sample, QA, refinement, expansion

- Move Ryan stages behind canonical transitions.
- Create one QA decision artifact.
- Version company samples, QA, approvals, and corrective plans.
- Centralize requirements invalidation.
- Remove generic hardcoded fallbacks from the generic path.

### Phase 4 — Contacts and contact QA

- Canonicalize contact checkpoints and contact QA approvals.
- Add idempotent resume and explicit regeneration contracts.
- Consolidate contact reconciliation.

### Phase 5 — LeadMagic and MillionVerifier

- Canonicalize provider jobs, checkpoint recovery, partial completion, and safe-email policy.
- Keep paid execution behind explicit confirmation.

### Phase 6 — Sean copy and final approval

- Bring existing copy/spintax/review functionality into Ava’s conversational state machine.
- Version copy and final campaign snapshots.

### Phase 7 — Persistence and deterministic end-to-end test

- Add transition journal and full reconciliation.
- Build local deterministic provider fixtures.
- Exercise restart at every major stage.
- Add full setup-to-ready simulation without paid calls.

## Phase 1 tests and validation

Phase 1 changes documentation only. No production workflow code or persistence schema was changed.

Source review covered:

- campaign state and planner
- campaign-build persistence
- conversation ownership
- specialist routing and planning
- DiscoLike company/contact persistence and QA
- LeadMagic and MillionVerifier implementation
- copy/final-review command paths
- focused diagnostics
- smoke-test inventory

## Phase 2 implementation checkpoint

Phase 2 now includes:

- A persisted, 19-stage canonical workflow schema owned by Ava.
- `campaign_strategy_review` as a durable approval milestone.
- Versioned Campaign Requirements and Campaign Plan artifacts.
- Requirements fingerprinting and a frozen marker after strategy approval.
- Safe legacy-stage inference that pauses contradictory recovery state.
- Canonical fields persisted to both conversation state and campaign-build records.
- Legacy fields retained as compatibility projections.
- A read-only `debug campaign workflow` diagnostic.
- Deterministic tests for taxonomy, artifacts, transitions, and ambiguous recovery.
- One canonical `record_company_qa_result(...)` write path used by orchestrator-driven and command-driven company QA.
- A versioned `company_qa` artifact and `qa_latest` reference with legacy QA fields projected from that artifact.
- Reload reconciliation for missing references, missing artifacts, stale company-list versions, and changed requirements.

## Known gaps after this Phase 2 checkpoint

- Company, contact, enrichment, verification, copy, and final-review artifacts are defined but will become authoritative in their scheduled migration phases.
- Existing stores can still diverge outside the setup/planning stage group.
- Existing downstream approvals are not yet version-bound.
- Copy through final readiness is not yet part of the conversational planner.
- No paid provider was called.
- No full deterministic setup-to-ready test exists yet.

## Operator review decisions

Approved on July 28, 2026:

1. Ava owns every canonical stage; Scout, Ryan, Sean, Elle, and future agents are internal specialists.
2. The 19-stage taxonomy includes `campaign_strategy_review` between planning and company sample build.
3. Production copy cannot be generated until the audience, contacts, and verified emails are approved.
4. `campaign_ready` is distinct from EmailBison launch execution. Future launch states belong to a downstream launch workflow.
5. Existing legacy fields remain compatibility projections until their consumers are migrated.
6. Ambiguous recovery pauses and reports the missing approval or artifact instead of guessing.
7. Versioned artifacts, rather than boolean flags, are the durable outputs moved through the workflow.

## Current live diagnostic commands

These are safe, read-only checks available now:

```text
debug campaign conversation
debug campaign planner
debug campaign persistence
debug campaign state consistency
debug campaign ownership
debug campaign workflow
debug ownership route <message>
debug parsed thesis
debug campaign date parsing
debug ryan state
debug ryan corrective state
debug ryan qa
debug ryan qa counts
debug ryan qa sample
debug contact workflow
debug contact persistence
debug contact batch
debug contact routing
debug enrichment route <message>
debug pipeline stage
```

`debug campaign workflow` is intentionally not added in Phase 1 because the canonical inference contract should be approved before it is presented as authoritative.

# Campaign Builder Acceptance Specification

## Phase 3.5 purpose

This milestone proves that Campaign Builder is conversationally correct before contact generation is expanded. It tests Jarvis as an operator-facing product, not as a collection of functions.

No scenario may require the operator to know or enter:

- Internal handler names
- Canonical stage names
- Artifact IDs
- QA result IDs
- Lead-list IDs
- Debug-only commands to make progress

Debug commands are assertions and observability tools. They are never prerequisites.

## Acceptance boundary

The acceptance suite ends when an expanded company list is explicitly approved and Campaign Builder reports that contacts are the next stage. The suite must not execute contact generation, LeadMagic, MillionVerifier, copy generation, EmailBison changes, or paid live provider actions.

## Deterministic test environment

Use a deterministic provider fixture with:

- Reference date: July 28, 2026
- Timezone: America/New_York
- Client: Acme Growth
- Initial ICP: B2B event-marketing agencies
- Initial employee range: missing
- Initial location: United States
- Strategy: Lead Magnet
- First sample size: 100
- Expansion target: 1,000
- First sample v1: QA decision `refinement_required`
- Refined sample v2: QA decision `expansion_ready`
- Expanded list v1: QA decision `expansion_ready`
- Expansion fixture includes repeat pages and timeout checkpoints to test de-duplication
- Calendar fixture permits creation of a Google Meet event without altering campaign artifacts

Provider fixtures must expose deterministic company IDs, homepage evidence, industries, employee ranges, locations, tier reasons, cut reasons, and false-positive patterns.

## Universal pass criteria

Every conversation must satisfy these rules:

1. Ava remains canonical workflow owner; specialists remain internal.
2. The active workflow gets first right of refusal, but unrelated intent can temporarily take control.
3. Natural replies are interpreted using the active stage and pending decision.
4. State is persisted before success is rendered.
5. Every artifact and approval is version- and fingerprint-bound.
6. Requirements changes invalidate only dependent artifacts.
7. QA has one authoritative decision with no contradictory recommendation.
8. Expansion never starts without valid sample approval and explicit paid-action confirmation.
9. Contacts never start without final expanded-list approval.
10. Restart recovery never guesses.
11. `debug campaign workflow` accurately describes the preceding transition and never mutates state.
12. Test fixture IDs never enter live state.

## Expected diagnostic invariants

After every transition, the test harness may issue `debug campaign workflow` and assert:

- `workflow_owner` is Ava.
- `canonical_stage` matches the operator-visible state.
- `active_specialist` is correct.
- Requirements version and fingerprint match the active artifacts.
- Only current, non-invalidated artifacts are referenced.
- `qa_latest_reference` resolves to the displayed QA.
- Approval references resolve to current artifacts.
- Corrective state matches the displayed recommendation.
- Expansion progress matches the last committed checkpoint.
- Legacy projections report synchronization.
- `canonical_legacy_diverged` is false, unless an explicit reconciliation is being reported.
- No unexplained blocker exists.

## Acceptance conversations

### A. Campaign setup and single-missing-field behavior

#### A01 — Complete natural setup

Operator:

```text
New campaign for Acme Growth. Target B2B event marketing agencies in the United States. Lead magnet, prep today, launch Thursday.
```

Expected:

- Jarvis captures the client, ICP, strategy, prep date `2026-07-28`, and launch date `2026-07-30`.
- Jarvis asks only for employee range.
- Stage remains campaign setup.

#### A02 — Single missing employee range

Context: employee range is the only missing field.

Operator:

```text
11-200
```

Expected:

- The whole reply is parsed as employee range.
- Jarvis does not ask what `11-200` refers to.
- Planning begins after persistence.

#### A03 — Single missing strategy

Context: strategy is the only missing field.

Operator:

```text
lead magnet
```

Expected: strategy is saved and the workflow advances without a generic menu.

#### A04 — Single missing prep date

Context: prep date is the only missing field.

Operator:

```text
today
```

Expected: prep date becomes `2026-07-28`.

#### A05 — Single missing launch date

Context: launch date is the only missing field.

Operator:

```text
Thursday
```

Expected: launch date becomes `2026-07-30`.

#### A06 — Partial day-of-month

Context: launch date is the only missing field.

Operator:

```text
the 30th
```

Expected: launch date becomes `2026-07-30` without clarification.

#### A07 — Next weekday differs from weekday

Operator:

```text
next Thursday
```

Expected: the parser resolves the next-Thursday rule, not the same date used for plain `Thursday`.

#### A08 — Invalid date

Operator:

```text
February 30
```

Expected:

- Jarvis explains that the date is invalid.
- No date is stored.
- The same generic missing-field prompt is not repeated verbatim.

#### A09 — Launch before prep

Operator:

```text
prep August 10 and launch August 4
```

Expected: Jarvis rejects the ordering and asks for a corrected date.

#### A10 — Full-sentence setup

Operator:

```text
Use a lead magnet. Prep it today and launch it on the 30th.
```

Expected: both fields are extracted in one turn.

### B. Strategy review and requirements confirmation

#### B01 — Approve strategy

Context: Ava has presented the campaign plan.

Operator:

```text
approve
```

Expected:

- Campaign Plan approval is version-bound.
- Stage advances to company sample build.
- Ryan presents structured requirements before building.

#### B02 — Short affirmative

Operator:

```text
yes
```

Expected: equivalent to approving the pending strategy, not a generic menu.

#### B03 — Casual approval

Operator:

```text
looks right
```

Expected: requirements are confirmed for sample build.

#### B04 — Employee edit at confirmation

Operator:

```text
change employees to 11-200
```

Expected:

- Employee range changes.
- Requirements version increments.
- Fingerprint changes.
- Jarvis explains the before-and-after value.
- No sample is built until the revised requirements are confirmed.

#### B05 — Location edit at confirmation

Operator:

```text
target Florida only
```

Expected: location changes to Florida and requirements are re-versioned.

#### B06 — Add positive industry signal

Operator:

```text
add event marketing
```

Expected: the actual search configuration gains the signal; the displayed confirmation reflects it.

#### B07 — Add exclusion

Operator:

```text
exclude web design agencies
```

Expected: the negative search configuration changes and is persisted.

#### B08 — Combined change

Operator:

```text
Make it Florida only, 11-200 employees, and exclude generic digital agencies.
```

Expected: all changes are applied in one requirements version with one clear change summary.

#### B09 — Inspect a specialist

Operator:

```text
What filters did Ryan choose?
```

Expected: Jarvis shows Ryan’s current filters without transferring workflow ownership.

#### B10 — Modify strategy instead of approving

Operator:

```text
Use a direct offer instead.
```

Expected:

- Campaign requirements and plan are re-versioned.
- Strategy approval is invalidated.
- Workflow returns to planning/review.

### C. First sample build

#### C01 — Natural build request

Operator:

```text
build the first sample
```

Expected:

- A 100-company sample is built from confirmed requirements.
- `company_sample` is persisted and verified before QA.
- Canonical QA runs automatically.

#### C02 — Confirmation phrase

Operator:

```text
yes build it
```

Expected: same result as C01.

#### C03 — Casual start phrase

Operator:

```text
go ahead
```

Expected: pending sample build executes.

#### C04 — Alternative phrase

Operator:

```text
start the sample
```

Expected: pending sample build executes.

#### C05 — First-100 phrase

Operator:

```text
run the first 100
```

Expected: sample build and QA execute without requesting an internal command.

#### C06 — Duplicate prevention

Fixture: provider repeats ten companies across pages.

Expected:

- The sample artifact contains unique source company IDs.
- Duplicate count is reported.
- QA totals reconcile to the persisted unique dataset.

#### C07 — Fixture ID live rejection

Fixture attempts to return `dl_test_*` or `qa_test_*` in live mode.

Expected: persistence is rejected and the campaign pauses with a diagnostic blocker.

#### C08 — Provider failure before persistence

Fixture returns a provider error.

Expected:

- Jarvis does not claim that the sample is complete.
- No new sample artifact or QA artifact exists.
- Retry resumes from sample build.

### D. Authoritative QA and review

#### D01 — Refinement-required result

Fixture: Tier 1 is zero, positive signals are absent, false positives are high.

Expected:

- One decision: `refinement_required`.
- Displayed recommendation, corrective state, and stage agree.
- Expansion is blocked.

#### D02 — High usability but weak evidence

Fixture: usability 95%, Tier 1 zero, weak industry confidence.

Expected: QA is not labeled expansion-ready.

#### D03 — Passing QA

Fixture: strong Tier 1 distribution, signals present, compliance gates pass.

Expected: one decision, `expansion_ready`.

#### D04 — Contradictory QA fields

Fixture: tier counts do not equal total.

Expected:

- Decision is `blocked`.
- Jarvis reports the contradiction.
- Approval and expansion are unavailable.

#### D05 — Manual review

Fixture: gates pass but material evidence is missing.

Expected: decision is `manual_review_required`; Jarvis recommends the specific review.

#### D06 — Show Tier 1

Operator:

```text
show Tier 1
```

Expected: current canonical QA bucket is displayed.

#### D07 — Empty Tier 1

Operator:

```text
show Tier 1
```

Context: Tier 1 is empty.

Expected: Jarvis explains why it is empty and recommends reviewing Tier 2 reasons or refining.

#### D08 — Show Tier 2

Operator:

```text
show Tier 2
```

Expected: current Tier 2 rows and assignment reasons are displayed.

#### D09 — Review cuts

Operator:

```text
review companies you cut
```

Expected: current cut rows and reasons are displayed.

#### D10 — Explain low Tier 1

Operator:

```text
why is Tier 1 low
```

Expected: explanation distinguishes query quality, homepage evidence, industry fit, and bucketing.

#### D11 — Show false positives

Operator:

```text
show false positives
```

Expected: recurring current-sample false-positive patterns are shown.

#### D12 — Show failed signals

Operator:

```text
show failed homepage signals
```

Expected: results come from current canonical QA, not an earlier list.

#### D13 — Industry mismatches

Operator:

```text
show industry mismatches
```

Expected: current mismatch evidence and cut/Tier 2 reasons are shown.

#### D14 — Contact-title evidence boundary

Fixture: company fit is strong but no contact-title evidence exists.

Expected: the company is not downgraded solely for missing contact-title evidence.

### E. Corrective refinement conversational UX

Context for E01–E12: Jarvis recommends refinement and has a persisted corrective action.

#### E01 — “okay do it”

Operator: `okay do it`

Expected: refine → rebuild → QA executes automatically.

#### E02 — “yes”

Operator: `yes`

Expected: corrective action executes.

#### E03 — “go ahead”

Operator: `go ahead`

Expected: corrective action executes.

#### E04 — “continue”

Operator: `continue`

Expected: corrective action executes, not the generic QA menu.

#### E05 — “fix it”

Operator: `fix it`

Expected: corrective action executes.

#### E06 — “refine it”

Operator: `refine it`

Expected: corrective action executes.

#### E07 — Explicit keywords

Operator: `refine the keywords`

Expected: explicit refinement executes.

#### E08 — Explicit industries

Operator: `refine the industries`

Expected: explicit refinement executes.

#### E09 — Combined explicit refinement

Operator: `refine the keywords and industries`

Expected: both underlying criteria change.

#### E10 — Tighten filters

Operator: `tighten the filters`

Expected: corrective action executes.

#### E11 — Improve search

Operator: `improve the search`

Expected: corrective action executes.

#### E12 — Delegated judgment

Operator:

```text
do whatever you think is best
```

Expected:

- Because a specific corrective recommendation is pending, Jarvis executes it.
- Jarvis explains the actual changes.
- It does not broaden unrelated campaign requirements.

#### E13 — Requirement change is not confirmation

Operator:

```text
Actually make it Florida only.
```

Expected:

- Corrective confirmation is not consumed.
- Requirements version increments.
- Old sample, QA, and approval are invalidated.
- Expansion job disappears or is invalidated.
- Workflow returns to sample build.

#### E14 — Corrective process failure

Fixture: revised provider search fails.

Expected:

- Pending corrective action remains.
- Old artifacts remain invalidated or superseded as appropriate.
- Jarvis does not clear the action or claim QA was rerun.

### F. Sample approval and expansion

#### F01 — Natural sample approval

Operator: `approve`

Context: current QA is expansion-ready.

Expected: approval binds the current sample and QA artifacts.

#### F02 — Explicit sample approval

Operator: `approve first 100`

Expected: current sample is approved without requesting an artifact ID.

#### F03 — “looks good”

Operator: `looks good`

Expected: equivalent to approval only when sample approval is the pending decision.

#### F04 — Failed QA approval attempt

Operator: `approve the sample`

Context: QA requires refinement.

Expected: approval is blocked with the failed gates.

#### F05 — Approve and expand

Operator: `approve and expand`

Expected:

- Sample approval is persisted first.
- Jarvis requests explicit confirmation before the paid expansion.

#### F06 — Expansion without approval

Operator: `expand to 1000`

Context: sample is not approved.

Expected: expansion remains blocked and Jarvis asks for sample approval.

#### F07 — Natural expansion

Operator: `expand it`

Context: sample approval is valid.

Expected: expansion draft targets 1,000 and asks once for paid-action confirmation.

#### F08 — Full-list phrase

Operator: `continue with the full list`

Expected: same as F07.

#### F09 — Confirm paid expansion

Operator: `confirm`

Expected:

- Expansion job becomes in-progress before provider execution.
- Checkpoint is persisted.

#### F10 — Cancel expansion

Operator: `cancel`

Expected: no paid action occurs; sample approval remains valid.

#### F11 — Expansion timeout

Fixture: timeout after 420 unique companies.

Expected:

- Job status and 420-company checkpoint persist.
- Jarvis reports a resumable pause.
- No expanded-list completion artifact exists yet.

#### F12 — Resume expansion

Operator: `resume expansion`

Expected:

- Provider resumes from the checkpoint.
- Previously persisted companies are not duplicated.

#### F13 — Expanded QA passes

Fixture: expanded list retains sample quality.

Expected:

- Expanded list and expanded QA artifacts persist.
- Stage becomes final company-list review.
- Contacts do not start.

#### F14 — Expanded quality drift

Fixture: usability drops 15 points and false positives increase.

Expected:

- Expanded QA decision becomes `refinement_required`.
- Sample approval is not treated as expanded-list approval.
- Final approval is blocked.

### G. Final company-list approval

#### G01 — Explicit final approval

Operator: `approve company list`

Expected: final approval binds current expanded list and expanded QA.

#### G02 — Full-list approval

Operator: `approve the full list`

Expected: same as G01.

#### G03 — Contacts phrase at final review

Operator:

```text
looks good, build contacts
```

Expected:

- Final company-list approval is persisted.
- Campaign Builder reports contact generation as the next stage.
- This acceptance suite does not execute contacts.

#### G04 — Premature contacts request

Operator: `move to contacts`

Context: only sample approval exists.

Expected: request is blocked until expanded QA and final approval.

#### G05 — Stale expanded QA approval

Operator: `approve company list`

Context: expanded list version changed after QA.

Expected: approval is blocked; QA must rerun.

### H. Interruptions, ownership, and recovery

#### H01 — Calendar interruption during QA wait

Operator:

```text
Send Ryan a Google Meet tomorrow.
```

Expected:

- Calendar intent takes control.
- Campaign state and pending QA decision remain unchanged.
- Calendar action follows its own confirmation policy.

#### H02 — Resume after calendar

Operator:

```text
continue the campaign
```

Expected: Campaign Builder resumes at the exact prior QA/review state.

#### H03 — Unrelated analytics question

Operator:

```text
How many positive replies did the Acme campaign get?
```

Expected: analytics routes independently; Campaign Builder remains resumable.

#### H04 — Restart waiting for sample confirmation

Expected: requirements confirmation prompt restores with the same version and fingerprint.

#### H05 — Restart after sample build

Expected: current sample restores; QA either resumes or is shown if already committed.

#### H06 — Restart after QA

Expected: `qa_latest` resolves to the current QA artifact and the same decision is displayed.

#### H07 — Restart with corrective action pending

Expected: `yes`, `continue`, or explicit refinement still executes the corrective action.

#### H08 — Restart during corrective rebuild

Expected: Jarvis resumes from the persisted build/checkpoint or pauses with an exact blocker; it does not rerun blindly.

#### H09 — Restart after sample approval

Expected: approval binding restores and expansion is available.

#### H10 — Restart during expansion

Expected: expansion job, target, completed count, and de-duplication state restore.

#### H11 — Restart after expanded QA

Expected: final review restores; contacts remain blocked pending approval.

#### H12 — Six sequential restarts

Execute six restarts at six different milestones.

Expected:

- No artifact duplication.
- No stage regression.
- No lost pending decision.
- No inferred approval.

### I. Diagnostics and corruption handling

#### I01 — Debug after setup

Operator: `debug campaign workflow`

Expected: requirements and missing fields match the preceding setup transition.

#### I02 — Debug after sample

Expected: sample artifact, version, search configuration, and source path match the persisted sample.

#### I03 — Debug after QA

Expected: QA reference, artifact, decision, counts, fingerprint, and projection status match the displayed result.

#### I04 — Debug after refinement

Expected: before/after search changes, new requirements version, new sample version, and invalidated artifacts are visible.

#### I05 — Debug during expansion

Expected: job ID, target, progress, checkpoint, and stage are accurate.

#### I06 — Debug after final approval

Expected: final approval references the current expanded artifact and stage is contact generation.

#### I07 — Missing `qa_latest`

Fixture removes `qa_latest` but leaves a valid QA artifact.

Expected: reload repairs the reference and records reconciliation.

#### I08 — Missing QA artifact

Fixture leaves `qa_latest` pointing to a missing artifact.

Expected: campaign pauses with a blocker and does not infer approval.

#### I09 — Conflicting approvals

Fixture contains two non-invalidated approvals for different sample versions.

Expected: campaign pauses and reports the conflict.

#### I10 — Legacy/canonical disagreement

Fixture sets legacy `qa_result_id` to an older QA.

Expected: canonical artifact wins; projection is repaired and reconciliation is recorded.

## Full operator simulations

### Simulation S01 — Failure, refinement, and successful expansion

Conversation:

```text
new campaign
Acme Growth
Target B2B event marketing agencies in the United States with a lead magnet.
11-200
today
Thursday
approve
looks right
build the first sample
refine the keywords
approve first 100
expand it
confirm
approve company list
```

Fixture progression:

```text
sample v1 → refinement_required
sample v2 → expansion_ready
expanded list v1 → expansion_ready
```

Pass condition: zero internal commands or IDs; final stage is contact generation, but contacts have not executed.

### Simulation S02 — Mid-campaign requirements change

Conversation:

```text
build the first sample
approve first 100
Actually change it to Florida only.
debug campaign workflow
```

Pass condition:

- Requirements version increments.
- Fingerprint changes.
- Sample, QA, sample approval, expansion job, expanded list, and final approval are invalidated or cleared.
- Stage returns to sample build.

### Simulation S03 — Interruption and recovery

Conversation:

```text
build the first sample
Send Ryan a Google Meet tomorrow.
continue the campaign
restart
continue
```

Pass condition: calendar intent executes independently and the campaign resumes at the exact prior decision.

### Simulation S04 — Expansion timeout and restart

Conversation:

```text
approve first 100
expand to 1000
confirm
restart
resume expansion
restart
approve company list
```

Pass condition: one expansion job, no duplicated company IDs, current expanded QA, and one final approval.

## Acceptance execution policy

The deterministic suite must:

- Run from a clean store and from migrated legacy fixtures.
- Execute every conversation through the same top-level conversation entry point used by the live application.
- Capture every user message, assistant response, canonical snapshot, provider fixture call, and persistence commit.
- Restart the process rather than merely re-importing a function for restart scenarios.
- Compare visible responses with canonical state after every turn.
- Fail on generic-menu fallback when a pending action should consume the reply.
- Fail on internal IDs or exact-command instructions in normal operator responses.
- Fail on success rendered before persistence.
- Fail on unexpected provider calls.

## Release gate before Phase 4

Phase 4 may begin only when:

1. All acceptance conversations pass deterministically.
2. The four full simulations pass across real process restarts.
3. No contradictory QA recommendation is observed.
4. No stale approval survives a requirements or dataset change.
5. Expansion resumes without duplicates.
6. Calendar and unrelated intents suspend and resume Campaign Builder correctly.
7. Diagnostics match every transition.
8. A short, explicitly approved live smoke test passes without hidden commands.
9. Remaining failures are documented and accepted as out-of-scope technical debt.

Until this gate passes, Campaign Builder should be treated as acceptance-testing work, not as ready input for Contact Generation.

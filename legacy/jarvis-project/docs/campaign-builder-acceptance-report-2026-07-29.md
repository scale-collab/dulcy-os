# Campaign Builder Release-Candidate Acceptance Report

Date: July 29, 2026  
Specification: `docs/campaign-builder-acceptance-specification.md`  
Release candidate boundary: final company-list approval; no contacts or paid live provider actions

## Executive result

**Release decision: FAIL — do not begin Contact Generation.**

The mandated acceptance environment does not exist in the repository: there is no deterministic Campaign Builder provider fixture or scenario runner capable of executing all 97 atomic conversations and four simulations through `orchestrator.conversation_manager.handle_conversation_turn`, capturing commits, and restarting real processes.

The audit did not add product features or patch failures. It executed the portions that could be reached without internal commands, state injection, or paid providers. The natural operator path failed during setup, preventing valid downstream execution. Downstream scenarios are therefore recorded as FAIL/BLOCKED rather than credited from lower-level tests that directly seed state.

No live or paid provider action was executed.

## Execution evidence

### RC-E01 — A01 through the real top-level entry point

Input:

> New campaign for Acme Growth. Target B2B event marketing agencies in the United States. Lead magnet, prep today, launch Thursday.

Output:

> Got it — starting a new campaign. What client is this for?

Result: FAIL. The response ignored the already supplied client, ICP, location, strategy, prep date, and launch date.

### RC-E02 — S01 natural setup prefix

Executed through `handle_conversation_turn` from a clean temporary store:

1. `new campaign`
2. `Acme Growth`
3. `Target B2B event marketing agencies in the United States with a lead magnet.`
4. `11-200`
5. `today`
6. `Thursday`
7. `approve`
8. `looks right`
9. `build the first sample`

The workflow accepted the client and thesis, but every reply from step 4 onward returned the same setup loop:

> I couldn't resolve the remaining setup value … Still needed: strategy_type, prep_date, launch_date.

Result: FAIL. S01 cannot reach planning without changing the operator conversation or injecting state.

### RC-E03 — Existing top-level conversation suite

`tests/smoke_conversation_manager.py` crashed during natural strategy approval:

```text
ValueError: Invalid campaign transition: campaign_planning -> company_sample_build
```

Result: FAIL. Approval attempts to skip `campaign_strategy_review` after a specialist/ICP review path returns the canonical stage to planning.

### RC-E04 — Canonical QA persistence suite

`tests/smoke_campaign_canonical_qa_persistence.py` failed:

```text
AssertionError: workflow should enter company_sample_qa
```

The DiscoLike wrapper reports success independently of whether the canonical QA write advanced the bound campaign build.

Result: FAIL.

### Supporting suites that passed

These are supporting evidence only. They are not counted as acceptance passes because several seed state directly or enter below the top-level conversation boundary.

- Campaign conversation persistence: 43 checks
- Campaign conversation orchestrator: 67 checks
- Natural dates: 19 checks
- Ava ownership: 29 checks
- Agent delegation: 96 checks
- Canonical workflow unit smoke
- Command QA persistence: 14 checks
- Phase 3 company pipeline: 27 checks
- Ryan corrective routing: 20 checks
- Corrective operation: 15 checks
- Scout A/B intelligence: 22 checks

## Failure taxonomy and root causes

### RC-01 — Missing acceptance execution infrastructure

Category: Provider integration / Recovery / Diagnostic inconsistency

The specification requires deterministic sample, QA, refinement, expansion, timeout, duplicate-page, calendar, corruption, and restart fixtures. No fixture or acceptance runner implements this contract. Existing smoke fixtures are fragmented, often call lower-level handlers, and do not capture every conversation turn, commit, provider call, and process restart.

Impact: C01–I10 and S01–S04 cannot be release-qualified without bypassing the acceptance policy.

### RC-02 — Compound campaign-start input is discarded

Category: NLP / intent / Routing

The start detector recognizes “new campaign” and immediately emits the client prompt. It does not pass the remainder of the same utterance into setup extraction.

Impact: A01 fails and creates unnecessary operator repetition.

### RC-03 — Multi-missing-field setup cannot consume natural partial replies

Category: NLP / intent / Conversation UX

Whole-message field parsing is applied only when exactly one field is represented in the pending-field list. Employee range is not included in the strategy/date pending list after thesis capture. Consequently `11-200`, `today`, and `Thursday` are rejected while several setup values remain.

Impact: A02 and S01 fail; the operator becomes trapped in a repetitive prompt.

### RC-04 — Strategy approval can skip a canonical stage

Category: Approval lifecycle / Routing

After an ICP/specialist review moves canonical state back to `campaign_planning`, the direction-approval handler attempts a direct transition to `company_sample_build`. The state machine correctly rejects that transition because `campaign_strategy_review` is required.

Impact: B01–B10 and the top-level conversation suite can crash rather than pause safely.

### RC-05 — QA wrapper masks canonical persistence failure

Category: State persistence / Artifact lifecycle / Diagnostic inconsistency

The DiscoLike QA persistence wrapper returns `success: true` after saving its lead-list-local QA even when the canonical recorder is skipped or fails. The nested canonical result is not promoted to the command result.

Impact: QA can appear successful without `workflow_stage=company_sample_qa`, recreating two observable persistence outcomes.

### RC-06 — Required restart mechanism is absent

Category: Recovery

No acceptance runner starts a new process at each specified milestone while retaining only persisted stores and fixture checkpoints.

Impact: H04–H12 and S03–S04 are unverified.

## Scenario report

Legend:

- `FAIL` means the release criterion was not demonstrated.
- Quality is the operator experience score from 1–10. Blocked scenarios receive 1 because no valid operator conversation could reach or complete them.
- `1+` intervention means the operator would need to change the specified conversation, use an internal shortcut, or accept an invalid bypass.
- `Prerequisite` means the scenario could not be validly reached after the setup/approval blockers.

| Scenario | Result | Quality | Operator interventions | Unexpected clarifications | Unexpected handoffs | Context losses | Recovery/restart | Blocking defect | Minor polish | Root cause / category |
|---|---:|---:|---:|---:|---:|---:|---|---|---|---|
| A01 | FAIL | 2 | 1+ | Client requested despite being supplied | 0 | Client, ICP, strategy, dates discarded | n/a | Compound start input not parsed | Mechanical reset prompt | RC-02 NLP / Routing |
| A02 | FAIL | 2 | 1+ | `11-200` rejected in natural S01 | 0 | Employee value not captured | n/a | Employee range absent from active pending-field model | Repeated generic prompt | RC-03 NLP / UX |
| A03 | FAIL | 1 | 1+ | Prerequisite context not naturally reachable | 0 | n/a | n/a | Setup path blocked | n/a | RC-01/03 |
| A04 | FAIL | 2 | 1+ | `today` rejected while multiple values missing | 0 | Date not captured | n/a | Partial setup reply not field-routed | Repeated generic prompt | RC-03 NLP / UX |
| A05 | FAIL | 2 | 1+ | `Thursday` rejected while multiple values missing | 0 | Date not captured | n/a | Partial setup reply not field-routed | Repeated generic prompt | RC-03 NLP / UX |
| A06 | FAIL | 1 | 1+ | Prerequisite context not naturally reachable | 0 | n/a | n/a | Setup path blocked | n/a | RC-01/03 |
| A07 | FAIL | 1 | 1+ | Prerequisite context not naturally reachable | 0 | n/a | n/a | Setup path blocked | n/a | RC-01/03 |
| A08 | FAIL | 1 | 1+ | Prerequisite context not naturally reachable | 0 | n/a | n/a | Setup path blocked | n/a | RC-01/03 |
| A09 | FAIL | 1 | 1+ | Prerequisite context not naturally reachable | 0 | n/a | n/a | Setup path blocked | n/a | RC-01/03 |
| A10 | FAIL | 1 | 1+ | Prerequisite context not naturally reachable | 0 | n/a | n/a | Setup path blocked | n/a | RC-01/03 |
| B01 | FAIL | 1 | 1+ | n/a | Ryan exposed during transition | Stage transition lost review milestone | n/a | Approval raises invalid transition | Specialist-oriented prompt | RC-04 Approval lifecycle |
| B02 | FAIL | 1 | 1+ | n/a | n/a | Prerequisite | n/a | Approval path unsafe | n/a | RC-04 |
| B03 | FAIL | 1 | 1+ | n/a | n/a | Prerequisite | n/a | Approval path unsafe | n/a | RC-04 |
| B04 | FAIL | 1 | 1+ | n/a | n/a | Prerequisite | n/a | Requirements review unreachable | n/a | RC-01/04 |
| B05 | FAIL | 1 | 1+ | n/a | n/a | Prerequisite | n/a | Requirements review unreachable | n/a | RC-01/04 |
| B06 | FAIL | 1 | 1+ | n/a | n/a | Prerequisite | n/a | Requirements review unreachable | n/a | RC-01/04 |
| B07 | FAIL | 1 | 1+ | n/a | n/a | Prerequisite | n/a | Requirements review unreachable | n/a | RC-01/04 |
| B08 | FAIL | 1 | 1+ | n/a | n/a | Prerequisite | n/a | Requirements review unreachable | n/a | RC-01/04 |
| B09 | FAIL | 1 | 1+ | n/a | Potential specialist ownership ambiguity | Prerequisite | n/a | Requirements review unreachable | Specialist naming | RC-01/04 |
| B10 | FAIL | 1 | 1+ | n/a | n/a | Prerequisite | n/a | Plan re-versioning unexecuted | n/a | RC-01/04 |
| C01 | FAIL | 1 | 1+ | n/a | n/a | Prerequisite | n/a | Deterministic provider fixture missing | n/a | RC-01 Provider integration |
| C02 | FAIL | 1 | 1+ | n/a | n/a | Prerequisite | n/a | Fixture/context missing | n/a | RC-01 |
| C03 | FAIL | 1 | 1+ | n/a | n/a | Prerequisite | n/a | Fixture/context missing | n/a | RC-01 |
| C04 | FAIL | 1 | 1+ | n/a | n/a | Prerequisite | n/a | Fixture/context missing | n/a | RC-01 |
| C05 | FAIL | 1 | 1+ | n/a | n/a | Prerequisite | n/a | Fixture/context missing | n/a | RC-01 |
| C06 | FAIL | 1 | 1+ | n/a | n/a | Prerequisite | n/a | Repeat-page fixture missing | n/a | RC-01 Provider integration |
| C07 | FAIL | 1 | 1+ | n/a | n/a | Prerequisite | n/a | Live-mode fixture injection missing | n/a | RC-01 |
| C08 | FAIL | 1 | 1+ | n/a | n/a | Prerequisite | n/a | Provider-failure fixture missing | n/a | RC-01 |
| D01 | FAIL | 1 | 1+ | n/a | n/a | Prerequisite | n/a | Canonical QA path not release-stable | n/a | RC-05 State persistence |
| D02 | FAIL | 1 | 1+ | n/a | n/a | Prerequisite | n/a | QA fixture missing | n/a | RC-01/05 |
| D03 | FAIL | 1 | 1+ | n/a | n/a | Prerequisite | n/a | QA fixture missing | n/a | RC-01/05 |
| D04 | FAIL | 1 | 1+ | n/a | n/a | Prerequisite | n/a | Contradictory-count fixture missing | n/a | RC-01 |
| D05 | FAIL | 1 | 1+ | n/a | n/a | Prerequisite | n/a | Evidence fixture missing | n/a | RC-01 |
| D06 | FAIL | 1 | 1+ | n/a | n/a | Prerequisite | n/a | Canonical QA context unavailable | n/a | RC-01/05 |
| D07 | FAIL | 1 | 1+ | n/a | n/a | Prerequisite | n/a | Canonical QA context unavailable | n/a | RC-01/05 |
| D08 | FAIL | 1 | 1+ | n/a | n/a | Prerequisite | n/a | Canonical QA context unavailable | n/a | RC-01/05 |
| D09 | FAIL | 1 | 1+ | n/a | n/a | Prerequisite | n/a | Canonical QA context unavailable | n/a | RC-01/05 |
| D10 | FAIL | 1 | 1+ | n/a | n/a | Prerequisite | n/a | Canonical QA context unavailable | n/a | RC-01/05 |
| D11 | FAIL | 1 | 1+ | n/a | n/a | Prerequisite | n/a | Canonical QA context unavailable | n/a | RC-01/05 |
| D12 | FAIL | 1 | 1+ | n/a | n/a | Prerequisite | n/a | Canonical QA context unavailable | n/a | RC-01/05 |
| D13 | FAIL | 1 | 1+ | n/a | n/a | Prerequisite | n/a | Canonical QA context unavailable | n/a | RC-01/05 |
| D14 | FAIL | 1 | 1+ | n/a | n/a | Prerequisite | n/a | Evidence-boundary fixture missing | n/a | RC-01 |
| E01 | FAIL | 1 | 1+ | n/a | n/a | Prerequisite | n/a | End-to-end corrective fixture missing | n/a | RC-01 |
| E02 | FAIL | 1 | 1+ | n/a | n/a | Prerequisite | n/a | End-to-end corrective fixture missing | n/a | RC-01 |
| E03 | FAIL | 1 | 1+ | n/a | n/a | Prerequisite | n/a | End-to-end corrective fixture missing | n/a | RC-01 |
| E04 | FAIL | 1 | 1+ | n/a | n/a | Prerequisite | n/a | End-to-end corrective fixture missing | n/a | RC-01 |
| E05 | FAIL | 1 | 1+ | n/a | n/a | Prerequisite | n/a | End-to-end corrective fixture missing | n/a | RC-01 |
| E06 | FAIL | 1 | 1+ | n/a | n/a | Prerequisite | n/a | End-to-end corrective fixture missing | n/a | RC-01 |
| E07 | FAIL | 1 | 1+ | n/a | n/a | Prerequisite | n/a | End-to-end corrective fixture missing | n/a | RC-01 |
| E08 | FAIL | 1 | 1+ | n/a | n/a | Prerequisite | n/a | End-to-end corrective fixture missing | n/a | RC-01 |
| E09 | FAIL | 1 | 1+ | n/a | n/a | Prerequisite | n/a | End-to-end corrective fixture missing | n/a | RC-01 |
| E10 | FAIL | 1 | 1+ | n/a | n/a | Prerequisite | n/a | End-to-end corrective fixture missing | n/a | RC-01 |
| E11 | FAIL | 1 | 1+ | n/a | n/a | Prerequisite | n/a | End-to-end corrective fixture missing | n/a | RC-01 |
| E12 | FAIL | 1 | 1+ | n/a | n/a | Prerequisite | n/a | End-to-end corrective fixture missing | n/a | RC-01 |
| E13 | FAIL | 1 | 1+ | n/a | n/a | Prerequisite | n/a | Versioned change fixture missing | n/a | RC-01 |
| E14 | FAIL | 1 | 1+ | n/a | n/a | Prerequisite | n/a | Corrective-failure fixture missing | n/a | RC-01 |
| F01 | FAIL | 1 | 1+ | n/a | n/a | Prerequisite | n/a | Approval context unreachable | n/a | RC-01/04/05 |
| F02 | FAIL | 1 | 1+ | n/a | n/a | Prerequisite | n/a | Approval context unreachable | n/a | RC-01/04/05 |
| F03 | FAIL | 1 | 1+ | n/a | n/a | Prerequisite | n/a | Approval context unreachable | n/a | RC-01/04/05 |
| F04 | FAIL | 1 | 1+ | n/a | n/a | Prerequisite | n/a | Failed-QA approval context unavailable | n/a | RC-01/05 |
| F05 | FAIL | 1 | 1+ | n/a | n/a | Prerequisite | n/a | Paid-confirmation fixture unavailable | n/a | RC-01 |
| F06 | FAIL | 1 | 1+ | n/a | n/a | Prerequisite | n/a | Approval context unavailable | n/a | RC-01 |
| F07 | FAIL | 1 | 1+ | n/a | n/a | Prerequisite | n/a | Expansion fixture unavailable | n/a | RC-01 |
| F08 | FAIL | 1 | 1+ | n/a | n/a | Prerequisite | n/a | Expansion fixture unavailable | n/a | RC-01 |
| F09 | FAIL | 1 | 1+ | n/a | n/a | Prerequisite | n/a | Expansion fixture unavailable | n/a | RC-01 |
| F10 | FAIL | 1 | 1+ | n/a | n/a | Prerequisite | n/a | Expansion fixture unavailable | n/a | RC-01 |
| F11 | FAIL | 1 | 1+ | n/a | n/a | Prerequisite | Timeout untested | Timeout/checkpoint fixture missing | n/a | RC-01 Provider integration |
| F12 | FAIL | 1 | 1+ | n/a | n/a | Prerequisite | Resume untested | Timeout/checkpoint fixture missing | n/a | RC-01 Recovery |
| F13 | FAIL | 1 | 1+ | n/a | n/a | Prerequisite | n/a | Expanded QA fixture missing | n/a | RC-01 |
| F14 | FAIL | 1 | 1+ | n/a | n/a | Prerequisite | n/a | Quality-drift fixture missing | n/a | RC-01 |
| G01 | FAIL | 1 | 1+ | n/a | n/a | Prerequisite | n/a | Final-review context unavailable | n/a | RC-01 |
| G02 | FAIL | 1 | 1+ | n/a | n/a | Prerequisite | n/a | Final-review context unavailable | n/a | RC-01 |
| G03 | FAIL | 1 | 1+ | n/a | n/a | Prerequisite | n/a | Final-review context unavailable | n/a | RC-01 |
| G04 | FAIL | 1 | 1+ | n/a | n/a | Prerequisite | n/a | Premature-contact boundary not acceptance-executed | n/a | RC-01 |
| G05 | FAIL | 1 | 1+ | n/a | n/a | Prerequisite | n/a | Stale-expanded-QA fixture missing | n/a | RC-01 |
| H01 | FAIL | 1 | 1+ | n/a | n/a | Prerequisite | Suspension untested | Deterministic calendar fixture missing | n/a | RC-01 |
| H02 | FAIL | 1 | 1+ | n/a | n/a | Prerequisite | Resume untested | Calendar fixture missing | n/a | RC-01 |
| H03 | FAIL | 1 | 1+ | n/a | n/a | Prerequisite | Resume untested | Analytics fixture missing | n/a | RC-01 |
| H04 | FAIL | 1 | 1+ | n/a | n/a | Prerequisite | Not executed | Process-restart harness missing | n/a | RC-06 Recovery |
| H05 | FAIL | 1 | 1+ | n/a | n/a | Prerequisite | Not executed | Process-restart harness missing | n/a | RC-06 |
| H06 | FAIL | 1 | 1+ | n/a | n/a | Prerequisite | Not executed | Process-restart harness missing | n/a | RC-06 |
| H07 | FAIL | 1 | 1+ | n/a | n/a | Prerequisite | Not executed | Process-restart harness missing | n/a | RC-06 |
| H08 | FAIL | 1 | 1+ | n/a | n/a | Prerequisite | Not executed | Corrective checkpoint/restart harness missing | n/a | RC-06 |
| H09 | FAIL | 1 | 1+ | n/a | n/a | Prerequisite | Not executed | Process-restart harness missing | n/a | RC-06 |
| H10 | FAIL | 1 | 1+ | n/a | n/a | Prerequisite | Not executed | Expansion checkpoint/restart harness missing | n/a | RC-06 |
| H11 | FAIL | 1 | 1+ | n/a | n/a | Prerequisite | Not executed | Process-restart harness missing | n/a | RC-06 |
| H12 | FAIL | 1 | 1+ | n/a | n/a | Prerequisite | Six restarts not executed | Process-restart harness missing | n/a | RC-06 |
| I01 | FAIL | 1 | 1+ | n/a | n/a | Setup context incomplete | n/a | Full diagnostic invariant harness missing | Debug is implementation-oriented | RC-01 |
| I02 | FAIL | 1 | 1+ | n/a | n/a | Prerequisite | n/a | Sample context unavailable | n/a | RC-01 |
| I03 | FAIL | 1 | 1+ | n/a | n/a | Prerequisite | n/a | QA stage persistence failure | n/a | RC-05 Diagnostic inconsistency |
| I04 | FAIL | 1 | 1+ | n/a | n/a | Prerequisite | n/a | Corrective context unavailable | n/a | RC-01 |
| I05 | FAIL | 1 | 1+ | n/a | n/a | Prerequisite | n/a | Expansion context unavailable | n/a | RC-01 |
| I06 | FAIL | 1 | 1+ | n/a | n/a | Prerequisite | n/a | Final-approval context unavailable | n/a | RC-01 |
| I07 | FAIL | 1 | 1+ | n/a | n/a | Prerequisite | Repair not process-tested | Corruption/reload fixture missing | n/a | RC-01/06 |
| I08 | FAIL | 1 | 1+ | n/a | n/a | Prerequisite | Blocker not process-tested | Corruption/reload fixture missing | n/a | RC-01/06 |
| I09 | FAIL | 1 | 1+ | n/a | n/a | Prerequisite | Conflict recovery untested | Corruption fixture missing | n/a | RC-01/06 |
| I10 | FAIL | 1 | 1+ | n/a | n/a | Prerequisite | Reconciliation untested | Canonical QA stage failure | n/a | RC-05 |
| S01 | FAIL | 1 | 5+ | Repeated generic setup prompt | 0 | Employee, prep and launch replies not captured | n/a | Natural simulation cannot leave setup | Repetitive and mechanical | RC-03 NLP / UX |
| S02 | FAIL | 1 | 1+ | n/a | n/a | Prerequisite | n/a | Sample approval context unavailable | n/a | RC-01/04/05 |
| S03 | FAIL | 1 | 1+ | n/a | n/a | Prerequisite | Restart not executed | Calendar/restart fixtures missing | n/a | RC-01/06 |
| S04 | FAIL | 1 | 1+ | n/a | n/a | Prerequisite | Restart not executed | Expansion/restart fixtures missing | n/a | RC-01/06 |

## Conversation quality audit

Observed mechanical behavior:

1. A complete campaign request receives a reset-style client question even though the client is already present.
2. The same “I couldn't resolve … Still needed …” response repeats for employee range, dates, approval, and sample-build intent.
3. The campaign name silently defaults to `Direct Offer` even when the thesis says “lead magnet.”
4. The response introduces Scout, Ryan, and Sean even though the operator should experience Ava/Jarvis as the single interface.
5. “Before I build the list” and specialist parameter prompts expose handoff mechanics instead of presenting one Ava-owned decision.
6. Approval can produce an exception rather than a safe, operator-facing recovery response.
7. Debug output is comprehensive but cannot be trusted as a release invariant while canonical QA persistence can fail beneath a successful wrapper.

Recommended conversational improvements, without changing business rules:

- Parse all usable fields from the first utterance before asking a follow-up.
- When several fields are missing, route a short reply to any uniquely recognizable field instead of requiring a full sentence.
- Acknowledge saved values and ask only for what remains.
- Replace repeated failure text with field-specific guidance.
- Keep Ava as the visible speaker and describe specialists only when the operator asks.
- Turn invalid transitions into a recovery pause with a clear next decision, never an exception.
- Avoid internal terms such as canonical stages, handlers, artifact IDs, and QA commands in normal responses.

## Recovery audit

| Restart point | Result | Finding |
|---|---|---|
| Setup | FAIL | Natural setup itself is blocked; no release restart run |
| Planning | FAIL | Approval transition can crash |
| Strategy review | FAIL | Stage can be skipped after specialist review |
| Sample build | FAIL | Deterministic provider fixture absent |
| QA | FAIL | Canonical QA stage assertion fails |
| Refinement | FAIL | No end-to-end restart fixture |
| Approval | FAIL | Approval transition unsafe |
| Expansion | FAIL | No timeout/de-duplication/restart fixture |
| Final company approval | FAIL | Upstream context unreachable |

No restart milestone currently meets the specification’s release evidence standard. Existing persistence unit tests are useful but do not replace real process restarts at every milestone.

## Diagnostics audit

Result: FAIL.

- `debug campaign workflow` has substantial canonical fields, but there is no runner comparing it with every preceding persisted transition.
- The canonical QA smoke failure proves a QA operation can fail to advance the build while its outer command still reports success.
- Because the wrapper and canonical recorder can disagree, diagnostics cannot yet be certified as a single source of truth.
- Corruption scenarios I07–I10 lack process-level fixtures and were not acceptance-executed.

## Release prioritization

### Critical blockers

1. Compound one-turn setup discards supplied requirements.
2. Natural multi-field setup becomes trapped and S01 cannot reach planning.
3. Strategy approval can crash on an invalid canonical transition.
4. Canonical QA persistence is not reliably reflected by the command result.
5. The required deterministic acceptance and restart harness is absent.

### High-priority issues

1. Employee range is not modeled consistently in setup pending fields.
2. Partial date replies work only in narrow single-missing-field state.
3. Provider/canonical persistence outcomes can diverge.
4. No end-to-end expansion timeout, de-duplication, and restart proof.
5. No calendar-interruption acceptance fixture.

### Medium issues

1. Strategy can default incorrectly in the generated campaign name.
2. Specialist names and handoff language are overexposed.
3. Generic setup errors are not field-specific.
4. Debug correctness is asserted piecemeal rather than after every transition.

### Polish items

1. Reduce repeated “Jarvis Campaign Build” framing.
2. Avoid repeated specialist introductions.
3. Replace mechanical menus with the current decision and two or three relevant responses.
4. Use concise confirmations that identify exactly what was saved.

## Scores

- Conversation score: **2/10**
- Architecture score: **6/10**
- Production readiness: **Not ready**
- Critical blockers remaining: **5**

## Recommended next phase

Remain in **Phase 3.5 — Campaign Builder Acceptance**.

Do not begin Contact Generation. First resolve the documented root causes, then add the deterministic audit-only acceptance harness required by the existing specification and rerun all 101 scenarios through the real top-level entry point with real process restarts. A short, explicitly approved live smoke should occur only after the deterministic suite is green.

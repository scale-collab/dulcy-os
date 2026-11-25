# Evidence and decision contract

## Contents
- Human-review output
- Shared client context
- Machine-readable offline fixture format
- Validation limits
- Implementation boundary

## Human-review output

Return enough detail for a human to decide without opening five systems. For a simple reply, keep it concise; do not expose an internal chain of thought. Provide evidence, the decision and a short rationale.

1. Snapshot: client/workspace/campaign, sender/recipient/participants, canonical source link, thread/latest message IDs, captured time, provider-current or historical/mirror-only, identity confidence and conflicts. Include relevant cross-channel stops, preferences and ownership.
2. Effective settings: source/version, tone, length, language, objective, CTA/scheduling method, cadence/office hours/timezone, asset eligibility, reviewer and relevant overrides. State missing material settings.
3. Buyer request: all material questions and a brief supporting excerpt. Separate explicit facts from inferred motivation.
4. Classification: primary intent, other requests, awareness/readiness, purchase intent, heat, fit and stage; unknown is valid. Preserve meeting and promise states separately.
5. Obligations: exact current promise, delivery mode/conditions, requested assets/answers, previous fulfillment evidence, what remains open, and buyer's timing constraint.
6. Next action: no-send, deliver, answer, clarify, schedule, defer, handoff, suppression-review or booking-service. Give a short evidence-based reason and the client-specific next stage.
7. Draft: review-only text or no draft. Label any hypothetical illustration clearly; never call a placeholder-filled example ready. Provide sources/approval status for every material factual, commercial, asset and scheduling claim.
8. Responsibility: one accountable owner, fulfillment/technical owner if different, waiting-on party, due time with timezone or explicit review trigger, backup/escalation route, and the exact blocker. Missing owner is itself a blocker. Do not invent a deadline or service guarantee.
9. Gates: current version/freshness, identity, suppression, human ownership, open obligations, selected settings, approved claims/assets, availability and no-send controls. List concrete changes that would invalidate the draft.

The objective is not to fill every slot mechanically. Omit irrelevant sections in a short human-facing answer, but retain the evidence and controls in a machine handoff. If the user asks for only a draft, give only the supported draft plus a material blocker if required. Do not fabricate missing facts merely to satisfy formatting.

## Shared client context

The canonical semantic contract is `rules/client-promise-contract.md`, version 1.1 or a verified later revision. Resolve it by installed skill name. This module consumes it; it does not redefine commercial approval.

Bind campaign builder and replier to the same context and exact outbound promise. The bundle must include:
- Identity and version: client/workspace/campaign/sender, approver, approval date and source links.
- Buyer and offer: business model, role, use case, desired outcome, eligibility/exclusions, exact free/paid scope and quantity, price/terms, proof and claim limitations.
- Fulfillment: exact delivery format/method, disclosed and accepted conditions, required inputs, assets/approval/access, owner/backup, readiness, turnaround/capacity, actual transfer evidence and amendments.
- Sales motion: qualification and disqualifiers, appropriate stages, technical/procurement/stakeholder requirements, meeting purpose, calendar/method/owner.
- Operating profile: selected style/length/language/CTA/cadence/office hours, suppression/compliance, reviewer and execution permissions.

Commercial approval is by claim and scope; a generic “context approved” flag must not launder stale prices, another client's assets or unsupported guarantees. If sources disagree, show the conflict and owner. Historical promise versions remain binding evidence even when approved commercial context changes later.

## Machine-readable offline fixture format

The bundled JSON is a compact contract-lint format, not a proposed production database migration or a complete semantic model. Each case has `id`, `input`, `decision`, `expect_valid`, and optional `expect_errors`. It uses synthetic clients/addresses only. Truth/evidence labels are fixture inputs, not model conclusions.

Input fields:
- `client_id`, `workspace_id`, `context_version`, `settings_version`, `latest_message_id`.
- `identity_verified`, `provider_current`, `historical_replay`.
- `opt_out`, `automatic`, `declined`, `existing_booking`, `current_customer`, `human_owned`, `uncertain_send`, `material_conflict`, `cross_channel_stop`.
- `request`, `meeting_basis`, `buyer_timing_due`, `availability_verified`.
- `promise`: `mode` (`email`, `link`, `call`, `unspecified`, `none`), `call_agreed`, `quantity`, `free`, `asset_ready`, `asset_approved`, `access_verified`, `sharing_allowed`, `conditions`.
- `settings`: `resolved`, `tone`, `length`, `language`, `cta`, `cadence_resolved`, `office_hours_resolved`.

Decision fields:
- `mode: draft_only`, `dispatch: false`, `action`, `scope`, `draft` (string or null).
- `client_id`, `workspace_id`, `context_version`, `settings_version`, `latest_message_id` must match input.
- `evidence`, `intent`, `awareness`, `purchase_intent`, `heat`, `fit`, `stage`.
- `reason`, `owner`, `review_trigger`, `blockers`, `invalidated_by`.
- `claims`: each has `kind`, `client_id`, `workspace_id`, `source`, `approved`.
- `answers_complete`, `promises_preserved`, `requires_call`, `requires_purchase`, `claims_delivery`, `fulfillment_state`, `proposed_quantity`, `proposed_free`, `proposed_conditions`, `uses_slots`, `new_qualification_gate`.

Supported actions are `no_send`, `deliver`, `answer`, `clarify`, `schedule`, `defer`, `handoff`, `suppression_review`, `booking_service`. Scope is `acquisition`, `service`, or `none`. A lint-valid historical replay remains review-only; `provider_current=false` cannot be interpreted as live clearance.

Run without network or side effects:

    python3 scripts/check_reply_contract.py assets/contract-fixtures.json

To lint one prepared case, pass a file with either a single case or a list of cases. The script prints errors and aggregate results, does not call providers, and exits nonzero when actual validity differs from the case's expectation or required error codes are missing. This is suitable for positive and intentionally invalid negative fixtures.

## Validation limits

The checker verifies declared structural constraints, provenance scope, explicit state conflicts, missing evidence flags and a small set of language patterns. It cannot prove that source approval is genuine, detect all fabricated prose, understand every question, verify actual links/availability, judge all B2B intent, or run the underlying language model. A passing fixture is not a passing historical conversation or a deployed system test.

Use semantic human review and independent chronological replay for those questions. Do not fix a test by weakening safety checks or marking a failed model answer as an expected pass. Retain regression cases with reasons for changed labels. Deterministic tests and human/model evaluation need distinct reports.

## Implementation boundary

This skill specifies behavior only. A separate user-authorized design/build may map it to the existing reply engine after inspecting actual current code/configuration. Do not activate all clients, change sending permissions, add CCs, generate credentials, or modify n8n/Airtable/provider records while applying the skill.

Any later sender must rehydrate the latest thread, resolve client/sender/recipient, check cross-channel suppression and current owner/event state, verify exact assets/claims/settings and require an explicit human send action on the exact current draft. A review approval, edited draft, timer or confidence threshold does not dispatch. On provider `success:false`, record failure; on ambiguous timeout, reconcile before retry. Separate alert delivery/acknowledgment from email processing and confirmed provider sending.

# Copy review and handoff contract

Version 1.3 · November 6, 2026

This is an upstream campaign-copy review contract. It does not modify or replace the canonical client-promise/settings contract v1.1 or Scribe reply decisions's decision contract. Resolve those by skill name for their own jobs.

## Contents
- Intake and version binding
- Review order
- Hard failures and editorial judgments
- Simple scripts with lead-specific variables
- Rendering and sequence QA
- Revision loop
- Output and approval
- Testing and feedback

## Intake and version binding

Bind the review to client/workspace/campaign, context version, approved offer/promise version, Atlas thesis and current copy version. Resolve facts from that client only. Record the approved voice, language, platform and variable schema when available; do not call copy platform-ready if the relevant schema is missing.

Separate raw source text from approved commercial facts. A claim on an old website, testimonial screenshot, draft offer sheet or prior successful email can be evidence to check, not blanket approval to publish it now. Never borrow another client's proof.

Keep a claim ledger: exact wording → same-client source → supported scope/timeframe/qualifier → approval status → intended variant(s). Keep observation → inference separate for prospect personalization. Unknown fields are explicit, not overwritten with generic AI defaults.

## Review order

1. Meaning: can a qualified reader explain who this is for, what it offers and why the next step is useful?
2. Truth: does every capability, result, number, name, signal, timeline, commercial term and work-state claim have the right evidence?
3. Promise: does the wording preserve exact deliverable, quantity, free/paid status, method, conditions, required input and owner readiness?
4. Buyer: is relevance specific without asserting an unobserved problem? Does the proof match the buyer and claim? Apply copy-framework’s competitor-swap and optional-opener checks as editorial judgments, using evidence rather than invented novelty.
5. Mechanism: is the approved process/output understandable where explanation is needed?
6. CTA: one main decision, genuinely appropriate to stage and delivery path; no hidden call gate or stacked asks.
7. Sequence: same offer, each step adds value, no contradictions or invented urgency.
8. Rendering: current platform tokens/spintax, representative complete and incomplete rows, punctuation and fallbacks.
9. Voice: selected client settings, plain language, no canned filler. Keep material qualifications.
10. Test: stated lever, downstream outcome, measurement unit/window and guardrails agreed with Atlas.

## Hard failures and editorial judgments

Block the affected send-ready output for:
- Unsupported or cross-client commercial claim, fabricated signal/proof/personalization.
- Unapproved price, guarantee, quantity, timeframe or other commitment.
- Unresolved material fulfillment/capacity/owner fact.
- Changed promise, missing condition, misleading free/paid status or hidden delivery hurdle.
- False work-state wording: “already built,” “reviewed,” “attached” or “sent” without matching evidence.
- Fake relationship, referral, research purpose, scarcity or urgency.
- Broken required variable, unsupported platform-ready claim, a branch that changes facts/terms, or unresolved sender/recipient/context identity.
- Suppression, human-send, approval or other policy conflict.

Label other issues as editorial recommendations: awkward rhythm, overly broad but truthful value, weak opening, repetitive proof or verbosity. Do not claim every preference is a hard failure. A 78-word draft with necessary truthful terms can be better than a 60-word draft that hides conditions.

One strong proof element may pass. No manufactured second proof point. A genuine technical buyer may need precise terminology. No mandatory free asset, guarantee, question-led opener, fixed four-email sequence or meeting ask.

## Simple scripts with lead-specific variables

Translate Atlas's GTM brief into one clear opportunity, one approved mechanism/proof and one next decision. Keep strategy and evidence outside the short prospect-facing script. Relevant custom values can make a shared sentence structure specific to each lead; more variables are not inherently better. Preserve required qualifications and exact promise conditions.

Bind each inserted value to Scout's contract: concept, source/date, observed vs inferred status, permitted wording, type, verified platform field mapping and required/optional fallback/hold behavior. Distinguish the recipient's business from the customer segment the offer proposes to reach for it. A proposed downstream audience is not proof those buyers need the product or are already in conversation. Do not turn an exhibitor observation into an assertion that events are the recipient's main source of business.

Use supported facts or clearly framed proposals. “We can build a route to [verified relevant buyer segment]” still requires approved capability; “we already opened conversations” additionally requires evidence that those exact conversations exist. Keep adjacent-market proof in its actual market and timeframe. Never insert a creator's result, another client's proof or fabricated experience as this client's accomplishment.

For optional missing context, omit the clause or use an approved truthful segment-level fallback. Unsupported material values hold the row; do not invent data to keep the sentence flowing. Verify grammar, entity alignment and promise consistency across representative rendered leads, null values and every meaning-changing spintax branch. Company names and built-in variables require QA too. Custom variables never relax fit, suppression, approvals or fulfillment gates.

Return the simple script plus a compact variable map and representative renders. Illustrative placeholders remain internal concepts until current platform syntax and mappings are verified; do not claim they exist in the live system. The user's October 23, 2026 supplied transcript demonstrates lead-specific context, not the author's exact backend fields or automation. Atlas's source-basis records the source/read scope; no claim of video playback follows.

## Rendering and sequence QA

Verify the sequencer's actual supported token/spintax form; do not assume a familiar-looking syntax is correct. Keep plain-text content usable even when platform details are unavailable, and label the unresolved export step.

For platform preflight, render at least 15 representative actual leads when available, as described in `references/drive-sop-basis.md`, plus the edge cases below. If fewer rows are available, inspect all and disclose the limited coverage. Never invent test rows and imply they are real prospect coverage. For every required variable record its source, type, freshness, fallback and exclusion condition. Render at least:
- A fully populated representative row.
- A missing/empty optional signal with the honest fallback.
- A missing required value that must hold the row.
- Names/companies with punctuation or non-ASCII characters.
- Every spintax branch where meaning/grammar may change; never spin exact proof, guarantees, numbers or technical specs.

A missing first name should use an approved neutral greeting or omit it, not leak braces. A missing research observation should not become “noticed your growth.” A title normalization must not change the person's actual role. Do not claim coverage of all combinatorial branches after only sampling them; report what was rendered.

Compare all sequence steps for quantity, price, mode, deadline, audience, offer and CTA consistency. Spintax variety is not a deliverability guarantee. Do not alter live sending/infrastructure settings through this review.

## Revision loop

Use a bounded practical loop:
1. Review against evidence and contract before polishing.
2. Return the 1–3 material issues, with the exact phrase and why it fails.
3. Revise only the necessary words or lever; preserve approved/winning facts and terms.
4. Recheck the changed claim/variable/promise plus sequence consistency.
5. Stop when hard gates pass and the draft is clear enough to test; do not endlessly generate cosmetic variants.

If a user says “make it better,” choose the highest-impact supported change and explain it briefly. If feedback changes the offer or commercial terms, route to Atlas offer strategy/client approval rather than silently implementing it as copy polish.

## Output and approval

Provide useful copy first, followed by a compact review packet when requested or material:

- Verdict: `concept`, `needs_revision`, `ready_for_review`, or `approved_for_test`.
- Client/context/offer/copy versions and source links.
- Recommended variant and what it tests.
- Subject(s), first touch and follow-ups, with platform/plain-text status.
- Claim evidence and important limitations.
- Exact promise/fulfillment reference and any blocked field/owner.
- Variables/fallbacks and rendering coverage.
- Editorial changes made; remaining decision or approval.
- Test hypothesis and handoff to Atlas.

`Ready_for_review` is not authorization to send. `Approved_for_test` requires current explicit approval evidence for the exact version and bounded test scope; it still does not authorize a different tool action or violate human-send controls. Material edits invalidate old approval. Preserve before/after and approver/time for later comparison.

If only the copy is requested, keep the output short while surfacing any material limitation. An internal concept with placeholders is not ready to upload. Do not hide blockers merely because the user requested no rationale.

## Testing and feedback

Atlas owns experimental design and launch. Pass one testable hypothesis and keep audience, send conditions and observation window comparable where feasible. State whether the unit is unique prospect, account, delivered message or all sequence messages. Do not mix denominators or call a multi-component comparison an isolated A/B test.

Track the client's meaningful progression: relevant replies, asset requests, actual fulfillment, explicit meeting interest, qualified attended meetings or technical/RFQ/sample milestones, and attributable sales when available. Include opt-outs, complaints, bad-fit replies, fulfillment load and human edit burden as guardrails. Infrastructure cost per reply is not all-in acquisition cost.

Do not declare a winner from a handful of early replies or a creator's benchmark. Note sparse data, delayed outcomes and uneven delivery. Preserve promising concepts while the agreed observation window is incomplete. Poor booking after many asset requests may be offer/intent/ownership/fulfillment, not wording; send that diagnosis to Atlas/Scribe reply decisions rather than adding pressure.

The system adds the opt-out P.S. ("or tell me to pound sand if you'd like..", Alex's standing choice and a proven winner, RULES 2026-11-20/23); Scribe writes no other opt-out line. A complaint about tone informs copy quality but never cancels the recipient’s stop request.

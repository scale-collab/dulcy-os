---
name: airtable-campaign-lead-list-center
description: Own Dulcy Campaign Center and Lead List Center managed operations, stage gates, verification, sender allocation, launch-readiness evidence and operational automation. Use for campaign/list execution, API and n8n/Make troubleshooting, object IDs, system mappings, retries and workflow repair. Atlas owns strategy/offer/client decisions, Scout targeting/fit, Scribe copy/replies/sales, Jarvis wider support. Managed interface controls take precedence over generic API-write guidance.
---

# Airtable

Use the user's demonstrated Airtable workflow as the operational source of truth for Dulcy campaigns and lead lists. Ground each execution in the actual client, campaign thesis, current records, and current interface. Follow the stage order and gates below; read the corresponding timestamped instructions in [references/airtable-workflow.md](references/airtable-workflow.md) before operating that stage.

## Start from the right state

1. Resolve the client and existing campaign/list before creating anything. Inspect active records and hidden history when relevant. Reuse the correct existing record for a repair or top-up.
2. Determine the requested outcome: strategy, new campaign, new list, review/repair, expansion/top-up, copy, sender setup, launch, or diagnosis. Continue from the verified current stage rather than restarting completed work.
3. Establish the current ICP, geography, size, personas, exclusions, offer, proof, volume, variables, and approval state from the user and client records. Ask only for material missing inputs. Keep contact geography distinct from company geography.
4. Use the Airtable interface for stage controls, generated requests/prompts, review gates, and automation status. Use connected read-only tools to inspect records where helpful. Do not substitute raw status/checkbox edits or direct provider calls for the interface's managed workflow. If access or the control is unavailable, report the precise blocked step; do not pretend a backend write completed the workflow.
5. Discover the actual current UI before clicking. The known Lead List Center entry is [Airtable Lead List Center](https://airtable.com/appxqINt5XKw7a76A/pag1PZd6cHL42uBwg); its metadata was identified during setup, but the complete signed-in UI was not revalidated when this skill was created. Navigate to Campaign Center through the available interface rather than guessing URLs or field IDs.

## Coordinate the specialists

- Use **Atlas / atlas-campaign-operator** for campaign thesis, new-versus-existing strategy, performance interpretation, and whether to top up, change vertical, change offer, or iterate copy.
- Use **Scout / scout-lead-list-builder** for company ICP, decision-maker relevance, discovery, exclusions, evidence-based company/contact QA, and output quality.
- Use **Scribe / scribe-cold-email-copywriter** for messaging, variants, proof, follow-ups, and spintax quality.
- Keep this skill responsible for the Airtable operating sequence, stage-specific settings, review gates, and completion evidence. Translate specialist outputs into those fields and steps without replacing their responsibilities. If a specialist is unavailable, follow the documented stage and flag any unresolved specialist decision.
- Give every handoff the same client, record/link, thesis, exclusions, current stage, observed evidence, and requested next action. Reconcile conflicts before advancing. Prefer the latest explicit user/client requirements over examples or old targeting.

## Follow the stage gates

### Campaign setup and copy

Read workflow sections 1–4.

- Name the campaign/list descriptively: audience, material filters, geography, source, and approach. Save the targeting sentence as the campaign thesis, with real evidence for any historical performance claim.
- Create or connect the matching lead list. Use realistic prep/launch dates and the matching approach.
- Keep client-facing Copy readable, without spintax or an added signature. Label split tests clearly by variant and step.
- Obtain external-client copy approval through the designated flow. Dulcy's own campaigns may use **Skip Approval and Prepare** when appropriate. This exception does not grant authority to launch or send.
- Import approved copy into Sequence, verify variants, steps, delays, and follow-up threading, then generate and validate spintax. Follow-up thread reply defaults on; a blank subject is expected for an in-thread reply.

### Company discovery and review

Read workflow sections 5–6.

- Treat **Generate Filters** as a draft. Inspect every include/exclude field and the exact outgoing DiscoLike JSON against the thesis before running.
- Run **First 100 Companies**. Review actual companies, tier decisions, reasons, usability, and the linked sheet, not just a similarity score or aggregate percentage.
- Aim for at least 80% usable company/contact fit, preferably 85%+. Refine mismatched criteria and rerun the sample before expansion. If a much larger, constrained list warrants a lower usable rate, explicitly document the volume/quality tradeoff and obtain the needed decision; never silently lower the gate or keep bad fits.
- Review any deep-qualification prompt against the actual client and objective requirements. Resolve conflicts before saving it or using it for expansion.
- Complete the required company-review approval gate, then expand only to the requested/authorized size. Approval checkboxes record a review; they do not establish user authorization by themselves.

### Contacts, verification, and enrichment

Read workflow sections 7–9.

- Define the buying responsibility/persona and appropriate role filters. Default to at most five people per company unless the campaign needs a different cap; a cap is not promised yield.
- Test contacts from the **first 100 companies**, not merely 100 contacts. QA contact authority and fit separately from company fit. Approve the contact sample before expanding against the approved usable companies.
- After provider contact search, do not add a second paid AI/web-research review pass. Keep ambiguous, potentially suitable contacts in **NeedsReview** for manual **Approve / Reject / Leave pending**; never auto-approve ambiguity to avoid review costs.
- **Apply contact decisions** applies only existing manual decisions to the matching contact identities. It must not trigger paid research, fresh contact search or inferred decisions. Unmatched/ambiguous identities and undecided rows remain pending; inspect the receipt before claiming decisions applied. See workflow section 7 for the October 9 process correction.
- Select Direct or Direct + Generic based on the real audience. Preserve separate direct/generic types. Run MillionVerifier first; use **Check Status** for a waiting/timed-out job instead of resubmitting it.
- Use higher-cost contact sources, recovery, or SEG exclusions only when supported by campaign evidence and within authorization. Do not treat catch-all/risky emails as confirmed deliverable.
- Prepare and inspect the enrichment prompt for needed variables before running approved enrichment; skip it when unnecessary. Run Automated QA, correct flagged missing/invalid values in the project sheet, and rerun QA. Declare the list complete only after verification and QA evidence support it.

### Senders, launch readiness, and analytics

Read workflow sections 10–11.

- Inspect sender states early, but allocate final senders only after the usable final lead count is known. Calculate against actual daily cold limits, step count/delays, available/releasing capacity, and possible idle gaps or collisions. The displayed maximum accounts is not a minimum.
- Verify campaign timezone, dates, schedule, plain text, daily email/lead caps, and final sequence. Prepare/upload/import only within the current request's scope; inspect imported leads, variables, and spintax in EmailBison.
- Launch only with all required client/user approvals and explicit authority for the actual audience and campaign. A request to build a skill, list, or draft does not authorize outreach, spending, sharing, or launch.
- Use current synchronized data for ongoing decisions. At roughly 60% completion, inspect the next-campaign recommendation and evidence; assess bounce/provider data and sequence/variant performance with sample adequacy before declaring winners.

## Use defaults carefully

Read [references/defaults-and-evidence.md](references/defaults-and-evidence.md) when applying defaults, interpreting examples, or diagnosing uncertain provider behavior. Treat the walkthrough's Florida agencies, industries, employee ranges, copy offers, revenue/footprint thresholds, percentages, sender counts, and bounce examples as examples. Do not carry them into unrelated clients. Recheck uncertain provider syntax, advanced-filter definitions, bounce interpretations, sync timing, and automation duration against current evidence.

## Report and recover accurately

For the requested stage, return the record/link, what changed, evidence reviewed, sample/usable/final counts as applicable, approval/job status, exact blocker if any, and the next action. Distinguish prepared, running, verified, imported, and launched.

Record the current job identifier and status before retrying or resuming. Prefer status checks and targeted corrections over duplicate paid runs, new records, resets, or blanket rebuilds. Preserve prior exclusions, winning settings, approval evidence, and useful review results. Do not claim a gate passed without checking its output.

## Operations and automation

Read [operations-automation.md](references/operations-automation.md), [systems-map.md](references/systems-map.md), and [automation-checklist.md](references/automation-checklist.md) for workflow design, mappings, troubleshooting, idempotency and recovery. These implementation methods never authorize bypassing the managed campaign/list interface gates above. Read-only diagnosis can proceed; any repair or implementation needs the actual bounded authorization and current confirmation controls. Do not turn a status write into evidence that a downstream job ran.

Coordinate financial interpretation, legal decisions and other non-outbound domain rules through Jarvis’s relevant supporting module; implement only authorized plumbing. Never infer permission to send, launch, spend, expand access or accept terms from a request to design an automation.

## Drive SOP source basis

Read [drive-sop-basis.md](references/drive-sop-basis.md) when applying the company’s documented procedures, reviewing a source conflict or grounding a recommendation. It records the relevant reviewed methods and their limits. Current explicit instructions, approved client facts, actual promises, live selected settings and managed stage gates take precedence over historical examples. Jarvis’s `references/drive-source-catalog.md` records all 184 bounded-inventory sources, duplicates and precise read scope; linked but unread media is not integrated knowledge.

## Build errors (added 2026-11-17)
Before diagnosing any campaign-build error, read `rules/build-error-playbook.md` and `automations/n8n-workflows/campaign-center/BUILD-ERRORS-2026-11-17.md`. Key rules: never retry a whole top-up after an import checkpoint failure (reconcile the single failed import); log full response bodies on 422/invalid-request errors; EmailGuard "score above 1" is a fail-closed gate that needs a human task, not a retry; nodes that can pass 300 seconds belong in the server worker.

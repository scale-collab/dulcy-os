# Campaign-builder errors: focused handoff

Verified 2026-11-17. Supersedes `errors.md` for the narrower **campaign-builder** question; that earlier report was predominantly Lead List Center. These are ten most recent matching error alerts recovered from Gmail including Trash, excluding sender/analytics sync, campaign failure-handler, and lead-list stages. This is not a claim that every historical builder failure is retained.

## Coverage and limits
- Fresh database read found no retained `error`, `crashed`, or `canceled` Campaign Center/Creation/Creator builder executions. The only retained campaign-named error was the unrelated failure-handler1353809. Historical execution links below may no longer load; the Gmail alerts remain direct evidence of exact messages.
- Dates below are alert receipt timestamps normalized to UTC, not invented execution start times.
- Two newer alerts include exact failed-node labels. Eight older alerts omit them. Those missing labels are explicitly identified; current source matching is only an inference, not historical execution proof.
- No retries, workflow edits, purchases, list approvals, or campaign sends were made.

## 1289121 — [Campaign Center] Top Up Existing EmailBison Campaign
- **Alert date UTC:** 2026-11-13T04:52:33.000Z
- **Exact message:**
  > original import/attachment stage reported failure for existing import 758 [line 17]
- **Failed step / certainty:** **Verified historical node:** `Verify Atomic Replenishment Checkpoints`. Also corroborated by existing local saved execution.
- **Sources:** [Error alert](https://mail.google.com/mail/u/?authuser=scale%40dulcy.io#all/1a1d3400fe7e2318); [Execution 1289121](https://n8n.dulcy.io/workflow/S2_1UX8GnAKPiYvWqj74s/executions/1289121).

## 1170963 — [Campaign Center] Top Up Existing EmailBison Campaign
- **Alert date UTC:** 2026-11-03T01:22:38.000Z
- **Exact message:**
  > Task execution timed out after 300 seconds
- **Failed step / certainty:** **Verified historical node:** `Prepare Top-up CSV`.
- **Sources:** [Error alert](https://mail.google.com/mail/u/?authuser=scale%40dulcy.io#all/1a19f0049af724c9); [Execution 1170963](https://n8n.dulcy.io/workflow/S2_1UX8GnAKPiYvWqj74s/executions/1170963).

## 800020 — [Campaign Center] EmailBison Output Builder
- **Alert date UTC:** 2026-09-14T03:51:29.000Z
- **Exact message:**
  > Request failed with status code 422 [line 24]
- **Failed step / certainty:** **Historical node not included in alert.** Workflow: EmailBison Output Builder; code line24. HTTP422 proves rejected request, not which field was invalid.
- **Sources:** [Error alert](https://mail.google.com/mail/u/?authuser=scale%40dulcy.io#all/1a09e0a9707e257c); [Execution 800020](https://n8n.dulcy.io/workflow/4VK2fq5Ijrzcaa0Wp3n7i/executions/800020).

## 731147 — [Campaign Center] Create EmailBison + HeyReach Campaigns
- **Alert date UTC:** 2026-08-27T18:46:15.000Z
- **Exact message:**
  > Your request is invalid or could not be processed by the service
- **Failed step / certainty:** **Historical node not included in alert.** Workflow: Create EmailBison + HeyReach Campaigns; downstream service rejected request. Provider/field-specific cause is unverified.
- **Sources:** [Error alert](https://mail.google.com/mail/u/?authuser=scale%40dulcy.io#all/1a0448b4ec845707); [Execution 731147](https://n8n.dulcy.io/workflow/IrtDsUmx88sVAp1daCzWH/executions/731147).

## 723153 — [Campaign Center - GPT] Spintax and Spam QA
- **Alert date UTC:** 2026-08-25T14:03:13.000Z
- **Exact message:**
  > EmailGuard score remained above 1 after two AI repair cycles. Step 1 Variant D requires manual review. Score: 2. Words: ["win","win","win"]
- **Failed step / certainty:** **Historical node not included in alert.** Semantic location explicitly in message: EmailGuard post-two-repair-cycles gate, Step1 VariantD.
- **Sources:** [Error alert](https://mail.google.com/mail/u/?authuser=scale%40dulcy.io#all/1a0393b747871e3e); [Execution 723153](https://n8n.dulcy.io/workflow/KqkYFOs5AZ1RM3G-F1AWu/executions/723153).

## 723084 — [Campaign Center - GPT] Spintax and Spam QA
- **Alert date UTC:** 2026-08-25T13:37:17.000Z
- **Exact message:**
  > EmailGuard score remained above 1 after two AI repair cycles. Step 1 Variant B requires manual review. Score: 2. Words: ["can i send you"]
- **Failed step / certainty:** **Historical node not included in alert.** Semantic location explicitly in message: EmailGuard post-two-repair-cycles gate, Step1 VariantB.
- **Sources:** [Error alert](https://mail.google.com/mail/u/?authuser=scale%40dulcy.io#all/1a03923b8ea39119); [Execution 723084](https://n8n.dulcy.io/workflow/KqkYFOs5AZ1RM3G-F1AWu/executions/723084).

## 723067 — [Campaign Center - GPT] Spintax and Spam QA
- **Alert date UTC:** 2026-08-25T13:31:03.000Z
- **Exact message:**
  > Step 2 expected 1 variants but received only 0. [line 63]
- **Failed step / certainty:** **Historical node not included in alert.** Semantic location: missing Step2 variant, line63. Saved workflow code contains variant-count checking in `Prepare Variant Checks`; mapping to historical run is inferred only.
- **Sources:** [Error alert](https://mail.google.com/mail/u/?authuser=scale%40dulcy.io#all/1a0391e047963abf); [Execution 723067](https://n8n.dulcy.io/workflow/KqkYFOs5AZ1RM3G-F1AWu/executions/723067).

## 723024 — [Campaign Center - GPT] Spintax and Spam QA
- **Alert date UTC:** 2026-08-25T13:18:09.000Z
- **Exact message:**
  > EmailGuard score remained above 1 after two AI repair cycles. Step 1 Variant A requires manual review. Score: 2. Words: ["extra","for you"]
- **Failed step / certainty:** **Historical node not included in alert.** Semantic location explicitly in message: EmailGuard post-two-repair-cycles gate, Step1 VariantA.
- **Sources:** [Error alert](https://mail.google.com/mail/u/?authuser=scale%40dulcy.io#all/1a039123375da5e6); [Execution 723024](https://n8n.dulcy.io/workflow/KqkYFOs5AZ1RM3G-F1AWu/executions/723024).

## 722988 — [Campaign Center - GPT] Spintax and Spam QA
- **Alert date UTC:** 2026-08-25T13:04:10.000Z
- **Exact message:**
  > No approved Email 1-4 review copy was provided. [line 23]
- **Failed step / certainty:** **Historical node not included in alert.** Semantic location: approved-copy input validation,line23. Saved source contains exact error text in `Normalize Campaign Input`; historical node mapping remains inferred.
- **Sources:** [Error alert](https://mail.google.com/mail/u/?authuser=scale%40dulcy.io#all/1a03905668d0bdb3); [Execution 722988](https://n8n.dulcy.io/workflow/KqkYFOs5AZ1RM3G-F1AWu/executions/722988).

## 722958 — [Campaign Center - GPT] Spintax and Spam QA
- **Alert date UTC:** 2026-08-25T12:59:28.000Z
- **Exact message:**
  > Cannot read properties of undefined (reading 'error')
- **Failed step / certainty:** **Historical node not included in alert.** Undefined `.error` property during Spintax and Spam QA. No defensible exact node/cause from retained alert.
- **Sources:** [Error alert](https://mail.google.com/mail/u/?authuser=scale%40dulcy.io#all/1a039011aa4c1805); [Execution 722958](https://n8n.dulcy.io/workflow/KqkYFOs5AZ1RM3G-F1AWu/executions/722958).

## What is observed versus not proven
-1289121: existing import758 reported failure at atomic checkpoint verification. Local execution description expressly says successful imports already completed; reconcile existing failed/uncertain import, **do not reupload or retry whole top-up**. This is not evidence all imports failed.
-1170963: task exceeded300seconds at CSV preparation. Resource pressure or algorithmic complexity is a possible explanation, not established by alert.
-800020 /731147: request rejection is observed; do not invent missing-field or permission causes without response payload.
-EmailGuard failures: score2 after two repair cycles is the observed fail-closed gate. This does not by itself establish a software defect; copy may genuinely need manual review.
-723067 /722988: missing variant/approved copy is observed. Whether malformed AI output, upstream data loss, or missing user input caused it is not established.
-722958: runtime property-access failure is observed; exact source node cannot be recovered from alert alone.

## Local source references
- `work/history-plain-text/run-1289121.json`: retained decoded top-up execution.
- `work/spintax-current/KqkYFOs5AZ1RM3G-F1AWu.json`: saved source used only for explicitly labeled code-location inference.
- `campaign-builder-alerts.json`: exact ten alert bodies and UTC timestamps captured by read-only Gmail batch read. No credentials included.

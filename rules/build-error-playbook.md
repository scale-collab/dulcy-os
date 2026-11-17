# Campaign-build error playbook

Built 2026-11-17 from the 10 most recent builder alerts (`automations/n8n-workflows/campaign-center/BUILD-ERRORS-2026-11-17.md`). "Proven" = in the alert text. "Inferred" = from saved code, not confirmed against the live run. Update this file when a new error type appears.

## Pattern summary
- 7 of the 10 alerts are Spintax and Spam QA, all within one hour on 2026-08-25. That looks like one test session, not a steady failure rate.
- The 2 newest (Nov 3, Nov 13) are both in Top Up and are the ones to fix first.
- No retained failed builder executions exist in n8n now, so exact historical nodes are gone for 8 of 10.

| # | Error text | Where | Meaning | Fix | Status |
|---|---|---|---|---|---|
| 1 | "original import/attachment stage reported failure for existing import 758" | Top Up, node `Verify Atomic Replenishment Checkpoints` (proven) | The checkpoint check could not confirm one import. The code itself says other imports already succeeded. | NEVER retry the whole top-up or re-upload leads (duplicate risk). Reconcile that one import's checkpoint, then continue. Add a "reconcile checkpoint" action instead of a rerun. | Proven. Design is fail-closed on purpose. |
| 2 | "Task execution timed out after 300 seconds" | Top Up, node `Prepare Top-up CSV` (proven) | The CSV prep code node ran past n8n's 5-minute code limit. It is a 13,900-character code node that reads all campaign leads. Cause (size or slow logic) not proven. | Move CSV prep out of n8n into the small server worker (the agreed architecture). Short term: process in batches. | Proven timeout, cause inferred. |
| 3 | "Request failed with status code 422" | EmailBison Output Builder, code line 24 | EmailBison rejected a request. Alert does not say which field. | Log the full response body on every EmailBison call so the next 422 names the bad field. | Cause unknown. Do not guess. |
| 4 | "Your request is invalid or could not be processed by the service" | Create EmailBison + HeyReach Campaigns | A downstream service rejected the request (provider unknown). | Same as 3: capture provider and response body. | Cause unknown. |
| 5-7 | "EmailGuard score remained above 1 after two AI repair cycles... Variant A/B/D... Words: win, can i send you, extra, for you" | Spintax and Spam QA | Working as designed: the gate fails closed when copy still scores 2 after two repairs. The flagged words are spam triggers. | Put the known spam-trigger list into the copy prompt up front so variants rarely reach the gate, and make "manual review" a visible Airtable task, not just an error email. | Observed gate. Likely copy issue, not a code bug. |
| 8 | "Step 2 expected 1 variants but received only 0" | Spintax and Spam QA, line 63 (node inferred: `Prepare Variant Checks`) | The AI step returned no variant for Step 2. | Retry the AI step once for the missing step; if still empty, stop with a clear message. | Cause not established. |
| 9 | "No approved Email 1-4 review copy was provided" | Spintax and Spam QA, line 23 (inferred: `Normalize Campaign Input`) | The workflow started with no approved copy. | Start it only after copy is approved, or block earlier with a plain message. | Missing input, not a crash. |
| 10 | "Cannot read properties of undefined (reading 'error')" | Spintax and Spam QA | Code read `.error` on something that did not exist. Node unrecoverable. | Guard the access (`x?.error`). | Needs the live source to place. |

## Rules that come out of this
1. Never retry a top-up from the start. Reconcile the failed import only. (Matches the code's own error text.)
2. Every EmailBison and HeyReach call must record the response body on failure.
3. Fail-closed gates (EmailGuard, QA) must create a visible human task, not only an error email.
4. A node that can run past 300 seconds belongs in the server worker, not an n8n code node.

## Limits
Snapshots are historical and unverified against live n8n. Lead List Center stages 01, 02 and the lock sub-workflow `JXPiiC2XLCvxCRqzEKk_0` are still missing. Nothing here was changed in live systems.

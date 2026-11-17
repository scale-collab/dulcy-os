# Orphaned Acceptance QA Artifact Cleanup Report

Date: July 29, 2026  
Action taken: read-only audit; no archive or deletion performed

## Summary

Four QA snapshots were created during a Phase 3.5B acceptance probe that incorrectly resolved the production DiscoLike store. Their execution environment was not recorded in the artifact, so the stored environment is technically `unknown`. The execution evidence identifies them as acceptance-generated contamination.

Parent lead list for all four: `dl_20260722_231403_20bcb4`.

| QA result ID | Stored environment | Created at (UTC) | Parent lead list | References |
|---|---|---|---|---|
| `qa_20260729_143551_95a6bf` | unknown; acceptance-generated | `2026-07-29T14:35:51+00:00` | `dl_20260722_231403_20bcb4` | No reference found outside its own QA-history row |
| `qa_20260729_143557_ac7987` | unknown; acceptance-generated | `2026-07-29T14:35:57+00:00` | `dl_20260722_231403_20bcb4` | No reference found outside its own QA-history row |
| `qa_20260729_143603_1c904a` | unknown; acceptance-generated | `2026-07-29T14:36:03+00:00` | `dl_20260722_231403_20bcb4` | No reference found outside its own QA-history row |
| `qa_20260729_143610_0d979d` | unknown; acceptance-generated | `2026-07-29T14:36:10+00:00` | `dl_20260722_231403_20bcb4` | Referenced by the parent lead list's `latest_qa_result_id` |

## Reference audit

- No campaign build, conversation-state file, or other JSON artifact under `memory/` references these IDs.
- The active live campaign build still references the earlier QA result `qa_20260729_042008_c1bc87`.
- The fourth acceptance snapshot is not fully orphaned because the lead-list-local `latest_qa_result_id` points to it.
- Removing or archiving the fourth row without restoring the lead list's previous authoritative pointer would leave an invalid reference.

## Recommended cleanup

If cleanup is approved:

1. Preserve a backup of the four QA rows and the lead-list metadata.
2. Remove or archive all four acceptance-generated rows as one operation.
3. Restore `latest_qa_result_id` to the last legitimate result selected by the operator.
4. Reconcile `qa_latest` and legacy projections from the active canonical QA artifact.
5. Run the missing-reference and restart recovery checks.

No cleanup should occur until the intended replacement for `latest_qa_result_id` is explicitly confirmed.

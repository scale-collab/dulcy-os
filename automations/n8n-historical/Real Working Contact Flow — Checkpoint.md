# Real Working Contact Flow checkpoint

Checkpoint date: 2026-10-30. This benchmark has two workflow files that belong together.

## Child: Contact Processor

- File: `Real Working Contact Flow — Child.json`
- Workflow: `Lead List Center — Contact Processor`
- Workflow ID: `CodexContactProcessorDraft20261028`
- Saved/active version at checkpoint: `ea2cbb1d-762a-4392-9535-c3899db270e0`
- Shape: 341 nodes and 338 connection keys
- JSON SHA-256: `cabcabddecfb844b57dccec474b014953bd74a9794ca1942bc7c87f0b0555249`

## Parent: Company and Contact Refinement

- File: `Real Working Contact Flow — Parent.json`
- Workflow: `[Lead List Center] Company and Contact Review - Adaptive Refinement`
- Workflow ID: `T_KveEbSPrwKFWz2neZ6k`
- Restored morning version: `f53999df-5b91-485a-a51d-ce6f65ae8e24`
- Shape: 1,426 nodes and 1,393 connection keys
- JSON SHA-256: `9e7e89a20da3ad4d9cdd5e99049ecfa33ad0c80ad815bed6edba8d37d40b1176`
- Graph SHA-256 (`nodes` + `connections`): `b010a22b967bf954bccbe4c924f66a7f74c6638acfb10ebf74b434a380c2ffd8`

The parent graph exactly matches the preserved pre-revision version `fb6c40eb-e428-46e3-8dbf-79c6bae2b6ee`. Both files are valid n8n import arrays and together represent the workflow-graph portion of the morning rollback benchmark.

## Runtime-policy provenance correction

The JSON files do **not** prove that the faster incremental database-coverage path was active at this checkpoint. A read-only production audit on 2026-10-30 found:

- `original_batch_api.reference_feature_v1.enabled = false`
- `original_batch_api.database_coverage_policy_v1.enabled = false`
- the database policy row was last updated at `2026-10-28 23:57:43.555856+00`
- six Human Marketing child runs had used the faster coverage-reference path before that timestamp
- the Hair expansion had no `coverage_source_reference_v1` row and no `database_coverage_receipt_v1` row, so it used the legacy full-sheet fallback

No audit log was available to establish why the policy was disabled or whether it was intended as a Human-only canary. Therefore these files must not be described as a complete restored copy of the faster runtime behavior. See `Real Working Contact Flow — Runtime Policies.sql` for the non-secret policy and function provenance snapshot. That file is evidence only and does not enable or disable anything.

## Important limits

These JSON files contain workflow definitions only. They do not contain database function definitions, production data, or credential secrets, so importing them alone is not a complete database rollback. Production may also contain later SQL compatibility changes. Before importing or activating either checkpoint, compare the current workflows and SQL dependencies, confirm no relevant jobs are active, and preserve current data and outputs.

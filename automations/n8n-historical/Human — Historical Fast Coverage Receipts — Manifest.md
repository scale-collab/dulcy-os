# Human historical fast-coverage evidence

The six rows below are authentic contact-coverage receipts retained in `original_batch_api.database_coverage_receipt_v1`. They are contact-stage evidence: the inherited counts contain provider units, persona identities, ESP emails, and output units. They are not company-discovery receipts.

| Created UTC | Child run | Parent run | Owner execution | Generation | Target | Workflow version |
|---|---|---|---:|---:|---:|---|
| 2026-10-28 00:45:00.053724 | `0db9edc7c02e2cde68e2bc1f25ea2ab766f9009fc714d65f4038c18483d087e2` | `9e13606aab708fd94e8f82f856e4f837a78606fed4ecd78088e64265c13d724e` | 1097556 | 3 | 1,001 | `40e09c14-39a8-4562-a6ab-c4700ed40d19` |
| 2026-10-28 05:42:28.090178 | `654a1e531436b94efc2b0b68ae54117444dfd76b52c19c0c26555ef9bfbb73dd` | `0db9edc7c02e2cde68e2bc1f25ea2ab766f9009fc714d65f4038c18483d087e2` | 1111450 | 4 | 1,101 | `40e09c14-39a8-4562-a6ab-c4700ed40d19` |
| 2026-10-28 20:13:32.061939 | `20f0025e61f5d30a18e45971453951c2676cffde8890e201a7b68563eea307a4` | `654a1e531436b94efc2b0b68ae54117444dfd76b52c19c0c26555ef9bfbb73dd` | 1117775 | 5 | 1,201 | `40e09c14-39a8-4562-a6ab-c4700ed40d19` |
| 2026-10-28 20:42:02.544641 | `fa7e578fb726b44e18b25f206ddddd74f97eb098d2abc9335d9cad58f8559e84` | `20f0025e61f5d30a18e45971453951c2676cffde8890e201a7b68563eea307a4` | 1117953 | 6 | 2,201 | `40e09c14-39a8-4562-a6ab-c4700ed40d19` |
| 2026-10-28 21:55:48.698303 | `8591b2c3b72049cf3ef0b10d2b1ee34fc0a1292ff70d6da7bc5ee0fa293527b9` | `fa7e578fb726b44e18b25f206ddddd74f97eb098d2abc9335d9cad58f8559e84` | 1118413 | 7 | 9,000 | `40e09c14-39a8-4562-a6ab-c4700ed40d19` |
| 2026-10-28 22:56:34.179035 | `7c5ec4052b4d97e28d9fa4e5286d391bc95ea77a454650ed0af7e22120cd82d8` | `8591b2c3b72049cf3ef0b10d2b1ee34fc0a1292ff70d6da7bc5ee0fa293527b9` | 1118795 | 8 | 18,607 | `40e09c14-39a8-4562-a6ab-c4700ed40d19` |

The exact execution rows and workflow-history row for these owner IDs/version have expired or been pruned. Therefore no authentic Human Parent/Child workflow JSON can be exported from these receipts, and none is reconstructed here.

Current policy evidence, not historical configuration proof:

- `reference_feature_v1.enabled = false` (the table has no timestamp column)
- `database_coverage_policy_v1.enabled = false`
- Policy version: `database-canonical-coverage-v1`
- Policy workflow version: `40e09c14-39a8-4562-a6ab-c4700ed40d19`
- Policy updated at: 2026-10-28 23:57:43.555856 UTC

PostgreSQL statement logging is disabled, so the actor and reason for disabling the policy are not recoverable. Local release artifacts expect these features disabled outside a canary, which suggests deliberate quarantine, but that is inference rather than proven history.


# Campaign Center workflows (local snapshots, not verified live)

Credentials and pinned data removed; secret scan clean 2026-11-17. Original paths and dates: `provenance.json`. Errors: `BUILD-ERRORS-2026-11-17.md`.

| Workflow | Nodes | Webhook | Role |
|---|---:|---|---|
| EmailBison Output Builder | 65 | `email-bison-create-one-output` | Builds one EmailBison campaign output |
| Create EmailBison + HeyReach Campaigns | 51 | `email-bison-split-campaign-output` | Creates campaigns after the split |
| Split Direct + Generic Controller | 7 | none | Splits direct vs generic email lists |
| Spintax and Spam QA | 52 | none (called by others) | Copy variants, EmailGuard check, two AI repair cycles, then manual review |
| EmailBison Actions | 16 | none | Shared EmailBison actions |
| Update EmailBison Senders | 26 | none | Sender updates |
| Sync Sender Accounts to Airtable | 10 | none | Sender sync |
| Sync Sequence Analytics Totals | 8 | none | Analytics sync |
| Auto-Approve Client Review | 4 | none | Auto-approval of client review |
| Top Up Existing EmailBison Campaign | 34 | `campaign-top-up-leads` | Adds leads to a live campaign, with import checkpoints |
| Lead List Center 04 Enrichment Prompt Builder | 10 | `lead-list-enrichment-prompt` | Builds the enrichment prompt |

Webhooks here show no n8n header authentication in the snapshot (same open question as stages 03/05/06). Verify.

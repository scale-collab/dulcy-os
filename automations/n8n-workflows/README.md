# n8n workflow snapshots (history)

> **Superseded 2026-11-17:** the full live export is in `../n8n-live-2026-11-17/`. Use that. This folder is kept for history.

Source: ChatGPT/Codex local files, handed over 2026-11-17. See `provenance.json` for original paths and saved dates.

**These are local snapshots, NOT fresh live exports.** They were not compared against the live n8n on 2026-11-17. A file date does not prove what is deployed. Before changing anything, export the live version and compare.

Credentials are not in these files (checked 2026-11-17: no keys, tokens, JWTs or Authorization values found). n8n credential names are references only. Do not add a credential value to this repo.

| File | Workflow | Nodes | Saved in n8n |
|---|---|---|---|
| `campaign-over-60--...json` | Campaign Over 60% | 26 | 2026-11-11 |
| `lead-list-03-verification--...json` | [Lead List Center] 03 Verification Submit and Check | 349 | 2026-11-11 |
| `lead-list-05-discogen-enrichment--...json` | [Lead List Center] 05 DiscoGen Enrichment Run | 114 | 2026-10-29 |
| `lead-list-06-automated-qa--...json` | [Lead List Center] 06 Automated QA | 27 | 2026-11-14 |

Plain-English map: `WORKFLOW-MAP.md`. The 60% flow in detail: `campaign-over-60-flow.md`.

## Still missing (ask ChatGPT for these, credentials stripped)
- The campaign-builder workflows (the ones that keep erroring)
- Lead List Center stages 01, 02 and 04 (company, contact, etc.)
- The "Commit ... Under Campaign Lock" sub-workflow (id `JXPiiC2XLCvxCRqzEKk_0`)
- Contact Flow parent and child (2026-10-30 live snapshot; only the README is in `../n8n-historical/`)
- Any workflow that creates the Airtable "project management task" and the 3 a.m. email for bounce over 4%

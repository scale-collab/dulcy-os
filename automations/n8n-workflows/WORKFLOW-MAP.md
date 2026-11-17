# Workflow map

Snapshots only, not verified against live. Names tell the stage order in the Lead List Center.

| Stage | Workflow | Trigger (POST webhook) | Talks to |
|---|---|---|---|
| 60% alert | Campaign Over 60% | `/60percentcomplete` (header auth) | Airtable, EmailBison, OpenAI |
| 03 | Verification Submit and Check | `/lead-list-verification-submit-check-v2` | MillionVerifier, LeadMagic, EmailBison, Google Sheets, Airtable, Postgres |
| 05 | DiscoGen Enrichment Run | `/lead-list-enrichment-run` | DiscoLike, EmailBison, Google Sheets, Airtable |
| 06 | Automated QA | `/lead-list-automated-qa` | Airtable, Google Sheets |

## Notes
- **Verification (349 nodes)** is the largest. It re-calls itself to continue a saved verification, a status check, or a top-up, uses 52 Postgres nodes for job state, and has 15 waits. This is the "check status instead of re-running a paid job" rule in code.
- **Enrichment (114 nodes)** has three entry points on one webhook path and three waits.
- **QA (27 nodes)** is small and acknowledges the webhook, then runs.
- Stages 01 (source and ICP), 02 (company), 04 (contacts) and the campaign builder are not in these files yet.

## To verify with Alex / live n8n
- The 03, 05 and 06 webhooks show no n8n header authentication in the snapshot. They may be protected another way (network, proxy). Confirm they are not open to the internet.
- Whether these files match live n8n today.

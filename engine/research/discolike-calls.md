# DiscoLike API calls used by the old n8n lead-list workflows

Extracted 2026-11-18 from `automations/n8n-live-2026-11-17/workflows/lead-list-center-*`, for the engine's lead-list stages (PLAN steps 5-6). Endpoints only; credentials are not stored here.

| Endpoint | Used by |
|---|---|
| `/v1/discogen/` | 05-discogen-enrichment-run |
| `/v1/discogen/status/` | 05-discogen-enrichment-run, company-and-contact-review-adaptive-refinem, company-expansion-worker-2-500-batch |
| `/v1/discover` | company-and-contact-review-adaptive-refinem, company-expansion-worker-2-500-batch |
| `/v1/discogen/process` | company-and-contact-review-adaptive-refinem, company-expansion-worker-2-500-batch |
| `/v1/validate/icp` | company-and-contact-review-adaptive-refinem, company-expansion-worker-2-500-batch |
| `/v1/contacts/discover` | company-and-contact-review-adaptive-refinem, company-expansion-worker-2-500-batch |
| `/v1/discogen/process-personas` | company-and-contact-review-adaptive-refinem, company-expansion-worker-2-500-batch |
| `/v1/contacts/discover/generate` | company-and-contact-review-adaptive-refinem, company-expansion-worker-2-500-batch |
| `/v1/queries/exclusion-list` | company-and-contact-review-adaptive-refinem, company-expansion-worker-2-500-batch, refresh-client-domain-exclusions |
| `/v1/count` | tam-finder-free-company-count |

## How the main calls are made (from the code nodes)
- **Company search:** `GET /v1/discover?<filters>&max_records=N&offset=0`. Filters are query parameters; a list repeats the key (`category=A&category=B`). `E_COMMERCE` is sent as `E-COMMERCE`.
  - **Sample:** the saved, approved filters exactly, `max_records=100`. `icp_prompt`, `auto_icp_text` and `auto_phrase_match` are removed.
  - **Plan from a sentence:** `icp_prompt=<targeting sentence>&max_records=20`, used only to suggest filters.
  - **Expansion / refinement:** offset is always 0. Already-seen domains are excluded with a **rolling exclusion list**: `POST /v1/queries/exclusion-list` returns a `query_id`, which is added to `exclusion_query_id` (a list). `exclude_domain`/`negate_domain` are dropped. Batch is 1-2,500 rows (`max_records ≥ 5`).
- **Contacts:** `POST /v1/contacts/discover` with a JSON `contactRequest` (up to 500 domains per call, 5 people per company by default, `has_email=true`), one call at a time, 120 s apart, 600 s timeout. `POST /v1/contacts/discover/generate` (ContraGen) is a second source.
- **Fit scoring (old):** `POST /v1/validate/icp`. The engine replaces this with code (`engine/src/leadlist/fit.ts`, Alex decision 1).
- **DiscoGen research:** `/v1/discogen/process`, `/process-personas` and `/status/`. These are asynchronous and polled.
- **Auth:** an HTTP header credential named in n8n. The header name is **UNKNOWN** (not stored in the export); confirm it before building the client.

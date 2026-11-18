# Lead List Center: stage-by-stage map (for the lead-engine rebuild)

Prepared by Riley, 2026-11-18. Read-only. Nothing live was changed.
Sources: repo snapshot `automations/n8n-live-2026-11-17/workflows/` (12 Lead List files + 1 repair copy), `airtable/automations/` (4 scripts), `airtable/custom-elements/lead-list-center/source.tsx` (2,596 lines), `airtable/SCHEMA.md` (Lead Lists `tblVOg9BkPOMmnitt`, 137 fields), `rules/`.
Live check (read-only, 2026-11-18): node names of 26 live workflows compared with the repo. 25 match exactly. Company and Contact Review has **1,437 nodes live vs 1,428 in the repo** (9 extra live nodes named "Saved Output Resume — …"). Three workflows the flow calls could not be found through the n8n connector (see Problem 1).
Labels: **proven** = read in saved code or config. **inferred** = follows from code, not seen in a real run. **UNKNOWN** = not in any source I can read.

## 0. How it fits together (one paragraph)
The screen (`source.tsx`) writes one value into one of three single-select fields on a Lead Lists record: `Automation Action`, `Enrichment Action` or `QA Action`. Three Airtable automations watch those fields ("is not empty") and POST `{recordId, action}` to an n8n webhook. The n8n workflows read the record, call DiscoLike / DiscoGen / MillionVerifier / LeadMagic / OpenAI / Google Sheets, then write results back to Lead Lists fields, to one Google Sheet per list (the "project workbook", linked in `Lead List Link`), to Airtable attachment fields, and to Postgres. The Postgres logic lives in database functions (`original_verifier_api.q_<hash>`, `original_batch_api.expansion_alerts_v1`, tables `contact_discovery_*`) that are **not in the repo (UNKNOWN content)**. Workflows clear the action field themselves. Completion is tracked only through `Processing Status` and the other status fields.

## 1. Action → automation → workflow → stage

| Field = value | Sent by screen? (button) | Airtable automation | n8n workflow (webhook node, auth) | Stage |
|---|---|---|---|---|
| Automation Action = Generate Filters | No. "Generate filters" clears 5 fields (Company Filters JSON, Employee Range, Country Filters, State Filters, Homepage Keywords) and then sends **Run Company Sample** | Lead List Center Dispatcher `wflgj0HK24sgd8Uuy` | Company and Contact Review `T_KveEbSPrwKFWz2neZ6k` (via `Airtable Lead List Webhook2`, header auth `X-Dulcy-Lead-List-Auth`; Ingress Sanitizer `0k2YgRVL7RmgREA6fGRV-` is a second header-auth entry into the same flow. Which URL the dispatcher uses is UNKNOWN because paths are redacted) | Source & ICP (filters) |
| = Run Company Sample | Yes ("Run first 100 companies"; also the regenerate path above) | Dispatcher | Company and Contact Review | Company sample |
| = Refine Company Sample | No | Dispatcher | Same. n8n treats it as "regenerate filters" (`forceRegenerate`) | Filters |
| = Review Saved Company Sample / Test Saved Company Evidence (1) / Apply Verified Company Evidence | No | Dispatcher | Same. Aliased to Run Company Sample with reassess flags. Guarded to 2 hardcoded list records | One-off repair |
| = Expand Companies | Yes ("Approve and expand"; disabled until `Company Sample Approved`) | Dispatcher | Company and Contact Review → Company Expansion Worker `wkSiI4UDwyW3_yga47_EB` (webhook, **no auth**) | Company expansion |
| = Build Contact Sample | Yes ("Approve and search contacts") | Dispatcher | Company and Contact Review → contact queue → Execute Workflow `CodexContactProcessorDraft20261028` (**not found**, Problem 1) | Contact sample |
| = Expand Contacts | Yes (disabled until `Contact Sample Approved`) | Dispatcher | Same as contact sample | Contact expansion |
| = Apply Contact Decisions | Yes (needs a sheet link) | Dispatcher | Company and Contact Review → Execute Workflow `JWrteAxXQ1PIII4IelGoX` "Private Contact Decision Review" (**not found**) | Apply decisions |
| = Build New Contact Sample | No | Dispatcher **rejects it** ("Unsupported Automation Action") | none | Dead option |
| = Restart Companies | Yes ("Reset to latest reviewed sample…") | Dispatcher (separate URL, no auth header) | Company and Contact Review, `Company Restart Webhook` (**no auth**; a second copy `Company Restart Webhook1` exists) | Restart |
| = Verify and Finalize | Yes ("Run MillionVerifier first") | Dispatcher (no auth header) | 03 Verification Submit and Check `iEt4c3iRAh6yeP7lYMlI9` (**no auth**) → mode `submit` | Verify |
| = Retry Failed Stage | Yes ("Check status" and "Recover remaining direct contacts") | Dispatcher | 03 → mode `check` (never buys a new MillionVerifier job) | Verify / recovery |
| Enrichment Action = Prepare Enrichment Prompt | Yes (needs `Custom Variables Requested`) | Enrichment Action `wflXVKrZbywqUELEM` | 04 Enrichment Prompt Builder `Tvppie6mLHe-16Gmhfzjs` (**no auth**) | Enrich prompt |
| Enrichment Action = Run Enrichment | Yes (needs "OUTPUT" in the prompt) | Enrichment Action | 05 DiscoGen Enrichment Run `mWfsR4TbaUflfW-jyWaDE` (**no auth**; 3 webhook nodes on one path) | Enrich run |
| QA Action = Run Automated QA | Yes | QA Airtable automation `wflWfdxSpf2JclmDV` | 06 Automated QA `MdXafHjQI3Sx8Hhxg6uh6` (**no auth**) | QA |
| `TAM Check JSON` status "requested" | Yes (TAM Finder panel writes JSON directly) | none | TAM Finder `DulcyTAMFinder20260925` polls every 1 min | TAM count (free) |
| Workspace IDs `Refresh Domain Exclusions` = true | n/a | Refresh Client Domain Exclusions `wflnPA4oRH8fWqVQY` (on Workspace IDs) | Refresh Client Domain Exclusions `5_rghJCEgbnhdO_qHIlVv` (**no auth**). Also called by the weekly job (Sun 02:00 ET, `8XuaP0rbqqxsyYWNOYWVI`) and by Company and Contact Review before sourcing | Exclusions |
| (schedule) | n/a | none | Expansion Completion Alerts `DulcyExpansionAlertsV1`, every 1 min → Slack | Notify |

Screen writes that bypass n8n (proven, `source.tsx`): create list (sets Expansion Target 1,000 and Expansion Approval "Not Requested"), **delete list** (`deleteRecordAsync`), the approval checkboxes, Expansion Target presets (1,000 / 4,000 / 10,000 / 20,000), Search relevance, Contact Filters JSON (auto-written from the targeting text), SEG toggles, verification route toggles (forces MillionVerifier on both), LeadMagic recovery toggle, deep-review prompt save, **Skip Enrichment** (writes Stage = QA, Processing Status = Completed, Progress = 5/6), and **manual QA Pass** (writes Stage = Ready, only if Stage is QA/Ready/Uploaded and Processing Status = Completed).

Dispatcher safety (proven): it refuses a stale trigger whose action differs from the live field (`SUPERSEDED_AUTOMATION_ACTION`). It skips the POST when `Workflow Run ID` is set and status is running/processing. It treats Airtable's ~30-second fetch timeout (HTTP 408) as "accepted" and does not retry. The Enrichment and QA automations have no such handling (their workflows reply at once, so it is not needed).

## 2. Stage by stage

### 2.1 Source & ICP: generate filters (Company and Contact Review)
- **Inputs:** `ICP Description` (Targeting Sentence, `fldcYwP7Dlq4uyC39`), `List Thesis`, the linked campaign's `Campaign Thesis`, `Source Type`, client link (must be exactly 1 client).
- **Steps:** mark Running → DiscoLike `/v1/discover?icp_prompt=…&relevance=BALANCED&max_records=20` → build an AI keyword-review prompt → OpenAI `gpt-5.6` (LangChain chain) → `Generate Visible Search Plan2` builds the filter JSON → save.
- **External calls:** DiscoLike discover, 20 records (paid, depends on plan). OpenAI (paid tokens).
- **Outputs:** `DiscoLike Company Filters JSON` (`fldC2hZQ3gSqLmi1y`), `Employee Range`, `Country Filters`, `State Filters`, `Homepage Keywords`, Processing Status Completed, Progress 1/7, message. Clears Automation Action.
- **Breaks:** the 13 duplicate copies of a 217-item subindustry list must agree. The screen blocks over 20 keywords per side. Legacy `min_similarity` plans are refused.

### 2.2 Company sample, first 100 (Company and Contact Review)
- **Inputs:** saved filters plus the fields above, `Use DiscoGen Deep Review` (`fldsYFrdNF2VBS6SQ`), `DiscoGen Deep Review Prompt` / `Additional Requirements`, `Domain Source File` (Third-Party Domains mode), `Top-up Build Scope JSON`, Workspace IDs exclusion cache.
- **Steps:** (1) Always refresh client exclusions first (POST to the Refresh webhook; on a DB "503" it waits 20 s and retries once). (2) Add the client exclusion query ID. If this is a top-up, read the destination EmailBison campaign leads (`GET /api/campaigns/{id}/leads`) and create a DiscoLike exclusion list from those domains. (3) DiscoLike `/v1/discover` with the saved filters plus `max_records=100&offset=0`. (CSV mode: download the attached domain CSV instead.) (4) ICP check: POST `/v1/validate/icp` with `icp_text` = fixed "verifier standard" + targeting sentence + campaign thesis (or list thesis) + client context, `context_mode=website`, `web_search=false`. (5) Poll `/v1/discogen/status/{task}` every 15 s. (6) Score and tier (section 3). (7) Upload the raw CSV to `Company Source File` and the reviewed CSV to `Company Review File` (Airtable `uploadAttachment`). Create or reuse the Google Sheet and write the company tabs.
- **External calls:** DiscoLike discover (paid), validate/icp (paid, UNKNOWN rate), exclusion-list (cost UNKNOWN), EmailBison read (free), Sheets, Airtable content API.
- **Outputs:** `Company Sample Size`, `Company Good Fit Count`, `Company Bad Fit Count`, `Company Fit Rate`, `Company Validation Status` (Passed/Needs Review/Failed), `Company Validation Summary`, `Company Sample Approved` reset to **false**, `Lead List Link`, Processing Status Completed, `Company Sample Provenance JSON`.
- **State:** `Workflow Run ID` = n8n execution ID. `Company Outcome Still Current?` drops the write if a newer run took over.
- **Breaks:** the ICP poll has **no cap**. The "Use DiscoGen Deep Review" provider switch (DiscoGen `/process`, `web_search=true`) is only wired for **3 hardcoded list records**. For every other list the checkbox changes only the scoring formula (inferred from code; not seen in a run).

### 2.3 Refine / restart
- "Refine" = regenerate filters (2.1). The real auto-refine loops ("Analyze Rejections 1–8", "Refined Validation 1–10") are **unreachable** (section 4).
- **Restart Companies** (28-node path): validate the filters → read the latest reviewed sample tabs → claim ownership on the record → create a **new** workbook, write the dataset, read it back and verify → re-check ownership → commit (`Company Restart History`). The old workbook is kept. Errors are saved only if the run still owns the record (`May Save Restart Error?`).

### 2.4 Company expansion (Company and Contact Review + Expansion Worker)
- **Inputs:** `Company Sample Approved` (**hard gate in code**: "Approve the company sample before expanding."), `Expansion Target` (`fldYzvqGmQZxXL9AP`, clamped to 100–100,000, default 1,000), the existing "Expanded Companies" / "Expanded Company Review" tabs.
- **Steps:** remaining = target − existing rows. Split into runs of at most **2,500** (an even split, minimum 5). For each run, the parent POSTs to the worker webhook with `priorBatchDomains` (all domains from earlier runs; max 100,000) and waits up to **30 min** (`timeout 1,800,000 ms`). The worker accepts only `Expand Companies` and needs a numeric parent execution ID and offset 0. It creates a list-scoped DiscoLike exclusion (existing plus prior domains), calls `/v1/discover` with `max_records = max(5, assignedLimit)`, `/v1/validate/icp` (DiscoGen `/process` only for 2 hardcoded records), polls every 15 s, tiers the results, and returns `reviewed[]`. The parent checks that every earlier batch receipt exists and matches, merges unique domains, writes the sheet tabs, and saves counts.
- **Outputs:** `Source Company Count`, sample/good/bad/needs-review counts, fit rate, status, summary, `DiscoGen Review Results URL`, `Lead List Link`, Progress, Processing Status. Slack alert through Expansion Completion Alerts (Postgres-reserved, one post per event).
- **Breaks:** the node named "Run Two Expansion Workers at a Time" is a Split-in-Batches node with **no batch size (default 1), so it runs one batch at a time**. A 100,000 target means 40 serial calls, each allowed 30 min. `retryOnFail` is false on the worker call. If one batch fails, the next run refuses to continue ("Prior company batch did not complete; resume it"), and no resume action exists on the screen. The screen text says "each run adds up to 10,000"; the code allows up to 100,000 total.

### 2.5 Contact sample / contact expansion (Company and Contact Review → missing Contact Processor)
- **Inputs:** `Contact Persona DNA` (required), `Contact Source` (DiscoLike / DiscoLike + ContraGen), `Contact Filters JSON` (people per company, seniority, countries), `Lead List Link` (must exist), `Contact Sample Approved` (expansion only), `Expansion Target` (**the same field** as company expansion), `Top-up Build Scope JSON`.
- **Steps (proven up to the handoff):** set `Contact Queue Status` = Queued and `Contact Queued At` → reply to the webhook → wait 2 s → read all Lead Lists rows with Queued/Running (one global queue, sorted by queued time) → if not first, wait **60 s** and re-check (**no limit**) → claim the slot (Running) → refresh exclusions only if the client cache is missing (the "older than 24 h" check is a label, not a trigger) → read destination campaign domains if this is a top-up → build the saved run in Postgres → **Execute Workflow `CodexContactProcessorDraft20261028`** ("Lead List Center — Contact Processor", 341 nodes in the 2026-10-30 checkpoint). Sample = first **100** approved companies. Expansion = first `Expansion Target` approved companies.
- **What the processor does:** UNKNOWN (not readable). The in-workflow "Durable Contact" path, which runs **only for one hardcoded test record**, shows the intended logic: DiscoLike `/v1/contacts/discover` in batches of **500 domains**, `results_by_company` default **5**, `has_email=true`, a global contact-country exclusion, then a DiscoGen `/process-personas` AI review of every returned contact, polled with waits of 45/55/65/75/90 s, then 90 s steps, **capped at 80 polls**. Optional ContraGen `/contacts/discover/generate` when Contact Source = DiscoLike + ContraGen.
- **Outputs (expected; written by the missing processor):** Contact Sample Size, Contact Good/Bad Fit Count, Contact Fit Rate, Contact Validation Status/Summary, Contact Review File, Direct Candidate Count, "Contacts" tab, Contact Queue Status Completed/Failed. UNKNOWN which ones it writes.
- **Breaks:** see Problems 1, 2, 9.

### 2.6 Apply contact decisions
- The screen requires `Lead List Link`. n8n passes the whole request to `JWrteAxXQ1PIII4IelGoX` and returns its JSON. **Logic UNKNOWN** (not readable). The rule (Oct 9) says: apply only manual Approve/Reject by verified identity, never by row position, never start paid work, and be idempotent. None of this can be confirmed.

### 2.7 Verify (03, 349 nodes)
- **Inputs:** `Lead List Link`, `Include Generic Emails`, `Include Direct Contacts` (at least one required), `Use LeadMagic Fallback`, `Generic Emails Footprint 200 or Less`, `MillionVerifier Job ID`, `LeadMagic Job ID`, `Verification Provider State`, `Processing Status`, `Top-up Build Scope JSON`, `Batch Workbook Layout JSON` (read by code, **not in the schema snapshot**). Sheet tabs read: Contacts, Expanded Companies (the `public_emails` column for generic), and the contact review tab (Cut/NeedsReview/Hold/Rejected rows become holds).
- **Submit:** an active job (status running/queued/waiting, or a job ID without a terminal state) → just save the state, no new purchase. Otherwise: build candidates (direct from Contacts, generic from company public emails, footprint filter ≤200 if ticked), dedupe by email and LinkedIn (identity conflicts become NeedsReview holds), optional "this-build-only" exclusion against the top-up destination, then write a CSV (`email` column) and POST MillionVerifier `bulkapi/v2/upload` **once**, with a Postgres claim/save around it (`Saved Batch — … — Claim/Save/Reuse`) so a replay reuses the job. Save the job ID at once. Hard limit: upload payload under 8 MB.
- **Check:** GET `bulkapi/v2/fileinfo`. Not finished → Processing Status Waiting, Progress 3/7, "x% complete". There is **no automatic poll**; the user presses Check status. Finished → `bulkapi/v2/download` → map the verdicts (section 3) → optional LeadMagic `POST /email-finder` per unresolved direct contact (first name, last name, domain) → build outputs.
- **External calls:** MillionVerifier (paid per email), LeadMagic email-finder (paid per call), EmailBison leads (read), Sheets, Airtable. The LeadMagic validate nodes are **disabled (7 nodes)**.
- **Outputs:** tabs Verified Leads, Verification Good/Risky/Bad/Pending, Final Generic, Final Direct, Final Export. Fields `Verification Good/Risky/Bad Count`, `Verified Generic/Direct Count`, `Final Generic/Direct Count`, `Number of leads`, `Lead List Link` (→ Final Export tab), `Verification Provider State`, `Verification Completed At`, `Verification Recovery Result`, `Verification Route` = "MV-first v2", Stage Verification → Enrichment, Progress 4/7.
- **Breaks:** a pending remainder (no credits) → Waiting with "run the remainder only after credits are available". A result-count mismatch throws ("reuse the saved job"). 15 Google Sheets reads have a quota retry loop (`Quota — … — Wait`, delay from code).

### 2.8 Enrichment prompt (04, 10 nodes)
- **Input:** `Custom Variables Requested` (`fldTYRjTrpVW27tmG`) in plain English. Refuses text that already has `# ENRICHMENT PROMPT` and `# OUTPUT`.
- **Steps:** OpenAI node "Message a model", model `gpt-5.6-luna` (the request body says `gpt-5.6`, temperature 0.1) with a fixed compiler prompt (section 3) → check that the reply has both headings and at least one JSON key → overwrite `Custom Variables Requested` with the prepared prompt, set the message, clear Enrichment Action.
- **Breaks:** no Processing Status write, so the screen shows no running state. One orphan HTTP node ("Compile Detailed Prompt with AI").

### 2.9 Enrichment run (05, 114 nodes = 3 copies)
- **Inputs:** the prepared prompt (must contain output/"return only"), `Lead List Link`, `Verification Provider State` = completed (else it stops), `Top-up Build Scope JSON`; tabs Final Direct, Final Generic, Contacts (persona IDs), company tab (city/state seed).
- **Steps:** parse `# VARIABLE:` blocks and scope (company/person; mixed → person) → dedupe rows by email/LinkedIn (Direct wins over Generic; conflicts throw `HOLD_ENRICHMENT_LIST_*`) → POST DiscoGen `/process` (company scope, by domain) or `/process-personas` (person scope) → wait (node has no settings, so the n8n default applies; exact value UNKNOWN) → GET status; loop **with no cap** → write values into Final Direct / Final Generic in chunks → Stage QA, Progress 5/7, message "x requested values were blank and require QA".
- **External calls:** DiscoGen (paid), Sheets, Airtable.
- **Breaks:** copies 0 and 1 parse **only Final Direct** for enrichment. Copy 2 adds a ~267k-character one-off recovery node. Which copy answers the webhook is UNKNOWN (Problem 7).

### 2.10 Automated QA (06, 29 nodes)
- **Inputs:** `Custom Variables Requested` (`# VARIABLE:` declarations only), the linked campaigns' copy (up to 4 steps × 10 variants, read by field ID), `Lead List Link`; tabs Final Direct + Final Generic (fallback Final Export → Verification Good → Verified Leads, Good rows only, merged with Contacts by email), QA Review (manual corrections by email), QA Quarantine.
- **Steps:** apply the saved manual corrections back to the source tabs → check every row → rewrite the "QA Review" tab (flagged rows, or a 25-row factual-review sample if nothing is flagged) → save the result.
- **Outputs:** `Required Fields Present`, `Duplicate Check Passed`, `Final Schema Passed`, `QA Status` Passed/Failed, `QA Summary`, `Duplicate Count`, `Rejected Count`, optionally `Number of leads` / Final counts (quarantine), **Stage = Ready if passed, else QA**, Progress 1 or 5/7, Processing Status Completed.
- **Breaks:** **no error workflow is set**. A crash after "Mark QA Running" leaves the list Running. Twelve hardcoded record IDs change the QA rules for specific lists.

### 2.11 Exclusions (Refresh Client Domain Exclusions, 19 nodes; weekly, 7 nodes)
- **Inputs:** Workspace IDs record (client name, `ID`, `Onboarding` link, `Booked Meeting Exclusion Domains`, `… Overrides`), Emails table rows for that client, the onboarding "should not contact" upload (Google Sheet).
- **Rule:** permanent = any booked call / Booked Meeting / Completed Meeting / Closed Deal / Opportunity WON / client closed deal. Rolling = Lead Status Interested or Meeting Request within the last **30 days** (2,592,000 s). Plus explicit DNC and onboarding sheet domains. Overrides remove booked domains. Result → DiscoLike `POST /v1/queries/exclusion-list` → saves `DiscoLike Exclusion Query ID`, `Domain Exclusion Count`, `Domain Exclusions Refreshed At`, clears `Refresh Domain Exclusions`.
- **Limits:** Emails paging stops at **120 pages × 100 rows = 12,000**; beyond that it throws (no partial refresh). One client's two workspaces are hardcoded as one group. The weekly job (active/onboarding clients, one at a time) uses `neverError: true`, so failed clients are **silently skipped**.

### 2.12 Finalize / handoff
- There is no separate finalize workflow. "Final" = verification writes the Final tabs and counts. Enrichment updates them. QA Pass (automatic or manual) sets Stage = Ready. The Campaign Center (Top Up, Output Builder, Split Direct+Generic, EmailBison Actions) then reads Lead Lists. `Top-up Build Scope JSON` (v1, mode "this-build-only", buildRecordId = this list, exactly one client) is the contract between the two centers. It is checked in 2.2, 2.5, 2.7 and 2.9.
- `Lead List Stage` is only partly written by workflows (Source Imported, Verification, Enrichment, QA, Ready). The screen works out its 6-step progress itself (`workflowState`). Draft, Targeting, Searching and Contacts Ready are never written by code.

## 3. Business rules hidden in code (preserve these)
**Company search / filters**
- Sample = 100 companies (`max_records 100, offset 0`). Filter-generation probe = 20 companies, relevance BALANCED.
- Default plan: language `en`, `exclude_leadgen=true`, relevance BALANCED, `redirect=false`, `include_search_domains=true`. Local business → `min_digital_footprint 0`. Online commerce → `min_digital_footprint 75` and `employee_range 1,10001` if none was given. Top 10 suggested homepage keywords.
- Caps: 20 homepage phrases per include/exclude side (screen), 50 subindustries per list, 10 geographic areas, radius 0 < r ≤ 1,000 km, relevance ∈ {MAX_RELEVANCE, BALANCED, MAX_COVERAGE}. `min_similarity` (legacy) is blocked. Only 59 known filter keys are allowed. A subindustry needs its parent industry included and cannot also be excluded.
- Expansion: target clamped to 100–100,000. Batch 2,500. Rolling exclusion, offset always 0. Prior-domain list ≤100,000.

**Company scoring (validate/icp)**
- fit × confidence → score: yes 10/9/8, partial 7/6/5, no 0/2/4 (high/medium/low). Numeric scores are normalized to 0–10. Without fit, a boolean decides 8 or 3. Deep-review mode: yes 10, no 0, else 6.
- Tier 1 ≥ 8, Tier 2 ≥ 5, Cut < 5. Usable = Tier 1 + Tier 2. Rate = usable / reviewed.
- Status: Passed ≥ 0.80, Needs Review ≥ 0.70, else Failed. n8n labels: ≥0.90 Very clean, ≥0.85 Strong, ≥0.75 Usable with review, else Too noisy. **The screen uses different labels** (≥0.80 Usable, ≥0.75 Needs refinement). The 80% gate is **shown only**. Only the approval checkbox unlocks expansion.
- Review JSON must stay under 95,000 characters (Airtable long-text safety).
- Verifier standard prompt (in `Build Validation With Campaign Thesis2`): yes = clearly provides the target service to the target customer. Partial = real provider, one detail uncertain. **No** for directories, referral/lead-gen sites, marketplaces, associations, media, product-only suppliers, wholesalers, manufacturers, software, staffing, consultants, design-only, training, unless the thesis targets them. Residential campaigns → no for commercial-only, industrial, institutional or government-only companies. Explicit exclusions beat similarity.

**Contacts**
- Sample = first 100 approved companies (Tier 1/2 only). Companies outside the employee range, or of unknown size, are held. A held duplicate cannot be revived.
- People per company default **5** (`results_by_company`). 500 domains per discovery call. `has_email=true` by default.
- Global contact-country exclusion added to every search: India, Pakistan and every African country/territory (also stated in `icp_text`). Never use company location in place of person location.
- Contact review tiers mirror companies (yes/partial/no × confidence). Status Passed ≥0.8 / Needs Review ≥0.7 / Failed. "Needs Review" contacts are neither approved nor rejected.
- One global queue: one contact run at a time across all lists, FIFO by `Contact Queued At`.

**Verification**
- MillionVerifier first, always (code forces it; the per-type provider fields are ignored). ok/good/valid/deliverable → Good. invalid/bad/disposable/disabled → Bad. catch_all/unknown/risky/accept_all → **Risky (never Good)**. Blank → Pending (not processed, often no credits).
- Only Good, single-verdict, single-identity emails reach Final Direct / Final Generic. Generic = the email type from source, or a role pattern (`info|hello|contact|sales|support|admin|office|team|marketing|service|customerservice@`).
- Generic emails come from company `public_emails`. "Footprint 200 or less" drops companies with a digital footprint >200 or unknown.
- LeadMagic recovery: only direct contacts with a first name, last name and domain that are not already Good and not already attempted. A LeadMagic status of valid/deliverable/verified/valid_email → Good (no MillionVerifier re-check). Provider errors are held for review, not marked invalid.
- Never resubmit when a job ID exists without a terminal state. "Check status" can never purchase.

**Enrichment / QA**
- Prompt compiler format: `# ENRICHMENT PROMPT`, `# INPUTS`, then per variable `# VARIABLE: <Column>` with `## SCOPE` (company|person), `## OBJECTIVE`, `## RESEARCH INSTRUCTIONS`, `## RESTRICTIONS`, `## FALLBACK`, `## OUTPUT` (one camelCase key, an exact not-found sentinel). It contains built-in recipes for case study, phone, city, lunch restaurant and contractor type.
- QA required: Direct = Company, First Name, Email. Generic = Company, Email. Plus every variable used in the current copy and every declared `VARIABLE`. Verification Status must be Good. Email must be unique. Sentinels are treated as empty (`-, n/a, none, not found, unknown, null…`), as are JSON blobs and unrendered `{{…}}` / `{VAR}`. Generic copy may not contain `{{FIRST_NAME}}`. Greeting lines with `{FIRST_NAME}` are stripped for generic.

**Exclusions:** 30-day interested window, permanent booked/won, onboarding DNC, list-scoped exclusion of existing domains, top-up destination exclusion by email and LinkedIn.

## 4. Dead, duplicated, test and one-off paths
- **Company and Contact Review:** 1,054 of 1,422 non-note nodes (**74%**) cannot be reached from any trigger. That includes 90 "Analyze Rejections / Refined Validation" loop nodes (the "adaptive refinement" in the name is dead), 172 old "Saved Batch" nodes and 684 numbered copies (`…1`, `…2`, or no suffix). 44 of the unreachable nodes are paid-provider calls. `Company Restart Webhook` and `Company Restart Webhook1` are two copies of the restart path.
- **Expansion Worker:** 138 of 440 nodes are unreachable. The entry also rejects every action except Expand Companies, so its whole contact/ContraGen section (contacts/discover, process-personas) can never run. Two webhook nodes (`…Webhook`, `…Webhook1`).
- **05 Enrichment:** 3 full copies on **one path with one webhookId** (in the 2026-10-29 snapshot). 19 unreachable nodes ("Build Exclusions … Read Sheets / Destination Membership", `Route Enrichment Destination2` with no outputs). `Build Exclusions Sources` returns `bypass:true` every time.
- **03 Verification:** 66 unreachable nodes, including 7 disabled LeadMagic validate / "LeadMagic first" nodes.
- **04:** 1 orphan node (`Compile Detailed Prompt with AI`).
- **[INACTIVE REPAIR COPY LIVEBASE-20261017] Verification Submit and Check** (`xQ7MBWv2NZxJAePL`, 248 nodes): named inactive but `active: true`, with an **unauthenticated webhook** that can call MillionVerifier and LeadMagic (path UNKNOWN).
- **LeadMagic Bulk Email Finder** (`CWKS3aMtFhOpndTFcAhPC`): called by nothing in the snapshot, **no auth**. Its idempotency key defaults to the execution ID (so no real idempotency). It waits on a callback with no timeout and reads `downloadUrl` from the *submit* response (likely wrong). Treat it as test/orphan.
- **My workflow 11** (1 webhook node): stray.
- **Test record:** the code skips one record ID in 03/04/05/06 and in every action except Build Contact Sample in Company and Contact Review, and only that record uses the in-workflow "Durable Contact" path.
- **One-off hardcoded records:** **27 distinct Airtable record IDs** across the Lead List workflows (06: 12, Company and Contact Review: 13, 05: 4, worker: 3, 03: 2, exclusions: 2, 04: 1). Examples: 5 lists with an approved non-factual fallback phrase in QA; one campaign's QA scope; 2 lists with jewellery/manufacturing evidence rules (`mjj-evidence-v1`, product-URL/price/material checks); one list with a pinned contract that contains a full ICP; a saved DiscoGen task ID reused for one list; one client's two workspaces grouped for exclusions.
- **Embedded prospect data in code** (repo hygiene, not copied here): about 246 KB of company rows in `Prepare DiscoGen Request2` (05) and saved target domain lists in `Normalize Lead List2`. The README says prospect rows were removed only from the repair copy.
- **Airtable fields the code never reads** (screen settings with no effect in Lead List n8n): `SEG Rule`, `SEG Providers` (the "Exclude SEGs" toggle), `Catch-All Policy`, `Role Email Policy`, `Free Email Policy`, `Generic/Direct Verification Provider`, `Workflow Template`, `Target Personas`, `Contact Sample Revision`. ESP data is only counted (`ESP Breakdown JSON`). Whether the Campaign Center uses the SEG fields is UNKNOWN.
- A previous offline rebuild ("Dulcy lead worker", API38/40) exists in `automations/n8n-migration-notes/`. NEXT.md marks it "reference only".

## 5. Data contracts (Lead Lists `tblVOg9BkPOMmnitt`; R = read, W = written)
| Field (ID) | Stages |
|---|---|
| Automation Action `fldhViG7kJ5rKEaa4` | screen W; dispatcher R; Company and Contact Review / 03 W (null) |
| Enrichment Action `fldLyvQsbGvii0iUK` / QA Action `fldcBmKEYX8KUiKAM` | screen W; 04/05/06 W (null) |
| Processing Status `fldf9wpMGWg0SebHV` (Not Started/Queued/Running/Waiting/Completed/Failed) | all W; screen and dispatcher R (lock) |
| Workflow Run ID `fld4kyzDwnHq5V4Iy`, Processing Started/Completed At `fldUZOY2Ubs58DQ3V`/`fldMSv3547BOvfdmH` | all W; dispatcher and the "still current" checks R |
| Last Workflow Message/Error `fldVnH7Pn1PxlZI5b`/`fldBiCrm8Xm1V6FxF`, Processing Progress `fldaUFUWOLtKIovQE` | all W |
| Lead List Stage `fld8nrebRFL0O8kgj` | 03/05/06 and screen W (partial; see 2.12) |
| ICP Description `fldcYwP7Dlq4uyC39`, List Thesis `fldg6HZIKqe8c8RtW`, Source Type `fldJSSY0QTMU5pzsQ`, Domain Source File `fldVIpEks58Pgerne`, Client `fldEujtSLqwdpOyGD`, Which Campaign? `fldepbn71awSjmZPV` | 2.1–2.5 R |
| DiscoLike Company Filters JSON `fldC2hZQ3gSqLmi1y`, Employee Range `fldG2MXz5lccu7KKU`, Country Filters `fldja37uHGyGpZZLB`, State Filters `fldoeQZ5utB7F9XkD`, Homepage Keywords `fldydpLzUzAJGLBBJ` | 2.1 W; 2.2/2.4 R; TAM R |
| Company Sample Size/Good/Bad/Fit Rate/Validation Status/Summary `fldiedxTwtn6TikJi`/`fldAWCY4Tl9jpQtYc`/`fldqaiJodYBS3GpRu`/`fldDD7HGFq0j3Iwfp`/`fldY1i1787UwZFOr6`/`fld6BhZSLdGOkCJCZ`, Company Needs Review Count `fldmyD4PJ9mXdCJZ8`, Source Company Count `fldRLtvugIxH9qun1` | 2.2/2.4 W |
| Company Sample Approved `fldqGx4RU4zDYxitK` | screen W; 2.2 W false; 2.4 R (gate) |
| Expansion Target `fldYzvqGmQZxXL9AP` | screen W; 2.4 and 2.5 R (shared) |
| Use DiscoGen Deep Review `fldsYFrdNF2VBS6SQ`, Deep Review Prompt/Extra `fldVCKrDuXfEhxjZm`/`fldH7LfiagdudqYJn`, DiscoGen Review Results URL `fld0KlQqxFEG6wgfU` | screen W; 2.2/2.4 R/W |
| Company Source File `fld7cUV4rvR35SVvC`, Company Review File `fldDrYUU7LcuF8nLC`, Company Sample Provenance JSON `fld0XGYNDKLZzjwWH`, Company Restart History `fld2y2zxuAVGqZYEL`, Company Evidence Corrections JSON `fldL8OC0MQBPC3339` | 2.2/2.3 W |
| Contact Persona DNA `fldRIomZHeVxPWveE`, Contact Source `fldwoK7IcKH6NYgVJ`, Contact Filters JSON `fld8Y8iYpvUV4FDDX`, Contact Sample Approved `fldVz983EKKiPSzjc` | 2.5 R |
| Contact Queue Status `fldiRqsZug1W0Otvs`, Contact Queued At `fldX3ZuuLZjuTcLVt` | 2.5 W/R (global lock) |
| Contact Sample Size/Good/Bad/Rate/Status/Summary/Review File (`fldE2XBsGSES6fT6X`, `fldkWL67N8ZaBIaDi`, `flda4qjRC0sCeStBg`, `fldbiciFuOmAzv38D`, `fldVH77A3Ozjh4t8k`, `fldnScb360OZ17VRt`, `fldRfTjDgsvbdoigO`) | Contact Processor W (UNKNOWN) |
| Lead List Link `fldSOTvnUxzKWXMDD` (project Google Sheet) | 2.2/2.4/2.7/2.10 W; all later stages R |
| Include Generic/Direct `fldIXN5t3bqfiZ0Wu`/`fldfFcn3BB2RyiWer`, Use LeadMagic Fallback `fldJbIiQ35ZFPsXPL`, Generic Emails Footprint 200 or Less `fldAFATYp9G26MmVj` | screen W; 2.7 R |
| MillionVerifier Job ID `fld4B7jLPdcgzdkgF`, LeadMagic Job ID `fld1UmiJ0PsIndCtO`, Verification Idempotency Key `fldPiw2FHZgLQdJb4`, Source Version `fldoqeuhaQxAjtjx0`, Provider State `fldflrzfkhmW7JarV`, Route `fldkSwOgZ3tqz8tx9` | 2.7 W/R (job lock) |
| Verification Good/Risky/Bad Count `fld8kUuSdLo5autI7`/`fldXl4sV7ma4YAOv7`/`fld9Jgzxc9JqeFAus`, Completed At `fldxehC2cjGGK8ruN`, Recovery Result `fldBNcX5GhxJj2rJu`, Verified Generic/Direct `fldd5zmRzTjz5bvPy`/`fldf3pl1RYHishCKV`, Final Generic/Direct `fld0FHomkh3uyx0FD`/`fldQZJCpTofahmTkl`, Number of leads `fld2G5D1yCPFGFiVF` | 2.7 W; 2.10 W (quarantine) |
| Custom Variables Requested `fldTYRjTrpVW27tmG` | screen W; 2.8 W; 2.9/2.10 R |
| QA Status `fldUB4WsLi5kq6rUy`, QA Summary `fld9XB4gkZcizeHUg`, Required Fields Present `fldWDSDICYaL9SQEa`, Duplicate Check Passed `fldgWhI2Nm2Y9c91O`, Final Schema Passed `fld9p2h93vRGm6D3e`, Duplicate Count `fldSk4FJKAHo5yGhc`, Rejected Count `fldllzDyi67HGc0FC` | 2.10 W; screen W (manual pass) |
| Top-up Build Scope JSON `fldevysyehxsGxt2q` | Campaign Center W; 2.2/2.5/2.7/2.9 R |
| TAM Check JSON `fldKNUnxiySLsIUny` | screen W (requested); TAM Finder W |
| Run Timing JSON `fld1QphpklpYJqP0I`, ESP Breakdown JSON `fldJCxECBr4wD09a3` | 2.4/2.5 W |
| Batch Workbook Layout JSON (no ID in snapshot) | 2.7 R |
Workspace IDs (`tblcjRBGJEWh5KgOt`): `Refresh Domain Exclusions` `fldlHJdnYJ3Y1akza`, `DiscoLike Exclusion Query ID`, `Domain Exclusion Count`, `Domain Exclusions Refreshed At`, `Booked Meeting Exclusion Domains`, `… Overrides` (IDs not resolved here).
Google Sheet tabs (contract between stages): Expanded Companies, Expanded Company Review, Contacts, contact review tab, Verified Leads, Verification Good/Risky/Bad/Pending, Final Generic, Final Direct, Final Export, QA Review, QA Quarantine.

## 6. Top 10 reliability problems (with evidence)
1. **The contact, decision and error logic is not readable.** Company and Contact Review hands every contact run to `CodexContactProcessorDraft20261028` and Apply Contact Decisions to `JWrteAxXQ1PIII4IelGoX`. 9 of the 12 Lead List workflows send failures to error workflow `NtpwlzuP2tuJM6OC5U_m9`. None of the three is in the 158-workflow export, and all three returned "Workflow not found" on 2026-11-18 (the connector only sees MCP-enabled workflows, so they may still exist). The 2026-10-30 checkpoint shows the processor was 341 nodes, named "Draft". **Proven missing from view; whether they exist is UNKNOWN.**
2. **A failed run can leave the list, and the whole contact queue, stuck.** Only 2 code paths ever write Processing Status = Failed. 06 QA and the TAM Finder have no error workflow. The screen blocks every button while the status is Running/Queued/Waiting. The contact queue is global and treats any row with `Contact Queue Status = Running` as busy, re-checking every 60 s with no limit (`Decide Contact Queue Turn2`, `Wait in Contact Queue2`). **Inferred.** One orphaned "Running" row stops contact runs for every list.
3. **Polling without limits.** The ICP validation poll (15 s), the enrichment poll (wait node with no settings) and the contact queue have no maximum. The LeadMagic bulk callback wait has no timeout. Only the contact review has a cap (80/84 polls). **Proven in code.**
4. **Too big for n8n.** 1,084 code nodes hold about 3.8 million characters of JavaScript. Eight code nodes are 32k–267k characters. The 217-item subindustry list is copied 13 times, and most logic exists in 3 copies. The same 300-second code-task limit already broke Top Up (`BUILD-ERRORS-2026-11-17.md` #2). `Calculate Expanded Company Tiers` (34k characters, per 2,500-company batch) and `Build Enriched Sheet Values2` (35k) are at the same risk. **Inferred risk.**
5. **27 hardcoded record IDs change behaviour for specific lists** (QA rules, deep review, pinned ICP, workspace grouping, test-record skips). Client data lives in code, so a rebuild will either copy them by accident or silently change those lists. About 246 KB of prospect company rows also sit in code and in the repo copy. **Proven.**
6. **Paid endpoints with no authentication.** 03, 04, 05 and 06, both restart webhooks, both worker webhooks, Refresh Exclusions, the LeadMagic bulk finder and the active "INACTIVE REPAIR COPY" accept any caller who knows the URL. They can spend MillionVerifier, LeadMagic, DiscoLike/DiscoGen and OpenAI credits. Only Webhook2 and the Ingress Sanitizer use header auth. The dispatcher sends the auth header only for company/contact actions. **Proven** (also README finding 3).
7. **Duplicate entry points with unknown routing.** 05 has 3 webhook nodes with the same path and webhookId, and the copies behave differently (copies 0/1 enrich Final Direct only; copy 2 has a one-off recovery). The restart path and the worker each have 2 copies. Which copy n8n runs is UNKNOWN. **Proven duplication; routing UNKNOWN.**
8. **Screen settings that do nothing.** "Exclude SEGs", Catch-All/Role/Free email policies, per-type verifier choice, Workflow Template and Target Personas are never read by the Lead List workflows. "Use DiscoGen deep review" switches to DiscoGen research only for 3 hardcoded lists (2 in expansion). The `Build New Contact Sample` option is rejected by the dispatcher. **Proven in code; effect on a real run not observed.**
9. **Gates that do not match the rules.** (a) Build Contact Sample runs without `Company Sample Approved`; neither the screen nor n8n checks it. (b) The 80% usability gate is display only. (c) The live contact path runs a DiscoGen persona AI review of every contact (sometimes `web_search=true`). That may conflict with the Oct 9 rule "no second paid AI/web-research review". **Alex must decide.** (d) Expansion and contact expansion share one `Expansion Target` field. **Proven.**
10. **Drift and hidden state.** Live Company and Contact Review has 9 nodes that are not in the repo. Postgres functions and tables that hold job state, locks and receipts are not in the repo. Verification reads a field (`Batch Workbook Layout JSON`) missing from the schema snapshot. Progress fractions disagree (x/6 on the screen, x/7 in n8n; QA writes 5/7 and then 1). Exclusion refresh fails outright past 12,000 Emails rows, and the weekly job hides per-client failures (`neverError`). Expansion runs one batch at a time, not two ("Run Two … at a Time" has the default batch size 1). A 100,000 target means 40 serial calls of up to 30 min each, with no resume action. **Proven.**

## 7. Proposed changes (need Alex's approval; none applied)
- None in live systems for this task. For the rebuild: keep every rule in section 3 as tested server code, drop the paths in section 4, and turn the 27 hardcoded record IDs into explicit per-list settings that Alex approves one by one.

## 8. Still UNKNOWN
- What the Contact Processor, the Private Contact Decision Review and the error workflow contain, and whether they are live.
- The Postgres function bodies (`original_verifier_api`, `original_batch_api`) and the queue/receipt table schemas.
- Which webhook URL the dispatcher uses for company/contact actions (Webhook2 or the Ingress Sanitizer), and which 05 copy answers.
- Exact DiscoLike credit cost of validate/icp, exclusion-list and discogen calls, and the default wait time of the enrichment poll.
- What the 9 extra live nodes ("Saved Output Resume — …") do.

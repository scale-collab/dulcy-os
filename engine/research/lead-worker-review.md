# dulcy-lead-worker: read-only review (reference for the new lead engine)

Reviewed 2026-11-17. Repo: `/home/user/dulcy-lead-worker` (one commit, `f77082f`, working tree clean).
Nothing was changed. No external service was called. Only the local unit tests were run, with Node's permission
mode on, so they could not write files or spawn processes. They use made-up data and fake fetch functions.

## 1. What it is

**Purpose.** A private, offline rewrite of the n8n "Lead List Center" workflows (n8n.dulcy.io) into Node code.
The aim was to replace n8n with a durable worker that Airtable buttons call. It was never deployed. Its README
says: "It has not been connected to real jobs or switched on."

**How it was built.** It copies the n8n workflows node by node. Many functions are named after n8n nodes
(`"Discover 100 Companies2"`, `"Upload to MillionVerifier"`), and some run the original n8n Code-node text inside
a small `$()`/`$input` shim. See `src/exclusions/domains.mjs` and `src/verification/output.mjs`.

**Language and stack.**
- Node ESM (`.mjs`), with **zero npm dependencies** (`package.json`, `package-lock.json`). It uses only `node:crypto`, `node:fs`, `node:test` and similar built-ins.
- It requires **Node >=26.3.0 <27** (`.node-version` 26.3.0). That is not an LTS line. This box has Node 22.23.5.
- Python 3 check scripts (`scripts/check-*.py`) run groups of Node tests and compare hashes.
- **PostgreSQL** is the store: 88 `.sql` files in `src/storage/` (about 10.9k lines) using plpgsql, jsonb, `pg_advisory_*` locks, `FOR UPDATE SKIP LOCKED` and immutability triggers. Every function is `SECURITY DEFINER` and checks role and permission rules.
- There is **no Postgres driver**. All DB access goes through an injected `execute({text,values})` function, and the tests supply fakes.

**How it runs.** It doesn't run yet. There is no HTTP listener, no scheduler and no real provider adapter.
- `private-host/current-source-api40-v21/host.mjs` builds Fetch-style `Request -> Response` handlers for 8 paths (`/lead-list-center-actions-v2`, `/lead-list-verification-submit-check-v2`, `/lead-list-enrichment-run`, `/lead-list-automated-qa`, `/lead-list-company-restart` and others). They need a shared-secret header and an event-UUID header.
- `job-runner.mjs` is a lease-based loop (`claim`, `renew`, `ack`) over a Postgres journal (`durable-jobs/schema.sql`).
- Provider calls are **request plans**: plain objects holding url, method, timeout, `maxAttempts` and `accountBinding`. Injected ports would perform them. There is no `fetch(` anywhere in `src/` or `private-host/`.

**Stages and actions covered.** These match the Lead List Center action names in `src/routing/lead-list-actions.mjs`:
- Company: Generate Filters, Run Company Sample (DiscoLike `/v1/discover`, ICP validate `/v1/validate/icp`, DiscoGen deep review `/v1/discogen/process|status`), Refine Company Sample, Expand Companies (batched parent/child), Restart Companies. CSV-upload sample mode is also covered.
- Contact: Build Contact Sample, Expand Contacts, Apply Contact Decisions. This includes persona review, location and email policy, and LeadMagic bulk email finder (`/bulk/submit`, `/bulk/jobs/`).
- Verify and Finalize, and Retry Failed Stage: MillionVerifier bulk upload and check, Good/Risky/Bad split, recovery of failed rows.
- Enrichment: Prepare Enrichment Prompt (OpenAI Responses API, model `gpt-5.6-luna`), Run Enrichment, Skip Enrichment.
- Automated QA: structural list QA and the linked campaign QA contract.
- Client domain exclusions, prior-lead exclusions, EmailBison top-up exclusions and targets (`send.dulcy.io/api/campaigns/`).
- Outputs: Google Sheets tabs and Airtable PATCHes or attachment uploads.

**How complete it is.**

| Layer | State |
|---|---|
| Pure business rules (`src/companies`, `contacts`, `verification`, `qa`, `enrichment`, `exclusions`, `filters`) | Implemented and unit-tested. About 14k lines in `src/`. |
| Request plans (endpoints, bodies, timeouts) | Implemented as data. Never executed against a live API. |
| Postgres journals and state machines | Implemented as SQL. Tested against fake executors; the docs mention separate local native DB runs. |
| HTTP server, worker process, provider adapters, secrets loading, deploy, backups | **Missing.** The docs list these as open: "producer wiring, full error flow, clean setup, server capacity/backups and release/rollback checks remain open". |
| EmailBison campaign *build* (create campaign, upload leads, sequences) | **Not covered.** Only top-up *targets* and exclusion reads exist. |
| `private-runtime/` (153 MB, about 15.5k files) | About 30 frozen copies of whole versions (`api28…api40`, `v20…v29`, `host-*`). History only; mostly duplicate code. |
| `docs/` (138 files) | Build diary (V89…V98). Dense, written in Codex's own vocabulary. Hard to use as a spec. |

## 2. Quality

**Tests.**
- 219 `test/*.test.mjs` files, about 13.8k lines, and **6,018 test cases**. Fixtures are in `test/fixtures/`, fake I/O helpers in `test/helpers/`, and 5.6 MB of captured n8n source text in `test/reference/` for byte-parity checks.
- Coverage: business rule outputs, request-plan parity with the captured n8n nodes, replay and duplicate handling, lease expiry, uncertain-save holds, fake rate limits (429), malformed provider replies, and auth refusal.
- **Offline result:** `node --experimental-permission --allow-fs-read=. --test --experimental-test-isolation=none test/*.test.mjs` (Node 22 versions of the `npm test` flags) gave **5,875 pass / 143 fail**. 141 failures are `HOLD_RELEASE_SOURCE_DRIFT`: the committed `release.json` hash for `package.json` no longer matches the file, so every "verified" worker factory refuses to load. The other 2 are hash-pin checks of the same kind. **This is a stale manifest in the repo, not a logic bug.**
- The Python suites (`scripts/check-development-build.py`, 280 checks; `check-next-build.py`, 340) were not run. They hard-code Node 26 flags and spawn subprocesses.

**Structure.**
- Positive: small, single-purpose modules (most under 150 lines), a strict split between pure logic and I/O ports, and frozen objects.
- Negative: very hard to read. Logic is minified onto single long lines. Names mirror n8n nodes. There are layers of "composition", "extension", "successor" and "native" wrappers.
- `scripts/check-publish.mjs` is **23,857 lines** of generated assertions.
- Hard-coded live IDs are everywhere: Airtable base `appxqINt5XKw7a76A` (73 times), table `tblVOg9BkPOMmnitt`, many `fld…` IDs, n8n workflow IDs, and caller names in SQL `CHECK`s.
- **A client-specific special case is hard-coded**: record `rectAjZPdU3JAkJ4v` switches on DiscoGen deep review in `src/companies/main-sample-requests.mjs`.

**Error handling.**
- Every failure is a thrown `HOLD_*` code. A held job stops and needs an explicit requeue with proof of the expected outcome.
- Strong rule: **a provider call or save whose result is uncertain is never retried automatically** (`src/jobs/paid-step.mjs`). Good for credit safety, but there is no backoff/retry policy for clearly safe failures beyond `maxAttempts` on the request plans.
- No logging at all: zero `console.*` or logger calls in `src/` and `private-host/`. There are no metrics and no Slack or email alert path, apart from an automation-error mail *plan* in `src/transport/automation-error-mail.mjs`.

**Idempotency and checkpoints.** This is the strongest part.
- `durable-jobs/schema.sql`: `job` and `attempt` tables with lease ID, epoch, lease expiry, immutable attempt outcomes, one leased job per record, and a request-hash check on replay.
- `job-runner.mjs`: background lease renewal, `fence()` around each effect (renew before and after), and "ACK uncertain" handling.
- `src/jobs/receipts.mjs` with `paid-step.mjs`: a receipt is claimed **before** a paid call. A replay returns the saved response instead of calling again.
- Per-stage `*-plan.sql` and `*-step.sql` journals save typed checkpoints, for example contact dispatch and verification submit/check/recovery.

**Secrets.**
- **No real secrets are committed.** I scanned for Airtable PATs, `sk-`, JWT, AWS, Slack and GitHub tokens, private keys and `.env` files. The secret-like strings in tests are fake (they start `FICTIO…`, `__MADE_UP_…`, `MADEUP…`).
- `.gitignore` covers `.env*`, keys, `*.sql` dumps and CSVs.
- **Flag (live design, not the repo):** per-client EmailBison API keys are read from an Airtable Workspace field named `"EmailBison API"` and passed along inside job JSON (`src/companies/worker-destination-targets.mjs:9,42`, `src/enrichment/build-exclusions.mjs:16`). The new engine should keep provider keys in server-side secrets and keep them out of Airtable and job payloads.
- Real company IDs (Airtable base, table and field IDs, n8n workflow IDs, `n8n.dulcy.io`, `send.dulcy.io`) are committed. They are not credentials, but the repo must stay private.

## 3. What to reuse vs avoid

**Worth copying (logic and rules; clean them up when porting):**
- `src/routing/lead-list-actions.mjs`: maps Airtable action to stage, suppresses duplicate clicks while a run is active, rejects a superseded action, treats a 408 as "accepted, re-check".
- `src/jobs/paid-step.mjs` and `src/jobs/receipts.mjs`: claim a receipt before a paid call, replay the saved response, never auto-retry an uncertain outcome. This is the core of credit safety.
- `private-host/current-source-api40-v21/job-runner.mjs` and `durable-jobs/schema.sql`: lease, renew and fence pattern; job plus immutable-attempt tables; one active job per record. Rewrite in plain SQL with `SKIP LOCKED` and drop the role and hash checks.
- `src/companies/scoring.mjs`: parses DiscoLike and ICP validation result envelopes and scores fit (thresholds, deep-review yes/no/partial).
- `src/companies/review-sample.mjs`, `plan-expansion.mjs`, `review-expansion.mjs`, `worker-discovery.mjs`, `worker-qualification.mjs`: sample sizes, tiers and cuts, and batch planning for expansion.
- `src/contacts/email-policy.mjs`: personal-domain list and ESP classification (Google, Microsoft, Proofpoint).
- `src/contacts/location-policy.mjs` (440 lines): contact geography rules.
- `src/contacts/review-request.mjs`, `review-hard-filters.mjs`, `review-role-conflicts.mjs`: persona review prompt rules, including the global location exclusion and the one-result-per-contact rule.
- `src/verification/build-output.mjs`: Good/Risky/Bad grouping, role and generic email detection, and Good-only final output.
- `src/verification/recovery.mjs`: LeadMagic and MillionVerifier edge cases (zero-credit no-result rows, credit conflicts, pending vs terminal states).
- `src/qa/analyze.mjs`, `qa/campaign-contract.mjs`, `qa/corrections.mjs`: column alias map and structural QA checks before a list is marked Ready.
- `src/exclusions/domains.mjs`: domain and email extraction regexes and the blocked-host list for client exclusions (take the logic out of the n8n `$()` shim).
- `src/enrichment/prompt-model.mjs`, `run-request.mjs`, `output-contracts.mjs`: how enrichment prompts are compiled and how outputs are shaped.
- `src/companies/main-sample-requests.mjs` and the other `*-requests.mjs` files: **reference only**, for exact provider endpoints, bodies, timeouts and the Airtable fields written at each stage.
- `test/helpers/*` (`orderedRequests` with injected 429s, `attempts`): good patterns for fake provider tests.

**Avoid:**
- The node-by-node n8n clone, and running n8n Code-node text through `$()` shims. It carries over n8n quirks and node-name coupling.
- Hard-coded Airtable, n8n and client IDs in code and in SQL `CHECK`s, and the per-record special case. Put these in config.
- Hash-pinned release manifests (`release.json`, `artifact.json`, `check-publish.mjs`) that refuse to run after any edit. They already break the test suite.
- The `SECURITY DEFINER` plpgsql setup: role checks, NOLOGIN owners, about 3k jsonb uses, 234 plpgsql blocks. It is far too heavy for one Hetzner box and two people.
- `private-runtime/` version snapshots (153 MB) and the version-diary docs.
- The Node 26 pin. Target Node 22 or 24 LTS.
- Passing API keys through Airtable fields or job JSON.

## 4. Gaps vs the target engine

| Target need | In lead-worker? |
|---|---|
| Server on Hetzner behind a subdomain | No listener, no process manager, no Docker/systemd, no TLS or reverse proxy. |
| Airtable as UI (buttons, then engine, then status write-back) | Request plans for Airtable PATCHes exist. Real webhook producer wiring is open (docs V96: "Live input/field wiring is still missing"). |
| DiscoLike search, sample review, expand | Logic and request plans present. No real adapter. |
| Contacts (LeadMagic, DiscoLike contacts) | Logic and request plans present. No adapter. |
| MillionVerifier verify | Logic and request plans present (bulk v2). No adapter. |
| Enrichment | Present, but tied to OpenAI Responses API and an n8n "Message a model" node. |
| QA | Structural and campaign-contract QA present. |
| EmailBison campaign build | **Missing.** Only top-up target lookup and exclusions. |
| EmailBison top-up | Partial: destinations and exclusions only, no lead upload. |
| Job queue | Present as a Postgres design. No real driver, and the runner is not started. |
| Checkpoints and safe retries | Strong design (receipts, leases, holds). Not proven end to end live. |
| **Credit caps per job, client or day** | **Missing.** It prevents double-spend, but nothing limits total spend. Nothing checks a provider credit balance before a run either. |
| Bounce and placement checks (EmailGuard; 2.5% and 4% rules) | Missing. |
| Logs, metrics, alerts (Slack) | Missing: no logging at all. |
| Secrets management | Missing. Keys would come from Airtable fields or n8n credentials. |
| Backups, restore, rollback | Missing (listed as open). |
| Admin view of jobs | Missing. |
| Stage gates (sample, company and contact approval, verification, enrichment or skip, QA, launch) | Respected as a principle (`AGENTS.md`). Approvals are read from Airtable fields. Fits our "managed screens and stage gates" rule. |

## 5. Recommendation

**Use it as a rulebook, not as a base.** Rewrite the runtime and port the business rules.

**Rewrite (new, simple code):**
1. HTTP service: Fastify or Hono on Node 22/24 LTS, Docker or systemd on the Hetzner box behind Caddy or Traefik at a subdomain. Use HMAC-signed webhooks from Airtable button automations, each carrying an event UUID. The idea comes from `host.mjs` and `request.mjs`; the code should not be copied.
2. Job queue: one Postgres database with `jobs`, `attempts`, `receipts` and `checkpoints` tables, and `FOR UPDATE SKIP LOCKED` leases with heartbeat. pg-boss or Graphile Worker would also work. Keep the lease, fence and ack semantics from `job-runner.mjs` and the claim-before-call receipts from `paid-step.mjs`. Drop the role and hash machinery.
3. Provider adapters: thin typed clients for DiscoLike, LeadMagic, MillionVerifier, EmailBison, Airtable and Google Sheets. Each gets explicit timeouts, retry only on safe errors (429, 5xx before the request is accepted), and never a retry on an uncertain paid call. Use the `*-requests.mjs` files as the endpoint and body reference.
4. **Credit caps:** a per-job budget set in Airtable at approval time, a per-client and per-day ceiling, a provider balance check before submit, and a hard stop that leaves the job in a held state. This is new work.
5. Structured JSON logs (pino) with job and stage IDs, a Slack alert on hold or failure, a `/health` endpoint, and nightly `pg_dump`.
6. EmailBison campaign build and top-up (create campaign, add leads, attach sequence, all paused). This is new, and it must stop before launch for Alex's approval.
7. Config: base, table and field IDs, and client special cases, in one config file. Secrets in env or a secrets file on the server, never in Airtable.

**Port (rewrite into readable code, keep the rules, rebuild their tests):** the routing map; company scoring, sample, expansion and qualification rules; contact email and location policy; persona-review prompt rules; verification output, recovery and status mapping; QA analyze and contract; domain exclusion extraction; enrichment prompt and output contracts. Port them as pure functions with unit tests. Many existing test cases can be adapted as golden examples.

**Before porting**, confirm each rule against the current live n8n workflow. The repo is pinned to old saved source versions, and docs V94 says newer live functions differ for contact samples. Rules that look like a deliberate operating choice also need Alex's OK, for example the global contact-location exclusion and the `rectAjZPdU3JAkJ4v` deep-review case.

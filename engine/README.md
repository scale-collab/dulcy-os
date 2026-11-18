# Dulcy lead engine

The app that will run lead lists and campaigns as safe, resumable jobs, with Airtable as the screen. Plan: `PLAN.md`. Research: `research/`.

**Status (2026-11-18): step 1, the skeleton, is done and deployed on the Hetzner server (`/opt/dulcy-os`, port 127.0.0.1:8090). Dry-run only: it makes no paid calls.** Step 2a, the **Verify** stage (`leadlist.verify`), is built and tested in shadow mode: it computes results but writes nothing to Airtable yet.

## What the skeleton already guarantees (all tested)
| Problem today | What the engine does | Test |
|---|---|---|
| Double clicks start two runs | Only one active job per record and action | `double click…` |
| A retry repeats work or re-uploads | Each finished step is saved and skipped on retry | `finished steps are not repeated…` |
| Paying twice for the same call | A receipt is written before every paid call; a repeat reuses the saved answer | `paid call: never pays twice…` |
| A crash mid-call gets retried blindly | An unclear outcome goes to **needs review**, never an auto-retry | same test |
| Runaway spend | Credit caps per job and per day; the job stops before spending | `credit cap…` |
| Runs going 18+ hours | Every step and job has a time limit | `step time limit…` |
| One stuck run freezes the queue | Leases expire, so another worker picks the job up | `a crashed worker never blocks…` |
| Anyone with the URL can trigger paid work | Every request is signed (HMAC) and must be fresh | `signatures…`, `HTTP…` |

Run the tests (needs a Postgres):
```bash
cd engine && npm ci && TEST_DATABASE_URL=postgres://USER@HOST:PORT/DB npm test
```

## Verify stage (`leadlist.verify`), shadow mode
Same rules as the old n8n "03 Verification" workflow (`src/verify/rules.ts`):
- MillionVerifier first. ok/good/valid/deliverable = **Good**; invalid/bad/disposable/disabled = **Bad**; catch_all/unknown/risky/accept_all = **Risky (never Good)**; blank = **Pending** (not processed, usually no credits). An unknown verdict goes to review.
- Dedupe by email. One email shared by different people, or one person with several emails, is **held** (never sent, never final).
- Role inboxes (`info@`, `hello@`, `sales@` and so on) count as generic. "Footprint 200 or less" drops generic emails from companies over 200 or unknown.
- Rows with no email count as Risky; malformed emails count as Bad without spending a credit.
- Final Direct and Final Generic contain **Good only**.

What the engine adds:
- **Upload once.** The receipt belongs to the list and its exact email set, so a retry or a second click reuses the same MillionVerifier job. An unclear upload (timeout, 5xx) goes to review and is never re-uploaded.
- **A saved MillionVerifier Job ID** (`existingJobId`) is only checked and downloaded, never re-uploaded.
- **No "Check status" button needed.** While MillionVerifier works, the job checks again every 2 minutes (`VERIFY_POLL_MS`). Waiting is free and uses no attempts. The 24-hour time limit stops it.
- **Strict results.** If the result file doesn't match the list (extra, duplicate or missing emails), it goes to review.
- **Credit cap.** A list bigger than `CAP_PER_JOB` stops before uploading. Raise the cap in `.env` for big lists.
- **Dry-run.** No upload; it returns the plan and the credits it would spend. With `existingJobId` it does the free check and download, which is how it is compared side by side with the old workflow's numbers (`expected`).

Input (`POST /jobs`, `kind: "leadlist.verify"`):
```json
{"rows": [{"email": "...", "type": "direct|generic", "firstName": "...", "lastName": "...", "company": "...", "domain": "...", "linkedin": "...", "footprint": 120}],
 "includeDirect": true, "includeGeneric": true, "genericFootprintMax200": false,
 "existingJobId": "optional MillionVerifier file id",
 "expected": {"good": 0, "risky": 0, "bad": 0}}
```
The result has the counts, Final Direct / Final Generic rows, held rows, pending emails, an `airtablePreview` of the fields step 2b will write, and the `comparison`. Logs keep counts only, never lead rows.

Not in this step: LeadMagic fallback, reading the rows from the list's Google Sheet, and writing back to Airtable/Sheets (step 2b).

## How Airtable will call it
`POST /jobs` with `{"kind": "...", "recordId": "rec...", "clientId": "rec...", "input": {...}, "requestId": "unique-per-click"}`.

Headers:
- `x-dulcy-timestamp`: milliseconds since epoch.
- `x-dulcy-signature`: hex HMAC-SHA256 of `timestamp + "." + body`, keyed with `ENGINE_SECRET`.

Replies:
- `202` (queued) or `200` (already running / same request).
- `GET /jobs/:id` (signed, with an empty body) returns status, steps and recent events.
- `GET /health` is open.

UNKNOWN: whether Airtable automation scripts can compute HMAC (`crypto.subtle`). This is checked in step 2. Fallback: a fixed bearer token over HTTPS.

## Deploy on the Hetzner server
1. Check out this repo on the server.
2. `cp engine/deploy/.env.example engine/deploy/.env` and fill it in: a long random `ENGINE_SECRET`, `POSTGRES_PASSWORD`, `SLACK_WEBHOOK_URL`. Keep `DRY_RUN=true`.
3. `bash engine/deploy/deploy.sh`. It pulls, builds, starts the engine plus its own Postgres on `127.0.0.1:8090`, and checks `/health`.
4. Subdomain: add a DNS A record `engine` -> the server IP. The server runs Coolify; its Traefik proxy (`coolify-proxy`) picks the engine up from the labels in `deploy/docker-compose.yml` and gets the HTTPS certificate. Check: `curl https://engine.dulcy.io/health`.

Docker build and start confirmed on the server 2026-11-18 (`/health` returned ok, dryRun true).

## Code map
- `src/main.ts`: starts the HTTP server and the worker loop.
- `src/http.ts`: signed API.
- `src/queue.ts`: jobs, leases, retries with backoff.
- `src/context.ts`: `step()` checkpoints, `paid()` receipts, credit caps, dry-run.
- `src/worker.ts`: runs jobs and sends Slack alerts on failure.
- `src/stages/`: one file per stage (`engine.selftest`, `verify.ts`).
- `src/verify/rules.ts`: verification rules (pure, tested).
- `src/providers/millionverifier.ts`: MillionVerifier bulk API client (paid upload vs free checks).
- `src/db/schema.sql`: tables `jobs`, `steps`, `receipts`, `events`.

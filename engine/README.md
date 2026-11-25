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

**Reading the list's sheet** (`input.source.sheetId`, a link or an ID): direct contacts from the `Contacts` tab, generic emails from `Expanded Companies` → `public_emails`, with the old workflow's rules (`src/sources/sheet.ts`). Only the needed columns are downloaded. Access is a read-only Google service account acting as `GOOGLE_IMPERSONATE_USER` (default scale@dulcy.io) through domain-wide delegation. Its key is `deploy/secrets/google-sa.json` on the server only; `deploy.sh` moves `deploy/google-sa.json` there and locks the folder.

**Side-by-side test on the server (free: it reuses the list's saved MillionVerifier job):**
```bash
cd /opt/dulcy-os/engine/deploy
docker compose exec engine node dist/src/cli.js verify <recordId> --sheet <sheet link> --mv-job <MillionVerifier Job ID> --expect good=N,risky=N,bad=N,finalDirect=N,finalGeneric=N
docker compose exec engine node dist/src/cli.js job <jobId>
# If the saved job no longer matches the sheet (the sheet was edited after verification), add --diagnose to see how many emails differ and why (counts only).
```

Not in this step: LeadMagic fallback, top-up "this build only" exclusions, the separate-workbook layout, and writing back to Airtable/Sheets.

## Campaign build stage (`campaign.build`), step 3
Builds one EmailBison campaign (one output: direct **or** generic) and **never launches it**. Built from the old n8n Output Builder's calls and rules (`src/campaign/rules.ts`, `src/providers/emailbison.ts`). It fixes:
- **Duplicates:** the campaign is created through a record-scoped receipt and its ID is kept at once. If a create's outcome is unclear (timeout, 5xx), the retry looks the campaign up by exact name and adopts it instead of creating a second one. A same-name campaign that already existed is never taken over silently.
- **Fixed waits:** each 5,000-row import is checked until EmailBison says Processed, then must reconcile exactly (processed = rows sent, failed = 0; otherwise review, with EmailBison's reason).
- **Lead count:** checked against Airtable's count before anything is created, and the campaign must end with exactly the uploaded leads.
- **Senders:** at most the number the leads can keep busy (leads / days between / 15); after attaching, the set must match exactly, all connected.
- **Errors:** EmailBison's message is kept, emails masked. Re-running the same record never duplicates anything.
- Sequence: 1-4 steps, up to 10 variants per step, wait on the step before (default 2 days). Generic copy drops the "Hi {FIRST_NAME}," line and refuses any other {FIRST_NAME}. Every merge tag must have a column in the Final tab.
- Schedule Mon-Fri, 08:xx-18:xx America/New_York (stable per campaign); settings as the old builder (can_unsubscribe false: Alex decision 2026-11-23).

Keys: `EMAILBISON_KEY_<WORKSPACE>` in the server `.env` only. Live switch per stage: `LIVE_STAGES=campaign.build` keeps MillionVerifier in dry-run.

Run on the server (dry-run shows the plan; live builds):
```bash
docker compose exec -T engine node dist/src/cli.js campaign < build.json
```
`build.json`: `{"recordId":"rec...","name":"...","workspace":"dulcy","outputType":"direct","steps":[{"subject":"...","body":"...","variants":[...]}],"source":{"sheetId":"..."},"expectedLeads":N,"senderEmails":["sender@domain.com"]}`. Use sender **addresses** (`senderEmails`): the engine looks up their current EmailBison IDs, because Airtable's Email IDs can be stale. List a workspace's senders with `docker compose exec engine node dist/src/cli.js senders dulcy [text]`.

Not yet: reading the copy and senders from Airtable, writing the IDs back, splitting direct/generic families, top-up (step 4).

## Top-up stage (`campaign.topup`), step 4
Adds a new Ready lead list (its Final tab) to a running EmailBison campaign. Never re-uploads, never launches, never changes senders.
- **Alex's rule first:** interested replies must be 15%+ of replies, or nothing is read or uploaded. Bounce under 4%, reply rate 2%+ and progress 60%+ are only flagged to watch. `kpiException: true` overrides on purpose.
- Every sender on the campaign must still be connected.
- The Final tab count must match Airtable before uploading.
- Same upload path as the build (import checked until Processed, exact counts, receipts, reconcile by list name).
- **Added vs skipped:** leads already in the campaign are skipped by EmailBison, so the engine waits until the campaign total stops moving and reports `added` and `skippedAlreadyInCampaign` (the old top-up used fixed waits here).

Run on the server: `docker compose exec -T engine node dist/src/cli.js topup < topup.json` with
`{"recordId":"rec<top-up lead list>","campaignId":123,"name":"<campaign name>","workspace":"dulcy","outputType":"direct","source":{"sheetId":"..."},"expectedLeads":N,"copyTags":["CITY"],"kpis":{"interestedRate":18,"replyRate":2.5,"bounceRate":1.1,"progress":65}}`.
Needs `LIVE_STAGES` to include `campaign.topup` to run live (dry-run shows the plan).

## Bounce check (`bounce.check`)
Alex's rule, re-checked **every run** (the Airtable automation fired once and could miss a campaign that crossed 2.5% first and 4% later):
- bounce **over 4%** and progress **35%+** → pause; bounce **over 2.5%** → watch.
- Bounce % = bounced ÷ leads contacted, the same as Airtable's "Bounced %". Read from EmailBison's campaign list, the same list the daily sync reads.
- Live, each pause is confirmed afterwards; a pause that didn't take effect goes to review. It never resumes anything.
- Slack gets one message per check if anything needs a pause or a watch.
- **Report-only by default.** It pauses for real only when `LIVE_STAGES` includes `bounce.check`.
- Run once by hand: `docker compose exec engine node dist/src/cli.js bounce dulcy`. Run on a timer: `BOUNCE_CHECK_EVERY_MIN=30` and `BOUNCE_CHECK_WORKSPACES=dulcy` in `.env`. Each workspace needs its `EMAILBISON_KEY_<WORKSPACE>`.

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
- `src/db/schema.sql`: tables `jobs`, `steps`, `receipts`, `events` (and the agents' and HQ's tables).
- `src/hq/`: Dulcy HQ (the private web app's API at `/hq/api`, served on `HQ_HOST` too): `auth.ts` (logins, sessions, Google), `server.ts` (routes, CSRF, static files), `decisions.ts`, `tasks.ts` (Eisenhower), `team.ts` (runs, team check), `chat.ts` (read-only tools, ask_agent), `reports.ts` (`hq_reports`, the `SLACK_REPORTS` switch), `generators.ts` (agent to-do lists). The web app is `../hq/web`; the Docker build (repo root context) builds both. User guide: `GUIDE.md` → HQ.

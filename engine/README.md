# Dulcy lead engine

The app that will run lead lists and campaigns as safe, resumable jobs, with Airtable as the screen. Plan: `PLAN.md`. Research: `research/`.

**Status (2026-11-18): step 1, the skeleton, is done and deployed on the Hetzner server (`/opt/dulcy-os`, port 127.0.0.1:8090). Dry-run only: it makes no paid calls.** No real stages yet; the next one is Verify (PLAN step 2).

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
- `src/stages/`: one file per stage (only the `engine.selftest` stage so far).
- `src/db/schema.sql`: tables `jobs`, `steps`, `receipts`, `events`.

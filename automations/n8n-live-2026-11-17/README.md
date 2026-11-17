# n8n live export, 2026-11-17

All 158 workflows were pulled read-only from the live n8n (`https://n8n.dulcy.io`) through the n8n connector on 2026-11-17. Nothing was run, activated or edited.

**This folder replaces `../n8n-workflows/` as the current copy.** The older folder holds local snapshots from ChatGPT/Codex and is kept for history.

- `workflows/`: one file per workflow, named `<name>--<id>.json`.
- `INDEX.md`: every workflow (ID, node count, trigger type) plus each webhook's protection setting.

## What was removed before committing
- Credential values, pinned data and static data. Credential *names* are kept as references only.
- Secret-looking values (API keys, bearer tokens, keys in URLs) were replaced with `REDACTED`.
- Webhook paths were replaced with `REDACTED_PATH`. On unprotected webhooks the path is the only thing keeping the URL private.
- Embedded prospect rows (names, emails, LinkedIn) were removed from 2 nodes in `[INACTIVE REPAIR COPY LIVEBASE-20261017] Verification Submit and Check`.
- Checks run: `detect-secrets` found nothing except Google Drive, Close and account IDs. A raw-vs-clean comparison found no removed value anywhere in the cleaned files.

These files are for reading and comparing. They will not import back into n8n as-is.

## Findings (2026-11-17)

### 1. Lead List Center "stage 01 and 02" are not separate workflows
No live workflow is named 01 or 02. Company and contact work (`Run Company Sample`, `Build Contact Sample`, `Expand Companies`, `Expand Contacts`, `Apply Contact Decisions`) is handled by:
- `[Lead List Center] Company and Contact Review - Adaptive Refinement` (`T_KveEbSPrwKFWz2neZ6k`)
- `[Lead List Center] Company Expansion Worker - 2,500 Batch` (`wkSiI4UDwyW3_yga47_EB`)

These are triggered from the Airtable Lead Lists field `Automation Action`, through the Airtable automation "Lead List Center Dispatcher".

### 2. The "lock sub-workflow" `JXPiiC2XLCvxCRqzEKk_0`
It is live and named `[Campaign Center] Coordinate Replenishment Cycles`. It takes and releases a Postgres lock (`pg_acquire` / `pg_release`) and runs Airtable, EmailBison and downstream steps as one coordinated operation. The older note's name for it ("Commit ... Under Campaign Lock") is out of date.

### 3. Most webhooks have no authentication
There are 112 webhook nodes in 106 workflows. Only 4 workflows use n8n header auth: Campaign Over 60%, Coordinate Replenishment Cycles, Ingress Lead List Center Authenticated Sanitizer, and Company and Contact Review. A quick code scan found 2 more that check a secret in code: EmailBison Output Builder and Top Up Existing EmailBison Campaign. That scan is a heuristic, so it may have missed some. The other ~100, including Lead List Center 03/04/05/06, the Inbox Manager reply receivers and the Reply Agent intakes, accept any caller who knows the URL. This answers the "To verify" item in `NEXT.md`.

### 4. API keys typed directly into workflows (not in n8n credentials)
These had literal keys in node settings or code. The keys are removed here, but they are still live in n8n and were visible to anything that could read these workflows:
- `[Analytics - LinkedIn]` All Campaigns, All time, Last 10/30/60/120 days (HeyReach key)
- `Zbuyer Caller` (Synthflow bearer token)
- `Fanbasis Payment Failed`, `Fanbasis Transaction Successful`
- `Dots Withdraw Fee for Xero`
- `[2.2 POSTCALL] Onboarding Pt1`, `[2.3 POSTCALL] Onboarding Form Complete`
- `[INBOX MANAGER] Receive Replies + Handwrytten Direct Mail`
- `[Inbox Placement Tests] Check Results`, `Instantly Inbox Placement Test Delete Campaigns and Upload Results`
- Possible (in setup notes, may be placeholders): `Dulcy - SignWell Airtable Agreements`, `Dulcy - SignWell Contract Events`

Recommended (Alex decides): move these into n8n credentials and rotate the keys.

### 5. Every workflow shows `active: true` and was updated between 16:30 and 16:44 UTC today
That includes `[INACTIVE REPAIR COPY ...]` and `My workflow 11`. It looks like a bulk change (for example, enabling connector access), not 158 real edits. UNKNOWN what changed or whether all 158 are really switched on.

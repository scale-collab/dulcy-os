# Campaign Center map: what it does today (for the lead-engine rebuild)

Riley, read-only, 2026-11-18. Sources: repo snapshots dated 2026-11-17 (n8n, Make, Airtable automations, schema, `campaign-center/source.tsx`), plus a read-only live n8n check on 2026-11-18. The live node counts match the repo for all 12 campaign workflows (for example Output Builder 65/65, Top Up 34/34, Coordinator 39/39). All 29 live "Campaign Center" workflows were last saved on 2026-11-17 between 16:39 and 16:44 UTC. Nothing was changed.
"Inferred" means it comes from reading the code, not from a run. `UNKNOWN` means there was no evidence.

---
## 1. Button / stage value -> Airtable automation -> n8n/Make -> resulting stage

| # | Screen action (source.tsx function) | Field the screen writes | Airtable automation (trigger) | n8n workflow | Stage after success / failure |
|---|---|---|---|---|---|
| 1 | New campaign (`createCampaign`) | creates a Campaign record and a Lead List record, then calls Sync | none | sync relay (Cloudflare worker) and the sender-sync webhook | Campaign Status Draft, Workflow Stage Strategy Draft |
| 2 | Move to Client Review (`moveWorkflow`) | Workflow Stage = Client Review; Client Review Submitted At; Auto-Approve At = +48 weekday hours | Send Campaign for Client Approval `wflMznciieYULkvic` (Submitted At updated) | none | Campaign Status = Waiting for Approval; Slack message and email go to the client |
| 3 | (no click) 48 business hours with no client feedback | none | none | Auto-Approve Client Review `ycmdunLvpxt2SJWufXWaj` (runs hourly) | Workflow Stage = Approved; Approval Source = "Auto-approved after 48 business hours"; Review copy copied into the sequence fields |
| 4 | Approve and prepare sequence (`approveAndPrepareSequence`; internal exception needs a confirm box) | Version-1 sequence fields filled from Review copy; Stage = Approved; Approval Source | none | none | Approved |
| 5 | Refresh from approved copy (`prepareSequenceFromReview`) | Campaign Subject/Body Version N fields; variant counts | none | none | no stage change |
| 6 | Generate spintax (`generateValidatedSpintax`) | create_spintax = true; Stage = Spintax in Progress; Campaign Automation Request {kind: spintax} | Generate AI Spintax `wflHT7Ot1zGeNB68y` (create_spintax = true) | Spintax and Spam QA `KqkYFOs5AZ1RM3G-F1AWu` | Pass: Status Spintax Generated, Stage Build Ready, Processing Completed. Hold: Processing Needs review, Stage Internal Review, Status Emails Generated. Error: Processing Failed, same Stage and Status |
| 7 | Upload to EmailBison (`requestBisonUpload` -> `triggerBisonUpload`) | if both lead types exist: creates or repairs two child records "- Generic Emails" and "- Direct Emails" and splits the senders; then Trigger Automation = true, random start 08:xx and end 18:xx, Stage Build Ready, Automation Request {kind: upload} | Create Emailbsion Campaign `wflzn9ZhWk3HXzoEW` (record updated in view `viwILydMklJJvuYE9`, watching Trigger Automation) | Split Direct + Generic Controller `RVqeMy8nHj0IJhzrXV7fz` -> HTTP call -> EmailBison Output Builder `4VK2fq5Ijrzcaa0Wp3n7i` | ID, Direct or Generic Campaign ID and Bison URL are saved; Processing Completed ("Manual launch required"). Campaign Status stays Spintax Generated |
| 8 | Launch / Pause / Delete (`requestBisonAction`; parent records fan out to the children) | Bison Action is cleared, then after 500 ms set to Launch, Pause or Delete; Automation Request | Campaign Center - EmailBison Actions `wflDrAPfz9aO96fBX` (Bison Action not empty) | EmailBison Actions `cZtV7nPH2rZhwpDWgR_ak` | Launch: Campaign Status Active. Pause: Inactive. Delete: the EmailBison campaign and the Airtable record are both deleted |
| 9 | Update campaign senders (`updateCampaignSenders`) | Sender Update State JSON {Requested} | none (the screen calls the webhook directly) | Update EmailBison Senders `SndrUpdateMain26A` | Sender Update State = Completed or Failed; the campaign resumes only if it was running before |
| 10 | Top up: Create lead list (`createTopUpBuild`) | new Lead List with Top-up Build Scope JSON; Campaign Top-up Lead List link | Lead List Center (not mapped here) | Lead List Center stages | the list must reach Ready and QA Passed |
| 11 | Top up: Use existing completed top-up | Top-up Upload Receipt JSON on the Lead List; Top-up Lead List and Base URL on every family record | none (the screen calls a "prepare" webhook directly) | **owner of the prepare endpoint is UNKNOWN**: no live workflow name matches, and the search for "top-up" and "Prepare" returned only Content OS | receipt state "prepared" |
| 12 | Top up campaign (`requestCampaignTopUp`) | Top-up Request = true, Top-up Status = Requested, counts set to 0, receipt state "requested" | none (direct webhook) | Top Up Existing EmailBison Campaign `S2_1UX8GnAKPiYvWqj74s` -> subflows Update Senders and Coordinate Replenishment Cycles `JXPiiC2XLCvxCRqzEKk_0` | Top-up Status Completed or Failed, with Added, Skipped and Failed counts; Replenishment Cycle ID and Starting Queue set |
| 13 | (formula) Replenishment Alert Ready = 1 | none | Notification - Campaign Progress Over 60% `wflJaQViGNu7KJ5SB` | Coordinator (claim/complete) -> Campaign Over 60% `foSoGQ1odW0puayH617Yp` | Task "Replenishment alert - <name>", then a "60% review" task; Slack alert |
| 14 | Sync button | none | Daily Total Campaign Data (button twin) `wflXrystmBYwyEslG` | Sync Sender Accounts `dZXXFKkn-ggXAz8VXMxtw` | campaign numbers refreshed |
| 15 | (EmailBison event) campaign failed | none | none | Campaign Fail -> Task -> Restart `vCnhCZxbgXdlpzvhs03gD` | Task created **and the campaign is resumed automatically** |
| 16 | (formula) Bounce Rate >= 2.5 and Progress >= 35% | none | Notification - Campaign Bounced over 2.5% `wflmHtwUAATQiBhM0` | none (an Airtable script calls EmailBison pause) | 2.5% or more: Slack and Task. 4% or more: EmailBison pause, Slack and Task (Airtable status is not changed) |

Make: none of the 79 scenarios is part of this pipeline. Related scenarios are off or deprecated: "Notifications - Campaign over 60% (deprecaited)" `3737581`, Analytics - EmailBison `3721254`/`3776410`, Campaign Benchmark Analysis `4388262`. Only the two LinkedIn/HeyReach scenarios (`3737469`, `3764307`) are on, and they sit outside the email build.

---
## 2. Stages

### A. Draft and approval
- **Inputs:** Campaign record (thesis, Review copy for Email 1-4, variant counts), Client, Lead List.
- **Steps:** Submitting for review stamps Submitted At and Auto-Approve At (+48 weekday hours, counted hour by hour, skipping Saturday and Sunday). `wflMznciieYULkvic` claims a send in the Client Review Notification State ledger (`fldD8UHFW69VTr1y6`) with a claim token, re-reads the record to confirm it, sets Status Waiting for Approval, posts Slack to the client channel, builds an audience summary, emails the client contacts (table `tbl8VWzIsWJYJfLUA`) and records completion after each send. It does nothing if Client Approval Exception is ticked or the stage is no longer Client Review. The hourly n8n job starts a missing timer or auto-approves once the timer has passed, but only when Client's Feedback and Select Changes are empty.
- **External calls:** Slack, Airtable email. No cost.
- **Idempotency:** good. One send per `recordId:submittedAt` key. A second attempt fails loudly instead of sending twice.
- **Breaks / notes:** auto-approval by silence copies **unspun** Review copy into `Campaign Subject 2 Version 1` and `Campaign Subject 3 Version 1`. Section 6 (#7) explains why that matters. Auto-approval with no human click is a business rule for Alex to confirm.

### B. Spintax and spam QA (`KqkYFOs5AZ1RM3G-F1AWu`, 52 nodes)
- **Inputs:** only the Review fields `Subject Line Email N (Review)` and `Script Copy Email N (Review)`, plus `Number of variants - Step N` (1-10). It does **not** read the Sequence-tab fields.
- **Steps:**
  1. Check the input. With no copy it stops with "No approved Email 1-4 review copy".
  2. Save Processing Running and Stage Spintax in Progress.
  3. A GPT agent writes the spintax and a second agent validates it (`gpt-5.6-luna`, structured output).
  4. Code checks: approved numbers stay outside spintax; merge tags match the approved copy exactly; at most 4 options per group; no empty, duplicate or nested groups.
  5. Each variant is sent to EmailGuard through a Cloudflare relay. It passes only if `ok`, `isSpam === false` and the spintax is valid.
  6. If it fails: repair agent, then validate agent, then recheck. Up to **6 checks and 5 repairs** per variant. After that it is marked needs_review (fail-closed).
  7. Final write: if every variant passed, the Subject/Body fields are saved and the stages above are set. Otherwise the record goes to Needs review.
- **External calls:** OpenAI. 2 calls per campaign plus up to 10 per variant. EmailGuard: up to 6 per variant. A campaign can have up to 4 steps x 10 variants = 40 variants, so the worst case is 240 EmailGuard checks and 402 LLM calls. Credit and token cost per call is UNKNOWN. The spam threshold lives in the relay worker (not in the repo), so it is UNKNOWN.
- **Retries and timeouts:** EmailGuard 20 s timeout. Every node sends errors to the failure branch (`continueErrorOutput`), which writes Processing Failed with an execution link. No automatic rerun.
- **Where it breaks:** 7 of the 10 builder alerts, all on 2026-08-25 within one hour: 3x "score remained above 1 after two AI repair cycles", plus "Step 2 expected 1 variants but received only 0", "No approved Email 1-4 review copy", and "Cannot read properties of undefined (reading 'error')". The code now allows 5 repair cycles, not 2, so the gate has changed since those alerts.
- **Data-loss bug (inferred from code):** `Build Airtable Sequence Update` writes steps 2 and 3 only to `Campaign Email 2/3 Subject` and `Campaign Body 2/3 Version 1`. Every extra variant on steps 2 and 3 overwrites the one before it, so only the last survives. Steps 1 and 4 save all variants.

### C. Build the campaign in EmailBison (Split `RVqeMy8nHj0IJhzrXV7fz` -> Output Builder `4VK2fq5Ijrzcaa0Wp3n7i`)
- **Inputs:** the Airtable script POSTs **every Campaign field and every linked Client field**, including the client's EmailBison API key, plus Lead List details.
- **Split controller:** sets Processing Running and reads the Lead List. It decides Direct or Generic from the name suffix, or from the Final Direct/Final Generic counts. It refuses an unsuffixed record that has both types, a record with an existing ID, and too many senders (cap = ceil(leads / days between / Sender Daily Limit, default 15)). It forces LinkedIn off, then POSTs to the builder webhook.
- **Builder steps, in order:**
  1. Capture the run and save Running with Run ID.
  2. Check the input (Normalize). It needs a valid recordId, Name and API key. The `ID` field must be empty unless forceCreate is set, and Status must be Spintax Generated. It builds up to 4 steps x 10 variants. For generic outputs it strips "Hi {FIRST_NAME}," greetings. It appends a signature and a P.S. (both spintaxed; see the rules in section 3).
  3. Lead-list readiness: 1-100 linked lists, each with Stage = Ready and QA = Passed, and no running or failed automation.
  4. `POST /api/campaigns` {name, type} -> `POST /api/campaigns/{id}/schedule` -> `PATCH /api/campaigns/{id}/update` (settings).
  5. `POST /api/campaigns/v1.1/{id}/sequence-steps` (primary step for each step) -> `GET` the same steps -> `POST` variants with `variant_from_step_id`.
  6. Leads (stage D) -> senders (stage F).
  7. Save `ID`, Direct or Generic Campaign ID and Bison URL to Airtable. The HeyReach branch is skipped (section 4).
  8. Save Completed only if the Run ID still matches and no newer request exists. Otherwise it writes nothing.
- **Timeouts:** EmailBison calls 30 s, but 120 s for the CSV upload and sender attach. Code nodes are limited to 300 s.
- **Retries:** none on EmailBison writes (deliberate, to avoid duplicates). Airtable reads and writes retry 3 times, 1 s apart.
- **Idempotency:** only the "ID is empty" guard, and **the ID is saved after leads and senders** (section 6, #1).
- **Where it breaks:** alert 800020 (2026-09-14) "Request failed with status code 422 [line 24]". The response body was not captured, so the cause is UNKNOWN.

### D. Upload leads (Direct/Generic)
- **Source:** Google Sheets API, tab `Final Direct` or `Final Generic`, range `A:ZZ`. The `CSV Attachment` and `EmailBison Lead List ID` that the Airtable script sends are ignored or broken (section 4).
- **Steps:**
  1. Parse the rows. Rows without an email are dropped. An empty first_name becomes company, or "Team".
  2. Strip legal suffixes (LLC, Inc, etc.) from company names.
  3. Drop 20 denied columns (seniority, country, revenue range, etc.). If the approved copy uses one of them, the build stops.
  4. Add 4 attribution columns (Verification Provider, Email Type, Verification Path, `DULCY_VERIFICATION_<campaignId>`).
  5. Split into chunks of **5,000** rows.
  6. Ensure custom variables: read all pages (at most 1,000) and create the missing ones (the code re-reads after a race).
  7. Map at most **30** columns (first name, last name and email are required). `POST /api/leads/bulk/csv` once per chunk, with a 120 s timeout.
  8. Wait min(15, 3 + ceil(rows / 5000)) minutes, using the **first chunk's** row count. `POST /attach-lead-list`, then a second wait (amount not set in the snapshot, so the n8n default applies; actual value UNKNOWN).
  9. `GET /campaigns/{id}/leads` and require a total of at least 1.
- **Weak check:** it does not compare the total with the expected row count. Duplicate emails inside the sheet are not removed by the builder (the top-up does reject them).

### E. Sequence and settings (the defaults matter for the rebuild)
- Schedule: Mon-Fri on, Sat/Sun off, 09:00-17:00, America/New_York, save_as_template false. The upload click overwrites start/end with a random 08:00-08:59 and 18:00-18:59, and the Airtable script randomizes them a second time.
- Settings: max_emails_per_day 1000, max_new_leads_per_day 1000, plain_text false, open_tracking false, reputation_building false, **can_unsubscribe false**, unsubscribe_text empty.
- Days Between Emails: default **2** in the builder but **1** in the Split controller and the screen. Wait is at least 1 day on every step, including the last. Thread reply (steps 2-4) reuses the step-1 subject without "Re:".

### F. Sender allocation
- **Screen:** recommended maximum = max(outputs, ceil(verified leads / days between / median daily limit of the workspace's accounts, default 15)). Upload is blocked above that, or below 1 sender per non-empty output. Split share: Direct = round(total x direct / (direct + generic)), at least 1 and at most total - 1; Generic gets the rest.
- **Builder:** reads the selected Email Accounts (`tblMSOBJ0wMgxSg4l`). Every one must resolve to a unique numeric `Email ID`. It computes an advisory capacity of floor(verified leads / first delay) but does not enforce it. `POST /attach-sender-emails`, then reads `/sender-emails` page by page (at most 100 pages) and requires an **exact** match with the Airtable selection and every sender `connected`. That check retries 5 times, 5 s apart.
- **Changing senders later** (`SndrUpdateMain26A`, 1,800 s timeout):
  - Takes a Postgres lock (`dulcy_sender_updates.locks`/`requests`).
  - Pauses the campaign if it is running (up to 10 checks, 2 s apart), attaches new senders (up to 20), removes old ones only once it is confirmed paused, and checks for an exact match (up to 30). Resumes only if the campaign was running (up to 10).
  - Writes Sender Update State JSON. An error trigger re-pauses the campaign and holds the lock for a human.
  - Accepts 1-1000 senders. Airtable calls are paced 1 s apart.
- **Hourly sync back to Airtable** (`dZXXFKkn`): campaigns with ID > 0 and Status Active. It fetches **only page 1** of senders, then throws if `last_page` > 1 (section 6, #10).

### G. Launch / Pause / Delete (`cZtV7nPH2rZhwpDWgR_ak`)
- **Steps:**
  - Check the input. The action must be Launch, Pause or Delete, and an ID is required except for Delete.
  - Delete: `DELETE /api/campaigns/{id}` (when an ID exists), then the Airtable record is deleted. The screen asks the user to type DELETE first.
  - Pause: `PATCH /pause`, then Status Inactive.
  - Launch: lead-list readiness check again, then `PATCH /resume`, then Status Active and a Campaign Action Result JSON.
- **Approval:** no code checks Alex's approval. A click is enough. Nothing writes "Launch Ready" or "Live".
- **Trigger:** the Airtable trigger only fires when Bison Action goes from empty to set, so the screen clears it first and waits 500 ms. n8n never clears it.
- **Other paths that also launch or pause:** `vCnhCZxbgXdlpzvhs03gD` resumes a failed campaign automatically. The Airtable bounce automation pauses at 4% or more.

### H. Top-up / replenishment (`S2_1UX8GnAKPiYvWqj74s` + Coordinator `JXPiiC2XLCvxCRqzEKk_0`)
- **When the screen offers it:** progress >= 60%, bounce < 3%, emails per positive reply <= 250, at least 10 interested replies, booking rate >= 20%, emails per meeting <= 1,000, and positive rate at least 0.6x the agency average. Otherwise a ticked "KPI exception" box is required.
- **Preparation:** the screen POSTs to the prepare endpoint (owner UNKNOWN) and needs back a receipt with a 64-hex revisionHash and contentHash, an uploadId, a future expiresAt and base URL send.dulcy.io.
- **Run, in order:**
  1. Normalize: 1-2 targets, family of at most 3, readiness lists at most 100, base URL must be `https://send.dulcy.io`. It also contains a hard-coded recovery for one list (section 4).
  2. Update Senders subflow, top-up check: the campaign status allows it and every attached sender is connected. No sender change.
  3. Read lead-list readiness and the campaign family, then a readiness and QA gate (16,382-character code node).
  4. Download both Final tabs, then "Bind exact source": hashes must match, and it refuses if any earlier import with this source's name prefix exists.
  5. Postgres `managed_topup_upload_v1('claim')`.
  6. Prepare CSV (13,900 characters): reads the campaign total, ensures custom variables, at most 30 columns, generic first_name = company, rejects duplicate or invalid emails.
  7. Postgres `begin_branch` -> `POST /api/leads/bulk/csv` (list name `[topup:<list>:<hash12>] <type> <name>`) -> capture the import ID -> Postgres `record_import`.
  8. Wait min(15, 3 + ceil(rows / 5000)) minutes -> `POST /attach-lead-list` -> wait 1 minute.
  9. Confirm: `GET /api/lead-lists/{id}` must be Processed with processed = accepted rows; then campaign growth must be at least 0 and no more than succeeded. Added = growth; skipped = succeeded - growth.
  10. Postgres `finish` -> write the receipt to the Lead List -> save the Top-up fields -> build checkpoints -> Coordinator `checkpoint` (under a Postgres mutex it sets Replenishment Cycle ID `bison:<campaign>:import:<import>`, Starting Queue and Receipt) -> verify.
- **Locks and idempotency:** a Postgres ledger per uploadId. The coordinator mutex `replenishment:v2:campaign:<rec>` allows up to 120 waits and has a 7,200 s execution timeout. By design, a failure after a successful import says "reconcile only, never rerun".
- **Gaps:** the n8n code does not check the results of `begin_branch` and `record_import`; it relies on the DB function raising an error. The DB function source is not in the repo (UNKNOWN).
- **Where it breaks:**
  - 1170963 (2026-11-03): "Task execution timed out after 300 seconds" in `Prepare Top-up CSV`.
  - 1289121 (2026-11-13): "original import/attachment stage reported failure for existing import 758" at `Verify Atomic Replenishment Checkpoints`. That text only appears when an earlier step already set `r.error`, so the real failure was upstream (import not Processed in time, failed rows, or the attach). Which one is UNKNOWN.
  - The hard-coded recovery records that generic import 725 failed all **3,160** rows with "First name is a required field" on 2026-11-03.

### I. 60% alert
- **Trigger:** the formula `Replenishment Alert Ready` = 1 when cycle progress >= 0.6 and the claim does not equal the current cycle. Cycle progress uses `Progress` before any top-up, and 1 - Total Leads Remaining / Starting Queue after one. If remaining goes **up**, progress is blank (treated as a counter correction).
- **Steps:**
  - `wflJaQViGNu7KJ5SB` asks the coordinator for a claim (header-auth webhook), up to 3 attempts while it reports busy.
  - The coordinator creates a Task (Blocked, High, Intake, Automation Key `<rec>|progress_60[|cycle]`) and returns the alert text. Airtable posts it to Slack.
  - On `complete`, the coordinator moves the Task to Not Started and calls Campaign Over 60%.
  - Campaign Over 60% calls OpenAI Responses `gpt-5.4` (reasoning low, max_output_tokens 10,000, 300 s timeout, 1 citation retry) on up to 1,500 replies, then commits the review and forecast under the lock.
- **Cost:** OpenAI tokens plus web search per review. UNKNOWN.

### J. Analytics sync
- **Daily Total Campaign Data:** Airtable cron Mon-Fri 06:00 (time zone UNKNOWN), plus a button twin with identical code. It uses one master EmailBison key and calls `switch-workspace` for each **Active** workspace. It includes active campaigns, plus paused or completed ones from the last 30 days. It writes Emails Sent, Total Leads, Contacted, **Total Leads Remaining**, Unique Replies, Bounced, Interested, Progress and Updated At. It **creates** a Campaign record for any EmailBison ID it does not know.
- **Fetch Campaign Data Auto:** Mon-Fri 21:00. An older copy that uses the v1.1 switch, reads **every** workspace, only `status=active`, and does not write Remaining.
- **Sync Sequence Analytics** (hourly): upserts `tblmHKxDLELPkj5xk` on "Sequence Metric Key" and fails closed on partial attribution. Its filter uses Campaign Status 'Paused', which is not a choice (paused campaigns are 'Inactive'), so paused campaigns are never synced.

---
## 3. Business rules in code to keep (or have Alex confirm)
- **Gate order:** Approved -> Spintax Generated (all variants passed EmailGuard) -> lead list Ready + QA Passed -> build. Launch repeats the readiness check.
- **Approval:** a human click; an internal exception needs a confirm box; auto-approval after **48 weekday hours** of silence (Alex to confirm).
- **Copy:** 4 steps; 1-10 variants per step; at most 4 options per spintax group; numbers fixed outside spintax; merge tags identical; generic copy has no {FIRST_NAME}.
  - Variation targets (reported only, not enforced): 3/4/5/6 groups at <50/50/100/150 words, and 18 combinations under 50 words or 32 at 50+.
- **Auto-added text:** a signature (`--`, a spintax sign-off, {SENDER_FULL_NAME}, title and company) and the P.S. "or tell me to pound sand if you'd like.." are added **after** client approval, unless the copy already has them or the flags are off (both default on).
  - RULES says "no manual signature". Whether this auto text is allowed is UNKNOWN; question for Scribe and Alex.
- **Spam:** EmailGuard is fail-closed, with 5 AI repairs then a human.
- **Leads:** 5,000 rows per CSV; 30 mapped columns at most; first, last and email required; 20 denied columns; first-name fallback to company or "Team"; legal suffixes stripped; an attribution variable per campaign.
- **Import wait:** min(15, 3 + ceil(rows / 5000)) minutes.
- **Senders:**
  - Selection cap = ceil(leads / days between / daily limit); default daily limit 15.
  - At least 1 sender per non-empty output; Direct/Generic split by lead share.
  - The attached set must equal the selection exactly, and every sender must be connected.
  - Sender updates: pause -> swap -> verify -> resume only if the campaign was running.
- **Names:** "<name> - Generic Emails" and "<name> - Direct Emails"; HeyReach names at most 50 characters.
- **Top-up:**
  - Offered at 60% or more, bounce under 3%, 250 or fewer emails per positive reply, 10 or more interested replies, booking 20% or more, 1,000 or fewer emails per meeting, relative performance 0.6 or more.
  - Duplicates are left to EmailBison; never re-upload; reconcile a single import.
  - **RULES says a top-up needs interested rate > 15% of replies. That check is not in the code.**
- **60% alert:** threshold 0.6, once per cycle; a top-up starts a new cycle.
- **Bounce** (Airtable `wflmHtwUAATQiBhM0`): fires only if Bounce Rate >= 2.5 **and Progress >= 35%**; at 4% or more it pauses.
  - RULES has no 35% floor (section 6, #6).
- **Other alerts:** interested rate under 10% after 1,500 emails or more; reply rate 1% or less at 35% progress or more.
- **KPI panel:** "Early read" under 2,000 emails sent; interested-rate bands at 5/10/15/20%.
- **Defaults:** schedule and settings in stage E; days between = 2 in the builder, 1 in the screen and Split (needs one value).

---
## 4. Dead or duplicate paths
1. **Create EmailBison + HeyReach Campaigns** `IrtDsUmx88sVAp1daCzWH`: a local snapshot only, not among the 158 live workflows. Alert 731147 (2026-08-27) came from it.
2. **Builder HeyReach branch** (about 17 nodes, including `Start HeyReach Campaign`): unreachable through Split, which forces LinkedIn off. It is reachable only by calling the builder webhook directly, which has no auth, and it would **start** a LinkedIn campaign. Two Dulcy record IDs are hard-coded to skip it.
3. **Builder "Has Lead List ID?" (true) and "Has Lead List CSV?" (false):** both go straight to `Resolve Sender Email IDs`, which expects Email Account rows and would throw "Not every selected Airtable sender account was returned" (inferred). leadListCsvUrl is always set from the Sheet, so the CSV-attachment path is dead.
4. **`Consolidate Attached Lead Lists`** (builder) and **`Send a message`** Slack (Fail -> Restart) are not connected to anything.
5. **Hard-coded one-off recovery** in Top Up `Normalize Request`: execution 1172710, imports 724 and 725, campaigns 601 and 602, a 2-hour window after 2026-11-03T14:29:10Z, so expired. `TOP_UP_RESERVATION_FAMILIES` is also hard-coded in source.tsx.
6. **Two analytics writers** (Daily Total at 06:00 and Fetch Campaign Data Auto at 21:00) write the same Campaign fields with different rules. The Daily Total button automation is an exact copy of the cron one.
7. **Two duplicate-campaign paths:** the Airtable "Duplicate Campaign" `wflXE1z331MHZfz2J` (copies 34 fields including Campaign Status, misses step-4 variant count) and the screen's own clone.
8. **Stage values never written by automation:** Workflow Stage "Launch Ready" and "Live"; Campaign Status "Uploaded" (although an error message mentions it).
9. **Undeployed:** Generate AI Scripts `wflJNWsJJF8Uzm9C3`, AI Script Creator - Bridge `wflSMoEu3MAcy7t41`.
10. **Double work:** start/end times randomized twice (screen and Airtable script). "Capture run / Save Running" is done in both Split and Builder. The Generate AI Spintax clean-up branch runs right after the webhook POST, before QA finishes, so it rarely fires.
11. **Bounce task de-duplication does nothing:** the lookup uses `Open Automation Key`, but the created tasks never set `Automation Key`.

---
## 5. Data contracts
**Airtable base `appxqINt5XKw7a76A`, Campaigns `tblAVAA6uBPaMj28P` (307 fields).** Key fields, with choices where they apply:
- Name `fldSsb4QjS9UyvKhj`; Client `fldl5bZ644djPsBmN`; Thesis `fldlixHfhzrd7nuSc`; Lead List `fld5weZ6ED31dBlaz`; Email Accounts `fldi906rwZ9YOpU64`.
- Campaign Status `fldZABZwE9SmnwMv3`: Draft, Active, Inactive, Emails Generated, Spintax Generated, Uploaded, Completed, Waiting for Approval.
- Workflow Stage `fldOVJmlGWxW1dveo`: Strategy Draft, Internal Review, Client Review, Changes Requested, Approved, Spintax in Progress, Build Ready, Launch Ready, Live.
- Processing Status `fldCebt3IMI8ZxdQq`: Running, Completed, Failed, Needs review. Also Workflow Message `flduYPLoUQk94uUWA`, Workflow Error `fld1ZYViMpvLDoBy2`, Run ID `fldCsuOWg1BVV2rAz`, Started At `fldqKPdzUqppbItvX`, Completed At `fldzjGuki2WoS1LBY`, Campaign Automation Request `fldKZKnaFMiAHrDEE`.
- Bison Action `fld7n4KEnvaPMDbt2`: Launch, Pause, Delete. Trigger Automation `fldtLN2riGj4DNoOp`; create_spintax `fldsvgKf6U5zDOygf`.
- EmailBison: ID `fldxSETE3D66RyWRH`; EmailBison Direct Campaign ID `fldpwHUDMMDeXORek`; Generic Campaign ID `fld6h6ZPDeu2cgdTe`; Bison URL `fldkCJDOFglvhcvD6`; EmailBison Base URL `fld0DL0enVj3G1fUJ`; EmailBison API (from Client) `fldlb6cfn7cGkgsB0`.
- Top-up: Top-up Lead List `fld4lMlTPjrRmAFHp`, Request `fldOU7mRKMTG5hGjM`, Status `fldhUPV4f4pqvv047` (Ready, Requested, Running, Completed, Failed), Added `fldj24jsClYDgjNyG`, Skipped `fldBz14RRsy2PDUhp`, Failed `fldEosJWzT7I73inC`, Last Run `fldFfVuUx0ZMCaJXX`, Message `fldfSoL1aatKQs722`.
- Replenishment: Cycle ID `fld26pRUJr0Qtm8A9`, Starting Queue `fldhrJzioBLjyj6lp`, Receipt `fldGYAxQt6gYGhnWK`, Checkpoint Error `fldPyeaLIO7Gd0dUO`, Alert Claim `fldYDHEXtbUhitqwm`, Alert Delivery `fldogzhFAf5TRZ1Rl`, Cycle Progress (formula) `fldTEKcBFAh2fROun`, Alert Ready (formula) `fldH5UcuiSXZ57hD5`.
- Metrics: Progress `fldGM1f8fNNu6ODo2`, Total Leads Remaining `fld9zg5aC7o1rbg4o`, Total Leads `fldbYOfqWk4KrNgfz`, Emails Sent `fldDmaS8NZF3j0ZBY`, Bounce Rate `fldiLOzbllDI8mn7C`, Reply rate `fldjZzJHEuIQoMUbb`, Interested rate `fldPx4lkp0XeXtamH`.
- Approval: Client Review Submitted At `fldTwdx8HHei9LeQp`, Auto-Approve At `fldC3vCiTcqhGaZrK`, Campaign Approval Source `fldgHA5CcgM885Itp`, Approval Decision `fldPEueEsGaqJRX5h`, Client Approval Exception `fld1vE0Exqlw7MMvq`, Client Review Notification State `fldD8UHFW69VTr1y6`. Also Sender Update State JSON `fldRS75BkIlqfMKrA` and Days Between Emails `fldbX8yCSVIhfJ6v7` (choices 1-5).
- Copy:
  - Review fields (read by QA): `Subject Line Email 1-4 (Review)` (`fldZTtdvwRV53voZE`, `fldAikx1V83MsK3Ql`, `fldu2xpTQFuuyU71Q`, `fldFrZUqdTeydSTUV`) and `Script Copy Email 1-4 (Review)`.
  - Final sequence fields (read by the builder): `Campaign Email 1 Subject Version 1` `fldy3ufjXKaj3kuyV`, `Campaign Subject 1 Version 2-10`, `Campaign Body N Version 1-10`, `Campaign Email 2/3/4 Subject`, `Campaign Email 4 Subject Version 2-5`.
  - The builder also accepts the legacy `Campaign Email N Subject/Body Spintax 1-10` and `Campaign Subject 2/3 Version N` names. The field-name aliasing is a contract risk.

**Lead Lists `tblVOg9BkPOMmnitt`:** Lead List Stage `fld8nrebRFL0O8kgj` (must be Ready), QA Status `fldUB4WsLi5kq6rUy` (Passed), Processing Status `fldf9wpMGWg0SebHV`, Final Generic Count `fld0FHomkh3uyx0FD`, Final Direct Count `fldQZJCpTofahmTkl`, Top-up Build Scope JSON `fldevysyehxsGxt2q`, Top-up Upload Receipt JSON `fld8MIk1KUeT6fDDu`, Project Google Sheet Link (with Final Direct and Final Generic tabs).
**Email Accounts `tblMSOBJ0wMgxSg4l`:** Email ID `fldR19WUqSSBVQcPO`, email_daily_limit `fldBP1gljUUM44JMk`.
**Tasks `tblRBxm2N53331mIm`:** Automation Key `fldkpzbiyqkVAtPEd`, Open Automation Key `fldhR089GMEsbDOm9` (formula).
**Workspace IDs `tblcjRBGJEWh5KgOt`:** ID (EmailBison team) and EmailBison API `fld6bFQolVFg4Ub3N`.
**Sequence Analytics `tblmHKxDLELPkj5xk`.**
**Tables read by Over-60:** `tbljJ0uWryVMuilXn` (call feedback), `tbldiv2czPkJ1zeQE`, `tblX4NisPYHJkpZYW`.

**EmailBison objects created or changed (base URL `https://send.dulcy.io`):**
- campaign; schedule; settings; sequence steps (a primary per step plus variants linked to it).
- workspace-wide custom variables, including one `DULCY_VERIFICATION_<campaignId>` per campaign.
- lead lists from `bulk/csv`, named "<campaign> Leads[ - Part i of n]" or "[topup:…]"; the lead-list-to-campaign link; sender-email attachments and removals.
- campaign pause, resume and delete.
- read only: workspace switch, campaign stats, sender-emails, lead-lists.

**Postgres:** `dulcy_sender_updates.requests` and `.locks` (sender-update and replenishment mutexes); `original_batch_api.managed_topup_upload_v1(op, json)` with ops claim, begin_branch, record_import and finish (function body not in the repo).

---
## 6. Top 10 reliability problems (evidence)
1. **The build is not idempotent.** The EmailBison campaign is created first, but the Airtable `ID` (the only duplicate guard) is saved only after leads and senders succeed (builder node order; Normalize reads only `body.ID`). Any failure in between (422 in alert 800020, "no leads were verified", sender mismatch) leaves an orphan campaign, and a retry creates a second one. There is no lookup in EmailBison by name or Run ID before creating.
2. **Heavy work inside n8n code nodes with a 300 s limit.** Top-up CSV prep timed out (1170963, 2026-11-03). Other large in-memory code: Bind Exact Source 19,817 characters, Require Ready 16,382, Prepare CSV 13,900, Builder Normalize 17,824, Coordinator planner 27,436 (copied 3 times).
3. **Fixed waits instead of polling the import status.** The builder waits min(15, 3 + ceil(rows / 5000)) minutes using only the first chunk's rows, then accepts any lead total of 1 or more. The top-up waits the same plus 1 minute, then fails if the import is not "Processed" or the counts do not reconcile. This is the likely upstream cause of 1289121 (inferred). The real cause is not retained.
4. **Failures can leave stuck states.** If a run dies before its final write, Processing Status stays Running or Top-up Status stays Requested. The error workflow set on 11 campaign workflows (`NtpwlzuP2tuJM6OC5U_m9`) is not in the 158-workflow snapshot, and the live n8n check returns "Workflow not found". It may only be out of the access scope; its status-writeback behaviour is UNKNOWN.
5. **Open webhooks that build, launch, delete and spend.** The Builder, Split, Spintax QA (OpenAI and EmailGuard spend), Actions (Launch/Delete, including deleting the Airtable record), Top Up, Sender update, Sender sync and Fail -> Restart webhooks have no auth (n8n index). Only the Coordinator and Over-60 use header auth. The Airtable scripts send the client's EmailBison API key in the request body. `source.tsx` still contains unredacted n8n webhook paths (lines 60, 74, 82-83).
6. **The bounce safety net has gaps** (`wflmHtwUAATQiBhM0`):
   - It never runs below 35% progress.
   - It fires once, when a record first meets bounce >= 2.5. A campaign that first reaches 2.5-3.99% gets a warning, and when it later passes 4% there is no new trigger, so **no auto-pause** (inferred from how Airtable "matches conditions" triggers work).
   - The pause call's response is not checked, and Airtable status is not updated.
   - The task de-dupe key is never written.
7. **Copy integrity:**
   - QA saves only one variant for steps 2 and 3 (variants B and later are lost).
   - QA reads the Review fields, not the final sequence, so edits made in the Sequence tab are overwritten.
   - The builder's subject lookup prefers `Campaign Subject 2/3 Version 1` (written unspun by auto-approve) over `Campaign Email 2/3 Subject` (written by QA), so steps 2 and 3 could go out with stale or unspun subjects (inferred).
8. **Unapproved status changes:** Fail -> Task -> Restart resumes failed campaigns automatically. It also lists every campaign in the workspace and creates a task for each one with "failed" status. Launch has no "Alex approved" check in code. Both conflict with RULES "Launch only after Alex confirms".
9. **One shared master key with workspace switching:** Daily Total and Fetch Campaign Data Auto both call `switch-workspace` on one token and then read. Overlapping runs or other users of that token could read the wrong workspace (inferred). Unknown IDs create new Campaign records. Total Leads Remaining, which drives the 60% cycle, is refreshed only once a day (06:00 Mon-Fri).
10. **Brittle sync and hard-coding:**
    - Sender sync fetches page 1 only, then throws for any multi-page campaign, which stops the whole hourly run.
    - The analytics filter uses a status that does not exist ('Paused').
    - One-off record, import and campaign IDs are hard-coded (section 4, #5) and the base URL is pinned to send.dulcy.io in Top Up, Over-60 and Fail -> Restart.
    - The builder's EmailBison nodes do not keep the response body, so 422 errors cannot be explained (playbook rule 2).

---
## 7. Still UNKNOWN (check before the rebuild)
- Who serves the top-up "prepare" endpoint, and the body of the Postgres function `managed_topup_upload_v1`.
- The EmailGuard pass threshold (inside the Cloudflare relay) and the cost per check. OpenAI token cost per campaign.
- The n8n default wait used by `Wait for Campaign Lead Sync` and the Coordinator `Run wait`.
- Whether the error workflow `NtpwlzuP2tuJM6OC5U_m9` exists and what it writes.
- The time zone of the Airtable crons; the name and filter of view `viwILydMklJJvuYE9`.
- Recent execution history for each workflow (not pulled; an n8n execution read is needed).
- Business decisions for Alex: auto-approval after 48 business hours; the auto-added signature and P.S.; can_unsubscribe default false (Lex); which top-up KPI wins (code versus the 15% rule in RULES); the 35% floor on bounce alerts.

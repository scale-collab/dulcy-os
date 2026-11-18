# Lead Engine: plan (draft for Alex's approval)

Status: **APPROVED by Alex 2026-11-18.** Building step 1 (skeleton, dry-run only).
Research behind it: `engine/research/map-lead-list.md`, `engine/research/map-campaign.md`, `engine/research/lead-worker-review.md`.

## 1. Goal
Scrape leads → build lead lists → create and top up campaigns, **without the daily errors**. Airtable stays the screen; a small app on Alex's Hetzner server (the same server as `n8n.dulcy.io`, on a subdomain) does the work. n8n and Make keep the small jobs (alerts, syncs, Slack).

## 2. Why today breaks (from the maps)
- **Too big for n8n.** The Lead List workflows have 2,441 nodes. "Company and Contact Review" alone has 1,428, and about 74% of those can't be reached from any trigger. There are 1,084 code nodes with about 3.8 million characters of JavaScript, so steps hit n8n's 300-second limit (Top Up already did).
- **Retries are unsafe.** The campaign build creates the EmailBison campaign first but saves its ID last, so a retry makes a duplicate. Top-up waits a fixed time instead of checking whether the import finished.
- **Things get stuck.** One failed contact run blocks the shared contact queue for every list. Four polls have no time limit. Only 2 code paths ever mark a run Failed.
- **Hidden logic.** 27 hardcoded record IDs change behaviour for specific lists. The contact processor, the contact-decision workflow and the error workflow can't be read ("Workflow not found").
- **Settings that do nothing.** Exclude SEGs, the catch-all/role/free email policies and the verifier choice are never read. The 80% gate is shown on screen but not enforced.
- **No safety on paid calls.** About 100 webhooks have no auth, including ones that spend MillionVerifier, DiscoLike, LeadMagic and OpenAI credits.

## 3. What the engine is
One small service on the Hetzner server, for example `engine.dulcy.io` (name UNKNOWN; Alex picks).
- **Language:** TypeScript on Node. The n8n code and the old lead-worker are already JavaScript, so the rules port over directly.
- **Database:** Postgres on the same server (n8n already uses Postgres there). It holds jobs, steps, receipts and logs.
- **How Airtable talks to it:** a button in Airtable sends `{list or campaign ID, action}` to the engine, signed with a shared secret. The engine checks the request, queues a job and returns at once. Airtable shows the status.
- **How work runs:** a job is split into **steps**. Each step:
  - saves its result before moving on (a checkpoint);
  - can be retried on its own without repeating the steps before it;
  - for paid calls, saves a **receipt first**, so a repeat reuses the saved answer and never pays twice. A call with an unclear result is never auto-retried; it is marked "needs review" (this idea comes from the old lead-worker);
  - has a time limit, a retry limit and a clear error message.
- **Credit caps:** each job has a spend limit (per list and per day). Above it, the job stops and asks in Airtable/Slack. Provider balances are checked before big runs.
- **One job per record at a time,** with a lease that expires, so a crash never freezes the queue for everyone.
- **Keys live on the server only** (in an env file), never in Airtable fields or job data.
- **Logs and alerts:** every step is logged with timing and the provider's response body. Errors go to Slack with the list or campaign, the step and the reason. A small status page is added later.

## 4. Stages it will run (same order as today's screens)

**Lead List**
1. Generate filters / company sample (first 100), using DiscoLike.
2. Review: the code-based fit check drops obvious bad fits (with logged reasons); the 80% usable gate on the sample is enforced, not just displayed.
3. Expand companies (in batches; resumable).
4. Contact sample from the first 100 companies, then expand contacts (5 per company by default).
5. Apply manual contact decisions (Approve / Reject / Pending).
6. Verify: MillionVerifier first; catch-all is never Good; "check status" before any new paid job.
7. Enrichment prompt → enrichment run.
8. Automated QA → finalize.

**Campaign**

9. Copy and spintax QA, keeping **all** variants.
10. Build the EmailBison campaign: find-or-create first, and save the ID right after creating it.
11. Upload leads (direct and generic), then **poll the import until it's processed** and compare row counts.
12. Senders (after the final lead count is known), sequence and settings.
13. Launch: automatic when every launch check in section 7 passes.
14. Top-up and replenishment cycles (reconcile one failed import, never retry the whole top-up).

The business rules to keep (sample of 100, 80%/85% fit, tier scores, batch sizes, exclusion windows, QA fields and so on) are listed in the research maps, section 3. Each one becomes a small tested function. The 27 hardcoded record IDs become explicit per-list settings that Alex approves.

## 5. Build order (small steps; each one tested side by side before the old workflow is switched off)
| Step | What | Done when |
|---|---|---|
| 0 | Alex approves this plan and answers the decisions in section 7 | logged in `rules/` |
| 1 | Skeleton on Hetzner: service, Postgres tables, signed Airtable→engine calls, job queue, logs, Slack errors, credit caps. **Dry-run mode only** (no paid calls) | a test job runs end to end in dry-run |
| 2 | **Verify** stage (MillionVerifier): small, high-value, and the receipts/poll pattern proves itself here | matches the old 03 results on 2 real lists |
| 3 | **Campaign build and upload** (find-or-create, import polling) | builds 1 test campaign with no duplicates and correct lead counts |
| 4 | **Top-up** | 1 real top-up with zero re-uploads |
| 5 | Company sample → expand (DiscoLike) | matches old results on 1 list |
| 6 | Contacts (sample, expand, decisions) | matches on 1 list |
| 7 | Enrichment and QA | matches on 1 list |
| 8 | Slim the Airtable screens to buttons and status (faster loading) | screens load quickly |
| 9 | Switch off each old n8n workflow, one at a time | the old one has been off for 1 week with no issues |

Each step ships as its own small pull request. Paid calls are switched on per stage only after Alex's OK.

## 6. What's needed from Alex (later, not now)
- **Server access:** SSH to the Hetzner box for deploys, or a deploy script Alex runs. UNKNOWN which.
- **The subdomain name** and a DNS record.
- **API keys** put on the server (Alex adds them; they're never pasted in chat).
- **Code location:** a new `engine/` folder in this repo (one-repo idea), or the `dulcy-lead-worker` repo (reference only today). Recommended: `engine/` in this repo.

## 7. Decisions (Alex answered 2026-11-18; logged in rules/RULES.md)
1. **Fit check: code, no LLM.** The engine scores each company against the campaign thesis and client info (industries, size, geography, homepage keywords, exclusions, DiscoLike score) and drops only **obvious bad fits**. Maybes stay. Every drop is logged with its reason, so Alex can check it. This replaces the AI review of every contact.
2. **Bounce pause:** over 4% **and** 35%+ progress; re-checked on every refresh; 2.5% = watch.
3. **Auto-restart failed campaigns: keep.** Add time limits and alerts for runs that go long (18+ hour runs were seen; a likely cause is the expansion worker running one 30-minute batch at a time, up to about 20 hours for 100k companies, plus polls with no limit).
4. **Launch: automatic once every check passes** (Alex, 2026-11-18). Launch checks (all required):
   - the copy is approved by the client (or "Skip Approval" for Dulcy's own campaigns), with no spintax in the client-facing copy, and the EmailGuard spam check passes;
   - every claim in the copy is in the client's approved proof (`clients/<client>.md`);
   - the lead list is Ready: verification done, QA passed, catch-all not counted as Good;
   - EmailBison lead count = expected count, with variables filled and spintax rendered;
   - senders allocated against the final count (existing .info senders are allowed; the .info rule is about buying domains only); schedule, timezone, daily limits and days between emails set;
   - the client is active (not cancelled or paused) and the credit/spend caps are not exceeded.
   If any check fails, nothing launches; the record shows which check failed, and Slack gets an alert.
5. **Top-up:** interested 15%+ of replies is the main driver; bounce under 4% and reply rate 2%+ are targets; a higher bounce is flagged to watch, not an automatic fail.
6. **Days between emails:** default 2, editable per campaign.
7. **Missing workflows:** re-checked 2026-11-18. The connector sees 158 workflows, and the 3 IDs (`CodexContactProcessorDraft20261028`, `JWrteAxXQ1PIII4IelGoX`, `NtpwlzuP2tuJM6OC5U_m9`) return "Workflow not found". UNKNOWN whether they were deleted or are just hidden from the connector. The contact rules will be rebuilt from the 2026-10-30 checkpoint notes and the old lead-worker code if they can't be found.

## 8. Not in scope (stays where it is)
Alerts, analytics syncs, Slack bots, Content OS, the Reply Agent, the sales process in Make, and about 120 small n8n workflows. Security fixes for the old webhooks are parked until the engine replaces them.

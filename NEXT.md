# Where we are (update this at the end of every session)

Last updated: 2026-11-17 (live pull from n8n and Airtable)

## Done
- Repo is the memory: CLAUDE.md, rules/RULES.md, rules/decisions-log.md, five skills, SOPs, client index, channel evidence, pricing.
- 15 n8n workflow snapshots (local, not verified live) with plain-English maps.
- Build-error playbook from the 10 recent alerts: `rules/build-error-playbook.md`.
- One "dulcy-os" account skill proposed to Alex (needs his save click).
- Live n8n export: all 158 workflows, cleaned: `automations/n8n-live-2026-11-17/` (replaces the old snapshots).
- Airtable: schema of 53 tables, 50 interface pages, the 4 custom screens' code, and all 51 automations with scripts: `airtable/`.
- Make.com: all 79 scenarios (28 on) in `automations/make-2026-11-17/`. 2 errors in 30 days. The sales process (Calendly → Close → Airtable → Slack) runs in Make.
- Found: Lead List "stage 01/02" = `Company and Contact Review - Adaptive Refinement` + `Company Expansion Worker`. The lock sub-workflow `JXPiiC2XLCvxCRqzEKk_0` = `[Campaign Center] Coordinate Replenishment Cycles`.

## Still missing from ChatGPT / Alex
- Josh's inbox process (how he works replies day to day)
- Reply Agent settings values (schema and code are saved; the settings records were not read)
- Client goals and approved price ranges: see each file in `clients/` (many still UNKNOWN)

## URGENT (found 2026-11-17 while building client files; Alex decides)
- Lead Flo asked in Slack today to cancel effective today and refund $375 plus the last payment. Not answered.
- Bounce over 4% on campaigns still marked Active: Dulcy (2), Twenty West Internal (6 of 8), MJJ (3 of 4), Marketing Cartel (all 5). The rule is to pause and investigate. Atlas checks live EmailBison first: the Airtable status may be stale.
- Marketing Cartel Email 1 P.S. lines may contain unverified proof claims ("doubled enrollments", rehab admissions). Check whether they're live.
- Scroll Stop GDPR erasure request (2026-11-17), plus the appointment-audit list they requested.
- Human Marketing: an SMS "stop calling" reply; confirm suppression.
- Lead Flo Event Rental campaign targets all of the USA; the client wants Southern California only.

## To verify / Alex decides
- Make Booked Meeting: Calendly lead source can arrive in quotes (`"Google"`) and break the Airtable step; the scenario stopped on 2026-11-12. Fix = clean the value. Also: answers are read by position (fragile).
- Make: failed runs are not kept for retry (incomplete executions off on all 28 active). Fix = turn on for the sales scenarios.
- Make reply webhook queue 650/667 full, its scenario off. One of 34 EmailBison client workspaces probably still sends replies to Make. Check each workspace's webhooks.
- Webhooks: checked 2026-11-17. ~100 of 106 webhook workflows have no auth (only 4 use header auth, 2 check a secret in code). Lead List 03-06, Inbox Manager and Reply Agent intakes are open to anyone with the URL. Fix = add header auth. Alex decides.
- Hardcoded keys still live: 13 n8n workflows plus 6 Airtable scripts have API keys typed in (EmailBison, HeyReach, Synthflow, Fanbasis and others). Fix = move them to credentials or secrets and rotate. Alex decides. List: `automations/n8n-live-2026-11-17/README.md` and `airtable/automations/INDEX.md`.
- Where the over-4% bounce auto-pause runs: not found in Airtable automations or by search in n8n. UNKNOWN.
- All 158 n8n workflows show active and updated 16:30-16:44 UTC today. UNKNOWN what changed.

## Parked (low priority)
- EmailGuard in the Claude desktop app: config is in place, but the `emailguard-mcp` program is not installed on Alex's Mac. The install steps are on app.emailguard.io/integrations/emailguard-mcp (login needed). Not needed for cloud sessions; EmailGuard already works there. Parked 2026-11-17.

## Agent build (one at a time, Alex approves each)
- [x] All 13 built 2026-11-17: Ada (main session) + 12 sub-agents in `.claude/agents/`, skills in `skills/`.
- [x] Closers.io library fully read (198 lessons) → Cole (+ Pixel ads, Harper hiring, Ledger finance pointers). Sean has Dulcy reply history (6 months), creator methods and Drive SOPs. Pixel/Lex/Ledger/Harper expanded from Alex's zip.
- [ ] Still UNKNOWN: Josh's daily routine and approvals (Sean), Sienna cadence and Reddit format, the 7FSA course beyond 5 docs (Cole).
- [x] Reply conflicts answered by Alex 2026-11-17 (see RULES). Still open: mock-call interviews yes/no (Harper).
- [ ] Alex reviews each agent and corrects it.

## ▶ Pick up here (engine live test, paused 2026-11-18 night)
Test campaign **648** ("ENGINE TEST - do not launch - Manufacturing Direct", Dulcy workspace) is built except senders: sequence done, 226 leads uploaded and verified. Never launched.
Why it stopped: the 2 senders taken from Airtable (alexander@usedulcy.com, alexander@withdulcy.com; Email IDs 6498/6500) are **not in EmailBison anymore**. EmailBison called the IDs invalid, and the address lookup found neither. Airtable's Email Accounts table still lists removed inboxes (data fix for Riley).
Tomorrow, on the server (`cd /opt/dulcy-os/engine/deploy`):
1. `bash deploy.sh` (gets the clearer sender error + totals).
2. `docker compose exec engine node dist/src/cli.js senders dulcy | tail -20` → pick 2 lines that say `connected`.
3. Put those 2 addresses in `tests/engine-test-build.json` → `senderEmails` (Claude can do it from the pasted list), then
   `docker compose exec -T engine node dist/src/cli.js campaign < tests/engine-test-build.json` and `... cli.js job <id>`.
   It reuses campaign 648 and its leads; only the senders step runs.
4. When it succeeds: step 3 is proven live. Delete campaign 648 in EmailBison if not wanted (needs Alex).
Still open: rotate the MillionVerifier key (it was pasted in chat on 2026-11-18).

**Built overnight 2026-11-18 (code + tests only, nothing live):** step 4 top-up (`campaign.topup`, see engine/README). Not yet run against the real EmailBison.

## Main project (Alex, 2026-11-17): reliable lead engine
Goal: scrape leads → build lead lists → create campaigns, without daily errors. Built as a small app on the Hetzner server (subdomain), with Airtable as the screen. Move the Lead List Center and Campaign Center core out of n8n one stage at a time. `dulcy-lead-worker` is reference only.
- **Plan approved 2026-11-18** (`engine/PLAN.md`); all 7 decisions answered. Step 1 (skeleton, dry-run) **done 2026-11-18**: `engine/`, 11/11 tests pass. **Deployed 2026-11-18** on the Hetzner server (`/opt/dulcy-os`, read-only GitHub deploy key "hetzner"), health OK, dry-run on, `127.0.0.1:8090`. **Live at https://engine.dulcy.io** (Coolify Traefik, HTTPS; unsigned requests get 401). Server note: disk 81% full (~7 GB free), restart pending (not done, would interrupt n8n). Step 2a **Verify stage built 2026-11-18** (shadow mode, 26/26 tests): same MillionVerifier rules as old 03, upload once per list, automatic status checks, strict results, nothing written to Airtable yet. Sheet reader built (read-only service account, domain-wide delegation as scale@dulcy.io; 34/34 tests). MillionVerifier key + 100k caps are on the server. Google service account set up 2026-11-18 (org policy override for key creation on project dulcy-engine only; domain-wide delegation, Sheets read-only). **Side-by-side test 1 PASSED 2026-11-18**: UK SMEs `rec57bNGAIVQJDwPD` matched the old workflow exactly (327 good / 218 risky / 59 bad / 43 final direct / 284 final generic, 604 emails). **Test 2 PASSED on the final lists 2026-11-18**: Jonathan New England `rec7kI6F11bEHwBvC` (6,074 emails) matched good 3,185 / bad 1,032 / final direct 1,925 / final generic 1,260 exactly. One known, deliberate difference: 2 emails with an identity conflict (one email shared by two people, or one person with two emails) are held for review by the engine instead of being verified; the old workflow verified them and they came back Risky (risky 1,857 old vs 1,855 engine). Neither reached the final lists either way. **Step 2 (Verify) is proven in shadow mode.** **Step 3 (campaign build) code done 2026-11-18** (`campaign.build`, 51/51 tests with fake EmailBison): find-or-create with name reconcile, import checks until Processed with exact counts, lead count vs Airtable before creating, sender cap + exact match, never launches. Alex approved ONE live test build in Dulcy's workspace (2026-11-18): `engine/deploy/tests/engine-test-build.json` (340 leads, never launched). Steps: add `EMAILBISON_KEY_DULCY`, dry-run, then `LIVE_STAGES=campaign.build`, live run. UNKNOWN to confirm live: the campaign and lead-list list endpoints (`GET /api/campaigns`, `GET /api/lead-lists`) used for name lookups. Lists: UK SMEs `rec57bNGAIVQJDwPD` (old: 327 good / 218 risky / 59 bad) and Jonathan New England `rec7kI6F11bEHwBvC` (old: 3,185 / 1,857 / 1,032). Then write-back.

## Next work, in order (Alex decides)
1. Finish the foundation as the missing items arrive.
2. Top Up fix: reconcile-one-import action, then move CSV prep out of n8n.
3. Logging of full response bodies on EmailBison/HeyReach calls.
4. Build the 60%-alert "next campaign" flow (review brief -> Scout/Scribe -> managed Airtable stages -> stop for Alex's approval).
5. Move heavy Airtable script logic into small server code.

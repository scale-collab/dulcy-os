# Where we are (update this at the end of every session)

Last updated: 2026-11-25 evening

## Done 2026-11-25 (live on the server)
- **Inbox replier (Sean):** every per-client Reply Agent setting honoured (send modes, confidence, max automatic, always-review types, OOO, nudge, office hours); out-of-office / not-interested first replies only where the client turns them on. All 8 clients still Approval Required.
- **Dulcy HQ (hq.dulcy.io):** Today, Decisions (reply edit + send), To-do, Team, Chat, reports; redesign, Dulcy logo, Dulcy purple. Slack still on (SLACK_REPORTS / SLACK_DECISIONS) until Alex trusts HQ.
- **Content (Sienna):** ideas Friday 7 AM for both channels (main 4, Raw 8) from web research, prospect questions and Agency Ignition (Discord bot reads 38 channels; quiet server); scripts/hooks/titles/thumbnail idea/Gamma outline within 30 min of approval; editing style guide + GPT brief; scheduled "Sienna: video editor" every 2 h 8 AM-8 PM (check → fix → reject → Needs Review; never posts).
- **LeadMagic:** parallel single Email Finder calls (bulk ran ~19 rows/min; ticket T-1619 sent to the team).

## Next (proposed order)
1. Watch the first live campaign plans (GMG, Twenty West) through approvals; part 3 (spintax → inboxes → build → launch) has never run live.
2. Check Sienna's first editor runs (first 2026-11-25 4:39 PM ET) and tune the rules from what Alex approves/rejects.
3. Content steps left: repurposing pack in Alex's voice (X, LinkedIn, Reddit, blog/newsletter); proof of posting (Published/Failed + URL; 17 old "Scheduled" items unconfirmed); real thumbnails + Gamma docs on approval; folder → Frame.io auto upload.
4. HQ Step 2: Clients screen (replaces the wrong Clients & LTV), then Step 3 work areas (Campaigns with Activity log, one Inbox, Sales, Content), Step 4 Josh login + client portal. Then switch Slack reports/decisions off.
5. Riley known issues: content webhooks without auth, duplicate teleprompter workflow, ~100 n8n webhooks without auth, keys in n8n/Airtable scripts.
6. Friday 2026-11-27: compare the GPT vs Claude creator watch, then switch the GPT task off. Saturday: first account-health check.
- Open with Alex: Lead Flo LinkedIn password + 2FA change (found in old SOPs); copy of the 32 deleted Dulcy campaigns if he has it; Outbound Funnel Math re-record (with GPT, then Sienna).


## Daily Run page (built 2026-11-25)
- Project Management interface → **Daily Run** (page pag4oy80YbYDAOj4C, custom element blk5lFNbkRRBFd7gF; Riley can rebuild from `airtable/custom-elements/daily-run/README.md`).
- Step 1: pick a pile (Replies · Campaigns · Fixes · Money · Other) or "Do them all"; one card at a time; Approve / Reject / Skip (keys A/R/S); progress bar. Approve = same as ✅ in Slack (Status Approved; Sean replies also press Approve Draft on the Emails row so the engine sends once).
- Step 2: "Start my day": Tasks table one at a time (overdue → due today → in progress, then priority); Start (timer) / Pause / Complete / Skip. Modelled on James Higgins's "Single Action" feed (call 2026-10-22).

## Dulcy HQ: our own app (Alex, 2026-11-25, vision; start in the background, keep it simple)
One private place instead of many Airtable interfaces, Slack DMs, bots and tools. Airtable stays the database behind it.
1. **Today:** decisions to swipe (per person: Alex, Josh…), to-do list ranked Eisenhower-style (urgent/important; stale "done" tasks cleared), Ada's brief, talk to Ada (and any agent) with chat history, agent reports.
2. **Clients:** one screen with every client's results (email now; LinkedIn, AI caller, direct mail later), health, notes for today. Replaces Clients & LTV (wrong: shows 3 active), Email Campaigns, inbox/domain/warm-up/placement dashboards.
3. **Work areas:** Campaigns, one Inbox (replaces 6+ reply pages), Sales (contracts, agreements: same flow, better screens), Content (OpusClip etc.).
4. **People + permissions:** Josh sees only his part (no keys, no money). Later: the client portal in the same app (send.dulcy.io is EmailBison's white-label, separate login: check later).
- Clean-up alongside: old/redundant n8n, Make and Airtable automations; unused pages (Client Offers, Internal Lead Requests…).

## Project ideas (Alex, 2026-11-25, later)
- **Own CRM** (move off Close?): not needed now; James built his in Lovable + Railway.
- **Client portal, vibe-coded**: the free portal plan was taken away and now costs money; rebuild it ourselves (Lovable/Softr-free stack TBD).

## Next up (Alex, 2026-11-25)
1. Switch on and check Atlas, Cole (needs FATHOM_API_KEY) and Sienna (morning list in `reports/morning-2026-11-25.md`).
2. Then, in the terminal together: **campaign creation**, **inbox management** (Sean AI replier improvements, pinned earlier), and the **Content Center**.

## Now (2026-11-24)
- **End-to-end done from the Airtable pages** on "[Dulcy Free Campaigns] new end to end testttt" (pet e-com): Generate filters → first 100 → Expand (2,011 companies, 1,957 usable) → contacts (1,518) → Verify (1,127 Good: 850 direct + 277 generic) → Skip enrichment → QA Passed (Ready) → spintax (n8n) → Build Campaign → EmailBison drafts **654** (Generic, 277) and **655** (Direct, 850), 1 inbox each, **not launched**. Launch/Pause was tested on 2026-11-23 (campaign 653).
- **Alex decides:** launch or delete drafts 654/655 (they carry sample copy).
- **Built today (engine):** Generate filters for every niche (500-company pull, labels only at 60%+, sub-industry alone, soft 3,000-lead goal, auto-widen size first); business model + example sites only when they fit; Expand switches to MAX_COVERAGE when BALANCED runs out; live line-by-line progress (Expand, Contacts, Verify); Lead List Stage follows the steps; contacts = DiscoLike Contacts Run only; ALL CAPS company names fixed at build; Build stops on empty copy variables; QA still needs the copy (Alex's correction).
- **Server (2026-11-24):** updates installed + reboot, disk 74.5% (n8n keeps 7 days of runs now), keys for phone + PC (via GitHub keys).
- **Next / open:** 1) Real search-depth check in Generate filters: built 2026-11-24. 2) Fallbacks: already built 2026-11-21 (each variable's FALLBACK section in the enrichment prompt; the engine fills blanks/Not Found); enrichment now reports found vs fallback per variable. 3) Auto-tidy finished lists (keeps the engine DB small). 4) Switch the main pages to the engine versions. 5) Bounce check live (needs the server setting names). 6) n8n memory cap 6144 → 3072 and Hetzner backups (Alex, optional). 7) Old n8n lead tables (~3 GB, used until 2026-11-21): keep 2-4 weeks, then export and remove; maybe import the ~300k old email checks into the engine.
- **PINNED (Alex 2026-11-25): Sean AI replier improvements — come back after the account health loop + activity log are done.**
- **Sean LIVE (2026-11-24 evening):** drafts every 10 min onto the Emails rows (Reply Queue) + Slack (channel C0B581HNSMR); one engine sender for all clients (REPLY_SENDER=on); old n8n replier (6 workflows) switched off by Alex; 249 old OpenAI drafts cleared (State Skipped). First run: 8 drafts (3 ready to approve, 5 need Alex's input).
  - **Follow-ups built (2026-11-24):** Sean drafts due follow-ups (Slack ✅ / Approve). To switch on: FIX=followup-arm-off in n8n, then SEAN_FOLLOWUPS=on in the server .env, deploy.
  - Next: add Human Action / Custom Reply / Sean fields to the Reply Queue page; Calendly selectable in the calendar button (service already supports it; needs a Calendly OAuth app); GoHighLevel + HubSpot providers in services/dulcy-calendar (code on branch calendar-import); Google OAuth app out of test mode.
- **Backlog from Alex (2026-11-24), in his words, to plan with the agents:**
  - Agents (Riley, Atlas, Sean…) as real triggered agents, not just skills: Decisions loop (Slack ✅/❌ + Airtable log) first.
  - n8n audit: list every workflow, what is active, what moves to the engine; tag each "engine", "n8n only" or "n8n + engine".
  - Analytics: daily 3 AM stats sync is fine; check it. Inbox placement tests often fail: check. Bounce counts in Airtable are too low vs EmailBison: investigate. Verifier breakdown stats (share of replies by MillionVerifier / LeadMagic / DiscoLike): check whether still active.
  - Google Sheet shared with the client at approval: set to Commenter automatically.
  - Store city, state, zip, country and full address on every lead (for LinkedIn, direct mail and callers later).
  - Project management table: agents create/update tasks as they work, with the agent (Claude) as owner and status moving with the workflow.
  - HeyReach: test once Alex reactivates it.
  - Content center (Sienna): plan with Alex.
  - LeadMagic slow bulk (19 rows/min): support says bulk jobs have their own queue limits and the priority call does nothing; they ask Alex to message them in-app (signed in) quoting ticket T-1619. Engine option: run single Email Finder calls in parallel (300/min limit) instead of bulk.
- **To do later:** header auth on the n8n sync-bison-senders webhook; EmailGuard + claims-vs-proof are not automatic launch checks yet; missing company names should be filled from the company list automatically.

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

## ▶ Pick up here (engine, 2026-11-20 night)
**Live on the engine:** Airtable buttons (Generate filters, sample, expand, refit, find contacts, verify, Build Campaign). Proven live on Med Spas: full list + Generic/Direct drafts 651/652 (not launched). Generate filters live test running on `recHKbyinpOdWgjW9` ([Dulcy] B2B Marketing Agencies, 1-50 Empl, USA (Engine)); next: 100-company sample, then stop for Alex's review.
**Next builds, in order:** DiscoGen deep review + ContraGen (rule: below the people-per-company target, not only empty companies), LeadMagic fallback (needs `LEADMAGIC_API_KEY` in the server .env), enrichment, automated QA.
**Alex:** delete the unused "ContraGen" option in Lead Lists > Contact Source (Airtable tools can't remove options).
**Riley (handed off 2026-11-20, Alex OK):** (1) paste the n8n filter-step fix, `automations/n8n-patches/filtergen-client-fields.md` (stops the whole client record, incl. API key fields, going to OpenAI); Riley's tools are read-only, so whoever opens the n8n editor pastes it; (2) the one-off spintax failure at line 72 (execution 1405070).

## Earlier (engine, 2026-11-18 afternoon)
**Step 3 (campaign build) is PROVEN LIVE.** Job 12 built test campaign **649** ("ENGINE TEST 2 - do not launch - Manufacturing Direct", Dulcy workspace 2): 3 emails (2 days apart, follow-ups threaded), 226 leads uploaded, 52 added, 174 skipped by EmailBison (already in sequence in other Dulcy campaigns; the engine never forces parallel sending), 2 senders attached and connected, draft, not launched. Checked directly in EmailBison.
Earlier test campaign 648 had landed in client workspace 80 (Brilliant Jewelers) before the per-call workspace switch existed. Cleaned up with Alex's OK (226 test leads, 1 variable, campaign queued for deletion; lead list 776 removed by hand).
Campaign 649 stays as a draft unless Alex wants it deleted.
Still open: rotate the MillionVerifier key (pasted in chat 2026-11-18). Delete lead list 776 in workspace 80 by hand if not done.
**WHOLE PIPELINE PROVEN LIVE (2026-11-20):** companies → contacts → verify → campaign. Campaign 650 (Dulcy workspace) built with 951 verified leads + 10 Dulcy CI senders, draft, waiting for Alex to review and launch. Next to build: ContraGen fallback for companies with no contacts (76% had none), Airtable buttons + write-back (so runs start from Airtable, not the server command line), bounce check report-only run.
**Lead lists company stage PROVEN LIVE (2026-11-18):** sample → expand → refit on the Dulcy Manufacturing plan (recSampleTest0001): 1,067 companies, Tier 1 97 / Tier 2 964 / Cut 6 (99% usable), one batch, sheet https://docs.google.com/spreadsheets/d/19Yw3MgY6CBLzYZxRzW2_HlJf4TWymO7PdN_M-2Z_p1A. Fit = ONE AI call per list (OpenAI gpt-5.6-luna) → list profile → code checks every company. Next: 4,000 run (Alex's ladder 100 → 1k → 4k → 10k), then the contacts stage.
Earlier: **Lead lists step 5a (company sample) PROVEN LIVE** (job 15): Dulcy Manufacturing plan, 100 companies, 94% usable, Passed (old: 98.3%). 6 dropped with reasons. Next: 5b expand companies (batches with DiscoLike's rolling exclusion list) → needs Google Sheets WRITE access (or keep lists in the engine DB), then contacts.
Other options: bounce check report-only run (`cli.js bounce dulcy`, needs `EMAILBISON_TEAM_DULCY=2` in the server .env), the DiscoLike company stage (needs a DiscoLike key on the server), or Airtable wiring and write-back (needs an Airtable token).

**Built overnight 2026-11-18 (code + tests only, nothing live; 72/72 tests):**
- Step 4 **top-up** (`campaign.topup`): Alex's KPI rule first (interested 15%+ of replies; bounce/reply/progress are watch flags), connected senders, count vs Airtable, same upload checks as the build, added vs skipped measured once the total settles.
- **Bounce check** (`bounce.check`): pause over 4% at 35%+ progress, watch over 2.5%, re-checked every run, pause confirmed, Slack summary. Report-only until `LIVE_STAGES` includes `bounce.check`; optional timer `BOUNCE_CHECK_EVERY_MIN`.
- Step 5 groundwork, **fit check as code** (`engine/src/leadlist/fit.ts`): drops only obvious bad fits with a reason (exclusion lists, excluded words/industries, known size/country outside range, directories/marketplaces/staffing/etc. unless targeted, residential vs commercial-only), keeps maybes, sample gate Passed ≥80% / Needs Review ≥70%, contact-country exclusion by the person's country.
- **Next to build:** the company sample → expand stage on DiscoLike using this fit check (needs the DiscoLike API calls from the old workflow and a DiscoLike key on the server), then contacts, enrichment, QA. Then wire Airtable buttons and write-back (needs an Airtable token).

## Main project (Alex, 2026-11-17): reliable lead engine
Goal: scrape leads → build lead lists → create campaigns, without daily errors. Built as a small app on the Hetzner server (subdomain), with Airtable as the screen. Move the Lead List Center and Campaign Center core out of n8n one stage at a time. `dulcy-lead-worker` is reference only.
- **Plan approved 2026-11-18** (`engine/PLAN.md`); all 7 decisions answered. Step 1 (skeleton, dry-run) **done 2026-11-18**: `engine/`, 11/11 tests pass. **Deployed 2026-11-18** on the Hetzner server (`/opt/dulcy-os`, read-only GitHub deploy key "hetzner"), health OK, dry-run on, `127.0.0.1:8090`. **Live at https://engine.dulcy.io** (Coolify Traefik, HTTPS; unsigned requests get 401). Server note: disk 81% full (~7 GB free), restart pending (not done, would interrupt n8n). Step 2a **Verify stage built 2026-11-18** (shadow mode, 26/26 tests): same MillionVerifier rules as old 03, upload once per list, automatic status checks, strict results, nothing written to Airtable yet. Sheet reader built (read-only service account, domain-wide delegation as scale@dulcy.io; 34/34 tests). MillionVerifier key + 100k caps are on the server. Google service account set up 2026-11-18 (org policy override for key creation on project dulcy-engine only; domain-wide delegation, Sheets read-only). **Side-by-side test 1 PASSED 2026-11-18**: UK SMEs `rec57bNGAIVQJDwPD` matched the old workflow exactly (327 good / 218 risky / 59 bad / 43 final direct / 284 final generic, 604 emails). **Test 2 PASSED on the final lists 2026-11-18**: Jonathan New England `rec7kI6F11bEHwBvC` (6,074 emails) matched good 3,185 / bad 1,032 / final direct 1,925 / final generic 1,260 exactly. One known, deliberate difference: 2 emails with an identity conflict (one email shared by two people, or one person with two emails) are held for review by the engine instead of being verified; the old workflow verified them and they came back Risky (risky 1,857 old vs 1,855 engine). Neither reached the final lists either way. **Step 2 (Verify) is proven in shadow mode.** **Step 3 (campaign build) code done 2026-11-18** (`campaign.build`, 51/51 tests with fake EmailBison): find-or-create with name reconcile, import checks until Processed with exact counts, lead count vs Airtable before creating, sender cap + exact match, never launches. Alex approved ONE live test build in Dulcy's workspace (2026-11-18): `engine/deploy/tests/engine-test-build.json` (340 leads, never launched). Steps: add `EMAILBISON_KEY_DULCY`, dry-run, then `LIVE_STAGES=campaign.build`, live run. UNKNOWN to confirm live: the campaign and lead-list list endpoints (`GET /api/campaigns`, `GET /api/lead-lists`) used for name lookups. Lists: UK SMEs `rec57bNGAIVQJDwPD` (old: 327 good / 218 risky / 59 bad) and Jonathan New England `rec7kI6F11bEHwBvC` (old: 3,185 / 1,857 / 1,032). Then write-back.

## Next work, in order (Alex decides)
1. Finish the foundation as the missing items arrive.
2. Top Up fix: reconcile-one-import action, then move CSV prep out of n8n.
3. Logging of full response bodies on EmailBison/HeyReach calls.
4. Build the 60%-alert "next campaign" flow (review brief -> Scout/Scribe -> managed Airtable stages -> stop for Alex's approval).
5. Move heavy Airtable script logic into small server code.

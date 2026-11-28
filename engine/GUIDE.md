# Lead Engine: User Guide

How the Dulcy lead engine works from start to finish, in plain words.
**Keep this file current:** every engine change updates this guide in the same pull request (rule 2026-11-23).
Technical details for developers are in `README.md`.

Last updated: 2026-11-28 (HQ Content parity: the whole Content Center in HQ, settings and add idea included; before: Content round 5)

---

## 1. What the engine is

The engine builds lead lists and campaigns. It replaces the old n8n list workflows.

- It runs on our Hetzner server (`/opt/dulcy-os`).
- You drive it from **Airtable**: pick an action in the **Engine Action** field on a Lead List record (or press its button on the Engine page). The engine checks Airtable every 30 seconds, picks up the action, and runs it.
- It writes progress back to Airtable: **Engine Status** and **Engine Message**.
- Contacts and final leads go into the list's **Google Sheet** (tabs: Engine Companies, Contacts, Contacts (Cut), Final Direct, Final Generic, QA Review).
- It **never launches or sends** a campaign by itself. Launch is a separate button in the Campaign Center (section 2b) and runs every launch check first.

---

## 2. The steps, in order

| # | Engine Action | What it does | Paid? | What you check |
|---|---|---|---|---|
| 0 | **Generate Filters** | Reads the list's ICP and client context and writes DiscoLike search filters (the old n8n "Generate filters"), checks the plan is big enough for the lead goal and widens it by itself if not. See section 2a. | Small (500 DiscoLike records = about $1, + 1 AI call; the size checks are free) | The filters and the size line in the message look right |
| 1 | **Run Company Sample** | Pulls up to 100 companies with the filters and checks each one for fit. Shows how many companies match in total. | Yes (up to 100 companies) | Sample quality, then tick the sample approval box |
| 2 | **Expand Companies** | Grows the approved sample to the **Expansion Target** (number of usable companies). Never pulls the same company twice. | Yes (per company) | Usable count, shortfall if DiscoLike runs out |
| 2b | **Deep Review Companies** (optional, automatic) | DiscoGen web review of each company against your deep-review prompt. Fails are cut. **Runs by itself** after the sample (first 100) and after each expand (the rest) when "Use DiscoGen Deep Review" is ticked and a prompt is written; there is no separate button. | Yes | AI Company Review tab |
| 3 | **Find Contacts** | Finds people at the Tier 1/2 companies (see section 3 for the options). Before the contact sample is approved it searches 100 companies; after, all the rest. | Yes | Usable %, then tick contact approval |
| 3b | **Deep Review Contacts** (optional) | DiscoGen persona review of each contact. Only a clear "yes" stays. | Yes | Contact Review tab |
| 4 | **Verify and Finalize** | Checks emails with MillionVerifier (and LeadMagic for risky ones when "Use LeadMagic" is on), then writes **Final Direct** and **Final Generic**. Never checks the same email twice. Jobs in MillionVerifier and LeadMagic are named after the lead list (list name + a short code). | Yes (per new email) | Good / risky / bad, final lead count |
| 5 | **Prepare Enrichment Prompt** / **Run Enrichment** (optional), or **Skip Enrichment** | Turns your plain-English "Custom Variables Requested" into a DiscoGen prompt, then fills those columns (e.g. city, niche). Blanks get a short phrase that fits the email copy. | Yes (Skip: free) | The new columns in the Final tabs. **Skip Enrichment** moves a verified list straight to QA (e.g. Dulcy's own lists) |
| 6 | **Run Automated QA** | Structural checks on the final rows (company, email, first name, verification, copy variables). Passed = Lead List Stage "Ready". | Free | QA Review tab |
| 7 | **Build Campaign** | Builds the EmailBison campaign as a draft: leads, copy, senders, schedule. **Never launches.** | Free | The draft in EmailBison |

**Refit Companies** (any time, free): re-checks every saved company with the current profile, e.g. after you change the thesis. (Not on the Lead List Center screen.)

**Check TAM** (any time, free): the TAM Finder on Source & ICP. Counts how many companies match the saved filters (DiscoLike's free count); the engine answers within about 30 seconds. Market size only, not a lead count.

**Restart Companies** (Company Review, free): start the company list over. The engine first backs up every company, contact and review of the list, then clears them and the sheet tabs, and resets the approvals, counts, verify and QA. Next step: run the first 100 companies again (free if the filters did not change). Emails already checked by MillionVerifier are never paid for again.

**Build Campaign** belongs to the Campaign Center, not the Lead List Center (Alex, 2026-11-23).

### 2a. What Generate Filters does (one press, every niche)

It works the same way for pet e-com, roofers, med spas, manufacturers, jewelry, software, agencies, DTC brands and anything else. Nothing in it is a hard lock: it never fails because a list is small.

1. **Looks at 500 lookalike companies.** One paid DiscoLike search (500 companies, about $1) using only your targeting sentence, example domains if the list has any, country/state, employee range, business model (only when the sentence says B2B) and "no lead-gen sites". The 50 most similar go to the AI keyword review (as before).
2. **Industry labels only when they fit.** For every DiscoLike industry and sub-industry label, the engine counts how many of the 500 companies carry it (a label counts when DiscoLike scores it 0.5 or more).
   - **60% or more** of the companies: the label is used as a filter.
   - Several labels at 60%+: they are **either/or** (a company needs any one of them, never all).
   - **A sub-industry at 60%+ is used on its own** (with its parent industry, which DiscoLike narrows to it). Other industries at 60%+ are **held back**: whole industries come in completely (any-of), e.g. med spas: Medspa 97% + Consumer services 79% gave 402,000 (every salon) instead of the med spas. Held-back industries are the first widening step if the list is too small (live test, 2026-11-24).
   - **Business model and example sites follow the same rule** (live pet e-com test, 2026-11-24): a business model is used only if 60%+ of the companies have it (an explicit "B2B" in the sentence always stays); example sites come only from companies that carry a label that passed, and none are added when no label passed. The list's own example sites are always kept. Before this, the 5 most similar companies were added blindly (five pet shops for a pet e-com brand list) and B2B came in from the top-2 models.
   - **None at 60%:** no industry filter at all. The lookalike text, examples and keywords do the targeting.
   - The message shows the numbers, e.g. "Labels used (either/or): E-COMMERCE 90%. Skipped (under 60%): PET_PRODUCTS_BRAND 40%."
   - This replaces the 2026-11-23 "ecom adds E-COMMERCE" rule: E-commerce is used when the companies really are e-commerce (60%+), and skipped otherwise.
3. **Size goal (soft).** The **lead goal** is:
   - with a linked campaign: all its inboxes' daily limits added up x 14 days / 3 email steps (every linked campaign counts, also a Generic/Direct split; each inbox once; an inbox with no daily limit counts 15). Example: 7 inboxes x 15 = 105 a day -> 490 leads.
   - no campaign (or no inboxes yet): **3,000 leads**.
   - Companies needed = lead goal / 0.4 (about 0.4 final leads per company). 3,000 leads -> ~7,500 companies.
   - DiscoLike's free count is an upper bound; **real = about 60%** of it (Alex: 50-70%).
3b. **Real search depth** (Alex, 2026-11-24). The free count cannot use the targeting text, so it can overstate a lot (pet e-com: 23,065 counted, the search only reached ~2,000). When the count looks big enough, the engine checks how deep the real search goes (as far as Expand can: MAX_COVERAGE) with about 8 one-company test searches (a few cents), and uses the smaller number. The message then says e.g. "Free count 23,065, but the real search only reaches ~2,000 companies → expect ~2,000 real". Searches deeper than 10,000 (the API limit for this check) show "10,000+" and the count decides. Auto-widen uses the same check, so a niche like this widens when it is really short.
4. **Auto-widen when too small.** If the expected real companies are fewer than needed, the engine widens **one step at a time**, re-counts (free) and stops as soon as it is enough:
   1. widen the employee range one DiscoLike step on each side (e.g. 11-200 -> 1-500): this keeps the niche (jewelry test: 2,969 -> 20,646),
   2. drop the sub-industry labels (the held-back whole industries come in instead),
   3. drop the industry labels,
   4. drop the business model,
   5. keep only the top half of the homepage keywords.
   - **Country and state are never widened** (geography is the client's choice).
   - At most 5 extra free counts. If it is still short, the widest version is saved and the message says so. You can still run the sample.
5. **The message** starts with the result, e.g. "Goal 3,000 leads (default) → needs ~7,500 companies. Free count 18,400 → expect ~11,040 real. Big enough: no widening needed. Labels used (either/or): ... Skipped (under 60%): ...". The same numbers are in the job result (`sizing`, `labels`).
6. **Dry run** spends nothing: no DiscoLike search, no AI call, no count. It shows what it would pull and the goal.

Unchanged: employee ranges snap to DiscoLike's size steps, "between X and Y" works, exclusions in the sentence, the Airtable fields written.

Settings (server .env, optional): `FILTER_ANALYSIS_COMPANIES` (500, max 1000), `DEFAULT_LEAD_GOAL` (3000), `LEADS_PER_COMPANY` (0.4), `COUNT_YIELD` (0.6).

**Sample fit (Run Company Sample):** 80%+ usable = Passed, 70%+ = Needs Review, under 70% = Failed. These labels are a **warning, never a lock**: a low sample says "Below 80% fit (warning): review before approving". Expand needs only the approval tick, and nothing on the engine blocks Expand or Find Contacts because of the sample status.

### 2b. Campaign Center (Campaigns table)

Tick **Runs on Engine** on the campaign, then pick an **Engine Action** (or press its button). The engine answers in **Engine Status** and **Engine Message** on the same campaign, like a lead list. A campaign split into "- Direct Emails" and "- Generic Emails" parts is handled as one: the button works on both parts.

| Engine Action | What it does | Changes EmailBison? | What you check |
|---|---|---|---|
| **Build Campaign** | The same build as on the lead list (the campaign must link exactly one lead list). Drafts only, **never launches**. | Creates drafts | The draft(s) in EmailBison |
| **Launch Campaign** | Pressing it is your go-ahead (no "are you sure" box). The engine first runs every launch check below. **If any check fails, nothing launches** and Engine Message says which one failed (Slack gets an alert). If all pass, it starts each part and checks EmailBison shows it running. Then Workflow Stage = Live and Campaign Status = Active. A part that is already running is left as is ("already live"). | Yes | Engine Message lists every check as PASS or FAIL |
| **Pause Campaign** | Pauses right away and checks it is paused. A part that is already paused, a draft or completed is left as is. Never restarts anything. | Yes | Engine Message |
| **Update Senders** | Makes the campaign's inboxes in EmailBison match its **Email Accounts**: adds the missing ones, removes the extra ones. EmailBison only allows this on a paused campaign, so a running one is paused, changed and started again. An inbox that is not connected is a **warning only**. | Yes | The inbox count in Engine Message |
| **Top Up Campaign** | Adds the **Top-up Lead List** (Ready, QA Passed) to the running campaign: Final Direct leads to the Direct part, Final Generic to the Generic part. Only when the top-up rule passes: **interested 15%+ of replies** (the main driver). Reply rate under 2%, bounce of 4% or more and progress under 60% are shown to watch, they don't block. Never uploads the same list twice. | Adds leads | Top-up Status, Added, Skipped (already in the campaign), Failed, Last Run, Message |

**Launch checks** (all must pass):
1. **Copy approved:** Workflow Stage is Approved, Build Ready, Launch Ready or Live, or Campaign Approval Source is set, or Client Approval Exception is ticked.
2. **Lead list ready:** exactly one lead list linked, its stage Ready or Uploaded and QA Passed.
3. **EmailBison campaign ready** (each part): in the right workspace, has leads, has email steps, has at least one inbox and every inbox is connected.
4. **Client active:** a client is linked and its Status does not say cancelled, paused, inactive or churned (empty counts as active).

Not checked by the engine yet (do these yourself before pressing Launch): the **EmailGuard spam check**, and that every claim in the copy is in the client's approved proof.

**Top-up numbers** come from the campaign's own fields: reply rate = Unique Replies / Emails Sent, interested rate = Interested / Unique Replies, bounce = Bounced / Emails Sent. No replies yet = no top-up.

**Bounce check across all clients** (2026-11-24): with `BOUNCE_CHECK_WORKSPACES=all` the engine uses the Dulcy key to check **every workspace it can reach** (35 today), one after another, every `BOUNCE_CHECK_EVERY_MIN` minutes. Over 4% at 35%+ progress = paused (when `bounce.check` is in LIVE_STAGES; otherwise report-only), over 2.5% = watch. One Slack alert lists each campaign with its workspace; a workspace that cannot be read is listed, never stops the others.

**Skip Bounce Pause:** when ticked on a campaign, the engine's bounce check never pauses it (for a just-launched campaign where 1 early bounce looks like 10%). It still shows in the watch alert.

**Dry run:** until a button's stage is switched on on the server (LIVE_STAGES), it runs as a dry run: all checks run, nothing changes in EmailBison, and Engine Message starts with "Dry run".

---

## 3. Contacts: one way only (DiscoLike Contacts Run)

**Since 2026-11-24 there is no choice to make** (Alex: remove the old way). Every list finds contacts with the **DiscoLike Contacts Run**: DiscoLike's database first, then web search for companies with nobody, then a real-time email check. Only people with a checked email are delivered and paid for (1 cent each).

- The Contact Source dropdown is gone from the Lead List Center page.
- A list that still has an old value ("DiscoLike", "DiscoLike + ContraGen", "ContraGen") uses the Contacts Run anyway; the message says "Legacy DiscoLike contact options are retired: used the DiscoLike Contacts run".
- The old code stays in the engine (tested) only so nothing breaks; DiscoLike retires those endpoints on 2026-12-31. `LEGACY_CONTACTS_END` in the server .env would bring them back; don't, unless Alex asks.
- Every DiscoLike endpoint the engine uses stays after 2026-12-31. If DiscoLike marks one as retiring, the engine logs "DiscoLike says this endpoint is being retired".

**Known limit:** about 28% of Contacts-run people (the ones found on the web, not in DiscoLike's database) have no DiscoLike person ID. Deep Review Contacts and person-level enrichment skip those people (company-level enrichment still works).

**Verify stays the same for every option:** MillionVerifier checks every email ("just making sure"), and **LeadMagic runs only when "Use LeadMagic" is ticked** (off by default).
- **LeadMagic speed (2026-11-25):** the engine sends one Email Finder lookup per person, about 40 at a time and at most 250 a minute (LeadMagic's limit is 300). About 14,000 people take about an hour, not 12 (LeadMagic's bulk queue ran at ~19 rows a minute, ticket T-1619). Same credits. A lookup that errors stays Risky and is not retried; a refused key or no credits stops the job, and the answers so far are kept. Server switches: `LEADMAGIC_MODE=bulk` goes back to the bulk queue; `LEADMAGIC_CONCURRENCY`, `LEADMAGIC_PER_MIN`.

**What the live test showed (2026-11-23, 518 companies, 383 contacts, MillionVerifier on 366):**
- DiscoLike "Validated" (201): 82% good, 15% risky, **3.5% bad**. That's why MillionVerifier stays.
- DiscoLike "Validated (catch-all resolved)" (165): 79% risky. MillionVerifier can't check catch-alls, and only 1.2% came back bad. They are dropped today; keeping them needs a real-send bounce test first.
- Cost: about 2 cents per sendable lead (1 cent per delivered contact, ~54% MillionVerifier-good).

**Switching later is safe.** You can run 100 or 1,000 companies on "DiscoLike", then switch to "DiscoLike + ContraGen":
- ContraGen then runs **once** on the companies already searched that are under 5 usable contacts.
- DiscoLike is **not** searched again.
- Expanding later (to 4k, then 10k) only searches the **new** companies.
- Companies that a Contacts Run already searched are never sent to ContraGen, because the run already did the web research.

**Contact settings (Contact Filters JSON):**
- `results_by_company`: people per company (default 5).
- `relevance` (Contacts Run only): `max_relevance` (closest matches), `balanced` (default) or `max_coverage` (broader).
- The **Contact Persona DNA** field describes who to find (e.g. "owners, founders, CEOs"). The engine uses it for its own title check, and the Contacts Run sends it to DiscoLike as the people description.

### How a DiscoLike Contacts Run works
1. **Companies:** the engine sends the list's Tier 1/2 companies not searched yet (Tier 1 first), up to 10,000 per run. A 30,000-company list becomes 3 runs, one after another.
2. **The search:** DiscoLike checks its database, searches the web for missing people, and checks every email in real time.
3. **What comes back:** only people with a checked email, marked "Validated" or "Validated (catch-all resolved)". Catch-alls it cannot prove, guesses and failures are never delivered and cost nothing.
4. **Waiting:** the engine waits, checking every 30 seconds. Engine Message shows "running, N validated contacts so far".
5. **Saving:** it reads the results 100 companies at a time, runs our own contact check (wrong titles or countries are cut), and saves them to the Contacts tab.
6. **Never pays twice:** every company is marked as searched. A re-press or a retry reuses the same run.

---

## 4. Statuses and what to do

- **QA needs the copy** (Alex, 2026-11-24): Run QA checks every lead against the linked campaign's copy (each {variable} filled, emails Good, no duplicates). With no copy written yet it fails with "No populated final sequence steps": write the copy first, then Run QA. Build Campaign checks the same again and stops if a {variable} is empty for any lead.

- **Lead List Stage follows the work** (Alex, 2026-11-24): after Generate filters → Targeting, first 100 → Searching, Expand → Source Imported, Find Contacts → Contacts Ready, Verify → Verification, Skip Enrichment → QA, QA passed → Ready. It only moves forward: re-running an earlier step never pulls a list back (e.g. from Ready).

- **While Expand, Find Contacts or Verify runs**, the Engine Message shows a short block, one fact per line, updated as it goes (Alex, 2026-11-24), e.g.:
  ```
  Finding contacts (DiscoLike Contacts Run) · batch 1
  • Status: running
  • Companies: 85 of 100 done
  • Contacts found: 115 with a checked email
  • Time: 3 min so far · about 1 min left
  ```
  The time left uses the pace so far.
- **Expand never stops early just because the closer matches ran out:** if the search uses BALANCED (or MAX_RELEVANCE) and DiscoLike runs out before the target, Expand continues on MAX_COVERAGE and the message says "Search widened from BALANCED to MAX_COVERAGE". Every company is still fit-checked (pet e-com test, 2026-11-24: BALANCED stopped at 1,568 of 10,000).
- **Find Contacts and Verify** show the same kind of line: contacts "batch 4 of 12 done, 2,000 of 6,000 companies searched, 1,450 usable contacts so far, running 9 min, about 18 min left"; Verify "MillionVerifier job …: 40% complete (8,200 emails), running 6 min, about 9 min left" and the same for LeadMagic.

| Engine Status | Meaning | What to do |
|---|---|---|
| Queued | Picked up, about to start | Nothing |
| Running | Working | Nothing |
| Waiting | Waiting on a provider (MillionVerifier, a DiscoLike run, a rate limit). It carries on by itself | Nothing |
| Done | Finished. Engine Message has the summary | Check the result, then press the next step |
| Needs Review | Stopped on purpose so nothing is wasted (unclear paid call, failed provider task, unreadable answers) | Read the message. Usually fix the cause and press again; paid work is reused |
| Failed | Error (bad input, missing field, sign-in refused) | Read the message, fix, press again |

**Rate limits:** DiscoLike sometimes says "slow down". The engine waits and carries on, and Engine Message shows DiscoLike's reason. Two limits matter:
- DiscoLike allows only **3 running ContraGen/DiscoGen tasks per account**, and n8n shares those slots.
- Searches are limited per minute (our Company plan: 25 company or contact searches a minute).

---

## 5. Safety: what the engine always does

- **Never pays twice.** Every paid call has a receipt. A retry, a double click or a re-press reuses the earlier result.
- **Never launches or sends by itself.** Build Campaign makes drafts only. Only the Launch button launches, and only after every launch check passes.
- **Never repeats an EmailBison change.** Launch, pause, inbox changes and uploads each have a receipt; a retry reuses it.
- **Unsubscribe link always off** on every campaign, even if the campaign record ticks it (Alex, 2026-11-23); people opt out by replying.
- **Daily limits fit the inboxes.** Max emails per day = inboxes x each inbox's daily limit (e.g. 7 x 15 = 105). A bigger number copied from another campaign is lowered to that; a smaller one is refused (the campaign would stall). Max new leads per day = 80% of that unless set lower. If you raise the inboxes' daily limits later, raise the campaign's limits in EmailBison too.
- **No credit cap on DiscoLike.** The list size (Expansion Target) is the limit. MillionVerifier, LeadMagic and OpenAI keep the engine's safety caps.
- **One job per list and action at a time.** A second press of the same button while one runs is refused.
- **Keys stay on the server** (`/opt/dulcy-os/engine/deploy/.env`). The engine never reads Airtable's key or password fields.
- **Client lists:** credits are spent only with Alex's go-ahead. Claude may test on Dulcy's own lists.

---

## 6. Costs (DiscoLike Company plan, 2026-11)

| Item | Price |
|---|---|
| Company record (search, sample, expand) | $2 per 1,000 new companies; free again within 30 days |
| Contacts, "DiscoLike" (legacy, ends 2026-12-31) | $2 per 1,000 new contacts; free again within 30 days; emails not checked |
| ContraGen (legacy, ends 2026-12-31) | About $10 per 1,000 emails found, plus our own OpenAI and Serper usage |
| **Contacts Run (new)** | **$10 per 1,000 contacts with a checked email.** No company charge when searching our own list. Bad emails are free |
| MillionVerifier + LeadMagic | About $200 a month together (Alex). Under review: may be skipped for Contacts Run contacts if the live test shows DiscoLike's checks are accurate |

---

## 7. Server commands

SSH in: `ssh -o ServerAliveInterval=30 root@178.156.132.86`

| What | Command |
|---|---|
| Deploy a new build | `cd /opt/dulcy-os && git pull && bash engine/deploy/deploy.sh` |
| See a job | `cd /opt/dulcy-os/engine/deploy && docker compose exec engine node dist/src/cli.js job <id>` |
| Cancel a waiting job | `cd /opt/dulcy-os/engine/deploy && docker compose exec engine node dist/src/cli.js cancel <id>` (works only while it is queued/waiting; a running job needs the engine stopped first) |
| Compare MillionVerifier with DiscoLike's own email check (free) | `cd /opt/dulcy-os/engine/deploy && docker compose exec engine node dist/src/cli.js mv-compare <recordId> <MillionVerifier job id>` |
| Stop / start the engine | `docker compose stop engine` / `docker compose start engine` (jobs pick up where they left off) |

---

## 8. Not finished yet

- **Catch-alls:** DiscoLike's "catch-all resolved" contacts are dropped by MillionVerifier (risky). Keeping them needs a real-send bounce test (Alex: not now).
- **More contacts:** wider people description, `max_coverage`, re-search companies that gave nobody (after the accuracy test).
- **Airtable:** move the engine buttons into the main Lead List Center. Add "DiscoLike Contacts Run" to the Contact Source dropdown choices.
- **Per-list cost:** show each list's DiscoLike cost in Airtable.

---

## 9. Change log

- **2026-11-28:**
  - **Agents start instantly** (Alex): Echo, the bounce check, Riley, Cole, the Won sync, Sienna's scripts, the campaign pipeline (Atlas plans, Scribe copy), Atlas's to-do list, Ledger's purchase check, account health, the Airtable buttons and the Decisions loop now start on their event (webhook `/hooks/<source>`, an HQ action, or another job finishing), with an hourly backup sweep instead of their timers once each webhook is set up. Set-up and the full table: "Agents start instantly (engine)".
- **2026-11-24:**
  - **Generate Filters works for every niche** (section 2a, Alex's goal of 2026-11-23): 500 lookalike companies for the analysis (was 20); industry labels only when 60%+ of them carry them (either/or; none = no industry filter); a soft lead goal (campaign inboxes x 14 / 3, else 3,000 leads); auto-widen in a fixed order with free counts, never geography; the message shows the goal, the count, the labels with their numbers and what was widened.
  - The "ecom adds E-COMMERCE" rule is replaced by the 60% label rule.
  - A sample under 80% fit now reads as a warning ("Below 80% fit (warning): review before approving"); it never blocks Expand.
- **2026-11-23:**
  - "ecom", "e-commerce", "DTC", "online store" or "Shopify" in the targeting sentence adds E-commerce as an either/or industry next to the product industry (Alex: or, never and).
  - Employee ranges snap to DiscoLike's size steps (1-10, 11-50, 51-200, 201-500, ...): "10 to 200" = 11-200 (Alex).
  - Fixed: Generate filters ignored "between 10 and 200 employees" (only "10-200" / "10 to 200" worked), so no employee filter was set.
  - New: **Campaign Center buttons on the engine** (section 2b): Build, Launch (all launch checks first; any fail = nothing launched), Pause, Update Senders (pause, change, start again when running), Top Up (top-up rule from the campaign's numbers). The bounce check now honours **Skip Bounce Pause**.
  - New: **Check TAM** on the engine (free count, replaces the n8n TAM workflow), **Restart Companies** (backup, then clear and reset), **Skip Enrichment** (to QA without writing the stage directly). Deep review of companies runs by itself when its box is ticked.
  - Fixed the Engine page error ("No field with ID ... in table 'Lead Lists'"): the page no longer reads the table's hidden primary field. The page now also has Contact Source and Use LeadMagic.
  - Build Campaign sizes the daily limits to the campaign's inboxes. A limit copied from a bigger campaign (live: 2,325 a day on 7 inboxes) is lowered to what the inboxes can send.
  - Tested live: launch, then pause, of a built campaign works (test campaign 653: 0 emails sent, then deleted).
  - From 2027-01-01 legacy contact options automatically use the Contacts run; DiscoLike retirement headers are logged as warnings.
  - **DiscoLike Contacts Run is the default Contact Source** (also when the field is empty). The legacy options run only when picked on purpose. MillionVerifier stays after it; LeadMagic only when ticked.
  - Fixed: the Contacts tab could miss contacts or have gaps (a ContraGen batch and the next DiscoLike batch could share a batch number; rows were written at fixed places that shifted after cuts). Every Find Contacts press now ends with a clean rewrite of Contacts and Contacts (Cut) from the engine's saved contacts.
  - MillionVerifier and LeadMagic jobs are named after the lead list.
  - New server command `mv-compare`: compares MillionVerifier's verdicts with DiscoLike's email check.
  - New Contact Source "DiscoLike Contacts Run" (DiscoLike's new one-step contact search).
  - A later switch to ContraGen never re-pays companies a Contacts Run already searched.
  - DiscoLike's own email status is kept on each contact.
  - A Find Contacts run that saved contacts but failed writing the Sheet now catches up on the next press.
  - Rate-limit messages show DiscoLike's reason.
- **2026-11-22:**
  - No credit cap on DiscoLike.
  - DiscoLike rate limits make the job wait instead of failing.
- **2026-11-21:**
  - DiscoGen deep review for companies and contacts.
  - Enrichment fallback phrases that fit the email copy.
  - Verify keeps enrichment columns.
- **2026-11-20/21:**
  - Full list path on the engine: filters, sample, expand, contacts, ContraGen, Verify (MillionVerifier + LeadMagic), automated QA, Build Campaign.

## Decisions (Slack ✅/❌), added 2026-11-24

**What it is:** how agents ask Alex. An agent (or anyone) adds a row to Airtable **Decisions** with Status **New**. Within 30 seconds the engine posts it to Alex's Slack decisions channel (ID C0B581HNSMR):

- one short message: who and what, **Issue**, **Checked**, **Proposed**, then what happens on ✅ (if anything);
- the long details go in the thread.

**Deciding:** the bot pre-adds ✅ and ❌ under each message (needs the `reactions:write` scope); tap one. The bot's own reactions never count. Only Alex's and Josh's reactions count. ❌ wins if both are there. You can also set Status to **Approved** or **Rejected** in Airtable.

**What happens next:** Status becomes Approved, Decided By/At are filled, the action runs, and **Result** plus a thread reply say what happened (Done / Failed). Approved with no action = just recorded.

**Actions so far:** **Send Reply**: sends the approved text in the prospect's EmailBison thread (reply-all, right workspace). Action Input: `{"workspaceId": 66, "replyId": 123, "message": "...", "emailsRecordId": "rec…", "latestReplyAt": "…"}`.
- Never sent twice for one decision.
- If the prospect wrote again after the draft, nothing is sent: it asks for a redraft.
- Dry run until `decision.send_reply` is in LIVE_STAGES.

**Server settings:** `SLACK_BOT_TOKEN` (required), the bot invited to #dulcy-decisions.

## Campaign numbers in Airtable, added 2026-11-24

Every bounce check (every `BOUNCE_CHECK_EVERY_MIN` minutes, all workspaces) also writes each campaign's live EmailBison numbers into Airtable **Campaigns**, matched on **ID**:
- Emails Sent, Unique Replies, Interested
- Bounced, Total Leads Contacted, Progress

This covers paused campaigns too, and runs every day of the week. Only records whose numbers changed are written. The bounce check message says how many were updated. A failed write never stops the check. (Before this, two Airtable automations did it Sun–Thu only, so Bounced looked too low.)

## Echo: replies drafted for you, approved in Airtable or Slack (2026-11-24)

**What happens:**
1. **Find.** Every `SEAN_EVERY_MIN` minutes Echo finds interested replies waiting on Dulcy from the last 14 days. It skips threads the client handles, and threads that are booked or closed.
2. **Draft.** Echo drafts each answer with Claude, using:
   - your rules, Echo's skill, your Drive SOP findings and the creator methods;
   - the client's own file;
   - that client's real threads that **booked a meeting**;
   - the replies you approved before.
3. **Times.** Two real open times come from the client's own connected calendar, never a time already offered to another prospect in the last 3 days. If there's none, Echo uses the client's saved booking link. When the prospect picks a time, Echo books it (see "Echo books the meeting itself" below).
   - **Per-client controls (Inbox Manager → Dulcy Reply Agent screen):** Echo follows each client's own settings:
     - **Enabled** off → Echo drafts nothing for that client (Lead Flo, cancelled).
     - **Reply Controls → Client reply handoff:** *All replies* = the client answers its own replies, Echo stays out (MJJ). *After first agent reply* = Echo answers once, then the client takes over (no follow-ups).
     - **Reply types:** only the ticked types get a draft; others are skipped with the reason shown.
     - **Response Style:** tone, length, agent name, goal, language, templates per reply type, and the **Inbox manager instructions** box (your custom prompt for that client).
     - **Not-interested reply:** on → one courtesy reply following its instructions; off → no reply.
     - **Knowledge Base links:** the only links Echo may share (videos, decks). Add the link there and Echo can send it.
     - **Follow-ups tab:** the plan (steps, delays) and the follow-up instructions box.
     - **Calendar:** booking link, and the switches to stop offering times or links.
4. **Where the draft lands.** On the reply's row in Airtable (Reply Queue): Draft, State "Needs Approval", Intent, **Echo Reason**, and **Echo Needs Your Input** when a fact is missing. It is also posted to Slack.

**Approving.**
- **Airtable:** Human Action = **Approve Draft** (sends the draft) or **Send Edited Reply** (sends Custom Reply).
- **Slack:** ✅ presses the same Approve. ❌ (or Skip in Airtable) skips.

**Sending.** One sender for every client. It sends once, to the prospect only, with the client's CC/BCC from the Reply Agent settings. It refuses when:
- the prospect wrote again;
- the thread has newer messages;
- our side already answered;
- a [GAP] marker is left in.

**After sending:**
- Interested threads are set to **Scheduled** with a **Due At** (the first follow-up). Not-interested, stop and booked threads show **Sent** and get no follow-ups.
- Last Email Sent = By Dulcy.
- A Reply Learning row is saved as **Approved**, and Echo learns from it.
- The Slack thread says "Sent".

**Always mirrored.** Sent or skipped from either Airtable or Slack shows in both.

**Switches (server .env):**
- `SEAN_EVERY_MIN` (0 = off) plus `sean.draft` in LIVE_STAGES (otherwise a dry run: Claude is not called).
- `REPLY_SENDER=on` plus `reply.send` in LIVE_STAGES. Only after the old n8n replier is off (`automations/n8n-fix.mjs`, FIX=replier-off).
- `CALENDAR_READER_TOKEN` for client calendars.
- `SEAN_FOLLOWUPS=on` for follow-ups (below). Only after the old n8n follow-up timer is off (FIX=followup-arm-off).

### Echo follows each client's send settings (2026-11-25)
Echo reads every setting on the client's Reply Agent settings row (Inbox Manager → Dulcy Reply Agent).
- **Default Mode.**
  - *Approval Required* (every client today): every draft waits for your Approve or ✅. Nothing changes from before.
  - *Auto High Confidence:* Echo sends by itself only when its confidence is at or above **Minimum Auto Confidence** (92% today).
  - *Autopilot:* Echo sends by itself.
- **Routing groups (per reply type):** a group's mode wins over the Default Mode. *Do Not Reply* types (Unsubscribe, Hostile) are always skipped.
- **OOO Mode = Auto Send:** out-of-office replies may go out by themselves.
- **Always Require Human Review:** the ticked reply types always wait for you, whatever the mode.
- **Max Automatic Replies:** at most this many automatic sends per thread (3 today). After that, you approve.
- **Not Interested Nudge:** ticked → one courtesy reply to "not interested".
- **Out-of-office and not-interested first replies** are drafted only for clients that turn them on: out of office when *Out of Office* is a ticked reply type (or OOO Mode = Auto Send); not interested when the Not Interested Nudge is on. An out-of-office reply is one or two lines, no pitch, and the first follow-up waits until the day after their return date.
- **Office hours** (Timezone, Office Start/End, Exclude Weekends, Exclude US Holidays): automatic sends wait for the client's office hours. Replies you approve go out at once.
- **Never sent automatically:** a draft that needs your input, has a [GAP] or placeholder, or a client that is switched off. All the sender's checks still run.
- **What you see:** an automatic send has no ✅ card. It shows in the Activity log ("Auto-reply queued") and the Slack/Airtable thread says "Sent (approved in auto-send, client settings)". It is not saved as a reply you approved, so Echo doesn't learn from its own sends.
- **Off switch (server .env):** `SEAN_AUTO_SEND=off` → every reply waits for a person, whatever the settings say.

### Echo's follow-ups (2026-11-24)
Your rule: keep following up on a positive reply until they answer or say stop.
1. **When.** A thread is Scheduled with a Due At after every reply we send. Out-of-office and check-back-later replies keep the return date the old intake gave them.
2. **Draft.** When Due At passes and the prospect still hasn't answered, Echo drafts the next follow-up. Each one must have a real reason: their open question, the promised next step, or one new true point. Never "just bumping this". Out of office: welcome back + the open point.
3. **Approve.** Same as replies: the draft lands on the row (Reply Queue) and in Slack as "Follow-up N to …". ✅ or Approve sends it. Nothing goes out without you.
4. **How many.** The client's **Follow-up Plan JSON** (Reply Agent settings: steps with a delay and what each should do). No plan saved: 3 follow-ups at 2, 3 and 5 business days. Then one polite close-the-loop note 7 days later, then the thread is marked **Thread Complete**. A plan with `enabled: false` means no follow-ups for that client.
5. **Stops.** Any answer from the prospect, a stop or unsubscribe, booked/closed, Not Interested, DNC or client-handled. If the prospect wrote, it becomes a normal reply for Echo. If someone already followed up by hand after the draft, the sender refuses to send a second one.

### Echo books the meeting itself (Alex, 2026-11-27)
Your words: "If they respond 'yes, could we do Wednesday at 5 PM' and it's still available, the AI agent should say 'you're all squared away' and have it automatically book."

**How it works:**
1. **The prospect picks a time.** One of the 2 times Echo offered ("Wednesday at 5 works"), or their own exact day and hour ("could we do Thursday 10:30?").
   - Echo works out the exact slot in the client's time zone.
   - It checks it: the day they named matches; 1 hour to 30 days away; inside the client's office hours; not a weekend or US holiday if the client turned those off.
2. **Live check.** Echo asks the client's own calendar if that slot is still free.
   - **Free:** the draft is a short confirmation: "Hi Jane, you're all set for Wednesday, Dec 3 at 5:00 PM ET. A calendar invite with the video link is on its way."
   - **Taken or outside hours:** the draft offers 2 other specific times. Never a booking link unless nothing else works.
   - **Vague** ("sometime next week", "Tuesday works" with no hour): 2 specific times, no booking.
   - **No calendar, or connected before booking existed:** the draft says "Wednesday, Dec 3 at 5:00 PM ET works. I'll send the calendar invite over shortly." A person sends the invite. You get one HQ ask per client: "Reconnect <client>'s calendar so Echo can book meetings".
3. **Approval.** Same as every reply, per client (Reply Agent settings):
   - *Approval Required* (the default): **one card**, "Book Wed Dec 3, 5:00 PM ET + send confirmation". One approve (Airtable, Slack ✅ or HQ Send) does both, in that order: book, then send.
   - *Autopilot / Auto High Confidence*: Echo books and confirms by itself, inside office hours only.
   - A "send the invite by hand" draft always waits for a person.
4. **Booking** (job `calendar.book`):
   - The calendar service checks free/busy again right before booking.
   - **Google:** an event on the client's main calendar, the prospect invited, a Google Meet link. Google emails the invite.
   - **Calendly:** a booking on the client's chosen meeting type. Calendly sends its own confirmation.
   - **Outlook / Microsoft 365:** an event on the client's main Outlook calendar, the prospect invited, a Teams link when their account has Teams (work accounts; a personal Outlook.com account gets no video link). Outlook emails the invite.
   - **Cal.com:** a booking on the client's chosen event type. Cal.com sends its own confirmation.
   - **GoHighLevel:** the prospect is added (or updated) as a contact, then an appointment on the client's chosen calendar. GoHighLevel's own confirmations and workflows run.
   - **HubSpot:** a booking on the client's chosen meeting link. HubSpot sends its own confirmation and logs the meeting on the contact.
   - A required question on the booking form that Echo can't answer truthfully (a dropdown, a consent checkbox) stops the booking with a clear reason: make that question optional in the client's tool.
   - Same approval never books twice (fixed booking key). It books only on the thread's own client calendar.
   - **If the time is gone or the booking fails, nothing is sent.** The draft changes to 2 other times and a new card comes back.
5. **After booking**, the Emails row gets what a booked meeting always gets:
   - **Opportunity Status = WON.** Your existing Airtable automation "Webhook to Make for WON" then sets Pipeline Stage, tags the EmailBison lead "Meeting Booked", adds 1 to the campaign's Meetings Booked, and posts "New Meeting Booked" to the client's Slack (Make "[9.0 CLIENT] Booked Meetings").
   - **Pipeline Stage = Booked Meeting.**
   - **Date of Call Booked** = the call's day.
   - **Meeting Booked At** = when it was booked.
   - Follow-ups closed, an Activity Log row ("Meeting booked: Jane Doe at Acme, Wed Dec 3, 5:00 PM ET").
   - Then the confirmation goes out through the normal sender.
6. **HQ Inbox:** a draft that books shows "Books Wed Dec 3, 5:00 PM ET". A booked thread shows "Booked: Wed Dec 3, 5:00 PM ET (Google Meet)" with an **Open** link.

**Client settings it follows:** Default Mode, routing groups, Minimum Auto Confidence, Max Automatic Replies, Always Require Human Review (same as replies), and Timezone, Office Start/End, Exclude Weekends, Exclude US Holidays (when a meeting may be booked). The calendar's own rules (working days, hours, meeting length, buffer, notice) apply on top.

**Switches (server .env):** `calendar.book` in LIVE_STAGES (until then, an approve is a dry run: nothing is booked or sent), and `CALENDAR_BOOKER_TOKEN` (without it Echo drafts "I'll send the invite over").

#### What Alex must do (once)
1. **Google Cloud console** (the OAuth app the calendar service uses):
   - Google Auth Platform → **Data Access** → Add or remove scopes → add `https://www.googleapis.com/auth/calendar.events.owned` ("See, create, change and delete events on Google calendars you own"). Save.
   - It is a **sensitive** scope. **Verification Center** → submit for verification: a short justification ("Dulcy's reply agent books the meeting time a prospect agreed, on the client's own calendar, with a Google Meet link and the prospect invited; it reads free/busy to offer open times") and an **unlisted YouTube demo video** showing the consent screen and a booking.
   - Until Google approves, clients see an "unverified app" screen. They click **Advanced → Go to (app)**. This works for up to 100 users.
2. **Calendly developer app:** tick users:read, event_types:read, availability:read, scheduled_events:read, **scheduled_events:write** (this one books), locations:read. Save.
3. **Every connected client reconnects once.** HQ → client → AI replier → Calendar → **Get calendar link** → send it. Until then their status says "Connected – reconnect to allow booking" and Echo drafts "I'll send the invite over".
4. **Booker token + deploy** (SSH in: `ssh -o ServerAliveInterval=30 root@178.156.132.86`), after this branch is merged to main:
   ```
   cd /opt/dulcy-os && git pull
   # 1. a new token only the engine holds; it can book, nothing else
   TOKEN=$(openssl rand -hex 32)
   cp /opt/dulcy-calendar/data/private/config.json /opt/dulcy-calendar/data/private/config.json.bak-$(date +%F)
   python3 -c "import json,sys; p='/opt/dulcy-calendar/data/private/config.json'; c=json.load(open(p)); c['bookerToken']=sys.argv[1]; json.dump(c,open(p,'w'),indent=1)" "$TOKEN"
   # 2. deploy the calendar service code
   cp /opt/dulcy-calendar/app/calendar-http.mjs /opt/dulcy-calendar/app/calendar-http.mjs.bak-$(date +%F)
   cp services/dulcy-calendar/*.mjs /opt/dulcy-calendar/app/
   docker restart dulcy-calendar
   docker logs --tail 5 dulcy-calendar        # expect "Calendar connection service ready"
   # 3. the engine: token, then the live stage
   echo "CALENDAR_BOOKER_TOKEN=$TOKEN" >> /opt/dulcy-os/engine/deploy/.env
   # edit LIVE_STAGES in that .env: add calendar.book (comma-separated, next to sean.draft and reply.send)
   bash engine/deploy/deploy.sh
   ```
   - The calendar service's `/calendar/admin/*` routes are not public (Traefik leaves them out); the engine reaches them inside the Docker network.
   - A failed connect or booking now writes one line to `docker logs dulcy-calendar` with the route and the reason (no tickets, codes or emails).

#### More calendars: Outlook, Cal.com, GoHighLevel, HubSpot (2026-11-27)
HQ → client → AI replier → Calendar → **Get calendar link** now offers 6 calendars: Google Calendar, Outlook / Microsoft 365, Calendly, Cal.com, GoHighLevel, HubSpot Meetings. Echo reads open times and books on all 6 the same way.

| Calendar | How the client connects | Setup on your side |
|---|---|---|
| Outlook / Microsoft 365 | Signs in with Microsoft | Once: a Microsoft (Entra) app, below |
| HubSpot Meetings | Signs in with HubSpot | Once: a HubSpot developer app, below |
| Cal.com | Pastes an API key on our page | Nothing |
| GoHighLevel | Pastes a Private Integration token + Location ID | Nothing |

**Status in HQ / `calendar-test`:** "Connected – booking allowed", "Connected – reconnect to allow booking" (a permission is missing), or "Reconnect required" (the key was deleted or access expired). Then send the client a new link.

##### 1. Microsoft app (Outlook / Microsoft 365), once
1. Go to **entra.microsoft.com** (sign in as Dulcy's Microsoft admin) → **Applications → App registrations → New registration**.
   - Name: `Dulcy Calendar`.
   - Supported account types: **Accounts in any organizational directory (Any Microsoft Entra ID tenant – Multitenant) and personal Microsoft accounts (e.g. Skype, Xbox)**. Booking works for both kinds; personal accounts just get no Teams link.
   - Redirect URI: platform **Web**, `https://n8n.dulcy.io/calendar/callback`.
   - Click **Register**.
2. **Overview** → copy the **Application (client) ID**.
3. **Certificates & secrets → Client secrets → New client secret**. Description `dulcy-calendar`, expiry 24 months → **Add**. Copy the **Value** (not the Secret ID); it is shown once. Put a reminder in your calendar to renew it before it expires.
4. **API permissions → Add a permission → Microsoft Graph → Delegated permissions** → tick **offline_access**, **User.Read** (usually already there) and **Calendars.ReadWrite** → **Add permissions**. No application permissions. You don't need "Grant admin consent" for Dulcy's own tenant.
5. **Branding & properties** → Publisher domain `dulcy.io` (verify it if asked). UNKNOWN: some client companies block apps from unverified publishers. If a client sees "Need admin approval", their IT admin approves "Dulcy Calendar" once (Enterprise applications → Admin consent requests), or you finish **Publisher verification** (needs a Microsoft Partner ID).
6. Put the ID and secret on the server (below, `PROVIDER=microsoft`).

##### 2. HubSpot developer app, once
1. Go to **developers.hubspot.com** → sign in to (or create) Dulcy's **developer account**.
2. **Apps → Create app** (a public app, left unlisted; no Marketplace listing).
   - **App info:** name `Dulcy Calendar`.
   - **Auth** tab: Redirect URL `https://n8n.dulcy.io/calendar/callback`.
   - **Scopes** → add as **Required**: `scheduler.meetings.meeting-link.read` (meeting links and their availability), `crm.objects.contacts.write` (a booking creates the contact) and `oauth` if it isn't already there.
   - **Create app** / Save. Copy the **Client ID** and **Client secret** from the Auth tab.
   - UNKNOWN: HubSpot is moving apps to its new "projects" developer platform. If your account only offers that, create the app there with the same redirect URL and the same 3 scopes as required scopes.
3. Put the ID and secret on the server (below, `PROVIDER=hubspot`).

##### 3. Put a client ID and secret on the server (Microsoft or HubSpot)
SSH in (`ssh -o ServerAliveInterval=30 root@178.156.132.86`), then run this once per provider. Neither value is shown on screen or saved in the shell history:
```
PROVIDER=microsoft          # or: hubspot
cp /opt/dulcy-calendar/data/private/config.json /opt/dulcy-calendar/data/private/config.json.bak-$(date +%F-%H%M)
read -r -p "Client ID: " CID; read -r -s -p "Client secret: " CSEC; echo
CID="$CID" CSEC="$CSEC" PROVIDER="$PROVIDER" python3 -c "import json,os; p='/opt/dulcy-calendar/data/private/config.json'; c=json.load(open(p)); c.setdefault('apps',{})[os.environ['PROVIDER']]={'clientId':os.environ['CID'],'clientSecret':os.environ['CSEC']}; json.dump(c,open(p,'w'),indent=1)"
unset CID CSEC
python3 -c "import json; print(sorted(json.load(open('/opt/dulcy-calendar/data/private/config.json'))['apps']))"   # expect your provider in the list
docker restart dulcy-calendar
docker logs --tail 5 dulcy-calendar        # expect "Calendar connection service ready"
```
Deploy the new code first (after this branch is merged to main):
```
cd /opt/dulcy-os && git pull
mkdir -p /opt/dulcy-calendar/app/bak-$(date +%F) && cp /opt/dulcy-calendar/app/*.mjs /opt/dulcy-calendar/app/bak-$(date +%F)/
cp services/dulcy-calendar/*.mjs /opt/dulcy-calendar/app/
docker restart dulcy-calendar
bash engine/deploy/deploy.sh               # the engine and HQ (new provider list)
```
Cal.com and GoHighLevel work right after the deploy: there is nothing to add to `apps`.

##### 4. What the client does (Cal.com and GoHighLevel)
The link's page shows these steps too.
- **Cal.com:**
  1. Sign in to Cal.com as the invited email.
  2. **Settings → Developer → API keys → New** (or **+ Add**). Name it `Dulcy`, choose **Never expires** (or the longest option), **Save**.
  3. Copy the key (it starts with `cal_`) and paste it on the Dulcy page.
  4. Pick the event type and their time zone. The event type's own hours, length and buffers decide the times.
  - The key must belong to the invited email, or the page refuses it.
  - To stop Dulcy: delete the key in Cal.com.
- **GoHighLevel** (Twenty West):
  1. Open the sub-account that has the booking calendar.
  2. **Settings → Private Integrations → Create new Integration**, name `Dulcy`.
  3. Tick **View Calendars** (calendars.readonly), **View Calendar Events** (calendars/events.readonly), **Edit Calendar Events** (calendars/events.write) and **Edit Contacts** (contacts.write). **Create**, then copy the token.
  4. Paste the token and the **Location ID** (Settings → Business Profile, or the part after `/location/` in the address bar) on the Dulcy page.
  5. Pick the calendar and the time zone.
  - UNKNOWN: GoHighLevel's exact scope labels may read slightly differently. The scope codes in brackets are the ones that matter.
  - GoHighLevel shows no account email for a token, so the check is that the token works on that Location ID, plus the one-time link.
  - Without Edit Calendar Events / Edit Contacts, the first booking is refused and the status says "reconnect to allow booking". Then they make a new token with all 4 scopes and use a new link.
  - To stop Dulcy: delete the Private Integration.

## Bounce agent (Atlas, 2026-11-25)
Follows Alex's method (RULES.md 2026-11-25). Over 4% bounce = pause and investigate.
1. **When.** Every bounce check: each campaign it pauses, or flags over 4% with Skip Bounce Pause ticked (once every 3 days per campaign).
2. **Step 1, the bounce codes.** Reads the campaign's bounce notices (up to 5 pages) and sorts each by its code: *not found / verification* (5.1.x) or *blocked / spam* (5.7.x), mailbox full, other. Top codes are listed.
3. **Step 2, if it is spam: domain, account or copy.**
   - **Account:** blocks pile up on a few inboxes → On ✅ those inboxes are removed and the campaign resumes.
   - **Domain:** blocks cluster on one of our domains (across its inboxes), notices name a blacklist / reputation / SPF-DKIM-DMARC, or the inboxes send from risky domains (.info…) → check the domains in the Spam Center, plan new .com domains.
   - **Copy:** blocks spread evenly over all inboxes and domains → review the copy (links, tracking, spam words) and run a placement test.
4. **Step 3, where the bounces land.** Each bounced address's mail server is looked up (MX record): Google, Microsoft 365, a security gateway (Proofpoint, Mimecast, Barracuda…) or a custom mail server. If 50%+ of the bounces land on one gateway / custom server → stop sending to those recipients.
5. **Verification** causes (list) and gateway removals change leads, so they are proposed only. ✅ runs only: remove the burned inboxes and resume, or resume (too early to judge). After a fix, Skip Bounce Pause is ticked (the bounce % counts every email so far).
6. **Check one campaign by hand** (posts nothing): `docker compose exec engine node dist/src/cli.js bounce-check-campaign <workspaceId> <campaignId>` (add `--post` to post it to Slack).
7. **Switch:** `bounce.investigate` and `bounce.fix` in LIVE_STAGES.

## Account health loop (Atlas, 2026-11-25)
Alex's rule (RULES.md 2026-11-25). Replaces the n8n "[Email Accounts] Automated Spam Protocol", which never processed a test.
1. **When.** Every `ACCOUNT_HEALTH_EVERY_MIN` minutes the engine reads new inbox placement tests (Inbox Placement Testing, created after `ACCOUNT_HEALTH_FROM`, default the Friday 2026-11-27 tests). The bounce agent uses the same rest when one account causes a campaign's bounces.
2. **Under 60% → rest.** Daily limit set to 0 (1 if EmailBison refuses 0), old limit saved in *Previous Daily Limit*, Spam Protocol Stage *Resting 7 Days*, Retest Due = 6.5 days later (so the next Friday test is the retest). Automatic; Slack summary.
3. **Next weekly test.** 60%+ → old limit restored, *Recovered*. Under 60% → the domain's blacklist result (from the weekly EmailGuard check on Domains) is read, a **Replace Domain** record goes to the Spam Remediation Queue (1 .com domain at $9.99 + 2 Google accounts via Cheap Inboxes) and a Slack decision. **✅ ticks Approve Purchase**; the n8n "Approve Domain Replacement" flow prepares the purchase request and the card is charged only after the final approval in Buy Domains & Inboxes.
4. **Activity log.** Every step (rest, recover, replacement, approval) is written to the Activity Log, linked to the account, its campaigns and the client.

## Activity log (2026-11-25)
Airtable table **Activity Log**: one row per step, with When, Agent (Atlas, Echo, Engine…), Type (Detected, Diagnosed, Fixed, Waiting for approval, Approved, Step done, Step failed) and links to Campaign, Lead List, Email Account and Client. Written by: every finished lead list and campaign job (sample, contacts, verify, build, launch, pause, top up…), the bounce check (pauses), the bounce agent (diagnosis and automatic fixes) and the account health loop. Each Campaign and Lead List record has the linked **Activity Log** field; the Campaigns interface has an **Activity Log** page with dropdowns per campaign / lead list / account / client.

**Bounce agent, automatic fixes (Alex 2026-11-25):** when one account is the cause, it is rested for a week and the campaign is resumed without waiting for ✅; "too early to judge" resumes too. The Slack post then says "Fixed: …". List, copy, domain and gateway fixes stay proposals.

## Ada, the morning brief (2026-11-25)
Every weekday at `ADA_BRIEF_HOUR` (default 8 AM ET) the engine posts one brief to `ADA_CHANNEL` (default Alex's Slack DM, from the Dulcy Agents bot). Read only. Spec: `agents/ada-morning-brief.md`.
- **Waiting on you:** open decisions (replies / follow-ups, bounce, purchases) and the oldest one.
- **Overnight (24 h):** new interested replies per client, meetings booked, replies sent, drafts waiting.
- **Campaigns:** over 4%, watch (2.5-4%), paused in 24 h, past 60% (plan the next one), almost done.
- **Accounts:** resting, to replace, purchases waiting.
- **Agents:** steps per agent from the Activity Log.
- **Top 3** things only Alex can unblock. **Fridays:** weekly scorecard per client (interested, booked, sent; this week vs last).
- **Agent work** (2026-11-25): every agent task that is late (past its due date) or stuck (no update for 2+ days), one line each, at most 5 ("• Atlas: New campaign for MJJ (no update for 3 d) → re-queued"). A stuck task with an engine job behind it is re-queued through the normal queue (only when the brief runs live). Nothing late: one line, "every task is on time and moving".
- Switch: `ADA_BRIEF=on` and `ada.brief` in LIVE_STAGES. Today's calendar is not in v1 (the engine has no calendar read yet).

## Ledger, the accountant (2026-11-25)
**What it does (read only, never pays or moves money):**
- **Saturday report** (9 AM ET, to your Slack DM). From Xero it shows:
  - the cash in each bucket;
  - money in this week and the month so far, with its source (Commas/Fanbasis, PayPal, Wise and so on);
  - the **split check**: each bucket's share of what came into Entry Checking, against 40/30/15/10/5, with a ⚠️ when a bucket is more than 2 points off;
  - **spend this month against the OPEX cap** (40% of income so far), with the top costs;
  - invoices more than 7 days late, bills due in 14 days, lines waiting to be reconciled;
  - the next 14th/28th payout: Owner's Comp, card balances, Tax → HYSA.
  - It ends with a top 3.
- **Purchase yes/no.** Post a question with a price in the decisions channel, e.g. "Should I buy Clay $349/mo?". Ledger replies in the thread within about 5 minutes:
  - ✅ Yes, ⚠️ Yes, but (recurring cost, a vendor you already pay, or little room left) or ❌ No (over the cap);
  - plus `OPEX room this month: $x → $y after this`.
  - It never says yes to paying from Tax or Profit. Treasury is always "Alex's call".
  - It only answers Alex and Josh, in top-level messages.
- **Numbers come from Xero, as reconciled.** Xero already has every Mercury bucket, all 4 cards and the payment processors, so there is no Mercury key.

**Setup, once:**
1. Put `XERO_CLIENT_ID` and `XERO_CLIENT_SECRET` in `deploy/.env`, then deploy.
2. Log in to Xero:
   - Run `docker compose exec engine node dist/src/cli.js xero-connect` and open the link.
   - Click Allow (pick Dulcy Media). The page that follows doesn't load; that's expected.
   - Copy the address from the browser bar and run `xero-connect "<that address>"`.
3. Check: `docker compose exec engine node dist/src/cli.js ledger-report` prints the report without posting it.
4. Switch on, in `.env`:
   - `LEDGER=on`
   - `LEDGER_CHECK_EVERY_MIN=5`
   - add `ledger.report,ledger.check` to `LIVE_STAGES`
   - then deploy.
5. The purchase check reads channel messages, so the Slack bot needs `channels:history`, plus `groups:history` if the channel is private.
   - If the check job fails with `missing_scope`, add the permission at api.slack.com → your app → OAuth & Permissions → Bot Token Scopes, then reinstall the app.

**Try a question without posting:** `ledger-ask "Should I buy Clay $349/mo?"`.

**If Xero says "invalid_grant":** the login has expired (60 days unused, or the app was disconnected). Run `xero-connect` again.

### Ledger reconciles (2026-11-25)
**Why it works this way:** Xero's API cannot tick "reconcile" (Xero's own rule). So every morning (`LEDGER_PREP_HOUR`, default 7 AM ET) Ledger reads Mercury and **creates the exact entry each line needs in Xero**. Xero's auto-reconcile then matches the bank-feed line to it, or you click OK once.

**What each Mercury line becomes:**
- **Transfer between buckets** (Entry → OPEX and so on): a Xero bank transfer.
- **Payout from Commas/Fanbasis, PayPal, Wise, Stripe, Whop or GoCardless**: a transfer from that clearing account (for example Fanbasis Holding → Entry Checking).
- **A client paying exactly an open invoice**: a payment on that invoice, so it shows as paid.
- **Money out to a payee you coded before**: spend with the same account code.
- **Everything else, asked in Slack once:**
  - AmEx payments (which card?);
  - new payees;
  - deposits that match no invoice.

  Code those in Xero once, and next time Ledger copies how you did it.

**Safety:**
- Ledger never deletes, voids or edits.
- A line already in Xero (same account, same amount, within 3 days) is left alone.
- Every line is handled once (`ledger_entries` table), and Xero's Idempotency-Key stops duplicates on a retry.

**Cards (AmEx, Chase):** the API can't see them. Use Xero's auto-reconcile plus bank rules.

**Setup:**
1. Add `MERCURY_TOKEN` (Read Only) to `.env` and deploy.
2. Run `xero-connect` again. Ledger now asks Xero for write permissions; click Allow.
3. Preview, which writes nothing: `docker compose exec engine node dist/src/cli.js ledger-prep`
4. Do it for real:
   - add `ledger.prep` to `LIVE_STAGES` and deploy;
   - run `ledger-prep --live` once, or wait for the daily run (needs `LEDGER=on`).

**The Saturday report** now shows cash, money in and the split **live from Mercury**, plus how many reconciliation questions are still open.

### Ledger checker mode (default, 2026-11-25)
**Why:** Xero's API and the Xero connector can't see the Reconcile screen, and auto-reconcile isn't on Dulcy's plan. So Ledger **never writes to Xero** (`LEDGER_PREP_WRITE=off`, the default).

**Every day at 7 AM ET:**
- Ledger compares every Mercury line with Xero.
- Lines still not in Xero after 3 days are posted **once** to Alex in Slack, with what each one should be (e.g. "should be a transfer Entry Checking → OPEX").
- Every run checks them again. Once a line is reconciled, it's marked as in Xero.

**Every Friday:** in Chrome, open Xero and tell Claude "reconcile Xero" (routine in `agents/ledger-reconcile-chrome.md`). It clicks OK only on Xero's clear suggestions and lists what it skipped.

**Check now, from the server:** `docker compose exec engine node dist/src/cli.js ledger-prep` (shows the lines, posts nothing).

**To switch it on:** add `ledger.prep` to `LIVE_STAGES` and set `LEDGER=on`. The prep runs once Mercury is set.

## Atlas, Cole and Sienna (2026-11-25, built overnight)
All three are **off until switched on**, and **post only when their stage is in `LIVE_STAGES`**. None of them sends anything to a client or prospect, or publishes anything.

### Atlas: client health (Mondays, `ATLAS_HOUR`, default 9 AM ET, to your DM)
**Each active client gets:**
- retainer, months in and LTV;
- interested and booked this week vs last week;
- the last 30 days vs the client's calls-booked KPI;
- the **interested → meeting rate** (the Twenty West lesson);
- campaigns: active, over 4% bounce, past 60%.

**The light:**
- 🔴 when there's no active campaign, meetings are under half the KPI, or fewer than 10% of 20+ interested replies became meetings.
- 🟡 for the smaller warnings, including **monthly fee missing in Airtable**: no fee is invented.

**At the top:** MRR, average retainer, average months and average LTV. **At the end:** a top 3.

**Try now (posts nothing):** `docker compose exec engine node dist/src/cli.js atlas-health`

**Switch on:** `ATLAS=on`, and add `atlas.health` to `LIVE_STAGES`.

### Cole: sales-call reviews (needs `FATHOM_API_KEY`)
**What it does:**
- **Finds the calls:** every `COLE_EVERY_MIN` (default 60) it reads new Fathom calls from the last 7 days. It skips internal ones, Claude classifies the rest, and only **sales** calls are reviewed, at most 3 per run.
- **The review** goes to your DM, in Jackson Anderson style:
  - a score;
  - **pacing measured from the transcript**: your talk %, longest stretch and questions asked;
  - each stage scored;
  - what worked, with quotes;
  - **3 fixes**, each with "you said / say instead";
  - objections against Closers.io;
  - missing beliefs, the next step agreed, and one drill.
- **The follow-up email draft** goes in the thread. You edit it and send it yourself.
- Each call is reviewed once.
- **Close (2026-11-27):** after the review Cole sets that prospect's Close opportunity likelihood and the price pitched on the call. Live only with `cole.close_update` in `LIVE_STAGES` (and `CLOSE_API_KEY`); details under HQ → Sales → "Round 3".

**Setup:**
1. In Fathom, go to Settings → API Access and create a key.
2. Add `FATHOM_API_KEY=` to `.env`.
3. Set `COLE=on` and add `cole.review` to `LIVE_STAGES`.

**Run now:** `docker compose exec engine node dist/src/cli.js agent cole.review`

### Sienna: content (Friday ideas, scripts as soon as you approve)
**Friday morning (`SIENNA_IDEAS_HOUR`, default 7 AM ET), ideas for the next Friday:**
- Sources: web research (Reddit is one of many), Dulcy's own prospect questions (last 30 days) and **Agency Ignition** (your Discord: last 30 days of every text channel the bot can see, or only `SIENNA_DISCORD_CHANNELS` if set; needs `DISCORD_BOT_TOKEN`). Ideas for both channels: the week's videos plus spares (main 4, Raw 8 today).
- Claude **searches the web** (YouTube views and comments, LinkedIn, X, Reddit, forums; not Reddit alone) for what B2B agency owners and founders are asking now.
- It then adds **2 × your weekly video count** ideas to the Content Center:
  - Status "Review", Idea Decision "Needs Review", source "Generated Idea" (so they show in the Content Center's idea queue);
  - an Idea Score;
  - the evidence URLs and why it's rising now, in the qualification reason.
- Ideas that duplicate an existing title are skipped. You get a Slack list.
- **Pick the ones you want: approve them in the Content Center with a recording date** (the old "Record This Week" tick still works).

**As soon as you approve an idea** (checked every 30 minutes; ideas approved in the last 14 days, not recorded yet), it gets (Production Stage "Script", the same stage the screen uses):
- a teleprompter **script** in your voice, learned from your recent transcripts;
- 3 titles and 3 hooks;
- a thumbnail idea;
- a Gamma outline;
- a YouTube description;
- a **"check before recording"** list of any claim you must confirm.

Production Stage becomes "Script Ready". Nothing is posted.

**Switch on:** `SIENNA=on`, and add `sienna.ideas,sienna.prep` to `LIVE_STAGES`.

**Run now:** `agent sienna.ideas`, or `agent sienna.prep`.


## Campaign creation, part 1: Atlas plans the next campaign (2026-11-25)

**What starts it:** a client's active campaign passes 60% sent, or a paying client has no campaign yet. One new plan per check, at most 2 waiting at once (`CAMPAIGN_PLANS_MAX_OPEN`).

**What happens, by itself:**
1. **Atlas plans.** Reads the client's offer (Airtable), client file, past campaigns and the last 120 days of interested and objection replies. Picks the move with your SOP numbers (interested per email vs the agency average, campaigns with 500+ sent):
   - 70%+ of the average → top off with lookalikes;
   - 60–70% → top off, flagged;
   - below 60% → same offer, new vertical;
   - below and locked into one industry → new offer or copy test;
   - no data yet → first campaign.
   Writes one thesis (ICP, one pain, dream outcome, proof, structure) with **2 Email-1 angles**. Proof it can't find is written `UNKNOWN: ask Alex`, never made up.
2. **Creates the Campaign and Lead List records** and presses **Generate Filters**.
3. **Presses Run Company Sample** (first 100 companies, about $1) when the filters are done.
4. **Approval 1 in Slack:** plan + ICP + sample result (fit / not fit). ✅ = sample approved + **Expand Companies** pressed. ❌ = stops; nothing more is spent.

5. **After ✅, two things run at once:**
   - **The list:** Atlas presses each Lead List button in order: Find Contacts (sample of 100 companies; 70%+ usable continues by itself, lower asks you in Slack), Find Contacts (all), Verify and Finalize, then (once the copy is in) **Prepare Enrichment Prompt + Run Enrichment** when the copy uses custom variables (at most 2, e.g. {KEYWORD}, each with a fallback), otherwise Skip Enrichment, then Run Automated QA.
   - **The copy (Scribe):** reads its playbook (`skills/scribe-cold-email-copywriter/references/playbook.md`: your SOPs, the Source of Truth, your course docs and copy audits, the 2026 house style, and the results of 410 real campaigns), the top/bottom 10 campaigns, every script already run for that client, the client file, the approved plan and the client's real replies. Writes Email 1 as **2 variants (the 2 angles)** plus the follow-ups. A second pass reviews it like you would and fixes what it finds; code checks the hard rules (30-75 words, 1-3 word subject, no links, no call ask, no banned phrases, only {FIRST_NAME}/{COMPANY}). The copy goes in the Campaign's (Review) fields (Email 1 as "Variant 1 / Variant 2", the Campaign Center format) and the sequence fields. Workflow Stage = Internal Review.
6. **Approval 2 in Slack:** the full copy + list numbers. ✅ = Atlas presses **Send for approval** (Client Review, 48-business-hour clock); your existing automation emails the client the portal link. ❌ = Scribe waits for your notes: `campaign-copy <plan> "<what to change>"`.
7. **The client** approves in the portal (or it auto-approves after 48 business hours). Then, by itself: the approved copy goes back into the sequence fields → **spintax** (the same button) → the client's **free healthy inboxes** (Healthy or ungraded, connected, not resting, warmup 70+, not in another Active/Uploaded campaign; none free = it asks you) → **Build Campaign** → **Launch Campaign**, which goes live only if every launch check passes. Plan state `live` = done. If the client asks for copy changes, Scribe rewrites with their notes and approval 2 comes back to you. List changes come to you.

If a step fails, the plan stops (`stuck`, the reason shows in `campaign-plans`). Retry a set-aside plan with `campaign-plan-retry <id>`.

**See plans:** `campaign-plans`. **Rewrite copy:** `campaign-copy <plan id> "<notes>"`.

**Switch on:** `ATLAS_CAMPAIGNS=on`, and add `atlas.plan,campaign.pipeline,campaign.plan_approved,campaign.contacts_approved,scribe.copy,campaign.copy_approved` to `LIVE_STAGES` (plus `campaign.build` and `campaign.launch`, already live).


## Riley, systems repair (2026-11-25)

**What it does:**
- **Every 15 minutes:** the engine puts every failed, stuck (15+ minutes past its lease) or needs-review job into the Airtable **System Issues** table. n8n errors go in too, once `N8N_API_KEY` is set. It's one row per problem: the same error again raises Occurrences. A problem marked Fixed that comes back is reopened.
- **Every 2 hours, 8 a.m. to 8 p.m. ET:** Riley (a Claude scheduled task, runbook `agents/riley-session.md`):
  1. works out why each new issue happens;
  2. prepares the fix: a retry, a code fix on a branch (not merged), or an exact n8n / Make / Airtable change with a rollback;
  3. posts one Slack ✅/❌ per issue.
  Once a day he also sweeps Make and Airtable automation errors, and works one known open issue.
- **✅ on a Retry:** the engine re-runs the failed job right away.
- **✅ on an n8n fix (2026-11-27):** the engine makes the change in n8n itself, right away. See "How n8n fixes are applied" below.
- **✅ on a code fix:** on his next run Riley opens the PR, runs the tests, merges it, and DMs you: "Fixed: <title>. Please deploy: `cd /opt/dulcy-os && git pull && bash engine/deploy/deploy.sh`". You only run that line on the server. If he can't push (the repo isn't attached to his scheduled task), his Slack report says so once.
- **✅ on a Make or Airtable fix:** Riley makes it live on his next run with his Make / Airtable tools, checks it worked, and marks it Fixed.
- **❌:** nothing changes.

**How n8n fixes are applied (2026-11-27):**
- Riley reads the workflow and writes the exact change on the System Issue: which workflow, which node, which setting, the value now and the new value.
- When you press ✅, the engine (it has the n8n key):
  1. reads the workflow again;
  2. stops if anything Riley read has changed since ("changed since diagnosis": nothing is changed, Riley looks again);
  3. saves the whole workflow as it was, in the engine (this is the rollback);
  4. saves the change in n8n, and switches the workflow off and on again if it was on, so n8n picks it up;
  5. marks the issue Applied, with what changed and the undo line.
- It never touches passwords, keys, tokens or logins in n8n. A fix that would is refused, and stays a manual step for you.
- **Undo:** on the server, `docker compose exec engine node dist/src/cli.js riley-n8n-rollback <System Issue record ID>`. That shows what it would put back; add `--yes` to do it. It refuses if someone edited the workflow again after the fix (add `--force` to put it back anyway). The issue goes to Fix failed so Riley looks again.
- Until `riley.n8n_apply` is in `LIVE_STAGES`, a ✅ only checks the change still fits, changes nothing in n8n, and Riley sends you the steps as before.

**Switch on:**
- `RILEY=on`, and add `riley.collect,riley.apply` to `LIVE_STAGES`.
- For n8n errors and n8n fixes: `N8N_API_KEY` (n8n → Settings → n8n API → create key) and `N8N_BASE_URL` (default `http://localhost:5678`).
- For the engine to make n8n fixes on your ✅: add `riley.n8n_apply` to `LIVE_STAGES`.

## Agents start instantly (engine) (Alex, 2026-11-28)

Alex: "I don't want any agents to run on schedules; it should be an instant webhook type of thing." The engine's agents now start the moment their work arrives: a provider calls `https://engine.dulcy.io/hooks/<source>`, an HQ button is pressed, or another engine job finishes. No agent waits for a timer once its webhook is set up. (Claude cloud routines for Riley's and Sienna's sessions are a separate piece: `engine/src/agents/fire.ts`.)

**What starts each agent now**

| Job | Before (timer) | Now starts on | Set-up needed |
|---|---|---|---|
| Echo drafts (`sean.draft`) | every `SEAN_EVERY_MIN` | a prospect reply: the n8n reply intake wrote its Emails row (best: Echo reads that row), or EmailBison "Contact Replied / Interested / Untracked Reply" | n8n step 2a (EmailBison step 3 also works, but may arrive before n8n wrote the row; the backup sweep and the next reply catch it) |
| Echo follow-ups (`sean.followup`) | every `SEAN_EVERY_MIN` | right after every reply, every sent reply or booking (engine), a manual send (n8n "Manual Emails Sent" or EmailBison "Manual Email Sent"); plus its due-time check every `SEAN_FOLLOWUP_EVERY_MIN` (60) because a follow-up acts when it is due | n8n step 2e (optional) |
| Bounce check (`bounce.check`) | every `BOUNCE_CHECK_EVERY_MIN`, all 35 workspaces | a bounce (n8n "Bounce Data Tracker", which already gets every workspace's bounces, or EmailBison "Email Bounced"): only that workspace is checked, at once (it reads Skip Bounce Pause itself) | n8n step 2d (or EmailBison step 3) |
| Riley logs problems (`riley.collect`) | every `RILEY_EVERY_MIN` (15) | an engine job failing (inside the engine, always), the n8n Error Workflow, a Make error | nothing for engine jobs; n8n step 2c, Make step 4 |
| Cole call reviews (`cole.review`) | every `COLE_EVERY_MIN` (60) | Fathom "New meeting content ready" | Fathom step 6 |
| Close → Airtable Won sync (`sales.won_sync`) | every `WON_SYNC_EVERY_MIN` (30) | a Close opportunity created or its status changed | Close step 7 |
| Sienna scripts (`sienna.prep`) | every 30 minutes | an idea approved: in HQ (always instant), or in Airtable's Content Center | Airtable automation 5 |
| Campaign pipeline + Atlas plans + Scribe copy (`campaign.pipeline`, `atlas.plan`, `scribe.copy`) | every `CAMPAIGN_PIPELINE_EVERY_MIN` (5) and every minute | inside the engine: each list/campaign/plan step finishing, approvals 1 and 2, a plan created or rewritten in HQ or the CLI; outside: a campaign's status, progress or portal answer changing (Airtable) | Airtable automation 6 |
| Atlas to-do list (`atlas.tasks`) | every 30 minutes | new campaign numbers (after each bounce check) or a campaign change in Airtable | none extra |
| Ledger purchase yes/no (`ledger.check`) | every `LEDGER_CHECK_EVERY_MIN` | a question posted in the Ledger check channel (Slack Events) | Slack step 5 |
| Account health (`account.health`) | every `ACCOUNT_HEALTH_EVERY_MIN` | new placement results: n8n "Check Results", or the Airtable automation | n8n step 2b or Airtable automation 7 |
| Airtable buttons (Lead List Center, Campaign Center) | every `AIRTABLE_POLL_MS` (30 s) | the button press (Airtable automation), an HQ button, and every engine list/campaign step (its progress and result are written back at once) | Airtable automations 1 and 2 |
| Decisions ✅/❌ and the Reply Queue buttons | every `DECISIONS_POLL_MS` (30 s) | a ✅/❌ in Slack (only that message is read), a decision or Reply Queue button in Airtable, a decision in HQ, a job ending (its new card goes to Slack at once) | Slack step 5 **and** Airtable automations 3 and 4 |

Unchanged (reports meant for a time of day): Ada's brief, Ledger's report and prep, Atlas health (Mon), Atlas ramp (daily), Sienna ideas (Fri).

**How it works**
- **Fast answer, work in the worker.** A webhook is checked, logged (`hook_events`, a one-line summary, never lead rows) and turned into a queue row; the answer comes back at once. The work runs in the engine's worker as always: `LIVE_STAGES` / `DRY_RUN` decide what is a dry run, exactly as before. Nothing is sent, launched or bought by a webhook that was not before.
- **A burst is one run.** 10 replies in a minute = 1 Echo run. If Echo is already queued, the new reply joins it. If Echo is running, it runs once more right after (it may have read before the reply came). If it just finished within the last 30 seconds (`INSTANT_WINDOW_SEC`), one catch-up run starts at the end of those 30 seconds, never more. The bounce check has its own 2-minute window per workspace (`BOUNCE_CHECK_WINDOW_SEC`, 120), because a busy workspace bounces every few seconds: the first bounce is checked at once, the rest at most every 2 minutes (the old timer was every 30 minutes).
- **Retries never double.** Slack, Fathom and Close resend an event with the same id; the engine starts it once.
- **Backup sweep.** A provider can drop a webhook, so each job still runs on its own every hour (Alex 2026-11-28: "yes, maybe sooner"; `<JOB>_BACKUP_EVERY_MIN`, e.g. `SEAN_DRAFT_BACKUP_EVERY_MIN=60`; `0` = off). Names: `SEAN_DRAFT_`, `BOUNCE_CHECK_`, `RILEY_COLLECT_`, `COLE_REVIEW_`, `SALES_WON_SYNC_`, `SIENNA_PREP_`, `CAMPAIGN_PIPELINE_`, `ATLAS_TASKS_`, `LEDGER_CHECK_`, `ACCOUNT_HEALTH_`, `AIRTABLE_BRIDGE_`, `DECISIONS_LOOP_` + `BACKUP_EVERY_MIN`.
- **Nothing breaks before set-up.** A source with no secret on the server answers 404, and the jobs it feeds keep their old timer. The moment its secret is set (and the engine restarted), those jobs switch to instant + backup sweep. The Decisions loop switches only when both Slack and Airtable are set up (it gets work from both).
- **On switches** stay as they were (an old `*_EVERY_MIN` above 0 still means "on"); new plain ones: `SEAN=on`, `BOUNCE_CHECK=on`, `ACCOUNT_HEALTH=on`, `LEDGER_CHECK=on`. `WON_SYNC_EVERY_MIN=0` still switches the Won sync off.
- **Security.** Each source has its own secret. Slack, Fathom and Close sign every request and the engine checks the signature (and refuses anything older than 5 minutes). EmailBison, n8n, Make and Airtable send the shared secret in the `x-hook-secret` header (EmailBison cannot set headers, so for it alone the secret is the `?key=` in the URL). Wrong or missing = 401. Webhooks are served only on `engine.dulcy.io`, never on HQ or the portal.
- **Mercury:** Mercury does offer webhooks (`transaction.created`, signed `Mercury-Signature`), but a new bank transaction is not Ledger's purchase-check work: the yes/no answers a question posted in Slack, so that is its event. No Mercury webhook is used.

**Check it works:** `cd /opt/dulcy-os/engine/deploy && docker compose exec engine node dist/src/cli.js hooks` lists each source (secret set or not, events in 24 h, last one), each job (INSTANT + its backup sweep, or still on its old timer and which secret it needs) and the last 10 events with the jobs they started.

### Set it up (Alex, once; about 45 minutes)
Do the steps in order. Step 1 puts the secrets on the server without restarting. Do each provider (steps 2 to 8), then restart once (step 9). Until the restart, a provider that already calls gets a 404, which is harmless, and nothing changes. Exact n8n, Make and Airtable changes: `automations/instant-hooks-2026-11-28.md`.

**1. Secrets on the server.** The values never show on screen except when you copy one into its provider, and they are never put in git or chat.
```
ssh -o ServerAliveInterval=30 root@178.156.132.86
cd /opt/dulcy-os/engine/deploy
cp .env .env.bak-$(date +%F-%H%M) && chmod 600 .env.bak-*
# a) the four shared secrets (made here):
for S in EMAILBISON N8N MAKE AIRTABLE; do sed -i "/^HOOK_SECRET_$S=/d" .env; printf 'HOOK_SECRET_%s=%s\n' "$S" "$(openssl rand -hex 32)" >> .env; done
# b) the three the providers give you (paste when asked; nothing is shown):
read -r -s -p "Slack Signing Secret: " V; echo; sed -i '/^HOOK_SECRET_SLACK=/d' .env; printf 'HOOK_SECRET_SLACK=%s\n' "$V" >> .env; unset V
read -r -s -p "Fathom webhook secret (whsec_...): " V; echo; sed -i '/^HOOK_SECRET_FATHOM=/d' .env; printf 'HOOK_SECRET_FATHOM=%s\n' "$V" >> .env; unset V
#    (Close: step 7 writes HOOK_SECRET_CLOSE itself.)
grep -c '^HOOK_SECRET_' .env          # counts the lines, shows no values
```
To copy a shared secret into its provider (steps 2, 3, 4 and 8), show only that one, copy it, then clear the screen: `grep '^HOOK_SECRET_N8N=' .env | cut -d= -f2; read -p "copied? " _; clear`. Skip a provider you don't want yet: delete its line (`sed -i '/^HOOK_SECRET_MAKE=/d' .env`) and its jobs stay on their old timer.

**2. n8n** (`HOOK_SECRET_N8N`): one credential, then three small changes (click-steps in the automations file):
- Credential: n8n → Credentials → New → **Header Auth**, name `Dulcy engine hook`, Name `x-hook-secret`, Value = the secret.
- 2a. The reply intakes (`[INBOX MANAGER] Receive Replies from EmailBison`, `… Bison Untracked Replies`, `… Receive Replies + Handwrytten Direct Mail`, `… Receive Replies from HeyReach`, `1.2 Positive Email Reply`, `… Manually Mark Reply as Interested`): after each node that creates the Emails row, one HTTP Request node `POST https://engine.dulcy.io/hooks/n8n` body `{"event":"reply"}`. Posting after the row is written matters: Echo reads the row.
- 2b. `[Inbox Placement Tests] Check Results`: after the result is written, the same node with `{"event":"placement_results"}`.
- 2c. Error workflow: a new workflow "Dulcy engine: errors to Riley" (Error Trigger → HTTP Request `{"event":"error", …}`); then set it as **Error Workflow** in each active workflow's settings.
- 2d. `[Inbox Management] Bounce Data Tracker`: after its Airtable write, `{"event":"bounce","workspace_id":…,"workspace_name":…}` (from the incoming EmailBison event).
- 2e. `Manual Emails Sent (Including Dulcy Reply Agent)`: at the end, `{"event":"sent"}`.

**3. EmailBison** (`HOOK_SECRET_EMAILBISON`, optional when n8n step 2 is done: n8n already gets these events for every workspace): in **each** workspace (the bounce check covers all 35), Settings → Webhooks → Add webhook: name `Dulcy engine`, URL `https://engine.dulcy.io/hooks/emailbison?key=<HOOK_SECRET_EMAILBISON>`, events **Contact Replied, Contact Interested, Untracked Reply Received, Email Bounced, Manual Email Sent**. Send a test event from the same screen; `hooks` then shows it. (Riley can add it to every workspace through the EmailBison API, `POST /api/webhook-url`, once you say so.)

**4. Make** (`HOOK_SECRET_MAKE`): in each scenario that matters, an error handler route with **HTTP → Make a request** to `https://engine.dulcy.io/hooks/make` (see the automations file). Make has no account-wide error webhook, so coverage is per scenario; Riley's session still sweeps Make runs.

**5. Slack** (`HOOK_SECRET_SLACK`): api.slack.com/apps → the Dulcy app (the one whose bot token the engine uses):
- Basic Information → **Signing Secret** → Show → paste it in step 1b.
- Right after the restart (step 9): **Event Subscriptions** → On → Request URL `https://engine.dulcy.io/hooks/slack` (Slack checks it; it must say Verified) → **Subscribe to bot events**: `reaction_added`, `message.channels` (add `message.groups` if the decisions or Ledger check channel is private) → Save. If Slack asks, **Reinstall to workspace**. Scopes needed: `reactions:read`, `channels:history` (`groups:history` for a private channel). The bot must be a member of both channels.

**6. Fathom** (`HOOK_SECRET_FATHOM`): Fathom → Settings → API Access → **Add webhook**: URL `https://engine.dulcy.io/hooks/fathom`, recordings **mine and shared with me** (or the team's, as Cole reviews today), event **New meeting content ready**, include summary/transcript as you like (Cole reads the call from Fathom's API anyway). Copy the secret it shows once (`whsec_…`) into step 1b. The engine checks Fathom's signature (Standard Webhooks: `webhook-id`, `webhook-timestamp`, `webhook-signature`).

**7. Close** (`HOOK_SECRET_CLOSE`): Close makes webhooks through its API only. On the server (uses the `CLOSE_API_KEY` already in `.env`; nothing is shown):
```
cd /opt/dulcy-os/engine/deploy
K=$(grep '^CLOSE_API_KEY=' .env | cut -d= -f2-)
curl -s -u "$K:" -H 'content-type: application/json' https://api.close.com/api/v1/webhook/ \
  -d '{"url":"https://engine.dulcy.io/hooks/close","events":[{"object_type":"opportunity","action":"created"},{"object_type":"opportunity","action":"updated"}]}' \
  | python3 -c "
import json,sys,re
d=json.load(sys.stdin); k=d.get('signature_key','')
if not re.fullmatch(r'[0-9a-fA-F]{32,}', k): sys.exit('Close did not create it: ' + str(d.get('error') or d)[:300])
env=[l for l in open('.env') if not l.startswith('HOOK_SECRET_CLOSE=')]; env.append('HOOK_SECRET_CLOSE='+k+'\n'); open('.env','w').writelines(env)
print('Close webhook', d.get('id'), 'created; HOOK_SECRET_CLOSE saved')"
unset K
```
It prints the webhook id only; the signature key goes straight into `.env`. To remove it later: `curl -s -u "$K:" -X DELETE https://api.close.com/api/v1/webhook/<id>/` (with `K` set as above).

**8. Airtable** (`HOOK_SECRET_AIRTABLE`): seven automations, each "When … → Run a script" that sends one event (script and triggers in the automations file): 1 Lead List Engine button, 2 Campaign Engine button, 3 Decision approved by hand, 4 Reply Queue button (Human Action), 5 Content idea approved, 6 Campaign status / progress / portal answer changed, 7 placement results written. Put the secret in each script's **Secrets** panel as `engineHookSecret` (never in the script text). Do these **before** the restart: once `HOOK_SECRET_AIRTABLE` is live, the 30-second Airtable poll stops and a button is picked up by its automation (or the hourly sweep).

**9. Restart** so the engine reads the secrets: `bash /opt/dulcy-os/engine/deploy/deploy.sh` (last lines "Engine is up."). **Right after**, finish Slack step 5 (Request URL + events): from the restart on, ✅/❌ in Slack are read only when Slack sends them. Then run `hooks` and check every job says INSTANT.

**For Riley:** `engine/src/instant/` — `hooks.ts` (route `/hooks/<source>`, signature checks, the event map), `trigger.ts` (coalescing: queued joins, running → `job_reruns`, window request id `instant:<kind>:<record>:<slot>`, one `:tail`), `afterJob.ts` (engine-internal events, called by `worker.ts`), `hq.ts` (HQ actions), `kick.ts` (the bridge and Decisions loop as kickable loops), `jobs.ts` (which job listens to which source, old timer vs backup sweep). `scheduler.ts` keeps the calendar reports and the sweeps. Tables `hook_events` (30 days) and `job_reruns`. Tests: `test/instantHooks.test.ts`.

## HQ: your private app (Step 1 "Today", Step 2 "Clients" and "Deliverability", Step 3 "Inbox", "Campaigns", "Content" and "Sales", 2026-11-25/26)

**What it is:** one calm screen at **https://hq.dulcy.io**, on the phone or the computer. It runs inside the engine (same server, same code), and Airtable stays the database. Only people with an HQ login get in. Plan: `hq/PLAN.md`.

**Look:** a sidebar on the computer, tabs at the bottom on the phone (on the phone, Inbox has Team's place in the bottom bar; Team is the people icon at the top). Light or dark follows your phone/computer; the System / Light / Dark switch (bottom of the sidebar, or the screen icon at the top on the phone) pins one on that device.

**The tabs** (plus Users for you):
1. **Today**
   - First things: how many decisions wait on you, and the top 3 of **Needs you** in the "Do now" card (tap one to go straight to it).
   - Ada's brief: the two key lines first ("Waiting on you" and "Top 3"); tap for the rest.
   - Team check: one line per agent: ✓ ran fine, ⚠️ failed (which job and why), or ⚠️ decisions waiting on you.
   - Reports: every agent report as a short card. Tap one for the full text. A Cole call review opens on the score and the 3 fixes (what you said → what to say instead); the full review and the follow-up draft are one more tap away.
2. **Decisions:** one pile per owner (Alex, 2026-11-27): Replies = Echo; Campaigns = Atlas, Scribe, Scout; Fixes = Riley; Money = Ledger; Sales = Cole; Content = Sienna; Orchestrator = Ada. There is no "Other" pile any more. Money and Content are yours only. A client dropdown (active clients only, remembered) narrows the piles to one client. One card at a time, with a progress bar.
   - **Replies:** what they wrote, a link to the thread, and the draft in a box you can edit.
     - **Send:** sends the draft as it is (the same as ✅ in Slack).
     - **Send edited:** sends your edited text.
     - **Skip reply:** nothing is sent.
     - The engine's reply sender sends it from the right inbox and closes the card. HQ only presses the buttons on the Emails row (Human Action, and Custom Reply for an edit).
   - **Others:** Issue / Checked / Proposed / On approve, then Approve or Reject. The engine then runs the action, exactly as for a ✅ in Slack.
   - **Later** keeps a card for another time. Keys on a computer, in the same order as the buttons: R reject (or skip reply), S later, A approve (or send), E edit the reply (Esc to stop editing).
   - Every press shows a short result at the top (phone) or bottom (computer). **Reject / Skip reply** has **Undo** for 6 seconds: nothing is saved until then, and nothing is ever sent by a reject.
3. **Needs you** (was "To-do", Alex 2026-11-25: "this is what you need me to do", not another project manager). A short list of only what the agents need from you. Each card: the agent's face, one line, why, and **one** button. "Do now" and "When you can" (two columns on the computer, one list on the phone). The number on the tab counts items, not decisions.
   - **Decisions:** one card per pile, never one per decision ("Echo: 105 replies waiting for your OK", with the oldest age). The button opens that pile. Replies and Campaigns are "Do now", and so is any pile whose oldest card is a day old.
   - **Riley's manual fixes:** System Issues in "Waiting for Alex" with Fix Type "Manual (Alex)". The card shows the Why; **See steps** opens the Fix. When you've done it, **Open the decision** and approve it in Fixes so Riley checks it worked (HQ writes nothing to Airtable here). Its decision is not counted again in the Fixes card.
   - **Sign-ups waiting** → Approve (Users).
   - **Asks:** something an agent or a Claude session needs you to do, e.g. "Atlas: reply to Pete about Twenty West", "Setup: publish the Google calendar app" (with steps). **Done** clears it; **Not now** hides it until tomorrow or Monday 8 a.m. (New York).
   - A card disappears by itself when it's resolved: the pile is empty, the issue left "Waiting for Alex", the ask is done.
   - **An agent's task waiting on you with no decision behind it** (e.g. "Atlas: New campaign for MJJ · Stuck: … Retry: campaign-plan-retry 5"). Owner only. The agents' other tasks stay on their Team pages (tab 4).
   - **Order on Today** (Alex 2026-11-25, plain rules, no AI call on each load): "Do now" before "When you can"; inside each, **money and client-facing first** (a small Money / Client tag says why), then **the oldest**, then the agent's priority.
   - **Day switcher** at the top: **Yesterday · Today · Tomorrow** (with the dates, New York time).
     - **Yesterday** = what got handled, so you can see nothing was dropped: decisions you (or Josh) made, one card per pile ("3 replies handled · 2 sent · 1 skipped"); asks marked done; Riley's fixes; the tasks each agent closed (one card per agent, "See each one" lists them); sign-ups. Read only.
     - **Today** = what is due now (everything above).
     - **Tomorrow** = what comes back from **Not now** tomorrow, plus asks and agent tasks waiting on you that are **due tomorrow**. An ask can still be marked Done early.
     - Links: `#/needs/yesterday`, `#/needs`, `#/needs/tomorrow`.
   - Members see only the piles they can act on (no Money, nothing from Ledger or Sienna), asks sent to everyone, and no Riley manual fixes or sign-ups.
   - **Add an ask (server):** `docker compose exec engine node dist/src/cli.js ask add --agent=Atlas --title="Reply to Pete about Twenty West" --why="He asked twice for the October numbers." --action-url=clients --action-label="Open the client"`. Options: `--steps="1. ...\n2. ..."` (or `--steps-stdin`), `--action-url=` an HQ page (`decisions/Replies`, `users`, `clients`) or an `https://` link, `--priority=high` for "Do now", `--for=everyone` so members see it too, `--due=YYYY-MM-DD` (shown on that day, on Tomorrow the day before), `--client-facing` and `--money` (ranked first; Ledger's asks are always money), `--key=` to set the duplicate key (default: agent + title; the same key never adds a second ask, even after it was done). `ask list [--all]` and `ask done <id>`. In code: `addAsk(db, {...})` in `engine/src/hq/asks.ts`.
   - The old four-box to-do (below) is still at `#/tasks`, out of the menu.
   **Old to-do** (Airtable Tasks, open ones only; at `#/tasks`). It's sorted into four boxes:
   - **Do now:** urgent and important.
   - **Schedule:** important.
   - **Delegate:** urgent, not important.
   - **Later / drop:** the rest.
   - **Urgent** means overdue, due today or tomorrow, or Priority Urgent. **Important** means Priority Urgent or High, or Client Facing.
   - A task sitting in Review/QA for 7+ days asks "Done already?". Answer **Not yet** and it won't ask again for 7 days.
   - **Add a task** at the top. **▶ Start** gives you one task at a time with a timer, like the Daily Run.
4. **Team:** one card per agent: what it does, who it reports to, its status, decisions waiting and its tasks ("4 tasks · 1 stuck · 2 for you"). On top, **Agent work**: per agent the open tasks, how many are **late** (past their due date) and **stuck** (no update for 2+ days). Tap an agent to open it. Open one to see:
   - its **tasks** (Alex 2026-11-25: "the task should be assigned to them, and we could see and ask for progress"): each with its status (**Not started · In progress · Waiting on you · Done**), a one-line progress note ("Reading the bounce codes", "With the client for approval"), the due date, when it last moved, and "Open what it needs" when it waits on you. Tick to finish one by hand. The tasks done in the last 7 days fold open below. **Ask for an update** opens chat with that agent, the question already typed;
   - decisions waiting from it;
   - its reports;
   - its Activity Log rows;
   - its engine runs.
5. **Clients** (Step 2, 2026-11-25): one card per client, worst health first. It replaces the Airtable "Clients & LTV" page (that page shows 3 active because it only counts Client Type "Paying Client").
   - **Shown by default:** the active clients and Dulcy itself. The **Inactive** switch adds past clients (e.g. Lead Flo Marketing).
   - **One client, one card:** workspaces that are the same client count once: "Twenty West Media" (inactive) + "Twenty West Media (Internal)" (active), "Dulcy" + "Dulcy Free Campaigns". The rule: a Workspace IDs "Client" link to another record, otherwise the same name without "(…)" or a trailing "Internal" / "Free Campaigns". The active record leads; replies, meetings and campaigns of both add up.
   - **Health first (2026-11-27):** each card says **Safe / At risk / Needs attention**, judged on the meetings the client was promised (KPI): meetings booked in the last 30 days vs the KPI (a client in its first 30 days is judged on the days it has had). 100%+ = Safe, 50-99% = At risk, under 50% or nothing sending = Needs attention. No KPI on record = "KPI UNKNOWN". The KPI comes from the Workspace IDs client KPI, else the onboarding answer, else the internal KPI.
   - **One short insight per client:** Problem → Decision → what supports it (e.g. "Under KPI: 2 of 10 meetings" → "Echo: turn more interested replies into booked calls" → "30 days: 20,000 emails sent, 40 interested, 5% booked"). Replies waiting and bounce flags are not on Clients any more (they live on Inbox, Decisions and Deliverability).
   - **Results** come from EmailBison (Airtable "Email Analytics Overview", synced every night): emails sent, interested, meetings, **emails per meeting** (sent ÷ meetings), **emails per positive reply** and **interested → booked**. The "Results by client" table compares clients for a period (last 10 / 30 / 60 / 120 days, all time). Why not the Emails table: most bookings there are only marked WON / Booked Meeting with no booking date, so Twenty West showed 0 booked in 30 days (EmailBison: 11). The Emails count now also uses those rows (on their latest reply), and the higher of the two is used.
   - **Deals (owner only for amounts):** retainer, pay per call, or both. The amounts come from the **Dulcy Media P/L sheet** (read live, read only), else the signed agreements in `clients/*.md`, else Airtable. Airtable's Monthly Fee was stale ($2,900 on Global Media Group, who pay per call only), on the inactive Twenty West record, and empty for MJJ and The Marketing Cartel: that is why MRR showed $6,900 instead of $7,745. When Airtable disagrees, the client page shows one line for Atlas to fix. A missing Client Type is filled from the deal.
   - **LTV** = retainer × months paying + per-call rate × meetings booked (e.g. Human Marketing: 4.5 months × $1,500 + 6 × $250), with Xero's recorded revenue shown beside it (Xero had only $1,500 for Human Marketing). Open invoices are "coming up" (not due yet) or "late" (Xero), not "owes".
   - **Round 4 (2026-11-28):** no client dropdown on the overview; no "owner only" labels on screen (members simply never get the money). Every period dropdown has **Custom** (from / to dates, both days included; at most 3 years). **Results by client** has **People contacted** (unique leads emailed: EmailBison "Total Leads Contacted"). A Custom range for results asks EmailBison for those exact days (its workspace totals, one workspace after another, read only) and counts meetings booked in those days from the Emails table; it is kept 5 minutes.
   - **Agency numbers** with a period dropdown (this month, last month, last 3 / 6 / 12 months, this year vs the same days last year, Custom), each compared with the period before (Custom: the same number of days before): current MRR, active clients, new clients, clients lost, net new clients, monthly churn (lost ÷ active at the start ÷ months), average client LTV and average retention (all paying clients ever). Past clients with no end date in Airtable are left out of lost and churn (the screen says how many).
   - **Profit per client** (round 4; replaces the Money block, which moved to **Finances**): per active paying client, for the chosen period: **revenue** from the deal (monthly fee × months in the period + per-call price × meetings booked in it; not Xero payments) minus the known costs: **inboxes** (today's inbox count × $2.50 a month, Dulcy's real price) and **domains** (.com × $9.99 a year, RULES 2026-11-25; other endings show "price UNKNOWN"). **Leads and verification** say **UNKNOWN** (HQ has no per-client lead or MillionVerifier cost yet). Profit = revenue minus the known costs; nothing is guessed. Members get no money at all: the server leaves every amount out, and the money routes answer 403.
   - **Finances** (round 4, its own menu item right after Sales, owner only; on the phone: the card on Clients). **Company:** income and costs this month so far and last month, net, and the biggest cost lines, from **Xero's profit and loss** (not the hand-kept P/L sheet); retainers (MRR); open client invoices (Xero); business cards (from the P/L sheet, the only place card balances are today). **Personal:** Alex's own cards. The sheet does not say which card is personal, so only cards named **Robinhood** or **Discover** go to Personal (Alex named them); every other card stays under Company until Alex says otherwise. Read only; nothing from the sheet or Xero is stored. Cards and banks linked through Plaid show on Personal too and replace those sheet rows (see "Finances → Personal (Plaid)" below).
   - **Finances, round 5 (2026-11-28 evening).** **Personal cards** are now **Cash Preferred, Amex Gold, Chase Personal, Robinhood and Discover** (Alex). The name match is forgiving: any case, extra words, one typo per word (the sheet spells "AMEX Cash Perferred"); a card marked business ("(Bus)", "Business") always stays under Company, so "AMEX Gold (Bus)" is Company and "AMEX Gold" is Personal. The list is `PERSONAL_CARD_NAMES` in `engine/src/hq/finance.ts`. **Personal expenses:** the P/L sheet's personal block (the "Home" list on the `goal` tab: label, monthly amount, note) shows on Personal with the sheet's own total; a figure written only beside the amount column (e.g. HOA, paused savings) is shown as "beside the list" and, like in the sheet's total, not counted. Due days and phone numbers in the left column are never read out. **Both** (`#/finances/both`): one number per month, **Left over** = company income − company costs (Xero) − personal expenses (sheet total), for this month so far and last month, with its parts; any input that is not known makes it **UNKNOWN** and says which. Not counted: personal income outside Dulcy (UNKNOWN), card payments (the spending is already counted). **Drill-downs:** tap an open client invoice for its number, client, amount still owed, due date, days late, total, paid, line items and an "Open in Xero" link (`GET /hq/api/finances/invoices/<Xero InvoiceID>`, one read, client invoices only); tap a month's costs (or "Every cost line") for every Xero profit and loss cost line by section. **Ledger chat** sits beside the numbers (under them on the phone): it is the same chat as HQ Chat → Ledger (it opens the Ledger chat you had open last and keeps going in it), using the normal chat API. Everything stays read only and owner only (members and "view as" get 403).
   - **On a client page:** paying since, workspaces, the insight, **Ask Atlas** (opens Chat with "How is <client>'s health?" ready to send), results over time (10 / 30 / 60 / 120 days / all time), money (owner), **client results** (deals the client closed, ROI for the owner, call feedback with average stars, their onboarding form answers; never logins or passwords), campaigns, Waiting on you, Agent to-do and What happened. The Data check block is gone. The **AI replier settings** moved off the client page; they still open at `#/clients/<id>/replier` (Inbox links there).
   - **Speed and cost:** the Airtable reads are kept for 5 minutes for everyone; the refresh button re-reads (at most every 30 seconds). Atlas owns this data being right.
6. **Chat:** talk to Ada (default) or any agent. History is saved per agent.
   - Chat is **read only**: agents look things up in Airtable and the engine and say where the answer came from. Nothing is sent or changed from chat.
   - When an agent isn't sure, it says "Here's what I found" and who should handle it.
   - Ada can ask another agent for you. That conversation is saved: tap "Read Ada ↔ Atlas" under her answer, or History → "Ada's conversations with the team".
   - Cost: each answer makes at most 5 calls (4 look-up rounds) with capped length (`HQ_CHAT_MAX_ROUNDS`, `HQ_CHAT_MAX_TOKENS`).
   - **Talk** (2026-11-28): the same chat by voice. See "Talk to the agents (voice mode)" below (switch on with `VOICE=on`).

7. **Inbox** (Step 3, 2026-11-25): every reply thread for every client, straight from the Airtable Emails table. It replaces the Reply Queue and the reply pages in Airtable for daily use. HQ only reads and presses the same buttons; Echo's drafting and the engine sender are unchanged.
   - **Tabs** (with counts): **To approve** (Dulcy Reply Agent State = Needs Approval, follow-ups included), **Waiting on prospect** (we wrote last and a follow-up is Scheduled; shows the next follow-up date), **Booked** (last 60 days), **Handed to client** (Client Handling or Reply Ownership = Handoff, last 30 days), **Skipped** (last 30 days).
   - **Client chips** filter to one client (the Twenty West pair counts as one); a search box finds a name, company or words. 50 rows a page.
   - **Each row:** prospect + company, client, intent, age (or the next follow-up / booked date), one line of what they said, and flags: Follow-up N, **Link, not times** (the draft has a booking link), **Needs a fact** ([GAP]), **Not sent** (the sender refused; its reason is in the note), **Sending…** once pressed.
   - **Notes on top** (Problem → Data → Fix): replies not sent, drafts with a booking link instead of two times (per client), drafts over a week old.
   - **Tap a row:** their latest message, Echo's reason (and what Echo needs from you), **Offered times** when the draft has them, the draft in an editable box, and **Send / Send edited / Skip reply**: exactly the Decisions reply card's writes (Human Action Approve Draft / Send Edited Reply + Custom Reply / Skip, and the linked decision marked Approved/Rejected with who and when). The engine sender sends within a minute. A booking link in the draft shows a warning (RULES 2026-11-25: two times; a link only as a last resort); it does not block. A draft with a [GAP] can only go out edited. Below: the earlier messages, latest first, quoted text folded. **Open in EmailBison** opens the thread.
   - Keys on a computer: A send, R skip reply, E edit, Esc stop editing.
   - The list is read once a minute for everyone (refresh re-reads after 10 seconds). Members (Josh) can send and skip, like in Decisions.
   - **Inbox round (2026-11-28; where it differs from the lines above, this wins):**
     - **The thread reads as one conversation, oldest at the top, newest at the bottom** (a long one opens scrolled to the newest message). Each message is its own card: sender, email, date with slashes (11/24, 8:48 PM). The prospect's messages sit left with a blue edge; ours sit right in the accent colour. Their latest message is marked **Latest**. Quoted history is folded under **Show earlier quoted text**.
     - **Email 1 / Email 2 / Email 3:** our cold emails usually live only inside the prospect's quoted text; HQ pulls them out and labels each from the campaign's own step copy (Campaigns table, every version and spintax, matched by wording). When the copy can't be matched, they are numbered by the order they were sent (the page says so). Times in quoted headers carry no time zone, so they can be a few hours off.
     - **Echo's draft is the last box** (dashed border, "Not sent"), with the same **Send / Send edited / Skip reply** buttons as before; nothing about what they do changed.
     - **AI replier panel** on every thread: the mode for that client (**Off**: Enabled off or the client answers its own replies; **Draft only**: the engine reply sender is not live, so Send does not send yet; **Approval**: every draft waits for Josh or Alex; **Approval + some auto**: the client's own settings let some replies send by themselves inside office hours), the calendar state, and **Replier settings** (opens `#/clients/<id>/replier`). The Inbox header has **Replier settings** too: a menu of every client, or the one client you filtered to.
     - **Old drafts with a link** (filter on To approve, `#/inbox/links`): read only list of pending drafts that offer a booking link and fewer than two specific times, per client. Each shows the link, whether the calendar gave Echo no times when it drafted, whether the prospect asked for a link, and whether it needs a fact. **Have Echo redo it** (one, or **Have Echo redo all**) puts a task on Echo's list (Team → Echo, key `echo-redo:<record>`, with the engine job behind it) and queues Echo's normal drafting stage for that one thread with `{ redo }` (`sean.draft` for replies, `sean.followup` for follow-ups). Echo drafts it again with two open times from the client's calendar; the new draft replaces the old one on the same row and the same Decisions card. **A redo never sends and never auto-sends**, even for a client on Autopilot. It is a dry run until that stage is in `LIVE_STAGES`. A reply someone already answered by hand (Last Email Sent By Dulcy) is not redone: skip it instead. When Echo now thinks no reply is needed, the old draft is left as it was and the task says why.
     - **Echo live** (top of Inbox, read only, refreshes every minute): what Echo did in the last hour from its own run log (drafts written, needs your input, no reply needed, left to the client, redone), how many drafts wait for approval and the oldest, and Echo's last runs. "What Echo did" lists each one; tap to open the thread.
     - Members (Josh) see all of it and may ask Echo for a redo; no money is shown anywhere in the Inbox.
   - **AI replier** (client page → AI replier): the client's Reply Agent settings row in plain words, in six groups: **Sending mode** (on/off, who replies, send mode, minimum confidence %, max automatic replies, out-of-office replies), **Reply types** (which types get a draft, which always need a person, the "not interested" courtesy reply; routing groups read only), **Voice** (tone, length, name, company, website, your instructions), **Hours** (timezone, office start/end, weekends, US holidays), **Follow-ups** (the plan and CC/BCC read only; the follow-up instructions), **Calendar** (status, the booking link as a last resort, and **Get calendar link**).
     - Only you (owner) can change it; members see it read only. Save sends only what changed, checks it (times as HH:MM, a real IANA timezone, percent 0-100, known reply types, https links) and writes those fields to Airtable. Every save is logged (who, when, from → to) under **Changes** (table `hq_settings_log`).
     - Notes on top say what is off (Problem → Data → Fix), e.g. "Echo can't offer two times · times are switched off and the calendar is not connected · get the calendar link".
     - **Get calendar link** asks the calendar service for a one-time "connect your calendar" link for the client's email (Google Calendar or Calendly). You get **Copy** and **Email to client** (your mail app opens with "Connect your calendar so we can offer your prospects two real times: <link>"). HQ never sends email. It needs `CALENDAR_ADMIN_TOKEN` in the server `.env` (a calendar-service token allowed to call `/calendar/admin/request-invite`; the service's inviter token is enough). Without it the button is off and says so.

8. **Campaigns** (Step 3, 2026-11-25; after Inbox in the sidebar, the megaphone at the top on the phone). Alex: Airtable has too many campaign screens. Here what needs action comes first; everything else is one tap deeper. It replaces Campaign Center, Lead List Center and the email statistics screens for **looking**; their buttons stay in Airtable. **HQ changes nothing here** (no Airtable, n8n, Make or EmailBison write).
   - **Channel switch:** Email, LinkedIn, AI caller. LinkedIn and AI caller say **Channel paused** and why (only cold email works right now), not empty charts.
   - **Needs action** (default): one line per campaign with the reason and the agent that owns it, worst first:
     - **Pause** (Atlas): bounce over 4%. **Watch** (Atlas): bounce over 2.5%.
     - **Failed**: a lead list step failed (Scout) or a build/launch failed (Riley), with the engine's message.
     - **Stuck**: a campaign being built with no stage change in 3 days (owner = the step it is on: list → Scout, copy → Scribe, client review / launch → Atlas), or client review past its auto-approve time. "Stage change" = the latest of Status Last Modified, Client Review Submitted At, the Started/Completed/Updated times, the lead list's processing times, the engine's last job on the campaign or its lead list, and its campaign plan.
     - **Plan next** (Atlas): 60%+ sent and no next campaign plan.
     - **Client review** (Atlas): copy waiting for the client, with the date it was sent and when it auto-approves.
     - **Low interest** (Atlas): under 60% of the agency's interested-per-email rate, judged on 500+ sent (Alex's SOP numbers, the same as Atlas's campaign planning). The line shows both numbers per 1,000 sent.
   - **All live** (Campaign Status Active): leads used, sent, bounce, interested per 1,000, booked. **Building** (any other status except Completed / Inactive): the step it is on, when it last changed, who owns it. Drafts untouched for 30+ days are left out (a data note counts them).
   - **Pipeline:** one row of steps per campaign: List → Copy → Client review → Launch → Live → 60% → Next. From the fields the engine uses: Lead List Stage + QA (Ready/Uploaded and QA Passed = done), Workflow Stage, the approval fields (Approval Source, Client Approval Exception, Approval Decision), Campaign Status, Progress and the campaign plans. An Active campaign counts every step before Live as done.
   - **Client chips** filter everything; the Twenty West pair (and Dulcy + Dulcy Free Campaigns) count as one client, like Clients.
   - **Data notes on top** (Problem → Data → Fix, for Atlas to fix in Airtable): Active campaigns named "DRAFT", campaigns with no client link, Active campaigns for an inactive client, stage and status that disagree, drafts untouched for 30+ days.
   - **Tap a campaign:** the reasons, the steps, sent / replies / interested / booked / bounce % / leads used, its lead list, the engine (campaign plan, next plan, engine message), the **Stage history** (the engine's jobs on the campaign, its parts and lead lists, and its campaign plan states) and the **Activity log** (rows linked to the campaign or its lead list, newest first, details on tap). Buttons: **Open in Airtable** and **EmailBison** only (no HQ-safe campaign action exists yet, so none is invented).
   - **Speed and cost:** Campaigns + their lead lists + Workspace IDs are read in batches once a minute for everyone (refresh re-reads after 10 seconds). The Activity log reads the newest 500 log rows (shared) plus the campaign's own rows by name, each kept a minute. No money is read; members see the same screens without Ledger/Sienna log rows.
   - A split campaign's "- Direct Emails" / "- Generic Emails" records show as separate rows (each is its own EmailBison campaign with its own bounce).

9. **Deliverability** (2026-11-25): your inboxes and domains in one place. It replaces the Airtable Spam Center, Email Account Center, Domain & Inbox Inventory, Email Accounts / Warm Up, Inbox Placement Tests and Buy Domains & Inboxes screens. **Only what's sick shows first; the rest is one tap deeper.** In the sidebar after Campaigns; on the phone it's the envelope icon at the top. HQ only reads here: it changes nothing in Airtable, n8n, Make, EmailBison or EmailGuard and buys nothing. Buttons open the Decisions pile or the Airtable record.
   - **Four tabs:** Needs attention (default), All inboxes, Placement tests, Domains. The client chips filter every tab (the two Twenty West records count as one client). Inactive clients (e.g. Lead Flo) are left out.
   - **Needs attention:**
     - 4 tiles: healthy / watch / sick / resting inboxes (tap one to see those inboxes), and the same 4 numbers per client.
     - Notes on top (Problem → Data → Fix → Why, with who owns it), e.g. the placement scores being late (below).
     - One line per problem: the inbox or domain, the reason, the owner (Atlas or Riley), and **what the engine is already doing**, read from its own fields and jobs, e.g. "Rested 11-24, retest Fri 12-04 · limit 0 (was 30)", "Replacement waiting for your OK in Decisions", "Health loop rests it on its next run", "Nothing automatic: reconnect it in EmailBison".
     - A domain problem (blacklisted, expiring) is one line for the domain, not one per inbox.
     - Sick and resting show; **Watch** is folded underneath.
   - **When is an inbox sick?**
     - Sick: placement under 60% (the rest line), disconnected (Riley), warm-up stopped for causing bounces, warm-up score under 50, bounce over 4% (100+ contacted), its domain blacklisted or expired, failed its retest (replacement), Manual Review, or marked Spam in Airtable.
     - Watch: placement 60-74%, warm-up off or paused, warm-up score 50-69 (new campaigns need 70+), bounce over 2.5%, domain expiring within 30 days, a failed blacklist check or EmailGuard error (Riley), a health-loop error (Riley).
     - Resting: the health loop or the bounce agent rested it (Spam Protocol Stage "Resting 7 Days"). While it rests, its bad score or bounce doesn't count as sick (the rest is the fix); a disconnect or a blacklist still does.
     - The 60% / 4% / 2.5% lines are your rules. The watch lines (75%, 70, 30 days) are HQ's display choices, taken from the Airtable screens it replaces; say if you want them changed.
   - **All inboxes:** search (inbox, domain or client), status chips, grouped by domain, worst first. Each inbox shows placement, warm-up, bounce and daily limit, and the Airtable link.
   - **Placement tests:** the newest test per client and domain (the worst inbox is the domain's score; tap a domain for each inbox and Google / Outlook), and how fresh the scores are:
     - **Late scores warning:** red when the newest score is more than 7 days old, or when Friday's scores are still missing on Sunday; amber before Friday while no scores came in since the 11-25 audit (it found the n8n Inbox Placement "Check Results" workflow `xcteI9ofNLOqC0GO` no longer visible, and the health loop only reads tests from 11-26, so it needs Friday 11-27's). It goes away by itself when new scores land.
   - **Domains:** per client: each domain's inbox count (marked when not 2: every domain has 2 accounts), expiry, blacklist; replacements waiting (the Decide button opens Decisions → Campaigns) and open Buy Domains & Inboxes requests (Airtable link). Data gaps are noted on top (domains without a renewal date, inboxes without a Domains record, domains without 2 inboxes).
   - **Speed and cost:** one batched Airtable read for everyone (7 list calls plus the pending decisions, no per-row calls), kept 1 minute; placement tests (about 1,000 a week, last 21 days) are kept 10 minutes. Refresh re-reads after 10 seconds. Login passwords and money are never read.
   - Members (Josh) see it too.

### HQ Campaigns, round 5 (2026-11-28 evening)
Where this differs from the sections below, this wins.
- **Dulcy and Dulcy Free Campaigns are two clients** (EmailBison workspace 2 and 41; RULES.md 2026-11-28). Free Campaigns = free campaigns for prospects (e.g. Chop Shop), with 20 of Alex's inboxes. HQ never merges them: client lists (Clients, the campaign client picker, Lead lists), sender and capacity counts (the Sender accounts box), Deliverability per-client numbers, results per client and the client portal all count them apart. A Client link between the two records in Airtable is ignored on purpose. On Clients, Free Campaigns shows as "Free campaigns" (not billed, no money block). The Twenty West pair ("Twenty West Media" + "(Internal)") still counts once: that one is one client with two records.
- **The campaign header** is big and clear: the name as a large title; client and status as large pills (Active green; amber or red with a bounce flag); started / ended dates; the key numbers (Sent, Replies, Interested, Meetings, Bounce, Leads used) in large tiles, 2 across on the phone and 6 on a computer; the buttons in one tidy row under a line.
- **Past:** Show → "Past (finished)" lists Completed and Inactive campaigns that sent emails, newest ended first, with their final numbers (sent, leads, replies, interested, meetings, bounce, interested per 1,000). Read only: no buttons. It follows the client picker.
- **Atlas's take** (top of Overview): 2-3 sentences on how the campaign is doing, written by rules from its own numbers (Airtable, synced from EmailBison) against the agency average (campaigns with 500+ sent). It adds Atlas's own words only from what he stored: his campaign plan (why he picked the move) or his newest Activity Log note on the campaign (last 14 days). No AI call, nothing invented; a line under it says what it was built from.

### HQ Campaigns, round 4 (2026-11-28)
Where this differs from the sections below, this wins.
- **Sender accounts box = the Airtable Campaign Center's sender chips**, same names and order: Available, Sending, Releasing Soon, Reserved Next, Disconnected, Warming, then total senders. Sending = in a live campaign under 60% sent; Releasing Soon = only in live campaigns at 60%+; Reserved Next = in a built / launch-ready (not live) campaign; Warming = warm-up started under 14 days ago (a label of its own: it can overlap Sending or Reserved Next, as in Airtable); Available = the rest (connected). Spam / replace and at risk are not in this box (they are on Deliverability); a resting inbox says "resting (spam protocol)" in its row. Not ported from Airtable: reserving a top-up's inboxes while its upload is pending.
- **A campaign** is one compact card: name, client, status, the numbers in one strip, one small row of buttons (tap a grey one to see why it is off; Pause acts at once, every other button asks once), and the engine's answer in one line. Tabs: Overview, Copy, Lead list, Senders, Plan (Atlas's plan + strategy), History.
- **Copy:** each email looks like an email: subject (a thread reply shows "Re: <email 1 subject>"), body, then the signature and P.S. the build adds ("--", a rotating sign-off, {SENDER_FULL_NAME}, "<Sender Title>, <Brand Name>" from the client's Workspace IDs record; nothing is added when the body already has its own). Scribe's "Variant 1 / 2 / 3" become Version tabs. Variables show as `{FIRST_NAME}` (Airtable's Markdown escape `{FIRST\_NAME}` is removed); spintax shows its first option, hover for the others. "Show what EmailBison gets" opens the spintax sequence fields.
- **Senders:** every inbox has a placement cell: the score, its date when the inbox was not in the client's latest test ("80% · 11/20"), or "Not tested" with why. Why some inboxes have no fresh score: the weekly test does not cover every inbox (11/27: 947 of 1,100 active inboxes; 151 of Dulcy's 380 were left out); HQ keeps the newest score from the last 21 days.

### HQ Campaign Center + Lead List Center: full parity (2026-11-28)
Where this differs from the Round 2 section below, this wins. Alex: "make sure the full implementation of the campaign and lead list center". HQ now does what the two Airtable screens do; the item-by-item audit (84 rows: 33 had, 40 built, 6 partly, 3 missing, 2 left out on purpose) is `hq/center-parity-2026-11-28.md`.

**Campaign page tabs:** Overview · Copy · Sequence · Settings · Lead list · Senders · Variants · Plan · History · More (the round 5 header is unchanged).
- **Copy:** edit the review copy (Email 1-4 subject + body, thread reply 2-4; split tests with "Variant 1 / Variant 2" lines) and the **Approval** panel: Send for client approval (Client Review, auto-approves after 48 weekday hours), Mark changes requested, Approve + prepare sequence (once the client said Approve Campaign), Skip approval + prepare (the exception, with a tick).
- **Sequence:** the final sequence EmailBison gets (4 emails x variants A-J), Refresh from approved copy (the screen's Variant parser and its errors), Generate spintax (the Airtable spintax automation: create_spintax + the automation request, Workflow Stage = Spintax in Progress), add / delete a variant (never A).
- **Settings:** sending days, max emails / new leads per day, start / end time, time zone, start / end date, days between emails, plain text, Skip bounce notification, Skip bounce pause.
- **Senders:** Pick sending inboxes (only the client's own; an inbox busy in another campaign is a warning only), Select all free, Unselect all, Save; then Update senders (engine) if the campaign is built. Sync EmailBison senders (n8n).
- **Plan:** campaign name, approach, prep and launch dates, thesis, link or change the lead list (same client only), the client-wide pivots (new vertical, new offer).
- **Variants:** sequence performance per step and variant (Sequence Analytics), the leader by interested / replies.
- **More:** Top up · Create lead list (copies the targeting, excludes the attached lists' contacts, reuses an unfinished one; the KPI exception tick when interested is under 15% of replies), Clone (Draft copy, no list or inboxes), Clear saved status, Delete (type DELETE: Bison Action = Delete for the Airtable automation, which deletes EmailBison first, then the record; HQ never deletes itself).
- **Campaigns header:** New campaign (Atlas plans it, as before), **By hand** (the Airtable New Campaign form: a Draft campaign + its lead list, nothing runs), **Sync with EmailBison** (the full sync relay). **Lead lists:** **New lead list** (a Draft DiscoLike list on the engine).

**Lead list page, per tab:** Overview: name, Google Sheet link, link to a campaign, EmailBison list ID, email provider breakdown, Clear saved status. Source & ICP: targeting sentence, employee range, Use campaign thesis, the exact DiscoLike filters JSON. Company Review: sample size, usable company target, DiscoGen deep review (tick, prompt, extra requirements, results link). Contact Review: persona, contact sample size, contact filters JSON (people per company, seniority, countries / states). Verification: include generic / direct, LeadMagic recovery tick, email security gateway rule and providers, generic footprint. Enrichment: custom variables. QA: the check results and the manual QA status (the screen's gate: Passed only once the list reached QA and its workflow finished; it moves the list to Ready).

**How it works:** every Save and button writes exactly what the Airtable screen writes (`engine/src/hq/centerParity.ts`); engine stages stay on the engine buttons. You only (members see the same tabs read only); confirm on every write; a record with a step running refuses edits; each write logged (`hq_settings_log`, `center:<action>`).
**Server settings:** `BISON_SENDER_SYNC_WEBHOOK_URL` = the n8n sender-sync webhook (secret path; until set, the button says so and sends nothing). `BISON_SYNC_WEBHOOK_URL` overrides the sync relay (default: the relay the Campaign Center calls).
**Still in Airtable:** Delete lead list (waiting for your decision: the Airtable button deletes the record with no backup), third-party domain lists (file upload), "Use recommended" inbox count, the point-and-click filter and contact pickers (the JSON editors cover every key).

### HQ Campaign Center + Lead List Center (Round 2, 2026-11-27)
Where this differs from the Batch 3 section below, this wins. HQ → Campaigns is now the Airtable Campaign Center and Lead List Center, with their buttons.

**Campaign Center** (Campaigns → Campaigns)
- **New campaign** (top right, you only): pick an active client → Atlas plans the next campaign (the same campaign plan his 60% / new-client trigger makes, see "Campaign creation, part 1"). Before your OK it spends 1 AI call + about $2 of DiscoLike (filters + first 100 companies). Needs `ATLAS_CAMPAIGNS=on`; one plan being made per client at a time.
- **Sending accounts** box per client (or all active clients): Sending now (in an Active campaign), Ready next (in a built, not launched campaign), Free to use (Atlas's free-inbox rule), Warming (warm-up score 50-69), At risk, Resting, Spam / replace, Not connected. Tap a number for those inboxes (cold and warm-up limits, warm-up score, placement, sent, bounce, campaign). Daily capacity = cold limits of every inbox that can send, vs used by live campaigns. "Nothing is sending for X" shows when a client has no inbox sending. All clients: one line per client, the ones with nothing sending first.
- **New campaigns being made**: each open plan with its step, the move, questions for you, and its buttons: Approve plan / Stop plan (approval 1), Find all contacts anyway (low contact sample), Approve copy + list / Reject copy (approval 2), Rewrite copy with notes. Approvals answer the plan's own Decisions card (same as the Decisions screen); a rewrite is `campaign-copy`.
- **Campaigns by stage**, as in Airtable: Live, Launch ready, Approved (spintax and build), Client review, Internal review, Strategy draft, No stage. Each row: status, progress (or the step now), sent, replies, interested, meetings, bounce, sending inboxes. Test campaigns (by name) hidden unless "Show tests". From Today, `#/campaigns/live?how=well|pace|time|look` shows only that group.
- **A campaign** (tap it): Build campaign, Launch, Pause, Update senders, Top up; Automation status (the engine's answer, refreshed every 15 s while a step runs); tabs Overview, Strategy, Copy (the review copy, approval and client feedback, Scribe's notes, claims and flags, the sequence fields), Lead list (opens it), Senders, History.

**Lead List Center** (Campaigns → Lead lists): newest first. Test lists (name says test) and lists finished 60+ days ago are hidden unless ticked. Tap a list: next step, Automation status, tabs Overview, Source & ICP, Company Review, Contact Review, Verification, Enrichment, QA, each with its buttons: Generate filters, Check TAM (free), Run company sample, Approve company sample, Expand companies, Restart companies, Find contacts (sample), Approve contact sample, Find all contacts, Verify, Recover with LeadMagic, Prepare enrichment prompt, Run enrichment, Skip enrichment, Run automated QA. Build Campaign is on the campaign.

**How the buttons work:** each press writes exactly what the Airtable button writes (Runs on Engine + Engine Action, or the screen's approval tick, or the TAM request) and nothing else; the engine picks it up within ~30 seconds and runs every check. Every press shows what it does and spends, then needs Confirm. You only (Josh sees them disabled). A list or campaign with a step running refuses another press. Dry run until the stage is in LIVE_STAGES (the sheet says so). Each press is logged (hq_settings_log, action `center:<button>`).
**Comes next:** built 2026-11-28 (see "full parity" above).

### HQ Campaigns + Deliverability (Batch 3, Alex's walkthrough 2026-11-27)
Where this differs from the two sections above, this wins.

**Campaigns**
- Laid out like the Airtable **Campaign Center**: each row = campaign name, client, stage (e.g. Strategy Draft) and approach, status, **sending accounts** ("6 inboxes · 1 warm-up off · 1 at risk", from Deliverability), progress, sent, replies, interested, booked, bounce. Phone: one card per campaign.
- **Filters are dropdowns:** the shared client dropdown (active clients only, remembered; no Lucky DMs / Lead Flo), a Show dropdown (Needs action, Live, Building, All) and a search box.
- **Channel tabs:** Email, LinkedIn, AI caller, **Direct mail** ("not running yet").
- **Lead lists** (next to Campaigns, = the Lead List Center): every list being built, failed, or done in the last 60 days, per client: stage (step x of 11), companies / direct / generic / leads, who found and who verified the emails, linked campaigns. A list a client bought **without a campaign** shows as **List only**. Read only: building still runs through the Lead List Center buttons and the engine.
- **Pipeline** is folded into the rows: a building campaign shows its step bar (List → Copy → Review → Launch → Live → 60% → Next).
- **Tap a campaign:** Strategy (approach, planned launch, thesis), **Sending accounts** (each inbox with its status, limits and warm-up, worst first), stats, lead list, engine, history, Activity log. The only outside link is **Open in EmailBison**. No "Open in Airtable" anywhere.

**Deliverability**
- **Status names:** Healthy, At risk, Spam, Resting (no more Watch / Sick). **Warm-up OFF** on any inbox is a red flag, listed first in red.
- **Tabs:** Needs attention, All inboxes, Bounces, Verification, Placement tests, Domains. The client dropdown filters all of them.
- **Agent notes** at the top (e.g. "Friday's placement scores may not arrive") have **Have Riley fix it / I'll look** (the shared Fix it button: it puts the note on that agent's task list).
- **Inboxes per client** (under Needs attention) now says what it is: how many of each client's inboxes are in each status.
- **All inboxes:** columns cold emails per day, warm-up per day, warm-up placement (EmailBison's warm-up score), warm-up on/off, newest placement test, bounce. Search stays; the status filter is a dropdown. No Airtable links.
- **Domains:** renewal date; when Airtable has none, 1 year from the date added, marked "estimated". The blacklist cell says Clean / Listed (n) / Check failed / Checking / Not checked (with why, e.g. "Not added to EmailGuard monitoring yet"). Domains with no inbox are hidden.
- **Bounces** (the Spam Center charts, back): bounce codes, where bounces land (Google / Microsoft / security gateway / custom mail server; from the row's mail provider, else the bounce agent's MX lookup, at most 150 new domains per read, cached a day), what kind (address not found / blocked / mailbox full), hard vs soft, by campaign, by sending inbox. Filters: client, campaign, sending inbox, period (7 / 30 / 90 days). On top, **one conclusion**, e.g. "Most bounces are 5.1.1 'address not found' on custom mail servers → stop sending to custom mail servers and re-verify the list". Source: Emails rows with Lead Status Bounced (up to 5,000), kept 10 minutes.
- **Verification** (the old n8n job, which ran every minute forever, is replaced by an on-demand read kept 10 minutes): per campaign and verifier (each lead list's Direct / Generic verifier, or the bounced row's own tag), emails, contacted (from the old n8n cohorts when there, else estimated from the list mix), bounces and how many were "address not found". Mostly "address not found" on 10+ bounces with bounce over 2.5% = **verification problem** → re-verify before the next send.

**Edit inbox limits from HQ (owner only)**
- All inboxes → **Edit** on an inbox, or **Edit all <client> inboxes** with a client picked: cold emails per day and/or warm-up per day (0-50; empty = keep). Tick "I confirm" and Save.
- The engine job `inbox.limits` makes the same two EmailBison calls n8n's Bulk Controls flow makes (`PATCH /api/sender-emails/daily-limits/bulk`, `PATCH /api/warmup/sender-emails/update-daily-warmup-limits`), one call per workspace and value, in the inbox's own workspace, each with a receipt first (never written twice). Live runs then copy the new numbers onto Email Accounts and write one Activity Log row.
- Left alone: resting inboxes keep 0 cold until their retest (warm-up can still change), inboxes waiting for a replacement, inboxes with no Email ID in Airtable, and inboxes already at that number. The answer lists them.
- **Dry run until you switch it on:** add `inbox.limits` to `LIVE_STAGES` on the server (with `DRY_RUN` still true) and restart. Until then every save is a dry run: HQ shows "Dry run queued", nothing changes in EmailBison. Recent changes (dry and live) are listed under All inboxes.
- The request must carry `confirm: true` (the tick); members (Josh) get 403.

**New client ramp (RULES.md 2026-11-27)**
- 5 cold / 10 warm-up per day → after 1 week of sending 10 / 20 → after another week 15 / 30 (the cap).
- Atlas's daily check (`atlas.ramp`, once a day while HQ is on) looks at each active client whose first send was in the last 42 days (first send = its first live launch job, else when a sending campaign went Active). An inbox moves one step when the client has sent 7 days per step and the inbox's limits were not changed in the last 7 days; resting, replaced or custom-limit inboxes are skipped.
- Each step is **proposed**, never applied: an Atlas task "Ramp <client>: N inboxes to 10 cold / 20 warm-up", waiting for you, and a **New client ramp** card on Needs attention and All inboxes with **Apply**. Apply uses the same limit edit (confirm tick, dry run until `inbox.limits` is live). The task closes when the step is applied live, or when it is no longer due.

### HQ Deliverability, rounds 2 and 3 (Alex, 2026-11-27 evening)
- **Warm-up off is not always a problem.** When the spam protocol took an inbox out (Resting 7 Days, Status Resting, a 0 limit with the old limit saved, waiting for a replacement, Manual Review / Status Spam) or EmailBison paused it for bounces, warm-up off is **expected**: All inboxes shows "off (resting)" in grey. Only warm-up off **for no known reason** is the red flag (shown first, counted in the menu badge and phone pings). Atlas says it in one line on Needs attention, e.g. "Warm-up is off on 151 inboxes. 140 resting (spam protocol), 5 waiting for a replacement: expected. 6 off for no known reason: turn them back on." with **Have Atlas fix it**.
- **Bulk limit edits (owner only).** All inboxes → **Bulk edit limits** → tick inboxes (or a whole domain) or press **All N shown** (the client and status dropdowns and the search decide what is shown: per client, by status, or everything) → cold/day and/or warm-up/day → **Preview** (how many change, what is left alone and why; nothing changes) → tick "I confirm" → **Apply**. One engine job `inbox.limits` for all of them: the same EmailBison bulk calls as n8n Bulk Controls, at most 100 inboxes per call, a receipt per call (never written twice), the Email Accounts mirror 10 records per Airtable call, one Activity Log row. Up to 3,000 inboxes per edit. Per-inbox Edit is still there. **To make it live:** add `inbox.limits` to `LIVE_STAGES` in the server `.env` (keep the stages already there, comma-separated) and restart; until then every Apply is a dry run.
- **Bounce codes** are the SMTP codes (550, 551, 552, 553, 554, 421, 450, 451, 452…) with a plain meaning; the 5.x.x / 4.x.x code is the small detail under each (e.g. "550 hard Address does not exist · 5.1.1 ×30 · 5.7.1 ×10"). **Soft = any 4xx, hard = 5xx** (the code decides, the Bounce Type field only when there is no code). The conclusion line ("…→ a verification problem…") stays on top.
- **Verification:** see round 4 below (there is no "Other" any more).
- **Small stats row** on Bounces: sent (the campaigns sending in the period), replies, interested, meetings (in the period, from the Emails rows), bounces, and the campaign's bounce rate when one campaign is picked.
- **Placement tests** like the old Airtable screen: one row per test date (11/27, 11/20…) with inboxes tested and how many scored 0-24, 25-49, 50-74, 75-100, with a bar. The header says "Last test 11/27 · Next test 12/4" (round 4: no weekday) (once Friday's scores are in, the next test is the following Friday).
- **Dates use slashes** everywhere on this screen (11/27; 3/10/2027 with the year).
- **Domains:** a card counts the domains with no real renewal date, with **Atlas's task** "Fill the renewal date on N domains" (made and closed by Atlas's daily `atlas.ramp` check; or press Have Atlas fix it). Real dates come from **Cheap Inboxes** when connected (below), else "estimated" (1 year from the date added).
- **Monthly cost (owner only):** domains, inboxes and the monthly inbox cost at the top and per client: inboxes × the Cheap Inboxes price, else **$2.50 per inbox** (RULES "Inbox cost"). Also `GET /hq/api/deliverability/costs` (owner only), for net profit per client on Clients later.
- **Buy (owner only):** Domains → **Buy domains + inboxes** → **Buy**: client, number of domains (2 inboxes each), Google or Microsoft, .com → saves the SAME Domain Purchase Requests record the Airtable Buy screen uses, Status **Draft** (nothing runs, nothing is bought). Then **Get quote** (Status Generate Domains: n8n picks the names and asks Cheap Inboxes for the price, no charge) → when it says "Waiting for your OK" with "$X today", tick and **Approve $X** (ticks Approve Purchase for that exact quote; HQ refuses if the quote changed). The Airtable automation + n8n then buy in batches and add the domains and inboxes. Each step writes an Activity Log row. Members see the requests without prices and cannot act.
- **Cheap Inboxes connection (optional, read only):** set `CHEAPINBOXES_API_KEY` in the server `.env` and restart. HQ reads `GET /domains` and `GET /mailboxes` on `https://api.cheapinboxes.com/v1` (never orders), kept 6 hours. UNKNOWN until tried with the real key: their header name and field names. Default header is `Authorization: Bearer <key>`; if their API wants another header, also set `CHEAPINBOXES_AUTH_HEADER` (e.g. `X-API-Key`). If the read fails, the Domains card says why and HQ keeps the estimate. Code: `engine/src/providers/cheapInboxes.ts`.

### HQ Deliverability, round 4 (Alex, 2026-11-28)
- **One line and one button instead of a long list.** Needs attention says e.g. "37 accounts have warm-up off unexpectedly" with **Have Atlas fix it** (the task's brief lists every account, with "disconnected" where it must be reconnected first). Inboxes and domains in spam: "12 inboxes and 1 domain in spam" with Have Atlas fix it (and Have Riley fix it for disconnected ones). Resting: one line, nothing to do. The accounts are behind **Show accounts**. Warm-up off that the spam protocol expects (resting, replacing, spam review, paused by EmailBison) is never counted. Pressing it only puts a task on the agent's list; buying still waits for your OK.
- **Verification never says "Other".** Who verified a list: its Direct / Generic Verification Provider, else the engine's route ("Generic → MillionVerifier · Direct → LeadMagic", "MV-first v2") or its MillionVerifier Job ID (= MillionVerifier), else the list-level Verification Provider, else **Not recorded**. **Client verified** = a campaign or list the client verified themselves: Airtable has no field for it, so put "client verified" in the campaign or lead list name (e.g. "[Isles] Boutiques (client verified)").
- **Verification loads faster:** it no longer waits for the Bounces tab's replies / campaign counters (two big reads), the lead lists are one read instead of up to 10, the bounced rows are shared with the Bounces tab, and opening Deliverability starts the Verification read in the background (kept 10 minutes).
- **Placement:** "11/27 run: 249 scored · 149 waiting for EmailGuard" (waiting = tests started but not scored yet, from the Tests table of the Inbox Placement Tests base, Status Pending with a Test ID, read only, kept 10 minutes). If the server's Airtable token cannot read that base, only the scored count shows (no error). Dates have no weekday ("Next test 12/4").
- **Cost note:** "Inboxes at $2.50 a month."

10. **Content** (2026-11-26; you only). The Airtable Content Center (Content OS → Content Center) as one simple area, with the same steps, field names and order, only simpler. You record every **Friday morning**: main channel 2 videos a week (Sienna proposes 4 ideas), Alex Woung Raw 5 a week (8 ideas). The targets come from Content Automation Settings → Videos Per Week. In the sidebar after Deliverability; on the phone it's the **Content card on Today** (no extra icon at the top). Members (Josh) never see it: the server answers 403.
   - **Layout (Batch 5, 2026-11-27):** five tabs that follow the Airtable Content Center: **Needs you**, **Content**, **Calendar**, **Friday**, **This week**. No "Open in Airtable" links any more. The one link left is **Approve in the Content Center** on final clips, because that approve runs an owner check HQ can't do yet.
     - **Content** = the Content Center's main view. Search, a channel dropdown (remembered on this device), a stage dropdown with counts, and "Show finished videos". Items are in the Content Center's order (earliest record or publish date first, undated last) with its own 10 stages: Idea, Script, Record, Edit, Finalize, Thumbnail, Upload, Clips, Distribute, Published. Tap an item for its page, the same blocks in the same order: stage and title, **Next step** (who and how; Approve / Reject right there for an idea), **Schedule** (idea review, score, record and publish dates), **Video** (script, recording folder, finished video, on YouTube), **Repurposing** (short-clips project, clips, post drafts), **Latest update / Needs attention**, and **Details** (production stage, statuses, editing route, idea source). On the phone the list and the item are two screens; from a tablet up they sit side by side. "Finished" = posted with proof and distribution done (HQ does not read the Content Distribution rows the Content Center also checks).
     - **Calendar** = the Content Center's recording and publishing calendar: purple = record, green = publish. Month grid from a tablet up, a list of days on the phone. Dropdowns for date kind and channel; items with no date are listed below. Ideas still waiting for you and finished videos are left out, like the Content Center.
     - **Data problems** now read Problem → Decision (with the owner) → what supports it; "why it matters" is one tap deeper.
   - **Round 4 (Alex, 2026-11-28):**
     - **"This week" tab removed.** The data problems are one line at the top of Needs you; open it for the list and one **Have Sienna fix it** button.
     - **Real channel names everywhere:** "Alex Woung" and "Alex Woung Raw" (never "Main" / "Raw"). The channel filter is **Both / Alex Woung / Alex Woung Raw**.
     - **Ideas to approve:** one closed dropdown per channel with its count; open one to approve or reject.
     - **Dates with slashes, no weekday** (11/27).
     - **Posted date:** a video on YouTube shows the day it was posted: YouTube Published At, else Publish Date, else the date YouTube gives in the channel's public feed (youtube.com/feeds/videos.xml; at most 2 reads, cached 1 hour, read-only). On the calendar it is a grey "Posted" chip, never under "No date yet". A data problem "Posted, but no posted date saved" asks Sienna to save the Publish Date.
     - **Each video's page:** one **Next step** box at the top (what happens next, where it happens, the one button), then **Script, hooks and Gamma outline** (Open script / Copy script / Copy outline), then **All steps** in order, each done / next / later with where it runs: *In HQ* (approve), *Sienna, automatic* (script by the next half hour; **Ask Sienna now** puts a task on her list, nothing is written to Airtable), *Content Center button* (Set up Frame.io, Sync Frame.io, Edit full video, Generate thumbnail, Prepare YouTube details, Create short clips, Generate posts: HQ can't press these yet, the button opens the Content Center), *By hand* (record and upload to the Frame.io Raw folder; post in YouTube Studio), or *Not automated yet* (the Gamma doc: copy Sienna's outline into Gamma and paste the link into the video's Notes).
   - **Round 5 (Alex, 2026-11-28: "I don't want what's in Airtable to stay in Airtable"):** the Content Center lives in HQ now.
     - **Every button on the video's page** (Next step box and All steps): Set up Frame.io, Sync Frame.io, Use OpusClip / Use DaVinci Resolve, Edit full video, Generate script, Generate thumbnail, Approve thumbnail, Request changes, Prepare YouTube details, Save the YouTube link, Create short clips, Check clip status, Choose where the posts go, Generate posts, Retry the posts. Each does what the Content Center's button does, the same way:
       | HQ button | What it does (same as the Content Center) |
       |---|---|
       | Set up Frame.io, Sync Frame.io | Content Automation Action "Sync Frame.io" → Airtable automation "Content OS Action Script" → n8n Frame.io Sync |
       | Edit full video, Create short clips | Content Automation Action "Submit to OpusClip" → n8n OpusClip Submit and Refresh (short clips only after the job identity check) |
       | Check clip status | Content Automation Action "Refresh Opus Clips" |
       | Generate posts | Content Automation Action "Generate Distribution Pack" → n8n Generate Distribution Pack |
       | Choose where the posts go | Requested Clip Count, Minimum Clip Score, Distribution Channels (then "Generate Distribution Pack" when clips exist) |
       | Use OpusClip / Use DaVinci Resolve | Editing Route "OpusClip" / "Manual Editor" |
       | Generate script | n8n webhook "[Content OS] Generate Teleprompter Script", body `{recordId, action: "Generate Script"}` |
       | Generate thumbnail | n8n "[Content OS] Generate Thumbnail", `{recordId, action: "Generate Thumbnail"}` |
       | Request changes (thumbnail) | n8n "[Content OS] Revise Thumbnail", `{recordId, action, changes, requestId, expectedThumbnailUrl}` (must answer 202 with the same request id) |
       | Approve thumbnail | Thumbnail Status "Approved" |
       | Prepare YouTube details | n8n "[Content OS] Prepare YouTube Details", `{recordId, action}`; if n8n answers with an error, the Content Center's own channel template |
       | Save the YouTube link | YouTube URL |
       | Retry the posts | n8n "[Content OS] Generate Distribution Pack", `{recordId, action}` (only while that run is stuck) |
       The same guards as the Content Center: nothing runs while another automation is in the field ("Running: Sync Frame.io" shows on the video), only approved ideas, no thumbnail change once on YouTube. Every press is logged in `hq_content_log`.
     - **Distribution** (on the video's page, once it is on YouTube or has posts): one row per platform (Instagram, TikTok, YouTube Shorts, Reddit, X, LinkedIn, blog, newsletter, as the video has them), each with the generated post to read and copy, **Approve** / **Needs changes** (Approval Status "Approved" / "Rejected"), and **Record the post**: link, posted date, views, likes, comments. Totals at the top (posted, views, likes, comments). The stats are kept in HQ (`hq_content_posts`); the link also goes to the draft's Published URL with Publishing Status "Published", as the Content Center's "mark as published" writes it. TikTok has no draft in the Content OS: post the short by hand and record it here.
       - **Approve never schedules or posts.** For an approved Instagram / YouTube Shorts post you can pick a time and press **Schedule**: HQ saves Scheduled At and calls the Content Center's scheduling flow ("[Content OS] Schedule Approved Social Posts", `{distributionRecordId}`; OpusClip posts it at that time). Reddit, X, LinkedIn and TikTok are posted by hand. Approving a newsletter prepares its preview (nothing is sent); approving a blog makes an unpublished Framer draft, as in the Content Center.
     - **Friday** walks each idea step by step: **1 Hook** (pick the one you'll say), **2 Script** (with checks, titles, thumbnail idea, Gamma), **3 Teleprompter** (full screen, big text that scrolls by itself; Space starts / stops, arrows change speed, Esc closes; the hook you picked, then the script), **4 Upload** (Raw folder link and the Sync Frame.io button). Then **Next idea**.
     - **Still in the Content Center:** approving a final clip (its approve writes Review Intent JSON and n8n checks in Airtable that you wrote it; HQ's Airtable token can't prove that). Resources (Gamma) stay paused, as in the Content Center.
   - **Parity (Alex, 2026-11-28: "the entire content center" in HQ):** everything else the Content Center has is in HQ now. Full list, item by item: `hq/content-parity-2026-11-28.md` (88 items: 55 already there (clip review included: Final review below), 31 added, 2 left out by rule).
     - **Settings** (Content → wrench): the Content Center's "Content scheduling settings" per channel: videos per week, spacing, manual-review score, minimum clip score, clips per week (Alex Woung stays 2 a week, 2 days apart), Reset defaults, Save. Save writes both Content Automation Settings records at once, the same fields (Enabled ✓, Auto Schedule Score unchanged); a channel without a record refuses the save.
     - **Add content idea** (Needs you and Content): Title, notes (Description), channel; written with Idea Decision "Needs Review" and Content Source "Manual Idea", like the Content Center.
     - **On each video:** "Content for" (the channel; an idea needs it before Approve; ideas without one show in Needs you as "No channel yet"), the Recording and Publish date boxes (only once approved), Regenerate script, the YouTube boxes (title, description, chapters: Generate missing details, Save YouTube details), the previous thumbnail, the link to all clip candidates in OpusClip (the clips themselves are in **Final review**), the Content Center's distribution-complete check, and **Delete this content record** (two presses; only the Airtable record; Frame.io files, OpusClip projects, YouTube videos and posts are kept; logged).
     - **Distribution extras:** Reddit's community (r/…, the same pick as the Content Center) with Open r/… and Copy title, Open the X composer / LinkedIn, the newsletter's email preview and Copy HTML, and the Schedule box starts at the Content Center's suggested time.
     - **The repurposing score** now comes from Settings (the channel's Minimum Clip Score), as in the Content Center; it is no longer typed per video.
     - **History:** Content → "Show older and rejected items" (the Content Center's "Hide older and completed history" unticked).
     - **Routes (owner only, same-origin writes, each logged in `hq_content_log`):** `GET/POST /hq/api/content/settings`, `POST /hq/api/content/ideas`, `POST /hq/api/content/items/<rec>/channel | dates | youtube | delete`, `GET /hq/api/content?history=1`. Code: `engine/src/hq/contentCenter.ts`, web `hq/web/src/pages/content/ContentCenterParts.tsx`.
     - **Clip review** (Refresh current preview, Approve reviewed copy, Reject copy) is HQ's **Final review** (`contentReview.ts`, below): one clip UI, not two.
     - **Set up once (Riley):** the webhooks have no password, so their addresses are secret and not in the repo. Put each full URL on the server as `CONTENT_HOOK_SCRIPT`, `CONTENT_HOOK_THUMBNAIL`, `CONTENT_HOOK_THUMBNAIL_REVISE`, `CONTENT_HOOK_YOUTUBE`, `CONTENT_HOOK_DISTRIBUTION`, `CONTENT_HOOK_SCHEDULE`, `CONTENT_HOOK_NEWSLETTER`, `CONTENT_HOOK_FRAMER`, or set `N8N_API_KEY` (and `N8N_BASE_URL`) and HQ reads each path once from the workflow's webhook node (joined to `CONTENT_WEBHOOK_BASE`, default `https://n8n.dulcy.io`). A button whose webhook isn't set says so and sends nothing. The field buttons (Frame.io, OpusClip, posts) need nothing extra.
   - **Needs you** (default): only what needs you.
     - **Ideas to approve**, grouped Main / Raw, newest first, each with Sienna's hook, angle and "why now", and who proposed it (Sienna, or the n8n Reddit intake).
       - **Approve** writes exactly what the Content Center's "Approve & schedule" writes: Idea Decision "Approved", Production Stage "Idea Approved", and Recording Date + Publish Date from the same scheduling rule.
       - **Reject** writes exactly what "Reject idea" writes: Idea Decision "Rejected" and both dates cleared.
       - HQ reads the record fresh first. It refuses a duplicate, an idea already decided, and an idea with no channel.
     - **Final videos to check:** only clips Sienna's editor passed (Clip Status "Needs Review" and Editorial Review Notes "Sienna QA: passed …"), grouped by video, with **Watch** and **Review and approve** (opens the video's page). Clips Sienna hasn't checked yet are only counted.
     - **Final review on the video's page (2026-11-28):** the finished full video and each final clip, with **Approve** / **Request changes** (with a note).
       - A clip's buttons do what the Content Center's do: **Get the current copy** = "Refresh current preview", **Approve this copy** = "Approve reviewed copy", **Request changes** = "Reject copy" + your note as a task on Sienna's list. HQ writes the same Review Intent JSON (same keys, same order) and calls the same n8n webhook ("[Content OS] Current Clip Review and Preview", `1IWw0WOC8gwgWvnVZbeKf`; `CONTENT_HOOK_CLIP_REVIEW` or read from n8n) with the same body `{recordId}`. n8n verifies the copy and writes Clip Status; nothing is scheduled or posted.
       - n8n only accepts a Review Intent whose Airtable author (Review Intent Author) is Alex (`team@dulcy.io`). After each write HQ reads that author back: Alex → n8n is called. Someone else (the engine's Airtable key belongs to another login) → nothing is sent and the page says "HQ can't approve clips yet" until the n8n change is live: `CONTENT_REVIEW_SECRET` on the server (32+ characters) and in n8n, plus the code change in `engine/src/hq/contentReview.ts` (`N8N_REVIEW_PATCH`; HQ then adds `source:"hq"` and an HMAC of the exact intent, and n8n counts a valid one as Alex).
       - The full video has no approval in the Content Center: **Approve** is saved in HQ's log only; **Request changes** puts your note on Sienna's list.
     - **Slides and resource (2026-11-28):** Gamma's API needs a paid plan, so **Make the resource** turns Sienna's Gamma outline into a branded document (`#/content/items/<rec>/resource`, the style of Alex's PDFs: dark cover, cream pages, lime numbers). **Download PDF** = the browser's print window ("Save as PDF"; 16:9 pages, one slide per page); **Copy as text**. Nothing is saved. The **Gamma link** box saves a hand-made Gamma link in the video's Notes (the old link replaced, else a "**Gamma link:**" line), where "Open Gamma" reads it.
     - **Other steps waiting on you:** choose the editing route, approve the thumbnail, upload to YouTube, choose where the clips go, review the posts. Tap one to open the video's page in HQ.
     - A one-line link to the data problems (they are on This week).
     - **Changes from HQ:** every approve and reject (who, when, each field from → to). Table `hq_content_log`.
   - **Friday:** the approved ideas for this Friday, Main / Raw, in recording order (recording date, then publish date). "1/2" means 1 of 2 has a script. It shows **one idea per screen** in big type, with numbered dots, **Previous / Next** (← → on a computer), hooks, the script (Raw: talking points), "check before recording", title options, thumbnail idea and the Gamma outline. The Gamma link shows once a real Gamma doc exists; until then only the outline. It includes leftovers from the last two weeks ("From an earlier week").
   - **Pipeline** (replaced by **Content** in Batch 5; the old #/content/pipeline link opens Content; the 8-stage key below still drives the counts): each video's stage, Idea → Approved → Script ready → Recorded → Editing → Final review → Final approved → Posted, from Idea Decision, Production Stage, Status, Script, Thumbnail Status, YouTube URL / Publishing Status and the clips' Clip Status. Filter by channel; tap a stage tile to see only that stage. Tap a row to see the Content Center's **next step**, who does it and which automation runs it. Rows with no date in the last 60 days are left out (counted). There is no client filter: these tables only hold your own channels.
   - **This week** (Mon–Sun, New York): per channel, ideas proposed (target 4 / 8), approved, recorded and posted (with proof) vs target. Then the data problems as Problem → Data → Fix → Why, with an owner:
     - rows "Scheduled" with no proof of posting (17 known);
     - an approved idea with no script after 1 day (with the last sienna.prep run; Riley owns it if that run failed);
     - clips waiting for Sienna's check;
     - main-channel recording dates that aren't a Friday;
     - ideas waiting 14+ days.
   - **Which HQ action leads to which automation:**
     | Step | Where | What runs |
     |---|---|---|
     | New ideas | automatic | engine `sienna.ideas` (Fri 7 AM) + n8n "[Content OS] Reddit … Weekly Intake" ×5 (Sat 9 AM) |
     | Approve / Reject idea | **HQ** (or Content Center) | the fields above; after Approve, engine `sienna.prep` (every 30 min) writes the script, hooks, titles, thumbnail idea, Gamma outline. No n8n flow reads Idea Decision |
     | Generate script by hand | **HQ** (round 5) | n8n "[Content OS] Generate Teleprompter Script" (2 copies; HQ calls `M6KIF3eRsCf3hQTIK3cNI` unless `CONTENT_HOOK_SCRIPT` says otherwise) |
     | Sync Frame.io / Submit to OpusClip / Refresh Opus Clips / Generate Distribution Pack | **HQ** (Content Automation Action field) | Airtable automation "Content OS Action Script" → n8n Frame.io Sync / OpusClip Submit and Refresh / Generate Distribution Pack |
     | Thumbnail, Revise thumbnail, YouTube details | **HQ** | n8n Generate Thumbnail / Revise Thumbnail / Prepare YouTube Details |
     | Clip approve / request changes | **HQ** (video's page; needs Alex's login on the key, or the n8n change) or Content Center | Review Intent JSON + n8n "[Content OS] Current Clip Review and Preview" |
     | Resource document (instead of Gamma) | **HQ** → Make the resource → Download PDF | nothing saved (Gamma link box: the video's Notes) |
     | Posts: approve, newsletter preview, Framer draft | **HQ** → Distribution | Approval Status; n8n Prepare Newsletter Preview / Publish Framer Blog Draft |
     | Posts: scheduling | **HQ** → Distribution → Schedule (approved Instagram / YouTube Shorts only, only when you press it) | Scheduled At + n8n Schedule Approved Social Posts |
     | Posted link and stats | **HQ** → Distribution → Record the post | Published URL / Publishing Status (drafts) + `hq_content_posts` |
   - **Clean-up for Riley (the same job twice), shown once in HQ:**
     - three script writers: `sienna.prep` + 2 copies of the n8n Teleprompter Script;
     - two idea sources: `sienna.ideas` + the 5 Reddit intakes;
     - final edits: Sienna's editor + the OpusClip buttons.
   - **Speed and safety:** one batched read for everyone (6 list calls plus one call per 50 rows of long text, no per-row calls), kept 1 minute; refresh re-reads after 10 seconds. HQ never posts. It schedules only when you press Schedule, and deletes a content record only when you press Delete and confirm (parity, 2026-11-28). It never calls OpusClip, Gamma, Frame.io, YouTube or Discord itself; n8n only through the Content Center's own webhooks, on your press.

11. **Sales** (Step 3, 2026-11-26; **owner only**, because it has money in it): Dulcy's **own** deals, from booked call to signed and paid, in one place. In the sidebar after Deliverability; on the phone it's the **Sales** card at the top of **Clients** (the top bar has no room for another icon). What needs action comes first; the pipeline and each deal are one tap deeper. **HQ changes nothing here** and calls no outside tool (no Close, PandaDoc, SignWell, Fanbasis, Fathom or Calendly): it only reads what Airtable already stores, plus Cole's reports.
   - **Top numbers:** booked, showed, closed (signed) and new MRR, this month so far vs last month (New York dates). New MRR = the monthly amount of the deals signed that month (on a pay-per-call deal, the monthly tech fee).
   - **Needs action** (default): one line per deal, with the reason and who owns it:
     - **Call today / tomorrow** (Cole), with **Cole's prep** when there is one (an HQ report of kind `call_prep`; Cole doesn't write preps yet, so it says "no prep from Cole yet").
     - **No outcome** (Cole): the call date passed and Sales Data still says "Audit Call Scheduled", or a call marked done 2+ days ago with no offer, contract or Call Feedback.
     - **Re-book** (Cole): a No Show or Reschedule (Sales Data or Call Feedback).
     - **Not signed** (Cole follows up): a contract sent 2+ days ago and not signed. **Your signature** (Alex): the client signed in Dulcy Sign and Dulcy's signature is missing. **Not sent** (Alex): a contract drafted and not sent.
     - **Not paid** (Ledger): signed, and no payment recorded in Airtable (Initial Payment Received, or a Successful / Paid Client Invoices row). With no client record, payment is UNKNOWN.
     - **Start onboarding** (Atlas): paid, and no onboarding form or start.
     - Calls and no-shows count for the last 30 days, contracts for 90; older ones are data notes, not today's work. An inactive client needs nothing.
   - **Pipeline** (30 or 90 days, by the call date): Booked → Showed → Qualified → Contract sent → Signed → Paid → Onboarded. Each stage counts every deal that reached it; tap a stage for the deals that are at it now. **Show rate**, **qualified** and **close rate** are exact counts ("7 of 10 showed"): show rate = calls whose date passed, canceled ones left out; close rate = signed of the calls that showed.
   - **How a stage is decided** (from what the Make and n8n flows write): Showed = Call Held? / Call Held Date (Fathom), or a stage like Call Done, Follow Up Call, Contract Sent (a No Show / Canceled / Reschedule stage wins over a stray Call Held? tick). Qualified = Offer Made?, Follow Up Call, or Call Feedback "Qualified". Contract sent = a SignWell / PandaDoc / Dulcy Sign agreement sent (or the Contract Sent stage). Signed = the agreement completed (or Won). Paid = see "Not paid". Onboarded = the client's onboarding form.
   - **Tap a deal:** contact and company; the calls with the links Airtable stores (Call Feedback's call link, the Fathom link on Cole's review); **Cole's review** (score and summary; tap for the 3 fixes); Call Feedback; each agreement (SignWell, PandaDoc or Dulcy Sign) with sent / viewed / signed dates; and payment and onboarding as a checklist (signed, paid, started, form, the client's tasks). Buttons: **Close**, **Airtable**, the **signing tool** and the **client record** only: no send, sign, charge or record change.
   - **How a deal is put together:** the Sales Data row; the agreements with the same email (New Client Intake, and Dulcy Sign contracts not marked Test Only), else the same company; an agreement with no Sales Data row is its own deal. The client record: the agreement's Workspace IDs link, else the same name.
   - **Data notes** (Problem → Data → Fix → Why, with the owner): Call Feedback with no status; Call Feedback "No Show" vs a held call; a No Show stage with Call Held? ticked; a signed deal with no client record or linked only by name; old calls still "Audit Call Scheduled"; a Sales Data stage behind the contract; agreements with no Sales Data row; contracts open for 90+ days; the two signing paths disagreeing (intake Draft, Dulcy Sign sent); no Sales Data row marked Won.
   - **Speed and cost:** six batched Airtable reads (Sales Data, New Client Intake, Contracts, Call Feedback and Client Invoices of the last 400 days, Workspace IDs), kept 1 minute for everyone; the client's tasks are read when you open a deal. Refresh re-reads after 10 seconds.
   - **Members (Josh) get nothing:** the server answers 403 to every Sales request, and the money is also cut on the server for anyone but the owner.
   - **What changed 2026-11-27 (Batch 4a)** (this wins over the lines above where they differ):
     - **Gone:** "Open in Airtable" links, SignWell / PandaDoc links (old signed agreements still count; never-sent SignWell drafts are ignored), client tasks, the "two signing paths" note. "Data notes" is now **Data to fix**: records that disagree, each with who fixes it at the source.
     - **One contract per deal:** the current agreement shows; the other records fold under "N other records (why)" (same agreement in two tables, replaced by the signed one, expired, draft never sent).
     - **Paid** also counts a payment in **Xero** (read only, when Xero is connected): an invoice with money paid or money received from a contact with the client's, company's or signer's name. **Onboarded** no longer waits on a recorded payment: a linked Onboarding record counts.
     - **Cole's next step** on every deal (one line from the stage, the contract and the latest call review) and the **latest call review** (score, hot/warm/cold, what was agreed).
     - **Hottest** tab: open deals ranked by said yes, contract opened or sent, Cole's hot call, waiting on us, Close stage and likelihood, and how recent the last touch is; each with the reasons, the last email/call/note and the next step. Needs **Close**: put `CLOSE_API_KEY` (Close → Settings → API Keys) in the server `.env` and restart. Without it the tab says **Connect Close** and ranks from contracts and Cole only. HQ only reads Close (5-minute cache, at most ~25 small reads).
     - **Numbers** tab: **Compare periods** (this month vs last, this half-year vs the one before, this year vs last year: calls booked, showed, qualified, contracts sent, signed, paid, new monthly money) with up/down changes and one conclusion line. **Capacity** (Closers.io): calendars, open slots in the next 30 days (from Alex's calendar through the calendar service; else the "Slots a month" setting), % booked, show / qualified / close rate (90 days), days to close, touches per close (Close), what a full calendar gives at today's rates, and which one is the limit. Settings: Numbers → Capacity settings.
     - **Draft contract** (deal page or a hot deal): pick **Retainer** or **Pay per call** (no "both": pay per call has the monthly tech fee; an old "both" draft opens as pay per call with its fee as the tech fee), the amounts and the start date. **Pull from Close** (small button by Client) reads the deal's Close lead (the contract's lead id, else the one lead with the deal's email) and fills company, legal name (a Close custom field named "Legal…"), the contact with the deal's email, phone, address and a monthly deal value; it lists what Close did not have and never saves or writes to Close. **Service, term and scope are choices** from the two Dulcy Sign templates (service: cold email or omnichannel with the channels ticked; term: the template's 14-day-notice wording; scope: the template's list as checkboxes), so a normal contract needs no typing; an optional note goes with the special terms. **Client responds to leads** (checkbox) adds this line to the agreement's special terms: "Client responds to leads: Dulcy generates interested leads and passes them into the Client's CRM. The Client is responsible for responding to and following up with those leads. Dulcy does not guarantee any number of leads, meetings or sales." **Save draft** keeps it in HQ only. **Create draft in Dulcy Sign** writes one row in Airtable Contracts; Airtable's "Contracts — Run requested signing action" automation then asks Dulcy Sign to prepare the draft. **Nothing is sent:** you review it in Dulcy Sign, set "Approved to send" and press Issue invitation yourself. Blank terms are listed in "Missing / Unconfirmed Terms". A draft that made its row never makes a second one. Leaving the page goes up to the deal, and the deal's "Sales" goes up to the Sales list (never back through the browser history, so no loop).

   - **What changed 2026-11-27 evening (Round 3)** (this wins over the lines above where they differ):
     - **Cole keeps Close current:** after each call review Cole sets the prospect's open Close opportunity **likelihood (%)** from how the call went (inside the band of his hot / warm / cold call, rounded to 5) and its **value** from the price pitched or agreed on the call (Nick was pitched $2K/month, not the $3K default). The value only changes when the price is quoted word for word from the transcript; otherwise it stays. He finds the lead by the prospect's email (one exact match only) and never creates an opportunity. **It only writes the opportunity's likelihood, value and value period in Dulcy's own Close; never an email, SMS, task or status.** Switch: add **`cole.close_update`** to `LIVE_STAGES` (and `COLE=on` with `cole.review` live). Until then Cole records what he **would** change. Every change (or planned change) is in the Airtable activity log (old → new) and on the deal page under **Close updates by Cole**.
     - **Numbers** tab: a **period picker** (month vs last month, quarter vs last quarter, year vs last year, custom range vs the same number of days before) and a **chart per number** (calls booked, showed, qualified, contracts sent, signed, paid, new monthly money): this period as a solid line, the one before dashed, as running totals per day / week / month. The month / half-year / year blocks and the "Closers.io math" text are gone.
     - **Capacity: the calendar bug.** It said "Dulcy's calendar cannot be read" although Calendly is connected. Cause: Capacity asked the calendar service for 30 days in one go, and the service (like Calendly itself) refuses any window over 7 days ("Invalid availability window"). Echo's normal read asks for 6 days, so it always worked. Now the 30 days are read as five 6-day windows. If the calendar still cannot be read, Capacity says why and shows **Connect calendar** (pick Calendly / Google / Outlook, type the calendar email, **Get calendar link**): the same one-time link as client → AI replier → Get calendar link (needs `CALENDAR_ADMIN_TOKEN`; nothing is emailed).
     - **Pipeline** tab: **straight from Close** (opportunities created in the period): each Close stage in Close's own order with its **share in percent** (not "3 of 5") next to the period before, plus open / won / lost. Default **last 30 days**; month / quarter / year / custom. The old HQ deals-by-stage list (contracts, payment, onboarding) is folded underneath.
     - **Funnel** tab, like Close's "Opportunity Funnels" report: total opportunities, **close rate** (won of all created in the period; the share of decided ones in the note), **average time to close** (created → won), **average value per win**, and per step (call booked → follow-up → call done → contract sent → won, in Close's pipeline order) how many reached it, the step-to-step rate and the **average days to get there**. A deal that skipped a step still counts as reaching it. Same period picker. Close is read only, kept 5 minutes, at most 10 pages of 100.
     - **Pricing** tab (owner only): the **Dulcy Media P/L** sheet's pricing calculator. HQ reads the sheet's calculator tab (the first tab named like "Pricing" or "Calculator"; formulas and values, read only, kept 10 minutes) and works out its formulas with the inputs you type. The sheet is never changed. A formula HQ cannot read (another tab, an unusual function) keeps the sheet's own value, marked "from the sheet". If the sheet cannot be read (no Google key, no access, no such tab), a **built-in** calculator shows instead, with its assumptions written out and every money input empty. Needs the same Google service account as the lead lists (`GOOGLE_KEY_FILE`, `GOOGLE_IMPERSONATE_USER` with access to the sheet).
     - **Team → Agent conversations** (`#/agents/talk`): agents talking to each other, newest first, filter by agent; tap one to read it (read only). Today that is Ada asking another agent from a chat (e.g. Ada → Atlas) and Ada handing a stalled task back. You see all; Josh sees only those from his own chats and never Ledger or Sienna.
     - **For Riley:** `engine/src/hq/closeUpdates.ts` (Cole → Close; the only write is `updateOpportunity` in `providers/close.ts`), `salesPeriods.ts`, `salesClose.ts`, `pricing.ts`, `agentTalk.ts`; routes `/hq/api/sales/numbers|close|pricing|calendar-invite` and `/hq/api/team/conversations[/<id>]`. Tests: `test/hqColeClose.test.ts`, `test/hqRound3.test.ts` (fake Close, calendar and sheet).

   - **What changed 2026-11-28 (Round 4, Sales)** (this wins over the lines above where they differ):
     - **First view:** one row of the month's key numbers (vs last month): **meetings booked**, **show rate %** (past calls that showed, canceled left out), **close rate %** (of the calls that showed, how many signed) and **revenue signed** (new monthly money). Then **Needs action**, with one line of what is waiting ("1 Call today · 1 Not paid"). The "Hottest 3 / this month vs last" strip is gone (Hottest is its own tab). "Data to fix" is folded on this view. No "owner only" labels.
     - **Pipeline and Funnel: percentages first.** The first thing in both tabs is the **close rate** and each **stage-to-stage conversion** ("Call booked → Call done 62%", counts underneath). From Close when it is connected; if Close is not connected (or does not answer) the tab says so in one line and shows the same percentages from HQ's own sales data (Airtable: booked → showed → qualified → contract sent → signed → paid → onboarded, 30 or 90 days).
     - **Pricing now uses only Alex's sheet.** The "team hours a month", "cost per team hour" and "target margin" inputs were never in the sheet: they came from HQ's built-in fallback, shown because no tab of the P/L sheet is named "Pricing" or "Calculator". HQ now reads the sheet's **OPEX Guide** tab: each **"Client Fulfillment - <plan>"** block is a plan (pick it at the top). The inputs are that block's lines only: retainer, rev share, Cheap Inboxes (inboxes × price per inbox), domains, domain masking, the credit lines (leads a month × cost per lead: scraping, verification, LinkedIn / company verify), tool seats, and one-off builds (first month only). Results are the sheet's own sums: cost a month, profit a month, opex (cost ÷ revenue), profit margin, and the first month when the plan has one-off lines. One number is not the sheet's: **price per inbox = $2.50** (Dulcy's Cheap Inboxes price, RULES 2026-11-28), labelled so next to it. HQ checks that, with the sheet's own numbers, it gets the sheet's own monthly profit; if not, it says so (tell Riley). If the sheet cannot be read, the same line names show empty (only $2.50 per inbox filled in).
     - **For Riley:** `sales.ts` (`rate()` has `pct`; `pipelineOf` adds `conversions` and `overall`; `topNumbers` adds `showRate` / `closeRate`), `pricing.ts` (`parsePlans`, `priceResults`, `pricingModel`; POST `/hq/api/sales/pricing` takes `{ plan, inputs }`). Tests: `test/hqSales.test.ts`, `test/hqRound3.test.ts` (fake OPEX Guide, made-up numbers).
   - **What changed 2026-11-28 (Round 5, Sales)** (this wins over the lines above where they differ):
     - **Cole's take** replaces the "November so far vs October" line: one or two sentences from this month's numbers and goals (ahead → "raise next month's goal"; behind → "below goal, let's find out why", with the likely reason from the show rate, close rate or calls booked). **Talk to Cole** opens a new chat with Cole with the numbers, the goals and his take typed in (not sent). With `ANTHROPIC_API_KEY` Cole words it himself: asked again only when the numbers change, at most 4 times a day, and any answer that is too long or has a number not in the data is replaced by the rule line. Without a key: the rule line.
     - **Goals** under the key numbers (first view and Numbers): calls booked, deals signed, revenue signed (monthly value) and cash collected, each against this month's goal, with a tick where the month should be by today (On pace / Behind / Goal hit). The goals are **read** from Airtable's **Sales Goals** row for the month, which the n8n workflow **"Airtable Monthly Goals Auto"** writes on the 1st from last month's goals and results; HQ never writes it. "How the goals were set" shows who set it and why (the row's growth, confidence and reasoning). If n8n has not written the month yet, HQ works the goals out from last month's row with the **same rules** (the workflow's JavaScript, ported to `salesGoals.ts` and checked against the workflow's own code in the tests), without the workflow's AI review (±10%). It also shows next month's goals at this month's pace, and warns when Airtable's count of closed deals differs from HQ's (the workflow reads Airtable's, which misses deals not marked Won).
     - **Data to fix:** every item has a **Have <agent> fix it** button for the agent its fix names (Cole for deal data in Close / Call Feedback, Atlas for client links and old agreement records, Ledger for payments, Riley for the n8n flows; two buttons when two agents share it). Pressing it only puts the task on that agent's list (Team); the agent prepares the change and waits for your ✅ before touching Close, Airtable or Dulcy Sign. Nothing is sent.
     - **Calls on a deal** are named by type (Outbound consultation, Outbound audit, Follow-up …) from the Fathom meeting title or Cole's call type, else the Sales Data stage, with the status (Held, Booked, No-show …), one line on what the meeting was about (Fathom's "Meeting Purpose", stored by Cole from now on; for older reviews Cole's verdict) and the **Fathom recording** link. Nothing is made up: a call with no review shows no summary.
     - **For Riley:** `salesGoals.ts` (`n8nGoals`, `goalsView`, `coleTakeRule`, `coleTake`; route `/hq/api/sales/goals`; Cole's cached words in `hq_sales_settings` key `cole_take`), `salesCalls.ts` (`callName`, `fathomAbout`, `dealCalls`), `sales.ts` (`noteActions`; `coleReports` joins `cole_reviews` for the meeting title), `agents/cole.ts` (stores `meetingTitle`, `callType`, `about`, `meetingAt` on each new review). Tests: `test/hqSalesRound5.test.ts`.
   - **Won in Close → Won in Airtable (sales.won_sync, 2026-11-28).** Alex: "It should be marked Won in Close and then it feeds back to Airtable." Close is the source of truth; Airtable Sales Data follows.
     - **Why:** Airtable's Sales Goals counts closed deals (Total Deals Closed, Revenue Closed, Avg Days to Close) from Sales Data rows linked by **Closed Month**. The Airtable automation "Autoupdate for Booked/Closed Month" sets that link when **Deal Closed?** is ticked, from the month of **Deal Closed Date**. No row was ever marked, so Sales Goals (and the n8n goals workflow on the 1st) saw 0 closed.
     - **What it does, every 30 minutes** (once Close and Airtable are connected): reads the **won** opportunities in Close updated in the last 180 days (at most 300, at most 40 leads looked up a run), finds each one's Sales Data row and marks it Won.
     - **Matching:** the Close lead's contact emails against **Contact Email** first (Dulcy's own addresses ignored); if no row has them, the lead name against **Account/Company Name** (same company key HQ Sales uses). One row = match. Two or more rows (unless exactly one is already Won), or none = **skipped, with the reason**. Never guessed.
     - **What it writes** (Sales Data only, only what is missing): **Sales Pipeline Stage = Won**, **Deal Closed? = ticked**, **Deal Closed Date = Close's won date**, and **Offer Amount (Revenue Closed) = Close's value** only when it is empty and the value is monthly or one-time. An existing date or amount is never changed; no other field or row is touched; a row already Won is left alone (no write). It never writes Close and never sends anything.
     - **Dry run first:** until it is switched on, it only records "would mark Won" with the match (job result and HQ). **To switch it on:** add `sales.won_sync` to `LIVE_STAGES` in `/opt/dulcy-os/engine/deploy/.env` and restart the engine. Each real change then gets an Activity Log row (agent **Cole**).
     - **In HQ:** Sales → the goals card shows "N deals marked Won from Close" (or "Not switched on yet: N deals would be marked Won"), and each won deal it skipped with why and **Have Cole fix it** (Cole fixes the Sales Data row with Alex's ✅; the next run marks it).
     - **Settings:** `WON_SYNC_EVERY_MIN` (default 30; 0 = off). **For Riley:** `hq/wonSync.ts` (`matchSalesRow`, `wonPatch`, `wonSync`, `wonSyncView`, `wonSyncStage`; results in `hq_won_sync`), `providers/close.ts` (`wonOpportunities`), `scheduler.ts` (`wonSyncOn`, in `agentsTick`). Tests: `test/wonSync.test.ts`.

**Agent to-do lists:** kept in HQ (the Airtable Tasks table has no Agent field). For now one generator fills them, every 30 minutes:
- A running campaign past 60% sent gives Atlas "Plan next campaign for <client>", due in 3 days.
- It is skipped if a campaign plan already exists, and the task closes itself when the plan starts.

**Agent task lists** (2026-11-25): kept in HQ's own database, never in the Airtable Tasks table (it has no Agent field, and Alex's project management stays his). The agents open, move and close their own tasks; nobody has to ask "what are you doing?":
- **Atlas, plan next:** a running campaign past 60% sent gives "Plan next campaign for <client>", due in 3 days (skipped if a plan exists; closes itself when the plan starts). Checked every 30 minutes.
- **Atlas, new campaigns:** every campaign plan is one task, "New campaign for <client>", due a week after it started (a default: tell us another target if you want one). It follows the plan step by step: writing the plan → sample → **waiting on you (approval 1)** → contacts → verify (Scribe writes the copy) → QA → **waiting on you (approval 2)** → with the client (48 business hours, not counted as stuck) → build and launch → done when live. Stopped by ❌ = done; stuck = waiting on you, with the retry command.
- **Atlas, bounce checks:** a campaign the bounce check pauses (or flags over 4%) opens "Bounce check: <campaign> (5.2%)" the moment it is queued, due the next day. Fixed automatically = done; otherwise **waiting on you** with the fix in Decisions → Campaigns; ✅ moves it to in progress and the fix closes it; ❌ closes it.
- **Atlas, account rests:** a rested inbox is "Rest <email> until its retest", due on the retest day (a planned wait: not stuck before then). Recovered = done; failed the retest = waiting on you (the replacement purchase); approved = done.
- Only real (live) runs make tasks; a dry run or a check by hand does not.
- **Last update** moves only when something changes (status, note, due date, link). A task nobody moves goes stuck after 2 days.
- **Ada watches every list** (see "Ada, the morning brief"): what is late or stuck gets one line in her brief, and a stuck task with an engine job behind it is **re-queued** (once a day per task, at most 3 times; the normal queue, so a stage not in `LIVE_STAGES` re-runs as a dry run, and a job still running is left alone).
- **In code:** `upsertAgentTask(db, { agent, key, title, due, status, note, link })` in `engine/src/hq/agentTasks.ts` (one task per key; `closeAgentTask(db, key, note)`). **Server:** `agent-task upsert --agent=Riley --key=<key> --title="..." [--status=in_progress] [--note="..."] [--due=YYYY-MM-DD] [--link=decisions/Fixes]`, `agent-task done --key=<key> --note="..."`, `agent-task list [--agent=Riley]` (for Claude sessions such as Riley's runbook).
- **Chat:** ask "where is the GMG campaign?" or "what is Riley doing?": the answer comes from these tasks (status, note, last update, due) and cites "HQ task #12".

**Less Slack:**
- Every report (Ada's brief, Atlas health, Cole reviews, Ledger, Sienna, Riley, account health, bounce pauses, refused launches) is saved in HQ.
- `SLACK_REPORTS=on` (default) still posts reports to Slack too. Set `off` once HQ works for you: then they go to HQ only. Urgent alerts always go to Slack (a campaign paused for bounces, a refused launch, a failed engine job).
- `SLACK_DECISIONS=on` (default) still posts decisions to Slack for ✅/❌. Set `off` to decide in HQ only. Keep `SLACK_BOT_TOKEN` set: the decisions loop still needs it to run.

**Sign-up and Users (owner only, 2026-11-25):**
- **Sign up:** the sign-in page has "No login yet? Sign up" (name, email, password twice, 12+ characters; or "Sign up with Google" when Google is set up). It only sends a **request**: "Request sent. Alex will approve it." It never signs anyone in, and the answer is the same whether the email already has a login. Sign-ups are limited like logins (5 per email or 20 per address in 15 minutes).
- **You see it:** a "1 sign-up waiting" card on Today and a number on **Users** in the sidebar (the shield icon at the top on the phone). Nothing goes to Slack.
- **Users page:** everyone with a login: name, email, role, status (pending / active / disabled), last seen, added.
  - **Approve** (choose Member or Owner; Member by default) or **Deny** (the request is deleted).
  - **Make owner / Make member**, **Disable / Re-enable** (disabling signs them out everywhere), **Reset** a password (you set a temporary one; they are signed out everywhere).
  - **Add user:** name, email, role, and a temporary password or Google sign-in only.
  - You cannot disable or demote yourself or the last owner.
  - Every action is in the **Log** at the bottom (who, what, when; table `hq_user_events`).
- A pending or disabled login can never get in: password, Google and an old session are all refused.
- The server command `hq-user` still works the same, and also approves a pending request.

**Client portal (portal.dulcy.io, replaces Softr; Step 4, v2 2026-11-26, three tabs since v3 the same day):**
- **What it is:** the same portal clients use in Softr today, now inside HQ, at **https://portal.dulcy.io** once you switch it (steps below). Until then it runs at **https://hq.dulcy.io/portal** for a preview with a client login. The spec (every Softr page, block, table and form) is `hq/portal-softr-inventory.md`.
- **What a client sees (v3, 2026-11-26: three tabs).** Alex: "simpler to read, so not like 4 different sections". The same screens and buttons as v2, regrouped so a client gets it at a glance. On the phone: a bottom bar with **Home · Leads · Account**; on the computer: the same three as tabs at the top. Light and dark. The only number badge is on Home: how many things need the client.
  - **Home, "How it's going"** (one scroll):
    - **Is it working?** in one line, then the **last 30 days against the 30 days before** for each channel that is on for them (Email: sent, replies, interested, meetings booked; LinkedIn: requests, accepted, replies, meetings; AI caller: calls, answered, interested, all time). More than one channel on = a small Email / LinkedIn / AI caller switch. A channel that is off is not shown at all. Under the numbers: inbox delivery in words and a link to the channel's full numbers (10 / 30 / 60 / 120 days / all time and every campaign).
    - **Your next call with us**, **Book a call** (your booking page, `PORTAL_MEETING_URL`) and **Past calls** (summaries and recordings).
    - **Needs you:** open tasks (**Mark done** right there), a campaign waiting for their review (opens the campaign and its review form), a call that happened with no feedback yet (opens the lead with the feedback form), and the onboarding form when it is linked but not submitted yet. "All tasks" shows the finished ones too.
    - **Your campaigns:** the ones that are not finished. Tap one: numbers, the plan, who we reach, the emails, **Approve / Request changes**. "All campaigns and the launch calendar" lists every campaign, finished ones included, with a List / Calendar switch.
  - **Leads, "Your leads":** one list of everyone who said yes, newest first (12 months), each with the start of what they wrote. Chips: **All · New · Meeting booked · Closed · Lost** (Lost only when there is one) · **Meetings** (booked meetings by month, with "Give feedback" or the feedback they gave). Tap a lead: what they wrote, the meeting, **Give call feedback** (Qualified / Unqualified / No Show / New Date, stars, notes, recording link) and **I closed a deal** (value, date, type, why). A call booked for a day still to come stays in the list.
  - **Account, "Your account":** rows that each open a sheet: **Onboarding answers** (read and **Edit answers**; never the LinkedIn password, 2FA or other credential fields) · **Documents** (from Dulcy / from them; never "Internal?" ones) · **Access & logins** (hidden until they tap Show) · **Billing** (Paid / Due / Unpaid; drafts and hidden ones left out) · **Notifications** (Dismiss all; the bell at the top opens it) · **Getting started** · **Profile & password**. Then the Dulcy ESP portal and Partnership info links, light / dark, and **Sign out**.
  - **Where each Softr page went:** Home, Performance Analytics (Email, LinkedIn, AI Employee, Mail), Campaign Overview / Details / Review, Campaign Calendar, Tasks Requested, Our Previous Meetings and Schedule Meeting → **Home** (and the pages it links to). Pipeline, Lead Details Full, Call Feedback, Call Feedback Form and Close a Deal → **Leads**. Onboarding Form, Implementation Pathway, Documents / Info, Logins, Billing, Notifications, Account settings, Partnership Information and Dulcy ESP Portal → **Account**. Old portal links (for example `#/pipeline`, `#/billing`, `#/feedback`) still open the right place.
  - **Never:** other clients, fees, revenue, receivables, Decisions, Echo's drafts or reasoning, internal notes, agent names, Airtable links or record IDs.
- **What a client can change** (exactly what the Softr forms and buttons write, to the same Airtable tables): Campaign Review → a Campaign Feedback record; call feedback → a Call Feedback record; I closed a deal → a Client Closed Deals record; Mark done → Client Tasks Stage = Done; onboarding answers → the Onboarding record; Dismiss all → Client Notifications Dismissed. Your Airtable automations then run as before (Call Feedback Sync, Close a Deal Sync, the campaign plan reading the client's review). Every client write is logged (who, when, table, record, fields; never the values): Users → `/hq/api/users/portal-writes`.
- **Accounts:**
  - **Anyone can create an account** on the portal, as in Softr. It sees nothing until you link it: it waits on **Users → Client portal requests** with the company Airtable Portal Users suggests for that email. Check who they are, then tap **Link to …** (or pick another company), or **Deny**. HQ never links by email alone, because nobody has proven they own that email.
  - **Exception:** "Continue with Google" proves the email. If that email is in Airtable Portal Users and linked to exactly one **active** client, the login is made for that client at once. Anything else (no match, two clients, an inactive client) becomes a request.
  - **Existing Softr users:** Softr passwords cannot be moved. **Users → Softr portal users → Show who to invite** lists them with their client (active clients first). **Make login + link** creates their portal login and a one-time link to set a password (valid 7 days, works once). Copy it and send it to them yourself (HQ sends no email).
  - **Forgot password:** the client taps "Forgot your password?" on the portal; you see "asked for a new password" on their row in Users; tap **Send link** and send it. You can also reset with a temporary password as before.
  - **Turn a login off:** Users → the client login → **Disable** (signs them out at once).
- **Safe by design:**
  - The client always comes from the login, never from the address. Every row is cut to that client on the server; a row linked to two clients is shown to neither. The browser only ever gets a short key for each row, and a key is looked up among that client's own rows only, so a borrowed or made-up key finds nothing.
  - On portal.dulcy.io the server answers only the portal page and the portal + sign-in routes. HQ's own app, every other HQ route and the engine API answer "not found" there; a Dulcy team login signing in there is sent to hq.dulcy.io.
  - On hq.dulcy.io a client login is refused everywhere except its portal (tests walk every HQ route).
  - Credentials are read only when the client opens Access & logins, for that client only, never cached and never logged. **Note: the logins themselves live in Airtable (Workspace IDs → Logins), as in Softr.** Anyone with Airtable access can read them there.
  - The Airtable Portal Users table has a plain-text **Password** column from Softr. HQ never reads it. Consider clearing it after the switch.
- **Not the same as send.dulcy.io:** that is EmailBison's white-label inbox, with its own login. The portal links to it.

**Batch 1 (2026-11-27): safety and the shell**
- **Placeholder guard.** A reply that still has a fill-in bit, like "[video link for Artisan Luxe Beauty]", "[link]", "[Your name]", "{{first_name}}" or "<insert …>", can never be sent as it is. On the Decisions card (and the Inbox) the Send button stays off, the bit is marked, and a yellow box says **Replace this before sending** (tap the bit to jump to it in the text). The server refuses it too, and so does the engine's reply sender, so nothing slips through from Slack or Airtable either. Echo is told never to write one: when a link or fact is missing it asks you the question instead ("Need your input").
- **Editing a reply.** The draft on a reply card is a normal text box with an **Edit** button. Change it, then **Send edited**.
- **Fix it.** Where an agent suggests something (Today → Agent suggestions, a decision whose approval does nothing by itself), two buttons: **Have <Agent> fix it** puts it on that agent's own task list (Team), and the agent picks it up; **I'll look** hides the buttons on this device (Undo brings them back). Pressing it sends or changes nothing by itself. Other screens get the same buttons as they are rebuilt.
- **View as.** Users → a person (e.g. Josh) → **View as member** shows HQ exactly as that person sees it: no money, no Content, no Sales, no Users. A yellow bar says "Viewing as Josh (member). Read only." with **Exit**. It is read only: any change is refused while you view. Only your login can do this; it can never give anyone more than they have. (Round 2: the switch in the sidebar is gone; it lives on Users only.)
- **Menu order:** Today, Decisions, Inbox, Needs you, Clients, Sales, Campaigns, Deliverability, Team, Chat, Content, then Users.
- **Today** is now in clear blocks, each with its own heading and icon: Decisions, Ada's morning brief (Top 3 and Overnight first, then "Read the whole brief"), Agent suggestions, Reports, Do now, Team check.

**Who can see what:**
- `owner` (you) sees everything.
- `member` (Josh later) never sees money or content (Alex, 2026-11-25): no Money pile, nothing from Ledger or Sienna (cards, decisions, chats, reports), no client money (fee, LTV, receivables) and no Users page. A member sees only their own chats.
- `client` (a client's portal login) sees only their own portal (above). Nothing else in HQ.

**Safety:**
- Passwords are stored as scrypt hashes and never printed.
- Logins are a signed, httpOnly, Secure, SameSite=Strict cookie (30 days; signing out ends it).
- 5 wrong passwords for one email (or 20 from one address) lock logins for 15 minutes.
- Every change needs a request from the HQ page itself (cross-site requests are refused). No key ever goes to the browser.
- The engine's signed job API is not reachable on hq.dulcy.io.

### HQ Needs you, Team and Chat (Batch 4b, 2026-11-27)
- **Needs you = your to-do for today**, most important first (Ada's order). Each card: the problem, **Do** (what to do), **Why**, one button. What lands there: all decisions as ONE line ("10 decisions waiting → Open Decisions"), campaigns past 60% with no next campaign ("Check with Atlas"), money decisions and urgent money reports with Ledger, Riley's hands-on fixes, asks, agents with failed runs (with "Have Riley fix it") or late / stuck tasks ("Ask for an update"), sign-ups. Josh sees only his own: his decisions, his asks, Echo's check-ins. Never money, Ledger or Sienna.
- **Team → What everyone is working on**: each agent's current task, next deadline and last run; the tasks by status (In progress, Waiting on you, Not started, Done 7 days); upcoming deadlines (2 weeks); the last 3 days of activity. Filters: agent, client, status (late, stuck…), due. Link: `#/agents/work?agent=Atlas&status=late`.
- **Chat works like Slack**: each agent has several chats. Chat opens the one you had open last; keep typing in it. "New chat" starts fresh; Archive hides a chat (Archived → Restore brings it back; asking in it brings it back too). Chats from before this change are all still there. "Ideas for today" = suggested questions that change every day (some from live data, e.g. the client with the most replies waiting).
- **Open a chat with a question typed in** (other screens use this): `#/chat/Atlas?ask=How%20is%20GMG's%20health%3F` opens a new chat with Atlas and the question ready to send.
- Fixed: the "… is looking it up" line showed the agent on screen (Riley) instead of the one asked (Ada). It now shows only in the chat the question was asked in, with that agent's name; a chat can never be answered by another agent.

### HQ round 2: Today, Decisions, Users, Sales (Alex's evening walkthrough, 2026-11-27)
- **Today, top to bottom (computer):** **Do now** (left) and **Team check** (right, above Content). Then Campaigns, This week, Ada's brief, Agent suggestions, Reports.
- **Do now = your to-do for today**: the top 5 of **Needs you**, same list, same order. Decisions are ONE line in it (with the piles and **Start deciding**); the decisions count is not repeated anywhere else on Today. New on the list: **sales calls today** (from Sales Data, with whether Cole's prep is ready) and **clients that need a lot of attention or are at risk** (from Clients health). Both owner only. Calendar events outside Sales Data are not read (UNKNOWN: there is no calendar-events reader yet).
- **Campaigns, grouped by how they are doing** (live campaigns of active clients): **Performing well** (1.25× the agency's interested replies per email or better, and meetings keeping up: booked at least 20% of interested), **On pace**, **Needs more time** (under 500 sent), **Needs a look** (under 0.6× the average, 1,000+ sent and nobody interested, a failed or stuck step, or bounce over 4%). Bounce 2.5–4% is a small "watch" tag, not a group. Tap a group: Campaigns opens at `#/campaigns/live?how=look|well|pace|time`. Code: `engine/src/hq/today.ts` (`campaignHow`).
- **This week**: interested replies, meetings booked (Emails table) and emails sent (Email Analytics, EmailBison's daily numbers up to yesterday), Monday to today vs **the same days last week**, with the dates (11/23–11/27 vs 11/16–11/20).
- **Team check**: what each agent did in the last 24 hours, in plain words from the Activity Log ("3× Account rested 7 days · 2× Launch: done"); engine steps count for Atlas. A failed run shows in red. Ada's brief now says "What the agents did (last 24 h): Atlas: 9 things done" and its scorecard spells out "last week".
- **Account health report fixed:** it wrote text into Email Accounts "Last Spam Protocol Action", a date field, so Airtable refused every rest, recovery and replacement ("0 rested, 0 recovered, 0 to replace" plus errors). It now writes the time only. When a test still cannot be processed, the report says why in plain words, grouped (no Email Accounts row, Airtable refused, EmailBison refused), names **Riley**, and is marked urgent (so Today shows "Have Riley fix it"). Accounts from the failed runs may already be at 0/day in EmailBison with no rest recorded in Airtable: Riley checks them.
- **Decisions:** **←** and **→** (buttons by "2 of 12 left", or the arrow keys) move between cards without deciding. **Later** sends the card to the back of the queue.
- **Sales:** the first view shows **This month vs last** and the **Hottest 3** (links to Numbers and Hottest), and **Draft contract** on every deal row with no contract out yet.
- Dates on these screens use slashes (11/27).

### Phone notifications (2026-11-27)
HQ can ping your iPhone (and any computer with Chrome, Edge or Safari). Tap a ping and HQ opens that exact item. Slack pings stay exactly as they are.

**Turn it on on your iPhone (once):**
1. If HQ is already on your Home Screen from before 27 Nov 2026: press and hold that icon → **Remove App** → **Delete from Home Screen**. (The old icon was a plain bookmark; only the new one can get pings.)
2. In **Safari**, open https://hq.dulcy.io and sign in.
3. Tap **Share** (the square with the arrow) → **Add to Home Screen** → **Add**.
4. Open HQ **from the new icon**. Tap the **bell** at the top (on a computer: **Notifications** at the bottom of the left menu; owner: also on **Users**).
5. Tap **Turn on notifications on this device** → **Allow**.
6. Tap **Send a test**. A "Dulcy HQ test" ping arrives within seconds. Tap it: HQ opens on Notifications.
- On a computer: open Notifications, tap Turn on, Allow. Each phone or computer is turned on by itself; all of them show under **Your devices**.
- Blocked by mistake? iPhone: **Settings → Notifications → HQ → Allow Notifications**. Chrome: the lock icon left of the address → Notifications → Allow, then reload.

**What pings you (each can be switched off on that screen; all on by default, always on, no quiet hours):**
| Switch | When | Tap opens |
|---|---|---|
| New decisions | each new Decisions card; several within 3 minutes come as one ("4 new decisions") | that card (or Decisions) |
| Agent messages to you | an agent's chat answer when you are not on that chat; an ask or a task waiting on you | the chat / the ask's screen / the agent |
| Urgent problems | an active campaign over 4% bounce, a campaign paused for bounces, an inbox in spam, warm-up off, a run that failed or needs review (once per kind per day) | the campaign / Deliverability / the report / the agent |
| Good news | a meeting booked (Echo, or WON in Emails), a client signed or paid | the reply thread / the deal |

**Josh (members)** gets only his own items: new **reply** decisions, asks for the team, his own chat answers, meetings booked. Never money (signed/paid, Ledger), Sienna, urgent problems or the owner's own work. The server decides, the same way HQ hides those screens.

**Limits:** at most 1 ping a minute per person (what waits is grouped into the next one), at most 60 a day. A ping that waited more than 30 minutes is dropped. The same thing is never pinged twice. When notifications are first turned on, nothing that already existed is pinged: only what is new from then on.

**How it works (for Riley):** `engine/src/hq/push.ts` (keys, devices, `notify()`, sending, limits) and `engine/src/hq/pushWatch.ts` (the watch loop, every minute while at least one device is on: asks, waiting tasks, urgent reports, failed runs, `calendar.book` bookings every minute; Decisions every 2 minutes; campaigns over 4% and booked Emails every 10; Deliverability and Sales every 15). The web side is `hq/web/src/notifications.tsx` and `hq/web/public/sw.js`. The VAPID key pair is made on the first start and kept in Postgres (`hq_push_keys`); nothing to set. Optional settings: `VAPID_PUBLIC_KEY` + `VAPID_PRIVATE_KEY` (your own pair), `VAPID_SUBJECT` (a `mailto:` address or `https://` URL; default `HQ_PUBLIC_URL`), `HQ_PUSH=off` (stops the watch loop). A device the push service says is gone (404/410) is removed; 10 failures in a row also remove it.

### Finances → Personal (Plaid) (2026-11-28)
Your own cards and bank accounts (Robinhood, Discover…) on **Finances → Personal**, linked once through Plaid. For each account: current balance, credit limit, and for credit cards the **statement balance, minimum payment and due date** when Plaid has them. **Read only:** HQ can't move money or start a payment. A linked Robinhood or Discover account replaces that card's row from the P/L sheet. Until the keys are on the server, Personal shows "Personal cards are not connected yet" and keeps the sheet figures.

**Set it up (Alex, once):**
1. Create a Plaid account at **https://dashboard.plaid.com** (sign up, verify your email).
2. In the Dashboard, request **Production** access. Use case: a personal dashboard for your own accounts only. Products: **Balance** and **Liabilities**. If Plaid shows an "OAuth institutions" checklist (company or app profile), fill it in too, because some banks only show up after that.
3. When Production is approved: Dashboard → **Developers → Keys**. Copy the **client_id** and the **Production secret** (not the Sandbox one).
4. On the server (the values never show on screen and are never typed into a file by hand):
   ```
   ssh -o ServerAliveInterval=30 root@178.156.132.86
   cd /opt/dulcy-os/engine/deploy
   cp .env .env.bak-$(date +%F-%H%M) && chmod 600 .env.bak-*
   read -r -s -p "Plaid client_id: " PCID; echo
   read -r -s -p "Plaid Production secret: " PSEC; echo
   sed -i '/^PLAID_CLIENT_ID=/d;/^PLAID_SECRET=/d;/^PLAID_ENV=/d' .env
   printf 'PLAID_CLIENT_ID=%s\nPLAID_SECRET=%s\nPLAID_ENV=production\n' "$PCID" "$PSEC" >> .env
   unset PCID PSEC
   grep -c '^PLAID_' .env        # expect 3 (counts the lines, shows no values)
   ```
5. **Deploy** (after this branch is merged to main): `bash /opt/dulcy-os/engine/deploy/deploy.sh`. The last lines say "Engine is up." and "HQ is up."
6. In HQ: **Finances → Personal → Connect a card or bank**. Plaid opens; pick Discover (or Robinhood, or your bank), log in, pick the accounts, Continue. The accounts show at once. Do it again for each login.

**Day to day:** balances are read when you open Personal and kept for 1 hour; **Refresh** reads again (at most every 30 seconds). **Remove** on a connection ends that login at Plaid and deletes it from HQ. If a bank asks you to log in again, the connection says so: Remove it and connect it again.
- **Costs:** Plaid bills Liabilities per linked login per month and Balance per read. Your prices are UNKNOWN until Plaid shows them in your Dashboard. HQ reads at most once an hour unless you press Refresh.
- **Robinhood or a bank missing from the search?** Link starts with Liabilities, so only places that offer card data are listed. Ask Plaid for **Transactions** too, then add `PLAID_PRODUCTS=transactions` to `.env` and deploy. Liabilities are still read where the card supports them.
- **Testing without real accounts:** `PLAID_ENV=sandbox` with the Sandbox secret; Plaid's test login is `user_good` / `pass_good`. Personal then says "Plaid test mode".

**How it works (for Riley):** `engine/src/providers/plaid.ts` (fetch on Plaid's REST API: `/link/token/create`, `/item/public_token/exchange`, `/accounts/balance/get` with `/accounts/get` as fallback, `/liabilities/get`, `/item/remove`; nothing else) and `engine/src/hq/plaid.ts` (routes, cache, parsing). Routes: `GET /hq/api/finances/personal[?refresh=1]`, `POST …/personal/link-token`, `POST …/personal/connect`, `POST …/personal/<id>/remove`. Owner only: members and "view as" get 403; POSTs need the same-site Origin like every HQ write. Access tokens are sealed with **AES-256-GCM** in Postgres (`hq_plaid_items.access_token_enc`; key derived from `ENGINE_SECRET` with HKDF, bound to the item id). They are never logged, returned or shown. **If `ENGINE_SECRET` ever changes**, saved connections can't be read: Remove them and connect again. The HQ page's Content-Security-Policy allows only Plaid's Link script and frame (`cdn.plaid.com`); the portal and the API keep the strict policy. Web: `hq/web/src/pages/FinancesPersonal.tsx`.

### Talk to the agents (voice mode) (2026-11-28)
Talk to Ada (or any agent you can chat with) out loud, like ChatGPT voice. In **Chat**, press **Talk** (next to Send; also on the agent chat box beside Finances). A full screen opens: the orb shows **Listening**, **Thinking…** or **Speaking**, your words and the answers show underneath, **End** closes it.
- **Hands-free:** just talk. About 1 second of quiet ends your turn; the agent answers in 1 to 3 sentences and reads it out; then it listens again. **Talk while it speaks to interrupt it.** A clip is at most 60 seconds.
- **It is the same chat:** what you say is a normal message in that HQ Chat thread, and the answers stay there (with their sources). After End, the chat shows the whole conversation.
- **Read only, like every chat:** voice never approves a decision, sends, launches, pauses or changes anything. "Approve them" gets "it's waiting as a card in Decisions for you". Josh (members) can talk only in his own chats, never to Ledger or Sienna; money stays owner-only.
- **Limits:** 60 voice turns per person per hour (`VOICE_TURNS_PER_HOUR`), 60 s per clip (`VOICE_MAX_SECONDS`, never more). Recordings are **not stored**: each clip is sent once to OpenAI to be turned into text and dropped; HQ keeps only a count (time, length) for the limit and the cost.
- **iPhone (Home Screen app):** the first Talk asks for the microphone: Allow. iPhone may ask again after HQ was closed. With the mic on, iPhone plays a little quieter; AirPods or headphones work best (and stop the agent hearing itself). Said no by mistake: **Settings → Apps → Safari → Microphone → Ask**, then open HQ again.
- **Off:** without `VOICE=on` the Talk button opens a screen that says voice is off and how to switch it on.

**Switch it on (Alex, once).** `OPENAI_API_KEY` is already on the server (lead-list profiles); voice uses it.
```
ssh -o ServerAliveInterval=30 root@178.156.132.86
cd /opt/dulcy-os/engine/deploy
cp .env .env.bak-$(date +%F-%H%M) && chmod 600 .env.bak-*
grep -c '^OPENAI_API_KEY=.' .env     # expect 1 (counts, shows no value)
sed -i '/^VOICE=/d' .env && echo 'VOICE=on' >> .env
bash /opt/dulcy-os/engine/deploy/deploy.sh
```
Optional settings: `OPENAI_STT_MODEL` (default `gpt-4o-mini-transcribe`; `whisper-1` also works), `OPENAI_TTS_MODEL` (default `gpt-4o-mini-tts`), `OPENAI_TTS_VOICE` (default `coral`), `OPENAI_TTS_VOICES=Ada:coral,Atlas:ash` (a voice per agent).

**Cost (estimate, from OpenAI's and Anthropic's public prices; check the bills):**
| Part | Price used | Per minute of talking |
|---|---|---|
| Your words → text (`gpt-4o-mini-transcribe`) | ~$0.003 per audio minute (`whisper-1` ~$0.006) | ~$0.002 (a clip also holds up to ~5 s of quiet before you start) |
| Answer read aloud (`gpt-4o-mini-tts`) | ~$0.015 per minute of speech | ~$0.008 |
| The agent's answer (Claude Opus 5.5, the same call as a typed chat answer) | $4 / $20 per 1M tokens in / out, $0.20 cached | ~$0.06-0.30 (about 3 answers a minute at ~$0.02-0.10 each: skill + RULES mostly cached, up to 4 look-ups, short answers) |
- So the voice part adds about **$0.01 a minute**; almost all the cost is the agent's answers, as in typed chat. A 10-minute talk ≈ **$1-3**. The hourly limit (60 turns) caps it.

**How it works (for Riley):** `engine/src/hq/voice.ts` (checks, limits, `runTurn`, `speakMessage`), `engine/src/providers/openai.ts` (`transcribe`, `speech`), the voice flag in `engine/src/hq/chat.ts` (`VOICE_GUIDE`, added to the agent's instructions only for voice turns). Routes: `GET /hq/api/voice/status`; `POST /hq/api/voice/turn` (`{agent, threadId?, audio: base64, mime, seconds}`; answers as NDJSON lines: `{heard}` then `{done, threadId, reply, speak}` or `{error}`); `POST /hq/api/voice/speak` (`{messageId}` of an agent answer in a chat you may read → one mp3). Owner and members only (clients get 403), same-site JSON writes, "view as" read only. Table `hq_voice_uses` (counts only). Web: `hq/web/src/pages/VoiceMode.tsx` (screen, Talk button) and `voiceSession.ts` (mic, voice-activity check, recorder, playback). Tests: `engine/test/hqVoice.test.ts` (fake OpenAI fetch).

**Next: phone calls (not built).** Calling a real number to reach the agents would need: a phone number (Twilio, or ElevenLabs Agents on a Twilio number); a public WebSocket on the engine for the call's audio (Twilio Media Streams) behind Traefik; real-time speech both ways (OpenAI Realtime or ElevenLabs, with the agent's answer still coming from HQ's chat path through a webhook, so the rules and read-only tools stay the same); who may call (an allow-list of Alex's and Josh's numbers plus a PIN) and how to pick the agent ("Ada" by default, "Atlas please"); a per-call and per-day minute cap; recording off. Prices: UNKNOWN until checked on Twilio's and ElevenLabs' pricing pages (number per month + per minute, on top of the speech and Claude costs above).

### Agents start instantly (2026-11-28)
Alex: "I don't want any agents to run on schedules; it should be like an instant webhook." Riley and Sienna's editor are Claude Code **routines**. The engine now starts a routine **the moment that agent has work**, through the routine's API trigger, instead of waiting for a timer.

**What starts whom:**
| Agent | Starts when | What the routine is told |
|---|---|---|
| Riley | a Riley Decision is approved (✅ in Slack or HQ on "Apply Riley Fix"; after the engine marks the issue Approved/Applied) | "Alex approved: <title> (System Issue rec…). Do step 1 for this issue now" |
| Riley | a "Manual (Alex)" card (Action None) is approved | "Alex approved: <title> (Decision rec…)" + the fix, step 1 |
| Riley | the engine's check opens a **new** System Issue (repeats don't count) | "New System Issue: <title> (rec…). Do step 3 (diagnose)" |
| Riley | **Have Riley fix it** in HQ makes a new task | "Alex asked in HQ (Fix it): <title> (HQ task #…)" + the details |
| Sienna | **Ask Sienna now** / a Sienna Fix it task in HQ | "Alex asked in HQ (Fix it): <title>" + the details |
| Sienna | **Request changes** on a final clip or the full video | "Alex requested changes: Clip changes: <name>" + Alex's note + the HQ link |

The text arrives inside a `<routine-fire-payload>` block; both runbooks (`agents/riley-session.md`, `agents/sienna-editor.md`) say "handle those items first, then the rest of the runbook". Approval rules are unchanged: a start only means the agent looks now.

**Safety built in:**
- **One start per 2 minutes per agent.** Things that happen inside that window wait and go out together as **one** start when it ends (the queue is in the database, so a restart loses nothing). At most **20 starts an hour** per agent (the API allows 30).
- **Never twice:** each start opens a new session and the API has no "same request" key. If the API doesn't answer (timeout, dropped connection) the start is marked "not confirmed" and is **not** sent again. Only clear server errors (5xx, no session made) are retried, 3 times. A "slow down" answer (429) is respected (Retry-After), then one start goes out.
- The token is only in `.env`; it is never logged, stored, shown or returned.
- **Without the settings nothing changes:** the log says once "RILEY_FIRE_URL not set: Riley runs only when started by hand".
- **HQ:** Team → Riley (or Sienna) → **Instant starts**: each start ("Started now", time, the reasons, **Open the session**), and what is waiting for the next one.

**Set it up (Alex, once per agent):**
1. In Claude Code, open the routine (Riley's systems check; Sienna's editor) and add an **API trigger** in its trigger settings. Copy the **fire URL** (`https://api.anthropic.com/v1/claude_code/routines/…/fire`) and the **token** (shown once).
2. In the same routine, **remove its schedule** (the timer). Keep its saved prompt as it is; it already points to the runbook.
3. On the server (the values never show on screen):
   ```
   ssh -o ServerAliveInterval=30 root@178.156.132.86
   cd /opt/dulcy-os/engine/deploy
   cp .env .env.bak-$(date +%F-%H%M) && chmod 600 .env.bak-*
   read -r -s -p "Riley fire URL: " FURL; echo
   read -r -s -p "Riley fire token: " FTOK; echo
   sed -i '/^RILEY_FIRE_URL=/d;/^RILEY_FIRE_TOKEN=/d' .env
   printf 'RILEY_FIRE_URL=%s\nRILEY_FIRE_TOKEN=%s\n' "$FURL" "$FTOK" >> .env
   unset FURL FTOK
   read -r -s -p "Sienna fire URL: " FURL; echo
   read -r -s -p "Sienna fire token: " FTOK; echo
   sed -i '/^SIENNA_FIRE_URL=/d;/^SIENNA_FIRE_TOKEN=/d' .env
   printf 'SIENNA_FIRE_URL=%s\nSIENNA_FIRE_TOKEN=%s\n' "$FURL" "$FTOK" >> .env
   unset FURL FTOK
   grep -c '_FIRE_' .env        # expect 4 (counts the lines, shows no values)
   ```
4. **Deploy** (after this branch is merged to main): `cd /opt/dulcy-os && git pull && bash engine/deploy/deploy.sh`.
5. **Check:** press **Have Riley fix it** on any suggestion in HQ (or approve a Riley card). Team → Riley → Instant starts shows "Started now" with **Open the session** within seconds. If it says "token was refused", do step 3 again with a fresh token.

**Another agent later:** give its routine an API trigger and add `<AGENT>_FIRE_URL` + `<AGENT>_FIRE_TOKEN` (e.g. `ECHO_FIRE_URL`), then add its hooks in the code (`fireAgent(db, cfg, 'Echo', reason, details)`).

**How it works (for Riley):** `engine/src/agents/fire.ts` (`fireAgent`, `flushAgent`, the 15-second sweep `startAgentFires`, `recentFires` for HQ). Tables `agent_fire_pending` (reasons waiting; `dedupe_key` makes one event one reason, e.g. a card approved in HQ and then seen by the Slack loop), `agent_fires` (each start: status started / not confirmed / waiting / failed, reasons, session link), `agent_fire_state` (last start, 429 wait, in-flight lease). Hooks: `rileyApplyStage` and `rileyCollectStage` (`engine/src/agents/riley.ts`), `fixIt` (`engine/src/hq/fixIt.ts`; HQ passes `how` = fixit / approved / changes), Action-None approvals in `engine/src/decisions/loop.ts`. Config: `agentFire` from `<AGENT>_FIRE_URL/_TOKEN` (https only). Web: `hq/web/src/pages/AgentPage.tsx` (Instant starts). Tests: `engine/test/agentFire.test.ts` (fake fetch). The engine's own checks (riley.collect every 15 minutes, etc.) still run on the engine's clock; only the agents' routines lost their timers.

### Switch HQ on (Alex, once)
1. **DNS:** where dulcy.io's DNS is managed, add an **A record**: name `hq`, value = the server's IP (the same IP as the `engine` record), proxy off / DNS only.
2. **Settings:** in `engine/deploy/.env` on the server, add:
   - `HQ_HOST=hq.dulcy.io`
   - `HQ_SESSION_SECRET=` followed by a long random string. Make one with `openssl rand -base64 48`.
   - Keep `ANTHROPIC_API_KEY` (chat) and `AIRTABLE_API_KEY` (data), as now.
3. **Deploy:** `bash engine/deploy/deploy.sh`. The image build also builds the HQ app (no Node needed on the server). The last lines say "Engine is up." and "HQ is up."
4. **Your login:** `cd engine/deploy && docker compose exec engine node dist/src/cli.js hq-user alex@dulcy.io --role=owner --name=Alex`. It asks for the password twice (12+ characters) and shows nothing as you type. Run it again any time to change the password; that signs you out everywhere.
5. Open **https://hq.dulcy.io** and sign in. Traefik gets the HTTPS certificate by itself; the first load can take a minute after the DNS record exists.

### Switch portal.dulcy.io from Softr to HQ (Alex, once, after testing)
1. **Test first, on hq.dulcy.io/portal:** Users → Add client login for one client (or "Make login + link" for one Softr user), open the link in a private window, set a password, and look at every screen. Nothing in Softr or DNS changes during this.
2. **Settings:** in `engine/deploy/.env` on the server, add:
   - `PORTAL_HOST=portal.dulcy.io` (the default; add it so it is visible).
   - `PORTAL_MEETING_URL=` your booking page for client calls (an `https://` link; the old Softr "Schedule Meeting" page was a custom-code block whose link the Softr tools could not read). Leave it out and the page says "reply to any email".
   - While you test before the DNS switch, `PORTAL_PUBLIC_URL=https://hq.dulcy.io/portal` makes setup links open the preview. Remove it at the switch (the default is `https://portal.dulcy.io`).
3. **Deploy:** `bash engine/deploy/deploy.sh`. The last lines say "Engine is up.", "HQ is up." and "Portal is up." (the engine answers portal.dulcy.io locally even before DNS points at it).
4. **DNS (the switch):** where dulcy.io's DNS is managed, change the `portal` record from Softr's target to the server: an **A record** `portal` → the server's IP (the same as `hq`), proxy off / DNS only. Delete the old `portal` CNAME to Softr in the same step. Traefik gets the HTTPS certificate by itself within a minute or two of the record working.
5. **Google sign-in for clients (optional):** in Google Cloud → Credentials → the "Dulcy HQ" OAuth client, add the redirect URI `https://portal.dulcy.io/hq/api/auth/google/callback`. Clients use their own Google accounts, so the OAuth consent screen must be **External** (scopes: `openid` and `email` only; no Google review is needed for those). With "Internal" only @dulcy.io accounts can use it.
6. **Invite the Softr users:** Users → Softr portal users → Show who to invite. For each person of an active client: **Make login + link**, copy, send (email or Slack). They set a password and are in. On 2026-11-26 Airtable Portal Users had 51 rows, 15 of them for the 5 active clients and Dulcy.
7. **After a week with no problems:** in Softr, cancel the plan (or remove the custom domain), and clear the Password column in Airtable Portal Users. Nothing in HQ needs Softr.
- **Roll back:** point the `portal` DNS record back at Softr. HQ keeps working at hq.dulcy.io/portal.

### Optional: "Sign in with Google"
1. Go to console.cloud.google.com, pick (or create) a project, then **APIs & Services**.
2. **OAuth consent screen:**
   - choose **Internal** (only @dulcy.io accounts);
   - app name "Dulcy HQ", your email as support contact;
   - scopes: just `openid` and `email`.
3. **Credentials** → **Create credentials** → **OAuth client ID**:
   - type: **Web application**;
   - **Authorized redirect URI:** `https://hq.dulcy.io/hq/api/auth/google/callback`.
4. Put the two values in `.env` as `HQ_GOOGLE_CLIENT_ID` and `HQ_GOOGLE_CLIENT_SECRET`, then deploy again.
5. The Google button appears on the sign-in page. It only lets in emails that already have an HQ login (step 4 above). To make one for Google sign-in only, use `--google-only`.
6. For the client portal on portal.dulcy.io, also add `https://portal.dulcy.io/hq/api/auth/google/callback` and make the consent screen External (see "Switch portal.dulcy.io" above). There, a Google-verified email that Airtable Portal Users links to one active client gets its client login at once; any other email becomes a request on Users.

### Server commands
- `hq-user <email> --role=owner|member [--name=Josh] [--password-stdin] [--google-only]`: create or update a login.
- Settings for the client portal: `PORTAL_HOST` (default `portal.dulcy.io`), `PORTAL_PUBLIC_URL` (where setup links point; default `https://PORTAL_HOST`), `PORTAL_MEETING_URL` (the "Book a call" page).
- Local development: `npm run dev` in `hq/web` serves HQ at `/hq/` and the portal at `/hq/portal.html`.
- `ask add --agent=<name> --title="..." [...]`, `ask list [--all]`, `ask done <id>`: the "Needs you" asks (see tab 3 above).
- `agent-task upsert|done|list`: an agent's own task list (see "Agent task lists" above).
- Local development: `npm run build:hq` in `engine/` builds the app to `hq/web/dist`. Start the engine with `HQ_WEB_DIR=../hq/web/dist`, then open http://localhost:8080/hq/. Or run `npm run dev` in `hq/web`; it sends API calls to the engine on :8080.

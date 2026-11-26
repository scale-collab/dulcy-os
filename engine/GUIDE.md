# Lead Engine: User Guide

How the Dulcy lead engine works from start to finish, in plain words.
**Keep this file current:** every engine change updates this guide in the same pull request (rule 2026-11-23).
Technical details for developers are in `README.md`.

Last updated: 2026-11-26 (HQ "Content": ideas, Friday, pipeline; before: "Needs you", Clients, sign-up and Users)

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
3. **Times.** Two real open times come from the client's own connected calendar, never a time already offered to another prospect in the last 3 days. If there's none, Echo uses the client's saved booking link.
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
  2. prepares the fix: a retry, a PR (not merged), or an exact n8n / Make / Airtable change with a rollback;
  3. posts one Slack ✅/❌ per issue.
  Once a day he also sweeps Make and Airtable automation errors, and works one known open issue.
- **✅ on a Retry:** the engine re-runs the failed job right away.
- **✅ on any other fix:** Riley makes it live on his next run, checks it worked, and marks it Fixed. For code, he tells you to run the deploy line. n8n changes come as exact steps for you, since the connector can't edit n8n.
- **❌:** nothing changes.

**Switch on:**
- `RILEY=on`, and add `riley.collect,riley.apply` to `LIVE_STAGES`.
- Optional, for n8n errors: `N8N_API_KEY` (n8n → Settings → n8n API → create key) and `N8N_BASE_URL` (default `http://localhost:5678`).

## HQ: your private app (Step 1 "Today", Step 2 "Clients" and "Deliverability", Step 3 "Inbox", "Campaigns", "Content" and "Sales", 2026-11-25/26)

**What it is:** one calm screen at **https://hq.dulcy.io**, on the phone or the computer. It runs inside the engine (same server, same code), and Airtable stays the database. Only people with an HQ login get in. Plan: `hq/PLAN.md`.

**Look:** a sidebar on the computer, tabs at the bottom on the phone (on the phone, Inbox has Team's place in the bottom bar; Team is the people icon at the top). Light or dark follows your phone/computer; the System / Light / Dark switch (bottom of the sidebar, or the screen icon at the top on the phone) pins one on that device.

**The tabs** (plus Users for you):
1. **Today**
   - First things: how many decisions wait on you, and the top 3 of **Needs you** in the "Do now" card (tap one to go straight to it).
   - Ada's brief: the two key lines first ("Waiting on you" and "Top 3"); tap for the rest.
   - Team check: one line per agent: ✓ ran fine, ⚠️ failed (which job and why), or ⚠️ decisions waiting on you.
   - Reports: every agent report as a short card. Tap one for the full text. A Cole call review opens on the score and the 3 fixes (what you said → what to say instead); the full review and the follow-up draft are one more tap away.
2. **Decisions:** the same piles as the Daily Run (Replies = Echo; Campaigns = Atlas, Scribe, Scout; Fixes = Riley; Money = Ledger; Other). One card at a time, with a progress bar.
   - **Replies:** what they wrote, a link to the thread, and the draft in a box you can edit.
     - **Send:** sends the draft as it is (the same as ✅ in Slack).
     - **Send edited:** sends your edited text.
     - **Skip reply:** nothing is sent.
     - The engine's reply sender sends it from the right inbox and closes the card. HQ only presses the buttons on the Emails row (Human Action, and Custom Reply for an edit).
   - **Others:** Issue / Checked / Proposed / On approve, then Approve or Reject. The engine then runs the action, exactly as for a ✅ in Slack.
   - **Later** keeps a card for another time. Keys on a computer: A approve (or send), R reject (or skip reply), S later, E edit the reply (Esc to stop editing). The keys are shown under the buttons.
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
   - **On each card:** the health light (Atlas's grade, the same as the Monday report), a **note for today** (1-2 lines: a bounce over 4%, replies waiting for approval, a campaign at 60%+ with no plan yet, "283 interested / 17 booked in 30 days"), interested and booked in 30 days (vs KPI), replies waiting for approval (Emails "Dulcy Reply Agent State" = Needs Approval) and active campaigns.
   - **Money (owner only):** monthly fee, lifetime revenue (Actual Lifetime Revenue, else Estimated LTV), what the client owes (Outstanding Receivables). A member's answer has no money in it at all (the server leaves it out).
   - **Three tabs on a client:** **Overview** (below), **Inbox** (the Inbox list for this client only) and **AI replier** (its Reply Agent settings, below in 7).
   - **Tap a card:** the 7- and 30-day numbers with trends, the interested → booked rate, money, the campaigns table (progress, bounce % with watch over 2.5% / pause over 4%, interested per 1,000 sent, "plan next" at 60%+ or "next planned" when a campaign plan exists), the **Data check** (Client Type empty, fee missing or on the other record, two workspaces), decisions waiting for this client (tap opens that pile filtered to the client), Atlas's to-do for the client and its Activity Log rows.
   - **Speed and cost:** the Airtable reads are kept for 5 minutes for everyone; the refresh button re-reads (at most every 30 seconds). Atlas owns this data being right.
6. **Chat:** talk to Ada (default) or any agent. History is saved per agent.
   - Chat is **read only**: agents look things up in Airtable and the engine and say where the answer came from. Nothing is sent or changed from chat.
   - When an agent isn't sure, it says "Here's what I found" and who should handle it.
   - Ada can ask another agent for you. That conversation is saved: tap "Read Ada ↔ Atlas" under her answer, or History → "Ada's conversations with the team".
   - Cost: each answer makes at most 5 calls (4 look-up rounds) with capped length (`HQ_CHAT_MAX_ROUNDS`, `HQ_CHAT_MAX_TOKENS`).

7. **Inbox** (Step 3, 2026-11-25): every reply thread for every client, straight from the Airtable Emails table. It replaces the Reply Queue and the reply pages in Airtable for daily use. HQ only reads and presses the same buttons; Echo's drafting and the engine sender are unchanged.
   - **Tabs** (with counts): **To approve** (Dulcy Reply Agent State = Needs Approval, follow-ups included), **Waiting on prospect** (we wrote last and a follow-up is Scheduled; shows the next follow-up date), **Booked** (last 60 days), **Handed to client** (Client Handling or Reply Ownership = Handoff, last 30 days), **Skipped** (last 30 days).
   - **Client chips** filter to one client (the Twenty West pair counts as one); a search box finds a name, company or words. 50 rows a page.
   - **Each row:** prospect + company, client, intent, age (or the next follow-up / booked date), one line of what they said, and flags: Follow-up N, **Link, not times** (the draft has a booking link), **Needs a fact** ([GAP]), **Not sent** (the sender refused; its reason is in the note), **Sending…** once pressed.
   - **Notes on top** (Problem → Data → Fix): replies not sent, drafts with a booking link instead of two times (per client), drafts over a week old.
   - **Tap a row:** their latest message, Echo's reason (and what Echo needs from you), **Offered times** when the draft has them, the draft in an editable box, and **Send / Send edited / Skip reply**: exactly the Decisions reply card's writes (Human Action Approve Draft / Send Edited Reply + Custom Reply / Skip, and the linked decision marked Approved/Rejected with who and when). The engine sender sends within a minute. A booking link in the draft shows a warning (RULES 2026-11-25: two times; a link only as a last resort); it does not block. A draft with a [GAP] can only go out edited. Below: the earlier messages, latest first, quoted text folded. **Open in EmailBison** opens the thread.
   - Keys on a computer: A send, R skip reply, E edit, Esc stop editing.
   - The list is read once a minute for everyone (refresh re-reads after 10 seconds). Members (Josh) can send and skip, like in Decisions.
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

10. **Content** (2026-11-26; you only). The Airtable Content Center (Content OS → Content Center) as one simple area, with the same steps, field names and order, only simpler. You record every **Friday morning**: main channel 2 videos a week (Sienna proposes 4 ideas), Alex Woung Raw 5 a week (8 ideas). The targets come from Content Automation Settings → Videos Per Week. In the sidebar after Deliverability; on the phone it's the **Content card on Today** (no extra icon at the top). Members (Josh) never see it: the server answers 403.
   - **Needs you** (default): only what needs you.
     - **Ideas to approve**, grouped Main / Raw, newest first, each with Sienna's hook, angle and "why now", and who proposed it (Sienna, or the n8n Reddit intake).
       - **Approve** writes exactly what the Content Center's "Approve & schedule" writes: Idea Decision "Approved", Production Stage "Idea Approved", and Recording Date + Publish Date from the same scheduling rule.
       - **Reject** writes exactly what "Reject idea" writes: Idea Decision "Rejected" and both dates cleared.
       - HQ reads the record fresh first. It refuses a duplicate, an idea already decided, and an idea with no channel.
     - **Final videos to check:** only clips Sienna's editor passed (Clip Status "Needs Review" and Editorial Review Notes "Sienna QA: passed …"), grouped by video, with **Watch** and **Decide in Airtable**. Approve and send back stay in the Content Center. Its "Approve reviewed copy" writes Review Intent JSON and then calls n8n, which checks who wrote it, and HQ can't do that, so HQ writes nothing here. Clips Sienna hasn't checked yet are only counted.
     - **Other steps waiting on you** (links only): choose the editing route, approve the thumbnail, upload to YouTube, choose where the clips go, review the posts.
     - A one-line link to the data problems (they are on This week).
     - **Changes from HQ:** every approve and reject (who, when, each field from → to). Table `hq_content_log`.
   - **Friday:** the approved ideas for this Friday, Main / Raw, in recording order (recording date, then publish date). "1/2" means 1 of 2 has a script. It shows **one idea per screen** in big type, with numbered dots, **Previous / Next** (← → on a computer), hooks, the script (Raw: talking points), "check before recording", title options, thumbnail idea and the Gamma outline. The Gamma link shows once a real Gamma doc exists; until then only the outline. It includes leftovers from the last two weeks ("From an earlier week").
   - **Pipeline:** each video's stage, Idea → Approved → Script ready → Recorded → Editing → Final review → Final approved → Posted, from Idea Decision, Production Stage, Status, Script, Thumbnail Status, YouTube URL / Publishing Status and the clips' Clip Status. Filter by channel; tap a stage tile to see only that stage. Tap a row to see the Content Center's **next step**, who does it and which automation runs it. Rows with no date in the last 60 days are left out (counted). There is no client filter: these tables only hold your own channels.
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
     | Generate script by hand | Content Center button | n8n "[Content OS] Generate Teleprompter Script" (2 copies) |
     | Sync Frame.io / Submit to OpusClip / Refresh Opus Clips / Generate Distribution Pack | Content Center (Content Automation Action field) | Airtable automation "Content OS Action Script" → n8n Frame.io Sync / OpusClip Submit and Refresh / Generate Distribution Pack |
     | Thumbnail, Revise thumbnail, YouTube details | Content Center buttons | n8n Generate Thumbnail / Revise Thumbnail / Prepare YouTube Details |
     | Clip approve / reject | Content Center | n8n "[Content OS] Current Clip Review and Preview" |
     | Posts: newsletter, Framer blog, scheduling | Content Center → Posts | n8n Prepare Newsletter Preview / Publish Framer Blog Draft / Schedule Approved Social Posts. **Never from HQ** |
   - **Clean-up for Riley (the same job twice), shown once in HQ:**
     - three script writers: `sienna.prep` + 2 copies of the n8n Teleprompter Script;
     - two idea sources: `sienna.ideas` + the 5 Reddit intakes;
     - final edits: Sienna's editor + the OpusClip buttons.
   - **Speed and safety:** one batched read for everyone (6 list calls plus one call per 50 rows of long text, no per-row calls), kept 1 minute; refresh re-reads after 10 seconds. HQ never posts, schedules or deletes, and never calls OpusClip, Gamma, Frame.io, YouTube, Discord or n8n.

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

**Client portal (portal.dulcy.io, replaces Softr; Step 4, v2 2026-11-26):**
- **What it is:** the same portal clients use in Softr today, now inside HQ, at **https://portal.dulcy.io** once you switch it (steps below). Until then it runs at **https://hq.dulcy.io/portal** for a preview with a client login. The spec (every Softr page, block, table and form) is `hq/portal-softr-inventory.md`.
- **What a client sees** (one menu, grouped; a sidebar on the computer, a bottom bar with Home · Results · Leads · Meetings · More on the phone; light and dark):
  - **Home:** "Is it working?" in one line, then meetings booked and interested replies this month, emails sent (30 days), live campaigns, the next meeting with you, the latest meeting booked for them, their open tasks, and what waits on them (a campaign to review, call feedback to give).
  - **Results:** Email (10 / 30 / 60 / 120 days / all time: sent, replies, interested, meetings, the rates, emails per meeting; every campaign), LinkedIn, AI caller, Direct mail. A channel that is not on for them shows "not active for you yet", never an empty table.
  - **Campaigns:** every campaign in plain words (waiting for your review, being prepared, live, paused, finished), the plan, who we reach, the emails, the numbers. **Review:** Approve, or Request changes (copy / lead list / entire campaign) with notes and the four targeting answers. **Calendar:** launches, starts and finishes.
  - **Leads & pipeline:** the pipeline by stage (12 months) and the leads list (90 days). Each lead: what they wrote, the stage, the call feedback they gave and the deal. Buttons **Give call feedback** (Qualified / Unqualified / No Show / New Date, stars, notes, recording link) and **I closed a deal** (value, date, type, why).
  - **Meetings:** booked meetings, call feedback (missing and given), meetings with you (summaries and recordings), and **Book a call** (a button to your booking page: set `PORTAL_MEETING_URL`; without it the page says "reply to any email").
  - **Tasks & onboarding:** tasks for them (**Mark done**), the onboarding form (read and **Edit answers**; never the LinkedIn password, 2FA or other credential fields), and Getting started (the steps the data proves).
  - **Docs & access:** documents (from Dulcy / from them; never "Internal?" ones), **Access & logins** (the Logins text of their own client record, hidden until they tap Show), and the links to the Dulcy ESP portal and Partnership info.
  - **Billing** (their own invoices: Paid / Due / Unpaid; drafts and hidden ones left out), **Notifications** (Dismiss all), **Account** (name, password).
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

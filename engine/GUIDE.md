# Lead Engine: User Guide

How the Dulcy lead engine works from start to finish, in plain words.
**Keep this file current:** every engine change updates this guide in the same pull request (rule 2026-11-23).
Technical details for developers are in `README.md`.

Last updated: 2026-11-23

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

## Sean: replies drafted for you, approved in Airtable or Slack (2026-11-24)

**What happens:**
1. **Find.** Every `SEAN_EVERY_MIN` minutes Sean finds interested replies waiting on Dulcy from the last 14 days. It skips threads the client handles, and threads that are booked or closed.
2. **Draft.** Sean drafts each answer with Claude, using:
   - your rules, Sean's skill, your Drive SOP findings and the creator methods;
   - the client's own file;
   - that client's real threads that **booked a meeting**;
   - the replies you approved before.
3. **Times.** Two real open times come from the client's own connected calendar, never a time already offered to another prospect in the last 3 days. If there's none, Sean uses the client's saved booking link.
   - **Per-client controls (Inbox Manager → Dulcy Reply Agent screen):** Sean follows each client's own settings:
     - **Enabled** off → Sean drafts nothing for that client (Lead Flo, cancelled).
     - **Reply Controls → Client reply handoff:** *All replies* = the client answers its own replies, Sean stays out (MJJ). *After first agent reply* = Sean answers once, then the client takes over (no follow-ups).
     - **Reply types:** only the ticked types get a draft; others are skipped with the reason shown.
     - **Response Style:** tone, length, agent name, goal, language, templates per reply type, and the **Inbox manager instructions** box (your custom prompt for that client).
     - **Not-interested reply:** on → one courtesy reply following its instructions; off → no reply.
     - **Knowledge Base links:** the only links Sean may share (videos, decks). Add the link there and Sean can send it.
     - **Follow-ups tab:** the plan (steps, delays) and the follow-up instructions box.
     - **Calendar:** booking link, and the switches to stop offering times or links.
4. **Where the draft lands.** On the reply's row in Airtable (Reply Queue): Draft, State "Needs Approval", Intent, **Sean Reason**, and **Sean Needs Your Input** when a fact is missing. It is also posted to Slack.

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
- A Reply Learning row is saved as **Approved**, and Sean learns from it.
- The Slack thread says "Sent".

**Always mirrored.** Sent or skipped from either Airtable or Slack shows in both.

**Switches (server .env):**
- `SEAN_EVERY_MIN` (0 = off) plus `sean.draft` in LIVE_STAGES (otherwise a dry run: Claude is not called).
- `REPLY_SENDER=on` plus `reply.send` in LIVE_STAGES. Only after the old n8n replier is off (`automations/n8n-fix.mjs`, FIX=replier-off).
- `CALENDAR_READER_TOKEN` for client calendars.
- `SEAN_FOLLOWUPS=on` for follow-ups (below). Only after the old n8n follow-up timer is off (FIX=followup-arm-off).

### Sean's follow-ups (2026-11-24)
Your rule: keep following up on a positive reply until they answer or say stop.
1. **When.** A thread is Scheduled with a Due At after every reply we send. Out-of-office and check-back-later replies keep the return date the old intake gave them.
2. **Draft.** When Due At passes and the prospect still hasn't answered, Sean drafts the next follow-up. Each one must have a real reason: their open question, the promised next step, or one new true point. Never "just bumping this". Out of office: welcome back + the open point.
3. **Approve.** Same as replies: the draft lands on the row (Reply Queue) and in Slack as "Follow-up N to …". ✅ or Approve sends it. Nothing goes out without you.
4. **How many.** The client's **Follow-up Plan JSON** (Reply Agent settings: steps with a delay and what each should do). No plan saved: 3 follow-ups at 2, 3 and 5 business days. Then one polite close-the-loop note 7 days later, then the thread is marked **Thread Complete**. A plan with `enabled: false` means no follow-ups for that client.
5. **Stops.** Any answer from the prospect, a stop or unsubscribe, booked/closed, Not Interested, DNC or client-handled. If the prospect wrote, it becomes a normal reply for Sean. If someone already followed up by hand after the draft, the sender refuses to send a second one.

## Bounce agent (Atlas, 2026-11-25)
Your rule: over 4% bounce = pause and investigate (copy, inboxes, list quality, security gateways).
1. **When.** Every bounce check. Each campaign it pauses, or flags over 4% with Skip Bounce Pause ticked, goes to the bounce agent (once every 3 days per campaign).
2. **What it reads.** The campaign's bounce notices in EmailBison (up to 5 pages) and its inboxes (sends and bounces per inbox). Each bounce is sorted: *address does not exist* (list), *blocked / spam / policy* (inboxes or filters), *mailbox full*, other. Security gateways (Mimecast, Proofpoint, Barracuda, Microsoft…) are named.
3. **Cause + one fix**, posted to Slack as a decision ("Bounce 6% on …: …"):
   - **A few inboxes are being blocked** → On ✅: those inboxes are removed from the campaign and it resumes.
   - **Too early to judge** (under 150 contacted) → On ✅: resume.
   - **The list has bad addresses** → keep paused; re-verify the leads not yet contacted and remove risky ones (proposed, Atlas prepares it).
   - **A security gateway is filtering** → keep paused; remove those leads or send them plain text (proposed).
   - **Blocked across all inboxes / mixed** → keep paused; check the Spam Center and the copy.
4. **After a fix**, Skip Bounce Pause is ticked on the campaign (the bounce % counts every email so far, so it would pause again). The watch alert still shows; untick it when the rate is back under 4%.
5. **Switch:** `bounce.investigate` and `bounce.fix` in LIVE_STAGES. Without them it runs as a test and posts nothing.

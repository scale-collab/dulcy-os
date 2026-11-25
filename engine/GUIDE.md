# Lead Engine: User Guide

How the Dulcy lead engine works from start to finish, in plain words.
**Keep this file current:** every engine change updates this guide in the same pull request (rule 2026-11-23).
Technical details for developers are in `README.md`.

Last updated: 2026-11-25 (HQ Step 1)

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

### Sean follows each client's send settings (2026-11-25)
Sean reads every setting on the client's Reply Agent settings row (Inbox Manager → Dulcy Reply Agent).
- **Default Mode.**
  - *Approval Required* (every client today): every draft waits for your Approve or ✅. Nothing changes from before.
  - *Auto High Confidence:* Sean sends by itself only when its confidence is at or above **Minimum Auto Confidence** (92% today).
  - *Autopilot:* Sean sends by itself.
- **Routing groups (per reply type):** a group's mode wins over the Default Mode. *Do Not Reply* types (Unsubscribe, Hostile) are always skipped.
- **OOO Mode = Auto Send:** out-of-office replies may go out by themselves.
- **Always Require Human Review:** the ticked reply types always wait for you, whatever the mode.
- **Max Automatic Replies:** at most this many automatic sends per thread (3 today). After that, you approve.
- **Not Interested Nudge:** ticked → one courtesy reply to "not interested".
- **Out-of-office and not-interested first replies** are drafted only for clients that turn them on: out of office when *Out of Office* is a ticked reply type (or OOO Mode = Auto Send); not interested when the Not Interested Nudge is on. An out-of-office reply is one or two lines, no pitch, and the first follow-up waits until the day after their return date.
- **Office hours** (Timezone, Office Start/End, Exclude Weekends, Exclude US Holidays): automatic sends wait for the client's office hours. Replies you approve go out at once.
- **Never sent automatically:** a draft that needs your input, has a [GAP] or placeholder, or a client that is switched off. All the sender's checks still run.
- **What you see:** an automatic send has no ✅ card. It shows in the Activity log ("Auto-reply queued") and the Slack/Airtable thread says "Sent (approved in auto-send, client settings)". It is not saved as a reply you approved, so Sean doesn't learn from its own sends.
- **Off switch (server .env):** `SEAN_AUTO_SEND=off` → every reply waits for a person, whatever the settings say.

### Sean's follow-ups (2026-11-24)
Your rule: keep following up on a positive reply until they answer or say stop.
1. **When.** A thread is Scheduled with a Due At after every reply we send. Out-of-office and check-back-later replies keep the return date the old intake gave them.
2. **Draft.** When Due At passes and the prospect still hasn't answered, Sean drafts the next follow-up. Each one must have a real reason: their open question, the promised next step, or one new true point. Never "just bumping this". Out of office: welcome back + the open point.
3. **Approve.** Same as replies: the draft lands on the row (Reply Queue) and in Slack as "Follow-up N to …". ✅ or Approve sends it. Nothing goes out without you.
4. **How many.** The client's **Follow-up Plan JSON** (Reply Agent settings: steps with a delay and what each should do). No plan saved: 3 follow-ups at 2, 3 and 5 business days. Then one polite close-the-loop note 7 days later, then the thread is marked **Thread Complete**. A plan with `enabled: false` means no follow-ups for that client.
5. **Stops.** Any answer from the prospect, a stop or unsubscribe, booked/closed, Not Interested, DNC or client-handled. If the prospect wrote, it becomes a normal reply for Sean. If someone already followed up by hand after the draft, the sender refuses to send a second one.

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
Airtable table **Activity Log**: one row per step, with When, Agent (Atlas, Sean, Engine…), Type (Detected, Diagnosed, Fixed, Waiting for approval, Approved, Step done, Step failed) and links to Campaign, Lead List, Email Account and Client. Written by: every finished lead list and campaign job (sample, contacts, verify, build, launch, pause, top up…), the bounce check (pauses), the bounce agent (diagnosis and automatic fixes) and the account health loop. Each Campaign and Lead List record has the linked **Activity Log** field; the Campaigns interface has an **Activity Log** page with dropdowns per campaign / lead list / account / client.

**Bounce agent, automatic fixes (Alex 2026-11-25):** when one account is the cause, it is rested for a week and the campaign is resumed without waiting for ✅; "too early to judge" resumes too. The Slack post then says "Fixed: …". List, copy, domain and gateway fixes stay proposals.

## Ada, the morning brief (2026-11-25)
Every weekday at `ADA_BRIEF_HOUR` (default 8 AM ET) the engine posts one brief to `ADA_CHANNEL` (default Alex's Slack DM, from the Dulcy Agents bot). Read only. Spec: `agents/ada-morning-brief.md`.
- **Waiting on you:** open decisions (replies / follow-ups, bounce, purchases) and the oldest one.
- **Overnight (24 h):** new interested replies per client, meetings booked, replies sent, drafts waiting.
- **Campaigns:** over 4%, watch (2.5-4%), paused in 24 h, past 60% (plan the next one), almost done.
- **Accounts:** resting, to replace, purchases waiting.
- **Agents:** steps per agent from the Activity Log.
- **Top 3** things only Alex can unblock. **Fridays:** weekly scorecard per client (interested, booked, sent; this week vs last).
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

### Sienna: content (Monday ideas, Thursday scripts)
**Monday (`SIENNA_IDEAS_HOUR`, default 10 AM ET):**
- Claude **searches the web** (YouTube views and comments, LinkedIn, X, Reddit, forums; not Reddit alone) for what B2B agency owners and founders are asking now.
- It then adds **2 × your weekly video count** ideas to the Content Center:
  - Status "Review", Idea Decision "Needs Review", source "Generated Idea" (so they show in the Content Center's idea queue);
  - an Idea Score;
  - the evidence URLs and why it's rising now, in the qualification reason.
- Ideas that duplicate an existing title are skipped. You get a Slack list.
- **Pick the ones you want: approve them in the Content Center with a recording date** (the old "Record This Week" tick still works).

**Thursday (`SIENNA_PREP_HOUR`, default 10 AM ET):** every approved idea recording in the next 8 days without a script gets (Production Stage "Script", the same stage the screen uses):
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

## HQ: your private app, Step 1 "Today" (2026-11-25)

**What it is:** one calm screen at **https://hq.dulcy.io**, on the phone or the computer. It runs inside the engine (same server, same code), and Airtable stays the database. Only people with an HQ login get in. Plan: `hq/PLAN.md`.

**The five tabs:**
1. **Today**
   - First things: how many decisions wait on you, and the top "Do now" task.
   - Ada's brief: the two key lines first ("Waiting on you" and "Top 3"); tap for the rest.
   - Team check: one line per agent: ✓ ran fine, ⚠️ failed (which job and why), or ⚠️ decisions waiting on you.
   - Reports: every agent report as a short card. Tap one for the full text. A Cole call review opens on the score and the 3 fixes (what you said → what to say instead); the full review and the follow-up draft are one more tap away.
2. **Decisions:** the same piles as the Daily Run (Replies = Sean; Campaigns = Atlas, Scribe, Scout; Fixes = Riley; Money = Ledger; Other). One card at a time, with a progress bar.
   - **Replies:** what they wrote, a link to the thread, and the draft in a box you can edit.
     - **Send:** sends the draft as it is (the same as ✅ in Slack).
     - **Send edited:** sends your edited text.
     - **Skip reply:** nothing is sent.
     - The engine's reply sender sends it from the right inbox and closes the card. HQ only presses the buttons on the Emails row (Human Action, and Custom Reply for an edit).
   - **Others:** Issue / Checked / Proposed / On approve, then Approve or Reject. The engine then runs the action, exactly as for a ✅ in Slack.
   - **Later** keeps a card for another time. Keys on a computer: A approve, R reject, S later.
3. **To-do** (Airtable Tasks, open ones only). It's sorted into four boxes:
   - **Do now:** urgent and important.
   - **Schedule:** important.
   - **Delegate:** urgent, not important.
   - **Later / drop:** the rest.
   - **Urgent** means overdue, due today or tomorrow, or Priority Urgent. **Important** means Priority Urgent or High, or Client Facing.
   - A task sitting in Review/QA for 7+ days asks "Done already?". Answer **Not yet** and it won't ask again for 7 days.
   - **Add a task** at the top. **▶ Start** gives you one task at a time with a timer, like the Daily Run.
4. **Team:** one card per agent: what it does, who it reports to, its status, decisions waiting and its own to-do list. Open one to see:
   - its to-do list (tick to finish);
   - decisions waiting from it;
   - its reports;
   - its Activity Log rows;
   - its engine runs.
5. **Chat:** talk to Ada (default) or any agent. History is saved per agent.
   - Chat is **read only**: agents look things up in Airtable and the engine and say where the answer came from. Nothing is sent or changed from chat.
   - When an agent isn't sure, it says "Here's what I found" and who should handle it.
   - Ada can ask another agent for you. That conversation is saved: tap "Read Ada ↔ Atlas" under her answer, or History → "Ada's conversations with the team".
   - Cost: each answer makes at most 5 calls (4 look-up rounds) with capped length (`HQ_CHAT_MAX_ROUNDS`, `HQ_CHAT_MAX_TOKENS`).

**Agent to-do lists:** kept in HQ (the Airtable Tasks table has no Agent field). For now one generator fills them, every 30 minutes:
- A running campaign past 60% sent gives Atlas "Plan next campaign for <client>", due in 3 days.
- It is skipped if a campaign plan already exists, and the task closes itself when the plan starts.

**Less Slack:**
- Every report (Ada's brief, Atlas health, Cole reviews, Ledger, Sienna, Riley, account health, bounce pauses, refused launches) is saved in HQ.
- `SLACK_REPORTS=on` (default) still posts reports to Slack too. Set `off` once HQ works for you: then they go to HQ only. Urgent alerts always go to Slack (a campaign paused for bounces, a refused launch, a failed engine job).
- `SLACK_DECISIONS=on` (default) still posts decisions to Slack for ✅/❌. Set `off` to decide in HQ only. Keep `SLACK_BOT_TOKEN` set: the decisions loop still needs it to run.

**Who can see what:**
- `owner` (you) sees everything.
- `member` (Josh later) never sees money or content (Alex, 2026-11-25): no Money pile, and nothing from Ledger or Sienna (cards, decisions, chats, reports). A member sees only their own chats.

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

### Server commands
- `hq-user <email> --role=owner|member [--name=Josh] [--password-stdin] [--google-only]`: create or update a login.
- Local development: `npm run build:hq` in `engine/` builds the app to `hq/web/dist`. Start the engine with `HQ_WEB_DIR=../hq/web/dist`, then open http://localhost:8080/hq/. Or run `npm run dev` in `hq/web`; it sends API calls to the engine on :8080.

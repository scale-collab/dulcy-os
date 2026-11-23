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
| 0 | **Generate Filters** | Reads the list's ICP and client context and writes DiscoLike search filters (the old n8n "Generate filters"). | Small (20 DiscoLike records + 1 AI call) | The filters look right |
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

**Skip Bounce Pause:** when ticked on a campaign, the engine's bounce check never pauses it (for a just-launched campaign where 1 early bounce looks like 10%). It still shows in the watch alert.

**Dry run:** until a button's stage is switched on on the server (LIVE_STAGES), it runs as a dry run: all checks run, nothing changes in EmailBison, and Engine Message starts with "Dry run".

---

## 3. Contact Source: which one to pick

Set **Contact Source** on the list before **Find Contacts**. **Leave it empty for the default.**

| Option | What happens | When to use |
|---|---|---|
| **DiscoLike Contacts Run** (default; also used when the field is empty) | DiscoLike's one-step search: its database first, then web search for companies with nobody, then a real-time email check. Only people with a checked email are delivered and paid for (1 cent each). | Every new list (decided 2026-11-23 after the live accuracy test). |
| **DiscoLike** (legacy, ends 2026-12-31) | DiscoLike's contact database only, no email check. | Only if picked on purpose. |
| **DiscoLike + ContraGen** (legacy, ends 2026-12-31) | Database first, then ContraGen web research on companies under 5 usable contacts. | Only if picked on purpose. |

**Ready for 2027:** every DiscoLike endpoint the default path uses stays after 2026-12-31 (company search, count, exclusion lists, ICP review, DiscoGen, Contacts run). From 2027-01-01 a list still set to a legacy option automatically uses the Contacts run instead of failing. If DiscoLike marks any endpoint we use as retiring (Deprecation/Sunset header), the engine logs a warning: "DiscoLike says this endpoint is being retired".

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

- **2026-11-23:**
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

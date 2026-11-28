# Campaign Center + Lead List Center: HQ parity (2026-11-28)

Alex: "make sure the full implementation of the campaign and lead list center as I said". HQ must do everything the two Airtable screens do, so he never opens Airtable for campaigns or lead lists.

**Sources audited:** the live screens `airtable/custom-elements/campaign-center/source.slim.tsx` and `airtable/custom-elements/lead-list-center/source.slim.tsx` (the older `source.tsx` files are the pre-engine n8n versions; their n8n top-up and sender-update webhooks were replaced by the engine's Top Up and Update Senders and are not counted again), `airtable/SCHEMA.md`, `engine/GUIDE.md`, `hq/feedback-2026-11-27.md`.

**Status:** HAD = HQ already did it (where). BUILT = added on this branch. PARTLY = part of it is in HQ (what is missing). MISSING = not in HQ (why). N/A = left out on purpose by a rule.

**How built items are wired:** each writes exactly what the Airtable screen writes (same field, same value, same webhook body), through `engine/src/hq/centerParity.ts`. Engine stages (Build, Launch, Pause, Update Senders, Top Up, every lead-list stage) stay on the existing route (`centerActions.ts`: Runs on Engine + Engine Action; the engine runs every check). Every write is owner only (members get 403, "view as member" is read only), same-origin + JSON (CSRF), needs `confirm: true`, is refused while an engine step runs on that record, and is logged in `hq_settings_log` as `center:<action>`.

## Totals
| | HAD | BUILT | PARTLY | MISSING | N/A |
|---|---|---|---|---|---|
| Campaign Center (44) | 14 | 25 | 3 | 1 | 1 |
| Lead List Center (40) | 19 | 15 | 3 | 2 | 1 |
| **Both (84)** | **33** | **40** | **6** | **3** | **2** |

(A row marked "HAD + BUILT" is counted as HAD: HQ showed it, this branch added the missing part.)

## Campaign Center (Campaigns table)
| # | Airtable screen: view / field / button | What it triggers | HQ |
|---|---|---|---|
| 1 | Campaign list columns: name, status, progress, total leads, contacted, sent, replies %, bounces %, interested %, meetings % | read | HAD: Campaigns list by stage |
| 2 | List columns: KPI Health chip, Emails / positive reply, Emails / meeting | read | PARTLY: grouped by how it is doing (Today's groups) and Atlas's take; the per-campaign email ratios are on Clients → results per client, not a campaign column |
| 3 | Filters: Clients, Statuses, Workspaces, Health, Date range, search, Clear | read | PARTLY: client dropdown, Show (stage/needs action/past), search. No workspace or date-range filter (Dulcy and Dulcy Free Campaigns are separate clients, so the client dropdown covers workspaces) |
| 4 | Sender accounts chips: Available, Sending, Releasing Soon, Reserved Next, Disconnected, Warming | read | HAD: Sending accounts box (Airtable's names) |
| 5 | Header: New Campaign form (name, targeting sentence, new / existing / no lead list) | Airtable creates: Campaign (Draft, Strategy Draft, client, random 08:xx/18:xx times), Lead List (Source & ICP, DiscoLike, Not Started, Which Campaign?), both links, no Automation Action | BUILT: Campaigns → **By hand** (`POST /campaigns/new`). Atlas's planned **New campaign** stays as it was |
| 6 | Header: Sync with Bison | POST to the bison-sync-relay worker `{source:"Campaign Center", requestedAt}` | BUILT: Campaigns → **Sync with EmailBison** (`POST /campaigns/sync`, same URL and body, host checked) |
| 7 | Row: Launch | Engine Action = Launch Campaign | HAD: campaign page (one confirm) |
| 8 | Row: Pause | Engine Action = Pause Campaign | HAD: campaign page (instant) |
| 9 | Row: Clone | Airtable create (reusable build only) | BUILT: campaign → More → Clone (on the campaign page, not the row) |
| 10 | Row / header: open the Airtable record | expandRecord | N/A: no Airtable links in HQ (RULES 2026-11-27) |
| 11 | Header: View in Bison | link | HAD: Open in EmailBison |
| 12 | Header: Delete (type DELETE, then confirm) | Bison Action = Delete + Campaign Automation Request (an older Bison Action cleared first) → Airtable automation deletes EmailBison, then the record | BUILT: More → Delete (typed DELETE). HQ never deletes a record itself |
| 13 | Automation status (engine + saved status) | read | HAD: header Automation line |
| 14 | Clear saved status | Processing Status, Workflow Message, Workflow Error = empty | BUILT: More → Clear saved status (refused while a step runs) |
| 15 | Overview: Status, Lifecycle | read | HAD |
| 16 | Overview: Recommended next move, bounce watch | read | HAD: needs list, steps, Atlas's take |
| 17 | Overview: Agency vs client benchmarks (positive reply %, meetings %, emails per) | read | PARTLY: on Clients (results per client), not on the campaign page |
| 18 | Overview: KPI performance | read | HAD: number tiles |
| 19 | Overview: Top up · Create lead list | Airtable create: new Lead List copying 36 targeting fields, Top-up Build Scope JSON (exclusion chain), Source & ICP / Not Started, actions empty; Campaign Top-up Lead List link; an unfinished top-up reused | BUILT: More → Top up · Create lead list |
| 20 | Overview: manual top-up KPI exception tick | gate for 19 | BUILT: required when interested < 15% of replies |
| 21 | Overview: Top up campaign | Engine Action = Top Up Campaign | HAD |
| 22 | Overview: top-up status (added, skipped, failed, last run, message) | read | HAD (Automation line) + BUILT (More) |
| 23 | Strategy: campaign name, approach, prep date, estimated launch date | field writes | BUILT: Plan tab → Campaign strategy |
| 24 | Strategy: client-wide pivots (new vertical, new offer) | Workspace IDs field = Enabled / Disabled | BUILT: Plan tab |
| 25 | Strategy: campaign thesis | field write | BUILT: Plan tab |
| 26 | Strategy: lead list Google Sheet link (on the list) | Lead Lists field write | BUILT: lead list → Overview → List |
| 27 | Strategy: linked lead list, change lead list (same client only) | Campaign Lead List link | BUILT: Plan tab → Lead list (refuses another client's list) |
| 28 | Copy: Email 1-4 review subject + body, thread reply 2-4 | field writes | BUILT: Copy tab → Review copy |
| 29 | Copy: Send for approval | Workflow Stage = Client Review, Submitted At = now, Auto Approve At = +48 weekday hours, Approval Source = empty | BUILT: Copy → Approval |
| 30 | Copy: Skip approval + prepare (exception, tick required) | as 32 with Approval Source = Internal approval exception | BUILT |
| 31 | Approval: decision banners, change area, client feedback, extra feedback | read | HAD (Copy view) + BUILT (Approval panel) |
| 32 | Approval: Approve + prepare sequence (client said Approve Campaign) | Version 1 sequence fields from the review copy, Workflow Stage = Approved, Approval Source = Client approved | BUILT |
| 33 | Approval: Move to revision / Mark changes requested | Workflow Stage = Changes Requested | BUILT |
| 34 | Sequence: final sequence, 4 steps x variants A-J (subject, body), thread reply, add variant / step | field writes | BUILT: Sequence tab |
| 35 | Sequence: Refresh from approved copy ("Variant N" parser, counts must match, max 10) | sequence fields + Number of variants per step | BUILT (same parser and errors) |
| 36 | Sequence: Generate validated spintax | create_spintax = true, Campaign Automation Request, Workflow Stage = Spintax in Progress → Airtable automation | BUILT |
| 37 | Sequence: Delete variant (never A) | subject + body = empty | BUILT |
| 38 | Settings: days between, sending days, max emails / new leads, start / end time, time zone, start / end date, plain text | field writes | BUILT: Settings tab |
| 39 | Settings: Skip bounce notification, Skip bounce pause | field writes | BUILT: Settings tab |
| 40 | Settings: Build campaign | Engine Action = Build Campaign | HAD |
| 41 | Senders: the client's inboxes, select / unselect one, select N free, select all matches, unselect all | Email Accounts link | BUILT: Senders → Pick sending inboxes (only the client's inboxes; busy = warning only, RULES 2026-11-23). "Select N" = tick them |
| 42 | Senders: Use recommended (max inboxes from verified leads x delay) | Email Accounts link | MISSING: the recommended-count math is not ported yet (HQ shows daily capacity and free inboxes; the engine's Build still sizes limits to the inboxes) |
| 43 | Senders: Update senders / Sync Bison Senders | Engine Action = Update Senders / POST the n8n sender sync `{source, requestedAt}` | HAD (Update senders) + BUILT (Sync EmailBison senders; needs `BISON_SENDER_SYNC_WEBHOOK_URL` on the server, else refused with that message) |
| 44 | Analytics: sequence performance per step/variant (sent, replies, interested, bounces, rates, sample, leader) | read Sequence Analytics | BUILT: Variants tab (opening the analytics record: N/A, no Airtable links) |

## Lead List Center (Lead Lists table)
| # | Airtable screen: view / field / button | What it triggers | HQ |
|---|---|---|---|
| 1 | List: client, search, stage filter, Clear, counts (showing / ready / processing) | read | HAD: Lead lists |
| 2 | List: Show hidden history | read | HAD: Show tests / Finished 60+ days ago |
| 3 | Rows: name, client, uploaded, stage, progress | read | HAD |
| 4 | New Lead List (name, client, source type, targeting sentence) | Airtable create: Runs on Engine, Draft, Not Started, QA Not Checked, samples 100, target 1,000, Expansion Approval Not Requested | BUILT: Lead lists → **New lead list** (DiscoLike) |
| 5 | New Lead List with source "Third-Party Domains" (domain CSV upload) | Airtable create + file | MISSING: HQ has no domain-file upload yet; refused with a clear message |
| 6 | Open Airtable record | expandRecord | N/A: no Airtable links |
| 7 | Delete lead list | **deletes the Airtable record directly** (no backup) | MISSING: needs Alex's decision (RULES: never delete records; Restart Companies backs up first) |
| 8 | Automation status | read | HAD |
| 9 | Clear status | Processing Status, Workflow Message, Workflow Error = empty | BUILT: Overview (refused while a step runs) |
| 10 | Overview: recommended next step, count tiles | read | HAD |
| 11 | Overview: EmailBison list ID, production leads, linked campaigns | read | HAD + BUILT (list ID) |
| 12 | Overview: link the list to a campaign | Which Campaign? link (same client) | BUILT: Overview → Campaign |
| 13 | Overview: email provider breakdown (before verification / production) | read ESP Breakdown JSON | BUILT |
| 14 | Overview: lead makeup (generic vs direct) | read | HAD |
| 15 | Source & ICP: targeting sentence | field write | BUILT |
| 16 | Source & ICP: Use campaign thesis as targeting sentence (also automatic when empty) | ICP Description = the campaign thesis | BUILT as a button (not automatic: never changes targeting without a press, RULES 2026-11-23) |
| 17 | Source & ICP: Generate filters | Engine Action = Generate Filters | HAD |
| 18 | Source & ICP: point-and-click search plan (industry groups in/out, business model, countries / states, map circle / rectangle, lookalike text / domains, homepage keywords, tech stack, social, language, subdomain) | Company Filters JSON | PARTLY: the exact filters JSON editor (every key) + employee range; the pickers are not ported |
| 19 | Source & ICP: exact DiscoLike filters JSON | field write | BUILT (must be a JSON object) |
| 20 | Source & ICP: search relevance / legacy similarity migration | Company Filters JSON | PARTLY: editable in the JSON; no dedicated control |
| 21 | Source & ICP: Check TAM | TAM Check JSON = requested | HAD |
| 22 | Company Review: summary, fit numbers | read | HAD |
| 23 | Company Review: Run company sample | Engine Action | HAD |
| 24 | Company Review: Approve company sample | Company Sample Approved tick | HAD |
| 25 | Company Review: Expand companies | Engine Action | HAD |
| 26 | Company Review: Back up and restart | Engine Action = Restart Companies | HAD |
| 27 | Company Review: usable company target, sample size | field writes | BUILT |
| 28 | Company Review: deep review settings (Use DiscoGen deep review, prompt, extra requirements) + results link, needs-review count | field writes / read | BUILT |
| 29 | Contact Review: role presets, people per company, seniority, contact countries / states, Use all US states, Clear selections | Contact Persona DNA + Contact Filters JSON | PARTLY: persona text and the contact filters JSON (results_by_company, seniority, person_country, person_state) are editable; the preset buttons are not ported |
| 30 | Contact Review: custom persona, exact contact filters JSON, contact sample size | field writes | BUILT |
| 31 | Contact Review: summary, contact sheet | read | HAD |
| 32 | Contact Review: Find contacts (sample), Approve contact sample, Find all contacts | Engine Action / tick | HAD |
| 33 | Verification: include generic / direct (sets the verifier fields to MillionVerifier) | field writes | BUILT (fixed once verified, like the screen) |
| 34 | Verification: LeadMagic recovery tick | Use LeadMagic Fallback | BUILT |
| 35 | Verification: Verify and finalize, Recover with LeadMagic | Engine Action | HAD |
| 36 | Verification: SEG rule, SEG providers, generic footprint 200 or less | field writes | BUILT |
| 37 | Enrichment: custom enrichment instructions | field write | BUILT |
| 38 | Enrichment: Prepare prompt, Run, Skip | Engine Action | HAD |
| 39 | QA: check results, summary; manual QA status (Passed only after QA with the workflow done; moves the list to Ready; withdrawing moves Ready back to QA) | read / QA Status + stage (the screen's own gate) | BUILT (same gate and errors) |
| 40 | QA: Run automated QA; Build campaign lives in the Campaign Center | Engine Action | HAD |

## Needs Alex's decision
1. **Delete lead list** (Lead List Center #7): the Airtable button deletes the record directly, with no backup. Build it in HQ (typed DELETE, like the campaign Delete), or leave lists to Restart / hide only?
2. **Delete campaign** is built exactly as the screen (Airtable automation deletes EmailBison, then the record). RULES 2026-11-23 says "Delete stays in n8n for now": HQ only presses the same automation, it does not delete itself. Keep it in HQ, or hide it?
3. **Server setting:** `BISON_SENDER_SYNC_WEBHOOK_URL` (the n8n sender-sync path is secret, not in the repo). Until it is set, Sync EmailBison senders says so and sends nothing. Sync with EmailBison uses the relay URL from the screen by default (`BISON_SYNC_WEBHOOK_URL` overrides it).

## Still to build (next)
Use recommended inboxes (#C42), the point-and-click search-plan and contact pickers (#L18, #L29), a search-relevance control (#L20), third-party domain lists (#L5), campaign workspace / date-range filters and benchmark ratios on the campaign page (#C2, #C3, #C17).

# Make.com export, 2026-11-17

All 79 scenarios were pulled read-only (org Dulcy, team `629049`, zone us1). Nothing was run, edited or replayed. `INDEX.md` lists every scenario; `scenarios/` holds the cleaned blueprints.

Removed before commit: API keys (Slack bot token, EmailBison, HeyReach, Stripe webhook secrets), Make, n8n and Airtable webhook paths, sample run data, example values (which held real lead emails), and user emails. A check confirmed none of the 32 secret values found in the raw files are left. The remaining `detect-secrets` hits are Close custom-field IDs.

## Status
- 79 scenarios, 28 on. 51 off: deprecated items, client templates, Real Estate OS, Sendspark and old copies.
- Last 30 days (since 2026-10-18), on scenarios: 18 ran, 10 had no runs. **2 errors in total.**

| Active scenario | Runs (30d) | Errors |
|---|---|---|
| [LinkedIn] Search for HeyReach Campaigns not yet attached | 150+ | 0 |
| [9.0 CLIENT] Booked Meetings | 131 | 1 (Bad Gateway, 2026-11-12, then fine) |
| [LinkedIn] Positive Reply -> LinkedIn Campaign | 88 | 0 |
| [ZBuyer] Leads (Melisa) | 39 | 0 |
| [Content OS] Reddit RSS Relay — n8n | 18 | 0 |
| Fathom Recording to Close (Alexander) / (Client) | 14 / 14 | 0 |
| [1.0 PRECALL] Booked Meeting | 10 | 1 (see below) |
| [1.2 PRECALL] Schedule Reminders | 8 | 0 |
| [Airtable] Sales Center Opportunity Status Update | 7 | 0 |
| [1.1 PRECALL] New Lead / [2.4] Handle No Show | 6 / 6 | 0 |
| Existing Lead, Canceled Meeting, Remap Reminders, Call Done, Call Feedback | 1-2 each | 0 |
| No runs: Booked Meeting GHL, Remap Reminders Disqual, Client Closed a Deal, Content Script Creator, Email Account Updates, Fathom (Sales Rep), Explain Reply, Push To Client Reply, Slack Bot Interactions, Ignition Dev x2 | 0 | 0 |

## Problems found

### 1. `[1.0 PRECALL] Booked Meeting` (2482146) breaks on the lead source answer
- **What happened:** On 2026-11-12 the Airtable step returned `[422] Insufficient permissions to create new select option ""Google""`. The run stopped and the scenario stopped processing until Alex restarted it by hand about 12 minutes later.
- **Why:** The lead source comes from the Calendly answer at position 10 (`questions_and_answers[10]`). This time the answer arrived with quote marks (`"Google"`). The Airtable field `Sales Data / Lead Source` has a `Google` option, but `"Google"` with quotes does not match.
- **Also fragile:** every Calendly answer is read by its position. Reordering or adding a Calendly question shifts every field.
- **Fix (Alex decides):** strip quotes and trim the lead source before the Airtable step, or map it to the allowed options with a fallback. Longer term, match Calendly answers by question text, not position.

### 2. Failed runs are not kept for retry
All 28 active scenarios have "Allow storing of incomplete executions" off (`dlq: false`). When a run fails, its data is lost and has to be redone by hand. **Fix (Alex decides):** turn it on, at least for Booked Meeting, Booked Meetings (client), New/Existing Lead and Schedule Reminders.

### 3. The old Make reply inbox is filling up
The Make webhook "Receive replies from EmailBison" has **650 of 667** queue slots full, and its scenario `[INBOX MANAGER] Receive Replies from EmailBison` (3816555) is off. Something is still sending replies to Make. Replies now go to n8n (`bison-replies`). Results of the per-workspace EmailBison check are below.

### 4. Other queues holding unprocessed items (scenario off)
- 3 Close "Lead Status Changed" hooks (Real Estate OS, connection "millennium interstate realty"): 32 items each.
- "GHL SMS Reply" hook: 8 items. Its scenario is `[1.3 PRECALL] Remap Reminders (Client)` (off). The hook name and scenario name do not match.
- "Canceled-Meeting": 1 item.

### 5. Not Dulcy-agency work? (UNKNOWN)
The `Real Estate OS` folder (ZBuyer, Realtor.com, Close for "millennium interstate realty") and `Ignition Dev` (Discord) look like other businesses. `[ZBuyer] Leads (Melisa)` is on and ran 39 times. UNKNOWN whether these belong in Dulcy's system.

## How Make connects to the rest
- Airtable automations call Make for: Call Feedback Sync, Positive Reply -> LinkedIn, Push To Client Reply, Email Accounts - Update, Inbox Manager - Explain Reply, Webhook to Make for WON (→ [9.0 CLIENT] Booked Meetings), Search HeyReach for Email Campaigns, and Close a Deal Sync.
- n8n calls Make for the 5 Content OS Reddit weekly intakes (→ Reddit RSS Relay).
- Make calls n8n from: [9.0 CLIENT] Booked Meetings, [Slack Bot] Interactions, and [ZBuyer] Leads (Melisa).
- The sales process (Calendly → Close → Airtable Sales Data → Slack) runs entirely in Make: 1.0–2.4 PRECALL/POSTCALL.

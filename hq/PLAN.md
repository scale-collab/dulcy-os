# Dulcy HQ: plan v1 (2026-11-25)

**Goal (Alex):** one private place to run the business: decisions, to-dos, agents, clients and work. It replaces scattered Airtable interfaces, Slack DMs, bots and tools. It's built in steps, without slowing the business down.

## How it's built
- **The app:** a private web app at `hq.dulcy.io`, on our existing server next to the engine. No new hosting cost.
- **Data:** Airtable stays the database behind it. The engine stays the agents' "office", so HQ only shows and asks; the agents do the work.
- **Login:** Google sign-in, allowed emails only. Alex now; Josh later, with limits (no keys, no money).
- **Cost:** the server is already paid for. Chats with agents use the Claude API, paid per use.
- **Devices:** works on phone and desktop.

## Step 1: Today (build first)
1. **Decisions:** cards one at a time, in piles (Replies, Campaigns, Fixes, Money, Other). Approve, reject or skip, the same as a ✅ in Slack.
   - Later each person sees their own pile (Josh: replies).
2. **To-do list (Eisenhower):** from the Tasks table, sorted into Do now (urgent + important), Schedule (important), Delegate (urgent, not important) and Drop.
   - Stale tasks get a "Done?" tap, so finished work stops sitting in Review/QA.
   - Quick add.
3. **Ada's brief:**
   - what happened, what's waiting, what to do first;
   - the **team check**: one line per agent, done or what's off.
4. **Talk to Ada (and any agent):**
   - a chat with history per agent;
   - Ada asks the other agents for you, and you can read those conversations;
   - answers cite where they came from; if an agent isn't sure, it says "here's what I found" and flags a person (EmailBison-help style).
5. **Agent to-do lists:** each agent's own tasks with deadlines (e.g. "GMG campaign at 60% → plan next, due Fri"). Ada watches them.

### Step 1 status (2026-11-25): built, not deployed
- **Built:** in the engine (`engine/src/hq/`) and `hq/web/`. How to use it and switch it on: `engine/GUIDE.md` → "HQ".
- **Login:** email + password, plus optional Google sign-in for existing HQ users. Alex creates his login on the server with `hq-user`.
- **Screens:** Today (first things, Ada's brief, team check, reports), Decisions, To-do (Eisenhower + Start mode; replaced in the menu by "Needs you", below), Team (agent cards and pages), Chat.
- **Decisions:**
  - Reply cards are editable: Send / Send edited / Skip reply. HQ presses the Emails row's buttons; the engine's reply sender sends.
  - Other decisions write exactly what the Daily Run writes.
- **Reports:** agents' reports are saved for HQ. `SLACK_REPORTS` and `SLACK_DECISIONS` (both `on` for now) turn the Slack copies off. Urgent alerts always go to Slack.
- **Agent to-do lists:** kept in HQ's own table, not in Airtable (no Agent field was added). One generator so far: Atlas, "Plan next campaign" at 60%+.
- **Josh:** the `member` role is ready (no Money). His login is Step 4.
- **Left for Alex:**
  1. Add the `hq` DNS record.
  2. Set `HQ_SESSION_SECRET`.
  3. Deploy.
  4. Run `hq-user`.
  5. Optional: set up Google sign-in.
  6. When HQ works: set `SLACK_REPORTS=off` and `SLACK_DECISIONS=off`.
- **Not in Step 1:** Ada's brief has no calendar yet; chat can't change anything (read only by design); the other agents' to-do generators come later.

### "Needs you" replaces To-do (Alex, 2026-11-25): built, not deployed
- Alex: "the to-do shouldn't be like another project management, more like 'this is what you need me to do'".
- **What it shows:** only what the agents need from the person signed in, each with the agent's face, one line, why and one action; "Do now" and "When you can".
  - Decisions as one item per pile (never per decision), Riley's System Issues in "Waiting for Alex" + "Manual (Alex)" (steps from the Fix; done = approve its decision), sign-ups (owner), and asks (`hq_asks`: `addAsk()` in `engine/src/hq/asks.ts` or the CLI `ask add`). Done / Not now (tomorrow or Monday) on asks and issues.
  - Items leave by themselves when resolved. Members get only what they can act on.
- **Where:** `engine/src/hq/needs.ts` (API `/hq/api/needs`, `/hq/api/asks/<id>/done|snooze`, `/hq/api/needs/issue/<rec>/snooze`), `hq/web/src/pages/Needs.tsx`. Today's "Do now" card shows the top 3. The Eisenhower page stays at `#/tasks`, out of the menu.
- **Not yet:** Atlas's to-dos are not included (none is assigned to a person); no agent calls `addAsk` on its own yet (asks come from the CLI or a Claude session).

## Step 2: Clients
- One screen with every client: results (email now; LinkedIn, AI caller and direct mail later), health, money (Alex only) and a note for today.
- Replaces: Clients & LTV (wrong today: shows 3 active), Email/LinkedIn/AI Employee campaign dashboards, Domain & Inbox Inventory, Email Accounts / Warm Up, Inbox Placement Tests, Spam Center, Buying Domains.

### Step 2 status (2026-11-25): Clients screen built, not deployed
- **Built:** `engine/src/hq/clients.ts` (API `/hq/api/clients`, `/hq/api/clients/<id>`) and the Clients tab in `hq/web/`. How to use it: `engine/GUIDE.md` → "HQ".
- **What it shows:** one card per client, worst health first: Atlas's health light and reasons, a 1-2 line note for today, interested / booked (7 and 30 days, vs KPI), replies waiting for approval, active campaigns (bounce watch > 2.5%, pause > 4%, interested per 1,000 sent, 60%+ → plan next, and whether a campaign plan exists). Money (fee, lifetime revenue, receivables) for the owner only, cut on the server. Detail page adds the campaigns table, a data check, the client's decisions (tap → the pile filtered to that client), Atlas's to-do and the Activity Log.
- **Counting:** active clients by default (Inactive switch for the rest). Workspaces that are one client count once (Twenty West Media + "(Internal)"; Dulcy + Dulcy Free Campaigns). Same Airtable reads and grade as Atlas's Monday report (shared code in `engine/src/agents/atlas.ts`). Airtable reads cached 5 minutes.
- **Data problems it shows (for Atlas to fix in Airtable):** MJJ Brilliant and The Marketing Cartel have no Client Type and no Monthly Fee (that is why "Clients & LTV" shows 3 active); Twenty West's $2,500 fee, $8,985 revenue and $4,995 owed sit on the inactive record while the active "(Internal)" record has $0.
- **Also built (Alex, same day):** sign-up requests and a Users page (approve / deny / role / disable / reset / add; owner only). See GUIDE "Sign-up and Users".
- **Not in Step 2 yet:** LinkedIn, AI caller and direct-mail results; the domain, inbox, warm-up, placement and spam screens.

## Step 3: Work areas
- **Campaigns:** the Lead List and Campaign Centers rebuilt without Airtable's size limit, with the Activity log inside each campaign (code ready: `airtable/custom-elements/campaign-center/activity-log.pending.tsx`).
- **Inbox:** one inbox, per client, replacing New Replies, Follow Ups, Positive Replies, Won/Lost, Meeting Requests and the Reply Agent pages. (Built 2026-11-25, see "Step 3 status" below.)
- **Sales:** contracts and agreements (the same flow that works now, with cleaner screens), plus the executive dashboard.
- **Content:** the Content Center and OpusClip (Sienna).

### Step 3 status (2026-11-25): Inbox built, not deployed
- **Built:** `engine/src/hq/inbox.ts` (API `/hq/api/inbox`, `/hq/api/inbox/<rec>`), `engine/src/hq/replier.ts` (API `/hq/api/clients/<rec>/replier`, `/hq/api/clients/<rec>/calendar-invite`), `hq/web/src/pages/Inbox.tsx` and `Replier.tsx`, and the client hub tabs (Overview · Inbox · AI replier). How to use it: `engine/GUIDE.md` → "HQ" → 7. Inbox.
- **Inbox:** all clients, client chips, five tabs (To approve, Waiting on prospect, Booked, Handed to client, Skipped), thread view with Send / Send edited / Skip (the Decisions reply card's writes), a booking-link warning, offered times and the EmailBison link. Read cached 60 seconds; 50 a page.
- **AI replier:** the client's Reply Agent settings, owner edits (members read), validated, only changed fields written, every save logged. "Get calendar link" needs `CALENDAR_ADMIN_TOKEN`.
- **Data problems found in Airtable (read only, 2026-11-25; for Echo/Atlas to fix):**
  1. 107 drafts wait in Needs Approval (27 replies + 80 follow-ups); the oldest is from Oct 1.
  2. 38 of those 107 drafts offer a booking link, not two times (Calendly 24, Cal.com 10, HubSpot 3, LeadConnector 1): 7 of 8 settings rows have times switched off (Calendar Settings JSON `disableTimes: true`) and no connected calendar. Only Dulcy is connected (Google).
  3. 2 reply drafts sit on threads where we already wrote last ("Last Email Sent By Dulcy"): the sender will refuse them.
  4. 1 draft waits for Lead Flo Marketing (inactive; its replier is off).
  5. Emails "Last Email Sent" has two stray options: an email address and "Custom Reply".
  6. Settings: Agent First Name is empty on 7 of 8 rows; Calendar Link is empty for MJJ Brilliant, The Marketing Cartel and Collabor; Dulcy's office hours (09:30-17:00) differ from its calendar note (09:00-18:00).
- **Not yet:** search inside the full history; per-person piles (Josh's own queue); writing the calendar JSON switches (times on/off) from HQ.

### Step 3 status (2026-11-25): Campaigns built, not deployed
- **Alex's rule:** too many Airtable screens (Campaign Center, Lead List Center, email / LinkedIn / AI-call statistics). Show what needs action first; everything else one tap deeper.
- **Built:** `engine/src/hq/campaigns.ts` (API `/hq/api/campaigns`, `/hq/api/campaigns/<rec>`) and `hq/web/src/pages/Campaigns.tsx`. How to use it: `engine/GUIDE.md` → "HQ" → 8. Campaigns.
- **Screens:** Needs action (bounce pause/watch, failed step, stuck 3+ days, 60% with no next plan, client review, low interest per 1,000), All live, Building, Pipeline (List → Copy → Client review → Launch → Live → 60% → Next), client chips, data notes, and a campaign page with stats, stage history (engine jobs + campaign plans) and the Activity log. LinkedIn and AI caller show "Channel paused" with the reason.
- **Read only:** no writes anywhere. Buttons open Airtable or EmailBison; Campaign Center keeps its buttons until an HQ-safe action exists for them.
- **Not yet:** HQ buttons for Build / Launch / Pause / Top up (need an engine action that writes exactly what the Airtable button writes); LinkedIn and AI caller numbers (channels paused); the Lead List Center's own screens (sample review, contact decisions) for lists not tied to a campaign.
- **UNKNOWN until checked on live data:** which fields "Status Last Modified" watches (used for "stuck"); the Activity Log's link field name ("Campaign" is assumed for the by-name read; the shared newest-500 read does not depend on it).

## Step 4: People and clients
- Josh's login with permissions.
- The client portal inside the same app. (send.dulcy.io is EmailBison's white-label with its own login: check later whether it can share a login.)

## Clean-up alongside (Riley)
- Old and duplicate n8n, Make and Airtable automations.
- Unused pages: Client Offers, Internal Lead Requests, the old mobile pages, Inbox Manager backups.
- Retire each Airtable page only once its HQ replacement is better.

## Open decisions for Alex
1. Is `hq.dulcy.io` OK as the address?
2. Is Google sign-in OK, or email + a code?

## Order (Alex, 2026-11-25)
1. Plan HQ (this file).
2. Inbox replier: per-client settings and behaviour.
3. Content Center.
4. Then build HQ Step 1, Step 2 and on.

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
- **Not yet:** no agent calls `addAsk` on its own yet (asks come from the CLI or a Claude session).

### Agent task lists + Needs you by day (Alex, 2026-11-25): built, not deployed
- Alex: "To create new campaigns and bounce protection, it all gets sent to my project management. It's a little too much. ... the task should be assigned to them, and we could see and ask for progress." And: "I need this to be very autonomous." And: "here's today's to-do list, and you could look at tomorrow's and yesterday's."
- **Agent tasks (HQ's own database, never Airtable Tasks):** each task has a status (Not started · In progress · Waiting on you · Done), a due date, when it last moved and a one-line progress note. The engine opens, moves and closes them itself (`upsertAgentTask` in `engine/src/hq/agentTasks.ts`, one task per key).
  - **Atlas:** "Plan next campaign" at 60%+ (as before), and one task per new campaign that follows the plan step by step until it is live.
  - **Atlas (bounce + inbox health):** one task per bounce investigation (queued → diagnosed → fixed, or waiting on Alex's ✅) and per rested inbox (until its retest: recovered or replaced).
- **Team:** "Agent work" on top (open, late, stuck per agent), task chips on each card; each agent page lists its tasks with status and progress, done ones folded, and **Ask for an update** (chat, question typed in).
- **Ada:** her morning brief has an "Agent work" section: late or stuck (no update for 2+ days), one line each. A stuck task with an engine job is re-queued (normal queue and LIVE_STAGES, once a day, at most 3 times).
- **Needs you by day:** Yesterday (what got handled) · Today (what is due now, money and client-facing first, then the oldest; plain rules, no AI call per load) · Tomorrow (back from Not now + due tomorrow). Asks can have a due date and Money / Client flags.
- **Chat:** "where is X?" answers from the tasks and cites "HQ task #id".
- **How to use it:** `engine/GUIDE.md` → "HQ" → tabs 3 and 4, and "Agent task lists".
- **Open for Alex:**
  1. Bounce checks and account rests are on **Atlas's** list, matching the Activity Log and Decisions (pile Campaigns). Riley stays systems-only (CLAUDE.md).
  2. A new campaign is due **a week** after its plan starts (a default). Another target?
  3. Not yet: Echo, Scout, Scribe, Cole, Ledger and Sienna open no tasks by themselves (their jobs are scheduled runs, not long work). Add them when they get long-running work.

## Step 2: Clients
- One screen with every client: results (email now; LinkedIn, AI caller and direct mail later), health, money (Alex only) and a note for today.
- Replaces: Clients & LTV (wrong today: shows 3 active), Email/LinkedIn/AI Employee campaign dashboards, Domain & Inbox Inventory, Email Accounts / Warm Up, Inbox Placement Tests, Spam Center, Buying Domains.

### Step 2 status (2026-11-25): Clients screen built, not deployed
- **Built:** `engine/src/hq/clients.ts` (API `/hq/api/clients`, `/hq/api/clients/<id>`) and the Clients tab in `hq/web/`. How to use it: `engine/GUIDE.md` → "HQ".
- **What it shows:** one card per client, worst health first: Atlas's health light and reasons, a 1-2 line note for today, interested / booked (7 and 30 days, vs KPI), replies waiting for approval, active campaigns (bounce watch > 2.5%, pause > 4%, interested per 1,000 sent, 60%+ → plan next, and whether a campaign plan exists). Money (fee, lifetime revenue, receivables) for the owner only, cut on the server. Detail page adds the campaigns table, a data check, the client's decisions (tap → the pile filtered to that client), Atlas's to-do and the Activity Log.
- **Counting:** active clients by default (Inactive switch for the rest). Workspaces that are one client count once (Twenty West Media + "(Internal)"; Dulcy + Dulcy Free Campaigns). Same Airtable reads and grade as Atlas's Monday report (shared code in `engine/src/agents/atlas.ts`). Airtable reads cached 5 minutes.
- **Data problems it shows (for Atlas to fix in Airtable):** MJJ Brilliant and The Marketing Cartel have no Client Type and no Monthly Fee (that is why "Clients & LTV" shows 3 active); Twenty West's $2,500 fee, $8,985 revenue and $4,995 owed sit on the inactive record while the active "(Internal)" record has $0.
- **Also built (Alex, same day):** sign-up requests and a Users page (approve / deny / role / disable / reset / add; owner only). See GUIDE "Sign-up and Users".
- **Not in Step 2 yet:** LinkedIn, AI caller and direct-mail results. (The domain, inbox, warm-up, placement and spam screens: built as Deliverability, below.)

### Step 2 status (2026-11-25): Deliverability built, not deployed
- **Built:** `engine/src/hq/deliverability.ts` (API `/hq/api/deliverability`, `/inboxes`, `/placement`, `/domains`) and the Deliverability tab in `hq/web/` (after Campaigns in the sidebar; envelope icon at the top on the phone). How to use it: `engine/GUIDE.md` → "HQ" → 8. Deliverability.
- **Replaces:** Spam Center, Email Account Center, Domain & Inbox Inventory, Email Accounts / Warm Up, Inbox Placement Tests, Buy Domains & Inboxes. Retire each once Alex has used HQ instead.
- **What it shows:** Needs attention by default (4 tiles: healthy / watch / sick / resting, overall and per client; one line per sick inbox or domain with the reason, owner and what the engine is already doing); All inboxes; Placement tests (newest per client and domain, late-scores warning); Domains (inbox count, expiry, blacklist, replacements, purchase requests).
- **Read only:** no writes anywhere, no buying; buttons open Decisions or the Airtable record.
- **Data problems found in Airtable (read only, 2026-11-25/26):**
  1. **Placement scores:** the newest test is 2026-11-21 (11,646 tests in all; 6,541 in the last 45 days). The n8n "Check Results" workflow was not visible in the audit, and the health loop only reads tests from 11-26, so it needs Friday 11-27's. HQ shows this as a warning until they land.
  2. **The health loop hasn't acted yet:** Spam Protocol Stage is empty on all 1,200 Email Accounts; the Spam Remediation Queue is empty.
  3. **182 Email Accounts have Status "Spam"** (set before the engine's loop; HQ shows them as sick "Marked Spam in Airtable").
  4. **347 of 1,200 Email Accounts have no Domains link** (HQ groups them by the email's domain).
  5. **No domain has a Renewal Date** (0 of 607): expiry is UNKNOWN, so HQ can't warn before one lapses.
  6. Blacklist: 0 domains Listed; last checks 11-20.
- **Not yet:** the Spam Center's bounce charts (bounce codes, providers, trend); writes of any kind (warm-up on/off, limits, bulk controls stay in Airtable); a domain-level placement history chart.

## Step 3: Work areas
- **Campaigns:** the Lead List and Campaign Centers rebuilt without Airtable's size limit, with the Activity log inside each campaign (code ready: `airtable/custom-elements/campaign-center/activity-log.pending.tsx`).
- **Inbox:** one inbox, per client, replacing New Replies, Follow Ups, Positive Replies, Won/Lost, Meeting Requests and the Reply Agent pages. (Built 2026-11-25, see "Step 3 status" below.)
- **Sales:** contracts and agreements (the same flow that works now, with cleaner screens), plus the executive dashboard.
- **Content:** the Content Center and OpusClip (Sienna). (Built 2026-11-26, see "Step 3 status: Content" below.)

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

### Step 3 status (2026-11-26): Content built, not deployed
- **Alex's rule:** show what needs Alex first; everything else is one tap deeper. Keep the Content Center's workflow and the n8n automations; only simpler.
- **Built:** `engine/src/hq/content.ts` (API `/hq/api/content`, `/content/summary`, `/content/ideas/<rec>`; owner only, members get 403) and `hq/web/src/pages/Content.tsx` (sidebar after Deliverability; on the phone a card on Today). How to use it: `engine/GUIDE.md` → "HQ" → 10. Content.
- **Screens:**
  - Needs you: ideas to approve per channel; final clips Sienna passed; other steps waiting on Alex.
  - Friday: one idea per screen, big type, Previous / Next, count vs target (main 2, Raw 5).
  - Pipeline: Idea → Approved → Script ready → Recorded → Editing → Final review → Final approved → Posted, with the Content Center's next step and the automation behind it.
  - This week: proposed / approved / recorded / posted vs target, plus data problems.
- **The one write:** Approve / Reject an idea, exactly the Content Center's "Approve & schedule" / "Reject idea" fields:
  - Idea Decision;
  - Production Stage "Idea Approved";
  - Recording + Publish Date, from the same rule (`nextIdeaDates`).
  - Logged in `hq_content_log`. After Approve, the engine's `sienna.prep` writes the script.
- **Links only:** clip approval (the Content Center's approve goes through the n8n Current Clip Review flow, which checks who wrote the request), thumbnail approval, editing route, YouTube upload, posts. HQ never posts, schedules, deletes or calls n8n, OpusClip, Gamma, Frame.io, YouTube or Discord.
- **Data problems it shows (demo-checked, live numbers on deploy):**
  1. rows "Scheduled" with no proof of posting (17 known);
  2. approved ideas with no script after 1 day;
  3. clips without Sienna's QA note;
  4. main recording dates not on Friday;
  5. ideas waiting 14+ days.
- **For Riley's clean-up (same job twice):**
  - scripts: `sienna.prep` + 2 copies of the n8n Teleprompter Script;
  - ideas: `sienna.ideas` + 5 n8n Reddit intakes;
  - final edits: Sienna's editor + the OpusClip buttons.
- **Open for Alex:**
  1. **Recording day.** The Content Center's approve sets the main channel's recording date to the Sunday before the publish week (or today), not Friday. HQ writes the same dates, so the two agree, and it flags the mismatch. Confirm Friday, then Riley changes the rule in both.
  2. **Clip approve / send back in HQ.** This needs an engine path the n8n review flow accepts. UNKNOWN until Riley checks the ledger.
  3. **Gamma links.** Only outlines exist (content-system.md, Next 4).

## Step 4: People and clients
- Josh's login with permissions.
- The client portal inside the same app. (send.dulcy.io is EmailBison's white-label with its own login: check later whether it can share a login.)

### Client portal (2026-11-26): built, not deployed
- **What it is:** a client signs in at hq.dulcy.io and sees only their own results: Overview (interested and booked, 7 and 30 days; live campaigns; deliverability in words), Leads (yes-replies handed to them or booked, 90 days), Meetings (booked, 90 days). Phone and computer, light and dark.
- **How Alex adds one:** Users → Add client login (pick the client, name, email, temporary password or Google only). Disable on the same page. How to use it: `engine/GUIDE.md` → "HQ" → "Client logins".
- **Isolation:** role `client` linked to one client record (Twenty West's two records are one client). The server lets a client reach only `/hq/api/portal/*` (an allow-list, so new HQ pages are closed to clients by default); the client always comes from the login. No money, drafts, notes, agents, Decisions or Airtable links, and no writes. A test walks every HQ route with a client login and expects "no".
- **Where:** `engine/src/hq/portal.ts`, the guard `clientMayCall` in `engine/src/hq/server.ts`, `hq/web/src/pages/Portal.tsx`, Users page.
- **Not yet:**
  1. Reports for clients: HQ reports have no "for the client" mark yet, so the portal has no Reports tab.
  2. Meeting times: Airtable stores the day a meeting was booked, not when it happens (UNKNOWN which field, if any, holds the meeting time).
  3. Password reset by email: there is no email sending in HQ; Alex sets a temporary password.
  4. send.dulcy.io (EmailBison white-label) stays a separate login.

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

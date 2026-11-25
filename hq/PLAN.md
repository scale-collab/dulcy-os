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

## Step 2: Clients
- One screen with every client: results (email now; LinkedIn, AI caller and direct mail later), health, money (Alex only) and a note for today.
- Replaces: Clients & LTV (wrong today: shows 3 active), Email/LinkedIn/AI Employee campaign dashboards, Domain & Inbox Inventory, Email Accounts / Warm Up, Inbox Placement Tests, Spam Center, Buying Domains.

## Step 3: Work areas
- **Campaigns:** the Lead List and Campaign Centers rebuilt without Airtable's size limit, with the Activity log inside each campaign (code ready: `airtable/custom-elements/campaign-center/activity-log.pending.tsx`).
- **Inbox:** one inbox, per client, replacing New Replies, Follow Ups, Positive Replies, Won/Lost, Meeting Requests and the Reply Agent pages.
- **Sales:** contracts and agreements (the same flow that works now, with cleaner screens), plus the executive dashboard.
- **Content:** the Content Center and OpusClip (Sienna).

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

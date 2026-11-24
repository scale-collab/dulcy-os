# Alex's role map (dictated 2026-11-24), raw notes for the agent design

Status: complete (3 voice memos). Agent mapping proposed in chat 2026-11-24, waiting for Alex's yes.

## Structure (Alex's "employee pod", designed ~5 years ago)
- **Founder/CEO (Alex).** Wants an accountability agent: keeps his days productive, tracks how hard he is working, makes sure he misses nothing, across everything.
- **COO.** Reports to Alex. Gets direct communication from the two sides of the company (fulfillment and sales), oversees both heads, keeps results consistent.

## Fulfillment side
- **Head of Client Success.** Manages client success managers (one AI agent is enough). Main measure: **retention / client LTV**. Needs reporting Alex can trust (old n8n stats were "janky"):
  - average retainer (~$3K/mo), average client lifetime, client value, time to acquire a client
  - meetings booked per client, client happiness, who the contact is (founder vs marketing manager)
  - success vs not, by employee band (1-10, 11-200), revenue (500K+ or not), and whether 500K+ correlates with success
  - wants a place to see this and talk to the agents (Airtable, or later a custom app like workspace.dulcy.io for interface/reporting, not the database)
- **Client Success Manager.** Talks to the client, keeps them informed and happy, handles requests. Must push back with reasoning, not agree by default (example: client copy with 100 links = no). Sets the strategy, briefs the copywriter and lead researcher, builds campaigns in Lead List Center / Campaign Center, checks them against the SOPs, sends to Alex for approval first (until Alex says the work no longer needs his initial approval), then to the client, then launches.
  - AI makes smaller, more specific campaigns possible more often (e.g. 1,000 US pet brands, $10M+, running Facebook ads, marketing team under 5). Today Alex runs longer, broader campaigns (14+ days) only because he has no time to rebuild weekly.
- Reports to the Client Success Manager:
  - **Copywriter** (cold email, "copywriting" with an asterisk). One job: offers so good the prospect feels stupid saying no. Knows who they write to (role, company, size, position, time of year, responsibilities). Learns from Alex's 5 years of data and models such as Nick Abraham and Mitchell Keller. Returns copy to the CSM with what to test, why, and the data behind it.
  - **Lead researcher.** Second most important. Lead List Center already does most of it; must be dialed in.
  - **Inbox manager (reply management).** Now the most important role. Success = good list + good copy + good back-and-forth. Josh is human and can't scale (6 clients now, ~3x next year; Josh out tomorrow for a concert, the company can't stop when one person is out). Must understand psychology, each campaign and client (talks to the CSM agent), learn how each client talks from call recordings stored in Airtable, write in Alex's voice (not an AI voice, set in stone), follow up with a real reason (never "just bumping this"), use Closers.io sales skills, and move "interested" to a booked call.
    - Case: **Twenty West Media** told Alex today they will cancel: 282 interested leads in 30 days but only ~20 booked meetings, because their own VA handles replies. Alex did his part; inbox management lost the client.
- **Automation agent.** Expert in GitHub, Make.com, n8n, coding, and client CRMs (HubSpot, GoHighLevel, Zoho, Close) plus the cold-funnel workflow set up for clients (HTML emails, workflows). Fixes issues on its own and reports: error, proposed fix, why it works, what was tested **with real data**, then asks for approval to go live.

## Sales side
- **Head of Sales.** Manages closers, SDRs, appointment setters. Today Alex does all sales himself and wants to stay focused on selling while the company runs; he can't also do everything else.
  - Knows Cole Gordon / Closers.io and every other sales asset. Replies and drafts must handle objections like the script does (e.g. "I need to think about it" -> "what do you need to think about?", never "sure, take your time"; the guarantee objection answered as specifically as the script).
  - Later: role-play/mock calls with Alex. Reviews Alex's sales calls against the frameworks like Jackson Anderson's call reviews (what he said, pacing) and coaches him. Separate from Alex's personal coach.
- Agents talk to each other and work together through the orchestrator without Alex's manual input.

## Finance
- **Accountant.** Every purchase goes through it first: looks at cash flow, upcoming credit card bills, statements, new and lost clients, forecast, and says whether the investment makes sense now. Alex can send it any invoice for a yes/no. Weekly Xero reconciliation (Saturdays) came up in the scratched first draft.
- Personal finance/life: big asterisk, not now. **Claude = business only, ChatGPT = personal.**

## Content
- **Content agent.** Runs the Content Center workflow in Airtable: finds ideas with real demand (Reddit alone is "stinky"; search social and everywhere), writes scripts, makes Gamma docs to show in videos.
  - Alex's week: Mon campaigns, Tue meetings, Wed check meetings are fine, Thu meetings, **Fri content day**, Sat-Sun off. By Friday everything for the videos must be ready.
  - After recording: Alex drops files in a folder -> auto upload to Frame.io -> edited in OpusClip with the right features, in Alex's style (learned from his videos and other cold emailers' videos). Zero obvious mistakes (ChatGPT posted a reel with Alex's face shown twice under a text overlay: unacceptable).
  - X/LinkedIn posts in Alex's style and the styles he follows; never AI slop.


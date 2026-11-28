# Standing rules

Each rule has a date and a source. A rule stays until Alex changes it. Newest dated rule wins on a conflict.
Format: `- [date] rule. (why / source)`

## Safety and approval
- [2026-11-17] Do not send emails, launch campaigns, post, spend money/credits, delete files or change important business records without Alex's explicit approval of that exact action. (Alex; legacy Jarvis rules)
- [2026-11-17] A draft, a built list, or a request to "prepare" something is NOT approval to launch or send. (Airtable skill)
- [2026-11-17] Do not state client counts, results or proof that are not verified for Dulcy. The "300+ clients" figure in old notes came from another agency's post and is wrong. Dulcy has 6 clients plus itself. (Alex correction)
- [2026-11-17] Never include keys, tokens, passwords, cookies or client prospect rows in this repo. (design)

- [2026-11-21] Claude may spend credits (DiscoLike, DiscoGen, MillionVerifier, LeadMagic, OpenAI) on Dulcy's own test lists without asking first, and reports the cost after. Never on a client's list, and never a launch or a send. Reason: faster end-to-end testing. (Alex)

- [2026-11-21] Claude may make Airtable changes without asking first (no permission prompt; allow rule mcp__Airtable__* in .claude/settings.json). Still never: launch or send, delete records, or read the key/password fields listed in these rules. Client records are changed only for the work Alex asked for. Reason: stop the approval prompts. (Alex)

- [2026-11-22] No credit cap on DiscoLike (company and contact searches, ContraGen, DiscoGen): a list searches up to the size asked for (the Expansion Target is the limit). Other providers (MillionVerifier, LeadMagic, OpenAI) keep the engine's per-job/per-day caps. Set with CAP_FREE_PROVIDERS (default discolike). Reason: a cap stopped a 30,000-company list mid-run. (Alex)

- [2026-11-23] Do not use ContraGen on list recHoMoNkGZdjnRDD (Contact Source set to "DiscoLike"). Claude had picked "DiscoLike + ContraGen" when setting the list up; Alex: "we shouldn't". Also: DiscoLike retires ContraGen (/v1/contacts/discover/generate), the legacy contact search (/v1/contacts/discover) and the email-finder endpoints on 2026-12-31; the replacement is POST /v1/contacts/run (search + web research + email check in one run). Company search (/v1/discover), /v1/validate/icp and /v1/discogen/process-personas stay. Reason: Alex correction; DiscoLike changelog 2026-11.

- [2026-11-23] Contact Source has a third option, "DiscoLike Contacts Run": DiscoLike's new one-step Contacts run (POST /v1/contacts/run) on the list's own Tier 1/2 domains, up to 10,000 per run, with the Contact Persona DNA as the people fit, people per company from Contact Filters JSON (results_by_company), optional "relevance" (max_relevance / balanced / max_coverage, default balanced). It returns only checked emails and replaces the legacy contact search + ContraGen (ending 2026-12-31). The engine's own contact check (titles, countries) still applies and Verify still runs. Once it passes a live test it becomes the default. Reason: Alex wants the new endpoint built now instead of the old ones.

- [2026-11-23] How Alex picks Contact Source: "DiscoLike" (database only, cheaper) for companies whose people are likely on LinkedIn (tech and similar), or to save money; "DiscoLike + ContraGen" for everything else. He may run 100-1,000 companies on DiscoLike only, then switch to + ContraGen if the pool is too small: ContraGen must then run once on the companies already searched (under the people-per-company target), and expansions (e.g. to 4k, then 10k) must never search or pay for an already-searched company again. Companies searched by a DiscoLike Contacts run count as ContraGen-researched (the run includes web research), so a later switch never pays ContraGen for them. (Alex)

- [2026-11-23] The engine has a plain-language user guide, engine/GUIDE.md (end-to-end steps, Contact Source options, statuses, safety, costs, server commands, change log). Every engine change updates GUIDE.md in the same pull request. Reason: Alex wants a guide that explains the system end to end and stays current. (Alex)

- [2026-11-23] Give Alex times in US Eastern time (ET), not UTC. Reason: Alex is on Eastern; UTC check times confused him. (Alex)

- [2026-11-23] MillionVerifier and LeadMagic jobs are named after the lead list (its Airtable name plus a short code), not the record ID. Reason: Alex could not tell the jobs apart in MillionVerifier. (Alex)

- [2026-11-23] Default Contact Source is "DiscoLike Contacts Run" (also when the field is empty). The legacy "DiscoLike" and "DiscoLike + ContraGen" run only when picked on purpose (ending 2026-12-31). MillionVerifier always checks the emails after it (DiscoLike's plain "Validated" was 3.5% bad in the live test); LeadMagic runs only when "Use LeadMagic" is ticked (off by default). No verifier-choice options on Verify. No real-send catch-all test for now. Reason: live accuracy test 2026-11-23. (Alex)

## Campaign health
- [2026-11-25] **Account health loop (Alex):** an email account with an inbox placement score under 60% is rested: daily send limit set to 0 for 1 week (old limit saved), pulled from its campaigns. A week later it is retested: better → limit restored; not better → domain blacklist checked again; still bad → a replacement is prepared with Cheap Inboxes (1 .com domain at $9.99 + 2 Google accounts; every domain always has 2 accounts). Triggers: the Friday inbox placement tests, or the bounce agent finding one account causing the bounces. **Automatic, no approval needed:** resting an account, removing an inbox from a campaign, restoring a limit after a good retest, resuming a campaign; Alex is informed in Slack. **Buying always needs Alex's ✅.** Every step is written to an activity log on the campaign / lead list. (Alex)
- [2026-11-25] **How a high bounce is investigated (Alex's method, the bounce agent follows it):** 1) Read the bounce codes: verification problem (addresses not found, 5.1.x) or spam problem (blocked / policy, 5.7.x)? 2) If spam, it is one of three: **our domain**, **our email copy**, or **an email account**. 3) Check where the bounces land: if 50%+ go to one email security gateway or a custom mail server (Proofpoint, Mimecast, Barracuda…), stop sending to that gateway. Be accurate before acting. (Alex)
- [2026-11-24] **Temporary (Alex):** while the lists are being fixed, campaigns flagged over 4% but **under 6%** keep sending: Skip Bounce Pause was ticked on those 10 (EmailBison 603, 605, 606, 607, 609, 610, 612, 628, 630, 633). 6%+ still pauses (601, 604, 611, 622, 623, 634). Untick them once the list fixes land. Ticked campaigns are not auto-paused even if they pass 6% later, so the watch alert must be read.
- [2026-11-23] Campaign Center on the engine (Alex): pressing **Launch** is Alex's go-ahead for that campaign (no extra "are you sure" box); the engine still runs every launch check first and refuses with the failing check shown. **Pause** pauses right away, no confirm. The screen's top-up call follows the top-up rule below (reply rate 2%+ and interested 15%+ of replies = top up), not its own older rule, so healthy campaigns stop showing "has issues" just because of bounce. **Inboxes:** never block picking an inbox that is busy in another campaign (Alex builds Monday for a Tuesday launch when the old one ends): show a warning only. **Delete** stays in n8n for now. **"Skip bounce pause" box stays** (for a just-launched campaign where 1 early bounce looks like 10%); the engine's bounce check honours it (no auto-pause when ticked, the watch alert still shows).
- [2026-11-23] The engine's bounce check pauses for real (switched live): over 4% bounce at 35%+ progress pauses the campaign, over 2.5% = watch, campaigns with Skip Bounce Pause ticked are never paused (still watched). (Alex)
- [2026-11-18] Bounce auto-pause: pause when bounce is over 4% **and** the campaign is at 35%+ progress. The floor stops early small numbers from pausing it (1 bounce in the first 10 emails = 10%). The check must re-run on every metric refresh, not fire once. Over 2.5% = watch. (Alex)
- [2026-11-18] Failed campaigns restart automatically: a failure is usually an error on the sending system's side. Long-running jobs (18+ hours seen) must be investigated, and the engine needs time limits. (Alex)
- [2026-11-18] EmailBison workspaces: the engine switches the key to the right workspace before every call (as the existing flows do), with the Workspace IDs number (Dulcy = 2). If switching proves unreliable, use the per-client EmailBison API key from Airtable instead: the engine may read it at runtime on the server; Claude and the agents still never read or show it. Alex does not want to create new workspace keys. (Alex)
- [2026-11-18] Lead engine credit caps: up to 100,000 credits per job and per 24 hours (per provider). Reason: lists can be up to ~100k emails; the old 5,000 default would stop normal lists. (Alex)
- [2026-11-18] Top-up rule: targets are bounce under 4%, reply rate 2%+, interested 15%+ of replies. **Interested rate is the main driver.** A strong interested rate can justify a top-up even with higher bounce (example: bounce 5%, reply rate 8%, interested 20% = OK), but the higher bounce is flagged to watch. Supersedes "top-up needs interested above 15%" where they differ. (Alex)
- [2026-11-17] Bounce rate over 2.5%: send a watch notification, keep an eye on it. (Alex)
- [2026-11-17] Bounce rate over 4%: campaign is paused automatically and must be investigated. An Airtable project-management task is created and an email goes to Alex. Causes to check: copy, email accounts, list quality, email security gateways. Use the Spam Center. (Alex)
- [2026-11-17] Interested rate = interested replies / replies. A top-up needs an interested rate above 15%. (Alex, from handoff)
- [2026-11-17] Over-4% pause rule supersedes older SOP wording of "below 2.5%". Both thresholds are real: 2.5 = warn, 4 = pause. (Alex)
- [2026-11-17] At about 60% campaign completion, Airtable sends a notification. Then: review the next-campaign recommendation, replies, bounce data and variant performance, and plan the next campaign for that client. Atlas decides top-up vs new vertical vs new offer vs copy change. (Alex; Airtable skill)

## Building campaigns and lists
- [2026-11-18] Company fit check is code-based, with no LLM call. It uses the campaign thesis and client info (ICP, industries, size, geography, keywords, exclusions) to remove **obvious bad fits**. "Maybe" fits are kept. The goal is no obvious bad fits, not a perfect ideal fit, which doesn't make sense for cold outreach. This replaces the AI review of every contact or company. (Alex)
- [2026-11-18] Days between emails: default 2, editable per campaign. (Alex)
- [2026-11-17] Run campaign/list stages through the Airtable interface and stage gates. Do not substitute raw status/checkbox edits or direct provider calls. (Handoff, Alex)
- [2026-11-17] First sample is 100 companies. Approve when usable fit is at least 80% (prefer 85%+). Scale 100 -> 1,000 -> 10,000 only after review. (Alex)
- [2026-11-17] Review company fit and contact fit separately. Test contacts from the first 100 companies. (Airtable/Scout skill)
- [2026-11-17] After provider contact search, do NOT run a second paid AI/web-research review. Ambiguous contacts stay NeedsReview for manual Approve / Reject / Leave pending. (Alex, Oct 9 correction)
- [2026-11-17] Default lead database is DiscoLike unless the campaign says otherwise. (Workflow SOP)
- [2026-11-20] Never pay MillionVerifier twice for the same email on the same list: Verify reuses every earlier result and uploads only emails never verified (e.g. new ContraGen contacts or a top-up). Unprocessed (no credit) emails are sent again. Reason: the ContraGen re-run re-checked 746 already-verified emails. (Alex)
- [2026-11-17] Verification order: MillionVerifier first; LeadMagic for direct contacts or recovery when needed. Do not treat catch-all as confirmed. Check status on an existing job instead of re-running a paid job. (Airtable skill)
- [2026-11-17] Copy: no spintax in client-facing text, no manual signature. Do not spin variables like {FIRST_NAME}. Run EmailGuard spam check and manual review before upload. (Workflow SOP)
- [2026-11-17] Sender domains: don't buy new .info domains. This is only about buying sender domains, not about recipients. **Clarified 2026-11-18:** it is not a launch or campaign check; existing .info senders may be used. (Alex)
- [2026-11-17] Allocate senders only after the final usable lead count is known. (Airtable skill)
- [2026-11-17] Launch only after Alex confirms. (Workflow SOP) **Changed 2026-11-18:** the lead engine launches automatically once all launch checks pass (list in `engine/PLAN.md`). Manual launches by agents or Claude still need Alex's OK. (Alex)

- [2026-11-20] Generic emails follow the old n8n formula exactly (chooseCompanyEmail): personal mailboxes (gmail, yahoo, hotmail, outlook, icloud and similar) are set aside and never sent; the address must be on the company's own domain; blocked inboxes (privacy, legal, terms, abuse, noreply, webmaster, postmaster, unsubscribe, marketing, press, media, careers, jobs, hr, security, dpo, gdpr, compliance, billing, accounts, accounting, invoices, payments) are dropped; then ONE email per company by preference: info, contact, office, hello, enquiries, inquiries, sales, estimates, quotes, service, customerservice, support, team, admin, then the rest alphabetically. Reason: the engine must match the proven workflow. (Alex correction)
- [2026-11-20] Contact Source has only two options: "DiscoLike" and "DiscoLike + ContraGen". With "DiscoLike + ContraGen", ContraGen runs on every company that has fewer contacts than the people-per-company target (default 5), not only on companies where DiscoLike found nobody, because a company with one contact can still have more decision makers. ContraGen contacts already found by DiscoLike (same email, or same name at the same company) are dropped. Reason: more decision makers per company. This changes the old n8n behaviour (zero-contact companies only). (Alex correction)
- [2026-11-20] Filter generation sends the AI only the client fields that help with targeting and keywords: Name, Brand Name, Client Type, Cold Traffic Offer, Front End Offer(s), Back End Offer(s), Outbound Risk Reversal, Sender Title. Never the whole client record (no billing, KPI, login, key or system fields). Reason: send what is useful, not everything. (Alex)
- [2026-11-23] Lead List Center = building the list only. Build Campaign lives in the Campaign Center. No separate deep-review buttons: the "Use DiscoGen Deep Review" checkbox makes the company deep review run by itself after the sample and each expand; no contact deep review. Apply Contact Decisions is removed (no manual review of thousands of contacts). Keep Check TAM, Restart Companies (start the list over, with a backup first) and Skip Enrichment (through the engine, not a direct stage write). Clear status does not touch the engine's status. Reason: one clear path that Alex and AI agents can both run. (Alex)
- [2026-11-23] Never change a lead list's or campaign's targeting, filters or settings without asking Alex first, even to fix a bug found in a test. Propose the change, wait for his yes. Reason: Alex was mid-test and his filters were changed twice without being asked. (Alex correction)
- [2026-11-23] "ecom", "e-commerce", "DTC", "online store" or "Shopify" in the targeting sentence adds DiscoLike's E-COMMERCE industry as an **either/or** option next to the product industry (pet brands OR e-commerce companies). Never make both required: Alex did not ask for AND. Supersedes the same-day "+E-COMMERCE required" version. (Alex correction) **Superseded 2026-11-23 (built 2026-11-24)** by the "labels only when they fit" rule below: E-COMMERCE is used when 60%+ of the lookalike companies carry it; either/or is kept.
- [2026-11-23] Generate Filters, one system for every niche, all inside the one press and never a hard lock: (1) the analysis looks at 500 lookalike companies (max 1000); (2) **labels only when they fit**: a DiscoLike industry or sub-industry is a filter only when 60%+ of those companies carry it (score 0.5+); several = either/or, never "+" required; none = no industry filter (lookalike text, examples and keywords target); (3) **lead goal is soft**: from the linked campaign's inboxes (daily limits x 14 days / 3 steps), else **3,000 final leads per campaign** by default; companies needed = goal / 0.4; **real companies ≈ 50-70% of DiscoLike's free count** (the engine uses 60%); (4) too small = auto-widen one step at a time (sub-industry, industry, employee range one step each side, business model, top half of keywords), max 5 free counts, **never geography**; still short = keep the widest plan and say so; (5) the **80% sample fit target is a warning, never a lock**: Expand needs only the approval tick. Reason: one automatic system that works for pet e-com, roofers, med spas, manufacturers, software, agencies and the rest, without lists failing for being small. (Alex) **Updated 2026-11-24 after the 8-niche live test:** a fitting sub-industry is used on its own (other fitting whole industries held back, med spa case), and widening starts with the employee range (keeps the niche, jewelry case).
- [2026-11-24] **Generate Filters checks the real search depth.** The free count ignores the targeting text and can overstate many times over, so when it looks big enough the engine measures how far DiscoLike's search really reaches (about 8 one-company probes, cents) and sizes the goal and auto-widen on the smaller number. Reason: pet e-com showed 23,065 but only ~2,000 were findable. (Alex)
- [2026-11-24] **Contacts: one way only, the DiscoLike Contacts Run.** The old options (DiscoLike, DiscoLike + ContraGen, ContraGen) are retired: removed from the page, and a list still set to one uses the Contacts Run. Reason: they end 2026-12-31 and the choice only causes mistakes. (Alex)
- [2026-11-24] **QA needs the copy: a list with no campaign copy can never pass QA.** The copy is what proves every lead has the variables it uses, so the order is: build the list → write the copy → Run QA → Build Campaign. (Alex, correcting a same-day change that let QA pass on rows alone; reverted.) Build Campaign also stops if a {variable} in the copy is empty for any lead (extra safety).
- [2026-11-24] **Company names at build:** legal suffixes removed (LLC, Inc, Corp, Ltd…) and **ALL CAPS names get normal capitalisation** ("APPLE" → "Apple", "ACME ROOFING" → "Acme Roofing"). Mixed-case names stay exactly as written (eBay, iRobot); short all-caps words stay as likely acronyms (ABC, IBM). This happens at Build Campaign, not QA. (Alex)
- [2026-11-24] **Agents work on their own; Alex approves only at the final step.** Agents investigate, gather data and do internal fixes without asking. Human input is needed only at the end of a chain: buying (e.g. a new domain), launching a campaign, and anything Alex marks as a decision. (Alex) This widens non-negotiable 1 only as far as Alex sets it here; spending money, deleting client data and new messages to clients' customers still need his yes.
- [2026-11-24] **Decision messages are short: issue → quick research → proposed fix → Yes/No.** One short message in the decisions Slack channel, answered with a reaction; the long explanation goes in a thread reply or the Airtable record, never in the main message. Reason: long AI messages are overwhelming; Alex is on calls and must decide in seconds. (Alex)
- [2026-11-24] **Inbox marked as spam = rest 1 week, retest, then replace.** Stop sending from it for 7 days; the weekly inbox placement test runs again; if it is still bad, the domain is replaced: the agent prepares the purchase and swap so Alex only approves the purchase. (Alex)
- [2026-11-24] **Campaign agent goes end to end after one approval.** At 60% completion it proposes the next campaign (who to target, why, the realistic list size and how it should perform); after Alex approves, it builds everything (list, contacts, verify, QA, copy, spintax, build) without stopping, then asks for a final review before launch. It must size lists realistically (e.g. roofers: tens of thousands; vocational schools: far fewer) and plan top-ups to keep sending. (Alex)
- [2026-11-23] Employee ranges from the targeting sentence snap to DiscoLike's size steps (1-10, 11-50, 51-200, 201-500, 501-1000, 1001-5000, 5001-10000, 10001+): a number that is a step's end moves the minimum to the next step ("10 to 200" = 11-200); otherwise the step containing it is used. "between X and Y" counts like "X-Y". (Alex)
- [2026-11-23] Unsubscribe link stays OFF on every campaign (can_unsubscribe false; the engine forces it off even if the record ticks it). Opt-outs come by reply (the P.S. invites it) and are always honoured. Reason: better deliverability; replaces the open "flagged for Lex" note. (Alex)
- [2026-11-23] Campaign daily limits are sized to the campaign's inboxes: max emails per day = inboxes x daily limit, max new leads per day = 80% of that (or the set value if lower). A larger value copied from another campaign is lowered; a smaller one is refused. Reason: a 7-inbox test campaign was built with 2,325 emails and 775 new leads a day copied from a bigger campaign. (Alex)
- [2026-11-21] Enrichment fallback: a lead the research cannot answer gets a short fallback phrase that fits the email copy (e.g. a city -> "your area"), never a blank or "Not Found". The prompt step writes the phrase into each variable's FALLBACK section; Alex reviews it before Run. Reason: blank values made QA block the whole list (28 of 466 in the first test). (Alex)

## Replies and inbox
- [2026-11-24] Echo follows each client's own Reply Agent settings in the Inbox Manager (Enabled, Client reply handoff, reply types, tone, length, instructions prompt, not-interested reply, templates, approved links, follow-up plan and instructions, calendar). No one rule for every client; to change how Echo answers a client, edit that client's settings. "Client reply handoff: All replies" = the client answers its own replies. Why: Alex needs to customize and edit the replier per client. (Alex)
- [2026-11-24] When Alex says in chat that he approved replies, Claude may press Approve in Airtable for him (Alex confirmed this was right). If his Slack ✅ did not register, say so. (Alex)
- [2026-11-24] Reply approval (Alex): Airtable is the main place (Approve / Send Edited on the reply row); the Slack ✅ is a shortcut that presses the same Approve. One sender, sends once. Airtable and Slack always mirror each other: a reply sent or skipped from Airtable is posted in its Slack thread, and one approved in Slack shows as sent in Airtable. (Alex)
- [2026-11-24] The AI replier lives in Airtable (Alex): reuse and tweak the existing Reply Agent interfaces and automations (modeled on RevReply) rather than replacing them. Agents must be built from real source data: Google Drive, real replies across all clients, the creators' content we follow, real-world results. Why: RevReply-style AI got poor booked meetings because Alex could not control how it built the reply. (Alex)
- [2026-11-24] Draft mode (Alex): only threads waiting on Dulcy are drafted; threads marked Client Handling stay with the client (Twenty West takeover undecided). Dulcy meeting times come from Alex's Calendly. After Alex approves a draft, Claude/the engine sends it from EmailBison. (Alex)
- [2026-11-17] AI reply drafts are review-only. Josh or Alex approve every outgoing reply. Reply Agent pilot is on for Dulcy only, in Human in the Loop mode. (Reply Agent SOP, Oct 7)
- [2026-11-17] Respect unsubscribes and stop requests. Never override suppression. (Reply Agent SOP)

- [2026-11-17] Booking ask: when a prospect is interested, offer **two specific dated times, no calendar link** (Dulcy data: 27.7% booked vs 6.2% link). (Alex)
- [2026-11-17] Price question by email: explain how pricing works and that it depends. Example: "we typically work off a monthly investment, but that depends on your goals and where you want to be; to give you an idea of what it might look like..." Then give the client's approved range or example only (never invent one), then offer two times. (Alex)
- [2026-11-17] A positive reply that goes quiet: keep following up until they answer or say stop. Always honour stop, unsubscribe and suppression. (Alex)
- [2026-11-17] Josh approves and sends normal replies himself. Tricky ones (price, complaints, unusual cases) go to Alex. RevReply is not used. (Alex)

## Content (Sienna)
- [2026-11-17] Pillars: cold outbound, agency operations, proof and experiments, founder lessons, AI/modern GTM. Alex's account = first-person lessons and behind-the-scenes decisions; Dulcy's account = systems, frameworks, service education, approved client proof. Never invent results or stories. (Alex)
- [2026-11-17] Alex Woung Raw clips are never split-screen. Regular Alex Woung clips may be split-screen when showing a screen or demonstrating something. (Alex)
- [2026-11-17] The repurposing counts (2 LinkedIn, 3-5 X, 2 short scripts, 1 carousel per source) are examples, not a weekly quota. No posting cadence is set yet. (Alex)

## How to work with Alex
- [2026-11-24] Agents: 9 active (Ada, Atlas, Scribe with offers, Scout, Echo, Riley, Cole, Ledger, Sienna). Forge folded into Scribe; Pixel, Lex, Harper parked. Start with Echo (draft mode: Alex/Josh approve each reply in Slack until Alex says otherwise) plus the decisions loop. Why: Twenty West is cancelling over reply handling and Josh can't scale. (Alex)
- [2026-11-24] Claude handles business only; ChatGPT handles personal. Nothing personal goes into the agents until Alex says so. (Alex)
- [2026-11-24] Alex's week: Mon campaigns, Tue and Thu meetings, Wed check meetings, Fri content day, Sat-Sun off. Agents plan around it (content ready by Friday, campaign reviews on Monday). (Alex)
- [2026-11-20] Until Alex says otherwise, Claude runs the engine end-to-end tests itself on Dulcy's own test lists, including the approval clicks (Company Sample Approved, Contact Sample Approved, QA Passed) and Build Campaign drafts. Never a launch, and never on a client's list. Reason: Alex wants it proven end to end before he tests. (Alex)
- [2026-11-20] Dulcy agency lists: 1-200 employees is the better default than 1-50. (Alex)
- [2026-11-18] Claude may merge its own pull requests into `main` without asking each time, only after the tests pass, and tells Alex each time. (Alex)
- [2026-11-17] Agent roster is: Ada (router), Riley (ops/automation), Atlas, Scout, Scribe, Cole (sales), Forge (offers), Sienna (social/content), Pixel (paid ads), Lex (legal/HR), Ledger (finance), Harper (hiring/people), Red Dog (trading). Jarvis is renamed Ada; the "Airtable" skill becomes Riley. (Alex)
- [2026-11-17] Bounce and campaign-health checks belong to Atlas, never Riley. Riley only fixes n8n and Make.com (and Airtable automations). (Alex correction)
- [2026-11-17] Build agents one at a time; Alex approves each before the next. (Alex)
- [2026-11-17] Atlas leads every campaign: runs the managed Airtable campaign/list stages and directs and checks Scout, Scribe and Forge. Riley only fixes systems (n8n, Make, Airtable automations/scripts), not campaign work. Supersedes earlier lines that gave Riley the Airtable stages. (Alex correction)
- [2026-11-17] Roster update: Forge (offers) is separate from Atlas. Cole (sales/closing) is a separate skill. Scribe is copywriting only. New agent Echo owns reply handling (cold prospect to booked meeting) and the AI replier. Sienna is a full-size agent. Pixel, Lex, Ledger, Harper stay short for now. Red Dog stays out of this repo. Supersedes the earlier roster line where they differ. (Alex)
- [2026-11-17] Keep answers simple: direct result first, exact numbers, short done/left lists. (Alex)
- [2026-11-17] Work in small committed steps. A previous Codex run spent heavily for 14 days without finishing; do not repeat that. (Alex)
- [2026-11-17] ChatGPT handles admin, reporting, personal tasks and email support. Claude handles campaign building, automation and code. (Alex)

## Ledger may write to Xero to prepare reconciliation (Alex, 2026-11-25)
- **Rule:** Ledger may create entries in Xero to prepare reconciliation, without asking each time:
  - bank transfers between the Mercury buckets;
  - deposits;
  - client payments applied to their invoices;
  - spend coded the way that vendor was coded before.
- **Limits:** Ledger never deletes, voids or edits existing entries, never moves money, and never touches payments going out of the bank.
- **When unsure:** lines it can't code are asked about in Slack.
- **Reason:** Alex wants the agent to do the reconciling. Xero's API cannot tick "reconcile", so Ledger creates exact matches and Xero's auto-reconcile clears them.
- **Data:** Ledger reads Mercury with a read-only token (`MERCURY_TOKEN`).

## Ledger checks; Claude in Chrome confirms on Fridays (Alex, 2026-11-25)
- **Supersedes the "Ledger may write to Xero" rule above.** Ledger runs in **checker mode** (`LEDGER_PREP_WRITE=off`) and never writes to Xero.
- **Every day,** Ledger compares Mercury with Xero and flags, once in Slack, any line still not in Xero after 3 days.
- **Every Friday,** reconciling is done by **Claude in Chrome**: Alex says "reconcile Xero". The routine is in `agents/ledger-reconcile-chrome.md`. It clicks OK only on Xero's own clear suggestions and skips anything unclear.
- **Reason:**
  - Xero's API and the Xero connector cannot read or reconcile the Reconcile screen (Xero policy).
  - Xero auto-reconcile is not available on Dulcy's plan.
  - Ledger writing entries alongside Xero's own suggestions could create duplicates.

## Friday Xero reconcile: no suggestion means work it out (Alex, 2026-11-25)
- **Rule:** when Xero has no suggestion for a line, Claude in Chrome works out what it is: the full statement line, how the same payee was coded before, a web lookup of the vendor. It then codes the line using the account guide in `agents/ledger-reconcile-chrome.md`.
- **When to ask:** only when it truly can't tell what the charge is.
- **Check:** every such line is listed in the summary, and anything over $1,000 is flagged ⚠️ for Alex to glance at afterwards. **No amount cap** (Alex, 2026-11-25): the amount doesn't change the process; a line waits for Alex only when it's unclear (new payee that can't be worked out, wrong-looking code, refund/chargeback, Tax/Profit account).
- **Reason:** Alex wants the agent to reconcile, not to stop at every line Xero can't guess. First case: Anthropic, Opus Clip, Grok and Google Cloud → 6050 Software.

## Campaign creation by the agents (Alex, 2026-11-25)
- **When Atlas starts a client's next campaign on its own:** when a running campaign passes 60% sent, and when a new client finishes onboarding.
- **Two approvals by Alex:**
  1. The plan: thesis, ICP and the first-100 sample. This comes before credits are spent on the full list.
  2. The final copy and list, before launch.
- **Then the client approves the copy,** and only then does it launch.
- **Reason:** agents do the campaign work. Alex keeps the two decisions that matter, and the client still signs off on what goes out in their name.
- **Source process:** Alex's "2-Hour Cold Email Campaign SOP" (Drive), summarised in `sops/campaign-sop-summary.md`.

## Cold email copy: proof, ask and testing (Alex, 2026-11-25)
- **Proof:** at least 1 strong proof per email. More is better, as long as every extra proof is just as strong (no filler proof).
- **The ask:** a call can be asked for, but not in the cold sequence unless it is the only logical next step. Default to a low-friction ask that needs a one-word reply.
- **Testing:** one direction per campaign (one thesis), with **2 angles** of Email 1 that test something that makes a real difference: USP, pain point, solution angle and so on. Never trivial word swaps.
- **Next campaign (top-up vs new angle vs new vertical vs new offer):** follow the rules in Alex's 2-Hour Cold Email Campaign SOP and his cold email doc (summary in `skills/atlas-campaign-operator/references/next-campaign-rules.md`).

## Cold email copy: offer what we can do, without the delivery fine print (Alex, 2026-11-25)
- **Offer what we can genuinely do, and keep the copy about whether they want it.** Steps needed to deliver (access, logins, setup) belong in the reply or the call, not in the cold email. Example: "I can run {COMPANY} through Profit Compass for free" is fine, even though it needs Shopify and ads access.
- **Still never lie:** no invented results, numbers, customers, guarantees or assets that don't exist. State a condition only when it changes the deal for the prospect (they pay something, it's paid vs free).
- **Don't get stuck on small nuances.** Scribe and the reviewer flag real truth problems, not every qualifier.
- **Reason:** Alex: the cold email asks whether they want it; over-qualifying kills the offer.

## EmailBison: Claude may switch workspaces (Alex, 2026-11-25)
- The EmailBison MCP connection uses an admin key. Claude may switch workspaces with it (`POST /api/workspaces/v1.1/switch-workspace`) to read campaigns, copy and stats, and must switch back to the primary workspace (Visionair AI, team 4) afterwards.
- Research stays read-only: the switch is the only non-GET call allowed for it. EmailBison holds the full campaign history (some Dulcy campaigns were deleted from Airtable).

## Clients (Alex, 2026-11-25)
- **Lead Flo Marketing is no longer an active client.** Airtable Workspace IDs Status = Inactive (set 2026-11-25). Active clients: 5, plus Dulcy.
- **The Marketing Cartel's Email 1 P.S. result lines are confirmed OK** by Alex with the client.

## Riley: prepare the fix, wait for the ✅ (Alex, 2026-11-25)
- Riley watches engine jobs, n8n, Make, Airtable automations and the known open issues by himself.
- For each problem he posts in Slack: why it happens, the prepared fix (a PR, an exact change spec or a retry) and the rollback. **Nothing goes live until Alex's ✅.** This holds until Alex says Riley may fix freely.
- Read-only checks need no approval. A ✅ on a Retry re-runs the failed engine job. Other fixes are made live by Riley's next scheduled run, then verified.
- **Reason:** Alex wants the fixes ready for him, and to approve them until he trusts Riley to fix freely.
- **2026-11-27 (Alex): after the ✅ Riley finishes the fix end to end.**
  - **n8n:** Riley writes the exact `n8nPatch` (workflow, node, parameter, old → new) on the System Issue; the engine applies it through the n8n API on Alex's ✅ (checks old values, saves the full previous workflow, re-activates). Never credentials/keys/tokens/passwords. Live with `riley.n8n_apply` in `LIVE_STAGES`. Undo: `riley-n8n-rollback <issueId> --yes`. No more "your hands" for n8n parameter changes.
  - **Code:** on ✅ Riley opens the PR from his `claude/riley-*` branch, runs the tests, merges to `main` and DMs Alex exactly "Fixed: <title>. Please deploy: `cd /opt/dulcy-os && git pull && bash engine/deploy/deploy.sh`". If the push is refused, he says so once in his Slack report.
  - **Make / Airtable:** unchanged (Riley applies them with his tools after the ✅).
  - **Why:** Alex wants n8n fixed end to end after he presses Approve, and only a "please deploy" ping for code.

## Campaign creation, last step: client approval → live (Alex, 2026-11-25)
- **Inboxes:** Atlas gives a new campaign the client's free healthy inboxes: Healthy or ungraded, connected, not resting or being replaced, warmup 70+ when scored, and not sending in another Active or Uploaded campaign. If none are free, Atlas asks Alex (Daily Run / Slack) and builds as soon as he picks them in Campaign Center.
- **Launch:** after Build Campaign, Atlas presses Launch Campaign. It goes live by itself when every launch check passes, under the 2026-11-18 exception: copy approved, list Ready + QA Passed, client active, leads in, senders connected. If a check fails, the plan stops and Alex sees why.
- **Order:** the approved copy goes back into the sequence fields first (the same as the Campaign Center's approve-and-prepare), then the spintax button, then Build, then Launch.

## How the agents work with Alex (Alex, 2026-11-25)
- **Ada is the orchestrator.** Alex normally talks to Ada; Ada asks the agents and gets things done (Atlas directs and teaches Scribe and Scout). Each agent reports to Ada daily; Ada reports to Alex. Alex can still talk to any agent directly when he wants.
- **Each agent keeps its own to-do list with deadlines** (e.g. a campaign hits 60% today → Atlas's task to plan the next one, with a due date). Ada watches every list.
- **Questions get one answerer, not many bots:** like EmailBison's help AI. Answer from the data with sources; if not sure, say "here's what I found" and hand it to a person.
- **Ada's morning brief includes a team check:** one line per agent saying whether it did its job, and what's off.
- **Less Slack.** Alex wants one calm screen, card by card, not blocks of text and many DMs. Slack is for urgent items only. Everything else goes to the central screen (Daily Run now; a private "HQ" later).
- **Privacy:** Josh can see Airtable. Money (MRR, LTV, finance) and content are Alex-only.
- **Atlas owns client facts being right:** active clients, MRR/LTV and the client list must match reality (e.g. MJJ and The Marketing Cartel are active).
- **Atlas answers client and campaign questions when asked.** The old Jarvis didn't answer pings.
- **Riley also checks once overnight** (4 a.m. ET).

## Echo follows each client's Reply Agent settings (Alex, 2026-11-25)
- **Rule:** Echo honors every send setting per client: Default Mode, routing groups, OOO Mode, Minimum Auto Confidence, Max Automatic Replies, Always Require Human Review, Not Interested Nudge and office hours.
- **Approval Required stays the default.** A reply goes out without a person only where that client's own settings say so, inside the client's office hours, and never with a gap, a question for Alex, or past the sender's checks.
- **Why:** Alex asked for the inbox replier to work per client, with the settings he already set in the Inbox Manager, instead of one rule for everyone.
## Reports and reply approvals move to HQ (Alex, 2026-11-25)
- **Reports:** every agent report (Ada's brief, Atlas health, Cole call reviews, Ledger, Sienna, Riley) is saved to HQ and read there as a short card that opens the full text. A Cole review shows the score and the 3 fixes first.
- **Slack switches:**
  - `SLACK_REPORTS` and `SLACK_DECISIONS` stay `on` until HQ is live. Then Alex turns them `off`.
  - Urgent alerts keep going to Slack either way: a campaign paused for bounces, a refused launch, a failed engine job.
- **Reply approvals:** Echo's reply cards are approved in HQ.
  - The draft can be edited. The buttons are Send, Send edited, and Skip.
  - HQ only presses the Emails row's buttons (Human Action, and Custom Reply for an edit). The engine's reply sender sends.
- **Reason:** Alex: "I want to move off of Slack for these because it's just too much."

## Booking asks: two specific times; a booking link only as a last resort (Alex, 2026-11-25)
- **Rule:** every reply that asks for a call offers two specific times from the client's calendar. A booking link is very unideal (prospects rarely click it): use it only as a last resort (the prospect asks for a link, or no open time can be read). Never a vague ask like "a quick chat sometime this week". (Alex clarified 2026-11-25: not "never", but very unideal.)
- **Calendars:** each client shares their calendar with Dulcy at onboarding, so the times are available; Echo must read them rather than fall back to the link.
- **Follow-up:** every interested lead gets a follow-up every 3 days until they book, say no, or are recycled. Replies are answered within 1 hour, weekends included.
- **Why:** Twenty West: 282 interested → 11 booked; the first reply sent a booking link 102 times and a vague ask 110 times, and 165 leads got no follow-up.
- **Open:** in the Reply Agent settings only Dulcy's calendar is connected; the other clients are "Not Connected" with times switched off, so Echo falls back to the link. Fix: read each client's shared calendar.

## HQ: built for phone and desktop (Alex, 2026-11-25)
- **Rule:** every HQ screen is designed and checked on both phone (390 px) and desktop (1440 px), light and dark, before it ships. Big tap targets on phone, no sideways scroll.
- **Why:** Alex likes the mobile version and uses both.
- **Also:** the to-do in HQ is "Needs you" (what the agents need from Alex), not another project-management list.

## How agents report to Alex: Problem → Data → Fix (Alex, 2026-11-25)
- **Rule (clarified by Alex the same day: a guide, not a form for every message):** the point is no big blocks of text; everything easy to read at a glance. When a summary explains a problem, use this order:
  1. **Problem:** one line, what's wrong or what's needed.
  2. **Data:** the exact numbers that show it (no invented percentages).
  3. **Proposed fix:** what to do, by whom.
  4. **Why:** the data that supports the fix.
  Plus one action (button or question) if Alex has to do something. No walls of text.
- **Why:** Alex wants everything super simple and up to date, so he can act fast.
- **Target:** HQ in daily use next week (the systems exist; HQ is the visual layer on top).

## The inbox agent is Echo (was Sean) (Alex, 2026-11-25)
- **Rule:** the inbox agent's name is **Echo**. The job is unchanged: reply to booked call, every client's Reply Agent settings, Josh's inbox process.
- **What stays the same on purpose:** stage ids (`sean.draft`, `sean.followup`), `SEAN_*` server settings, the `sean_drafts` table and `engine/src/agents/sean.ts`. Renaming those would break the live server config for no gain.
- **Old records:** Airtable Decisions and Activity rows that say "Sean" are read as Echo. Skill: `skills/echo-reply-handling/`, agent: `.claude/agents/echo.md`.
- **Why:** Alex picked the name ("Echo": answers everyone back).

## AI caller: no automatic calls on positive replies for now (Alex, 2026-11-26)
- **Rule:** the automatic AI call on positive email replies (n8n "1.2 Positive Email Reply") stays off until Alex decides the AI caller's direction.
- **Why:** 141 logged calls: 89 voicemail, 23 answered with no outcome, 1 booked. These are warm leads; Echo's email reply is the better path.

## Agent work lives on the agents' own lists, not Alex's board (Alex, 2026-11-25)
- **Rule:** work an agent does (new campaigns, bounce checks, inbox rests…) is a task on **that agent's** list in HQ (Team), with status, due date and a progress note. Alex sees it in "Needs you" only when the agent needs him. Ada's morning brief flags late or stuck tasks and re-queues them once a day.
- **Owners:** campaigns, bounce checks and inbox rests → Atlas (matches Decisions and the Activity Log). Riley stays systems-only.
- **Why:** Alex: "it all gets sent to my project management, it's a little too much… the task should be assigned to them, and we could see and ask for progress." And: "I need this to be very autonomous."

## Agents may commit and push their own fixes (Alex, 2026-11-26)
- **Rule:** agents (Riley's scheduled runs included) may `git add`, `git commit` and push to their own `claude/...` branches. Allowed in `.claude/settings.json`.
- **Still needs Alex:** merging to `main` and deploying stay with Alex or the main session after tests pass; live system changes (n8n, Make, Airtable automations) still need Alex's ✅ until he says fix freely.
- **Why:** Alex answered "yes" to "should Riley and the agents be allowed to push their own code fixes?"

## Echo books the agreed time itself (Alex, 2026-11-27)
- **Rule:** when a prospect agrees a time (one of the 2 offered, or their own exact day and hour), Echo books it on that client's own calendar after a live availability check, following each client's approval mode: Approval Required = one card "Book <time> + send confirmation" (one approve books, then sends); auto modes = by itself inside the client's office hours. Then a short confirmation in Alex's style.
- **Limits:** only the thread's own client calendar; only the next 30 days; only inside the client's office hours; no weekends or US holidays when the client turned them off. A vague reply ("sometime next week") gets 2 specific times, never a booking. Taken or failed = nothing sent, 2 new times drafted. No calendar or no booking permission = "I'll send the invite over" for a person, plus an HQ ask to reconnect.
- **Recorded** like every booked meeting: Opportunity Status WON (the existing WON automation does the rest), Pipeline Stage Booked Meeting, Date of Call Booked, Meeting Booked At, Activity Log row, follow-ups closed.
- **Why:** Alex: "It's going to automatically suggest times... If they respond 'yes, could we do Wednesday at 5 PM' and it's still available, the AI agent should say 'you're all squared away, we'll book you in' and have it automatically book. The AI agent needs to go through this whole thing on its own."

## HQ is the one tool; how its screens read (Alex, 2026-11-27)
- **Rule:** HQ (hq.dulcy.io) replaces Airtable screens, Close, SignWell and the other tools for Alex and the team. What you see depends on your role. The client portal stays separate (portal.dulcy.io).
- **Screens:** no "Open in Airtable" links (Alex never reads the records). Client filters are a **dropdown**, remembered, **active clients only**. Filters are dropdowns, not rows of buttons.
- **Inbox (email account) status names:** **Healthy, At risk, Spam, Resting**. Never "Watch" or "Sick".
- **Warm-up must never be off** on any account. Off = red flag, shown first. **Except (Alex, round 2, 2026-11-27):** an inbox the spam protocol rested or is replacing (Resting 7 Days / Replace / spam review) or that EmailBison paused for bounces has warm-up off on purpose: shown as "warm-up off (resting)", not flagged. Atlas says why in one line (counts by reason).
- **Decision piles:** Replies, Campaigns, Fixes, Money, Sales (Cole), Content (Sienna), Orchestrator (Ada). No "Other".
- **Campaigns screen** follows the Airtable Campaign Center layout (name, strategy draft, status, sending accounts, stats), cleaner.
- **Money is owner-only everywhere** (fees, LTV, revenue, P&L): members like Josh never see it, on any screen.
- **Insights are short:** Problem → Decision → what supports it. No big blocks of information.
- **Needs you** is today's to-do list for Alex (what he must do), not a copy of Decisions.
- **Why:** Alex: "we're combining every single tool into one… I want everything to be here, for me and my team. It really just depends on your role, on what you're able to see." Full walkthrough list: `hq/feedback-2026-11-27.md`.

## New client inbox ramp (Alex, 2026-11-27)
- **Rule:** a new client's inboxes start at **5 cold emails / 10 warm-up per day**. After one week of sending: **10 / 20**. After another week: **15 / 30**, and that is the cap.
- **Why:** Alex's standard ramp for every new client ("when I start a new client, it's always 5 cold emails, 10 warm up…").

- [2026-11-28] **Menu (Alex):** keep all 11 menu items; cut nothing. "Needs you" is renamed **To-do**: Alex's to-do for today, not a copy of Decisions (Decisions shows there as one line). Deliverability and Chat stay their own items. Why: Alex, Needs you is "the to-do list thing"; Decisions is a separate yes/no list.

- [2026-11-28] **HQ round 4 (Alex):** (1) never write "owner only" on screen: only the owner sees money anyway. (2) Every period picker gets a Custom range. (3) Money leaves Clients for its own **Finances** menu item (company income and costs from the tools, not the hand-kept P/L sheet), with a **Personal** view under it for Alex only; Clients keeps **profit per client** (revenue minus inboxes, domains, leads and other costs). (4) Dates drop the weekday when it adds nothing ("Next test 12/4"). (5) Lists are verified by MillionVerifier; the only other source is a client who verified their own list; never show "Verified by other". (6) Campaign inbox capacity reads the same way as in Airtable. (7) Long problem lists get one "Have <agent> fix it" button instead of making Alex read them. Why: Alex's round 4 walkthrough.

- [2026-11-28] **Alex answers (round 4):** (1) Campaign sender boxes use Airtable's names: Available, Sending, Releasing Soon, Reserved Next, Disconnected, Warming. (2) Alex Woung videos are recorded on a **Friday** (the Friday before the week before publishing, never later than 4 days before it goes out); Raw stays the Friday of the current week. (3) Personal cards in Finances: connect them with a bank link (Plaid), read only. Why: Alex's answers to the round 4 questions.

- [2026-11-28] **Dulcy vs Dulcy Free Campaigns (Alex):** two separate clients and EmailBison workspaces (2 = Dulcy, 41 = Dulcy Free Campaigns: free campaigns for prospects, e.g. Chop Shop, with 20 of Alex's inboxes). Never merge them in HQ, counts or reports. Merging them was an old mistake. **HQ round 5:** the content workflow moves fully into HQ (no Airtable Content Center links); draft contracts take no typing (dropdowns/checkboxes, "Pull from Close"); every "data to fix" gets its agent's fix button.

- [2026-11-28] **Won deals (Alex):** a deal is marked Won in **Close**; the engine copies that into Airtable Sales Data (so the monthly goals count it). Close is the source of truth; Airtable follows. Why: no Sales Data rows were marked Won, so the goals came out too low.

## HQ phone notifications (Alex, 2026-11-27)
- **Rule:** HQ pings phones (iPhone from the Home Screen app, and computers) by Web Push for four kinds: **(1) new decisions** (each new Decisions card; several within ~3 minutes = one grouped ping "4 new decisions"), **(2) agent messages to you** (a chat answer when you are not on that chat; asks and tasks waiting on you), **(3) urgent problems** (campaign over 4% bounce or paused, inbox in spam, warm-up off, a fix or engine run that failed and needs Alex), **(4) good news** (meeting booked, client signed or paid). Tapping a ping opens that exact item in HQ.
- **Always on:** no quiet hours. Each person can switch any of the 4 kinds off on HQ → Notifications (all on by default).
- **Members (Josh)** get pushes for their own items only (what they can act on in HQ: reply decisions, asks for the team, their own chats, meetings booked). Never money, Ledger, Sienna or owner-only content. Decided server-side, the same role filtering HQ already uses.
- **Slack pings stay.** Notifications are added next to Slack; nothing posted to Slack was removed.
- **Bounded:** at most 1 ping a minute per person (the rest grouped into one), at most 60 a day, never the same thing twice, and nothing that existed before notifications were turned on.
- **Why:** Alex wants HQ on his phone to tell him when something needs him or went well, without opening it to check. How to turn it on: `engine/GUIDE.md` → HQ → "Phone notifications".

## HQ round 2 rules (Alex, 2026-11-27 evening)
- **Bounce is one signal, not the headline.** Don't make HQ or the agents bounce-centric; group campaigns by how they're doing (performing well, on pace, needs more time, needs a look).
- **Soft bounce = any 4xx code.** Show bounce codes as SMTP codes (550, 551, 552…), with the 5.x.x enhanced code only as detail.
- **Dates in HQ use slashes** (11/27).
- **Campaigns and Lead lists in HQ follow the Airtable Campaign Center and Lead List Center** (same sections and actions), cleaner; Alex must always see which accounts are sending and how many are free.
- **Bulk edits, not one by one** (inbox limits per client / selection / all).
- **Cole keeps Close current (Alex, 2026-11-27):** after each call review, Cole updates that opportunity's close likelihood and value in Close (Alex no longer does it by hand). Reads/writes only Dulcy's own sales records; never sends anything to a prospect.
- **Inbox cost:** $2.50 per inbox per month: Dulcy has a special Cheap Inboxes discount (Alex, 2026-11-28). The Cheap Inboxes API shows the public tier ($2.80 at Dulcy volume); ignore it, it is not what Dulcy pays. Cheap Inboxes gives the domain list and renewal dates (next yearly anniversary of the purchase date; it has no renewal field).

- **Launch / Pause in HQ (Alex, 2026-11-27):** Pause acts at once (no "are you sure"). Launch asks one last time before it goes live. Alex approves the direction (plan, copy) and the agents work toward getting it done.

- [2026-11-28] **Content lives in HQ (Alex, round 5):** the Airtable Content Center does not stay in Airtable. Every step it offers (Frame.io, edit, thumbnail, YouTube details, clips, posts) is an HQ button that does the same thing the same way (same Content Automation Action value, n8n webhook and body, or field write), and distribution happens in HQ: per platform the post to review, Approve, and where / when it was posted with views, likes, comments. Approve never schedules; scheduling (Instagram / YouTube Shorts via OpusClip) runs only when Alex presses Schedule; HQ never posts. Calendar and Friday stay; Friday walks each script step by step. Why: Alex, "I want to build the content center inside Dulcy HQ… distribute it on Instagram, Reddit, TikTok, Twitter… That's what I want to do in here."

- [2026-11-28] **Won lives in Close; Airtable follows (Alex):** "It should be marked [Won] in Close and then it feeds back to Airtable." A deal is marked Won in Close only; the engine stage `sales.won_sync` copies it to the matching Sales Data row (Stage Won, Deal Closed?, Deal Closed Date, Offer Amount if empty) so the Sales Goals rollups count it. Matched by contact email, then company; ambiguous = skipped and shown in HQ for Cole. Never writes Close, never moves a row away from Won. Dry run until `sales.won_sync` is in LIVE_STAGES. **Why:** no Sales Data row was ever marked Won, so Sales Goals and the n8n goals workflow counted 0 closed deals.
- [2026-11-28] **Final clips and Gamma in HQ (Alex):** the final-clip approval moves into HQ too (video page: full video + each final clip, Approve / Request changes with a note; same Review Intent and n8n check as the Content Center). The n8n owner check is only widened (HQ-signed intent) with Alex's ✅ on its Decision. Gamma's API needs a paid plan, so the Gamma outline becomes an HQ resource document (Alex's PDF style, Download PDF via print); no new paid service, no Drive write. Why: Alex, "For the final clip: yes, everything. For creating Gamma: can that not happen on a free plan? If not, just make it a Google Doc / a PDF."

# Standing rules

Each rule has a date and a source. A rule stays until Alex changes it. Newest dated rule wins on a conflict.
Format: `- [date] rule. (why / source)`

## Safety and approval
- [2026-11-17] Do not send emails, launch campaigns, post, spend money/credits, delete files or change important business records without Alex's explicit approval of that exact action. (Alex; legacy Jarvis rules)
- [2026-11-17] A draft, a built list, or a request to "prepare" something is NOT approval to launch or send. (Airtable skill)
- [2026-11-17] Do not state client counts, results or proof that are not verified for Dulcy. The "300+ clients" figure in old notes came from another agency's post and is wrong. Dulcy has 6 clients plus itself. (Alex correction)
- [2026-11-17] Never include keys, tokens, passwords, cookies or client prospect rows in this repo. (design)

## Campaign health
- [2026-11-18] Bounce auto-pause: pause when bounce is over 4% **and** the campaign is at 35%+ progress. The floor stops early small numbers from pausing it (1 bounce in the first 10 emails = 10%). The check must re-run on every metric refresh, not fire once. Over 2.5% = watch. (Alex)
- [2026-11-18] Failed campaigns restart automatically: a failure is usually an error on the sending system's side. Long-running jobs (18+ hours seen) must be investigated, and the engine needs time limits. (Alex)
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
- [2026-11-17] Verification order: MillionVerifier first; LeadMagic for direct contacts or recovery when needed. Do not treat catch-all as confirmed. Check status on an existing job instead of re-running a paid job. (Airtable skill)
- [2026-11-17] Copy: no spintax in client-facing text, no manual signature. Do not spin variables like {FIRST_NAME}. Run EmailGuard spam check and manual review before upload. (Workflow SOP)
- [2026-11-17] Sender domains: no .info domains. This is only about buying sender domains, not about recipients. (Alex)
- [2026-11-17] Allocate senders only after the final usable lead count is known. (Airtable skill)
- [2026-11-17] Launch only after Alex confirms. (Workflow SOP) **Changed 2026-11-18:** the lead engine launches automatically once all launch checks pass (list in `engine/PLAN.md`). Manual launches by agents or Claude still need Alex's OK. (Alex)

## Replies and inbox
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
- [2026-11-18] Claude may merge its own pull requests into `main` without asking each time, only after the tests pass, and tells Alex each time. (Alex)
- [2026-11-17] Agent roster is: Ada (router), Riley (ops/automation), Atlas, Scout, Scribe, Cole (sales), Forge (offers), Sienna (social/content), Pixel (paid ads), Lex (legal/HR), Ledger (finance), Harper (hiring/people), Red Dog (trading). Jarvis is renamed Ada; the "Airtable" skill becomes Riley. (Alex)
- [2026-11-17] Bounce and campaign-health checks belong to Atlas, never Riley. Riley only fixes n8n and Make.com (and Airtable automations). (Alex correction)
- [2026-11-17] Build agents one at a time; Alex approves each before the next. (Alex)
- [2026-11-17] Atlas leads every campaign: runs the managed Airtable campaign/list stages and directs and checks Scout, Scribe and Forge. Riley only fixes systems (n8n, Make, Airtable automations/scripts), not campaign work. Supersedes earlier lines that gave Riley the Airtable stages. (Alex correction)
- [2026-11-17] Roster update: Forge (offers) is separate from Atlas. Cole (sales/closing) is a separate skill. Scribe is copywriting only. New agent Sean owns reply handling (cold prospect to booked meeting) and the AI replier. Sienna is a full-size agent. Pixel, Lex, Ledger, Harper stay short for now. Red Dog stays out of this repo. Supersedes the earlier roster line where they differ. (Alex)
- [2026-11-17] Keep answers simple: direct result first, exact numbers, short done/left lists. (Alex)
- [2026-11-17] Work in small committed steps. A previous Codex run spent heavily for 14 days without finishing; do not repeat that. (Alex)
- [2026-11-17] ChatGPT handles admin, reporting, personal tasks and email support. Claude handles campaign building, automation and code. (Alex)

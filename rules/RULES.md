# Standing rules

Each rule has a date and a source. A rule stays until Alex changes it. Newest dated rule wins on a conflict.
Format: `- [date] rule. (why / source)`

## Safety and approval
- [2026-11-17] Do not send emails, launch campaigns, post, spend money/credits, delete files or change important business records without Alex's explicit approval of that exact action. (Alex; legacy Jarvis rules)
- [2026-11-17] A draft, a built list, or a request to "prepare" something is NOT approval to launch or send. (Airtable skill)
- [2026-11-17] Do not state client counts, results or proof that are not verified for Dulcy. The "300+ clients" figure in old notes came from another agency's post and is wrong. Dulcy has 6 clients plus itself. (Alex correction)
- [2026-11-17] Never include keys, tokens, passwords, cookies or client prospect rows in this repo. (design)

## Campaign health
- [2026-11-17] Bounce rate over 2.5%: send a watch notification, keep an eye on it. (Alex)
- [2026-11-17] Bounce rate over 4%: campaign is paused automatically and must be investigated. An Airtable project-management task is created and an email goes to Alex. Causes to check: copy, email accounts, list quality, email security gateways. Use the Spam Center. (Alex)
- [2026-11-17] Interested rate = interested replies / replies. A top-up needs an interested rate above 15%. (Alex, from handoff)
- [2026-11-17] Over-4% pause rule supersedes older SOP wording of "below 2.5%". Both thresholds are real: 2.5 = warn, 4 = pause. (Alex)
- [2026-11-17] At about 60% campaign completion, Airtable sends a notification. Then: review the next-campaign recommendation, replies, bounce data and variant performance, and plan the next campaign for that client. Atlas decides top-up vs new vertical vs new offer vs copy change. (Alex; Airtable skill)

## Building campaigns and lists
- [2026-11-17] Run campaign/list stages through the Airtable interface and stage gates. Do not substitute raw status/checkbox edits or direct provider calls. (Handoff, Alex)
- [2026-11-17] First sample is 100 companies. Approve when usable fit is at least 80% (prefer 85%+). Scale 100 -> 1,000 -> 10,000 only after review. (Alex)
- [2026-11-17] Review company fit and contact fit separately. Test contacts from the first 100 companies. (Airtable/Scout skill)
- [2026-11-17] After provider contact search, do NOT run a second paid AI/web-research review. Ambiguous contacts stay NeedsReview for manual Approve / Reject / Leave pending. (Alex, Oct 9 correction)
- [2026-11-17] Default lead database is DiscoLike unless the campaign says otherwise. (Workflow SOP)
- [2026-11-17] Verification order: MillionVerifier first; LeadMagic for direct contacts or recovery when needed. Do not treat catch-all as confirmed. Check status on an existing job instead of re-running a paid job. (Airtable skill)
- [2026-11-17] Copy: no spintax in client-facing text, no manual signature. Do not spin variables like {FIRST_NAME}. Run EmailGuard spam check and manual review before upload. (Workflow SOP)
- [2026-11-17] Sender domains: no .info domains. This is only about buying sender domains, not about recipients. (Alex)
- [2026-11-17] Allocate senders only after the final usable lead count is known. (Airtable skill)
- [2026-11-17] Launch only after Alex confirms. (Workflow SOP)

## Replies and inbox
- [2026-11-17] AI reply drafts are review-only. Josh or Alex approve every outgoing reply. Reply Agent pilot is on for Dulcy only, in Human in the Loop mode. (Reply Agent SOP, Oct 7)
- [2026-11-17] Respect unsubscribes and stop requests. Never override suppression. (Reply Agent SOP)

## How to work with Alex
- [2026-11-17] Keep answers simple: direct result first, exact numbers, short done/left lists. (Alex)
- [2026-11-17] Work in small committed steps. A previous Codex run spent heavily for 14 days without finishing; do not repeat that. (Alex)
- [2026-11-17] ChatGPT handles admin, reporting, personal tasks and email support. Claude handles campaign building, automation and code. (Alex)

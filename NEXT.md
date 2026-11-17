# Where we are (update this at the end of every session)

Last updated: 2026-11-17 (live pull from n8n and Airtable)

## Done
- Repo is the memory: CLAUDE.md, rules/RULES.md, rules/decisions-log.md, five skills, SOPs, client index, channel evidence, pricing.
- 15 n8n workflow snapshots (local, not verified live) with plain-English maps.
- Build-error playbook from the 10 recent alerts: `rules/build-error-playbook.md`.
- One "dulcy-os" account skill proposed to Alex (needs his save click).
- Live n8n export: all 158 workflows, cleaned: `automations/n8n-live-2026-11-17/` (replaces the old snapshots).
- Airtable: schema of 53 tables, 50 interface pages, the 4 custom screens' code, and all 51 automations with scripts: `airtable/`.
- Found: Lead List "stage 01/02" = `Company and Contact Review - Adaptive Refinement` + `Company Expansion Worker`. The lock sub-workflow `JXPiiC2XLCvxCRqzEKk_0` = `[Campaign Center] Coordinate Replenishment Cycles`.

## Still missing from ChatGPT / Alex
- Josh's inbox process (how he works replies day to day)
- Reply Agent settings values (schema and code are saved; the settings records were not read)
- Client business goals for 5 of 6 clients

## To verify / Alex decides
- Webhooks: checked 2026-11-17. ~100 of 106 webhook workflows have no auth (only 4 use header auth, 2 check a secret in code). Lead List 03-06, Inbox Manager and Reply Agent intakes are open to anyone with the URL. Fix = add header auth. Alex decides.
- Hardcoded keys still live: 13 n8n workflows plus 6 Airtable scripts have API keys typed in (EmailBison, HeyReach, Synthflow, Fanbasis and others). Fix = move them to credentials or secrets and rotate. Alex decides. List: `automations/n8n-live-2026-11-17/README.md` and `airtable/automations/INDEX.md`.
- Where the over-4% bounce auto-pause runs: not found in Airtable automations or by search in n8n. UNKNOWN.
- All 158 n8n workflows show active and updated 16:30-16:44 UTC today. UNKNOWN what changed.

## Next work, in order (Alex decides)
1. Finish the foundation as the missing items arrive.
2. Top Up fix: reconcile-one-import action, then move CSV prep out of n8n.
3. Logging of full response bodies on EmailBison/HeyReach calls.
4. Build the 60%-alert "next campaign" flow (review brief -> Scout/Scribe -> managed Airtable stages -> stop for Alex's approval).
5. Move heavy Airtable script logic into small server code.

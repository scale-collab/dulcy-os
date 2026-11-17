# Where we are (update this at the end of every session)

Last updated: 2026-11-17

## Done
- Repo is the memory: CLAUDE.md, rules/RULES.md, rules/decisions-log.md, five skills, SOPs, client index, channel evidence, pricing.
- 15 n8n workflow snapshots (local, not verified live) with plain-English maps.
- Build-error playbook from the 10 recent alerts: `rules/build-error-playbook.md`.
- One "dulcy-os" account skill proposed to Alex (needs his save click).

## Still missing from ChatGPT / Alex
- Lead List Center stages 01 and 02, lock sub-workflow `JXPiiC2XLCvxCRqzEKk_0`
- Airtable scripts and schema; Josh's inbox process and Reply Agent settings
- Client business goals for 5 of 6 clients
- Fresh live n8n exports (current files are snapshots)

## To verify
- Webhooks on stages 03/04/05/06, Top Up and the builders show no n8n header auth. Confirm they are protected.

## Next work, in order (Alex decides)
1. Finish the foundation as the missing items arrive.
2. Top Up fix: reconcile-one-import action, then move CSV prep out of n8n.
3. Logging of full response bodies on EmailBison/HeyReach calls.
4. Build the 60%-alert "next campaign" flow (review brief -> Scout/Scribe -> managed Airtable stages -> stop for Alex's approval).
5. Move heavy Airtable script logic into small server code.

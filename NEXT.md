# Where we are (update this at the end of every session)

Last updated: 2026-11-17 (live pull from n8n and Airtable)

## Done
- Repo is the memory: CLAUDE.md, rules/RULES.md, rules/decisions-log.md, five skills, SOPs, client index, channel evidence, pricing.
- 15 n8n workflow snapshots (local, not verified live) with plain-English maps.
- Build-error playbook from the 10 recent alerts: `rules/build-error-playbook.md`.
- One "dulcy-os" account skill proposed to Alex (needs his save click).
- Live n8n export: all 158 workflows, cleaned: `automations/n8n-live-2026-11-17/` (replaces the old snapshots).
- Airtable: schema of 53 tables, 50 interface pages, the 4 custom screens' code, and all 51 automations with scripts: `airtable/`.
- Make.com: all 79 scenarios (28 on) in `automations/make-2026-11-17/`. 2 errors in 30 days. The sales process (Calendly → Close → Airtable → Slack) runs in Make.
- Found: Lead List "stage 01/02" = `Company and Contact Review - Adaptive Refinement` + `Company Expansion Worker`. The lock sub-workflow `JXPiiC2XLCvxCRqzEKk_0` = `[Campaign Center] Coordinate Replenishment Cycles`.

## Still missing from ChatGPT / Alex
- Josh's inbox process (how he works replies day to day)
- Reply Agent settings values (schema and code are saved; the settings records were not read)
- Client business goals for 5 of 6 clients

## To verify / Alex decides
- Make Booked Meeting: Calendly lead source can arrive in quotes (`"Google"`) and break the Airtable step; the scenario stopped on 2026-11-12. Fix = clean the value. Also: answers are read by position (fragile).
- Make: failed runs are not kept for retry (incomplete executions off on all 28 active). Fix = turn on for the sales scenarios.
- Make reply webhook queue 650/667 full, its scenario off. One of 34 EmailBison client workspaces probably still sends replies to Make. Check each workspace's webhooks.
- Webhooks: checked 2026-11-17. ~100 of 106 webhook workflows have no auth (only 4 use header auth, 2 check a secret in code). Lead List 03-06, Inbox Manager and Reply Agent intakes are open to anyone with the URL. Fix = add header auth. Alex decides.
- Hardcoded keys still live: 13 n8n workflows plus 6 Airtable scripts have API keys typed in (EmailBison, HeyReach, Synthflow, Fanbasis and others). Fix = move them to credentials or secrets and rotate. Alex decides. List: `automations/n8n-live-2026-11-17/README.md` and `airtable/automations/INDEX.md`.
- Where the over-4% bounce auto-pause runs: not found in Airtable automations or by search in n8n. UNKNOWN.
- All 158 n8n workflows show active and updated 16:30-16:44 UTC today. UNKNOWN what changed.

## Parked (low priority)
- EmailGuard in the Claude desktop app: config is in place, but the `emailguard-mcp` program is not installed on Alex's Mac. The install steps are on app.emailguard.io/integrations/emailguard-mcp (login needed). Not needed for cloud sessions; EmailGuard already works there. Parked 2026-11-17.

## Agent build (one at a time, Alex approves each)
- [x] All 13 built 2026-11-17: Ada (main session) + 12 sub-agents in `.claude/agents/`, skills in `skills/`.
- [x] Closers.io library fully read (198 lessons) → Cole (+ Pixel ads, Harper hiring, Ledger finance pointers). Sean has Dulcy reply history (6 months), creator methods and Drive SOPs. Pixel/Lex/Ledger/Harper expanded from Alex's zip.
- [ ] Still UNKNOWN: Josh's daily routine and approvals (Sean), Sienna cadence and Reddit format, the 7FSA course beyond 5 docs (Cole).
- [ ] Ask Alex (conflicts): calendar link vs 2 specific times; price by email or not; follow-up count after a positive reply; mock-call interviews yes/no; RevReply still in use?
- [ ] Alex reviews each agent and corrects it.

## Next work, in order (Alex decides)
1. Finish the foundation as the missing items arrive.
2. Top Up fix: reconcile-one-import action, then move CSV prep out of n8n.
3. Logging of full response bodies on EmailBison/HeyReach calls.
4. Build the 60%-alert "next campaign" flow (review brief -> Scout/Scribe -> managed Airtable stages -> stop for Alex's approval).
5. Move heavy Airtable script logic into small server code.

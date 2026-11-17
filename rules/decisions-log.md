# Decisions log (append only)

Newest at the bottom. Format: `date | decision | why | who`

2026-11-17 | Claude is the orchestrator for campaign building, automation and code; ChatGPT is admin | Campaign creation keeps hitting errors in the ChatGPT setup; Claude is stronger for code and workflows | Alex
2026-11-17 | Create `dulcy-os` as the single memory repo, separate from `dulcy-lead-worker` | The Codex run spent about 14 days and never finished moving everything into GitHub; the lead-worker repo is only one offline workflow build | Alex
2026-11-17 | Bounce thresholds: over 2.5% watch, over 4% auto-pause and investigate | Older SOPs said 2.5 only; Alex confirmed both levels | Alex
2026-11-17 | Move heavy logic out of Airtable custom scripts into small server code that Airtable calls; keep Airtable as screen and database | Long Airtable scripts freeze and load slowly. Full custom app deferred until logic is stable | Alex agreed direction, Claude recommendation
2026-11-17 | Personal skills (fitness, nutrition, travel etc.) stay out of this repo | Business repo; personal data stays separate | Claude (reversible)
2026-11-17 | Known wrong fact removed: "300+ clients" | It was from another agency's post pasted into notes | Alex
2026-11-17 | n8n workflow exports may be stored in `automations/n8n-workflows/` if credentials are stripped and a secrets scan is clean | Alex wants all automations in GitHub so nothing is lost; credentials must never be committed | Alex (intent), Claude (guardrail)
2026-11-17 | Never retry a whole top-up after an import checkpoint failure; reconcile the single failed import | Retrying risks re-uploading leads; the workflow's own error text says the same | Claude, from saved code and alerts (Alex to confirm)
2026-11-17 | Campaign Center workflows, error evidence, pricing and channel evidence imported from ChatGPT focused handoff | Alex wants the build errors fixed and company facts kept in GitHub | Alex
2026-11-17 | Live n8n (158) and Airtable (schema, 4 screens, 51 automations) pulled read-only into the repo, with keys, webhook paths and prospect rows removed | Alex asked to read all of the Airtable and n8n connectors; repo must hold no secrets or prospect rows (RULES) | Alex (ask), Claude (scrubbing)
2026-11-17 | Agent roster set: Ada, Riley, Atlas, Scout, Scribe, Cole, Forge, Sienna, Pixel, Lex, Ledger, Harper, Red Dog. Jarvis→Ada, Airtable skill→Riley | Alex's own custom agents, renamed for Claude | Alex
2026-11-17 | Roster update: add Sean (reply handling + AI replier); Forge and Cole separate; Scribe copy only; Sienna full; Red Dog out of repo | Different jobs need separate owners; trading is personal | Alex

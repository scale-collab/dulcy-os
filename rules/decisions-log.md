# Decisions log (append only)

Newest at the bottom. Format: `date | decision | why | who`

2026-11-17 | Claude is the orchestrator for campaign building, automation and code; ChatGPT is admin | Campaign creation keeps hitting errors in the ChatGPT setup; Claude is stronger for code and workflows | Alex
2026-11-17 | Create `dulcy-os` as the single memory repo, separate from `dulcy-lead-worker` | The Codex run spent about 14 days and never finished moving everything into GitHub; the lead-worker repo is only one offline workflow build | Alex
2026-11-17 | Bounce thresholds: over 2.5% watch, over 4% auto-pause and investigate | Older SOPs said 2.5 only; Alex confirmed both levels | Alex
2026-11-17 | Move heavy logic out of Airtable custom scripts into small server code that Airtable calls; keep Airtable as screen and database | Long Airtable scripts freeze and load slowly. Full custom app deferred until logic is stable | Alex agreed direction, Claude recommendation
2026-11-17 | Personal skills (fitness, nutrition, travel etc.) stay out of this repo | Business repo; personal data stays separate | Claude (reversible)
2026-11-17 | Known wrong fact removed: "300+ clients" | It was from another agency's post pasted into notes | Alex

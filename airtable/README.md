# Airtable: schema, screens and automations

Pulled read-only on 2026-11-17 through the Airtable connector. **Schema and code only. No records were read or saved.**

## Bases
| Base | ID | What it is |
|---|---|---|
| Dulcy | `appxqINt5XKw7a76A` | The operating system: 53 tables. Everything below is about this base. |
| Inbox Placement Tests | `appP0WXcqWoGSIhh5` | 1 table (`Tests`). Schema: `schema/inbox-placement-tests-base.tables.json` |
| Ignition Dev Database | `appJNoGcSkyIEPQ68` | Old scraper/Discord project (GMB, Clutch, Yelp and other scrapers). Not saved here; likely history. UNKNOWN whether it is still used. |
| Team Reviews | `app3oyl626qFDb9cT` | Interface-only access: 2 pages (Account Manager Reviews, Developer Reviews). |

## Files
- `SCHEMA.md`: every table and field in plain form, with select options and formulas.
- `schema/dulcy-base.schema.json`: full schema (field IDs, types, configs).
- `schema/dulcy-base.interfaces.json`: interfaces and pages (9 interfaces, 50 pages).
- `custom-elements/`: source code of the 4 custom screens (see below).
- `automations/`: all 51 Airtable automations with full script code (47 deployed, 4 off). Index: `automations/INDEX.md`. An EmailBison token (4 scripts) and a webhook secret (2 scripts) were hardcoded and are removed here.

## The "managed interface" = 4 custom elements
The stage gates that `rules/RULES.md` refers to live in these screens' code:
| Screen | Interface / page | Main table | Code |
|---|---|---|---|
| Lead List Center | Campaigns / Lead List Center | Lead Lists | `custom-elements/lead-list-center/source.tsx` |
| Campaign Center | Campaigns / Campaign Center | Campaigns | `custom-elements/campaign-center/source.tsx` |
| Dulcy Reply Agent | Inbox Manager / Dulcy Reply Agent | Dulcy Reply Agent Settings | `custom-elements/reply-agent/source.tsx` |
| Content Center | Content OS / Content Center | Content Channels (Alex Woung) | `custom-elements/content-center/source.tsx` |

## Stage fields (what the screens move records through)
**Lead Lists**
- `Lead List Stage`: Draft, Source & ICP, Targeting, Searching, Source Imported, Contacts Ready, Verification, Enrichment, QA, Ready, Uploaded, Failed, Archived
- `Automation Action` (the button field that starts n8n through the "Lead List Center Dispatcher" automation): Run Company Sample, Refine Company Sample, Review Saved Company Sample, Test Saved Company Evidence (1), Apply Verified Company Evidence, Expand Companies, Restart Companies, Build Contact Sample, Build New Contact Sample, Apply Contact Decisions, Expand Contacts, Verify and Finalize, Retry Failed Stage, Generate Filters
- `Enrichment Action`: Prepare Enrichment Prompt, Run Enrichment ("Enrichment Action" automation)
- `QA Action`: Run Automated QA ("QA Airtable automation")
- `Processing Status`, `Company Validation Status`, `Contact Validation Status`, `Contact Queue Status`, `QA Status`

**Campaigns**
- `Workflow Stage`: Strategy Draft, Internal Review, Client Review, Changes Requested, Approved, Spintax in Progress, Build Ready, Launch Ready, Live
- `Campaign Status`: Draft, Active, Inactive, Emails Generated, Spintax Generated, Uploaded, Completed, Waiting for Approval
- `Bison Action`: Launch, Pause, Delete ("Campaign Center - EmailBison Actions" automation)
- `Top-up Status`: Ready, Requested, Running, Completed, Failed
- `Processing Status`: Running, Completed, Failed, Needs review

## Alert automations that match the rules
- "Notification - Campaign Bounced over 2.5%": fires at bounce ≥ 2.5 once the campaign is ≥ 35% complete. Sends Slack and creates a record.
- "Notification - Campaign Progress Over 60%": one Slack alert per confirmed replenished cycle.
- "Notification - Campaign Replies under 1%", "Notification - Campaign PR Rate sub 10% after 1500 emails".
- **No Airtable automation for the 4% pause was found.** UNKNOWN where the over-4% auto-pause runs; it may be in n8n. To check.

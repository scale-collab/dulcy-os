# Dulcy OS: read this first, every session

This repo is Dulcy's memory. Claude loads it at the start of every session (Claude Code and Chat).
If something here conflicts with an older file, this file and `rules/RULES.md` win.
If Alex says something new in chat, the newest instruction wins, and you log it (see "Remembering").

## Who and what
- **Dulcy** (legal name Dulcy Media LLC) is a growth-partner agency run by **Alex (Alexander Woung)**.
- It helps B2B service businesses get more sales opportunities with AI omnichannel outreach.
- **Channels:** cold email, LinkedIn, direct mail, AI caller.
- **Right now only cold email works.** LinkedIn and direct mail need system fixes. The AI caller underperforms, and its direction is undecided (maybe replace with humans).
- **Clients:** 6, plus Dulcy itself (7 campaign owners in total). Do NOT state any larger client count.
- **Team:** Alex and **Josh** (VA, inbox manager: keeps replies moving toward booked meetings).
- **Website:** https://dulcy.io

## Roles
- **Claude = orchestrator** for campaign building, automation and code. Use sub-agents when a task needs them.
- **ChatGPT = admin**: email drafting/sending support, reporting, personal tasks. It holds history that has not yet been moved here.
- Specialist skills live in `skills/`: Atlas (strategy/offers/client health), Scout (ICP and lead lists), Scribe (copy and replies), Airtable (managed stages and operations), Jarvis (routing and business support). Old role names are retired.

## Stack
Airtable (operating system: Campaign Center, Lead List Center, projects, CRM) · EmailBison (sending) · DiscoLike, LeadMagic, MillionVerifier, Clay (lists and verification) · EmailGuard (spam/placement) · Slack · Google Drive/Sheets · n8n/Make · Close · Apollo · Calendly · Xero.

## Non-negotiables (full list in `rules/RULES.md`)
1. Never send, launch, spend credits, delete or change client-facing records without Alex's explicit go-ahead for that exact action.
2. Run campaign and list stages through Airtable's managed interface and the stage gates. Do not shortcut with raw status or field writes.
3. Never invent client proof, results, prices or promises. Never reuse one client's facts for another.
4. Bounce rate: over 2.5% = watch. Over 4% = campaign is paused and must be investigated.
5. Work in small steps and commit often. Never run long unbounded jobs that burn credits.
6. Answer Alex simply: result first, exact numbers, short done/left lists. No invented percentages of completion.

## Remembering (this is the point of this repo)
- When Alex corrects you or sets a rule, add it to `rules/RULES.md` with the date and the reason, and add a line to `rules/decisions-log.md`. Do it in the same session.
- A rule stays in force until Alex explicitly changes it. Old SOPs, examples and snapshots never override a logged rule.
- If two sources conflict, ask Alex once, then log the answer.
- Mark unknowns as `UNKNOWN`. Do not guess.

## Where things live
| Need | Path |
|---|---|
| Where we left off, next steps | `NEXT.md` |
| Standing rules and corrections | `rules/RULES.md` |
| Why we decided things | `rules/decisions-log.md` |
| Company facts, channel status, goals | `company/` |
| One file per client | `clients/` |
| Specialist skills | `skills/` |
| Source SOPs (history, not validated as current) | `sops/drive-export/` |
| n8n and automation notes | `automations/` |
| Old Jarvis project (history only) | `legacy/` |
| Code worker (separate private repo) | `scale-collab/dulcy-lead-worker` (offline, never connected to live) |

# Drafting run (Josh out / Sean draft mode), set up 2026-11-24

Read-only find, draft, Alex approves each reply, then send. Nothing is sent without Alex's yes per reply.

## Find waiting replies (Airtable base appxqINt5XKw7a76A, table Emails tblADFhWhTcLrl1UY)
- Last Email Sent `fldE9bxKtmeRsvG9f` = "Last Email Sent By Prospect"
- Latest Reply Time `fldb1GEPgDTyJPm2v` within N days (1 = new, 14 = backlog)
- Lead Status `fldr2uNiscZfeCNiT` or Reply Agent Intent `fldSgiv4CLnRBEJGc` in Interested / Meeting Request / Info Request / Information Request
- Pipeline Stage `fldSuQyvPM3IlS5oD` not Booked / Completed / Closed / Lost; DNC `fldbme5e9wDtnVwrx` not ticked
- Split by Workspace ID `fldCjo0mB0snziNZQ` and Client Handling `fldztj8riBd1MHclA`
- Read Conversation History `fldYocEhrAzRUw9sA`, Latest Reply `fldjG76LvUTv60Pzj`, old draft `fldiokFlOaUEEs2qX` (redraft if Updated At `fldTn2Eth51XolDMg` is older than Latest Reply Time). Thread link: Master Inbox Link `fld2O5QJTMWuon07S`.
- Caveats: "By Dulcy" can be anyone sending from our inbox; Latest Reply is sometimes the client's own message. Counts are a floor.

## Workspaces
Dulcy 2, Twenty West Media (Internal) 66, MJJ Brilliant 80, Human Marketing 72, Global Media Group / Scroll Stop 42, Lead Flo 68, The Marketing Cartel 78.

## Draft rules
- Under 40 words, Alex's voice, not AI voice. Offer 2 dated ET times, no link (Dulcy rule). Never "just bumping", never "take your time": "think about it" -> what do you need to think about (closers-methods.md line 190; script sops/drive-export/098-Example-Dulcy-Sales-Script.md ~781, guarantee ~1302). No script claims we can't prove by email.
- Prices: UNKNOWN for every client: say it depends and flag to Alex.
- Client facts only from clients/*.md and rules/client-promise-contract.md.

## Send routes (Alex's yes per reply)
- Dulcy threads: Human Action `fldvdJBtL4ez5lbjN` = Approve Draft / Send Edited Reply (n8n approved sender v4 sends, Dulcy only).
- Client threads: EmailBison POST /api/replies/{reply_id}/reply in that workspace, or Alex pastes it in the master inbox.

## Snapshot 2026-11-24 (14 days)
Waiting on Dulcy: 8 (TWM 5 mixed, MJJ 1, GMG 2). Waiting but Client Handling: 30 (TWM 10, MJJ 15, Human 5).

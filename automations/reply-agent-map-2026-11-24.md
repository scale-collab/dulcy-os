# Dulcy Reply Agent map (read-only), 2026-11-24

Mapped by Riley for Ada. Nothing was changed, run or sent. Sources: live Airtable MCP (base appxqINt5XKw7a76A) read on 2026-11-24; live n8n MCP list (active flags, node lists); node logic from the repo snapshot `automations/n8n-live-2026-11-17/workflows/` (every Reply Agent workflow shows updatedAt 2026-11-17 in live n8n, so the snapshot should match, but node code was not re-diffed live). Credentials, webhook paths, prospect names/emails and client CC addresses are left out.

## 0. Result in one screen
- **Drafting brain today = n8n + OpenAI.** Two n8n intakes poll the Emails table every minute and write the draft: `DulcyReplyClientPilotV4` (Dulcy, workspace 2) and `DulcyClientDraftOnlyV1` (7 client workspaces). Both call OpenAI ("Classify and Draft"), then run about 38 KB of policy code that blanks the draft whenever a check fails. That is why Alex couldn't control the replies.
- **The AI sender covers Dulcy only.** `DulcyReplyPilotSenderV4` filters on Workspace Record ID = Dulcy (recJx0WwHsdsvcVIN). No AI-draft sender exists for client workspaces.
- **Clients are sent by hand.** The Airtable button automation "Send Email (SL and EB)" (wflVhGbUEolHEGuk6) sends **Custom Reply** through EmailBison for every workspace, using that workspace's key and its CC/BCC settings.
- **The learning loop is open.** 2,540 Reply Learning rows exist and are written on every human or agent send. All of them are "Candidate" except 1 "Rejected". The drafter reads only `Review Status = Approved`, so it gets 0 examples.
- **Live state (Emails rows with an agent State): 5,253.** Suppressed 2,429; Paused 1,764; Skipped 672; **Needs Approval 250**; Scheduled 138. No row is in Approved, Sending or Sent. Human Action: None 4,199, Pause 415, blank 639, and 0 rows set to Approve Draft.
- **The engine's Echo writes somewhere else.** Today it writes to the **Decisions** table and Slack, not to the Emails fields the interface shows. Its sender (`decision.send_reply`) does work for any workspace. But it sends with `reply_all: true` and no per-workspace CC/BCC, and it skips the sender and recipient checks the Airtable script does.

## 1. Interfaces and pages that show or act on replies
The page API does not expose page buttons or button elements. Which control sets Human Action is **UNKNOWN** (see section 6).

| Interface | Page (ID) | Type | Source table | Fields shown (editable = E) |
|---|---|---|---|---|
| Inbox Manager (pbd3Mm3M821hp7FfK) | **Reply Queue** (pagRHmLhJurrmwM8z) | list | Emails | Leads Name E, Reply Category (formula from Intent), Dulcy Reply Agent State E, Latest Reply E, **Dulcy Reply Agent Draft E**, Reply Explanation E, Reply Feedback E. Human Action, Custom Reply and Policy Decision are **not** on the page. |
| Inbox Manager | **Reply Learning** (pag9u2da2kRzmjLsr) | list | Reply Learning | Example, Workspace Record ID, Situation, Prospect Message, AI Draft, Approved Reply, Feedback, Review Status, Outcome (all E) |
| Inbox Manager | **Dulcy Reply Agent** (pagda9IfumZcbFxyC, element pelBom8zR6PlwIcHD) | custom element | Dulcy Reply Agent Settings | Settings editor with tabs: Overview, Company & Agent, Calendar, Routing, Follow-ups, Responses, Knowledge, Analytics. Writes the settings JSON fields and the Calendar Connection Request JSON (button "Create Google connection link"). Repo source: `airtable/custom-elements/reply-agent/source.tsx` |
| Dulcy IOS (pbddsHZS20Jyo37ap) | Main (paguO0gOapHDuJNdM), New Replies (pagToiusGvZHJ4gl4), Positive Replies (pagctbX7UF5mZe5IZ), Follow Ups (pag5WtIAc916lpxc8), Meeting Requested (pag5cNZTjvZ5yDEgQ), Won (pagNjqTUZipur4Sez), Lost (pagh92dFgX8A9BYn3) | list | Emails | lead + camp, Lead Status E, Subject, Latest Reply, Leads Email, Inbox Email, Master Inbox (button: opens EmailBison thread), ESP, **Custom Reply E**, Conversation History. Won/Lost add Opportunity Status E. Main adds Last Email Sent E. No Reply Agent fields at all. |
| (record detail) | Record Detail (pagJQrQimnxxxCc8h) | detail | Emails | Same fields as the Dulcy IOS lists; Custom Reply E. This is where the human send button lives (it triggers "Send Email (SL and EB)"); button placement inferred, not visible via the API. |
| Dashboards | Reply Analytics — Legacy (pagEljvMOieeW42rH) | dashboard | Reply Analytics Daily (tblxJEt3ECTnEqGpd) | Meetings Booked, Unique Leads, Avg First Response, Touchpoints, Conversion (written by n8n 05 Daily KPI Snapshot) |

## 2. Airtable automations on Emails / Reply Agent tables
No automation is triggered by the Reply Agent Settings, Events or Learning tables, and none watches State or Human Action.

| Name | ID | Status | Trigger | What it does |
|---|---|---|---|---|
| **Send Email (SL and EB)** | wflVhGbUEolHEGuk6 | deployed | Interface button (Emails) | **Human sender for all workspaces.** Branch on ESP: Bison (+ "Untracked Reply" variant) or Smartlead. Gets the workspace's EmailBison key from Workspace IDs, checks the sender account and thread, sends to the prospect only (reply_all false), adds CC/BCC from the settings CC BCC Settings JSON, and confirms delivery. Then sets Last Email Sent = By Dulcy, clears Custom Reply, and (untracked branch) sets Pipeline Stage = In Conversation. |
| Client Replied | wflYwCvqfNQy9HZHE | deployed | recordUpdated on Push To Client Reply (fldzd2bHc5XMGidFk) | Same v4 sender script, for client-written replies |
| Push To Client Reply | wflRDIdrpmADyu8RP | deployed | button | Posts the whole record to a webhook (Slack to client); sets the push status |
| Inbox Manager - Explain Reply | wflLDXCgzJ8cZT45A | deployed | button | Posts the whole record to a Make webhook (Reply Explanation) |
| Apply Template / Apply Template (LinkedIn) | wflSOkbfLo0arhHkI / wflKzjtW9bUwYFHDn | deployed | button | Copies a template into Custom Reply |
| Send Message (Heyreach) / Send SMS (Twilo) | wfl5rYBLakhCLIJ8l / wfl39LssdljHRDDY0 | deployed | button | LinkedIn / SMS sends |
| Automate Client Request to Call from Slack | wflgiaDKaZsdMPKtr | deployed | button | Slack message |
| Webhook to Make for WON | wfljdbk1BZXSmpGZI | deployed | Opportunity Status changed | Make webhook |
| Positive Reply -> LinkedIn | wflGiqs2JakTl5O39 | deployed | LinkedIn URL set + Lead Status Interested | Script |
| Attach Booked Meetings to Client | wflv6Rf37XANupi6m | deployed | enters view | Links records |
| OOO - Alternative name an email | wflPXWwFPYrsSZPpc | deployed | Send alt email ticked | Script |
| OOO - Send Subsequence Email | wflTLPwbdADQGu6kK | **undeployed** | enters view | n/a |

## 3. Tables

### Emails (tblADFhWhTcLrl1UY): Reply Agent and send fields
| Field | ID | Type / options |
|---|---|---|
| Dulcy Reply Agent State | fldOfNaPJfpJLcInm | Received, Drafting, Needs Approval, Approved, Scheduled, Sending, Sent, Skipped, Suppressed, Paused, Failed, Thread Complete |
| Dulcy Reply Agent Intent | fldSgiv4CLnRBEJGc | Interested, Info Request, Meeting Request, Cost Objection, Process Objection, Not Interested, Do Not Contact, Out of Office, Check Back Later, Referred, Wrong Person, Automatic Reply, Other |
| Dulcy Reply Agent Confidence | fldeDQuwnq45HEep9 | percent |
| Dulcy Reply Agent Draft | fldiokFlOaUEEs2qX | long text |
| Dulcy Reply Agent Policy Decision | fldkfrqE1Xng2mftd | long text (JSON; the sender parses it) |
| Dulcy Reply Agent Due At | fldgqdIguhudcKI8Z | dateTime |
| Dulcy Reply Agent Human Action | fldvdJBtL4ez5lbjN | None, Approve Draft, Send Edited Reply, Skip, Pause, Resume |
| Dulcy Reply Agent Workspace Record ID | fldaSgBchAb4KiIZS | text (Workspace IDs rec id) |
| Dulcy Reply Agent Event ID | fldIe5tgtL4OVeJAj | text, convention `bison:<workspaceRecId>:<reply_message_id>` (the CC/BCC script trusts Intent only when this matches) |
| Dulcy Reply Agent Last Inbound Event ID | fldy284s0aaXCZaa7 | text |
| Dulcy Reply Agent Sender Email ID | fld2MljJektQP13d4 | text |
| Dulcy Reply Agent Attempt Count | fldgHbYqxm3YfPkA1 | number |
| Dulcy Reply Agent Sent At | fldbsojFueApMnmSy | dateTime |
| Dulcy Reply Agent Last Error | fldiM9YjXlyojPSpk | long text |
| Dulcy Reply Agent Updated At | fldTn2Eth51XolDMg | dateTime |
| Dulcy Reply Agent Suppression Reason | fldwhZFWvFSrvvG2P | long text |
| Dulcy Reply Agent Follow-up Type | fldDB9nVzj6mSprZP | None, Out of Office, Check Back Later, No Response |
| Reply Ownership | fldtWgoLnMFX7DFj8 | Dulcy Agent, Handoff (5,251 of 5,253 blank) |
| Client Handling | fldztj8riBd1MHclA | checkbox (97 ticked) |
| Custom Reply | fldCfgm35ZqyVe9xm | long text (human send body; also the "Send Edited Reply" body) |
| Reply Explanation / Reply Feedback | fld3OXhmjYmwkUAAK / fld5XBYEFeSimSIyp | long text (on Reply Queue; Reply Explanation is also written by the inbound n8n flow and the Make Explain button) |
| Reply Category | fld2EkyARl7blJklV | formula from Intent |
| Courtesy Reply Sent At, First Inbound Reply At, First Response At, Meeting Booked At, Touchpoints to Meeting | fldhLwoSv8rHzVP5k, fld13kyYbCsckb6BI, fld5ApgrrxDTJgXgp, fld7kOIDWTVycZtdA, fldleB6TDMnnJ5pJZ | KPI fields |
| Thread ids used by senders | reply_message_id fldvARFWnr4H2wC8V, email_stats_id (= sender_email_id) flds1ZqBq2ZW6dVBr, lead_id fldv66oGZQQ9Qscmb, campaign_id fldv0o5rhmd7jXDrt, Workspace ID (Bison) fldCjo0mB0snziNZQ, Clients Table fldtPAlC0MDPHTWcl, reply_uuid fldT2Nvl3qPmSMsgb, CC (Optional) fldGkiO630UgVCnv5, ESP fldBNI5MPeDfMELjd | |
| Thread state used by Echo | Last Email Sent fldE9bxKtmeRsvG9f, Latest Reply fldjG76LvUTv60Pzj, Latest Reply Time fldb1GEPgDTyJPm2v, Conversation History fldYocEhrAzRUw9sA, Lead Status fldr2uNiscZfeCNiT, Pipeline Stage fldSuQyvPM3IlS5oD, DNC fldbme5e9wDtnVwrx | |

State by workspace (live, rows with State set):

| Workspace ID | Needs Approval | Scheduled | Paused | Suppressed | Skipped | Agent Sent At set |
|---|---|---|---|---|---|---|
| 66 Twenty West (Internal) | 79 | 30 | 454 | 1,360 | 367 | 61 |
| 2 Dulcy | 105 | 47 | 710 | 217 | 1 | 24 |
| 42 Scroll Stop | 18 | 20 | 285 | 234 | 220 | 9 |
| 80 MJJ Brilliant | 18 | 2 | 60 | 161 | 42 | 6 |
| 68 Lead Flo | 16 | 3 | 86 | 138 | 3 | 4 |
| 72 Human Marketing | 8 | 31 | 110 | 200 | 7 | 4 |
| 78 Marketing Cartel | 4 | 5 | 27 | 72 | 0 | 5 |
| 77 Collabor | 0 | 0 | 25 | 45 | 32 | 0 |

"Sent At" on client workspaces comes from human sends that n8n reconciles (Manual Emails Sent / Reconcile delivery), not from AI sends: only the Dulcy sender exists.

### Dulcy Reply Agent Settings (tbl5nmzPUcNEBSWxH): 8 rows, live
Common to all 8: Enabled = true, Default Mode = Approval Required, OOO Mode = Approval Required, Min Auto Confidence 92%, Max Automatic Replies 3, Tone Warm, Length Brief, Timezone America/New_York, Office Start 09:00, Reply Handoff Mode Disabled. All have the same Follow-up Instructions text and the same 3-step Follow-up Plan JSON (1, 2 and 3 days).

| Settings rec | Workspace (rec / EmailBison ID / Workspace IDs status) | Office End | Calendar Provider / Status | Booking link | CC | Other |
|---|---|---|---|---|---|---|
| recufZ2ANl0pGFtMv | Dulcy (recJx0WwHsdsvcVIN / 2 / Active) | 17:00 | Google Calendar / **Connected** | Calendly link | off | Agent name set; Not Interested Nudge on; Company Context Override set; disableTimes false, disableLinks true; Enabled Reply Types = all 10; Always Human Review = all 10; Knowledge Base disabled |
| recILQ92uaAJqIlWL | Lead Flo Marketing (recaG8oBGaBKbWlns / 68 / Active) | 18:00 | Not Connected / Not Connected | GoHighLevel booking widget | n/a | |
| recZIkcddmhMRFyYB | The Marketing Cartel (recZgKU0gdB9AIZ5x / 78 / Active) | 18:00 | Not Connected | none | n/a | |
| recfoGyItSymvIRPn | MJJ Brilliant (recBP0AXQ0UYfTYz1 / 80 / Active) | 17:00 | Not Connected | none | **on** (client address, Interested-type replies) | weekends and holidays excluded; routing groups all Approval Required |
| recquKIh7XL5zCSId | Human Marketing (recbxOWoWWD8IN8Mn / 72 / Active) | 17:00 | Not Connected | HubSpot meetings link | **on** (client address) | same routing |
| recrBn4gdmTo5s42y | Collabor (reciYGfy3bI9jsVDo / 77 / **Inactive**) | 18:00 | Not Connected | none | n/a | |
| rectTigFN3Ft9f2Us | Scroll Stop / GLOBALMEDIAGROUP (recaSYeQ1KbhUGeAW / 42 / Active) | 18:00 | Not Connected | Google appointment link | n/a | |
| recthSnVjHOx0I1Ib | Twenty West Media (Internal) (recynyHPighsOPpjd / 66 / Active) | 18:00 | Not Connected | Calendly link | n/a | |

"Dulcy Free Campaigns" (ID 41, Active) has **no** settings row. The Workspace Key and Integration Settings JSON fields were not read.

### Reply Learning (tblSnh6YlMTOFSE8l)
Fields: Example, Workspace Record ID, Email Record ID, Situation (Interested / Not Interested / Out of Office), Prospect Message, AI Draft, Approved Reply, Feedback, Review Status (Candidate / Approved / Rejected), Outcome (Unknown / Replied / Meeting Booked / Rejected), Source, Updated At.
- **2,540 rows.** Created 2026-09-10 to 2026-11-24 (last at 19:07 UTC today). Review Status: all Candidate except 1 Rejected; **0 Approved**.
- In a 100-row sample: 97 Interested, 3 OOO; Outcome all Unknown; Feedback empty in all 100; AI Draft present in only 5 (most rows are human replies with no AI draft). The filtered count for "AI Draft not empty" came back as 100 with more pages, so the exact total is UNKNOWN (at least 100).
- Writers: n8n "Manual Emails Sent" (Source `EmailBison manual reply: <ws>:<uuid>`; it skips rows where the sent text equals the AI draft) and "Dulcy approved sender v4" (Save Learning Candidate). Reader: both intakes, "Get Approved Reply Examples", filtered to `Review Status='Approved'` (up to 10), so the drafter gets nothing.

Three redacted examples (AI Draft vs what the human actually sent):
1. *Scroll Stop, Interested ("open, share more details").* AI: 2 sentences of generic service description plus "which product would you like to promote?". Human: a longer, tailored reply naming the client's creator-partnership approach, the first step (priorities, audience, goal), and an offer to put a plan together.
2. *Twenty West, prospect replied with only a phone number.* AI: "Got it — [number] is the ideal number to reach you on." (no next step). Human: asks to set a 10-15 minute call at that number and asks for a day and time.
3. *Twenty West, prospect accepted 9:30 and asked for a call.* AI: a long numbered content-concept list (did not answer the scheduling question). Human: three specific available times to reschedule.
The pattern: the AI answered the wrong thing or gave no booking step; the humans always moved to a call.

### Dulcy Reply Agent Events (tblHznksXyc3DZAUu)
Fields: Event Key, Email Record ID, Workspace Record ID, Reply ID, Event Type (Received, Classified, Drafted, Scheduled, Approved, Sent, Skipped, Suppressed, Failed, State Changed), Intent, State, Actor (EmailBison, AI, Human, Scheduler, System), Occurred At, Summary, Payload JSON, Error. **14,143 rows.** Active today: AI Suppressed/Scheduled/State Changed events every few minutes across workspaces 72, 66, 80 and 42 (latest 2026-11-24 20:35 UTC). Many rows in the sample have only Occurred At filled in the fields read (Event Type blank); why is UNKNOWN.

## 4. n8n reply workflows (all `active: true` in live n8n)
| Workflow (ID) | Trigger | Scope | Drafts? | Sends? | Writes in Airtable |
|---|---|---|---|---|---|
| [Dulcy Reply Agent] Dulcy approval-only intake v4 (DulcyReplyClientPilotV4) | EmailBison webhook + every 1 min | Dulcy (ws 2) | **Yes** (OpenAI) | No | Emails: State, Intent, Confidence, **Draft**, Policy Decision, Due At, Event ID, Last Inbound Event ID, Sender Email ID, Workspace Record ID, Human Action, Last Error, Updated At, Follow-up Type, Reply Ownership; Events row; reads Settings, Onboarding, Documents, Campaigns, Reply Learning |
| [Dulcy Reply Agent] Client draft-only intake (DulcyClientDraftOnlyV1) | every 1 min | 7 clients (68, 78, 72, 77, 42, 66, 80) | **Yes** (OpenAI), `mode: draft_only`, never Approved | No | Same fields as above. Picks one record per run: no draft, not Needs Approval, Custom Reply blank, Human Action None/blank (or Resume), new inbound event |
| [Dulcy Reply Agent] Dulcy approved sender v4 (DulcyReplyPilotSenderV4) | every 1 min | **Dulcy only** (Workspace Record ID = recJx0WwHsdsvcVIN) | No | **Yes**: picks State Needs Approval/Approved **and** Human Action = Approve Draft (sends Draft) or Send Edited Reply (sends Custom Reply), rechecks thread, settings and calendar times | State → Sent (or Scheduled for next follow-up), Human Action → None, Draft cleared, Sent At, Due At, Follow-up Type, Last Email Sent; Events row; **Reply Learning candidate** |
| [Dulcy Reply Agent] Dulcy fresh follow-up scheduler v4 (DulcyPilotSchedulerV4) | every 10 min | enabled settings | **Yes** (calls sub-workflow DulcyPilotFollowupV4) | No | Draft/State on due follow-ups |
| [Dulcy Reply Agent] Reconcile delivery - NEVER SEND (DulcyReplyRecoveryV4) | every 2 min | sender ledger | No | No | Applies confirmed delivery (State/Sent At) after uncertain sends |
| Manual Emails Sent (Including Dulcy Reply Agent) (ewcunE4ck0jS6IZh) | EmailBison manual-send webhook | all | No | No | Last Email Sent, history (via sub-workflow), **Reply Learning candidate**, and arms the next follow-up (sub-workflow DulcyReplyFollowupArmV1) |
| [INBOX MANAGER] Receive Replies from EmailBison (NwlemmcwCZLCXAmt) | EmailBison webhook | all | No (OpenAI classifies Lead Status) | No (Slack, Gmail, Handwrytten, Make for TW VA) | Creates/updates Emails records, Lead Status, Reply Explanation, Last Email Sent; **updated 2026-11-23, after the snapshot** |
| [Dulcy Reply Agent] 05 Daily KPI Snapshot (WEm4DeunC2KROAmlmJz53) | daily 1:15 AM | all | No | No | Reply Analytics Daily |
| [Dulcy Reply Agent] Calendar connections and status (DulcyCalendarConnectionsV1) | every 5 min | settings | No | No | Settings: Calendar Connection Result/Snapshot JSON, status (see section 7) |
| [Dulcy Reply Agent] 04 Provision Client (X8o_bx_MBS0h0mmrGKas-) | webhook | one workspace | No | No | Creates the settings row; registers an EmailBison `lead_replied` webhook pointing at the intake |
| [INBOX MANAGER] Bison Untracked Replies, Manually Mark Interested (EmailBison/HeyReach), Receive Replies from HeyReach, Receive Replies + Handwrytten | webhooks | all | No | No | Emails records, Slack |

Answers to the specific questions:
- **Who writes Draft:** the two intakes (+ the follow-up scheduler's sub-workflow). The sender clears it after sending.
- **Who flips State:** the intakes (Needs Approval / Paused / Suppressed / Skipped / Scheduled), the sender (Sent / Scheduled) and Reconcile. A blank draft is auto-flipped to Paused, which is why there are 1,764 Paused rows.
- **Who sends for non-Dulcy workspaces:** only humans, through the "Send Email (SL and EB)" button (Custom Reply) or directly in EmailBison. No AI-draft sender covers them.
- **Learning loop:** written by Manual Emails Sent and sender v4; read only where Review Status = Approved; nobody approves; **closed loop = no.**
- The sub-workflows DulcyPilotFollowupV4, DulcyReplyFollowupArmV1, DulcyReplySourceEvidenceV1 and DulcyCanonicalHistoryAdmissionV2 are not visible through the n8n MCP ("Workflow not found") and not in the 2026-11-17 index: **UNKNOWN**.

## 5. Proposed rewire (minimal; every item needs Alex's OK)

### 5a. What engine Echo writes (per drafted Emails record, same fields the interface already uses)
| Field | Value |
|---|---|
| Dulcy Reply Agent Draft (fldiokFlOaUEEs2qX) | `d.draft` (for ask_alex: the draft with its [GAP: …] marker) |
| Dulcy Reply Agent State (fldOfNaPJfpJLcInm) | `Needs Approval` for reply and ask_alex; `Skipped` for skip |
| Dulcy Reply Agent Intent (fldSgiv4CLnRBEJGc) | **New output needed**: add `intent` (one of the 13 choices) to Echo's DraftSchema. Needed because the n8n classifier stops when the intakes are off, and the CC/BCC script uses Intent. |
| Dulcy Reply Agent Event ID + Last Inbound Event ID (fldIe5tgtL4OVeJAj, fldy284s0aaXCZaa7) | `bison:<Clients Table rec id>:<reply_message_id>` (same convention, so the CC/BCC rules pick the current intent) |
| Dulcy Reply Agent Workspace Record ID (fldaSgBchAb4KiIZS) | Clients Table rec id |
| Dulcy Reply Agent Human Action (fldvdJBtL4ez5lbjN) | `None` |
| Dulcy Reply Agent Policy Decision (fldkfrqE1Xng2mftd) | JSON `{"agent":"sean","action":…,"reason":…,"they_said":…,"question_for_alex":…,"latestReplyAt":…,"calendarEvidence":{…offered slots…}}` |
| Dulcy Reply Agent Updated At (fldTn2Eth51XolDMg) | now |
| **New field "Echo Reason"** (long text) | `d.reason` (do not reuse Reply Explanation: the inbound flow and the Make button write it) |
| **New field "Echo Needs Your Input"** (long text) | `d.question_for_alex` (empty unless ask_alex) |
| Events table row | Event Type Drafted (or Skipped), Actor AI, Intent, State, Summary = reason |

### 5b. Approval → engine send, for all workspaces
- In the interface, the approver sets **Human Action = Approve Draft**, or edits and uses **Send Edited Reply** with Custom Reply. This is the same contract sender v4 uses today.
- New engine poller (every minute), replacing sender v4 and covering all 8 workspaces. Pick: `State='Needs Approval' AND Human Action IN (Approve Draft, Send Edited Reply) AND NOT DNC AND NOT Client Handling AND Reply Ownership!='Handoff'`, then run the existing `decision.send_reply` checks (prospect wrote again → no send; Last Email Sent By Dulcy → no send).
- **Send fixes needed in the engine** to match the Airtable script: `reply_all: false`; `to_emails` = the one prospect address taken from the thread; `sender_email_id` = email_stats_id; **CC/BCC from the workspace's CC BCC Settings JSON** (MJJ and Human Marketing copy the client today); confirm delivery before writing anything.
- After the send, write: State `Sent`, Sent At, Human Action `None`, Draft cleared, Last Email Sent `Last Email Sent By Dulcy`, Pipeline Stage `In Conversation` if it was New Interested. Add an Events row (Sent, Actor Human). Add a **Reply Learning row with AI Draft = Echo's draft and Approved Reply = the sent text, Review Status `Approved` when sent unchanged** (or always Approved, since a human approved it). Echo should read the last approved examples for the same workspace. That closes the loop.
- **Conflict to settle with Alex:** RULES.md 2026-11-24 says approval happens in Slack (Echo posts Decisions with ✅). Proposal: keep one record of truth. The Slack ✅ sets Human Action = Approve Draft on the Emails row, and only the new poller sends. That way Slack and the Airtable interface can never both send.

### 5c. n8n to switch off (in this order, each needs Alex's OK)
1. `DulcyClientDraftOnlyV1` and `DulcyReplyClientPilotV4`: stops double drafting, and stops the State flips to Paused/Suppressed.
2. `DulcyPilotSchedulerV4`: stops n8n follow-up drafting. Also disable the node "Schedule next approval-required follow-up" inside `ewcunE4ck0jS6IZh`; keep the rest of that workflow (history + learning).
3. `DulcyReplyPilotSenderV4` (and `DulcyReplyRecoveryV4` once its ledger is empty), switched off at the moment the engine poller goes live, never both at once. While sender v4 is on, any Dulcy row where someone sets Approve Draft is sent by n8n.
4. `X8o_bx_MBS0h0mmrGKas-` 04 Provision Client: stop using it (it registers webhooks to the old intake).
Keep on: Receive Replies from EmailBison, Manual Emails Sent (minus the follow-up node), 05 KPI, Calendar connections, Bison Untracked, HeyReach flows.
Undecided: the 250 rows already in Needs Approval with old OpenAI drafts. Option: clear them and let Echo redraft the ones still waiting. Alex to decide.

### 5d. Interface tweaks (Reply Queue page)
- Add: Human Action (Approve Draft / Send Edited Reply / Skip), Custom Reply (for edits), **Echo Reason**, **Echo Needs Your Input**, Workspace / client name, Conversation History, Last Error, Sent At.
- Filter: State = Needs Approval, not Client Handling, sorted by Latest Reply Time. Second tab "Needs your input" = Echo Needs Your Input not empty.
- Reply Learning page: default view Review Status = Candidate with a quick Approved/Rejected toggle.
- The custom element's Responses/Routing settings that only the OpenAI flow used (tone, length, routing groups, follow-up plan) do nothing for Echo unless Echo reads them. Decide which ones Echo honours: CC/BCC, Calendar Link, disableTimes/disableLinks, office hours.

## 6. Left / UNKNOWN
- Which page control sets Human Action today (buttons are not exposed by the API). Human Action is not on Reply Queue.
- Sub-workflows listed in section 4 (not readable).
- Whether `NwlemmcwCZLCXAmt`'s 2026-11-23 change touched any Reply Agent fields (not diffed).
- Exact count of Reply Learning rows with an AI Draft.
- Why many Events rows have a blank Event Type.

## 7. Calendar connections

### How it works today (Google only)
1. **Request.** In the Dulcy Reply Agent custom element, Calendar tab, someone enters the calendar owner's email and clicks **"Create Google connection link"**. This writes **Calendar Connection Request JSON** (fldVSFHdZqjipZdpW) on the workspace's settings row: `{requestId, provider:"google", email, requestedAt}`.
2. **Link.** n8n `DulcyCalendarConnectionsV1` (every 5 min) picks requests under 24 h old with `provider === 'google'` (hard-coded). It asks a **private calendar service on the n8n server** (internal host `dulcy-calendar`, port 8789, no n8n credential on the node) to create a scoped invitation, then saves **Calendar Connection Result JSON** (fldKKuVzaRvoAFv7e): `{requestId, status Ready / Needs Attention, url, expiresAt}`. The url is a **one-time ticket link on the n8n domain that expires within 24 h**. Error text says Google is limited to enabled test accounts, so the Google OAuth app is probably still in "testing".
3. **Sending the link.** The interface shows the link ("share only with this calendar owner"). **No automated email was found**: someone copies the link and emails it by hand. Any automated send is UNKNOWN.
4. **Status.** The same workflow asks the service for each workspace's status and writes **Calendar Connection Snapshot JSON** (fldja89IBFvNhZVaN: status, account email, checkedAt). The interface shows it. The settings fields **Calendar Provider** (fldUajoXDZicmMJRt) and **Calendar Connection Status** (fldwRUzLewRqsUAti) hold the saved provider/status, and **Calendar Settings JSON** (fldpfjITDZ7QlfKDw) holds preferences (disableTimes, disableLinks, format, duration, buffer, bookingMode "Human approval required").
5. **Tokens.** Not in Airtable, and not in n8n credentials on these nodes. They live inside the calendar service (its own storage). Its source and storage are **not in this repo: UNKNOWN**; token values were not looked for.
6. **Live status per workspace:** Dulcy = Google Calendar / Connected. The other 7 = Not Connected. Saved booking links (no live availability): Lead Flo (GoHighLevel), Human Marketing (HubSpot), Scroll Stop (Google appointment page), Twenty West Internal (Calendly), Dulcy (Calendly).

### How the drafters read availability
- n8n intakes: node "Read Verified Calendar" POSTs `{workspace, start: now+10 min, end: now+6 days}` to the calendar service. The reply is Calendly-shaped (`connection{status,eventType}`, `eventType`, `collection[{start_time,status,invitees_remaining}]`, `fetchedAt`). Offered slots are stored in Policy Decision `calendarEvidence`. Sender v4 node "Recheck Offered Calendar Times" re-reads the slots and refuses to send if an offered time is gone or the data is older than 2 min.
- **Engine Echo:** reads Calendly directly (CALENDLY_TOKEN, event "outreach-consultation") for Dulcy workspaces 2 and 41 only. Clients get no times: Echo uses the booking link from the client file or asks about their week. Note the mismatch: Dulcy's settings say Google Calendar connected with links disabled, but the engine uses the Calendly link and Calendly times.

### Proposal: add Calendly, GoHighLevel and HubSpot to the same link flow
- **Keep one flow.** Widen Request JSON `provider` to `google | calendly | ghl | hubspot`. Add a provider picker next to the button (label "Create connection link"). In `DulcyCalendarConnectionsV1`, change the `provider === 'google'` check to that allowed list (in Select Scoped Records and the other code nodes that repeat it).
- **Calendar service:** add one OAuth app per provider. Tokens stay in the service, never in Airtable. Every provider returns the **same response shape** the drafters already use (`collection[start_time,status,invitees_remaining]`, `eventType`, `connection.status`), so nothing downstream changes. Provider APIs to verify before building (not checked here): Calendly OAuth plus the event-type available-times API; GoHighLevel/LeadConnector marketplace OAuth plus calendar free-slots; HubSpot OAuth plus the meetings-scheduler availability for a meeting link. GHL may need a private-integration token per location instead of OAuth. Alex decides.
- **Snapshot:** add `provider` and `eventType` to Snapshot JSON; set Calendar Provider to Calendly / Other (GHL) / Other (HubSpot), or add the choices "GoHighLevel" and "HubSpot" (schema change).
- **Echo:** replace the direct Calendly call with one helper, `availability(workspaceRecordId, start, end)`, that calls the calendar service for any workspace whose Calendar Connection Status = Connected. Pick two slots inside office hours, write them into Policy Decision `calendarEvidence`, and have the engine sender re-check them right before sending (same rule as sender v4). If not connected: use the saved Calendar Link when disableLinks is false; otherwise ask about their week.
- **Blocker to check:** the service is on an internal host of the n8n server. Whether the engine server can reach it is UNKNOWN. It may need an authenticated route.

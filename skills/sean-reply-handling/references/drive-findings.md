# Sean: Drive research on reply handling and Josh's inbox process

Read-only research, 2026-11-17. No Drive file was edited, shared, moved or trashed.
Everything below is paraphrased. Prospect names, emails and phone numbers are left out. Client staff and vendor staff appear by role, not by name.
Sources were not checked against current live settings. Treat every point as history until Alex confirms it.

**Result: partial.** No Drive document describes Josh's own day-to-day inbox routine. Several documents name Josh and show parts of his role. Four generic documents describe the inbox-manager (VA) role Josh fills: the Inbox Management SOP, the Reply Agent SOP, the IM Agreement and the Exec Assistant SOP.

---

## 1. Josh's inbox process

### 1a. What the sources say about Josh by name

| # | Point | Source (title, date) |
|---|---|---|
| J1 | Josh is "Dulcy's operator" for RevReply (the AI inbox manager in use in mid-2026). RevReply was to train Josh on advanced features, conditional follow-ups and a knowledge-base workaround (put key facts in the "Product & Services" and "Instructions" fields because the KB was not pulled reliably). The agreed working method was human-in-the-loop: the AI drafts, a human approves and sends the best drafts and gives thumbs-up to teach it. After that, the first 3–5 touches could be automated, with a human kept on complex threads. | [Jun 5, 2026 meeting notes, Alex + RevReply](https://docs.google.com/document/d/1arQVaeLlqqJHjjRQLLaHQMw51xAvoRxBPj1sn2IvqwY/edit), 2026-06-05. Summary also in [Dulcy <> RevReply Realignment](https://docs.google.com/document/d/17KXrK-2fX099PQKj1Ra-Bw-hoi5_WnIlfZ8F3IL3768/edit), 2026-06-17 (local copy `sops/drive-export/121-Dulcy-RevReply-Realignment.md`) |
| J2 | Josh's action items in June 2026 were to set up the call between Dulcy and RevReply about poor AI reply performance and to help RevReply staff schedule their technical review. Alex was to create one shared Google Doc for all updates because Slack threads were losing information. | Dulcy <> RevReply Realignment, 2026-06-17 |
| J3 | The way replies were actually handled for one client in May 2026: the AI replied, inbox managers replied, **Josh reviewed**, and client staff sometimes stepped in. The document's diagnosis was that no single person owned each interested lead. | [Dulcy <> Twenty West Meeting 5-26/27-26](https://docs.google.com/document/d/15H_KbOV0QK2D3Mnp-nSipyyw5AVkQeR88jz5PdDzMVs/edit), 2026-05-27 |
| J4 | That May 2026 recovery plan proposed these changes. It is a draft action plan; nothing in the sources shows it was adopted. (a) Three layers: AI, inbox manager, closer/booking. (b) Each lead has one accountable human owner. (c) Escalate to a human, with no autopilot, when the lead asks about price, replies twice, says yes, asks for info, names a current provider, asks "how does this work", or asks for a call ("call me", "tomorrow works", "let's talk"). (d) Treat a contractor's "call me" as qualified booking intent and hand it straight to the client's sales person. (e) Response targets: HOT under 30 minutes, WARM under 2 hours, follow-up every 2–3 days (elsewhere at least every 48 hours), and no interested lead left untouched for more than 72 hours. (f) Every day, review stalled leads, HOT leads, missed replies, booking blockers and objection trends. | Dulcy <> Twenty West Meeting 5-26/27-26, 2026-05-27 |
| J5 | Josh compiled a "call request" sheet for a client. Each row is a lead who asked to be called, with a link to the conversation in Dulcy's EmailBison inbox (send.dulcy.io). This was a handoff so the client could phone those leads. Only the column headers were read; rows hold prospect data. | "Twenty West Call Request" (Sheet, owner Josh), 2026-06-17, id `17mUKRe7by-cknZFWu06Gk7xUtqaPIDM1R_QMRGcRlTE` |
| J6 | Josh built "Prev Interested Leads" exports per client: Dulcy, Twenty West (client and internal), TargetonStar, Shop Innovator and Juiced Digital. Each export lists leads who were previously interested, with campaign counts, sends, replies and bounces. They were used to re-engage those leads with "Direct Offer" campaigns. Only the headers were read. | e.g. "[Dulcy] Prev Interested Leads - Campaigns (Direct Offer)" (Sheet, owner Josh), 2026-06-11, id `1u29kSG4-5Yziutfxr7NtgXyWc6fH2bI3l2Bd_Rh6BWY`; siblings dated 2026-06-11/12 |
| J7 | Josh builds the **post-booking emails** for clients: call-booked confirmations and the reminder and nurture sequence, written as HTML (one variant uses Close-style merge fields). One client's feedback on Josh's draft set the structure: (1) confirmation: confirm the invite and fill out the needs assessment; (2) 24-hour reminder: same two steps; (3) 4-hour reminder: same; (4) 15-minute reminder: drop the assessment and add the 5-minute prep video; (5) meeting time: link only. Each email has one call to action. The needs assessment goes out at least 24 hours before the call. | "Here's [client]'s feedback from the call" (owner Josh), 2026-04-22, id `1GceTDxnW-PZTRsBD1KV6wnQ0pNn7XJ5sD9Qkh7I7Ow0`. HTML drafts: "Twenty West" (2026-05-07, `1-cAfkdAKvydo1Y9DM1b4ljTc_j79ZzlurlnZmlMWC8w`; tabs: call booked, form-submitted thank-you, 1st follow-up, 2nd follow-up for non-bookers, final goodbye), "email-1-confirmation" (2026-04-23), "Juiced Digital" (2026-04-21), "SHOPINNOVATOR" (2026-04-24), "5MS HTML" (2026-03-03), "1SEO HTML" (2026-03-16). All owned by Josh. Only structure was read for the HTML drafts. |
| J8 | Josh gets client CRM access (GoHighLevel) together with Alex. They build Dulcy's workflows in a separate folder and do not touch the client's own automations. The next onboarding step covers what happens after a booking: pre-call emails, SMS, reminder flow, HTML email improvements and pre-call videos. | [Lead Flo Marketing <> Dulcy - Onboarding Call #1](https://docs.google.com/document/d/1Ld_O4wRM7-TTfepjFX9Ir4HgLd-7Fm-SOcqrOXFIxdo/edit), 2026-07-21 |
| J9 | Josh's dulcy.io account is invited as an editor to new client tool workspaces by the post-call onboarding automation. This comes from the repo, not Drive. | `automations/n8n-live-2026-11-17/workflows/2-2-postcall-onboarding-pt1--EEMXAIGSGDZz5M9P0mo9n.json` ("invite josh" node); Make twin `automations/make-2026-11-17/scenarios/2-2-postcall-onboarding-pt1--2503711.json` |
| J10 | Josh owns a "Bounced Email" sheet. It is operational bounce data; its rows were not read. | "Bounced Email" (Sheet, owner Josh), 2026-04-22, `1O_pZ0yNNT8yZNr5ZE_H1MICu3KSjZFooM9vlhj8-v3c` |

### 1b. The inbox-manager role as documented (generic; these do not name Josh)

**Current operator steps.** These come from the newest source, the [Dulcy Reply Agent & Inbox Manager Operating SOP](https://docs.google.com/document/d/1RCCbXeUQJRXP8h0nsHnnqbGZNwwfIBKNTEAu67R7A-Q/edit), 2026-10-07:
- **Setup check:** in Airtable Inbox Manager → Dulcy Reply Agent, select the Dulcy workspace. Reply Agent should be On, with default mode and out-of-office mode both on Human in the Loop. Only Dulcy is in the pilot; client workspaces stay off; never switch to Autopilot. For Dulcy, reply handoff is Disabled, meaning Dulcy handles its own replies.
- **Triage a reply:**
  1. Open New Replies.
  2. Confirm the campaign, the lead email and the inbox email.
  3. Read the latest reply and the conversation history.
  4. If anything is unclear, open the EmailBison Master Inbox.
  5. Check the draft, the review status, any issue flagged and the next AI follow-up.
  New Dulcy replies are checked about once a minute. Older backlog is not processed automatically.
- **Approve:** first check that the draft answers the actual question, uses supported facts, sounds conversational, has the right asset or link, ends with a useful next-step question and does not duplicate a message already sent. Then use one of three sending paths: Approve Draft, Send Edited Reply (via Custom Reply), or a manual send. Never approve and also send manually. If a message shows Outbox or Sending, reconcile it before any retry. Add lasting business facts in Company & Agent, not as one-off feedback.
- **Statuses:** Needs Approval, Scheduled, Sending, Sent, Skipped, Suppressed, Failed.
- **Outcome tags:**
  - Interested
  - Meeting Requested (a request, not a booking)
  - Won (only once the meeting is actually booked; this stops sales follow-ups)
  - Lost
  - OOO (check the return date; an alternate contact is not permission to pitch that person)
  - Client Handling (the client owns the thread; the agent stops)
  - Unsubscribe (never override)

  Questions that arrive after booking are answered in the Won thread without reopening sales follow-ups.
- **Daily check, in order:**
  1. Meeting Requested
  2. Clear actionable New Replies
  3. Positive Replies and AI Reply Review
  4. Follow Ups and due dates
  5. Failures and messages stuck in Sending
  6. Booked conversations with new messages

  Follow-up drafts still need approval. The Off switch pauses the agent but cannot recall a message already submitted.
- **Settings recorded on 2026-10-07:** tone Warm and Brief; office hours 9:30 a.m.–5 p.m. ET; follow-up delays of 1, 2 and 3 days after the previous confirmed send; asset sharing off; suggested times and auto-booking off.

**Older VA rules and booking steps.** These come from the [INBOX MANAGEMENT SOP](https://docs.google.com/document/d/1mHkrxWFYlqWLrLMYILqJaC-WfENRsdw6yGVjh0TrzNU/edit), 2025-03-17 (copy `13pvXKcWgDtaVBvw2sO_84xcAorZYjN3JIoGAzgX-PpA`, 2025-11-05), and the [Executive Assistant (VA) SOP](https://docs.google.com/document/d/1K0ubwSPthzYS8vzgsqlId-FTrje-wNpJSFGrSBQrgx0/edit), 2025-01-27, whose daily task #1 is Inbox Managing:
- **Response time:** reply within 5–10 minutes. Elsewhere in the same SOP: within 5 minutes.
- **Notification:** a Slack automation posts each positive reply. Keep Slack notifications on.
- **Six Airtable queues:** New Replies, Follow Ups, Positive Replies, Meeting Requested, Won, Lost. After replying, tag the lead Won, Lost, Meeting Request or OOO. A yellow flag appears after 3 days without a lead response, meaning follow up now.
- **Sending tool:** two send buttons existed, Smartlead and EmailBison. The VA had to click the one matching the lead's source tool.
- **Escalation:** for long or intricate replies, ping the team in Slack for help. If no phone number can be found for a booking, ping Alex.
- **Booking and logging:**
  1. Move the lead to Meeting Request.
  2. Propose times.
  3. When the lead agrees, the VA books the slot personally in the company Calendly (only the VA fills in that form).
  4. Find the prospect's mobile number in Apollo, or in the email signature checked with a phone validator, and add it to the booking.
  5. Move the lead to Won.

  The VA was compensated per booked call.
- **Contract terms:** [Inbox Manager (IM) Agreement](https://docs.google.com/document/d/1DGKoSgAYbO6nEa8LtM-TEvOK6FYVuey1Y7zE7Awc-Bs/edit), 2025-07-11. Template contractor terms for a part-time inbox manager VA: answer all incoming emails within 5–10 minutes during assigned hours; turn cold leads into warm leads and help book meetings; follow written and oral instructions; hourly pay with quarterly reviews; 90-day probation; confidentiality and non-solicit. The employer field still reads "Hype Pilot Marketing"; the signature block reads Dulcy.io.

**Calendar, CRM and logging after a booking.** From the [CRM/CALENDAR MANAGEMENT SOP](https://docs.google.com/document/d/1aQOOkWxMcoM_DBetafLBkP2NJFiQ0q3e84Z_LJJ1MMw/edit), 2025-11-05:
- Book prospects through the inbox manager and Calendly.
- Alex's meeting hours are 9–5 ET, extendable to 6 ET for Australian prospects. Preferred slots are 10–4 ET. Keep 10–15 minutes between meetings and treat the noon slot as lunch where possible.
- For every meeting booked for Dulcy, research the company (a GPT prompt is provided) and add a note on the lead in Close.
- Never move pipeline stages, delete leads, or move an appointment without the lead's confirmation.
- Templates cover the meeting reminder, rescheduling, and a one-week post-meeting follow-up.

**Client agreement scope.** From [Client <> Dulcy | Growth Partnership PPL](https://docs.google.com/document/d/1WTeo9lDk7MVWVUC22DfJgt10JQU_8FZqhk_bJF6tgNk/edit), 2026-11-16. Under the pay-per-qualified-call agreement, Dulcy's job ends once a qualified call is scheduled. Reminders, follow-ups and the sales call itself are the client's responsibility. A booked call from a client-approved list is billable unless disputed with a call recording. Invoices go out weekly on Fridays.

### 1c. Reporting and EOD
- **No inbox-manager or Josh EOD report was found.**
- The EOD documents that do exist are generic sales-rep training: the [End Of Day Processes](https://docs.google.com/document/d/10CILijmxeWIdNt-UNdEwXxs8goeAe0Wb-zUmgLZ9CrA/edit), [Sales Version of 0/0/0 EOD Routine](https://docs.google.com/document/d/1CDt15XFN_Y77zNbIK9_t4nTNfQMnrC-yZCJmBjW1SMA/edit) and [Sales Management EOD.pdf](https://drive.google.com/file/d/1BNAcb209lDuSuM1siq-Gsl_yy8PIXWYh/view) (all 2025-12-15), and the [Daily Reporting SOP](https://docs.google.com/document/d/1Eb1NCzj3EwsCxAEzeJJscNiDYDq90cVV2w7_0foJLzA/edit) (2025-11-05).
- What they describe: batch admin at the end of the day, finish hot-list follow-ups, update the CRM, confirm tomorrow's appointments, and post the EOD in a Slack "EODs" channel (or WhatsApp for the daily report) with calls, bookings and closes. These could be adapted for Josh but are not his documented process.

### 1d. Still UNKNOWN (Alex or ChatGPT to provide)
- Josh's actual daily routine, working hours and time zone.
- Which reply types Josh may send without Alex, and which must go to Alex.
- How Josh escalates to Alex today (Slack channel? DM?).
- Current response-time targets.
- How meetings are logged now: Airtable Won, Close, Calendly, the client's CRM, or the client booking themselves.
- Whether Josh sends an EOD report, and in what format.
- Whether Josh still uses RevReply or only the in-house Dulcy Reply Agent.
- Which clients Josh handles replies for, and which clients handle their own (`clients/_TEMPLATE.md` already has this field).
- Whether the May 2026 recovery plan's response targets and escalation rules were adopted.

### 1e. Search log (Josh-specific)
Drive queries run:
- fullText "Josh" + inbox/replies/reply
- fullText "Joshua" or Josh's dulcy.io address
- Docs containing Josh/Joshua
- titles containing EOD, End of Day, Daily Report, Inbox, "VA ", Unibox, Josh
- titles containing Replying, Replies, Follow Up Email, Inbox Manager, Reply
- 2026-modified docs with "inbox manager", "human in the loop", "Reply Agent", "positive replies" or "meeting booked"
- folder listings: "Inbox Management" (`1YrWNWbNdkUpLwd2E-qKSngdkXLpQXjlO`), the course folder holding "Replying To Leads…" (`1wEV5O9xz1IQstlHXhmvtJJPI2Q-sAbJh`), the BEST REPLIES folder

The repo was also grepped for josh/joshua across `sops/`, `legacy/`, `automations/`, `clients/` and `company/`. Unibox and Smartlead-inbox searches found nothing Josh-specific.

---

## 2. Reply SOP methods (per reply type)

| Reply type | Method (paraphrased) | Source |
|---|---|---|
| Any positive reply | Speed first. The target in the sources ranges from 5–15 minutes down to under 5. The author reports that an ~8-minute batch booked about 3x more meetings than a batch answered 1–2 hours later (source-reported, not a verified Dulcy metric). Answer the actual question briefly, give one small next step, and make it easy to say yes. Do not aim for a perfect message. | [Responding Fast (With AI or VA Help)](https://docs.google.com/document/d/1wmgaLg9DnFmbDDAoze8qGk5yLugvtCLToUc9WmIx2Do/edit), 2025-12-21 |
| Match awareness | Five levels decide whether to ask for a meeting or send info. At levels 1–2 (confused, or feels the pain but has no plan), give clarity or a video first. At level 3 (problem-aware, lightly solution-aware), move toward a meeting while adding context. At level 4 (fully aware, no urgency), add persuasion, timing and follow-up. At level 5 ("send times", "what's pricing"), go straight to a call. Match the prospect's tone. | Responding Fast |
| Interested, ready to meet | Frame the call as a short working session for something tailored to them ("I'll start putting together X; I just need 10–15 minutes to get it right; I'll build it live"). Propose two specific days. Avoid "hop on a call", "just checking in" and "hope you're well". About 95% of messages should end with a question. | [Booking the Meeting Without Sounding Salesy](https://docs.google.com/document/d/1hhuS9HzuZJ1zF8hw7ezuDEMs6E57dBchF0h_Sf-1O5U/edit), 2025-12-21; INBOX MANAGEMENT SOP |
| Interested, went quiet | Make each follow-up easier to say yes to: (1) a confident time proposal; (2) a reserved slot or calendar link, referring back to their interest; (3) step back and offer info or a video; (4) a polite "still want to explore this?" that forces a decision; (5) stop, mark them positive-not-booked, and recycle later. Cadence is about every 3 days, roughly 5 times. Interested leads can take months to convert. | Booking Without Sounding Salesy; Responding Fast; Email Follow-Up Templates (2026-11-03) |
| Price question | The older rule was never to give price by email: deflect with "custom", "don't want to overquote" and a short call. The newer guidance is to answer direct questions such as price simply and like a human, then move forward. A Closers-style example acknowledges that price depends on scope, explains the range of client sizes, and offers a 5-minute call with two times. Price ranges always need client approval. | INBOX MANAGEMENT SOP (2025-03-17); RevReply Realignment (2026-06-17); [Replying To Leads To Set Up Calls STA 3.0](https://drive.google.com/file/d/16C3hZ2xXc-NRIphf4Q1q1AqxozZ-nl-A/view), 2025-12-13 |
| "What's the catch / why free" | Answer it in the thread: the free item is a risk-free way to show how the team works. If many prospects ask, add a P.S. to the campaign copy explaining why it is free. | [Why You Should Keep an Eye on ALL Replies](https://docs.google.com/document/d/1QsZypZjuzFTi_HomzIQ3DngmSwCotnq_vZc9ZLNyclk/edit), 2025-12-21; Cold Email Objections SOP |
| Not now / later | Ask when to check back, or confirm a specific follow-up date. Optionally offer info in the meantime, or book a slot a few weeks out. | INBOX MANAGEMENT SOP |
| Call me / phone-first (contractors) | Do not answer with another calendar CTA. Treat it as booking intent, assign a human straight away, and offer a phone-first option ("what's the best number?"). | Twenty West Meeting 5-26/27-26 |
| Intricate or long reply | Escalate to the team in Slack. Later practice treats anything nuanced, price-related or showing buying intent as human-only. | INBOX MANAGEMENT SOP; Twenty West Meeting |
| Not interested | Suppress, and stop unless there is a real new reason later. The RevReply setup optionally asks one feedback question in the no-thanks reply. Under current rules, an opt-out gets no sales follow-up. | [Filtering Positive Replies and Auto-Tagging Responses](https://docs.google.com/document/d/1g38KeuyF5238vnasmapo6Mk1QLfcnHcTp105zxOqbeo/edit), 2025-12-21; [How to Set Up an Inbox Manager for a Client](https://docs.google.com/document/d/18W05eyWLtCpzmlKKoJRfdNzcQREXaRw1_Eg0NUrkf0Q/edit), 2025-12-01 |
| Out of office | Extract the return date, any alternate contact, and any "no longer with company" signal. Schedule the follow-up for the return date, or the next business day if that falls on a weekend, and reference the first email. | Filtering Positive Replies; [Keeping Your Inboxes Organized and Scalable](https://docs.google.com/document/d/1r_oymNaqDHP3awTcj0ZWuBs5EJxRCxgDBjegif2Id00/edit), 2025-12-21; Reply Agent SOP |
| Not sure / mixed | This is a real queue. The Slack ping goes to human review. Never drop these silently. | Filtering Positive Replies; Keeping Inboxes Organized |
| Untracked reply (forwarded, new thread) | Route all inbound mail, including replies outside any campaign thread, through the same classifier and records. Slack flags them as "positive reply, but untracked". | Keeping Inboxes Organized |
| Sentiment change | If an existing lead replies again, re-check sentiment and upgrade the record (for example, not interested → interested). | Keeping Inboxes Organized |
| Wrong person / referral | Treat it as interested when it directly answers our question. A pattern of these replies signals a title-targeting problem; feed it back to Scout. | Filtering Positive Replies; Why Keep an Eye on ALL Replies |
| Negative patterns | "Wrong industry" points to a list problem; repeated bare "not interested" points to the offer, the copy or targeting that is too broad; high "stop spamming" points to tone, deliverability or volume. Pass these to Atlas and Scout. | Why Keep an Eye on ALL Replies |
| Multichannel boost | After a positive reply, connect on LinkedIn and optionally send a light note saying you saw their email reply. | Responding Fast; Marketing Cartel onboarding (cold email → positive reply → LinkedIn) |
| Classifier | A four-bucket prompt (Interested, Not Interested, Out Of Office, Not Sure) that outputs only the label and defaults to Not Sure when in doubt. Questions such as "what's the catch?" count as Interested. | Filtering Positive Replies; [Old n8n email bison reply prompt](https://docs.google.com/document/d/17hb7KfpZ-w99r02D6_HpNt7Ay35X4_-C64MGrl6_GfI/edit), 2026-06-02 |
| AI replier training | Start in human-in-the-loop mode: AI drafts, a human edits and approves, thumbs up or down, reclassify mistakes. After roughly 20–50 approved replies, automate one category at a time in this order: delegated, not interested, follow-ups, interested, meeting requests. Replies should be short (25–75 words). No links or images in first replies. Load templates for interested, not interested, delegated, budget, "send info", "your proposal?" and "how did you get my email?". | How to Set Up an Inbox Manager for a Client; Responding Fast. **Current rule overrides this: Dulcy pilot only, no Autopilot.** |
| Booking sources (Closers model) | Bookings come from four sources: a direct booking from the VSL in the first email (~30%), an email back-and-forth answered with a short-call CTA (~25%), a requested call or stated interest answered with a triage-call CTA (~25%), and triage of weak applications (~20%). These are course figures, not Dulcy data. | Replying To Leads To Set Up Calls STA 3.0 (pdf + [docx](https://drive.google.com/file/d/1A_bmNN-mQd4LJEAPJ-WuZMZb0s1WpMoX/view)), 2025-12-13 |
| Speed and routing | Sync the sender, CRM and Slack. Use separate Slack channels for "Cold Email Replies" and "Cold Email Clicks". | [Cold Email Tech, Set Up & Replies - Overview.pdf](https://drive.google.com/file/d/1qt5OdtrsHKhm_z3p6cSAoYEFKCXCTv8w/view), 2025-12-13 |

---

## 3. Templates and examples (paraphrased, no personal data)

These come from the [Email Follow-Up Templates](https://docs.google.com/document/d/1LrvwK7V37h4Ytv5_FKPYEDLg2zquMqyJTwTfSCp_Y9I/edit) doc for MJJ Brilliant (2026-11-03). It is compiled from Dulcy's Airtable Templates table and is the newest template source found.
- **Usage notes (2026):**
  - Once someone replies positively, continue by hand: answer what they asked and refer to why they were interested.
  - Never paste the campaign's next cold email into a live thread.
  - People who never replied stay in the approved campaign sequence.
  - Interested leads who go quiet get a follow-up about every 3 days. Stop when they reply, opt out or ask for another time.
  - Only use true claims: the call happened, the time is really held, the video exists, the pricing is approved.
- **"I'm interested":** show excitement, explain the offer in one line, give a short value proposition, then propose a specific date and time with time zone.
- **"Let's book a call":** confirm and propose one real time with time zone.
- **"Send me a video":** send a short video explaining the process, then offer 10–15 minutes this week to go deeper. Only if the video exists.
- **"What's the price?":** pricing depends on a few factors. Either describe a general structure (the old Dulcy line about a monthly investment with no minimum commitment is reference only and must be replaced with approved terms), or say it is custom-built and give a general structure. Then offer a 10–15 minute talk, with no pressure.
- **Nine "meeting request ghosted" follow-ups:**
  1. Reference the earlier discussion and propose a time.
  2. "I've reserved a few minutes on {3–4 days out}"; use only if true.
  3. "Don't want to miss the chance"; propose a time.
  4. "Still interested?" plus the benefit tied to their stated need.
  5. "Respecting your time"; does this time work, and shall I send the invite?
  6. Remind them of the benefit; "still holding {time}" only if true.
  7. "Shall I send an invite for {time}?" Ask before placing it on their calendar.
  8. "Couldn't finalize a time; happy to circle back later."
  9. "Were you no longer interested? Let me know either way."

From the INBOX MANAGEMENT SOP (2025-03-17). These were written for the old "free leads" offer and are not reusable without current facts.
- **Interested now:** "I'll start building your list; I just need 10–15 minutes to target it properly; I'll build it live and show you how we do it; tomorrow or {next day}?" Other variants offer two time slots, or confirm a time.
- **Not right now:** five variants. Ask when to check back; ask whether to follow up in a few weeks; note a follow-up date and offer info; ask whether to reach out in a few weeks; or book something a few weeks out.
- **Follow-ups:** a national-day opener (only when the day fits), "did you see my last email?", a reserved-slot follow-up, and "still interested in us doing {offer}?". Some of these break the SOP's own no-phatic rule.

From [Follow Up Creatives For Cold Email.pdf](https://drive.google.com/file/d/1pGTYgnZUi3IYqCGA8BmK6S8G-aMr-lAj/view) (2025-12-13; Closers.io course, campaign follow-ups, not reply handling). Day 5: a short bump ("easy to get lost"). Day 10: "did you watch the video?" plus a proof line. Day 15: a breakup ("either my emails aren't getting through or not interested; I'll stop").

From the [Cold Email Objections SOP](https://docs.google.com/document/d/1kmq8QxCIkH267BXj773z-gGa-Y9rfibLb-YYepyfrvY/edit) (2025-11-05). About 30 objection/response pairs, including: no upfront cost, why free, don't need it, tried cold email, budget, spam fears, done in-house, what makes you different, lead quality, GDPR, too many emails, no results, trial, other priorities, impersonal, already using a vendor, other channels, outsourcing, brand, time to results, support, small business, ROI, personalization, updates and aggressiveness. **Many responses contain unverified claims** (GDPR compliance, 2,000+ daily sends, daily updates, "two years of infrastructure"). Use them as structure only.

Booking flow example from the May 2026 Twenty West plan. Weak: "Want me to send more info?" Better: "Based on what you mentioned, it makes sense to show you how we'd approach this for {company}. Does {day/time A} or {day/time B} work?" The plan wants to stop "want me to send / mind if I share / want a video?" CTAs, which **conflicts** with the step-back follow-up in Booking Without Sounding Salesy.

Not reply templates: [TargetonStar] BEST REPLIES (2025-10-13) and [Retail Media Group] BEST REPLIES (2025-10-10) list the cold-email *first-touch variants* that drew the most interested replies. This is copy evidence for Scribe, not reply-handling guidance.

---

## 4. Conflicts and outdated items

1. **Sending tools.** The 2025 Inbox Management SOP has two send buttons, Smartlead and EmailBison. The Exec Assistant SOP (2025-01) lists Smartlead. "Keeping Inboxes Organized" says Smartlead was used "back when". The current tool is EmailBison (send.dulcy.io). Smartlead steps are outdated.
2. **AI replier.** RevReply (Dec 2025 setup SOP; Jun 2026 meetings; it says to enable full auto and auto-book once trained) versus the in-house Dulcy Reply Agent in Airtable (2026-10-07: Dulcy pilot only, Human in the Loop, never Autopilot, auto-booking off). The current rule sides with the Reply Agent SOP. Whether RevReply is still in use is UNKNOWN.
3. **Calendly link.** The 2025 SOP says never send a Calendly link and to pitch times. The Reply Agent SOP says to keep the correct booking link. The RevReply setup puts the booking link under "actually book here". Booking Without Sounding Salesy uses a link as follow-up #2. The May 2026 plan says to cut calendar-forcing for contractors.
4. **Price.** The 2025 rule is never to give price by email. The June 2026 realignment says to answer price simply. The Closers example sits in between. MJJ templates require approved terms. The current repo position (in the Sean evidence file) is to answer price only with approved facts.
5. **Cadence.** Options found:
   - Follow up forever every 3 days until a clear yes or no (2025 SOP).
   - About 5 times, every 3 days (Responding Fast).
   - 1, 2 and 3 days after the previous send (Reply Agent, Oct 2026).
   - Every 48–72 hours (May 2026 plan).
   - 3 follow-ups 3 days apart after a meeting (CRM SOP).

   "Forever" conflicts with the stop, opt-out and spam-risk guidance.
6. **Thanking and phatic talk.** The 2025 SOP bans "thanks for the reply" and filler. The Closers price example opens with "thanks for the response", and the 2025 follow-up templates use national-day openers.
7. **Response targets.** Options found: 5 minutes (2025 SOP), 5–10 minutes (IM Agreement), 5–15 minutes (Responding Fast), HOT under 30 minutes and WARM under 2 hours (May 2026 plan), and 1.2 minutes average reported for RevReply (June 2026). No current Dulcy target is confirmed.
8. **Who books, and what counts as a booking.** In 2025 the VA booked in Calendly, added the prospect's phone from Apollo and was paid per booking. In 2026, RevReply auto-booked on client calendars. In the Oct 2026 Reply Agent SOP auto-booking is off and Won means actually booked. Under the PPL agreement Dulcy's job ends at scheduling, and post-booking reminders belong to the client. Yet Josh builds post-booking reminder sequences for clients (J7, J8). These may be extra services or a different contract type; UNKNOWN.
9. **Six queues.** "New Replies / Follow Ups / Positive Replies / Meeting Requested / Won / Lost" is stable from 2025 through 2026. "Client Handling" was added in Oct 2026.
10. **"Josh" in the Jarvis WhatsApp export** (`sops/drive-export/120-Jarvis.md`, Jul 2026, "Both all day") is a member of an outside community chat, **not** Dulcy's Josh. Do not use it as evidence.
11. **Entity name.** The IM Agreement employer is "Hype Pilot Marketing", not Dulcy Media LLC. It is a template; whether Josh signed it is UNKNOWN.
12. **Agency Ignition documents** are Alex's course content and include his own reported tests (3x meetings, 20–50 replies to train). They are useful methods but are not verified Dulcy metrics and do not override the current pilot rules.

---

## 5. Sources

Read in full this session via Drive (20):

| Title | Link | Last modified |
|---|---|---|
| Responding Fast (With AI or VA Help) | https://docs.google.com/document/d/1wmgaLg9DnFmbDDAoze8qGk5yLugvtCLToUc9WmIx2Do/edit | 2025-12-21 |
| Booking the Meeting Without Sounding Salesy | https://docs.google.com/document/d/1hhuS9HzuZJ1zF8hw7ezuDEMs6E57dBchF0h_Sf-1O5U/edit | 2025-12-21 |
| Why You Should Keep an Eye on ALL Replies | https://docs.google.com/document/d/1QsZypZjuzFTi_HomzIQ3DngmSwCotnq_vZc9ZLNyclk/edit | 2025-12-21 |
| Keeping Your Inboxes Organized and Scalable | https://docs.google.com/document/d/1r_oymNaqDHP3awTcj0ZWuBs5EJxRCxgDBjegif2Id00/edit | 2025-12-21 |
| Filtering Positive Replies and Auto-Tagging Responses | https://docs.google.com/document/d/1g38KeuyF5238vnasmapo6Mk1QLfcnHcTp105zxOqbeo/edit | 2025-12-21 |
| Inbox Manager (IM) Agreement | https://docs.google.com/document/d/1DGKoSgAYbO6nEa8LtM-TEvOK6FYVuey1Y7zE7Awc-Bs/edit | 2025-07-11 |
| End Of Day Processes | https://docs.google.com/document/d/10CILijmxeWIdNt-UNdEwXxs8goeAe0Wb-zUmgLZ9CrA/edit | 2025-12-15 |
| Sales Version of 0/0/0 EOD Routine | https://docs.google.com/document/d/1CDt15XFN_Y77zNbIK9_t4nTNfQMnrC-yZCJmBjW1SMA/edit | 2025-12-15 |
| Sales Management EOD.pdf | https://drive.google.com/file/d/1BNAcb209lDuSuM1siq-Gsl_yy8PIXWYh/view | 2025-12-15 |
| _Replying To Leads To Set Up Calls STA 3.0.pdf | https://drive.google.com/file/d/16C3hZ2xXc-NRIphf4Q1q1AqxozZ-nl-A/view | 2025-12-13 |
| Follow Up Creatives For Cold Email.pdf | https://drive.google.com/file/d/1pGTYgnZUi3IYqCGA8BmK6S8G-aMr-lAj/view | 2025-12-13 |
| Cold Email Tech, Set Up & Replies - Overview.pdf | https://drive.google.com/file/d/1qt5OdtrsHKhm_z3p6cSAoYEFKCXCTv8w/view | 2025-12-13 |
| Email Follow-Up Templates (MJJ Brilliant) | https://docs.google.com/document/d/1LrvwK7V37h4Ytv5_FKPYEDLg2zquMqyJTwTfSCp_Y9I/edit | 2026-11-03 |
| [TargetonStar] BEST REPLIES | https://docs.google.com/document/d/1kVQY_9XrjGauzdVbRGH45ikIU5q7vOEm9sNIt1B6De0/edit | 2025-10-13 |
| [Retail Media Group] - BEST REPLIES | https://docs.google.com/document/d/1DrEsI9HXKN3jlqCVb5uWVx4zfYObyTH7UtO36XwntH0/edit | 2025-10-10 |
| Dulcy <> Twenty West Meeting 5-26/27-26 | https://docs.google.com/document/d/15H_KbOV0QK2D3Mnp-nSipyyw5AVkQeR88jz5PdDzMVs/edit | 2026-05-27 |
| Client <> Dulcy, Growth Partnership PPL | https://docs.google.com/document/d/1WTeo9lDk7MVWVUC22DfJgt10JQU_8FZqhk_bJF6tgNk/edit | 2026-11-16 |
| Lead Flo Marketing <> Dulcy - Onboarding Call #1 | https://docs.google.com/document/d/1Ld_O4wRM7-TTfepjFX9Ir4HgLd-7Fm-SOcqrOXFIxdo/edit | 2026-07-21 |
| Client feedback on confirmation emails (owner Josh) | https://docs.google.com/document/d/1GceTDxnW-PZTRsBD1KV6wnQ0pNn7XJ5sD9Qkh7I7Ow0/edit | 2026-04-22 |
| Twenty West (post-booking HTML emails, owner Josh; structure read) | https://docs.google.com/document/d/1-cAfkdAKvydo1Y9DM1b4ljTc_j79ZzlurlnZmlMWC8w/edit | 2026-05-07 |

Read from the repo's local Drive exports (`sops/drive-export/`, exported 2026-11-17) (9):

| Title | Link | Last modified |
|---|---|---|
| DULCY REPLY AGENT & INBOX MANAGER — OPERATING SOP | https://docs.google.com/document/d/1RCCbXeUQJRXP8h0nsHnnqbGZNwwfIBKNTEAu67R7A-Q/edit | 2026-10-07 |
| INBOX MANAGEMENT SOP | https://docs.google.com/document/d/1mHkrxWFYlqWLrLMYILqJaC-WfENRsdw6yGVjh0TrzNU/edit | 2025-03-17 |
| How to Set Up an Inbox Manager for a Client | https://docs.google.com/document/d/18W05eyWLtCpzmlKKoJRfdNzcQREXaRw1_Eg0NUrkf0Q/edit | 2025-12-01 |
| CRM/CALENDAR MANAGEMENT SOP | https://docs.google.com/document/d/1aQOOkWxMcoM_DBetafLBkP2NJFiQ0q3e84Z_LJJ1MMw/edit | 2025-11-05 |
| Daily Reporting SOP | https://docs.google.com/document/d/1Eb1NCzj3EwsCxAEzeJJscNiDYDq90cVV2w7_0foJLzA/edit | 2025-11-05 |
| Dulcy <> RevReply Realignment (incl. Jun 5 and Jun 17 meeting notes) | https://docs.google.com/document/d/17KXrK-2fX099PQKj1Ra-Bw-hoi5_WnIlfZ8F3IL3768/edit | 2026-06-17 |
| Executive Assistant (VA) SOP | https://docs.google.com/document/d/1K0ubwSPthzYS8vzgsqlId-FTrje-wNpJSFGrSBQrgx0/edit | 2025-01-27 |
| Old n8n email bison reply prompt | https://docs.google.com/document/d/17hb7KfpZ-w99r02D6_HpNt7Ay35X4_-C64MGrl6_GfI/edit | 2026-06-02 |
| Cold Email Objections SOP | https://docs.google.com/document/d/1kmq8QxCIkH267BXj773z-gGa-Y9rfibLb-YYepyfrvY/edit | 2025-11-05 |

Metadata, snippets or column headers only (not counted as read): "Twenty West Call Request" (2026-06-17), five "Prev Interested Leads" sheets (2026-06-11/12), "Juiced Digital" (2026-04-21), "SHOPINNOVATOR" (2026-04-24), "email-1-confirmation" (2026-04-23), "Bounced Email" (2026-04-22), "Jun 5, 2026 | Alex + RevReply" (2026-06-05; content taken from the Realignment export), The Marketing Cartel Onboarding Document (2026-09-30).

Not re-read this session (already in the catalog): Mission Inbox one-pager, How to Navigate RevReply, Inbox Manager Prompt, Client Business Context Generator.

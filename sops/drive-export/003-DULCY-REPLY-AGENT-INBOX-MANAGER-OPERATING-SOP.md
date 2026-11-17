# DULCY REPLY AGENT & INBOX MANAGER — OPERATING SOP

Source: https://docs.google.com/document/d/1RCCbXeUQJRXP8h0nsHnnqbGZNwwfIBKNTEAu67R7A-Q/edit?usp=drivesdk
Modified: 2026-10-07T16:24:19.286Z
Exported: 2026-11-17. Source document; not independently validated as current.

﻿DULCY REPLY AGENT & INBOX MANAGER — OPERATING SOP
1. Start with the correct workspace
1. Open Inbox Manager → Dulcy Reply Agent.
2. Select Dulcy from the workspace dropdown.
3. On Overview, confirm:
   * Reply Agent: On
   * Default mode: Human in the Loop
   * Out-of-office mode: Human in the Loop
4. After changing settings, click Save changes and wait for Saved.
Only Dulcy is enabled in the current pilot. Leave client workspaces off and do not switch to Autopilot.
2. Configure the agent’s knowledge and behavior
Board tab
	How to use it
	Company & Agent
	Review the company, sender identity, offer, ICP, and inbox manager instructions. Information can come from onboarding; editing these fields creates workspace-specific overrides. Keep facts current.
	Calendar
	Maintain the correct booking link. Suggested meeting times are currently disabled, and automatic booking is not enabled. A booking link alone does not connect a calendar.
	Reply Controls
	Keep classifications on Human in the Loop. Use handoff settings only when the client should own replies. For Dulcy, the current setting is Disabled — Dulcy handles replies.
	Follow-ups
	Set the number of follow-ups, delays, and instructions for each step. Current delays are 1, 2, and 3 days, measured from the preceding confirmed send—not all from the first email. Sending windows can push these later.
	Response Style
	Set tone, length, and office hours. Dulcy currently uses Warm, Brief, and 9:30 a.m.–5 p.m. Eastern.
	Knowledge Base
	Add approved videos, case studies, or documents with a description and working link. Turn on Allow the agent to share approved assets if you want them available for replies. Asset sharing is currently off.
	For follow-up instructions, describe what the next message should accomplish: answer an unresolved question, fulfill a promise, add useful information, or ask a relevant next-step question.
Do not use “just following up,” invented results, unsupported pricing, or promises to send an asset that is unavailable.
3. Review incoming conversations
1. Open Inbox Manager → New Replies.
2. Select the conversation.
3. Confirm Campaign Name, Leads Email, and Inbox Email so you know who the prospect is and which account is replying.
4. Read Latest Lead Reply and Conversation History.
5. If anything is unclear, click Open Master Inbox to inspect the actual EmailBison thread.
6. Review:
   * AI reply draft — review before sending
   * AI review status
   * AI issue requiring attention
   * Next AI follow-up
Eligible new Dulcy replies are checked approximately every minute. Older conversations are not automatically processed as a backlog.
You can also use AI Reply Review to see drafts, explanations, errors, and reply actions together. Its Interested, Not Interested, Out of Office, and All emails tabs help organize the queue.
Ignore the historical test rows using example.invalid or clearly labelled test addresses.
4. Generate or regenerate a draft
1. Open the correct Dulcy conversation.
2. Find AI review action — approval can send when enabled.
3. Select Resume.
4. Allow the next processing cycle to run.
5. Review the resulting draft and status.
In this pilot, Resume requests a fresh draft; it does not approve sending.
If the draft stays blank, check the explanation and issue fields. The agent may need a missing asset, clearer facts, a return date, or human review. It may also have detected that someone already answered the message.
The Get an AI explanation for the reply button explains the incoming response; it is not the draft-generation control.
5. Approve or edit a reply
Before approving, confirm that the reply:
* Answers the prospect’s actual questions.
* Uses the correct offer and supported facts.
* Sounds conversational and avoids filler.
* Includes the correct asset or booking link when relevant.
* Ends with a useful next-step question where appropriate.
* Does not duplicate something already sent.
Then choose one sending path:
What you want
	What to do
	Send the AI draft unchanged
	Select Approve Draft in the AI review action field.
	Send your edited version
	Put the final text in Custom Reply, then select Send Edited Reply.
	Write and send manually
	Use Custom Reply and the existing Send Email button. Do not also approve the AI action for that message.
	Approve Draft and Send Edited Reply are sending approvals—not draft-saving buttons.
The approval worker checks approximately every minute and respects the configured sending window. Approval outside office hours may wait.
Add useful corrections in Feedback for future replies, such as “answer the pricing question before offering a call.” Use Company & Agent for lasting business facts rather than relying on feedback alone.
6. Confirm the result
After approving:
1. Check the AI status.
2. Confirm the message in Open Master Inbox.
3. Check Next AI follow-up if another touch is appropriate.
Status
	Meaning
	Needs Approval
	Review the draft or resolve the issue. A draft may be blank when information is missing.
	Scheduled
	A future follow-up is scheduled; this does not mean it was sent.
	Sending
	Submission is underway or awaiting confirmation. Do not send it again.
	Sent
	Sending was confirmed.
	Skipped
	No reply was needed for that processing event; it does not mean the opportunity is closed.
	Suppressed
	A policy prevents replying, such as an unsubscribe or automated message.
	Failed
	Inspect the error before retrying.
	If EmailBison shows Outbox, or submission is uncertain, do not approve again or use Send Email as a second attempt. Reconcile the original message first.
7. Manage the conversation’s outcome
* Interested / Positive Replies: The prospect is interested or asking relevant questions. Continue answering and nurturing.
* Meeting Request / Meeting Requested: Scheduling is underway. A request is not a confirmed booking.
* Won: Use once the meeting is actually booked under your current inbox process. The agent stops ordinary sales follow-ups.
* Lost: Use when the opportunity is closed.
* OOO: Check the return date and planned follow-up. An urgent-only alternate contact is not automatically permission to pitch that person.
* Client Handling: Check this when the client takes ownership; the agent should not continue the conversation.
* Unsubscribe or explicit stop: Do not override suppression to continue outreach.
For messages arriving after booking, use the Won conversation and Master Inbox to handle cancellations, rescheduling, or questions. Do not reopen sales follow-ups merely to answer a meeting-support email.
8. Review follow-ups and finish the daily check
1. Check Meeting Requested for active scheduling.
2. Clear actionable New Replies.
3. Review Positive Replies and AI Reply Review.
4. Check Follow Ups and due dates.
5. Review failures or messages stuck in Sending.
6. Check booked conversations for new messages.
The follow-up scheduler checks every ten minutes. When a follow-up is due, it generates a fresh draft using the current conversation. That draft still requires human approval.
During this pilot, review every outgoing message. To pause the whole agent, switch Reply Agent Off on Overview and click Save changes. Already-submitted messages cannot be recalled by that switch.

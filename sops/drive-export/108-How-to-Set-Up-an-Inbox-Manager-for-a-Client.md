# How to Set Up an Inbox Manager for a Client

Source: https://docs.google.com/document/d/18W05eyWLtCpzmlKKoJRfdNzcQREXaRw1_Eg0NUrkf0Q/edit?usp=drivesdk
Modified: 2025-12-01T23:37:10.038Z
Exported: 2026-11-17. Source document; not independently validated as current.

﻿How to Set Up an Inbox Manager for a Client SOP
How to Set Up an Inbox Manager for a Client


Purpose:
To properly configure a RevReply Inbox Manager (email + LinkedIn) for new or existing client campaigns so replies, follow-ups, and meeting booking automations run smoothly.
Last Updated: Dec 1, 2025
Tools Used: RevReply, Airtable (API Keys), Slack, Email Bison, Hayreach, Calendly / booking link
________________


1. Overview
Setting up an Inbox Manager ensures all inbound replies from cold outreach are automatically categorized, responded to, and turned into booked meetings.
This SOP outlines how to:
* Create a new Inbox Manager

* Connect sending tools (Email Bison / Hayreach)

* Connect client calendars

* Feed RevReply the correct business info

* Configure response rules

* Train the AI using thumbs-up/down

* Enable full auto mode only when ready

* Handle multi-sender setups

________________


2. Create a New Inbox Manager
   1. Inside RevReply, go to Inbox Managers → New Inbox Manager.

   2. Name it using this format:

      * Dulcy – Email Manager

      * Dulcy – LinkedIn Manager

      * ClientName – Email Manager

         3. Objective:

            * Select Set Up a Meeting (99% of cases)

            * Only choose Other Objective if doing sign-ups or special workflows

               4. Language: English (unless client uses another language)

________________


3. Connect Sending Platform
A. Email (Email Bison)
                  1. Choose Email Bison

                  2. API URL = send.dulcy.io

                  3. Get API key from Airtable → Data → Email Bison API

                  4. Paste API Key → Connect

B. LinkedIn (via Hayreach)
                     1. Choose Hayreach / LinkedIn

                     2. Get API Key from Airtable → Hayreach API

                     3. Paste → Connect

(Tip: After you configure one Inbox Manager, duplicate it for the second channel and only swap the integration.)
________________


4. Connect & Configure Calendar
A. If Client Is Present
Click Use Existing Calendar.
B. If Client Needs to Connect
Send calendar connection request:
                        * Add client email

                        * Add “from” name (ex: “Team Dulcy”)

                        * Message example:

“Hey {NAME}, could you please link your calendar so we can automatically schedule meetings?”

C. Booking Availability Settings
                           * Timezone: Client’s timezone

                           * Hours: 9am–6pm

                           * Exclude weekends: ON

                           * Paste their Calendly / SavvyCal link under “Actually Book Here”

                           * Turn Auto-Book Meetings → ON

(RevReply reads availability & books inside open slots.)

________________


5. Train the Inbox Manager (Most Important Step)
RevReply needs 20–30 human-approved replies before going full auto.
A. Where Responses Show Up
Responses appear in:
                              * Slack → #internal-inbox-manager

                              * RevReply → Messages

B. For each generated draft:
You must:
                                 * Click Edit → adjust message tone/accuracy

                                 * Click Approve to send

                                 * Click Thumbs Up if good, Thumbs Down if bad

                                 * Reclassify if miscategorized (interested / not interested / info request / delegated)

This is how RevReply learns your tone, scripts, and phrasing.
C. When to switch to auto mode
Once drafts require little to no editing, switch categories one by one:
                                    1. Delegated

                                    2. Not Interested

                                    3. Follow-ups

                                    4. Interested

                                    5. Meeting Requests

DO NOT switch everything to auto at once.
________________


6. Add Business Info & Instructions
RevReply must understand the client’s business to respond correctly.
A. Auto-Extract Website
Click Auto-Generate Profile → paste website.
If blocked:
                                       * Tell client their site blocks crawlers

                                       * In the meantime paste:

                                          * Onboarding form answers

                                          * Offer

                                          * ICP

                                          * Deliverables

                                          * Pricing

                                          * FAQs

                                          * Case studies / proof

                                          * Core positioning

B. Add instructions manually
Under Agent Instructions, add:
                                             * “You are an inbox manager handling replies for cold outreach.”

                                             * “Your goal is to book meetings.”

                                             * “Keep replies short, simple, human, and aligned with cold email best practices.”

                                             * “Do not use images or links in first email replies.”

                                             * “Use {Signature} token when applied.”

________________


7. Add Example Responses (Templates)
Under Templates / Example Replies, add common message patterns:
                                                * Interested reply

                                                * Not interested + ask for feedback

                                                * Delegated

                                                * Budget objection

                                                * “Send more info”

                                                * “What’s your proposal?”

                                                * “How did you get my email?”

These drastically improve the AI’s output.
________________


8. Response Settings
Tone:
                                                   * Neutral OR Professional (unless client requests otherwise)

Response Length:
                                                      * Short (25–75 words)

No-Thanks Auto-Handling:
                                                         * ON

                                                         * Add this example:

“No worries — I’ll remove you from the list. Quick question before I do: any feedback on my outreach so I can improve?”
Dynamic Generation:
                                                            * ON (recommended)

Warm-up Exclusions:
Add:
{client warm up tag phrase}
(from AirTable → warm-up tags)
Knowledge Base:
Add:
                                                               * Loom videos

                                                               * Case studies

                                                               * Whitepapers

                                                               * Product demos

The AI may send these when appropriate.
________________


9. Slack Notifications Setup
Turn ON:
                                                                  * Send thread button

                                                                  * Show full reply

                                                                  * Show Inbox Manager name

                                                                  * Send classification updates

This ensures CSMs can correct drafts instantly.
________________


10. Multi-Sender (Two Calendar) Setup
If they share one booking link → ONE Inbox Manager.
If they have two booking links → TWO Inbox Managers.
Setup example:
Manager 1 (Suman)
                                                                     * Keyword filter: “Suman”

                                                                     * Calendar: Suman’s

                                                                     * Booking Link: Suman’s

Manager 2 (Dean)
                                                                        * Duplicate Manager 1

                                                                        * Change keyword to “Dean”

                                                                        * Change calendar + booking link to Dean’s

Done.
________________


11. Quality Checklist Before Turning Fully Auto
Before enabling full auto:
                                                                           * AI is producing clean, simple replies

                                                                           * 20–30 messages have been corrected manually

                                                                           * All templates added

                                                                           * Delegated replies are accurate

                                                                           * No-thanks replies are polite + consistent

                                                                           * Booking link works

                                                                           * Calendar integration verified

                                                                           * Warm-up exclusions added

                                                                           * All agent instructions added

                                                                           * Knowledge base added

                                                                           * Multi-calendar logic (if needed) validated

Once these are met, full auto can be safely toggled on.
________________


12. Final Review
Every client should end up with:
                                                                              * Email Manager (Email Bison)

                                                                              * LinkedIn Manager (Hayreach)

                                                                              * Both connected to Slack

                                                                              * Both connected to calendar

                                                                              * Business info trained

                                                                              * Response patterns trained

                                                                              * AI set to appropriate tone

                                                                              * Auto-book enabled

                                                                              * All objections & scenarios handled

                                                                              * Full auto enabled (after training)

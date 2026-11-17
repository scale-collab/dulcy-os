# Make.com scenarios (2026-11-17)

79 scenarios (28 on). Team `629049` ("My Team"), org Dulcy, zone us1. Pulled read-only.

| Folder | Scenario | ID | Status | Trigger | Modules | Apps | Last edit | File |
|---|---|---|---|---|---|---|---|---|
| - | [Airtable] Sales Center Oppurunity Status Update | `4858056` | ON  | close-crm:TriggerNewOpportunityStatus | 3 | airtable, close-crm | 2026-09-23 | `airtable-sales-center-oppurunity-status-update--4858056.json` |
| - | [Content OS] Reddit RSS Relay — n8n | `5015768` | ON  | gateway:CustomWebHook | 4 | rss | 2026-11-02 | `content-os-reddit-rss-relay-n8n--5015768.json` |
| Dulcy OS | [9.0 CLIENT] Booked Meetings | `3250323` | ON  | gateway:CustomWebHook | 11 | airtable, google-docs, google-drive, google-sheets, http, slack | 2026-06-26 | `9-0-client-booked-meetings--3250323.json` |
| Dulcy OS | [Call Feedback] Form Submission -> Notion Client Revenue Dashboard | `3884238` | ON  | gateway:CustomWebHook | 6 | airtable, slack | 2026-05-20 | `call-feedback-form-submission-notion-client-revenue-dashboar--3884238.json` |
| Dulcy OS | [Client Closed a Deal] Form Submission -> Closed Deal | `4742245` | ON  | gateway:CustomWebHook | 6 | airtable, slack | 2026-05-20 | `client-closed-a-deal-form-submission-closed-deal--4742245.json` |
| Dulcy OS | [INBOX MANAGER] Explain Reply | `4031111` | ON  | gateway:CustomWebHook | 3 | airtable, openai-gpt-3 | 2025-06-05 | `inbox-manager-explain-reply--4031111.json` |
| Dulcy OS | [INBOX MANAGER] Push To Client Reply | `3971473` | ON  | gateway:CustomWebHook | 5 | airtable, http | 2025-09-16 | `inbox-manager-push-to-client-reply--3971473.json` |
| Dulcy OS | [LinkedIn] - Positive Reply -> LinkedIn Campaign | `3737469` | ON  | gateway:CustomWebHook | 5 | airtable, http | 2026-02-24 | `linkedin-positive-reply-linkedin-campaign--3737469.json` |
| Dulcy OS | [LinkedIn] Search for HeyReach Campaigns not yet attached to Email Campaign | `3764307` | ON  | gateway:CustomWebHook | 4 | airtable, http | 2026-02-24 | `linkedin-search-for-heyreach-campaigns-not-yet-attached-to-e--3764307.json` |
| Dulcy OS | [Slack Bot] Interactions | `3971693` | ON  | gateway:CustomWebHook | 8 | airtable, http | 2025-09-26 | `slack-bot-interactions--3971693.json` |
| Dulcy OS | Content Script Creator (Nik) | `4548131` | ON  | gateway:CustomWebHook | 5 | airtable, anthropic-claude | 2026-02-08 | `content-script-creator-nik--4548131.json` |
| Dulcy OS - Analytics | Email Account Updates | `4231501` | ON  | gateway:CustomWebHook | 11 | airtable, http | 2025-08-22 | `email-account-updates--4231501.json` |
| Dulcy Sales Process | [1.0 PRECALL] Booked Meeting | `2482146` | ON  | calendly:watchInvitees | 40 | airtable, calendly, close-crm, http, slack | 2026-11-04 | `1-0-precall-booked-meeting--2482146.json` |
| Dulcy Sales Process | [1.0 PRECALL] Booked Meeting GHL | `3770063` | ON  | gateway:CustomWebHook | 14 | airtable, close-crm, http, openai-gpt-3, slack | 2026-10-13 | `1-0-precall-booked-meeting-ghl--3770063.json` |
| Dulcy Sales Process | [1.1 PRECALL] Existing Lead | `2484840` | ON  | gateway:CustomWebHook | 20 | close-crm, http, slack | 2026-11-04 | `1-1-precall-existing-lead--2484840.json` |
| Dulcy Sales Process | [1.1 PRECALL] New Lead | `2484643` | ON  | gateway:CustomWebHook | 6 | close-crm, http | 2026-08-05 | `1-1-precall-new-lead--2484643.json` |
| Dulcy Sales Process | [1.2 PRECALL] Remap Reminders | `2484839` | ON  | gateway:CustomWebHook | 8 | close-crm, http | 2026-04-05 | `1-2-precall-remap-reminders--2484839.json` |
| Dulcy Sales Process | [1.2 PRECALL] Remap Reminders Disqual | `4505742` | ON  | gateway:CustomWebHook | 4 | close-crm | 2026-01-15 | `1-2-precall-remap-reminders-disqual--4505742.json` |
| Dulcy Sales Process | [1.2 PRECALL] Schedule Reminders | `2484843` | ON  | gateway:CustomWebHook | 25 | close-crm | 2026-09-17 | `1-2-precall-schedule-reminders--2484843.json` |
| Dulcy Sales Process | [1.3 PRECALL] Canceled Meeting | `3241754` | ON  | calendly:watchInvitees | 7 | calendly, close-crm, http | 2025-05-13 | `1-3-precall-canceled-meeting--3241754.json` |
| Dulcy Sales Process | [2.0 POSTCALL] Call Done | `4319209` | ON  | gateway:CustomWebHook | 8 | close-crm | 2026-08-26 | `2-0-postcall-call-done--4319209.json` |
| Dulcy Sales Process | [2.4 POST CALL] Handle No Show | `2503785` | ON  | close-crm:TriggerNewOpportunityStatus | 4 | close-crm | 2025-01-02 | `2-4-post-call-handle-no-show--2503785.json` |
| Dulcy Sales Process | Fathom Recording to Close (Alexander) | `4376963` | ON  | fathom:getwebhook | 16 | airtable, close-crm, fathom, google-calendar, http | 2026-09-23 | `fathom-recording-to-close-alexander--4376963.json` |
| Dulcy Sales Process | Fathom Recording to Close (Alexander) (Client) | `4541984` | ON  | fathom:getwebhook | 15 | airtable, fathom, google-calendar | 2026-07-22 | `fathom-recording-to-close-alexander-client--4541984.json` |
| Dulcy Sales Process | Fathom Recording to Close (Sales Rep) | `4376982` | ON  | fathom:getwebhook | 16 | airtable, close-crm, fathom, google-calendar, http | 2026-08-26 | `fathom-recording-to-close-sales-rep--4376982.json` |
| Ignition Dev | Non-Active User Notification | `4577166` | ON  | gateway:CustomWebHook | 2 | discord | 2026-02-24 | `non-active-user-notification--4577166.json` |
| Ignition Dev | Save Ignition Dev Discord | `4445152` | ON  | gateway:CustomWebHook | 140 | airtable, discord | 2026-02-25 | `save-ignition-dev-discord--4445152.json` |
| Real Estate OS | [ZBuyer] Leads (Melisa) | `4478716` | ON  | gateway:CustomWebHook | 34 | close-crm, http, slack | 2026-01-20 | `zbuyer-leads-melisa--4478716.json` |
| - | [Campaign Creation - Client Submits Info] Apify Route | `4259560` | off  | airtable:TriggerWatchRecords | 15 | airtable, apify, csv, google-drive, http | 2025-09-10 | `campaign-creation-client-submits-info-apify-route--4259560.json` |
| - | [Campaign] Benchmark Analysis | `4388262` | off  | gateway:CustomWebHook | 9 | airtable, http, openai-gpt-3 | 2025-11-06 | `campaign-benchmark-analysis--4388262.json` |
| - | Fathom Recording to Close (Juan) (Client) | `4541946` | off  | fathom:getwebhook | 13 | airtable, fathom, google-calendar | 2026-02-06 | `fathom-recording-to-close-juan-client--4541946.json` |
| - | Positive Reply > Write letter > Handwrytten | `4193076` | off  | gateway:CustomWebHook | 3 | anthropic-claude, handwrytten | 2026-01-05 | `positive-reply-write-letter-handwrytten--4193076.json` |
| - | Reddit Auto Scrape Ideas for YouTube (cold email) | `4839777` | off  | rss:ActionReadArticles | 4 | google-sheets, openai-gpt-3, rss | 2026-07-22 | `reddit-auto-scrape-ideas-for-youtube-cold-email--4839777.json` |
| Client Templates | [1.0 PRECALL] Booked Meeting (Client) | `4584080` | off  | calendly:watchInvitees | 19 | calendly, close-crm, http | 2026-02-26 | `1-0-precall-booked-meeting-client--4584080.json` |
| Client Templates | [1.1 PRE CALL] New Lead (Client) | `4584091` | off  | gateway:CustomWebHook | 6 | close-crm, http | 2026-02-26 | `1-1-pre-call-new-lead-client--4584091.json` |
| Client Templates | [1.1 PRECALL] Existing Lead (Client) | `4584087` | off  | gateway:CustomWebHook | 12 | close-crm, http | 2026-02-26 | `1-1-precall-existing-lead-client--4584087.json` |
| Client Templates | [1.2 PRECALL] Schedule Reminders (Client) | `4584097` | off  | gateway:CustomWebHook | 13 | close-crm | 2026-02-26 | `1-2-precall-schedule-reminders-client--4584097.json` |
| Client Templates | [1.3 PRECALL] Remap Reminders (Client) | `4584103` | off  | gateway:CustomWebHook | 6 | close-crm, http | 2026-02-26 | `1-3-precall-remap-reminders-client--4584103.json` |
| Dulcy OS | [Call Feedback] Request through Slack (Monday) (deprecated) | `3891298` | off  | airtable:ActionSearchRecords | 6 | airtable | 2026-07-23 | `call-feedback-request-through-slack-monday-deprecated--3891298.json` |
| Dulcy OS | [Call Feedback] Request through Slack (Tue - Fri) (depreciated) | `3861506` | off  | airtable:ActionSearchRecords | 6 | airtable | 2026-07-23 | `call-feedback-request-through-slack-tue-fri-depreciated--3861506.json` |
| Dulcy OS | [INBOX MANAGER] Receive Replies from EmailBison | `3816555` | off  | gateway:CustomWebHook | 32 | airtable, highlevel, http, openai-gpt-3, slack, zapier | 2025-07-22 | `inbox-manager-receive-replies-from-emailbison--3816555.json` |
| Dulcy OS | Contact other contact from OOO | `4424551` | off INVALID | airtable:TriggerWatchRecords | 28 | airtable, http, markdown, openai-gpt-3 | 2026-09-23 | `contact-other-contact-from-ooo--4424551.json` |
| Dulcy OS | Contact other contact from OOO (copy) | `4431153` | off  | airtable:TriggerWatchRecords | 30 | airtable, http, markdown, openai-gpt-3 | 2025-11-27 | `contact-other-contact-from-ooo-copy--4431153.json` |
| Dulcy OS | EmailBison Disconnected Emails (deprecated) | `3767728` | off  | gateway:CustomWebHook | 4 | airtable, slack | 2026-07-23 | `emailbison-disconnected-emails-deprecated--3767728.json` |
| Dulcy OS | Reddit Auto Scrape Ideas for YouTube (agency) | `4508319` | off INVALID | rss:ActionReadArticles | 4 | google-sheets, openai-gpt-3, rss | 2026-01-16 | `reddit-auto-scrape-ideas-for-youtube-agency--4508319.json` |
| Dulcy OS | Reddit Auto Scrape Ideas for YouTube (entrepreneur) | `4508274` | off  | rss:ActionReadArticles | 4 | google-sheets, openai-gpt-3, rss | 2026-01-16 | `reddit-auto-scrape-ideas-for-youtube-entrepreneur--4508274.json` |
| Dulcy OS | Track new email accounts added to Bison (deprecated) | `3805815` | off  | gateway:CustomWebHook | 5 | airtable, http | 2026-07-23 | `track-new-email-accounts-added-to-bison-deprecated--3805815.json` |
| Dulcy OS - Analytics | Analytics - EmailBison | `3721254` | off  | airtable:ActionSearchRecords | 17 | airtable, http | 2025-04-07 | `analytics-emailbison--3721254.json` |
| Dulcy OS - Analytics | Analytics - EmailBison (No Weekends) | `3776410` | off  | airtable:ActionSearchRecords | 17 | airtable, http | 2025-04-07 | `analytics-emailbison-no-weekends--3776410.json` |
| Dulcy OS - Analytics | Analytics - HeyReach | `3721193` | off  | http:ActionSendData | 6 | airtable, http | 2025-07-23 | `analytics-heyreach--3721193.json` |
| Dulcy OS - Analytics | Analytics - HeyReach (new) | `4157713` | off  | http:ActionSendData | 11 | airtable, http | 2026-04-15 | `analytics-heyreach-new--4157713.json` |
| Dulcy OS - Analytics | Notifications - Campaign over 60% (deprecaited) | `3737581` | off  | gateway:CustomWebHook | 6 | airtable | 2026-07-23 | `notifications-campaign-over-60-deprecaited--3737581.json` |
| Dulcy Sales Process | [1.3 PRECALL] Canceled Meeting Email | `3254053` | off  | gateway:CustomWebHook | 7 | close-crm, slack | 2025-01-11 | `1-3-precall-canceled-meeting-email--3254053.json` |
| Dulcy Sales Process | [2.0 POSTCALL] Call Done OLD | `2503362` | off  | zoom:watchRecordings | 10 | close-crm, google-drive, zoom | 2025-10-01 | `2-0-postcall-call-done-old--2503362.json` |
| Dulcy Sales Process | [2.1 POST CALL] Contract Events | `2503893` | off  | pandadoc:watchDocuments | 10 | close-crm, http, pandadoc, slack | 2026-07-27 | `2-1-post-call-contract-events--2503893.json` |
| Dulcy Sales Process | [2.2 POSTCALL] Onboarding Pt1 | `2503711` | off  | gateway:CustomWebHook | 79 | airtable, close-crm, google-sheets, http, slack, xero | 2026-07-24 | `2-2-postcall-onboarding-pt1--2503711.json` |
| Dulcy Sales Process | [2.3 POSTCALL] Onboarding Form Complete | `3237449` | off  | gateway:CustomWebHook | 18 | airtable, anthropic-claude, google-drive, google-sheets, http, openai-gpt-3, slack | 2026-06-30 | `2-3-postcall-onboarding-form-complete--3237449.json` |
| Dulcy Sales Process | [2.5 POST CALL] New Client Agreements | `4875605` | off INVALID | gateway:CustomWebHook | 13 | airtable, close-crm, pandadoc, slack | 2026-08-17 | `2-5-post-call-new-client-agreements--4875605.json` |
| Dulcy Sales Process | [2.5 POST CALL] New Client Intake (Depreciated) | `3956940` | off  | gateway:CustomWebHook | 23 | close-crm, pandadoc, slack | 2026-08-17 | `2-5-post-call-new-client-intake-depreciated--3956940.json` |
| Dulcy Sales Process | [Template] Booked Meeting (copy) | `4480392` | off  | calendly:watchInvitees | 39 | airtable, calendly, close-crm, http, slack, synthflow-ai-phone-calling | 2025-12-29 | `template-booked-meeting-copy--4480392.json` |
| Dulcy Sales Process | [Template] Call Done (copy) | `4480414` | off  | gateway:CustomWebHook | 7 | close-crm | 2025-12-29 | `template-call-done-copy--4480414.json` |
| Dulcy Sales Process | [Template] Contract Events (copy) | `4480410` | off  | pandadoc:watchDocuments | 10 | close-crm, http, pandadoc, slack | 2025-12-29 | `template-contract-events-copy--4480410.json` |
| Dulcy Sales Process | [TEMPLATE] Existing Lead (copy) | `4480394` | off  | gateway:CustomWebHook | 18 | close-crm, http, slack | 2026-02-24 | `template-existing-lead-copy--4480394.json` |
| Dulcy Sales Process | [TEMPLATE] New Lead (copy) | `4480395` | off  | gateway:CustomWebHook | 6 | close-crm, http | 2025-12-29 | `template-new-lead-copy--4480395.json` |
| Dulcy Sales Process | [TEMPLATE] Onboarding (copy) | `4480417` | off  | gateway:CustomWebHook | 9 | close-crm, http, slack | 2025-12-29 | `template-onboarding-copy--4480417.json` |
| Dulcy Sales Process | [TEMPLATE] Remap Reminders (copy) | `4480398` | off  | gateway:CustomWebHook | 6 | close-crm, http | 2025-12-29 | `template-remap-reminders-copy--4480398.json` |
| Dulcy Sales Process | [TEMPLATE] Schedule Reminders (copy) | `4480407` | off  | gateway:CustomWebHook | 19 | close-crm | 2025-12-29 | `template-schedule-reminders-copy--4480407.json` |
| Real Estate OS | [AGENT] Business/Agent to Contacts | `3248826` | off INVALID | close-crm:TriggerNewLeadStatus | 3 | close-crm, hubspotcrm | 2024-10-21 | `agent-business-agent-to-contacts--3248826.json` |
| Real Estate OS | [CLOSE] Congratulations on New Home | `3248850` | off  | close-crm:TriggerNewOpportunity | 4 | close-crm | 2024-10-21 | `close-congratulations-on-new-home--3248850.json` |
| Real Estate OS | [CLOSE] Engaged/Unqualified Pause | `3248896` | off  | close-crm:TriggerNewLeadStatus | 3 | close-crm | 2024-10-21 | `close-engaged-unqualified-pause--3248896.json` |
| Real Estate OS | [CLOSE] Unqualified > Unsubscribed | `3249203` | off  | close-crm:TriggerNewLeadStatus | 2 | close-crm | 2024-10-21 | `close-unqualified-unsubscribed--3249203.json` |
| Real Estate OS | [CLOSE} Engaged/Contacted Update (Call) | `3248871` | off  | close-crm:TriggerNewCall | 4 | close-crm | 2024-10-21 | `close-engaged-contacted-update-call--3248871.json` |
| Real Estate OS | [Realtor.com] Leads | `3241778` | off INVALID | gateway:CustomWebHook | 32 | close-crm, hubspotcrm, slack, synthflow-ai-phone-calling | 2025-01-22 | `realtor-com-leads--3241778.json` |
| Real Estate OS | [SQUARESPACE] Contact Forms | `3242029` | off  | email:TriggerNewEmail | 141 | close-crm, email, hubspotcrm, openai-gpt-3, slack | 2024-12-02 | `squarespace-contact-forms--3242029.json` |
| Real Estate OS | [ZBuyer] Leads | `3209819` | off INVALID | gateway:CustomWebHook | 63 | close-crm, hubspotcrm, slack, synthflow-ai-phone-calling | 2025-12-28 | `zbuyer-leads--3209819.json` |
| Sendspark Videos | [Adverio] Job Postings | `4023773` | off  | google-sheets:watchRows | 6 | google-sheets, http | 2025-06-05 | `adverio-job-postings--4023773.json` |
| Sendspark Videos | [Adverio] RB2B No Video | `4022186` | off  | gateway:CustomWebHook | 5 | http | 2025-07-09 | `adverio-rb2b-no-video--4022186.json` |
| Sendspark Videos | [Adverio] Sendspark Videos | `3854075` | off  | gateway:CustomWebHook | 15 | http | 2025-04-15 | `adverio-sendspark-videos--3854075.json` |
| Sendspark Videos | [TEMPLATE] Videos | `3793104` | off  | gateway:CustomWebHook | 15 | http | 2025-06-05 | `template-videos--3793104.json` |

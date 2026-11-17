# Airtable automations (Dulcy base)

51 automations, pulled read-only on 2026-11-17 with their full script code. Published version = draft for all of them (no unpublished edits).

Removed before commit: an EmailBison API token hardcoded in 4 scripts, a webhook secret in 2 scripts, and webhook URL paths (n8n, Make, Airtable). Replaced with `REDACTED...`.

| Automation | ID | Status | Trigger | Table | Steps | Deploy error | File |
|---|---|---|---|---|---|---|---|
| AI Script Creator - Bridge | `wflSMoEu3MAcy7t41` | undeployed | recordCreated | Campaigns | customScript |  | `ai-script-creator-bridge--wflSMoEu3MAcy7t41.json` |
| Airtable Content OS Action Script | `wfl47ZBEdkIgJG7bK` | deployed | recordMatchesConditions | Content Channels (Alex Woung) | customScript |  | `airtable-content-os-action-script--wfl47ZBEdkIgJG7bK.json` |
| Analytics - Add Calls Booked | `wflB1B54VMAQ9aucv` | deployed | recordCreated | Email Analytics | customScript, findRecords, updateRecord |  | `analytics-add-calls-booked--wflB1B54VMAQ9aucv.json` |
| Apply Template | `wflSOkbfLo0arhHkI` | deployed | inputReceivedFromConnection | Emails | updateRecord |  | `apply-template--wflSOkbfLo0arhHkI.json` |
| Apply Template (LinkedIn) | `wflKzjtW9bUwYFHDn` | deployed | inputReceivedFromConnection | Emails | updateRecord |  | `apply-template-linkedin--wflKzjtW9bUwYFHDn.json` |
| Approve Purchase Domains Automation | `wfl1OiJCNtgmedoun` | deployed | recordMatchesConditions | Domain Purchase Requests | customScript |  | `approve-purchase-domains-automation--wfl1OiJCNtgmedoun.json` |
| Attach Booked Meetings to Client | `wflv6Rf37XANupi6m` | deployed | recordEntersView | Emails | findRecords, updateRecord |  | `attach-booked-meetings-to-client--wflv6Rf37XANupi6m.json` |
| Automate Client Request to Call from Slack | `wflgiaDKaZsdMPKtr` | deployed | inputReceivedFromConnection | Emails | findRecords, sendToSlack |  | `automate-client-request-to-call-from-slack--wflgiaDKaZsdMPKtr.json` |
| Autoupdate for Booked/Closed Month | `wflocVtavhmJiwWES` | deployed | recordMatchesConditions | Sales Data | findRecords, updateRecord |  | `autoupdate-for-booked-closed-month--wflocVtavhmJiwWES.json` |
| Call Feedback Sync | `wflBVaeV1oOMaLHId` | deployed | recordCreated | Call Feedback | customScript, updateRecord |  | `call-feedback-sync--wflBVaeV1oOMaLHId.json` |
| Campaign Center - EmailBison Actions | `wflDrAPfz9aO96fBX` | deployed | recordMatchesConditions | Campaigns | customScript |  | `campaign-center-emailbison-actions--wflDrAPfz9aO96fBX.json` |
| Client Replied | `wflYwCvqfNQy9HZHE` | deployed | recordUpdated | Emails | customScript, findRecords, updateRecord |  | `client-replied--wflYwCvqfNQy9HZHE.json` |
| Close a Deal Sync | `wflSwwFjkYfND9xnh` | deployed | recordCreated | Client Closed Deals | customScript, updateRecord |  | `close-a-deal-sync--wflSwwFjkYfND9xnh.json` |
| Closer/SDR Report Submission | `wflaan3NnaFA4GRgk` | deployed | formSubmitted | Team Check Ins | sendToSlack |  | `closer-sdr-report-submission--wflaan3NnaFA4GRgk.json` |
| Contracts — Run requested signing action | `wfl0AT5E1myewHAmt` | deployed | recordMatchesConditions | Contracts | customScript |  | `contracts-run-requested-signing-action--wfl0AT5E1myewHAmt.json` |
| Create Emailbsion Campaign | `wflzn9ZhWk3HXzoEW` | deployed | recordUpdated | Campaigns | customScript |  | `create-emailbsion-campaign--wflzn9ZhWk3HXzoEW.json` |
| Daily Total Campaign Data | `wfl3DencVjm8SepDu` | deployed | cron |  | customScript |  | `daily-total-campaign-data--wfl3DencVjm8SepDu.json` |
| Daily Total Campaign Data (Campaign Table Button) | `wflXrystmBYwyEslG` | deployed | genericWebhookReceived |  | customScript |  | `daily-total-campaign-data-campaign-table-button--wflXrystmBYwyEslG.json` |
| Delete Old Inbox Tests | `wflzJRt24JUWHIZd6` | deployed | recordMatchesConditions | Inbox Placement Testing | customScript |  | `delete-old-inbox-tests--wflzJRt24JUWHIZd6.json` |
| Duplicate Campaign | `wflXE1z331MHZfz2J` | deployed | inputReceivedFromConnection | Campaigns | createRecord |  | `duplicate-campaign--wflXE1z331MHZfz2J.json` |
| Email Account Bulk Controls | `wflM4inYul5ZTh95a` | deployed | recordMatchesConditions | Email Account Bulk Controls | customScript |  | `email-account-bulk-controls--wflM4inYul5ZTh95a.json` |
| Email Accounts - Update | `wfltqgixKAs9gcmxN` | deployed | recordMatchesConditions | Email Accounts | customScript |  | `email-accounts-update--wfltqgixKAs9gcmxN.json` |
| Enrichment Action | `wflXVKrZbywqUELEM` | deployed | recordMatchesConditions | Lead Lists | customScript |  | `enrichment-action--wflXVKrZbywqUELEM.json` |
| Fetch Campaign Data Auto | `wflwZWjWo6WMk00y6` | deployed | cron |  | customScript |  | `fetch-campaign-data-auto--wflwZWjWo6WMk00y6.json` |
| Generate AI Scripts | `wflJNWsJJF8Uzm9C3` | undeployed | recordMatchesConditions | Campaigns | customScript, updateRecord |  | `generate-ai-scripts--wflJNWsJJF8Uzm9C3.json` |
| Generate AI Spintax | `wflHT7Ot1zGeNB68y` | deployed | recordMatchesConditions | Campaigns | customScript, updateRecord |  | `generate-ai-spintax--wflHT7Ot1zGeNB68y.json` |
| Generate Domain IDeas | `wfl4nKhp0oaOtgbgM` | deployed | recordMatchesConditions | Domain Purchase Requests | customScript |  | `generate-domain-ideas--wfl4nKhp0oaOtgbgM.json` |
| Inbox Manager - Explain Reply | `wflLDXCgzJ8cZT45A` | deployed | inputReceivedFromConnection | Emails | customScript |  | `inbox-manager-explain-reply--wflLDXCgzJ8cZT45A.json` |
| Inbox Manager Reports Submission | `wflFilmNm2V0oviDu` | deployed | formSubmitted | Team Check Ins | sendToSlack |  | `inbox-manager-reports-submission--wflFilmNm2V0oviDu.json` |
| Lead List Center Dispatcher | `wflgj0HK24sgd8Uuy` | deployed | recordMatchesConditions | Lead Lists | customScript |  | `lead-list-center-dispatcher--wflgj0HK24sgd8Uuy.json` |
| Leave Request Slack Notis | `wflDAS9MstqGHctZB` | deployed | recordMatchesConditions | Team Attendance | sendToSlack |  | `leave-request-slack-notis--wflDAS9MstqGHctZB.json` |
| New Client Intake | `wflhyGBAWa1bYZIhf` | undeployed | recordMatchesConditions | New Client Intake | customScript |  | `new-client-intake--wflhyGBAWa1bYZIhf.json` |
| Notification - Campaign Bounced over 2.5% | `wflmHtwUAATQiBhM0` | deployed | recordMatchesConditions | Campaigns | createRecord, customScript, findRecords, sendToSlack |  | `notification-campaign-bounced-over-2-5--wflmHtwUAATQiBhM0.json` |
| Notification - Campaign PR Rate sub 10% after 1500 emails | `wflWCwriY85IpL1LU` | deployed | recordMatchesConditions | Campaigns | createRecord, customScript, findRecords, sendToSlack |  | `notification-campaign-pr-rate-sub-10-after-1500-emails--wflWCwriY85IpL1LU.json` |
| Notification - Campaign Progress Over 60% | `wflJaQViGNu7KJ5SB` | deployed | recordMatchesConditions | Campaigns | customScript, sendToSlack |  | `notification-campaign-progress-over-60--wflJaQViGNu7KJ5SB.json` |
| Notification - Campaign Replies under 1% | `wflFnxcU40SQIxFwg` | deployed | recordMatchesConditions | Campaigns | createRecord, customScript, findRecords, sendToSlack |  | `notification-campaign-replies-under-1--wflFnxcU40SQIxFwg.json` |
| Onboarding Form | `wflQouMYwOAwz5zPo` | deployed | formSubmitted | Onboarding | customScript |  | `onboarding-form--wflQouMYwOAwz5zPo.json` |
| OOO - Alternative name an email | `wflPXWwFPYrsSZPpc` | deployed | recordUpdated | Emails | customScript |  | `ooo-alternative-name-an-email--wflPXWwFPYrsSZPpc.json` |
| OOO - Send Subsequence Email | `wflTLPwbdADQGu6kK` | undeployed | recordEntersView | Emails | customScript |  | `ooo-send-subsequence-email--wflTLPwbdADQGu6kK.json` |
| Positive Reply -> LinkedIn | `wflGiqs2JakTl5O39` | deployed | recordMatchesConditions | Emails | customScript |  | `positive-reply-linkedin--wflGiqs2JakTl5O39.json` |
| Push To Client Reply | `wflRDIdrpmADyu8RP` | deployed | inputReceivedFromConnection | Emails | customScript, updateRecord |  | `push-to-client-reply--wflRDIdrpmADyu8RP.json` |
| QA Airtable automation | `wflWfdxSpf2JclmDV` | deployed | recordMatchesConditions | Lead Lists | customScript |  | `qa-airtable-automation--wflWfdxSpf2JclmDV.json` |
| Refresh Client Domain Exclusions | `wflnPA4oRH8fWqVQY` | deployed | recordMatchesConditions | Workspace IDs | customScript |  | `refresh-client-domain-exclusions--wflnPA4oRH8fWqVQY.json` |
| Search HeyReach for Email Campaigns | `wflBid7eZpAgmMLq6` | deployed | recordUpdated | Campaigns | customScript, findRecords |  | `search-heyreach-for-email-campaigns--wflBid7eZpAgmMLq6.json` |
| Send Campaign for Client Approval | `wflMznciieYULkvic` | deployed | recordUpdated | Campaigns | customScript, findRecords, sendEmail, sendToSlack, updateRecord |  | `send-campaign-for-client-approval--wflMznciieYULkvic.json` |
| Send Email (SL and EB) | `wflVhGbUEolHEGuk6` | deployed | inputReceivedFromConnection | Emails | customScript, findRecords, updateRecord |  | `send-email-sl-and-eb--wflVhGbUEolHEGuk6.json` |
| Send Message (Heyreach) | `wfl5rYBLakhCLIJ8l` | deployed | inputReceivedFromConnection | Emails | customScript, findRecords, updateRecord |  | `send-message-heyreach--wfl5rYBLakhCLIJ8l.json` |
| Send SMS (Twilo) | `wfl39LssdljHRDDY0` | deployed | inputReceivedFromConnection | Emails | customScript, updateRecord |  | `send-sms-twilo--wfl39LssdljHRDDY0.json` |
| Softr x Airtable Link copy | `wflxvTzBTn7tDuNmy` | deployed | recordCreated | Onboarding | findRecords, updateRecord |  | `softr-x-airtable-link-copy--wflxvTzBTn7tDuNmy.json` |
| Webhook to Make for WON | `wfljdbk1BZXSmpGZI` | deployed | recordUpdated | Emails | customScript, updateRecord |  | `webhook-to-make-for-won--wfljdbk1BZXSmpGZI.json` |
| When new user added to Softr x Airtable | `wfl5Rj3uBhdk3BP36` | deployed | recordCreated | Portal Users | customScript, findRecords, updateRecord |  | `when-new-user-added-to-softr-x-airtable--wfl5Rj3uBhdk3BP36.json` |

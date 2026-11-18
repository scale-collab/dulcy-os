# Dulcy Airtable base: schema

Base `appxqINt5XKw7a76A` (Dulcy). 53 tables, 1802 fields. Pulled read-only on 2026-11-17 (schema only, no records).

Full detail (formulas, links, select option IDs): `schema/dulcy-base.schema.json`. Interfaces and pages: `schema/dulcy-base.interfaces.json`.

## Tables

| Table | ID | Fields |
|---|---|---|
| [Portal Users](#portal-users) | `tbl8VWzIsWJYJfLUA` | 19 |
| [Onboarding](#onboarding) | `tbljhM1JmUwr99tu4` | 76 |
| [Workspace IDs](#workspace-ids) | `tblcjRBGJEWh5KgOt` | 139 |
| [Emails](#emails) | `tblADFhWhTcLrl1UY` | 138 |
| [Call Feedback](#call-feedback) | `tbljJ0uWryVMuilXn` | 15 |
| [Client Closed Deals](#client-closed-deals) | `tblObFlCC7BrdaruO` | 7 |
| [Templates](#templates) | `tblztB3d1fTIdOlMZ` | 3 |
| [API](#api) | `tblqFTOGyT6OjuY8i` | 2 |
| [Campaigns](#campaigns) | `tblAVAA6uBPaMj28P` | 307 |
| [Lead Lists](#lead-lists) | `tblVOg9BkPOMmnitt` | 137 |
| [Campaign Feedback](#campaign-feedback) | `tblX4NisPYHJkpZYW` | 11 |
| [Email Analytics](#email-analytics) | `tblVqkbJyd6be1lJH` | 30 |
| [Sequence Analytics](#sequence-analytics) | `tblmHKxDLELPkj5xk` | 18 |
| [Email Analytics Overview](#email-analytics-overview) | `tblZkEi6qylqfOj9Z` | 18 |
| [LinkedIn Campaigns](#linkedin-campaigns) | `tbl7s4Q7ccNy5aSSW` | 27 |
| [LinkedIn Analytics Overview](#linkedin-analytics-overview) | `tblTEPeaVSGcct8FY` | 17 |
| [AI Employee Calls (Legacy)](#ai-employee-calls-(legacy)) | `tblHDo4RQrYvIkDyj` | 17 |
| [Team Check Ins](#team-check-ins) | `tblg8bhXMK7uPiHn6` | 25 |
| [Email Accounts](#email-accounts) | `tblMSOBJ0wMgxSg4l` | 60 |
| [Inbox Placement Testing](#inbox-placement-testing) | `tblGjv6A5r7md3kxX` | 15 |
| [New Client Intake](#new-client-intake) | `tbljivFOoUW2nZ6FN` | 64 |
| [Documents](#documents) | `tblwo2vuDBBdOHFsz` | 8 |
| [Client Meetings](#client-meetings) | `tbldiv2czPkJ1zeQE` | 7 |
| [Client Invoices](#client-invoices) | `tblxGQqMzeEu23iHi` | 18 |
| [Client Tasks](#client-tasks) | `tblB97qvoidTSi9Vr` | 7 |
| [Tasks](#tasks) | `tblRBxm2N53331mIm` | 19 |
| [Client Notifications](#client-notifications) | `tblwJK1VB7affamrz` | 8 |
| [Email Bison Campaign Settings](#email-bison-campaign-settings) | `tbltzcefgnkb6AWR3` | 22 |
| [Content Channels (Alex Woung)](#content-channels-(alex-woung)) | `tblcSzvicm3wivvhh` | 58 |
| [Dulcy Internal SOPs](#dulcy-internal-sops) | `tblEmPw3dQZi7BrlS` | 5 |
| [Team Attendance](#team-attendance) | `tblmGO2C2l0eRNQ7u` | 8 |
| [Sales Data](#sales-data) | `tblmEyHVAXDRwPxN9` | 37 |
| [Sales Goals](#sales-goals) | `tbl9RIrdbapavGdI0` | 27 |
| [Executive Insights](#executive-insights) | `tblfCdONBpVWub6Zo` | 5 |
| [Sync Table](#sync-table) | `tblVGlYhqLc65UaH1` | 30 |
| [Content Clips](#content-clips) | `tblg1Tj9atyxN0piT` | 19 |
| [Domains](#domains) | `tblJHdcoT1x3vh3DN` | 48 |
| [Domain Purchase Requests](#domain-purchase-requests) | `tblU6OstDVWeuYBxL` | 32 |
| [Content Distribution](#content-distribution) | `tblDWJrmIcBJDykIP` | 18 |
| [Email Account Bulk Controls](#email-account-bulk-controls) | `tbl9diaQoQS0USoLn` | 13 |
| [Spam Remediation Queue](#spam-remediation-queue) | `tblaJZ3ru2TOiHOOM` | 14 |
| [Dulcy Reply Agent Settings](#dulcy-reply-agent-settings) | `tbl5nmzPUcNEBSWxH` | 40 |
| [Dulcy Reply Agent Events](#dulcy-reply-agent-events) | `tblHznksXyc3DZAUu` | 12 |
| [Content Automation Settings](#content-automation-settings) | `tblbG7YbCpi84tQYM` | 10 |
| [Content Story Sequences](#content-story-sequences) | `tblB0cnjeIlhW2sSj` | 17 |
| [Content Story Frames](#content-story-frames) | `tblRks0M8xnNa3XPr` | 14 |
| [Reply Analytics Daily](#reply-analytics-daily) | `tblxJEt3ECTnEqGpd` | 33 |
| [Reply Learning](#reply-learning) | `tblSnh6YlMTOFSE8l` | 12 |
| [Verification Performance](#verification-performance) | `tblem2vNdX0hzHdxg` | 17 |
| [[TEST ONLY] Verification Analytics Campaigns](#test-only-verification-analytics-campaigns) | `tblKov2oVCezASXDQ` | 9 |
| [[TEST ONLY] Verification Analytics Performance](#test-only-verification-analytics-performance) | `tblx9XtNmIgr0WjRR` | 24 |
| [Call Invoice Coverage](#call-invoice-coverage) | `tblz862FFd4SlDwG1` | 11 |
| [Contracts](#contracts) | `tblFhsgZ970B44r1s` | 55 |

## Portal Users

`tbl8VWzIsWJYJfLUA`

| Field | ID | Type | Options / formula |
|---|---|---|---|
| Name | `fldeUgIKgDSvskRub` | singleLineText |  |
| Email | `fldE01Huu5atFdpmX` | singleLineText |  |
| Password | `fldDpgfDL6egiRbK0` | singleLineText |  |
| Client Associated | `fldoeEJikSmNTW3Zl` | multipleRecordLinks | → Workspace IDs |
| ID (from Client Associated) | `fldCmYsa3eMK8XXHc` | multipleLookupValues |  |
| Client Record ID | `fldCnk7C3vM2J6kRV` | multipleLookupValues |  |
| onboarding_record_id | `fldf8IBQHjHUud7TV` | multipleLookupValues |  |
| Created | `fld62vgCKxNFg1gPX` | dateTime |  |
| Last Seen | `fldQK7YYlT52NFgjy` | dateTime |  |
| New Table | `fldnx5ua5fXWJTgzt` | singleLineText |  |
| PM copy | `fldUI4oCVkvuPM0aV` | singleLineText |  |
| PM copy | `fld6zReau6kUwroHc` | singleLineText |  |
| Team Attendance | `fldvmM7t63BG3qEZh` | singleLineText |  |
| Team Attendance 2 | `fldSNfEn7e3lBU5Yp` | singleLineText |  |
| Team Attendance 3 | `fld69GhwttGnUXDX8` | singleLineText |  |
| Team Attendance 4 | `fld7e77E2BNbBG3DJ` | singleLineText |  |
| Team Attendance 5 | `fldkL8AQZ4pzalXYn` | multipleRecordLinks | → Team Attendance |
| Tasks | `fldjRdSpdQEq3YHXZ` | multipleRecordLinks | → Tasks |
| Sales Data | `fldIymAJPtQJI46ac` | multipleRecordLinks | → Sales Data |

## Onboarding

`tbljhM1JmUwr99tu4`

| Field | ID | Type | Options / formula |
|---|---|---|---|
| Id | `fldpwGxyAiJFQDETA` | autoNumber |  |
| Record ID | `fldlyWAEf5BfOfXvl` | formula | `RECORD_ID()` |
| Company Name | `fldVkfXhGnNgKwDYN` | singleLineText |  |
| Workspace IDs | `fldNZEHEBArPZSvMZ` | multipleRecordLinks | → Workspace IDs |
| Website Link | `fld6EvR6lV0EnmVFK` | url |  |
| Domain | `fldb25eU2V0Wv7kgt` | formula | `LOWER(   REGEX_REPLACE(     REGEX_REPLACE(       REGEX_REPLACE(         {fld6EvR6lV0EnmVFK},         "^https?://",         ""       ),       "^www\\.",       ""     ),     "/.*$",     ""   ) )` |
| Record ID (from Workspace IDs) | `fldnLFon0XVyEYP5C` | multipleLookupValues |  |
| Full Name | `fldaC92hnYYPogUvw` | singleLineText |  |
| Who takes the sales calls on your team? (This will be who the outreach is sent on behalf of) | `fldgvimk1wMZjiqdW` | singleLineText |  |
| Profile Picture(s) for Email Accounts | `fldfk5dbCMmOzphAy` | singleLineText |  |
| Suggested Domains | `fldOgdWlZoDhMf3ZD` | multilineText |  |
| What EXACTLY do you sell? | `fld1AjmO7gSRAZTnw` | multilineText |  |
| Who EXACTLY is your Target Market? | `fldt14pabzQ15V55U` | singleLineText |  |
| How does your pricing work? | `fldhVMoa5gJ4fBhfB` | singleLineText |  |
| What is your risk reversal/guarantee? | `fldwswWg39Y34CcnG` | singleLineText |  |
| How long does it typically take clients to see results? | `fldTSO9lkDq3wTnMX` | singleLineText |  |
| Location(s) of your ideal clients? | `fldoM5rgmkctQWxmS` | singleLineText |  |
| Any other information you want to add about your offer? | `fldZya6OzjjwUz5Pr` | singleLineText |  |
| Do you have a Calendar? | `fldlJLGSZvNXtwrbD` | singleSelect | Yes, No |
| Please provide link below | `fldGfZGcQbaRpzdKU` | url |  |
| What problems typically cause someone to start looking for a solution like yours? | `fldi996B3unyxPEhw` | multilineText |  |
| How many sales appointments would you like to book per month? | `flds20AzmmjGKmU22` | singleLineText |  |
| What are some notable case studies/client success stories that you can share? | `fldw2xB6XiZLowwHI` | multilineText |  |
| What's your agency's CURRENT monthly revenue? | `fldKCtXxGgpSdXb2D` | singleLineText |  |
| LinkedIn Email address | `fldKXY0EQRQdn6EUV` | singleLineText |  |
| LinkedIn Password | `fld30MCMI88q4c3VE` | singleLineText |  |
| Company size of your ideal clients: | `fldtq9oNmDpGQJBS6` | multipleSelects | 1-10, 11-20, 21-50, 51-100, 101-200, 201-500, 501-1000, 1001-2000, 2001-5000, 5001-10000, 10000+ |
| Which CRM are you using? | `fldfM1fSpVYD3EGVM` | singleSelect | Hubspot, Salesforce, Pipedrive, Zoho, Close, ActiveCampaign, GoHighLevel, Monday.com, Other (Please specify) |
| 2FA secret key | `fldRvFwsA7NtTwG1e` | singleLineText |  |
| Dream Clients | `fldF4sn3RBUjgvuy3` | singleLineText |  |
| Do you have a list of prospects/old leads that you'd like for us to start with? | `fldMS7UQ2JXlfxHlH` | multipleAttachments |  |
| Do you have a list of contacts who we SHOULD NOT CONTACT? If so, please upload it here (make sure to include company website URLs): | `fldQBMOwu7adM4TQ2` | singleLineText |  |
| Job Title(s) of your ideal clients: | `fldW9QJs393tLxwxh` | singleLineText |  |
| Industry of your ideal clients: | `fld75VfkhG2sJLtj2` | multipleSelects | ACCOUNTING, ADVERTISING AND MARKETING, AGRICULTURE AND NATURAL RESOURCES, ALCOHOL AND TOBACCO, AUTOMOTIVE, BIG DATA AND ANALYTICS, BIOTECHNOLOGY, BLOCKCHAIN AND CRYPTOCURRENCY, BUSINESS PRODUCTS AND SERVICES, CLOUD COMPUTING, COMPUTER HARDWARE AND SEMICONDUCTORS, CONGLOMERATES SHELL AND HOLDING COMP |
| Additional Industry(s) of your ideal clients: | `fldq8qhOJAZo8jNxj` | singleLineText |  |
| Are there any industry(s) we should exclude: | `fldeFD6sQeMud0rXc` | singleLineText |  |
| Estimated Annual Revenue of your ideal clients: | `fld3yHDaw8GR6fE6r` | singleLineText |  |
| Is there anything else we should know about your ideal client? | `fld3CiMT5oshGMyHj` | singleLineText |  |
| Why do clients choose you instead of competitors? | `fldje1pp7U1qllFd1` | singleLineText |  |
| What's your DESIRED monthly revenue? Target date? Why? | `fldliuriQs0FrR2yT` | singleLineText |  |
| On average, how many sales appointment are you booking per month? | `fldAPVf9KrBGa1vTv` | singleLineText |  |
| Are there any additional team members that we should have communication with? | `fldSDFTGZLea7lQBH` | singleLineText |  |
| Last question - Is there anything else that you would like to mention before we get started? | `fldquRdtHtWSRLRqL` | singleLineText |  |
| Do you have app based 2FA enabled? | `fldN7dQJxB9NUKnr3` | singleSelect | Yes, No (Please, Enable It) |
| ci_password | `fldVSYmIVrxbJrEIo` | singleLineText |  |
| ci_user_name_email_pattern | `fldC5C53yiSgmtvDK` | singleLineText |  |
| Client Interviews/Testimonials/Case Studies | `fldZ8GmunvMUaaIvU` | multilineText |  |
| Sales Call Recordings | `fldTzgIl8Vk2jyHhR` | multilineText |  |
| onboarding_record_id | `fldNvc910Iiusp3UB` | formula | `RECORD_ID()` |
| Onboarded when | `fldXzgvvLUGoErYsi` | createdTime |  |
| AI Checker - Automation Purposes | `fldIjNqb5OUFyIs8Z` | formula | `{fldaC92hnYYPogUvw} & " " & {fldXzgvvLUGoErYsi}` |
| Last Modified | `flddct7YrB0beH2qQ` | lastModifiedTime |  |
| Walk us through your fulfillment process from beginning to end. | `fldBdGrbpf3ukfG8F` | multilineText |  |
| What does success look like for your clients? | `fldh6D7in0eg9LJgI` | singleLineText |  |
| Do you currently have an ESTABLISHED cold traffic offer? | `fldFl5TuTnjWEwVGR` | singleSelect | Yes, No (We will help you make one) |
| What could you realistically give away for free? | `fldTD7YpccQjjvtPa` | singleLineText |  |
| Do you already have a cold funnel in place? | `fldMtIOgjMdf3xtLy` | singleSelect | Yes, No (we will help you make one) |
| Do you have a sales framework for cold leads? | `fldHyHU4poFBH5DxD` | singleSelect | Yes, No (we will help you make one) |
| Have you successfully closed clients from outbound before? | `fldgLV2zWRIfBsmVa` | singleLineText |  |
| Email Address | `fld0aNQPMhyEZRhn5` | email |  |
| Created By | `fldEVeYYR913QLRnc` | createdBy |  |
| Please type out any RESULTS you've gotten for your clients. | `fldB3XJKm7TqnEEiC` | multilineText |  |
| Are there specific technologies, software, platforms, certifications, or characteristics your ideal clients usually have? | `fldBk15Div5IJon6i` | singleLineText |  |
| Are your ideal clients recently funded? | `fld0VGgkyZFQNOrUK` | singleLineText |  |
| Job Posting(s) of your ideal clients: | `fldVy5UgM9kiaMfsC` | singleLineText |  |
| What is your most recent CASE STUDY and what positive results did you achieve? | `fld4oUa5FBDvxpPmU` | multilineText |  |
| Before working with you, what were your clients doing to solve the problem your offer now solves? | `fldfvkDNaW5QMzH5o` | multilineText |  |
| How much time or energy were they spending on that approach? | `fldOMpPTJNmJ37zPi` | multilineText |  |
| How did that make them feel emotionally? | `fldEJMhX8CCGZufqL` | multilineText |  |
| What other tools, freelancers, or solutions did they try before choosing you? | `fldAdBmWK2J5ruX9y` | multilineText |  |
| Why do you think they were motivated to fix this at that specific time? | `fldDXy0LMnlqwf17K` | multilineText |  |
| How did they discover your product/service? | `fldCHn64bFSWPdC48` | multilineText |  |
| What did they find most appealing or different about your approach? | `fldTA3G38rSZMvp4t` | multilineText |  |
| What were their first impressions after speaking with you or reviewing your material? | `fldas6mdHqQMw7Bfo` | multilineText |  |
| After saying yes, what did they imagine day-to-day life would be like with your help? | `fldX1vSd4VVJMheNC` | multilineText |  |
| What are they able to do now that they couldn’t before? | `fldDmxM1ZLE4ryncT` | multilineText |  |

## Workspace IDs

`tblcjRBGJEWh5KgOt`

| Field | ID | Type | Options / formula |
|---|---|---|---|
| Name | `fld48x6Yg3v6RP30W` | singleLineText |  |
| ID | `fldO0DrfcpgxtpBw5` | number |  |
| Status | `fldSr8KQs90Uk2d26` | singleSelect | Active, Inactive |
| EmailBison API | `fld6bFQolVFg4Ub3N` | singleLineText |  |
| Slack Channel | `fldJvFMD9DkLRcpRs` | singleLineText |  |
| Logins | `fld081oco8NBbfI3H` | richText |  |
| Campaigns | `fldHvrSixRYc1H1UL` | multipleRecordLinks | → Campaigns |
| Email Accounts | `fld7HfkQ96FLZfbOm` | multipleRecordLinks | → Email Accounts |
| Portal Users | `flde3vFad1Mwd6hqj` | multipleRecordLinks | → Portal Users |
| Record ID | `fldHDstrCfiYt0mA3` | formula | `RECORD_ID()` |
| Onboarding | `fldbwnPMVNU24k7Dq` | multipleRecordLinks | → Onboarding |
| onboarding_record_id (from Onboarding) | `fldT9aDYkQdq0c8QE` | multipleLookupValues |  |
| Onboarding_form_submitted | `fldjcHlBqldvSCOgJ` | checkbox |  |
| Documents | `fldRvlkdcO1KA1SS5` | multipleRecordLinks | → Documents |
| Email Analytics Overview | `fldDLAUfXZqFOr1bf` | multipleRecordLinks | → Email Analytics Overview |
| PM | `fldam9bdBzFw3ngNx` | singleLineText |  |
| Templates | `fldHx85FrEd49g0oZ` | singleLineText |  |
| Created | `fldTdhPobFCnA8bpx` | createdTime |  |
| LinkedIn Analytics Overview | `fldP4ICB2IGqlu4hW` | multipleRecordLinks | → LinkedIn Analytics Overview |
| Client Tasks | `fldToVVd0q2uQVoVg` | multipleRecordLinks | → Client Tasks |
| Emails | `fldBIERK8oFuLLLFi` | multipleRecordLinks | → Emails |
| Total Interested Leads | `fldERLMTVYwba7VmI` | rollup |  |
| Total Calls Booked | `fldAYmHLX2O2myACm` | rollup |  |
| Interested Conversion | `fldxxhmVDAitWEVUW` | formula | `{fldAYmHLX2O2myACm} / {fldERLMTVYwba7VmI}` |
| Investment Per Call | `flddLqo1zshMFsU2l` | formula | `IF(   {fldAYmHLX2O2myACm} > 0,   {fldrq9j2SWUajvC23} / {fldAYmHLX2O2myACm} )` |
| Total Deals Closed | `fldcRcBAQnyeWAelT` | rollup |  |
| Closed Deal Value | `fldgRJvqhCPXZGbyu` | rollup |  |
| Calls Booked KPI (Internal) | `fldnkflMsZ51CGmMp` | number |  |
| Calls Booked Status (Internal) | `fldvl3L2a4Ylxrpdv` | formula | `IF(OR({fldnkflMsZ51CGmMp}=0, {fldnkflMsZ51CGmMp}=''), 0, {fldz8ODaxrMzMMLT5}/{fldnkflMsZ51CGmMp})` |
| Inbox Placement Testing | `fldYm6oQBJgNjtcE9` | multipleRecordLinks | → Inbox Placement Testing |
| Calls Booked KPI (from Onboarding) | `fldjDtmyAHs0KQxJw` | multipleLookupValues |  |
| Calls Booked - Last 30 days | `fldz8ODaxrMzMMLT5` | rollup |  |
| Calls Booked KPI (Client) | `fldE9V35NjgxcecBx` | number |  |
| Calls Booked Status (Client) | `fld9qh1WL5xahWySw` | formula | `IF(OR({fldE9V35NjgxcecBx}=0, {fldE9V35NjgxcecBx}=''), 0, {fldz8ODaxrMzMMLT5}/{fldE9V35NjgxcecBx})` |
| Total Investment | `fldrq9j2SWUajvC23` | rollup |  |
| Calls Made | `fldgRipFWAoJzxRVT` | rollup |  |
| Completed Calls | `fldTovsUqlE8XeaOI` | rollup |  |
| Answered Calls | `flderN6HRRehgnjaN` | rollup |  |
| Interested Calls | `fld6uJo9st4QqkttM` | rollup |  |
| Answered Rate | `fldrBBQjBzeBAUIQq` | formula | `{flderN6HRRehgnjaN} / {fldgRipFWAoJzxRVT}` |
| Interested Rate | `fld19J6gTcyKwnqBU` | formula | `{fld6uJo9st4QqkttM} / {flderN6HRRehgnjaN}` |
| Apollo URL's | `fldSUlGcVNUd1fcoR` | multipleRecordLinks | → Lead Lists |
| HeyReach ID | `fldLXrz8jrMuR22xQ` | singleLineText |  |
| RevReply Email ID | `fldihvHnUTWv7BBeX` | singleLineText |  |
| RevReply LinkedIn ID | `fldUwBzQvlrWJSY3r` | singleLineText |  |
| Apollo ID | `fldkyXUxZjUHuKmDd` | multipleLookupValues |  |
| AI Model ID (PRE) | `fldwVOgg77J5bm38g` | singleLineText |  |
| AI Model ID (APTR) | `fldb9OShDD1uIrIWi` | singleLineText |  |
| Email Signature | `fldYM5DhtHt6M4ppK` | richText |  |
| Cold Email | `fldTBTy6g0pbp6NVI` | checkbox |  |
| LinkedIn | `fldkcU05DfpslNctF` | checkbox |  |
| AI Employee | `fldfKS7zjKdajdx5i` | checkbox |  |
| Direct Mail | `fld0IP2wI2FPTvnCK` | checkbox |  |
| Client | `fldWmuAS5FMoQaUSu` | multipleRecordLinks | → Workspace IDs |
| Cold Traffic Offer | `fldWAdvAzoPxqW0Ut` | multilineText |  |
| Front End Offer(s) | `flde94SLnY3TDibbj` | multilineText |  |
| Back End Offer(s) | `fldKPi4HkTJTaMDwj` | multilineText |  |
| Outbound Risk Reversal | `fldUDxVml8BvjJdeU` | multilineText |  |
| Projects | `fldnfMXn6uHGJkTdy` | singleLineText |  |
| Executive Dashboard Data | `fldcRN2uUXqeOqzTT` | singleLineText |  |
| EmailGuard API | `fldYAjpeIvoIkhBnD` | singleLineText |  |
| HeyReach Workspace API | `fldpkIAiF8f5cPoih` | singleLineText |  |
| Documents copy | `fldypORV82KgNTrga` | multipleRecordLinks | → Client Meetings |
| Client Tasks copy | `fldrA9H1Q0xr7XziX` | singleLineText |  |
| Client Notifcations | `fldKj7rggdDnP9z6g` | multipleRecordLinks | → Client Notifications |
| Client Invoices | `fldsGTEj8VbmtsPcC` | multipleRecordLinks | → Client Invoices |
| From field: Workspace IDs | `fld4FgD9sTtQo8cOn` | multipleRecordLinks | → Workspace IDs |
| Tasks | `fldv0Khk6smoLAhoC` | multipleRecordLinks | → Tasks |
| Initial Payment Received | `fld4a9216boSXKCzu` | checkbox |  |
| Last Modified | `fldyvfc27CP3BgDvI` | lastModifiedTime |  |
| DiscoLike Exclusion Query ID | `fldrvOi88COOEPBGe` | singleLineText |  |
| Domain Exclusion Count | `flderjtfX21Q6bqpf` | number |  |
| Domain Exclusions Refreshed At | `fldJKF71Tn4ZConfh` | dateTime |  |
| Refresh Domain Exclusions | `fldlHJdnYJ3Y1akza` | checkbox |  |
| Client Start Date | `fldfO4aYldYhP2QYe` | date |  |
| Client End Date | `fldW7nm3W574dkjfN` | date |  |
| Monthly Fee | `fldv94snzU8CemHnn` | currency |  |
| Months Active | `fldCWLHyW7x2iSqkz` | formula | `IF(AND({fld91lSa5rBfLrIQM}="Paying Client",{fldfO4aYldYhP2QYe}),IF({fldSr8KQs90Uk2d26}="Inactive",IF({fldW7nm3W574dkjfN},MAX(0,ROUND(DATETIME_DIFF({fldW7nm3W574dkjfN},{fldfO4aYldYhP2QYe},'days')/30.43` |
| Estimated LTV | `fldPlB5g284ODyJDP` | formula | `IF(AND({fld91lSa5rBfLrIQM}="Paying Client",{fldv94snzU8CemHnn},{fldCWLHyW7x2iSqkz}),ROUND({fldv94snzU8CemHnn}*{fldCWLHyW7x2iSqkz},2),BLANK())` |
| Active Client Count | `fldDoTpqdhR8kTd0s` | formula | `IF(AND({fldSr8KQs90Uk2d26}="Active",{fld91lSa5rBfLrIQM}="Paying Client"),1,0)` |
| Active MRR | `fldnAGTm4zhbhLh32` | formula | `IF(AND({fldSr8KQs90Uk2d26}="Active",{fld91lSa5rBfLrIQM}="Paying Client"),{fldv94snzU8CemHnn},0)` |
| Client Health | `fldP9jkdKLwCFOBCU` | singleSelect | Healthy, At Risk, Needs Attention, Onboarding |
| Portal User Count | `fld4jUUIXGNPP0FdT` | formula | `COUNTA({flde3vFad1Mwd6hqj})` |
| Client Type | `fld91lSa5rBfLrIQM` | singleSelect | Paying Client, Internal, Free / Trial |
| End Date Confidence | `fldyOcOr7IdeQifTE` | singleSelect | Exact, Strong, Approximate |
| End Date Evidence | `fldyHRPVWr9FzmTJL` | multilineText |  |
| Actual Lifetime Revenue | `fldAtryUmpgeob46a` | currency |  |
| Xero Revenue Transactions | `fldgEopAOHUbdNAKZ` | number |  |
| Lifetime Revenue Source | `fldlfC5SeVvW5UOsH` | singleLineText |  |
| LTV Variance | `fldgQgWP2b5tSIdTY` | formula | `IF(AND({fldAtryUmpgeob46a}, {fldPlB5g284ODyJDP}), {fldAtryUmpgeob46a} - {fldPlB5g284ODyJDP})` |
| Average Monthly Collected | `fldZXvcJLZBz5ssPK` | formula | `IF(AND({fldAtryUmpgeob46a}, {fldCWLHyW7x2iSqkz}>0), {fldAtryUmpgeob46a}/{fldCWLHyW7x2iSqkz})` |
| Revenue Match Status | `fldBufLJCzXc0n9uh` | formula | `IF({fld91lSa5rBfLrIQM}!="Paying Client", "Not Applicable", IF({fldAtryUmpgeob46a}>0, "Matched", "Needs Review"))` |
| Inactive Reason | `fldaqQnTGUN22ljsB` | singleSelect | Paused, Churned, Completed Engagement, Non-payment, Business Closure, Unknown |
| Outstanding Receivables | `fld1NADsMRUOUcSKX` | currency |  |
| Last Xero Revenue Sync | `fldLsBD7nManJxLjI` | dateTime |  |
| Client Retained Indicator | `fldCAONMVWMr6gKhW` | formula | `IF(AND({fld91lSa5rBfLrIQM}='Paying Client',{fldSr8KQs90Uk2d26}='Active'),100,0)` |
| Client Churn Indicator | `fldN7YOdtFnRLD5NE` | formula | `IF(AND({fld91lSa5rBfLrIQM}='Paying Client',{fldSr8KQs90Uk2d26}='Inactive'),100,0)` |
| Lifetime Churn Rate | `fldLjsD1bHeLjwTsl` | formula | `IF({fld91lSa5rBfLrIQM}='Paying Client',IF({fldSr8KQs90Uk2d26}='Inactive',1,0),BLANK())` |
| Months Active (1 Decimal) | `fldcz4XPut4z7taXw` | formula | `IF(AND({fld91lSa5rBfLrIQM}="Paying Client",{fldfO4aYldYhP2QYe}),IF({fldSr8KQs90Uk2d26}="Inactive",IF({fldW7nm3W574dkjfN},MAX(0,ROUND(DATETIME_DIFF({fldW7nm3W574dkjfN},{fldfO4aYldYhP2QYe},'days')/30.43` |
| Months Active Dashboard | `fldT73HE6U5KynSj6` | number |  |
| New Clients This Month | `fld5JOndmfghZXuXY` | formula | `IF(AND({fld91lSa5rBfLrIQM}='Paying Client',{fldfO4aYldYhP2QYe},{fldfO4aYldYhP2QYe}>=DATETIME_PARSE(DATETIME_FORMAT(TODAY(),'YYYY-MM')&'-01'),{fldfO4aYldYhP2QYe}<DATEADD(DATETIME_PARSE(DATETIME_FORMAT(` |
| Clients Lost This Month | `fldlwDpPDDPy0zQft` | formula | `IF(AND({fld91lSa5rBfLrIQM}='Paying Client',{fldW7nm3W574dkjfN},{fldW7nm3W574dkjfN}>=DATETIME_PARSE(DATETIME_FORMAT(TODAY(),'YYYY-MM')&'-01'),{fldW7nm3W574dkjfN}<DATEADD(DATETIME_PARSE(DATETIME_FORMAT(` |
| Net Client Growth This Month | `fld1bGs7Sk1prQoAu` | formula | `(IF(AND({fld91lSa5rBfLrIQM}='Paying Client',{fldfO4aYldYhP2QYe},{fldfO4aYldYhP2QYe}>=DATETIME_PARSE(DATETIME_FORMAT(TODAY(),'YYYY-MM')&'-01'),{fldfO4aYldYhP2QYe}<DATEADD(DATETIME_PARSE(DATETIME_FORMAT` |
| Monthly Client Churn Rate | `fldigZVOxGuUarVkS` | formula | `IF(AND({fld91lSa5rBfLrIQM}='Paying Client',{fldfO4aYldYhP2QYe},{fldfO4aYldYhP2QYe}<=DATETIME_PARSE(DATETIME_FORMAT(TODAY(),'YYYY-MM')&'-01'),OR(NOT({fldW7nm3W574dkjfN}),{fldW7nm3W574dkjfN}>=DATETIME_P` |
| Client Health Reasons | `fldzdhW28bTklclIH` | multilineText |  |
| Last Client Health Check | `fldm7nUBRUNsbNzj6` | dateTime |  |
| Domains | `fldly2nuWIhnACobO` | multipleRecordLinks | → Domains |
| Domain Purchase Requests | `fldgnXoNHdjHSm8x1` | multipleRecordLinks | → Domain Purchase Requests |
| Email Account Bulk Controls | `fldt5mMFLouIBJwSA` | multipleRecordLinks | → Email Account Bulk Controls |
| Spam Remediation Queue | `fldoVGO9AMVMoiujs` | multipleRecordLinks | → Spam Remediation Queue |
| New Vertical Pivot | `fldY5tnIicC48grKq` | singleSelect | Enabled, Disabled |
| New Offer Pivot | `fld9HliYa3igd1Uri` | singleSelect | Enabled, Disabled |
| Run Inbox Placement Test | `fldgoNwpnP7qOiHKv` | formula | `"https://n8n.dulcy.io/webhook/REDACTED_PATH?workspace_id=" & {fldO0DrfcpgxtpBw5}` |
| Warmup Complete Notified At | `fldE786HiVM3NekW2` | dateTime |  |
| Sender Title | `fldIMJnjdGGAPotMW` | singleLineText |  |
| Brand Name | `fldTHTrYh0GCFeBLG` | singleLineText |  |
| Booked Meeting Exclusion Domains | `fldhBvFGLdI2pbICj` | multilineText |  |
| Booked Meeting Exclusion Overrides | `fldo3ts8c5umkDphi` | multilineText |  |
| Current Agreement | `fldsGYHaXaTcyo9Yy` | multipleRecordLinks | → New Client Intake |
| Current Agreement Type | `fldYdJ6BXOG3e0x2D` | multipleLookupValues |  |
| Agreement Count | `fldrS6GAORqqGvfa0` | count |  |
| Pay Per Call Eligible | `fldhNEWSO9X1m4Z7U` | formula | `IF(AND({fldrS6GAORqqGvfa0}=1,ARRAYJOIN({fldYdJ6BXOG3e0x2D})="Pay Per Qualified Call"),1,0)` |
| Billing Ready | `fldrrcUzyBCZ7LooW` | checkbox |  |
| Billing Rate | `fldgNhqHaOQjHYTYN` | number |  |
| Billing Currency | `fldNR6ftwgLzJcidj` | singleLineText |  |
| Billing Terms Source | `fldn7mo7EJdiN9JHz` | multilineText |  |
| Billing Email | `fld2wJOvMqJjLEYVW` | email |  |
| Xero Contact ID | `fldIZyOTDcNAz2llX` | singleLineText |  |
| Billing Hold Reason | `fldyLY0UhK7CB63Jv` | multilineText |  |
| Call Invoice Coverage | `fld316RbGhzkRXBLR` | multipleRecordLinks | → Call Invoice Coverage |
| Billing Cadence | `flduUWPYo44X78eXc` | singleSelect | Weekly Friday, Monthly |
| Monthly Billing Day | `fldCnylScu8v8SabN` | number |  |
| Billing Time | `fldrlhNv9oo4DsfrM` | singleLineText |  |
| Billing Timezone | `fld5q6H7UnURsC0j4` | singleLineText |  |
| Short Month Policy | `fldr7eQPnU7VDmoko` | singleSelect | Last Day |
| Invoice Delivery Route | `fldPi4JjLMmOVkQTM` | singleSelect | Ramp, Xero Email |
| Invoice Delivery Instructions | `fld9KOGQFlzymOeHH` | multilineText |  |
| Payment Due Days | `fldNv3tdYjYLSMlzQ` | number |  |
| Contracts | `fldUaWwL5SpcGlRdq` | multipleRecordLinks | → Contracts |

## Emails

`tblADFhWhTcLrl1UY`

| Field | ID | Type | Options / formula |
|---|---|---|---|
| Leads Email | `fldVkWkLFCGP9O1Aw` | email |  |
| Leads Name | `fldQAcnN9PrbL7R81` | singleLineText |  |
| Pipeline Stage | `fldSuQyvPM3IlS5oD` | singleSelect | New Interested, In Conversation, Booked Meeting, Completed Meeting, Closed Deal, Closed -- Not Moving Forward, Lost |
| Subject Line | `fldNdJB5rvVpf8V9M` | singleLineText |  |
| Latest Reply | `fldjG76LvUTv60Pzj` | richText |  |
| Lead Status | `fldr2uNiscZfeCNiT` | singleSelect | Wrong Person, Out Of Office, Information Request, Do Not Contact, Not Interested, Meeting Request, Interested, Untracked Spam, Bounced, Info Request |
| Email Sending Provider | `fldD5cEvVI13RUIou` | singleSelect | Google, Outlook, Custom Mail Server, Zoho, Mimecast, Proofpoint, Barracuda, Sophos, EmailBison |
| Master Inbox | `fldAouq4AgYpPN5DO` | button |  |
| Last Email Sent | `fldE9bxKtmeRsvG9f` | singleSelect | Last Email Sent By Dulcy, Last Email Sent By Prospect, REDACTED_EMAIL, Custom Reply |
| Push To Client Reply | `fldzd2bHc5XMGidFk` | singleSelect | Sending to Client, Sent to Client, Client Responded, Client Response Sent |
| Last Reply | `fldvaTgxJqILSOuQX` | lastModifiedTime |  |
| Current Time | `fldqkU3W216f71LhL` | formula | `NOW()` |
| Last Reply Since | `fld6piNCeEc0lAOHf` | formula | `MAX(0, DATETIME_DIFF({fldqkU3W216f71LhL}, {fldvaTgxJqILSOuQX}, 'minutes')) ` |
| Unattended Reply Time: | `fldAVVSiwKiVvAWjL` | formula | `CONCATENATE("\"", {fldr2uNiscZfeCNiT}, "\" ", "for ", {fld6piNCeEc0lAOHf}, " minutes") ` |
| Inbox Email | `fldxUxP1jBXt3u7dl` | email |  |
| Campaign Name | `fldEv7oM5BJPKJpiR` | singleLineText |  |
| Custom Reply | `fldCfgm35ZqyVe9xm` | multilineText |  |
| Status timestamp | `fldwa9Wrdtu0iJum3` | lastModifiedTime |  |
| Conversation History | `fldYocEhrAzRUw9sA` | multilineText |  |
| Last Lead Interaction | `fldntFBRwvkNU0JC7` | lastModifiedTime |  |
| lead + camp | `fldqEAaFkZ2M5Lt5T` | formula | `{fldVkWkLFCGP9O1Aw} & " - " & {fldEv7oM5BJPKJpiR} ` |
| reply_uuid | `fldT2Nvl3qPmSMsgb` | singleLineText |  |
| Master Inbox Link | `fld2O5QJTMWuon07S` | formula | `"https://send.dulcy.io/inbox?reply_uuid=" & {fldT2Nvl3qPmSMsgb}` |
| Conversation History (LinkedIn) | `fldNro9b4pwGpSMCC` | multilineText |  |
| Latest Reply (LinkedIn) | `fldD5fmGNibdKHSpt` | multilineText |  |
| Lead Status (LinkedIn) | `fldkDA7b1UxLAlA81` | singleSelect | Wrong Person, Out Of Office, Information Request, Do Not Contact, Not Interested, Meeting Request, Interested, Untracked Spam |
| Master Inbox (LinkedIn) | `fld02TicQgpkFZFqC` | button |  |
| Master Inbox Link (LinkedIn) | `fldbaiyoD6d2kdNBS` | formula | `"https://app.heyreach.io/app/inbox/" & {fldn8061QIRjA57DF} & "/" & {fldHMkE8BHLK79MOv}` |
| Last Message Sent (LinkedIn) | `fld7jpK3tgsbX0fTw` | singleSelect | Last Email Sent By Dulcy, Last Email Sent By Prospect |
| Custom Reply (LinkedIn) | `fld1NKr1MMJ1GCNNO` | multilineText |  |
| sender_id | `fldn8061QIRjA57DF` | number |  |
| convo_id | `fldHMkE8BHLK79MOv` | singleLineText |  |
| campaign_idlinkedin | `fldKmUjCCmBAsrJcO` | number |  |
| workspace_id | `fldkBI4eHyZCZiOWt` | singleLineText |  |
| list_id | `fld9whaU6BOcX7Wb7` | number |  |
| lead_idlinkedin | `fld2Iz1wBhvVqCE2z` | singleLineText |  |
| Opportunity Status | `fldfPPfvAoXw04LVs` | singleSelect | LOST, WON |
| Opp Last Modified | `fldyV4GjdXt6vadxb` | lastModifiedTime |  |
| Date of Call Booked | `fldTFmYUnIXPxgJQS` | date |  |
| campaign_id | `fldv0o5rhmd7jXDrt` | singleLineText |  |
| lead_id | `fldv66oGZQQ9Qscmb` | number |  |
| email_stats_id | `flds1ZqBq2ZW6dVBr` | singleLineText |  |
| reply_message_id | `fldvARFWnr4H2wC8V` | singleLineText |  |
| Templates | `fld2IjVEsAijZUjPl` | multipleRecordLinks | → Templates |
| Template Body | `fld4g8MGR5EpCMH3b` | multipleLookupValues |  |
| CC (Optional) | `fldGkiO630UgVCnv5` | email |  |
| Bounce Type | `fldZBjkt6nS9Ezupd` | singleSelect | Hard Bounce, Soft Bounce |
| Bounce Code | `fldXVoZUzByVTFmqo` | singleSelect | 554, 553, 552, 551, 550, 452, 451, 450, 421, Unk, 454, 521, 479, 503, 525, 528, 571, 500, 517, 501, 530 |
| Linkedin URL | `fldlC9uaoYyYwFvDz` | singleLineText |  |
| linkedin_url | `fldzzN0j8czZ1RnPc` | formula | `IF(   RIGHT(     IF(       LEFT({fldlC9uaoYyYwFvDz}, 7) = "http://",         "https://" & MID({fldlC9uaoYyYwFvDz}, 8, LEN({fldlC9uaoYyYwFvDz}) - 7),         {fldlC9uaoYyYwFvDz}     ), 1   ) = "/",   L` |
| Phone Number | `fld8K4zasLt6aaRfB` | phoneNumber |  |
| AI Model ID (PRE) | `fldgYXGaNqOXv1fGq` | singleLineText |  |
| AI Model ID (APTR) | `fldaX71fUb5SMxZRg` | singleLineText |  |
| Sent From Number | `fldMkQICFPIhxnpjf` | phoneNumber |  |
| AI Called? | `fld1B1CKOYoScfm5B` | singleLineText |  |
| Call ID | `fldtTiMUSxDkIIKL1` | singleLineText |  |
| Call Recording | `fldqSTyR7HK1TYCzf` | singleLineText |  |
| Call Transcript | `fldwbdXG4b1UGOxUC` | singleLineText |  |
| DNC | `fldbme5e9wDtnVwrx` | checkbox |  |
| Times Called (Identifier) | `fldFzjStaAbNlUpVF` | number |  |
| Follow Up Counter | `fldDCjl2mVNXBiT0n` | number |  |
| SMS Latest Reply | `fldZ5IqKrmEK5VftZ` | multilineText |  |
| SMS Conversation History | `fldkoeDCrzxLiFP7D` | multilineText |  |
| SMS Custom Reply | `fld7omiYDXqSkRDMy` | multilineText |  |
| Last SMS Sent | `fldKMkzXPIxoDN7BG` | singleSelect | Last Email Sent By Dulcy, Last Email Sent By Prospect |
| Call Status | `fldIEelM8lYXbOQc2` | singleSelect | Answered Call [INTERESTED (Booked Appointment)], Answered Call [INTERESTED (Didn't Booked Appointment)], Answered Call [BUSY (Call-Back Requested)], Answered Call [BUSY (No Call-Back Requested)], Answered Call [NOT INTERESTED], Answered Call [TURNED DNC], Answered Call [NONE], Call Failed, Reached V |
| convo_history_plain | `fldGT7ve1zwbro3ox` | multilineText |  |
| Company Name | `fldRYOE8NaSKxs9tB` | singleLineText |  |
| Lead Created | `fldkOYWRjEEfezDkC` | createdTime |  |
| ESP | `fldBNI5MPeDfMELjd` | singleLineText |  |
| Workspace ID (Bison) | `fldCjo0mB0snziNZQ` | singleLineText |  |
| Workspace ID Formula | `fldRvg1dY1KULcNcK` | formula | `VALUE({fldCjo0mB0snziNZQ})` |
| Reply Explanation | `fld3OXhmjYmwkUAAK` | multilineText |  |
| Call Feedback | `fld3YSJ9JV7976gYP` | multipleRecordLinks | → Call Feedback |
| Call Status (from Call Feedback) | `fldwGQvcJUG2Z2jVE` | multipleLookupValues |  |
| How was the call? (from Call Feedback) | `fldv91vJ9Hz3do3gs` | multipleLookupValues |  |
| Notes (from Call Feedback) | `fldgMNSHryD1hVDOz` | multipleLookupValues |  |
| Link to sales call (from Call Feedback) | `fldzoybPNOLGMLGJE` | multipleLookupValues |  |
| Client Closed Deals | `fldmT4YMjezdIGFfw` | multipleRecordLinks | → Client Closed Deals |
| Deal Value (USD) (from Client Closed Deals) | `fldbhVeA9PUvh2P3q` | multipleLookupValues |  |
| Deal Closed Date (from Client Closed Deals) | `fldVCbtGYE2qlRSkD` | multipleLookupValues |  |
| Deal Type (from Client Closed Deals) | `flddHkdR54aLGswLQ` | multipleLookupValues |  |
| Why They Said Yes (from Client Closed Deals) | `fldlzyWACLCUN1RRk` | multipleLookupValues |  |
| OOO - Back In The Office - Date | `fldu8kQYBvVoqxq9T` | date |  |
| OOO - Back In The Office - Days Left | `fld0Kqhru7vqxOuRe` | formula | `DATETIME_DIFF({fldu8kQYBvVoqxq9T}, TODAY(), 'days')` |
| OOO - Subsequence Email Sent | `fldRCbUTcTgEFwnSm` | checkbox |  |
| OOO - First Name | `fldMK8ZVPYiZVPKWh` | singleLineText |  |
| duplicate_for_tests | `fld7BsWnDpprOkB5h` | singleLineText |  |
| skip_request_call_feedback | `fldUFM7ev0B3nvsgB` | checkbox |  |
| internal_call_feedback_url_softr | `fldKyAHE0QV6IKJsL` | formula | `'/call-feedback-form?prefill_lead=' & RECORD_ID()` |
| internal_close_deal_url_softr | `fldo7ZyNc9qEEyJwF` | formula | `'/close-a-deal?prefill_lead=' & RECORD_ID()` |
| Clients Table | `fldtPAlC0MDPHTWcl` | multipleRecordLinks | → Workspace IDs |
| domain exclusion | `fldkakude861a1PxU` | formula | `RIGHT({fldVkWkLFCGP9O1Aw}, LEN({fldVkWkLFCGP9O1Aw}) - FIND("@", {fldVkWkLFCGP9O1Aw}))` |
| Alternative Contact Email | `fld3btiJYts1eLJFa` | aiText |  |
| Alternative Email: Automation | `fldqGLoQQasBw4Dto` | formula | `IF(   {fld3btiJYts1eLJFa},   {fld3btiJYts1eLJFa},   "No email found" ) ` |
| Email sent to alternative email | `fldp9PPhWuxYKHeNN` | richText |  |
| Alternative Contact Name | `fldCDGcTRfsZc6zA8` | multilineText |  |
| Latest Reply Time | `fldb1GEPgDTyJPm2v` | lastModifiedTime |  |
| Send alt email | `fld7lWph2AkRQqtPa` | checkbox |  |
| Subject for alt email | `fldXyhJdaLygDLiJG` | multilineText |  |
| Last Sent From | `fldD175mMHmxoGw37` | singleSelect | Airtable, Outside Airtable |
| last_updated_time | `fldeZA9SYmNjijDqS` | lastModifiedTime |  |
| in conversation trigger | `fldw9nw2L3JenTWqv` | checkbox |  |
| Campaign | `fldo7dscqE4vDjOpJ` | multipleRecordLinks | → Campaigns |
| Sales Data | `fld8xN91v9QnR8qE4` | multipleRecordLinks | → Sales Data |
| Dulcy Reply Agent State | `fldOfNaPJfpJLcInm` | singleSelect | Received, Drafting, Needs Approval, Approved, Scheduled, Sending, Sent, Skipped, Suppressed, Paused, Failed, Thread Complete |
| Dulcy Reply Agent Intent | `fldSgiv4CLnRBEJGc` | singleSelect | Interested, Info Request, Meeting Request, Cost Objection, Process Objection, Not Interested, Do Not Contact, Out of Office, Check Back Later, Referred, Wrong Person, Automatic Reply, Other |
| Dulcy Reply Agent Confidence | `fldeDQuwnq45HEep9` | percent |  |
| Dulcy Reply Agent Draft | `fldiokFlOaUEEs2qX` | multilineText |  |
| Dulcy Reply Agent Policy Decision | `fldkfrqE1Xng2mftd` | multilineText |  |
| Dulcy Reply Agent Due At | `fldgqdIguhudcKI8Z` | dateTime |  |
| Dulcy Reply Agent Human Action | `fldvdJBtL4ez5lbjN` | singleSelect | None, Approve Draft, Send Edited Reply, Skip, Pause, Resume |
| Dulcy Reply Agent Workspace Record ID | `fldaSgBchAb4KiIZS` | singleLineText |  |
| Dulcy Reply Agent Event ID | `fldIe5tgtL4OVeJAj` | singleLineText |  |
| Dulcy Reply Agent Sender Email ID | `fld2MljJektQP13d4` | singleLineText |  |
| Dulcy Reply Agent Attempt Count | `fldgHbYqxm3YfPkA1` | number |  |
| Dulcy Reply Agent Sent At | `fldbsojFueApMnmSy` | dateTime |  |
| Dulcy Reply Agent Last Error | `fldiM9YjXlyojPSpk` | multilineText |  |
| Dulcy Reply Agent Updated At | `fldTn2Eth51XolDMg` | dateTime |  |
| Dulcy Reply Agent Suppression Reason | `fldwhZFWvFSrvvG2P` | multilineText |  |
| Dulcy Reply Agent Follow-up Type | `fldDB9nVzj6mSprZP` | singleSelect | None, Out of Office, Check Back Later, No Response |
| Reply Ownership | `fldtWgoLnMFX7DFj8` | singleSelect | Dulcy Agent, Handoff |
| First Inbound Reply At | `fld13kyYbCsckb6BI` | dateTime |  |
| First Response At | `fld5ApgrrxDTJgXgp` | dateTime |  |
| Meeting Booked At | `fld7kOIDWTVycZtdA` | dateTime |  |
| Touchpoints to Meeting | `fldleB6TDMnnJ5pJZ` | number |  |
| Conversation History Backup - 2026-10-20 | `fldPBqRcg2d2vUiz8` | richText |  |
| Client Handling | `fldztj8riBd1MHclA` | checkbox |  |
| Reply Category | `fld2EkyARl7blJklV` | formula | `IF(OR({fldSgiv4CLnRBEJGc}="Not Interested",{fldSgiv4CLnRBEJGc}="Do Not Contact"),"Not Interested",IF(OR({fldSgiv4CLnRBEJGc}="Out of Office",{fldSgiv4CLnRBEJGc}="Referred",{fldSgiv4CLnRBEJGc}="Check Ba` |
| Courtesy Reply Sent At | `fldhLwoSv8rHzVP5k` | dateTime |  |
| Reply Feedback | `fld5XBYEFeSimSIyp` | multilineText |  |
| Verification Provider | `fldJgGQYVOey8uAoe` | singleLineText |  |
| Email Type | `fld8rDRRhFLfgfs9r` | singleLineText |  |
| Verification Path | `fldLxXGcd0z3GwZNs` | singleLineText |  |
| Duplicate Cleanup Archive | `fldv2Fme7RGnuDqZ8` | multilineText |  |
| Original Campaign Email | `fld992YHKy4srv55n` | email |  |
| Call Invoice Coverage | `fldZMdNTg04cQFbfd` | multipleRecordLinks | → Call Invoice Coverage |
| Dulcy Reply Agent Last Inbound Event ID | `fldy284s0aaXCZaa7` | singleLineText |  |

## Call Feedback

`tbljJ0uWryVMuilXn`

| Field | ID | Type | Options / formula |
|---|---|---|---|
| lead | `fldPDcQp7z50dopLN` | singleLineText |  |
| Call Status | `fldXNEJcG9LUnR73H` | singleSelect | Qualified, Unqualified, No Show, New Date, (Internal) Don't Track This Call |
| How was the call? | `fld1KGADNp3pX2mLi` | rating |  |
| Notes | `fldZXCeH23P9azJqb` | multilineText |  |
| Link to sales call | `fldIMEgJzXPjaSCp2` | singleLineText |  |
| Emails | `fldfSyqD5IEoRy2w7` | multipleRecordLinks | → Emails |
| Workspace ID Formula (from Emails) | `fldiZYJuFW6Sa4wN5` | multipleLookupValues |  |
| Subject Line (from Emails) | `fld2MAlObjKyQw4LC` | multipleLookupValues |  |
| Latest Reply (from Emails) | `fldw87zyZwgJn48iB` | multipleLookupValues |  |
| Campaign Name (from Emails) | `fld6p6XAvBCiaSorb` | multipleLookupValues |  |
| Conversation History (from Emails) | `fldJLfUThEFNk7MuQ` | multipleLookupValues |  |
| New Call Date | `fldsgmVQKkbAoTvsE` | date |  |
| Call Made When | `fldKRdKwzeOHvYM7n` | createdTime |  |
| Client | `fldCDwVpzBiQBN8qw` | singleCollaborator |  |
| Created | `fld2Vc0nViSuJ0jwb` | createdTime |  |

## Client Closed Deals

`tblObFlCC7BrdaruO`

| Field | ID | Type | Options / formula |
|---|---|---|---|
| lead | `fldOiKKVLzBQ5UPMj` | singleLineText |  |
| Deal Value (USD) | `fldlDCUqZHM4lci6A` | number |  |
| Deal Closed Date | `fldpzEEcRXaLPbatb` | date |  |
| Deal Type | `fldC4MEYuOALLMasQ` | singleSelect | Monthly Retainer, One-time Project, Pilot / trial, Annual contract, Pay-per-result, Other |
| Why They Said Yes | `fld8azgjeA3IqTuwa` | multilineText |  |
| Emails | `flde9Y79JLlFxKdEv` | multipleRecordLinks | → Emails |
| Created | `fldDfY4vXJygKmDeT` | createdTime |  |

## Templates

`tblztB3d1fTIdOlMZ`

| Field | ID | Type | Options / formula |
|---|---|---|---|
| Name | `fld8vRiwO88q1OJvy` | singleLineText |  |
| Template Body | `fldtfoYCTuGu5gjej` | richText |  |
| Main | `fldfWL1x4GDhFuHa1` | multipleRecordLinks | → Emails |

## API

`tblqFTOGyT6OjuY8i`

| Field | ID | Type | Options / formula |
|---|---|---|---|
| Key | `fldgLpFMZmYPMIReL` | singleLineText |  |
| Name | `fldJCOTWBPljdGdLh` | multilineText |  |

## Campaigns

`tblAVAA6uBPaMj28P`

| Field | ID | Type | Options / formula |
|---|---|---|---|
| Name | `fldSsb4QjS9UyvKhj` | singleLineText |  |
| Campaign Status | `fldZABZwE9SmnwMv3` | singleSelect | Draft, Active, Inactive, Emails Generated, Spintax Generated, Uploaded, Completed, Waiting for Approval |
| Total Leads | `fldbYOfqWk4KrNgfz` | number |  |
| Total Leads Contacted | `fld8nKHhBCV8UFm0G` | number |  |
| Total Leads Remaining | `fld9zg5aC7o1rbg4o` | number |  |
| Progress | `fldGM1f8fNNu6ODo2` | percent |  |
| progress_internal | `fldsoEGNRt01usneY` | formula | `{fldGM1f8fNNu6ODo2}*100` |
| Emails Sent | `fldDmaS8NZF3j0ZBY` | number |  |
| Unique Replies | `fldqSxElCOm0QN4kh` | number |  |
| Unique Replies % | `fldjZzJHEuIQoMUbb` | formula | `IF(AND({fld8nKHhBCV8UFm0G}, {fld8nKHhBCV8UFm0G} > 0), ROUND(({fldqSxElCOm0QN4kh} / {fld8nKHhBCV8UFm0G}) * 100, 2), 0)` |
| Unique Replies Data | `fldoY2XU0mz33L0sS` | formula | `{fldqSxElCOm0QN4kh} & " (" & {fldjZzJHEuIQoMUbb} & "%" & ")"` |
| Bounced | `fld3MHVEqXgHimKom` | number |  |
| Bounced % | `fldiLOzbllDI8mn7C` | formula | `IF(AND({fld8nKHhBCV8UFm0G}, {fld8nKHhBCV8UFm0G} > 0), ROUND(({fld3MHVEqXgHimKom} / {fld8nKHhBCV8UFm0G}) * 100, 2), 0)` |
| Bounced Data | `fldKEvZR0qkhiepcq` | formula | `{fld3MHVEqXgHimKom} & ' (' & {fldiLOzbllDI8mn7C} & "%" & ")"` |
| Interested | `fldSRXRCC0x2AhX9h` | number |  |
| Interested % | `fldPx4lkp0XeXtamH` | formula | `IF(AND({fldqSxElCOm0QN4kh}, {fldqSxElCOm0QN4kh} > 0), ROUND(({fldSRXRCC0x2AhX9h} / {fldqSxElCOm0QN4kh}) * 100, 2), 0)` |
| Interested Data | `fld31Z20ar3plBXdG` | formula | `{fldSRXRCC0x2AhX9h} & ' (' & {fldPx4lkp0XeXtamH} & "%" & ")"` |
| Meetings Booked | `fldoUuw5JDk0L264W` | number |  |
| Meetings Booked % | `fldTFkLcWvTI5Zrex` | formula | `IF(AND({fldSRXRCC0x2AhX9h}, {fldSRXRCC0x2AhX9h} > 0), ROUND(({fldoUuw5JDk0L264W} / {fldSRXRCC0x2AhX9h}) * 100, 2), 0)` |
| campaign_workspace_id | `fldQjybcwloD9dZxS` | multipleLookupValues |  |
| ID | `fldxSETE3D66RyWRH` | number |  |
| Client | `fldl5bZ644djPsBmN` | multipleRecordLinks | → Workspace IDs |
| Lifecycle | `fld9uXm3prQKN7utY` | formula | `IF(   OR(     {fldZABZwE9SmnwMv3} = "Inactive",     {fldZABZwE9SmnwMv3} = "Completed"   ),   "Done",   IF(     OR(       {fldJpLsGPwKlap4qV} = 0,       {fldJpLsGPwKlap4qV} = BLANK()     ),     "Needs ` |
| Script Copy Email 1 (Review) | `fldjnYRokcvObXphA` | multilineText |  |
| Campaign Body 1 Version 1 | `fldIX1lC9HGgbIaSh` | richText |  |
| create_spintax | `fldsvgKf6U5zDOygf` | checkbox |  |
| Lead List | `fld5weZ6ED31dBlaz` | multipleRecordLinks | → Lead Lists |
| Trigger Automation | `fldtLN2riGj4DNoOp` | checkbox |  |
| Status Last Modified | `fldnHjTrnRPfEqM4e` | lastModifiedTime |  |
| Campaign Overview | `fldflgCY0gIMrBi04` | formula | `'/campaign-review?lead=' & RECORD_ID()` |
| Emails | `fldCQ8reVzYpBCmua` | multipleRecordLinks | → Emails |
| Workflow Stage | `fldOVJmlGWxW1dveo` | singleSelect | Strategy Draft, Internal Review, Client Review, Changes Requested, Approved, Spintax in Progress, Build Ready, Launch Ready, Live |
| Email Accounts | `fldi906rwZ9YOpU64` | multipleRecordLinks | → Email Accounts |
| Bison Action | `fld7n4KEnvaPMDbt2` | singleSelect | Launch, Pause, Delete |
| Sequence Analytics | `fldB7PFTIMBVot102` | multipleRecordLinks | → Sequence Analytics |
| Final Lead Count | `fldJpLsGPwKlap4qV` | multipleLookupValues |  |
| Target Industries | `fldBvCyKSzeK2Cz9A` | multipleLookupValues |  |
| Geographic Targeting | `fldN9uic8Pf5ELaBo` | multipleLookupValues |  |
| Company Size | `fldeuraNTe1vFfre5` | multipleLookupValues |  |
| Target Titles | `fldRmUiHXsg4pxzvi` | multipleLookupValues |  |
| Sender Title (from Client) | `fld3Zqy3UmKpOYZNI` | multipleLookupValues |  |
| Processing Status | `fldCebt3IMI8ZxdQq` | singleSelect | Running, Completed, Failed, Needs review |
| Workflow Message | `flduYPLoUQk94uUWA` | multilineText |  |
| Workflow Error | `fld1ZYViMpvLDoBy2` | multilineText |  |
| Run ID | `fldCsuOWg1BVV2rAz` | singleLineText |  |
| Started At | `fldqKPdzUqppbItvX` | dateTime |  |
| Completed At | `fldzjGuki2WoS1LBY` | dateTime |  |
| Updated At | `fldcKcLrYdjEi5af7` | dateTime |  |
| slack id | `fldSmLxrMuzTaSF4Y` | multipleLookupValues |  |
| Meetings Booked Ratio | `fldEMCGUc1k53SczT` | formula | `ROUND(({fldSRXRCC0x2AhX9h} * 0.2), 2)` |
| Pace? | `fldPZEMQ6gjxo9EDp` | formula | `IF({fldoUuw5JDk0L264W} >= {fldEMCGUc1k53SczT}, "Yes", "No")` |
| Meetings Booked Data | `fldqQDM6C7Rrt8oHl` | formula | `{fldoUuw5JDk0L264W} & ' (' & {fldTFkLcWvTI5Zrex} & "%" & ")"` |
| Created At | `fldC17C15viNdUAyN` | createdTime |  |
| Campaigns - Monthly | `fldSvhWNolP8Qz7pS` | singleLineText |  |
| Campaigns - Monthly copy | `fld4C6egUS25bfduq` | multipleRecordLinks | → Email Analytics |
| Status (from Client) | `fldK8ZgIdbYx8YZ4q` | multipleLookupValues |  |
| ID (from Client) | `fldVatYaMDpm1uVlR` | multipleLookupValues |  |
| Record ID (from Client) | `fldnkfTlyMnogZGUX` | multipleLookupValues |  |
| EmailBison API (from Client) | `fldlb6cfn7cGkgsB0` | multipleLookupValues |  |
| Campaign Analytics copy | `fld2QBhHhxC69H0qH` | singleLineText |  |
| LinkedIn Campaigns | `fldKl1lGrxaMv55NV` | multipleRecordLinks | → LinkedIn Campaigns |
| Campaign ID (from LinkedIn Campaigns) | `fldXZzwbsOStyZRlY` | multipleLookupValues |  |
| Skip Bounce Notifications | `fldWNVUvrpLLDXITC` | checkbox |  |
| Campaign Approach | `fldclFGDzjg4nvfxL` | singleSelect | Offer Validation, Case Study, Risk Reversal, Lead Magnet, Direct Offer, Loom Video, Market Research, Education-Based, Likihood, Custom (Alexander Only) |
| Campaign Prep Date | `fldMyRtIz3Zm26oiH` | date |  |
| Estimated Launch Date | `fldhyq0anpSO1r0bV` | date |  |
| Campaign Thesis | `fldlixHfhzrd7nuSc` | richText |  |
| Email Analytics copy | `fldYzWzRGQcKxEWav` | singleLineText |  |
| Campaign Lead List | `fldEN25silh1TWs1h` | url |  |
| Subject Line Email 1 (Review) | `fldZTtdvwRV53voZE` | singleLineText |  |
| Subject Line Email 2 (Review) | `fldAikx1V83MsK3Ql` | singleLineText |  |
| Script Copy Email 2 (Review) | `fldw7AQWalsiisKrM` | multilineText |  |
| Subject Line Email 3 (Review) | `fldu2xpTQFuuyU71Q` | singleLineText |  |
| Script Copy Email 3 (Review) | `fld6U4bB1335Ac5vM` | multilineText |  |
| Subject Line Email 4 (Review) | `fldFrZUqdTeydSTUV` | singleLineText |  |
| Script Copy Email 4 (Review) | `fldJ8gNIksLd8WZ8t` | multilineText |  |
| Campaign Email 1 Subject Version 1 | `fldy3ufjXKaj3kuyV` | singleLineText |  |
| Campaign Email 2 Subject | `fldsWFQ4rPqSSUVqN` | singleLineText |  |
| Campaign Body 2 Version 1 | `fldRL9Q0XLFlJ9Mkn` | richText |  |
| Campaign Email 3 Subject | `fldOea7FqzLEONcDS` | singleLineText |  |
| Campaign Body 3 Version 1 | `fld2unmibesFQ2Sqc` | richText |  |
| Campaign Email 4 Subject | `fldlpfpmRywwxorso` | singleLineText |  |
| Campaign Body 4 Version 1 | `fldLWnxQ1MJqzuJdw` | richText |  |
| Email Analytics Overview | `fld8wqlDMdhkc2bUI` | singleLineText |  |
| Lead List Selector | `fldybmIF8esmfobOo` | singleLineText |  |
| Days Between Emails | `fldbX8yCSVIhfJ6v7` | singleSelect | 1, 2, 3, 4, 5 |
| create_ai_script | `fldZ58VQSxjfgIv8N` | checkbox |  |
| Record ID | `fldvddFE4VqKbVaOK` | formula | `RECORD_ID()` |
| Trigger time | `fldZvVxqJOLA1jkq4` | lastModifiedTime |  |
| Campaign Email 1 Subject Spintax 1 | `fldNWDHIxnXfGW8Ab` | singleLineText |  |
| Campaign Email 1 Body Spintax 1 | `fldP4ulsGXBfud19j` | richText |  |
| Campaign Email 2 Subject Spintax 1 | `fldqTZ9n04F7e2BYz` | singleLineText |  |
| Campaign Email 2 Body Spintax 1 | `fldDIEpF3ehgbT3TL` | richText |  |
| Campaign Email 3 Subject Spintax 1 | `fldhvga1Oxtj1h7Ah` | singleLineText |  |
| Campaign Email 3 Body Spintax 1 | `fldmnF1I3GKnxKb9M` | richText |  |
| Campaign Body 1 Version 10 | `fldpTCwHBh3OmRc5X` | richText |  |
| Campaign Body 3 Version 8 | `fldY6SmDyHVWzTNRN` | richText |  |
| Number of leads (from Lead List) | `fldnQaGkUbNx6vKWz` | multipleLookupValues |  |
| Attachments (from Lead List Selector) | `fldrzBQmp18wt2ODt` | multipleLookupValues |  |
| Notes (from Lead List Selector) | `fld1a09cUfErXPqIh` | multipleLookupValues |  |
| Name (from Lead List Selector) | `fldSfKvvYVZF53PYD` | multipleLookupValues |  |
| Number of variants - Step 1 | `fldNIQxQkubt8LAT0` | singleSelect | 1, 2, 3, 4, 5, 6, 7, 8, 9, 10 |
| Trigger Next Step | `fldfgDONYnPAKT3cU` | checkbox |  |
| Campaign Subject 1 Version 1 | `fldzT18PUxePQIYLJ` | singleLineText |  |
| Campaign Subject 1 Version 2 | `fld7JbSeUeGRIErm6` | singleLineText |  |
| Campaign Body 1 Version 2 | `fldGoEivHNQeokI0Z` | richText |  |
| Campaign Subject 1 Version 3 | `fldaioqEyiX4R0cFe` | singleLineText |  |
| Campaign Body 1 Version 3 | `fldYltiXCNiZ4hY7c` | richText |  |
| Campaign Subject 1 Version 4 | `fldldnxDmZedvPxiA` | singleLineText |  |
| Campaign Body 1 Version 4 | `fldUgkCWdKXYNAOeL` | richText |  |
| Campaign Subject 1 Version 5 | `fldKz0E2wm8P9ULsO` | singleLineText |  |
| Campaign Body 1 Version 5 | `fldlXrUtSjJTNLToO` | richText |  |
| Campaign Subject 1 Version 6 | `fldZqLUgXXq15RQEv` | singleLineText |  |
| Campaign Subject 1 Version 7 | `fldWCN46md7gMMpfE` | singleLineText |  |
| Campaign Body 1 Version 7 | `fldaPOITiLMyRYgi6` | richText |  |
| Campaign Subject 1 Version 8 | `fldRizOItAp7ndPtH` | singleLineText |  |
| Campaign Body 1 Version 8 | `fldVNhTFgPWCJiMYB` | richText |  |
| Campaign Subject 1 Version 9 | `fldB67zbrDgPUp40v` | singleLineText |  |
| Campaign Body 1 Version 9 | `fldUfhPjcFsh7UXF9` | richText |  |
| Campaign Subject 1 Version 10 | `fldPjuuM68KrldFRY` | singleLineText |  |
| Campaign Subject 2 Version 1 | `fldj6TMQJYy0PxEko` | singleLineText |  |
| Campaign Subject 2 Version 2 | `fld7ZeulbHEkOhiYu` | singleLineText |  |
| Campaign Body 2 Version 2 | `fldQUnGRfJB2Pq3sf` | richText |  |
| Campaign Subject 2 Version 3 | `fldeLeDeZnIBMZTsw` | singleLineText |  |
| Campaign Body 2 Version 3 | `fldffd3FJPmkwJ4OF` | richText |  |
| Campaign Subject 2 Version 4 | `fldh5zShUpiejUWxJ` | singleLineText |  |
| Campaign Body 2 Version 4 | `fldELB1aAnUjpdOjf` | richText |  |
| Campaign Subject 2 Version 5 | `fld269cnYHr7d1nyM` | singleLineText |  |
| Campaign Body 2 Version 5 | `fld5KiBJqlLTFioVd` | richText |  |
| Campaign Subject 2 Version 6 | `fldeSAOM4bSThfmfL` | singleLineText |  |
| Campaign Body 2 Version 6 | `fldn4oAU69Rxyk4JD` | richText |  |
| Campaign Subject 2 Version 7 | `fldlJXs0KXKCTcAgq` | singleLineText |  |
| Campaign Body 2 Version 7 | `fldYP195xUi9uU2xj` | richText |  |
| Campaign Subject 2 Version 8 | `fldwsJ2CUX7vKJLyS` | singleLineText |  |
| Campaign Body 2 Version 8 | `fldTzZpMocgWFftAV` | richText |  |
| Campaign Subject 2 Version 9 | `fldEiqBZaMqXmnxne` | singleLineText |  |
| Campaign Body 2 Version 9 | `fldslzMCS7SEe3I7X` | richText |  |
| Campaign Subject 2 Version 10 | `fldLJR5oklajdIUAw` | singleLineText |  |
| Campaign Body 2 Version 10 | `fldHfFuGNAQcQgeM3` | richText |  |
| Campaign Subject 3 Version 1 | `fldhwjgXT5at1lZdE` | singleLineText |  |
| Campaign Subject 3 Version 2 | `fldfT20oJVFIV3k9i` | singleLineText |  |
| Campaign Body 3 Version 2 | `fldnxe2hocQKozF7X` | richText |  |
| Campaign Subject 3 Version 3 | `fld40AvWVaNakJP0c` | singleLineText |  |
| Campaign Body 3 Version 3 | `fldqK0H3nzJTViQAZ` | richText |  |
| Campaign Subject 3 Version 4 | `fldNmyOZABwwf8Zrf` | singleLineText |  |
| Campaign Body 3 Version 4 | `fldW50152mdlL95FR` | richText |  |
| Campaign Subject 3 Version 5 | `fld6fNVHFWLhlCQA2` | singleLineText |  |
| Campaign Body 3 Version 5 | `fld843jVk4TEbp17R` | richText |  |
| Campaign Subject 3 Version 6 | `fldOxB461R6EIjR9O` | singleLineText |  |
| Campaign Body 3 Version 6 | `fldGmPTaXPI5UYCZN` | richText |  |
| Campaign Subject 3 Version 7 | `fldXAS7fkrPyirfsW` | singleLineText |  |
| Campaign Body 3 Version 7 | `fldrGWlJrCSfuRD4J` | richText |  |
| Campaign Subject 3 Version 8 | `fldUs6DkNtvmuHRai` | singleLineText |  |
| Campaign Subject 3 Version 9 | `fldMVNpTkxERw5kUd` | singleLineText |  |
| Campaign Body 3 Version 9 | `fldoudwsZC9QIspyo` | richText |  |
| Campaign Subject 3 Version 10 | `fldZNvFZQSX4ZZRFc` | singleLineText |  |
| Campaign Body 3 Version 10 | `fldIi2bZDYU31jOG7` | richText |  |
| Campaign Email 1 Subject Spintax 2 | `fldaWc4d8rxibk1Kl` | singleLineText |  |
| Campaign Email 1 Body Spintax 2 | `fld72eS0XGF4v8wxm` | richText |  |
| Campaign Email 2 Subject Spintax 2 | `flda9teKhD7HNEtAg` | singleLineText |  |
| Campaign Email 2 Body Spintax 2 | `fldxk8Jk6REOnfywZ` | richText |  |
| Campaign Email 3 Subject Spintax 2 | `fld5zTRHp6FMKeqei` | singleLineText |  |
| Campaign Email 3 Body Spintax 2 | `flduyuJMxVfLKGzCG` | richText |  |
| Campaign Email 1 Subject Spintax 3 | `fldV3H80JuOKTXacn` | singleLineText |  |
| Campaign Email 1 Body Spintax 3 | `fldlKUOgKPwh7W0QF` | richText |  |
| Campaign Email 1 Subject Spintax 4 | `fld0hZNG8SaaYDG58` | singleLineText |  |
| Campaign Email 1 Body Spintax 4 | `fld9FAwyjkYBgalHR` | richText |  |
| Campaign Email 1 Subject Spintax 5 | `fldzPRw7HfqhwZ28L` | singleLineText |  |
| Campaign Email 1 Body Spintax 5 | `fldpDLxWmse4nJBcP` | richText |  |
| Campaign Email 1 Subject Spintax 6 | `fldhdx9zN5mgx3lIq` | singleLineText |  |
| Campaign Email 1 Body Spintax 6 | `fldf4VOh7xCrwLSpJ` | richText |  |
| Campaign Email 1 Subject Spintax 7 | `fldAC8LPOwq2RO49f` | singleLineText |  |
| Campaign Email 1 Body Spintax 7 | `fldqkKfLEuig6UCeW` | richText |  |
| Campaign Email 1 Subject Spintax 8 | `fldPeVfO0LziIGIiY` | singleLineText |  |
| Campaign Email 1 Body Spintax 8 | `fldPAQUnc48MLQcaI` | richText |  |
| Campaign Email 1 Subject Spintax 9 | `fld155jQjONRleTh5` | singleLineText |  |
| Campaign Email 1 Body Spintax 9 | `fld1TwdtKYaYDF7Yz` | richText |  |
| Campaign Email 1 Subject Spintax 10 | `fld1IQZDf0wb1fND5` | singleLineText |  |
| Campaign Email 1 Body Spintax 10 | `fldID0Wh3orIgnqEI` | richText |  |
| Campaign Email 2 Subject Spintax 3 | `fldn2pmiudOZp4LcK` | singleLineText |  |
| Campaign Email 2 Body Spintax 3 | `fld8jZqAIXp05LRKN` | richText |  |
| Campaign Email 2 Subject Spintax 4 | `fldPZlps1UYASgR6V` | singleLineText |  |
| Campaign Email 2 Body Spintax 4 | `fldtQ8RnVQ17VYioe` | richText |  |
| Campaign Email 2 Subject Spintax 5 | `fldbzJ3WG3YAdJFeV` | singleLineText |  |
| Campaign Email 2 Body Spintax 5 | `fldE4eGYA2KRMUSl1` | richText |  |
| Campaign Email 2 Subject Spintax 6 | `fldK1Ks2AML5RKFCp` | singleLineText |  |
| Campaign Email 2 Body Spintax 6 | `fldUzeNxHa1bqfqum` | richText |  |
| Campaign Email 2 Subject Spintax 7 | `fldBVtKyNJljZvuoi` | singleLineText |  |
| Campaign Email 2 Body Spintax 7 | `fldRPN3LnxSxub66X` | richText |  |
| Campaign Email 2 Subject Spintax 8 | `fldoTGrstGZ8xop3e` | singleLineText |  |
| Campaign Email 2 Body Spintax 8 | `fldw65e2Kuwa4Z9a0` | richText |  |
| Campaign Email 2 Subject Spintax 9 | `fldGmqUM6obezXHAH` | singleLineText |  |
| Campaign Email 2 Body Spintax 9 | `fldpR7iTQbOty9uLd` | richText |  |
| Campaign Email 2 Subject Spintax 10 | `fldmN0Lzl8l07Cyj8` | singleLineText |  |
| Campaign Email 2 Body Spintax 10 | `fldZPh2n3BFzEh4MJ` | richText |  |
| Campaign Email 3 Subject Spintax 3 | `fld5NtM5Y6AhhUTvU` | singleLineText |  |
| Campaign Email 3 Body Spintax 3 | `fldtLpcBayQzBeDQ6` | richText |  |
| Campaign Email 3 Subject Spintax 4 | `fld7LSStrIkgH1uVt` | singleLineText |  |
| Campaign Email 3 Body Spintax 4 | `fld9HzCsPEeszQ88M` | richText |  |
| Campaign Email 3 Subject Spintax 5 | `fld5kG9v9GQjzm2jQ` | singleLineText |  |
| Campaign Email 3 Body Spintax 5 | `fldoDIurt9kCaM5rL` | richText |  |
| Campaign Email 3 Subject Spintax 6 | `flddV92G6jYSUvpsT` | singleLineText |  |
| Campaign Email 3 Body Spintax 6 | `fldDg56bivKopxIzQ` | richText |  |
| Campaign Email 3 Subject Spintax 7 | `fldlKMpKvfy9rIcAD` | singleLineText |  |
| Campaign Email 3 Body Spintax 7 | `fldQvdZNceJRzWMHD` | richText |  |
| Campaign Email 3 Subject Spintax 8 | `fld0wPzXsBdGT9mnv` | singleLineText |  |
| Campaign Email 3 Body Spintax 8 | `fldeFCOjeVnSRqtuy` | richText |  |
| Campaign Email 3 Subject Spintax 9 | `fldCMx0Vg0aAxCtqH` | singleLineText |  |
| Campaign Email 3 Body Spintax 9 | `fld0GmCGbZSqoIinb` | richText |  |
| Campaign Email 3 Subject Spintax 10 | `fldzD4h8939hhNeQ5` | singleLineText |  |
| Campaign Email 3 Body Spintax 10 | `fldTOpZrqh6WExOOc` | richText |  |
| Campaign Body 1 Version 6 | `fldB7Vf1RAnyIZb7r` | richText |  |
| Campaign Type | `fldd9fU7wNFTNQB0j` | singleSelect | outbound, inbound |
| Run on Monday | `fldEX5XHj8lIkkp4g` | checkbox |  |
| Run on Tuesday | `fldLoKQBjHmvA0sVd` | checkbox |  |
| Run on Wednesday | `fldWdOeNb5mc95BZp` | checkbox |  |
| Run on Thursday | `fldnJtB1br2i2zkLx` | checkbox |  |
| Run on Friday | `fldsOIQHZfuILVYyx` | checkbox |  |
| Run on Saturday | `fld9ybdYVtipVAQ7g` | checkbox |  |
| Run on Sunday | `fldhasNVsPOKuTQSC` | checkbox |  |
| start_time | `fldxkH2X1VdDOj54B` | singleLineText |  |
| end_time | `fldj60qqSPeYawLX4` | singleLineText |  |
| TimeZone | `fldg8Be3TXKtI30j5` | singleSelect | America/New_York, Europe/London |
| save_as_template | `fldVY20pWuwQeQ4Lt` | checkbox |  |
| max_emails_per_day | `fld0PxY90RaShLgvw` | number |  |
| max_new_leads_per_day | `fldPRrn97ehpYGomi` | number |  |
| plain_text | `fld2VaGjw0nYFJvIy` | checkbox |  |
| open_tracking | `fldgpxvuvb6Dg14xY` | checkbox |  |
| reputation_building | `fld0sQNo8sVfzAyhH` | checkbox |  |
| can_unsubscribe | `fldMmkYaxJVt0ZskZ` | checkbox |  |
| unsubscribe_text | `fldN10YVwygEgq84Y` | multilineText |  |
| start_date | `fldZGNVkmKEzcq4yj` | date |  |
| end_date | `fldaFRUpSPJB3IV8t` | date |  |
| Improvement Sugestion | `fld4wy3OP82nps2zK` | multilineText |  |
| Apollo URL's 2 | `fldQNnTalJ1EbHODL` | singleLineText |  |
| campaign_workspace_id2 | `fld1qb2IGdqKNyjJh` | number |  |
| Apollo URL's 3 | `flds1q5Osc8XZdHm9` | singleLineText |  |
| Number of variants - Step 2 | `fld8zzSiQMwejvoZ4` | singleSelect | 1, 2, 3, 4, 5, 6, 7, 8, 9, 10 |
| Number of variants - Step 3 | `fldpnrrUrJ8NPtxPC` | singleSelect | 1, 2, 3, 4, 5, 6, 7, 8, 9, 10 |
| Apollo URL's (from Client) | `fldZrgd2SUGlZUV4x` | multipleLookupValues |  |
| Skip Bounce Pause | `fldjpNVGqOLFJbcEX` | checkbox |  |
| Last Modified | `fldadZ6fRkcEkf8Xc` | lastModifiedTime |  |
| Created Time | `fldDzkumhNLZzrPxK` | createdTime |  |
| How many back up variants should  each step have? | `fldzztWeFYjHX65ck` | singleSelect | 1, 2, 3, 4, 5, 6, 7, 8, 9 |
| Campaign Feedback Record Link | `fld5e1McMcHXTQEY2` | multipleRecordLinks | → Campaign Feedback |
| Client's Feedback | `fldWJJEJYzKxyLwti` | multipleLookupValues |  |
| Select Changes | `fldhKpDiiRjqMJ2o0` | multipleLookupValues |  |
| Review copy | `fldWeCXf5tCIwJMRd` | multipleLookupValues |  |
| Company Size - Feedback | `fldvHy50OLfkmtdwp` | multipleLookupValues |  |
| Geographic Targeting - Feedback | `fldy9BjxRZuyh6WLO` | multipleLookupValues |  |
| Industry Targeting - Feedback | `fldZYgj2wmOH7CJKE` | multipleLookupValues |  |
| Title Targeting - Feedback | `fldAAxGIIe6E7g26Y` | multipleLookupValues |  |
| Additional Context | `fldkRCt0spCxZribv` | multipleLookupValues |  |
| Tasks | `fld42DSNWmtUQQvgJ` | multipleRecordLinks | → Tasks |
| Hard | `fld5zM7znSWrhZRkv` | rollup |  |
| Soft | `fldAxAxnQjaz1w2Z2` | rollup |  |
| Sales Data | `fldUEQmMJvQ806xuI` | multipleRecordLinks | → Sales Data |
| Email Bison Campaign Settings | `fldloLk9CN9J0LoUp` | multipleRecordLinks | → Email Bison Campaign Settings |
| Can Enter New Vertical | `fldNGNt6DF3s0pvYy` | checkbox |  |
| Can Create New Offer | `fldbp5hFeZSKg8ZJT` | checkbox |  |
| Thread Reply - Step 2 | `fldz66DfS1zAGHKcO` | checkbox |  |
| Thread Reply - Step 3 | `fldUxqdktQwDc1OoC` | checkbox |  |
| Thread Reply - Step 4 | `fld5UmGOG4X9EqHpL` | checkbox |  |
| KPI Health | `fldIP45cidydHBBQA` | formula | `IF({fldDmaS8NZF3j0ZBY}=0,"Not started",IF(AND({fldPx4lkp0XeXtamH}>=5,{fldiLOzbllDI8mn7C}<5),"Healthy",IF(OR({fldiLOzbllDI8mn7C}>=8,{fldPx4lkp0XeXtamH}<2),"Needs attention","Watch")))` |
| Recommended Next Move | `fldRu6WykdHind81I` | formula | `IF({fldZABZwE9SmnwMv3}="Active","Review campaign performance",IF(NOT({fld5weZ6ED31dBlaz}),"Attach lead list",IF({fldlixHfhzrd7nuSc}="","Finish campaign strategy",IF({fldZTtdvwRV53voZE}="","Generate dr` |
| Client Approval Exception | `fld1vE0Exqlw7MMvq` | checkbox |  |
| Number of variants - Step 4 | `fldT1Jw7wLftwkuGK` | singleSelect | 1, 2, 3, 4, 5, 6, 7, 8, 9, 10 |
| Campaign Email 4 Subject Version 2 | `fld84zsDGhsUhmlGR` | singleLineText |  |
| Campaign Body 4 Version 2 | `fldfU5NmwnmNRnnVs` | richText |  |
| Campaign Email 4 Subject Version 3 | `fld2v562Wc1A1GxDX` | singleLineText |  |
| Campaign Body 4 Version 3 | `fldpwZgd0dOmqExPM` | richText |  |
| Campaign Email 4 Subject Version 4 | `fldwVcYUD2NHSqE2N` | singleLineText |  |
| Campaign Body 4 Version 4 | `fldku6TQEt8IQ0XQK` | richText |  |
| Campaign Email 4 Subject Version 5 | `fldzldrVpqHJdhaLf` | singleLineText |  |
| Campaign Body 4 Version 5 | `fldF6INyowVY6Ymkj` | richText |  |
| Refresh from Approved Copy | `fldBAvo53dse4j9zi` | checkbox |  |
| Client Review Submitted At | `fldTwdx8HHei9LeQp` | dateTime |  |
| Client Review Auto-Approve At | `fldC3vCiTcqhGaZrK` | dateTime |  |
| Campaign Approval Source | `fldgHA5CcgM885Itp` | singleLineText |  |
| Top-up Lead List | `fld4lMlTPjrRmAFHp` | multipleRecordLinks | → Lead Lists |
| Top-up Request | `fldOU7mRKMTG5hGjM` | checkbox |  |
| Top-up Status | `fldhUPV4f4pqvv047` | singleSelect | Ready, Requested, Running, Completed, Failed |
| Top-up Added | `fldj24jsClYDgjNyG` | number |  |
| Top-up Skipped | `fldBz14RRsy2PDUhp` | number |  |
| Top-up Last Run | `fldFfVuUx0ZMCaJXX` | dateTime |  |
| Top-up Failed | `fldEosJWzT7I73inC` | number |  |
| Top-up Message | `fldfSoL1aatKQs722` | multilineText |  |
| EmailBison Direct Campaign ID | `fldpwHUDMMDeXORek` | number |  |
| EmailBison Generic Campaign ID | `fld6h6ZPDeu2cgdTe` | number |  |
| Campaign Automation Request | `fldKZKnaFMiAHrDEE` | multilineText |  |
| EmailBison Base URL | `fld0DL0enVj3G1fUJ` | url |  |
| Sender Update State JSON | `fldRS75BkIlqfMKrA` | multilineText |  |
| Verification Cohort Analytics JSON | `fldwNUz5hgOhpgWu9` | multilineText |  |
| Verification Performance | `fldc1zfDSSiWCc0rI` | multipleRecordLinks | → Verification Performance |
| Approval Decision | `fldPEueEsGaqJRX5h` | singleSelect | Pending Client, Approved, Request Changes, Approved - Dulcy |
| Bison URL | `fldkCJDOFglvhcvD6` | url |  |
| Campaign Action Result | `fldgfVmY5Ja6ngHFn` | multilineText |  |
| Campaign Automation Display State | `fld0t9xWgiOl8sJR1` | multilineText |  |
| Client Review Notification State | `fldD8UHFW69VTr1y6` | multilineText |  |
| Replenishment Cycle ID | `fld26pRUJr0Qtm8A9` | singleLineText |  |
| Replenishment Starting Queue | `fldhrJzioBLjyj6lp` | number |  |
| Replenishment Receipt | `fldGYAxQt6gYGhnWK` | multilineText |  |
| Replenishment Checkpoint Error | `fldPyeaLIO7Gd0dUO` | multilineText |  |
| Replenishment Alert Claim | `fldYDHEXtbUhitqwm` | singleLineText |  |
| Replenishment Alert Delivery | `fldogzhFAf5TRZ1Rl` | multilineText |  |
| Replenishment Cycle Progress | `fldTEKcBFAh2fROun` | formula | `IF({fld26pRUJr0Qtm8A9} != '', IF(AND({fldhrJzioBLjyj6lp} > 0, LEN({fld9zg5aC7o1rbg4o} & '') > 0, {fld9zg5aC7o1rbg4o} >= 0, {fld9zg5aC7o1rbg4o} <= {fldhrJzioBLjyj6lp}), MAX(0, MIN(1, 1 - {fld9zg5aC7o1r` |
| Replenishment Alert Ready | `fldH5UcuiSXZ57hD5` | formula | `IF(AND({fldTEKcBFAh2fROun} >= 0.6, {fldYDHEXtbUhitqwm} != IF({fld26pRUJr0Qtm8A9} != '', {fld26pRUJr0Qtm8A9}, 'initial')), 1, 0)` |

## Lead Lists

`tblVOg9BkPOMmnitt`

| Field | ID | Type | Options / formula |
|---|---|---|---|
| File Name | `fldlOo9lL9jvvhGo9` | singleLineText |  |
| Record ID | `fldPzbIZ2QDB9ra7a` | singleLineText |  |
| List ID | `fldJ9qjlqs9taBGFE` | multilineText |  |
| Date URL was added | `fldDQMHHfYUJrA16S` | createdTime |  |
| Lead List Link | `fldSOTvnUxzKWXMDD` | multilineText |  |
| CSV Attachment | `flddnuWDyqUqkRwd5` | multipleAttachments |  |
| Last time csv modified | `fldd0GnvNt9IYkxXB` | lastModifiedTime |  |
| Client | `fldEujtSLqwdpOyGD` | multipleRecordLinks | → Workspace IDs |
| Trigger | `fldywhT3E8G6Jt8L7` | checkbox |  |
| Which Campaign? | `fldepbn71awSjmZPV` | multipleRecordLinks | → Campaigns |
| Hide | `fldCc86NCikq5LCVe` | checkbox |  |
| Lead List Stage | `fld8nrebRFL0O8kgj` | singleSelect | Draft, Targeting, Searching, Source Imported, Contacts Ready, Verification, Enrichment, QA, Ready, Uploaded, Failed, Archived, Source & ICP |
| SEG Providers | `fldkfozG1Mpfgq9mI` | multipleSelects | Outlook, Google, Mimecast, Proofpoint, Zoho, Custom Mail Server, Barracuda, Cloudflare, StackCP, Other |
| Final Generic Count | `fld0FHomkh3uyx0FD` | number |  |
| Final Direct Count | `fldQZJCpTofahmTkl` | number |  |
| Final Lead Count | `fldRoiEVgND0LjeMY` | formula | `{fldQZJCpTofahmTkl} + {fld0FHomkh3uyx0FD}` |
| QA Status | `fldUB4WsLi5kq6rUy` | singleSelect | Not Checked, Passed, Needs Review, Failed |
| Automation Action | `fldhViG7kJ5rKEaa4` | singleSelect | Run Company Sample, Refine Company Sample, Expand Companies, Build Contact Sample, Expand Contacts, Verify and Finalize, Retry Failed Stage, Generate Filters, Restart Companies, Apply Contact Decisions, Build New Contact Sample, Review Saved Company Sample, Test Saved Company Evidence (1), Apply Ver |
| Enrichment Action | `fldLyvQsbGvii0iUK` | singleSelect | Prepare Enrichment Prompt, Run Enrichment |
| QA Action | `fldcBmKEYX8KUiKAM` | singleSelect | Run Automated QA |
| Use DiscoGen Deep Review | `fldsYFrdNF2VBS6SQ` | checkbox |  |
| ESP Breakdown JSON | `fldJCxECBr4wD09a3` | multilineText |  |
| EmailBison API (from Client) | `fldFvgH9UxZSQesD4` | multipleLookupValues |  |
| URL for searching | `fldym7YS2tSj8crr7` | url |  |
| Number of leads | `fld2G5D1yCPFGFiVF` | number |  |
| Name of the Lead List | `fldbg5PAnKyFHc3uy` | singleLineText |  |
| Campaign ID | `fldWW0gfkBtiCkWGk` | multipleLookupValues |  |
| Processing Status | `fldf9wpMGWg0SebHV` | singleSelect | Not Started, Queued, Running, Waiting, Completed, Failed |
| Processing Progress | `fldaUFUWOLtKIovQE` | percent |  |
| Workflow Template | `fldj6OeEu5swtimNx` | singleSelect | Local Business - Generic + Direct, Direct Only, Custom |
| Workflow Run ID | `fld4kyzDwnHq5V4Iy` | singleLineText |  |
| Processing Started At | `fldUZOY2Ubs58DQ3V` | dateTime |  |
| Processing Completed At | `fldMSv3547BOvfdmH` | dateTime |  |
| Last Workflow Message | `fldVnH7Pn1PxlZI5b` | multilineText |  |
| Last Workflow Error | `fldBiCrm8Xm1V6FxF` | multilineText |  |
| Include Generic Emails | `fldIXN5t3bqfiZ0Wu` | checkbox |  |
| Include Direct Contacts | `fldfFcn3BB2RyiWer` | checkbox |  |
| Target Personas | `fldle7FymM4BN7iJK` | multilineText |  |
| Generic Verification Provider | `fldX8cOpx3TcGX2jf` | singleSelect | MillionVerifier, LeadMagic, None |
| Direct Verification Provider | `fldlJtYONrHGdyXoh` | singleSelect | LeadMagic, MillionVerifier, None |
| Catch-All Policy | `fldL3nguggy3hWpXD` | singleSelect | Exclude, Review, Include |
| Role Email Policy | `fldEowFa8B2lS2PRN` | singleSelect | Exclude, Review, Include |
| Free Email Policy | `fldRbgKvjSv7sl5YL` | singleSelect | Exclude, Review, Include |
| SEG Rule | `fldfmIbpySyuXFyhf` | singleSelect | Allow All, Exclude Selected, Include Selected, Review Selected |
| Custom Variables Requested | `fldTYRjTrpVW27tmG` | multilineText |  |
| Column Mapping JSON | `fldUa69aE3HyX0n81` | multilineText |  |
| Company Source File | `fld7cUV4rvR35SVvC` | multipleAttachments |  |
| Generic Candidates File | `fldWzk0zDUCs9xwpG` | multipleAttachments |  |
| Direct Candidates File | `fldKuO1OqVM67kL52` | multipleAttachments |  |
| Verified Generic File | `fld0NPWEFAPnr5Iaz` | multipleAttachments |  |
| Verified Direct File | `fld5lcKnq9gsYX3uf` | multipleAttachments |  |
| Enriched Output File | `fldVlhHH6Uk1xIIlq` | multipleAttachments |  |
| Final Export File | `fldjn5vqHSVYiAR6z` | multipleAttachments |  |
| Source Company Count | `fldRLtvugIxH9qun1` | number |  |
| Generic Candidate Count | `fldejaM3vV9GMqT8K` | number |  |
| Direct Candidate Count | `fld1pgvOtgJL80iaK` | number |  |
| Verified Generic Count | `fldd5zmRzTjz5bvPy` | number |  |
| Verified Direct Count | `fldf3pl1RYHishCKV` | number |  |
| Duplicate Count | `fldSk4FJKAHo5yGhc` | number |  |
| Rejected Count | `fldllzDyi67HGc0FC` | number |  |
| QA Summary | `fld9XB4gkZcizeHUg` | multilineText |  |
| Required Fields Present | `fldWDSDICYaL9SQEa` | checkbox |  |
| Duplicate Check Passed | `fldgWhI2Nm2Y9c91O` | checkbox |  |
| Final Schema Passed | `fld9p2h93vRGm6D3e` | checkbox |  |
| Source Type | `fldJSSY0QTMU5pzsQ` | singleSelect | DiscoLike, Third-Party Domains |
| Third-Party Source Method | `fldrwkcctpevJf4Em` | singleSelect | Upload Domain CSV, Scraper (Coming Soon) |
| DiscoLike Company Filters JSON | `fldC2hZQ3gSqLmi1y` | multilineText |  |
| Domain Source File | `fldVIpEks58Pgerne` | multipleAttachments |  |
| Included Industries | `fld1YCXcNy4DgpiLf` | multipleSelects |  |
| List Thesis | `fldg6HZIKqe8c8RtW` | multilineText |  |
| ICP Description | `fldcYwP7Dlq4uyC39` | multilineText |  |
| Included Countries | `fldHeVveCAwW5BpPx` | multipleSelects | US, GB, CA |
| Excluded Industries | `flde9rzZp6nxFY0kc` | multipleSelects |  |
| Included States | `fldE9enhYUgKfpPBZ` | multipleSelects |  |
| Employee Range | `fldG2MXz5lccu7KKU` | singleLineText |  |
| Homepage Keywords | `fldydpLzUzAJGLBBJ` | multilineText |  |
| Company Sample Size | `fldiedxTwtn6TikJi` | number |  |
| Company Good Fit Count | `fldAWCY4Tl9jpQtYc` | number |  |
| Company Bad Fit Count | `fldqaiJodYBS3GpRu` | number |  |
| Company Fit Rate | `fldDD7HGFq0j3Iwfp` | percent |  |
| Company Validation Status | `fldY1i1787UwZFOr6` | singleSelect | Not Started, Running, Passed, Failed, Needs Review |
| Company Validation Summary | `fld6BhZSLdGOkCJCZ` | multilineText |  |
| Company Review File | `fldDrYUU7LcuF8nLC` | multipleAttachments |  |
| Company Sample Approved | `fldqGx4RU4zDYxitK` | checkbox |  |
| Expansion Target | `fldYzvqGmQZxXL9AP` | number |  |
| Expansion Approval | `fldCplE8kEMlL1fP3` | singleSelect | Not Requested, Awaiting Approval, Approved, Rejected |
| Contact Persona DNA | `fldRIomZHeVxPWveE` | multilineText |  |
| Contact Source | `fldwoK7IcKH6NYgVJ` | singleSelect | DiscoLike, DiscoLike + ContraGen, ContraGen |
| Contact Filters JSON | `fld8Y8iYpvUV4FDDX` | multilineText |  |
| Contact Sample Size | `fldE2XBsGSES6fT6X` | number |  |
| Contact Good Fit Count | `fldkWL67N8ZaBIaDi` | number |  |
| Contact Bad Fit Count | `flda4qjRC0sCeStBg` | number |  |
| Contact Fit Rate | `fldbiciFuOmAzv38D` | percent |  |
| Contact Validation Status | `fldVH77A3Ozjh4t8k` | singleSelect | Not Started, Running, Passed, Failed, Needs Review |
| Contact Validation Summary | `fldnScb360OZ17VRt` | multilineText |  |
| Contact Sample Approved | `fldVz983EKKiPSzjc` | checkbox |  |
| Contact Review File | `fldRfTjDgsvbdoigO` | multipleAttachments |  |
| Verification Provider | `fldscHbLN6C72xbRj` | singleSelect | LeadMagic, MillionVerifier |
| State Filters | `fldoeQZ5utB7F9XkD` | singleLineText |  |
| Industry Filters | `fldOY9huqfW7v6bXT` | multilineText |  |
| Excluded Industry Filters | `fld8BzLAB6otoGBVI` | multilineText |  |
| Country Filters | `fldja37uHGyGpZZLB` | singleLineText |  |
| Contact Review JSON | `fldgdJtCTRcs2W8bF` | multilineText |  |
| Company Review JSON | `fldIqvGL4oXekHiCv` | multilineText |  |
| MillionVerifier Job ID | `fld4B7jLPdcgzdkgF` | singleLineText |  |
| Verification Idempotency Key | `fldPiw2FHZgLQdJb4` | singleLineText |  |
| LeadMagic Job ID | `fld1UmiJ0PsIndCtO` | singleLineText |  |
| Verification Source Version | `fldoqeuhaQxAjtjx0` | singleLineText |  |
| Verification Provider State | `fldflrzfkhmW7JarV` | singleLineText |  |
| Verification Route | `fldkSwOgZ3tqz8tx9` | singleLineText |  |
| Verification Good Count | `fld8kUuSdLo5autI7` | number |  |
| Verification Risky Count | `fldXl4sV7ma4YAOv7` | number |  |
| Verification Bad Count | `fld9Jgzxc9JqeFAus` | number |  |
| Verification Completed At | `fldxehC2cjGGK8ruN` | dateTime |  |
| Verification Recovery Result | `fldBNcX5GhxJj2rJu` | multilineText |  |
| DiscoLike Company Query ID | `fldGXG9vtRFgWtCdC` | singleLineText |  |
| DiscoLike Company Search URL | `fldUrew2bvIeP7pVb` | url |  |
| DiscoLike Contact Query ID | `fldZSgpPUl3bKRkRz` | singleLineText |  |
| DiscoLike Contact Search URL | `fld4utP7cPWuaAU3A` | url |  |
| Contact Queue Status | `fldiRqsZug1W0Otvs` | singleSelect | Queued, Running, Completed, Failed |
| Contact Queued At | `fldX3ZuuLZjuTcLVt` | dateTime |  |
| Campaigns | `fldMRjItF4tq8ZXLS` | multipleRecordLinks | → Campaigns |
| Company Sample Provenance JSON | `fld0XGYNDKLZzjwWH` | multilineText |  |
| Company Restart History | `fld2y2zxuAVGqZYEL` | multilineText |  |
| DiscoGen Deep Review Prompt | `fldVCKrDuXfEhxjZm` | multilineText |  |
| DiscoGen Deep Review Additional Requirements | `fldH7LfiagdudqYJn` | multilineText |  |
| DiscoGen Review Results URL | `fld0KlQqxFEG6wgfU` | url |  |
| Company Needs Review Count | `fldmyD4PJ9mXdCJZ8` | number |  |
| Top-up Build Scope JSON | `fldevysyehxsGxt2q` | multilineText |  |
| Use LeadMagic Fallback | `fldJbIiQ35ZFPsXPL` | checkbox |  |
| TAM Check JSON | `fldKNUnxiySLsIUny` | multilineText |  |
| Generic Emails Footprint 200 or Less | `fldAFATYp9G26MmVj` | checkbox |  |
| Contact Sample Revision | `flddy2JWKWktGajE7` | number |  |
| Production ESP Breakdown JSON | `fldsYLxPFzapgvw5N` | multilineText |  |
| Run Timing JSON | `fld1QphpklpYJqP0I` | multilineText |  |
| Company Evidence Corrections JSON | `fldL8OC0MQBPC3339` | multilineText |  |
| Top-up Upload Receipt JSON | `fld8MIk1KUeT6fDDu` | multilineText |  |

## Campaign Feedback

`tblX4NisPYHJkpZYW`

| Field | ID | Type | Options / formula |
|---|---|---|---|
| lead | `fldq2taQdDUJf2PSs` | singleLineText |  |
| Client's Feedback | `fldkZ4G8OUsdRRqn9` | singleSelect | Approve Campaign, Request Changes |
| Select Changes | `fld3uMxKUpmvChNEb` | singleSelect | Copy, Lead List, Entire Campaign |
| Review Copy | `fldO4YIYkW2d1rTp5` | multilineText |  |
| Company Size - Feedback | `fldNqIRLvlidjQ737` | singleSelect | ✅ Looks good — keep as is, 🔧 Minor tweaks needed, ⚠️ Too broad — narrow it down, 🎯 Too narrow — expand it, ❌ Not aligned — needs replacement, 💬 Needs discussion on next call |
| Geographic Targeting - Feedback | `fldfLnMSfZeTySOoB` | singleSelect | ✅ Looks good — keep as is, 🔧 Minor tweaks needed, ⚠️ Too broad — narrow it down, 🎯 Too narrow — expand it, ❌ Not aligned — needs replacement, 💬 Needs discussion on next call |
| Industry Targeting - Feedback | `fldD1DWI7pyiNDky4` | singleSelect | ✅ Looks good — keep as is, 🔧 Minor tweaks needed, ⚠️ Too broad — narrow it down, 🎯 Too narrow — expand it, ❌ Not aligned — needs replacement, 💬 Needs discussion on next call |
| Title Targeting - Feedback | `fldRYGQEJpd7RGe70` | singleSelect | ✅ Looks good — keep as is, 🔧 Minor tweaks needed, ⚠️ Too broad — narrow it down, 🎯 Too narrow — expand it, ❌ Not aligned — needs replacement, 💬 Needs discussion on next call |
| Additional Context | `fld95MgtdrrREWWSc` | multilineText |  |
| Last Modified Client | `fldvuNurzLbPnFNxY` | lastModifiedTime |  |
| Campaigns | `fld0o42OgSWvwWirn` | multipleRecordLinks | → Campaigns |

## Email Analytics

`tblVqkbJyd6be1lJH`

| Field | ID | Type | Options / formula |
|---|---|---|---|
| Date | `flda4C6QQN04OHkuM` | date |  |
| Month | `fldwoH365ABdE6ueM` | singleLineText |  |
| Year | `fldxYhUnQoLHQdIZ6` | number |  |
| Campaign ID | `fldQypqJhzHpYpTXg` | singleLineText |  |
| Campaign Name | `fldxtwquMnN8MA4Fq` | singleLineText |  |
| Campaign | `fldgxov1bWypveFbQ` | multipleRecordLinks | → Campaigns |
| Skip Bounce Notifications (from Campaign) | `fld5OV6Il2FBbAcX1` | multipleLookupValues |  |
| Skip Bounce Pause (from Campaign) | `fldo9unRQreQ6pmMV` | multipleLookupValues |  |
| Record ID (from Client) (from Campaign) | `fldliAJk0UFvE9Raj` | multipleLookupValues |  |
| Client | `fld7iuoShtAchpt42` | multipleLookupValues |  |
| EmailBison API (from Client) (from Campaign) | `flduc8CbQOwxSL0y2` | multipleLookupValues |  |
| Campaign Status | `fld2Fm6DIwxg4RAm1` | multipleLookupValues |  |
| Total Leads | `fldVl7GqnNOSoPoba` | number |  |
| Total Leads Contacted | `fldlbc9LILIl0dda3` | number |  |
| Remaining Leads | `fldPlPj4D3jNVhjit` | formula | `{fldVl7GqnNOSoPoba} - {fldlbc9LILIl0dda3}` |
| Progress | `fldUjDUwqFKr2BWmE` | percent |  |
| Emails Sent | `fldRyIaN7ieqpr0js` | number |  |
| Unique Replies | `fldVV8CnYeMDmdWjy` | number |  |
| Unique Replies % | `fld3s2n5cefZQj7X7` | formula | `IF(AND({fldRyIaN7ieqpr0js}, {fldRyIaN7ieqpr0js} > 0), ROUND(({fldVV8CnYeMDmdWjy} / {fldRyIaN7ieqpr0js}), 2), 0)` |
| Interested | `fld1Ub3r2AYzPc66F` | number |  |
| Interested % | `fldDfMgl9VQa3uiLb` | formula | `IF(AND({fldVV8CnYeMDmdWjy}, {fldVV8CnYeMDmdWjy} > 0), ROUND(({fld1Ub3r2AYzPc66F} / {fldVV8CnYeMDmdWjy}), 2), 0)` |
| Bounced | `fldQtnVI6GktBAeGy` | number |  |
| Bounced % | `fld84GKYLXBrLwvG9` | formula | `IF(AND({fldRyIaN7ieqpr0js}, {fldRyIaN7ieqpr0js} > 0), ROUND(({fldQtnVI6GktBAeGy} / {fldRyIaN7ieqpr0js}), 2), 0)` |
| Meetings Booked | `fldpE86vGBfPF5LUn` | number |  |
| Meetings Booked % | `fldwwL0QGcJaVWufP` | formula | `IF(AND({fld1Ub3r2AYzPc66F}, {fld1Ub3r2AYzPc66F} > 0), ROUND(({fldpE86vGBfPF5LUn} / {fld1Ub3r2AYzPc66F}), 2), 0)` |
| Total Meetings Booked | `fldjcBjWVCdZosalK` | number |  |
| Total Emails Sent | `flddjmNU2gePJVOGo` | number |  |
| Emails to Meeting Ratio | `fldyEMWAkXFZoZXAA` | formula | `IF({fldjcBjWVCdZosalK} = 0, 0, ROUND(({flddjmNU2gePJVOGo} / {fldjcBjWVCdZosalK}), 0))` |
| campaign_id_number | `fldNVSRTvFD4gSG7g` | formula | `VALUE({fldQypqJhzHpYpTXg})` |
| progress_internal | `fldg7x8XC0WOz25lC` | formula | `{fldUjDUwqFKr2BWmE}*100` |

## Sequence Analytics

`tblmHKxDLELPkj5xk`

| Field | ID | Type | Options / formula |
|---|---|---|---|
| Sequence Metric Key | `fldQS2iGsYcQfQtR2` | singleLineText |  |
| Campaign | `fldOj7Uk9JSNnI1kF` | multipleRecordLinks | → Campaigns |
| Campaign ID | `fldU9ddVQhO7Ax0hd` | number |  |
| Date | `fld0ZuecZ1TxaApcz` | date |  |
| Sequence Step ID | `fldodDqphp4JHc8R2` | number |  |
| Step Number | `fldbgt319A6pym3Ni` | number |  |
| Variant | `fldqPCQ7mcynXjSUL` | singleSelect | A, B, C, D, E, F, G, H, I, J |
| Subject | `fldZGv33auxBB7F9e` | singleLineText |  |
| Email Copy Snapshot | `fldpjyievPCAo9iEt` | multilineText |  |
| Emails Sent | `fldWasIzQZHOeHlig` | number |  |
| Replies | `fldIvQkJnFcZlImqA` | number |  |
| Interested Replies | `fldAcRMZyCly08iDj` | number |  |
| Bounces | `fldcZ6ICxoCsyyDBb` | number |  |
| Reply Rate | `fldKyxChGPdeLKs9T` | formula | `IF(   {fldWasIzQZHOeHlig} > 0,   {fldIvQkJnFcZlImqA} / {fldWasIzQZHOeHlig},   0 )` |
| Interested Rate | `flddj5XqkJUpfqAXZ` | formula | `IF(   {fldWasIzQZHOeHlig} > 0,   {fldAcRMZyCly08iDj} / {fldWasIzQZHOeHlig},   0 )` |
| Bounce Rate | `fldkZwoIQDl6PxVxo` | formula | `IF(   {fldWasIzQZHOeHlig} > 0,   {fldcZ6ICxoCsyyDBb} / {fldWasIzQZHOeHlig},   0 )` |
| Sample Size Status | `fldvsl6PdlTVz0QAJ` | formula | `IF(   {fldWasIzQZHOeHlig} >= 2000,   "Ideal",   IF(     {fldWasIzQZHOeHlig} >= 1000,     "Okay",     "Not ideal"   ) )` |
| Last Synced | `fldQ6xrZOBgnOspqN` | dateTime |  |

## Email Analytics Overview

`tblZkEi6qylqfOj9Z`

| Field | ID | Type | Options / formula |
|---|---|---|---|
| Identifier | `fldeYWddI8fjPuiU4` | formula | `{fld2lNnwaEWOXJDbm} & " - " & {fldUsJx69UWEZcRny}` |
| Date Period | `fld2lNnwaEWOXJDbm` | singleSelect | Last 10 days, Last 30 days, Last 60 days, Last 120 days, All time |
| Client ID | `fldUsJx69UWEZcRny` | singleLineText |  |
| Client | `fldzd0LKSIVCPvxOs` | multipleRecordLinks | → Workspace IDs |
| Total Leads Contacted | `fldp5wg8A6XA10bAl` | number |  |
| Emails Sent | `fldVs2haZDtFqeYJK` | number |  |
| Unique Replies | `fldZPsJKQz1Sn0UJQ` | number |  |
| Unique Replies % | `fld7mmus4zueR65np` | formula | `IF(AND({fldp5wg8A6XA10bAl}, {fldp5wg8A6XA10bAl} > 0), ROUND(({fldZPsJKQz1Sn0UJQ} / {fldp5wg8A6XA10bAl}), 2), 0)` |
| Interested | `fld5OvaOUVdOQZ4wX` | number |  |
| Interested % | `fldH96nI1g5p4hgbt` | formula | `IF(AND({fldZPsJKQz1Sn0UJQ}, {fldZPsJKQz1Sn0UJQ} > 0), ROUND(({fld5OvaOUVdOQZ4wX} / {fldZPsJKQz1Sn0UJQ}), 2), 0)` |
| Bounced | `fldUnH25Y1zICnc6Q` | number |  |
| Bounced % | `fldcY0RlDiQGMjt6r` | formula | `IF(AND({fldVs2haZDtFqeYJK}, {fldVs2haZDtFqeYJK} > 0), ROUND(({fldUnH25Y1zICnc6Q} / {fldVs2haZDtFqeYJK}), 2), 0)` |
| Meetings Booked | `fldtysdSyWu4GSJkF` | number |  |
| Meetings Booked % | `fldAq57dyxYpWJsF7` | formula | `IF(AND({fld5OvaOUVdOQZ4wX}, {fld5OvaOUVdOQZ4wX} > 0), ROUND(({fldtysdSyWu4GSJkF} / {fld5OvaOUVdOQZ4wX}), 2), 0)` |
| Total Meetings Booked | `fldn6VqjNXsepf8L2` | number |  |
| Emails to Meeting Ratio | `fldCy63XciUepMV0S` | formula | `IF({fldtysdSyWu4GSJkF} = 0, 0, ROUND(({fldVs2haZDtFqeYJK} / {fldtysdSyWu4GSJkF}), 0))` |
| Updated At | `fldrFsU3zkW0nZJDr` | lastModifiedTime |  |
| Emails to Lead Ratio | `fldkvDWyU2cVsnZEQ` | formula | `IF({fld5OvaOUVdOQZ4wX} = 0, 0, ROUND(({fldVs2haZDtFqeYJK} / {fld5OvaOUVdOQZ4wX}), 0))` |

## LinkedIn Campaigns

`tbl7s4Q7ccNy5aSSW`

| Field | ID | Type | Options / formula |
|---|---|---|---|
| Campaign Name | `fldIqrIuJziAvf1n1` | singleLineText |  |
| Email Campaigns | `fldxPaBfJWZqUTIyD` | multipleRecordLinks | → Campaigns |
| Workspace ID | `fldcorhfyO0ww1wI6` | multipleLookupValues |  |
| Client (from Email Campaigns) | `fldFJPFI2BNneTdQL` | multipleLookupValues |  |
| Record ID (from Client) (from Email Campaigns) | `fldfclKZb0SNQsYxJ` | multipleLookupValues |  |
| Email Campaign ID | `fldYGv71lVkH6HmgR` | multipleLookupValues |  |
| Campaign ID | `fld2A957VyoMPyq6v` | singleLineText |  |
| Updated At | `fldVrrU1F6ewq2urp` | lastModifiedTime |  |
| Status | `fldFGS5XOc2pCbf9Y` | singleSelect | Drafted, Active, Stopped, Completed |
| Leads Total | `fldUtwAWw3PSUx5Ki` | number |  |
| Leads In Progress | `fldFzq1MpKIKlpni5` | number |  |
| Leads Pending | `fldeKqJblI1F1UdM7` | number |  |
| Leads Finished | `fldgIGp1sT6WF7hVN` | number |  |
| Progress | `fld6lnzU4ErOTKtvT` | formula | `IF(   OR({fldgIGp1sT6WF7hVN} = BLANK(), {fldUtwAWw3PSUx5Ki} = BLANK(), {fldUtwAWw3PSUx5Ki} = 0),   0,   {fldgIGp1sT6WF7hVN} / {fldUtwAWw3PSUx5Ki} )` |
| Connections Sent | `fldxdWO9mKpIRmKji` | number |  |
| Connections Accepted | `fld1nzYsh20aMqQrI` | number |  |
| Acceptance Rate | `flddnP8QhuRa3T8cN` | formula | `IF({fldxdWO9mKpIRmKji} = 0, 0, ({fld1nzYsh20aMqQrI} / {fldxdWO9mKpIRmKji}))` |
| Messages Started | `fldMWPHVV1DWapNsN` | number |  |
| Replies | `fld7XShLCdt0dmtsN` | number |  |
| Reply Rate | `fldfuM2tQdWmHsE6m` | formula | `IF({fldxdWO9mKpIRmKji} = 0, 0, {fld7XShLCdt0dmtsN} / {fldxdWO9mKpIRmKji})` |
| InMails Sent | `flddWVIPGzFWGlDfU` | number |  |
| InMails Replies | `fld2v7A6KF1QsJLPN` | number |  |
| InMails Reply Rate | `fldPhwVJNUxxUDPUq` | formula | `IF({flddWVIPGzFWGlDfU} = 0, 0, {fld2v7A6KF1QsJLPN} / {flddWVIPGzFWGlDfU})` |
| Meetings Booked | `fldBGSLTkAWcwei3C` | number |  |
| Meetings Booked % | `fldIyvFekbqxM51o4` | formula | `IF(AND({flddWVIPGzFWGlDfU}, {flddWVIPGzFWGlDfU} > 0), ROUND(({fldBGSLTkAWcwei3C} / {flddWVIPGzFWGlDfU}), 2), 0)` |
| Connections to Meeting Ratio | `fldKGwBYYWmmf8uJP` | formula | `IF({fld1nzYsh20aMqQrI} = 0, 0, ROUND(({fldBGSLTkAWcwei3C} / {fld1nzYsh20aMqQrI}), 2))` |
| LinkedIn Analytics | `fldBIyf5Iw75lfuXY` | singleLineText |  |

## LinkedIn Analytics Overview

`tblTEPeaVSGcct8FY`

| Field | ID | Type | Options / formula |
|---|---|---|---|
| Identifier | `fld8i79hdsA5M97q3` | formula | `{flduCc6xsfbeCyha3} & " - " & {fldvcMXOd3lIOFvVn}` |
| Date Period | `flduCc6xsfbeCyha3` | singleSelect | Last 10 days, Last 30 days, Last 60 days, Last 120 days, All time |
| Client ID | `fldvcMXOd3lIOFvVn` | singleLineText |  |
| Client | `fldaLJfTunR6rmU5C` | multipleRecordLinks | → Workspace IDs |
| Connections Sent | `fldjpHcc5qimYF06k` | number |  |
| Connections Accepted | `fldNzkmv0ITOTJ6eK` | number |  |
| Acceptance Rate | `fldZzAwT0aKOacoZP` | formula | `IF({fldjpHcc5qimYF06k} = 0, 0, ({fldNzkmv0ITOTJ6eK} / {fldjpHcc5qimYF06k}))` |
| Messages Started | `fldy8A5YEHwAhI3fP` | number |  |
| Replies | `fldT9DFOlTmEkFJfP` | number |  |
| Reply Rate | `fld1GxqwzTP0OLUTo` | formula | `IF({fldjpHcc5qimYF06k} = 0, 0, {fldT9DFOlTmEkFJfP} / {fldjpHcc5qimYF06k})` |
| InMails Sent | `fldZ8G6SpfyANET2W` | number |  |
| InMails Replies | `fldOHSY9tlUuz21CP` | number |  |
| InMails Reply Rate | `fldBthjMwAqb1W5Hs` | formula | `IF({fldZ8G6SpfyANET2W} = 0, 0, {fldOHSY9tlUuz21CP} / {fldZ8G6SpfyANET2W})` |
| Meetings Booked | `fldnSD9W3gPQDxyQE` | number |  |
| Meetings Booked % | `flduKg3h3RjbTohb6` | formula | `IF(AND({fldZ8G6SpfyANET2W}, {fldZ8G6SpfyANET2W} > 0), ROUND(({fldnSD9W3gPQDxyQE} / {fldZ8G6SpfyANET2W}), 2), 0)` |
| Connections to Meeting Ratio | `fldwShZ1HCf0mrKwR` | formula | `IF({fldNzkmv0ITOTJ6eK} = 0, 0, ROUND(({fldnSD9W3gPQDxyQE} / {fldNzkmv0ITOTJ6eK}), 2))` |
| Last Modified | `fld8hQwdDzmOrk5L6` | lastModifiedTime |  |

## AI Employee Calls (Legacy)

`tblHDo4RQrYvIkDyj`

| Field | ID | Type | Options / formula |
|---|---|---|---|
| Leads Number | `fldweU2lalOtdR3oL` | phoneNumber |  |
| Leads Name | `fldTjgLKY7lBYesLo` | singleLineText |  |
| Leads Email | `fldCk2MzQNtqpTTEl` | email |  |
| Latest Convo History | `fldO8gp6LJJSk9FrJ` | multilineText |  |
| AI Model ID (PRE) | `fld4rKc5kYgpH2C9Y` | singleLineText |  |
| AI Model ID (APTR) | `fldG4hYP12l74XHvc` | singleLineText |  |
| Workspace ID | `fldLlHx2M1WYzoaSV` | singleLineText |  |
| AI Called? | `fldC9idAn6nFNx83n` | singleLineText |  |
| Call ID | `fld5MXrTtG8cluxkF` | singleLineText |  |
| Call Recording | `fldkjltgC1l9yjMqM` | singleLineText |  |
| Call Transcript | `fldpEI2JvgNuB4jup` | multilineText |  |
| DNC | `fldyxfWbLbN3T4h4r` | checkbox |  |
| Times Called (Identifier) | `fldrQrCLXrGBT1GJA` | number |  |
| Follow Up Counter | `fldJ98RtM5GIDinpC` | number |  |
| SMS Latest Reply | `fldRnXV2wlQFGxLKx` | multilineText |  |
| SMS Conversation History | `fldusoo8ypcqhDaoH` | multilineText |  |
| Call Status | `fldyG0BT7CXARLHin` | singleSelect | Answered Call [INTERESTED (Booked Appointment)], Answered Call [INTERESTED (Didn't Booked Appointment)], Answered Call [BUSY (Call-Back Requested)], Answered Call [BUSY (No Call-Back Requested)], Answered Call [NOT INTERESTED], Answered Call [TURNED DNC], Answered Call [NONE], Call Failed, Reached V |

## Team Check Ins

`tblg8bhXMK7uPiHn6`

| Field | ID | Type | Options / formula |
|---|---|---|---|
| Id | `fldfXTTpeXzUFjr7D` | autoNumber |  |
| Name | `fldhvYlHYKF1gLJRN` | singleSelect | Deniel Vitto, Ben Acerden, Juan Carvajal, Sean Jamelarin, Sophia Mckinney, Nikolaj Velimirovic, Andrey Karavaev |
| Date of Report | `fldVelt7MsDX1n35W` | dateTime |  |
| What campaigns did you work on today? | `flduVWRTD8blX99it` | checkbox |  |
| What client campaigns did you work on today? | `fldt1xMKBeKg5L4dq` | multipleSelects | Sharp Archive, Fivenson Studios, Digital Neighbor, KNR Paris, TargetonStar, Amazon Consultancy, Inlight Insight, VisionairAI, TwoTreesPPC, Leadodo, Metuchen Inn, Adverio, A-Wing Visual, LukcyDiem, Snowball Print, Visimpact, Forever Card, Marcello, Slogan Social, Unleashed Technologies |
| Tasks Completed Today | `fldw85aRY2t0Fnb4m` | multilineText |  |
| What mistakes were made today (if any)? | `fld0wOyNPYIeBZDA7` | multilineText |  |
| What could be improved? | `fldYcTHs995uQzKiG` | multilineText |  |
| What are you planning to do tomorrow? | `fldqIBTBJKuV3jM1Y` | multilineText |  |
| Are there any urgent issues that need attention? | `fldjpbbbaARinC0rn` | singleSelect | Yes, No, In progress |
| Explain what needs to be attended to | `fldJCC3phBzoXg5WL` | multilineText |  |
| Any general feedback or notes? | `fldzxPqfxNjLbz4AD` | multilineText |  |
| Any client updates sent on Slack today? | `fldnyiMeec2MUfl6N` | singleSelect | Yes, In progress, No |
| Notes | `fldaNPWYuMGsbEmEa` | multilineText |  |
| # of replies sent today | `fldfYc8DshwMgjjIM` | multilineText |  |
| Who did we book meetings for and how many? | `fldj8gy16IVETugoy` | multilineText |  |
| Time Tracker Sheet Link | `fld3nr2pXKvlJEDWI` | singleLineText |  |
| Dulcy Sales Tracker Sheet Link | `fldSciIbivwTFfXcq` | singleLineText |  |
| New Prospects Reached Today | `fldXDrOfKV0gDsmvZ` | multilineText |  |
| Top Objections Heard Today | `fldZGyxWQGPJZXyj3` | multilineText |  |
| Lead Quality Feedback | `fldsTtIq9UIh126cu` | multilineText |  |
| Mental Health Score | `fld8iUJt8r81zWUwL` | singleSelect | 5, 4, 3, 2, 1 |
| mental health score number | `fldqQwkNgQFtjWcJG` | formula | `VALUE({fld8iUJt8r81zWUwL})` |
| Team Summary | `fldqeXNogdX5wPC9G` | singleLineText |  |
| Question | `fldcSYDkv1T0EIAN8` | singleLineText |  |

## Email Accounts

`tblMSOBJ0wMgxSg4l`

| Field | ID | Type | Options / formula |
|---|---|---|---|
| Email Account | `fldRYSB93NNdBc4Js` | email |  |
| Email ID | `fldR19WUqSSBVQcPO` | number |  |
| Workspace ID | `fldWB4pvEgQ8aYlT2` | number |  |
| Warmup Start Date | `fldURrj0qP1DnAKyD` | date |  |
| Days Since Warmup Started | `fldm9axRACWn8QZeY` | formula | `DATETIME_DIFF(TODAY(), {fldURrj0qP1DnAKyD}, 'days')` |
| Number of Disconnects | `fldm2q2OfWBOWJpvq` | number |  |
| Client | `flduDcGap2GSsqUia` | multipleRecordLinks | → Workspace IDs |
| Status (from Client) | `fldlgG4ThDRjNPqhE` | multipleLookupValues |  |
| EmailBison API (from Client) | `fldmtoFtsw7x3ViLT` | multipleLookupValues |  |
| Created | `fldByacUHlJ876pmL` | createdTime |  |
| Last Warmup Check | `fldJzkpAXYvAXwstG` | dateTime |  |
| warmup_enabled | `fldFI8B4tk1H5AN7b` | checkbox |  |
| warmup_daily_limit | `fldipNbxDT5NutIVl` | number |  |
| warmup_emails_sent | `fldbhjuMGnrX0fI0j` | number |  |
| warmup_replies_received | `fldXvR8XePYtAx4Bo` | number |  |
| warmup_emails_saved_from_spam | `fldt51ApUYwF4mMXq` | number |  |
| warmup_score | `fldzAnqlrgiM6iIg5` | number |  |
| warmup_bounces_received_count | `fldtMbdZuuebndFtQ` | number |  |
| warmup_bounces_caused_count | `fldN0OuVQvjWKgZSk` | number |  |
| warmup_disabled_for_bouncing_count | `fldA1KUejYDma4Pjn` | number |  |
| emails_sent_count | `flddauyX2jz0OagRs` | number |  |
| total_replied_count | `fldwH5nm92s2WJ2Jk` | number |  |
| unsubscribed_count | `fldImtATaSoDueLPG` | number |  |
| bounced_count | `fld38XYE9GeBmSdei` | number |  |
| unique_replied_count | `fldj8YU1b3CpzMVhM` | number |  |
| total_leads_contacted_count | `fldPXgdtNEnLejTRH` | number |  |
| interested_leads_count | `fldrM37XumnbxNg6o` | number |  |
| email_status | `fldvyAN2hm6gmfG86` | singleLineText |  |
| email_type | `fldEHciTupaM82ONm` | singleLineText |  |
| email_daily_limit | `fldBP1gljUUM44JMk` | number |  |
| Last Time Disconnected | `fldivgpoNGwU8MW7p` | dateTime |  |
| Actions | `fldrVXRwWtveMC1Jy` | singleSelect | Update Daily Limit, Update Warmup Limit, Turn Warmup On, Turn Warmup Off, N/A |
| warmup_disable_status | `fld7DSLRuadZCQpRu` | singleSelect | Warmup disabled for receiving bounces. You can enable after 24 hours., Warmup disabled for causing bounces |
| Status | `fldzPjNciWil86nkI` | singleSelect | Healthy, At Risk, Spam, Resting |
| Health Reason | `fldkU6bwyH0dsCGBE` | multipleSelects | Poor Inbox Placement, Low Warmup Score, High Bounce Rate, Low Reply Rate, Blacklist, Manual Review |
| Campaigns | `fldJJWRwowtWJhIfg` | multipleRecordLinks | → Campaigns |
| Domains | `fldzuKJl0AnFCtYEB` | multipleRecordLinks | → Domains |
| Login Password | `fldCgvkLFPb77PvZQ` | singleLineText |  |
| Login URL | `fldjGo0CMuyRntVUU` | url |  |
| Client Visible | `fldk8BDlpa6vtcagY` | checkbox |  |
| Control Sync Status | `fldh7W0HIbA2rtbfi` | singleSelect | Pending, Processing, Synced, Failed |
| Control Sync Error | `fldjGxLkcXqVGgdII` | multilineText |  |
| Last Control Sync | `fld6HkrNfjaqtNCv6` | dateTime |  |
| Email Account Bulk Controls | `fldyZWb54Ni2zeVNW` | multipleRecordLinks | → Email Account Bulk Controls |
| KPI Warmup Disabled | `fldcGzYOdGojcXcC0` | formula | `IF(AND(ARRAYJOIN({fldlgG4ThDRjNPqhE})='Active',NOT({fldFI8B4tk1H5AN7b})),1,0)` |
| KPI Active Account | `fld9yMEmVpi4I3atp` | formula | `IF(ARRAYJOIN({fldlgG4ThDRjNPqhE})='Active',1,0)` |
| KPI Disconnected | `fld7kEWPKmcHxFoZh` | formula | `IF(AND(ARRAYJOIN({fldlgG4ThDRjNPqhE})='Active',LOWER({fldvyAN2hm6gmfG86})!='connected'),1,0)` |
| KPI Warmup 75-100 | `fldgOz5ZDIL5sb50r` | formula | `IF(AND(ARRAYJOIN({fldlgG4ThDRjNPqhE})='Active',{fldzAnqlrgiM6iIg5}>=75),1,0)` |
| KPI Warmup 50-74 | `fldQXrSs7ocfc6Pl8` | formula | `IF(AND(ARRAYJOIN({fldlgG4ThDRjNPqhE})='Active',{fldzAnqlrgiM6iIg5}>=50,{fldzAnqlrgiM6iIg5}<75),1,0)` |
| KPI Warmup Under 50 | `fldftvSaXFexBBd5B` | formula | `IF(AND(ARRAYJOIN({fldlgG4ThDRjNPqhE})='Active',{fldzAnqlrgiM6iIg5}<50),1,0)` |
| Spam Protocol Stage | `fldkK0KB2ttWIqKul` | singleSelect | Monitoring, Resting 7 Days, Recovered, Replace Inbox, Replace Domain, Manual Review |
| Spam Rest Started | `fldZID9r0H6FhD0Ya` | dateTime |  |
| Spam Retest Due | `fldPeFfqi3dxGQYrN` | dateTime |  |
| Last Inbox Placement Score | `fldIJE2zZVbkMIYuD` | number |  |
| Previous Daily Limit | `fld1jbMReaLxB73yL` | number |  |
| Spam Failed Tests | `flddxhrjtkuW9LDMO` | number |  |
| Last Spam Protocol Action | `fldfm2qyk8GoS6aJ8` | dateTime |  |
| Spam Protocol Error | `fldUz0HiftgoiKp1j` | multilineText |  |
| Last Spam Protocol Test ID | `fldh26scJnI2X5qEO` | singleLineText |  |
| Spam Remediation Queue | `fldjWXpKngzTrWEQV` | multipleRecordLinks | → Spam Remediation Queue |

## Inbox Placement Testing

`tblGjv6A5r7md3kxX`

| Field | ID | Type | Options / formula |
|---|---|---|---|
| Email | `fldBOeDrX0BGFeY6X` | singleLineText |  |
| Email ID | `fld0Nxt1E3rI6lLFX` | number |  |
| Workspace ID | `fldN4eGJiYsVTJwjl` | number |  |
| Test ID | `fldBis89MNzkqMYt2` | singleLineText |  |
| Overall Score | `fldYG3TvlGxy61KFT` | number |  |
| Google Score | `fldd7MeNv7pQBlfvn` | number |  |
| Outlook Score | `fldG8jFN4BRJswCXH` | number |  |
| Test Date | `fldJRrQ2jtZ8PkiPb` | createdTime |  |
| Link to Client | `fldACO8xl50dYOjYt` | multipleRecordLinks | → Workspace IDs |
| Client Name | `fld8STvM2WrF33lZq` | multipleLookupValues |  |
| How many months ago was the test? | `fld3QBPM458RtbUXh` | formula | `DATETIME_DIFF(TODAY(), {fldJRrQ2jtZ8PkiPb}, 'months') ` |
| Spam Protocol Processed | `fldJD138nxBbamCB0` | checkbox |  |
| Spam Protocol Outcome | `fld3e9lL2t10b1tYG` | singleSelect | No Action, Rest Started, Recovered, Replace Inbox, Replace Domain, Failed |
| Spam Protocol Error | `fldGYnsHNtyKLnF5i` | multilineText |  |
| Spam Protocol Processed At | `fldr1zN2ToL0wuz9r` | dateTime |  |

## New Client Intake

`tbljivFOoUW2nZ6FN`

| Field | ID | Type | Options / formula |
|---|---|---|---|
| Company Name | `flds46bYAn9Un6oy0` | singleLineText |  |
| First Name | `fldETmxefy4BYULgd` | singleLineText |  |
| Last Name | `fld64exk1SAfjawMn` | singleLineText |  |
| Email | `fldibCYLzac81Ycei` | email |  |
| Company Address | `fldCE46pKsd7DkuCd` | singleLineText |  |
| Opportunity Name | `fldDjxoB8VtSfJQp6` | singleLineText |  |
| Reference Number | `fldBVVeNpAFPw2hfn` | singleLineText |  |
| Monthly Investment | `fldYgXtn2ihLIjYo3` | currency |  |
| Today's Investment | `fldVZhF8DdHiMT9lE` | currency |  |
| Revenue Share Percentage | `fldaVbllQu9HoUKZ5` | number |  |
| Create The Short Agreement Version | `fldXUPMKmpdUZ9xul` | checkbox |  |
| LinkedIn | `fldCQYFk8Sc8zGynk` | checkbox |  |
| AI / Cold Caller | `fldrgTgj9yzp8myHl` | checkbox |  |
| ai_meeting_reminders | `fldaw5zcp72KwLHTH` | checkbox |  |
| ai_noshow_followup | `fld25iAVnVxjmhqWg` | checkbox |  |
| ai_warm_followup | `fldaquna8OxvlqaHT` | checkbox |  |
| capture_us_visitors | `fldZ8doWmnmEx1LGN` | checkbox |  |
| Include 6 month agreement | `flds5zGh7xPOVOD9K` | checkbox |  |
| Target Revenue | `fldvY2tMRsUSjbJgD` | currency |  |
| Target Qualified Bookings | `fldpyxcmeXyrMZzxQ` | number |  |
| Target Closed Deals - word | `fld3NjH92ISf0qZmK` | singleLineText |  |
| Target Closed Deals - number | `fldI6LCCnI4ltLT2x` | number |  |
| Target Deal Price Point | `fldSZjQ3Mv9j2pJLc` | currency |  |
| Created | `fldAyoOVMXuxTcDSt` | createdTime |  |
| Already ran | `fldWpAJ9Dp2UHHME2` | checkbox |  |
| Agreement Status | `fldx8DL2DOAXaZbop` | singleSelect | Pending Creation, Draft, Sent, Viewed, Completed, Declined, Expired, Error |
| Create Agreement | `fldhofs7P34MsqlL7` | checkbox |  |
| Send Agreement | `fldlS3CZ5Wek8O9eB` | checkbox |  |
| PandaDoc Document ID | `fldh5QZesevqSW9DF` | singleLineText |  |
| PandaDoc Document URL | `fldxBfd7px8CtKvdL` | url |  |
| PandaDoc Created At | `fldHmUnJUS3B33BWU` | dateTime |  |
| PandaDoc Sent At | `fld69wdeGKUeDOljm` | dateTime |  |
| PandaDoc Viewed At | `fldmnoonaCkGC3jAC` | dateTime |  |
| PandaDoc Completed At | `fldwMor6QvuM0V9Mt` | dateTime |  |
| Agreement Error | `fldV48SDypqQC7paP` | multilineText |  |
| Last PandaDoc Sync | `fldtFNXCY3InLWpoV` | dateTime |  |
| Agreement Pending Count | `fldh3dIvJZLY0E95h` | formula | `IF(OR({fldx8DL2DOAXaZbop}='Pending Creation',{fldx8DL2DOAXaZbop}='Draft'),1,0)` |
| Agreement Sent Count | `fldiH3tgOTBBHHzJz` | formula | `IF({fldx8DL2DOAXaZbop}='Sent',1,0)` |
| Agreement Viewed Count | `fldonuAjCGoDZYeRX` | formula | `IF({fldx8DL2DOAXaZbop}='Viewed',1,0)` |
| Agreement Completed Count | `fldxuQQSNdQvwRqOz` | formula | `IF({fldx8DL2DOAXaZbop}='Completed',1,0)` |
| Agreement Attention Count | `fld38inF3uaHlcXkl` | formula | `IF(OR({fldx8DL2DOAXaZbop}='Declined',{fldx8DL2DOAXaZbop}='Expired',{fldx8DL2DOAXaZbop}='Error'),1,0)` |
| Direct Mail | `fldfGlMm7D62acTVI` | checkbox |  |
| Search Close Lead | `fldc7CU8HSLDIkB6B` | singleLineText |  |
| Monthly Technology Fee | `fldBYuLO8pIEjOhzi` | currency |  |
| Price Per Qualified Call | `fldsRI56LJLCgp8A6` | currency |  |
| Send SignWell Agreement | `fldzg3PLVRWRejceQ` | checkbox |  |
| SignWell Document ID | `fldC1x5IOuOQylODU` | singleLineText |  |
| SignWell Document URL | `fldwU7mqZNHKSOEhg` | url |  |
| SignWell Created At | `fldWO8tFf8sesf5gx` | dateTime |  |
| SignWell Sent At | `fldqPSK6YKXobCikl` | dateTime |  |
| SignWell Viewed At | `fldhHTae364IjgGIc` | dateTime |  |
| SignWell Completed At | `fldGhrzJXp2iREHMd` | dateTime |  |
| SignWell Last Event | `fld9bHEF3m7uSg9fe` | singleLineText |  |
| Last SignWell Sync | `fldkMLEEyMedbKfEM` | dateTime |  |
| SignWell Error | `fldXhQRuqYp1slLWh` | multilineText |  |
| SignWell Completion Forwarded At | `fldvgKLAomk1dZi9r` | dateTime |  |
| Agreement Type | `fldHqH5S87HuKfQOX` | singleSelect | Pay Per Qualified Call, Monthly Investment |
| Signed Agreement | `fld0OkDtx4MLgjLM9` | multipleAttachments |  |
| Start Date | `fldZAsLGQwzyiglyO` | date |  |
| Create SignWell Draft | `fldTmiFVjSUNK5gLY` | checkbox |  |
| Agreement Currency | `fldIqufbAnYsmZcpS` | singleSelect | USD, GBP, EUR |
| Workspace IDs | `fldzKjlgwusuJbGxh` | multipleRecordLinks | → Workspace IDs |
| Contracts | `fldaxkDEl73r49TVt` | multipleRecordLinks | → Contracts |
| Dulcy Preparation Record ID | `fldbtoTSeOEI0F5wS` | singleLineText |  |

## Documents

`tblwo2vuDBBdOHFsz`

| Field | ID | Type | Options / formula |
|---|---|---|---|
| Title | `fldXo0RIDVSuTMYqF` | singleLineText |  |
| Description | `fldFQCpqYD5SZRSnV` | richText |  |
| Attachments | `fldRGhqS4EmziHpu2` | multipleAttachments |  |
| Workspace IDs | `fldFB8kIbhCMHDarP` | multipleRecordLinks | → Workspace IDs |
| Record ID (from Workspace IDs) | `fld7sD4fx8SGc9RxZ` | multipleLookupValues |  |
| Uploaded By | `fldX0AJZstxqFt7bg` | singleSelect | Client, Dulcy |
| Internal? | `fld9b4IlPxB9X5oVa` | checkbox |  |
| Last Modified | `fldcrO2luYQ5kok5Q` | lastModifiedTime |  |

## Client Meetings

`tbldiv2czPkJ1zeQE`

| Field | ID | Type | Options / formula |
|---|---|---|---|
| Meeting Title | `fldEitoqz9B06ExOK` | singleLineText |  |
| Summary | `fldmK5W8UROocJrL0` | richText |  |
| Date of Event | `fldyAKXA0S55vzYS7` | date |  |
| Meeting Recording | `fldFMnIpm6b2S5zhL` | url |  |
| Workspace IDs | `fldmvBRq7vliUvJPU` | multipleRecordLinks | → Workspace IDs |
| Record ID (from Workspace IDs) | `fldOm6BXtmBcp1qV4` | multipleLookupValues |  |
| Hide | `fld4MD7KJr1RpbGdc` | checkbox |  |

## Client Invoices

`tblxGQqMzeEu23iHi`

| Field | ID | Type | Options / formula |
|---|---|---|---|
| ID | `fldSTgGRokNJwZp7a` | singleLineText |  |
| Amount | `fld9hZw9TzROZKmQc` | number |  |
| Date | `fldl4ud7hTdlXsSSZ` | dateTime |  |
| Type | `fld4EjkIMQbPrW5I3` | singleSelect | Successful, Unpaid |
| Client | `fldsMWMdN7B4YkMo8` | multipleRecordLinks | → Workspace IDs |
| Hide | `fldpryfkY1uVbeTaL` | checkbox |  |
| Billing Period Start | `fldnQ3R7szCzSEIcJ` | date |  |
| Billing Period End | `fldWpHlYz7BNZK0JN` | date |  |
| Billable Calls | `flduAMBy7r7P31SuI` | number |  |
| Credits Applied | `fldORKav6YN38J7Nz` | number |  |
| Invoice Currency | `fldIgatj1KUro6wXk` | singleLineText |  |
| Batch Reference | `fldTPqZZ9Ebs0d2D3` | singleLineText |  |
| Xero Invoice ID | `fldYJ9Ye5xs0otDeE` | singleLineText |  |
| Xero Invoice Link | `fldjhUHG6Ittk4W4C` | url |  |
| Invoice Status | `fldNJY30aY5EZweAX` | singleSelect | Needs Review, Reserved, Draft, Awaiting Payment, Paid, Voided, Uncertain |
| Email Sent At | `fldxeexsyPlw3nccF` | dateTime |  |
| Billing Evidence | `fldjVBZoEBSKbnGvF` | multilineText |  |
| Call Invoice Coverage | `fldlySzWIxRpDWVfO` | multipleRecordLinks | → Call Invoice Coverage |

## Client Tasks

`tblB97qvoidTSi9Vr`

| Field | ID | Type | Options / formula |
|---|---|---|---|
| Task | `fld9ZbsQc4mrQO0GX` | singleLineText |  |
| Description | `fldaM5Lx0TRzS8yLS` | richText |  |
| Stage | `fldKNlgMuXrS2TJ9U` | singleSelect | New Task, Blocked, Done |
| Client | `fldmgwSf9NbMgFDCi` | multipleRecordLinks | → Workspace IDs |
| Attachments | `fld3c9Dula6AYVZSm` | multipleAttachments |  |
| Last Modified | `fldfAherhhCr9m93D` | lastModifiedTime |  |
| Name (from Templates) | `fldT6PGH7kYh6hbv5` | multipleLookupValues |  |

## Tasks

`tblRBxm2N53331mIm`

| Field | ID | Type | Options / formula |
|---|---|---|---|
| Task Name | `fldWrFb99wzxaMcG5` | singleLineText |  |
| Client | `fldGpegEE7flJMNKE` | multipleRecordLinks | → Workspace IDs |
| Campaign | `fldKkc0bjUB6VYgz7` | multipleRecordLinks | → Campaigns |
| Assignee | `fldajXwWvS8zusURS` | multipleRecordLinks | → Portal Users |
| Stage | `fld1hJsrkZM8Nsyk3` | singleSelect | Intake, Planning, Execution, Review/QA, Completed, Blocked |
| Due Date | `fldY96iXNDEyAP55n` | date |  |
| Priority | `fldwn4GL0LPUrY0Tg` | singleSelect | Urgent, High, Medium, Low |
| Status | `fldnlUbFIsgrGd4PI` | singleSelect | Not Started, In Progress, Done, Blocked |
| Notes | `fldswSNtDML9iDp9A` | multilineText |  |
| Last Updated | `fldFJZc42D5AUv6Yk` | lastModifiedTime |  |
| Created | `fld6ALPNHEE6BXMMH` | createdTime |  |
| Time Ago | `fldWNz35yDPsLY3DM` | formula | `FROMNOW({fldFJZc42D5AUv6Yk}) & " ago"` |
| Calculation | `fldrVM9c2qe52h2Kn` | formula | `DATETIME_DIFF({fldY96iXNDEyAP55n}, TODAY(), 'days')` |
| Client Facing | `fldYSmlrlpW50wxT1` | checkbox |  |
| Project Health | `fld4fi6iLzd8KjaIE` | singleSelect | On Track, At Risk, Overdue, On Hold |
| Last Modified | `fldef8wGe7LUFVSkO` | lastModifiedTime |  |
| Automation Alert Type | `fld9Jg38SfN8Bq8BB` | singleSelect | Increasing Bounce Rate, Low Reply Rate, Positive Reply Rate, Poor Inbox Placement, Campaign Not Performing, Other |
| Automation Key | `fldkpzbiyqkVAtPEd` | singleLineText |  |
| Open Automation Key | `fldhR089GMEsbDOm9` | formula | `IF(AND({fldkpzbiyqkVAtPEd} != '', {fldnlUbFIsgrGd4PI} != 'Done'), {fldkpzbiyqkVAtPEd}, BLANK())` |

## Client Notifications

`tblwJK1VB7affamrz`

| Field | ID | Type | Options / formula |
|---|---|---|---|
| Title | `fldiwUMk8RoJFV4wJ` | singleLineText |  |
| Message | `fldqpuxQEANRIdb4C` | multilineText |  |
| Client | `fld42VOgZrdKqcVM8` | multipleRecordLinks | → Workspace IDs |
| Type | `fldByGNugWy5XO0Br` | singleSelect | Task, Lead, Campaign, Booked Meeting, Document, Call Feedback, System |
| Time Since Created | `fldb0jSQZ0qXrsMdG` | formula | `FROMNOW({fldeBXp6V15F1NXwj}) & " ago"` |
| Dismissed | `flduntfLy4DDoIlDL` | checkbox |  |
| NotifiedSlack | `fldRAGDWLDIiZbZVU` | checkbox |  |
| Created Time | `fldeBXp6V15F1NXwj` | createdTime |  |

## Email Bison Campaign Settings

`tbltzcefgnkb6AWR3`

| Field | ID | Type | Options / formula |
|---|---|---|---|
| Campaign Name | `fld83MKcofx8oIQjd` | singleLineText |  |
| Campaign Type | `fldfgbPhyjULu3E3m` | singleSelect | inbound, outbound |
| Run on Monday | `fldi13zBUzvFU80wZ` | checkbox |  |
| Run on Tuesday | `fldgZKMpqj715XcLY` | checkbox |  |
| Run on Wednesday | `fldxe8sIA6AuWTJ1h` | checkbox |  |
| Run on Thursday | `fldexeuEGqXpsUdLY` | checkbox |  |
| Run on Friday | `fldZEIN6rnlX2r6VH` | checkbox |  |
| Run on Saturday | `fldPQKN6K6OxRYFCg` | checkbox |  |
| Run on Sunday | `fldYZzaANMMfCDCqd` | checkbox |  |
| start_time | `fldQrgeYy5Uq2zHWa` | singleLineText |  |
| end_time | `fldQT7H0W18v9hPTa` | singleLineText |  |
| TimeZone | `fldLVEYE4QXvuccNI` | singleSelect | America/New_York |
| save_as_template | `fldiOiJWADeD7zXTR` | checkbox |  |
| max_emails_per_day | `fld1yRHgoODhYJteU` | number |  |
| max_new_leads_per_day | `fldwKKqsPh08kWVvy` | number |  |
| plain_text | `fldJtSEV2tCokiogt` | checkbox |  |
| open_tracking | `fldNbGnz1fwy6PIpX` | checkbox |  |
| reputation_building | `flddcKktX6CIrkRx5` | checkbox |  |
| can_unsubscribe | `fldwNhmyIBlwzB9Ux` | checkbox |  |
| unsubscribe_text | `fld5KOM5azOWPg1WK` | multilineText |  |
| Campaign ID | `fldX6NcJRrOa5sk8q` | number |  |
| Campaign | `fldUaiC8LB5ndR9JQ` | multipleRecordLinks | → Campaigns |

## Content Channels (Alex Woung)

`tblcSzvicm3wivvhh`

| Field | ID | Type | Options / formula |
|---|---|---|---|
| Date | `fldaLQaUuJz0Afu6h` | date |  |
| Title | `fld0dz5F0ROLEE4Wy` | singleLineText |  |
| Description | `fld3Dynj1W5bNh5O7` | richText |  |
| Script | `fldFj3EasjFxxkwCn` | multilineText |  |
| Platform | `fld5Imj57Jokq4tri` | multipleSelects | YouTube, Instagram, Twitter, LinkedIn, TikTok, Reddit, Facebook, Ig Story, IG Stories |
| Style | `fld6SJanf19cAlQTt` | singleSelect | Shorts, Long Form, Post, Story Sequence, Other, IG Stories |
| Type | `fldHg1dEikmbBG7JZ` | singleSelect | Credibility, Value, Education, Other |
| Status | `fldWcMXU2M3xAwYjF` | singleSelect | Approved, Denied, Review, Posted, Scheduled, Ongoing Edit |
| Link | `fldk8CAhJUAsDWdLl` | url |  |
| Notes | `fldd38VZyWwchpGjI` | richText |  |
| Trigger | `fldFVUyh10N8sjujk` | checkbox |  |
| Production Stage | `fldQk3w4PUVrXwYaT` | singleSelect | Idea Approved, Script Ready, Scheduled to Record, Recorded, Editing, Ready for Thumbnail, Ready for Clips, Ready to Publish, Published, Blocked, Script |
| Frame.io Folder Name | `fld0rSelXFRy2hfzq` | singleLineText |  |
| Frame.io Raw Folder URL | `fldQMrNJf43tVfcja` | url |  |
| Frame.io Final Folder URL | `fldNf75BRKcHTYDpS` | url |  |
| Frame.io Final Asset URL | `fld9Q5xoY2RMnpI9j` | url |  |
| Frame.io Final Asset ID | `fld0uQG1C6JjC4hIs` | singleLineText |  |
| Thumbnail Status | `fldLrqDqzj8RpJXHS` | singleSelect | Not Started, Generating, Needs Review, Approved, Failed |
| Final Thumbnail URL | `fld7D4SawTmHSJ1HV` | url |  |
| OpusClip Project ID | `fldP1oNGOVEkAeULJ` | singleLineText |  |
| OpusClip Status | `fld5jzGsZAhq5278P` | singleSelect | Not Submitted, Processing, Clips Ready, Approved, Failed |
| Publishing Status | `fldPmbanBb8IAkdZx` | singleSelect | Not Scheduled, Scheduled, Published, Failed |
| Record This Week | `flddmHkAA7iDy5EQj` | checkbox |  |
| Last Automation Message | `fldmOfFh1HnCVbhVP` | multilineText |  |
| Automation Error | `fldzm6HMUBG4aY8mr` | multilineText |  |
| Content Clips | `fldIMEC5xz2UvbrFj` | multipleRecordLinks | → Content Clips |
| Content Automation Action | `fldwaCz7Bnob2jIqZ` | singleSelect | Sync Frame.io, Submit to OpusClip, Refresh Opus Clips, Generate Distribution Pack |
| Content Distribution | `fld2YGy5vpKWisE5d` | multipleRecordLinks | → Content Distribution |
| YouTube URL | `fldLwtuaidYVD0K8n` | url |  |
| YouTube Video ID | `fldrfTQx4AF0jRQkB` | singleLineText |  |
| YouTube Published At | `fldeep1b7vD1Vk9PE` | dateTime |  |
| YouTube Transcript | `fld13f1hP9c5zAxVS` | multilineText |  |
| Distribution Status | `fldlyDobu5EyzJxqX` | singleSelect | Not Started, Generating, Drafts Ready, Scheduled, Published, Failed |
| Recording Date | `fldJwxvRX4WxfcASD` | date |  |
| Publish Date | `fld33u5iDFqKNP4DM` | date |  |
| Editing Route | `fldQYgyv6isqSusXe` | singleSelect | OpusClip, Manual Editor |
| Content Source | `fldveCswHhxiscD1I` | singleSelect | Generated Idea, Manual Idea, Legacy Calendar, Legacy Raw |
| Content Channel | `fldpcwymoqz8mtBh9` | singleSelect | Alex Woung, Alex Woung Raw |
| YouTube Title | `fld3xEJ5687C30cJL` | singleLineText |  |
| YouTube Description | `fldoHO3clLWKw2Gns` | richText |  |
| YouTube Chapters | `fld7hWhOY2lNk0AfR` | multilineText |  |
| Distribution Channels | `fldgNrmXVNpFFs9jH` | multipleSelects | Instagram, YouTube Shorts, Reddit, X / Twitter, LinkedIn, Blog, Resource, Newsletter |
| Requested Clip Count | `fldFyh2QYx2W9NXnM` | number |  |
| Minimum Clip Score | `fldmKqA7cCbgPUiti` | number |  |
| Idea Score | `fldooc7Qygr1b6Tz5` | number |  |
| Idea Source URL | `fldrXemrcvGx4u0Mm` | url |  |
| Idea Source Community | `fld6ZkQRBdCHfV7Qp` | singleLineText |  |
| Idea Decision | `fld3M7y7fHCbahSxD` | singleLineText |  |
| Idea Qualification Reason | `fldhiGRSmlMdQxHYn` | multilineText |  |
| Content Story Sequences | `fldWz58Mr6ETl0w3r` | multipleRecordLinks | → Content Story Sequences |
| Content Story Frames | `flddJo6bBirR1KFxD` | multipleRecordLinks | → Content Story Frames |
| Idea Source Key | `fldcSWXaLW8a9NYOq` | singleLineText |  |
| Previous Thumbnail URL | `fldlQMtp6d4MuiiAn` | url |  |
| Thumbnail Revision Instructions | `fldWZV5X4F5d09bP1` | multilineText |  |
| Thumbnail Revision Request ID | `fld5R18BancvpeqKR` | singleLineText |  |
| OpusClip Short Project ID | `fldiiho0E7IRWZbT9` | singleLineText |  |
| OpusClip Short Source Asset ID | `fldXxLLMPqM8T72KV` | singleLineText |  |
| OpusClip Short Job State | `fldqZyPMUzLu0lb2g` | singleLineText |  |

## Dulcy Internal SOPs

`tblEmPw3dQZi7BrlS`

| Field | ID | Type | Options / formula |
|---|---|---|---|
| Name | `fldnhZxDWOmJNkNJW` | singleLineText |  |
| Document Type | `fldbj4gnfjqU5uFAf` | singleSelect | Internal Team SOP |
| Job Titles | `fldRNFEHwb1Kxs2nY` | multipleSelects | Executive Assistant |
| SOP Content | `fldAMFDwJefK3rsNY` | richText |  |
| Template | `fld6RGfwN7tJqpxha` | singleLineText |  |

## Team Attendance

`tblmGO2C2l0eRNQ7u`

| Field | ID | Type | Options / formula |
|---|---|---|---|
| Id | `fldCIEmk8qiFxbkmb` | autoNumber |  |
| Name | `fldxWUFpqB2t0gWXt` | multipleRecordLinks | → Portal Users |
| Leave Dates | `fldj73nv6X870J3f2` | date |  |
| Leave Dates End | `fldvYpzmceXSfadCS` | date |  |
| Type | `fldDGJGmn6H6CT4KM` | singleSelect | 🏖️ Vacation, 🤒 Sick, 🗓️ Public Holiday, 🏠 Personal |
| Handover Plan | `fldbYee0NilZW03fP` | multilineText |  |
| Status | `fldHkhWrqUP3DMVhN` | singleSelect | Draft, Pending Approval, Approved, Declined |
| CEO Approval | `fld0LTpdiDr1c8ML0` | singleCollaborator |  |

## Sales Data

`tblmEyHVAXDRwPxN9`

| Field | ID | Type | Options / formula |
|---|---|---|---|
| Opportunity Name | `fldUkwyW5NBQnic3s` | singleLineText |  |
| Account/Company Name | `fldAfEIsLhUkEjFvx` | singleLineText |  |
| Contact Name | `fldX3uxuihKYTh2iV` | singleLineText |  |
| Contact Email | `fld4mAVHq3bWR2ZQx` | singleLineText |  |
| Lead Source | `fldsz376BaSqtZzOW` | singleSelect | Cold Email, YouTube, Google, Instagram, Twitter/X, LinkedIn, Ads, Referral/Word Of Mouth |
| Sales Rep (Lead Owner) | `fldR2fbyM26Z0nM4m` | multipleRecordLinks | → Portal Users |
| Sales Pipeline Stage | `fldaUIYb694AOnaaM` | singleSelect | Audit Call Scheduled, Canceled, No Show, Reschedule, Follow Up Call, Call Done, Contract Sent, Lead Lists, Nurture, Won, Lost |
| Call Booked Date | `fld4ba7negAPQA8pk` | date |  |
| Call Held Date | `fld34mhdkOSbryqOh` | date |  |
| Deal Closed Date | `fldlGOBpFXOkiPpIn` | date |  |
| Offer Amount (Revenue Closed) | `fldEp5BBj3adebZ0o` | currency |  |
| Total Cash Collected | `fld0lJJLN9jldjimv` | currency |  |
| Notes | `fld8lShlrfclKslUo` | multilineText |  |
| Loss Reason | `fldKp9ytQFcUZJ3Oz` | singleSelect | Too Expensive, No Budget, Bad Timing, Competitor Chosen, Existing Vendor, Chose In-House, Not a Fit, No Decision Maker, No Response / Ghosted, Other |
| Days to Close | `fldN8UWwnhZ7xnOGh` | formula | `IF(   AND({fld4ba7negAPQA8pk}, {fldlGOBpFXOkiPpIn}),   DATETIME_DIFF(     {fldlGOBpFXOkiPpIn},     {fld4ba7negAPQA8pk},     'days'   ) )` |
| Created Date | `fld6X0mEBTUYwdAd9` | createdTime |  |
| Last Modified Date | `fldolgksF7G31l2Hp` | lastModifiedTime |  |
| Campaign | `fld2g4s2NePf3juoS` | multipleRecordLinks | → Campaigns |
| Emails | `fldcO105C4UhKtM7v` | multipleRecordLinks | → Emails |
| Call Booked? | `fld9asGRTxYCYRrHn` | checkbox |  |
| Call Held? | `fldgHPFpUj4g3o1Ma` | checkbox |  |
| Offer Made? | `fldWNRewGth8CqxnK` | checkbox |  |
| Deal Closed? | `fldsxeAkhHOUSa45z` | checkbox |  |
| Opportunity Value (Forecast) | `fldTh5bYDyRW1il0j` | currency |  |
| Booked Month | `flds98LGpavjN0He9` | multipleRecordLinks | → Sales Goals |
| Closed Month | `fldTRtXOO6WB6chW1` | multipleRecordLinks | → Sales Goals |
| Eligible for Show Rate | `flddMiOeRUP0vyvsp` | formula | `IF(   AND(     {fld4ba7negAPQA8pk},     {fld4ba7negAPQA8pk} <= TODAY()   ),   1,   0 )` |
| Booked Month Text | `fldrzJrg6lBHc5py4` | formula | `DATETIME_FORMAT({fld4ba7negAPQA8pk}, 'MMMM YYYY')` |
| Closed Month Text | `fldsxnIP9NFNaqT2H` | formula | `DATETIME_FORMAT({fldlGOBpFXOkiPpIn}, 'MMMM YYYY')` |
| Booking → Show Rate | `fldWU13hVov3oSTDZ` | multipleLookupValues |  |
| Show → Offer Rate | `fldpBvSAytwI7AP19` | multipleLookupValues |  |
| Calls to Goal | `fldMTjmXSTzmzKuCK` | multipleLookupValues |  |
| Offer → Close Rate | `fldqw8VLT9Le9mZf4` | multipleLookupValues |  |
| Booking → Close Ratio | `fldxXdWVrV69WvNmn` | multipleLookupValues |  |
| Revenue to Goal | `fldK4JTBXAdi7VGOy` | multipleLookupValues |  |
| Cash Collected / Monthly Goal | `fld3p81gHFtvoQHaf` | multipleLookupValues |  |
| Deals to Goal | `fldP8BpKUwd9pTDNS` | multipleLookupValues |  |

## Sales Goals

`tbl9RIrdbapavGdI0`

| Field | ID | Type | Options / formula |
|---|---|---|---|
| Month | `fldyMn4xAsSsVcgLW` | singleLineText |  |
| Date | `fldEQYFlxaqmbIyAI` | date |  |
| Revenue Goal | `fldspmYjIhRdGMPAM` | currency |  |
| Cash Collected Goal | `fld2QFTJiFiby5a1P` | currency |  |
| Calls Goal | `fld90phsp5D6q6GEB` | number |  |
| Deals Goal | `flddQglaQbHUz8rMb` | number |  |
| Estimated Growth Rate For Month | `fldqPhz3xiJVWHYd2` | percent |  |
| Confidence | `fldeovslY51mdm5ve` | singleLineText |  |
| Reasoning | `fld1ePGZlcLkxu4S7` | multilineText |  |
| Booked Month | `fldAfZ7aAbKjbgfHn` | multipleRecordLinks | → Sales Data |
| Closed Month | `fldkfhqCZXmiaOSeB` | multipleRecordLinks | → Sales Data |
| Total Calls Booked | `fldMJjrPOl8LJkCKx` | rollup |  |
| Total Eligible Calls | `fldxUlzbenSdCBuTg` | rollup |  |
| Total Calls Held | `fld4zBU26rYWbrKOL` | rollup |  |
| Total Offers Made | `fldwgOa5fcZdvHe2V` | rollup |  |
| Total Deals Closed | `fldgiT9k0ECC8n20q` | rollup |  |
| Revenue Closed | `fldzMQ6rRjn0Dejc0` | rollup |  |
| Cash Collected | `fldQ5iutVcrLcQbJF` | rollup |  |
| Avg Days to Close | `fldKzReC40LmC6UG3` | rollup |  |
| Booking → Show Rate | `fldr7xY4srgTPzaX8` | formula | `IF(   {fldxUlzbenSdCBuTg} > 0,   {fld4zBU26rYWbrKOL} / {fldxUlzbenSdCBuTg} )` |
| Show → Offer Rate | `fldIpmrqlu8LZ5BhU` | formula | `IF(   {fld4zBU26rYWbrKOL} > 0,   {fldwgOa5fcZdvHe2V} / {fld4zBU26rYWbrKOL} )` |
| Offer → Close Rate | `fldVIyxAUczuli1OK` | formula | `IF(   {fldwgOa5fcZdvHe2V} > 0,   {fldgiT9k0ECC8n20q} / {fldwgOa5fcZdvHe2V} )` |
| Booking → Close Ratio | `fldLShzxNr5xaP6Cj` | formula | `IF(   {fldgiT9k0ECC8n20q} > 0,   {fldxUlzbenSdCBuTg} / {fldgiT9k0ECC8n20q} )` |
| Revenue to Goal | `fldQM9tpaiuyzOG0n` | formula | `IF(   {fldspmYjIhRdGMPAM} > 0,   {fldzMQ6rRjn0Dejc0} / {fldspmYjIhRdGMPAM} )` |
| Cash Collected / Monthly Goal | `fldciLN4dNRGpaVPd` | formula | `IF(   {fld2QFTJiFiby5a1P} > 0,   {fldQ5iutVcrLcQbJF} / {fld2QFTJiFiby5a1P} )` |
| Calls to Goal | `fldDReyWjcwqhzuvt` | formula | `IF(   {fld90phsp5D6q6GEB} > 0,   {fldMJjrPOl8LJkCKx} / {fld90phsp5D6q6GEB} )` |
| Deals to Goal | `fldxFwJI3mnkwZobw` | formula | `IF(   {flddQglaQbHUz8rMb} > 0,   {fldgiT9k0ECC8n20q} / {flddQglaQbHUz8rMb} )` |

## Executive Insights

`tblfCdONBpVWub6Zo`

| Field | ID | Type | Options / formula |
|---|---|---|---|
| Insight Name | `fldpkMBXsOQGjtotq` | singleLineText |  |
| Insight Value | `fldr5ZVUui1XyG7WE` | singleLineText |  |
| Supporting Metric | `fldgsIxtWLv8uVqPU` | singleLineText |  |
| Period | `fldp0qiW3CbpzZGLC` | singleLineText |  |
| Linked Data | `fldrgNNNV76IXlyyE` | singleLineText |  |

## Sync Table

`tblVGlYhqLc65UaH1`

| Field | ID | Type | Options / formula |
|---|---|---|---|
| Record Name | `fldUC0KfLR6KBzugx` | singleLineText |  |
| Opportunity ID | `fldsxbMhVbnUU9YL5` | singleLineText |  |
| Opportunity Name | `fldiDNdVbNRdAmLJP` | singleLineText |  |
| Account/Company Name | `fld7WOTCoAif8Z6Sb` | singleLineText |  |
| Lead Source | `fldRvqTI1ElFndGgv` | singleLineText |  |
| Opportunity Owner / Closer | `fldKDggV2diUI9vGJ` | singleLineText |  |
| Pipeline Stage | `fldi6xWoy9MOP7KBa` | singleLineText |  |
| Call Booked Date | `fldiMWvBnC3F14qaD` | date |  |
| Call Held Date | `fldtL0rwKsvWQJYlF` | date |  |
| Offer Made Date | `fldCjW1wqehYHPTqE` | date |  |
| Deal Closed Date | `fldjS4DjGumL2C9At` | date |  |
| Closed? | `fldUXODc1a5hwhZ3z` | singleSelect | Yes, No |
| Outcome | `fldLnzWJ5bMgjx8Lv` | singleSelect | Closed Won, Closed Lost, No Show, Rescheduled, Not Qualified, Ghosted, Other |
| Close Reason | `fldCkDJuyqj7aPdCL` | singleLineText |  |
| Offer Amount (Revenue Closed) | `fldsFcqObMxEmTeGq` | currency |  |
| Total Cash Collected | `fld4yO7VXdMQpkygr` | currency |  |
| Created Date | `fld1vn0iv4kQdTvJf` | date |  |
| Last Modified Date | `fld2EPxhmMG1qtgZL` | date |  |
| Campaign Name | `fld9lHFi4wEixUxQY` | singleLineText |  |
| Client Name | `fldSCE8LEru6hH9k1` | singleLineText |  |
| Contact Email | `fldbfmOs1Jvbz4F5L` | singleLineText |  |
| Contact Name | `fldfXXdscnnD37Wkh` | singleLineText |  |
| Next Activity Date | `fldTOvhT5O5HWCRs8` | date |  |
| Days in Current Stage | `fldACAEZrwlHTjU4r` | number |  |
| Days to Close | `fld4hA088PvmWmt4b` | number |  |
| Loss Reason (Detail) | `fldd5KVQ2p2rfZZqo` | singleLineText |  |
| Notes | `fldztZukUG01QyJnj` | multilineText |  |
| Last Activity Type | `fldz08jyvBk8dgFJR` | singleLineText |  |
| Last Activity Date | `fld76u6fwCzhZiDa1` | date |  |
| Raw Source System | `fld9XNoFkVUfyG3h2` | singleLineText |  |

## Content Clips

`tblg1Tj9atyxN0piT`

| Field | ID | Type | Options / formula |
|---|---|---|---|
| Clip Name | `fldaBp4mojdTWCTLk` | singleLineText |  |
| OpusClip Clip ID | `fldzR1TM7K288Dsto` | singleLineText |  |
| Frame.io Clip URL | `flddpK92veotSNWxV` | url |  |
| Platforms | `fld8a4THXeohHyvQC` | multipleSelects | Instagram Reels, YouTube Shorts, TikTok, LinkedIn |
| Virality Score | `fldb8Z6t9ASVd3Jtx` | number |  |
| Hook | `fld0Vlae8vxvcHEBL` | multilineText |  |
| Caption | `fldwTGDOuqducDbRN` | multilineText |  |
| Clip Status | `fldYjoD70SRrSlBox` | singleSelect | Proposed, Needs Review, Approved, Rejected, Scheduled, Published, Failed |
| Published URL | `fldiQRXynwaMgXv1T` | url |  |
| Automation Error | `fld8KoKxEOYwq75L7` | multilineText |  |
| Parent Content | `fldU7Rtnsm0zjnLHp` | multipleRecordLinks | → Content Channels (Alex Woung) |
| Scheduled Date | `fldMDbYqNtOSKjJOW` | date |  |
| Content Distribution | `fldZrH7nJGJq2l50W` | multipleRecordLinks | → Content Distribution |
| Clip Transcript | `fldL2TMrJ9rnwXltx` | multilineText |  |
| Editorial Review Notes | `fldbMj0DrFB8QmLNC` | multilineText |  |
| Review Intent JSON | `fldHPQdkRjYozUdGp` | multilineText |  |
| Review Snapshot JSON | `fldG9gklzS07bEbrz` | multilineText |  |
| Review Receipt JSON | `fldF4cRY2Fmru5Nsr` | multilineText |  |
| Review Intent Author | `fldrkWwDR0fYL8TDx` | lastModifiedBy |  |

## Domains

`tblJHdcoT1x3vh3DN`

| Field | ID | Type | Options / formula |
|---|---|---|---|
| Domain | `fld1CJjKp6bfC9nD8` | singleLineText |  |
| Client / Workspace | `fld1TKnHmhsVsDFxh` | multipleRecordLinks | → Workspace IDs |
| Email Accounts | `fldhTvUpuBrxbBYuB` | multipleRecordLinks | → Email Accounts |
| Domain Provider | `fldIiEIemY6gi8Dm5` | singleSelect | CheapInboxes, Porkbun, Cloudflare, Other |
| Inbox Provider | `fld2B2If1tvGQIBnx` | singleSelect | CheapInboxes, Google Workspace, Microsoft 365, Other, Google |
| Purchase Status | `fldjSv1gRrfcAPWwh` | singleSelect | Requested, Ordered, Provisioned, Cancelled, Provisioning |
| Purchase Date | `fldUh0K30mMHWGQL5` | date |  |
| Renewal Date | `fldqeipa13jE6ahsu` | date |  |
| Annual Cost | `fldoSYi9h6blBKBw4` | currency |  |
| Provider Order ID | `fldJrfUDYYycVEeKt` | singleLineText |  |
| Provider Dashboard URL | `fldrNut878at85ueh` | url |  |
| EmailGuard Domain ID | `fldIxgC7EqGOATHN8` | singleLineText |  |
| Monitoring Status | `fldGGTI4kcL2hYhpC` | singleSelect | Not Added, Active, Paused, Error, Pending EmailGuard, Needs Attention |
| Blacklist Status | `fldpv3pjY2BycGXLm` | singleSelect | Unknown, Clean, Listed, Check Failed, Pending |
| Blacklist Count | `fldIDXl70fdK1wn9S` | number |  |
| Blacklists Found | `fldw6A1GnyKLq9GI6` | multilineText |  |
| Last Blacklist Check | `fldw3aT7ozv9pI2oQ` | dateTime |  |
| Domain Health | `fldEuSXXjfUo03KAX` | singleSelect | Healthy, At Risk, Blacklisted, Inactive |
| Notes | `fldPFZIVczuMOVvOm` | richText |  |
| Email Account Count | `fld87djpqQdDPSHFF` | number |  |
| Average Warmup Score | `fldDn4JbtQpTJc9yI` | number |  |
| Total Emails Sent | `flduwMQO9NIzoNwS5` | number |  |
| Total Replies | `fldFw5mt90H1Ekzz5` | number |  |
| Total Bounces | `fldvowWWnP7wA1xjL` | number |  |
| Bounce Rate | `fld1oKfB4jzAhKcUW` | percent |  |
| Reply Rate | `fldqYRpxWA0YMs0f0` | percent |  |
| Latest Inbox Placement Score | `fldR27HEzVDqPSbwF` | number |  |
| Last Account Metrics Sync | `fldyLfAGIQFbePsIg` | dateTime |  |
| Last Blacklist Check ID | `fldkE9Lj6vyA8OB2f` | singleLineText |  |
| Requested Mailbox Count | `fldQ8jN4MChu9lVOU` | number |  |
| Mailbox 1 First Name | `fld8i7r4YwcfGGmeq` | singleLineText |  |
| Mailbox 1 Last Name | `fld7nNtDVYErXhhyw` | singleLineText |  |
| Mailbox 1 Prefix | `fldyoW0jIJiyWdSHS` | singleLineText |  |
| Mailbox 2 Last Name | `fldY0Wwc5CE6sl6JV` | singleLineText |  |
| Quote Total Today | `fldT0kIiN6pILbBGC` | currency |  |
| Promo Code | `fldP7wncuQmGS4r1X` | singleLineText |  |
| Mailbox 2 First Name | `fldGLQEFz7pK1LAJh` | singleLineText |  |
| Mailbox 2 Prefix | `fldVKRZuefqjcaS5E` | singleLineText |  |
| Quote Status | `fld8LhjwmaFqx5DHL` | singleSelect | Not Quoted, Quote Requested, Ready for Approval, Approved, Expired, Failed |
| CheapInboxes Domain ID | `fldXGCj0DFHA5MK11` | singleLineText |  |
| Approve Purchase | `fldaMhKqMHkW1MH78` | checkbox |  |
| Quote Generated At | `fldGIrBj1hzoQxInm` | dateTime |  |
| Purchase Error | `fldtwEVOxcbgKd7R5` | multilineText |  |
| Quote Monthly Cost | `fldFCH6igBJtqCWCW` | currency |  |
| Provisioning Status | `flda43cFGDqThouU9` | singleSelect | Not Started, Order Submitted, Provisioning, Credentials Ready, Active, Failed |
| Quote Domain Cost | `fldLc1GbFU8LSXww2` | currency |  |
| Mailbox Source | `fld8jXv0QO0aTWuE4` | singleSelect | Direct Panel, CheapInboxes, Other |
| Spam Remediation Queue | `fldzrLJxwm3i4lyni` | multipleRecordLinks | → Spam Remediation Queue |

## Domain Purchase Requests

`tblU6OstDVWeuYBxL`

| Field | ID | Type | Options / formula |
|---|---|---|---|
| Request | `flddkK2YMz7lmEJ6F` | singleLineText |  |
| Client / Workspace | `flduT4HhXCc6ul7yp` | multipleRecordLinks | → Workspace IDs |
| Domain Count | `fldPsjDm14vpm3J1G` | number |  |
| Preferred TLDs | `fldCoyVisjmsbmSnf` | multipleSelects | .com, .info, .co, .net, ..com |
| Inbox Provider | `fldfSpe0lKsbdPvsn` | singleSelect | Google, Microsoft |
| Status | `fldaM0gBqQqOA9ine` | singleSelect | Draft, Generate Domains, Searching Availability, Ready for Approval, Approved, Purchasing, Provisioning, Completed, Failed |
| Quote Total Today | `fldpSYgv1IVC4MEGs` | currency |  |
| Monthly Inbox Cost | `fld9ZLjeMfmvRXCGT` | currency |  |
| Approve Purchase | `fldF4hvF1oWwC8YdE` | checkbox |  |
| CheapInboxes Order ID | `fldWeAhhhnUZQPtUy` | singleLineText |  |
| Automation Error | `fldHLfsVVv7gD03GX` | multilineText |  |
| Onboarding Record ID | `fldietiLOVirTNxYk` | singleLineText |  |
| Last Name | `fldcZXSnOWY91Sm7z` | singleLineText |  |
| First Name | `fldaPZ3wcSTfh7CuC` | singleLineText |  |
| Mailbox Password | `fldXadpWkyEanTp1t` | singleLineText |  |
| Profile Picture URL | `fldloELh2DflgUmCs` | url |  |
| Email Username Pattern | `fldTfk1fwL6vWTOGn` | singleLineText |  |
| Suggested Domain Seeds | `fldR7GTP1ctjuNq5E` | multilineText |  |
| Selected Domains | `fldLLJfPgHJLZa5yk` | multilineText |  |
| Available Domain Count | `fldJq4s2nUHYShEmZ` | number |  |
| Total Mailboxes | `fldBT7EnVOOFLhRVb` | number |  |
| Last Provisioning Check | `fldf8zlondzrTAbhE` | dateTime |  |
| Promo Code | `fldGDDpga6etOhGwT` | singleLineText |  |
| Quote Generated At | `fldbPg1APbu6eVnZE` | dateTime |  |
| Batch Size | `fld5R1QjTaUpAIejz` | number |  |
| Minutes Between Batches | `fldo5y9qR4hWkAz9F` | number |  |
| Total Batches | `fldqzgoeTaKi1uKCn` | number |  |
| Batch Order IDs | `fldp9FsbMf6x7GUZZ` | multilineText |  |
| Completed Batches | `fldmDLsvawvBSXQle` | number |  |
| Next Batch At | `fld6r8EdYGP7jf2aH` | dateTime |  |
| Forwarding URL | `fldTfBXh6yI72kisW` | url |  |
| Spam Remediation Queue | `fldPr2oyEyWAHJEr6` | multipleRecordLinks | → Spam Remediation Queue |

## Content Distribution

`tblDWJrmIcBJDykIP`

| Field | ID | Type | Options / formula |
|---|---|---|---|
| Distribution Item | `fldnBQLFJf1Lo1zRU` | singleLineText |  |
| Parent Content | `fldUdKNjcqwvqBzxY` | multipleRecordLinks | → Content Channels (Alex Woung) |
| Content Clip | `fldriLaqCUX3haL1f` | multipleRecordLinks | → Content Clips |
| Deduplication Key | `fld0oIDz5WT2Q7vjm` | singleLineText |  |
| Platform | `fldewqlnxtWis5Q5w` | singleSelect | YouTube, Instagram, X, LinkedIn, Reddit, Framer, Newsletter |
| Output Type | `fld6lY8PlmVQNZpQS` | singleSelect | Short, Reel, Post, Thread, Blog, Dulcy Newsletter, Client Newsletter, Value Post, Discussion Draft, Framer Blog, Resource |
| Draft Title | `fldT93ZRdvNr3rs5H` | multilineText |  |
| Draft Body | `fldH9ERJJHO2OkMA7` | multilineText |  |
| Media URL | `fldtRc7ET8RnG3N63` | url |  |
| Approval Status | `fld0WhqvYvMkFukhh` | singleSelect | Needs Review, Approved, Rejected |
| Publishing Status | `fld6epkJRCbu0QAaz` | singleSelect | Draft, Scheduled, Publishing, Published, Failed |
| Scheduled At | `fldMNlwmFKOLBcCUl` | dateTime |  |
| External Post ID | `fldZr1Ypb9I9Ik6vg` | singleLineText |  |
| Published URL | `fldFZjCNtv9VmPTnI` | url |  |
| Last Error | `fldPwxzKoOJL56iv7` | multilineText |  |
| Distribution Action | `fldxUmvtl6DQLDI5Y` | singleSelect | Generate Again, Publish Now, Retry Publishing |
| Content Channel | `fld8uc1h8BYjHHjjg` | singleSelect | Alex Woung, Alex Woung Raw |
| Automation Queue Receipt | `fld1BFhcLfquycPTC` | multilineText |  |

## Email Account Bulk Controls

`tbl9diaQoQS0USoLn`

| Field | ID | Type | Options / formula |
|---|---|---|---|
| Request | `fld1wTVUFb3L5TXQ0` | singleLineText |  |
| Client | `fldQj6VuwvV4rhIIQ` | multipleRecordLinks | → Workspace IDs |
| Scope | `fldfsogsV7cOlY4G2` | singleSelect | Entire Client, Selected Accounts |
| Selected Accounts | `fldACGOlNmoYHt31i` | multipleRecordLinks | → Email Accounts |
| Action | `fldJunzRPpH4gQwgC` | singleSelect | Turn Warmup On, Turn Warmup Off, Update Daily Limit, Update Warmup Limit |
| New Daily Limit | `flduz4vf2yNKOw7aM` | number |  |
| New Warmup Limit | `fldUg3eJ8bZvowIIJ` | number |  |
| Approve | `fldDQPJDNjvAp9pjz` | checkbox |  |
| Status | `fld1cQWvFVycW9nRL` | singleSelect | Draft, Processing, Completed, Failed |
| Accounts Matched | `fld8ukqXWtnPfzaCY` | number |  |
| Accounts Updated | `fldRekmdzJNtIC9cF` | number |  |
| Error | `fldc2Fnk7pljFFcJZ` | multilineText |  |
| Completed At | `fldlgRdazqPWqwDC6` | dateTime |  |

## Spam Remediation Queue

`tblaJZ3ru2TOiHOOM`

| Field | ID | Type | Options / formula |
|---|---|---|---|
| Remediation | `fldu2RkpFCGwtdAUD` | singleLineText |  |
| Email Account | `fldHln6UwRPQPCR2r` | multipleRecordLinks | → Email Accounts |
| Domain | `fldA0Uas1X8cSJpIW` | multipleRecordLinks | → Domains |
| Client | `fldwr2yLg9xMCrvXH` | multipleRecordLinks | → Workspace IDs |
| Recommended Action | `fldWAjL5wchMXjLrb` | singleSelect | Replace Inbox, Replace Domain |
| Reason | `fldv5olz4qtXneILN` | multilineText |  |
| Inbox Placement Score | `fldTfb27YyugnfObr` | number |  |
| Failed Test Count | `fldho7a9IRUbXTVOP` | number |  |
| Status | `fldqi6Adyoxi13ptt` | singleSelect | Pending Review, Approved, In Progress, Completed, Rejected |
| Approve Purchase | `fldpQKr6EfqIuITBg` | checkbox |  |
| Automation Key | `fldQOcWPnvuzSKQaB` | singleLineText |  |
| Created At | `fldyKxTfrhUD1PJfk` | dateTime |  |
| Error | `fldE63qYx56tg8Dcj` | multilineText |  |
| Domain Purchase Request | `flde9gZaUYKJjcsXX` | multipleRecordLinks | → Domain Purchase Requests |

## Dulcy Reply Agent Settings

`tbl5nmzPUcNEBSWxH`

| Field | ID | Type | Options / formula |
|---|---|---|---|
| Workspace Key | `fld54W6mFFiyDS2GL` | singleLineText |  |
| Workspace Name | `fldO6QhPz8ReIGBxw` | singleLineText |  |
| Workspace Record ID | `fldBh0ugOqXpBy1I1` | singleLineText |  |
| Enabled | `fldqI3VcgPUeWI60H` | checkbox |  |
| Default Mode | `fldIIkTotAvrqi7WF` | singleSelect | Approval Required, Auto High Confidence, Autopilot |
| OOO Mode | `fldcba1likLIMjkea` | singleSelect | Approval Required, Auto Send |
| Not Interested Nudge | `fldYkwrmUogVgsI2N` | checkbox |  |
| Minimum Auto Confidence | `fld7Bjd2KnCjOtGIK` | percent |  |
| Max Automatic Replies | `fldnsRZgKXVv5NhRO` | number |  |
| Response Tone | `fldSz9CysyrPqN2rA` | singleSelect | Laid Back, Professional, Direct, Warm |
| Response Length | `fldmCrXWamoNOs17W` | singleSelect | Very Brief, Brief, Standard |
| Timezone | `fldcBBsXcarCHKoI8` | singleLineText |  |
| Office Start | `fldQ4e50wL9lea4Cx` | singleLineText |  |
| Office End | `fldzgbnlcTlN4tQje` | singleLineText |  |
| Exclude Weekends | `fldnXSFQCpdMnba7D` | checkbox |  |
| Exclude US Holidays | `fldIzZ9lIwNHTyiig` | checkbox |  |
| Calendar Link | `fldK1cx8ZEqC5Xsff` | url |  |
| Follow-up Instructions | `fldO50bAy4bBYiacE` | multilineText |  |
| Company Context Override | `fldKu9AF0RuVTXJ5H` | multilineText |  |
| Last Updated | `fld9G7zuALIFo1vQa` | dateTime |  |
| Enabled Reply Types | `flddSM1kupkCo49or` | multipleSelects | Interested, Info Request, Meeting Request, Cost Objection, Process Objection, Not Interested, Out of Office, Check Back Later, Referred, Wrong Person |
| Always Require Human Review | `fldmU2ih3L1NRprfm` | multipleSelects | Interested, Info Request, Meeting Request, Cost Objection, Process Objection, Not Interested, Out of Office, Check Back Later, Referred, Wrong Person |
| Calendar Provider | `fldUajoXDZicmMJRt` | singleSelect | Calendly, Cal.com, Google Calendar, Other, Not Connected |
| Calendar Connection Status | `fldwRUzLewRqsUAti` | singleSelect | Connected, Needs Attention, Not Connected |
| Agent Last Name | `fldVnDq9NJxl82dXZ` | singleLineText |  |
| Company Name | `fldT97k4Feagaun6X` | singleLineText |  |
| Integration Settings JSON | `fldXwpm0C68gtn04z` | multilineText |  |
| Agent First Name | `fldwMzNcUDioaFW5C` | singleLineText |  |
| Company URL | `fldeGz32IZ7B3nVk8` | url |  |
| Objective Settings JSON | `fldiQFAdqLnTTUClT` | multilineText |  |
| Routing Settings JSON | `flduImNf3CFEgqddR` | multilineText |  |
| CC BCC Settings JSON | `fld6IMBSfPS5VSTBy` | multilineText |  |
| Follow-up Plan JSON | `fldr6fdz5OSC1AaK2` | multilineText |  |
| Response Settings JSON | `fld7ACUDscpAqBAmQ` | multilineText |  |
| Calendar Settings JSON | `fldpfjITDZ7QlfKDw` | multilineText |  |
| Knowledge Base JSON | `fldZorQ63FO9Y6zTC` | multilineText |  |
| Reply Handoff Mode | `fldssDmUzMyi4RahX` | singleSelect | Disabled, After First Agent Reply, All Replies |
| Calendar Connection Request JSON | `fldVSFHdZqjipZdpW` | multilineText |  |
| Calendar Connection Result JSON | `fldKKuVzaRvoAFv7e` | multilineText |  |
| Calendar Connection Snapshot JSON | `fldja89IBFvNhZVaN` | multilineText |  |

## Dulcy Reply Agent Events

`tblHznksXyc3DZAUu`

| Field | ID | Type | Options / formula |
|---|---|---|---|
| Event Key | `fldlKUsURw7f2bSRQ` | singleLineText |  |
| Email Record ID | `fldun4BpZgyjeT885` | singleLineText |  |
| Workspace Record ID | `fldQQKG5xTxrrZ2ka` | singleLineText |  |
| Reply ID | `fldw1k2PFFl9WVDZx` | singleLineText |  |
| Event Type | `fldMhznPsjYmLOCI1` | singleSelect | Received, Classified, Drafted, Scheduled, Approved, Sent, Skipped, Suppressed, Failed, State Changed |
| Intent | `fldRe3oVLYFudMurc` | singleSelect | Interested, Info Request, Meeting Request, Cost Objection, Process Objection, Not Interested, Do Not Contact, Out of Office, Check Back Later, Referred, Wrong Person, Automatic Reply, Other |
| State | `fldIvZn6rRYGcFiQx` | singleLineText |  |
| Actor | `fldVPEjp5B3MYgdcF` | singleSelect | EmailBison, AI, Human, Scheduler, System |
| Occurred At | `fldgng5VTX3XiNLWK` | dateTime |  |
| Summary | `fldnyxeHccV6xD7Rr` | multilineText |  |
| Payload JSON | `fld3rX6aky1cc7vli` | multilineText |  |
| Error | `flddnFGZ644vqEwpL` | multilineText |  |

## Content Automation Settings

`tblbG7YbCpi84tQYM`

| Field | ID | Type | Options / formula |
|---|---|---|---|
| Channel | `fldp2ykUFPYYFXPlu` | singleLineText |  |
| Enabled | `fldzz1f3NRV2keDdM` | checkbox |  |
| Videos Per Week | `fldhV1C8j1LDsCoVJ` | number |  |
| Clips Per Week | `fldMuMZED81iWQWg4` | number |  |
| Auto Schedule Score | `fldDIUjHLoKL6WXg2` | number |  |
| Manual Review Score | `fldqKEJL8Ya5sdja1` | number |  |
| Minimum Spacing Days | `fldaAPHI6CNgIfMsO` | number |  |
| Minimum Clip Score | `fld288MIFRl52mjpc` | number |  |
| Story Sequences Per Week | `fldJ2susPGF7kdZ7z` | number |  |
| Story Frames Per Sequence | `fld0JFUg8FL3qrRFe` | number |  |

## Content Story Sequences

`tblB0cnjeIlhW2sSj`

| Field | ID | Type | Options / formula |
|---|---|---|---|
| Story Sequence | `fldOeDY58FKp0zUWC` | singleLineText |  |
| Parent Content | `fldr0vb0zRN48ZnTL` | multipleRecordLinks | → Content Channels (Alex Woung) |
| Story Date | `flddb77cwRu3smrh7` | date |  |
| Content Channel | `fld3rYpkKvfF9ygzN` | singleSelect | Alex Woung, Alex Woung Raw |
| Mode | `fldppXKULqgcu2Ogf` | singleSelect | Evergreen, Promotional |
| Framework | `fldTyns5XOze4Nd0m` | singleSelect | Auto, High Story View, Leadflow, Results Reveal, Problem Agitation, Lifestyle Authority, Promotional Announcement, Promotional Ongoing, RAPIR |
| Frames Requested | `fldCvpJpJ4tqbmuYv` | number |  |
| Status | `fldOxWGwPocopZSRq` | singleSelect | Draft, Generating, Needs Review, Approved, Scheduled, Posted, Needs Changes, Failed |
| Sequence Brief | `fldKqH5zYqbfsop7q` | multilineText |  |
| Generate Sequence | `fldgDubOXsbSfFyd4` | checkbox |  |
| Approve Sequence | `fldl9wYDrsLe8GlC9` | checkbox |  |
| Frame.io Folder URL | `fld4THTAPCT29b11A` | url |  |
| Scheduled Start | `fldL1xy9RmaZszH2g` | dateTime |  |
| Frame.io Review URL | `fldddh6iNrfKXLfaj` | url |  |
| Generation Notes | `fld7hCtXj44m3NjGP` | multilineText |  |
| Automation Error | `fld1VxtiLJnsTB1rU` | multilineText |  |
| Content Story Frames | `fldSn28Wi98a7grz1` | multipleRecordLinks | → Content Story Frames |

## Content Story Frames

`tblRks0M8xnNa3XPr`

| Field | ID | Type | Options / formula |
|---|---|---|---|
| Story Frame | `fldvGmH6FpnoaATp8` | singleLineText |  |
| Story Sequence | `fld5eMYBsNBS93iU6` | multipleRecordLinks | → Content Story Sequences |
| Parent Content | `flddEloSoTunsdvNJ` | multipleRecordLinks | → Content Channels (Alex Woung) |
| Frame Number | `fldcirMAvMuIRtrhD` | number |  |
| Frame Role | `flddi5I5r0oLyotvs` | singleSelect | Hook / Poll, Context, Proof, Value, Process, Identity, CTA, Personal / BTS |
| Frame Copy | `fldW9CGE1B1G5osgG` | multilineText |  |
| Asset Source URL | `fldxxOFQ7CVsGWHFJ` | url |  |
| Generated Frame URL | `fld3yZXO98zJxf2Kv` | url |  |
| Interactive Element | `fldgKh7PGR39s0ZX7` | singleSelect | None, Poll, Question, Quiz, Countdown, Link, DM Prompt |
| CTA / Link | `fldkOtBuazFwU9vqH` | multilineText |  |
| Scheduled At | `fldjQkw2ckTnqItii` | dateTime |  |
| Status | `fldyyFcOaQp90LjqS` | singleSelect | Draft, Generated, Approved, Needs Changes, Scheduled, Posted, Failed |
| Regenerate | `fldGJdfMmzPNI7PtS` | checkbox |  |
| Automation Error | `fldIa80YArqZD4sRR` | multilineText |  |

## Reply Analytics Daily

`tblxJEt3ECTnEqGpd`

| Field | ID | Type | Options / formula |
|---|---|---|---|
| Snapshot Key | `fldTQu4xZ6toKmxiU` | singleLineText |  |
| Date | `fldPelQKueBjeGlqe` | date |  |
| Workspace Name | `fld2wqYI6JMx1ZyJm` | singleLineText |  |
| Workspace Record ID | `fldaeLcvAGlhiP9V1` | singleLineText |  |
| Inbound Replies | `fldv1bNsKwQjZbNOm` | number |  |
| Unique Leads | `fldurCY2pISx2SSxm` | number |  |
| Positive Replies | `fldTwdRMMl3nQe0K8` | number |  |
| Meetings Booked | `fldmfb0ShoCdCqH4d` | number |  |
| AI Replies Sent | `fldObj4sZNcUifZpD` | number |  |
| Human Replies Sent | `fldO8Ss8qs7uiVIo2` | number |  |
| Unanswered Replies | `fldBoD6k2aduza7PO` | number |  |
| Human Review Count | `fldcFkZuBly7O65ux` | number |  |
| Needs Changes Count | `fld2OjyaXPbdioNdn` | number |  |
| AI Errors | `fldlh2K99AlFibIzw` | number |  |
| Avg First Response Minutes | `fldk3DRVc04tNgsHy` | number |  |
| Avg Touchpoints to Meeting | `fldvsPqXSSiZY3CJl` | number |  |
| Avg First Response to Booked Hours | `fldIjvyocRm1byE7e` | number |  |
| Responses Within 15 Minutes | `fld6oVMsIEZUqAPqS` | number |  |
| Measured First Responses | `fldtwrOupmzsmbXrB` | number |  |
| Data Coverage | `fldQag4p7ymM7PhsF` | singleSelect | Complete, Partial, Insufficient |
| Source Notes | `fldWlvqanGtz8YHro` | multilineText |  |
| Last Calculated At | `fldgX7NNQXdqAFViU` | dateTime |  |
| Positive Reply Rate | `fldcvGY9Z5THohW3O` | formula | `IF({fldv1bNsKwQjZbNOm}>0,{fldTwdRMMl3nQe0K8}/{fldv1bNsKwQjZbNOm},0)` |
| Positive to Meeting Conversion | `fldiTjy6U78gEFQYC` | formula | `IF(AND({fldQag4p7ymM7PhsF}="Complete",{fldTwdRMMl3nQe0K8}>0,LEN({fldkrjNab5zgpKHV7}&"")>0),{fldkrjNab5zgpKHV7}/{fldTwdRMMl3nQe0K8},BLANK())` |
| AI Automation Rate | `fldn23C6cYD8lC8VF` | formula | `IF(AND({fldQag4p7ymM7PhsF}="Complete",({fldObj4sZNcUifZpD}+{fldO8Ss8qs7uiVIo2})>0),{fldObj4sZNcUifZpD}/({fldObj4sZNcUifZpD}+{fldO8Ss8qs7uiVIo2}),BLANK())` |
| 15 Minute SLA Rate | `flddT65tFp7nFqHHn` | formula | `IF({fldtwrOupmzsmbXrB}>0,{fld6oVMsIEZUqAPqS}/{fldtwrOupmzsmbXrB},0)` |
| KPI Health | `fldIOsOH3Rqp8kN8E` | formula | `IF({fldQag4p7ymM7PhsF}!='Complete','Verify data',IF({fldlh2K99AlFibIzw}>0,'Needs attention',IF(AND({fldiTjy6U78gEFQYC}>=0.1,{flddT65tFp7nFqHHn}>=0.8),'Healthy','Watch')))` |
| Responder Type | `fldTj5Uo6q6f4XvHu` | singleSelect | All, AI, Human |
| Display Avg Touchpoints | `fld4ahwhQJZFQZr98` | formula | `IF(LEN({fldvsPqXSSiZY3CJl}&"")>0,{fldvsPqXSSiZY3CJl},BLANK())` |
| Positive Meetings Booked | `fldkrjNab5zgpKHV7` | number |  |
| Unknown Responder Replies | `fldDTimNMGfEedOQQ` | number |  |
| Measured Meeting Touches | `fldDV4NYjRJW8ArKZ` | number |  |
| Measured Booking Response Times | `fldgFS6lDCqWD0HxQ` | number |  |

## Reply Learning

`tblSnh6YlMTOFSE8l`

| Field | ID | Type | Options / formula |
|---|---|---|---|
| Example | `fldIIhfsPF8Yybpa4` | singleLineText |  |
| Workspace Record ID | `fldV7M6UmTxO1YDZS` | singleLineText |  |
| Email Record ID | `fld8F5ZnAvu7GJDlj` | singleLineText |  |
| Situation | `fldGfZvJzDhTpHszu` | singleSelect | Interested, Not Interested, Out of Office |
| Prospect Message | `fldKGV9Z3CkH8S5og` | multilineText |  |
| AI Draft | `fldluyq2N0Hw7oS9E` | multilineText |  |
| Approved Reply | `fldPOnQexZA7FzpD7` | multilineText |  |
| Feedback | `fld4bdQueDcYbj37f` | multilineText |  |
| Review Status | `fldG5FcKDYBqJIP1V` | singleSelect | Candidate, Approved, Rejected |
| Outcome | `fldv9voWR1O53INUz` | singleSelect | Unknown, Replied, Meeting Booked, Rejected |
| Source | `fldw0DZZxnJXJFrKD` | singleLineText |  |
| Updated At | `fldQ86P0iwGtglQpC` | dateTime |  |

## Verification Performance

`tblem2vNdX0hzHdxg`

| Field | ID | Type | Options / formula |
|---|---|---|---|
| Cohort Key | `fldLcEDMyAAkNcIMG` | singleLineText |  |
| Campaign | `fldVreowXcJujZwAT` | multipleRecordLinks | → Campaigns |
| Campaign Name | `fldApebMTDlduga98` | singleLineText |  |
| Client | `fldRWG5YB87LyQE10` | singleLineText |  |
| Verification Provider | `fldWxfmlKIIPquESE` | singleSelect | MillionVerifier, LeadMagic, Unknown |
| Email Type | `fldyUWmReRFHVKlqM` | singleSelect | Direct, Generic, Unknown |
| Leads | `fldOvEh2bQSTj7Bt5` | number |  |
| Leads Contacted | `fldz3nmbJUZqsblLa` | number |  |
| Emails Sent | `fldPXS3Zyc2SGepgt` | number |  |
| Replies | `fldpSoZtAC1o5ZEjg` | number |  |
| Positive Replies | `fldjcgCxEG4ur0Mir` | number |  |
| Bounces | `fldD0CusLUUVYk6rK` | number |  |
| Reply Rate | `fldAnBkWvpIeVwYmi` | percent |  |
| Positive Reply Rate | `fldlSFEqZKAkavNku` | percent |  |
| Bounce Rate | `fldE9n0IjPOswweyD` | percent |  |
| Updated At | `fldBQSIgg4ibW9Vw8` | dateTime |  |
| Coverage | `fld9f4UEBLOdrHdNO` | singleLineText |  |

## [TEST ONLY] Verification Analytics Campaigns

`tblKov2oVCezASXDQ`

| Field | ID | Type | Options / formula |
|---|---|---|---|
| Name | `fld3GsFi6is8kQURw` | singleLineText |  |
| Notes | `fldsjZcNz9EyJizpt` | multilineText |  |
| Assignee | `fldd31Yk8tPKcNSYZ` | singleCollaborator |  |
| Status | `fldMdqiicwbuhfpuj` | singleSelect | Todo, In progress, Done |
| Attachments | `fldEgkQtgf0XpLWno` | multipleAttachments |  |
| Attachment Summary | `fldR54tJotrdJJnwm` | aiText |  |
| [TEST ONLY] Verification Analytics Performance | `fldKvc5jLMp6AUeKn` | multipleRecordLinks | → [TEST ONLY] Verification Analytics Performance |
| Verification Analytics Active Run Token | `fldyArNGlpwFJq9GE` | singleLineText |  |
| Verification Cohort Analytics JSON | `fld9GV3LYzYUmJlvw` | multilineText |  |

## [TEST ONLY] Verification Analytics Performance

`tblx9XtNmIgr0WjRR`

| Field | ID | Type | Options / formula |
|---|---|---|---|
| Name | `fldOCAWJ9DSG0P5GJ` | singleLineText |  |
| Notes | `fldoUoWjK7A4P16hI` | multilineText |  |
| Assignee | `fldPhhh6WKLNTtq7c` | singleCollaborator |  |
| Status | `fld30AwLMOu5q1r5N` | singleSelect | Todo, In progress, Done |
| Attachments | `fldJDbYbnXKOEl3gA` | multipleAttachments |  |
| Attachment Summary | `fldGlnMFlH78NgStF` | aiText |  |
| Versioned Cohort Key | `fldG8NQsnwsQTHn6w` | singleLineText |  |
| Run Token | `fldZxpaqdL2doy460` | singleLineText |  |
| Campaign | `fldTawYTShgbSwHdH` | multipleRecordLinks | → [TEST ONLY] Verification Analytics Campaigns |
| Campaign Name | `fldSBS3cj5vbxV4Tv` | singleLineText |  |
| Client | `fld1BGhsdRDUkiSYV` | singleLineText |  |
| Verification Provider | `fldPKYQCfPIV8UTTv` | singleLineText |  |
| Email Type | `fld2qsENgPOgS0g0f` | singleLineText |  |
| Coverage | `fld7IWVpItNDhji5e` | singleLineText |  |
| Leads | `fldIUDpvdZJINXsoa` | number |  |
| Leads Contacted | `fldWT98pjfoYDHEnY` | number |  |
| Emails Sent | `fld0GQ4WCFwXrSbP4` | number |  |
| Replies | `fldIpiAlUAUdaXout` | number |  |
| Positive Replies | `fldB3OPOMCHZc52Fx` | number |  |
| Bounces | `fldkp0EoSNJto8jaD` | number |  |
| Reply Rate | `fldq4meYAuAbLCHUY` | number |  |
| Positive Reply Rate | `fldaUjJ5DjNd38z7J` | number |  |
| Bounce Rate | `fldzZkEiYNoV5Qvw1` | number |  |
| Updated At | `fldPsOCzRTQy1p6AY` | dateTime |  |

## Call Invoice Coverage

`tblz862FFd4SlDwG1`

| Field | ID | Type | Options / formula |
|---|---|---|---|
| Coverage ID | `fld2XzMF3BoWoDr6M` | singleLineText |  |
| Client | `fld9cSntjeUOAE6tS` | multipleRecordLinks | → Workspace IDs |
| Source Booking | `fldqJ1QnDNEK2IMxc` | multipleRecordLinks | → Emails |
| Booking ID | `fldxN3Ot715wtTmKy` | singleLineText |  |
| Reschedule Group | `fldUNST5aIFEXRCLp` | singleLineText |  |
| Invoice | `fldCKVirmtrr3DvtA` | multipleRecordLinks | → Client Invoices |
| Coverage Status | `fldg8DjPHmdnYonxl` | singleSelect | Needs Review, Eligible, Reserved, Invoiced, Excluded, Credit Pending, Credited, Uncertain |
| Unit Rate | `fldW0xZfoBP4K5bqk` | number |  |
| Currency | `fldKa0srV27baAOIi` | singleLineText |  |
| Adjustment Amount | `fldmkX1iU4VL3ut3c` | number |  |
| Evidence | `fldZNysqs7HloYSkb` | multilineText |  |

## Contracts

`tblFhsgZ970B44r1s`

| Field | ID | Type | Options / formula |
|---|---|---|---|
| Title | `fldCEKrtHefSmpHON` | singleLineText |  |
| Client Intake | `fld92dlZdibDTXyMs` | multipleRecordLinks | → New Client Intake |
| Workspace IDs | `fldsFrGAkver3PGWh` | multipleRecordLinks | → Workspace IDs |
| Original PDF | `fldZhcTDLvo1RBhXg` | multipleAttachments |  |
| Client Signer Name | `fldgZKKn1K39cOKfJ` | singleLineText |  |
| Client Signer Email | `fldr55scbJVzVd0k6` | email |  |
| Dulcy Signer Name | `fldDzmSyK9z5NZxqA` | singleLineText |  |
| Dulcy Signer Email | `fld5SDz4vEJXLvUla` | email |  |
| Test Only | `fldPPC0a2JjLYsddn` | checkbox |  |
| Signing Order | `fldSNk3g3mI3632Kn` | checkbox |  |
| Action | `fldzJbyf1i20Riex9` | singleSelect | Create draft, Issue invitation, Resend invitation, Void |
| Status | `fldjdDX4PbGCnnJfB` | singleSelect | draft, sent, in_progress, finalizing, completed, declined, expired, voided |
| Contract ID | `fldFPubC1K8GXQ27N` | singleLineText |  |
| Signer Summary | `fldyU5vWOQVIfiNDs` | multilineText |  |
| Sent At | `fldSQdl9ZdjRfO07c` | dateTime |  |
| First Viewed At | `fldT0deiIrbrntyxP` | dateTime |  |
| Completed At | `fldCGwKkFODyXlAc7` | dateTime |  |
| Frozen SHA-256 | `fldSS5X9b9OZBpbFq` | singleLineText |  |
| Final SHA-256 | `fldsdDodLv9eodYWX` | singleLineText |  |
| Last Synced At | `fld4y7cd2BQLSpYkn` | dateTime |  |
| Last Error | `fldH9cVdFDWTcDrPI` | multilineText |  |
| Manage Contract | `fldpOiIQ45ZHC3aA5` | url |  |
| Signed PDF | `fldzKQKrjIxlArRoh` | multipleAttachments |  |
| Signing Record | `fldBbWJOvw0s0Cet5` | multipleAttachments |  |
| Activity Log | `fldTqjF3kKOE3LRaU` | multilineText |  |
| Client Signed At | `fldyKVAB393Jxqzcu` | dateTime |  |
| View Count | `fld5ZFvURPonn5IuA` | number |  |
| Attachment Note | `fldLe7l6t0kEXALaF` | multilineText |  |
| Client Legal Name | `fldDc6vMbFMj8W1pV` | singleLineText |  |
| Client Company / Brand | `fldwo4EPfpisi145S` | singleLineText |  |
| Agreed Service | `fldd1czx7q8b2RmZi` | singleLineText |  |
| Agreed Scope | `fldnVl0jQ1MVPayCM` | multilineText |  |
| Contract Fee | `fld01YSlG6iORVll5` | currency |  |
| Billing Frequency | `fld5rmYuUfmmU9mMa` | singleSelect | Monthly, Quarterly, Annual, One-time |
| Contract Start Date | `fldBJxHVQDyPTrkKJ` | date |  |
| Agreed Contract Term | `fldvCymQYSDm82HTR` | singleLineText |  |
| Agreed Special Terms | `fldLB38PzTvELJbJr` | multilineText |  |
| Contract Review Status | `fldKQmds0Wm99VKcr` | singleSelect | Needs confirmation, Ready for review, Approved to send |
| Missing / Unconfirmed Terms | `fldPCpbNS5vICwnyi` | multilineText |  |
| Agreement Template | `fldXLNPL4rnEvoPs7` | url |  |
| Review Document | `fldIv9drauzKrRrNt` | url |  |
| Preparation Notes | `fldEKnkb73la8jv1s` | multilineText |  |
| Client Address | `flde228COB5Ju3Zv7` | multilineText |  |
| Contract Currency | `fldIsFDA3wSfunI09` | singleLineText |  |
| Prepared Terms Snapshot | `fldXhYeG68kbCiA8Q` | multilineText |  |
| Agreement Type | `fldK0lOMQRUT3pqFK` | singleSelect | Monthly / Retainer, PPC / PPL |
| LinkedIn | `fldoHwdOyGQZMEQ9C` | checkbox |  |
| AI / Cold Caller | `fldbifE5IdOvckQuk` | checkbox |  |
| Direct Mail | `fldWU4MYcNRGRjX8S` | checkbox |  |
| Qualified Call Fee | `fldwxW7KQ6lMgWxdB` | currency |  |
| Monthly Tech Fee | `fldowy6Spw5YYyNk1` | currency |  |
| Initial Fee | `fldpLnGhiIWnUwYJe` | currency |  |
| Close Lead ID | `fldPPCevXj2yvmCZs` | singleLineText |  |
| Close Opportunity ID | `fldXyjtYw1dMe4ox5` | singleLineText |  |
| Preparation Requested | `fldwhpNA4S3ithwMS` | formula | `IF(AND({fldK0lOMQRUT3pqFK}!="",{fldFPubC1K8GXQ27N}="",{fldXhYeG68kbCiA8Q}="",{fldH9cVdFDWTcDrPI}=""),1,0)` |

# Dulcy Ops & Systems Strategy

Source: https://docs.google.com/document/d/1Maj4dUQ6c9BcqB_GgI4PgwFXOySbw8jmIggbKSBF9qU/edit?usp=drivesdk
Modified: 2025-02-16T12:45:03.507Z
Exported: 2026-11-17. Source document; not independently validated as current.

﻿Scaling Studio
Dulcy
Operations and Systems Improvement Strategy

1. Context: 
Your current operations have a very good base of automated and straightforward processes. 
Your growth has been strong but with that, the operations start to have bottlenecks.

Currently:
* You need to log into every tool and client workspace to create lists, campaigns, and reports, and analyze data to improve each campaign
* Many tasks like copywriting, lead list creation, campaign creation, and verifications are manual
* All of that causes a limit on the visibility for campaign metrics and ROI per client and campaign with the lack of proactively starting new angles and campaigns.
Goal:
* Automate and smooth out the service delivery from A to Z 
* Have one place to manage everything through the Airtable OS
* Make sure you have a scalable foundation in place that allows you to handle 2-3x more clients.


In this document, I’ll give you all the points you need for an Airtable automated OS.
This is a shiny way to say: “a proper system from onboarding to all the parts of service delivery and reporting”. 
So that you can spend less time on admin, more time on ROI outputs for clients, and grow your revenue and scale.
Then you can take more clients, go on vacation, or play golf… It’s your life.


2. Operations Strategy:

   1. Campaign Management & Reporting

      1. Hide completed or paused campaigns in client reports
When a campaign is manually stopped, it should no longer appear in any external client reports.
      * Add or fix the “Campaign Status” field in Airtable to track all status,
      * Then simply filter out paused and completed campaigns from the report export or automatically move them to a separate “Archived” table so the clients can also keep track of them if you wish.


         2. Bounce rate notifications and tasks
If the bounce rate in EmailBison (or other sending platform) goes above 2.5 or 3%, automatically alert the team.
         * Collect bounce data from EmailBison (when exporting all analytics through the API).
         * In Airtable, set an automation check that triggers every time that number goes above the limit.
         * From there you can add Slack or email notifications + create a task on your PM board and assign it immediately to someone.


If an email disconnects, send a notification on Slack (bonus: add the number of disconnects to each email on Airtable so you have an idea of any persistent issues across all accounts)


         3. Proactive alerts for campaigns reaching the end
Know in advance when a campaign is about to reach the end, so you can line up a new list or new campaign.
         * Track and calculate the progress for each campaign in Airtable.
         * Setup an automation with a script that each day checks the “Progress” column.
If above X, a Slack alert triggers like: “Campaign XYZ is XX% done, time to add more leads or schedule a new campaign [OS link]” + a task is created on your PM board with someone assigned to it.


         4. Keep track of warmup status 
Track all new email accounts added and save them in a table with the date the warmup started.
This is used for the 14 day notification through Slack and also to keep track of email disconnect counts, for example.


         2. Lead list creation, verification, and campaign creation
3 main goals:
         * Create lead lists with minimal friction
         * Generate cold email scripts using existing templates + AI with a way to review them
         * Create campaigns in EmailBison (or any other platform) automatically


         1. Export lists, verify, and create campaigns
Inside the OS, input an Apollo link, export leads, verify them, and then upload the final list to Google Sheets or directly into EmailBison.
Note: You can select Apollo upload, another tool like ListKit, a CSV, or an existing list if you want to repurpose leads.
         * You input an Apollo search link into the OS or a CSV or another list upload selection

         * Click a button to upload and an Airtable + Make automation grabs the leads, and verifies them (using a preselected method like MillionVerifier, Email Guard, Lead Magic, etc)

         * Returns only valid emails, and pushes them into a “Clean Leads” table in Google Sheets or directly into Clay for the enrichment part.

         * The new campaign gets created in EmailBison (or another platform chosen), all the settings are updated to that campaign, including the sending schedule, email accounts are added, scripts are added, and the lead list is added.



            2. Integration with Clay for bulk uploads using EmailBison
EmailBison’s API doesn’t offer a cost effective bulk upload for these types of scenarios (it’s lead by lead, their bulk upload process doesn’t work for existing leads).
If you don’t use recurring leads for your campaigns this may not be an issue, but if you do there’s a solution that I’ve been talking about with Hassan and testing with different agencies.
Clay acts as the middle layer, where we upload the final lead list from there automatically into EmailBison.



            3. Prompting for second validation and case study scraping
Before finalizing the lead list, a prompt would confirm these are actually the ideal target companies and gather case study names for references.
            * In Airtable, add a field: “AI Validation Prompt” that clarifies the niche or filter criteria (ex: Make sure this company is a [niche] and look at XYZ to confirm. If yes, output yes, otherwise no)

            * Inside Clay there would be also a column to scrape case study names from the website. If found, save the name, otherwise save NA

            * Have a filter that chooses the copy variation based on if there is a case study name or not.



               4. Email copy with AI
The goal is to create a new email copy quickly, using your existing template library.
               * Feed an agent your best templates.
               * If you have different templates per angle/approach you can select which template to use

                  * Once you want to create scripts for a campaign you click a button

                  * It grabs the variable parameters for the client via Airtable (ICP, pain points, etc)

                  * The AI returns a script, you or the responsible person reviews & approves, then it’s instantly attached to the campaign record including spintax if you choose to (another button to add spintax)



                     3. Client intake and onboarding process
I know you already have an automated onboarding process, this would be an addition to it:
30 seconds client intake form.
If you want to keep it super smooth and fast when you take on a new client, you submit a 30 second form with their details and automatically they receive the PandaDoc agreement to be signed and the invoice or payment link.

  
Onboarding
                     * Once they pay and/or sign, it would trigger the onboarding you already have where it adds them to a slack channel, sends welcome email, creates client folders in google drive, creates an EmailBison workspace, and sends them any onboarding form or call links.

                        * The “post onboarding” form is where all the information that feeds into the AI and campaigns would be collected.

                        * All of this would be in a record in Airtable with all your clients and their information. Use this only for service delivery or if you prefer also for sales and finance tracking.


                           4. Email replies and meeting feedback

                              1. Inbox manager
You already have a base system that categorizes replies, but from what I understood it needs to be 100% functional after the switch to EmailBison.
Here you only need some quick fixes and additions:
                              * Correctly map out the reply classification and store them in the correct place.

                              * Meeting request responses stay at that stage (don’t get moved into follow up).

                              * Sending an email response automatically knows through which platform it should send.

                              * You can add automatic mobile phone enrichment if you want to add additional touchpoints to the follow ups, which includes calling them directly from the OS (using an extension/3rd party app).


                                 2. Post meeting feedback
To improve campaigns it’s good to have feedback from the client for each call booked.
                                 * Save each scheduled time of a call or the last time they requested a meeting, automatically.

                                 * Either at the end of the day or weekly through the reports, send a message to each client with a 30 second form to give feedback on each call (did they show up, qualified, next steps, etc).

                                 * These responses are saved automatically in Airtable to track outcomes and improve the lead lists and campaigns.



                                    5. Campaign analytics and inbox placement

                                       1. Internal Dashboard
A single place for you and anyone on the team to see campaign statistics, bounce rates, email account health, leads left, and other KPIs.
Similar to what you currently have but with a revamp. So you can track all campaigns and not only filter per client but also by day, week, and month.
                                       * Status
                                       * Progress
                                       * Remaining leads
                                       * Total leads
                                       * Emails sent
                                       * Replies
                                       * Reply rate
                                       * Positive replies
                                       * Positive reply rate
                                       * Bonces
                                       * Bounce rate
                                       * Booked calls
                                       * Email to call ratio
Note: If you go ahead with the HeyReach campaigns it would tie into this with similar metrics (and additional ones)




                                       2. Automated inbox placement tests
Once per week, run an inbox placement test using EmailGuard and save the results in Airtable and on the client reports.
A Script triggers an EmailGuard test, retrieves the deliverability stats.
The data is logged per sending domain or mailbox in Airtable.
The team sees “Inbox Placement Score” or “Spam Rate” in a dashboard, and can take corrective actions if scores are low.




                                       6. Client reporting - Google Sheets vs interactive dashboards
Currently, you provide clients with a Google Sheets report with their campaign metrics. 
There are 3 potential directions:

                                       1. Keep Google Sheets
Continue to push a summary of the data from Airtable to Sheets and your clients have an overview of the general campaign data (active campaigns) + the inbox placement tests.


                                       2. Upgrade to interactive dashboard
You can still use Google Sheets as the backend with daily data for each campaign, but present a front end using Looker Studio where your clients have access to a much more detailed view of their campaign analytics and can use filters.
  

This is a template from Looker Studio to serve as example





                                       3. Move to a client portal
Build a client facing portal (Airtable Interface or Softr)
They could slice data by date range, see a list of replies, daily stats, etc - this involves more costs to keep a portal running (Softr has a free tier which we can start, but as you get more data you may need to upgrade to other tiers ($59 for 20 clients or $167 for up to 100) 


                                       * Automated weekly reports
If you choose to have a live dashboard or portal for your clients, the OS can still generate a PDF or Sheet every week that is emailed to each client with the summary for that week.





                                       7. Sales automations


                                       1. Post call sequence emails
As you move a lead to a nurture stage, it automatically triggers the post call sequence (or any other sequence). 
This can also be done by analyzing the Fathom notes and understanding to which stage in the pipeline the lead should go (you can have the same selections but inside Slack as the example below)
  



                                       2. LinkedIn campaigns from positive responses
After receiving a Positive Response in the EmailBison campaign, push the lead to a respective LinkedIn campaign that connects with them and follows up mentioning the email they’ve just replied to.


                                       3. Push Fathom summaries into Close
If the summaries appear on the email we can parse them into Close. If they are behind the login page through a link it may be possible to get it also, but it’s not sure.


                                       4. Lead response time
Besides storing the time of reply we will store the time it was answered from Dulcy side and calculate the average response time (excluding weekends)


                                       5. Integrate AI phone call dashboard [later on]
We integrate all the analytics from the AI phone calls into Airtable so you have a single source of truth for the data from all campaigns (you mentioned this is later but wanted to keep it here documented)






  III.      Conclusion 
This strategy is based on the intro call we had and my experience with other lead gen agencies.
There are a lot more places I can help you later down the road besides the service delivery but that’s once all of this is in place.
Ex: Optimizing your systems for content creation (scrape a bunch of competitor content, sort by best performing, look in comments for more ideas, use all of it to generate new and better ideas for you, and so on). Then grab these ideas and turn them into YouTube scripts + send them automatically to the editor.
This strategy is for you to take and do what you want with it, there’s enough information to get started on a lot of the processes.


________________






If you want, we would be more than happy to help you make this a reality. 

These are our terms:
                                       * Project base: I map out a proposal and project scope with the exact systems you want to be implemented and the total pricing. 
-  You have a 10% referral discount on a first project

                                       * Subscription: $2,500 per month.
- You have a 20% referral discount on the 1st month, so it would be:
$2,000 on the first month and $2,500 afterwards.


As a reminder, we always offer a first free implementation with no commitments (as long as it’s not a complex one) - as we spoke this can be added as an additional week into your first month.
We can get started right away with that first implementation by choosing one on the list.

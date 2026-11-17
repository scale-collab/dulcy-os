# Jarvis

Source: https://docs.google.com/document/d/1CAZmkHfvTKP0LYWSvUzBbGgQyB8VD1eqgyLBdZ-lnAU/edit?usp=drivesdk
Modified: 2026-08-17T03:42:54.239Z
Exported: 2026-11-17. Source document; not independently validated as current.

﻿1. Voice
2. Xero
3. Update airtable
4. Upload sops / knowledge base
5. Whatsapp
6. Heyreach
7. Pandadoc
8. Calendly
9. Revreply
10. Cheapinboxes
11. Porkbiun
12. Discogen (use it to run all rows for grompts) - claude and aws hosting (run in parallel)
13. Opus clup
14. Robinhood
15. Insatgram
16. X
17. Linkedin
18. Add domains and accounts to emailguard via api during onboarding
19. Work on better domain exclusion system
20. Rev reply
21. Make the jarvis where if email fails inbox placement then it quarantines and then start in 7 days and then message cheapinboxes or via the website actually
22. Adding booked meeting to bison blacklist
23. Make sure we have a spamword list for the spintaxing
24. Add sales agent called Cole
25. Telegram for phone










Finished:

1. Airtable
2. Bison
3. Calendar
4. CRM
5. Discolike
6. Emailguard
7. Gmail
8. Google drive
9. Google sheet
10. Knowledge
11. Leadmagic
12. Local tools
13. Memory tools
14. Millionmverifer
15. Planning
16. Slack
17. Workflow
18. Phase out reminders in my apple
19. If bounce rates are high figure out whats in common (security, 550 errors -> reverify, etc)
20. Perhaps make validation take the emails from discolike and MV it and then 




MCPs:


1. Bison
2. Airtable
3. Google
4. Discolike
5. Emailguard
6. Leadmagic
7. Mv?
8. Slack
9. Xero
10. Heyreach**
11. Panddoc**
12. Robinhood
13. Opus clip**
14. Cheapinboxes**


** add to airtable
Reports we built with Claude that help us service 300+ active clients:


1. Churn risk flow - every Wednesday, we get an accurate list of clients more likely to churn, based on results, sentiment, etc.


2. Weekly Monday reports (per AM)- client performance, upsell stats, testimonial asks, etc.


3. Daily financial report - all bank account balances pulled in to one report + EOM forecasting based on upcoming billables.


There is just so much you can build.




  

* Track bounce rate per email account and/or domain
* Inbox placement test
* Warm up scoring
* Span list checks
* Flag dipping performance


2 set of accounts nad rotate every 3 weeks
First hint of an inbox starting to get cooked is the warming score gets hit before reply rates tank. <96%
Below 0.4% human reply = cooked. Buy fresh keep sending burned (~30% drop)




Segment by replies and positives by gateway
The offer beats every trick
Best reply rates from unique copy – jokes work.


For buying domains make what you do weird like generic patterns scream cold email


Vary sender names




When buying domains:


There are three things that you should be doing to protect yourself:
1.⁠ ⁠Make sure you mix the domain names so they don't look too similar to one another
2.⁠ ⁠Make sure you don't purchase all domains in one go. For example, if you have to purchase a hundred domains, try to split them into groups of ten to twenty domains each, and use a different account if you are using the same registrar, or use different registrars. Also try to wait a couple of minutes between each purchase
3.⁠ ⁠Try to add an extra layer that doesn't make it too obvious when redirecting the domains. For example, you can use domain masking or add a captcha layer so SURBL’s bots cannot check the final website as easily and have to solve a CAPTCHA first




  

  

  

[7/17/26, 17:25:05] Alexander: Curious for the cold email agencies in here are you guys booking the meetings for your clients or just sending them the positive replies?
[7/17/26, 17:27:25] ~ Thomas Chavez: Both is ideal, tbh it’s a simple automation to build out
[7/17/26, 17:44:14] ~ Josh: Both all day
[7/17/26, 17:50:47] Alexander: Okay makes sense because, we do both as well, but I’m having some trouble on the reply side of things we used to use human inbox managers in the past, but with demand it’s hard to keep up with all the follow ups and replies, so we switched to an AI player, but every single one of my clients have hated it so far and their replies are just not been where we need it to be
[7/17/26, 17:52:38] ~ Jaime Rubiel Gonzalez: What AI are you using? is this a solution you built in house?
[7/17/26, 17:53:24] ~ Thomas Chavez: This is pretty simple to solve for.


Every single client needs to have replied templates that AI reads these are tailored to each client. 


Then you need to basically have the AI read the email that came in from the lead. 


Then read the template and make a reply based off of that. 


If the AI is 90% sure that it’s the right reply then automatically send it. 


If it’s not above 90% sure then it’s sent to an internal channel for y’all to review


Literally give this prompt to Claude and tell it that you need to build this.


[7/17/26, 17:55:10] Alexander: Currently RevReply
[7/17/26, 17:55:36] Alexander: I’ll give that a shot thank you
[7/17/26, 17:56:20] ~ Thomas Chavez: Game changer, we handle hundreds of leads a day doing this
[7/17/26, 17:57:21] ~ Thomas Chavez: There’s gonna be some other things that you need to build out with it.


You’ll need a simple database. I’d recommend supabase. It’s cheap. Get the API key from there.


Then go to Claude console and get an API key from there. 


And then you’ll be able to have Claude set it all up






Jason b to thomas chavez


This. We use a human to review them all with multiple levels of approval if the reply is strange and out of the normal. No one wants to talk to Ai, so make sure it’s human approved.




https://github.com/yheshamx/bison-reply-bot
1. Finish spam center
2. Make sales center
3. Campaign management screen 
4. Client churn and ltv






sequences stats
Discolike list list
Companies, contacts, MV or LM
Then final sheet discogen if needed?
When uploading list can do remove segs


Inbox placement metric for “at risk” “spam”
Add heyreach to campaign creation






spaceship has a decent api. we've set up an n8n automation to drip buy our domains, probably a good move








MCPs:


1. Bison
2. Airtable
3. Google
4. Discolike
5. Emailguard
6. Leadmagic
7. Mv?
8. Slack
9. Xero
10. Heyreach**
11. Panddoc**
12. Robinhood
13. Opus clip**
14. Cheapinboxes**


** add to airtable

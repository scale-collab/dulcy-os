# COLD EMAIL SOURCE OF TRUTH

Source: https://docs.google.com/document/d/1U5hD2SUXVTYb__QK2FdBGyVvDkKukJ_881Cd-l8ITzA/edit
Modified: not recorded
Exported: 2026-11-17. Source document; not independently validated as current.

﻿* Score leads based on their likelihood to respond with interest, and put those higher on your lead list. 
* score leads based on actual ICP fit and pull the best-fit prospects to the top of the list so they get emailed first. 
* Remove companies with email security (SEGs like Mimecast, Proofpoint) entirely if possible.
* Rotate infra and have backup infra ready at all times.
* Run unbranded domains for month one. 
Group A inboxes get an extra two weeks of warmup. 
Group B gets 45-60 days before touching a live campaign.
* Be way more granular with specific words and phrases in your copy.
* We had a client with a TRUE no-brainer offer get 0 replies after 24h.
I replaced the word "free" with complimentary in the script.
The very next email generated a lead.
Spam words are no joke.
* Warm up tag  




I run a lead gen agency with 300+ clients and a lean team.


Here are 14 things I built with Claude Code to make that possible:
·


I went from not having touched Claude Code to it running our entire lead gen operation.


And I started with the things eating the most time.


Here's everything I've built so far:


1. A campaign top-off automation for our internal lead gen.


We had 15 active campaigns that needed fresh contacts (used to take me a full Saturday).


I dumped a voice note into Claude, had it build the whole thing, and knocked it out in two hours.


2. A skill that queries every campaign we've ever launched.


Input your offer and target industry, and it finds similar campaigns we've run + what worked, what didn't, and why.


New AMs can use this to cut their learning curve without needing years of cold email experience.


3. A cold email copywriting skill.


You run a sequence through it and it QAs the copy against a framework we've refined over three years.


Gets new hires producing at a high level faster and keeps output consistent across the team.


4. A lead list building skill with title-level ICP analysis.


Instead of blindly trusting a database, this pulls every title across your account list and cross-references against your offer.


5. A single campaign orchestrator.


Walks you through launching a campaign from scratch.


It evaluates your offer, checks list criteria, flags anything that looks off, and waits for approval before moving forward.


6. A bulk campaign orchestrator.


Same as the single, but across every open campaign task at once.


AMs drop their queued campaigns into a spreadsheet, push it in, and Claude works through all of them (asking questions, flagging issues, moving on approvals in one session).


7. An AI SDR roleplay tool for screening cold callers.


This runs candidates through a four-step voice flow (intro video, script read, live roleplay) so we can assess ability before ever getting on a call.


Then it builds a ranked database of vetted callers.


8. A billing and finance automation.


End-of-month used to mean a full day of pulling invoices, checking subscriptions, verifying payments, and building reports manually.


Claude automated the whole thing.


More accurate than doing it by hand, and better reports too.


9. A daily financial summary sent every morning.


Pulls from Mercury, Stripe, and our investment accounts.
Summarizes all balances, incoming transactions, and upcoming expenses in one notification.


10. A daily outbound performance report.


Every morning: total emails sent, reply rate, leads generated, bounce rate, and positive reply rate across all client campaigns.


11. A historical trend analysis layer on top of reporting.


Data gets pushed into Airtable on a recurring basis and Claude looks at the record to flag anything worth paying attention to (ex: reply rate trending down).


12. A dispute letter builder.


When a client dispute comes up, Claude pulls data from Front, Fathom, HubSpot, and Stripe, then writes the dispute letter.


This used to take hours.


13. A catch-all campaign bounce analysis.


Smartlead pauses campaigns at 5% bounce: but after only 10 sends, that's one email.


Claude ran the analysis, separated domain-level sender issues from actual list quality problems, and showed us exactly what was wrong.


14. A skill to stress-test offers before launch.


Put in your offer, angle, and target industry.


It checks historical campaign data, tells you if you've tried something similar, what the results were, and whether stronger angles exist.
  

@AlexHormozi
 on writing benefits that convert:


Weak: "Fast and easy meals for your family."


Strong: "So fast and easy that all your friends will wonder how you found the time to be fit and cook for your family."


Every benefit should answer: who will envy them for this?
If you want to build a winning Claude cold email copywriting skill, you need these 5 things:
1:56 PM · Apr 17, 2026
·
3,450
 Views
Relevant


Nick Abraham
@NickAbraham12
·
Apr 17
1. Actual campaign data and performance.


You want the LLM to write copy that closely resembles elements of winning campaigns as best you can. 


You do that by telling it exactly which copy performed well.
Nick Abraham
@NickAbraham12
·
Apr 17
2. Tons of opener / CTA examples.


The LLM must understand exactly how to write opening and closing copy that sounds, looks, and feels human. 


If you can't get past this point, you're in trouble.
Nick Abraham
@NickAbraham12
·
Apr 17
3. Methods for constructing body copy based on inputs.


We break this down by inputs on our onboarding form. The skill must be able to craft copy with a varying level of description, input, and research from the client.
Nick Abraham
@NickAbraham12
·
Apr 17
4. Frameworks.


Break down every winning framework you have for writing cold emails. 


There are tons of these online, and I've posted about a bunch of them before as well.
Nick Abraham
@NickAbraham12
·
Apr 17
5. Before and afters.


Give as many before and after / teardowns as you can. 


Here, you are showing before-and-after descriptions of cold email copy and what made you make certain changes.




add a feedback loop from the sequencer to this skill so it can automatically analyze campaign data




When to top off, rebuild, or pivot a campaign
How to decide what to do next when a client's campaign is underperforming or plateauing
SIGNAL
	DECISION LOGIC
	ACTION
	Performing at or above average
Client’s email-to-lead ratio is close to or better than your overall agency average.
	Is the campaign converting at a healthy rate?
Compare email-to-lead ratio against your agency-wide benchmark. If it’s within range, the campaign is working and just needs more volume.
	Top off the campaign
Pull previous targeting, build a lookalike list, enrich, validate, and add net new contacts into the existing campaign.
	Underperforming by 40%+
Client’s email-to-lead ratio is significantly below your agency average. Something needs to change.
	Can you take the same offer into a new vertical?
This is usually the highest-probability play. Same offer, different industry, more relevant messaging. Launch as a fresh campaign.
	Same offer, new vertical
Adapt messaging for the new industry and launch as an entirely new campaign.
	Underperforming and locked in
Client is underperforming, operates in one industry only, and can’t or won’t change their offer.
	Can the client create a new offer?
If yes, build around it. If no, you’re limited to copy iterations and angle testing. This has the lowest likelihood of a meaningful performance change.
	New offer or copy testing
New offer if possible. If the client won’t budge, iterate on copy and angles within the existing setup.
	























Framework version
1) Performing at or above average
Signal: Client’s email-to-lead ratio is close to or better than your overall agency average.
Decision logic: Is the campaign converting at a healthy rate? Compare email-to-lead ratio against your agency-wide benchmark. If it’s within range, the campaign is working and just needs more volume.
Action: Top off the campaign. Pull previous targeting, build a lookalike list, enrich, validate, and add net new contacts into the existing campaign.
2) Underperforming by 40%+
Signal: Client’s email-to-lead ratio is significantly below your agency average. Something needs to change.
Decision logic: Can you take the same offer into a new vertical? This is usually the highest-probability play. Same offer, different industry, more relevant messaging. Launch as a fresh campaign.
Action: Same offer, new vertical. Adapt messaging for the new industry and launch as an entirely new campaign.
3) Underperforming and locked in
Signal: Client is underperforming, operates in one industry only, and can’t or won’t change their offer.
Decision logic: Can the client create a new offer? If yes, build around it. If no, you’re limited to copy iterations and angle testing. This has the lowest likelihood of a meaningful performance change.
Action: New offer or copy testing. New offer if possible. If the client won’t budge, iterate on copy and angles within the existing setup.


________________


SOP: How Many Cold Emails Should You Send?
Source: Nick Abraham
________________


Core Philosophy
Send as many emails as you possibly can. Whatever number is in your TAM, hit them every 30–60 days and repeat with new messaging, new offers, and new copy. Run this system on autopilot and ram volume. Nick has never seen anyone make less money or close fewer deals by maximizing email volume. If you want to speed run results and get as many clients as possible — send as many emails as you possibly can.
________________


The Goal-Based Framework
Everything starts with your goals. How many clients do you want per month? How many appointments? How many leads? You identify those numbers first, then backtrack from them. The volume you need to send is a function of your goals — not an arbitrary number.
________________


Step 1 — Identify Your Email-to-Lead Ratio
Definition: How many emails you need to send to generate one singular lead.
What counts as a lead: Anyone who shows interest at any level — "Can I see pricing?", "Can I get more info?", "I'd be interested", "Let's find a time to speak." All of it counts as a lead.
How to find your number:
   * Launch 3–5 campaigns
   * Send approximately 10,000–30,000 emails
   * Track results across different verticals and ICPs
   * Calculate your cumulative average across all of them — not just your best campaign
Why cumulative average matters: Most people run one strong campaign with a narrow, highly targeted list and see a ratio like 1 lead per 150 emails. That's phenomenal — but it doesn't scale. As you expand into other ICPs that are less tapped, and as your lists get bigger, that number will get worse. You need the average across campaigns to get your real baseline.
Scale adjustment: At scale, expect a 10–20% increase (worsening) in your email-to-lead ratio because:
   * Lists get fatigued
   * Campaigns become less targeted as volume grows
   * Deliverability will waver over time depending on your infrastructure setup
That adjusted number is your real email-to-lead ratio at scale. Use this number — not your best campaign number — for planning.
________________


Step 2 — Walk Down the Funnel
Once you have your email-to-lead ratio, you layer in three more metrics:
________________


Metric 1: Appointment Set Rate
Benchmark: 40–60% (use 50% as your planning number)
This depends heavily on how the offer is structured:
   * Direct response copy to your ICP with a straight offer → 50% appointment set rate is realistic
   * Lead magnet offers, Loom video audits, or any "value first" style hooks → You will get more leads, but your appointment set rate will drop significantly — closer to 20%. This is because people opt in out of curiosity, not buying intent.
   * Commoditized offers in commoditized spaces → You may have to accept the lower set rate and live with it. The surplus volume of leads still nets out a strong funnel overall.
What drives appointment set rate to 40–60%:
   * Enriching every positive reply to get their phone number
   * Calling them within 5–30 minutes of their response
   * Leaving a voicemail if they don't pick up
   * Sending at least 2 follow-up emails after their initial response to push toward booking
   * Calling them an additional 2–3 times if you have their phone number
   * If they're still engaging but haven't booked — adding them to a nurture/newsletter sequence to keep them warm
________________


Metric 2: Show Rate
Benchmark: 70–80%
This is achievable with proper pre-call infrastructure in place. What that infrastructure looks like:
   * Pre-call email flows
   * Day-of reminder calls
   * Text message reminders
   * 5–6 touch points between the booking and the actual call
   * Drip them with testimonials, social proof, and case studies in those touch points
   * If you have a VSL — use it. Make sure they understand exactly what you're selling before they get on the call
Why this matters for close rate too: Most people book a cold lead and that lead has zero idea who you are. There's a massive trust barrier. Even the best closer in the world — Nick uses Jordan Belfort as the example — will close at maybe 7% on cold traffic without pre-call flows. With proper pre-call flows, that same traffic can close at 19–20%.
________________


Metric 3: Close Rate
Benchmark: 19–20% on pure cold traffic
This is for SMB to mid-market, selling lead gen or similar offers, on cold traffic with a solid offer. Nick notes:
   * People who claim 80–100% close rates are almost always talking about referrals or warm traffic — not cold
   * 19–20% on cold is genuinely good
   * At that rate, for every 7 calls that show, you close 1–2 deals
________________


Step 3 — Reverse Engineer Your Volume
Once you have all four numbers, plug them into this chain:
Target deals/month ÷ close rate = calls needed to show
Calls needed to show ÷ show rate = calls to book
Calls to book ÷ appointment set rate = leads needed
Leads needed × email-to-lead ratio = emails to send per month


Nick's Example 1 (10 deals/month):
   * Close rate: 20% → need 50 calls to show
   * Show rate: 75% → need to book 67 calls
   * Appt set rate: 50% → need 133 leads
   * Email-to-lead ratio: 1 per 1,000 → need to send 133,000 emails/month
Nick's Example 2 (50 deals/month, agency scale):
   * Close rate: 10%
   * Show rate: 85%
   * Appt set rate: 80%
   * Email-to-lead ratio: 1 per 600
   * Result: Need 735 leads → 588 calls booked → 500 calls show → need to send 441,000 emails/month
Nick notes: most agencies won't want to close 50 deals/month because ops will break. But this illustrates the math.
________________


Key Takeaway
Build this as a spreadsheet. Plug in your actual numbers from your campaigns. Identify where in the funnel you have the most leverage — is it email-to-lead ratio? Set rate? Show rate? Close rate? That's where you focus optimization before you scale volume.
________________


Ready for the next one.


SOP: Claygent vs. DiscoGen — AI Scraping for B2B Lead Gen
Source: Nick Abraham (Leird/Libre — 1,000+ active clients, 4M+ cold emails/month, 1M+ LinkedIn PMs/month, 1,000+ campaigns/month, partner at Cleverly)


What Is Claygent?
Clay's native AI scraping feature. One of the first to market with AI-embedded list processing — largely responsible for birthing the GTM engineering space and the use of AI variables in cold email campaigns. It allows you to prompt it to visit a website, pull a specific detail, or come to a conclusion based on other data points. Enables highly personalized, variable-rich campaigns at scale.


Why they moved away from it: Clay changed their pricing model. Previously you only paid for actual API usage of whichever AI model you had plugged in. Now Clay charges additionally for Claygent usage on top of that, making it more expensive than before. Nick's note: it's not unaffordable or bad — just no longer the most cost-efficient option.


What Is DiscoGen?
A feature inside of Claude (referred to as "Disco" in context — this is Claude's computer use / tool-use capability inside Clay or similar environments). Does the same core thing as Claygent: prompt it to visit a site, pull specific information, come to a conclusion.


Key difference in UI/UX: Doesn't work as natively or cleanly as Claygent does inside Clay. Some things you'd do natively in Claygent can't be done as elegantly in DiscoGen. However, the majority of Claygent use cases are replicable.


Pricing advantage: You are only charged for the actual model compute — whatever model you're running underneath. No additional platform markup on top of the AI cost.


The Core Problem with DiscoGen Out of the Box
It is extremely slow. When running DiscoGen natively through Claude, it processes records one at a time — sequentially, one run at a time. On a list of 7,500 accounts, this takes an unacceptably long time.


Nick's Solution: Parallel Processing via Custom Server
What they built:


Took the endpoint that makes calls to run DiscoGen
Built a custom server
Hosted it (recommendation: AWS)
Posted the server so DiscoGen runs in parallel
Built a skill inside Claude that calls the server endpoint whenever invoked — so you just say "use DiscoGen and run this" and the skill fires the API call to the parallel endpoint
Result: ~3–5 minutes to process 7,500 records instead of ~40+ minutes


Critical setup step — turn off conflicting MCP connectors:
Inside your Claude connectors/MCP settings, turn off:


"Run DiscoGen"
"Run DiscoGen Personas"
"Validate MCP Fit" (optional but recommended)
Why: If your custom skill is named something like "Disco Agent" and those native connectors are still on, Claude's MCP may get confused and call the native slow endpoint instead of your parallel skill endpoint. This will cause it to process at the original slow speed and create errors. Disabling those native connectors forces all DiscoGen calls through your custom parallel skill.


Use Cases
Use Case 1: Sub-Segment / Sub-Category Variable (Most Common & Most Impactful)
Core principle: Never force AI to come up with a variable. The best variables are specific, naturally occurring sub-categories or sub-segments that AI can identify with high accuracy.


Why this works: Nick has never run a campaign where adding a specific sub-segment variable did not improve performance. It allows you to call out exactly who someone is rather than grouping them.


Example: Building a list of local home service contractors.


Without variable: "Hey, saw that you're a contractor…"
With sub-segment variable: "Hey, saw you're a plumbing contractor…" / "Hey, saw you're a general contractor…"
The specificity stands out because no one else is doing it at that level
Also noted: sub-segment specificity adds a layer of syntax variation which additionally helps deliverability and engagement.


Use Case 2: Business Model / Motion Classification
Example they ran: List of SaaS companies. Used DiscoGen to classify each company as:


PLG (Product-Led Growth) — free trial, self-serve motion
Sales-Led Growth — traditional outbound/inbound sales motion
Both
Critical prompting rule: You cannot give AI a loose, vague classification task. It will make errors. You must:


Define each category explicitly with a description — e.g., "PLG = [full description of what PLG is]", "Sales-Led = [full description]"
Give it a fallback classification for records that don't fit either category — e.g., "If the company is an agency or not a software company, classify it as [X]" — otherwise it will force-fit every record into one of your defined buckets incorrectly (e.g., classifying an agency as PLG)
Use Case 3: ICP Validation / Scoring
Problem it solves: No matter where you pull a list from, you will always have variance in how accurately the records match your ICP. Example: pulling "SaaS companies" will return tech-enabled service providers, agencies that position themselves as SaaS, etc.


How to use DiscoGen/Claygent for this:


Give it a detailed description and breakdown of exactly what your ICP looks like
Have it score each record on a scale of 0–10 — do NOT use yes/no
Why 0–10 over yes/no: You need a human to review the scored list and make judgment calls. Questions you'll be asking yourself:
Are the 7s acceptable given my list size and TAM?
Is the cutoff at 8 because the 7s were genuinely off-ICP?
Is my TAM so small that I need to allow the 5s and 6s?
Are any scores below a certain threshold completely unusable?
The numeric score gives you the flexibility to make those calls. Binary yes/no removes that nuance.
Prompting Best Practices
Never force a variable. If you try to force AI to come up with something, error rate increases significantly and it will mess up frequently. Let the variable be something that flows naturally from what's already on the page.
Give clear definitions for every classification. Don't assume AI knows what PLG means or what your ICP is. Define it explicitly in the prompt.
Always provide a fallback option. Tell it what to output if none of your defined categories apply. Without this, it will force-fit everything and produce inaccurate results.
Test on 5–10 records first. Before running against your full list, manually QA the output on a small sample to verify it's returning accurately. This prevents burning through a ton of credits on a bad prompt.
Provide a full sentence if using output as a campaign variable. If the AI-generated output will be dropped directly into an email sentence, give it the full sentence in the prompt so it understands the expected format and word choice. Otherwise the output won't fit naturally in context.
Summary Recommendation
DiscoGen is a viable, cheaper replacement for Claygent for the majority of use cases
Do not use it natively — it will be too slow to be practical
Build a parallel processing server (AWS recommended), expose an endpoint, and build a Claude skill that calls it
Disable native DiscoGen MCP connectors to avoid routing conflicts
Don't force variables — use sub-segments and natural classifications
Use 0–10 scoring for ICP validation, not binary yes/no
Always test 5–10 records manually before running full list
SOP: Cold Email Copywriting Framework
Source: Matt (Anivvo) — 10M+ cold emails sent, 4,000+ sales meetings booked


Ground Rules
These are not absolute laws — cold emails can break every one of these and still work. But in approximately 90% of cases, following these rules will produce better performing emails.


Rule 1: Write in a 1-to-1 Style, Not Ad Copy Style
Cold email is a one-to-one channel. Treat it like one. The single biggest mistake people make when sending at scale is they forget they are sending to individual people and start writing like they are broadcasting to a crowd.


What ad copy sounds like:


"Introducing this product…"
"A lot of marketers struggle with this. We built a solution to help marketers…"
Talking about an amorphous third party
Grandiose, commercial tone
What 1-to-1 copy sounds like:


"Hi John, I noticed you have this problem. We can help you solve this with [solution]."
Talking directly to one specific person about their specific situation
The word "you" used frequently — you are talking to a person, not a camera
The frame to use: Imagine you are knocking on their door or meeting them at an event. How would you talk to them in that moment? That is how your cold email should read.


If you are writing manually to one person, this is obvious. If you are sending at scale, it becomes easy to forget — but the channel is still 1-to-1 and recipients respond to emails that feel personal to them.


Rule 2: Shorter Is Better
In roughly 90% of cases, if you can say something in fewer words, you should. Shorter cold emails outperform longer ones on average for two compounding reasons:


Reason 1 — General attention spans are shot. Short form content, constant notifications, Slack messages, calls, emails — people are being attacked from every direction. The average person no longer has the focused attention span they once did. Concise messaging performs better because of this reality.


Reason 2 — You are a stranger, which makes it worse. Not only do people have short attention spans in general, they have even shorter attention spans for people they do not know. If a random person walks up to you on the street, you give them maybe half a second before your guard goes up. A cold email is the same dynamic — a stranger appearing in someone's inbox. You get even less grace than a known contact would. Keep it short.


The rule: say the same thing in fewer words. You almost always can.


Rule 3: Be Valuable to the Recipient
You are a stranger asking something of someone. That is already an uphill battle. The more you can flip the dynamic — making the email valuable to them rather than extractive — the more likely they are to respond.


Ways to deliver value in a cold email ranked by impact:


Actually give something for free inside the email — highest value
Offer to do something for free — second highest value
Point out a problem they may not be aware of and offer a solution
Deliver an insight they probably weren't aware of
The more you can position yourself as a positive force rather than someone who wants something from them, the better your response rate will be.


Rule 4: Act Human
This ties into the 1-to-1 rule but deserves its own callout because it manifests differently. Many of the best performing cold emails Matt has written and seen perform well sound almost like a text message — something you'd send a coworker or a friend.


What non-human writing looks like:


Corporate jargon
Trying to sound like a literary masterpiece
Overly formal sentence structures
Perfectly eloquent paragraphs
What human writing looks like:


Abbreviations where appropriate
Informal language and sentence structure (not sloppy — just natural)
The way you'd actually talk to a coworker: "Hey, can you shoot this over to me?" vs. "Hey, can you please send over this asset to me?"
Imperfect but natural
Note: The level of informality should match the market. Some audiences warrant more formality. But even in formal markets, sounding human matters. Human tone elicits human responses and stands out precisely because so few people do it.


Rule 5: Pretend You Got This Email (The Most Important Rule)
This is less a rule and more a mindset — but it is the single most valuable frame in cold email copywriting.


Before you send any cold email, read it as if you are the recipient. This is the fastest, most reliable way to evaluate whether your email is good enough.


Why it works: When you write your own cold email, you look at it through rose-tinted glasses. When you read it as the recipient, you become appropriately critical. You will immediately feel whether this is an email you would respond to or trash.


Matt notes: out of 100 cold emails he receives, he is interested in maybe 1 or 2. The reason those 1 or 2 stand out is immediately obvious — they follow the rules above. They feel written specifically for him. They are short and to the point. They are valuable to him. They sound human.


How to apply this at scale: Click into individual LinkedIn profiles from your lead list. Become that person in your mind. Then read the email you're about to send them. It makes you far more critical in a productive way and reveals exactly what is wrong with your copy before it goes out.


Important caveat: even a perfectly written cold email cannot save a bad offer. If you are selling something the recipient does not want, they will not respond regardless of copy quality. But this frame is still the easiest and fastest way to score your email before sending.


The 3-Part Cold Email Framework
Every good cold email contains all three of these parts. They can be written as separate lines, combined into one line, or structured however makes sense — but all three elements must be present.


Part 1: Why Are You Reaching Out to Me Specifically?
The first question in every recipient's mind when they get a cold email is: Why me? Answer this as fast as possible. This is your call out and/or personalization.


What this looks like:


"Hey Matt, I noticed you run a cold email agency."
"Hi John, I saw that your website is loading slow."
"Hey Susie, I saw that you just got a new role."
"I noticed you're the CMO at [company name]."
"I saw that [hospital name] is using Athena Health."
You are calling out something specific and real about them. This gives them a reason to keep reading.


Optional addition: pair the call out with a question that bridges to the problem you solve. Example: "I noticed you just came on as CMO — are you looking for new ways to drive pipeline?" This transitions naturally into Part 2.


Note on list quality: Having a highly targeted list with additional data points makes the call out significantly stronger. If you know they use a specific EHR, specific software, are hiring for a specific role, or have a specific signal — you can write copy that calls that out directly and immediately differentiate from generic outreach.


Part 2: What Are You Selling Me and Why Should I Trust You?
After the call out, go straight into the pitch. Do not bury it. Do not delay. If someone never gets to the pitch, the pitch can never land.


State:


What you are selling / what problem you solve
Why they should trust you (social proof, proof of results, credibility)
On proof and social proof: This is the single heaviest lifting element of the value prop. Do not talk about features and bells and whistles. Instead, give them a reason to believe you. Options:


Number of clients or users: "We're working with 30 clients right now"
Volume/scale proof: "We've sent 10 million cold emails"
Results proof: "We've booked 4,000 sales meetings"
Industry-specific proof: "We've booked 2,000 meetings specifically in [their industry]" — even stronger because it's relevant to them
Named endorsements or recognizable customers
Specific stats: "70% improvement in internal protocol adherence" / "5,000+ up-to-date compliance rules"
The more specific and relevant the proof is to their world, the more convincing it is.


Important nuance on ad copy vs. 1-to-1: Do not re-explain the problem to someone who already lives it. If you are writing to a Chief Medical Officer about documentation errors, they know what documentation errors are. Skip the "most physicians struggle with X" framing — that is ad copy. Go straight to your solution.


Part 3: What Do You Want Me to Do Next?
End every cold email with a clear, specific call to action. Do not pitch someone and then leave them with nothing. Make the next step obvious.


Options depending on your product and proof:


Direct meeting ask: works best if you have a strong, established, easy-to-digest offer with clear proof
Free trial or free work: ideal when the offer can be sampled without deep integration
Free asset or explainer: "Would you be interested if I sent you a quick explainer video?" — useful for complex products that require more context before a meeting makes sense
Free campaign/pilot: "Let us run a small-scale campaign so you can see the results yourself"
Note on free offers vs. direct asks: If your product is complicated, requires deep integration, or isn't immediately obvious in value — a free asset or explainer as the CTA is a lower-friction bridge. If your product is simple and your proof is strong, go straight for the meeting.


Make the CTA valuable. Coming back to Rule 3 — if you can offer something for free, that is always stronger than just asking for their time.


The Complete 3-Part Framework in Action
Example 1 — Medical compliance AI (Dentress), targeting Chief Medical Officer:


Hi [First Name], I noticed you're the Chief Medical Officer at [Hospital Name]. How are you currently managing medical documentation errors?


We have an AI platform that can spot when clinicians make documentation errors — missing forms, conflicting notes, incomplete assessments — and prevent any lost revenue from rejected insurance claims. Our platform has 5,000+ up-to-date compliance rules and is used by [X] hospitals across the country.


Would you be interested if I sent a quick explainer video on how it works?


Part breakdown:


Call out: Chief Medical Officer title + pain point question
Pitch: AI platform + what it catches + specific proof (5,000+ rules, X hospitals)
CTA: Explainer video (appropriate for complex product)
Variation — same product, different call out angle (EHR-based):


Hi [First Name], I noticed [Hospital Name] is using Athena Health. Are you currently spotting errors in patient notes?


We have a platform that plugs directly into Athena and can catch documentation errors in real time — preventing lost revenue from insurance claims and reducing patient safety risks.


[Same CTA]


Same framework, different personalization angle. Both are valid — test both.


Example 2 — Cold email agency, targeting companies hiring SDRs:


Hi [First Name], I noticed you're hiring for a Sales Development Rep. Would you be interested if we could book 2-3x as many meetings as an SDR without having to hire one directly?


We run high-volume cold email campaigns and hit every decision maker in your market with a personalized message. We've sent over 10 million cold emails and booked more than 4,000 sales meetings with our approach.


Would you be interested if we ran a small-scale campaign to show you what kind of results we can generate?


Why this works:


Call out: hiring an SDR signals they want more meetings — directly relevant
Pitch: 2-3x meetings without the hire — immediate ROI framing — plus proof (10M emails, 4,000 meetings)
CTA: free small-scale campaign — low risk, tangible deliverable
This email is 4 sentences. It can be made 3. It can be made 2. Shorter is always an option.


Supplementary framework: Signal → Prepared Asset → Proof → CTA → Risk Reduction


Adapted from the email-framework screenshot supplied by Alexander. This is an optional signal-led execution of the existing 3-part framework, not a required formula for every client. Use it when a current company observation makes a genuinely useful asset relevant. Keep the approved offer, delivery conditions and client-specific sales motion.


The five-part recipe
1. Signal: state one specific, verifiable observation about the company. Record the source URL, observation date, relevant date window and exact fact in the campaign evidence. Separate what was observed from what it might suggest; ads, hiring or a website gap do not prove poor performance.
2. Prepared asset: connect that signal to a concrete resource, solution or piece of work the recipient can use. Say “we already have” or “we mapped out” only when that exact asset exists and has been checked. Otherwise offer to create it, with approved scope, inputs and turnaround, or choose an existing relevant example.
3. Comparable proof: use one approved result from this sending client's work with a genuinely comparable customer. Preserve the exact metric, timeframe, attribution and limitations. Record the source and approval. If relevant verified proof is missing, omit the result sentence or use an honest mechanism/observation; never invent a case study to complete the formula.
4. Low-friction CTA: ask for one specific next step, such as permission to send the named creative brief. Make clear what they receive and any material cost, input, call or eligibility condition. A yes to “send it” is permission to receive that asset, not evidence of purchase intent.
5. Honest risk reduction: reduce the real burden through clear scope, no required purchase, or no required meeting when those statements are true. “No pitch attached” is usable only if the asset and delivery really contain no pitch. Do not substitute an unsupported performance guarantee or hide a sales-call gate.


Reusable template
Hey [First Name],


Saw [specific, source-backed company signal].


We already have [verified ready asset] based on [carefully stated relevance], and recently helped [approved comparable customer] achieve [verified result] in [verified timeframe].


Want me to send over [specific low-friction asset]?


[Honest, approved risk-reduction statement.]


Use the “already have” and “recently helped” clauses only when supported. If work has not been done, replace the first clause with “We can put together [approved asset and scope]” and disclose any necessary inputs or conditions. If proof is unavailable, remove that clause. Keep the email short without cutting material terms.


Illustrative example from the screenshot — not approved client proof or send-ready copy
Hey Mike,


Saw your Meta Ad Library has 14 active ads, but only 2 new creatives launched in the last 30 days.


We already mapped out 6 new angles based on your current winners and recently helped another apparel brand increase new customer revenue 31% in 45 days.


Want me to send over the creative brief?


No pitch attached. If the ideas are bad, ignore them.


Example checks before adapting
The 14 ads, 2 creatives, 6 angles, 31% result and 45-day timeframe are illustrative claims from the supplied example, not verified facts about any Dulcy client or prospect. Verify or replace every one. Record the ad-library observation date, filters and scope; if the source only shows start dates for currently visible ads, describe that limited observation rather than claiming all creative launches. Public ad visibility alone does not establish “current winners”; that phrase needs actual performance evidence. Confirm the brief exists, the comparable result is approved, and “no pitch” accurately describes delivery.


Release check
The reviewer can trace the signal and proof to sources, open the exact asset, identify its delivery owner and method, and confirm that the CTA preserves all disclosed conditions. Never bait-and-switch an emailed asset into a mandatory call or purchase. If an asset or claim is unsupported, revise that clause or keep the draft blocked. This addition is copy guidance only; it does not authorize campaign launch, sending, automation changes or new commercial terms.


Additional Notes on Copywriting Process
Best language for value props comes from your sales process. The actual words your leads use on sales calls and in replies are the best copy you will ever write. Feed that language back into your email copy.
Audience nuance matters. When writing to doctors, "Hi [First Name]" may offend — use "Dr. [Last Name]" instead. Small details like this signal whether you understand the world your prospect lives in.
AI research as a starting point. Using Claude or similar to pull a quick breakdown of a company — what they do, who they sell to, social proof elements from their site — is a fast way to arm yourself before writing. Then write the email yourself using the framework.
Multiple versions of the same email. Write at least 2 versions with different call out angles and different value prop framings. Test them. The same product can be pitched from multiple angles and different ones will resonate with different segment
SOP: The Full Cold Email System — $1M Framework
Source: Matt Lucero (Anivvo) — 10M+ cold emails sent, 4,000+ sales meetings booked


Pillar 1: Building Your Sending Engine
What NOT to Use
Do not use HubSpot or Mailchimp for cold email outreach.
HubSpot is a CRM. Its email sequencing is not optimized for cold prospecting to strangers. It lacks warm-up tools and multi-inbox sending capability.
Mailchimp is explicitly not meant for cold email. It is a newsletter/opt-in tool. Their terms of service prohibit sending to people who have not opted in. Sending cold emails from Mailchimp will get your account suspended.


The 100 MPH Rule — Why You Need Multiple Email Accounts
Analogy: A family minivan can technically go 100 mph. But if you actually do it, you get pulled over and go to jail. Same thing with email. Google and Microsoft technically allow 100–1,000 emails per day per account. But if you send anywhere close to that volume to strangers, your emails will land in spam — spam jail.
The solution: horizontal scaling. Instead of one inbox sending high volume, you run many inboxes each sending low volume, all flying under the radar. Combined, they produce high total volume while each individual account stays safe.
How to calculate how many accounts you need:
Decide your target daily send volume
Plan for approximately 20 emails per account per day (rough rule of thumb)
Divide total target volume by 20 = number of accounts needed
Example: 1,000 emails/day ÷ 20 emails/account = 50 email accounts needed
Matt's operation runs 10,001 email accounts sending over 1 million emails per month.


Recommended Sending Tools
Smartlead (Matt's primary recommendation)
Instantly
Plus Vibe
Email Bison
These tools are purpose-built for cold email. They include warm-up networks, multi-inbox management, spin tax, plain text mode, and other features critical for deliverability. Some allow you to purchase and create email accounts directly inside the platform.
Preferred email providers: Google Workspace or Microsoft Outlook/Office 365.


DNS Records Setup
Every email account needs proper DNS records configured:
SPF record
MX record
DMARC record (Google "DMARC record" and paste it in)
Most of the tools above walk you through this setup or automate it when you connect accounts.


Email Warm-Up
What it is: Building reputation on a new email account so that when you start sending cold emails, they don't land in spam immediately.
Minimum warm-up period: 14 days before sending any cold emails from a new account.
How it works: Warm-up networks (built into Smartlead, Instantly, Plus Vibe, etc.) simulate real email activity on the account — sending and receiving emails, marking them as not spam, building a positive sender reputation.
Warm-up to cold email ratio: Send approximately 1 warm-up email for every 1 cold email you send from that account. If sending 20 cold emails/day, set warm-up to 20–30 emails/day. Matt's setting: randomized between 20–30 warm-up per day per account.


Pillar 2: Targeting Strategy — Picking Who You're Selling To
TAM → ICP → Segment Framework
Think of it in three layers:
Total Addressable Market (TAM): Every person who could potentially buy your product or service. If you sell headphones, everyone with ears.
Ideal Client Profile (ICP): The subset of your TAM most likely to buy. If you sell expensive Apple headphones, this narrows to people willing to spend more money, Apple ecosystem users, people who value sound quality, people who work out and want wireless, etc.
Segments: The distinct personas within your ICP. These are the individual sub-buckets you will actually build lists around and run as separate campaigns. Examples:
People who just bought a new iPhone (strong buying signal)
People currently using Bose headphones (competitor users)
People who just got promoted to HR director (role-change trigger)
Each segment = one campaign. You write specific copy for each segment. You do not mix segments.


The Last 10 Clients Exercise
The easiest way to identify your best segments: look at the last 10 people who paid you money. Find what traits they have in common. What did they do before buying? What title were they? What size was their company? What trigger preceded the purchase? Those common traits define your highest-converting segments.


How Far to Segment — Rules of Thumb
Too narrow: Lists under 500 people (unless extremely hyper-targeted with high confidence of conversion — e.g., re-engaging your own CRM where the audience is already warm).
Too broad: Scraping 100,000 people in one pull. At that size, you cannot write specific messaging that feels personal. The email will feel generic because it is.
Sweet spot: 1,000–20,000 leads per segment depending on campaign structure.
The test: Ask yourself — can I write an email that feels like it was sent specifically to this person? If the list is too broad to do that, narrow it down.


Three Success Factors for Any Campaign
Specific list — the most controllable lever
No-brainer offer — covered in copywriting section
No (or low) competition — targeting underserved segments
Being specific is the single easiest thing in your control that makes cold email campaigns work. Specific list + specific copy = emails that feel personal = higher response rate.


List Building Tools
For white-collar, B2B, LinkedIn-present prospects:
Apollo (primary recommendation) — pulls data primarily from LinkedIn. Handles accounts, decision makers, and contact details in one tool. Does 3 of the 4 data steps automatically.
Sales Navigator
ZoomInfo
Prospeo
Disco AI
Arc
For local businesses, blue-collar, trades, contractors, mom-and-pop:
Outscraper — pulls from Google Maps
Serper — pulls from Google Maps
Other options: Custom scrapers, Chrome extensions to scrape specific databases.
90% of use cases are covered by one of these two buckets. Choose based on whether your ideal avatar exists on LinkedIn (use Apollo) or primarily operates as a local/physical business (use Outscraper/Serper).


Four Layers of Data (in order)
Accounts — the companies you are targeting
Decision Makers — the specific people within those companies you are reaching out to
Contact Details — their email address, LinkedIn URL, phone number, etc.
Validation — confirming that the data is accurate and the emails actually exist before sending
Why validation matters: Sending emails to addresses that don't exist wastes volume and hurts deliverability. Bounce rate spikes will damage your sending infrastructure.
Recommended validation tools:
Million Verifier — standard email validation
Listment — all-in-one solution that also handles risky emails
Apollo covers steps 1–3. Add validation on top with Million Verifier or Listment.


Pillar 3: Writing Emails That Get Replies Without Landing in Spam
The 1-to-1 Rule
Write every cold email as if you are writing to one single person, even if you are sending to 10,000. People do not respond to emails that feel like they were blasted to 50,000 strangers. When your email sounds like a broadcast, people report it as spam — which damages your infrastructure AND loses the reader.
Specific lists make this easy. If you scraped 10,000 people who just got promoted to HR director, you can say "Hey, I saw you just got promoted to HR director" — and it sounds personal because it is true.


Spin Tax (Mandatory at Scale)
Google and Microsoft fingerprint email copy. Even across multiple sending accounts, if you send 2,000–10,000+ emails per day with identical or near-identical copy, they can detect the pattern and begin rejecting your emails.
What spin tax is: Micro-variations embedded in your copy so no two emails are identical.
How it works in Smartlead/Instantly:
Write variations inside curly braces separated by pipes:
{Hi|Hello|Hey} → one third of emails get "Hi," one third "Hello," one third "Hey"
Apply this across your entire email — subject line, opening, body, CTA. With 5–10 variation snippets, the multiplicative effect produces thousands of unique combinations. 2,000 emails sent in a day = 2,000 unique versions. Google and Microsoft cannot fingerprint it.
Real example of what happens without spin tax: Matt ran a campaign sending 10,000+ emails/day without spin tax. Bounce rate skyrocketed to 12% because Google/Microsoft detected the common patterns across accounts and started rejecting the emails.


Deliverability Rules for Copy
Never include in cold emails:
Links — flags spam filters, higher perceived risk of virus/phishing
Images — same reason
HTML formatting — same reason
These are fine for newsletter emails sent to opted-in subscribers. For cold email to strangers, the filters are much stricter. Plain text only.
Turn on Plain Text Mode in your sending tool (Smartlead, Instantly, etc. all have this setting under delivery optimization). Smartlead marks it as "recommended."
Disable open tracking. Open tracking works by embedding an invisible image pixel in the email. This image pixel = HTML = higher chance of landing in spam. Turn it off.
Plain text emails land in the inbox more reliably. Once you are in the inbox, copy does the rest.


The Cold Email Framework (4 Parts)
Part 1 — Personalization / Call Out
Open by calling out why you are reaching out to this specific person. Reference something specific and true about them.
"Hey Susie, I saw you just got brought on as HR director. Congratulations."
"Hi John, I noticed [company] is using Athena Health."
"Hey, I saw you're hiring for an SDR."
Part 2 — Value Proposition
Tell them what you are selling and why it is valuable to them. Be direct. State what the product does clearly.
"We have a tool that can help you hire candidates 3x faster and you only pay if you get results."
Part 3 — Call to Action
Push them toward a specific next step. Do not leave it open-ended.
Four CTAs that convert in 2026:
30-minute call — only use this if you have a blue ocean product/service that is genuinely new and innovative and is generating high interest. For most people, this is too aggressive for cold traffic.
Soft ask — "Can I send you more info?" Lower friction, easier yes.
Free portfolio or sample — "Can I send over some examples of our work?"
Free deliverable — free campaign, free trial, free audit where you do the work. Highest converting CTA when applicable.
If you can make something free, it converts substantially better than just asking for their time.
Part 4 — Reread as the Recipient
Before sending, go back through the email as if you received it. Identify every objection you would have. Examples:
"Is this company established?"
"Has anyone else used this?"
"Does this apply to my situation?"
Address those objections proactively inside the email. If they would worry about legitimacy, drop a recognizable client name or case study. This pass-through catches errors and objections that optimism blinds you to when writing.


Copy Principles
Clear beats clever. (Credit: Alex Hormozi.) Trying to sound smart, fancy, or creative loses a significant percentage of people who simply do not understand what you are trying to say. Say exactly what your product does in plain language.
Bad: "An innovative solution that helps you with your staffing and recruiting needs and hiring candidates that were never imaginable."
Good: "A hiring software that helps you get candidates hired faster."
Write like a friend texting a coworker. If your email sounds corporate, formal, or like a cold email template, it gets deleted like a cold email. The moment it reads like spam, it dies.
Subject lines: Write them the same way — human, specific, not salesy. Do not A/B test subject lines in isolation. Test the entire email style.


A/B Testing — What Actually Moves the Needle
Do not A/B test:
Subject lines alone
Minor word changes or micro nuances
Do A/B test:
Entire style of copy — e.g., direct response vs. curiosity-driven
Free deliverable vs. no free deliverable — this is a meaningful variable that will show you real signal


Follow-Up Sequences
Length: 2–4 emails maximum. Beyond that, diminishing returns kick in and spam report rate increases.


Pillar 4: Converting Replies Into Closed Deals
The Funnel Stages
Cold email → Reply → Call → Sale → Retain/Upsell
Cold email does not close deals. It gets replies. Replies get calls. Calls get deals. Do not try to close someone in a cold email — especially for services costing tens of thousands or hundreds of thousands of dollars. People do not make impulse decisions from a stranger's email.


Speed to Lead
Respond to interested leads as fast as possible. The quicker you respond, the higher the likelihood of booking a call. Faster is always better.


The 3-Part Reply Framework (Cold Email → Booked Call)
When someone replies with interest or a question, use this structure:
Answer their question — address whatever they asked
Sell the call — explain why getting on a call will give them even more value than you can provide over email
Pitch specific times — "Are you free Tuesday at 1pm or Wednesday at 3pm?"
The most common mistake: people answer the question and then wait. They go back and forth over email indefinitely. No meeting ever gets booked. Push to get them off email and onto a phone call as fast as possible. You will not close nearly as many deals over email as you will on a phone call.


Warm Calling
After someone expresses interest via email, call them. This is not a cold call — they expressed interest, so they are warm.
Conversion comparison:
Cold calls: approximately 300–400 dials to book 1 meeting
Warm calls: approximately 20–30 dials, ~3 people pick up, and most who pick up will agree to a call because they already said they were interested
Matt's setup: US or Canada-based reps make the warm calls. This improves answer rates and conversions significantly.


Multi-Channel Follow-Up Sequence for Interested Leads
After someone expresses interest, run this sequence until they book a call or tell you to stop:
Send LinkedIn connection request
Warm call
Follow-up email
Repeat
Keep cycling through these touch points. Most people give up too early. A lead that goes cold after one attempt can often be reactivated with 5–7 more multi-channel touch points. Keep going until they explicitly opt out or book.


LinkedIn Automation for Lead Follow-Up
Use tools like Hey Reach to automatically send LinkedIn connection requests and messages to everyone who has replied with interest. Adds another touch point without manual effort.


CRM
Track everything in a CRM so nothing falls through the cracks. Options: Close.com (Matt's personal tool), HubSpot, Salesforce, or any CRM. What matters is that it is in use and all leads are tracked with follow-up tasks.


The Math (Reverse Engineering Volume)
Most people set up campaigns, do not do the math upfront, and wonder why they are not seeing results. Work backwards from your goal:
Example:
Want: 100 booked sales meetings
Need: ~500 interested replies (assuming ~20% reply-to-booking conversion)
Need: ~500,000 total emails sent to generate 500 replies (assuming ~0.1% reply rate)
This sounds like a lot — but it is normal for every marketing channel. TV commercials, billboards, Meta ads — all require massive reach to generate a small percentage of conversions. Cold email is no different.
Once you have your KPIs dialed in: If you know that for every 3,000 emails sent you get 1 booked call and you want 50 booked calls — scale to 150,000 emails. The system is now a math problem, not a guessing game.








SOP: Building a Lead List with Claude (End-to-End)
Source: Nick Abraham (B2B Legion / Leird) — 1,000+ active clients, hundreds of campaigns/month


Important Framing Before Anything Else
Most videos on building lead lists with Claude make it look like you can just say "find me a bunch of agencies" and it pumps out a perfect list. That is not how it works. This SOP covers what actually works in practice, including where AI will mess up, what to QA, and how to fix it. You must still be a smart individual making decisions — Claude is a tool, not a replacement for judgment.


What this covers: Building the account list, validating ICP fit, sourcing decision maker contacts, structuring output. Does not cover enrichment, email validation, or pushing into a campaign sequence — those are separate processes.


What You Need Before Starting
Two Core MCP/Connector Types
1. Account List Builder — finds lookalike companies based on a seed domain


Disco (Nick's primary recommendation) — has a strong MCP, accepts a seed domain and uses AI to find similar companies. More accurate than filter-based tools like Apollo or ZoomInfo because instead of using industry/keyword filters (which return a lot of non-ICP matches), you give it a domain of a company that matches your ICP and it finds more like it.
Ocean — also has a strong MCP, works on the same principle
2. Contact Database — ingests company domains and returns employees with titles


Nick's agency uses an internal database
Prospeo — recommended for outside users. Has an MCP, affordable, allows bulk data pulls
Why Skills Matter More Than the Tools Themselves
You can connect these tools and just type "build me a lead list" — Claude will do something. But it will do it generically, miss nuances, and skip logic that matters in real campaigns.


Example of what Claude skips without a skill: You push a domain that has only 2 employees — a CEO and a Head of Fulfillment. Claude will grab the CEO and skip the second person. But at a 2-person company, the Head of Fulfillment is also effectively a decision maker. Without a skill encoding that logic, you miss contacts.


What skills do: They bake your specific decision frameworks into Claude so it builds lists the way you want them, not the way a general AI thinks it should. Skills accept your logic on things like:


ICP validation criteria
Title relevance rules
Company size-based contact coverage logic
How to handle edge cases
Nick's core skills built for this workflow:


ICP Validation Skill — uses Disco's validate endpoint to check if a pulled company actually matches the ICP description
Title Validation Skill — examines all titles returned from the contact database to determine if each person is a relevant decision maker based on title AND company size
List Segmentation Skill — splits output into the three buckets (covered below)
Google Sheets Upload Skill — custom-built to upload the full output in batch rather than row-by-row (important — explained below)
Part 1: Building the Account List
Core Principle of List Building
You can only build lists off of public, verifiable data. You cannot build a list based on criteria like "companies with a $50M marketing budget" — that is private data that is always changing. Build off of things that are publicly visible on their website: badges, keywords, content, case studies, certifications, etc.


How to Use Disco for Account List Building
Step 1 — Pick the right seed domain.
Give Disco a domain that clearly and exclusively represents the specific segment you are targeting.


If you want roofing contractors only — do not use a domain that also covers HVAC and plumbing. The list will come back polluted with general service contractors.
Use a domain whose entire website is filled with keywords specific to that one segment only. A roofing-only contractor whose site has roofing, roofing inspections, roofing replacements, etc.
Step 2 — Include your offer and product/service description.
This is less for the account pull and more for correctly sourcing contacts later. Give Disco context on what you sell.


Step 3 — Pull a small sample first (5–100 accounts).
Do NOT pull the full 7,500–10,000 account list immediately. Pull a small batch, run ICP validation, and confirm it is passing at minimum 80% accuracy before pulling the full list. This saves credits and time.


Step 4 — Run ICP Validation on the sample.
Use Disco's validate endpoint (available in their MCP). Give it a detailed ICP description — not just "roofing contractors" but a full description like "general contractors that exclusively provide roofing services. Their website will contain keywords such as roofing, roof replacement, roofing inspection, etc." The more specific the description, the more accurate the validation.


What validate does: pulls the cached homepage text for each domain and scores it against your ICP description. Flags non-fits, partial fits, and confirms fits.


Step 5 — Use AI-generated ICP descriptions, not lazy ones.
Do not write "we work with roofing contractors." Use Claude or GPT to generate a detailed, thorough description of your ICP. Paste your brief into it and ask it to write a complete ICP description. The more detailed the description fed into the validation, the more accurate the scoring.


Step 6 — Review the validation output and make decisions.
Claude will flag software tools, off-ICP companies, duplicates, etc. and give you a summary. Example output: "13 flagged as software, 7 completely off ICP, X duplicates, estimated clean domains = Y."


You still have to decide:


Are the borderline/partial fits acceptable given your TAM size?
Do you want to pull additional accounts to replace the removed ones?
Should you add negative keywords to the search to filter out recurring false positives?
Claude will suggest refinements (e.g., "add negative keyword 'software'" to remove recurring wrong pulls) — act on those suggestions.


Step 7 — Pull the full list.
After validating the sample and confirming 80%+ accuracy, pull the full list. Plan for the last 25% of any large list (e.g., last 2,500 of a 10,000 pull) to be less accurate than the first 75%. This is a consistent pattern across all AI list building tools including Disco and Ocean. The validation step filters these out.


Part 2: Sourcing the Right Contacts
The Right Approach — Pull All Titles First, Then Filter
Do not feed Claude a list of "perfect decision maker titles" and ask it to find only those. This makes the contact list too small, especially when enriching from a list of domains where title data is limited.


The better approach:


Take your entire list of clean domains
Push all domains into your contact database (Prospeo or equivalent)
Pull back every single employee and title across all domains — do not filter yet
Take the complete list of all titles returned
Run it through your Title Validation Skill to identify which ones are decision makers
What the Title Validation Skill evaluates:


Is the title relevant to what you are selling?
Does the company size affect whether this title is a decision maker?
Company size logic (critical nuance):


At a company with 2 employees: if the second person has a title like "Head of Fulfillment" and is not an entry-level assistant, they are probably worth contacting — especially if it is relevant to your service
At a larger company: a mid-level operations title may not be a decision maker. Same title at a 3-person company probably is.
Build this size-based logic into your Title Validation Skill so Claude applies it automatically
Relevance filter:
Even at a small company, if your service is security-related and the second employee is a CMO — probably not relevant. The skill should cross-reference title against what you sell, not just company size alone.


Part 3: Extracting Campaign Variables with DiscoGen
If you want a personalization variable for your campaign, use DiscoGen (Disco's AI scraping feature, comparable to Claygent in Clay) to extract it from company websites.


Example use case from this video: Nick wanted to reference case studies on each company's website in the campaign copy — "Love the work you did for [case study name]." DiscoGen was used to pull just the case study company name (not the full description, not extra context — just the name cleanly formatted to slot into the sentence).


Why DiscoGen works better here than Claygent in some cases: It returns clean, precise output that fits directly into the variable without requiring cleanup. Clay sometimes returns the full context or a full sentence when you just want the variable value.


Handling missing variables (critical):
Not every company will have a case study on their site. Do not remove those leads from the campaign. Use liquid syntax in your sequencer to handle it:


If case study variable exists → include the sentence referencing it
If case study variable does not exist → omit that sentence entirely
Ask Claude or GPT to write the liquid syntax for you: paste the sequencer's liquid syntax documentation into GPT and ask it to write the if/then logic for your specific variable.
Part 4: The Three-List Output Structure
Every list build should produce three separate segments in your output Google Sheet:


List 1 — Matched Contacts
Companies where your database found employees. Filtered down to decision maker titles that passed validation. These are your primary campaign contacts.


List 2 — Unmatched Domains
Companies where your database returned zero employees. These need to be run through a manual crawl search (separate process) to find contacts through other means.


List 3 — Public Email Domains
Companies (typically under 50 employees) that have publicly listed email addresses on their website (e.g., info@domain.com, sales@domain.com, hr@domain.com). Build a skill that:


Identifies these companies
Pulls the public emails
Filters out HR/irrelevant emails (you are not trying to email their HR department)
Keeps general inbox and sales-facing emails (info@, sales@, contact@)
Build a skill that automatically segments all three outputs and routes them to the correct list.


Google Sheets Output — Important Technical Note
Google Sheets does not have a native MCP. You cannot create a Google Sheet directly from Claude out of the box. Most GitHub solutions for Google Sheets MCP process row-by-row when uploading — this is too slow for any meaningful list size.


Nick's solution: Built a custom solution to upload in batch. He offers a resource showing how to set this up yourself (referenced in video, link in description).


The QA Process — Non-Negotiable
After the Google Sheet is populated, you must actually look at it. Do not take the output at face value and push straight to campaign.


What to look for:


Titles that do not match your ICP (e.g., "data specialist" at a lead gen agency — may not be a decision maker, check company size)
Contacts that were pulled because of a secondary role (e.g., someone whose primary role at another company is COO but was pulled here for a different reason)
Case study names that may be inaccurate — spot check a few against the actual websites
Public email addresses that are HR-facing or irrelevant
How to handle issues found in QA:
Go back to Claude and tell it specifically what you found. Example: "There are a lot of data specialists on the contacts list. These would not be decision makers. Remove those and look for titles related to operations instead." Claude will refine and re-run. This iterative refinement loop is what makes the final list usable.


Full Workflow Summary (End-to-End)
Connect MCPs — Disco (accounts) + Prospeo or equivalent (contacts)
Build skills — ICP validation, title validation, list segmentation, Google Sheets upload
Identify seed domain — clean, single-segment, keyword-rich
Pull 5–100 account sample from Disco
Run ICP validation on sample — confirm 80%+ accuracy
Review validation output — make decisions on partial fits, add negative keywords if needed
Pull full account list (plan for last 25% to be lower quality, filter via validation)
Push all domains into contact database — pull ALL employees and titles, no pre-filtering
Run Title Validation Skill across all returned titles — filter to decision makers using title + company size logic
Run DiscoGen for any campaign variables needed (case studies, subcategories, etc.)
Handle liquid syntax for contacts missing the variable — if/then in sequencer
Segment output into three lists: matched contacts, unmatched domains, public emails
Upload to Google Sheets in batch
QA the Google Sheet manually — scan for off-ICP titles, inaccurate variables, irrelevant contacts
Go back to Claude with specific feedback on what needs to be removed or refined
Re-run affected segments after refinement
Final list is ready for enrichment, email validation, and campaign push








—-----------skills from video




gtm-lookalike-list
Added by: Your admin
Last updated: Apr 9, 2026
Trigger: Slash command + auto
Build a validated, ICP-matched prospect list from a lookalike domain seed using Discolike. Runs two layers of ICP quality checks — a preview comparison plus DiscoGen ICP validation — and a refinement feedback loop. Only exports when ≥85% of records are validated as ICP fit. Use when user says:
   * “find companies like [domain]”
   * “build a lookalike list”
   * “run a discolike search”
   * “lookalike accounts for [client]”
   * “prospect list from [domain]”
   * “discolike lookalike”
or wants a GTM prospect list built from a client website or seed company.
________________


Purpose
Build a validated prospect list from a domain seed.
Use the discover-similar-companies MCP tool for discovery, validate ICP fit via DiscoGen validate-icp-fit, and export a CSV only when ≥85% of records are validated as a fit.
Not for: Enriching existing lists, email verification, or loading campaigns into SmartLead.
Credit gate: Step 2 pulls 5 sample records and may consume credits. The full 7,500-record search (Step 3) is the main credit spend — do NOT run it before explicit user approval of the ICP text.
Step 4 runs DiscoGen validation which costs approximately $0.10–$0.15 per 100 domains (about $7.50–$11.25 for a full 7,500-record pull).
________________


Dependencies
   * MCP tool: discover-similar-companies (primary discovery method)
   * MCP tool: validate-icp-fit (ICP validation via DiscoGen)
   * MCP tool: get-discogen-status (view validation results)
   * MCP tool: extract-website-text (optional — pull homepage text for phrase match)
________________


Input
   * Lookalike domain — seed website (e.g. leadbird.io)
   * ICP description — 2–4 sentences including:
   * industry/vertical
   * company size
   * must-have criteria
   * must-not-have criteria
   * (Optional) exclusion keywords
________________


Process
Step 1: Collect Inputs
   1. Ask the user for:
   * lookalike domain
   * ICP description
   * campaign name
   * geography filter (US-only or global?)
   2. (Optional) Ask for exclusion keywords.
   3. If the ICP is fewer than 2 sentences or uses generic terms (e.g. “B2B companies”, “agencies”), ask for more specificity before proceeding.
________________


Step 2: Preview Auto-Targeting & Compare ICP (Validation Layer 1)
Call discover-similar-companies MCP tool with:
domain: [seed domain]
auto_icp_text: true
max_records: 5
fields:
  - domain
  - name
  - description
  - similarity
  - employees
Then:
   1. Inspect the 5 returned descriptions to infer what Discolike auto-targeted.
   2. Compare against the user’s ICP.
   3. Identify phrases that would pull in off-ICP companies.
   4. Present the comparison.






—--------------


forever-leads-list-builder
Added by: Your admin
Last updated: Apr 8, 2026
Trigger: Slash command + auto
Description
Build targeted B2B lead lists from the Forever Leads database and export a CSV, ready for outreach. Takes targeting criteria — job titles, seniority, job functions, headcount, industry, geography, personas — translates them into validated database filters, verifies >80% accuracy via a sample review, and exports the CSV directly in the chat.
Use whenever the user wants to build a lead list, pull contacts, find prospects, or source people to reach out to.
Trigger on:
   * “build me a list of [job title] in [industry]”
   * “find [persona] at [company size] companies”
   * “I need leads for [campaign/audience]”
   * “pull contacts for [targeting description]”
or should we target at [industry] companies, or any request to source or list B2B contacts.
Even if vague (“find me some prospects”, “I need more leads”) — invoke this skill. It will guide them through targeting.
________________


Purpose
Pull a validated, export-ready lead list from Forever Leads based on the user’s targeting criteria. The target is 5,000 contacts — enough for a real outreach campaign.
To get there, the skill proactively expands titles, broadens industry and headcount coverage, and uses layered get_count queries to build volume without sacrificing accuracy (>80% gate still applies).
Not for: Enriching existing lists, domain lookalike discovery (use gtm-lookalike-list), or loading campaigns into Smartlead.
________________


Available Forever Leads Tools




	Cost
	Use For
	get_available_values
	Free
	Lookup valid filter values (industries, seniority, functions, etc.)
	get_count
	Free
	Check contact count for a filter set — use aggressively for layered volume building
	get_coverage_stats
	Free
	See breakdown of contacts by dimension
	search_contacts
	Credits (small)
	Pull a 25-contact sample for accuracy review
	export_contacts
	Credits
	Full CSV export (max 5,000 per export)
	get_my_usage
	Free
	Check remaining credits
	





Always use get_count before export_contacts. get_count is free — use it as many times as needed to test filter variations before spending credits.
________________


Workflow
Step 1: Gather Targeting Criteria
Ask for the user’s targeting criteria. You need:
   * Who — at least one of:
   * job titles
   * seniority
   * job function
   * persona description
   * What company:
   * industry/vertical
   * headcount range
   * Where — optional:
   * country
   * region
   * global
Extract dimensions from natural descriptions — don’t make the user repeat themselves. If something is genuinely ambiguous, ask one focused question before proceeding.
Step 2: Translate Inputs + Proactively Expand Titles
Two things happen in this step:
   1. Validate filter values against the database.
   2. Think critically about what titles and criteria would expand the addressable pool without losing relevance.
Validate filter values with get_available_values.






—-----




lets build a lead list using /gtm-lookalike-list, /fl-mcp-domain-search and /forever-leads-list-builder and /csv-to-gsheet


Seed Domain: leadbird.io
ICP description: B2B lead generation agency doing outbound - cold email, cold call, or linkedin outbound as an agency.


Product we're selling is lead gen consulting / operations to make them more scaleable


lets first use /gtm-lookalike-list. I want to validate that its a lead generation agency after its pulled, and then scrape the website for the case study name so I can use as a variable in my cold email like “PS love the work you did for [casestudycompanyname]”


then lets use /fl-mcp-domain-search to find the contacts but I need a sheet for the domains not found and the domains with public emails we can hit


then we can start the process of using /forever-leads-list-builder to identify decision makers (typically they're all small with under 50 employees) so ceo founder is best but we might want to grab the next best if they have only 2 so we have more contacts to hit. verify the contacts are decision makers


and then we can upload contacts to a google sheet, public emails to another and then left over domains to another


I only need 150 accounts pulled from Discolike for this so everything can process quicker


SOP: How to Make Your Offer Cold Outbound Ready
Source: Nate Behr (Leaper) — millions of cold emails/month, hundreds of thousands of cold calls/month, thousands of clients


The Core Problem
Most clients believe that because they have a service, people will immediately be interested when they reach out via cold email. This is wrong.


If you are selling a commodity service — and the vast majority of people are — your service alone will not convert on cold traffic.


Unless you are selling something completely new, first to market, and genuinely novel, you are selling a commodity. Thousands of other companies sell the same thing. Going to market saying "Hey, we do X, are you interested?" will not generate consistent results. The only exceptions:


Signal-based campaigns — where you are finding people who are actively in-market for what you sell. Example: scraping job boards for companies hiring SDRs and reaching out to pitch your SDR replacement service. In this case, saying "we do X" can work because you are fishing where fish are already biting.
Right place, right time — the prospect happened to already be looking for exactly what you sell when your email arrived. This is luck, not a system.
For everything else — raw lists pulled from Apollo, cold traffic with no intent signal — you must create an offer. You must pitch an outcome, not a service. That is the only way to convert cold traffic consistently and build a channel that reliably generates leads.


Demand Gen vs. Demand Creation — Critical Concept
Before building your offer, understand what type of marketing channel you are operating in:


Demand Capture Channels (Google, SEO, search): People are actively searching for your solution. They already have awareness and desire. You do not need a strong offer to convert them — they are coming to you with intent already formed.


Demand Creation Channels (Cold email, cold traffic ads): You are knocking on a complete stranger's front door. They have zero awareness of you, zero desire to buy, and zero context. You are starting from scratch. You have to create the awareness AND the desire entirely from the cold message.


This is why service pitches fail on cold traffic. The person receiving your email is not looking for you. You are interrupting their day as a total stranger. A naked service pitch has no mechanism to create desire from zero. An offer does.


Key rule: Adjust your messaging based on the channel. What works on Google does not work on cold email. If you hire a lead gen agency or try a new marketing channel without understanding this distinction, you will not get the results you want regardless of how good the execution is.


The Three-Lever Framework for a Cold-Outbound-Ready Offer
Lever 1: Service Lead Magnet (Best Performing in 2026)
Definition: A free deliverable that is directly tied to the paid outcome you sell.


This is not a digital lead magnet (ebook, guide, checklist). It is a free done-for-you piece of work that previews exactly what they would get if they became a paying client.


Why it works:


Starts the conversation about value, not commitment
Gets people to say yes faster because you are not asking for anything big
The test: read the cold email and ask yourself — why would my prospect say no to this? If you cannot think of a reason, it is a good offer.
Example: a Director of Sales who just got hired receives an email offering a free lead list built to their ICP. Why would they say no? There is no good reason.
Hormozi case study referenced: A gym business that offered something free on the front end got 9x more leads than the gym that did not offer something free — and closed at the exact same rate. Result: 9x the revenue. Same close rate. Just more leads coming in.


Four requirements for a good service lead magnet:


Fast to produce — something you can grab and do quickly. Example: using Claude to build a lead list takes minutes.
Repeatable and templatizable — you must be able to do this at scale. If it takes hours and hours per prospect, it does not work.
Automatable to some degree — if it cannot be systematized, do not use it as your front-end offer.
High perceived value — the prospect has to look at it and immediately recognize it as something worth having.
Examples across different service types:


B2B lead gen agency → offer to build a free lead list of their ICP
Facebook ads agency → offer to create free ad creatives for their brand
Cold email agency → offer to rewrite one of their failing email flows
The deliverable must be tangible. Audits and free consultations do not count — prospects know an audit ends with a pitch and a consultation is just a sales call rebranded.
Note on saturation: The free lead list offer is now more saturated than it was a few years ago when it was extremely high-performing across the board. In less saturated markets it still works extremely well. In saturated markets (e.g., marketing agencies getting B2B lead gen pitches constantly), it is less effective but still outperforms a naked service pitch.


On gift cards and physical gifts (AirPods, etc.): Large enterprise sellers with million-dollar LTV have used gift cards ($100) and AirPods ($200) to incentivize meetings. Nate was skeptical but has come around to it for high-LTV offers where the cost is negligible vs. the deal size. However, this is a fallback — only use this if you genuinely cannot think of a free deliverable tied to the paid outcome. A tied deliverable is always the first choice.


Lever 2: Guarantee or Performance Aspect
Definition: A clear "if we don't deliver X, you get Y" statement built into the offer.


Why it works: Reduces decision friction. Acts as a risk reversal. Prospects who see a guarantee are more likely to respond because you are absorbing the downside for them. It helps cross the trust barrier that cold prospects inherently have with a stranger.


Effectiveness by market:


In less-saturated markets: a guarantee is highly effective and will outperform everything else
In heavily-saturated markets (e.g., marketing agencies being pitched B2B lead gen with a "10 appointments guaranteed" offer constantly): less effective because it has been seen too many times. It will still outperform a naked service pitch, but do not expect exceptional results.
What makes a guarantee good:
It must be tied to something the prospect actually cares about. Weak guarantees that do not work:


"Customer satisfaction guaranteed" — meaningless, everybody says it
"Dedicated account management team" — nobody cares
"Based in America" — not a performance guarantee
Strong guarantees are tied to the specific outcome the prospect wants — meetings booked, revenue generated, leads delivered, etc.


Addressing the "freebie hunter" objection:
The concern is that offering a guarantee will attract tire kickers who take the guarantee and are not serious buyers. The answer: you do not have to give the guarantee to every prospect. The guarantee is a marketing hook that drives inbound interest. On the sales call, assess fit. If they are not a great fit for your service (e.g., they have no front-end offer, their product has no market, etc.) — do not extend the guarantee. Tell them honestly: "I noticed you don't have a front-end offer that would help us convert. I can't give you this guarantee in that situation, but let me walk you through our pricing and see if we're still a fit." Be human. Be flexible. Sales is fluid.


The math on guarantees and refunds:
Even if you take 10 clients with a guarantee and have to refund 1 because you did not deliver — that scenario still outperforms taking 5 perfect-fit clients with no guarantee and zero refunds. The guarantee generates more leads, which lands more clients, which produces more revenue even accounting for the occasional refund. The math favors the guarantee in almost every scenario.


Lever 3: Create Something That Makes It Impossible to Say No
Definition: A hyper-easy, hyper-specific, low-commitment next step that the prospect can say yes to immediately with no friction.


This is the lowest-risk version of an offer. Examples:


"I noticed four areas on your site that are causing drop-off. Want me to send you a quick Loom walking through how to fix them?"
"I spotted X, Y, and Z. Want me to record a 5-minute video on how to address each one?"
Trade-off vs. Levers 1 and 2: This approach generates more top-of-funnel volume because the barrier to say yes is extremely low. However, your appointment set rate will be lower than with a strong service lead magnet or guarantee because many of the people who say yes are not yet serious buyers — they just wanted the free video.


When to use this:


You cannot think of a good service lead magnet
You cannot credibly offer a guarantee yet
This is better than nothing. It still outperforms a naked service pitch.
Best format: a personalized Loom video. Short, specific, actionable.
What NOT to do with Lever 3:


Generic "free audit" offers — everyone knows it ends with a pitch
"Free consultation" — everyone knows it is a sales call with a different label
Anything that sounds templated or mass-produced


Framework Summary
Lever        What It Is        Best For        Trade-Off
1 — Service Lead Magnet        Free done-for-you deliverable tied to paid outcome        Most markets, best performer in 2026        Must be fast, automatable, and repeatable
2 — Guarantee / Performance Aspect        Risk reversal tied to a specific outcome        Trust-barrier-heavy markets, B2B sales        Can attract tire kickers; must assess fit on call before extending
3 — Easy Yes Offer        Low-commitment specific next step (Loom, quick deliverable)        When Lever 1 and 2 are not available        Lower appointment set rate, more top-of-funnel volume
Use these levers in priority order. If you can do Lever 1, do it. Add Lever 2 on top if possible. Fall back to Lever 3 only if 1 and 2 are not viable options. Any of the three will outperform a naked service pitch on cold traffic.
SOP: Fixing Low Usability Scores on Discolike Discovery Pulls
Source: Discolike Support — real troubleshooting case on Consumer Electronics DTC ICP


The Problem This Solves
You run a discovery pull, get a low usability score (target is 85%+), adjust your filters, run again, still low. Wrong-category companies keep bleeding in despite tightening exclusion text. Credits are burning. This SOP covers the exact fixes.


Mistake 1: Exclusion Paragraphs in Your ICP Text Are Making It Worse
The counterintuitive truth: Adding a long "it does not sell clothing, apparel, candles, supplements, yoga, cycling gear..." paragraph to your Lookalike Text does not exclude those categories — it actively pulls toward them.


Lookalike Text is matched on overall semantic meaning, not read as a ruleset. Naming categories you do not want drags the algorithm toward those categories. Discolike removed the dedicated negative-text field from their form specifically because of this — in the majority of cases it removed good matches and pulled in exactly what it was meant to exclude.


The fix: Strip any exclusion or negative language out of your ICP text entirely. Keep it purely descriptive of what your ideal company is. No "does not sell," no "not apparel," no exclusion paragraphs.


Mistake 2: Including E-Commerce as a Positive Category
E-Commerce is an extremely broad bucket. Nearly every DTC brand — apparel, candles, supplements, gym wear — falls inside it. If you have both Consumer Products and E-Commerce selected as positive categories, E-Commerce is flooding your results with non-ICP brands.


The fix: Remove E-Commerce from your positive categories. Keep only the specific category that tightly matches your ICP (e.g., Consumer Products for branded hardware). That one change alone cuts a significant amount of noise.


Mistake 3: Seeds Are Bridging Into the Wrong Categories
Your seeds are the strongest signal in the entire run — stronger than any exclusion text. If your seeds span multiple sub-verticals, each sub-vertical will pull its own adjacent wrong categories regardless of how tight your other settings are.


Examples from this case:


Amazfit + KOSPET → read as fitness/wellness/health → pulls sportswear, gym wear, cycling, hats
Govee + Eufy → read as smart home/home living → pulls home goods, candles
Exclusion text cannot undo this because the seeds override it
The fix — two actions:


1. Split sub-verticals into separate runs.
Do not blend audio, wearables, and smart home seeds into one run. Run them as three separate tighter searches. Example:


Run 1: Audio seeds only (Raycon, Soundcore, Tribit)
Run 2: Wearables seeds only (Amazfit, KOSPET)
Run 3: Smart home seeds only (Govee, Eufy)
Each run returns a cleaner list. Splitting does not cost extra — billing is net-new only, so anything that reappears across runs is not charged again within the 90-day window.


2. Verify your seed domains are correct.
In this case, oura.com is a French public transit site — not the Oura ring brand (that is ouraring.com). One wrong seed domain quietly pollutes your entire run with unrelated signal. Always confirm you have the right domain before adding a seed.


Mistake 4: Phrase Matches Are Not Actually Filtering Your Category
If your positive phrase matches are all optional (OR logic), and several of them are generic storefront terms that every DTC brand uses — "shop now," "add to cart," "free shipping," "official store" — then phrase matching is doing nothing to filter your category. Every brand including candles and apparel has those terms on their site.


The fix:


Remove all generic commerce terms from your phrase matches
Add a + in front of your electronics-specific terms to make them required (AND logic)
Example: +"wireless earbuds", +"smartwatch", +"security camera"
A company now has to actually mention the product to qualify
One side effect to watch for: With a tight category filter, Low variance, and required phrases, your result count may drop because of the variance cap. If results thin out significantly after adding required phrases, bump Industry Variance up one notch to compensate.


How to Permanently Exclude Repeat Domains
Some wrong-category domains will keep slipping through category and phrase negations because they sit inside Consumer Products or E-Commerce — not Fashion — and do not literally say "apparel" on their homepage. Neither negation catches them. The only reliable solution is a hard domain exclusion list.


How to set it up:


Collect the specific domains that keep reappearing (the 25–30 repeat offenders in your case)
Go to Queries screen in Discolike
Upload them as a domain list (Upload domain list feature) or save a query
Apply the list as an exclusion scope on the Discover form under Include or Exclude
It persists across every future run automatically
This is the correct and recommended best practice per Discolike support. Your instinct to use the Company Lists / exclusion list feature was right.


If Nothing Is Working — Start Clean
If you have made too many layered adjustments and cannot untangle what is causing the noise, re-run the ICP wizard from scratch and build from what it generates. It sets categories and exclusions sensibly as a baseline. Then layer your hard domain exclusion list on top of that clean foundation.


On Credits and Billing
Discolike bills net-new records only within a 90-day window. Repeat domains that reappear across multiple pulls are not charged again. Iterating and refining a query through multiple pulls is the expected workflow — credits are only spent on genuinely new records discovered in each run. If you are seeing the same wrong-category domains each time, they are not adding to your credit spend.


Quick Checklist Before Every Discolike Run
not done
ICP text is purely descriptive — no exclusion or negative language anywhere in it
not done
E-Commerce removed from positive categories unless specifically needed
not done
Seeds are verified correct domains (spot check each one)
not done
Seeds are from one sub-vertical only — if mixing sub-verticals, split into separate runs
not done
Generic commerce phrase terms removed — only product-specific required phrases with +
not done
Hard domain exclusion list applied for any known repeat wrong-category domains
not done
Pull 5–100 sample first, validate, confirm 80%+ before pulling full list
Persona Profile Text can help here, but the way you're using it now is title-based, and that's not quite what it matches against.


Behind the scenes, every contact in our database has a persona profile, a short description of what that person does at their company and what they're responsible for. You can click any contact's name in the results to preview theirs. Your text is compared against those profiles using similarity scoring, so the best persona text reads like a profile itself: describe what the person does, not a list of job titles. For your use case, something like "Senior leader who runs the staffing firm's recruiting business: oversees recruiters and client accounts, owns sourcing tools and processes, grows the placement desk" will land much closer than the title list. Even something as short as "c-suite executive" works, because it describes the person.


We ran both versions against TA Staffing from your screenshot to show the difference:


   * Your current title list: the top 5 came back as a Regional Development Director, two VPs of Operations, and a Territory Manager. Jeff Bates, the President / Managing Partner, didn't make the cut.
   * The descriptive version: the top 5 became the three Branch Managers (the people actually running the desks), Jeff Bates, and the VP of Operations.


One important thing: persona text only affects ranking, not who qualifies. Your filters (Seniority, Department, Exact Title Match) decide who's in the pool. Persona text decides who surfaces first when there are more matches than your per-company limit. With Results Per Company set to 5, it determines which 5 you get at larger companies. At a 10-person shop it just changes the order, since everyone comes back anyway.


So the setup we'd recommend: put hard requirements in the filters (Seniority set to Executive, VP, Director, or Exact Title Match for must-have titles), and use Persona Profile Text as a plain description of what your ideal contact does day to day.






🎥
Make an Offer Cold Outbound Ready


Goal: Turn “we do X” into an offer that gets replies from cold outboun d(email/DM) because it’s specific, tangible, and low-risk/


Promise of the document: By the end, you’ll have a simple framework to package your service/product into something people say “yes” to on cold traffic.


⚙️ Service:


We do email marketing


🎁 Offer:


Outcome + guarantee + fast start


Service vs Offer
——————————————————————————————————————————


The problem: “Service” doesn’t convert on cold
   * Cold outbound isn’t the place for “We do email marketing. Interested?”
   * In most markets you’re a commodity -> prospects compare you to 1,000 others
   * Your job is to create an offer (a packaged outcome), not just describe a capability
Quick definitions (30 seconds)
   * Service: what you do (mechanism)
   * Offer: what they get + how fast + why it’s safe (outcome + terms)
The framework (3 levers)
   1. Give free value (Service Lead Magnet)
   2. Guarantee / performance (risk reversal)
   3. Make is easy to start (fast start + low friction)
















Service Lead Magnet
——————————————————————————————————————————
Lever #1: Service Lead Magnet (free, tangible deliverable)
What it is
A free deliverable that’s directly tied to the paid outcome.
Why is works
   * Starts conversations at volume
   * Gets you “yes” faster because you’re not asking for a big commitment upfront
   * You can tolerate tire-kickers because top-of-funnel expansion wins
Our best example (Dulcy)
   * “I can build you a free lead list of X accounts in your ICP – want it?”
Rule: relevance > free stuff


   * “AirPods / gift cards” can work at enterprise AOVs, but relevance usually convert better
   * Your free thing should preview the paid result
   * Examples you can rattle off quickly
   * E-com email agency: redo the welcome flow (1-2 emails) or subject line bank
   * Paid ads agency: 10 ad angles + 5 creative concepts based on their current positioning
   * SDR/appointment setting: 25 target accounts + 2-message opener per account cluster
   * Web/dev: teardown + prioritized fixes with “impact score”


⚙️ Key: choose a deliverable that is:
   * Fast (minutes, not days)
   * Repeatable (template-able)
   * Automatable (AI/code)
   * High perceived value
——————————————————————————————————————————
Objection: “free attracts tire kickers”
(Hormozi story)


Hormozi tested this with two gym businesses.


One offered something free on the front end. The other didn’t.


The free offer business got 9X more leads and closed at the exact same rate.


9X more leads. Same close rate. 9X more revenue.


If you’re selling a saturated B2B offer (email marketing, ad creative, cold email, recruiting, ad agency) and you’re NOT offering something free on the front end


You’re making outbound 10X harder than it needs to be.


Offer a free campaign. A free service. A free month trial.


Get them in the door. Upsell later.


——————————————————————————————————————————
   * Two gyms: one gives free offer, one doesn’t
   * In every scenario the free-offer gym makes more money because it expands the top of funnel


Your framing
   * Cold outbound is a volume game
   * If you can get 100 conversations instead of 10, you win even if some are low quality














Guarantee / Performance 
——————————————————————————————————————————
Lever #2: Guarantee / performance (risk reversal)
What it is
A clear “if we don’t deliver X, you get Y” that reduces decision friction.
Why is works
   * Cold outbound prospects are skeptical and busy
   * A guarantee is a trust shortcut
Simple guarantee patterns
   * Speed guarantee: “We deliver the first asset in 48 hours or it’s free.”
   * Outcome guarantee: “If we don’t generate X qualified meetings in 30 days we work for free until we do.”
   * Milestone guarantee: “If you don’t see X by week 2, you can cancel and keep the deliverables.”
Make it differentiated (not “table stakes”)
   * “Customer satisfaction guaranteed” = meaningless (everyone says this)
   * “Dedicated CSM” - not a guarantee, and usually not what they care about
   * Your guarantee has to be tied to the thing they actually want (pipeline, revenue, time-to-value, deliverable quality)
How to keep it “safe” for you


   * Only offer the guarantee to great-fit prospects (clear ICP + qualification gates_
   * Scope it to a milestone (week 1-2), not the entire engagement
   * Use “work-for-free-until-X” or “cancel -and-keep-delierables” instead of unlimited refunds
The logic


   * 10 closed + 1 refunded beats 5 closed + 0 refunds (don’t overcomplicate it)


🧠 Important:  Guarantees don’t have to be “risk your entire business.” They can be scoped to a milestone, a timeframe, or a deliverable.


——————————————————————————————————————————
Lever #3: Fast start (make “yes” tiny)
The goal


Make the first step feel safe + reversible.
Ways to do it


   * Small paid “starter” (audit / teardown / setup sprint)
   * Clear implementation plan + timeline
   * Minimal onboarding requirements (“send X, Y, X”)
The line to say
   * "We'll do the first tangible thing before you feel locked in.”
“Digital asset” version (lighter, but still useful)
When do use this


If you can’t confidently give away a full “service lead magnet” yet, start with a high-signal asset.
What to avoid


   * Generic “audit” offers (in sophisticated markets, nobody cares)
What works better


   * A short Loom: I’ll review your [cunnel/channel] and show you the 2-3 biggest leaks + what I’d do first”
   * A teardown with a clear before/after and a prioritized action list


How to position it


   * Make it specific (“2-3 fixes”) and fast (“10-minute Loom”), not vague (“full audit”)


Offer Packaging Checklist (screenshare moment)
   * ICP: who this is for (and who it’s NOT for)
   * Outcome: what changes for them
   * Deliverables: what they get (tangible)
   * Time to value: how fast they see something
   * Risk reversal: guarantee / performance / cancel terms
   * Proof: 1-2 tight proof points (numbers or examples)
   * CTA: one simple next step (reply “yes” / send a link / ask 2 questions)


Demand gen vs demand capture (why this matters)
   * Demand capture: Google/SEO/review sites -> they already want a solution, you’re being compared
   * Demand gen: cold email / cold ads -> you must create awareness + desire from scratch
   * That’s why “service pitches” fail on cold: you haven’t earned trust yet -> you need an offer with friction removed.


SOP: Launching Outbound Campaigns with Claude Code
Source: Nick Abraham (Leadbird.io) — hundreds of clients, agency-scale outbound


Critical Framing First
Claude Code is not magic. It is an orchestrator — an agent that executes work you do not want to do manually. It does not fix bad fundamentals:


Bad offer → still no results
No product-market fit → still no results
Bad deliverability / weak infrastructure → still no results
Claude Code adds value by accelerating the speed of execution once the fundamentals are already solid. For an agency that has processes, delegation, and automation dialed in — Claude Code lets you accomplish the same work at a significantly faster pace. That is the only claim being made here.


Where Claude Code Actually Adds Value in Outbound
Speed of campaign launch. The old agency bottleneck: one client at a time, manually building offers, copy, and lists. Claude Code collapses that into a streamlined orchestration where account managers can work through campaigns rapidly — reviewing suggestions, approving, iterating — and knock out far more campaigns in the same time.


Evaluating campaign fundamentals. Build a skill that gives Claude a checklist of what a good campaign looks like. When it evaluates a campaign, it checks against every item on that list rather than eyeballing it. This catches misses a human would skip when working fast.


The Skill Architecture
Build individual skills for each discrete part of the campaign creation process. Do not try to do everything in one prompt. Nick's agency built:


1. Cold Offer Design Skill


Takes: service description, target ICP, angle ideas, specific constraints
Outputs: 3 offer options with a recommendation
Important: AI is still not perfect at suggesting offers because it does not know everything specific to your business or market. A human must review the output, evaluate which option is actually viable, and approve. Give it detailed inputs — the better the input, the better the offer options it surfaces.
2. Cold Email Copywriting Skill


Takes: the chosen offer, ICP, angle, any specific constraints (e.g., "SDRs are from Latam at $8/hr — that is a core value prop")
Outputs: a 2-step email sequence (Email 1 and Email 2)
After output: Claude asks if you want adjustments. You review and either approve or give specific feedback. Example: "The CTA should be 'Can I send you a few resumes to look at?' not what you wrote." Claude iterates.
3. Campaign Orchestrator Skill


The master skill that calls all other skills in sequence
Takes all inputs at once, runs through offer → copy → list building in order
Single campaign version: runs one campaign end-to-end
Bulk campaign version: upload a CSV with multiple campaigns (company name, offer, angle, ICP description, ICP website) and it processes all of them sequentially. Account managers sit in Claude, review suggestions as they pop out, approve or adjust each one, and knock out a high volume of campaigns in one session.
4. Discolike Account List Skill


Connected to Disco MCP
Pulls accounts based on seed domain + ICP description
Runs in batches (critical — see below)
Evaluates accuracy of first batch before pulling full list
5. Google Sheets Upload Skill (Custom — requires your own server)


Google Drive's MCP connection into Claude does not allow creating or editing Google Sheets natively
Nick's agency spun up their own server and built a custom endpoint to upload CSVs into Google Sheets
If you do not need this in your workflow, just download the CSV directly — that works fine
The Campaign Orchestration Flow (Step by Step)
Inputs required to kick off orchestration:


Company name
Service description (be as detailed as possible — vague service descriptions produce generic output)
Offer idea / angle (your best thinking on what the offer should be — Claude refines from here, it does not invent from nothing)
Target ICP description (detailed — include what the company does, what their website says, what signals identify them)
One ICP-matching website URL (seed domain for Discolike — must be a pure example of the segment, not a general contractor that also does roofing)
Step 1 — Offer generation
Claude takes the service description, offer idea, and angle. Outputs 3 offer options with a recommendation. You review and choose. If your input is strong, the options will be strong. If your input is generic, the options will be generic. This step requires human judgment — pick the option that is actually viable for your client's business.


Step 2 — Copy generation
Claude takes the chosen offer and writes a 2-step email sequence. You review. Give specific, detailed feedback on what to change — do not just say "make it better." Example feedback: "These SDRs are from Latam so they cost $8/hour — that is the core value prop, put it in. Change the CTA to 'Can I send you a few resumes to look at?' Remove the 'you don't pay unless they show' line — client can't offer that." Claude iterates and outputs the revised sequence.


Step 3 — List building via Disco


Claude sends the ICP website URL + ICP description to the Discolike skill
Pull 5 companies first — do not pull the full list immediately
Claude evaluates the 5 companies against the ICP description and checks accuracy
If accuracy is below 60%: Claude suggests adjustments — negative keywords to add, additional seed websites to include, filter changes. You approve the suggestions. Claude refines and re-queries.
If accuracy is acceptable: approve and pull the full 100-record batch
Important: pull in batches — this costs more per record on Disco's pricing model but prevents burning credits on a bad pull that was going to return garbage results anyway
After full pull: Claude reports accuracy percentage ("this pull is 60% accurate" / "99% accurate"). If acceptable, you approve running the remainder of the full list.
Step 4 — Output to Google Sheets → Airtable


CSV pushed to Google Sheets via custom endpoint
From Google Sheets, pushed to Airtable
Sent to client for campaign review before final processing
After client approval: run enrichments, email validation, final QA, push to Smartlead via MCP
Contact Finding — Leave Manual For Now
Nick's agency has an internal contact database with an MCP for pulling people from the account list. They are building a bulk orchestrator for this.


Honest assessment: He has tested many MCP contact databases and the results are inconsistent — sometimes good, sometimes not, depending on the inputs. His recommendation: leave contact finding manual for now. Everything else in this workflow is worth automating with Claude skills. Contact finding is not reliable enough yet to fully automate.


The Input Quality Rule
This is the single most important variable in the entire system. If your inputs are vague, your outputs will be generic regardless of how good your skills are built.


Things that must be detailed:


Service description: What exactly does the company do, who do they serve, what is their model, what makes them different
ICP description: What does the ideal company look like, what does their website say, what signals identify them, what are they NOT (include anti-ICP signals)
Offer/angle: Your best specific thinking on what the hook should be — Claude refines this, it does not invent from nothing
ICP seed website: Must be a pure, single-segment example. A general contractor who also does roofing will pollute the account list with general contractors. Find a company that only does roofing, whose entire site is roofing-specific language.
You will figure out through iteration what input style gets better vs. worse outputs. Pay attention to that pattern and document it.


The Performance Benchmarking Loop (Where This Is Going)
Nick's vision for how this evolves at the agency level:


Benchmark every campaign against what it is generating that month
If a campaign is performing 30–40% worse than benchmark → flag it
Feed it into the offer skill → generate new campaign ideas based on real-time data
Client approves the new campaign
Process the new campaign, pause the underperformer
Continuous optimization loop running across all clients with minimal manual lift
What Requires a Human in the Loop (Non-Negotiable)
Choosing the offer: Claude gives you options, you decide which one is actually viable for the specific client and market
Reviewing copy: You must know enough about cold email to catch what is wrong. Claude cannot tell you if the CTA is weak or if the value prop is missing a key angle — you have to know that yourself
Approving list accuracy: You review the 5-company sample and decide if the accuracy is acceptable before pulling the full list
QA of the final output: Check the Google Sheet before it goes anywhere. Do not take AI output at face value.
If you have never had success with cold email before and do not understand what good copy and a good offer look like — Claude Code will not fix that. You still need the expertise to evaluate and guide the output.
7 principles of cold email that you must follow
these seven principles are behind every single cold email campaign i've ever run. 1,800+ calls booked...
1. niche down until the offer feels obvious
most people try to sell to everyone and end up resonating with nobody.
if you're an seo agency messaging "business owners who want more traffic" you're competing with 10,000 other agencies saying the exact same thing in the same inbox
niche down until your offer is so SPECIFIC that the prospect reads it and thinks "this lad is talking directly to me."
you need the 1% of your market who have the problem right now and have the budget to fix it.
if you can't describe your ideal client in one sentence with specifics (industry, company size, role, pain point), your targeting is too broad and your reply rates will reflect it
2. volume is always the answer
this is the one that people push back on the most and i genuinely don't care.
i've booked 1,800+ sales calls and every single spike in results came from increasing volume.
every single dip came from decreasing it
200 emails a day is a hobby.
you'll book maybe 1-2 calls per week and spend the rest of your time wondering what's wrong with your copy.
1,000 a day is where things start to feel consistent and 5,000+ a day is where cold email becomes a MACHINE that books calls on autopilot
the math is brutally simple.
at a 0.1% booking rate, 1,000 emails gives you 1 call. 5,000 gives you 5. 10,000 gives you 10
the booking rate stays roughly the same across every niche i've tested.
the only variable you actually control is how many emails you send so send more lmfao
you need infrastructure to support this though.
300-800 inboxes on full admin google workspace accounts. 60-80 domains. each inbox sending about 15 emails a day so no individual inbox gets burned.
the volume comes from having hundreds of inboxes running SIMULTANEOUSLY.
i personally run 665 inboxes sending 10k emails a day. setting this up takes about 10 minutes once you know what you're doing
3. make the offer stupidly clear
vague offers die everythime
"we help businesses grow" is invisible in an inbox because it means NOTHING to anyone.
if a prospect can't understand what you're offering and why they should care in 5 seconds flat, you've lost them
the email template is four lines.
hey [name]. opener. irresistible offer. cta
that's the whole thing. the offer is the part that matters most. without something genuinely compelling the entire campaign ghosts.
make it hard to say no to.
"hey james, just checked and noticed you don't have a website, would you like one for free? want to show you what i got" books calls because saying yes costs the prospect absolutely nothing
just write like a real person with a real reason to reach out.
lowercase subject lines work better.
"hey {{firstname}}" and "something for {{firstname}}" CONSISTENTLY outperform anything that sounds like it came from a marketing department
4. follow up like you have a screw loose
i run 3-5 follow ups MINIMUM on every campaign and each one reframes the offer slightly or adds a piece of value
most people send one email, get no reply, and move on. that's mental.
the prospect probably didn't see your first email. or they saw it and meant to reply but got busy. or they need to see your name a few more times before they trust it enough to respond.
the follow ups catch all of those people
i follow up aggressively enough that some people probably think i'm insane.
but those same people aren't booking 300 calls a month.
i'd rather be persistent and booked than polite and broke
5. warm call every positive reply
this one principle doubled our call booking rate practically overnight.
before we added warm calling, positive replies would sit in the inbox.
we'd send a reply, the prospect would respond a few hours later, we'd go back and forth over dm trying to find a time, and half the momentum would DIE in the scheduling process
now every positive reply gets a phone call within minutes.
"hey bro, saw you replied to my email, just wanted to quickly chat about what we can do for you."
the prospect is already interested because they replied positively
the phone call converts that interest into a booked meeting right there on the spot before the momentum fades.
the speed matters massively here.
calling within 5 minutes of a positive reply catches the prospect while they're still thinking about your email.
calling the next day catches them when they've already forgotten who you are.
the difference in booking rate between those two windows is ENORMOUS
6. track everything and let the data tell you what to fix
most people guess at what's wrong with their campaign.
"i think my copy isn't good enough" or "i think my targeting is off" or "maybe i need a better subject line."
guessing is a WASTE OF TIME when the data tells you exactly what's broken
open rates tell you about targeting.
if people aren't opening your emails, the subject line or the sender profile isn't resonating with the audience you chose.
so fix the targeting or the subject line
reply rates tell you about messaging.
if people open but don't reply, the copy or the offer isn't compelling enough to make them type a response.
so fix the message or the offer
positive reply rates tell you about offer market fit.
if people reply but the replies are mostly negative ("not interested," "stop emailing me"), the offer doesn't match what the audience actually needs. fix the offer or narrow the audience
every metric points to a specific part of the system.
stop guessing at which part is broken and let the numbers SHOW YOU
7. scale what works and kill what doesn't
when a campaign hits, clone it with same copy, same targeting, same offer, and more volume.
the campaigns that produce results in the first week will keep producing results at 2x and 5x the volume.
the ones that don't produce results in the first week won't magically start working if you send more. kill them and move tf on
i've tested hundreds of campaigns and the pattern is always the same.
campaigns either show signal in the first 1,000-2,000 sends or they don't show signal at all.
waiting 30 days to "let the data come in" on a campaign that produced zero positive replies in the first week is wasting time and inboxes that could be running a campaign that actually works
when you find the combination of niche, offer, and copy that books calls, pour everything into scaling it.
more inboxes, more domains, more volume on that exact campaign.
let repetition do the heavy lifting. the boring part is the part that prints
these seven principles have been behind every campaign i've run.
- 91 calls for an accounting firm in 60 days
- $8k closed in 24 hours for a marketing agency
- $128k pipeline for a landscaping company in 30 days
- $36k in contracted revenue for an ai agency
all different niches and different offers but the same seven principles every single time


Building an Offer That Stands Out
A Dulcy guide for clients on positioning your service as an offer that gets replies
Here's the problem every business runs into the moment they try cold outreach: "We do email marketing" or "We're an accounting firm" or "We run paid ads for contractors" doesn't get a reply. It's not that the message is bad — it's that you're describing a service, and a service is a commodity. The moment a prospect reads it, they mentally file you next to the other 1,000 people who say the exact same thing.
The fix isn't better copywriting. It's turning what you do into an offer — something specific enough, safe enough, and valuable enough that the right person feels like saying no would be a mistake.
This guide walks through how to build that offer, using the same principles behind seven and eight-figure cold outreach campaigns across dozens of industries.


Part 1 — Service vs. Offer
Service: what you do (the mechanism)
Offer: what they get, how fast, and why it's safe
Nobody buys a mechanism. They buy an outcome. Your job in cold outreach is never to explain how good you are at the thing you do — it's to package that thing into a result someone wants badly enough to take a small risk on.
"We do email marketing" describes a service. "We'll build you 9 automated email flows for a one-time fee — no retainer" describes an offer. Same skillset. Completely different reply rate.


Part 2 — The 3S Formula
Every offer that works on cold traffic solves:
1. A specific problem
2. For a specific person
3. In a specific way
This is the foundation everything else in this guide sits on top of. Get this wrong and no amount of clever copy, guarantees, or free offers will save it.
Why specificity wins
   * Cold traffic doesn't know you yet — vague offers give them nothing to grab onto. The more specific the problem and the person, the easier it is for the right prospect to think "that's me" in the first sentence.
   * Specialists charge more. A neurosurgeon doesn't compete on price with a family doctor — they solve one thing better than anyone else.
   * Specificity makes fulfillment repeatable. If you solve the same problem for the same type of person the same way every time, your delivery becomes a system instead of a custom project every time.
   * A tightly defined lead offer doesn't mean narrowing your whole business. Full-service agencies can use a specific offer purely to get the first conversation started, then expand the relationship once trust is built.
Examples of the 3S Formula in practice
"We help DTC ecommerce brands over $1M/year acquire customers at breakeven through TikTok ads." Specific Problem: customer acquisition. Specific Person: DTC brands over $1M/year. Specific Way: TikTok ads.
"We help women over 40 lose weight by optimizing their hormone profiles." Specific Problem: weight loss. Specific Person: women over 40. Specific Way: hormone optimization.
"We help general contractors stop losing jobs to competitors with weaker work by fixing how they look online before a homeowner ever calls." Specific Problem: losing winnable jobs. Specific Person: general contractors. Specific Way: positioning and online presence.
Note: you don't always need a fully unique mechanism (the "specific way"). If your social proof and results are strong enough, a direct offer without a flashy named method can still work — especially early on. The mechanism becomes more important once a market gets crowded or jaded and everyone's offer starts sounding the same.


Part 3 — Where Desire Actually Comes From
You cannot manufacture desire out of thin air. You can only find existing desire and either put your offer directly in front of it, or use copy to channel it toward your specific solution.
Desire shows up in two forms — and most outreach only ever speaks to one of them:
Pain — moving someone from sub-par to par
Example: a roofing company isn't getting any inbound calls. The pain is invisibility. The fix is becoming visible.
Unfulfilled desire — moving someone from par to excellence
Example: a roofing company already gets calls, but wants to stop competing on price and become the only company a homeowner considers.
Both are valid angles for the same offer. A contractor stuck at zero leads and a contractor doing fine but plateaued are both real audiences — they just need a different opening line.
Surface level vs. emotional level
Every pain point has two layers. The surface layer is the literal problem. The emotional layer is the feeling underneath it. Speaking to both is what makes copy land.
"I need leads" — Surface: no leads to leads. Emotional: uncertainty to certainty, or lack of significance to being a respected provider for their family.
"I want more business clients, not just one-time filers" — Surface: inconsistent clients to predictable clients. Emotional: feeling like a commodity to feeling like a trusted authority.


Part 4 — Ten Ways to Make Your Offer Impossible to Ignore
Once you know your 3S formula and which desire you're speaking to, these are the levers that turn a flat offer into one that actually converts on cold outreach.
1. Make it math, not hope
"You'll probably save money" is weak — it's a maybe. "You're already going to spend $20K on this. We get you out for $10K today" is a fact. Frame your value against a cost they can't avoid, not a hopeful upside.
A timeshare-exit law firm built an entire $10–15M/month business on this exact mechanic — paying $10K now to avoid $20K already owed isn't a sales pitch, it's arithmetic.
2. Let the problem do the qualifying
The sharpest offers filter out unqualified people automatically, just by the nature of the problem they solve. Someone stressed about a tax bill already has income. Someone trying to exit a contract already had money to get into one.
A tax strategy and advisory firm only attracts clients who already make enough money to have a real tax bill — the qualification happens before the first call.
3. Say what makes you hard to copy
If anyone with a laptop could replicate your offer this weekend, you're exposed to a flood of copycats that drags down results for everyone — including you. One sentence about your edge does real work here.
A medical device company couldn't be replicated overnight because of the manufacturing relationships, capital, and regulation required — that barrier is part of why they could scale to $4M/month without getting drowned out.
4. Don't underprice out of fear
Across nearly every industry, the businesses doing the most revenue in their category also charge the most — not the least. Higher prices tend to mean better-fit clients, higher margins, and lower churn.
In health coaching, agencies, and financial services alike, the category leader is almost always the most expensive option in the room, not the cheapest.
5. Ask for a small step, not a leap of faith
The size of the commitment matters more than the price tag. "Add 2 reps to the team you already have 4 on" is an easy yes. "Let us build your entire sales process from zero" is a hard ask regardless of price.
Frame your offer as the next logical step for someone already in motion — not a total rebuild.
6. Remove the hassle, not just deliver the result
People pay significantly more to have a burden taken off their plate entirely, not just to receive the end product.
A content agency that physically shows up, films, and edits everything charges $5,000–$7,500/month. A nearly identical service where the client has to film themselves only commands about $3,000 — same deliverable, different experience.
7. Find a less crowded market for the same idea
Many winning offers aren't new ideas — they're proven ideas moved into a market that hasn't seen them yet, especially markets with real budget and zero interest in DIY-ing the solution themselves.
A content agency built for coaches charged roughly $10K/month. The identical offer sold to financial advisors and insurance teams jumped to $36K+ — same service, a market with more money and less marketing savvy.
8. A guarantee's job is to get the reply, not close the deal
A guarantee mainly works by lowering the risk of responding in the first place. Most people forget it exists once they're a customer — its entire job is getting the conversation started. State it clearly, scope it to a milestone (not the whole engagement), and use it in your call-to-action, not buried in a paragraph of proof.
"We'll deliver the first asset in 48 hours or it's free" gets a reply. "100% customer satisfaction guaranteed" gets ignored — everyone says it, and it means nothing.
9. Be specific about the pain, even if it's uncomfortable
Vague pain points are safe and forgettable. Sharp, specific pain points only the right person recognizes get the reply — and filter out everyone else before they waste your time on a call.
A high-net-worth health coaching offer used the line "your Rolex doesn't look great hanging over your gut." Most people would never reply to that — which is exactly why it worked. It only spoke to the exact person it was built for.
10. Show breadth of proof, not just one deep story
A long, detailed case study isn't always more convincing than a simple list of recognizable names or results. Breadth often beats depth in cold outreach.
One operator tripled their reply rate — from 1% to 3% — just by changing their P.S. line from one detailed case study to a quick bulleted list of about 30 recognizable client names.


Part 5 — The Three Levers for Cold Outbound Specifically
Beyond positioning the offer itself, three additional levers make an offer far easier to say yes to the moment it lands in someone's inbox or DMs.
Lever 1 — Give away something free that previews the paid result
A free, fast, tangible deliverable directly tied to your paid outcome starts far more conversations than asking for a big commitment up front.
Alex Hormozi tested this on two nearly identical gyms — one offered something free on the front end, one didn't. The free-offer gym got 9x more leads and closed at the exact same rate as the other. 9x the leads, same close rate, 9x the revenue.
The rule: relevance beats "free stuff." Your free thing should preview the paid result, not just be a generic gift.
   * Email marketing agency → redo their welcome flow or build a subject line bank
   * Paid ads agency → 10 ad angles + 5 creative concepts based on their current positioning
   * Appointment setting → 25 target accounts + a custom opener for each
   * Web/dev agency → a teardown of their site with a prioritized impact score on each fix
A good free deliverable is fast (minutes, not days), repeatable, automatable, and feels like something they'd genuinely pay for.
Lever 2 — Add a guarantee that removes their risk, not yours
Cold prospects are skeptical and busy. A guarantee is a trust shortcut that gets them to respond faster.
   * Speed guarantee: "We deliver the first asset in 48 hours or it's free."
   * Outcome guarantee: "If we don't generate X qualified meetings in 30 days, we work for free until we do."
   * Milestone guarantee: "If you don't see X by week 2, you can cancel and keep everything we built."
Keep it safe for your business: only offer it to prospects who genuinely fit your ICP, scope it to an early milestone rather than the whole engagement, and use "work for free until it's right" instead of an open-ended refund.
Lever 3 — Make saying yes feel tiny
The first step should feel safe and reversible, not like a big commitment.
   * A small paid starter (an audit, a teardown, a setup sprint)
   * A clear plan and timeline so they know exactly what happens next
   * Minimal onboarding — "just send us X, Y, Z and we're off"
If you're not ready to give away a full deliverable yet, use a lighter, high-signal asset instead. Avoid generic "we'll audit your funnel" offers — in any market that's seen a few agencies before, nobody cares about a vague audit anymore.
"I'll review your funnel and show you the 2-3 biggest leaks, plus what I'd fix first" — specific and fast beats vague and broad every time.


Part 6 — Proven Offer Patterns by Audience Type
Before building something brand new, check whether a version of your offer is already working somewhere. Cold traffic almost never rewards being first — it rewards being a better, more specific version of something already proven.
If you sell to other businesses (B2B)
   * Marketing/lead generation for contractors, ecommerce brands, or local service businesses
   * Done-for-you email marketing or creative production
   * Recruiting for a specific role or industry
   * Tax strategy, fractional CFO, or advisory services
   * Content creation, primarily for ecommerce brands
If you sell to solo operators (B2Solopreneur)
   * Lead generation for real estate agents or insurance agents
   * Coaching for a specific skill within their existing role
   * Done-for-you systems for people who run their business alone
Common mistakes to avoid
   * Targeting too narrow an audience — aim for a total addressable market of at least 40,000–50,000 people unless you're selling to enterprise
   * Trying to run an info/coaching style offer to a B2B audience without a large existing following — it can work, but it's far harder and less profitable than a clear done-for-you offer
   * Solving more than one problem in a single piece of outreach — even if your full service solves 50 things, your offer should name one


Part 7 — Build Your Offer: Fill This In
Use this as a working draft. You don't need a perfect answer for every line on the first try — clarity comes from writing it down and testing it, not from getting it perfect before you start.
Specific Problem
What exact problem do you solve? (Not "marketing" — something like "inconsistent lead flow" or "losing winnable jobs to weaker competitors.")
	

Specific Person
Who exactly has this problem? Industry, size, revenue range, role.
	

Specific Way
How do you solve it differently than the obvious alternative? (Optional if your proof is strong — but think it through.)
	

The Math
What cost, loss, or expense is this person already locked into? How does your offer make the cheaper path obvious?
	

The Free Preview
What fast, specific, tangible thing could you give away that previews your paid result?
	

The Guarantee
What's a guarantee scoped to an early milestone — not your entire engagement — that lowers the risk of someone replying?
	

The Hassle You Remove
What burden does the client no longer have to deal with once they say yes? Be specific about the hassle, not just the deliverable.
	

Proof
List 1–2 tight, specific results, or a short list of recognizable names/clients — breadth over one long story.
	

Final Checklist Before You Launch
   * Is the value framed as an obvious math fact, not a hopeful outcome?
   * Does this pain point only apply to people who can actually afford to fix it?
   * Have I named what makes this hard for someone else to copy?
   * Am I pricing with confidence, or underpricing out of fear?
   * Is this offer a small next step, or am I asking for too big a leap?
   * Have I described the hassle I'm removing, not just what I'm delivering?
   * Is there a less saturated market where this same offer would feel brand new?
   * Is my pain point specific enough that the right person feels personally called out?
   * Is my proof section scannable and broad, rather than one long story?
   * Does my offer solve ONE specific problem for ONE specific person in my outreach — even if my full service does more?


Questions on any of this? Bring your draft to your next call and we'll work through it together.


  
  
  
  
  
  
  

SOP: Positioning Offers for Cold Outreach
Synthesized from Daniel Fazio (List/Client Ascension) and Charlie Morgan conversation
Core Principle
The strength of your offer determines outcome more than copy, channel, or creative. A weak offer with great copy still fails. A strong offer with mediocre copy still converts. Position the offer before writing a single line of outreach.
________________


1. Match Channel to Offer Complexity
Cold email works best for low-complexity, done-for-you, cheap-to-test offers. It's high volume, low cost per send, but caps out on revenue ceiling — it rarely builds an 8-figure business on its own.
Cold calling works for higher-trust, higher-ticket offers. Far more meetings booked per outreach unit than email, which justifies a much higher price point. The barrier to entry (logistics of hiring/managing callers) keeps supply low, which keeps results high.
Ads/brand/content scale best for offers that already convert on cold outbound. Rule of thumb: if it works on cold email, it'll work on ads. If it works on ads, it is not guaranteed to work on cold email. Test on the harder channel first.
Rule: Identify your offer's trust requirement and price point first, then pick the channel that matches — don't force an offer into a channel it wasn't built for.
________________


2. The "$20 Bill for $1" Mechanic
The strongest offers create automatic, undeniable savings or gains — not a promise, a math fact.
   * Time-share exit law firm: "Pay us $10K now to avoid $20K you're already locked into spending." Not a projection — a sunk-cost certainty.
   * Software with proven lift: "Your pickup rate goes from 9% to 20% — that's found money."
Application to cold outreach copy: Lead with the inevitable math, not a hopeful outcome. "You're already going to spend X — here's how to spend less" outperforms "you could potentially make more."
________________


3. Built-In Qualification via the Problem Itself
The best offers self-select for buyers who can pay, by the nature of the problem solved.
   * You can't worry about a time-share if you never bought one.
   * You can't worry about a tax bill if you don't have income to be taxed on.
Application: When choosing what pain point to lead with in outreach, pick the one that only a financially qualified prospect would have. This is also why paid acquisition (Meta/Google) tends to find the cheapest lead in any pool — qualifying language in your copy is what raises the floor.
________________


4. Barrier to Entry = Moat
Offers that take real time, licensing, capital, or expertise to enter are structurally protected from low-effort copycats flooding the channel and degrading results for everyone (this is what happened to cold email broadly over the last 3-4 years as tooling got cheap).
Application: When positioning your own offer, name the thing that makes you hard to replicate — certification, proprietary process, manufacturing relationship, exclusive data — even briefly. It's a trust signal that doubles as a moat explanation.
________________


5. Price Point Is a Strategic Lever, Not Just a Number
Across every category mentioned (health coaching, agencies, financial services), the highest-grossing operators in each niche were also the highest-priced. Higher price → better clients → higher margin → more reinvestment into sales/fulfillment → compounding flywheel.
Application: Don't default to "accessible" pricing to make the cold outreach offer feel easier to say yes to. A premium price with a strong $20-bill-for-$1 mechanic often converts better than a cheap one, because it also pre-qualifies and reduces churn.
________________


6. Reduce the Buyer's Leap, Not Just the Price
The size of the behavioral leap you're asking for matters more than the price tag.
   * "I'll give you 2 more reps for your existing team of 4" = small leap, high conversion.
   * "I'll get you your first client ever" = enormous leap (mindset, offer-building, lead gen, sales, fulfillment all at once) = hard to sell and hard to deliver, regardless of price.
Application: Frame your cold outreach offer as an incremental next step for someone already in motion, not a transformation from zero. "Help me improve what's working" beats "let me build this for you from scratch" almost every time.
________________


7. Transfer Logistical Intensity, Not Just Deliverables
Offers that physically/operationally remove a burden the buyer doesn't want to deal with — not just produce an asset — command premium pricing and lower churn.
   * A content agency that shows up in person with cameras can charge more than one that asks the client to film themselves, even though the editing is the same.
   * Done-for-you cold calling beats cold email partly because nobody wants the logistics of building a calling team.
Application: In your outreach copy, name the specific operational pain you're removing ("you don't have to film anything, talk to a single vendor, or manage a single rep") rather than just naming the deliverable.
________________


8. Find the Adjacent Market With More Money and Less Marketing Savvy
A recurring pattern: take an offer proven in a marketing-savvy niche (coaches, agencies) and move it into an adjacent niche with real money, real urgency, and little interest in DIY marketing.
   * UGC/content agencies: coaches → home services
   * Call-funnel sales infrastructure: coaching → medical devices
   * Content/video production: course creators → financial advisors/insurance teams ($10K budget → $36K+ budget, same effort to sell)
Application: Before writing outreach copy, ask: is there a less crowded, higher-budget adjacent market for this exact mechanism? The same offer, repositioned to a new vertical, often outperforms further optimization in the original one.
________________


9. Differentiate via Distribution, Not Just Positioning
You don't only differentiate through messaging — you can differentiate by where/how you sell. Applying a channel that's standard in your industry but unused in a target industry is itself a competitive edge (e.g., bringing call-funnel sales tactics into med device sales when competitors only use field reps).
Application: Identify what acquisition method is "boring and standard" in your world but absent in your target market. That gap is often more valuable than a clever new headline.
________________


10. Switching Costs Compound Stickiness
The more interconnected and complex the service becomes (tax + legal + insurance + investment in one relationship), the harder it is to leave — even for unrelated reasons. This drives near-zero churn at scale.
Application: When possible, position your offer as the hub a prospect will build other things around, not a standalone point solution. This is a long-term positioning choice, but worth flagging early in outreach sequencing (step 2/3 emails) as a reason "once it's working, it just keeps working."
________________


11. Guarantees Get Replies, Not Necessarily Sales
A guarantee's primary function in outreach is to lower the barrier to taking the call, not to close the sale itself. Most people forget the guarantee exists once they're a customer, and refund rates don't spike meaningfully. But you should still state the terms clearly up front for ethical and retention reasons (so they don't see an old ad later and assume "I can cancel anytime").
Application: A guarantee belongs in the CTA layer of cold outreach ("guaranteed 5 meetings or you don't pay") — not buried in the proof section. Its job is reply generation.
________________


12. Specificity of Pain Beats General Categories
The strongest hooks call out a precise, often unflattering, situational truth specific to the audience segment — not a generic pain category.
   * "Your Rolex doesn't look good hanging over your gut" (high-net-worth health coaching) — only resonates with people actually in that situation, which is the point.
Application: Resist the urge to write a pain point broad enough to apply to "everyone in the industry." A sharper, narrower, slightly uncomfortable truth that only your real ICP recognizes will outperform a comfortable generality — and self-filters out poor-fit replies before the call.
________________


13. Social Proof Stacking Beats Single Case Studies
A "wall of logos/names" (even just bullet-pointed) outperforms one detailed case study in cold email. One operator's response rate went from 1% to 3% by switching to "P.S. — here's a list of [30 recognizable client names]" instead of one in-depth story.
Application: In the proof section, default to breadth (a list of recognizable names/results) over depth (one long narrative), unless the single story includes a stat too specific to ignore.
________________


Quick Reference Checklist Before Writing Outreach Copy
   *  Does the channel match the offer's price point and trust requirement?
   *  Can I frame the value as a "$20 bill for $1" math fact rather than a hopeful projection?
   *  Does the pain point I'm leading with only apply to people who can actually pay?
   *  Have I named (briefly) what makes this hard for someone else to copy?
   *  Is my price point signaling quality, or am I underpricing out of fear of rejection?
   *  Am I asking for an incremental next step, or an unreasonable leap from zero?
   *  Am I naming the specific operational burden I'm removing — not just the deliverable?
   *  Is there a less saturated, higher-budget adjacent market for this same mechanism?
   *  Is my pain point specific enough that only the real ICP feels it — or is it generic enough to bore everyone?
   *  Is my proof a wall of recognizable names, or one isolated story?


How to pull a lead list in 2026:


1. Map your entire TAM
2. Pull all employees at every company (GetLeads)
3. Validate each company against your ICP using Discolike
4. Filter at the company level, not the person level
5. Segment validated companies by subtype
6. Segment employees by title within each subtype
7. Build a matrix of subtype x title
8. Write copy for every intersection
10. Match the angle to how your product impacts that specific role at that specific company type


After sending 150M cold emails for 1,000+ total clients (currently sending 2M/mo for 300), there are 5 variables I just stopped caring about that I think people obsess over:


[1] Clever copy.


If the offer is strong and the person receiving it actually wants the outcome, the copy can be pretty average and still work.


Think about offers as simple as:


> "We'll send you 3 qualified candidates for the role you're hiring for."


> "We'll write you a few posts for free and you can decide if you like it"


> "We'll build the first version for free and you can decide if you want to keep going."


You really don't need to get that clever.


If the offer is weak, swapping a subject line or rewriting 3 words probably isn't saving it.


The biggest gains usually come from changing who you're targeting, what you're offering them or how the offer is framed.


[2] Tiny copy A/B tests.


A lot of outbound teams will test two emails and call one the winner because it got a 50% or 100% lift.


Then you look at the numbers:


> Variant A: 2 positive replies
> Variant B: 1 positive reply


Technically a 100% lift.


It tells you basically nothing about what happens if I send another 100,000 emails.


I've NEVER seen tiny syntax changes consistently reproduce at our scale.


When a test really moves, there's usually a bigger difference between the two versions (different angle, offer, proof, audience, etc).


[3] Huge case study numbers.


Say I have these two:


> We helped Leadbird grow to $6M/year.
> We helped Cleverly grow to $50M/year.


Outside lead gen, both names probably mean zero to an average prospect.


The extra $44M doesn't suddenly make the second line amazing.


Now say:


"We helped Apple with its rebrand."


No number at all, but everyone knows Apple, so the proof is much more effective.


[4] Branded domains.


Our old setup for a new client could look like:


> ~14 days warming domains
> ~14 more days ramping volume
> 30-day contract


So you could burn basically the entire first month just getting to full sending volume.


Today we keep pools of non-branded domains warming before the client signs.


Client comes on -> we pull the relevant domains -> create inboxes under their sender names and put them into the campaign.


This takes us from onboarding -> live in under 72 hours.


[5] The sender name.


Once the domain is warmed and healthy, we've been able to spin up new inbox names and put them into campaigns almost immediately without seeing a meaningful change in results.


I used to think the identity attached to the inbox mattered a lot more, but at this volume, I just haven't seen enough evidence that it does.
SOP — Building a Cold-Ready Offer
Purpose
Create an offer that a cold stranger with no prior trust or intent can understand, believe, and act on.
The core distinction from the source is:
   * A service description says what you do.
   * An offer tells a specific person what outcome you can create for them and why they should believe you.
   * A standard value-equation offer mostly captures existing demand.
   * A cold-ready intro offer is designed to create demand from someone who may not even realize they have the problem yet. Pasted text
________________


Trigger
Use this SOP when:
   * creating a new cold outbound campaign
   * rewriting an existing offer
   * an offer sounds generic or interchangeable
   * prospects understand the service but are not responding
   * the campaign relies on a large promise with weak credibility
   * creating a lead magnet or intro offer before pitching the full service
________________


Owner
Primary: Offer / Campaign Strategist
Supporting: Campaign Operator, Copywriter, Lead List Builder
________________


Prerequisites
Before writing the offer, define:
   * exact ICP
   * specific role/persona
   * their desired business outcome
   * their current pain/problem
   * language they actually use
   * proof or experience relevant to them
   * mechanism that explains how the result is possible
   * specific piece of the full service that can be delivered as an intro offer
________________


Step 1 — Stop Describing the Service
Do not begin with descriptions like:
   * “We run cold email.”
   * “We build web scrapers.”
   * “We do LinkedIn content.”
Those describe the work, not the value.
Instead, convert the service into:
We will create [specific outcome] for [specific person] in [specific timeframe], without [major friction], with [risk reversal].
Example from the source:
“Our setters will book you 5–10 appointments per month in the next 28 days, or you don’t pay.”
This is only the starting point. Generic outcome-based offers can still become commoditized if anyone can make the same promise. Pasted text
________________


Step 2 — Apply the Value Equation
Build the offer around four components.
Increase:
1. Dream Outcome
What do they actually want?
2. Perceived Likelihood of Achievement
Why should they believe you can do it?
Decrease:
3. Time Delay
How quickly can they get the result?
4. Effort / Sacrifice
How much work, inconvenience, or risk is required from them?
Do not maximize only the dream outcome.
A bigger promise can actually lower trust.
Example:
“We’ll 10X your revenue.”
For a stranger, this may sound less believable rather than more valuable.
________________


Step 3 — Add Worldview Alignment
This is the source’s key addition to the traditional value equation.
Goal
Make the prospect feel:
“They understand my world.”
Do not merely prove that you have done the work before.
Show that you understand:
   * their niche
   * their language
   * their constraints
   * their internal problems
   * their incentives
   * what they actually care about
   * what only someone familiar with their market would know
Weak:
“We help businesses like yours grow.”
Strong:
An offer that references a problem, goal, phrase, operational reality, or cultural reference only that exact market would immediately understand.
The source argues that worldview alignment improves the whole equation because it makes the promised outcome, timeline, ease, and credibility feel more specific and believable. Pasted text
________________


Step 4 — Make the Outcome Specific to Their Actual Goal
Avoid broad vanity outcomes.
Example:
Weak:
“We’ll make you go viral on LinkedIn.”
The source’s stronger example reframes the desired outcome around a specific market and what that audience actually values.
The principle is:
Do not stop at the surface metric.
Ask:
“What does this result actually change in their business?”
Examples:
   * not more impressions → warmer sales calls
   * not more leads → qualified meetings
   * not more traffic → higher purchase intent
   * not better content → stronger founder-led pipeline
________________


Step 5 — Use Their Language
Normally, simplicity is preferred.
The exception is when niche-specific language increases trust.
Use:
   * industry terminology
   * role-specific concerns
   * market-specific references
   * familiar operational language
Do not use insider language merely to sound clever.
Use it only when the prospect will instantly recognize:
“This person knows my world.”
________________


Step 6 — Reduce Time and Effort Without Becoming Unbelievable
The basic levers are:
   * faster
   * easier
   * cheaper
   * less work for the prospect
But do not claim unrealistic ease.
Bad:
“We’ll 10X your pipeline with zero effort.”
The source argues that this sounds fake rather than valuable.
Every large reduction in time or effort must have a mechanism.
________________


Step 7 — Explain the Mechanism
Every bold claim needs a reason it is possible.
Examples of mechanisms:
   * proprietary infrastructure
   * automation
   * proven internal process
   * previous execution in the exact vertical
   * templates built from similar clients
   * existing data
   * prebuilt workflows
   * studying their existing assets before beginning
Example logic:
“We can move faster because we already built the infrastructure.”
Or:
“Approvals only require a thumbs-up because we write in the voice of your existing content.”
The mechanism makes speed and ease credible.
________________


Step 8 — Require Effort Only When It Improves the Result
Do not eliminate prospect effort for the sake of saying it is “done for you.”
Some effort can increase buy-in and perceived likelihood of success.
Allow prospect effort when it clearly improves the result.
Examples:
   * approving the offer
   * providing necessary source material
   * reviewing positioning
   * confirming the ICP
Avoid unnecessary:
   * long onboarding forms
   * excessive meetings
   * complicated setup
   * repetitive approvals
Rule:
Only create effort where the prospect can understand why that effort improves the outcome.
________________


Step 9 — Add a Specific Risk Reversal
Avoid generic guarantees.
Weak:
“100% satisfaction guaranteed.”
Weak:
“Money back if you aren’t happy.”
The source argues that vague guarantees often lack credibility and can attract poor-fit buyers.
A stronger guarantee defines:
   * exact metric
   * exact threshold
   * exact timeframe
   * exact consequence if missed
Structure:
If we do not achieve [specific measurable threshold] by [specific timeframe], then [specific remedy].
The guarantee should reinforce the claim, not compensate for a weak offer.
________________


Step 10 — Build a Cold-Ready Intro Offer
Do not immediately sell the full service to a stranger.
Extract one small result from the larger service that:
   * can be delivered quickly
   * demonstrates competence
   * has obvious value
   * is easy to understand
   * naturally leads into the larger service
The source calls this the intro offer.
Example structure:
“We’ll deliver [small, concrete result] in [short timeframe] for [low/no risk]. You only need to [one useful action].”
The source’s example is an outbound sprint contacting a defined number of qualified decision-makers in seven days, with the prospect only needing to approve the offer first. Pasted text
________________


Step 11 — Make the Intro Offer a Slice of the Full Service
The intro offer should not be random free work.
It should demonstrate the part of the full engagement that best proves:
   * competence
   * speed
   * relevance
   * quality
   * understanding of the buyer
Ask:
“What small piece of our service makes someone immediately understand why they would want the rest?”
That is the intro offer.
________________


The 5 Cold-Ready Offer Rules
Before approving an offer, confirm all five:
1. Make it stupid simple
The prospect should understand it immediately.
2. Speak to a problem or outcome specific to them
It should feel built for that market.
3. Put it in their language
Use terminology and context they recognize.
4. Reverse risk with a specific guarantee
Avoid vague promises.
5. Only require effort where it improves success
Every requested action must have a clear reason.
Pasted text
________________


Offer Template
Use:
For [specific ICP], we’ll [specific outcome] in [specific timeframe] using [credible mechanism], without [major friction]. If [specific measurable result] doesn’t happen by [timeframe], [specific risk reversal]. To get started, you only need to [necessary effort].
Then create the cold intro version:
Before you commit to the full service, we’ll [small concrete result] in [short timeframe]. You only need to [one useful action].
________________


QA Checklist
Do not launch until all are true:
   * It is an offer, not a description of the service.
   * The ICP is obvious.
   * The outcome is specific.
   * The result matters financially or operationally.
   * The claim is believable.
   * The offer contains worldview alignment.
   * It uses language the ICP recognizes.
   * The timeframe is clear.
   * The mechanism explains why the result is possible.
   * Prospect effort is minimal and purposeful.
   * The guarantee is specific, if one is used.
   * The intro offer proves competence.
   * The intro offer naturally leads to the full service.
   * A cold stranger could understand it without extra context.
________________


Failure / Escalation Path
If the offer feels generic:
Go deeper into the ICP and worldview alignment.
If the offer sounds too good to be true:
Add or strengthen the mechanism.
If the promise is large but responses are weak:
Reduce the dream outcome to a smaller, more believable first result.
If prospects show interest but do not move forward:
Reduce time, effort, or perceived risk.
If the full offer is too difficult to sell cold:
Create a smaller intro offer.
If several variants are plausible:
Test them. The source explicitly emphasizes that offers still need to be tested and narrowed to the audience for whom the outcome is most believable. Pasted text
________________


Definition of Done
The offer is complete when a cold prospect with no context, no trust, and no prior intent can quickly understand:
   1. Who this is for
   2. What they get
   3. Why it matters
   4. Why they should believe it
   5. Why it can happen quickly/easily
   6. What they must do
   7. What happens if the promised result is not delivered
   8. What small first result they can experience before buying the full service
The final operating principle from the source is:
A standard value-equation offer captures demand. A cold-ready intro offer generates demand. Build both.


S Tier
Offer
	What he says
	Gift card
	Not strong enough to be the offer, but very strong as a PS/add-on to reduce meeting friction. Example: offer a Walmart card or even something personalized like pizza from a place near them. Used well, he calls it S-tier.
	Benchmark / Scorecard
	S-tier with an asterisk. Especially strong for data-driven products/services. If the benchmark is based on real third-party or large-scale data and connects to money/results, it can be extremely persuasive.
	Free work upfront
	One of his strongest concepts. Examples: free landing page, UGC creative, ad creative, cold-email copy, cold-email list. AI makes this easier to deliver at scale.
	Charity donation
	He says this “rips.” Best used similarly to the gift card as a PS or incentive, but the prospect can choose a charity. He actually places it above gift cards.
	Custom lead magnet — when done extremely well
	Can be S-tier when it combines multiple valuable pieces: situation proof + creative ideas + competitor teardown + real research. The more bespoke the research, the stronger it gets.
	A Tier
Offer
	What he says
	Dinner / Roundtable
	Very strong in relationship-heavy industries and mid-market/enterprise sales. Especially effective around conferences/events. He mentions using event attendee lists for outreach and says they once booked 42 meetings around one event.
	Lookalike case study
	Strong because it gives immediate proof that you’ve solved the same problem for businesses like theirs. Even stronger if you can say you’ve done it repeatedly for several similar companies, rather than relying on one logo.
	Situation proof pack / Data research pack
	Strong because you prove that the prospect’s pain is actually happening right now. This creates highly contextual sales conversations and makes the pitch feel directly relevant.
	Free trial — for strong PLG products
	He says this can be A-tier for product-led-growth businesses where trying the product naturally leads to adoption/virality. Outside PLG, he ranks it lower.
	B Tier
Offer
	What he says
	Loom teardown
	It worked for him personally and helped close his first 12 clients, but he drops it to B because it is time-consuming and usually requires founder/product expertise to make the video genuinely useful.
	Guarantee
	Useful as risk reversal, particularly with larger businesses. The danger is attracting low-quality/broke customers when targeting SMBs. He dislikes vague guarantees like “I’ll work forever until it works” and prefers real money-back/risk-reversal guarantees.
	Competitive teardown
	Strong when the buyer naturally cares about competitor performance: ads, SEO, AI search, etc. You show what competitors are doing successfully and use that to create attention/opportunity.
	Free trial — generally
	For businesses without a strong PLG motion, he places it around B/C because a free trial often feels like work the prospect has to do.
	Tool credits
	Similar to a free trial but psychologically stronger because credits feel scarce and potentially expiring. He places it above free trial.
	Creative ideas pack
	Very good when the founder/company has genuine expertise that can be encoded into personalized ideas. He likes the concept because AI can help scale unique knowledge rather than generic personalization.
	C Tier
Offer
	What he says
	Free workshop
	Better if you already have an audience or strong LinkedIn/content presence. Much weaker for a completely cold audience. Could work locally/in person, but he doesn’t see it as an ideal cold conversion offer.
	Free pilot / Proof of concept
	Very polarizing. Depending on execution, he says it can fall into C or D. A pilot asks for a lot more commitment/work than smaller upfront-value offers.
	Swag / Merch
	More useful with existing customers, partly because people may post/share it. Could work cold if the swag is genuinely creative or desirable, but generally not a strong primary cold offer.
	Early access / Beta / Waitlist
	Sounds exclusive but often boils down to “test my unfinished product.” He says manufactured exclusivity usually does not reliably translate into revenue.
	Custom lead magnet — mediocre execution
	He explicitly says it can be C or S. Generic lead magnets are nothing special; highly researched and tailored ones can become S-tier.
	Free community
	He says this can work, but it depends heavily on who is already inside the community and the type of product. The transcript does not give a clean final tier, but his comments put it in the middle/context-dependent bucket rather than among his top cold offers.
	D Tier
Offer
	What he says
	Pay for performance
	He initially considers C and then drops it firmly to D-tier. He does not see the pricing model itself as a compelling cold offer.
	Webinar invite
	D-tier for cold outbound. His point is that strangers generally do not care about your webinar. Can work in other channels, but poor as a cold-outbound offer by itself.
	Customer intro
	Offering an introduction to another customer/peer as the primary offer. He doesn’t understand the appeal and notes people sometimes even misuse/lie about this approach.
	Launch discount
	Straight D-tier. Discounting the launch is not compelling enough to create cold demand.
	Done-with-you setup
	Potentially useful later in the funnel when someone has interest but is stuck due to implementation friction. Not cold-ready, so he puts it in D.
	Free audit
	Strongly dislikes this. His argument: prospects don’t want someone to tell them everything that is wrong; they want someone who can fix the problem. If you can identify the problem externally, just give them the insight/value instead.
	Strategy call + asset
	He dislikes “pick my brain,” consulting calls, and generic strategy calls as the actual offer. Even if an asset comes out of the call, he sees the call itself as too weak for cold outbound.
	Free pilot / POC — weak execution
	He explicitly says a free pilot can fall into D if it requires too much effort or is poorly structured.
	Two concepts he prefers over a “free audit”
He specifically shifts the framing toward:
Opportunity Report + Action Plan
Instead of:
“Here’s everything wrong with your company.”
Make it:
“Here’s the opportunity we found, what it could be worth, and what I’d do about it.”
And ROI Calculator: he describes this as similar to a personalized benchmark tool where the prospect inputs their information and gets a meaningful financial/business output. The transcript does not clearly preserve the exact tier he dropped it into, so I wouldn’t invent one. Pasted text
The biggest takeaway from his ranking is that the best cold offers generally do one of four things: prove the pain, show the opportunity, do useful work upfront, or provide credible proof/risk reversal.


# 15 Cold Email Front-End Offers


| Niche | Front-End Offer |
|---|---|




| Ads Agency | 3 UGC creatives launched in your ad account against your current best ad — live in 72 hours. If they don't beat your control, delete them |


| YouTube Agency | Your first video done end to end — ideated, scripted, edited, thumbnailed. Post it, keep it. Free |


| Recruiting | 3 vetted candidates for your open role in 5 days. Only pay if you hire. Free replacement if they leave |


| Logistics / 3PL | Your first shipment ships free — and we guarantee our rates beat what you're paying UPS/FedEx today, or you keep your current provider |


| Freight/Parcel Audit | Forward your shipping invoices. We recover the refunds your carriers already owe you — paid only out of what comes back |


| Commercial Property Tax Appeal | Your building is over-assessed. We'll show you by how much before you ever reply — and only get paid if your bill goes down |


| Medical Billing / RCM | Send us your denied claims. We'll tell you what's recoverable within days and only get paid on what we collect |


| Dead Lead Reactivation | First booked appointments from your old CRM leads within 7 days — paid on what closes. No ad spend, no new leads |


| Appointment Setting | Qualified meetings on your calendar. Pay per meeting that shows |


| Email/Retention (DTC) | Your abandoned-cart flow built and live in your account within 48 hours — first recovered orders typically show inside the week |


| AI Quoting Agent (Logistics/Trades) | An agent that turns your inbound quote requests into sent quotes in minutes instead of days. See it run on your own RFQs before you pay anything |


| Amazon Agency | Send us your worst-converting ASIN. Within 48 hours: exactly why it's losing shoppers, side-by-side against your top 3 competitors, plus the fully rebuilt listing |


| Voice AI / Missed Calls | We'll show you how many calls you missed last month and what they cost you. Then the AI answers them — pay per call it saves |


| Equipment Finance | One-page application, real term sheet in 24 hours. Costs you nothing — worst case, you use it against your bank |


| Commercial Insurance / Benefits | We'll beat your current benefits package by 30% — guaranteed — without cutting a single benefit your employees have today. If we can't, you change nothing |




A guy reached out asking if we could run cold email for his MCA (basically fast business funding) company. 


This was basically the conversation.


Me: What makes you different from every other funding company out there?


Client: We're honest. 80% renewal rate. Five years in business. About $50 million funded per year.


Me: That's not an offer. That's a company bio.


Client: What do you mean? That IS what makes us different.


Me: Every MCA company says some version of this. Your prospect has seen 40 emails this month from funding companies that sound exactly like you.


Client: So what would you actually say?


Me: Can you guarantee funding in 24 hours?


Client: Yeah, for most deals we can.


Me: Then lead with that. "I can get you funded in under 24 hours with no credit checks." That's an offer. Everything you said before was just background.


Client: What if I can't make a guarantee like that?


Me: Then give something away for free that gets them on a call. We did this at Leadbird. We'd offer to build a free lead list of someone's ICP just for hopping on a quick demo. 


For your space, maybe it's a free credit line to age their business credit. Or a free qualification check. Something where saying yes feels like a no-brainer.


Client: Won't that just attract tire kickers?


Me: Some will take the free thing and dip. But you're also getting real buyers on the phone who wouldn't have responded to "we're honest and we've been in business for five years."


Client: So what was the actual problem with what I was doing?


Me: Your service is what you do. Your offer is why someone picks you over the 50 other companies in their inbox saying the same thing. 


You were selling the service, but never actually gave them the offer.


The client built an AI bot that lives inside Slack that can run your ads. Think ChatGPT but in your workspace.


Their original ask was e-commerce, but that was a dead end. Nobody is trusting AI to run a core revenue function of their business end to end.


So I had to figure it out from scratch.
Nick Abraham
@NickAbraham12
·
20h
1. Find the one specific thing they do.


I found one feature that was tangible: it runs Google Ads. And it's free.


When the product is weak, lean into the lowest-friction entry point. 


Free and specific will always outperform vague and paid.
Nick Abraham
@NickAbraham12
·
20h
2. Go wide on market.


I didn't want to bet on one industry. If the bet is wrong, the campaign dies.


I pulled a wide spread of B2B service companies and let the data tell me what converts.
Nick Abraham
@NickAbraham12
·
20h
3. Personalize with DiscoGen.


DiscoGen visited each prospect's website and pulled the exact keywords they'd bid on in Google Ads.


So the email reads: "It bids on keywords like dental practice purchase, start a dental practice, dental practice valuation."


That makes the prospect think this was written just for them.
Nick Abraham
@NickAbraham12
·
20h
4. Make the CTA a non-decision.


"Want me to set it up? Takes 30 seconds and it's free."


Not asking for a demo or sending a calendar link.
Nick Abraham
@NickAbraham12
·
20h
5. Let the data pick the winner.


First positive reply came from a dental strategy consultant within an hour: 


"Sounds interesting. I'd be interested to learn more."


Now we know the vertical and will scale from there.
one of the coaches in my coaching program runs a cold email agency


he tested offering prospects a $25 amazon gift card just for taking the initial call


reply rates doubled


so he made it a requirement


he now tells every new client: you need to offer a $25 amazon gift card for any prospect willing to hop on a call


if you won't, we can't work with you


he's literally dequalifying paying clients who refuse


the clients he does take produce better results faster, churn less, and pay him longer


what you require of your clients before you take their money matters as much as what you deliver after


—-


I used to think these campaigns were a waste of money, but I've changed my tune.


Imagine you have a $50K enterprise ACV.


- 5,000 emails/mo
- 1% reply rate = 500
- 10% positive reply rate = 50
- AirPods accepted / demo booked: 55% (27)
- 27 AirPods x $180 = $4,860/mo AirPods spend
- Close rate on demos: 15%
- 4 closed deals = $200K in revenue


Tough to say no when you put it that way.


You can likely improve a lot of those stats depending on offer, social proof, seller ability, etc.
"Dickie - just built you a site to help convert more prospects to Premium Ghostwriting Academy and Write With AI.


Should I send it here?


For context, we build sites for personal brands like yours (check out [OTHER CLIENT] as an example)."
Our client sells business phone and internet for small businesses.


There are a million companies doing the exact same thing.


Here's how we found an angle nobody else was using and pulled replies on day one:
1:56 PM · Jun 5, 2026
·
6,565
 Views
Relevant


Nick Abraham
@NickAbraham12
·
Jun 5
The default campaign here would be "hey, want to switch your phone provider?"


There's no urgency or differentiation. Nobody's responding to that. 


Here's what I did:
Nick Abraham
@NickAbraham12
·
Jun 5
1. Click through every page on the client's site.


Business phone, internet, CRM integrations, smart dial (standard VoIP stuff).


Then I clicked on "Branded Calling" and found the move.
Nick Abraham
@NickAbraham12
·
Jun 5
2. Find the one feature that's actually different.


Branded calling means when you make an outbound call, instead of a random number, the recipient sees your business name.


Instead of "214 238 4065" they see "CK Pools."
Nick Abraham
@NickAbraham12
·
Jun 5
3. Pull the prospect's actual phone number as a merge field.


The email opens with their real number and says "most people see an unknown number and don't pick up. 


We make every call display your business name instead."
Nick Abraham
@NickAbraham12
·
Jun 5
4. Write the email from the prospect's perspective.


Instead of pitching the product, we showed the prospect their own phone number and told them what their customers actually see when they call.
Nick Abraham
@NickAbraham12
·
Jun 5
TL,DR for not selling a commoditized offer:


Find the one thing that is actually different about your product or service and anchor your entire cold email copy to that.
hey james, just checked and noticed you don't have a website, would you like one for free? want to show you what i got
  
  



“When I look through the content, like, you generate great positive replies. But when you’re sharing, you’re sharing a very bland case study. Like, it’s very blah, right?
Like, I’ve shared bland case studies and I’ve hit my head against the wall going, why? Until somebody told me that.
I’m like, oh, crap. And now I have that same perspective.
Somebody replied. There’s something that they want. Like, holy cow. And with so much information available out there, I am seeing a lot more conversation happen in email. People are like, I need to get all this information before I’m willing to hop on a call with you.”






“Be very specific. Like, hey, we had a landscaping company that was doing 10 houses a day, and they got really tired of doing X, Y, and Z because their bandwidth was really short, but they don’t want to spend more on advertising because they thought it was cheaper to go door to door.
So we ended up stepping in. First month, spent $300. Second month, we spent $1,000. Third month, we spent $4,000. And we got 200 leads.
Out of those 200 leads, they were able to have 20 conversations. We built a full process for them on how to close that conversation.
Here’s what we did. We built a funnel for them. Here’s the link to the funnel we created. You can check that out right here.
And out of that, they converted 10 deals that doubled the amount of houses they worked on, so it went from 10 to 20 houses in less than 60 days.
That means they invested $4,000 to now have $60,000 in revenue instead of $30,000 in revenue. And we built all that for them from beginning to end.”


-----------


Examples:


https://www.loom.com/share/a9c4057b65ec4dc396bbe4ddb8ed3493


https://www.loom.com/share/57b5c602595942ed85d061b75e696057


https://www.loom.com/share/c7d8ce4f324943978f8a4804585315f6


https://www.loom.com/share/c93591cbb5cd42eca0646123f9b76bd7


https://www.loom.com/share/66722e066bf048269213b67a7b93c79e


https://www.loom.com/share/3520f8377e244cfdbf6369d1df2071e8





SEO -> HVAC


Direct Marketing Watermelon Example


Amazon SEO -> ECOM


Amazon -> Declining Sales


SEO/PPC -> Local Businesses

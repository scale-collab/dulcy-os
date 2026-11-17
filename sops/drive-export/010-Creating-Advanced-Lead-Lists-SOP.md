# Creating Advanced Lead Lists SOP

Source: https://docs.google.com/document/d/1E-hbGP03qd3a5gtkZJJSHUzl3D4GBvFlFMwAFdriAqY/edit?usp=drivesdk
Modified: 2025-03-07T21:14:14.990Z
Exported: 2026-11-17. Source document; not independently validated as current.

﻿Creating Advanced Lead Lists SOP


Purpose:
This SOP guides you through creating lead lists that are beyond your basic lawyer, roofer, marketing agency.


Video Walkthrough: HERE


Steps for creating advanced lead lists:


🛑 Prerequisite: Before proceeding, review the Creating Basic Lead Lists and Verifying Leads SOP to understand the standard process for finding and verifying leads. The verification process remains the same—this guide is specifically for building more intricate lead lists beyond basic industry filters.
1️⃣ Understanding Advanced Lead Targeting
Unlike standard lead lists (e.g., “Marketing Agencies” or “Roofing Companies”), advanced targeting focuses on hyper-specific company criteria, such as:
✅ Corporate Accountants
✅ Panel Companies
✅ Brands Selling on Amazon
✅ Corporate Chains with 250-2K U.S. Locations
✅ Companies using Technologies
✅ US Pet Ecom brands with 3-5 Marketing Level Employees
The goal is to identify patterns and data points that will allow us to build these lists accurately and at scale.
2️⃣ Finding & Extracting Data from Multiple Sources
Similar to building a basic list, look up the lead type in our provided database list to see if it will work for the type of leads we want. If it’s not viable to build on an external database you can make it on Apollo/Clay; otherwise, refer to external scrapers when possible.
https://gamma.app/docs/These-databases-have-176B-leads-eu7o92sdsvrem4b
For these types of leads it takes a second to think about. I am going to go over my thought process for each of these:
✅ Corporate Accountants – It is pretty easy to find corporate accountants on Apollo.io, so let’s start there.
Or, another way would be to go onto Clay.com, create a new table under ‘Find Companies’, and scrape accounting firms in the US.
I would then ask ChatGPT for all keywords relating to corporate accounting (e.g., “corporate tax planning,” “business financial consulting,” “enterprise CFO services,” etc.).
Next, I’d use Claygent and create a prompt to search the website for those keywords and output YES or NO depending on whether the firm serves business clients (not individuals).
I would then take all the YES outputs, import them into Apollo, and export the decision-makers based on the client’s criteria (e.g., Managing Partner, CFO, CEO, Director of Business Development).


✅ Panel Companies – I A/B tested multiple methods to find panel companies and found that keeping things simple is far more effective than overcomplicating the process.
First, I researched every type of keyword associated with panel companies and identified what makes them different from general market research companies. I made sure to include those keywords in the social media description and SEO description filters.
The reason? I already know that market research as a broad category will return the types of companies I need, so instead of searching from scratch, I focused on excluding irrelevant results using negative keywords.
Once I refined my keyword list for panel companies and applied it correctly, I consistently found the companies I was looking for.
  
  

✅ Brands Selling on Amazon – This list is simpler to build but requires a few extra steps.
For example, our client targets UK brands making $10K-$100K on Amazon.
Step 1: Research
        •        First, I researched which types of brands are most likely to be selling on Amazon.
        •        Then, I looked into how much revenue a brand typically makes to fall within the $10K-$100K range on Amazon.
Step 2: Scraping the Data
        •        Using Storeleads, I filtered and scraped brands that matched the criteria.
        •        I then imported this list into Clay.com.
Step 3: Verifying Amazon Presence
        •        I used Claygent to take the brand name and verify if it’s actually selling on Amazon.
        •        I set up a prompt in Claygent to search for the brand with an Amazon link and return YES or NO for verification.
This way, I ensured that only qualified brands making $10K-$100K on Amazon UK made it into the final list.
✅ Corporate Chains with 250-2K U.S. Locations Making <$1B/Yr – Started by setting up a Clay.com table under Find Companies. We ran filters for several industries our client serves and then moved to building out the filters.
After getting a list of companies in those industries, we set up a Claygent scrape to pull location data. Instead of relying on basic company descriptions, we used a custom prompt to search the internet and company websites for the exact number of locations a company operates. If the result fell between 250-2K locations, it moved to the next step: revenue verification.
Finding Number of Locations
Ran the following Claygent prompt:
Task: Retrieve the total number of locations this company {Name} operates.
Steps:
- Search for the company's official website {Domain} using its full name {Name}.
- Navigate to sections like "About Us," "Our Locations," or similar pages where location info is listed.
- If nothing is found on the official site, do a Google search: "How many locations does {Name} have?"
- Extract the number of locations mentioned and cross-check with business profiles or news articles.
Desired Output:  
- Return only the **total number of locations** in **numerical format** (e.g., "350").
If the location count fell between 250-2K, the company moved on to annual revenue extraction.
Extracting Company Revenue
Used Claygent to extract annual revenue for 2023/2024. Ran the following prompt:
Input: Here's the company to research: {Name}  
Objective: Extract the **explicit fixed annual revenue figure** for the fiscal year **2023/2024** and convert it into **USD**. If no exact figure is available, estimate based on public data.
Instructions:  
1. Search specifically for **a fixed** revenue figure (e.g., "$5 billion", "€6 billion"). Ignore percentages or growth rates.  
2. Convert any non-USD currency into **USD** using the current exchange rate.  
3. If no fixed number is found, take a **well-researched estimate** based on available sources.  
Example:  
- If the search returns "EXOR's net revenues for 2023 grew by 17% to €6 billion" → Convert to "$6,300,000,000" (assuming 1.05 USD per EUR).  
Desired Output:  
- Return the revenue as a **full numerical value in USD** (e.g., "$6,300,000,000").  
Once revenue was confirmed, we moved on to finding decision-makers.
Finding Key Decision-Makers
Used Clay’s Find LinkedIn Contacts feature to pull relevant marketing executives. Targeted job titles included:
        •        Chief Marketing Officer (CMO)
        •        VP of Marketing
        •        Director of Marketing
        •        Head of Marketing
        •        Marketing Manager
All results were written to another table using Clay’s Write to Other Table.
Verifying and Enriching the Data
From here, we pulled:
        •        Full Name
        •        Company Name
        •        Job Title
        •        Company Domain
        •        LinkedIn URL
        •        Employee Count
        •        Industry Type
Then used Clay’s workflow to find and verify email addresses.
✅ Companies High Intent Signals – When building cold email campaigns, identifying high-intent signals is one of the most effective ways to ensure your outreach lands with the right people. The more relevant the signal, the higher the chance of conversion.
Why High-Intent Signals Matter
Instead of convincing someone to see the value in your offer, you find prospects who already understand it. This makes your cold emails feel natural rather than a hard sell.
For example:
* Selling Facebook Ads? → Target companies already running Facebook Ads (they already believe in paid traffic).
* Selling SEO? → Target companies with a blog section (they already care about organic search).
* Selling outbound lead gen? → Target companies actively hiring SDRs (they need more pipeline).
How to Find High-Intent Signals
These tools help track what companies are already doing, so you can personalize and pitch your offer accordingly:
1. Hiring Signals (Companies Actively Hiring for a Role)
        •        If a company is hiring SDRs, they likely need more leads → Pitch LinkedIn + Cold Email services.
        •        If they’re hiring marketing roles, they may need ads, SEO, or email marketing help.
        •        How to find: Use Clay.com to scrape LinkedIn job postings.
2. Technology Signals (Companies Using Specific Tools)
        •        If a company runs Facebook Ads, they may need better creative or scaling strategies.
        •        If they use Shopify, they might need store optimization, CRO, or email flows.
        •        If they use Salesforce, they might need CRM integrations, automation, or data enrichment.
        •        How to find: Use BuiltWith.com to detect installed technologies.
⚠️ Pro Tip: Always double-check tech signals using ChatGPT or other sources.
Some tech stacks don’t mean what they seem (e.g., AWS doesn’t mean they sell on Amazon).
3. SEO & Content Signals
        •        If a company has a blog, they likely care about organic search & backlinks.
        •        If they don’t have a blog, they might need SEO content services.
        •        How to find: Use Claygent to scrape their website and search for a “Blog” section.
How to Use These Signals in Cold Emails
Once you identify a high-intent prospect, personalize your outreach based on what they are already doing.
💡 Example Cold Email for a Company Running Facebook Ads
❌ Generic: “Hey {{first_name}}, is {COMPANY} using facebook ads. We help {INDSUTRY} manage their facebook ads to increase your ROI by 30%. Worth a chat?”
✅ Relevant: “Hey {{first_name}}, noticed {{company}} has been running FB ads. We helped {{competitor}} improve ROAS by 34% by testing new creatives—could we create 3 free creatives for you to A/B test?”
💡 Example Our Cold Email Services for a Company Hiring SDRs
❌ Generic: “Hey {{first_name}}, do you need more high-intent leads who are ready to convert?”
✅ Relevant: “Hey {{first_name}}, saw you’re hiring SDRs at {{company}}. We built a system that books sales calls through LinkedIn & Cold Email. We also have a pool of A-Tier SDR talent that we implement into your business—would you be opposed to me sending more details?”
Key Takeaways
✔️ Use hiring signals to target companies actively expanding their sales & marketing teams.
✔️ Use technology signals to find companies already investing in tools that align with your offer.
✔️ Use SEO/content signals to identify brands that already understand organic growth.
✔️ Personalize cold emails based on these insights for higher engagement & conversion rates.
🔹 Final Note: Over time, you’ll recognize patterns in different industries and get better at spotting the right intent signals for your campaigns.
✅ US Pet Ecom brands with 3-5 Marketing Level Employees – 
1. Scraping Pet Ecom Brands Using Storeleads
        •        We scraped Storeleads.io to find US-based eCommerce brands in the pet industry.
        •        We filtered for brands using Shopify & WooCommerce since they are the majority of the ecom stores.
        •        We then imported the list into Clay.com for further enrichment.
2. Identifying Companies with 3-5 Marketing Employees
        •        In Clay.com, we used Find Contacts to pull all employees at each company with a marketing-related job title.
        •        We filtered to only include companies with 3-5 marketing-level employees to match the ICP.
3. Selecting the Right Decision-Makers
        •        Once we identified companies with 3-5 marketers, we prioritized decision-makers in marketing.
        •        We targeted CMO, Director of Marketing, VP of Marketing, Marketing Manager, etc.
        •        These contacts were written to a new Clay table for further processing similar to above.
4. Finding & Verifying Email Addresses
        •        We used Clay’s Find Email tool to extract & verify each marketer’s email address.
        •        We filtered for valid & deliverable emails to reduce bounce rates in outreach.


🫠 3. Be Reasonable – Balancing Targeting & Scale
In most cases, it’s better to keep your targeting broad and launch a campaign rather than going to extreme lengths to gather hyper-specific data points.
💡 Why?
The more filters you add, the smaller your lead list gets. This can limit your ability to test and reduce outreach volume to the point where it’s ineffective.
Example – Targeting Roofers & HVAC for SEO
We have a client targeting Roofers & HVAC companies for SEO services.
❌ Overcomplicated approach:
        •        Checking if they use blogs
        •        Searching for backlink profiles
        •        Analyzing content marketing presence
✅ Effective & scalable approach:
        •        Simply build a list of Roofers & HVAC companies
        •        Use a strong cold email script to open the conversation (Check Creating a Cold Email Campaign SOP for Reference)
We launched the campaign with broader targeting, and it still generated high-quality replies because the messaging resonated with the audience.
Best Practice – Find the Balance
1️⃣ Start with a strong thesis → Think about what would work best.
2️⃣ Keep filtering reasonable → Don’t overcomplicate and shrink your list.
3️⃣ Launch & test → Let the data tell you what’s working.
4️⃣ Adjust as needed → Refine targeting over time based on results.
💬 Final Thought:
I trust you’ll make the right judgment when building lists. If you ever need help, feel free to ask. The key is to stay strategic without overcomplicating the process.

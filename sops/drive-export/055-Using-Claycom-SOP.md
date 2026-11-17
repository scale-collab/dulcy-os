# Using Clay.com SOP

Source: https://docs.google.com/document/d/1T_3OK-2qRFfYfel-5_OkaeNVEfTrFlNdRyE0kPsfJOo/edit?usp=drivesdk
Modified: 2025-11-05T13:16:39.082Z
Exported: 2026-11-17. Source document; not independently validated as current.

﻿Using Clay.com SOP


Purpose:
This SOP guides you through the proper way to use Clay.com in your outreach and to verify different industries of leads for enriching and list building.


Video Walkthrough: HERE


To become an expert at Clay.com, beyond what I can teach, you should take advantage of two main resources:
📚 1. Clay University
👉 Clay.com University
        •        Clay offers an in-depth course on how to use their platform to collect accurate data at scale.
        •        I highly recommend going through this course to better understand workflows, data enrichment, and automation.
📺 2. Learn from the Best – YouTube Resource
👉 Eric Nowoslawski’s YouTube Channel
        •        Eric posts tons of Clay workflows that we’ve already used to improve campaigns.
        •        Watching his content will help you discover new ways to use Clay effectively.


2. What are the uses?
  



When you first log in to Clay.com, you’ll be greeted by the dashboard. Understanding how to navigate Clay efficiently will help you maximize its lead generation and data enrichment capabilities.
1️⃣ Understanding the Dashboard
📍 Left-Side Navigation:
        •        Home Page – Main workspace where all workflows live.
        •        Favorite Workflows – Quickly access saved workflows you use often.
        •        CSV Exports – Where all downloaded lead lists & data sets are stored.
        •        Trash – Deleted workflows & files.
📍 Main Center Panel:
This is where you create new workflows. You can:
        •        Find People – Scrape & enrich contacts.
        •        Find Companies – Scrape & filter businesses by niche, revenue, location, etc.
        •        Find Jobs – Scrape job postings (useful for targeting hiring signals).
        •        Find Local Businesses – Gather location-specific businesses (useful for local marketing).
        •        Import from CSV – Upload and enrich pre-built lead lists.
        •        Use a Template – Pre-built workflows to automate research & targeting.
        •        New (Custom Workflow) – Build a workflow from scratch with pre-built tools.
  



2️⃣ Templates & Pre-Built Workflows
📌 Templates Section
This section contains pre-built workflows we’ve created for different use cases.
🛠 Best Practice: Always duplicate the workflow before modifying it to preserve the original template.
💡 Example Workflows:
✔️ Finding the number of locations a business has
✔️ AI-Generated ICP & Target Customer Research
✔️ Re-Engagement Campaign Template
✔️ Checking SEO & Paid Ads Usage
✔️ Finding people who left a company 6 months ago (to target their replacements)
✔️ Scraping Ads to Generate Ice-Breakers & Personalization
✔️ Suggesting 10 Potential Clients Based on Description
✔️ Funding Research & Investment Signals
🔎 How to Use These Workflows?
        •        Play around with them to understand how they work.
        •        Modify them to fit specific campaigns.
        •        Leverage the Clay University Course to fine-tune usage.
3️⃣ Dulcy Workspace – Our Clients & Workflows
All client campaigns & workflows are stored under Dulcy in Clay.
📌 Naming Convention:
Workflows are named by campaign to keep them organized and easy to find.
📌 Starting from Scratch:
        •        If you need to build a workflow from the ground up, there’s a blank template available.
        •        The default workflow includes:
        •        Lead verification
        •        Finding missing leads
        •        Checking employment status on LinkedIn
        •        Assigning a unique ID (saves credits/API usage when dealing with multiple contacts from the same company)
        •        Website check (useful for verifying if a business is an eCommerce store, SaaS, agency, etc.)
  





This guide will walk you through setting up a workflow in Clay.com from scratch to build a high-quality lead list for outreach campaigns.


I am going to go over this workflow that was built for a marketing agency targeting roofers for as the example: https://app.clay.com/workspaces/273172/tables/t_THSqKhEocJSJ/views/gv_XfxBYj6ytSYD


Step 1: Setting Up a New Workflow
Create a New Table in Clay
1️⃣ Log into Clay and click “New Table”
2️⃣ Select “Find Companies”
3️⃣ Name the workflow based on the campaign
✅ Naming Format Examples:
📌 “[Fivenson Studios] Roofing SEO Audit”
🎯 Why? Naming workflows properly helps with organization and tracking.


Step 2: Importing Leads from Apollo or Storeleads
📍 Start with a CSV export from Apollo.io or Storeleads:
        •        If using Apollo.io, download a CSV with filters like industry, revenue, employee count, and location.
        •        If using Storeleads, filter by Shopify, WooCommerce, or Amazon brands.
        •        Drag & drop CSV into “Import CSV to Table” in Clay.
✅ Mapped Fields:
✔️ First Name
✔️ Last Name
✔️ Email
✔️ Job Title
✔️ Company Name
✔️ Company Website
✔️ Company LinkedIn
✔️ Lead’s LinkedIn Profile
✔️ Company Short Description
✔️ Company City & State
🎯 Why? These fields are essential for enrichment and filtering.


Step 3: Generating Unique IDs & Lookup Table
📍 Why?
        •        Helps save API credits by avoiding multiple searches for the same company.
        •        Ensures we don’t duplicate searches if multiple employees belong to the same company.
Steps in Clay:
1️⃣ Generate a Unique ID for each company.
2️⃣ Set the lookup table to transfer data if multiple contacts exist from the same company.
✅ Example:
If “Skyline Roofing” has 3 marketing contacts, Clay will recognize them as part of the same company.
🎯 Why? Prevents unnecessary API calls and improves efficiency.


Step 4: Verifying Employment on LinkedIn
📍 Why?
        •        Avoids emailing people who have left the company.
        •        Ensures outreach goes to current decision-makers.
Clay Function: “Find Contacts”
1️⃣ Run a LinkedIn employment check.
2️⃣ If YES, continue with enrichment steps.
3️⃣ If NO, filter them from the list.
🎯 Why? More accurate targeting = fewer bounces & better engagement.


Step 5: “Am I Company?” Check (Claygent AI Search)
📍 Why?
We need to confirm that the company is active, in the right industry, and relevant.
How to Set It Up in Clay:
1️⃣ Use Claygent AI search to verify:
        •        Is the company still active?
        •        Is the website in English?
        •        Does the website match our industry criteria?
2️⃣ Run only if the LinkedIn check confirms current employment.
3️⃣ Ask Clay to return the AI’s confidence score along with its answer.
✅ Example Output:
✔️ Company: XYZ Roofing
✔️ Website Status: Yes
✔️ Industry Confirmation: High or Very High
🎯 Why? Ensures only relevant companies are included.


Step 6: Finding Competitors for Personalization
📍 Why?
Adding a competitor’s name makes outreach more relevant.
Claygent Prompt for Competitor Search:
1️⃣ Use 4o mini model (Clay’s lightweight AI).
2️⃣ Find two competitors for each company.
3️⃣ Output competitors in this format:
“Competitor1 and Competitor2”
✅ Example Output:
“ABC Roofing and Skyline Roofing”
🎯 Why? Makes outreach more engaging and credible.


Step 7: Adding Local Icebreaker (Restaurant Name in Subject Line)
📍 Why?
Mentioning a well-known restaurant makes outreach feel more personalized.
Claygent Prompt for Finding a Local Restaurant:
1️⃣ Use Company City + State.
2️⃣ Ask Claygent to find a famous, non-chain local restaurant.
✅ Example Output:
        •        Chicago, IL → “Lou Malnati’s Pizzeria”
        •        Miami, FL → “Joe’s Stone Crab”
🎯 Why? Personalized subject lines = stand out of every other email


Step 8: Final Check Before Exporting
📍 Before launching the campaign, double-check:
✅ Lead is still employed at the company
✅ Website is active & in English
✅ Company is confirmed in the right industry
✅ Competitor names are correctly added
✅ Local restaurant is included for personalization
🎯 Why? These final checks maximize the quality of the list.
This is a walkthrough of a Clay table I just built. I’ll go through another example to demonstrate the process, so you can apply the same approach to different theses and test accordingly. Before launching a full list or workflow, always test 15-20 contacts to ensure at least 85% accuracy.


This is the attached workflow for another client who helps UK brands on Amazon grow beyond 100k+.. 
https://app.clay.com/workspaces/273172/tables/t_QwetEsvSHWRz/views/gv_VRGhQzAZnxRs


I first scraped a list of ecom brands in the UK and implemented it into this table: https://app.clay.com/workspaces/273172/tables/t_qHEtTSNMx8PY/views/gv_RV2c25GB8CT9


Step 1: Verifying Companies on Amazon
To confirm whether a company is selling on Amazon, I used Claygent with the following prompt:
        Visit Company Website Full and check if the company name appears as a listing on Amazon. I work with companies on Amazon, so if they are not selling there, I do not want to reach out.
        Search Amazon.com to compare if the company name (also the domain name) appears as a seller.
                •        If the company is selling on Amazon, return “YES” in the Amazon column.
        •        If the company is not selling on Amazon, return “NO” in the Amazon column.
        •        If you are unsure, return “PURPLE” in the Amazon column.
        My job is on the line for this, so accuracy is critical—make sure the result is 1000% correct.
Once the results were returned as YES or NO, I filtered for YES, exported the list, and uploaded it into Apollo.io to extract the decision-makers.
Step 2: Bringing Decision Makers Back into Clay
Once I had the list of decision-makers, I imported it back into Clay.
This time, instead of verifying their eCommerce brand with the Amazon check, I used Claygent to confirm they were actively selling products online.
Step 3: Verifying eCommerce Presence
For this, I used the following prompt:
        Visit the provided company website (Company Website Full) and determine if they actively sell products online.
        Steps to verify eCommerce presence:
                1.        Access the website:
        •        Navigate to the URL.
        •        If redirected, note the final URL.
        2.        Analyze the homepage:
        •        Look for prominent “Shop”, “Products”, or “Store” links.
        •        Check for featured products or product categories.
        •        Identify any “Add to Cart” or “Buy Now” buttons.
        3.        Explore the navigation:
        •        Click on “Shop” or “Products” links if available.
        •        Look for product category pages.
        4.        Examine product pages:
        •        Check for product descriptions, pricing, and purchase options.
        5.        Check for alternative sales channels:
        •        Look for links to Amazon, eBay, or other third-party marketplaces.
        6.        Analyze the website structure:
        •        Look for typical eCommerce URL patterns (e.g., /product, /category, /shop).
        •        Check for a sitemap.
        7.        Check “About Us” or similar pages:
        •        Determine if they are a manufacturer, reseller, or distributor.
        8.        Check customer service pages:
        •        Look for FAQs about ordering, shipping, or returns.
        •        See if they have sales-related inquiries in their “Contact Us” section.
        Conclusion:
                •        If they actively sell products online, return YES.
        •        If they appear to be a manufacturer or wholesaler, return NO.
        •        If they do not sell directly online, return NO.
        •        If more information is needed, return “MORE INFO NEEDED”.
Step 4: Finding the Right Contact Person
Instead of formatting job titles manually on LeadAcademy, this step was built directly into the Clay table.
After identifying employees, I output 2-3 names and applied this formula to customize the email outreach:
{{Givenname - Name - Results}} ? "I wasn’t sure if I should reach out with you or " + {{Givenname - Name - Results}} + "." : "Since you are the " + {{Title}} + " at " + {{Normalized Name}} + ", I believe you would be the right person to reach out to."
This would generate lines like:
        •        “I wasn’t sure if I should reach out with you or Shane.”
        •        “Since you are the Stores Manager at Valve Center, I believe you would be the right person to reach out to.”
Another option:
        •        “I wasn’t sure if I should reach out to you or somebody else on your team.”
Step 5: Personalizing Emails with Product Data
Since we are targeting brands on Amazon, we want to stand out by doing a little homework.
To personalize the outreach, I scraped their eCommerce product page (which we already verified) and extracted:
✅ A product they actively sell on Amazon
✅ A key term related to that product
For this, I used Claygent with the following prompt:
        Act as a product page scraper to extract specific product information.
                1.        Access Company Website Full.
        2.        Locate and navigate to the Shop/Products page. Look under sections like:
        •        “Best Sellers”, “Products”, “Shop”, “NAME OF PRODUCT”, “Solutions”.
        3.        Identify at least one product being sold (ignore gift cards, services, or unrelated items).
        4.        Extract and return:
        •        A general product term (e.g., “Body Lotion”, “Shaving Cream”).
        •        The normalized name of the product.
        If no product or product page is found, return:
❌ “Product page or product information not found for Company Website Full.”
This allowed me to mention a specific Amazon product in the email, making it more relevant and engaging.
This step-by-step workflow ensures that we:
        1.        Only target companies already selling on Amazon.
        2.        Find decision-makers who are still active in their roles.
        3.        Verify eCommerce presence before outreach.
        4.        Personalize emails using their product details.
Now, with accurate targeting and personalization, we maximize response rates and conversions.

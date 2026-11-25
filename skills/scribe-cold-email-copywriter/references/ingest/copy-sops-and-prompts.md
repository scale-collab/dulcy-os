# Ingest: copy SOPs and prompts (Drive export)

Built 2026-11-25 for Scribe from the Drive export in `sops/drive-export/`. Every source doc listed below was read in full.
Sources are history, not validated as current. **`rules/RULES.md` wins over everything here** (see "Cross-doc conflicts" at the end).

How to read this file:
- "Quote" = exact wording from the source. Typos are kept.
- Example labels: **GOOD** / **BAD** are the source's own verdict unless marked "(Scribe note)". **REVIEWED** = copy from the Oct 8, 2026 review (118): cleaned and claim-checked, but the doc itself says it is *not approved to send*.
- Every example carries its client. A client's facts belong to that client only (list at the end).
- Placeholders are kept exactly as each source wrote them (`{FIRST_NAME}`, `{{first_name}}`, `{firstName}` all appear). Map to validated fields before use.
- Missing content (images that did not export) is marked UNKNOWN.

Duplicates: 011 = 054 (identical body; 054 is the newer copy, modified 2025-11-05). 015 = 051 (identical body; 051 newer). 084 = 147 (identical body; 147 is the 2025-03-08 copy from info@dulcymedia.com, 084 modified 2025-11-05). Each pair is one section.

---

## 1. 011 / 054: Creating a Cold Email Campaign SOP (2025)

Purpose: building a campaign from scratch (lists are a separate SOP). Real campaigns referenced: "PPC Agency Campaigns", "VisionairAI Recruiters" (links not exported).

### Setup checklist (verbatim order)
1. "Define Data Points – Determine which lead details you need to personalize emails."
2. "Upload to Email Bison – Import your lead list into the platform."
3. "Write Cold Email Scripts – Draft compelling copy for your outreach."
4. "Spintax the Copy – Add spintax variations to increase deliverability."
5. "Verify with EmailGuard – Check for spam triggers before launching."
6. "Launch the Campaign – Set sending limits & start the campaign."

### Hard rules (quotes)
- "conversion comes down to how well you position the offer. Your copywriting will determine if leads respond positively."
- "Your cold emails must first sell the need for your service before selling the service itself."
- "People buy results, not services. Position the offer around what they actually care about: Revenue, Growth, Profitability, Market Share."
- Best offers help someone: "1. Make more money 2. Save more money 3. Save Time".
- "Keep in mind when you create the campaign the type of company and contact titles you are reaching out to."
- Email 1 structure: "Personalized First Line (NOT “Hope you’re doing well”)", "Clear Offer/Benefit (The “What’s in it for them”)", "Optional Social Proof (If applicable)", "Call-to-Action (CTA) – Easy to say “yes” to".
- "Every Email Should Have This Format: Easy to say yes to / Low Friction / Make them feel stupid for saying no / Short Scripts <50 Words / Tangible High Value"
- CTA ladder: "The sequence of emails should be resolving in a softer CTA as the sequence goes on. Email 1: Hardest CTA / Email 2: Softer CTA / Email 3: Softest CTA"
- Spintax: "always use Spintax and personalization"; "Double check your spintax ... some sentences don’t make any sense to the context of the email. It is okay to delete these from the email." (Tool: custom GPT "spintax-baby".)
- A/B: "ALWAYS BE A/B testing different angles. A good A/B test should be 1-2k leads per variation." "When you A/B test. Everything else should be the same besides 1 Factor." Winner = "higher positive reply rate".
- "🚫 Never send more than 3/4 emails per sequence (to avoid spam complaints)." Timing: Step 1 → "2 days+" → Step 2 → "3 days+" → Step 3.
- Metrics: reply rate, positive reply rate, "Bounce Rate: Should be below 2.5%" (superseded: RULES 2.5% watch / 4% pause), "Meeting Booked Rate: Goal: 20% of positive replies → booked calls".
- Spam check: "always run the spintaxxed copy through an email spam checker (e.g., EmailGuard)". Common flagged words: "“free,” “guarantee,” “money,” “urgent,” “act now”". "Double-check subject lines—these get flagged easily."
- "Once all steps are complete, ping Alexander to review before you launch".

### Framework: Demand Capture vs Demand Generation
- Demand Capture (prospect already looking; "Easy to sell, competitive"): websites, IT services, insurance.
- Demand Generation (prospect does not know they need it; "Harder to sell, but high ticket"): cold calling, cold email, FB/Google/TikTok ads.
- Selling a demand-capture offer through cold outreach needs: (1) "High Volume Outreach", (2) "Unique Positioning", (3) "Targeting Demand Capture Indicators" (triggers: recent security breach for IT security; running paid ads with an outdated site for web design; hiring rapidly for insurance).
- Demand capture copy = specific and problem-aware. Demand generation copy = "education & trust".
- Final takeaway: high volume, unique positioning, demand triggers, "Educate first, then pitch the service."

### Framework: offer structure
"Clear Value Proposition" (pain solved) · "Outcome + Timeframe" · "Risk Reversal (Optional)" · "Social Proof: Has this worked for others in their industry?"

### Campaign types (when to use)
- **Sniper**: "targets a specific job title within a specific industry, addressing a specific pain point."
- **Shogun**: "targets a specific industry, addressing a specific pain point on a company level."
- **Personalized**: "hyper-personalized campaign leveraging AI that get’s data from either a job title or company level."
- **Broad**: "simple campaign with no flashy personalization. This is typically to test an offer and see if it has PMF."
- **Broad (tiny personalization)**: "a little personalization ... to test an offer and see if it has PMF VERY FAST."
- When: "Each campaign is used for different offers or scenarios." (No finer rule given.)
- Personalization ideas: "mentioning a case study, competitor, a review, do an audit, ideas, colleagues, etc." (via Clay).

### Sequence templates (Dulcy generic, source = GOOD)
Email #1 – The Introduction (objective: instant credibility):
```
Hey {FIRST_NAME},
{AI generated first line that is very relevant to the prospect reading this email + also noting what you did for the competitor company}
{go more in-depth on the case study}
{CTA
```
Email #2 – Case Study/Handling Objections Follow-Up (objective: real success story):
```
Hey {FIRST_NAME},
{Another variation of Email 1’s first AI-generated line}
{Another form of social proof}
{Softer CTA (not direct to call - but ask if they would like to explore this further)}
```
Email #2 real example (Dulcy, prospect "Zack", lookalike "Customink"; source = GOOD, "^Handled the 3 most common objections"):
```
Hi Zack, just wanted to add to my last email: 
- I can pull leads based on your past clients, ensuring they match your ideal customer profile. We provide only decision-makers from companies that fit your exact criteria—whether it’s employee headcount, location, keywords, tech stack, or industry.
- With the right tools, you can send emails to these prospects that are hyper-personalized—making it feel like each email was written just for them.
- No catch—we believe in the quality of our service and want to give you a risk-free way to see the results for yourself. 
I’d be thrilled to build you a list of 1K targeted customer leads (full name, email, company name, linkedin, etc.) similar to Customink at no cost. Does that sound okay?
```
(Scribe note: well over the doc's own 50-word cap; objection-stacking pattern = list fit, personalization, "no catch".)

Email #3 – The Final Nudge ("soft breakup"):
```
Hey {FIRST_NAME},
Wasn’t sure if I should send this to you or {EMPLOYEE_NAME}.
Is increasing {RESULT} a priority for {COMPANY} right now?
Asking because we just helped {SIMILAR COMPANY} with {SPECIFIC RESULT}.
Can I send more info to you or {COLLEAGUE}?
//
Would you or {EMPLOYEE_NAME} be the right person to speak to?
```

### Example lines (verbatim, with verdict)
- BAD (demand capture): "“Hey, do you need a website?” (Generic, low response)"
- GOOD (demand capture, generic web agency): "“Noticed {COMPANY} is running paid ads, but your landing page is leaking conversions. A quick fix could add 15% more revenue. Want me to show you how?” (Specific, problem-aware)" (Scribe note: "15%" is an illustrative number; never send an unproven figure.)
- BAD (demand gen): "“We do cold email lead gen, want leads?”"
- GOOD (demand gen, Dulcy): "“Could I send over 1,000 free leads just like {CASE STUDY}? It will include name, email, phone number, linkedin, company and everything you need to book them. I’ll show you how to do it + build it out live.”"
- Positioning, generic web agency: "Instead of pitching “We build websites,” position it as: 🚀 “We build revenue-driven websites that increase conversion rates by 42%.”" (illustrative number)
- BAD offers (service-focused): "“We do SEO, copywriting, and blog writing for SaaS companies.”" / "“We create Facebook Ads to grow your eCommerce store.”"
- GOOD offers (outcome-focused): "“We add $40K per month in new revenue to SaaS companies with SEO.”" / "“We help eCom brands add 20% more sales through Facebook Ads.”" (illustrative)
- BAD offer: "“We help businesses improve their email marketing.”"
- GOOD offer: "“We help B2B companies recover lost deals and increase revenue by 35% through personalized email follow-ups.”" (illustrative)
- Roofers/HVAC campaign (older owners, "don’t check their emails and don’t know/use Zoom or Google Meet"): Step 1, Step 2 and subject-line examples were images: **UNKNOWN** (not exported). Same for the marketing-agency comparison example: **UNKNOWN**.

### Subject lines and CTAs (verbatim)
- BAD subject: "“Hey {FIRST_NAME}, wanted to connect.”"
- GOOD subject (spintax): `{Quick one {FIRST_NAME}?|Thoughts on this?|What happened?|Hey {FIRST_NAME}, real quick}`
- BAD CTA (no variability): "“Would you be interested in discussing?”"
- GOOD CTA (spintax): `{Would you be open to a quick chat?|Is this something worth exploring?|Worth a chat?}`
- A/B test ideas: CTAs ("“Worth a chat?” vs. “Mind if I send more info?”"); subjects ("“Quick question” vs. “Our Outbound”"); first lines ("“Saw your LinkedIn post on X” vs. “Noticed {COMPANY} is hiring for X”"); personalization ("“I noticed {COMPANY} is being outranked by {COMPETITOR1} and {COMPETITOR 2} for key search terms?” vs. “I checked {COMPANY}’s Google Page Speed analytics, and your results came back at {STAT}/100.”"); P.S. lines.
- A/B CTA pair (Dulcy): Email A "“Would it be okay if I send over 1,000 free leads for you to check out?”" vs Email B "“Could I build a list of 1,000 free leads for {COMPANY}. It will include their email, name, linkedin and everything else you need to book them in”".

### Common mistakes (verbatim pairs)
1. "Asking for a Call Too Early" → "Offer a valuable insight first."
2. "Writing Like a Corporate Robot" → "Keep it conversational and direct."
3. "No Personalization" → "Always mention something specific about the recipient or their company."
4. "Weak Subject Lines" → "Make them curiosity-driven & relevant."
5. "Low value or marketing lingo" → "Make them high-value, unique & natural."

### Spam-check steps (verbatim)
1️⃣ paste spintaxed email into EmailGuard; 2️⃣ "Review flagged spam words"; 3️⃣ "Copy and paste the flagged words into your spintax tool and ask it to remove or rewrite them."; 4️⃣ "Ensure the new copy still makes sense and keeps the same value & relevance"; 5️⃣ "Run a final check in the spam tool". Best practice: "Keep language natural & conversational—avoid “salesy” or “hype” words." "Always test with multiple variations to improve inbox placement."

### Final checklist before launch (verbatim)
- "Offer is strong & outcome-focused"
- "Email is natural, high value, easy to read & reply to"
- "Spintax is implemented for better deliverability"
- "A/B tests are set up to optimize performance"
- "Sequences are 3-4 emails max to avoid spam complaints"
- "Preview copy in Bison for 15+ leads just to make sure all variables are being implemented correctly and read each spintax to make sure it makes sense"

---

## 2. 015 / 051: Campaign Analysis & Optimization SOP (2025)

### Hard rules (quotes)
- "Don’t just track numbers—analyze responses. The best optimizations come from reading actual replies."
- "*Note: Never forget when you A/B test something that should be the only variable that is different."
- "Sometimes, bad targeting = bad results no matter how good the copy is."
- "Ensure your email scripts contain as little spam words as possible"
- "If an email account drops below 60% health, quarantine it and set the sending to 1 per day" (superseded by RULES account-health loop: limit 0 for 1 week, retest).
- Bounce above 2.5% = review email health (RULES: 2.5% watch, 4% pause).
- Open rate "is less important but can give insight into subject line effectiveness" (Scribe note: 130 says never enable open tracking).
- Scale gradually: "Don’t go from 100 to 5,000 emails overnight".

### Reply categories (checklist)
Positive (interested, more info, booking) · Soft objections (timing, budget, relevance) · Hard objections (not interested, have a solution, no value) · No response.

### Objection → copy fix table (verbatim)
| Objection | Optimization Strategy |
|---|---|
| “Not the right time” | Add urgency or offer a soft next step (e.g., free resource) |
| “We already have this covered” | Refine messaging to differentiate from competitors |
| “Not interested” | Test new angles or industry-specific pain points |
| No response | Adjust subject lines, first lines, or personalize more |

Example: "If you see many replies saying, “We already have an internal team for this,” tweak your messaging to highlight a unique selling point or an angle that shows how you complement their current team instead of replacing them."

### What to A/B test
Subject lines; first sentence; CTA ("direct (“Want to book a call?”) vs. soft (“Would you be open to exploring this?”)"); offer positioning. Method: two versions, equal sample, track positive replies, roll out winner.

Example A/B (generic, source = GOOD format):
- Version A: Subject "“Quick question, {{First Name}}”"; First line "“Noticed you handle growth at {{Company}}, wanted to share something that might help…”"
- Version B: Subject "“Should we chat, {{First Name}}?”"; First line "“Curious—how are you currently handling {{pain point}}?”"
(Scribe note: this example changes two things at once, against its own one-variable rule.)

Scaling CTA wording test (if the demo CTA won): "Would you be open to a 5m demo?" / "Up for a short demo?" / "How about a quick demo?" (Scribe note: RULES now forbid trivial word-swap tests for Email 1 angles.)

Example analysis numbers (illustrative): reply 3% (good), positive 12% (average), bounce 3.1% (too high).

Scaling volumes (not copy; history): new client 500/day wk1-2 → 1,000 → 1,500; old client 1,500 → 2,000 → 2,500.

### Case study: VisionairAI (client VisionairAI only)
Started June/July 2023 with no niche. Industries tested: supplement brands, real estate agents, property managers, realtor groups, recruiting firms (early signal).

BAD (VisionairAI, original):
```
Hi Mark,
I simplify repetitive outreach for recruiting companies, allowing them to reduce wasted time and drive consistent growth with our Visionary AI Employee.
For instance, we recently helped the Johnson Group to optimize their processes, reducing their outbound team from 18 to just 2, while still scheduling 25-50 meetings per week—all made possible by our AI technology.
Care to try calling it?
```
Issues named: "Too vague: “Simplify repetitive outreach” isn’t specific enough." "Weak personalization: No direct mention of the recipient’s pain points." "Lack of strong CTA: “Care to try calling it?” is weak and non-urgent."

GOOD (VisionairAI, optimized; prospect Ryan at Temp Experts):
```
Hi Ryan, as VP of Marketing & Sales Operations at Temp Experts, I noticed you’re still manually screening hundreds of candidates.
I designed a software that acts & sounds like a human recruiter—finding qualified candidates and booking interviews 24/7.
Would you be interested in testing it out?
```
Improvements named: hyper-personalization (role + company), pain-point focus, "Stronger CTA". Results: 17.51% interested reply rate, then 24.04%; 11 positive replies in 24 hours; "A simple rewording of the email led to a 37%+ increase in response rates."
(Scribe note: "I noticed you’re still manually screening" asserts a fact about the prospect. Under 118/RULES, only say it if verified; otherwise frame as a question.)
Suggested next proof line: "“Other recruiting firms like Temp Experts have cut hiring time by 40%”" (Scribe note: written as an example to add, not a verified result: never use it as proof).

Process to repeat: "Test multiple industries → Identify strong reply rates → Optimize messaging → Scale success."

Reporting: weekly internal update; "Friday Client Check-In" with Google Sheet summary, short video, Slack updates.

---

## 3. 084 / 147: Cold Email Objections SOP

These are **reply** scripts (Echo's area), not first-touch copy; all are Dulcy's own sales responses. Scribe uses them to pre-empt objections in follow-ups (as 011's Email #2 does). Many carry claims that are not verified today (see conflicts): never paste one into copy unchecked. 27 pairs in the source; the copy-relevant ones verbatim, the rest as gist.

Verbatim (most reusable in copy):
- "Why is it free with no strings attached? Hard to believe." → "Great question! We offer 1,000 free leads because we believe in the quality of our service and want to give you a risk-free way to see the results for yourself. We're confident that you'll find value in what we provide.”
- "We've tried cold emails before, and it didn't work." → "I get that, and I appreciate your concern. The truth is, there are plenty of companies that would love to work with you—they just haven’t discovered you yet. Our approach is different because we build hyper-targeted lead lists and make sure your offer reaches the right people at the right time. I’d love to walk you through our process and show you how our clients have seen real results."
- "Our team handles lead generation internally." → "That’s great! Our service is designed to complement your internal efforts, not replace them. We help by delivering high-quality, vetted leads at scale, allowing your team to focus on closing deals and strategic tasks rather than prospecting. Many of our clients have found this approach significantly boosts efficiency and results."
- "We get too many emails already." → "I totally understand—email spam is a real issue. That’s why instead of spamming everyone on the planet. We focus on quality over quantity, ensuring our messages are highly personalized and relevant to the right people. The definition of spam is sending a high number of irrelevant emails to uninterested recipients. Instead of doing that we connect your offer with the exact roles who can benefit from it. That’s why our clients see real engagement instead of just noise in the inbox."
- "Can we do a trial before committing?" → "We don’t offer trials because successful outbound campaigns require proper setup, testing, and optimization over time. However, we keep our commitments flexible and focus on delivering measurable results early on. Our process is designed to give you confidence in our approach without needing a trial. I’d be happy to walk you through how we ensure success—does a quick call work for you?"
- "We're worried about our brand reputation." → "I completely understand—brand reputation is everything. But let me ask you this: do you remember a cold email you got a month ago? Most people don’t, unless it was truly relevant. That’s why we focus on high-quality, personalized outreach that enhances your brand, not harms it. / We also ensure ethical sending practices—if someone asks to stop or positively engages, they’re immediately removed from future sequences. And we never spam—our campaigns are limited to 3-4 emails per prospect to keep outreach professional and respectful."
- "I don't mind trying this but I want no upfront costs. Commission only structure, or a small draw. I don't pay any salespeople a salary; pay per result." → "I understand, our pricing depends on a few factors, but generally, we work on a monthly investment that covers our entire service with no minimum commitment. We customize everything based on your goals to get you the best results. I’d be happy to explain everything in a quick 10-15 minute chat—would Monday at 10 AM EST work for you?”

Gist of the other 20 (claims flagged *):
- "We don't need this service" → many [INDUSTRY] clients felt the same until they saw opportunities "on autopilot".*
- "No budget" → "designed to generate a significant ROI"; tailored plan.*
- "Spam?" → "Over the past two years, we’ve built a rock-solid infrastructure"; offer to share metrics.*
- "What makes you different?" → hyper-personalization, targeting, optimization, "multi-channel outreach, including LinkedIn and phone calls".*
- "Lead quality?" → "multiple data sources and a triple-validation process".*
- "GDPR?" → "Our processes are fully GDPR compliant"; offer documentation.*
- "What if no results?" → continuous optimization, long-term partnership.
- "Other priorities" → runs in the background, minimal effort.
- "Cold emails feel impersonal" → specific data points, human touch.
- "Already use another service" → multi-channel (email, LinkedIn, phone) beats single channel.*
- "Prefer other channels" → no bidding war, faster than SEO, "our system pushes out 2,000+ daily", fully owned.*
- "Skeptical of outsourcing" → extension of your team, transparency.
- "How long?" → "many clients start seeing results within the first 1-2 months".*
- "Support?" → strategy, email crafting, management, tracking.
- "Small business?" → scalable for any size.
- "ROI?" → varies; offer similar case studies.
- "How do you personalize?" → Clay enrichment, high-intent data.
- "Updates?" → "daily updates and detailed weekly reports".*
- "Too aggressive?" → follow-ups limited to 3-4 emails.
- "Negative responses?" → handled professionally, used as feedback.

Copy lessons (Scribe note): reusable pre-emptions are "why free", "complement, not replace", "relevance is the opposite of spam", and "it was the execution, not the channel" (also 111's steak reframe). Strip every unverified claim first.

---

## 4. 089: Case Study Campaign Approach (2026-01)

- What: "leads with a specific, real result achieved for another company and offers to share how it was done. The focus is not selling the service directly, but exposing a strategy that worked."
- Why: "People are far more interested in how something worked than being pitched."
- When: "When there is a clear result worth sharing" · "When the outcome aligns closely with what the prospect wants" · "When credibility and proof matter more than novelty".
- Rules: "The case study must be specific (numbers, timeframe, mechanism)" · "The CTA is framed as sharing the strategy, not booking a sales call" · "Follow-ups reinforce proof, not pressure".

Templates (generic, GOOD):
- Standard Case Study Opener:
```
Hey {FIRST_NAME},
{AI generated first line that is very relevant to the prospect reading this email + also noting what you did for the competitor company}
{go more in-depth on the case study}
{CTA}
```
- Short Case Study Ask:
```
Hey {FIRST_NAME} — {relevant first line}
I recently just helped {case study company} accomplish {outcome} and I think we could do something similar for you.
Could I show you how it works?
```
- Soft CTA Case Study:
```
Hi {FirstName}, not sure if this is for you but figured I’d ask.
We’ve been helping companies like {case study} achieve {result} in {timeframe}.
Could I send over a video explaining how I did it?
```
(Scribe note: "send over a video" requires the video to exist; 118 rule.)

## 5. 090: Risk Reduction (Risk Reversal) Campaign Approach (2026-01)

- What: "A direct offer paired with a clear guarantee or downside protection. The goal is to remove fear around trying something new."
- Why: prospects "hesitate not because they don’t want results, but because they’ve been burned before. Risk reversal shifts the mental equation from “what if this fails?” to “what if this works?”"
- When: "When skepticism is high" · "When the outcome can be clearly defined" · "When confidence in delivery is strong".
- Rules: "The guarantee must be simple and believable" · "The outcome must be measurable" · "The email stays short and confident, not defensive".
- Guard (from 118/RULES): a guarantee needs the client's approved metric, baseline, duration and terms. Never write one that the client has not approved.

Templates (generic, GOOD):
- Guarantee With Proof:
```
Hi {FirstName},
If we leveraged what we did for {case study} I’m confident we could {offer}.
Just did something similar where they saw {result} in {timeframe}.
Would you be open to a quick walkthrough?
P.S. If we don’t hit {result} in {timeframe}, {guarantee}
```
- Plan + Guarantee:
```
Hi {firstName},
We help {niche} {offer}.
Here’s the plan we’d run:
{plan}
P.S. If we don’t hit {result} in {timeframe}, {guarantee}
```

## 6. 091: Education-Based (Whitepaper) Campaign Approach (2026-01)

- What: "An education-first campaign framed around a whitepaper, report, or industry breakdown ... positions the conversation as research, insight-sharing, or peer learning."
- Why: "lower defenses by removing the feeling of being sold to." Prospects want to "See how others in their space are operating", "Learn what’s working before committing to change", "Validate their current strategy against peers". "This naturally qualifies interest".
- When: "When positioning as a thought leader matters" · "When selling a more complex or strategic service" · "When the market is skeptical of direct pitches" · "When the goal is higher-quality conversations over raw volume".
- Rules: "The topic must be something the market already cares about" · "The framing is “research” or “education,” not “marketing”" · "Participation feels optional and low-pressure" · "Insights are shared back with the prospect (early access, summary, or examples)" · "The transition into what we do happens after value is delivered."

Templates (GOOD; agency wording = Dulcy-style):
- Interview Whitepaper Outreach:
```
Hi {{firstName}},
We’re putting together a whitepaper on {HEADLINE}.
We’ve already spoken with {company}, {company}, and {company}.
Would you be open to a short conversation where we can cover some of the challenges and insights we’re seeing?
Happy to share early access to the report once it’s done.
```
(Scribe note: the three named companies must be real interviews.)
- Education-First, Soft CTA:
```
Hi {{firstName}},
I’m working on a short report around {how agencies are using outbound systems to consistently bring in new opportunities} = headline.
Not sure if this is relevant for you, but figured I’d ask.
If it is, I’m happy to share what we’ve learned so far.
```
- Sharing Completed Whitepaper:
```
Hi {firstName},
I recently wrapped up a whitepaper on {HEADLINE}.
Not sure if this would be useful, but happy to send it over if you’d like.
```
- Education → Conversation Bridge:
```
Hey {{firstName}},
We’re finishing up a research piece on how agencies are building predictable outbound without relying on ads or referrals.
After speaking with a few teams, some clear patterns have emerged.
Would you be open to a quick conversation so I can share what we’re seeing?
```

## 7. 092: Loom / Video Campaign Approach (2026-01)

- What: "offers a short, personalized video breaking down a real opportunity or issue."
- Why: "Video creates instant differentiation and credibility when it’s tied to something real. It works best when showing beats explaining."
- When: "When personalization matters" · "When the opportunity is visual or tactical" · "When attention needs to be earned".
- Rules: "The video is positioned as the solution, not the ask" · "The email asks permission before sending" · "The video is short and specific". (Ask permission = no link in the cold email, which also fits 130's no-links rule.)

Templates (GOOD; illustrative ecommerce scenarios, not a real client):
- Video Permission Ask (example brand "Jack's Apparel"):
```
Hey Jack,
I recently bought a fantastic jacket from your store for my sister’s birthday, and she loved it! As someone involved in e-commerce marketing, I couldn't help but notice that you haven't tapped into Amazon yet. Amazon has been a game-changer for apparel brands due to its massive traffic and buyer intent.
I made a short video explaining how "Jack's Apparel" could potentially increase sales by 20% in just two months by expanding to Amazon. Would it be okay if I send you the video to check out at your convenience?
```
(Scribe note: invented purchase story and "20% in two months" projection: never use as written; a personal story must be true.)
- Problem-First Video:
```
Hi {firstName}, not sure if you’re struggling with {pain}.
We helped {case study} fix this in {timeframe} and made a short video outlining how.
Want me to send it?
```
- Video to fix:
```
Hey {name},
I was trying to buy a {PRODUCT} for my cousin's birthday from your store but I noticed that the add to cart button glitches a bit on the phone sized screen compared to the desktop. Funny enough I actually own an agency that makes stores for ecom sports brands.
Mind if I share a video showing you how to fix it in 5 minutes?
```
(Scribe note: same: the observation and story must be real.)

## 8. 093: Lead Magnet Campaign Approach (2026-01)

- What: "offers something tangible and valuable upfront, with no commitment. The free asset directly connects to the core service. The free asset should be good enough, someone is willing to pay for it. It also should solve a problem, that then creates a new problem that is solved by your offer."
- Why: "Giving value first builds trust faster than claims. A good lead magnet also pre-qualifies interest because only people with the underlying problem engage."
- When: "When trust needs to be built quickly" · "When the market ignores direct pitches" · "When the free asset naturally leads to a bigger conversation".
- Rules: "The lead magnet must be something people would normally pay for" · "It must solve a real sub-problem, not be generic" · "The CTA asks permission, not commitment".

Templates:
- Straight Lead Magnet (Dulcy, GOOD): "Could I send over 1,000 ideal customer leads similar to {CASE STUDY} (full name, email, company name, LinkedIn, etc.) for you to use in outbound?"
- Free Resource – Expect to Believe (generic, GOOD):
```
Hey {FIRSTNAME} — I saw {SOMETHING RELEVANT}.
We help companies achieve {results}.
But I’d never expect you to believe me without giving you something first.
I made you a {resource}. Want me to send it over?
```
(Scribe note: "I made you" only when it is made.)
- Lead Magnet Subject Line (generic, GOOD):
```
Subject: {LEADMAG}
{FIRST_NAME} — I just finished a report on {LEADMAG}.
Would you like to see it?
```

## 9. 094: Direct Offer Campaign Approach (2026-01)

- What: "A straightforward campaign that clearly states the problem and the outcome. No storytelling, no long setup."
- Why: "When the pain is obvious and the solution is easy to understand, directness outperforms creativity."
- When: "When the prospect already understands the problem" · "When speed matters more than nuance" · "When clarity beats persuasion".
- Rules: "One clear problem" · "One clear outcome" · "One clear CTA".

Templates (generic, GOOD):
- Short Direct Ask:
```
Hey {FIRST_NAME},
If we could get you {BENEFIT}, would that be worth a chat?
```
- Problem → Outcome:
```
Hey {FIRST_NAME},
We help {niche} {offer} in {timeframe}.
Just helped {case study}.
Worth exploring?
```
- Why Isn’t? Case Study (Dulcy-style outbound):
```
Hey {FIRST_NAME}, just curious why {COMPANY} isn’t running outbound right now?
With case studies like {CASE}, this could be a quick win.
Want me to walk you through it?
```
(Scribe note: only if we know they are not running outbound; else it is an unverified assumption.)

### Approach picker (combined 089-094, Scribe summary)
| Situation | Approach |
|---|---|
| Real, specific, matching result exists; proof matters most | Case Study (089) |
| High skepticism, measurable outcome, client approves a guarantee | Risk Reversal (090) |
| Complex/strategic service, skeptical market, quality over volume | Education / Whitepaper (091) |
| Visual or tactical opportunity, attention must be earned | Loom / Video (092) |
| Trust needed fast, market ignores pitches, asset leads to bigger talk | Lead Magnet (093) |
| Pain obvious, solution simple, speed matters | Direct Offer (094) |

---

## 10. 106: How to Form a Campaign Thesis (2025-12)

Copy-relevant because the thesis is Scribe's brief: "The thesis is required for proper execution, QA, and for the AI agent that reads/uses this context."

- Inputs: onboarding form ("ALWAYS your starting point ... YOU must extract the insights, not rely on the client’s vague responses"); client website 3–5 min: services, case studies, main value props, past results, pricing indicators.
- **Pillar 1 WHO (ICP)**: "Pain present", "Purchasing power", "Easy to target (TAM ≥ 10,000; not ultra-niche)", "Growing industry (no dying markets like print newspapers)", "Role titles and company characteristics".
- **Pillar 2 WHY (strategy + timing + offer)**: "The strategy being used (whitepaper, value-first, research-based, direct callout, outbound awareness, etc.)"; "Timing (why this quarter, seasonality, market trend, etc.)"; "The offer being positioned (audit, consultation, done-for-you, trial, blueprint, etc.)". "This MUST explain the reasoning behind the approach."
- **Pillar 3 WHAT (testing + expectations)**: hypotheses, expected behaviour, campaign type (lead gen, research, nurture, awareness), timeframe, success definition.
- Loom thesis video covers: ICP, offer, strategy, "The copy direction", lead source, expectations.
- First-pass copy at the bottom of the thesis. Example (Dulcy generic, direction only):
```
Subject: Any leads?
Hi {{first_name}},
• Pain point
• Value offer
• CTA
```
"This is NOT the final version — just direction for the writing team."
- Best practices: "Never write a thesis without full clarity on the client’s offer." "Always ensure the ICP has both volume and urgency." "Keep thesis language clear and non-technical." "Remember this is a hypothesis, not the final campaign."
- Common errors (checklist): "ICP too narrow or impossible to target" · "Offer unclear or too high commitment" · "Strategy not tied to timing" · "Writing a thesis without checking case studies" · "Forgetting to attach the lead list" · "Overwriting the thesis into a long essay".
- Tool note: thesis built "in Atlassian" (history; today the thesis lives in Airtable's Campaign Center).

## 11. 110: How to Manage Client Expectations Pre-Launch (2025-12)

Mostly CSM process (Atlas). Copy-relevant parts:
- 14-day warm-up before launch; scripts are drafted Day 8–14 ("Scripts in draft"; "Awaiting your review on X asset").
- "On or before Day 14: Share campaign thesis ... Share scripts ... Share lead lists ... Align on launch timing ... Confirm everything is approved".
- Before launch: "Campaign thesis · Lead lists · Scripts · Loom walkthrough · Approval from the client".
- The thesis includes: "Why you’re using this angle", "Why this ICP", "Why this pain point", "Expected positive reply patterns", "Example emails".
- Example daily update (client-facing Slack, not cold copy): "Quick update: warm-up day 6/14. Working on research for your campaign thesis. Tomorrow I’ll have your first ICP segment drafted for review."
- Day 0: "Set tone: we are not a miracle switch — every part of the funnel matters".

## 12. 111: How to Review a Client's Cold Sales Process (2025-12)

Cole's area (sales calls). Copy-relevant parts:
- Before writing for a client, know: "The core value of their offer", "Their unique mechanism (what makes them different)", "Their outcome (what the client actually gets)", "Their pricing and terms", "Their ideal buyer (role, company type, revenue level)". Missing = gap.
- Call frame template (useful positioning sentence): "We help [ICP] get [specific outcome] using [high-level mechanism]."
- Objection framework: "1. Isolate 2. Reframe (new perspective) 3. Confirm". Example "We tried this before, it didn’t work." → Isolate: "“Totally understand. When you say you tried it and it didn’t work, what exactly happened?”" → Reframe (steak analogy): "they didn’t fail because “outbound doesn’t work”; they failed because the execution wasn’t right." → Confirm: "“Would you agree it’s more about how it’s done than whether the channel works at all?”"
- Red flag that also applies to copy: "Vague metrics: “We helped them grow a lot” vs. specific ROI or revenue".
- Capture "why they bought" notes: "Useful for future case studies".
- Same-day recap email contents (post-call, not cold): thank you + outcomes, recording link, key points, clear next step, relevant assets.
- Price band context: "$3k–$10k/month ... 1–2 call close is realistic"; "$30k–$50k+" = more calls.

---
## 13. 118: Dulcy Campaign Copy Morning Review, Oct 8, 2026 (most important source)

A real copy review "Prepared for Alexander". 26 review units across the clients active then (Dulcy + 8 clients; do not quote this as a current client count). "No campaigns have been launched from this review." All copy below is **REVIEWED**: cleaned and claim-checked, **not approved to send**. Labels used in the doc: "Review copy preserves or cleans an existing mechanism. Proposal ready for review means the new deliverable, terms and fulfillment still need approval. Neither label means approved to send."

### 13.1 Global rules from the review (verbatim "How to use the copy")
- "Select one first touch per recipient/company. Opening variants share the listed follow-ups; offer arms and alternatives must have mutually exclusive allocation. Follow-ups stay in the original thread with blank subjects. Stop on reply or opt-out."
- "Placeholders intentionally preserve each source’s readable format. Map every field to validated data before import, omit an optional first name cleanly for generic addresses, and never send a literal placeholder. No spintax or manually added sender signatures are included."
- "Complete suppression, company fit, email verification, asset and claim checks before preparation. Confirm offer scope, capacity, delivery owner and applicable client approval. Timing, send limits and allocations remain separate decisions."
- "Evidence is limited to its stated scope. Historical copy is not independent proof. Client-published results are not independently audited. A completed asset, actual query or real shortlist must exist wherever the email says it does."

### 13.2 Review-unit checklist (the structure every unit used)
Audience · Why this copy / Offer · Proof (with its scope) · Test (what A vs B tests) · Subject options (3) · Step 1 A/B · Step 2 and 3 shared in-thread follow-ups · Variables and audience checks (each variable defined + fallback) · Unresolved terms / approval gates · Evidence (source + date checked).
Shape of the copy: 3 steps; each email 2-3 short lines; subjects lowercase, 2-5 words, often `{{company}}`; one question CTA per email, most answerable with "yes"; follow-ups add one new piece (proof, scope, or a routing question).

### 13.3 Every critique and fix in the review (the lessons)
Claims and proof
1. Proof is scoped to what it proves. Digital Force "$25,000 MRR added in 21 days" is "Applied only to broader outbound work, not the free list or a guaranteed result" and is "general agency-outbound proof, not an AEO/GEO-specific result".
2. Unverified historical claims removed: "dozen agencies / 20+ opportunities" (Dulcy); "12-company claim" (Lead Flo); "100+ contractors or 3,000-lead claim" and "unverified 65% statistic" (Twenty West); creator "metrics, broad performance guarantees and creator-database totals" (GMG).
3. "Current lack of evidence is not a finding that the historical claim is false." If a client supplies substantiated proof, "retain the original supported case line rather than replacing it for novelty."
4. Historical speed is not a promise: TONAL's "less than three days" must not become "a prospective three-day turnaround promise. It is October 2021 production evidence, not performance proof."
5. Capability proof ≠ result proof: Thompson Tee "supports SEO/content capability only, not a demonstrated AI-recommendation result"; ITI "Organic traffic doubled within a year; that is not a result promised from this one-month ads test"; "No school proof transferred to this niche".
6. No guarantees of outcomes: "Do not promise winning creative, increased revenue, lower CAC or ROAS"; "No school guaranteed enrollments, lead cost, ROI or 30-day traffic promise"; "No ranking guarantee". "Existing guarantees need metric, baseline, duration and approved terms before reuse."
7. Never invent terms: "Do not invent a turnaround." "Sample scope, revision count and usage/delivery terms are not yet specified; do not add invented terms." "No “free early access” duration or saving invented."

Assets that the email says exist
8. "Use “I made” only after the relevant two-minute video exists and is verified. If it does not, hold this control rather than quietly changing the control offer."
9. "Ten suitable accounts must be researched before claiming the map exists." "Three actual gaps must be found before delivering a three-gap artifact; do not invent findings to meet a count."
10. "Jordan must confirm two real suitable creators can be shared before “I’ve got”/shortlist wording is used."
11. "Follow-up 3 reuses completed notes instead of claiming an unmade video."
12. Beauty ChatGPT opener needs per row: "actual query text, date, result, first two actual recommended brands, evidence the prospect did not appear, and finished notes. Ordinary web search is not a substitute."

Personalization and assumptions
13. "Remove the unverified “I saw your work” observation". "No need to claim “I saw your ads.” If a later version does, record and verify the exact ad first."
14. Do not assume the prospect's problem: "Do not claim prospects have poor AI visibility or already want to buy"; "No buyer supplier problems assumed"; "copy does not pretend to have seen a specific employee or campaign"; "No existing-site deficiency claimed".
15. Evidence gates are audience filters, not merge fields: "active_meta_ad_evidence: Audience gate, not an email merge field". Seasonal B "does not assert that the prospect has a known Black Friday campaign".
16. Variables must read naturally: "CONTRACTOR must be a grammatical singular trade noun, e.g. roofer"; robot_use_case "must read naturally before “offering” and “opportunities.”"; "COMP must render both brand names; KEYWORD must be grammatical in both subject and sentence. If the query includes the prospect, this template cannot be used."; service_label only "when the company explicitly offers the corresponding client service ... never infer from AI tools/internal use".
17. "FIRST_NAME syntax repaired; never insert sample John/Tampa as real data." Generic inboxes: "omit the name in a generic-inbox greeting".
18. Optional personalization never blocks a send: "Optional category personalization must never block this simplified sequence or introduce invented claims."
19. Sensitive niches: "No individual health personalization, patient data, treatment claims". "Confirm regulated-category advertising eligibility".

Offer framing
20. Say the catch out loud: "Keep media-spend exclusion in copy" ("Your school covers the advertising spend"); "Copy explicitly says paid hosting required. It does not say free hosting, no contract or no ongoing fees. The general no-contract agency claim must not override this agreement."
21. Bound the free thing: one product / two ads; one SKU; five leads in a named region; "The initial feasibility review may be free; the physical repairs are not offered free." Define vague words: "“Potential clients” means prospect contact records, not interested buyers or guaranteed meetings."
22. Regional or eligibility limits stay in copy and targeting: "Never apply this sequence to the nationwide top-up unfiltered. City alone does not establish Southern California fulfillment eligibility".
23. Simplify: Human AEO cut to "One direct service ... No audit, competitor absence claim, ranking guarantee or new tool offer." "Do not revive the completed audit or previous three-way offer split."
24. Respect client direction on the ask: ChopShop "Meetings first: route positive replies to scheduling. Do not add workflow-video homework, multiple resources or an unsolicited asset-upload request to the cold email." "do not impose an unapproved revenue cutoff." Post-call direction "overrides old onboarding" order (MJJ).
25. Removed from copy: "the extra “on the house” explanation, signature and decorative punctuation"; "signatures/PS"; "Original phone-dependent follow-up replaced with an email asset CTA; routing follow-up shortened."

Testing discipline
26. "One opening only: no unnecessary rewrite test." "Single control opening preserved; no cosmetic extra variant."
27. "One new offer against the cleaned video control. No additional first-touch variants until the offer comparison is interpretable." "Keep audience, allocation, subjects, send conditions and follow-up schedule comparable with arm B".
28. Disclose changes to a control: "These are disclosed hygiene changes, so this is a cleaned control, not an exact historical replay." "Do not claim past campaign performance proves the video beat another variant." "Do not claim this exact variant is a statistically proven winner."
29. Preserve what works on a top-up: "No new offer or opening test. Preserve Email 1; only evidence and claim-safety fixes to follow-ups." "Any material edits need applicable client review."
30. Arms and alternatives: "Event national is an alternative to, not an extra mixed step in, the restricted Southern California sequence. Do not duplicate recipients across alternatives." Same school audience, "mutually exclusive allocation".
31. Records: "Live campaign title/thesis still say industrial/facility-only. Align the record ... through the managed workflow"; "Do not retire/rewrite the discovery campaign automatically."

### 13.4 All copy, verbatim (REVIEWED, not approved to send)

**Dulcy · Other Marketing Agencies.** Audience: client-service agencies, 1–200 staff, US/UK/Canada, excluding AEO/GEO providers. A = established control, shortened; B = new-business segment.
Subjects: `1,000 contacts for {{company}}` · `your next client list` · `prospects for {{company}}`
```
Step 1 A — Subject: 1,000 contacts for {{company}}
Hey {{first_name}},
Could I build you a free list of 1,000 potential clients based on your ICP?
Names, emails, companies, LinkedIn profiles: the details you need for outbound.
Can I put that together?

Step 1 B — Subject: 1,000 contacts for {{company}}
Hey {{first_name}},
I can build you a free list of 1,000 prospect contacts in a market you want more agency clients from.
We’d agree on the types of companies and people first, then find their contact details for your outreach.
Want a list for {{company}}?

Step 2 (blank subject, in thread)
Hey {{first_name}},
We build lists and run outbound campaigns for agencies. Our broader outbound work helped Digital Force add $25,000 in monthly recurring revenue in 21 days.
For your free list, we’d agree on the companies and buyer roles you want to reach.
Mind if I send the targeting details we’d need?

Step 3 (blank subject, in thread)
Hey {{first_name}},
The 1,000 contacts are a sample of Dulcy’s list-building work. We also run outbound campaigns for agencies, if that becomes useful later.
Would a list for your next client push be useful?
```

**Dulcy · AEO/GEO Marketing Agencies.** Audience: agencies with explicit AEO/GEO client services. A = control adapted to the service; B = one chosen vertical. Step 2 = identical to Other Agencies Step 2.
Subjects: `prospects for {{company}}` · `your {{service_label}} outreach` · `1,000 prospect contacts`
```
Step 1 A — Subject: prospects for {{company}}
Hey {{first_name}},
Could I build you a free list of 1,000 potential clients for your {{service_label}} outreach?
Names, emails, companies, LinkedIn profiles: the details you need for outbound.
Can I put that together?

Step 1 B — Subject: prospects for {{company}}
Hey {{first_name}},
I can build you a free list of 1,000 prospect contacts in one industry you want more {{service_label}} clients from.
You choose the market and buyer roles; Dulcy finds the companies and contact details for your outreach.
Would that be useful for {{company}}?

Step 3
Hey {{first_name}},
The free list is a sample of the research behind Dulcy’s outbound work for agencies. You’d get 1,000 contacts matched to your agreed target market.
Want to try it for your next {{service_label}} push?
```

**Dulcy · Physical Robotics.** Audience: US vendors of physical robotic systems. Light edit of existing 3-step sequence; one opening only.
Subjects: `10 accounts for {{company}}` · `buyers for {{robot_use_case}}` · `an account map for {{company}}`
```
Step 1 — Subject: 10 accounts for {{company}}
Hi {{first_name}},
I can map 10 potential customer accounts for {{company}}’s {{robot_use_case}} offering and identify the people worth approaching.
Dulcy would use that research for tailored emails, then call when a buyer responds with interest.
Want me to put together the 10-account map?

Step 2
Hi {{first_name}},
I can narrow the map to the industry you most want to reach, so the accounts resemble the customers {{company}} actually wants.
Would that make the 10-account map useful?

Step 3
Hi {{first_name}},
If new {{robot_use_case}} opportunities are on your plan, I can put together the 10-account map and the first outreach angle we’d test.
Should I put that together?
```

**Human Marketing · AI Product Discovery.** Audience: US own-brand Shopify consumer-product companies ~$1M–$100M ($5M–$30M core). A = product discovery; B = buying questions.
Subjects: `{{company}} and AI shopping` · `your products in AI search` · `AI product recommendations`
```
Step 1 A
Hey {{first_name}},
Human helps brands make their products easier for AI tools to understand when shoppers ask what to buy.
For {{company}}, we’d improve how your site explains your products and answers the questions shoppers ask before buying.
Want me to send how we’d approach that?

Step 1 B
Hey {{first_name}},
We help brands build product and category content around the questions shoppers ask AI before buying.
For {{company}}, the goal would be to make your products easier to understand and consider in those recommendations.
Want me to send what that work involves?

Step 2
Hey {{first_name}},
Human’s work with Thompson Tee included SEO and content strategy. For this service, we’d focus on explaining your products clearly and answering the questions shoppers use to compare them.
Want a short outline of the work?

Step 3
Hey {{first_name}},
We’d start with one product category and the questions people ask before choosing what to buy, then work those answers into your site.
Is AI product discovery something you’re working on at {{company}}?
```
Optional: replace "your products" with "your {{product_type}}" only when a plain plural category is verified (e.g. "running shoes or candles").

**Human Marketing · Two Finished Meta Ads.** Audience: same Shopify audience, confirmed active Meta advertisers only; distinct companies from AEO. A = two finished assets; B = another creative angle.
Subjects: `two ads for {{company}}` · `a new angle for one product` · `Meta creative for {{company}}`
```
Step 1 A
Hey {{first_name}},
Human can write and design two finished Meta ads for one of {{company}}’s products, using your existing brand assets.
You can keep both at no charge and test them in your campaigns. Our team has handled ad creative and paid media for brands including Thompson Tee.
Want us to make a pair?

Step 1 B
Hey {{first_name}},
If you want a fresh angle to test on Meta, Human can turn your existing brand assets into two finished ads for one product.
We’d handle the writing and design, and you can keep both for free.
Want to try it for {{company}}?

Step 2
Hey {{first_name}},
We’d keep the sample to one product, using assets you already have. You’d get two finished ad variants your team can test in Meta.
Want me to send the details we’d need to get started?

Step 3
Hey {{first_name}},
The two free ads are a small sample of Human’s creative work. Your team can see how we handle the writing and design before deciding whether to work together.
Would that be useful for your next creative test?
```

**ChopShop · TONAL / Black Friday Creative.** Audience: US outdoor, action-sports, lifestyle brands with existing footage. A = ongoing creative needs; B = Black Friday prep (only while timely). Meeting-first CTA by client request.
Subjects: `a sample edit for {{company}}` · `your Black Friday footage` · `more from your footage`
```
Step 1 A
Hey {{first_name}},
ChopShop can make {{company}} a free sample edit using footage you already have.
For TONAL’s 2021 Black Friday campaign, we made 200+ video variations and 100+ GIFs in less than three days.
Open to a quick call to pick a clip for your sample?

Step 1 B
Hey {{first_name}},
If you’re planning Black Friday creative, ChopShop can make a free sample edit from {{company}}’s existing footage.
For TONAL’s 2021 campaign, we made 200+ video variations and 100+ GIFs in less than three days.
Open to a quick call to choose footage for yours?

Step 2
Hey {{first_name}},
We’d start with footage you already have and agree on what you want the sample to do. That gives you a way to see our editing on your own content.
Would a quick call to scope it be useful?

Step 3
Hey {{first_name}},
If there’s footage you’d like to reuse for upcoming ads, the sample would be a small way to try working with ChopShop.
Worth a quick conversation?
```

**Lead Flo · Event rentals, Southern California free-lead cohort** (Review copy). Offer: five free rental leads, SoCal footprint only. A = service-area eligibility; B = available capacity.
Subjects: `event rentals in {CITY}?` · `rental inquiries` · `{COMPANY} rentals`
```
Step 1 A
{FIRST_NAME}, saw that {COMPANY} offers event rentals in {CITY}.
We’re offering five free leads to eligible rental businesses in Southern California, so you can try the service before discussing more.
Would you like to check whether your service area is covered?

Step 1 B
{FIRST_NAME}, if {COMPANY} has room for more rental inquiries in {CITY}, we’re offering five free leads to eligible Southern California rental businesses.
The idea is to let you try the service before discussing more.
Want to check coverage?

Step 2
I’d want the five leads to match the rentals you offer and the area you serve.
Which rentals would you most like more inquiries for?

Step 3
The five-free-lead offer is limited to eligible service areas in Southern California.
Would checking coverage for {COMPANY} be useful?
```

**Lead Flo · National preview proposal** (Proposal). Three units with the same text; `[SERVICE]` = "event rentals" (event unit), "HVAC work" (HVAC unit: "the HVAC work you want more inquiries about", "compare quotes for HVAC work"), "{SERVICE_CATEGORY}" (tree and landscaping unit). Offer: finished page preview for one real service + short walkthrough. A = offer-led; B = problem-led.
Subjects: `a quote-page idea` · `{COMPANY} inquiries` · `one page for event rentals` / `one page for HVAC services` / `one page for your services`
```
Step 1 A
{FIRST_NAME}, I’d like to build {COMPANY} a finished page preview for the [SERVICE] you want more inquiries about.
It would show what’s included and why someone should choose your team, using your actual service details and proof.
Would you like to see one?

Step 1 B
{FIRST_NAME}, when customers compare quotes for [SERVICE], the price can overshadow what’s actually included.
I’d like to build {COMPANY} a finished service-page preview that makes those differences clear before they ask for a quote.
Would that be useful?

Step 2
The preview would focus on one service you want more work for, with the scope, relevant photos or customer proof, and a clear quote request.
Which service would you choose?

Step 3
You’d get a finished page preview and a short walkthrough showing how it presents the work, rather than a list of suggestions to implement yourself.
Want to see that for {COMPANY}?
```

**Twenty West · New contractor A/B, Arm A: video control** (Review copy). Audience: US residential contractors.
Subjects (both arms): `quick question` · `quotes in {CITY}` · `{COMPANY} estimates`
```
Step 1
{FIRST_NAME}, noticed you’re a {CONTRACTOR} in {CITY}.
How are you making sure homeowners don’t treat you like just another {CONTRACTOR} when they’re getting a few quotes?
I made a quick two-minute video showing why some contractors become the obvious choice while others get compared against every estimate.
Mind if I send it over?

Step 2
The video looks at what a homeowner sees when comparing your business with other quotes.
Want me to send it here?

Step 3
Is the way {COMPANY} presents itself to homeowners something you handle?
```

**Twenty West · Arm B: preferred-quote preview** (Proposal). One new offer vs the control; one opening.
```
Step 1
{FIRST_NAME}, noticed you’re a {CONTRACTOR} in {CITY}.
When homeowners compare quotes, I’d like to give them a clearer picture of what choosing {COMPANY} means.
I can put together a one-page preview showing your service, customer proof and next step in one place.
Would you like to see it?

Step 2
The preview would use what’s true about your work: what the job includes, relevant customer proof and how to move ahead.
It’s something you can review before deciding about a bigger project.
Want me to put one together?

Step 3
Would a clearer way to present {COMPANY} alongside other estimates be useful right now?
```

**Twenty West · Beauty top-up, preserve curiosity opener** (Review copy). Audience: net-new US skincare/haircare brands (no salons, clinics, resellers). Email 1 preserved exactly.
Subjects: `{KEYWORD}` · `{COMPANY} in ChatGPT` · `a shopping question`
```
Step 1
I asked ChatGPT for "{SEARCH}" and the first 2 brands that came up were {COMP}.
Didn't see you guys come up.
I spent a few minutes digging into why those {KEYWORD} were getting recommended and pulled together some notes for {COMPANY}.
Want me to send them over?

Step 2
The notes are about the specific answer to “{SEARCH}” and the brands it included.
One answer doesn’t tell the whole story, but it gives us something concrete to look at for {COMPANY}.
Want me to share the notes?

Step 3
I still have the notes from that shopping question ready to share.
Would they be useful to whoever handles search and customer acquisition at {COMPANY}?
```

**Twenty West · Home and garden, organic buyer-question preview** (Proposal). Offer: three evidenced content gaps + one comparison or buying-guide outline. A offer-led, B problem-led.
Subjects: `a buyer question` · `{COMPANY} product content` · `{PRODUCT_CATEGORY} comparisons`
```
Step 1 A
{FIRST_NAME}, I’d like to put together a content preview for {COMPANY} around “{BUYER_QUESTION}.”
It would cover three gaps in how your site answers that question, plus a product-comparison outline your team can review.
Would that be useful?

Step 1 B
{FIRST_NAME}, shoppers comparing {PRODUCT_CATEGORY} have questions that a product description may not answer on its own.
I’d like to review {COMPANY}’s content and put together three specific gaps plus a buying-guide outline around “{BUYER_QUESTION}.”
Want to see a preview?

Step 2
The outline would make the relevant product differences easier to understand, using the details already available about {COMPANY}’s range.
The goal is clearer content for shoppers and AI-assisted search.
Want me to put it together?

Step 3
Would a product-comparison outline around “{BUYER_QUESTION}” help with your content plans?
```

**Marketing Cartel · Schools, Arm A: one-month service trial** (Proposal). Audience: US for-profit adult vocational/trade/career schools.
Subjects: `{COMPANY} admissions marketing` · `one month of service` · `a school marketing idea`
```
Step 1 A
{FIRST_NAME}, we’d like to manage a Google Ads test for one of {COMPANY}’s programs for a month, with our management fee waived for up to $5,000 in services.
Your school covers the advertising spend.
Want to see a proposed scope?

Step 1 B
{FIRST_NAME}, if attracting inquiries for one program is a priority at {COMPANY}, we could test it with a focused Google Ads campaign.
We’d waive one month of management fees, up to $5,000 in services. Your school pays the ad spend.
Would you like to review the plan?

Step 2
Our ITI Technical College case study covers a broader SEO, website and Google Ads engagement. Organic traffic doubled within a year; that is not a result promised from this one-month ads test.
Want me to send the case study?

Step 3
The proposed test would focus on one program, with the budget, targeting and work agreed before it starts.
We’d waive the first month’s management fee, up to $5,000 in services; your school covers ad spend.
Would a scope for {COMPANY} be useful?
```

**Marketing Cartel · Schools, Arm B: website with paid hosting** (Proposal; mutually exclusive with Arm A).
Subjects: `a website option` · `{COMPANY} website` · `your admissions website`
```
Step 1 A
{FIRST_NAME}, would a new website help {COMPANY} present its programs and next steps for prospective students?
We’re proposing a website build with no build fee, under a paid hosting agreement. We’d share the scope and hosting terms before you decide.
Want the details?

Step 1 B
{FIRST_NAME}, we have a website offer that could be worth considering for {COMPANY}: no website build fee, with a paid hosting agreement required.
We’d agree the site scope and make the hosting costs and terms clear first.
Would you like to review it?

Step 2
The site scope would be agreed around your programs and admissions process. Paid hosting is required, so the price, term and ownership details would be part of the proposal.
Want me to send those details?

Step 3
If a website project is on your list, would you like to review the build scope and paid hosting terms for {COMPANY}?
```

**Marketing Cartel · Hair restoration / Luxury residential rehab, secondary service tests** (Proposal). Same text; `[UNIT]` = "hair-restoration service" / "residential program"; `[INQ]` = "consultation" / "admissions".
Subjects: `{COMPANY} marketing` · `one month of service` · `a consultation marketing idea` (hair) / `an admissions marketing idea` (rehab)
```
Step 1 A
{FIRST_NAME}, we’d like to manage a paid-search test for one [UNIT] at {COMPANY} for a month.
We’d waive the management fee, up to $5,000 in services. You cover the advertising spend.
Would you like to review a proposed scope?

Step 1 B
{FIRST_NAME}, if {COMPANY} is looking for more [INQ] inquiries, we could test paid search around one [UNIT].
We’d waive one month of management fees, up to $5,000 in services. Advertising spend remains yours.
Want to see what that test could cover?

Step 2
The proposed test would focus on one [UNIT], with the budget, targeting and work agreed first.
The fee waiver covers one month of management, up to $5,000 in services; it doesn’t cover ad spend.
Would a suggested scope help?

Step 3
Is reviewing marketing support for {COMPANY} part of your role?
```

**MJJ Brilliant · Manufacturing first, single-SKU production comparison** (Proposal). Audience: US real-volume jewelry brands, retailers, wholesale buyers.
Subjects: `one production SKU` · `{COMPANY} manufacturing` · `a production comparison`
```
Step 1 A
{FIRST_NAME}, would a second production option be useful for one of {COMPANY}’s jewelry SKUs?
MJJ Brilliant manufactures fine jewelry for brands and retailers. We can review the specs and volume at no charge, then discuss production fit, likely lead time and a rough price band.
Want to start with one SKU?

Step 1 B
{FIRST_NAME}, before moving any production, you could compare MJJ Brilliant on one jewelry SKU.
We’d review the specs and order volume at no charge to see whether we’re a fit, then discuss a rough price band and lead time.
Would that comparison be useful for {COMPANY}?

Step 2
The starting point would be the item’s specs, material and expected order volume. That gives us something concrete to assess before discussing a quote or production run.
Is there one SKU you’d want us to look at?

Step 3
Would having another production option for a future order be useful, even if you’re happy with your current manufacturer?
```

**MJJ Brilliant · Repairs second, overflow feasibility and pilot** (Proposal).
Subjects: `overflow jewelry repairs` · `{COMPANY} repair capacity` · `a small repair pilot`
```
Step 1 A
{FIRST_NAME}, if {COMPANY} ever needs extra repair capacity, MJJ Brilliant can review the job types and volume at no charge.
If there’s a fit, we can discuss rates and turnaround for a small, scoped overflow-repair pilot.
Would you like to explore that?

Step 1 B
{FIRST_NAME}, would a backup option for jewelry repairs be useful before you need it?
MJJ Brilliant can assess your typical repair mix and volume at no charge, then discuss a small paid pilot with agreed rates and turnaround.
Worth a look for {COMPANY}?

Step 2
We’d start with the types of repairs you handle and the volume you might send out. Any pilot work would have its own agreed scope, pricing and turnaround.
Want to check whether your repair mix is a fit?

Step 3
Is outside repair capacity something you handle for {COMPANY}?
```

**Collabor · Existing creators, assisted workflow preview** (Proposal). Audience: US/UK brands already running creator programs.
Subjects: `one creator campaign` · `{COMPANY} creator approvals` · `a workflow preview`
```
Step 1 A
{FIRST_NAME}, I’d like to show how one of {COMPANY}’s existing creator campaigns could work in Collabor.
We’d walk through the brief, drafts, feedback and approvals together, so you can see the process using work your team already knows.
Would that be useful?

Step 1 B
{FIRST_NAME}, when a creator sends a revised draft, how does your team keep track of the latest feedback?
I’d like to show one of {COMPANY}’s existing workflows in Collabor, with the brief, drafts and comments together.
Open to a walkthrough?

Step 2
The preview would follow one workflow your team already uses, from brief through approval. You’d be able to see where the draft and its feedback sit together.
Is there a campaign you’d want to use for that?

Step 3
Would seeing one familiar creator workflow in Collabor help you decide whether it fits your team?
```

**GMG / SCROll STOP · five verticals, minimal claim-safe review** (Review copy; no new test). `[SPACE]` = "mobile app" (Apps), "home" (Home), "consumer tech" (Consumer electronics), "beauty" (Beauty), "sports" (Sports). `[GOAL]` = "app installs" (Apps), "product interest" (Beauty), "sales" (Home, Consumer electronics, Sports).
Subjects (all five): `our creators` · `influencers` · `creators`
```
Step 1
Hi {FIRST_NAME}, I’ve got a few creators in the [SPACE] space and would like to see if they’re a good fit to promote {COMPANY}.
Worth a chat?

Step 2
Want me to send over two creators we’d consider first if the goal was [GOAL] for {COMPANY}?

Step 3
I reached out because we manage influencer campaigns and can explore which creators fit {COMPANY}.
Is creator marketing something you handle?
```

---
## 14. 119: Dulcy Campaigns (client portal review emails, Aug 2026; client Human Marketing)

Two "New Campaign Ready for Review" portal emails for **Human Marketing** with Google Doc comments. Campaigns: "[Human Marketing] Wellness & Beauty DTC - 30M Rev, Shopify - USA (Offer Validation)" and "[Human Marketing] Apparel & Footwear DTC - 30M Rev, Shopify - USA (Offer Validation)". Both lists showed "Number of Leads: 0".

Thesis text (verbatim, Wellness; Apparel identical except the niche): "Offer-validation campaign for US-based Shopify-native DTC wellness, beauty, and personal-care brands doing approximately 30M in annual revenue, with meaningful paid acquisition already running. Primary personas: Founder/CEO, CMO/VP Marketing/Head of Growth, and Head/Director of Ecommerce. Keep CFO out of the primary test so persona variation does not contaminate offer validation. Test nine cold-outbound variants: 3 service lead magnets, 3 risk-reversal/performance offers, and 3 low-friction mini-yes CTAs. Human proof and positioning should anchor around profitable growth, Profit Compass/contribution margin, CRO, and AI visibility/GEO. Exclude food & beverage, wholesale-first businesses, marketing/advertising agencies, existing Human clients, Open Doors, Gracebased Families, and Lightcatchers Podcast."
Lesson kept: keep one persona group fixed so the offer test is not contaminated.

Portal notice copy (client-facing): "👋 Please log in and click Approve or Deny. If no feedback is given, the campaign will auto-approve within 48 hours." (conflicts with RULES; see conflicts.) Sign-off: "Thanks, / Dulcy Team".

Email 1 subject: `{PRODUCT} question`

Email 1, Wellness & Beauty (5 variants; all share this opening):
```
{FIRST_NAME} -
How are you making sure the growth you're seeing is actually profitable growth?
ROAS can look great while the actual profit tells a different story, so you can spend more, grow revenue, and still make less money.
```
then:
- V1 (BAD as written, per comments): "Profit Compass shows your true contribution margin and break-even CAC across Shopify, Meta, and Google. / I ran {COMPANY} through it for free. / Mind if I send over what it found?"
- V2 (CAUTION, Scribe note: claims finished work): "One place profit gets lost is when traffic reaches the store but does not convert. / I pulled the 5 highest-priority fixes I would make on {COMPANY}'s store. / Mind if I send them over?"
- V3 (GOOD pattern: offers to show, claims nothing done): "Profit Compass shows where the platforms say you're winning but the actual margin says otherwise. / We can show you that gap before you spend another dollar trying to fix it. / Open to seeing it?"
- V4 (CAUTION: "fix them within 30 days" is a delivery promise; needs client approval): "If you're already getting traffic, the fastest profit opportunity may be converting more of it. / We can find the top 5 leaks, fix them within 30 days, and show you the before-and-after funnel movement. / Open to seeing the 5?"
- V5 (CAUTION: video must exist): "I took a look at {COMPANY} and recorded a short video showing the first places I would check if revenue is growing faster than profit. / Mind if I send it over?"

Email 1, Apparel & Footwear: same five variants, with the second line replaced by "A product can look like a winner in revenue and ROAS, but once you factor in margin, discounts, returns, and acquisition costs, you may be scaling something that makes a lot less money than you think." Other verbatim differences: V2 "One place that profit disappears is when you're paying to get shoppers to the store and too many leave before buying."; V3 "...before you put more money behind it."; V4 "If you're already paying to get shoppers to the store, getting more of them to buy can be one of the fastest ways to improve profitability. / We can find the top 5 leaks, fix them within 30 days, and show you what changed."; V5 "...if sales are growing faster than profit."

Email 2 (both; case-study follow-up, GOOD pattern):
```
{FIRST_NAME} -
For context, Softies came to Human Marketing with a product people already loved, but their site, acquisition, and lifecycle marketing weren’t working together.
Human Marketing rebuilt the system around profitable growth and helped increase revenue 88% and AOV 22%.
Different situation at {COMPANY}, obviously, but that’s the kind of problem we’re looking for here.
Worth sending over what I put together?
```
Email 3 (both; routing/breakup, GOOD pattern):
```
{FIRST_NAME} -
Wasn’t sure if this should go to you or somebody else at {COMPANY}.
Regardless, if the goal is to grow ecommerce revenue without finding out later that the extra sales weren’t actually profitable, that’s exactly what Human Marketing helps with.
Are you the right person for that, or should I speak to somebody else?
```
Email 4: blank. Comment: "[c]Missing copy" → "[d]There is no email 4 so blank on purpose!" (3-step sequence is intended.)

Critiques and fixes (Doc comments, verbatim):
- "[a]We can't run it before hand we need access to Shopify, Ads, etc" / "[e]We can't run Profit Compass without access to Shopify, so we need to change this. We can't run it beforehand."
- "[g]Not the profit compass itself. We can get on a call and get access, and then, from there, it takes a couple of business days to build out the profit compass instance."
- Fix agreed (Alex, "[h]"): "Okay, my idea is to lead with this is a benefit you can get and we can change to say we can build it out on the call. you get on the call get access and lead your call as normal but use the magnet as a bridge to get them on the call. afterwards you take the call and proceed with them from there. similar to us and our lead magnets." Client: "[i]Yeah, that sounds good!"
- Then: "[k]... If not, ill make the change, run the spintax and get us launched!" (spintax is applied after copy approval).
Lesson: a lead magnet that needs prospect access is offered as a benefit built on the call, never claimed as already run.

## 15. 123: Dulcy Reactivation Script Example (May 2026; Dulcy's own offer, sender Alex)

Verbatim (source = example of Dulcy's own outreach; Scribe note: CAUTION on current rules, see below):
```
Jen - when’s the last time you reached out to past customers to bring them back in? Saw you guys on Clutch and I’d love to run a reactivation campaign for you completely free to fill your calendar over the next month.

Any interest in discussing this further? Also no catch, just looking to stand out and introduce myself :-)

--
Warm wishes,
Alex Woung
Founder, Dulcy
dulcy(.)io

p.s. or tell me to pound sand if you'd like..
```
Patterns worth keeping: question hook about a neglected revenue source; real source of the observation ("Saw you guys on Clutch"); free done-for-you offer; "no catch" pre-empts the "why free" objection; P.S. that invites a no (matches RULES: "Opt-outs come by reply (the P.S. invites it)"); domain written as "dulcy(.)io" (no live link).
Against current rules: manual signature (RULES: "no manual signature"); "fill your calendar over the next month" is an outcome promise; emoticon (134: no emojis).

## 16. 129: Backup Andre Spintax Prompt (Jan 2026; n8n prompt, `{{ $json.* }}` are n8n expressions)

Prompt in full, verbatim (runs of blank lines collapsed to one):
```
You are an expert at crafting high-quality Spintax. Spintax (short for spin syntax) is a technique used to produce multiple unique variations of a text by inserting alternatives within placeholders. This is valuable when generating different versions of similar content while keeping it natural and engaging.

Keep in mind that underscores (_) don’t need to be escaped.

The format uses curly braces { } to hold different word or phrase options, separated by the pipe symbol |. When processed, one choice is picked from each set, creating a new variation every time.

For example:
“{Hello|Hi|Hey}, {friend|colleague|reader}! {How are you|Hope you’re well|What’s new} today?”

Possible outputs include:
Hello friend! How are you today?
Hi colleague! Hope you’re well today?
Hey reader! What’s new today?

Each option must work grammatically with the others so that all possible combinations are valid, not only the ones in order. Use no more than 4 alternatives per bracket.

Update the following emails using Spintax. If an email is empty, leave it as is:

Email {{ $json.name }}:
“”
{{ $json.value }}
“”
```
Hard rules: every combination must be grammatical ("not only the ones in order"); max 4 alternatives per bracket; empty emails stay empty. Missing from the prompt (add when used, per RULES): never spin variables like {FIRST_NAME}; no signature.

## 17. 130: [Dulcy] Cold Email Best Practices (as of 1/4/2026)

Copy rules (verbatim):
- "DONT’S: Use open tracking, as it will attach an invisible image to every single email that goes out, which has 100% chance of triggering spam filters.(HTML Code) / Include links in copy."
- "MUST DO’S: Use spintax. Every 2nd or third word/phrase must be spintaxed, especially the signature. (ex. {Hey|Hi|Hello})" Tools: "this GPT Spintax Generator and https://sp1n.me/index.html".
- Spam triggers: "Dollar signs ‘$’", "Essentially anything that references money.", "Use spam word checker to verify copy".
- Outlook: "Outlook has imposed extremely strict, AI spam filters." "It’s best to separate your lead lists and campaigns by ESP’s" (Outlook vs everything else; host lookup in EmailGuard, free).
- **All-Outlook campaigns**: "1 line MAX." "Ideally 25-30 words or less, 50 max." "Use as little spam words as possible." "Make the email sound as casual as possible, and as far from a “pitch” as possible."
- **Gmail or other**: "3-4 Lines MAX" · "<75 Words" · "Close to 0 spam words as possible" · "Make it sound casual".
- Lists: "ALWAYS verify your leads ... MillionVerifier"; "Only use “Good” leads . NEVER send to “Bad” or “Risky” leads."
Infra (not copy; history): warm-up 5/day, ramp 2, reply rate 30%; 10–15 cold emails/day per inbox, start at 5; "61 minute time gap"; warm up 14 days to 4 weeks.

## 18. 134: Prompt to write cold email copy (Dec 2025)

Prompt in full, verbatim (`[PASTE CONTEXT]` = the research/brief; runs of blank lines collapsed to one):
```
Role & Objective

You are an expert B2B copywriter specializing in high-converting cold email scripts for enterprise outbound campaigns. Using the research data provided, generate systematic, persona-targeted cold email variations that follow the rules below.

Research Foundation

[PASTE CONTEXT]

Source priority (in order):
Primary: Direct client feedback & onboarding data
Secondary: Call transcripts & stated objectives
Supporting: Market research & competitive analysis
Scriptwriting Fundamentals (Non-Negotiables)
Offer is everything. Anchor each angle in a concrete, valuable front-end offer or lead magnet (audit, playbook, calculator, teardown, benchmark, quick win, etc.).

Tone: Short, conversational, professional—not slangy or too casual.

Zero fluff. Every sentence must earn its place and advance relevance or value.

Length cap: Each email must be < 70 words (target 30 / 45 / 60 word bands).s

Hyper-relevance: Messaging, pains, and outcomes must be tailored to the exact persona and industry context.

Soft/value CTA only: Question-based CTAs that invite low-friction next steps (e.g., “Worth a quick look?”).

Front-end value first: Ideally propose a lead magnet/front-end offer before selling core services to open the door.

Social proof: If used, it must be hyper-relevant to the persona/vertical (same role, similar company size, adjacent tech stack, or near-neighbor use case).
Pain points: Only mention pains that are persona-true and likely active; avoid generic boilerplate.

Value props & offers: Make them hyper-specific (metrics, timelines, constraints, integration realities).

Brevity vs clarity: Do not sacrifice clarity for shortness.

If ~30 words, it should be primarily a single sharp question with one line of context.

If >30 words, apply the fundamentals above and keep flow natural (no choppy “telegram” style).

Output Rules

1) Subject Line Rules
Always 1–3 words.
Provide exactly 3 variations in spintext format: {Option1|Option2|Option3}.
Variations must include one 1-word, one 2-word, one 3-word line.
No punctuation. Curiosity- or benefit-driven.

2) Script Length & Complexity Variations
If 1 persona provided → produce 6 variations for that persona:
Lengths: ~30 words, ~45 words, ~60 words
For each length, write 3 complexity tiers:
Simple: Clear, plain-English, universally understandable
Niche-aware: Uses light industry knowledge/lexicon
Hyper-specific: Deeply tailored to the persona’s unique challenges, KPIs, constraints
If 2–3 personas provided → 3 variations per persona (mix lengths/complexities).
If 5+ personas provided → 1 variation per persona that still includes the 3 lengths & complexities inside it.

3) Structural Elements (include at least 3 per script)
Choose whichever fit the angle best:
Personalized Hook (8–12 words)
Social Proof Bridge (15–20 words)
Value Proposition (10–15 words)
Front-End Offer (8–12 words)
Soft CTA (5–8 words; question-based, never a hard call ask)

4) Script Priorities
Focus each variation on either:
A pain-qualified segment (PQS from context), or
A strong, differentiated value proposition the persona cares about.
CTAs remain soft: e.g., “Would it make sense to...”, “Open to exploring…”, “Worth a peek?”

5) Personalization Ideas Section (after all scripts)
Provide a bullet list of personalization ideas with an example for every idea. If you can’t give an example, don’t include the idea.
Format examples:
Use {{recent_news}}: Reference their new funding round.
Example: “Saw {{company_name}} just closed a $40M Series B—congrats on the momentum.”
Use {{tech_stack}}: Show additive fit with their tools.
Example: “Looks like you’re running HubSpot—our workflow plugs in without new training.”
Use {{hiring_signal}}: Tie to open roles.
Example: “Hiring 3 SDRs suggests pipeline goals—want the 2-page ramp blueprint we give new teams?”
Use {{competitor_touch}}: Neighbor proof without namedropping.
Example: “Teams like {{peer_company}} cut reply time 37% with the same playbook.”

6) Reasoning Summary (2–4 sentences)
Explain:
Why you chose the angles, complexity tiers, and lengths
How each aligns with the persona’s likely pains or goals from the research

7) Output Format for Each Script
Script Metadata
Persona: [SPECIFIC_ROLE]
Industry: [SPECIFIC_SECTOR]
Pain Point: [PRIMARY_CHALLENGE]
Complexity: [Simple / Niche-Aware / Hyper-Specific]
Length: [Approx. word count]
Subject Line (spintext): {OneWord|Two Words|Three Word Line}
Email Body (use {{variables}} as needed):
Keep under 70 words.
Include at least 3 structural elements (above).
Use soft, question-based CTA.
If ~30 words, prefer a single sharp question + 1 line context.
Word Count: [number]
Clay Variables Needed (list):
{{first_name}}, {{company_name}}, {{persona_role}}, {{industry}}, {{recent_news}}, {{tech_stack}}, {{primary_kpi}}, {{core_system}}, {{peer_company}}, {{pqs_trigger}} (include only those actually used).

8) Quality Standards & Guardrails
25–69 words per script (strict).
All {{variables}} must be valid, consistently named, and Clay-merge-safe.
Use plain language; avoid jargon unless in Hyper-specific tier where it improves trust.
Each variation must feel meaningfully different (not light rewrites).
No emojis. No punctuation in subject lines.
Proof rigor: Social proof must be adjacent (same role/region/size/stack). Pains must be current and role-true.
Offer clarity: Front-end offers must be specific (format + outcome + time requirement).
Brevity/clarity rule: If a short line feels stilted or vague, do not ship it—choose the 45- or 60-word band for natural flow.
Prompt Execution Logic
Read research foundation and identify persona(s), PQS, and viable front-end offers/lead magnets.
Generate subject lines first (spintext, 1–3 words; 3 variants).
For each persona, produce the required length × complexity matrix.
Enforce fundamentals, structural elements, and guardrails per script.
Append Personalization Ideas (with examples only).
Conclude with the Reasoning Summary.
Soft CTA Examples (use/iterate as needed)
“Worth a 2-minute look if I send it?”
“Open to a quick benchmark to compare against peers?”
“Want the 1-pager—no pitch, just the framework?”

“Should I send the teardown for {{system_or_process}}?”
“Would a 5-minute audit help pressure-test this?”
Front-End Offer Starters (choose one if relevant)
“[Audit] 5-point deliverability audit for {{company_name}} (24 hrs)”
“[Playbook] 2-page {{persona_role}} outreach sequence (ready to paste)”
“[Calculator] ROI model using your {{primary_kpi}} inputs”
“[Teardown] Loom review of {{process/tool}} with prioritized fixes”
“[Benchmark] Peer comparison using {{industry}} data (3 charts)”
```
Scribe notes on using it today: the personalization examples ("$40M Series B", "37%") and offer starters ("(24 hrs)") are illustrations; never ship them as facts or promises. Its matrix of 6-9 variants per persona predates the RULES "2 angles of Email 1" rule. Internal inconsistency: "6 variations" vs 3 lengths × 3 tiers = 9.

## 19. Campaign Builder Acceptance Specification (legacy Jarvis; copy-related parts only)

Little copy content. What applies:
- Strategy is a named campaign field: examples "Lead Magnet" and "Direct Offer" (same names as the 093/094 approaches). The operator says it in plain words ("lead magnet"; "Use a direct offer instead.").
- Changing strategy invalidates approvals: "Campaign requirements and plan are re-versioned. / Strategy approval is invalidated. / Workflow returns to planning/review." (So copy written for an old strategy is stale once the strategy changes.)
- "Requirements changes invalidate only dependent artifacts." Copy depends on ICP and strategy.
- "The suite must not execute contact generation, LeadMagic, MillionVerifier, copy generation, EmailBison changes, or paid live provider actions." (Copy generation sits after the approved company list and contacts.)
- Fixture client "Acme Growth" (B2B event-marketing agencies) is test data, not a real client.

---
## Cross-doc conflicts (RULES.md wins; "UNKNOWN" = ask Alex once, then log)

1. **Spintax in the copy.** 011: "always use Spintax and personalization"; 130: "Every 2nd or third word/phrase must be spintaxed, especially the signature." vs RULES: "Copy: no spintax in client-facing text, no manual signature. Do not spin variables like {FIRST_NAME}." and 118: "No spintax or manually added sender signatures are included." → Review copy is clean. Spintax is a later step on the send version (119: "make the change, run the spintax and get us launched"; RULES 2026-11-24 chain "copy, spintax, build"), never on variables, never on a signature.
2. **Signatures.** 130 ("especially the signature"), 123 ("Warm wishes, / Alex Woung / Founder, Dulcy"), 119 ("Thanks, / Dulcy Team") vs RULES "no manual signature" and 118 "Removed ... signatures". → No signature in copy.
3. **Email length.** 011: "Short Scripts <50 Words" vs 134: "Each email must be < 70 words" / "25–69 words per script (strict)" vs 130: Gmail "<75 Words", "3-4 Lines MAX"; Outlook "1 line MAX", "Ideally 25-30 words or less, 50 max". RULES silent → UNKNOWN which cap wins; safe default: Email 1 under 50 words, all-Outlook lists 1 line.
4. **CTA strength.** 011: "Email 1: Hardest CTA" and "Make them feel stupid for saying no" vs 134: "Soft/value CTA only ... never a hard call ask" vs RULES: "a call can be asked for, but not in the cold sequence unless it is the only logical next step. Default to a low-friction ask that needs a one-word reply." 118 ChopShop uses "Open to a quick call to pick a clip for your sample?" because the client asked "meetings first". → RULES.
5. **Proof in every email.** RULES: "at least 1 strong proof per email ... (no filler proof)" vs 011: "Optional Social Proof (If applicable)", 134: "Social proof: If used", and 118 emails with no proof (Dulcy Step 1; Robotics: "No robotics-specific results are available"; Lead Flo: "No numeric customer proof used"; Collabor; GMG). → RULES going forward; when no strong proof exists, flag it to Atlas instead of adding weak proof.
6. **What to test.** RULES: "2 angles of Email 1 that test something that makes a real difference ... Never trivial word swaps." vs 011 subject test "“Quick question” vs. “Our Outbound”", 015 demo-wording test ("Would you be open to a 5m demo?" / "Up for a short demo?"), 134 (6–9 variations per persona), 119 ("Test nine cold-outbound variants"). → RULES (118 already follows it).
7. **Bounce threshold.** 011: "Bounce Rate: Should be below 2.5%"; 015: above 2.5% = review vs RULES: over 2.5% = watch, over 4% = pause. → RULES (already logged 2026-11-17).
8. **Money in copy.** 130: "Dollar signs ‘$’ / Essentially anything that references money" trigger spam vs 118 copy "$25,000 in monthly recurring revenue", "up to $5,000 in services", 011 "$40K per month". → UNKNOWN; run EmailGuard on the exact copy; ask Alex whether to write amounts without "$".
9. **The word "free".** 011 lists "“free,” “guarantee,” “money,” “urgent,” “act now”" as flagged spam words vs Dulcy's core offer "a free list of 1,000 potential clients" (118), "1,000 free leads" (084, 011). → Keep the offer; check placement with EmailGuard; "at no charge" is the 118 alternative.
10. **Subject line format.** 134: "Always 1–3 words ... No punctuation" vs 011 `{Quick one {FIRST_NAME}?|Thoughts on this?|What happened?|Hey {FIRST_NAME}, real quick}`, 015 "“Should we chat, {{First Name}}?”", 118 "1,000 contacts for {{company}}", "event rentals in {CITY}?". → UNKNOWN; 118 (newest real review) uses short lowercase 2–5 word subjects.
11. **Personalization that asserts facts.** 011: "Always mention something specific about the recipient"; 015 GOOD example "I noticed you’re still manually screening hundreds of candidates"; 092 invented purchase stories; 094 "why {COMPANY} isn’t running outbound right now?" vs 118: "Remove the unverified “I saw your work” observation", "No buyer supplier problems assumed", and CLAUDE.md "Never invent". → Only verified observations; otherwise ask a question.
12. **Claiming finished work.** 093 "I made you a {resource}"; 119 "I ran {COMPANY} through it for free." and "I pulled the 5 highest-priority fixes"; 089/092 "made a short video" vs 118: "A completed asset, actual query or real shortlist must exist wherever the email says it does." and 119 comment "We can't run it before hand". → Claim only what exists; else offer to build it (on the call if access is needed).
13. **Numbers and promises in templates.** 011 "increase conversion rates by 42%", "A quick fix could add 15% more revenue"; 092 "increase sales by 20% in just two months"; 134 "(24 hrs)", "cut reply time 37%"; 119 V4 "fix them within 30 days"; 123 "fill your calendar over the next month" vs CLAUDE.md "Never invent client proof, results, prices or promises" and 118 "Do not invent a turnaround." → Illustrations only.
14. **Guarantees.** 090: "P.S. If we don’t hit {result} in {timeframe}, {guarantee}" vs 118: "Existing guarantees need metric, baseline, duration and approved terms before reuse." → Only a client-approved guarantee, stated exactly.
15. **Client approval of copy.** 119 portal: "If no feedback is given, the campaign will auto-approve within 48 hours." vs RULES 2026-11-25: "Then the client approves the copy, and only then does it launch." → RULES; silence is not approval.
16. **Channels Dulcy can claim.** 084: "we integrate multi-channel outreach, including LinkedIn and phone calls" vs CLAUDE.md: "Right now only cold email works. LinkedIn and direct mail need system fixes." → Do not claim multi-channel in Dulcy copy.
17. **Client counts and "many clients".** 084: "A lot of our [INDUSTRY] clients", "Many small businesses"; 118: "26 review units across nine clients" vs CLAUDE.md: "Clients: 6, plus Dulcy itself ... Do NOT state any larger client count." → Never state or imply a count.
18. **Trials vs free samples.** 084: "We don’t offer trials" vs Dulcy's free 1,000-contact list ("a sample of Dulcy’s list-building work", 118) and 123's "reactivation campaign for you completely free". → UNKNOWN how to phrase if a prospect asks; ask Alex.
19. **Booking ask.** 084: "would Monday at 10 AM EST work for you?" (one time) vs RULES: "offer two specific dated times, no calendar link". → RULES (Echo's area).
20. **P.S. line.** RULES 2026-11-23: "Opt-outs come by reply (the P.S. invites it)" and 123 "p.s. or tell me to pound sand if you'd like.." vs 118 GMG: "removing signatures/PS". → RULES allow an opt-out P.S.; UNKNOWN whether every sequence must carry one; ask Alex.
21. **Days between steps.** 011: Step 1 → "2 days+" → Step 2 → "3 days+" → Step 3 vs RULES: "Days between emails: default 2, editable per campaign." → RULES. (Sequence length agrees: 3 steps now; 011/084 "3-4" max; 119 "There is no email 4".)
22. **Open tracking.** 015: "Open Rate (if tracking is enabled)" vs 130: open tracking "has 100% chance of triggering spam filters". → 130 (newer); never rely on opens to judge subjects.
23. **Placeholder syntax.** `{FIRST_NAME}` (011, 118), `{{first_name}}` (118, 106), `{FirstName}` / `{firstName}` (089, 090, 092), 134 "{{variables}} ... Clay-merge-safe"; 011 nests a variable inside spintax. vs RULES: "Do not spin variables" and "Build Campaign also stops if a {variable} in the copy is empty". → Use the engine's field names; exact syntax the engine expects = UNKNOWN (check Build Campaign before writing).
24. **134 internal.** "If 1 persona provided → produce 6 variations" vs "Lengths: ~30, ~45, ~60 ... For each length, write 3 complexity tiers" (= 9). → Moot under RULES (2 angles).
25. **Account health / thesis tool (not copy).** 015: below 60% health "set the sending to 1 per day" vs RULES: limit 0 for 1 week, then retest. 106: thesis "in Atlassian" vs CLAUDE.md: Airtable is the operating system. → RULES / CLAUDE.md.

**Conflicts count: 25.**

## Client-specific facts (never reuse for another client)

- **Dulcy (own campaigns):** Digital Force (a social-media agency) "$25,000 MRR added in 21 days", from Dulcy's official site Client Interviews, checked Oct 8, 2026; use only as broader agency-outbound proof, not for the free list, not AEO/GEO-specific. Offers: free list of 1,000 ICP-matched prospect contacts (names, emails, companies, LinkedIn); 10-account map for robotics vendors; free reactivation campaign (123, May 2026). Omitted claim: "dozen agencies / 20+ opportunities" (unverified). 011 example lookalike "Customink" and prospect "Zack"; 123 prospect "Jen" (via Clutch). 084 claims (two-year infrastructure, triple validation, GDPR, 2,000+ daily, daily updates, results in 1–2 months, no minimum commitment) are unverified. Older campaigns named: "PPC Agency Campaigns", Roofers/HVAC (copy images UNKNOWN). Sender in 123: Alex Woung, Founder.
- **VisionairAI (015, 2023):** AI recruiter software; niche found = recruiting firms. Original script claim: Johnson Group cut outbound team "from 18 to just 2, while still scheduling 25-50 meetings per week". Results: 17.51% then 24.04% interested reply rate; 11 positive replies in 24 hours; "37%+ increase in response rates". Prospect example: Ryan, VP of Marketing & Sales Operations, Temp Experts. "cut hiring time by 40%" is a suggested line, not a result.
- **Human Marketing (118, 119):** Thompson Tee case = SEO/content strategy and ad creative/paid-media capability only, no numbers. Softies: "increase revenue 88% and AOV 22%" (site, acquisition, lifecycle rebuilt around profitable growth). Profit Compass (contribution margin, break-even CAC across Shopify, Meta, Google) needs Shopify/ads access and "a couple of business days" to build; cannot be run before a call. Offers: AI product discovery service; two finished Meta ads for one product, free to keep. Audiences: US Shopify own-brand $1M–$100M ($5M–$30M core); 119 tests ~30M DTC wellness/beauty and apparel/footwear. Exclusions: food & beverage, wholesale-first, marketing/advertising agencies, existing Human clients, Open Doors, Gracebased Families, Lightcatchers Podcast. Keep AEO and Meta company allocations separate.
- **ChopShop (118):** contact Billy. TONAL 2021 Black Friday: "200+ video variations and 100+ GIFs in less than three days" (Oct 2021; capacity proof only, no turnaround promise). Offer: free personalized sample edit from existing footage, qualified prospects; meetings first; no pre-call resources (Billy Oct 6 call, Oct 7 email).
- **Lead Flo (118):** contact Patrick. Five free rental leads only in confirmed Southern California service areas. Archived "12-company claim" unverified. National service-page preview (event rentals, HVAC, tree/landscaping) is a proposal; no free ad spend, national free leads or guaranteed inquiries.
- **Twenty West / TWM (118):** residential contractors: two-minute preferred-quote video (control) vs one-page preview (proposal). Beauty top-up: ChatGPT query curiosity opener (needs real dated query, two brands, notes). Home and garden: three content gaps + buying-guide outline. Removed: "100+ contractors", "3,000-lead", "65% statistic". RULES: some threads "Client Handling".
- **Marketing Cartel (118):** contact Wilbur. ITI Technical College: "Organic traffic doubled within one year" from a broader SEO, website and Google Ads engagement (not admissions/revenue), source checked Oct 8, 2026. Offers: one-month Google Ads/paid-search management fee waived "up to $5,000 in services", prospect pays ad spend; website with no build fee under a required paid hosting agreement. Niches: for-profit vocational schools (first), hair restoration, luxury residential rehab (secondary; regulated).
- **MJJ Brilliant (118):** contact Jason (sender identity approved Oct 7 call). Fine jewelry manufacturer for brands/retailers, Long Island City base, no quantified case studies. Manufacturing first (free single-SKU feasibility review: fit, lead time, rough price band); repairs second (free overflow feasibility, then paid pilot). Not a care-plan or Reshyne SaaS campaign.
- **Collabor (118):** contact Jordan. Creator workflow platform (brief, drafts, feedback, approvals); no quantified results, no database-size claim. Proposal: assisted preview of one existing creator workflow; separate discovery campaign stays.
- **GMG / SCROll STOP (118):** Jordan to confirm two real creators. Verticals: apps, home, consumer electronics, beauty, sports; offer = creator fit + two-creator shortlist. Archived, unverified claims: Match Masters "millions of installs"; eufy / Anker-eufy "33,000+ tracked sales"; Glaze Hair "33,000+ clicks"; Castore "just under 40k in sales, unit/currency unclear".
- **Others named:** VizImpact (left onboarding fields blank) and Snowball (complete onboarding; "Snowball – Real Estate Agents – Direct Mail Expansion") in 106; "Acme Growth" is a test fixture only; "Jack's Apparel" (092) is fictional.

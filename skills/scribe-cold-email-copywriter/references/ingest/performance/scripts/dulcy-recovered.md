# Recovered Dulcy campaigns (copy rebuilt from Airtable reply threads)

Per-client facts: NEVER reuse for another client. *Facts, proof and numbers in these scripts belong to Dulcy only.*

Recovered 2026-11-25, read-only, from the Airtable Emails table (base appxqINt5XKw7a76A, Workspace ID (Bison) = 2, all time). These are the Dulcy campaigns that `dulcy.md` lists under "campaigns with sends but no stored copy": EmailBison deleted them, so their sequences exist nowhere else. Nothing in Airtable or EmailBison was changed.

**How the copy was rebuilt.** Each reply thread stores the full conversation. The email shown for a thread is the earliest Dulcy message quoted in it, i.e. the cold email (or follow-up step) the prospect actually replied to. Prospect names and companies are replaced with placeholders; tracking links, phone numbers and email addresses are removed; the prospect's own signature and disclaimers are cut. Sender signatures are kept as Alex sent them.

**Read the numbers carefully.**
- *Threads* = reply threads in Airtable where the quoted copy was recovered. *Positive* = Lead Status Interested / Meeting Request / Info Request. *Booked* = current Pipeline Stage Booked Meeting, Completed Meeting or Closed Deal (a meeting that later moved to Lost is not counted, so booked is a floor).
- These are reply counts, not sends. Per-variant send counts died with the EmailBison campaigns, so compare variants **within one campaign**, and compare campaigns by *per 1,000 sent* (sent = EmailBison total from `dulcy.md`).
- Before about July 2025 the Emails table mostly logged only positive replies (e.g. APPC E53: 146 positive of 207 rows), so "positive share of threads" is not comparable across eras.
- Each block is one resolved send of the spintax. "Wording variants" = how many different resolved texts were seen for that block; only one is shown. Distinct copy angles are kept as separate blocks.
- Step labels are inferred from the text ("I reached out a couple of days ago..." = follow-up). Subjects are the thread subjects, normalised; a follow-up often started its own thread ("quick question", "{FIRST_NAME}?").

Placeholders: `{FIRST_NAME}`, `{COMPANY}` (the prospect's agency), `{CASESTUDY}` (a client the prospect lists on Clutch/site, same variable name as in `dulcy.md`), `{COLLEAGUE}` (a second contact at the prospect), `{LOCAL_RESTAURANT}`, `{SITE_OBSERVATION}`, `{COMPANY_DESCRIPTION}`, `{SAMPLE_CONTACT_NAME}/{SAMPLE_COMPANY}/{TITLE}` (third-party contacts Dulcy pasted as samples; removed), `{SECOND_SENDER_NAME}` (a non-Alex sender name used in two April 2025 campaigns).

## Claims in this copy that are NOT approved (do not reuse without Alex)
Dulcy ran these, but none is in the approved proof list in `clients/dulcy.md` section 4. Several reuse other clients' results:
- "20+ sales opportunities per month" (2026 omnichannel blocks). Same claim family as the unverified "average 20+".
- "helped one of our clients generate $180K in new business" (lead-magnet follow-up, Nov 2025 to Jan 2026).
- "Slogan Social 80 interested prospects in month one" and "a company from $10k to $68k monthly" (2026). Slogan Social is a past client; its result is not approved as Dulcy proof.
- "Scroll Stop and Slogan Social generate 200+ interested inquiries" (Clutch SSM) and "Awing Visual Studios and Josubu Productions book 70+ meetings in 30 days" (Clutch Video). Unverified, other clients' results.
- "assisting agencies like TwoTreesPPC and TargetonStar" (early 2025): names past clients as references.
- "Digital Force generate $25K MRR in 1 month" (Apr 2025). Approved wording is "$25,000 MRR added in 21 days".
- "we helped Visionair AI add $430K in pipeline last month" (Funded SaaS). Approved is "$30,000 MRR added in 4 weeks".
- "three competing lenders have increased their loan volume by 57% this year" (Business Loans). No source.
- "We have a B2B database with 500M email leads" (Dec 2024 to Feb 2025) and "helping dozens of marketing agencies".

## Coverage of the 32 deleted campaigns

- **Covered: 31 of 32.** Every one of them had reply threads with the cold email quoted.
- **Still missing: 1.** EB 34 · [Dulcy] 3 Outbound Ideas (Other) · 1,197 sent · 1 interested: no thread for it exists in the Emails table, so its copy stays UNKNOWN (its sister campaign "3 Outbound Ideas (Google)" is below).
- **Extra found:** "Copy of [DULCY] MISS G550" (16 threads, Jul 2025) is not in the 32 list or in any scripts file. Its copy is the MISS G550 one-liner.
- **Already in the scripts files?** None of the 32 has stored copy. Two overlaps to know: (1) `dulcy.md` stores EB 377 under the same name as deleted EB 367 "[Dulcy] Broad Agencies ... (Direct Offer)", and its stored spintax covers the omnichannel blocks recovered here. Airtable rows carry the name only, so they were split by the date of the quoted email: threads quoting an email before 2026-03-02 count as EB 377 and are left out of the blocks (the campaign line still counts all 347). (2) Several blocks below were reused in campaigns whose copy *is* stored: the lookalike one-liner, "I reached out ... about building" bump and "Wasn't sure ..." referral are in "Clutch PPC (CheapInboxes)" and "Other Marketing Agencies (Lead Magnet)"; "verified prospects + video" and "meeting generation system" are in "GoodFirms (Lead Magnet w/ NO Thread)"; "on the house" is in the November 2026 Clutch and Agency Vista campaigns. They are listed here once per campaign because the counts belong to these campaigns.

## Summary, best first (booked meetings, then positive replies)

| # | Campaign | EB id | Created | Sent | EB interested | Threads | Positive | Booked | Booked /1k sent | Copy dates (quoted emails) |
|---:|---|---:|---|---:|---:|---:|---:|---:|---:|---|
| 1 | [DULCY] APPC E53 | 117 | 2025-04-21 | 53,390 | 146 | 207 | 146 | 39 | 0.73 | 2025-04-21 to 2025-05-27 |
| 2 | [DULCY] MISS G550 | 175 | 2025-07-01 | 61,468 | 148 | 478 | 135 | 33 (1 closed deal) | 0.54 | 2025-07-01 to 2025-07-22 |
| 3 | [DULCY] CPPC G63 | 53 | 2025-01-28 | 15,912 | 71 | 66 | 58 | 19 | 1.19 | 2025-01-28 to 2025-03-07 |
| 4 | Copy of [DULCY] GF + AV PPC Leads | 103 | 2025-03-28 | 56,480 | 88 | 116 | 84 | 14 | 0.25 | 2025-04-02 to 2025-07-11 |
| 5 | [Dulcy] Clay Marketing Agencies Direct Offer (NC) | 284 | 2025-11-14 | 30,422 | 41 | 507 | 43 | 11 (1 closed deal) | 0.36 | 2025-11-14 to 2025-12-12 |
| 6 | [DULCY] Advertising Agencies (Leads) | 178 | 2025-08-20 | 28,961 | 41 | 386 | 38 | 11 | 0.38 | 2025-08-20 to 2025-09-03 |
| 7 | [Dulcy] Clutch Free Leads (Google) | 38 | 2025-01-18 | 4,833 | 25 | 20 | 20 | 11 | 2.28 | 2024-12-16 to 2025-01-03 |
| 8 | [Dulcy] Agency Vista Direct Offer | 280 | 2025-11-14 | 33,634 | 32 | 815 | 39 | 10 | 0.30 | 2025-11-24 to 2026-01-02 |
| 9 | [Dulcy] Broad Agencies - 7-75 empl, USA/UK/CA - A-Leads (Direct Offer) | 367 | 2026-03-05 | 48,481 | 47 | 347 | 40 | 7 | 0.14 | 2026-03-04 to 2026-03-18 |
| 10 | [DULCY] Apollo Agencies US/UK/CA | 243 | 2025-10-06 | 51,593 | 26 | 425 | 30 | 7 | 0.14 | 2025-10-06 to 2025-10-22 |
| 11 | Copy of [Dulcy] Clay Marketing Agencies Direct Offer (NC) | 340 | 2025-12-30 | 28,494 | 27 | 467 | 29 | 6 | 0.21 | 2025-12-30 to 2026-01-19 |
| 12 | [DULCY] Advertising Agencies (Campaign) | 214 | 2025-08-21 | 29,045 | 23 | 349 | 29 | 6 | 0.21 | 2025-08-21 to 2025-09-09 |
| 13 | [Dulcy] 3 Outbound Ideas (Google) | 22 | 2025-01-18 | 4,577 | 14 | 10 | 10 | 5 | 1.09 | 2024-12-03 to 2024-12-19 |
| 14 | Copy of [DULCY] Clutch PPC Leads | 104 | 2025-03-28 | 7,615 | 24 | 28 | 23 | 4 | 0.53 | 2025-03-28 to 2025-04-21 |
| 15 | [DULCY] GFPPC Hyper C63S | 54 | 2025-01-29 | 2,983 | 11 | 10 | 10 | 4 | 1.34 | 2025-01-29 to 2025-02-07 |
| 16 | [DULCY] Business Loans Leads | 66 | 2025-03-27 | 4,322 | 7 | 7 | 7 | 4 | 0.93 | 2025-03-27 to 2025-04-05 |
| 17 | [DULCY] Funded Saas CE | 69 | 2025-03-28 | 6,617 | 9 | 11 | 9 | 3 | 0.45 | 2025-03-28 to 2025-04-04 |
| 18 | [Dulcy] 500 Leads (Google) | 39 | 2025-01-18 | 5,486 | 31 | 28 | 26 | 2 | 0.36 | 2024-12-25 to 2025-02-11 |
| 19 | Copy of [DULCY] Clutch PPC CE | 102 | 2025-03-28 | 7,685 | 11 | 14 | 12 | 2 | 0.26 | 2025-04-04 to 2025-04-21 |
| 20 | [Dulcy] Content Agencies - 5-75 empl, USA/UK/CA - A-Leads (OV- Loom, Direct, Lead Magnet) | 370 | 2026-01-27 | 7,032 | 10 | 98 | 10 | 2 | 0.28 | 2026-01-27 to 2026-02-04 |
| 21 | [Dulcy] Influencer Marketing Agencies, 5-50, USA - A-leads (DIRECT) | 337 | 2025-12-31 | 1,616 | 2 | 76 | 2 | 2 | 1.24 | 2026-01-02 to 2026-01-20 |
| 22 | [Dulcy] Digital Marketing Agencies, 5-75 Employ, USA/UK/CA, Clutch [Lead Magnet] | 445 | 2026-04-24 | 16,644 | 14 | 268 | 14 | 1 | 0.06 | 2026-04-23 to 2026-05-01 |
| 23 | [Dulcy] Influencer Marketing Agencies, 5-50, USA - A-leads (LEAD MAGNET) | 341 | 2025-12-31 | 4,684 | 8 | 113 | 13 | 1 | 0.21 | 2025-12-31 to 2026-01-14 |
| 24 | [Dulcy] Clutch SSM Agencies Direct Offer | 278 | 2025-11-12 | 8,696 | 9 | 99 | 8 | 1 | 0.11 | 2025-11-19 to 2025-12-08 |
| 25 | Copy of [DULCY] MISS G550 | not in list |  |  |  | 16 | 6 | 1 | n/a | 2025-07-01 to 2025-07-01 |
| 26 | Copy of [Dulcy] Clutch Video Production Agencies Direct Offer | 306 | 2025-11-29 | 5,921 | 4 | 104 | 5 | 1 | 0.17 | 2025-12-01 to 2025-12-24 |
| 27 | [DULCY] Business Loans CE | 67 | 2025-03-27 | 4,078 | 5 | 9 | 5 | 1 | 0.25 | 2025-03-27 to 2025-04-14 |
| 28 | [Dulcy] Clay Marketing Agencies Direct Offer | 275 | 2025-11-12 | 1,495 | 2 | 20 | 2 | 1 | 0.67 | 2025-11-11 to 2025-11-12 |
| 29 | [Dulcy] Digital Marketing Agencies - 5-75 empl, USA/UK/CA - GoodFirms (Lead Magnet w/Thread) | 372 | 2026-01-27 | 12,872 | 7 | 69 | 7 | 0 | 0.00 | 2026-01-27 to 2026-02-11 |
| 30 | [Dulcy] Clutch PPC - 7-75 empl, USA/UK/CA (Milkbox) - A-Leads (Lead Magnet) | 359 | 2026-01-27 | 6,011 | 2 | 49 | 2 | 0 | 0.00 | 2026-01-29 to 2026-02-09 |
| 31 | [DULCY] SaaS Companies US/UK/CA | 257 | 2025-11-13 | 6,112 | 1 | 37 | 1 | 0 | 0.00 | 2025-11-18 to 2025-12-03 |
| 32 | [Dulcy] Clutch Video Production Agencies Direct Offer | 279 | 2025-11-12 | 2,817 | 1 | 34 | 1 | 0 | 0.00 | 2025-11-14 to 2025-11-24 |

## What stands out (numbers from the table above and the blocks below)

1. **The lookalike one-liner booked the most meetings.** "{FIRST_NAME} - could I send over 1,000 ideal customer leads similar to {CASESTUDY} (full name, email, company name, linkedin, etc.) for you to use in any outbound marketing efforts? It's at no cost to you." with the P.S. "or tell me to pound sand if you'd like..": 427 threads with copy, 269 positive, 76 booked across 10 campaigns. It is the first touch of the four campaigns with the most booked meetings (APPC E53, MISS G550, CPPC G63, GF + AV PPC Leads). Subjects rotated `similar to {CASESTUDY}` / `Leads similar to {CASESTUDY}?` / `More clients like {CASESTUDY}?`; when the case-study variable was empty it fell back to "your ideal clients".
2. **Best booked rate per send: the Dec 2024 Clutch portfolio opener.** "[Dulcy] Clutch Free Leads (Google)": 11 booked from 4,833 sent (2.28 per 1,000), 8 of them from "I was on Clutch and saw you helped {CASESTUDY} in their marketing efforts.. Would it be fine if I put together a free lead list with one thousand ideal prospects for {COMPANY}?". Small sample (20 threads).
3. **The step-2 bump carried weight.** "I reached out a couple of days ago about building {COMPANY} a list with 1,000 ideal prospects..." sent as a new thread (`{FIRST_NAME}?`, `quick question`, `Have you seen this {FIRST_NAME}?`): 286 threads with copy, 70 positive, 15 booked across 6 campaigns.
4. **Late-2025 / 2026 rewrites booked far less.** The "at no expense" one-liner (Nov 2025 to Jan 2026) still drew replies (81 threads with copy, 34 positive, 9 booked across 4 campaigns) but the "verified prospects + video", "$180K lead-magnet" follow-up and the 2026 "20+ sales opportunities" omnichannel blocks together booked 5 meetings from 299 threads with copy (63 positive). Booked per 1,000 sent was 0.25 to 1.19 in the four early-2025 lookalike campaigns and 0 to 0.36 in every Nov 2025 to Apr 2026 campaign with 5,000+ sent. But the copy is not the whole story: Apollo Agencies (Oct 2025) reused the same lookalike one-liner and booked only 0.14 per 1,000, so list source, market and inbox health changed too.
5. **P.S. test on the "at no expense" one-liner (4 campaigns):** P.S. "Yes, it’s completely free. We only do this with businesses we’d genuinely love to work with.": 31 threads, 13 positive, 5 booked; P.S. "No twist, just a way to introduce what we do to companies we’d enjoy working with.": 46 threads, 18 positive, 3 booked; P.S. "Yes, it’s completely free..." + "No twist...": 3 threads, 2 positive, 1 booked. Too small to call.


## Which copy angles booked meetings (all recovered campaigns combined)

| Copy angle | Step | Campaigns | Threads with copy | Positive | Booked |
|---|---|---:|---:|---:|---:|
| "1,000 leads similar to {CASESTUDY}" one-liner | first touch | 10 | 427 | 269 | 76 |
| "I reached out ... about building {COMPANY} a list" bump | follow-up (step 2) | 6 | 286 | 70 | 15 |
| "Saw your work with {CASESTUDY} on Clutch/your site" + free 1,000-lead list | first touch | 4 | 46 | 45 | 14 |
| "Could I put together 1,000 ideal customer leads for {COMPANY} at no expense?" one-liner | first touch | 4 | 81 | 34 | 9 |
| "Came across you on Clutch — helped TwoTreesPPC and TargetonStar" + 1k list | first touch | 4 | 21 | 20 | 8 |
| "Wasn't sure if I should send this to you or {COLLEAGUE}" + free 1,000-lead list | later step (referral ask) | 6 | 172 | 75 | 6 |
| Free cold-email campaign offer (lookalike) | first touch | 1 | 113 | 23 | 5 |
| Lender/SaaS lookalike list + "PS - asking about {LOCAL_RESTAURANT}" (subject "{LOCAL_RESTAURANT}'s food - yes or no?") | first touch | 3 | 16 | 14 | 5 |
| "I had 3 ideas about how we could specifically help over at {COMPANY}" | first touch | 1 | 8 | 8 | 4 |
| "I've been helping B2B agencies ... 1,000 verified prospects + short video" | first touch | 8 | 98 | 28 | 2 |
| Agency Vista one-liner "could I put together 1,000 ideal customer leads" | first touch | 1 | 30 | 14 | 2 |
| "We have a B2B database with 500M email leads ... 500 leads based on your {CASESTUDY} case study" | first touch | 1 | 9 | 9 | 2 |
| "Here is 2-3 contacts that fit your past clients" + 1,000 more free | first touch | 1 | 8 | 8 | 2 |
| "Could {COMPANY} use more ICP sales opportunities? Only asking because ... $68k / 80 prospects" | first touch | 2 | 25 | 5 | 2 |
| "just wanted to add to my last email" bullet follow-up | follow-up | 2 | 6 | 5 | 2 |
| "how three competing lenders have increased loan volume by 57%" breakdown | later step | 2 | 2 | 2 | 2 |
| "did you review the lead magnet I mentioned? ... $180K" follow-up | follow-up | 6 | 103 | 15 | 1 |
| "Wasn't sure if I should send this to you or {COLLEAGUE}" + Digital Force proof | later step (referral ask) | 2 | 9 | 9 | 1 |
| "we helped Visionair AI add $430K in pipeline last month" + 60-second video | later step | 1 | 3 | 3 | 1 |
| "You mentioned you would be back by this time" post-out-of-office nudge (subject "Back to work?") | follow-up after OOO | 2 | 2 | 2 | 1 |
| "here is how we secured more sales opportunities for marketing agencies" follow-up | follow-up | 1 | 2 | 2 | 1 |
| "I prepared a spreadsheet of 500 email leads similar to your {CASESTUDY} case study" | follow-up | 1 | 15 | 15 | 0 |
| "We can build an omnichannel outreach system for {COMPANY} that books you 20+ sales opportunities per month" | first touch | 2 | 49 | 13 | 0 |
| "If we built a list of 1,000 ideal customer leads on the house, and you could schedule 10+ interested leads..." | first touch | 1 | 41 | 8 | 0 |
| "We've built lead lists specifically for influencer agencies" | first touch | 1 | 12 | 5 | 0 |
| "Are you happy with your current meeting generation system?" + free email sequence | first touch | 2 | 10 | 4 | 0 |
| "Just curious why you're not leveraging omnichannel/cold email ... with case studies like {CASESTUDY}" | first touch | 3 | 7 | 4 | 0 |
| "Could I put together 1,000 ... Only asking because ... Scroll Stop and Slogan Social" | first touch | 1 | 6 | 3 | 0 |
| "Saw you're in charge of {COMPANY}'s growth. I mapped out an omnichannel strategy ... Loom" | first touch | 2 | 24 | 2 | 0 |
| "Wasn't sure ..." finance version | later step (referral ask) | 2 | 4 | 2 | 0 |
| "Could {COMPANY} use more production leads each month?" | first touch | 2 | 13 | 1 | 0 |
| "The reason I ask ..." managed-outbound follow-up | follow-up | 1 | 1 | 1 | 0 |
| "Every founder loves word of mouth until referrals dry up" (subject "referrals are cute, predictability is hotter") | first touch | 1 | 9 | 1 | 0 |
| "the difference with these leads is intent" follow-up | follow-up | 1 | 8 | 0 | 0 |

Threads where the quoted email was a manual reply, a broken quote or unreadable are left out of the per-block counts; the campaign line keeps all threads.

## Campaigns and their copy

#### 1. [DULCY] APPC E53
EB id 117 · created 2025-04-21 · 53,390 sent · 146 interested (EmailBison) · Airtable: 207 reply threads, 146 positive, 39 booked (1 of these threads, 1 positive, 0 booked, were first logged before this campaign existed: re-contacted leads whose status may come from an earlier campaign) · quoted emails dated 2025-04-21 to 2025-05-27 · copy recovered from 134 threads

**"1,000 leads similar to {CASESTUDY}" one-liner** · first touch · 85 threads, 82 positive, 23 booked · 2025-04-21 to 2025-05-26 · 69 wording variants
Subjects seen: `similar to {CASESTUDY}` (30), `More clients like {CASESTUDY}?` (22), `similar to your ideal clients` (10), `Leads similar to {CASESTUDY}?` (9), `Leads similar to your ideal clients?` (5)
```
{FIRST_NAME} - could I send over 1,000 ideal customer leads similar to your ideal clients (full name, email, company name, linkedin, etc.) for you to use in any outbound marketing efforts? It’s at no cost to you. Just let me know if you’d want to have a look.
--

With best wishes,
Alexander Woung
Dulcy Media
p.s. or tell me to pound sand if you'd like..
```

**"Wasn't sure if I should send this to you or {COLLEAGUE}" + free 1,000-lead list** · later step (referral ask) · 26 threads, 25 positive, 5 booked · 2025-04-28 to 2025-05-27 · 23 wording variants
Subjects seen: `does this make sense {FIRST_NAME}?` (20), `thoughts {FIRST_NAME}?` (6)
```
Hey {FIRST_NAME},

Wasn’t sure if I should send this to you or {COLLEAGUE}.

Either way, we've been helping dozens of marketing agencies such as yourself predictably get more ideal clients with our AI outbound system.

To see if we’d actually be useful, I’d be happy to build you a free list of 1,000 leads so you can test our data quality firsthand.

Would you or someone else be better to speak to about this?

--

Thank you,
Alexander Woung
Dulcy Media
```

**"I reached out ... about building {COMPANY} a list" bump** · follow-up (step 2) · 23 threads, 19 positive, 5 booked · 2025-04-23 to 2025-05-22 · 23 wording variants
Subjects seen: `{FIRST_NAME}?` (11), `quick question` (6), `Have you seen this {FIRST_NAME}?` (6)
```
Hi {FIRST_NAME},
I reached out a couple of days ago about building {COMPANY} a list with one thousand ideal prospects from our database that match closely to {CASESTUDY}. If it makes sense for {COMPANY}, I’d be happy to put it together them for you to try out in your outreach. Would that work for you?
—

Yours truly,
Alexander Woung
Dulcy Media
p.s. or tell me to pound sand if you'd like..
```

#### 2. [DULCY] MISS G550
EB id 175 · created 2025-07-01 · 61,468 sent · 148 interested (EmailBison) · Airtable: 478 reply threads, 135 positive, 33 booked (1 closed deal) · quoted emails dated 2025-07-01 to 2025-07-22 · copy recovered from 417 threads

**"1,000 leads similar to {CASESTUDY}" one-liner** · first touch · 161 threads, 70 positive, 22 booked · 2025-07-01 to 2025-07-10 · 153 wording variants
Subjects seen: `similar to {CASESTUDY}` (38), `More clients like your ideal clients?` (29), `similar to your ideal clients` (26), `Leads similar to {CASESTUDY}?` (24), `More clients like {CASESTUDY}?` (23)
```
{FIRST_NAME} - could I send over 1,000 ideal customer leads similar to your ideal clients (full name, email, company name, linkedin, etc.) for you to use in any outbound marketing efforts?

It’s at no cost to you. Just let me know if you’d want to have a look.

--

Kind regards,
Alexander Woung
Dulcy Media

p.s. or tell me to pound sand if you'd like..
```

**"I reached out ... about building {COMPANY} a list" bump** · follow-up (step 2) · 168 threads, 28 positive, 7 booked · 2025-07-03 to 2025-07-22 · 168 wording variants
Subjects seen: `{FIRST_NAME}?` (74), `quick question` (64), `Have you seen this {FIRST_NAME}?` (29)
```
Hi {FIRST_NAME},

I reached out a couple of days ago about building {COMPANY} a list with one thousand ideal prospects from our database that align perfectly to your ideal clients for free.

If it makes sense for {COMPANY}, I’d be glad to put it together them for you to explore in your outreach, would that work for you?

—

Thank you,
Alexander W.
Founder @ Dulcy Media

p.s. or tell me to pound sand if you'd like..
```

**"Wasn't sure if I should send this to you or {COLLEAGUE}" + free 1,000-lead list** · later step (referral ask) · 88 threads, 26 positive, 1 booked · 2025-07-07 to 2025-07-21 · 77 wording variants
Subjects seen: `thoughts {FIRST_NAME}?` (54), `does this make sense {FIRST_NAME}?` (32)
```
Hey {FIRST_NAME},

Wasn’t sure if I should send this to you or {COLLEAGUE}.

Regardless, we've been helping dozens of marketing agencies such as yourself predictably get more ideal clients with our AI outbound system.

To see if we’d actually be useful, I’d be happy to build you a free list of 1,000 leads so you can test our data quality firsthand.

Would you or {COLLEAGUE} be better to speak to about this?

--

Best regards,
Alexander Woung
Dulcy Media
```

#### 3. [DULCY] CPPC G63
EB id 53 · created 2025-01-28 · 15,912 sent · 71 interested (EmailBison) · Airtable: 66 reply threads, 58 positive, 19 booked · quoted emails dated 2025-01-28 to 2025-03-07 · copy recovered from 60 threads

**"1,000 leads similar to {CASESTUDY}" one-liner** · first touch · 22 threads, 22 positive, 9 booked · 2025-01-28 to 2025-03-04 · 22 wording variants
Subjects seen: `Leads similar to {CASESTUDY}?` (10), `More clients like {CASESTUDY}?` (5), `similar to {CASESTUDY}` (5), `similar to your ideal clients` (1), `More clients like your ideal clients?` (1)
```
{FIRST_NAME} - could I send over 1,000 ideal customer leads similar to {CASESTUDY} (full name, email, company name, linkedin, etc.) for you to use in any outbound marketing efforts? It’s at no cost to you. Just let me know if you’d want to have a look.
--

Kind regards,
Alexander Woung
Founder of Dulcy Media
p.s. or tell me to pound sand if you'd like..
```

**"Came across you on Clutch — helped TwoTreesPPC and TargetonStar" + 1k list** · first touch · 15 threads, 14 positive, 5 booked · 2025-01-31 to 2025-03-04 · 14 wording variants
Subjects seen: `Have you seen this {FIRST_NAME}?` (7), `{FIRST_NAME}?` (6), `quick question` (2)
```
Hi {FIRST_NAME},
Saw you guys on Clutch.co—we’ve been working with agencies like TwoTreesPPC and Target On Star generate more sales opportunities with hyper-personalized targeted emails. I can pull a list with 1k ideal prospects for {COMPANY} from our database that fit well with your past clients. If it makes sense for {COMPANY}, I’d be excited to craft them for you to explore in your outreach—would that be okay?
--

Warm regards,
Alex W
Founder of Dulcy
p.s. or tell me to pound sand if you'd like..
```

**"Saw your work with {CASESTUDY} on Clutch/your site" + free 1,000-lead list** · first touch · 19 threads, 18 positive, 4 booked · 2025-01-28 to 2025-03-04 · 18 wording variants
Subjects seen: `similar to {CASESTUDY}` (8), `Leads similar to {CASESTUDY}?` (6), `More clients like {CASESTUDY}?` (5)
```
Hi {FIRST_NAME},

I was looking on Clutch and Noticed you guys helped {CASESTUDY} in their marketing efforts..

Would it be acceptable to assemble a free lead list with 1k ideal prospects for {COMPANY}?

I’ll include their name, email, company, job title, and everything else you’ll need to schedule appointments.

It’s at no cost to you. Just let me know if you’d like to see it.

Warm regards,
Alexander Woung
Founder @ Dulcy

p.s. or tell me to pound sand if you'd like..
```

**"just wanted to add to my last email" bullet follow-up** · follow-up · 4 threads, 3 positive, 0 booked · 2025-02-21 to 2025-03-07 · 4 wording variants
Subjects seen: `thoughts {FIRST_NAME}?` (3), `does this make sense {FIRST_NAME}?` (1)
```
Hey {FIRST_NAME}, just wanted to add to my last email:
• I can pull leads based on your past clients, ensuring they match your ideal customer profile. We provide only decision-makers from companies that fit your exact criteria—whether it’s employee headcount, location, keywords, tech stack, or industry. • With the right tools, you can send emails to these prospects that are hyper-personalized—making it feel like each email was written just for them. • No catch—we believe in the quality of our service and want to give you a risk-free way to see the results for yourself. I’d be happy to build you a list of 1K high-quality customer leads (full name, email, company name, linkedin, etc.) similar to {COMPANY} at no cost. Would that be okay?
--

Thanks,
Alex W
Founder @ Dulcy Media
p.s. or tell me to pound sand if you'd like..
```

#### 4. Copy of [DULCY] GF + AV PPC Leads
EB id 103 · created 2025-03-28 · 56,480 sent · 88 interested (EmailBison) · Airtable: 116 reply threads, 84 positive, 14 booked · quoted emails dated 2025-04-02 to 2025-07-11 · copy recovered from 85 threads

**"1,000 leads similar to {CASESTUDY}" one-liner** · first touch · 42 threads, 40 positive, 13 booked · 2025-04-18 to 2025-05-14 · 42 wording variants
Subjects seen: `More clients like {CASESTUDY}?` (15), `similar to {CASESTUDY}` (12), `Leads similar to {CASESTUDY}?` (8), `Leads similar to your ideal clients?` (2), `similar to your ideal clients` (1)
```
{FIRST_NAME} - could I send over 1,000 ideal customer leads similar to your ideal clients (full name, email, company name, linkedin, etc.) for you to use in any outbound marketing efforts? It’s at no cost to you. Just let me know if you’d want to see it.
--

Kind regards,
Alexander Woung
Founder @ Dulcy Media
p.s. or tell me to pound sand if you'd like..
```

**"Saw your work with {CASESTUDY} on Clutch/your site" + free 1,000-lead list** · first touch · 6 threads, 6 positive, 1 booked · 2025-04-02 to 2025-04-23 · 6 wording variants
Subjects seen: `Leads similar to {CASESTUDY}?` (2), `similar to {CASESTUDY}` (2), `More clients like {CASESTUDY}?` (1), `More clients like your ideal clients?` (1)
```
Hi {FIRST_NAME},
I was browsing your site and saw your impressive work with {CASESTUDY}. Would it be alright to put together a free lead list with 1k ideal prospects for {COMPANY}? I’ll include their full name, email, company, job title, and everything else you’ll need to schedule appointments. It’s at no cost to you. Just let me know if you’d want to see it.
--

Warm wishes,
Alex W
Founder of Dulcy
p.s. or tell me to pound sand if you'd like..
```

**"Wasn't sure if I should send this to you or {COLLEAGUE}" + free 1,000-lead list** · later step (referral ask) · 24 threads, 21 positive, 0 booked · 2025-04-24 to 2025-05-26 · 24 wording variants
Subjects seen: `does this make sense {FIRST_NAME}?` (12), `thoughts {FIRST_NAME}?` (11)
```
Hi {FIRST_NAME},

Wasn’t sure if I should send this to you or {COLLEAGUE}.

That said, we've been helping dozens of marketing agencies such as yourself predictable get more ideal clients with our AI outbound system.

To see if we’d actually be useful, I’d be happy to build you a free list of 1,000 leads so you can test our data quality firsthand.

Would you or {COLLEAGUE} be better to speak to about this?

--

Sincerely,
Alexander Woung
Founder @ Dulcy Media
```

**"I reached out ... about building {COMPANY} a list" bump** · follow-up (step 2) · 13 threads, 11 positive, 0 booked · 2025-04-18 to 2025-07-11 · 13 wording variants
Subjects seen: `quick question` (5), `Have you seen this {FIRST_NAME}?` (4), `{FIRST_NAME}?` (3)
```
Hi {FIRST_NAME},
I reached out a couple of days ago about building {COMPANY} a list with 1,000 ideal prospects from our database that align perfectly to {CASESTUDY}. If it makes sense for {COMPANY}, I’d be excited to craft them for you to test in your outreach—would that be acceptable?
—

Thank you,
Alexander Woung
Founder @ Dulcy Media
p.s. or tell me to pound sand if you'd like..
```

#### 5. [Dulcy] Clay Marketing Agencies Direct Offer (NC)
EB id 284 · created 2025-11-14 · 30,422 sent · 41 interested (EmailBison) · Airtable: 507 reply threads, 43 positive, 11 booked (1 closed deal) (23 of these threads, 4 positive, 1 booked, were first logged before this campaign existed: re-contacted leads whose status may come from an earlier campaign) · quoted emails dated 2025-11-14 to 2025-12-12 · copy recovered from 117 threads · 1 threads quoted an email older than this campaign and were left out of the blocks

**"Could I put together 1,000 ideal customer leads for {COMPANY} at no expense?" one-liner** · first touch · 50 threads, 21 positive, 2 booked · 2025-11-14 to 2025-12-04 · 38 wording variants
Subjects seen: `our next 1,000 leads` (47)
P.S. split: P.S. "Yes, it’s completely free. We only do this with businesses we’d genuinely love to work with.": 19 threads, 9 positive, 2 booked; P.S. "No twist, just a way to introduce what we do to companies we’d enjoy working with.": 30 threads, 11 positive, 0 booked; no P.S.: 1 threads, 1 positive, 0 booked
```
Hi {FIRST_NAME},
Could I put together 1,000 ideal customer leads for {COMPANY} at no expense?

Best regards,
Alexander Woung
Founder of Dulcy
dulcy(.)io
P.S. Yes, it’s completely free. We only do this with businesses we’d genuinely love to work with.
```

**"I've been helping B2B agencies ... 1,000 verified prospects + short video"** · first touch · 34 threads, 7 positive, 2 booked · 2025-11-20 to 2025-12-12 · 34 wording variants
Subjects seen: `our new pipeline` (33)
```
Hey {FIRST_NAME},

I've been helping B2B agencies generate consistent opportunities using an automated AI-based omnichannel outreach system.

To see if we’d actually be useful, I pull together 1,000 verified prospects for {COMPANY} and share a short video explaining how we’d target your specific niche and offer.

Would that be helpful to see?

Best regards,
Alexander Woung
Founder of Dulcy
dulcy(.)io

P.S. or tell me to pound sand...
```

**"did you review the lead magnet I mentioned? ... $180K" follow-up** · follow-up · 33 threads, 3 positive, 1 booked · 2025-11-17 to 2025-12-08 · 30 wording variants
Subjects seen: `your lead magnet` (32)
```
Hi {FIRST_NAME}, did you go through the lead magnet I mentioned? In 15 minutes, we’ll have your leads ready, show you exactly how we do it, and walk you through the same email flow that helped one of our clients generate $180K in new business. Mind if I send over some more info?

Kind regards,
Alexander Woung
Founder of Dulcy
dulcy(.)io
P.S. or tell me to pound sand...
```

#### 6. [DULCY] Advertising Agencies (Leads)
EB id 178 · created 2025-08-20 · 28,961 sent · 41 interested (EmailBison) · Airtable: 386 reply threads, 38 positive, 11 booked (6 of these threads, 0 positive, 0 booked, were first logged before this campaign existed: re-contacted leads whose status may come from an earlier campaign) · quoted emails dated 2025-08-20 to 2025-09-03 · copy recovered from 104 threads

**"1,000 leads similar to {CASESTUDY}" one-liner** · first touch · 49 threads, 22 positive, 5 booked · 2025-08-20 to 2025-08-27 · 48 wording variants
Subjects seen: `similar to {CASESTUDY}` (19), `More clients like {CASESTUDY}?` (10), `similar to your ideal clients` (7), `Leads similar to {CASESTUDY}?` (6), `Leads similar to your ideal clients?` (4)
```
{FIRST_NAME} - could I put together 1,000 ideal customer leads similar to {CASESTUDY} (full name, email, company name, linkedin, etc.) for you to use in any outbound marketing efforts? It’s at no cost to you. Just let me know if you’d want to have a look.

With best wishes,
Alex Woung
Founder of Dulcy Media
p.s. or tell me to pound sand if you'd like..
```

**"I reached out ... about building {COMPANY} a list" bump** · follow-up (step 2) · 34 threads, 7 positive, 2 booked · 2025-08-21 to 2025-08-30 · 34 wording variants
Subjects seen: `{FIRST_NAME}?` (14), `our conversation yesterday` (14), `Have you seen this {FIRST_NAME}?` (6)
```
Hi {FIRST_NAME},
I reached out yesterday about building {COMPANY} a list with one thousand ideal prospects from our database that align perfectly to your ideal clients for free. If it makes sense for {COMPANY}, I’d be pleased to share them for you to test in your outreach, would that work for you?
—

Best regards,
Alexander Woung
Founder @ Dulcy
p.s. or tell me to pound sand if you'd like..
```

**"Wasn't sure if I should send this to you or {COLLEAGUE}" + free 1,000-lead list** · later step (referral ask) · 21 threads, 2 positive, 0 booked · 2025-08-25 to 2025-09-03 · 21 wording variants
Subjects seen: `thoughts {FIRST_NAME}?` (11), `does this make sense {FIRST_NAME}?` (10)
```
Hi {FIRST_NAME},
Wasn’t sure if I should send this to you or {COLLEAGUE}.
Either way, we help established marketing agencies such as yourself get more sales opportunities by leveraging our personalized AI outbound system. To see if we’d actually be useful, I’d be happy to build you a free list of 1,000 leads so you can test our data quality firsthand. Would you or {COLLEAGUE} be better to speak to about this?

Best regards,
Alexander Woung
Founder @ Dulcy
p.s. or tell me to pound sand if you'd like..
```

#### 7. [Dulcy] Clutch Free Leads (Google)
EB id 38 · created 2025-01-18 · 4,833 sent · 25 interested (EmailBison) · Airtable: 20 reply threads, 20 positive, 11 booked · quoted emails dated 2024-12-16 to 2025-01-03 · copy recovered from 19 threads

Note: EmailBison "created" (2025-01-18) is after the first replies (Dec 2024); the early-2025 EB created dates look like clone dates.

**"Saw your work with {CASESTUDY} on Clutch/your site" + free 1,000-lead list** · first touch · 16 threads, 16 positive, 8 booked · 2024-12-16 to 2025-01-02 · 16 wording variants
Subjects seen: `question` (7), `{FIRST_NAME}` (5), `have you seen this {FIRST_NAME}` (4)
```
Hey {FIRST_NAME},
I was browsing Clutch and saw you helped {CASESTUDY} in their marketing efforts.. Would it be alright if I put together a free lead list with one thousand ideal prospects for {COMPANY}? The lead list will include their name, email address, company, job position, and any other data point you’ll need to schedule them in. It’s at no cost to you. Just let me know if you’d want to have a look.
--

Best wishes,
Alexander W.
Founder @ Dulcy
p.s. or tell me to pound sand if you'd like..
```

**"Came across you on Clutch — helped TwoTreesPPC and TargetonStar" + 1k list** · first touch · 2 threads, 2 positive, 2 booked · 2025-01-01 to 2025-01-02 · 2 wording variants
Subjects seen: `is this useful {FIRST_NAME}` (2)
```
Hi {FIRST_NAME},
Found you guys on Clutch.co—we’ve been helping agencies like TwoTreesPPC and Target On Star get more sales opportunities with hyper-personalized targeted emails. I’ve gathered a list with 1k ideal prospects for {COMPANY} from our database that align perfectly with your past clients. If it makes sense for {COMPANY}, I’d be pleased to send over them for you to use in your outreach—would that be okay?
--

Respectfully,
Alex Wong
Founder @ DM
p.s. or tell me to pound sand if you'd like..
```

**"The reason I ask ..." managed-outbound follow-up** · follow-up · 1 threads, 1 positive, 0 booked · 2025-01-03 to 2025-01-03 · 1 wording variants
Subjects seen: `our outbound` (1)
```
Hey {FIRST_NAME},
The reason I ask is that most of my clients were focused on search engine optimization or word-of-mouth referrals. By developing a fully managed cold outbound system, they were able to get back time and grow their operations without checking their emails all day. To be honest, it’s something you could manage on your own—if it’s okay, I can walk you through how we helped Two Trees PPC and Inlight Insight make it work. Can I walk you through it?
--

Kind regards,
Alex Woung
Founder @ Dulcy LG
p.s. or tell me to pound sand if you'd like..
```

#### 8. [Dulcy] Agency Vista Direct Offer
EB id 280 · created 2025-11-14 · 33,634 sent · 32 interested (EmailBison) · Airtable: 815 reply threads, 39 positive, 10 booked (49 of these threads, 9 positive, 4 booked, were first logged before this campaign existed: re-contacted leads whose status may come from an earlier campaign) · quoted emails dated 2025-11-24 to 2026-01-02 · copy recovered from 81 threads

**Agency Vista one-liner "could I put together 1,000 ideal customer leads"** · first touch · 30 threads, 14 positive, 2 booked · 2025-11-26 to 2025-12-26 · 23 wording variants
Subjects seen: `our next 1,000 leads` (30)
```
Hey {FIRST_NAME},
I came across {COMPANY} on Agency Vista and wanted to ask, could I put together 1,000 ideal customer leads for {COMPANY} at no expense?

Kind regards,
Alexander Woung
Founder of Dulcy
dulcy(.)io
P.S. Yes, it’s completely free. We only do this with businesses we’d genuinely love to work with. No twist, just a way to introduce what we do to companies we’d enjoy working with.
```

**"did you review the lead magnet I mentioned? ... $180K" follow-up** · follow-up · 33 threads, 8 positive, 0 booked · 2025-11-24 to 2025-12-30 · 33 wording variants
Subjects seen: `your lead magnet` (32)
```
Hi {FIRST_NAME}, Just checking if you had checked out the lead magnet I mentioned. In 15 minutes, we can have the data prepped, show you exactly how we do it, and walk you through the same email structure that helped one of our clients generate $180K in new business. Mind if I send over some more info?

With best wishes,
Alexander Woung
Founder of Dulcy
dulcy(.)io
P.S. or tell me to pound sand...
```

**"I've been helping B2B agencies ... 1,000 verified prospects + short video"** · first touch · 18 threads, 5 positive, 0 booked · 2025-12-08 to 2026-01-02 · 18 wording variants
Subjects seen: `our new pipeline` (17), `your lead magnet` (1)
```
Hi {FIRST_NAME},
I've been helping B2B agencies generate consistent opportunities using an AI-powered omnichannel outreach system. To see if we’d actually be useful, I assemble 1,000 verified prospects for {COMPANY} and share a 60-second video walking you through how we’d handle your specific niche and offer. Would you find that useful?

Warm regards,
Alex Woung
Founder of Dulcy
dulcy(.)io
P.S. or tell me to pound sand...
```

#### 9. [Dulcy] Broad Agencies - 7-75 empl, USA/UK/CA - A-Leads (Direct Offer)
EB id 367 · created 2026-03-05 · 48,481 sent · 47 interested (EmailBison) · Airtable: 347 reply threads, 40 positive, 7 booked (76 of these threads, 14 positive, 3 booked, were first logged before this campaign existed: re-contacted leads whose status may come from an earlier campaign) · quoted emails dated 2026-03-04 to 2026-03-18 · copy recovered from 79 threads · 15 threads quoted an email older than this campaign and were left out of the blocks

Note: `dulcy.md` stores EB 377 under this same name (created 2026-01-22). The 15 threads whose quoted email is dated before 2026-03-02 are treated as EB 377 and left out; the blocks below are the March 2026 sends of EB 367.

**"Could {COMPANY} use more ICP sales opportunities? Only asking because ... $68k / 80 prospects"** · first touch · 21 threads, 4 positive, 1 booked · 2026-03-04 to 2026-03-18 · 21 wording variants
Subjects seen: `thoughts?` (11), `our outreach` (7), `more clients` (2)
```
Hey {FIRST_NAME} - could {COMPANY} use more ICP sales opportunities each month? Just asking because we manage omnichannel outreach campaigns (email, LinkedIn, and phone outreach) and recently ran this for two clients - one generated $68k starting at zero, the other scheduled 80 prospects within month one. Can I send more details?
--

With best wishes,
Alexander Woung
Founder of Dulcy
dulcy(.)io
p.s. or tell me to pound sand if you'd like..
```

**"We can build an omnichannel outreach system for {COMPANY} that books you 20+ sales opportunities per month"** · first touch · 42 threads, 9 positive, 0 booked · 2026-03-04 to 2026-03-12 · 41 wording variants
Subjects seen: `thoughts?` (17), `more clients` (16), `our outreach` (9)
```
Hey {FIRST_NAME},
We can set up an omnichannel outreach system for {COMPANY} that gets you 20+ sales opportunities per month. Then we'll handle the email sequences, LinkedIn outreach, and cold calling follow-ups - you don't have to lift a finger. We just implemented this for Slogan Social (eighty interested prospects in month 1) and another client who scaled from $10k to $68k/month. Open to seeing how it works?
--

Warm wishes,
Alex Woung
Founder of Dulcy
dulcy(.)io
p.s. or tell me to pound sand if you'd like..
```

**"Saw you're in charge of {COMPANY}'s growth. I mapped out an omnichannel strategy ... Loom"** · first touch · 16 threads, 1 positive, 0 booked · 2026-03-04 to 2026-03-17 · 16 wording variants
Subjects seen: `more clients` (8), `thoughts?` (5), `our outreach` (3)
```
Hey {FIRST_NAME} saw you're in charge of {COMPANY}'s growth.
I mapped out an omnichannel outreach strategy (cold email + LinkedIn + calling) that can book you more than 20 sales opportunities per month - consistently. We recently took a company from $10 to $68k monthly using this system, and got Slogan Social 80 interested prospects in their first month without any ad spend. Mind if I share a quick Loom showing the strategy I built for you?
--

Best regards,
Alexander Woung
Founder of Dulcy
dulcy(.)io
p.s. or tell me to pound sand if you'd like..
```

#### 10. [DULCY] Apollo Agencies US/UK/CA
EB id 243 · created 2025-10-06 · 51,593 sent · 26 interested (EmailBison) · Airtable: 425 reply threads, 30 positive, 7 booked (38 of these threads, 3 positive, 1 booked, were first logged before this campaign existed: re-contacted leads whose status may come from an earlier campaign) · quoted emails dated 2025-10-06 to 2025-10-22 · copy recovered from 96 threads · 1 threads quoted an email older than this campaign and were left out of the blocks

Note: in the referral step the colleague variable was empty when sent ("send this to you or ." / "Would you or be better"), shown as sent. A merge-field QA miss worth remembering.

**"1,000 leads similar to {CASESTUDY}" one-liner** · first touch · 39 threads, 17 positive, 2 booked · 2025-10-06 to 2025-10-17 · 39 wording variants
Subjects seen: `More clients like {CASESTUDY}?` (9), `similar to {CASESTUDY}` (8), `Leads similar to your ideal clients?` (8), `similar to your ideal clients` (6), `Leads similar to {CASESTUDY}?` (6)
```
{FIRST_NAME} - could I put together 1,000 ideal customer leads similar to your ideal clients (full name, email, company name, linkedin, etc.) for you to use in any outbound marketing efforts?

It’s at no cost to you. Just let me know if you’d want to see it.

--

Warm wishes,
Alexander Woung
Founder of Dulcy Media
p.s. or tell me to pound sand if you'd like..
```

**"I reached out ... about building {COMPANY} a list" bump** · follow-up (step 2) · 45 threads, 5 positive, 1 booked · 2025-10-08 to 2025-10-22 · 45 wording variants
Subjects seen: `quick question` (19), `{FIRST_NAME}?` (14), `Have you seen this {FIRST_NAME}?` (12)
```
Hi {FIRST_NAME},
I sent you an email a couple of days ago about building {COMPANY} a list with one thousand ideal prospects from our database that fit well to {CASESTUDY} for free. If it makes sense for {COMPANY}, I’d be excited to craft them for you to explore in your outreach, would that work for you?
--

Best wishes,
Alex W
Founder @ Dulcy Media
p.s. or tell me to pound sand if you'd like..
```

**"Wasn't sure if I should send this to you or {COLLEAGUE}" + free 1,000-lead list** · later step (referral ask) · 12 threads, 1 positive, 0 booked · 2025-10-13 to 2025-10-20 · 12 wording variants
Subjects seen: `does this make sense {FIRST_NAME}?` (8), `thoughts {FIRST_NAME}?` (4)
```
Hi {FIRST_NAME},
Wasn’t sure if I should send this to you or .
Either way, we've been helping dozens of agencies such as yourself predictably get more ideal clients with our AI outbound system. To see if we’d actually be useful, I’d be happy to build you a free list of 1,000 leads so you can test our data quality firsthand. Would you or be better to speak to about this?
--

Kind regards,
Alexander Woung
Founder @ Dulcy
p.s. or tell me to pound sand if you'd like..
```

#### 11. Copy of [Dulcy] Clay Marketing Agencies Direct Offer (NC)
EB id 340 · created 2025-12-30 · 28,494 sent · 27 interested (EmailBison) · Airtable: 467 reply threads, 29 positive, 6 booked (10 of these threads, 1 positive, 0 booked, were first logged before this campaign existed: re-contacted leads whose status may come from an earlier campaign) · quoted emails dated 2025-12-30 to 2026-01-19 · copy recovered from 59 threads

**"Could I put together 1,000 ideal customer leads for {COMPANY} at no expense?" one-liner** · first touch · 21 threads, 10 positive, 5 booked · 2025-12-30 to 2026-01-08 · 21 wording variants
Subjects seen: `our next 1,000 leads` (21)
P.S. split: P.S. "No twist, just a way to introduce what we do to companies we’d enjoy working with.": 12 threads, 6 positive, 2 booked; P.S. "Yes, it’s completely free. We only do this with businesses we’d genuinely love to work with.": 9 threads, 4 positive, 3 booked
```
Hey {FIRST_NAME},
Could I put together 1,000 ideal customer leads for {COMPANY} at no expense?

Warm regards,
Alexander Woung
Founder of Dulcy
dulcy(.)io
P.S. Yes, it’s completely free. We only do this with businesses we’d genuinely love to work with.
```

**"I've been helping B2B agencies ... 1,000 verified prospects + short video"** · first touch · 21 threads, 11 positive, 0 booked · 2026-01-05 to 2026-01-16 · 21 wording variants
Subjects seen: `our new pipeline` (21)
```
Hi {FIRST_NAME},
I've been helping B2B agencies build predictable pipelines using an AI-driven omnichannel outreach system. To see if we’d actually be useful, I pull together a thousand verified prospects for {COMPANY} and share a 60-second video showing exactly how we’d approach your specific niche and offer. Would you find that useful?

Warm wishes,
Alexander Woung
Founder of Dulcy
dulcy(.)io
P.S. or tell me to pound sand...
```

**"did you review the lead magnet I mentioned? ... $180K" follow-up** · follow-up · 17 threads, 2 positive, 0 booked · 2026-01-01 to 2026-01-19 · 17 wording variants
Subjects seen: `your lead magnet` (17)
```
Hi {FIRST_NAME}, did you review the lead magnet I mentioned? In 15 minutes, we’ll have your leads ready, show you exactly how we do it, and walk you through the same email structure that helped one of our clients generate $180K in new business. Mind if I send over some more info?

Best wishes,
Alexander Woung
Founder of Dulcy
dulcy(.)io
P.S. or tell me to pound sand...
```

#### 12. [DULCY] Advertising Agencies (Campaign)
EB id 214 · created 2025-08-21 · 29,045 sent · 23 interested (EmailBison) · Airtable: 349 reply threads, 29 positive, 6 booked (8 of these threads, 0 positive, 0 booked, were first logged before this campaign existed: re-contacted leads whose status may come from an earlier campaign) · quoted emails dated 2025-08-21 to 2025-09-09 · copy recovered from 113 threads

**Free cold-email campaign offer (lookalike)** · first touch · 113 threads, 23 positive, 5 booked · 2025-08-21 to 2025-09-09 · 110 wording variants
Subjects seen: `Sending cold emails?` (55), `Leads similar to {CASESTUDY}?` (13), `similar to {CASESTUDY}` (13), `More clients like your ideal clients?` (9), `More clients like {CASESTUDY}?` (9)
```
Hey {FIRST_NAME},
Not sure if you have this in place or not. Could I put together 1,000 ideal customer leads similar to {CASESTUDY} and set up a cold email campaign to generate meetings? It’s at no expense to you. Just let me know if you’d want me to try it.

Best wishes,
Alex Woung
Founder of Dulcy Media
p.s. or tell me to pound sand if you'd like..
```

#### 13. [Dulcy] 3 Outbound Ideas (Google)
EB id 22 · created 2025-01-18 · 4,577 sent · 14 interested (EmailBison) · Airtable: 10 reply threads, 10 positive, 5 booked · quoted emails dated 2024-12-03 to 2024-12-19 · copy recovered from 10 threads

Note: the three bullets were written per prospect (AI), so only one example set is shown. EB created date is after the replies (clone date).

**"I had 3 ideas about how we could specifically help over at {COMPANY}"** · first touch · 8 threads, 8 positive, 4 booked · 2024-12-03 to 2024-12-19 · 8 wording variants
Subjects seen: `{FIRST_NAME}` (3), `have you seen this {FIRST_NAME}` (3), `question` (1)
```
Hey {FIRST_NAME}, let me know if {COLLEAGUE} would be better to speak to about this. I had 3 ideas about how we could specifically help over at {COMPANY}.. • Target marketing directors at brands struggling with creative campaigns, offering a free brand audit. • Reach out to startups, proposing tailored branding workshops to refine their market presence. • Connect with local businesses needing rebranding, providing case studies on successful creative projects. Do any of these look like a fit we could discuss with your team?
--

With best wishes,
Alex Woung
Founder of DM
p.s. or tell me to pound sand if'd like..
```

**"here is how we secured more sales opportunities for marketing agencies" follow-up** · follow-up · 2 threads, 2 positive, 1 booked · 2024-12-06 to 2024-12-11 · 2 wording variants
Subjects seen: `ideas {FIRST_NAME}` (1)
```
Hey {FIRST_NAME} - to give you an idea, here is how we generated more sales opportunities for marketing agencies:

• Gather a list of decision-makers at companies who are just like your favorite clients • Use Clay to build hyper-personalized messages that are aligned to the prospect • Reach out and apply the solution you provided to your client at scale

Would it be useful to discuss about this?

--

With best wishes,
Alex W
Founder @ Dulcy

p.s. or tell me to pound sand if'd like..
```

#### 14. Copy of [DULCY] Clutch PPC Leads
EB id 104 · created 2025-03-28 · 7,615 sent · 24 interested (EmailBison) · Airtable: 28 reply threads, 23 positive, 4 booked · quoted emails dated 2025-03-28 to 2025-04-21 · copy recovered from 17 threads

**"1,000 leads similar to {CASESTUDY}" one-liner** · first touch · 8 threads, 8 positive, 1 booked · 2025-03-28 to 2025-04-16 · 8 wording variants
Subjects seen: `similar to {CASESTUDY}` (4), `More clients like {CASESTUDY}?` (2), `Leads similar to your ideal clients?` (1), `Leads similar to {CASESTUDY}?` (1)
```
{FIRST_NAME} - could I send over 1,000 ideal customer leads similar to {CASESTUDY} (full name, email, company name, linkedin, etc.) for you to use in any outbound marketing efforts?

It’s at no cost to you. Just let me know if you’d want to see it.

—

Warm regards,
Alexander Woung
Founder @ Dulcy Media

p.s. or tell me to pound sand if you'd like..
```

**"Saw your work with {CASESTUDY} on Clutch/your site" + free 1,000-lead list** · first touch · 5 threads, 5 positive, 1 booked · 2025-04-10 to 2025-04-16 · 5 wording variants
Subjects seen: `Leads similar to {CASESTUDY}?` (3), `similar to {CASESTUDY}` (1), `More clients like {CASESTUDY}?` (1)
```
Hey {FIRST_NAME},
I was browsing Clutch and saw your impressive work with {CASESTUDY}. Would it be fine with you to build a free lead list with one thousand ideal prospects for {COMPANY}? I’ll include their full name, email, company, job title, and everything else you’ll need to get them on your calendar. It’s at no cost to you. Just let me know if you’d want to have a look.
—

Kind regards,
Alex W
Founder of Dulcy Media
p.s. or tell me to pound sand if you'd like..
```

**"Wasn't sure if I should send this to you or {COLLEAGUE}" + Digital Force proof** · later step (referral ask) · 3 threads, 3 positive, 0 booked · 2025-04-17 to 2025-04-21 · 3 wording variants
Subjects seen: `does this make sense {FIRST_NAME}?` (3)
```
Hey {FIRST_NAME},
Wasn’t sure if I should send this to you or {COLLEAGUE}.
Either way, we just helped Digital Force generate $25K MRR in 1 month with our AI outbound system, and we’re confident we could do something similar for {COMPANY}. Can I share a few details with you or {COLLEAGUE}?
--

With best wishes,
{SECOND_SENDER_NAME}
Dulcy
p.s. or tell me to pound sand if you'd like..
```

**"Came across you on Clutch — helped TwoTreesPPC and TargetonStar" + 1k list** · first touch · 1 threads, 1 positive, 0 booked · 2025-04-08 to 2025-04-08 · 1 wording variants
Subjects seen: `quick question` (1)
```
Hi {FIRST_NAME},

Came across you guys on Clutch.co—we’ve been assisting agencies like TwoTreesPPC and Target On Star generate more sales opportunities with AI-personalized targeted emails.

I can pull a list with 1k ideal prospects for {COMPANY} from our database that fit well with your past clients.

If it makes sense for {COMPANY}, I’d be glad to put it together them for you to explore in your outreach—would that work for you?

—

Thank you,
Alex Woung
Founder of Dulcy Media

p.s. or tell me to pound sand if you'd like..
```

#### 15. [DULCY] GFPPC Hyper C63S
EB id 54 · created 2025-01-29 · 2,983 sent · 11 interested (EmailBison) · Airtable: 10 reply threads, 10 positive, 4 booked · quoted emails dated 2025-01-29 to 2025-02-07 · copy recovered from 10 threads

Note: the email pasted 2-3 real third-party contacts (name, company, title) as a sample; they are replaced with placeholders here.

**"Here is 2-3 contacts that fit your past clients" + 1,000 more free** · first touch · 8 threads, 8 positive, 2 booked · 2025-01-29 to 2025-02-03 · 8 wording variants
Subjects seen: `More clients like {CASESTUDY}?` (3), `Leads similar to {CASESTUDY}?` (2), `similar to {CASESTUDY}` (2), `Question for {FIRST_NAME}` (1)
```
Hey {FIRST_NAME},
Noticed you guys helped {CASESTUDY} in their marketing efforts. Here is 2 contacts that fit the exact criteria of your past clients: • {SAMPLE_CONTACT_NAME}, {SAMPLE_COMPANY}, {TITLE}

• {SAMPLE_CONTACT_NAME}, {SAMPLE_COMPANY}, {TITLE}
I can put together an additional 1,000 for you at no cost—is that something you’d be interested in?
--

Kind regards,
Alex W
Founder @ Dulcy
p.s. or tell me to pound sand if you'd like..
```

**"just wanted to add to my last email" bullet follow-up** · follow-up · 2 threads, 2 positive, 2 booked · 2025-02-06 to 2025-02-07 · 2 wording variants
Subjects seen: `thoughts {FIRST_NAME}?` (1), `does this make sense {FIRST_NAME}?` (1)
```
Hi {FIRST_NAME}, just wanted to add to my last email:
• I can pull leads based on your past clients, ensuring they match your ideal customer profile. We provide only decision-makers from companies that fit your exact criteria—whether it’s employee headcount, location, keywords, tech stack, or industry. • With the right tools, you can send emails to these prospects that are hyper-personalized—making it feel like each email was written just for them. • No catch—we believe in the quality of our service and want to give you a risk-free way to see the results for yourself. I’d be happy to build you a list of 1K targeted customer leads (full name, email, company name, linkedin, etc.) similar to {COMPANY} at no cost. Would that be okay?
--

Yours truly,
Alex W
Founder @ Dulcy Media
p.s. or tell me to pound sand if you'd like..
```

#### 16. [DULCY] Business Loans Leads
EB id 66 · created 2025-03-27 · 4,322 sent · 7 interested (EmailBison) · Airtable: 7 reply threads, 7 positive, 4 booked · quoted emails dated 2025-03-27 to 2025-04-05 · copy recovered from 7 threads

**Lender/SaaS lookalike list + "PS - asking about {LOCAL_RESTAURANT}" (subject "{LOCAL_RESTAURANT}'s food - yes or no?")** · first touch · 4 threads, 4 positive, 3 booked · 2025-03-27 to 2025-04-01 · 4 wording variants
Subjects seen: `{LOCAL_RESTAURANT}'s food - yes or no?` (4)
```
{FIRST_NAME} – could I share 1,000 ideal business leads that match the type of companies {COMPANY} typically works with (full name, email, company name, LinkedIn, etc.) to use in your outbound campaigns? These are decision-makers at companies that fit your ICP — perfect for outbound email or LinkedIn outreach to get more funding requests. No cost at all. Just let me know if you’d want to check it out.
--

Sincerely,
Alexander Woung
Founder @ Dulcy Media
PS - I know you get a ton of these emails, so I thought asking about {LOCAL_RESTAURANT} would cut through the noise - is it good?
```

**"how three competing lenders have increased loan volume by 57%" breakdown** · later step · 1 threads, 1 positive, 1 booked · 2025-03-31 to 2025-03-31 · 1 wording variants
Subjects seen: `quick question` (1)
```
Hi {FIRST_NAME},
I put together a short breakdown on how three competing lenders have increased their loan volume by 57% this year — all using AI-powered outbound strategies. Would it be useful if I sent that over?

Thanks,
Alex W
Founder @ Dulcy
P.S. No pitch. Just thought this could offer some practical ideas.
```

**"Wasn't sure ..." finance version** · later step (referral ask) · 2 threads, 2 positive, 0 booked · 2025-04-04 to 2025-04-05 · 2 wording variants
Subjects seen: `does this make sense {FIRST_NAME}?` (1), `thoughts {FIRST_NAME}?` (1)
```
Hey {FIRST_NAME},
Wasn’t sure if I should send this to you or {COLLEAGUE}.
Regardless, we’ve been helping B2B financial companies like yours build AI-personalized cold outreach systems to consistently generate qualified loan inquiries and keep pipeline full — without burning budget on ads or overloading your team. Can I share a few details with you or {COLLEAGUE}?
--

With best wishes,
Alex Woung
Founder @ Dulcy Media
p.s. or tell me to pound sand if you'd like..
```

#### 17. [DULCY] Funded Saas CE
EB id 69 · created 2025-03-28 · 6,617 sent · 9 interested (EmailBison) · Airtable: 11 reply threads, 9 positive, 3 booked · quoted emails dated 2025-03-28 to 2025-04-04 · copy recovered from 9 threads

**Lender/SaaS lookalike list + "PS - asking about {LOCAL_RESTAURANT}" (subject "{LOCAL_RESTAURANT}'s food - yes or no?")** · first touch · 6 threads, 6 positive, 2 booked · 2025-03-28 to 2025-04-03 · 6 wording variants
Subjects seen: `{LOCAL_RESTAURANT}'s food - yes or no?` (6)
```
Hey {FIRST_NAME},
Noticed your Series {ROUND} raise—have you explored using AI-personalized cold email + LinkedIn to scale outbound? You already {COMPANY_DESCRIPTION}, which makes your proof of value super strong. A simple campaign could have you generating conversations within days. Would it be cool if I put together a free lead list of 1,000 decision-makers similar to {CASESTUDY}? No strings—just thought it might be a good resource as you scale.
--

Sincerely,
Alexander W.
Founder @ Dulcy
PS - I know you get a ton of these emails, so I thought asking about {LOCAL_RESTAURANT} would cut through the noise - is it good?
```

**"we helped Visionair AI add $430K in pipeline last month" + 60-second video** · later step · 3 threads, 3 positive, 1 booked · 2025-03-31 to 2025-04-04 · 3 wording variants
Subjects seen: `{FIRST_NAME}?` (2), `quick question` (1)
```
{FIRST_NAME} — we helped Visionair AI add $430K in pipeline last month using our AI-personalized cold outreach system, built specifically for scaling SaaS companies. Mind if I send over a quick 60-second video showing how it could work for {COMPANY}?
--

Kind regards,
Alex Woung
Founder of Dulcy
p.s. or tell me to pound sand if you'd like..
```

#### 18. [Dulcy] 500 Leads (Google)
EB id 39 · created 2025-01-18 · 5,486 sent · 31 interested (EmailBison) · Airtable: 28 reply threads, 26 positive, 2 booked · quoted emails dated 2024-12-25 to 2025-02-11 · copy recovered from 24 threads

**"We have a B2B database with 500M email leads ... 500 leads based on your {CASESTUDY} case study"** · first touch · 9 threads, 9 positive, 2 booked · 2024-12-25 to 2025-02-11 · 9 wording variants
Subjects seen: `have you seen this {FIRST_NAME}` (4), `{FIRST_NAME}` (4), `question` (1)
```
Hi {FIRST_NAME} - I noticed on your site that you’re dedicated to helping clients create unique brands that really stand out in the market. We have a B2B database with 500M email leads, like to ZoomInfo or LinkedIn Navigator. I compiled 500 leads based on your {CASESTUDY} case study from your page - is this the best way to share them?
--

With best wishes,
A.W.
Founder of Dulcy LG
p.s. or tell me to pound sand if'd like..
```

**"I prepared a spreadsheet of 500 email leads similar to your {CASESTUDY} case study"** · follow-up · 15 threads, 15 positive, 0 booked · 2025-01-01 to 2025-02-05 · 15 wording variants
Subjects seen: `our outbound` (4), `thoughts {FIRST_NAME}?` (4), `ideas {FIRST_NAME}` (3), `our outreach` (2), `is this useful {FIRST_NAME}` (2)
```
Hi {FIRST_NAME}, I went ahead and assembled a spreadsheet of five hundred email leads from our database, based on your {CASESTUDY} case study, so you can get a feel for our data quality. Is this the best way to forward them to you?
--

With best wishes,
Alex W
Founder @ Dulcy Media
p.s. or tell me to pound sand if you'd like..
```

#### 19. Copy of [DULCY] Clutch PPC CE
EB id 102 · created 2025-03-28 · 7,685 sent · 11 interested (EmailBison) · Airtable: 14 reply threads, 12 positive, 2 booked · quoted emails dated 2025-04-04 to 2025-04-21 · copy recovered from 11 threads

**"Wasn't sure if I should send this to you or {COLLEAGUE}" + Digital Force proof** · later step (referral ask) · 6 threads, 6 positive, 1 booked · 2025-04-17 to 2025-04-21 · 6 wording variants
Subjects seen: `does this make sense {FIRST_NAME}?` (3), `thoughts {FIRST_NAME}?` (3)
```
Hi {FIRST_NAME},
Wasn’t sure if I should send this to you or {COLLEAGUE}.
Regardless, we just helped Digital Force close $25,000 in monthly recurring revenue in 1 month with our AI outbound system, and we’re confident we could do something similar for {COMPANY}. Can I send more info to you or {COLLEAGUE}?
--

Best wishes,
Alexander Woung
Founder @ Dulcy Media
p.s. or tell me to pound sand if you'd like..
```

**"Came across you on Clutch — helped TwoTreesPPC and TargetonStar" + 1k list** · first touch · 3 threads, 3 positive, 1 booked · 2025-04-04 to 2025-04-18 · 3 wording variants
Subjects seen: `Have you seen this {FIRST_NAME}?` (2), `{FIRST_NAME}?` (1)
```
Hey {FIRST_NAME},
Found you guys on Clutch.co—we’ve been assisting agencies like TwoTreesPPC and Target On Star land more sales opportunities with AI-personalized targeted emails. I can assemble a list with 1k ideal prospects for {COMPANY} from our database that are well-suited with your past clients. If it makes sense for {COMPANY}, I’d be glad to send over them for you to test in your outreach—would that make sense?
—

Kind regards,
Alex Woung
Founder @ Dulcy
p.s. or tell me to pound sand if you'd like..
```

**"Just curious why you're not leveraging omnichannel/cold email ... with case studies like {CASESTUDY}"** · first touch · 2 threads, 2 positive, 0 booked · 2025-04-11 to 2025-04-17 · 2 wording variants
Subjects seen: `Leads similar to {CASESTUDY}?` (2)
```
Hey {FIRST_NAME} - just curious, why isn’t {COMPANY} using cold email with AI to scale that faster? With case studies like {CASESTUDY}, you could effortlessly launch a results-based email sequence and line up a few calls. I'd love to send over a free lead list of 1K leads, including exec-level contacts at companies just like {CASESTUDY}. May I put it together?
—

Kind regards,
Alexander W.
Founder @ Dulcy Media
p.s. or tell me to pound sand if you'd like..
```

#### 20. [Dulcy] Content Agencies - 5-75 empl, USA/UK/CA - A-Leads (OV- Loom, Direct, Lead Magnet)
EB id 370 · created 2026-01-27 · 7,032 sent · 10 interested (EmailBison) · Airtable: 98 reply threads, 10 positive, 2 booked (5 of these threads, 0 positive, 0 booked, were first logged before this campaign existed: re-contacted leads whose status may come from an earlier campaign) · quoted emails dated 2026-01-27 to 2026-02-04 · copy recovered from 26 threads

**"Could {COMPANY} use more ICP sales opportunities? Only asking because ... $68k / 80 prospects"** · first touch · 4 threads, 1 positive, 1 booked · 2026-01-27 to 2026-01-29 · 4 wording variants
Subjects seen: `our omnichannel outreach` (3), `quick question` (1)
```
Hey {FIRST_NAME} - could {COMPANY} gain more content prospects monthly? Only asking because we manage omnichannel outreach campaigns (email combined with LinkedIn and calling) and just replicated this for two clients - one hit $68k from zero, the other booked 80 prospects in month one. Mind if I send more info?
--

With best wishes,
Alexander Woung
Founder of Dulcy
dulcy(.)io
p.s. or tell me to pound sand if you'd like..
```

**"We can build an omnichannel outreach system for {COMPANY} that books you 20+ sales opportunities per month"** · first touch · 7 threads, 4 positive, 0 booked · 2026-01-27 to 2026-02-04 · 7 wording variants
Subjects seen: `our omnichannel outreach` (5), `quick question` (1), `outreach question for {FIRST_NAME}` (1)
```
Hey {FIRST_NAME},
We can design an omnichannel outreach system for {COMPANY} that books you 20+ sales oppurtunites per month. Then we'll qualify prospects based on their Crunchbase profile and company data to make sure they're revenue-qualified - so you only take meetings that are valuable. Mind if I show a quick video explaining how this omnichannel process works?
--

Warm regards,
Alexander Woung
Founder of Dulcy
dulcy(.)io
p.s. or tell me to pound sand if you'd like..
```

**"Are you happy with your current meeting generation system?" + free email sequence** · first touch · 5 threads, 2 positive, 0 booked · 2026-01-27 to 2026-01-29 · 5 wording variants
Subjects seen: `our omnichannel outreach` (2), `quick question` (2), `outreach question for {FIRST_NAME}` (1)
```
Hey {FIRST_NAME},
Are you satisfied with your current meeting generation system? If not, I can create you a bespoke omnichannel outreach strategy in 2 weeks that schedules 20+ sales oppurtunity monthly. I actually crafted a free email sequence to show you what I can do - fully personalized for {COMPANY}'s value proposition and clients similar to {CASESTUDY}. Would you be keen in seeing that?
--

Warm regards,
Alex Woung
Founder of Dulcy
dulcy(.)io
p.s. or tell me to pound sand if you'd like..
```

**"Saw you're in charge of {COMPANY}'s growth. I mapped out an omnichannel strategy ... Loom"** · first touch · 8 threads, 1 positive, 0 booked · 2026-01-27 to 2026-02-04 · 8 wording variants
Subjects seen: `quick question` (5), `our omnichannel outreach` (2), `outreach question for {FIRST_NAME}` (1)
```
Hey {FIRST_NAME} noticed you're in charge of {COMPANY}'s growth.
I developed an omnichannel outreach strategy (cold email + LinkedIn + cold calling) that can schedule 20+ sales oppurtunites per month - consistently. We recently took a company from $10 to $68k monthly using this system, and generated for Slogan Social 80 interested prospects in their first month without any ad spend. Can I share a quick Loom walking through the strategy I built for you?
--

Thank you,
Alex Woung
Founder of Dulcy
dulcy(.)io
p.s. or tell me to pound sand if you'd like..
```

**"Just curious why you're not leveraging omnichannel/cold email ... with case studies like {CASESTUDY}"** · first touch · 2 threads, 0 positive, 0 booked · 2026-01-28 to 2026-01-28 · 2 wording variants
Subjects seen: `outreach question for {FIRST_NAME}` (1), `quick question` (1)
```
Hey {FIRST_NAME} I saw you’re in charge of {COMPANY}'s growth.
Just curious why you guys are not leveraging omnichannel outreach? With case studies, you could EASILY launch a case study campaign and get a couple meetings booked in. I can put together a thousand targeted leads similar to them with several custom email scripts to help you book in 5+ potential clients. Would you find that useful?
--

Kind regards,
Alex Woung
Founder of Dulcy
dulcy(.)io
p.s. or tell me to pound sand if you'd like..
```

#### 21. [Dulcy] Influencer Marketing Agencies, 5-50, USA - A-leads (DIRECT)
EB id 337 · created 2025-12-31 · 1,616 sent · 2 interested (EmailBison) · Airtable: 76 reply threads, 2 positive, 2 booked (1 of these threads, 0 positive, 0 booked, were first logged before this campaign existed: re-contacted leads whose status may come from an earlier campaign) · quoted emails dated 2026-01-02 to 2026-01-20 · copy recovered from 7 threads

**"Could I put together 1,000 ideal customer leads for {COMPANY} at no expense?" one-liner** · first touch · 6 threads, 1 positive, 1 booked · 2026-01-02 to 2026-01-07 · 6 wording variants
Subjects seen: `our next 1,000 leads` (6)
P.S. split: P.S. "Yes, it’s completely free. We only do this with businesses we’d genuinely love to work with.": 3 threads, 0 positive, 0 booked; P.S. "No twist, just a way to introduce what we do to companies we’d enjoy working with.": 3 threads, 1 positive, 1 booked
```
Hi {FIRST_NAME},

Could I put together 1,000 ideal customer leads for {COMPANY} at no expense?

Warm wishes,
Alexander Woung
Founder of Dulcy
dulcy(.)io

P.S. No twist, just a way to introduce what we do to companies we’d enjoy working with.
```

**"I've been helping B2B agencies ... 1,000 verified prospects + short video"** · first touch · 1 threads, 0 positive, 0 booked · 2026-01-20 to 2026-01-20 · 1 wording variants
Subjects seen: `our new pipeline` (1)
```
Hi {FIRST_NAME},
I've been helping agencies build predictable pipelines using an AI-driven omnichannel outreach system. To see if we’d actually be useful, I put together about 1,000 verified prospects for {COMPANY} and share a short video explaining how we’d target your offer and niche. Would you find that useful?

Yours truly,
Alex Woung
Founder of Dulcy
dulcy(.)io
P.S. or tell me to pound sand...
```

#### 22. [Dulcy] Digital Marketing Agencies, 5-75 Employ, USA/UK/CA, Clutch [Lead Magnet]
EB id 445 · created 2026-04-24 · 16,644 sent · 14 interested (EmailBison) · Airtable: 268 reply threads, 14 positive, 1 booked (7 of these threads, 1 positive, 1 booked, were first logged before this campaign existed: re-contacted leads whose status may come from an earlier campaign) · quoted emails dated 2026-04-23 to 2026-05-01 · copy recovered from 41 threads

**"If we built a list of 1,000 ideal customer leads on the house, and you could schedule 10+ interested leads..."** · first touch · 41 threads, 8 positive, 0 booked · 2026-04-23 to 2026-05-01 · 38 wording variants
Subjects seen: `our outreach` (20), `our leads` (12)
```
Hey {FIRST_NAME}, came across you on Clutch and I was wondering - if we put together a list of 1000 ideal customer leads for {COMPANY} on the house, and you could schedule 10+ interested leads into your calendar within a month, would you be open to taking a look?
--

Warm wishes,
Alexander Woung
Founder of Dulcy
dulcy(.)io
p.s. or tell me to pound sand..
```

#### 23. [Dulcy] Influencer Marketing Agencies, 5-50, USA - A-leads (LEAD MAGNET)
EB id 341 · created 2025-12-31 · 4,684 sent · 8 interested (EmailBison) · Airtable: 113 reply threads, 13 positive, 1 booked (15 of these threads, 1 positive, 1 booked, were first logged before this campaign existed: re-contacted leads whose status may come from an earlier campaign) · quoted emails dated 2025-12-31 to 2026-01-14 · copy recovered from 24 threads

**"We've built lead lists specifically for influencer agencies"** · first touch · 12 threads, 5 positive, 0 booked · 2025-12-31 to 2026-01-14 · 11 wording variants
Subjects seen: `our next 1,000 leads` (12)
```
Hey {FIRST_NAME},
We’ve built lead lists specifically for influencer agencies, brands already investing in creators (UGC, TikTok, IG, paid social). Could I put together 1,000 ideal customer leads for {COMPANY} at no expense?

Kind regards,
Alexander Woung
Founder of Dulcy
dulcy(.)io
```

**"I've been helping B2B agencies ... 1,000 verified prospects + short video"** · first touch · 4 threads, 2 positive, 0 booked · 2026-01-05 to 2026-01-13 · 4 wording variants
Subjects seen: `our new pipeline` (4)
```
Hey {FIRST_NAME},
I've been helping Influencer Marketing agencies create steady client flow using an automated AI-based omnichannel outreach system. To see if we’d actually be useful, I put together a thousand verified prospects for {COMPANY} and share a 60-second video explaining how we’d target your offer and niche. Would that be helpful to see?

Best regards,
Alex Woung
Founder of Dulcy
dulcy(.)io
```

**"the difference with these leads is intent" follow-up** · follow-up · 8 threads, 0 positive, 0 booked · 2026-01-02 to 2026-01-14 · 7 wording variants
Subjects seen: `your lead magnet` (8)
```
Hi {FIRST_NAME}, the difference with these leads is intent.
They’re filtered by signals like recent influencer spend, ecommerce activity, and marketing team size, so you’re not pitching brands that “might” care. If I shared the list, do you also have the system in place to put it to use?

Kind regards,
Alexander Woung
Founder of Dulcy
dulcy(.)io
P.S. or tell me to pound sand...
```

#### 24. [Dulcy] Clutch SSM Agencies Direct Offer
EB id 278 · created 2025-11-12 · 8,696 sent · 9 interested (EmailBison) · Airtable: 99 reply threads, 8 positive, 1 booked (3 of these threads, 0 positive, 0 booked, were first logged before this campaign existed: re-contacted leads whose status may come from an earlier campaign) · quoted emails dated 2025-11-19 to 2025-12-08 · copy recovered from 19 threads

**"Could I put together 1,000 ... Only asking because ... Scroll Stop and Slogan Social"** · first touch · 6 threads, 3 positive, 0 booked · 2025-11-19 to 2025-11-26 · 6 wording variants
Subjects seen: `our next 1,000 leads` (6)
P.S. split: P.S. "No twist, just a way to introduce what we do to companies we’d enjoy working with.": 3 threads, 2 positive, 0 booked; P.S. "Yes, it’s completely free. We only do this with businesses we’d genuinely love to work with.": 3 threads, 1 positive, 0 booked
```
Hey {FIRST_NAME},
Could I put together 1,000 ideal customer leads for {COMPANY} at no expense? Only asking because we recently helped other Clutch-verified agencies like Scroll Stop and Slogan Social generate 200+ interested inquiries in just a few weeks using our AI-driven omnichannel outbound system.

Warm regards,
Alexander Woung
Founder of Dulcy
dulcy(.)io
P.S. No twist, just a way to introduce what we do to companies we’d enjoy working with.
```

**"I've been helping B2B agencies ... 1,000 verified prospects + short video"** · first touch · 7 threads, 1 positive, 0 booked · 2025-11-24 to 2025-12-08 · 7 wording variants
Subjects seen: `our new pipeline` (7)
```
Hey {FIRST_NAME},
I've been helping B2B Clutch agencies generate consistent opportunities using an automated AI-based omnichannel outreach system. To see if we’d actually be useful, I create 1,000 verified prospects for {COMPANY} and share a quick video showing exactly how we’d approach your specific niche and offer. Would you find that useful?

Kind regards,
Alex Woung
Founder of Dulcy
dulcy(.)io
P.S. or tell me to pound sand...
```

**"did you review the lead magnet I mentioned? ... $180K" follow-up** · follow-up · 5 threads, 1 positive, 0 booked · 2025-11-28 to 2025-12-03 · 5 wording variants
Subjects seen: `your lead magnet` (5)
```
Hi {FIRST_NAME}, I wanted to see if you had looked at the lead magnet I mentioned. In 15 minutes, we’ll have your leads ready, show you exactly how we do it, and walk you through the same email flow that helped one of our clients generate $180K in new business. Mind if I send over some more info?

Yours truly,
Alex Woung
Founder of Dulcy
dulcy(.)io
P.S. or tell me to pound sand...
```

**"You mentioned you would be back by this time" post-out-of-office nudge (subject "Back to work?")** · follow-up after OOO · 1 threads, 1 positive, 0 booked · 2025-12-02 to 2025-12-02 · 1 wording variants
Subjects seen: `Back to work?` (1)
```
Hey {FIRST_NAME},
You mentioned you would be back by this time – I reached out a couple days ago. Hopefully we can catch up. Did you get a chance to look at my previous message? Cheers
```

#### 25. Copy of [DULCY] MISS G550
Not in the 32 list (extra campaign found in Airtable) · Airtable: 16 reply threads, 6 positive, 1 booked · quoted emails dated 2025-07-01 to 2025-07-01 · copy recovered from 13 threads

**"1,000 leads similar to {CASESTUDY}" one-liner** · first touch · 13 threads, 6 positive, 1 booked · 2025-07-01 to 2025-07-01 · 13 wording variants
Subjects seen: `similar to {CASESTUDY}` (4), `Leads similar to your ideal clients?` (4), `More clients like {CASESTUDY}?` (2), `similar to your ideal clients` (1), `More clients like your ideal clients?` (1)
```
{FIRST_NAME} - could I send over 1,000 ideal customer leads similar to your ideal clients (full name, email, company name, linkedin, etc.) for you to use in any outbound marketing efforts? It’s at no cost to you. Just let me know if you’d want to see it.
--

Yours truly,
Alexander Woung
Dulcy Media
p.s. or tell me to pound sand if you'd like..
```

#### 26. Copy of [Dulcy] Clutch Video Production Agencies Direct Offer
EB id 306 · created 2025-11-29 · 5,921 sent · 4 interested (EmailBison) · Airtable: 104 reply threads, 5 positive, 1 booked (4 of these threads, 0 positive, 0 booked, were first logged before this campaign existed: re-contacted leads whose status may come from an earlier campaign) · quoted emails dated 2025-12-01 to 2025-12-24 · copy recovered from 35 threads

**"You mentioned you would be back by this time" post-out-of-office nudge (subject "Back to work?")** · follow-up after OOO · 1 threads, 1 positive, 1 booked · 2025-12-04 to 2025-12-04 · 1 wording variants
Subjects seen: `Back to work?` (1)
```
Hey {FIRST_NAME},
You mentioned you would be back by this time – I reached out a couple days ago. Hopefully we can catch up. Did you get a chance to look at my previous message? Cheers Alex Woung
Founder of Dulcy
dulcy(.)io
```

**"I've been helping B2B agencies ... 1,000 verified prospects + short video"** · first touch · 11 threads, 2 positive, 0 booked · 2025-12-04 to 2025-12-12 · 11 wording variants
Subjects seen: `our new pipeline` (10)
```
Hi {FIRST_NAME},
I've been helping B2B Clutch video production agencies generate consistent opportunities using an automated AI-based omnichannel outreach system. To see if we’d actually be useful, I put together 1,000 verified prospects for {COMPANY} and share a short video explaining how we’d target your offer, audience, and positioning. Would you find that useful?

Yours truly,
Alexander Woung
Founder of Dulcy
dulcy(.)io
P.S. or tell me to pound sand...
```

**"did you review the lead magnet I mentioned? ... $180K" follow-up** · follow-up · 13 threads, 1 positive, 0 booked · 2025-12-01 to 2025-12-24 · 13 wording variants
Subjects seen: `your lead magnet` (13)
```
Hi {FIRST_NAME}, I wanted to see if you had gone through the lead magnet I mentioned. In 15 minutes, we’ll have your leads ready, show you exactly how we do it, and walk you through the same email framework that helped one of our clients generate $180K in new business. Mind if I send over some more info?

Best regards,
Alexander Woung
Founder of Dulcy
dulcy(.)io
P.S. or tell me to pound sand...
```

**"Could {COMPANY} use more production leads each month?"** · first touch · 10 threads, 1 positive, 0 booked · 2025-12-02 to 2025-12-04 · 10 wording variants
Subjects seen: `our next 1,000 leads` (10)
P.S. split: P.S. "No twist, just a way to introduce what we do to companies we’d enjoy working with.": 8 threads, 1 positive, 0 booked; P.S. "Yes, it’s completely free. We only do this with businesses we’d genuinely love to work with.": 2 threads, 0 positive, 0 booked
```
Could {COMPANY} use more production leads each month? Only asking because we recently helped other Clutch-listed agencies like Awing Visual Studios and Josubu Productions book 70+ meetings in just a few weeks using our AI omnichannel outbound system. To show how it could work for you, I can pull together 1,000 ideal prospects at no expense so you can see the quality firsthand. Mind if I put it together?

Thank you,
Alexander Woung
Founder of Dulcy
dulcy(.)io
P.S. No twist, just a way to introduce what we do to companies we’d enjoy working with.
```

#### 27. [DULCY] Business Loans CE
EB id 67 · created 2025-03-27 · 4,078 sent · 5 interested (EmailBison) · Airtable: 9 reply threads, 5 positive, 1 booked · quoted emails dated 2025-03-27 to 2025-04-14 · copy recovered from 9 threads

**"how three competing lenders have increased loan volume by 57%" breakdown** · later step · 1 threads, 1 positive, 1 booked · 2025-04-04 to 2025-04-04 · 1 wording variants
Subjects seen: `{FIRST_NAME}?` (1)
```
Hi {FIRST_NAME},

I put together a short breakdown on how three competing lenders have grown loan volume 57% this year — all using scalable outbound outreach.

Would it be helpful if I sent that over?

--

Best regards,
Alexander Woung
Founder @ Dulcy

p.s. Nothing to sell. Just thought this could offer some practical ideas.
```

**Lender/SaaS lookalike list + "PS - asking about {LOCAL_RESTAURANT}" (subject "{LOCAL_RESTAURANT}'s food - yes or no?")** · first touch · 6 threads, 4 positive, 0 booked · 2025-03-27 to 2025-04-09 · 6 wording variants
Subjects seen: `{LOCAL_RESTAURANT}'s food - yes or no?` (6)
```
Hey {FIRST_NAME},
Saw {COMPANY} is helping businesses get funded — just curious, why isn’t {COMPANY} using cold email with AI to scale that faster? We’ve built a system using AI-driven outreach across email and LinkedIn that’s helping B2B financial services companies steadily bring in leads — without overspending on ads. Would it be alright if I assemble a no-cost list of 1k ideal prospects for {COMPANY}? Completely risk-free — just let me know if you’d be interested.

Yours truly,
Alexander W.
Founder of Dulcy Media
PS - I know you get a ton of these emails, so I thought asking about {LOCAL_RESTAURANT} would cut through the noise - is it good?
```

**"Wasn't sure ..." finance version** · later step (referral ask) · 2 threads, 0 positive, 0 booked · 2025-04-07 to 2025-04-14 · 2 wording variants
Subjects seen: `thoughts {FIRST_NAME}?` (2)
```
Hey {FIRST_NAME}, Wasn’t sure if I should send this to you or {COLLEAGUE}. Regardless, we’ve been helping B2B financial companies like yours build AI-personalized cold outreach systems to consistently generate qualified loan inquiries and keep pipeline full — without burning budget on ads or overloading your team. Can I send more info to you or {COLLEAGUE}?
--

Warm regards,
Alexander W.
Founder of Dulcy Media
p.s. or tell me to pound sand if you'd like..
```

#### 28. [Dulcy] Clay Marketing Agencies Direct Offer
EB id 275 · created 2025-11-12 · 1,495 sent · 2 interested (EmailBison) · Airtable: 20 reply threads, 2 positive, 1 booked (1 of these threads, 0 positive, 0 booked, were first logged before this campaign existed: re-contacted leads whose status may come from an earlier campaign) · quoted emails dated 2025-11-11 to 2025-11-12 · copy recovered from 4 threads

**"Could I put together 1,000 ideal customer leads for {COMPANY} at no expense?" one-liner** · first touch · 4 threads, 2 positive, 1 booked · 2025-11-11 to 2025-11-12 · 3 wording variants
Subjects seen: `our next 1,000 leads` (4)
P.S. split: P.S. "No twist, just a way to introduce what we do to companies we’d enjoy working with.": 1 threads, 0 positive, 0 booked; P.S. "Yes, it’s completely free..." + "No twist...": 3 threads, 2 positive, 1 booked
```
Could I put together 1,000 ideal customer leads for {COMPANY} at no expense?

Best wishes,
Alex Woung
Founder of Dulcy
dulcy(.)io
P.S. Yes, it’s completely free. We only do this with businesses we’d genuinely love to work with. No twist, just a way to introduce what we do to companies we’d enjoy working with.
```

#### 29. [Dulcy] Digital Marketing Agencies - 5-75 empl, USA/UK/CA - GoodFirms (Lead Magnet w/Thread)
EB id 372 · created 2026-01-27 · 12,872 sent · 7 interested (EmailBison) · Airtable: 69 reply threads, 7 positive, 0 booked · quoted emails dated 2026-01-27 to 2026-02-11 · copy recovered from 12 threads

**"Are you happy with your current meeting generation system?" + free email sequence** · first touch · 5 threads, 2 positive, 0 booked · 2026-01-27 to 2026-02-04 · 5 wording variants
Subjects seen: `Leads similar to {CASESTUDY}?` (2), `More clients like {CASESTUDY}?` (1), `More clients like your ideal clients?` (1), `similar to {CASESTUDY}` (1)
```
Hey {FIRST_NAME},
Are you satisfied with how many meetings you're currently scheduling? If not, I can build you a tailored omnichannel outreach system in 2 weeks that books at least 20 sales opportunities monthly. I actually created a free email sequence to show you what I can do - fully personalized for {COMPANY}'s value prop and leads similar to {CASESTUDY}. Would you be interested in seeing that?

Thanks,
Alexander Woung
Founder of Dulcy
dulcy(.)io
p.s. or tell me to pound sand if you'd like..
```

**"Just curious why you're not leveraging omnichannel/cold email ... with case studies like {CASESTUDY}"** · first touch · 3 threads, 2 positive, 0 booked · 2026-01-28 to 2026-02-04 · 3 wording variants
Subjects seen: `Leads similar to {CASESTUDY}?` (1), `More clients like {CASESTUDY}?` (1), `Leads similar to your ideal clients?` (1)
```
Hey {FIRST_NAME} I noticed you’re in charge of {COMPANY}'s growth. Just curious why you guys aren't leveraging omnichannel outreach? With case studies like {CASESTUDY}, you could EASILY launch a case study campaign and get a couple meetings booked in. I can put together 1,000 targeted leads similar to them with a couple custom email scripts to help you book in 5+ potential clients. Would that be helpful to you?

Thank you,
Alexander Woung
Founder of Dulcy
dulcy(.)io
p.s. or tell me to pound sand if you'd like..
```

**"1,000 leads similar to {CASESTUDY}" one-liner** · first touch · 4 threads, 1 positive, 0 booked · 2026-01-27 to 2026-02-11 · 4 wording variants
Subjects seen: `More clients like {CASESTUDY}?` (2), `similar to {CASESTUDY}` (1), `similar to your ideal clients` (1)
```
{FIRST_NAME} - could I send over a thousand ideal customer leads similar to your ideal clients (full name, email, company name, LinkedIn, etc.) for you to use in any outbound marketing efforts? It’s at no cost to you. Just let me know if you’d want to have a look.

Warm regards,
Alex Woung
Founder of Dulcy
dulcy(.)io
p.s. or tell me to pound sand if you'd like..
```

#### 30. [Dulcy] Clutch PPC - 7-75 empl, USA/UK/CA (Milkbox) - A-Leads (Lead Magnet)
EB id 359 · created 2026-01-27 · 6,011 sent · 2 interested (EmailBison) · Airtable: 49 reply threads, 2 positive, 0 booked · quoted emails dated 2026-01-29 to 2026-02-09 · copy recovered from 8 threads

**"1,000 leads similar to {CASESTUDY}" one-liner** · first touch · 4 threads, 1 positive, 0 booked · 2026-01-29 to 2026-01-29 · 4 wording variants
Subjects seen: `Leads similar to your ideal clients?` (1), `similar to {CASESTUDY}` (1), `More clients like your ideal clients?` (1), `similar to your ideal clients` (1)
```
{FIRST_NAME} - could I send over 1,000 ideal customer leads similar to your ideal clients (full name, email, company name, linkedin, etc.) for you to use in any outbound marketing efforts? It’s at no cost to you. Just let me know if you’d want to see it.
--

Kind regards,
Alex Woung
Founder of Dulcy
dulcy(.)io
p.s. or tell me to pound sand if you'd like..
```

**"I reached out ... about building {COMPANY} a list" bump** · follow-up (step 2) · 3 threads, 0 positive, 0 booked · 2026-01-30 to 2026-02-03 · 3 wording variants
Subjects seen: `Have you seen this {FIRST_NAME}?` (2), `quick question` (1)
```
Hi {FIRST_NAME},

I reached out a couple of days ago about building {COMPANY} a list with one thousand ideal prospects from our database that align perfectly to your ideal clients for free.

If it makes sense for {COMPANY}, I’d be glad to put it together them for you to explore in your outreach, would that be okay?

--

Kind regards,
Alex Woung
Founder of Dulcy
dulcy(.)io

p.s. or tell me to pound sand if you'd like..
```

**"Wasn't sure if I should send this to you or {COLLEAGUE}" + free 1,000-lead list** · later step (referral ask) · 1 threads, 0 positive, 0 booked · 2026-02-09 to 2026-02-09 · 1 wording variants
Subjects seen: `thoughts {FIRST_NAME}?` (1)
```
Hey {FIRST_NAME},
Wasn’t sure if I should send this to you or {COLLEAGUE}.
Regardless, we've been helping dozens of marketing agencies such as yourself secure more ideal clients with confidence with our AI omnichannel system. Would you or {COLLEAGUE} be better to speak to about this?
--

Yours truly,
Alexander Woung
Founder of Dulcy
dulcy(.)io
p.s. To see if we’d actually be useful, I’d be happy to build you a free list of 1,000 leads so you can test our data quality firsthand. p.p.s. or tell me to pound sand if you'd like..
```

#### 31. [DULCY] SaaS Companies US/UK/CA
EB id 257 · created 2025-11-13 · 6,112 sent · 1 interested (EmailBison) · Airtable: 37 reply threads, 1 positive, 0 booked · quoted emails dated 2025-11-18 to 2025-12-03 · copy recovered from 9 threads

**"Every founder loves word of mouth until referrals dry up" (subject "referrals are cute, predictability is hotter")** · first touch · 9 threads, 1 positive, 0 booked · 2025-11-18 to 2025-12-03 · 9 wording variants
Subjects seen: `referrals are cute, predictability is hotter` (8)
```
Most leaders loves “word of mouth” until referrals dry up.
Dulcy builds outbound systems that get strangers responding like they owe you a coffee. No fluff. No ego-stroking. Just data-backed targeting and messaging that cuts through the noise. Want a sample lead list so you can see if we talk big or deliver bigger? Alex Founder @ Dulcy (yes, a human wrote this, no GPTs were harmed in the process)
```

#### 32. [Dulcy] Clutch Video Production Agencies Direct Offer
EB id 279 · created 2025-11-12 · 2,817 sent · 1 interested (EmailBison) · Airtable: 34 reply threads, 1 positive, 0 booked (1 of these threads, 0 positive, 0 booked, were first logged before this campaign existed: re-contacted leads whose status may come from an earlier campaign) · quoted emails dated 2025-11-14 to 2025-11-24 · copy recovered from 7 threads

**"Could {COMPANY} use more production leads each month?"** · first touch · 3 threads, 0 positive, 0 booked · 2025-11-14 to 2025-11-18 · 3 wording variants
Subjects seen: `our next 1,000 leads` (3)
P.S. split: P.S. "Yes, it’s completely free. We only do this with businesses we’d genuinely love to work with.": 1 threads, 0 positive, 0 booked; P.S. "No twist, just a way to introduce what we do to companies we’d enjoy working with.": 2 threads, 0 positive, 0 booked
```
Could {COMPANY} use more production leads each month?
Only asking because we recently helped other Clutch-listed agencies like Awing Visual Studios and Josubu Productions book over 70 meetings in a single month using our AI omnichannel outbound system. To show how it could work for you, I can pull together 1,000 ideal prospects at no expense so you can see the quality firsthand. Mind if I put it together?

Yours truly,
Alexander Woung
Founder of Dulcy
dulcy(.)io
P.S. No twist, just a way to introduce what we do to companies we’d enjoy working with.
```

**"I've been helping B2B agencies ... 1,000 verified prospects + short video"** · first touch · 2 threads, 0 positive, 0 booked · 2025-11-20 to 2025-11-24 · 2 wording variants
Subjects seen: `our new pipeline` (2)
```
Hi {FIRST_NAME},
I've been helping B2B Clutch video production agencies generate consistent opportunities using an automated AI-based omnichannel outreach system. To see if we’d actually be useful, I assemble about 1,000 verified prospects for {COMPANY} and share a short video explaining how we’d target your offer, audience, and positioning. Would that be helpful to see?

Warm regards,
Alex Woung
Founder of Dulcy
dulcy(.)io
P.S. or tell me to pound sand...
```

**"did you review the lead magnet I mentioned? ... $180K" follow-up** · follow-up · 2 threads, 0 positive, 0 booked · 2025-11-19 to 2025-11-20 · 2 wording variants
Subjects seen: `your lead magnet` (2)
```
Hi {FIRST_NAME}, Just checking if you had gone through the lead magnet I mentioned. In 15 minutes, we can have the data prepped, show you exactly how we do it, and walk you through the same email framework that helped one of our clients generate $180K in new business. Mind if I send over some more info?

Yours truly,
Alexander Woung
Founder of Dulcy
dulcy(.)io
P.S. or tell me to pound sand...
```


# What worked: Dulcy cold-email campaign history (Jan 2025 to Nov 2026)

Built by Atlas for Atlas and Forge, 2026-11-17. Read-only analysis; no records changed.
**Internal history only.** Client results below are not proof Dulcy can quote in copy (RULES non-negotiable 3). Never reuse one client's numbers or claims for another.

## Scope and method
- Source: Airtable base `appxqINt5XKw7a76A`, table Campaigns `tblAVAA6uBPaMj28P`, read 2026-11-17. **468 campaign records** (the 307 in SCHEMA.md is the Campaigns table's field count, not records). 34 workspaces have sends (25 PAST, 7 CURRENT incl. both Twenty West workspaces, 2 DULCY: "Dulcy" and "Dulcy Free Campaigns"); 2 test records have no workspace.
- 399 records have contacted > 0; **346 have 300+ contacted** (used for all ranking, medians and breakdowns); 53 have 1-299 contacted (counted in totals only); 69 never sent.
- Created dates of ranked campaigns: 2025-01-16 to 2026-11-09.
- Metrics: reply % = replies / contacted; interested % = interested / replies; meetings per 1k = meetings booked / contacted x 1,000; bounce % = bounced / contacted. All are Airtable campaign fields (synced from EmailBison), not re-checked in EmailBison.
- Owner tag: CURRENT = 6 active clients (Twenty West's old workspace "Twenty West Media" is Inactive but the client is current, so it counts as CURRENT); DULCY = Dulcy's own and its free trial campaigns for prospects; PAST = inactive workspaces (incl. Visionair AI, an "Internal" legacy workspace).
- Offer, ICP, geography and lead source were classified by script from the campaign name, the step-1 copy (Sequence Analytics "Email Copy Snapshot", 472 step-1 rows for 188 campaigns, plus the Campaign "Script Copy Email 1" field) and, for old campaigns with no copy stored, the reply subject lines in the Emails table (subject only; no prospect data kept). Confidence per campaign: **high** = read from copy (175), **medium** = from name label (71), **low** = inferred from reply subjects or sibling campaigns (49), **UNKNOWN** = no evidence (51).
- Offer rules: free list/sample (free leads, list of 500/1,000, "5 leads", 10-account map); free audit/review/ideas (audit, notes, personalised ideas, Loom of their pages); free content (whitepaper/research-interview ask, generic 2-minute education video); free asset/work/trial (free video, shoot, ads, form build, campaign, demo agent); case-study/direct pitch (service pitch, case study, "creators for you, worth a chat?"); direct pitch local/lunch intro ("I'm nearby, lunch at {RESTAURANT}?"); pay-per-result/guarantee (pay only on results, "it's on us"); question-led (asks about their situation, no offer). Mixed-variant campaigns take the first matching rule.
- Dulcy's 2025 code-named campaigns (CPPC G63, GFPPC Hyper C63S, APPC E53, MISS G550) were tagged free list from reply subjects "Leads similar to {client}? / More clients like {client}?" (medium). "CE" campaigns were tagged lunch intro from subjects "{restaurant}'s food - yes or no?" (medium).

## 1. Overall (campaigns with 300+ contacted, n = 346)
| Measure | Pooled (sum / sum) | Median per campaign |
|---|---:|---:|
| Contacted | 1,168,770 | - |
| Reply % | 4.01 (46,876 replies) | 3.80 |
| Interested % of replies | 10.59 (4,966 interested) | 6.87 |
| Meetings per 1k contacted | 0.58 (676 meetings) | 0.21 |
| Bounce % | 2.90 (33,843 bounced) | 1.89 |

- All 399 campaigns with sends: 1,176,242 contacted, 47,248 replies (4.02%), 5,016 interested (10.62%), 684 meetings (0.58 per 1k), 34,304 bounced (2.92%).
- 160 of 346 (46%) booked 0 meetings; 62 reached 1+ meeting per 1k. The top 20 campaigns by meetings hold 293 of 676 meetings (43%).
- 86 of 346 (25%) are over the 4% bounce pause line; 58 more are in the 2.5-4% watch band.
- Campaigns with interested >= 15% of replies (70) booked 1.23 per 1k; the other 276 booked 0.38.

## 2. By owner, client vertical, ICP and geography
| Owner | Camps | Contacted | Reply % | Interested % of replies (n) | Mtg / 1k (n) | Bounce % | Median mtg/1k | 0-mtg camps |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| DULCY | 57 | 269,950 | 4.85 | 9.0 (1,175) | 0.90 (244) | 2.76 | 0.49 | 19 |
| CURRENT | 111 | 331,552 | 4.60 | 14.5 (2,203) | 0.52 (172) | 4.42 | 0.22 | 52 |
| PAST | 178 | 567,268 | 3.27 | 8.6 (1,588) | 0.46 (260) | 2.07 | 0.03 | 89 |

Meetings per 100 interested: DULCY 20.8, PAST 16.4, **CURRENT 7.8**. Current clients get the most interested replies but convert the fewest to recorded meetings (MJJ: 36 interested, 0 meetings recorded; MJJ handles its own replies).

| Client vertical (client's own industry) | Camps | Contacted | Reply % | Interested % of replies (n) | Mtg / 1k (n) | Bounce % | Median mtg/1k | 0-mtg camps |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| UNKNOWN (Leadodo, no profile) | 2 | 5,548 | 1.53 | 12.9 (11) | 1.26 (7) | 1.05 | 1.09 | 0 |
| Outbound/lead-gen agency (Dulcy) | 57 | 269,950 | 4.85 | 9.0 (1,175) | 0.90 (244) | 2.76 | 0.49 | 19 |
| Creative/influencer/video | 66 | 185,884 | 4.94 | 12.8 (1,172) | 0.70 (130) | 3.39 | 0.00 | 34 |
| Marketing agency (full-service/ads/web) | 85 | 254,895 | 4.20 | 14.2 (1,518) | 0.56 (143) | 4.07 | 0.34 | 34 |
| Marketing agency (ecom/Amazon/Shopify) | 30 | 82,394 | 4.44 | 8.9 (327) | 0.45 (37) | 2.90 | 0.25 | 12 |
| Software/SaaS | 33 | 135,880 | 2.96 | 9.0 (364) | 0.42 (57) | 2.62 | 0.00 | 17 |
| Direct mail/print | 18 | 51,411 | 2.40 | 5.1 (63) | 0.39 (20) | 2.08 | 0.21 | 8 |
| PR/research services | 11 | 72,705 | 2.30 | 8.7 (146) | 0.26 (19) | 1.20 | 0.08 | 4 |
| SEO/web agency | 21 | 46,964 | 3.19 | 7.8 (117) | 0.23 (11) | 1.71 | 0.00 | 16 |
| Fintech/adtech | 19 | 60,096 | 2.65 | 2.3 (37) | 0.13 (8) | 1.34 | 0.00 | 12 |
| Jewelry manufacturing | 4 | 3,043 | 4.44 | 26.7 (36) | 0.00 (0) | 5.32 | 0.00 | 4 |

| Target ICP (who was emailed) | Camps | Contacted | Reply % | Interested % of replies (n) | Mtg / 1k (n) | Bounce % | Median mtg/1k | 0-mtg camps |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| Agencies (marketing/ad/SEO/web/PR) | 73 | 360,708 | 4.29 | 9.0 (1,399) | 0.78 (282) | 2.39 | 0.44 | 23 |
| DTC/consumer & ecom brands | 124 | 329,373 | 4.90 | 11.4 (1,848) | 0.59 (195) | 3.20 | 0.22 | 59 |
| Home/local services & contractors | 62 | 189,648 | 3.64 | 15.9 (1,094) | 0.52 (98) | 4.72 | 0.00 | 32 |
| Professional/financial services | 39 | 146,646 | 2.95 | 8.2 (356) | 0.50 (74) | 2.15 | 0.35 | 15 |
| UNKNOWN | 2 | 2,488 | 3.14 | 5.1 (4) | 0.40 (1) | 4.78 | 0.39 | 1 |
| Public sector/nonprofit/education | 12 | 61,807 | 3.34 | 7.7 (160) | 0.21 (13) | 1.99 | 0.12 | 5 |
| Software/SaaS/tech | 10 | 40,038 | 1.91 | 5.1 (39) | 0.20 (8) | 1.10 | 0.03 | 5 |
| Manufacturing/industrial | 16 | 31,272 | 2.73 | 3.3 (28) | 0.16 (5) | 1.75 | 0.00 | 12 |
| Jewelry trade (retailers/brands) | 4 | 3,043 | 4.44 | 26.7 (36) | 0.00 (0) | 5.32 | 0.00 | 4 |
| Healthcare/clinics | 2 | 724 | 2.07 | 6.7 (1) | 0.00 (0) | 8.43 | 0.00 | 2 |
| Other | 2 | 3,023 | 2.91 | 1.1 (1) | 0.00 (0) | 0.83 | 0.00 | 2 |

| Target geography (from campaign name) | Camps | Contacted | Reply % | Interested % of replies (n) | Mtg / 1k (n) | Bounce % | Median mtg/1k | 0-mtg camps |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| Local/regional US | 9 | 12,868 | 5.23 | 12.0 (81) | 1.32 (17) | 1.06 | 0.63 | 2 |
| US+UK(+CA/AU) | 36 | 176,827 | 5.03 | 11.7 (1,042) | 0.59 (105) | 4.29 | 0.26 | 13 |
| UNKNOWN (not in name) | 196 | 708,761 | 3.59 | 8.3 (2,123) | 0.59 (416) | 1.99 | 0.18 | 89 |
| US/North America | 92 | 251,890 | 4.20 | 15.6 (1,653) | 0.53 (134) | 4.39 | 0.06 | 46 |
| UK | 6 | 14,617 | 6.94 | 5.6 (57) | 0.27 (4) | 4.50 | 0.14 | 3 |
| France | 7 | 3,807 | 6.62 | 4.0 (10) | 0.00 (0) | 7.88 | 0.00 | 7 |

## 3. By first-touch offer
| First-touch offer | Camps | Contacted | Reply % | Interested % of replies (n) | Mtg / 1k (n) | Bounce % | Median mtg/1k | 0-mtg camps |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| Free list/sample | 31 | 160,934 | 4.90 | 11.2 (883) | 1.19 (192) | 3.25 | 0.54 | 11 |
| Direct pitch (local/lunch intro) | 12 | 21,881 | 3.79 | 14.2 (118) | 1.19 (26) | 1.85 | 1.05 | 2 |
| Question-led | 15 | 67,437 | 3.71 | 12.5 (313) | 0.73 (49) | 1.78 | 0.52 | 3 |
| Free content (whitepaper/edu video) | 32 | 132,451 | 3.63 | 10.2 (492) | 0.51 (68) | 3.58 | 0.53 | 5 |
| Free audit/review/ideas | 76 | 181,439 | 4.83 | 9.1 (801) | 0.50 (90) | 3.01 | 0.00 | 39 |
| Case-study/direct pitch | 80 | 318,554 | 4.04 | 12.1 (1,559) | 0.48 (152) | 3.21 | 0.09 | 38 |
| Pay-per-result/guarantee | 11 | 26,462 | 3.84 | 11.0 (112) | 0.45 (12) | 2.92 | 0.34 | 5 |
| Free asset/work/trial | 38 | 105,345 | 3.96 | 10.5 (440) | 0.45 (47) | 2.70 | 0.00 | 24 |
| UNKNOWN | 51 | 154,267 | 2.62 | 6.1 (248) | 0.26 (40) | 1.92 | 0.00 | 33 |

| First-touch offer (clients only, Dulcy excluded) | Camps | Contacted | Reply % | Interested % of replies (n) | Mtg / 1k (n) | Bounce % | Median mtg/1k | 0-mtg camps |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| Direct pitch (local/lunch intro) | 5 | 10,934 | 3.59 | 15.8 (62) | 1.01 (11) | 1.66 | 0.24 | 2 |
| Free list/sample | 7 | 11,175 | 4.33 | 13.2 (64) | 0.81 (9) | 4.76 | 0.00 | 4 |
| Question-led | 15 | 67,437 | 3.71 | 12.5 (313) | 0.73 (49) | 1.78 | 0.52 | 3 |
| Free content (whitepaper/edu video) | 32 | 132,451 | 3.63 | 10.2 (492) | 0.51 (68) | 3.58 | 0.53 | 5 |
| Free audit/review/ideas | 70 | 167,168 | 4.51 | 9.6 (724) | 0.51 (85) | 2.93 | 0.00 | 36 |
| Free asset/work/trial | 36 | 85,911 | 4.02 | 11.8 (408) | 0.48 (41) | 3.09 | 0.00 | 23 |
| Case-study/direct pitch | 68 | 251,350 | 3.89 | 14.1 (1,378) | 0.47 (119) | 3.53 | 0.04 | 34 |
| Pay-per-result/guarantee | 11 | 26,462 | 3.84 | 11.0 (112) | 0.45 (12) | 2.92 | 0.34 | 5 |
| UNKNOWN | 45 | 145,932 | 2.61 | 6.2 (238) | 0.26 (38) | 1.73 | 0.00 | 29 |

- Free list wins overall, but 24 of its 31 campaigns are Dulcy's own (149,759 contacted, 1.22 per 1k). For clients it is only Lead Flo (7 camps, 0.81 per 1k, 4.76% bounce), and Lead Flo can only fulfil free leads in Southern California (client file).
- Free audit/review and free asset/work are the most used client offers (106 camps) but half or more booked nothing (client campaigns: 36 of 70 audits and 23 of 36 free-work offers at zero meetings).

## 4. Top 15 by meetings per 1k contacted (300+ contacted)
Small lists swing hard: #1, #2 and #4 rest on 3-4 meetings each.

| # | Campaign | Owner | Created | Contacted | Mtg/1k (n) | Int % (n) | Bounce % | Client vertical | ICP; geo | Offer [confidence] | Source | Record |
|---|---|---|---|---:|---:|---:|---:|---|---|---|---|---|
| 1 | [Dulcy] Florida Marketing Agencies, 11-50 Emplys, FL, USA - Discolike (Direct  | DULCY | 2026-06 | 550 | 7.27 (4) | 21.1 (12) | 0.55 | Outbound/lead-gen agency (Dulcy) | Agencies (marketing/ad/SEO/web/PR); Local/regional US | Direct pitch (local/lunch intro) [high] | DiscoLike | `rec952gZ1QXdIJWu6` |
| 2 | [Lead Flo Marketing] Luxury Real Estate Groups, Orange County CA, DiscoLike (F | CURRENT | 2026-09 | 425 | 7.06 (3) | 50.0 (17) | 2.12 | Marketing agency (full-service/ads/web) | Home/local services & contractors; Local/regional US | Free asset/work/trial [high] | DiscoLike | `rece31tiqzT4PuAm3` |
| 3 | [Slogan Social] North America OV | PAST | 2025-06 | 2,236 | 5.37 (12) | 29.9 (79) | 1.12 | Creative/influencer/video | DTC/consumer & ecom brands; US/North America | Question-led [low] | n/a | `recW20pT3ckoTGlA5` |
| 4 | [Lead FLO Marketing] General Contracting - 11-200 Empl, Southern CA, Discolike | CURRENT | 2026-07 | 826 | 4.84 (4) | 30.0 (18) | 4.96 | Marketing agency (full-service/ads/web) | Home/local services & contractors; Local/regional US | Direct pitch (local/lunch intro) [high] | DiscoLike | `rec2t2MmIDDl2NpwS` |
| 5 | [DULCY] CPPC G63 | DULCY | 2025-01 | 5,463 | 4.03 (22) | 31.1 (71) | 2.64 | Outbound/lead-gen agency (Dulcy) | Agencies (marketing/ad/SEO/web/PR); geo n/a | Free list/sample [medium] | Clutch | `recs4usLYWf0J6Qp3` |
| 6 | [DULCY] GFPPC Hyper C63S | DULCY | 2025-01 | 1,030 | 3.88 (4) | 17.2 (11) | 1.75 | Outbound/lead-gen agency (Dulcy) | Agencies (marketing/ad/SEO/web/PR); geo n/a | Free list/sample [medium] | GoodFirms/Agency Vista | `recfL02H5JpjGhNIT` |
| 7 | [A-Wing Visuals] Roofers Campaign  | PAST | 2025-06 | 2,138 | 3.74 (8) | 20.0 (24) | 1.78 | Creative/influencer/video | Home/local services & contractors; geo n/a | Free audit/review/ideas [low] | n/a | `recXvLcArbQOWO5qs` |
| 8 | [Amazon Consultancy] Beauty Listkit - MV | PAST | 2025-03 | 1,513 | 3.30 (5) | 23.0 (14) | 0.99 | Marketing agency (ecom/Amazon/Shopify) | DTC/consumer & ecom brands; geo n/a | Free audit/review/ideas [low] | ListKit | `rec5lzgrwMHc9JYGz` |
| 9 | [Dulcy] Clutch Free Leads (Google) | DULCY | 2025-01 | 1,650 | 3.03 (5) | 37.3 (25) | 0.91 | Outbound/lead-gen agency (Dulcy) | Agencies (marketing/ad/SEO/web/PR); geo n/a | Free list/sample [medium] | Clutch | `recocFpVqVuopTwDV` |
| 10 | [Visimpact] Retail Franchises (Whitepaper) | PAST | 2025-07 | 998 | 3.01 (3) | 3.2 (1) | 2.51 | Marketing agency (full-service/ads/web) | Home/local services & contractors; geo n/a | Free content (whitepaper/edu video) [medium] | n/a | `recGiJBSjWFeqHZHX` |
| 11 | [Twenty West Media (Internal)] Skincare & Haircare Brands, ChatGPT Shopping Qu | CURRENT | 2026-10 | 2,336 | 3.00 (7) | 32.4 (57) | 7.92 | Marketing agency (full-service/ads/web) | DTC/consumer & ecom brands; US/North America | Free audit/review/ideas [high] | DiscoLike | `recHt6ur548FtrDXa` |
| 12 | [A-Wing Visuals] Short email TEST  | PAST | 2025-08 | 5,163 | 2.71 (14) | 16.5 (56) | 1.03 | Creative/influencer/video | DTC/consumer & ecom brands; geo n/a | Free asset/work/trial [high] | n/a | `rec31pKLm9FDlNUCQ` |
| 13 | [DULCY] Business Loans Leads | DULCY | 2025-03 | 1,494 | 2.68 (4) | 8.0 (7) | 1.81 | Outbound/lead-gen agency (Dulcy) | Professional/financial services; geo n/a | Free list/sample [medium] | n/a | `recdLdjVuuKCT3ZTy` |
| 14 | [Twenty West Media (Internal)] High-Consideration Home & Consumer Products, $1 | CURRENT | 2026-08 | 4,142 | 2.66 (11) | 25.6 (78) | 2.56 | Marketing agency (full-service/ads/web) | DTC/consumer & ecom brands; US/North America | Free audit/review/ideas [high] | DiscoLike | `recceBRlstEpF36fV` |
| 15 | [Slogan Social] Influencer Positions Direct | PAST | 2025-06 | 1,947 | 2.57 (5) | 26.8 (34) | 0.87 | Creative/influencer/video | DTC/consumer & ecom brands; geo n/a | Question-led [low] | n/a | `recFLS4mPhFWNSjVc` |

## Bottom 10 with volume (2,000+ contacted, lowest meetings per 1k then interested %)
55 of 190 campaigns with 2,000+ contacted booked 0 meetings. These ten had 0 meetings and 0-1.4% interested.

| # | Campaign | Owner | Created | Contacted | Mtg/1k (n) | Int % (n) | Bounce % | Client vertical | ICP; geo | Offer [confidence] | Source | Record |
|---|---|---|---|---:|---:|---:|---:|---|---|---|---|---|
| 1 | [TargetonStar] SEO Agencies, 3-50 Emply - USA/CA, Clutch (Likihood) | PAST | 2026-04 | 4,444 | 0.00 (0) | 0.0 (0) | 1.28 | Fintech/adtech | Agencies (marketing/ad/SEO/web/PR); US/North America | UNKNOWN [medium] | Clutch | `recmPHwqYNberNB83` |
| 2 | [TargetonStar] Web Design Agencies, 3-50 Emply - USA/CA, Clutch (Likihood) | PAST | 2026-04 | 4,059 | 0.00 (0) | 0.0 (0) | 1.82 | Fintech/adtech | Agencies (marketing/ad/SEO/web/PR); US/North America | Free asset/work/trial [high] | Clutch | `recqUbY4n924WGYyH` |
| 3 | [Scroll Stop] Post Q4 reset, pre scale efficiency - Apps (Jack) | CURRENT | 2026-02 | 3,516 | 0.00 (0) | 0.0 (0) | 1.19 | Creative/influencer/video | DTC/consumer & ecom brands; geo n/a | Case-study/direct pitch [high] | n/a | `recJWLZZoJAXcTVZb` |
| 4 | [RMG] Financial Planners/mortgage lenders | PAST | 2025-11 | 2,626 | 0.00 (0) | 0.0 (0) | 1.68 | Fintech/adtech | Professional/financial services; geo n/a | Free audit/review/ideas [high] | n/a | `recLyypvnWvnFnOJ7` |
| 5 | [Scroll Stop] Sports (Data Bank) (Dan) 3 | CURRENT | 2026-01 | 2,006 | 0.00 (0) | 0.0 (0) | 0.75 | Creative/influencer/video | DTC/consumer & ecom brands; geo n/a | Free audit/review/ideas [high] | Data Bank | `recJS41WGzzAkN8O5` |
| 6 | [RMG Adv] Travel & Tourism (DMOs) | PAST | 2025-10 | 5,153 | 0.00 (0) | 0.6 (1) | 0.76 | Fintech/adtech | Public sector/nonprofit/education; geo n/a | Case-study/direct pitch [high] | n/a | `rec4955eGV1J80oia` |
| 7 | [Unleashed Technologies] Associations US | PAST | 2025-09 | 3,984 | 0.00 (0) | 0.8 (1) | 1.28 | SEO/web agency | Public sector/nonprofit/education; US/North America | Free audit/review/ideas [high] | n/a | `recnbX8qR6SY9lWtN` |
| 8 | Staffing & Recruiters (Recruiting Leaders), 11-200 employ - USA, Discolike (Of | PAST | 2026-06 | 2,220 | 0.00 (0) | 1.3 (2) | 2.52 | Software/SaaS | Professional/financial services; US/North America | Free asset/work/trial [high] | DiscoLike | `recHml2uXoLkEoCEK` |
| 9 | [VisionairAI] Mortgage Companies  | PAST | 2025-05 | 3,776 | 0.00 (0) | 1.3 (2) | 2.54 | Software/SaaS | Professional/financial services; geo n/a | UNKNOWN [medium] | n/a | `recelMHOU8orbfkW8` |
| 10 | [Unleashed Technologies] DTC (cto, technology, it, etc) | PAST | 2025-11 | 3,327 | 0.00 (0) | 1.4 (1) | 2.92 | SEO/web agency | DTC/consumer & ecom brands; geo n/a | UNKNOWN [medium] | n/a | `recJ6dzJNEH38hxRY` |

## 5. Patterns
**What the winners share**
- A concrete, low-effort yes: "Could I send you 500/1,000 leads like your best client?", "I've got creators in your space", "lunch at a named local spot", "notes on why ChatGPT recommends your competitor". The ask fits in one line and needs no meeting to get value.
- Agency or local-business buyers. Agencies as ICP: 73 camps, 360,708 contacted, 0.78 per 1k, 2.39% bounce, the best large group.
- Hyper-local framing. Campaigns named for a state, metro or county: 9 camps, 12,868 contacted, 1.32 per 1k, 1.06% bounce. Lunch/coffee intros: 12 camps, 21,881 contacted, 1.19 per 1k.
- First run of a fresh list. Scroll Stop's April 2026 "creators in your space" direct offer on fresh DiscoLike lists: 5 camps, 34,321 contacted, 46 meetings (1.34 per 1k), 24.5% interested. The same client's 2025 "we'll put together a strategy" wave: 7 camps, 30,522 contacted, 0.33 per 1k.
- AI-search visibility angle for brands (client campaigns, name or copy mentions ChatGPT/AI search/AEO): 14 camps, 26,149 contacted, 28 meetings (1.07 per 1k), 16.3% interested.

**What the losers share**
- Complex or abstract offers to cold buyers: programmatic/location ads, card-linked offers, archiving, AI recruiting software. Fintech/adtech clients: 19 camps, 60,096 contacted, 8 meetings, 2.3% interested.
- Hard ICPs for cold email: manufacturing/industrial (0.16 per 1k, 3.3% interested), software/SaaS (0.20), public sector/nonprofit (0.21). Dulcy's own tests here: SaaS 2,565 contacted, 0 meetings; product manufacturers 391 contacted, 10.23% bounce.
- Re-runs of the same list/copy. Names with "2/3/4", "2nd/3rd round" or "re-up": 20 camps, 55,664 contacted, 0.20 per 1k. Scroll Stop Sports reruns: 1 meeting on 8,575 contacted. A-Wing Roofers: 8 meetings, then 0, then 0 (third run at 10.4% bounce).
- Timely/seasonal pitches without an offer: Scroll Stop "Post Q4 reset", "Pre-Season Advantage", "MWC Barcelona": 6,553 contacted, 0 interested, 0 meetings.
- "Likihood" label at TargetonStar: 8,503 contacted, 39 replies, 0 interested.

**Bounce**
- By source (named in campaign): DiscoLike 4.95% (86 camps, 40 over 4%), Apollo 3.38%, A-Leads 2.99%, Clutch 1.47%, Clay 1.45%, GoodFirms/Agency Vista 1.42%. DiscoLike is also the 2026 default and carries the highest interest (15.4%), so part of this is the 2026 period: 2026 H2 campaigns bounce 4.21% vs about 2.2% in 2025.
- Generic vs direct emails, 18 matched pairs (same campaign, two lists): generic 61,383 contacted, 22.5% interested, 41 meetings (0.67 per 1k), **5.95% bounce**; direct 37,853 contacted, 10.5% interested, 7 meetings (0.18 per 1k), 4.12% bounce. Generic inboxes book more but bounce more.
- Re-verification works. "- MV" (MillionVerifier) re-runs vs the unverified original: Amazon Beauty ListKit 15.7% to 1.0% (then 5 meetings); TechApp fashion 14.2% to 1.2%; TwoTrees Education case study 14.2% (657 contacted) to 1.0% (3,977 contacted, 10 meetings).
- Lists labelled "Riskies" (risky/catch-all) bounced 8.7% and 11.1% with 0 meetings. Scroll Stop's June 2026 "*post-.info" wave: 5 camps, 17,725 contacted, 11.16% bounce, 0.34 per 1k.
- Over-4% campaigns still booked 0.65 per 1k (86 camps) vs 0.56 for under 2.5%, so high bounce did not stop meetings in this data. It still damages sender domains, and the 4% pause rule stands.

## 6. Reusable lessons (for Atlas and Forge)
1. **Lead with a free, specific sample the buyer can say yes to in one line.** Free list/sample: 31 camps, 160,934 contacted, 1.19 per 1k (2x the 0.58 average). Dulcy's 2025 free-list campaigns: 12 camps, 106,559 contacted, 152 meetings (1.43 per 1k). Only offer what the client can fulfil (Lead Flo: Southern California only).
2. **Agencies are Dulcy's best ICP; keep Dulcy's own outbound on agencies.** Dulcy to agencies: 43 camps, 250,211 contacted, 231 meetings (0.92 per 1k). Dulcy to non-agency tests (SaaS, robotics, manufacturers): 4 camps, 5,896 contacted, 1 meeting.
3. **Go local when the client can show up.** Local/regional lists: 1.32 per 1k at 1.06% bounce (9 camps, 12,868). Lunch/coffee intros: 1.19 per 1k (12 camps, 21,881). Small lists, so test at 500-1,000 and scale only after meetings.
4. **For creative/influencer clients, offer the talent, not a strategy.** "I've got creators in your space who drove millions of views, worth a chat?" (April 2026, 1.34 per 1k, 46 meetings) beat "we'll put together a strategy" (0.33 per 1k) and seasonal pitches (0 meetings on 6,553).
5. **AI-search visibility notes work for consumer brands.** 14 client camps, 26,149 contacted, 1.07 per 1k, 16.3% interested. Best: home/consumer products 2.66 per 1k (4,142) and skincare/haircare 3.00 per 1k (2,336, but 7.9% bounce).
6. **Use fresh lists; plan on one strong run per list.** Re-runs averaged 0.20 per 1k on 55,664 contacted. Top up with net-new lookalikes instead of re-mailing.
7. **Verify, then re-verify before a re-send.** MV re-runs cut bounce from about 14-16% to about 1% and then booked meetings (Amazon 5, TwoTrees 10). Do not send "risky" segments (8.7-11.1% bounce, 0 meetings).
8. **Generic inboxes are worth including for small businesses, with tight bounce control.** In 18 pairs, generic booked 41 meetings vs 7 for direct (0.67 vs 0.18 per 1k) but bounced 5.95% vs 4.12%.
9. **Fix booking before buying more volume.** Current clients: 2,203 interested, 172 meetings (7.8 per 100 interested) vs Dulcy 20.8. Send interested-to-booked gaps to Echo (two dated times, no link: 27.7% vs 6.2% booked, per RULES).
10. **Interest above 15% predicts meetings.** 70 camps at >= 15% interested booked 1.23 per 1k vs 0.38 for the rest. It is a sound top-up gate (matches the RULES 15% bar).
11. **Whitepaper/research-interview asks are steady but not winners.** 32 camps, 0.51 per 1k, median 0.53, only 5 with zero meetings. A safe second test, not a lead offer.

## Don't repeat
1. Pitching complex adtech/fintech/SaaS mechanics cold (fintech/adtech clients: 60,096 contacted, 8 meetings, 2.3% interested).
2. Re-mailing the same list with the same copy past the first run (0.20 per 1k across 20 re-runs; Scroll Stop Sports runs 3 and 4: 0 meetings on 3,961).
3. Sending unverified, risky or post-blacklist infrastructure (Riskies 8.7-11.1%; post-.info wave 11.16%; ListKit/TechApp unverified 14-16%). Pause at 4%.
4. Seasonal "timely" pitches with no concrete offer (3 campaigns, 6,553 contacted, 0 interested).
5. Free-work offers with heavy fulfilment that do not book: free asset/work/trial 38 camps, 0.45 per 1k, 24 with zero meetings (e.g. free campaign to agencies 4,059 contacted, 0 interested).
6. Free offers outside the client's service area or capacity (Lead Flo's USA-wide free-leads campaigns vs a Southern-California-only fulfilment limit; the client asked to cancel on 2026-11-17).
7. Dulcy "Direct Offer" agency pitches without a free sample: 11 camps, 65,545 contacted, 0.50 per 1k vs 1.43 for 2025 free-list campaigns; Clutch digital agencies direct offer 9,531 contacted, 0 meetings.
8. Copy proof lines that are not in the client file (e.g. "done this for 12 companies", "helped 500 brands"). These were not checked here; Scribe must verify every number against the client file before reuse.

## 7. Caveats (data quality)
- **Meetings are under-recorded and inconsistent.** The Dulcy workspace rollup shows 283 calls booked vs 240 on its campaign records. MJJ shows 0 meetings because the client books its own. 4 records show more meetings than interested replies (e.g. Visimpact Retail Franchises: 1 interested, 3 meetings). Treat meetings per 1k as a floor.
- **Interested is a reply label set by different people and tools per workspace** (Josh, clients such as MJJ, and the Reply Agent rolled out in human-in-the-loop mode on 2026-10-09), so compare interested % across workspaces with care.
- **Workspace links are mostly right, with exceptions.** In the Dulcy workspace: a Scroll Stop record (`reckxlkOGhBlRgoXR`, 8 contacted) and a TargetonStar copy (`recLYzDi3F1JRMVRn`, 0 sent); both are excluded from ranking by the 300 floor. "Dulcy Free Campaigns" holds free trial campaigns run for 4 prospect agencies (PNDigital, Great Impressions, Just Digital, Clear River), counted as DULCY. Visionair AI 2026 staffing campaigns have no bracket prefix. Twenty West runs in two workspaces.
- **Offer tags are partly inferred.** 51 ranked campaigns (154,267 contacted) have no offer evidence; 49 more are low confidence. Most UNKNOWNs are early 2025 campaigns with no stored copy. Lead source is named on only 164 of 346 campaigns; geography on 150.
- **Contacted, not sent, is the denominator.** Some campaigns were cut short or paused, so low numbers may mean short runs rather than weak offers.
- **Status field is unreliable for timing.** 241 ranked campaigns are "Inactive"; 102 of them share end_date 2026-07-23 (a bulk edit, not a real end). start_date is set on only 9 of 468 records. Dates above use record creation time.
- **No prospect data is in this file.** Reply subjects were used only to infer offer types.

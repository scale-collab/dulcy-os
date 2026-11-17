# Historical reply patterns: what led to booked meetings

Prepared for Sean (reply handling). Read-only analysis, run 2026-11-17. Nothing was created, changed or sent in any system.
Anonymized: no names, emails, company names, domains, phone numbers or URLs. Workspaces are described by type only.

## 1. Scope and definitions

- **Source:** Airtable base "Dulcy", table Emails (`tblADFhWhTcLrl1UY`), plus Reply Learning, Dulcy Reply Agent Events and Reply Analytics Daily.
- **Date window:** Emails records with `Lead Created` (createdTime) on or after **2026-05-17**, through 2026-11-17 (6 months).
- **"Booked" means:** `Pipeline Stage` (`fldSuQyvPM3IlS5oD`) is Booked Meeting, Completed Meeting or Closed Deal.
  - `Meeting Booked At` (`fld7kOIDWTVycZtdA`) is empty on every record in the table (0 of 38,966), so it cannot be used.
  - `Date of Call Booked` (`fldTFmYUnIXPxgJQS`) is filled on 106 records in the window. 103 of those are already in a booked stage; 3 are not. Counting either signal gives 165. This report uses the stage figure: **162**.
- **"Positive reply" means:** `Pipeline Stage` is not empty. In this window that is 2,313 records.
- **Counts in sections 2 and 3** come from exact filtered counts on the whole window, not a sample.
- **Text analysis in sections 4 to 6** uses 962 threads: all 162 booked threads, plus 800 of the 2,151 positive threads that did not book (the 400 newest and the 400 oldest in the window).
  - The not-booked sample has no threads from Jul to Sep 2026. Booked threads from those months are included (77 of 162).
  - To turn sample counts into rates, each not-booked thread is weighted ×2.689 (2,151 / 800). These weighted rates are estimates. The exact counts are always shown next to them.

## 2. Counts (exact, whole window)

| Measure | Count |
|---|---:|
| All Emails records in the window | 21,783 |
| Positive (Pipeline Stage set) | 2,313 |
| Booked (Booked Meeting 137 + Completed Meeting 25 + Closed Deal 0) | 162 |
| Booked as a share of positive replies | 7.0% (162 / 2,313) |
| Not booked: In Conversation / Lost / New Interested | 1,081 / 633 / 438 |

**Lead Status (`fldr2uNiscZfeCNiT`)**, all 21,783 records in the window:

| Lead Status | Records |
|---|---:|
| Out Of Office | 9,399 |
| Bounced | 6,008 |
| Not Interested | 3,856 |
| Interested | 2,168 |
| (empty) | 346 |
| Info Request | 4 |
| Meeting Request | 1 |
| Do Not Contact | 1 |
| Untracked Spam | 1 |
| Wrong Person / Information Request | 0 / 0 |

Of the 162 booked records, 158 have the Lead Status "Interested". This field is too coarse to separate reply types.

**Reply Agent Intent (`fldSgiv4CLnRBEJGc`)** has only been filled since 2026-08-20, on 4,214 records. The table shows how many of each intent reached a booked stage:

| Intent | Records | Booked | Booked rate |
|---|---:|---:|---:|
| Automatic Reply | 1,872 | 0 | 0% |
| Out of Office | 980 | 0 | 0% |
| Not Interested | 419 | 0 | 0% |
| Do Not Contact | 394 | 1 (likely misclassified) | 0.3% |
| Info Request | 259 | 4 | 1.5% |
| Other | 110 | 0 | 0% |
| Check Back Later | 48 | 0 | 0% |
| **Meeting Request** | **37** | **16** | **43.2%** |
| Referred | 33 | 0 | 0% |
| Interested | 26 | 0 | 0% |
| Wrong Person | 24 | 0 | 0% |
| Cost Objection | 11 | 0 | 0% |
| Process Objection | 1 | 0 | 0% |

Only 21 of the 90 booked records created since 2026-08-20 have an Intent value. The other 69 have none, so Intent coverage of bookings is weak.

**Booked rate by workspace type.** Exact counts; booked records ÷ positive records in the window:

| Workspace type (generic) | Positive | Booked | Rate |
|---|---:|---:|---:|
| Dulcy's own campaigns (free prospect-list offer) | 307 | 35 | 11.4% |
| Same marketing agency as the next row, older workspace | 90 | 9 | 10.0% |
| Lead-gen agency, local services, pay-per-lead offer | 283 | 27 | 9.5% |
| Performance marketing agency, DTC brands | 73 | 6 | 8.2% |
| Influencer / creator marketing agency | 310 | 24 | 7.7% |
| Marketing agency, home services / contractors (video-first reply flow) | 1,070 | 53 | 5.0% |
| Marketing agency (newer client) | 19 | 1 | 5.3% |
| Jewelry wholesaler | 42 | 0 | 0% |

## 3. Which reply types convert best and worst

The most reliable signal comes from exact counts on the Intent field:
- **Best:** Meeting Request, 16 of 37 booked (43.2%).
- **Weak:** Info Request, 4 of 259 (1.5%).
- **Zero bookings:** Interested (0/26), Referred (0/33), Check Back Later (0/48), Cost Objection (0/11), Wrong Person (0/24).

For the sample of 962 threads, the prospect's first real reply was also sorted by keywords. Rates are weighted as described in section 1:

| First prospect reply type | Booked / not booked in sample | Weighted booked rate |
|---|---:|---:|
| Proposes a time, or asks for a call or meeting | 62 / 143 | 13.9% |
| Question or "tell me more" | 21 / 102 | 7.1% |
| Other / unclear | 30 / 177 | 5.9% |
| Short yes ("sure", "send it", "go ahead") | 29 / 186 | 5.5% |
| Asks about price or cost | 9 / 90 | 3.6% |
| Referral to a colleague | 3 / 47 | 2.3% |
| Timing / not now | 0 / 3 | 0% |

**Time to first response:** no clear link to booking.
- Measured from `Lead Created` to `First Response At` (`fld5ApgrrxDTJgXgp`). That field is filled on 62 booked and 377 sampled not-booked threads.
- Median time to first response: 279 min for booked threads, 125 min for not-booked threads.
- Weighted booked rate by response time: 0–15 min 6.1%, 15–60 min 4.9%, 1–4 h 4.6%, 4–24 h 6.2%, over 24 h 6.4%.
- `First Inbound Reply At` is almost never filled (1 booked, 6 not-booked records). This means `Lead Created` stands in for "reply received", which may not match the actual reply time.
- Conclusion: in this data, response speed alone does not separate booked from not-booked threads. Do not treat this as proof that speed does not matter. The measurement is weak.

## 4. Patterns in the responses that led to meetings

This section uses our first response after the prospect's first reply, in 644 threads where both could be found (125 booked).

| Our first response | Booked / not booked | Weighted rate |
|---|---:|---:|
| **Offers 2 specific times, no link** | 34 / 33 | **27.7%** |
| Specific times and a booking link | 21 / 69 | 10.2% |
| Booking link only | 24 / 136 | 6.2% |
| Ends in a question, no time or link | 34 / 206 | 5.8% |
| No call to action | 12 / 75 | 5.6% |

| Length of our first response (words, before sign-off) | Booked / not booked | Weighted rate |
|---|---:|---:|
| Under 40 | 21 / 41 | 16.0% |
| 40–69 | 41 / 102 | 13.0% |
| 70–99 | 41 / 212 | 6.7% |
| 100–149 | 13 / 106 | 4.4% |
| 150 or more | 9 / 58 | 5.5% |

| Content in our first response | With it | Without it |
|---|---:|---:|
| Asset sent or offered (video, examples, results, sample) | 5.1% (32 / 222) | 10.4% (93 / 297) |
| Proof claims (numbers, "we helped…") | 5.8% (14 / 84) | 8.7% (111 / 435) |
| Price or cost mentioned | 7.7% (15 / 67) | 8.3% (110 / 452) |
| Phone call offered or number asked for | 10.2% (11 / 36) | 8.1% (114 / 483) |

**The times effect holds inside reply types and inside workspaces.** Sample counts are small, so treat these as direction, not proof:
- When the prospect asked for a call: specific times 48.2% (20/8), times and link 27.1% (11/11), link only 9.0% (4/15), question only 12.5% (13/34).
- When the prospect gave a short yes: specific times 21.0% (5/7), link only 5.7% (12/74), question only 1.4% (2/51).
- In the home-services agency workspace: specific times 18.9% (5/8), link only 4.4% (14/113), question only 5.3% (17/114).
- In the influencer agency workspace: specific times 24.6% (7/8), times and link 2.4% (2/30).

**What booked threads look like:**
1. **Two concrete dated slots with a time zone.** For example, "Would Wednesday at 11:30 AM ET or Thursday at 2:00 PM ET work?" The prospect only has to pick one. Many booked threads end with a confirmation from us: "You're booked for… the invite has been sent."
2. **Short replies, under about 70 words.** Booked threads had a median of 70 words versus 79 for not-booked, and the rate falls steadily once a reply passes 70 words.
3. **The call has a reason that serves the prospect.** For example, "I need 10–15 minutes to confirm your targeting so the free list matches what you want," or "so the free leads match the work you most want." Booked threads use this instead of "let me walk you through our system."
4. **We echo what the prospect told us.** We restate their ICP, service lines or audience in one line, then ask for the time.
5. **Booked threads have more of our messages:** median 3 from us versus 2. Logistics such as rescheduling, phone versus video, or a missed first meeting are handled quickly and politely with new slots.

**What not-booked threads look like:**
- **Asset first, call later.** The common template in the home-services workspace answers "send it" with the video, a soft "open to a 10–15 min chat?" and a booking link. It books at a low rate (link only: 14 booked / 113 not in that workspace).
  - Across all threads, at least one of our messages contained an asset in 386 of 629 not-booked threads, against 66 of 146 booked threads.
- **Answering a question with another permission question.** For example, "There's no cost for the video… would you like me to send it?" This adds a step instead of moving to a time.
- **Long explanations:** over 100 words of company description, service lists or data-sourcing detail.
- **Pricing replies** answered with a booking link (with or without times) booked 0 of 18 (link only 0/8, times and link 0/10). Pricing replies with no call to action also booked 0 of 18. The 4 pricing replies answered with 2 specific times and no link booked 2.

## 5. Anonymized example pairs (paraphrased)

Workspace types are generic. [Name], [Company] and [Client] replace real values.

1. **Lead-gen agency, local services. Short yes. BOOKED.**
   - Prospect: "Sure, I'd be willing to take a look."
   - Us: "Great. Since you cover [three service lines], I want the free leads to match the work you most want. Would Wed [date] at 11:30 AM ET or Thu [date] at 2:00 PM ET work for a quick call? [Name]" (58 words, two slots, a reason that helps them.)
2. **Dulcy's own campaigns, free list offer. Prospect sends their ICP. BOOKED.**
   - Prospect: "Yes, please build the list. Here's our ICP: [industries], [roles], [geography]."
   - Us: "Great, that's a solid starting point. I'll need 10–15 minutes to confirm the targeting for each segment and get your live feedback before I build it. Would Wed [date] 2:30 PM ET or Thu [date] 12:00 PM ET work better?"
3. **Dulcy's own campaigns. Prospect is open and states the ICP. BOOKED.**
   - Prospect: "Open to this, we're reviewing outbound. Target: marketing managers and heads of marketing, not junior roles."
   - Us: we restate the ICP in one line, ask for 10–15 minutes to confirm title variations and exclusions, and offer two dated slots.
4. **Home-services marketing agency. Short yes to a video. BOOKED (the same template usually does not book).**
   - Prospect: "Please send it."
   - Us: "Here's the short video I made for you: [URL]. Happy to go into more detail. Open to a quick 10–15 minute chat this week, or pick a time here: [URL]."
   - In this workspace, this link-only pattern booked 14 times and did not book 113 times in the sample.
5. **Home-services marketing agency. Short yes to a video. NOT BOOKED (Lost).**
   - Prospect: "Good morning, yes send it."
   - Us: the same video template as example 4, with no specific times.
6. **Performance marketing agency, DTC. Info request. BOOKED.**
   - Prospect: "I'd like to learn more about [new platform capability] — we're on [platform]."
   - Us: one line of value, then "How does Monday at 9 AM PT or anytime 12–5 PM PT work for a 30-minute meeting?"
   - Prospect: "How about 1 or 2 PM Monday?"
   - Us: "Great, I scheduled us for Monday at 2:00 PM PT; the invite is sent."
7. **Dulcy's own campaigns. Pricing question. BOOKED.**
   - Prospect: "You make the list, but then what? And what are your fees?"
   - Us: the list is free with no obligation; then two options in one line each (use your own team, or we run outbound); fees depend on which option, so scope comes first. This was followed by a call request.
   - One of the few pricing replies that booked. It answered directly, invented no number, and moved to scoping.
8. **Home-services marketing agency. Proposes a time and asks for cost. BOOKED.**
   - Prospect: "Monday works before 11 or after 12. Come with exactly how you can help and what it costs per month. My audience is [referral-partner types]."
   - Us: "Absolutely." We restated their target audience and gave a short approach, then confirmed the call.
9. **Lead-gen agency, local services. "No commitment" hesitation. BOOKED.**
   - Prospect: "I'd like to see what you offer, but I don't want to commit to anything."
   - Us: "Completely fair — there's no commitment, it's just to learn more." Then a short explanation and a call request.
   - Prospect: "OK, but I won't decide until next year. Tuesday works."
   - Us: "Perfect, you're booked for Tuesday at 11:00 AM CT. Should I call you, or use a video link?"
10. **Marketing agency, restoration niche. Prospect corrects our framing. BOOKED.**
    - Prospect: "I do damage restoration: fire, water, mold, storm."
    - Us: "Thanks for clarifying, and sorry for the wrong framing. Restoration is a strong fit: homeowners in that moment search fast. Would a quick chat this week make sense?"
11. **Lead-gen agency. Missed first meeting (phone vs video mix-up). COMPLETED MEETING.**
    - Context: the prospect expected a phone call; we waited on video.
    - Us: "Sorry for the mix-up yesterday. Happy to call you directly. What time Thursday or Friday works best?" Rebooked.
12. **Dulcy's own campaigns. Referral. BOOKED later.**
    - Prospect: "My colleague, copied here, may be in touch."
    - Us: "Thanks for looping them in. [Name], happy to answer any questions about the free list or tailor it to the clients you want. I'll leave it with you."
13. **Home-services marketing agency. "Any cost?" NOT BOOKED (Lost).**
    - Prospect: "Any cost?"
    - Us: "No cost for the video, it's a free two-minute breakdown. If relevant, we can then discuss what support would cost. Would you like me to send it over?" This adds another permission step and offers no time.
14. **Dulcy's own campaigns. Short yes. NOT BOOKED (Lost).**
    - Prospect: "Sure, send them over."
    - Us: about 126 words: "We'll set you up with 1,000 verified leads…", then "worth a quick call to walk through how the full omnichannel system could work for your growth," then two times with links plus a booking link.
    - Compare example 2: the call was framed as our pitch, not as something the prospect needed.
15. **Home-services marketing agency. Skeptical ("prove you're not spam"). NOT BOOKED (Lost).**
    - Prospect: "I don't know who you are or how you found us. Expand on what you do, but I usually delete these."
    - Us: about 130 words of introduction, an explanation of the data source and a service description, with no clear next step.

## 6. What this suggests for Sean (to test, not yet a rule)

1. For any positive reply, offer two specific dated slots with a time zone in the first response. A booking link can be added as a backup, but should not be the only option.
2. Keep the first response under about 70 words: one line that echoes their reply, one reason for the call that helps them, and two times.
3. When the prospect says "send it" and an asset is promised, send it, but put the two times in the same message. Do not rely on a link-only "open to a chat?" ending.
4. Answer pricing questions directly with real scope logic, never an invented number, then offer two times. In the sample, pricing replies answered with a link or with no call to action booked 0 of 36.
5. Treat Meeting Request as top priority: 43.2% booked. Info Request (1.5%) and Interested (0/26) need a stronger push toward a specific time.

## 7. Caveats and data-quality issues

- **The sample is biased.** The not-booked sample is the 400 newest and 400 oldest threads, so Jul–Sep 2026 is missing. Weighted rates assume the sample represents all 2,151 not-booked threads, and per-segment weighted rates may be off.
- **Author detection is heuristic.** Threads are stored in mixed formats: new header format, older quoted format, and some EmailBison notification dumps. In a spot check of 24 parsed pairs, about 6 had the wrong author or picked up the cold email instead of our reply. Feature results in section 4 are directional.
- **Confounding.** Threads where the prospect already proposed a time convert more and also get times offered more often. The times effect still shows within reply types, but the counts there are small.
- **Booked-meeting fields are inconsistent.** `Meeting Booked At` is never filled. `Date of Call Booked` is filled on 103 of 162 booked records. `First Inbound Reply At` is almost empty. `Touchpoints to Meeting` is filled on 62 of 162 booked records.
- **Some fields are not what their names suggest.** `Custom Reply` holds status tags such as "NEEDS VIDEO", "IN FLOW" or "HAND OFF", not reply text. `Reply Ownership` is empty on all 962 sampled threads.
- **Lead Status is unusable for typing replies.** 158 of 162 booked records say "Interested". Intent only exists from 2026-08-20 and is missing on 69 of 90 booked records since then.
- **Reply Learning cannot show outcomes yet.**
  - 2,384 records, last updated 2026-11-17.
  - Situation: 2,257 Interested, 53 Not Interested, and the rest Out of Office.
  - Review Status: Candidate on every record except 1 Rejected.
  - Outcome: 0 records marked Meeting Booked and 0 marked Replied. 1 record has no outcome; all others are "Unknown".
  - Only 69 have an AI Draft.
- **The Reply Agent has barely sent anything.** Agent Events since 2026-08-20: 11,864 events, 225 Drafted, 2,207 Skipped or Suppressed, 1 Sent, 1 Failed. Almost all replies in this period were sent by humans.
- **Reply Analytics Daily understates bookings.** 1,000 of 1,824 rows were read (dates 2026-05-31 to 2026-11-15). Data Coverage: 168 Complete, 445 Partial, 387 Insufficient. Its Meetings Booked column sums to 16 on the "All" rows read, while 162 booked stages exist in Emails. It is not reliable for booking counts.
- **Small numbers.** There are only 162 bookings. Several cells in this report have counts under 10.
- **Closed deals: UNKNOWN.** There are 0 Closed Deal stages in the window.

# Scribe playbook: how Dulcy writes cold email

Version 1.0 · 2026-11-25 · Owner: Scribe (copy and offers). Built from every Drive, Notion and SOP extract in `references/ingest/`, Alex's rules in `rules/RULES.md`, and the real results of 410 Dulcy campaigns.

Read this before writing every campaign. It is the main authority for how to write. `rules/RULES.md` still wins on any conflict.

Source codes used in brackets:
- [RULES date] = `rules/RULES.md`, the rule with that date.
- [Contract] = `rules/client-promise-contract.md`.
- [Engine] = the code checks in `engine/src/agents/scribe.ts` (lintCopy). Copy that fails them is bounced automatically.
- [DND A3], [DND B7] ... = `ingest/drive-notion-digest.md`, section and item. A = Alex's own rules, B = Alex's critiques, C = 2026 house style, D = frameworks, E = performance, F = best examples, G = bad examples.
- [SOT §1.5] = `ingest/source-of-truth.md` (Alex's Cold Email Source of Truth, mostly other operators' material).
- [2h §1.4] / [2h L1013] = `ingest/2-hour-sop.md` (Alex's 2-Hour Cold Email Campaign SOP), section or source line.
- [SOP 118 #12] = `ingest/copy-sops-and-prompts.md`, doc 118 (the Oct 8, 2026 copy review prepared for Alex), lesson 12. Other doc numbers (011, 089-094, 119, 123, 130, 134) are the same file.
- [data: ...] = `ingest/performance/analysis.md` and `top-bottom.md`. Numbers are "interested per 1,000 emails sent" (written /1k). Agency average 1.66/1k.
- [Alex, chat 2026-11-25] = Alex's instructions given in chat on 2026-11-25, as passed to Scribe.

---

## 0. How to use this

**Authority order (highest first):**
1. `rules/RULES.md` and `CLAUDE.md` non-negotiables. Newest dated rule wins.
2. This client's own approved facts: the client file in `clients/`, the Airtable offer fields, the approved plan. Unknown is a valid value. Never fill it in.
3. This playbook.
4. Performance evidence (`ingest/performance/analysis.md`, `top-bottom.md`, the client's scripts file). Read them directly for the tables. This playbook turns them into rules.
5. Creator learnings (`references/creator-learnings.md`). Claims, not benchmarks.

The older references in this folder (`copy-framework.md`, `copy-review-contract.md`, `campaign-patterns.md`, `cold-email-offer-patterns.md`, `drive-sop-basis.md`) still hold useful truth and review checks. Where they disagree with this playbook on meeting asks, number of variants, delivery fine print or the P.S., this playbook and the 2026-11-25 rules win.

**What Scribe produces for every campaign:**
- Email 1: exactly 2 variants, one per plan angle. Each has a subject of 1-3 words and a body of 30-75 words. [RULES 2026-11-25] [Engine]
- Follow-ups: step 2 and step 3, in the same thread with no subject. Step 4 only when section 6 says so. Each follow-up is at most 75 words. [Alex, chat 2026-11-25] [Engine]
- A claim list: every fact in the copy, with where it came from in this client's facts (or UNKNOWN).
- Questions for Alex: only things that block the copy (missing proof, unclear offer).
- One or two lines on why this copy and what the 2 angles test.

**What Scribe never writes** (the system adds these later):
- No signature. The builder adds the sign-off, sender name, title and brand. [RULES 2026-11-17] [RULES 2026-11-20]
- No P.S. The builder adds "{P.S.|P.s.|p.s.} or tell me to pound sand if you'd like.." to the copy. That P.S. is a proven winner (see 7.6). If Scribe writes its own P.S., the builder skips the default one. [RULES 2026-11-20, 2026-11-23] [Alex, chat 2026-11-25]
- No spintax. Spintax is added after the client approves the copy. [RULES 2026-11-17] [SOP 119] [Engine]
- No links, no images, no attachments. [Engine] [2h L1013] [data: links in Email 1 0.54 vs 1.77/1k]

**Two approvals, then the client.** Alex approves the plan (thesis, ICP, first 100), then the final copy and list. Then the client approves the copy. Only then does it launch. Scribe's output is always a review draft. [RULES 2026-11-25]

---

## 1. What good cold email is at Dulcy

Alex, in his own words:

- "Out of my years writing cold emails and running my agency, I believe the most important thing for results comes down to copy. You can have the best technical setup and the best leads, but if you write a terrible cold email, you won't get results." [DND A1]
- "And if you're coming into this thinking the goal is to "sell"… You already lost. Your goal is to find out if they have a problem you can solve." [DND A1]
- "The best cold emails feel like a normal email someone would actually send." / "GOAL: Make it sound like an email to a friend" [DND A1]
- "A good cold email is built around the CTA. Every line either: earns attention / builds belief / lowers resistance / makes the "yes" feel easy. If a sentence doesn't help the CTA, it's dead weight." [DND A2]
- "You don't need 6 angles in one email. Pick one angle and commit." [DND A2]
- "If a word or phrase doesn't push the prospect toward a response, cut it." / "A smart person admires simplicity. A dumb person admires complexity." [DND A2]
- "Earn the meeting. Don't demand it." / "Sell The Result, Not The Service ... The service is the backend. The result is the hook." [DND A1]
- "No value in the email. Its positioned to benefit you rather than the prospect. You must focus everything on why you why now and why them." / "You always have to think in the shoes of the prospect" [DND A1, TWM audit 2026-04]
- "If your offer is weak, no subject line on earth will save you." [DND A1]
- The cold email asks whether they want it. Over-qualifying kills the offer. [RULES 2026-11-25]

What this means in practice:

1. **It is a question, not a pitch.** Email 1 finds out if this person has a problem the client can solve and whether they want the thing on offer. It does not try to close, explain the whole service or win an argument. "Cold email does not close deals. It gets replies." [SOT §1.16]
2. **It reads like a text from a real person.** Short lines. Plain words. "you" more than "we". Something you would say out loud to the person at an event. "Write like a friend texting a coworker." [SOT §1.3] Two tests: "Can a 10-year-old understand what you're selling? Would you actually say this to someone in person?" [2h §3.5]
3. **It is not "convincing".** No hype, no pressure, no fake urgency, no clever lines. It earns a reply by being relevant, specific and easy to answer. "Clear beats clever." [SOT §1.3]
4. **Everything serves the CTA.** Write the ask first, then keep only the lines that make that ask feel worth a one-word yes.
5. **Every email does two jobs: curiosity and trust.** Curiosity = the dream outcome (what they get). Trust = why they should believe you can deliver it. "Without BOTH, they will not reply." [2h §2.1]
6. **The offer matters more than the words.** "98% of the effectiveness of a cold email has NOTHING to do with what is written inside the email, but the actual concept of the thing you're selling." [2h §1.10] "0 personalization + 10/10 offer beats 10/10 personalization + 6/10 offer." [2h §1.10] The data agrees: abstract products sit at 0.15-0.34/1k whatever the copy, concrete offers sit at 3-7/1k. [data: P9]
7. **The prospect's 5 questions.** "1. Will you make me more money? 2. Have you done this for people like me? 3. Did you actually research my company? 4. Are you a real person or a scammer? 5. Is this a waste of my time?" [2h §3.4]

---

## 2. Before writing

### 2.1 Read the inputs (in this order)

The engine hands Scribe: the approved plan, the client's Airtable offer fields, the client file, every script already run for this client with its results, and what this client's prospects actually said in the last 180 days. Use all of it.

From the **plan** (approval 1, Alex):
- **Move and why** (top-up, new vertical, new offer, copy change). A top-up preserves the winning Email 1 and fixes only truth and evidence problems. [SOP 118 #29]
- **ICP and persona.** Write to one person in one kind of company. "Match tone to the ICP (cosmetics brand ≠ auto dealer)." [DND A2]
- **Pain** (one) and **dream outcome** (money, time or status). [2h §2.2, §2.3]
- **Proof** the plan picked. It must come from this client's facts. [RULES 2026-11-25]
- **Structure** (Question → Proof → CTA, or Offer → Proof → CTA). See 2.3.
- **Angles** (2): name, what each tests, the hypothesis. Write one Email 1 variant per angle. See section 9.
- **Objections to answer early.** Pre-handle the top one inside a follow-up. "You're clearing up what you do before another person has to ask." [2h §1.12]
- **"Only logical next step"** in the plan's reasoning is the only thing that lets a call ask through the code check. [Engine: allowCall]

From the **offer fields** (Cold Traffic Offer, Front End Offer(s), Back End Offer(s), Outbound Risk Reversal): the exact offer, free or paid, quantity, any guarantee. Use only what is there. A guarantee needs the client's approved terms. [RULES 2026-11-20] [Contract]

From the **client file**: approved proof with its scope, sender, tone, what was removed as unverified, client preferences (e.g. MJJ's close style). Check the "never use" list before using any number.

From **the scripts already run for this client**: what won, what lost, what is fatigued. "Do not keep rewording a script that already works." [2h L520] Re-sent copy decays (section 10).

From **what prospects said**: their words are the best copy you will ever write. "The actual words your leads use on sales calls and in replies are the best copy you will ever write." [SOT §1.3] "Listening = Copywriting ... Every objection, every concern, every frustration, that's your goldmine." [DND A7] Use the interested replies to see what they wanted. Use the objections to pick what step 2 or 3 should answer.

### 2.2 Write the 4-line campaign definition first

"Do not move on until this is written." [2h §2.2]
- ICP: who exactly.
- Pain: one problem only.
- Dream outcome: money, time or status.
- Proof: one client, one source or one specific insight.

Then write the message contract in one line each: who, why this buyer, the one thing on offer, the reason to believe, and what a "yes" means (what happens next). [copy-framework.md]

"Do not write copy while the ICP is still fuzzy." [2h L508] If the plan is fuzzy, put it in questions for Alex rather than writing around it.

### 2.3 Pick the structure

Two structures. Pick one. "Do not blend them unless you have a very good reason." [2h L76]

**Question → Proof → CTA** ("poke the bear")
- Use when the prospect may not fully see the problem yet. [2h §2.4]
- Alex's template: "What are you doing to solve [pain] so [dream outcome] happens? / We do that for [same-world proof] by [simple mechanism]. / Want me to send over [resource]?" [2h §2.4]
- The question must be one they can honestly answer "we're fine". Do not manufacture a problem. [copy-framework.md]
- Data warning: a question as the very first line did worse in 2026: 1.76/1k vs 2.43/1k for an observation or offer opener. In the one clean test (Shop Innovator EB 465) the question opener got 1.93/1k vs 6.96/1k. [data: P2] So when you use this structure, prefer an observation first line, then the question. Example of that shape: "Noticed {COMPANY} sells [product type] online. ... Are first-time visitors converting well for you?" (Shop Innovator EB 422, 7.96/1k on 15,084 sent). [data: top-bottom #9]

**Offer → Proof → CTA**
- Use when the outcome is already easy to want. [2h §2.5] "Often the proof is baked directly into the offer itself."
- Alex's template: "If I could help [company] get [dream outcome], that usually leads to [benefit]. / That's the same problem we've worked on for [proof]. / Would you be open to [small ask]?" [2h §2.5]
- The 2026 house style is mostly this: first line is the offer or the thing you made, one line makes it concrete, one line of proof, one question. [DND C]

**The investment piece** (Alex's 4-part method)
- "1. Investment (I noticed) 2. Knowledge Statement / PTB 3. Call out the pain 4. Easy CTA to solve the problem" [DND D1]
- The investment piece is "something that shows they are already aware of the problem or already trying to solve it. Examples: using blogs, running ads, investing in SEO, posting regularly, updating their website". [DND D1]
- Attach the offer to a bet they are already making: "Attaches the offer to an investment the prospect is already making (paid traffic)". [DND C, Shop Innovator]
- Use it whenever a real, checkable signal exists (ads running, a blog, a creator program, a hero product, a search term they want to rank for).

**The observation opener**
- The strongest 2026 opener: say what you noticed or what you made for them. "Open with what you noticed or made for them. Keep the question for the CTA." [data: P2]
- It must be true and checkable. "state one specific, verifiable observation about the company ... Separate what was observed from what it might suggest; ads, hiring or a website gap do not prove poor performance." [SOT §1.9]
- The observation can come from the list itself (a segment the AI can classify reliably, like "plumbing contractor" not "contractor") or from enrichment. "Never force AI to come up with a variable." [SOT §1.9]

**Picking guide** [2h §5.1] [SOP 089-094]
| Situation | Lead with |
|---|---|
| Prospect may not see the problem | Observation, then a question (Question → Proof → CTA) |
| Outcome already wanted, offer is clear | The offer (Offer → Proof → CTA) |
| A real signal exists (ads, blog, creators, a product, a search term) | Observation / investment piece, then the one thing built from it |
| Category is new to the market | Third-party authority that validates the category, then the offer [2h §2.8] |
| No case study yet | Knowledge as proof: show you already know their situation [2h §2.7] |
| Commodity service | "Find the one thing that is actually different ... and anchor your entire cold email copy to that." [2h §1.10] |
| Weak or unclear product | "lean into the lowest-friction entry point. Free and specific will always outperform vague and paid." [2h §1.10] |

**Market sophistication** decides how much you explain. "If you talk to a Level 4 market like it's Level 1, you sound naive. If you talk to a Level 1 market like it's Level 4, you sound confusing and try-hard." [DND A8] Saturated markets (agencies, SaaS buyers) need a specific mechanism and real receipts. New categories need the idea explained in one plain line.

### 2.4 Check the offer before you write a word

Run Alex's offer test. "If you answered "no" to ANY of these, your offer is garbage" [2h §3.6]:
1. Is the outcome completely obvious?
2. Is the risk clearly on you, not them?
3. Can they calculate ROI in 10 seconds?
4. Is the promise quantifiable?
5. Does replying feel easier than ignoring?

If the offer fails and the plan cannot fix it, say so in questions for Alex. Copy cannot rescue it. [data: P9] "Copy iteration has the lowest likelihood of a meaningful performance change." [DND A12]

---

## 3. Email 1 rules

### 3.1 Hard rules (the copy is bounced if any fails)

1. **Exactly 2 variants, one per plan angle, same direction.** They test the angle (USP, pain, solution, proof or offer framing), never word swaps. [RULES 2026-11-25] [Engine]
2. **30-75 words in the body** (variables count as one word each). [Engine] [2h §1.2]
3. **Subject: 1-3 words, no punctuation.** Apostrophes and {VARIABLES} are allowed. [Engine] (Section 5.)
4. **At least 1 strong proof from this client's facts.** More only if just as strong. No filler proof. [RULES 2026-11-25] (Section 8.)
5. **One CTA, low friction, answerable in one word.** [RULES 2026-11-25] [2h L1013] "Is there exactly one CTA?" [2h §3.1]
6. **No call ask** unless the plan says a call is the only logical next step. The code bounces: book a call / time / meeting, hop on a call, 15/20/30 minutes, calendar link, schedule a call, jump on a call, quick call, grab some time. [RULES 2026-11-25] [Engine]
7. **No links, no images, no attachments.** No ".com", ".io", "www" or "http" in the body. [Engine] [2h §1.14]
8. **No semicolons. No em or en dashes.** Write " - " (space, hyphen, space). [Engine] [2h §1.8]
9. **Banned phrases:** "this isn't just", "it's not just", "following up", "I am following up", "just checking in", "circling back", "bumping this", "hope this finds you". [Engine] [2h §1.8]
10. **Variables:** {FIRST_NAME} and {COMPANY}, plus custom ones only when the plan and lead list have them. Never spin a variable. Every custom variable needs a fallback phrase that reads right in the sentence (a city becomes "your area"). Never a blank. [RULES 2026-11-17, 2026-11-21, 2026-11-24] [Engine: unknown variables bounced]
11. **No spintax, no signature, no P.S.** [RULES 2026-11-17] [Alex, chat 2026-11-25] [Engine]
12. **Never invent** results, numbers, customers, prices, guarantees, assets or prospect signals. Never use another client's facts. List every claim with its source. [CLAUDE.md #3] [RULES 2026-11-25] [Contract]
13. **Never claim finished work that does not exist.** "I made", "I put together", "I pulled", "I recorded", "I ran" only when that exact thing exists and has been checked. Otherwise offer to make it: "I can put together...". [SOP 118 #8-12] [SOT §1.11] (Note: the winning TWM and Shop Innovator emails say "I pulled together some notes" and "I made a short video". That works only because the notes and the video were real. If the engine cannot produce the asset per lead, write the offer version.)
14. **No fake relationship, referral, research project, scarcity or urgency.** No "Re:" on Email 1, no "my colleague came across you", no "we only build a few of these each week", no "yours is ready". [DND B3] [copy-framework.md] [SKILL]

### 3.2 Proven patterns, with the numbers

**P-a. Offer one concrete thing built from what they already have.** Strongest finding in the data: 3 significant A/B wins. [data: P3]
- "We could turn usable product photos and clips you already have into a series of social posts" 14.3/1k vs "We could handle turning product ideas like that into social posts, so your team isn't planning..." 5.6/1k (TWM EB 609, p = 0.046). Same test re-run: 3 vs 0. "Uses what you already have" won both runs. "We do the work for you" lost both.
- One idea beats two: "I had an idea for showing ur {HEROPRODUCT} in a {CONSUMERUSEOCCASION} moment" 24.1/1k vs "I had two ideas..." 2.7/1k (TWM EB 599, p = 0.011).
- "Could I send you 5 leads from people already looking for those services?" 16.8/1k vs a pay-per-lead pitch 1.8/1k (Lead Flo EB 514, p = 0.009).
- Offer type, 2026: free notes / review / ideas 3.17/1k, creators/talent shortlist 2.31/1k, free work / trial / demo 1.29/1k, research or interview request 0.87/1k (all years 0.69/1k, the lowest). [data: P3]
- Rule: name one specific thing, made from their product, their search term, their footage, their listing, their store. Say what it is in plain words. One, not two or three.

**P-b. Open with an observation or with the thing you made, not with a question.** [data: P2]
- 2026: statement/observation opener 2.43/1k (91 campaigns, 619,777 sent) vs question opener 1.76/1k (50 campaigns, 485,611 sent).
- Within clients: Dulcy 2.40 vs 0.92. Twenty West 3.40 vs 2.21. Shop Innovator 5.53 vs 2.15.
- Clean A/B (Shop Innovator EB 465, p = 0.0065): "{I made|I put together} a short video walking through product pages like {COMPANY}'s..." 6.96/1k vs "{Do you know what's|Have you figured out what's} actually stopping your ecommerce store from converting...?" 1.93/1k.
- Keep the question for the CTA.

**P-c. Reference what the prospect already does, not a generic value.** "{COMPANY} works with creators to show the best of {PERSONAL}" 5/2,969 vs "{COMPANY} is all about staying true to {PERSONAL}" 0/3,023. Same swap again: 5/2,337 vs 0/2,253. Small counts, same direction twice. [data: P6] Alex: "We noticed this specific issue in what you are already doing". [DND B2]

**P-d. Short.** Step 1 at 75 words or fewer: 2.08/1k (59 campaigns, 389,377 sent) vs longer 1.30/1k (82 campaigns). [data: U3] Amazon Consultancy's one-sentence email (3.38 and 2.34/1k) beat their longer white-paper version (1.82 and 2.05/1k). The Scroll Stop April 2026 wave opened with about 47 words and did about 9x better than their 2025 long copy (5.67 vs 0.65/1k). [data: U1] Most top-10 Email 1s are 41-52 words. Aim for 40-60 words. Do not pad a clear 35-word email.

**P-e. No hard guarantees.** Copy leaning on "you pay nothing", "we work for free until", "we send you $1,500", "it's on the house": 0.88/1k vs 1.72/1k for the rest (18 campaigns, 99,922 sent). [data: U4] Adverio "guarantee 10-20% growth in 90 days or we work for free" 0.33 and 0.67/1k. Digital Neighbor "100+ prospective clients in 60 days or we send you $1,500" 0.70/1k; their best was a plain "you guys handle {CASE}, right?" opener at 2.80/1k. A guarantee P.S. did 0.74/1k vs 2.37/1k for the opt-out P.S. [data: P4] Scroll Stop "P.S. We always offer a guarantee around ROI..." 0.75/1k vs 2.48/1k. Rule: no guarantee in Email 1 unless the client's approved Outbound Risk Reversal states it exactly, and even then prefer the concrete free thing. "You don't need a wild guarantee. You need a believable one." [DND A6]

**P-f. Concrete, visual, local offers beat abstract ones.** Top clients: Slogan Social 6.59/1k (exclusive creator roster), Shop Innovator 3.94 (video teardown of their product page), MJJ 3.65 (jewelry repair overflow), Lead Flo 3.19 (free local leads, free property shoot), Twenty West 2.63 (AI-search notes, product-post ideas). Bottom: RMG 0.15 (geo-fenced ad targeting), Unleashed 0.22, LuckyDiem 0.29, Alpha Software 0.30, TargetonStar 0.34, Collabor 0.00. [data: P9] If you cannot picture the thing the prospect receives, the prospect cannot either.

**P-g. A free thing they must imagine using on someone else fails.** TargetonStar "a reactivation campaign for your SEO clients": 12,783 sent, 0 interested. RMG "a free list of ~1,000 real active homebuyers": 4,806 sent, 0. [data: top-bottom update] The free thing must be for them, about their own business.

**P-h. No timely or seasonal hook without an offer.** Scroll Stop "Post Q4 reset" 0/10,446. "Pre-Season Advantage for 2026" 0/4,767. "MWC Barcelona" 0/2,813. "Fashion Winter wear" 0/2,679. [data: P8] A season can frame a real offer. It cannot be the email.

**P-i. One problem, one offer, one CTA.** "Rule: - one problem - one proof - one CTA - 30-75 words" [2h §1.3] "You can only sell a single solution in a cold email." [2h §2.4] "Solving more than one problem in a single piece of outreach ... your offer should name one" [SOT §1.2]

**P-j. Be specific in the buyer's words.** "Use the words your ICP actually uses: patients, leads, bookings, consults, pipeline, appointments, clinicians, whatever's accurate." [DND A7] "Sharp, specific pain points only the right person recognizes get the reply." [SOT §1.3] MJJ's "bench" and Shop Innovator's "$1,000 to $8,000 buyer" are this. "If you're not being specific, no one's going to care." [2h §1.15]

**P-k. Go straight to the point after the opener.** "After the call out, go straight into the pitch. Do not bury it." / "Do not re-explain the problem to someone who already lives it." [SOT §1.2]

### 3.3 The shape that works (2026 house style)

Most Dulcy winners in 2026 look like this. [DND C] [data: top-bottom #6-#10]

```
{FIRST_NAME},                                   (or "Hey {FIRST_NAME}," or no greeting)
[Observation or the thing made for them.]       (1 line)
[What exactly they get, in plain words.]        (1 line)
[One strong proof line, this client's facts.]   (1 line, can be inside line 2)
[One-word question CTA.]                        (1 line)
```

- 3-5 short lines, a blank line between them. Each line one idea.
- Greeting: "{FIRST_NAME}," or "Hey {FIRST_NAME},". Generic-inbox campaigns lose the greeting automatically. A missing first name never becomes a guessed name. [DND C] [RULES 2026-11-20] Several top campaigns (TWM ChatGPT, F&B) open with no greeting at all. That is fine.
- Avoid the company name in the very first words if the list's company names are messy; the builder cleans legal suffixes and ALL CAPS, but a wrong name in line 1 is the most visible error. [RULES 2026-11-24] [DND D15]
- Tone matches the market: "ur" worked for TWM's food brands. Doctors get "Dr. [Last Name]". [SOT §1.3] Casual, not sloppy.

### 3.4 Lists that are mostly Outlook

"Outlook has imposed extremely strict, AI spam filters." For all-Outlook campaigns: "1 line MAX." "Ideally 25-30 words or less, 50 max." "Make the email sound as casual as possible, and as far from a "pitch" as possible." For Gmail or other: "3-4 Lines MAX", "<75 Words". [SOP 130] The engine still needs 30 words minimum, so for an Outlook-heavy list write 30-45 words.

---

## 4. Offers and CTAs

Scribe owns offers now (Forge folded in, 2026-11-24). Offer what the client can genuinely do. Never invent one. [RULES 2026-11-24, 2026-11-25]

### 4.1 Offer what we can do, without the delivery fine print

The rule (Alex, 2026-11-25) [RULES 2026-11-25]:
- Offer what the client can genuinely do, and keep the copy about whether they want it.
- Steps needed to deliver (access, logins, setup, a call to confirm targeting) belong in the reply or the call, not in the cold email.
- Example Alex approved: "I can run {COMPANY} through Profit Compass for free" is fine, even though it needs Shopify and ads access.
- State a condition only when it changes the deal for the prospect: they pay something, or it is paid vs free. Example: Marketing Cartel's "Your school covers the advertising spend" stays, because the prospect pays money. [SOP 118 #20]
- Never lie: no invented results, numbers, customers, guarantees or assets that don't exist.
- Don't get stuck on small nuances. Flag real truth problems, not every qualifier.

What this replaces: older drafts carried lines like "Publishing it is separate.", "We'd first check that we cover your delivery area", "with no call or purchase required", "on agreed jobs", "Your team would review the copy before anything changes on the site." Cut these unless the line would be false without them. [DND H2]

Truth test for a qualifier: delete it and read the sentence. If the sentence is now false (it promises something the client cannot do, or hides a cost), keep it. If it is only less complete, cut it.
- Keep: "0% duty on qualifying USMCA production" (without "qualifying" the claim is false). "Your school pays the ad spend" (a cost).
- Cut: "We'd agree on the types of companies and people first" (a delivery step). "on agreed jobs" (process, unless Alex says otherwise, see section 14).

Also from the contract, still true: "Can I send X?" commits to sending X if they say yes. Never bait-and-switch an emailed asset into a mandatory call or purchase. If the asset can only be produced after a call (Profit Compass), word the offer as "I can run / build ... for you" and ask if they want it, not "Want me to send it over?" [Contract] [SOT §1.6] [SOP 119]

### 4.2 Offer types and when each fits

| Type | What it is | When it fits | Evidence |
|---|---|---|---|
| **Free work / preview** (service lead magnet) | A small finished slice of the paid result: a post idea, notes on their AI-search gap, two ads, a page draft, 5 leads, a sell-in sheet | Default for most B2B service clients. "Service Lead Magnet (Best Performing in 2026)" [SOT §1.11] | Free notes/ideas 3.17/1k (2026); TWM post idea 24.1/1k; Lead Flo 5 leads 16.8/1k [data: P3] |
| **Talent / shortlist / roster** | "I've got a few creators in the beauty space..." | Clients who hold access the buyer wants (creators, candidates, suppliers) | Slogan Social 20.96/1k; Scroll Stop April 5.67/1k [data: top-bottom #1, U1] |
| **Video / Loom** | A short video on something real about their business | "When the opportunity is visual or tactical" [SOP 092]. Only when tied to a real observation: "This doesn't work as "can I send you a video audit" by itself. It works when you call something out, then offer the loom as the breakdown/fix" [DND A6] | Shop Innovator "I made a short video" 6.96/1k; TWM contractors 2-min video 3.77/1k on 14,842 sent [data: P2, scripts] |
| **Direct offer** | The service itself, stated as an outcome | "When the prospect already understands the problem" / "Direct offer needs a direct outcome." [SOP 094] [DND D4] | MJJ repair overflow 5.26/1k [scripts]; works when the pain is obvious and the thing is simple |
| **Case study** | "Here is how we got [result] for [similar company]" | "When there is a clear result worth sharing" and it matches what they want [SOP 089] | Best as step 2 proof; Slogan's recognisable names; Softies 88% revenue as Human's step 2 [SOP 119] |
| **Lead magnet** (digital) | A guide, report, benchmark | "it has to be something you'd normally pay for" [DND A6]. "If it's not obviously valuable in 2 seconds, it's not a real lead magnet." | Weaker than a service lead magnet; "This is not a digital lead magnet (ebook, guide, checklist)." [SOT §1.11] |
| **Whitepaper / interview** | "We're writing a white paper on..." | Demand-generation markets, narrow niches, no proof yet [DND D6]. Every named company and "already spoke with" must be true. | Middling: 1.26/1k vs 1.68 (15 campaigns, 97,881 sent). KNR luxury fashion 4.16/1k but TwoTreesPPC Software 0.26, Snowball SaaS 0.39. Dulcy's own Amazon whitepaper: 8,000 contacts, 7 replies, 0 bookings. [data: U7] [DND E4] Don't default to it. |
| **Risk reversal** | An approved guarantee | Only with the client's exact approved terms [SOP 090] | Guarantees did worse: 0.88 vs 1.72/1k [data: U4] |
| **Free audit / consultation / strategy** | Avoid | "Generic "audit" offers (in sophisticated markets, nobody cares)" [DND A6]. "No one wants a marketing strategy (Not valuable)" / "No one wants a short audit" [DND A6]. Tier list puts "Free audit" at D: "If you can identify the problem externally, just give them the insight/value instead" [SOT §2] | TWM pre-Dulcy: Free Marketing Strategy 0.5% replies, Free audit 0.4% [DND E5] |

Rules for the free thing:
- "Rule: relevance > free stuff" / "Your free thing should preview the paid result" [DND A6] [SOT §1.11]
- "Make it specific ("2-3 fixes") and fast ("10-minute Loom"), not vague ("full audit")" [DND A6]
- "Help me improve what's working" beats "let me build this for you from scratch" [SOT §1.10]
- Name the burden you remove: "No need to plan a shoot just to see the idea." (TWM F&B, 23.56/1k) [data: top-bottom #8] [SOT §1.10]
- Bound it: one product, two ads, one SKU, five leads, one page. [SOP 118 #21]
- "Be careful leading with a website offer because it is a ton of trust up front ... some people take their website very personal" [DND A6]

### 4.3 Offer decay (free leads used to work better)

- Alex, 2026-11: free-leads offers used to get 20-25%+ positive reply rates. Now about 10%. [creator-learnings] The free lead list is "now more saturated ... it is less effective but still outperforms a naked service pitch." [SOT §1.11]
- Dulcy's 2026 agency list offer ("Could I build you a free list of 1,000 potential clients...?") sits at 1.06-1.75/1k, around the agency average, not a winner. [data: A/B EB 626, 627]
- Rule: an offer the market has seen many times needs a fresher frame (a narrower segment, a specific use: "for your next client push", a concrete sample) or a different free thing. Atlas decides the move. Scribe flags saturation in the notes.

### 4.4 CTA rules

The default ask is low friction and answerable in one word. A call is asked for only when it is the only logical next step. [RULES 2026-11-25]

- "If your CTA makes them think, you lose. Your CTA should be: low resistance / one-step / no links / easy to reply to with one word" [DND A3]
- "You're not trying to close a deal in email #1. You're trying to get a reply so the conversation starts." [DND A3]
- ""Just let me know" or none action taking CTAs statistically lead to worse reply rates then asking for the user to take an action" [DND A3] So ask for one concrete action ("Want me to send them over?"), not "let me know".
- "15-minute call is a very high ask for a low consciousness prospect on the problem + solution." [DND A3]
- "The multiple choice answer is phased out (not as effective anymore compared to 3-4 years ago)" [DND A3]
- Make it a non-decision: "Want me to set it up? Takes 30 seconds and it's free." [SOT §1.6]
- CTA type data is weak (call asks 2.26/1k, permission-to-send 1.61, interest check 1.25, mixed within clients), but both significant A/B tests that changed the CTA favoured permission-to-send. [data: weak evidence] The rule stands.

**CTAs that work (permission or micro-yes):**
- "Want me to send them over?" (TWM ChatGPT notes, 16.70/1k) [data: top-bottom #6]
- "Mind if I put that together?" / "Want me to put that together?" (TWM post idea, 24.13/1k) [data: top-bottom #8]
- "Mind if I make it?" (TWM reel, 23.56/1k)
- "Want me to send it over?" (Shop Innovator video, 6.96/1k)
- "Could I send you 5 leads from people already looking for those services?" (the offer is the CTA, 16.76/1k)
- "Would it be helpful if I sent over some influencers from our exclusive talent roster?" (Slogan, 20.96/1k)
- "Would you guys find that useful?" (TWM F&B, 14.34/1k)
- "Can I send a quick video explaining?" / "Mind if I show you an example?" / "Want me to share the breakdown?" [DND A3]
- "Can I send you a few resumes to look at?" [SOT §4.14]
- Softest (for later steps): "Is [result] a priority right now?", "Would you be the right person to speak to?", "Mind if I send more info?", "Is this the best place to send it?" [DND A3]

**CTAs that are too generic or too big:**
- Stand-alone "Interested?" and "Worth a chat?" (Archive: "Too Generic"). [2h §1.4] Scroll Stop's April winner used "Worth a chat?", but it carried a concrete talent offer. Today write "Want me to send over 2 creators we'd look at first?" instead.
- "Would you be interested in discussing?" [SOP 011] "Is this worth exploring for {COMPANY}?" (LuckyDiem, 0/5,176) [data: top-bottom #360]
- "Do you have 30 minutes this week?" / "Would you be open to a brief 15-minute call...? You can book a time ... here: [link]" [DND A3, B8]
- "If you're open to it" ("is asking them to shoo you away"), "If it helps", "I'd love to", "Just let me know". [DND B7]
- A statement instead of a question ("If you're looking closely at revenue per user this month, a quick conversation could be useful", Scroll Stop, 0/10,446). [data: top-bottom #365]
- Pitch dressed as a CTA: "Any interest in adding $73,000 in the next 90 days?" [DND G3]

---

## 5. Subject lines

Hard rule: 1-3 words, no punctuation (apostrophes and {VARIABLES} allowed). Thread replies have no subject. [Engine]

Alex:
- "The best subject lines look like an internal email. Not "marketing." Not clever. Not try-hard." [DND A4]
- "Make it feel like a coworker emailing another coworker. Short. Normal. Easy to understand in half a second." / "If your subject line could realistically be sent inside a company Slack/email thread, you're doing it right." [DND A4]
- "We also don't track open rates, so there's no reason to obsess over this." Open tracking stays off. [DND A4] [SOP 130]
- ">Dont let them know its a cold email until they open oit" [DND A4]
- "saying like quick idea for {company} lead flow is just saying this is a marketing email" → "our homepage | our lead flow | quick question" [DND A4]

What the data says [data: P5]:
- 1-2 word subjects 2.24/1k vs 3+ words 1.14/1k (2026: 2.30 vs 1.71).
- The prospect's own topic word wins: `{KEYWORD}` (the search term) 6.58/1k across 8 campaigns, 42,241 sent. `{HEROPRODUCT} question` 8.74/1k (TWM EB 609). `post idea` 8.22/1k. `product question` (Shop Innovator). `repair capacity` (MJJ).
- Scroll Stop, same client, same product: `{our creators|influencers|creators}` 2.65/1k vs `Use influencer marketing for {COMPANY}` 0.71/1k.
- Pitch-style subjects fail: "Would this make sense for {COMPANY}?" 0.17/1k, "Quick question {FIRST_NAME}" 0.21/1k, "Why top apps reset in February" 0/10,446.
- Short is not the rule by itself. Lead Flo's longer local subjects (`{RESTAURANT} - yes or no?`) did better for them (4.37 vs 1.14). What fails is the pitch, not the length. Those subjects break the punctuation rule, so they are an open question (section 14).

How to write them:
- Use the topic of the email in their words: the product, the service, the search term, the thing on offer. `{COMPANY} rentals`, `five rental inquiries`, `extra repair capacity`, `two ads`, `repair capacity`. [DND C]
- Lowercase is fine and looks internal. [SOT §1.7]
- One subject per Email 1 variant. Each variant's subject should fit its angle, so the subject does not become a second test variable. If both angles share a topic, use the same subject on both.
- Four types (Alex): Desired outcome, Pain, Reference, Curiosity. "Curiosity ... most common used because it creates a small "open loop"". [DND A4]
- Never "Re:" or "Fwd:" on Email 1. Never a fake thread. [copy-framework.md]
- Check: send it to yourself and look 2-3 hours later "when I am super busy and see if it catches my own attention". [DND A4]

---

## 6. Follow-ups

Follow-ups bring in about 52% of interested replies. Treat them as seriously as Email 1. [data: P1]

| Step | Emails sent | Interested | Per 1k | Share |
|---:|---:|---:|---:|---:|
| 1 | 424,922 | 874 | 2.06 | 46.7% |
| 2 | 395,529 | 517 | 1.31 | 27.6% |
| 3 | 370,385 | 455 | 1.23 | 24.3% |
| 4+ | 12,058 | 26 | 2.16 | 1.4% |

Each follow-up converts at about 60% of Email 1's rate. Alex: "I've had plenty of campaigns where Step 2 and Step 3 generated the majority of positive replies." [DND A5]

### 6.1 Rules for every follow-up

- **Same offer.** "Do not invent a new offer in the follow-ups." [2h §1.12] [Alex, chat 2026-11-25]
- **Each one adds something new.** "Your follow-ups should do three things: 1. restate the core idea (without copy/pasting the same email) 2. make the "yes" easier each step 3. *Add more context through social proof" [DND A5] "The core rule: each step gets easier to say yes to, and adds something new." [DND A5]
- **Thread replies, no subject.** [Alex, chat 2026-11-25] [Engine: thread_reply true, subject empty] "Steps 2 and 3 are genuine in-thread replies with no new subject." [DND C]
- **At most 75 words.** [Engine] Most winning follow-ups are 40-80 words; stay at 30-60.
- **No bump.** "The biggest mistake people make is the lazy follow up: "just bumping this up." It's weak, it looks thirsty, and it adds no value." [DND A5] "Never say quick follow up // just bumping this up. Stands out as youre marketing them" [DND A5] Also banned in code: "following up", "just checking in", "circling back", "bumping this". [Engine] "As I mentioned in my first email" counts too. [2h §4.10.13]
- **No breakup.** "Just don't do the cringey "last email" thing." [DND A5] "I haven't heard back, so I'll pause outreach for now." = "No way someone would read past this." [DND B4]
- **No greeting is needed** in a thread reply. Starting straight with the new thing reads natural ("Just a bit more on what I mean:"). "Hey {FIRST_NAME}," is also fine. [data: TWM, MJJ scripts]
- **Don't repeat the same CTA wording.** Rotate easy CTAs: "Open to hearing more? / Want to see how it works? / Is this a priority right now? / Should I send it here? / Are you the right person for this? / Want me to pass over a quick example?" [DND A5]
- **Pre-handle the plan's top objection** in step 2 or 3, in one line. E.g. "You wouldn't need to move all your repair work." (MJJ step 2, 4.39/1k) answers "we already have a bench". [scripts: MJJ EB 603]

### 6.2 Step 2's job: clarify and make it easier to believe

- 2h SOP: "Step 2 job / Clarify the first email and make it easier to believe." [2h §1.12]
- Alex: "Step 2 should feel like: "same idea, quicker, easier yes." You can: add context / offer the lead magnet again / offer a Loom instead of a call / give 2-3 specific ideas." [DND A5]
- 2026 drafts: step 2 explains how the free work is done, or narrows to one item and asks a pick question: "Which service would you choose?" / "Which rentals would you like more inquiries for?" / "Is there a product page you'd want us to start with?" [DND C]
- Good step 2s from the data:
  - TWM F&B (EB 609), 8.17/1k, the best follow-up rate in the data: explains the idea in more detail, adds what they'd get (three post angles with hook, visual idea and caption), one line of experience, then "Want me to send a quick video showing how that would work?" [scripts]
  - Scroll Stop April (EB 428): "Asked because we've run creator campaigns for [client] that generated [result]." + "Want me to send over 2 creators we'd look at first for {COMPANY}?" The "reason I ask" opener makes the follow-up feel natural and brings in proof. [data: U1] [DND F14]
  - MJJ (EB 603), 4.39/1k: removes the biggest objection, then a pick question. [scripts]
- Proof often lands best here. If Email 1 carried the offer and a light proof, step 2 can carry the strongest case study (Human's Softies 88% revenue / 22% AOV as step 2). [SOP 119]
- "The 'I know this sounds crazy' move": open with "I realize this is probably crazy, you probably didn't even believe me. Let me explain better." then show how it works in detail. In that third-party campaign ~50%+ of interested replies became calls, because "A scammer would never go to this level of effort." [2h §1.12] Use when the offer sounds too good to be true. (Write the dash as " - " or a full stop.)

### 6.3 Step 3's job: the lowest friction

- Alex: "Step 3 is where you go low friction. Three approaches that work a lot: "Are you the right person?" / "Should this go to you or {COLLEAGUE}?" / Reiterating the offer again" [DND A5]
- Data: the right-person step 3 often beats step 2. TWM ChatGPT: step 3 4.89/1k vs step 2 3.38/1k. TWM beauty: 5.56 vs 1.78. TWM home and consumer: 3.67 vs 3.36. [data: top-bottom #6, #10, #14]
- 2026 drafts: step 3 lowers the bar again, one small concrete action ("Send over one job your bench couldn't take on.") or adds a sweetener ("You'd also get a short recorded walkthrough"). [DND C]
- Winning step 3 shape (TWM): "I wasn't sure if I should send this to you or someone else. / I recorded a quick video showing a few things that may be stopping {COMPANY} from showing up more often when people search for {KEYWORD}. / Mind if I share the video here?" (Only if the video is real. Otherwise: "I can record a quick video..." )
- {COLLEAGUE} is a custom variable. Use it only when the list has it, with a fallback ("someone else on your team").
- The 2h SOP gives step 3 a different job ("Add trust, proof, examples, or practical ideas"). Alex's newer follow-up doc and the data favour low friction. Default: low friction, with one new small reason (an example, a narrower ask) inside it. [2h C18]

### 6.4 Step 4: only if the evidence supports it

- Default: 3 steps. "Most sequences should be 2-3 steps." [DND A5] Generate Filters sizes lists on 3 steps. [RULES 2026-11-23] Human's sequence has "no email 4 so blank on purpose". [SOP 119]
- Alex: "4 steps is rare and usually only makes sense if your TAM is small (think under ~10,000 prospects) and you need to squeeze every reply out of the list." [DND A5]
- Data: step 4+ was only 12,058 sends and 26 interested (2.16/1k, too small to trust). LuckyDiem's 5-step sequence got 0 interested on every step (5,824 sent). [data: P1, top-bottom #361]
- "Never send more than 3/4 emails per sequence (to avoid spam complaints)." [SOP 011] "Beyond that ... spam report rate increases." [SOT §1.13]
- Write step 4 only when: the plan says the TAM is small (under ~10,000) AND this client's own scripts show step 3 still converting at or above step 2. Step 4 = the same offer from a new side (a different example, a routing question) with no "last email" wording. See section 14, question 4.

---

## 7. Style and banned phrases

### 7.1 Reading level and words

- Write as simply as clarity allows. Alex's sources say 6th grade (Triple Tap), 4th grade (3 Simple Rules), below 3rd grade (Template Library). [2h §1.8] [DND A2] Default: about 5th grade or lower, short sentences, everyday words. The test: "Can a 10-year-old understand what you're selling?" [2h §3.5] See section 14, question 2.
- Keep the buyer's real trade words even if they are not "simple": bench, MOQ, SKU, CPI, contribution margin. "Normally, simplicity is preferred. The exception is when niche-specific language increases trust ... Do not use insider language merely to sound clever." [SOT §1.3]
- "Make sure the dream outcome is presented in plain language - not just numbers and stats." [2h §1.8]
- Concrete nouns and verbs. No inflated adjectives. No abstract benefits ("drive consistent growth", "optimize your outreach process"). [copy-framework.md] [DND B12]
- Read it out loud: "It needs to sound like you're talking to someone at a bar." [2h §3.7]

### 7.2 Banned words and phrases

Code-banned (bounced automatically): "this isn't just", "it's not just" (by the 2h rule), "following up", "I am following up", "just checking in", "circling back", "bumping this", "hope this finds you". [Engine] [2h §1.8]

Alex-banned (reviewer fails it):
- "I'd love to": "we always say this but prospect get the "ick" from it. Ask yourself "What's in it for them?"" [DND B7]
- "If you're open to it": "is asking them to shoo you away". [DND B7]
- "If it helps": "Already implying it might now or hasnt before". [DND B7]
- "Just let me know" (non-action CTA). [DND B7]
- "quick follow up", "just bumping this up". [DND B5]
- Fake scarcity: "We only build a small number of these ... Yours is ready on our end". "bait and switch energy". [DND B3]
- Guilt breakups: "I haven't heard back, so I'll pause outreach for now." [DND B4]
- Vague marketer words: "Noticed a few areas", "In your space", "Cleaner flow, stronger positioning, clearer CTA", "Nothing crazy.. Just higher intent design." [DND B6]
- Generic "we help" lines: "We specialize in identifying and fixing those issues to drive consistent lead growth." ("and so do 100k agencies") [DND B1] "We help businesses grow" ("invisible in an inbox") [SOT §1.4] "If we could help generate 1-5 clients...", "We help X get Y in Z time". [2h §1.8]
- Company bio as an offer: "We're honest. 80% renewal rate. Five years in business." "That's not an offer. That's a company bio." [SOT §1.4]
- Hype: "10X your revenue", "go viral", "game-changer", "the future". [SOT §1.4] "Do NOT use euphoric words." [2h §1.8]
- Mentioning the framework ("Triple Tap") or any formula. [2h §1.8]
- "Hope you're doing well" or any phatic opener. [SOP 011]
- Emojis, emoticons, decorative punctuation, exclamation-heavy lines. [SOP 134] [SOP 118 #25]
- Thanks or "great question" (those belong to replies, and are banned there too). [Contract]

### 7.3 Punctuation and format

- " - " for a dash. Never "—" or "–". [Engine] [2h §1.8]
- No semicolons. "Avoid semicolons or excessive punctuation." [Engine] [2h §1.8]
- Plain text. No bold, no bullets in Email 1 (a 3-item list in a follow-up can work, as TWM step 2 did). No HTML, no images. [SOT §1.15]
- One idea per line, blank line between lines.
- Write money and percentages only when they are approved proof. "$" and money words can trigger spam filters [SOP 130]: EmailGuard checks the final copy. See section 14, question 10.

### 7.4 Spam words

- Alex's note: "I replaced the word 'free' with complimentary in the script. The very next email generated a lead. Spam words are no joke." [SOT §1.4]
- Flagged often: "free", "guarantee", "money", "urgent", "act now", "$". [SOP 011, 130]
- No full list exists. EmailGuard runs on the final spintaxed copy before upload. [RULES 2026-11-17] Scribe writes naturally ("free", "at no cost", "on us") and avoids stacking several money words. If EmailGuard flags a word, swap it ("complimentary", "at no charge").

### 7.5 Variables

- {FIRST_NAME}, {COMPANY}, and custom variables only when the plan and list have them. The code bounces any other {VARIABLE}. [Engine]
- A variable must read naturally in the sentence. "CONTRACTOR must be a grammatical singular trade noun, e.g. roofer". [SOP 118 #16]
- Every custom variable has a fallback that fits the copy ("your area", "your products"). Never blank, never "Not Found". [RULES 2026-11-21] The build stops if any lead is missing a variable the copy uses. [RULES 2026-11-24]
- Never spin a variable. [RULES 2026-11-17]
- A signal used to pick the list does not have to appear in the email ("active_meta_ad_evidence: Audience gate, not an email merge field"). [SOP 118 #15]
- Sub-segment variables help: "Nick has never run a campaign where adding a specific sub-segment variable did not improve performance." [SOT §1.9]

### 7.6 The P.S. (added by the system, do not write it)

- The builder adds "{P.S.|P.s.|p.s.} or tell me to pound sand if you'd like.." unless a P.S. is already there. [RULES 2026-11-20]
- It is the opt-out (the unsubscribe link is always off). [RULES 2026-11-23]
- It travels with the winners: 2.37/1k with it vs 0.88 no P.S. vs 0.74 guarantee P.S. (all years). Scroll Stop 2.48 vs 0.75. Recovered campaigns: 3.20 vs 1.24. Confounded with the 2026 template, so Medium evidence. [data: P4, U2]
- So Scribe writes no P.S. at all, and never a guarantee P.S. A proof P.S. is an open question (section 14, question 6).

---

## 8. Proof

### 8.1 The rule

At least 1 strong proof per email, from this client's facts only. More is better only if every extra proof is just as strong. No filler proof. [RULES 2026-11-25]

- "On proof and social proof: This is the single heaviest lifting element of the value prop." [SOT §1.5]
- "nothing builds trust faster than showing that you've already done exactly what they want… for someone just like them." / "Numbers Beat Adjectives ... Specifics = trust." [DND A7]
- "the more specific your proof, the less selling you have to do" [2h §1.9]
- "Credibility can be: a relevant case study / a known competitor you work with / media mention / a specific result. Not "we're experts" that means nothing." [DND A2]

### 8.2 What counts as proof (three types)

From Alex's 2026 guide [2h §1.9]:
1. **Social proof: "I did the thing."** A result for a similar company. "The more specific the similarity, the more powerful it lands." Stack layers: same industry, same size, same stage, same problem. ""We helped a SaaS company" is weak. "We helped a 15-person B2B SaaS selling to mid-market HR teams" is strong."
2. **Third-party authority: "They found it."** A credible outside source the reader knows (Google, a major publication). "Use this when you don't yet have your own social proof." It must be real and sourced. "Authority must match the recipient's world ... does this person know this source?"
3. **Knowledge as proof: "I know this about you specifically."** Research or niche expertise shown in the email. "That's not a pitch, that's a demonstration of capability. ... It flips the dynamic from "trust me" to "look what I already know about your situation."" [2h §2.7]

Also strong:
- **Recognisable names.** "No number at all, but everyone knows Apple, so the proof is much more effective." [SOT §1.5] Slogan Social's "brands like DoorDash, Meta, and Amazon Prime Video" was the #1 campaign at 20.96/1k. [data: top-bottom #1]
- **Mechanism as credibility.** One short line on how: "We use Predictive Targeting to identify high-intent players before an ad is even served". "Every bold claim needs a reason it is possible." [SOT §1.3]
- **Company facts that matter to the buyer.** "MJJ Brilliant has been a family-owned and operated jewelry manufacturer since 1982." (Keep it secondary to the buyer benefit. [DND B, MJJ])

### 8.3 Match the proof to the dream outcome

- "Proof must match the dream outcome / Irrelevant proof kills trust. Every proof element should reinforce the specific outcome you're promising." [2h §1.9]
- Scope it to what it proves. Dulcy's Digital Force "$25,000 MRR added in 21 days" is proof of broader outbound work, "not the free list or a guaranteed result" and "not an AEO/GEO-specific result". [SOP 118 #1] Human's Thompson Tee case "supports SEO/content capability only". [SOP 118 #5]
- Historical speed is not a promise. TONAL's "200+ video variations in less than three days" (2021) must not become a three-day turnaround promise. [SOP 118 #4]
- Proof that loses: "We've helped 500 home and garden brands ... to $100K/mo" was in the losing Shop Innovator variant (1.93 vs 6.96/1k). A huge vague number can lower trust. [data: P2] "Do not maximize only the dream outcome. A bigger promise can actually lower trust." [SOT §1.3]

### 8.4 Where the proof goes

- Email 1: one line, or baked into the offer ("creators ... who've been part of campaigns driving 1M+ views"). [data: U1] "Often the proof is baked directly into the offer itself." [2h §2.5]
- Step 2: the strongest case study, with "Asked because..." or "For context...". [data: U1] [SOP 119]
- Never a guarantee as "proof". [data: U4]
- Data note: proof in Email 1 did better for Dulcy (3.10 vs 1.02/1k) and Shop Innovator (4.20 vs 1.96), and worse for Lead Flo, Twenty West and Scroll Stop, whose winners carried no case study but had a strong knowledge-as-proof opener (the real ChatGPT query, the real product idea). [data: weak evidence] That is why knowledge-as-proof counts.

### 8.5 When there is no proof

1. Never invent one. Never borrow another client's. Never use the numbers in swipe files (Anivvo's 10M emails, the "300+ clients" agency, Russell Brunson, Leadbird, Planta, the 31% apparel example). [RULES 2026-11-17] [SOT §0] [2h §1.9]
2. Use knowledge as proof: a real observation about their business that only someone who looked would know (the actual ChatGPT answer naming two competitors, their hero product in a use moment, their listing in their city). This is the 2026 winners' main proof.
3. Use a real, sourced third-party fact that validates the category, if one exists in the client facts.
4. Use a real mechanism line ("We use your existing photos and clips").
5. Say so in questions for Alex: "No approved case study for this vertical. Email 1 uses [knowledge-as-proof line]. Is that enough, or can the client approve a result?" [Engine WRITER] [SOP 118 conflicts #5] See section 14, question 5.
6. Unverified client claims stay out until approved: Dulcy's "average 20+ sales opportunities per month" is not verified; do not use it. [clients/dulcy.md] "Current lack of evidence is not a finding that the historical claim is false." If the client supplies substantiation, keep the original line. [SOP 118 #3]

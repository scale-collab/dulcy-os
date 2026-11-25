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

---

## 9. The 2 angles: making them a meaningful test

### 9.1 The rule

One direction per campaign (one thesis). Email 1 has exactly 2 variants, one per plan angle. They test something that makes a real difference: USP, pain point, solution angle, proof or offer framing. Never trivial word swaps. [RULES 2026-11-25] [Alex, chat 2026-11-25]

Why: most A/B "winners" are noise. Of 91 Email 1 tests, only 6 reached p < 0.05, about what chance alone gives. Typical variants had 300-1,000 sends and 0-10 interested. At ~2/1k a variant needs about 5,000+ sends to detect a 2x difference. [data: P10] Small differences never show up. Only big ones do. "I've NEVER seen tiny syntax changes consistently reproduce at our scale. When a test really moves, there's usually a bigger difference between the two versions (different angle, offer, proof, audience, etc)." [SOT §1.16]

### 9.2 How to build the two

1. Start from the plan's 2 angles. Each has a name, what it tests and a hypothesis. Write each variant so that a reader could name the angle from the email alone.
2. Keep fixed: the audience, the offer, the CTA type, the length band, the follow-ups (both variants share steps 2-3). [SOP 118 global rules] Change: the one thing the angle is about.
3. Both variants must pass every rule on their own. Neither is a "weak control".
4. Write what each tests in the notes, in one line: "A tests the pain of losing quotes on price. B tests the outcome of becoming the obvious choice."

Good angle pairs (real differences):
- **Pain vs desired outcome.** "A roofing company isn't getting any inbound calls. The pain is invisibility." vs "already gets calls, but wants to stop competing on price". [SOT §4.23] Same offer, two openings.
- **Offer-led vs context-led** (the 2026 house test): 1A "I'd like to offer {COMPANY} five free rental inquiries." vs 1B "Have a repair job your usual bench can't take on?" then the same offer. [DND C]
- **What they already have vs what we do for them** (TWM EB 609): "turn usable product photos and clips you already have into a series of social posts" (14.3/1k) vs "so your team isn't planning, writing and putting together every post" (5.6/1k). [data: P3]
- **One idea vs two ideas** (TWM EB 599): 24.1 vs 2.7/1k. [data: P3]
- **Observation + thing made vs question + claim** (Shop Innovator EB 465): 6.96 vs 1.93/1k. [data: P2]
- **Free sample vs service pitch** (Lead Flo EB 514): 16.8 vs 1.8/1k. [data: P3]
- **Two different USPs**: MJJ "No MOQs made-to-order" vs "0% duty production" (subjects and lead benefit). [scripts: MJJ EB 605, 606]
- **Two different pains for the same buyer**: MJJ repairs "Are repairs taking time away from your jeweler's custom work?" (9.89/1k) vs "Have a repair job your usual bench can't take on?" (7.25/1k). [scripts: MJJ EB 603]
- **Same offer, two buying situations**: "For a company with reps, you could test helping them find better accounts to approach. For a founder without a sales team, you could test finding demand before they hire." [2h §2.14] (Only inside one direction; two different audiences belong in two campaigns.)

Bad angle pairs (do not do this):
- Scroll Stop "{COMPANY} works with creators to show the best of {PERSONAL}" vs "{COMPANY} is all about staying true to {PERSONAL}", re-run 15+ times. It is a phrase swap. [data: All tests]
- Lead Flo "Saw you guys provide landscaping in {CITY}." vs "Noticed you guys provide landscaping in {CITY}." (0 vs 0). [data: EB 616, 617]
- RMG "Would you be open to a quick discussion to see how this could look for {COMPANY}?" vs "Would it make sense for us to discuss what this could look like for {COMPANY}?" (0 vs 0). [data: EB 245]
- A greeting test: "{Hi|Hey|Hello} {FIRST_NAME}," vs "Hi {FIRST_NAME},". [data: EB 208]
- Demo wording: "Would you be open to a 5m demo?" / "Up for a short demo?" / "How about a quick demo?" [SOP 015]
- Two angles that change audience, offer and proof at once. That is two campaigns, not a test. [SKILL] [SOT §1.16]
- Nine variants of everything (Lead Flo's 9-test offer validation, Forever Card's 10 whitepaper headlines). [2h C5] [data: EB 154, 167, 176]

### 9.3 After the test

- "Write down who you're testing, what you're saying, and why you think it will matter to them. When the replies come in, keep them with that experiment" [2h §5.2]
- Don't call a winner from a handful of replies: "Variant A: 2 positive replies / Variant B: 1 positive reply ... It tells you basically nothing". [SOT §5.3]
- Judge "after the complete three-step sequence plus 14 days". [DND C]

---

## 10. Rewrites after feedback, copy fatigue and re-sends

### 10.1 Rewriting after client or Alex feedback

The engine passes feedback with: "fix all of it, keep what they did not mention". [Engine]

1. Fix every point raised, in the fewest words. Keep every line they did not mention, exactly.
2. If the feedback changes the offer or commercial terms (price, quantity, free vs paid, a guarantee), it is an offer change: note it in the claims list and make sure the client fact exists. [copy-review-contract.md]
3. Respect client direction on the ask and style when it is truthful. ChopShop wanted "Meetings first"; MJJ prefers statement closes. Post-call direction "overrides old onboarding". [SOP 118 #24] Where it conflicts with RULES (a call ask in the cold sequence), keep the client's wish only if the plan says the call is the only logical next step, and flag it.
4. "Rewrite once. Once." [2h §3.3] "If it passes, stop editing." [2h §3.1] "Stop cosmetic revision; obtain approval and test under the managed workflow." [DND C] Do not polish what nobody asked about.
5. Vague feedback ("make it better"): pick the single highest-impact supported change (usually the offer line or the opener) and say what you changed. "do not just say 'make it better.'" [SOT §1.16]
6. Keep a top-up's winning Email 1: "No new offer or opening test. Preserve Email 1; only evidence and claim-safety fixes to follow-ups." [SOP 118 #29]
7. A material edit invalidates the old approval. The client re-approves. [copy-review-contract.md] [RULES 2026-11-25]

### 10.2 Copy fatigue and re-sends

- **Re-sending the same copy decays toward zero.** Scroll Stop Sports re-runs: 0.55 → 0.48 → 0.00 → 0.00/1k (runs 1-4, 5,834-7,242 sent each). Consumer Electronics 0.78 → 0.81 → 0.24 → 0.49. Apps 0.90 → 0.19. Fashion 0.76 → 0.41 → 0.09. [data: P7]
- Campaigns named as copies or re-runs: 1.42/1k vs 1.70/1k for the rest. [data: P7]
- The Scroll Stop April 2026 winner (5.67/1k) re-sent to a "$10M+" list in June fell to 2.88/1k. [data: U1]
- Offers decay too: free leads 20-25% positive replies → about 10% now. [creator-learnings]
- Exception: a re-up to a **fresh list** can hold (Twenty West Local Contractors Re-Up 2.10/1k). [data: P7]

What to do:
- Same copy, same TAM, second pass: write a new angle and refreshed copy. "Whatever number is in your TAM, hit them every 30-60 days and repeat with new messaging, new offers, and new copy." [SOT §5.3]
- Monthly rinse and repeat: "Pull new list / Change angle / Refresh copy / Run again" [2h §5.6]
- Lookalikes of interested leads get the message that earned interest. Remaining eligible leads get a new angle. [2h §5.5]

### 10.3 Before rewriting copy that underperforms

1. **Check the list first.** Same copy, different list moved results 3x to 6x. Slogan Social's identical email: 20.96/1k on North America, 3.67/1k on CMOs. Inlight Insight's identical opener: 3.15/1k on consultancies, 0.70 on SaaS, 0.63 on financial services. "before rewriting copy that underperforms, check whether the same copy already worked on another list." [data: U5] "Sometimes, bad targeting = bad results no matter how good the copy is." [SOP 015]
2. **Check delivery.** "Changing the copy doesn't fix a sending problem" [2h §5.3] Bounce over 2.5% = watch, over 4% = paused. [RULES]
3. **Check the offer.** "If the offer is weak, swapping a subject line or rewriting 3 words probably isn't saving it. The biggest gains usually come from changing who you're targeting, what you're offering them or how the offer is framed." [SOT §5.3] Atlas decides top-up vs new vertical vs new offer; copy is the last lever. [DND A12]
4. **Read the replies.** "Don't just track numbers - analyze responses." [SOP 015] Objection → copy fix: "We already have this covered" → show how you complement their team; "Not interested" → test a new pain; no response → change the opener or the offer framing. [SOP 015]

---

## 11. The send check

Run this on every email (both Email 1 variants and every follow-up) before returning the draft. The engine's reviewer runs the same check. [Engine REVIEWER]

### 11.1 The five questions (read it as the prospect)

From Alex's final send check [2h §3.3] and checklist [2h §3.1]:
1. **Why would I care?** Is it about my business, in my words, with something I'd want?
2. **Why would I believe it?** Is there one strong proof, from this client, that matches the outcome?
3. **Why is replying worth it?** Does a reply get me something concrete?
4. **Is the ask small enough?** One word to answer? No call, no link, no homework?
5. **Could a scammer have sent this?** "If yes, add specificity". [2h §3.2]

"If it fails that test, rewrite once. Once." [2h §3.3]

### 11.2 Alex's critique list as a checklist

Tick every line. Each is a real critique Alex made. [DND B] [2h] [SOP 118]
- [ ] It is about them, not about us. "Talking about yourself too much (they don't care)" [DND A2]
- [ ] It names a specific issue or thing, not a category ("I noticed {issue} - solving {issue} leads to {benefit}..."). [DND B1]
- [ ] No "we specialize in", "we help businesses grow", "can we help grow your business?". [DND B1, B2]
- [ ] No fake scarcity, no "yours is ready", no bait and switch. [DND B3]
- [ ] No "If you're open to it", "If it helps", "I'd love to", "Just let me know". [DND B7]
- [ ] No 15-minute call, no calendar link, no "do you have 30 minutes". [DND B8]
- [ ] No vague marketer language a local owner would not understand. [DND B6]
- [ ] No irrelevant personalisation (college, hometown, random facts). [DND A2]
- [ ] Not an inbox essay. 30-75 words. [DND A2] [Engine]
- [ ] No fancy formatting, images or links. [DND A2] [Engine]
- [ ] One problem, one offer, one proof, one CTA. [2h §1.3]
- [ ] Dream outcome is money, time or status, in plain language, and fits this audience. [2h §3.1]
- [ ] Proof reinforces the exact dream outcome and the source means something to this reader. [2h §3.1]
- [ ] Clearly Question → Proof → CTA or Offer → Proof → CTA. [2h §3.1]
- [ ] Feels written for this market and this person. [2h §3.1]
- [ ] A 10-year-old understands what is offered. You would say it in person. [2h §3.5]
- [ ] Every claim is in this client's facts. Every "I made / I pulled" is real. [SOP 118]
- [ ] No assumed problem stated as fact ("I noticed you're still manually screening..."). Observed vs guessed is kept apart; guesses become questions. [SOP 118 #13-14] [SOP 015]
- [ ] Conditions that change the deal are stated. Delivery steps are not. [RULES 2026-11-25]
- [ ] Variables read naturally, with fallbacks. No variable is spun. [RULES 2026-11-21]
- [ ] Follow-ups: same offer, each adds something new, no bump, no breakup, no subject. [Alex, chat 2026-11-25]
- [ ] The 2 variants test a real difference that the plan named. [RULES 2026-11-25]
- [ ] No signature, no P.S., no spintax. [Alex, chat 2026-11-25]
- [ ] The reply-feels-easier-than-ignoring test passes. [2h §3.6]

### 11.3 Pre-launch checks (Atlas runs them; Scribe should expect them)

- Preview 10-15 random leads. "Variables populate correctly ... Nothing looks broken, awkward, or "obviously automated"" [DND A10] [SOP 011: "Preview copy in Bison for 15+ leads"]
- "No missing assets that you need (links, lead magnet, doc, Loom, whatever you referenced)." [DND A10]
- EmailGuard spam check on the spintaxed copy: "as close to clean as possible (1-2 flags can be fine)". [DND A10] [RULES 2026-11-17]
- "Send the email to myself and read it at first glance like I'm busy". [DND A10]

---

## 12. Best examples (full sequences, verbatim)

Read these for shape and voice. **Every name, number, result and claim belongs to that client only. Never reuse these facts.** Several were sent with spintax, signatures and a P.S.: those parts were added by the system. Scribe writes the plain version. Where the copy breaks a current rule, the note says what to change.

### 12.1 Twenty West Media · ChatGPT shopping questions (skincare and haircare) · never reuse these facts
EB 597: 6,453 sent, 61 interested = **9.45/1k (5.7x average)**, 7 meetings. Step 1 variant A: 2,336 sent, 39 interested = 16.70/1k. Step 2: 3.38/1k. Step 3: 4.89/1k. Same copy at EB 598: 6.46/1k. [data: top-bottom #6, scripts]

Subject: `{KEYWORD}`
```
I asked ChatGPT for "{SEARCH}" and the first 2 brands that came up were {COMP}.

Didn't see you guys come up.

I spent a few minutes digging into why those {KEYWORD} were getting recommended and pulled together some notes for {COMPANY}.

Want me to send them over?
```
Step 2 (same thread):
```
Just a bit more context on what I was referring to.

According to Clutch, 65% of consumers now use AI when researching products and deciding what to buy.

So when someone asks ChatGPT something like "{SEARCH}", the brands it surfaces, like {COMP}, are often being considered before they look anywhere else.

I can show you how we'd get {COMPANY} in front of more of those searches.

Open to that?
```
Step 3 (same thread):
```
I wasn't sure if I should send this to you or someone else.

I recorded a quick video showing a few things that may be stopping {COMPANY} from showing up more often when people search for the {SEARCH}.

Mind if I share the video here?
```
Why it worked: knowledge as proof (a real answer naming two real competitors), the prospect's own search term as the subject, one concrete thing already made (notes), a one-word CTA, 47 words. Step 3's right-person line beat step 2.
Change today: the "65%" stat was removed as unsourced in the Oct 8 review [SOP 118 #2]: use a sourced stat or cut the line. The query, the two brands and the notes must be real for every lead [SOP 118 #12]. The video must exist or say "I can record". Step 2's "Open to that?" is a little generic.

### 12.2 Twenty West Media · Food and beverage "post idea" (one idea vs two) · never reuse these facts
EB 599: 3,163 sent, 26 interested = **8.22/1k**. Step 1 A/B: variant A 9/373 = 24.13/1k, variant C 9/382 = 23.56/1k, variant B (two ideas) 1/376 = 2.66/1k (p = 0.011). [data: P3, top-bottom #8]

Subject: `post idea`

Variant A (won):
```
I had an idea for showing ur {HEROPRODUCT} in a {CONSUMERUSEOCCASION} moment.

We could make a post and caption around it using your product images. If you hate it, you can just delete it.

Mind if I put that together?
```
Variant C (won):
```
I had an idea for a short reel showing ur {HEROPRODUCT} in a {CONSUMERUSEOCCASION} moment.

We could put together a draft using product photos or clips you already have, with the hook, text, and caption handled. No need to plan a shoot just to see the idea.

Mind if I make it?
```
Variant B (lost):
```
I had two ideas for showing off ur {HEROPRODUCT}: one around {CONSUMERUSEOCCASION}, and one around {BRANDDIFFERENTIATOR}.

We could make both so you can see them side by side. Tell us whether you'd want them designed for your website, social, or ads. If you hate them, you can just delete them.

Mind if I put together the two versions?
```
Follow-ups (same thread): step 2 (4.87/1k) opened "I only took a quick look, but here's the shot I had in mind for ur {HEROPRODUCT}: {SPECIFICCREATIVESCENE}" and asked "Mind if I send over what I'd make?". Step 3 (1.99/1k) opened "We offer free creative so you can see what our ideas actually look like for your product." and asked "Should I make the first one for ur {HEROPRODUCT}, or is there another product you'd rather try?"
Why it worked: one specific idea about their hero product, built from what they already have, a "you can just delete it" risk reducer, a tiny ask. Two ideas plus a choice of channel made the prospect think, and lost 9 to 1.
Change today: add one strong TWM proof line (RULES) if the client has one. Variant B's colon is fine but its extra decision is not.

### 12.3 Twenty West Media · Food and beverage reusable video (use what they have) · never reuse these facts
EB 609: 7,668 sent, 67 interested = **8.74/1k**. Variant C 14.34/1k vs variant A 5.64/1k (p = 0.046). Step 2: 8.17/1k (the best follow-up rate in the data). Step 3: 6.93/1k. [data: P3, top-bottom #7, scripts]

Subject: `{HEROPRODUCT} question`

Variant C (won):
```
I had an idea for showing ur {HEROPRODUCT} in a {CONSUMERUSEOCCASION} moment.

We could turn usable product photos and clips you already have into a series of social posts, each showing a different reason or occasion to reach for it.

Would you guys find that useful?
```
Variant A (lost):
```
I had an idea for showing ur {HEROPRODUCT} in a {CONSUMERUSEOCCASION} moment.

We could handle turning product ideas like that into social posts, so your team isn't planning, writing and putting together every post themselves.

Would you guys find that useful?
```
Step 2 (same thread):
```
Just a bit more on what I mean: The idea is to show where {HEROPRODUCT} fits into someone's day, like that {CONSUMERUSEOCCASION} moment, and turn it into content your team doesn't have to plan and make themselves.

We could put together three post angles for {HEROPRODUCT}, with a hook, visual idea and caption direction for each, using what we've learned doing social content for 40+ food brands.

Want me to send a quick video showing how that would work?
```
Step 3 (same thread):
```
I wasn't sure if I should reach out to you or {COLLEAGUE}.

Showing {HEROPRODUCT} in a {CONSUMERUSEOCCASION} moment was just a quick idea that came to mind. The plan would give your team a few clear directions to work with, and we could take care of producing the posts if you'd rather take that off their plate too.

Would it be okay if I sent more info to you, or would {COLLEAGUE} be better?
```
Why it worked: "what you already have" beat "we do the work" twice. Step 2 made the free thing concrete (three angles, hook, visual, caption) and added experience proof. Step 3 routed.
Change today: "40+ food brands" must be in TWM's approved facts. Step 2 is about 70 words: fine, at the cap.

### 12.4 Shop Innovator · Home and garden video walkthrough (observation vs question) · never reuse these facts
EB 465 step 1 A/B: variant A 18/2,586 = **6.96/1k** vs variant B 5/2,589 = 1.93/1k (p = 0.0065). Steps 2-3: about 1.07/1k each. [data: P2, scripts]

Subject: `product question`

Variant A (won):
```
I made a short video walking through product pages like {COMPANY}'s, looking at where a $1,000 to $8,000 buyer starts to hesitate before they commit to buying.

It's specific to how high-consideration home and garden goods buyers shop and make their decision. Want me to send it over?
```
Variant B (lost):
```
Do you know what's actually stopping your ecommerce store from converting more of the visitors you're already getting?

I know the frustrating part is the customers are already there. Something between landing and buying is causing hesitation, and it's almost impossible to see from the inside.

We've helped 500 home and garden brands selling high-ticket products go from inconsistent online sales to $100K/mo by fixing exactly that.

Would it help if I sent a short video on what causes buyers to hesitate before checkout?
```
Step 2 (same thread):
```
With $1K+ products, buyers usually do a lot more second-guessing before they checkout than most Shopify stores account for.

I can send over a few things worth checking on {COMPANY}'s store if helpful.
```
Step 3 (same thread):
```
I had a few ideas for how {COMPANY} could reduce hesitation on your product pages before buyers checkout.

Happy to send them over if helpful.
```
Why it worked: the thing was made and named precisely (their price band, their buyer), 40 words, permission CTA. The loser opened with a question, re-explained the problem and leaned on a big vague number.
Change today: the follow-ups end without a question ("if helpful" is a non-action CTA) and add little: write a real step 2 and 3. The embedded-video version of the same campaign (EB 466) did 1.27/1k vs 2.20/1k without the embed. No links or embeds. [scripts]

### 12.5 Shop Innovator · $1K+ products (observation + honest question) · never reuse these facts
EB 422: 15,084 sent, 120 interested = **7.96/1k (4.8x average)**, 6 meetings. Copy from Airtable fields. [data: top-bottom #9]

Subject: `{{product type}} question`
```
Noticed {{CompanyName}} sells {{product type}} online.

One thing we see with $1K+ products is most stores treat them like normal ecommerce, but buyers usually need much more reassurance before committing.

Trust signals, buying guidance and conversion flow tend to matter a lot more.

Are first-time visitors converting well for you?
```
Step 2 opened "With $1K+ products, buyers usually do a lot more second-guessing before they buy than most Shopify stores account for." Step 3: "I had a few ideas for how {{CompanyName}} could reduce hesitation on the {{product type}} pages." + "Want me to?"
Why it worked: a true segment observation, knowledge as proof (an insight only a specialist would state), a question the prospect can honestly answer. High volume, so the 7.96/1k is solid.
Change today: no offer in Email 1 and no client proof line: add both under the 2026 rules. Variables in the engine's format.

### 12.6 Scroll Stop (Global Media Group) · April 2026 "I've got creators" wave · never reuse these facts
EB 428 Beauty: 21,914 sent, 161 interested = **7.35/1k**. With Apps (EB 426, 4.60/1k) and Sports (EB 427, 3.82/1k): 48,829 sent, 277 interested = 5.67/1k, about 9x their 2025 copy (0.65/1k). [data: U1, scripts]

Subject: `{our creators|influencers|creators}`
```
Hi {FIRST_NAME}, I've got a few creators in the beauty space who've been part of campaigns driving 1M+ views, would love to see if they're a good fit to promote {COMPANY}.

Worth a chat?
```
Step 2 (same thread):
```
Asked because we've run creator campaigns for Glaze Hair that generated 33,000+ clicks.

Want me to send over 2 creators we'd look at first for {COMPANY}?
```
Step 3 (same thread):
```
Not sure if this should go to you or someone else.

I reached out a few days ago because we run influencer campaigns with access to 250k+ creators, and usually build them around guaranteed results rather than just paying for posts.

Is this you, or should I reach someone else?
```
Why it worked: a concrete thing they want (creators, in their space), proof baked into the offer, short, topic-word subject. Step 2's "Asked because" brings in a named result and a tiny two-creator ask.
Change today: "Worth a chat?" is archive-generic and close to a call ask: use step 2's ask in Email 1 ("Want me to send over 2 creators...?"). "would love to" is on Alex's ick list. The Glaze Hair figure and "guaranteed results" were archived as unverified in the Oct 8 review: confirm with the client or cut. [SOP 118 client facts] "I reached out a few days ago" is close to a follow-up phrase.

### 12.7 Slogan Social · Exclusive talent roster · never reuse these facts
EB 133: 3,817 sent, 80 interested = **20.96/1k (12.6x average)**, 12 meetings. Same email on a CMO list (EB 177): 3.67/1k. [data: top-bottom #1, U5]

Subject: `{Looking for influencers?|Searching for influencers?|Need influencers?}`
```
Hey {FIRST_NAME},

I noticed {COMPANY} works with influencer talent to highlight the best of {PERSONAL}

We've worked with brands like DoorDash, Meta, and Amazon Prime Video to run influencer campaigns with exclusive talent in the lifestyle, beauty, food, and fashion spaces. Would it be helpful if I sent over some influencers from our exclusive talent roster?
```
Why it worked: references what they already do (P-c), recognisable-name proof the reader instantly trusts, an exclusive thing they can only get here, a permission CTA. The right list mattered as much as the copy (20.96 vs 3.67).
Change today: subject must lose the "?" and stay 1-3 words ("influencers"). 2-step sequence: write a real step 3.

### 12.8 MJJ Brilliant · Wholesale repair overflow · never reuse these facts
EB 603: 4,186 sent, 22 interested = **5.26/1k (3.2x average)**. Variant B 9.89/1k, variant A 7.25/1k. Step 2: 4.39/1k. Step 3: 4.33/1k. The follow-ups held almost the whole rate. [scripts: MJJ]

Subject: `repair capacity`

Variant B:
```
Hey {FIRST_NAME},

Are repairs taking time away from your jeweler's custom work?

As your wholesale repair partner, we can handle those jobs at wholesale pricing with a turnaround time of 10 business days on agreed jobs, so your bench can focus on the work you want to keep in-house.

MJJ Brilliant has been a family-owned and operated jewelry manufacturer since 1982.

You keep your bench focused. We'll handle the overflow.
```
Variant A:
```
Hey {FIRST_NAME},

Have a repair job your usual bench can't take on?

We can handle your overflow repairs at trade pricing with a turnaround time of 10 business days on agreed jobs, so you can keep repairs moving without the expense of hiring another jeweler.

MJJ Brilliant has been a family-owned and operated jewelry manufacturer since 1982.

You focus on your customers. We'll handle the repairs.
```
Step 2 (same thread):
```
Hey {FIRST_NAME},

You wouldn't need to move all your repair work.

Keep the jobs you want in-house and use us as your wholesale repair partner for the categories that take up more of your bench's time.

Which types of repairs would you most like to take off your bench?
```
Step 3 (same thread):
```
Hey {FIRST_NAME},

If a repair comes in that your usual bench can't take on, you can ask us before turning it away.

We'll confirm whether we can handle it along with the cost and turnaround, before you ship anything.
```
Why it worked: the buyer's own word ("bench"), an obvious pain for jewelers, a direct offer with concrete terms, a credibility line, two angles that are two real pains. Step 2 answers the obvious objection then asks a pick question.
Change today: Email 1 is about 55-60 words and ends on a statement (client preference, section 14 question 9). Step 3 has no ask: add a small one ("Send over one job your bench couldn't take on."). "on agreed jobs" is open (question 9).

### 12.9 Lead Flo Marketing · Free leads for local services (inactive client, evidence only) · never reuse these facts
EB 514: 14,024 sent, 60 interested = 4.28/1k. Step 1 variant A **16.76/1k** vs the pay-per-lead variant 1.80/1k (9 variants, p = 0.009). [data: P3, scripts]

Subject: `{SERVICE} question`

Variant A (won):
```
Saw you guys provide {SERVICE} in {CITY}.

Could I send you 5 leads from people already looking for those services?

Yes, it's free because we've already done this for 12 companies in your space and want to show you what it can do.

Interested?
```
Why it worked: a free result (five leads), not a free "audit". The offer is the CTA. It pre-answers "why free?". Short.
Change today: "12 companies" was removed as unsupported [SOP 118 #2]. Lead Flo could only fulfil in Southern California (a targeting limit, not copy). "Interested?" alone is archive-generic. Its step 2 asked for a phone number ("Is {PHONE} the best number to reach you on?"), a hard CTA. Lead Flo went inactive 2026-11-25: its copy is evidence only. [RULES 2026-11-25]

### 12.10 Juiced Digital Agency · Gyms and ChatGPT local search · never reuse these facts
EB 501: 931 sent, 14 interested = **15.04/1k**, SMALL SAMPLE. [data: top-bottom #2]

Subject: `{KEYWORD}`
```
I asked gpt for "{KEYWORD} in {CITY}" and the first 2 places that came up was {COMP}.

Didn't see you guys come up.

I spent a few minutes digging into why those {KEYWORD} were getting recommended and pulled together a few notes for {COMPANY}.

Want me to send them over?
```
It carried a proof P.S. (a personal training studio "stuck around position 12", "about 90 days later they were sitting around position 2"). Step 3: "I wasn't sure if I should send this to you or someone else." + "Mind if I share the video here?"
Why it worked: the same knowledge-as-proof pattern as 12.1 travels to a local market. A specific, believable case story.
Change today: grammar ("the first 2 places that came up were"). Under current rules the proof goes in the body, not a P.S. (question 6). Small sample.

### 12.11 Dulcy · Other marketing agencies (the clean 2026 format) · never reuse these facts
EB 627: variant A 5/2,851 = **1.75/1k**, variant B 4/2,969 = 1.35/1k. About the agency average: a format model, not a top performer. From the Oct 8 review. [SOP 118] [data: All tests]

Subject: `1,000 contacts for {COMPANY}` (today: `prospects for {COMPANY}`)

Variant A:
```
Hey {FIRST_NAME},

Could I build you a free list of 1,000 potential clients based on your ICP?

Names, emails, companies, LinkedIn profiles: the details you need for outbound.

Can I put that together?
```
Step 2 (same thread):
```
Hey {FIRST_NAME},

We build lists and run outbound campaigns for agencies. Our broader outbound work helped Digital Force add $25,000 in monthly recurring revenue in 21 days.

For your free list, we'd agree on the companies and buyer roles you want to reach.

Mind if I send the targeting details we'd need?
```
Step 3 (same thread):
```
Hey {FIRST_NAME},

The 1,000 contacts are a sample of Dulcy's list-building work. We also run outbound campaigns for agencies, if that becomes useful later.

Would a list for your next client push be useful?
```
Why it is here: Dulcy's own offer done cleanly (one free thing, exact contents, one-word CTA, proof scoped correctly in step 2, a pick-up step 3). Why it is not higher: the free list is a saturated offer [SOT §1.11] [creator-learnings], and Email 1 has no proof line (now required). Variant B's delivery line ("We'd agree on the types of companies and people first") is now cut under the 2026-11-25 rule.

### 12.12 Twenty West Media · Local contractors two-minute video (high volume) · never reuse these facts
EB 601 step 1 variant A: 14,842 sent, 56 interested = **3.77/1k** (2.3x average, the largest single variant in the data). [scripts: TWM]

Subject: `quick question`
```
{FIRST_NAME}, noticed you're a {CONTRACTOR} in {CITY}.

How are you making sure homeowners don't treat you like just another {CONTRACTOR} when they're getting a few quotes?

I made a quick 2-minute video breaking down why some contractors become the obvious choice while others get compared against every other estimate.

Mind if I send it over?
```
Why it worked: a sub-segment variable that reads naturally ({CONTRACTOR} = roofer), a pain every contractor knows (competing on price), a real asset, a permission CTA.
Change today: "quick question" is a generic subject that did badly elsewhere (0.21/1k for "Quick question {FIRST_NAME}"): use the topic ("{COMPANY} estimates"). The video must exist.

### 12.13 Human Marketing · Profit Compass (the offer rule example) · never reuse these facts
Wellness and Beauty / Apparel DTC (EB 552, 553): 1.08/1k overall for Human (low). Here for the structure and for Alex's 2026-11-25 offer ruling, not for its numbers. [SOP 119] [RULES 2026-11-25]

Subject: `{PRODUCT} question`
```
{FIRST_NAME} -
How are you making sure the growth you're seeing is actually profitable growth?
ROAS can look great while the actual profit tells a different story, so you can spend more, grow revenue, and still make less money.
Profit Compass shows your true contribution margin and break-even CAC across Shopify, Meta, and Google.
```
then (today's allowed wording): "I can run {COMPANY} through Profit Compass for free. Want me to?" (The original "I ran {COMPANY} through it for free. Mind if I send over what it found?" was false: it can't run before access. Alex's ruling: offer it as something we can do; the access step stays out of the cold email.)

Step 2 (same thread):
```
{FIRST_NAME} -
For context, Softies came to Human Marketing with a product people already loved, but their site, acquisition, and lifecycle marketing weren't working together.
Human Marketing rebuilt the system around profitable growth and helped increase revenue 88% and AOV 22%.
Different situation at {COMPANY}, obviously, but that's the kind of problem we're looking for here.
Worth sending over what I put together?
```
Step 3 (same thread):
```
{FIRST_NAME} -
Wasn't sure if this should go to you or somebody else at {COMPANY}.
Regardless, if the goal is to grow ecommerce revenue without finding out later that the extra sales weren't actually profitable, that's exactly what Human Marketing helps with.
Are you the right person for that, or should I speak to somebody else?
```
Why it is here: step 2 is a model case-study follow-up (named client, two numbers, an honest "different situation" bridge). Step 3 is a model routing step. Email 1 shows the offer rule.
Change today: "{FIRST_NAME} -" works but is unusual. Email 1 is long and opens with a question (data favours an observation first). Step 2's "what I put together" must be real.

### 12.14 Clear River (Dulcy Free Campaigns) · Free retail sell-in sheet · never reuse these facts
EB 212: 547 sent, 6 interested = **10.97/1k** on CPG (3.60/1k on manufacturing, 0/110 on healthcare). SMALL SAMPLE. [data: U6, top-bottom #4]
```
Hi {FIRST_NAME},

Could I put together a free retail sell-in sheet for one of your products, the kind you'd use to pitch to store buyers or distributors here in Michigan? It's at no expense to you.

We're a small creative team in Midland, and for over 60 years we've been helping Michigan food and beverage brands look great in front of retailers.

Since you're in {CITY}, happy to walk you through it over lunch sometime this week, my treat.
```
Why it worked: one concrete, useful free thing for one product, local trust ("here in Michigan", 60 years), a human offer.
Change today: 70+ words, and the lunch line is an in-person meeting ask (question 7). The subject (`{RESTAURANT} - yes or no?`) breaks the punctuation rule (question 3).

---

## 13. Bad examples (and why)

### 13.1 TargetonStar · "free reactivation campaign for your SEO clients"
12,783 sent, 0 interested (and the web-design version 12,037 sent, 0). [data: top-bottom #367, #366]
```
When an SEO client wants more leads, do you usually keep pushing for more traffic or go back after the leads and customers they already paid to acquire?

I can run a reactivation campaign for you guys for free, just so you can see how it works.

Can I send over what that campaign would look like?
```
Why it failed: the prospect has to imagine using the free thing on someone else's business (their clients). A long, abstract opening question. A commodity service. Step 3 even said "In case this sounds crazy or too good to be true lol". Fit beats copy (P9).

### 13.2 Scroll Stop · "Post Q4 reset" (seasonal hook, no offer)
10,446 sent, 0 interested. [data: P8, top-bottom #365]
```
February is when the smartest app teams reset performance before the scale season.

After Q4, most teams are dealing with bloated CPIs, fatigued audiences, and paid media strategies that need a rethink.

We help app publishers drive installs using our creative-plus-performance ReactorEngine that runs alongside paid media, often cutting CPI significantly while improving retention quality.

If you're looking closely at revenue per user this month, a quick conversation could be useful.
```
Why it failed: a season instead of an offer, ad-copy opener about "the smartest app teams", a named "engine" nobody knows, a vague claim ("significantly"), no question, a call ask. Six-word subject: "Why top apps reset in February".

### 13.3 Retail Media Group · Financial planners "Q4 squeeze"
7,695 sent, 0 interested. RMG overall 0.15/1k, the bottom client. [data: top-bottom #364]
```
A lot of planners/lenders are feeling the Q4 squeeze, rising acquisition costs, unclear attribution, and audiences built on broad "interest" guesses.

RMG solves that by targeting based on real-world behaviour, not platform assumptions, so spend goes toward genuinely in-market users.

If you want a quick 1-min breakdown of how this dropped CPA ~85% in a recent campaign, I can send it.
```
Why it failed: "A lot of planners are feeling..." is ad copy about an amorphous third party [SOT §1.3]. An abstract product. A big number with no named customer. No question. Q4 framing.

### 13.4 Scroll Stop · Guarantee P.S. and phrase-swap re-runs
Sports (Data Bank) runs 3 and 4: 5,974 and 5,834 sent, 0 interested each. The family decayed 0.55 → 0.48 → 0 → 0. [data: P7, top-bottom #363, #362]
```
I noticed {COMPANY} works with creators to show the best of {PERSONAL}.

Many sports brands we work with have been using influencer storytelling not just for awareness, but to drive stronger loyalty and keep fans engaged well beyond game day.

Is it worth sending over some ideas for {COMPANY}?

P.S. We always offer a guarantee around ROI and traffic outcomes to our clients. Just ask!
```
Why it failed: "not just for awareness, but..." (the banned "not just" shape), generic "many brands we work with", a guarantee P.S. (0.74/1k pattern), a 5-word pitch subject ("Use influencer marketing for {COMPANY}"), and the same copy re-sent until it hit zero. The variant "test" was a phrase swap.

### 13.5 LuckyDiem · "My colleague Andrew came across {COMPANY}"
5,176 sent, 0 interested. [data: top-bottom #360]
```
My colleague Andrew came across {COMPANY} on LinkedIn and thought it'd be worth reaching out.

Establishments we work with are adding 100+ new customers/month using card-linked offers presented to over 200M cardholders, without touching paid social. (no media spend, no new tech)

No contracts, no tech. Just CPA-based revenue from verified cardholders.

Is this worth exploring for {COMPANY}?
```
Why it failed: a fake-sounding referral opener, a feature dump, big numbers with no named customer, a generic interest CTA, an abstract product. Its sister campaign ran 5 steps, all at 0 (5,824 sent): more steps do not rescue a bad offer.

### 13.6 Twenty West Media before Dulcy · scarcity, bait and switch, guilt
Free Marketing Strategy: 61,717 leads, 434 replies (0.5%), 5 positive. Free audit: 80,896 leads, 300 replies (0.4%), 13 positive. [DND E5, G1]
```
We only put together a handful of custom strategy outlines each week - didn't want to build one unnecessarily.
Yours is ready on our end, just haven't sent it yet.
I haven't heard back, so I'll pause outreach for now.
```
Why it failed: fake scarcity, "yours is ready" when it isn't ("a feeling of lying is not a very good first impression. Even if it was true"), a guilt breakup, and offers nobody wants ("No one wants a marketing strategy", "No one wants a short audit"). [DND B3, B4, A6]

### 13.7 Reach Digital and Aline (third-party swipe, 2023) · self-focus and inconsistent claims
[DND G3, G4]
```
Unlike other Ad agencies that say they're a "strategic partner", We on the other hand are actually a strategic growth partner that gets you results. We create a 25-document Message Matrix compiled of industry research, customer language, and angles to target where competitors aren't playing. ... Any interest in adding $73,000 in the next 90 days?
```
```
We are 3X as powerful as IronClad/DocuSign - at only half the price. Save $50,000 in annual software fees and 40-52 Hours Per Month with our AI platform Got 15 minutes to look into the future?
```
Why they fail: about the sender, a feature dump, ~90 words in one block, the promise repeated as the CTA. Aline used "3X" in some variants and "5X" in another, and $50k / $75k / $100k savings across variants: invented-looking claims. A 15-minute call on a first touch.

### 13.8 Client-written bump and breakup (MJJ, 2026) · never reuse these facts
[DND G5, G6]
```
Hi [First Name] - just bumping this in case repair overflow is becoming a challenge. ... The offer to cover your first repairs free still stands if you'd like to test the process.
```
```
Subject: Should I close the loop on this?
I've reached out a few times ... I know timing isn't always right, so I'll leave it here for now.
```
Why they fail: a lazy bump that adds nothing, a "last email" breakup Alex calls cringey, and a freebie the client later withdrew. Compare MJJ's Dulcy-written follow-ups in 12.8 (4.39 and 4.33/1k).

### 13.9 Old Dulcy: "I dropped my phone in the pool" and an unverified average
Dulcy Florida agencies (EB 506) did 7.62/1k, but on a lunch ask, and its copy has two problems that must not be copied. [data: top-bottom #11]
```
I run a company called Dulcy and help B2B agencies average around 20 new sales opportunities a month with omnichannel outreach, so I figured I'd reach out and introduce myself.
```
```
I dropped my phone in the pool while sending my last email… wasn't sure if you got it.
```
Why they fail today: "average around 20 new sales opportunities a month" is not verified and must not be used [clients/dulcy.md]. "Omnichannel" claims channels that are not working now (only cold email works) [CLAUDE.md]. The pool story is an invented excuse to bump. Never invent a story.

---

## 14. Open questions for Alex

Real conflicts only, deduplicated across every source. Each has the default Scribe uses until Alex answers. When Alex answers, log it in `rules/RULES.md` and `rules/decisions-log.md` and update this section.

1. **Word cap for Email 1.**
   Sources: "Less than 50 words" (Copywriting Playbook 2025-03) [DND A2]; "Short Scripts <50 Words" [SOP 011]; "4 sentences max ... (50-75 words)" and "Under 75 Words" (2025-12, TWM audit 2026-04) [DND A2]; "30-75 words" (2-hour SOP and Dulcy prompt) [2h §1.2]; "< 70 words" / "25-69 words (strict)" (enterprise prompt) [2h §1.2]; Outlook lists "25-30 words or less, 50 max" [SOP 130]. Data: ≤75 words 2.08 vs 1.30/1k [data: U3], but 2026 bands are flat (≤50 2.28, 51-80 2.04) [data: weak evidence].
   **Default:** 30-75 words hard (the engine check), aim for 40-60, and 30-45 on Outlook-heavy lists.

2. **Reading level.**
   Sources: "6th-grade reading level" (Triple Tap) [2h L1012]; "4th grade" (3 Simple Rules) [DND A2]; "below a 3rd-grade reading level" (Template Library, Script Templates) [2h §1.8]; "Can a 10-year-old understand" [2h §3.5].
   **Default:** as simple as clarity allows, about 5th grade or lower, with the buyer's real trade words kept.

3. **Subject format: 1-3 words, no punctuation, vs winning longer subjects.**
   Sources: the engine and the enterprise prompt require 1-3 words and no punctuation [Engine] [2h §1.5]. But Lead Flo's `{RESTAURANT} - yes or no?` (4.37 vs 1.14/1k for their short ones), `event rentals in {CITY}?`, Slogan's `{Looking for influencers?|...}` (20.96/1k), the Oct 8 review's 2-5 word subjects (`1,000 contacts for {COMPANY}`) and Alex's own bank ("{FIRST_NAME}?", "re: [your service]", "Contact more [ICP]?") all break it [data: P5] [SOP 118] [DND D11].
   **Default:** the engine rule (1-3 words, no punctuation, topic word in their language). Never "re:" on Email 1.

4. **Step 4, and step 3's job.**
   Sources: Alex: "4 steps is rare and usually only makes sense if your TAM is small (think under ~10,000 prospects)" [DND A5]; the 2-Hour SOP has steps 1-3 only and does not cover step 4 [2h §1.12]; "Never send more than 3/4 emails" [SOP 011]; "3-5 follow ups MINIMUM" (third-party) [SOT §1.13]. Data: step 4+ only 12,058 sent, 26 interested [data: P1]. Step 3: the 2h SOP says "Add trust, proof, examples, or practical ideas"; Alex's follow-up doc and the Ultimate sequence say right-person / low friction [2h C18] [DND A5].
   **Default:** 3 steps. Step 4 only when the plan says the TAM is under ~10,000 and this client's own step 3 converts at or above step 2. Step 3 = the lowest-friction ask (right person or one small concrete action), carrying one new small reason.

5. **Proof when the client has no approved result.**
   Sources: RULES requires at least 1 strong proof per email [RULES 2026-11-25]. Several current clients have no quantified case study (MJJ, Collabor, Lead Flo's verticals, some Twenty West segments) [SOP 118 client facts]. The best 2026 winners used knowledge as proof with no case study (TWM ChatGPT 16.70/1k, F&B 24.13/1k), and no-proof Email 1s did better at Lead Flo, Twenty West and Scroll Stop [data: weak evidence].
   **Default:** a verified observation that shows real knowledge of their business (knowledge as proof), a real mechanism line, or a client fact like MJJ's "since 1982" counts as the 1 strong proof. Never filler, never borrowed. Scribe flags it in questions_for_alex every time.

6. **Proof in a P.S.**
   Sources: RULES confirms The Marketing Cartel's Email 1 P.S. result lines (ITI "doubled enrollments", hair 15 to 24, rehab 31 to 46) are OK [RULES 2026-11-25] [clients/the-marketing-cartel.md]. The 2-hour SOP's Base 2 puts the case study in the P.S., and Juiced's 15.04/1k email carried a proof P.S. [2h §2.5] [data: top-bottom #2]. But Scribe writes no P.S., and the builder only adds the proven "pound sand" P.S. when no P.S. exists [RULES 2026-11-20] [Alex, chat 2026-11-25].
   **Default:** proof goes in the body. Scribe writes no P.S. For Marketing Cartel, the confirmed result lines are used as a body sentence, unless Alex says to keep them as a P.S. (which would replace the pound-sand line).

7. **Local lunch or in-person offers ("lunch, my treat").**
   Sources: three of the top-12 campaigns used an in-person lunch: Lead Flo luxury real estate 14.95/1k (Email 1 variant 21.18/1k), Clear River 10.97/1k, Dulcy Florida agencies 7.62/1k [data: top-bottom #3, #4, #11]. It is a meeting ask, which RULES allows in the cold sequence only when it is the only logical next step [RULES 2026-11-25]. The code check does not catch "lunch" [Engine].
   **Default:** no lunch or in-person meeting ask, unless the plan explicitly says it is the only logical next step for a local campaign and Alex approved that plan.

8. **Whitepaper headline tests vs the 2-angle rule.**
   Sources: Alex's whitepaper notes (Isaiah Lebron's method): "10 variants of the same script but different whitepaper headlines. Each variant = 250 leads" and "one bad headline can kill performance" [DND A11, D6]. RULES: 2 angles, never trivial word swaps [RULES 2026-11-25]. Data: whitepaper/interview openers 1.26 vs 1.68/1k; Forever Card's 10-headline tests all ended near zero [data: U7, All tests].
   **Default:** 2 headlines only, and they must be 2 different angles (e.g. a trend vs a peer benchmark), not word changes. Whitepaper only when the plan picks it.

9. **MJJ Brilliant: statement close, qualifiers and turnaround.**
   Sources: MJJ's client prefers statement closes ("You keep your bench focused. We'll handle the overflow.") and Alex suggested testing it against a question close [clients/mjj-brilliant.md] [DND I1]; RULES defaults to a one-word-reply ask. MJJ's live copy (5.26/1k, statement close) is the best current-client result per email [scripts: MJJ EB 603]. Qualifiers "on agreed jobs", "on qualifying USMCA production", "depending on the piece and order" sit between truth and fine print under the 2026-11-25 rule. Turnaround: 10 business days in Dulcy's copy and the client file; "7-business-day", "3-5" and "7-10" in client-written copy [DND I2].
   **Default:** on MJJ top-ups keep the approved statement close (preserve what works); new MJJ angles end with a one-word question. Keep "qualifying" (without it the duty claim is false), cut "depending on the piece and order", keep "on agreed jobs" (the client file says repair timing applies to agreed jobs only). Use 10 business days.

10. **The word "free" and money amounts.**
    Sources: Alex's note: replacing "free" with "complimentary" got a lead the very next email [SOT §1.4]; "free", "guarantee", "money" and "$" are listed as spam triggers [SOP 011, 130]. But most winners say "free" ("Yes, it's free", "for free", "on us") and approved proof uses amounts ("$25,000 in monthly recurring revenue", "up to $5,000 in services") [data] [SOP 118].
    **Default:** write "free" or "at no cost" naturally, at most once per email, and write approved amounts as they are. EmailGuard on the final copy decides. Swap to "complimentary" or "at no charge" only when it flags.

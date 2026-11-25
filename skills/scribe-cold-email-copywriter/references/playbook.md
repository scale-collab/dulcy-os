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

Older references here (`copy-framework.md`, `copy-review-contract.md`, `campaign-patterns.md`, `cold-email-offer-patterns.md`) keep their truth and review checks; on meeting asks, variant count, delivery fine print and the P.S., this playbook and the 2026-11-25 rules win.

**What Scribe produces for every campaign:**
- Email 1: exactly 2 variants, one per plan angle. Each has a subject of 1-3 words and a body of 30-75 words. [RULES 2026-11-25] [Engine]
- Follow-ups: step 2 and step 3, in the same thread with no subject. Step 4 only when section 6 says so. Each follow-up is at most 75 words. [Alex, chat 2026-11-25] [Engine]
- A claim list: every fact in the copy, with where it came from in this client's facts (or UNKNOWN).
- Questions for Alex: only things that block the copy (missing proof, unclear offer).
- One or two lines on why this copy and what the 2 angles test.

**What Scribe never writes** (the system adds these later):
- No signature. The builder adds the sign-off, sender name, title and brand. [RULES 2026-11-17] [RULES 2026-11-20]
- No P.S. The builder adds "{P.S.|P.s.|p.s.} or tell me to pound sand if you'd like.." to the copy. That P.S. is a proven winner (section 7). If Scribe writes its own P.S., the builder skips the default one. [RULES 2026-11-20, 2026-11-23] [Alex, chat 2026-11-25]
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

## 1b. The psychology Alex cares about most (Alex, 2026-11-25)

This is the fundamental understanding behind every email. Most of Alex's SOP scripts follow Mitchell Keller's approach, even where his name isn't on them.

1. **Show you looked:** name one real, specific thing they already do.
2. **Show the gap:** point to the one thing that isn't happening yet.
3. **Offer to do a concrete piece of it for free,** so they can see the result before buying anything.
4. **Ask a one-word question.**

Alex's example of the shape:
> "I noticed you're posting blogs on your site consistently, but they're not turned into Reddit posts yet. Could we turn 10 of them into Reddit posts for free, so you can see what it does?"

**Why it works:**
- It proves you looked, so it's not a mass email.
- It's about their thing, not our service.
- The free piece is real and small, which removes the risk.
- The ask takes one word.

This is the same pattern the data shows winning: "one concrete thing built from what they already have" and the "observation opener" (section 3.2).

**What it is not:** generic GPT copy ("We help businesses like yours grow…") is exactly what this replaces. Atlas teaches Scribe these patterns, and the Friday watch adds to them.

## 2. Before writing

### 2.1 Use every input the engine gives

The engine hands Scribe the approved plan, the client's Airtable offer fields, the client file, every script already run for this client with its results, and what this client's prospects said in the last 180 days. [Engine]

- **Plan (approval 1):** move and why (a top-up keeps the winning Email 1 and fixes only truth and evidence [SOP 118 #29]); ICP and persona (write to one person in one kind of company); one pain; one dream outcome (money, time or status); the proof; the structure; the 2 angles (name, what each tests, hypothesis); the objections to answer early. A call ask passes the code check only when the plan's reasoning says it is "the only logical next step". [Engine: allowCall]
- **Offer fields** (Cold Traffic Offer, Front End Offer(s), Back End Offer(s), Outbound Risk Reversal): the exact offer, free or paid, quantity, any guarantee. Nothing else is an offer. [RULES 2026-11-20] [Contract]
- **Client file:** approved proof and its scope, the "never use" list, sender, tone, client preferences.
- **Scripts already run:** keep what won, drop what lost, refresh what is fatigued. "Do not keep rewording a script that already works." [2h L520]
- **What prospects said:** their words are your best copy. "The actual words your leads use on sales calls and in replies are the best copy you will ever write." [SOT §1.3] Interested replies show what they wanted. Objections tell step 2 or 3 what to answer. "Pre-handle" the top one: "You're clearing up what you do before another person has to ask." [2h §1.12]

### 2.2 Write the 4-line definition first

"Do not move on until this is written." ICP: who exactly. Pain: one problem only. Dream outcome: money, time or status. Proof: one client, one source or one specific insight. [2h §2.2] Then one line each: who, why this buyer, the one thing on offer, the reason to believe, what a "yes" means. [copy-framework.md] "Do not write copy while the ICP is still fuzzy." [2h L508] If the plan is fuzzy, ask; don't write around it.

### 2.3 Pick the structure

Pick one. "Do not blend them unless you have a very good reason." [2h L76]

- **Question → Proof → CTA** ("poke the bear"): when the prospect may not see the problem yet. Template: "What are you doing to solve [pain] so [dream outcome] happens? / We do that for [same-world proof] by [simple mechanism]. / Want me to send over [resource]?" [2h §2.4] The question must allow an honest "we're fine". [copy-framework.md] Data: a question as the first line did worse (1.76 vs 2.43/1k in 2026; 1.93 vs 6.96/1k in Shop Innovator's A/B) [data: P2], so open with an observation, then ask: "Noticed {COMPANY} sells [product type] online. ... Are first-time visitors converting well for you?" (7.96/1k on 15,084 sent). [data: top-bottom #9]
- **Offer → Proof → CTA:** when the outcome is already easy to want. "Often the proof is baked directly into the offer itself." Template: "If I could help [company] get [dream outcome], that usually leads to [benefit]. / That's the same problem we've worked on for [proof]. / Would you be open to [small ask]?" [2h §2.5] Most 2026 winners are this shape. [DND C]
- **The investment piece** (Alex's 4 parts): "1. Investment (I noticed) 2. Knowledge Statement / PTB 3. Call out the pain 4. Easy CTA to solve the problem". The investment piece "shows they are already aware of the problem or already trying to solve it. Examples: using blogs, running ads, investing in SEO, posting regularly, updating their website". [DND D1] Attach the offer to a bet they already make. [DND C] Use it whenever a real, checkable signal exists.
- **The observation opener:** the strongest 2026 opener. Say what you noticed or made for them. "Keep the question for the CTA." [data: P2] It must be checkable: "Separate what was observed from what it might suggest; ads, hiring or a website gap do not prove poor performance." [SOT §1.9] A reliable sub-segment ("plumbing contractor", not "contractor") is an observation too. "Never force AI to come up with a variable." [SOT §1.9]

| Situation | Lead with [2h §5.1] [SOP 089-094] |
|---|---|
| Prospect may not see the problem | An observation, then a question |
| Outcome already wanted, offer is clear | The offer |
| A real signal (ads, blog, creators, a product, a search term) | The observation, then the one thing built from it |
| New category | A real third-party fact that validates the category [2h §2.8] |
| No case study yet | Knowledge as proof [2h §2.7] |
| Commodity service | "Find the one thing that is actually different ... and anchor your entire cold email copy to that." [2h §1.10] |
| Weak product | "Free and specific will always outperform vague and paid." [2h §1.10] |

Market sophistication sets how much you explain: "If you talk to a Level 4 market like it's Level 1, you sound naive. If you talk to a Level 1 market like it's Level 4, you sound confusing and try-hard." [DND A8]

### 2.4 Test the offer before writing a word

"If you answered "no" to ANY of these, your offer is garbage": 1. Is the outcome completely obvious? 2. Is the risk clearly on you, not them? 3. Can they calculate ROI in 10 seconds? 4. Is the promise quantifiable? 5. Does replying feel easier than ignoring? [2h §3.6] If it fails and the plan can't fix it, say so in questions for Alex. Copy cannot rescue it: copy iteration "has the lowest likelihood of a meaningful performance change." [DND A12] [data: P9]

---

## 3. Email 1 rules

### 3.1 Hard rules (bounced if any fails)

1. Exactly 2 variants, one per plan angle, same direction. They test the angle, never word swaps. [RULES 2026-11-25] [Engine]
2. 30-75 words in the body (a {VARIABLE} counts as one word). [Engine] [2h §1.2]
3. Subject 1-3 words, no punctuation (apostrophes and {VARIABLES} allowed). [Engine]
4. At least 1 strong proof from this client's facts. More only if just as strong. [RULES 2026-11-25]
5. One CTA, low friction, answerable in one word. [RULES 2026-11-25] [2h L1013]
6. No call ask unless the plan says it is the only logical next step. Bounced phrases: book a call / time / meeting, hop on a call, 15/20/30 minutes, calendar link, schedule a call or meeting, jump on a call, quick call, grab some time. [RULES 2026-11-25] [Engine]
7. No links, images or attachments; no "http", "www", ".com" or ".io" in the body. [Engine] [data: links 0.54 vs 1.77/1k]
8. No semicolons. No em or en dashes: write " - ". [Engine] [2h §1.8]
9. Banned: "this isn't just", "it's not just", "following up", "just checking in", "circling back", "bumping this", "hope this finds you". [Engine] [2h §1.8]
10. Variables: {FIRST_NAME}, {COMPANY}, plus **at most 2 custom per-company variables Scribe defines itself** (`custom_variables`: name, what to find, fallback). The engine enriches the list with them before QA, so use one when it makes the opener concrete ({KEYWORD}, {HERO_PRODUCT}, the strongest 2026 openers). Only facts a web lookup finds reliably; the fallback must read right in the sentence ("your products"). On a rewrite the list is already enriched: keep the same variables. Never spin a variable. [RULES 2026-11-17, 2026-11-21, 2026-11-24] [Engine]
11. No spintax, no signature, no P.S. [RULES 2026-11-17] [Alex, chat 2026-11-25]
12. Never invent results, numbers, customers, prices, guarantees, assets or prospect signals. Never use another client's facts. List every claim with its source. [CLAUDE.md #3] [Contract]
13. "I made / put together / pulled / recorded / ran" only when that exact thing exists. Otherwise offer it: "I can put together...". [SOP 118 #8-12] The TWM and Shop Innovator winners say "I pulled together some notes" and "I made a short video" only because those were real.
14. No fake relationship, referral, research project, scarcity or urgency. No "Re:" on Email 1. [DND B3] [copy-framework.md]

### 3.2 Proven patterns, with the numbers

- **One concrete thing, built from what they already have** (3 significant A/B wins). "turn usable product photos and clips you already have into a series of social posts" 14.3/1k vs "we handle turning product ideas into posts" 5.6/1k (TWM EB 609, and again 3 vs 0 on the re-run). One idea 24.1/1k vs two ideas 2.7/1k (EB 599). "Could I send you 5 leads from people already looking for those services?" 16.8 vs a pay-per-lead pitch 1.8/1k (Lead Flo EB 514). Offer types in 2026: free notes / review / ideas 3.17/1k, creator shortlist 2.31, free work / trial / demo 1.29, research or interview request 0.87. [data: P3] Name one specific thing made from their product, search term, footage or store. One, not two.
- **Observation or "thing I made" opener, not a question.** 2.43 vs 1.76/1k in 2026 (91 vs 50 campaigns). Dulcy 2.40 vs 0.92, Twenty West 3.40 vs 2.21, Shop Innovator 5.53 vs 2.15. [data: P2]
- **Reference what they already do.** "{COMPANY} works with creators to show the best of {PERSONAL}" 5/2,969 vs "is all about staying true to {PERSONAL}" 0/3,023, twice. [data: P6]
- **Short.** Step 1 ≤75 words 2.08 vs longer 1.30/1k. Scroll Stop's 47-word April opener: about 9x their 2025 long copy (5.67 vs 0.65/1k). [data: U3, U1] Most top-10 Email 1s are 41-52 words. Aim for 40-60. Don't pad a clear 35-word email.
- **No hard guarantees.** Guarantee-led copy 0.88 vs 1.72/1k; Adverio "or we work for free" 0.33 and 0.67; Digital Neighbor "or we send you $1,500" 0.70, while their plain "you guys handle {CASE}, right?" did 2.80. [data: U4] "You don't need a wild guarantee. You need a believable one." [DND A6]
- **Concrete, visual, local offers beat abstract ones.** Top: Slogan Social 6.59/1k (creator roster), Shop Innovator 3.94 (video of their product page), MJJ 3.65 (repair overflow), Lead Flo 3.19 (free local leads), Twenty West 2.63 (AI-search notes, post ideas). Bottom: RMG 0.15 (geo-fenced ad targeting), Unleashed 0.22, LuckyDiem 0.29, Alpha Software 0.30, TargetonStar 0.34. [data: P9] If you can't picture what they receive, neither can they.
- **The free thing is for them, not for their clients.** "a reactivation campaign for your SEO clients" 0/12,783. "a free list of ~1,000 real active homebuyers" 0/4,806. [data: top-bottom update]
- **No seasonal hook without an offer.** "Post Q4 reset" 0/10,446, "Pre-Season Advantage for 2026" 0/4,767, "MWC Barcelona" 0/2,813. [data: P8]
- **One problem, one offer, one proof, one CTA.** [2h §1.3] "You can only sell a single solution in a cold email." [2h §2.4]
- **The buyer's words, specific.** "Use the words your ICP actually uses: patients, leads, bookings, consults, pipeline". [DND A7] MJJ's "bench", Shop Innovator's "$1,000 to $8,000 buyer". "Sharp, specific pain points only the right person recognizes get the reply." [SOT §1.3]

### 3.3 The shape (2026 house style) [DND C] [data: top-bottom]

```
{FIRST_NAME},                                 (or "Hey {FIRST_NAME}," or no greeting)
[Observation, or the thing made for them]
[What exactly they get, in plain words]
[One strong proof line, this client's facts]  (can sit inside the line above)
[One-word question CTA]
```
3-5 short lines with a blank line between. Generic-inbox campaigns lose the greeting automatically; a missing name is never guessed. [RULES 2026-11-20] Several winners have no greeting. Tone fits the market ("ur" worked for TWM's food brands; doctors get "Dr. [Last Name]"). [SOT §1.3]

Outlook-heavy lists: "1 line MAX." "Ideally 25-30 words or less, 50 max." "as far from a "pitch" as possible." [SOP 130] With the 30-word minimum, write 30-45 words.

---

## 4. Offers and CTAs

Scribe owns offers now (Forge folded in). Offer only what the client can genuinely do. [RULES 2026-11-24, 2026-11-25]

### 4.1 Offer what we can do, without delivery fine print [RULES 2026-11-25]

- Keep the copy about whether they want it. Delivery steps (access, logins, setup, a targeting call) go in the reply or the call.
- Alex's example: "I can run {COMPANY} through Profit Compass for free" is fine, even though it needs Shopify and ads access.
- State a condition only when it changes the deal: they pay something, or paid vs free. "Your school covers the advertising spend" stays (the prospect pays). [SOP 118 #20]
- Never lie: no invented results, numbers, customers, guarantees or assets.
- Don't get stuck on small nuances.

This replaces older lines like "Publishing it is separate.", "We'd first check that we cover your delivery area", "with no call or purchase required", "Your team would review the copy before anything changes". [DND H2]

**Qualifier test:** delete it. If the sentence becomes false (promises what the client can't do, or hides a cost), keep it ("0% duty on *qualifying* USMCA production"). If it is only less complete, cut it ("We'd agree on the types of companies and people first").

Still true from the contract: "Can I send X?" commits to sending X on a yes. Never turn an emailed asset into a mandatory call or purchase. If the asset can only be made after access or a call (Profit Compass), write "I can run / build ... for you. Want me to?", not "Want me to send it over?" [Contract] [SOP 119]

### 4.2 Offer types

| Type | When it fits | Evidence |
|---|---|---|
| **Free work / preview** (service lead magnet): a post idea, AI-search notes, two ads, a page draft, 5 leads, a sell-in sheet | Default for most service clients. "Service Lead Magnet (Best Performing in 2026)" [SOT §1.11] | Notes / ideas 3.17/1k; post idea 24.1; 5 leads 16.8 [data: P3] |
| **Talent / shortlist / roster** | The client holds access the buyer wants | Slogan 20.96/1k; Scroll Stop April 5.67 [data: top-bottom #1, U1] |
| **Video / Loom** | Tied to a real observation. "It works when you call something out, then offer the loom as the breakdown/fix" [DND A6] | Shop Innovator 6.96/1k; TWM contractors 3.77 on 14,842 sent |
| **Direct offer** | "When the prospect already understands the problem" / "Direct offer needs a direct outcome." [SOP 094] [DND D4] | MJJ repairs 5.26/1k |
| **Case study** | A clear matching result exists [SOP 089] | Best as step 2 (Human's Softies; Scroll Stop "Asked because") |
| **Lead magnet** (digital) | Only if "something you'd normally pay for" and "obviously valuable in 2 seconds" [DND A6] | Weaker than a service lead magnet [SOT §1.11] |
| **Whitepaper / interview** | Demand-gen markets, narrow niches, no proof yet; every named company must be real [DND D6] | 1.26 vs 1.68/1k overall; KNR 4.16 but TwoTreesPPC Software 0.26; Dulcy's Amazon whitepaper 8,000 contacts, 0 bookings [data: U7] [DND E4] |
| **Risk reversal** | Only the client's exact approved terms [SOP 090] | 0.88 vs 1.72/1k [data: U4] |
| **Free audit / strategy / consultation** | Avoid. "No one wants a marketing strategy", "No one wants a short audit" [DND A6]; tier D: "just give them the insight/value instead" [SOT §2] | TWM pre-Dulcy 0.4-0.5% replies [DND E5] |

Rules for the free thing: "relevance > free stuff" / "Your free thing should preview the paid result" [DND A6]. Specific and fast ("2-3 fixes", "10-minute Loom"), never "full audit". [DND A6] "Help me improve what's working" beats a rebuild. [SOT §1.10] Name the burden removed ("No need to plan a shoot just to see the idea.", 23.56/1k). Bound it: one product, two ads, one SKU, five leads. [SOP 118 #21] Careful with website offers: "some people take their website very personal". [DND A6]

### 4.3 Offer decay

Alex: free-leads offers used to get 20-25%+ positive reply rates; now about 10%. [creator-learnings] The free list "is now more saturated ... less effective but still outperforms a naked service pitch." [SOT §1.11] Dulcy's 2026 free-list Email 1s sit at 1.06-1.75/1k, around average. [data: EB 626, 627] A saturated offer needs a fresher frame (narrower segment, a specific use) or a different free thing. Flag it in the notes; Atlas picks the move.

### 4.4 CTAs

Default: low friction, one-word answer. A call only when it is the only logical next step. [RULES 2026-11-25]
- "If your CTA makes them think, you lose. Your CTA should be: low resistance / one-step / no links / easy to reply to with one word" [DND A3]
- ""Just let me know" or none action taking CTAs statistically lead to worse reply rates then asking for the user to take an action" [DND A3]
- "15-minute call is a very high ask for a low consciousness prospect" / "The multiple choice answer is phased out" [DND A3]
- "Make the CTA a non-decision. "Want me to set it up? Takes 30 seconds and it's free."" [SOT §1.6]
- CTA-type data is weak and mixed (call ask 2.26/1k, permission 1.61, interest check 1.25), but both significant A/B tests that changed the CTA favoured permission-to-send. [data: weak evidence]

**Work:** "Want me to send them over?" (16.70/1k) · "Mind if I put that together?" (24.13) · "Mind if I make it?" (23.56) · "Would you guys find that useful?" (14.34) · "Could I send you 5 leads from people already looking for those services?" (16.76) · "Would it be helpful if I sent over some influencers from our exclusive talent roster?" (20.96) · "Mind if I show you an example?" / "Want me to share the breakdown?" [DND A3] · "Can I send you a few resumes to look at?" [SOT §4.14] · Softest, for later steps: "Is [result] a priority right now?", "Would you be the right person to speak to?", "Is this the best place to send it?" [DND A3]

**Too generic or too big:** stand-alone "Interested?" / "Worth a chat?" (Archive "Too Generic") [2h §1.4] · "Would you be interested in discussing?" [SOP 011] · "Is this worth exploring for {COMPANY}?" (0/5,176) · "Do you have 30 minutes this week?" · a 15-minute call plus a calendar link [DND B8] · "If you're open to it" / "If it helps" / "I'd love to" / "Just let me know" [DND B7] · a statement instead of a question ("a quick conversation could be useful", 0/10,446) · the promise as the CTA ("Any interest in adding $73,000 in the next 90 days?") [DND G3]

---

## 5. Subject lines

Hard rule: 1-3 words, no punctuation. Thread replies have no subject. [Engine]

Alex: "The best subject lines look like an internal email. Not "marketing." Not clever. Not try-hard." / "Make it feel like a coworker emailing another coworker. Short. Normal. Easy to understand in half a second." / "If your subject line could realistically be sent inside a company Slack/email thread, you're doing it right." / "We also don't track open rates, so there's no reason to obsess over this." / "saying like quick idea for {company} lead flow is just saying this is a marketing email" → "our homepage | our lead flow | quick question" [DND A4]

Data [data: P5]:
- 1-2 words 2.24 vs 3+ words 1.14/1k.
- Their topic word wins: `{KEYWORD}` 6.58/1k (8 campaigns, 42,241 sent); `{HEROPRODUCT} question` 8.74; `post idea` 8.22; `product question`; `repair capacity`.
- Scroll Stop: `{our creators|influencers|creators}` 2.65 vs `Use influencer marketing for {COMPANY}` 0.71/1k.
- Pitch subjects fail: "Would this make sense for {COMPANY}?" 0.17, "Quick question {FIRST_NAME}" 0.21, "Why top apps reset in February" 0.
- What fails is the pitch, not length: Lead Flo's longer local subjects did better for them (4.37 vs 1.14). Those break the punctuation rule (question 3).

How: the email's topic in their words (`{COMPANY} rentals`, `extra repair capacity`, `two ads`). Lowercase is fine. One subject per variant, fitted to its angle; if both angles share a topic, use the same subject so it is not a second test variable. Never "Re:" or "Fwd:" on Email 1. Send it to yourself and look "2-3 hours later when I am super busy". [DND A4]

---

## 6. Follow-ups

Steps 2-3 bring in 51.9% of all interested replies: step 1 2.06/1k (46.7%), step 2 1.31 (27.6%), step 3 1.23 (24.3%), step 4+ 2.16 on only 12,058 sends (1.4%). Each follow-up converts at about 60% of Email 1. [data: P1] "I've had plenty of campaigns where Step 2 and Step 3 generated the majority of positive replies." [DND A5] Treat them as seriously as Email 1.

### 6.1 Every follow-up

- Same offer. "Do not invent a new offer in the follow-ups." [2h §1.12]
- Adds something new: "1. restate the core idea (without copy/pasting the same email) 2. make the "yes" easier each step 3. *Add more context through social proof" / "each step gets easier to say yes to, and adds something new." [DND A5]
- Thread reply, no subject. At most 75 words; aim 30-60. [Engine] [Alex, chat 2026-11-25]
- No bump: "it looks thirsty, and it adds no value." [DND A5] Code-banned phrases apply; "As I mentioned in my first email" counts too. [2h §4.10.13]
- No breakup: "Just don't do the cringey "last email" thing." [DND A5]
- No greeting needed; starting with the new thing reads natural ("Just a bit more on what I mean:"). "Hey {FIRST_NAME}," is fine too.
- Rotate the CTA: "Open to hearing more? / Want to see how it works? / Is this a priority right now? / Should I send it here? / Are you the right person for this?" [DND A5]
- Answer the plan's top objection in one line ("You wouldn't need to move all your repair work.", MJJ step 2, 4.39/1k).

### 6.2 Step 2: clarify and make it easier to believe

"Clarify the first email and make it easier to believe." [2h §1.12] "same idea, quicker, easier yes. You can: add context / offer the lead magnet again / offer a Loom instead of a call / give 2-3 specific ideas." [DND A5] Or narrow to one item with a pick question: "Which service would you choose?" / "Is there a product page you'd want us to start with?" [DND C]
- Best step 2 in the data (TWM EB 609, 8.17/1k): the idea explained in detail, what they'd get (three post angles with hook, visual and caption), one line of experience, "Want me to send a quick video showing how that would work?" [scripts]
- "Asked because we've run creator campaigns for [client] that generated [result]." + a two-item ask (Scroll Stop April). The "reason I ask" opener brings in proof naturally. [data: U1] [DND F14]
- The strongest case study often lands best here (Human's Softies 88% revenue, 22% AOV). [SOP 119]
- When the offer sounds too good to be true: "I realize this is probably crazy ... Let me explain better." then show how it works. In that third-party campaign ~50%+ of interested replies became calls: "A scammer would never go to this level of effort." [2h §1.12]

### 6.3 Step 3: the lowest friction

"Step 3 is where you go low friction. Three approaches that work a lot: "Are you the right person?" / "Should this go to you or {COLLEAGUE}?" / Reiterating the offer again" [DND A5] Data: the right-person step 3 often beats step 2 (TWM 4.89 vs 3.38; 5.56 vs 1.78; 3.67 vs 3.36/1k). [data: top-bottom #6, #10, #14] Or one small concrete action ("Send over one job your bench couldn't take on.") or a sweetener. [DND C] {COLLEAGUE} only when the list has it, with a fallback ("someone else on your team").

### 6.4 Step 4: only on evidence

Default 3 steps. "Most sequences should be 2-3 steps." / "4 steps is rare and usually only makes sense if your TAM is small (think under ~10,000 prospects)" [DND A5] Lists are sized on 3 steps. [RULES 2026-11-23] LuckyDiem's 5 steps got 0 on every step (5,824 sent). [data: top-bottom #361] Write step 4 only when the plan says TAM is under ~10,000 and this client's step 3 still converts at or above step 2: the same offer from a new side, no "last email". (Question 4.)

---

## 7. Style and banned phrases

**Reading level and words.** As simple as clarity allows, about 5th grade or lower (question 2). "Can a 10-year-old understand what you're selling? Would you actually say this to someone in person?" [2h §3.5] Keep real trade words (bench, MOQ, SKU, CPI): "The exception is when niche-specific language increases trust ... Do not use insider language merely to sound clever." [SOT §1.3] Concrete nouns and verbs; no abstract benefits. Read it aloud: "like you're talking to someone at a bar." [2h §3.7]

**Banned by code:** see 3.1 rule 9. [Engine]

**Banned by Alex:**
- "I'd love to" ("prospect get the "ick" from it"), "If you're open to it" ("asking them to shoo you away"), "If it helps", "Just let me know". [DND B7]
- Fake scarcity, "yours is ready", guilt breakups. [DND B3, B4]
- Vague marketer words: "Noticed a few areas", "In your space", "Cleaner flow, stronger positioning, clearer CTA". [DND B6]
- Generic "we help" lines: "We specialize in identifying and fixing those issues to drive consistent lead growth" ("and so do 100k agencies"), "We help businesses grow", "If we could help generate 1-5 clients…", "We help X get Y in Z time". [DND B1] [2h §1.8]
- A company bio as an offer: "That's not an offer. That's a company bio." [SOT §1.4]
- Hype and "euphoric words" (10X, viral, game-changer). [2h §1.8] Naming the framework ("Triple Tap"). [2h §1.8]
- "Hope you're doing well" or any filler opener [SOP 011]; emojis and decorative punctuation [SOP 134, 118 #25]; thanks or "great question" [Contract].

**Punctuation and format.** " - " for dashes, no semicolons [Engine]. Plain text, no bold or bullets in Email 1 (a short list can work in a follow-up). One idea per line, blank line between.

**Spam words.** "I replaced the word 'free' with complimentary in the script. The very next email generated a lead. Spam words are no joke." [SOT §1.4] Often flagged: free, guarantee, money, urgent, act now, "$". [SOP 011, 130] No full list exists; EmailGuard checks the final copy. [RULES 2026-11-17] Write naturally, don't stack money words, swap a flagged word (question 10).

**Variables.** A variable must read right in its sentence ("CONTRACTOR must be a grammatical singular trade noun, e.g. roofer"). [SOP 118 #16] A signal used to pick the list need not appear in the email. [SOP 118 #15] Sub-segment variables help: "Nick has never run a campaign where adding a specific sub-segment variable did not improve performance." [SOT §1.9]

**The P.S. (system-added).** The builder adds "{P.S.|P.s.|p.s.} or tell me to pound sand if you'd like.." unless a P.S. exists. [RULES 2026-11-20] It is the opt-out (no unsubscribe link). [RULES 2026-11-23] It travels with winners: 2.37/1k vs no P.S. 0.88 vs guarantee P.S. 0.74; Scroll Stop 2.48 vs 0.75; recovered campaigns 3.20 vs 1.24 (Medium, confounded). [data: P4, U2] So Scribe writes no P.S. and never a guarantee P.S. (question 6).

---

## 8. Proof

**The rule.** At least 1 strong proof per email, from this client's facts. More only if just as strong. No filler. [RULES 2026-11-25] "This is the single heaviest lifting element". [SOT §1.5] "Numbers Beat Adjectives ... Specifics = trust." [DND A7] "Not "we're experts" that means nothing." [DND A2]

**Three types** [2h §1.9]:
1. **Social proof, "I did the thing":** a result for a similar company. Stack similarity: ""We helped a SaaS company" is weak. "We helped a 15-person B2B SaaS selling to mid-market HR teams" is strong."
2. **Third-party authority, "They found it":** a real, sourced fact from a source this reader knows. "Use this when you don't yet have your own social proof."
3. **Knowledge as proof, "I know this about you specifically":** "That's not a pitch, that's a demonstration of capability." [2h §2.7] The 2026 winners' main proof (the real ChatGPT answer, their hero product in a use moment).

Also strong: recognisable names ("everyone knows Apple, so the proof is much more effective" [SOT §1.5]; Slogan's DoorDash, Meta, Amazon Prime Video at 20.96/1k); a one-line mechanism ("Every bold claim needs a reason it is possible" [SOT §1.3]); a company fact the buyer cares about ("family-owned ... since 1982", kept secondary to the benefit [DND B, MJJ]).

**Match it to the dream outcome and its scope.** "Irrelevant proof kills trust." [2h §1.9] Dulcy's Digital Force "$25,000 MRR added in 21 days" proves broader outbound work, "not the free list or a guaranteed result". [SOP 118 #1] Historical speed is not a promise (TONAL 2021). [SOP 118 #4] A huge vague number can lower trust: "We've helped 500 home and garden brands" sat in the losing Shop Innovator variant. "A bigger promise can actually lower trust." [SOT §1.3]

**Where it goes.** Email 1: one line, or baked into the offer ("creators who've been part of campaigns driving 1M+ views"). Step 2: the strongest case study. Never a guarantee as proof. Data: Email 1 proof helped Dulcy (3.10 vs 1.02/1k) and Shop Innovator (4.20 vs 1.96) but not Lead Flo, Twenty West or Scroll Stop, whose winners used knowledge as proof. [data: weak evidence]

**When there is none.**
1. Never invent or borrow (no Anivvo 10M emails, no "300+ clients", no Planta, no 31% apparel example). [RULES 2026-11-17] [SOT §0] [2h §1.9]
2. Use knowledge as proof, a real third-party fact, or a real mechanism line.
3. Flag it in questions_for_alex. [Engine] (Question 5.)
4. Unverified client claims stay out: Dulcy's "average 20+ sales opportunities per month" is not verified. [clients/dulcy.md] If the client later substantiates a claim, keep the original line. [SOP 118 #3]

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
- **Pain vs desired outcome:** a roofer "isn't getting any inbound calls" vs one that "already gets calls, but wants to stop competing on price". [SOT §4.23]
- **Offer-led vs context-led** (the 2026 house test): "I'd like to offer {COMPANY} five free rental inquiries." vs "Have a repair job your usual bench can't take on?" then the same offer. [DND C]
- **What they already have vs what we do for them:** 14.3 vs 5.6/1k (TWM EB 609). **One idea vs two:** 24.1 vs 2.7 (EB 599). **Observation + thing made vs question + claim:** 6.96 vs 1.93 (Shop Innovator EB 465). **Free sample vs service pitch:** 16.8 vs 1.8 (Lead Flo EB 514). [data: P2, P3]
- **Two USPs:** MJJ "No MOQs made-to-order" vs "0% duty production". **Two pains for one buyer:** MJJ "Are repairs taking time away from your jeweler's custom work?" 9.89/1k vs "Have a repair job your usual bench can't take on?" 7.25/1k. [scripts: MJJ]
- **Two buying situations for one offer:** "For a company with reps ... better accounts to approach. For a founder without a sales team ... finding demand before they hire." [2h §2.14] Two different audiences belong in two campaigns.

Bad angle pairs:
- Phrase swaps: Scroll Stop "works with creators to show the best of" vs "is all about staying true to", re-run 15+ times; Lead Flo "Saw you guys provide" vs "Noticed you guys provide" (0 vs 0); RMG two wordings of "a quick discussion" (0 vs 0); a greeting test; three wordings of "a quick demo". [data: All tests] [SOP 015]
- Changing audience, offer and proof at once: that is two campaigns, not a test. [SOT §1.16]
- Nine or ten variants of everything (Lead Flo's 9-test validation, Forever Card's 10 whitepaper headlines). [2h C5] [data: EB 154, 167, 176]

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
3. Respect truthful client direction on style (MJJ's statement closes; post-call direction "overrides old onboarding" [SOP 118 #24]). A client's call-first wish passes only if the plan says the call is the only logical next step. Flag it.
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

What to do: a second pass on the same TAM gets a new angle and refreshed copy ("hit them every 30-60 days and repeat with new messaging, new offers, and new copy" [SOT §5.3]; "Pull new list / Change angle / Refresh copy / Run again" [2h §5.6]). Lookalikes of interested leads get the message that earned interest. [2h §5.5]

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

Tick every line. Each is a real critique Alex made. [DND A2, B] [2h §3.1, §3.5] [SOP 118]
- [ ] About them, not us. Names a specific issue or thing, not a category. No "we specialize in" / "we help businesses grow".
- [ ] No fake scarcity, "yours is ready" or bait and switch. No "If you're open to it", "If it helps", "I'd love to", "Just let me know".
- [ ] No call, calendar link or "do you have 30 minutes". No links, images or formatting. 30-75 words.
- [ ] No vague marketer language, no irrelevant personalisation (college, hometown).
- [ ] One problem, one offer, one proof, one CTA, in a clear Question → Proof → CTA or Offer → Proof → CTA.
- [ ] Dream outcome is money, time or status, in plain language, for this audience. Proof reinforces it and means something to this reader.
- [ ] Written for this market and this person. A 10-year-old gets it. You would say it in person.
- [ ] Every claim is in this client's facts; every "I made / I pulled" is real; no guessed problem stated as fact (guesses become questions). [SOP 015]
- [ ] Deal-changing conditions stated, delivery steps not. Variables read naturally, with fallbacks, never spun.
- [ ] Follow-ups: same offer, something new each, no bump, no breakup, no subject.
- [ ] The 2 variants test the real difference the plan named. No signature, P.S. or spintax.
- [ ] Replying feels easier than ignoring. [2h §3.6]

### 11.3 Pre-launch (Atlas runs it)
Preview 10-15 random leads ("Nothing looks broken, awkward, or "obviously automated""), check every referenced asset exists, EmailGuard on the spintaxed copy ("1-2 flags can be fine"), and send it to yourself "like I'm busy". [DND A10] [SOP 011] [RULES 2026-11-17]

---

## 12. Best examples (full sequences, verbatim)

For shape and voice only. **Every name, number, result and claim belongs to that client. Never reuse these facts.** Spintax, signatures and the P.S. were added by the system and are left out here. "Today" says what to change under current rules.

### 12.1 Twenty West Media · ChatGPT shopping questions · never reuse these facts
EB 597: 6,453 sent, **9.45/1k** (5.7x average), 7 meetings. Step 1 A 16.70/1k (2,336 sent). Step 2 3.38/1k. Step 3 4.89/1k. [data: top-bottom #6, scripts]
Subject: `{KEYWORD}`
```
I asked ChatGPT for "{SEARCH}" and the first 2 brands that came up were {COMP}.

Didn't see you guys come up.

I spent a few minutes digging into why those {KEYWORD} were getting recommended and pulled together some notes for {COMPANY}.

Want me to send them over?
```
Step 2:
```
Just a bit more context on what I was referring to.

According to Clutch, 65% of consumers now use AI when researching products and deciding what to buy.

So when someone asks ChatGPT something like "{SEARCH}", the brands it surfaces, like {COMP}, are often being considered before they look anywhere else.

I can show you how we'd get {COMPANY} in front of more of those searches.

Open to that?
```
Step 3:
```
I wasn't sure if I should send this to you or someone else.

I recorded a quick video showing a few things that may be stopping {COMPANY} from showing up more often when people search for the {SEARCH}.

Mind if I share the video here?
```
Why: knowledge as proof (a real answer naming two real competitors), their search term as the subject, one thing already made, a one-word CTA, 47 words. The right-person step 3 beat step 2.
Today: the "65%" stat was cut as unsourced [SOP 118 #2]. Query, brands, notes and video must be real per lead [SOP 118 #12]; otherwise "I can record...".

### 12.2 Twenty West Media · Food and beverage "post idea" · never reuse these facts
EB 599: **8.22/1k**. Step 1: variant A 24.13/1k, variant C 23.56/1k, two-ideas variant B 2.66/1k (p = 0.011). [data: P3, top-bottom #8]
Subject: `post idea`
Variant A:
```
I had an idea for showing ur {HEROPRODUCT} in a {CONSUMERUSEOCCASION} moment.

We could make a post and caption around it using your product images. If you hate it, you can just delete it.

Mind if I put that together?
```
Variant C:
```
I had an idea for a short reel showing ur {HEROPRODUCT} in a {CONSUMERUSEOCCASION} moment.

We could put together a draft using product photos or clips you already have, with the hook, text, and caption handled. No need to plan a shoot just to see the idea.

Mind if I make it?
```
Loser B opened "I had two ideas for showing off ur {HEROPRODUCT}: one around {CONSUMERUSEOCCASION}, and one around {BRANDDIFFERENTIATOR}." and asked them to pick website, social or ads.
Steps 2-3 (4.87 and 1.99/1k) showed the exact shot in mind, then offered to "make the first one".
Why: one specific idea about their hero product, from what they already have, a "just delete it" risk reducer, a tiny ask. Two ideas plus a choice made them think, and lost 9 to 1.
Today: add one strong TWM proof line if the client has one.

### 12.3 Twenty West Media · Food and beverage reusable video · never reuse these facts
EB 609: **8.74/1k**. Variant C 14.34/1k vs variant A 5.64/1k (p = 0.046). Step 2 **8.17/1k** (the best follow-up in the data). Step 3 6.93/1k. [data: P3, scripts]
Subject: `{HEROPRODUCT} question`
Variant C:
```
I had an idea for showing ur {HEROPRODUCT} in a {CONSUMERUSEOCCASION} moment.

We could turn usable product photos and clips you already have into a series of social posts, each showing a different reason or occasion to reach for it.

Would you guys find that useful?
```
Loser A: "We could handle turning product ideas like that into social posts, so your team isn't planning, writing and putting together every post themselves."
Step 2:
```
Just a bit more on what I mean: The idea is to show where {HEROPRODUCT} fits into someone's day, like that {CONSUMERUSEOCCASION} moment, and turn it into content your team doesn't have to plan and make themselves.

We could put together three post angles for {HEROPRODUCT}, with a hook, visual idea and caption direction for each, using what we've learned doing social content for 40+ food brands.

Want me to send a quick video showing how that would work?
```
Step 3:
```
I wasn't sure if I should reach out to you or {COLLEAGUE}.

Showing {HEROPRODUCT} in a {CONSUMERUSEOCCASION} moment was just a quick idea that came to mind. The plan would give your team a few clear directions to work with, and we could take care of producing the posts if you'd rather take that off their plate too.

Would it be okay if I sent more info to you, or would {COLLEAGUE} be better?
```
Why: "what you already have" beat "we do the work" twice. Step 2 made the free thing concrete and added experience proof. Step 3 routed.
Today: "40+ food brands" must be in TWM's approved facts.

### 12.4 Shop Innovator · Home and garden video walkthrough · never reuse these facts
EB 465 step 1: variant A **6.96/1k** (2,586 sent) vs variant B 1.93/1k (p = 0.0065). [data: P2, scripts]
Subject: `product question`
```
I made a short video walking through product pages like {COMPANY}'s, looking at where a $1,000 to $8,000 buyer starts to hesitate before they commit to buying.

It's specific to how high-consideration home and garden goods buyers shop and make their decision. Want me to send it over?
```
Loser B opened "Do you know what's actually stopping your ecommerce store from converting more of the visitors you're already getting?", re-explained the problem and claimed "We've helped 500 home and garden brands ... to $100K/mo".
Steps 2-3 (about 1.07/1k each) ended "if helpful" with no question.
Why: the thing was made and named precisely (their price band, their buyer). 40 words. Permission CTA.
Today: the follow-ups end without a question and add little: write real steps 2-3. The embedded-video version (EB 466) did 1.27 vs 2.20/1k: no embeds.

### 12.5 Shop Innovator · $1K+ products · never reuse these facts
EB 422: 15,084 sent, **7.96/1k** (4.8x average), 6 meetings. [data: top-bottom #9]
Subject: `{product type} question`
```
Noticed {COMPANY} sells {product type} online.

One thing we see with $1K+ products is most stores treat them like normal ecommerce, but buyers usually need much more reassurance before committing.

Trust signals, buying guidance and conversion flow tend to matter a lot more.

Are first-time visitors converting well for you?
```
Step 3: "I had a few ideas for how {COMPANY} could reduce hesitation on the {product type} pages." + "Want me to?"
Why: a true segment observation, an insight only a specialist states (knowledge as proof), an honest question. High volume, so the rate is solid.
Today: add the offer and a client proof line.

### 12.6 Scroll Stop (Global Media Group) · April 2026 "I've got creators" · never reuse these facts
EB 428 Beauty: 21,914 sent, **7.35/1k**. The wave (with Apps 4.60, Sports 3.82): 48,829 sent, 5.67/1k, about 9x their 2025 copy (0.65/1k). [data: U1, scripts]
Subject: `{our creators|influencers|creators}`
```
Hi {FIRST_NAME}, I've got a few creators in the beauty space who've been part of campaigns driving 1M+ views, would love to see if they're a good fit to promote {COMPANY}.

Worth a chat?
```
Step 2:
```
Asked because we've run creator campaigns for Glaze Hair that generated 33,000+ clicks.

Want me to send over 2 creators we'd look at first for {COMPANY}?
```
Step 3:
```
Not sure if this should go to you or someone else.

I reached out a few days ago because we run influencer campaigns with access to 250k+ creators, and usually build them around guaranteed results rather than just paying for posts.

Is this you, or should I reach someone else?
```
Why: a concrete thing they want, proof baked into the offer, short, topic-word subject. "Asked because" brings in a named result and a tiny ask.
Today: use step 2's ask in Email 1 ("Want me to send over 2 creators...?"), since "Worth a chat?" is archive-generic. Cut "would love to". Glaze Hair's figure and "guaranteed results" were archived as unverified: confirm or cut [SOP 118].

### 12.7 Slogan Social · Exclusive talent roster · never reuse these facts
EB 133: 3,817 sent, **20.96/1k** (12.6x average), 12 meetings. Same email to CMOs (EB 177): 3.67/1k. [data: top-bottom #1, U5]
```
Hey {FIRST_NAME},

I noticed {COMPANY} works with influencer talent to highlight the best of {PERSONAL}

We've worked with brands like DoorDash, Meta, and Amazon Prime Video to run influencer campaigns with exclusive talent in the lifestyle, beauty, food, and fashion spaces. Would it be helpful if I sent over some influencers from our exclusive talent roster?
```
Why: references what they already do, recognisable-name proof, an exclusive thing, a permission CTA. The list mattered as much as the copy.
Today: subject "influencers" (theirs had a "?"). It was a 2-step sequence: write a real step 3.

### 12.8 MJJ Brilliant · Wholesale repair overflow · never reuse these facts
EB 603: 4,186 sent, **5.26/1k** (3.2x average). Variant B 9.89/1k, A 7.25/1k. Step 2 4.39/1k, step 3 4.33/1k: the follow-ups kept almost the whole rate. [scripts: MJJ]
Subject: `repair capacity`
Variant B:
```
Hey {FIRST_NAME},

Are repairs taking time away from your jeweler's custom work?

As your wholesale repair partner, we can handle those jobs at wholesale pricing with a turnaround time of 10 business days on agreed jobs, so your bench can focus on the work you want to keep in-house.

MJJ Brilliant has been a family-owned and operated jewelry manufacturer since 1982.

You keep your bench focused. We'll handle the overflow.
```
Variant A opens "Have a repair job your usual bench can't take on?" (a second real pain).
Step 2:
```
Hey {FIRST_NAME},

You wouldn't need to move all your repair work.

Keep the jobs you want in-house and use us as your wholesale repair partner for the categories that take up more of your bench's time.

Which types of repairs would you most like to take off your bench?
```
Step 3:
```
Hey {FIRST_NAME},

If a repair comes in that your usual bench can't take on, you can ask us before turning it away.

We'll confirm whether we can handle it along with the cost and turnaround, before you ship anything.
```
Why: the buyer's word ("bench"), an obvious pain, a direct offer with concrete terms, a credibility line, two angles that are two pains. Step 2 removes the objection, then asks a pick question.
Today: statement close is the client's choice (question 9). Step 3 needs an ask ("Send over one job your bench couldn't take on.").

### 12.9 Lead Flo Marketing · Free leads for local services (inactive client, evidence only) · never reuse these facts
EB 514 step 1: variant A **16.76/1k** vs pay-per-lead variant 1.80/1k (9 variants, p = 0.009). [data: P3, scripts]
Subject: `{SERVICE} question`
```
Saw you guys provide {SERVICE} in {CITY}.

Could I send you 5 leads from people already looking for those services?

Yes, it's free because we've already done this for 12 companies in your space and want to show you what it can do.

Interested?
```
Why: a free result, not a free audit. The offer is the CTA. It pre-answers "why free?".
Today: "12 companies" was cut as unsupported [SOP 118 #2]. "Interested?" alone is generic. Its step 2 asked for a phone number (a hard ask). Lead Flo is inactive since 2026-11-25. [RULES 2026-11-25]

### 12.10 Dulcy · Other marketing agencies (clean 2026 format) · never reuse these facts
EB 627: variant A **1.75/1k**, B 1.35/1k. About average: a format model, not a top performer. [SOP 118] [data: All tests]
Subject today: `prospects for {COMPANY}`
```
Hey {FIRST_NAME},

Could I build you a free list of 1,000 potential clients based on your ICP?

Names, emails, companies, LinkedIn profiles: the details you need for outbound.

Can I put that together?
```
Step 2:
```
Hey {FIRST_NAME},

We build lists and run outbound campaigns for agencies. Our broader outbound work helped Digital Force add $25,000 in monthly recurring revenue in 21 days.

For your free list, we'd agree on the companies and buyer roles you want to reach.

Mind if I send the targeting details we'd need?
```
Step 3:
```
Hey {FIRST_NAME},

The 1,000 contacts are a sample of Dulcy's list-building work. We also run outbound campaigns for agencies, if that becomes useful later.

Would a list for your next client push be useful?
```
Why here: one free thing, exact contents, one-word CTA, proof scoped right. Why not higher: the free list is saturated [SOT §1.11] [creator-learnings] and Email 1 has no proof line (now required). Step 2's "we'd agree on the companies" is a delivery step: cut it today.

### 12.11 Twenty West Media · Local contractors two-minute video · never reuse these facts
EB 601 step 1 A: 14,842 sent, **3.77/1k** (the largest single variant in the data). [scripts: TWM]
```
{FIRST_NAME}, noticed you're a {CONTRACTOR} in {CITY}.

How are you making sure homeowners don't treat you like just another {CONTRACTOR} when they're getting a few quotes?

I made a quick 2-minute video breaking down why some contractors become the obvious choice while others get compared against every other estimate.

Mind if I send it over?
```
Why: a sub-segment variable that reads naturally ({CONTRACTOR} = roofer), a pain every contractor knows, a real asset, a permission CTA.
Today: its subject "quick question" is generic (0.21/1k elsewhere): use "{COMPANY} estimates". The video must exist.

### 12.12 Human Marketing · Profit Compass (the offer rule, and model follow-ups) · never reuse these facts
Human overall 1.08/1k (low). Here for Alex's offer ruling and for steps 2-3. [SOP 119] [RULES 2026-11-25]
Email 1 opened "How are you making sure the growth you're seeing is actually profitable growth?", explained that ROAS can look great while profit falls, named Profit Compass, then claimed "I ran {COMPANY} through it for free." That was false (it needs access first). Allowed today: "I can run {COMPANY} through Profit Compass for free. Want me to?"
Step 2:
```
{FIRST_NAME} -
For context, Softies came to Human Marketing with a product people already loved, but their site, acquisition, and lifecycle marketing weren't working together.
Human Marketing rebuilt the system around profitable growth and helped increase revenue 88% and AOV 22%.
Different situation at {COMPANY}, obviously, but that's the kind of problem we're looking for here.
Worth sending over what I put together?
```
Step 3:
```
{FIRST_NAME} -
Wasn't sure if this should go to you or somebody else at {COMPANY}.
Regardless, if the goal is to grow ecommerce revenue without finding out later that the extra sales weren't actually profitable, that's exactly what Human Marketing helps with.
Are you the right person for that, or should I speak to somebody else?
```
Why: a model case-study step 2 (named client, two numbers, an honest "different situation" bridge) and a model routing step 3.
Today: open Email 1 with an observation, not a question. "what I put together" must be real.

---

## 13. Bad examples (and why)

**13.1 TargetonStar · free reactivation campaign for your SEO clients** · 12,783 sent, 0 interested (web-design version 12,037 sent, 0). [data: top-bottom #367]
```
When an SEO client wants more leads, do you usually keep pushing for more traffic or go back after the leads and customers they already paid to acquire?

I can run a reactivation campaign for you guys for free, just so you can see how it works.

Can I send over what that campaign would look like?
```
Why: the free thing is for someone else's business (their clients). Long abstract opening question. Commodity service. Step 3 said "In case this sounds crazy or too good to be true lol".

**13.2 Scroll Stop · "Post Q4 reset"** · 10,446 sent, 0. Subject "Why top apps reset in February". [data: P8]
```
February is when the smartest app teams reset performance before the scale season.

After Q4, most teams are dealing with bloated CPIs, fatigued audiences, and paid media strategies that need a rethink.

We help app publishers drive installs using our creative-plus-performance ReactorEngine that runs alongside paid media, often cutting CPI significantly while improving retention quality.

If you're looking closely at revenue per user this month, a quick conversation could be useful.
```
Why: a season instead of an offer, ad-copy opener, a named "engine" nobody knows, "significantly", no question, a call ask, a 6-word subject.

**13.3 Retail Media Group · financial planners "Q4 squeeze"** · 7,695 sent, 0. RMG overall 0.15/1k. [data: top-bottom #364]
```
A lot of planners/lenders are feeling the Q4 squeeze, rising acquisition costs, unclear attribution, and audiences built on broad "interest" guesses.

RMG solves that by targeting based on real-world behaviour, not platform assumptions, so spend goes toward genuinely in-market users.

If you want a quick 1-min breakdown of how this dropped CPA ~85% in a recent campaign, I can send it.
```
Why: talks about an amorphous third party [SOT §1.3], abstract product, a big number with no named customer, no question.

**13.4 Scroll Stop · guarantee P.S. and phrase-swap re-runs** · runs 3 and 4: 5,974 and 5,834 sent, 0 each. The family went 0.55 → 0.48 → 0 → 0/1k. [data: P7]
```
I noticed {COMPANY} works with creators to show the best of {PERSONAL}.

Many sports brands we work with have been using influencer storytelling not just for awareness, but to drive stronger loyalty and keep fans engaged well beyond game day.

Is it worth sending over some ideas for {COMPANY}?

P.S. We always offer a guarantee around ROI and traffic outcomes to our clients. Just ask!
```
Why: the "not just ... but" shape, generic "many brands we work with", a guarantee P.S., a pitch subject ("Use influencer marketing for {COMPANY}"), re-sent until zero, and the "A/B" was a phrase swap.

**13.5 LuckyDiem · "My colleague Andrew came across {COMPANY}"** · 5,176 sent, 0. [data: top-bottom #360]
```
My colleague Andrew came across {COMPANY} on LinkedIn and thought it'd be worth reaching out.

Establishments we work with are adding 100+ new customers/month using card-linked offers presented to over 200M cardholders, without touching paid social. (no media spend, no new tech)

No contracts, no tech. Just CPA-based revenue from verified cardholders.

Is this worth exploring for {COMPANY}?
```
Why: a referral-style opener, feature dump, unnamed big numbers, generic interest CTA, abstract product. Its 5-step sister campaign got 0 on every step (5,824 sent): more steps don't rescue a bad offer.

**13.6 Twenty West Media before Dulcy · scarcity, bait and switch, guilt** · Free Marketing Strategy 61,717 leads, 0.5% replies, 5 positive. Free audit 80,896 leads, 0.4%, 13 positive. [DND E5, G1]
"We only put together a handful of custom strategy outlines each week - didn't want to build one unnecessarily." / "Yours is ready on our end, just haven't sent it yet." / "I haven't heard back, so I'll pause outreach for now."
Why: fake scarcity, "a feeling of lying is not a very good first impression. Even if it was true", a guilt breakup, and offers nobody wants. [DND B3, B4, A6]

**13.7 Client-written bump and breakup (MJJ, 2026)** · never reuse these facts [DND G5, G6]
"Hi [First Name] - just bumping this in case repair overflow is becoming a challenge." / Subject "Should I close the loop on this?" + "I've reached out a few times ... I'll leave it here for now."
Why: a bump that adds nothing and a "last email" breakup. Compare MJJ's Dulcy-written follow-ups in 12.8 (4.39 and 4.33/1k).

**13.8 Old Dulcy lines · unverified average and an invented excuse** [data: top-bottom #11]
"I run a company called Dulcy and help B2B agencies average around 20 new sales opportunities a month with omnichannel outreach" / step 2: "I dropped my phone in the pool while sending my last email… wasn't sure if you got it."
Why: the "20" average is not verified [clients/dulcy.md], "omnichannel" claims channels that don't work now [CLAUDE.md], and the pool story is an invented bump. Never invent a story.

---

## 14. Open questions for Alex

Real conflicts only, deduplicated across all sources. Each has the default Scribe uses until Alex answers. When he answers, log it in `rules/RULES.md` and `rules/decisions-log.md`, then update this section.

1. **Word cap for Email 1.** Alex's docs say <50 (2025-03 playbook, SOP 011), 50-75 and "under 75" (2025-12, TWM audit 2026-04), 30-75 (2-hour SOP), <70 / 25-69 (enterprise prompt), 25-30 for Outlook lists (SOP 130). Data: ≤75 words 2.08 vs 1.30/1k [U3], but flat across bands in 2026. [DND A2] [2h §1.2]
   **Default:** 30-75 hard (engine), aim 40-60, 30-45 on Outlook-heavy lists.

2. **Reading level.** 6th grade (Triple Tap), 4th grade (3 Simple Rules), below 3rd grade (Template Library). [2h §1.8] [DND A2]
   **Default:** as simple as clarity allows, about 5th grade or lower, buyer's trade words kept.

3. **Subject format.** The engine needs 1-3 words, no punctuation. Winners and Alex's own bank break it: `{RESTAURANT} - yes or no?` (Lead Flo, 4.37 vs 1.14/1k), Slogan's `Looking for influencers?` (20.96/1k), the Oct 8 review's 2-5 word subjects, "{FIRST_NAME}?", "re: [your service]". [Engine] [data: P5] [DND D11]
   **Default:** the engine rule, with the topic word in their language. Never "re:" on Email 1.

4. **Step 4, and step 3's job.** Alex: 4 steps only "if your TAM is small (think under ~10,000 prospects)"; the 2-hour SOP covers steps 1-3 only; SOP 011 "never more than 3/4". Step 4+ data is tiny (12,058 sent). Step 3: 2h SOP says add proof/examples, Alex's follow-up doc and the data say right-person / low friction. [DND A5] [2h C18] [data: P1]
   **Default:** 3 steps. Step 4 only if the plan says TAM under ~10,000 and this client's step 3 converts at or above step 2. Step 3 = lowest-friction ask with one new small reason.

5. **Proof when the client has no approved result.** RULES needs 1 strong proof per email. MJJ, Collabor and some TWM segments have no quantified case study. The best 2026 winners used knowledge as proof only (TWM 16.70 and 24.13/1k). [RULES 2026-11-25] [SOP 118] [data: weak evidence]
   **Default:** a verified observation showing real knowledge of their business, a real mechanism line, or a strong client fact ("since 1982") counts. Flag it in questions_for_alex every time.

6. **Proof in a P.S.** RULES confirms Marketing Cartel's Email 1 P.S. result lines (ITI "doubled enrollments", hair 15 to 24, rehab 31 to 46). The 2-hour SOP's Base 2 puts the case study in a P.S. But Scribe writes no P.S., and the builder adds the proven "pound sand" P.S. only when none exists. [RULES 2026-11-25, 2026-11-20] [2h §2.5]
   **Default:** proof in the body, no P.S. For Marketing Cartel the confirmed lines become a body sentence unless Alex says keep the P.S. (it would replace "pound sand").

7. **Local lunch / in-person offers.** Three of the top 12 used "lunch, my treat": Lead Flo real estate 14.95/1k, Clear River 10.97/1k (small), Dulcy Florida 7.62/1k. It is a meeting ask, and the code check does not catch "lunch". [data: top-bottom #3, #4, #11] [RULES 2026-11-25]
   **Default:** none, unless the approved plan says it is the only logical next step for a local campaign.

8. **Whitepaper headline tests vs 2 angles.** Alex's whitepaper notes: 10 headline variants x 250 leads. RULES: 2 angles, no word swaps. Data: whitepaper openers 1.26 vs 1.68/1k, Forever Card's 10-headline tests near zero. [DND A11, D6] [data: U7]
   **Default:** 2 headlines that are 2 different angles. Whitepaper only when the plan picks it.

9. **MJJ Brilliant: close, qualifiers, turnaround.** The client prefers statement closes ("You keep your bench focused. We'll handle the overflow.") and Alex suggested testing a question close; MJJ's live copy is the best current-client rate (5.26/1k). Qualifiers "on agreed jobs", "qualifying USMCA", "depending on the piece and order". Turnaround: 10 business days (Dulcy copy, client file) vs 7, 3-5 and 7-10 in client-written copy. [clients/mjj-brilliant.md] [DND I1, I2]
   **Default:** keep the statement close on MJJ top-ups; new MJJ angles end with a one-word question. Keep "qualifying" and "on agreed jobs" (truth), cut "depending on the piece and order". Use 10 business days.

10. **"Free" and money amounts.** Alex: "free" → "complimentary" got a lead the next email; "free", "guarantee", "money", "$" are listed spam triggers. But most winners say "free" and approved proof uses amounts. [SOT §1.4] [SOP 011, 130]
    **Default:** "free" or "at no cost" at most once per email, approved amounts as written; EmailGuard decides, swap to "complimentary" only when flagged.
